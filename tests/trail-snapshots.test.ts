import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeSnapshots, listSnapshots, saveSnapshot, removeSnapshot, validateSnapshot, snapshotIdentity, snapshotSource, MAX_OFFLINE_TRAILS, type SnapshotDatabase } from '../apps/mobile/src/trail-snapshots';

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
const sample = () => validateSnapshot({ version: 1, source: 'local-demo', savedAt: '2026-11-04T12:00:00.000Z',
  id: "trail'; DROP TABLE trail_snapshots_v1;--", title: 'Sample trail', region: 'Hills', description: '',
  difficulty: 'Easy', distanceKm: 3, elevationM: 120, duration: '2 hours', route: [[77, 30], [77.1, 30.1]],
  ownerId: 'private', accessToken: 'never-store' });

test('SQLite trail copies survive reopening and exclude account data', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trek-snapshot-'));
  let sqlite = new DatabaseSync(join(dir, 'trails.db'));
  try {
    let db = adapter(sqlite);
    await initializeSnapshots(db);
    await saveSnapshot(db, sample().id, sample());
    sqlite.close(); sqlite = new DatabaseSync(join(dir, 'trails.db')); db = adapter(sqlite);
    await initializeSnapshots(db);
    const rows = await listSnapshots(db);
    assert.deepEqual(rows[0].snapshot, sample());
    assert.equal('ownerId' in rows[0].snapshot!, false);
    assert.equal('accessToken' in rows[0].snapshot!, false);
    await removeSnapshot(db, sample().id);
    assert.equal((await listSnapshots(db)).length, 0);
  } finally { sqlite.close(); rmSync(dir, { recursive: true }); }
});
test('snapshot capacity permits updates and removal; failed insert rolls back', async () => {
  const sqlite = new DatabaseSync(':memory:'); const db = adapter(sqlite);
  try {
    await initializeSnapshots(db);
    for (let i = 0; i < MAX_OFFLINE_TRAILS; i++) await saveSnapshot(db, String(i), sample());
    await assert.rejects(saveSnapshot(db, 'extra', sample()), /20 maximum/);
    await saveSnapshot(db, '0', { ...sample(), title: 'Updated' });
    assert.equal((await listSnapshots(db)).find(r => r.key === '0')?.snapshot?.title, 'Updated');
    await removeSnapshot(db, '1'); await saveSnapshot(db, 'extra', sample());
    assert.equal((await listSnapshots(db)).length, MAX_OFFLINE_TRAILS);
  } finally { sqlite.close(); }
});
test('corrupt copies remain removable without hiding valid copies', async () => {
  const sqlite = new DatabaseSync(':memory:'); const db = adapter(sqlite);
  try {
    await initializeSnapshots(db); await saveSnapshot(db, 'good', sample());
    await db.runAsync('INSERT INTO trail_snapshots_v1 VALUES (?, ?)', 'broken', '{');
    const rows = await listSnapshots(db);
    assert.equal(rows.length, 2); assert.equal(rows.find(r => r.key === 'broken')?.snapshot, null);
    await removeSnapshot(db, 'broken'); assert.equal((await listSnapshots(db)).length, 1);
  } finally { sqlite.close(); }
});
test('identity retains changed geometry and versions; validation rejects invalid routes', () => {
  const v = sample();
  assert.equal(snapshotIdentity(v), snapshotIdentity({ ...v, title: 'Renamed', savedAt: new Date().toISOString() }));
  assert.notEqual(snapshotIdentity(v), snapshotIdentity({ ...v, routeVersionId: 'new-version' }));
  assert.notEqual(snapshotIdentity(v), snapshotIdentity({ ...v, route: [[77, 30], [78, 30]] }));
  for (const route of [[], [[181, 30], [77, 30]], [[77, NaN], [77, 30]], Array(10001).fill([77, 30])]) {
    assert.throws(() => validateSnapshot({ ...v, route }));
  }
  assert.throws(() => validateSnapshot({ ...v, version: 2 }));
  assert.equal(snapshotSource('https://user:password@example.com/api?token=secret#secret'), 'https://example.com/api');
});
