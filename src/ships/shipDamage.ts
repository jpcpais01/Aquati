import * as THREE from 'three';
import { clamp, smoothstep } from '../core/noise';
import { patchInfo, patchMaterial } from '../render/environment';
import type { World } from '../game/world';
import { breakSplinters, Cut, filterLines, splitGeometry } from './breakApart';
import { DAMAGE_MAX_HOLES } from './damageGlsl';
import type { Ship } from './ship';
import type { MastDef } from './shipTypes';

// Everything a cannonball does to a ship you can see:
//  - jagged holes punched clean through the planking (you can look into the
//    dark hold), splintered raw-wood rims, soot halos and embers that cool
//  - shattered planks sticking out of each breach, more blasted into the sea
//  - soot and scorch spreading over the hull, canvas tearing into burnt rags
//  - the hull settling lower and listing toward its holes as it floods
//  - masts and the bowsprit cracking, toppling over the side and floating off
//  - when she goes down: the hull breaks in two (or rolls over) and the wreck
//    stays on the water, smouldering, for three minutes before slipping under
// Healing boards holes over with fresh planks and re-rigs broken spars.

export const WRECK_LIFE = 180;
const WRECK_FINAL = 13;
const SHARDS_PER_HOLE = 5;
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const cloneBase = new WeakMap<THREE.Material, THREE.Material>();

// Snapping a spar off slices whole merged meshes, the heaviest thing a hit can
// do. Breaks are queued and the fleet shares one per frame, so a broadside that
// dismasts a ship (or a magazine that drops every mast at once) spreads its
// work over a few frames instead of landing in one.
let heavyAt = -1;

/** Per-hull damage clones of a ship's patched materials, all sharing one uniform set. */
class DamageSkin {
  readonly uniforms: {
    uDmgInv: { value: THREE.Matrix4 };
    uDmgHoles: { value: THREE.Vector4[] };
    uDmgHoleInfo: { value: THREE.Vector4[] };
    uDmgCount: { value: number };
    uDmgSplit: { value: THREE.Vector4 };
    uDmgState: { value: THREE.Vector4 };
  };
  private clones = new Map<THREE.Material, THREE.Material>();

  constructor(holes: THREE.Vector4[], info: THREE.Vector4[], count: { value: number }, state: THREE.Vector4) {
    this.uniforms = {
      uDmgInv: { value: new THREE.Matrix4() },
      uDmgHoles: { value: holes },
      uDmgHoleInfo: { value: info },
      uDmgCount: count,
      uDmgSplit: { value: new THREE.Vector4() },
      uDmgState: { value: state },
    };
  }

  material(m: THREE.Material): THREE.Material {
    const base = cloneBase.get(m) ?? m;
    const info = patchInfo.get(base);
    if (!info || !(base as THREE.MeshStandardMaterial).isMeshStandardMaterial) return m;
    let c = this.clones.get(base);
    if (!c) {
      const o = info.opts;
      const fabric = !!(o.sail || o.flag);
      const mat = (base as THREE.MeshStandardMaterial).clone();
      patchMaterial(mat, { ...o, damage: true, cut: !fabric && !o.solid }, { ...info.extra, ...this.uniforms });
      // textured shell surfaces (planking, transom, deck) show the hold through a breach
      if (mat.map && !fabric) mat.side = THREE.DoubleSide;
      cloneBase.set(mat, base);
      this.clones.set(base, mat);
      c = mat;
    }
    return c;
  }

  apply(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) m.material = this.material(m.material);
    });
  }

  setFrame(root: THREE.Object3D) {
    this.uniforms.uDmgInv.value.copy(root.matrixWorld).invert();
  }

  dispose() {
    this.clones.forEach((c) => c.dispose());
    this.clones.clear();
  }
}

interface Hole {
  c: THREE.Vector3; // hull-root space, on the planking
  side: number; // +1 port, -1 starboard
  r: number;
  birth: number;
  patched: boolean;
  seed: number;
  order: number;
}

interface MastState {
  def: MastDef;
  z: number;
  y0: number;
  hp: number;
  broken: boolean;
}

interface Hinge {
  group: THREE.Group;
  axis: THREE.Vector3; // local rotation axis
  long: THREE.Vector3; // part's long axis in hinge space
  len: number;
  angle: number;
  vel: number;
  delay: number;
  max: number;
  gravity: number;
  started: boolean;
}

/** Everything needed to raise a snapped spar again, captured as it breaks. */
interface Spar {
  pivot: THREE.Vector3;
  axis: THREE.Vector3;
  long: THREE.Vector3;
  len: number;
  lean: number; // how far over it starts as the crew hauls it back up
  tpl: THREE.Group; // an intact copy of the broken-off piece, in hull-root space
  cap: THREE.Mesh | null; // splintered stump it grows out of
}

interface Raise {
  spar: Spar;
  group: THREE.Group;
  t: number; // < 0 while waiting its turn
  dust: number;
  landed: boolean;
}

/** Hoist duration of one spar, and the stagger between spars. */
const RAISE_T = 1.9;
const RAISE_GAP = 0.6;

type WreckMode = 'split' | 'capsize';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _box = new THREE.Box3();
const _tb = new THREE.Box3();
const _e = new THREE.Euler();

export class ShipDamage {
  private readonly holeVecs = Array.from({ length: DAMAGE_MAX_HOLES }, () => new THREE.Vector4());
  private readonly infoVecs = Array.from({ length: DAMAGE_MAX_HOLES }, () => new THREE.Vector4());
  private readonly count = { value: 0 };
  private readonly state = new THREE.Vector4(0, 0, Math.random() * 10, 0);
  private readonly skin: DamageSkin;
  private bowSkin: DamageSkin | null = null;
  private pieceSkin: DamageSkin | null = null;
  private holes: Hole[] = [];
  private holeOrder = 0;
  private shards: THREE.InstancedMesh;
  private masts: MastState[];
  private bowsprit = false;
  private events = 0;
  private sailHits = 0;
  private sinceHit = 0;
  private wear = 0;
  private canvas = 0;
  private smokeT = 0;
  private hinges: Hinge[] = [];
  private breakQueue: (() => void)[] = [];
  private originals = new Map<THREE.Mesh | THREE.LineSegments, THREE.BufferGeometry>();
  private hidden: THREE.Object3D[] = [];
  private caps: THREE.Mesh[] = [];
  private spars: Spar[] = [];
  private raising: Raise[] | null = null;
  /** How far the flooding hull has settled (m) and its list (rad). */
  lowered = 0;
  list = 0;
  // wreck
  private mode: WreckMode = 'capsize';
  private splitZ = 0;
  private bowRoot: THREE.Group | null = null;
  private wreckK = { sternA: 0, bowA: 0, sternR: 0, bowR: 0, sep: 0, roll: 0, pitch: 0, depth: 0, pivotY: 0 };

  constructor(private readonly ship: Ship) {
    const model = ship.model;
    this.skin = new DamageSkin(this.holeVecs, this.infoVecs, this.count, this.state);
    this.skin.apply(model.root);
    this.masts = ship.cls.masts.map((def) => ({ def, z: model.shape.z(def.t), y0: model.shape.deckY(def.t), hp: 1, broken: false }));

    // splintered planks bristling from each breach
    const g = new THREE.BoxGeometry(1, 0.05, 0.15, 2, 1, 1);
    g.translate(0.5, 0, 0);
    const p = g.getAttribute('position');
    const col: number[] = [];
    for (let i = 0; i < p.count; i++) {
      if (p.getX(i) > 0.7) p.setZ(i, p.getZ(i) * 0.25);
      col.push(1, 1, 1);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.shards = new THREE.InstancedMesh(g, this.skin.material(this.woodMaterial() ?? new THREE.MeshStandardMaterial()), DAMAGE_MAX_HOLES * SHARDS_PER_HOLE);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.shards.count; i++) {
      this.shards.setMatrixAt(i, zero);
      this.shards.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    this.shards.castShadow = true;
    this.shards.frustumCulled = false;
    this.shards.userData.dmgSkip = true;
    model.root.add(this.shards);
    model.root.add(this.buildHold());
  }

  /**
   * A dark plank floor just above the waterline inside the hull, so a breach
   * looks into the shadowy hold rather than at the sea surface within the hull.
   */
  private holdY(t: number) {
    return this.ship.model.shape.mainDeckY(t) - 0.18;
  }

  private buildHold() {
    const s = this.ship.model.shape;
    const pos: number[] = [];
    const idx: number[] = [];
    const n = 40;
    for (let k = 0; k <= n; k++) {
      const t = 0.015 + (k / n) * 0.97;
      const y = this.holdY(t);
      const w = Math.max(0.02, s.halfWidthAtY(t, y) - 0.03);
      const z = s.z(t);
      pos.push(-w, y, z, w, y, z);
      if (k > 0) {
        const a = (k - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const base = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x1c130c, roughness: 1, side: THREE.DoubleSide }), { solid: true });
    const mesh = new THREE.Mesh(g, this.skin.material(base));
    mesh.userData.dmgSkip = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** The ship's vertex-coloured timber material, as built (undamaged). */
  private woodMaterial(): THREE.Material | null {
    let found: THREE.Material | null = null;
    this.ship.model.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (found || !m.isMesh || Array.isArray(m.material)) return;
      const base = cloneBase.get(m.material) ?? m.material;
      const sm = base as THREE.MeshStandardMaterial;
      if (sm.vertexColors && !sm.map && sm.metalness < 0.5) found = base;
    });
    return found;
  }

  get brokenMasts() {
    return this.masts.reduce((n, m) => n + (m.broken ? 1 : 0), 0);
  }

  /** Lost spars cost speed: each broken mast takes a share of the canvas. */
  get speedFactor() {
    return 1 - 0.28 * (this.brokenMasts / Math.max(1, this.masts.length));
  }

  // ---------------------------------------------------------------- holes

  private syncHoles() {
    let n = 0;
    for (const h of this.holes) {
      this.holeVecs[n].set(h.c.x, h.c.y, h.c.z, h.patched ? -h.r : h.r);
      // breaches only open up above the hold floor; lower ones read as dark, flooded holes
      this.infoVecs[n].set(h.side, this.holdY(clamp(h.c.z / this.ship.cls.length + 0.5, 0, 1)), h.seed, h.birth);
      n++;
    }
    this.count.value = n;
  }

  private placeShards(slot: number, h: Hole | null) {
    const base = slot * SHARDS_PER_HOLE;
    if (!h || h.patched) {
      _m.makeScale(0, 0, 0);
      for (let k = 0; k < SHARDS_PER_HOLE; k++) this.shards.setMatrixAt(base + k, _m);
    } else {
      const liv = this.ship.livery;
      const painted = [new THREE.Color(liv.hull), new THREE.Color(liv.strake), new THREE.Color(liv.wale)];
      const n = new THREE.Vector3(h.side, 0, 0);
      for (let k = 0; k < SHARDS_PER_HOLE; k++) {
        const a = (k / SHARDS_PER_HOLE) * Math.PI * 2 + rand(-0.4, 0.4);
        const rr = h.r * rand(0.42, 0.62);
        const pos = h.c.clone().add(_v.set(0, Math.sin(a) * rr, Math.cos(a) * rr)).addScaledVector(n, -0.04);
        // planks run fore-aft: shards point along the strakes, bent out of the hull
        const along = Math.cos(a) >= 0 ? 1 : -1;
        const dir = _v2.set(h.side * rand(0.35, 1.1), rand(-0.35, 0.35) + Math.sin(a) * 0.3, -along * rand(0.5, 1.0)).normalize();
        _q.setFromUnitVectors(_v.set(1, 0, 0), dir);
        _q.multiply(new THREE.Quaternion().setFromAxisAngle(_v.set(1, 0, 0), rand(0, Math.PI)));
        const len = h.r * rand(0.6, 1.25);
        _m.compose(pos, _q, _v.set(len, rand(1.1, 1.8), rand(1.0, 1.7)));
        this.shards.setMatrixAt(base + k, _m);
        const c = Math.random() < 0.45 ? painted[Math.floor(Math.random() * painted.length)].clone() : new THREE.Color(0.8, 0.62, 0.42);
        this.shards.setColorAt(base + k, c.multiplyScalar(rand(0.85, 1.1)));
      }
    }
    this.shards.instanceMatrix.needsUpdate = true;
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
  }

  private addHole(local: THREE.Vector3, side: number, r: number, time: number) {
    // a ball landing in an existing breach tears it wider
    for (const h of this.holes) {
      if (!h.patched && h.side === side && h.c.distanceTo(local) < h.r * 0.75) {
        h.r = Math.min(h.r * 1.22, 1.35);
        h.birth = time;
        this.syncHoles();
        this.placeShards(this.holes.indexOf(h), h);
        return;
      }
    }
    const hole: Hole = { c: local.clone(), side, r, birth: time, patched: false, seed: Math.random() * 7, order: this.holeOrder++ };
    let slot = this.holes.length;
    if (slot >= DAMAGE_MAX_HOLES) {
      // reuse the oldest patch, else the oldest breach
      let best = -1;
      let bestScore = Infinity;
      this.holes.forEach((h, i) => {
        const score = h.order - (h.patched ? 1e6 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      });
      slot = best;
      this.holes[slot] = hole;
    } else this.holes.push(hole);
    this.syncHoles();
    this.placeShards(slot, hole);
  }

  // ---------------------------------------------------------------- hits

  /** A cannonball (or a reef) struck the hull. `at` is the world impact point. */
  onHit(at: THREE.Vector3 | null, dmg: number, world: World) {
    const s = this.ship;
    const shape = s.model.shape;
    const L = s.cls.length;
    this.sinceHit = 0;
    const local = new THREE.Vector3();
    if (at) local.copy(at).applyMatrix4(_inv.copy(s.model.root.matrixWorld).invert());
    else local.set(rand(-1, 1), rand(0, 1), rand(-0.35, 0.35) * L);
    const t = clamp(local.z / L + 0.5, 0.04, 0.96);
    const side = local.x >= 0 ? 1 : -1;
    const y = clamp(local.y, -0.7, shape.top(t) - 0.2);
    const c = new THREE.Vector3(side * shape.halfWidthAtY(t, y), y, shape.z(t));
    const r = rand(0.6, 0.9) * clamp(dmg / 20, 0.85, 1.3) * (0.8 + L / 100);
    this.addHole(c, side, r, world.time);

    // planks blasted out into the sea
    const out = new THREE.Vector3(side, 0.15, 0).applyQuaternion(s.model.root.getWorldQuaternion(_q)).normalize();
    const wp = c.clone().applyMatrix4(s.model.root.matrixWorld);
    const liv = s.livery;
    world.debris.splinters(wp, out, s.vel, [new THREE.Color(liv.hull), new THREE.Color(liv.strake), new THREE.Color(0.72, 0.55, 0.36)], 2 + Math.floor(Math.random() * 3));

    // the rig takes a beating too
    const f = s.hp / s.maxHp;
    for (const m of this.masts) {
      if (!m.broken && Math.abs(c.z - m.z) < 2.6) m.hp -= 0.05 + 0.14 * (1 - f);
    }
    const intact = this.masts.filter((m) => !m.broken);
    const weakest = () => intact.reduce((a, b) => (b.hp < a.hp ? b : a), intact[0]);
    if (intact.length && this.events === 0 && f < 0.55 && this.masts.length > 1) {
      this.events = 1;
      weakest().hp -= 0.75;
    }
    if (intact.length && this.events <= 1 && f < 0.28) {
      this.events = 2;
      weakest().hp -= 0.85;
    }
    const fall = new THREE.Vector3(-side, 0, rand(-0.3, 0.3)).normalize();
    this.masts.forEach((m, i) => {
      if (!m.broken && m.hp <= 0) this.breakMast(i, fall, world, 0);
    });
    if (!this.bowsprit && ((t > 0.84 && f < 0.6 && Math.random() < 0.5) || (f < 0.22 && Math.random() < 0.22))) this.breakBowsprit(world, 0);
  }

  /** Is a ball above the hull passing through a mast (2) or a sail (1)? */
  rigTest(local: THREE.Vector3): { kind: 0 | 1 | 2; mast: number } {
    const B = this.ship.cls.beam;
    for (let i = 0; i < this.masts.length; i++) {
      const m = this.masts[i];
      if (m.broken || local.y < m.y0 + 0.6 || local.y > m.y0 + m.def.height) continue;
      const dz = local.z - m.z;
      if (Math.hypot(local.x, dz) < 0.55) return { kind: 2, mast: i };
      if (Math.abs(dz) < 1.1 && Math.abs(local.x) < B * 0.8 && local.y > m.y0 + 2) return { kind: 1, mast: i };
    }
    return { kind: 0, mast: -1 };
  }

  /** A ball tore through canvas or smashed into a mast. */
  onRigHit(kind: 1 | 2, mast: number, at: THREE.Vector3, ballVel: THREE.Vector3, world: World) {
    this.sinceHit = 0;
    if (kind === 1) {
      this.sailHits++;
      const liv = new THREE.Color(this.ship.livery.sail);
      for (let i = 0; i < 6; i++) {
        world.particles.emit({
          x: at.x, y: at.y, z: at.z, vx: ballVel.x * 0.05 + rand(-2, 2), vy: rand(-1, 2), vz: ballVel.z * 0.05 + rand(-2, 2),
          life: rand(0.8, 1.6), size: rand(0.12, 0.3), color: [liv.r, liv.g, liv.b], grav: 4, drag: 2, spin: rand(-10, 10), kind: 3, fadeIn: 0.001,
        });
      }
      world.particles.emit({ x: at.x, y: at.y, z: at.z, vx: ballVel.x * 0.04, vz: ballVel.z * 0.04, life: 1.2, size: 0.8, sizeEnd: 2.6, color: [liv.r, liv.g, liv.b], alpha: 0.35, drag: 2, kind: 1 });
      return;
    }
    const m = this.masts[mast];
    m.hp -= 0.36;
    world.particles.woodHit(at, _v.copy(ballVel).setY(0).normalize());
    const [vol, pan, d] = world.soundAt(at);
    world.audio.hit(vol, pan, d);
    if (m.hp <= 0) {
      const s = this.ship;
      const lv = ballVel.clone().applyQuaternion(s.model.root.getWorldQuaternion(_q).invert());
      const fall = new THREE.Vector3(lv.x, 0, lv.z * 0.3);
      if (fall.lengthSq() < 1e-4) fall.set(1, 0, 0);
      this.breakMast(mast, fall.normalize(), world, 0);
    }
  }

  // ---------------------------------------------------------------- breaking off

  private ensurePieceSkin() {
    if (!this.pieceSkin) {
      this.pieceSkin = new DamageSkin(this.holeVecs, this.infoVecs, { value: 0 }, new THREE.Vector4(0, 0, this.state.z, 0));
    }
    this.pieceSkin.uniforms.uDmgState.value.w = this.state.w * 0.8;
    return this.pieceSkin;
  }

  /** Root-space bounding box of an object under the hull root. */
  private rootBox(obj: THREE.Object3D, out: THREE.Box3) {
    out.makeEmpty();
    const root = this.ship.model.root;
    _inv.copy(root.matrixWorld).invert();
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (!g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      _tb.copy(g.boundingBox!).applyMatrix4(_m.multiplyMatrices(_inv, o.matrixWorld));
      out.union(_tb);
    });
    return out;
  }

  /**
   * Snaps everything on the positive side of `cut` off the hull and hangs it
   * on a hinge at `pivot`; it then topples about `axis` and falls into the sea.
   */
  private breakOff(cut: Cut, pivot: THREE.Vector3, axis: THREE.Vector3, long: THREE.Vector3, len: number, delay: number, max: number, world: World) {
    const model = this.ship.model;
    const root = model.root;
    const skin = this.ensurePieceSkin();
    const piece = new THREE.Group();
    const rim: THREE.Vector3[] = [];
    let capMat: THREE.Material | null = null;
    root.updateMatrixWorld(true);
    for (const child of [...root.children]) {
      if (child.userData.dmgSkip || !child.visible) continue;
      const mesh = child as THREE.Mesh;
      const line = child as THREE.LineSegments;
      if (!mesh.isMesh && !line.isLineSegments) {
        // a sub-assembly (yard pivot, pennant): goes with the spar it hangs from
        this.rootBox(child, _box);
        if (_box.isEmpty()) continue;
        const c = _box.getCenter(_v);
        const test = _v2.set(child.position.x, Math.max(c.y, cut.plane.constant * -1 + 0.1), child.position.z);
        if (cut.plane.normal.y < 0.5) test.copy(c);
        if (cut.plane.distanceToPoint(test) > 0 && cut.lateral(test)) {
          const copy = child.clone();
          skin.apply(copy);
          piece.add(copy);
          child.visible = false;
          this.hidden.push(child);
        }
        continue;
      }
      if (line.isLineSegments) {
        const g = filterLines(line.geometry, line.matrix, cut);
        if (g) this.swapGeometry(line, g);
        continue;
      }
      // small loose parts (a topsail on its own) move whole
      this.rootBox(child, _box);
      const c = _box.getCenter(_v);
      const minAbove = cut.plane.normal.y > 0.5 ? _box.min.y > -cut.plane.constant - 0.3 : _box.min.z > -cut.plane.constant - 0.3;
      if (minAbove && cut.lateral(c)) {
        const copy = mesh.clone();
        skin.apply(copy);
        piece.add(copy);
        mesh.visible = false;
        this.hidden.push(mesh);
        continue;
      }
      // the planked shell (textured hull, transom, deck) never slices
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (Array.isArray(mesh.material) || mat.map) continue;
      const res = splitGeometry(mesh.geometry, mesh.matrix, cut);
      if (!res) continue;
      this.swapGeometry(mesh, res.keep);
      const pm = new THREE.Mesh(res.piece, skin.material(mesh.material));
      pm.position.copy(mesh.position);
      pm.quaternion.copy(mesh.quaternion);
      pm.scale.copy(mesh.scale);
      pm.castShadow = mesh.castShadow;
      pm.receiveShadow = true;
      pm.userData.dmgOwnGeo = true;
      piece.add(pm);
      rim.push(...res.rim);
      if (!capMat && (mat.vertexColors || (cloneBase.get(mat) as THREE.MeshStandardMaterial | undefined)?.vertexColors)) capMat = mesh.material as THREE.Material;
    }
    if (!piece.children.length) return false;
    // an intact copy, before the splintered end goes on, for the crew to raise later
    const tpl = piece.clone();
    tpl.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.dmgOwnGeo) m.geometry = m.geometry.clone();
    });
    let cap: THREE.Mesh | null = null;

    // jagged splinters on the stump and on the broken end
    if (rim.length > 2) {
      const cen = new THREE.Vector3();
      for (const p of rim) cen.add(p);
      cen.divideScalar(rim.length);
      let r = 0;
      for (const p of rim) r += p.distanceTo(cen);
      r = clamp(r / rim.length, 0.08, 0.6);
      const dir = cut.plane.normal.y > 0.5 ? 1 : 1;
      const stumpGeo = breakSplinters(new THREE.Vector3(), r, dir, Math.random() * 100);
      const brokenGeo = breakSplinters(new THREE.Vector3(), r, -dir, Math.random() * 100);
      const orient = new THREE.Quaternion().setFromUnitVectors(UP, cut.plane.normal);
      const mat = capMat ?? this.skin.material(this.woodMaterial() ?? new THREE.MeshStandardMaterial());
      const stump = new THREE.Mesh(stumpGeo, mat);
      stump.position.copy(cen);
      stump.quaternion.copy(orient);
      stump.castShadow = true;
      stump.userData.dmgSkip = true;
      root.add(stump);
      this.caps.push(stump);
      cap = stump;
      const end = new THREE.Mesh(brokenGeo, skin.material(cloneBase.get(mat) ?? mat));
      end.position.copy(cen);
      end.quaternion.copy(orient);
      end.userData.dmgOwnGeo = true;
      piece.add(end);
    }

    const hinge = new THREE.Group();
    hinge.position.copy(pivot);
    piece.position.copy(pivot).negate();
    hinge.add(piece);
    hinge.userData.dmgSkip = true;
    hinge.userData.dmgPart = true;
    root.add(hinge);
    this.hinges.push({ group: hinge, axis: axis.clone(), long: long.clone(), len, angle: 0, vel: rand(0.12, 0.3), delay, max, gravity: (1.5 * 9.8) / Math.max(4, len), started: false });
    this.spars.push({ pivot: pivot.clone(), axis: axis.clone(), long: long.clone(), len, lean: Math.min(max * 0.62, 0.8), tpl, cap });
    if (delay <= 0) this.crack(hinge, world);
    return true;
  }

  private crack(hinge: THREE.Group, world: World) {
    const wp = hinge.getWorldPosition(new THREE.Vector3());
    world.particles.woodHit(wp, _v.set(rand(-1, 1), 0.5, rand(-1, 1)).normalize());
    const [vol, pan, d] = world.soundAt(wp);
    world.audio.hit(Math.min(1, vol * 1.4), pan, d);
  }

  private swapGeometry(obj: THREE.Mesh | THREE.LineSegments, g: THREE.BufferGeometry) {
    if (!this.originals.has(obj)) this.originals.set(obj, obj.geometry);
    else obj.geometry.dispose();
    obj.geometry = g;
  }

  private breakMast(i: number, fall: THREE.Vector3, world: World, delay: number) {
    const m = this.masts[i];
    if (m.broken || (this.raising && this.ship.alive)) return;
    m.broken = true;
    m.hp = 0;
    const H = m.def.height;
    const B = this.ship.cls.beam;
    const low = m.def.rig === 'gaff' ? 3.2 : 2.4;
    const yCut = m.y0 + Math.max(low, H * rand(0.24, 0.4));
    const colR = Math.max(B * 0.2, 0.9);
    const cut: Cut = {
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -yCut),
      lateral: (p) => Math.hypot(p.x, p.z - m.z) < colR || (Math.abs(p.z - m.z) < 0.8 && Math.abs(p.x) < B * 1.15 && p.y > yCut + 0.8),
      // shrouds and ratlines go slack with the mast
      rigging: (p) => Math.abs(p.z - m.z) < 2.4 && p.y > m.y0 + 0.5,
    };
    const dir = fall.clone().setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(Math.random() < 0.5 ? 1 : -1, 0, 0);
    dir.normalize();
    // heeling ships drop their masts to leeward
    if (Math.abs(this.list) > 0.05) dir.x = dir.x * 0.5 - Math.sign(this.list) * 0.5;
    dir.z = clamp(dir.z, -0.35, 0.35);
    dir.normalize();
    const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const max = rand(1.15, 1.35);
    this.breakQueue.push(() => this.breakOff(cut, new THREE.Vector3(0, yCut, m.z), axis, UP, H - (yCut - m.y0), delay, max, world));
  }

  private breakBowsprit(world: World, delay: number) {
    if (this.bowsprit || (this.raising && this.ship.alive)) return;
    this.bowsprit = true;
    const s = this.ship.model.shape;
    const c = this.ship.cls;
    const zc = s.z(1) - 0.35;
    const yMin = s.top(0.97) - 1.1;
    const cut: Cut = {
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -zc),
      lateral: (p) => p.y > yMin && Math.abs(p.x) < 1.6,
    };
    const long = new THREE.Vector3(0, Math.sin(0.32), Math.cos(0.32));
    this.breakQueue.push(() => this.breakOff(cut, new THREE.Vector3(0, s.top(0.985) - 0.25, zc), new THREE.Vector3(1, 0, 0), long, c.bowsprit, delay, 0.95, world));
  }

  /** Runs at most one queued break per frame, fleet-wide. */
  private drainBreaks(world: World) {
    if (!this.breakQueue.length || heavyAt === world.time) return;
    heavyAt = world.time;
    this.breakQueue.shift()!();
  }

  private releaseHinge(h: Hinge, world: World) {
    const g = h.group;
    g.updateMatrixWorld(true);
    const wq = g.getWorldQuaternion(new THREE.Quaternion());
    const parentQ = g.parent ? g.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const omega = h.axis.clone().applyQuaternion(parentQ).multiplyScalar(h.vel);
    const mid = h.long.clone().applyQuaternion(wq).multiplyScalar(h.len * 0.5);
    const vel = new THREE.Vector3().crossVectors(omega, mid).add(this.ship.vel);
    world.debris.addBody(g, vel, omega.multiplyScalar(0.6), h.long, h.len);
  }

  private updateHinges(dt: number, world: World) {
    for (let i = this.hinges.length - 1; i >= 0; i--) {
      const h = this.hinges[i];
      if (h.delay > 0) {
        h.delay -= dt;
        if (h.delay > 0) continue;
      }
      if (!h.started) {
        h.started = true;
        this.crack(h.group, world);
      }
      h.vel += h.gravity * Math.sin(h.angle + 0.06) * dt;
      h.angle += h.vel * dt;
      h.group.quaternion.setFromAxisAngle(h.axis, h.angle);
      if (h.angle > h.max) {
        this.hinges.splice(i, 1);
        this.releaseHinge(h, world);
      }
    }
  }

  /**
   * The crew re-rigs once the hull is sound: the wreckage is cut away and each
   * lost spar is hauled back up from its stump in turn, fore to aft. It swings
   * up off the rail, overshoots, and settles into its step with a knock and a
   * shower of sawdust before the rigging is made fast.
   */
  private repairRig(world: World) {
    while (this.breakQueue.length) this.breakQueue.shift()!();
    for (const h of this.hinges) this.releaseHinge(h, world);
    this.hinges.length = 0;
    if (!this.spars.length) {
      this.finishRig(world);
      return;
    }
    const root = this.ship.model.root;
    this.ensurePieceSkin();
    const order = [...this.spars].sort((a, b) => b.pivot.z - a.pivot.z);
    this.raising = order.map((spar, i) => {
      const group = new THREE.Group();
      group.position.copy(spar.pivot);
      spar.tpl.position.copy(spar.pivot).negate();
      group.add(spar.tpl);
      group.quaternion.setFromAxisAngle(spar.axis, spar.lean);
      group.scale.setScalar(0.001);
      group.userData.dmgSkip = true;
      group.userData.dmgPart = true;
      root.add(group);
      return { spar, group, t: -i * RAISE_GAP, dust: 0, landed: false };
    });
  }

  private updateRaise(dt: number, world: World) {
    const list = this.raising;
    if (!list) return;
    const root = this.ship.model.root;
    let done = true;
    for (const r of list) {
      r.t += dt;
      if (r.t < RAISE_T) done = false;
      if (r.t < 0) continue;
      const sp = r.spar;
      if (sp.cap) sp.cap.visible = false;
      const u = Math.min(1, r.t / RAISE_T);
      // grows out of the stump fast, then the hoist: up past plumb and back
      const grow = 1 - Math.pow(1 - Math.min(1, u / 0.38), 3);
      const k = smoothstep(0.08, 1, u);
      const swing = sp.lean * (1 - k) * (1 - k) - Math.sin(k * Math.PI * 2.2) * Math.pow(1 - k, 1.4) * 0.09;
      r.group.quaternion.setFromAxisAngle(sp.axis, swing);
      const sq = 1 + Math.sin(Math.min(1, u / 0.38) * Math.PI) * 0.06;
      r.group.scale.set(grow / Math.sqrt(sq), grow * sq, grow / Math.sqrt(sq));
      root.updateMatrixWorld();
      // sawdust and shavings fly off the step while the spar goes up
      r.dust -= dt;
      if (u < 0.85 && r.dust <= 0) {
        r.dust = 0.16;
        const wp = sp.pivot.clone().applyMatrix4(root.matrixWorld);
        world.particles.woodHit(wp, _v.set(rand(-1, 1), 0.8, rand(-1, 1)).normalize());
      }
      // a glint running up the new timber
      if (u < 0.9 && Math.random() < dt * 14) {
        const along = _v2.copy(sp.long).applyAxisAngle(sp.axis, swing).multiplyScalar(sp.len * grow * Math.min(1, u * 1.6));
        const wp = sp.pivot.clone().add(along).applyMatrix4(root.matrixWorld);
        world.particles.sparkle(wp, [1, 0.86, 0.55], 0.8);
      }
      if (!r.landed && u > 0.62) {
        r.landed = true;
        const wp = sp.pivot.clone().applyMatrix4(root.matrixWorld);
        const [vol, pan, d] = world.soundAt(wp);
        world.audio.hit(Math.min(1, vol * 0.8), pan, d);
        for (let k2 = 0; k2 < 3; k2++) world.particles.woodHit(wp, _v.set(rand(-1, 1), 0.6, rand(-1, 1)).normalize());
        for (let k2 = 0; k2 < 7; k2++) {
          const p = sp.pivot.clone().addScaledVector(sp.long, sp.len * (k2 / 6)).applyMatrix4(root.matrixWorld);
          world.particles.sparkle(p.add(_v.set(rand(-0.6, 0.6), rand(-0.4, 0.4), rand(-0.6, 0.6))), [1, 0.9, 0.62]);
        }
      }
    }
    if (done) this.finishRig(world);
  }

  /** Swaps the hoisted copies for the real, whole rig and makes the rigging fast. */
  private finishRig(world: World | null) {
    if (this.raising) {
      for (const r of this.raising) {
        r.group.removeFromParent();
        r.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.userData.dmgOwnGeo) m.geometry.dispose();
        });
      }
      this.raising = null;
    } else {
      for (const sp of this.spars) {
        sp.tpl.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.userData.dmgOwnGeo) m.geometry.dispose();
        });
      }
    }
    this.spars.length = 0;
    this.originals.forEach((g, obj) => {
      obj.geometry.dispose();
      obj.geometry = g;
    });
    this.originals.clear();
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
    for (const c of this.caps) {
      c.removeFromParent();
      c.geometry.dispose();
    }
    this.caps.length = 0;
    for (const m of this.masts) {
      m.broken = false;
      m.hp = 1;
    }
    this.bowsprit = false;
    this.events = 0;
    if (world) {
      const root = this.ship.model.root;
      for (const m of this.masts) {
        const p = new THREE.Vector3(0, m.y0 + m.def.height * 0.75, m.z).applyMatrix4(root.matrixWorld);
        for (let k = 0; k < 3; k++) world.particles.sparkle(p.clone().add(_v.set(rand(-1.2, 1.2), rand(-2, 3), rand(-1.2, 1.2))), [1, 0.92, 0.7], 0.7);
      }
    }
  }

  // ---------------------------------------------------------------- per frame (afloat)

  update(dt: number, world: World) {
    const s = this.ship;
    const c = s.cls;
    const f = s.hp / s.maxHp;
    this.sinceHit += dt;

    // flooding: settle lower and list toward the side with the most (and lowest) holes
    let lean = 0;
    for (const h of this.holes) {
      if (h.patched) continue;
      lean += h.side * h.r * (1 + clamp(1 - h.c.y / 1.6, 0, 1.2));
    }
    const dmg = 1 - f;
    const listTarget = s.alive ? clamp(-lean * 0.016, -0.1, 0.1) * Math.min(1, dmg * 2.2) : this.list;
    this.list += (listTarget - this.list) * Math.min(1, dt * 0.35);
    const lowTarget = Math.pow(dmg, 1.5) * c.freeboard * 0.24;
    this.lowered += (lowTarget - this.lowered) * Math.min(1, dt * 0.4);

    // scorch and torn canvas build quickly, fade slowly as the crew repairs
    const wearT = clamp(dmg * 1.15, 0, 1);
    this.wear += (wearT - this.wear) * Math.min(1, dt * (wearT > this.wear ? 2 : 0.05));
    if (this.sinceHit > 9) this.sailHits = Math.max(0, this.sailHits - dt * 0.05);
    const canvasT = clamp(dmg * 0.72 + this.sailHits * 0.07, 0, 0.92);
    this.canvas += (canvasT - this.canvas) * Math.min(1, dt * (canvasT > this.canvas ? 3 : 0.06));
    this.state.set(this.wear, s.burning, this.state.z, this.canvas);

    // the crew boards breaches over as the hull is repaired
    const budget = Math.ceil(dmg * 16) + 1;
    const open = this.holes.filter((h) => !h.patched);
    if (s.alive && open.length > budget) {
      const oldest = open.reduce((a, b) => (b.order < a.order ? b : a), open[0]);
      oldest.patched = true;
      this.syncHoles();
      this.placeShards(this.holes.indexOf(oldest), oldest);
      const wp = oldest.c.clone().applyMatrix4(s.model.root.matrixWorld);
      for (let k = 0; k < 4; k++) world.particles.sparkle(wp);
    }
    if (s.alive && f > 0.97 && !this.raising && (this.brokenMasts > 0 || this.bowsprit)) this.repairRig(world);
    this.updateRaise(dt, world);

    // smoke curling out of the breaches
    if (dmg > 0.35 && open.length) {
      this.smokeT += dt * (0.8 + dmg * 3);
      while (this.smokeT > 1) {
        this.smokeT -= 1;
        const h = open[Math.floor(Math.random() * open.length)];
        const wp = h.c.clone().applyMatrix4(s.model.root.matrixWorld);
        if (wp.y < world.waterHeight(wp.x, wp.z) + 0.1) continue;
        const g = rand(0.14, 0.24);
        world.particles.emit({
          x: wp.x, y: wp.y, z: wp.z, vx: s.vel.x * 0.5 + rand(-0.4, 0.4), vy: rand(1.2, 2.6), vz: s.vel.z * 0.5 + rand(-0.4, 0.4),
          life: rand(2.2, 3.6), size: 0.7, sizeEnd: rand(3.5, 5.5), color: [g, g * 0.95, g * 0.92], colorEnd: [0.42, 0.41, 0.4], alpha: 0.5, drag: 0.6, grav: -0.5, spin: rand(-0.5, 0.5), kind: 1, fadeIn: 0.15,
        });
      }
    }

    this.drainBreaks(world);
    this.updateHinges(dt, world);
  }

  /** Called after the hull pose is final this frame (matrices are current). */
  syncFrames() {
    this.skin.setFrame(this.ship.model.root);
    if (this.bowSkin && this.bowRoot) {
      this.bowRoot.updateMatrixWorld(true);
      this.bowSkin.setFrame(this.bowRoot);
    }
  }

  /** A random point on deck (either half of a wreck), in world space, above water. */
  firePoint(world: World, out: THREE.Vector3): boolean {
    const model = this.ship.model;
    const pts = model.deckPoints;
    if (!pts.length) return false;
    for (let k = 0; k < 3; k++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      const onBow = this.bowRoot && p.z > this.splitZ;
      out.copy(p).applyMatrix4((onBow ? this.bowRoot! : model.root).matrixWorld);
      if (this.ship.alive || out.y > world.waterHeight(out.x, out.z) + 0.15) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- going down

  onDeath(world: World) {
    const s = this.ship;
    const c = s.cls;
    const model = s.model;
    const shape = model.shape;
    // a spar still going up is whole enough to come down again with the rest
    if (this.raising) this.finishRig(null);
    this.mode = Math.random() < (c.id === 'sloop' ? 0.3 : 0.65) ? 'split' : 'capsize';
    const fallSide = this.list !== 0 ? -Math.sign(this.list) : Math.random() < 0.5 ? 1 : -1;
    const k = this.wreckK;
    k.depth = c.draft * 0.85 + 1.3;
    k.pivotY = -c.draft * 0.4;
    if (this.mode === 'split') {
      // break where it's weakest: away from the masts, toward the latest breach
      const last = this.holes.reduce<Hole | null>((a, b) => (!a || b.order > a.order ? b : a), null);
      let best = 0.5;
      let bestScore = -Infinity;
      for (let i = 0; i <= 12; i++) {
        const t = 0.36 + (i / 12) * 0.28;
        const z = shape.z(t);
        const clear = Math.min(...this.masts.map((m) => Math.abs(m.z - z)), 6);
        const near = last ? -Math.abs(last.c.z - z) * 0.15 : 0;
        const score = clear + near + Math.random() * 0.8;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      this.splitZ = shape.z(best);
      // everything tall comes down; nothing stands on a broken back
      this.masts.forEach((m, i) => {
        if (!m.broken) this.breakMast(i, new THREE.Vector3(fallSide * rand(0.6, 1), 0, rand(-0.3, 0.3)), world, rand(0.15, 2.4));
      });
      this.breakBowsprit(world, rand(0.3, 1.6));
      // the hull snaps once every spar has come away (queued behind them)
      this.breakQueue.push(() => this.splitHull(world));
      k.sternA = rand(0.32, 0.55);
      k.bowA = rand(0.22, 0.48);
      k.sternR = rand(-0.25, 0.25);
      k.bowR = rand(-0.3, 0.3);
      k.sep = rand(0.6, 1.8);
      k.roll = fallSide * rand(0.0, 0.18);
      k.pitch = 0;
    } else {
      // rolls onto her beam ends; masts left standing lie out over the water
      k.roll = fallSide * rand(1.05, 1.38);
      k.pitch = (Math.random() < 0.5 ? -1 : 1) * rand(0.06, 0.22);
      k.depth = c.draft * 0.35 + c.freeboard * 0.3;
      const standing = this.masts.map((m, i) => (m.broken ? -1 : i)).filter((i) => i >= 0);
      if (standing.length > 1 && Math.random() < 0.6) {
        const i = standing[Math.floor(Math.random() * standing.length)];
        this.breakMast(i, new THREE.Vector3(fallSide, 0, rand(-0.3, 0.3)), world, rand(0.6, 2.5));
      }
    }
    // lights out: lanterns dark, stern windows black
    s.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      if (m.material.type === 'MeshBasicMaterial') m.visible = false;
      const sm = m.material as THREE.MeshStandardMaterial;
      if (sm.emissiveMap && cloneBase.has(sm)) sm.emissiveIntensity = 0;
    });
    // cargo and timber spill out
    const wp = new THREE.Vector3(0, shape.mainDeckY(0.5), 0).applyMatrix4(model.root.matrixWorld);
    world.debris.cargo(wp, s.vel, 3 + Math.floor(c.length / 7), c.beam * 0.35);
    const liv = s.livery;
    const cols = [new THREE.Color(liv.hull), new THREE.Color(liv.strake), new THREE.Color(0.72, 0.55, 0.36), new THREE.Color(liv.trim)];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Vector3(rand(-1, 1) * c.beam * 0.4, shape.mainDeckY(0.5), rand(-0.4, 0.4) * c.length).applyMatrix4(model.root.matrixWorld);
      world.debris.splinters(p, _v.set(rand(-1, 1), 0.4, rand(-1, 1)).normalize(), s.vel, cols, 5 + Math.floor(c.length / 6));
    }
  }

  /** Breaks the hull in two: the bow becomes its own half with its own skin. */
  private splitHull(world: World) {
    const model = this.ship.model;
    const root = model.root;
    // clone everything except the parts already snapping off
    const parts = root.children.filter((o) => o.userData.dmgPart);
    for (const p of parts) root.remove(p);
    const bow = root.clone();
    for (const p of parts) root.add(p);
    bow.traverse((o) => {
      if ((o as THREE.LineSegments).isLineSegments) o.visible = false;
    });
    this.bowSkin = new DamageSkin(this.holeVecs, this.infoVecs, this.count, this.state);
    this.bowSkin.apply(bow);
    this.bowRoot = new THREE.Group();
    this.bowRoot.add(bow);
    root.parent!.add(this.bowRoot);
    // the bow keeps hinged spars forward of the break
    for (const p of parts) if (p.position.z > this.splitZ) this.bowRoot.attach(p);
    for (const o of root.children) if ((o as THREE.LineSegments).isLineSegments) o.visible = false;
    const jag = 1.6 + this.ship.cls.beam * 0.12;
    this.skin.uniforms.uDmgSplit.value.set(this.splitZ, -1, jag, 1);
    this.bowSkin.uniforms.uDmgSplit.value.set(this.splitZ, 1, jag, 1);
    // a burst of timber and spray where she snaps
    const wp = new THREE.Vector3(0, 0.5, this.splitZ).applyMatrix4(root.matrixWorld);
    world.particles.explosion(wp, 0.8);
    world.particles.splash(wp, 1.6);
    world.wake.stamp(wp.x, wp.z, 4, 0.8);
    world.wake.stamp(wp.x, wp.z, 7, 0.5, true);
    world.wake.push(wp.x, wp.z, 5, -0.9);
  }

  /** Wreck pose at `t` seconds after sinking: ship-root offsets, plus the two halves. */
  wreckPose(t: number, dt: number, world: World): { y: number; pitch: number; roll: number; done: boolean } {
    const s = this.ship;
    const k = this.wreckK;
    const e = smoothstep(0, this.mode === 'split' ? 9 : 7, t);
    const lurch = Math.sin(Math.min(t, 1.2) * Math.PI / 1.2) * 0.35;
    let y = -k.depth * e - lurch;
    // run aground on the shallows instead of sinking through the reef
    const bed = world.terrain.heightAt(s.pos.x, s.pos.z);
    const life = s.wreckLife;
    const founder = life < WRECK_LIFE;
    let plunge = 0;
    if (t < life) y = Math.max(y, bed + s.cls.draft * 0.55);
    if (t > life) {
      const u = t - life;
      // a quick founder goes down by the stern, bow reaching for the sky
      y -= founder ? u * u * 0.16 + u * 0.5 : u * u * 0.07 + u * 0.15;
      if (founder) plunge = Math.min(0.42, u * 0.07);
    }
    // a slow, heavy sway on the swell
    const sway = Math.sin(t * 0.37 + this.state.z) * 0.02;
    if (this.mode === 'split' && this.bowRoot) {
      const root = s.model.root;
      const P = _v.set(0, k.pivotY, this.splitZ);
      _q.setFromEuler(_e.set(k.sternA * e, 0, k.sternR * e + sway));
      root.quaternion.copy(_q);
      root.position.copy(P).sub(_v2.copy(P).applyQuaternion(_q));
      _q.setFromEuler(_e.set(-k.bowA * e, 0, k.bowR * e - sway));
      this.bowRoot.quaternion.copy(_q);
      this.bowRoot.position.copy(P).sub(_v2.copy(P).applyQuaternion(_q));
      this.bowRoot.position.z += k.sep * e;
    }
    // bubbles and foam as she goes
    if ((t < 7 || (t > life && t < life + WRECK_FINAL)) && Math.random() < (t > life ? 0.3 : 0.12)) {
      const L = s.cls.length;
      const a = rand(-0.45, 0.45) * L;
      const px = s.pos.x + Math.sin(s.heading) * a + rand(-1, 1) * s.cls.beam * 0.5;
      const pz = s.pos.z + Math.cos(s.heading) * a + rand(-1, 1) * s.cls.beam * 0.5;
      const wy = world.waterHeight(px, pz);
      world.particles.splash(new THREE.Vector3(px, wy, pz), 0.3);
      world.wake.stamp(px, pz, rand(1.2, 2.6), 0.35);
    }
    // thin smoke keeps rising from the smouldering wreck long after the flames die
    if (t > 20 && t < 100 && Math.random() < 0.06) {
      const p = new THREE.Vector3();
      if (this.firePoint(world, p)) {
        world.particles.emit({
          x: p.x, y: p.y, z: p.z, vx: world.wind.dirX * 0.6, vy: rand(1.2, 2.2), vz: world.wind.dirZ * 0.6,
          life: rand(4, 6), size: 1.2, sizeEnd: rand(5, 8), color: [0.32, 0.31, 0.3], colorEnd: [0.6, 0.6, 0.6], alpha: 0.32 * (1 - (t - 20) / 80), drag: 0.3, grav: -0.25, kind: 1, fadeIn: 0.5,
        });
      }
    }
    this.drainBreaks(world);
    this.updateHinges(dt, world);
    this.state.y = this.ship.burning;
    for (const sk of [this.skin, this.bowSkin]) if (sk) sk.uniforms.uDmgSplit.value.w = Math.max(0, 1 - t / 40);
    return { y, pitch: k.pitch * e - plunge, roll: k.roll * e, done: t > life + WRECK_FINAL };
  }

  dispose() {
    this.skin.dispose();
    this.bowSkin?.dispose();
    this.shards.geometry.dispose();
    this.originals.forEach((g) => g.dispose());
    for (const c of this.caps) c.geometry.dispose();
    if (this.bowRoot) this.bowRoot.removeFromParent();
    this.hinges.length = 0;
    this.breakQueue.length = 0;
  }
}
