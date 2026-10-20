// The handshake that puts two captains in touch: a guest leaves an offer under
// the voyage's code, the host's game answers it, and from then on the ships
// talk straight to each other (see transport.ts). Nothing of the game itself
// ever passes through here.
//
// Firestore layout (firestore.rules):
//   rooms/{CODE}               { host, open, n, v, t, exp }   the voyage, while it's hosted
//   rooms/{CODE}/peers/{pid}   { name, offer, answer?, t, exp } one knock on the door
//
// `?mplocal` swaps Firestore for a BroadcastChannel, so two tabs of the same
// browser can sail together with no Firebase at all (development and tests).

import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { CONFIG } from '../cloud/cloud';

export interface Knock {
  pid: string;
  name: string;
  offer: string;
}

export interface Signal {
  /** Opens the voyage under `code`; `onKnock` answers each guest's offer. */
  open(code: string, host: string, onKnock: (k: Knock) => Promise<string | null>): Promise<void>;
  /** How many captains are aboard (shown to anyone looking the code up). */
  count(n: number): void;
  close(): Promise<void>;
  /** Looks the code up: the host's name, or why it can't be joined. */
  find(code: string): Promise<{ host: string } | { error: string }>;
  /** Leaves an offer at the door and waits for the host's answer. */
  knock(code: string, pid: string, name: string, offer: string, timeoutMs: number): Promise<string>;
}

export const signalReady = () => !!CONFIG || LOCAL;

const LOCAL = typeof location !== 'undefined' && /[?&]mplocal\b/.test(location.search);
const DAY = 24 * 3600 * 1000;

export class SignalError extends Error {}

const friendly = (e: unknown) => {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'permission-denied') return "Multiplayer isn't switched on for this game yet.";
  if (code === 'unavailable') return "Can't reach the harbour. Check your connection.";
  return 'Something went wrong reaching the harbour. Try again.';
};

class FirestoreSignal implements Signal {
  private db: Promise<{ fs: typeof import('firebase/firestore'); db: Firestore }>;
  private unsub: Unsubscribe | null = null;
  private code = '';
  private answered = new Set<string>();

  constructor() {
    this.db = (async () => {
      const [{ getApps, initializeApp }, fs] = await Promise.all([import('firebase/app'), import('firebase/firestore')]);
      const app = getApps()[0] ?? initializeApp(CONFIG!);
      return { fs, db: fs.getFirestore(app) };
    })();
  }

  async open(code: string, host: string, onKnock: (k: Knock) => Promise<string | null>) {
    const { fs, db } = await this.db;
    this.code = code;
    try {
      await fs.setDoc(fs.doc(db, 'rooms', code), { host, open: true, n: 1, v: 1, t: fs.serverTimestamp(), exp: fs.Timestamp.fromMillis(Date.now() + DAY) });
    } catch (e) {
      throw new SignalError(friendly(e));
    }
    this.unsub = fs.onSnapshot(fs.collection(db, 'rooms', code, 'peers'), (snap) => {
      for (const ch of snap.docChanges()) {
        if (ch.type !== 'added') continue;
        const d = ch.doc.data() as { name?: string; offer?: string; answer?: string };
        const pid = ch.doc.id;
        if (!d.offer || d.answer || this.answered.has(pid)) continue;
        this.answered.add(pid);
        void onKnock({ pid, name: String(d.name ?? 'Captain').slice(0, 24), offer: d.offer }).then((answer) => {
          if (answer) return fs.updateDoc(ch.doc.ref, { answer });
          return fs.deleteDoc(ch.doc.ref);
        }).catch((e) => console.warn('[mp] answer', e));
      }
    }, (e) => console.warn('[mp] door', e));
  }

  count(n: number) {
    const code = this.code;
    if (!code) return;
    void this.db.then(({ fs, db }) => fs.updateDoc(fs.doc(db, 'rooms', code), { n })).catch(() => {});
  }

  async close() {
    this.unsub?.();
    this.unsub = null;
    const code = this.code;
    this.code = '';
    if (!code) return;
    const { fs, db } = await this.db;
    await fs.deleteDoc(fs.doc(db, 'rooms', code)).catch(() => {});
  }

  async find(code: string) {
    try {
      const { fs, db } = await this.db;
      const snap = await fs.getDoc(fs.doc(db, 'rooms', code));
      const d = snap.data() as { host?: string; open?: boolean; n?: number } | undefined;
      if (!d || !d.open) return { error: 'No voyage sails under that code. Check it with your host.' };
      if ((d.n ?? 1) >= 4) return { error: 'That crew is full (four captains).' };
      return { host: String(d.host ?? 'Captain') };
    } catch (e) {
      return { error: friendly(e) };
    }
  }

  async knock(code: string, pid: string, name: string, offer: string, timeoutMs: number) {
    const { fs, db } = await this.db;
    const ref = fs.doc(db, 'rooms', code, 'peers', pid);
    try {
      await fs.setDoc(ref, { name, offer, t: fs.serverTimestamp(), exp: fs.Timestamp.fromMillis(Date.now() + DAY) });
    } catch (e) {
      throw new SignalError(friendly(e));
    }
    return new Promise<string>((resolve, reject) => {
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        off();
        fn();
      };
      const timer = setTimeout(() => finish(() => {
        void fs.deleteDoc(ref).catch(() => {});
        reject(new SignalError("The host didn't answer. Are they still in the game?"));
      }), timeoutMs);
      const off = fs.onSnapshot(ref, (s) => {
        const d = s.data() as { answer?: string } | undefined;
        if (d?.answer) finish(() => {
          // the door is shut behind us: nothing of the handshake lingers
          void fs.deleteDoc(ref).catch(() => {});
          resolve(d.answer!);
        });
        else if (!s.exists()) finish(() => reject(new SignalError('The host turned the offer away.')));
      }, (e) => finish(() => reject(new SignalError(friendly(e)))));
    });
  }
}

type LocalMsg =
  | { k: 'room'; code: string; host: string; n: number }
  | { k: 'ask'; code: string }
  | { k: 'gone'; code: string }
  | { k: 'offer'; code: string; pid: string; name: string; offer: string }
  | { k: 'answer'; code: string; pid: string; answer: string | null };

/** Same handshake over a BroadcastChannel: tabs of one browser find each other. */
class LocalSignal implements Signal {
  private ch = new BroadcastChannel('aquati-mp');
  private code = '';
  private host = '';
  private n = 1;
  private onKnock: ((k: Knock) => Promise<string | null>) | null = null;
  private waits = new Map<string, (a: string | null) => void>();
  private finds: ((m: LocalMsg) => void)[] = [];

  constructor() {
    this.ch.onmessage = (e) => {
      const m = e.data as LocalMsg;
      if (m.k === 'ask' && m.code === this.code) this.post({ k: 'room', code: this.code, host: this.host, n: this.n });
      else if (m.k === 'offer' && m.code === this.code && this.onKnock) {
        void this.onKnock({ pid: m.pid, name: m.name, offer: m.offer }).then((answer) => this.post({ k: 'answer', code: m.code, pid: m.pid, answer }));
      } else if (m.k === 'answer') this.waits.get(m.pid)?.(m.answer);
      else if (m.k === 'room') this.finds.forEach((f) => f(m));
    };
  }

  private post(m: LocalMsg) {
    this.ch.postMessage(m);
  }

  async open(code: string, host: string, onKnock: (k: Knock) => Promise<string | null>) {
    this.code = code;
    this.host = host;
    this.onKnock = onKnock;
  }

  count(n: number) {
    this.n = n;
  }

  async close() {
    if (this.code) this.post({ k: 'gone', code: this.code });
    this.code = '';
    this.onKnock = null;
  }

  find(code: string) {
    return new Promise<{ host: string } | { error: string }>((resolve) => {
      const f = (m: LocalMsg) => {
        if (m.k !== 'room' || m.code !== code) return;
        clearTimeout(t);
        this.finds.splice(this.finds.indexOf(f), 1);
        resolve(m.n >= 4 ? { error: 'That crew is full (four captains).' } : { host: m.host });
      };
      const t = setTimeout(() => {
        this.finds.splice(this.finds.indexOf(f), 1);
        resolve({ error: 'No voyage sails under that code. Check it with your host.' });
      }, 1500);
      this.finds.push(f);
      this.post({ k: 'ask', code });
    });
  }

  knock(code: string, pid: string, name: string, offer: string, timeoutMs: number) {
    return new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => {
        this.waits.delete(pid);
        reject(new SignalError("The host didn't answer. Are they still in the game?"));
      }, timeoutMs);
      this.waits.set(pid, (a) => {
        clearTimeout(t);
        this.waits.delete(pid);
        if (a) resolve(a);
        else reject(new SignalError('The host turned the offer away.'));
      });
      this.post({ k: 'offer', code, pid, name, offer });
    });
  }
}

let signal: Signal | null = null;
export function getSignal(): Signal {
  return (signal ??= LOCAL ? new LocalSignal() : new FirestoreSignal());
}
