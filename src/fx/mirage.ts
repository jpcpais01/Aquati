import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { globalUniforms } from '../render/environment';

// A mirage on a scorching noon: a little island that isn't there. A dune of
// pale sand, three leaning palms and a tiny domed shrine float a few metres
// over the sea on a band of shimmering sky, with their own image hanging
// upside down beneath them, the way the hot air over the water bends the
// light. The whole thing breathes: it towers up and squashes down, its layers
// of air slide past each other, it shimmers in rising bands and its edges
// run with a faint pearly rainbow. Sail into it and it parts round the hull
// like a curtain and frays away. One mesh, built once at load (so the warm-up
// draws its shader), moved wherever the heat conjures the next one.

/** The island's radius in its own units; the mesh is scaled up to `size` metres. */
const R = 1;

function part(g: THREE.BufferGeometry, kind: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  ng.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(ng.getAttribute('position').count).fill(kind), 1));
  return ng;
}

function buildIsland(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // the dune: a low, lopsided mound
  const prof = [
    [0, 0.2], [0.22, 0.2], [0.45, 0.16], [0.68, 0.1], [0.86, 0.045], [1.0, 0.012], [1.06, 0],
  ].map(([x, y]) => new THREE.Vector2(x * R, y * R));
  const dune = new THREE.LatheGeometry(prof, 28);
  const dp = dune.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i);
    const z = dp.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.16 * Math.sin(a * 2 + 0.6) + 0.07 * Math.sin(a * 5 + 1.9);
    dp.setXYZ(i, x * k * 1.15, dp.getY(i) * (1 + 0.35 * Math.sin(a + 0.4)), z * k * 0.9);
  }
  dune.computeVertexNormals();
  parts.push(part(dune, 0));

  // the palms, leaning out from the crown of the dune
  const palms = [
    [-0.18, 0.05, 0.62, 0.5, -0.5],
    [0.05, -0.12, 0.74, -0.35, 0.3],
    [0.24, 0.16, 0.52, 0.9, 0.45],
  ];
  for (const [px, pz, hgt, lean, yaw] of palms) {
    const trunk = new THREE.CylinderGeometry(0.014, 0.026, hgt, 6, 6, true);
    trunk.translate(0, hgt / 2, 0);
    const tp = trunk.getAttribute('position') as THREE.BufferAttribute;
    const dx = Math.sin(yaw) * lean;
    const dz = Math.cos(yaw) * lean;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i);
      const b = (y / hgt) ** 2 * 0.28;
      tp.setXYZ(i, tp.getX(i) + dx * b + px, y + 0.17, tp.getZ(i) + dz * b + pz);
    }
    trunk.computeVertexNormals();
    parts.push(part(trunk, 1));
    const top = new THREE.Vector3(px + dx * 0.28, hgt + 0.17, pz + dz * 0.28);
    for (let f = 0; f < 7; f++) {
      const len = 0.24 + (f % 3) * 0.03;
      const frond = new THREE.PlaneGeometry(len, 0.07, 6, 1);
      frond.translate(len / 2, 0, 0);
      const fp = frond.getAttribute('position') as THREE.BufferAttribute;
      const a = (f / 7) * Math.PI * 2 + yaw;
      for (let i = 0; i < fp.count; i++) {
        const u = fp.getX(i) / len;
        const w = fp.getY(i) * (1 - u * 0.85);
        // arching up from the crown and drooping toward the tip
        const r = fp.getX(i);
        const y = Math.sin(u * 2.4) * 0.05 - u * u * 0.13;
        fp.setXYZ(i, top.x + Math.cos(a) * r - Math.sin(a) * w, top.y + y, top.z + Math.sin(a) * r + Math.cos(a) * w);
      }
      frond.computeVertexNormals();
      parts.push(part(frond, 2));
    }
  }

  // the shrine: four slim columns under a gilded dome
  const sx = -0.42;
  const sz = -0.2;
  for (let c = 0; c < 4; c++) {
    const a = (c / 4) * Math.PI * 2 + 0.4;
    const col = new THREE.CylinderGeometry(0.018, 0.022, 0.2, 6, 1, true);
    col.translate(sx + Math.cos(a) * 0.075, 0.15 + 0.1, sz + Math.sin(a) * 0.075);
    parts.push(part(col, 3));
  }
  const dome = new THREE.SphereGeometry(0.11, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 1.25, 1);
  dome.translate(sx, 0.35, sz);
  parts.push(part(dome, 4));
  const spire = new THREE.ConeGeometry(0.018, 0.12, 6, 1, true);
  spire.translate(sx, 0.55, sz);
  parts.push(part(spire, 4));

  const up = mergeGeometries(parts)!;
  // and the same again hanging upside down beneath it, the inferior mirage
  const down = up.clone();
  const n = up.getAttribute('position').count;
  up.setAttribute('aFlip', new THREE.BufferAttribute(new Float32Array(n), 1));
  down.setAttribute('aFlip', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  const all = mergeGeometries([up, down])!;
  all.computeBoundingSphere();
  return all;
}

export class Mirage {
  readonly mesh: THREE.Mesh;
  /** True while one is out there. */
  active = false;
  x = 0;
  z = 0;
  /** Its radius on the water (m). */
  size = 24;
  private t = 0;
  private fade = 0;
  private passed = false;
  private uniforms = {
    // x how much of it shows, y how hard its air swims, z how far it has risen, w its seed
    uMir: { value: new THREE.Vector4() },
    // the ship sailing through it (xz), and the radius it parts round her
    uPart: { value: new THREE.Vector3(0, 0, 1) },
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
  };
  /** Called once as the ship sails into it, at the ship. */
  onEnter: () => void = () => {};

  constructor() {
    const g = globalUniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.uniforms,
        uTime: g.uTime,
        uLight: g.uLight,
        uSunDir: g.uSunDir,
        uSkyHorizon: g.uSkyHorizon,
        uSkyZenith: g.uSkyZenith,
        uNoiseTex: g.uNoiseTex,
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec4 uMir;
        attribute float aPart; attribute float aFlip;
        varying vec3 vN; varying vec3 vWorld; varying float vPart; varying float vFlip; varying float vH;
        void main() {
          vec3 p = position;
          float s = uMir.w;
          // it breathes: towering up and squashing down in slow, uneven heaves
          float stretch = 1.0 + 0.26 * sin(uTime * 0.55 + s) + 0.12 * sin(uTime * 1.6 + p.x * 4.0 + s * 2.0);
          p.y *= stretch * uMir.z;
          // layers of hot air slide past each other, more the higher they lie
          float lay = 0.25 + p.y * 1.4;
          p.x += sin(p.y * 15.0 - uTime * 3.1 + s) * 0.028 * lay * uMir.y;
          p.z += cos(p.y * 11.0 - uTime * 2.6 + s * 1.7) * 0.02 * lay * uMir.y;
          vH = p.y;
          vec3 n = normal;
          if (aFlip > 0.5) { p.y = -p.y * 0.62; n.y = -n.y; }
          // the whole vision floats on a band of shimmering sky
          p.y += 0.5 * uMir.z + 0.03;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          vN = normalize(mat3(modelMatrix) * n);
          vPart = aPart;
          vFlip = aFlip;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec4 uMir; uniform vec3 uPart;
        uniform vec3 uLight; uniform vec3 uSunDir; uniform vec3 uSkyHorizon; uniform vec3 uSkyZenith;
        uniform sampler2D uNoiseTex;
        uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        varying vec3 vN; varying vec3 vWorld; varying float vPart; varying float vFlip; varying float vH;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          vec3 base = vPart < 0.5 ? vec3(0.96, 0.84, 0.64)
            : vPart < 1.5 ? vec3(0.78, 0.62, 0.5)
            : vPart < 2.5 ? vec3(0.42, 0.86, 0.68)
            : vPart < 3.5 ? vec3(1.0, 0.97, 0.94) : vec3(1.0, 0.82, 0.45);
          vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
          vec3 V = normalize(cameraPosition - vWorld);
          float lit = 0.62 + 0.38 * max(dot(N, uSunDir), 0.0);
          // washed out with the hot sky, as a thing seen through miles of air
          // (the sky's hue, not its glare: a bleached noon horizon would burn it white)
          vec3 hz = uSkyHorizon / max(max(uSkyHorizon.r, uSkyHorizon.g), max(uSkyHorizon.b, 1e-3)) * 0.8;
          vec3 col = mix(base * lit * 0.85, hz, 0.28 + 0.2 * vFlip);
          // its edges run with a pearly rainbow
          float fr = 1.0 - abs(dot(N, V));
          vec3 pearl = 0.5 + 0.5 * cos(6.2832 * (fr * 0.8 + vH * 0.6 + uTime * 0.07 + vec3(0.0, 0.33, 0.67)));
          col += pearl * fr * fr * 0.35;
          col *= uLight;
          // it shimmers in rising bands, and frays away at the top and the bottom
          vec4 nz = texture(uNoiseTex, vWorld.xz * 0.05 + vec2(0.0, uTime * 0.03));
          float band = 0.5 + 0.5 * sin(vWorld.y * 1.1 - uTime * 4.2 + nz.r * 6.0);
          float a = mix(0.3, 1.0, band) * (vFlip > 0.5 ? 0.42 : 0.72);
          // the sand fades to nothing at its rim, so it lies on the sea as a glow, not a lid
          if (vPart < 0.5) a *= smoothstep(0.0, 0.14, vH) * 0.55;
          float fray = smoothstep(0.15, 0.55, nz.g + (1.0 - abs(vH) * 1.1) * 0.5);
          a *= fray;
          // the seam where the island meets its own image glows with the sky
          float seam = exp(-abs(vH) * 9.0);
          col += hz * seam * 0.35 * uLight;
          // a ship sailing in parts it like a curtain
          float dShip = length(vWorld.xz - uPart.xy);
          a *= smoothstep(uPart.z * 0.25, uPart.z, dShip + (nz.b - 0.5) * uPart.z * 0.6);
          a *= uMir.x;
          vec2 suv = gl_FragCoord.xy / uResolution;
          a *= clamp((linearDepth(texture(uSceneDepth, suv).r) - linearDepth(gl_FragCoord.z)) * 0.5, 0.0, 1.0);
          if (a < 0.004) discard;
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.mesh = new THREE.Mesh(buildIsland(), mat);
    this.mesh.renderOrder = 13;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Conjures one at (x, z), `size` metres across the dune. */
  spawn(x: number, z: number, size: number, yaw: number) {
    this.active = true;
    this.x = x;
    this.z = z;
    this.size = size;
    this.t = 0;
    this.fade = 0;
    this.passed = false;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = yaw;
    this.mesh.scale.setScalar(size);
    this.mesh.updateMatrixWorld();
    this.uniforms.uMir.value.w = Math.random() * 50;
    this.mesh.visible = true;
  }

  /** `heat` 0..1 keeps it alive; the ship at (sx, sz) parts it and, once through, lets it go. */
  update(dt: number, sx: number, sz: number, heat: number) {
    if (!this.active) return;
    this.t += dt;
    const d = Math.hypot(sx - this.x, sz - this.z);
    if (!this.passed && d < this.size * 0.7) {
      this.passed = true;
      this.onEnter();
    }
    // it lingers a minute at most, and frays away once you're through it
    const gone = this.t > 75 || heat < 0.35 || (this.passed && d > this.size * 2.2);
    const want = gone ? 0 : 1;
    this.fade += (want - this.fade) * (1 - Math.exp(-dt / (want ? 2.2 : 1.6)));
    if (gone && this.fade < 0.01) {
      this.active = false;
      this.mesh.visible = false;
      return;
    }
    const near = THREE.MathUtils.smoothstep(d, this.size * 0.6, this.size * 3);
    const u = this.uniforms;
    u.uMir.value.x = this.fade * (0.55 + 0.45 * near);
    u.uMir.value.y = 1 + 1.6 * (1 - near) + (1 - this.fade) * 2;
    u.uMir.value.z = 0.2 + 0.8 * THREE.MathUtils.smootherstep(this.fade, 0, 1);
    u.uPart.value.set(sx, sz, 16);
  }

  clear() {
    this.active = false;
    this.mesh.visible = false;
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
