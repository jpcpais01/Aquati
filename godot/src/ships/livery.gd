class_name Livery
extends RefCounted
## A ship's paint: hull bands, canvas, emblem and flag. Colours are sRGB, as
## a painter would pick them; the materials convert them.

var id := ""
## planking base
var hull := Color("#7a4b2a")
var bottom := Color("#b33a2c")
var boot := Color("#f5efe1")
var strake := Color("#1f8a8a")
var wale := Color("#21160f")
var trim := Color("#e2b552")
var sail := Color("#f4ead4")
var sail_seam := Color("#d9c9a8")
## "sun", "skull" or "none"
var emblem := "sun"
var emblem_color := Color("#d79b2e")
var flag := Color("#1fa3a0")
var flag2 := Color("#f2c45a")

const DEFS := {
	"player": {
		"hull": "#7a4b2a", "bottom": "#b33a2c", "boot": "#f5efe1", "strake": "#1f8a8a", "wale": "#21160f",
		"trim": "#e2b552", "sail": "#f4ead4", "sail_seam": "#d9c9a8", "emblem": "sun", "emblem_color": "#d79b2e",
		"flag": "#1fa3a0", "flag2": "#f2c45a",
	},
	"pirate-crimson": {
		"hull": "#3f2a1e", "bottom": "#2c2a2a", "boot": "#d9d2c3", "strake": "#9c2a2a", "wale": "#140d0a",
		"trim": "#c9a25a", "sail": "#3a3634", "sail_seam": "#2a2624", "emblem": "skull", "emblem_color": "#efe6d6",
		"flag": "#141212", "flag2": "#efe6d6",
	},
	"pirate-violet": {
		"hull": "#4a3324", "bottom": "#3b2f3a", "boot": "#e5dccb", "strake": "#5b3a7a", "wale": "#18100c",
		"trim": "#d4b26a", "sail": "#d8cdb8", "sail_seam": "#bfb39a", "emblem": "skull", "emblem_color": "#2a2224",
		"flag": "#1a1414", "flag2": "#e9e1d2",
	},
}

static var _cache := {}


static func named(livery_id: String) -> Livery:
	if _cache.has(livery_id):
		return _cache[livery_id]
	var l := Livery.new()
	l.id = livery_id
	var d: Dictionary = DEFS[livery_id]
	for key: String in d:
		var v: String = d[key]
		l.set(key, v if key == "emblem" else Color(v))
	_cache[livery_id] = l
	return l
