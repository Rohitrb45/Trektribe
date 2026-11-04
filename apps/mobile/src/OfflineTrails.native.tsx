import React, { useRef, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SaveOfflineTrailProps } from './OfflineTrails';
import { makeSnapshot, type Snapshot } from './trail-snapshots';
import { readOfflineTrails, storeOfflineTrail, deleteOfflineTrail } from './snapshot-store';
import { Button, s } from './ui';
import RouteMap from './RouteMap';

export function SaveOfflineTrail({ trek, source }: SaveOfflineTrailProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await storeOfflineTrail(makeSnapshot(trek, source)); setMessage('Saved. Open Offline trails to view this copy.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save this trail.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View style={{ padding: 16, gap: 8 }}>
    <Text style={s.bodySmall}>Save route details on this device, accessible even when signed out. Download the map area separately for offline terrain.</Text>
    <Button title={busy ? 'Saving…' : 'Save offline copy'} onPress={save} disabled={busy} />
    {!!message && <Text accessibilityLiveRegion="polite" style={s.bodySmall}>{message}</Text>}
  </View>;
}
export default function OfflineTrails() {
  const [visible, setVisible] = useState(false);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof readOfflineTrails>>>([]);
  const [selected, setSelected] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function refresh(remove?: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { if (remove) await deleteOfflineTrail(remove); setRows(await readOfflineTrails()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Offline storage is unavailable.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <SafeAreaView edges={['top']}><Button title="Offline trails" quiet onPress={() => { setSelected(null); setVisible(true); void refresh(); }} /></SafeAreaView>
    <Modal visible={visible} onRequestClose={() => setVisible(false)}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Button title="Close offline trails" quiet onPress={() => setVisible(false)} />
          <Text style={s.title}>Offline trails</Text>
          <Text style={s.bodySmall}>Copies saved on this device are available without signing in. They may be outdated. Removing a copy does not remove its downloaded map.</Text>
          {!!error && <Text accessibilityRole="alert" style={s.body}>{error}</Text>}
          {selected ? <>
            <Button title="Back to saved copies" quiet onPress={() => setSelected(null)} />
            <Text style={s.sectionTitle}>{selected.title}</Text>
            <Text style={s.bodySmall}>Saved {new Date(selected.savedAt).toLocaleString()}</Text>
            <View style={{ height: 300 }}><RouteMap points={selected.route} /></View>
            <Text style={s.body}>{selected.region} · {selected.difficulty} · {selected.distanceKm} km · {selected.elevationM} m ascent · {selected.duration}</Text>
            <Text style={s.body}>{selected.description}</Text>
            <Text style={s.bodySmall}>Terrain requires a previously downloaded map area. The route outline is included in this copy.</Text>
          </> : <>
            <Button title={busy ? 'Loading…' : 'Refresh saved copies'} onPress={() => { void refresh(); }} disabled={busy} />
            {!busy && !error && !rows.length && <Text style={s.body}>No offline trails yet. Open a trail and choose Save offline copy.</Text>}
            {rows.map(row => <View key={row.key} style={s.panel}>
              <Text style={s.sectionTitle}>{row.snapshot?.title ?? 'Unreadable saved copy'}</Text>
              {row.snapshot && <><Text style={s.bodySmall}>Saved {new Date(row.snapshot.savedAt).toLocaleString()}</Text><Button title="View saved trail" onPress={() => setSelected(row.snapshot)} /></>}
              <Button title="Remove saved copy" quiet disabled={busy} onPress={() => { void refresh(row.key); }} />
            </View>)}
          </>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}
