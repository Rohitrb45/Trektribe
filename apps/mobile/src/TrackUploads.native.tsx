import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Text, View } from 'react-native';
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import type { TrackSession, TrackStorage } from './track-storage';
import type { UploadJob, UploadStatus } from './track-outbox';
import { restorePrivateTrack } from './track-restore';
import { openTrackOutbox } from './native-track-outbox';
import { connectTrackUpload } from './track-upload-connection';
import { Button, s } from './ui';

export default function TrackUploads({ rows, source, active, onRestored }: { rows: TrackSession[]; source: TrackStorage | null; active: boolean; onRestored: () => Promise<void> }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [remote, setRemote] = useState<(UploadStatus & { scope: string })[]>([]);
  const [account, setAccount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const enabled = useRef(active); enabled.current = active;
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') generation.current++; });
    return () => { generation.current++; enabled.current = false; listener.remove(); };
  }, []);
  useEffect(() => { if (!active) { generation.current++; setJobs([]); setRemote([]); setAccount(''); } }, [active]);
  async function action(work?: (connection: Awaited<ReturnType<typeof connectTrackUpload>>, outbox: Awaited<ReturnType<typeof openTrackOutbox>>) => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setJobs([]); setRemote([]); setAccount('');
    const ticket = generation.current;
    try {
      const connection = await connectTrackUpload(() => ticket === generation.current && enabled.current && AppState.currentState === 'active');
      const outbox = await openTrackOutbox();
      setAccount(connection.accountName);
      try { await work?.(connection,outbox); }
      finally {
        connection.assertActive(); setJobs(await outbox.list(connection.scope));
        const result = await connection.list(); connection.assertActive();
        setRemote(result.items.map(item => ({...item,scope:connection.scope})));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload interrupted. Retry when connected.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function prepare(row: TrackSession) {
    let identity: { scope: string; accountName: string } | undefined;
    await action(async connection => { identity = { scope:connection.scope,accountName:connection.accountName }; });
    if (!identity || !enabled.current) return;
    const confirmed = identity;
    Alert.alert('Upload this recording?', `Send the GPS points in “${row.title}” to the private account “${confirmed.accountName}”? Local recordings are shared on this device; confirm this is the intended account.`, [
      { text:'Cancel', style:'cancel' },
      { text:'Upload privately', onPress: () => { void action(async (connection,outbox) => {
        if (connection.scope !== confirmed.scope) throw new Error('Account changed. Confirm this upload again.');
        if (!source) throw new Error('Recording storage is unavailable.');
        const job = await outbox.prepare(connection.scope,randomUUID(),row.id,source);
        connection.assertActive(); await outbox.run(connection,job.id);
      }); } },
    ]);
  }
  return <View style={{ gap: 10 }}>
    <Text style={s.sectionTitle}>Private uploads</Text>
    <Text style={s.bodySmall}>Only finished recordings can be uploaded. Uploads run when you choose Upload or Retry while this screen stays open. Closing or changing accounts stops further requests; a request already sent may finish. Local deletion does not delete a server copy.</Text>
    <Button title="Load this account's uploads" disabled={busy || !active} onPress={() => { void action(); }} />
    {!!account && <Text>Account: {account}</Text>}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {busy && <Text accessibilityLiveRegion="polite">Working on private uploads…</Text>}
    {rows.filter(row => row.state === 'finished' && row.pointCount > 0).map(row => <Button key={row.id} title={`Upload “${row.title}” privately`} disabled={busy || !active} onPress={() => prepare(row)} />)}
    {jobs.map(job => <View key={job.id} style={s.panel}>
      <Text>{job.title}: {job.state === 'uploaded' ? 'Uploaded privately' : job.state === 'delete-pending' ? 'Server deletion pending' : `${job.nextChunk}/${job.chunkCount} chunks acknowledged`}</Text>
      {job.state !== 'uploaded' && <Button title={job.state === 'delete-pending' ? 'Retry server deletion' : 'Retry upload'} disabled={busy || !active} onPress={() => { void action(async (connection,outbox) => { if (connection.scope !== job.scope) throw new Error('Reload uploads for the current account.'); await outbox.run(connection,job.id); }); }} />}
      <Button title="Remove server copy and upload entry" quiet disabled={busy || !active} onPress={() => Alert.alert('Remove private upload?', 'This removes the server copy (including an incomplete upload) and this upload entry after acknowledgment. Your original local recording stays.', [
        { text:'Cancel', style:'cancel' }, { text:'Remove', style:'destructive', onPress: () => { void action(async (connection,outbox) => {
          if (connection.scope !== job.scope) throw new Error('Reload uploads for the current account.');
          await outbox.requestRemoval(connection.scope,job.id); await outbox.run(connection,job.id);
        }); } },
      ])} />
    </View>)}
    {!!remote.length && <Text style={s.sectionTitle}>Recordings on this account</Text>}
    <Text style={s.bodySmall}>Restore downloads a finished recording to this device. Local copies are accessible without sign-in. Restoring again reuses the same local copy; it does not change the server recording.</Text>
    {remote.map(item => <View key={item.id} style={s.panel}>
      <Text>{item.title} · {item.pointCount} points · {item.completed ? 'Complete' : 'Upload incomplete'}</Text>
      {item.completed && <Button title="Restore to this device" disabled={busy || !active} onPress={() => Alert.alert('Restore recording?', 'Download these GPS points to this device? The local copy will remain accessible after sign-out.', [
        {text:'Cancel',style:'cancel'}, {text:'Restore',onPress:()=>{void action(async connection=>{
          if(connection.scope!==item.scope) throw new Error('Account changed. Reload and confirm the restore again.');
          if(!source) throw new Error('Recording storage is unavailable.');
          await restorePrivateTrack(connection,item.id,source,text=>digestStringAsync(CryptoDigestAlgorithm.SHA256,text));
          await onRestored();
        });}},
      ])} />}
    </View>)}
  </View>;
}
