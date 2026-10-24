class_name Parts
## Ship upgrades: real parts bolted onto her, in four slots (hull plating,
## sails, guns and the figurehead) and five rarities. Each one changes how
## she sails and fights, and each one is built into her model, so you can
## see it: the common ones are honest shipwright's work, and the higher you
## climb the stranger they get, until the mythic parts are frankly not of
## this world. They are found in chests and wrecks, bought from the
## shipwrights at the trading ports, or carried into battle by the odd
## pirate, and every class of ship you sail carries her own refit (the
## locker and the fits are kept by Progress). Ported from the web game's
## src/ships/parts.ts: the same parts, figures, odds and the same stock in
## the same port on the same day.
##
## A loadout is {slot: part id}; a slot left out has the standard fit.

const SLOTS: Array[String] = ["hull", "sails", "guns", "figure"]
const SLOT_NAMES := {"hull": "Hull plating", "sails": "Sails", "guns": "Guns", "figure": "Figurehead"}

## Each rarity: its name, its colour and a deeper one for gradients, what a
## port's shipwright asks for a part of it, and the gold a spare fetches.
const RARITIES: Array[Dictionary] = [
	{"id": "common", "name": "Common", "css": Color("#d8cfb8"), "deep": Color("#857a62"), "price": 600, "refund": 150},
	{"id": "rare", "name": "Rare", "css": Color("#6cc8ff"), "deep": Color("#1f6fd1"), "price": 1800, "refund": 450},
	{"id": "epic", "name": "Epic", "css": Color("#c48bff"), "deep": Color("#7a35d6"), "price": 5000, "refund": 1200},
	{"id": "legendary", "name": "Legendary", "css": Color("#ffbe3d"), "deep": Color("#e0701a"), "price": 14000, "refund": 3500},
	{"id": "mythic", "name": "Mythic", "css": Color("#ff5f9e"), "deep": Color("#5b2bd6"), "price": 40000, "refund": 10000},
]

## The bonuses are fractions of the class's own figures (armour is added
## outright): hp, armor, speed, accel, turn, reload, damage, range and luck
## (better odds of a part in a chest or a wreck).
const STATS: Array[String] = ["hp", "armor", "speed", "accel", "turn", "reload", "damage", "range", "luck"]

## [slot, tier, key, name, stats, blurb]
const LIST := [
	# hull plating: heavier and harder to hole, until the mythic aegis weighs nothing at all
	["hull", 0, "strakes", "Oak Rubbing Strakes", {"hp": 0.06, "armor": 0.02, "speed": -0.01}, "Extra oak fenders bolted along her sides and rope bumpers hung over the rail. She shrugs off a scrape."],
	["hull", 1, "iron", "Iron-Strapped Hull", {"hp": 0.12, "armor": 0.04, "speed": -0.02}, "Wrought-iron straps from rail to waterline and an iron-capped gunwale. Heavier, and far harder to hole."],
	["hull", 2, "pavisade", "Bronze Pavisade", {"hp": 0.18, "armor": 0.06, "speed": -0.02}, "A wall of bronze-bossed shields hung along her rails, and a bronze ram at the cutwater."],
	["hull", 3, "dragonscale", "Dragonscale Plating", {"hp": 0.26, "armor": 0.09, "speed": -0.02}, "Gilded scales layered like a dragon's hide, with a crest of golden spines along each rail."],
	["hull", 4, "aegis", "Leviathan Aegis", {"hp": 0.36, "armor": 0.12}, "Obsidian armour veined with living light, watched over by hovering wards of glowing glass. Weighs nothing. Stops everything."],
	# sails
	["sails", 0, "storm", "Storm Canvas", {"speed": 0.04, "accel": 0.05}, "Doubled cloths, reinforced edges and three rows of reef points. Holds a gale without splitting."],
	["sails", 1, "clipper", "Clipper Cloth", {"speed": 0.07, "accel": 0.1, "turn": 0.03}, "Tight-woven racing canvas cut flat for speed, bound in crimson, with brass wind vanes on every masthead."],
	["sails", 2, "batwing", "Batwing Battens", {"speed": 0.1, "accel": 0.15, "turn": 0.05}, "Bamboo-battened cloth that opens like a fan and claws round onto any wind."],
	["sails", 3, "phoenix", "Phoenix Canvas", {"speed": 0.14, "accel": 0.22, "turn": 0.08}, "Embroidered in gold thread with a rising phoenix and crowned with golden suns. It catches the light, and the wind, like nothing else."],
	["sails", 4, "aether", "Aether Sails", {"speed": 0.19, "accel": 0.3, "turn": 0.12}, "Woven from storm light. Currents of starfire run through the cloth while crystal shards circle every masthead."],
	# guns
	["guns", 0, "bronze", "Bronze Long Guns", {"damage": 0.05, "reload": 0.03}, "Cast bronze with extra reinforce rings. Warm to the touch and a shade harder-hitting."],
	["guns", 1, "culverin", "Blued Culverins", {"damage": 0.1, "reload": 0.06, "range": 0.03}, "Long, slender barrels of blued steel banded in brass. They reach further and reload quicker."],
	["guns", 2, "bombard", "Siege Bombards", {"damage": 0.15, "reload": 0.09, "range": 0.05}, "Fat-bellied guns with flared, crowned muzzles. Every broadside lands like a falling wall."],
	["guns", 3, "dragonmaw", "Dragonmaw Cannons", {"damage": 0.22, "reload": 0.13, "range": 0.08}, "Gilded barrels cast as roaring dragons with ember eyes. The shot leaves their jaws like fire."],
	["guns", 4, "starfire", "Starfire Lances", {"damage": 0.3, "reload": 0.18, "range": 0.12}, "Ring-bound lances humming with captured starlight. Nobody knows who forged them, or how."],
	# figureheads
	["figure", 0, "lion", "Oak Lion", {"turn": 0.05, "luck": 0.05}, "A proud carved lion with a painted mane. Steady at the helm, steady in a fight."],
	["figure", 1, "eagle", "Sea Eagle", {"turn": 0.09, "speed": 0.02, "luck": 0.1}, "A white-headed eagle, wings swept back along the bows, beak into the wind."],
	["figure", 2, "kraken", "Gilded Kraken", {"turn": 0.13, "speed": 0.03, "luck": 0.18}, "A golden kraken coiled round the stem, tentacles curling down the cutwater. Fortune follows it."],
	["figure", 3, "dragon", "Golden Dragon", {"turn": 0.18, "speed": 0.04, "hp": 0.04, "luck": 0.28}, "A horned dragon reaching out over the waves, eyes like coals. Pirates have struck their colours on sight."],
	["figure", 4, "seraph", "Celestial Seraph", {"turn": 0.24, "speed": 0.05, "hp": 0.06, "luck": 0.4}, "A pearl-white seraph with wings of living crystal and a halo that never stops turning."],
]

const CLASS_IDS: Array[String] = ["sloop", "brig", "galleon"]
## The minus sign the web writes a loss with.
const MINUS := "−"

static var _all: Array[Dictionary] = []
static var _by_id := {}
## Classes refitted with a loadout, by class and loadout (a refit is just figures).
static var _refits := {}
static var _refit_lock := Mutex.new()


## Every part, in the web's order: {id ("slot:key"), slot, tier, key, name, stats, blurb}.
static func all() -> Array[Dictionary]:
	if _all.is_empty():
		for e: Array in LIST:
			var p := {"id": "%s:%s" % [e[0], e[2]], "slot": e[0], "tier": e[1], "key": e[2], "name": e[3], "stats": e[4], "blurb": e[5]}
			_all.append(p)
			_by_id[p.id] = p
	return _all


## A part by its id (empty if there's no such part).
static func part(id: String) -> Dictionary:
	all()
	return _by_id.get(id, {})


## A slot's parts, common to mythic.
static func of_slot(slot: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for p in all():
		if p.slot == slot:
			out.append(p)
	return out


## The parts of a loadout, by slot (only real parts in their own slots).
static func loadout_parts(l: Dictionary) -> Dictionary:
	var out := {}
	for s in SLOTS:
		var p := part(str(l.get(s, "")))
		if not p.is_empty() and p.slot == s:
			out[s] = p
	return out


## A loadout with only real parts in their own slots, in slot order.
static func clean(l: Dictionary) -> Dictionary:
	var out := {}
	var ps := loadout_parts(l)
	for s in SLOTS:
		if ps.has(s):
			out[s] = ps[s].id
	return out


## A loadout as one word, for telling hulls built with it apart ("" standard).
static func key(l: Dictionary) -> String:
	var ps := loadout_parts(l)
	var bits := PackedStringArray()
	for s in SLOTS:
		if ps.has(s):
			bits.append(ps[s].id)
	return ",".join(bits)


## Every bonus of a loadout added up.
static func loadout_stats(l: Dictionary) -> Dictionary:
	var t := {}
	for k in STATS:
		t[k] = 0.0
	var ps := loadout_parts(l)
	for s: String in ps:
		var st: Dictionary = ps[s].stats
		for k: String in st:
			t[k] += float(st[k])
	return t


## A ship class refitted with a loadout: the same hull and rig, better
## figures (the class itself with the standard fit).
static func refit(c: ShipClass, l: Dictionary) -> ShipClass:
	var base := ShipClass.named(c.id)
	var k := key(l)
	if k == "":
		return base
	var ck := "%s|%s" % [c.id, k]
	_refit_lock.lock()
	var got: ShipClass = _refits.get(ck)
	_refit_lock.unlock()
	if got != null:
		return got
	var s := loadout_stats(l)
	var r := base.copy()
	r.hp = float(roundi(base.hp * (1.0 + s.hp)))
	r.armor = minf(0.62, base.armor + s.armor)
	r.max_speed = base.max_speed * (1.0 + s.speed)
	r.accel = base.accel * (1.0 + s.accel)
	r.turn_rate = base.turn_rate * (1.0 + s.turn)
	r.reload = base.reload * (1.0 - s.reload)
	r.damage = base.damage * (1.0 + s.damage)
	r.muzzle_speed = base.muzzle_speed * sqrt(1.0 + s.range * 2.0)
	_refit_lock.lock()
	_refits[ck] = r
	_refit_lock.unlock()
	return r


## The harbour's 0..1 bars after a refit (scaled the way the bars are).
static func refit_bars(c: ShipClass, l: Dictionary) -> Dictionary:
	var s := loadout_stats(l)
	var b := ShipClass.named(c.id).stats
	return {
		"speed": float(b.speed) * (1.0 + s.speed),
		"agility": float(b.agility) * (1.0 + s.turn * 0.7 + s.accel * 0.3),
		"armour": float(b.armour) + s.armor * 2.2,
		"hull": float(b.hull) * (1.0 + s.hp),
		"firepower": float(b.firepower) * (1.0 + s.damage) / (1.0 - s.reload),
	}


## A draw from `rnd` (0 <= x < 1), or the engine's own when none is given.
static func _r(rnd: Callable) -> float:
	return float(rnd.call()) if rnd.is_valid() else randf()


static func _pct(v: float) -> String:
	return "%s%d%%" % ["+" if v > 0.0 else MINUS, roundi(absf(v) * 100.0)]


## Short lines for a part's card, each [text, bad]: "+12% hull", "−2% speed".
static func stat_lines(st: Dictionary) -> Array:
	var out := []
	var add := func(k: String, label: String, invert: bool) -> void:
		var v := float(st.get(k, 0.0))
		if v != 0.0:
			out.append([_pct(-v if invert else v) + " " + label, v < 0.0])
	add.call("hp", "hull", false)
	if float(st.get("armor", 0.0)) != 0.0:
		out.append(["+%d armour" % roundi(float(st.armor) * 100.0), false])
	add.call("speed", "speed", false)
	add.call("accel", "acceleration", false)
	add.call("turn", "turning", false)
	add.call("damage", "damage", false)
	add.call("reload", "reload", true)
	add.call("range", "range", false)
	if float(st.get("luck", 0.0)) != 0.0:
		out.append(["+%d%% salvage luck" % roundi(float(st.luck) * 100.0), false])
	return out


# ------------------------------------------------------------------ finding them


## A random part of a tier (any slot), favouring ones not yet owned (`owned`
## takes an id); `rnd` gives 0 <= x < 1.
static func roll_part(tier: int, owned: Callable, rnd := Callable()) -> Dictionary:
	var pool: Array[Dictionary] = []
	var w := PackedFloat32Array()
	var sum := 0.0
	for p in all():
		if p.tier == tier:
			pool.append(p)
			var wi := 1.0 if owned.call(p.id) else 3.0
			w.append(wi)
			sum += wi
	var x := _r(rnd) * sum
	for i in pool.size():
		x -= w[i]
		if x <= 0.0:
			return pool[i]
	return pool[pool.size() - 1]


## Whether a floating chest of this tier (0 a barrel .. 4 legendary) holds a
## part, and how rare (-1: none). Luck (from the figurehead) raises the chance.
static func chest_part(tier: int, luck: float, rnd := Callable()) -> int:
	var chance := float([0.015, 0.06, 0.14, 0.3, 0.6][clampi(tier, 0, 4)]) * (1.0 + luck)
	if _r(rnd) > chance:
		return -1
	# mostly a rarity at or a step below the chest's own, now and then one above
	var r := _r(rnd)
	var base := maxi(0, tier - 1)
	var t := base if r < 0.55 else (mini(4, base + 1) if r < 0.9 else mini(4, base + 2))
	# mythics stay mythic: only the best chests, and rarely
	if t == 4 and not (tier >= 3 and _r(rnd) < 0.35):
		t = 3
	return t


## What an enemy ship carries into battle: now and then a prize fitting of
## plating, guns or a figurehead (her sails are her own), finer on a galleon.
static func pirate_fit(cls_id: String, rnd := Callable()) -> Dictionary:
	var n := float({"sloop": 0.05, "brig": 0.14, "galleon": 0.3}.get(cls_id, 0.0))
	if _r(rnd) > n:
		return {}
	var r := _r(rnd)
	var tier := 0
	if cls_id == "galleon":
		tier = 1 if r < 0.4 else (2 if r < 0.8 else (3 if r < 0.97 else 4))
	else:
		tier = 0 if r < 0.5 else (1 if r < 0.85 else 2)
	var slot := str(["hull", "guns", "figure"][int(_r(rnd) * 3.0)])
	var pool: Array[Dictionary] = []
	for p in all():
		if p.tier == tier and p.slot == slot:
			pool.append(p)
	return {slot: pool[int(_r(rnd) * pool.size())].id}


## Three parts a trading port's shipwright has in today (`port_seed` is the
## port's place among them, from 1), the same all day, as on the web.
static func port_stock(port_seed: int, day := -1) -> Array[Dictionary]:
	if day < 0:
		day = day_number()
	var r := Mulberry32.new((port_seed * 2654435761 + day * 40503) & 0xFFFFFFFF)
	var tiers := [0, 1, 2 if r.next() < 0.65 else 3]
	# one yard in a while has something truly special in
	if r.next() < 0.18:
		tiers[2] = 4 if r.next() < 0.3 else 3
	var out: Array[Dictionary] = []
	for t: int in tiers:
		var pool: Array[Dictionary] = []
		for p in all():
			if p.tier != t:
				continue
			var taken := false
			for o in out:
				if o.slot == p.slot:
					taken = true
			if not taken:
				pool.append(p)
		out.append(pool[int(r.next() * pool.size())])
	return out


## Today, counted in local days since 1970 (the web's dayNumber).
static func day_number() -> int:
	var ms := Time.get_unix_time_from_system() * 1000.0 + float(Time.get_time_zone_from_system().get("bias", 0)) * 60000.0
	return floori(ms / 86400000.0)


# ------------------------------------------------------------------ the locker


## An empty locker: {owned: {id: count}, fit: {class: loadout}, unseen: [ids found
## but not yet looked at in the Shipwright]}.
static func fresh() -> Dictionary:
	return {"owned": {}, "fit": {}, "unseen": []}


## A locker from a save, cleaned up: unknown parts, counts and fits of parts
## not owned dropped.
static func sanitize(r: Variant) -> Dictionary:
	var s := fresh()
	if not r is Dictionary:
		return s
	var o: Dictionary = r
	var owned: Variant = o.get("owned")
	if owned is Dictionary:
		for k: Variant in owned:
			var v: Variant = owned[k]
			if not part(str(k)).is_empty() and (v is int or v is float) and is_finite(float(v)) and float(v) >= 1.0:
				s.owned[str(k)] = int(v)
	var fit: Variant = o.get("fit")
	if fit is Dictionary:
		for c in CLASS_IDS:
			var l: Variant = (fit as Dictionary).get(c)
			if not l is Dictionary:
				continue
			var f := {}
			for slot in SLOTS:
				var id := str((l as Dictionary).get(slot, ""))
				var p := part(id)
				if not p.is_empty() and p.slot == slot and s.owned.has(id):
					f[slot] = id
			s.fit[c] = f
	var unseen: Variant = o.get("unseen")
	if unseen is Array:
		for id: Variant in unseen:
			if not part(str(id)).is_empty() and not s.unseen.has(str(id)) and s.unseen.size() < 32:
				s.unseen.append(str(id))
	return s
