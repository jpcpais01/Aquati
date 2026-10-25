class_name ShipClass
extends RefCounted
## A kind of ship: her hull's lines, her rig, and how she sails and fights.
## Ported from the web game's src/ships/shipTypes.ts.

var id := ""
var name := ""
var title := ""
var blurb := ""
var length := 15.0
var beam := 4.6
var draft := 1.5
var freeboard := 1.55
var bulwark := 0.7
## Stern width as a fraction of the beam.
var transom := 0.62
var sheer_bow := 0.75
var sheer_stern := 0.35
var tumblehome := 0.06
## {t, h} or empty: a raised deck aft of t / forward of t, h metres up.
var stern_castle := {}
var fore_castle := {}
## Each {t (0 stern .. 1 bow), height, rig ("square", "gaff", "lateen"), tiers, top, span}.
var masts: Array[Dictionary] = []
var bowsprit := 5.5
var jib := true
var cannons_per_side := 3
var cannon_span := Vector2(0.3, 0.72)
## Stern chasers, firing aft.
var chasers := 0
var hp := 260.0
## 0..1 damage reduction.
var armor := 0.08
## m/s
var max_speed := 15.5
var accel := 0.55
## rad/s at full way
var turn_rate := 0.95
## seconds per broadside
var reload := 2.4
var damage := 21.0
var muzzle_speed := 58.0
## Buoyancy response (higher = calmer).
var mass := 1.0
## How she compares, 0..1 each (the harbour's bars): speed, agility, armour,
## hull and firepower.
var stats := {}
## An event ship's (ShipEvents): the event she belongs to ("" for the three
## ships of the line), the livery she always wears (her own: the Shipwright
## doesn't repaint her), whether she's built haunted (ShipModel._build_haunt)
## and the power she's given (Haunt: "phantom").
var event := ""
var livery := ""
var haunt := false
var ability := ""
## A merchantman's deck cargo, 0 none .. 1 piled high (Convoys: her guns are
## none, her waist full of crates, casks and sacks; ShipModel._build_cargo).
var cargo := 0.0

const DEFS := {
	"sloop": {
		"name": "Sloop", "title": "Kestrel",
		"blurb": "A darting single-master. Outruns anything afloat and turns on a doubloon, but splinters easily.",
		"length": 15.0, "beam": 4.6, "draft": 1.5, "freeboard": 1.55, "bulwark": 0.7, "transom": 0.62,
		"sheer_bow": 0.75, "sheer_stern": 0.35, "tumblehome": 0.06,
		"masts": [{"t": 0.6, "height": 14.5, "rig": "gaff", "tiers": 1}],
		"bowsprit": 5.5, "jib": true, "cannons_per_side": 3, "cannon_span": Vector2(0.3, 0.72), "chasers": 0,
		"hp": 260.0, "armor": 0.08, "max_speed": 15.5, "accel": 0.55, "turn_rate": 0.95, "reload": 2.4,
		"damage": 21.0, "muzzle_speed": 58.0, "mass": 1.0,
		"stats": {"speed": 1.0, "agility": 1.0, "armour": 0.25, "hull": 0.33, "firepower": 0.3},
	},
	"brig": {
		"name": "Brigantine", "title": "Corsair",
		"blurb": "The balanced raider. Two masts of canvas, a respectable broadside and a hull that can take a beating.",
		"length": 21.0, "beam": 6.2, "draft": 2.1, "freeboard": 1.9, "bulwark": 0.85, "transom": 0.7,
		"sheer_bow": 0.95, "sheer_stern": 0.55, "tumblehome": 0.09,
		"stern_castle": {"t": 0.24, "h": 1.35},
		"masts": [
			{"t": 0.38, "height": 18.0, "rig": "square", "tiers": 2, "top": true},
			{"t": 0.68, "height": 19.5, "rig": "square", "tiers": 2, "top": true},
		],
		"bowsprit": 6.5, "jib": true, "cannons_per_side": 5, "cannon_span": Vector2(0.27, 0.78), "chasers": 1,
		"hp": 430.0, "armor": 0.24, "max_speed": 12.2, "accel": 0.38, "turn_rate": 0.62, "reload": 3.2,
		"damage": 24.0, "muzzle_speed": 60.0, "mass": 1.6,
		"stats": {"speed": 0.72, "agility": 0.62, "armour": 0.55, "hull": 0.6, "firepower": 0.6},
	},
	"galleon": {
		"name": "Galleon", "title": "Leviathan",
		"blurb": "A floating fortress with three masts and towering castles. Slow to turn, devastating when she does.",
		"length": 29.0, "beam": 8.6, "draft": 2.8, "freeboard": 2.3, "bulwark": 0.95, "transom": 0.78,
		"sheer_bow": 1.3, "sheer_stern": 0.9, "tumblehome": 0.13,
		"stern_castle": {"t": 0.27, "h": 2.1}, "fore_castle": {"t": 0.84, "h": 1.3},
		"masts": [
			{"t": 0.22, "height": 19.0, "rig": "lateen", "tiers": 1},
			{"t": 0.5, "height": 26.0, "rig": "square", "tiers": 3, "top": true},
			{"t": 0.74, "height": 23.0, "rig": "square", "tiers": 3, "top": true},
		],
		"bowsprit": 8.0, "jib": true, "cannons_per_side": 8, "cannon_span": Vector2(0.2, 0.82), "chasers": 2,
		"hp": 760.0, "armor": 0.4, "max_speed": 8.8, "accel": 0.24, "turn_rate": 0.38, "reload": 4.2,
		"damage": 26.0, "muzzle_speed": 62.0, "mass": 2.6,
		"stats": {"speed": 0.42, "agility": 0.3, "armour": 0.95, "hull": 1.0, "firepower": 1.0},
	},
	# Hallowtide's event ship: a cursed galleon, broad as a barn and swaybacked
	# as a crescent moon, her castles towering like a haunted manor, sides
	# pinched in hard at the rail. Faster than her bulk has any right to be
	# (the dead don't wait on the wind), and once in a while she slips across
	# into the spirit world (Haunt).
	"revenant": {
		"name": "Revenant", "title": "Hollow Jack",
		"blurb": "A cursed galleon crewed by the drowned, lit by jack-o'-lanterns and ghost-fire. Once in a while she slips into the spirit world, where no shot can touch her.",
		"event": "hallowtide", "livery": "hallow", "haunt": true, "ability": "phantom",
		"length": 26.0, "beam": 9.2, "draft": 2.4, "freeboard": 2.2, "bulwark": 0.95, "transom": 0.86,
		"sheer_bow": 1.9, "sheer_stern": 1.25, "tumblehome": 0.21,
		"stern_castle": {"t": 0.29, "h": 2.5}, "fore_castle": {"t": 0.83, "h": 1.4},
		"masts": [
			{"t": 0.21, "height": 18.5, "rig": "lateen", "tiers": 1, "span": 1.05},
			{"t": 0.5, "height": 25.0, "rig": "square", "tiers": 3, "top": true},
			{"t": 0.73, "height": 21.5, "rig": "square", "tiers": 2, "top": true},
		],
		"bowsprit": 7.5, "jib": true, "cannons_per_side": 6, "cannon_span": Vector2(0.31, 0.8), "chasers": 2,
		"hp": 680.0, "armor": 0.36, "max_speed": 12.4, "accel": 0.36, "turn_rate": 0.56, "reload": 3.1,
		"damage": 29.0, "muzzle_speed": 63.0, "mass": 2.1,
		"stats": {"speed": 0.7, "agility": 0.52, "armour": 0.85, "hull": 0.9, "firepower": 0.85},
	},
	# the merchant houses' hulls (Convoys): no guns, cargo lashed on deck.
	# A tubby Ronvliet fluyt, pear-shaped in section, broad at the waterline
	# and pinched at the rail...
	"fluyt": {
		"name": "Fluyt", "title": "Fluyt", "cargo": 1.0,
		"blurb": "A round-bellied Ronvliet cargo carrier, narrow on deck and wide in the hold.",
		"length": 18.5, "beam": 6.4, "draft": 2.1, "freeboard": 1.7, "bulwark": 0.8, "transom": 0.46,
		"sheer_bow": 0.75, "sheer_stern": 0.75, "tumblehome": 0.2,
		"stern_castle": {"t": 0.2, "h": 1.7},
		"masts": [
			{"t": 0.16, "height": 10.5, "rig": "lateen", "tiers": 1, "span": 0.75},
			{"t": 0.47, "height": 16.5, "rig": "square", "tiers": 2, "top": true},
			{"t": 0.76, "height": 14.5, "rig": "square", "tiers": 2},
		],
		"bowsprit": 5.5, "jib": true, "cannons_per_side": 0, "chasers": 0,
		"hp": 560.0, "armor": 0.1, "max_speed": 7.4, "accel": 0.26, "turn_rate": 0.42, "reload": 99.0,
		"damage": 0.0, "muzzle_speed": 50.0, "mass": 2.1,
		"stats": {"speed": 0.4, "agility": 0.3, "armour": 0.3, "hull": 0.7, "firepower": 0.0},
	},
	# ...a long, low Aguadouro xebec under three great lateens, running bullion...
	"xebec": {
		"name": "Xebec", "title": "Xebec", "cargo": 0.45,
		"blurb": "A long, low bullion runner under three great lateens, quick enough to show any thief her stern.",
		"length": 17.5, "beam": 4.4, "draft": 1.5, "freeboard": 1.35, "bulwark": 0.72, "transom": 0.5,
		"sheer_bow": 1.0, "sheer_stern": 0.8, "tumblehome": 0.04,
		"masts": [
			{"t": 0.2, "height": 11.5, "rig": "lateen", "tiers": 1, "span": 0.85},
			{"t": 0.5, "height": 15.0, "rig": "lateen", "tiers": 1, "span": 1.15},
			{"t": 0.8, "height": 13.5, "rig": "lateen", "tiers": 1, "span": 1.05},
		],
		"bowsprit": 6.5, "jib": false, "cannons_per_side": 0, "chasers": 0,
		"hp": 420.0, "armor": 0.1, "max_speed": 9.6, "accel": 0.4, "turn_rate": 0.7, "reload": 99.0,
		"damage": 0.0, "muzzle_speed": 50.0, "mass": 1.2,
		"stats": {"speed": 0.6, "agility": 0.7, "armour": 0.2, "hull": 0.5, "firepower": 0.0},
	},
	# ...and a little tan-sailed Vila Garoa ketch out of the mist, deck full of tea chests.
	"ketch": {
		"name": "Ketch", "title": "Ketch", "cargo": 0.8,
		"blurb": "A little two-masted packet from the mist, tan sails and a deck full of tea chests.",
		"length": 12.5, "beam": 4.3, "draft": 1.3, "freeboard": 1.3, "bulwark": 0.66, "transom": 0.64,
		"sheer_bow": 0.75, "sheer_stern": 0.45, "tumblehome": 0.05,
		"masts": [
			{"t": 0.2, "height": 9.0, "rig": "gaff", "tiers": 1, "span": 0.5},
			{"t": 0.6, "height": 12.5, "rig": "gaff", "tiers": 1, "span": 0.66},
		],
		"bowsprit": 4.6, "jib": true, "cannons_per_side": 0, "chasers": 0,
		"hp": 300.0, "armor": 0.1, "max_speed": 10.2, "accel": 0.5, "turn_rate": 0.85, "reload": 99.0,
		"damage": 0.0, "muzzle_speed": 50.0, "mass": 0.85,
		"stats": {"speed": 0.7, "agility": 0.85, "armour": 0.15, "hull": 0.3, "firepower": 0.0},
	},
}

static var _cache := {}


static func named(class_id: String) -> ShipClass:
	if _cache.has(class_id):
		return _cache[class_id]
	var c := ShipClass.new()
	c.id = class_id
	var d: Dictionary = DEFS[class_id]
	for key: String in d:
		if key == "masts":
			for m: Dictionary in d[key]:
				c.masts.append(m)
		else:
			c.set(key, d[key])
	_cache[class_id] = c
	return c


## A copy of her (a refit changes her figures, see Parts.refit): the same
## hull and rig, the lists shared.
func copy() -> ShipClass:
	var c := ShipClass.new()
	for p: Dictionary in get_property_list():
		if int(p.usage) & PROPERTY_USAGE_SCRIPT_VARIABLE:
			c.set(p.name, get(p.name))
	return c


## One of the event ships (ShipEvents), not of the line.
func is_event() -> bool:
	return event != ""


## Gun positions along the hull, 0 stern .. 1 bow.
func cannon_ts() -> PackedFloat32Array:
	var out := PackedFloat32Array()
	for i in cannons_per_side:
		out.append(lerpf(cannon_span.x, cannon_span.y, (i + 0.5) / cannons_per_side))
	return out
