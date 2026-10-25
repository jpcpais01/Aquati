class_name Bounty
extends RefCounted
## Bounties and infamy (the web game's src/game/bounty.ts). Every pirate you
## send to the bottom makes your name a little more hated among the Brethren
## of the Coast. As your infamy climbs (the voyage's wanted level), the
## Brethren send their named captains after you: famous hunters in their own
## colours, each with a trick of their own and a fat Crown bounty on their
## head. Sink one and the reward is yours, along with their poster, stamped,
## on your Wanted Board.
##
## Two scales: the voyage's wanted level (heat, drives the hunters) and your
## lifetime infamy (the ledger, Progress.bounty), which raises the Crown's
## reward on every bounty you claim.

## The named captains, cheapest first: who they are, their ship, the trick
## that makes them dangerous, the colours they sail in (the shared hunter
## hull dressed in their own canvas, flag and vault skin), the shot they
## load and how often, how much tougher, harder-hitting, quicker and
## sharper-eyed than any crew they are, how many sail with them, and their
## face as the Crown's notice engraves it.
const CAPTAINS := [
	{
		"id": "ned",
		"name": "Ned Varrow",
		"epithet": "Calico Ned",
		"handle": "Calico Ned",
		"ship": "Quickthorn",
		"cls": "sloop",
		"tier": 1,
		"bounty": 650,
		"trait": "Shreds your canvas with chain shot, then dances round you.",
		"taunt": "Your sails will be ribbons before you see me coming.",
		"skin": "skin:harlequin",
		"sail": "#efe4cc",
		"sail_seam": "#d2c3a2",
		"sail_accent": "#b8402f",
		"sail_pattern": "stripes",
		"sail_mark": {"emblem": "swords", "backing": "none", "color": "#1c1512"},
		"flag": {"shape": "swallowtail", "bg": "#1c1512", "pattern": "stripes", "pattern_color": "#b8402f", "emblem": "swords", "emblem_color": "#efe4cc", "backing": "none"},
		"ammo": [[Ammo.CHAIN, 0.42], [Ammo.GRAPE, 0.1]],
		"boost": {"hp": 1.7, "guns": 1.15, "reload": 0.9, "speed": 1.08, "aim": 0.75},
		"escorts": 0,
		"face": {"hat": "bandana", "hair": "curls", "beard": "stubble", "earring": true, "brow": -1, "mouth": 1},
	},
	{
		"id": "anne",
		"name": "Anne Mercer",
		"epithet": "Saltbones Anne",
		"handle": "Saltbones",
		"ship": "Whisper",
		"cls": "sloop",
		"tier": 1,
		"bounty": 700,
		"trait": "Sweeps your decks with grape shot. Never misses twice.",
		"taunt": "Never heard of me? That is rather the point.",
		"skin": "skin:camo",
		"sail": "#3c4a44",
		"sail_seam": "#2c3833",
		"sail_mark": {"emblem": "skull", "backing": "bones", "color": "#d9d3c2"},
		"flag": {"shape": "tattered", "bg": "#26302c", "pattern": "border", "pattern_color": "#d9d3c2", "emblem": "skull", "emblem_color": "#d9d3c2", "backing": "bones"},
		"ammo": [[Ammo.GRAPE, 0.4], [Ammo.CHAIN, 0.1]],
		"boost": {"hp": 1.8, "guns": 1.2, "reload": 0.88, "speed": 1.06, "aim": 0.6},
		"escorts": 0,
		"face": {"hat": "hood", "hair": "long", "beard": "none", "scar": true, "brow": 1, "mouth": 0},
	},
	{
		"id": "isolde",
		"name": "Isolde Crane",
		"epithet": "Red Isolde",
		"handle": "Red Isolde",
		"ship": "Scarlet Widow",
		"cls": "brig",
		"tier": 2,
		"bounty": 1200,
		"trait": "Lights you up with fire shot and watches you burn.",
		"taunt": "Every captain I have met burned brighter than they sailed.",
		"skin": "skin:damask",
		"sail": "#8e1d24",
		"sail_seam": "#6e151b",
		"sail_accent": "#e8b84f",
		"sail_pattern": "border",
		"sail_mark": {"emblem": "heart", "backing": "swords", "color": "#f3d48a"},
		"flag": {"shape": "swallowtail", "bg": "#7a1424", "pattern": "border", "pattern_color": "#e8b84f", "emblem": "heart", "emblem_color": "#f6dfa0", "backing": "swords"},
		"ammo": [[Ammo.FIRE, 0.4], [Ammo.CHAIN, 0.08]],
		"boost": {"hp": 1.75, "guns": 1.2, "reload": 0.85, "speed": 1.05, "aim": 0.7},
		"escorts": 0,
		"face": {"hat": "tricorn", "hair": "long", "beard": "none", "earring": true, "plume": true, "brow": -1, "mouth": 1},
	},
	{
		"id": "kett",
		"name": "Bartholomew Kett",
		"epithet": "Iron Jaw Kett",
		"handle": "Iron Jaw",
		"ship": "Gravemaw",
		"cls": "brig",
		"tier": 2,
		"bounty": 1300,
		"trait": "Iron-banded hull. Takes a beating and comes straight on.",
		"taunt": "I have swallowed bigger ships than yours.",
		"skin": "skin:tiger",
		"sail": "#d8c9a6",
		"sail_seam": "#bba985",
		"sail_accent": "#1d1714",
		"sail_pattern": "band",
		"sail_mark": {"emblem": "shark", "backing": "ring", "color": "#1d1714"},
		"flag": {"shape": "square", "bg": "#e8792f", "pattern": "band", "pattern_color": "#1d1714", "emblem": "shark", "emblem_color": "#1d1714", "backing": "none"},
		"ammo": [[Ammo.SHELL, 0.18], [Ammo.GRAPE, 0.12]],
		"boost": {"hp": 2.3, "guns": 1.15, "reload": 0.95, "speed": 1, "aim": 0.8},
		"escorts": 0,
		"face": {"hat": "cap", "hair": "bald", "beard": "mutton", "scar": true, "brow": 1, "mouth": -1},
	},
	{
		"id": "mags",
		"name": "Margaret Holloway",
		"epithet": "Mad Mags",
		"handle": "Mad Mags",
		"ship": "Banshee",
		"cls": "brig",
		"tier": 3,
		"bounty": 1900,
		"trait": "Reloads like a demon. Fire and chain, all at once.",
		"taunt": "Hear that wailing? That is your hull.",
		"skin": "skin:chevron",
		"sail": "#f0d9a8",
		"sail_seam": "#d6bb85",
		"sail_accent": "#6b2f86",
		"sail_pattern": "diagonal",
		"sail_mark": {"emblem": "moon", "backing": "rays", "color": "#e4573d"},
		"flag": {"shape": "tattered", "bg": "#3a1846", "pattern": "diagonal", "pattern_color": "#e4573d", "emblem": "moon", "emblem_color": "#f2b347", "backing": "rays"},
		"ammo": [[Ammo.FIRE, 0.24], [Ammo.CHAIN, 0.24]],
		"boost": {"hp": 2, "guns": 1.25, "reload": 0.68, "speed": 1.07, "aim": 0.7},
		"escorts": 1,
		"face": {"hat": "none", "hair": "braids", "beard": "none", "patch": "l", "earring": true, "brow": 1, "mouth": -1},
	},
	{
		"id": "eel",
		"name": "Silas Dunmore",
		"epithet": "Silas the Eel",
		"handle": "The Eel",
		"ship": "Black Eel",
		"cls": "brig",
		"tier": 3,
		"bounty": 2000,
		"trait": "The fastest brig in the isles. Slips in, rakes you, slips away.",
		"taunt": "Slippery? I prefer inevitable.",
		"skin": "skin:kraken",
		"sail": "#2a1f3a",
		"sail_seam": "#1d1529",
		"sail_accent": "#3fd1c4",
		"sail_pattern": "cross",
		"sail_mark": {"emblem": "kraken", "backing": "none", "color": "#3fd1c4"},
		"flag": {"shape": "burgee", "bg": "#1a0f2e", "pattern": "chevron", "pattern_color": "#7b2a8c", "emblem": "kraken", "emblem_color": "#3fd1c4", "backing": "none"},
		"ammo": [[Ammo.CHAIN, 0.3], [Ammo.GRAPE, 0.18]],
		"boost": {"hp": 1.9, "guns": 1.2, "reload": 0.8, "speed": 1.2, "aim": 0.65},
		"escorts": 1,
		"face": {"hat": "bicorne", "hair": "tied", "beard": "goatee", "brow": -1, "mouth": 1},
	},
	{
		"id": "hester",
		"name": "Hester Blackwood",
		"epithet": "The Duchess of Ash",
		"handle": "The Duchess",
		"ship": "Ashen Crown",
		"cls": "galleon",
		"tier": 4,
		"bounty": 3200,
		"trait": "Rains shell and fire from three gun decks. Never sails alone.",
		"taunt": "Kneel, and I shall sink you quickly.",
		"skin": "skin:kintsugi",
		"sail": "#2b2730",
		"sail_seam": "#1e1b22",
		"sail_accent": "#f0c35a",
		"sail_pattern": "border",
		"sail_mark": {"emblem": "crown", "backing": "laurel", "color": "#f0c35a"},
		"flag": {"shape": "swallowtail", "bg": "#0d0c0f", "pattern": "border", "pattern_color": "#f0c35a", "emblem": "crown", "emblem_color": "#f0c35a", "backing": "laurel"},
		"ammo": [[Ammo.SHELL, 0.26], [Ammo.FIRE, 0.2]],
		"boost": {"hp": 1.9, "guns": 1.25, "reload": 0.85, "speed": 1.08, "aim": 0.65},
		"escorts": 1,
		"face": {"hat": "tricorn", "hair": "curls", "beard": "none", "plume": true, "earring": true, "brow": -1, "mouth": 0},
	},
	{
		"id": "grimm",
		"name": "Thaddeus Grimm",
		"epithet": "The Undertaker",
		"handle": "The Undertaker",
		"ship": "Coffin Bell",
		"cls": "galleon",
		"tier": 4,
		"bounty": 3400,
		"trait": "Bursting shell by the broadside. Tolls a bell for every ship he sinks.",
		"taunt": "I have measured you for a box already.",
		"skin": "skin:marble",
		"sail": "#e7e2d6",
		"sail_seam": "#c9c3b4",
		"sail_accent": "#2b2b2b",
		"sail_pattern": "cross",
		"sail_mark": {"emblem": "hourglass", "backing": "bones", "color": "#2b2b2b"},
		"flag": {"shape": "square", "bg": "#141414", "pattern": "cross", "pattern_color": "#e7e2d6", "emblem": "hourglass", "emblem_color": "#e7e2d6", "backing": "bones"},
		"ammo": [[Ammo.SHELL, 0.42], [Ammo.GRAPE, 0.1]],
		"boost": {"hp": 2.1, "guns": 1.2, "reload": 0.9, "speed": 1.05, "aim": 0.6},
		"escorts": 1,
		"face": {"hat": "bicorne", "hair": "short", "beard": "forked", "brow": 1, "mouth": 0},
	},
	{
		"id": "vane",
		"name": "Morgan Vane",
		"epithet": "Blackheart Vane",
		"handle": "Blackheart",
		"ship": "Leviathan's Wrath",
		"cls": "galleon",
		"tier": 5,
		"bounty": 5200,
		"trait": "Lord of the Brethren. A molten hull, a fleet at his back.",
		"taunt": "The Brethren want your head. I want your ship.",
		"skin": "skin:molten",
		"sail": "#1c1513",
		"sail_seam": "#120d0c",
		"sail_accent": "#ff5a12",
		"sail_pattern": "border",
		"sail_mark": {"emblem": "skull", "backing": "swords", "color": "#ff7a2a"},
		"flag": {"shape": "tattered", "bg": "#120d0c", "pattern": "border", "pattern_color": "#ff5a12", "emblem": "skull", "emblem_color": "#ffd56a", "backing": "swords"},
		"ammo": [[Ammo.SHELL, 0.24], [Ammo.FIRE, 0.22], [Ammo.CHAIN, 0.1]],
		"boost": {"hp": 2.5, "guns": 1.35, "reload": 0.8, "speed": 1.1, "aim": 0.55},
		"escorts": 2,
		"face": {"hat": "tricorn", "hair": "long", "beard": "full", "patch": "r", "scar": true, "brow": 1, "mouth": -1},
	},
	{
		"id": "drake",
		"name": "Cassius Drake",
		"epithet": "The Storm King",
		"handle": "Storm King",
		"ship": "Tempest Throne",
		"cls": "galleon",
		"tier": 5,
		"bounty": 5600,
		"trait": "Sails like the wind obeys him. His gunners never miss.",
		"taunt": "The sea crowned me. You will make a fine footnote.",
		"skin": "skin:aurora",
		"sail": "#14203b",
		"sail_seam": "#0c1529",
		"sail_accent": "#38ff9c",
		"sail_pattern": "stripes",
		"sail_mark": {"emblem": "trident", "backing": "rays", "color": "#b9ffe0"},
		"flag": {"shape": "swallowtail", "bg": "#07122b", "pattern": "saltire", "pattern_color": "#38ff9c", "emblem": "trident", "emblem_color": "#e8fff4", "backing": "rays"},
		"ammo": [[Ammo.SHELL, 0.22], [Ammo.CHAIN, 0.18], [Ammo.GRAPE, 0.12]],
		"boost": {"hp": 2.4, "guns": 1.35, "reload": 0.78, "speed": 1.16, "aim": 0.45},
		"escorts": 2,
		"face": {"hat": "bicorne", "hair": "tied", "beard": "goatee", "plume": true, "earring": true, "brow": -1, "mouth": 1},
	},
]

## The hull paint every hunter shares (black, crimson strake, gold trim); sails, flag and skin are their own.
const HUNTER_HULL := {
	"hull": "#2a1d17", "bottom": "#1f1b1b", "boot": "#d9cfbb", "strake": "#8a1e22", "wale": "#0f0a08", "trim": "#e2b552",
}

## Infamy a sinking earns, by class.
const KILL_INFAMY := {"sloop": 1, "brig": 2, "galleon": 3, "revenant": 3}
## Voyage infamy at which each wanted level (1..5) is reached.
const WANTED_AT := [3, 8, 15, 24, 35]
## Past five skulls, another hunter sets out every this many points.
const WANTED_MORE := 14
## Extra Crown gold per wanted skull on every pirate bounty: the hotter, the richer.
const HEAT_BONUS := 0.08

## The ranks of your lifetime infamy: [infamy, title, line].
const REPUTE := [
	[0, "Unknown", "No pirate in the isles has heard your name. Yet."],
	[12, "Rumoured", "Whispers in the taverns of a captain who sinks pirates."],
	[40, "Notorious", "The Brethren of the Coast have pinned up your likeness."],
	[100, "Wanted", "Pirate crews drink to whoever sends you down."],
	[220, "Most Wanted", "The Brethren's finest sail out for you alone."],
	[400, "Infamous", "Merchantmen cheer your sails. Pirates strike theirs."],
	[700, "Scourge of the Brethren", "They frighten their cabin boys with your name."],
	[1100, "Legend of the Black Water", "The Brethren will be telling this story for a hundred years."],
]
## Crown's extra reward per rank of infamy, on every bounty.
const REPUTE_BONUS := 0.05

static var _by_id := {}
static var _liveries := {}


## A named captain by id ({} if there's none).
static func captain(id: String) -> Dictionary:
	if _by_id.is_empty():
		for c: Dictionary in CAPTAINS:
			_by_id[c.id] = c
	return _by_id.get(id, {})


## The voyage's wanted level (0 .. 5) at this much infamy.
static func wanted_level(pts: int) -> int:
	var n := 0
	while n < WANTED_AT.size() and pts >= int(WANTED_AT[n]):
		n += 1
	return n


## 0..1 toward the next skull (1 once all five are lit).
static func wanted_progress(pts: int) -> float:
	var n := wanted_level(pts)
	if n >= WANTED_AT.size():
		return 1.0
	var lo := int(WANTED_AT[n - 1]) if n > 0 else 0
	return float(pts - lo) / float(int(WANTED_AT[n]) - lo)


## How many hunters this much infamy has earned you (the sixth on, one per WANTED_MORE).
static func hunters_earned(pts: int) -> int:
	var n := wanted_level(pts)
	if n < WANTED_AT.size():
		return n
	return n + (pts - int(WANTED_AT[WANTED_AT.size() - 1])) / WANTED_MORE


## Your rank (an index of REPUTE) at this much lifetime infamy.
static func repute_rank(infamy: int) -> int:
	var i := 0
	while i + 1 < REPUTE.size() and infamy >= int(REPUTE[i + 1][0]):
		i += 1
	return i


## The Crown's multiplier on bounties at this much lifetime infamy.
static func bonus(infamy: int) -> float:
	return 1.0 + repute_rank(infamy) * REPUTE_BONUS


## A captain's full colours (the livery "hunter:<id>"): the shared hunter
## hull dressed in their own sails, flag and vault skin.
static func livery(id: String) -> Livery:
	if _liveries.has(id):
		return _liveries[id]
	var c := captain(id)
	var l := Livery.new()
	l.id = "hunter:" + id
	for key: String in HUNTER_HULL:
		l.set(key, Color(HUNTER_HULL[key]))
	l.sail = Color(c.sail)
	l.sail_seam = Color(c.sail_seam)
	l.sail_accent = Color(c.get("sail_accent", c.sail_seam))
	l.sail_pattern = maxi(0, ShipLook.ids(ShipLook.SAIL_PATTERNS).find(str(c.get("sail_pattern", "plain"))))
	var mk: Dictionary = c.sail_mark
	l.sail_mark = {"emblem": mk.emblem, "backing": mk.backing}
	l.emblem = str(mk.emblem)
	l.emblem_color = Color(mk.color)
	var f: Dictionary = (c.flag as Dictionary).duplicate()
	f.emblem_scale = 1.0
	f.paint = ""
	l.flag_design = f
	l.flag = Color(f.bg)
	l.flag2 = Color(f.emblem_color)
	l.skinned = true
	l.skin = Cosmetics.skin(str(c.skin))
	_liveries[id] = l
	return l


## Every hunter's livery (their flags and marks are drawn with the others' at the start).
static func liveries() -> Array[Livery]:
	var out: Array[Livery] = []
	for c: Dictionary in CAPTAINS:
		out.append(livery(c.id))
	return out


## A fresh ledger: no infamy, every poster unstamped. `sunk` and `first`:
## times each named captain has been sunk, and when first (unix seconds);
## `seen`: captains who have come hunting at least once; `claimed`: gold the
## Crown has paid you for them; `best`: the highest wanted level reached.
static func fresh() -> Dictionary:
	return {"infamy": 0, "sunk": {}, "first": {}, "seen": [], "claimed": 0, "best": 0}


## A ledger made whole from anything (junk falls back to empty).
static func sanitize(raw: Variant) -> Dictionary:
	var out := fresh()
	if not raw is Dictionary:
		return out
	var r: Dictionary = raw
	var num := func(v: Variant) -> float: return maxf(0.0, float(v)) if (v is float or v is int) and is_finite(float(v)) else 0.0
	out.infamy = int(num.call(r.get("infamy")))
	out.claimed = int(num.call(r.get("claimed")))
	out.best = mini(5, int(num.call(r.get("best"))))
	for k: String in ["sunk", "first"]:
		var m: Variant = r.get(k)
		if m is Dictionary:
			for id: Variant in m:
				if not captain(str(id)).is_empty() and num.call(m[id]) > 0.0:
					out[k][str(id)] = int(num.call(m[id]))
	var s: Variant = r.get("seen")
	if s is Array:
		for id: Variant in s:
			if id is String and not captain(id).is_empty() and not (out.seen as Array).has(id):
				out.seen.append(id)
	return out


## The captain the Brethren send at this wanted level: one you have not
## beaten yet (in `ledger`), and not one already met this voyage, if any are left.
static func pick(ledger: Dictionary, level: int, exclude: Dictionary, rnd := Callable()) -> Dictionary:
	var tier := clampi(level, 1, 5)
	var pool := CAPTAINS.filter(func(c: Dictionary) -> bool: return int(c.tier) == tier and not exclude.has(c.id))
	if pool.is_empty():
		pool = CAPTAINS.filter(func(c: Dictionary) -> bool: return int(c.tier) >= mini(tier, 4) and not exclude.has(c.id))
	if pool.is_empty():
		pool = CAPTAINS.filter(func(c: Dictionary) -> bool: return int(c.tier) == tier)
	var sunk: Dictionary = ledger.get("sunk", {})
	var fresh_ones := pool.filter(func(c: Dictionary) -> bool: return not sunk.has(c.id))
	var from := fresh_ones if not fresh_ones.is_empty() else pool
	var r: float = rnd.call() if rnd.is_valid() else randf()
	return from[mini(from.size() - 1, int(r * from.size()))]
