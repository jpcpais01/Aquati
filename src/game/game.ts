import * as THREE from 'three';
import { staticLod } from '../render/staticLod';
import { viewCull } from '../render/viewCull';
import { setBowWaveScene } from '../fx/bowWave';
import { angleDelta, clamp, lerp, smoothstep } from '../core/noise';
import { Input } from '../core/input';
import { Audio } from '../core/audio';
import { detectQuality, QualityProfile, ResolutionScaler } from '../core/quality';
import { Profiler } from '../core/profiler';
import { GraphicsSettings, Settings } from '../core/settings';
import { globalUniforms, SkyEnvironment } from '../render/environment';
import { freezeStatic, sealStatic, skipWhenHidden } from '../render/staticScene';
import { initLod, lodUploads } from '../render/lod';
import { Pipeline } from '../render/pipeline';
import { BufferPreloader, warmDrawSliced } from '../render/warmup';
import { installSoftShadows, updateSoftShadows } from '../render/softShadows';
import { Particles } from '../fx/particles';
import { Fireworks } from '../fx/fireworks';
import { Bubbles } from '../fx/bubbles';
import { Birds } from '../fx/birds';
import { ReefLife } from '../fx/fish';
import { Wildlife } from '../fx/wild/wildlife';
import { Debris, Pusher } from '../fx/debris';
import { WindField, WindWisps } from '../fx/wind';
import { Spirits, SpiritFrom } from '../fx/spirits';
import { Rain } from '../fx/rain';
import { Spindrift } from '../fx/spindrift';
import { RareSkies } from './rareSkies';
import { seaGlowAt } from '../world/seaGlow';
import { LowClouds } from '../world/clouds';
import { Lightning } from '../fx/lightning';
import { Terrain } from '../world/terrain';
import type { TerrainLod } from '../world/terrainLod';
import { Seas } from '../world/seas';
import { clampToRegion, HIGH_SEAS_R, nearestRegion, Region, RegionId, regionById, REGIONS, seaEdge, STREAM_R } from '../world/regions';
import { Dolphins } from '../fx/dolphins';
import { Whales } from '../fx/whales';
import { ChartStore } from './charts';
import { Vegetation } from '../world/vegetation';
import { Grass, GRASS_PUSHERS } from '../world/grass';
import { emptyDraws, installPassCulling, skipEmptyDraws } from '../render/passCull';
import { Ocean } from '../world/ocean';
import { buildShore, setShoreField, setSurf } from '../world/shore';
import { WakeField } from '../world/wakeField';
import { buildWaves, setSeaState, turnWaves, Wave } from '../world/waves';
import { Atmosphere, AtmosSnapshot, TIMES, WEATHER, WeatherKind } from '../world/atmosphere';
import { Ship } from '../ships/ship';
import { Pack, PirateAI } from '../ships/ai';
import { CrewSystem } from '../ships/crew';
import { loadFigureheads } from '../ships/figureheads';
import { ShipModel } from '../ships/shipModel';
import { GHOST_LIVERY, Livery, PIRATE_LIVERIES, SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { hullKey, loadDesigns, loadLook, lookToLivery, saveLook, ShipLook } from '../ships/look';
import { onPaintReady, preloadPaint } from '../ships/heraldry';
import { UI } from '../ui/ui';
import { readStartSea, SeaCard, SeaPick } from '../ui/seaPick';
import { loadRecords, type VoyageEvent, type WreckReport } from '../ui/wreck';
import { SHAKE_SCALE } from '../ui/settings';
import { GraphicsPanel } from '../ui/graphics';
import { Customizer, SwTab } from '../ui/customizer';
import { Vault } from '../ui/vault';
import { PhotoMode } from '../ui/photo';
import { BASE, FxItem, fxItem, Item as Cosmetic, POOL, SkinItem, skinItem, VaultStore } from '../ships/cosmetics';
import { chestPart, Found, loadoutStats, part as partById, PART_RARITIES, PartSlot, PartStore, PartTier, pirateFit, portStock, refit, rollPart, SLOT_NAMES } from '../ships/parts';
import { partIcon } from '../ui/partArt';
import { Cloud, Part } from '../cloud/cloud';
import { ADMIN_GOLD } from '../cloud/admin';
import { markWorldReset } from '../cloud/profile';
import { AccountPanel } from '../ui/account';
import { StageShot, VaultStage } from './vaultStage';
import { Port, PortFocus } from '../port/port';
import { findPortSite, findTradeSites, portClearings } from '../port/site';
import { TradePort, TradePorts } from '../port/tradePort';
import { Festivals, FULL_MOON } from '../port/festival';
import { LanternBoats } from '../fx/lanternBoats';
import { Aboard, holdPeek, MarketUI, WareOffer } from '../ui/market';
import { Convoy, Convoys, Merchant, MERCHANT_KINDS, merchantKindOf } from './convoys';
import { lootIcon } from '../ui/lootArt';
import { HOLD_ROOM, Hold, LOOT, LootId, RARITIES, rollContents, rollGood, Stowed } from './treasure';
import { Kraken } from './kraken';
import { BRUMAS_NAMES, Hazards, NAMES as MAELSTROM_NAMES } from './hazards';
import { vortexDepth } from '../world/vortex';
import { HazardHud, HazardView } from '../ui/hazard';
import type { HazardMark } from '../ui/chart';
import { KrakenHud, KrakenReward } from '../ui/kraken';
import { CameraRig } from './cameraRig';
import { Gunnery, Side } from './gunnery';
import { Captain } from './captain';
import { Boarding } from './boarding';
import { createSkyDome } from '../render/sky';
import { SkyCumulus } from '../render/cumulus';
import { Projectiles } from './projectiles';
import { Item, Loot, RARITY } from './loot';
import { Pin, PIN_COLORS, Waypoints } from './waypoints';
import { Autopilot, HelmTarget } from './autopilot';
import { fmtDist } from '../ui/chart';
import { fmtEta, type ChartCardInfo } from '../ui/helm';
import { AMMO, AMMO_ORDER, AmmoId, AmmoStock, SPECIALS, ammoLoot, freshStock } from './ammo';
import { FIREWORKS, FireworkCounts, FireworkId, FireworkLocker, fireworkLoot, FW_ORDER, pyroStock } from './fireworks';
import { fireworkIcon } from '../ui/fireworkArt';
import { ShipStatus, World } from './world';
import { campClearings, digSite, Disc, findCampSites, Ground, Landing } from '../shore/ground';
import { Camp, Shore, ShoreInput } from '../shore/shore';
import type { Walker } from '../shore/walker';
import { PartyRow, ShoreHud, FoeBar } from '../ui/shore';
import { rollTier } from './loot';
import { BountyBook, CAPTAIN, CAPTAINS, HEAT_BONUS, HUNTER_HULL, hunterLivery, huntersEarned, KILL_INFAMY, NamedCaptain, REPUTE, wantedLevel } from './bounty';
import { BountyBanner, BountyBoard, portrait, WantedHud } from '../ui/bounty';
import { Bottle, Drift } from './drift';
import { Raft, Survivors, survivorsOf } from './survivors';
import { bountyNews, feastNews, lostLetter, mapLetter, prizeNews, rivalLetter, rumourNews, survivorThanks } from './tidings';
import { LetterCard, LetterView } from '../ui/letter';
import { DigTarget, TreasureMaps } from './treasureMaps';
import { TreasureMapUI } from '../ui/treasureMap';
import { EscortAI, EscortRec, FleetStore, holdCargo, hireOffers, Order, ORDER_INFO, ORDERS, prizeMaster, SeaMark, station } from './fleet';
import { EscortRow, FleetHud } from '../ui/fleet';
import { Fort, FORT_RANGE, Forts, FortStore, Gun, HAVEN_R, TRIBUTE_HOUR } from './forts';
import { BRUMAS_FORT_KINDS, BRUMAS_FORT_NAMES, findFortSites, fortClearings } from '../shore/fortKit';
import { shoreMats } from '../shore/kit';
import { FortHud } from '../ui/fort';
import { PeaceHud } from '../ui/peace';
import { FORGET, FORT_RALLY, HUNTER_RALLY, RALLY, setSideOf, sideOf } from './peace';
import { gunRange } from '../ships/ship';
import { Coop, CoopGame, Recipe, Role } from '../net/coop';
import { CrewPanel } from '../ui/crew';

/** Image-based sky light. Kept a little under the sun so lit faces and shade read apart. */
const SKY_LIGHT = 0.72;
const _a = new THREE.Vector3();
const _shear = new THREE.Matrix4();
/** Heights the sun's shadow map spans: masts, peaks and birds down to the seabed. */
const SHADOW_TOP = 320;
const SHADOW_FLOOR = -140;
import { ShipCollisions } from './collisions';
import { FootEye } from './footEye';

type State = 'loading' | 'menu' | 'port' | 'playing' | 'paused' | 'docked' | 'dead';

const PIRATE_NAMES = [
  'Black Gull', 'Salt Widow', 'Crimson Tide', 'Grim Mariner', 'Sea Wraith', 'Rusty Anchor', 'Dread Marlin', 'Bone Siren',
  'Gilded Shark', 'Howling Jenny', 'Midnight Eel', 'Scarlet Kraken',
];

/** Ships the sea gave back. */
const GHOST_NAMES = [
  'Drowned Widow', 'Hollow Crown', 'Weeping Anne', 'Pale Regret', 'Grey Mourner', 'Last Lament', 'Sorrowtide',
  'Unquiet Mary', 'Lantern of the Lost', 'Kraken\'s Bride', 'Silent Bell', 'Ashen Covenant',
];

/** `?ghosts` in the address: every pirate that can be a ghost is one (for a look at them). */
const ALL_GHOSTS = new URLSearchParams(location.search).has('ghosts');

/** Seconds into the farewell when the camera follows her under. */
const DIVE = 8.6;
/** Lasting wrecks kept afloat at once, and how far from you one may linger. */
const MAX_WRECKS = 3;
const WRECK_REACH = 520;

const _cineV = new THREE.Vector3();
const _swayV = new THREE.Vector3();
/** Who parts the grass this frame (see Grass.setPushers). */
const _pushers: { x: number; y: number; z: number }[] = [];
/** Planking torn from a sinking hull. */
const WRECK_TIMBER = [new THREE.Color(0.42, 0.29, 0.18), new THREE.Color(0.55, 0.4, 0.26), new THREE.Color(0.33, 0.24, 0.16)];

const BOARD_SEEN_KEY = 'aquati.boardSeen';
/** Walking islands through the captain's eyes ('1', the default) or from above ('0'). */
const SHORE_EYE_KEY = 'aquati.shoreEye';
const loadShoreEye = () => {
  try {
    return localStorage.getItem(SHORE_EYE_KEY) !== '0';
  } catch {
    return true;
  }
};
/** The camera view you last sailed with (zoom 0..1 and the cinematic lean), restored on the next launch. */
const VIEW_KEY = 'aquati.view';
const loadView = (): { zoom: number; tilt: number } | null => {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
    return v && Number.isFinite(v.zoom) && Number.isFinite(v.tilt) ? v : null;
  } catch {
    return null;
  }
};
/** `?maelstrom` / `?reef` set sail a little way off the first maelstrom / reef (for trying them out). */
const HAZARD_TEST = typeof location !== 'undefined' ? (/[?&]maelstrom\b/.test(location.search) ? 'maelstrom' : /[?&]reef\b/.test(location.search) ? 'reef' : null) : null;
/** `?brumas` / `?highseas` set sail off Las Brumas / out on the high seas between the archipelagos (for a look). */
const SEA_TEST = typeof location !== 'undefined' ? (/[?&]brumas\b/.test(location.search) ? 'brumas' : /[?&]highseas\b/.test(location.search) ? 'highseas' : /[?&]convoy\b/.test(location.search) ? 'convoy' : null) : null;
/** `?kraken` brews a storm at once and sends the Kraken a few seconds into the voyage. */
const KRAKEN_TEST = typeof location !== 'undefined' && /[?&]kraken\b/.test(location.search);

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/** Every texture a model's materials use (uploaded a frame at a time before she's drawn). */
/** Where `at` lies from `ship`, the way a lookout calls it: "off the starboard bow", "dead ahead"... */
function bearing(ship: Ship, at: THREE.Vector3) {
  const fx = Math.sin(ship.heading);
  const fz = Math.cos(ship.heading);
  const dx = at.x - ship.pos.x;
  const dz = at.z - ship.pos.z;
  const ahead = dx * fx + dz * fz;
  const port = dx * fz - dz * fx;
  const a = Math.atan2(Math.abs(port), ahead);
  const side = port > 0 ? 'port' : 'starboard';
  if (a < 0.2) return 'dead ahead';
  if (a > Math.PI - 0.25) return 'astern';
  return a < 1.1 ? `off the ${side} bow` : a < 2.05 ? `on the ${side} beam` : `off the ${side} quarter`;
}

function texturesOf(root: THREE.Object3D): THREE.Texture[] {
  const out = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) for (const v of Object.values(mat)) if (v instanceof THREE.Texture) out.add(v);
  });
  return [...out];
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private quality: QualityProfile;
  private pipeline: Pipeline;
  private scaler = new ResolutionScaler();
  private opaque = new THREE.Scene();
  private water = new THREE.Scene();
  private rig: CameraRig;
  private sun: THREE.DirectionalLight;
  private input: Input;
  private audio = new Audio();
  private ui = new UI();
  private terrain!: Seas;
  /**
   * The archipelagos, one seamless sea (see world/regions.ts). Each keeps its
   * land in a group of its own, drawn only within STREAM_R of it, and its own
   * seabed and surf fields for the water shaders, swapped in out on the high
   * seas where neither reaches (see updateSeas).
   */
  private regions: { region: Region; terrain: Terrain; land: THREE.Group; seabed: THREE.DataTexture; surf: THREE.DataTexture }[] = [];
  private liveRegion = 0;
  /** Out past every archipelago: no pirates, a calm theme and the dolphins. */
  private onHighSeas = false;
  private seasT = 0;
  /** Seconds until the next dolphin pod may come. */
  private dolphinT = 20;
  private dolphins = new Dolphins();
  /** Seconds until the next pod of humpbacks may pass on its migration. */
  private whaleT = 40;
  private whales = new Whales();
  /** A breach in the golden light has been called this voyage. */
  private goldenBreach = false;
  /** Merchant convoys crossing the high seas, and the one you're alongside trading with. */
  private convoys!: Convoys;
  private trader: Merchant | null = null;
  /** The fighting ships and the merchantmen afloat together, for the crews, collisions and charts. */
  private afloat: Ship[] = [];
  private charts = new ChartStore();
  /** "Where shall we sail?": the archipelago picker after Set Sail. */
  private seaPick = new SeaPick();
  private ocean!: Ocean;
  private wake!: WakeField;
  private particles!: Particles;
  /** Air beneath the waves and the drifting snow, for the farewell's dive. */
  private bubbles!: Bubbles;
  private world!: World;
  private projectiles = new Projectiles();
  private loot = new Loot();
  private waypoints = new Waypoints();
  /** The helmsman: sails her to a place picked on the sea chart (see autopilot.ts). */
  private pilot!: Autopilot;
  /** What the chart's card is open over: the course it offers, and the mark's colour. */
  private chartSel: { target: HelmTarget; card: ChartCardInfo; pin: Pin | null; css: string } | null = null;
  private debris = new Debris();
  /** Bottles, driftwood and kelp mats out on the open sea (see drift.ts). */
  private drift = new Drift();
  /** Pirates' hands clinging to the wreckage of their ship (see survivors.ts). */
  private survivors!: Survivors;
  private letter!: LetterCard;
  /** Survivors who signed on this voyage: each one makes the gun crews a little quicker. */
  private rescued = 0;
  private rescuable: Raft | null = null;
  private rescueT = 0;
  private cryT = 0;
  /** News waiting for the carrier gull, and the breather between her flights. */
  private gullNews: (() => void)[] = [];
  private gullCool = 0;
  private rumourT = 0;
  /** The feast the gull last brought word of, and when to look again. */
  private feastTold = '';
  private feastT = 0;
  /** Pirates sunk since the last purse of prize money. */
  private prizeKills = 0;
  private collisions = new ShipCollisions(() => this.player);
  private pushers: Pusher[] = [];
  private wrecks: Ship[] = [];
  private ships: Ship[] = [];
  /**
   * Pirate hulls built ahead of time, a slice per frame, so a ship (or a whole
   * flotilla) can sail in without the frame it appears in having to build it.
   */
  private shipyard: ShipModel[] = [];
  private keel: ShipModel | null = null;
  /** World time until which the yard downs tools: a sinking is busy enough on its own. */
  private yardIdleUntil = 0;
  /** One ghost hull kept ready (built like the pirates', a slice at a time), and the ghost who keeps her shaders compiled. */
  private ghostyard: ShipModel | null = null;
  ghostKeeper: Ship | null = null;
  private ghostIdx = Math.floor(Math.random() * GHOST_NAMES.length);
  private preload: BufferPreloader;
  private ais = new Map<Ship, PirateAI>();
  private lastFoe: Ship | null = null;
  private player: Ship | null = null;
  private veg?: Vegetation;
  /** Blades of grass around the eye (none on the lightest devices). */
  private grass?: Grass;
  private preview: Ship | null = null;
  private state: State = 'loading';
  private discovered = new Set<string>();
  private chartOpen = false;
  private voyageTime = 0;
  /** The voyage's tally for the farewell screen. */
  private log = { shots: 0, hits: 0, dealt: 0, chests: 0, best: -1, metres: 0, events: [] as VoyageEvent[] };
  /** The farewell: real seconds since she was lost (-1 afloat), and its beats. */
  private wreck = { t: -1, hud: true, plunged: false, dived: false, shown: false, skip: false, deep: -1, under: -1, rest: -1, camSet: false, az: 0, elev: 0, dist: 0, burst: 0, fathoms: -1 };
  /** Where her air leaks out (ship-local points: hatches, gunports, the breaches), and how hard each one is streaming. */
  private leaks: { p: THREE.Vector3; rate: number; ph: number; acc: number }[] = [];
  /** The boil of air breaking the surface over her (0..1, eased). */
  private boil = 0;
  /** Where the camera hangs beneath the waves beside the sinking wreck (eased). */
  private underCam = new THREE.Vector3();
  private isUnder = false;
  private report: WreckReport | null = null;
  /** Sim-time scale: the killing blow plays out in slow motion. */
  private timeScale = 1;
  private cinePos = new THREE.Vector3();
  private cineLook = new THREE.Vector3();
  private spawnTimer = 0;
  private nameIdx = Math.floor(Math.random() * PIRATE_NAMES.length);
  private last = performance.now();
  private gunnery!: Gunnery;
  private gunTipShown = false;
  /** Special shot aboard this voyage, in broadsides' worth (round shot never runs out). */
  private ammoStock: AmmoStock = freshStock();
  /** Fireworks: the locker (it follows the captain from voyage to voyage) and the kind loaded. */
  private fwLocker = new FireworkLocker();
  private fwType: FireworkId = 'peony';
  private fireworks!: Fireworks;
  /** Feast nights at the trading ports, and the paper-lantern boats they set adrift. */
  private festivals!: Festivals;
  private lanterns!: LanternBoats;
  private fwTipShown = false;
  private smokeT = 0;
  private spawnPoint = new THREE.Vector3(40, 0, 210);
  private dpr = 1;
  /** The pixel ratio at full render scale (device ratio, capped and kept in the pixel budget). */
  private baseDpr = 1;
  private birds!: Birds;
  private reef!: ReefLife;
  private wild!: Wildlife;
  private windField!: WindField;
  private wisps!: WindWisps;
  /** Fallen pirates' ghosts on their way up. */
  private spirits!: Spirits;
  private spiritSoundT = -1;
  private atmos = new Atmosphere();
  private skyEnv: SkyEnvironment;
  private envT = 0;
  private rain!: Rain;
  private spindrift!: Spindrift;
  /** Ember rain, mirages and the sea-spark blooms: where and when (see rareSkies.ts). */
  private rare!: RareSkies;
  /** Time to the next check that a rare weather picked by hand still has its time and place. */
  private wxCheckT = 0;
  /** The last lightning strike: xz, reach of its light (m), its strength. */
  private strikeAt = new THREE.Vector4();
  private clouds!: LowClouds;
  private lightning!: Lightning;
  private baseWaves: Wave[] = [];
  /** Heading the swell has turned to; it follows the wind round, but lags it. */
  private swellAngle = 0;
  private baseAngle = 0;
  private cloudOff = new THREE.Vector2();
  private crew!: CrewSystem;
  private settings: Settings;
  private softShadows = false;
  // the sun's shadow map: half-size (stepped), ground centre (texel-snapped)
  // and the sun's slant as a shear per metre of height (see render, fitShadow)
  private shadowR = 0;
  private shadowC = new THREE.Vector2();
  private shadowK = new THREE.Vector2();
  /** Toward the shadow-casting light (the slant the shadow map uses). */
  private toSun = new THREE.Vector3(0, 1, 0);
  private fps = 60;
  private prof!: Profiler;
  // the shipwright's harbour
  private look: ShipLook = loadLook();
  private port!: Port;
  private shipwright = new Customizer();
  // the treasure vault: purse, collection and the chest itself
  private vaultStore = new VaultStore();
  /** Upgrade parts: the locker and every ship's refit. */
  private partStore = new PartStore();
  /** Parts won inside the vault, announced once it closes. */
  private vaultFinds: Found[] = [];
  // cloud saves: sign in from the harbour's top bar and progress follows you
  private cloudSave = new Cloud();
  /** Synced parts still to take up (the livery and ship wait for the harbour). */
  private cloudParts = new Set<Part>();
  private vault = new Vault(this.vaultStore);
  // the chest out on the water, and what the vault is showing
  private vstage!: VaultStage;
  private vaultOn = false;
  private vShot: StageShot = 'home';
  private vShow: Cosmetic | null = null;
  private vFireT = 0;
  private vTime = 0;
  private vSide: 1 | -1 = 1;
  private veil = Object.assign(document.body.appendChild(document.createElement('div')), { id: 'sw-veil' });
  private swFocus: PortFocus = 'overview';
  private swAz = 0;
  private swZoom = 1;
  private swTime = 0;
  private swBusy = false;
  private saveTimer = 0;
  private captain = new Captain();
  /** Photo mode: the voyage frozen, the HUD gone and a free camera; see ui/photo.ts. */
  private photo: PhotoMode;
  private photoSnap: AtmosSnapshot | null = null;
  private photoSky = false;
  private photoSkyT = 0;
  /** Pixel ratio forced for one high-resolution capture (0 in play). */
  private captureDpr = 0;
  private fpv = false;
  /** True while the loading screen force-draws every shader once. */
  private warming = false;
  // the trading ports: the hold you fill at sea and the markets that buy it
  private tradePorts!: TradePorts;
  private market = new MarketUI();
  private hold = new Hold(HOLD_ROOM.sloop);
  private peek = document.createElement('div');
  private dockPort: TradePort | null = null;
  private dockT = 0;
  private holdNagT = 0;
  private sky = createSkyDome();
  // going ashore: the islands underfoot, the landing party and the cutthroats' camps
  private ground!: Ground;
  private shore!: Shore;
  private shoreHud = new ShoreHud();
  /** The beach the ship could put a boat on right now (checked a few times a second). */
  private landing: Landing | null = null;
  private landT = 0;
  /** The zoom you had at sea, given back when you row out again. */
  private seaZoom = 0.42;
  private shoreIn: ShoreInput = { mx: 0, mz: 0, run: false, strike: false, pistol: false, interact: false, aim: null, face: null, jump: false };
  /** Ashore, the captain's own eyes: the look, the gait in the head, the kicks. */
  private footEye = new FootEye();
  /** Walking islands through the captain's eyes (V switches to the bird's-eye view; remembered). */
  private shoreEyePref = loadShoreEye();
  /** A beat after a landing before the camera drops into the captain's eyes. */
  private eyeWait = 0;
  /** Swooping up out of the captain's eyes before the boat pushes off. */
  private shoreLeaving = false;
  private eyeLook = { x: 0, y: 0 };
  private eyeAim = { x: 0, z: 0 };
  private lastLockT = -9;
  private shoreFocus = new THREE.Vector3();
  private shoreVel = new THREE.Vector3();
  private partyRows: PartyRow[] = [];
  private foeBars: FoeBar[] = [];
  private shoreTipShown = false;
  private ray = new THREE.Raycaster();
  // boarding: grapnels across, the hulls lashed together, a fight for her deck and a prize to take
  private boarding!: Boarding;
  /** The crippled pirate near enough to grapple right now (checked a few times a second). */
  private boardable: Ship | null = null;
  private boardT = 0;
  /** Her strongbox's haul, said on the prize card, and whether the card is up. */
  private prizeHaul = '';
  private prizeOpen = false;
  private boardTipShown = false;
  private attackTipShown = false;
  // bounties: your infamy among the Brethren, and the named captains it sends after you
  private bounty = new BountyBook();
  private board = new BountyBoard();
  private wanted = new WantedHud();
  private banner = new BountyBanner();
  /**
   * The voyage's heat: infamy earned, hunters sent and claimed, the breather
   * after a claim, and the captain the Brethren will send next (her hull is
   * built ahead of time, like every pirate's).
   */
  private heat = { pts: 0, sent: 0, claimed: 0, cool: 0, met: new Set<string>(), next: null as NamedCaptain | null };
  private hunters = new Map<Ship, NamedCaptain>();
  private hunterHull: ShipModel | null = null;
  private keelFor: NamedCaptain | null = null;
  /** A dressed captain's own cloth and flag, uploaded one a frame before she sails in. */
  private texQueue: THREE.Texture[] = [];
  private cumulus = new SkyCumulus();
  // the sea's own dangers: maelstroms and open-sea reefs; see game/hazards.ts
  private hazards!: Hazards;
  private hzHud!: HazardHud;
  private hzMarks: HazardMark[] = [];
  /** Which ones you've come upon this voyage (each is named the first time). */
  private hzSeen = new Set<string>();
  /** The pill's last state, for the bell and the groan as it changes. */
  private hzState: 'none' | 'near' | 'shoal' | 'over' | 'caught' | 'aground' = 'none';
  private hzBellT = 0;
  /** The sea last hurt you: what and where, for the farewell's cause. */
  private hzHit: { kind: 'reef' | 'maelstrom'; name: string; t: number } | null = null;
  /** When each ship last had the sea's grip called out over her. */
  private hzCalled = new WeakMap<Ship, number>();
  private hzGrad = new THREE.Vector2();
  // the Kraken: rises (rarely) out of a storm to drag her under; see game/kraken.ts
  private kraken = new Kraken();
  private krHud!: KrakenHud;
  /** Seconds before another may rise. */
  private krakenCool = 0;
  /** This storm's one roll of the dice: not yet rolled, rolled and spared, or coming. */
  private krakenStorm: 'none' | 'rolled' | 'coming' = 'none';
  private krakenWait = 0;
  /** When it last struck her, so a sinking can be laid at its door. */
  private krakenHitT = -100;
  /** Real seconds left of the slow beat as it bursts up. */
  private krakenSlowT = 0;
  private krWarn: THREE.Vector3[] = [];
  private krWarnPx = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));
  private krFocus = new THREE.Vector3();
  // your fleet: escorts in formation on your quarters, under your orders (see game/fleet.ts)
  private fleet = new FleetStore();
  private escorts = new Map<Ship, EscortAI>();
  private fleetHud = new FleetHud();
  /** This frame's hostile ships afloat (what escorts may fight) and your escorts (what pirates may). */
  private foes: Ship[] = [];
  private escortShips: Ship[] = [];
  private fleetRows: EscortRow[] = [];
  private seaMarks: SeaMark[] = [];
  /** The ship your own guns last laid on or struck: "attack my target". */
  private markedFoe: Ship | null = null;
  /** The roster and colours the escorts moored in the harbour were built from. */
  private moorKey = '';
  /** Countdown to the next look round for wreckage the escorts could sweep up. */
  private salvageT = 0;
  // treasure maps: torn pieces from chests, an X on an island, and the dig
  private maps = new TreasureMaps();
  private mapUi = new TreasureMapUI();
  /** The X in the world, for the map chip's arrow. */
  private mapX = new THREE.Vector3();
  /** Towns and camps a map's X keeps clear of. */
  private digAvoid: Disc[] = [];
  // the Brethren's island forts: shore guns to silence, a garrison to beat, a flag to raise
  private forts!: Forts;
  private fortStore = new FortStore();
  private fortHud!: FortHud;
  private fortFocus = new THREE.Vector3();
  /** When the forts' tribute was last looked for, and the next hammer-knock under your own walls. */
  private tributeT = 0;
  private havenT = 0;
  // sailing together: other captains' ships in this sea (see net/coop.ts)
  private coop = new Coop(this.coopBridge());
  private crewUi!: CrewPanel;
  // peaceful seas: nobody fires first (see game/peace.ts)
  /** The host's rule while we sail in their sea (null: our own setting). */
  private roomPeace: boolean | null = null;
  private peaceHud = new PeaceHud(document.querySelector<HTMLElement>('#hud .map-wrap')!);
  /** When each ship last called out that you'd provoked her. */
  private provokedAt = new WeakMap<Ship, number>();
  private provokeToastT = -100;
  /** How many ships and forts were at war with you last frame (for "tempers cool"). */
  private warN = 0;
  /** How many of the gunnery's marks this frame are the Kraken's (the rest are forts'). */
  private krMarkN = 0;
  private calmMarks: SeaMark[] = [];
  /** This frame's ships the pirates may hunt besides you: your escorts and the other captains'. */
  private hunt: Ship[] = [];
  /** Captains at sea the pirates gather round (you and your crewmates). */
  private capList: Ship[] = [];
  /** World time your side last struck each ship: a hand in her sinking earns a share. */
  private myHits = new WeakMap<Ship, number>();

  constructor(private canvas: HTMLCanvasElement) {
    installSoftShadows();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false, alpha: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the final pass encodes sRGB itself
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    installPassCulling(this.renderer);
    skipEmptyDraws(this.renderer);
    this.quality = detectQuality(this.renderer);
    this.prof = new Profiler(this.renderer, () => ({
      scale: this.scaler.scale,
      width: this.pipeline.width,
      height: this.pipeline.height,
      preset: this.settings.value.preset,
      tier: this.quality.tier,
      msaa: this.pipeline.settings.msaa,
      shadow: this.sun.shadow.mapSize.x,
    }));
    this.settings = new Settings(this.quality.tier);
    this.pipeline = new Pipeline(this.renderer, { msaa: this.quality.msaa, bloomLevels: this.quality.bloomLevels, tiltShift: this.quality.tiltShift, shafts: 0 });
    this.pipeline.prof = this.prof;
    this.rig = new CameraRig(innerWidth / innerHeight);
    this.input = new Input(canvas);
    this.ui.setTouch(this.input.isTouch);
    this.input.bindJoystick(document.getElementById('joy')!, document.getElementById('joy-knob')!);
    this.input.bindSailLever(document.getElementById('sail-lever')!, document.getElementById('sl-track')!);
    this.input.bindFireButtons(document.getElementById('t-port')!, document.getElementById('t-fire')!, document.getElementById('t-star')!);
    this.input.bindViewButtons(document.getElementById('btn-view')!, document.getElementById('btn-helm')!, document.getElementById('t-spy')!);
    this.captain.onStep = (k) => this.audio.footstep(k);
    this.input.onTouchDetected = () => this.ui.setTouch(true);
    this.photo = new PhotoMode(canvas);
    this.photo.onClick = () => this.ui.onClick();
    this.photo.onClose = () => this.closePhoto();
    this.photo.onCapture = () => void this.capturePhoto();
    this.photo.onScene = (hour, kind) => {
      if (!this.photoSnap) return;
      this.atmos.preview(this.photoSnap, hour, kind);
      this.photoSky = true;
    };
    this.photo.pickAt = (x, y) => this.pickDepth(x, y);

    // the key light: the sun by day, the moon by night (see world/atmosphere.ts)
    this.preload = new BufferPreloader(this.renderer);
    // every level of detail the worker hands back goes up ahead of its first draw
    lodUploads.sink = (g) => this.preload.addLevel(g);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 2.5;
    const sc = this.sun.shadow.camera;
    sc.near = 0;
    sc.far = SHADOW_TOP - SHADOW_FLOOR;
    this.sun.shadow.updateMatrices = () => this.fitShadow();
    this.opaque.add(this.sun, this.sun.target);
    this.pipeline.sun = this.sun;
    // shared with every shader, so a moving sun moves the traced shadows too
    this.pipeline.sunDir = globalUniforms.uSunDir.value;
    this.settings.onChange((s) => this.applySettings(s));
    new GraphicsPanel(this.settings, () => this.ui.onClick(), () => ({
      fps: this.fps,
      scale: this.scaler.scale,
      maxShadow: Math.min(4096, this.renderer.capabilities.maxTextureSize),
    }));
    this.applySettings(this.settings.value);
    this.opaque.fog = new THREE.Fog(new THREE.Color(), 380, 1500);
    this.skyEnv = new SkyEnvironment(this.renderer);
    this.applyAtmosphere();
    const modes = ['auto', 'clear', 'fair', 'cloudy', 'mist', 'rain', 'storm', 'calm', 'hot', 'embers', 'glow'] as const;
    // a weather that can't be had here and now is shown (with what it waits
    // for) but not set; a tap soon after moves on from it
    let refused: { m: (typeof modes)[number]; at: number } | null = null;
    const times = ['auto', 'dawn', 'noon', 'golden', 'dusk', 'night'] as const;
    const pins = () => this.ui.skyPins(this.atmos.mode !== 'auto', this.atmos.timeMode !== 'auto');
    pins();
    // the icon picks the weather, the clock picks the hour
    document.getElementById('hud-sky')!.addEventListener('click', (e) => {
      e.stopPropagation();
      // in someone else's sea, their sky
      if (this.coop.guest) {
        this.ui.skyTag('The host sets the sky');
        return;
      }
      if ((e.target as HTMLElement).closest('#hud-clock')) {
        const t = times[(times.indexOf(this.atmos.timeMode) + 1) % times.length];
        this.atmos.setTimeMode(t);
        this.ui.skyTag(t === 'auto' ? 'Time · Auto' : TIMES[t].name);
        pins();
        return;
      }
      const from = refused && performance.now() - refused.at < 8000 ? refused.m : this.atmos.mode;
      refused = null;
      const m = modes[(modes.indexOf(from) + 1) % modes.length];
      const need = m === 'auto' ? null : this.weatherNeeds(m);
      if (need && m !== 'auto') {
        refused = { m, at: performance.now() };
        this.ui.skyTag(WEATHER[m].name, need);
        return;
      }
      this.atmos.setMode(m);
      this.ui.skyTag(m === 'auto' ? 'Weather · Auto' : WEATHER[m].name);
      pins();
    });
    this.atmos.onChange = (_k, title, line) => {
      if (this.state === 'playing') this.ui.toast(title, line, 3.4);
    };
    this.atmos.onWindShift = (title, line) => {
      this.ui.windShift();
      if (this.state === 'playing') this.ui.toast(title, line, 3);
    };
    this.opaque.add(this.projectiles.mesh, this.loot.group, this.debris.group, this.sky, this.cumulus.mesh);

    this.wireUI();
    this.wireShipwright();
    this.wireTrade();
    // browsers only let sound start from a gesture (and on phones a touch only
    // counts once it lifts), so any tap or key in the harbour wakes the theme
    const wake = () => {
      if (this.state !== 'menu' && this.state !== 'loading' && this.state !== 'port') return;
      this.audio.start();
      this.audio.setMusic(true);
    };
    for (const ev of ['pointerup', 'touchend', 'keydown'] as const) addEventListener(ev, wake, true);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.syncFleet();
      if (document.hidden && this.state === 'playing') {
        this.setChart(false);
        this.setPaused(true);
      }
    });
  }

  // ------------------------------------------------------------------ setup

  async init() {
    // the mesh simplifier (WebAssembly) for the ships' levels of detail, before any ship is built
    initLod();
    // the baked figureheads, decoded before the first ship is built
    const figures = loadFigureheads();
    const ui = this.ui;
    const q = this.quality;
    // webfonts load on first use: fetch every weight now so a toast or banner
    // never stalls on a font mid-voyage
    const fonts = Promise.all(
      ['500 1em Cinzel', '700 1em Cinzel', '400 1em Inter', '600 1em Inter', '800 1em Inter'].map((f) => document.fonts?.load(f).catch(() => [])),
    );
    // The loading screen's motion (compass, bar, glint, backdrop drift) is all
    // compositor transforms, so it keeps going while this thread is busy. Each
    // checkpoint below hands the bar a target and roughly how long the step
    // takes, and waits a frame so the browser starts that glide before the work.
    const mark = (p: number, ms: number) => {
      ui.progress(p, ms);
      return nextFrame();
    };
    await mark(0.08, 700);
    // the Fortunate Isles you sail from, and Las Brumas far out across the high seas
    const [homeR, mistR] = REGIONS;
    const home = new Terrain(homeR.seed);
    await mark(0.13, 500);
    const mist = new Terrain(mistR.seed, { ox: mistR.x, oz: mistR.z, style: 'brumas' });
    this.terrain = new Seas([home, mist]);
    await mark(0.18, 300);
    home.bakeAO(2);
    mist.bakeAO(2);
    await mark(0.24, 300);
    const site = findPortSite(home, this.spawnPoint);
    // four markets at home, two in the mist (their quays look in toward their own archipelago's heart)
    const tradeSites = [...findTradeSites(home, 4, [site]), ...findTradeSites(mist, 2, [], mistR)];
    const towns = [site, ...tradeSites].flatMap(portClearings);
    // the Brethren's forts: a stone square on a rise over the sea, on three isles (well clear of any town)
    // (and out of gunshot of the harbour mouth, so no voyage opens under a fort's guns); two more hold the mist
    const fortSites = [
      ...findFortSites(home, [...towns, { x: this.spawnPoint.x, z: this.spawnPoint.z, r: 380 }], [site.island], 3),
      ...findFortSites(mist, towns, [], 2, BRUMAS_FORT_NAMES, BRUMAS_FORT_KINDS),
    ];
    const fortGround = fortSites.flatMap(fortClearings);
    // maelstroms in deep water, well clear of every harbour mouth, fort and the
    // waters you sail from (each bores an abyss into the seabed, so before the meshes)
    const clear = [
      { x: this.spawnPoint.x, z: this.spawnPoint.z, r: 380 },
      { x: 0, z: 150, r: 300 },
      ...[site, ...tradeSites].map((t) => ({ x: t.x, z: t.z, r: 260 })),
      ...fortSites.map((f) => ({ x: f.x, z: f.z, r: 280 })),
    ];
    this.hazards = new Hazards(this.terrain, [
      { cx: homeR.x, cz: homeR.z, names: MAELSTROM_NAMES, avoid: clear, seed: 4242 },
      { cx: mistR.x, cz: mistR.z, names: BRUMAS_NAMES, avoid: clear, seed: 5151 },
    ]);
    // the cutthroats' camps: a glade a short walk in from the beach on most isles
    const camps = [...findCampSites(home, [...towns, ...fortGround], site.island), ...findCampSites(mist, [...towns, ...fortGround], null)];
    this.digAvoid = [...towns, ...campClearings(camps), ...fortGround];
    const veg = (this.veg = new Vegetation(this.terrain, q.vegetation, [...towns, ...campClearings(camps), ...fortGround], q.tier === 0));
    for (const t of [home, mist]) {
      await mark(t === home ? 0.28 : 0.33, 700);
      const land = t.buildMeshes(q.terrainLod, q.tier === 0);
      // the seabeds reach out under the high seas to meet, so they're always drawn
      const bed = land.getObjectByName('seabed')!;
      this.opaque.add(land, bed);
      // (sealed first: skipWhenHidden wraps the sealed walk)
      sealStatic(land);
      skipWhenHidden(land);
      const region = REGIONS.find((r) => r.x === t.ox && r.z === t.oz)!;
      this.regions.push({ region, terrain: t, land, seabed: t.createHeightTexture(512), surf: buildShore(t) });
    }
    // the far archipelago's land goes up to the GPU during the loading screen, not as it comes over the horizon
    this.preload.add(this.regions[1].land);
    await mark(0.36, 400);
    // the plants never move once placed (culling only repacks their instances)
    const plants = veg.build();
    this.opaque.add(plants);
    sealStatic(plants);
    if (q.tier > 0) {
      this.grass = new Grass([home, mist], [...towns, ...campClearings(camps), ...fortGround], q.tier === 1 ? 0.8 : 1);
      this.opaque.add(this.grass.group);
      freezeStatic(this.grass.group);
    }
    await mark(0.4, 900);
    this.port = new Port(site, (x, z) => this.terrain.heightAt(x, z));
    await figures;
    await preloadPaint(this.look.flag.paint);
    await this.port.build(this.look);
    this.opaque.add(this.port.root);
    skipWhenHidden(this.port.root);
    // one town a frame, each nudging the bar along
    let town = 0;
    this.tradePorts = await TradePorts.build(tradeSites, (x, z) => this.terrain.heightAt(x, z), () => mark(0.41 + (0.1 * ++town) / tradeSites.length, 400));
    this.opaque.add(this.tradePorts.root);
    for (const tp of this.tradePorts.ports) {
      tp.onBell = () => this.audio.bell(2, tp === this.dockPort ? 0.22 : 0.08);
      tp.onDelivered = (id, on, at) => {
        // a lot set down in the warehouse: it glints in its rarity's colour
        if (tp !== this.dockPort || on) return;
        const c = RARITY[LOOT[id].rarity].glow;
        const tint: [number, number, number] = LOOT[id].rarity ? [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6] : [1.4, 1.1, 0.6];
        for (let i = 0; i < 5; i++) this.particles.sparkle(at, tint, 0.8);
      };
    }
    this.birds = new Birds(this.terrain.islands, q.tier === 0 ? 18 : 36, (x, z) => this.terrain.heightAt(x, z), home.islands);
    this.opaque.add(this.birds.mesh);
    // the high seas' dolphins: one mesh, empty until a pod comes (drawn once in the warm-up)
    this.opaque.add(this.dolphins.mesh);
    // and its whales, the same way
    this.opaque.add(this.whales.mesh);
    this.convoys = new Convoys(this.opaque, this.water);
    this.reef = new ReefLife(this.terrain, q.tier === 0);
    this.opaque.add(this.reef.group);
    // the isles' beasts: every species' mesh is in the scene from the start (the warm-up draws them), empty till an isle comes near
    this.wild = new Wildlife(this.terrain, veg, this.digAvoid, q.tier === 0);
    this.opaque.add(this.wild.group);
    this.wild.onSpot = (name, n, total) => this.ui.toast(`New wildlife · ${n} of ${total} kinds seen`, name, 3.6);
    await mark(0.54, 900);

    const windAngle = this.atmos.windAngle;
    const waves = buildWaves(windAngle, 1);
    this.baseWaves = waves.map((w) => ({ ...w }));
    this.swellAngle = this.baseAngle = windAngle;
    this.wake = new WakeField(q.wakeRes, 300);
    const seaFloor = this.regions[0].seabed;
    this.wake.setTerrain(seaFloor, home.rect);
    this.ocean = new Ocean(waves, { segments: q.oceanSegments, half: 760, heightTex: seaFloor, wake: this.wake, quality: q.tier > 0 ? 1 : 0 });
    for (const r of this.regions) for (const tex of [r.seabed, r.surf]) this.renderer.initTexture(tex);
    this.particles = new Particles(q.particles);
    this.particles.onSplash = (p, scale) => this.reef.splash(p.x, p.z, scale);
    // built now (and drawn by the warm-up) so the first rocket compiles nothing
    this.fireworks = new Fireworks(q.particles, this.particles);
    this.lanterns = new LanternBoats(this.particles.uniforms);
    this.opaque.add(this.lanterns.mesh);
    this.festivals = new Festivals(this.tradePorts.ports, this.fireworks, this.lanterns, this.audio);
    this.festivals.onDusk = (ports, full) => {
      // word of it only for the towns in these waters
      const p = this.player;
      if (this.state !== 'playing' || !p) return;
      const here = nearestRegion(p.pos.x, p.pos.z).region;
      const near = ports.filter((tp) => nearestRegion(tp.x, tp.z).region === here);
      if (!near.length) return;
      if (full) this.ui.toast(FULL_MOON.name, FULL_MOON.line, 4.6);
      else this.ui.toast(`Feast night at ${near.map((tp) => tp.name).join(' and ')}`, near.length > 1 ? 'Lanterns, music and fireworks over the harbours tonight' : `${near[0].feast.name}: ${near[0].feast.line.charAt(0).toLowerCase()}${near[0].feast.line.slice(1)}`, 4.6);
    };
    this.festivals.onCheer = (tp) => {
      const [vol, pan, d] = this.world.soundAt(tp.glowAt());
      this.audio.shout(Math.min(1, vol * 1.3), pan, d, true, 6);
      tp.cheer(2);
    };
    this.bubbles = new Bubbles(this.particles.uniforms);
    this.loot.buildBeacons(this.particles.uniforms, globalUniforms.uTime);
    this.waypoints.buildFx(this.particles.uniforms, globalUniforms.uTime, globalUniforms.uLight);
    // the vault's chest and its light: built now so the warm-up draws them
    this.vstage = new VaultStage(this.particles.uniforms);
    this.opaque.add(this.vstage.group);
    this.water.add(this.vstage.fx);
    const st = this.vstage;
    st.onShake = (amt) => this.rig.shake(amt);
    st.onSplash = (p, big) => {
      const [vol, pan, d] = this.world.soundAt(p);
      this.audio.splash(Math.min(1, vol * big), pan, d);
    };
    st.onFirework = (p) => {
      const [vol, pan] = this.world.soundAt(p);
      this.audio.explosion(vol * 0.18, pan, 160);
    };
    this.ocean.placeVortices(this.hazards.maelstroms.map((m) => ({ x: m.x, z: m.z, r: m.r0 })));
    this.water.add(this.ocean.mesh, this.ocean.funnels, this.particles.group, this.fireworks.mesh, this.lanterns.pools, this.bubbles.mesh, this.loot.fx, this.waypoints.fx);
    // the sea from beneath: hidden until the farewell follows a wreck under (the warm-up still draws it)
    this.opaque.add(this.ocean.underside);
    this.pipeline.onRefl = (z) => this.ocean.setHalfDepth(z);
    this.world = new World(this.terrain, waves, this.particles, this.wake, this.audio, windAngle);
    this.world.debris = this.debris;
    this.world.fireworks = this.fireworks;
    this.fireworks.onSound = (kind, at, power) => {
      const [vol, pan, d] = this.world.soundAt(at);
      // a burst high overhead is still as far off as its height
      this.audio.firework(kind, Math.min(1.2, vol * power), pan, Math.hypot(d, at.y * 0.8));
    };
    this.world.onShot = (s) => this.projectiles.add(s);
    this.world.onScare = (p, r) => this.wild.scare(p.x, p.z, r);
    this.world.onShake = (a) => this.rig.shake(a);
    this.world.onDot = (ship, by, dmg) => this.onBurn(ship as Ship, by as Ship | null, dmg);
    this.world.onStatus = (ship, st, by) => this.onStatus(ship as Ship, st, by as Ship | null);
    this.hazards.attach(this.world);
    this.dolphins.onSplash = (at, size) => {
      this.particles.splash(at, size);
      const [vol, pan, d] = this.world.soundAt(at);
      this.audio.dolphinSplash(vol * 0.3 * size, pan, d);
    };
    // the breath: a little puff of spray from the blowhole, gone on the wind
    this.dolphins.onBlow = (at) => {
      const wd = this.world.wind;
      for (let i = 0; i < 4; i++) {
        this.particles.emit({
          x: at.x, y: at.y, z: at.z, vx: wd.dirX * 0.8 + (Math.random() - 0.5) * 0.6, vy: 1.6 + Math.random() * 1.2, vz: wd.dirZ * 0.8 + (Math.random() - 0.5) * 0.6,
          life: 0.9 + Math.random() * 0.5, size: 0.18, sizeEnd: 0.7, color: [1, 1, 1], alpha: 0.45, drag: 1.4, grav: 1.5, kind: 1, fadeIn: 0.05,
        });
      }
    };
    this.dolphins.onCall = (at, whistle) => {
      const [vol, pan] = this.world.soundAt(at);
      this.audio.dolphin(vol, pan, whistle);
    };
    this.whales.onSighted = (at) => {
      const p = this.player;
      if (!p || this.state !== 'playing') return;
      this.ui.toast('Thar she blows!', `Humpback whales ${bearing(p, at)}, on their long migration across Mar Sereno`, 4.2);
    };
    this.whales.onBreach = () => {
      if (!this.whales.golden || this.goldenBreach || this.state !== 'playing') return;
      this.goldenBreach = true;
      this.ui.toast('Breach!', 'A humpback leaps clear in the golden light', 3.6);
    };
    this.convoys.onSighted = (c) => this.sightConvoy(c);
    this.convoys.onScatter = (_c, m) => {
      this.ui.toast('The convoy scatters', `You fired on the ${m.ship.name}. No ship in her line will trade with you now`, 4.5);
      this.note('trade', `Fired on the ${m.ship.name}`, `${m.kind.house} · the convoy scattered`);
      this.audio.shoalBell();
    };
    this.world.onHazard = (ship, kind, dmg, at) => this.onHazard(ship as Ship, kind, dmg, at);
    this.hzHud = new HazardHud(document.getElementById('hud')!);
    this.hzMarks = [
      ...this.hazards.maelstroms.map((m): HazardMark => ({ kind: 'vortex', name: m.name, x: m.x, z: m.z, r: m.vortex.r, dir: m.vortex.dir })),
      ...this.hazards.reefs.map((r): HazardMark => ({ kind: 'reef', name: r.name, x: r.x, z: r.z, r: r.r, dir: 1 })),
    ];
    this.pilot = new Autopilot(this.terrain, () => this.hazards.maelstroms.map((m) => ({ x: m.x, z: m.z, r: Math.max(m.r0, m.vortex.r) })));
    this.pilot.onArrive = (t) => this.pilotArrived(t);
    this.pilot.onGiveUp = (why) => {
      this.ui.toast('The helmsman gives up', why, 3.6);
      this.audio.click();
    };
    globalUniforms.uWind.value.set(this.world.wind.dirX, this.world.wind.dirZ, this.world.wind.strength);
    this.windField = new WindField(this.world.wind.dirX, this.world.wind.dirZ, q.tier === 0 ? 6 : 8);
    this.world.gustAt = (x, z) => this.windField.at(x, z);
    this.wisps = new WindWisps(this.windField, q.tier === 0 ? 12 : 22, (x, z) => this.terrain.heightAt(x, z));
    this.water.add(this.wisps.mesh);
    const waveU = this.ocean.material.uniforms as unknown as { uWaveA: THREE.IUniform; uWaveB: THREE.IUniform };
    this.rain = new Rain([2400, 4800, 7200][q.tier], waveU);
    this.spindrift = new Spindrift([140, 260, 400][q.tier], waveU);
    this.lightning = new Lightning();
    this.water.add(this.rain.mesh, this.spindrift.mesh, this.lightning.mesh);
    this.rare = new RareSkies(q.tier, this.terrain.islands, {
      toast: (k, t, l) => {
        if (this.state === 'playing') this.ui.toast(k, t, l);
      },
      rumble: (vol, d) => this.audio.thunder(vol, 0, d),
      shimmer: () => this.audio.mirage(),
      sparkle: (x, y, z) => this.particles.sparkle(_a.set(x, y, z), [0.75, 0.95, 1.25], 2.5),
      ground: (x, z) => this.terrain.heightAt(x, z),
    });
    this.water.add(this.rare.embers.mesh, this.rare.mirage.mesh);
    this.clouds = new LowClouds(this.terrain.islands, q.tier);
    this.cumulus.budget = q.tier === 0 ? 1600 : 4200;
    this.water.add(this.clouds.mesh);
    await mark(0.6, 700);
    this.crew = new CrewSystem(q.tier);
    this.opaque.add(this.crew.mesh);
    this.survivors = new Survivors(this.crew);
    this.survivors.onAboard = (r, left) => this.handAboard(r, left);
    this.opaque.add(this.survivors.group, this.drift.group, this.birds.scroll);
    this.drift.onCrate = (x, z, kelp) => this.loot.place(x, z, kelp && Math.random() < 0.4 ? 1 : 0);
    this.drift.onRider = (spot) => this.birds.ride(spot, null);
    this.drift.onRiderGone = (spot) => this.birds.unride(spot, this.world);
    this.letter = new LetterCard(document.getElementById('hud')!);
    this.spirits = new Spirits(q.tier === 0 ? 14 : 28, this.particles);
    this.water.add(this.spirits.mesh);
    this.spirits.onRise = (at) => {
      // a crew going up together is a little choir, not a wall of sound
      if (this.world.time - this.spiritSoundT < 0.28) return;
      this.spiritSoundT = this.world.time;
      const [vol, pan, d] = this.world.soundAt(at);
      this.audio.spirit(vol * 0.32, pan, d);
    };
    this.crew.onSoul = (f) => this.raiseSoul(f);
    this.ground = new Ground(this.terrain, veg, towns);
    this.forts = new Forts(fortSites, this.ground, shoreMats());
    this.opaque.add(this.forts.root);
    this.shore = new Shore(this.ground, camps, this.crew, {
      floater: (text, at, kind) => {
        const [x, y, ok] = this.screenOf(at);
        if (ok) this.ui.floater(text, x, y, kind);
      },
      shake: (a) => this.rig.shake(a),
      alarm: (c) => {
        const calm = this.world.peaceful;
        // a garrison at arms is its fort at war with you (on peaceful seas, this is the quarrel)
        const f = c.fort ? this.forts.forts.find((o) => o.garrison === c) : undefined;
        if (f) this.forts.rile(f, this.coop.me, this.world.time);
        if (!this.shore.active) return;
        if (c.fort) {
          this.ui.toast('The garrison sallies!', calm ? `You drew first: soldiers pour out of the gate of ${f?.name ?? 'the fort'}` : `Soldiers pour out of the gate of ${f?.name ?? 'the fort'}`, 3.2);
          this.audio.wanted(3);
        } else this.ui.toast('To arms!', calm ? 'You drew first: the whole camp comes for you' : 'Cutthroats come running from their camp', 2.8);
      },
      routed: (c) => this.onCampRouted(c),
      plunder: (c) => this.plunderCamp(c),
      defeat: () => this.onCaptainDown(),
      // he rises once he has hit the ground
      fallen: (w, boss) => this.raiseSoul({ x: w.x, y: w.y, z: w.z, hat: w.look.hat, girth: w.girth, height: w.height, boss, delay: 0.85 }),
      unearthed: (at) => this.onUnearthed(at),
      struck: (prize) => this.onStruck(prize),
      landed: (w, cap) => {
        const at = _a.set(w.x, w.y, w.z);
        const [vol, pan, d] = this.world.soundAt(at);
        this.audio.hit(vol * (cap ? 0.7 : 0.4), pan, d);
        this.audio.footstep(1);
        if (cap) this.rig.shake(0.1);
      },
      hop: (up, k, wet, deck) => {
        const cap = this.shore.captain;
        const hard = deck || (cap && this.ground.lifted(cap.x, cap.z) !== null);
        this.audio.hop(up, k, wet, !!hard);
        if (!up && k > 0.5) this.rig.shake(0.04 * k);
      },
      step: (k, wet, deck) => (deck || this.ground.lifted(this.shore.captain?.x ?? 0, this.shore.captain?.z ?? 0) !== null ? this.audio.footstep(k) : this.audio.sandStep(k, wet)),
    }, this.forts.garrisons());
    this.opaque.add(this.shore.group);
    // peaceful seas: a camp keeps its blades sheathed unless you strike first (a garrison, unless its fort is at war with you)
    this.shore.calm = (c) => {
      if (!this.world.peaceful) return false;
      const f = c.fort ? this.forts.forts.find((o) => o.garrison === c) : undefined;
      return !f || !f.grudge.holds(this.coop.me, this.world.time);
    };
    // each fort's garrison is a camp ashore: they're appended after the cutthroats' camps
    const g0 = this.shore.camps.length - this.forts.forts.length;
    this.forts.forts.forEach((f, i) => (f.garrison = this.shore.camps[g0 + i]));
    this.wireForts();
    this.boarding = new Boarding(this.shore.lines, {
      thrown: (at) => {
        const [vol, pan, d] = this.world.soundAt(at);
        this.audio.grapple(vol, pan, d);
      },
      bit: (at) => {
        const [vol, pan, d] = this.world.soundAt(at);
        this.audio.hookBite(vol, pan, d);
        // splinters off her rail
        for (let i = 0; i < 5; i++) {
          this.particles.emit({
            x: at.x, y: at.y, z: at.z, vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 3,
            life: 0.6 + Math.random() * 0.4, size: 0.05 + Math.random() * 0.04, sizeEnd: 0.03, color: [0.55, 0.4, 0.26], alpha: 0.95, grav: 11, drag: 0.6, kind: 0, fadeIn: 0.01,
          });
        }
      },
      met: (at) => this.hullsMeet(at),
      lashed: () => this.boardOver(),
    });
    this.rig.ground = (x, z) => this.terrain.heightAt(x, z);
    this.shoreHud.onInteract = () => {
      if (this.shore.active) this.shoreAct();
      else if (this.boardable) this.startBoarding();
      else if (this.rescuable) this.throwLine();
      else this.goAshore();
    };
    this.shoreHud.onPrize = (k) => this.choosePrize(k);
    this.input.bindShoreButtons(this.shoreHud.strike, this.shoreHud.pistol, this.shoreHud.jump);
    this.mapUi.onOpen = () => this.setMapView(true);
    this.mapUi.onClose = () => this.setMapView(false);
    this.mapUi.onCoin = () => this.audio.coin(0, 0.22);
    this.syncTreasure();
    this.projectiles.onHit = (e) => this.onHit(e.ship, e.attacker, e.damage, e.pos);

    await mark(0.65, 600);
    this.opaque.environment = this.skyEnv.update();
    this.opaque.environmentIntensity = SKY_LIGHT;
    this.ui.buildMap(this.terrain);
    this.ui.setWind(windAngle);
    this.gunnery = new Gunnery();
    this.gunnery.onReady = (side) => this.onGunsReady(side);
    this.water.add(this.gunnery.group);
    // the Kraken lies built and hidden from the start, so the warm-up compiles it
    this.opaque.add(this.kraken.view.group);
    this.water.add(this.kraken.view.fx);
    this.wireKraken();
    await mark(0.72, 500);

    this.applySettings(this.settings.value);
    this.resize();
    await mark(0.75, 900);
    this.enterMenu();
    await mark(0.77, 400);
    // warm up before the first visible frame: compile every shader, upload every
    // ship texture, then draw the whole world once for real (see render/warmup)
    this.rig.update(0.016, this.spawnPoint, new THREE.Vector3(), 0);
    // one phantom drawn in the warm-up, then kept aside (never shown or freed) so the
    // ghost ships' shaders are compiled now and stay resident, never built mid-voyage
    const keeper = new Ship(SHIP_CLASSES.brig, GHOST_LIVERY, 'pirate', this.quality.physicalHull ? 1 : 0);
    Game.ghostify(keeper);
    keeper.place(this.spawnPoint.x + 40, this.spawnPoint.z + 40, 0);
    this.opaque.add(keeper.root);
    this.ghostKeeper = keeper;
    // pirate paint only: the player's own ship is in the scene and gets the warm-up draw below.
    // One paint a frame: each is painted, then pushed to the GPU, without starving the page
    // (and the merchant houses' hulls, so a convoy never paints a texture mid-voyage)
    const paints = (Object.keys(SHIP_CLASSES) as ShipClassId[]).flatMap((id) => [...PIRATE_LIVERIES, HUNTER_HULL, GHOST_LIVERY].map((liv) => [SHIP_CLASSES[id], liv] as const));
    for (const k of MERCHANT_KINDS) paints.push([k.cls, k.livery]);
    for (let i = 0; i < paints.length; i++) {
      const [cls, liv] = paints[i];
      for (const t of ShipModel.textures(cls, liv, this.quality.physicalHull ? 1 : 0)) this.renderer.initTexture(t);
      await mark(0.78 + (0.04 * (i + 1)) / paints.length, 250);
    }
    // KHR_parallel_shader_compile: every program compiles on the driver's own threads while we wait
    await this.renderer.compileAsync(this.opaque, this.rig.camera);
    await this.renderer.compileAsync(this.water, this.rig.camera);
    await this.renderer.compileAsync(this.ocean.reflScene, this.rig.camera);
    await this.renderer.compileAsync(this.clouds.shadowScene, this.rig.camera);
    await mark(0.83, 400);
    this.rig.update(0.016, this.spawnPoint, new THREE.Vector3(), 0);
    // Plants stay unculled so every one of their batches is drawn too.
    veg.hold = true;
    this.clouds.warm = true;
    this.cumulus.warm = true;
    this.warming = true;
    this.tradePorts.warm();
    this.dolphins.warm(this.spawnPoint);
    this.whales.warm(this.spawnPoint);
    this.shore.warm();
    this.forts.warm();
    // the shipyard's uploader compiles its one plain program now, not mid-voyage
    // (a few uploads a frame, so no single frame pushes every buffer at once)
    if (this.preview) this.preload.add(this.preview.root);
    const queued = this.preload.pending;
    while (this.preload.pending) {
      const t = performance.now();
      while (this.preload.pending && performance.now() - t < 8) this.preload.step();
      await mark(0.83 + 0.03 * (1 - this.preload.pending / Math.max(1, queued)), 200);
    }
    // the whole world drawn once for real, a slice of its materials per frame
    await warmDrawSliced(
      [this.opaque, this.water, this.ocean.reflScene, this.clouds.shadowScene],
      () => this.render(0),
      nextFrame,
      (f) => ui.progress(0.86 + 0.13 * f, 250),
      (m) => (this.renderer.properties.get(m) as { currentProgram?: unknown }).currentProgram,
    );
    veg.hold = false;
    this.dolphins.clear();
    this.whales.clear();
    this.clouds.warm = false;
    this.shore.unwarm();
    this.forts.unwarm();
    this.opaque.remove(keeper.root);
    this.cumulus.warm = false;
    this.warming = false;
    await fonts;
    await mark(1, 250);
    ui.hideLoading();
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
    // sign-in loads once the harbour is up, off the critical path
    setTimeout(() => this.cloudSave.start(), 900);
    // the picker's painted charts, made while the captain admires the ship
    setTimeout(() => this.seaPick.prepare(this.seaCards(), (x, z) => this.terrain.heightAt(x, z)), 2200);
    // came by an invite link: the crew card opens, one tap from aboard
    const join = new URLSearchParams(location.search).get('join');
    if (join) {
      const u = new URL(location.href);
      u.searchParams.delete('join');
      history.replaceState(null, '', u);
      this.crewUi.invite(join);
    }
  }

  /** The cloud rewrote some saves (another device's progress, or a sign-out). */
  private applyCloud(parts: Set<Part>) {
    // the world was reset on another device: this device's pins go with it
    if (parts.has('world')) this.waypoints.clear();
    if (parts.has('bounty')) this.bounty.reload();
    if (parts.has('fleet')) this.fleet.reload();
    if (parts.has('charts')) this.charts.reload();
    if (parts.has('fireworks')) this.fwLocker.reload();
    if (parts.has('forts')) {
      this.fortStore.reload();
      // a fort taken on another device changes hands here too (between voyages)
      if (this.state === 'menu') this.forts.apply(this.fortStore.state.taken);
    }
    if (parts.has('maps')) {
      this.maps.reload();
      this.syncTreasure();
    }
    if (parts.has('vault')) {
      this.vaultStore.reload();
      this.applyCosmetics();
    }
    if (parts.has('parts')) {
      this.partStore.reload();
      this.shipwright.refresh();
    }
    if (parts.has('look') || parts.has('ship') || parts.has('parts')) {
      parts.forEach((p) => this.cloudParts.add(p));
      // the moored ship only changes in the harbour, between scenes
      if (this.state === 'menu' && !this.vault.isOpen && !this.swBusy && this.adoptCloud()) this.setPreview(this.ui.selected);
    }
    // ...and so does the fleet moored beside her
    if (this.state === 'menu' && !this.vault.isOpen && !this.swBusy) this.mooreFleet();
  }

  /** Takes up a synced livery and favourite ship; true if the preview needs rebuilding. */
  private adoptCloud() {
    const p = this.cloudParts;
    if (!p.size) return false;
    if (p.has('look')) this.look = loadLook();
    this.ui.adoptSavedShip();
    p.clear();
    return true;
  }

  private wireUI() {
    const ui = this.ui;
    ui.onClick = () => {
      this.audio.start();
      this.audio.click();
    };
    ui.onSelect = (id) => this.setPreview(id);
    ui.onSail = () => this.chooseSea();
    this.seaPick.onClick = () => ui.onClick();
    ui.onAmmo = (id) => this.selectAmmo(id);
    ui.onFirework = (id) => this.chooseFirework(id);
    ui.fwCount = (id) => this.fwLocker.count(id);
    this.fwLocker.subscribe(() => ui.refreshFwPicker());
    ui.onResume = () => this.setPaused(false);
    ui.onPause = () => this.setPaused(true);
    ui.onZoomView = () => {
      const i = (this.rig.view + 1) % CameraRig.VIEWS.length;
      const v = CameraRig.VIEWS[i];
      this.rig.setView(v.zoom, v.tilt);
      this.ui.setZoomView(i, v.name, true);
    };
    ui.onMap = (on) => this.setChart(on);
    ui.onPin = (x, z, pick) => this.tapPin(x, z, pick);
    ui.onClearPins = () => {
      if (this.pilot.target?.pin !== undefined) this.stopPilot('Course cleared');
      this.waypoints.clear();
      if (this.chartSel?.pin) this.closeChartCard();
      this.audio.click();
    };
    ui.chartCard.onSail = () => this.chartSel && this.sailTo(this.chartSel.target);
    ui.chartCard.onStop = () => this.stopPilot('You have the helm');
    ui.chartCard.onClose = () => this.closeChartCard();
    ui.chartCard.onLift = () => {
      const pin = this.chartSel?.pin;
      if (!pin) return;
      if (this.pilot.target?.pin === pin.id) this.stopPilot('Course cleared');
      this.waypoints.lift(pin);
      this.closeChartCard();
      this.audio.click();
    };
    ui.helmHud.onCancel = () => this.stopPilot('You have the helm');
    ui.onPhoto = () => this.openPhoto();
    ui.onSweep = () => this.sweepWrecks();
    this.fleetHud.onOrder = (o) => {
      this.audio.click();
      this.giveOrder(o);
    };
    this.fleetHud.setOrder(this.fleet.state.order, false);
    ui.onQuit = () => {
      this.ui.showPause(false);
      this.resetWorld();
      this.enterMenu();
    };
    ui.onResetWorld = () => this.freshSea();
    ui.onAgain = () => this.leaveWreck(false);
    ui.onRetry = () => this.leaveWreck(true);
    ui.onTally = (i, best) => this.audio.tally(i, best);
    ui.onSkip = () => {
      // straight to the plunge; once under, straight to the farewell
      const k = this.wreck;
      if (k.t < 0) return;
      if (k.t < DIVE - 0.4) k.t = DIVE - 0.4;
      else k.skip = true;
    };
    ui.onSound = (on) => this.audio.setMuted(!on);
    ui.onSettings = (st) => {
      this.audio.setMusicEnabled(st.music);
      this.audio.setVolumes({ master: st.volMaster, music: st.volMusic, effects: st.volEffects, ambience: st.volAmbience });
      this.rig.shakeScale = SHAKE_SCALE[st.shake];
      this.applyPeace();
    };
    // peaceful seas: a blow from our side is how every quarrel starts, and a grudge is held against a captain's whole side
    Ship.onStruck = (s, by) => this.quarrel(s, by);
    setSideOf((s) => this.coop.ownerOf(s));
    this.audio.setMuted(!ui.settings.sound);
    ui.onSettings(ui.settings);
    const openBoard = () => {
      ui.onClick();
      this.board.render(this.bounty.ledger);
      ui.openOverlay('bounties');
      try {
        localStorage.setItem(BOARD_SEEN_KEY, this.boardSig());
      } catch {
        /* private mode: the dot just stays */
      }
      this.markBoard();
    };
    document.getElementById('btn-bounties')!.addEventListener('click', openBoard);
    document.getElementById('btn-bounties2')!.addEventListener('click', openBoard);
    this.bounty.onChange(() => {
      this.markBoard();
      if (!document.getElementById('bounties')!.classList.contains('hidden')) this.board.render(this.bounty.ledger);
    });
    this.markBoard();
  }

  /** What the Wanted Board shows, in brief: a new poster or a fresh stamp lights the harbour button's dot. */
  private boardSig() {
    const l = this.bounty.ledger;
    return `${l.seen.length}|${Object.keys(l.sunk).length}|${this.bounty.rank}`;
  }

  private markBoard() {
    let seen = '';
    try {
      seen = localStorage.getItem(BOARD_SEEN_KEY) ?? '';
    } catch {
      /* ignore */
    }
    const l = this.bounty.ledger;
    document.getElementById('bounty-dot')!.classList.toggle('hidden', !l.seen.length || seen === this.boardSig());
  }

  /** Pushes graphics settings into the renderer; safe to call any time. */
  private applySettings(s: GraphicsSettings) {
    const b = this.settings.budget;
    const maxSamples = this.renderer.capabilities.maxSamples || 0;
    this.pipeline.configure(
      { msaa: s.antialias ? Math.min(this.quality.mobile ? 2 : 4, maxSamples) : 0, bloomLevels: s.bloom ? Math.max(4, this.quality.bloomLevels) : 0, tiltShift: s.tiltShift, shafts: s.lightShafts ? b.shaftSteps : 0 },
      { ao: s.rtAO, gi: s.rtGI, shadows: s.rtShadows, aoSamples: b.aoSamples, shadowSteps: b.shadowSteps },
    );
    this.ocean?.setReflections(s.rtReflections ? b.ssrSteps : 0);
    const size = Math.min(s.shadowRes, this.renderer.capabilities.maxTextureSize);
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      // three rebuilds the map at the new size on the next shadow pass
      sh.map?.dispose();
      sh.map = null;
    }
    this.softShadows = s.softShadows;
    this.scaler.fixed = s.resolution;
    if (s.resolution && this.scaler.scale !== s.resolution) {
      this.scaler.scale = s.resolution;
      this.resize();
    }
  }

  // ------------------------------------------------------------------ shipwright

  private wireShipwright() {
    const sw = this.shipwright;
    // entries sit under Set Sail in the menu dock: the Shipwright and the Vault side by side
    const row = document.createElement('div');
    row.className = 'dock-row';
    const btn = document.createElement('button');
    btn.className = 'btn menu-custom';
    btn.id = 'btn-shipwright';
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></svg><span>Shipwright</span>';
    const vbtn = document.createElement('button');
    vbtn.className = 'btn menu-custom menu-vault';
    vbtn.id = 'btn-vault';
    vbtn.innerHTML = '<span class="mv-chest"></span><span>Vault</span><i class="mv-dot"></i>';
    row.append(btn, vbtn);
    document.getElementById('btn-sail')!.after(row);
    btn.addEventListener('click', () => {
      this.audio.start();
      this.audio.click();
      this.openShipwright();
    });
    vbtn.addEventListener('click', () => {
      this.audio.start();
      this.audio.click();
      this.openVault();
    });
    const syncDot = () => vbtn.classList.toggle('ready', this.vaultStore.freeReady || this.vaultStore.unseen.length > 0);
    this.vaultStore.subscribe(syncDot);
    syncDot();
    this.wireVault();
    const account = new AccountPanel(
      this.cloudSave,
      () => ({
        gold: this.vaultStore.purse,
        treasures: this.vaultStore.collected(),
        total: POOL.length,
        designs: loadDesigns().length,
        voyages: loadRecords().voyages,
      }),
      () => this.ui.openOverlay('account'),
      () => {
        this.audio.start();
        this.audio.click();
      },
    );
    this.cloudSave.onWelcome = (w) => account.welcome(w);
    this.crewUi = new CrewPanel(this.coop, {
      open: () => this.ui.openOverlay('crew'),
      click: () => {
        this.audio.start();
        this.audio.click();
      },
      atSea: () => this.state !== 'menu' && this.state !== 'port' && this.state !== 'loading',
      suggest: () => this.cloudSave.user?.name.split(/\s+/)[0] || this.look.name.trim() || 'Captain',
      peaceful: () => this.world.peaceful,
    });
    this.cloudSave.onApplied = (parts) => this.applyCloud(parts);
    this.cloudSave.onAdmin = () => {
      const parts = this.partStore.grantAll();
      const rockets = this.fwLocker.fill();
      if (!this.vaultStore.grantAll(ADMIN_GOLD) && !parts && !rockets) return;
      this.applyCosmetics();
      this.shipwright.refresh();
      this.ui.toast('Admiral of the fleet', 'A billion gold, every treasure, every ship part and a locker full of fireworks are yours', 6);
    };
    sw.setVault(this.vaultStore);
    sw.setParts(this.partStore);
    this.ui.loadout = (id) => this.partStore.loadout(id);
    this.partStore.subscribe(() => this.ui.refreshShip());
    this.ui.refreshShip();
    // every full ten from the vault comes with a ship part on top
    this.vaultStore.onPull = (n) => {
      if (n !== 10) return;
      const r = Math.random();
      const t = (r < 0.5 ? 0 : r < 0.82 ? 1 : r < 0.96 ? 2 : r < 0.995 ? 3 : 4) as PartTier;
      const f = this.partStore.grant(rollPart(t, (id) => this.partStore.owns(id)).id);
      if (f) this.vaultFinds.push(f);
    };
    sw.onFit = (slot, id) => this.refitPreview(slot, id);
    sw.whereSold = (id) => this.whereSold(id);
    sw.onEquip = () => this.applyCosmetics();
    sw.onVault = () => this.openVault();
    sw.onTestFire = () => this.testFire();
    sw.onClick = () => {
      this.audio.start();
      this.audio.click();
    };
    sw.onDone = () => this.closeShipwright();
    sw.onTab = (tab: SwTab, sub?: string) => {
      const was = this.swFocus;
      this.swFocus =
        tab === 'refit'
          ? (({ hull: 'hull', sails: 'sails', guns: 'guns', figure: 'bow' } as const)[sub as PartSlot] ?? 'overview')
          : ({ flag: 'flag', sails: 'sails', hull: 'hull', skins: 'overview', cannons: 'overview', presets: 'overview' } as const)[tab];
      if (tab !== 'refit' || this.swFocus !== was) this.swAz = 0;
    };
    sw.onChange = (look, what) => this.applyLook(look, what);
    // a saved hand-painted flag decodes in the background; redraw once it lands
    onPaintReady(() => {
      this.port.setLook(this.look);
      const s = this.preview;
      if (s) s.model.restyle(lookToLivery(this.look));
    });

    // drag to swing round the ship, wheel / pinch to zoom
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.state !== 'port') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      c.setPointerCapture(e.pointerId);
      pinch = 0;
    });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p || this.state !== 'port') return;
      if (pts.size === 1) {
        this.swAz = clamp(this.swAz - ((e.clientX - p.x) / Math.max(innerWidth, 1)) * 2.6, -1.25, 1);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX;
        p.y = e.clientY;
        const d1 = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch && d0 > 1) this.swZoom = clamp(this.swZoom * (d0 / d1), 0.6, 1.5);
        pinch = 1;
        return;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener(
      'wheel',
      (e) => {
        if (this.state !== 'port') return;
        e.preventDefault();
        this.swZoom = clamp(this.swZoom * Math.exp(e.deltaY * 0.0012), 0.6, 1.5);
      },
      { passive: false },
    );
  }

  private wireVault() {
    const v = this.vault;
    const a = this.audio;
    v.sounds = {
      click: () => a.click(),
      rumble: (l) => a.vaultRumble(l),
      burst: (t) => a.vaultBurst(t),
      flip: (t) => a.cardFlip(t),
      coin: () => a.coin(),
    };
    v.onEquip = () => {
      // the showcase keeps dressing the ship; just remember the choice
      if (this.vShow) this.vaultPreview(this.vShow);
      else this.applyCosmetics();
    };
    v.onClose = () => this.closeVault();
    v.stage = {
      charge: (t) => this.vstage.charge(t),
      burst: (t) => this.vstage.burst(t),
      pulse: (t) => this.vstage.pulse(t),
      settle: () => this.vstage.settle(),
      focus: (shot) => {
        this.vShot = shot;
        // the opening is a quick cut-in; everything else glides
        this.rig.shotPace = shot === 'charge' ? 1.1 : shot === 'burst' ? 0.9 : 0.75;
      },
      preview: (it) => this.vaultPreview(it),
      chestPoint: () => {
        const p = this.vstage.screenPoint(this.rig.camera, innerWidth, innerHeight);
        return p.front ? p : { x: innerWidth / 2, y: innerHeight * 0.55 };
      },
    };
  }

  /** Which side of the ship has the open water (the chest surfaces there): +1 port, -1 starboard. */
  private seaSide(s: Ship): 1 | -1 {
    const l = s.portDir(new THREE.Vector3());
    const back = new THREE.Vector3(-Math.sin(s.heading), 0, -Math.cos(s.heading)).multiplyScalar(s.cls.length * 0.5);
    let hp = 0;
    let hs = 0;
    for (const r of [14, 30, 55]) {
      hp += this.terrain.heightAt(s.pos.x + l.x * r + back.x, s.pos.z + l.z * r + back.z);
      hs += this.terrain.heightAt(s.pos.x - l.x * r + back.x, s.pos.z - l.z * r + back.z);
    }
    return hp <= hs ? 1 : -1;
  }

  /** The showcase: your ship tries on an item (or goes back to what she wears). */
  private vaultPreview(it: Cosmetic | null) {
    const s = this.preview;
    this.vShow = it;
    this.vstage.hushed = !!it;
    if (!s) return;
    this.applyCosmetics(s);
    if (!it) return;
    if (it.kind === 'skin') {
      s.model.setSkin(it as SkinItem);
      this.vShot = 'ship';
    } else {
      s.cannonFx[it.kind] = (it as FxItem).style;
      this.vShot = 'guns';
      this.vFireT = Math.min(this.vFireT, 1.1);
    }
    this.rig.shotPace = 0.7;
  }

  /** Frames the vault's camera each frame and keeps the showcase broadsides coming. */
  private frameVault(dt: number) {
    const st = this.vstage;
    if (!this.preview || !st.active) return;
    this.vTime += dt;
    const W = innerWidth;
    const H = innerHeight;
    const r = this.vault.freeRect();
    const vs = this.rig.viewShift;
    vs.x = W / 2 - (r.left + r.right) / 2;
    vs.y = H / 2 - (r.top + r.bottom) / 2;
    const fw = Math.max(1, r.right - r.left);
    const fh = Math.max(1, r.bottom - r.top);
    const fit = clamp(Math.max(1.3 / (fw / H), H / fh) ** 0.85, 1, 2.4);
    const shot = st.shot(this.vShot, fit, this.vTime);
    this.rig.shotPos.copy(shot.pos);
    this.rig.shotLook.copy(shot.look);
    this.rig.shotFov = shot.fov;
    if (this.vShot === 'guns' && this.vShow && this.vShow.kind !== 'skin') {
      this.vFireT -= dt;
      if (this.vFireT <= 0) {
        this.vFireT = 3.4;
        const at = new THREE.Vector3();
        const side = st.gunSide(at);
        const p = this.preview;
        p.reload[side] = 0;
        this.audio.start();
        p.fire(side, this.world, null, at);
      }
    }
    this.vault.placeChest(this.vShot === 'home' ? st.screenRect(this.rig.camera, W, H) : null);
  }

  /** The vault opens over the home screen or over the Shipwright's harbour. */
  private openVault() {
    if (this.vault.isOpen || this.swBusy || (this.state !== 'menu' && this.state !== 'port') || !this.preview) return;
    this.audio.start();
    if (this.state === 'menu') {
      this.ui.showMenu(false);
      // glide from the menu's orbit down to the water beside the ship
      this.rig.shotFromHere();
      this.rig.easeIn(0.8);
      this.rig.mode = 'port';
    } else this.shipwright.root.classList.add('sw-away');
    this.vaultOn = true;
    this.vShot = 'home';
    this.vShow = null;
    this.vTime = 0;
    this.rig.shotPace = 0.55;
    this.vSide = this.seaSide(this.preview);
    this.vstage.show(this.preview, this.vSide);
    this.vault.open();
  }

  private closeVault() {
    this.vault.close();
    this.vaultFinds.forEach((f, i) => setTimeout(() => this.announcePart(f, 'Bonus from the Treasure Vault', null), 500 + i * 900));
    this.vaultFinds = [];
    this.vaultOn = false;
    this.vShow = null;
    this.vstage.hide();
    this.applyCosmetics();
    this.rig.shotPace = 1;
    this.rig.shotFov = 38;
    this.rig.viewShift.x = this.rig.viewShift.y = 0;
    if (this.state === 'menu') {
      this.rig.easeIn(1.4);
      this.rig.mode = 'orbit';
      this.ui.showMenu(true);
      this.frameMenu();
    } else if (this.state === 'port') {
      this.shipwright.root.classList.remove('sw-away');
      this.shipwright.refresh();
    }
  }

  /** Dresses your ship (at the berth, in the menu or at sea) in what the vault says is equipped. */
  private applyCosmetics(s: Ship | null = this.player ?? this.preview) {
    if (!s || s.team !== 'player') return;
    const eq = this.vaultStore.equipped;
    s.model.setSkin(skinItem(eq.skin));
    s.cannonFx.blast = fxItem(eq.blast)?.style ?? 'powder';
    s.cannonFx.trail = fxItem(eq.trail)?.style ?? 'powder';
  }

  /** Shipwright: run out the guns on the seaward side and fire a broadside to see the blast and trail. */
  private testFire() {
    const p = this.preview;
    if (this.state !== 'port' || !p) return;
    const left = p.portDir(new THREE.Vector3());
    const reach = 45;
    const hl = this.terrain.heightAt(p.pos.x + left.x * reach, p.pos.z + left.z * reach);
    const hr = this.terrain.heightAt(p.pos.x - left.x * reach, p.pos.z - left.z * reach);
    const side = hl <= hr ? 'port' : 'starboard';
    const k = side === 'port' ? 1 : -1;
    p.reload[side] = 0;
    const at = new THREE.Vector3(p.pos.x + left.x * k * 70 + Math.sin(p.heading) * 6, 0, p.pos.z + left.z * k * 70 + Math.cos(p.heading) * 6);
    this.audio.start();
    if (p.fire(side, this.world, null, at)) this.swAz = k > 0 ? 0.5 : -0.5;
  }

  /** The Refit tab bolted on a part: rebuild her at the berth, with a flourish for the good ones. */
  private refitPreview(slot: PartSlot, id: string | null) {
    const old = this.preview;
    if (!old || this.state !== 'port') return;
    this.setPreview(old.cls.id);
    const s = this.preview!;
    this.port.setShip(s);
    this.port.pin(s);
    s.root.updateMatrixWorld(true);
    const p = partById(id);
    if (!p) {
      this.audio.click();
      return;
    }
    const sh = s.model.shape;
    const local = {
      hull: new THREE.Vector3(0, sh.top(0.5) + 0.6, 0),
      sails: new THREE.Vector3(0, s.cls.masts[0].height * 0.7, sh.z(s.cls.masts[0].t)),
      guns: new THREE.Vector3(0, sh.mainDeckY(0.5) + 1, 0),
      figure: new THREE.Vector3(0, sh.top(1), sh.z(1) + 0.6),
    }[slot];
    const at = s.model.root.localToWorld(local);
    const tier = Math.min(4, p.tier + 1);
    this.world.particles.treasure(at, RARITY[tier].glow, tier);
    if (p.tier >= 2) this.audio.treasure(tier);
    else this.audio.coin();
    // new guns want trying out
    if (slot === 'guns') setTimeout(() => this.testFire(), 650);
  }

  /** Which trading port's shipwright has a part in today, if any. */
  private whereSold(id: string) {
    const i = this.tradePorts.ports.findIndex((_, k) => portStock(k + 1).some((p) => p.id === id));
    return i >= 0 ? this.tradePorts.ports[i].name : null;
  }

  /** The port shipwright's counter, refreshed. */
  private refreshParts(bought?: string) {
    const port = this.dockPort;
    if (!port) return;
    const k = this.tradePorts.ports.indexOf(port);
    const offers = portStock(k + 1).map((p) => ({ part: p, owned: this.partStore.owns(p.id) }));
    this.market.setParts(offers, this.vaultStore.purse, bought);
    this.refreshFleetMarket();
  }

  private buyPart(id: string) {
    const port = this.dockPort;
    const p = partById(id);
    if (!port || !p || this.partStore.owns(id) || this.state !== 'docked') return;
    if (!this.vaultStore.spend(PART_RARITIES[p.tier].price)) return;
    const f = this.partStore.grant(id);
    if (f) this.announcePart(f, `Bought at ${port.name}`, null);
    port.unload(['calico'], true);
    port.cheer(p.tier >= 3 ? 2 : 1);
    this.refreshParts(id);
    this.note('trade', `Bought ${p.name}`, `${port.name} · ${PART_RARITIES[p.tier].price.toLocaleString('en-US')} gold`);
  }

  /** Streams a change from the panel onto the moored ship and the harbour. */
  private applyLook(look: ShipLook, what: 'flag' | 'paint' | 'sail' | 'hull' | 'name' | 'all') {
    const hullWas = hullKey(this.look);
    this.look = structuredClone(look);
    const s = this.preview;
    if (s) {
      const liv = lookToLivery(this.look);
      if (what === 'all' || what === 'name') s.name = this.look.name.trim() || s.cls.title;
      if (what === 'name') {
        // nothing to repaint
      } else if (what === 'paint') s.model.restyleFlag(liv);
      else if (what === 'flag' || what === 'sail' || hullKey(this.look) === hullWas) s.model.restyle(liv);
      else {
        // the hull is baked into the model: build a fresh one at the berth
        this.setPreview(s.cls.id);
        this.port.setShip(this.preview);
        this.port.pin(this.preview!);
      }
    }
    if (what !== 'name') this.port.setLook(this.look);
    clearTimeout(this.saveTimer);
    if (this.look.flag.paint !== 'live') this.saveTimer = window.setTimeout(() => saveLook(this.look), 300);
  }

  private async fade(mid: () => void) {
    this.swBusy = true;
    this.veil.classList.add('on');
    await new Promise((r) => setTimeout(r, 430));
    mid();
    await nextFrame();
    await nextFrame();
    this.veil.classList.remove('on');
    this.swBusy = false;
  }

  private openShipwright() {
    if (this.state !== 'menu' || this.swBusy) return;
    this.veil.innerHTML = `<span>Rowing to ${this.port.name}…</span>`;
    void this.fade(() => {
      this.state = 'port';
      this.ui.showMenu(false);
      for (const s of this.ships) s.root.visible = false;
      this.setPreview(this.ui.selected);
      const p = this.preview!;
      this.port.visible = true;
      this.port.setLook(this.look);
      this.port.setShip(p);
      this.port.pin(p);
      p.sailLevel = 1;
      // settle the model at the berth so the first shot finds its flag
      p.update(0.016, this.world);
      this.port.pin(p);
      p.root.updateMatrixWorld(true);
      this.swFocus = 'flag';
      this.swAz = 0;
      this.swZoom = 1;
      this.shipwright.open(this.look, this.port.name, this.preview?.cls.id);
      this.rig.mode = 'port';
      this.rig.menuShift = { x: 0, y: 0, w: 1, h: 1 };
      this.framePort(0);
      this.rig.snapShot();
    });
  }

  private closeShipwright() {
    if (this.state !== 'port' || this.swBusy) return;
    clearTimeout(this.saveTimer);
    saveLook(this.look);
    this.veil.innerHTML = '<span>Back to the open sea…</span>';
    void this.fade(() => {
      this.shipwright.close();
      this.port.visible = false;
      this.port.setShip(null);
      this.rig.camera.clearViewOffset();
      for (const s of this.ships) s.root.visible = true;
      this.enterMenu();
    });
  }

  /** Points the harbour camera at whatever the open tab is about. */
  private framePort(dt: number) {
    const p = this.preview;
    if (!p) return;
    this.swTime += dt;
    const sway = Math.sin(this.swTime * 0.16) * 0.07;
    const fit = this.fitPanel(this.shipwright.panelRect());
    const shot = this.port.shot(this.swFocus, p, this.swAz + sway, this.swZoom * fit);
    this.rig.shotPos.copy(shot.pos);
    this.rig.shotLook.copy(shot.look);
  }

  /** Shifts the view into the part of the screen a side panel (or bottom sheet) leaves free; returns how far to back off. */
  private fitPanel(r: DOMRect) {
    const W = innerWidth;
    const H = innerHeight;
    const vs = this.rig.viewShift;
    let fw = W;
    let fh = H;
    if (!r.width) vs.x = vs.y = 0;
    else if (r.left > W * 0.35) {
      vs.x = (W - r.left) / 2;
      vs.y = 0;
      fw = r.left;
    } else {
      vs.x = 0;
      vs.y = Math.max(0, H - r.top) / 2;
      fh = Math.max(r.top, H * 0.2);
    }
    // the shots are framed for a wide free area; back off when it is narrow or short
    return clamp(Math.max(1.17 / (fw / H), fh > 0 ? H / fh : 1) ** 0.85, 1, 2.6);
  }

  // ------------------------------------------------------------------ trading ports

  private wireTrade() {
    const m = this.market;
    document.body.appendChild(m.root);
    m.onClick = () => {
      this.audio.start();
      this.audio.knock();
    };
    m.onDock = () => {
      const p = this.player;
      const near = p && this.tradePorts.nearest(p.pos.x, p.pos.z);
      if (near && near.port.inReach(p.pos.x, p.pos.z)) this.dock(near.port);
      else {
        const ship = p && this.convoys.hailable(p);
        if (ship) this.hail(ship);
      }
    };
    m.onBuyWare = (id) => this.buyWare(id);
    m.onSell = (id) => this.sell(id);
    m.onSellAll = () => this.sell(null);
    m.onRepair = () => this.buyRepair();
    m.onBuyPart = (id) => this.buyPart(id);
    m.onHire = (id) => this.hire(id);
    m.onPayOff = (id) => this.payOff(id);
    m.onShot = () => this.buyShot();
    m.onBuyFirework = (id) => this.buyFirework(id);
    m.onLeave = () => this.castOff();
    // the hold chip opens a peek at what's aboard
    const chip = document.getElementById('hud-hold-chip')!;
    const peek = this.peek;
    peek.className = 'hold-peek';
    document.getElementById('hud')!.appendChild(peek);
    const draw = () => {
      peek.innerHTML = holdPeek(this.holds());
    };
    this.drawPeek = draw;
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.click();
      if (!peek.classList.toggle('on')) return;
      draw();
    });
    addEventListener('pointerdown', (e) => {
      if (peek.classList.contains('on') && !peek.contains(e.target as Node) && !chip.contains(e.target as Node)) peek.classList.remove('on');
    });
    this.hold.onChange = () => this.refreshHold();
  }

  private drawPeek = () => {};

  /** Every hold in the fleet: the flagship's, then each escort's still afloat (in the order they joined). */
  private holds(): Aboard[] {
    const out: Aboard[] = [{ name: this.player?.name ?? 'Your ship', hold: this.hold }];
    for (const ai of this.carriers()) out.push({ name: ai.ship.name, hold: ai.hold, escort: true });
    return out;
  }

  /** The escorts afloat that carry cargo, oldest hand first. */
  private carriers(): EscortAI[] {
    return [...this.escorts.values()].filter((a) => a.ship.alive && !a.ship.removed).sort((a, b) => a.rec.joined - b.rec.joined);
  }

  /** The hold chip (flagship, plus the escorts' share in aqua) and the peek, if it's open. */
  private refreshHold() {
    const es = this.carriers();
    let used = 0;
    let cap = 0;
    for (const a of es) {
      used += a.hold.used;
      cap += a.hold.capacity;
    }
    this.ui.setHold(this.hold.used, this.hold.capacity, es.length ? { used, cap } : null);
    if (this.peek.classList.contains('on')) this.drawPeek();
  }

  /** Goods come aboard the flagship; what she can't (or won't) keep goes across to an escort with room. */
  private stowFleet(goods: LootId[]): Stowed & { across: { name: string; n: number }[] } {
    const res = this.hold.stow(goods);
    const across: { name: string; n: number }[] = [];
    let spill = [...res.left, ...res.tossed];
    const p = this.player;
    if (spill.length && p && (this.state === 'playing' || this.state === 'docked')) {
      const fresh = res.left.slice();
      for (const ai of this.carriers()) {
        if (!spill.length) break;
        if (Math.hypot(ai.ship.pos.x - p.pos.x, ai.ship.pos.z - p.pos.z) > 520) continue;
        const r = ai.hold.stow(spill);
        if (r.kept.length) across.push({ name: ai.ship.name, n: r.kept.length });
        // what she took of the new goods counts as kept
        for (const id of r.kept) {
          const i = fresh.indexOf(id);
          if (i >= 0) {
            fresh.splice(i, 1);
            res.kept.push(id);
          }
        }
        spill = [...r.left, ...r.tossed];
      }
      res.left = spill.filter((id) => {
        const i = fresh.indexOf(id);
        if (i < 0) return false;
        fresh.splice(i, 1);
        return true;
      });
      res.tossed = spill.slice();
      for (const id of res.left) res.tossed.splice(res.tossed.indexOf(id), 1);
    }
    return { ...res, across };
  }

  /** Whether anyone in the fleet in reach of the flagship could take any of these. */
  private fleetWouldKeep(goods: LootId[]) {
    if (this.hold.wouldKeep(goods)) return true;
    const p = this.player;
    if (!p) return false;
    return this.carriers().some((a) => Math.hypot(a.ship.pos.x - p.pos.x, a.ship.pos.z - p.pos.z) < 520 && a.hold.wouldKeep(goods));
  }

  /** Off a quay's seaward face: offer to come alongside (F or a tap), unless pirates are on her tail. */
  private updateDockPrompt(p: Ship) {
    const near = p.alive ? this.tradePorts.nearest(p.pos.x, p.pos.z) : null;
    const port = near && near.port.inReach(p.pos.x, p.pos.z) ? near.port : null;
    if (!port) return this.updateHail(p);
    const hunted = this.huntedNear(p);
    const beast = this.kraken.fighting && !this.kraken.docile;
    const chased = !!this.lastFoe || hunted || beast;
    const n = this.holds().reduce((c, h) => c + h.hold.count, 0);
    const why = beast ? 'No harbour opens to a ship the Kraken hunts' : hunted && !this.lastFoe ? 'A hunter is on your tail: no harbour will let you in' : chased ? 'Shake off your pursuers to dock' : n ? `Sell ${n} ${n === 1 ? 'good' : 'goods'} · repairs · shot` : 'Repairs and fresh shot';
    this.market.setDock({ name: port.name, ok: !chased, why });
    if (!chased && !this.fpv && this.input.state.helm) this.dock(port);
    return true;
  }

  /** A named hunter closing in: she won't wait politely outside a harbour or off a beach. */
  private huntedNear(p: Ship) {
    // (on peaceful seas, only one you've given cause)
    for (const s of this.hunters.keys()) if (s.alive && !s.calm && Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) < 380) return true;
    return false;
  }

  // ------------------------------------------------------------------ going ashore

  /** Off a beach: offer to row the captain and four hands ashore (F or a tap). */
  private updateLandPrompt(p: Ship, dt: number, docking: boolean) {
    this.landT -= dt;
    if (this.landT <= 0) {
      this.landT = 0.3;
      this.landing = p.alive && !docking ? this.ground.landing(p.pos.x, p.pos.z, 55 + p.cls.beam) : null;
    }
    const L = this.landing;
    if (!L || docking || this.fpv) {
      this.shoreHud.setPrompt(null);
      return;
    }
    const hunted = this.huntedNear(p);
    const beast = this.kraken.active;
    const chased = !!this.lastFoe || hunted || beast;
    const camp = this.shore.camps.find((c) => c.site.island === L.island && !c.routed && !c.fort);
    const fort = this.forts.forts.find((f) => f.site.island === L.island && f.owner === 'brethren');
    // no boat lives long under a fort's guns: silence them, or land out of their reach
    const calm = this.world.peaceful ? { side: this.coop.me, now: this.world.time } : null;
    const guns = this.forts.covering(L.x, L.z, calm) ?? this.forts.covering(p.pos.x, p.pos.z, calm);
    const blocked = chased || !!guns;
    const sub = beast
      ? 'Not with the Kraken in these waters'
      : hunted && !this.lastFoe
      ? 'A hunter is on your tail: no time to row ashore'
      : chased
      ? 'Shake off your pursuers first'
      : guns
      ? `The guns of ${guns.name} cover this shore: silence them first`
      : fort
      ? `${fort.name} holds this isle: storm its gate`
      : camp
      ? this.world.peaceful ? 'Cutthroats are camped on this isle: they won\'t draw first' : 'Cutthroats are camped on this isle: bring blades'
      : 'The captain and four hands row in';
    this.shoreHud.setPrompt({ key: 'land', title: `Go ashore on ${L.island.name}`, sub, ok: !blocked });
    if (!blocked && this.input.state.helm) this.goAshore();
  }

  /** Lowers the boat: the ship rides at anchor while the landing party rows in. */
  private goAshore() {
    const p = this.player;
    const L = this.landing;
    if (!p || !L || !p.alive || this.state !== 'playing' || this.swBusy || this.lastFoe || this.kraken.active || this.shore.active || this.wreck.t >= 0) return;
    const calm = this.world.peaceful ? { side: this.coop.me, now: this.world.time } : null;
    if (this.forts.covering(L.x, L.z, calm) || this.forts.covering(p.pos.x, p.pos.z, calm)) return;
    this.setChart(false);
    this.setView(false);
    this.input.releaseLook();
    this.input.enabled = false;
    this.peek.classList.remove('on');
    this.veil.innerHTML = `<span>Rowing ashore to ${L.island.name}…</span>`;
    void this.fade(() => {
      if (this.state !== 'playing' || !p.alive) {
        this.input.enabled = true;
        return;
      }
      p.anchored = true;
      p.sailTarget = 0;
      p.rudder = 0;
      this.shore.land(p, L);
      this.market.setDock(null);
      this.shoreHud.setPrompt(null);
      this.shoreHud.show(true, L.island.name);
      this.input.foot = true;
      this.seaZoom = this.rig.zoom;
      this.rig.zoom = 0.32;
      this.rig.foot = true;
      this.rig.snapFoot();
      const cap = this.shore.captain!;
      this.rig.snapTo(this.shoreFocus.set(cap.x, cap.y + 1, cap.z));
      // the veil lifts on the party at the waterline, seen from behind the captain,
      // then the camera drops into their eyes
      this.footEye.begin(cap);
      this.rig.footAz = this.shoreEyePref ? cap.yaw + Math.PI : 0;
      this.rig.snapFoot();
      this.eyeWait = 0.5;
      this.shoreLeaving = false;
      this.input.enabled = true;
      this.note('isle', `Went ashore on ${L.island.name}`);
      this.audio.splash(0.35, 0, 20);
      this.ui.toast('Ashore', `${L.island.name}: your hands follow your lead`, 3.2);
      if (!this.shoreTipShown) {
        this.shoreTipShown = true;
        const eye = this.shoreEyePref;
        const how = this.input.isTouch
          ? `${eye ? 'Drag on the right to look · ' : ''}Tap Strike to swing, chain three for a lunge · Pistol fires once, then reloads · Jump to hop`
          : eye
            ? 'Click to grab the mouse and look around · Click swings, chain three for a lunge · Right-click fires your pistol · Space jumps · V for the bird\'s-eye view'
            : 'Click swings, chain three for a lunge · Q fires your pistol · Space jumps · Shift runs';
        setTimeout(() => {
          if (this.shore.active) this.ui.toast('Cutlass and pistol', how, 6);
        }, 3800);
      }
      this.last = performance.now();
    });
  }

  /** Back into the boat and out to the ship, which weighs anchor. */
  private returnToShip(why = '') {
    const p = this.player;
    if (!p || !this.shore.active || this.swBusy || this.shoreLeaving) return;
    this.input.enabled = false;
    this.input.releaseLook();
    this.setChart(false);
    const row = () => {
      if (!this.shore.active) return;
      this.veil.innerHTML = `<span>${why || `Rowing back to the ${p.name}…`}</span>`;
      void this.fade(() => {
        this.leaveShore();
        p.anchored = false;
        p.sailTarget = 1 / 3;
        this.input.enabled = this.state === 'playing';
        this.rig.snapTo(p.pos);
        this.last = performance.now();
      });
    };
    // up out of the captain's eyes over the beach first, then the veil
    if (this.rig.eyeBlend > 0.05) {
      this.shoreLeaving = true;
      setTimeout(row, 720);
    } else row();
  }

  /** Everyone aboard: the HUD, controls and camera go back to sailing. */
  private leaveShore(asPrize = false) {
    if (!this.shore.active) return;
    if (asPrize) this.shore.leaveAsPrize();
    else this.shore.leave();
    this.prizeOpen = false;
    this.shoreHud.showPrize(null);
    this.shoreHud.show(false);
    this.input.foot = false;
    this.input.eye = false;
    this.input.releaseLook();
    this.shoreLeaving = false;
    this.shore.eyes = false;
    this.shoreHud.setEye(false, false, false);
    this.ui.setFpv(false);
    if (!this.fpv) this.rig.resetEye();
    this.rig.foot = false;
    this.rig.deck = false;
    this.rig.footAz = 0;
    this.rig.snapFoot();
    this.rig.zoom = this.seaZoom;
  }

  /** Ashore: through the captain's eyes, or the bird's-eye view over their shoulder (V). */
  private setShoreEye(on: boolean) {
    if (on === this.shoreEyePref) return;
    this.shoreEyePref = on;
    try {
      localStorage.setItem(SHORE_EYE_KEY, on ? '1' : '0');
    } catch {
      /* private mode */
    }
    const cap = this.shore.captain;
    if (on && cap) this.footEye.begin(cap);
    if (!on) this.input.releaseLook();
    this.eyeWait = 0;
  }

  /** F or a tap ashore: row back, or open a chest (on a boarded deck: fall back aboard, or take the prize). */
  private shoreAct() {
    if (!this.shore.active || this.swBusy) return;
    if (this.prizeOpen) return this.choosePrize('prize');
    if (this.shore.interact(this.world) !== 'boat') return;
    if (this.shore.deck) this.endBoarding('retreat');
    else this.returnToShip();
  }

  private onCampRouted(c: Camp) {
    const fort = c.fort ? this.forts.forts.find((f) => f.garrison === c) : null;
    if (fort) return this.takeFort(fort);
    this.ui.toast('Camp routed', 'Their chest is yours for the taking', 3.4);
    this.note('kill', 'Routed a cutthroat camp', c.site.island.name);
    this.audio.chime();
  }

  /** The cutthroats' chest: gold, goods for the hold and shot for the guns. */
  private plunderCamp(c: Camp) {
    const p = this.player;
    if (!p) return;
    const L = c.layout.chest;
    this.footEye.glance(L, 1.1, 4, true);
    const at = new THREE.Vector3(L.x, L.y + 1.2, L.z);
    const fort = !!c.fort;
    // a fort's pay chest holds a garrison's wages, not a cutthroat's pickings
    const gold = fort ? 520 + Math.round(Math.random() * 300) : 120 + Math.round(Math.random() * 140) + c.gang.length * 15;
    p.gold += gold;
    this.vaultStore.earn(gold);
    const tier = fort ? rollTier(1.2, 3) : rollTier(0.5, 2);
    const goods = rollContents(tier);
    const res = this.stowFleet(goods);
    if (res.tossed.length || res.across.length) this.nagHold(res.tossed.length, res.across);
    this.stockAmmo(fort ? { shell: 4, fire: 2, chain: 2, grape: 3 } : { shell: 2, fire: 1, chain: 1, grape: 2 }, null);
    this.log.chests++;
    this.log.best = Math.max(this.log.best, tier);
    const kept = res.kept.slice().sort((a, b) => LOOT[b].rarity - LOOT[a].rarity || LOOT[b].price - LOOT[a].price);
    const R = RARITY[tier];
    this.note('chest', fort ? 'Opened a fort\'s pay chest' : `Plundered a cutthroat camp`, `+${gold} gold${kept.length ? ' · ' + kept.map((id) => LOOT[id].name).join(', ') : ''}`);
    const [x, y, ok] = this.screenOf(at);
    if (ok) this.ui.floater(`+${gold} gold`, x, y, (['loot', 'loot', 'rare', 'epic', 'legendary'] as const)[tier]);
    this.audio.treasure(tier);
    this.world.particles.treasure(at, R.glow, tier);
    const best = kept[0];
    if (best && LOOT[best].rarity >= 2) this.ui.lootToast(lootIcon(best), LOOT[best].rarity, `${RARITIES[LOOT[best].rarity].name} plunder`, LOOT[best].name, 3.4);
    else this.ui.toast(`${R.name} chest · +${gold} gold`, kept.length ? kept.map((id) => LOOT[id].name).join(', ') : 'And fresh shot for the guns', 3.4);
    this.rig.shake(0.12);
    this.chestPart(Math.max(2, tier), at, 1200);
    // cutthroats always carry a scrap of somebody's map
    setTimeout(() => this.foundPiece(at), 1400);
  }

  // ------------------------------------------------------------------ the forts

  private wireForts() {
    this.fortHud = new FortHud(document.getElementById('hud')!);
    this.forts.apply(this.fortStore.state.taken);
    this.forts.hooks = {
      openFire: (f) => {
        if (this.state !== 'playing') return;
        this.ui.toast(`${f.name} opens fire!`, 'The Brethren\'s shore guns have your range', 3.4);
        this.audio.wanted(2);
        this.note('fort', `Came under the guns of ${f.name}`, f.site.island.name);
      },
      struck: (_f, _g, dmg, at) => {
        if (this.state !== 'playing') return;
        this.log.hits++;
        this.log.dealt += dmg;
        const [x, y, ok] = this.screenOf(at);
        if (ok) this.ui.floater(`${Math.round(dmg)}`, x, y);
      },
      silenced: (f, g, last) => this.gunSilenced(f, g, last),
      riled: (f, side, by) => this.fortRiled(f, side, by),
    };
  }

  private gunSilenced(f: Fort, g: Gun, last: boolean) {
    if (this.state !== 'playing') return;
    const [x, y, ok] = this.screenOf(_a.copy(g.base).setY(g.base.y + 3));
    if (ok) this.ui.floater('Silenced!', x, y, 'rare');
    this.addInfamy(4);
    if (last) {
      this.ui.toast(`The guns of ${f.name} are silent`, 'Land your crew and storm the fort', 4.2);
      this.note('fort', `Silenced the guns of ${f.name}`, f.site.island.name);
      this.audio.horn();
    } else {
      const n = this.forts.liveGuns(f);
      this.ui.toast('Gun silenced', `${n} of ${f.guns.length} still firing`, 2.4);
    }
  }

  /** The garrison is beaten: their colours come down, yours go up, and the fort is yours for good. */
  private takeFort(f: Fort) {
    this.forts.conquer(f);
    this.fortStore.take(f.id);
    this.note('fort', `Took ${f.name}`, `${f.site.island.name} · ${TRIBUTE_HOUR} gold tribute an hour`);
    this.addInfamy(30);
    this.ui.toast('The garrison throws down its arms', 'Their colours are coming down', 2.6);
    this.audio.chime();
    // your colours up the staff once theirs are down: the card, a fanfare, a burst of light at the truck
    setTimeout(() => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      this.fortHud.taken(f.name, `Its guns are yours · ${TRIBUTE_HOUR} gold tribute an hour · repairs under its walls`);
      this.audio.bounty();
      this.rig.shake(0.12);
    }, 2600);
    setTimeout(() => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      const top = f.layout.flagTop;
      for (let i = 0; i < 3; i++) this.particles.treasure(_a.set(top.x, top.y + 0.5, top.z), [0.4, 1.4, 1.3], 3);
      this.audio.coin(0, 0.6);
    }, 6000);
  }

  /** The fort bar, tribute paid in as you pass, and carpenters under your own walls. */
  private updateForts(p: Ship, dt: number) {
    const ashore = this.shore.active;
    const cap = ashore ? this.shore.captain : null;
    const ax = cap ? cap.x : p.pos.x;
    const az = cap ? cap.z : p.pos.z;
    const f = this.kraken.fighting || this.shore.deck ? null : this.forts.nearest(ax, az);
    this.fortHud.show(!!f && !this.photo.active);
    if (f) {
      const ours = f.owner === 'player';
      const guns = f.guns.map((g) => !g.dead);
      const live = this.forts.liveGuns(f);
      const gar = f.garrison && !f.garrison.routed ? f.garrison.gang.filter((w) => !w.down).length : -1;
      let hint = '';
      let hot = false;
      if (ours) {
        const owed = this.fortStore.owed(f.id);
        hint =
          f.up < 1
            ? 'Your colours are going up'
            : this.forts.havenNear(p.pos.x, p.pos.z) && p.hp < p.maxHp - 1
            ? 'Under its walls · carpenters at work'
            : owed > 0
            ? `Tribute gathering · ${owed} gold`
            : 'Safe harbour · its guns cover you';
      } else if (live > 0) {
        const near = Math.hypot(f.site.x - p.pos.x, f.site.z - p.pos.z) < FORT_RANGE + 30;
        hint = near ? (this.gunnery.combat ? 'Silence its guns' : 'Close in: its walls stand high') : 'Silence its guns';
        hot = near && f.alert;
        if (this.world.peaceful && !f.grudge.holds(this.coop.me, this.world.time)) {
          hint = 'Holding its fire · fire first and it answers';
          hot = false;
        }
      } else if (ashore) {
        hint = f.garrison?.alert ? 'Beat the garrison' : 'Storm the gate';
        hot = true;
      } else {
        hint = 'Guns silent · land and storm the fort';
        hot = true;
      }
      this.fortHud.set({ name: f.name, kind: f.style.kind, ours, guns, garrison: ours ? -1 : gar, hint, hot });
    }
    // tribute: the garrison rows it out as you pass
    this.tributeT -= dt;
    if (this.tributeT <= 0 && !ashore && p.alive) {
      this.tributeT = 1.5;
      for (const o of this.forts.forts) {
        if (o.up < 1 || !this.forts.collectRange(o, p.pos.x, p.pos.z) || this.fortStore.owed(o.id) < 10) continue;
        const n = this.fortStore.collect(o.id);
        if (!n) continue;
        p.gold += n;
        this.vaultStore.earn(n);
        this.stockAmmo({ shell: 1, fire: 1, chain: 1, grape: 1 }, null);
        this.ui.toast(`+${n} gold tribute`, `${o.name} sends out its tribute, and fresh shot`, 3.8);
        this.audio.coin();
        this.audio.coin(0.18, 0.4);
        this.note('trade', `Collected tribute from ${o.name}`, `+${n} gold`);
        const [x, y, ok] = this.screenOf(_a.set(p.pos.x, p.root.position.y + p.cls.freeboard + 5, p.pos.z));
        if (ok) this.ui.floater(`+${n} gold`, x, y, 'loot');
      }
    }
    // repairs: carpenters out in boats while you lie quiet under your own guns
    const haven = p.alive && !this.lastFoe ? this.forts.havenNear(p.pos.x, p.pos.z, HAVEN_R) : null;
    if (haven && this.world.time - p.lastHit > 6) {
      const was = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.03 * dt);
      for (const s of this.escortShips) if (s.alive && this.world.time - s.lastHit > 6) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.03 * dt);
      this.havenT -= dt;
      if (was < p.maxHp && this.havenT <= 0) {
        // the odd hammer-knock and a few chips of fresh timber off her side
        this.havenT = 0.7 + Math.random() * 0.9;
        this.audio.knock();
        const side = Math.random() < 0.5 ? 1 : -1;
        const at = _a.set(p.pos.x + Math.cos(p.heading) * side * p.cls.beam * 0.5, p.root.position.y + p.cls.freeboard * 0.6, p.pos.z - Math.sin(p.heading) * side * p.cls.beam * 0.5);
        this.particles.sparkle(at, [1.2, 1.0, 0.6], 0.6);
      }
    }
  }

  /** The forts for the minimap and the chart. */
  private fortMarks() {
    return this.forts.forts.map((f) => ({ x: f.site.x, z: f.site.z, ours: f.owner === 'player', quiet: f.owner === 'brethren' && f.guns.every((g) => g.dead) }));
  }

  // ------------------------------------------------------------------ treasure maps

  /** Where a new map's X falls, from its seed. */
  private digTarget(seed: number): DigTarget | null {
    // the X falls among the isles of whichever archipelago you're in
    const p = this.player?.pos ?? this.spawnPoint;
    const here = nearestRegion(p.x, p.z).region;
    const t = digSite(this.ground, seed, this.digAvoid, this.port.site.island, (i) => nearestRegion(i.x, i.z).region === here);
    return t && { isle: t.island.name, x: t.x, z: t.z };
  }

  /** A torn piece of map: one more third, and the whole map once there are three. */
  private foundPiece(at: THREE.Vector3 | null) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const i = this.maps.addPiece((seed) => this.digTarget(seed));
    if (i < 0) return;
    const n = this.maps.count;
    let sx: number | null = null;
    let sy: number | null = null;
    if (at) {
      const [x, y, ok] = this.screenOf(at);
      if (ok) {
        this.ui.floater('Treasure map piece!', x, y - 30, 'rare');
        sx = x;
        sy = y - 10;
      }
    }
    this.mapUi.flyPiece(i, sx, sy);
    const how = this.input.isTouch ? 'tap the map chip' : 'press T';
    if (n < 3) {
      this.ui.toast(`Treasure map · ${n} of 3 pieces`, `Torn and stained: ${how} to look`, 3.6);
      this.audio.chime();
    } else {
      const t = this.maps.target!;
      this.ui.toast('The map is whole!', `X marks the spot on ${t.isle}`, 5.5);
      this.audio.treasure(3);
      this.note('chest', 'Pieced together a treasure map', t.isle);
      this.syncTreasure();
    }
  }

  /** The X on the sand matches the map in hand. */
  private syncTreasure() {
    this.shore.setTreasure(this.maps.target);
  }

  /** Unrolls the map over the HUD (the world sails on beneath, as with the chart). */
  private setMapView(on: boolean) {
    if (on && (this.mapUi.isOpen || (this.state !== 'playing' && this.state !== 'paused'))) return;
    if (!on && !this.mapUi.isOpen) return;
    if (on) {
      this.setChart(false);
      this.input.releaseLook();
      const m = this.maps.state;
      const isl = this.mapIsland();
      const cap = this.shore.active ? this.shore.captain : null;
      const p = this.player;
      this.mapUi.show(true, m, isl, (x, z) => this.terrain.heightAt(x, z), cap ? { x: cap.x, z: cap.z } : p ? { x: p.pos.x, z: p.pos.z } : null);
      this.audio.parchment();
    } else {
      this.mapUi.show(false);
      this.audio.parchment(0.6);
    }
  }

  /** The isle the map's X is on: by name, or (should the charts have renamed it) the one under the X. */
  private mapIsland() {
    const m = this.maps.state;
    if (!m.pieces && !m.isle) return null;
    let isl = this.terrain.islands.find((i) => i.name === m.isle) ?? null;
    if (!isl) {
      let best = Infinity;
      for (const i of this.terrain.islands) {
        const d = Math.hypot(i.x - m.x, i.z - m.z) / Math.max(1, i.r);
        if (d < best) [best, isl] = [d, i];
      }
    }
    return isl;
  }

  /** The chest is out of the ground: a hoard, the map spent. */
  private onUnearthed(at: THREE.Vector3) {
    const p = this.player;
    if (!p) return;
    this.footEye.glance(at, 1.6, 3, true);
    const gold = 450 + Math.round(Math.random() * 450);
    p.gold += gold;
    this.vaultStore.earn(gold);
    const tier = rollTier(0.9, 3);
    const goods = [...rollContents(tier), ...rollContents(rollTier(0.6, 2))];
    const res = this.stowFleet(goods);
    if (res.tossed.length || res.across.length) this.nagHold(res.tossed.length, res.across);
    this.stockAmmo({ shell: 3, fire: 2, chain: 2, grape: 3 }, null);
    this.log.chests++;
    this.log.best = Math.max(this.log.best, tier);
    const kept = res.kept.slice().sort((a, b) => LOOT[b].rarity - LOOT[a].rarity || LOOT[b].price - LOOT[a].price);
    const isle = this.mapIsland()?.name ?? this.maps.state.isle;
    this.note('chest', `Dug up buried treasure on ${isle}`, `+${gold} gold${kept.length ? ' · ' + kept.map((id) => LOOT[id].name).join(', ') : ''}`);
    const [x, y, ok] = this.screenOf(at);
    if (ok) this.ui.floater(`+${gold} gold`, x, y, (['loot', 'loot', 'rare', 'epic', 'legendary'] as const)[tier]);
    this.audio.treasure(tier);
    this.rig.shake(0.2);
    this.mapUi.reveal({
      isle,
      gold,
      items: kept.map((id) => ({ art: lootIcon(id), rarity: LOOT[id].rarity, name: LOOT[id].name })),
      x: ok ? x : null,
      y: ok ? y : null,
    });
    this.maps.consume();
    this.syncTreasure();
  }

  /** The captain is down: the hands carry them back to the boat, and the camp keeps its chest. */
  private onCaptainDown() {
    const p = this.player;
    if (!p) return;
    if (this.shore.deck) return this.onRepelled();
    const lost = Math.min(Math.round(p.gold * 0.1), 200);
    this.ui.toast('The captain is down', 'The hands drag you back to the boat', 3.2);
    this.input.enabled = false;
    setTimeout(() => {
      if (!this.shore.active || this.state === 'dead') return;
      if (this.state === 'paused') this.setPaused(false);
      p.gold = Math.max(0, p.gold - lost);
      this.note('isle', 'Beaten back off the beach', lost ? `-${lost} gold` : '');
      this.returnToShip('The hands row you back, bruised…');
      if (lost) setTimeout(() => this.ui.toast(`-${lost} gold`, 'Dropped in the scramble for the boat', 3.2), 900);
    }, 2400);
  }

  // ------------------------------------------------------------------ boarding

  /** A pirate shot to pieces and close aboard: offer to grapple her (F or a tap). Returns whether it's on offer. */
  private updateBoardPrompt(p: Ship, dt: number) {
    this.boardT -= dt;
    if (this.boardT <= 0) {
      this.boardT = 0.25;
      this.boardable = this.boardTarget(p);
    }
    const e = this.boardable;
    if (!e || this.fpv) return false;
    if (!e.alive || e.removed) {
      this.boardable = null;
      return false;
    }
    const named = e.hunter ? CAPTAIN.get(e.hunter) : undefined;
    const beast = this.kraken.active;
    const sub = beast ? 'Not with the Kraken in these waters' : named ? `${named.epithet} waits on her deck, blade drawn` : 'She\'s shot to pieces: grapple her and take her deck';
    this.shoreHud.setPrompt({ key: 'board', title: `Board the ${e.name}`, sub, ok: !beast });
    if (!beast && this.input.state.helm) this.startBoarding();
    return true;
  }

  /** The nearest pirate (no phantom) with her hull below 40% and her rail within a grapnel's throw. */
  private boardTarget(p: Ship): Ship | null {
    if (!p.alive || this.state !== 'playing' || this.wreck.t >= 0) return null;
    let best: Ship | null = null;
    let bd = Infinity;
    for (const s of this.ais.keys()) {
      if (!s.alive || s.removed || s.ghost || s.prize || s.hp > s.maxHp * 0.4) continue;
      // rail to rail
      const d = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) - (p.cls.beam + s.cls.beam) / 2;
      const reach = 16 + Math.min(p.cls.length, s.cls.length) * 0.35;
      if (d < reach && d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Grapnels away: the lines fly, bite and haul her in (game/boarding.ts), then it's over the side. */
  private startBoarding() {
    const p = this.player;
    const e = this.boardable;
    if (!p || !e || !p.alive || !e.alive || this.state !== 'playing' || this.swBusy || this.shore.active || this.boarding.busy || this.kraken.active || this.wreck.t >= 0) return;
    const ours = this.crew.deckPlan(p);
    const hers = this.crew.deckPlan(e);
    if (!ours || !hers) return;
    this.setChart(false);
    this.setView(false);
    this.input.releaseLook();
    this.peek.classList.remove('on');
    this.boarding.begin(p, e, ours, hers);
    this.boardable = null;
    this.shoreHud.setPrompt(null);
    const named = e.hunter ? CAPTAIN.get(e.hunter) : undefined;
    this.ui.toast('Grapnels away!', named ? `${named.epithet} won't strike without a fight` : `Haul the ${e.name} alongside`, 2.8);
    this.audio.shout(0.75, 0, 0, false, 4);
    this.audio.bosunPipe();
  }

  /** Her hull grinds into ours: a boom of timbers, spray squeezed up between the two. */
  private hullsMeet(at: THREE.Vector3) {
    this.audio.hullsMeet(0.9, 0);
    this.rig.shake(0.3);
    const y = this.world.waterHeight(at.x, at.z);
    const p = this.player;
    const e = this.boarding.prize;
    if (!p || !e) return;
    const f = p.forward.clone();
    for (let i = -2; i <= 2; i++) {
      const k = i * Math.min(p.cls.length, e.cls.length) * 0.16;
      this.particles.splash(_a.set(at.x + f.x * k, y, at.z + f.z * k), 0.45 + Math.random() * 0.2);
    }
  }

  /** Lashed alongside: the captain and hands swing across onto her deck, and her crew meet them. */
  private boardOver() {
    const p = this.player;
    const e = this.boarding.prize;
    if (!p || !e || !e.alive || this.state !== 'playing') {
      this.boarding.part();
      return;
    }
    const named = e.hunter ? CAPTAIN.get(e.hunter) : undefined;
    // survivors you fished out of the sea are first over her rail
    const hands = ({ sloop: 3, brig: 4, galleon: 6 }[p.cls.id] ?? 4) + Math.min(3, Math.floor(this.rescued / 2));
    const foes = ({ sloop: 4, brig: 6, galleon: 8 }[e.cls.id] ?? 5) + (named ? 1 : 0);
    const ok = this.shore.board(p, e, {
      hands, foes,
      bossHp: named ? 150 + named.tier * 30 : 115,
      boss: named ? named.epithet : 'Her captain',
      hand: 'Pirate',
    });
    if (!ok) {
      this.boarding.part();
      return;
    }
    this.market.setDock(null);
    this.shoreHud.show(true, e.name, 'Boarding party');
    this.input.foot = true;
    this.seaZoom = this.rig.zoom;
    this.rig.zoom = 0.3;
    // no cut: the camera swoops round and down, out over the water beyond her, as the party swings across
    this.rig.foot = true;
    this.rig.deck = true;
    this.rig.deckYaw = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    this.audio.shout(0.9, 0, 0, false, 6);
    this.ui.toast('Over the side!', named ? `Cut down ${named.epithet} and her crew will strike` : 'Cut down her captain and her crew will strike', 3.2);
    if (!this.boardTipShown) {
      this.boardTipShown = true;
      const how = this.input.isTouch ? 'Strike to swing, Pistol to fire · back to your own rail to fall back' : 'Click swings · Q fires your pistol · Space jumps · F at your own rail falls back';
      setTimeout(() => {
        if (this.shore.deck) this.ui.toast('Fight for her deck', how, 5.5);
      }, 3600);
    }
  }

  /** Her crew throws in: the strongbox is broken open, a named captain's bounty paid, and the prize card comes up. */
  private onStruck(e: Ship) {
    const p = this.player;
    if (!p || this.state !== 'playing') return;
    const named = e.hunter ? CAPTAIN.get(e.hunter) : undefined;
    const id = e.cls.id;
    const gold = ({ sloop: 150, brig: 280, galleon: 480 }[id] ?? 200) + Math.round(Math.random() * 120) + (named ? named.tier * 120 : 0);
    p.gold += gold;
    this.vaultStore.earn(gold);
    const tier = rollTier({ sloop: 0.35, brig: 0.55, galleon: 0.8 }[id] ?? 0.4, named ? 4 : 3);
    const goods = [...rollContents(tier), ...rollContents(rollTier(0.4, 2))];
    const res = this.stowFleet(goods);
    if (res.tossed.length || res.across.length) this.nagHold(res.tossed.length, res.across);
    this.stockAmmo({ shell: 2, fire: 1, chain: 2, grape: 3 }, null);
    this.log.chests++;
    this.log.best = Math.max(this.log.best, tier);
    const kept = res.kept.slice().sort((a, b) => LOOT[b].rarity - LOOT[a].rarity || LOOT[b].price - LOOT[a].price);
    this.prizeHaul = `Her strongbox: +${gold} gold${kept.length ? ' · ' + kept.slice(0, 3).map((k) => LOOT[k].name).join(', ') + (kept.length > 3 ? ` +${kept.length - 3}` : '') : ''}`;
    const at = new THREE.Vector3(e.pos.x, e.root.position.y + e.cls.freeboard + 1.5, e.pos.z);
    const [x, y, ok] = this.screenOf(at);
    if (ok) this.ui.floater(`+${gold} gold`, x, y, (['loot', 'loot', 'rare', 'epic', 'legendary'] as const)[tier]);
    this.audio.treasure(tier);
    this.rig.shake(0.15);
    this.pipeline.flash(0.08);
    this.ui.toast(`The ${e.name} strikes her colours!`, 'Her crew throw down their blades', 3.4);
    this.boarding.strike(e);
    const best = kept[0];
    if (best && LOOT[best].rarity >= 2) setTimeout(() => this.ui.lootToast(lootIcon(best), LOOT[best].rarity, `${RARITIES[LOOT[best].rarity].name} plunder`, LOOT[best].name, 3.4), 700);
    this.note('kill', `Boarded and took the ${e.name}`, this.prizeHaul.replace('Her strongbox: ', ''));
    // a named captain taken at the point of your cutlass: her poster stamped, her bounty yours
    if (named) {
      this.claimHunter(e, named, p);
      e.hunter = null;
    }
    this.chestPart(Math.max(1, tier), at, 1500);
    if (Math.random() < 0.3) setTimeout(() => this.foundPiece(at), 2000);
    setTimeout(() => this.offerPrize(), 1700);
  }

  /** What becomes of her: sent to port for prize money, or blown up for her bounty and salvage. */
  private offerPrize() {
    const e = this.shore.prize;
    if (!e || !this.shore.deck || !this.shore.struck || this.state === 'dead') return;
    this.prizeOpen = true;
    this.shoreHud.showPrize({
      name: e.name,
      haul: this.prizeHaul,
      prize: `+${this.prizeMoney(e).toLocaleString('en-US')} gold prize money`,
      scuttle: 'Her bounty, salvage and infamy',
      fleet: this.fleet.full ? `Your fleet is full (${this.fleet.ships.length} escorts): pay one off in port` : `Her crew sign on: she sails at your side, every voyage`,
      fleetOk: !this.fleet.full,
    });
    this.audio.bell(2, 0.2);
  }

  private prizeMoney(e: Ship) {
    const heat = 1 + wantedLevel(this.heat.pts) * HEAT_BONUS;
    return Math.round(({ sloop: 380, brig: 700, galleon: 1250 }[e.cls.id] ?? 500) * heat * this.bounty.bonus);
  }

  private choosePrize(k: 'prize' | 'scuttle' | 'fleet') {
    if (!this.prizeOpen || (k === 'fleet' && this.fleet.full)) return;
    this.audio.click();
    this.endBoarding(k);
  }

  /** The captain is down on her deck: the hands drag you back over the rail and cut the lines. */
  private onRepelled() {
    const p = this.player!;
    const lost = Math.min(Math.round(p.gold * 0.1), 200);
    this.ui.toast('The captain is down', 'The hands drag you back aboard', 3.2);
    this.input.enabled = false;
    setTimeout(() => {
      if (!this.shore.deck || this.state === 'dead') return;
      if (this.state === 'paused') this.setPaused(false);
      p.gold = Math.max(0, p.gold - lost);
      this.note('kill', `Beaten back off the ${this.shore.prize?.name ?? 'pirate'}'s deck`, lost ? `-${lost} gold` : '');
      this.endBoarding('repelled');
      if (lost) setTimeout(() => this.ui.toast(`-${lost} gold`, 'Lost in the scramble back over the rail', 3.2), 1100);
    }, 2400);
  }

  /** Back aboard behind the veil, the lines cut and the hulls parted, and her fate settled. */
  private endBoarding(how: 'prize' | 'scuttle' | 'fleet' | 'retreat' | 'repelled' | 'sinking') {
    const p = this.player;
    const e = this.shore.prize;
    if (!p || !this.shore.deck || this.swBusy) return;
    this.input.enabled = false;
    this.prizeOpen = false;
    this.shoreHud.showPrize(null);
    const name = e?.name ?? 'pirate';
    const say = {
      prize: `A prize crew takes over the ${name}…`,
      scuttle: `A slow match in the ${name}'s magazine…`,
      fleet: `The ${name}'s crew sign the articles…`,
      retreat: `Back over the rail to the ${p.name}…`,
      repelled: `The hands haul you back aboard the ${p.name}…`,
      sinking: `She's going down: back aboard the ${p.name}!`,
    }[how];
    this.veil.innerHTML = `<span>${say}</span>`;
    void this.fade(() => {
      this.leaveShore(how === 'prize');
      this.boarding.part();
      p.anchored = false;
      p.sailTarget = 1 / 3;
      if (e && e.alive && this.state === 'playing') {
        if (how === 'prize') this.takePrize(p, e);
        else if (how === 'scuttle') this.scuttle(p, e);
        else if (how === 'fleet') this.enlist(p, e);
        // a crew that saw you off takes heart, and patches a little of the damage
        else e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1);
      }
      this.input.enabled = this.state === 'playing';
      this.rig.snapTo(p.pos);
      this.last = performance.now();
    });
  }

  /** Sent off to port under a prize crew: prize money now, infamy for the taking, and whatever she had bolted on. */
  private takePrize(p: Ship, e: Ship) {
    const gold = this.prizeMoney(e);
    p.gold += gold;
    this.vaultStore.earn(gold);
    p.kills++;
    this.ais.delete(e);
    this.boarding.sendAway(e);
    this.boarding.hoist(e, p);
    this.spawnTimer = Math.max(this.spawnTimer, 10);
    this.addInfamy(KILL_INFAMY[e.cls.id]);
    this.note('kill', `Took the ${e.name} as a prize`, `${e.cls.name} · +${gold.toLocaleString('en-US')} gold prize money`);
    this.ui.toast(`+${gold.toLocaleString('en-US')} gold prize money`, `A prize crew sails the ${e.name} for port`, 4.2);
    this.audio.coin();
    this.audio.coin(0.25, 0.4);
    this.audio.bell(3, 0.24);
    const part = Object.values(e.livery.parts ?? {})[0];
    if (part) setTimeout(() => this.findPart(part, 'Stripped from your prize', e.pos), 1400);
  }

  /** Fire in her magazine: she goes up beside you, her crew over the side, her hold on the swell. */
  private scuttle(p: Ship, e: Ship) {
    e.afire = 8;
    e.afireBy = p;
    e.damage(e.hp + 1e4, p, this.world, e.pos.clone().setY(e.root.position.y + 1), true, true);
    this.onSunk(e, p);
    this.rig.shake(0.45);
    this.pipeline.flash(0.15);
  }

  // ------------------------------------------------------------------ your fleet

  /** What an escort is built in: a hired ship wears your colours; a prize keeps her paint and flies your flag. */
  private escortLivery(rec: EscortRec): Livery {
    const mine = lookToLivery(this.look);
    if (rec.origin !== 'prize' || !rec.livery) return mine;
    // dressed (cached hull paint, her own flag and canvas): nothing new to compile
    return { ...rec.livery, flag: mine.flag, flag2: mine.flag2, flagDesign: mine.flagDesign, sailMark: mine.sailMark, emblem: 'none', skin: rec.livery.skin || BASE.skin };
  }

  /** Builds an escort from her roster entry (in the harbour or alongside a quay only: never mid-fight). */
  private buildEscort(rec: EscortRec) {
    const s = this.makeShip(rec.cls, 'player', this.escortLivery(rec));
    s.name = rec.name;
    if (rec.origin === 'prize') {
      // her own skin, if she wore one, and plain powder: the vault's finery is the flagship's alone
      s.model.setSkin(skinItem(rec.livery?.skin ?? BASE.skin));
      s.cannonFx.blast = s.cannonFx.trail = 'powder';
    }
    s.hp = Math.max(1, s.maxHp * rec.hp);
    const ai = new EscortAI(s, { ...rec });
    ai.order = this.fleet.state.order;
    ai.hold.onChange = () => this.refreshHold();
    this.escorts.set(s, ai);
    this.refreshHold();
    return s;
  }

  /** The roster, kept up to date from the ships themselves (hull and tally). */
  private syncFleet() {
    const out: { id: string; hp: number; kills: number; cargo?: ReturnType<typeof holdCargo> }[] = [];
    for (const [s, ai] of this.escorts) if (s.alive) out.push({ id: ai.rec.id, hp: s.hp / s.maxHp, kills: ai.rec.kills, cargo: holdCargo(ai.hold) });
    if (out.length) this.fleet.sync(out);
  }

  /** In the harbour, the escorts ride at anchor off the flagship's quarters (rebuilt only when the roster or your colours change). */
  private mooreFleet() {
    const pv = this.preview;
    if (this.state !== 'menu' || !pv) return;
    const recs = this.fleet.ships;
    const key = `${lookToLivery(this.look).id}|${recs.map((r) => r.id).join(',')}`;
    if (key !== this.moorKey || [...this.escorts.keys()].some((s) => s.removed || !s.alive)) {
      this.moorKey = key;
      for (const s of [...this.escorts.keys()]) this.removeShip(s);
      for (const rec of recs) this.buildEscort(rec);
    }
    let i = 0;
    for (const s of this.escorts.keys()) {
      const a = this.anchorage(this.spawnPoint.x, this.spawnPoint.z, Math.PI * 0.82, pv.cls.length, i++, this.escorts.size, s, 1.5);
      s.place(a.x, a.z, a.h);
      s.anchored = true;
      s.sailTarget = 0;
      s.sailLevel = 0;
      s.rudder = 0;
    }
  }

  /** Where escort `i` of `n` anchors off a flagship lying at (x, z) on heading `h`; `wide` spreads the berths. */
  private anchorage(x: number, z: number, h: number, flagLen: number, i: number, n: number, s: Ship, wide = 1) {
    const st = station(i, n, flagLen, s.cls.length);
    const sh = Math.sin(h);
    const ch = Math.cos(h);
    const sx = st.x * wide;
    const sz = st.z * wide;
    return this.deepFor(s, x + ch * sx - sh * sz, z - sh * sx - ch * sz, h);
  }

  /** The nearest water deep enough for her, clear of every other hull, searching out from (x, z). */
  private deepFor(s: Ship, x: number, z: number, h: number) {
    const L = s.cls.length * 0.55;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const ok = (px: number, pz: number) => {
      for (const k of [-1, 0, 1]) if (this.terrain.heightAt(px + fx * L * k, pz + fz * L * k) > -s.cls.draft - 2) return false;
      return !this.ships.some((o) => o !== s && !o.removed && Math.hypot(o.pos.x - px, o.pos.z - pz) < (o.cls.length + s.cls.length) * 0.6);
    };
    if (ok(x, z)) return { x, z, h };
    for (let r = 12; r <= 192; r += 12) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + r * 0.07;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (ok(px, pz)) return { x: px, z: pz, h };
      }
    }
    const w = this.findOpenWater(x, z, 30, 220);
    return { x: w.x, z: w.z, h };
  }

  /** Every escort afloat gets her place in the line, in the order they joined. */
  private assignSlots() {
    const p = this.player;
    if (!p) return;
    const live = [...this.escorts.values()].filter((a) => a.ship.alive).sort((a, b) => a.rec.joined - b.rec.joined);
    live.forEach((a, i) => {
      const st = station(i, live.length, p.cls.length, a.ship.cls.length);
      a.slot.x = st.x;
      a.slot.z = st.z;
    });
  }

  /** Under way from a berth: the escorts weigh and fall in on their stations astern of you. */
  private formFleet() {
    const p = this.player;
    if (!p || !this.escorts.size) return;
    this.assignSlots();
    const sh = Math.sin(p.heading);
    const ch = Math.cos(p.heading);
    for (const [s, ai] of this.escorts) {
      if (!s.alive) continue;
      const a = this.deepFor(s, p.pos.x + ch * ai.slot.x - sh * ai.slot.z, p.pos.z - sh * ai.slot.x - ch * ai.slot.z, p.heading);
      s.place(a.x, a.z, a.h);
      s.anchored = false;
      s.speed = 2.5;
      s.sailTarget = 2 / 3;
      ai.order = this.fleet.state.order;
      ai.mode = 'station';
      ai.target = null;
    }
  }

  /** Alongside a quay: the escorts let go their anchors in the roads off the berth. */
  private moorAtPort(port: TradePort) {
    const p = this.player;
    if (!p) return;
    const c = port.castOff(p.cls.beam);
    let i = 0;
    const n = [...this.escorts.keys()].filter((s) => s.alive).length;
    for (const [s, ai] of this.escorts) {
      if (!s.alive) continue;
      const a = this.anchorage(c.x, c.z, c.heading, p.cls.length, i++, n, s, 1.25);
      s.place(a.x, a.z, a.h);
      s.anchored = true;
      s.sailTarget = 0;
      s.rudder = 0;
      ai.target = null;
      ai.mode = 'station';
    }
  }

  /** Runs a signal up: every escort answers, over her own deck. */
  private giveOrder(o: Order) {
    this.fleet.setOrder(o);
    this.fleetHud.setOrder(o);
    if (!this.escorts.size) return;
    this.audio.fleetSignal(o);
    const acks = ORDER_INFO[o].ack;
    let k = Math.floor(Math.random() * acks.length);
    for (const [s, ai] of this.escorts) {
      ai.order = o;
      if (o === 'follow') ai.target = null;
      if (!s.alive || !this.player) continue;
      const [x, y, ok] = this.screenOf(_a.set(s.pos.x, s.root.position.y + s.cls.masts[0].height * 0.55 + 4, s.pos.z));
      if (ok) this.ui.floater(acks[k++ % acks.length], x, y, 'fleet');
    }
    if (o === 'attack' && !(this.markedFoe && this.markedFoe.alive) && this.state === 'playing' && !this.attackTipShown) {
      this.attackTipShown = true;
      this.ui.toast('Attack my target', 'They go for whatever your guns last laid on, or the nearest enemy', 3.6);
    }
  }

  /** G: the next signal along (follow, attack, hold). */
  private cycleOrder() {
    if (!this.escorts.size) return;
    const i = ORDERS.indexOf(this.fleet.state.order);
    this.giveOrder(ORDERS[(i + 1) % ORDERS.length]);
  }

  /** This frame's foes and escorts, and each escort's captain at work. */
  private updateFleet(dt: number) {
    const foes = this.foes;
    const es = this.escortShips;
    foes.length = es.length = 0;
    // the ship your boarders are fighting on is nobody's target
    const lashed = this.boarding.prize;
    const w = this.world;
    // peaceful seas: who holds her fire against us (her own captain's word, or her owner's for another game's pirate)
    const bit = 1 << this.coop.me;
    for (const s of this.ships) {
      if (s.team === 'pirate') s.calm = w.peaceful && !s.prize && !(s.wrath & bit);
      if (!s.alive || s.removed || s === lashed) continue;
      // and your escorts never fire first either
      if (s.team === 'pirate' && !s.prize) {
        if (!s.calm) foes.push(s);
      } else if (this.escorts.has(s)) es.push(s);
    }
    if (!this.escorts.size || dt <= 0) return;
    if (this.state !== 'playing' && this.state !== 'dead') return;
    const p = this.player;
    const flag = p && p.alive && this.state === 'playing' ? p : null;
    if (this.markedFoe && (!this.markedFoe.alive || this.markedFoe.removed || this.markedFoe.team !== 'pirate')) this.markedFoe = null;
    const marks = this.seaMarks;
    marks.length = 0;
    if (!w.peaceful) for (let i = 0; i < this.gunnery.nMarks; i++) marks.push(this.gunnery.marks[i]);
    else {
      // peaceful seas: only a Kraken that's been woken, and forts already at war with you
      if (!this.kraken.docile) for (let i = 0; i < this.krMarkN; i++) marks.push(this.gunnery.marks[i]);
      if (flag && !this.shore.active) {
        const n = this.forts.marks(this.calmMarks, 0, flag, gunRange(flag.muzzleSpeed), { now: w.time, riledOnly: true });
        for (let i = 0; i < n; i++) marks.push(this.calmMarks[i]);
      }
    }
    for (const [s, ai] of this.escorts) {
      ai.update(dt, w, flag, foes, this.markedFoe, this.ships, marks);
      // a quiet spell lets her carpenters get to work (more slowly than the flagship's)
      if (s.alive && w.time - s.lastHit > 9) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.006 * dt);
    }
  }

  /** An escort went down: off the roster for good. */
  private onEscortLost(s: Ship) {
    const ai = this.escorts.get(s);
    if (!ai) return;
    this.escorts.delete(s);
    this.fleet.remove(ai.rec.id, true);
    this.assignSlots();
    // her hold breaks open: what she carried bobs up where she went down, for whoever sails through it
    const cargo: LootId[] = [];
    for (const { id, n } of ai.hold.list()) for (let i = 0; i < n; i++) cargo.push(id);
    for (let i = 0; i < cargo.length; i += 3) {
      const g = cargo.slice(i, i + 3);
      const a = (i / 3) * 2.4;
      this.loot.float(s.pos.x + Math.sin(a) * (4 + i), s.pos.z + Math.cos(a) * (4 + i), g, Math.max(...g.map((x) => LOOT[x].rarity)) as Item['tier']);
    }
    this.refreshHold();
    const by = s.lastAttacker && s.lastAttacker !== s ? ` · sunk by the ${s.lastAttacker.name}` : '';
    this.note('fleet', `Lost the ${s.name}`, `${s.cls.name}${by}`);
    this.ui.toast(`The ${s.name} is lost!`, `${ai.rec.master || 'Her captain'} and her crew go down fighting`, 4);
    this.audio.bell(1, 0.32);
    this.rig.shake(0.12);
  }

  /** Her crew sign the articles: she flies your flag and sails at your side from now on. */
  private enlist(p: Ship, e: Ship) {
    if (this.fleet.full) return this.takePrize(p, e);
    this.ais.delete(e);
    this.hunters.delete(e);
    e.team = 'player';
    e.prize = false;
    e.hunter = null;
    e.ammo = 'round';
    e.afire = 0;
    e.hp = Math.max(e.hp, e.maxHp * 0.4);
    e.anchored = false;
    e.sailTarget = 1 / 3;
    this.boarding.hoist(e, p);
    const rec: EscortRec = {
      id: `prize-${Date.now().toString(36)}-${e.id}`,
      cls: e.cls.id,
      name: e.name,
      master: prizeMaster(),
      origin: 'prize',
      livery: { ...e.livery },
      hp: e.hp / e.maxHp,
      kills: 0,
      joined: Date.now(),
    };
    this.fleet.add(rec);
    const ai = new EscortAI(e, { ...rec });
    ai.order = this.fleet.state.order;
    ai.hold.onChange = () => this.refreshHold();
    this.escorts.set(e, ai);
    this.refreshHold();
    this.assignSlots();
    this.markedFoe = null;
    p.kills++;
    this.addInfamy(KILL_INFAMY[e.cls.id]);
    this.spawnTimer = Math.max(this.spawnTimer, 10);
    this.note('fleet', `The ${e.name} joined your fleet`, `${e.cls.name} · ${rec.master} at her helm`);
    this.ui.toast(`The ${e.name} joins your fleet!`, `${rec.master} has her helm · ${this.input.isTouch ? 'signal orders from the fleet panel' : 'G signals orders'}`, 4.6);
    this.audio.bell(3, 0.24);
    setTimeout(() => this.audio.fleetSignal('follow'), 600);
    const [x, y, ok] = this.screenOf(_a.set(e.pos.x, e.root.position.y + e.cls.masts[0].height * 0.6 + 4, e.pos.z));
    if (ok) this.ui.floater('Signs on!', x, y, 'fleet');
  }

  /** The harbour master signs a ship and her crew on, paid from your purse. */
  private hire(id: string) {
    const port = this.dockPort;
    const p = this.player;
    if (!port || !p || this.state !== 'docked' || this.fleet.full || this.fleet.get(id)) return;
    const k = this.tradePorts.ports.indexOf(port);
    const o = hireOffers(k + 1).find((x) => x.id === id);
    if (!o || !this.vaultStore.spend(o.price)) return;
    const rec: EscortRec = { id: o.id, cls: o.cls, name: o.name, master: o.master, origin: 'hired', hp: 1, kills: 0, joined: Date.now() };
    if (!this.fleet.add(rec)) return;
    this.buildEscort(rec);
    this.moorAtPort(port);
    this.market.reholds(this.holds());
    this.refreshFleetMarket(rec.id);
    port.cheer(o.cls === 'galleon' ? 2 : 1);
    this.audio.coin();
    this.audio.bell(3, 0.22);
    this.note('fleet', `Hired the ${o.name}`, `${SHIP_CLASSES[o.cls].name} · ${o.master} · ${o.price.toLocaleString('en-US')} gold`);
  }

  /** Pays a ship off: she leaves your service and sails away. */
  private payOff(id: string) {
    const port = this.dockPort;
    if (!port || this.state !== 'docked') return;
    const rec = this.fleet.get(id);
    if (!rec) return;
    // she settles up before she sails: her cargo goes ashore at today's prices
    const ai = [...this.escorts.values()].find((a) => a.rec.id === id);
    const p = this.player;
    if (ai && ai.hold.count && p) {
      const t = this.world.time;
      const goods: LootId[] = [];
      let total = 0;
      for (const { id: g, n } of ai.hold.list()) {
        total += port.market.price(g, t) * n;
        for (let i = 0; i < n; i++) goods.push(g);
      }
      ai.hold.clear();
      p.gold += total;
      this.vaultStore.earn(total);
      port.unload(goods);
      this.audio.sale(total, 0);
      this.note('trade', `The ${rec.name}'s cargo sold as she paid off`, `${goods.length} goods · +${total} gold`);
      this.refreshServices();
    }
    this.fleet.remove(id, false);
    for (const [s, ai] of this.escorts) {
      if (ai.rec.id !== id) continue;
      this.escorts.delete(s);
      s.anchored = false;
      this.boarding.sendAway(s);
    }
    this.refreshHold();
    this.market.reholds(this.holds());
    this.refreshFleetMarket();
    this.audio.bell(1, 0.2);
    this.note('fleet', `Paid off the ${rec.name}`, `${SHIP_CLASSES[rec.cls].name} · ${port.name}`);
  }

  /** The harbour master's counter, refreshed. */
  private refreshFleetMarket(signed?: string) {
    const port = this.dockPort;
    if (!port) return;
    const k = this.tradePorts.ports.indexOf(port);
    const live = new Map<string, Ship>();
    for (const [s, ai] of this.escorts) live.set(ai.rec.id, s);
    this.market.setFleet(
      {
        roster: this.fleet.ships.map((r) => {
          const s = live.get(r.id);
          return { id: r.id, name: r.name, cls: r.cls, master: r.master, prize: r.origin === 'prize', hp: s ? s.hp / s.maxHp : r.hp, kills: s ? (this.escorts.get(s)?.rec.kills ?? r.kills) : r.kills };
        }),
        offers: hireOffers(k + 1).filter((o) => !this.fleet.get(o.id)),
        purse: this.vaultStore.purse,
      },
      signed,
    );
  }

  /** Where the mouse points on the ground ashore (the plane the captain stands on). */
  private groundPick(): { x: number; z: number } | null {
    const pt = this.input.state.pointer;
    const cap = this.shore.captain;
    if (!pt.active || !cap) return null;
    this.ray.setFromCamera(new THREE.Vector2((pt.x / innerWidth) * 2 - 1, -(pt.y / innerHeight) * 2 + 1), this.rig.camera);
    const r = this.ray.ray;
    if (r.direction.y > -0.02) return null;
    const t = (cap.y + 0.9 - r.origin.y) / r.direction.y;
    return { x: r.origin.x + r.direction.x * t, z: r.origin.z + r.direction.z * t };
  }

  /** Ashore: up the screen is north, Space jumps, the cutlass on a click, the pistol on Q / E, F acts. */
  private controlShore() {
    const st = this.input.state;
    const si = this.shoreIn;
    const cap = this.shore.captain;
    si.run = st.run;
    si.strike = st.fireAuto || st.fireAim;
    si.pistol = st.firePort || st.fireStarboard;
    si.jump = st.jump;
    if (this.input.eye && cap) {
      // through their eyes: walk where you look, cut and shoot at whatever's under the sight
      const fe = this.footEye;
      fe.look(st.lookX, st.lookY);
      this.eyeLook.x += st.lookX;
      this.eyeLook.y += st.lookY;
      fe.walk(st.walkX, st.walkY, si);
      si.face = fe.yaw;
      si.aim = si.strike || si.pistol ? fe.ahead(cap, si.pistol ? 12 : 2.4, this.eyeAim) : null;
    } else {
      // screen-up walks the way the camera looks (north ashore; across her deck when boarding)
      const az = this.rig.azimuth;
      const ca = Math.cos(az);
      const sa = Math.sin(az);
      si.mx = st.walkX * ca - st.walkY * sa;
      si.mz = -st.walkX * sa - st.walkY * ca;
      si.face = null;
      si.aim = st.fireAim || (si.pistol && !this.input.isTouch) ? this.groundPick() : null;
    }
    if (this.prizeOpen && st.ammoPick >= 0 && st.ammoPick <= 2) this.choosePrize((['prize', 'scuttle', 'fleet'] as const)[st.ammoPick]);
    else if (st.helm) this.shoreAct();
    if (st.zoom && !this.input.eye) this.rig.zoomBy(st.zoom, performance.now() / 1000);
    if (st.view && !this.shore.deck && !this.shoreLeaving) this.setShoreEye(!this.shoreEyePref);
    if (st.fleet) this.cycleOrder();
    if (st.pause) {
      if (this.mapUi.isOpen) this.setMapView(false);
      else if (this.chartOpen) this.setChart(false);
      else this.setPaused(true);
    } else if (st.map) this.setChart(!this.chartOpen);
    else if (st.treasure) this.setMapView(!this.mapUi.isOpen);
    else if (st.photo) this.openPhoto();
  }

  /** Comes alongside: the ship ties up, the porters wake and the market opens. */
  private dock(port: TradePort) {
    const p = this.player;
    if (!p || !p.alive || this.state !== 'playing' || this.swBusy || this.lastFoe || this.kraken.fighting) return;
    this.wanted.hideMark();
    this.setChart(false);
    this.setView(false);
    this.input.releaseLook();
    this.input.enabled = false;
    this.peek.classList.remove('on');
    this.veil.innerHTML = `<span>Coming alongside at ${port.name}…</span>`;
    void this.fade(() => {
      this.state = 'docked';
      this.dockPort = port;
      this.ui.showHud(false);
      this.market.setDock(null);
      p.anchored = true;
      p.sailTarget = 0;
      p.rudder = 0;
      port.setShip(p);
      port.pin(p);
      p.update(0.016, this.world);
      port.pin(p);
      p.root.updateMatrixWorld(true);
      this.syncFleet();
      this.moorAtPort(port);
      this.market.open(port.name, port.tagline, port.market, this.holds(), p.gold, this.world.time);
      this.refreshServices();
      this.refreshParts();
      // start wide and let the camera settle in on the quay
      this.dockT = 0;
      this.rig.mode = 'port';
      this.frameDock(0);
      this.rig.snapShot();
      this.note('trade', `Docked at ${port.name}`, port.spec.house);
      this.audio.portArrive();
    });
  }

  private frameDock(dt: number) {
    const port = this.dockPort;
    const p = this.player;
    if (!port || !p) return;
    this.dockT += dt;
    const fit = this.fitPanel(this.market.panelRect());
    const settle = 1 + 0.8 * Math.exp(-this.dockT * 0.7);
    const sway = Math.sin(this.dockT * 0.13) * 0.08;
    const shot = port.shot(p, sway, fit * settle);
    this.rig.shotPos.copy(shot.pos);
    this.rig.shotLook.copy(shot.look);
  }

  /** What the chandlery can do for her right now. */
  private serviceCosts() {
    const p = this.player!;
    // the yard mends the escorts' hulls along with hers
    let hp = Math.max(0, Math.ceil(p.maxHp - p.hp));
    for (const s of this.escorts.keys()) if (s.alive) hp += Math.max(0, Math.ceil(s.maxHp - s.hp));
    let shotN = 0;
    for (const id of SPECIALS) shotN += Math.max(0, AMMO[id].max - this.ammoStock[id]);
    return { repair: Math.ceil(hp * 0.5), repairHp: hp, shot: shotN * 9, shotN };
  }

  private refreshServices() {
    this.market.setServices(this.serviceCosts());
    this.market.setGold(this.player?.gold ?? 0);
    this.refreshPyro();
  }

  /** The pyrotechnist's stall: today's rockets, what's in your locker and what the purse stretches to. */
  private refreshPyro() {
    const port = this.dockPort;
    if (!port) return;
    const k = this.tradePorts.ports.indexOf(port);
    const day = Math.floor(Date.now() / 86400000);
    const offers = pyroStock(k + 1, day).map((id) => ({ id, price: FIREWORKS[id].price, owned: this.fwLocker.count(id), room: this.fwLocker.room(id) }));
    this.market.setPyro(offers, this.player?.gold ?? 0);
  }

  private buyFirework(id: FireworkId) {
    const p = this.player;
    const port = this.dockPort;
    if (!p || !port || this.state !== 'docked') return;
    const f = FIREWORKS[id];
    if (f.price > p.gold || this.fwLocker.room(id) <= 0) return;
    p.gold -= f.price;
    this.stockFireworks({ [id]: 1 }, null);
    port.unload(['calico'] as LootId[], true);
    port.cheer(f.tier === 2 ? 2 : 0.5);
    this.audio.purchase('shot');
    this.refreshServices();
    if (f.tier === 2) this.note('trade', `Bought a showpiece: ${f.name}`, `${port.name} · ${f.price.toLocaleString('en-US')} gold`);
  }

  /** Sells one lot (or the whole fleet's cargo) at today's prices: the escorts' holds go ashore with yours. */
  private sell(id: LootId | null) {
    const port = this.dockPort;
    const tr = this.trader;
    const p = this.player;
    if ((!port && !tr) || !p || this.state !== 'docked') return;
    const market = port ? port.market : tr!.market;
    const t = this.world.time;
    const goods: LootId[] = [];
    let total = 0;
    let best = 0;
    let fromEscorts = 0;
    for (const h of this.holds()) {
      const lots = id ? [{ id, n: h.hold.has(id) }] : h.hold.list();
      for (const lot of lots) {
        if (!lot.n) continue;
        total += market.price(lot.id, t) * lot.n;
        best = Math.max(best, LOOT[lot.id].rarity);
        h.hold.take(lot.id, lot.n, false);
        for (let i = 0; i < lot.n; i++) goods.push(lot.id);
        if (h.escort) fromEscorts += lot.n;
      }
    }
    if (!total) return;
    this.refreshHold();
    this.syncFleet();
    p.gold += total;
    this.vaultStore.earn(total);
    if (id) this.market.sold(id, total);
    else this.market.soldAll(total);
    this.refreshServices();
    this.refreshParts();
    // the porters carry it ashore, finest first, and the quay cheers a good sale
    if (port) {
      port.unload(goods);
      port.cheer(total >= 1500 || best >= 4 ? 2 : total >= 250 || best >= 2 ? 1 : 0.5);
    }
    this.audio.sale(total, best);
    const fleetLine = fromEscorts ? ` · ${fromEscorts} from your escorts` : '';
    this.note('trade', id ? `Sold ${goods.length > 1 ? `${goods.length} × ` : ''}${LOOT[id].name}` : fromEscorts ? `Sold the fleet's cargo (${goods.length} goods)` : `Sold the hold (${goods.length} goods)`, `${port ? port.name : `The ${tr!.ship.name}`} · +${total} gold${fleetLine}`);
    if (tr) this.market.setWares(this.wareOffers(tr), p.gold);
  }

  private buyRepair() {
    const p = this.player;
    const port = this.dockPort;
    if (!p || !port) return;
    const c = this.serviceCosts();
    if (!c.repair || c.repair > p.gold) return;
    p.gold -= c.repair;
    p.hp = p.maxHp;
    for (const s of this.escorts.keys()) if (s.alive) s.hp = s.maxHp;
    this.syncFleet();
    this.refreshFleetMarket();
    port.unload(['calico', 'calico', 'cheese'].slice(0, 1 + Math.min(2, Math.floor(c.repairHp / 80))) as LootId[], true);
    this.audio.purchase('repair');
    this.refreshServices();
  }

  private buyShot() {
    const p = this.player;
    const port = this.dockPort;
    if (!p || !port) return;
    const c = this.serviceCosts();
    if (!c.shot || c.shot > p.gold) return;
    p.gold -= c.shot;
    const add: Partial<AmmoStock> = {};
    for (const id of SPECIALS) add[id] = AMMO[id].max - this.ammoStock[id];
    this.stockAmmo(add, null);
    port.unload(['rum', 'rum'] as LootId[], true);
    this.audio.purchase('shot');
    this.refreshServices();
  }

  /** Casts off: back out to sea, clear of the quay, sails set. */
  private castOff() {
    const p = this.player;
    const port = this.dockPort;
    if (!p || (!port && !this.trader) || this.state !== 'docked' || this.swBusy) return;
    this.veil.innerHTML = '<span>Casting off…</span>';
    if (port) this.audio.portDepart();
    else this.audio.bosunPipe();
    void this.fade(() => this.undock(true));
  }

  /** Lets go of the quay; `sail` puts her back at sea under way. */
  private undock(sail: boolean) {
    const p = this.player;
    const port = this.dockPort;
    this.market.close();
    if (this.trader) return this.leaveTrader(sail);
    this.audio.harbour(false);
    this.dockPort = null;
    port?.setShip(null);
    this.rig.camera.clearViewOffset();
    this.rig.viewShift.x = this.rig.viewShift.y = 0;
    if (!p || !port || !sail) return;
    const c = port.castOff(p.cls.beam);
    p.pos.set(c.x, 0, c.z);
    p.heading = c.heading;
    p.anchored = false;
    p.speed = 3;
    p.sailTarget = 2 / 3;
    this.state = 'playing';
    this.input.enabled = true;
    this.ui.showHud(true);
    this.rig.mode = 'follow';
    this.rig.snapTo(p.pos);
    this.formFleet();
    this.last = performance.now();
  }

  private resize() {
    const w = innerWidth;
    const h = innerHeight;
    // full-scale pixel ratio: the device's, capped, and kept inside the pixel budget
    const base = Math.min(devicePixelRatio || 1, this.quality.maxDpr, Math.sqrt(this.quality.maxPixels / Math.max(1, w * h)));
    this.baseDpr = Math.max(base, Math.min(devicePixelRatio || 1, 0.75));
    this.dpr = this.captureDpr || this.baseDpr * this.scaler.scale;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.pipeline.setSize(w * this.dpr, h * this.dpr);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
    // tighter framing on portrait phones
    this.rig.zoom = clamp(this.rig.zoom, 0, 1);
    this.frameMenu();
  }

  private frameMenu() {
    this.rig.menuShift = this.state === 'menu' || this.state === 'loading' ? this.ui.menuFraming() : { x: 0, y: 0, w: 1, h: 1 };
  }

  // ------------------------------------------------------------------ ships

  /** A pirate's colours, and now and then a prize fitting she took off somebody else. */
  private pirateLivery(id: ShipClassId = 'sloop') {
    const liv = PIRATE_LIVERIES[Math.floor(Math.random() * PIRATE_LIVERIES.length)];
    const parts = pirateFit(id);
    return Object.keys(parts).length ? { ...liv, parts } : liv;
  }

  /** Your colours, with this ship's refit. */
  private playerLivery(id: ShipClassId) {
    return { ...lookToLivery(this.look), parts: this.partStore.loadout(id) };
  }

  private makeShip(id: ShipClassId, team: 'player' | 'pirate', livery = team === 'player' ? this.playerLivery(id) : this.pirateLivery(id), model?: ShipModel): Ship {
    // her refit is built into the model and into her figures
    const s = new Ship(refit(SHIP_CLASSES[id], livery.parts), livery, team, this.quality.physicalHull ? 1 : 0, model);
    if (team === 'player') {
      s.name = this.look.name.trim() || s.cls.title;
      this.applyCosmetics(s);
    }
    else {
      s.name = s.ghost ? GHOST_NAMES[this.ghostIdx++ % GHOST_NAMES.length] : PIRATE_NAMES[this.nameIdx++ % PIRATE_NAMES.length];
      s.gold = 0;
    }
    if (s.ghost) Game.ghostify(s);
    this.ships.push(s);
    this.opaque.add(s.root);
    this.water.add(s.bowWave.mesh);
    return s;
  }

  // ------------------------------------------------------------------ peaceful seas

  /** Peaceful seas as they stand (the host's rule in a shared sea), put to everything that might fire first. */
  private applyPeace() {
    const w = this.world;
    if (!w) return;
    const guest = this.coop.guest;
    const on = guest ? this.roomPeace ?? false : this.ui.settings.peaceful;
    this.ui.setSeaRule(guest ? on : null);
    if (w.peaceful === on) return;
    w.peaceful = on;
    this.kraken.calm = on;
    // the crew hears the host's new rule at once
    if (this.coop.hosting) this.coop.skyNow();
    this.crewUi?.render();
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'docked')
      this.ui.toast(on ? 'Peaceful seas' : 'Adventure', on ? (guest ? 'Your host calls a truce: nobody fires unless you fire first' : 'Nobody fires on you unless you fire first') : guest ? 'Your host lets the Brethren loose: they hunt on sight' : 'The Brethren hunt on sight again', 3.4);
  }

  /**
   * Someone of another team laid a blow on `s` (Ship.onStruck). When it's our
   * side striking a pirate, that's a quarrel: with her, her flotilla and the
   * company she keeps. Another game's pirate is her owner's to rouse; we only
   * say so.
   */
  private quarrel(s: Ship, by: Ship) {
    // a merchantman struck (shot or rammed): her whole convoy runs
    if (s.team === 'merchant') return this.convoys.offend(s, by);
    if (by.team !== 'player' || s.team !== 'pirate' || s.prize) return;
    const now = this.world.time;
    const side = sideOf(by);
    const ai = this.ais.get(s);
    if (!ai) {
      if (s.remote && s.calm && side === this.coop.me) this.provoked(s, 0, null);
      return;
    }
    const fresh = !ai.grudge.holds(side, now);
    ai.grudge.mark(side, now);
    s.wrath = ai.grudge.mask(now);
    if (!fresh) return;
    const { n, fort } = this.rally(s, ai, side, now);
    if (side === this.coop.me) this.provoked(s, n, fort);
  }

  /** Her flotilla, the Brethren in hail (a hunter from further off) and any fort covering her take up her quarrel with captain `side`. The dead keep to their own. */
  private rally(s: Ship, ai: PirateAI, side: number, now: number): { n: number; fort: Fort | null } {
    let n = 0;
    for (const [o, oa] of this.ais) {
      if (oa === ai || !o.alive || o.removed || o.prize || o.ghost !== s.ghost || oa.grudge.holds(side, now)) continue;
      const d = Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z);
      if (!((!!ai.pack && oa.pack === ai.pack) || d < RALLY || (!!oa.hunter && d < HUNTER_RALLY))) continue;
      oa.grudge.mark(side, now);
      o.wrath = oa.grudge.mask(now);
      n++;
    }
    let fort: Fort | null = null;
    if (!s.ghost) {
      for (const f of this.forts.forts) {
        if (f.owner !== 'brethren' || f.grudge.holds(side, now) || f.guns.every((g) => g.dead)) continue;
        if (Math.hypot(f.site.x - s.pos.x, f.site.z - s.pos.z) > FORT_RALLY) continue;
        this.forts.rile(f, side, now);
        fort = f;
      }
    }
    return { n, fort };
  }

  /** A fort has cause to fight captain `side`: the Brethren lying under its guns come about with it. */
  private fortRiled(f: Fort, side: number, by: Ship | null) {
    const now = this.world.time;
    let n = 0;
    for (const [o, oa] of this.ais) {
      if (!o.alive || o.removed || o.prize || o.ghost || oa.grudge.holds(side, now)) continue;
      if (Math.hypot(o.pos.x - f.site.x, o.pos.z - f.site.z) > FORT_RALLY) continue;
      oa.grudge.mark(side, now);
      o.wrath = oa.grudge.mask(now);
      n++;
    }
    // a ball of ours on its walls: say so (a ship's quarrel or a garrison's says its own)
    if (!by || side !== this.coop.me || !this.world.peaceful || this.state !== 'playing') return;
    this.ui.toast('You fired first', `${f.name} runs out its guns${n ? `, and ${n} ${n === 1 ? 'ship' : 'ships'} under them come about` : ''}`, 3.4);
    this.audio.wanted(2);
  }

  /** Peaceful seas: you fired first. Say so over her, and who comes with her. */
  private provoked(s: Ship, n: number, fort: Fort | null) {
    if (!this.world.peaceful || this.state !== 'playing') return;
    const t = this.world.time;
    if (t - (this.provokedAt.get(s) ?? -100) < 10) return;
    this.provokedAt.set(s, t);
    const [x, y, ok] = this.screenOf(_a.set(s.pos.x, s.root.position.y + s.cls.freeboard + 6, s.pos.z));
    if (ok) this.ui.floater('Provoked!', x, y - 30, 'bad');
    // one call for a broadside that rouses a whole flotilla
    if (t - this.provokeToastT < 5) return;
    this.provokeToastT = t;
    const named = s.hunter ? CAPTAIN.get(s.hunter) : undefined;
    const more = n ? ` and ${n} ${n === 1 ? 'ship' : 'ships'} in hail` : '';
    const guns = fort ? `${n ? ',' : ''} with the guns of ${fort.name}` : '';
    const line = named
      ? `${named.epithet} has the excuse she was waiting for${guns}`
      : s.ghost
      ? `The ${s.name} turns her dead eyes on you${n ? `, and ${n} more of the dead with her` : ''}`
      : n || fort
      ? `The ${s.name}${more} come about to fight${guns}`
      : `The ${s.name} runs out her guns`;
    this.ui.toast('You fired first', line, 3.6);
    if (named) this.audio.horn();
    else this.audio.wanted(1);
  }

  /** The HUD's dove (or blades, and how long until tempers cool), and word when the last quarrel is forgotten. */
  private updatePeace(p: Ship) {
    const w = this.world;
    if (!w.peaceful) {
      this.peaceHud.set(false, 0, 0);
      this.warN = 0;
      return;
    }
    const now = w.time;
    const me = this.coop.me;
    let war = 0;
    let left = 0;
    for (const s of this.ships) {
      if (s.team !== 'pirate' || !s.alive || s.removed || s.prize || s.calm) continue;
      war++;
      const ai = this.ais.get(s);
      left = Math.max(left, ai ? ai.grudge.left(me, now) : FORGET);
    }
    for (const f of this.forts.forts) {
      if (f.owner !== 'brethren' || !f.grudge.holds(me, now) || f.guns.every((g) => g.dead)) continue;
      war++;
      left = Math.max(left, f.grudge.left(me, now));
    }
    if (this.kraken.fighting && this.kraken.calm && this.kraken.provoked) {
      war++;
      left = FORGET;
    }
    this.peaceHud.set(true, war, left / FORGET);
    if (this.warN && !war && p.alive && !this.shore.active) {
      this.ui.toast('Tempers cool', 'The sea is at peace with you again', 3);
      this.audio.chime();
    }
    this.warN = war;
  }

  // ------------------------------------------------------------------ sailing together

  /** What the crew layer may see and do (see net/coop.ts). */
  private coopBridge(): CoopGame {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this;
    return {
      get world() {
        return g.world;
      },
      get quality() {
        return g.quality.physicalHull ? 1 : 0;
      },
      shares: (out) => {
        const atSea = g.state === 'playing' || g.state === 'paused' || g.state === 'docked' || g.state === 'dead';
        const p = g.player;
        if (atSea && p && !p.remote) out.set(p, 'flag');
        if (atSea) for (const s of g.escorts.keys()) if (!s.removed) out.set(s, 'escort');
        if (!g.coop.guest) for (const s of g.ais.keys()) if (!s.remote && !s.removed) out.set(s, 'ai');
      },
      recipe: (s, role) => g.recipe(s, role),
      targetOf: (s) => g.ais.get(s)?.target ?? null,
      prepare: (m) => {
        g.preload.add(m.root);
        g.texQueue.push(...texturesOf(m.root));
      },
      uploading: (m) => g.preload.holds(m.root),
      scrap: (m) => g.scrapHull(m),
      fromYard: (r) => {
        if (r.team !== 'pirate' || r.hunter || r.livery.skin) return null;
        if (r.livery.ghost) {
          const m = g.ghostyard;
          if (!m || m.cls.id !== r.cls) return null;
          g.ghostyard = null;
          return m;
        }
        const parts = JSON.stringify(r.livery.parts ?? {});
        const i = g.shipyard.findIndex((m) => m.cls.id === r.cls && m.livery.id === r.livery.id && JSON.stringify(m.livery.parts ?? {}) === parts);
        return i >= 0 ? g.shipyard.splice(i, 1)[0] : null;
      },
      launch: (r, m) => g.launchPuppet(r, m),
      remove: (s) => {
        s.removed = true;
        g.removeShip(s);
      },
      adopt: (s) => {
        // the host has gone: her pirates are ours to fight now
        const ai = new PirateAI(s, (g.player?.kills ?? 0) / 4);
        // whoever she was at war with, the quarrel is ours now
        if (s.wrath) ai.grudge.mark(g.coop.me, g.world.time);
        g.ais.set(s, ai);
      },
      struck: (s, by, dmg) => g.onHit(s, by as Ship, dmg, s.pos),
      sunk: (s, by) => g.onRemoteSunk(s, by),
      sky: () => ({ day: g.atmos.day, kind: g.atmos.kind, windTo: g.atmos.windTo, run: g.atmos.timeMode === 'auto', calm: g.world.peaceful }),
      follow: (sky) => {
        if (sky) g.atmos.follow(sky.day, sky.kind, sky.windTo, sky.run);
        else g.atmos.unfollow();
        // the host's word on peaceful seas holds for everyone aboard
        g.roomPeace = sky ? !!sky.calm : null;
        g.applyPeace();
      },
      toast: (title, line, secs = 3) => g.ui.toast(title, line, secs),
      clearSea: () => {
        for (const s of [...g.ais.keys()]) {
          s.removed = true;
          g.removeShip(s);
        }
        g.hunters.clear();
      },
      changed: () => g.crewUi?.render(),
    };
  }

  /** The captain's name the others see over your flagship. */
  private captainName() {
    return this.coop.session?.name || 'Captain';
  }

  /** One of our ships, for another game to build and launch. */
  private recipe(s: Ship, role: Role): Recipe {
    const flag = role === 'flag';
    return {
      cls: s.cls.id,
      livery: s.livery,
      team: s.team,
      name: s.name,
      role,
      captain: flag ? this.captainName() : null,
      hunter: s.hunter,
      boost: s.hunter ? { ...s.boost } : null,
      skin: flag ? this.vaultStore.equipped.skin : (s.livery.skin ?? null),
      blast: s.cannonFx.blast,
      trail: s.cannonFx.trail,
      ammo: s.ammo,
      x: s.pos.x,
      z: s.pos.z,
      h: s.heading,
      hp: s.hp,
      sail: s.sailLevel,
    };
  }

  /** Another game's ship on our water: built from her recipe, steered by her owner. */
  private launchPuppet(r: Recipe, model: ShipModel): Ship {
    const s = new Ship(refit(SHIP_CLASSES[r.cls], r.livery.parts), r.livery, r.team, this.quality.physicalHull ? 1 : 0, model);
    s.name = r.name;
    s.captain = r.captain;
    s.gold = 0;
    if (r.hunter) {
      s.hunter = r.hunter;
      if (r.boost) s.setBoost(r.boost);
    }
    s.cannonFx.blast = r.blast;
    s.cannonFx.trail = r.trail;
    s.ammo = r.ammo;
    s.sailTarget = s.sailLevel = r.sail;
    if (s.ghost) Game.ghostify(s);
    this.ships.push(s);
    this.opaque.add(s.root);
    this.water.add(s.bowWave.mesh);
    // a phantom takes shape out of the mist here too
    if (s.ghost && s.alive) {
      s.place(r.x, r.z, r.h);
      this.raiseGhost(s);
    }
    if (r.captain && this.state !== 'loading') this.ui.toast(`${r.captain} sails in`, `The ${r.name} joins your sea`, 3);
    return s;
  }

  /** A phantom casts no shadow, and her guns spit wraith-fire. */
  private static ghostify(s: Ship) {
    s.root.traverse((o) => {
      o.castShadow = false;
    });
    s.cannonFx.blast = 'wraith';
    s.cannonFx.trail = 'wraith';
    s.ammo = 'wraith';
  }

  private removeShip(s: Ship) {
    this.coop.forget(s);
    this.preload.drop(s.root);
    this.opaque.remove(s.root);
    this.water.remove(s.bowWave.mesh);
    this.ships.splice(this.ships.indexOf(s), 1);
    this.ais.delete(s);
    this.hunters.delete(s);
    this.escorts.delete(s);
    if (this.markedFoe === s) this.markedFoe = null;
    s.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    s.model.dispose();
    s.dispose();
  }

  private setPreview(id: ShipClassId) {
    const old = this.preview;
    const s = this.makeShip(id, 'player');
    s.place(this.spawnPoint.x, this.spawnPoint.z, Math.PI * 0.82);
    s.anchored = true;
    s.sailTarget = 1;
    s.sailLevel = old ? old.sailLevel : 1;
    if (old) this.removeShip(old);
    this.preview = s;
    this.rig.orbitCenter.set(s.pos.x, 0, s.pos.z);
    // the real bounds of hull + rig (bowsprit to transom, keel to the tallest truck), in the ship's own frame
    const pos = s.root.position.clone();
    const rot = s.root.quaternion.clone();
    s.root.position.set(0, 0, 0);
    s.root.quaternion.identity();
    s.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s.root);
    box.min.y = Math.max(box.min.y, -1.5);
    s.root.position.copy(pos);
    s.root.quaternion.copy(rot);
    s.root.updateMatrixWorld(true);
    this.rig.orbitBox = box;
    this.rig.orbitQuat = rot;
    this.mooreFleet();
    // the forts you hold fly her colours
    this.forts.setColours(s);
  }

  private findOpenWater(cx: number, cz: number, rMin: number, rMax: number): THREE.Vector3 {
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      // kept within the archipelago it's sought from (out on the high seas, anywhere)
      const [x, z] = clampToRegion(cx + Math.cos(a) * r, cz + Math.sin(a) * r, cx, cz, 900);
      if (this.terrain.heightAt(x, z) > -9) continue;
      if (this.ships.some((s) => Math.hypot(s.pos.x - x, s.pos.z - z) < 80)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(cx + rMax, 0, cz);
  }

  private spawnPirate(near: THREE.Vector3, rMin: number, rMax: number, forceId?: ShipClassId) {
    const kills = this.player?.kills ?? 0;
    const roll = Math.random();
    let id: ShipClassId = forceId ?? (roll < 0.48 ? 'sloop' : roll < 0.82 ? 'brig' : 'galleon');
    if (!forceId && kills < 2 && id === 'galleon') id = 'brig';
    const p = this.findOpenWater(near.x, near.z, rMin, rMax);
    if (!forceId && this.ghostyard && this.ghostOmen()) {
      const ai = this.launchPirate(this.ghostyard.cls.id, p.x, p.z, Math.random() * Math.PI * 2, true);
      this.raiseGhost(ai.ship);
      return ai;
    }
    return this.launchPirate(id, p.x, p.z, Math.random() * Math.PI * 2);
  }

  /**
   * Whether the next sail on the horizon is a ghost: rare by day, far likelier
   * in the dark, in mist and in foul weather, and only ever one at a time.
   */
  private ghostOmen() {
    if (this.ships.some((s) => s.ghost && s.alive)) return false;
    if (ALL_GHOSTS) return true;
    const g = globalUniforms;
    const chance = Math.min(0.42, 0.05 + g.uNight.value * 0.24 + g.uMist.value * 0.2 + g.uStorm.value * 0.06);
    return Math.random() < chance;
  }

  /** A fallen pirate gives up the ghost (only where someone might see it). */
  private raiseSoul(f: SpiritFrom) {
    const t = this.rig.target;
    if (Math.hypot(f.x - t.x, f.z - t.z) > Math.max(320, this.rig.distance * 2.2)) return;
    this.spirits.release(f, this.world.time);
  }

  /** A ghost takes shape out of the sea mist, and if she is near enough, you hear her. */
  private raiseGhost(s: Ship) {
    s.presence = 0;
    const w = this.world;
    w.particles.ghostRise(new THREE.Vector3(s.pos.x, w.waterHeight(s.pos.x, s.pos.z), s.pos.z), s.cls.length);
    const p = this.player;
    if (!p || this.state !== 'playing') return;
    const d = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z);
    const [, pan] = w.soundAt(s.pos);
    this.audio.ghostWail(0.42 * Math.max(0.35, 1 - d / 900), pan);
    const night = globalUniforms.uNight.value > 0.5;
    const mist = globalUniforms.uMist.value > 0.35;
    this.ui.toast('A ghost ship', `The ${s.name} drifts out of the ${mist ? 'mist' : night ? 'dark' : 'haze'}`, 4.2);
    this.note('ghost', `Sighted the ${s.name}`, 'A ghost ship');
  }

  /** How many ready hulls of each class the shipyard keeps on the slipway. */
  private static readonly STOCK: Record<ShipClassId, number> = { sloop: 3, brig: 3, galleon: 1 };

  private runShipyard() {
    // the yard's slices are a few milliseconds each: not in the seconds a ship is going down
    // (her spars coming apart, a hunter sailing in), when they'd all land on the same frames
    if (this.world.time < this.yardIdleUntil) return;
    this.preload.step();
    const tex = this.texQueue.shift();
    if (tex) this.renderer.initTexture(tex);
    if (!this.keel) {
      // the next named captain's ship comes first: she may be sent for at any moment
      const next = this.heat.next;
      if (next && !this.hunterHull && this.state === 'playing') {
        this.keelFor = next;
        this.keel = new ShipModel(SHIP_CLASSES[next.cls], hunterLivery(next), this.quality.physicalHull ? 1 : 0, true);
        this.keel.setSkin(skinItem(next.skin));
        this.texQueue.push(...this.keel.ownTextures());
      } else {
        const ids = Object.keys(Game.STOCK) as ShipClassId[];
        const id = ids.find((k) => this.shipyard.filter((m) => m.cls.id === k).length < Game.STOCK[k]);
        const q = this.quality.physicalHull ? 1 : 0;
        // the merchant houses' hulls once the pirates are stocked (first, out on the high seas where no pirate sails)
        const trade = this.convoys.wanted();
        if (trade && (this.onHighSeas || (!id && this.ghostyard))) this.keel = new ShipModel(trade.cls, trade.livery, q, true);
        else if (id) this.keel = new ShipModel(SHIP_CLASSES[id], this.pirateLivery(id), q, true);
        else if (!this.ghostyard) {
          // once the pirates are stocked, one phantom waits in the yard's shadow
          const r = Math.random();
          const gid: ShipClassId = r < 0.4 ? 'sloop' : r < 0.85 ? 'brig' : 'galleon';
          this.keel = new ShipModel(SHIP_CLASSES[gid], GHOST_LIVERY, q, true);
        } else return;
      }
    }
    // a little each frame: every slice is small, and a frame stops starting new ones after 1.5 ms
    const t0 = performance.now();
    while (performance.now() - t0 < 1.5) {
      if (this.keel.step()) {
        const k = this.keel;
        this.keel = null;
        const For = this.keelFor;
        this.keelFor = null;
        if (For && For !== this.heat.next) this.scrapHull(k);
        else if (For) {
          this.hunterHull = k;
          this.preload.add(k.root);
        } else {
          if (k.livery.ghost) this.ghostyard = k;
          else if (merchantKindOf(k.cls)) this.convoys.launch(k);
          else this.shipyard.push(k);
          this.preload.add(k.root);
        }
        return;
      }
    }
  }

  /** A hull built for a captain who is no longer coming (a new voyage started). */
  private scrapHull(m: ShipModel) {
    this.preload.drop(m.root);
    m.root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g) g.dispose();
    });
    m.dispose();
  }

  private launchPirate(id: ShipClassId, x: number, z: number, heading: number, ghost = false) {
    const kills = this.player?.kills ?? 0;
    const i = ghost ? -1 : this.shipyard.findIndex((m) => m.cls.id === id);
    let model = i >= 0 ? this.shipyard.splice(i, 1)[0] : undefined;
    if (ghost && this.ghostyard) {
      model = this.ghostyard;
      this.ghostyard = null;
    }
    const s = this.makeShip(id, 'pirate', model?.livery, model);
    s.place(x, z, heading);
    s.sailTarget = 0.5;
    s.sailLevel = 0.5;
    s.speed = s.cls.maxSpeed * 0.4;
    const ai = new PirateAI(s, kills / 4);
    this.ais.set(s, ai);
    return ai;
  }

  /**
   * A lasting wreck is still a whole ship to draw, shadow and simulate, and a
   * long fight used to leave a graveyard of them lingering for minutes until
   * the game ground to a stutter. Only the freshest few stay afloat near you;
   * older or distant ones slip under now, just as a wreck that had lingered would.
   */
  private retireWrecks() {
    const w = this.wrecks;
    w.length = 0;
    for (const s of this.ships) if (!s.alive && s !== this.player && s.sinkT < s.wreckLife) w.push(s);
    if (!w.length) return;
    const focus = this.player?.pos ?? this.spawnPoint;
    w.sort((a, b) => a.sinkT - b.sinkT);
    for (let i = 0; i < w.length; i++) {
      const s = w[i];
      const far = Math.hypot(s.pos.x - focus.x, s.pos.z - focus.z) > WRECK_REACH;
      // never before she has settled, so the pose carries on without a jump
      if (i >= MAX_WRECKS || far) s.wreckLife = Math.max(s.sinkT, 9);
    }
  }

  /**
   * The HUD broom: every sunken or sinking enemy hull, all drifting wreckage and
   * the smoke over them are gone at once. Your ship, live foes, a prize your
   * boarders hold and the floating loot (your plunder) are left alone.
   */
  sweepWrecks() {
    if (this.state !== 'playing') return;
    const lashed = this.boarding.prize;
    let n = 0;
    for (const s of this.ships.slice()) {
      if (s.alive || s === this.player || s === lashed || s.prize) continue;
      s.removed = true;
      this.removeShip(s);
      n++;
    }
    this.wrecks.length = 0;
    this.debris.clear();
    this.particles.clear();
    this.audio.click();
    this.ui.toast('Clear seas', n ? `${n} wreck${n > 1 ? 's' : ''} swept away` : 'Wreckage swept away', 2.2);
  }

  /** A flotilla: a flagship with two or three escorts in a loose vee. */
  private spawnFlotilla(near: THREE.Vector3, rMin: number, rMax: number, size: number) {
    const kills = this.player?.kills ?? 0;
    const flagId: ShipClassId = kills >= 4 && Math.random() < 0.6 ? 'galleon' : 'brig';
    const flag = this.spawnPirate(near, rMin, rMax, flagId);
    const pack = new Pack();
    pack.leader = flag;
    flag.pack = pack;
    const fs = flag.ship;
    const h = fs.heading;
    const sh = Math.sin(h);
    const ch = Math.cos(h);
    for (let i = 0; i < size - 1; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const rank = 1 + Math.floor(i / 2);
      const slot = { x: side * 34 * rank, z: 30 * rank };
      let x = fs.pos.x + ch * slot.x - sh * slot.z;
      let z = fs.pos.z - sh * slot.x - ch * slot.z;
      if (this.terrain.heightAt(x, z) > -9) {
        const o = this.findOpenWater(fs.pos.x, fs.pos.z, 50, 110);
        x = o.x;
        z = o.z;
      }
      const ai = this.launchPirate(Math.random() < 0.65 ? 'sloop' : 'brig', x, z, h);
      ai.pack = pack;
      ai.slot = slot;
    }
  }

  private enterMenu() {
    this.state = 'menu';
    this.leaveHighSeas(true);
    this.adoptCloud();
    this.cloudSave.flush();
    this.player = null;
    this.input.enabled = false;
    this.ui.showHud(false);
    this.ui.showMenu(true);
    this.audio.setMusic(true, true);
    this.rig.mode = 'orbit';
    this.setPreview(this.ui.selected);
    this.rig.snapTo(this.spawnPoint);
    this.frameMenu();
    // a couple of pirates on the horizon for life
    if (!this.coop.guest && !this.ships.some((s) => s.team === 'pirate')) {
      this.spawnPirate(this.spawnPoint, 180, 300);
      this.spawnFlotilla(this.spawnPoint, 300, 420, 2);
    }
  }

  /** Set Sail: choose the archipelago to weigh anchor in (a guest just joins the host, wherever she is). */
  private chooseSea() {
    if (!this.preview || this.swBusy || this.state !== 'menu') return;
    if (this.coop.guest) return this.startVoyage();
    this.ui.showMenu(false);
    this.seaPick.open(
      this.seaCards(),
      (x, z) => this.terrain.heightAt(x, z),
      (id) => this.sailFrom(id),
      () => this.ui.showMenu(true),
    );
  }

  /** Weighs anchor in the chosen archipelago: at home straight away, or across the sea under the veil. */
  private sailFrom(id: RegionId) {
    if (this.state !== 'menu' || !this.preview) return;
    if (id === 'home') return this.startVoyage();
    this.veil.innerHTML = `<span>Setting a course for ${regionById(id).name}…</span>`;
    void this.fade(() => this.startVoyage(id));
  }

  /** What the picker shows of each archipelago: its isles, where you'd weigh anchor and what lies there. */
  private seaCards(): SeaCard[] {
    const vibe: Record<RegionId, string> = {
      home: 'Sunlit lagoons, white beaches and your home port. The easy way in.',
      brumas: 'Limestone towers and jade jungle in a drifting mist, a long voyage from home.',
    };
    return REGIONS.map((r) => {
      const inR = (x: number, z: number) => nearestRegion(x, z).region === r;
      const markets = this.tradePorts.ports.filter((tp) => inR(tp.site.x, tp.site.z)).length;
      const forts = this.forts.forts.filter((f) => inR(f.site.x, f.site.z)).length;
      const chips = [`${markets} market${markets === 1 ? '' : 's'}`, `${forts} fort${forts === 1 ? '' : 's'}`];
      if (r.id === 'home') chips.unshift('Home harbour');
      else chips.push(this.charts.has(r.id) ? 'Charted' : '+600 gold landfall');
      const berth = r.id === 'home' ? this.spawnPoint : this.berthIn(r);
      return {
        id: r.id,
        name: r.name,
        motto: r.motto,
        vibe: vibe[r.id],
        chips,
        isles: this.terrain.islands.filter((i) => inR(i.x, i.z)).map((i) => ({ x: i.x, z: i.z, r: i.r })),
        berth: { x: berth.x, z: berth.z },
        style: r.id === 'home' ? 'home' : 'brumas',
      };
    });
  }

  /** Where a voyage begins in an archipelago away from home: off its first market's quay, bows to the sea. */
  private berthIn(region: Region) {
    const tp = this.tradePorts.ports.find((t) => nearestRegion(t.site.x, t.site.z).region === region);
    if (tp) {
      const { x, z, nx, nz } = tp.site;
      return { x: x + nx * 75, z: z + nz * 75, h: Math.atan2(nx, nz) };
    }
    const at = this.findOpenWater(region.x, region.z, 300, 600);
    return { x: at.x, z: at.z, h: Math.atan2(at.x - region.x, at.z - region.z) };
  }

  /** Moves the anchored flagship and her escorts to `region`'s berth, the menu camera with them. */
  private moorIn(region: Region) {
    const p = this.preview!;
    const b = this.berthIn(region);
    const at = this.deepFor(p, b.x, b.z, b.h);
    p.place(at.x, at.z, b.h);
    this.rig.orbitCenter.set(p.pos.x, 0, p.pos.z);
    this.rig.orbitQuat = p.root.quaternion.clone();
    let i = 0;
    for (const s of this.escorts.keys()) {
      const a = this.anchorage(at.x, at.z, b.h, p.cls.length, i++, this.escorts.size, s, 1.5);
      s.place(a.x, a.z, a.h);
    }
    this.rig.snapTo(p.pos);
  }

  private startVoyage(from: RegionId = 'home') {
    if (!this.preview) return;
    const away = from !== 'home' && !this.coop.guest ? regionById(from) : null;
    if (away) this.moorIn(away);
    this.audio.start();
    this.audio.setMusic(false);
    const p = this.preview;
    this.preview = null;
    p.anchored = false;
    p.sailTarget = 2 / 3;
    this.player = p;
    this.state = 'playing';
    this.voyageTime = 0;
    this.rare.reset();
    this.log = { shots: 0, hits: 0, dealt: 0, chests: 0, best: -1, metres: 0, events: [] };
    this.discovered.clear();
    this.hzSeen.clear();
    this.hzState = 'none';
    this.hzHit = null;
    this.hzHud.set(null);
    if (HAZARD_TEST) this.testHazard(p);
    this.seasT = 0;
    this.shore.resetCamps();
    // the Brethren re-man and re-arm their forts between voyages; yours stay yours
    this.forts.apply(this.fortStore.state.taken);
    this.forts.setColours(p);
    this.fortHud.clear();
    this.ammoStock = freshStock();
    if (this.fwLocker.count(this.fwType) <= 0) this.fwType = this.fwLocker.next(this.fwType) ?? this.fwType;
    this.syncFw();
    this.ui.closeFwPicker();
    this.hold.capacity = HOLD_ROOM[p.cls.id] ?? 12;
    this.hold.clear();
    p.ammo = 'round';
    this.rescued = 0;
    p.boost.reload = 1;
    this.gullCool = 90;
    this.rumourT = 300 + Math.random() * 180;
    this.prizeKills = 0;
    this.ui.setFan(false);
    this.input.enabled = true;
    this.ui.showMenu(false);
    this.ui.showHud(true);
    this.rig.mode = 'follow';
    this.rig.menuShift = { x: 0, y: 0, w: 1, h: 1 };
    this.rig.resetTilt();
    // pick up the view you last sailed with, else a comfortable middle distance
    const saved = loadView();
    if (saved) this.rig.setView(saved.zoom, saved.tilt);
    else this.rig.zoom = innerWidth < innerHeight ? 0.5 : 0.42;
    this.viewSaved = `${this.rig.zoom.toFixed(3)},${this.rig.tilt.toFixed(3)}`;
    if (SEA_TEST) {
      this.testSea(p);
      this.rig.snapTo(p.pos);
    }
    this.spawnTimer = 4;
    this.resetHeat();
    if (KRAKEN_TEST) this.atmos.setWeather('storm');
    // the escorts weigh with her and fall in on her quarters
    const fleet: string[] = [];
    for (const [s, ai] of this.escorts) {
      s.anchored = false;
      s.sailTarget = 2 / 3;
      ai.order = this.fleet.state.order;
      ai.mode = 'station';
      fleet.push(`the ${s.name}`);
    }
    this.assignSlots();
    this.fleetHud.setOrder(this.fleet.state.order, false);
    // a guest sets sail beside the host's flagship, wherever she is
    const lead = this.coop.guest ? this.coop.rally() : null;
    if (lead) {
      const at = this.findOpenWater(lead.pos.x, lead.pos.z, 90, 150);
      p.place(at.x, at.z, lead.heading);
      p.speed = p.cls.maxSpeed * 0.3;
      for (const s of this.escorts.keys()) {
        const o = this.findOpenWater(at.x, at.z, 85, 130);
        s.place(o.x, o.z, lead.heading);
      }
      this.rig.snapTo(p.pos);
      this.ui.toast('Weigh anchor', `The ${p.name} falls in with ${lead.captain ?? 'the host'}'s ${lead.name}`, 3.4);
    } else if (away) this.arrive(away, p);
    else
    this.ui.toast('Weigh anchor', fleet.length ? `The ${p.name} sets sail with ${fleet.join(' and ')}` : `The ${p.name} sets sail`, 3);
    if (this.vaultStore.gift('fleet-10k', 10000)) this.ui.toast('A gift from the Crown', '10,000 gold added to your purse', 6);
  }

  private resetWorld() {
    if (this.dockPort || this.trader) this.undock(false);
    for (const s of this.convoys.clear()) this.scrapMerchant(s);
    this.leaveShore();
    this.boarding.reset();
    this.boardable = null;
    this.landing = null;
    this.shoreHud.setPrompt(null);
    this.hunters.clear();
    this.wanted.reset();
    this.banner.clear();
    this.peek.classList.remove('on');
    this.setView(false);
    this.rig.resetEye();
    this.syncFleet();
    // in a shared sea the others' ships (and, hosting, your pirates) sail on without you
    const keep = (s: Ship) => this.coop.live && s.alive && !s.removed && (s.remote || (this.coop.hosting && this.ais.has(s)));
    for (const s of this.ships.slice()) if (!keep(s)) this.removeShip(s);
    this.escorts.clear();
    this.fleetHud.clear();
    this.refreshHold();
    this.markedFoe = null;
    this.moorKey = '';
    this.projectiles.clear();
    this.particles.streaks.begin();
    this.particles.streaks.end();
    this.particles.ribbons.clear();
    this.loot.clear();
    this.debris.clear();
    this.lanterns.clear();
    this.festivals.reset();
    this.drift.clear();
    this.survivors.clear();
    this.birds.recall();
    this.letter.clear();
    this.gullNews.length = 0;
    this.rescuable = null;
    this.crew.clear();
    this.spirits.clear();
    this.kraken.reset();
    this.krHud.clear();
    this.audio.krakenMusic(false);
    this.atmos.hold = false;
    this.krakenStorm = 'none';
    this.krakenCool = 0;
    this.krakenSlowT = 0;
    this.gunnery.nMarks = 0;
    this.fortHud.clear();
    this.player = null;
    this.preview = null;
  }

  /**
   * Settings → Reset the world: a fresh sea. Every fort back in the Brethren's
   * hands, infamy and the Wanted Board wiped, the treasure map torn up, prizes
   * cast loose, pins lifted, and (at sea) the voyage ends back in harbour with
   * every wreck and pirate cleared away. The purse, ships, cosmetics, parts,
   * liveries, ships hired for gold and personal records all stay.
   */
  private freshSea() {
    if ((this.state !== 'menu' && this.state !== 'paused') || this.swBusy || this.vault.isOpen) return;
    this.audio.bell(2, 0.25);
    void this.fade(() => {
      this.ui.showPause(false);
      markWorldReset();
      this.bounty.wipe();
      this.maps.wipe();
      this.fortStore.wipe();
      this.fleet.wipe();
      this.charts.wipe();
      this.waypoints.clear();
      try {
        localStorage.removeItem(BOARD_SEEN_KEY);
      } catch {
        /* private mode */
      }
      this.resetWorld();
      this.forts.apply(this.fortStore.state.taken);
      this.syncTreasure();
      this.enterMenu();
      this.markBoard();
      this.ui.toast('A fresh sea', 'The Brethren hold every fort again. Your gold, ships and treasures are safe', 5);
    });
  }

  /** Bird's-eye or the captain's own eyes on deck. */
  private setView(on: boolean) {
    const p = this.player;
    if (on && (!p || !p.alive || this.state !== 'playing' || this.shore.active)) return;
    if (on === this.fpv) return;
    this.fpv = on;
    this.rig.firstPerson = on;
    this.input.fpv = on;
    this.input.helmMode = false;
    if (on && p) {
      this.captain.board(p, this.crew.deckView(p), this.crew.captainAt(p));
      this.crew.setPilot(p, this.captain.pilot);
    } else {
      this.captain.leave();
      this.input.releaseLook();
    }
    this.ui.setFpv(on);
  }

  private setPaused(on: boolean) {
    if (on && this.state === 'playing') {
      this.input.releaseLook();
      this.state = 'paused';
      // with a crew the sea sails on: the helm is let go, not the world
      if (this.coop.live && this.player) this.player.rudder = 0;
      document.querySelector('#pause .kicker')!.textContent = this.coop.live ? 'Your crew sails on' : 'Voyage paused';
      const p = this.player;
      this.ui.showPause(true, p ? { gold: p.gold, kills: p.kills, isles: this.discovered.size, time: this.voyageTime, ship: p.name, cls: p.cls.id } : undefined);
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
      this.ui.showPause(false);
      this.last = performance.now();
    }
  }

  // ------------------------------------------------------------------ photo mode

  /** Freezes the voyage, clears the HUD away and hands the camera to photo mode. */
  private openPhoto() {
    const p = this.player;
    if (this.photo.active || !p || this.wreck.t >= 0) return;
    let fromPause: boolean;
    if (this.state === 'playing') {
      this.setChart(false);
      this.input.releaseLook();
      this.state = 'paused';
      fromPause = false;
    } else if (this.state === 'paused') {
      this.ui.showPause(false);
      fromPause = true;
    } else return;
    this.input.enabled = false;
    this.photoSnap = this.atmos.snapshot();
    document.body.classList.add('photo');
    const cap = this.shore.active ? this.shore.captain : null;
    this.photo.open(this.rig.camera, cap ? this.shoreFocus.set(cap.x, cap.y + 1, cap.z) : p.pos, this.atmos.hour, fromPause);
  }

  /** Puts the sky back as it was and returns to the pause menu or the helm. */
  private closePhoto() {
    if (!this.photo.active) return;
    this.photo.close();
    if (this.photoSnap) this.atmos.restore(this.photoSnap);
    this.photoSnap = null;
    this.envT = 0;
    this.rig.photoDist = 0;
    this.pipeline.photo = null;
    document.body.classList.remove('photo');
    this.input.enabled = true;
    if (this.photo.fromPause) {
      const p = this.player;
      this.ui.showPause(true, p ? { gold: p.gold, kills: p.kills, isles: this.discovered.size, time: this.voyageTime, ship: p.name, cls: p.cls.id } : undefined);
    } else {
      this.state = 'playing';
      this.last = performance.now();
    }
  }

  /** View depth (m) of the first thing under a screen point: a hull, an island or the sea. */
  private pickDepth(x: number, y: number): number | null {
    const cam = this.rig.camera;
    const dir = PhotoMode.ray(cam, x, y, _a);
    const o = cam.position;
    let best = Infinity;
    for (const s of this.ships) {
      if (s.removed) continue;
      // a sphere round the hull and lower rig
      const r = s.cls.length * 0.55;
      const cx = s.pos.x - o.x;
      const cy = s.root.position.y + 6 - o.y;
      const cz = s.pos.z - o.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      const d2 = cx * cx + cy * cy + cz * cz - t * t;
      if (t > 0 && d2 < r * r) best = Math.min(best, t - Math.sqrt(r * r - d2) * 0.5);
    }
    const w = this.world;
    const ground = (px: number, pz: number) => Math.max(this.terrain.heightAt(px, pz), w.waterHeight(px, pz));
    let prev = 0;
    for (let t = 1; t < Math.min(best, 2400); t += Math.max(0.6, t * 0.025)) {
      const px = o.x + dir.x * t;
      const py = o.y + dir.y * t;
      const pz = o.z + dir.z * t;
      if (py < ground(px, pz)) {
        // home in on the surface
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 6; i++) {
          const m = (lo + hi) / 2;
          if (o.y + dir.y * m < ground(o.x + dir.x * m, o.z + dir.z * m)) hi = m;
          else lo = m;
        }
        best = Math.min(best, hi);
        break;
      }
      prev = t;
    }
    if (!Number.isFinite(best)) return null;
    // distance along the ray to depth along the view
    return best * dir.dot(cam.getWorldDirection(new THREE.Vector3()));
  }

  /**
   * The shutter: one frame redrawn at the screen's full pixel density (higher
   * than play renders at), cropped to the chosen frame and saved as a PNG, or
   * handed to the share sheet on a phone.
   */
  private async capturePhoto() {
    if (!this.photo.active) return;
    const w = innerWidth;
    const h = innerHeight;
    const maxTex = this.renderer.capabilities.maxTextureSize;
    let dpr = Math.max(this.dpr, Math.min(devicePixelRatio || 1, 2.5));
    // stay within a 4K-class frame and what the GPU can allocate
    dpr = Math.min(dpr, Math.sqrt(8.3e6 / (w * h)), maxTex / Math.max(w, h));
    const crop = this.photo.crop();
    const out = document.createElement('canvas');
    try {
      if (Math.abs(dpr - this.dpr) > 0.01) {
        this.captureDpr = dpr;
        this.resize();
      }
      this.render(0);
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      out.width = Math.round(cw * crop.w);
      out.height = Math.round(ch * crop.h);
      out.getContext('2d')!.drawImage(this.canvas, Math.round(cw * crop.x), Math.round(ch * crop.y), out.width, out.height, 0, 0, out.width, out.height);
    } finally {
      if (this.captureDpr) {
        this.captureDpr = 0;
        this.resize();
        this.render(0);
      }
    }
    this.photo.flash();
    this.audio.shutter();
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
    if (!blob) return;
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const name = `shores-of-fortune-${stamp}.png`;
    const size = `${out.width} × ${out.height}`;
    if (this.input.isTouch && navigator.canShare) {
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Shores O’ Fortune' });
          this.photo.saved(blob, 'Photo shared', size);
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') {
            this.photo.saved(blob, 'Photo taken', 'Sharing cancelled');
            return;
          }
          // no share sheet after all: fall through to a download
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.photo.saved(blob, 'Photo saved', `${size} · Downloads`);
  }

  /**
   * Tap on the chart: open the card over whatever lies under the finger (a pin,
   * a port, a fort, an isle, the X); on open sea, drop a pin there and open its
   * card. With a card already open, a tap on open sea only closes it.
   */
  private tapPin(x: number, z: number, pick: number) {
    const hit = this.chartPick(x, z, pick);
    if (hit) {
      this.selectOnChart(hit);
      this.audio.click();
      return;
    }
    if (this.ui.chartCard.isOpen) {
      this.closeChartCard();
      return;
    }
    // anywhere on the known sea: an archipelago's waters or the high seas between
    if (seaEdge(x, z) > 0) return;
    const pin = this.waypoints.add(x, z, this.player?.pos);
    this.audio.knock();
    this.selectOnChart(this.pinTarget(pin));
  }

  // ------------------------------------------------------------------ the helmsman

  /** Whether the chart shows this spot (not inside an archipelago you've only heard of). */
  private onChart(x: number, z: number) {
    const id = nearestRegion(x, z).region.id;
    return id === 'home' || nearestRegion(x, z).dist > HIGH_SEAS_R || id in this.charts.state.seen;
  }

  private pinTarget(pin: Pin) {
    const n = this.waypoints.pins.indexOf(pin) + 1;
    return { target: { kind: 'pin' as const, name: `Waypoint ${n}`, x: pin.x, z: pin.z, pin: pin.id }, pin, css: PIN_COLORS[pin.hue].css, kicker: 'Waypoint' };
  }

  /** What lies under a tap on the chart, nearest kind first: pins, the X, ports, forts, isles. */
  private chartPick(x: number, z: number, pick: number) {
    // a pin's teardrop stands above its spot: a tap on the head counts too
    const pin = this.waypoints.near(x, z, pick * 1.4) ?? this.waypoints.near(x, z + pick * 1.1, pick * 1.2);
    if (pin) return this.pinTarget(pin);
    const tx = this.maps.target;
    if (tx && Math.hypot(tx.x - x, tx.z - z) < pick * 1.8) {
      return { target: { kind: 'treasure' as const, name: 'X marks the spot', x: tx.x, z: tx.z }, pin: null, css: '#ff8f78', kicker: `Treasure · ${tx.isle}` };
    }
    for (const tp of this.tradePorts.ports) {
      if (!this.onChart(tp.x, tp.z) || Math.hypot(tp.x - x, tp.z - z) > pick * 2) continue;
      const aim = tp.toWorld(0, 0, 48);
      return {
        target: { kind: 'port' as const, name: tp.name, x: tp.x, z: tp.z, aimX: aim.x, aimZ: aim.z, reach: (px: number, pz: number) => tp.inReach(px, pz) },
        pin: null,
        css: '#ffd77a',
        kicker: tp.festive > 0.3 ? 'Trading port · feast night' : 'Trading port',
      };
    }
    for (const f of this.forts.forts) {
      if (!this.onChart(f.site.x, f.site.z) || Math.hypot(f.site.x - x, f.site.z - z) > pick * 2) continue;
      const ours = f.owner === 'player';
      return { target: { kind: 'fort' as const, name: f.name, x: f.site.x, z: f.site.z }, pin: null, css: ours ? '#9ff3e8' : '#ffb59a', kicker: ours ? 'Fort · yours' : 'Fort · the Brethren' };
    }
    for (const isl of this.terrain.islands) {
      if (!this.onChart(isl.x, isl.z) || Math.hypot(isl.x - x, isl.z - z) > isl.r * 0.85 + pick) continue;
      const known = this.discovered.has(isl.name);
      // make for the shore facing her, not the middle of the hills
      const p = this.player;
      const a = p ? Math.atan2(p.pos.x - isl.x, p.pos.z - isl.z) : 0;
      return {
        target: { kind: 'isle' as const, name: known ? isl.name : 'Uncharted isle', x: isl.x, z: isl.z, aimX: isl.x + Math.sin(a) * isl.r * 0.9, aimZ: isl.z + Math.cos(a) * isl.r * 0.9 },
        pin: null,
        css: '#fff1c8',
        kicker: known ? 'Island' : 'Island · unexplored',
      };
    }
    return null;
  }

  private selectOnChart(hit: { target: HelmTarget; pin: Pin | null; css: string; kicker: string }) {
    const card: ChartCardInfo = {
      kicker: hit.kicker,
      name: hit.target.name,
      sub: this.cardSub(hit.target),
      warn: this.cardWarn(hit.target),
      accent: hit.css,
      pin: !!hit.pin,
      bound: this.boundFor(hit.target),
    };
    this.chartSel = { target: hit.target, card, pin: hit.pin, css: hit.css };
    this.ui.showChartCard(hit.target, card);
  }

  private closeChartCard() {
    this.chartSel = null;
    this.ui.hideChartCard();
  }

  /** She's already bound for this very place. */
  private boundFor(t: HelmTarget) {
    const c = this.pilot.target;
    return this.pilot.active && !!c && c.kind === t.kind && c.x === t.x && c.z === t.z;
  }

  /** How far, how long, and a word on the wind. */
  private cardSub(t: HelmTarget) {
    const p = this.player;
    if (!p) return '';
    if (this.boundFor(t)) {
      const v = this.pilot.view(p);
      if (v) return `${fmtDist(v.left)}${v.eta >= 0 ? ` · ${fmtEta(v.eta)}` : ''} · under way`;
    }
    const d = Math.hypot((t.aimX ?? t.x) - p.pos.x, (t.aimZ ?? t.z) - p.pos.z);
    if (d < 40) return 'Right here';
    // a rough reckoning: the course runs a little longer than the crow flies
    const eta = (d * 1.2) / Math.max(3, p.cls.maxSpeed * 0.8);
    const w = this.world.wind;
    const up = Math.abs(angleDelta(Math.atan2(-w.dirX, -w.dirZ), Math.atan2((t.aimX ?? t.x) - p.pos.x, (t.aimZ ?? t.z) - p.pos.z))) < 0.7;
    const open = nearestRegion(p.pos.x, p.pos.z).dist > HIGH_SEAS_R;
    return `${fmtDist(d)} · ${fmtEta(eta)}${up && !open && d > 200 ? ' · upwind, she’ll beat' : ''}`;
  }

  private cardWarn(t: HelmTarget) {
    if (t.kind === 'fort') {
      const f = this.forts.forts.find((q) => q.name === t.name);
      if (f && f.owner === 'brethren' && !f.guns.every((g) => g.dead) && !this.world.peaceful) return 'Her guns will open on you as you close';
    }
    if (t.kind === 'isle' && t.name === 'Uncharted isle') return 'Charting it pays a bounty';
    return '';
  }

  /** "Sail there": the helmsman plans her course and takes the wheel. */
  private sailTo(t: HelmTarget) {
    const p = this.player;
    if (!p || !p.alive || this.state !== 'playing') return;
    if (this.shore.active || this.boarding.busy) {
      this.ui.toast('All hands aboard first', 'The helmsman waits for the landing party', 2.6);
      return;
    }
    if (this.dockPort) return;
    if (!this.pilot.engage(p, t)) {
      this.ui.toast('No way through', 'Not even the old charts show a passage there', 3);
      this.audio.click();
      return;
    }
    const v = this.pilot.view(p);
    this.ui.toast(this.pilot.short ? 'As near as she can get' : 'Course set', `${t.name}${v ? ` · ${fmtDist(v.left)}` : ''}`, 2.6);
    this.audio.bosunPipe();
    this.ui.chartCard.setBound(true);
    // a beat to watch the course draw itself, then back to the sea (unless a hand is on the chart)
    const at = performance.now();
    window.setTimeout(() => {
      if (this.chartOpen && this.ui.chartPoked < at && this.pilot.active && this.state === 'playing') this.setChart(false);
    }, 1400);
  }

  /** The captain takes the helm back. */
  private stopPilot(why: string | null) {
    const p = this.player;
    const was = this.pilot.active;
    this.pilot.disengage();
    // her canvas back on one of the lever's notches
    if (p && was) p.sailTarget = Math.round(p.sailTarget * 3) / 3;
    if (was && why) this.ui.toast('Autopilot off', why, 1.8);
    if (this.chartSel) this.ui.chartCard.setBound(false);
  }

  private pilotArrived(t: HelmTarget) {
    if (t.kind === 'pin') return; // the pin's own flare and chime say it
    this.audio.chime();
    const sub =
      t.kind === 'port'
        ? this.input.isTouch
          ? 'Tap the prompt to come alongside'
          : 'Press F to come alongside'
        : t.kind === 'treasure'
          ? 'Go ashore and dig'
          : t.kind === 'isle'
            ? 'Lying off the shore'
            : 'Hove to off her walls';
    this.ui.toast(`Arrived · ${t.name}`, sub, 3.4);
  }

  /** Each frame he has the wheel: steer her, and keep the HUD and the chart card current. */
  private steerPilot(p: Ship, dt: number) {
    const t = this.pilot.target;
    const pinGone = !!t && t.pin !== undefined && this.pilot.active && !this.waypoints.pins.some((q) => q.id === t.pin);
    this.pilot.steer(p, dt, this.world.wind, this.convoys.with(this.ships, this.afloat), pinGone);
  }

  /** The sea chart overlays live play: the world keeps sailing underneath. */
  private setChart(on: boolean) {
    if (on && !this.chartOpen && this.state === 'playing' && this.player) {
      this.setMapView(false);
      this.input.releaseLook();
      this.chartOpen = true;
      this.ui.showChart(true, this.player);
    } else if (!on && this.chartOpen) {
      this.chartOpen = false;
      this.chartSel = null;
      this.ui.showChart(false);
    }
  }

  /** The pirate the player is duelling, so the camera can frame the two of them:
   *  the nearest ship hunting her (or that she has just traded shot with) inside gun range. */
  private battleFoe(): THREE.Vector3 | null {
    const p = this.player;
    if (!p || !p.alive) return null;
    // nothing else matters while the Kraken is up
    const kf = this.kraken.focus(this.krFocus);
    if (kf && Math.hypot(kf.x - p.pos.x, kf.z - p.pos.z) < 220) {
      this.lastFoe = null;
      return kf;
    }
    const t = this.world.time;
    let best: Ship | null = null;
    let bd = Infinity;
    for (const s of this.ships) {
      if (!s.alive || s.removed || s.team !== 'pirate') continue;
      const ai = this.ais.get(s);
      if (!ai && !s.remote) continue;
      const d = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z);
      // a pirate tied up with an escort far off doesn't drag the camera over to her
      // (another game's pirate: by what her owner says she's hunting)
      const engaged = ai ? ai.mode === 'engage' && (ai.target === p || d < 160) : this.coop.aims(s, p) || d < 160;
      const fighting = engaged || (s.lastAttacker === p && t - s.lastHit < 12) || (p.lastAttacker === s && t - p.lastHit < 12);
      // a little hysteresis so the frame doesn't flicker at the edge of range
      if (fighting && d < (s === this.lastFoe ? 320 : 270) && d < bd) {
        bd = d;
        best = s;
      }
    }
    this.lastFoe = best;
    if (best) return best.pos;
    // a fort's guns on you: keep its walls in the frame
    const f = this.forts.engaging(p.pos.x, p.pos.z);
    return f ? this.fortFocus.set(f.site.x, 0, f.site.z) : null;
  }

  // ------------------------------------------------------------------ combat events

  private screenOf(p: THREE.Vector3): [number, number, boolean] {
    const v = p.clone().project(this.rig.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, v.z < 1];
  }

  private onHit(ship: Ship, attacker: Ship, dmg: number, pos: THREE.Vector3) {
    const [x, y, ok] = this.screenOf(pos);
    if (attacker && (attacker === this.player || this.escorts.has(attacker))) this.myHits.set(ship, this.world.time);
    if (attacker === this.player && ship !== this.player && this.state === 'playing') {
      this.log.hits++;
      this.log.dealt += dmg;
      // the ship you're hitting is the one "attack my target" goes for
      if (ship.team === 'pirate' && ship.alive) this.markedFoe = ship;
    }
    if (attacker === this.player && ok) this.ui.floater(`${Math.round(dmg)}`, x, y);
    if (ship === this.player) {
      if (ok) this.ui.floater(`-${Math.round(dmg)}`, x, y, 'bad');
      this.rig.shake(0.28);
      this.pipeline.flash(0.06);
    }
    if (!ship.alive && ship !== this.player) this.onSunk(ship, attacker);
    if (!ship.alive && ship === this.player) this.onPlayerSunk('shot');
  }

  /** A ship burning (fire shot): the damage ticks up off her deck, in embers rather than a blow. */
  private onBurn(ship: Ship, attacker: Ship | null, dmg: number) {
    if (dmg <= 0) return;
    const at = new THREE.Vector3(ship.pos.x, ship.root.position.y + ship.cls.freeboard + 2, ship.pos.z);
    const [x, y, ok] = this.screenOf(at);
    const p = this.player;
    if (attacker === p && ship !== p && this.state === 'playing') this.log.dealt += dmg;
    if (ok && (attacker === p || ship === p)) this.ui.floater(ship === p ? `-${Math.round(dmg)}` : `${Math.round(dmg)}`, x, y, 'burn');
    if (!ship.alive && ship !== p && attacker) this.onSunk(ship, attacker);
    if (!ship.alive && ship === p) this.onPlayerSunk('shot');
  }

  /** A special shot left its mark: say so over the ship, once per fresh effect. */
  private onStatus(ship: Ship, st: ShipStatus, attacker: Ship | null) {
    const p = this.player;
    if (!p || (attacker !== p && ship !== p)) return;
    const at = new THREE.Vector3(ship.pos.x, ship.root.position.y + ship.cls.masts[0].height * 0.45 + 3, ship.pos.z);
    const [x, y, ok] = this.screenOf(at);
    const mine = ship === p;
    const text = {
      ablaze: mine ? 'We\'re ablaze!' : 'Ablaze!',
      shredded: mine ? 'Sails shredded!' : 'Sails shredded',
      crew: mine ? 'Gun crews cut down!' : 'Crews cut down',
      dread: mine ? 'The crew are terrified!' : 'Terrified',
      phased: 'Passed clean through',
      unburnt: 'The dead don\'t burn',
      fleshless: 'No flesh to cut',
    }[st];
    if (ok) this.ui.floater(text, x, y - 18, st);
  }

  private onSunk(ship: Ship, attacker: Ship) {
    this.yardIdleUntil = this.world.time + 3;
    // word of it takes a moment to reach the Brethren: a hunter the kill earns sets out once she's under
    this.heat.cool = Math.max(this.heat.cool, 2.5);
    if (ship.team === 'player') return this.onEscortLost(ship);
    // the replacement waits until the wreck has settled
    this.spawnTimer = Math.max(this.spawnTimer, 10);
    this.castAdrift(ship);
    const named = ship.hunter ? CAPTAIN.get(ship.hunter) : undefined;
    if (named) return this.claimHunter(ship, named, attacker);
    // the Crown pays more the more the Brethren hate you, and more again for your infamy;
    // a ghost's hold is full of the cursed gold she went down with
    const heat = 1 + wantedLevel(this.heat.pts) * HEAT_BONUS;
    const bounty = Math.round({ sloop: 60, brig: 110, galleon: 220 }[ship.cls.id] * heat * this.bounty.bonus * (ship.ghost ? 2 : 1));
    const luck = { sloop: 0, brig: 0.3, galleon: 0.6 }[ship.cls.id] + (ship.ghost ? 0.35 : 0);
    this.loot.drop(ship.pos.x, ship.pos.z, 3 + Math.floor(ship.cls.length / 8) + (ship.ghost ? 2 : 0), luck, ship.cls.id === 'galleon' || ship.ghost);
    // your escorts' kills are yours: the Crown pays the flagship
    const escort = this.escorts.get(attacker);
    // ...and so are the kills of a fort's guns that fly your colours
    const fort = this.forts.byGunner(attacker);
    const ally = (!!escort || fort?.owner === 'player') && !!this.player && this.state === 'playing';
    if (ally) {
      if (escort) escort.rec.kills++;
      this.player!.kills++;
      const [x, y, ok] = this.screenOf(_a.set(ship.pos.x, ship.root.position.y + ship.cls.freeboard + 4, ship.pos.z));
      if (ok) this.ui.floater(escort ? `The ${attacker.name} sinks her!` : `${attacker.name}'s guns sink her!`, x, y, 'fleet');
    }
    if (attacker === this.player || ally) {
      const by = escort ? ` (the ${attacker.name})` : fort ? ` (the guns of ${attacker.name})` : '';
      if (ship.ghost) this.note('ghost', `Laid the ${ship.name} to rest${by}`, `Ghost ${ship.cls.name.toLowerCase()} · +${bounty} gold`);
      else this.note(escort || fort ? 'fleet' : 'kill', escort || fort ? `The ${fort ? `guns of ${attacker.name}` : attacker.name} sank the ${ship.name}` : `Sank the ${ship.name}`, `${ship.cls.name} · +${bounty} gold`);
      this.player!.gold += bounty;
      this.vaultStore.earn(bounty);
      this.ui.toast(`+${bounty} gold ${ship.ghost ? 'cursed bounty' : 'bounty'}`, ship.ghost ? `The ${ship.name} is laid to rest` : `${ship.name} sunk`, 3.6);
      this.audio.coin();
      this.addInfamy(KILL_INFAMY[ship.cls.id]);
      this.prizeEarned();
      // whatever she had bolted on is yours to pull from the wreck
      const prize = Object.values(ship.livery.parts ?? {})[0];
      if (prize) setTimeout(() => this.findPart(prize, 'Salvaged from the wreck', ship.pos), 1400);
    } else if (this.assisted(ship) && this.player) {
      // another captain sank her, but our guns had a hand in it: a share of the bounty
      const share = Math.round(bounty * 0.5);
      this.player.gold += share;
      this.vaultStore.earn(share);
      this.ui.toast(`+${share} gold, a share`, `${attacker?.captain ?? 'Your crewmate'} sank the ${ship.name}`, 3.4);
      this.audio.coin();
      this.note('fleet', `Helped sink the ${ship.name}`, `${ship.cls.name} · +${share} gold`);
    } else if (attacker?.captain && attacker.remote) this.ui.toast(`${attacker.captain} sinks her`, `The ${ship.name} goes down`, 2.6);
  }

  /** Whether our side had a hand in sinking her (struck her in the last half minute) while someone else dealt the last blow. */
  private assisted(ship: Ship) {
    const t = this.myHits.get(ship);
    return this.coop.live && t !== undefined && this.world.time - t < 30;
  }

  /** Another game's ship went down (multiplayer): a crewmate lost, or a pirate sunk by someone in the crew. */
  private onRemoteSunk(ship: Ship, by: Ship | null) {
    if (ship.team === 'player') {
      if (ship.captain) this.ui.toast(`The ${ship.name} is lost`, `${ship.captain}'s flagship goes down`, 3.6);
      return;
    }
    this.onSunk(ship, by as Ship);
  }

  // ------------------------------------------------------------------ bounties

  /** A new voyage starts cold: no infamy, no hunters, the first of them already chosen. */
  private resetHeat() {
    const h = this.heat;
    h.pts = h.sent = h.claimed = h.cool = 0;
    h.met.clear();
    this.hunters.clear();
    this.wanted.reset();
    this.banner.clear();
    // the first to come is always one of the cheapest; a hull built for a later one is no use now
    if (h.next && h.next.tier !== 1) h.next = null;
    if (!h.next) {
      if (this.hunterHull) this.scrapHull(this.hunterHull);
      this.hunterHull = null;
      h.next = this.bounty.pick(1, h.met);
    }
  }

  /** Infamy earned by your guns: the wanted level climbs and, with it, your name among the Brethren. */
  private addInfamy(pts: number) {
    if (this.state !== 'playing') return;
    const h = this.heat;
    const was = wantedLevel(h.pts);
    h.pts += pts;
    const lv = wantedLevel(h.pts);
    const rank = this.bounty.addInfamy(pts);
    if (lv > was) {
      this.bounty.reached(lv);
      this.audio.wanted(lv);
      if (lv < 5) this.warnOfHunter();
      this.ui.toast(`Wanted · ${'☠'.repeat(lv)}`, lv >= 5 ? 'The whole Brethren is hunting you' : `A hunter sets out · pirate bounties +${Math.round(lv * HEAT_BONUS * 100)}%`, 3.6);
    }
    if (rank >= 0) this.ui.toast('Your infamy grows', `${REPUTE[rank][1]} · Crown bounties +${Math.round((this.bounty.bonus - 1) * 100)}%`, 4.2);
  }

  /** Sends for the hunters your infamy has earned, and keeps the HUD pointed at them. */
  private updateHunters(dt: number) {
    const p = this.player!;
    const h = this.heat;
    h.cool -= dt;
    if (!h.next) h.next = this.bounty.pick(Math.min(5, h.sent + 1), h.met);
    let near: Ship | null = null;
    let nd = Infinity;
    for (const s of this.hunters.keys()) {
      if (!s.alive) continue;
      const d = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z);
      if (d < nd) {
        nd = d;
        near = s;
      }
    }
    // one at a time, a breather after each claim, and only once her ship is ready on the slipway
    if (!near && p.alive && !this.onHighSeas && h.cool <= 0 && this.hunterHull && huntersEarned(h.pts) > h.sent) this.sendHunter();
    const c = near ? this.hunters.get(near) : undefined;
    this.wanted.update(h.pts, wantedLevel(h.pts), near && c ? { name: c.handle, dist: nd } : null);
    if (near && c && p.alive && !this.fpv) {
      const v = _a.set(near.pos.x, near.root.position.y + 6, near.pos.z).project(this.rig.camera);
      const front = v.z < 1;
      this.wanted.point((v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, front, nd, c.handle, innerWidth, innerHeight);
    } else this.wanted.hideMark();
  }

  /** The Brethren's captain sails in from over the horizon, under her own colours, with a pack if she has one. */
  private sendHunter() {
    const p = this.player!;
    const h = this.heat;
    const c = h.next!;
    const model = this.hunterHull!;
    this.hunterHull = null;
    h.next = null;
    const at = this.findOpenWater(p.pos.x, p.pos.z, 470, 600);
    const heading = Math.atan2(p.pos.x - at.x, p.pos.z - at.z);
    const s = this.makeShip(c.cls, 'pirate', model.livery, model);
    s.name = c.ship;
    s.hunter = c.id;
    s.setBoost(c.boost);
    s.place(at.x, at.z, heading);
    s.sailTarget = 1;
    s.sailLevel = 0.8;
    s.speed = s.cls.maxSpeed * 0.6;
    const ai = new PirateAI(s, 4, { ammo: c.ammo });
    this.ais.set(s, ai);
    this.hunters.set(s, c);
    // her escorts: only hulls already waiting on the slipway, never one built on the spot
    if (c.escorts) {
      const pack = new Pack();
      pack.leader = ai;
      ai.pack = pack;
      const sh = Math.sin(heading);
      const ch = Math.cos(heading);
      for (let i = 0; i < c.escorts; i++) {
        const id = (['brig', 'sloop'] as ShipClassId[]).find((k) => this.shipyard.some((m) => m.cls.id === k));
        if (!id) break;
        const side = i % 2 === 0 ? 1 : -1;
        const slot = { x: side * 38, z: 34 };
        let x = s.pos.x + ch * slot.x - sh * slot.z;
        let z = s.pos.z - sh * slot.x - ch * slot.z;
        if (this.terrain.heightAt(x, z) > -9) {
          const o = this.findOpenWater(s.pos.x, s.pos.z, 50, 110);
          x = o.x;
          z = o.z;
        }
        const e = this.launchPirate(id, x, z, heading);
        e.pack = pack;
        e.slot = slot;
      }
    }
    h.sent++;
    h.met.add(c.id);
    this.bounty.sighted(c.id);
    const gold = Math.round(c.bounty * this.bounty.bonus);
    this.banner.hunt(c, gold);
    this.audio.horn();
    // peaceful seas: she won't fire first, but she won't let you out of her sight
    if (this.world.peaceful) setTimeout(() => this.state === 'playing' && s.alive && s.calm && this.ui.toast('She shadows you', `${c.epithet} won't fire first, but she's waiting for an excuse`, 4.2), 4600);
    this.note('bounty', `${c.epithet} came hunting`, `${c.ship} · ${gold.toLocaleString()} gold on her`);
  }

  /** A named captain on the bottom: her bounty, a hold full of her plunder and her poster stamped. */
  private claimHunter(ship: Ship, c: NamedCaptain, attacker: Ship) {
    this.hunters.delete(ship);
    // she carried her fortune with her
    this.loot.drop(ship.pos.x, ship.pos.z, 6 + c.tier, 0.7 + c.tier * 0.06, true);
    const p = this.player;
    const escort = this.escorts.get(attacker);
    if (escort && p && this.state === 'playing') {
      escort.rec.kills++;
      p.kills++;
    }
    if ((attacker !== p && !escort) || !p || this.state !== 'playing') {
      if (attacker?.captain && attacker.remote) this.ui.toast(`${attacker.captain} claims her bounty`, `The ${ship.name} goes down`, 3.4);
      else this.ui.toast('Her bounty goes unclaimed', `The ${ship.name} sank by another hand`, 3.4);
      return;
    }
    const h = this.heat;
    const gold = Math.round(c.bounty * this.bounty.bonus);
    const inf = c.tier * 3;
    p.gold += gold;
    this.vaultStore.earn(gold);
    this.bounty.claim(c.id, gold);
    h.claimed++;
    h.cool = 35;
    this.addInfamy(inf);
    this.banner.claimed(c, gold, inf);
    this.audio.bounty();
    this.rig.shake(0.3);
    this.pipeline.flash(0.12);
    const at = new THREE.Vector3(ship.pos.x, ship.root.position.y + ship.cls.freeboard + 3, ship.pos.z);
    for (let i = 0; i < 14; i++) this.particles.sparkle(at, [1.4, 1.05, 0.45], 1.6);
    this.note('bounty', `Claimed the bounty on ${c.epithet}`, `The ${ship.name} · +${gold.toLocaleString()} gold`);
  }

  /**
   * Salvage hauled aboard: its goods go into the hold, its shot into the racks,
   * and it patches the hull. `by` is an escort sweeping it into her own hold.
   */
  private haul(p: Ship, it: Item, by: EscortAI | null = null) {
    const w = this.world;
    const ship = by ? by.ship : p;
    ship.hp = Math.min(ship.maxHp, ship.hp + it.heal * ship.maxHp);
    const at = new THREE.Vector3(it.x, 2, it.z);
    // the fleet shares one magazine: shot she finds is sent across to the flagship's racks
    this.stockAmmo(ammoLoot(it.tier), at);
    this.stockFireworks(fireworkLoot(it.tier), at);
    const res = by ? { ...by.hold.stow(it.goods), across: [] } : this.stowFleet(it.goods);
    const [x, y] = this.screenOf(at);
    const kept = res.kept.slice().sort((a, b) => LOOT[b].rarity - LOOT[a].rarity || LOOT[b].price - LOOT[a].price);
    const best = kept[0];
    if (!by && (res.tossed.length || res.across.length)) this.nagHold(res.tossed.length, res.across);
    if (!best) return;
    const k = LOOT[best];
    const more = kept.length > 1 ? ` +${kept.length - 1}` : '';
    const who = by ? `${by.ship.name} · ` : '';
    if (it.tier === 0) {
      this.ui.floater(`${who}${k.name}${more}`, x, y, by ? 'fleet' : 'loot');
      this.audio.coin(0, by ? 0.3 : 0.5);
      return;
    }
    const R = RARITY[it.tier];
    // now and then a chest holds a torn piece of a treasure map (more often the finer the chest)
    const fresh = this.maps.state.dug === 0 && this.maps.count === 0 ? 2 : 1;
    if (!this.maps.complete && Math.random() < [0, 0.1, 0.25, 0.45, 0.7][it.tier] * fresh) setTimeout(() => this.foundPiece(at), 900);
    this.log.chests++;
    this.log.best = Math.max(this.log.best, it.tier);
    if (it.tier >= 2) this.note('chest', by ? `The ${by.ship.name} hauled up a ${R.name.toLowerCase()} chest` : `${R.name} chest`, kept.map((id) => LOOT[id].name).join(', '));
    this.ui.floater(`${who}${R.name} chest: ${k.name}${more}`, x, y, (['loot', 'loot', 'rare', 'epic', 'legendary'] as const)[it.tier]);
    w.particles.treasure(new THREE.Vector3(it.x, w.waterHeight(it.x, it.z), it.z), R.glow, it.tier);
    this.audio.treasure(it.tier);
    if (k.rarity >= 2) this.ui.lootToast(lootIcon(best), k.rarity, by ? `${RARITIES[k.rarity].name} plunder · in the ${by.ship.name}'s hold` : `${RARITIES[k.rarity].name} plunder`, k.name, k.rarity === 4 ? 3.8 : 3);
    if (it.tier >= 3 && !by) this.rig.shake(it.tier === 4 ? 0.22 : 0.1);
    this.chestPart(it.tier, at, 900);
  }

  /** A chest (or a camp's strongbox) may have a ship part in it. */
  private chestPart(tier: number, at: THREE.Vector3, delay: number) {
    const p = this.player;
    const t = chestPart(tier, p ? loadoutStats(p.livery.parts).luck : 0);
    if (t === null) return;
    const found = rollPart(t, (id) => this.partStore.owns(id));
    setTimeout(() => this.findPart(found.id, tier >= 3 ? 'In the treasure chest' : 'Found in the salvage', at), delay);
  }

  /** A part goes into the locker, with a toast fit for its rarity (a spare is paid out in gold). */
  private findPart(id: string, kicker: string, at: THREE.Vector3 | null) {
    const f = this.partStore.grant(id);
    if (!f) return;
    this.announcePart(f, kicker, at);
  }

  private announcePart(f: Found, kicker: string, at: THREE.Vector3 | null) {
    const p = f.part;
    const R = PART_RARITIES[p.tier];
    if (f.refund) this.vaultStore.earn(f.refund);
    const title = f.fresh ? p.name : `${p.name} (spare · +${f.refund.toLocaleString('en-US')} gold)`;
    this.ui.lootToast(partIcon(p, 'loot-ico'), [0, 2, 3, 4, 5][p.tier], `${R.name} ${SLOT_NAMES[p.slot].toLowerCase()} · ${kicker}`, title, p.tier >= 3 ? 4.6 : 3.6);
    this.note('chest', `Found ${p.name}`, `${R.name} ${SLOT_NAMES[p.slot].toLowerCase()}${f.fresh ? ' · fit it at the Shipwright' : ''}`);
    this.audio.treasure(Math.min(4, p.tier + 1));
    if (at && this.state === 'playing') this.world.particles.treasure(at.clone().setY(2), RARITY[Math.min(4, p.tier + 1)].glow, Math.min(4, p.tier + 1));
    if (p.tier >= 3) this.rig.shake(0.12);
  }

  /**
   * The escorts sweep the wreckage: each one with room bears away for the
   * nearest floating salvage the flagship isn't about to take herself, and
   * hauls up whatever passes under her bows into her own hold.
   */
  private sweepSalvage(p: Ship, dt: number) {
    if (!this.escorts.size) return;
    const es = this.carriers();
    for (const ai of es) {
      const s = ai.ship;
      const got = this.loot.gather(dt, s.pos, (s.cls.beam * 0.5 + 5) * 2, (it) => !ai.hold.wouldKeep(it.goods));
      for (const it of got) this.haul(p, it, ai);
    }
    this.salvageT -= dt;
    if (this.salvageT > 0) return;
    this.salvageT = 0.6;
    const claimed = new Set<Item>();
    const flagFree = this.hold.used < this.hold.capacity;
    for (const ai of es) {
      ai.salvage = null;
      if (ai.order === 'hold' || ai.mode === 'fight' || ai.mode === 'fallback' || ai.hold.used >= ai.hold.capacity) continue;
      const s = ai.ship;
      const it = this.loot.nearestFor(s.pos.x, s.pos.z, 180, (it) => {
        if (claimed.has(it)) return false;
        const dp = Math.hypot(it.x - p.pos.x, it.z - p.pos.z);
        // within the flagship's reach, and not right under her own bows when she has room for it
        if (dp > 240 || (flagFree && dp < 60 && this.hold.wouldKeep(it.goods))) return false;
        return ai.hold.wouldKeep(it.goods);
      });
      if (!it) continue;
      claimed.add(it);
      ai.salvage = { x: it.x, z: it.z };
    }
  }

  /** Says (now and then) that the hold is full and where to empty it. */
  private nagHold(tossed = 0, across: { name: string; n: number }[] = []) {
    if (this.holdNagT > 0) return;
    this.holdNagT = 9;
    const near = this.player && this.tradePorts.nearest(this.player.pos.x, this.player.pos.z);
    const where = near ? `Sell at ${near.port.name} to make room` : 'Sell at a trading port to make room';
    if (across.length && !tossed) {
      const n = across.reduce((c, a) => c + a.n, 0);
      this.ui.toast('Hold full · the escorts take the rest', `${n} ${n === 1 ? 'good' : 'goods'} sent across to ${across.map((a) => `the ${a.name}`).join(' and ')} · sold with yours in port`, 3.6);
      return;
    }
    this.ui.toast(tossed ? `Hold full · ${tossed} cheap ${tossed === 1 ? 'good' : 'goods'} over the side` : this.carriers().length ? 'Every hold in the fleet is full' : 'Hold full', where, 3.4);
  }

  // ---------------------------------------------------------------- bottles, survivors and the carrier gull

  /** The isles of whichever archipelago she sails in. */
  private islesHere(p: Ship) {
    const here = nearestRegion(p.pos.x, p.pos.z).region;
    return this.terrain.islands.filter((i) => nearestRegion(i.x, i.z).region === here);
  }

  private portName(p: Ship) {
    return this.tradePorts.nearest(p.pos.x, p.pos.z)?.port.name ?? 'Goldwater Quay';
  }

  /** A bottle hauled out of the sea: a piece of a treasure map, a rival's taunt or somebody's lost letter. */
  private openBottle(p: Ship, b: Bottle) {
    const at = new THREE.Vector3(b.x, 1.5, b.z);
    const [sx, sy, ok] = this.screenOf(at);
    if (ok) this.ui.floater('A message in a bottle!', sx, sy - 20, 'rare');
    this.audio.parchment();
    this.world.particles.splash(at.setY(this.world.waterHeight(b.x, b.z)), 0.3);
    const kicker = 'Message in a bottle';
    const r = Math.random();
    if (!this.maps.complete && (r < 0.5 || this.maps.count === 0)) {
      const n = this.maps.count + 1;
      this.letter.show({ via: 'bottle', kicker, ...mapLetter(n), reward: `Treasure map piece · ${n} of 3` });
      setTimeout(() => this.foundPiece(at), 1100);
      return;
    }
    if (r < 0.78) {
      const lv = wantedLevel(this.heat.pts);
      const pool = CAPTAINS.filter((k) => k.tier <= lv + 1);
      const c = this.heat.next ?? pool[Math.floor(Math.random() * pool.length)] ?? CAPTAINS[0];
      const gold = Math.round(c.bounty * this.bounty.bonus);
      this.bounty.sighted(c.id);
      this.markBoard();
      this.letter.show({ via: 'bottle', kicker, ...rivalLetter(c, p.name), art: portrait(c.face), seal: 'black', reward: `${c.epithet} · ${gold.toLocaleString('en-US')} gold on her head` }, 13);
      this.note('bounty', `A bottle from ${c.epithet}`, c.taunt);
      return;
    }
    const isles = this.islesHere(p);
    const isle = isles.length ? isles[Math.floor(Math.random() * isles.length)].name : 'a nameless rock';
    const l = lostLetter(this.portName(p), isle);
    p.gold += l.gold;
    this.vaultStore.earn(l.gold);
    this.audio.coin(0.4);
    this.letter.show({ via: 'bottle', kicker, ...l.words, seal: l.seal, reward: `+${l.gold} gold` });
    this.note('chest', 'A message in a bottle', `${l.words.title.replace(/[,:.]$/, '')} · +${l.gold} gold`);
  }

  /** The carrier's errands, rumours of salvage, and the survivors' cries across the water. */
  private updateTidings(p: Ship, dt: number) {
    this.gullCool -= dt;
    if (this.gullNews.length && this.gullCool <= 0 && p.alive && !this.shore.active && !this.boarding.busy && !this.birds.carrying) {
      const port = this.tradePorts.nearest(p.pos.x, p.pos.z)?.port;
      const news = this.gullNews[0];
      if (this.birds.carry(p, this.world, news, port ? { x: port.x, z: port.z } : null)) {
        this.gullNews.shift();
        this.gullCool = 45;
      }
    }
    // of an afternoon, word of a feast in port tonight
    this.feastT -= dt;
    if (this.feastT <= 0) {
      this.feastT = 12;
      const hour = this.atmos.day * 24;
      // a new day, a new feast to hear of
      if (hour < 12) this.feastTold = '';
      const f = hour > 12.5 && hour < 18 ? this.festivalNews() : null;
      const key = f ? `${f.feast}|${f.towns.join()}` : '';
      if (f && f.when === 'tonight' && key !== this.feastTold) {
        this.feastTold = key;
        this.gullNews.push(() => this.gullLetter({ ...feastNews(f.towns, f.feast, f.line, f.full), seal: 'gold', reward: f.full ? 'Every port lights up tonight' : `Feast night \u00b7 ${f.towns.join(', ')}` }, 12));
      }
    }
    this.rumourT -= dt;
    if (this.rumourT <= 0) {
      this.rumourT = 420 + Math.random() * 240;
      if (!this.onHighSeas) this.gullNews.push(() => this.rumour());
    }
    this.cryT -= dt;
    if (this.cryT <= 0) {
      this.cryT = 2.4 + Math.random() * 2.6;
      const n = this.survivors.nearest(p.pos.x, p.pos.z);
      if (n && n.d < 140) {
        const [vol, pan, d] = this.world.soundAt(_a.set(n.raft.x, 1, n.raft.z));
        this.audio.shout(vol, pan, d, false, 2);
      }
    }
  }

  /** A letter off the carrier's back, unrolled. */
  private gullLetter(v: Omit<LetterView, 'via' | 'kicker'>, life = 11) {
    this.letter.show({ via: 'gull', kicker: 'A gull brings word', ...v }, life);
    this.audio.parchment(0.8);
  }

  /** Every third pirate sunk, the merchants send prize money by gull. */
  private prizeEarned() {
    if (++this.prizeKills < 3) return;
    const k = this.prizeKills;
    this.prizeKills = 0;
    const gold = Math.round((110 + Math.random() * 60) * k * this.bounty.bonus);
    this.gullNews.push(() => {
      const p = this.player;
      if (!p) return;
      p.gold += gold;
      this.vaultStore.earn(gold);
      this.audio.coin(0.3);
      this.gullLetter({ ...prizeNews(k, gold, this.portName(p)), seal: 'gold', reward: `+${gold.toLocaleString('en-US')} gold` });
      this.note('trade', 'Prize money came by gull', `+${gold} gold`);
    });
  }

  /** Your name climbs the Brethren's list: a friend sends word of who is coming. */
  private warnOfHunter() {
    const c = this.heat.next;
    if (!c || this.onHighSeas) return;
    const gold = Math.round(c.bounty * this.bounty.bonus);
    this.gullNews.push(() => {
      this.bounty.sighted(c.id);
      this.markBoard();
      this.gullLetter({ ...bountyNews(c, gold), art: portrait(c.face), seal: 'black', reward: `${c.epithet} · ${gold.toLocaleString('en-US')} gold` }, 12);
    });
    // she should beat the hunter to you
    this.gullCool = Math.min(this.gullCool, 4);
  }

  /** Salvage washed up off one of the isles: a fine chest in the shallows, and a pin on the chart. */
  private rumour() {
    const p = this.player;
    if (!p) return;
    const isles = this.islesHere(p).filter((i) => {
      const d = Math.hypot(i.x - p.pos.x, i.z - p.pos.z);
      return d > 300 && d < 1500;
    });
    for (let k = 0; k < 12 && isles.length; k++) {
      const isl = isles[Math.floor(Math.random() * isles.length)];
      const a = Math.random() * Math.PI * 2;
      for (let f = 1.0; f < 1.8; f += 0.1) {
        const x = isl.x + Math.cos(a) * isl.r * f;
        const z = isl.z + Math.sin(a) * isl.r * f;
        const h = this.terrain.heightAt(x, z);
        if (h > -6 && h < -2) {
          this.loot.place(x, z, rollTier(0.5, 2), true);
          this.waypoints.add(x, z, p.pos);
          this.gullLetter({ ...rumourNews(isl.name, this.portName(p)), reward: `Pinned on your chart · ${isl.name}` });
          return;
        }
        if (h < -6) break;
      }
    }
  }

  /** Some of a sunk pirate's hands make it to the wreckage. */
  private castAdrift(ship: Ship) {
    const p = this.player;
    if (ship.ghost || ship.prize || !p || this.state !== 'playing' || Math.random() > 0.8) return;
    if (Math.hypot(ship.pos.x - p.pos.x, ship.pos.z - p.pos.z) > 650) return;
    const groups = survivorsOf(ship.cls.id);
    const x = ship.pos.x;
    const z = ship.pos.z;
    const from = ship.name;
    setTimeout(() => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      groups.forEach((n, i) => {
        const a = Math.random() * Math.PI * 2;
        const r = 5 + i * 7 + Math.random() * 4;
        this.survivors.spawn(x + Math.cos(a) * r, z + Math.sin(a) * r, n, from);
      });
      if (!this.rescued && !this.survivorTip) {
        this.survivorTip = true;
        this.ui.toast('Survivors in the water', 'Sail alongside the wreckage and throw them a line: they’ll sign on with your crew', 4.6);
      }
    }, 4500);
  }

  private survivorTip = false;

  /** Alongside a raft of survivors: offer them a line (F or a tap). */
  private updateRescuePrompt(p: Ship, dt: number) {
    this.rescueT -= dt;
    if (this.rescueT <= 0) {
      this.rescueT = 0.25;
      this.rescuable = p.alive && !this.fpv ? this.survivors.reachable(p) : null;
    }
    const r = this.rescuable;
    if (!r || !r.hands.length) return false;
    const n = r.hands.length;
    this.shoreHud.setPrompt({ key: 'rescue', title: 'Throw them a line', sub: `${n === 1 ? 'A sailor' : `${n} sailors`} off the ${r.from} ${n === 1 ? 'clings' : 'cling'} to the wreckage`, ok: true });
    if (this.input.state.helm) this.throwLine();
    return true;
  }

  private throwLine() {
    const r = this.rescuable;
    const p = this.player;
    if (!r || !p || this.state !== 'playing') return;
    this.survivors.rescue(r, p);
    this.rescuable = null;
    this.shoreHud.setPrompt(null);
    const [vol, pan, d] = this.world.soundAt(_a.set(r.x, 1, r.z));
    this.audio.shout(vol, pan, d, true, 3);
    this.audio.splash(vol * 0.3, pan, d);
    const [x, y, ok] = this.screenOf(_a.set(r.x, 2, r.z));
    if (ok) this.ui.floater('Line away!', x, y, 'fleet');
  }

  /** One more over the rail: the gun crews grow, and the last of them tells you what they know. */
  private handAboard(r: Raft, left: number) {
    const p = this.player;
    if (!p || !p.alive) return;
    const MAX = 8;
    this.rescued++;
    p.boost.reload = 1 - 0.025 * Math.min(this.rescued, MAX);
    const at = _a.set(p.pos.x, p.root.position.y + p.cls.freeboard + 2, p.pos.z);
    const [x, y, ok] = this.screenOf(at);
    if (ok) this.ui.floater(this.rescued > MAX ? 'Works their passage' : '+1 hand', x, y, 'fleet');
    if (left > 0) return;
    const n = r.crew;
    const [vol, pan, d] = this.world.soundAt(at);
    this.audio.shout(vol, pan, d, true, 4);
    const pct = Math.round(2.5 * Math.min(this.rescued, MAX));
    const board = this.rescued >= 2 ? ` · +${Math.min(3, Math.floor(this.rescued / 2))} in a boarding party` : '';
    this.ui.toast(`${n === 1 ? 'A survivor' : `${n} survivors`} hauled aboard`, survivorThanks(r.from, n), 4.6);
    setTimeout(() => this.state === 'playing' && this.ui.toast(`${this.rescued} ${this.rescued === 1 ? 'hand' : 'hands'} rescued this voyage`, this.rescued > MAX ? 'The crew is full: they work their passage' : `The guns reload ${pct}% faster${board}`, 3.8), 2600);
    this.note('fleet', `Rescued ${n === 1 ? 'a survivor' : `${n} survivors`} of the ${r.from}`, 'They signed on with the crew');
    if (this.rescued > MAX) {
      const gold = 60 * n;
      p.gold += gold;
      this.vaultStore.earn(gold);
    }
    // a grateful bosun has something to show for it
    if (Math.random() < 0.35) {
      setTimeout(() => {
        if (this.state !== 'playing') return;
        if (!this.maps.complete) {
          this.ui.toast('The bosun pulls something from his boot', 'A torn piece of his captain’s treasure map', 3.6);
          this.foundPiece(null);
        } else if (this.player) {
          const gold = 120 + Math.round(Math.random() * 120);
          this.player.gold += gold;
          this.vaultStore.earn(gold);
          this.audio.coin();
          this.ui.toast(`+${gold} gold`, `The ${r.from}’s purser kept her purse dry`, 3.4);
        }
      }, 5400);
    }
  }

  /** A line in the ship's log, for the farewell. */
  private note(kind: VoyageEvent['kind'], text: string, detail = '') {
    if (this.state !== 'playing' && this.state !== 'docked') return;
    const ev = this.log.events;
    ev.push({ t: this.voyageTime, kind, text, detail });
    if (ev.length > 40) ev.splice(0, 1);
  }

  /** She's going down: slow the blow, rise out of the captain's eyes and start the farewell. */
  private onPlayerSunk(how: 'shot' | 'hull') {
    const p = this.player;
    if (!p || this.wreck.t >= 0 || (this.state !== 'playing' && this.state !== 'paused')) return;
    this.input.enabled = false;
    this.input.releaseLook();
    this.setChart(false);
    this.leaveShore();
    this.setView(false);
    this.syncFleet();
    if (this.escortShips.length) this.note('fleet', 'Your escorts broke off and ran for port', this.escortShips.map((s) => `the ${s.name}`).join(' and '));
    if (this.hold.count) this.note('trade', 'The hold went down with her', `${this.hold.count} goods worth about ${this.hold.worth} gold`);
    const saved = this.carriers().filter((a) => a.hold.count);
    if (saved.length) this.note('trade', 'Your escorts carry their holds safe to port', saved.map((a) => `the ${a.ship.name}: ${a.hold.count} goods`).join(' · '));
    this.state = 'dead';
    // your own ship founders in moments rather than lingering as a hulk
    p.wreckLife = 3;
    p.founders = true;
    const w = this.world;
    // who did it: a broadside, a ram, or the reef
    const foe = p.lastAttacker && p.lastAttacker !== p && w.time - p.lastHit < 20 ? p.lastAttacker : null;
    const aground = this.terrain.heightAt(p.pos.x, p.pos.z) > -p.cls.draft * 1.6;
    const beast = this.kraken.active && w.time - this.krakenHitT < 20;
    const shore = foe?.battery ?? false;
    // the sea itself: the last bite of a reef or a maelstrom's throat (unless a ball finished her)
    const sea = this.hzHit && w.time - this.hzHit.t < 4 && how === 'hull' ? this.hzHit : null;
    const cause: WreckReport['cause'] = beast ? 'kraken' : sea ? sea.kind : how === 'shot' ? (foe ? (shore ? 'fort' : 'shot') : 'aground') : aground || !foe ? 'aground' : shore ? 'fort' : 'rammed';
    let near: { name: string; d: number } | null = null;
    for (const isl of this.terrain.islands) {
      const d = Math.hypot(isl.x - p.pos.x, isl.z - p.pos.z) - isl.r;
      if (d < 520 && (!near || d < near.d)) near = { name: isl.name, d };
    }
    this.report = {
      ship: p.name,
      cls: p.cls.id,
      time: this.voyageTime,
      gold: p.gold,
      kills: p.kills,
      isles: this.discovered.size,
      islesTotal: this.terrain.islands.length,
      shots: this.log.shots,
      hits: this.log.hits,
      dealt: Math.round(this.log.dealt),
      chests: this.log.chests,
      best: this.log.best,
      miles: this.log.metres / 1852,
      cause,
      killer: sea ? sea.name : cause === 'aground' || cause === 'kraken' ? undefined : foe?.name,
      killerCls: sea || cause === 'aground' || cause === 'kraken' || cause === 'fort' ? undefined : foe?.cls.id,
      hunter: !sea && cause !== 'aground' && cause !== 'kraken' && cause !== 'fort' && foe?.hunter ? CAPTAIN.get(foe.hunter)?.epithet : undefined,
      bounties: this.heat.claimed,
      where: near ? (near.d < 60 ? `on the shoals of ${near.name}` : `off ${near.name}`) : null,
      fathoms: Math.max(0, (w.waterHeight(p.pos.x, p.pos.z) - this.terrain.heightAt(p.pos.x, p.pos.z)) / 1.8288),
      events: this.log.events.slice(),
    };
    // remember where the camera was, so the farewell can glide out of it
    const cam = this.rig.camera.position;
    const dx = cam.x - p.pos.x;
    const dz = cam.z - p.pos.z;
    const dist = Math.hypot(dx, cam.y, dz);
    this.wreck = {
      t: 0, hud: true, plunged: false, dived: false, shown: false, skip: false, deep: -1, under: -1, rest: -1, camSet: false,
      az: Math.atan2(dx, dz), elev: Math.asin(clamp(cam.y / Math.max(dist, 1), 0.1, 0.99)), dist: clamp(dist, 40, 320), burst: 0.6, fathoms: -1,
    };
    // the hatches, gunports and torn seams her air will stream out of as she goes down
    const L = p.cls.length;
    const B = p.cls.beam;
    const F = p.cls.freeboard;
    this.leaks = [];
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1;
      const along = (i / 6 - 0.5) * L * 0.78 + (Math.random() - 0.5) * L * 0.08;
      const hatch = i % 3 === 0;
      this.leaks.push({
        p: new THREE.Vector3(hatch ? (Math.random() - 0.5) * B * 0.3 : side * B * 0.46, hatch ? F * 0.9 : F * (0.25 + Math.random() * 0.4), along),
        rate: 9 + Math.random() * 12,
        ph: Math.random() * 10,
        acc: 0,
      });
    }
    this.boil = 0;
    this.bubbles.clear();
    this.timeScale = 0.22;
    this.krakenSlowT = 0;
    this.krHud.show(false);
    this.audio.krakenMusic(false);
    this.rig.shake(0.95);
    this.pipeline.flash(0.5);
    this.audio.founder();
    this.ui.beginWreck(this.report);
  }

  /** Runs the farewell: slow motion, the camera's long look, the plunge and the dive under. */
  private updateWreck(realDt: number) {
    const k = this.wreck;
    const p = this.player;
    if (k.t < 0 || !p) return;
    k.t += realDt;
    const T = k.t;
    this.timeScale = lerp(0.22, 1, smoothstep(0.4, 2.8, T));
    if (k.hud && T > 0.9) {
      k.hud = false;
      this.ui.showHud(false);
    }
    const w = this.world;
    const c = p.pos;
    const L = p.cls.length;
    const bed = this.terrain.heightAt(c.x, c.z);
    // deep enough to follow her down? on a reef the camera stays above and the water closes in instead
    if (k.deep < 0) k.deep = w.waterHeight(c.x, c.z) - bed > 7 ? 1 : 0;
    // the final plunge: her timbers groan and she goes by the stern
    if (!k.plunged && p.sinkT > p.wreckLife) {
      k.plunged = true;
      this.audio.groan();
      this.rig.shake(0.3);
    }
    if (!k.dived && T > DIVE) {
      // her last breath of air bursts up as she slips under
      k.dived = true;
      const y = w.waterHeight(c.x, c.z);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * p.cls.beam;
        w.particles.splash(new THREE.Vector3(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r), 1.1 + Math.random() * 0.6);
      }
      w.wake.stamp(c.x, c.z, L * 0.5, 1, true);
      w.wake.push(c.x, c.z, L * 0.4, -1);
      if (!k.deep) this.audio.submerge(true);
      if (k.deep) {
        // the water closing over her drives a great curtain of air out of every hatch and seam
        const hx = Math.sin(p.heading);
        const hz = Math.cos(p.heading);
        const B = p.cls.beam;
        for (let i = 0; i < 4; i++) {
          const a = (Math.random() - 0.5) * L * 0.7;
          this.bubbles.burst(c.x + hx * a + (Math.random() - 0.5) * B, Math.min(p.root.position.y + 1, y - 2), c.z + hz * a + (Math.random() - 0.5) * B, 1.2 + Math.random() * 0.5);
        }
        for (let i = 0; i < 220; i++) {
          const a = (Math.random() - 0.5) * L * 0.9;
          const sd = (Math.random() - 0.5) * B * 1.2;
          const by = Math.min(p.root.position.y + Math.random() * 3, y - 1);
          const r = Math.random() < 0.18 ? 0.15 + Math.random() * 0.3 : 0.035 + Math.random() * 0.1;
          this.bubbles.emit(c.x + hx * a + hz * sd, by, c.z + hz * a - hx * sd, r, { vx: hz * sd * 0.5, vy: -Math.random() * 1.5, vz: -hx * sd * 0.5, delay: Math.random() * 1.2 });
        }
        // and tears loose what was lashed down: timber floats up past her, the heavy stuff goes down with her
        this.debris.drown(_cineV.set(c.x, Math.min(p.root.position.y + p.cls.freeboard, y - 1.5), c.z), 7, WRECK_TIMBER);
      }
    }
    // she comes to rest on the seabed in a cloud of sand
    const rested = p.dmg.restT >= 0;
    if (rested && k.rest < 0) {
      k.rest = T;
      this.wreckLanding(p, bed);
    }
    if (k.deep && T > DIVE - 1) this.wreckBubbles(p, realDt * this.timeScale, rested ? T - k.rest : -1);
    if (k.deep) {
      // a depth gauge in the letterbox, counting her down
      const fm = Math.max(0, (w.waterHeight(c.x, c.z) - p.root.position.y) / 1.8288);
      if (T > DIVE - 0.5 && Math.round(fm) !== k.fathoms) {
        k.fathoms = Math.round(fm);
        this.ui.wreckDepth(k.fathoms, rested);
      }
    }

    // the post-grade: grey for the blow; underwater, a light swim and the sun shafts (heavy gloom on a reef)
    const shallowDepth = k.deep ? 0 : smoothstep(DIVE + 0.4, DIVE + 2.1, T);
    let post = shallowDepth;
    if (k.under >= 0) {
      // the instant the camera breaks the surface the picture swims and blurs, then clears
      const since = T - k.under;
      post = 0.24 + 0.7 * Math.exp(-since * since * 9);
    }
    this.pipeline.depth = post;
    this.pipeline.desat = 0.55 * smoothstep(0, 0.6, T) * (1 - Math.max(shallowDepth, k.under >= 0 ? 1 : 0));
    const showAt = k.deep ? Math.min(DIVE + 11, Math.max(DIVE + 5.5, k.rest >= 0 ? k.rest + 2.6 : Infinity)) : DIVE + 2;
    if (!k.shown && (T > showAt || (k.skip && T > DIVE))) {
      k.shown = true;
      this.ui.showDead(true, this.report!);
    }

    // the camera: a slow, lowering orbit around the wreck, then a dive to the water where she went down
    const settle = smoothstep(0, 7.5, T);
    const dive = smoothstep(DIVE - 0.4, DIVE + 2.2, T);
    let dist = lerp(k.dist, L * 1.25 + 30, settle);
    dist = lerp(dist, L * 0.7 + 14, dive);
    let elev = lerp(k.elev, 0.3, settle);
    elev = lerp(elev, 0.07, dive);
    const az = k.az + T * 0.07 * smoothstep(0, 2.5, T);
    const cp = this.cinePos.set(c.x + Math.sin(az) * Math.cos(elev) * dist, Math.sin(elev) * dist + 1.5, c.z + Math.cos(az) * Math.cos(elev) * dist);
    cp.y = Math.max(cp.y, w.waterHeight(cp.x, cp.z) + 1.6);
    // down a maelstrom's funnel she lies far below the open sea: look down into it, at her
    this.cineLook.set(c.x, lerp(lerp(4, L * 0.3, settle), -6, dive) - w.funnelAt(c.x, c.z), c.z);
    let fov = lerp(lerp(34, 29, settle), 44, dive);
    let roll = 0;
    if (k.deep) {
      // ...and on down through the surface: alongside and a little below her as
      // she sinks, her hull dark against the bright window of the sky, then up
      // and back once she lies on the sand
      const sink = smoothstep(DIVE, DIVE + 2.4, T);
      const sy = p.root.position.y;
      const after = k.rest >= 0 ? smoothstep(k.rest, k.rest + 5, T) : 0;
      const ud = L * 0.55 + 12 + after * (L * 0.4 + 6);
      // swing round to her keel side as she heels, so her hull, not her sails, is what looms over you
      const up = _cineV.set(0, 1, 0).applyQuaternion(p.root.quaternion);
      const lean = Math.hypot(up.x, up.z);
      let ua = az + Math.sin(T * 0.11) * 0.05;
      if (lean > 0.05) {
        const keel = Math.atan2(-up.x, -up.z);
        ua += Math.atan2(Math.sin(keel - ua), Math.cos(keel - ua)) * smoothstep(0.1, 0.5, lean) * 0.8;
      }
      // low enough to look up past her keel into Snell's window
      const uy = lerp(clamp(sy - 9, bed + 2, -4), bed + L * 0.2 + 5, after);
      const tx = c.x + Math.sin(ua) * ud;
      const tz = c.z + Math.cos(ua) * ud;
      const ty = Math.min(Math.max(uy, this.terrain.heightAt(tx, tz) + 1.6), w.waterHeight(tx, tz) - 2.5);
      const u = this.underCam;
      if (sink <= 0 || !k.camSet) {
        u.set(tx, ty, tz);
        k.camSet = true;
      }
      else u.lerp(_cineV.set(tx, ty, tz), 1 - Math.exp(-realDt * 2.4));
      cp.lerp(u, sink);
      // a diver's drift: down here the camera never quite holds still
      const top = w.waterHeight(cp.x, cp.z);
      cp.addScaledVector(_swayV.set(Math.sin(T * 0.37) * 0.7 + Math.sin(T * 0.83) * 0.22, Math.sin(T * 0.29 + 1) * 0.4, Math.cos(T * 0.31) * 0.6 + Math.sin(T * 0.71) * 0.2), sink);
      if (sink > 0) cp.y = Math.min(cp.y, top - 1.2);
      // once she's down, the gaze lifts slowly from her toward the light and the air still streaming up
      const gaze = k.rest >= 0 ? smoothstep(k.rest + 2.5, k.rest + 12, T) : 0;
      const ly = lerp(sy + lerp(5, 0.5, after), top - 3, gaze * 0.42);
      this.cineLook.lerp(_cineV.set(c.x, ly, c.z), sink);
      fov = lerp(fov, lerp(48, 55, gaze), sink);
      roll = (Math.sin(T * 0.23) * 0.028 + Math.sin(T * 0.53 + 2) * 0.01) * sink;
    }
    this.rig.cine = { pos: cp, look: this.cineLook, fov, w: smoothstep(0, 2.6, T), roll };
    if (k.deep) this.bubbles.update(realDt * this.timeScale, w.waterHeight(c.x, c.z), this.rig.camera, this.pipeline.height);
  }

  /**
   * Air streaming out of her as she goes down: a sputtering train of bubbles
   * from every hatch and seam, great gulps of trapped air breaking free (and
   * shaking loose her timbers), and the boil they make of the surface above.
   * It all chokes off slowly once she lies on the sand.
   */
  private wreckBubbles(p: Ship, dt: number, sinceRest: number) {
    const w = this.world;
    const k = this.wreck;
    const L = p.cls.length;
    const top = w.waterHeight(p.pos.x, p.pos.z);
    const life = sinceRest < 0 ? 1 : Math.exp(-sinceRest * 0.16);
    p.root.updateMatrixWorld();
    for (const lk of this.leaks) {
      // each one chokes and gushes in its own rhythm
      const pulse = 0.5 + 0.5 * Math.sin(k.t * (0.9 + lk.ph * 0.13) + lk.ph);
      lk.acc += dt * lk.rate * life * (0.25 + pulse * pulse * 1.5);
      if (lk.acc < 1) continue;
      const at = p.root.localToWorld(_cineV.copy(lk.p));
      for (; lk.acc >= 1; lk.acc -= 1) {
        if (at.y > top - 0.6) continue;
        const big = Math.random() < 0.1;
        const r = big ? 0.14 + Math.random() * 0.18 : 0.035 + Math.random() * Math.random() * 0.1;
        this.bubbles.emit(at.x + (Math.random() - 0.5) * 0.3, at.y + (Math.random() - 0.5) * 0.2, at.z + (Math.random() - 0.5) * 0.3, r, {
          vx: (Math.random() - 0.5) * 0.6, vy: Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.6, delay: Math.random() * dt,
        });
      }
    }
    // trapped air breaking free in great gulps
    k.burst -= dt;
    if (k.burst <= 0 && life > 0.06) {
      k.burst = sinceRest < 0 ? 0.45 + Math.random() * 1.0 : (1.6 + Math.random() * 2.8) / life;
      const at = p.root.localToWorld(_cineV.set((Math.random() - 0.5) * p.cls.beam * 0.6, p.cls.freeboard * (0.3 + Math.random() * 0.6), (Math.random() - 0.5) * L * 0.8));
      if (at.y < top - 1.5) {
        const size = (0.8 + Math.random() * 0.8) * (0.45 + life * 0.55);
        this.bubbles.burst(at.x, at.y, at.z, size);
        const [vol, pan] = w.soundAt(at);
        this.audio.airPocket(size, Math.max(vol, 0.5), pan);
        // and now and then it shakes a piece of her loose
        if (sinceRest < 0 && Math.random() < 0.4) this.debris.drown(at, 1 + (Math.random() < 0.3 ? 1 : 0), WRECK_TIMBER);
      }
    }
    // the surface overhead churns white where it all breaks
    this.boil += ((sinceRest < 0 ? 1 : life) - this.boil) * (1 - Math.exp(-dt * 1.2));
    this.ocean.setBoil(p.pos.x + 1.2, p.pos.z + 0.5, L * 0.5 + 4, this.boil * 0.9);
  }

  /** She settles onto the sand: a slow billow of it, a muffled thud through the hull. */
  private wreckLanding(p: Ship, bed: number) {
    const w = this.world;
    const L = p.cls.length;
    const hx = Math.sin(p.heading);
    const hz = Math.cos(p.heading);
    for (let i = 0; i < 16; i++) {
      const a = (Math.random() - 0.5) * L;
      const side = (Math.random() - 0.5) * p.cls.beam * 1.6;
      const x = p.pos.x + hx * a + hz * side;
      const z = p.pos.z + hz * a - hx * side;
      const out = 0.6 + Math.random() * 1.2;
      w.particles.emit({
        x, y: bed + 0.6, z, vx: hz * side * 0.2 * out, vy: 0.25 + Math.random() * 0.4, vz: -hx * side * 0.2 * out,
        life: 6 + Math.random() * 4, size: 2.5, sizeEnd: 9 + Math.random() * 6, color: [0.62, 0.58, 0.46], colorEnd: [0.5, 0.52, 0.46],
        alpha: 0.42, drag: 0.9, grav: -0.03, spin: (Math.random() - 0.5) * 0.4, kind: 1, fadeIn: 0.6,
      });
    }
    this.audio.thud(0.9, 0, 0);
    this.rig.shake(0.25);
  }

  /** Beneath the waves: the sea from below, the water's own glow and gloom in place of the air. */
  private setUnder(on: boolean) {
    this.ocean.setUnder(on);
    const u = globalUniforms.uUnder.value;
    u.x = on ? 1 : 0;
    if (on) {
      // the water glows with the light of the day above it, and the further she is from the light, the less you see
      const l = globalUniforms.uLight.value;
      const k = this.wreck;
      const deep = k.rest >= 0 ? smoothstep(k.rest + 2, k.rest + 16, k.t) : 0;
      globalUniforms.uUnderColor.value.set(0.03 * l.x, 0.19 * l.y, 0.23 * l.z).multiplyScalar(1 - deep * 0.35);
      u.z = lerp(60, 34, deep) * (1 - this.atmos.storm * 0.35);
      const uc = globalUniforms.uUnderColor.value;
      this.pipeline.clearColor.setRGB(uc.x, uc.y, uc.z, THREE.LinearSRGBColorSpace);
      // the sun's light bent down through the surface (Snell), and the colour of its shafts
      const sd = globalUniforms.uSunDir.value;
      const pu = (this.pipeline.under ??= { surf: 0, ray: new THREE.Vector3(), color: new THREE.Vector3() });
      const eta = 1 / 1.333;
      const ci = Math.max(sd.y, 0.05);
      const kk = Math.sqrt(Math.max(0, 1 - eta * eta * (1 - ci * ci)));
      pu.ray.set(-sd.x * eta, -kk, -sd.z * eta).normalize();
      const sc = globalUniforms.uSunColor.value;
      const open = (1 - globalUniforms.uCloudCover.value * 0.6) * (1 - this.atmos.storm * 0.5) * smoothstep(-0.05, 0.25, sd.y) * (1 - deep * 0.4);
      pu.color.set(sc.x * 0.3, sc.y * 0.62, sc.z * 0.6).multiplyScalar(1.6 * open).addScaledVector(globalUniforms.uLight.value, 0.06);
      const cam = this.rig.camera.position;
      pu.surf = this.world.waterHeight(cam.x, cam.z);
    } else {
      this.pipeline.clearColor.set(0x0b2a3a);
      this.pipeline.under = null;
    }
    this.bubbles.mesh.visible = on;
  }

  /** Back to the surface: sail the same ship again, or pick another in the harbour. */
  private leaveWreck(again: boolean) {
    if (this.wreck.t < 0 || this.swBusy) return;
    const cls = this.player?.cls.id ?? this.ui.selected;
    this.veil.innerHTML = '<span>Back to the surface…</span>';
    void this.fade(() => {
      this.wreck.t = -1;
      this.timeScale = 1;
      this.rig.cine = null;
      this.pipeline.depth = 0;
      this.pipeline.desat = 0;
      this.audio.submerge(false);
      this.isUnder = false;
      this.setUnder(false);
      this.bubbles.clear();
      this.ocean.setBoil(0, 0, 1, 0);
      this.boil = 0;
      this.ui.showDead(false);
      this.ui.endWreck();
      this.resetWorld();
      this.enterMenu();
      if (again && this.preview) {
        if (this.preview.cls.id !== cls) this.setPreview(cls);
        this.startVoyage(readStartSea());
      }
    });
  }


  // ------------------------------------------------------------------ maelstroms & reefs

  /** The sea took a bite out of a ship: say so over her, and settle who gets the credit if she goes down. */
  private onHazard(ship: Ship, kind: 'reef' | 'maelstrom', dmg: number, at: THREE.Vector3) {
    const p = this.player;
    const w = this.world;
    const name = kind === 'reef' ? this.terrain.reefNear(at.x, at.z, 30)?.name ?? 'the reef' : this.hazards.stateOf(ship, 1.2)?.m.name ?? 'the maelstrom';
    const [x, y, ok] = this.screenOf(_a.set(ship.pos.x, ship.root.position.y + ship.cls.freeboard + 3, ship.pos.z));
    if (ship === p) {
      if (this.state !== 'playing') return;
      this.hzHit = { kind, name, t: w.time };
      if (ok && dmg >= 1) this.ui.floater(`-${Math.round(dmg)}`, x, y, 'bad');
      if (kind === 'maelstrom') this.rig.shake(0.12);
      return;
    }
    const near = !!p && Math.hypot(ship.pos.x - p.pos.x, ship.pos.z - p.pos.z) < 380;
    const last = this.hzCalled.get(ship) ?? -100;
    if (near && ok && ship.alive && w.time - last > 5) {
      this.hzCalled.set(ship, w.time);
      const text = kind === 'reef' ? (ship.scrape > 0.55 ? 'Hard aground!' : 'On the reef!') : 'Caught in the maelstrom!';
      this.ui.floater(ship.team === 'player' ? `The ${ship.name}: ${text.toLowerCase()}` : text, x, y - 18, ship.team === 'player' ? 'fleet' : 'rare');
    } else if (near && ok && dmg >= 1 && ship.team === 'pirate') this.ui.floater(`${Math.round(dmg)}`, x, y, '');
    if (ship.alive) return;
    // she's gone: lured there by you (she was fighting you, or you'd just had her under your guns)?
    const ai = this.ais.get(ship);
    const lured = ship.team === 'pirate' && !!p && p.alive && this.state === 'playing' && ((ship.lastAttacker === p && w.time - ship.lastHit < 90) || (!!ai && ai.target === p && ai.mode === 'engage'));
    if (lured) {
      if (ok) this.ui.floater(kind === 'reef' ? 'Lured onto the reef!' : 'Swallowed by the maelstrom!', x, y - 34, 'epic');
      this.note('kill', kind === 'reef' ? `Led the ${ship.name} onto ${name}` : `Drew the ${ship.name} into ${name}`, kind === 'reef' ? 'She tore her bottom out on the coral' : 'The sea did the rest');
      this.onSunk(ship, p!);
    } else this.onSunk(ship, ship);
  }

  /** The pill under the top of the screen, the leadsman's bell and the first sight of each danger. */
  private updateHazards(p: Ship, dt: number) {
    const hz = this.hazards;
    this.hzBellT -= dt;
    if (!p.alive || this.shore.active || this.photo.active) {
      this.hzHud.set(null);
      this.hzState = 'none';
      return;
    }
    const vs = hz.stateOf(p, 2.4);
    const reef = hz.reefOf(p, 170);
    const draft = p.cls.draft;
    const fmt = (m: number) => `${m.toFixed(1)} m`;
    // the first sight of each: named, with what it means for your ship
    if (vs && vs.u < 2.4 && !this.hzSeen.has(vs.m.name)) {
      this.hzSeen.add(vs.m.name);
      this.ui.toast(vs.m.name, 'A maelstrom turns here · keep clear of its pull', 4);
    }
    if (reef && !this.hzSeen.has(reef.name)) {
      this.hzSeen.add(reef.name);
      this.ui.toast(reef.name, draft < 1.8 ? 'Coral reef · your shallow keel clears most of it' : 'Coral reef · watch for breakers, she draws too much water', 4);
    }
    let state: typeof this.hzState = 'none';
    let v: HazardView | null = null;
    // the way out, as an arrow on screen (0 = up, clockwise)
    const arrowFor = (heading: number) => {
      const [x0, y0, ok0] = this.screenOf(_a.set(p.pos.x, p.root.position.y, p.pos.z));
      const [x1, y1, ok1] = this.screenOf(_a.set(p.pos.x + Math.sin(heading) * 30, p.root.position.y, p.pos.z + Math.cos(heading) * 30));
      return ok0 && ok1 ? Math.atan2(x1 - x0, -(y1 - y0)) : null;
    };
    if (vs && vs.u < 0.95) {
      const throat = vs.u < 0.3;
      const free = vs.out > 0.8 && !throat;
      const grip = clamp((0.95 - vs.u) / 0.85, 0, 1);
      state = 'caught';
      const out = hz.escape(p.pos.x, p.pos.z);
      // the throat dragging her under: the gauge is how close the sea is to her rail
      const under = p.drawn > 0.02;
      v = {
        kind: 'vortex',
        level: free && !under ? 'warn' : 'danger',
        title: under ? (p.drawn > 0.6 ? 'She\'s going under!' : 'The throat has her!') : throat ? 'In the maelstrom\'s throat!' : free ? 'Breaking free' : 'Caught in the maelstrom',
        sub: under ? 'The sea is dragging her down · crowd on sail and claw out!' : throat ? 'Her timbers are giving way · run before the wind!' : free ? `${vs.m.name} · hold your course` : `${vs.m.name} · sail out with the wind`,
        gauge: under ? Math.max(grip, p.drawn) : grip,
        spin: lerp(3.2, 0.7, grip) * (1 - p.drawn * 0.6),
        arrow: out === null ? null : arrowFor(out),
      };
    } else if (p.scrape > 0.08) {
      state = 'aground';
      const depth = p.reefDepth;
      this.terrain.gradientAt(p.pos.x, p.pos.z, this.hzGrad);
      const deep = this.hzGrad.lengthSq() > 1e-6 ? Math.atan2(-this.hzGrad.x, -this.hzGrad.y) : null;
      v = {
        kind: 'reef',
        level: 'danger',
        title: p.scrape > 0.6 ? 'Hard aground!' : 'Scraping the reef!',
        sub: `${reef?.name ?? 'Coral'} · ${fmt(Math.max(0, depth))} of water, you draw ${fmt(draft)} · steer for deep water`,
        gauge: p.scrape,
        arrow: deep === null ? null : arrowFor(deep),
      };
    } else {
      const look = Math.max(40, Math.abs(p.speed) * 7) + p.cls.length * 0.5;
      const shoal = reef ? hz.shoalAhead(p, look) : null;
      const under = reef ? -this.terrain.heightAt(p.pos.x, p.pos.z) : 99;
      if (shoal) {
        state = 'shoal';
        v = {
          kind: 'reef',
          level: 'warn',
          title: 'Shoal water ahead',
          sub: `${reef!.name} · ${fmt(shoal.depth)} over the coral, you draw ${fmt(draft)}`,
          gauge: clamp(1 - shoal.dist / look, 0.08, 1),
          arrow: null,
        };
      } else if (reef && under < 4.5 && this.terrain.reefAt(p.pos.x, p.pos.z) > 0.3) {
        state = 'over';
        v = { kind: 'reef', level: 'info', title: 'Over the reef', sub: `Your keel clears it · ${fmt(under)} of water, you draw ${fmt(draft)}`, gauge: clamp(draft / Math.max(under, 0.1), 0, 1), arrow: null };
      } else if (vs && vs.u < 2.1) {
        state = 'near';
        v = {
          kind: 'vortex',
          level: 'warn',
          title: 'Maelstrom ahead',
          sub: `${vs.m.name} · ${Math.max(0, Math.round(vs.dist - vs.m.vortex.r))} m to its pull`,
          gauge: clamp((2.1 - vs.u) / 1.15, 0, 1),
          spin: 4.5,
          arrow: null,
        };
      }
    }
    // the watch calls it: the bell for danger ahead, a groan of timber as the sea takes hold
    if (state !== this.hzState) {
      if ((state === 'shoal' || state === 'near') && this.hzBellT <= 0) {
        this.audio.shoalBell();
        this.hzBellT = 9;
      }
      if (state === 'caught') {
        this.audio.groan();
        this.rig.shake(0.3);
      }
      this.hzState = state;
    }
    this.hzHud.set(v);
  }

  /** `?brumas` / `?highseas`: set sail off Las Brumas' main isle, or far out on the open ocean between. */
  private testSea(p: Ship) {
    const [home, mist] = REGIONS;
    const hero = this.terrain.islands.find((i) => nearestRegion(i.x, i.z).region === mist)!;
    const at = SEA_TEST === 'brumas' ? this.findOpenWater(hero.x, hero.z, hero.r + 200, hero.r + 320) : _a.set(home.x + (mist.x - home.x) * 0.42, 0, home.z + (mist.z - home.z) * 0.42).clone();
    p.place(at.x, at.z, Math.atan2(mist.x - at.x, mist.z - at.z));
    p.speed = p.cls.maxSpeed * 0.5;
    if (SEA_TEST === 'highseas') {
      this.dolphinT = 30;
      this.whaleT = 3;
    }
    else if (SEA_TEST === 'brumas') this.atmos.climate = 'mist';
  }

  // ------------------------------------------------------------------ the one sea

  /**
   * The archipelagos and the high seas between them, a few times a second:
   * which land is drawn, whose seabed and surf the water reads, and whether
   * you've sailed out into the calm (or into an archipelago, perhaps for the
   * first time).
   */
  private updateSeas(dt: number) {
    if (this.dolphins.active || this.onHighSeas) this.dolphins.update(dt, this.world, this.player);
    if (this.whales.active) this.whales.update(dt, this.world, this.player);
    if (this.onHighSeas && this.player && this.state === 'playing') {
      this.callDolphins(dt);
      this.callWhales(dt);
    }
    this.seasT -= dt;
    if (this.seasT > 0) return;
    this.seasT = 0.25;
    const t = this.rig.target;
    // land is drawn (and its matrices walked) only within reach of the view
    for (const r of this.regions) r.land.visible = this.warming || Math.hypot(r.region.x - t.x, r.region.z - t.z) < STREAM_R;
    // the water shaders read the nearer archipelago's seabed and surf: the swap
    // falls far out on the high seas, where neither has a shoal to show
    const near = nearestRegion(t.x, t.z).region;
    const i = this.regions.findIndex((r) => r.region === near);
    if (i >= 0 && i !== this.liveRegion) {
      this.liveRegion = i;
      const r = this.regions[i];
      this.ocean.setSeabed(r.seabed, r.terrain.rect);
      this.wake.setTerrain(r.seabed, r.terrain.rect);
      setShoreField(r.surf, r.terrain.rect);
      // the gulls nest wherever you're bound
      this.birds.rehome(r.terrain.islands);
    }
    const p = this.player;
    if (!p || this.state !== 'playing') return;
    const { region, dist } = nearestRegion(p.pos.x, p.pos.z);
    // a little hysteresis, so sailing along the edge doesn't flicker the music
    if (!this.onHighSeas && dist > HIGH_SEAS_R + 60) this.enterHighSeas();
    else if (this.onHighSeas && dist < HIGH_SEAS_R - 60) {
      this.leaveHighSeas(false);
      this.arrive(region, p);
    }
  }

  private enterHighSeas() {
    this.onHighSeas = true;
    this.audio.highSeas(true);
    this.atmos.climate = 'open';
    // the storm blows itself out behind you
    if (this.atmos.kind === 'storm' || this.atmos.kind === 'rain') this.atmos.hasten(25);
    this.dolphinT = Math.min(this.dolphinT, 14 + Math.random() * 16);
    this.whaleT = Math.min(this.whaleT, 30 + Math.random() * 25);
    this.ui.toast('The high seas · Mar Sereno', 'Open ocean, a fair trade wind and a long, easy swell. No pirate hunts this far out', 5);
  }

  /** Back among islands (or the voyage over: `quiet`, no fanfare). */
  private leaveHighSeas(quiet: boolean) {
    if (quiet) {
      this.dolphins.clear();
      this.whales.clear();
      this.goldenBreach = false;
      this.atmos.climate = 'home';
    } else this.dolphins.dismiss();
    if (!this.onHighSeas) return;
    this.onHighSeas = false;
    this.audio.highSeas(false);
  }

  /** Sailing in among an archipelago's isles; the first time, it goes on the chart for good. */
  private arrive(region: Region, p: Ship) {
    this.atmos.climate = region.id === 'brumas' ? 'mist' : 'home';
    if (this.charts.mark(region.id)) {
      const reward = 600;
      p.gold += reward;
      this.vaultStore.earn(reward);
      this.note('isle', `Reached ${region.name}`, `+${reward} gold`);
      this.ui.toast(`${region.name} · ${region.motto}`, `New waters charted! +${reward} gold. Their isles, ports and forts are on your chart now`, 6.5);
      this.audio.treasure(2);
    } else {
      this.ui.toast(region.name, region.motto, 4);
      this.audio.chime();
    }
  }

  /** Now and then a pod of dolphins comes racing in to ride along with you. */
  private callDolphins(dt: number) {
    const p = this.player!;
    if (this.dolphins.active) return;
    this.dolphinT -= dt;
    if (this.dolphinT > 0 || !p.alive || p.speed < 2.5) return;
    this.dolphins.summon(p);
    this.dolphinT = 55 + Math.random() * 70;
    this.ui.toast('Dolphins!', 'A pod comes racing in to ride your bow wave', 3.4);
  }

  /**
   * Now and then a pod of humpbacks passes ahead of you, bound across the
   * high seas: their migration runs athwart the lane between the archipelagos.
   */
  private callWhales(dt: number) {
    const p = this.player!;
    const h = this.atmos.hour;
    // the golden hours, in fair weather: the likeliest time of all for a breach
    this.whales.golden = ((h > 5.9 && h < 7.8) || (h > 16.6 && h < 18.9)) && this.atmos.kind !== 'storm' && this.atmos.kind !== 'rain';
    if (this.whales.active) return;
    this.whaleT -= dt;
    if (this.whaleT > 0 || !p.alive) return;
    const [home, mist] = REGIONS;
    const lane = Math.atan2(mist.x - home.x, mist.z - home.z);
    const course = lane + (Math.random() < 0.5 ? 1 : -1) * Math.PI * 0.5 + (Math.random() - 0.5) * 0.6;
    this.whaleT = this.whales.summon(p, course, this.world) ? 110 + Math.random() * 90 : 8;
  }

  // ------------------------------------------------------------------ merchant convoys

  /** The convoys sail on (and now and then one heaves into sight while you cross the high seas). */
  private sailConvoys(dt: number) {
    const p = this.player;
    const playing = this.state === 'playing' && !this.shore.active;
    // `?convoy`: one sent out right across your bows as soon as the yard has the hulls
    if (SEA_TEST === 'convoy' && playing && p && !this.convoys.convoy && !this.testConvoy && this.convoys.stocked >= 2) this.testConvoy = this.convoys.spawn(p, this.rig.groundRadius(), true);
    const scrap = this.convoys.update(dt, this.world, p, this.rig.target, this.rig.groundRadius(), this.onHighSeas && !!p, playing);
    for (const s of scrap) this.scrapMerchant(s);
  }

  private testConvoy = false;

  /** A hull fired on (or rammed) goes to the breakers instead of back to the yard. */
  private scrapMerchant(s: Ship) {
    this.preload.drop(s.root);
    s.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    s.model.dispose();
    s.dispose();
  }

  private sightConvoy(c: Convoy) {
    const [lead, ...rest] = c.fleet;
    const more = rest.length === 1 ? ` and the ${rest[0].kind.title} ${rest[0].ship.name}` : rest.length ? ` and ${rest.length} consorts` : '';
    this.ui.toast('Sail ho! A merchant convoy', `The ${lead.kind.title} ${lead.ship.name}${more}, bound for ${c.dest.name}. Come alongside to trade`, 5.5);
    this.note('trade', 'Sighted a merchant convoy', `${c.fleet.map((m) => m.ship.name).join(', ')} · bound for ${c.dest.name}`);
    this.audio.bell(2, 0.16);
  }

  /** Close aboard a merchantman: offer to hail her (F or a tap), unless something is on your tail. */
  private updateHail(p: Ship) {
    const m = p.alive ? this.convoys.hailable(p) : null;
    if (!m) {
      this.market.setDock(null);
      return false;
    }
    const beast = this.kraken.fighting && !this.kraken.docile;
    const chased = !!this.lastFoe || this.huntedNear(p) || beast;
    const why = chased ? 'Shake off your pursuers first: no merchant heaves to with a fight on' : `${m.kind.title} · buys your hold, sells her cargo`;
    this.market.setDock({ name: `the ${m.ship.name}`, ok: !chased, why, verb: 'Hail' });
    if (!chased && !this.fpv && this.input.state.helm) this.hail(m);
    return true;
  }

  /** She heaves to and comes alongside; her master opens the hatches and the trading begins. */
  private hail(m: Merchant) {
    const p = this.player;
    if (!p || !p.alive || this.state !== 'playing' || this.swBusy || this.lastFoe || this.kraken.fighting) return;
    this.wanted.hideMark();
    this.setChart(false);
    this.setView(false);
    this.input.releaseLook();
    this.input.enabled = false;
    this.peek.classList.remove('on');
    this.veil.innerHTML = `<span>Coming alongside the ${m.ship.name}…</span>`;
    this.audio.bosunPipe();
    void this.fade(() => {
      const c = this.convoys.convoy;
      if (this.state !== 'playing' || !p.alive || !c || c.scattered || !c.fleet.includes(m)) {
        this.input.enabled = true;
        return;
      }
      this.state = 'docked';
      this.trader = m;
      this.ui.showHud(false);
      this.market.setDock(null);
      p.anchored = true;
      p.sailTarget = 0.25;
      p.rudder = 0;
      p.speed = 0;
      this.convoys.parley(m, p);
      this.syncFleet();
      this.market.open(`The ${m.ship.name}`, `${m.kind.house} · Master ${m.master} · bound for ${c.dest.name}`, m.market, this.holds(), p.gold, this.world.time, { kicker: m.kind.title, wares: this.wareOffers(m) });
      this.dockT = 0;
      this.rig.mode = 'port';
      this.frameTrade(0);
      this.rig.snapShot();
      this.note('trade', `Came alongside the ${m.ship.name}`, m.kind.house);
      this.audio.bell(1, 0.14);
    });
  }

  /** The two ships lying side by side on the swell, seen from off their bows with the panel's room left free. */
  private frameTrade(dt: number) {
    const m = this.trader;
    const p = this.player;
    if (!m || !p) return;
    this.dockT += dt;
    const s = m.ship;
    const fit = this.fitPanel(this.market.panelRect());
    const settle = 1 + 0.8 * Math.exp(-this.dockT * 0.7);
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const px = Math.cos(p.heading);
    const pz = -Math.sin(p.heading);
    const side = (s.pos.x - p.pos.x) * px + (s.pos.z - p.pos.z) * pz >= 0 ? 1 : -1;
    const look = this.rig.shotLook.set((p.pos.x + s.pos.x) * 0.5, 2.4, (p.pos.z + s.pos.z) * 0.5);
    // off the bows, round on your own free beam, swaying slowly
    const a = 0.7 + Math.sin(this.dockT * 0.13) * 0.08;
    const dx = fx * Math.cos(a) - px * side * Math.sin(a);
    const dz = fz * Math.cos(a) - pz * side * Math.sin(a);
    const elev = 0.5;
    const dist = (26 + (p.cls.length + s.cls.length) * 0.72) * fit * settle;
    this.rig.shotPos.set(look.x + dx * Math.cos(elev) * dist, look.y + Math.sin(elev) * dist, look.z + dz * Math.cos(elev) * dist);
  }

  /** Lets go of her: she sails on with her convoy, and you get under way. */
  private leaveTrader(sail: boolean) {
    const p = this.player;
    this.trader = null;
    this.convoys.release();
    this.rig.camera.clearViewOffset();
    this.rig.viewShift.x = this.rig.viewShift.y = 0;
    if (!p || !sail) return;
    p.anchored = false;
    p.speed = 2;
    p.sailTarget = 2 / 3;
    this.state = 'playing';
    this.input.enabled = true;
    this.ui.showHud(true);
    this.rig.mode = 'follow';
    this.rig.snapTo(p.pos);
    this.formFleet();
    this.last = performance.now();
  }

  /** A hold in reach with room for one more of `id`, the flagship's first (bought goods are never stowed by tossing others). */
  private roomFor(id: LootId): Hold | null {
    const size = LOOT[id].size;
    if (this.hold.capacity - this.hold.used >= size) return this.hold;
    const p = this.player;
    if (!p) return null;
    for (const a of this.carriers()) if (Math.hypot(a.ship.pos.x - p.pos.x, a.ship.pos.z - p.pos.z) < 520 && a.hold.capacity - a.hold.used >= size) return a.hold;
    return null;
  }

  private wareOffers(m: Merchant): WareOffer[] {
    return m.wares.filter((w) => w.n > 0).map((w) => ({ ...w, room: !!this.roomFor(w.id) }));
  }

  /** Buys one of a lot off her counter, into whichever hold in the fleet has room. */
  private buyWare(id: LootId) {
    const m = this.trader;
    const p = this.player;
    if (!m || !p || this.state !== 'docked') return;
    const w = m.wares.find((x) => x.id === id && x.n > 0);
    const hold = this.roomFor(id);
    if (!w || !hold || w.price > p.gold) return;
    hold.stow([id]);
    w.n--;
    p.gold -= w.price;
    this.refreshHold();
    this.syncFleet();
    this.market.setGold(p.gold);
    this.market.reholds(this.holds());
    this.market.setWares(this.wareOffers(m), p.gold, id);
    this.audio.purchase('shot');
    this.audio.coin(0, 0.35);
    if (LOOT[id].rarity >= 2) this.note('trade', `Bought ${LOOT[id].name}`, `The ${m.ship.name} · ${w.price.toLocaleString('en-US')} gold`);
  }

  /** `?maelstrom` / `?reef`: set sail just off one, bows on. */
  private testHazard(p: Ship) {
    const m = this.hazards.maelstroms[0];
    const r = this.hazards.reefs[0];
    const at = HAZARD_TEST === 'maelstrom' && m ? { x: m.x, z: m.z, d: m.vortex.r * 1.7 } : r ? { x: r.x, z: r.z, d: r.r + 60 } : null;
    if (!at) return;
    const a = Math.random() * Math.PI * 2;
    const x = at.x + Math.cos(a) * at.d;
    const z = at.z + Math.sin(a) * at.d;
    p.place(x, z, Math.atan2(at.x - x, at.z - z));
    p.speed = p.cls.maxSpeed * 0.5;
  }

  // ------------------------------------------------------------------ the Kraken

  private wireKraken() {
    const k = this.kraken;
    this.krHud = new KrakenHud(document.getElementById('hud')!);
    // a ball may find the Kraken, or the stone of a fort
    this.projectiles.strike = (b) => (k.active && k.strike(b, this.world)) || this.forts.strike(b, this.world) || this.convoys.strike(b, this.world);
    this.projectiles.onBlast = (at, r, dmg, owner) => {
      if (k.active) k.blast(at, r, dmg, owner, this.world);
    };
    k.onHurt = (dmg, at, crit, part, mine) => {
      if (!mine) return;
      if (this.state === 'playing') {
        this.log.hits++;
        this.log.dealt += dmg;
      }
      const [x, y, ok] = this.screenOf(at);
      if (ok) this.ui.floater(part === 'eye' ? `${Math.round(dmg)}!` : `${Math.round(dmg)}`, x, y, part === 'eye' || crit ? 'epic' : '');
    };
    k.onPlayerHit = (dmg, at, kind) => {
      const p = this.player;
      if (!p || !p.alive || this.state !== 'playing') return;
      const dealt = p.damage(dmg, null, this.world, at);
      this.krakenHitT = this.world.time;
      const [x, y, ok] = this.screenOf(at);
      if (ok && dealt >= 1) this.ui.floater(`-${Math.round(dealt)}`, x, y, 'bad');
      if (kind === 'slam') {
        this.rig.shake(0.75);
        this.pipeline.flash(0.14);
      } else this.rig.shake(0.14);
      if (!p.alive) this.onPlayerSunk('hull');
    };
    k.onRise = () => {
      this.krHud.show(true);
      this.krHud.rise();
      this.audio.krakenMusic(true, 0);
      // the moment it breaks the surface plays out slowly
      this.krakenSlowT = 1.8;
      this.pipeline.flash(0.2);
      if (k.docile) setTimeout(() => k.docile && k.fighting && this.ui.toast('It watches you, and waits', 'Leave it be and it sinks away. Fire, and it fights', 4.4), 2600);
    };
    k.onProvoked = () => {
      this.ui.toast('You woke the Kraken', 'Now it fights', 3);
      this.rig.shake(0.5);
      this.pipeline.flash(0.12);
    };
    k.onStage = (n) => {
      this.audio.krakenMusic(true, n);
      this.ui.toast('The Kraken', n === 1 ? 'It thrashes in fury' : 'The sea begins to turn', 3.4);
      this.rig.shake(0.5);
    };
    k.onHead = (up) => {
      if (up) this.ui.toast('Its head breaks the surface', k.docile ? 'It looks you over, unblinking' : 'Strike the eye!', 2.6);
    };
    k.onGrab = (on, freed) => {
      if (on) {
        this.rig.shake(0.6);
        this.pipeline.flash(0.1);
      } else if (freed && this.player?.alive) this.ui.toast('Torn free', 'The arm lets her go', 2.4);
    };
    k.onArmBeaten = (at) => {
      const [x, y, ok] = this.screenOf(at);
      if (ok) this.ui.floater('Arm severed!', x, y - 26, 'rare');
      this.rig.shake(0.3);
    };
    k.onDefeated = (at) => this.slainKraken(at);
    k.onGone = (slain) => {
      this.krHud.show(false);
      this.audio.krakenMusic(false);
      this.atmos.hold = false;
      // a slain beast leaves the seas quiet for longer
      this.krakenCool = slain ? 900 : 480;
      for (const ai of this.ais.values()) ai.fear = null;
      if (!slain && this.player?.alive && this.state === 'playing') this.ui.toast('The Kraken', 'It sinks back into the deep', 3.6);
    };
  }

  /** Summons it on the player now (the omen first). Also handy from the console with `?debug`. */
  summonKraken() {
    const p = this.player;
    if (!p || !p.alive || this.state !== 'playing' || this.kraken.active) return false;
    this.krakenStorm = 'rolled';
    this.kraken.summon(p, 9);
    this.audio.krakenOmen(9);
    this.ui.toast('The sea grows dark', 'Something vast stirs beneath the hull', 4.4);
    return true;
  }

  private updateKraken(dt: number, realDt: number) {
    const k = this.kraken;
    const w = this.world;
    const p = this.player;
    const playing = this.state === 'playing' && !!p && p.alive;
    if (dt > 0) this.krakenCool -= dt;
    if (!k.active) {
      this.gunnery.nMarks = this.krMarkN = 0;
      if (playing && dt > 0 && !this.shore.active) this.watchForKraken(dt, p!);
      return;
    }
    k.update(dt, w, playing ? p : null);
    // the guns lay on its arms and eye like on any ship
    this.gunnery.nMarks = this.krMarkN = k.marks(this.gunnery.marks);
    // every pirate in these waters runs for it
    const dread = k.phase === 'omen' || k.phase === 'fight' ? k.body : null;
    for (const ai of this.ais.values()) ai.fear = dread;
    // the storm won't blow over while it fights
    this.atmos.hold = k.fighting;
    if (this.krakenSlowT > 0 && this.wreck.t < 0) {
      this.krakenSlowT = Math.max(0, this.krakenSlowT - realDt);
      this.timeScale = lerp(1, 0.42, smoothstep(0, 0.5, this.krakenSlowT));
    }
    if (!k.fighting || !playing || this.photo.active) {
      this.krHud.setGrab(null);
      this.krHud.warnings(this.krWarnPx, 0);
      return;
    }
    this.krHud.setHp(k.hp / k.maxHp, k.stage);
    const grip = k.grip;
    this.krHud.setGrab(grip);
    this.krHud.setHint(
      k.docile ? 'It watches you · fire, and it fights' : grip !== null ? 'Break its grip' : k.headUp ? 'Strike the eye!' : k.stage === 2 ? 'Fight the maelstrom · sever its arms' : 'Sever its arms',
      !k.docile && (grip !== null || k.headUp),
    );
    const n = k.warnings(this.krWarn);
    let m = 0;
    for (let i = 0; i < n && m < this.krWarnPx.length; i++) {
      const [x, y, ok] = this.screenOf(this.krWarn[i]);
      if (!ok) continue;
      this.krWarnPx[m].x = x;
      this.krWarnPx[m].y = y;
      m++;
    }
    this.krHud.warnings(this.krWarnPx, m);
  }

  /** Each storm gets one roll of the dice; if it comes, it waits for deep, lonely water. */
  private watchForKraken(dt: number, p: Ship) {
    // the deep stays quiet while captains sail together
    if (this.coop.live) return;
    if (KRAKEN_TEST && this.krakenCool <= 0 && this.voyageTime > 7) {
      this.summonKraken();
      this.krakenCool = 60;
      return;
    }
    const a = this.atmos;
    if (a.kind !== 'storm') {
      this.krakenStorm = 'none';
      return;
    }
    if (this.krakenStorm === 'none' && a.storm > 0.55) {
      this.krakenStorm = this.krakenCool <= 0 && this.voyageTime > 150 && Math.random() < 0.5 ? 'coming' : 'rolled';
      this.krakenWait = 8 + Math.random() * 40;
    }
    if (this.krakenStorm !== 'coming') return;
    this.krakenWait -= dt;
    if (this.krakenWait <= 0 && this.krakenWaters(p)) this.summonKraken();
  }

  /** Deep water all round, and well clear of any harbour. */
  private krakenWaters(p: Ship) {
    // the high seas are the one place it never comes
    if (this.onHighSeas) return false;
    const x = p.pos.x, z = p.pos.z;
    if (Math.hypot(x - this.spawnPoint.x, z - this.spawnPoint.z) < 600) return false;
    const near = this.tradePorts.nearest(x, z);
    if (near && near.d < 520) return false;
    const t = this.terrain;
    if (t.heightAt(x, z) > -14) return false;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      if (t.heightAt(x + Math.sin(ang) * 70, z + Math.cos(ang) * 70) > -12) return false;
    }
    return true;
  }

  /** It's dead: the bounty, the trophies and its hoard rising round the wreckage. */
  private slainKraken(at: THREE.Vector3) {
    const p = this.player;
    this.krHud.show(false);
    this.audio.krakenMusic(false);
    if (!p || !p.alive || this.state !== 'playing') return;
    const x = at.x, z = at.z;
    // a legendary chest with the beak, epics with its ink, and a ring of rares
    this.loot.float(x, z, ['krakenBeak', 'krakenPearl', rollGood(4)], 4);
    this.loot.float(x + 7, z - 5, ['krakenInk', rollGood(3), rollGood(2)], 3);
    this.loot.float(x - 6, z + 6, [rollGood(3), rollGood(3), rollGood(2)], 3);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
      this.loot.float(x + Math.sin(ang) * 15, z + Math.cos(ang) * 15, rollContents(2), 2);
    }
    const bounty = 1500;
    p.gold += bounty;
    p.kills++;
    this.vaultStore.earn(bounty);
    const skin = this.vaultStore.award('skin:kraken');
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
    this.stockAmmo({ shell: 3, fire: 3, chain: 3, grape: 3 }, p.pos.clone().setY(p.root.position.y + 6));
    // and in its ink-black hoard, a showpiece made in its own likeness
    this.stockFireworks({ kraken: 1 }, null);
    this.note('kill', 'Slew the Kraken', `+${bounty} gold · its hoard rose from the deep`);
    const rewards: KrakenReward[] = [
      { art: '', label: `+${bounty.toLocaleString()} gold bounty`, rarity: -1 },
      { art: lootIcon('krakenBeak'), label: LOOT.krakenBeak.name, rarity: 4 },
      { art: lootIcon('krakenInk'), label: LOOT.krakenInk.name, rarity: 3 },
      { art: fireworkIcon('kraken'), label: `${FIREWORKS.kraken.name} showpiece`, rarity: 4 },
    ];
    if (skin) rewards.push({ art: '<span class="kr-skin"></span>', label: skin.fresh ? 'Kraken Ink skin unlocked' : `Kraken Ink skin · +${skin.refund} gold`, rarity: 3 });
    this.krHud.victory(rewards);
    this.audio.treasure(4);
    this.audio.coin();
    this.world.particles.treasure(new THREE.Vector3(x, this.world.waterHeight(x, z), z), RARITY[4].glow, 4);
    this.rig.shake(0.4);
  }

  // ------------------------------------------------------------------ player

  private tryFire(side: Side) {
    const p = this.player!;
    this.syncFw();
    // a special the magazine has run out of: load round shot rather than leave the guns cold
    if (this.ammoStock[p.ammo] <= 0) this.selectAmmo('round', true);
    if (p.ammo === 'firework') return this.fireRockets(side);
    const a = this.gunnery.aim(p, side);
    const shot = p.ammo;
    if (p.fire(side, this.world, a.target, a.point)) {
      if (a.target) this.markedFoe = a.target;
      const sd = side === 'port' ? 1 : -1;
      this.log.shots += p.model.muzzles.filter((m) => m.side === sd).length;
      if (shot !== 'round') {
        this.ammoStock[shot] = Math.max(0, this.ammoStock[shot] - 1);
        if (this.ammoStock[shot] <= 0) {
          this.ui.toast(`Last of the ${AMMO[shot].name.toLowerCase()}`, 'Round shot loaded', 2.6);
          this.selectAmmo('round', true);
        }
      }
    } else this.ui.flashBroadside(side);
  }

  /** Fireworks loaded: a rocket off each chosen gun, and one volley out of the locker. */
  private fireRockets(side: Side) {
    const p = this.player!;
    const id = this.fwType;
    p.firework = id;
    if (!p.fire(side, this.world, null, null)) {
      this.ui.flashBroadside(side);
      return;
    }
    this.ui.closeFwPicker();
    this.fwLocker.take(id);
    if (FIREWORKS[id].tier === 2) this.note('trade', `Lit the ${FIREWORKS[id].name}`, 'A showpiece over the sea');
    if (this.fwLocker.count(id) > 0) return this.syncFw();
    const next = this.fwLocker.next(id);
    if (next) {
      this.fwType = p.firework = next;
      this.syncFw();
      this.ui.toast(`That was the last ${FIREWORKS[id].name}`, `${FIREWORKS[next].name} loaded`, 2.6);
    } else {
      this.syncFw();
      this.ui.toast('The firework locker is empty', 'Round shot loaded · trading ports have a pyrotechnist', 3.2);
      this.selectAmmo('round', true);
    }
  }

  /** The rack's count for fireworks is the kind loaded. */
  private syncFw() {
    this.ammoStock.firework = this.fwLocker.count(this.fwType);
  }

  /** Load a kind of shot for the next broadsides. Specials need some aboard. */
  private selectAmmo(id: AmmoId, quiet = false) {
    const p = this.player;
    if (!p || !p.alive || (this.state !== 'playing' && this.state !== 'paused')) return;
    if (id === 'firework') {
      // 6 again with rockets already loaded: the next kind in the locker
      if (p.ammo === 'firework' && !quiet) return this.cycleFirework();
      if (this.fwLocker.count(this.fwType) <= 0) this.fwType = this.fwLocker.next(this.fwType) ?? this.fwType;
      this.syncFw();
    }
    if (this.ammoStock[id] <= 0) {
      this.ui.ammoDenied(id);
      if (!quiet) {
        if (id === 'firework') this.ui.toast('The firework locker is empty', 'Pyrotechnists in the trading ports sell them, and fine chests hide a few', 3);
        else this.ui.toast(`No ${AMMO[id].name.toLowerCase()} left`, 'Salvage, chests and new isles restock the magazine', 2.8);
      }
      return;
    }
    if (id === 'firework') p.firework = this.fwType;
    if (p.ammo === id) {
      if (!quiet) this.ui.showTag(id, true, this.fwType);
      return;
    }
    p.ammo = id;
    if (!quiet) {
      this.audio.ammoSwap(AMMO_ORDER.indexOf(id));
      this.ui.showTag(id, true, this.fwType);
    }
  }

  /** The next kind of firework in the locker. */
  private cycleFirework() {
    const next = this.fwLocker.next(this.fwType);
    if (next) this.chooseFirework(next);
  }

  /** A kind picked from the locker: loaded at once (fireworks too, if shot was in the guns). */
  private chooseFirework(id: FireworkId) {
    const p = this.player;
    if (!p || !p.alive || (this.state !== 'playing' && this.state !== 'paused')) return;
    if (this.fwLocker.count(id) <= 0) {
      this.ui.ammoDenied('firework');
      return;
    }
    const same = p.ammo === 'firework' && this.fwType === id;
    this.fwType = p.firework = id;
    p.ammo = 'firework';
    this.syncFw();
    if (!same) this.audio.ammoSwap(AMMO_ORDER.indexOf('firework'));
    this.ui.showTag('firework', true, id);
  }

  /** Fireworks found or bought: into the locker, with a "+n" off the rack. */
  private stockFireworks(add: FireworkCounts, at: THREE.Vector3 | null) {
    const got = this.fwLocker.add(add);
    let line = '';
    let n = 0;
    let show: FireworkId | null = null;
    for (const id of FW_ORDER) {
      const k = got[id] ?? 0;
      if (!k) continue;
      n += k;
      if (FIREWORKS[id].tier === 2) show = id;
      line += `${line ? ' · ' : ''}+${k} ${FIREWORKS[id].short}`;
    }
    if (!n) return '';
    if (this.fwLocker.count(this.fwType) <= 0) this.fwType = this.fwLocker.next(this.fwType) ?? this.fwType;
    this.syncFw();
    this.ui.ammoGain('firework', n);
    if (at) {
      const [x, y, ok] = this.screenOf(at);
      if (ok) this.ui.floater(line, x, y - 44, show ? 'legendary' : 'ammo');
    }
    if (show && this.state === 'playing') {
      this.ui.toast(`A showpiece: ${FIREWORKS[show].name}`, this.input.isTouch ? 'Pick it from the fireworks in the shot fan' : 'Load fireworks (6) and pick it from the locker', 4.5);
      this.audio.treasure(3);
    }
    return line;
  }

  /** The first night at sea with rockets aboard: say how to light them, once per device. */
  private fireworkTip() {
    if (this.fwTipShown || globalUniforms.uNight.value < 0.6 || this.fwLocker.total <= 0 || this.gunnery.combat) return;
    this.fwTipShown = true;
    try {
      if (localStorage.getItem('aquati.fwTip') === '1') return;
      localStorage.setItem('aquati.fwTip', '1');
    } catch {
      /* private mode: show it anyway */
    }
    const how = this.input.isTouch ? 'Tap the shot button, choose the rocket, then fire a broadside' : 'Press 6 to load fireworks (6 again picks another kind), then fire a broadside';
    this.ui.toast('A fine night for fireworks', how, 6);
  }

  /** R: the next kind of shot that's aboard. */
  private cycleAmmo() {
    const p = this.player;
    if (!p) return;
    this.syncFw();
    const i = AMMO_ORDER.indexOf(p.ammo);
    for (let k = 1; k <= AMMO_ORDER.length; k++) {
      const id = AMMO_ORDER[(i + k) % AMMO_ORDER.length];
      if (this.ammoStock[id] > 0) return this.selectAmmo(id);
    }
  }

  /** Shot found in salvage or given by islanders. */
  private stockAmmo(add: Partial<AmmoStock>, at: THREE.Vector3 | null) {
    let line = '';
    for (const id of SPECIALS) {
      const n = add[id] ?? 0;
      if (n <= 0) continue;
      const before = this.ammoStock[id];
      this.ammoStock[id] = Math.min(AMMO[id].max, before + n);
      const got = this.ammoStock[id] - before;
      if (got <= 0) continue;
      this.ui.ammoGain(id, got);
      line += `${line ? ' · ' : ''}+${got} ${AMMO[id].short}`;
    }
    if (line && at) {
      const [x, y, ok] = this.screenOf(at);
      if (ok) this.ui.floater(line, x, y - 22, 'ammo');
    }
    return line;
  }

  /** One-button fire: the loaded side with a foe in its arc, else the side facing the nearest foe. */
  private fireAuto() {
    const p = this.player!;
    const side = this.gunnery.autoSide(p) ?? (p.canFire('port') || !p.canFire('starboard') ? 'port' : 'starboard');
    this.tryFire(side);
  }

  /** A side's guns are run out again mid-fight: a knock from the gun deck and a glint on its button. */
  private onGunsReady(side: Side) {
    const p = this.player;
    if (!p) return;
    const a = p.heading + (side === 'port' ? 1 : -1) * (Math.PI / 2);
    this.audio.gunsReady(Math.sin(a) * 0.6);
    this.ui.gunsReady(side);
  }

  /** The first fight of a voyage on this device: explain the guns once. */
  private gunTip() {
    if (this.gunTipShown || !this.gunnery.combat) return;
    this.gunTipShown = true;
    try {
      if (localStorage.getItem('aquati.gunTip') === '1') return;
      localStorage.setItem('aquati.gunTip', '1');
    } catch {
      /* private mode: show it anyway */
    }
    const how = this.input.isTouch ? 'then tap Fire' : 'then click, or press Q / E';
    this.ui.toast('Guns fire to the sides', `Turn until a foe is off your beam and warm light gathers around her, ${how}`, 5.5);
    // and a little later, the shot rack
    const pick = this.input.isTouch ? 'Tap the shot button above Fire' : 'Press 1 to 6, or click the rack';
    setTimeout(() => {
      if (this.state === 'playing') this.ui.toast('Choose your shot', `${pick}: shells burst, fire burns, chain shreds sails, grape cuts down crews`, 6);
    }, 7000);
  }

  private controlPlayer(dt: number) {
    const p = this.player;
    const st = this.input.state;
    if (!p || !p.alive) return;
    // ashore, or grappling a prize: the helmsman stands down
    if (this.pilot.state !== 'idle' && (this.shore.active || this.boarding.busy)) this.pilot.disengage();
    if (this.shore.active) {
      this.controlShore();
      return;
    }
    if (this.boarding.busy) {
      // the hooks are flying: the helm and the guns wait
      if (st.pause) this.setPaused(true);
      return;
    }
    if (st.view) this.setView(!this.fpv);
    if (this.fpv) {
      if (st.helm) this.captain.toggleHelm();
      this.input.helmMode = this.captain.atHelm;
      this.captain.spyWanted = st.spy;
    }
    // a hand on the wheel (or the touch helm) takes it back from the helmsman
    if (this.pilot.active && (st.rudder !== 0 || st.steerHeading !== null)) this.stopPilot('You have the helm');
    if (this.pilot.active && (st.sailDelta || st.sailSet >= 0)) {
      // under the helmsman the captain still sets the canvas he cruises under; furling it all stops her
      let c = this.pilot.cruise;
      if (st.sailDelta) c = clamp(Math.round(c * 3 + st.sailDelta) / 3, 0, 1);
      if (st.sailSet >= 0) c = clamp(st.sailSet, 0, 3) / 3;
      if (c > 0) this.pilot.cruise = p.sailTarget = c;
      else {
        this.stopPilot('Sails furled');
        p.sailTarget = 0;
      }
    } else {
      if (st.sailDelta) p.sailTarget = clamp(Math.round(p.sailTarget * 3 + st.sailDelta) / 3, 0, 1);
      if (st.sailSet >= 0) p.sailTarget = clamp(st.sailSet, 0, 3) / 3;
    }
    // the touch helm only steers: the sails stay wherever the lever (or W / S) left them
    if (st.steerHeading !== null && !this.fpv) {
      p.rudder = clamp(angleDelta(p.heading, st.steerHeading) * 2.4, -1, 1);
      this.input.helmShow(p.heading, st.steerHeading);
    } else p.rudder = st.rudder;
    if (this.pilot.state !== 'idle') this.steerPilot(p, dt);
    if (st.ammoPick >= 0) this.selectAmmo(AMMO_ORDER[st.ammoPick]);
    if (st.ammoNext) this.cycleAmmo();
    if (st.fleet) this.cycleOrder();
    if (st.firePort) this.tryFire('port');
    if (st.fireStarboard) this.tryFire('starboard');
    if (st.fireAuto) {
      // from the deck you fire the beam you're facing
      const ls = this.fpv ? this.captain.lookSide() : 0;
      if (ls) this.tryFire(ls > 0 ? 'port' : 'starboard');
      else this.fireAuto();
    }
    if (st.fireAim) {
      // a click fires the side you point into, at what you point at
      const hs = this.gunnery.hoverSide();
      if (hs) this.tryFire(hs);
      else this.fireAuto();
    }
    if (st.zoom && !this.fpv) this.rig.zoomBy(st.zoom, performance.now() / 1000);
    if (st.pause) {
      if (this.mapUi.isOpen) this.setMapView(false);
      else if (this.chartOpen) this.setChart(false);
      else this.setPaused(true);
    } else if (st.map) this.setChart(!this.chartOpen);
    else if (st.treasure) this.setMapView(!this.mapUi.isOpen);
    else if (st.photo) this.openPhoto();
  }

  // ------------------------------------------------------------------ frame

  /**
   * `vsync` is the frame's own timestamp from requestAnimationFrame: steady,
   * where reading the clock once the callback finally runs wobbles by however
   * late the browser got round to it. Motion paced by that wobble lands on
   * an even vsync grid uneven, a judder that shows only while things move.
   */
  private frame(vsync = performance.now()) {
    const now = performance.now();
    let dt = Math.max(0, (vsync - this.last) / 1000);
    this.last = vsync;
    const P = this.prof;
    P.tick(now);
    this.fps = P.fps;
    // a frame is shown a whole number of refreshes after the last: snap a
    // near miss onto that grid, so the camera moves the same each refresh
    // (the scaler learns the refresh rate from the raw intervals)
    if (this.scaler.sample(Math.min(dt, 0.05), this.cpuMs)) this.resize();
    const slot = this.scaler.slotMs / 1000;
    const n = Math.round(dt / slot);
    if (n >= 1 && n <= 3 && Math.abs(dt - n * slot) < slot * 0.12) dt = n * slot;
    dt = Math.min(dt, 0.05);
    // Auto's last resort: still slow at the lowest resolution, so shed effects
    if (this.scaler.pressure >= 2) {
      this.scaler.pressure = 0;
      this.settings.stepDown();
    }
    P.begin('Sinking & wrecks', 'sim');
    this.updateWreck(dt);
    P.end();
    // a shared sea never stops or slows for one captain (photo mode still holds it, briefly)
    const frozen = this.state === 'loading' || (this.state === 'paused' && (!this.coop.live || this.photo.active));
    const simDt = frozen ? 0 : dt * (this.coop.live ? 1 : this.timeScale);
    this.update(simDt, dt);
    this.render(simDt);
    if (import.meta.env.DEV) this.watchPrograms();
    this.input.consume();
    P.frameEnd();
    this.cpuMs = performance.now() - now;
  }

  private progCount = 0;
  /** Dev builds: names any shader that compiles mid-voyage (each is a stall; see render/warmup.ts). */
  private watchPrograms() {
    const list = this.renderer.info.programs;
    if (!list) return;
    if (list.length > this.progCount && this.progCount && this.state === 'playing') {
      for (const p of list.slice(this.progCount)) console.warn('[aquati] shader compiled mid-voyage:', p.name || p.cacheKey.slice(0, 120));
    }
    this.progCount = list.length;
  }

  /** Main-thread time the last frame took (ms): tells the resolution scaler whether pixels are the problem. */
  private cpuMs = 0;
  /** Time until the minimap's next redraw. */
  private mapT = 0;

  /**
   * Word of the next feast night (tonight's, or the one under way): the towns
   * keeping it, the feast's name and a line about it. For anything that brings
   * the news, a carrier gull say. null when no town keeps one.
   */
  festivalNews() {
    return this.festivals.news(this.atmos.day, this.atmos.moonPhase);
  }

  private update(dt: number, realDt: number) {
    const w = this.world;
    const P = this.prof;
    w.time += dt;
    globalUniforms.uTime.value = w.time;
    P.begin('Weather & sea state', 'sim');
    this.updateWeather(dt);
    P.end();

    P.begin('Input & helm', 'sim');
    this.input.poll();
    // docked, sunk, back in harbour: the helmsman's watch is over
    if (this.pilot.state !== 'idle' && this.state !== 'playing' && this.state !== 'paused') this.pilot.disengage();
    if (this.state === 'playing') {
      this.controlPlayer(dt);
      this.voyageTime += dt;
      const pl = this.player;
      if (pl) this.log.metres += Math.abs(pl.speed) * dt;
    } else if (this.state === 'paused' && !this.photo.active) {
      if (this.input.state.pause) this.setPaused(false);
      else if (this.input.state.photo) this.openPhoto();
    }

    // the shipwright's ship stays tied up at the quay
    const inPort = this.state === 'port' && this.preview;
    if (inPort) this.port.pin(this.preview!);
    const docked = this.state === 'docked' && this.player && this.dockPort;
    P.end();

    // AI & ships
    P.begin('Pirate AI', 'ships');
    // a ship at anchor with her captain ashore is left be
    const prey = this.player && this.player.alive && this.state !== 'docked' && !this.shore.active ? this.player : null;
    // a ship fast in our grapnels has other things on her mind than sailing
    const lashed = this.boarding.prize;
    // your escorts stand guard even while you're ashore or on a prize's deck, and can be fought there
    this.updateFleet(dt);
    // the other captains' ships come and go, are steered onto their owners' tracks, and hear ours
    this.coop.update(dt);
    const hunt = this.hunt;
    hunt.length = 0;
    if (this.state === 'playing') for (const s of this.escortShips) hunt.push(s);
    this.coop.mates(hunt);
    for (const ai of this.ais.values()) if (ai.ship !== lashed) ai.update(dt, w, prey, this.ships, hunt);
    P.end();
    P.begin('Maelstroms & reefs', 'ships');
    this.hazards.update(dt, w, this.ships, this.loot.all(), this.rig.target, globalUniforms.uStorm.value);
    P.end();
    P.begin('Ship physics & rigging', 'ships');
    if (dt > 0) this.boarding.pin(dt);
    if (dt > 0) for (const s of this.ships) s.update(dt, w);
    this.sailConvoys(dt);
    let hulls = this.convoys.with(this.ships, this.afloat);
    P.end();
    P.begin('Collisions', 'ships');
    this.collisions.resolve(hulls, w);
    for (const s of this.ships.slice()) if (s.removed && s !== this.player) this.removeShip(s);
    this.retireWrecks();
    P.end();
    P.begin('Cannonballs', 'ships');
    this.projectiles.update(dt, w, this.ships);
    P.end();
    P.begin('Kraken', 'ships');
    this.updateKraken(dt, realDt);
    P.end();
    P.begin('Forts', 'ships');
    const target = this.player && this.player.alive && this.state === 'playing' && this.wreck.t < 0 ? this.player : null;
    if (dt > 0) this.forts.update(dt, w, target, this.ships, this.rig.target);
    // her guns lay on the forts' guns too, wherever she can reach them
    if (target && !this.shore.active) this.gunnery.nMarks = this.forts.marks(this.gunnery.marks, this.gunnery.nMarks, target, gunRange(target.muzzleSpeed), w.peaceful ? { now: w.time, riledOnly: false } : null);
    P.end();
    P.begin('Debris & flotsam', 'fx');
    this.pushers.length = 0;
    for (const s of this.ships) if (s.alive || s.sinkT < 20) this.pushers.push({ pos: s.pos, heading: s.heading, length: s.cls.length, beam: s.cls.beam, speed: s.speed });
    this.debris.update(dt, w, this.pushers);
    this.lanterns.update(dt, w, this.pushers);
    P.end();
    P.begin('Shore & landing party', 'sim');
    this.shore.update(dt, w, this.shoreIn, this.rig.target);
    this.shoreIn.strike = this.shoreIn.pistol = false;
    this.shoreIn.aim = null;
    this.boarding.update(dt, w, this.shore.deck ? (o) => this.shore.swingLines(o) : null, this.player);
    if (this.shore.deck && this.player && !this.player.alive) {
      // our own ship burnt out from under us: everyone is back aboard for the end
      this.leaveShore();
      this.boarding.part();
    } else if (this.shore.deck && !this.swBusy && this.state === 'playing') {
      // a burning prize can founder under the boarders' feet
      const e = this.shore.prize;
      if (e && !e.alive) this.endBoarding('sinking');
    }
    P.end();
    P.begin('Shipyard (prebuilds)', 'ships');
    if (dt > 0) this.runShipyard();
    P.end();
    P.begin('Trading ports', 'sim');
    this.tradePorts.update(dt, w, this.player, this.rig.camera.position, this.ships);
    this.festivals.update(dt, realDt, w, this.atmos.day, this.atmos.moonPhase, this.rig.camera.position, this.state === 'playing' || this.state === 'docked');
    if (docked) {
      this.dockPort!.pin(this.player!);
      this.market.tick(realDt, w.time);
      this.frameDock(realDt);
    } else if (this.state === 'docked' && this.trader) {
      this.market.tick(realDt, w.time);
      this.frameTrade(realDt);
    }
    P.end();
    if (inPort) {
      P.begin('Harbour', 'sim');
      this.port.update(dt, w);
      this.shipwright.tick(realDt);
      if (!this.vaultOn) this.framePort(realDt);
      P.end();
    }
    if (this.vstage.active) {
      P.begin('Treasure vault', 'sim');
      this.vstage.update(dt, w, this.particles);
      if (this.vaultOn) this.frameVault(realDt);
      P.end();
    }

    // player-centric systems
    P.begin('Loot, spawns & discovery', 'sim');
    const p = this.player;
    if (p && this.state === 'playing') {
      if (p.alive && w.time - p.lastHit > 9) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.01 * dt);
      // a full hold leaves what it can't take bobbing on the swell
      const refuse = (it: { goods: LootId[] }) => {
        if (this.fleetWouldKeep(it.goods)) return false;
        this.nagHold();
        return true;
      };
      const got = this.loot.update(dt, w, p.alive ? p.pos : null, (p.cls.beam * 0.5 + 5) * 2, refuse);
      for (const it of got) this.haul(p, it);
      const bottles = this.drift.update(dt, w, p.alive ? p.pos : null, (p.cls.beam * 0.5 + 5) * 2, this.ships, { ship: p.alive && !this.shore.active ? p : null, highSeas: this.onHighSeas });
      for (const b of bottles) this.openBottle(p, b);
      this.updateTidings(p, dt);
      if (p.alive) this.sweepSalvage(p, dt);
      this.holdNagT -= dt;
      if (!this.shore.active) {
        // with the grapnels flying, nothing else is on offer
        const docking = this.boarding.busy ? true : this.updateDockPrompt(p);
        if (this.boarding.busy || !this.updateBoardPrompt(p, dt)) {
          if (docking || !this.updateRescuePrompt(p, dt)) this.updateLandPrompt(p, dt, docking);
        }
        // hunters follow the host's infamy (a guest's sea is the host's to fill)
        if (!this.coop.guest) this.updateHunters(dt);
      }
      this.checkDiscoveries(p);
      this.updateForts(p, dt);
      this.updateHazards(p, dt);
      this.updatePeace(p);
      // rammed or holed on a reef: no cannonball to report it
      if (!p.alive) this.onPlayerSunk('hull');
      this.audio.setSailing(clamp(p.speed / 14, 0, 1));
    } else {
      this.loot.update(dt, w, null, 0);
      this.drift.update(dt, w, null, 0, this.ships, { ship: null, highSeas: this.onHighSeas });
    }
    this.survivors.update(dt, w, this.rig.target);
    // fresh pirates gather round every captain at sea (none round one who's ashore)
    if (!this.coop.guest) this.directSpawns(dt);
    // on foot ashore, it is the captain who walks into a pin
    const onFoot = this.shore.active ? this.shore.captain : null;
    const reached = this.waypoints.update(dt, p && p.alive && this.state === 'playing' ? (onFoot ?? p.pos) : null, (x, z) => this.terrain.heightAt(x, z));
    if (reached) {
      this.ui.toast('Waypoint reached', `${this.waypoints.pins.length ? `${this.waypoints.pins.length} more on the chart` : 'The chart is clear'}`, 3);
      this.audio.chime();
      this.world.particles.sparkle(_a.set(reached.x, w.waterHeight(reached.x, reached.z), reached.z), PIN_COLORS[reached.hue].glow, 2);
    }
    this.waypoints.fx.visible = this.state === 'playing' || this.state === 'paused' || this.state === 'docked' || this.state === 'dead';

    P.end();

    // volcano plume: a lazy white wisp, or in a restless spell a dark column
    // of ash bent over downwind, with embers spat glowing from the crater
    this.smokeT += dt;
    const rest = this.rare.restless;
    if (this.smokeT > 0.32 - rest * 0.14) {
      this.smokeT = 0;
      const v = this.terrain.islands[0];
      const top = this.terrain.heightAt(v.x, v.z);
      const g0 = 1.05 - rest * 0.62;
      const lean = 0.6 + rest * 2.2;
      this.particles.emit({
        x: v.x + (Math.random() - 0.5) * 8, y: top + 4, z: v.z + (Math.random() - 0.5) * 8,
        vx: w.wind.dirX * lean, vy: 3 + Math.random() * 2 + rest * 2, vz: w.wind.dirZ * lean,
        life: 16 + Math.random() * 6 + rest * 8, size: 8 + rest * 4, sizeEnd: 34 + rest * 30, color: [g0, g0 * 0.98, g0 * 0.96], colorEnd: [0.95 - rest * 0.5, 0.95 - rest * 0.52, 0.97 - rest * 0.52],
        alpha: 0.3 + rest * 0.25, drag: 0.08, kind: 1, spin: (Math.random() - 0.5) * 0.1, fadeIn: 2,
      });
      if (rest > 0.3 && Math.random() < rest * 0.8) {
        for (let i = 0; i < 3; i++) {
          this.particles.emit({
            x: v.x + (Math.random() - 0.5) * 6, y: top + 2, z: v.z + (Math.random() - 0.5) * 6,
            vx: (Math.random() - 0.5) * 7 + w.wind.dirX * 2, vy: 9 + Math.random() * 9, vz: (Math.random() - 0.5) * 7 + w.wind.dirZ * 2,
            life: 2.5 + Math.random() * 2, size: 2, sizeEnd: 0.6, color: [7, 2.6, 0.5], colorEnd: [2.2, 0.35, 0.05], grav: 6, drag: 0.25, kind: 2, fadeIn: 0.01,
          }, true);
        }
      }
    }

    // camera
    P.begin('Camera & captain', 'sim');
    const focusShip = p ?? this.preview;
    const walker = this.shore.active ? this.shore.captain : null;
    // ashore the camera follows the captain, at the height of the ground (never below the sea)
    const fpos = walker ? this.shoreFocus.set(walker.x, Math.max(walker.y, -0.2) + 1, walker.z) : focusShip ? focusShip.pos : this.spawnPoint;
    const fvel = walker ? this.shoreVel.set(walker.vx, 0, walker.vz) : focusShip && this.rig.mode === 'follow' ? focusShip.vel : new THREE.Vector3();
    if (this.preview) this.rig.orbitCenter.set(this.preview.pos.x, this.preview.root.position.y, this.preview.pos.z);
    this.updateCaptain(dt);
    if (walker) this.updateFootEye(realDt, walker);
    if (this.photo.active) {
      const ph = this.photo;
      ph.cam.ground = (x, z) => Math.max(this.terrain.heightAt(x, z) + 1.4, w.waterHeight(x, z) + 0.9);
      ph.update(realDt, this.rig.camera);
      // shadows, the sea and the crews gather round what the lens looks at
      const fp = ph.cam.focusPoint;
      this.rig.target.set(fp.x, 0, fp.z);
      this.rig.photoDist = Math.min(ph.cam.shownDist, 320);
      // auto-focus settles on whatever sits mid-frame
      const af = this.pickDepth(0, 0) ?? ph.cam.shownDist;
      ph.autoFocus += (af - ph.autoFocus) * Math.min(1, realDt * 8);
      // the captain stands at the helm in the shot, even seen from their own eyes
      if (this.captain.ship) this.captain.pilot.hidden = false;
    } else this.rig.update(realDt, fpos, fvel, w.time, (this.state === 'playing' || this.state === 'paused') && !walker ? this.battleFoe() : null);
    const eb = this.rig.eyeBlend;
    if (eb > 0) {
      // hear the sea from where you stand, panned to where you face
      w.listener.lerpVectors(this.rig.target, this.rig.camera.position, eb);
      const e = this.rig.camera.matrixWorld.elements;
      const rl = Math.hypot(e[0], e[2]) || 1;
      w.listenerRight.set(1 + (e[0] / rl - 1) * eb, (e[2] / rl) * eb).normalize();
    } else {
      w.listener.copy(this.rig.target);
      w.listenerRight.set(1, 0);
    }
    w.listenerZoom = this.rig.distance;
    this.hazards.sound(w);
    this.updateSeas(dt);
    // ashore, the leaves between the camera and the captain thin away (not once you're behind their eyes)
    const see = globalUniforms.uSeeThru.value;
    if (walker && !this.photo.active && eb < 0.9) see.set(walker.x, walker.y + 1.1, walker.z, clamp(this.rig.distance * 0.13, 2.6, 5.5) * (1 - eb));
    else see.w = 0;
    // the hands follow the camera wherever it went this frame
    const sh = this.shore;
    sh.hands.update(realDt, this.rig.camera, walker, this.photo.active ? 0 : eb, this.eyeLook.x, this.eyeLook.y, sh.pistolLoad, w);
    this.eyeLook.x = this.eyeLook.y = 0;
    P.end();
    // the spyglass can pick out a crew at the far side of a battle
    P.begin('Crew', 'ships');
    this.crew.setView(this.rig.camera, this.toSun);
    hulls = this.convoys.with(this.ships, this.afloat);
    this.crew.update(dt, w, hulls, this.rig.target, this.rig.groundRadius() * 1.5 + eb * 260, this.rig.camera.position, this.rig.camera.fov / this.rig.camera.zoom);
    // laid rope, blocks and deck clutter only on ships big enough on screen to show them
    const cam = this.rig.camera;
    const pxK = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / cam.zoom);
    for (const s of hulls) s.model.updateDetail(pxK / Math.max(1, cam.position.distanceTo(s.root.position)));
    P.end();

    // gusts roll across whatever the camera is looking at
    P.begin('Wind & gusts', 'fx');
    const reach = clamp(this.rig.distance * 0.9, 70, 260);
    const tgt = this.rig.target;
    this.windField.update(dt, tgt.x, tgt.z, reach);
    this.wisps.update(dt, tgt.x, tgt.z, reach, this.rig.camera, w.wind.dirX, w.wind.dirZ);
    const gustHere = this.windField.at(fpos.x, fpos.z);
    this.audio.setGust(gustHere);
    this.ui.setGust(gustHere);
    P.end();

    P.begin('Rain, lightning & sky FX', 'fx');
    this.updateSkyFx(dt);
    P.end();
    P.begin('Particles', 'fx');
    this.particles.update(dt);
    this.fireworks.view(this.rig.camera, this.rig.distance, this.rig.eyeBlend, innerHeight);
    this.fireworks.update(dt);
    this.spirits.update(dt, w.time);
    P.end();
    P.begin('Birds', 'fx');
    this.birds.update(dt, w, hulls, this.rig.camera);
    P.end();
    P.begin('Reef fish', 'fx');
    this.reef.update(dt, w, this.ships, this.rig.camera);
    P.end();
    P.begin('Wildlife', 'fx');
    {
      const sh = this.shore;
      const feet = sh.active ? sh.party.map((m) => m.walker).filter((wk) => wk.visible) : [];
      const c = this.rig.camera;
      const k = innerHeight / ((2 * Math.tan(THREE.MathUtils.degToRad(c.fov / 2))) / c.zoom);
      this.wild.update(dt, w, this.ships, c, this.rig.target, feet, this.atmos, k);
    }
    P.end();
    this.pipeline.decayFlash(realDt);
    P.begin('Gunnery & aiming', 'ships');
    const ashore = this.shore.active;
    this.gunnery.setPointer(this.fpv || ashore ? null : this.input.state.pointer, this.rig.camera);
    // the lock-on glow fades out of a photo even though the world is frozen
    this.gunnery.update(this.photo.active ? realDt : dt, p, this.ships, w, this.state === 'playing' && !ashore);
    if (this.state === 'playing' && !ashore) this.gunTip();
    P.end();

    // HUD
    P.begin('HUD, minimap & chart', 'ui');
    if (p && (this.state === 'playing' || this.state === 'paused') && !this.photo.active) {
      this.ui.updateHud(p, this.discovered.size, this.terrain.islands.length);
      const hv = this.pilot.view(p);
      this.ui.helmHud.set(hv && { name: hv.target.name, left: hv.left, done: hv.done, eta: hv.eta, how: hv.how, arrived: hv.arrived }, p.rudder, realDt);
      this.ui.updateGunnery(this.gunnery.sides, p.alive ? this.gunnery.autoSide(p) : null);
      this.syncFw();
      this.ui.updateAmmo(p.ammo, this.ammoStock, this.fwType);
      if (this.state === 'playing') this.fireworkTip();
      // the fleet panel, and the crossed swords over whoever the escorts are fighting
      const rows = this.fleetRows;
      rows.length = 0;
      let marked: Ship | null = null;
      for (const [s, ai] of this.escorts) {
        if (s.removed) continue;
        rows.push({ id: s.id, name: s.name, cls: s.cls.id, prize: ai.rec.origin === 'prize', hp: s.hp, max: s.maxHp, status: ai.status(), fighting: ai.mode === 'fight' });
        if (!marked && ai.mode === 'fight' && ai.target && (ai.order === 'attack' || ai.target === this.markedFoe)) marked = ai.target;
      }
      this.fleetHud.setRows(rows);
      this.fleetHud.show(rows.length > 0);
      this.ui.updateBars(this.ships, p, this.rig.camera, innerWidth, innerHeight, this.boarding.prize, marked);
      const cap = this.shore.captain;
      // the minimap is a 2D canvas redrawn from scratch (sea chart, coasts,
      // every marker): 20 times a second reads as smooth at its size and
      // takes a big slice of main-thread time off every frame
      this.mapT -= realDt;
      if (this.mapT <= 0) {
        this.mapT = 0.05;
        const camps = this.shore.camps.filter((c) => !c.fort).map((c) => ({ x: c.site.x, z: c.site.z, routed: c.routed }));
        this.ui.drawMap(p, hulls, this.loot.all(), this.terrain.islands, this.discovered, this.tradePorts.ports, camps, ashore && cap ? { x: cap.x, z: cap.z, yaw: cap.yaw } : null, this.waypoints.pins, this.maps.target, this.fortMarks(), this.hzMarks, this.pilot.route(p.pos));
      }
      this.ui.updatePins(this.waypoints.pins.map((pin) => ({ ...pin, y: Math.max(0, this.terrain.heightAt(pin.x, pin.z)) })), ashore && cap ? cap : p.pos, this.rig.camera, innerWidth, innerHeight);
      if (ashore) this.updateShoreHud(p);
      const tx = this.maps.target;
      if (tx) this.mapX.set(tx.x, Math.max(0, this.terrain.heightAt(tx.x, tx.z)), tx.z);
      this.mapUi.setChip(this.maps.state, ashore && cap ? cap : p.pos, tx ? this.mapX : null, this.rig.camera);
      this.mapUi.setDig(ashore ? this.shore.digView : null);
    }
    if (p && this.chartOpen && this.chartSel) {
      // the card's distance runs down as she sails, and its button follows the helmsman
      const sel = this.chartSel;
      if (sel.pin && !this.waypoints.pins.includes(sel.pin)) this.closeChartCard();
      else {
        this.ui.chartCard.setSub(this.cardSub(sel.target));
        const b = this.boundFor(sel.target);
        if (b !== sel.card.bound) this.ui.chartCard.setBound((sel.card.bound = b));
      }
    }
    if (p && this.chartOpen) {
      this.ui.drawChart({
        player: p, ships: this.convoys.with(this.ships, this.afloat), loot: this.loot.all(), islands: this.terrain.islands, discovered: this.discovered,
        ports: this.tradePorts.ports.map((tp) => ({ x: tp.x, z: tp.z, name: tp.name, festive: tp.festive > 0.3 })),
        pins: this.waypoints.pins,
        treasure: this.maps.target,
        forts: this.fortMarks().map((f, i) => ({ ...f, name: this.forts.forts[i].name })),
        hazards: this.hzMarks,
        route: this.pilot.route(p.pos),
        selected: this.chartSel && { x: this.chartSel.target.x, z: this.chartSel.target.z, css: this.chartSel.css },
        charted: new Set(Object.keys(this.charts.state.seen)),
        windX: w.wind.dirX, windZ: w.wind.dirZ, time: performance.now() / 1000,
      });
    }
    this.ui.tickFloaters(realDt);
    P.end();
  }

  /** The landing party's health, the pill, the pistol's reload and bars over the foes. */
  private updateShoreHud(p: Ship) {
    const sh = this.shore;
    const rows = this.partyRows;
    rows.length = sh.party.length;
    sh.party.forEach((m, i) => {
      const r = (rows[i] ??= { name: '', hp: 0, max: 1, down: false });
      r.name = m.name;
      r.hp = m.walker.hp;
      r.max = m.walker.maxHp;
      r.down = m.walker.down;
    });
    this.shoreHud.setParty(rows);
    this.shoreHud.setPrompt(sh.prompt(p.name));
    this.shoreHud.setPistol(sh.pistolLoad);
    const bars = this.foeBars;
    bars.length = 0;
    for (const f of sh.foes) {
      if (f.down || f.hp >= f.maxHp) continue;
      bars.push({ id: f.id, x: f.x, y: f.y + 2.25 * f.height, z: f.z, hp: f.hp, max: f.maxHp, boss: f.maxHp > 100, label: f.title });
    }
    this.shoreHud.updateBars(bars, this.rig.camera, innerWidth, innerHeight);
  }

  /**
   * Ashore: drops the camera into the captain's eyes (or lifts it out), poses
   * the head on their gait, hides their own figure from themselves and keeps
   * the sight and the first-person chrome in step.
   */
  private updateFootEye(dt: number, cap: Walker) {
    const sh = this.shore;
    this.eyeWait = Math.max(0, this.eyeWait - dt);
    const able = !sh.deck;
    const want = able && this.shoreEyePref && !this.shoreLeaving && this.eyeWait <= 0 && this.wreck.t < 0;
    this.rig.firstPerson = want;
    this.input.eye = want && this.state === 'playing' && !this.photo.active;
    const fe = this.footEye;
    // around the eyes the camera keeps behind the captain; from above, north is up again
    this.rig.footAz = want || this.rig.eyeBlend > 0 ? fe.yaw + Math.PI : 0;
    // a cut or a shot that found a foe turns the head toward them (more firmly on touch)
    if (sh.lockT > this.lastLockT) {
      this.lastLockT = sh.lockT;
      const f = sh.lockOn;
      if (f && want) fe.glance(_a.set(f.x, f.y + 1.45 * f.height, f.z), 0.16, this.input.isTouch ? 10 : 5, true);
    }
    if (want || this.rig.eyeBlend > 0) {
      fe.pose(this.state === 'playing' ? dt : 0, cap, this.world.time, sh.treasure, this.rig.eyePos, this.rig.eyeQuat);
      const a = this.rig.camera.aspect;
      const base = clamp((2 * Math.atan(Math.tan((42 * Math.PI) / 180) / a) * 180) / Math.PI, 55, 84);
      // a few degrees wider at a run
      this.rig.eyeFov = base + fe.sprint * 7;
    }
    const eb = this.rig.eyeBlend;
    cap.hidden = eb > 0.55;
    sh.eyes = eb > 0.9;
    const on = eb > 0.5;
    this.shoreHud.setEye(on, able, this.input.mouseLocked || this.input.isTouch);
    if (on) {
      // the sight closes in on a foe within the cutlass's reach, dead ahead
      let foe = false;
      for (const f of sh.foes) {
        if (!f.standing) continue;
        const d = Math.hypot(f.x - cap.x, f.z - cap.z);
        if (d < 3.6 && Math.abs(angleDelta(fe.yaw, Math.atan2(f.x - cap.x, f.z - cap.z))) < 0.5) foe = true;
      }
      this.shoreHud.setReticle(foe, sh.pistolLoad);
    }
  }

  /** Walks the captain, aims their eyes, and keeps the deck chrome in step. */
  private updateCaptain(dt: number) {
    const cap = this.captain;
    const p = this.player;
    if (this.fpv && p && cap.ship === p) {
      const st = this.input.state;
      cap.update(dt, { x: st.walkX, y: st.walkY, run: st.run, lookX: st.lookX, lookY: st.lookY });
      const near = cap.atHelm ? 'leave' : cap.canTakeHelm ? 'take' : 'none';
      this.ui.setHelmPrompt(near);
      const side = cap.lookSide();
      this.ui.setLook(this.input.mouseLocked || this.input.isTouch, side, side !== 0 && p.canFire(side > 0 ? 'port' : 'starboard'));
      this.ui.setSpy(cap.spy);
    }
    cap.pilot.hidden = cap.ship === p && this.rig.eyeBlend > 0.5;
    if (cap.ship && this.rig.eyeBlend > 0 && !cap.ship.removed) {
      cap.eye(this.rig.eyePos, this.rig.eyeQuat, this.world.time);
      // a broad, natural field of view, narrowing to a sliver through the glass
      const a = this.rig.camera.aspect;
      const base = clamp((2 * Math.atan(Math.tan((42 * Math.PI) / 180) / a) * 180) / Math.PI, 55, 84);
      this.rig.eyeFov = base / (1 + cap.spy * 4.5);
    }
  }

  // ------------------------------------------------------------------ sky & weather

  /** Day cycle, weather and sea state: everything the world simulation reads. */
  private updateWeather(dt: number) {
    const a = this.atmos;
    a.update(dt);
    const w = this.world;
    if (!w) return;
    // the weather sets the breeze: ships, plants, gusts and cloud drift all follow
    w.wind.strength = a.wind;
    globalUniforms.uWind.value.z = a.wind;
    this.windField.intensity = 0.55 + a.wind * 0.6;
    // ...and its heading, as it veers and backs: sails, flags, smoke, plants and gusts all swing round
    const wa = a.windAngle;
    if (wa !== w.wind.angle) {
      // re-anchor wind-aligned streaks so they turn about the view, not the world origin
      const c = this.rig.camera.position;
      const pv = globalUniforms.uWindPivot.value;
      const qx = c.x - pv.x, qz = c.z - pv.y;
      const along = qx * w.wind.dirX + qz * w.wind.dirZ;
      const across = -qx * w.wind.dirZ + qz * w.wind.dirX;
      const nx = Math.sin(wa), nz = Math.cos(wa);
      pv.set(c.x - (along * nx - across * nz), c.z - (along * nz + across * nx));
      w.wind.angle = wa;
      w.wind.dirX = Math.sin(wa);
      w.wind.dirZ = Math.cos(wa);
      globalUniforms.uWind.value.x = w.wind.dirX;
      globalUniforms.uWind.value.y = w.wind.dirZ;
      this.windField.setDir(w.wind.dirX, w.wind.dirZ);
      this.ui.setWind(wa);
    }
    globalUniforms.uWindDrift.value.x += dt * w.wind.dirX;
    globalUniforms.uWindDrift.value.y += dt * w.wind.dirZ;
    this.cloudOff.x += dt * w.wind.dirX * (0.002 + a.wind * 0.002 + a.storm * 0.004);
    this.cloudOff.y += dt * w.wind.dirZ * (0.002 + a.wind * 0.002 + a.storm * 0.004);
    globalUniforms.uCloudOffset.value.copy(this.cloudOff);
    // bigger seas: CPU buoyancy and the GPU swell share the very same waves
    setSeaState(w.waves, this.baseWaves, a.sea, a.calm);
    // the swell comes round after the wind, slowly, turning about the view so it never slides
    const swell = this.swellAngle + (a.windAngle - this.swellAngle) * (1 - Math.exp(-dt / 45));
    if (Math.abs(swell - this.swellAngle) > 1e-6) {
      this.swellAngle = swell;
      const c = this.rig.camera.position;
      turnWaves(w.waves, this.baseWaves, swell - this.baseAngle, c.x, c.z);
    }
    this.ocean.setWaves(w.waves);
    setSurf(a.storm, a.sea, a.wind);
    this.applyAtmosphere();
  }

  /** Pushes the atmosphere into lights, fog and the grade. */
  private applyAtmosphere() {
    const a = this.atmos;
    this.sun.color.setRGB(a.keyColor.x, a.keyColor.y, a.keyColor.z);
    this.sun.intensity = 1;
    const fog = this.opaque.fog as THREE.Fog;
    fog.color.setRGB(a.fogColor.x, a.fogColor.y, a.fogColor.z);
    fog.near = a.fogRange.x;
    fog.far = a.fogRange.y;
    this.pipeline.exposure = a.exposure;
    this.pipeline.heat = a.heat;
    this.pipeline.setLook(a.shaftAir, a.shaftSea, a.shaftHaze, a.gradeLo, a.gradeHi, a.gradeSat, a.vignette);
  }

  /** Rain, lightning, thunder, spindrift and the clock badge. */
  private updateSkyFx(dt: number) {
    const a = this.atmos;
    const w = this.world;
    const tgt = this.rig.target;
    const cam = this.rig.camera;
    this.rain.update(a.rain, tgt.x, tgt.z, this.rig.distance, w.wind.dirX, w.wind.dirZ, a.wind);
    const strike = this.lightning.update(dt, a.storm, tgt.x, tgt.z, cam);
    if (strike) {
      const p = new THREE.Vector3(strike.x, 0, strike.z);
      const [vol, pan, dist] = w.soundAt(p);
      this.audio.thunder(Math.min(1, (strike.bolt ? 0.95 : 0.55) * strike.power * Math.max(vol, 0.35)), pan * 0.6, dist);
      if (strike.bolt) {
        // the strike point boils with light and steam
        p.y = w.waterHeight(p.x, p.z) + 1;
        w.particles.emit({ x: p.x, y: p.y + 2, z: p.z, life: 0.5, size: 40, sizeEnd: 70, color: [6, 7, 10], colorEnd: [0.5, 0.6, 1], fadeIn: 0.001 }, true);
        for (let i = 0; i < 6; i++) {
          w.particles.emit({
            x: p.x + (Math.random() - 0.5) * 8, y: p.y, z: p.z + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 3,
            life: 3 + Math.random() * 2, size: 6, sizeEnd: 22, color: [0.9, 0.92, 0.95], alpha: 0.35, drag: 0.6, kind: 1, fadeIn: 0.2,
          });
        }
      }
    }
    const flash = this.lightning.flash;
    globalUniforms.uFlash.value = flash;
    // the sea round the strike lights up with it (a sheet flash, far off, only faintly)
    if (strike) this.strikeAt.set(strike.x, strike.z, strike.bolt ? 140 : 420, strike.bolt ? 1 : 0.22);
    const sa = this.strikeAt;
    globalUniforms.uStrike.value.set(sa.x, sa.y, sa.z, flash * sa.w);
    this.pipeline.lightning = Math.min(flash, 1.5) * 0.55;
    this.opaque.environmentIntensity = SKY_LIGHT * (1 + flash * 5);

    // spindrift: in a blow the wind tears the tops off the crests
    this.spindrift.update(smoothstep(0.25, 0.9, a.storm) + Math.max(0, a.wind - 1) * 0.5, tgt.x, tgt.z, this.rig.distance, a.wind);

    // ember rain, mirages and the sea-spark blooms
    const pl = this.player;
    const ship = pl && pl.alive ? pl.pos : null;
    this.rare.update(dt, a, ship && pl ? { x: ship.x, z: ship.z, heading: pl.heading } : null, this.state === 'playing', w.wind, { x: tgt.x, z: tgt.z, dist: this.rig.distance });
    // a rare weather picked by hand lasts only as long as its time and place
    if ((this.wxCheckT -= dt) < 0) {
      this.wxCheckT = 1;
      const m = a.mode;
      const need = this.state === 'playing' && !this.coop.guest && m !== 'auto' ? this.weatherNeeds(m, true) : null;
      if (need && m !== 'auto') {
        a.setMode('auto');
        this.ui.skyPins(false, a.timeMode !== 'auto');
        this.ui.skyTag(`${WEATHER[m].name} has passed`, need);
      }
    }

    this.audio.setWeather(a.rain, a.storm, a.wind);
    // the band plays for fair sailing; the harbour, the open sea, a storm and the Kraken all have music of their own
    const afloat = (this.state === 'playing' || this.state === 'paused' || this.state === 'docked') && !!pl && pl.alive && this.wreck.t < 0;
    this.audio.voyageMusic(afloat && !this.onHighSeas && !this.kraken.active && a.storm < 0.45, a.night);
    this.birds.mesh.visible = a.night < 0.75 && a.storm < 0.6;
    // a volcano's ash over whatever else the sky is doing names the weather
    const k = a.ash > 0.45 ? 'embers' : a.kind;
    const dark = a.sunDir.y < -0.03;
    const icon = k === 'storm' ? 'storm' : k === 'rain' ? 'rain' : k === 'mist' ? 'mist' : k === 'cloudy' ? 'cloud'
      : k === 'calm' ? (dark ? 'calm-moon' : 'calm') : k === 'hot' ? 'hot' : k === 'embers' ? 'embers' : k === 'glow' ? 'glow'
      : k === 'fair' ? (dark ? 'partly-moon' : 'partly-sun') : dark ? 'moon' : 'sun';
    this.ui.setSky(a.hour, icon, WEATHER[k].name);
  }

  /**
   * What a weather picked by hand still waits for here and now, or null if it
   * can be had. The rare ones keep to their time and place: a very hot noon
   * only out on the high seas, ember rain only under a volcano's plume, the
   * glowing seas only at night in a sea-spark bloom. `keep` loosens the test
   * a little, for one already set (so it doesn't flicker off at the edge).
   */
  private weatherNeeds(m: WeatherKind, keep = false): string | null {
    const p = this.player;
    const h = this.atmos.hour;
    const w = this.world;
    if (m === 'hot') {
      const noon = h >= 11 && h < (keep ? 14.5 : 14);
      if (!this.onHighSeas) return 'Only out on the high seas, at noon (11:00 to 14:00), far from any island.';
      if (!noon) return 'Only at noon (11:00 to 14:00). Tap the clock to set it to Noon.';
    } else if (m === 'embers') {
      const ash = p ? this.rare.plumeAt(p.pos.x, p.pos.z, w.wind.dirX, w.wind.dirZ) : 0;
      if (ash < (keep ? 0.15 : 0.3)) return `Only downwind of ${this.rare.volcanoName}, where its ash and embers drift over the sea.`;
    } else if (m === 'glow') {
      const night = h >= 20.5 || h < 4.8;
      const bloom = p ? seaGlowAt(p.pos.x, p.pos.z) : 0;
      if (bloom < (keep ? 0.12 : 0.3)) return 'Only in the glowing stretches of the high seas, at night. Two lie on the crossing to Las Brumas.';
      if (!night) return 'Only at night (20:30 to 04:45). Tap the clock to set it to Night.';
    }
    return null;
  }

  private checkDiscoveries(p: Ship) {
    for (const isl of this.terrain.islands) {
      if (this.discovered.has(isl.name)) continue;
      if (Math.hypot(isl.x - p.pos.x, isl.z - p.pos.z) < isl.r + 70) {
        this.discovered.add(isl.name);
        const reward = 40 + Math.round(isl.r * 0.4);
        this.note('isle', `Charted ${isl.name}`, `+${reward} gold`);
        p.gold += reward;
        this.vaultStore.earn(reward);
        // the islanders top up the magazine
        const shot = this.stockAmmo({ shell: 1, fire: 1, chain: 1, grape: 1 }, null);
        this.ui.toast(`Island discovered · +${reward} gold${shot ? ' · fresh shot' : ''}`, isl.name, 3.6);
        this.audio.chime();
      }
    }
  }

  private directSpawns(dt: number) {
    const caps = this.capList;
    caps.length = 0;
    const p = this.player;
    if (p && this.state === 'playing' && !this.shore.active) caps.push(p);
    this.coop.flagships(caps);
    if (!caps.length) return;
    // pirates left far astern of every captain while cruising are recycled so the seas stay busy
    for (const s of this.ships.slice()) {
      if (s.team !== 'pirate' || !s.alive || s.hunter || s.remote) continue;
      const ai = this.ais.get(s);
      if (ai && ai.mode === 'patrol' && caps.every((c) => Math.hypot(s.pos.x - c.pos.x, s.pos.z - c.pos.z) > 820)) this.removeShip(s);
    }
    // nor out on the high seas: they keep to the archipelagos' waters
    if (this.onHighSeas) {
      this.spawnTimer = Math.max(this.spawnTimer, 10);
      return;
    }
    // no pirate sails into the Kraken's water
    if (this.kraken.active) {
      this.spawnTimer = Math.max(this.spawnTimer, 18);
      return;
    }
    const alivePirates = this.ships.filter((s) => s.team === 'pirate' && s.alive && !s.hunter).length;
    // a fleet draws a bigger crowd, and so does a crew of captains
    const kills = p?.kills ?? 0;
    const want = Math.min(4, 2 + Math.floor(kills / 4)) + (this.escortShips.length ? 1 : 0) + Math.min(3, caps.length - 1);
    this.spawnTimer -= dt;
    if (alivePirates < want && this.spawnTimer <= 0) {
      const room = want - alivePirates;
      // round whichever captain has the fewest pirates about her
      let at = caps[0];
      let few = Infinity;
      for (const c of caps) {
        const n = this.ships.filter((s) => s.team === 'pirate' && s.alive && Math.hypot(s.pos.x - c.pos.x, s.pos.z - c.pos.z) < 600).length + Math.random() * 0.5;
        if (n < few) {
          few = n;
          at = c;
        }
      }
      if (room >= 2 && (this.voyageTime > 60 || caps.length > 1) && Math.random() < 0.25) this.spawnFlotilla(at.pos, 360, 520, Math.min(room, 3));
      else this.spawnPirate(at.pos, 280, 480);
      this.spawnTimer = (12 + Math.random() * 8) / Math.sqrt(caps.length);
    }
  }

  /**
   * The sun's shadow camera, built by hand in place of three's: it looks
   * straight down over the snapped centre, and the sun's slant is a shear, so
   * a point h metres up lands k*h along the ground from its foot, exactly where
   * its shadow falls. Depth is height, which only grows toward the sun along
   * every ray, so the shadow test still holds.
   */
  private fitShadow() {
    const sh = this.sun.shadow;
    const cam = sh.camera;
    cam.position.set(this.shadowC.x, SHADOW_TOP, this.shadowC.y);
    cam.rotation.set(-Math.PI / 2, 0, 0); // looking down, x east, y north
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    // view space: x = east, y = -z, z = height - SHADOW_TOP
    const kx = this.shadowK.x;
    const kz = this.shadowK.y;
    _shear.set(1, 0, -kx, -kx * SHADOW_TOP, 0, 1, kz, kz * SHADOW_TOP, 0, 0, 1, 0, 0, 0, 0, 1);
    cam.projectionMatrix.multiply(_shear);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    (sh as unknown as { _updateMatrix(c: THREE.Camera, m: THREE.Matrix4, f: THREE.Frustum): void })._updateMatrix(cam, sh.matrix, sh.getFrustum());
  }

  private viewSaved = '';
  private viewSaveT = 0;

  /** Keeps the zoom button's pips on the current view and remembers it (at sea; ashore, the sea view waiting for you). */
  private syncView() {
    if (this.state !== 'playing') return;
    const r = this.rig;
    const v = r.view;
    this.ui.setZoomView(v, CameraRig.VIEWS[v].name);
    const now = performance.now();
    if (now < this.viewSaveT) return;
    this.viewSaveT = now + 600;
    const zoom = r.foot ? this.seaZoom : r.zoom;
    const key = `${zoom.toFixed(3)},${r.tilt.toFixed(3)}`;
    if (key === this.viewSaved) return;
    this.viewSaved = key;
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ zoom: +zoom.toFixed(3), tilt: +r.tilt.toFixed(3) }));
    } catch {
      /* private mode */
    }
  }

  private render(dt: number) {
    if (!this.ocean) return;
    this.syncView();
    const P = this.prof;
    P.begin('Shadow & scene setup', 'render');
    const cam = this.rig.camera;
    const target = this.rig.target;
    // Fit the sun's shadow map around the view. It only stays steady while its
    // texel grid stays put in the world: any sub-texel slide re-rasterises every
    // shadow edge, and zoomed out (texels several times larger) that reads as
    // the whole island shimmering. So the map looks straight down with its grid
    // fixed to the ground, the centre snaps to whole texels and the size moves
    // in steps. The sun's angle is a shear of that projection (see fitShadow),
    // so shadows glide smoothly round with the day while the grid never moves.
    const want = this.rig.groundRadius();
    if (want > this.shadowR || want < this.shadowR - 36 || this.rig.mode === 'port') this.shadowR = Math.min(260, Math.ceil(want / 16) * 16);
    const R = this.shadowR;
    const sc = this.sun.shadow.camera;
    sc.left = -R;
    sc.right = R;
    sc.top = R;
    sc.bottom = -R;
    const texel = (2 * R) / this.sun.shadow.mapSize.x;
    // wide texels need a wider normal offset or slopes speckle with self-shadow
    this.sun.shadow.normalBias = Math.max(0.05, texel * 0.8);
    // low sun / moon: keep the shadow caster a little higher so shadows stay crisp, not smeared
    const kd = this.atmos.keyDir;
    const ky = Math.max(kd.y, 0.22);
    const kh = Math.hypot(kd.x, kd.z) || 1;
    const kk = Math.sqrt(1 - ky * ky) / kh;
    const sd = _a.set(kd.x * kk, ky, kd.z * kk);
    this.shadowK.set(sd.x / sd.y, sd.z / sd.y);
    this.toSun.copy(sd);
    this.shadowC.set(Math.round(target.x / texel) * texel, Math.round(target.z / texel) * texel);
    this.sun.target.position.set(this.shadowC.x, 0, this.shadowC.y);
    this.sun.position.copy(this.sun.target.position).addScaledVector(sd, 400);
    this.sun.target.updateMatrixWorld();
    updateSoftShadows(this.sun, this.softShadows, 1 / sd.y);
    P.end();
    // photo mode's sky sliders relight the frozen scene, a few times a second at most
    if (this.photoSky && performance.now() - this.photoSkyT > 120) {
      this.photoSky = false;
      this.photoSkyT = performance.now();
      this.envT = 0;
    }
    // the sky's light changes slowly: refresh the image-based lighting a few times a second
    // (and only when it has actually changed enough to see)
    this.envT -= dt > 0 ? dt : 0;
    if (this.envT <= 0) {
      this.envT = 0.35;
      if (this.skyEnv.stale(0.35)) {
        P.begin('Sky lighting (IBL)', 'render', true);
        this.skyEnv.update();
        P.end(true);
      }
    }

    viewCull.off = this.warming;
    emptyDraws.skip = !this.warming;
    viewCull.set(cam, this.shadowC, this.shadowR, this.shadowK);
    P.begin('Vegetation culling', 'sim');
    // from eye level the far LOD takes over from ~85 m out, even on the island underfoot
    if (this.veg) this.veg.detail = this.rig.eyeBlend > 0.5 && !this.photo.active ? 85 : Infinity;
    this.veg?.update(cam, this.toSun, this.shadowC, this.shadowR);
    if (this.grass) {
      // feet walking through the meadow part it
      const sh = this.shore;
      const pu = _pushers;
      pu.length = 0;
      if (sh.active) {
        if (sh.captain) pu.push(sh.captain);
        for (const m of sh.party) if (pu.length < GRASS_PUSHERS && m.walker !== sh.captain && m.walker.visible) pu.push(m.walker);
        for (const f of sh.foes) if (pu.length < GRASS_PUSHERS && f.visible && Math.hypot(f.x - cam.position.x, f.z - cam.position.z) < 30) pu.push(f);
      }
      this.grass.setPushers(pu);
      this.grass.update(cam, this.veg?.hold);
    }
    for (const r of this.regions) (r.land.userData.lod as TerrainLod | undefined)?.update(cam);
    staticLod.update(cam);
    P.end();
    P.begin('Wake simulation', 'ocean', true);
    this.wake.update(this.renderer, target.x, target.z, dt);
    P.end(true);
    P.begin('Ocean & scene binding', 'ocean');
    this.ocean.follow(target.x, target.z);
    this.ocean.setSceneTextures(this.pipeline.rtOpaque.texture, this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.particles.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    setBowWaveScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.wisps.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.rain.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.rare.embers.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.rare.mirage.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.spindrift.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.spirits.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.gunnery.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.kraken.view.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    P.end();
    // the low puffs (seen only from high up) and the shadows they drift over the sea
    P.begin('Low clouds', 'fx', true);
    const cl = this.clouds;
    cl.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    const keep = this.player && this.player.alive && this.state === 'playing' && !this.photo.active ? this.player.pos : null;
    // out on the open ocean with no fight on, the clouds sail right over you like over anything else
    const pl = this.player;
    const fight = !!this.lastFoe || this.kraken.active || (!!pl && this.world.time - pl.lastHit < 12);
    cl.update(dt, cam, target, this.toSun, this.atmos, this.world.wind.dirX, this.world.wind.dirZ, keep, !this.onHighSeas || fight);
    cl.renderShadow(this.renderer);
    P.end(true);
    P.begin('Camera & sky binding', 'render');
    const eb = this.rig.eyeBlend;
    const port = this.rig.mode === 'port';
    this.pipeline.tilt = port ? 0.25 : (this.rig.mode === 'orbit' ? 0.55 : 0.35) * (1 - eb);
    // the horizon only exists from the deck (and in the shipwright's harbour)
    const cine = this.rig.cine ? this.rig.cine.w : 0;
    if (cine > 0) this.pipeline.tilt *= 1 - cine * 0.7;
    // leaned over past the farthest zoom: ease the diorama blur a little
    if (this.rig.mode === 'follow') this.pipeline.tilt *= 1 - this.rig.tiltBlend * 0.4;
    // only the farewell ever takes the camera below the waves
    const k = this.wreck;
    const under = k.t >= 0 && cam.position.y < this.world.waterHeight(cam.position.x, cam.position.z) - 0.2;
    if (under && k.under < 0) {
      k.under = k.t;
      this.audio.submerge(true);
      // the lens plunges through: a rush of air dragged down past it
      this.bubbles.rush(cam, this.world.waterHeight(cam.position.x, cam.position.z));
    }
    if (under || this.isUnder) this.setUnder(under);
    this.isUnder = under;
    // no rain or wind wisps down here
    if (under) {
      this.rain.mesh.visible = false;
      this.rare.embers.mesh.visible = false;
      this.spindrift.mesh.visible = false;
      this.clouds.mesh.visible = false;
    }
    this.wisps.mesh.visible = !under;
    if (under) this.spirits.mesh.visible = false;
    // (the loading screen's warm-up draws them all, so their shaders are ready for the deck)
    this.sky.visible = this.warming || (!under && (eb > 0.001 || port || cine > 0));
    this.sky.position.copy(cam.position);
    this.ocean.apron.visible = this.warming || (!under && (eb > 0.001 || port || cine > 0));
    const rr = this.pipeline.rtRefl;
    this.ocean.setReflectionTarget(rr.texture, rr.width, rr.height);
    this.pipeline.refl = this.ocean.reflecting ? this.ocean.reflScene : null;
    // sharpen more the further below the screen's own pixels we render (the
    // browser stretches the picture the rest of the way)
    const under1 = 1 - Math.min(1, this.dpr / (devicePixelRatio || 1));
    this.pipeline.sharpen = Math.min(0.42, 0.12 + (1 - this.scaler.scale) * 0.4 + under1 * 0.22);
    // the lowest the sea surface can sink this frame: every swell's trough at
    // once, a wake's dip, and a nearby maelstrom's funnel. Beneath it the water
    // hides the world, so the screen-space lighting skips those pixels. (Never
    // below the open seabed: a hull deeper down a throat is past saving.)
    let dip = 1.4;
    for (const w of this.world.waves) dip += w.amp;
    for (const v of globalUniforms.uVortex.value) {
      if (Math.hypot(v.x - this.rig.camera.position.x, v.y - this.rig.camera.position.z) < v.z + 700) dip += vortexDepth(v.z, v.w);
    }
    this.pipeline.ss.seaCut = under || this.isUnder ? -1e9 : -Math.min(dip, 15);
    if (this.photo.active) {
      // a free camera can look out to the horizon: the sky and the far sea come in,
      // the diorama blur gives way to the lens's own depth of field
      this.pipeline.tilt = 0;
      this.sky.visible = true;
      this.ocean.apron.visible = true;
      this.pipeline.photo = this.photo.look(0);
      this.pipeline.exposure = this.atmos.exposure * Math.pow(2, this.photo.exposure);
    }
    this.cumulus.update(dt, cam, this.sky.visible);
    P.end();
    this.pipeline.warm = this.warming;
    this.pipeline.render(this.opaque, this.water, cam, this.world.time);
    this.ocean.enableShadows(this.sun);
  }
}
