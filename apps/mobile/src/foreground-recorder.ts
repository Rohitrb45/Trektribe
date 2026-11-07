import { canonicalTrackPoints, TRACK_LIMITS, type TrackPoint, type TrackSession, type TrackStorage } from './track-storage';

export interface LocationCapture {
  permission(): Promise<boolean>;
  watch(point: (point: TrackPoint) => void, failed: () => void): Promise<{ remove(): void }>;
}
export type RecorderState = { session: TrackSession | null; capturing: boolean; busy: boolean; message: string };
type Store = Pick<TrackStorage, 'create' | 'append' | 'transition'>;
/** Foreground only. Every accepted fix is committed as a chunk; no volatile point buffer. */
export class ForegroundRecorder {
  state: RecorderState = { session: null, capturing: false, busy: false, message: '' };
  private generation = 0;
  private subscription?: { remove(): void };
  private pending: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private writeFailed = false;
  constructor(private store: Store, private location: LocationCapture, private changed: (state: RecorderState) => void) {}
  private update(patch: Partial<RecorderState>) { this.state = { ...this.state, ...patch }; this.changed(this.state); }
  private detach() {
    this.generation++;
    this.subscription?.remove(); this.subscription = undefined;
    this.update({ capturing: false });
  }
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const operation = this.pending.then(task);
    this.pending = operation.catch(() => {});
    return operation;
  }
  async begin(input: { id: string; title: string } | { resume: TrackSession }) {
    if (this.state.busy || this.state.capturing) return;
    const ticket = ++this.generation;
    this.update({ busy: true, message: '' });
    let session: TrackSession | undefined;
    try {
      if (!await this.location.permission()) throw new Error('Location permission is required. Enable it in device settings to record.');
      if (ticket !== this.generation) return;
      await this.pending;
      if (ticket !== this.generation) return;
      this.writeFailed = false;
      if ('resume' in input && input.resume.nextChunk >= TRACK_LIMITS.chunks) throw new Error('This recording has reached 500 saved updates. Finish it and start another.');
      session = 'resume' in input ? await this.store.transition(input.resume.id, 'recording') : await this.store.create(input.id, input.title);
      this.update({ session });
      if (ticket !== this.generation) { await this.pauseStored(); return; }
      // Accept immediate callbacks while the native watch promise is resolving.
      this.update({ capturing: true });
      const subscription = await this.location.watch(p => this.receive(ticket, p), () => {
        if (ticket === this.generation) void this.stop('paused', 'Location is unavailable. Capture stopped; check permission and location services before resuming.');
      });
      if (ticket !== this.generation) { subscription.remove(); return; }
      this.subscription = subscription;
    } catch (e) {
      this.detach();
      await this.pending;
      if (session) await this.pauseStored();
      this.update({ message: e instanceof Error ? e.message : 'Could not start location capture. Rebuild the native app if it was updated.' });
    } finally { this.update({ busy: false }); }
  }
  private async pauseStored() {
    if (this.state.session?.state !== 'recording') return;
    try { this.update({ session: await this.store.transition(this.state.session.id, 'paused') }); }
    catch { this.update({ message: 'Capture stopped, but its paused state could not be saved. Retry Pause; committed points remain stored.' }); }
  }
  private receive(ticket: number, input: TrackPoint) {
    if (ticket !== this.generation || !this.state.capturing || this.queued >= 10) return;
    let point: TrackPoint;
    try { point = JSON.parse(canonicalTrackPoints([input]))[0]; } catch { return; }
    if (point.accuracy > 100) return;
    this.queued++;
    void this.enqueue(async () => {
      const s = this.state.session;
      if (!s || s.state !== 'recording' || this.writeFailed) return;
      if (point.timestamp < s.createdAt || (s.lastTimestamp !== null && point.timestamp - s.lastTimestamp < 10000)) return;
      try {
        const saved = await this.store.append(s.id, s.nextChunk, [point]);
        this.update({ session: saved });
        if (saved.nextChunk >= TRACK_LIMITS.chunks) {
          this.writeFailed = true;
          this.detach(); await this.pauseStored();
          this.update({ message: '500 updates saved. Finish this recording and start another to continue.' });
        }
      } catch {
        this.writeFailed = true;
        this.detach(); await this.pauseStored();
        this.update({ message: 'The latest location could not be saved. Capture stopped; earlier committed points remain stored. Check device storage before resuming.' });
      }
    }).finally(() => { this.queued--; });
  }
  async stop(target: 'paused' | 'finished' = 'paused', message = '') {
    this.detach();
    if (message) this.update({ message });
    await this.enqueue(async () => {
      if (!this.state.session || this.state.session.state === 'finished') return;
      try { this.update({ session: await this.store.transition(this.state.session.id, target) }); }
      catch { this.update({ message: 'Capture stopped, but the session status could not be saved. Retry the action.' }); }
    });
  }
  forget(id: string) {
    if (!this.state.busy && !this.state.capturing && this.state.session?.id === id) this.update({ session: null });
  }
}
