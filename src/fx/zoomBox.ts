import * as THREE from 'three';

// The world-locked tile that rain and spindrift wrap around the view grows and
// shrinks with the zoom. Every particle's spot in it is scaled by its size, so
// resizing it under particles in flight flung them all somewhere else: in a
// battle the camera pulls in and out with the enemy every frame and the spray
// stuttered from place to place. Instead a particle keeps the size it was born
// with for its whole cycle: the tile changes size only at an instant
// (uBoxAt), particles born before it keep the old size (uBoxPrev), and the
// next change waits until every one of those has run out.

export const GLSL_ZOOM_BOX = /* glsl */ `
  uniform vec2 uBoxPrev; uniform float uBoxAt;
  // the tile size a particle on cycle n (of length cyc, offset by its seed) was born into
  vec2 bornBox(vec2 box, float n, float cyc, float seed) {
    return (n - seed) * cyc < uBoxAt ? uBoxPrev : box;
  }
`;

export class ZoomBox {
  readonly uBoxPrev = { value: new THREE.Vector2() };
  readonly uBoxAt = { value: -1e9 };
  private ready = false;

  /** maxCycle: the longest particle cycle (s), so no particle outlives two sizes. */
  constructor(private readonly maxCycle: number) {}

  /**
   * Moves `box` (the live uniform) toward `want` without disturbing particles in flight.
   * `now` is the shaders' uTime.
   */
  update(box: THREE.Vector2, want: THREE.Vector2, now: number) {
    if (!this.ready) {
      this.ready = true;
      box.copy(want);
      this.uBoxPrev.value.copy(want);
      return;
    }
    // (the clock restarts with each voyage)
    if (now < this.uBoxAt.value) this.uBoxAt.value = -1e9;
    if (box.equals(want) || now - this.uBoxAt.value < this.maxCycle) return;
    this.uBoxPrev.value.copy(box);
    box.copy(want);
    this.uBoxAt.value = now;
  }
}
