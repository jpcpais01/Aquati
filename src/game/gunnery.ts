// Gunnery: lays the player's broadsides and draws them on the sea.
//
// Each side's guns cover a fan off the beam. The fans are painted onto the
// swell itself (same Gerstner waves as the ocean) so they ride every crest:
// cool teal while the crews reload, filling outward as they work, then warm
// gold when the guns are run out. A foe inside a loaded fan is locked: the fan
// streams chevrons toward it, a reticle closes on the ship and a pip marks
// where the balls will fall, already led for both ships' way. A foe just
// outside lights the edge you need to turn across. With a mouse, the side you
// point at is the side you fire, and with no foe in it the shot goes where you
// point.

import * as THREE from 'three';
import { angleDelta, clamp, damp } from '../core/noise';
import { globalUniforms } from '../render/environment';
import { GLSL_WAVES } from '../world/waves';
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
  /** Where the balls will fall (led), valid while `aimDist` >= 0. */
  impact: THREE.Vector3;
  aimDist: number;
  /** The mouse is pointing into this side. */
  hover: boolean;
}

const GRAVITY = 14;
const ANG_SEG = 44;
const RAD_SEG = 30;
const U_SPAN = 1.25; // fans extend a little past the arc so an edge can glow outward
const RN_SPAN = 1.04;

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
  /** A foe is close enough to fight: fans are up. */
  combat = false;
  /** The nearest foe within reach, locked or not. */
  focus: Ship | null = null;
  /** Called when a side finishes reloading during a fight. */
  onReady: (side: Side) => void = () => {};

  private fan: THREE.Mesh;
  private fanMat: THREE.ShaderMaterial;
  private reticle: THREE.Mesh;
  private pip: THREE.Mesh;
  private depthU = {
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
  };
  private uA = [new THREE.Vector4(1, 1, 0, 0), new THREE.Vector4(1, 1, 0, 0)]; // progress, ready, hot, hover
  private uB = [new THREE.Vector4(-1, 1, 0, 0), new THREE.Vector4(-1, 1, 0, 0)]; // aim metres, sweep, lean, ping
  private vis = 0;
  private lastFire = -100;
  private wasReady = { port: true, starboard: true };
  private retScale = 1.6;
  private retTarget: Ship | null = null;
  private pointer: THREE.Vector3 | null = null;
  private pointerSide: Side | null = null;
  private ptrLast = { x: 0, y: 0 };
  private ptrMoved = -100;

  constructor(waveUniforms: { [k: string]: THREE.IUniform }) {
    const mk = (side: Side): Broadside => ({ side, ready: true, progress: 1, target: null, impact: new THREE.Vector3(), aimDist: -1, hover: false });
    this.sides = { port: mk('port'), starboard: mk('starboard') };

    // ---- the two fans, one mesh: (u across the arc, rn out from the hull, side)
    const verts: number[] = [];
    const idx: number[] = [];
    for (const s of [1, -1]) {
      const base = verts.length / 3;
      for (let j = 0; j <= RAD_SEG; j++) {
        for (let i = 0; i <= ANG_SEG; i++) verts.push((i / ANG_SEG) * 2 * U_SPAN - U_SPAN, (j / RAD_SEG) * RN_SPAN, s);
      }
      const row = ANG_SEG + 1;
      for (let j = 0; j < RAD_SEG; j++) {
        for (let i = 0; i < ANG_SEG; i++) {
          const a = base + j * row + i;
          idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    this.fanMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      // premultiplied "over": the field of fire veils the sea a shade darker so
      // its glowing lines read on bright tropical shallows as well as at night
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      premultipliedAlpha: true,
      uniforms: {
        uTime: globalUniforms.uTime,
        uWaveA: waveUniforms.uWaveA,
        uWaveB: waveUniforms.uWaveB,
        uShip: { value: new THREE.Vector2() },
        uHeading: { value: 0 },
        uArc: { value: PLAYER_ARC },
        uR0: { value: 6 },
        uR: { value: 150 },
        uVis: { value: 0 },
        uA: { value: this.uA },
        uB: { value: this.uB },
        ...this.depthU,
      },
      vertexShader: /* glsl */ `
        ${GLSL_WAVES}
        uniform float uTime; uniform vec2 uShip; uniform float uHeading; uniform float uArc; uniform float uR0; uniform float uR;
        varying vec3 vFan; varying float vDist; varying float vViewZ;
        void main() {
          vec3 f = position; // u, rn, side
          float a = uHeading + f.z * (1.5707963 + f.x * uArc);
          float r = mix(uR0, uR, f.y);
          vec2 xz = uShip + vec2(sin(a), cos(a)) * r;
          vec3 n; float c;
          vec3 off = gerstner(xz, uTime, 1.0, length(xz - cameraPosition.xz), n, c);
          vec4 wp = vec4(xz.x + off.x, off.y + 0.22, xz.y + off.z, 1.0);
          vFan = f;
          vDist = r;
          vec4 mv = viewMatrix * wp;
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uVis; uniform vec4 uA[2]; uniform vec4 uB[2];
        varying vec3 vFan; varying float vDist; varying float vViewZ;
        ${DEPTH_GLSL}
        float sq(float x) { return x * x; }
        float aaLine(float x, float d, float w) { return 1.0 - smoothstep(0.0, max(fwidth(x), 1e-4) * w, abs(x - d)); }
        void main() {
          float occ = sceneVis(vViewZ);
          if (occ <= 0.001) discard;
          bool port = vFan.z > 0.0;
          vec4 A = port ? uA[0] : uA[1];
          vec4 B = port ? uB[0] : uB[1];
          float prog = A.x, ready = A.y, hot = A.z, hover = A.w;
          float aimM = B.x, sweep = B.y, lean = B.z, ping = B.w;
          float u = vFan.x, au = abs(u), rn = vFan.y;

          float inA = 1.0 - smoothstep(1.0 - max(fwidth(u), 1e-4) * 1.5, 1.0, au);
          float inR = 1.0 - smoothstep(1.0 - max(fwidth(rn), 1e-4) * 1.5, 1.0, rn);
          float inside = inA * inR;
          float nearF = smoothstep(0.0, 0.14, rn); // melt into the hull's own wash
          float t = uTime;

          vec3 cool = vec3(0.42, 0.86, 1.0);
          vec3 gold = vec3(1.0, 0.58, 0.16);
          vec3 base = mix(cool, gold, ready);

          // a faint veil over the whole field of fire, a touch stronger toward the rim
          float veil = inside * nearF * (0.07 + 0.06 * rn) * (0.8 + 0.4 * hover + 0.5 * hot);
          float body = veil * 0.18;
          // the edges of the arc and the extreme range
          float edge = aaLine(au, 1.0, 1.6) * inR * nearF * (1.0 - 0.45 * rn) * (0.3 + 0.25 * ready + 0.3 * hot + 0.25 * hover);
          float rim = aaLine(rn, 1.0, 1.8) * inA * (0.4 + 0.35 * ready + 0.3 * hot);
          // dashed range marks at a third and two thirds
          float dash = step(0.45, fract(u * 4.0 + 0.5));
          float ticks = (aaLine(rn, 0.3333, 1.2) + aaLine(rn, 0.6667, 1.2)) * dash * inside * 0.22;

          // reloading: the crews' progress fills the fan outward from the hull
          float loading = 1.0 - ready;
          float fill = loading * inside * nearF * (1.0 - smoothstep(prog - 0.02, prog + 0.02, rn)) * 0.06;
          float front = loading * inA * exp(-sq((rn - prog) * 60.0)) * 0.3 * step(0.02, prog);

          // locked and loaded: chevrons stream out toward the foe
          float ch = fract(rn * 3.0 - au * 0.3 - t * 0.7);
          float chev = smoothstep(0.88, 0.94, ch) * (1.0 - smoothstep(0.94, 0.985, ch)) * inside * nearF * hot * 0.2 * (1.0 - 0.5 * rn);

          // where the balls will fall
          float bd = vDist - aimM;
          float band = aimM > 0.0 ? (exp(-bd * bd) + exp(-bd * bd / 18.0) * 0.3) * inA : 0.0;

          // the broadside rolling out over the water when you fire
          float sw = sweep < 1.0 ? (exp(-sq((rn - sweep) * 22.0)) * 0.45 + step(rn, sweep) * 0.05) * (1.0 - sweep) * inside * smoothstep(0.0, 0.1, rn) : 0.0;

          // a foe just past an edge: that edge breathes, inviting you to turn across it
          float leanG = abs(lean) * step(0.0, u * lean) * exp(-sq((au - 1.0) * 14.0)) * nearF * inR * (1.0 - 0.5 * rn)
                      * (0.5 + 0.5 * sin(t * 5.0)) * 0.3;

          float pingG = ping * inside * nearF * (0.08 + 0.5 * exp(-sq((rn - (1.0 - ping)) * 14.0)));

          vec3 col = base * (body + edge + rim + ticks + chev + pingG)
                   + cool * (fill + front)
                   + vec3(1.0, 0.88, 0.62) * band * (0.45 + 0.4 * ready)
                   + vec3(1.0, 0.86, 0.6) * sw
                   + gold * leanG;
          float k = uVis * occ;
          gl_FragColor = vec4(col * 0.9 * k, veil * k);
        }`,
    });
    this.fan = new THREE.Mesh(g, this.fanMat);
    this.fan.frustumCulled = false;
    this.fan.renderOrder = 4;
    this.fan.visible = false;

    this.reticle = this.marker(0);
    this.pip = this.marker(1);
    this.group.add(this.fan, this.reticle, this.pip);
  }

  /** Reticle (mode 0) and impact pip (mode 1): flat glyphs on the water. */
  private marker(mode: number): THREE.Mesh {
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
        uColor: { value: new THREE.Color(1, 1, 1) },
        uAlpha: { value: 0 },
        uLock: { value: 0 },
        ...this.depthU,
      },
      defines: { MODE: mode },
      vertexShader: /* glsl */ `
        varying vec2 vP; varying float vViewZ;
        void main() {
          vP = position.xz;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uAlpha; uniform float uLock;
        varying vec2 vP; varying float vViewZ;
        ${DEPTH_GLSL}
        float sq(float x) { return x * x; }
        float aaLine(float x, float d, float w) { return 1.0 - smoothstep(0.0, max(fwidth(x), 1e-4) * w, abs(x - d)); }
        void main() {
          float occ = sceneVis(vViewZ);
          if (occ <= 0.001) discard;
          float r = length(vP);
          float a = atan(vP.y, vP.x);
          float v = 0.0;
          #if MODE == 0
            // four brackets that turn slowly, then lock square when the guns bear
            float spin = a + uTime * 0.7 * (1.0 - uLock);
            float seg = fract(spin / 1.5707963 + 0.5);
            float br = smoothstep(0.12, 0.16, seg) * (1.0 - smoothstep(0.84, 0.88, seg));
            v += aaLine(r, 0.88, 2.2) * br;
            v += aaLine(r, 0.88, 1.2) * 0.25;
            // inward ticks at the cardinal points
            float q = fract(spin / 1.5707963);
            float arcLen = min(q, 1.0 - q) * 1.5707963 * r;
            v += (1.0 - smoothstep(0.03, 0.055, arcLen)) * step(0.68, r) * step(r, 0.82) * (0.4 + 0.6 * uLock);
            // a soft glow pooled on the water beneath the mark
            v += exp(-sq((r - 0.88) * 7.0)) * 0.18;
          #else
            // impact pip: a ring, a dot and a breathing halo
            v += aaLine(r, 0.6, 1.8);
            v += (1.0 - smoothstep(0.1, 0.16, r)) * 0.9;
            float c = 1.0 - smoothstep(0.03, 0.06, min(abs(vP.x), abs(vP.y)));
            v += c * step(0.3, r) * step(r, 0.9) * 0.6;
            float br = 0.5 + 0.5 * sin(uTime * 6.0);
            v += exp(-sq((r - 0.6 - br * 0.25) * 8.0)) * 0.35 * (1.0 - br);
          #endif
          v *= 1.0 - smoothstep(0.92, 1.0, r);
          gl_FragColor = vec4(uColor * v * uAlpha * occ, 0.0);
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
    if (Math.abs(ptr.x - this.ptrLast.x) + Math.abs(ptr.y - this.ptrLast.y) > 3) {
      this.ptrLast.x = ptr.x;
      this.ptrLast.y = ptr.y;
      this.ptrMoved = performance.now();
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
    const v = p.cls.muzzleSpeed;
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
    return gunRange(p.cls.muzzleSpeed);
  }

  update(dt: number, p: Ship | null, ships: Ship[], world: World, playing: boolean) {
    if (!p || !p.alive || !playing) {
      this.vis = Math.max(0, this.vis - dt * 3);
      this.fanMat.uniforms.uVis.value = this.vis;
      this.fan.visible = this.vis > 0.01;
      this.fadeMarkers(dt);
      this.combat = false;
      this.focus = null;
      for (const s of SIDES) this.sides[s].target = null;
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
    const best: Record<Side, { s: Ship | null; score: number; d: number }> = {
      port: { s: null, score: Infinity, d: 0 },
      starboard: { s: null, score: Infinity, d: 0 },
    };
    for (const s of ships) {
      if (s === p || !s.alive || s.removed || s.team === p.team) continue;
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
      if (score < best[b.side].score) best[b.side] = { s, score, d };
    }
    this.focus = focus;
    this.combat = !!focus;

    const t = world.time;
    for (const [i, side] of SIDES.entries()) {
      const st = this.sides[side];
      const rl = p.reload[side];
      st.ready = rl <= 0;
      st.progress = clamp(1 - rl / p.cls.reload, 0, 1);
      st.target = best[side].s;
      st.hover = this.pointerSide === side;
      st.aimDist = -1;
      if (st.target) {
        this.predict(p, st.target, st.impact);
        st.aimDist = Math.hypot(st.impact.x - p.pos.x, st.impact.z - p.pos.z);
      } else if (st.hover && this.pointer) {
        this.clampPoint(p, side, this.pointer, R, r0, st.impact);
        st.aimDist = Math.hypot(st.impact.x - p.pos.x, st.impact.z - p.pos.z);
      }
      if (st.ready && !this.wasReady[side] && (this.combat || ptrIn)) {
        this.uB[i].w = 1;
        this.onReady(side);
      }
      this.wasReady[side] = st.ready;

      const A = this.uA[i];
      A.x = st.progress;
      A.y += ((st.ready ? 1 : 0) - A.y) * damp(10, dt);
      A.z += ((st.ready && st.target ? 1 : 0) - A.z) * damp(8, dt);
      A.w += ((st.hover ? 1 : 0) - A.w) * damp(10, dt);
      const B = this.uB[i];
      B.x = st.aimDist;
      B.y = Math.min(1, B.y + dt * 1.6);
      B.w = Math.max(0, B.w - dt * 1.8);
      B.z = 0;
    }

    // a foe in reach but outside both fans: glow the edge to turn across
    if (focus && !best.port.s && !best.starboard.s) {
      const b = this.bearing(p, focus.pos.x, focus.pos.z);
      const i = b.side === 'port' ? 0 : 1;
      this.uB[i].z = Math.sign(b.u) * clamp(1.6 - Math.abs(b.u) * 0.45, 0.35, 1);
    }

    // out of a fight the arcs keep off the water, but moving the mouse near her shows where she'd fire
    const browsing = ptrIn && performance.now() - this.ptrMoved < 1600;
    const want = this.combat || browsing || t - this.lastFire < 2.5 ? 1 : 0;
    this.vis += (want - this.vis) * damp(want ? 5 : 1.6, dt);
    const u = this.fanMat.uniforms;
    u.uVis.value = this.vis;
    u.uShip.value.set(p.pos.x, p.pos.z);
    u.uHeading.value = p.heading;
    u.uR0.value = r0;
    u.uR.value = R;
    this.fan.visible = this.vis > 0.01;

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
    // the reticle rides the locked foe (the side that would fire), else the nearest one in reach
    const auto = this.autoSide(p);
    const locked = auto ? this.sides[auto].target : null;
    const mark = locked ?? (this.sides.port.target || this.sides.starboard.target || this.focus);
    const rm = this.reticle.material as THREE.ShaderMaterial;
    if (mark !== this.retTarget) {
      this.retTarget = mark;
      this.retScale = 1.7;
    }
    const lockSide = mark === this.sides.port.target ? this.sides.port : mark === this.sides.starboard.target ? this.sides.starboard : null;
    if (mark) {
      this.reticle.visible = true;
      const hot = !!lockSide && lockSide.ready;
      rm.uniforms.uAlpha.value = Math.min(1, rm.uniforms.uAlpha.value + dt * 4);
      rm.uniforms.uLock.value += ((lockSide ? 1 : 0) - rm.uniforms.uLock.value) * damp(6, dt);
      const c = rm.uniforms.uColor.value as THREE.Color;
      if (hot) c.setRGB(2.4, 1.55, 0.5);
      else if (lockSide) c.setRGB(1.1, 1.5, 1.7);
      else c.setRGB(0.7, 0.72, 0.78);
      this.retScale += ((lockSide ? 1 : 1.25) - this.retScale) * damp(7, dt);
      const s = mark.cls.length * 0.62 * this.retScale;
      this.reticle.scale.setScalar(s);
      this.reticle.position.set(mark.pos.x, world.waterHeight(mark.pos.x, mark.pos.z) + 0.3, mark.pos.z);
    } else {
      rm.uniforms.uAlpha.value = Math.max(0, rm.uniforms.uAlpha.value - dt * 3);
      this.reticle.visible = rm.uniforms.uAlpha.value > 0.01;
    }

    // impact pip: where the locked broadside will land, once that's visibly off the hull
    const pm = this.pip.material as THREE.ShaderMaterial;
    const showPip = lockSide && lockSide.target ? Math.hypot(lockSide.impact.x - lockSide.target.pos.x, lockSide.impact.z - lockSide.target.pos.z) > 4 : false;
    if (showPip && lockSide) {
      this.pip.visible = true;
      pm.uniforms.uAlpha.value = Math.min(1, pm.uniforms.uAlpha.value + dt * 4);
      (pm.uniforms.uColor.value as THREE.Color).setRGB(...((lockSide.ready ? [2.2, 1.5, 0.55] : [1.0, 1.35, 1.55]) as [number, number, number]));
      const ip = lockSide.impact;
      this.pip.position.set(ip.x, world.waterHeight(ip.x, ip.z) + 0.3, ip.z);
      this.pip.scale.setScalar(3.2 + p.cls.length * 0.08);
    } else {
      pm.uniforms.uAlpha.value = Math.max(0, pm.uniforms.uAlpha.value - dt * 4);
      this.pip.visible = pm.uniforms.uAlpha.value > 0.01;
    }
  }

  private fadeMarkers(dt: number) {
    for (const m of [this.reticle, this.pip]) {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uAlpha.value = Math.max(0, u.uAlpha.value - dt * 3);
      m.visible = u.uAlpha.value > 0.01;
    }
  }

  /** The broadside that the one-button fire (Space, the touch Fire button) should loose. */
  autoSide(p: Ship): Side | null {
    const { port, starboard } = this.sides;
    const pd = port.target ? port.aimDist : Infinity;
    const sd = starboard.target ? starboard.aimDist : Infinity;
    // a loaded side with a foe in it beats everything
    if (port.target && port.ready && (!starboard.target || !starboard.ready || pd <= sd)) return 'port';
    if (starboard.target && starboard.ready) return 'starboard';
    // a foe in a fan that's still loading: that side (it'll say it's reloading)
    if (port.target || starboard.target) return pd <= sd ? 'port' : 'starboard';
    // nobody in the fans: the side facing the nearest foe
    if (this.focus) return this.bearing(p, this.focus.pos.x, this.focus.pos.z).side;
    return null;
  }

  /** The side the mouse points into (desktop click), if any. */
  hoverSide(): Side | null {
    return this.pointerSide;
  }

  /** Target or point to lay a broadside on. */
  aim(p: Ship, side: Side): { target: Ship | null; point: THREE.Vector3 } {
    const st = this.sides[side];
    if (st.target) return { target: st.target, point: st.impact.clone() };
    if (st.hover && st.aimDist > 0) return { target: null, point: st.impact.clone() };
    // no mark: square off the beam at a good fighting range
    const R = this.range(p);
    const a = p.heading + (side === 'port' ? 1 : -1) * (Math.PI / 2);
    return { target: null, point: new THREE.Vector3(p.pos.x + Math.sin(a) * R * 0.6, 0, p.pos.z + Math.cos(a) * R * 0.6) };
  }

  /** The broadside went off: roll a sweep of light out across that fan. */
  fired(side: Side, time: number) {
    this.uB[side === 'port' ? 0 : 1].y = 0;
    this.lastFire = time;
  }
}
