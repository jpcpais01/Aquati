import * as THREE from 'three';

// three recomputes every object's matrix on every render call, hidden or not:
// a couple of thousand compose-and-multiply steps a frame for islands, plants
// and towns that never move. These two helpers take the still parts of the
// world out of that walk.

/**
 * Bakes the subtree's matrices once and stops updating them. Only for things
 * that are never moved after they're built (move one later and call
 * `updateMatrix()` + `updateMatrixWorld(true)` on it yourself).
 */
export function freezeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    o.matrixAutoUpdate = false;
  });
}

/**
 * While `obj` is hidden its whole subtree skips the per-frame matrix walk (it
 * isn't drawn, and getWorldPosition() still works: it updates its own chain).
 * The first walk after it shows again brings everything back up to date.
 */
export function skipWhenHidden(obj: THREE.Object3D) {
  const walk = obj.updateMatrixWorld;
  let stale = false;
  obj.updateMatrixWorld = function (force?: boolean) {
    if (!this.visible) {
      stale = true;
      return;
    }
    walk.call(this, force || stale);
    stale = false;
  };
}
