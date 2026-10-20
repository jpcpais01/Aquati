import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/noise';
import { CUT_END, CUT_HIT, CUT_WIND, RUN, WALK, Walker } from '../shore/walker';

// The captain's own eyes ashore. You look with the mouse (or a drag on the
// right of a touch screen) and walk where you look; the head rides the gait
// (a dip at each heel strike, a sway from foot to foot, a breath when still),
// the ground under it is smoothed so rocks and steps don't jolt, cuts and the
// pistol tug the view, a blow snaps it aside and a knock-down drops it to the
// sand. It only writes a pose: the rig swoops in and out of it.

/** Eye height over the feet for a walker of height 1 (m). */
const EYE = 1.64;
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class FootEye {
  /** Which way the captain looks, in walker terms: facing (sin yaw, cos yaw). */
  yaw = 0;
  pitch = -0.1;
  /** Seconds since the player last moved the view (soft assists wait for a still hand). */
  private idle = 9;
  private eyeY = NaN;
  private bob = 0;
  private run = 0;
  /** Strafe lean (rad), eased. */
  private lean = 0;
  /** View kicks: pitch, yaw, roll (rad) on a spring, and their velocities. */
  private kick = new Float32Array(3);
  private kickV = new Float32Array(3);
  /** A brief turn of the head toward something worth seeing (a chest, the hole, a foe). */
  private glanceAt = new THREE.Vector3();
  private glanceT = 0;
  private glanceRate = 0;
  private lastCut = -1;
  private lastFlinch = 0;
  /** 0..1 how far the run widens the view (the rig adds a few degrees of field). */
  get sprint() {
    return this.run;
  }

  /** Steps into the captain's boots, looking the way they face. */
  begin(w: Walker) {
    this.yaw = w.yaw;
    this.pitch = -0.1;
    this.eyeY = NaN;
    this.kick.fill(0);
    this.kickV.fill(0);
    this.glanceT = 0;
    this.idle = 9;
    this.lastCut = -1;
  }

  /** Mouse / drag look this frame (radians: + turns right, + looks down). */
  look(dx: number, dy: number) {
    if (Math.abs(dx) + Math.abs(dy) > 1e-4) {
      this.idle = 0;
      // the player's own hand always wins over a glance
      this.glanceT = Math.min(this.glanceT, 0.15);
    }
    this.yaw = angleDelta(0, this.yaw - dx);
    this.pitch = clamp(this.pitch - dy, -1.38, 1.3);
  }

  /** Screen-relative stride (x right, y ahead, each -1..1) as a world-space stride. */
  walk(x: number, y: number, out: { mx: number; mz: number }) {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    out.mx = s * y - c * x;
    out.mz = c * y + s * x;
  }

  /** The look direction on the ground, for aiming cuts and the pistol. */
  ahead(w: Walker, dist: number, out: { x: number; z: number }) {
    out.x = w.x + Math.sin(this.yaw) * dist;
    out.z = w.z + Math.cos(this.yaw) * dist;
    return out;
  }

  /**
   * Turns the head toward a point for `secs` (rate: how briskly). Waits for a
   * still mouse unless `force`, and lets go the moment the player looks away.
   */
  glance(at: THREE.Vector3, secs: number, rate = 3, force = false) {
    if (!force && this.idle < 0.7) return;
    this.glanceAt.copy(at);
    this.glanceT = secs;
    this.glanceRate = rate;
  }

  /** A jolt of the head (rad): pitch up, yaw left, roll. */
  jolt(p: number, y: number, r: number) {
    this.kickV[0] += p;
    this.kickV[1] += y;
    this.kickV[2] += r;
  }

  /** The pistol's kick. */
  recoil() {
    this.jolt(1.6, (Math.random() - 0.5) * 0.4, 0.3);
  }

  /** World-space eye and orientation this frame, from the walker as posed. */
  pose(dt: number, w: Walker, time: number, digAt: THREE.Vector3 | null, pos: THREE.Vector3, quat: THREE.Quaternion) {
    this.idle += dt;
    const h = w.height;
    // the ground under the eye, smoothed over steps and stones (a big drop snaps)
    const want = w.y + EYE * h;
    if (Number.isNaN(this.eyeY) || Math.abs(want - this.eyeY) > 0.8) this.eyeY = want;
    this.eyeY += (want - this.eyeY) * damp(want > this.eyeY ? 18 : 11, dt);

    // the gait: a dip at each heel strike, a sway from foot to foot
    const sp = Math.hypot(w.vx, w.vz);
    const walkK = clamp(w.stride / WALK, 0, 1);
    this.run += ((sp > WALK + 0.4 ? 1 : 0) - this.run) * damp(3, dt);
    this.bob += (walkK - this.bob) * damp(6, dt);
    const ph = w.phase;
    const amp = lerp(0.032, 0.058, this.run) * this.bob;
    const dip = Math.abs(Math.sin(ph)) - 0.64;
    let y = this.eyeY + dip * amp;
    // a breath when standing still
    y += Math.sin(time * 1.25) * 0.007 * (1 - this.bob);
    const sway = Math.sin(ph) * lerp(0.022, 0.035, this.run) * this.bob;
    const roll = Math.sin(ph) * lerp(0.007, 0.014, this.run) * this.bob;
    const nod = (Math.abs(Math.cos(ph)) - 0.5) * 0.012 * this.bob;

    // leaning into a sidestep
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const side = (-w.vx * c + w.vz * s) / RUN;
    this.lean += (side * 0.035 - this.lean) * damp(5, dt);

    // a cut tugs the head along with the blade; the lunge pushes it forward
    let push = 0;
    if (w.cutting) {
      const t = w.cutT;
      const ct = w.cut;
      if (this.lastCut < 0) {
        // the wind-up draws the view back the way the blade comes from
        this.jolt(ct === 0 ? 0.35 : 0.1, ct === 1 ? 0.45 : ct === 0 ? -0.2 : 0, ct === 0 ? -0.25 : 0.15);
      }
      if (this.lastCut < CUT_WIND[ct] && t >= CUT_WIND[ct]) this.jolt(ct === 0 ? -1.1 : -0.35, ct === 1 ? -1.1 : ct === 0 ? 0.35 : 0, ct === 0 ? 0.5 : ct === 1 ? -0.45 : 0);
      if (ct === 2) push = Math.sin(clamp((t - CUT_WIND[2]) / (CUT_END[2] - CUT_WIND[2]), 0, 1) * Math.PI) * 0.22;
      else if (t > CUT_WIND[ct] && t < CUT_HIT[ct] + 0.1) push = 0.05;
      this.lastCut = t;
    } else this.lastCut = -1;
    // a blow: the head snaps aside
    if (w.flinch > this.lastFlinch + 0.05) this.jolt(0.9, (Math.random() - 0.5) * 1.6, (Math.random() < 0.5 ? -1 : 1) * 1.1);
    this.lastFlinch = w.flinch;
    // the kick spring: snappy, barely overshooting
    for (let i = 0; i < 3; i++) {
      const a = -this.kick[i] * 260 - this.kickV[i] * 24;
      this.kickV[i] += a * Math.min(dt, 0.05);
      this.kick[i] += this.kickV[i] * Math.min(dt, 0.05);
    }

    // a glance toward the dig, a chest, a foe locked onto
    if (digAt && w.digging) {
      if (this.idle > 0.7) this.glance(digAt, 0.3, 2.6);
    }
    if (this.glanceT > 0) {
      this.glanceT -= dt;
      const dx = this.glanceAt.x - w.x;
      const dz = this.glanceAt.z - w.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        const k = damp(this.glanceRate, dt);
        this.yaw += angleDelta(this.yaw, Math.atan2(dx, dz)) * k;
        const pw = clamp(Math.atan2(this.glanceAt.y - this.eyeY, d), -1.2, 0.6);
        this.pitch += (pw - this.pitch) * k;
      }
    }

    // knocked down: the world tips over and the sky fills the view
    const f = w.fall;
    const fe = f * f * (3 - 2 * f);
    y = lerp(y, w.y + 0.32, fe);

    pos.set(w.x - c * sway + s * push, y, w.z + s * sway + c * push);
    _e.set(this.pitch + nod + this.kick[0] + fe * 0.75, this.yaw + Math.PI + this.kick[1], roll + this.lean + this.kick[2] + fe * 1.15);
    return quat.setFromEuler(_e);
  }
}
