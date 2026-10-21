import * as THREE from 'three';

// Automatic levels of detail. A simplified mesh here is only a new index
// buffer over the original vertices (the simplifier keeps a subset of them),
// so every attribute, the vertex paint, the damage skin and the GPU upload are
// shared: a level costs one small index buffer, and swapping levels never
// touches the vertex data. The simplifying itself runs in a worker, and
// identical meshes (every ship of a class) reuse the first one's result.

export interface LodJob {
  /** Largest allowed deviation from the original surface, in the geometry's own units (metres). */
  error: number;
  /**
   * Treat vertices that share a position as one: the hard edges and seams of
   * faceted parts stop holding the mesh together, so it can fold far further.
   * Normals and paint come from whichever copy survives: for the shadow pass,
   * which only needs the shape.
   */
  weld?: boolean;
  /** Drop whole little parts that fall under the error (bolts, pins, blocks). */
  prune?: boolean;
  /**
   * Let edges collapse across seams in the vertex data (plank ends, painted
   * strakes): the shape still holds to `error`, but a seam's shading can
   * bleed a little, so only for levels seen small.
   */
  permissive?: boolean;
  /** Keep the mesh's open edges exactly where they are (tiles that must meet their neighbours). */
  lockBorder?: boolean;
  /**
   * Also hold the vertex data to the error: one weight per float of the
   * request's attributes (see simplifiedLevels' `attrs`), in metres of error
   * per unit the value strays.
   */
  attrWeights?: number[];
  /** Vertices with a height (y) in this band are never moved or merged. */
  lockY?: [number, number];
  /** Give up (null) when more than this share of the triangles would stay (default 0.75). */
  keep?: number;
}

export interface LodRequest {
  id: number;
  positions: Float32Array;
  index: Uint32Array;
  jobs: LodJob[];
  /** Per-vertex floats the attrWeights jobs hold to (packed, one stride per vertex). */
  attrs?: Float32Array;
}

export interface LodReply {
  id: number;
  levels: (Uint32Array | null)[];
}

let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const waiting = new Map<number, (levels: (Uint32Array | null)[]) => void>();
/** Results by mesh content, so the second ship of a class costs nothing. */
const cache = new Map<string, Promise<(Uint32Array | null)[]>>();
const CACHE_MAX = 96;

/**
 * Where every finished level goes to have its index uploaded ahead of its
 * first draw (the game's BufferPreloader). Levels arrive from the worker well
 * after the loading screen's warm-up, and a zoom-out swaps dozens of chunks,
 * towns and hulls onto levels never drawn before in the same few frames: left
 * alone, each one's buffer upload and vertex-array setup would land in those
 * frames, all at once.
 */
export const lodUploads: { sink: ((g: THREE.BufferGeometry) => void) | null } = { sink: null };

/** Starts the simplifier worker early, so it's warm by the time the first ship is built. */
export function initLod() {
  if (worker || failed) return;
  try {
    worker = new Worker(new URL('./lodWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<LodReply>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(e.data.levels);
    };
    worker.onerror = () => {
      // no levels then: every mesh just keeps drawing in full
      failed = true;
      worker?.terminate();
      worker = null;
      for (const done of waiting.values()) done([]);
      waiting.clear();
    };
  } catch {
    failed = true;
  }
}

/** FNV-1a over the raw bytes, as a cache key for a mesh's shape. */
function hash(a: Uint32Array, h = 0x811c9dc5) {
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 0x01000193);
  return h >>> 0;
}

/**
 * Copies of `geo` drawing the same vertices through simplified indices, one
 * per job, each null where the simplifier isn't available or can't save at
 * least a quarter of the triangles.
 */
export async function simplifiedLevels(geo: THREE.BufferGeometry, jobs: LodJob[], attrs?: string[], minTris = 200): Promise<(THREE.BufferGeometry | null)[]> {
  const none = jobs.map(() => null);
  initLod();
  if (!worker) return none;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || (pos as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || pos.itemSize !== 3) return none;
  if (!(pos.array instanceof Float32Array)) return none;
  const n = pos.count;
  let idx: Uint32Array;
  if (geo.index) idx = Uint32Array.from(geo.index.array as ArrayLike<number>);
  else {
    idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
  }
  const start = Math.max(0, geo.drawRange.start);
  const count = Math.min(idx.length - start, geo.drawRange.count);
  if (start > 0 || count < idx.length) idx = idx.slice(start, start + count);
  if (idx.length < minTris * 3) return none;
  const positions = (pos.array as Float32Array).slice(0, n * 3);
  let packed: Float32Array | undefined;
  if (attrs) {
    // the named attributes, every component, packed vertex by vertex
    const list = attrs.map((a) => geo.getAttribute(a));
    const stride = list.reduce((t, a) => t + a.itemSize, 0);
    packed = new Float32Array(n * stride);
    for (let v = 0, o = 0; v < n; v++) {
      for (const a of list) for (let c = 0; c < a.itemSize; c++) packed[o++] = a.getComponent(v, c);
    }
  }
  let key = `${n}:${hash(new Uint32Array(positions.buffer), hash(idx))}:${JSON.stringify(jobs)}`;
  if (packed) key += `:${hash(new Uint32Array(packed.buffer))}`;
  let job = cache.get(key);
  if (!job) {
    const w = worker;
    job = new Promise<(Uint32Array | null)[]>((resolve) => {
      const id = nextId++;
      waiting.set(id, resolve);
      const req: LodRequest = { id, positions, index: idx, jobs, attrs: packed };
      w.postMessage(req, packed ? [positions.buffer, idx.buffer, packed.buffer] : [positions.buffer, idx.buffer]);
    });
    cache.set(key, job);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  }
  const levels = await job;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  if (!geo.boundingBox) geo.computeBoundingBox();
  const made = jobs.map((_, i) => {
    const out = levels[i];
    if (!out) return null;
    const g = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(geo.attributes)) g.setAttribute(name, a);
    g.morphAttributes = geo.morphAttributes;
    // the cached array may serve other ships too: each level gets its own copy
    g.setIndex(new THREE.BufferAttribute(n < 65536 ? Uint16Array.from(out) : out.slice(), 1));
    g.boundingSphere = geo.boundingSphere!.clone();
    g.boundingBox = geo.boundingBox!.clone();
    g.userData.lodOf = geo;
    return g;
  });
  // queued now, uploaded a few a frame later: by then the caller has finished
  // with them (a terrain level gets its skirt), and a level thrown away first
  // drops out of the queue when it's disposed
  for (const g of made) if (g) lodUploads.sink?.(g);
  return made;
}

/**
 * Disposes only what a level owns (its index) and never the shared vertex
 * buffers, which the full mesh is still drawing from.
 */
export function disposeLevel(g: THREE.BufferGeometry) {
  // three frees every attribute of a disposed geometry, shared or not: detach
  // the shared ones first so only the index goes
  const own = g.index;
  for (const name of Object.keys(g.attributes)) g.deleteAttribute(name);
  g.morphAttributes = {};
  g.setIndex(own);
  g.dispose();
}
