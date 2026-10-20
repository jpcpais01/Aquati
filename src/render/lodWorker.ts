// Simplifies meshes off the main thread: a hull's planking takes the
// simplifier tens of milliseconds, which would hitch any frame it landed in.
import { MeshoptSimplifier as M, type SimplifierFlags } from 'meshoptimizer';
import type { LodJob, LodReply, LodRequest } from './lod';

self.onmessage = async (e: MessageEvent<LodRequest>) => {
  const { id, positions, index, jobs } = e.data;
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
      const [r] = M.simplify(idx, positions, 3, 0, j.error, flags);
      return r.length > index.length * 0.75 ? null : r;
    }
  } catch {
    while (out.length < jobs.length) out.push(null);
  }
  const reply: LodReply = { id, levels: out };
  (self as unknown as Worker).postMessage(reply, out.filter((r): r is Uint32Array => !!r).map((r) => r.buffer));
};
