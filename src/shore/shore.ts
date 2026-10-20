import * as THREE from 'three';
import { staticLod } from '../render/staticLod';
import { angleDelta, clamp, damp, lerp, mulberry32, smoothstep } from '../core/noise';
import { Builder, Bucket } from '../port/port';
import { CrewSystem, Look, makeLook } from '../ships/crew';
import { FLAG, HAT, TINT } from '../ships/crewModel';
import type { Ship } from '../ships/ship';
import type { World } from '../game/world';
import { BOAT_L, buildBoat, buildCamp, buildDigMarks, campFlag, CampLayout, CHEST_D, CHEST_H, chestParts, holeGeometry, ShoreMats, shoreMats, spoilGeometry } from './kit';
import { CampSite, Ground, Landing } from './ground';
import { fortToWorld, worldToFort } from './fortKit';
import { DeckFloor, Floor, Lines, railPoint } from './deck';
import { Cut, CUT_HIT, CUT_WIND, RUN, WALK, Walker } from './walker';
import { Hands } from './hands';

// Going ashore. The captain rows in with four hands, walks the islands on foot
// and the hands follow in a loose wedge, guard the captain's back and settle
// down on the sand when you stop for a look around. Some isles have a camp of
// cutthroats round a fire, who grab their blades and come running when you
// get close; your hands pick a man each, and run to cover anyone who goes for
// the captain. Rout the camp and its plunder chest is yours.
//
// The same blades serve at sea. Board a crippled pirate and the captain and
// hands swing across on lines to fight her crew for her rolling deck (see
// deck.ts); cut down her captain and enough of his men and the rest throw
// down their blades and go to their knees.

const CAP_HP = 120;
const HAND_HP = 75;
const FOE_HP = 52;
const BOSS_HP = 115;
/** How far ahead of a walker a cut reaches, and a lunge. */
const REACH = 2.0;
const LUNGE = 2.5;
const BODY = 0.3;
const PISTOL_RELOAD = 7;
const PISTOL_RANGE = 18;
/** Camps nearer the camera than this are simulated and drawn. */
const CAMP_LIVE = 270;
/** Spade-seconds to dig a treasure up (three diggers share them). */
const DIG_WORK = 16;
/** A camp takes up arms when the landing party comes this close to its fire. */
const CAMP_ALARM = 19;
/** ...and gives up the chase this far from home. */
const LEASH = 42;
/** A fort's garrison stands to when the party comes this close to the plaza's brazier, and chases this far. */
const FORT_ALARM = 31;
const FORT_LEASH = 78;
/** The garrison: soldiers, and their commandant. */
const GARRISON = 5;
const COMMANDANT_HP = 160;
/** A boarder's flight across on a line (s), and how high the leap carries over the rails. */
const SWING_T = 1.15;
const SWING_UP = 1.35;

export const HAND_NAMES = ['Bones', 'Patch', 'Old Hobb', 'Sully', 'Barnaby', 'Nell', 'Red Jack', 'Iko', 'Dutch', 'Mags', 'Tam', 'Quill', 'Rook', 'Bess', 'Finch', 'Salty'];

const _v = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _w = new THREE.Vector3();
const _o = { x: 0, z: 0 };
const _hand = new THREE.Vector3();
const _la = { x: 0, z: 0 };
const _lb = { x: 0, z: 0 };
const _rt = { x: 0, z: 0 };
const _wp = new THREE.Vector3();

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
  /** Seen through the captain's own eyes: they face where they look (null: they face where they walk). */
  face: number | null;
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
  /** The buried chest's lid comes up. */
  unearthed(at: THREE.Vector3): void;
  /** The captain is down. */
  defeat(): void;
  /** A foe is cut down for good: his ghost slips out of him. */
  fallen(w: Walker, boss: boolean): void;
  /** A boarded ship's crew is beaten: the survivors throw down their blades. */
  struck(prize: Ship): void;
  /** A boarder lands on her deck. */
  landed(w: Walker, captain: boolean): void;
  step(k: number, wet: boolean, deck: boolean): void;
}

/** A boarder on the way across: perched on your rail, then out over the gap on a line. */
interface Swing {
  /** Seconds before he leaps, and into the flight. */
  delay: number;
  t: number;
  /** Where he leaps from: a ship-local spot on the boarders' own rail (t along her, side). */
  fromT: number;
  /** Where he lands on her deck (ship-local to the prize). */
  lx: number;
  lz: number;
  /** The rigging the line hangs from (world, set at the leap). */
  pivot: THREE.Vector3;
  hand: THREE.Vector3;
  y: number;
  done: boolean;
}

/** A fort's walls, as the walkers see them: a square with its gate on the landward face (-z). */
export interface FortWalls {
  x: number;
  z: number;
  yaw: number;
  /** Half-width to the outer face, and the walls' thickness. */
  H: number;
  T: number;
}

/** A fort's garrison, handed to the shore like a camp. */
export interface Garrison {
  site: CampSite;
  layout: CampLayout & { flagDrop: number };
  walls: FortWalls;
}

export interface Camp {
  readonly index: number;
  readonly site: CampSite;
  readonly layout: CampLayout & { flagDrop?: number };
  /** Set when this is a fort's garrison rather than a camp of cutthroats. */
  readonly fort?: FortWalls;
  /** Nobody home: a fort of yours, its old garrison long gone. */
  empty?: boolean;
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
  /** Peaceful seas: the party is close, and the camp is on its feet watching them (but has drawn no blade). */
  wary?: boolean;
  /** Seat or post each cutthroat keeps when at ease. */
  spots: { x: number; z: number; yaw: number; idle: 'sit' | 'warm' | 'watch' | 'lean' | 'chat' | 'stand'; seatH: number }[];
}

export interface PartyMember {
  walker: Walker;
  name: string;
  /** How a hand keeps with the party between fights (not the captain). */
  follow?: Follow;
}

/** A hand on the march: his own place in a loose knot, drifting about it, his own pace and moments. */
interface Follow {
  /** His place: [to the captain's right, ahead] (m). Swapped with a mate's now and then. */
  slot: [number, number];
  /** Drifting about that place (m), and where to next. */
  wx: number;
  wz: number;
  tx: number;
  tz: number;
  wT: number;
  /** On the move, or stood (with some give before either changes). */
  going: boolean;
  /** A beat before he sets off after the captain. */
  wait: number;
  restT: number;
  /** A touch quicker or slower than the rest. */
  pace: number;
  /** Stopped to look at something, and when he'll next do so. */
  pauseT: number;
  nextPause: number;
  /** A glance about as he walks, and when he'll next look. */
  glance: number;
  glanceT: number;
  talkT: number;
  /** Walking into something without getting anywhere (s); then a few steps aside. */
  stuck: number;
  aside: number;
}

const newFollow = (i: number): Follow => ({
  slot: [SLOTS[i][0] + (Math.random() - 0.5) * 0.5, SLOTS[i][1] + (Math.random() - 0.5) * 0.8],
  wx: 0,
  wz: 0,
  tx: 0,
  tz: 0,
  wT: Math.random() * 2,
  going: false,
  wait: 0.15 + Math.random() * 0.5,
  restT: 0,
  pace: 0.92 + Math.random() * 0.16,
  pauseT: 0,
  nextPause: 8 + Math.random() * 20,
  glance: 0,
  glanceT: Math.random() * 3,
  talkT: 2 + Math.random() * 6,
  stuck: 0,
  aside: 0,
});

export type Prompt = { key: 'boat' | 'chest' | 'fight' | 'dig' | 'retreat'; title: string; sub: string; ok: boolean } | null;

export class Shore {
  readonly group = new THREE.Group();
  readonly camps: Camp[] = [];
  readonly mats: ShoreMats;
  /** The captain's hands and what's in them, for the first-person view. */
  readonly hands: Hands;
  /** Through the captain's eyes: their own figure is not drawn, the muzzle flash comes from the hands. */
  eyes = false;
  /** The foe the last cut or shot locked onto, and when (shore time), so the eyes can follow. */
  lockOn: Walker | null = null;
  lockT = -9;
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
  /** Till two hands next swap sides on the march. */
  private swapT = 20;
  /** Hit-stop: a few frames' pause when a heavy blow lands. */
  private stop = 0;
  defeated = false;
  time = 0;
  /** Foes the party is fighting right now (alert and near), for the HUD's bars. */
  readonly foes: Walker[] = [];
  private all: Walker[] = [];
  // buried treasure: the X on the sand, the hole, the spoil heap and the chest
  private site = new THREE.Group();
  private hole: THREE.Mesh;
  private spoil: THREE.Mesh;
  private bChest = new THREE.Group();
  private bLid = new THREE.Group();
  /** Where the treasure map's X is (null without a whole map). */
  treasure: THREE.Vector3 | null = null;
  /** 0..1 dug. */
  private digP = 0;
  private digging = false;
  /** Seconds since the spade struck the lid (-1 before). */
  private revealT = -1;
  private unearthedOnce = false;
  private diggers = new Map<Walker, { x: number; z: number; stroke: number }>();
  /** Spadefuls thrown, ever (the HUD's gauge kicks on each). */
  private strokes = 0;
  /** What the party stands on: the island, or a boarded ship's deck. */
  private floor: Floor;
  /** The deck being fought over, and the ship it belongs to (null ashore). */
  deck: DeckFloor | null = null;
  prize: Ship | null = null;
  /** Her crew, fighting for her deck. */
  readonly crewFoes: Walker[] = [];
  /** How many of them turned out (for morale), and whether they've struck. */
  private crewAt = 0;
  struck = false;
  /** Which of her sides the boarders' ship lies against (+1 port). */
  boardSide = 1;
  private swings = new Map<Walker, Swing>();
  /** Everyone the party may cut at right now (camps nearby, a boarded crew). */
  private hostile: Walker[] = [];
  /** The grappling lines and boarding ropes (drawn by whoever runs the boarding). */
  readonly lines: Lines;

  /** Forts' walls, for walking round them to the gate. */
  private walls: FortWalls[] = [];

  /** Peaceful seas: a camp that holds its blades until the party strikes first (the game decides, per camp). */
  calm: (c: Camp) => boolean = () => false;

  constructor(
    readonly ground: Ground,
    sites: CampSite[],
    private crew: CrewSystem,
    private hooks: ShoreHooks,
    garrisons: Garrison[] = [],
  ) {
    this.group.name = 'shore';
    this.floor = ground;
    const mats = (this.mats = shoreMats());
    this.hands = new Hands(mats);
    this.group.add(this.hands.group);
    this.lines = new Lines(mats);
    this.group.add(this.lines.ropes, this.lines.hooks);
    // the ship's boat, hidden until it's pulled up on a beach
    const bb = new Builder();
    buildBoat(bb);
    bb.finish(this.boat, mats as unknown as Record<Bucket, THREE.Material>);
    this.boat.visible = false;
    this.group.add(this.boat);
    const parts = chestParts();
    // the X and its cairn, the hole and its heap, and the chest beneath (all hidden until a map is whole)
    const db = new Builder();
    buildDigMarks(db, 77);
    db.finish(this.site, mats as unknown as Record<Bucket, THREE.Material>);
    this.hole = this.mesh(holeGeometry(), 'wood');
    this.spoil = this.mesh(spoilGeometry(), 'wood');
    this.spoil.position.set(-1.45, 0, -0.7);
    this.spoil.rotation.y = 0.5;
    for (const [k, geo] of Object.entries(parts.body)) if (geo) this.bChest.add(this.mesh(geo, k as Bucket));
    for (const [k, geo] of Object.entries(parts.lid)) if (geo) this.bLid.add(this.mesh(geo, k as Bucket));
    this.bLid.position.set(0, CHEST_H, -CHEST_D / 2);
    this.bChest.add(this.bLid);
    this.bChest.rotation.set(0.12, 0.4, -0.08);
    this.site.add(this.hole, this.spoil, this.bChest);
    this.site.visible = false;
    this.group.add(this.site);
    const ground1 = (x: number, z: number) => ground.height(x, z);
    sites.forEach((site, i) => {
      const b = new Builder();
      const layout = buildCamp(b, site, ground1, 4100 + i * 37);
      const g = new THREE.Group();
      g.name = `camp-${i}`;
      b.finish(g, mats as unknown as Record<Bucket, THREE.Material>);
      this.group.add(g);
      staticLod.add(g);
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
    // the forts' garrisons: the same as a camp, behind stone walls (the fort itself is built elsewhere)
    garrisons.forEach((gr) => {
      const i = this.camps.length;
      for (const d of gr.layout.blocks) ground.blocks.push(d);
      this.walls.push(gr.walls);
      // the Brethren's colours, big enough to read from the sea
      const flag = campFlag(mats.flag);
      flag.scale.setScalar(2.3);
      flag.position.copy(gr.layout.flagTop);
      this.group.add(flag);
      const chest = new THREE.Group();
      const lid = new THREE.Group();
      for (const [k, geo] of Object.entries(parts.body)) if (geo) chest.add(this.mesh(geo, k as Bucket));
      for (const [k, geo] of Object.entries(parts.lid)) if (geo) lid.add(this.mesh(geo, k as Bucket));
      lid.position.set(0, CHEST_H, -CHEST_D / 2);
      chest.add(lid);
      chest.scale.setScalar(1.25);
      chest.position.copy(gr.layout.chest);
      chest.rotation.y = gr.layout.chestYaw;
      this.group.add(chest);
      const camp: Camp = { index: i, site: gr.site, layout: gr.layout, fort: gr.walls, gang: [], flag, lid, chest, alert: false, routed: false, opened: false, open: 0, strike: 0, live: false, fireT: 0, spots: [] };
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
    const fort = !!c.fort;
    const n = fort ? GARRISON + 1 : 3 + Math.floor(rnd() * 2) + (c.site.island.r > 85 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const boss = k === 0 && (fort || c.site.island.r > 70);
      const look = foeLook(boss, rnd);
      const row = this.crew.takeRow(look);
      const hp = boss ? (fort ? COMMANDANT_HP : BOSS_HP) : FOE_HP;
      const w = new Walker('foe', row, look, hp, boss ? (fort ? 1.2 : 1.16) : 0.94 + rnd() * 0.16, boss ? (fort ? 1.08 : 1.06) : 0.95 + rnd() * 0.1, true);
      if (fort) w.title = boss ? 'Commandant' : '';
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
    this.raiseParty(ship, 4);
    const cap = this.captain!;
    const sx = landing.sandX;
    const sz = landing.sandZ;
    const fx = landing.dx;
    const fz = landing.dz;
    cap.place(sx + fx * 1.2, sz + fz * 1.2, yaw);
    this.hands.dress(cap.look);
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

  /**
   * The captain and up to `n` hands off `ship`'s deck as walkers (their own
   * sailors, so faces and clothes match), named and with a place in the knot.
   */
  private raiseParty(ship: Ship, n: number) {
    const crew = this.crew.muster(ship, n);
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
    for (let i = 0; i < n; i++) this.party.push({ walker: mk(hands[i] ?? null, false), name: names[i], follow: newFollow(Math.min(i, SLOTS.length - 1)) });
  }

  /** Everyone back in the boat (or over the rail) and aboard; the boat is hoisted in. */
  leave() {
    if (!this.active) return;
    this.active = false;
    for (const p of this.party) {
      this.crew.figures.delete(p.walker);
      if (p.walker.ownsRow) this.crew.freeRow(p.walker.row);
    }
    this.stopDig();
    if (this.unearthedOnce) this.setTreasure(null);
    this.party.length = 0;
    this.captain = null;
    if (this.ship) this.crew.welcomeBack(this.ship);
    this.ship = null;
    this.endBoarding();
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

  // ---------------------------------------------------------------- boarding

  /**
   * Over the side and onto `prize`: the captain and `hands` of `ship`'s crew
   * perch on her rail and swing across one after another, while `foes` of the
   * prize's crew (her captain first, `bossHp` strong) wait for them on her
   * deck, blades out. The rest of her people have bolted below.
   */
  board(ship: Ship, prize: Ship, o: { hands: number; foes: number; bossHp: number; boss: string; hand: string }) {
    const plan = this.crew.deckPlan(prize);
    if (!plan) return false;
    this.leave();
    const deck = (this.deck = new DeckFloor(prize, plan));
    this.floor = deck;
    this.ship = ship;
    this.prize = prize;
    this.active = true;
    this.defeated = false;
    this.struck = false;
    this.pistolT = 0;
    this.combo = 0;
    this.calmT = 0;
    // which of her sides lies against ours, and which of ours against hers
    const pl = deck.toLocal(ship.pos.x, ship.pos.z, _o);
    this.boardSide = pl.x >= 0 ? 1 : -1;
    const ourSide = (prize.pos.x - ship.pos.x) * Math.cos(ship.heading) - (prize.pos.z - ship.pos.z) * Math.sin(ship.heading) >= 0 ? 1 : -1;
    this.raiseParty(ship, o.hands);
    // spread along her near rail, the captain in the middle of them
    const n = this.party.length;
    const z0 = plan.zAt(plan.main.t0) + 1.2;
    const z1 = plan.zAt(plan.main.t1) - 1.2;
    // the captain lands mid-deck; the hands fan out fore and aft of him
    const slots = this.party.map((_, i) => lerp(z0, z1, n > 1 ? (i + 0.5) / n : 0.5));
    const mid = slots.slice().sort((a, b) => Math.abs(a - (z0 + z1) / 2) - Math.abs(b - (z0 + z1) / 2));
    const Lp = ship.cls.length;
    this.party.forEach((m, i) => {
      const w = m.walker;
      const lz = mid[i] + (Math.random() - 0.5) * 0.5;
      const t = clamp(plan.tOf(lz), plan.main.t0, plan.main.t1);
      const lx = this.boardSide * (plan.halfWidth(plan.main, t) - 1.6 - Math.random() * 0.7);
      // straight across from our own rail
      const at = deck.toWorld(lx, lz, { x: 0, z: 0 });
      const ox = at.x - ship.pos.x;
      const oz = at.z - ship.pos.z;
      const fromT = clamp((ox * Math.sin(ship.heading) + oz * Math.cos(ship.heading)) / Lp + 0.5, 0.2, 0.8);
      const sw: Swing = { delay: i === 0 ? 0.35 : 0.1 + i * 0.22 + Math.random() * 0.12, t: 0, fromT: fromT * ourSide, lx, lz, pivot: new THREE.Vector3(), hand: new THREE.Vector3(), y: 0, done: false };
      this.swings.set(w, sw);
      w.visible = true;
      w.armed = true;
      w.hang = 0.5;
      w.idle = 'stand';
      railPoint(ship, fromT, ourSide, _v, 0.2);
      w.place(_v.x, _v.z, Math.atan2(at.x - _v.x, at.z - _v.z));
      sw.y = _v.y;
      this.crew.figures.add(w);
    });
    this.march = ship.heading;
    // her crew: those who stand and fight, the captain at their head
    const theirs = this.crew.muster(prize, 99, true).sort((a, b) => Number(b.captain) - Number(a.captain));
    this.crewFoes.length = 0;
    for (const m of theirs.slice(0, o.foes)) {
      const boss = m.captain;
      const w = new Walker('foe', m.row, m.look, boss ? o.bossHp : FOE_HP, m.girth * (boss ? 1.08 : 1), m.height * (boss ? 1.04 : 1), false);
      w.title = boss ? o.boss : o.hand;
      const l = deck.keep({ x: m.x, z: clamp(m.z, z0 - 0.8, z1 + 0.8) }, BODY + 0.1);
      const wp = deck.toWorld(l.x, l.z, { x: 0, z: 0 });
      w.place(wp.x, wp.z, m.yaw + prize.heading);
      w.visible = true;
      w.armed = true;
      w.shout = 0.6 + Math.random() * 0.8;
      w.idleT = Math.random() * 0.6;
      this.crewFoes.push(w);
      this.crew.figures.add(w);
    }
    this.crewAt = this.crewFoes.length;
    return true;
  }

  /** Lets go of a boarded deck: her fighters go back to being her crew (or stay below, as a prize's do). */
  private endBoarding(crewBack = true) {
    if (!this.deck) return;
    for (const w of this.crewFoes) this.crew.figures.delete(w);
    this.crewFoes.length = 0;
    this.swings.clear();
    if (this.prize && crewBack) this.crew.welcomeBack(this.prize);
    this.deck = null;
    this.prize = null;
    this.floor = this.ground;
    this.struck = false;
  }

  /** Off the deck of a prize sent away with a prize crew: her own people stay battened below. */
  leaveAsPrize() {
    if (this.deck) this.endBoarding(false);
    this.leave();
  }

  /** The boarders' flights across: perched, then out over the gap, then onto her planks. */
  private updateSwings(dt: number, world: World) {
    const air = new Set<Walker>();
    const deck = this.deck;
    const ship = this.ship;
    if (!deck || !ship) {
      this.swings.clear();
      return air;
    }
    for (const [w, sw] of this.swings) {
      sw.t += dt;
      const side = Math.sign(sw.fromT) || 1;
      railPoint(ship, Math.abs(sw.fromT), side, _v, 0.2);
      const to = deck.toWorld(sw.lx, sw.lz, { x: 0, z: 0 });
      const toY = deck.height(to.x, to.z);
      const u = (sw.t - sw.delay) / SWING_T;
      if (u < 0) {
        // crouched on the rail, a hand on the line, waiting his turn
        w.x = _v.x;
        w.z = _v.z;
        sw.y = _v.y;
        w.hang = 0.55;
        w.wantYaw = Math.atan2(to.x - w.x, to.z - w.z);
        w.turn(dt, 8);
        sw.pivot.set((_v.x + to.x) / 2, Math.max(_v.y, toY) + 7, (_v.z + to.z) / 2);
        air.add(w);
        continue;
      }
      if (u < 1) {
        if (sw.t - dt < sw.delay) {
          // the leap: a yell and a creak of the line taking the weight
          w.shout = 0.7;
          const [vol, pan, d] = world.soundAt(_v);
          world.audio.swish(vol * 0.9, pan);
          if (w === this.captain || Math.random() < 0.5) world.audio.shout(vol * 0.5, pan, d, true, 1);
        }
        const e = u * u * (3 - 2 * u);
        w.x = lerp(_v.x, to.x, e);
        w.z = lerp(_v.z, to.z, e);
        sw.y = lerp(_v.y, toY, e) + SWING_UP * Math.sin(Math.PI * Math.min(1, u * 1.08));
        w.hang = 1;
        w.wantYaw = Math.atan2(to.x - _v.x, to.z - _v.z);
        w.turn(dt, 10);
        sw.hand.set(w.x + Math.sin(w.yaw) * 0.12, sw.y + 2.05 * w.height, w.z + Math.cos(w.yaw) * 0.12);
        air.add(w);
        continue;
      }
      // down on her planks with a thump, carried a step on by the swing
      this.swings.delete(w);
      w.place(to.x, to.z, w.yaw);
      w.kx = Math.sin(w.yaw) * 2.2;
      w.kz = Math.cos(w.yaw) * 2.2;
      w.y = toY;
      this.dust(_w.set(to.x, toY + 0.1, to.z), world, 0.9);
      this.hooks.landed(w, w === this.captain);
    }
    // the hanging pose lets go as they find their feet
    for (const p of this.party) if (!air.has(p.walker) && p.walker.hang > 0) p.walker.hang = Math.max(0, p.walker.hang - dt * 3.5);
    return air;
  }

  /** The lines the boarders swing on, from the rigging overhead to each fist (for drawing). */
  swingLines(out: { from: THREE.Vector3; to: THREE.Vector3; slack: number }[]) {
    out.length = 0;
    for (const [w, sw] of this.swings) {
      if (sw.t < sw.delay) {
        // a line held ready, hanging slack from the yard
        sw.hand.set(w.x + Math.sin(w.yaw) * 0.25, sw.y + 1.55 * w.height, w.z + Math.cos(w.yaw) * 0.25);
        out.push({ from: sw.pivot, to: sw.hand, slack: 0.4 });
      } else out.push({ from: sw.pivot, to: sw.hand, slack: 0 });
    }
    return out;
  }

  /** Her crew fights for her deck: blades out to meet the boarders, every man for the nearest. */
  private thinkDeck(dt: number, air: Set<Walker> | null) {
    const deck = this.deck!;
    const party = this.party.map((p) => p.walker).filter((w) => !w.down && !air?.has(w));
    const cap = this.captain;
    this.crewFoes.forEach((w, k) => {
      if (w.down) return;
      if (w.yielded > 0 || this.struck) {
        w.vx *= 1 - damp(10, dt);
        w.vz *= 1 - damp(10, dt);
        return;
      }
      w.armed = true;
      if (!party.length || this.defeated) {
        // the boarders are still coming: face the rail they'll come over
        w.vx *= 1 - damp(6, dt);
        w.vz *= 1 - damp(6, dt);
        const r = deck.toWorld(this.boardSide * 3, deck.toLocal(w.x, w.z, _o).z, { x: 0, z: 0 });
        w.wantYaw = Math.atan2(r.x - w.x, r.z - w.z);
        w.turn(dt, 6);
        return;
      }
      if (!w.target || !w.target.standing || air?.has(w.target) || Math.random() < dt * 0.15) {
        let best: Walker | null = null;
        let bd = Infinity;
        for (const p of party) {
          const taken = this.crewFoes.filter((o) => o !== w && o.target === p).length;
          const d = Math.hypot(p.x - w.x, p.z - w.z) + taken * 2.5 - (p === cap ? 2 : 0);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        w.target = best;
      }
      if (w.target) this.duel(w, w.target, dt, k, w.maxHp > FOE_HP ? 0.38 : 0.22);
    });
  }

  /** Her crew's nerve: with her captain down and most of them cut down too, the rest throw in. */
  private morale(world: World) {
    if (this.struck || !this.prize) return;
    const up = this.crewFoes.filter((w) => w.standing).length;
    const boss = this.crewFoes.find((w) => w.maxHp > FOE_HP);
    const headless = !boss || boss.down;
    if (up > 0 && !(headless && up <= Math.max(1, Math.round(this.crewAt * 0.34)))) return;
    this.struck = true;
    let cry = 0;
    for (const w of this.crewFoes) {
      w.target = null;
      if (w.down) continue;
      w.armed = false;
      w.cutT = -1;
      w.parry = 0;
      w.yielded = 0.01;
      w.shout = 0;
      // "Quarter! Quarter!"
      if (cry++ < 2) setTimeout(() => this.hooks.floater('Quarter!', _w.set(w.x, w.y + 2.3, w.z), 'loot'), 150 + cry * 450);
    }
    for (const p of this.party) {
      const w = p.walker;
      w.target = null;
      if (!w.down && w !== this.captain) w.cheer = 2.6 + Math.random() * 0.6;
    }
    world.audio.shout(0.85, 0, 0, true, 5);
    this.hooks.struck(this.prize);
  }

  /** The captain has backed up against the rail our own ship lies alongside. */
  private atOwnRail() {
    const d = this.deck;
    const cap = this.captain;
    if (!d || !cap) return false;
    const l = d.toLocal(cap.x, cap.z, _o);
    const P = d.plan;
    const t = clamp(P.tOf(l.z), P.main.t0, P.main.t1);
    return l.x * this.boardSide > P.halfWidth(P.main, t) - 0.95;
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
      // (a fight on a ship's deck is no place to walk an island's cutthroats: they'd be walked on her planks)
      const live = !this.deck && !c.empty && Math.hypot(c.site.x - focus.x, c.site.z - focus.z) < CAMP_LIVE;
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
    // a boarded ship's crew, and everyone the party may fight
    const hostile = this.hostile;
    hostile.length = 0;
    for (const w of all) hostile.push(w);
    for (const w of this.crewFoes) {
      all.push(w);
      hostile.push(w);
    }
    if (this.active) for (const p of this.party) all.push(p.walker);
    for (const w of all) w.tick(dt);
    // boarders still on their way across stay out of the scrum till they land
    const air = this.swings.size ? this.updateSwings(dt, world) : null;
    const feet = air ? all.filter((w) => !air.has(w)) : all;

    const cap = this.captain;
    if (this.active && cap) {
      if (!air?.has(cap)) this.steerCaptain(dt, inp, world);
      this.thinkParty(dt, air);
      this.updateDig(dt, world);
    }
    for (const c of this.camps) if (c.live) this.thinkCamp(c, dt, world);
    if (this.deck) this.thinkDeck(dt, air);
    this.move(feet, dt, world);
    this.resolve(feet, world);
    for (const w of all) {
      const run = clamp((w.stride - WALK) / (RUN - WALK), 0, 1);
      w.animate(dt, world.time, run);
      this.stand(w, air);
      this.bladeTrail(w, world);
    }
    this.gather();
  }

  /** Poses a walker onto whatever is under its feet (or in the air on a line). */
  private stand(w: Walker, air: Set<Walker> | null) {
    const d = this.deck;
    const sw = air?.has(w) ? this.swings.get(w) : undefined;
    if (sw) w.place3(sw.y);
    else if (d) {
      const l = d.toLocal(w.x, w.z, _o);
      w.place3(d.localY(l.x, l.z));
      d.ride(w);
    } else w.place3(this.ground.height(w.x, w.z));
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
    for (const w of this.crewFoes) if (w.alive && w.yielded <= 0) f.push(w);
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
    // on the spade: walking off, or reaching for a weapon, puts it down (the hole stays dug)
    if (this.digging) {
      if (len > 0.3 || inp.strike || inp.pistol) this.stopDig();
      else return;
    }
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
    if (inp.face !== null) {
      if (!cap.cutting) cap.wantYaw = inp.face;
    } else if (len > 0.1 && !cap.cutting) cap.wantYaw = Math.atan2(inp.mx, inp.mz);
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
      if (t) {
        cap.wantYaw = Math.atan2(t.x - cap.x, t.z - cap.z);
        this.lockOn = t;
        this.lockT = this.time;
      }
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
    for (const w of this.hostile) {
      if (!w.standing) continue;
      const d = Math.hypot(w.x - cap.x, w.z - cap.z);
      if (d > 3.6) continue;
      const off = Math.abs(angleDelta(want, Math.atan2(w.x - cap.x, w.z - cap.z)));
      const s = d + off * 1.6;
      if (s < bs) {
        bs = s;
        best = w;
      }
    }
    if (best) cap.wantYaw = Math.atan2(best.x - cap.x, best.z - cap.z);
    else if (aim) cap.wantYaw = want;
    if (best) {
      this.lockOn = best;
      this.lockT = this.time;
    }
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
    for (const w of this.hostile) {
      if (!w.standing) continue;
      const d = Math.hypot(w.x - cap.x, w.z - cap.z);
      if (d > PISTOL_RANGE) continue;
      const off = Math.abs(angleDelta(face, Math.atan2(w.x - cap.x, w.z - cap.z)));
      const s = d * 0.15 + off * (aim ? 3 : 1.2);
      if (s < bs) {
        bs = s;
        best = w;
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
    // seen from the captain's eyes, the shot leaves the flintlock in their hand
    if (this.eyes && this.hands.group.visible) _hand.copy(this.hands.muzzle);
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
    if (!t || !t.standing) return;
    const dist = Math.hypot(t.x - cap.x, t.z - cap.z);
    if (Math.random() > 0.95 - dist * 0.012) {
      this.hooks.floater('Missed', _v.set(t.x, t.y + 2.2, t.z), '');
      return;
    }
    this.hurt(t, cap, 38 + Math.random() * 10, world, true, true);
  }

  // ---------------------------------------------------------------- the landing party's hands

  private thinkParty(dt: number, air: Set<Walker> | null) {
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
    if (!fight) this.swapSides(dt);
    hands.forEach((w, i) => {
      if (w.down || air?.has(w)) return;
      // pick a fight
      if (fight) {
        w.armed = true;
        const cover = covering.get(w);
        if (cover) w.target = cover;
        if (!w.target || !w.target.standing || Math.hypot(w.target.x - cap.x, w.target.z - cap.z) > 17) {
          w.target = null;
          let bd = Infinity;
          for (const f of foes) {
            if (!f.standing) continue;
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
      this.keepUp(w, this.party[i + 1].follow!, i, dt, hands);
      w.turn(dt, 7);
    });
  }

  /**
   * On the march: each hand walks his own line in a loose knot behind the
   * captain, drifting about it, slower or quicker than the next man, setting
   * off a beat late and stopping a few steps on, now and then stopping to
   * look at something and jogging to catch up, chatting with his mate, the
   * knot strung out at a run and bunched at a stroll.
   */
  private keepUp(w: Walker, f: Follow, i: number, dt: number, hands: Walker[]) {
    const cap = this.captain!;
    const capV = Math.hypot(cap.vx, cap.vz);
    const capRun = clamp((capV - WALK) / (RUN - WALK), 0, 1);
    const marching = capV > 0.6;
    const mate = hands[i ^ 1];
    // drift about your place: a step out to the side, a little ahead, dropping back
    f.wT -= dt;
    if (f.wT <= 0) {
      f.wT = 2.5 + Math.random() * 4;
      f.tx = (Math.random() - 0.5) * 2;
      f.tz = (Math.random() - 0.5) * 1.6;
    }
    const kw = damp(0.5, dt);
    f.wx += (f.tx - f.wx) * kw;
    f.wz += (f.tz - f.wz) * kw;
    // a word with your mate as you go
    if (marching && capRun < 0.5 && mate && !mate.down) {
      f.talkT -= dt;
      if (f.talkT <= 0) {
        w.talking = !w.talking && !mate.talking && Math.random() < 0.55;
        f.talkT = w.talking ? 3 + Math.random() * 5 : 4 + Math.random() * 9;
      }
    } else w.talking = false;
    const chat = !!mate && !mate.down && (w.talking || mate.talking) && Math.hypot(mate.x - w.x, mate.z - w.z) < 4.5;
    // strung out at a run, bunched up at a stroll; talkers drift together
    const rx = (f.slot[0] + f.wx * (marching ? 1 : 0.5)) * (chat ? 0.75 : 1);
    const rz = (f.slot[1] + f.wz) * (1 + capRun * 0.7);
    const sm = Math.sin(this.march);
    const cm = Math.cos(this.march);
    const lead = marching ? 0.3 : 0;
    const tx = cap.x + sm * rz - cm * rx + cap.vx * lead;
    const tz = cap.z + cm * rz + sm * rx + cap.vz * lead;
    const dx = tx - w.x;
    const dz = tz - w.z;
    const d = Math.hypot(dx, dz);
    // set off a beat after you're left a few steps behind; stop once there and the captain has
    if (!f.going) {
      f.restT += dt;
      if (d > 2.4 || (d > 1.4 && f.restT > 4)) {
        f.wait -= dt;
        if (f.wait <= 0) {
          f.going = true;
          f.wait = 0.15 + Math.random() * 0.55;
          f.restT = 0;
        }
      }
    } else if (!marching) {
      // there, or stuck behind a rock or a mate: near enough
      f.restT = Math.hypot(w.vx, w.vz) < 0.35 ? f.restT + dt : 0;
      if (d < 0.75 || f.restT > 1.2) {
        f.going = false;
        f.restT = 0;
      }
    }
    // something caught his eye
    f.nextPause -= dt;
    if (f.nextPause <= 0 && marching && capRun < 0.3 && d < 3 && f.pauseT <= 0) {
      f.nextPause = 12 + Math.random() * 25;
      f.pauseT = 0.8 + Math.random() * 1.4;
      f.glance = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.5);
      f.glanceT = f.pauseT + 0.4;
    }
    f.glanceT -= dt;
    if (f.glanceT <= 0) {
      f.glanceT = 2 + Math.random() * 4;
      f.glance = Math.random() < 0.4 ? (Math.random() - 0.5) * 1.5 : 0;
    }
    let sp = 0;
    if (f.pauseT > 0) f.pauseT -= dt;
    else if (f.going) {
      // the captain's pace, a touch quicker to close a gap, a run to catch up when left behind
      sp = capV * f.pace + clamp((d - 0.5) * 1.3, -1.2, RUN);
      if (d > 7) sp = Math.max(sp, RUN * 0.95);
      if (!marching) sp = Math.min(sp, clamp(d * 1.6, 0.9, WALK));
      sp = clamp(sp, 0, RUN * 1.08) * (1 - Math.min(0.45, w.wade * 0.6));
    }
    let ux = d > 1e-3 ? dx / d : 0;
    let uz = d > 1e-3 ? dz / d : 0;
    // through a fort's gate rather than into its walls
    const r = this.via(w.x, w.z, tx, tz, _rt);
    const detour = r.x !== tx || r.z !== tz;
    if (detour) {
      const rl = Math.hypot(r.x - w.x, r.z - w.z) || 1;
      ux = (r.x - w.x) / rl;
      uz = (r.z - w.z) / rl;
    }
    if (marching && !detour) {
      // near your place, walk the way the party walks rather than chasing the spot
      const b = clamp(1 - d / 1.5, 0, 1) * 0.7;
      ux = lerp(ux, cap.vx / capV, b);
      uz = lerp(uz, cap.vz / capV, b);
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul;
      uz /= ul;
    }
    // room to swing your arms
    let ex = 0;
    let ez = 0;
    for (const o of this.party) {
      const m = o.walker;
      if (m === w || m.down) continue;
      const ox = w.x - m.x;
      const oz = w.z - m.z;
      const e = Math.hypot(ox, oz);
      const room = m === cap ? 1.25 : 1.05;
      if (e < room && e > 1e-3) {
        ex += (ox / e) * (room - e);
        ez += (oz / e) * (room - e);
      }
    }
    // hemmed in against a rock or a tent: a few steps aside, then on
    f.stuck = sp > 1 && w.stride < 0.4 ? f.stuck + dt : Math.max(0, f.stuck - dt);
    if (f.stuck > 1) {
      f.stuck = 0;
      f.aside = (w.seed % 2 < 1 ? 1 : -1) * 0.9;
    }
    if (f.aside !== 0) {
      const a = Math.sign(f.aside);
      f.aside -= a * Math.min(Math.abs(f.aside), dt);
      const px = -uz * a;
      const pz = ux * a;
      ux = ux * 0.3 + px;
      uz = uz * 0.3 + pz;
    }
    const wx = ux * sp + ex * 2;
    const wz = uz * sp + ez * 2;
    const k = damp(sp * sp > w.vx * w.vx + w.vz * w.vz ? 3.4 : 4.5, dt);
    w.vx += (wx - w.vx) * k;
    w.vz += (wz - w.vz) * k;
    const v = Math.hypot(w.vx, w.vz);
    if (f.going || f.pauseT > 0) {
      if (v > 0.5) w.wantYaw = Math.atan2(w.vx, w.vz);
      w.idle = 'stand';
      w.idleT = 0;
      const look = chat ? clamp(angleDelta(w.yaw, Math.atan2(mate.x - w.x, mate.z - w.z)), -1.1, 1.1) : f.glance;
      w.lookYaw += (look - w.lookYaw) * damp(4, dt);
    } else this.atEase(w, i, dt);
    // left far behind (a cliff between you): catch up out of sight
    if (d > 45) w.place(tx, tz, this.march);
  }

  /** Two hands swap sides on the march now and then. */
  private swapSides(dt: number) {
    const cap = this.captain!;
    if (Math.hypot(cap.vx, cap.vz) < 0.6) return;
    this.swapT -= dt;
    if (this.swapT > 0) return;
    this.swapT = 15 + Math.random() * 25;
    const a = Math.random() < 0.5 ? 1 : 3;
    const fa = this.party[a]?.follow;
    const fb = this.party[a + 1]?.follow;
    if (!fa || !fb) return;
    const t = fa.slot;
    fa.slot = fb.slot;
    fb.slot = t;
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
    // round a fort's walls to its gate, if they stand between
    const r = this.via(w.x, w.z, t.x + Math.sin(ang) * want, t.z + Math.cos(ang) * want, _rt);
    const ex = r.x - w.x;
    const ez = r.z - w.z;
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
    const alarm = c.fort ? FORT_ALARM : CAMP_ALARM;
    const leash = c.fort ? FORT_LEASH : LEASH;
    // the party comes too close: up and at them (on peaceful seas, up and watching)
    c.wary = false;
    if (!c.alert && !c.routed && cap && !this.defeated) {
      let near = Infinity;
      for (const p of this.party) {
        const w = p.walker;
        near = Math.min(near, Math.hypot(w.x - f.x, w.z - f.z) - alarm);
        for (const g of c.gang) if (g.alive && !g.down) near = Math.min(near, Math.hypot(w.x - g.x, w.z - g.z) - 9);
      }
      if (near < 0) {
        if (this.calm(c)) c.wary = true;
        else this.raise(c, world);
      }
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
        if (!t || Math.hypot(t.x - f.x, t.z - f.z) > leash) {
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
      const home = c.gang.every((w) => w.down || Math.hypot(w.x - f.x, w.z - f.z) < (c.fort ? 11 : 9));
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
    const r = this.via(w.x, w.z, s.x, s.z, _rt);
    const dx = r.x - w.x;
    const dz = r.z - w.z;
    const d = Math.hypot(s.x - w.x, s.z - w.z);
    if (d > 0.35) {
      const sp = Math.min(c.alert ? WALK : 1.35, d * 1.5 + 0.3);
      const dl = Math.hypot(dx, dz) || 1;
      w.vx += ((dx / dl) * sp - w.vx) * damp(5, dt);
      w.vz += ((dz / dl) * sp - w.vz) * damp(5, dt);
      w.wantYaw = Math.atan2(dx, dz);
      w.idle = 'stand';
      w.seatH = 0;
    } else {
      w.vx *= 1 - damp(8, dt);
      w.vz *= 1 - damp(8, dt);
      w.idle = s.idle;
      w.seatH = s.seatH;
      w.wantYaw = s.yaw;
      // wary: those on their feet keep an eye on the captain
      const cap = this.captain;
      if (c.wary && cap && s.idle !== 'sit') w.wantYaw = Math.atan2(cap.x - w.x, cap.z - w.z);
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
    const g = this.floor;
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
      w.wade = this.deck ? 0 : Math.max(0, -g.height(w.x, w.z));
      if (w.stride < 0.08) continue;
      // footfalls twice a stride: ~1.4 m walking, longer at a run
      const before = w.phase;
      w.phase += ((moved * dt) / w.stepLen()) * Math.PI;
      if (Math.floor(before / Math.PI) !== Math.floor(w.phase / Math.PI)) this.footfall(w, world);
      if (w.phase > 1e4) w.phase -= Math.PI * 2000;
    }
  }

  /** A pale smear of light along the cutlass's arc, from the wind-up through the blow. */
  private bladeTrail(w: Walker, world: World) {
    const c = w.cut;
    const on = w.cutting && w.cutT > CUT_WIND[c] * 0.8 && w.cutT < CUT_HIT[c] + 0.09 && w.visible && !w.hidden;
    if (!on) {
      w.tipLive = false;
      return;
    }
    w.bladeAt(1, _tip);
    w.bladeAt(0.45, _mid);
    if (w.tipLive) {
      const p = world.particles;
      const n = Math.min(30, Math.ceil(_tip.distanceTo(w.tip) / 0.045));
      // brightest through the blow itself
      const hot = clamp(1.4 - Math.abs(w.cutT - CUT_HIT[c]) * 9, 0.45, 1);
      for (let j = 1; j <= n; j++) {
        const f = j / n;
        // a band from mid-blade out to the tip, thickest and brightest at the edge
        for (let e = 0; e < 3; e++) {
          const along = e / 2;
          const x0 = lerp(w.mid.x, w.tip.x, along);
          const y0 = lerp(w.mid.y, w.tip.y, along);
          const z0 = lerp(w.mid.z, w.tip.z, along);
          const x1 = lerp(_mid.x, _tip.x, along);
          const y1 = lerp(_mid.y, _tip.y, along);
          const z1 = lerp(_mid.z, _tip.z, along);
          const k = hot * (0.55 + 0.45 * along);
          p.emit(
            {
              x: lerp(x0, x1, f), y: lerp(y0, y1, f), z: lerp(z0, z1, f),
              life: 0.09 + 0.08 * f, size: 0.07 + 0.08 * along, sizeEnd: 0.03,
              color: [1.6 * k, 1.68 * k, 1.85 * k], colorEnd: [0.35, 0.4, 0.5], alpha: 0.3 + 0.3 * along, kind: 0, fadeIn: 0.005,
            },
            true,
          );
        }
      }
    }
    w.tip.copy(_tip);
    w.mid.copy(_mid);
    w.tipLive = true;
  }

  private footfall(w: Walker, world: World) {
    const wet = w.wade > 0.08;
    if (w === this.captain) this.hooks.step(clamp(w.stride / RUN, 0.3, 1), wet, !!this.deck);
    if (this.deck) return;
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
        if (b.team === a.team || !b.standing) continue;
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
    // a blade drawn on one of them is drawn on them all (peaceful seas: this is how it starts)
    if (b.team === 'foe' && a.team !== 'foe') {
      const camp = this.camps.find((c) => c.gang.includes(b));
      if (camp && !camp.alert && !camp.routed) this.raise(camp, world);
    }
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
      this.hooks.fallen(b, b.maxHp > FOE_HP);
      const camp = this.camps.find((c) => c.gang.includes(b));
      if (camp && !camp.routed && camp.gang.every((w) => w.down)) this.rout(camp, world);
      if (this.crewFoes.includes(b)) this.morale(world);
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
    // sand ashore; on a deck, a puff of old caulk and grime off the planks
    const deck = !!this.deck;
    for (let i = 0; i < (deck ? 2 : 3) + Math.round(k * 2); i++) {
      world.particles.emit({
        x: at.x + (Math.random() - 0.5) * 0.4, y: at.y, z: at.z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 2 * k, vy: 0.4 + Math.random() * k, vz: (Math.random() - 0.5) * 2 * k,
        life: 0.7 + Math.random() * 0.5, size: 0.3 * k, sizeEnd: (deck ? 0.8 : 1.1) * k, color: deck ? [0.78, 0.74, 0.68] : [0.98, 0.9, 0.74], alpha: deck ? 0.3 : 0.42, drag: 2.4, grav: 0.3, kind: 1, fadeIn: 0.02,
      });
    }
  }

  // ---------------------------------------------------------------- forts' walls

  /**
   * Where to head for, to get from (x, z) to (gx, gz): straight there, or
   * round a fort's walls and through its gate if they stand in the way.
   */
  private via(x: number, z: number, gx: number, gz: number, out: { x: number; z: number }) {
    out.x = gx;
    out.z = gz;
    for (const f of this.walls) {
      const reach = f.H + 40;
      if (Math.abs(x - f.x) > reach || Math.abs(z - f.z) > reach) continue;
      const a = worldToFort(f, x, z, _la);
      const b = worldToFort(f, gx, gz, _lb);
      const H = f.H;
      const inA = Math.abs(a.x) < H && Math.abs(a.z) < H;
      const inB = Math.abs(b.x) < H && Math.abs(b.z) < H;
      if (inA && inB) return out;
      let tx = b.x;
      let tz = b.z;
      const mouthIn = -H + f.T + 1.4;
      const mouthOut = -H - 2.8;
      if (inA) {
        // in the plaza or the passage: to the gate, then out through it
        const passage = Math.abs(a.x) < 1.5 && a.z < mouthIn + 0.4;
        tx = 0;
        tz = passage ? mouthOut : mouthIn;
      } else if (inB) {
        // outside, bound in: round to the gate's mouth, then in through it
        const atGate = Math.abs(a.x) < 1.7 && a.z > mouthOut - 0.9;
        tx = 0;
        tz = atGate ? mouthIn : mouthOut;
        if (!atGate) [tx, tz] = roundWalls(a.x, a.z, tx, tz, H);
      } else [tx, tz] = roundWalls(a.x, a.z, tx, tz, H);
      if (tx === b.x && tz === b.z) return out;
      fortToWorld(f, tx, tz, _wp);
      out.x = _wp.x;
      out.z = _wp.z;
      return out;
    }
    return out;
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
        c.flag.position.y = L.flagTop.y - c.strike * (L.flagDrop ?? 4.4);
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
      world.particles.flame(_v.set(L.fire.x, L.fire.y + 0.05, L.fire.z), c.fort ? 0.34 : 0.42);
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
    if (this.deck) {
      // back over your own rail while the fight goes against you
      if (this.struck || this.swings.size || !this.atOwnRail()) return null;
      return { key: 'retreat', title: `Fall back to the ${shipName}`, sub: 'Cut the lines and leave her be', ok: true };
    }
    const b = this.boat.position;
    if (Math.hypot(cap.x - b.x, cap.z - b.z) < 4.2) {
      if (this.fighting && this.foes.some((f) => !f.down && Math.hypot(f.x - cap.x, f.z - cap.z) < 12)) return { key: 'fight', title: 'Cutthroats on your heels', sub: 'Fight them off before you push off', ok: false };
      return { key: 'boat', title: `Row back to the ${shipName}`, sub: 'The hands climb in and pull for the ship', ok: true };
    }
    if (this.digHere(2.6)) {
      if (this.fighting) return { key: 'dig', title: 'X marks the spot', sub: 'See off the cutthroats first', ok: false };
      if (this.digging) return null;
      return { key: 'dig', title: this.digP > 0 ? 'Keep digging' : 'Dig here', sub: this.digP > 0 ? `${Math.max(1, Math.round(this.digP * 6))} ft down, the chest lies at 6` : 'X marks the spot', ok: true };
    }
    const c = this.chestNear();
    if (c) {
      if (c.fort) {
        if (!c.routed) return { key: 'chest', title: 'The fort\'s strongbox', sub: 'Beat the garrison to claim it', ok: false };
        return { key: 'chest', title: 'Open the fort\'s strongbox', sub: 'The garrison\'s pay chest is yours', ok: true };
      }
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
      if (Math.hypot(c.layout.chest.x - cap.x, c.layout.chest.z - cap.z) < (c.fort ? 2.8 : 2.4)) return c;
    }
    return null;
  }

  /** Acts on the prompt: returns 'boat' to row back, or does the deed here. */
  interact(world: World): 'boat' | null {
    const p = this.prompt('');
    if (!p || !p.ok) return null;
    if (p.key === 'boat' || p.key === 'retreat') return 'boat';
    if (p.key === 'dig') {
      this.startDig();
      return null;
    }
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
    this.site.visible = true;
  }

  unwarm() {
    if (!this.active) this.boat.visible = false;
    this.setTreasure(this.treasure);
  }

  // ---------------------------------------------------------------- buried treasure

  /** Puts the X on the sand where a whole map says (null clears it). */
  setTreasure(at: { x: number; z: number } | null) {
    // a chest just dug up stays in its hole until the party rows off
    if (!at && this.active && this.unearthedOnce) return;
    if (!at) {
      this.treasure = null;
      this.site.visible = false;
      this.stopDig();
      return;
    }
    const same = this.treasure && Math.hypot(this.treasure.x - at.x, this.treasure.z - at.z) < 0.01;
    const y = this.ground.height(at.x, at.z);
    this.treasure = new THREE.Vector3(at.x, y, at.z);
    if (!same) {
      this.digP = 0;
      this.revealT = -1;
      this.unearthedOnce = false;
      this.stopDig();
    }
    this.site.position.copy(this.treasure);
    this.site.rotation.y = (at.x * 0.37 + at.z * 0.11) % (Math.PI * 2);
    this.site.visible = true;
    this.site.updateMatrixWorld(true);
    this.showDig();
  }

  /** The hole and heap as deep as the digging's gone, the chest as high as it's come up. */
  private showDig() {
    const k = this.digP;
    const e = 1 - (1 - k) ** 2;
    this.hole.visible = this.spoil.visible = k > 0;
    this.hole.scale.set(0.35 + 0.65 * e, Math.max(0.02, e), 0.35 + 0.65 * e);
    this.spoil.scale.set(0.3 + 0.7 * e, Math.max(0.02, e), 0.3 + 0.7 * e);
    const r = this.revealT;
    this.bChest.visible = r >= 0;
    if (r < 0) return;
    // up out of the sand, with a lurch as the hands heave it clear
    const up = smoothstep(0.15, 1.5, r);
    this.bChest.position.set(0.05, -0.62 + up * 0.5 + Math.sin(Math.min(1, r / 1.5) * Math.PI) * 0.06, 0);
    this.bChest.rotation.x = 0.12 * (1 - up) + 0.04;
    const open = smoothstep(1.7, 2.5, r);
    this.bLid.rotation.x = -1.95 * open - Math.sin(open * Math.PI) * 0.12;
  }

  /** Where the X is, if it's near the captain and still buried. */
  private digHere(r: number) {
    const T = this.treasure;
    const cap = this.captain;
    if (!T || !cap || this.unearthedOnce || this.revealT >= 0) return false;
    return Math.hypot(cap.x - T.x, cap.z - T.z) < r;
  }

  /** The captain takes up a spade, and the two nearest hands come to help. */
  private startDig() {
    const T = this.treasure!;
    const cap = this.captain!;
    this.digging = true;
    this.diggers.clear();
    const a = Math.atan2(cap.x - T.x, cap.z - T.z);
    const at = (aa: number, r: number) => ({ x: T.x + Math.sin(aa) * r, z: T.z + Math.cos(aa) * r, stroke: -1 });
    this.diggers.set(cap, at(a, 0.95));
    const hands = this.party
      .slice(1)
      .map((p) => p.walker)
      .filter((w) => w.ready)
      .sort((p, q) => Math.hypot(p.x - T.x, p.z - T.z) - Math.hypot(q.x - T.x, q.z - T.z))
      .slice(0, 2);
    hands.forEach((w, i) => this.diggers.set(w, at(a + (i ? -2.1 : 2.1), 1.0)));
    for (const w of this.diggers.keys()) {
      w.armed = false;
      w.digPhase = Math.random() * 0.3;
    }
  }

  private stopDig() {
    this.digging = false;
    for (const w of this.diggers.keys()) w.digging = false;
    this.diggers.clear();
  }

  private updateDig(dt: number, world: World) {
    const T = this.treasure;
    if (!T) return;
    if (this.revealT >= 0) {
      const was = this.revealT;
      this.revealT += dt;
      if (was < 1.75 && this.revealT >= 1.75 && !this.unearthedOnce) {
        this.unearthedOnce = true;
        for (const p of this.party) if (!p.walker.down && p.walker !== this.captain) p.walker.cheer = 2.4 + Math.random() * 0.5;
        const top = _v.copy(this.bChest.position).applyMatrix4(this.site.matrixWorld).setY(T.y + 0.5);
        world.particles.treasure(top, [1.5, 1.15, 0.45], 4);
        this.hooks.unearthed(top);
      }
      this.showDig();
      return;
    }
    if (!this.digging) return;
    const cap = this.captain;
    if (!cap || cap.down || this.fighting) {
      this.stopDig();
      return;
    }
    let n = 0;
    for (const [w, s] of this.diggers) {
      if (w.down) continue;
      const dx = s.x - w.x;
      const dz = s.z - w.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3 && !w.digging) {
        const sp = Math.min(WALK, d * 3 + 0.6);
        w.vx = (dx / d) * sp;
        w.vz = (dz / d) * sp;
        w.wantYaw = Math.atan2(dx, dz);
        w.idle = 'stand';
      } else {
        w.vx = w.vz = 0;
        w.digging = true;
        w.idle = 'stand';
        w.wantYaw = Math.atan2(T.x - w.x, T.z - w.z);
        n++;
        // each stroke's spadeful flies off onto the heap
        const k = Math.floor(w.digPhase - 0.8);
        if (k !== s.stroke) {
          s.stroke = k;
          if (k >= 0) this.toss(w, world);
        }
      }
      w.turn(dt, 8);
    }
    this.digP = Math.min(1, this.digP + (dt * n) / DIG_WORK);
    this.showDig();
    if (this.digP < 1) return;
    // the spade rings on wood: heave it up
    this.stopDig();
    this.revealT = 0;
    const [vol, pan] = world.soundAt(T);
    world.audio.spadeKnock(vol, pan);
    this.hooks.shake(0.1);
    this.hooks.floater('Something wooden…', _w.set(T.x, T.y + 1.8, T.z), 'loot');
  }

  /**
   * How the dig is going, for the HUD: how deep (0..1), how many spades are
   * going, the spadefuls so far, and whether the chest is coming up. Null
   * when nobody's digging.
   */
  get digView(): { k: number; hands: number; strokes: number; heave: boolean } | null {
    if (this.revealT >= 0 && this.revealT < 1.75) return { k: 1, hands: 0, strokes: this.strokes, heave: true };
    if (!this.digging) return null;
    let hands = 0;
    for (const w of this.diggers.keys()) if (w.digging && !w.down) hands++;
    return { k: this.digP, hands, strokes: this.strokes, heave: false };
  }

  /** A spadeful of sand thrown over the shoulder onto the heap. */
  private toss(w: Walker, world: World) {
    this.strokes++;
    const T = this.treasure!;
    const heap = _w.copy(this.spoil.position).applyMatrix4(this.site.matrixWorld);
    const p = world.particles;
    const dx = heap.x - T.x;
    const dz = heap.z - T.z;
    for (let i = 0; i < 7; i++) {
      p.emit({
        x: T.x + (Math.random() - 0.5) * 0.5, y: T.y + 0.15, z: T.z + (Math.random() - 0.5) * 0.5,
        vx: dx * (1.1 + Math.random() * 0.5) + (Math.random() - 0.5), vy: 3 + Math.random() * 1.5, vz: dz * (1.1 + Math.random() * 0.5) + (Math.random() - 0.5),
        life: 0.7 + Math.random() * 0.3, size: 0.07 + Math.random() * 0.05, sizeEnd: 0.05, color: [0.9, 0.78, 0.55], alpha: 0.95, grav: 9, drag: 0.4, kind: 0, fadeIn: 0.01,
      });
    }
    p.emit({
      x: heap.x, y: T.y + 0.4, z: heap.z, vx: 0, vy: 0.3, vz: 0,
      life: 1, size: 0.4, sizeEnd: 1.4, color: [0.96, 0.88, 0.7], alpha: 0.3, drag: 1.6, grav: 0.2, kind: 1, fadeIn: 0.05,
    });
    const [vol, pan, d] = world.soundAt(_v.set(w.x, w.y + 0.5, w.z));
    world.audio.dig(vol * (w === this.captain ? 1 : 0.6), pan, d);
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
  [-2.3, -0.4],
  [2.3, -0.4],
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


/** Does the segment a→b cut the square |x|, |z| < E? (Liang–Barsky) */
function cuts(ax: number, az: number, bx: number, bz: number, E: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const p = [-dx, dx, -dz, dz];
  const q = [ax + E, E - ax, az + E, E - az];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return false;
      t0 = Math.max(t0, r);
    } else {
      if (r < t0) return false;
      t1 = Math.min(t1, r);
    }
  }
  return t1 - t0 > 1e-4;
}

/** From a (outside a fort of half-width H, fort frame) toward t: straight on, or to the corner that gets you round. */
function roundWalls(ax: number, az: number, tx: number, tz: number, H: number): [number, number] {
  const E = H + 0.6;
  if (!cuts(ax, az, tx, tz, E)) return [tx, tz];
  const C = H + 3.4;
  let best: [number, number] = [tx, tz];
  let bd = Infinity;
  for (const [cx, cz] of [[C, C], [-C, C], [C, -C], [-C, -C]]) {
    if (cuts(ax, az, cx, cz, E)) continue;
    const d = Math.hypot(cx - ax, cz - az) + Math.hypot(tx - cx, tz - cz) + (cuts(cx, cz, tx, tz, E) ? H * 2 : 0);
    if (d < bd) {
      bd = d;
      best = [cx, cz];
    }
  }
  return best;
}
