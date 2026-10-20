import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Small procedural geometry helpers shared by the ship model and its
// upgrade parts: turned profiles, swept tubes, rounded boxes and spars, and
// per-part vertex paint for the merged buckets.

export function hexL(c: string | number) {
  return new THREE.Color(c as THREE.ColorRepresentation);
}

/** Paints a part one colour, nudged a touch lighter or darker so no two timbers match exactly. */
export function colorize(geo: THREE.BufferGeometry, color: THREE.Color, jitter = 0.05): THREE.BufferGeometry {
  const g = geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  const k = 1 + (Math.random() * 2 - 1) * jitter;
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r * k;
    arr[i * 3 + 1] = color.g * k;
    arr[i * 3 + 2] = color.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** A tube swept along a smooth path with a varying radius (u: 0 start .. 1 end). */
export function sweep(pts: THREE.Vector3[], r: (u: number) => number, radial = 6, segs = 18): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const n = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u);
    const rr = r(u);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(p.x + n.x * rr, p.y + n.y * rr, p.z + n.z * rr);
      nrm.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** Points on a carved scroll: a spiral of `turns` winding in from radius R about `c`, in the plane (ax, ay). */
export function spiral(c: THREE.Vector3, ax: THREE.Vector3, ay: THREE.Vector3, R: number, turns: number, a0 = 0, n = 14): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const a = a0 + f * turns * Math.PI * 2;
    const r = R * (1 - 0.72 * f);
    pts.push(c.clone().addScaledVector(ax, Math.cos(a) * r).addScaledVector(ay, Math.sin(a) * r));
  }
  return pts;
}

/** A cylinder spanning two points. */
export function spar(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, radial = 8): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1);
  g.translate(0, len / 2, 0);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyMatrix4(new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** A softly rounded box. */
export function rbox(w: number, h: number, d: number, r = Math.min(w, h, d) * 0.28, segs = 2): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, segs, Math.min(r, Math.min(w, h, d) / 2 - 1e-3));
}

/** Turned profile, [radius, y] pairs from bottom to top. */
export function lathe(profile: [number, number][], segs = 10): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
}

export function tube(pts: THREE.Vector3[], r: number, closed = false, radial = 6, perPoint = 4): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(8, pts.length * perPoint), r, radial, closed);
}

export function ball(r: number, at: THREE.Vector3, w = 8, h = 6): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, w, h);
  g.translate(at.x, at.y, at.z);
  return g;
}

/** Local frame on a surface: x along the hull (horizontal), y up-ish, z = normal. */
export function surfaceMatrix(p: THREE.Vector3, n: THREE.Vector3): THREE.Matrix4 {
  const xa = new THREE.Vector3(0, 1, 0).cross(n).normalize();
  const ya = n.clone().cross(xa).normalize();
  return new THREE.Matrix4().makeBasis(xa, ya, n).setPosition(p);
}

/** A square frame with a round section (a 4-segment torus turned square). */
export function squareRing(half: number, r: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(half * Math.SQRT2, r, 5, 4);
  g.rotateZ(Math.PI / 4);
  return g;
}

