import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import { PrivateTracks, trackCreate, trackChunk, trackStatus } from '../apps/api/src/private-tracks';
import { canonicalTrackPoints } from '../packages/core/src/track-points';
import { createApiClient } from '../apps/mobile/src/api/client';
import { createPrivateTrack, uploadPrivateTrackChunk, completePrivateTrack, removePrivateTrack } from '../apps/mobile/src/api/recordings';
const point = { longitude: 77, latitude: 30, timestamp: 1000, accuracy: 5, altitude: null };
test('private recording OpenAPI schemas stay aligned with strict server validators', () => {
  const doc = JSON.parse(readFileSync('api/core.openapi.json', 'utf8'));
  for (const [name, validator] of Object.entries({ TrackUploadCreate: trackCreate, TrackUploadChunk: trackChunk, TrackUploadStatus: trackStatus })) {
    const schema = z.toJSONSchema(validator); delete schema.$schema;
    assert.deepEqual(doc.components.schemas[name], schema);
  }
  assert.equal(trackCreate.safeParse({ id: randomUUID(), title: 'Walk', chunkCount: 1, pointCount: 1, ownerId: randomUUID() }).success, false);
});
test('bad checksums, unordered points and impossible totals fail before database access', async () => {
  const repo = new PrivateTracks({ connect: () => { throw new Error('Unexpected database access'); } } as unknown as Pool);
  const id = randomUUID();
  await assert.rejects(repo.putChunk(id, id, 0, { checksum: '0'.repeat(64), points: [point] }), /checksum/);
  await assert.rejects(repo.putChunk(id, id, 0, { checksum: '0'.repeat(64), points: [point,point] }), /timestamps/);
  await assert.rejects(repo.create(id, { id, title: 'Walk', chunkCount: 2, pointCount: 1 }), /totals/);
  assert.equal(trackChunk.safeParse({ checksum: 'a'.repeat(64), points: [{ ...point, latitude: 91 }] }).success, false);
});
test('generated upload adapter preserves IDs, sequences and canonical checksums across retries', async () => {
  const requests: Request[] = [];
  const client = createApiClient('https://example.test', () => 'token', async input => { requests.push(input as Request); return Response.json({}); });
  const id = randomUUID();
  const body = { points: [point], checksum: createHash('sha256').update(canonicalTrackPoints([point])).digest('hex') };
  await createPrivateTrack(client, { id, title: 'Walk', chunkCount: 1, pointCount: 1 });
  await uploadPrivateTrackChunk(client,id,0,body); await uploadPrivateTrackChunk(client,id,0,body);
  await completePrivateTrack(client,id); await removePrivateTrack(client,id);
  assert.equal(requests[1].url, `https://example.test/v1/me/recordings/${id}/chunks/0`);
  assert.deepEqual(await requests[1].json(), await requests[2].json());
  assert.deepEqual(await requests[4].json(), {});
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer token');
});
