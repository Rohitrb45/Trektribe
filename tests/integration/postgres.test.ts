import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { PostgresStore } from '../../apps/api/src/store';
import { decodeCursor } from '../../apps/api/src/feed';
import { RouteRepository } from '../../apps/api/src/routes';
import { MessageRepository } from '../../apps/api/src/messages';
import { BlockRepository } from '../../apps/api/src/blocks';
import { startRealtime } from '../../apps/api/src/realtime';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { io } from 'socket.io-client';
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
      assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 8);
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
      const stop=startRealtime(http,db.pool,async token=>{if(token!=='Bearer test-guest')throw new Error('Invalid token');return guest;},[]);
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
  } finally {
    await store?.close();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
