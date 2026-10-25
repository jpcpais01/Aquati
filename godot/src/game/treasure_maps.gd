class_name TreasureMaps
extends RefCounted
## Treasure maps (the web's src/game/treasureMaps.ts). A map comes torn in
## three pieces, found in sea chests, the cutthroats' camps and on boarded
## ships. The first piece fixes where it leads (an X on one of the islands of
## the waters you're in); the third completes it, and the X goes on the chart
## and the sand. Dig there and the next map starts afresh. Kept between voyages
## (Progress.maps holds `state`).

const ALL_PIECES := 7

## {pieces: bits 1, 2, 4 = left, middle, right thirds; seed: fixes the X and
## the tears (0 before the first piece); isle; x; z; dug: treasures dug up,
## ever; seen: the pieces you've looked at on the map}.
var state := fresh()


static func fresh() -> Dictionary:
	return {"pieces": 0, "seed": 0, "isle": "", "x": 0.0, "z": 0.0, "dug": 0, "seen": 0}


## A saved map tidied (anything malformed is dropped).
static func sanitize(v: Variant) -> Dictionary:
	var s := fresh()
	if not v is Dictionary:
		return s
	var d: Dictionary = v
	var n := func(k: String) -> float:
		var x: Variant = d.get(k, 0)
		return float(x) if (x is float or x is int) and is_finite(float(x)) else 0.0
	s.pieces = clampi(int(n.call("pieces")), 0, ALL_PIECES)
	s.seed = int(n.call("seed"))
	s.isle = str(d.get("isle", "")) if d.get("isle") is String else ""
	s.x = n.call("x")
	s.z = n.call("z")
	s.dug = maxi(0, int(n.call("dug")))
	s.seen = clampi(int(n.call("seen")), 0, ALL_PIECES)
	return s


static func pieces_in(bits: int) -> int:
	return (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1)


func count() -> int:
	return pieces_in(int(state.pieces))


func complete() -> bool:
	return int(state.pieces) == ALL_PIECES and str(state.isle) != ""


## Where the X is once the map is whole ({isle, x, z}), else {}.
func target() -> Dictionary:
	if not complete():
		return {}
	return {"isle": state.isle, "x": float(state.x), "z": float(state.z)}


## A torn piece found: one of the missing thirds. The first piece of a map
## picks its X (`site` turns a seed into {isle, x, z}, or {} where none fits).
## Returns the piece's index, or -1 if the map is already whole.
func add_piece(site: Callable) -> int:
	var s := state
	if int(s.pieces) == ALL_PIECES:
		return -1
	if int(s.pieces) == 0 or str(s.isle) == "":
		var t := {}
		for i in 6:
			s.seed = 1 + randi() % (1 << 30)
			t = site.call(int(s.seed))
			if not t.is_empty():
				break
		if t.is_empty():
			return -1
		s.isle = str(t.isle)
		s.x = roundf(float(t.x) * 10.0) / 10.0
		s.z = roundf(float(t.z) * 10.0) / 10.0
		s.seen = 0
	var missing: Array[int] = []
	for i in 3:
		if not int(s.pieces) & (1 << i):
			missing.append(i)
	var i: int = missing[randi() % missing.size()]
	s.pieces = int(s.pieces) | (1 << i)
	return i


## The chest is up: this map is spent, and the next starts blank.
func consume() -> void:
	var dug := int(state.dug) + 1
	state = fresh()
	state.dug = dug
