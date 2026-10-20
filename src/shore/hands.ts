import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/noise';
import { Builder, Bucket } from '../port/port';
import { TINT } from '../ships/crewModel';
import type { Look } from '../ships/crew';
import type { ShoreMats } from './kit';
import { CUT_HIT, CUT_HOLD, CUT_WIND, Walker } from './walker';
import type { World } from '../game/world';

// The captain's own hands, seen from their eyes ashore: the cutlass in the
// right fist, the flintlock in the left, both on a spade's shaft when digging,
// and coat sleeves running off the bottom of the screen to elbows out of view.
// Every pose is keyed in camera space and eased, so the blade comes up when
// the captain draws it, sweeps through each of the three cuts in time with the
// figure's own (the same marks the hit logic uses), drops away when sheathed,
// lags a touch behind the look and rides the stride. Built from the shore's
// own materials: nothing new is compiled.

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _kq = new THREE.Quaternion();
const _kp = new THREE.Vector3();
const _sway = new THREE.Vector3();
const _wr = new THREE.Vector3();
const _wl = new THREE.Vector3();
const _el = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _key: Key = { p: new THREE.Vector3(), q: new THREE.Quaternion() };

/** A held thing's pose in camera space: where the hand is, and its frame (local +Y along the blade / barrel / shaft). */
interface Key {
  p: THREE.Vector3;
  q: THREE.Quaternion;
}

/** Local +Y along `dir`, local +Z turned as near `edge` as it will go. */
function key(px: number, py: number, pz: number, dir: [number, number, number], edge: [number, number, number]): Key {
  _y.set(...dir).normalize();
  _z.set(...edge);
  _z.addScaledVector(_y, -_z.dot(_y)).normalize();
  _x.crossVectors(_y, _z);
  return { p: new THREE.Vector3(px, py, pz), q: new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(_x, _y, _z)) };
}

const GUARD = key(0.24, -0.22, -0.44, [-0.18, 0.62, -0.76], [-0.2, 0.3, -1]);
const DOWN = key(0.32, -0.82, -0.3, [-0.1, 0.4, -0.9], [0, 0.4, -1]);
/** Each cut: coiled at the wind-up's end, the blade landing, the follow-through. */
const CUTS: [Key, Key, Key][] = [
  // overhead: from high over the right shoulder, down across to the left hip
  [key(0.3, 0.05, -0.27, [0.3, 0.85, 0.42], [-0.3, 0.2, -0.9]), key(0.04, -0.12, -0.58, [-0.58, 0.18, -0.8], [-0.3, -0.9, 0.1]), key(-0.2, -0.38, -0.42, [-0.55, -0.62, -0.56], [0.2, -0.7, 0.6])],
  // backhand: wound round to the left, swept flat across to the right
  [key(-0.13, -0.14, -0.36, [-0.85, 0.35, -0.3], [0.3, 0, -1]), key(0.06, -0.1, -0.6, [0.15, 0.25, -0.95], [1, 0, 0.1]), key(0.35, -0.17, -0.36, [0.88, 0.2, -0.2], [0.3, 0, 0.9])],
  // lunge: drawn back by the hip, then the whole arm's length straight out
  [key(0.3, -0.2, -0.22, [-0.08, 0.3, -0.95], [0, -1, 0]), key(0.07, -0.13, -0.8, [-0.06, 0.1, -1], [0, -1, 0]), key(0.09, -0.15, -0.72, [-0.06, 0.08, -1], [0, -1, 0])],
];
const PISTOL_DOWN = key(-0.26, -0.78, -0.3, [0.1, 0.5, -0.85], [0, 1, 0.5]);
const PISTOL_AIM = key(-0.115, -0.125, -0.5, [0.05, 0.035, -1], [0, 1, 0]);
/** The spade stroke (see the walker's DIG keys): ready, driven in, levered up, the spadeful tossed off to the right. */
const SPADE_AT = [0, 0.3, 0.58, 0.8];
/** A spade pose from where the right hand holds the D-grip and the way the shaft runs from it. */
const grip = (gx: number, gy: number, gz: number, dir: [number, number, number]) => {
  const k = key(0, 0, 0, dir, [0, 1, 0.3]);
  _a.set(...dir).normalize();
  k.p.set(gx, gy, gz).addScaledVector(_a, 0.45);
  return k;
};
// (keyed for the eyes on the hole, as they are while digging: the blade works the middle of the view)
const SPADE: Key[] = [
  grip(0.2, -0.3, -0.3, [-0.15, 0.35, -1.05]),
  grip(0.17, -0.38, -0.45, [-0.15, 0.26, -1.1]),
  grip(0.24, -0.42, -0.25, [-0.16, 0.57, -1.0]),
  grip(0.3, -0.25, -0.3, [0.55, 0.5, -0.7]),
];
const SPADE_DOWN = grip(0.24, -0.95, -0.2, [-0.1, -0.3, -1]);
/** Elbows, off the bottom corners of the screen. */
const ELBOW_R = new THREE.Vector3(0.36, -0.66, 0.1);
const ELBOW_L = new THREE.Vector3(-0.36, -0.66, 0.1);
const ELBOW_SPADE_L = new THREE.Vector3(-0.2, -0.75, -0.05);

const smooth = (t: number) => {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};

class Held {
  readonly group = new THREE.Group();
  readonly p = new THREE.Vector3();
  readonly q = new THREE.Quaternion();
  private lp = new THREE.Vector3();
  private lq = new THREE.Quaternion();
  constructor(rest: Key) {
    this.p.copy(rest.p);
    this.q.copy(rest.q);
    this.group.visible = false;
    this.group.matrixAutoUpdate = false;
  }

  /** Eases toward `k` (rate per second). */
  chase(k: Key, rate: number, dt: number) {
    const a = damp(rate, dt);
    this.p.lerp(k.p, a);
    this.q.slerp(k.q, a);
  }

  snap(k: Key) {
    this.p.copy(k.p);
    this.q.copy(k.q);
  }

  /** Lays the camera-space pose (plus sway, and an extra local turn and shift) into the world. */
  place(cam: THREE.Camera, sway: THREE.Vector3, show: boolean, turn?: THREE.Quaternion, shift?: THREE.Vector3) {
    this.group.visible = show;
    if (!show) return;
    this.lp.copy(this.p).add(sway);
    if (shift) this.lp.add(shift);
    this.lp.applyQuaternion(cam.quaternion).add(cam.position);
    this.lq.copy(cam.quaternion).multiply(this.q);
    if (turn) this.lq.multiply(turn);
    this.group.matrix.compose(this.lp, this.lq, _one);
    this.group.matrixWorldNeedsUpdate = true;
  }

  /** A local point of the held thing, in the world. */
  world(local: THREE.Vector3, out: THREE.Vector3) {
    return out.copy(local).applyMatrix4(this.group.matrix);
  }
}

/** A coat sleeve from a wrist to an elbow out of view: cuff, lace and all. */
class Sleeve {
  readonly group = new THREE.Group();
  constructor() {
    this.group.visible = false;
    this.group.matrixAutoUpdate = false;
  }

  place(wrist: THREE.Vector3, elbow: THREE.Vector3, show: boolean) {
    this.group.visible = show;
    if (!show) return;
    _a.subVectors(elbow, wrist).normalize();
    _q.setFromUnitVectors(_up, _a);
    this.group.matrix.compose(wrist, _q, _one);
    this.group.matrixWorldNeedsUpdate = true;
  }
}

export class Hands {
  readonly group = new THREE.Group();
  private blade = new Held(DOWN);
  private gun = new Held(PISTOL_DOWN);
  private spade = new Held(SPADE_DOWN);
  private armR = new Sleeve();
  private armL = new Sleeve();
  /** How much of the view the hands own (0 while swooping in or out). */
  private show = 0;
  private sway = new THREE.Vector3();
  private swayV = new THREE.Vector3();
  private recoil = 0;
  private recoilV = 0;
  private lastLoad = 1;
  private tipLive = false;
  private tip = new THREE.Vector3();
  private mid = new THREE.Vector3();
  /** Where the flintlock's muzzle is in the world (for the flash and smoke). */
  readonly muzzle = new THREE.Vector3();
  private lookKey = '';

  constructor(private mats: ShoreMats) {
    this.group.name = 'captain-hands';
    this.group.add(this.blade.group, this.gun.group, this.spade.group, this.armR.group, this.armL.group);
    this.dress(null);
  }

  /** Builds the hands and sleeves in this captain's own skin and coat. */
  dress(look: Look | null) {
    const sl = look?.slots;
    const c = (i: number, fb: number) => (sl ? new THREE.Color(sl[i][0], sl[i][1], sl[i][2]) : new THREE.Color(fb).convertSRGBToLinear());
    const skin = c(TINT.skin, 0xd39a72);
    const coat = c(TINT.coat, 0x7a2f2a);
    const trim = c(TINT.trim, 0xd4a64a);
    const key = `${skin.getHexString()}|${coat.getHexString()}|${trim.getHexString()}`;
    if (key === this.lookKey) return;
    this.lookKey = key;
    const mats = this.mats as unknown as Record<Bucket, THREE.Material>;
    const fill = (g: THREE.Group, build: (b: Builder) => void) => {
      for (const ch of [...g.children]) {
        g.remove(ch);
        (ch as THREE.Mesh).geometry?.dispose();
      }
      const b = new Builder();
      build(b);
      b.finish(g, mats);
      g.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        o.castShadow = false;
        o.frustumCulled = false;
      });
    };
    fill(this.blade.group, (b) => {
      cutlass(b);
      fist(b, skin, 0);
    });
    fill(this.gun.group, (b) => {
      pistol(b);
      fist(b, skin, 1);
    });
    fill(this.spade.group, (b) => {
      spade(b);
      fist(b, skin, 2);
      fist(b, skin, 3);
    });
    fill(this.armR.group, (b) => sleeve(b, coat, trim));
    fill(this.armL.group, (b) => sleeve(b, coat, trim));
  }

  /**
   * Poses the hands for this frame. `eye` is how far the camera is into the
   * captain's eyes (0..1); `look` the view's turn this frame (rad, for the
   * lag); `load` the pistol's reload (0 just fired .. 1).
   */
  update(dt: number, cam: THREE.Camera, w: Walker | null, eye: number, lookX: number, lookY: number, load: number, world: World) {
    this.show += ((w && eye > 0.92 && !w.down ? 1 : 0) - this.show) * damp(w && eye > 0.92 ? 5 : 14, dt);
    if (!w || this.show < 0.01) {
      this.group.visible = false;
      this.blade.snap(DOWN);
      this.gun.snap(PISTOL_DOWN);
      this.spade.snap(SPADE_DOWN);
      this.tipLive = false;
      this.lastLoad = load;
      return;
    }
    this.group.visible = true;
    // the hands lag the look a little, then catch up
    this.swayV.x += (lookX * 0.55 - this.sway.x * 90 - this.swayV.x * 16) * Math.min(dt, 0.05);
    this.swayV.y += (-lookY * 0.55 - this.sway.y * 90 - this.swayV.y * 16) * Math.min(dt, 0.05);
    this.sway.x = clamp(this.sway.x + this.swayV.x * Math.min(dt, 0.05), -0.06, 0.06);
    this.sway.y = clamp(this.sway.y + this.swayV.y * Math.min(dt, 0.05), -0.05, 0.05);
    // ...and ride the stride
    const walk = clamp(w.stride / 3, 0, 1.6);
    const sway = _sway.set(this.sway.x + Math.sin(w.phase) * 0.012 * walk, this.sway.y - Math.abs(Math.sin(w.phase)) * 0.014 * walk + 0.006 * walk, 0);
    // swooping in: everything rises from below the frame
    sway.y -= (1 - smooth(this.show)) * 0.5;

    // the cutlass
    const dig = w.digging;
    const B = this.blade;
    if (w.cutting && !dig) {
      const c = w.cut;
      const t = w.cutT;
      const [coil, hit, follow] = CUTS[c];
      if (t < CUT_WIND[c]) B.chase(coil, 16, dt);
      else if (t < CUT_HIT[c]) {
        // the blow: no easing, it snaps through
        const u = (t - CUT_WIND[c]) / (CUT_HIT[c] - CUT_WIND[c]);
        B.p.lerpVectors(coil.p, hit.p, u * u);
        B.q.slerpQuaternions(coil.q, hit.q, u * u);
      } else if (t < CUT_HOLD[c]) {
        const u = smooth((t - CUT_HIT[c]) / (CUT_HOLD[c] - CUT_HIT[c]));
        B.p.lerpVectors(hit.p, follow.p, 1 - (1 - u) * (1 - u));
        B.q.slerpQuaternions(hit.q, follow.q, 1 - (1 - u) * (1 - u));
      } else B.chase(GUARD, 10, dt);
    } else B.chase(w.armed && !dig ? GUARD : DOWN, w.armed && !dig ? 9 : 6, dt);
    // a guard breathes
    if (w.armed && !w.cutting) B.p.y += Math.sin(performance.now() * 0.0021) * 0.0009;
    const bladeIn = B.p.distanceToSquared(DOWN.p) > 0.004;
    B.place(cam, sway, bladeIn);

    // the flintlock: up on the trigger, a kick as it goes off
    if (load < this.lastLoad - 0.5) this.recoilV += 9;
    this.lastLoad = load;
    this.recoilV += (-this.recoil * 160 - this.recoilV * 15) * Math.min(dt, 0.05);
    this.recoil += this.recoilV * Math.min(dt, 0.05);
    const G = this.gun;
    G.chase(w.aim > 0 ? PISTOL_AIM : PISTOL_DOWN, w.aim > 0 ? 18 : 5, dt);
    const gunIn = G.p.distanceToSquared(PISTOL_DOWN.p) > 0.004;
    if (gunIn) {
      // the muzzle flips up and the hand comes back with the shot
      _kq.setFromAxisAngle(_xAxis, -this.recoil * 0.9);
      _kp.set(0, this.recoil * 0.03, this.recoil * 0.12);
    }
    G.place(cam, sway, gunIn, _kq, _kp);
    if (gunIn) G.world(_a.set(0, 0.27, 0), this.muzzle);
    else this.muzzle.copy(cam.position);

    // the spade, keyed to the figure's own stroke
    const S = this.spade;
    if (dig) {
      const u = w.digPhase % 1;
      let i = SPADE_AT.length - 1;
      while (i > 0 && SPADE_AT[i] > u) i--;
      const a = SPADE[i];
      const b = SPADE[(i + 1) % SPADE.length];
      const t1 = i + 1 < SPADE_AT.length ? SPADE_AT[i + 1] : 1;
      const k = smooth((u - SPADE_AT[i]) / (t1 - SPADE_AT[i]));
      _key.p.lerpVectors(a.p, b.p, k);
      _key.q.slerpQuaternions(a.q, b.q, k);
      S.chase(_key, 14, dt);
    } else S.chase(SPADE_DOWN, 5, dt);
    const spadeIn = S.p.distanceToSquared(SPADE_DOWN.p) > 0.004;
    S.place(cam, sway, spadeIn);

    // sleeves: from each wrist to an elbow below the frame
    const elbow = (e: THREE.Vector3) => _el.copy(e).add(sway).applyQuaternion(cam.quaternion).add(cam.position);
    const wristR = _wr;
    if (spadeIn && (!bladeIn || dig)) S.world(_a.set(0, -0.42, 0), wristR);
    else B.world(_a.set(0, -0.06, -0.004), wristR);
    this.armR.place(wristR, elbow(ELBOW_R), bladeIn || spadeIn);
    const wristL = _wl;
    const left = spadeIn && (!gunIn || dig);
    if (left) S.world(_a.set(0, 0.02, 0), wristL);
    else G.world(_a.set(0, -0.12, -0.085), wristL);
    this.armL.place(wristL, elbow(left ? ELBOW_SPADE_L : ELBOW_L), gunIn || spadeIn);

    this.trail(w, world);
  }

  /** A pale smear along the blade as it comes through, like the figures' own. */
  private trail(w: Walker, world: World) {
    const c = w.cut;
    const on = this.blade.group.visible && w.cutting && w.cutT > CUT_WIND[c] * 0.85 && w.cutT < CUT_HIT[c] + 0.08;
    if (!on) {
      this.tipLive = false;
      return;
    }
    const tip = this.blade.world(_a.set(0, 0.68, -0.05), _tip);
    const mid = this.blade.world(_a.set(0, 0.36, -0.015), _mid);
    if (this.tipLive) {
      const n = Math.min(24, Math.ceil(tip.distanceTo(this.tip) / 0.02));
      const hot = clamp(1.4 - Math.abs(w.cutT - CUT_HIT[c]) * 9, 0.45, 1);
      for (let j = 1; j <= n; j++) {
        const f = j / n;
        for (let e = 0; e < 3; e++) {
          const along = e / 2;
          const k = hot * (0.5 + 0.5 * along);
          world.particles.emit(
            {
              x: lerp(lerp(this.mid.x, this.tip.x, along), lerp(mid.x, tip.x, along), f),
              y: lerp(lerp(this.mid.y, this.tip.y, along), lerp(mid.y, tip.y, along), f),
              z: lerp(lerp(this.mid.z, this.tip.z, along), lerp(mid.z, tip.z, along), f),
              life: 0.07 + 0.06 * f, size: 0.018 + 0.022 * along, sizeEnd: 0.008,
              color: [1.5 * k, 1.58 * k, 1.75 * k], colorEnd: [0.35, 0.4, 0.5], alpha: 0.22 + 0.25 * along, kind: 0, fadeIn: 0.004,
            },
            true,
          );
        }
      }
    }
    this.tip.copy(tip);
    this.mid.copy(mid);
    this.tipLive = true;
  }
}

// ---------------------------------------------------------------- the props

const STEEL = new THREE.Color(0.62, 0.66, 0.7);
const BRASS = new THREE.Color(0.85, 0.6, 0.22);
const LEATHER = new THREE.Color(0.11, 0.065, 0.04);
const WALNUT = new THREE.Color(0.22, 0.11, 0.05);
const ASH = new THREE.Color(0.45, 0.3, 0.17);
const LACE = new THREE.Color(0.86, 0.83, 0.76);

/** The blade: single-edged, curved back toward the spine, a clipped point; edge on +Z. */
function bladeGeometry() {
  const N = 14;
  const L = 0.62;
  const pos: number[] = [];
  const ring: THREE.Vector3[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = 0.085 + t * L;
    const zc = -0.075 * t * t;
    // a broad cut-and-thrust blade narrowing to the point
    const tipK = smooth((t - 0.82) / 0.18);
    const w = lerp(0.034, 0.028, t) * (1 - tipK * 0.92);
    const th = lerp(0.0075, 0.004, t) * (1 - tipK * 0.8);
    // the clipped point: the edge sweeps up to meet the spine
    const ze = zc + w / 2;
    const zs = zc - w / 2 + tipK * w * 0.35;
    ring.push([new THREE.Vector3(0, y, ze), new THREE.Vector3(-th / 2, y, lerp(ze, zs, 0.6)), new THREE.Vector3(0, y, zs), new THREE.Vector3(th / 2, y, lerp(ze, zs, 0.6))]);
  }
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < 4; j++) {
      const a = ring[i][j];
      const b = ring[i][(j + 1) % 4];
      const c = ring[i + 1][(j + 1) % 4];
      const d = ring[i + 1][j];
      tri(a, b, c);
      tri(a, c, d);
    }
  }
  // the very point
  const last = ring[N];
  const pt = new THREE.Vector3(0, 0.085 + L + 0.012, last[0].z * 0.5 + last[2].z * 0.5);
  for (let j = 0; j < 4; j++) tri(last[j], last[(j + 1) % 4], pt);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** The cutlass in hand-local space: grip along +Y at the origin, blade above the guard. */
function cutlass(b: Builder) {
  b.add(bladeGeometry(), [0, 0, 0], STEEL, { b: 'iron', flat: true });
  // grip wrapped in leather with a twist of brass wire
  b.cyl(0.0145, 0.016, 0.12, [0, 0, 0], LEATHER, { seg: 10 });
  for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(0.0155, 0.0022, 4, 12), [0, -0.04 + i * 0.027, 0], BRASS, { rx: Math.PI / 2, b: 'gold' });
  // the shell guard, swept round into a knuckle bow on the edge side
  const shell = new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
  shell.scale(0.72, 0.42, 1);
  b.add(shell, [0, 0.056, 0.006], BRASS, { b: 'gold' });
  // (rz first: the arc runs from by the pommel, out round the knuckles, up to the guard)
  b.add(new THREE.TorusGeometry(0.068, 0.0055, 6, 18, Math.PI * 0.83), [0, 0.0, 0.004], BRASS, { rz: -1.4, ry: -Math.PI / 2, b: 'gold' });
  b.ball(0.019, [0, -0.072, 0], BRASS, { b: 'gold', s: [1, 0.85, 1] });
  b.cyl(0.024, 0.02, 0.012, [0, 0.07, 0], BRASS, { b: 'gold', seg: 12 });
}

/** A flintlock in hand-local space: barrel along +Y, its top toward +Z, the butt below and behind. */
function pistol(b: Builder) {
  b.cyl(0.0105, 0.0125, 0.26, [0, 0.13, 0], STEEL, { b: 'iron', seg: 10 });
  b.cyl(0.0145, 0.0145, 0.018, [0, 0.255, 0], BRASS, { b: 'gold', seg: 10 });
  b.cyl(0.013, 0.013, 0.014, [0, 0.03, 0], BRASS, { b: 'gold', seg: 10 });
  // the stock running under the barrel, and the lock on its flank
  b.box(0.024, 0.22, 0.02, [0, 0.09, -0.016], WALNUT, { r: 0.008 });
  b.box(0.008, 0.06, 0.026, [0.014, -0.005, -0.004], STEEL, { b: 'iron', r: 0.003 });
  b.box(0.006, 0.026, 0.008, [0.016, -0.03, 0.014], STEEL, { b: 'iron', rx: -0.5 });
  // the butt, swept down and back, capped in brass
  b.box(0.028, 0.115, 0.036, [0, -0.058, -0.052], WALNUT, { r: 0.012, rx: 0.62 });
  b.ball(0.024, [0, -0.1, -0.096], BRASS, { b: 'gold', s: [0.85, 1, 1.15] });
  b.add(new THREE.TorusGeometry(0.018, 0.0025, 4, 12, Math.PI), [0, 0.0, -0.03], BRASS, { ry: Math.PI / 2, rz: Math.PI, b: 'gold' });
}

/** A ship's spade: shaft along +Y, the D-grip near the eye, the iron blade far off along +Y. */
function spade(b: Builder) {
  b.cyl(0.016, 0.017, 1.0, [0, 0.05, 0], ASH, { seg: 9 });
  b.add(new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI), [0, -0.45, 0], ASH, { rz: Math.PI });
  b.cyl(0.012, 0.012, 0.09, [0, -0.495, 0], ASH, { rz: Math.PI / 2 });
  const blade = new THREE.BoxGeometry(0.2, 0.26, 0.012, 1, 3, 1);
  // a shallow dish, rounded at the cutting end
  const p = blade.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, p.getZ(i) + x * x * 0.9);
    if (y > 0.1) p.setX(i, x * 0.82);
  }
  b.add(blade, [0, 0.68, 0], STEEL, { b: 'iron', flat: true });
  b.cyl(0.02, 0.026, 0.1, [0, 0.52, 0], STEEL, { b: 'iron', seg: 9 });
}

/** A fist round a grip: 0 the cutlass, 1 the pistol's butt, 2 / 3 the spade's handle and shaft. */
function fist(b: Builder, skin: THREE.Color, at: 0 | 1 | 2 | 3) {
  const [x, y, z, rx] = at === 0 ? [0, -0.005, 0.004, 0] : at === 1 ? [0, -0.058, -0.052, 0.62] : at === 2 ? [0, -0.43, 0, 0] : [0, 0.02, 0, 0];
  const c = Math.cos(rx);
  const s = Math.sin(rx);
  // offsets across the fist, turned with it
  const o = (dx: number, dy: number, dz: number): [number, number, number] => [x + dx, y + dy * c - dz * s, z + dy * s + dz * c];
  b.box(0.074, 0.088, 0.07, o(0.004, 0, -0.012), skin, { r: 0.026, rx });
  // four knuckles wrapped over the grip, and the thumb
  for (let i = 0; i < 4; i++) b.ball(0.0155, o(-0.004, -0.031 + i * 0.021, 0.03), skin, { s: [1.55, 1, 1.05] });
  b.add(new THREE.CapsuleGeometry(0.0125, 0.045, 3, 8), o(-0.032, 0.022, 0.014), skin, { rx: rx - 0.5, rz: -0.25 });
}

/** A coat sleeve along +Y from the wrist: lace at the cuff, a turned-back cuff with its trim, then the sleeve. */
function sleeve(b: Builder, coat: THREE.Color, trim: THREE.Color) {
  const lace = new THREE.CylinderGeometry(0.048, 0.04, 0.035, 14, 1, true);
  // ruffled lace frothing out of the cuff
  const lp = lace.getAttribute('position');
  for (let i = 0; i < lp.count; i++) {
    const a = Math.atan2(lp.getZ(i), lp.getX(i));
    const k = 1 + 0.12 * Math.sin(a * 9) * (lp.getY(i) < 0 ? 1 : 0.3);
    lp.setX(i, lp.getX(i) * k);
    lp.setZ(i, lp.getZ(i) * k);
  }
  b.add(lace, [0, 0.01, 0], LACE);
  b.cyl(0.062, 0.058, 0.085, [0, 0.07, 0], coat, { seg: 16 });
  b.add(new THREE.TorusGeometry(0.06, 0.0055, 5, 18), [0, 0.03, 0], trim, { rx: Math.PI / 2, b: 'gold' });
  b.add(new THREE.TorusGeometry(0.063, 0.0045, 5, 18), [0, 0.112, 0], trim, { rx: Math.PI / 2, b: 'gold' });
  // three buttons on the cuff
  for (let i = 0; i < 3; i++) b.ball(0.007, [0, 0.05 + i * 0.022, 0.062], trim, { b: 'gold' });
  b.cyl(0.052, 0.068, 0.55, [0, 0.38, 0], coat, { seg: 14 });
}
