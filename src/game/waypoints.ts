// Waypoints: pins the captain drops on the sea chart, each raised in the world
// as a thin pillar of light with a breathing ring of ripples where it meets the
// sea. Pins are saved on the device (the archipelago's seed is fixed, so a pin
// still marks the same cove next voyage). Sail into one and it is struck off
// with a flare and a chime.

import * as THREE from 'three';

export const MAX_PINS = 5;
const KEY = 'aquati.waypoints.v1';
/** Sailing this close strikes a pin off. */
export const REACH = 26;
/** A pin only counts as reached once you have first been this far from it. */
const ARM = 70;
const PILLAR = 165; // metres tall
const DROP = 1.1; // seconds for the light to fall from the sky
const FADE = 1.6; // seconds to dissolve once lifted or reached

/** Pin colours: CSS for the charts, linear HDR for the light (bloom picks the core up). */
export const PIN_COLORS: { css: string; glow: [number, number, number] }[] = [
  { css: '#ffd27a', glow: [2.4, 1.55, 0.55] },
  { css: '#7ff0e6', glow: [0.55, 2.1, 2.0] },
  { css: '#ff97b8', glow: [2.4, 0.75, 1.25] },
  { css: '#bba6ff', glow: [1.3, 0.95, 2.6] },
  { css: '#b8f27c', glow: [1.1, 2.2, 0.55] },
];

export interface Pin {
  id: number;
  x: number;
  z: number;
  /** Index into PIN_COLORS. */
  hue: number;
  /** Seconds since dropped (render only). */
  age: number;
  /** >= 0 while dissolving. */
  gone: number;
  /** Reached rather than lifted: dissolves with a flare. */
  reached: boolean;
  armed: boolean;
}

const MAX_FX = MAX_PINS + 4; // room for pins still dissolving

// Additive, in the water/fx pass like the salvage beacons: soft-tested against
// the opaque depth so isles and hulls stand in front of the light.
const DEPTH_FADE = /* glsl */ `
  uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
  float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
  float sceneFade(float viewZ) {
    float sz = linearDepth(texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r);
    return clamp((sz - viewZ) * 0.35, 0.0, 1.0);
  }`;

function pillarMaterial(uniforms: Record<string, THREE.IUniform>, beam: boolean) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: beam,
    premultipliedAlpha: true,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aGlow; // rgb, w = fade 0..1
      attribute vec4 aInfo; // x = age, y = seed, z = flare (reached), w = dissolve 0..1
      uniform vec3 uLight;
      varying vec3 vCol; varying vec2 vUv; varying float vViewZ; varying vec4 vInfo; varying float vFade;
      void main() {
        vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        // a light, so it still glows after dark, just not blindingly
        float lum = clamp(dot(uLight, vec3(0.3333)), 0.0, 1.0);
        vCol = aGlow.rgb * (0.5 + 0.5 * lum);
        vFade = aGlow.w; vInfo = aInfo; vUv = uv;
        ${beam ? `
        // cylindrical billboard; it widens with distance so it never thins to a flickering sub-pixel line
        vec3 toCam = cameraPosition - c;
        float dist = length(toCam);
        toCam.y = 0.0;
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam + vec3(1e-4, 0.0, 0.0)));
        float w = max(2.2, dist * 0.0085) * (1.0 + aInfo.z * 1.6);
        vec3 p = c + right * position.x * w + vec3(0.0, (position.y + 0.5) * ${PILLAR.toFixed(1)} - 0.8, 0.0);` : `
        float breathe = 1.0 + 0.04 * sin(aInfo.x * 1.9 + aInfo.y * 20.0);
        float size = (11.0 + aInfo.z * 10.0) * breathe;
        vec3 p = c + vec3(position.x, 0.0, -position.y) * size + vec3(0.0, 0.14, 0.0);`}
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vCol; varying vec2 vUv; varying float vViewZ; varying vec4 vInfo; varying float vFade;
      ${DEPTH_FADE}
      float sq(float v) { return v * v; }
      void main() {
        float age = vInfo.x, seed = vInfo.y, flare = vInfo.z, gone = vInfo.w;
        float t = uTime + seed * 50.0;
        ${beam ? `
        float x = vUv.x * 2.0 - 1.0, y = vUv.y, m = y * ${PILLAR.toFixed(1)};
        // a needle-thin white-hot core inside a soft coloured sheath
        float core = exp(-x * x * 70.0);
        float sheath = exp(-x * x * 7.0) * 0.28;
        // motes of light drifting up the column
        float motes = smoothstep(0.82, 1.0, sin(m * 0.42 - t * 2.4)) * smoothstep(0.7, 1.0, sin(m * 0.13 + t * 0.7 + seed * 9.0));
        motes *= exp(-x * x * 16.0) * 0.9;
        // a slow pulse that climbs the whole pillar every few seconds
        float ph = fract(t * 0.085);
        float pulse = exp(-sq((y - ph) * 18.0)) * (1.0 - ph);
        float fall = pow(1.0 - y, 1.5) * smoothstep(0.0, 0.004, y);
        float foot = exp(-m * 0.28) * exp(-x * x * 2.5) * 0.9;
        vec3 white = vec3(1.0, 0.97, 0.9);
        vec3 col = vCol * (sheath * (1.0 + pulse * 0.8) + motes + foot) + white * core * (0.55 + pulse * 0.9);
        col *= fall;
        // drop-in: the light falls from the sky, a bright head leading it down
        float grow = clamp(age / ${DROP.toFixed(2)}, 0.0, 1.0);
        float front = sq(1.0 - grow);
        col *= smoothstep(front - 0.01, front + 0.01, y);
        col += (vCol + white) * exp(-sq((y - front) * 45.0)) * exp(-x * x * 6.0) * (1.0 - grow) * 2.0;
        // lifted: dissolves upwards from the sea
        col *= smoothstep(gone * 1.05 - 0.05, gone * 1.05, y);
        // thin it out right under the camera so it never hazes the view
        col *= smoothstep(4.0, 26.0, vViewZ) * (1.0 + flare * 1.5);` : `
        vec2 q = vUv * 2.0 - 1.0;
        float r = length(q);
        if (r > 1.0) discard;
        // three ripples rolling outwards, a crisp inner ring and a pool of light
        float rip = 0.0;
        for (int i = 0; i < 3; i++) {
          float p = fract(t * 0.3 + float(i) / 3.0);
          rip += exp(-sq((r - p) * 16.0)) * sq(1.0 - p);
        }
        float ring = exp(-sq((r - 0.2) * 34.0));
        float pool = pow(1.0 - r, 4.0);
        // drop-in splash ring
        float sp = clamp((age - ${(DROP * 0.8).toFixed(2)}) / 1.2, 0.0, 1.0);
        float splash = exp(-sq((r - sp) * 12.0)) * (1.0 - sp) * step(0.001, sp) * 1.6;
        float grow = smoothstep(${(DROP * 0.7).toFixed(2)}, ${(DROP * 1.1).toFixed(2)}, age);
        vec3 col = vCol * ((rip * 0.45 + ring * 0.5 + pool * 0.3) * grow + splash) * (1.0 - gone);
        col *= 1.0 - smoothstep(0.85, 1.0, r);`}
        col *= vFade * sceneFade(vViewZ);
        if (max(col.r, max(col.g, col.b)) < 0.002) discard;
        gl_FragColor = vec4(col, 0.0);
      }`,
  });
}

export class Waypoints {
  pins: Pin[] = [];
  /** Lifted or reached pins still dissolving. */
  private fading: Pin[] = [];
  private nextId = 1;
  /** Additive pillars and rings; belongs in the water/fx pass. */
  readonly fx = new THREE.Group();
  private beams!: THREE.InstancedMesh;
  private rings!: THREE.InstancedMesh;
  private glowAttr: THREE.InstancedBufferAttribute[] = [];
  private infoAttr: THREE.InstancedBufferAttribute[] = [];
  private m = new THREE.Matrix4();

  constructor() {
    this.load();
  }

  /** Builds the pillars; call once the fx depth uniforms exist (so the warm-up draws them). */
  buildFx(fxUniforms: Record<string, THREE.IUniform>, time: THREE.IUniform, light: THREE.IUniform) {
    const u = { ...fxUniforms, uTime: time, uLight: light };
    const make = (beam: boolean) => {
      const geo = new THREE.PlaneGeometry(beam ? 1 : 2, beam ? 1 : 2, 1, 1);
      const glow = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FX * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const info = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FX * 4), 4).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aGlow', glow);
      geo.setAttribute('aInfo', info);
      this.glowAttr.push(glow);
      this.infoAttr.push(info);
      const im = new THREE.InstancedMesh(geo, pillarMaterial(u, beam), MAX_FX);
      im.count = 0;
      im.frustumCulled = false;
      this.fx.add(im);
      return im;
    };
    this.rings = make(false);
    this.beams = make(true);
    this.rings.renderOrder = 4;
    this.beams.renderOrder = 22;
  }

  /** Drops a pin; when the chart is full the oldest is lifted to make room. */
  add(x: number, z: number, from?: { x: number; z: number }): Pin {
    if (this.pins.length >= MAX_PINS) this.lift(this.pins[0]);
    const used = new Set(this.pins.map((p) => p.hue));
    let hue = 0;
    while (used.has(hue)) hue++;
    const pin: Pin = { id: this.nextId++, x, z, hue, age: 0, gone: -1, reached: false, armed: !from || Math.hypot(from.x - x, from.z - z) > ARM };
    this.pins.push(pin);
    this.save();
    return pin;
  }

  /** The pin within `r` metres of a spot, if any (nearest first). */
  near(x: number, z: number, r: number): Pin | null {
    let best: Pin | null = null;
    let bd = r;
    for (const p of this.pins) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  lift(pin: Pin, reached = false) {
    const i = this.pins.indexOf(pin);
    if (i < 0) return;
    this.pins.splice(i, 1);
    pin.gone = 0;
    pin.reached = reached;
    this.fading.push(pin);
    if (this.fading.length > MAX_FX - MAX_PINS) this.fading.shift();
    this.save();
  }

  /** Advances the light and returns a pin the ship has just sailed into. */
  update(dt: number, ship: { x: number; z: number } | null, heightAt: (x: number, z: number) => number): Pin | null {
    let hit: Pin | null = null;
    for (const p of this.pins) {
      p.age += dt;
      if (!ship) continue;
      const d = Math.hypot(ship.x - p.x, ship.z - p.z);
      if (d > ARM) p.armed = true;
      else if (p.armed && d < REACH && !hit) hit = p;
    }
    if (hit) this.lift(hit, true);
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const p = this.fading[i];
      p.age += dt;
      p.gone += dt / FADE;
      if (p.gone >= 1) this.fading.splice(i, 1);
    }
    if (!this.beams) return hit;
    let n = 0;
    const put = (p: Pin) => {
      const g = PIN_COLORS[p.hue].glow;
      const gone = Math.max(0, p.gone);
      // reached: a bright flare that swells then fades; lifted: just dissolves
      const flare = p.reached ? Math.sin(Math.min(1, gone) * Math.PI) : 0;
      const fade = p.reached ? 1 - gone * gone : 1 - gone;
      this.m.makeTranslation(p.x, Math.max(0, heightAt(p.x, p.z)), p.z);
      this.beams.setMatrixAt(n, this.m);
      this.rings.setMatrixAt(n, this.m);
      for (let k = 0; k < 2; k++) {
        this.glowAttr[k].setXYZW(n, g[0], g[1], g[2], fade);
        this.infoAttr[k].setXYZW(n, p.age, (p.id * 0.618) % 1, flare, p.reached ? 0 : gone);
      }
      n++;
    };
    for (const p of this.pins) put(p);
    for (const p of this.fading) if (n < MAX_FX) put(p);
    this.beams.count = this.rings.count = n;
    this.beams.instanceMatrix.needsUpdate = this.rings.instanceMatrix.needsUpdate = true;
    for (const a of [...this.glowAttr, ...this.infoAttr]) a.needsUpdate = true;
    return hit;
  }

  private load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as { x: number; z: number; h: number }[];
      for (const r of raw.slice(-MAX_PINS)) {
        if (!Number.isFinite(r.x) || !Number.isFinite(r.z)) continue;
        const used = new Set(this.pins.map((p) => p.hue));
        let hue = r.h >= 0 && r.h < PIN_COLORS.length && !used.has(r.h) ? r.h : 0;
        while (used.has(hue)) hue++;
        // already standing when the voyage begins: no drop-in
        this.pins.push({ id: this.nextId++, x: r.x, z: r.z, hue, age: DROP + 2, gone: -1, reached: false, armed: false });
      }
    } catch {
      /* private mode or a bad save: start with a clean chart */
    }
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.pins.map((p) => ({ x: Math.round(p.x), z: Math.round(p.z), h: p.hue }))));
    } catch {
      /* storage full or blocked: pins just won't outlive the tab */
    }
  }
}
