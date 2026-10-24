class_name ShipLook
## The player's ship styling, from the web game's src/ships/look.ts: her flag
## (a Heraldry design), her sails (cloth, an accent and its pattern, and
## whether the mainsails carry the flag's emblem) and her paintwork, and her
## name. The famous colours, Surprise me, the palettes the Shipwright offers,
## and how a look dresses her Livery.
##
## A look is a Dictionary (it goes to and from JSON as it is):
## {flag: {shape, bg, pattern, pattern_color, emblem, emblem_color, backing,
## emblem_scale, paint}, sail: {cloth, accent, pattern, mark, mark_color},
## hull: {planks, topsides, wale, gilding, boot, bottom}, name}. Colours are
## "#rrggbb", as a painter picks them.

const SAIL_PATTERNS := [["plain", "Plain"], ["stripes", "Stripes"], ["band", "Band"], ["border", "Border"], ["cross", "Cross"], ["diagonal", "Diagonal"]]
## The paintwork's parts: [id, name, palette].
const HULL_PARTS := [
	["topsides", "Topsides", "paint"], ["planks", "Planking", "wood"], ["bottom", "Bottom", "paint"],
	["boot", "Waterline", "paint"], ["wale", "Wale", "wood"], ["gilding", "Gilding", "metal"],
]
const PALETTES := {
	"flag": ["#141212", "#f3ecdc", "#b8262b", "#1fa3a0", "#1b3f7a", "#2f7d3a", "#f2c45a", "#e86a2c", "#6b2f86", "#e98fb0", "#7a4b2a", "#8fd3e8", "#0e5a5e", "#c9b38a"],
	"sail": ["#f4ead4", "#fbf7ee", "#e6d3ad", "#c9a97a", "#3a3634", "#1d1b1b", "#9c2a2a", "#c4533a", "#1f6f8b", "#27407a", "#2f6b47", "#d9a441", "#7d4a8c", "#e7a3a0"],
	"wood": ["#7a4b2a", "#5a3620", "#3f2a1e", "#9b6a3e", "#b98b5a", "#2b1d15", "#6e5a48", "#8a3f2a"],
	"paint": ["#1f8a8a", "#b33a2c", "#21160f", "#f5efe1", "#1d3f73", "#2f6b3d", "#d9a441", "#5b3a7a", "#e46f4b", "#0f5c63", "#c8d6d2", "#962e4f", "#2c2a2a", "#78a6c8"],
	"metal": ["#e2b552", "#c9944a", "#b87333", "#d8d8d2", "#8c8a84", "#2a2a2e", "#d4b26a", "#7fb7a8"],
}
const DEFAULT := {
	"flag": {"shape": "swallowtail", "bg": "#1fa3a0", "pattern": "plain", "pattern_color": "#f3ecdc", "emblem": "sun",
		"emblem_color": "#f2c45a", "backing": "none", "emblem_scale": 1.0, "paint": ""},
	"sail": {"cloth": "#f4ead4", "accent": "#1f8a8a", "pattern": "plain", "mark": true, "mark_color": "#d79b2e"},
	"hull": {"planks": "#7a4b2a", "topsides": "#1f8a8a", "wale": "#21160f", "gilding": "#e2b552", "boot": "#f5efe1", "bottom": "#b33a2c"},
	"name": "",
}
## The famous colours: [name, flag (over the default flag), sail, hull].
const PRESETS := [
	["Turquoise Sun", {}, {}, {}],
	["Black Pearl", {"shape": "tattered", "bg": "#141212", "emblem": "skull", "backing": "bones", "emblem_color": "#f3ecdc"},
		{"cloth": "#3a3634", "accent": "#1d1b1b", "pattern": "plain", "mark": false, "mark_color": "#f3ecdc"},
		{"planks": "#2b1d15", "topsides": "#1d1b1b", "wale": "#2b1d15", "gilding": "#d4b26a", "boot": "#2c2a2a", "bottom": "#21160f"}],
	["Crimson Kraken", {"shape": "swallowtail", "bg": "#b8262b", "emblem": "kraken", "backing": "none", "emblem_color": "#141212", "pattern": "border", "pattern_color": "#141212"},
		{"cloth": "#9c2a2a", "accent": "#1d1b1b", "pattern": "band", "mark": true, "mark_color": "#1d1b1b"},
		{"planks": "#3f2a1e", "topsides": "#962e4f", "wale": "#21160f", "gilding": "#c9944a", "boot": "#f5efe1", "bottom": "#2c2a2a"}],
	["Royal Azure", {"shape": "square", "bg": "#1b3f7a", "emblem": "crown", "backing": "laurel", "emblem_color": "#f2c45a", "pattern": "border", "pattern_color": "#f2c45a"},
		{"cloth": "#fbf7ee", "accent": "#27407a", "pattern": "border", "mark": true, "mark_color": "#27407a"},
		{"planks": "#5a3620", "topsides": "#1d3f73", "wale": "#21160f", "gilding": "#e2b552", "boot": "#f5efe1", "bottom": "#b33a2c"}],
	["Coral Queen", {"shape": "burgee", "bg": "#e98fb0", "emblem": "shark", "backing": "none", "emblem_color": "#fbf7ee", "pattern": "diagonal", "pattern_color": "#e86a2c"},
		{"cloth": "#fbf7ee", "accent": "#e7a3a0", "pattern": "stripes", "mark": false, "mark_color": "#e46f4b"},
		{"planks": "#b98b5a", "topsides": "#e46f4b", "wale": "#6e5a48", "gilding": "#d8d8d2", "boot": "#f5efe1", "bottom": "#0f5c63"}],
	["Emerald Corsair", {"shape": "swallowtail", "bg": "#2f7d3a", "emblem": "swords", "backing": "ring", "emblem_color": "#f3ecdc", "pattern": "hoist", "pattern_color": "#141212"},
		{"cloth": "#e6d3ad", "accent": "#2f6b47", "pattern": "diagonal", "mark": true, "mark_color": "#2f6b47"},
		{"planks": "#7a4b2a", "topsides": "#2f6b3d", "wale": "#2b1d15", "gilding": "#b87333", "boot": "#f5efe1", "bottom": "#21160f"}],
	["Ghost Tide", {"shape": "tattered", "bg": "#c9b38a", "emblem": "hourglass", "backing": "bones", "emblem_color": "#141212", "pattern": "plain"},
		{"cloth": "#c9a97a", "accent": "#6e5a48", "pattern": "plain", "mark": true, "mark_color": "#3a3634"},
		{"planks": "#6e5a48", "topsides": "#c8d6d2", "wale": "#3f2a1e", "gilding": "#8c8a84", "boot": "#2c2a2a", "bottom": "#2c2a2a"}],
	["Sunset Rogue", {"shape": "square", "bg": "#e86a2c", "emblem": "parrot", "backing": "rays", "emblem_color": "#f2c45a", "pattern": "band", "pattern_color": "#6b2f86"},
		{"cloth": "#f4ead4", "accent": "#d9a441", "pattern": "cross", "mark": true, "mark_color": "#c4533a"},
		{"planks": "#9b6a3e", "topsides": "#5b3a7a", "wale": "#2b1d15", "gilding": "#e2b552", "boot": "#f5efe1", "bottom": "#e46f4b"}],
]
const NAME_A := ["Salty", "Golden", "Crimson", "Midnight", "Laughing", "Wandering", "Restless", "Gilded", "Silver", "Howling", "Merry", "Lucky", "Stormy", "Coral", "Wicked", "Jolly"]
const NAME_B := ["Gull", "Marlin", "Siren", "Mermaid", "Kraken", "Parrot", "Doubloon", "Tempest", "Barnacle", "Corsair", "Maiden", "Albatross", "Dolphin", "Lantern", "Pelican", "Rose"]
## A ship's name, at most.
const NAME_MAX := 24
## Saved designs kept, at most.
const MAX_SAVED := 12
## A second design saved for one name takes the next of these.
const NUMERALS := ["", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X", " XI", " XII", " XIII"]


static func fresh() -> Dictionary:
	return DEFAULT.duplicate(true)


## A famous look (without its name: the ship keeps hers).
static func preset(i: int) -> Dictionary:
	var p: Array = PRESETS[i]
	var look := fresh()
	(look.flag as Dictionary).merge(p[1], true)
	if not (p[2] as Dictionary).is_empty():
		look.sail = (p[2] as Dictionary).duplicate()
	if not (p[3] as Dictionary).is_empty():
		look.hull = (p[3] as Dictionary).duplicate()
	return look


static func random_name(rng: RandomNumberGenerator = null) -> String:
	return "%s %s" % [_pick(NAME_A, rng), _pick(NAME_B, rng)]


static func _rnd(rng: RandomNumberGenerator) -> float:
	return rng.randf() if rng != null else randf()


static func _pick(a: Array, rng: RandomNumberGenerator) -> Variant:
	return a[mini(int(_rnd(rng) * a.size()), a.size() - 1)]


## How light a colour reads (0 .. 1).
static func lum(hex: String) -> float:
	var c := Color(hex)
	return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b


## A colour off `pal` that reads clearly against `bg`.
static func contrasting(pal: Array, bg: String, rng: RandomNumberGenerator = null) -> String:
	var l := lum(bg)
	var ok := pal.filter(func(c: String) -> bool: return absf(lum(c) - l) > 0.35)
	return _pick(ok if not ok.is_empty() else pal, rng)


## Surprise me: a random but harmonious look, keeping her name.
static func random_look(keep_name := "", rng: RandomNumberGenerator = null) -> Dictionary:
	var f: Array = PALETTES.flag
	var bg: String = _pick(f, rng)
	var pattern_color := contrasting(f.filter(func(c: String) -> bool: return c != bg), bg, rng)
	var emblems := Heraldry.ids(Heraldry.EMBLEMS).filter(func(e: String) -> bool: return e != "none")
	var cloth: String = _pick((PALETTES.sail as Array).slice(0, 4), rng) if _rnd(rng) < 0.6 else _pick(PALETTES.sail, rng)
	var topsides: String = _pick(PALETTES.paint, rng)
	var flag := {
		"shape": _pick(Heraldry.ids(Heraldry.SHAPES), rng),
		"bg": bg,
		"pattern": "plain" if _rnd(rng) < 0.35 else _pick(Heraldry.ids(Heraldry.PATTERNS), rng),
		"pattern_color": pattern_color,
		"emblem": _pick(emblems, rng),
		"emblem_color": contrasting(f, bg, rng),
		"backing": "none" if _rnd(rng) < 0.45 else _pick(Heraldry.ids(Heraldry.BACKINGS), rng),
		"emblem_scale": 0.85 + _rnd(rng) * 0.3,
		"paint": "",
	}
	var sail := {
		"cloth": cloth,
		"accent": contrasting(PALETTES.sail, cloth, rng),
		"pattern": "plain" if _rnd(rng) < 0.4 else _pick(ids(SAIL_PATTERNS), rng),
		"mark": _rnd(rng) < 0.7,
		"mark_color": contrasting(PALETTES.sail, cloth, rng),
	}
	var hull := {
		"planks": _pick(PALETTES.wood, rng),
		"topsides": topsides,
		"wale": _pick((PALETTES.wood as Array).filter(func(c: String) -> bool: return lum(c) < 0.3), rng),
		"gilding": _pick(PALETTES.metal, rng),
		"boot": "#f5efe1" if _rnd(rng) < 0.7 else _pick(PALETTES.paint, rng),
		"bottom": _pick((PALETTES.paint as Array).filter(func(c: String) -> bool: return c != topsides), rng),
	}
	return {"flag": flag, "sail": sail, "hull": hull, "name": keep_name}


## The ids of a [id, name] table.
static func ids(table: Array) -> Array[String]:
	return Heraldry.ids(table)


## A colour as the looks keep it ("#rrggbb"), or "" if it isn't one.
static func hex(v: Variant) -> String:
	if not v is String:
		return ""
	var s := (v as String).strip_edges().to_lower()
	if s.length() != 7 or not s.begins_with("#") or not s.substr(1).is_valid_hex_number():
		return ""
	return s


## A look from whatever a save holds: every field that makes sense taken,
## the rest the default's (a hand-edited or damaged save can hold anything).
static func sanitize(raw: Variant) -> Dictionary:
	var d := fresh()
	if not raw is Dictionary:
		return d
	var r: Dictionary = raw
	for part: String in ["flag", "sail", "hull"]:
		var src: Variant = r.get(part)
		if not src is Dictionary:
			continue
		var base: Dictionary = d[part]
		for k: String in base:
			var v: Variant = (src as Dictionary).get(k)
			var b: Variant = base[k]
			if b is String and (b as String).begins_with("#"):
				var h := hex(v)
				if h != "":
					base[k] = h
			elif b is bool:
				if v is bool:
					base[k] = v
			elif b is float:
				if (v is float or v is int) and is_finite(float(v)):
					base[k] = float(v)
			elif v is String:
				base[k] = v
	if r.get("name") is String:
		d.name = clean_name(r.name)
	var f: Dictionary = d.flag
	if not Heraldry.ids(Heraldry.EMBLEMS).has(f.emblem):
		f.emblem = "sun"
	if not Heraldry.ids(Heraldry.BACKINGS).has(f.backing):
		f.backing = "none"
	if not Heraldry.ids(Heraldry.PATTERNS).has(f.pattern):
		f.pattern = "plain"
	if not Heraldry.ids(Heraldry.SHAPES).has(f.shape):
		f.shape = "square"
	if not ids(SAIL_PATTERNS).has(d.sail.pattern):
		d.sail.pattern = "plain"
	if not str(f.paint).begins_with("data:image/png"):
		f.paint = ""
	f.emblem_scale = clampf(float(f.emblem_scale) if float(f.emblem_scale) != 0.0 else 1.0, 0.6, 1.4)
	return d


## A name as a ship may carry it: no angle brackets, at most NAME_MAX letters.
static func clean_name(s: String) -> String:
	return s.replace("<", "").replace(">", "").left(NAME_MAX)


## Your saved designs from a save: [{id, name, look}], at most MAX_SAVED.
static func sanitize_designs(raw: Variant) -> Array:
	var out := []
	if not raw is Array:
		return out
	for e: Variant in raw:
		if out.size() >= MAX_SAVED:
			break
		if not e is Dictionary or not (e as Dictionary).get("id") is String:
			continue
		out.append({"id": str(e.id), "name": clean_name(str(e.get("name", ""))), "look": sanitize(e.get("look"))})
	return out


## The name a design saved now takes: her name (or "Design"), numbered past
## those already taken ("Sea Biscuit II" ..).
static func design_name(look: Dictionary, designs: Array) -> String:
	var base := str(look.name).strip_edges()
	if base == "":
		base = "Design"
	var taken := {}
	for d: Dictionary in designs:
		taken[str(d.name)] = true
	for n: String in NUMERALS:
		if not taken.has(base + n):
			return base + n
	return base


## Same flag, sails and paintwork (names aside).
static func same_style(a: Dictionary, b: Dictionary) -> bool:
	return _style_key(a) == _style_key(b)


## Same style and name: saving it again would only make a twin.
static func same_design(a: Dictionary, b: Dictionary) -> bool:
	return str(a.get("name", "")) == str(b.get("name", "")) and same_style(a, b)


static func _style_key(l: Dictionary) -> String:
	return JSON.stringify([l.flag, l.sail, l.hull], "", true)


## What of a look is baked into her hull's timbers (a change rebuilds her).
static func hull_key(l: Dictionary) -> String:
	return JSON.stringify(l.hull, "", true)


## What her flag is drawn from.
static func flag_key(l: Dictionary) -> String:
	return JSON.stringify(l.flag, "", true)


## The mark her mainsails carry: "emblem|backing", or "" for none.
static func mark_key(l: Dictionary) -> String:
	var f: Dictionary = l.flag
	if not bool(l.sail.mark) or f.emblem == "none":
		return ""
	return "%s|%s" % [f.emblem, f.backing]


## Dresses a livery in a look: her paintwork, canvas and flag design (the
## flag's and mark's textures are baked apart: see Livery.bake). A change to
## the paintwork bumps the livery's rev (hulls built before it are stale).
static func dress(l: Livery, look: Dictionary) -> void:
	var h: Dictionary = look.hull
	var s: Dictionary = look.sail
	var f: Dictionary = look.flag
	var hull := [Color(h.planks), Color(h.bottom), Color(h.boot), Color(h.topsides), Color(h.wale), Color(h.gilding)]
	if hull != [l.hull, l.bottom, l.boot, l.strake, l.wale, l.trim]:
		l.hull = hull[0]
		l.bottom = hull[1]
		l.boot = hull[2]
		l.strake = hull[3]
		l.wale = hull[4]
		l.trim = hull[5]
		l.rev += 1
	l.sail = Color(s.cloth)
	l.sail_seam = Livery.shade(l.sail, 0.86)
	l.sail_accent = Color(s.accent)
	l.sail_pattern = maxi(0, ids(SAIL_PATTERNS).find(str(s.pattern)))
	l.emblem_color = Color(s.mark_color)
	var mk := mark_key(look)
	l.sail_mark = {} if mk == "" else {"emblem": f.emblem, "backing": f.backing}
	l.emblem = str(f.emblem) if mk != "" else "none"
	l.flag = Color(f.bg)
	l.flag2 = Color(f.emblem_color)
	l.flag_design = (f as Dictionary).duplicate()
