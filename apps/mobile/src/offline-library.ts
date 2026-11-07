import { downloadProgress } from './offline-region';

export interface StoredMapPack {
  name: string;
  metadata?: unknown;
  status(): Promise<{ state: unknown; percentage: number | null; completedResourceSize?: number }>;
  pause(): Promise<void>;
}
export interface MapPackStore {
  getPacks(): Promise<StoredMapPack[]>;
  deletePack(name: string): Promise<void>;
}
export const MAX_MAP_DOWNLOADS = 10;
export class MapDownloadLimitError extends Error {}
let creationQueue: Promise<unknown> = Promise.resolve();

/** Serialize count-and-create across screens; existing regions do not use a new slot. */
export function createMapDownload(store: MapPackStore, name: string, create: () => Promise<void>): Promise<void> {
  const operation = creationQueue.then(async () => {
    if (!isTrekTribePack(name)) throw new Error('Unknown map download.');
    const packs = (await store.getPacks()).filter(p => isTrekTribePack(p.name));
    if (packs.some(p => p.name === name)) return;
    if (packs.length >= MAX_MAP_DOWNLOADS) {
      throw new MapDownloadLimitError(`You have ${MAX_MAP_DOWNLOADS} map areas on this device. Remove one in Profile → Map downloads before downloading another.`);
    }
    await create();
  });
  creationQueue = operation.catch(() => undefined);
  return operation;
}
export function recordedMapBytes(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function formatMapBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
export function isTrekTribePack(name: unknown): name is string {
  return typeof name === 'string' && /^trektribe-map-v1-[a-f0-9]{64}$/.test(name);
}
export async function listMapDownloads(store: MapPackStore) {
  const packs = (await store.getPacks()).filter(p => isTrekTribePack(p.name));
  return Promise.all(packs.map(async pack => {
    const metadata = pack.metadata as { title?: unknown } | undefined;
    const title = typeof metadata?.title === 'string' && metadata.title.trim()
      ? metadata.title.slice(0, 120) : `Map area ${pack.name.slice(-8)}`;
    try {
      const status = await pack.status();
      return { name: pack.name, title, progress: downloadProgress(status), bytes: recordedMapBytes(status.completedResourceSize), unavailable: false };
    } catch {
      // A damaged or unreadable pack must remain discoverable and removable.
      return { name: pack.name, title, progress: null, bytes: null, unavailable: true };
    }
  }));
}
export async function removeMapDownload(store: MapPackStore, name: string) {
  if (!isTrekTribePack(name)) throw new Error('Unknown map download.');
  const pack = (await store.getPacks()).find(p => p.name === name);
  if (!pack) return;
  // Already-stopped packs reject pause in the installed SDK.
  await pack.pause().catch(() => undefined);
  await store.deletePack(name);
}
