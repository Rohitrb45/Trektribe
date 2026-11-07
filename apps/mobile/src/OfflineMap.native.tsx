import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import type { OfflineMapProps } from './OfflineMap';
import { offlineRegion, downloadProgress } from './offline-region';
import { Button, s } from './ui';
import { configuredMaps as maps } from './native-map-sdk';
import { createMapDownload, MapDownloadLimitError } from './offline-library';
import { checkNativeStorage } from './native-storage-space';
import { MAP_STORAGE_RESERVE, StorageSpaceError } from './storage-space';

export default function OfflineMap({ points, title }: OfflineMapProps) {
  const [name, setName] = useState('');
  const [exists, setExists] = useState(false);
  const [progress, setProgress] = useState({ percentage: 0, complete: false, active: false });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const lock = useRef(false);
  const alive = useRef(true);
  const paused = useRef(false);
  const accepting = useRef(true);
  function failed(message: string) {
    if (alive.current && accepting.current && !paused.current && !/cancel/i.test(message)) {
      setProgress(p => ({ ...p, active: false }));
      setError('Map download interrupted. Resume when connected or remove the download.');
    }
  }
  const signature = JSON.stringify(points);
  useEffect(() => {
    let cancelled = false;
    let packName = '';
    alive.current = true;
    setBusy(true); setName(''); setError(''); setExists(false);
    const manager = maps?.offlineManager;
    if (!manager) { setBusy(false); return; }
    void (async () => {
      const region = offlineRegion(points);
      packName = 'trektribe-map-v1-' + await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(region));
      if (cancelled) return;
      const pack = await manager.getPack(packName);
      if (cancelled) return;
      await manager.subscribe(packName, (_pack, status) => {
        if (!cancelled && accepting.current) { setExists(true); setProgress(downloadProgress(status)); }
      }, (_pack, event) => { if (!cancelled) failed(event.message); });
      if (cancelled) { manager.unsubscribe(packName); return; }
      setExists(!!pack); setName(packName);
      if (pack) {
        const status = await pack.status();
        if (cancelled) return;
        setProgress(downloadProgress(status));
      }
    })().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to read map downloads.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; alive.current = false; if (packName) manager.unsubscribe(packName); };
  }, [signature, refresh]);

  async function act(action: 'download' | 'pause' | 'remove') {
    if (!maps || !name || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const manager = maps.offlineManager;
    try {
      const pack = await manager.getPack(name);
      if (action === 'remove') {
        accepting.current = false;
        if (pack) {
          // Stop any in-flight transfer before removing its region. The SDK
          // rejects pause for an already stopped pack, which is safe here.
          await pack.pause().catch(() => undefined);
          await manager.deletePack(name);
        }
        manager.unsubscribe(name);
        if (alive.current) { setExists(false); setProgress({ percentage: 0, complete: false, active: false }); }
      } else if (action === 'pause') {
        paused.current = true;
        if (pack) await pack.pause();
        if (alive.current) setProgress(p => ({ ...p, active: false }));
      } else {
        checkNativeStorage(MAP_STORAGE_RESERVE);
        accepting.current = true;
        paused.current = false;
        if (alive.current) setProgress(p => ({ ...p, active: true }));
        if (pack) await pack.resume();
        else await createMapDownload(manager, name, () => manager.createPack({ ...offlineRegion(points), name, metadata: { title: title?.slice(0, 120) ?? 'Map area' } }, (_pack, status) => {
          if (alive.current && accepting.current) { setExists(true); setProgress(downloadProgress(status)); }
        }, (_pack, event) => failed(event.message)));
        if (alive.current) setExists(true);
      }
    } catch (error) { accepting.current = true; if (alive.current) { setProgress(p => ({ ...p, active: false })); setError(error instanceof MapDownloadLimitError || error instanceof StorageSpaceError ? error.message : 'Could not update the map download. Check connectivity and available storage, then try again.'); } }
    finally {
      lock.current = false;
      if (alive.current) setBusy(false);
      else manager.unsubscribe(name);
    }
  }
  if (!maps) return <Text style={s.bodySmall}>Map downloads require a configured native build.</Text>;
  return <View style={{ gap: 8 }}>
    <Text style={s.bodySmall}>Download this map area for this device (zoom levels 10–14). Uses network data and device storage. Save an offline trail copy separately for route details. Starting or resuming requires 256 MiB of free device storage.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.bodySmall}>{error}</Text>}
    {exists && <Text style={s.bodySmall}>{progress.complete ? 'Map area downloaded' : `${Math.floor(progress.percentage)}% downloaded`}</Text>}
    {!progress.complete && <Button title={progress.active ? 'Downloading map area…' : exists ? 'Resume map download' : 'Download map area'} disabled={busy || !name || progress.active} onPress={() => void act('download')} />}
    {exists && !progress.complete && <Button title="Pause download" quiet disabled={busy || !name} onPress={() => void act('pause')} />}
    {exists && <Button title="Remove map download" quiet disabled={busy || !name} onPress={() => void act('remove')} />}
    <Button title="Refresh download status" quiet disabled={busy} onPress={() => setRefresh(value => value + 1)} />
  </View>;
}
