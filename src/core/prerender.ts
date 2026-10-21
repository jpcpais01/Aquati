// Music played from tape instead of live. A generative song is rendered a few
// seconds at a time in an OfflineAudioContext (its own thread, no deadline)
// and the finished pieces are laid end to end on the live context, so the
// real-time audio thread only ever plays a stereo buffer or two. Each piece
// renders the notes that start inside it plus their full ring-out, and the
// pieces overlap and sum, so the joins are seamless: mixing is linear.

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

const Offline: OfflineCtor | undefined =
  typeof window === 'undefined' ? undefined : window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext;

const probed = new Map<number, boolean>();

/** Whether this browser can render offline at `sr` (old Safari only takes the hardware rates). */
export function canPrerender(sr: number) {
  let ok = probed.get(sr);
  if (ok === undefined) {
    try {
      ok = !!Offline && !!new Offline(2, 128, sr);
    } catch {
      ok = false;
    }
    probed.set(sr, ok);
  }
  return ok;
}

/** The notes of a song, handed out a stretch at a time. Pieces are asked for in order, once each. */
export interface ChunkSource {
  /** Seconds of output the notes starting in [from, to) need, ring-out included (0: nothing there), and whether any notes come later. */
  span(from: number, to: number): { len: number; more: boolean };
  /** Schedules those notes into `dest`, times measured from `from`. */
  render(ctx: OfflineAudioContext, dest: AudioNode, from: number, to: number): void;
}

function renderOffline(oc: OfflineAudioContext): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    oc.oncomplete = (e) => resolve(e.renderedBuffer);
    try {
      const p = oc.startRendering() as Promise<AudioBuffer> | undefined;
      p?.then(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

/** One song streaming from offline renders into a live bus. */
export class ChunkStream {
  /** Context time the song started (set once the first piece is ready). */
  t0 = -1;
  /** Context time the last piece has rung out; Infinity until the song's end is known. */
  end = Infinity;
  stopped = false;
  failed = false;
  private gain: GainNode;
  private from = 0;
  private busy = false;
  private done = false;
  private live = new Set<AudioBufferSourceNode>();
  /** When the latest-ringing piece so far falls silent. */
  private ring = 0;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
    private src: ChunkSource,
    /** `pre`: seconds of lead-in each piece is rendered with, for notes that start a hair early. */
    private o: { sr: number; chunk: number; lead: number; startAt: number; pre?: number },
  ) {
    this.gain = ctx.createGain();
    this.gain.connect(out);
    this.pump();
  }

  /** Renders the next piece once it is within `lead` seconds of being needed. One render at a time. */
  pump(_until?: number) {
    if (this.busy || this.done || this.stopped) return;
    if (this.t0 >= 0 && this.t0 + this.from - this.ctx.currentTime > this.o.lead) return;
    const from = this.from;
    const to = from + this.o.chunk;
    this.from = to;
    const { len, more } = this.src.span(from, to);
    if (!more) this.done = true;
    if (len <= 0) {
      if (this.done) this.finish();
      else this.pump();
      return;
    }
    let oc: OfflineAudioContext;
    try {
      oc = new Offline!(2, Math.ceil(len * this.o.sr), this.o.sr);
      this.src.render(oc, oc.destination, from, to);
    } catch (err) {
      this.fail(err);
      return;
    }
    this.busy = true;
    renderOffline(oc).then(
      (buf) => {
        this.busy = false;
        if (this.stopped) return;
        const ctx = this.ctx;
        const pre = this.o.pre ?? 0;
        if (this.t0 < 0) this.t0 = Math.max(this.o.startAt, ctx.currentTime + 0.05 + pre);
        this.play(buf, this.t0 + from - pre);
        this.ring = Math.max(this.ring, this.t0 + from - pre + buf.duration);
        if (this.done) this.end = this.ring;
        this.pump();
      },
      (err) => {
        this.busy = false;
        this.fail(err);
      },
    );
  }

  private finish() {
    this.end = Math.max(this.ring, this.ctx.currentTime);
  }

  private fail(err: unknown) {
    console.warn('[aquati] music render failed:', err);
    this.failed = true;
    this.done = true;
    this.end = Math.max(this.ring, this.ctx.currentTime);
  }

  private play(buf: AudioBuffer, at: number) {
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.02;
    // a piece that arrives late joins mid-phrase rather than shifting the whole song
    const skip = Math.max(0, now - at);
    if (skip >= buf.duration) return;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(this.gain);
    s.start(at + skip, skip);
    this.live.add(s);
    s.onended = () => {
      this.live.delete(s);
      s.disconnect();
    };
  }

  /** Fades the song out from `at` over `len` seconds and lets it go. */
  fade(at: number, len: number) {
    this.stopped = true;
    const g = this.gain.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(0, at + len);
    for (const s of this.live) s.stop(at + len + 0.05);
    const gain = this.gain;
    window.setTimeout(() => gain.disconnect(), Math.max(0, at + len - this.ctx.currentTime) * 1000 + 400);
  }

  /** Lets what is already playing ring out; nothing more is rendered. */
  release(_at?: number) {
    this.stopped = true;
  }
}
