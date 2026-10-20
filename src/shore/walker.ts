import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/noise';
import { P, POSE_SIZE, PROP, RIG } from '../ships/crewModel';
import { crouch, CrewFigure, Look, rest } from '../ships/crew';

// Someone on foot on an island: the captain, a hand from the landing party or
// one of the cutthroats. A walker is drawn by the crews' instanced sailor and
// posed here, joint by joint: the walk and run, a guard with the cutlass up,
// three cuts (an overhead slash, a backhand sweep and a lunging thrust), a
// parry, a flinch from a blow, a knock-out fall onto the sand, getting up
// again, sitting by a fire, chatting, keeping watch and cheering a win.

export type Team = 'party' | 'foe';
export type Idle = 'stand' | 'sit' | 'ground' | 'chat' | 'watch' | 'lean' | 'warm';

/** The three cuts: 0 overhead, 1 backhand, 2 lunge. */
export type Cut = 0 | 1 | 2;
/** Seconds into a cut: wind-up ends, the blade lands, follow-through ends, back on guard. */
export const CUT_WIND = [0.17, 0.15, 0.2];
export const CUT_HIT = [0.23, 0.21, 0.27];
const CUT_HOLD = [0.34, 0.31, 0.4];
export const CUT_END = [0.56, 0.5, 0.66];
/** The step in behind each cut as the blade comes over (m/s, spent like a shove). */
const STEP_IN = [1.7, 1.1, 2.9];

/** Walking and running pace on foot (m/s). */
export const WALK = 3.0;
export const RUN = 5.3;

const TAU = Math.PI * 2;
/** The body's own sway, lean, twist and step the joints can't give, laid onto the matrix: */
const SW = 0; // hips shifted sideways (m, to the left)
const RL = 1; // leaning sideways (rad, + to the right)
const PT = 2; // pitched forward (rad)
const TW = 3; // the hips turned (rad, + to the left)
const FW = 4; // stepped ahead (m)
const B = new Float32Array(5);

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const T = new Float32Array(POSE_SIZE);
const K = new Float32Array(POSE_SIZE);

let serial = 0;

export class Walker implements CrewFigure {
  readonly id = serial++;
  /** What the HUD calls them over their bar ('' for the default). */
  title = '';
  readonly pose = new Float32Array(POSE_SIZE);
  readonly matrix = new THREE.Matrix4();
  prop: number = PROP.none;
  visible = false;
  // where and how fast
  x = 0;
  z = 0;
  y = 0;
  vx = 0;
  vz = 0;
  /** Knock-back and shove, separate from the walker's own stride. */
  kx = 0;
  kz = 0;
  yaw = 0;
  wantYaw = 0;
  /** Ground speed this frame (m/s) and the stride cycle: the left heel strikes at 0, the right at pi. */
  stride = 0;
  phase = Math.random() * 6;
  /** How the body sways, leans and twists over its feet (see SW..FW), eased. */
  readonly body = new Float32Array(5);
  /** How fast the walker is turning (rad/s) and gathering speed (m/s²), for leaning into both. */
  private turnRate = 0;
  private accel = 0;
  private lastYaw = NaN;
  private lastSpeed = 0;
  /** Talking as they walk (the jaw goes), and who to (the head turns via lookYaw). */
  talking = false;
  /** The blade's tip and middle last frame, for the swing's trail. */
  readonly tip = new THREE.Vector3();
  readonly mid = new THREE.Vector3();
  tipLive = false;
  /** Depth of the water at the feet (0 on dry land). */
  wade = 0;
  // fighting
  hp: number;
  /** Digging for treasure: spade strokes, counted in `digPhase` (one per whole number). */
  digging = false;
  digPhase = 0;
  armed = false;
  cut: Cut = 0;
  /** Seconds into the current cut (-1 = not cutting). */
  cutT = -1;
  hitDone = false;
  cooldown = 0;
  /** Parrying (seconds left). */
  parry = 0;
  stagger = 0;
  flinch = 0;
  /** Knocked down: seconds since the fall (-1 standing), and 0..1 how far over. */
  downT = -1;
  fall = 0;
  rise = 0;
  aim = 0; // pistol raised 0..1
  cheer = 0;
  shout = 0;
  /** Swinging across on a boarding line (0..1, how much of the hanging pose). */
  hang = 0;
  /** Thrown down their blade and gone to their knees, hands up (0..1 eased in); out of the fight. */
  yielded = 0;
  lastHurt = -100;
  target: Walker | null = null;
  // at ease
  idle: Idle = 'stand';
  idleT = 0;
  lookYaw = 0;
  lookT = 0;
  /** Extra hip drop for sitting on something (a log). */
  seatH = 0;
  readonly seed = Math.random() * 100;
  readonly tempo = 0.9 + Math.random() * 0.2;
  /** Longer or shorter in the stride than the next man. */
  readonly stepK = 0.93 + Math.random() * 0.14;

  constructor(
    readonly team: Team,
    public row: number,
    public look: Look,
    readonly maxHp: number,
    readonly girth = 1,
    readonly height = 1,
    /** Whether the row was taken for this walker (and must be given back). */
    readonly ownsRow = false,
  ) {
    this.hp = maxHp;
    rest(this.pose);
  }

  get down() {
    return this.downT >= 0;
  }

  get alive() {
    return this.hp > 0;
  }

  get cutting() {
    return this.cutT >= 0;
  }

  /** Can act: standing, not reeling. */
  get ready() {
    return !this.down && this.stagger <= 0 && this.rise <= 0 && this.yielded <= 0 && this.hang <= 0.3;
  }

  /** Fair game for a blade: on their feet and still fighting. */
  get standing() {
    return this.alive && !this.down && this.yielded <= 0;
  }

  place(x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.yaw = this.wantYaw = yaw;
    this.vx = this.vz = this.kx = this.kz = 0;
    this.lastYaw = NaN;
  }

  /** Ground covered per footfall at the current pace (m): longer steps as the pace picks up. */
  stepLen() {
    const sp = this.stride;
    const run = clamp((sp - WALK) / (RUN - WALK), 0, 1);
    return lerp(clamp(0.42 + sp * 0.19, 0.5, 1), 0.62 + sp * 0.19, run) * this.stepK;
  }

  /** Starts a cut; returns false if busy. */
  swing(cut: Cut) {
    if (!this.ready || this.cutting || this.cooldown > 0) return false;
    this.cut = cut;
    this.cutT = 0;
    this.hitDone = false;
    this.armed = true;
    this.parry = 0;
    return true;
  }

  /** Down onto the sand. */
  knockDown() {
    this.downT = 0;
    this.cutT = -1;
    this.parry = 0;
    this.aim = 0;
    this.vx = this.vz = 0;
  }

  getUp(hp: number) {
    if (!this.down) return;
    this.downT = -1;
    this.rise = 1;
    this.hp = Math.max(this.hp, hp);
  }

  /** Clock the timers on. */
  tick(dt: number) {
    if (this.digging) this.digPhase += dt * 0.78 * this.tempo;
    if (this.cutT >= 0) {
      const was = this.cutT;
      this.cutT += dt;
      const c = this.cut;
      // the weight goes in behind the blade
      if (was < CUT_WIND[c] && this.cutT >= CUT_WIND[c]) {
        this.kx += Math.sin(this.yaw) * STEP_IN[c];
        this.kz += Math.cos(this.yaw) * STEP_IN[c];
      }
      if (this.cutT >= CUT_END[c]) this.cutT = -1;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.parry = Math.max(0, this.parry - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.flinch = Math.max(0, this.flinch - dt);
    this.cheer = Math.max(0, this.cheer - dt);
    if (this.yielded > 0) this.yielded = Math.min(1, this.yielded + dt * 1.6);
    this.shout = Math.max(0, this.shout - dt);
    if (this.downT >= 0) {
      this.downT += dt;
      this.fall = Math.min(1, this.fall + dt * 2.4);
    } else if (this.rise > 0) {
      this.rise = Math.max(0, this.rise - dt * 1.1);
      this.fall = this.rise;
    } else this.fall = 0;
  }

  /** Builds this frame's pose from what the walker is doing, and eases into it. */
  animate(dt: number, time: number, run: number) {
    const tt = time * this.tempo + this.seed;
    rest(T);
    B.fill(0);
    // turning and gathering speed, for leaning into both
    if (dt > 0) {
      const tr = Number.isNaN(this.lastYaw) ? 0 : clamp(angleDelta(this.lastYaw, this.yaw) / dt, -12, 12);
      this.turnRate += (tr - this.turnRate) * damp(10, dt);
      const ac = clamp((this.stride - this.lastSpeed) / dt, -30, 30);
      this.accel += (ac - this.accel) * damp(5, dt);
    }
    this.lastYaw = this.yaw;
    this.lastSpeed = this.stride;
    const moving = this.stride > 0.25 && !this.down;
    // turning on the spot: a few short shuffling steps round
    const shuffle =
      !moving && !this.down && this.cutT < 0 && !this.digging && this.rise <= 0 && Math.abs(this.turnRate) > 1.6 && (this.armed || this.idle === 'stand' || this.idle === 'chat' || this.idle === 'watch' || this.idle === 'lean');
    if (shuffle) this.phase += Math.min(6, Math.abs(this.turnRate)) * dt * 0.9;
    const stepping = moving || shuffle;
    // at ease: what they're about while nobody fights
    if (!stepping && !this.armed && !this.down) this.ease(T, tt);
    if (stepping) {
      this.gait(T, moving ? this.stride : 0.9, moving ? run : 0, tt);
      if (this.wade > 0.15) {
        // high steps through the shallows, arms out for balance
        T[P.kneeL] += 0.5 * Math.min(1, this.wade);
        T[P.kneeR] += 0.5 * Math.min(1, this.wade);
        T[P.armLZ] = 0.45;
        T[P.armRZ] = 0.45;
      }
    }
    if (this.armed && !this.down) this.guard(T, stepping, tt);
    const digging = this.digging && !moving && !this.down;
    if (digging) this.digPose(T);
    if (this.cutT >= 0) this.cutPose(T);
    if (this.aim > 0) {
      // the pistol at arm's length, the head sighting along it
      const w = Math.min(1, this.aim * 1.6);
      T[P.armLX] = lerp(T[P.armLX], 1.52, w);
      T[P.armLZ] = lerp(T[P.armLZ], -0.18, w);
      T[P.elbowL] = lerp(T[P.elbowL], 0.05, w);
      T[P.handL] = lerp(T[P.handL], 0.85, w);
      T[P.spineY] = lerp(T[P.spineY], 0.45, w);
      T[P.headY] = lerp(T[P.headY], 0.2, w);
      T[P.brow] = -0.6;
    }
    if (this.parry > 0) {
      // blade across the body, edge out
      T[P.armRX] = 1.35;
      T[P.armRZ] = -0.55;
      T[P.elbowR] = 1.55;
      T[P.armLX] = 0.6;
      T[P.armLZ] = 0.55;
      T[P.spineX] = -0.12;
      T[P.brow] = -0.9;
      crouch(T, 0.35);
    }
    if (this.flinch > 0 && !this.down) {
      const w = Math.min(1, this.flinch * 5);
      T[P.spineX] = lerp(T[P.spineX], -0.38, w);
      T[P.headX] = lerp(T[P.headX], -0.32, w);
      T[P.armLZ] = lerp(T[P.armLZ], 0.75, w);
      T[P.armLX] = lerp(T[P.armLX], 0.5, w);
      T[P.jaw] = 0.55 * w;
      T[P.brow] = 0.9;
      T[P.smile] = -0.8;
    }
    if (this.down || this.fall > 0) this.sprawl(T, tt);
    if (this.cheer > 0 && !this.down) {
      const w = Math.min(1, this.cheer * 2, (3 - this.cheer) * 4);
      const j = Math.max(0, Math.sin(tt * 8.5));
      K.set(T);
      K[P.armRX] = 2.75 + 0.25 * Math.sin(tt * 8.5);
      K[P.armRZ] = -0.35;
      K[P.elbowR] = 0.2;
      K[P.armLX] = 2.5 + 0.3 * Math.sin(tt * 8.5 + 1.3);
      K[P.armLZ] = -0.35;
      K[P.elbowL] = 0.35;
      K[P.handL] = 1;
      K[P.handR] = 1;
      K[P.headX] = -0.3;
      K[P.jaw] = 0.65 + 0.35 * Math.sin(tt * 8.5);
      K[P.brow] = 0.8;
      K[P.smile] = 1;
      K[P.rootY] = j * 0.2 - (1 - j) * 0.06;
      for (let i = 0; i < POSE_SIZE; i++) T[i] = lerp(T[i], K[i], w);
    }
    if (this.hang > 0) this.hangPose(T, tt);
    if (this.yielded > 0 && !this.down) this.yieldPose(T, tt);
    this.face(T, tt, moving);
    if (this.hang > 0.3) {
      // a roar on the way across
      T[P.jaw] = 0.75;
      T[P.brow] = -0.8;
    }
    // cuts snap, blows jolt, strides keep their snap; everything else eases
    const k = damp(this.cutT >= 0 ? 55 : this.flinch > 0 || this.parry > 0 ? 34 : this.down ? 9 : stepping ? 26 : 13, dt);
    for (let i = 0; i < POSE_SIZE; i++) this.pose[i] += (T[i] - this.pose[i]) * k;
    if (this.down || this.fall > 0) B.fill(0);
    for (let i = 0; i < 5; i++) this.body[i] += (B[i] - this.body[i]) * k;
    this.prop = digging ? PROP.spade : this.yielded > 0.3 ? PROP.none : this.armed || this.cheer > 0 || this.hang > 0 ? PROP.cutlass : PROP.none;
  }

  /** Swinging on a line: the left fist high on the rope, blade out, knees tucked to clear the rails. */
  private hangPose(o: Float32Array, tt: number) {
    const w = Math.min(1, this.hang);
    const k = (i: number, v: number) => (o[i] = lerp(o[i], v, w));
    k(P.armLX, 2.95);
    k(P.armLZ, -0.12);
    k(P.elbowL, 0.18);
    k(P.handL, 1);
    k(P.armRX, 1.05 + 0.15 * Math.sin(tt * 9));
    k(P.armRZ, 0.85);
    k(P.elbowR, 0.55);
    k(P.handR, 1);
    k(P.legLX, 1.05);
    k(P.kneeL, 1.45);
    k(P.legRX, 0.6);
    k(P.kneeR, 0.95);
    k(P.spineX, -0.16);
    k(P.spineY, 0.2);
    k(P.headX, -0.12);
    k(P.rootY, 0);
  }

  /** On their knees, hands raised, head down: they've struck their colours. */
  private yieldPose(o: Float32Array, tt: number) {
    const w = smooth(this.yielded);
    const shake = Math.sin(tt * 13) * 0.03;
    const k = (i: number, v: number) => (o[i] = lerp(o[i], v, w));
    k(P.armLX, 2.45 + shake);
    k(P.armLZ, -0.22);
    k(P.elbowL, 1.05);
    k(P.handL, 0.05);
    k(P.armRX, 2.45 - shake);
    k(P.armRZ, -0.22);
    k(P.elbowR, 1.05);
    k(P.handR, 0.05);
    k(P.legLX, 0.04);
    k(P.kneeL, 1.62);
    k(P.legRX, -0.02);
    k(P.kneeR, 1.66);
    k(P.rootY, -0.43);
    k(P.spineX, 0.16);
    k(P.spineY, 0);
    k(P.headX, 0.3);
    k(P.headY, 0.25 * Math.sin(this.seed));
    k(P.brow, 0.75);
    k(P.smile, -0.7);
    k(P.jaw, 0.1);
  }

  /**
   * The stride: each leg keyed through heel strike, taking the weight, passing
   * and pushing off (a run adds a moment aloft); the hips riding on the lowest
   * foot, swaying over it and turning with the swinging leg, the shoulders
   * against them, arms swinging a beat behind, the head kept level and looking
   * where it's going; leaning into turns and into speeding up.
   */
  private gait(o: Float32Array, sp: number, run: number, tt: number) {
    const u = this.phase / TAU;
    const ph = this.phase;
    // a slow walk is short steps, a brisk one long; a run is all reach
    const amp = lerp(clamp(0.32 + sp * 0.31, 0.32, 1.25), 1, run);
    const a1 = Math.min(1, amp);
    const armed = this.armed;
    for (let s = 0; s < 2; s++) {
      const t = u + s * 0.5;
      let th = lerp(loop(WALK_TH, t), loop(RUN_TH, t), run) * amp;
      let kn = Math.max(0, lerp(loop(WALK_KN, t), loop(RUN_KN, t), run)) * lerp(0.5 + 0.5 * a1, 1, run);
      // a fighter prowls: knees bent, weight low
      if (armed) {
        th += 0.16;
        kn += 0.3;
      }
      o[s ? P.legRX : P.legLX] = th;
      o[s ? P.kneeR : P.kneeL] = kn;
    }
    // hips ride the lowest foot (up over a straight leg, down between steps) and leave the ground at a run
    const v = 2 * u - Math.floor(2 * u);
    const flight = v > 0.72 ? Math.sin((Math.PI * (v - 0.72)) / 0.28) : 0;
    o[P.rootY] = grounded(o) + flight * 0.075 * run;

    const bank = clamp(-this.turnRate * sp * 0.028, -0.24, 0.24);
    const lean = clamp(this.accel * 0.022, -0.09, 0.12);
    // over the standing foot, the hips turned with the swinging leg
    const sway = lerp(0.032 * a1, 0.016, run) * Math.cos(ph - lerp(0.3, 0.18, run) * TAU);
    const twist = -lerp(0.075 * a1, 0.11, run) * Math.cos(ph - 0.03 * TAU);
    B[SW] = sway;
    B[RL] = -sway * 0.9 + bank;
    B[TW] = twist;
    B[PT] = lerp(0.015, 0.07, run) + lean * 0.6;
    // the shoulders: turned against the hips, level over the swaying pelvis, a dip at each footfall
    o[P.spineX] = lerp(0.04, 0.2, run) + (armed ? 0.1 : 0) + lean * 0.8 + 0.02 * a1 * Math.cos(2 * ph);
    o[P.spineY] = -twist + lerp(0.1, 0.17, run) * a1 * Math.cos(ph - 0.06 * TAU) + this.lookYaw * 0.15;
    o[P.spineZ] = sway * 1.4;
    // arms swing against the legs, a beat late, elbows folding on the way forward
    const swing = Math.cos(ph - 0.07 * TAU);
    const armA = lerp(0.12 + 0.26 * Math.min(1.2, amp), 0.95, run);
    const bias = lerp(0.04, 0.32, run);
    const eb = lerp(0.18, 1.45, run);
    o[P.armRX] = bias + armA * swing;
    o[P.armLX] = bias - armA * swing;
    o[P.elbowR] = eb + lerp(0.32, 0.3, run) * Math.max(0, swing);
    o[P.elbowL] = eb + lerp(0.32, 0.3, run) * Math.max(0, -swing);
    o[P.armRZ] = lerp(0.07, 0.14, run) - 0.12 * run * Math.max(0, swing);
    o[P.armLZ] = lerp(0.07, 0.14, run) - 0.12 * run * Math.max(0, -swing);
    o[P.handL] = o[P.handR] = lerp(0.3, 0.8, run);
    // the head stays level and looks ahead, into the turn, or at whoever he's talking to
    o[P.headY] = -(twist + o[P.spineY]) * 0.85 + clamp(this.turnRate * 0.12, -0.4, 0.4) + this.lookYaw * 0.8;
    o[P.headZ] = -(B[RL] + o[P.spineZ]) * 0.8;
    o[P.headX] = -(B[PT] + o[P.spineX]) * 0.6 + 0.03 + 0.025 * a1 * Math.cos(2 * ph + 0.6);
    // puffing at a run
    o[P.jaw] = run * (0.14 + 0.08 * Math.sin(tt * 5.3));
  }

  /** Standing about: the weight drifting from foot to foot, the free knee easing, breathing. */
  private stance(o: Float32Array, tt: number) {
    const w = clamp(Math.sin(tt * 0.21 + this.seed * 2.3) * 1.7, -1, 1);
    B[SW] = 0.028 * w;
    B[RL] = -0.02 * w;
    o[P.spineZ] += 0.034 * w;
    o[P.headZ] -= 0.02 * w;
    if (w > 0) {
      o[P.kneeR] += 0.2 * w;
      o[P.legRX] += 0.07 * w;
    } else {
      o[P.kneeL] -= 0.2 * w;
      o[P.legLX] -= 0.07 * w;
    }
    o[P.rootY] = Math.min(o[P.rootY], grounded(o));
    const br = Math.sin(tt * 1.55 + this.seed);
    o[P.spineX] += 0.014 * br;
    o[P.headX] -= 0.012 * br;
    o[P.armLZ] += 0.02 + 0.012 * br;
    o[P.armRZ] += 0.02 + 0.012 * br;
  }

  /** A spade stroke: raise, drive in with a boot on the blade, lever up, toss the sand aside. */
  private digPose(o: Float32Array) {
    const u = this.digPhase % 1;
    let i = DIG_AT.length - 1;
    while (i > 0 && DIG_AT[i] > u) i--;
    const a = DIG[i];
    const b = DIG[(i + 1) % DIG.length];
    const t0 = DIG_AT[i];
    const t1 = i + 1 < DIG_AT.length ? DIG_AT[i + 1] : 1;
    const w = smooth((u - t0) / (t1 - t0));
    for (const k of DIG_KEYS) o[k] = lerp(a[k] ?? 0, b[k] ?? 0, w);
    o[P.handR] = 1;
    o[P.handL] = 1;
    o[P.brow] = -0.3;
    o[P.jaw] = i === 1 ? 0.35 : 0.1;
  }

  /** Blade up: a crouched guard, the cutlass held out ahead, the off hand out for balance, rocking on the balls of the feet. */
  private guard(o: Float32Array, moving: boolean, tt: number) {
    const b = Math.sin(tt * 2.2) * 0.04;
    if (moving) {
      o[P.armRX] = 0.95 + 0.05 * Math.sin(this.phase * 2);
      o[P.armRZ] = 0.2;
      o[P.elbowR] = 0.9;
      o[P.armLZ] = 0.4;
      o[P.elbowL] = 0.9;
      o[P.armLX] = 0.35 + (o[P.armLX] - 0.04) * 0.4;
      return;
    }
    o[P.armRX] = 0.78 + b;
    o[P.armRZ] = 0.18;
    o[P.elbowR] = 1.12;
    o[P.armLX] = 0.4;
    o[P.armLZ] = 0.48;
    o[P.elbowL] = 1.15;
    o[P.handL] = 0.45;
    o[P.spineY] = -0.18;
    o[P.spineX] = 0.12;
    o[P.headY] = 0.25;
    crouch(o, 0.28 + b);
    o[P.legLX] += 0.22;
    o[P.legRX] -= 0.18;
    o[P.rootY] = grounded(o);
    B[SW] = 0.02 * Math.sin(tt * 1.1);
    B[RL] = -0.015 * Math.sin(tt * 1.1);
    B[TW] = -0.12;
  }

  /**
   * A cut, keyed: easing into the wind-up, a hang with the body coiled and the
   * weight back, the blade whipped through (accelerating to the blow), carried
   * on past it, settled, and back on guard. The hips lead, the head stays on
   * the man being cut.
   */
  private cutPose(o: Float32Array) {
    const c = this.cut;
    const t = this.cutT;
    const m = CUT_MARKS[c];
    let i = 0;
    while (i < 5 && t >= m[i + 1]) i++;
    const e = SEG_EASE[i](clamp((t - m[i]) / (m[i + 1] - m[i]), 0, 1));
    const a = i === 0 ? null : CUTS[c][i - 1];
    const z = i === 5 ? null : CUTS[c][i];
    for (const k of KEYS) {
      const f = a ? a.k[k] ?? o[k] : o[k];
      const g = z ? z.k[k] ?? o[k] : o[k];
      o[k] = lerp(f, g, e);
    }
    for (let j = 0; j < 4; j++) {
      const bi = BODY_OF[j];
      const f = a ? a.b[j] : B[bi];
      const g = z ? z.b[j] : B[bi];
      B[bi] = lerp(f, g, e);
    }
    o[P.rootY] = grounded(o);
    // eyes on the man in front
    o[P.headY] = -(o[P.spineY] + B[TW]) * 0.8;
    o[P.headX] = -(o[P.spineX] + B[PT]) * 0.5 + 0.08;
    o[P.handR] = 1;
    o[P.brow] = -0.95;
    o[P.jaw] = i >= 2 && i <= 3 ? 0.6 : 0.2;
    o[P.smile] = -0.5;
  }

  /** Where the cutlass is, `along` 0 (hilt) .. 1 (tip) of the blade, in world space, from the pose as drawn. */
  bladeAt(along: number, out: THREE.Vector3) {
    const o = this.pose;
    // the blade in the right fist, sloping out ahead and curving up (see the cutlass in crewModel)
    const d = 0.04 + along * 0.62;
    const cv = 0.06 * along * along;
    _p.set(RIG_HX, RIG.gripY - 0.5 * d + 0.866 * cv, 0.006 + 0.866 * d + 0.5 * cv);
    // elbow, shoulder, spine: as the vertex shader bends them
    rotX(_p, RIG.elY, -o[P.elbowR]);
    rotXZ(_p, RIG.shY, -o[P.armRX], -o[P.armRZ]);
    spine(_p, o[P.spineX], o[P.spineZ], o[P.spineY]);
    _p.y += o[P.rootY];
    return out.copy(_p).applyMatrix4(this.matrix);
  }

  /** On the sand: limbs flung out, dazed. */
  private sprawl(o: Float32Array, tt: number) {
    const w = this.fall;
    const lie = (k: number, v: number) => (o[k] = lerp(o[k], v, w));
    lie(P.armLX, 0.4);
    lie(P.armLZ, 1.25 + 0.1 * Math.sin(this.seed));
    lie(P.elbowL, 0.4);
    lie(P.armRX, 0.2);
    lie(P.armRZ, 1.1);
    lie(P.elbowR, 0.6);
    lie(P.legLX, 0.15);
    lie(P.kneeL, 0.35);
    lie(P.legRX, 0.5);
    lie(P.kneeR, 0.9);
    lie(P.spineX, -0.15);
    lie(P.headX, -0.25);
    lie(P.headY, 0.45 * Math.sin(this.seed * 3));
    lie(P.rootY, 0);
    o[P.jaw] = 0.35 + 0.1 * Math.sin(tt * 1.7);
    o[P.brow] = 0.7;
    o[P.smile] = -0.3;
    o[P.handL] = 0.2;
    o[P.handR] = 0.2;
  }

  /** At ease: sitting by the fire, warming hands, chatting, keeping watch. */
  private ease(o: Float32Array, tt: number) {
    switch (this.idle) {
      case 'sit': {
        const drop = Math.max(0.3, 0.88 - this.seatH - 0.06);
        o[P.rootY] = -drop;
        o[P.legLX] = 1.35;
        o[P.legRX] = 1.3;
        o[P.kneeL] = 1.4;
        o[P.kneeR] = 1.25;
        o[P.spineX] = 0.18;
        o[P.armLX] = 0.65;
        o[P.armRX] = 0.6;
        o[P.elbowL] = 1.1;
        o[P.elbowR] = 1.0;
        o[P.armLZ] = 0.12;
        o[P.armRZ] = 0.12;
        o[P.headX] = 0.12 + 0.08 * Math.sin(tt * 0.4);
        break;
      }
      case 'warm':
        // hands out to the flames
        o[P.armLX] = 1.15;
        o[P.armRX] = 1.15;
        o[P.elbowL] = 0.55;
        o[P.elbowR] = 0.55;
        o[P.armLZ] = -0.08;
        o[P.armRZ] = -0.08;
        o[P.handL] = 0.05;
        o[P.handR] = 0.05;
        o[P.spineX] = 0.15;
        crouch(o, 0.18);
        break;
      case 'ground':
        // sat on the sand, leaning back on both hands
        o[P.rootY] = -0.74;
        o[P.legLX] = 1.45;
        o[P.legRX] = 1.38;
        o[P.kneeL] = 0.55;
        o[P.kneeR] = 1.0;
        o[P.spineX] = -0.32;
        o[P.armLX] = -0.55;
        o[P.armRX] = -0.55;
        o[P.armLZ] = 0.28;
        o[P.armRZ] = 0.28;
        o[P.elbowL] = 0.05;
        o[P.elbowR] = 0.05;
        o[P.headX] = 0.15;
        break;
      case 'watch':
        // a hand shading the eyes, squinting out to sea
        this.stance(o, tt);
        o[P.armRX] = 2.25;
        o[P.armRZ] = 0.35;
        o[P.elbowR] = 2.35;
        o[P.handR] = 0.1;
        o[P.armLZ] = 0.6;
        o[P.elbowL] = 1.6;
        o[P.handL] = 0.55;
        o[P.headX] = -0.08;
        break;
      case 'lean':
        // hands on hips
        this.stance(o, tt);
        o[P.armLZ] = 0.55;
        o[P.armRZ] = 0.55;
        o[P.elbowL] = 1.7;
        o[P.elbowR] = 1.7;
        o[P.armLX] = -0.15;
        o[P.armRX] = -0.15;
        break;
      case 'chat': {
        this.stance(o, tt);
        const talk = Math.sin(tt * 0.9) > 0;
        if (talk) {
          o[P.armRX] = 0.75 + 0.3 * Math.sin(tt * 2.6);
          o[P.elbowR] = 1.2 + 0.4 * Math.sin(tt * 3.1);
          o[P.armRZ] = 0.2;
        }
        o[P.headY] = 0.15 * Math.sin(tt * 0.7);
        break;
      }
      default:
        this.stance(o, tt);
        o[P.headY] = this.lookYaw * 0.7;
        o[P.spineY] = this.lookYaw * 0.25;
    }
  }

  private face(o: Float32Array, tt: number, moving: boolean) {
    if (this.down) return;
    if (this.armed) {
      o[P.brow] = Math.min(o[P.brow], -0.6);
      o[P.smile] = Math.min(o[P.smile], this.team === 'foe' ? 0.2 : -0.1);
      if (this.team === 'foe') o[P.smile] = 0.35; // an ugly grin
    } else if (this.cheer <= 0) {
      o[P.smile] = 0.3 + 0.2 * Math.sin(this.seed);
      if (this.idle === 'chat' && !moving) {
        const talk = Math.sin(tt * 0.9) > 0;
        o[P.jaw] = talk ? 0.12 + 0.4 * Math.max(0, Math.sin(tt * 11)) * (0.5 + 0.5 * Math.sin(tt * 2.7)) : 0;
        o[P.smile] = talk ? 0.6 : 0.45 + 0.3 * Math.max(0, Math.sin(tt * 1.3));
        o[P.brow] = talk ? 0.4 * Math.max(0, Math.sin(tt * 1.9)) : 0.1;
      }
      if (this.idle === 'watch') o[P.brow] = -0.4;
      if (this.talking && moving) {
        o[P.jaw] = Math.max(o[P.jaw], 0.1 + 0.36 * Math.max(0, Math.sin(tt * 10.5)) * (0.5 + 0.5 * Math.sin(tt * 2.3)));
        o[P.smile] = 0.55;
        o[P.brow] = 0.3 * Math.max(0, Math.sin(tt * 1.7));
      }
    }
    if (this.shout > 0) {
      // a roar: mouth wide, brows down
      o[P.jaw] = 0.7 + 0.3 * Math.sin(tt * 14);
      o[P.brow] = -1;
      o[P.smile] = -0.4;
    }
    o[P.handR] = this.armed ? 1 : o[P.handR];
  }

  /** Writes the world matrix: feet on the ground, the body's sway and lean on top, falling backwards when knocked down. */
  place3(ground: number) {
    const f = this.fall;
    const ease = f * f * (3 - 2 * f);
    const up = 1 - ease;
    const b = this.body;
    // a body on its back is a hand's breadth off the sand
    this.y = ground;
    _e.set(-ease * 1.5 + b[PT] * up, this.yaw + b[TW] * up, b[RL] * up);
    _q.setFromEuler(_e);
    _s.set(this.girth, this.height, this.girth);
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const sw = b[SW] * up * this.girth;
    const fw = b[FW] * up;
    _p.set(this.x + c * sw + s * fw, ground + ease * 0.16 - (this.wade > 0 ? 0.04 : 0), this.z - s * sw + c * fw);
    this.matrix.compose(_p, _q, _s);
  }

  turn(dt: number, rate = 9) {
    this.yaw += angleDelta(this.yaw, this.wantYaw) * damp(rate, dt);
  }
}

const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

type Keys = Partial<Record<number, number>>;
/** The spade stroke's keyframes, and where in the stroke (0..1) each falls. */
const DIG_KEYS = [P.armRX, P.armRZ, P.elbowR, P.armLX, P.armLZ, P.elbowL, P.spineX, P.spineY, P.legRX, P.kneeR, P.kneeL, P.rootY, P.headX];
const DIG_AT = [0, 0.3, 0.58, 0.8];
const DIG: Keys[] = [
  { [P.armRX]: 0.95, [P.elbowR]: 1.15, [P.armLX]: 1.05, [P.armLZ]: -0.25, [P.elbowL]: 1.25, [P.spineX]: 0.22, [P.kneeL]: 0.15, [P.kneeR]: 0.15, [P.rootY]: -0.03, [P.headX]: 0.25 },
  { [P.armRX]: 0.42, [P.elbowR]: 0.35, [P.armLX]: 0.55, [P.armLZ]: -0.2, [P.elbowL]: 0.5, [P.spineX]: 0.55, [P.legRX]: 0.45, [P.kneeR]: 0.75, [P.kneeL]: 0.35, [P.rootY]: -0.1, [P.headX]: 0.35 },
  { [P.armRX]: 1.0, [P.elbowR]: 0.85, [P.armLX]: 0.9, [P.armLZ]: -0.2, [P.elbowL]: 0.9, [P.spineX]: 0.42, [P.kneeL]: 0.4, [P.kneeR]: 0.4, [P.rootY]: -0.12, [P.headX]: 0.3 },
  { [P.armRX]: 1.35, [P.armRZ]: 0.45, [P.elbowR]: 0.55, [P.armLX]: 1.15, [P.armLZ]: 0.1, [P.elbowL]: 0.7, [P.spineX]: 0.22, [P.spineY]: -0.6, [P.kneeL]: 0.2, [P.kneeR]: 0.2, [P.rootY]: -0.05, [P.headX]: 0.15 },
];

const KEYS = [
  P.armRX, P.armRZ, P.elbowR, P.armLX, P.armLZ, P.elbowL, P.spineX, P.spineY, P.spineZ, P.legLX, P.legRX, P.kneeL, P.kneeR,
];

/** A periodic curve through [t, value] keys over one cycle (the last key repeats the first, a cycle on), Catmull-Rom between. */
function loop(k: number[][], t: number) {
  const n = k.length - 1;
  t -= Math.floor(t);
  let i = 0;
  while (i < n - 1 && k[i + 1][0] <= t) i++;
  const a = k[i];
  const b = k[i + 1];
  const pt = i > 0 ? k[i - 1][0] : k[n - 1][0] - 1;
  const pv = i > 0 ? k[i - 1][1] : k[n - 1][1];
  const qt = i + 2 <= n ? k[i + 2][0] : k[1][0] + 1;
  const qv = i + 2 <= n ? k[i + 2][1] : k[1][1];
  const h = b[0] - a[0];
  const u = (t - a[0]) / h;
  const m0 = ((b[1] - pv) / (b[0] - pt)) * h;
  const m1 = ((qv - a[1]) / (qt - a[0])) * h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * m0 + (3 * u2 - 2 * u3) * b[1] + (u3 - u2) * m1;
}

// One leg's stride, from its heel striking out ahead (0) round to the next strike (1): [t, angle].
// Walking: the weight taken on a softening knee, carried over a straight leg,
// pushed off the toe at 0.6, and the leg swung through, knee high, to reach again.
const WALK_TH = [[0, 0.4], [0.15, 0.27], [0.35, 0.02], [0.6, -0.3], [0.72, -0.05], [0.88, 0.44], [1, 0.4]];
const WALK_KN = [[0, 0.05], [0.1, 0.26], [0.3, 0.07], [0.5, 0.18], [0.6, 0.5], [0.72, 1.05], [0.85, 0.55], [0.96, 0.04], [1, 0.05]];
// Running: a short stance on a deep knee, off the ground by 0.36, the heel kicked up to the seat and the thigh driven high.
const RUN_TH = [[0, 0.5], [0.18, 0.02], [0.36, -0.5], [0.5, -0.25], [0.72, 0.82], [0.88, 0.72], [1, 0.5]];
const RUN_KN = [[0, 0.32], [0.14, 0.7], [0.36, 0.32], [0.58, 1.95], [0.78, 1.35], [0.93, 0.35], [1, 0.32]];

/** How far below standing tall the hips must sit for the lower foot to touch the ground (<= 0). */
function grounded(o: Float32Array) {
  const v = (th: number, kn: number) => 0.38 * Math.cos(th) + 0.42 * Math.cos(th - kn) + 0.04;
  return Math.min(0, Math.max(v(o[P.legLX], o[P.kneeL]), v(o[P.legRX], o[P.kneeR])) - 0.84);
}

// the right arm's bones, as the sailor's vertex shader bends them
const RIG_HX = -(RIG.shX + 0.01) + 0.012;
function rotX(p: THREE.Vector3, py: number, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const y = p.y - py;
  const z = p.z;
  p.y = py + c * y - s * z;
  p.z = s * y + c * z;
}
function rotXZ(p: THREE.Vector3, py: number, ax: number, az: number) {
  const x = p.x + RIG.shX;
  let y = p.y - py;
  let z = p.z;
  let c = Math.cos(ax);
  let s = Math.sin(ax);
  const y1 = c * y - s * z;
  z = s * y + c * z;
  y = y1;
  c = Math.cos(az);
  s = Math.sin(az);
  p.x = -RIG.shX + c * x - s * y;
  p.y = py + s * x + c * y;
  p.z = z;
}
function spine(p: THREE.Vector3, ax: number, az: number, ay: number) {
  const py = 0.98;
  let x = p.x;
  let y = p.y - py;
  let z = p.z;
  let c = Math.cos(ax);
  let s = Math.sin(ax);
  const y1 = c * y - s * z;
  z = s * y + c * z;
  y = y1;
  c = Math.cos(az);
  s = Math.sin(az);
  const x1 = c * x - s * y;
  y = s * x + c * y;
  x = x1;
  c = Math.cos(ay);
  s = Math.sin(ay);
  p.x = c * x + s * z;
  p.y = py + y;
  p.z = -s * x + c * z;
}

/** A cut's key: joint angles, and the body's [step ahead, pitch, roll, hip turn]. */
type CutKey = { k: Keys; b: [number, number, number, number] };
const BODY_OF = [FW, PT, RL, TW];
/** The marks every cut passes: on guard, easing back, coiled, the blow, carried through, settled, on guard. */
const CUT_MARKS = [0, 1, 2].map((c) => [0, CUT_WIND[c] * 0.55, CUT_WIND[c], CUT_HIT[c], CUT_HIT[c] + (CUT_HOLD[c] - CUT_HIT[c]) * 0.5, CUT_HOLD[c], CUT_END[c]]);
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
/** Into the wind-up gently, settling into the coil, whipped through to the blow, carried on, settled, home. */
const SEG_EASE = [smooth, easeOut, (x: number) => x ** 2.4, (x: number) => 1 - (1 - x) ** 3, smooth, smooth];

/** Each cut as [easing back, coiled, the blow, carried through, settled]. */
const CUTS: CutKey[][] = [
  // overhead: blade back over the shoulder, weight on the back foot, then down hard and across with a step in
  [
    { k: { [P.armRX]: 2.3, [P.armRZ]: 0.35, [P.elbowR]: 1.6, [P.spineY]: -0.28, [P.spineX]: -0.08, [P.spineZ]: -0.05, [P.armLX]: 0.85, [P.armLZ]: 0.3, [P.elbowL]: 0.5, [P.legLX]: 0.25, [P.kneeL]: 0.35, [P.legRX]: -0.1, [P.kneeR]: 0.45 }, b: [-0.05, -0.04, 0, -0.08] },
    { k: { [P.armRX]: 2.85, [P.armRZ]: 0.42, [P.elbowR]: 1.95, [P.spineY]: -0.45, [P.spineX]: -0.16, [P.spineZ]: -0.08, [P.armLX]: 1.0, [P.armLZ]: 0.2, [P.elbowL]: 0.35, [P.legLX]: 0.28, [P.kneeL]: 0.4, [P.legRX]: -0.12, [P.kneeR]: 0.55 }, b: [-0.1, -0.07, 0.02, -0.14] },
    { k: { [P.armRX]: 0.6, [P.armRZ]: -0.08, [P.elbowR]: 0.12, [P.spineY]: 0.32, [P.spineX]: 0.38, [P.spineZ]: 0.06, [P.armLX]: 0.1, [P.armLZ]: 0.65, [P.elbowL]: 0.9, [P.legLX]: 0.7, [P.kneeL]: 1.0, [P.legRX]: -0.45, [P.kneeR]: 0.45 }, b: [0.08, 0.08, -0.03, 0.14] },
    { k: { [P.armRX]: -0.05, [P.armRZ]: -0.38, [P.elbowR]: 0.2, [P.spineY]: 0.5, [P.spineX]: 0.5, [P.spineZ]: 0.1, [P.armLX]: -0.25, [P.armLZ]: 0.75, [P.elbowL]: 0.9, [P.legLX]: 0.72, [P.kneeL]: 1.05, [P.legRX]: -0.48, [P.kneeR]: 0.48 }, b: [0.12, 0.11, -0.05, 0.2] },
    { k: { [P.armRX]: 0.3, [P.armRZ]: -0.2, [P.elbowR]: 0.45, [P.spineY]: 0.35, [P.spineX]: 0.36, [P.spineZ]: 0.04, [P.armLX]: 0.1, [P.armLZ]: 0.6, [P.elbowL]: 0.9, [P.legLX]: 0.6, [P.kneeL]: 0.85, [P.legRX]: -0.36, [P.kneeR]: 0.45 }, b: [0.08, 0.06, -0.02, 0.12] },
  ],
  // backhand: blade drawn across to the off hip, shoulder turned in, then swept out wide as the body unwinds
  [
    { k: { [P.armRX]: 1.35, [P.armRZ]: -0.8, [P.elbowR]: 1.5, [P.spineY]: 0.35, [P.spineX]: 0.06, [P.spineZ]: 0.04, [P.armLX]: 0.3, [P.armLZ]: 0.5, [P.elbowL]: 1.2, [P.legLX]: 0.25, [P.kneeL]: 0.4, [P.legRX]: 0.15, [P.kneeR]: 0.45 }, b: [-0.04, 0.02, 0.03, 0.12] },
    { k: { [P.armRX]: 1.45, [P.armRZ]: -1.05, [P.elbowR]: 1.8, [P.spineY]: 0.58, [P.spineX]: 0.1, [P.spineZ]: 0.06, [P.armLX]: 0.25, [P.armLZ]: 0.45, [P.elbowL]: 1.3, [P.legLX]: 0.28, [P.kneeL]: 0.48, [P.legRX]: 0.18, [P.kneeR]: 0.52 }, b: [-0.06, 0.03, 0.05, 0.22] },
    { k: { [P.armRX]: 1.5, [P.armRZ]: 0.55, [P.elbowR]: 0.12, [P.spineY]: -0.25, [P.spineX]: 0.18, [P.spineZ]: -0.04, [P.armLX]: 0.2, [P.armLZ]: 0.95, [P.elbowL]: 0.6, [P.legLX]: -0.1, [P.kneeL]: 0.4, [P.legRX]: 0.6, [P.kneeR]: 0.75 }, b: [0.06, 0.05, -0.04, -0.14] },
    { k: { [P.armRX]: 1.3, [P.armRZ]: 1.25, [P.elbowR]: 0.2, [P.spineY]: -0.6, [P.spineX]: 0.2, [P.spineZ]: -0.08, [P.armLX]: 0.15, [P.armLZ]: 1.0, [P.elbowL]: 0.5, [P.legLX]: -0.14, [P.kneeL]: 0.42, [P.legRX]: 0.62, [P.kneeR]: 0.8 }, b: [0.09, 0.06, -0.07, -0.22] },
    { k: { [P.armRX]: 1.2, [P.armRZ]: 0.95, [P.elbowR]: 0.4, [P.spineY]: -0.45, [P.spineX]: 0.16, [P.spineZ]: -0.05, [P.armLX]: 0.2, [P.armLZ]: 0.8, [P.elbowL]: 0.7, [P.legLX]: -0.08, [P.kneeL]: 0.38, [P.legRX]: 0.5, [P.kneeR]: 0.68 }, b: [0.06, 0.04, -0.04, -0.16] },
  ],
  // lunge: drawn back to the hip, weight sunk on the back leg, then the point driven home with the whole body behind it
  [
    { k: { [P.armRX]: 0.75, [P.armRZ]: 0.2, [P.elbowR]: 1.7, [P.spineY]: -0.32, [P.spineX]: 0.0, [P.spineZ]: -0.03, [P.armLX]: 0.75, [P.armLZ]: 0.3, [P.elbowL]: 0.4, [P.legRX]: -0.05, [P.kneeR]: 0.5, [P.legLX]: 0.28, [P.kneeL]: 0.42 }, b: [-0.07, -0.04, 0, -0.12] },
    { k: { [P.armRX]: 0.6, [P.armRZ]: 0.28, [P.elbowR]: 2.1, [P.spineY]: -0.5, [P.spineX]: -0.05, [P.spineZ]: -0.05, [P.armLX]: 0.95, [P.armLZ]: 0.25, [P.elbowL]: 0.2, [P.legRX]: -0.08, [P.kneeR]: 0.62, [P.legLX]: 0.32, [P.kneeL]: 0.5 }, b: [-0.12, -0.06, 0.01, -0.22] },
    { k: { [P.armRX]: 1.58, [P.armRZ]: 0.02, [P.elbowR]: 0.0, [P.spineY]: 0.45, [P.spineX]: 0.3, [P.spineZ]: 0.02, [P.armLX]: -0.55, [P.armLZ]: 0.55, [P.elbowL]: 0.2, [P.legRX]: 0.95, [P.kneeR]: 0.95, [P.legLX]: -0.55, [P.kneeL]: 0.08 }, b: [0.12, 0.12, -0.02, 0.24] },
    { k: { [P.armRX]: 1.62, [P.armRZ]: 0.0, [P.elbowR]: 0.0, [P.spineY]: 0.52, [P.spineX]: 0.36, [P.spineZ]: 0.03, [P.armLX]: -0.7, [P.armLZ]: 0.6, [P.elbowL]: 0.15, [P.legRX]: 1.0, [P.kneeR]: 1.02, [P.legLX]: -0.6, [P.kneeL]: 0.1 }, b: [0.16, 0.14, -0.03, 0.28] },
    { k: { [P.armRX]: 1.5, [P.armRZ]: 0.04, [P.elbowR]: 0.15, [P.spineY]: 0.42, [P.spineX]: 0.3, [P.spineZ]: 0.02, [P.armLX]: -0.5, [P.armLZ]: 0.55, [P.elbowL]: 0.3, [P.legRX]: 0.9, [P.kneeR]: 0.92, [P.legLX]: -0.5, [P.kneeL]: 0.1 }, b: [0.12, 0.1, -0.02, 0.22] },
  ],
];
