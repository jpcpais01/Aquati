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

/**
 * freezeStatic, and the per-frame walk doesn't even descend into the subtree:
 * frozen children cost nothing to compose, but the scene forces every frame's
 * walk, so each of a couple of thousand of them (every plant batch, every
 * ground chunk) still multiplied its matrix again. Only for a subtree sitting
 * straight in a scene that never moves. It is walked again once after a child
 * is added or removed directly under `root`, or after
 * `root.matrixWorldNeedsUpdate` is set; anything moved deeper inside updates
 * itself with its own `updateMatrixWorld(true)`.
 */
export function sealStatic(root: THREE.Object3D) {
  freezeStatic(root);
  const walk = root.updateMatrixWorld;
  let kids = root.children.length;
  root.updateMatrixWorld = function () {
    if (this.children.length === kids && !this.matrixWorldNeedsUpdate) return;
    kids = this.children.length;
    walk.call(this, true);
  };
}
