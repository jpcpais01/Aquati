import * as THREE from 'three';

// The frame's view, for systems that put their own far-off objects away
// before three walks the scene. Every hidden object drops out of all three
// per-frame walks (matrices, the camera's culling, the shadow pass's), where
// three's own culling still visits it twice to find it isn't drawn.

const _pv = new THREE.Matrix4();

class ViewCull {
  /** Set while the loading screen draws everything once: nothing is put away. */
  off = false;
  /** The camera's frustum this frame. */
  readonly frustum = new THREE.Frustum();
  /** The sun's shadow map: a square straight down (centre x, z; half size). */
  private sx = 0;
  private sz = 0;
  private sr = Infinity;
  /** Where a point's shadow lands per metre of its height (away from the sun). */
  private kx = 0;
  private kz = 0;
  private kl = 0;

  /** Called once a frame, after the camera and the shadow map have been placed. */
  set(camera: THREE.Camera, shadowC: THREE.Vector2, shadowR: number, shadowK: THREE.Vector2) {
    camera.updateMatrixWorld();
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(_pv);
    this.sx = shadowC.x;
    this.sz = shadowC.y;
    this.sr = shadowR;
    this.kx = shadowK.x;
    this.kz = shadowK.y;
    this.kl = Math.hypot(shadowK.x, shadowK.y);
  }

  /** Could a world-space sphere show on screen? (`pad` widens the test, m.) */
  sees(c: THREE.Vector3, r: number, pad = 0) {
    if (this.off) return true;
    for (const pl of this.frustum.planes) {
      if (pl.normal.dot(c) + pl.constant < -r - pad) return false;
    }
    return true;
  }

  /** Could a world-space sphere land in the shadow map (and so cast into the view)? */
  shades(c: THREE.Vector3, r: number, pad = 0) {
    if (this.off) return true;
    // its shadow slides off downwind of it, the higher the further
    const x = c.x - this.kx * c.y;
    const z = c.z - this.kz * c.y;
    const reach = this.sr + r * (1 + this.kl) + pad;
    return Math.abs(x - this.sx) < reach && Math.abs(z - this.sz) < reach;
  }
}

export const viewCull = new ViewCull();
