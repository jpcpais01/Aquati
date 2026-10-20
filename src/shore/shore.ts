import * as THREE from 'three';
import { angleDelta, clamp, damp, mulberry32 } from '../core/noise';
import { Builder, Bucket } from '../port/port';
import { CrewSystem, Look, makeLook } from '../ships/crew';
import { FLAG, HAT, TINT } from '../ships/crewModel';
import type { Ship } from '../ships/ship';
import type { World } from '../game/world';
import { BOAT_L, buildBoat, buildCamp, campFlag, CampLayout, CHEST_D, CHEST_H, chestParts, ShoreMats, shoreMats } from './kit';
import { CampSite, Ground, Landing } from './ground';
import { Cut, CUT_HIT, CUT_WIND, Walker } from './walker';

// Going ashore. The captain rows in with four hands, walks the islands on foot
// and the hands follow in a loose wedge, guard the captain's back and settle
// down on the sand when you stop for a look around. Some isles have a camp of
// cutthroats round a fire, who grab their blades and come running when you
// get close; your hands pick a man each, and run to cover anyone who goes for
// the captain. Rout the camp and its plunder chest is yours.

const CAP_HP = 120;
const HAND_HP = 75;
const FOE_HP = 52;
const BOSS_HP = 115;
/** How far ahead of a walker a cut reaches, and a lunge. */
const REACH = 2.0;
const LUNGE = 2.5;
const BODY = 0.3;
const WALK = 3.0;
const RUN = 5.3;
const PISTOL_RELOAD = 7;
const PISTOL_RANGE = 18;
/** Camps nearer the camera than this are simulated and drawn. */
const CAMP_LIVE = 270;
/** A camp takes up arms when the landing party comes this close to its fire. */
const CAMP_ALARM = 19;
/** ...and gives up the chase this far from home. */
const LEASH = 42;

export const HAND_NAMES = ['Bones', 'Patch', 'Old Hobb', 'Sully', 'Barnaby', 'Nell', 'Red Jack', 'Iko', 'Dutch', 'Mags', 'Tam', 'Quill', 'Rook', 'Bess', 'Finch', 'Salty'];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _o = { x: 0, z: 0 };
const _hand = new THREE.Vector3();

export interface ShoreInput {
  /** Wanted stride in world space, length 0..1. */
  mx: number;
  mz: number;
  run: boolean;
  strike: boolean;
  pistol: boolean;
  interact: boolean;
  /** Where a mouse click points on the ground, to cut toward. */
  aim: { x: number; z: number } | null;
}

export interface ShoreHooks {
  floater(text: string, at: THREE.Vector3, kind: '' | 'bad' | 'loot' | 'rare'): void;
  shake(amount: number): void;
  /** A camp takes up arms. */
  alarm(c: Camp): void;
  /** Its last man is down. */
  routed(c: Camp): void;
  /** You open its chest. */
  plunder(c: Camp): void;
  /** The captain is down. */
  defeat(): void;
  step(k: number, wet: boolean): void;
}

export interface Camp {
  readonly index: number;
  readonly site: CampSite;
  readonly layout: CampLayout;
  readonly gang: Walker[];
  readonly flag: THREE.Group;
  readonly lid: THREE.Group;
  readonly chest: THREE.Group;
  alert: boolean;
  routed: boolean;
  opened: boolean;
  /** 0..1: the lid swinging open. */
  open: number;
  /** The colours coming down once the camp is routed (0 up .. 1 struck). */
  strike: number;
  live: boolean;
  fireT: number;
  /** Seat or post each cutthroat keeps when at ease. */
  spots: { x: number; z: number; yaw: number; idle: 'sit' | 'warm' | 'watch' | 'lean' | 'chat' | 'stand'; seatH: number }[];
}

export interface PartyMember {
  walker: Walker;
  name: string;
}

export type Prompt = { key: 'boat' | 'chest' | 'fight'; title: string; sub: string; ok: boolean } | null;

export class Shore {
  readonly group = new THREE.Group();
  readonly camps: Camp[] = [];
  private mats: ShoreMats;
  private boat = new THREE.Group();
  private boatBlocks: { x: number; z: number; r: number }[] = [];
  active = false;
  ship: Ship | null = null;
  landing: Landing | null = null;
  captain: Walker | null = null;
  readonly party: PartyMember[] = [];
  /** Facing of the party's march (the captain's heading, eased). */
  private march = 0;
  private stillT = 0;
  private combo = 0;
  private comboT = 0;
  private queued = false;
  pistolT = 0;
  private shotAt = -1;
  private sheathT = 0;
  private calmT = 0;
  /** Hit-stop: a few frames' pause when a heavy blow lands. */
  private stop = 0;
  defeated = false;
  time = 0;
  /** Foes the party is fighting right now (alert and near), for the HUD's bars. */
  readonly foes: Walker[] = [];
  private all: Walker[] = [];

  constructor(
    readonly ground: Ground,
    sites: CampSite[],
    private crew: CrewSystem,
    private hooks: ShoreHooks,
  ) {
    this.group.name = 'shore';
    const mats = (this.mats = shoreMats());
    // the ship's boat, hidden until it's pulled up on a beach
    const bb = new Builder();
    buildBoat(bb);
    bb.finish(this.boat, mats as unknown as Record<Bucket, THREE.Material>);
    this.boat.visible = false;
    this.group.add(this.boat);
    const parts = chestParts();
    const ground1 = (x: number, z: number) => ground.height(x, z);
    sites.forEach((site, i) => {
      const b = new Builder();
      const layout = buildCamp(b, site, ground1, 4100 + i * 37);
      const g = new THREE.Group();
      g.name = `camp-${i}`;
      b.finish(g, mats as unknown as Record<Bucket, THREE.Material>);
      this.group.add(g);
      for (const d of layout.blocks) ground.blocks.push(d);
      const flag = campFlag(mats.flag);
      flag.position.copy(layout.flagTop);
      this.group.add(flag);
      // the chest: a body and a lid on its hinge
      const chest = new THREE.Group();
      const lid = new THREE.Group();
      for (const [k, geo] of Object.entries(parts.body)) if (geo) chest.add(this.mesh(geo, k as Bucket));
      for (const [k, geo] of Object.entries(parts.lid)) if (geo) lid.add(this.mesh(geo, k as Bucket));
      lid.position.set(0, CHEST_H, -CHEST_D / 2);
      chest.add(lid);
      chest.position.copy(layout.chest);
      chest.rotation.y = layout.chestYaw;
      this.group.add(chest);
      const camp: Camp = { index: i, site, layout, gang: [], flag, lid, chest, alert: false, routed: false, opened: false, open: 0, strike: 0, live: false, fireT: 0, spots: [] };
      this.muster(camp, i);
      this.camps.push(camp);
    });
  }

  private mesh(geo: THREE.BufferGeometry, k: Bucket) {
    const m = new THREE.Mesh(geo, (this.mats as unknown as Record<Bucket, THREE.Material>)[k]);
    m.castShadow = k !== 'glow';
    m.receiveShadow = true;
    return m;
  }

  // ---------------------------------------------------------------- the cutthroats

  /** A camp's gang: three to five cutthroats, and a big boss on the larger isles. */
  private muster(c: Camp, i: number) {
    const rnd = mulberry32(900 + i * 71);
    const L = c.layout;
    const spots: Camp['spots'] = [];
    for (const s of L.seats) spots.push({ ...s, idle: 'sit', seatH: 0.38 });
    const f = L.fire;
    for (const k of [0.4, 2.7, 4.6]) {
      const a = c.site.yaw + k;
      const x = f.x + Math.sin(a) * 1.45;
      const z = f.z + Math.cos(a) * 1.45;
      spots.push({ x, z, yaw: Math.atan2(f.x - x, f.z - z), idle: 'warm', seatH: 0 });
    }
    L.posts.forEach((p, k) => spots.push({ ...p, idle: k === 1 ? 'watch' : k === 2 ? 'lean' : 'stand', seatH: 0 }));
    c.spots = spots;
    const n = 3 + Math.floor(rnd() * 2) + (c.site.island.r > 85 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const boss = k === 0 && c.site.island.r > 70;
      const look = foeLook(boss, rnd);
      const row = this.crew.takeRow(look);
      const w = new Walker('foe', row, look, boss ? BOSS_HP : FOE_HP, boss ? 1.16 : 0.94 + rnd() * 0.16, boss ? 1.06 : 0.95 + rnd() * 0.1, true);
      c.gang.push(w);
    }
    this.restCamp(c);
  }

  /** Everyone back at their places round the fire, whole again, blades away. */
  private restCamp(c: Camp) {
    const pick = c.spots.slice();
    c.gang.forEach((w, k) => {
      const s = pick.splice(k % 2 === 0 ? 0 : Math.floor(pick.length / 2), 1)[0] ?? c.spots[k % c.spots.length];
      w.place(s.x, s.z, s.yaw);
      w.idle = s.idle;
      w.seatH = s.seatH;
      w.hp = w.maxHp;
      w.downT = -1;
      w.fall = 0;
      w.rise = 0;
      w.armed = false;
      w.target = null;
      w.cutT = -1;
      w.idleT = 4 + Math.random() * 14;
    });
  }

  /** A fresh voyage: every camp manned again, its colours up and its chest shut. */
  resetCamps() {
    for (const c of this.camps) {
      c.alert = c.routed = c.opened = false;
      c.open = c.strike = 0;
      c.lid.rotation.x = 0;
      c.flag.visible = true;
      c.flag.position.copy(c.layout.flagTop);
      this.restCamp(c);
    }
  }

  // ---------------------------------------------------------------- landing and leaving

  /** Rows the captain and up to four hands in to `landing`; the ship rides at anchor. */
  land(ship: Ship, landing: Landing) {
    this.leave();
    this.ship = ship;
    this.landing = landing;
    this.active = true;
    this.defeated = false;
    this.pistolT = 0;
    this.combo = 0;
    this.calmT = 0;
    // the boat, bow up the beach, settled on the sand
    const yaw = Math.atan2(landing.dx, landing.dz);
    const g = this.ground;
    // run up until her forefoot grounds, so she sits in the shallows, not under them
    const mx = landing.x + landing.dx * 1.2;
    const mz = landing.z + landing.dz * 1.2;
    const bowX = mx + landing.dx * BOAT_L * 0.4;
    const bowZ = mz + landing.dz * BOAT_L * 0.4;
    const sternX = mx - landing.dx * BOAT_L * 0.4;
    const sternZ = mz - landing.dz * BOAT_L * 0.4;
    const hb = g.height(bowX, bowZ);
    const hs = Math.max(g.height(sternX, sternZ), -0.3);
    this.boat.position.set(mx, Math.max((hb + hs) / 2, -0.24) - 0.04, mz);
    this.boat.rotation.set(0, yaw, 0, 'YXZ');
    this.boat.rotateX(-Math.atan2(hb - hs, BOAT_L * 0.8) * 0.8);
    this.boat.rotateZ(0.05);
    this.boat.visible = true;
    this.boat.updateMatrixWorld(true);
    this.boatBlocks = [-1.5, 0, 1.5].map((k) => ({ x: mx + landing.dx * k, z: mz + landing.dz * k, r: 0.85 }));
    for (const b of this.boatBlocks) g.blocks.push(b);
    // the captain and four hands step out onto the sand
    const crew = this.crew.muster(ship, 4);
    const used = new Set<number>();
    const names = HAND_NAMES.slice().sort(() => Math.random() - 0.5);
    const mk = (m: { row: number; look: Look; girth: number; height: number } | null, captain: boolean) => {
      if (m) return new Walker('party', m.row, m.look, captain ? CAP_HP : HAND_HP, m.girth, m.height, false);
      const look = makeLook('player', captain ? 'captain' : 'hand');
      const row = this.crew.takeRow(look);
      return new Walker('party', row, look, captain ? CAP_HP : HAND_HP, 1, 1, true);
    };
    const capM = crew.find((m) => m.captain) ?? null;
    if (capM) used.add(capM.row);
    const cap = mk(capM, true);
    this.captain = cap;
    this.party.length = 0;
    this.party.push({ walker: cap, name: 'Captain' });
    const hands = crew.filter((m) => !used.has(m.row));
    for (let i = 0; i < 4; i++) this.party.push({ walker: mk(hands[i] ?? null, false), name: names[i] });
    const sx = landing.sandX;
    const sz = landing.sandZ;
    const fx = landing.dx;
    const fz = landing.dz;
    cap.place(sx + fx * 1.2, sz + fz * 1.2, yaw);
    this.march = yaw;
    this.party.slice(1).forEach((p, i) => {
      const side = i % 2 ? 1 : -1;
      const back = i < 2 ? 0.6 : -0.9;
      const x = sx + fx * back - fz * side * (1.3 + (i >> 1) * 0.5);
      const z = sz + fz * back + fx * side * (1.3 + (i >> 1) * 0.5);
      p.walker.place(x, z, yaw + side * 0.3);
    });
    for (const p of this.party) {
      p.walker.visible = true;
      p.walker.idle = 'stand';
      this.crew.figures.add(p.walker);
    }
  }

  /** Everyone back in the boat and aboard; the boat is hoisted in. */
  leave() {
    if (!this.active) return;
    this.active = false;
    for (const p of this.party) {
      this.crew.figures.delete(p.walker);
      if (p.walker.ownsRow) this.crew.freeRow(p.walker.row);
    }
    this.party.length = 0;
    this.captain = null;
    if (this.ship) this.crew.welcomeBack(this.ship);
    this.ship = null;
    const g = this.ground;
    for (const b of this.boatBlocks) g.blocks.splice(g.blocks.indexOf(b), 1);
    this.boatBlocks = [];
    this.boat.visible = false;
    this.landing = null;
    // camps that gave chase settle back down round their fires
    for (const c of this.camps) {
      if (c.routed || !c.alert) continue;
      c.alert = false;
      this.restCamp(c);
    }
  }

  /** The boat's place on the beach (for the HUD and the chart). */
  get boatPos() {
    return this.boat.position;
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number, world: World, inp: ShoreInput, focus: THREE.Vector3) {
    this.time += dt;
    // hit-stop: the island freezes for a heartbeat as a heavy blow lands
    if (this.stop > 0) {
      this.stop -= dt;
      dt *= 0.08;
    }
    const all = this.all;
    all.length = 0;
    // camps come alive near the camera
    for (const c of this.camps) {
      const live = Math.hypot(c.site.x - focus.x, c.site.z - focus.z) < CAMP_LIVE;
      if (live !== c.live) {
        c.live = live;
        for (const w of c.gang) {
          w.visible = live;
          if (live) this.crew.figures.add(w);
          else this.crew.figures.delete(w);
        }
      }
      this.campFx(c, dt, world, focus);
      if (live) for (const w of c.gang) all.push(w);
    }
    if (this.active) for (const p of this.party) all.push(p.walker);
    for (const w of all) w.tick(dt);

    const cap = this.captain;
    if (this.active && cap) {
      this.steerCaptain(dt, inp, world);
      this.thinkParty(dt);
    }
    for (const c of this.camps) if (c.live) this.thinkCamp(c, dt, world);
    this.move(all, dt, world);
    this.resolve(all, world);
    for (const w of all) {
      const run = clamp((w.stride - WALK) / (RUN - WALK), 0, 1);
      w.animate(dt, world.time, run);
      w.place3(this.ground.height(w.x, w.z));
    }
    this.gather();
  }

  /** The alert foes near the party, nearest first (for bars and the battle check). */
  private gather() {
    const f = this.foes;
    f.length = 0;
    const cap = this.captain;
    if (!this.active || !cap) return;
    for (const c of this.camps) {
      if (!c.live || !c.alert) continue;
      for (const w of c.gang) if (w.alive && Math.hypot(w.x - cap.x, w.z - cap.z) < 40) f.push(w);
    }
  }

  /** The pistol's reload: 0 just fired .. 1 loaded. */
  get pistolLoad() {
    return 1 - this.pistolT / PISTOL_RELOAD;
  }

  get fighting() {
    return this.foes.length > 0;
  }

  private steerCaptain(dt: number, inp: ShoreInput, world: World) {
    const cap = this.captain!;
    if (cap.down) {
      cap.vx = cap.vz = 0;
      return;
    }
    const len = Math.min(1, Math.hypot(inp.mx, inp.mz));
    const fighting = this.fighting;
    // a fighting stance is a shuffle; out of a fight you can run
    const top = inp.run && !cap.cutting ? RUN : WALK;
    const wade = 1 - Math.min(0.5, cap.wade * 0.65);
    const busy = cap.cutting ? 0.25 : cap.aim > 0 ? 0.35 : 1;
    const wx = (len > 0.02 ? inp.mx : 0) * top * wade * busy;
    const wz = (len > 0.02 ? inp.mz : 0) * top * wade * busy;
    const k = damp(len > 0.02 ? 10 : 14, dt);
    cap.vx += (wx - cap.vx) * k;
    cap.vz += (wz - cap.vz) * k;
    if (len > 0.1 && !cap.cutting) cap.wantYaw = Math.atan2(inp.mx, inp.mz);
    this.stillT = len > 0.05 ? 0 : this.stillT + dt;
    // the wedge follows the way you walk, not every twitch of the stick
    if (Math.hypot(cap.vx, cap.vz) > 1) this.march += angleDelta(this.march, Math.atan2(cap.vx, cap.vz)) * damp(2.2, dt);

    // the cutlass: chain up to three cuts, the last a lunge
    this.comboT -= dt;
    if (inp.strike) {
      if (cap.cutting && cap.cutT > CUT_WIND[cap.cut]) this.queued = true;
      else if (!cap.cutting) this.cutNow(cap, inp.aim);
    }
    if (!cap.cutting && this.queued) {
      this.queued = false;
      this.cutNow(cap, inp.aim);
    }
    if (cap.cutting) this.sheathT = 0;
    else if (!fighting) {
      this.sheathT += dt;
      if (this.sheathT > 4) cap.armed = false;
    }
    if (fighting && !cap.armed) cap.armed = true;

    // the pistol: one ball, a slow reload
    this.pistolT = Math.max(0, this.pistolT - dt);
    if (inp.pistol && this.pistolT <= 0 && this.shotAt < 0) {
      const t = this.pistolTarget(cap, inp.aim);
      if (t) cap.wantYaw = Math.atan2(t.x - cap.x, t.z - cap.z);
      else if (inp.aim) cap.wantYaw = Math.atan2(inp.aim.x - cap.x, inp.aim.z - cap.z);
      cap.target = t;
      this.shotAt = 0;
      cap.aim = 1;
    }
    if (this.shotAt >= 0) {
      this.shotAt += dt;
      if (this.shotAt > 0.24 && this.pistolT <= 0) this.fire(cap, world);
      if (this.shotAt > 0.7) {
        this.shotAt = -1;
        cap.aim = 0;
      }
    }
    cap.turn(dt, cap.cutting ? 16 : 11);
  }

  private cutNow(cap: Walker, aim: { x: number; z: number } | null) {
    if (this.comboT < 0) this.combo = 0;
    const cut = (this.combo % 3) as Cut;
    // lock on to whoever is in reach in front (or under the pointer)
    let best: Walker | null = null;
    let bs = Infinity;
    const want = aim ? Math.atan2(aim.x - cap.x, aim.z - cap.z) : cap.wantYaw;
    for (const c of this.camps) {
      if (!c.live) continue;
      for (const w of c.gang) {
        if (!w.alive || w.down) continue;
        const d = Math.hypot(w.x - cap.x, w.z - cap.z);
        if (d > 3.6) continue;
        const off = Math.abs(angleDelta(want, Math.atan2(w.x - cap.x, w.z - cap.z)));
        const s = d + off * 1.6;
        if (s < bs) {
          bs = s;
          best = w;
        }
      }
    }
    if (best) cap.wantYaw = Math.atan2(best.x - cap.x, best.z - cap.z);
    else if (aim) cap.wantYaw = want;
    cap.yaw += angleDelta(cap.yaw, cap.wantYaw) * 0.6;
    if (!cap.swing(cut)) return;
    this.combo++;
    this.comboT = 0.95;
    cap.cooldown = 0.04;
    this.sheathT = 0;
    if (cut === 2) {
      // the lunge carries you in
      cap.kx += Math.sin(cap.yaw) * 4.2;
      cap.kz += Math.cos(cap.yaw) * 4.2;
    }
  }

  private pistolTarget(cap: Walker, aim: { x: number; z: number } | null): Walker | null {
    let best: Walker | null = null;
    let bs = Infinity;
    const face = aim ? Math.atan2(aim.x - cap.x, aim.z - cap.z) : cap.yaw;
    for (const c of this.camps) {
      if (!c.live) continue;
      for (const w of c.gang) {
        if (!w.alive || w.down) continue;
        const d = Math.hypot(w.x - cap.x, w.z - cap.z);
        if (d > PISTOL_RANGE) continue;
        const off = Math.abs(angleDelta(face, Math.atan2(w.x - cap.x, w.z - cap.z)));
        const s = d * 0.15 + off * (aim ? 3 : 1.2);
        if (s < bs) {
          bs = s;
          best = w;
        }
      }
    }
    return best;
  }

  private fire(cap: Walker, world: World) {
    this.pistolT = PISTOL_RELOAD;
    const t = cap.target;
    // the muzzle sits at the end of the outstretched left arm
    const s = Math.sin(cap.yaw);
    const c = Math.cos(cap.yaw);
    _hand.set(cap.x + s * 0.75 + c * 0.2, cap.y + 1.42, cap.z + c * 0.75 - s * 0.2);
    const p = world.particles;
    p.emit({ x: _hand.x, y: _hand.y, z: _hand.z, life: 0.08, size: 0.5, sizeEnd: 0.9, color: [9, 6, 2.4], colorEnd: [4, 1.6, 0.3], kind: 0, fadeIn: 0.001 }, true);
    for (let i = 0; i < 6; i++) {
      p.emit({
        x: _hand.x, y: _hand.y, z: _hand.z, vx: s * (1.5 + i * 0.5) + (Math.random() - 0.5), vy: 0.4 + Math.random() * 0.5, vz: c * (1.5 + i * 0.5) + (Math.random() - 0.5),
        life: 1.6 + Math.random(), size: 0.25, sizeEnd: 1.4 + Math.random(), color: [1.05, 1.03, 1], alpha: 0.5, drag: 1.4, grav: -0.25, kind: 1, fadeIn: 0.02,
      });
    }
    const [vol, pan, d] = world.soundAt(_hand);
    world.audio.pistol(vol, pan, d);
    this.hooks.shake(0.06);
    if (!t || !t.alive || t.down) return;
    const dist = Math.hypot(t.x - cap.x, t.z - cap.z);
    if (Math.random() > 0.95 - dist * 0.012) {
      this.hooks.floater('Missed', _v.set(t.x, t.y + 2.2, t.z), '');
      return;
    }
    this.hurt(t, cap, 38 + Math.random() * 10, world, true, true);
  }

  // ---------------------------------------------------------------- the landing party's hands

  private thinkParty(dt: number) {
    const cap = this.captain!;
    const hands = this.party.slice(1).map((p) => p.walker);
    const foes = this.foes;
    const fight = foes.length > 0;
    this.calmT = fight ? 0 : this.calmT + dt;
    // a man down gets back up once the fighting is over
    for (const w of hands) if (w.down && this.calmT > 2.5 && w.downT > 2) w.getUp(w.maxHp * 0.4);
    // regain breath between fights
    for (const p of this.party) {
      const w = p.walker;
      if (!fight && !w.down && this.time - w.lastHurt > 5) w.hp = Math.min(w.maxHp, w.hp + dt * 6);
    }
    // who's going for the captain? the nearest free hand runs to stop them
    const covering = new Map<Walker, Walker>();
    for (const f of foes) {
      if (f.target !== cap || f.down || Math.hypot(f.x - cap.x, f.z - cap.z) > 5) continue;
      let best: Walker | null = null;
      let bd = Infinity;
      for (const h of hands) {
        if (!h.ready || covering.has(h)) continue;
        const d = Math.hypot(h.x - f.x, h.z - f.z);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      if (best) covering.set(best, f);
    }
    const sm = Math.sin(this.march);
    const cm = Math.cos(this.march);
    hands.forEach((w, i) => {
      if (w.down) return;
      // pick a fight
      if (fight) {
        w.armed = true;
        const cover = covering.get(w);
        if (cover) w.target = cover;
        if (!w.target || !w.target.alive || w.target.down || Math.hypot(w.target.x - cap.x, w.target.z - cap.z) > 17) {
          w.target = null;
          let bd = Infinity;
          for (const f of foes) {
            if (f.down) continue;
            // spread out: a man already taken counts as further away
            const taken = hands.filter((o) => o !== w && o.target === f).length;
            const d = Math.hypot(f.x - w.x, f.z - w.z) + taken * 4 + (f.target === cap ? -3 : 0);
            if (d < bd) {
              bd = d;
              w.target = f;
            }
          }
        }
        if (w.target) {
          this.duel(w, w.target, dt, i, 0.28);
          return;
        }
      } else {
        w.target = null;
        if (this.calmT > 3) w.armed = false;
      }
      // in the wedge behind the captain
      const slot = SLOTS[i];
      const tx = cap.x + sm * slot[1] - cm * slot[0] + cap.vx * 0.35;
      const tz = cap.z + cm * slot[1] + sm * slot[0] + cap.vz * 0.35;
      const dx = tx - w.x;
      const dz = tz - w.z;
      const d = Math.hypot(dx, dz);
      const capV = Math.hypot(cap.vx, cap.vz);
      if (d > 0.5) {
        const sp = clamp(d * 1.8 + capV * 0.6, 0, RUN * 1.08) * (1 - Math.min(0.45, w.wade * 0.6));
        w.vx += ((dx / d) * sp - w.vx) * damp(6, dt);
        w.vz += ((dz / d) * sp - w.vz) * damp(6, dt);
        w.wantYaw = Math.atan2(w.vx, w.vz);
        w.idle = 'stand';
        w.idleT = 0;
      } else {
        w.vx *= 1 - damp(8, dt);
        w.vz *= 1 - damp(8, dt);
        this.atEase(w, i, dt);
      }
      // left far behind (a cliff between you): catch up out of sight
      if (d > 45) w.place(tx, tz, this.march);
      w.turn(dt, 7);
    });
  }

  /** Stood about while the captain looks around: watch the sea, chat, then sit down on the sand. */
  private atEase(w: Walker, i: number, dt: number) {
    w.idleT += dt;
    const cap = this.captain!;
    if (this.stillT < 2.5) {
      w.idle = 'stand';
      w.lookT -= dt;
      if (w.lookT < 0) {
        w.lookT = 1.5 + Math.random() * 3;
        w.lookYaw = (Math.random() - 0.5) * 1.6;
      }
      return;
    }
    if (w.idleT < 0.1 || (w.idle === 'stand' && w.idleT > 3)) {
      const r = (i * 0.37 + this.stillT * 0.013 + w.seed) % 1;
      w.idle = this.stillT > 14 && i !== 0 ? 'ground' : r < 0.3 ? 'watch' : r < 0.6 ? 'chat' : r < 0.8 ? 'lean' : 'stand';
      w.idleT = 0.2;
    }
    if (w.idle === 'chat') {
      // turn to the nearest mate
      const mate = this.party[1 + (i ^ 1)]?.walker;
      if (mate) w.wantYaw = Math.atan2(mate.x - w.x, mate.z - w.z);
    } else if (w.idle === 'watch' || w.idle === 'ground') {
      // face the way the captain looks
      w.wantYaw = cap.yaw + (i - 1.5) * 0.25;
    }
  }

  /** Fight `t`: close in at your own angle round them, circle, cut when ready, parry theirs. */
  private duel(w: Walker, t: Walker, dt: number, k: number, parry: number) {
    if (!w.ready) {
      w.vx *= 1 - damp(10, dt);
      w.vz *= 1 - damp(10, dt);
      return;
    }
    const dx = t.x - w.x;
    const dz = t.z - w.z;
    const d = Math.hypot(dx, dz) || 1e-3;
    w.wantYaw = Math.atan2(dx, dz);
    // stand off at a spot round the target of your own, so a gang surrounds rather than stacks
    const ang = Math.atan2(-dx, -dz) + Math.sin(this.time * 0.5 + w.seed) * 0.5 + ((k % 3) - 1) * 0.35;
    const want = 1.45;
    const gx = t.x + Math.sin(ang) * want;
    const gz = t.z + Math.cos(ang) * want;
    const ex = gx - w.x;
    const ez = gz - w.z;
    const ed = Math.hypot(ex, ez);
    const sp = d > 6 ? RUN * 0.92 : d > 2.4 ? WALK * 1.25 : clamp(ed * 2.2, 0, 1.6);
    if (ed > 0.15) {
      w.vx += ((ex / ed) * sp - w.vx) * damp(7, dt);
      w.vz += ((ez / ed) * sp - w.vz) * damp(7, dt);
    } else {
      w.vx *= 1 - damp(8, dt);
      w.vz *= 1 - damp(8, dt);
    }
    if (d > 6) w.wantYaw = Math.atan2(w.vx, w.vz);
    // they're winding up at me: maybe get the blade across
    if (t.cutting && t.target === w && t.cutT < CUT_WIND[t.cut] && w.parry <= 0 && !w.cutting && d < 2.6 && Math.random() < parry * dt * 12) w.parry = 0.42;
    if (d < REACH + 0.2 && w.cooldown <= 0 && !w.cutting && w.parry <= 0) {
      w.swing(Math.random() < 0.55 ? 0 : 1);
      w.cooldown = (w.team === 'foe' ? 1.25 : 1.0) + Math.random() * 0.6;
    }
    w.turn(dt, 10);
  }

  // ---------------------------------------------------------------- the camps

  private thinkCamp(c: Camp, dt: number, world: World) {
    const cap = this.active ? this.captain : null;
    const f = c.layout.fire;
    // the party comes too close: up and at them
    if (!c.alert && !c.routed && cap && !this.defeated) {
      let near = Infinity;
      for (const p of this.party) {
        const w = p.walker;
        near = Math.min(near, Math.hypot(w.x - f.x, w.z - f.z) - CAMP_ALARM);
        for (const g of c.gang) if (g.alive && !g.down) near = Math.min(near, Math.hypot(w.x - g.x, w.z - g.z) - 9);
      }
      if (near < 0) this.raise(c, world);
    }
    const party = this.active ? this.party.map((p) => p.walker) : [];
    c.gang.forEach((w, k) => {
      if (w.down) return;
      if (c.alert && cap) {
        // pick (or keep) a man to fight: the captain draws the most blades
        if (!w.target || w.target.down || !w.target.alive || Math.random() < dt * 0.15) {
          let best: Walker | null = null;
          let bd = Infinity;
          for (const p of party) {
            if (p.down) continue;
            const taken = c.gang.filter((o) => o !== w && o.target === p).length;
            const d = Math.hypot(p.x - w.x, p.z - w.z) + taken * 3 - (p === cap ? 2.5 : 0);
            if (d < bd) {
              bd = d;
              best = p;
            }
          }
          w.target = best;
        }
        const t = w.target;
        // too far from home and nobody pressing: give up and walk back
        if (!t || Math.hypot(t.x - f.x, t.z - f.z) > LEASH) {
          w.target = null;
          this.goHome(w, c, k, dt);
          return;
        }
        w.armed = true;
        this.duel(w, t, dt, k, w.maxHp > FOE_HP ? 0.36 : 0.22);
        return;
      }
      this.goHome(w, c, k, dt);
    });
    // a gang that's lost its quarry stands down
    if (c.alert && !c.routed && c.gang.every((w) => w.down || !w.target)) {
      const home = c.gang.every((w) => w.down || Math.hypot(w.x - f.x, w.z - f.z) < 9);
      if (home || !cap) {
        c.alert = false;
        for (const w of c.gang) {
          w.armed = false;
          if (!w.down) w.hp = w.maxHp;
        }
      }
    }
  }

  /** Back to your place by the fire (and, now and then, a stroll to another one). */
  private goHome(w: Walker, c: Camp, k: number, dt: number) {
    w.idleT -= dt;
    let s = c.spots[(k + (w.idleT < -40 ? 1 : 0)) % c.spots.length];
    if (w.idleT < -40) {
      w.idleT = 10 + Math.random() * 20;
      // swap places with an empty spot
      const free = c.spots.filter((o) => !c.gang.some((g) => g !== w && Math.hypot(g.x - o.x, g.z - o.z) < 0.6));
      s = free[Math.floor(Math.random() * free.length)] ?? s;
    }
    const dx = s.x - w.x;
    const dz = s.z - w.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.35) {
      const sp = Math.min(c.alert ? WALK : 1.35, d * 1.5 + 0.3);
      w.vx += ((dx / d) * sp - w.vx) * damp(5, dt);
      w.vz += ((dz / d) * sp - w.vz) * damp(5, dt);
      w.wantYaw = Math.atan2(dx, dz);
      w.idle = 'stand';
      w.seatH = 0;
    } else {
      w.vx *= 1 - damp(8, dt);
      w.vz *= 1 - damp(8, dt);
      w.idle = s.idle;
      w.seatH = s.seatH;
      w.wantYaw = s.yaw;
      if (!c.alert) w.armed = false;
    }
    w.turn(dt, 6);
  }

  private raise(c: Camp, world: World) {
    c.alert = true;
    for (const w of c.gang) {
      if (w.down) continue;
      w.armed = true;
      w.shout = 0.9 + Math.random() * 0.4;
      w.idle = 'stand';
      w.seatH = 0;
    }
    const [vol, pan, d] = world.soundAt(c.layout.fire);
    world.audio.shout(vol, pan, d, false, Math.min(5, c.gang.length));
    for (const p of this.party) {
      p.walker.armed = true;
      if (p.walker !== this.captain) p.walker.shout = 0.6;
    }
    this.hooks.alarm(c);
  }

  // ---------------------------------------------------------------- movement

  private move(all: Walker[], dt: number, world: World) {
    const g = this.ground;
    // nobody stands inside anybody else
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const d2 = dx * dx + dz * dz;
        const min = a.down || b.down ? 0.45 : 0.62;
        if (d2 > min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5 * Math.min(1, dt * 10);
        const ka = a.down ? 0.2 : 1;
        const kb = b.down ? 0.2 : 1;
        a.x += (dx / d) * push * ka;
        a.z += (dz / d) * push * ka;
        b.x -= (dx / d) * push * kb;
        b.z -= (dz / d) * push * kb;
      }
    }
    for (const w of all) {
      const kd = damp(w.down ? 4 : 7, dt);
      w.kx -= w.kx * kd;
      w.kz -= w.kz * kd;
      const mx = (w.down ? 0 : w.vx) + w.kx;
      const mz = (w.down ? 0 : w.vz) + w.kz;
      const px = w.x;
      const pz = w.z;
      g.step(w.x, w.z, mx * dt, mz * dt, BODY, _o);
      w.x = _o.x;
      w.z = _o.z;
      const moved = Math.hypot(w.x - px, w.z - pz) / Math.max(dt, 1e-4);
      w.stride += ((w.down ? 0 : moved) - w.stride) * damp(12, dt);
      const h = g.height(w.x, w.z);
      w.wade = Math.max(0, -h);
      if (w.stride < 0.08) continue;
      // footfalls twice a stride: ~1.4 m walking, longer at a run
      const before = w.phase;
      w.phase += ((moved * dt) / (w.stride > 4 ? 2 : 1.4)) * Math.PI;
      if (Math.floor(before / Math.PI) !== Math.floor(w.phase / Math.PI)) this.footfall(w, world);
      if (w.phase > 1e4) w.phase -= Math.PI * 2000;
    }
  }

  private footfall(w: Walker, world: World) {
    const wet = w.wade > 0.08;
    if (w === this.captain) this.hooks.step(clamp(w.stride / RUN, 0.3, 1), wet);
    const p = world.particles;
    if (wet) {
      if (Math.random() < 0.7) {
        const y = world.waterHeight(w.x, w.z);
        for (let i = 0; i < 3; i++) {
          p.emit({
            x: w.x, y, z: w.z, vx: (Math.random() - 0.5) * 1.6 + w.vx * 0.2, vy: 1.4 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 1.6 + w.vz * 0.2,
            life: 0.5 + Math.random() * 0.3, size: 0.09 + Math.random() * 0.08, sizeEnd: 0.05, color: [1.3, 1.4, 1.45], alpha: 0.85, grav: 11, drag: 0.8, kind: 0, fadeIn: 0.01,
          });
        }
      }
    } else if (w.stride > 3.6 && Math.random() < 0.5) {
      // sand kicked up at a run
      p.emit({
        x: w.x, y: w.y + 0.05, z: w.z, vx: -w.vx * 0.15, vy: 0.5, vz: -w.vz * 0.15,
        life: 0.9, size: 0.25, sizeEnd: 0.9, color: [0.95, 0.85, 0.66], alpha: 0.35, drag: 2.2, grav: 0.4, kind: 1, fadeIn: 0.03,
      });
    }
  }

  // ---------------------------------------------------------------- blows

  private resolve(all: Walker[], world: World) {
    for (const a of all) {
      if (!a.cutting || a.hitDone || a.cutT < CUT_HIT[a.cut] || a.down) continue;
      a.hitDone = true;
      const reach = a.cut === 2 ? LUNGE : REACH;
      const arc = a.cut === 1 ? 1.65 : 1.05;
      const hits: Walker[] = [];
      for (const b of all) {
        if (b.team === a.team || !b.alive || b.down) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > reach + 0.15) continue;
        if (Math.abs(angleDelta(a.yaw, Math.atan2(dx, dz))) > arc) continue;
        hits.push(b);
      }
      const at = _w.set(a.x + Math.sin(a.yaw) * 1.1, a.y + 1.15, a.z + Math.cos(a.yaw) * 1.1);
      const [vol, pan, dd] = world.soundAt(at);
      if (!hits.length) {
        world.audio.swish(vol, pan);
        continue;
      }
      // the backhand sweeps through two; the others find one
      hits.sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z));
      const cap = a === this.captain;
      for (const b of hits.slice(0, a.cut === 1 ? 2 : 1)) {
        const facing = Math.abs(angleDelta(b.yaw, Math.atan2(a.x - b.x, a.z - b.z))) < 1.3;
        if (b.parry > 0 && facing && !(cap && a.cut === 2)) {
          // steel meets steel
          this.sparks(_v.set((a.x + b.x) / 2, a.y + 1.3, (a.z + b.z) / 2), world, 10);
          world.audio.clash(vol, pan, dd);
          a.stagger = 0.4;
          a.cutT = -1;
          a.kx -= Math.sin(a.yaw) * 1.6;
          a.kz -= Math.cos(a.yaw) * 1.6;
          if (cap || b === this.captain) this.hooks.shake(0.05);
          continue;
        }
        const base = cap ? [20, 17, 31][a.cut] : a.team === 'foe' ? (a.maxHp > FOE_HP ? 15 : 10) : 12;
        this.hurt(b, a, base * (0.85 + Math.random() * 0.3), world, a.cut === 2, cap);
      }
    }
  }

  /** `b` takes a blow (or a ball) from `a`. */
  private hurt(b: Walker, a: Walker, dmg: number, world: World, heavy: boolean, byCaptain: boolean) {
    b.hp -= dmg;
    b.lastHurt = this.time;
    b.flinch = 0.3;
    // a blow cuts a wind-up short (the captain shrugs off a light one)
    if (b.cutting && (b !== this.captain || heavy || b.cutT < CUT_WIND[b.cut])) b.cutT = -1;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz) || 1;
    const push = heavy ? 5 : 2.6;
    b.kx += (dx / d) * push;
    b.kz += (dz / d) * push;
    if (b.team === 'foe' && !b.target) b.target = a;
    const at = _v.set(b.x, b.y + 1.2, b.z);
    const [vol, pan, dd] = world.soundAt(at);
    world.audio.thwack(vol, pan, dd, heavy);
    this.dust(at, world, heavy ? 1.3 : 0.8);
    if (byCaptain) {
      this.hooks.floater(`${Math.round(dmg)}`, _w.set(b.x, b.y + 2.2, b.z), '');
      this.hooks.shake(heavy ? 0.12 : 0.06);
      this.stop = heavy ? 0.085 : 0.05;
    } else if (b === this.captain) {
      this.hooks.floater(`-${Math.round(dmg)}`, _w.set(b.x, b.y + 2.2, b.z), 'bad');
      this.hooks.shake(0.14);
    }
    if (b.hp > 0) return;
    b.hp = 0;
    b.knockDown();
    b.kx *= 1.4;
    b.kz *= 1.4;
    world.audio.thwack(vol * 0.8, pan, dd, true);
    if (byCaptain) this.stop = 0.12;
    // a puff of sand where they land, and stars for the knocked-out
    setTimeout(() => this.dust(_v.set(b.x, b.y + 0.2, b.z), world, 1.8), 380);
    for (let i = 0; i < 4; i++) world.particles.sparkle(_v.set(b.x, b.y + 0.4, b.z), [1.4, 1.2, 0.5], 0.5);
    if (b === this.captain) {
      this.defeated = true;
      this.hooks.defeat();
      return;
    }
    if (b.team === 'foe') {
      const camp = this.camps.find((c) => c.gang.includes(b));
      if (camp && !camp.routed && camp.gang.every((w) => w.down)) this.rout(camp, world);
    }
  }

  private rout(c: Camp, world: World) {
    c.routed = true;
    c.alert = false;
    for (const p of this.party) {
      const w = p.walker;
      if (w.down) continue;
      w.target = null;
      if (w !== this.captain) w.cheer = 2.6 + Math.random() * 0.6;
    }
    const cap = this.captain;
    if (cap) world.audio.shout(0.8, 0, 0, true, 4);
    this.hooks.routed(c);
  }

  private sparks(at: THREE.Vector3, world: World, n: number) {
    for (let i = 0; i < n; i++) {
      world.particles.emit({
        x: at.x, y: at.y, z: at.z, vx: (Math.random() - 0.5) * 7, vy: Math.random() * 4.5, vz: (Math.random() - 0.5) * 7,
        life: 0.18 + Math.random() * 0.22, size: 0.08 + Math.random() * 0.06, sizeEnd: 0.02, color: [9, 7, 3.2], colorEnd: [4, 1.6, 0.3], grav: 9, drag: 1.2, kind: 2, fadeIn: 0.001,
      }, true);
    }
    world.particles.emit({ x: at.x, y: at.y, z: at.z, life: 0.08, size: 0.5, sizeEnd: 0.9, color: [6, 5, 3], colorEnd: [2, 1, 0.3], kind: 0, fadeIn: 0.001 }, true);
  }

  private dust(at: THREE.Vector3, world: World, k: number) {
    for (let i = 0; i < 3 + Math.round(k * 2); i++) {
      world.particles.emit({
        x: at.x + (Math.random() - 0.5) * 0.4, y: at.y, z: at.z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 2 * k, vy: 0.4 + Math.random() * k, vz: (Math.random() - 0.5) * 2 * k,
        life: 0.7 + Math.random() * 0.5, size: 0.3 * k, sizeEnd: 1.1 * k, color: [0.98, 0.9, 0.74], alpha: 0.42, drag: 2.4, grav: 0.3, kind: 1, fadeIn: 0.02,
      });
    }
  }

  // ---------------------------------------------------------------- the camps' fires, flags and chests

  private campFx(c: Camp, dt: number, world: World, focus: THREE.Vector3) {
    const L = c.layout;
    const d = Math.hypot(L.fire.x - focus.x, L.fire.z - focus.z);
    // the jolly roger flies downwind (and comes down when the camp is routed)
    if (d < 520) {
      c.flag.rotation.y = Math.atan2(-world.wind.dirZ, world.wind.dirX);
      if (c.routed && c.strike < 1) {
        c.strike = Math.min(1, c.strike + dt * 0.45);
        c.flag.position.y = L.flagTop.y - c.strike * 4.4;
        if (c.strike >= 1) c.flag.visible = false;
      }
    }
    // the lid swings open on its hinge
    if (c.opened && c.open < 1) {
      c.open = Math.min(1, c.open + dt * 1.6);
      const k = c.open;
      c.lid.rotation.x = -1.95 * (1 - (1 - k) ** 3) - Math.sin(k * Math.PI) * 0.12;
    }
    if (d > 190 || dt <= 0) return;
    // a crackling fire and its smoke, and the odd ember
    c.fireT += dt * (d < 90 ? 11 : 5);
    while (c.fireT > 1) {
      c.fireT -= 1;
      world.particles.flame(_v.set(L.fire.x, L.fire.y + 0.05, L.fire.z), 0.42);
    }
    if (Math.random() < dt * 2.5) {
      world.particles.emit({
        x: L.fire.x + (Math.random() - 0.5) * 0.4, y: L.fire.y + 0.4, z: L.fire.z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.8, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 0.8,
        life: 1 + Math.random(), size: 0.07, sizeEnd: 0.02, color: [8, 3.4, 0.8], colorEnd: [3, 0.6, 0.1], grav: -0.6, drag: 0.6, kind: 2, fadeIn: 0.01,
      }, true);
    }
  }

  /** What F (or a tap on the prompt) would do right now. */
  prompt(shipName: string): Prompt {
    const cap = this.captain;
    if (!this.active || !cap || cap.down || this.defeated) return null;
    const b = this.boat.position;
    if (Math.hypot(cap.x - b.x, cap.z - b.z) < 4.2) {
      if (this.fighting && this.foes.some((f) => !f.down && Math.hypot(f.x - cap.x, f.z - cap.z) < 12)) return { key: 'fight', title: 'Cutthroats on your heels', sub: 'Fight them off before you push off', ok: false };
      return { key: 'boat', title: `Row back to the ${shipName}`, sub: 'The hands climb in and pull for the ship', ok: true };
    }
    const c = this.chestNear();
    if (c) {
      if (!c.routed) return { key: 'chest', title: 'A locked chest', sub: 'Rout the camp to claim it', ok: false };
      return { key: 'chest', title: 'Open the cutthroats\' chest', sub: 'Their plunder is yours', ok: true };
    }
    return null;
  }

  private chestNear(): Camp | null {
    const cap = this.captain;
    if (!cap) return null;
    for (const c of this.camps) {
      if (!c.live || c.opened) continue;
      if (Math.hypot(c.layout.chest.x - cap.x, c.layout.chest.z - cap.z) < 2.4) return c;
    }
    return null;
  }

  /** Acts on the prompt: returns 'boat' to row back, or does the deed here. */
  interact(world: World): 'boat' | null {
    const p = this.prompt('');
    if (!p || !p.ok) return null;
    if (p.key === 'boat') return 'boat';
    const c = this.chestNear();
    if (c && c.routed && !c.opened) {
      c.opened = true;
      const cap = this.captain!;
      cap.wantYaw = Math.atan2(c.layout.chest.x - cap.x, c.layout.chest.z - cap.z);
      for (const pm of this.party) if (pm.walker !== cap && !pm.walker.down) pm.walker.cheer = 2.2;
      world.particles.treasure(_v.copy(c.layout.chest).setY(c.layout.chest.y + 0.6), [1.4, 1.1, 0.5], 3);
      this.hooks.plunder(c);
    }
    return null;
  }

  /** The figures and props to keep in the scene while nothing is ashore (warm-up draws them all). */
  warm() {
    this.boat.visible = true;
  }

  unwarm() {
    if (!this.active) this.boat.visible = false;
  }

  /** A fresh look at the camp nearest a point (for the chart and the HUD). */
  campAt(x: number, z: number, r: number) {
    return this.camps.find((c) => Math.hypot(c.site.x - x, c.site.z - z) < r) ?? null;
  }
}

/** Where each hand walks behind the captain: [to the right, ahead]. */
const SLOTS: [number, number][] = [
  [-1.5, -1.9],
  [1.5, -1.9],
  [-1.0, -3.7],
  [1.0, -3.7],
];

/** A cutthroat's rags: the pirate crews' looks, roughened, the boss in a long coat and tricorn. */
function foeLook(boss: boolean, rnd: () => number): Look {
  const l = makeLook('pirate', boss ? 'captain' : 'hand');
  if (!boss) {
    l.flags |= rnd() < 0.5 ? FLAG.kerchief : 0;
    l.flags |= rnd() < 0.35 ? FLAG.pistol : 0;
    if (l.hat === HAT.none && rnd() < 0.5) {
      l.hat = HAT.bandana;
      l.slots[TINT.hat] = [0.45, 0.04, 0.03, rnd() < 0.5 ? -1 : 0];
    }
  } else {
    l.flags = (l.flags & ~FLAG.parrot) | FLAG.beard | FLAG.belt | FLAG.pistol;
  }
  return l;
}

