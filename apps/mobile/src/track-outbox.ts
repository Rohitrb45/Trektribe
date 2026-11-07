import type { SnapshotDatabase } from './trail-snapshots';
import type { TrackStorage } from './track-storage';
import { canonicalTrackPoints, type TrackPoint } from '../../../packages/core/src/track-points';

export type UploadJob = { id: string; scope: string; sourceId: string; title: string; chunkCount: number; pointCount: number; nextChunk: number; state: 'queued' | 'uploaded' | 'delete-pending' };
export type UploadStatus = { id: string; title: string; chunkCount: number; expectedPoints: number; nextChunk: number; pointCount: number; completed: boolean };
export interface UploadConnection {
  scope: string;
  assertActive(): void;
  create(job: UploadJob): Promise<UploadStatus>;
  chunk(id: string, sequence: number, data: { checksum: string; points: TrackPoint[] }): Promise<UploadStatus>;
  complete(id: string): Promise<UploadStatus>;
  remove(id: string): Promise<unknown>;
}
const columns = 'id,scope,source_id AS sourceId,title,chunk_count AS chunkCount,point_count AS pointCount,next_chunk AS nextChunk,state';
export function uploadCredentialGuard(token: string, current: () => string, active: () => boolean) {
  return () => {
    if (!active() || current() !== token) throw new Error('Upload paused. Reopen uploads and sign in to the same account to retry.');
  };
}
export class TrackOutbox {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private db: SnapshotDatabase, private hash: (value: string) => Promise<string>, private checkSpace = () => {}) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work); this.queue = result.catch(() => {}); return result;
  }
  async initialize() {
    await this.db.execAsync(`CREATE TABLE IF NOT EXISTS track_upload_jobs_v1 (
      id TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL, source_id TEXT NOT NULL, title TEXT NOT NULL,
      chunk_count INTEGER NOT NULL, point_count INTEGER NOT NULL, next_chunk INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL CHECK(state IN ('queued','uploaded','delete-pending')), UNIQUE(scope,source_id));
      CREATE TABLE IF NOT EXISTS track_upload_chunks_v1 (
      job_id TEXT NOT NULL, sequence INTEGER NOT NULL, checksum TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY(job_id,sequence));`);
  }
  async list(scope: string) {
    await this.queue;
    return this.db.getAllAsync<UploadJob>(`SELECT ${columns} FROM track_upload_jobs_v1 WHERE scope=? ORDER BY rowid DESC`, scope);
  }
  prepare(scope: string, id: string, sourceId: string, source: TrackStorage) {
    return this.serial(async () => {
      if (!scope || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid upload identity.');
      const [existing] = await this.db.getAllAsync<UploadJob>(`SELECT ${columns} FROM track_upload_jobs_v1 WHERE scope=? AND source_id=?`, scope, sourceId);
      if (existing) {
        if (existing.state === 'delete-pending') throw new Error('Retry the pending server deletion before preparing another upload.');
        return existing;
      }
      this.checkSpace();
      const row = (await source.list()).find(r => r.id === sourceId);
      if (!row || row.state !== 'finished' || !row.pointCount) throw new Error('Finish a nonempty recording before uploading it.');
      const chunks: { payload: string; checksum: string }[] = [];
      let count = 0, last = -1;
      const add = async (points: TrackPoint[]) => {
        const payload = canonicalTrackPoints(points);
        if (points[0].timestamp <= last) throw new Error('Recording timestamps are out of order.');
        last = points[points.length - 1].timestamp; count += points.length;
        chunks.push({ payload, checksum: await this.hash(payload) });
      };
      for (let n = 0; n < row.nextChunk; n++) await add(await source.readChunk(sourceId,n));
      const tail = await source.readPending(sourceId); if (tail.length) await add(tail);
      if (count !== row.pointCount || !chunks.length || chunks.length > 500) throw new Error('Saved recording totals do not match its points.');
      await this.db.withExclusiveTransactionAsync(async tx => {
        this.checkSpace();
        const jobs = await tx.getAllAsync<{ id: string }>('SELECT id FROM track_upload_jobs_v1');
        if (jobs.length >= 20) throw new Error('Remove an upload entry before adding another (20 per device).');
        await tx.runAsync("INSERT INTO track_upload_jobs_v1(id,scope,source_id,title,chunk_count,point_count,state) VALUES(?,?,?,?,?,?,'queued')", id,scope,sourceId,row.title,String(chunks.length),String(count));
        for (let n = 0; n < chunks.length; n++) {
          this.checkSpace();
          await tx.runAsync('INSERT INTO track_upload_chunks_v1 VALUES(?,?,?,?)',id,String(n),chunks[n].checksum,chunks[n].payload);
        }
      });
      return (await this.db.getAllAsync<UploadJob>(`SELECT ${columns} FROM track_upload_jobs_v1 WHERE id=?`,id))[0];
    });
  }
  private async job(scope: string, id: string) {
    const [job] = await this.db.getAllAsync<UploadJob>(`SELECT ${columns} FROM track_upload_jobs_v1 WHERE id=? AND scope=?`,id,scope);
    if (!job) throw new Error('This upload belongs to a different account/API or was removed.');
    return job;
  }
  requestRemoval(scope: string, id: string) {
    return this.serial(async () => {
      await this.job(scope,id);
      // Persist deletion intent before any request; retry it after reconnect/restart.
      await this.db.runAsync("UPDATE track_upload_jobs_v1 SET state='delete-pending' WHERE id=? AND scope=?",id,scope);
    });
  }
  run(connection: UploadConnection, id: string) {
    return this.serial(async () => {
      const job = await this.job(connection.scope,id);
      connection.assertActive();
      if (job.state === 'delete-pending') {
        await connection.remove(id);
        await this.db.withExclusiveTransactionAsync(async tx => {
          await tx.runAsync('DELETE FROM track_upload_chunks_v1 WHERE job_id=?',id);
          await tx.runAsync('DELETE FROM track_upload_jobs_v1 WHERE id=? AND scope=?',id,connection.scope);
        });
        return;
      }
      if (job.state === 'uploaded') return;
      const verify = (status: UploadStatus) => {
        if (status.id !== id || status.title !== job.title || status.chunkCount !== job.chunkCount || status.expectedPoints !== job.pointCount || !Number.isInteger(status.nextChunk) || status.nextChunk < 0 || status.nextChunk > job.chunkCount || !Number.isInteger(status.pointCount) || status.pointCount < 0 || status.pointCount > job.pointCount) throw new Error('Server upload metadata does not match the saved copy.');
        return status;
      };
      let status = verify(await connection.create(job));
      // Reconcile with server progress, including a chunk whose acknowledgment was lost.
      let acknowledgedPoints = 0;
      for (let n = 0; n < job.chunkCount; n++) {
        connection.assertActive();
        const [chunk] = await this.db.getAllAsync<{ checksum: string; payload: string }>('SELECT checksum,payload FROM track_upload_chunks_v1 WHERE job_id=? AND sequence=?',id,String(n));
        if (!chunk || await this.hash(chunk.payload) !== chunk.checksum) throw new Error('Queued recording failed its integrity check. Remove this upload entry and prepare a new copy.');
        const points: TrackPoint[] = JSON.parse(canonicalTrackPoints(JSON.parse(chunk.payload)));
        acknowledgedPoints += points.length;
        if (n < status.nextChunk) {
          if (n === status.nextChunk - 1 && acknowledgedPoints !== status.pointCount) throw new Error('Server point count does not match acknowledged chunks.');
          continue;
        }
        connection.assertActive();
        status = verify(await connection.chunk(id,n,{ checksum: chunk.checksum, points }));
        if (status.nextChunk !== n + 1 || status.pointCount !== acknowledgedPoints) throw new Error('Server did not acknowledge the expected chunk.');
        await this.db.runAsync('UPDATE track_upload_jobs_v1 SET next_chunk=? WHERE id=?',String(status.nextChunk),id);
      }
      connection.assertActive();
      status = verify(await connection.complete(id));
      if (!status.completed || status.pointCount !== job.pointCount || status.nextChunk !== job.chunkCount) throw new Error('Server has not completed the recording.');
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.runAsync("UPDATE track_upload_jobs_v1 SET state='uploaded',next_chunk=chunk_count WHERE id=?",id);
        // Retain the remote deletion handle, but discard the redundant local upload payloads.
        await tx.runAsync('DELETE FROM track_upload_chunks_v1 WHERE job_id=?',id);
      });
    });
  }
}
