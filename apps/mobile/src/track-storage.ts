import { canonicalTrackPoints, TRACK_LIMITS, type TrackPoint } from '../../../packages/core/src/track-points';
export { canonicalTrackPoints, TRACK_LIMITS, type TrackPoint } from '../../../packages/core/src/track-points';
import type { SnapshotDatabase, SnapshotConnection } from './trail-snapshots';

export type TrackSession = { id: string; title: string; state: 'recording' | 'paused' | 'finished'; createdAt: number; nextChunk: number; pointCount: number; lastTimestamp: number | null };

type Hash = (payload: string) => Promise<string>;
type ChunkRow = { sequence: number; checksum: string; payload: string };

const columns = 'id, title, state, created_at AS createdAt, next_chunk AS nextChunk, point_count AS pointCount, last_timestamp AS lastTimestamp';
async function session(db: SnapshotConnection, id: string): Promise<TrackSession> {
  const [row] = await db.getAllAsync<TrackSession>(`SELECT ${columns} FROM track_sessions_v1 WHERE id = ?`, id);
  if (!row) throw new Error('Recording session was not found.');
  return row;
}

/** Local-only storage. No publishing or upload operation is exposed. One instance per database. */
export class TrackStorage {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private db: SnapshotDatabase, private hash: Hash, private checkSpace: () => void = () => {}) {}
  private write<T>(task: (tx: SnapshotConnection) => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      let value!: T;
      await this.db.withExclusiveTransactionAsync(async tx => { value = await task(tx); });
      return value;
    });
    this.queue = result.catch(() => {});
    return result;
  }
  /** Call once on database startup, before accepting capture: interrupted sessions require explicit resume. */
  async initialize() {
    await this.db.execAsync(`CREATE TABLE IF NOT EXISTS track_sessions_v1 (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('recording','paused','finished')),
      created_at INTEGER NOT NULL, next_chunk INTEGER NOT NULL DEFAULT 0,
      point_count INTEGER NOT NULL DEFAULT 0, last_timestamp INTEGER);
      CREATE TABLE IF NOT EXISTS track_chunks_v1 (
      session_id TEXT NOT NULL, sequence INTEGER NOT NULL, checksum TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY(session_id, sequence));
      CREATE TABLE IF NOT EXISTS track_pending_v1 (
      session_id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, payload TEXT NOT NULL);`);
    await this.write(tx => tx.runAsync("UPDATE track_sessions_v1 SET state = 'paused' WHERE state = 'recording'"));
  }
  create(id: string, title: string, createdAt = Date.now()) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !title.trim() || title.length > 200 || !Number.isSafeInteger(createdAt) || createdAt < 0) return Promise.reject(new Error('Invalid recording session.'));
    return this.write(async tx => {
      this.checkSpace();
      const rows = await tx.getAllAsync<{ id: string }>('SELECT id FROM track_sessions_v1');
      if (rows.length >= TRACK_LIMITS.sessions) throw new Error('Remove a recording before creating another (20 maximum).');
      const active = await tx.getAllAsync<{ id: string }>("SELECT id FROM track_sessions_v1 WHERE state = 'recording'");
      if (active.length) throw new Error('Pause or finish the current recording first.');
      await tx.runAsync("INSERT INTO track_sessions_v1 (id,title,state,created_at) VALUES (?,?,'recording',?)", id, title.trim(), String(createdAt));
      return session(tx, id);
    });
  }
  append(id: string, sequence: number, points: TrackPoint[]) {
    // Capture immutable input before asynchronous work or a caller mutates its buffer.
    let payload: string;
    try { payload = canonicalTrackPoints(points); } catch (e) { return Promise.reject(e); }
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= TRACK_LIMITS.chunks) return Promise.reject(new Error('Invalid track chunk number or recording limit reached.'));
    return this.write(async tx => {
      const s = await session(tx, id);
      const [existing] = await tx.getAllAsync<ChunkRow>('SELECT sequence, checksum, payload FROM track_chunks_v1 WHERE session_id = ? AND sequence = ?', id, String(sequence));
      const checksum = await this.hash(payload);
      if (existing) {
        if (existing.checksum !== checksum || existing.payload !== payload) throw new Error('Track chunk conflicts with previously saved points.');
        return s; // Acknowledgment retries remain safe even after pause/finish.
      }
      if (s.state !== 'recording') throw new Error('Resume the recording before adding points.');
      this.checkSpace();
      const pending = await tx.getAllAsync<{ session_id: string }>('SELECT session_id FROM track_pending_v1 WHERE session_id = ?', id);
      if (pending.length) throw new Error('Cannot append a sealed chunk while a capture chunk is unfinished.');
      if (sequence !== s.nextChunk) throw new Error('Track chunks must be saved in order.');
      const validated = JSON.parse(payload) as TrackPoint[];
      if (validated[0].timestamp < s.createdAt || (s.lastTimestamp !== null && validated[0].timestamp <= s.lastTimestamp)) throw new Error('Track timestamps must increase across chunks.');
      await tx.runAsync('INSERT INTO track_chunks_v1 (session_id,sequence,checksum,payload) VALUES (?,?,?,?)', id, String(sequence), checksum, payload);
      await tx.runAsync('UPDATE track_sessions_v1 SET next_chunk = ?, point_count = ?, last_timestamp = ? WHERE id = ?', String(sequence + 1), String(s.pointCount + validated.length), String(validated[validated.length - 1].timestamp), id);
      return session(tx, id);
    });
  }
  /** Persist every fix; only full chunks are sealed. expectedCount makes acknowledgment retries safe. */
  appendFix(id: string, expectedCount: number, input: TrackPoint) {
    let point: TrackPoint;
    try { point = JSON.parse(canonicalTrackPoints([input]))[0]; } catch (e) { return Promise.reject(e); }
    if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) return Promise.reject(new Error('Invalid saved point count.'));
    return this.write(async tx => {
      const s = await session(tx, id);
      const [pending] = await tx.getAllAsync<ChunkRow>('SELECT checksum,payload FROM track_pending_v1 WHERE session_id = ?', id);
      let points: TrackPoint[] = [];
      if (pending) {
        if (await this.hash(pending.payload) !== pending.checksum) throw new Error('Unfinished track chunk failed its integrity check.');
        points = JSON.parse(canonicalTrackPoints(JSON.parse(pending.payload)));
      }
      if (expectedCount === s.pointCount - 1) {
        let previous = points.at(-1);
        if (!previous && s.nextChunk > 0) {
          const [last] = await tx.getAllAsync<ChunkRow>('SELECT checksum,payload FROM track_chunks_v1 WHERE session_id = ? AND sequence = ?', id, String(s.nextChunk - 1));
          if (!last || await this.hash(last.payload) !== last.checksum) throw new Error('Saved track chunk failed its integrity check.');
          previous = (JSON.parse(canonicalTrackPoints(JSON.parse(last.payload))) as TrackPoint[]).at(-1);
        }
        if (JSON.stringify(previous) === JSON.stringify(point)) return s;
        throw new Error('Location retry conflicts with the saved point.');
      }
      if (expectedCount !== s.pointCount) throw new Error('Saved point count has changed. Refresh before continuing.');
      if (s.state !== 'recording') throw new Error('Resume the recording before adding points.');
      this.checkSpace();
      if (s.nextChunk >= TRACK_LIMITS.chunks) throw new Error('Recording capacity reached. Finish it and start another.');
      if (point.timestamp < s.createdAt || (s.lastTimestamp !== null && point.timestamp <= s.lastTimestamp)) throw new Error('Track timestamps must increase across chunks.');
      points.push(point);
      const payload = canonicalTrackPoints(points);
      const checksum = await this.hash(payload);
      const sealed = points.length === TRACK_LIMITS.pointsPerChunk;
      if (sealed) {
        await tx.runAsync('INSERT INTO track_chunks_v1 (session_id,sequence,checksum,payload) VALUES (?,?,?,?)', id, String(s.nextChunk), checksum, payload);
        await tx.runAsync('DELETE FROM track_pending_v1 WHERE session_id = ?', id);
      } else {
        await tx.runAsync('INSERT INTO track_pending_v1 (session_id,checksum,payload) VALUES (?,?,?) ON CONFLICT(session_id) DO UPDATE SET checksum = excluded.checksum, payload = excluded.payload', id, checksum, payload);
      }
      await tx.runAsync('UPDATE track_sessions_v1 SET next_chunk = ?, point_count = ?, last_timestamp = ? WHERE id = ?', String(s.nextChunk + (sealed ? 1 : 0)), String(s.pointCount + 1), String(point.timestamp), id);
      return session(tx, id);
    });
  }
  async readPending(id: string): Promise<TrackPoint[]> {
    await this.queue;
    const [row] = await this.db.getAllAsync<ChunkRow>('SELECT checksum,payload FROM track_pending_v1 WHERE session_id = ?', id);
    if (!row) return [];
    if (await this.hash(row.payload) !== row.checksum) throw new Error('Unfinished track chunk failed its integrity check.');
    return JSON.parse(canonicalTrackPoints(JSON.parse(row.payload)));
  }
  transition(id: string, target: TrackSession['state']) {
    return this.write(async tx => {
      const s = await session(tx, id);
      if (!['recording', 'paused', 'finished'].includes(target)) throw new Error('Invalid recording state.');
      if (s.state === target) return s;
      if (s.state === 'finished') throw new Error('Finished recordings cannot be resumed.');
      if (target === 'recording') {
        this.checkSpace();
        const active = await tx.getAllAsync<{ id: string }>("SELECT id FROM track_sessions_v1 WHERE state = 'recording'");
        if (active.length) throw new Error('Pause or finish the current recording first.');
      }
      await tx.runAsync('UPDATE track_sessions_v1 SET state = ? WHERE id = ?', target, id);
      return session(tx, id);
    });
  }
  async list() {
    await this.queue;
    return this.db.getAllAsync<TrackSession>(`SELECT ${columns} FROM track_sessions_v1 ORDER BY created_at DESC, id`);
  }
  /** Import a verified finished recording atomically; never expose a partially restored walk. */
  restoreFinished(id: string, title: string, chunks: TrackPoint[][], active: () => void = () => {}) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !title.trim() || title.length > 200 || !chunks.length || chunks.length > TRACK_LIMITS.chunks) return Promise.reject(new Error('Invalid restored recording.'));
    let payloads: string[];
    try { payloads = chunks.map(canonicalTrackPoints); } catch (e) { return Promise.reject(e); }
    return this.write(async tx => {
      active(); this.checkSpace();
      let total = 0, last = -1, first = 0;
      const saved: { payload: string; checksum: string }[] = [];
      for (const payload of payloads) {
        active();
        const points = JSON.parse(payload) as TrackPoint[];
        if (points[0].timestamp <= last) throw new Error('Restored timestamps must increase across chunks.');
        if (!total) first = points[0].timestamp;
        last = points[points.length - 1].timestamp; total += points.length;
        saved.push({ payload, checksum: await this.hash(payload) });
      }
      const rows = await tx.getAllAsync<TrackSession>(`SELECT ${columns} FROM track_sessions_v1`);
      const existing = rows.find(r => r.id === id);
      if (existing) {
        if (existing.state !== 'finished' || existing.title !== title.trim() || existing.pointCount !== total || existing.nextChunk !== saved.length) throw new Error('A different local recording uses this restore ID.');
        const prior = await tx.getAllAsync<ChunkRow>('SELECT sequence,checksum,payload FROM track_chunks_v1 WHERE session_id=? ORDER BY sequence',id);
        if (prior.length !== saved.length || prior.some((p,n) => p.sequence !== n || p.payload !== saved[n].payload || p.checksum !== saved[n].checksum)) throw new Error('The saved local copy differs from this server recording.');
        return existing;
      }
      if (rows.length >= TRACK_LIMITS.sessions) throw new Error('Remove a local recording before restoring another (20 maximum).');
      active(); this.checkSpace();
      await tx.runAsync("INSERT INTO track_sessions_v1(id,title,state,created_at,next_chunk,point_count,last_timestamp) VALUES(?,?,'finished',?,?,?,?)",id,title.trim(),String(first),String(saved.length),String(total),String(last));
      for (let n = 0; n < saved.length; n++) {
        active(); this.checkSpace();
        await tx.runAsync('INSERT INTO track_chunks_v1(session_id,sequence,checksum,payload) VALUES(?,?,?,?)',id,String(n),saved[n].checksum,saved[n].payload);
      }
      active();
      return session(tx,id);
    });
  }
  async readChunk(id: string, sequence: number): Promise<TrackPoint[]> {
    await this.queue;
    const [row] = await this.db.getAllAsync<ChunkRow>('SELECT sequence,checksum,payload FROM track_chunks_v1 WHERE session_id = ? AND sequence = ?', id, String(sequence));
    if (!row) throw new Error('Track chunk was not found.');
    if (await this.hash(row.payload) !== row.checksum) throw new Error('Saved track chunk failed its integrity check.');
    const points: unknown = JSON.parse(row.payload);
    return JSON.parse(canonicalTrackPoints(points)) as TrackPoint[];
  }
  remove(id: string) {
    return this.write(async tx => {
      await tx.runAsync('DELETE FROM track_chunks_v1 WHERE session_id = ?', id);
      await tx.runAsync('DELETE FROM track_pending_v1 WHERE session_id = ?', id);
      await tx.runAsync('DELETE FROM track_sessions_v1 WHERE id = ?', id);
    });
  }
}
