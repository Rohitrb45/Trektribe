import { canonicalTrackPoints, type TrackPoint } from '../../../packages/core/src/track-points';
import type { TrackStorage } from './track-storage';
import type { UploadStatus } from './track-outbox';
export interface RestoreConnection {
  scope: string;
  assertActive(): void;
  get(id: string): Promise<UploadStatus>;
  read(id: string, sequence: number): Promise<{ checksum: string; points: TrackPoint[] }>;
}
export async function restorePrivateTrack(connection: RestoreConnection, id: string, store: TrackStorage, hash: (text: string) => Promise<string>) {
  connection.assertActive();
  const info = await connection.get(id);
  if (info.id !== id || !info.completed || !Number.isInteger(info.chunkCount) || info.chunkCount < 1 || info.chunkCount > 500 || info.nextChunk !== info.chunkCount || !Number.isInteger(info.pointCount) || info.pointCount < 1 || info.pointCount > 100000 || info.expectedPoints !== info.pointCount) throw new Error('Only complete, valid server recordings can be restored.');
  const chunks: TrackPoint[][] = [];
  let count = 0;
  for (let n = 0; n < info.chunkCount; n++) {
    connection.assertActive();
    const chunk = await connection.read(id,n);
    const payload = canonicalTrackPoints(chunk.points);
    if (await hash(payload) !== chunk.checksum) throw new Error('Downloaded recording failed its integrity check. No local copy was saved.');
    chunks.push(JSON.parse(payload)); count += chunk.points.length;
  }
  if (count !== info.pointCount) throw new Error('Downloaded point count does not match the server recording.');
  connection.assertActive();
  // Account/API-bound identity prevents accidental merging across accounts or servers.
  const localId = 'restore-' + await hash(JSON.stringify([connection.scope,id]));
  return store.restoreFinished(localId,info.title,chunks,connection.assertActive);
}
