import test from 'node:test';
import assert from 'node:assert/strict';
import { listMapDownloads, removeMapDownload, type StoredMapPack } from '../apps/mobile/src/offline-library';

const name = 'trektribe-map-v1-' + 'a'.repeat(64);
function pack(overrides: Partial<StoredMapPack> = {}): StoredMapPack {
  return { name, metadata: { title: 'Old route area' },
    status: async () => ({ state: 'complete', percentage: 100 }), pause: async () => {}, ...overrides };
}
test('library finds old route packs without a trail catalog and excludes unrelated regions', async () => {
  const rows = await listMapDownloads({ getPacks: async () => [pack(), pack({ name: 'another-app' })], deletePack: async () => {} });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Old route area');
  assert.equal(rows[0].progress?.complete, true);
});
test('legacy metadata and unreadable status still produce a removable library entry', async () => {
  const rows = await listMapDownloads({ getPacks: async () => [pack({ metadata: null, status: async () => { throw Error('disk'); } })], deletePack: async () => {} });
  assert.equal(rows[0].name, name);
  assert.equal(rows[0].title, 'Map area aaaaaaaa');
  assert.equal(rows[0].unavailable, true);
});
test('removal pauses first, tolerates already paused packs, and propagates deletion failure', async () => {
  const calls: string[] = [];
  const store = { getPacks: async () => [pack({ pause: async () => { calls.push('pause'); throw Error('already stopped'); } })],
    deletePack: async (id: string) => { assert.equal(id, name); calls.push('delete'); throw Error('storage failure'); } };
  await assert.rejects(removeMapDownload(store, name), /storage failure/);
  assert.deepEqual(calls, ['pause', 'delete']);
  await assert.rejects(removeMapDownload(store, 'another-app'), /Unknown/);
  assert.equal(calls.length, 2);
  await removeMapDownload({ ...store, getPacks: async () => [] }, name);
  assert.equal(calls.length, 2);
});
