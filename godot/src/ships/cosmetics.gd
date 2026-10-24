class_name Cosmetics
## The Treasure Vault's finds: hull skins (paint jobs drawn in the ship's own
## shaders, the legendary ones alive and glowing after dark), muzzle blasts
## and shot trails. Ported from the web game's src/ships/cosmetics.ts: the
## same catalogue in the same order, the same odds and pity, and the same
## opens on the same random numbers. Your collection is a vault dictionary
## (fresh()) that Progress keeps, along with the purse it is paid from.

const KINDS: Array[String] = ["skin", "blast", "trail"]
const KIND_NAMES := {"skin": "Hull skin", "blast": "Muzzle blast", "trail": "Shot trail"}

## Each rarity: its name, its colour and a deeper one for gradients, and the
## gold a duplicate is handed back as.
const RARITIES: Array[Dictionary] = [
	{"id": "common", "name": "Common", "css": Color("#9fe8d8"), "deep": Color("#2b8f86"), "refund": 40},
	{"id": "rare", "name": "Rare", "css": Color("#6cc8ff"), "deep": Color("#1f6fd1"), "refund": 100},
	{"id": "epic", "name": "Epic", "css": Color("#c48bff"), "deep": Color("#7a35d6"), "refund": 300},
	{"id": "legendary", "name": "Legendary", "css": Color("#ffbe3d"), "deep": Color("#e0701a"), "refund": 1000},
]

## [key, name, rarity, pattern (ship_skin.gdshaderinc), colours, blurb, {sail, glow, animated, base}]
const SKIN_LIST := [
	["none", "Your Paintwork", 0, 0, ["#1f8a8a", "#f4ead4", "#e2b552"], "The colours you chose at the Shipwright, nothing more.", {"base": true}],
	# common
	["harbour", "Harbour Stripes", 0, 1, ["#1d3f73", "#f5efe1", "#c4402f"], "Navy and cream bands with a scarlet pinstripe, as smart as a harbourmaster's coat.", {}],
	["harlequin", "Harlequin", 0, 2, ["#1f8a8a", "#f3ecdc", "#d9a441"], "Teal and ivory diamonds, every seam picked out in gold leaf.", {}],
	["scales", "Fish Scale", 0, 3, ["#2f6b47", "#86c99c", "#eaf3d2"], "Overlapping green scales, painted by a bosun with a lot of patience.", {}],
	["polka", "Coral Polka", 0, 4, ["#e46f4b", "#fbf3e4", "#b33a2c"], "Cream spots on coral red. Nobody fears it. Everybody remembers it.", {}],
	# rare
	["tiger", "Tiger Shark", 1, 5, ["#e8792f", "#1d1714", "#f4dcb5"], "Wild black stripes over burnt orange, with a pale belly at the waterline.", {}],
	["camo", "Reef Camo", 1, 6, ["#4f7a5a", "#a7b98a", "#2c3b33"], "Kelp, sand and shadow. Vanish against any shoal.", {"sail": 0.85}],
	["chevron", "Sunset Chevron", 1, 7, ["#f2b347", "#e4573d", "#6b2f86"], "Bold arrows in the colours of the last hour of the day.", {}],
	["tartan", "Highland Tartan", 1, 8, ["#1d4f3a", "#9c2a2a", "#f2c45a"], "A woven clan plaid of forest green and crimson, threaded with gold.", {}],
	["marble", "Carrara Marble", 1, 9, ["#ece8e1", "#8f8c88", "#d4a94a"], "Polished white stone veined in grey and gold. Absurdly heavy. Floats anyway.", {"sail": 0.5}],
	# epic
	["kintsugi", "Kintsugi Lacquer", 2, 10, ["#0d0c0f", "#2a1f3a", "#f0c35a"], "Mirror-black lacquer, every old battle scar mended in molten gold.", {}],
	["kraken", "Kraken Ink", 2, 11, ["#1a0f2e", "#7b2a8c", "#3fd1c4"], "Swirls of violet ink that slowly churn, as if something below is still stirring.", {"animated": true}],
	["damask", "Royal Damask", 2, 12, ["#7a1424", "#e8b84f", "#f6dfa0"], "Crimson velvet stamped with gilded rosettes, fit for an admiral of the crown.", {}],
	["mermaid", "Mermaid Scales", 2, 13, ["#0f5c63", "#3fb7b0", "#f3f0ff"], "Pearlescent scales that shift from teal to violet as she turns in the light.", {}],
	# legendary: alive, and glowing after dark
	["molten", "Molten Core", 3, 14, ["#1a1412", "#ff5a12", "#ffd56a"], "Black basalt split by rivers of lava that pulse and flow along her flanks.", {"glow": 1.0, "animated": true}],
	["aurora", "Aurora Borealis", 3, 15, ["#07122b", "#38ff9c", "#b46bff"], "Curtains of northern light ripple across a midnight hull and every sail.", {"glow": 1.0, "animated": true}],
	["starlit", "Starlit Voyage", 3, 16, ["#0b1033", "#5b2fa3", "#ff6fb5"], "A drifting nebula full of twinkling stars. Sail the night sky itself.", {"glow": 1.0, "animated": true}],
	["ghostfire", "Ghostfire", 3, 17, ["#0c1f1d", "#39ffb0", "#d8fff0"], "Spectral green flames lick up from the waterline and never burn a plank.", {"glow": 1.0, "animated": true}],
	["tide", "Living Tide", 3, 18, ["#06263d", "#3ff0ff", "#c8fff9"], "Rippling caustics and a bioluminescent swell that rolls from bow to stern.", {"glow": 1.0, "animated": true}],
]

## [style, name, rarity, tint (two colours for chips and frames), blurb, base]
const BLAST_LIST := [
	["powder", "Classic Powder", 0, ["#ffd9a0", "#d8d4cc"], "An honest flash and a great bank of white smoke.", true],
	["seasalt", "Sea Salt Burst", 0, ["#ffffff", "#cfe9f2"], "A crisp white flash and clean, bright smoke that hangs like sea fog.", false],
	["soot", "Blackpowder Fury", 0, ["#ff9a3d", "#3b3633"], "Cheap powder, double charge: a dirty orange flash and a wall of black soot.", false],
	["ember", "Ember Burst", 1, ["#ffb347", "#ff5a1f"], "A shower of glowing embers that arc out over the water and hiss as they land.", false],
	["ring", "Smoke Ring", 1, ["#ffffff", "#bcd4dc"], "Every gun blows a perfect, widening smoke ring. Pure showmanship.", false],
	["azure", "Azure Flame", 2, ["#7fe3ff", "#2f6bff"], "Copper salts in the charge: an ice-blue flash, cyan sparks and pale blue smoke.", false],
	["confetti", "Carnival Salute", 2, ["#ff6fb5", "#ffd23f"], "Fires a cloud of festival confetti with every broadside. Morale soars.", false],
	["dragon", "Dragon's Breath", 3, ["#ffcf4a", "#ff3d12"], "A roaring cone of fire from every gunport, then a slow rain of embers.", false],
	["thunder", "Thunderclap", 3, ["#e6ecff", "#9b7bff"], "A violet-white flash, crackling arcs and a shockwave that ripples across the sea.", false],
]

const TRAIL_LIST := [
	["powder", "Powder Wake", 0, ["#f2f0ec", "#ffb760"], "A thin wake of powder smoke with a hot spark at the ball.", true],
	["spray", "Sea Spray", 0, ["#e9fbff", "#9ad8ea"], "The ball drags a fine mist of salt spray behind it.", false],
	["soot", "Sooty Wake", 0, ["#5a5450", "#2c2826"], "A thick, dirty smoke line that hangs over the water.", false],
	["ember", "Ember Tail", 1, ["#ffb347", "#ff4d12"], "Burning embers fall from the shot all the way to its mark.", false],
	["frost", "Frost Wisp", 1, ["#c9f4ff", "#5cc8ff"], "An icy blue streak trailing glittering frost.", false],
	["comet", "Golden Comet", 2, ["#ffe08a", "#ff9f1c"], "A long golden tail with glowing motes, like a comet in broad daylight.", false],
	["ghost", "Ghostlight", 2, ["#9dffd6", "#22d67e"], "Green spectral wisps that coil and fade behind every ball.", false],
	["rainbow", "Rainbow Ribbon", 3, ["#ff5f6d", "#5fd0ff"], "A shimmering ribbon of every colour, with sparkles that drift away.", false],
	["starfall", "Starfall", 3, ["#ffffff", "#b38cff"], "A white-violet streak shedding twinkling stars that linger in the air.", false],
]

## What the particles and the shot shaders know each look by (an index into
## these); the wraith's are a phantom's own, never in the vault.
const BLAST_STYLES: Array[String] = ["powder", "seasalt", "soot", "ember", "ring", "azure", "confetti", "dragon", "thunder", "wraith"]
const TRAIL_STYLES: Array[String] = ["powder", "spray", "soot", "ember", "frost", "comet", "ghost", "rainbow", "starfall", "wraith"]

const BASE := {"skin": "skin:none", "blast": "blast:powder", "trail": "trail:powder"}

# ------------------------------------------------------------------ odds

const PULL_COST := 300
const TEN_COST := 2700
## A fresh vault's purse (the web's START_PURSE): paid in once, the first
## time a save meets the vault.
const START_PURSE := 1500
## Chances by rarity (legendary .. common) before pity kicks in.
const ODDS := [0.6, 0.28, 0.095, 0.025]
## A legendary is certain by this many opens, the odds climbing from SOFT_PITY on.
const HARD_PITY := 50
const SOFT_PITY := 35
## An epic or better at least once every this many opens.
const EPIC_PITY := 10
## Won items not yet looked at kept at most.
const UNSEEN_MAX := 64

static var _all: Array[Dictionary] = []
static var _by_id := {}


## Every item, in the web's order (skins, blasts, trails): {id ("kind:key"),
## kind, key, name, rarity, blurb, base}; a skin also {pattern, colors
## (three Colors), sail, glow, animated}, a blast or trail {style (its
## index in BLAST_STYLES / TRAIL_STYLES), tint (two Colors)}.
static func all() -> Array[Dictionary]:
	if _all.is_empty():
		for e: Array in SKIN_LIST:
			var o: Dictionary = e[6]
			var cs: Array[Color] = []
			for c: String in e[4]:
				cs.append(Color(c))
			_add({"id": "skin:" + str(e[0]), "kind": "skin", "key": e[0], "name": e[1], "rarity": e[2], "pattern": e[3], "colors": cs,
				"blurb": e[5], "base": bool(o.get("base", false)), "sail": float(o.get("sail", 1.0)), "glow": float(o.get("glow", 0.0)),
				"animated": bool(o.get("animated", false))})
		for pair: Array in [["blast", BLAST_LIST, BLAST_STYLES], ["trail", TRAIL_LIST, TRAIL_STYLES]]:
			for e: Array in pair[1]:
				_add({"id": "%s:%s" % [pair[0], e[0]], "kind": pair[0], "key": e[0], "name": e[1], "rarity": e[2],
					"style": (pair[2] as Array).find(e[0]), "tint": [Color(str(e[3][0])), Color(str(e[3][1]))], "blurb": e[4], "base": e[5]})
	return _all


static func _add(it: Dictionary) -> void:
	_all.append(it)
	_by_id[it.id] = it


## An item by id (empty if there's none).
static func item(id: String) -> Dictionary:
	all()
	return _by_id.get(id, {})


## A skin by id, or your own paintwork for anything else.
static func skin(id: String) -> Dictionary:
	var it := item(id)
	return it if it.get("kind", "") == "skin" else item(BASE.skin)


## The items of one kind, in the web's order.
static func of_kind(kind: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for it in all():
		if it.kind == kind:
			out.append(it)
	return out


## What the vault holds: everything but what every captain starts with.
static func pool() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for it in all():
		if not it.base:
			out.append(it)
	return out


## The style index (BLAST_STYLES / TRAIL_STYLES) an fx item's id stands for (0 plain powder).
static func style_of(id: String) -> int:
	var it := item(id)
	return maxi(0, int(it.get("style", 0)))


# ------------------------------------------------------------------ the vault


## A vault before its first open: {owned: {id: count}, equip: {kind: id},
## pity: {leg, epic}, pulls, daily (the day the free open was last used,
## YYYY-MM-DD), unseen: [won, not yet looked at]}.
static func fresh() -> Dictionary:
	return {
		"owned": {BASE.skin: 1, BASE.blast: 1, BASE.trail: 1},
		"equip": BASE.duplicate(),
		"pity": {"leg": 0, "epic": 0},
		"pulls": 0,
		"daily": "",
		"unseen": [],
	}


## A vault from a save, cleaned up the web's way (load()): unknown items,
## bad counts and anything equipped that isn't owned dropped.
static func sanitize(r: Variant) -> Dictionary:
	var s := fresh()
	if not r is Dictionary:
		return s
	var o: Dictionary = r
	var owned: Variant = o.get("owned")
	if owned is Dictionary:
		for k: Variant in owned:
			var v: Variant = owned[k]
			if not item(str(k)).is_empty() and (v is int or v is float) and is_finite(float(v)):
				s.owned[str(k)] = maxi(1, floori(float(v)))
	var eq: Variant = o.get("equip")
	if eq is Dictionary:
		for k in KINDS:
			var id := str((eq as Dictionary).get(k, ""))
			if item(id).get("kind", "") == k and s.owned.has(id):
				s.equip[k] = id
	var p: Variant = o.get("pity")
	if p is Dictionary:
		s.pity.leg = clampi(_int((p as Dictionary).get("leg")), 0, HARD_PITY - 1)
		s.pity.epic = clampi(_int((p as Dictionary).get("epic")), 0, EPIC_PITY - 1)
	s.pulls = maxi(0, _int(o.get("pulls")))
	if o.get("daily") is String:
		s.daily = str(o.daily).left(10)
	var un: Variant = o.get("unseen")
	if un is Array:
		for id: Variant in un:
			if id is String and not item(id).is_empty() and s.unseen.size() < UNSEEN_MAX:
				s.unseen.append(id)
	return s


static func _int(v: Variant) -> int:
	return floori(float(v)) if (v is int or v is float) and is_finite(float(v)) else 0


## How many of the vault's items it holds.
static func collected(v: Dictionary) -> int:
	var n := 0
	for it in pool():
		if (v.owned as Dictionary).has(it.id):
			n += 1
	return n


## Today as the vault's daily open counts it (YYYY-MM-DD, local time).
static func today() -> String:
	var d := Time.get_date_dict_from_system()
	return "%04d-%02d-%02d" % [d.year, d.month, d.day]


## Whether the day's free single open is still to be had.
static func free_ready(v: Dictionary, day := "") -> bool:
	return str(v.daily) != (day if day != "" else today())


## What an open of n (1 or 10) costs from `purse`: the purse after paying
## it (the day's free single changes nothing but the vault's day), or -1
## if it doesn't stretch that far.
static func pay(v: Dictionary, n: int, purse: int, day := "") -> int:
	var d := day if day != "" else today()
	if n == 1 and free_ready(v, d):
		v.daily = d
		return purse
	var cost := PULL_COST if n == 1 else TEN_COST
	return purse - cost if purse >= cost else -1


## Opens the chest n times (already paid for): each open's {item, fresh,
## refund}, a duplicate's refund for the caller to pay into the purse. A
## full ten always holds an epic or better. `rnd` gives 0 <= x < 1.
static func open(v: Dictionary, n: int, rnd := Callable()) -> Array[Dictionary]:
	var rs: Array[int] = []
	for i in n:
		rs.append(_roll(v, rnd))
	if n == 10 and rs.max() < 2:
		rs[rs.size() - 1] = 2
		v.pity.epic = 0
	var out: Array[Dictionary] = []
	for r in rs:
		out.append(_grant(v, r, rnd))
	v.pulls = int(v.pulls) + n
	return out


static func _roll(v: Dictionary, rnd: Callable) -> int:
	var p: Dictionary = v.pity
	p.leg = int(p.leg) + 1
	p.epic = int(p.epic) + 1
	var leg := 1.0 if p.leg >= HARD_PITY else float(ODDS[3]) + maxf(0.0, float(p.leg - SOFT_PITY)) * 0.06
	var r := Parts._r(rnd)
	var out := 0
	if r < leg:
		out = 3
	elif p.epic >= EPIC_PITY or r < leg + float(ODDS[2]):
		out = 2
	elif r < leg + float(ODDS[2]) + float(ODDS[1]):
		out = 1
	if out == 3:
		p.leg = 0
		p.epic = 0
	elif out == 2:
		p.epic = 0
	return out


## One item of a rarity, the vault favouring what you don't have yet.
static func _grant(v: Dictionary, r: int, rnd: Callable) -> Dictionary:
	var pool_r: Array[Dictionary] = []
	var w := PackedFloat32Array()
	var sum := 0.0
	for it in pool():
		if it.rarity == r:
			pool_r.append(it)
			var wi := 1.0 if (v.owned as Dictionary).has(it.id) else 3.0
			w.append(wi)
			sum += wi
	var x := Parts._r(rnd) * sum
	var it: Dictionary = pool_r[pool_r.size() - 1]
	for i in pool_r.size():
		x -= w[i]
		if x <= 0.0:
			it = pool_r[i]
			break
	return gain(v, it)


## An item into the vault (a pull's, or a trophy from the sea): {item,
## fresh, refund}, a duplicate's refund for the caller to pay.
static func gain(v: Dictionary, it: Dictionary) -> Dictionary:
	var owned: Dictionary = v.owned
	var first := not owned.has(it.id)
	owned[it.id] = int(owned.get(it.id, 0)) + 1
	if first and not (v.unseen as Array).has(it.id) and (v.unseen as Array).size() < UNSEEN_MAX:
		(v.unseen as Array).append(it.id)
	return {"item": it, "fresh": first, "refund": 0 if first else int(RARITIES[it.rarity].refund)}


## Opens left until a legendary is certain, and until an epic is.
static func pity_left(v: Dictionary) -> Vector2i:
	return Vector2i(HARD_PITY - int(v.pity.leg), EPIC_PITY - int(v.pity.epic))
