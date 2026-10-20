import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/noise';
import { patchMaterial } from '../render/environment';
import type { World } from '../game/world';
import type { Ship } from '../ships/ship';

// Dolphins of the high seas. Now and then out on the open ocean a pod comes
// racing in from the blue, falls in alongside and rides your bow wave: a
// handful of bottlenose dolphins swimming a metre under the surface, beating
// their flukes up and down, and porpoising: one after another they leap clear
// in long arcs, spray streaming off them, and slip back in nose first with a
// soft splash. They whistle and click to each other while they're with you.
// After a minute or so they peel away, dive and are gone.
//
// One instanced draw (built at load, so the warm-up compiles it); the stroke
// of the flukes runs in the vertex shader, the arcs and the pod on the CPU.

const TAU = Math.PI * 2;
/** Most dolphins in the sea at once (one pod). */
const CAP = 9;
/** Body length (m). */
const LEN = 2.6;

// ---------------------------------------------------------------- sculpt

/**
 * A bottlenose dolphin one unit long, beak at +z, flukes at -z: a lofted body
 * (a short beak, a rounded melon, a deep chest tapering to a slim tail stock),
 * a hooked dorsal fin, flippers and broad flukes, painted dark grey above and
 * pale beneath with vertex colours. aPart: 0 body, 1 flukes, 2 flipper, 3 dorsal.
 */
function dolphinGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  const back = new THREE.Color(0x3b4651).convertSRGBToLinear();
  const flank = new THREE.Color(0x7d8994).convertSRGBToLinear();
  const belly = new THREE.Color(0xe9e6e0).convertSRGBToLinear();
  const tmp = new THREE.Color();
  const paint = (y: number, z: number, h: number) => {
    // countershading: the dark cape sweeps down behind the dorsal, the belly is pale
    const u = y / Math.max(h, 1e-3);
    const cape = 0.25 + 0.25 * Math.sin((z + 0.1) * 6);
    if (u > cape) tmp.copy(back);
    else if (u > -0.35) tmp.copy(flank).lerp(back, clamp((u + 0.35) / (cape + 0.35), 0, 1) * 0.5);
    else tmp.copy(belly).lerp(flank, clamp((u + 0.6) / 0.25, 0, 1));
    return tmp;
  };
  const vtx = (x: number, y: number, z: number, p: number, c: THREE.Color) => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
    part.push(p);
    return part.length - 1;
  };
  // z, half-width, half-height, centre y
  const rings: number[][] = [
    [0.47, 0.016, 0.016, -0.01],
    [0.43, 0.03, 0.03, -0.012],
    [0.39, 0.052, 0.06, 0.004],
    [0.33, 0.076, 0.088, 0.016],
    [0.22, 0.094, 0.11, 0.02],
    [0.08, 0.1, 0.118, 0.016],
    [-0.06, 0.088, 0.104, 0.01],
    [-0.2, 0.06, 0.078, 0.006],
    [-0.32, 0.03, 0.05, 0.004],
    [-0.4, 0.016, 0.032, 0.002],
  ];
  const sides = 12;
  const ids: number[][] = [];
  for (const [z, w, h, yc] of rings) {
    const ring: number[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * TAU;
      const y = Math.cos(a) * h;
      ring.push(vtx(Math.sin(a) * w, yc + y, z, 0, paint(y, z, h)));
    }
    ids.push(ring);
  }
  const nose = vtx(0, -0.01, 0.5, 0, paint(0, 0.5, 0.02));
  const tail = vtx(0, 0.002, -0.43, 0, back);
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    idx.push(nose, ids[0][k1], ids[0][k]);
    for (let r = 0; r + 1 < ids.length; r++) {
      const a = ids[r][k], c = ids[r][k1], d = ids[r + 1][k], e = ids[r + 1][k1];
      idx.push(a, c, d, c, e, d);
    }
    const L = ids[ids.length - 1];
    idx.push(tail, L[k], L[k1]);
  }
  // a fin both ways round (offset a hair along `n`), so each face lights on its own
  const fin = (pts: number[][], tris: number[][], p: number, c: THREE.Color, n: [number, number, number]) => {
    const off = 0.004;
    for (const s of [1, -1]) {
      const v = pts.map((q) => vtx(q[0] + n[0] * off * s, q[1] + n[1] * off * s, q[2] + n[2] * off * s, p, c));
      for (const t of tris) {
        if (s > 0) idx.push(v[t[0]], v[t[1]], v[t[2]]);
        else idx.push(v[t[0]], v[t[2]], v[t[1]]);
      }
    }
  };
  // the dorsal: a tall hook swept back
  fin([[0, 0.1, 0.1], [0, 0.11, -0.06], [0, 0.2, -0.02], [0, 0.245, -0.09], [0, 0.17, -0.06]], [[0, 2, 1], [2, 4, 1], [2, 3, 4]], 3, back, [1, 0, 0]);
  // flukes: broad, swept-back tips and a notch in the middle
  const fl = [[0, 0.002, -0.37], [0.05, 0.002, -0.4], [0.17, 0.002, -0.5], [0.12, 0.002, -0.52], [0, 0.002, -0.47]];
  const flukes = [...fl, ...fl.slice(1).map((q) => [-q[0], q[1], q[2]])];
  fin(flukes, [[0, 1, 4], [1, 2, 3], [1, 3, 4], [0, 8, 5], [5, 7, 6], [5, 8, 7]], 1, back, [0, 1, 0]);
  // flippers, angled down and out
  for (const s of [1, -1]) {
    fin([[s * 0.085, -0.05, 0.2], [s * 0.08, -0.06, 0.14], [s * 0.2, -0.12, 0.08]], [[0, 2, 1]], 2, flank, [0, 1, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- shader

const STROKE_GLSL = /* glsl */ `
attribute float aPart;
attribute vec3 aStroke; // fluke phase, stroke amplitude, arch of the whole body along its path
// The tail beats up and down in a wave running back from the chest, swelling
// toward the flukes; the head nods a little against each beat; the whole body
// bends along the arc it is swimming (over the crest of a leap, down a dive).
void dolphinStroke(inout vec3 p, inout vec3 n) {
  float t = clamp((0.08 - p.z) / 0.52, 0.0, 1.0);
  float w = t * t * (0.35 + 0.65 * t);
  float wave = aStroke.x + p.z * 4.2;
  float head = smoothstep(0.12, 0.5, p.z) * 0.12;
  p.y += aStroke.y * (w * sin(wave) - head * sin(aStroke.x + 0.6));
  float slope = aStroke.y * ((-1.0 / 0.52) * (0.7 * t + 1.95 * t * t) * sin(wave) + w * 4.2 * cos(wave));
  // the flukes feather: pitched against the stroke, lagging it a quarter beat
  if (aPart > 0.5 && aPart < 1.5) {
    float f = cos(aStroke.x - 0.45) * aStroke.y * 3.2;
    p.y += (p.z + 0.4) * f;
    slope += f;
  }
  p.y += aStroke.z * (p.z * p.z * 4.0 - 0.12);
  slope += aStroke.z * p.z * 8.0;
  n = normalize(vec3(n.x, n.y, n.z - n.y * slope));
  // flippers scull a little
  if (aPart > 1.5 && aPart < 2.5) p.y += sin(aStroke.x * 0.5) * 0.015 * abs(p.x) * 6.0;
}
`;

function strokeShader(shader: { vertexShader: string }) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${STROKE_GLSL}`)
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normal;\n  vec3 dolP = position;\n  dolphinStroke(dolP, objectNormal);')
    .replace('#include <begin_vertex>', 'vec3 transformed = dolP;');
}

// ---------------------------------------------------------------- swimmers

/**
 * What she's doing: cruising at depth, coming up for a breath (a slow roll of
 * the back and dorsal through the surface), climbing for a leap, or in the air.
 */
type Act = 'swim' | 'breathe' | 'rise' | 'air';

interface Dolphin {
  /** Slot beside the ship (ship frame: s across, f along). */
  s: number;
  f: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Turning rate (rad/s), eased: she sweeps round rather than snapping to a heading. */
  yawRate: number;
  /** Nose up (+) or down; underwater she swims where she points. */
  pitch: number;
  pitchRate: number;
  roll: number;
  /** Vertical speed in the air (m/s). */
  vy: number;
  speed: number;
  phase: number;
  /** Stroke amplitude and body arch, eased. */
  amp: number;
  bend: number;
  act: Act;
  /** Seconds until she next comes up to breathe, and until she next leaps. */
  breathT: number;
  leapT: number;
  /** Swim depth she settles to (m below the surface). */
  depth: number;
  size: number;
  wobble: number;
  /** Now and then she rolls onto her side to look up at the ship. */
  look: number;
  lookT: number;
}

type PodState = 'in' | 'with' | 'out';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Dolphins {
  readonly mesh: THREE.InstancedMesh;
  private stroke: THREE.InstancedBufferAttribute;
  private pod: Dolphin[] = [];
  private state: PodState = 'in';
  private t = 0;
  private stay = 60;
  private side: 1 | -1 = 1;
  private chatT = 2;
  /** Called with a splash (where, how big) and a call (where, whistle or clicks). */
  onSplash: (at: THREE.Vector3, size: number) => void = () => {};
  onCall: (at: THREE.Vector3, whistle: boolean) => void = () => {};
  /** Called as one breathes at the surface: a puff of spray from the blowhole. */
  onBlow: (at: THREE.Vector3) => void = () => {};

  constructor() {
    const geo = dolphinGeometry();
    this.stroke = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    this.stroke.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aStroke', this.stroke);
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0, envMapIntensity: 1.1 }), { caustics: true, clouds: true });
    const base = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      base.call(mat, shader, r);
      strokeShader(shader);
    };
    const prevKey = mat.customProgramCacheKey;
    mat.customProgramCacheKey = () => prevKey.call(mat) + '|dolphin';
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.name = 'dolphins';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** Whether a pod is with you (or on its way in or out). */
  get active() {
    return this.pod.length > 0;
  }

  /** Whether they've come alongside. */
  get alongside() {
    return this.state === 'with';
  }

  /** A pod comes racing in from the blue to `ship`'s side. */
  summon(ship: Ship) {
    if (this.pod.length) return;
    const n = 4 + Math.floor(Math.random() * 4);
    this.side = Math.random() < 0.5 ? 1 : -1;
    const h = ship.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    // they come in from off the bow quarter, well out
    const ax = ship.pos.x + fx * 90 + fz * this.side * 70;
    const az = ship.pos.z + fz * 90 - fx * this.side * 70;
    const L = ship.cls.length;
    for (let i = 0; i < n; i++) {
      // bow riders up front, the rest strung along her side in the bow wave
      const bow = i < 2;
      const s = bow ? (i === 0 ? -1.6 : 1.8) : this.side * (ship.cls.beam * 0.5 + 4 + (i % 3) * 3.2 + Math.random() * 1.5);
      const f = bow ? L * 0.5 + 3 + Math.random() * 2 : L * (0.3 - (i - 2) * 0.16) + Math.random() * 3;
      this.pod.push({
        s, f, x: ax + (Math.random() - 0.5) * 16, y: -1.5, z: az + (Math.random() - 0.5) * 16, yaw: h + Math.PI * 0.8 * -this.side, yawRate: 0, pitch: 0, pitchRate: 0, roll: 0, vy: 0,
        speed: 9, phase: Math.random() * TAU, amp: 0.05, bend: 0, act: 'swim', breathT: 1 + Math.random() * 6, leapT: 2 + Math.random() * 6,
        depth: 0.8 + Math.random() * 0.7, size: 0.85 + Math.random() * 0.3, wobble: Math.random() * TAU, look: 0, lookT: 6 + Math.random() * 20,
      });
    }
    this.state = 'in';
    this.t = 0;
    this.stay = 50 + Math.random() * 40;
  }

  /** Off they go, now (the high seas left behind, a fight, the voyage over). */
  dismiss() {
    if (this.pod.length && this.state !== 'out') {
      this.state = 'out';
      this.t = 0;
    }
  }

  /** One drawn just under the sea at `at` for the loading screen's warm-up (cleared after). */
  warm(at: THREE.Vector3) {
    this.mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(at.x, -1.2, at.z));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = 1;
  }

  /** Gone at once (a fresh voyage). */
  clear() {
    this.pod.length = 0;
    this.mesh.count = 0;
  }

  update(dt: number, w: World, ship: Ship | null) {
    if (!this.pod.length || dt <= 0) {
      if (!this.pod.length) this.mesh.count = 0;
      return;
    }
    dt = Math.min(dt, 0.05);
    if (!ship || !ship.alive) this.dismiss();
    this.t += dt;
    if (this.state === 'in' && this.t > 9) this.state = 'with';
    if (this.state === 'with' && this.t > this.stay) this.dismiss();
    const h = ship ? ship.heading : 0;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const shipSpeed = ship ? Math.max(0, ship.speed) : 0;
    const out = this.state === 'out' || !ship;
    const arr = this.stroke.array as Float32Array;
    let n = 0;
    for (let i = this.pod.length - 1; i >= 0; i--) {
      const d = this.pod[i];
      const wh = w.waterHeight(d.x, d.z);
      // where she wants to be: her slot beside the ship, a little ahead of it at speed; or away
      let tx: number;
      let tz: number;
      let want: number;
      if (out) {
        // peel off to her side and dive away into the blue
        const away = d.s >= 0 ? 1 : -1;
        tx = d.x + (fz * away * 0.8 + fx * 0.6) * 40;
        tz = d.z + (-fx * away * 0.8 + fz * 0.6) * 40;
        want = 10;
        d.depth = Math.min(5, d.depth + dt * 0.4);
      } else {
        d.wobble += dt * (0.35 + i * 0.05);
        const slack = shipSpeed < 1.5 ? 6 : 0;
        // a slow ship gets circled; a fast one gets raced (each drifts about her slot on her own slow beat)
        const sw = d.s + Math.sin(d.wobble) * (1.2 + slack) + Math.sin(d.wobble * 2.3 + i) * 0.5;
        const fw = d.f + Math.cos(d.wobble * 0.7) * (2 + slack) + shipSpeed * 0.25;
        tx = ship.pos.x + fz * sw + fx * fw;
        tz = ship.pos.z - fx * sw + fz * fw;
        // and they keep a body's width from each other
        for (const o of this.pod) {
          if (o === d) continue;
          const ox = d.x - o.x;
          const oz = d.z - o.z;
          const dd = Math.hypot(ox, oz);
          if (dd < 2.6 && dd > 1e-3) {
            tx += (ox / dd) * (2.6 - dd) * 1.5;
            tz += (oz / dd) * (2.6 - dd) * 1.5;
          }
        }
        const gap = Math.hypot(tx - d.x, tz - d.z);
        want = Math.max(4.5, shipSpeed) + clamp(gap * 0.3, -2.5, 7);
      }

      // ------------------------------------------------ steering: sweep round, banking into the turn
      if (d.act !== 'air') {
        const toYaw = Math.atan2(tx - d.x, tz - d.z);
        const wantRate = clamp(angleDelta(d.yaw, toYaw) * 1.4, -1.1, 1.1);
        d.yawRate += (wantRate - d.yawRate) * damp(2.5, dt);
        d.speed = lerp(d.speed, want + (d.act === 'rise' ? 2.5 : 0), damp(d.act === 'rise' ? 2 : 0.8, dt));
      }
      d.yaw += d.yawRate * dt;
      d.lookT -= dt;
      if (d.lookT <= 0) {
        // a roll onto her side to eye the ship (toward it), then back
        d.lookT = d.look ? 8 + Math.random() * 20 : 2 + Math.random() * 2.5;
        d.look = d.look || out ? 0 : (d.s >= 0 ? -1 : 1) * (0.7 + Math.random() * 0.5);
      }
      const bank = clamp(-d.yawRate * d.speed * 0.09, -0.75, 0.75) + (d.act === 'swim' ? d.look : 0);
      d.roll += (bank - d.roll) * damp(d.act === 'air' ? 1 : 3, dt);

      // ------------------------------------------------ up and down: she swims where she points
      d.breathT -= dt;
      d.leapT -= dt * (want > 11 ? 1.8 : 1);
      let wantPitch = 0;
      if (d.act === 'swim') {
        // cruising depth, with a lazy rise and fall
        const target = wh - d.depth - Math.sin(d.wobble * 1.7) * 0.25;
        wantPitch = clamp((target - d.y) * 0.32, -0.4, 0.3);
        if (!out && d.leapT <= 0 && d.speed > 4.5 && shipSpeed > 1.5) {
          d.act = 'rise';
          // a friend often goes with her
          for (const o of this.pod) if (o !== d && o.act === 'swim' && o.leapT < 2.5 && Math.hypot(o.x - d.x, o.z - d.z) < 6) o.leapT = Math.min(o.leapT, 0.12 + Math.random() * 0.25);
        } else if (d.breathT <= 0 && !out) d.act = 'breathe';
      }
      if (d.act === 'breathe') {
        // up until the crown of her back breaks the surface, then she rolls over and down
        wantPitch = clamp((wh + 0.05 - d.y) * 0.5, 0.06, 0.32);
        if (d.y > wh - 0.22) {
          d.act = 'swim';
          d.breathT = 3 + Math.random() * 6;
          d.pitchRate = Math.min(d.pitchRate, -0.15);
          this.onBlow(_p.set(d.x + Math.sin(d.yaw) * LEN * d.size * 0.28, wh + 0.15, d.z + Math.cos(d.yaw) * LEN * d.size * 0.28));
        }
      } else if (d.act === 'rise') {
        // a steepening climb from below, flukes driving hard
        wantPitch = 0.62;
        if (d.y > wh - 0.15 && d.pitch > 0.25) {
          d.act = 'air';
          const hs = d.speed * Math.cos(d.pitch);
          // a long, low arc: porpoising, not a show jump
          d.vy = clamp(d.speed * Math.sin(d.pitch) * 0.75, 3.4, 5.8);
          d.speed = hs;
          d.leapT = 5 + Math.random() * 10;
          d.breathT = 4 + Math.random() * 5;
          this.onSplash(_p.set(d.x, wh, d.z), 0.55 * d.size);
        }
      }
      const prevPitch = d.pitch;
      if (d.act === 'air') {
        // a ballistic arc, the body lying along it: nose up out of the water, nose first back in
        d.vy -= 9.81 * dt;
        d.y += d.vy * dt;
        d.pitch = Math.atan2(d.vy, d.speed);
        d.x += Math.sin(d.yaw) * d.speed * dt;
        d.z += Math.cos(d.yaw) * d.speed * dt;
        if (d.y < wh - 0.1 && d.vy < 0) {
          d.act = 'swim';
          // she carries her dive on under the surface and pulls out of it
          d.speed = Math.hypot(d.speed, d.vy) * 0.85;
          d.pitchRate = 0;
          this.onSplash(_p.set(d.x, wh, d.z), 0.95 * d.size);
        }
      } else {
        // pitch eases toward what she wants, never faster than a dolphin can arch
        const wantRate = clamp((wantPitch - d.pitch) * 2.4, -1.3, 1.3);
        d.pitchRate += (wantRate - d.pitchRate) * damp(4, dt);
        d.pitch = clamp(d.pitch + d.pitchRate * dt, -1.2, 1.0);
        const c = Math.cos(d.pitch);
        d.x += Math.sin(d.yaw) * d.speed * c * dt;
        d.z += Math.cos(d.yaw) * d.speed * c * dt;
        d.y += Math.sin(d.pitch) * d.speed * dt;
        // never more than her back above the water when not leaping
        if (d.act !== 'rise') d.y = Math.min(d.y, wh - 0.12);
      }

      // ------------------------------------------------ the stroke: harder climbing, a glide in the bow wave or the air
      const bowRide = !out && d.f > (ship?.cls.length ?? 0) * 0.4 && shipSpeed > 4 && d.act === 'swim';
      const thrust = d.act === 'air' ? 0.006 : d.act === 'rise' ? 0.085 : bowRide ? 0.022 : 0.032 + Math.min(0.03, d.speed * 0.0028) + Math.max(0, d.pitch) * 0.04;
      d.amp += (thrust - d.amp) * damp(d.act === 'air' ? 6 : 2.5, dt);
      // about a body length and a bit per beat
      d.phase += TAU * Math.max(0.7, d.speed / (1.2 * LEN * d.size)) * dt * (d.act === 'air' ? 0.3 : 1);
      const curve = (d.pitch - prevPitch) / dt / Math.max(d.speed, 2);
      d.bend += (clamp(curve * 0.9, -0.09, 0.09) - d.bend) * damp(6, dt);

      // gone over the horizon (or deep): done with
      if (this.state === 'out' && (this.t > 16 || (ship && Math.hypot(d.x - ship.pos.x, d.z - ship.pos.z) > 160))) {
        this.pod.splice(i, 1);
        continue;
      }
      const L = LEN * d.size;
      _e.set(-d.pitch, d.yaw, d.roll, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(d.x, d.y, d.z), _q, _s.set(L, L, L));
      _m.toArray(this.mesh.instanceMatrix.array, n * 16);
      arr[n * 3] = d.phase;
      arr[n * 3 + 1] = d.amp;
      arr[n * 3 + 2] = d.bend;
      n++;
    }
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.stroke.clearUpdateRanges();
      this.stroke.addUpdateRange(0, n * 3);
      this.stroke.needsUpdate = true;
    }
    // a whistle here, a burst of clicks there, while they're with you
    this.chatT -= dt;
    if (this.chatT <= 0 && this.pod.length && this.state !== 'out') {
      this.chatT = 1.5 + Math.random() * 4.5;
      const d = this.pod[(Math.random() * this.pod.length) | 0];
      this.onCall(_p.set(d.x, d.y, d.z), Math.random() < 0.6);
    }
  }
}
