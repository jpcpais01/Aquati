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
