import test from 'node:test';
import assert from 'node:assert/strict';
import { ForegroundRecorder, type LocationCapture } from '../apps/mobile/src/foreground-recorder';
import type { TrackPoint, TrackSession } from '../apps/mobile/src/track-storage';

const tick = () => new Promise(resolve => setImmediate(resolve));
const point = (timestamp: number): TrackPoint => ({ timestamp, longitude: 77, latitude: 30, accuracy: 5, altitude: null });
function fixture() {
  const rows = new Map<string, TrackSession>();
  const writes: TrackPoint[] = [];
  let failWrite = false;
  let removed = 0;
  let granted = true;
  let receive!: (p: TrackPoint) => void;
  let failed!: () => void;
  const location: LocationCapture = {
    permission: async () => granted,
    watch: async (p, e) => { receive = p; failed = e; return { remove: () => { removed++; } }; },
  };
  const store = {
    create: async (id: string, title: string) => {
      const row: TrackSession = { id, title, state: 'recording', createdAt: 0, nextChunk: 0, pointCount: 0, lastTimestamp: null };
      rows.set(id, row); return row;
    },
    transition: async (id: string, state: TrackSession['state']) => {
      const row = { ...rows.get(id)!, state }; rows.set(id, row); return row;
    },
    appendFix: async (id: string, expectedCount: number, point: TrackPoint) => {
      if (failWrite) throw new Error('disk full');
      const row = rows.get(id)!;
      assert.equal(row.state, 'recording'); assert.equal(expectedCount, row.pointCount);
      writes.push(point);
      const saved = { ...row, nextChunk: Math.floor((row.pointCount + 1) / 200), pointCount: row.pointCount + 1, lastTimestamp: point.timestamp };
      rows.set(id, saved); return saved;
    },
  };
  const recorder = new ForegroundRecorder(store, location, () => {});
  return { recorder, rows, writes, location, get removed() { return removed; }, emit: (p: TrackPoint) => receive(p), fail: () => failed(), deny: () => { granted = false; }, failWrite: () => { failWrite = true; } };
}
test('permission denial creates no session or watcher', async () => {
  const f = fixture(); f.deny(); await f.recorder.begin({ id: 'a', title: 'Walk' });
  assert.equal(f.rows.size, 0); assert.equal(f.recorder.state.capturing, false);
  assert.match(f.recorder.state.message, /permission/);
});
test('pause drains accepted writes, filters inaccurate/duplicate fixes and ignores late callbacks', async () => {
  const f = fixture(); await f.recorder.begin({ id: 'a', title: 'Walk' });
  f.emit(point(10000)); f.emit(point(10000)); f.emit({ ...point(20000), accuracy: 101 }); f.emit(point(20000));
  await f.recorder.stop();
  assert.equal(f.writes.length, 2); assert.equal(f.rows.get('a')?.state, 'paused'); assert.equal(f.removed, 1);
  f.emit(point(30000)); await tick(); assert.equal(f.writes.length, 2);
  await f.recorder.begin({ resume: f.rows.get('a')! }); f.emit(point(30000)); await f.recorder.stop('finished');
  assert.equal(f.writes.length, 3); assert.equal(f.rows.get('a')?.state, 'finished');
});
test('background during permission request cannot start a late watcher', async () => {
  const f = fixture(); let resolve!: (value: boolean) => void;
  f.location.permission = () => new Promise(r => { resolve = r; });
  const start = f.recorder.begin({ id: 'a', title: 'Walk' });
  await f.recorder.stop(); resolve(true); await start;
  assert.equal(f.rows.size, 0); assert.equal(f.recorder.state.capturing, false);
});
test('background during watcher registration removes late subscription', async () => {
  const f = fixture(); let resolve!: (value: { remove(): void }) => void; let removed = false;
  f.location.watch = () => new Promise(r => { resolve = r; });
  const start = f.recorder.begin({ id: 'a', title: 'Walk' }); await tick();
  await f.recorder.stop(); resolve({ remove: () => { removed = true; } }); await start;
  assert.equal(removed, true); assert.equal(f.rows.get('a')?.state, 'paused');
});
test('write failure stops capture and preserves the previously committed count', async () => {
  const f = fixture(); await f.recorder.begin({ id: 'a', title: 'Walk' });
  f.emit(point(10000)); await tick(); f.failWrite(); f.emit(point(20000)); f.emit(point(30000)); await tick();
  assert.equal(f.writes.length, 1); assert.equal(f.recorder.state.capturing, false);
  assert.equal(f.rows.get('a')?.state, 'paused'); assert.match(f.recorder.state.message, /could not be saved/);
});
test('provider errors stop capture and old error callbacks cannot stop a resumed watcher', async () => {
  const f = fixture(); let oldFailure!: () => void;
  const watch = f.location.watch;
  f.location.watch = async (p, e) => { oldFailure = e; return watch(p, e); };
  await f.recorder.begin({ id: 'a', title: 'Walk' }); const stale = oldFailure;
  f.fail(); await tick(); assert.equal(f.recorder.state.capturing, false);
  await f.recorder.begin({ resume: f.rows.get('a')! }); stale(); await tick();
  assert.equal(f.recorder.state.capturing, true); await f.recorder.stop();
});
test('capacity pauses capture after the final durable point', async () => {
  const f = fixture(); await f.recorder.begin({ id: 'a', title: 'Walk' }); await f.recorder.stop();
  f.rows.set('a', { ...f.rows.get('a')!, nextChunk: 499, pointCount: 99999 });
  await f.recorder.begin({ resume: f.rows.get('a')! }); f.emit(point(10000)); await tick();
  assert.equal(f.recorder.state.capturing, false); assert.equal(f.rows.get('a')?.pointCount, 100000);
  assert.equal(f.rows.get('a')?.state, 'paused'); assert.match(f.recorder.state.message, /capacity/);
});
