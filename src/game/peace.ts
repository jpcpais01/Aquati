// Peaceful seas: every pirate, hunter, phantom, fort, camp and the Kraken
// itself is still out there, but none of them fires first. A blow from your
// side (your guns, your escorts', a ram, a cutlass ashore) is a quarrel, and
// the quarrel spreads the way a sailor would expect: her flotilla comes about
// with her, the Brethren within hail take her side, a fort covering her runs
// out its guns, and a named hunter who was only waiting for an excuse has one.
// The dead keep to their own.
//
// A grudge is held against a captain's whole side (their flagship and their
// escorts), by their place in the crew: 0 sailing alone or hosting, 1..3 for
// the guests. It stays fresh while blows are traded or the offender stays
// under her guns, and is forgotten a while after they've sailed clear.

import type { Ship } from '../ships/ship';

/** Seconds a grudge outlives the last offence (blows traded, or the offender lying under her guns). */
export const FORGET = 45;
/** The Brethren within this many metres of a ship you fire on take up her quarrel. */
export const RALLY = 320;
/** A named hunter shadowing you hears the guns from this far off, and comes. */
export const HUNTER_RALLY = 760;
/** A fort covers the waters this far out from its walls when one of its own is fired on. */
export const FORT_RALLY = 260;
/** Captains in a crew (the bit width of a grudge). */
const SIDES = 4;

/** Whose side one of the player-team ships is on: her captain's place in the crew. */
export let sideOf: (s: Ship) => number = () => 0;

export function setSideOf(f: (s: Ship) => number) {
  sideOf = f;
}

/** Who has given a ship (or a fort) cause to fight: when each captain's side last did. */
export class Grudge {
  private t = new Float64Array(SIDES).fill(-1e9);

  /** Captain `side` (and their escorts) offended at sea time `now`. */
  mark(side: number, now: number) {
    if (side >= 0 && side < SIDES) this.t[side] = Math.max(this.t[side], now);
  }

  /** Still at war with captain `side`. */
  holds(side: number, now: number) {
    return side >= 0 && side < SIDES && now - this.t[side] < FORGET;
  }

  /** Still at war with the side `s` sails for. */
  against(s: Ship, now: number) {
    return this.holds(sideOf(s), now);
  }

  /** Seconds before captain `side` is forgiven (0: no quarrel). */
  left(side: number, now: number) {
    return side >= 0 && side < SIDES ? Math.max(0, FORGET - (now - this.t[side])) : 0;
  }

  /** Bit `i` set: at war with captain `i` (sent to the other games, for their bars and tags). */
  mask(now: number) {
    let m = 0;
    for (let i = 0; i < SIDES; i++) if (now - this.t[i] < FORGET) m |= 1 << i;
    return m;
  }

  clear() {
    this.t.fill(-1e9);
  }
}
