import * as THREE from 'three';
import { globalUniforms } from '../render/environment';
import type { Particles } from './particles';
import type { FireworkId } from '../game/fireworks';

// Fireworks, drawn entirely on the GPU. Every star (and every rocket, spark,
// crackle and flash) is written once into a ring of instanced attributes the
// moment its rocket leaves the gun: where it starts, how fast, when it's
// born, how long it lives, its colours and how it behaves. The vertex shader
// works out where it is now from a closed-form flight under drag and gravity,
// so a sky full of five thousand stars costs the CPU nothing per frame.
//
// Each star is a camera-facing ribbon whose vertices are each evaluated at
// their own moment of the past, so a willow's trail really droops along the
// curve it flew and a fish's tail really wriggles. Stars that split or
// crackle are just more stars with a later birth, planned up front, so a
// whole multi-break showpiece is decided at launch with no simulation at all.
//
// The bursts light the night: up to four light slots in globalUniforms are
// fed to every lit surface (sails, decks, islands), the sea's mirror and the
// smoke, all compiled in at load.

/** Light slots shared with the lit materials, the sea and the smoke (see GLSL_FW). */
export const FW_LIGHTS = 4;

const ROCKET_K = 0.08;
const ROCKET_G = 11;
const ELEV = THREE.MathUtils.degToRad(70);

// star behaviours (the integer part of aE.z; the fraction is a per-star seed)
const M_PLAIN = 0;
const M_GLITTER = 1; // twinkling head, a trail of glitter
const M_STROBE = 2; // hangs, then blinks on and off
const M_FISH = 3; // wriggles as it swims
const M_FLASH = 4; // a soft ball of light at the break
const M_POP = 5; // a crackle: a hard white pop, gone in a blink
const M_HANG = 6; // willow: slow, dim and drooping, glittering at the end
const M_ROCKET = 7; // the rocket's own head
const M_TENTACLE = 8; // a writhing arm (the Kraken's Bloom)

type RGB = [number, number, number];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _f = new THREE.Vector3();
const _g = new THREE.Vector3();

/** Position after t seconds of flight under linear drag k and gravity g (the shader's twin). */
function traj(out: THREE.Vector3, x0: THREE.Vector3, v0: THREE.Vector3, k: number, g: number, t: number) {
  const e = Math.exp(-k * t);
  const f = (1 - e) / k;
  const gk = g / k;
  return out.set(x0.x + v0.x * f, x0.y + (v0.y + gk) * f - gk * t, x0.z + v0.z * f);
}

function trajV(out: THREE.Vector3, v0: THREE.Vector3, k: number, g: number, t: number) {
  const e = Math.exp(-k * t);
  const gk = g / k;
  return out.set(v0.x * e, (v0.y + gk) * e - gk, v0.z * e);
}

/** n directions spread evenly over a sphere (a Fibonacci lattice), turned by `rot`. */
function fib(out: THREE.Vector3, i: number, n: number, rot: number) {
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.399963 + rot;
  return out.set(Math.cos(a) * r, y, Math.sin(a) * r);
}

const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// palettes (linear HDR: the bloom makes them glow)
const C = {
  coral: [7.5, 1.7, 2.0] as RGB,
  rose: [7.2, 1.4, 3.6] as RGB,
  gold: [7, 4.3, 1.3] as RGB,
  amber: [5, 2.5, 0.6] as RGB,
  ember: [2.2, 0.6, 0.08] as RGB,
  white: [7.6, 7.6, 8.2] as RGB,
  silver: [6, 6.6, 7.8] as RGB,
  ice: [3.2, 5.4, 8.5] as RGB,
  aqua: [1.3, 6, 6.8] as RGB,
  violet: [4.8, 1.9, 8] as RGB,
  green: [2, 6.6, 2.4] as RGB,
  sea: [1.4, 7, 4.4] as RGB,
  lemon: [6.8, 6.2, 1.6] as RGB,
  red: [8.5, 1.1, 1.0] as RGB,
  blue: [1.6, 2.6, 8.6] as RGB,
  pink: [8, 2.6, 6.2] as RGB,
};

interface Light {
  x: number; y: number; z: number;
  c: RGB;
  t0: number;
  power: number;
  dur: number;
  /** 0 smooth, 1 flickering (crackle and strobes). */
  flick: number;
}

type FwSound = 'launch' | 'whistle' | 'burst' | 'big' | 'crackle' | 'pop' | 'sizzle';

interface Event {
  at: number;
  pos: THREE.Vector3;
  sound: FwSound;
  power: number;
  /** Smoke left hanging in the sky (puffs), lit by the bursts after it. */
  smoke: number;
  light: Light | null;
}

export class Fireworks {
  readonly mesh: THREE.Mesh;
  /** Plays a firework sound at a point (the game routes it through the world's audio). */
  onSound: (kind: FwSound, at: THREE.Vector3, power: number) => void = () => {};
  /** Seconds since the fireworks' own clock started; it stops while the world is paused. */
  private clock = 0;
  private readonly cap: number;
  private head = 0;
  private used = 0;
  private dlo = Infinity;
  private dhi = -1;
  private liveUntil = -1;
  private readonly A: Float32Array;
  private readonly B: Float32Array;
  private readonly Cc: Float32Array;
  private readonly D: Float32Array;
  private readonly E: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geo: THREE.InstancedBufferGeometry;
  private events: Event[] = [];
  private lights: Light[] = [];
  /** A steady light that isn't a burst (a festival town's lanterns), lit while nothing brighter needs its slot. */
  private steady: Light | null = null;
  private readonly lit: Light[] = [];
  private readonly density: number;
  /** Where to break, metres over the guns: set from the camera so a burst fills the view without leaving it. */
  private height = 40;
  /** World camera axes, for the shaped showpieces (the Jolly Roger faces you). */
  private readonly camRight = new THREE.Vector3(1, 0, 0);
  private readonly camUp = new THREE.Vector3(0, 0.6, -0.8);
  private readonly camPos = new THREE.Vector3(0, 100, 100);

  readonly uniforms = {
    uFwClock: { value: 0 },
    uFwPx: { value: 0.001 },
    uFogColor: globalUniforms.uFogColor,
    uFogRange: globalUniforms.uFogRange,
    uMist: globalUniforms.uMist,
  };

  constructor(
    scale: number,
    private readonly particles: Particles,
  ) {
    this.density = Math.max(0.45, Math.min(1, scale));
    this.cap = Math.round((scale >= 0.9 ? 6144 : scale >= 0.7 ? 4608 : 3072) / 64) * 64;
    const n = this.cap;
    this.A = new Float32Array(n * 4);
    this.B = new Float32Array(n * 4);
    this.Cc = new Float32Array(n * 4);
    this.D = new Float32Array(n * 4);
    this.E = new Float32Array(n * 4);
    // a strip: tail cap, eight body columns along the flight, head cap; two rows across
    const cols = [-1, 0, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7, 1, 2];
    const pos: number[] = [];
    for (const u of cols) pos.push(u, -1, 0, u, 1, 0);
    const idx: number[] = [];
    for (let i = 0; i < cols.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = (this.geo = new THREE.InstancedBufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mk = (arr: Float32Array, name: string) => {
      const a = new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.attrs = [mk(this.A, 'aA'), mk(this.B, 'aB'), mk(this.Cc, 'aC'), mk(this.D, 'aD'), mk(this.E, 'aE')];
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uFwClock; uniform float uFwPx;
        uniform vec2 uFogRange; uniform float uMist;
        attribute vec4 aA; // start xyz, birth
        attribute vec4 aB; // velocity xyz, life
        attribute vec4 aC; // colour rgb, size
        attribute vec4 aD; // end colour rgb, trail (s)
        attribute vec4 aE; // drag, gravity, mode + seed, amplitude
        varying vec3 vCol; varying vec2 vQ; varying float vAlong; varying float vSeed; varying float vGlit; varying float vFog;

        float h11(float x) { return fract(sin(x * 78.233) * 43758.5453); }

        vec3 flight(float t, float mode, float seed) {
          float k = max(aE.x, 0.01);
          float e = exp(-k * t);
          float f = (1.0 - e) / k;
          float gk = aE.y / k;
          vec3 p = aA.xyz + vec3(aB.x * f, (aB.y + gk) * f - gk * t, aB.z * f);
          if (mode > 2.5 && mode < 3.5 || mode > 7.5) {
            vec3 v = vec3(aB.x * e, (aB.y + gk) * e - gk, aB.z * e) + vec3(1e-3, 0.0, 0.0);
            vec3 fwd = normalize(v);
            vec3 side = cross(fwd, vec3(0.0, 1.0, 0.0));
            side = dot(side, side) > 1e-4 ? normalize(side) : vec3(1.0, 0.0, 0.0);
            vec3 up = cross(side, fwd);
            if (mode < 3.5) {
              // a fish's tail: a quick side-to-side swim that settles in once it's away
              p += side * sin(t * 15.0 + seed * 40.0) * aE.w * smoothstep(0.0, 0.3, t);
            } else {
              // an arm that curls wider the further it reaches
              float ph = t * 2.3 + seed * 6.2832;
              p += (side * sin(ph) + up * cos(ph) * 0.75) * aE.w * t;
            }
          }
          return p;
        }

        void main() {
          float age = uFwClock - aA.w;
          float life = aB.w;
          if (age < 0.0 || age > life) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
          float mode = floor(aE.z);
          float seed = fract(aE.z);
          float t = age / life;
          float u = position.x;
          float body = clamp(u, 0.0, 1.0);
          float tl = aD.w;
          float tau = max(age - tl * (1.0 - body), 0.0);
          vec3 p = flight(tau, mode, seed);
          // which way it's travelling, on screen
          float dt = 0.02;
          vec3 pb = flight(max(tau - dt, 0.0), mode, seed);
          vec3 pf = tau < dt ? flight(tau + dt, mode, seed) : p;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vec2 d2 = (mat3(viewMatrix) * (pf - pb)).xy;
          float l2 = length(d2);
          vec2 dir = l2 > 1e-5 ? d2 / l2 : vec2(1.0, 0.0);

          // brightness through the star's life
          float env = 1.0 - smoothstep(0.6, 1.0, t);
          float bright = 1.0 + 1.4 * exp(-age * 9.0); // the instant of the break
          float size = aC.w;
          if (mode < 0.5) {
          } else if (mode < 1.5) {
            env *= 0.45 + 1.1 * step(0.45, h11(floor(age * 20.0) + seed * 97.0));
          } else if (mode < 2.5) {
            float blink = step(0.42, fract(age * 6.5 + seed * 13.0));
            env = (1.0 - smoothstep(0.85, 1.0, t)) * mix(1.0, blink * 1.7, smoothstep(0.22, 0.32, t));
          } else if (mode < 3.5) {
            env *= 0.85 + 0.3 * sin(age * 30.0 + seed * 20.0);
          } else if (mode < 4.5) {
            env = (1.0 - t) * (1.0 - t);
            bright = 1.0;
            size *= 0.55 + 0.9 * sqrt(t);
          } else if (mode < 5.5) {
            env = 1.0 - t;
            bright = 1.0;
            size *= 0.6 + 0.8 * t;
          } else if (mode < 6.5) {
            env = (1.0 - smoothstep(0.7, 1.0, t)) * (0.75 + 0.25 * (1.0 - t));
            env *= mix(1.0, 0.35 + 1.3 * step(0.5, h11(floor(age * 16.0) + seed * 61.0)), smoothstep(0.55, 0.8, t));
            bright = 1.0 + 0.8 * exp(-age * 6.0);
          } else if (mode < 7.5) {
            env = 0.85 + 0.3 * h11(floor(age * 30.0) + seed * 17.0);
            bright = 1.0;
          } else {
            env *= 0.8 + 0.2 * sin(age * 9.0 + seed * 10.0);
          }
          vec3 col = mix(aC.rgb, aD.rgb, smoothstep(0.15, 0.85, t));
          // the trail dims toward its tail; the head is the star itself
          float tailK = u < 0.0 ? 0.0 : u > 1.0 ? 1.0 : body;
          float fade = tl > 0.0 ? mix(0.1, 1.0, pow(tailK, 1.4)) : 1.0;
          float w = size * (0.4 + 0.6 * tailK) * (1.0 + 0.5 * exp(-age * 10.0));
          // never thinner than about a pixel and a half: further off, a star is dimmer, not thinner
          float wMin = uFwPx * -mv.z * 1.5;
          float thin = w < wMin ? (w * w) / (wMin * wMin) : 1.0;
          w = max(w, wMin);
          vCol = col * env * bright * fade * thin;
          vec2 sideV = vec2(-dir.y, dir.x);
          mv.xy += sideV * position.y * w;
          vQ = vec2(0.0, position.y);
          if (u < 0.0) { mv.xy -= dir * w; vQ.x = -1.0; }
          if (u > 1.0) { mv.xy += dir * w; vQ.x = 1.0; }
          vAlong = tailK;
          vSeed = seed;
          vGlit = (mode > 0.5 && mode < 1.5) || (mode > 5.5 && mode < 7.5) ? 1.0 : 0.0;
          float vz = -mv.z;
          vFog = max(smoothstep(uFogRange.x, uFogRange.y, vz) * 0.85, (1.0 - exp(-vz * 0.0045)) * uMist * 0.6);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFwClock;
        varying vec3 vCol; varying vec2 vQ; varying float vAlong; varying float vSeed; varying float vGlit; varying float vFog;
        void main() {
          float r = length(vQ);
          if (r >= 1.0) discard;
          float f = 1.0 - r;
          float glow = f * f;
          float core = glow * glow * glow;
          vec3 col = vCol * (glow * 0.5 + core * 1.7) + vec3(dot(vCol, vec3(0.3, 0.5, 0.2))) * core * 0.7;
          if (vGlit > 0.5 && vAlong < 0.96) {
            // glitter: the trail breaks into sparks that wink on and off as it burns
            float h = fract(sin(floor(vAlong * 24.0 + vSeed * 91.0 - uFwClock * 11.0) * 78.233) * 43758.5453);
            col *= 0.2 + step(0.6, h) * 2.4;
          }
          col *= 1.0 - vFog;
          if (max(col.r, max(col.g, col.b)) < 0.002) discard;
          gl_FragColor = vec4(col, 0.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
  }

  /** Called every frame with the view, so bursts break where you'll see them. */
  view(cam: THREE.PerspectiveCamera, distance: number, eye: number, viewportH: number) {
    // high enough to clear the masts, low enough that the break sits in the upper half of the frame
    const span = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)) * distance) / cam.zoom;
    this.height = THREE.MathUtils.lerp(THREE.MathUtils.clamp(span * 0.27, 22, 66), 46, eye);
    const e = cam.matrixWorld.elements;
    this.camRight.set(e[0], e[1], e[2]).normalize();
    this.camUp.set(e[4], e[5], e[6]).normalize();
    this.camPos.setFromMatrixPosition(cam.matrixWorld);
    this.uniforms.uFwPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5))) / (cam.zoom * Math.max(1, viewportH));
  }

  get busy() {
    return this.clock <= this.liveUntil || this.events.length > 0;
  }

  /**
   * A steady glow at a point (a quay strung with lanterns): it lights the
   * town and shimmers on the water like the bursts do, and gives up its slot
   * whenever the sky is busier. null puts it out.
   */
  glow(at: THREE.Vector3 | null, c: RGB = [1, 0.6, 0.3], power = 0) {
    if (!at || power <= 0.001) {
      this.steady = null;
      return;
    }
    const l = (this.steady ??= this.light(at, c, 0, power, 1, 0));
    l.x = at.x;
    l.y = at.y;
    l.z = at.z;
    const m = Math.max(c[0], c[1], c[2], 1e-3);
    l.c[0] = c[0] / m;
    l.c[1] = c[1] / m;
    l.c[2] = c[2] / m;
    l.power = power;
  }

  /** Puts the sky out at once (a new voyage, the farewell). */
  clear() {
    this.events.length = 0;
    this.lights.length = 0;
    this.liveUntil = -1;
    this.geo.instanceCount = 0;
    this.clock += 60; // every star in the ring is long dead now
    this.writeLights();
  }

  // ------------------------------------------------------------------ launching

  /**
   * One gun's rocket. `k` of `n` is its place in the volley, so a broadside
   * fans out and breaks at staggered heights instead of on top of itself.
   * `dir` is the gun's own outward heading (flat), `carry` the ship's way.
   */
  launch(id: FireworkId, from: THREE.Vector3, dir: THREE.Vector3, carry: THREE.Vector3, k: number, n: number) {
    const show = id === 'kraken' || id === 'roger' || id === 'fortune';
    // a showpiece goes up alone off the middle gun; its neighbours fire white salutes
    const salute = show && k > 0;
    const f = n > 1 ? k / (n - 1) - 0.5 : 0;
    const yaw = (show ? (k === 0 ? 0 : k % 2 ? -0.5 : 0.5) : f * 0.55) + rand(-0.06, 0.06);
    const big = show && !salute ? 1.3 : salute ? 0.72 : 1;
    // a gun facing away up the screen throws its break toward the top edge: send it a little lower
    const away = Math.max(0, dir.x * this.camUp.x + dir.z * this.camUp.z) / Math.max(1e-3, Math.hypot(this.camUp.x, this.camUp.z));
    const H = this.height * (1 - 0.3 * away) * big * (show ? 1 : 0.86 + 0.28 * ((k * 0.618) % 1)) * rand(0.95, 1.05);
    const tb = 1.35 + H * 0.013 + (salute ? -0.25 : 0);
    // the vertical speed that carries it to H in tb seconds against drag and gravity
    const ek = 1 - Math.exp(-ROCKET_K * tb);
    const gk = ROCKET_G / ROCKET_K;
    const vy = ((H + gk * tb) * ROCKET_K) / ek - gk;
    const vh = vy / Math.tan(ELEV + rand(-0.04, 0.04));
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const dx = dir.x * c - dir.z * s;
    const dz = dir.x * s + dir.z * c;
    const v0 = _v.set(dx * vh + carry.x, vy, dz * vh + carry.z);
    const x0 = _p.copy(from);
    const t0 = this.clock;
    this.rocket(x0, v0, t0, tb, id, salute || show);
    const at = traj(new THREE.Vector3(), x0, v0, ROCKET_K, ROCKET_G, tb);
    const vb = trajV(new THREE.Vector3(), v0, ROCKET_K, ROCKET_G, tb).multiplyScalar(0.22);
    const whistle = id === 'fish' || id === 'strobe' || id === 'kraken' || (id === 'crossette' && k === 0);
    this.event(t0, from.clone(), whistle ? 'whistle' : 'launch', show && !salute ? 1.3 : 1, 0, null);
    const R = H * (salute ? 0.3 : 0.4);
    const tB = t0 + tb;
    if (salute) this.salute(at, vb, tB, R);
    else this.burst(id, at, vb, tB, R, k);
  }

  /** The rocket itself: a bright spitting head and the sparks it sheds on the climb. */
  private rocket(x0: THREE.Vector3, v0: THREE.Vector3, t0: number, tb: number, id: FireworkId, heavy: boolean) {
    const palm = id === 'palm';
    const head: RGB = palm ? [6, 5.4, 2] : [6.4, 4.6, 2.2];
    this.star(x0, v0, t0, tb, head, mul(head, 0.8), heavy || palm ? 0.36 : 0.28, ROCKET_K, ROCKET_G, palm ? 0.7 : 0.3, M_ROCKET, 0);
    const sparks = Math.round((palm ? 30 : heavy ? 22 : 14) * this.density);
    for (let i = 0; i < sparks; i++) {
      const ts = (i + Math.random()) / sparks * tb * 0.97;
      traj(_e, x0, v0, ROCKET_K, ROCKET_G, ts);
      trajV(_f, v0, ROCKET_K, ROCKET_G, ts);
      _g.set(-_f.x * 0.08 + rand(-2.4, 2.4), -_f.y * 0.08 + rand(-1.5, 1.5), -_f.z * 0.08 + rand(-2.4, 2.4));
      const c: RGB = palm ? [5.5, 4.2, 1.2] : [6.5, 3.6, 1.2];
      this.star(_e, _g, t0 + ts, rand(0.45, palm ? 1.3 : 0.85), c, C.ember, rand(0.1, 0.16), 2, 7, 0.06, M_GLITTER, 0);
    }
  }

  /** The white salute that flanks a showpiece. */
  private salute(at: THREE.Vector3, vb: THREE.Vector3, tB: number, R: number) {
    const n = Math.round(70 * this.density);
    const k = 1.9;
    const rot = Math.random() * 6.28;
    for (let i = 0; i < n; i++) {
      fib(_d, i, n, rot).multiplyScalar(R * k * rand(0.92, 1.06)).add(vb);
      this.star(at, _d, tB, rand(1.2, 1.6), C.silver, C.ice, 0.3, k, 2.6, 0.22, M_GLITTER, 0);
    }
    this.flash(at, tB, R * 0.55, [7, 7, 8]);
    this.event(tB, at.clone(), 'burst', 0.6, 4, this.light(at, [0.9, 0.95, 1], tB, 1.1, 1.3, 0));
  }

  private flash(at: THREE.Vector3, t: number, size: number, c: RGB) {
    this.star(at, _g.set(0, 0, 0), t, 0.32, c, mul(c, 0.4), size, 1, 0, 0, M_FLASH, 0);
  }

  private light(at: THREE.Vector3, c: RGB, t0: number, power: number, dur: number, flick: number): Light {
    const m = Math.max(c[0], c[1], c[2], 1e-3);
    return { x: at.x, y: at.y, z: at.z, c: [c[0] / m, c[1] / m, c[2] / m], t0, power, dur, flick };
  }

  /** A sphere of stars: the building block of most shells. */
  private shell(at: THREE.Vector3, vb: THREE.Vector3, t: number, o: { n: number; speed: number; k: number; g: number; life: [number, number]; c0: RGB; c1: RGB; size: number; trail: number; mode: number; jitter?: number; vary?: (i: number) => [RGB, RGB] }) {
    const n = Math.max(12, Math.round(o.n * this.density));
    const rot = Math.random() * 6.28;
    const j = o.jitter ?? 0.05;
    for (let i = 0; i < n; i++) {
      fib(_d, i, n, rot);
      _d.x += rand(-j, j);
      _d.y += rand(-j, j);
      _d.z += rand(-j, j);
      _d.normalize().multiplyScalar(o.speed * rand(0.94, 1.05)).add(vb);
      const [c0, c1] = o.vary ? o.vary(i) : [o.c0, o.c1];
      this.star(at, _d, t, rand(o.life[0], o.life[1]), c0, c1, o.size * rand(0.9, 1.1), o.k, o.g, o.trail, o.mode, 0);
    }
  }

  /** A flat ring of stars in the plane across `normal`. */
  private ringOf(at: THREE.Vector3, vb: THREE.Vector3, t: number, normal: THREE.Vector3, o: { n: number; speed: number; k: number; g: number; life: [number, number]; c0: RGB; c1: RGB; size: number; trail: number; mode: number }) {
    const n = Math.max(16, Math.round(o.n * this.density));
    const a = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const b = new THREE.Vector3().crossVectors(normal, a);
    const rot = Math.random() * 6.28;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rot;
      _d.copy(a).multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang)).multiplyScalar(o.speed * rand(0.98, 1.02)).add(vb);
      this.star(at, _d, t, rand(o.life[0], o.life[1]), o.c0, o.c1, o.size, o.k, o.g, o.trail, o.mode, 0);
    }
  }

  /** A plane facing the camera (tipped back a little), for rings that read as rings. */
  private facing(tilt: number) {
    const toCam = _f.copy(this.camPos).normalize();
    const r = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    return toCam.clone().lerp(r, tilt).normalize();
  }

  // ------------------------------------------------------------------ the shells

  private burst(id: FireworkId, at: THREE.Vector3, vb: THREE.Vector3, t: number, R: number, k: number) {
    const s = (kk: number) => R * kk; // break speed that fills radius R under drag kk
    switch (id) {
      case 'peony': {
        const pal: [RGB, RGB][] = [[C.coral, C.gold], [C.rose, C.white], [C.coral, C.lemon], [C.pink, C.gold]];
        const [c0, c1] = pal[k % pal.length];
        this.shell(at, vb, t, { n: 160, speed: s(1.8), k: 1.8, g: 3, life: [1.6, 2.05], c0, c1, size: 0.42, trail: 0.12, mode: M_PLAIN });
        this.flash(at, t, R * 0.5, [8, 5, 4]);
        this.event(t, at.clone(), 'burst', 1, 6, this.light(at, lerp3(c0, c1, 0.4), t, 1.6, 1.9, 0));
        break;
      }
      case 'chrysanthemum': {
        this.shell(at, vb, t, { n: 130, speed: s(1.4), k: 1.4, g: 3.5, life: [2.0, 2.5], c0: C.gold, c1: C.amber, size: 0.32, trail: 0.6, mode: M_GLITTER });
        // a silver pistil at the heart
        this.shell(at, vb, t, { n: 36, speed: s(1.8) * 0.4, k: 1.8, g: 2, life: [0.9, 1.2], c0: C.white, c1: C.silver, size: 0.3, trail: 0.1, mode: M_PLAIN });
        this.flash(at, t, R * 0.5, [8, 6, 3]);
        this.event(t, at.clone(), 'burst', 1, 6, this.light(at, C.gold, t, 1.7, 2.3, 0));
        break;
      }
      case 'willow': {
        this.shell(at, vb, t, { n: 110, speed: s(2.4) * 0.85, k: 2.4, g: 4.6, life: [3.6, 4.5], c0: [5.4, 3.0, 0.8], c1: [2.2, 0.8, 0.12], size: 0.26, trail: 1.5, mode: M_HANG });
        this.flash(at, t, R * 0.45, [7, 5, 2.4]);
        this.event(t, at.clone(), 'burst', 0.9, 6, this.light(at, [1, 0.62, 0.22], t, 1.4, 4, 0));
        this.event(t + 0.9, at.clone(), 'sizzle', 0.8, 0, null);
        break;
      }
      case 'palm': {
        const fronds = 7;
        const rot = Math.random() * 6.28;
        for (let i = 0; i < fronds; i++) {
          const a = rot + (i / fronds) * Math.PI * 2 + rand(-0.12, 0.12);
          const up = rand(0.25, 0.45);
          _e.set(Math.cos(a), up, Math.sin(a)).normalize().multiplyScalar(s(0.95) * 1.15).add(vb);
          const fv = _e.clone();
          const life = rand(2.2, 2.6);
          this.star(at, fv, t, life, [2.4, 6.4, 1.8], [6, 4, 0.9], 0.62, 0.95, 7, 0.95, M_GLITTER, 0);
          // each frond sheds gold glitter all along its bow
          const drops = Math.round(9 * this.density);
          for (let j = 0; j < drops; j++) {
            const ts = (j + Math.random()) / drops * life * 0.9;
            traj(_g, at, fv, 0.95, 7, ts);
            _d.set(rand(-1.5, 1.5), rand(-1, 0.6), rand(-1.5, 1.5));
            this.star(_g, _d, t + ts, rand(0.6, 1.1), [6.4, 4.6, 1.4], C.ember, 0.16, 2.2, 6, 0.1, M_GLITTER, 0);
          }
        }
        this.flash(at, t, R * 0.5, [6, 7, 3]);
        this.event(t, at.clone(), 'burst', 1, 5, this.light(at, [0.65, 1, 0.35], t, 1.5, 2.2, 0));
        break;
      }
      case 'ring': {
        const n1 = this.facing(0.45);
        const n2 = this.facing(0.7);
        this.ringOf(at, vb, t, n1, { n: 70, speed: s(1.8), k: 1.8, g: 2, life: [1.8, 2.1], c0: C.aqua, c1: [0.8, 3.6, 6], size: 0.4, trail: 0.16, mode: M_PLAIN });
        this.ringOf(at, vb, t, n2, { n: 64, speed: s(1.8) * 0.78, k: 1.8, g: 2, life: [1.8, 2.1], c0: C.violet, c1: C.pink, size: 0.38, trail: 0.16, mode: M_PLAIN });
        this.shell(at, vb, t, { n: 14, speed: s(1.8) * 0.18, k: 1.8, g: 1, life: [0.8, 1.1], c0: C.white, c1: C.ice, size: 0.4, trail: 0, mode: M_PLAIN });
        this.flash(at, t, R * 0.4, [4, 6, 8]);
        this.event(t, at.clone(), 'burst', 0.9, 4, this.light(at, [0.55, 0.85, 1], t, 1.5, 1.9, 0));
        break;
      }
      case 'crossette': {
        const n = Math.round(11 * Math.max(0.7, this.density));
        const rot = Math.random() * 6.28;
        for (let i = 0; i < n; i++) {
          fib(_d, i, n, rot).multiplyScalar(s(1.0) * 0.95).add(vb);
          const cv = _d.clone();
          const ts = rand(0.55, 0.72);
          this.star(at, cv, t, ts, C.silver, C.white, 0.34, 1.0, 3, 0.32, M_GLITTER, 0);
          // the split: four pieces flung across its flight, a little cross of fire
          const sp = traj(new THREE.Vector3(), at, cv, 1.0, 3, ts);
          const sv = trajV(new THREE.Vector3(), cv, 1.0, 3, ts);
          const fwd = sv.clone().normalize();
          const a = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
          if (a.lengthSq() < 1e-4) a.set(1, 0, 0);
          a.normalize();
          const b = new THREE.Vector3().crossVectors(fwd, a);
          for (let q = 0; q < 4; q++) {
            const ang = (q / 4) * Math.PI * 2 + rand(-0.15, 0.15);
            _e.copy(a).multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang)).multiplyScalar(R * 0.75).addScaledVector(sv, 0.45);
            this.star(sp, _e, t + ts, rand(0.95, 1.25), C.ice, C.blue, 0.3, 1.9, 3, 0.26, M_PLAIN, 0);
          }
          this.flash(sp, t + ts, R * 0.12, [6, 7, 8]);
        }
        this.flash(at, t, R * 0.35, [7, 7, 8]);
        this.event(t, at.clone(), 'burst', 0.8, 4, this.light(at, [0.85, 0.92, 1], t, 1.2, 0.9, 0));
        this.event(t + 0.62, at.clone(), 'pop', 1, 0, this.light(at, [0.6, 0.8, 1], t + 0.62, 1.3, 1.4, 0));
        break;
      }
      case 'strobe': {
        this.shell(at, vb, t, { n: 120, speed: s(2.2) * 0.8, k: 2.2, g: 1.3, life: [3.0, 3.9], c0: C.white, c1: [5.5, 6.5, 8.5], size: 0.4, trail: 0.06, mode: M_STROBE, jitter: 0.18 });
        this.flash(at, t, R * 0.45, [7, 7.5, 8]);
        this.event(t, at.clone(), 'burst', 0.85, 4, this.light(at, [0.92, 0.96, 1], t, 1.4, 3.6, 1));
        this.event(t + 1, at.clone(), 'crackle', 0.35, 0, null);
        break;
      }
      case 'crackle': {
        const n = Math.max(30, Math.round(70 * this.density));
        const rot = Math.random() * 6.28;
        const k0 = 1.6, g0 = 3.6;
        for (let i = 0; i < n; i++) {
          fib(_d, i, n, rot).multiplyScalar(s(k0) * rand(0.85, 1.05)).add(vb);
          const life = rand(1.15, 1.5);
          this.star(at, _d, t, life, C.gold, C.amber, 0.34, k0, g0, 0.28, M_PLAIN, 0);
          // each egg hatches into a hail of pops where it dies
          const end = traj(new THREE.Vector3(), at, _d, k0, g0, life);
          for (let q = 0; q < 3; q++) {
            _e.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3, 8));
            this.star(end, _e, t + life + rand(-0.05, 0.3), rand(0.07, 0.16), [9, 8.4, 6.5], [6, 4, 1.5], 0.5, 6, 0, 0, M_POP, 0);
          }
        }
        this.flash(at, t, R * 0.45, [8, 5.5, 2]);
        this.event(t, at.clone(), 'burst', 0.9, 5, this.light(at, C.gold, t, 1.4, 1.6, 0));
        this.event(t + 1.3, at.clone(), 'crackle', 1, 0, this.light(at, [1, 0.85, 0.6], t + 1.3, 1.6, 0.6, 1));
        break;
      }
      case 'fish': {
        const n = Math.max(20, Math.round(48 * this.density));
        const rot = Math.random() * 6.28;
        for (let i = 0; i < n; i++) {
          fib(_d, i, n, rot);
          _d.x += rand(-0.2, 0.2);
          _d.y += rand(-0.2, 0.2);
          _d.z += rand(-0.2, 0.2);
          _d.normalize().multiplyScalar(s(1.2) * rand(0.6, 1.0)).add(vb);
          const c0 = Math.random() < 0.5 ? C.aqua : C.lemon;
          this.star(at, _d, t, rand(2.0, 2.7), c0, mul(c0, 0.6), 0.3, 1.2, 1.4, 0.5, M_FISH, rand(0.7, 1.3));
        }
        this.flash(at, t, R * 0.35, [5, 8, 7]);
        this.event(t, at.clone(), 'burst', 0.7, 3, this.light(at, [0.5, 1, 0.85], t, 1.2, 2.4, 0));
        break;
      }
      case 'saturn': {
        this.shell(at, vb, t, { n: 96, speed: s(2.0) * 0.62, k: 2.0, g: 1.8, life: [1.9, 2.3], c0: C.violet, c1: [3, 1.1, 5.2], size: 0.4, trail: 0.12, mode: M_PLAIN });
        this.ringOf(at, vb, t, this.facing(0.35).lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize(), { n: 80, speed: s(1.6) * 1.12, k: 1.6, g: 1.8, life: [2.1, 2.5], c0: C.gold, c1: C.lemon, size: 0.36, trail: 0.2, mode: M_GLITTER });
        this.flash(at, t, R * 0.45, [6, 4, 8]);
        this.event(t, at.clone(), 'burst', 1, 5, this.light(at, [0.85, 0.6, 1], t, 1.6, 2.2, 0));
        break;
      }
      case 'kraken':
        this.kraken(at, vb, t, R);
        break;
      case 'roger':
        this.roger(at, vb, t, R);
        break;
      case 'fortune':
        this.fortune(at, vb, t, R);
        break;
    }
  }

  /** Kraken's Bloom: a sea-green maw, then eight great arms of fire curling down at the sea. */
  private kraken(at: THREE.Vector3, vb: THREE.Vector3, t: number, R: number) {
    this.shell(at, vb, t, { n: 150, speed: R * 1.6 * 0.62, k: 1.6, g: 1.6, life: [2.1, 2.6], c0: [0.8, 4.2, 2.6], c1: [0.4, 2.2, 3], size: 0.38, trail: 0.2, mode: M_PLAIN });
    // the arms: each a stream of stars fired one after another down the same curling path
    const arms = 8;
    const rot = Math.random() * 6.28;
    const per = Math.round(18 * Math.max(0.6, this.density));
    for (let a = 0; a < arms; a++) {
      const ang = rot + (a / arms) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(ang), rand(-0.35, 0.05), Math.sin(ang)).normalize().multiplyScalar(R * 1.15).add(vb);
      const seed = Math.random();
      for (let i = 0; i < per; i++) {
        const delay = (i / per) * 0.75;
        // the arm's stars overlap along it, so each is dim on its own: together they keep their colour
        const c0 = lerp3(C.violet, C.sea, i / per).map((c) => c * 0.26) as RGB;
        this.star(at, v, t + delay, 3.1 - delay * 0.6, c0, [0.26, 1.2, 0.85], 0.46 - (i / per) * 0.2, 0.75, 4.2, 0.55, M_TENTACLE, R * 0.12, seed);
      }
      // a crackle of suckers at the tip as each arm dies away
      const tip = traj(new THREE.Vector3(), at, v, 0.75, 4.2, 2.2);
      for (let q = 0; q < 4; q++) {
        _e.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 6));
        this.star(tip, _e, t + 2.2 + rand(0, 0.5), rand(0.08, 0.16), [6, 9, 7], C.sea, 0.6, 6, 0, 0, M_POP, 0);
      }
    }
    // a ring of glowing eyes (gold) as it spreads
    this.ringOf(at, vb, t + 0.15, this.facing(0.25), { n: 40, speed: R * 2.2 * 0.5, k: 2.2, g: 0.6, life: [2.4, 2.8], c0: C.lemon, c1: C.gold, size: 0.42, trail: 0, mode: M_STROBE });
    this.flash(at, t, R * 0.8, [1.2, 3.6, 2.4]);
    this.event(t, at.clone(), 'big', 1.4, 10, this.light(at, [0.4, 1, 0.75], t, 2.6, 3.4, 0));
    this.event(t + 2.3, at.clone(), 'crackle', 1, 0, this.light(at, [0.6, 1, 0.8], t + 2.3, 1.6, 0.8, 1));
  }

  /** The Jolly Roger: the skull and crossbones written in white fire, facing you, with a crimson crown. */
  private roger(at: THREE.Vector3, vb: THREE.Vector3, t: number, R: number) {
    const pts = rogerShape(this.density);
    const k = 2.6;
    const right = this.camRight;
    const up = this.camUp;
    // the shape forms as the stars slow: launched at k × offset they come to rest at the offset
    const S = R * 1.15;
    for (const [x, y, part] of pts) {
      _d.copy(right).multiplyScalar(x * S * k).addScaledVector(up, y * S * k).add(vb).multiplyScalar(rand(0.97, 1.03));
      const eye = part === 1;
      const bone = part === 2;
      const c0: RGB = eye ? C.red : bone ? [7.4, 7, 6.2] : C.white;
      const c1: RGB = eye ? [6, 0.4, 0.3] : bone ? [5.5, 4.6, 3.2] : [5.2, 5.8, 7.4];
      this.star(at, _d, t, rand(3.4, 3.9), c0, c1, eye ? 0.5 : 0.36, k, 0.9, 0.08, M_HANG, 0);
    }
    // the crimson crown: a ring of red glitter above the skull and a crackle all round
    const n = Math.round(60 * this.density);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      _d.copy(right).multiplyScalar(Math.cos(a) * R * 1.55 * 1.7).addScaledVector(up, Math.sin(a) * R * 1.55 * 1.7).add(vb);
      this.star(at, _d, t + 0.25, rand(1.6, 2.0), C.red, [3, 0.3, 0.2], 0.34, 1.7, 2.4, 0.4, M_GLITTER, 0);
      if (i % 2 === 0) {
        const end = traj(new THREE.Vector3(), at, _d, 1.7, 2.4, 1.8);
        _e.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 5));
        this.star(end, _e, t + 2.0 + rand(0, 0.35), rand(0.07, 0.15), [9, 6, 6], C.red, 0.55, 6, 0, 0, M_POP, 0);
      }
    }
    this.flash(at, t, R * 0.7, [8, 8, 9]);
    this.event(t, at.clone(), 'big', 1.3, 10, this.light(at, [1, 0.95, 0.95], t, 2.4, 3.6, 0));
    this.event(t + 2.05, at.clone(), 'crackle', 1, 0, this.light(at, [1, 0.35, 0.3], t + 2.05, 1.8, 0.8, 1));
  }

  /** Fortune's Finale: a golden crown, rings of every colour breaking round it, then a rain of gold coins. */
  private fortune(at: THREE.Vector3, vb: THREE.Vector3, t: number, R: number) {
    // the crown: a huge golden kamuro that hangs and glitters
    this.shell(at, vb, t, { n: 200, speed: R * 2.2 * 0.95, k: 2.2, g: 3.2, life: [3.8, 4.6], c0: [7.4, 5.2, 1.6], c1: [3, 1.3, 0.25], size: 0.32, trail: 1.1, mode: M_HANG });
    this.flash(at, t, R * 0.8, [9, 7, 3]);
    this.event(t, at.clone(), 'big', 1.5, 10, this.light(at, [1, 0.78, 0.35], t, 2.8, 4.2, 0));
    // the satellite breaks: peonies of every colour going off round it
    const pals: [RGB, RGB][] = [[C.red, C.gold], [C.green, C.lemon], [C.blue, C.white], [C.pink, C.violet], [C.aqua, C.white], [C.violet, C.pink]];
    const sats = 6;
    const rot = Math.random() * 6.28;
    for (let i = 0; i < sats; i++) {
      const a = rot + (i / sats) * Math.PI * 2;
      const r = R * 0.95;
      const p = at.clone().addScaledVector(this.camRight, Math.cos(a) * r).addScaledVector(this.camUp, Math.sin(a) * r * 0.8);
      const ts = t + 0.55 + i * 0.22;
      const [c0, c1] = pals[i];
      this.shell(p, _g.set(0, 0, 0), ts, { n: 70, speed: R * 0.42 * 2, k: 2, g: 2.6, life: [1.3, 1.7], c0, c1, size: 0.34, trail: 0.12, mode: M_PLAIN });
      this.flash(p, ts, R * 0.25, mul(c0, 0.9));
      this.event(ts, p, 'burst', 0.7, 2, i % 2 ? null : this.light(p, lerp3(c0, c1, 0.3), ts, 1.4, 1.4, 0));
    }
    // a rain of gold coins glinting down to the sea
    const coins = Math.round(130 * this.density);
    for (let i = 0; i < coins; i++) {
      const p = at.clone().add(_e.set(rand(-1, 1), rand(-0.6, 0.6), rand(-1, 1)).multiplyScalar(R * 1.2));
      this.star(p, _d.set(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)), t + 1.9 + rand(0, 0.6), rand(2.4, 3.2), [7.5, 5.6, 1.8], [5, 3, 0.7], 0.3, 2, 2.4, 0.18, M_STROBE, 0);
    }
    // and the crown crackles out
    const pops = Math.round(90 * this.density);
    for (let i = 0; i < pops; i++) {
      fib(_d, i, pops, rot).multiplyScalar(R * rand(0.6, 1.1));
      const p = at.clone().add(_d);
      _e.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 5));
      this.star(p, _e, t + 3.0 + rand(0, 0.6), rand(0.07, 0.15), [9, 8.5, 6], C.gold, 0.55, 6, 0, 0, M_POP, 0);
    }
    this.event(t + 3.1, at.clone(), 'crackle', 1.2, 0, this.light(at, [1, 0.9, 0.6], t + 3.1, 2, 0.9, 1));
  }

  // ------------------------------------------------------------------ the ring

  private star(x0: THREE.Vector3, v0: THREE.Vector3, t0: number, life: number, c0: RGB, c1: RGB, size: number, drag: number, grav: number, trail: number, mode: number, amp: number, seed = Math.random()) {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    this.used = Math.max(this.used, i + 1);
    const o = i * 4;
    const A = this.A, B = this.B, Cc = this.Cc, D = this.D, E = this.E;
    A[o] = x0.x; A[o + 1] = x0.y; A[o + 2] = x0.z; A[o + 3] = t0;
    B[o] = v0.x; B[o + 1] = v0.y; B[o + 2] = v0.z; B[o + 3] = life;
    Cc[o] = c0[0]; Cc[o + 1] = c0[1]; Cc[o + 2] = c0[2]; Cc[o + 3] = size;
    D[o] = c1[0]; D[o + 1] = c1[1]; D[o + 2] = c1[2]; D[o + 3] = trail;
    E[o] = drag; E[o + 1] = grav; E[o + 2] = mode + Math.min(seed, 0.999); E[o + 3] = amp;
    this.dlo = Math.min(this.dlo, i);
    this.dhi = Math.max(this.dhi, i + 1);
    this.liveUntil = Math.max(this.liveUntil, t0 + life + trail);
  }

  private event(at: number, pos: THREE.Vector3, sound: FwSound, power: number, smoke: number, light: Light | null) {
    this.events.push({ at, pos, sound, power, smoke, light });
  }

  // ------------------------------------------------------------------ every frame

  update(dt: number) {
    this.clock += dt;
    const now = this.clock;
    // sounds, lights and smoke whose moment has come
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.at > now) continue;
      this.events.splice(i, 1);
      if (now - e.at < 0.5) this.onSound(e.sound, e.pos, e.power);
      if (e.light) this.lights.push(e.light);
      for (let s = 0; s < e.smoke; s++) {
        const r = this.height * 0.18;
        const g = rand(0.55, 0.7);
        this.particles.emit({
          x: e.pos.x + rand(-r, r), y: e.pos.y + rand(-r, r) * 0.6, z: e.pos.z + rand(-r, r), vx: rand(-0.6, 0.6), vy: rand(-0.3, 0.4), vz: rand(-0.6, 0.6),
          life: rand(6, 9), size: rand(3, 5), sizeEnd: rand(8, 12), color: [g, g * 0.98, g * 0.96], alpha: rand(0.035, 0.06), drag: 0.6, grav: 0.02, spin: rand(-0.2, 0.2), kind: 1, fadeIn: 0.6,
        });
      }
    }
    for (let i = this.lights.length - 1; i >= 0; i--) if (now - this.lights[i].t0 > this.lights[i].dur) this.lights.splice(i, 1);
    this.writeLights();

    // upload just the stars written since the last frame; the ranges pile up until the renderer
    // uploads them (it clears them then), so several steps between two frames lose nothing
    if (this.dhi > this.dlo) {
      for (const a of this.attrs) {
        a.addUpdateRange(this.dlo * 4, (this.dhi - this.dlo) * 4);
        a.needsUpdate = true;
      }
      this.dlo = Infinity;
      this.dhi = -1;
    }
    const live = now <= this.liveUntil;
    this.geo.instanceCount = live ? this.used : 0;
    this.uniforms.uFwClock.value = now;
    // a quiet sky: start the clock over so its float keeps full precision
    if (!live && !this.events.length && this.clock > 3000) {
      this.clock = 0;
      this.liveUntil = -1;
      for (let i = 0; i < this.used; i++) this.A[i * 4 + 3] = -1e4;
      for (const a of this.attrs) a.clearUpdateRanges();
      this.attrs[0].needsUpdate = true;
    }
  }

  /** The brightest bursts of the moment into the light slots (dark slots get 0). */
  private writeLights() {
    const now = this.clock;
    const L = globalUniforms.uFwLight.value;
    const Cl = globalUniforms.uFwColor.value;
    const ls = this.lit;
    ls.length = 0;
    for (const l of this.lights) ls.push(l);
    const st = this.steady;
    if (st) ls.push(st);
    const lv = (l: Light) => {
      // the lanterns' glow: steady, with the faintest candle waver
      if (l === st) return l.power * (0.94 + 0.06 * Math.sin(now * 7.3) * Math.sin(now * 3.1));
      const t = now - l.t0;
      if (t < 0) return 0;
      const k = Math.max(0, 1 - t / l.dur);
      let v = l.power * (Math.exp(-t * 7) * 1.4 + k * k * 0.75);
      if (l.flick) v *= 0.45 + 0.9 * Math.random();
      return v;
    };
    if (ls.length > FW_LIGHTS) ls.sort((a, b) => lv(b) - lv(a));
    for (let i = 0; i < FW_LIGHTS; i++) {
      const l = ls[i];
      if (!l) {
        L[i].w = 0;
        continue;
      }
      const v = lv(l);
      L[i].set(l.x, l.y, l.z, v);
      Cl[i].set(l.c[0], l.c[1], l.c[2]);
    }
  }
}

/**
 * Points of the skull and crossbones in a unit frame (x right, y up, about
 * ±1), each tagged 0 skull, 1 eye, 2 bone.
 */
function rogerShape(density: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const d = Math.max(0.6, density);
  const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number, part: number) => {
    const m = Math.max(4, Math.round(n * d));
    for (let i = 0; i <= m; i++) {
      const a = a0 + ((a1 - a0) * i) / m;
      out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, part]);
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, n: number, part: number) => {
    const m = Math.max(3, Math.round(n * d));
    for (let i = 0; i <= m; i++) out.push([x0 + ((x1 - x0) * i) / m, y0 + ((y1 - y0) * i) / m, part]);
  };
  // cranium: most of a circle, open at the bottom where the jaw hangs
  arc(0, 0.28, 0.5, 0.46, -0.32, Math.PI + 0.32, 34, 0);
  // cheeks down to the jaw
  line(-0.47, 0.13, -0.3, -0.18, 5, 0);
  line(0.47, 0.13, 0.3, -0.18, 5, 0);
  // the jaw and its teeth
  line(-0.3, -0.18, -0.26, -0.36, 3, 0);
  line(0.3, -0.18, 0.26, -0.36, 3, 0);
  line(-0.26, -0.36, 0.26, -0.36, 8, 0);
  for (let i = -2; i <= 2; i++) line(i * 0.1, -0.2, i * 0.1, -0.34, 2, 0);
  // eye sockets, burning red
  arc(-0.19, 0.26, 0.13, 0.12, 0, Math.PI * 2, 12, 1);
  arc(0.19, 0.26, 0.13, 0.12, 0, Math.PI * 2, 12, 1);
  out.push([-0.19, 0.26, 1], [0.19, 0.26, 1]);
  // the nose
  line(0, 0.1, -0.06, -0.02, 2, 0);
  line(0, 0.1, 0.06, -0.02, 2, 0);
  // crossbones beneath, knuckled at the ends
  line(-0.72, -0.5, 0.72, -1.0, 18, 2);
  line(-0.72, -1.0, 0.72, -0.5, 18, 2);
  for (const [x, y] of [[-0.72, -0.5], [0.72, -1.0], [-0.72, -1.0], [0.72, -0.5]] as const) {
    arc(x - 0.05 * Math.sign(x), y + 0.06, 0.07, 0.07, 0, Math.PI * 2, 6, 2);
    arc(x - 0.05 * Math.sign(x), y - 0.06, 0.07, 0.07, 0, Math.PI * 2, 6, 2);
  }
  return out;
}
