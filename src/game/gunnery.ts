// Gunnery: lays the player's broadsides, and keeps the sea clear while it does.
//
// Each side's guns cover a fan off the beam. A foe inside a loaded fan is
// locked, and only then does anything show in the world: a warm lantern glow
// gathers on the water around her hull, shimmering with the swell. That is
// the moment to fire. Out of a fight nothing is drawn at all. The guns lead
// for both ships' way. With a mouse, the side you point at is the side you
// fire, and with no foe in it the shot goes where you point.

import * as THREE from 'three';
import { angleDelta, clamp } from '../core/noise';
import { globalUniforms } from '../render/environment';
import { PLAYER_ARC, Ship, gunRange } from '../ships/ship';
import { World } from './world';

export type Side = 'port' | 'starboard';
const SIDES: Side[] = ['port', 'starboard'];

export interface Broadside {
  side: Side;
  ready: boolean;
  /** Reload, 0 just fired .. 1 run out. */
  progress: number;
  /** The foe these guns are laid on, if one sits inside the fan. */
  target: Ship | null;
  /** Or a mark on the sea that isn't a ship (an arm of the Kraken, its head). */
  mark: GunMark | null;
  /** Where the balls will fall (led), valid while `aimDist` >= 0. */
  impact: THREE.Vector3;
  aimDist: number;
  /** The mouse is pointing into this side. */
  hover: boolean;
}

const GRAVITY = 14;

/** A target that isn't a ship: a point on the sea and its size. */
export interface GunMark {
  x: number;
  z: number;
  r: number;
}

const DEPTH_GLSL = /* glsl */ `
  uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
  float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
  // hulls, rigging and islands in front of the mark hide it
  float sceneVis(float viewZ) {
    float sz = linearDepth(texture(uSceneDepth, gl_FragCoord.xy / uResolution).r);
    return smoothstep(-0.6, 0.4, sz - viewZ);
  }
`;

const _v = new THREE.Vector3();
const _lead = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ray = new THREE.Raycaster();

export class Gunnery {
  readonly group = new THREE.Group();
  readonly sides: Record<Side, Broadside>;
  /** A foe is close enough to fight. */
  combat = false;
  /** The nearest foe within reach, locked or not. */
  focus: Ship | null = null;
  /** Called when a side finishes reloading during a fight. */
  onReady: (side: Side) => void = () => {};
  /** Marks besides ships this frame (the first `nMarks`), filled in by the game. */
  readonly marks: GunMark[] = [];
  nMarks = 0;
  private focusMark: GunMark | null = null;

  private glow: THREE.Mesh;
  private glowAlpha = 0;
  private depthU = {
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
  };
  private wasReady = { port: true, starboard: true };
  private pointer: THREE.Vector3 | null = null;
  private pointerSide: Side | null = null;

  constructor() {
    const mk = (side: Side): Broadside => ({ side, ready: true, progress: 1, target: null, mark: null, impact: new THREE.Vector3(), aimDist: -1, hover: false });
    this.sides = { port: mk('port'), starboard: mk('starboard') };
    this.glow = this.buildGlow();
    this.group.add(this.glow);
  }

  /**
   * The lock glow: lantern light pooled on the water around a hull. It is a
   * soft halo shaped to the ship (her own hull hides the middle), rippling
   * as if the light were caught on moving water. No lines, no glyphs.
   */
  private buildGlow(): THREE.Mesh {
    const g = new THREE.PlaneGeometry(2, 2);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
      uniforms: {
        uTime: globalUniforms.uTime,
        uNight: globalUniforms.uNight,
        uAlpha: { value: 0 },
        uHalf: { value: new THREE.Vector2(3, 10) }, // hull half-beam, half-length (m)
        uSize: { value: 20 }, // plane half-size (m)
        ...this.depthU,
      },
      vertexShader: /* glsl */ `
        varying vec2 vP; varying float vViewZ;
        void main() {
          vP = position.xz;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uNight; uniform float uAlpha; uniform vec2 uHalf; uniform float uSize;
        varying vec2 vP; varying float vViewZ;
        ${DEPTH_GLSL}
        void main() {
          float occ = sceneVis(vViewZ);
          if (occ <= 0.001) discard;
          vec2 m = vP * uSize;
          // rounded hull outline (a superellipse), then distance outside it in metres
          vec2 q = abs(m) / uHalf;
          float d = pow(pow(q.x, 2.4) + pow(q.y, 2.4), 1.0 / 2.4);
          float out_ = max(d - 1.0, 0.0) * min(uHalf.x, uHalf.y) * 1.6;
          float halo = exp(-out_ * 0.32) * smoothstep(0.55, 1.0, d);
          // light caught on moving water: soft rings drifting outward, broken by a slow swirl
          float a = atan(m.y, m.x);
          float rip = 0.72 + 0.28 * sin(out_ * 1.7 - uTime * 2.2 + sin(a * 3.0 + uTime * 0.7) * 1.2);
          float breathe = 0.85 + 0.15 * sin(uTime * 2.1);
          float v = halo * rip * breathe * (1.0 - smoothstep(0.82, 1.0, length(vP)));
          vec3 col = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.7, 0.35), uNight) * (0.42 - 0.12 * uNight);
          gl_FragColor = vec4(col * v * uAlpha * occ, 0.0);
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.visible = false;
    return mesh;
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.depthU.uSceneDepth.value = depth;
    this.depthU.uResolution.value.set(w, h);
    this.depthU.uCamNearFar.value.set(cam.near, cam.far);
  }

  /** Mouse position on the sea, or null on touch / with no pointer. */
  setPointer(ptr: { x: number; y: number; active: boolean } | null, cam: THREE.Camera) {
    if (!ptr || !ptr.active) {
      this.pointer = null;
      return;
    }
    _ndc.set((ptr.x / innerWidth) * 2 - 1, -(ptr.y / innerHeight) * 2 + 1);
    _ray.setFromCamera(_ndc, cam);
    const out = this.pointer ?? new THREE.Vector3();
    this.pointer = _ray.ray.intersectPlane(_plane, out) ? out : null;
  }

  /**
   * Lays the guns on `foe`. `lead` gets the point the guns train on (relative
   * to this ship, since the balls keep her way), `out` the spot on the sea
   * where they fall: where the foe will be when they arrive. Returns the
   * horizontal reach the guns are elevated for.
   */
  private predict(p: Ship, foe: Ship, out: THREE.Vector3, lead = _lead): number {
    const v = p.muzzleSpeed;
    const rvx = foe.vel.x - p.vel.x;
    const rvz = foe.vel.z - p.vel.z;
    let tof = Math.hypot(foe.pos.x - p.pos.x, foe.pos.z - p.pos.z) / v;
    let d = 0;
    for (let i = 0; i < 2; i++) {
      lead.set(foe.pos.x + rvx * tof, 0, foe.pos.z + rvz * tof);
      d = Math.hypot(lead.x - p.pos.x, lead.z - p.pos.z);
      const e = 0.5 * Math.asin(clamp((GRAVITY * d) / (v * v), 0, 1));
      tof = d / (v * Math.cos(e));
    }
    out.set(foe.pos.x + foe.vel.x * tof, 0, foe.pos.z + foe.vel.z * tof);
    return d;
  }

  /** Relative bearing of a point: which side, and how far across that side's fan (|u| <= 1 inside, + astern). */
  private bearing(p: Ship, x: number, z: number): { side: Side; u: number; d: number } {
    const rel = angleDelta(p.heading, Math.atan2(x - p.pos.x, z - p.pos.z));
    return { side: rel > 0 ? 'port' : 'starboard', u: (Math.abs(rel) - Math.PI / 2) / PLAYER_ARC, d: Math.hypot(x - p.pos.x, z - p.pos.z) };
  }

  range(p: Ship) {
    return gunRange(p.muzzleSpeed);
  }

  update(dt: number, p: Ship | null, ships: Ship[], world: World, playing: boolean) {
    if (!p || !p.alive || !playing) {
      this.setGlow(null, dt, null);
      this.combat = false;
      this.focus = null;
      this.focusMark = null;
      for (const s of SIDES) {
        this.sides[s].target = null;
        this.sides[s].mark = null;
      }
      return;
    }
    const R = this.range(p);
    const r0 = p.cls.beam * 0.5 + 1.5;

    // the side the mouse points into, and where on the water
    this.pointerSide = null;
    let ptrIn = false;
    if (this.pointer) {
      const b = this.bearing(p, this.pointer.x, this.pointer.z);
      ptrIn = b.d < R * 1.35;
      if (ptrIn) this.pointerSide = b.side;
    }

    // lay each side on the best foe inside its fan
    let focus: Ship | null = null;
    let focusD = R * 1.3;
    const best: Record<Side, { s: Ship | null; m: GunMark | null; score: number; d: number }> = {
      port: { s: null, m: null, score: Infinity, d: 0 },
      starboard: { s: null, m: null, score: Infinity, d: 0 },
    };
    for (const s of ships) {
      if (s === p || !s.alive || s.removed || s.team === p.team || s.prize) continue;
      const raw = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z);
      if (raw > R * 1.4) continue;
      if (raw < focusD) {
        focusD = raw;
        focus = s;
      }
      const d = this.predict(p, s, _v, _lead);
      const b = this.bearing(p, _lead.x, _lead.z);
      // a hair of grace at the edges: the hull's length of guns covers it
      if (Math.abs(b.u) > 1.08 || d > R) continue;
      const toPtr = this.pointerSide === b.side && this.pointer ? Math.hypot(this.pointer.x - s.pos.x, this.pointer.z - s.pos.z) : -1;
      const score = toPtr >= 0 ? toPtr : d + Math.abs(b.u) * 60;
      if (score < best[b.side].score) best[b.side] = { s, m: null, score, d };
    }
    // and the marks that aren't ships: they stand still, so no leading
    let fm: GunMark | null = null;
    for (let i = 0; i < this.nMarks; i++) {
      const m = this.marks[i];
      const raw = Math.hypot(m.x - p.pos.x, m.z - p.pos.z);
      if (raw > R * 1.4) continue;
      if (raw < focusD) {
        focusD = raw;
        focus = null;
        fm = m;
      }
      const b = this.bearing(p, m.x, m.z);
      if (Math.abs(b.u) > 1.08 || raw > R || raw < r0 + 3) continue;
      const toPtr = this.pointerSide === b.side && this.pointer ? Math.hypot(this.pointer.x - m.x, this.pointer.z - m.z) : -1;
      const score = toPtr >= 0 ? toPtr : raw + Math.abs(b.u) * 60;
      if (score < best[b.side].score) best[b.side] = { s: null, m, score, d: raw };
    }
    this.focus = focus;
    this.focusMark = fm;
    this.combat = !!focus || !!fm;

    for (const side of SIDES) {
      const st = this.sides[side];
      const rl = p.reload[side];
      st.ready = rl <= 0;
      st.progress = clamp(1 - rl / p.reloadFull[side], 0, 1);
      st.target = best[side].s;
      st.mark = best[side].m;
      st.hover = this.pointerSide === side;
      st.aimDist = -1;
      if (st.target) {
        this.predict(p, st.target, st.impact);
        st.aimDist = Math.hypot(st.impact.x - p.pos.x, st.impact.z - p.pos.z);
      } else if (st.mark) {
        st.impact.set(st.mark.x, 0, st.mark.z);
        st.aimDist = best[side].d;
      } else if (st.hover && this.pointer) {
        this.clampPoint(p, side, this.pointer, R, r0, st.impact);
        st.aimDist = Math.hypot(st.impact.x - p.pos.x, st.impact.z - p.pos.z);
      }
      if (st.ready && !this.wasReady[side] && this.combat) this.onReady(side);
      this.wasReady[side] = st.ready;

    }

    this.updateMarkers(dt, p, world);
  }

  /** Clamp a point on the water into a side's fan. */
  private clampPoint(p: Ship, side: Side, pt: THREE.Vector3, R: number, r0: number, out: THREE.Vector3) {
    const sgn = side === 'port' ? 1 : -1;
    const rel = angleDelta(p.heading, Math.atan2(pt.x - p.pos.x, pt.z - p.pos.z));
    const u = clamp((Math.abs(rel) - Math.PI / 2) / PLAYER_ARC, -1, 1);
    const a = p.heading + sgn * (Math.PI / 2 + u * PLAYER_ARC);
    const d = clamp(Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z), r0 + 10, R);
    out.set(p.pos.x + Math.sin(a) * d, 0, p.pos.z + Math.cos(a) * d);
  }

  private updateMarkers(dt: number, p: Ship, world: World) {
    // the glow only gathers on a foe the loaded guns are laid on: the moment to fire
    const auto = this.autoSide(p);
    const st = auto ? this.sides[auto] : null;
    this.setGlow(st && st.ready ? st.target : null, dt, world, st && st.ready ? st.mark : null);
  }

  private setGlow(mark: Ship | null, dt: number, world: World | null, gm: GunMark | null = null) {
    const on = mark || gm;
    this.glowAlpha = on ? Math.min(1, this.glowAlpha + dt * 2.5) : Math.max(0, this.glowAlpha - dt * 2.5);
    const u = (this.glow.material as THREE.ShaderMaterial).uniforms;
    u.uAlpha.value = this.glowAlpha * this.glowAlpha * (3 - 2 * this.glowAlpha);
    this.glow.visible = this.glowAlpha > 0.01;
    if (!world) return;
    if (gm) {
      // a round pool of light where the arm meets the sea
      const size = gm.r * 4;
      u.uSize.value = size;
      u.uHalf.value.set(gm.r + 0.4, gm.r + 0.4);
      this.glow.scale.setScalar(size);
      this.glow.rotation.y = 0;
      this.glow.position.set(gm.x, world.waterHeight(gm.x, gm.z) + 0.2, gm.z);
      return;
    }
    if (!mark) return;
    const size = mark.cls.length * 0.95;
    u.uSize.value = size;
    u.uHalf.value.set(mark.cls.beam * 0.5 + 0.4, mark.cls.length * 0.5 + 0.4);
    this.glow.scale.setScalar(size);
    this.glow.rotation.y = mark.heading;
    this.glow.position.set(mark.pos.x, world.waterHeight(mark.pos.x, mark.pos.z) + 0.2, mark.pos.z);
  }

  /** The broadside that the one-button fire (Space, the touch Fire button) should loose. */
  autoSide(p: Ship): Side | null {
    const { port, starboard } = this.sides;
    const pt = !!(port.target || port.mark);
    const stt = !!(starboard.target || starboard.mark);
    const pd = pt ? port.aimDist : Infinity;
    const sd = stt ? starboard.aimDist : Infinity;
    // a loaded side with a foe in it beats everything
    if (pt && port.ready && (!stt || !starboard.ready || pd <= sd)) return 'port';
    if (stt && starboard.ready) return 'starboard';
    // a foe in a fan that's still loading: that side (it'll say it's reloading)
    if (pt || stt) return pd <= sd ? 'port' : 'starboard';
    // nobody in the fans: the side facing the nearest foe
    if (this.focus) return this.bearing(p, this.focus.pos.x, this.focus.pos.z).side;
    if (this.focusMark) return this.bearing(p, this.focusMark.x, this.focusMark.z).side;
    return null;
  }

  /** The side the mouse points into (desktop click), if any. */
  hoverSide(): Side | null {
    return this.pointerSide;
  }

  /** Target or point to lay a broadside on. */
  aim(p: Ship, side: Side): { target: Ship | null; point: THREE.Vector3 } {
    const st = this.sides[side];
    if (st.target || st.mark) return { target: st.target, point: st.impact.clone() };
    if (st.hover && st.aimDist > 0) return { target: null, point: st.impact.clone() };
    // no mark: square off the beam at a good fighting range
    const R = this.range(p);
    const a = p.heading + (side === 'port' ? 1 : -1) * (Math.PI / 2);
    return { target: null, point: new THREE.Vector3(p.pos.x + Math.sin(a) * R * 0.6, 0, p.pos.z + Math.cos(a) * R * 0.6) };
  }

}
