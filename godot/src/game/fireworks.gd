class_name Fireworks
## Fireworks: the sixth thing a gun can be loaded with (the web game's
## fireworks.ts). Not a weapon at all: each chosen gun on the side sends a
## rocket up at seventy degrees and the night sky over the sea opens into
## flowers of coloured fire (FireworkSky draws them). Ten kinds sold by the
## harbour pyrotechnists and found in salvage, and three showpieces so rare
## that most captains only ever hear of them.
##
## They're kept in a locker that follows the captain between voyages
## (Progress.fireworks), not in the voyage's shot racks.

## Every kind, in the locker's order: the ten, then the three showpieces.
const ORDER: Array[String] = ["peony", "chrysanthemum", "willow", "palm", "ring", "crossette", "strobe", "crackle", "fish", "saturn", "kraken", "roger", "fortune"]

## Each kind: its name, one word for chips, what it looks like, its colour
## and its partner's, its tier (0 common, 1 fine, 2 showpiece), the
## pyrotechnist's price for a volley, and the most the locker holds.
const KINDS := {
	"peony": {"name": "Coral Peony", "short": "Peony", "blurb": "A perfect sphere of coral stars that ripen to gold as they fall.",
		"css": "#ff6f7d", "css2": "#ffc85a", "tier": 0, "price": 40, "max": 30},
	"chrysanthemum": {"name": "Gold Chrysanthemum", "short": "Mum", "blurb": "Hundreds of petals, each drawing a glittering golden tail behind it.",
		"css": "#ffd27a", "css2": "#fff2c4", "tier": 0, "price": 50, "max": 30},
	"willow": {"name": "Weeping Willow", "short": "Willow", "blurb": "Slow golden branches that droop and hang in the sky long after the bang.",
		"css": "#ffb84a", "css2": "#ffe2a0", "tier": 0, "price": 55, "max": 30},
	"palm": {"name": "Island Palm", "short": "Palm", "blurb": "A glittering trunk climbs, then heavy green-gold fronds fan out and bow to the sea.",
		"css": "#7be08a", "css2": "#ffcf6a", "tier": 0, "price": 50, "max": 30},
	"ring": {"name": "Halo Ring", "short": "Halo", "blurb": "Two crisp rings of aqua and violet, tilted across the sky like a gyroscope.",
		"css": "#6fe7ff", "css2": "#c39bff", "tier": 1, "price": 75, "max": 25},
	"crossette": {"name": "Crossette", "short": "Cross", "blurb": "Silver comets fly out and split, every one, into a little cross of fire.",
		"css": "#e8f2ff", "css2": "#7fc4ff", "tier": 1, "price": 80, "max": 25},
	"strobe": {"name": "Lighthouse Strobe", "short": "Strobe", "blurb": "A cloud of white stars that hang and blink on and off like a lighthouse gone mad.",
		"css": "#f4f8ff", "css2": "#9fdcff", "tier": 1, "price": 70, "max": 25},
	"crackle": {"name": "Dragon's Eggs", "short": "Eggs", "blurb": "Gold stars that hatch at the end of their fall into a hail of crackling pops.",
		"css": "#ffcc5a", "css2": "#ff8a3a", "tier": 1, "price": 85, "max": 25},
	"fish": {"name": "Shoal of Fish", "short": "Fish", "blurb": "A shoal of bright little fish that wriggle away across the dark in every direction.",
		"css": "#5fe8c8", "css2": "#ffe27a", "tier": 1, "price": 80, "max": 25},
	"saturn": {"name": "Saturn", "short": "Saturn", "blurb": "A violet planet in a tilted ring of gold, hanging over the sea.",
		"css": "#b88cff", "css2": "#ffd36a", "tier": 1, "price": 90, "max": 25},
	"kraken": {"name": "Kraken's Bloom", "short": "Kraken", "blurb": "Showpiece. A sea-green maw opens across the sky and eight great tentacles of fire curl down toward the water.",
		"css": "#46f0b0", "css2": "#b46cff", "tier": 2, "price": 1400, "max": 5},
	"roger": {"name": "Jolly Roger", "short": "Roger", "blurb": "Showpiece. The skull and crossbones, written across the night in white fire, with a crimson crown of crackle.",
		"css": "#f6f6ff", "css2": "#ff4a5a", "tier": 2, "price": 1600, "max": 5},
	"fortune": {"name": "Fortune's Finale", "short": "Finale", "blurb": "Showpiece. A golden crown fills the sky, rings of every colour break around it and a rain of gold coins glitters down to the sea.",
		"css": "#ffd75a", "css2": "#ff7ad9", "tier": 2, "price": 2000, "max": 5},
}

## A crate the harbour sends every new captain off with, so the first night
## at sea has a show.
const WELCOME := {"peony": 3, "chrysanthemum": 2, "palm": 2, "willow": 1}


static func kind(id: String) -> Dictionary:
	return KINDS.get(id, KINDS.peony)


static func color(id: String) -> Color:
	return Color(str(kind(id).css))


static func color2(id: String) -> Color:
	return Color(str(kind(id).css2))


static func tier(id: String) -> int:
	return int(kind(id).tier)


static func of_tier(t: int) -> Array[String]:
	var out: Array[String] = []
	for id in ORDER:
		if int(KINDS[id].tier) == t:
			out.append(id)
	return out


## A blurb without its "Showpiece." lead.
static func gist(id: String) -> String:
	return str(kind(id).blurb).trim_prefix("Showpiece. ")


## Keeps only known kinds, as whole numbers within each locker's room.
static func sanitize(raw: Variant) -> Dictionary:
	var out := {}
	if raw is Dictionary:
		for k: Variant in raw:
			var id := str(k)
			if not KINDS.has(id):
				continue
			var v: Variant = raw[k]
			var n := clampi(int(v) if (v is int or v is float) and is_finite(float(v)) else 0, 0, int(KINDS[id].max))
			if n > 0:
				out[id] = n
	return out


## Fireworks found in salvage, by tier (0 barrel .. 4 legendary chest): most
## barrels hold none, fine chests a few rockets, and only the finest have any
## chance of a showpiece. {id: count}.
static func loot(t: int) -> Dictionary:
	var out := {}
	var one := func(pool: Array[String], n: int) -> void:
		var id: String = pool[randi() % pool.size()]
		out[id] = int(out.get(id, 0)) + n
	var common := of_tier(0)
	var fine := of_tier(1)
	var show := of_tier(2)
	match t:
		0:
			if randf() < 0.08:
				one.call(common, 1)
		1:
			if randf() < 0.3:
				one.call(common, 1 + randi() % 2)
		2:
			if randf() < 0.55:
				one.call(common if randf() < 0.6 else fine, 2)
		3:
			one.call(common, 2)
			if randf() < 0.7:
				one.call(fine, 2)
			if randf() < 0.05:
				one.call(show, 1)
		_:
			one.call(common, 3)
			one.call(fine, 2)
			one.call(fine, 2)
			if randf() < 0.22:
				one.call(show, 1)
	return out


## What a port's pyrotechnist has on the counter today (the web's pyroStock):
## three of the common kinds, three of the finer and, now and then, a
## showpiece at a fortune. The same all day for a port, so the stall doesn't
## reshuffle: the web's own generator, to the bit.
static func stall(port_seed: int, day: int) -> Array[String]:
	var s := [(port_seed * 2654435761 + day * 40503) & 0xffffffff]
	if s[0] == 0:
		s[0] = 1
	var rnd := func() -> float:
		s[0] = _i32(s[0] + 0x6d2b79f5)
		var x: int = s[0]
		var t := _imul(x ^ (_u32(x) >> 15), 1 | x)
		t = _i32(_i32(t + _imul(t ^ (_u32(t) >> 7), 61 | t)) ^ t)
		return float(_u32(t ^ (_u32(t) >> 14))) / 4294967296.0
	var draw := func(pool: Array[String], n: int) -> Array[String]:
		var p := pool.duplicate()
		var out: Array[String] = []
		while out.size() < n and not p.is_empty():
			out.append(p.pop_at(floori(rnd.call() * p.size())))
		return out
	var list: Array[String] = []
	list.append_array(draw.call(of_tier(0), 3))
	list.append_array(draw.call(of_tier(1), 3))
	if rnd.call() < 0.45:
		list.append_array(draw.call(of_tier(2), 1))
	return list


static func _u32(x: int) -> int:
	return x & 0xffffffff


static func _i32(x: int) -> int:
	x &= 0xffffffff
	return x - 0x100000000 if x >= 0x80000000 else x


## JavaScript's Math.imul (in halves: a whole 32 × 32 product overflows).
static func _imul(a: int, b: int) -> int:
	var ua := _u32(a)
	var ub := _u32(b)
	return _i32(ua * (ub & 0xffff) + ((ua * (ub >> 16)) << 16))
