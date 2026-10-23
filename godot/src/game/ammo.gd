class_name Ammo
## Shot types. Every gun on a ship loads the same kind for a broadside, and
## each kind trades something for something: round shot is the honest
## all-rounder you never run out of; the specials are powerful, carried in
## short supply and topped up from salvage. The web game's ammo.ts (its
## fireworks come with the night skies).

enum { ROUND, SHELL, FIRE, CHAIN, GRAPE }
const COUNT := 5
const SPECIALS := [SHELL, FIRE, CHAIN, GRAPE]

const ID := ["round", "shell", "fire", "chain", "grape"]
const NAME := ["Round shot", "Explosive shell", "Fire shot", "Chain shot", "Grape shot"]
## One word for the rack.
const SHORT := ["Round", "Shell", "Fire", "Chain", "Grape"]
## What it does, the first sentence of it for the tag that shows when it's loaded.
const BLURB := [
	"Solid iron. Reliable, long reach, and the magazine never runs dry.",
	"Hollow shot packed with powder. Bursts on impact and wrecks everything close by, even on a near miss. Slow to load.",
	"Red-hot iron. Sets the target ablaze, burning her down until the fire dies.",
	"Two half-balls on a chain that scythe through the rigging. Shreds sails and slows the target to a crawl. Shorter reach.",
	"A bag of musket balls that sprays the deck. Brutal up close, cuts down gun crews so they reload slowly. Short reach, quick to load.",
]
## What it's good for, in a few words (the touch shot pie's title).
const GIST := ["Long reach, and it never runs out", "Bursts on impact", "Sets her ablaze", "Shreds her sails", "Cuts down her gun crews"]
## Its colour on the HUD.
const COLOR := [Color("#d9e2e6"), Color("#ffb347"), Color("#ff6a3d"), Color("#9fd8ff"), Color("#c9b3ff")]
## Hull damage per ball, reload time and muzzle velocity (each times the
## ship's own; reach goes with the square of the velocity), balls per gun,
## their scatter (rad) and size (times a round shot).
const DAMAGE := [1.0, 0.55, 0.6, 0.35, 0.17]
const RELOAD := [1.0, 1.4, 1.25, 1.2, 0.8]
const SPEED := [1.0, 0.9, 0.95, 0.85, 0.72]
const BALLS := [1, 1, 1, 1, 6]
const SPREAD := [0.0, 0.0, 0.0, 0.0, 0.075]
const SIZE := [1.0, 1.12, 1.0, 0.8, 0.42]
## Most broadsides' worth you can carry, and aboard when a voyage begins
## (round shot never runs out).
const MAX := [-1, 12, 12, 12, 12]
const START := [-1, 3, 3, 3, 4]

## Explosive shell: the burst's reach (m) and its blow at the centre (times the gun's).
const BLAST_RADIUS := 7.5
const BLAST_DAMAGE := 0.95
## Fire shot: seconds of burning each ball adds, the most she can carry,
## and the hull burnt away a second (of her whole).
const BURN_PER_HIT := 2.6
const BURN_MAX := 12.0
const BURN_RATE := 0.018
## Chain shot: seconds her canvas stays shredded, and the way it costs her.
const TORN_TIME := 14.0
const TORN_SLOW := 0.38
## Grape shot: seconds her gun crews stay thinned, and how much slower they load.
const CREW_TIME := 10.0
const CREW_RELOAD := 0.55

## Now and then a pirate crew rams home something nastier: [kind, chance]
## by class.
const PIRATE := {
	"sloop": [[CHAIN, 0.18], [GRAPE, 0.16]],
	"brig": [[CHAIN, 0.12], [FIRE, 0.12], [GRAPE, 0.1]],
	"galleon": [[SHELL, 0.2], [FIRE, 0.1], [GRAPE, 0.14]],
}


## What a voyage begins with in the racks (round shot counts as -1, endless).
static func fresh_stock() -> PackedInt32Array:
	return PackedInt32Array(START)


## Shot found in salvage, by tier (0 barrel .. 4 legendary chest): barrels
## only sometimes hold a keg of something special; the finer the chest, the
## more kinds and the more of each. Returns {kind: count}.
static func loot(tier: int) -> Dictionary:
	var out := {}
	var pick := func(n: int, each: int) -> void:
		var pool := SPECIALS.duplicate()
		for i in n:
			if pool.is_empty():
				break
			var k: int = pool.pop_at(randi() % pool.size())
			out[k] = int(out.get(k, 0)) + each
	match tier:
		0:
			if randf() < 0.35:
				pick.call(1, 1)
		1:
			pick.call(1, 2)
		2:
			pick.call(2, 2)
		3:
			pick.call(3, 3)
		_:
			pick.call(4, 4)
	return out
