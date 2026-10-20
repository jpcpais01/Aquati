import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getSharedTextures } from '../render/textures';
import { globalUniforms } from '../render/environment';
import { HAT } from '../ships/crewModel';
import type { Particles } from './particles';

// The souls of fallen pirates. When a cutthroat goes under with his ship, or
// falls on the sand, a fort's parade or a boarded deck, a little green ghost
// slips out of him: the same sailor in spirit (his own hat, his build), a
// round toy-like wisp with a curling tail and two hollow eyes. He pops up,
// bobs, looks up at you and does one last thing (waves, tips his hat, twirls,
// or shouts "boo!"), then floats off into the sky and is gone in a puff of motes.
//
// Cheap by construction: one InstancedMesh with one material, built at init so
// the loading screen's warm-up draws it (see render/warmup.ts). Each ghost is a
// single instance written once when it is born; the whole performance after
// that (rise, gestures, sway, fade) plays out in the vertex shader from its
// birth time. The CPU only trails a few motes behind the living ones.

/** How far apart (m) ghosts rising together keep. */
const SPACING = 2.1;

/** Seconds from the first glimmer to the last mote. */
export const SPIRIT_LIFE = 4.8;

/** What a ghost does once he has his bearings. */
export const GESTURE = { wave: 0, twirl: 1, tip: 2, boo: 3 } as const;

/** Ghost hat parts carry the crew's own hat ids (crewModel HAT), so a ghost wears what the sailor wore. */
const PART_BODY = 0;
const PART_ARM_L = 10;
const PART_ARM_R = 11;

/** Mirrors the shader's easeOutBack so the motes keep to the body. */
function popOf(age: number) {
  const k = Math.min(1, Math.max(0, age / 0.75)) - 1;
  return 1 + 2.70158 * k * k * k + 1.70158 * k * k;
}
/** Height of a ghost's middle above where he was born, at `age` (the shader's `rise`, without the bob). */
function riseOf(age: number) {
  const asc = Math.max(age - 2.75, 0);
  return -1.2 + 2.55 * popOf(age) + asc * asc * 0.55 + asc * 0.9;
}

// ------------------------------------------------------------------ the figure

function tag(g: THREE.BufferGeometry, part: number) {
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  g.deleteAttribute('uv');
  return g;
}

/** A smooth lathe through a few control points (r, y), walked up the outside so its faces look out. */
function lathe(pts: [number, number][], radial: number, steps: number) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  const line = curve.getPoints(steps).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  // the seam goes round the back, away from the face
  return new THREE.LatheGeometry(line, radial).rotateY(Math.PI);
}

function buildFigure() {
  const parts: THREE.BufferGeometry[] = [];
  // head and body in one round pour: a dome of a head, a soft pinch of a neck,
  // shoulders, then a long taper into a tail that the shader curls
  parts.push(tag(lathe([
    [0.0, -0.2], [0.05, -0.1], [0.1, 0.08], [0.16, 0.3], [0.22, 0.54], [0.28, 0.78], [0.32, 0.98], [0.335, 1.12],
    [0.3, 1.24], [0.235, 1.33], [0.215, 1.39], [0.26, 1.46], [0.305, 1.56], [0.318, 1.67], [0.3, 1.79], [0.245, 1.89],
    [0.15, 1.96], [0.0, 1.99],
  ], 20, 30), PART_BODY));
  // arms: little mitten-handed tubes hanging from the shoulders (posed in the shader)
  for (const side of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.072, 0.3, 3, 8);
    arm.translate(0, -0.2, 0);
    const hand = new THREE.SphereGeometry(0.098, 10, 7);
    hand.translate(0, -0.42, 0.01);
    const a = mergeGeometries([arm, hand].map((g) => (g.deleteAttribute('uv'), g)))!;
    a.translate(side * 0.29, 1.17, 0);
    parts.push(tag(a, side < 0 ? PART_ARM_L : PART_ARM_R));
  }
  // tricorn: a low crown and a rolled brim turned up into three corners, one to the front
  {
    const crown = new THREE.SphereGeometry(0.235, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    crown.scale(1, 0.62, 1);
    crown.translate(0, 1.84, 0);
    const brim = new THREE.TorusGeometry(0.285, 0.062, 7, 36);
    brim.rotateX(Math.PI / 2);
    brim.scale(1, 0.55, 1);
    const p = brim.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const th = Math.atan2(x, z);
      const c = Math.cos(3 * th);
      const r = 1 + 0.13 * c;
      p.setXYZ(i, x * r, p.getY(i) + 0.06 + 0.04 * c, z * r);
    }
    brim.translate(0, 1.82, 0);
    brim.computeVertexNormals();
    parts.push(tag(mergeGeometries([crown, brim].map((g) => (g.deleteAttribute('uv'), g)))!, HAT.tricorn));
  }
  // bandana: a snug skullcap with a knot at the back and two tails that flutter
  {
    const cap = new THREE.SphereGeometry(0.333, 16, 7, 0, Math.PI * 2, 0, Math.PI * 0.44);
    cap.translate(0, 1.645, 0);
    const knot = new THREE.SphereGeometry(0.075, 8, 6);
    knot.scale(1.3, 1, 0.8);
    knot.translate(0, 1.76, -0.3);
    const tails = [-1, 1].map((s) => {
      const t = new THREE.CapsuleGeometry(0.035, 0.2, 2, 6);
      t.scale(1.6, 1, 0.6);
      t.translate(0, -0.13, 0);
      t.rotateZ(s * 0.35);
      t.rotateX(-0.35);
      t.translate(s * 0.04, 1.73, -0.33);
      return t;
    });
    parts.push(tag(mergeGeometries([cap, knot, ...tails].map((g) => (g.deleteAttribute('uv'), g)))!, HAT.bandana));
  }
  // knit cap: a turned-up cuff and a floppy stocking (flopped in the shader) with a bobble
  {
    const sock = lathe([[0.0, 1.66], [0.3, 1.72], [0.318, 1.82], [0.26, 1.96], [0.15, 2.1], [0.05, 2.2], [0.0, 2.22]], 16, 14);
    const cuff = new THREE.TorusGeometry(0.31, 0.05, 6, 24);
    cuff.rotateX(Math.PI / 2);
    cuff.translate(0, 1.74, 0);
    const bob = new THREE.SphereGeometry(0.075, 9, 6);
    bob.translate(0, 2.25, 0);
    parts.push(tag(mergeGeometries([sock, cuff, bob].map((g) => (g.deleteAttribute('uv'), g)))!, HAT.knit));
  }
  // straw hat: a wide, flat brim and a round-topped crown in one lathe
  {
    const straw = lathe([[0.0, 1.78], [0.3, 1.77], [0.46, 1.755], [0.49, 1.772], [0.45, 1.795], [0.24, 1.83], [0.215, 1.92], [0.19, 1.99], [0.1, 2.01], [0.0, 2.015]], 24, 26);
    parts.push(tag(straw, HAT.straw));
  }
  for (const g of parts) if (g.index === null) throw new Error('spirit part must be indexed');
  return mergeGeometries(parts)!;
}

// ------------------------------------------------------------------ shaders

const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uWind;
  attribute float aPart;
  attribute vec4 aSpawn; // where he died (xyz) and when he rises (w)
  attribute vec4 aKit;   // seed 0..1, gesture, size, hat
  attribute float aGirth;
  varying vec3 vLocal; varying vec3 vN; varying vec3 vV; varying float vUp; varying float vPart;
  varying float vFade; varying float vMouth; varying float vHappy; varying float vBlink; varying float vSeed; varying float vViewZ;

  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
  float ease3(float x) { return x * x * (3.0 - 2.0 * x); }

  void main() {
    float age = uTime - aSpawn.w;
    if (age < 0.0 || age > ${SPIRIT_LIFE.toFixed(2)}) {
      // not yet risen, or long gone: folded away behind the near plane
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      return;
    }
    float seed = aKit.x;
    float gest = aKit.y;
    float hat = aKit.w;
    float part = aPart;
    vec3 p = position;
    vec3 n = normal;
    vLocal = position;
    vPart = part;
    vSeed = seed;

    // a hat he never wore folds away inside his head
    if (part > 0.5 && part < 9.5 && abs(part - hat) > 0.1) p = vec3(0.0, 1.6, 0.0);

    // ---- the performance
    float k = clamp(age / 0.75, 0.0, 1.0) - 1.0;
    float pop = 1.0 + 2.70158 * k * k * k + 1.70158 * k * k; // easeOutBack: up out of him with a little overshoot
    float asc = max(age - 2.75, 0.0);                        // and away
    float lift = smoothstep(0.0, 0.7, asc);
    float gw = smoothstep(0.85, 1.15, age) * (1.0 - smoothstep(2.35, 2.75, age));
    float isWave = 1.0 - step(0.5, gest);
    float isTwirl = step(0.5, gest) * (1.0 - step(1.5, gest));
    float isTip = step(1.5, gest) * (1.0 - step(2.5, gest));
    float isBoo = step(2.5, gest);
    float ph = seed * 37.0;

    // arms float loose, then do the gesture, then trail as he goes
    float rest = 0.32 + 0.14 * sin(age * 2.6 + ph);
    float tipK = sin(3.14159 * clamp((age - 1.05) / 1.3, 0.0, 1.0));
    float aR = rest, aL = rest + 0.08 * sin(age * 2.3 + ph + 1.0);
    aR = mix(aR, 2.55 + 0.42 * sin(age * 12.0), gw * isWave);
    aL = mix(aL, rest + 0.2, gw * isWave);
    aR = mix(aR, 1.5 + 0.1 * sin(age * 7.0), gw * isTwirl);
    aL = mix(aL, 1.5 + 0.1 * sin(age * 7.0 + 1.5), gw * isTwirl);
    aR = mix(aR, 2.85, tipK * isTip);
    aL = mix(aL, 0.55, tipK * isTip);
    aR = mix(aR, 2.35 + 0.16 * sin(age * 21.0), gw * isBoo);
    aL = mix(aL, 2.35 + 0.16 * sin(age * 21.0 + 2.0), gw * isBoo);
    aR = mix(aR, 0.12, lift);
    aL = mix(aL, 0.12, lift);
    float reach = 0.25 + 0.35 * gw * (isWave + isBoo) + 0.5 * tipK * isTip - 0.35 * lift;

    if (part > 9.5) {
      float isR = step(10.5, part);
      float side = isR * 2.0 - 1.0;
      vec3 piv = vec3(0.29 * side, 1.17, 0.0);
      mat3 A = rotZ(mix(aL, aR, isR) * side) * rotX(-reach);
      p = piv + A * (p - piv);
      n = A * n;
    }

    // the hat: lifted off and tilted in a salute; bandana tails and the knit cap's sock flutter
    if (part > 0.5 && part < 9.5) {
      vec3 hp = vec3(0.0, 1.82, 0.0);
      mat3 H = rotX(0.45 * tipK * isTip) * rotZ(-0.3 * tipK * isTip + 0.06 * sin(age * 3.0 + ph));
      p = hp + H * (p - hp) + vec3(0.06, 0.2, 0.08) * tipK * isTip;
      n = H * n;
      if (abs(part - 2.0) < 0.1 && position.z < -0.27) {
        float f = clamp((1.76 - position.y) * 4.0, 0.0, 1.0);
        p.x += sin(age * 9.0 + position.y * 9.0 + ph) * 0.05 * f;
        p.z -= (0.04 + 0.03 * sin(age * 7.0)) * f;
      }
      if (abs(part - 3.0) < 0.1) {
        float q = max(position.y - 1.9, 0.0);
        float flop = 1.8 + 0.4 * sin(age * 4.0 + ph);
        p.x += q * q * flop * (seed > 0.5 ? 1.0 : -1.0);
        p.y -= q * q * 0.9;
      }
    }

    // the tail: a slow S that ripples down it, curling off to one side at the tip
    if (part < 0.5 && position.y < 1.05) {
      float t = clamp((1.05 - position.y) / 1.25, 0.0, 1.0);
      t *= t;
      float wv = age * 3.3 + ph;
      float curl = seed > 0.5 ? 1.0 : -1.0;
      p.x += (sin(wv + position.y * 3.5) * 0.17 + curl * 0.24 * t) * t;
      p.z += cos(wv * 0.8 + position.y * 2.7) * 0.1 * t - 0.12 * t * (1.0 + lift);
      p.y -= t * (0.15 + asc * 0.45); // drawn out long as he rises
    }

    // his build, a breath, a squash and stretch
    p.xz *= aGirth;
    vec3 c = vec3(0.0, 1.0, 0.0);
    vec3 q = p - c;
    float breath = sin(age * 3.1 + ph);
    q.y *= 1.0 + 0.045 * breath + 0.1 * lift + 0.12 * gw * isBoo;
    q.xz *= 1.0 - 0.03 * breath - 0.14 * lift + 0.08 * gw * isBoo;

    vec3 toCam = cameraPosition - aSpawn.xyz;
    float dist = length(toCam);
    // small on a wide sea view, true to life up close
    float size = aKit.z * mix(0.2, 1.0, pop) * clamp(dist / 50.0, 1.0, 2.0);
    q *= size;

    // turned to look up at you; a twirl, a bow with the hat, a lunge for the boo
    float tz = abs(toCam.z) < 1e-3 ? 1e-3 : toCam.z;
    float yaw = atan(toCam.x, tz) + (seed - 0.5) * 0.7 + 6.28318 * ease3(clamp((age - 1.0) / 1.3, 0.0, 1.0)) * isTwirl;
    float elev = atan(toCam.y, max(length(toCam.xz), 1e-3));
    float lean = clamp(elev, 0.0, 1.25) * 0.55;
    float bow = 0.28 * tipK * isTip + 0.12 * gw * isBoo;
    float roll = sin(age * 1.9 + ph) * 0.1 + sin(age * 0.7 + ph * 2.0) * 0.05;
    mat3 R = rotY(yaw) * rotX(bow - lean) * rotZ(roll);

    float rise = -1.2 + 2.55 * pop + asc * asc * 0.55 + asc * 0.9 + 0.1 * sin(age * 2.4 + ph) * (1.0 - lift);
    vec3 drift = vec3(cos(age * 1.6 + ph), 0.0, sin(age * 1.6 + ph)) * asc * 0.35 + vec3(uWind.x, 0.0, uWind.y) * asc * asc * 0.25;
    vec3 fwd = rotY(yaw) * vec3(0.0, 0.0, 1.0);
    vec3 world = aSpawn.xyz + vec3(0.0, rise, 0.0) + drift + fwd * 0.35 * gw * isBoo + R * q;

    vec3 nw = R * n;
    vUp = nw.y;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vN = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
    vV = normalize(-mv.xyz);
    vViewZ = -mv.z;

    vFade = smoothstep(0.0, 0.3, age) * (1.0 - smoothstep(${(SPIRIT_LIFE - 1.6).toFixed(2)}, ${SPIRIT_LIFE.toFixed(2)}, age));
    // a dash of a smile; wide open for the boo; an "ooh" as he goes
    vMouth = clamp(0.12 + 0.88 * gw * isBoo + 0.3 * lift + 0.25 * (1.0 - smoothstep(0.3, 0.9, age)), 0.0, 1.0);
    vHappy = gw * isWave + tipK * isTip;
    float bl = fract(age * 0.42 + seed * 3.0);
    vBlink = 1.0 - 0.85 * smoothstep(0.0, 0.04, bl) * (1.0 - smoothstep(0.06, 0.1, bl)) * (1.0 - isBoo * gw);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uNoiseTex; uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
  uniform vec3 uLight; uniform float uNight; uniform vec3 uFogColor; uniform vec2 uFogRange; uniform float uTime;
  varying vec3 vLocal; varying vec3 vN; varying vec3 vV; varying float vUp; varying float vPart;
  varying float vFade; varying float vMouth; varying float vHappy; varying float vBlink; varying float vSeed; varying float vViewZ;
  float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vV);
    float rim = 1.0 - abs(dot(N, V));
    float rim2 = rim * rim;
    vec3 G = vec3(0.3, 1.0, 0.66);
    // ectoplasm swirling up through him
    vec2 su = vLocal.xy * vec2(0.9, 0.5) + vec2(vSeed * 3.7 + vLocal.z * 0.4, -uTime * 0.21);
    float sw = texture(uNoiseTex, su).g * 0.6 + texture(uNoiseTex, su * 1.9 + vec2(-uTime * 0.04, -uTime * 0.3)).a * 0.4;
    float body = vPart < 0.5 ? 1.0 : 0.0;
    float hat = vPart > 0.5 && vPart < 9.5 ? 1.0 : 0.0;
    float a = 0.1 + rim2 * 0.7 + (sw - 0.5) * 0.3 + hat * 0.2;
    // lit from above like a lantern held over him: bright crown, cool underside
    vec3 col = mix(vec3(0.6, 1.0, 0.82), G * 0.8, rim * 0.9) * (0.6 + 0.4 * clamp(vUp * 0.5 + 0.5, 0.0, 1.0));
    col = mix(col, vec3(0.2, 0.62, 0.5), hat * 0.6);
    col += G * smoothstep(0.62, 0.9, sw) * 0.35;
    // the tail thins to nothing
    a *= body > 0.5 ? smoothstep(-0.2, 0.55, vLocal.y) : 1.0;

    // the face: two hollow eyes with a glint (happy crescents for a wave or a bow) and a little mouth
    float face = 0.0;
    float glint = 0.0;
    if (body > 0.5 && vLocal.z > 0.06 && vLocal.y > 1.38) {
      vec2 e = vec2(abs(vLocal.x), vLocal.y) - vec2(0.105, 1.655);
      float d = length(e / vec2(0.05, 0.07 * vBlink));
      float oval = 1.0 - smoothstep(0.82, 1.0, d);
      float rd = abs(length((e + vec2(0.0, 0.035)) / 0.055) - 0.8);
      float cres = (1.0 - smoothstep(0.12, 0.24, rd)) * step(-0.035, e.y);
      face = mix(oval, cres, vHappy);
      glint = (1.0 - smoothstep(0.0, 0.016, length(e - vec2(0.018, 0.026)))) * (1.0 - vHappy) * step(0.5, vBlink);
      vec2 m = vec2(vLocal.x, vLocal.y - 1.5);
      m.y -= 5.0 * m.x * m.x * (1.0 - vMouth); // corners up in a smile
      float mo = length(m / vec2(0.045 + 0.02 * vMouth, 0.011 + 0.058 * vMouth));
      face = max(face, 1.0 - smoothstep(0.8, 1.0, mo));
    }
    col = mix(col, vec3(0.01, 0.06, 0.045), face);
    a = mix(a, 0.92, face);
    col = mix(col, vec3(1.6, 2.0, 1.85), glint);
    a = max(a, glint);

    // glows by itself, but sits in the scene's light: dimmer at dusk, never blinding at night
    float lum = dot(uLight, vec3(0.3, 0.55, 0.15));
    vec3 lit = mix(vec3(1.0), uLight, 0.7) + 0.14;
    vec3 glow = G * (0.18 + rim2 * 2.0 + rim2 * rim2 * 2.4) * (0.45 + 0.55 * clamp(lum, 0.0, 1.0)) * (1.0 + uNight * 0.6) * (1.0 - face);
    col *= lit;

    float fog = smoothstep(uFogRange.x, uFogRange.y, vViewZ) * 0.8;
    col = mix(col, uFogColor, fog);
    glow *= 1.0 - fog;

    vec2 suv = gl_FragCoord.xy / uResolution;
    float sz = linearDepth(texture(uSceneDepth, suv).r);
    float soft = clamp((sz - vViewZ) * 1.6, 0.0, 1.0);
    a = clamp(a, 0.0, 1.0) * vFade * soft;
    glow *= vFade * soft;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a + glow, a);
  }
`;

// ------------------------------------------------------------------ the system

interface Soul {
  slot: number;
  x: number;
  y: number;
  z: number;
  t0: number;
  size: number;
  moteT: number;
  sounded: boolean;
  poofed: boolean;
}

export interface SpiritFrom {
  x: number;
  y: number;
  z: number;
  /** crewModel HAT id */
  hat: number;
  girth?: number;
  height?: number;
  /** Seconds before he rises (a sailor falling to the sand rises once he's down). */
  delay?: number;
  /** Bigger for a captain. */
  boss?: boolean;
}

export class Spirits {
  readonly mesh: THREE.Mesh;
  /** Told when a ghost first shows, to give him a voice. */
  onRise: ((at: THREE.Vector3) => void) | null = null;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly aSpawn: THREE.InstancedBufferAttribute;
  private readonly aKit: THREE.InstancedBufferAttribute;
  private readonly aGirth: THREE.InstancedBufferAttribute;
  private readonly live: Soul[] = [];
  private readonly free: number[] = [];
  private used = 0;
  private lastGesture = -1;
  private readonly _v = new THREE.Vector3();
  readonly uniforms = {
    uNoiseTex: { value: getSharedTextures().noise as THREE.Texture },
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
    uTime: globalUniforms.uTime,
    uWind: globalUniforms.uWind,
    uLight: globalUniforms.uLight,
    uNight: globalUniforms.uNight,
    uFogColor: globalUniforms.uFogColor,
    uFogRange: globalUniforms.uFogRange,
  };

  constructor(private readonly cap: number, private readonly particles: Particles) {
    const fig = buildFigure();
    const g = new THREE.InstancedBufferGeometry();
    g.index = fig.index;
    g.setAttribute('position', fig.getAttribute('position'));
    g.setAttribute('normal', fig.getAttribute('normal'));
    g.setAttribute('aPart', fig.getAttribute('aPart'));
    // every slot starts long dead, deep below the sea
    const spawn = new Float32Array(cap * 4);
    for (let i = 0; i < cap; i++) spawn.set([0, -1000, 0, -1e4], i * 4);
    this.aSpawn = new THREE.InstancedBufferAttribute(spawn, 4).setUsage(THREE.DynamicDrawUsage);
    this.aKit = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aGirth = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSpawn', this.aSpawn);
    g.setAttribute('aKit', this.aKit);
    g.setAttribute('aGirth', this.aGirth);
    g.instanceCount = 0;
    this.geo = g;
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    this.mesh.visible = false;
  }

  /** How many are in the air right now. */
  get count() {
    return this.live.length;
  }

  /** A ghost leaves a body. Returns false when the sky is already full of them. */
  release(f: SpiritFrom, now: number) {
    const slot = this.free.pop();
    if (slot === undefined) return false;
    const t0 = now + (f.delay ?? 0);
    // never the same trick twice running, and only a hat-wearer tips his hat
    let gest = Math.floor(Math.random() * 4);
    if (gest === GESTURE.tip && f.hat === HAT.none) gest = GESTURE.wave;
    if (gest === this.lastGesture) gest = (gest + 1 + Math.floor(Math.random() * 2)) % 4;
    if (gest === GESTURE.tip && f.hat === HAT.none) gest = GESTURE.twirl;
    this.lastGesture = gest;
    const size = (f.height ?? 1) * (f.boss ? 1.12 : 1) * (0.94 + Math.random() * 0.12);
    // shipmates who drowned together each find a patch of sky of their own
    let x = f.x + (Math.random() - 0.5) * 0.8;
    let z = f.z + (Math.random() - 0.5) * 0.8;
    for (let pass = 0; pass < 3; pass++) {
      for (const o of this.live) {
        if (Math.abs(o.t0 - t0) > 2.2) continue;
        const dx = x - o.x;
        const dz = z - o.z;
        const d = Math.hypot(dx, dz);
        if (d >= SPACING) continue;
        const a = d > 1e-3 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
        x = o.x + Math.cos(a) * SPACING;
        z = o.z + Math.sin(a) * SPACING;
      }
    }
    this.aSpawn.setXYZW(slot, x, f.y, z, t0);
    this.aKit.setXYZW(slot, Math.random(), gest, size, f.hat);
    this.aGirth.setX(slot, f.girth ?? 1);
    for (const a of [this.aSpawn, this.aKit, this.aGirth]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.cap * a.itemSize);
      a.needsUpdate = true;
    }
    this.used = Math.max(this.used, slot + 1);
    this.geo.instanceCount = this.used;
    this.mesh.visible = true;
    this.live.push({ slot, x, y: f.y, z, t0, size, moteT: 0, sounded: false, poofed: false });
    return true;
  }

  /** Motes, voices and the last puff; frees each ghost once he's gone. */
  update(dt: number, now: number) {
    const P = this.particles;
    const v = this._v;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i];
      const age = now - s.t0;
      if (age < 0) continue;
      if (age > SPIRIT_LIFE) {
        this.free.push(s.slot);
        this.live.splice(i, 1);
        continue;
      }
      const mid = s.y + riseOf(age);
      if (!s.sounded) {
        s.sounded = true;
        v.set(s.x, s.y + 0.4, s.z);
        this.onRise?.(v);
        // a ring of green motes and a breath of pale mist as he comes free
        for (let k = 0; k < 10; k++) {
          const th = (k / 10) * Math.PI * 2 + Math.random() * 0.4;
          const sp = 1.2 + Math.random() * 1.2;
          P.emit({
            x: s.x, y: s.y + 0.3, z: s.z, vx: Math.cos(th) * sp, vy: 0.8 + Math.random() * 1.4, vz: Math.sin(th) * sp,
            life: 0.7 + Math.random() * 0.5, size: 0.2 + Math.random() * 0.12, sizeEnd: 0.05, color: [0.7, 3.4, 2.0], colorEnd: [0.15, 1.1, 0.6], drag: 2.2, grav: -0.6, kind: 0, fadeIn: 0.05,
          }, true);
        }
        for (let k = 0; k < 3; k++) {
          P.emit({
            x: s.x + (Math.random() - 0.5) * 0.8, y: s.y + 0.3 + Math.random() * 0.6, z: s.z + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 0.6, vy: 0.5 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.6,
            life: 1.8 + Math.random() * 0.8, size: 0.9, sizeEnd: 2.6, color: [0.62, 0.86, 0.78], colorEnd: [0.8, 0.92, 0.88], alpha: 0.26, drag: 0.8, grav: -0.2, spin: (Math.random() - 0.5) * 0.6, kind: 1, fadeIn: 0.2,
          });
        }
      }
      // a thin trail of motes off his tail
      s.moteT -= dt;
      if (s.moteT <= 0 && age < SPIRIT_LIFE - 0.6) {
        s.moteT = 0.07 + Math.random() * 0.06;
        P.emit({
          x: s.x + (Math.random() - 0.5) * 0.35, y: mid - 0.85 * s.size + (Math.random() - 0.5) * 0.3, z: s.z + (Math.random() - 0.5) * 0.35,
          vx: (Math.random() - 0.5) * 0.4, vy: 0.2 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.4,
          life: 0.8 + Math.random() * 0.6, size: 0.12 + Math.random() * 0.1, sizeEnd: 0.02, color: [0.55, 2.7, 1.6], colorEnd: [0.1, 0.8, 0.45], drag: 1.4, grav: -0.25, kind: 0, fadeIn: 0.08,
        }, true);
      }
      // ...and as the last of him thins away, a soft pop of sparkles
      if (!s.poofed && age > SPIRIT_LIFE - 0.75) {
        s.poofed = true;
        for (let k = 0; k < 12; k++) {
          const th = Math.random() * Math.PI * 2;
          const up = Math.random() * 2 - 0.4;
          const sp = 1.4 + Math.random() * 1.6;
          P.emit({
            x: s.x, y: mid + 0.4 * s.size, z: s.z, vx: Math.cos(th) * sp, vy: up * sp * 0.6, vz: Math.sin(th) * sp,
            life: 0.5 + Math.random() * 0.45, size: 0.16 + Math.random() * 0.1, sizeEnd: 0.03, color: [1.4, 3.6, 2.6], colorEnd: [0.2, 1.2, 0.7], drag: 2.6, grav: 0.4, kind: 0, fadeIn: 0.02,
          }, true);
        }
      }
    }
    if (!this.live.length) {
      this.used = 0;
      this.geo.instanceCount = 0;
    }
    this.mesh.visible = this.live.length > 0;
  }

  clear() {
    for (const s of this.live) {
      this.free.push(s.slot);
      this.aSpawn.setW(s.slot, -1e4);
    }
    this.aSpawn.clearUpdateRanges();
    this.aSpawn.addUpdateRange(0, this.cap * 4);
    this.aSpawn.needsUpdate = true;
    this.live.length = 0;
    this.used = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
