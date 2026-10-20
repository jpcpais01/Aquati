// Cloud saves: sign in, and your purse, vault, livery, designs and records
// follow you to any device. Guests keep playing on this device's saves exactly
// as before; the first sign-in carries that progress up into the account.
//
// Firebase settings come from VITE_FIREBASE_* at build time. Without them the
// whole feature switches off quietly (state 'off') and nothing is downloaded.
//
// Saves always land locally first (the game never waits on the network), then
// a throttled sync merges them with the cloud (see profile.ts for the merge).

import type { FirebaseOptions } from 'firebase/app';
import { onProgressSaved } from '../core/progress';
import { POOL } from '../ships/cosmetics';
import { isAdmin } from './admin';
import type { CloudApi, CloudUser } from './firebase';
import {
  changedParts, dropMissing, hasProgress, merge, pack, paintRefs, Part, Profile, readLocal, resetLocal, stable, unpack, writeLocal,
} from './profile';

export type { CloudUser } from './firebase';
export type { Part } from './profile';

export type CloudState = 'off' | 'starting' | 'guest' | 'syncing' | 'synced' | 'offline' | 'error';

const env = import.meta.env;
const CONFIG: FirebaseOptions | null =
  env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID
    ? {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
      }
    : null;

/** The cloud copy this device last agreed with, per captain. */
const BASE_KEY = 'aquati.cloud.base';
/** Paint hashes already uploaded, per captain. */
const PAINTS_KEY = 'aquati.cloud.paints';
/** Whose progress this device's saves hold. */
const OWNER_KEY = 'aquati.cloud.owner';

/** Gap between syncs while playing; leaving the page or the voyage flushes sooner. */
const THROTTLE = 12_000;

function load<T>(k: string, uid: string): T | null {
  try {
    const r = JSON.parse(localStorage.getItem(k) || 'null');
    return r && r.uid === uid ? (r.data as T) : null;
  } catch {
    return null;
  }
}

function store(k: string, uid: string, data: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify({ uid, data }));
  } catch {
    /* full: the next sync redoes the work */
  }
}

function forget() {
  try {
    for (const k of [BASE_KEY, PAINTS_KEY, OWNER_KEY]) localStorage.removeItem(k);
  } catch {
    /* nothing to forget */
  }
}

export interface Welcome {
  /** 'new': the save just moved into a fresh account; 'joined': guest progress merged into an existing one. */
  kind: 'new' | 'joined' | 'back';
  name: string;
}

export class Cloud {
  readonly configured = !!CONFIG;
  state: CloudState = CONFIG ? 'starting' : 'off';
  user: CloudUser | null = null;
  lastSync = 0;
  error = '';
  /** Fires on any change of state, user or sync time (the account UI). */
  private subs = new Set<() => void>();
  /** Fires after the cloud rewrote parts of this device's saves (the game reloads them). */
  onApplied: (parts: Set<Part>) => void = () => {};
  onWelcome: (w: Welcome) => void = () => {};
  /** Fires once per page load, after the first sync, when an admin captain signs in. */
  onAdmin: () => void = () => {};

  private api: CloudApi | null = null;
  private ready: Promise<CloudApi | null> | null = null;
  private dirty = false;
  private timer = 0;
  private running: Promise<boolean> | null = null;
  private again = false;
  private welcomed = '';

  constructor() {
    if (!CONFIG) return;
    onProgressSaved(() => this.touch());
    addEventListener('online', () => this.user && this.sync());
    addEventListener('offline', () => this.user && this.set('offline'));
    document.addEventListener('visibilitychange', () => {
      if (!this.user) return;
      // flush on the way out; pick up other devices' progress on the way back
      if (document.visibilityState === 'hidden') {
        if (this.dirty) void this.sync();
      } else if (Date.now() - this.lastSync > 30_000) void this.sync();
    });
  }

  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private set(s: CloudState, error = '') {
    this.state = s;
    this.error = error;
    this.subs.forEach((f) => f());
  }

  /** Loads Firebase in the background; safe to call more than once. */
  start() {
    if (!CONFIG || this.ready) return this.ready;
    this.ready = import('./firebase')
      .then((m) => (this.api = m.connect(CONFIG, (u) => this.onUser(u))))
      .catch((e) => {
        console.warn('[cloud] could not load', e);
        this.set('error', "Couldn't load sign-in. Check your connection.");
        this.ready = null;
        return null;
      });
    return this.ready;
  }

  private async need() {
    const api = this.api ?? (await this.start());
    if (!api) throw new Error("Couldn't load sign-in. Check your connection.");
    return api;
  }

  /** A friendly message for a failed sign-in ('' when the player just backed out). */
  async explain(e: unknown) {
    if (e instanceof Error && !(e as { code?: string }).code) return e.message;
    const m = await import('./firebase');
    return m.authMessage(e);
  }

  google = async () => (await this.need()).google();
  signIn = async (email: string, pw: string) => (await this.need()).signIn(email, pw);
  create = async (email: string, pw: string, name: string) => (await this.need()).create(email, pw, name);
  reset = async (email: string) => (await this.need()).reset(email);

  /** Saves pending in the cloud? (sign-out warns before dropping them) */
  get pending() {
    return this.dirty || this.state === 'offline' || this.state === 'error';
  }

  /**
   * Signs out after a last sync. Returns false if that sync failed and `force`
   * wasn't given, so the UI can warn. Leaves a fresh guest save behind: the
   * account's progress stays in the cloud, not on a device someone else may use.
   */
  async signOut(force = false) {
    const api = this.api;
    if (!api || !this.user) return true;
    if (!force && this.pending && !(await this.sync())) return false;
    clearTimeout(this.timer);
    this.dirty = false;
    await api.signOut().catch(() => {});
    this.user = null;
    this.welcomed = '';
    forget();
    const before = readLocal();
    resetLocal();
    this.onApplied(changedParts(before, readLocal()));
    this.set('guest');
    return true;
  }

  private onUser(u: CloudUser | null) {
    if (!u) {
      this.user = null;
      if (this.state !== 'error') this.set('guest');
      return;
    }
    const was = this.user?.uid;
    this.user = u;
    if (was === u.uid) {
      // just a profile update (a name set at sign-up)
      this.subs.forEach((f) => f());
      return;
    }
    let owner = '';
    try {
      owner = localStorage.getItem(OWNER_KEY) ?? '';
    } catch {
      /* private mode */
    }
    if (owner && owner !== u.uid) {
      // this device still holds another captain's (already synced) progress: don't merge it in
      const before = readLocal();
      forget();
      resetLocal();
      this.onApplied(changedParts(before, readLocal()));
    }
    void this.sync();
  }

  /** Something was saved: sync soon. */
  private touch() {
    if (!this.user) return;
    this.dirty = true;
    if (!this.timer) this.timer = window.setTimeout(() => void this.sync(), THROTTLE);
  }

  /** Sync now if anything is waiting (back in the harbour, after a wreck). */
  flush() {
    if (this.user && this.dirty) void this.sync();
  }

  /** One sync at a time; a request during one runs again right after. Resolves true on success. */
  sync(): Promise<boolean> {
    clearTimeout(this.timer);
    this.timer = 0;
    if (!this.user || !this.api) return Promise.resolve(false);
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.sync();
      }
    });
    return this.running;
  }

  private async run() {
    const api = this.api!;
    const user = this.user!;
    const uid = user.uid;
    if (!navigator.onLine) {
      this.set('offline');
      return false;
    }
    this.set('syncing');
    this.dirty = false;
    try {
      const local = readLocal();
      const { packed: L, paints } = pack(local);
      const base = load<Profile>(BASE_KEY, uid);

      // flags first, so the save never points at a paint the cloud lacks
      const uploaded = new Set(load<string[]>(PAINTS_KEY, uid) ?? []);
      for (const [h, d] of paints) {
        if (uploaded.has(h)) continue;
        await api.putPaint(uid, h, d);
        uploaded.add(h);
      }

      let created = false;
      let M: Profile = L;
      await api.transact(
        uid,
        (remote) => {
          created = !remote.profile;
          M = remote.profile ? merge(base, L, remote.profile) : L;
          return remote.profile && stable(M) === stable(remote.profile) ? null : M;
        },
        (p) => ({
          name: user.name,
          gold: p.vault?.purse ?? 0,
          treasures: POOL.filter((i) => p.vault?.owned[i.id]).length,
          voyages: p.records?.voyages ?? 0,
        }),
      );
      for (const h of paintRefs(M)) uploaded.add(h);
      store(PAINTS_KEY, uid, [...uploaded]);

      // paints painted on other devices
      for (const h of paintRefs(M)) {
        if (paints.has(h)) continue;
        const d = await api.getPaint(uid, h).catch(() => null);
        if (d) paints.set(h, d);
      }
      // the cloud now holds M; any paint we couldn't fetch counts as blank here and is retried next time
      const agreed = dropMissing(M, paints);

      // the game may have saved while we were talking to the cloud: keep that on top
      const now = pack(readLocal());
      now.paints.forEach((d, h) => paints.set(h, d));
      let mine = agreed;
      if (stable(now.packed) !== stable(L)) {
        mine = merge(L, now.packed, agreed);
        this.dirty = true;
      }
      if (this.user?.uid !== uid) return false; // signed out mid-sync
      const parts = changedParts(now.packed, mine);
      if (parts.size || stable(now.packed) !== stable(mine)) writeLocal(unpack(mine, paints));
      store(BASE_KEY, uid, agreed);
      try {
        localStorage.setItem(OWNER_KEY, uid);
      } catch {
        /* private mode */
      }
      if (parts.size) this.onApplied(parts);

      if (this.welcomed !== uid) {
        this.welcomed = uid;
        const kind = created ? 'new' : !base && hasProgress(local) ? 'joined' : 'back';
        this.onWelcome({ kind, name: user.name });
        // granted after the merge, so the grant itself syncs up as ordinary progress
        if (isAdmin(user)) this.onAdmin();
      }
      this.lastSync = Date.now();
      this.set('synced');
      if (this.dirty) this.touch();
      return true;
    } catch (e) {
      console.warn('[cloud] sync failed', e);
      this.dirty = true;
      const code = (e as { code?: string })?.code ?? '';
      if (!navigator.onLine || code === 'unavailable' || code === 'deadline-exceeded') this.set('offline');
      else if (code === 'permission-denied') this.set('error', "The cloud refused this save (check the Firestore rules).");
      else this.set('error', "Couldn't reach the cloud. Your progress is safe on this device.");
      // try again a little later
      this.timer = window.setTimeout(() => void this.sync(), 30_000);
      return false;
    }
  }
}
