import * as THREE from 'three';
import { globalUniforms } from './environment';

// Lamps: every light that is painted rather than lit (port lamps, the
// lighthouse, windows, ships' stern lanterns, camp braziers, the glow of a
// cosmetic barrel). The paint is linear HDR tuned for daylight, and after dark
// the grade opens the exposure up by more than twice (see Atmosphere), which
// used to turn a lamp the size of a fist into a white blot the size of a house.
// Here a lamp holds its own brightness through the night instead, shows a hot
// heart where you look straight into the glass with the rim falling away (so
// the bloom draws a halo the lamp's size), and breathes like a flame.

/** How much of its daylight paint a lamp keeps in deep night, before the night exposure lifts it again. */
const NIGHT_KEEP = 0.42;

const LAMP_VERT_PARS = /* glsl */ `
varying float vLampFace;
varying float vLampSeed;`;

const LAMP_VERT = /* glsl */ `
{
  // how squarely this bit of glass faces the eye (no normal: all of it)
  vec3 lampN = normal;
  #ifdef USE_INSTANCING
    lampN = mat3(instanceMatrix) * lampN;
  #endif
  vLampFace = dot(lampN, lampN) > 1e-8 ? abs(dot(normalize(normalMatrix * lampN), normalize(-mvPosition.xyz))) : 1.0;
  // each lamp of a merged town flickers on its own
  vLampSeed = dot(position, vec3(0.83, 1.31, 0.57));
}`;

const LAMP_FRAG_PARS = /* glsl */ `
uniform float uNight;
uniform float uTime;
varying float vLampFace;
varying float vLampSeed;`;

const LAMP_FRAG = /* glsl */ `
{
  float lampDark = smoothstep(0.05, 0.8, uNight);
  float lampHeart = mix(0.5, 1.08, vLampFace * vLampFace);
  float lampBreath = 0.94 + 0.06 * sin(uTime * 8.3 + vLampSeed * 9.0) * sin(uTime * 5.1 + vLampSeed * 4.0);
  diffuseColor.rgb *= mix(1.0, ${NIGHT_KEEP.toFixed(2)} * lampHeart * lampBreath, lampDark);
}`;

/**
 * The lamp material: a MeshBasicMaterial (so everything that looks for one,
 * like a sinking ship putting her lights out, still finds it) whose vertex
 * paint (times `color`) is the lamp's light. Every lamp shares one program.
 */
export function lampMaterial(color: THREE.ColorRepresentation = 0xffffff) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, color });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = globalUniforms.uNight;
    sh.uniforms.uTime = globalUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${LAMP_VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${LAMP_VERT}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${LAMP_FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${LAMP_FRAG}`);
  };
  m.customProgramCacheKey = () => 'aq-lamp';
  return m;
}

// ------------------------------------------------------------------ light on the boards

const POOL_VERT = /* glsl */ `
attribute vec4 aPool;
varying vec2 vPoolD;
varying float vPoolEdge;
varying float vPoolSeed;
void main() {
  // aPool: the lamp's footprint centre (xz), its reach, and how far the boards run seaward
  vPoolD = (position.xz - aPool.xy) / aPool.z;
  vPoolEdge = aPool.w - position.z;
  vPoolSeed = aPool.x * 0.37 + aPool.y * 0.11;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const POOL_FRAG = /* glsl */ `
uniform float uNight;
uniform float uTime;
uniform vec3 uPoolColor;
varying vec2 vPoolD;
varying float vPoolEdge;
varying float vPoolSeed;
void main() {
  float r2 = dot(vPoolD, vPoolD);
  if (r2 > 1.0 || vPoolEdge < 0.0) discard;
  float on = smoothstep(0.12, 0.7, uNight);
  // a lamp's light falls off fast from under it, with a long soft tail
  float a = exp(-r2 * 4.0) * 0.75 + exp(-r2 * 1.4) * 0.25 - 0.25 * exp(-1.4);
  a *= smoothstep(0.0, 0.3, vPoolEdge) * on;
  float breath = 0.93 + 0.07 * sin(uTime * 8.3 + vPoolSeed * 9.0) * sin(uTime * 5.1 + vPoolSeed * 4.0);
  if (a < 0.002) discard;
  gl_FragColor = vec4(uPoolColor * a * breath, 1.0);
}`;

let poolMat: THREE.ShaderMaterial | null = null;

/** The one material every pool of lamplight shares. */
function lampPoolMaterial() {
  return (poolMat ??= new THREE.ShaderMaterial({
    uniforms: {
      uNight: globalUniforms.uNight,
      uTime: globalUniforms.uTime,
      uPoolColor: { value: new THREE.Vector3(0.3, 0.17, 0.065) },
    },
    vertexShader: POOL_VERT,
    fragmentShader: POOL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }));
}

/**
 * Warm pools of lamplight on a quay's boards round each lamp, after dark: one
 * flat mesh in the town's own frame (y up, +z out to sea). `lamps` are the
 * lamps' (x, z) footprints, `y` the boards' height, `edge` the seaward edge
 * of the boards (local z) where the light runs off them.
 */
export function lampPools(lamps: [number, number][], y: number, edge: number, reach = 4.2) {
  const pos: number[] = [];
  const pool: number[] = [];
  const idx: number[] = [];
  lamps.forEach(([x, z], i) => {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      pos.push(x + dx * reach, y, z + dz * reach);
      pool.push(x, z, reach, edge);
    }
    const o = i * 4;
    idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPool', new THREE.Float32BufferAttribute(pool, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, lampPoolMaterial());
  m.name = 'lamp-pools';
  m.castShadow = m.receiveShadow = false;
  m.renderOrder = 2;
  m.userData.noLod = true;
  return m;
}
