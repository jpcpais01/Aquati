// Simplifies meshes off the main thread: a hull's planking takes the
// simplifier tens of milliseconds, which would hitch any frame it landed in.
import { MeshoptSimplifier as M, type SimplifierFlags } from 'meshoptimizer';
import type { LodJob, LodReply, LodRequest } from './lod';

self.onmessage = async (e: MessageEvent<LodRequest>) => {
  const { id, positions, index, jobs, attrs } = e.data;
  const out: (Uint32Array | null)[] = [];
  try {
    await M.ready;
    let welded: Uint32Array | null = null;
    for (const j of jobs) out.push(level(j));
    function level(j: LodJob): Uint32Array | null {
      let idx = index;
      if (j.weld) {
        if (!welded) {
          const remap = M.generatePositionRemap(positions, 3);
          welded = index.map((i) => remap[i]);
        }
        idx = welded;
      }
      const flags: SimplifierFlags[] = ['ErrorAbsolute'];
      if (j.prune) flags.push('Prune');
      if (j.permissive) flags.push('Permissive');
      if (j.lockBorder) flags.push('LockBorder');
      let lock: Uint8Array | null = null;
      if (j.lockY) {
        // vertices in this band of heights stay put (a shoreline stays where the sea meets it)
        lock = new Uint8Array(positions.length / 3);
        for (let v = 0; v < lock.length; v++) {
          const y = positions[v * 3 + 1];
          lock[v] = y >= j.lockY[0] && y <= j.lockY[1] ? 1 : 0;
        }
      }
      let r: Uint32Array;
      if (j.attrWeights && attrs) [r] = M.simplifyWithAttributes(idx, positions, 3, attrs, j.attrWeights.length, j.attrWeights, lock, 0, j.error, flags);
      else if (lock) [r] = M.simplifyWithAttributes(idx, positions, 3, new Float32Array(lock.length), 1, [0], lock, 0, j.error, flags);
      else [r] = M.simplify(idx, positions, 3, 0, j.error, flags);
      return r.length > index.length * (j.keep ?? 0.75) ? null : r;
    }
  } catch {
    while (out.length < jobs.length) out.push(null);
  }
  const reply: LodReply = { id, levels: out };
  (self as unknown as Worker).postMessage(reply, out.filter((r): r is Uint32Array => !!r).map((r) => r.buffer));
};
