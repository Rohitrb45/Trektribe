import test from 'node:test';
import assert from 'node:assert/strict';
import { requireStorageSpace, LOCAL_STORAGE_RESERVE, MAP_STORAGE_RESERVE, StorageSpaceError } from '../apps/mobile/src/storage-space';

test('disk reserve accepts exact boundary and rejects low or unreadable capacity', () => {
  requireStorageSpace(LOCAL_STORAGE_RESERVE);
  requireStorageSpace(MAP_STORAGE_RESERVE, MAP_STORAGE_RESERVE);
  for (const value of [undefined, null, NaN, Infinity, -1, 1.2, '999999999', LOCAL_STORAGE_RESERVE - 1]) {
    assert.throws(() => requireStorageSpace(value), StorageSpaceError);
  }
  assert.throws(() => requireStorageSpace(LOCAL_STORAGE_RESERVE, MAP_STORAGE_RESERVE), /256 MiB/);
});
