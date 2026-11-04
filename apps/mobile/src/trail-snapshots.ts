import type { Trek } from '@trektribe/core';

export const MAX_OFFLINE_TRAILS = 20;
export type Snapshot = Pick<Trek, 'id' | 'routeVersionId' | 'title' | 'region' | 'description' | 'difficulty' | 'distanceKm' | 'elevationM' | 'duration' | 'route'> & { version: 1; source: string; savedAt: string };
export function snapshotSource(url?: string): string {
  if (!url) return 'local-demo';
  const parsed = new URL(url);
  return parsed.origin + parsed.pathname;
}
export function validateSnapshot(value: unknown): Snapshot {
  const v = value as Snapshot;
  const text = (x: unknown, max: number) => typeof x === 'string' && x.length > 0 && x.length <= max;
  if (!v || v.version !== 1 || !text(v.id, 200) || !text(v.source, 2048) ||
      !text(v.title, 200) || !text(v.region, 200) || typeof v.description !== 'string' || v.description.length > 10000 ||
      !text(v.duration, 200) || !['Easy', 'Moderate', 'Hard'].includes(v.difficulty) ||
      !Number.isFinite(v.distanceKm) || v.distanceKm < 0 || !Number.isFinite(v.elevationM) || v.elevationM < 0 ||
      !text(v.savedAt, 40) || !Number.isFinite(Date.parse(v.savedAt)) ||
      (v.routeVersionId !== undefined && !text(v.routeVersionId, 200)) ||
      !Array.isArray(v.route) || v.route.length < 2 || v.route.length > 10000 ||
      !v.route.every(p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) {
    throw new Error('This trail cannot be saved: its details or route are invalid.');
  }
  // Explicit whitelist: never persist account, membership or authentication data.
  return { version: 1, source: v.source, savedAt: v.savedAt, id: v.id, routeVersionId: v.routeVersionId,
    title: v.title, region: v.region, description: v.description, difficulty: v.difficulty,
    distanceKm: v.distanceKm, elevationM: v.elevationM, duration: v.duration,
    route: v.route.map(p => [p[0], p[1]]) };
}
export function makeSnapshot(trek: Trek, source?: string): Snapshot {
  return validateSnapshot({ ...trek, version: 1, source: snapshotSource(source), savedAt: new Date().toISOString() });
}
export function snapshotIdentity(v: Snapshot): string {
  return JSON.stringify([v.source, v.id, v.routeVersionId ?? null, v.route]);
}
export interface SnapshotConnection {
  runAsync(sql: string, ...params: string[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: string[]): Promise<T[]>;
}
export interface SnapshotDatabase extends SnapshotConnection {
  execAsync(sql: string): Promise<void>;
  withExclusiveTransactionAsync(task: (transaction: SnapshotConnection) => Promise<void>): Promise<void>;
}
export async function initializeSnapshots(db: SnapshotDatabase) {
  await db.execAsync('CREATE TABLE IF NOT EXISTS trail_snapshots_v1 (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL)');
}
export async function saveSnapshot(db: SnapshotDatabase, key: string, value: Snapshot) {
  const payload = JSON.stringify(validateSnapshot(value));
  await db.withExclusiveTransactionAsync(async tx => {
    const rows = await tx.getAllAsync<{ id: string }>('SELECT id FROM trail_snapshots_v1');
    if (!rows.some(r => r.id === key) && rows.length >= MAX_OFFLINE_TRAILS) throw new Error('Remove an offline trail before saving another (20 maximum).');
    await tx.runAsync('INSERT INTO trail_snapshots_v1 (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload', key, payload);
  });
}
export async function listSnapshots(db: SnapshotDatabase) {
  const rows = await db.getAllAsync<{ id: string; payload: string }>('SELECT id, payload FROM trail_snapshots_v1 ORDER BY rowid DESC');
  return rows.map(row => {
    try { return { key: row.id, snapshot: validateSnapshot(JSON.parse(row.payload)) }; }
    catch { return { key: row.id, snapshot: null }; }
  });
}
export async function removeSnapshot(db: SnapshotDatabase, key: string) {
  await db.runAsync('DELETE FROM trail_snapshots_v1 WHERE id = ?', key);
}
