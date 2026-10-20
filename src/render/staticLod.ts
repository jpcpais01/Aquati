import * as THREE from 'three';
import { patchInfo } from './environment';
import { disposeLevel, simplifiedLevels, type LodJob } from './lod';
import { shadowOnly } from './passCull';

// Distance levels for the built world that never moves: towns, forts, camps.
// Each mesh gets two simplified levels (index-only, see lod.ts) and, if it
// casts a shadow, a welded coarse stand-in that casts it instead. Each frame a
// mesh shows the lightest level whose error stays under SUB_PX pixels where
// it stands.

/** Deviation (m) of the two levels. */
const LEVELS = [0.025, 0.09];
const SHADOW: LodJob = { error: 0.08, weld: true, prune: true, permissive: true };
/** How far a level's error may show on screen (CSS px). */
const SUB_PX = 0.6;

interface Entry {
  mesh: THREE.Mesh;
  levels: (THREE.BufferGeometry | null)[];
  level: number;
  proxy: THREE.Mesh | null;
  /** World-space middle and radius of the mesh. */
  c: THREE.Vector3;
  r: number;
}

const _s = new THREE.Sphere();

export class StaticLod {
  private entries: Entry[] = [];

  /** Every plain mesh under `root` (static from now on) gets its levels, once the worker has them. */
  add(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(m.material)) return;
      // anything that bends in its vertex shader from a flat rest pose would fold away
      const opts = patchInfo.get(m.material)?.opts;
      if (opts?.sail || opts?.flag) return;
      if (m.userData.lodProxy || m.userData.noLod) return;
      meshes.push(m);
    });
    for (const mesh of meshes) {
      const full = mesh.geometry;
      const jobs: LodJob[] = LEVELS.map((error) => ({ error, prune: true, permissive: true }));
      const shadows = mesh.castShadow;
      if (shadows) jobs.push(SHADOW);
      void simplifiedLevels(full, jobs).then(([near, far, shadow]) => {
        // swapped out or taken away while the worker was busy
        if (mesh.geometry !== full || !mesh.parent) {
          for (const g of [near, far, shadow]) if (g) disposeLevel(g);
          return;
        }
        if (!near && !far && !shadow) return;
        let proxy: THREE.Mesh | null = null;
        if (shadow && shadows) {
          proxy = shadowOnly(new THREE.Mesh(shadow, mesh.material));
          proxy.customDepthMaterial = mesh.customDepthMaterial;
          proxy.position.copy(mesh.position);
          proxy.quaternion.copy(mesh.quaternion);
          proxy.scale.copy(mesh.scale);
          proxy.receiveShadow = false;
          proxy.userData.lodProxy = true;
          proxy.matrixAutoUpdate = mesh.matrixAutoUpdate;
          proxy.updateMatrix();
          mesh.parent.add(proxy);
          proxy.updateMatrixWorld(true);
          mesh.castShadow = false;
        }
        if (!full.boundingSphere) full.computeBoundingSphere();
        _s.copy(full.boundingSphere!).applyMatrix4(mesh.matrixWorld);
        this.entries.push({ mesh, levels: [full, near, far], level: 0, proxy, c: _s.center.clone(), r: _s.radius });
      });
    }
  }

  update(camera: THREE.PerspectiveCamera) {
    const pxK = camera.projectionMatrix.elements[5] * 0.5 * (typeof innerHeight === 'number' ? innerHeight : 1080);
    const cam = camera.position;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      const m = e.mesh;
      if (!m.parent || (m.geometry !== e.levels[e.level] && e.levels.indexOf(m.geometry) < 0)) {
        // someone else has taken the mesh over (or away): hand its shadow back
        if (e.proxy) {
          e.proxy.removeFromParent();
          m.castShadow = true;
        }
        this.entries.splice(i, 1);
        continue;
      }
      if (e.proxy) {
        e.proxy.visible = m.visible;
        // a swinging bell or a raised gangplank takes its stand-in with it
        if (m.matrixAutoUpdate) {
          e.proxy.position.copy(m.position);
          e.proxy.quaternion.copy(m.quaternion);
          e.proxy.scale.copy(m.scale);
        }
      }
      if (!m.visible) continue;
      const pxPerM = pxK / Math.max(1, cam.distanceTo(e.c) - e.r);
      let level = 0;
      for (let k = LEVELS.length; k >= 1; k--) {
        const lean = k === e.level ? 1.1 : 0.95;
        if (e.levels[k] && LEVELS[k - 1] * pxPerM < SUB_PX * lean) {
          level = k;
          break;
        }
      }
      if (level !== e.level) {
        e.level = level;
        m.geometry = e.levels[level]!;
      }
    }
  }
}

/** The one registry for the whole world (towns, forts and camps add themselves). */
export const staticLod = new StaticLod();
