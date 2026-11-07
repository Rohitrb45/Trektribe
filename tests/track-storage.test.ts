import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SnapshotDatabase } from '../apps/mobile/src/trail-snapshots';
import { TrackStorage, canonicalTrackPoints, TRACK_LIMITS } from '../apps/mobile/src/track-storage';
import { requireStorageSpace, LOCAL_STORAGE_RESERVE } from '../apps/mobile/src/storage-space';
function adapter(sqlite: DatabaseSync): SnapshotDatabase {
  const db: SnapshotDatabase = {
    execAsync: async sql => { sqlite.exec(sql); },
    runAsync: async (sql, ...args) => sqlite.prepare(sql).run(...args),
    getAllAsync: async <T>(sql: string, ...args: string[]) => sqlite.prepare(sql).all(...args) as T[],
    withExclusiveTransactionAsync: async task => {
      sqlite.exec('BEGIN');
      try { await task(db); sqlite.exec('COMMIT'); }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  return db;
}
const hash = async (value: string) => createHash('sha256').update(value).digest('hex');
const point = (timestamp: number) => ({ longitude: 77, latitude: 30, timestamp, accuracy: 5, altitude: null });
test('low-space guard stops new writes but permits retry acknowledgments, reading, finishing and deletion', async () => {
  const sql = new DatabaseSync(':memory:');
  let space = LOCAL_STORAGE_RESERVE;
  const store = new TrackStorage(adapter(sql), hash, () => requireStorageSpace(space));
  try {
    await store.initialize(); await store.create('walk', 'Walk', 1);
    await store.appendFix('walk', 0, point(2));
    space = 0;
    await assert.rejects(store.appendFix('walk', 1, point(3)), /Free at least/);
    assert.equal((await store.appendFix('walk', 0, point(2))).pointCount, 1);
    assert.deepEqual(await store.readPending('walk'), [point(2)]);
    await store.transition('walk', 'paused');
    await assert.rejects(store.transition('walk', 'recording'), /Free at least/);
    await assert.rejects(store.create('another', 'Walk', 1), /Free at least/);
    space = LOCAL_STORAGE_RESERVE;
    await store.transition('walk', 'recording'); await store.appendFix('walk', 1, point(3));
    space = 0; await store.transition('walk', 'finished'); await store.remove('walk');
    assert.deepEqual(await store.list(), []);
  } finally { sql.close(); }
});
test('partial capture chunks survive reopening and finish without losing saved fixes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trek-pending-'));
  let sql = new DatabaseSync(join(dir, 'tracks.db'));
  try {
    let store = new TrackStorage(adapter(sql), hash); await store.initialize();
    await store.create('walk', 'Walk', 1);
    await store.appendFix('walk', 0, point(2)); await store.appendFix('walk', 1, point(3));
    sql.close(); sql = new DatabaseSync(join(dir, 'tracks.db'));
    store = new TrackStorage(adapter(sql), hash); await store.initialize();
    assert.equal((await store.list())[0].pointCount, 2);
    assert.equal((await store.list())[0].nextChunk, 0);
    assert.deepEqual(await store.readPending('walk'), [point(2), point(3)]);
    assert.equal((await store.appendFix('walk', 1, point(3))).pointCount, 2);
    await store.transition('walk', 'finished');
    assert.deepEqual(await store.readPending('walk'), [point(2), point(3)]);
    await store.remove('walk'); assert.deepEqual(await store.readPending('walk'), []);
  } finally { sql.close(); rmSync(dir, { recursive: true }); }
});
test('capture seals 200 points atomically, retries safely across sealing and preserves legacy chunks', async () => {
  const sql = new DatabaseSync(':memory:'); const store = new TrackStorage(adapter(sql), hash);
  try {
    await store.initialize(); await store.create('walk', 'Walk', 1);
    await store.append('walk', 0, [point(2)]);
    for (let n = 0; n < 199; n++) await store.appendFix('walk', n + 1, point(n + 3));
    sql.exec("CREATE TRIGGER reject_counter BEFORE UPDATE OF next_chunk ON track_sessions_v1 BEGIN SELECT RAISE(ABORT, 'write failure'); END");
    await assert.rejects(store.appendFix('walk', 200, point(202)), /write failure/);
    assert.equal((await store.readPending('walk')).length, 199);
    assert.equal((await store.list())[0].nextChunk, 1);
    sql.exec('DROP TRIGGER reject_counter');
    await store.appendFix('walk', 200, point(202));
    assert.equal((await store.readChunk('walk', 1)).length, 200);
    assert.deepEqual(await store.readChunk('walk', 0), [point(2)]);
    assert.deepEqual(await store.readPending('walk'), []);
    assert.equal((await store.appendFix('walk', 200, point(202))).pointCount, 201);
    await assert.rejects(store.appendFix('walk', 200, point(203)), /conflicts/);
    await assert.rejects(store.appendFix('walk', 0, point(3)), /count has changed/);
    await store.appendFix('walk', 201, point(203));
    assert.deepEqual(await store.readPending('walk'), [point(203)]);
    await assert.rejects(store.append('walk', 2, [point(204)]), /unfinished/);
  } finally { sql.close(); }
});
test('partial chunk corruption stops capture and remains removable', async () => {
  const sql = new DatabaseSync(':memory:'); const store = new TrackStorage(adapter(sql), hash);
  try {
    await store.initialize(); await store.create('walk', 'Walk', 1);
    await Promise.all([store.appendFix('walk', 0, point(2)), store.appendFix('walk', 0, point(2))]);
    assert.equal((await store.list())[0].pointCount, 1);
    sql.exec("UPDATE track_pending_v1 SET payload = '[]'");
    await assert.rejects(store.appendFix('walk', 1, point(3)), /integrity/);
    await assert.rejects(store.readPending('walk'), /integrity/);
    assert.equal((await store.list())[0].pointCount, 1);
    await store.remove('walk'); assert.deepEqual(await store.list(), []);
  } finally { sql.close(); }
});
test('the final partial chunk seals at 100,000 points and rejects further fixes', async () => {
  const sql = new DatabaseSync(':memory:'); const store = new TrackStorage(adapter(sql), hash);
  try {
    await store.initialize(); await store.create('walk', 'Walk', 1);
    // A consistent nearly-full database fixture avoids 100,000 separate test transactions.
    for (let sequence = 0; sequence < 499; sequence++) {
      const payload = canonicalTrackPoints(Array.from({ length: 200 }, (_, i) => point(sequence * 200 + i + 1)));
      sql.prepare('INSERT INTO track_chunks_v1 VALUES (?,?,?,?)').run('walk', sequence, await hash(payload), payload);
    }
    const tail = canonicalTrackPoints(Array.from({ length: 199 }, (_, i) => point(99801 + i)));
    sql.prepare('INSERT INTO track_pending_v1 VALUES (?,?,?)').run('walk', await hash(tail), tail);
    sql.exec("UPDATE track_sessions_v1 SET next_chunk = 499, point_count = 99999, last_timestamp = 99999");
    const last = await store.appendFix('walk', 99999, point(100000));
    assert.equal(last.nextChunk, 500); assert.equal(last.pointCount, 100000);
    assert.deepEqual(await store.readPending('walk'), []);
    assert.equal((await store.readChunk('walk', 499)).length, 200);
    assert.equal((await store.appendFix('walk', 99999, point(100000))).pointCount, 100000);
    await assert.rejects(store.appendFix('walk', 100000, point(100001)), /capacity/);
  } finally { sql.close(); }
});
test('committed chunks survive reopening; interrupted recording pauses and retries do not duplicate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trek-track-'));
  let sql = new DatabaseSync(join(dir, 'tracks.db'));
  try {
    let store = new TrackStorage(adapter(sql), hash); await store.initialize();
    await store.create('one', 'Morning walk', 1);
    await store.append('one', 0, [point(2), point(3)]);
    sql.close(); sql = new DatabaseSync(join(dir, 'tracks.db'));
    store = new TrackStorage(adapter(sql), hash); await store.initialize();
    assert.equal((await store.list())[0].state, 'paused');
    assert.deepEqual(await store.readChunk('one', 0), [point(2), point(3)]);
    assert.equal((await store.append('one', 0, [point(2), point(3)])).pointCount, 2);
    await assert.rejects(store.append('one', 1, [point(4)]), /Resume/);
    await store.transition('one', 'recording'); await store.append('one', 1, [point(4)]);
    await store.transition('one', 'finished');
    assert.equal((await store.append('one', 1, [point(4)])).pointCount, 3);
    await assert.rejects(store.transition('one', 'recording'), /cannot be resumed/);
    await store.remove('one'); assert.deepEqual(await store.list(), []);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM track_chunks_v1').get()?.n, 0);
  } finally { sql.close(); rmSync(dir, { recursive: true }); }
});
test('concurrent retries serialize, conflicting payloads and gaps cannot modify saved points', async () => {
  const sql = new DatabaseSync(':memory:'); const store = new TrackStorage(adapter(sql), hash);
  try {
    await store.initialize(); await store.create('one', 'Walk', 1);
    await Promise.all([store.append('one', 0, [point(2)]), store.append('one', 0, [point(2)])]);
    await assert.rejects(store.append('one', 0, [point(3)]), /conflicts/);
    await assert.rejects(store.append('one', 2, [point(4)]), /in order/);
    await assert.rejects(store.append('one', 1, [point(2)]), /timestamps/);
    assert.equal((await store.list())[0].pointCount, 1);
    await store.append('one', 1, [point(3)]);
    sql.prepare('UPDATE track_chunks_v1 SET payload = ? WHERE sequence = 0').run('[]');
    await assert.rejects(store.readChunk('one', 0), /integrity/);
    await store.remove('one'); assert.deepEqual(await store.list(), []);
  } finally { sql.close(); }
});
test('a failed counter update rolls back chunk insertion and leaves retries usable', async () => {
  const sql = new DatabaseSync(':memory:'); const store = new TrackStorage(adapter(sql), hash);
  try {
    await store.initialize(); await store.create('one', 'Walk', 1);
    sql.exec("CREATE TRIGGER simulate_full_disk BEFORE UPDATE OF next_chunk ON track_sessions_v1 BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END");
    await assert.rejects(store.append('one', 0, [point(2)]), /simulated write failure/);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM track_chunks_v1').get()?.n, 0);
    assert.equal((await store.list())[0].pointCount, 0);
    sql.exec('DROP TRIGGER simulate_full_disk');
    assert.equal((await store.append('one', 0, [point(2)])).pointCount, 1);
  } finally { sql.close(); }
});
test('one recording at a time; session limit recovers after deletion', async () => {
  const sql = new DatabaseSync(':memory:'); const store = new TrackStorage(adapter(sql), hash);
  try {
    await store.initialize(); await store.create('one', 'Walk', 1);
    await assert.rejects(store.create('two', 'Walk', 1), /Pause or finish/);
    await store.transition('one', 'paused'); await store.create('two', 'Walk', 1);
    await assert.rejects(store.transition('one', 'recording'), /Pause or finish/);
    await store.transition('two', 'finished');
    for (let i = 2; i < TRACK_LIMITS.sessions; i++) {
      await store.create('session-' + i, 'Walk', 1); await store.transition('session-' + i, 'finished');
    }
    await assert.rejects(store.create('extra', 'Walk', 1), /20 maximum/);
    await store.remove('one'); await store.create('extra', 'Walk', 1);
    assert.equal((await store.list()).length, 20);
    await assert.rejects(store.append('extra', TRACK_LIMITS.chunks, [point(2)]), /limit/);
  } finally { sql.close(); }
});
test('point validation bounds payloads and strips unrelated data', () => {
  for (const points of [[], Array(201).fill(point(1)), [point(2), point(1)], [{ ...point(1), latitude: 91 }], [{ ...point(1), accuracy: -1 }], [{ ...point(1), timestamp: NaN }]]) {
    assert.throws(() => canonicalTrackPoints(points));
  }
  assert.equal(canonicalTrackPoints([{ ...point(1), token: 'secret' }]), JSON.stringify([point(1)]));
});
