class_name Livery
extends RefCounted
## A ship's paint: hull bands, canvas (its accent pattern and the mark her
## mainsails carry) and flag. Colours are sRGB, as a painter would pick them;
## the materials convert them. The player's is dressed from her look
## (ShipLook.dress); the pirates' come from DEFS, their flags and marks drawn
## the web's way (liveryFlag, legacyMark): a jolly roger, skull and bones.

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
## The accent her canvas is patterned in, and the pattern (an index of
## ShipLook.SAIL_PATTERNS: 0 plain .. 5 diagonal).
var sail_accent := Color("#d9c9a8")
var sail_pattern := 0
## The mark her mainsails carry, {emblem, backing}, in emblem_color (empty: none).
var sail_mark := {}
## "sun", "skull" or "none": the mark's emblem, for whoever only needs a word.
var emblem := "sun"
var emblem_color := Color("#d79b2e")
var flag := Color("#1fa3a0")
var flag2 := Color("#f2c45a")
## Her flag, as Heraldry draws it.
var flag_design := {}
## Whether ships in it can wear a Treasure Vault skin (yours: "player"), and
## the one they wear (a Cosmetics skin; empty or pattern 0, her own paint).
## A skin is only uniforms on the livery's materials: no hull is rebuilt.
var skinned := false
var skin := {}
## A ghost ship's ("ghost"): she sails as a phantom (Ship.ghost) and wears
## the ghost shaders (ship_ghost.gdshaderinc).
var ghost := false
## Bumped whenever her paintwork changes: hulls built before it are stale
## (the shipyard builds a fresh one, see Shipyard._fits).
var rev := 0
## Her flag (alpha cut to its shape) and her mark, as drawn (null till bake()).
var flag_tex: Texture2D
var mark_tex: Texture2D

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
	# the Hollow Jack's (ShipClass "revenant"): planking gone the grey-plum of
	# driftwood, a strake of deep violet, a boot-top of bleached bone, trim in
	# old pumpkin gold, ash-black canvas bearing a ghost-green skull, and a
	# black flag in tatters
	"hallow": {
		"hull": "#2c2429", "bottom": "#141014", "boot": "#cbbd9c", "strake": "#3a2252", "wale": "#0d0a0c",
		"trim": "#c48a2c", "sail": "#3b3a3e", "sail_seam": "#27262a", "emblem": "skull", "emblem_color": "#a6ffd4",
		"flag": "#0e0c10", "flag2": "#b0ffd8",
	},
	# a ship the sea gave back: drowned grey-green planking, bone-pale trim
	# and canvas gone the grey of old sailcloth, a black flag and a pale skull
	"ghost": {
		"hull": "#4c5552", "bottom": "#2c3533", "boot": "#9fb5ac", "strake": "#33413d", "wale": "#151b1a",
		"trim": "#8fa89c", "sail": "#a9b8ae", "sail_seam": "#7f8f86", "emblem": "skull", "emblem_color": "#d8fff0",
		"flag": "#0d1413", "flag2": "#c8f5e2",
	},
	# the merchant houses' (Convoys): the Ronvliet Company's brown and green
	# with a gold star on a green swallowtail...
	"merchant-fluyt": {
		"hull": "#6b4528", "bottom": "#d6ccb2", "boot": "#f2ead6", "strake": "#2f6e3c", "wale": "#1c140e",
		"trim": "#e8c25a", "sail": "#f3ead6", "sail_seam": "#dccdb0", "emblem": "none", "emblem_color": "#2f6e3c",
		"flag": "#2f7d3a", "flag2": "#f0cf5e",
	},
	# ...the Aguadouro Bullion Line's blue, striped lateens and a crowned burgee...
	"merchant-xebec": {
		"hull": "#2c4a86", "bottom": "#e6dcc4", "boot": "#f3ecdc", "strake": "#f3ecdc", "wale": "#14203d",
		"trim": "#e2b552", "sail": "#f6f0e2", "sail_seam": "#ddd1b8", "emblem": "none", "emblem_color": "#e2b552",
		"flag": "#27407a", "flag2": "#e2b552",
	},
	# ...and Vila Garoa's tanned canvas, the colour of red ochre, under a moon
	"merchant-ketch": {
		"hull": "#7a5a3a", "bottom": "#b9545a", "boot": "#faf4ea", "strake": "#3f6f62", "wale": "#1b2420",
		"trim": "#e7c46d", "sail": "#c7774f", "sail_seam": "#a65e3c", "emblem": "none", "emblem_color": "#f4e6dc",
		"flag": "#3f6f62", "flag2": "#d9667a",
	},
}
## The merchant houses' flags, sail marks and canvas, as the web dresses them.
const HOUSE_DRESS := {
	"merchant-fluyt": {
		"flag": {"shape": "swallowtail", "bg": "#2f7d3a", "pattern": "band", "pattern_color": "#f0cf5e", "emblem": "star", "emblem_color": "#f6efd8", "backing": "none", "emblem_scale": 0.9, "paint": ""},
		"mark": {"emblem": "star", "backing": "ring"}, "mark_color": "#2f7d3a",
	},
	"merchant-xebec": {
		"flag": {"shape": "burgee", "bg": "#27407a", "pattern": "border", "pattern_color": "#e2b552", "emblem": "crown", "emblem_color": "#e2b552", "backing": "none", "emblem_scale": 1.0, "paint": ""},
		"stripes": "#3a5a9c",
	},
	"merchant-ketch": {
		"flag": {"shape": "swallowtail", "bg": "#3f6f62", "pattern": "hoist", "pattern_color": "#d9667a", "emblem": "moon", "emblem_color": "#faf4ea", "backing": "none", "emblem_scale": 0.9, "paint": ""},
		"mark": {"emblem": "moon", "backing": "none"}, "mark_color": "#f4e6dc",
	},
}
## The player's flag is drawn this wide (the Shipwright shows it close), everyone else's as the web draws them.
const FLAG_PX := 1024
const FLAG_PX_SMALL := 256

static var _cache := {}
static var _bake_task := -1
static var _bake_jobs: Array = []
static var _bake_list: Array[Livery] = []


static func named(livery_id: String) -> Livery:
	if _cache.has(livery_id):
		return _cache[livery_id]
	# a named captain's own colours (Bounty)
	if livery_id.begins_with("hunter:"):
		return Bounty.livery(livery_id.trim_prefix("hunter:"))
	var l := Livery.new()
	l.id = livery_id
	l.skinned = livery_id == "player"
	l.ghost = livery_id == "ghost"
	var d: Dictionary = DEFS[livery_id]
	for key: String in d:
		var v: String = d[key]
		l.set(key, v if key == "emblem" else Color(v))
	l.sail_accent = l.sail_seam
	# the web's liveryFlag and legacyMark: the Brethren fly a ragged jolly roger
	var skull := l.emblem == "skull"
	l.flag_design = {
		"shape": "tattered" if skull else "square", "bg": "#" + l.flag.to_html(false), "pattern": "plain",
		"pattern_color": "#" + l.flag2.to_html(false), "emblem": l.emblem, "emblem_color": "#" + l.flag2.to_html(false),
		"backing": "bones" if skull else "none", "emblem_scale": 0.95, "paint": "",
	}
	if l.emblem != "none":
		l.sail_mark = {"emblem": l.emblem, "backing": "bones" if skull else "none"}
	if HOUSE_DRESS.has(livery_id):
		var h: Dictionary = HOUSE_DRESS[livery_id]
		l.flag_design = h.flag
		if h.has("mark"):
			l.sail_mark = h.mark
			l.emblem_color = Color(h.mark_color)
		if h.has("stripes"):
			l.sail_pattern = 1
			l.sail_accent = Color(h.stripes)
	_cache[livery_id] = l
	return l


## A colour each channel times f, as the web's shadeHex rounds it.
static func shade(c: Color, f: float) -> Color:
	return Color8(clampi(roundi(c.r8 * f), 0, 255), clampi(roundi(c.g8 * f), 0, 255), clampi(roundi(c.b8 * f), 0, 255))


## How wide her flag is drawn.
func flag_px() -> int:
	return FLAG_PX if id == "player" else FLAG_PX_SMALL


## The SVG her flag is drawn from (without the hand-painted layer while the
## Shipwright's brush has it).
func flag_svg(paint := true) -> String:
	var w := flag_px()
	return Heraldry.flag_svg(flag_design, 256.0, 256.0 * Heraldry.ASPECT, Vector2i(w, roundi(w * Heraldry.ASPECT)), paint)


## Starts drawing these liveries' flags and marks on the worker threads
## (the game sets it going first thing and collects it with bake_finish()
## before the first ship is built, the islands going up meanwhile).
static func bake_start(list: Array[Livery]) -> void:
	bake_finish()
	_bake_jobs.clear()
	_bake_list = list.duplicate()
	var marks := {}
	for l in list:
		_bake_jobs.append([l, false, null])
		if not l.sail_mark.is_empty():
			var key := "%s|%s" % [l.sail_mark.emblem, l.sail_mark.backing]
			if not marks.has(key):
				marks[key] = true
				_bake_jobs.append([l, true, null])
	if not _bake_jobs.is_empty():
		_bake_task = WorkerThreadPool.add_group_task(func(i: int) -> void: Livery._bake_one(i), _bake_jobs.size(), -1, false, "Livery bake")


static func _bake_one(i: int) -> void:
	var job: Array = _bake_jobs[i]
	var l: Livery = job[0]
	if job[1]:
		Heraldry.mark_texture(str(l.sail_mark.emblem), str(l.sail_mark.backing))
	else:
		job[2] = LookBaker.rasterize(l.flag_svg(), LookBaker.MIPS)


## Waits for bake_start's drawing and hands each livery its flag and mark.
static func bake_finish() -> void:
	if _bake_task < 0:
		return
	WorkerThreadPool.wait_for_group_task_completion(_bake_task)
	_bake_task = -1
	for job: Array in _bake_jobs:
		var l: Livery = job[0]
		if not job[1]:
			l.flag_tex = job[2]
	for l in _bake_list:
		if not l.sail_mark.is_empty():
			l.mark_tex = Heraldry.mark_texture(str(l.sail_mark.emblem), str(l.sail_mark.backing))
	_bake_jobs.clear()
	_bake_list.clear()


## Draws these liveries' flags and marks now (tools and checks).
static func bake(list: Array[Livery]) -> void:
	bake_start(list)
	bake_finish()
