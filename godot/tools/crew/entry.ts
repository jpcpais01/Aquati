// Builds the web game's sailor with the web game's own sculpt
// (src/ships/crewModel.ts) at a phone's two detail levels, cuts the two
// lighter ones from the far sculpt with the simplifier just as the web game
// does at load (CrewRenderer), splits each level the web's way into a body and
// one mesh per hat, held prop and bigger extra (bucketOf), and writes it all
// out for the Godot game (src/ships/crew_model.gd). The lighter cuts fold
// their small pieces of kit back into the body (the speck, the cut every crew
// far off is drawn with, and on a phone that is nearly every crew, goes out as
// a single mesh): the shader drops what a sailor doesn't wear, which costs far
// less there than a draw call per piece. Run through tools/crew/bake_crew.mjs.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import {
  BIT, BONE, FLAG, HAT, P, PART, POSE_SIZE, PROP, RIG, TINT, TINT_SLOTS, buildSailorGeometry, bucketOf,
  EL_Y, FM_Y, HIP_X, HIP_Y, HX, KNEE_Y, KN_Y, NECK, PARROT, SH_X, SH_Y, SPINE, S_CHIN_Y, S_EAR, S_EYE, S_JAW, S_MOUTH, S_NOSE,
} from '../../../src/ships/crewModel';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: entry.mjs <godot dir>');

// the phone's sculpts (CrewSystem tier 0) and the simplifier's two cuts of the far one
const NEAR_RES = 0.65;
const FAR_RES = 0.35;
const DISTANT_ERROR = 0.012;
const SPECK_ERROR = 0.045;

interface Geo {
  pos: Float32Array;
  nrm: Float32Array;
  rig: Float32Array;
  col: Float32Array;
  idx: Uint32Array;
}

function geoOf(res: number): Geo {
  const g = buildSailorGeometry(res);
  const arr = (name: string) => g.getAttribute(name).array as Float32Array;
  return { pos: arr('position'), nrm: arr('normal'), rig: arr('aRig'), col: arr('color'), idx: Uint32Array.from(g.index!.array as ArrayLike<number>) };
}

await MeshoptSimplifier.ready;
/** The web's simplifiedLevels(): an index over the same vertices, or null when it can't save a quarter. */
function cut(g: Geo, error: number, flags: ('Prune' | 'Permissive')[]): Uint32Array {
  const [r] = MeshoptSimplifier.simplify(g.idx, g.pos, 3, 0, error, ['ErrorAbsolute', ...flags]);
  if (r.length > g.idx.length * 0.75) throw new Error(`the ${error} m cut keeps ${r.length / 3} of ${g.idx.length / 3} triangles`);
  return r;
}

// ------------------------------------------------------------------ writer

const chunks: Uint8Array[] = [];
let offset = 0;
function push(typed: Float32Array | Int32Array | Uint8Array) {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const at = offset;
  chunks.push(bytes.slice());
  offset += bytes.byteLength;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    chunks.push(new Uint8Array(pad));
    offset += pad;
  }
  return at;
}

/** AO above 1 brightens (gilt, glints): stored over this range in a byte. */
const AO_MAX = 1.25;

/**
 * One mesh of a level: the triangles of `groups`, their vertices packed
 * tight. Positions and smooth normals float32; the rig (bone, tint, group,
 * second bone + weight) float32 x4; ao, part and flutter bytes; indices
 * int32, wound clockwise for Godot (three.js fronts are counter-clockwise).
 */
function batch(g: Geo, idx: Uint32Array, triGroup: Float32Array, groups: Set<number>) {
  const remap = new Map<number, number>();
  const tris: number[] = [];
  for (let t = 0; t < triGroup.length; t++) {
    if (!groups.has(triGroup[t])) continue;
    for (const k of [0, 2, 1]) {
      const v = idx[t * 3 + k];
      let r = remap.get(v);
      if (r === undefined) {
        r = remap.size;
        remap.set(v, r);
      }
      tris.push(r);
    }
  }
  const n = remap.size;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const rig = new Float32Array(n * 4);
  const info = new Uint8Array(n * 4);
  const lo = [1e9, 1e9, 1e9];
  const hi = [-1e9, -1e9, -1e9];
  for (const [v, r] of remap) {
    for (let k = 0; k < 3; k++) {
      pos[r * 3 + k] = g.pos[v * 3 + k];
      nrm[r * 3 + k] = g.nrm[v * 3 + k];
      lo[k] = Math.min(lo[k], g.pos[v * 3 + k]);
      hi[k] = Math.max(hi[k], g.pos[v * 3 + k]);
    }
    for (let k = 0; k < 4; k++) rig[r * 4 + k] = g.rig[v * 4 + k];
    const ao = g.col[v * 3];
    if (ao > AO_MAX || ao < 0) throw new Error(`ao ${ao} out of range`);
    info[r * 4] = Math.round((ao / AO_MAX) * 255);
    info[r * 4 + 1] = Math.round(g.col[v * 3 + 1]);
    info[r * 4 + 2] = Math.round(Math.min(1, g.col[v * 3 + 2]) * 255);
  }
  return {
    groups: [...groups].sort((a, b) => a - b),
    verts: n,
    indices: tris.length,
    aabb: [...lo, ...hi],
    pos: push(pos),
    nrm: push(nrm),
    rig: push(rig),
    info: push(info),
    idx: push(Int32Array.from(tris)),
  };
}

/** A level split the web's way (bucketOf), the pieces under `fold` triangles folded into the body. */
function level(name: string, g: Geo, idx: Uint32Array, fold: number) {
  const triGroup = new Float32Array(idx.length / 3);
  const members = new Map<number, Set<number>>();
  const count = new Map<number, number>();
  for (let t = 0; t < triGroup.length; t++) {
    const grp = g.rig[idx[t * 3] * 4 + 2];
    triGroup[t] = grp;
    const key = bucketOf(grp);
    if (!members.has(key)) members.set(key, new Set());
    members.get(key)!.add(grp);
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  for (const [key, n] of count) {
    if (key === 0 || n >= fold) continue;
    for (const grp of members.get(key)!) members.get(0)!.add(grp);
    members.delete(key);
  }
  const keys = [...members.keys()].sort((a, b) => a - b);
  const batches = keys.map((key) => ({ key, ...batch(g, idx, triGroup, members.get(key)!) }));
  const tris = batches.reduce((s, b) => s + b.indices / 3, 0);
  const body = batches.find((b) => b.key === 0)!;
  console.log(`${name}: ${batches.length} meshes, ${tris} triangles in all, the body ${body.indices / 3} (${body.verts} vertices)`);
  return { name, batches };
}

const nearG = geoOf(NEAR_RES);
const farG = geoOf(FAR_RES);
const levels = [
  level('near', nearG, nearG.idx, 0),
  level('far', farG, farG.idx, 0),
  level('distant', farG, cut(farG, DISTANT_ERROR, ['Prune']), 40),
  level('speck', farG, cut(farG, SPECK_ERROR, ['Prune', 'Permissive']), Infinity),
];

// what a typical hand wears at each level (a knit cap, a mop, a beard and boots)
const wears = (grp: number) =>
  grp === 0 || grp === HAT.knit || grp === PROP.mop || grp === 10 + BIT.beard || grp === 10 + BIT.boots || (grp >= 30 && grp < 50 && grp !== 30 + BIT.boots);
for (const l of levels) {
  let t = 0;
  let n = 0;
  for (const b of l.batches) {
    if (b.key !== 0 && !wears(b.key)) continue;
    t += b.indices / 3;
    n++;
  }
  console.log(`  ${l.name}: a hand at sea draws about ${t} triangles in ${n} meshes`);
}

const all = new Uint8Array(offset);
let at = 0;
for (const c of chunks) {
  all.set(c, at);
  at += c.byteLength;
}
writeFileSync(join(OUT, 'art', 'crew.bin'), all);
const index = {
  levels,
  slots: TINT_SLOTS,
  poseSize: POSE_SIZE,
  aoMax: AO_MAX,
  bone: BONE,
  tint: TINT,
  hat: HAT,
  prop: PROP,
  bit: BIT,
  flag: FLAG,
  pose: P,
  part: PART,
  rig: RIG,
};
writeFileSync(join(OUT, 'art', 'crew.json'), JSON.stringify(index));

// ------------------------------------------------------------------ the shader's anchors

const f = (n: number) => n.toFixed(4);
const v3 = (v: { x: number; y: number; z: number }) => `vec3(${f(v.x)}, ${f(v.y)}, ${f(v.z)})`;
const parts = Object.entries(PART)
  .map(([k, v]) => `const int PART_${k.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()} = ${v};`)
  .join('\n');
const tints = Object.entries(TINT)
  .map(([k, v]) => `const int TINT_${k.toUpperCase()} = ${v};`)
  .join('\n');
const inc = `// Written by tools/crew/bake_crew.mjs from the web game's sculpt
// (src/ships/crewModel.ts): the joint pivots and the face's anchors (after
// the head's toy scale) the crew shader bends the sailor about, and the part
// and palette slot ids the mesh carries. Don't edit by hand: bake again.

const vec3 CREW_SPINE = ${v3(SPINE)};
const vec3 CREW_NECK = ${v3(NECK)};
const float CREW_SH_X = ${f(SH_X)};
const float CREW_SH_Y = ${f(SH_Y)};
const float CREW_EL_Y = ${f(EL_Y)};
const float CREW_HIP_X = ${f(HIP_X)};
const float CREW_HIP_Y = ${f(HIP_Y)};
const float CREW_KNEE_Y = ${f(KNEE_Y)};
const float CREW_HX = ${f(HX)};
const float CREW_KN_Y = ${f(KN_Y)};
const float CREW_FM_Y = ${f(FM_Y)};
const vec3 CREW_PARROT = ${v3(PARROT)};
const vec3 CREW_EYE = ${v3(S_EYE)};
const vec3 CREW_MOUTH = ${v3(S_MOUTH)};
const vec3 CREW_NOSE = ${v3(S_NOSE)};
const vec3 CREW_EAR = ${v3(S_EAR)};
const float CREW_CHIN_Y = ${f(S_CHIN_Y)};
const vec3 CREW_JAW = ${v3(S_JAW)};
const float CREW_AO_MAX = ${f(AO_MAX)};

${parts}

${tints}
`;
writeFileSync(join(OUT, 'shaders', 'inc', 'crew_rig.gdshaderinc'), inc);
console.log(`crew: ${(offset / 1024).toFixed(0)} KiB`);
