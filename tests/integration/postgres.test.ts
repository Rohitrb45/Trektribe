import { submitForumChange } from '../../apps/mobile/src/api/forum';
import { publishGpx, getPinnedRoute } from '../../apps/mobile/src/api/routes';
import { createApiClient, apiData, ApiError } from '../../apps/mobile/src/api/client';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { PostgresStore } from '../../apps/api/src/store';
import { decodeCursor } from '../../apps/api/src/feed';
import { RouteRepository } from '../../apps/api/src/routes';
import { MessageRepository } from '../../apps/api/src/messages';
import { BlockRepository } from '../../apps/api/src/blocks';
import { ForumRepository } from '../../apps/api/src/forums';
import { ForumManagement } from '../../apps/api/src/forum-management';
import { startRealtime } from '../../apps/api/src/realtime';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { createClient } from 'redis';
import { createSeed, DEMO_USER, DomainError } from '../../packages/core/src/index';

const exec = promisify(execFile);

test('PostGIS migration, persistence, pagination, and final-slot concurrency', { timeout: 120_000 }, async t => {
  // Never migrate or clear a supplied database. Create and drop our own isolated database.
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a disposable PostgreSQL server with CREATEDB permission.');
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const name = `trektribe_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  let store: PostgresStore | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const migrate = () => exec(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], {
      env: { ...process.env, DATABASE_URL: url.toString(), DEMO_MODE: 'true', NODE_ENV: 'test' }, timeout: 30_000,
    });
    await migrate();
    store = new PostgresStore(url.toString());
    const db = store;
    const seed = createSeed();

    await t.test('migration and seeding are repeatable without overwriting user data', async () => {
      await db.pool.query('UPDATE users SET name=$1 WHERE id=$2', ['Preserved name', DEMO_USER]);
      await migrate();
      assert.equal((await db.pool.query('SELECT name FROM users WHERE id=$1', [DEMO_USER])).rows[0].name, 'Preserved name');
      assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 11);
      const state = await db.read();
      assert.equal(state.treks.length, seed.treks.length);
      assert.deepEqual(state.treks[0].coordinates, seed.treks[0].coordinates);
      assert.deepEqual(state.treks[0].route, seed.treks[0].route);
    });

    await t.test('blocking is bilateral, preserves existing plans and prevents invitation retries', async () => {
      const a=await db.identify({issuer:'https://block.example',subject:'a'});
      const b=await db.identify({issuer:'https://block.example',subject:'b'});
      const blocks=new BlockRepository(db.pool),messages=new MessageRepository(db.pool);
      const tripId=randomUUID(),postId=randomUUID();
      await db.execute({type:'post',id:postId,trekId:seed.treks[0].id,content:'Blocking test report',rating:4,condition:'Clear',observedAt:new Date().toISOString().slice(0,10)},a);
      await db.execute({type:'comment',id:randomUUID(),postId,body:'Visible before blocking'},b);
      await db.execute({type:'create-trip',id:tripId,trekId:seed.treks[0].id,title:'Shared plan',startsAt:new Date(Date.now()+86400000).toISOString(),timezone:'Asia/Kolkata',maxParticipants:4},a);
      const invite=await db.invite(tripId,a);
      await db.acceptInvite(invite.token,b);
      await db.execute({type:'approve',tripId,userId:b},a);
      await messages.send(tripId,a,randomUUID(),'Host message');
      await messages.send(tripId,b,randomUUID(),'Guest message');
      await blocks.set(a,b,true);
      assert.deepEqual((await blocks.list(a)).items.map(p=>p.id),[b]);
      assert.equal((await blocks.list(b)).items.length,0);
      assert.ok(!(await db.read(b)).posts.some(p=>p.id===postId));
      assert.ok(!(await db.feed(100,undefined,b)).items.some(p=>p.id===postId));
      assert.ok(!(await db.read(a)).comments.some(c=>c.userId===b));
      assert.ok((await db.read(b)).trips.some(t=>t.id===tripId));
      assert.deepEqual((await messages.list(tripId,a)).items.map(m=>m.body),['Host message']);
      assert.deepEqual((await messages.list(tripId,b)).items.map(m=>m.body),['Guest message']);
      const denied=(e:unknown)=>e instanceof DomainError&&e.status===403;
      await assert.rejects(db.acceptInvite(invite.token,b),denied);
      await assert.rejects(db.execute({type:'like',postId,liked:true},b),denied);
      await assert.rejects(db.execute({type:'comment',id:randomUUID(),postId,body:'Blocked'},b),denied);
      await assert.rejects(db.execute({type:'approve',tripId,userId:b},a),denied);
      await db.execute({type:'leave',tripId},b);
      assert.ok(!(await db.read(b)).trips.some(t=>t.id===tripId));
      await assert.rejects(new RouteRepository(db.pool).forTrip(tripId,b));
      await assert.rejects(db.execute({type:'join',tripId},b),denied);
      await blocks.set(b,a,true);await blocks.set(a,b,false);
      await assert.rejects(db.execute({type:'like',postId,liked:true},b),denied);
      await blocks.set(b,a,false);
      assert.ok((await db.read(b)).posts.some(p=>p.id===postId));
      await db.execute({type:'like',postId,liked:true},b);
      await assert.rejects(blocks.set(a,a,true));
      await assert.rejects(blocks.set(a,randomUUID(),true));
    });

    await t.test('ratings derive from persisted reports across retries, concurrency and blocks', async () => {
      const trekId=seed.treks[3].id;
      assert.equal((await db.read()).treks.find(t=>t.id===trekId)!.reports,0);
      const other=await db.identify({issuer:'https://ratings.example',subject:'reviewer'});
      const post={type:'post' as const,id:randomUUID(),trekId,content:'Rating report',rating:5,condition:'Clear',observedAt:'2020-01-01'};
      const competitor=new PostgresStore(url.toString());
      try{
        await Promise.all([db.execute(post),competitor.execute(post)]);
        await Promise.all([db.execute({...post,id:randomUUID(),rating:4},other),competitor.execute({...post,id:randomUUID(),rating:4})]);
        await assert.rejects(db.execute({...post,rating:1}));
        let trail=(await competitor.read()).treks.find(t=>t.id===trekId)!;
        assert.equal(trail.reports,3);assert.equal(trail.rating,4.3);
        const blocks=new BlockRepository(db.pool);
        await blocks.set(DEMO_USER,other,true);
        trail=(await db.read()).treks.find(t=>t.id===trekId)!;
        assert.equal(trail.reports,3);assert.equal(trail.rating,4.3);
        await blocks.set(DEMO_USER,other,false);
        // The view follows database removals too; no cached counter can drift.
        await db.pool.query('DELETE FROM posts WHERE trek_id=$1',[trekId]);
        trail=(await db.read()).treks.find(t=>t.id===trekId)!;
        assert.equal(trail.reports,0);assert.equal(trail.rating,0);
      }finally{await competitor.close();}
    });

    await t.test('cohost roles persist, respect blocks and serialize revocation with approval', async () => {
      const helper=await db.identify({issuer:'https://cohost.example',subject:'helper'});
      const guest=await db.identify({issuer:'https://cohost.example',subject:'guest'});
      const tripId=randomUUID();
      await db.execute({type:'create-trip',id:tripId,trekId:seed.treks[0].id,title:'Delegated outing',startsAt:'2099-01-01T00:00:00Z',timezone:'Asia/Kolkata',maxParticipants:3});
      await db.execute({type:'join',tripId},helper);
      const role={type:'cohost' as const,tripId,userId:helper,enabled:true};
      await assert.rejects(db.execute(role));
      await db.execute({type:'approve',tripId,userId:helper});
      await db.execute(role);
      await db.execute({type:'join',tripId},guest);
      const competitor=new PostgresStore(url.toString());
      try{
        assert.equal((await competitor.read(helper)).trips.find(t=>t.id===tripId)!.members.find(m=>m.userId===helper)!.role,'cohost');
        await assert.rejects(competitor.execute({...role,userId:guest},helper));
        await assert.rejects(competitor.execute({type:'cancel-trip',tripId},helper));
        await assert.rejects(competitor.invite(tripId,helper));
        const blocks=new BlockRepository(db.pool);
        await blocks.set(DEMO_USER,guest,true);
        await assert.rejects(competitor.execute({type:'approve',tripId,userId:guest},helper));
        await blocks.set(DEMO_USER,guest,false);
        // Hold a role revocation uncommitted: approval must wait for the parent lock,
        // then re-read permission rather than relying on a previously loaded role.
        const c=await db.pool.connect();
        let approval:Promise<unknown>|undefined;
        try{
          await c.query('BEGIN');await c.query('SELECT id FROM group_treks WHERE id=$1 FOR UPDATE',[tripId]);
          await c.query("UPDATE group_trek_members SET role='member' WHERE trip_id=$1 AND user_id=$2",[tripId,helper]);
          approval=assert.rejects(competitor.execute({type:'approve',tripId,userId:guest},helper));
          await c.query('COMMIT');await approval;
        }finally{await c.query('ROLLBACK');c.release();}
        await db.execute(role);
        await competitor.execute({type:'approve',tripId,userId:guest},helper);
        await competitor.execute({type:'leave',tripId},helper);
        await competitor.execute({type:'join',tripId},helper);
        const member=(await db.read()).trips.find(t=>t.id===tripId)!.members.find(m=>m.userId===helper)!;
        assert.equal(member.role,'member');assert.equal(member.status,'pending');
      }finally{await competitor.close();}
    });

    await t.test('forums persist, page visible content, enforce ownership and survive duplicate retries', async () => {
      const a=await db.identify({issuer:'https://forum.example',subject:'a'}),b=await db.identify({issuer:'https://forum.example',subject:'b'});
      const forums=new ForumRepository(db.pool),blocks=new BlockRepository(db.pool);
      const thread={id:randomUUID(),title:'Trail advice',body:'What should we pack?'};
      await Promise.all([forums.create(a,thread),forums.create(a,thread)]);
      await assert.rejects(forums.create(b,thread));
      await assert.rejects(forums.create(a,{...thread,body:'Changed'}));
      const second={id:randomUUID(),title:'Other thread',body:'Another discussion'};
      await forums.create(b,second);
      const firstPage=await forums.list(a,0,1);
      assert.equal(firstPage.items[0].id,second.id);
      assert.equal((await forums.list(a,firstPage.nextCursor!,1)).items[0].id,thread.id);
      const reply={id:randomUUID(),body:'Bring water'};
      await Promise.all([forums.reply(thread.id,b,reply),forums.reply(thread.id,b,reply)]);
      await forums.reply(thread.id,a,{id:randomUUID(),body:'Thanks'});
      await assert.rejects(forums.reply(second.id,b,reply));
      const page=await forums.read(thread.id,a,0,1);
      assert.equal(page.items[0].body,'Bring water');
      assert.equal((await forums.read(thread.id,a,page.nextCursor!,1)).items[0].body,'Thanks');
      await assert.rejects(forums.close(thread.id,b,true));
      await forums.close(thread.id,a,true);
      await forums.reply(thread.id,b,reply); // An acknowledged retry remains valid after closing.
      await assert.rejects(forums.reply(thread.id,b,{id:randomUUID(),body:'Late'}));
      await forums.close(thread.id,a,false);
      await blocks.set(a,b,true);
      assert.equal((await forums.list(a,0,1)).items[0].id,thread.id);
      await assert.rejects(forums.read(thread.id,b));
      await assert.rejects(forums.reply(thread.id,b,reply));
      assert.deepEqual((await forums.read(thread.id,a,0,1)).items.map(r=>r.body),['Thanks']);
      await blocks.set(a,b,false);
      const reconnected=new PostgresStore(url.toString());
      try{assert.equal((await new ForumRepository(reconnected.pool).read(thread.id,b)).items.length,2);}
      finally{await reconnected.close();}
    });

    await t.test('forum edits, deletions and moderation enforce ownership and retain audit evidence', async () => {
      const author=await db.identify({issuer:'https://manage.example',subject:'author'});
      const reader=await db.identify({issuer:'https://manage.example',subject:'reader'});
      const moderator=await db.identify({issuer:'https://manage.example',subject:'moderator'});
      const forum=new ForumRepository(db.pool),management=new ForumManagement(db.pool);
      const thread={id:randomUUID(),title:'Original title',body:'Original body'};
      await forum.create(author,thread);
      await assert.rejects(management.change('threads',thread.id,reader,{revision:1,title:'Hijack',body:'Hijack'}));
      const results=await Promise.allSettled([management.change('threads',thread.id,author,{revision:1,title:'Edited',body:'First edit'}),management.change('threads',thread.id,author,{revision:1,title:'Edited',body:'Other edit'})]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal((await forum.read(thread.id,reader)).thread.revision,2);
      const reply={id:randomUUID(),body:'Reply content'};await forum.reply(thread.id,reader,reply);
      await assert.rejects(management.change('replies',reply.id,author,{revision:1},true));
      await management.change('replies',reply.id,reader,{revision:1,body:'Edited reply'});
      await assert.rejects(management.change('replies',reply.id,reader,{revision:1},true));
      await management.change('replies',reply.id,reader,{revision:2},true);
      await management.change('replies',reply.id,reader,{revision:2},true);
      assert.equal((await forum.read(thread.id,author)).items.length,0);
      await assert.rejects(forum.reply(thread.id,reader,reply));
      await Promise.all([management.report('threads',thread.id,reader,{reason:'Review this'}),management.report('threads',thread.id,reader,{reason:'Review this'})]);
      await assert.rejects(management.queue(reader));
      await db.pool.query('INSERT INTO forum_moderators(user_id) VALUES($1)',[moderator]);
      assert.equal(await management.isModerator(moderator),true);
      const reports=await management.queue(moderator);
      assert.equal(reports.items.length,1);
      const reportId=reports.items[0].id,reportedBody=reports.items[0].reportedBody;
      await management.change('threads',thread.id,author,{revision:2,title:'Changed after report',body:'New content'});
      assert.equal((await management.queue(moderator)).items[0].reportedBody,reportedBody);
      const decision={action:'remove',reason:'Violates community rules'};
      await assert.rejects(management.decide(reportId,reader,decision));
      await management.decide(reportId,moderator,decision);await management.decide(reportId,moderator,decision);
      await assert.rejects(management.decide(reportId,moderator,{...decision,action:'dismiss'}));
      assert.equal((await management.queue(moderator)).items.length,0);
      assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM forum_moderation_actions WHERE report_id=$1',[reportId])).rows[0].n,1);
      await assert.rejects(forum.read(thread.id,author));
      await assert.rejects(forum.close(thread.id,author,false));
      await assert.rejects(management.change('threads',thread.id,author,{revision:4,title:'Restore',body:'Restore'}));
      await assert.rejects(forum.create(author,thread));
      const another={id:randomUUID(),title:'Reply review',body:'Keep this discussion'};await forum.create(author,another);
      const flagged={id:randomUUID(),body:'Flagged reply'};await forum.reply(another.id,reader,flagged);
      await management.report('replies',flagged.id,author,{reason:'Please review'});
      const dismissed=(await management.queue(moderator)).items[0].id;
      await management.decide(dismissed,moderator,{action:'dismiss',reason:'No violation'});
      assert.equal((await forum.read(another.id,author)).items.length,1);
      await management.report('replies',flagged.id,author,{reason:'Additional concern'});
      const reopened=(await management.queue(moderator)).items[0];
      assert.notEqual(reopened.id,dismissed);assert.equal(reopened.reportedBody,flagged.body);
      await management.decide(reopened.id,moderator,{action:'remove',reason:'Confirmed violation'});
      assert.equal((await forum.read(another.id,author)).items.length,0);
      await db.pool.query('DELETE FROM forum_moderators WHERE user_id=$1',[moderator]);
      await assert.rejects(management.queue(moderator));
      const own={id:randomUUID(),title:'Delete me',body:'Own content'};await forum.create(author,own);
      await management.change('threads',own.id,author,{revision:1},true);
      assert.ok(!(await forum.list(author)).items.some(t=>t.id===own.id));
      await assert.rejects(forum.reply(own.id,reader,{id:randomUUID(),body:'Hidden'}));
    });

    await t.test('verified identities are isolated and concurrent first login is idempotent', async () => {
      const identity = { issuer: 'https://identity.example', subject: 'account-a' };
      const [a, duplicate] = await Promise.all([db.identify(identity), db.identify(identity)]);
      assert.equal(a, duplicate);
      const b = await db.identify({ ...identity, subject: 'account-b' });
      const otherIssuer = await db.identify({ ...identity, issuer: 'https://other.example' });
      assert.notEqual(a, b); assert.notEqual(a, otherIssuer);
      await db.execute({type:'profile',name:'Account A',bio:'Hiker',level:'Beginner',gear:['Boots']},a);
      assert.equal((await db.read(a)).profile.name,'Account A');
      assert.equal((await db.read(b)).profile.name,'New hiker');
      const trip={type:'create-trip' as const,id:randomUUID(),trekId:seed.treks[0].id,title:'Account A outing',startsAt:new Date(Date.now()+86400000).toISOString(),timezone:'Asia/Kolkata',maxParticipants:3};
      await Promise.all([db.execute(trip,a),db.execute(trip,a)]);
      assert.equal((await db.read(a)).trips.filter(t=>t.id===trip.id).length,1);
      await assert.rejects(db.execute({type:'cancel-trip',tripId:trip.id},b),(e:unknown)=>e instanceof DomainError&&e.status===403);
      await db.execute({type:'cancel-trip',tripId:trip.id},a);
      assert.equal((await db.read(a)).trips.find(t=>t.id===trip.id)!.status,'closed');
      await db.execute({ type: 'save', trekId: seed.treks[0].id, saved: true }, a);
      assert.deepEqual((await db.read(b)).saved, {});
      const post = { type: 'post' as const, id: randomUUID(), trekId: seed.treks[0].id, content: 'Account A report', rating: 4, condition: 'Clear', observedAt: '2020-01-01' };
      const state = await db.execute(post, a);
      assert.equal(state.posts.find(p => p.id === post.id)!.userId, a);
      await assert.rejects(db.execute(post, b), (e: unknown) => e instanceof DomainError && e.code === 'CONFLICT');
      await db.execute({ ...post, id: randomUUID(), content: 'Account B report' }, b);
      const liked = await db.execute({ type: 'like', postId: post.id, liked: true }, b);
      assert.deepEqual(liked.posts.find(p => p.id === post.id)!.likedBy, [b]);
      await assert.rejects(db.execute({ type: 'approve', tripId: seed.trips[1].id, userId: a }, b), (e: unknown) => e instanceof DomainError && e.status === 403);
    });

    await t.test('PostGIS proximity and GiST indexes', async () => {
      const [lng, lat] = seed.treks[0].coordinates;
      const nearby = await db.nearby(lng, lat, 1000);
      assert.deepEqual(nearby.map(r => r.id), [seed.treks[0].id]);
      assert.equal(Number(nearby[0].distance_m), 0);
      const indexes = await db.pool.query("SELECT indexname FROM pg_indexes WHERE tablename='treks' AND indexdef LIKE '%USING gist%'");
      assert.equal(indexes.rowCount, 2);
    });

    await t.test('private outings are hidden; hashed invitations are single-use and expire', async () => {
      const owner=await db.identify({issuer:'https://identity.example',subject:'private-owner'});
      const guest=await db.identify({issuer:'https://identity.example',subject:'private-guest'});
      const outsider=await db.identify({issuer:'https://identity.example',subject:'outsider'});
      const trip={type:'create-trip' as const,id:randomUUID(),trekId:seed.treks[0].id,title:'Private walk',startsAt:new Date(Date.now()+86400000).toISOString(),timezone:'Asia/Kolkata',visibility:'private' as const,maxParticipants:4};
      await db.execute(trip,owner);
      assert.ok((await db.read(owner)).trips.some(t=>t.id===trip.id));
      assert.equal((await db.read(guest)).trips.some(t=>t.id===trip.id),false);
      await assert.rejects(db.execute({type:'join',tripId:trip.id},guest));
      await assert.rejects(db.invite(trip.id,outsider));
      const invitation=await db.invite(trip.id,owner);
      const row=(await db.pool.query('SELECT token_hash FROM trip_invitations WHERE trip_id=$1',[trip.id])).rows[0];
      assert.notEqual(row.token_hash,invitation.token);
      await db.acceptInvite(invitation.token,guest);
      await db.acceptInvite(invitation.token,guest);
      assert.ok((await db.read(guest)).trips.some(t=>t.id===trip.id));
      await assert.rejects(db.acceptInvite(invitation.token,outsider));
      const expired=await db.invite(trip.id,owner);
      await db.pool.query("UPDATE trip_invitations SET expires_at=now()-interval '1 second' WHERE redeemed_by IS NULL AND trip_id=$1",[trip.id]);
      await assert.rejects(db.acceptInvite(expired.token,outsider));
      assert.equal((await db.read(outsider)).trips.some(t=>t.id===trip.id),false);
    });

    await t.test('route changes preserve an outing’s immutable pinned geometry', async () => {
      const routes=new RouteRepository(db.pool);
      const xml='<gpx><rte><rtept lat="30" lon="79"/><rtept lat="30.01" lon="79.01"/></rte></gpx>';
      const metadata={title:'Imported trail',region:'Test region',description:'Imported route',difficulty:'Easy'};
      const imported=await routes.publish(DEMO_USER,xml,metadata);
      const id=randomUUID();
      await db.execute({type:'create-trip',id,trekId:imported.trekId,title:'Pinned outing',startsAt:new Date(Date.now()+86400000).toISOString(),timezone:'UTC',maxParticipants:4});
      const before=await routes.forTrip(id,DEMO_USER);
      const updated=await routes.publish(DEMO_USER,xml.replace('30.01','30.02'),metadata,imported.trekId);
      assert.notEqual(updated.routeVersionId,imported.routeVersionId);
      assert.deepEqual(await routes.forTrip(id,DEMO_USER),before);
      assert.equal((await db.read()).treks.find(t=>t.id===imported.trekId)!.routeVersionId,updated.routeVersionId);
      await assert.rejects(db.pool.query('UPDATE route_versions SET elevation_m=999 WHERE id=$1',[imported.routeVersionId]));
      const outsider=await db.identify({issuer:'https://identity.example',subject:'route-outsider'});
      await assert.rejects(routes.publish(outsider,xml,metadata,imported.trekId));
    });

    await t.test('chat acknowledgments persist, retries deduplicate, reconnect backfills, and removed members lose access', async () => {
      const guest=await db.identify({issuer:'https://identity.example',subject:'chat-guest'});
      const tripId=randomUUID();
      await db.execute({type:'create-trip',id:tripId,trekId:seed.treks[0].id,title:'Chat outing',startsAt:new Date(Date.now()+86400000).toISOString(),timezone:'UTC',maxParticipants:4});
      await db.execute({type:'join',tripId},guest);await db.execute({type:'approve',tripId,userId:guest});
      const http=createServer();
      const stop=await startRealtime(http,db.pool,async token=>{if(token!=='Bearer test-guest')throw new Error('Invalid token');return guest;},[]);
      http.listen(0,'127.0.0.1');await once(http,'listening');
      const port=(http.address() as {port:number}).port;
      const socket=io(`http://127.0.0.1:${port}`,{auth:{token:'test-guest'},autoConnect:false,reconnection:false});
      try{
        const connected=once(socket,'connect',{signal:AbortSignal.timeout(5000)});socket.connect();await connected;
        const invalid=io(`http://127.0.0.1:${port}`,{auth:{token:'invalid'},autoConnect:false,reconnection:false});
        try{const rejected=once(invalid,'connect_error',{signal:AbortSignal.timeout(5000)});invalid.connect();await rejected;assert.equal(invalid.connected,false);}finally{invalid.disconnect();}
        const id=randomUUID();
        const ack=await socket.timeout(5000).emitWithAck('trip:send',{tripId,id,body:'Meet at the trailhead'});
        assert.equal(ack.ok,true);assert.equal(ack.sequence,1);
        const repeat=await socket.timeout(5000).emitWithAck('trip:send',{tripId,id,body:'Meet at the trailhead'});
        assert.equal(repeat.sequence,1);
        const conflict=await socket.timeout(5000).emitWithAck('trip:send',{tripId,id,body:'Changed body'});
        assert.equal(conflict.ok,false);
        const spoofed=await socket.timeout(5000).emitWithAck('trip:send',{tripId,id:randomUUID(),body:'Spoof',userId:DEMO_USER});
        assert.equal(spoofed.ok,false);
        const repository=new MessageRepository(db.pool);
        assert.equal((await repository.list(tripId,guest)).items.length,1);
        socket.disconnect();
        await repository.send(tripId,DEMO_USER,randomUUID(),'Bring water');
        const reconnected=once(socket,'connect',{signal:AbortSignal.timeout(5000)});socket.connect();await reconnected;
        const backfill=await socket.timeout(5000).emitWithAck('trip:sync',{tripId,after:1});
        assert.equal(backfill.ok,true);assert.equal(backfill.items[0].body,'Bring water');assert.equal(backfill.items[0].sequence,2);
        await db.execute({type:'leave',tripId},guest);
        const denied=await socket.timeout(5000).emitWithAck('trip:sync',{tripId,after:0});
        assert.equal(denied.ok,false);assert.equal(denied.items,undefined);
        await assert.rejects(repository.send(tripId,guest,randomUUID(),'No access'));
        assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM trip_outbox WHERE trip_id=$1',[tripId])).rows[0].n,2);
      }finally{socket.disconnect();await stop();}
    });

    await t.test('two API instances fan out notifications and retry Redis publication failures', async () => {
      assert.ok(process.env.TEST_REDIS_URL,'Set TEST_REDIS_URL to a disposable Redis server with ACL administration enabled.');
      const adminRedis=createClient({url:process.env.TEST_REDIS_URL,socket:{reconnectStrategy:false}});
      adminRedis.on('error',()=>{});await adminRedis.connect();
      const username=`test_${randomUUID().replaceAll('-','')}`,password=randomUUID(),channel=`test:chat:${randomUUID()}`;
      const redisUrl=new URL(process.env.TEST_REDIS_URL);redisUrl.username=username;redisUrl.password=password;
      const guest=await db.identify({issuer:'https://fanout.example',subject:'guest'}),outsider=await db.identify({issuer:'https://fanout.example',subject:'outsider'});
      const tripId=randomUUID();
      await db.execute({type:'create-trip',id:tripId,trekId:seed.treks[0].id,title:'Distributed chat',startsAt:'2099-01-01T00:00:00Z',timezone:'UTC',maxParticipants:4});
      await db.execute({type:'join',tripId},guest);await db.execute({type:'approve',tripId,userId:guest});
      const poolB=new PostgresStore(url.toString()),httpA=createServer(),httpB=createServer();
      const clients:ReturnType<typeof io>[]=[];let stopA:(()=>Promise<void>)|undefined,stopB:(()=>Promise<void>)|undefined;
      const authenticate=async(token:string)=>{if(token==='Bearer host')return DEMO_USER;if(token==='Bearer guest')return guest;if(token==='Bearer outsider')return outsider;throw new Error('Invalid token');};
      async function connect(http:ReturnType<typeof createServer>,token:string){const client=io(`http://127.0.0.1:${(http.address() as {port:number}).port}`,{auth:{token},autoConnect:false,reconnection:false});clients.push(client);const ready=once(client,'connect',{signal:AbortSignal.timeout(5000)});client.connect();await ready;return client;}
      async function until(check:()=>Promise<boolean>){const end=Date.now()+12000;while(!await check()){assert.ok(Date.now()<end,'Timed out awaiting outbox state');await new Promise(r=>setTimeout(r,100));}}
      try{
        await adminRedis.sendCommand(['ACL','SETUSER',username,'reset','on',`>${password}`,'+@connection','+publish','+subscribe','+unsubscribe','+eval','+time','+zadd','+zrange','+zrem','+zremrangebyscore','+pexpire',`~${channel}:presence:*`,`&${channel}`]);
        const options={redisUrl:redisUrl.toString(),channel};
        stopA=await startRealtime(httpA,db.pool,authenticate,[],options);stopB=await startRealtime(httpB,poolB.pool,authenticate,[],options);
        await assert.rejects(startRealtime(createServer(),poolB.pool,authenticate,[])); // Cannot mix local and Redis dispatchers.
        httpA.listen(0,'127.0.0.1');httpB.listen(0,'127.0.0.1');await Promise.all([once(httpA,'listening'),once(httpB,'listening')]);
        const host=await connect(httpA,'host'),remote=await connect(httpB,'guest'),stranger=await connect(httpB,'outsider');
        const pulse=(client:ReturnType<typeof io>)=>client.timeout(5000).emitWithAck('trip:presence',{tripId});
        assert.equal((await pulse(stranger)).ok,false);
        assert.equal((await host.timeout(5000).emitWithAck('trip:presence',{tripId,userId:outsider})).ok,false);
        assert.equal((await pulse(remote)).ok,true);
        assert.deepEqual((await pulse(host)).online.map((p:{id:string})=>p.id).sort(),[DEMO_USER,guest].sort());
        const secondDevice=await connect(httpA,'guest');await pulse(secondDevice);secondDevice.disconnect();
        await until(async()=>(await adminRedis.zRange(`${channel}:presence:${tripId}`,0,-1)).length===2);
        assert.equal((await pulse(host)).online.filter((p:{id:string})=>p.id===guest).length,1);
        const blocks=new BlockRepository(db.pool);await blocks.set(DEMO_USER,guest,true);
        assert.deepEqual((await pulse(host)).online.map((p:{id:string})=>p.id),[DEMO_USER]);
        assert.deepEqual((await pulse(remote)).online.map((p:{id:string})=>p.id),[guest]);
        await blocks.set(DEMO_USER,guest,false);
        // Force an expired server timestamp to exercise Redis cleanup without a 30-second wait.
        const stale=(await adminRedis.zRange(`${channel}:presence:${tripId}`,0,-1)).filter(s=>s.startsWith(guest));
        for(const value of stale)await adminRedis.zAdd(`${channel}:presence:${tripId}`,{score:0,value});
        assert.deepEqual((await pulse(host)).online.map((p:{id:string})=>p.id),[DEMO_USER]);
        await pulse(remote);
        await adminRedis.sendCommand(['ACL','SETUSER',username,'-eval']);
        assert.equal((await pulse(host)).ok,false);
        await adminRedis.sendCommand(['ACL','SETUSER',username,'+eval']);
        assert.equal((await pulse(host)).ok,true);
        let remoteChanges=0,strangerChanges=0;
        remote.on('trip:changed',event=>{if(event.tripId===tripId)remoteChanges++;});stranger.on('trip:changed',event=>{if(event.tripId===tripId)strangerChanges++;});
        const firstId=randomUUID();assert.equal((await host.timeout(5000).emitWithAck('trip:send',{tripId,id:firstId,body:'Across servers'})).ok,true);
        await until(async()=>remoteChanges>0);
        assert.equal(strangerChanges,0);
        assert.equal((await remote.timeout(5000).emitWithAck('trip:sync',{tripId,after:0})).items[0].body,'Across servers');
        await until(async()=>!!(await db.pool.query('SELECT delivered_at FROM trip_outbox WHERE message_id=$1',[firstId])).rows[0].delivered_at);
        await adminRedis.sendCommand(['ACL','SETUSER',username,'-publish']);
        const secondId=randomUUID();const ack=await host.timeout(5000).emitWithAck('trip:send',{tripId,id:secondId,body:'Saved during Redis failure'});
        assert.equal(ack.ok,true);
        await new Promise(r=>setTimeout(r,2200));
        assert.equal((await db.pool.query('SELECT delivered_at FROM trip_outbox WHERE message_id=$1',[secondId])).rows[0].delivered_at,null);
        assert.equal((await remote.timeout(5000).emitWithAck('trip:sync',{tripId,after:1})).items[0].body,'Saved during Redis failure');
        const before=remoteChanges;await adminRedis.sendCommand(['ACL','SETUSER',username,'+publish']);
        await until(async()=>remoteChanges>before);
        await until(async()=>!!(await db.pool.query('SELECT delivered_at FROM trip_outbox WHERE message_id=$1',[secondId])).rows[0].delivered_at);
        await db.execute({type:'leave',tripId},guest);
        assert.equal((await pulse(remote)).ok,false);
        assert.deepEqual((await pulse(host)).online.map((p:{id:string})=>p.id),[DEMO_USER]);
        assert.equal((await remote.timeout(5000).emitWithAck('trip:sync',{tripId,after:0})).ok,false);
        await stopB();stopB=undefined;
        await host.timeout(5000).emitWithAck('trip:send',{tripId,id:randomUUID(),body:'Other server stopped'});
        assert.equal((await host.timeout(5000).emitWithAck('trip:sync',{tripId,after:2})).items[0].body,'Other server stopped');
      }finally{
        for(const client of clients)client.disconnect();await stopB?.();await stopA?.();await poolB.close();
        await adminRedis.del(`${channel}:presence:${tripId}`);await adminRedis.sendCommand(['ACL','DELUSER',username]);adminRedis.destroy();
      }
    });

    await t.test('concurrent duplicate writes persist once and invalid mutations roll back', async () => {
      const post = { type: 'post' as const, id: randomUUID(), trekId: seed.treks[0].id,
        content: 'Database report', rating: 5, condition: 'Clear', observedAt: '2020-01-01' };
      await Promise.all([db.execute(post), db.execute(post)]);
      await assert.rejects(db.execute({ ...post, content: 'Conflicting report' }), (e: unknown) => e instanceof DomainError && e.code === 'CONFLICT');
      const comment = { type: 'comment' as const, id: randomUUID(), postId: post.id, body: 'Database comment' };
      await Promise.all([db.execute(comment), db.execute(comment)]);
      await Promise.all([db.execute({ type: 'like', postId: post.id, liked: true }), db.execute({ type: 'like', postId: post.id, liked: true })]);
      await db.execute({ type: 'save', trekId: seed.treks[0].id, saved: true });
      const reopened = new PostgresStore(url.toString());
      try {
        const state = await reopened.read();
        assert.equal(state.posts.filter(p => p.id === post.id).length, 1);
        assert.deepEqual(state.posts.find(p => p.id === post.id)!.likedBy, [DEMO_USER]);
        assert.equal(state.comments.filter(c => c.id === comment.id).length, 1);
        assert.deepEqual(state.saved[DEMO_USER], [seed.treks[0].id]);
      } finally { await reopened.close(); }
    });

    await t.test('SQL feed pages preserve timestamp precision and equal-time ID ordering', async () => {
      await db.pool.query("UPDATE posts SET created_at='2020-01-01T00:00:00.123456Z'");
      const expected = (await db.pool.query('SELECT id FROM posts ORDER BY created_at DESC,id DESC')).rows.map(r => r.id);
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await db.feed(1, decodeCursor(cursor ?? undefined));
        ids.push(...page.items.map(p => p.id));
        cursor = page.nextCursor;
        assert.ok(ids.length <= expected.length, 'pagination must terminate');
      } while (cursor);
      assert.deepEqual(ids, expected);
      assert.equal((await db.feed(50)).nextCursor, null);
    });

    await t.test('two competing approvals for the final slot yield one success', async () => {
      const trip = seed.trips.find(t => t.organizerId === DEMO_USER)!;
      const applicants = ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
      await db.pool.query("UPDATE group_treks SET max_participants=2,starts_at=now()+interval '1 day' WHERE id=$1", [trip.id]);
      for (const id of applicants) await db.pool.query("INSERT INTO group_trek_members(trip_id,user_id,status) VALUES($1,$2,'pending') ON CONFLICT(trip_id,user_id) DO UPDATE SET status='pending'", [trip.id, id]);
      // Separate pools represent independent API processes; a JS queue cannot make this pass.
      const competitor = new PostgresStore(url.toString());
      try {
        const results = await Promise.allSettled([
          db.execute({ type: 'approve', tripId: trip.id, userId: applicants[0] }),
          competitor.execute({ type: 'approve', tripId: trip.id, userId: applicants[1] }),
        ]);
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        const failure = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
        assert.equal(failure.reason.code, 'TRIP_FULL');
        const members = (await db.read()).trips.find(t => t.id === trip.id)!.members;
        assert.equal(members.filter(m => m.status === 'accepted').length, 2);
        assert.equal(members.filter(m => m.status === 'pending').length, 1);
      } finally { await competitor.close(); }
    });
    await t.test('join and cancellation persist; another organizer cannot approve', async () => {
      const trip = seed.trips.find(t => t.organizerId !== DEMO_USER)!;
      await db.pool.query("UPDATE group_treks SET starts_at=now()+interval '1 day' WHERE id=$1", [trip.id]);
      await db.execute({ type: 'join', tripId: trip.id });
      assert.equal((await db.read()).trips.find(t => t.id === trip.id)!.members.find(m => m.userId === DEMO_USER)!.status, 'pending');
      await assert.rejects(db.execute({ type: 'approve', tripId: trip.id, userId: DEMO_USER }), (e: unknown) => e instanceof DomainError && e.status === 403);
      await db.execute({ type: 'leave', tripId: trip.id });
      assert.equal((await db.read()).trips.find(t => t.id === trip.id)!.members.some(m => m.userId === DEMO_USER), false);
    });
    await t.test('generated blocking and invitation clients round-trip through the PostgreSQL HTTP API', async()=>{
      const other=await db.identify({issuer:'https://client-test.example',subject:randomUUID()});
      const ownId=randomUUID(),otherId=randomUUID();
      for(const [id,actor] of [[ownId,DEMO_USER],[otherId,other]])await db.execute({type:'create-trip',id,trekId:seed.treks[0].id,title:'Client invitation',startsAt:'2099-01-01T00:00:00Z',timezone:'Asia/Kolkata',visibility:'private',maxParticipants:5},actor);
      const incoming=await db.invite(otherId,other);
      const port=3201;
      const child=spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{env:{...process.env,TSX_TSCONFIG_PATH:'apps/api/tsconfig.json',DEMO_MODE:'true',AUTH_MODE:'',NODE_ENV:'test',DATABASE_URL:url.toString(),REDIS_URL:'',PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
      let logs='';child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);
      try{
        const base=`http://127.0.0.1:${port}`;let ready=false;
        const deadline=Date.now()+30_000;
        while(Date.now()<deadline&&child.exitCode===null){try{ready=(await fetch(`${base}/v1/health`,{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
        assert.ok(ready,logs||'API startup timed out');
        const client=createApiClient(base,()=> 'trektribe-local-demo');
        await apiData(client.POST('/me/blocks/{id}',{params:{path:{id:other}},body:{blocked:true}}));
        assert.ok((await apiData(client.GET('/me/blocks'))).items.some(p=>p.id===other));
        await assert.rejects(apiData(client.POST('/invitations/accept',{body:{token:incoming.token}})),(e:unknown)=>e instanceof ApiError&&e.status===403);
        await apiData(client.POST('/me/blocks/{id}',{params:{path:{id:other}},body:{blocked:false}}));
        assert.equal((await apiData(client.GET('/me/blocks'))).items.some(p=>p.id===other),false);
        const gpx='<gpx><rte><rtept lat="30" lon="79"/><rtept lat="30.01" lon="79.01"/></rte></gpx>';
        const metadata={title:'HTTP imported trail',region:'Test',description:'Client route test',difficulty:'Easy'};
        const published=await publishGpx(client,{...metadata,gpx});
        assert.equal(published.hasElevation,false);
        const pinnedTrip=randomUUID();
        await db.execute({type:'create-trip',id:pinnedTrip,trekId:published.trekId,title:'HTTP pinned trip',startsAt:'2099-01-01T00:00:00Z',timezone:'UTC',maxParticipants:4});
        const original=await getPinnedRoute(client,pinnedTrip);
        assert.equal(original.id,published.routeVersionId);
        assert.deepEqual(original.coordinates,[[79,30],[79.01,30.01]]);
        const replacement=await publishGpx(client,{...metadata,gpx:gpx.replaceAll('30.01','30.02')},published.trekId);
        assert.notEqual(replacement.routeVersionId,published.routeVersionId);
        assert.deepEqual(await getPinnedRoute(client,pinnedTrip),original);
        await assert.rejects(publishGpx(client,{...metadata,gpx:'invalid'}),(e:unknown)=>e instanceof ApiError&&e.status===400);
        const foreign=await new RouteRepository(db.pool).publish(other,gpx,metadata);
        await assert.rejects(publishGpx(client,{...metadata,gpx},foreign.trekId),(e:unknown)=>e instanceof ApiError&&e.status===404);
        const threadId=randomUUID(),replyId=randomUUID();
        const threadBody={id:threadId,title:'HTTP discussion',body:'Client discussion'};
        await apiData(client.GET('/forum/capabilities'));
        await apiData(client.POST('/forum/threads',{body:threadBody}));
        await apiData(client.POST('/forum/threads',{body:threadBody}));
        const listed=await apiData(client.GET('/forum/threads',{params:{query:{limit:1}}}));
        assert.equal(listed.items[0].id,threadId);
        const replyBody={id:replyId,body:'HTTP reply'};
        await apiData(client.POST('/forum/threads/{id}/replies',{params:{path:{id:threadId}},body:replyBody}));
        await apiData(client.POST('/forum/threads/{id}/replies',{params:{path:{id:threadId}},body:replyBody}));
        const secondReply=randomUUID();
        await apiData(client.POST('/forum/threads/{id}/replies',{params:{path:{id:threadId}},body:{id:secondReply,body:'Second reply'}}));
        const firstPage=await apiData(client.GET('/forum/threads/{id}',{params:{path:{id:threadId},query:{limit:1}}}));
        assert.equal(firstPage.items.length,1);assert.equal(firstPage.items[0].id,replyId);assert.ok(firstPage.nextCursor);
        const secondPage=await apiData(client.GET('/forum/threads/{id}',{params:{path:{id:threadId},query:{limit:1,cursor:firstPage.nextCursor!}}}));
        assert.equal(secondPage.items[0].id,secondReply);assert.equal(secondPage.nextCursor,null);
        await apiData(client.POST('/forum/threads/{id}/closed',{params:{path:{id:threadId}},body:{closed:true}}));
        await assert.rejects(apiData(client.POST('/forum/threads/{id}/replies',{params:{path:{id:threadId}},body:{id:randomUUID(),body:'Rejected'}})),(e:unknown)=>e instanceof ApiError&&e.status===409);
        await apiData(client.POST('/forum/threads/{id}/closed',{params:{path:{id:threadId}},body:{closed:false}}));
        await apiData(client.POST('/forum/threads/{id}/replies',{params:{path:{id:threadId}},body:{id:randomUUID(),body:'After reopening'}}));
        await submitForumChange(client,{kind:'threads',id:threadId,action:'edit',data:{revision:1,title:'Edited HTTP discussion',body:'Edited body'}});
        await assert.rejects(submitForumChange(client,{kind:'threads',id:threadId,action:'edit',data:{revision:1,title:'Stale',body:'Stale'}}),(e:unknown)=>e instanceof ApiError&&e.status===409);
        await submitForumChange(client,{kind:'replies',id:replyId,action:'edit',data:{revision:1,body:'Edited reply'}});
        await submitForumChange(client,{kind:'replies',id:secondReply,action:'remove',data:{revision:1}});
        await submitForumChange(client,{kind:'replies',id:replyId,action:'report',data:{reason:'HTTP review'}});
        await db.pool.query('DELETE FROM forum_moderators WHERE user_id=$1',[DEMO_USER]);
        await assert.rejects(apiData(client.GET('/forum/moderation')),(e:unknown)=>e instanceof ApiError&&e.status===403);
        await db.pool.query('INSERT INTO forum_moderators(user_id) VALUES($1)',[DEMO_USER]);
        let cursor=0,reportId:number|undefined;
        do{const queue=await apiData(client.GET('/forum/moderation',{params:{query:{cursor}}}));reportId=queue.items.find(r=>r.replyId===replyId)?.id;cursor=queue.nextCursor??0;}while(!reportId&&cursor);
        assert.ok(reportId);
        const decision={action:'remove' as const,reason:'HTTP moderation decision'};
        await apiData(client.POST('/forum/moderation/{id}',{params:{path:{id:reportId}},body:decision}));
        await apiData(client.POST('/forum/moderation/{id}',{params:{path:{id:reportId}},body:decision}));
        const visible=await apiData(client.GET('/forum/threads/{id}',{params:{path:{id:threadId}}}));
        assert.equal(visible.thread.title,'Edited HTTP discussion');
        assert.equal(visible.items.some(r=>r.id===replyId||r.id===secondReply),false);
        await submitForumChange(client,{kind:'threads',id:threadId,action:'remove',data:{revision:2}});
        await assert.rejects(apiData(client.GET('/forum/threads/{id}',{params:{path:{id:threadId}}})),(e:unknown)=>e instanceof ApiError&&e.status===404);
        await db.pool.query('DELETE FROM forum_moderators WHERE user_id=$1',[DEMO_USER]);
        const issued=await apiData(client.POST('/group-treks/{id}/invitations',{params:{path:{id:ownId}}}));
        assert.match(issued.token,/^[A-Za-z0-9_-]{43}$/);assert.ok(Date.parse(issued.expiresAt)>Date.now());
        assert.deepEqual(await db.acceptInvite(issued.token,other),{tripId:ownId});
        assert.deepEqual(await apiData(client.POST('/invitations/accept',{body:{token:incoming.token}})),{tripId:otherId});
        assert.deepEqual(await apiData(client.POST('/invitations/accept',{body:{token:incoming.token}})),{tripId:otherId});
      }finally{child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');}
    });
  } finally {
    await store?.close();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
