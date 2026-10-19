// Pirate heraldry: emblems, backings, flag fields and flag shapes, all drawn
// procedurally on canvas so the same artwork serves the 3D flags and sails,
// the customizer previews and the little picker thumbnails.

export type EmblemId =
  | 'none' | 'skull' | 'sun' | 'anchor' | 'swords' | 'kraken' | 'compass' | 'crown'
  | 'trident' | 'hourglass' | 'shark' | 'helm' | 'star' | 'heart' | 'moon' | 'parrot';
export type BackingId = 'none' | 'bones' | 'swords' | 'ring' | 'laurel' | 'rays';
export type FlagPattern = 'plain' | 'band' | 'split' | 'hoist' | 'diagonal' | 'saltire' | 'cross' | 'border' | 'stripes' | 'chevron';
export type FlagShape = 'square' | 'swallowtail' | 'tattered' | 'burgee';

export interface FlagDesign {
  shape: FlagShape;
  bg: string;
  pattern: FlagPattern;
  patternColor: string;
  emblem: EmblemId;
  emblemColor: string;
  backing: BackingId;
  emblemScale: number; // 0.6 .. 1.4
  /** Hand-painted layer: a PNG data URL, or '' for none. */
  paint: string;
}

export const EMBLEMS: { id: EmblemId; name: string }[] = [
  { id: 'skull', name: 'Skull' },
  { id: 'sun', name: 'Sun' },
  { id: 'anchor', name: 'Anchor' },
  { id: 'kraken', name: 'Kraken' },
  { id: 'swords', name: 'Cutlasses' },
  { id: 'compass', name: 'Compass' },
  { id: 'crown', name: 'Crown' },
  { id: 'trident', name: 'Trident' },
  { id: 'hourglass', name: 'Hourglass' },
  { id: 'shark', name: 'Shark' },
  { id: 'helm', name: 'Helm' },
  { id: 'parrot', name: 'Parrot' },
  { id: 'moon', name: 'Moon' },
  { id: 'star', name: 'Star' },
  { id: 'heart', name: 'Heart' },
  { id: 'none', name: 'None' },
];

export const BACKINGS: { id: BackingId; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'bones', name: 'Bones' },
  { id: 'swords', name: 'Blades' },
  { id: 'ring', name: 'Ring' },
  { id: 'laurel', name: 'Laurel' },
  { id: 'rays', name: 'Rays' },
];

export const PATTERNS: { id: FlagPattern; name: string }[] = [
  { id: 'plain', name: 'Plain' },
  { id: 'band', name: 'Band' },
  { id: 'split', name: 'Split' },
  { id: 'hoist', name: 'Hoist' },
  { id: 'diagonal', name: 'Diagonal' },
  { id: 'saltire', name: 'Saltire' },
  { id: 'cross', name: 'Cross' },
  { id: 'border', name: 'Border' },
  { id: 'stripes', name: 'Stripes' },
  { id: 'chevron', name: 'Chevron' },
];

export const SHAPES: { id: FlagShape; name: string }[] = [
  { id: 'square', name: 'Square' },
  { id: 'swallowtail', name: 'Swallowtail' },
  { id: 'tattered', name: 'Tattered' },
  { id: 'burgee', name: 'Burgee' },
];

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function canvas(w: number, h: number): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')!];
}

/** Draw `fn` as a hole through whatever is already on the canvas. */
function cut(g: G, fn: () => void) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  g.strokeStyle = '#000';
  fn();
  g.restore();
}

function poly(g: G, pts: number[]) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
}

/** A filled ribbon along a polyline, tapering from w0 to w1 (half-widths). */
function taper(g: G, pts: [number, number][], w0: number, w1: number) {
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const w = w0 + (w1 - w0) * (i / (pts.length - 1));
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (const p of L) g.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
  g.fill();
  const e = pts[pts.length - 1];
  g.beginPath();
  g.arc(e[0], e[1], w1, 0, TAU);
  g.fill();
}

// ------------------------------------------------------------------ emblems
// Every emblem is drawn in unit space: centred on 0,0 and fitting radius ~1.

function skull(g: G) {
  g.beginPath();
  g.ellipse(0, -0.14, 0.64, 0.58, 0, 0, TAU);
  g.fill();
  g.beginPath();
  g.roundRect(-0.38, 0.2, 0.76, 0.42, 0.14);
  g.fill();
  // cheekbones
  g.beginPath();
  g.ellipse(-0.42, 0.14, 0.16, 0.14, 0, 0, TAU);
  g.ellipse(0.42, 0.14, 0.16, 0.14, 0, 0, TAU);
  g.fill();
  cut(g, () => {
    g.beginPath();
    g.ellipse(-0.25, -0.06, 0.18, 0.2, 0.2, 0, TAU);
    g.ellipse(0.25, -0.06, 0.18, 0.2, -0.2, 0, TAU);
    g.fill();
    poly(g, [0, 0.13, -0.09, 0.3, 0.09, 0.3]);
    g.fill();
    for (const x of [-0.19, 0, 0.19]) g.fillRect(x - 0.03, 0.42, 0.06, 0.22);
    g.fillRect(-0.36, 0.4, 0.72, 0.04);
  });
}

function bone(g: G, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy);
  const nx = -dy / l;
  const ny = dx / l;
  g.lineCap = 'round';
  g.lineWidth = 0.15;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  for (const [x, y] of [[x0, y0], [x1, y1]]) {
    g.beginPath();
    g.arc(x + nx * 0.085, y + ny * 0.085, 0.115, 0, TAU);
    g.arc(x - nx * 0.085, y - ny * 0.085, 0.115, 0, TAU);
    g.fill();
  }
}

function cutlass(g: G, flip: number) {
  g.save();
  g.scale(flip, 1);
  // blade: a gentle curve from the hilt (lower left) to the point (upper right)
  const pts: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = -0.52 + t * 1.42;
    const y = 0.52 - t * 1.42 + Math.sin(t * Math.PI) * 0.18;
    pts.push([x, y]);
  }
  taper(g, pts, 0.085, 0.012);
  // guard, grip and pommel
  g.lineCap = 'round';
  g.lineWidth = 0.09;
  g.beginPath();
  g.moveTo(-0.7, 0.36);
  g.quadraticCurveTo(-0.5, 0.5, -0.38, 0.72);
  g.stroke();
  g.lineWidth = 0.11;
  g.beginPath();
  g.moveTo(-0.55, 0.55);
  g.lineTo(-0.8, 0.8);
  g.stroke();
  g.beginPath();
  g.arc(-0.84, 0.84, 0.08, 0, TAU);
  g.fill();
  g.restore();
}

function sun(g: G) {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r = i % 2 ? 0.86 : 1;
    poly(g, [Math.cos(a - 0.13) * 0.5, Math.sin(a - 0.13) * 0.5, Math.cos(a) * r, Math.sin(a) * r, Math.cos(a + 0.13) * 0.5, Math.sin(a + 0.13) * 0.5]);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, 0.52, 0, TAU);
  g.fill();
  cut(g, () => {
    g.lineWidth = 0.11;
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const x = -0.42 + (i / 24) * 0.84;
      const y = 0.14 + Math.sin(i * 0.62) * 0.08;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  });
}

function anchor(g: G) {
  g.lineWidth = 0.1;
  g.beginPath();
  g.arc(0, -0.8, 0.14, 0, TAU);
  g.stroke();
  g.beginPath();
  g.roundRect(-0.065, -0.68, 0.13, 1.42, 0.05);
  g.fill();
  g.beginPath();
  g.roundRect(-0.44, -0.55, 0.88, 0.12, 0.06);
  g.fill();
  g.lineWidth = 0.13;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(0, 0.12, 0.6, 0.3, Math.PI - 0.3);
  g.stroke();
  for (const s of [-1, 1]) {
    const a = s > 0 ? 0.3 : Math.PI - 0.3;
    const x = Math.cos(a) * 0.6;
    const y = 0.12 + Math.sin(a) * 0.6;
    poly(g, [x + s * 0.02, y - 0.3, x + s * 0.2, y + 0.06, x - s * 0.12, y + 0.04]);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0.74, 0.1, 0, TAU);
  g.fill();
}

function kraken(g: G) {
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const k = i < 3 ? i : i - 3; // 0 inner .. 2 outer
    let x = side * (0.08 + k * 0.13);
    let y = -0.1;
    let ang = Math.PI / 2 - side * (0.15 + k * 0.42);
    const pts: [number, number][] = [[x, y]];
    const n = 20;
    const len = 1.05 - k * 0.12;
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      ang -= side * (t * t * 0.55 + 0.02);
      x += Math.cos(ang) * (len / n);
      y += Math.sin(ang) * (len / n);
      pts.push([x, y]);
    }
    taper(g, pts, 0.1, 0.018);
  }
  g.beginPath();
  g.ellipse(0, -0.42, 0.43, 0.5, 0, 0, TAU);
  g.fill();
  cut(g, () => {
    g.beginPath();
    g.arc(-0.17, -0.28, 0.1, 0, TAU);
    g.arc(0.17, -0.28, 0.1, 0, TAU);
    g.fill();
  });
  g.beginPath();
  g.arc(-0.15, -0.3, 0.04, 0, TAU);
  g.arc(0.19, -0.3, 0.04, 0, TAU);
  g.fill();
}

function compass(g: G) {
  const pts: number[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU - Math.PI / 2;
    const r = i % 2 ? 0.17 : i % 4 === 0 ? 1 : 0.6;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  poly(g, pts);
  g.fill();
  g.lineWidth = 0.07;
  g.beginPath();
  g.arc(0, 0, 0.5, 0, TAU);
  g.stroke();
  cut(g, () => {
    // half of every long point is hollowed for that engraved look
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU - Math.PI / 2;
      poly(g, [0, 0, Math.cos(a) * 0.86, Math.sin(a) * 0.86, Math.cos(a + 0.3) * 0.15, Math.sin(a + 0.3) * 0.15]);
      g.fill();
    }
    g.beginPath();
    g.arc(0, 0, 0.07, 0, TAU);
    g.fill();
  });
}

function crown(g: G) {
  poly(g, [-0.72, 0.5, -0.72, 0.2, -0.86, -0.42, -0.42, -0.04, 0, -0.64, 0.42, -0.04, 0.86, -0.42, 0.72, 0.2, 0.72, 0.5]);
  g.fill();
  for (const [x, y] of [[-0.86, -0.5], [0, -0.74], [0.86, -0.5]]) {
    g.beginPath();
    g.arc(x, y, 0.11, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.roundRect(-0.8, 0.5, 1.6, 0.2, 0.06);
  g.fill();
  cut(g, () => {
    g.fillRect(-0.72, 0.17, 1.44, 0.05);
    for (const x of [-0.42, 0, 0.42]) {
      g.beginPath();
      g.ellipse(x, 0.35, 0.08, 0.1, 0, 0, TAU);
      g.fill();
    }
  });
}

function trident(g: G) {
  g.beginPath();
  g.roundRect(-0.055, -0.36, 0.11, 1.32, 0.04);
  g.fill();
  g.lineWidth = 0.1;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-0.44, -0.62);
  g.quadraticCurveTo(-0.44, -0.24, 0, -0.24);
  g.quadraticCurveTo(0.44, -0.24, 0.44, -0.62);
  g.stroke();
  g.beginPath();
  g.moveTo(0, -0.3);
  g.lineTo(0, -0.7);
  g.stroke();
  for (const [x, top] of [[-0.44, -0.92], [0, -1], [0.44, -0.92]]) {
    poly(g, [x, top, x + 0.15, top + 0.3, x + 0.05, top + 0.26, x, top + 0.36, x - 0.05, top + 0.26, x - 0.15, top + 0.3]);
    g.fill();
  }
  g.beginPath();
  g.roundRect(-0.12, 0.1, 0.24, 0.1, 0.04);
  g.roundRect(-0.12, 0.3, 0.24, 0.1, 0.04);
  g.fill();
}

function hourglass(g: G) {
  g.beginPath();
  g.roundRect(-0.6, -0.92, 1.2, 0.16, 0.07);
  g.roundRect(-0.6, 0.76, 1.2, 0.16, 0.07);
  g.fill();
  g.fillRect(-0.54, -0.8, 0.08, 1.6);
  g.fillRect(0.46, -0.8, 0.08, 1.6);
  const glass = () => {
    g.beginPath();
    g.moveTo(-0.36, -0.76);
    g.bezierCurveTo(-0.36, -0.2, -0.06, -0.12, -0.06, 0);
    g.bezierCurveTo(-0.06, 0.12, -0.36, 0.2, -0.36, 0.76);
    g.lineTo(0.36, 0.76);
    g.bezierCurveTo(0.36, 0.2, 0.06, 0.12, 0.06, 0);
    g.bezierCurveTo(0.06, -0.12, 0.36, -0.2, 0.36, -0.76);
    g.closePath();
  };
  g.lineWidth = 0.07;
  glass();
  g.stroke();
  g.save();
  glass();
  g.clip();
  g.fillRect(-0.4, 0.42, 0.8, 0.4);
  g.beginPath();
  g.moveTo(-0.3, 0.44);
  g.quadraticCurveTo(0, 0.22, 0.3, 0.44);
  g.fill();
  g.fillRect(-0.4, -0.42, 0.8, 0.32);
  g.fillRect(-0.02, -0.1, 0.04, 0.55);
  g.restore();
}

function shark(g: G) {
  g.beginPath();
  g.moveTo(0.98, 0.02);
  g.quadraticCurveTo(0.7, -0.3, 0.28, -0.3);
  g.lineTo(0.04, -0.82);
  g.quadraticCurveTo(-0.04, -0.5, -0.2, -0.27);
  g.quadraticCurveTo(-0.45, -0.18, -0.64, -0.08);
  g.lineTo(-0.98, -0.52);
  g.quadraticCurveTo(-0.84, -0.1, -0.86, 0.02);
  g.quadraticCurveTo(-0.9, 0.2, -0.94, 0.42);
  g.lineTo(-0.62, 0.08);
  g.quadraticCurveTo(-0.2, 0.26, 0.2, 0.24);
  g.lineTo(0.06, 0.56);
  g.lineTo(0.42, 0.22);
  g.quadraticCurveTo(0.8, 0.18, 0.98, 0.02);
  g.closePath();
  g.fill();
  cut(g, () => {
    g.beginPath();
    g.arc(0.62, -0.1, 0.055, 0, TAU);
    g.fill();
    g.lineWidth = 0.035;
    g.lineCap = 'round';
    for (const x of [0.3, 0.38, 0.46]) {
      g.beginPath();
      g.moveTo(x, -0.1);
      g.quadraticCurveTo(x - 0.04, 0.0, x, 0.1);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0.92, 0.06);
    g.quadraticCurveTo(0.76, 0.14, 0.6, 0.1);
    g.stroke();
  });
}

function helm(g: G) {
  g.lineCap = 'round';
  g.lineWidth = 0.08;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    g.beginPath();
    g.moveTo(Math.cos(a) * 0.15, Math.sin(a) * 0.15);
    g.lineTo(Math.cos(a) * 0.86, Math.sin(a) * 0.86);
    g.stroke();
    g.beginPath();
    g.ellipse(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.09, 0.09, 0, 0, TAU);
    g.fill();
  }
  g.lineWidth = 0.13;
  g.beginPath();
  g.arc(0, 0, 0.58, 0, TAU);
  g.stroke();
  g.lineWidth = 0.04;
  g.beginPath();
  g.arc(0, 0, 0.42, 0, TAU);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, 0.2, 0, TAU);
  g.fill();
  cut(g, () => {
    g.beginPath();
    g.arc(0, 0, 0.07, 0, TAU);
    g.fill();
  });
}

function star(g: G) {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const r = i % 2 ? 0.42 : 1;
    pts.push(Math.cos(a) * r, Math.sin(a) * r + 0.06);
  }
  poly(g, pts);
  g.fill();
}

function heart(g: G) {
  g.beginPath();
  g.moveTo(0, 0.86);
  g.bezierCurveTo(-0.5, 0.48, -1.0, 0.1, -0.9, -0.35);
  g.bezierCurveTo(-0.8, -0.8, -0.2, -0.86, 0, -0.42);
  g.bezierCurveTo(0.2, -0.86, 0.8, -0.8, 0.9, -0.35);
  g.bezierCurveTo(1.0, 0.1, 0.5, 0.48, 0, 0.86);
  g.fill();
  cut(g, () => {
    g.beginPath();
    g.ellipse(-0.45, -0.38, 0.12, 0.2, -0.6, 0, TAU);
    g.fill();
  });
}

function moon(g: G) {
  g.beginPath();
  g.arc(0, 0, 0.82, 0, TAU);
  g.fill();
  cut(g, () => {
    g.beginPath();
    g.arc(0.36, -0.2, 0.7, 0, TAU);
    g.fill();
  });
  // a little star in the crescent's arms
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const r = i % 2 ? 0.08 : 0.2;
    pts.push(0.42 + Math.cos(a) * r, 0.18 + Math.sin(a) * r);
  }
  poly(g, pts);
  g.fill();
}

function parrot(g: G) {
  // tail feathers
  taper(g, [[-0.05, 0.3], [-0.2, 0.62], [-0.36, 0.98]], 0.16, 0.05);
  taper(g, [[0.05, 0.3], [0.02, 0.66], [-0.06, 1.0]], 0.14, 0.04);
  // body & wing
  g.beginPath();
  g.ellipse(0, 0.02, 0.36, 0.52, -0.25, 0, TAU);
  g.fill();
  // head
  g.beginPath();
  g.arc(0.14, -0.5, 0.3, 0, TAU);
  g.fill();
  // beak
  g.beginPath();
  g.moveTo(0.38, -0.62);
  g.quadraticCurveTo(0.68, -0.6, 0.62, -0.28);
  g.quadraticCurveTo(0.52, -0.4, 0.38, -0.36);
  g.closePath();
  g.fill();
  // perch
  g.beginPath();
  g.roundRect(-0.6, 0.46, 1.2, 0.09, 0.045);
  g.fill();
  cut(g, () => {
    g.beginPath();
    g.arc(0.2, -0.54, 0.06, 0, TAU);
    g.fill();
    g.lineWidth = 0.04;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(-0.16 + i * 0.04, -0.12 + i * 0.16);
      g.quadraticCurveTo(0.08, -0.02 + i * 0.16, 0.2 + i * 0.01, -0.2 + i * 0.18);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0.42, -0.42);
    g.lineTo(0.56, -0.44);
    g.stroke();
  });
}

const EMBLEM_DRAW: Record<EmblemId, (g: G) => void> = {
  none: () => {},
  skull,
  sun,
  anchor,
  swords: (g) => {
    cutlass(g, 1);
    cutlass(g, -1);
  },
  kraken,
  compass,
  crown,
  trident,
  hourglass,
  shark,
  helm,
  star,
  heart,
  moon,
  parrot,
};

function backing(g: G, id: BackingId) {
  switch (id) {
    case 'bones':
      bone(g, -0.78, -0.1, 0.78, 0.86);
      bone(g, 0.78, -0.1, -0.78, 0.86);
      break;
    case 'swords':
      g.save();
      g.scale(1.12, 1.12);
      cutlass(g, 1);
      cutlass(g, -1);
      g.restore();
      break;
    case 'ring':
      g.lineWidth = 0.09;
      g.beginPath();
      g.arc(0, 0, 0.93, 0, TAU);
      g.stroke();
      g.lineWidth = 0.035;
      g.beginPath();
      g.arc(0, 0, 0.8, 0, TAU);
      g.stroke();
      break;
    case 'laurel':
      g.lineWidth = 0.04;
      for (const [a0, a1] of [[-0.9, 1.3], [Math.PI - 1.3, Math.PI + 0.9]]) {
        g.beginPath();
        g.arc(0, 0, 0.84, a0, a1);
        g.stroke();
        for (let i = 0; i < 8; i++) {
          const a = a0 + ((i + 0.5) / 8) * (a1 - a0);
          for (const o of [-1, 1]) {
            const r = 0.84 + o * 0.075;
            g.beginPath();
            g.ellipse(Math.cos(a) * r, Math.sin(a) * r, 0.14, 0.06, a + Math.PI / 2 + o * 0.55, 0, TAU);
            g.fill();
          }
        }
      }
      break;
    case 'rays':
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        poly(g, [Math.cos(a - 0.07) * 0.6, Math.sin(a - 0.07) * 0.6, Math.cos(a) * 1.0, Math.sin(a) * 1.0, Math.cos(a + 0.07) * 0.6, Math.sin(a + 0.07) * 0.6]);
        g.fill();
      }
      break;
    default:
      break;
  }
}

/** Where the emblem sits relative to its backing. */
function emblemFrame(b: BackingId): [number, number] {
  switch (b) {
    case 'bones':
      return [-0.2, 0.72];
    case 'swords':
      return [0, 0.68];
    case 'ring':
    case 'laurel':
      return [0, 0.62];
    case 'rays':
      return [0, 0.56];
    default:
      return [0, 1];
  }
}

/**
 * Draws an emblem with its backing, centred at cx, cy, about `size` px across.
 * Overlaps are separated by a thin cut so same-coloured parts still read.
 */
export function drawEmblem(g: G, cx: number, cy: number, size: number, emblem: EmblemId, back: BackingId, color: string) {
  if (emblem === 'none' && back === 'none') return;
  const S = Math.ceil(size * 1.1);
  const [ec, eg] = canvas(S, S);
  const [bc, bg] = canvas(S, S);
  const unit = size / 2;
  const [oy, sc] = emblem === 'none' ? [0, 1] : emblemFrame(back);
  eg.translate(S / 2, S / 2 + oy * unit);
  eg.scale(unit * sc, unit * sc);
  eg.fillStyle = eg.strokeStyle = color;
  EMBLEM_DRAW[emblem](eg);
  if (back !== 'none') {
    bg.translate(S / 2, S / 2);
    bg.scale(unit, unit);
    bg.fillStyle = bg.strokeStyle = color;
    backing(bg, back);
    bg.setTransform(1, 0, 0, 1, 0, 0);
    // carve a little halo around the emblem out of the backing
    bg.globalCompositeOperation = 'destination-out';
    const o = unit * 0.065;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      bg.drawImage(ec, Math.cos(a) * o, Math.sin(a) * o);
    }
    bg.globalCompositeOperation = 'source-over';
    bg.drawImage(ec, 0, 0);
    g.drawImage(bc, cx - S / 2, cy - S / 2);
  } else g.drawImage(ec, cx - S / 2, cy - S / 2);
}

// ------------------------------------------------------------------ paint layer

const paintCache = new Map<string, CanvasImageSource>();
let live: { key: string; src: CanvasImageSource } | null = null;
const paintListeners = new Set<() => void>();

/** Registers a canvas that stands in for `key` while it is being painted. */
export function setLivePaint(key: string, src: CanvasImageSource | null) {
  live = src ? { key, src } : null;
}

export function seedPaint(key: string, src: CanvasImageSource) {
  paintCache.set(key, src);
}

export function onPaintReady(fn: () => void) {
  paintListeners.add(fn);
  return () => paintListeners.delete(fn);
}

/** Returns a drawable for a saved paint layer, decoding it in the background if needed. */
export function paintSource(key: string): CanvasImageSource | null {
  if (!key) return null;
  if (live && live.key === key) return live.src;
  const hit = paintCache.get(key);
  if (hit) return hit;
  if (!key.startsWith('data:image/')) return null;
  const img = new Image();
  img.onload = () => {
    paintCache.set(key, img);
    paintListeners.forEach((f) => f());
  };
  img.src = key;
  return null;
}

export function preloadPaint(key: string): Promise<void> {
  if (!key || paintSource(key)) return Promise.resolve();
  return new Promise((res) => {
    const off = onPaintReady(() => {
      if (paintCache.has(key)) {
        off();
        res();
      }
    });
    setTimeout(res, 1500);
  });
}

// ------------------------------------------------------------------ flags

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawPattern(g: G, w: number, h: number, p: FlagPattern, color: string) {
  g.fillStyle = color;
  g.strokeStyle = color;
  switch (p) {
    case 'band':
      g.fillRect(0, h * 0.36, w, h * 0.28);
      break;
    case 'split':
      g.fillRect(0, h * 0.5, w, h * 0.5);
      break;
    case 'hoist':
      g.fillRect(0, 0, w * 0.3, h);
      break;
    case 'diagonal':
      poly(g, [0, h, w, 0, w, h]);
      g.fill();
      break;
    case 'saltire':
      g.lineWidth = h * 0.17;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w, h);
      g.moveTo(w, 0);
      g.lineTo(0, h);
      g.stroke();
      break;
    case 'cross':
      g.fillRect(w * 0.3, 0, h * 0.18, h);
      g.fillRect(0, h * 0.41, w, h * 0.18);
      break;
    case 'border': {
      const b = h * 0.1;
      g.fillRect(0, 0, w, b);
      g.fillRect(0, h - b, w, b);
      g.fillRect(w - b * 1.6, 0, b * 1.6, h);
      g.fillRect(0, 0, b, h);
      break;
    }
    case 'stripes':
      for (let i = 1; i < 7; i += 2) g.fillRect(0, (i / 7) * h, w, h / 7);
      break;
    case 'chevron':
      poly(g, [0, 0, w * 0.42, h / 2, 0, h]);
      g.fill();
      break;
    default:
      break;
  }
}

/** Fly-edge cut for the flag shape (drawn as a hole). */
function cutShape(g: G, w: number, h: number, shape: FlagShape) {
  if (shape === 'square') return;
  cut(g, () => {
    if (shape === 'swallowtail') {
      poly(g, [w + 1, -1, w * 0.74, h / 2, w + 1, h + 1]);
      g.fill();
    } else if (shape === 'burgee') {
      poly(g, [w * 0.55, -1, w + 1, -1, w + 1, h + 1, w * 0.55, h + 1, w, h / 2]);
      g.fill();
    } else if (shape === 'tattered') {
      const rnd = mulberry(7);
      g.beginPath();
      g.moveTo(w + 1, -1);
      let y = -1;
      while (y < h + 1) {
        const x = w * (0.86 + rnd() * 0.13) - (rnd() < 0.18 ? w * 0.08 : 0);
        g.lineTo(x, y);
        y += h * (0.04 + rnd() * 0.07);
      }
      g.lineTo(w + 1, h + 1);
      g.closePath();
      g.fill();
      // shot holes and a frayed bottom corner
      for (const [hx, hy, r] of [[0.66, 0.24, 0.045], [0.78, 0.7, 0.035], [0.36, 0.84, 0.028]]) {
        g.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU;
          const rr = r * h * (0.7 + rnd() * 0.6);
          g.lineTo(hx * w + Math.cos(a) * rr, hy * h + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
      }
      poly(g, [w * 0.55, h + 1, w * 0.62, h * 0.94, w * 0.7, h + 1]);
      g.fill();
    }
  });
}

/** Paints a whole flag into a w × h box at the canvas origin. */
export function drawFlag(g: G, w: number, h: number, d: FlagDesign, opts: { cloth?: boolean; sleeve?: boolean } = {}) {
  g.save();
  g.clearRect(0, 0, w, h);
  g.fillStyle = d.bg;
  g.fillRect(0, 0, w, h);
  drawPattern(g, w, h, d.pattern, d.patternColor);
  const size = h * 0.68 * d.emblemScale;
  const cx = d.pattern === 'hoist' || d.pattern === 'chevron' || d.pattern === 'cross' ? w * 0.58 : w * 0.5;
  drawEmblem(g, cx, h * 0.5, size, d.emblem, d.backing, d.emblemColor);
  const paint = paintSource(d.paint);
  if (paint) g.drawImage(paint, 0, 0, w, h);
  if (opts.cloth !== false) {
    // a whisper of weave and a darker hoist sleeve
    g.globalAlpha = 0.05;
    g.fillStyle = '#000';
    for (let y = 0; y < h; y += Math.max(2, h / 48)) g.fillRect(0, y, w, 1);
    g.globalAlpha = 1;
  }
  if (opts.sleeve !== false) {
    const grad = g.createLinearGradient(0, 0, w * 0.06, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w * 0.06, h);
  }
  cutShape(g, w, h, d.shape);
  g.restore();
}

/** A standalone emblem tile for pickers. */
export function emblemThumb(emblem: EmblemId, back: BackingId, color: string, bg: string, px = 64): HTMLCanvasElement {
  const [c, g] = canvas(px, px);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, px, px, px * 0.22);
  g.fill();
  drawEmblem(g, px / 2, px / 2, px * 0.78, emblem, back, color);
  return c;
}

export function flagThumb(d: FlagDesign, w = 72, h = 46): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  drawFlag(g, w, h, d, { cloth: false, sleeve: false });
  return c;
}
