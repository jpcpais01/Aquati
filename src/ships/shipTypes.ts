export type ShipClassId = 'sloop' | 'brig' | 'galleon';

export interface MastDef {
  t: number; // 0 stern .. 1 bow
  height: number;
  rig: 'square' | 'gaff' | 'lateen';
  tiers: number; // square sails stacked on the mast
  top?: boolean; // fighting top platform
}

export interface ShipClass {
  id: ShipClassId;
  name: string;
  title: string;
  blurb: string;
  length: number;
  beam: number;
  draft: number;
  freeboard: number;
  bulwark: number;
  transom: number; // stern width ratio
  sheerBow: number;
  sheerStern: number;
  tumblehome: number;
  sternCastle?: { t: number; h: number };
  foreCastle?: { t: number; h: number };
  masts: MastDef[];
  bowsprit: number; // length
  jib: boolean;
  cannonsPerSide: number;
  cannonSpan: [number, number];
  chasers: number; // stern chasers (rear-firing)
  hp: number;
  armor: number; // 0..1 damage reduction
  maxSpeed: number; // m/s
  accel: number;
  turnRate: number; // rad/s at full way
  reload: number; // seconds per broadside
  damage: number; // per ball
  muzzleSpeed: number;
  mass: number; // buoyancy response (higher = calmer)
  // menu stat bars 0..1
  stats: { speed: number; agility: number; armour: number; hull: number; firepower: number };
}

export const SHIP_CLASSES: Record<ShipClassId, ShipClass> = {
  sloop: {
    id: 'sloop',
    name: 'Sloop',
    title: 'Kestrel',
    blurb: 'A darting single-master. Outruns anything afloat and turns on a doubloon, but splinters easily.',
    length: 15,
    beam: 4.6,
    draft: 1.5,
    freeboard: 1.55,
    bulwark: 0.7,
    transom: 0.62,
    sheerBow: 0.75,
    sheerStern: 0.35,
    tumblehome: 0.06,
    masts: [{ t: 0.6, height: 14.5, rig: 'gaff', tiers: 1 }],
    bowsprit: 5.5,
    jib: true,
    cannonsPerSide: 3,
    cannonSpan: [0.3, 0.72],
    chasers: 0,
    hp: 260,
    armor: 0.08,
    maxSpeed: 15.5,
    accel: 0.55,
    turnRate: 0.95,
    reload: 2.4,
    damage: 21,
    muzzleSpeed: 58,
    mass: 1,
    stats: { speed: 1, agility: 1, armour: 0.25, hull: 0.33, firepower: 0.3 },
  },
  brig: {
    id: 'brig',
    name: 'Brigantine',
    title: 'Corsair',
    blurb: 'The balanced raider. Two masts of canvas, a respectable broadside and a hull that can take a beating.',
    length: 21,
    beam: 6.2,
    draft: 2.1,
    freeboard: 1.9,
    bulwark: 0.85,
    transom: 0.7,
    sheerBow: 0.95,
    sheerStern: 0.55,
    tumblehome: 0.09,
    sternCastle: { t: 0.24, h: 1.35 },
    masts: [
      { t: 0.38, height: 18, rig: 'square', tiers: 2, top: true },
      { t: 0.68, height: 19.5, rig: 'square', tiers: 2, top: true },
    ],
    bowsprit: 6.5,
    jib: true,
    cannonsPerSide: 5,
    cannonSpan: [0.27, 0.78],
    chasers: 1,
    hp: 430,
    armor: 0.24,
    maxSpeed: 12.2,
    accel: 0.38,
    turnRate: 0.62,
    reload: 3.2,
    damage: 24,
    muzzleSpeed: 60,
    mass: 1.6,
    stats: { speed: 0.72, agility: 0.62, armour: 0.55, hull: 0.6, firepower: 0.6 },
  },
  galleon: {
    id: 'galleon',
    name: 'Galleon',
    title: 'Leviathan',
    blurb: 'A floating fortress with three masts and towering castles. Slow to turn, devastating when she does.',
    length: 29,
    beam: 8.6,
    draft: 2.8,
    freeboard: 2.3,
    bulwark: 0.95,
    transom: 0.78,
    sheerBow: 1.3,
    sheerStern: 0.9,
    tumblehome: 0.13,
    sternCastle: { t: 0.27, h: 2.1 },
    foreCastle: { t: 0.84, h: 1.3 },
    masts: [
      { t: 0.22, height: 19, rig: 'lateen', tiers: 1 },
      { t: 0.5, height: 26, rig: 'square', tiers: 3, top: true },
      { t: 0.74, height: 23, rig: 'square', tiers: 3, top: true },
    ],
    bowsprit: 8,
    jib: true,
    cannonsPerSide: 8,
    cannonSpan: [0.2, 0.82],
    chasers: 2,
    hp: 760,
    armor: 0.4,
    maxSpeed: 8.8,
    accel: 0.24,
    turnRate: 0.38,
    reload: 4.2,
    damage: 26,
    muzzleSpeed: 62,
    mass: 2.6,
    stats: { speed: 0.42, agility: 0.3, armour: 0.95, hull: 1, firepower: 1 },
  },
};

export interface Livery {
  id: string;
  hull: string; // planking base
  bottom: string;
  boot: string;
  strake: string;
  wale: string;
  trim: string;
  sail: string;
  sailSeam: string;
  emblem: 'sun' | 'skull' | 'none';
  emblemColor: string;
  flag: string;
  flag2: string;
}

export const PLAYER_LIVERY: Livery = {
  id: 'player',
  hull: '#7a4b2a',
  bottom: '#b33a2c',
  boot: '#f5efe1',
  strake: '#1f8a8a',
  wale: '#21160f',
  trim: '#e2b552',
  sail: '#f4ead4',
  sailSeam: '#d9c9a8',
  emblem: 'sun',
  emblemColor: '#d79b2e',
  flag: '#1fa3a0',
  flag2: '#f2c45a',
};

export const PIRATE_LIVERIES: Livery[] = [
  {
    id: 'pirate-crimson',
    hull: '#3f2a1e',
    bottom: '#2c2a2a',
    boot: '#d9d2c3',
    strake: '#9c2a2a',
    wale: '#140d0a',
    trim: '#c9a25a',
    sail: '#3a3634',
    sailSeam: '#2a2624',
    emblem: 'skull',
    emblemColor: '#efe6d6',
    flag: '#141212',
    flag2: '#efe6d6',
  },
  {
    id: 'pirate-violet',
    hull: '#4a3324',
    bottom: '#3b2f3a',
    boot: '#e5dccb',
    strake: '#5b3a7a',
    wale: '#18100c',
    trim: '#d4b26a',
    sail: '#d8cdb8',
    sailSeam: '#bfb39a',
    emblem: 'skull',
    emblemColor: '#2a2224',
    flag: '#1a1414',
    flag2: '#e9e1d2',
  },
];
