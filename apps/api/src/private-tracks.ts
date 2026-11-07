import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { DomainError } from '../../../packages/core/src/index';
import { canonicalTrackPoints } from '../../../packages/core/src/track-points';

export const trackCreate = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(200), chunkCount: z.number().int().min(1).max(500), pointCount: z.number().int().min(1).max(100000) }).strict();
export const trackChunk = z.object({ checksum: z.string().regex(/^[a-f0-9]{64}$/), points: z.array(z.object({
  longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90),
  timestamp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), accuracy: z.number().min(0), altitude: z.number().nullable(),
}).strict()).min(1).max(200) }).strict();
export const trackStatus = z.object({ id: z.uuid(), title: z.string(), chunkCount: z.number().int(), expectedPoints: z.number().int(), nextChunk: z.number().int(), pointCount: z.number().int(), completed: z.boolean() });
const fields = 'id,title,chunk_count AS "chunkCount",expected_points AS "expectedPoints",next_chunk AS "nextChunk",point_count AS "pointCount",completed';
const missing = () => new DomainError('NOT_FOUND', 'Private recording not found.', 404);
const conflict = (message: string) => new DomainError('CONFLICT', message, 409);
type Status = z.infer<typeof trackStatus>;
type Row = Status & { last_timestamp: string | null; deleted_at: Date | null };

export class PrivateTracks {
  constructor(private pool: Pool) {}
  private async transaction<T>(operation: (db: PoolClient) => Promise<T>) {
    const db = await this.pool.connect();
    try { await db.query('BEGIN'); const result = await operation(db); await db.query('COMMIT'); return result; }
    catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
  }
  private async row(db: PoolClient, owner: string, id: string): Promise<Row> {
    const row = (await db.query(`SELECT ${fields},last_timestamp,deleted_at FROM private_tracks WHERE owner_id=$1 AND id=$2 FOR UPDATE`, [owner,id])).rows[0];
    if (!row || row.deleted_at) throw missing();
    return row;
  }
  private status(row: Row): Status { return trackStatus.parse(row); }
  async create(owner: string, input: unknown) {
    const data = trackCreate.parse(input);
    if (data.pointCount < data.chunkCount || data.pointCount > data.chunkCount * 200) throw new DomainError('INVALID', 'Point and chunk totals disagree.', 400);
    return this.transaction(async db => {
      // Serialize per-owner creation to enforce the account quota across API instances.
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [owner]);
      const existing = (await db.query(`SELECT ${fields},last_timestamp,deleted_at FROM private_tracks WHERE owner_id=$1 AND id=$2 FOR UPDATE`, [owner,data.id])).rows[0] as Row | undefined;
      if (existing) {
        if (existing.deleted_at) throw conflict('This upload was deleted. Use a new upload ID for an intentional new copy.');
        if (existing.title !== data.title || existing.chunkCount !== data.chunkCount || existing.expectedPoints !== data.pointCount) throw conflict('Upload ID already has different metadata.');
        return this.status(existing);
      }
      const count = (await db.query('SELECT count(*)::int AS n FROM private_tracks WHERE owner_id=$1 AND deleted_at IS NULL', [owner])).rows[0].n;
      if (count >= 20) throw conflict('Remove a private recording before uploading another (20 maximum).');
      await db.query('INSERT INTO private_tracks(owner_id,id,title,chunk_count,expected_points) VALUES($1,$2,$3,$4,$5)', [owner,data.id,data.title,data.chunkCount,data.pointCount]);
      return this.status(await this.row(db,owner,data.id));
    });
  }
  get(owner: string, id: string) { return this.transaction(async db => this.status(await this.row(db,owner,id))); }
  async list(owner: string) {
    const result = await this.pool.query(`SELECT ${fields} FROM private_tracks WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY id LIMIT 20`, [owner]);
    return { items: result.rows.map(row => trackStatus.parse(row)) };
  }
  readChunk(owner: string, id: string, sequence: number) {
    return this.transaction(async db => {
      await this.row(db,owner,id);
      const row = (await db.query('SELECT checksum,payload FROM private_track_chunks WHERE owner_id=$1 AND track_id=$2 AND sequence=$3', [owner,id,sequence])).rows[0];
      if (!row) throw missing();
      if (createHash('sha256').update(row.payload).digest('hex') !== row.checksum) throw new DomainError('INTEGRITY', 'Saved recording failed its integrity check.', 500);
      return { checksum: row.checksum as string, points: JSON.parse(row.payload) as z.infer<typeof trackChunk>['points'] };
    });
  }
  async putChunk(owner: string, id: string, sequence: number, input: unknown) {
    const data = trackChunk.parse(input);
    z.number().int().min(0).max(499).parse(sequence);
    let payload: string;
    try { payload = canonicalTrackPoints(data.points); } catch { throw new DomainError('INVALID', 'Track timestamps must increase within a chunk.', 400); }
    const checksum = createHash('sha256').update(payload).digest('hex');
    if (checksum !== data.checksum) throw new DomainError('INVALID', 'Track checksum does not match the points.', 400);
    return this.transaction(async db => {
      const row = await this.row(db,owner,id);
      const previous = (await db.query('SELECT checksum,payload FROM private_track_chunks WHERE owner_id=$1 AND track_id=$2 AND sequence=$3', [owner,id,sequence])).rows[0];
      if (previous) {
        if (previous.checksum !== checksum || previous.payload !== payload) throw conflict('Chunk conflicts with previously saved points.');
        return this.status(row);
      }
      if (row.completed || sequence !== row.nextChunk || sequence >= row.chunkCount) throw conflict('Upload chunks in order before completing the recording.');
      if (row.pointCount + data.points.length > row.expectedPoints) throw conflict('Upload exceeds its declared point count.');
      if (row.last_timestamp !== null && data.points[0].timestamp <= Number(row.last_timestamp)) throw conflict('Track timestamps must increase across chunks.');
      await db.query('INSERT INTO private_track_chunks(owner_id,track_id,sequence,checksum,payload) VALUES($1,$2,$3,$4,$5)', [owner,id,sequence,checksum,payload]);
      await db.query('UPDATE private_tracks SET next_chunk=next_chunk+1,point_count=point_count+$3,last_timestamp=$4 WHERE owner_id=$1 AND id=$2', [owner,id,data.points.length,data.points.at(-1)!.timestamp]);
      return this.status(await this.row(db,owner,id));
    });
  }
  complete(owner: string, id: string) {
    return this.transaction(async db => {
      const row = await this.row(db,owner,id);
      if (row.nextChunk !== row.chunkCount || row.pointCount !== row.expectedPoints) throw conflict('Upload all declared points before completing.');
      await db.query('UPDATE private_tracks SET completed=true WHERE owner_id=$1 AND id=$2', [owner,id]);
      return this.status({ ...row, completed: true });
    });
  }
  remove(owner: string, id: string) {
    return this.transaction(async db => {
      // Keep a minimal tombstone so delayed create/chunk retries cannot resurrect deleted GPS data.
      const row = (await db.query('SELECT id FROM private_tracks WHERE owner_id=$1 AND id=$2 FOR UPDATE', [owner,id])).rows[0];
      if (!row) throw missing();
      await db.query('DELETE FROM private_track_chunks WHERE owner_id=$1 AND track_id=$2', [owner,id]);
      await db.query("UPDATE private_tracks SET title='',last_timestamp=NULL,deleted_at=COALESCE(deleted_at,now()) WHERE owner_id=$1 AND id=$2", [owner,id]);
      return { deleted: true as const };
    });
  }
}
