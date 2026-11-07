import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { TrackStorage } from './track-storage';
import { checkNativeStorage } from './native-storage-space';

let store: Promise<TrackStorage> | undefined;
/** Native capture will share this singleton; loading it does not request location permission. */
export async function openTrackStorage(): Promise<TrackStorage> {
  if (!store) store = (async () => {
    const sqlite: typeof import('expo-sqlite') = require('expo-sqlite');
    const db = await sqlite.openDatabaseAsync('trektribe-tracks.db');
    try {
      const repository = new TrackStorage(db, text => digestStringAsync(CryptoDigestAlgorithm.SHA256, text), checkNativeStorage);
      await repository.initialize();
      return repository;
    } catch (error) { await db.closeAsync(); throw error; }
  })();
  try { return await store; } catch (error) { store = undefined; throw error; }
}
