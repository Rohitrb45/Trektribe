import test from 'node:test';
import assert from 'node:assert/strict';
import { listMapDownloads, removeMapDownload, createMapDownload, MAX_MAP_DOWNLOADS, MapDownloadLimitError, recordedMapBytes, formatMapBytes, type StoredMapPack } from '../apps/mobile/src/offline-library';

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

test('concurrent new areas cannot both take the final download slot', async () => {
  const names = Array.from({ length: MAX_MAP_DOWNLOADS - 1 }, (_, i) => 'trektribe-map-v1-' + i.toString(16).padStart(64, '0'));
  const store = { getPacks: async () => names.map(name => pack({ name })), deletePack: async () => {} };
  const first = 'trektribe-map-v1-' + 'b'.repeat(64), second = 'trektribe-map-v1-' + 'c'.repeat(64);
  const results = await Promise.allSettled([first, second].map(id => createMapDownload(store, id, async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    names.push(id);
  })));
  assert.equal(names.length, MAX_MAP_DOWNLOADS);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = results.find(r => r.status === 'rejected');
  assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof MapDownloadLimitError);
  // Reusing an existing area at the limit must not create or count another pack.
  await createMapDownload(store, first, async () => { assert.fail('duplicate creation'); });
  names.pop();
  await createMapDownload(store, second, async () => { names.push(second); });
  assert.equal(names.length, MAX_MAP_DOWNLOADS);
});

test('failed inventory or creation does not poison later downloads', async () => {
  await assert.rejects(createMapDownload({ getPacks: async () => { throw Error('storage'); }, deletePack: async () => {} }, name, async () => { assert.fail('must not create'); }));
  const store = { getPacks: async () => [], deletePack: async () => {} };
  await assert.rejects(createMapDownload(store, name, async () => { throw Error('create failed'); }));
  let created = false;
  await createMapDownload(store, name, async () => { created = true; });
  assert.equal(created, true);
});

test('resource sizes distinguish unknown from zero and retain per-region accounting', async () => {
  for (const value of [undefined, null, NaN, Infinity, -1, '1024', 1.5]) assert.equal(recordedMapBytes(value), null);
  assert.equal(recordedMapBytes(0), 0);
  assert.equal(formatMapBytes(1024), '1.0 KiB');
  assert.equal(formatMapBytes(1048576), '1.0 MiB');
  const rows = await listMapDownloads({ getPacks: async () => [pack({ status: async () => ({ state: 'inactive', percentage: 20, completedResourceSize: 2048 }) })], deletePack: async () => {} });
  assert.equal(rows[0].bytes, 2048);
});
