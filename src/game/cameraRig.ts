import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/noise';

// Near-top-down follow camera with a gentle diorama tilt that steepens as you
// zoom out, a velocity look-ahead, trauma-based shake, and a cinematic orbit
// for the menu.

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  private focus = new THREE.Vector3();
  zoom = 0.45; // 0 close .. 1 far
  private zoomSmooth = 0.45;
  private trauma = 0;
  mode: 'follow' | 'orbit' = 'orbit';
  private orbitAngle = 0.6;
  private blend = 0; // 0 orbit .. 1 follow
  orbitCenter = new THREE.Vector3();
  /** Bounds of the menu ship relative to orbitCenter (world axes); the orbit camera fits them snugly in view. */
  orbitBox = new THREE.Box3(new THREE.Vector3(-4, -2, -12), new THREE.Vector3(4, 20, 12));
  /** The menu ship's orientation, so its own-frame bounds can be turned into the world. */
  orbitQuat = new THREE.Quaternion();
  private orbitDist = 0;
  /** Menu framing: where the orbited ship sits (fraction of the screen from centre) and how much of the screen is free for it. */
  menuShift = { x: 0, y: 0, w: 1, h: 1 };
  private shift = { x: 0, y: 0 };

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(34, aspect, 2, 2600);
  }

  get distance() {
    return lerp(70, 300, this.zoomSmooth * this.zoomSmooth * 0.6 + this.zoomSmooth * 0.4);
  }

  shake(a: number) {
    this.trauma = Math.min(1.2, this.trauma + a);
  }

  snapTo(p: THREE.Vector3) {
    this.focus.copy(p);
    this.target.copy(p);
  }

  update(dt: number, follow: THREE.Vector3, vel: THREE.Vector3, time: number) {
    this.zoomSmooth += (this.zoom - this.zoomSmooth) * damp(5, dt);
    this.blend += ((this.mode === 'follow' ? 1 : 0) - this.blend) * damp(this.mode === 'follow' ? 1.4 : 3, dt);
    const look = new THREE.Vector3(vel.x, 0, vel.z).multiplyScalar(lerp(1.4, 3, this.zoomSmooth));
    this.focus.lerp(follow.clone().add(look), damp(2.2, dt));
    this.target.copy(this.focus);

    // follow pose: camera due south of the focus looking north & down
    const pitch = lerp(0.91, 1.1, this.zoomSmooth); // radians above the horizon
    const dist = this.distance;
    const followPos = new THREE.Vector3(this.focus.x, this.focus.y + Math.sin(pitch) * dist, this.focus.z + Math.cos(pitch) * dist);

    // orbit pose: low, slow, cinematic
    this.orbitAngle += dt * 0.06;
    // pull in as close as possible while every corner of the ship's bounds,
    // masts and bowsprit included, stays inside the screen area the menu leaves free
    const tanV = Math.tan(THREE.MathUtils.degToRad(15)) * Math.max(0.15, this.menuShift.h) * 0.94;
    const tanH = Math.tan(THREE.MathUtils.degToRad(15)) * this.camera.aspect * Math.max(0.15, this.menuShift.w) * 0.94;
    const box = this.orbitBox;
    const mid = box.getCenter(new THREE.Vector3());
    const aim = this.orbitCenter.clone().add(mid.clone().applyQuaternion(this.orbitQuat));
    const dir = new THREE.Vector3(Math.sin(this.orbitAngle) * 1.6, 0.62, Math.cos(this.orbitAngle) * 1.6).normalize();
    const right = new THREE.Vector3().crossVectors(dir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir.clone().negate());
    let want = 10;
    const q = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      q.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(mid).applyQuaternion(this.orbitQuat);
      const z = q.dot(dir);
      want = Math.max(want, z + Math.abs(q.dot(right)) / tanH, z + Math.abs(q.dot(up)) / tanV);
    }
    this.orbitDist = this.orbitDist ? this.orbitDist + (want - this.orbitDist) * damp(2.5, dt) : want;
    const op = aim.clone().addScaledVector(dir, this.orbitDist);
    op.y += Math.sin(time * 0.2) * 1.2;
    const b = this.blend * this.blend * (3 - 2 * this.blend);
    this.camera.position.lerpVectors(op, followPos, b);
    const lookAt = new THREE.Vector3().lerpVectors(aim, this.focus, b);

    // trauma shake (squared for a punchy falloff)
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    if (s > 0) {
      const k = s * (0.6 + this.zoomSmooth);
      this.camera.position.x += (Math.sin(time * 47) + Math.sin(time * 31)) * k * 0.6;
      this.camera.position.y += Math.sin(time * 53) * k * 0.5;
      this.camera.position.z += Math.sin(time * 41 + 1) * k * 0.6;
    }
    this.camera.lookAt(lookAt);
    this.camera.fov = lerp(30, 34, b);
    // slide the frame so the ship sits in the space the menu leaves free;
    // fades out as the camera swings into follow
    const k = damp(2.5, dt);
    this.shift.x += (this.menuShift.x * (1 - b) - this.shift.x) * k;
    this.shift.y += (this.menuShift.y * (1 - b) - this.shift.y) * k;
    if (Math.abs(this.shift.x) + Math.abs(this.shift.y) > 1e-4) {
      const a = this.camera.aspect;
      this.camera.setViewOffset(a, 1, -this.shift.x * a, -this.shift.y, a, 1);
    } else if (this.camera.view) {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
  }

  /** Visible ground half-extent, used to fit the shadow frustum. */
  groundRadius() {
    return clamp(this.distance * 0.75, 70, 260);
  }
}
