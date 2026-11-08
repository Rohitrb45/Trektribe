import { isTrekTribePack, type MapPackStore } from './offline-library';
import { downloadProgress } from './offline-region';

/** One foreground sweep. No deletion or automatic resume; callers serialize sweeps. */
export async function monitorMapStorage(store: Pick<MapPackStore, 'getPacks'>, checkSpace: () => void, active = () => true): Promise<string> {
  try { checkSpace(); return ''; } catch { /* Unknown space is also unsafe to continue downloading. */ }
  if (!active()) return '';
  const packs = await store.getPacks();
  let failures = 0;
  for (const pack of packs) {
    if (!active()) return '';
    if (!isTrekTribePack(pack.name)) continue;
    let needsPause = true;
    try {
      const progress = downloadProgress(await pack.status());
      needsPause = !progress.complete && progress.active;
    } catch { /* Try to stop a pack whose state cannot be read. */ }
    if (!active()) return '';
    if (needsPause) {
      try { await pack.pause(); } catch { failures++; }
    }
  }
  return failures
    ? 'Device storage is low or unavailable. Some map downloads could not be paused. Stop or remove them in Map downloads and free space.'
    : 'Map downloads paused or kept stopped because device storage is low or unavailable. Free at least 256 MiB, then resume downloads manually.';
}
