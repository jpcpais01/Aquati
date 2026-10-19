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
