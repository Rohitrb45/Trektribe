import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { openTrackStorage } from './native-track-store';
import { ForegroundRecorder, type RecorderState } from './foreground-recorder';
import type { TrackSession, TrackStorage } from './track-storage';
import { Button, s } from './ui';
import RouteMap from './RouteMap';
import TrackUploads from './TrackUploads';

export default function Recordings() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('My walk');
  const [rows, setRows] = useState<TrackSession[]>([]);
  const [state, setState] = useState<RecorderState>({ session: null, capturing: false, busy: false, message: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; points: [number, number][] } | null>(null);
  const repository = useRef<TrackStorage | null>(null);
  const recorder = useRef<ForegroundRecorder | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const opened = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', next => {
      if (next !== 'active') void recorder.current?.stop('paused', 'Recording paused because the app left the foreground. Resume when ready.');
    });
    const blur = AppState.addEventListener('blur', () => {
      void recorder.current?.stop('paused', 'Recording paused because the app lost focus. Resume when ready.');
    });
    return () => { mounted.current = false; listener.remove(); blur.remove(); void recorder.current?.stop(); };
  }, []);
  async function load() {
    if (!repository.current) repository.current = await openTrackStorage();
    if (!recorder.current) recorder.current = new ForegroundRecorder(repository.current, {
      permission: async () => {
        const location: typeof import('expo-location') = require('expo-location');
        if (!await location.hasServicesEnabledAsync()) throw new Error('Turn on device location services before recording.');
        return (await location.requestForegroundPermissionsAsync()).granted;
      },
      watch: async (point, failed) => {
        const location: typeof import('expo-location') = require('expo-location');
        return location.watchPositionAsync({ accuracy: location.Accuracy.High, timeInterval: 10000, distanceInterval: 5 }, fix => {
          if (fix.coords.accuracy === null) return;
          point({ longitude: fix.coords.longitude, latitude: fix.coords.latitude, timestamp: Math.floor(fix.timestamp), accuracy: fix.coords.accuracy, altitude: fix.coords.altitude });
        }, failed);
      },
    }, next => { if (mounted.current) setState(next); });
    setRows(await repository.current.list());
  }
  async function act(action?: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await load(); if (!mounted.current) return; if (action) await action(); setRows(await repository.current!.list()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Recording storage is unavailable. Rebuild the updated native app if needed, check free space, and retry.'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function inspect(row: TrackSession) {
    await recorder.current!.stop();
    const latest = (await repository.current!.list()).find(saved => saved.id === row.id);
    if (!latest) throw new Error('This recording is no longer available.');
    row = latest;
    const points: [number, number][] = [];
    // Bound map geometry while reading every chunk through its integrity check.
    const stride = Math.max(1, Math.ceil(row.pointCount / 5000));
    let index = 0;
    for (let n = 0; n < row.nextChunk; n++) for (const p of await repository.current!.readChunk(row.id, n)) {
      if (index++ % stride === 0) points.push([p.longitude, p.latitude]);
    }
    for (const p of await repository.current!.readPending(row.id)) {
      if (index++ % stride === 0) points.push([p.longitude, p.latitude]);
    }
    setPreview({ title: row.title, points });
  }
  function close() {
    // Closing must work even when storage failed or another action is in flight.
    opened.current = false;
    void recorder.current?.stop();
    setVisible(false); setPreview(null);
  }
  return <>
    <Button title={state.capturing ? 'Recording — open controls' : 'Record a walk'} quiet onPress={() => { opened.current = true; setVisible(true); void act(); }} />
    <Modal visible={visible} onRequestClose={close}>
      <SafeAreaView style={{ flex: 1 }}><ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Button title="Close and pause" quiet onPress={close} />
        <Text style={s.title}>Recordings</Text>
        <Text style={s.bodySmall}>Records only while this screen stays open and the app is in the foreground. Closing it, switching apps or locking the screen pauses capture. Resume manually. Recordings stay on this device, accessible without signing in, unless you explicitly upload a private copy below.</Text>
        <Text style={s.bodySmall}>Up to 100,000 saved points per new recording. Older recordings may have fewer available slots. Poor fixes are ignored; updates are at least 10 seconds apart. Only points confirmed as saved survive an interruption.</Text>
        {!!error && <Text accessibilityRole="alert">{error}</Text>}
        {!!state.message && <Text accessibilityLiveRegion="polite">{state.message}</Text>}
        <Text style={s.body}>{state.capturing ? 'Recording' : 'Capture stopped'} · {state.session?.pointCount ?? 0} confirmed saved points</Text>
        <TextInput accessibilityLabel="Recording name" value={title} onChangeText={setTitle} maxLength={200} style={{ borderWidth: 1, borderColor: '#aaa', padding: 12 }} />
        <Button title="Start recording" disabled={busy || state.busy || state.capturing || !title.trim()} onPress={() => { void act(async () => { if (opened.current && AppState.currentState === 'active') await recorder.current!.begin({ id: randomUUID(), title }); }); }} />
        <Button title="Refresh recordings" quiet disabled={busy} onPress={() => { void act(); }} />
        {rows.map(stored => {
          const row = stored.id === state.session?.id ? state.session : stored;
          return <View key={row.id} style={s.panel}>
            <Text style={s.sectionTitle}>{row.title}</Text><Text>{row.state} · {row.pointCount} saved points</Text>
            {row.state === 'recording' && <Button title="Pause" disabled={busy} onPress={() => { void act(() => recorder.current!.stop()); }} />}
            {row.state === 'paused' && <Button title="Resume" disabled={busy || state.busy || state.capturing || row.nextChunk >= 500} onPress={() => { void act(async () => { if (opened.current && AppState.currentState === 'active') await recorder.current!.begin({ resume: row }); }); }} />}
            {row.state !== 'finished' && <Button title="Finish" disabled={busy || (state.capturing && state.session?.id !== row.id)} onPress={() => { void act(async () => { if (state.session?.id === row.id) await recorder.current!.stop('finished'); else await repository.current!.transition(row.id, 'finished'); }); }} />}
            <Button title="View recorded route" quiet disabled={busy || state.capturing || row.pointCount < 2} onPress={() => { void act(() => inspect(row)); }} />
            <Button title="Delete local recording" quiet disabled={busy || state.capturing || state.busy} onPress={() => Alert.alert('Delete recording?', 'This removes the original local recording. A queued upload keeps its own copy; use Private uploads to remove queued/server copies.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void act(async () => { await repository.current!.remove(row.id); recorder.current!.forget(row.id); setPreview(null); }); } }])} />
          </View>;
        })}
        {preview && <><Text style={s.sectionTitle}>{preview.title}</Text><View style={{ height: 300 }}><RouteMap key={preview.title + preview.points.length} points={preview.points} /></View><Text style={s.bodySmall}>Lines connect saved positions, including across pauses; they are not a continuous recorded path. Terrain requires network access or a downloaded map area.</Text></>}
        <TrackUploads rows={rows} source={repository.current} active={visible && !busy && !state.capturing && !state.busy} onRestored={async () => { setRows(await repository.current!.list()); }} />
      </ScrollView></SafeAreaView>
    </Modal>
  </>;
}
