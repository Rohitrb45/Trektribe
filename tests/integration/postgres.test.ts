import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { PostgresStore } from '../../apps/api/src/store';
import { decodeCursor } from '../../apps/api/src/feed';
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
      assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 3);
      const state = await db.read();
      assert.equal(state.treks.length, seed.treks.length);
      assert.deepEqual(state.treks[0].coordinates, seed.treks[0].coordinates);
      assert.deepEqual(state.treks[0].route, seed.treks[0].route);
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
