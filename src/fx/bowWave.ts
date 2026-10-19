import * as THREE from 'three';
import { globalUniforms } from '../render/environment';
import { shoreUniforms } from '../world/shore';
import type { HullShape } from '../ships/shipModel';

// The bow wave: a curling sheet of white water that climbs the stem where the
// hull shoulders the sea aside, peels back along both bows and lands on the
// surface as a ribbon of lace. One small mesh per ship, drawn in the water
// pass over the ocean. The sheet's shape lives in the vertex shader and
// scales with speed; its whitewater uses the same bubble web as the surf, so
// foam on the bow reads as the same stuff as foam on the beach.

const NS = 30; // stations along the hull
const NV = 9; // rows across the sheet
const T_END = 0.52; // the sheet has died down by midships

const SWEEP = 0.42; // how far the sheet peels back as it flares out
const tmp = new THREE.Vector3();

// the water pass has no depth of its own for hulls: test against the opaque pass by hand
const sceneUniforms = {
  uSceneDepth: { value: null as THREE.Texture | null },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uCamNearFar: { value: new THREE.Vector2(1, 1000) },
};

export function setBowWaveScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
  sceneUniforms.uSceneDepth.value = depth;
  sceneUniforms.uResolution.value.set(w, h);
  sceneUniforms.uCamNearFar.value.set(cam.near, cam.far);
}

export class BowWave {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private flow = 0;
  private amp = 0;
  /** Hull waterline per station: [z, half-width] (local). */
  private stations: [number, number][] = [];

  constructor(shape: HullShape, readonly length: number, readonly beam: number) {
    // where the stem meets the water: the forefoot rises clear of it near the very tip
    let tStem = 1;
    for (let t = 1; t > 0.8; t -= 0.002) {
      if (shape.bottom(t) < -0.02) {
        tStem = t;
        break;
      }
    }
    const pos: number[] = [];
    const aP: number[] = [];
    const aDir: number[] = [];
    const idx: number[] = [];
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      for (let i = 0; i < NS; i++) {
        const s = i / (NS - 1);
        const t = tStem - (tStem - T_END) * Math.pow(s, 1.25);
        const z = shape.z(t);
        const hw = Math.max(0.04, shape.halfWidthAtY(t, 0));
        if (side === 1) this.stations.push([z, hw]);
        // outward along the waterline normal, swept aft so the sheet peels back
        const t2 = Math.min(1, t + 0.01);
        const dz = shape.z(t2) - z;
        const dw = Math.max(0.04, shape.halfWidthAtY(t2, 0)) - hw;
        let nx = dz;
        let nz = -dw;
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl;
        nz /= nl;
        nz -= SWEEP;
        const dl = Math.hypot(nx, nz);
        for (let j = 0; j < NV; j++) {
          const v = j / (NV - 1);
          pos.push(side * (hw - 0.06), 0, z);
          aP.push(s, v, side, i * 0.37 + side * 3.1);
          aDir.push((side * nx) / dl, nz / dl);
        }
      }
      for (let i = 0; i < NS - 1; i++) {
        for (let j = 0; j < NV - 1; j++) {
          const a = base + i * NV + j;
          const b = a + NV;
          if (side === 1) idx.push(a, b, a + 1, a + 1, b, b + 1);
          else idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 4));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(aDir, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, length * 0.25), length * 0.6 + 4);

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: globalUniforms.uTime,
        uSunDir: globalUniforms.uSunDir,
        uSunColor: globalUniforms.uSunColor,
        uSkyZenith: globalUniforms.uSkyZenith,
        uFogColor: globalUniforms.uFogColor,
        uFogRange: globalUniforms.uFogRange,
        uFoamTex: shoreUniforms.uFoamTex,
        ...sceneUniforms,
        uAmp: { value: 0 },
        uFlow: { value: 0 },
        uBeam: { value: beam },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uAmp; uniform float uBeam;
        attribute vec4 aP; attribute vec2 aDir;
        varying vec3 vW; varying vec2 vSV; varying float vReach; varying float vEnv; varying float vViewZ;
        ${GLSL_BOW}
        void main() {
          float s = aP.x, v = aP.y;
          vec3 off = bowSheet(s, v, aP.z, aP.w, aDir, uAmp, uBeam, uTime, vEnv, vReach);
          vec4 wp = modelMatrix * vec4(position + off, 1.0);
          vW = wp.xyz;
          vSV = vec2(s, v);
          vec4 mv = viewMatrix * wp;
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uFlow; uniform float uAmp; uniform float uBeam;
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyZenith;
        uniform vec3 uFogColor; uniform vec2 uFogRange;
        uniform sampler2D uFoamTex;
        uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        varying vec3 vW; varying vec2 vSV; varying float vReach; varying float vEnv; varying float vViewZ;
        void main() {
          // hidden behind the hull (the far bow), and feathered where it meets the planking
          float sceneZ = linearDepth(texture(uSceneDepth, gl_FragCoord.xy / uResolution).r);
          if (sceneZ < vViewZ - 0.02) discard;
          float s = vSV.x, v = vSV.y;
          // the whitewater streams aft along the hull as fast as she sails, and spreads outward
          vec2 fuv = vec2((1.0 - s) * 1.25 + uFlow * 0.12, v * vReach * 0.13 + s * 0.4);
          float web = texture(uFoamTex, fuv).r * 0.72 + texture(uFoamTex, fuv * vec2(1.7, 1.4) + vec2(0.31, 0.57) + vec2(uFlow * 0.07, 0.0)).b * 0.28;
          // solid white where it tumbles over the crest, opening into lace as it runs out and aft
          float cover = (0.98 - v * 0.62) * (0.55 + 0.45 * vEnv) - s * 0.25;
          float w = 0.09 + fwidth(web) * 0.6;
          float foam = smoothstep(1.0 - cover - w, 1.0 - cover + w, web);
          // the glassy face under the foam: a thin turquoise film catching the light
          vec3 N = normalize(cross(dFdx(vW), dFdy(vW)));
          if (N.y < 0.0) N = -N;
          float ndl = max(dot(N, uSunDir), 0.0);
          vec3 light = uSunColor * (0.25 + 0.75 * ndl) * 0.42 + uSkyZenith * 0.55;
          vec3 foamCol = vec3(0.96, 0.98, 1.0) * light;
          vec3 faceCol = vec3(0.06, 0.34, 0.36) * light * 0.9 + uSunColor * pow(ndl, 24.0) * 0.12;
          float face = 0.42 * (1.0 - v * 0.6) * vEnv;
          float edge = smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.75, 1.0, s)) * (1.0 - smoothstep(0.82, 1.0, v));
          float a = max(foam * 0.96, face) * edge * smoothstep(0.02, 0.12, uAmp) * clamp((sceneZ - vViewZ) * 4.0, 0.0, 1.0);
          if (a < 0.004) discard;
          vec3 col = mix(faceCol, foamCol, foam);
          col = mix(col, uFogColor, smoothstep(uFogRange.x, uFogRange.y, vViewZ) * 0.85);
          gl_FragColor = vec4(col * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  /** Follows the hull (yaw and pitch, no roll, at the water line); amp 0..~1.2 scales the sheet with speed. */
  update(x: number, y: number, z: number, heading: number, pitch: number, amp: number, speed: number, dt: number) {
    this.amp += (amp - this.amp) * Math.min(1, dt * 3);
    this.flow += speed * dt;
    this.mat.uniforms.uAmp.value = this.amp;
    this.mat.uniforms.uFlow.value = this.flow;
    this.mesh.visible = this.amp > 0.02;
    const e = new THREE.Euler(pitch, heading, 0, 'YXZ');
    this.mesh.matrix.compose(tmp.set(x, y, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1));
    this.mesh.matrixWorldNeedsUpdate = true;
  }

  /**
   * Where the sheet lands on the water at station s (0 stem .. 1 aft) on a side:
   * ship-local [x, z]. Mirrors bowSheet() so foam is laid where the sheet runs out.
   */
  landing(s: number, side: number): [number, number] {
    const i = Math.min(NS - 1, Math.round(s * (NS - 1)));
    const [z, hw] = this.stations[i];
    const reach = sheetReach(s, this.amp, this.beam);
    return [side * (hw + reach * 0.92), z - reach * SWEEP * 0.92];
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

function sheetReach(s: number, amp: number, beam: number) {
  return (0.25 + 1.9 * Math.pow(s, 0.8)) * (0.35 + 0.65 * Math.min(amp, 1.2)) * Math.sqrt(beam / 6.2);
}

// Sheet shape, shared by name with sheetReach() above (keep them in step).
const GLSL_BOW = /* glsl */ `
vec3 bowSheet(float s, float v, float side, float seed, vec2 dir, float amp, float beam, float t, out float env, out float reach) {
  float k = sqrt(beam / 6.2);
  // climbs the stem, peaks a little aft of it, and subsides toward the shoulder
  env = smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.18, 1.0, s) * 0.85);
  // the crest heaves and flickers as the bow meets each swell
  float flick = 1.0 + 0.16 * sin(t * 6.3 + seed) * sin(t * 2.7 + seed * 1.7) + 0.08 * sin(t * 13.0 + seed * 3.0);
  float h = (0.18 + 0.7 * amp) * k * env * flick;
  reach = (0.25 + 1.9 * pow(s, 0.8)) * (0.35 + 0.65 * min(amp, 1.2)) * k;
  // across: rises off the hull, rolls over into a curling lip, then runs out flat onto the sea
  float lip = sin(3.14159 * clamp(v * 1.25, 0.0, 1.0));
  float y = h * pow(1.0 - v, 1.4) * (1.0 + 0.45 * lip) + h * 0.06;
  float out_ = reach * v + h * 0.35 * lip * smoothstep(0.15, 0.6, v);
  return vec3(dir.x * out_, y, dir.y * out_);
}
`;
