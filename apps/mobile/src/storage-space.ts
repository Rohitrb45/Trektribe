export const LOCAL_STORAGE_RESERVE = 64 * 1024 * 1024;
export const MAP_STORAGE_RESERVE = 256 * 1024 * 1024;
export class StorageSpaceError extends Error {}
/** A preflight reserve, not an allocation or a guarantee against concurrent disk use. */
export function requireStorageSpace(available: unknown, reserve = LOCAL_STORAGE_RESERVE) {
  if (typeof available !== 'number' || !Number.isSafeInteger(available) || available < 0) {
    throw new StorageSpaceError('Available device storage could not be checked. Try again before saving or downloading.');
  }
  if (available < reserve) throw new StorageSpaceError(`Free at least ${Math.ceil(reserve / (1024 * 1024))} MiB on this device before continuing. Saved items can still be viewed or removed.`);
}
