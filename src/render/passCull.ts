import * as THREE from 'three';

// Some meshes only belong in one of the two passes that see the world: a
// coarse stand-in that only casts a shadow, or a detailed mesh whose shadow a
// stand-in casts for it. three draws the shadow map with the main camera's
// layers, so layers can't tell the passes apart; the frustum test can.

let inShadowPass = false;

/** Marks the shadow-map pass so `shadowOnly` meshes know which pass is asking. */
export function installPassCulling(renderer: THREE.WebGLRenderer) {
  const sm = renderer.shadowMap;
  const draw = sm.render;
  sm.render = function (...args: Parameters<typeof draw>) {
    inShadowPass = true;
    try {
      draw.apply(sm, args);
    } finally {
      inShadowPass = false;
    }
  };
}

/** The mesh is drawn into shadow maps only (unless culling is off, as in the warm-up draw). */
export function shadowOnly<T extends THREE.Mesh>(mesh: T): T {
  const test = mesh.intersectsFrustum.bind(mesh);
  mesh.intersectsFrustum = (f: THREE.Frustum) => inShadowPass && test(f);
  mesh.castShadow = true;
  return mesh;
}

// three draws every shadow caster without a depth material of its own with
// one shared MeshDepthMaterial. Its program depends on whether the mesh is
// instanced, so each time the shadow pass goes from a plain mesh to an
// instanced one (or back) three looks the program up afresh: parameters,
// cache key and all, several times a frame. Instanced casters get their own
// shared depth material instead, so neither one ever changes program.
// (Set through the prototype: three's constructor assigns the field, which
// lands in this setter; a mesh's own depth material still wins.)
const instancedDepth = new THREE.MeshDepthMaterial();
type DepthHolder = THREE.InstancedMesh & { _aqDepth?: THREE.Material };
Object.defineProperty(THREE.InstancedMesh.prototype, 'customDepthMaterial', {
  configurable: true,
  get(this: DepthHolder) {
    if (this._aqDepth) return this._aqDepth;
    const m = this.material as THREE.Material & { alphaMap?: unknown; displacementMap?: unknown; map?: unknown; alphaTest: number };
    // the cases three gives a depth variant of their own (alpha-tested cut-outs and the like)
    if (Array.isArray(m) || m.alphaToCoverage || (m.alphaTest > 0 && (m.map || m.alphaMap)) || m.displacementMap || m.clippingPlanes?.length) return undefined;
    return instancedDepth;
  },
  set(this: DepthHolder, v: THREE.Material | undefined) {
    this._aqDepth = v;
  },
});

// Depth materials only ever draw shadow maps, and three's shadow map reads the
// depth buffer alone: the colour each one wrote alongside (a whole RGBA target
// of it, 64 MB a frame at Ultra's 4096) was never looked at. They write depth only.
Object.defineProperty(THREE.MeshDepthMaterial.prototype, 'colorWrite', {
  configurable: true,
  get: () => false,
  set: () => {},
});

// Pools of particles, splashes, lanterns and the like stay in the scene while
// empty (no instances, or nothing in their draw range), and three still sets
// up a full draw for each: program, uniforms, buffers, then a call that draws
// nothing. A fifth of a calm frame's draws were these. They're dropped before
// any of that, except while the loading screen draws everything once.
export const emptyDraws = { skip: false };

export function skipEmptyDraws(renderer: THREE.WebGLRenderer) {
  const draw = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (emptyDraws.skip && !(material as THREE.MeshBasicMaterial).wireframe) {
      if ((object as THREE.InstancedMesh).isInstancedMesh && (object as THREE.InstancedMesh).count === 0) return;
      if ((geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry && (geometry as THREE.InstancedBufferGeometry).instanceCount === 0) return;
      const r = geometry.drawRange;
      let start = r.start;
      let end = r.start + r.count;
      if (group) {
        start = Math.max(start, group.start);
        end = Math.min(end, group.start + group.count);
      }
      const n = geometry.index ? geometry.index.count : geometry.attributes.position?.count;
      if (n !== undefined) end = Math.min(end, n);
      if (end <= Math.max(start, 0)) return;
    }
    draw.call(this, camera, scene, geometry, material, object, group);
  };
}
