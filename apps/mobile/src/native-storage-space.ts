import { LOCAL_STORAGE_RESERVE, requireStorageSpace, StorageSpaceError } from './storage-space';

export function checkNativeStorage(reserve = LOCAL_STORAGE_RESERVE): void {
  let available: unknown;
  try {
    const fs: typeof import('expo-file-system') = require('expo-file-system');
    available = fs.Paths.availableDiskSpace;
  } catch {
    throw new StorageSpaceError('Device storage could not be checked. Rebuild the updated native app if needed, then retry.');
  }
  requireStorageSpace(available, reserve);
}
