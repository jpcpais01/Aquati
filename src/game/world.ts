import * as THREE from 'three';
import { Terrain } from '../world/terrain';
import { Wave, waveHeight } from '../world/waves';
import { Particles } from '../fx/particles';
import { WakeField } from '../world/wakeField';
import { Audio } from '../core/audio';
import type { Debris } from '../fx/debris';
import type { AmmoId } from './ammo';

export interface Wind {
  angle: number; // direction the wind blows toward
  strength: number; // 0..1
  dirX: number;
  dirZ: number;
}

export interface Shot {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  owner: unknown;
  damage: number;
  /** Vault shot trail the ball leaves behind. */
  trail?: string;
  /** What kind of shot it is (round when absent). */
  ammo?: AmmoId;
}

/** A lasting effect a special shot left on a ship. */
/** dread: wraith-fire terrified her crews; phased: a ball passed through a ghost; unburnt / fleshless: a ghost shrugged off fire / grape. */
export type ShipStatus = 'ablaze' | 'shredded' | 'crew' | 'dread' | 'phased' | 'unburnt' | 'fleshless';

/** Everything a ship / projectile needs to know about its surroundings. */
export class World {
  time = 0;
  readonly wind: Wind;
  listener = new THREE.Vector3();
  listenerZoom = 140;
  /** Screen-right on the water, for panning (due east from the bird's-eye view). */
  readonly listenerRight = new THREE.Vector2(1, 0);
  /** Gust intensity at a point (0 calm .. ~1.4), fed by the wind field. */
  gustAt: (x: number, z: number) => number = () => 0;
  onShot: (s: Shot) => void = () => {};
  onShake: (amount: number, at: THREE.Vector3) => void = () => {};
  /** Damage that isn't a ball strike (a ship burning), reported in ticks. */
  onDot: (ship: unknown, attacker: unknown, damage: number) => void = () => {};
  /** A special shot just set a lasting effect on a ship. */
  onStatus: (ship: unknown, status: ShipStatus, attacker: unknown) => void = () => {};
  debris!: Debris;

  constructor(
    readonly terrain: Terrain,
    readonly waves: Wave[],
    readonly particles: Particles,
    readonly wake: WakeField,
    readonly audio: Audio,
    windAngle: number,
  ) {
    this.wind = { angle: windAngle, strength: 0.8, dirX: Math.sin(windAngle), dirZ: Math.cos(windAngle) };
  }

  /** Shore damping identical to the ocean vertex shader. */
  waterDamp(x: number, z: number) {
    return Math.min(1, Math.max(0.12, -this.terrain.heightAt(x, z) / 8));
  }

  waterHeight(x: number, z: number) {
    return waveHeight(this.waves, x, z, this.time, this.waterDamp(x, z));
  }

  /** Volume, pan and distance (m) for a sound at a world position relative to the camera. */
  soundAt(p: THREE.Vector3): [number, number, number] {
    const dx = p.x - this.listener.x;
    const dz = p.z - this.listener.z;
    const d = Math.hypot(dx, dz);
    const ref = this.listenerZoom * 0.9;
    const vol = Math.min(1, ref / (ref + d * 1.4));
    return [vol, (dx * this.listenerRight.x + dz * this.listenerRight.y) / (ref * 0.8), d];
  }
}
