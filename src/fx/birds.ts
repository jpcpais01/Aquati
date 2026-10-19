import * as THREE from 'three';
import { globalUniforms } from '../render/environment';
import { Island } from '../world/terrain';

// Gulls wheeling over the islands: flapping and gliding in the vertex shader,
// lazy circles on the CPU. Tiny cost, lots of life.

interface Gull {
  cx: number;
  cz: number;
  r: number;
  h: number;
  a: number;
  w: number;
  bob: number;
}

function gullGeometry(): THREE.BufferGeometry {
  // body + two wings with a crooked elbow, wingtips darker
  const p: number[] = [];
  const c: number[] = [];
  const white = [0.95, 0.95, 0.93];
  const grey = [0.55, 0.57, 0.6];
  const tip = [0.12, 0.12, 0.14];
  const tri = (a: number[], b: number[], d: number[], ca: number[], cb: number[], cd: number[]) => {
    p.push(...a, ...b, ...d);
    c.push(...ca, ...cb, ...cd);
  };
  // body (a flat diamond seen from above + keel)
  tri([0, 0, 0.55], [0.12, 0, 0], [-0.12, 0, 0], white, white, white);
  tri([0.12, 0, 0], [0, 0, -0.5], [-0.12, 0, 0], white, white, white);
  tri([0, 0, 0.55], [-0.12, 0, 0], [0, -0.1, 0], white, white, white);
  tri([0, 0, 0.55], [0, -0.1, 0], [0.12, 0, 0], white, white, white);
  for (const s of [1, -1]) {
    const root0 = [0.1 * s, 0, 0.18];
    const root1 = [0.1 * s, 0, -0.12];
    const elbow0 = [0.65 * s, 0.08, 0.2];
    const elbow1 = [0.6 * s, 0.08, -0.12];
    const tipP = [1.25 * s, 0, -0.18];
    tri(root0, elbow0, root1, white, grey, white);
    tri(root1, elbow0, elbow1, white, grey, grey);
    tri(elbow0, tipP, elbow1, grey, tip, grey);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

export class Birds {
  readonly mesh: THREE.InstancedMesh;
  private gulls: Gull[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private s = new THREE.Vector3(1.4, 1.4, 1.4);
  private v = new THREE.Vector3();

  constructor(islands: Island[], count: number) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = globalUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
            float glide = smoothstep(-0.2, 0.4, sin(uTime * 0.45 + ph * 3.0));
            float flap = sin(uTime * 9.0 + ph) * glide + (1.0 - glide) * 0.12;
            float span = abs(position.x);
            transformed.y += flap * span * 0.55 + span * span * 0.08;
          }`,
        );
    };
    this.mesh = new THREE.InstancedMesh(gullGeometry(), mat, count);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      const isl = islands[i % islands.length];
      this.gulls.push({
        cx: isl.x + (Math.random() - 0.5) * isl.r,
        cz: isl.z + (Math.random() - 0.5) * isl.r,
        r: 20 + Math.random() * isl.r * 0.9,
        h: Math.max(14, isl.peak * 0.8) + 6 + Math.random() * 16,
        a: Math.random() * Math.PI * 2,
        w: (0.18 + Math.random() * 0.16) * (Math.random() < 0.5 ? -1 : 1),
        bob: Math.random() * 10,
      });
    }
  }

  update(dt: number, time: number) {
    this.gulls.forEach((g, i) => {
      g.a += (g.w * dt * 22) / Math.max(g.r, 10);
      const x = g.cx + Math.cos(g.a) * g.r;
      const z = g.cz + Math.sin(g.a) * g.r;
      const y = g.h + Math.sin(time * 0.6 + g.bob) * 2;
      // tangent heading of the circle
      const dir = g.w > 0 ? 1 : -1;
      const tx = -Math.sin(g.a) * dir;
      const tz = Math.cos(g.a) * dir;
      this.e.set(0, Math.atan2(tx, tz), -dir * 0.35);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(x, y, z), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
