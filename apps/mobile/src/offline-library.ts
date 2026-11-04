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
      return { name: pack.name, title, progress: downloadProgress(status), unavailable: false };
    } catch {
      // A damaged or unreadable pack must remain discoverable and removable.
      return { name: pack.name, title, progress: null, unavailable: true };
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
