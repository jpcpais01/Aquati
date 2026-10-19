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

export function warmDraw(scenes: THREE.Object3D[], draw: () => void) {
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
  try {
    draw();
  } finally {
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
