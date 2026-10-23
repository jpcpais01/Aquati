class_name CrewLook
extends RefCounted
## What a sailor looks like and what he's partial to: his palette (one linear
## colour per CrewModel palette slot; alpha above 0 glows that much, below 0
## stripes or spots the cloth), his hat, the kit he wears and whether he
## smokes a pipe or likes his grog. Rolled the web game's way (makeLook,
## src/ships/crew.ts): your hands in linen, slops and sea blues, pirates in
## black and blood red, every captain in a coat and tricorn, and most of them
## with a parrot.

const SKIN := ["#f3cfb1", "#e8b48e", "#d39a72", "#b97c55", "#965c3b", "#6e4129", "#4f2e1d"]
const HAIR := ["#1b1512", "#2e2018", "#4a3020", "#6b4325", "#8a5a2b", "#b98a4e", "#d8bf8a", "#8d8a86"]
const PLAYER := {
	"shirts": ["#efe7d6", "#f4f1ea", "#2a8f8c", "#7fb2c9", "#d9c39a"],
	"stripe": ["#22345a", "#1f6f86"],
	"trousers": ["#c9b58c", "#2f3d5c", "#59667a", "#8a7a5f"],
	"sash": ["#1fa3a0", "#e2b552", "#c0392b", "#2a6fb0"],
	"hats": [
		[CrewModel.HAT_BANDANA, ["#1fa3a0", "#c0392b", "#22345a"]],
		[CrewModel.HAT_KNIT, ["#22345a", "#b8322a", "#e8e0cf"]],
		[CrewModel.HAT_STRAW, ["#e3c98a", "#d6b871"]],
		[CrewModel.HAT_NONE, ["#000000"]],
	],
	"coat": ["#1f2d52"],
	"vests": ["#7a2f2a", "#2f3d5c", "#8a6a3c", "#3e6b5a", "#c9b58c"],
}
const PIRATE := {
	"shirts": ["#d9cfbd", "#7d2323", "#2a2526", "#5a4634", "#8b6d4a"],
	"stripe": ["#7d2323", "#1d1a1a"],
	"trousers": ["#2b2523", "#4a3a2c", "#3b3f45", "#6b5a45"],
	"sash": ["#a3241f", "#6b2b7a", "#c58a2c", "#1d1a1a"],
	"hats": [
		[CrewModel.HAT_BANDANA, ["#a3241f", "#1d1a1a", "#7d2323", "#6b2b7a"]],
		[CrewModel.HAT_KNIT, ["#4a4a4a", "#5a2020"]],
		[CrewModel.HAT_TRICORN, ["#1a1616"]],
		[CrewModel.HAT_NONE, ["#000000"]],
	],
	"coat": ["#5e1414", "#1c1717", "#3b1f4f"],
	"vests": ["#3a2a22", "#5e1414", "#2d2a33", "#6b4a2b", "#4a3a5a"],
}

var slots := PackedColorArray()
var hat := CrewModel.HAT_NONE
var flags := 0
## Lounges with a pipe, and sips grog, when there's a moment.
var smoker := false
var drinker := false


static func _col(hex: String, a: float = 0.0) -> Color:
	var c := Color(hex).srgb_to_linear()
	c.a = a
	return c


static func _pick(a: Array, rng: RandomNumberGenerator) -> Variant:
	return a[rng.randi() % a.size()]


## A new face for a crew: a pirate's or one of yours, the captain (in his
## coat) or the helmsman (never on a peg leg) or anyone else.
static func make(pirate: bool, captain: bool, helm: bool, rng: RandomNumberGenerator) -> CrewLook:
	var t: Dictionary = PIRATE if pirate else PLAYER
	var shirts: Array = t.shirts
	var skin := _col(_pick(SKIN, rng))
	var hair := _col(_pick(HAIR, rng))
	var shirt_hex: String = _pick(shirts, rng)
	var striped: bool = (shirt_hex == shirts[0] or shirt_hex == shirts[1]) and rng.randf() < 0.55
	var shirt := _col(shirt_hex, -15.0 if striped else 0.0)
	# short sleeves, sleeves rolled to the elbow, or long sleeves buttoned at the wrist
	var sleeves := rng.randf()
	var trousers := _col(_pick(t.trousers, rng))
	var barefoot := rng.randf() < (0.35 if pirate else 0.25)
	# bare calves, stockings, or long trousers to the ankle
	var legs := 0 if barefoot and rng.randf() < 0.6 else (1 if rng.randf() < 0.4 else 2)
	var sash := _col(_pick(t.sash, rng))
	var h: Array = _pick(t.hats, rng)
	var hat_kind: int = h[0]
	# half the bandanas are spotted
	var hat_col := _col(_pick(h[1], rng), -1.0 if hat_kind == CrewModel.HAT_BANDANA and rng.randf() < 0.5 else 0.0)
	var f := 0
	if rng.randf() < (0.5 if pirate else 0.28):
		f |= CrewModel.F_BEARD
	elif rng.randf() < (0.45 if pirate else 0.3):
		f |= CrewModel.F_MOUSTACHE
	if hat_kind != CrewModel.HAT_BANDANA and rng.randf() < 0.22:
		f |= CrewModel.F_PONYTAIL
	elif hat_kind == CrewModel.HAT_NONE and rng.randf() < 0.2:
		f |= CrewModel.F_LONGHAIR
	if hat_kind == CrewModel.HAT_NONE and f & (CrewModel.F_PONYTAIL | CrewModel.F_LONGHAIR) == 0 and rng.randf() < 0.3:
		f |= CrewModel.F_BALD
	if rng.randf() < (0.14 if pirate else 0.03):
		f |= CrewModel.F_PATCH
	if rng.randf() < (0.4 if pirate else 0.15):
		f |= CrewModel.F_EARRING
	if rng.randf() < (0.32 if pirate else 0.25):
		f |= CrewModel.F_VEST
	if rng.randf() < 0.4:
		f |= CrewModel.F_BELT
	if pirate and rng.randf() < 0.25:
		f |= CrewModel.F_PISTOL
	if rng.randf() < (0.25 if pirate else 0.35):
		f |= CrewModel.F_KERCHIEF
	var peg := not helm and rng.randf() < (0.09 if pirate else 0.03)
	if peg:
		f |= CrewModel.F_PEG
	elif not barefoot and rng.randf() < (0.4 if pirate else 0.3):
		f |= CrewModel.F_BOOTS
	if barefoot:
		f |= CrewModel.F_BAREFOOT
	if legs != 2 and f & CrewModel.F_BOOTS == 0:
		f |= CrewModel.F_GARTERS
	if sleeves > 0.3 and sleeves < 0.7:
		f |= CrewModel.F_ROLLED
	elif sleeves >= 0.7:
		f |= CrewModel.F_CUFFS

	var s := PackedColorArray()
	s.resize(CrewModel.SLOTS)
	s.fill(Color(1.0, 1.0, 1.0, 0.0))
	s[CrewModel.TINT_SKIN] = skin
	s[CrewModel.TINT_SHIRT] = shirt
	s[CrewModel.TINT_SLEEVE] = skin if sleeves <= 0.3 else shirt
	s[CrewModel.TINT_FOREARM] = skin if sleeves < 0.7 else shirt
	s[CrewModel.TINT_TROUSERS] = trousers
	s[CrewModel.TINT_SHIN] = skin if legs == 0 else (_col(_pick(["#e8e0cf", "#efe9dc", "#d9cdb4"], rng)) if legs == 1 else trousers)
	s[CrewModel.TINT_BOOTS] = _col(_pick(["#2a1f18", "#3b2a1e", "#1d1714", "#4a3222"], rng))
	s[CrewModel.TINT_SASH] = sash
	s[CrewModel.TINT_HAT] = hat_col
	s[CrewModel.TINT_HAIR] = hair
	s[CrewModel.TINT_COAT] = shirt
	s[CrewModel.TINT_TRIM] = _col("#d4a64a")
	s[CrewModel.TINT_WOOD] = _col("#8a6440")
	s[CrewModel.TINT_METAL] = _col("#c7ced6")
	s[CrewModel.TINT_GLOW] = _col("#ff7a2a", 7.0)
	s[CrewModel.TINT_CLOTH] = _col("#d8ccb0")
	s[CrewModel.TINT_STRIPE] = _col(_pick(t.stripe, rng))
	s[CrewModel.TINT_DARK] = _col("#1a1210")
	s[CrewModel.TINT_WHITE] = _col("#f6f2ea")
	s[CrewModel.TINT_PUPIL] = _col(_pick(["#5a3a1e", "#6b4423", "#3f2a18", "#3b6e8f", "#4a7a9a", "#4f7a3a", "#7a6a2a"], rng))
	s[CrewModel.TINT_MOUTH] = _col("#4a1618")
	s[CrewModel.TINT_TONGUE] = _col("#c75a5e")
	s[CrewModel.TINT_SHINE] = _col("#ffffff", 0.6)
	s[CrewModel.TINT_PARROT] = _col("#d8322a" if rng.randf() < 0.75 else "#2fae55")
	s[CrewModel.TINT_WING] = _col("#2a6fd0" if rng.randf() < 0.7 else "#f2c230")
	s[CrewModel.TINT_BEAK] = _col("#efe2c0")
	s[CrewModel.TINT_VEST] = _col(_pick(t.vests, rng))
	s[CrewModel.TINT_PLUME] = _col(_pick(["#1a1616", "#a3241f", "#efe6d6"] if pirate else ["#f6f2ea", "#1fa3a0"], rng))
	s[CrewModel.TINT_LEATHER] = _col(_pick(["#3b2a1e", "#2a1f18", "#5a3a24"], rng))
	s[CrewModel.TINT_GHOST] = Color(0.0, 0.0, 0.0, 0.0)
	if captain:
		var coat := _col(_pick(t.coat, rng))
		hat_kind = CrewModel.HAT_TRICORN
		s[CrewModel.TINT_HAT] = _col("#141010" if pirate else "#1a1a26")
		s[CrewModel.TINT_COAT] = coat
		s[CrewModel.TINT_SHIRT] = coat
		s[CrewModel.TINT_SLEEVE] = coat
		s[CrewModel.TINT_FOREARM] = coat
		s[CrewModel.TINT_TROUSERS] = _col("#2b2523" if pirate else "#e8e0cf")
		s[CrewModel.TINT_SHIN] = _col("#1d1714")
		s[CrewModel.TINT_BOOTS] = _col("#1d1714")
		s[CrewModel.TINT_SASH] = _col("#a3241f" if pirate else "#e2b552")
		var keep := CrewModel.F_BEARD | CrewModel.F_MOUSTACHE | CrewModel.F_EARRING | CrewModel.F_PATCH | CrewModel.F_LONGHAIR | CrewModel.F_BALD
		f = (f & keep) | CrewModel.F_COAT | CrewModel.F_BOOTS | CrewModel.F_PLUME | CrewModel.F_BELT | (CrewModel.F_PONYTAIL if rng.randf() < 0.5 else 0)
		if pirate and rng.randf() < 0.8:
			f |= CrewModel.F_BEARD if rng.randf() < 0.6 else CrewModel.F_MOUSTACHE
		if pirate and rng.randf() < 0.4:
			f |= CrewModel.F_PATCH
		if pirate and rng.randf() < 0.25:
			f = (f & ~CrewModel.F_BOOTS) | CrewModel.F_PEG
		# every captain worth the name keeps a parrot; ours always does
		if not pirate or rng.randf() < 0.6:
			f |= CrewModel.F_PARROT
		if f & CrewModel.F_LONGHAIR:
			f &= ~CrewModel.F_PONYTAIL
	var look := CrewLook.new()
	look.slots = s
	look.hat = hat_kind
	look.flags = f
	look.smoker = rng.randf() < 0.35
	look.drinker = rng.randf() < 0.5
	return look
