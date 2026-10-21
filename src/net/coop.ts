// Sailing together: up to four captains in one sea (see transport.ts for the links).
//
// Every ship is sailed by exactly one game, her owner: each captain's game
// sails their own flagship and escorts, and the host's game sails every
// pirate, ghost and hunter. The others see her as a "puppet": built from the
// same recipe (class, colours, refit, name), steered by the owner's helm and
// eased onto the owner's track, so she heels, wakes and luffs just as she
// does at home.
//
// Who decides a blow (Ship.net / verdict):
//   - a shot from our side (a captain or their escorts) counts in the game
//     that fired it: we see it land, so it lands. A hit on another game's ship
//     is sent to her owner, who takes it off her hull.
//   - a shot from the pirates counts in the game of the ship it struck, so a
//     captain is only ever holed by balls they actually saw hit them.
// Everything else (the splinters, the holes, the smoke) plays everywhere.
//
// Loot is each captain's own: every wreck spills her goods into every game, so
// nobody snatches anybody's plunder. Gold, forts, maps and trade stay personal.

import * as THREE from 'three';
import { angleDelta } from '../core/noise';
import { NetRules, Ship, Team, Verdict } from '../ships/ship';
import { ShipModel } from '../ships/shipModel';
import { Livery, SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { preloadPaint } from '../ships/heraldry';
import { skinItem } from '../ships/cosmetics';
import type { World } from '../game/world';
import type { AmmoId } from '../game/ammo';
import { isFirework } from '../game/fireworks';
import type { WeatherKind } from '../world/atmosphere';
import { Session, Wire } from './transport';

export type Role = 'flag' | 'escort' | 'ai';

/** Everything another game needs to build and launch one of our ships. */
export interface Recipe {
  cls: ShipClassId;
  livery: Livery;
  team: Team;
  name: string;
  role: Role;
  /** The captain at her helm (flagships). */
  captain: string | null;
  hunter: string | null;
  boost: Ship['boost'] | null;
  /** Vault skin (flagships). */
  skin: string | null;
  blast: string;
  trail: string;
  ammo: AmmoId;
  x: number;
  z: number;
  h: number;
  hp: number;
  sail: number;
}

export interface SkyState {
  day: number;
  kind: WeatherKind;
  windTo: number;
  /** False while the host holds the clock at an hour. */
  run: boolean;
  /** Peaceful seas: the host's rule for everyone aboard (absent from older builds: adventure). */
  calm?: boolean;
}

/** What the game lends the crew layer. */
export interface CoopGame {
  readonly world: World;
  /** Our ships to share right now, and what each one is. */
  shares(out: Map<Ship, Role>): void;
  recipe(s: Ship, role: Role): Recipe;
  /** Whom one of our AI ships is hunting. */
  targetOf(s: Ship): Ship | null;
  /** Queues a finished hull's meshes and textures for upload, a few a frame. */
  prepare(m: ShipModel): void;
  /** True while any of a hull's meshes still wait for upload. */
  uploading(m: ShipModel): boolean;
  /** Frees a hull that will never sail. */
  scrap(m: ShipModel): void;
  /** A hull of ours already built and uploaded to the same recipe (a pirate off our own slipway), if there is one. */
  fromYard(r: Recipe): ShipModel | null;
  readonly quality: number;
  /** Puts another game's ship on the water. */
  launch(r: Recipe, m: ShipModel): Ship;
  remove(s: Ship): void;
  /** The host has gone: one of the host's pirates is ours to sail from now on. */
  adopt(s: Ship): void;
  /** A blow decided in another game landed on one of ours. */
  struck(s: Ship, by: Ship | null, dmg: number): void;
  /** Another game's ship went down. */
  sunk(s: Ship, by: Ship | null): void;
  sky(): SkyState;
  /** A guest's sky keeps to the host's (null: their own again). */
  follow(s: SkyState | null): void;
  toast(title: string, line: string, secs?: number): void;
  /** We've joined someone's sea: our own pirates sail off. */
  clearSea(): void;
  /** The crew, the link or the state changed (for the UI). */
  changed(): void;
}

/** One of our ships as the others know her. */
interface Mine {
  id: number;
  role: Role;
  dead: boolean;
}

/** The last word from her owner: where she was and how she was sailing. */
interface NetState {
  x: number;
  z: number;
  h: number;
  spd: number;
  av: number;
  hp: number;
  rud: number;
  sail: number;
  sl: number;
  alive: boolean;
  prize: boolean;
  team: Team;
  anchored: boolean;
  afire: number;
  torn: number;
  crew: number;
  held: number;
  tgt: number;
  /** Peaceful seas: the captains she's at war with, a bit each (see game/peace.ts). */
  wrath: number;
}

/** Another game's ship: her recipe, her latest state and (once built) the ship herself. */
interface Puppet {
  id: number;
  owner: number;
  r: Recipe;
  st: NetState;
  rx: number;
  ship: Ship | null;
  model: ShipModel | null;
  phase: 'paint' | 'wait' | 'build' | 'upload' | 'sea';
}

const MAGIC = 0xa7;
const HEAD = 5;
const ENTRY = 44;
/** Position updates a second (the unreliable channel). */
const RATE = 15;
const ID_SPAN = 1_000_000;

const _p = new THREE.Vector3();

function stateOf(r: Recipe): NetState {
  return {
    x: r.x, z: r.z, h: r.h, spd: 0, av: 0, hp: r.hp, rud: 0, sail: r.sail, sl: r.sail, alive: true, prize: false, team: r.team,
    anchored: false, afire: 0, torn: 0, crew: 0, held: 0, tgt: 0, wrath: 0,
  };
}

export class Coop implements NetRules {
  session: Session | null = null;
  /** What the crew panel shows. */
  phase: 'off' | 'opening' | 'joining' | 'hosting' | 'aboard' = 'off';
  error = '';
  private mine = new Map<Ship, Mine>();
  private mineIds = new Map<number, Ship>();
  private puppets = new Map<number, Puppet>();
  private ofShip = new Map<Ship, Puppet>();
  private queue: Puppet[] = [];
  private cur = new Map<Ship, Role>();
  private stateT = 0;
  private skyT = 0;
  private seq = 0;
  private seqs = new Map<number, number>();
  /** True while a message from another game is being applied: what it says simply happens. */
  private applying = false;
  private buf = new ArrayBuffer(HEAD + ENTRY * 64);

  constructor(private g: CoopGame) {
    // closing the tab still says goodbye (the host's guests go home at once)
    addEventListener('pagehide', () => void this.leave());
  }

  get live() {
    return !!this.session && !this.session.ended;
  }

  /** A guest in someone else's sea (their pirates, their weather). */
  get guest() {
    return this.live && !this.session!.isHost;
  }

  get hosting() {
    return this.live && this.session!.isHost;
  }

  get me() {
    return this.session?.me ?? 0;
  }

  // ---------------------------------------------------------------- the crew

  async host(name: string) {
    if (this.live || this.phase === 'opening' || this.phase === 'joining') return;
    this.phase = 'opening';
    this.error = '';
    this.g.changed();
    try {
      this.attach(await Session.host(name));
      this.phase = 'hosting';
    } catch (e) {
      this.phase = 'off';
      this.error = (e as Error).message || 'Could not open the voyage.';
    }
    this.g.changed();
  }

  async join(code: string, name: string) {
    if (this.live || this.phase === 'opening' || this.phase === 'joining') return;
    this.phase = 'joining';
    this.error = '';
    this.g.changed();
    try {
      const s = await Session.join(code, name);
      this.g.clearSea();
      this.attach(s);
      this.phase = 'aboard';
      // everyone tells us about their ships
      s.send({ k: 'rs' });
      this.g.toast('Aboard', `You've joined ${s.roster.get(0) ?? 'the host'}'s voyage`, 3.4);
    } catch (e) {
      this.phase = 'off';
      this.error = (e as Error).message || 'Could not join that voyage.';
    }
    this.g.changed();
  }

  /** Leave the crew (a guest), or end the voyage for everyone (the host). */
  async leave() {
    const s = this.session;
    if (!s) return;
    await s.close();
    this.detach(s.isHost ? 'The voyage is closed' : 'You sail alone again');
  }

  kick(idx: number) {
    if (this.hosting) this.session!.kick(idx);
  }

  private attach(s: Session) {
    this.session = s;
    Ship.net = this;
    s.onMsg = (from, m) => this.onMsg(from, m);
    s.onState = (d) => this.onState(d);
    s.onJoin = () => this.g.changed();
    s.onRoster = () => this.g.changed();
    s.onLeave = (idx, name) => {
      this.dropOwner(idx);
      this.g.toast(`${name} has left`, 'Their ships sail out of your sea', 3);
      this.g.changed();
    };
    s.onClosed = (why) => this.detach(why);
  }

  /** The crew is gone: the host's pirates become ours to fight, everyone else's ships sail away. */
  private detach(why: string) {
    const wasGuest = this.session && !this.session.isHost;
    this.session = null;
    Ship.net = null;
    this.phase = 'off';
    for (const p of [...this.puppets.values()]) {
      const s = p.ship;
      if (s && !s.removed && s.alive && wasGuest && p.st.team === 'pirate') {
        s.remote = false;
        this.g.adopt(s);
      } else if (s && !s.removed) this.g.remove(s);
      else if (p.model) this.g.scrap(p.model);
    }
    this.puppets.clear();
    this.ofShip.clear();
    this.queue.length = 0;
    this.mine.clear();
    this.mineIds.clear();
    this.seqs.clear();
    if (wasGuest) this.g.follow(null);
    this.g.toast(why, wasGuest ? 'The sea is yours again' : '', 3.6);
    this.g.changed();
  }

  /** Everyone else's ships (the roster's own pirates included), fresh: after a world reset here. */
  resync() {
    if (!this.live) return;
    for (const p of [...this.puppets.values()]) this.drop(p);
    this.session!.send({ k: 'rs' });
  }

  /** The game removed one of its ships (or one of ours): forget her. */
  forget(s: Ship) {
    const p = this.ofShip.get(s);
    if (p) {
      this.ofShip.delete(s);
      this.puppets.delete(p.id);
    }
    const m = this.mine.get(s);
    if (m) {
      this.mine.delete(s);
      this.mineIds.delete(m.id);
      this.session?.send({ k: 'dx', id: m.id });
    }
  }

  /** The other captains' flagships and escorts afloat: what pirates may hunt besides you. */
  mates(out: Ship[]) {
    for (const p of this.puppets.values()) {
      const s = p.ship;
      if (s && s.alive && !s.removed && s.team === 'player') out.push(s);
    }
    return out;
  }

  /** The host's sea changed its rules: tell the crew at once rather than at the next sky beat. */
  skyNow() {
    this.skyT = 0;
  }

  /** Whose side a ship sails for: her owner's place in the crew (ours, for our own ships). */
  ownerOf(s: Ship) {
    return this.ofShip.get(s)?.owner ?? this.me;
  }

  /** The other captains' flagships afloat. */
  flagships(out: Ship[]) {
    for (const p of this.puppets.values()) if (p.r.role === 'flag' && p.ship && p.ship.alive && !p.ship.removed) out.push(p.ship);
    return out;
  }

  /** The host's flagship, to set sail beside. */
  rally(): Ship | null {
    for (const p of this.puppets.values()) if (p.owner === 0 && p.r.role === 'flag' && p.ship?.alive) return p.ship;
    return null;
  }

  /** Whether another game's ship is hunting `s` (by her owner's word). */
  aims(foe: Ship, s: Ship) {
    const p = this.ofShip.get(foe);
    if (!p || !p.st.tgt) return false;
    return this.shipOf(p.st.tgt) === s;
  }

  /** The captains aboard, for the panel: [place, name, ping ms]. */
  roster(): { idx: number; name: string; me: boolean; ping: number }[] {
    const s = this.session;
    if (!s) return [];
    return [...s.roster].sort((a, b) => a[0] - b[0]).map(([idx, name]) => ({ idx, name, me: idx === s.me, ping: idx === s.me ? 0 : Math.round(s.isHost ? s.rttTo(idx) : idx === 0 ? s.rtt : s.rtt + 40) }));
  }

  // ---------------------------------------------------------------- the rules of a blow

  verdict(target: Ship, attacker: Ship | null): Verdict {
    if (this.applying) return 'real';
    if (!attacker || attacker === target) return target.remote ? 'echo' : 'real';
    // our side: the game that fired decides
    if (attacker.team === 'player') return attacker.remote ? 'echo' : target.remote ? 'send' : 'real';
    // the pirates': the game that was struck decides
    return target.remote ? 'echo' : 'real';
  }

  sent(target: Ship, dmg: number, attacker: Ship, kind: 'blow' | 'fire' | 'chain' | 'grape' | 'dread') {
    const p = this.ofShip.get(target);
    if (!p || !this.live) return;
    this.session!.send({ k: 'hi', id: p.id, by: this.idOf(attacker), d: Math.round(dmg * 100) / 100, x: kind }, p.owner);
  }

  fired(ship: Ship, side: 'port' | 'starboard', target: Ship | null, point: THREE.Vector3 | null) {
    const m = this.mine.get(ship);
    if (!m || !this.live) return;
    this.session!.send({ k: 'fi', id: m.id, s: side === 'port' ? 1 : 0, t: target ? this.idOf(target) : 0, p: point ? [point.x, point.y, point.z] : null, a: ship.ammo, fw: ship.ammo === 'firework' ? ship.firework : undefined });
  }

  // ---------------------------------------------------------------- every frame

  /** Before the ships move: links kept, our ships told, theirs built and steered. */
  update(dt: number) {
    const s = this.session;
    if (!s) return;
    s.tick();
    if (!this.live) return;
    this.share();
    this.build();
    this.steer(dt);
    this.stateT -= dt || 1 / 60;
    if (this.stateT <= 0) {
      this.stateT = 1 / RATE;
      this.sendState();
    }
    if (s.isHost && s.size > 1 && (this.skyT -= dt || 1 / 60) <= 0) {
      this.skyT = 2;
      s.send({ k: 'sy', ...this.g.sky() });
    }
  }

  private idOf(s: Ship): number {
    const p = this.ofShip.get(s);
    if (p) return p.id;
    return this.me * ID_SPAN + (s.id % ID_SPAN);
  }

  private shipOf(id: number): Ship | null {
    return this.mineIds.get(id) ?? this.puppets.get(id)?.ship ?? null;
  }

  /** Tells the others about ships of ours that came or went, and those that went down. */
  private share() {
    const cur = this.cur;
    cur.clear();
    this.g.shares(cur);
    for (const [s, role] of cur) {
      if (s.remote) continue;
      let m = this.mine.get(s);
      if (!m) {
        m = { id: this.idOf(s), role, dead: false };
        this.mine.set(s, m);
        this.mineIds.set(m.id, s);
        this.session!.send({ k: 'sp', id: m.id, r: this.g.recipe(s, role) });
      }
      m.role = role;
      if (!s.alive && !m.dead) {
        m.dead = true;
        this.session!.send({ k: 'sk', id: m.id, by: s.lastAttacker ? this.idOf(s.lastAttacker) : 0 });
      }
    }
    for (const [s, m] of this.mine) {
      if (cur.has(s) && !s.removed) continue;
      this.mine.delete(s);
      this.mineIds.delete(m.id);
      this.session!.send({ k: 'dx', id: m.id });
    }
  }

  private sendState() {
    const v = new DataView(this.buf);
    let n = 0;
    let o = HEAD;
    for (const [s, m] of this.mine) {
      if (!s.alive || n >= 64) continue;
      v.setUint32(o, m.id);
      v.setFloat32(o + 4, s.pos.x);
      v.setFloat32(o + 8, s.pos.z);
      v.setFloat32(o + 12, s.heading);
      v.setFloat32(o + 16, s.speed);
      v.setFloat32(o + 20, s.angVel);
      v.setFloat32(o + 24, s.hp);
      v.setInt8(o + 28, Math.round(Math.max(-1, Math.min(1, s.rudder)) * 127));
      v.setUint8(o + 29, Math.round(s.sailTarget * 255));
      v.setUint8(o + 30, Math.round(s.sailLevel * 255));
      v.setUint8(o + 31, (s.alive ? 1 : 0) | (s.prize ? 2 : 0) | (s.team === 'player' ? 4 : 0) | (s.anchored ? 8 : 0));
      v.setUint8(o + 32, Math.min(255, Math.round(Math.max(0, s.afire) * 4)));
      v.setUint8(o + 33, Math.min(255, Math.round(s.torn * 4)));
      v.setUint8(o + 34, Math.min(255, Math.round(s.crewHit * 4)));
      v.setUint8(o + 35, Math.round(s.held * 255));
      const t = m.role === 'ai' ? this.g.targetOf(s) : null;
      v.setUint32(o + 36, t ? this.idOf(t) : 0);
      v.setUint32(o + 40, 0);
      v.setUint8(o + 40, m.role === 'ai' ? s.wrath & 0xff : 0);
      o += ENTRY;
      n++;
    }
    if (!n) return;
    v.setUint8(0, MAGIC);
    v.setUint8(1, this.me);
    v.setUint16(2, (this.seq = (this.seq + 1) & 0xffff));
    v.setUint8(4, n);
    this.session!.sendState(new Uint8Array(this.buf, 0, o).slice());
  }

  private onState(data: ArrayBuffer) {
    const v = new DataView(data);
    if (v.byteLength < HEAD || v.getUint8(0) !== MAGIC) return;
    const owner = v.getUint8(1);
    if (owner === this.me) return;
    // positions arrive in any order: an older packet than the last is stale
    const seq = v.getUint16(2);
    const last = this.seqs.get(owner);
    if (last !== undefined && ((seq - last) & 0xffff) > 0x8000) return;
    this.seqs.set(owner, seq);
    const n = v.getUint8(4);
    const now = performance.now();
    for (let i = 0, o = HEAD; i < n && o + ENTRY <= v.byteLength; i++, o += ENTRY) {
      const p = this.puppets.get(v.getUint32(o));
      if (!p) continue;
      const st = p.st;
      st.x = v.getFloat32(o + 4);
      st.z = v.getFloat32(o + 8);
      st.h = v.getFloat32(o + 12);
      st.spd = v.getFloat32(o + 16);
      st.av = v.getFloat32(o + 20);
      st.hp = v.getFloat32(o + 24);
      st.rud = v.getInt8(o + 28) / 127;
      st.sail = v.getUint8(o + 29) / 255;
      st.sl = v.getUint8(o + 30) / 255;
      const f = v.getUint8(o + 31);
      st.alive = !!(f & 1);
      st.prize = !!(f & 2);
      st.team = f & 4 ? 'player' : 'pirate';
      st.anchored = !!(f & 8);
      st.afire = v.getUint8(o + 32) / 4;
      st.torn = v.getUint8(o + 33) / 4;
      st.crew = v.getUint8(o + 34) / 4;
      st.held = v.getUint8(o + 35) / 255;
      st.tgt = v.getUint32(o + 36);
      st.wrath = v.getUint8(o + 40);
      p.rx = now;
    }
  }

  /**
   * Steers each puppet the way her owner does (helm, canvas, way on), then eases
   * her onto where her owner's last word, carried forward by the time it took
   * to arrive, says she is. A big gap (she was out of sight, or rammed) closes at once.
   */
  private steer(dt: number) {
    if (dt <= 0) return;
    const now = performance.now();
    const s0 = this.session!;
    const k = 1 - Math.exp(-dt * 2.2);
    const kh = 1 - Math.exp(-dt * 3);
    const kv = 1 - Math.exp(-dt * 4);
    for (const p of this.puppets.values()) {
      const s = p.ship;
      if (!s || !s.alive || s.removed) continue;
      const st = p.st;
      const sinceRx = (now - p.rx) / 1000;
      // the host's word to a guest about another guest has come the long way round
      const lat = (s0.isHost ? s0.rttTo(p.owner) : s0.rtt + (p.owner ? 40 : 0)) / 2000;
      const stale = sinceRx > 2.5;
      const age = Math.min(1.2, sinceRx + lat);
      const h = st.h + st.av * age;
      const mid = st.h + st.av * age * 0.5;
      const tx = st.x + Math.sin(mid) * st.spd * age;
      const tz = st.z + Math.cos(mid) * st.spd * age;
      const ex = tx - s.pos.x;
      const ez = tz - s.pos.z;
      if (ex * ex + ez * ez > 40 * 40) {
        s.pos.x = tx;
        s.pos.z = tz;
        s.heading = h;
      } else {
        s.pos.x += ex * k;
        s.pos.z += ez * k;
        s.heading += angleDelta(s.heading, h) * kh;
      }
      s.speed += ((stale ? 0 : st.spd) - s.speed) * kv;
      s.angVel = stale ? 0 : st.av;
      s.rudder = stale ? 0 : st.rud;
      s.sailTarget = st.sail;
      s.sailLevel += (st.sl - s.sailLevel) * kv;
      // she's only ever sunk by her owner's word (the 'sk' message)
      s.hp = Math.max(0.01, Math.min(st.hp, s.maxHp));
      s.prize = st.prize;
      s.team = st.team;
      s.anchored = st.anchored;
      s.afire = st.afire;
      s.torn = st.torn;
      s.crewHit = st.crew;
      s.held = st.held;
      s.wrath = st.wrath;
    }
  }

  /** Builds puppets' hulls a slice at a time (never all in one frame), then launches each once uploaded. */
  private build(): void {
    const p = this.queue[0];
    if (!p) return;
    if (p.phase === 'paint') {
      const paint = p.r.livery.flagDesign?.paint;
      if (paint) {
        p.phase = 'wait';
        void preloadPaint(paint).catch(() => {}).then(() => {
          if (p.phase === 'wait') p.phase = 'build';
        });
        return;
      }
      p.phase = 'build';
    }
    if (p.phase === 'wait') return;
    if (p.phase === 'build') {
      // the same pirate may already wait on our own slipway, built and uploaded
      if (!p.model && (p.model = this.g.fromYard(p.r))) {
        p.phase = 'upload';
        return this.build();
      }
      if (!p.model) {
        p.model = new ShipModel(SHIP_CLASSES[p.r.cls], p.r.livery, this.g.quality, true);
        const skin = p.r.skin ?? p.r.livery.skin;
        if (skin) p.model.setSkin(skinItem(skin));
      }
      const t0 = performance.now();
      while (performance.now() - t0 < 1.2) {
        if (p.model.step()) {
          this.g.prepare(p.model);
          p.phase = 'upload';
          break;
        }
      }
      return;
    }
    if (p.phase === 'upload' && !this.g.uploading(p.model!)) {
      this.queue.shift();
      const s = this.g.launch(p.r, p.model!);
      s.remote = true;
      p.ship = s;
      p.phase = 'sea';
      this.ofShip.set(s, p);
      // she sails in from wherever her owner last had her
      s.place(p.st.x, p.st.z, p.st.h);
      s.speed = p.st.spd;
      s.hp = Math.max(0.01, p.st.hp);
      if (!p.st.alive) s.die(null, this.g.world);
      this.g.changed();
    }
  }

  // ---------------------------------------------------------------- what the others say

  private onMsg(from: number, m: Wire) {
    this.applying = true;
    try {
      this.handle(from, m);
    } catch (e) {
      console.warn('[mp] message', m.k, e);
    } finally {
      this.applying = false;
    }
  }

  private handle(from: number, m: Wire) {
    const w = this.g.world;
    switch (m.k) {
      case 'rs': {
        // someone needs the whole picture: our ships (and, from the host, the sky)
        for (const [s, mi] of this.mine) if (s.alive) this.session!.send({ k: 'sp', id: mi.id, r: this.g.recipe(s, mi.role) }, from);
        if (this.hosting) this.session!.send({ k: 'sy', ...this.g.sky() }, from);
        return;
      }
      case 'sp': {
        const id = m.id as number;
        if (this.puppets.has(id) || Math.floor(id / ID_SPAN) !== from) return;
        const r = m.r as Recipe;
        if (!SHIP_CLASSES[r.cls]) return;
        const p: Puppet = { id, owner: from, r, st: stateOf(r), rx: performance.now(), ship: null, model: null, phase: 'paint' };
        this.puppets.set(id, p);
        // captains first: a mate appearing matters more than another pirate on the horizon
        if (r.role === 'flag') this.queue.splice(this.queue.length && this.queue[0].phase !== 'paint' ? 1 : 0, 0, p);
        else this.queue.push(p);
        return;
      }
      case 'dx': {
        const p = this.puppets.get(m.id as number);
        if (p) this.drop(p, true);
        return;
      }
      case 'fi': {
        const s = this.puppets.get(m.id as number)?.ship;
        if (!s || !s.alive) return;
        const side = m.s ? 'port' : 'starboard';
        s.ammo = (m.a as AmmoId) ?? 'round';
        if (isFirework(m.fw)) s.firework = m.fw;
        s.reload[side] = 0;
        const pt = m.p as number[] | null;
        s.fire(side, w, m.t ? this.shipOf(m.t as number) : null, pt ? _p.set(pt[0], pt[1], pt[2]) : null);
        return;
      }
      case 'hi': {
        const s = this.mineIds.get(m.id as number);
        if (!s || !s.alive) return;
        const by = this.shipOf(m.by as number);
        const kind = m.x as string;
        if (kind === 'blow') {
          const d = Math.max(0, Number(m.d) || 0);
          s.takeBlow(d, by, w);
          this.g.struck(s, by, d);
        } else if (kind === 'fire') s.ignite(by);
        else if (kind === 'chain') s.shred(by);
        else if (kind === 'grape') s.rake(by);
        else if (kind === 'dread') s.terrify(by);
        return;
      }
      case 'sk': {
        const p = this.puppets.get(m.id as number);
        if (!p) return;
        p.st.alive = false;
        const s = p.ship;
        if (!s || !s.alive) return;
        const by = m.by ? this.shipOf(m.by as number) : null;
        s.die(by, w);
        this.g.sunk(s, by);
        return;
      }
      case 'sy': {
        if (this.guest && from === 0) this.g.follow(m as unknown as SkyState);
        return;
      }
    }
  }

  /** Forget a puppet; her ship sails out (a wreck finishes going down first). */
  private drop(p: Puppet, gently = false) {
    this.puppets.delete(p.id);
    const i = this.queue.indexOf(p);
    if (i >= 0) this.queue.splice(i, 1);
    const s = p.ship;
    if (s) {
      this.ofShip.delete(s);
      if (!s.removed && (!gently || s.alive)) this.g.remove(s);
    } else if (p.model) this.g.scrap(p.model);
  }

  private dropOwner(idx: number) {
    for (const p of [...this.puppets.values()]) if (p.owner === idx) this.drop(p);
    this.seqs.delete(idx);
  }
}
