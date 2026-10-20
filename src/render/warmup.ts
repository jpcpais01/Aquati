import * as THREE from 'three';

// renderer.compile() only links programs. Browsers finish the real work later:
// the first draw blocks until the driver has compiled the shader for that exact
// pipeline state (blend, cull, vertex layout, render target). Anything that
// first appears mid-battle (debris, flames, the target ring, a fresh ship's
// textures) would stall the frame it shows up in. So behind the loading
// screen everything is drawn once for real: every object forced visible and
// unculled, every empty instanced/ranged batch given one element, through the
// actual frame pipeline (shadow pass included). Then it is all put back.

interface Saved {
  obj: THREE.Object3D;
  visible: boolean;
  culled: boolean;
  count?: number;
  instances?: number;
  range?: number;
}

/** Forces every object under `scenes` drawable (see above); returns what to put back. */
function force(scenes: THREE.Object3D[]) {
  const saved: Saved[] = [];
  for (const scene of scenes) {
    scene.traverse((o) => {
      const m = o as THREE.Mesh & THREE.InstancedMesh;
      const s: Saved = { obj: o, visible: o.visible, culled: o.frustumCulled };
      o.visible = true;
      o.frustumCulled = false;
      if (m.isInstancedMesh && m.count === 0) {
        s.count = 0;
        m.count = 1;
      }
      const g = m.geometry as THREE.InstancedBufferGeometry | undefined;
      if (g) {
        if (g.isInstancedBufferGeometry && g.instanceCount === 0) {
          s.instances = 0;
          g.instanceCount = 1;
        }
        if (g.drawRange.count === 0) {
          s.range = 0;
          g.drawRange.count = 3;
        }
      }
      saved.push(s);
    });
  }
  return saved;
}

function restore(saved: Saved[]) {
  for (const s of saved) {
    s.obj.visible = s.visible;
    s.obj.frustumCulled = s.culled;
    const m = s.obj as THREE.Mesh & THREE.InstancedMesh;
    if (s.count !== undefined) m.count = s.count;
    const g = m.geometry as THREE.InstancedBufferGeometry | undefined;
    if (g && s.instances !== undefined) g.instanceCount = s.instances;
    if (g && s.range !== undefined) g.drawRange.count = s.range;
  }
}

export function warmDraw(scenes: THREE.Object3D[], draw: () => void) {
  const saved = force(scenes);
  try {
    draw();
  } finally {
    restore(saved);
  }
}

/**
 * warmDraw spread over many frames, for the loading screen. Drawing the whole
 * world at once hands the driver every first-draw compile in one go: a frame
 * that can block the GPU process for seconds on a phone, and with it the
 * page's own compositing (the loading animation froze). Here every object is
 * forced drawable exactly as warmDraw does, but each frame only a slice of the
 * materials is switched on (`material.visible`, which three honours in every
 * pass, shadow map included). Every object is still drawn with every one of its
 * materials through the real pipeline, so the guarantee is the same as one big
 * warmDraw, only paced. The slice grows while frames keep their rhythm and
 * shrinks when one runs long.
 */
export async function warmDrawSliced(
  scenes: THREE.Object3D[],
  draw: () => void,
  frame: () => Promise<void>,
  onProgress?: (done: number) => void,
  /** Materials sharing a key (their compiled program) go in the same slice: one compile covers them all. */
  groupOf?: (m: THREE.Material) => unknown,
) {
  const saved = force(scenes);
  const mats: THREE.Material[] = [];
  const seen = new Set<THREE.Material>();
  for (const s of saved) {
    const mat = (s.obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) continue;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      // a material switched off by design stays off, as in warmDraw
      if (m && m.visible && !seen.has(m)) {
        seen.add(m);
        mats.push(m);
      }
    }
  }
  try {
    for (const m of mats) m.visible = false;
    // the frame's own passes first, with none of the world: twice, as the first
    // makes the shadow map the water then switches on. A third, by then cheap,
    // times a frame with nothing new in it: the pace the slices are held to.
    draw();
    await frame();
    draw();
    await frame();
    let t = performance.now();
    draw();
    await frame();
    const base = Math.min(50, performance.now() - t);
    const keyed = new Map<unknown, THREE.Material[]>();
    for (const m of mats) {
      const k = groupOf?.(m) ?? m;
      const g = keyed.get(k);
      if (g) g.push(m);
      else keyed.set(k, [m]);
    }
    const groups = [...keyed.values()];
    let n = 2;
    for (let i = 0; i < groups.length; ) {
      t = performance.now();
      const batch = groups.slice(i, i + n).flat();
      for (const m of batch) m.visible = true;
      try {
        draw();
      } finally {
        for (const m of batch) m.visible = false;
      }
      i += n;
      onProgress?.(Math.min(1, i / groups.length));
      await frame();
      const dt = performance.now() - t;
      if (dt < base * 1.4 + 4) n = Math.ceil(n * 1.6);
      else if (dt > base * 2.5 + 10) n = Math.max(1, n >> 1);
    }
  } finally {
    for (const m of mats) m.visible = true;
    restore(saved);
  }
}

/**
 * Uploads a model's vertex buffers ahead of its first real draw, one mesh a
 * frame. A pirate hull is megabytes of geometry, built a slice at a time in
 * the shipyard; left alone, the frame she first sails into view (or into the
 * shadow map) would push all of it to the GPU at once. Each step draws one
 * stand-in sharing a mesh's geometry into a 1x1 target with a plain material,
 * which is all three needs to upload it. The geometry is then simply resident.
 */
export class BufferPreloader {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private proxy = new THREE.Mesh(undefined, undefined);
  private queue: THREE.BufferGeometry[] = [];

  constructor(private renderer: THREE.WebGLRenderer) {
    this.scene.overrideMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
    this.proxy.frustumCulled = false;
    this.scene.add(this.proxy);
  }

  /** Queues every geometry under `root`. */
  add(root: THREE.Object3D) {
    root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g && !this.queue.includes(g)) this.queue.push(g);
    });
  }

  /** Forgets whatever of `root` is still queued (its ship is gone). */
  drop(root: THREE.Object3D) {
    root.traverse((o) => {
      const i = this.queue.indexOf((o as THREE.Mesh).geometry);
      if (i >= 0) this.queue.splice(i, 1);
    });
  }

  /** Whether any of `root`'s geometries still wait their turn. */
  holds(root: THREE.Object3D) {
    let any = false;
    root.traverse((o) => {
      if (!any && this.queue.includes((o as THREE.Mesh).geometry)) any = true;
    });
    return any;
  }

  /** Geometries still waiting to be uploaded. */
  get pending() {
    return this.queue.length;
  }

  /** Uploads the next queued geometry; `force` empties the queue (behind the loading screen). */
  step(force = false) {
    do {
      const g = this.queue.shift();
      if (!g) return;
      if (!g.getAttribute('position')) continue;
      const r = this.renderer;
      const prev = r.getRenderTarget();
      this.proxy.geometry = g;
      r.setRenderTarget(this.target);
      r.render(this.scene, this.camera);
      r.setRenderTarget(prev);
    } while (force);
  }
}
