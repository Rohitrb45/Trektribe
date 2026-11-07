import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { TrackOutbox } from './track-outbox';
import { checkNativeStorage } from './native-storage-space';
let outbox: Promise<TrackOutbox> | undefined;
export async function openTrackOutbox() {
  if (!outbox) outbox = (async () => {
    const sqlite: typeof import('expo-sqlite') = require('expo-sqlite');
    const db = await sqlite.openDatabaseAsync('trektribe-uploads.db');
    try {
      const queue = new TrackOutbox(db, text => digestStringAsync(CryptoDigestAlgorithm.SHA256,text), checkNativeStorage);
      await queue.initialize(); return queue;
    } catch (e) { await db.closeAsync(); throw e; }
  })();
  try { return await outbox; } catch (e) { outbox = undefined; throw e; }
}
