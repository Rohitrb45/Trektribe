import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { configuredMaps } from './native-map-sdk';
import { listMapDownloads, removeMapDownload, MAX_MAP_DOWNLOADS, formatMapBytes } from './offline-library';
import { Button, Label, s } from './ui';

export default function DownloadLibrary() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMapDownloads>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const active = useRef(true), lock = useRef(false);
  async function refresh(remove?: string) {
    if (!configuredMaps || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const store = configuredMaps.offlineManager;
      if (remove) await removeMapDownload(store, remove);
      const result = await listMapDownloads(store);
      if (active.current) { setRows(result); setLoaded(true); }
    } catch {
      if (active.current) setError('Unable to update map downloads. Refresh to try again.');
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    active.current = true;
    void refresh();
    return () => { active.current = false; };
  }, []);
  return <View style={s.panel}>
    <Label>MAP DOWNLOADS</Label>
    <Text style={s.bodySmall}>Map areas on this device, shared across its accounts. Removing an area does not remove your saved trail. Cached tiles may remain.</Text>
    {!configuredMaps ? <Text style={s.bodySmall}>A configured native map build is required.</Text> : <>
      {!!error && <Text accessibilityRole="alert" style={s.bodySmall}>{error}</Text>}
      <Button title={busy ? 'Updating downloads…' : 'Refresh downloads'} quiet disabled={busy} onPress={() => void refresh()} />
      {loaded && <Text style={s.bodySmall}>{rows.length} of {MAX_MAP_DOWNLOADS} map areas · {formatMapBytes(rows.reduce((sum, row) => sum + (row.bytes ?? 0), 0))} reported resources{rows.some(row => row.bytes === null) ? ' (some sizes unavailable)' : ''}. Shared resources may be counted more than once; this is not total device storage usage.</Text>}
      {loaded && !rows.length && <Text style={s.bodySmall}>No downloaded map areas. Open a trail to download its map.</Text>}
      {rows.map(row => <View key={row.name} style={{ gap: 8 }}>
        <Text style={s.body}>{row.title}</Text>
        <Text style={s.bodySmall}>{row.bytes === null ? 'Size unavailable' : `${formatMapBytes(row.bytes)} reported resources`}</Text>
        <Text style={s.bodySmall}>{row.unavailable ? 'Status unavailable' : row.progress?.complete ? 'Downloaded' : `${Math.floor(row.progress?.percentage ?? 0)}% downloaded`} · Area {row.name.slice(-8)}</Text>
        <Button title={`Remove ${row.title}`} quiet disabled={busy} onPress={() => void refresh(row.name)} />
      </View>)}
    </>}
  </View>;
}
