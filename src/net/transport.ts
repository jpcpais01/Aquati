// Ship to ship: WebRTC data channels between the host's game and each guest's.
// The host sits at the hub (a star): guests talk only to the host, and the host
// passes on whatever one guest says to the others. Two channels per guest:
//   'r'  reliable and ordered: spawns, broadsides, hits, sinkings (JSON)
//   'u'  unreliable and unordered: the ships' positions, many times a second
//        (binary; a late one is worthless, the next is already on its way)
// A crew is the host and up to three guests.

import { getSignal, SignalError } from './signal';

export const MAX_CREW = 4;

export interface Wire {
  k: string;
  /** Sender's place in the crew (set by the transport). */
  f?: number;
  /** Only for this captain (the host passes it on to them alone). */
  to?: number;
  [key: string]: unknown;
}

const env = import.meta.env;
function iceServers(): RTCIceServer[] {
  const list: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  // a relay for networks that won't let two browsers meet directly (optional)
  if (env.VITE_TURN_URLS) list.push({ urls: String(env.VITE_TURN_URLS).split(',').map((s) => s.trim()), username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  return list;
}

/** A spoken-aloud code: no 0/O, 1/I/L, 5/S or 2/Z to mix up. */
const ALPHABET = 'ABCDEFGHJKMNPQRTUVWXY346789';
export const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join('');
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

/** Waits for the browser to gather every route it can offer (or gives up waiting and sends what it has). */
function gathered(pc: RTCPeerConnection, ms = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }
    function check() {
      if (pc.iceGatheringState === 'complete') done();
    }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

const CHUNK = 15000;

class Peer {
  r: RTCDataChannel | null = null;
  u: RTCDataChannel | null = null;
  rtt = 120;
  heard = performance.now();
  private parts = new Map<string, string[]>();
  private lostT = 0;

  constructor(readonly pc: RTCPeerConnection, public idx: number, public name: string) {}

  send(m: Wire) {
    const r = this.r;
    if (!r || r.readyState !== 'open') return;
    const s = JSON.stringify(m);
    if (s.length <= CHUNK) return r.send(s);
    // big messages (a hand-painted flag rides along with a ship) go in pieces
    const id = Math.random().toString(36).slice(2, 8);
    const n = Math.ceil(s.length / CHUNK);
    for (let i = 0; i < n; i++) r.send(JSON.stringify({ k: '~c', id, i, n, s: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
  }

  sendRaw(data: ArrayBuffer | Uint8Array) {
    const u = this.u;
    // a congested link drops a frame of positions rather than queueing stale ones
    if (!u || u.readyState !== 'open' || u.bufferedAmount > 48_000) return;
    u.send(data as ArrayBuffer);
  }

  /** Reassembles pieces; the whole message once its last piece is in. */
  take(raw: string): Wire | null {
    const m = JSON.parse(raw) as Wire;
    if (m.k !== '~c') return m;
    const id = m.id as string;
    let p = this.parts.get(id);
    if (!p) this.parts.set(id, (p = new Array(m.n as number)));
    p[m.i as number] = m.s as string;
    for (let i = 0; i < p.length; i++) if (p[i] === undefined) return null;
    this.parts.delete(id);
    return JSON.parse(p.join('')) as Wire;
  }

  /** True once the link has been lost long enough to give up on it. */
  lost(now: number) {
    const st = this.pc.connectionState;
    if (st === 'failed' || st === 'closed') return true;
    if (st === 'disconnected') {
      if (!this.lostT) this.lostT = now;
      return now - this.lostT > 8000;
    }
    this.lostT = 0;
    return now - this.heard > 12_000;
  }

  close() {
    try {
      this.r?.close();
      this.u?.close();
      this.pc.close();
    } catch {
      /* already gone */
    }
  }
}

export class Session {
  /** Everyone aboard, by place (0 is the host), with their names. */
  readonly roster = new Map<number, string>();
  /** Fired for every message from another captain. */
  onMsg: (from: number, m: Wire) => void = () => {};
  /** Positions from another captain's ships. */
  onState: (data: ArrayBuffer) => void = () => {};
  /** A guest came aboard (host only: time to tell them about the world). */
  onJoin: (idx: number) => void = () => {};
  /** Someone left (their ships go with them). */
  onLeave: (idx: number, name: string) => void = () => {};
  /** The roster changed. */
  onRoster: () => void = () => {};
  /** The session is over for us (the host left, or the link died). */
  onClosed: (why: string) => void = () => {};
  private peers = new Map<number, Peer>();
  private pingT = 0;
  private closed = false;

  private constructor(readonly role: 'host' | 'guest', public me: number, readonly code: string, readonly name: string) {
    this.roster.set(me, name);
  }

  get isHost() {
    return this.role === 'host';
  }

  get size() {
    return this.roster.size;
  }

  /** Round trip to the host (guests) or the slowest guest (host), ms. */
  get rtt() {
    let r = 0;
    for (const p of this.peers.values()) r = Math.max(r, p.rtt);
    return r;
  }

  rttTo(idx: number) {
    return this.peers.get(idx)?.rtt ?? this.peers.get(0)?.rtt ?? 120;
  }

  // ---------------------------------------------------------------- hosting

  static async host(name: string, code = makeCode()): Promise<Session> {
    const s = new Session('host', 0, code, name);
    await getSignal().open(code, name, (k) => s.answer(k.pid, k.name, k.offer));
    return s;
  }

  private async answer(_pid: string, name: string, offer: string): Promise<string | null> {
    if (this.closed) return null;
    let idx = 1;
    while (idx < MAX_CREW && (this.peers.has(idx) || this.roster.has(idx))) idx++;
    if (idx >= MAX_CREW) return null;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const peer = new Peer(pc, idx, name.slice(0, 24) || 'Captain');
    this.peers.set(idx, peer);
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      ch.binaryType = 'arraybuffer';
      if (ch.label === 'r') {
        peer.r = ch;
        ch.onopen = () => this.admit(peer);
        ch.onmessage = (ev) => this.fromGuest(peer, ev.data as string);
        ch.onclose = () => this.drop(peer.idx);
      } else {
        peer.u = ch;
        ch.onmessage = (ev) => {
          peer.heard = performance.now();
          const data = ev.data as ArrayBuffer;
          this.onState(data);
          // pass a guest's positions on to the other guests
          for (const o of this.peers.values()) if (o !== peer) o.sendRaw(data);
        };
      }
    };
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
    } catch (e) {
      console.warn('[mp] answer failed', e);
      this.peers.delete(idx);
      pc.close();
      return null;
    }
    // a guest who never makes it through is let go
    setTimeout(() => {
      if (this.peers.get(idx) === peer && !this.roster.has(idx)) this.drop(idx);
    }, 25_000);
    return pc.localDescription!.sdp;
  }

  private admit(peer: Peer) {
    if (this.closed) return;
    this.roster.set(peer.idx, peer.name);
    peer.send({ k: '~w', you: peer.idx, roster: [...this.roster] });
    this.broadcastRoster();
    getSignal().count(this.roster.size);
    this.onJoin(peer.idx);
  }

  private broadcastRoster() {
    const m: Wire = { k: '~r', roster: [...this.roster] };
    for (const p of this.peers.values()) if (this.roster.has(p.idx)) p.send(m);
    this.onRoster();
  }

  private fromGuest(peer: Peer, raw: string) {
    peer.heard = performance.now();
    const m = peer.take(raw);
    if (!m) return;
    if (m.k === '~p') return peer.send({ k: '~q', t: m.t });
    if (m.k === 'bye') return this.drop(peer.idx);
    if (m.k === '~q') {
      peer.rtt = peer.rtt * 0.6 + (performance.now() - (m.t as number)) * 0.4;
      return;
    }
    m.f = peer.idx;
    const to = m.to;
    if (to === undefined || to === 0) this.onMsg(peer.idx, m);
    if (to === 0) return;
    for (const o of this.peers.values()) if (o !== peer && (to === undefined || o.idx === to) && this.roster.has(o.idx)) o.send(m);
  }

  // ---------------------------------------------------------------- joining

  static async join(code: string, name: string): Promise<Session> {
    const sig = getSignal();
    const pid = Math.random().toString(36).slice(2, 12);
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const r = pc.createDataChannel('r', { ordered: true });
    const u = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
    r.binaryType = u.binaryType = 'arraybuffer';
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const answer = await sig.knock(code, pid, name, pc.localDescription!.sdp, 30_000);
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    } catch (e) {
      pc.close();
      throw e instanceof SignalError ? e : new SignalError("Couldn't set up the link. Try again.");
    }
    const host = new Peer(pc, 0, '');
    host.r = r;
    host.u = u;
    return new Promise<Session>((resolve, reject) => {
      const t = setTimeout(() => {
        pc.close();
        reject(new SignalError("Couldn't reach the host's ship. A strict network (some office or mobile ones) can block the link."));
      }, 20_000);
      r.onmessage = (ev) => {
        host.heard = performance.now();
        const m = host.take(ev.data as string);
        if (!m || m.k !== '~w') return;
        clearTimeout(t);
        const s = new Session('guest', m.you as number, code, name);
        s.peers.set(0, host);
        s.setRoster(m.roster as [number, string][]);
        host.name = s.roster.get(0) ?? 'Captain';
        r.onmessage = (e2) => s.fromHost(host, e2.data as string);
        r.onclose = () => s.end('The link to the host was lost.');
        u.onmessage = (e2) => {
          host.heard = performance.now();
          s.onState(e2.data as ArrayBuffer);
        };
        resolve(s);
      };
    });
  }

  private setRoster(list: [number, string][]) {
    const before = new Map(this.roster);
    this.roster.clear();
    for (const [i, n] of list) this.roster.set(i, n);
    for (const [i, n] of before) if (!this.roster.has(i) && i !== this.me) this.onLeave(i, n);
    this.onRoster();
  }

  private fromHost(host: Peer, raw: string) {
    host.heard = performance.now();
    const m = host.take(raw);
    if (!m) return;
    if (m.k === '~p') return host.send({ k: '~q', t: m.t });
    if (m.k === '~q') {
      host.rtt = host.rtt * 0.6 + (performance.now() - (m.t as number)) * 0.4;
      return;
    }
    if (m.k === '~r') return this.setRoster(m.roster as [number, string][]);
    if (m.k === '~x') return this.end((m.why as string) || 'The host ended the voyage.');
    this.onMsg(m.f ?? 0, m);
  }

  // ---------------------------------------------------------------- talking

  /** Reliable: to everyone, or to one captain. */
  send(m: Wire, to?: number) {
    m.f = this.me;
    if (to !== undefined) m.to = to;
    if (this.isHost) {
      for (const p of this.peers.values()) if (this.roster.has(p.idx) && (to === undefined || p.idx === to)) p.send(m);
    } else this.peers.get(0)?.send(m);
  }

  /** Unreliable positions to everyone. */
  sendState(data: ArrayBuffer | Uint8Array) {
    for (const p of this.peers.values()) if (this.roster.has(p.idx) || !this.isHost) p.sendRaw(data);
  }

  /** Keeps the links honest: pings, and lets go of any that died. */
  tick() {
    if (this.closed) return;
    const now = performance.now();
    if (now - this.pingT > 2000) {
      this.pingT = now;
      for (const p of this.peers.values()) p.send({ k: '~p', t: now });
    }
    for (const p of [...this.peers.values()]) {
      if (!p.lost(now)) continue;
      if (this.isHost) this.drop(p.idx);
      else this.end('The link to the host was lost.');
    }
  }

  private drop(idx: number) {
    const p = this.peers.get(idx);
    if (!p) return;
    this.peers.delete(idx);
    p.close();
    const name = this.roster.get(idx);
    if (name === undefined) return;
    this.roster.delete(idx);
    getSignal().count(this.roster.size);
    this.onLeave(idx, name);
    this.broadcastRoster();
  }

  /** The host turns a guest out (or a guest's game told us they left). */
  kick(idx: number) {
    this.peers.get(idx)?.send({ k: '~x', why: 'The host sent you back to harbour.' });
    setTimeout(() => this.drop(idx), 200);
  }

  private end(why: string) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.peers.values()) p.close();
    this.peers.clear();
    this.onClosed(why);
  }

  /** Leave (a guest) or end the voyage for everyone (the host). */
  async close() {
    if (this.closed) return;
    if (this.isHost) {
      for (const p of this.peers.values()) p.send({ k: '~x', why: 'The host ended the voyage.' });
      await getSignal().close();
    } else this.peers.get(0)?.send({ k: 'bye' });
    // a moment for the farewell to get out of the door
    await new Promise((r) => setTimeout(r, 150));
    this.closed = true;
    for (const p of this.peers.values()) p.close();
    this.peers.clear();
  }

  get ended() {
    return this.closed;
  }
}
