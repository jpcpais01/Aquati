import * as THREE from 'three';
import { clamp, damp } from '../core/noise';

// Photo mode's free camera. One pose drives both modes: a pivot, a heading
// (yaw), a pitch and a distance, with the camera `dist` metres back from the
// pivot along its view. Orbit swings the camera round the pivot; fly turns the
// view about the camera itself and drags the pivot along in front of it, so
// switching between them never jumps. Every control moves the wanted pose and
// the camera eases after it, which reads as a steady, weighted dolly.

export type PhotoCamMode = 'orbit' | 'fly';

const PITCH_MIN = -1.5;
const PITCH_MAX = 1.25;
const DIST_MIN = 3;
const DIST_MAX = 520;
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _h = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export interface PhotoPose {
  pivot: THREE.Vector3;
  yaw: number;
  pitch: number;
  dist: number;
}

export class PhotoCamera {
  mode: PhotoCamMode = 'orbit';
  /** Wanted pose. */
  readonly pivot = new THREE.Vector3();
  yaw = 0;
  pitch = -0.9;
  dist = 80;
  fov = 40;
  roll = 0;
  /** Eased pose the camera actually shows. */
  private sp = new THREE.Vector3();
  private sYaw = 0;
  private sPitch = 0;
  private sDist = 80;
  private sFov = 40;
  private sRoll = 0;
  private home: PhotoPose | null = null;
  homeFov = 40;
  /** The camera may roam this far from the anchor (the player's ship). */
  readonly anchor = new THREE.Vector3();
  range = 900;
  /** Height of whatever the camera must stay above at (x, z): island or sea. */
  ground: (x: number, z: number) => number = () => 0;

  /** View direction for a heading and pitch (camera looks down -z, Euler YXZ). */
  static forward(yaw: number, pitch: number, out: THREE.Vector3) {
    const c = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
  }

  /** Takes over from wherever the game camera is now, aiming at the sea (or ship) it looks at. */
  begin(cam: THREE.PerspectiveCamera, pivotY: number) {
    const d = cam.getWorldDirection(_f);
    this.pitch = clamp(Math.asin(clamp(d.y, -1, 1)), PITCH_MIN, PITCH_MAX);
    this.yaw = Math.atan2(-d.x, -d.z);
    // the pivot lands where the view meets the sea, or a little way ahead
    const dist = d.y < -0.08 ? (cam.position.y - pivotY) / -d.y : 40;
    this.dist = clamp(dist, DIST_MIN, DIST_MAX);
    this.pivot.copy(cam.position).addScaledVector(d, this.dist);
    this.fov = this.homeFov = clamp(cam.fov, 15, 100);
    this.roll = 0;
    this.home = { pivot: this.pivot.clone(), yaw: this.yaw, pitch: this.pitch, dist: this.dist };
    this.snap();
  }

  /** Back to the shot photo mode opened on. */
  reset() {
    const h = this.home;
    if (!h) return;
    this.pivot.copy(h.pivot);
    this.yaw = h.yaw;
    this.pitch = h.pitch;
    this.dist = h.dist;
    this.fov = this.homeFov;
    this.roll = 0;
  }

  private snap() {
    this.sp.copy(this.pivot);
    this.sYaw = this.yaw;
    this.sPitch = this.pitch;
    this.sDist = this.dist;
    this.sFov = this.fov;
    this.sRoll = this.roll;
  }

  /** Where the camera stands for the wanted pose. */
  private eye(out: THREE.Vector3) {
    return out.copy(this.pivot).addScaledVector(PhotoCamera.forward(this.yaw, this.pitch, _f), -this.dist);
  }

  /** A drag of (dx, dy) pixels: orbit round the pivot, or turn the head in flight. */
  rotate(dx: number, dy: number) {
    const k = 0.0052 * clamp(this.fov / 45, 0.35, 1.4);
    if (this.mode === 'fly') {
      const eye = this.eye(_p);
      this.yaw -= dx * k;
      this.pitch = clamp(this.pitch - dy * k, PITCH_MIN, PITCH_MAX);
      this.pivot.copy(eye).addScaledVector(PhotoCamera.forward(this.yaw, this.pitch, _f), this.dist);
    } else {
      this.yaw -= dx * k;
      this.pitch = clamp(this.pitch - dy * k, PITCH_MIN, PITCH_MAX);
    }
  }

  /** Slides the scene under a finger: (dx, dy) pixels on a screen `h` pixels tall. */
  pan(dx: number, dy: number, h: number) {
    const m = (this.dist * 2 * Math.tan(THREE.MathUtils.degToRad(this.fov * 0.5))) / Math.max(1, h);
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _h.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    // looking straight down a drag maps onto the sea; looking out it lifts the view
    const down = clamp(-Math.sin(this.pitch), 0, 1);
    this.pivot.addScaledVector(_r, -dx * m);
    this.pivot.addScaledVector(_h, dy * m * down);
    this.pivot.y += dy * m * (1 - down);
  }

  /** Wheel or pinch: >1 pulls back. Orbit changes the distance, flight dollies along the view. */
  zoom(f: number) {
    if (this.mode === 'orbit') {
      this.dist = clamp(this.dist * f, DIST_MIN, DIST_MAX);
      return;
    }
    const step = Math.max(4, this.dist * 0.6) * Math.log(f);
    this.pivot.addScaledVector(PhotoCamera.forward(this.yaw, this.pitch, _f), -step);
  }

  /** Keys: x strafe, y rise, z forward, each -1..1; `fast` triples the pace. */
  move(dt: number, x: number, y: number, z: number, fast: boolean) {
    if (!x && !y && !z) return;
    const v = clamp(this.dist * 0.9, 8, 220) * (fast ? 3 : 1) * dt;
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (this.mode === 'fly') PhotoCamera.forward(this.yaw, this.pitch, _h);
    else _h.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.pivot.addScaledVector(_r, x * v).addScaledVector(_h, z * v);
    this.pivot.y += y * v;
  }

  /** Keeps the wanted pose above the sea and islands and within reach of the ship. */
  private constrain() {
    const a = this.anchor;
    const dx = this.pivot.x - a.x;
    const dz = this.pivot.z - a.z;
    const r = Math.hypot(dx, dz);
    if (r > this.range) {
      this.pivot.x = a.x + (dx / r) * this.range;
      this.pivot.z = a.z + (dz / r) * this.range;
    }
    this.pivot.y = clamp(this.pivot.y, -6, 600);
    const eye = this.eye(_p);
    const floor = this.ground(eye.x, eye.z);
    if (eye.y >= floor) return;
    if (this.mode === 'orbit') {
      // slide down the dome until the lens skims the surface
      const s = clamp((this.pivot.y - floor) / this.dist, -1, 1);
      this.pitch = clamp(Math.min(this.pitch, Math.asin(s)), PITCH_MIN, PITCH_MAX);
      const e2 = this.eye(_p);
      const f2 = this.ground(e2.x, e2.z);
      if (e2.y < f2) this.pivot.y += f2 - e2.y;
    } else {
      this.pivot.y += floor - eye.y;
    }
  }

  /** Eases the shown pose toward the wanted one and places the camera. */
  update(dt: number, cam: THREE.PerspectiveCamera) {
    this.constrain();
    const k = damp(9, dt);
    this.sp.lerp(this.pivot, k);
    this.sYaw += (this.yaw - this.sYaw) * k;
    this.sPitch += (this.pitch - this.sPitch) * k;
    this.sDist += (this.dist - this.sDist) * k;
    this.sFov += (this.fov - this.sFov) * damp(12, dt);
    this.sRoll += (this.roll - this.sRoll) * damp(12, dt);
    const f = PhotoCamera.forward(this.sYaw, this.sPitch, _f);
    cam.position.copy(this.sp).addScaledVector(f, -this.sDist);
    // the eased path can cut a corner through a wave crest: never show the inside
    const floor = this.ground(cam.position.x, cam.position.z);
    if (cam.position.y < floor) cam.position.y = floor;
    _e.set(this.sPitch, this.sYaw, THREE.MathUtils.degToRad(this.sRoll), 'YXZ');
    cam.quaternion.setFromEuler(_e);
    cam.fov = this.sFov;
    cam.near = clamp((cam.position.y - floor) * 0.05, 0.1, 6);
    cam.far = 3600;
    if (cam.view) cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** The eased pivot, which the world centres its shadows, sea and crowds on. */
  get focusPoint() {
    return this.sp;
  }

  get shownDist() {
    return this.sDist;
  }
}
