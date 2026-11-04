import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { initializeSnapshots, listSnapshots, removeSnapshot, saveSnapshot, snapshotIdentity, type Snapshot, type SnapshotDatabase } from './trail-snapshots';

let database: Promise<SnapshotDatabase> | undefined;
async function open() {
  if (!database) database = (async () => {
    try {
      const sqlite: typeof import('expo-sqlite') = require('expo-sqlite');
      const db = await sqlite.openDatabaseAsync('trektribe-offline.db');
      await initializeSnapshots(db);
      return db;
    } catch {
      database = undefined;
      throw new Error('Offline storage could not open. Rebuild the native app if you have just updated it, then try again.');
    }
  })();
  try { return await database; } catch (error) { database = undefined; throw error; }
}
let queue: Promise<unknown> = Promise.resolve();
function write(task: (db: SnapshotDatabase) => Promise<void>) {
  const result = queue.then(async () => task(await open()));
  queue = result.catch(() => {});
  return result;
}
export const readOfflineTrails = async () => listSnapshots(await open());
export const deleteOfflineTrail = (key: string) => write(db => removeSnapshot(db, key));
export const storeOfflineTrail = (snapshot: Snapshot) => write(async db => {
  const key = await digestStringAsync(CryptoDigestAlgorithm.SHA256, snapshotIdentity(snapshot));
  await saveSnapshot(db, key, snapshot);
});
