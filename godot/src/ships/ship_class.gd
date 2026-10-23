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


## Gun positions along the hull, 0 stern .. 1 bow.
func cannon_ts() -> PackedFloat32Array:
	var out := PackedFloat32Array()
	for i in cannons_per_side:
		out.append(lerpf(cannon_span.x, cannon_span.y, (i + 0.5) / cannons_per_side))
	return out
