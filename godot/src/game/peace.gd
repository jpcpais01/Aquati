class_name Peace
## Peaceful seas (the web game's game/peace.ts): every pirate, hunter, ghost,
## fort, camp and the Kraken itself is still out there, but none of them fires
## first. A blow from your side (your guns, your escorts', a ram, a cutlass
## ashore) is a quarrel, and the quarrel spreads the way a sailor would
## expect: her flotilla comes about with her, the Brethren within hail take
## her side, a fort covering her runs out its guns, and a named hunter who was
## only waiting for an excuse has one. The dead keep to their own.
##
## A grudge (Ship.wrath_t, Forts.Fort.wrath_t) stays fresh while blows are
## traded or you stay under her guns, and is forgotten a while after you've
## sailed clear. The game keeps the rule (World.peaceful) from Settings.

## Seconds a grudge outlives the last offence (blows traded, or you lying under her guns).
const FORGET := 45.0
## The Brethren within this many metres of a ship you fire on take up her quarrel.
const RALLY := 320.0
## A named hunter shadowing you hears the guns from this far off, and comes.
const HUNTER_RALLY := 760.0
## A fort covers the waters this far out from its walls when one of its own is fired on.
const FORT_RALLY := 260.0
## Seconds a "Hold your fire?" stands for a second press to fire first.
const HOLD_FIRE := 3.5

## A ship's mark on the minimap and the chart: pale while she holds her fire,
## red (a ghost's green) once she's at war with you.
const CALM_MARK := Color("#f2ece0")
const CALM_GHOST := Color("#c8f5e2")
const WAR_MARK := Color("#ff6a55")
const WAR_GHOST := Color("#7dffc4")
## The halo's two moods round the minimap, and the sea chooser's lit halves.
const CALM_GLOW := Color(0.69, 0.89, 1.0)
const WAR_GLOW := Color(1.0, 0.39, 0.27)
const DOVE_INK := Color("#b6fff0")
const BLADES_INK := Color("#ffb196")


## The colour a pirate (or a ghost) is marked in on the maps.
static func mark(s: Ship) -> Color:
	if s.calm:
		return CALM_GHOST if s.ghost else CALM_MARK
	return WAR_GHOST if s.ghost else WAR_MARK
