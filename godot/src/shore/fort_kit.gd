class_name FortKit
extends RefCounted
## The Brethren's island forts (the web game's src/shore/fortKit.ts). No two
## alike: a castillo of pale coral-stone with round bastions and domed sentry
## boxes, a star fort whose arrowhead bastions push out at the corners, a
## squat tower fort round a tall keep, and up in Las Brumas dark, mossy sea
## keeps under steep slate roofs. Each is a square of curtain walls battered
## out at the foot, guns in the embrasures of its seaward walls, an arched
## gate and a ramp on the landward side, and a flagged plaza inside with
## barracks, a magazine, chapel or keep, a brazier and a tall flagstaff.
##
## What a battering can knock down (the parapet round each gun, the tops of
## the corner towers, the barracks roof) is built three ways, whole, wrecked
## and patched with timber, all at load and in the towns' own material, so a
## fort can fall to pieces under your guns without anything compiling
## mid-voyage. Everything is built in the fort's own frame (+z out to sea, the
## plaza floor at y = 0), with the towns' builder (TownKit).

## Half the width a fort's site is surveyed for.
const FORT_H := 12.5
const GATE_W := 3.2
const GATE_H := 3.2
## The trunnions' height above the rampart.
const GUN_PIVOT := 0.78
## The stretch of parapet either side of a gun that is that gun's to lose.
const BAND := 2.2

## Each style as the web writes it (palette in sRGB hex; style() turns it
## into linear colours and lays out the guns).
const STYLES := {
	"castillo": {"kind": "castle", "H": 12.5, "T": 3.2, "WH": 4.4, "PH": 1.25, "PT": 1.0, "tower": "round", "R": 3.0, "rise": 0.0, "roof": "none", "parapet": "round", "garita": true, "hall": "magazine", "hoarding": false,
		"guns": [["sea", -4.6], ["sea", 4.6], ["east", 4.8], ["west", 4.8]],
		"P": {"stone": "#dcc7a0", "lo": "#b19a74", "cap": "#eedfbf", "damp": "#7c7457", "floor": "#d3c09a", "wash": "#f1e8d6", "tile": "#b5523a", "roof": "#b5523a", "moss": 0.0}},
	"estrella": {"kind": "star fort", "H": 13.0, "T": 3.4, "WH": 4.8, "PH": 1.3, "PT": 1.1, "tower": "point", "R": 4.8, "rise": 0.0, "roof": "none", "parapet": "round", "garita": true, "hall": "chapel", "hoarding": false,
		"guns": [["sea", -5.0], ["sea", 0.0], ["sea", 5.0], ["east", 2.4], ["west", 2.4]],
		"P": {"stone": "#cbb995", "lo": "#9b8a68", "cap": "#e6dabd", "damp": "#6d6a52", "floor": "#c6b38e", "wash": "#f4eee2", "tile": "#a84a33", "roof": "#a84a33", "moss": 0.05}},
	"torre": {"kind": "tower fort", "H": 10.0, "T": 2.8, "WH": 4.0, "PH": 1.2, "PT": 0.9, "tower": "square", "R": 2.6, "rise": 2.0, "roof": "none", "parapet": "crenel", "garita": false, "hall": "keep", "hoarding": false,
		"guns": [["sea", -3.1], ["sea", 3.1], ["west", 1.2]],
		"P": {"stone": "#ddb07f", "lo": "#a97a52", "cap": "#f0d0a6", "damp": "#6e5a40", "floor": "#d6b28a", "wash": "#f4e6d0", "tile": "#9a4630", "roof": "#9a4630", "moss": 0.02}},
	"bruma": {"kind": "sea keep", "H": 12.0, "T": 3.0, "WH": 4.6, "PH": 1.2, "PT": 0.95, "tower": "square", "R": 3.0, "rise": 2.4, "roof": "pyramid", "parapet": "crenel", "garita": false, "hall": "magazine", "hoarding": true,
		"guns": [["sea", -4.2], ["sea", 4.2], ["east", 3.4], ["west", 3.4]],
		"P": {"stone": "#9c9e95", "lo": "#6b6e67", "cap": "#bbbcb2", "damp": "#3b4f34", "floor": "#8e9088", "wash": "#dcd8cd", "tile": "#6a7684", "roof": "#5d6b7c", "moss": 0.6}},
	"niebla": {"kind": "mist castle", "H": 11.5, "T": 3.0, "WH": 4.4, "PH": 1.1, "PT": 0.95, "tower": "round", "R": 3.3, "rise": 2.6, "roof": "cone", "parapet": "crenel", "garita": false, "hall": "magazine", "hoarding": true,
		"guns": [["sea", -4.0], ["sea", 4.0], ["east", 3.0], ["west", 3.0]],
		"P": {"stone": "#a6a796", "lo": "#75786a", "cap": "#c4c5b6", "damp": "#3f5638", "floor": "#9a9c8f", "wash": "#e2ddd0", "tile": "#8a4838", "roof": "#58687a", "moss": 0.45}},
}

const SOOT := "#1e1a17"
const CHAR := "#2a211b"
const MOSS := "#5d8a3c"
const TIMBER := "#8a6440"
const WICKER := "#8a6a3e"
const IRON_DARK := "#2c2a28"

static var _styles := {}
static var _dodeca_v := PackedVector3Array()
static var _dodeca_i := PackedInt32Array()

# the build in hand
var S: Dictionary
var P: Dictionary
var site: Dictionary
var ground: Callable
var rnd: Mulberry32
var b: TownKit
var H := 0.0
var T := 0.0
var WH := 0.0
var PH := 0.0
var PT := 0.0
var TB := 0.0
var D := 0.0
var PL := 0.0
var ms := 1.0
var cs: Array[Dictionary] = []
var low_g := 0.0
var pieces: Array[Dictionary] = []
var blocks: Array[Vector3] = []
var _soot: Color
var _char: Color
var _moss: Color
var _timber: Color
var _wicker: Color
var _iron: Color


# ------------------------------------------------------------------ styles

## A style with its colours in linear light and its guns laid out on the
## rampart ([x, z, yaw] in the fort's frame, the embrasure's facing).
static func style(id: String) -> Dictionary:
	if _styles.has(id):
		return _styles[id]
	var src: Dictionary = STYLES.get(id, STYLES.castillo)
	var s := src.duplicate(true)
	s.id = id if STYLES.has(id) else "castillo"
	var h: float = s.H
	var guns: Array[Vector3] = []
	for g: Array in src.guns:
		var at: float = g[1]
		match str(g[0]):
			"sea":
				guns.append(Vector3(at, h - 1.6, 0.0))
			"east":
				guns.append(Vector3(h - 1.6, at, PI * 0.5))
			_:
				guns.append(Vector3(-(h - 1.6), at, -PI * 0.5))
	s.guns = guns
	var pal := {}
	for k: String in src.P:
		pal[k] = TownKit.lin(src.P[k]) if src.P[k] is String else src.P[k]
	s.P = pal
	_styles[id] = s
	return s


## The corner works: centre, radius (round) or plan (square/point, the fort
## frame, wound outward), the top of the stonework and which way it points.
static func corners(s: Dictionary) -> Array[Dictionary]:
	var h: float = s.H
	var out: Array[Dictionary] = []
	for sg: Vector2 in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
		var a := atan2(sg.y, sg.x)
		var top: float = s.WH + s.rise
		if s.tower == "round":
			var c := h - 0.7
			out.append({"x": sg.x * c, "z": sg.y * c, "r": float(s.R), "poly": PackedVector2Array(), "top": top, "out": a})
		elif s.tower == "square":
			var c := h - 0.4
			var R: float = s.R
			var poly := PackedVector2Array()
			for p: Vector2 in [Vector2(c - R, c - R), Vector2(c + R, c - R), Vector2(c + R, c + R), Vector2(c - R, c + R)]:
				poly.append(Vector2(sg.x * p.x, sg.y * p.y))
			out.append({"x": sg.x * c, "z": sg.y * c, "r": R * 1.2, "poly": poly, "top": top, "out": a})
		else:
			# an arrowhead: a kite from the rampart's corner out past the walls' corner, flanks square to the curtain
			var f: float = h - float(s.R)
			var poly := PackedVector2Array()
			for p: Vector2 in [Vector2(f, f), Vector2(h, f), Vector2(h + 2.6, f), Vector2(h + 5.2, h + 5.2), Vector2(f, h + 2.6), Vector2(f, h)]:
				poly.append(Vector2(sg.x * p.x, sg.y * p.y))
			out.append({"x": sg.x * (h + 1.2), "z": sg.y * (h + 1.2), "r": 5.2, "poly": poly, "top": float(s.WH), "out": a})
	return out


## How far the corner works reach from the fort's middle.
static func reach(s: Dictionary) -> float:
	var h: float = s.H
	if s.tower == "point":
		return (h + 5.2) * sqrt(2.0)
	if s.tower == "square":
		return (h - 0.4 + float(s.R)) * sqrt(2.0)
	return (h - 0.7) * sqrt(2.0) + float(s.R)


## How far out the corners stick past the curtain (for walkers rounding them).
static func corner_pad(s: Dictionary) -> float:
	return 5.2 if s.tower == "point" else (float(s.R) - 0.4 if s.tower == "square" else 1.0)


## Fort frame to world (y the plaza floor).
static func to_world(st: Dictionary, lx: float, lz: float) -> Vector3:
	var yaw := float(st.yaw)
	var cy := cos(yaw)
	var sy := sin(yaw)
	return Vector3(float(st.x) + lx * cy + lz * sy, float(st.get("y", 0.0)), float(st.z) - lx * sy + lz * cy)


## World to the fort frame (x across, z out to sea).
static func to_fort(st: Dictionary, x: float, z: float) -> Vector2:
	var yaw := float(st.yaw)
	var cy := cos(yaw)
	var sy := sin(yaw)
	var dx := x - float(st.x)
	var dz := z - float(st.z)
	return Vector2(dx * cy - dz * sy, dx * sy + dz * cy)


# ------------------------------------------------------------------ shapes, for shot and scars

static func _in_poly(poly: PackedVector2Array, x: float, z: float) -> bool:
	var sign := 0.0
	for i in poly.size():
		var a := poly[i]
		var c := poly[(i + 1) % poly.size()]
		var cr := (c.x - a.x) * (z - a.y) - (c.y - a.y) * (x - a.x)
		if cr == 0.0:
			continue
		if sign == 0.0:
			sign = signf(cr)
		elif signf(cr) != sign:
			return false
	return true


## The corner a point is in (fort frame), or -1.
static func corner_at(c_s: Array[Dictionary], x: float, z: float, pad := 0.0) -> int:
	for j in c_s.size():
		var c := c_s[j]
		var poly: PackedVector2Array = c.poly
		var d := Vector2(x - float(c.x), z - float(c.z)).length()
		if poly.is_empty():
			if d < float(c.r) + pad:
				return j
		elif _in_poly(poly, x, z) or d < pad:
			return j
	return -1


## The keep's place and size (torre), x mirrored by `m`.
static func keep_spot(s: Dictionary, m: float) -> Dictionary:
	var pl: float = s.H - s.T
	return {"x": m * (pl - 2.6), "z": -pl + 2.8, "r": 2.5, "top": float(s.WH) + 6.4}


## Is there stone at this point of a fort (fort frame, y above the plaza)?
static func solid(s: Dictionary, c_s: Array[Dictionary], x: float, z: float, y: float, m := 1.0) -> bool:
	var h: float = s.H
	var j := corner_at(c_s, x, z)
	if j >= 0:
		var c := c_s[j]
		var roofed := 4.0 if s.roof != "none" else (2.4 if s.garita else 0.0)
		if y < float(c.top) + float(s.PH) + 0.25:
			return true
		if roofed > 0.0 and y < float(c.top) + float(s.PH) + roofed and Vector2(x - float(c.x), z - float(c.z)).length() < float(c.r) * 0.75:
			return true
		return false
	if s.hall == "keep":
		var k := keep_spot(s, m)
		if Vector2(x - float(k.x), z - float(k.z)).length() < float(k.r) and y < float(k.top):
			return true
	var mm := maxf(absf(x), absf(z))
	var tb: float = s.WH * 0.45
	var face := h + (tb - y) * 0.18 if y < tb else h
	if mm < face + 0.15 and mm > h - float(s.T) - 0.1:
		if y < float(s.WH):
			return true
		if y < float(s.WH) + float(s.PH) and mm > h - float(s.PT) - 0.05:
			return true
		return false
	return mm <= h - float(s.T) and y < 0.15


## Where a ball that struck at (x, y, z) leaves its scar: the nearest face of
## stone and which way it looks (fort frame). {j: the corner it's on or -1, at, n}.
static func surface(s: Dictionary, c_s: Array[Dictionary], x: float, z: float, y: float) -> Dictionary:
	var h: float = s.H
	var tb: float = s.WH * 0.45
	var j := corner_at(c_s, x, z, 0.6)
	if j >= 0:
		var c := c_s[j]
		var yy := minf(y, float(c.top) - 0.45)
		var poly: PackedVector2Array = c.poly
		if poly.is_empty():
			var a := atan2(z - float(c.z), x - float(c.x))
			var r := (float(c.r) + (tb - yy) * 0.18 if yy < tb else float(c.r)) + 0.03
			return {"j": j, "at": Vector3(float(c.x) + cos(a) * r, yy, float(c.z) + sin(a) * r), "n": Vector3(cos(a), 0.18 if yy < tb else 0.0, sin(a)).normalized()}
		# the nearest outer edge of its plan
		var bd := INF
		var at := Vector3(x, yy, z)
		var n := Vector3.UP
		for i in poly.size():
			var a := poly[i]
			var e := poly[(i + 1) % poly.size()] - a
			var L := maxf(e.length(), 1e-6)
			var t := clampf(((x - a.x) * e.x + (z - a.y) * e.y) / (L * L), 0.05, 0.95)
			var p := a + e * t
			# its outward normal: away from the corner's middle
			var nn := Vector2(e.y / L, -e.x / L)
			if nn.x * (p.x - float(c.x)) + nn.y * (p.y - float(c.z)) < 0.0:
				nn = -nn
			# an edge inside the walls never takes a ball
			if maxf(absf(p.x + nn.x), absf(p.y + nn.y)) < h - 0.2:
				continue
			var d := Vector2(x - p.x, z - p.y).length()
			if d < bd:
				bd = d
				var o := ((tb - yy) * 0.18 if yy < tb else 0.0) + 0.03
				at = Vector3(p.x + nn.x * o, yy, p.y + nn.y * o)
				n = Vector3(nn.x, 0.18 if yy < tb else 0.0, nn.y).normalized()
		return {"j": j, "at": at, "n": n}
	var ax := absf(x)
	var az := absf(z)
	var mm := maxf(ax, az)
	if mm <= h - float(s.T) + 0.05 and y < 0.6:
		return {"j": -1, "at": Vector3(x, 0.02, z), "n": Vector3.UP}
	if mm < h - float(s.PT) and y > float(s.WH) - 0.3:
		return {"j": -1, "at": Vector3(x, float(s.WH) + 0.02, z), "n": Vector3.UP}
	# a ball on the parapet scars the face just under it (the parapet's own wreck shows the rest)
	var yy := minf(y, float(s.WH) - 0.45)
	var f := (h + (tb - yy) * 0.18 if yy < tb else h) + 0.03
	var sl := 0.18 if yy < tb else 0.0
	var lim := h - 1.0
	if ax > az:
		return {"j": -1, "at": Vector3(signf(x) * f, yy, clampf(z, -lim, lim)), "n": Vector3(signf(x), sl, 0.0).normalized()}
	return {"j": -1, "at": Vector3(clampf(x, -lim, lim), yy, signf(z) * f), "n": Vector3(0.0, sl, signf(z)).normalized()}


# ------------------------------------------------------------------ paint

static func _hash(a: float, c: float) -> float:
	var s := sin(a * 127.1 + c * 311.7) * 43758.5453
	return s - floorf(s)


## Ashlar: courses 0.62 m high, blocks 1.3 m long, each a little lighter or
## darker; damp and mossy toward the foot, streaked by rain.
func ashlar(c: Vector3, n: Vector3, gnd: float) -> Color:
	var tb := WH * 0.45
	var along := c.z if absf(n.x) > absf(n.z) else c.x
	var course := floori((c.y + 30.0) / 0.62)
	var blk := floori((along + 40.0 + (course % 2) * 0.65) / 1.3)
	var k := 0.9 + _hash(course, blk) * 0.16
	var moss: float = P.moss
	# rain has run down from the coping in dark streaks
	var streak := _hash(floori((along + 40.0) / 0.5), 3.7)
	if streak > 0.78:
		k *= 1.0 - (streak - 0.78) * (0.55 + moss * 0.8) * clampf((c.y - gnd) / 3.0, 0.2, 1.0)
	var base: Color = (P.lo as Color).lerp(P.stone, clampf((c.y + 1.5) / (tb + 1.5), 0.0, 1.0)) if c.y < tb else P.stone
	base = base.lerp(P.damp, clampf((gnd + 1.2 - c.y) / 1.6, 0.0, 1.0) * 0.7)
	if moss > 0.0:
		# moss creeping up from the foot, and in patches where the blocks stay wet
		var patch := _hash(floori((along + 40.0) / 1.9), floori((c.y + 30.0) / 1.24))
		var m := moss * (clampf((gnd + 2.6 - c.y) / 2.6, 0.0, 1.0) * 0.85 + (0.45 if patch > 0.72 else 0.0) + (0.5 if n.y > 0.5 else 0.0))
		base = base.lerp(_moss, clampf(m, 0.0, 0.8))
	return TownKit.shade(base, k)


## Coping and parapet tops: the palest stone, mossed over in the mists.
func cap_stone(c: Vector3, n: Vector3, k := 1.0) -> Color:
	var v := 0.92 + _hash(floori(c.x * 1.3 + c.z * 1.3), floori(c.y * 2.0)) * 0.1
	var base: Color = P.cap
	var moss: float = P.moss
	if moss > 0.0 and (n.y > 0.4 or _hash(floori(c.x * 0.8), floori(c.z * 0.8)) > 0.6):
		base = base.lerp(_moss, moss * 0.5)
	return TownKit.shade(base, v * k)


## Stone a fire has blackened: darker the nearer the heart of it.
func scorched(col: Color, t: float) -> Color:
	return col.lerp(_soot, clampf(t, 0.0, 1.0) * 0.85)


func _ash(c: Vector3, n: Vector3) -> Color:
	return ashlar(c, n, low_g + 1.5)


func _cap(c: Vector3, n: Vector3) -> Color:
	return cap_stone(c, n)


# ------------------------------------------------------------------ emitting

static func _store(c: Color, kind := TownKit.WOOD) -> Color:
	return TownKit._store(c, kind, MeshKit.code(kind))


## Paints each triangle laid down since mark `m` one colour, from its centre
## and its face's normal (the web's faceted()): flat facets, or keeping the
## shape's smooth normals.
static func faces(t: TownKit, m: Vector2i, paint: Callable, flat := true, kind := TownKit.WOOD) -> void:
	var k := t.kit
	var tris := k.indices.slice(m.y)
	var pos := k.verts.slice(m.x)
	var nor := k.normals.slice(m.x)
	k.verts.resize(m.x)
	k.normals.resize(m.x)
	k.colors.resize(m.x)
	k.indices.resize(m.y)
	for i in range(0, tris.size(), 3):
		var ia := tris[i] - m.x
		var ib := tris[i + 1] - m.x
		var ic := tris[i + 2] - m.x
		var a := pos[ia]
		var bb := pos[ib]
		var c := pos[ic]
		# stored clockwise: this cross points out
		var fn := (c - a).cross(bb - a).normalized()
		var col := _store(paint.call((a + bb + c) / 3.0, fn), kind)
		var base := k.verts.size()
		k.verts.append(a)
		k.verts.append(bb)
		k.verts.append(c)
		if flat:
			k.normals.append(fn)
			k.normals.append(fn)
			k.normals.append(fn)
		else:
			k.normals.append(nor[ia])
			k.normals.append(nor[ib])
			k.normals.append(nor[ic])
		for j in 3:
			k.colors.append(col)
			k.indices.append(base + j)


## One flat triangle (three.js order, counter-clockwise from outside once
## wound to face `out`), in colour col, every point through xf.
static func _tri(k: MeshKit, a: Vector3, c1: Vector3, c2: Vector3, out: Vector3, col: Color, xf: Transform3D) -> void:
	var p := a
	var q := c1
	var r := c2
	if (q - p).cross(r - p).dot(out) < 0.0:
		q = c2
		r = c1
	var wp := xf * p
	var wq := xf * q
	var wr := xf * r
	var n := (wq - wp).cross(wr - wp).normalized()
	var i := k.verts.size()
	k.verts.append(wp)
	k.verts.append(wq)
	k.verts.append(wr)
	for j in 3:
		k.normals.append(n)
		k.colors.append(col)
	k.tri(i, i + 1, i + 2)


## Cuts a run into staggered block joints: the cut points (0..n) of course `j`.
static func _joints(n: int, j: int) -> PackedFloat32Array:
	var cuts := PackedFloat32Array([0.0])
	for k in range(1, n):
		cuts.append(k - (j % 2) * 0.5)
	if j % 2 == 1 and n > 1:
		cuts.append(n - 0.5)
	cuts.append(n)
	return cuts


## A solid from a convex profile in (z, y), run along x from x0 to x1: side
## faces cut into a grid of block-sized cells (each its own tone) and both end
## caps, every face wound outward, flat-shaded. Painted where `local` puts it
## (the face's own frame), then laid down through `outer`.
func prism(t: TownKit, profile: PackedVector2Array, x0: float, x1: float, paint: Callable, cell := 1.3, course := 0.62, local := Transform3D.IDENTITY, outer := Transform3D.IDENTITY) -> void:
	var k := t.kit
	var cz := 0.0
	var cy := 0.0
	var N := profile.size()
	for p in profile:
		cz += p.x / N
		cy += p.y / N
	var nx := maxi(1, ceili((x1 - x0) / cell))
	var lb := local.basis
	for i in N:
		var pa := profile[i]
		var pb := profile[(i + 1) % N]
		var out := Vector3(0.0, (pa.y + pb.y) * 0.5 - cy, (pa.x + pb.x) * 0.5 - cz)
		var ny := maxi(1, ceili(pa.distance_to(pb) / course))
		for j in ny:
			var z0 := pa.x + (pb.x - pa.x) * j / ny
			var y0 := pa.y + (pb.y - pa.y) * j / ny
			var z1 := pa.x + (pb.x - pa.x) * (j + 1) / ny
			var y1 := pa.y + (pb.y - pa.y) * (j + 1) / ny
			# joints staggered course by course, like laid stone
			var cuts := _joints(nx, j)
			for c in cuts.size() - 1:
				var xa := x0 + (x1 - x0) * cuts[c] / nx
				var xb := x0 + (x1 - x0) * cuts[c + 1] / nx
				if xb - xa < 1e-4:
					continue
				_quad(k, local * Vector3(xa, y0, z0), local * Vector3(xb, y0, z0), local * Vector3(xb, y1, z1), local * Vector3(xa, y1, z1), lb * out, paint, outer)
	for e in 2:
		var x := x0 if e == 0 else x1
		var pts: Array[Vector3] = []
		for p in profile:
			pts.append(local * Vector3(x, p.y, p.x))
		_fan(k, pts, lb * Vector3(-1.0 if e == 0 else 1.0, 0.0, 0.0), paint, outer)


func _quad(k: MeshKit, a: Vector3, c1: Vector3, c2: Vector3, d: Vector3, out: Vector3, paint: Callable, outer: Transform3D) -> void:
	var col := _store(paint.call((a + c2) * 0.5, out.normalized()))
	_tri(k, a, c1, c2, out, col, outer)
	_tri(k, a, c2, d, out, col, outer)


func _fan(k: MeshKit, pts: Array[Vector3], out: Vector3, paint: Callable, outer: Transform3D) -> void:
	for i in range(1, pts.size() - 1):
		var col := _store(paint.call((pts[0] + pts[i] + pts[i + 1]) / 3.0, out))
		_tri(k, pts[0], pts[i], pts[i + 1], out, col, outer)


## A box (its top edge pulled in by r, the web's roundBox) w x h x d round
## the origin of `local`, painted face by face in local's frame.
func box(t: TownKit, w: float, h: float, d: float, local: Transform3D, paint: Callable, r := 0.0, outer := Transform3D.IDENTITY) -> void:
	var f := 1.0 - r / maxf(d, 1e-3)
	var prof := PackedVector2Array([Vector2(-d * 0.5, -h * 0.5), Vector2(d * 0.5, -h * 0.5), Vector2(d * 0.5 * f, h * 0.5), Vector2(-d * 0.5 * f, h * 0.5)])
	prism(t, prof, -w * 0.5, w * 0.5, paint, w + 1.0, h + d + 1.0, local, outer)


## A convex plan (fort frame) stood up from y0 to y1: battered out below the
## cordon at `tb`, its faces coursed like the walls, a flat top.
func pile(t: TownKit, plan: PackedVector2Array, y0: float, y1: float, tb: float, paint: Callable, top: Callable) -> void:
	var k := t.kit
	var N := plan.size()
	var mx := 0.0
	var mz := 0.0
	for p in plan:
		mx += p.x / N
		mz += p.y / N
	# each corner's mitre: how far out it moves for the faces either side to move out by 1
	var mitre := PackedVector2Array()
	for i in N:
		var n1 := edge_out(plan[(i + N - 1) % N], plan[i], mx, mz)
		var n2 := edge_out(plan[i], plan[(i + 1) % N], mx, mz)
		var dd := 1.0 + n1.dot(n2)
		mitre.append((n1 + n2) / dd)
	var at := func(i: int, y: float) -> Vector3:
		var o := (tb - y) * 0.18 if y < tb else 0.0
		return Vector3(plan[i].x + mitre[i].x * o, y, plan[i].y + mitre[i].y * o)
	var levels := PackedFloat32Array([y0, tb, y1]) if y0 < tb and tb < y1 else PackedFloat32Array([y0, y1])
	for i in N:
		var kk := (i + 1) % N
		var n := edge_out(plan[i], plan[kk], mx, mz)
		var out := Vector3(n.x, 0.0, n.y)
		var nx := maxi(1, ceili(plan[i].distance_to(plan[kk]) / 1.3))
		var course := 0
		for l in levels.size() - 1:
			var ya := levels[l]
			var yb := levels[l + 1]
			var ny := maxi(1, ceili((yb - ya) / 0.62))
			for j in ny:
				var y0j := ya + (yb - ya) * j / ny
				var y1j := ya + (yb - ya) * (j + 1) / ny
				var a0: Vector3 = at.call(i, y0j)
				var b0: Vector3 = at.call(kk, y0j)
				var a1: Vector3 = at.call(i, y1j)
				var b1: Vector3 = at.call(kk, y1j)
				var cuts := _joints(nx, course)
				for c in cuts.size() - 1:
					var u0 := cuts[c] / nx
					var u1 := cuts[c + 1] / nx
					if u1 - u0 < 1e-4:
						continue
					_quad(k, a0.lerp(b0, u0), a0.lerp(b0, u1), a1.lerp(b1, u1), a1.lerp(b1, u0), out, paint, Transform3D.IDENTITY)
				course += 1
	var pts: Array[Vector3] = []
	for i in N:
		pts.append(at.call(i, y1))
	_fan(k, pts, Vector3.UP, top, Transform3D.IDENTITY)


static func edge_out(a: Vector2, c: Vector2, mx: float, mz: float) -> Vector2:
	var e := c - a
	var L := maxf(e.length(), 1e-6)
	var n := Vector2(e.y / L, -e.x / L)
	if n.dot((a + c) * 0.5 - Vector2(mx, mz)) < 0.0:
		n = -n
	return n


## A lathe profile with its long runs cut into courses, so the stonework can take its tones.
static func densify(prof: PackedVector2Array, step := 0.62) -> PackedVector2Array:
	var out := PackedVector2Array([prof[0]])
	for i in range(1, prof.size()):
		var a := prof[i - 1]
		var c := prof[i]
		var n := maxi(1, ceili(a.distance_to(c) / step))
		for k in range(1, n + 1):
			out.append(a.lerp(c, float(k) / n))
	return out


## A turned profile (radius, y) spun round `at`, painted triangle by triangle.
func lathe(t: TownKit, prof: PackedVector2Array, seg: int, at: Vector3, paint: Callable, flat := false) -> void:
	var p := prof
	if p[0].y > p[p.size() - 1].y:
		p = prof.duplicate()
		p.reverse()
	var m := t._mark()
	t.kit.lathe(Transform3D(Basis.IDENTITY, at), p, seg)
	faces(t, m, paint, flat)


## A tumbled block of masonry: a squashed dodecahedron, flat-shaded.
func rock(t: TownKit, s: float, pos: Vector3, col: Color) -> void:
	var sy := 0.7 + rnd.next() * 0.25
	var ry := rnd.next() * 3.0
	var rx := (rnd.next() - 0.5) * 0.6
	var xf := Transform3D(Basis(Vector3.RIGHT, rx) * Basis(Vector3.UP, ry) * Basis.from_scale(Vector3(1.25, sy, 1.0) * s), pos)
	dodeca(t.kit, xf, _store(col))


## A dodecahedron of radius 1 through xf, flat-shaded in one colour (three.js DodecahedronGeometry(1, 0)).
static func dodeca(k: MeshKit, xf: Transform3D, col: Color) -> void:
	if _dodeca_v.is_empty():
		var g := (1.0 + sqrt(5.0)) * 0.5
		var r := 1.0 / g
		var v := [-1, -1, -1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, -1, -1, 1, -1, 1, 1, 1, -1, 1, 1, 1,
				0, -r, -g, 0, -r, g, 0, r, -g, 0, r, g, -r, -g, 0, -r, g, 0, r, -g, 0, r, g, 0, -g, 0, -r, g, 0, -r, -g, 0, r, g, 0, r]
		for i in range(0, v.size(), 3):
			_dodeca_v.append(Vector3(v[i], v[i + 1], v[i + 2]).normalized())
		_dodeca_i = PackedInt32Array([3, 11, 7, 3, 7, 15, 3, 15, 13, 7, 19, 17, 7, 17, 6, 7, 6, 15, 17, 4, 8, 17, 8, 10, 17, 10, 6, 8, 0, 16, 8, 16, 2, 8, 2, 10, 0, 12, 1, 0, 1, 18, 0, 18, 16,
				6, 10, 2, 6, 2, 13, 6, 13, 15, 2, 16, 18, 2, 18, 3, 2, 3, 13, 18, 1, 9, 18, 9, 11, 18, 11, 3, 4, 14, 12, 4, 12, 0, 4, 0, 8, 11, 9, 5, 11, 5, 19, 11, 19, 7, 19, 5, 14, 19, 14, 4, 19, 4, 17, 1, 12, 14, 1, 14, 5, 1, 5, 9])
	for i in range(0, _dodeca_i.size(), 3):
		var a := _dodeca_v[_dodeca_i[i]]
		var c1 := _dodeca_v[_dodeca_i[i + 1]]
		var c2 := _dodeca_v[_dodeca_i[i + 2]]
		_tri(k, a, c1, c2, a + c1 + c2, col, xf)


# ------------------------------------------------------------------ helpers

## Spins a frame built facing +z (the sea wall) round to face side `k` (0 sea, 1 +x, 2 land, 3 -x).
static func side_xf(k: int) -> Transform3D:
	return Transform3D(Basis(Vector3.UP, k * PI * 0.5), Vector3.ZERO)


## A point on face `k`'s own frame (u along it, v out) in the fort's frame.
static func face_to_fort(k: int, u: float, v: float) -> Vector2:
	var a := k * PI * 0.5
	var c := roundf(cos(a))
	var s := roundf(sin(a))
	return Vector2(u * c + v * s, -u * s + v * c)


## Which wall an embrasure facing `yaw` (fort frame) is in.
static func side_of(yaw: float) -> int:
	return posmod(roundi(yaw / (PI * 0.5)), 4)


## A gun's place along its own wall (its face frame's u).
static func along_of(g: Vector3) -> float:
	match side_of(g.z):
		0:
			return g.x
		1:
			return -g.y
		2:
			return -g.x
	return g.y


## A point's place along face `k` (fort frame back to the face's own u).
static func side_u(k: int, p: Vector3) -> float:
	match k:
		0:
			return p.x
		1:
			return -p.z
		2:
			return -p.x
	return p.z


func _G(lx: float, lz: float) -> float:
	var p := to_world(site, lx, lz)
	return float(ground.call(p.x, p.z)) - float(site.y)


func _W(lx: float, lz: float, ly := 0.0) -> Vector3:
	var p := to_world(site, lx, lz)
	p.y = float(site.y) + ly
	return p


func _block(lx: float, lz: float, r: float) -> void:
	var p := to_world(site, lx, lz)
	blocks.append(Vector3(p.x, p.z, r))


func _piece(key: String, at: Vector3) -> Dictionary:
	var p := {"key": key, "at": at, "intact": TownKit.new(17), "broken": TownKit.new(19), "patch": TownKit.new(23)}
	pieces.append(p)
	return p


func _piece_of(key: String) -> Dictionary:
	for p in pieces:
		if p.key == key:
			return p
	return {}


## A talus of fallen blocks on the ground (fort frame), scorched or not.
func _talus(into: TownKit, lx: float, lz: float, spread: float, n: int, dir: float, hot := 0.4) -> void:
	for i in n:
		var a := dir + (rnd.next() - 0.5) * 1.6
		var r := rnd.next() * spread
		var x := lx + cos(a) * r
		var z := lz + sin(a) * r
		var sz := 0.22 + rnd.next() * 0.3
		var at := Vector3(x, _G(x, z) + sz * 0.35, z)
		var sy := 0.7 + rnd.next() * 0.25
		var ry := rnd.next() * 3.0
		var rx := (rnd.next() - 0.5) * 0.6
		var col := scorched(TownKit.shade(P.stone, 0.72 + rnd.next() * 0.3), rnd.next() * hot)
		dodeca(into.kit, Transform3D(Basis(Vector3.RIGHT, rx) * Basis(Vector3.UP, ry) * Basis.from_scale(Vector3(1.25, sy, 1.0) * sz), at), _store(col))


## A blackened beam between two points (a roof's charred rafter).
func _rafter(into: TownKit, a: Vector3, c: Vector3, r: float) -> void:
	var ch := _char
	into.beam(a, c, r, func(p: Vector3) -> Color: return TownKit.lin("#4a2a18") if _hash(floori(p.y * 5.0), floori(p.x * 5.0 + p.z * 5.0)) > 0.7 else ch, TownKit.WOOD, 5)


static func _move(p: Vector3) -> Transform3D:
	return Transform3D(Basis.IDENTITY, p)


# ------------------------------------------------------------------ the fort

## Builds a fort in its own frame (y = 0 the plaza floor) and returns where
## its garrison stands, its guns, its chest and flag, what can be knocked
## down and what's solid (layout positions in the world). `gnd` is the
## terrain's height (world x, z).
static func build(p_site: Dictionary, gnd: Callable, seed_value: int) -> Dictionary:
	var f := FortKit.new()
	return f._build(p_site, gnd, seed_value)


func _build(p_site: Dictionary, gnd: Callable, seed_value: int) -> Dictionary:
	site = p_site
	ground = gnd
	rnd = Mulberry32.new(seed_value)
	S = style(str(site.get("style", "castillo")))
	P = S.P
	b = TownKit.new(seed_value)
	_soot = TownKit.lin(SOOT)
	_char = TownKit.lin(CHAR)
	_moss = TownKit.lin(MOSS)
	_timber = TownKit.lin(TIMBER)
	_wicker = TownKit.lin(WICKER)
	_iron = TownKit.lin(IRON_DARK)
	H = S.H
	T = S.T
	WH = S.WH
	PH = S.PH
	PT = S.PT
	TB = WH * 0.45
	D = float(site.drop)
	PL = H - T
	cs = corners(S)
	## the interior's mirror: which side the barracks stand on
	ms = 1.0 if rnd.next() < 0.5 else -1.0
	low_g = INF
	for u: float in [-H, 0.0, H]:
		for v: float in [-H, 0.0, H]:
			low_g = minf(low_g, _G(u, v))
	_walls()
	# the plaza floor
	var floor_n := roundi(PL * 1.33)
	var m := b._mark()
	_grid_floor(b.kit, PL, floor_n)
	var pf: Color = P.floor
	var moss: float = P.moss
	var mc := _moss
	faces(b, m, func(c: Vector3, _n: Vector3) -> Color:
		var k := 0.84 + _hash(floori((c.x + 40.0) / 1.43), floori((c.z + 40.0) / 1.43)) * 0.2
		# a worn path of paler stones from the gate to the flagstaff
		var path := 1.06 if absf(c.x) < 1.6 else 1.0
		var fc := pf
		if moss > 0.0 and _hash(floori((c.x + 40.0) / 1.43), 9.0) > 0.7:
			fc = fc.lerp(mc, moss * 0.35)
		return TownKit.shade(fc, k * path))
	# under the floor's edge, a skirt down into the ground so no gap shows where the walls meet it
	var lo: Color = P.lo
	prism(b, PackedVector2Array([Vector2(-PL, -D), Vector2(PL, -D), Vector2(PL, -0.02), Vector2(-PL, -0.02)]), -PL, PL, func(_c: Vector3, _n: Vector3) -> Color: return TownKit.shade(lo, 0.7), 40.0, 40.0)
	for j in cs.size():
		_tower(cs[j], j)
	var gate := _gate()
	var plaza := _plaza()
	var doors := _doors()
	var guns: Array[Dictionary] = []
	for g: Vector3 in S.guns:
		guns.append({"pos": _W(g.x, g.y, WH), "yaw": float(site.yaw) + g.z})
	var out := plaza
	out.merge(gate)
	out.style = S
	out.ms = ms
	out.mesh = b.commit_lod()
	out.tris = b.triangles()
	out.guns = guns
	out.doors = doors
	out.pieces = pieces
	out.blocks = blocks
	return out


func _grid_floor(k: MeshKit, half: float, n: int) -> void:
	var base := k.verts.size()
	for j in n + 1:
		for i in n + 1:
			k.add_vertex(Vector3(-half + 2.0 * half * i / n, 0.0, -half + 2.0 * half * j / n), Vector3.UP)
	# +x then +z walks clockwise seen from above: flip for counter-clockwise
	k.grid(base, n + 1, n + 1, true)


# ------------------------------------------------------------------ the curtain walls

func _walls() -> void:
	var span := H - float(S.R) if S.tower == "point" else H - 1.0
	var R: float = S.R
	var p_end: float
	if S.tower == "point":
		p_end = H - R
	elif S.tower == "square":
		p_end = H - 0.4 - R + 0.05
	elif float(S.rise) > 0.0:
		var cx: float = cs[0].x
		p_end = cx - sqrt(maxf(0.0, R * R - pow(cx - (H - PT * 0.5), 2.0))) + 0.15
	else:
		p_end = H - 2.6
	var wall := PackedVector2Array([Vector2(H - T, -D), Vector2(H + (TB + D) * 0.18, -D), Vector2(H, TB), Vector2(H, WH), Vector2(H - T, WH)])
	var guns: Array = S.guns
	for gi in guns.size():
		var g: Vector3 = guns[gi]
		var f := face_to_fort(side_of(g.z), along_of(g), H - PT * 0.5)
		_piece("gun%d" % gi, Vector3(f.x, WH + PH * 0.5, f.y))
	var ash := _ash
	var cap := _cap
	var capc: Color = P.cap
	for side in 4:
		var sx := side_xf(side)
		var gate := side == 2
		var spans: Array[Vector2] = []
		spans.assign([Vector2(-span, -GATE_W * 0.5), Vector2(GATE_W * 0.5, span)] if gate else [Vector2(-span, span)])
		for sp in spans:
			prism(b, wall, sp.x, sp.y, ash, 1.3, 0.62, Transform3D.IDENTITY, sx)
		if gate:
			# the lintel over the gate, and its passage floor
			prism(b, PackedVector2Array([Vector2(H - T, GATE_H), Vector2(H + 0.02, GATE_H), Vector2(H + 0.02, WH), Vector2(H - T, WH)]), -GATE_W * 0.5, GATE_W * 0.5, func(c: Vector3, n: Vector3) -> Color: return ashlar(c, n, -9.0), 1.3, 0.62, Transform3D.IDENTITY, sx)
			var pf: Color = P.floor
			prism(b, PackedVector2Array([Vector2(H - T - 0.02, -D), Vector2(H + 0.3, -D), Vector2(H + 0.3, 0.0), Vector2(H - T - 0.02, 0.0)]), -GATE_W * 0.5, GATE_W * 0.5, func(c: Vector3, _n: Vector3) -> Color: return TownKit.shade(pf, 0.88 + _hash(floori(c.x / 0.9), floori(c.z / 0.9)) * 0.14), 1.3, 0.62, Transform3D.IDENTITY, sx)
		# the cordon: a rounded stone rod right round the walls where the batter ends
		var rods: Array[Vector2] = []
		rods.assign([Vector2(-span, -GATE_W * 0.5 - 0.55), Vector2(GATE_W * 0.5 + 0.55, span)] if gate else [Vector2(-span, span)])
		for rd in rods:
			b.beam(sx * Vector3(rd.x, TB, H + 0.03), sx * Vector3(rd.y, TB, H + 0.03), 0.17, capc, TownKit.WOOD, 8)
		# the guns on this face, along it (in the face's own frame)
		var xs: Array[Vector2] = []
		for gi in guns.size():
			var g: Vector3 = guns[gi]
			if side_of(g.z) == side:
				xs.append(Vector2(along_of(g), gi))
		xs.sort_custom(func(p: Vector2, q: Vector2) -> bool: return p.x < q.x)
		# the parapet, broken by an embrasure at each gun; the stretch either side of a gun is that gun's to lose
		var runs: Array[Vector2] = []
		var at := -p_end
		for g in xs:
			runs.append(Vector2(at, g.x - 0.62))
			at = g.x + 0.62
		runs.append(Vector2(at, p_end))
		for r in runs:
			if r.y - r.x < 0.3:
				continue
			var marks := PackedFloat32Array([r.x, r.y])
			for g in xs:
				for e: float in [g.x - BAND, g.x + BAND]:
					if e > r.x + 0.05 and e < r.y - 0.05:
						marks.append(e)
			marks.sort()
			for i in marks.size() - 1:
				var mid := (marks[i] + marks[i + 1]) * 0.5
				var into := b
				for g in xs:
					if absf(g.x - mid) < BAND:
						into = _piece_of("gun%d" % int(g.y)).intact
						break
				_parapet_run(into, marks[i], marks[i + 1], sx)
		for g in xs:
			var pc := _piece_of("gun%d" % int(g.y))
			# sills under the embrasures, splayed so the guns can traverse
			var sill := TownKit.shade(capc, 0.86)
			box(pc.intact, 1.3, 0.45, PT, _move(Vector3(g.x, WH + 0.22, H - PT * 0.5)), func(_c: Vector3, _n: Vector3) -> Color: return sill, 0.12, sx)
			_wreck_parapet(pc, side, g.x)
		# a waterspout (gárgola) or two down the face, each with its stain
		var lo: Color = P.lo
		var stone: Color = P.stone
		var stain_c: Color = stone.lerp(_moss if float(P.moss) > 0.0 else P.damp, 0.45)
		var wh := WH
		var spouts: Array[float] = []
		spouts.assign([-span * 0.62, span * 0.62] if side == 2 else [-span * 0.68, 0.3, span * 0.68])
		for gx in spouts:
			var clash := false
			for g in xs:
				if absf(g.x - gx) < 1.2:
					clash = true
			if clash:
				continue
			box(b, 0.28, 0.24, 0.9, _move(Vector3(gx, WH - 0.15, H + 0.35)), func(_c: Vector3, _n: Vector3) -> Color: return TownKit.shade(lo, 0.9), 0.0, sx)
			# its stain: a strip down the face, three bands darkening toward the spout
			var hgt := WH - TB - 0.4
			var y0 := (WH + TB) * 0.5 - 0.2 - hgt * 0.5
			for band in 3:
				var ya := y0 + hgt * band / 3.0
				var yb := y0 + hgt * (band + 1) / 3.0
				var col := _store(TownKit.shade(stain_c, 0.7 + clampf((wh - (ya + yb) * 0.5) / wh, 0.0, 1.0) * 0.25))
				_tri(b.kit, Vector3(gx - 0.25, ya, H + 0.025), Vector3(gx + 0.25, ya, H + 0.025), Vector3(gx + 0.25, yb, H + 0.025), Vector3.BACK, col, sx)
				_tri(b.kit, Vector3(gx - 0.25, ya, H + 0.025), Vector3(gx + 0.25, yb, H + 0.025), Vector3(gx - 0.25, yb, H + 0.025), Vector3.BACK, col, sx)


## A run of parapet along a face (face frame), as rounded merlons or crenellations.
func _parapet_run(into: TownKit, x0: float, x1: float, sx: Transform3D) -> void:
	var cap := _cap
	if S.parapet == "round":
		box(into, x1 - x0, PH, PT, _move(Vector3((x0 + x1) * 0.5, WH + PH * 0.5, H - PT * 0.5)), cap, 0.22, sx)
		return
	# a breastwork, and square merlons standing on it
	var base := PH * 0.45
	box(into, x1 - x0, base, PT, _move(Vector3((x0 + x1) * 0.5, WH + base * 0.5, H - PT * 0.5)), cap, 0.0, sx)
	var L := x1 - x0
	var n := maxi(1, roundi((L + 0.55) / 1.55))
	var mw := minf(1.0, (L - (n - 1) * 0.55) / n)
	var gap := (L - n * mw) / (n - 1) if n > 1 else 0.0
	for i in n:
		var cx := x0 + mw * 0.5 + i * (mw + gap) if n > 1 else (x0 + x1) * 0.5
		var h := PH + 0.3 - base
		box(into, mw, h, PT * 0.92, _move(Vector3(cx, WH + base + h * 0.5, H - PT * 0.5)), cap, 0.0, sx)


## A gun's stretch of parapet smashed (face `side`, gun at `u`): stumps,
## blocks on the rampart, a talus at the foot, the face blackened; and the
## timber mantlets its new owners put up.
func _wreck_parapet(pc: Dictionary, side: int, u: float) -> void:
	var B: TownKit = pc.broken
	var sx := side_xf(side)
	for sgn: float in [-1.0, 1.0]:
		var x := u + sgn * 0.7
		while absf(x - u) < BAND - 0.2:
			var w := 0.45 + rnd.next() * 0.5
			var h := PH * (0.12 + rnd.next() * 0.45)
			var d := PT * (0.7 + rnd.next() * 0.3)
			var ry := (rnd.next() - 0.5) * 0.3
			var rz := (rnd.next() - 0.5) * 0.25
			var local := Transform3D(Basis(Vector3.BACK, rz) * Basis(Vector3.UP, ry), Vector3(x + sgn * w * 0.5, WH + h * 0.5, H - PT * 0.5 + (rnd.next() - 0.5) * 0.15))
			var hot := 0.6 + rnd.next() * 0.3
			box(B, w, h, d, local, func(c: Vector3, _n: Vector3) -> Color: return scorched(cap_stone(c, Vector3.BACK), hot - absf(c.x - u) * 0.12), 0.0, sx)
			x += sgn * (w + 0.12 + rnd.next() * 0.3)
	# blocks tumbled in onto the rampart
	var capc: Color = P.cap
	for i in 4:
		var sz := 0.2 + rnd.next() * 0.22
		var at := Vector3(u + (rnd.next() - 0.5) * 3.4, WH + sz * 0.4, H - PT - 0.5 - rnd.next() * 1.2)
		var sy := 0.7 + rnd.next() * 0.25
		var ry := rnd.next() * 3.0
		var rx := (rnd.next() - 0.5) * 0.6
		var col := scorched(TownKit.shade(capc, 0.8 + rnd.next() * 0.25), rnd.next() * 0.5)
		dodeca(B.kit, sx * Transform3D(Basis(Vector3.RIGHT, rx) * Basis(Vector3.UP, ry) * Basis.from_scale(Vector3(1.25, sy, 1.0) * sz), at), _store(col))
	# the face under it blackened by the blast (it rides with the wreck, so it shows only once the parapet's gone)
	var cy := WH - 0.55
	var ring := PackedVector3Array()
	for i in 10:
		var a := TAU * i / 10.0
		ring.append(Vector3(u + cos(a) * 1.5 * (0.8 + rnd.next() * 0.5), cy + sin(a) * 1.5 * 0.9 * (0.7 + rnd.next() * 0.4), H + 0.03))
	var stone: Color = P.stone
	var mid := Vector3(u, cy, H + 0.03)
	var k := B.kit
	var n := sx.basis * Vector3.BACK
	var base := k.verts.size()
	k.add_vertex(sx * mid, n)
	for p in ring:
		k.add_vertex(sx * p, n)
	k.colors[base] = _store(scorched(stone, 1.0))
	for i in ring.size():
		var p := ring[i]
		k.colors[base + 1 + i] = _store(scorched(stone, 1.0 - Vector2(p.x - u, (p.y - cy) * 1.1).length() / 1.6))
	for i in ring.size():
		k.tri(base, base + 1 + i, base + 1 + (i + 1) % ring.size())
	# and what fell outward lies at the foot of the wall
	var l := face_to_fort(side, u, H + 1.6)
	var o := face_to_fort(side, 0.0, 1.0)
	_talus(B, l.x, l.y, 2.2, 7, atan2(o.y, o.x), 0.3)
	# the patch: gabions either side of the gap and a plank mantlet over the stumps
	var Pp: TownKit = pc.patch
	var wick := _wicker
	var tim := _timber
	var wh := WH
	for sgn: float in [-1.0, 1.0]:
		var gx := u + sgn * 1.15
		var m := Pp._mark()
		_open_cyl(Pp.kit, 0.42, 0.95, 9, 3, sx * Vector3(gx, WH, H - PT * 0.5), true)
		faces(Pp, m, func(c: Vector3, _n: Vector3) -> Color: return TownKit.shade(wick, 0.8 + 0.25 * float(posmod(floori((c.y - wh) / 0.16), 2))), true)
		for i in 4:
			var px := u + sgn * (1.75 + i * 0.26)
			var shade := 0.85 + rnd.next() * 0.3
			var rz := (rnd.next() - 0.5) * 0.06
			box(Pp, 0.22, PH + 0.1, 0.07, Transform3D(Basis(Vector3.BACK, rz), Vector3(px, WH + (PH + 0.1) * 0.5, H - PT * 0.25)), func(_c: Vector3, _n: Vector3) -> Color: return TownKit.shade(tim, shade), 0.0, sx)
		box(Pp, 1.2, 0.1, 0.09, _move(Vector3(u + sgn * 2.15, WH + PH * 0.7, H - PT * 0.25 - 0.08)), func(_c: Vector3, _n: Vector3) -> Color: return TownKit.shade(tim, 0.7), 0.0, sx)


## An upright cylinder of `seg` sides and `rings` bands, its foot at `foot`
## (capped top and bottom if `caps`), smooth-sided.
static func _open_cyl(k: MeshKit, r: float, h: float, seg: int, rings: int, foot: Vector3, caps: bool, a0 := 0.0, alen := TAU) -> void:
	var base := k.verts.size()
	var full := alen >= TAU - 1e-5
	for j in rings + 1:
		for i in seg + 1:
			var a := a0 + alen * (i % seg if full else i) / seg
			var d := Vector3(sin(a), 0.0, cos(a))
			k.add_vertex(foot + d * r + Vector3(0.0, h * j / rings, 0.0), d)
	k.grid(base, rings + 1, seg + 1, false)
	if caps:
		for e in 2:
			var y := foot.y + (h if e == 1 else 0.0)
			var n := Vector3.UP if e == 1 else Vector3.DOWN
			var c := k.add_vertex(Vector3(foot.x, y, foot.z), n)
			for i in seg + 1:
				var a := a0 + alen * i / seg
				k.add_vertex(Vector3(foot.x + sin(a) * r, y, foot.z + cos(a) * r), n)
			for i in seg:
				if e == 1:
					k.tri(c, c + 1 + i, c + 2 + i)
				else:
					k.tri(c, c + 2 + i, c + 1 + i)


# ------------------------------------------------------------------ the corner works

func _tower(c: Dictionary, j: int) -> void:
	var cx: float = c.x
	var cz: float = c.z
	var top: float = c.top
	var poly: PackedVector2Array = c.poly
	var pc := _piece("tower%d" % j, Vector3(cx, top + PH, cz))
	# its own foot may run deeper than the curtain's, out over the slope
	var dt := D
	var probe := poly if not poly.is_empty() else PackedVector2Array([Vector2(cx + float(c.r), cz), Vector2(cx - float(c.r), cz), Vector2(cx, cz + float(c.r)), Vector2(cx, cz - float(c.r))])
	for p in probe:
		dt = maxf(dt, -_G(p.x, p.y) + 2.0)
	var ga: float = c.out
	var out_x := cos(ga)
	var out_z := sin(ga)
	var capc: Color = P.cap
	var cap := _cap
	var roofc: Color = P.roof
	var lg := low_g
	if poly.is_empty():
		var R: float = c.r
		var prof := PackedVector2Array([Vector2(0.0, -dt), Vector2(R + (TB + dt) * 0.18, -dt), Vector2(R, TB), Vector2(R, top), Vector2(0.0, top + 0.02)])
		lathe(b, densify(prof), 22, Vector3(cx, 0.0, cz), func(p: Vector3, n: Vector3) -> Color:
			if p.y > top - 0.01:
				return cap_stone(p, n, 0.92)
			# unrolled round the drum, so the courses and joints run on
			return ashlar(Vector3(atan2(p.z - cz, p.x - cx) * R, p.y, 0.0), Vector3.BACK, lg + 1.5))
		b.torus(R + 0.03, 0.17, 6, 26, Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(cx, TB, cz)), capc)
		if float(S.rise) > 0.0:
			b.torus(R + 0.05, 0.14, 6, 26, Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(cx, top - 0.12, cz)), capc)
		# its parapet: a rounded ring, or a low breastwork with merlons (under a cone roof, just the breastwork)
		if S.parapet == "round":
			var ring := PackedVector2Array([Vector2(R + 0.06, top), Vector2(R + 0.06, top + PH - 0.2), Vector2(R - 0.14, top + PH), Vector2(R - PT + 0.1, top + PH), Vector2(R - PT, top + PH - 0.2), Vector2(R - PT, top + 0.02)])
			var m := pc.intact._mark() as Vector2i
			pc.intact.kit.lathe(_move(Vector3(cx, 0.0, cz)), ring, 22)
			faces(pc.intact, m, func(p: Vector3, n: Vector3) -> Color: return cap_stone(p, n, 0.9 + _hash(floori(atan2(p.z - cz, p.x - cx) * 4.0), 3.0) * 0.12), false)
		else:
			var base := 0.6 if S.roof == "cone" else PH * 0.45
			var m := pc.intact._mark() as Vector2i
			pc.intact.kit.lathe(_move(Vector3(cx, 0.0, cz)), PackedVector2Array([Vector2(R + 0.05, top), Vector2(R + 0.05, top + base), Vector2(R - PT, top + base), Vector2(R - PT, top + 0.02)]), 22)
			faces(pc.intact, m, cap, false)
			if S.roof != "cone":
				var n := roundi(TAU * R / 1.55)
				for i in n:
					var a := TAU * i / n + ga
					var h := PH + 0.3 - base
					box(pc.intact, 0.95, h, PT * 0.9, Transform3D(Basis(Vector3.UP, -a + PI * 0.5), Vector3(cx + cos(a) * (R - PT * 0.5), top + base + h * 0.5, cz + sin(a) * (R - PT * 0.5))), cap)
		if S.roof == "cone":
			var e := top + 0.55
			lathe(pc.intact, PackedVector2Array([Vector2(R + 0.5, e), Vector2(R + 0.38, e + 0.22), Vector2(0.14, e + 4.3), Vector2(0.0, e + 4.4)]), 18, Vector3(cx, 0.0, cz), func(p: Vector3, _n: Vector3) -> Color:
				return TownKit.shade(roofc, 0.82 + 0.16 * float(posmod(floori((p.y - e) / 0.42), 2)) + _hash(floori(atan2(p.z - cz, p.x - cx) * 5.0), floori(p.y * 2.0)) * 0.08), true)
			pc.intact.cyl(0.03, 0.06, 1.1, Vector3(cx, e + 4.9, cz), _iron, 5)
			pc.intact.ball(0.13, Vector3(cx, e + 4.55, cz), _iron)
			# burnt through: a few charred rafters standing out of the drum
			for i in 6:
				if rnd.next() < 0.25:
					continue
				var a := TAU * i / 6.0 + rnd.next() * 0.4
				var foot := Vector3(cx + cos(a) * (R - 0.4), e - 0.2, cz + sin(a) * (R - 0.4))
				var t := 0.35 + rnd.next() * 0.4
				_rafter(pc.broken, foot, Vector3(cx + cos(a) * (R - 0.4) * (1.0 - t), e - 0.2 + 4.2 * t, cz + sin(a) * (R - 0.4) * (1.0 - t)), 0.09)
		# the garita: a little round sentry box, corbelled out over the corner on its cone
		if S.garita:
			_garita(pc, cx + out_x * (R - 0.55), top + PH - 0.25, cz + out_z * (R - 0.55), ga)
		# the ring smashed to jagged stumps, blocks on the tower's top and at its foot
		var ns := 12
		for i in ns:
			if rnd.next() < 0.3:
				continue
			var a := TAU * i / ns + rnd.next() * 0.2
			var h := PH * (0.1 + rnd.next() * 0.55)
			var w := TAU * R / ns - 0.15
			var rz := (rnd.next() - 0.5) * 0.3
			var hot := 0.35 + rnd.next() * 0.4
			box(pc.broken, w, h, PT * 0.85, Transform3D(Basis(Vector3.UP, -a + PI * 0.5) * Basis(Vector3.BACK, rz), Vector3(cx + cos(a) * (R - PT * 0.5), top + h * 0.5, cz + sin(a) * (R - PT * 0.5))), func(p: Vector3, n: Vector3) -> Color: return scorched(cap_stone(p, n), hot))
		for i in 4:
			var a := rnd.next() * TAU
			var r := rnd.next() * (R - 1.2)
			var sz := 0.2 + rnd.next() * 0.25
			rock(pc.broken, sz, Vector3(cx + cos(a) * r, top + sz * 0.4, cz + sin(a) * r), scorched(TownKit.shade(capc, 0.85), rnd.next() * 0.6))
		_talus(pc.broken, cx + out_x * (R + 1.6), cz + out_z * (R + 1.6), 2.4, 7, ga, 0.35)
		_block(cx, cz, R + 0.5)
		return
	# square towers and arrowhead bastions: a coursed pile on their plan
	pile(b, poly, -dt, top, TB, _ash, func(p: Vector3, n: Vector3) -> Color: return cap_stone(p, n, 0.92))
	# cordon rods round its outer faces
	var all := _edges(poly, cx, cz)
	var outer: Array[Dictionary] = []
	for e in all:
		if e.outer:
			outer.append(e)
	for e in outer:
		var a2 := Vector3(e.ax + e.nx * 0.03, TB, e.az + e.nz * 0.03)
		b.beam(a2, a2 + Vector3(e.dx, 0.0, e.dz), 0.17, capc, TownKit.WOOD, 8)
		if float(S.rise) > 0.0:
			box(b, e.L + 0.3, 0.22, 0.26, Transform3D(Basis(Vector3.UP, -atan2(e.dz, e.dx)), Vector3(e.mx + e.nx * 0.08, top - 0.11, e.mz + e.nz * 0.08)), func(_c: Vector3, _n: Vector3) -> Color: return capc)
	# its parapet along the outer faces (all four on a tower that stands clear of the rampart)
	var run := all if S.tower == "square" else outer
	for e in run:
		var yaw := -atan2(e.dz, e.dx)
		var along := func(t: float, inset: float, y: float) -> Transform3D:
			return Transform3D(Basis(Vector3.UP, yaw), Vector3(e.ax + e.dx * t - e.nx * inset, y, e.az + e.dz * t - e.nz * inset))
		if S.parapet == "round":
			box(pc.intact, e.L, PH, PT, along.call(0.5, PT * 0.5, top + PH * 0.5) * Transform3D(Basis(Vector3.UP, PI), Vector3.ZERO), cap, 0.22)
		else:
			var base := PH * 0.45
			box(pc.intact, e.L, base, PT, along.call(0.5, PT * 0.5, top + base * 0.5), cap)
			# (under a roof, just the breastwork: the eaves come down over it)
			var n := maxi(2, roundi((e.L + 0.55) / 1.55)) if S.roof == "none" else 0
			if n > 0:
				var mw := minf(1.0, (e.L - (n - 1) * 0.55) / n)
				var gap: float = (e.L - n * mw) / (n - 1) if n > 1 else 0.0
				for i in n:
					var t: float = (mw * 0.5 + i * (mw + gap)) / e.L
					var h := PH + 0.3 - base
					box(pc.intact, mw, h, PT * 0.92, along.call(t, PT * 0.5, top + base + h * 0.5), cap)
		# the wreck: stumps along it
		var t2 := 0.08
		while t2 < 0.95:
			if rnd.next() >= 0.3:
				var h := PH * (0.1 + rnd.next() * 0.5)
				var w := 0.5 + rnd.next() * 0.5
				var rz := (rnd.next() - 0.5) * 0.3
				var hot := 0.3 + rnd.next() * 0.45
				box(pc.broken, w, h, PT * 0.85, along.call(t2, PT * 0.5, top + h * 0.5) * Transform3D(Basis(Vector3.BACK, rz), Vector3.ZERO), func(p: Vector3, nn: Vector3) -> Color: return scorched(cap_stone(p, nn), hot))
			t2 += 0.16 + rnd.next() * 0.12
	if S.roof == "pyramid":
		var R: float = S.R
		var e := top + PH * 0.45 + 0.05
		var m := pc.intact._mark() as Vector2i
		_pyramid(pc.intact.kit, (R + 0.55) * sqrt(2.0), 4.2, 3, Vector3(cx, e, cz))
		faces(pc.intact, m, func(p: Vector3, _n: Vector3) -> Color: return TownKit.shade(roofc, 0.82 + 0.16 * float(posmod(floori((p.y - e) / 0.4), 2)) + _hash(floori(p.x * 2.0), floori(p.z * 2.0)) * 0.06), true)
		pc.intact.cyl(0.03, 0.06, 1.2, Vector3(cx, e + 4.7, cz), _iron, 5)
		pc.intact.ball(0.14, Vector3(cx, e + 4.3, cz), _iron)
		# its eaves on a timber plate over the merlons
		for dd: Vector2 in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
			var foot := Vector3(cx + dd.x * (R - 0.3), e - 0.1, cz + dd.y * (R - 0.3))
			var t := 0.3 + rnd.next() * 0.45
			_rafter(pc.broken, foot, Vector3(cx + dd.x * (R - 0.3) * (1.0 - t), e - 0.1 + 4.1 * t, cz + dd.y * (R - 0.3) * (1.0 - t)), 0.1)
		_rafter(pc.broken, Vector3(cx - (R - 0.4), e - 0.05, cz + (rnd.next() - 0.5)), Vector3(cx + (R - 0.6) * 0.4, e + 0.6, cz + (rnd.next() - 0.5)), 0.08)
	if S.garita and S.tower == "point":
		# the bastion's point: a sentry box hung off its salient
		var tip := poly[3]
		_garita(pc, tip.x - out_x * 0.55 * sqrt(2.0), top + PH - 0.25, tip.y - out_z * 0.55 * sqrt(2.0), ga)
	for i in 4:
		var sz := 0.2 + rnd.next() * 0.25
		var x := cx + (rnd.next() - 0.5) * float(c.r) * 0.9
		var z := cz + (rnd.next() - 0.5) * float(c.r) * 0.9
		rock(pc.broken, sz, Vector3(x, top + sz * 0.4, z), scorched(TownKit.shade(capc, 0.85), rnd.next() * 0.6))
	var far := poly[0]
	for p in poly:
		if p.x * out_x + p.y * out_z > far.x * out_x + far.y * out_z:
			far = p
	_talus(pc.broken, far.x + out_x * 1.4, far.y + out_z * 1.4, 2.6, 8, ga, 0.35)
	# walls for the walkers: its outline
	for e in all:
		var n := maxi(1, roundi(e.L / 1.3))
		for i in n + 1:
			_block(e.ax + e.dx * i / n - e.nx * 0.7, e.az + e.dz * i / n - e.nz * 0.7, 1.0)
	_block(cx, cz, minf(float(c.r), 3.2))


## A plan's edges, each with its outward normal and whether it faces out past the walls.
func _edges(plan: PackedVector2Array, cx: float, cz: float) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var N := plan.size()
	for i in N:
		var a := plan[i]
		var c := plan[(i + 1) % N]
		var n := edge_out(a, c, cx, cz)
		var mx := (a.x + c.x) * 0.5
		var mz := (a.y + c.y) * 0.5
		# an edge that only faces the plaza or the rampart is buried in them
		var outer := maxf(absf(mx + n.x * 0.5), absf(mz + n.y * 0.5)) > H
		out.append({"ax": a.x, "az": a.y, "dx": c.x - a.x, "dz": c.y - a.y, "L": a.distance_to(c), "mx": mx, "mz": mz, "nx": n.x, "nz": n.y, "outer": outer})
	return out


## A four-sided roof (three.js ConeGeometry(r, h, 4, rings) turned 45°): its
## eaves at `foot`, in `rings` bands for the courses of slates.
static func _pyramid(k: MeshKit, r: float, h: float, rings: int, foot: Vector3) -> void:
	var tip := foot + Vector3(0.0, h, 0.0)
	for i in 4:
		var a0 := PI * 0.25 + TAU * i / 4.0
		var a1 := PI * 0.25 + TAU * (i + 1) / 4.0
		var p0 := foot + Vector3(sin(a0), 0.0, cos(a0)) * r
		var p1 := foot + Vector3(sin(a1), 0.0, cos(a1)) * r
		var out := (p0 + p1) * 0.5 - foot
		out.y = r * r / h * 0.5
		for j in rings:
			var t0 := float(j) / rings
			var t1 := float(j + 1) / rings
			var q0 := p0.lerp(tip, t0)
			var q1 := p1.lerp(tip, t0)
			var q2 := p1.lerp(tip, t1)
			var q3 := p0.lerp(tip, t1)
			_tri(k, q0, q1, q2, out, Color.WHITE, Transform3D.IDENTITY)
			if j < rings - 1:
				_tri(k, q0, q2, q3, out, Color.WHITE, Transform3D.IDENTITY)


func _garita(pc: Dictionary, gx: float, gy: float, gz: float, ga: float) -> void:
	var capc: Color = P.cap
	var wash: Color = P.wash
	lathe(b, PackedVector2Array([Vector2(0.05, -1.3), Vector2(0.32, -1.0), Vector2(0.62, -0.42), Vector2(0.82, 0.0)]), 14, Vector3(gx, gy, gz), func(c: Vector3, _n: Vector3) -> Color: return TownKit.shade(capc, 0.86 + floorf((c.y - gy) * -3.0) * 0.04))
	var I: TownKit = pc.intact
	var m := I._mark()
	_open_cyl(I.kit, 0.74, 1.85, 14, 1, Vector3(gx, gy, gz), false)
	var slit := TownKit.lin("#2a2420")
	faces(I, m, func(c: Vector3, _n: Vector3) -> Color:
		# a dark slit window looking out to each side
		var a := atan2(c.z - gz, c.x - gx)
		if c.y > gy + 0.7 and c.y < gy + 1.4:
			for w: float in [ga, ga + 1.4, ga - 1.4]:
				if absf(atan2(sin(a - w), cos(a - w))) < 0.18:
					return slit
		return TownKit.shade(wash, 0.95), false)
	I.cyl(0.86, 0.86, 0.14, Vector3(gx, gy + 1.9, gz), capc, 14)
	m = I._mark()
	I.kit.sphere(_move(Vector3(gx, gy + 1.96, gz)), 0.8, 14, 6, 0.0, TAU, 0.0, PI * 0.5)
	faces(I, m, func(c: Vector3, _n: Vector3) -> Color: return TownKit.shade(capc, 0.94 + (c.y - gy - 1.96) * 0.06), false)
	I.ball(0.14, Vector3(gx, gy + 2.86, gz), capc)
	I.cyl(0.05, 0.08, 0.2, Vector3(gx, gy + 2.72, gz), capc, 6)
	# knocked off: a stub of its wall on the corbel, the rest gone over the side
	m = pc.broken._mark()
	_open_cyl(pc.broken.kit, 0.74, 0.5, 14, 1, Vector3(gx, gy, gz), false, ga - 2.2, 3.6)
	faces(pc.broken, m, func(c: Vector3, _n: Vector3) -> Color: return scorched(wash, 0.3 + (c.y - gy) * 0.6), false)
	_talus(pc.broken, gx + cos(ga) * 3.5, gz + sin(ga) * 3.5, 1.6, 4, ga, 0.1)


# ------------------------------------------------------------------ the gate

## The gate's arched frame, its arms and lanterns, the hoarding over it and
## the ramp down to the ground. {ramp_len, ramp_foot_y}.
func _gate() -> Dictionary:
	var gz0 := -H
	var capc: Color = P.cap
	var gold := TownKit.lin("#d8a640")
	# the arch: half a ring round the top of the opening
	b.torus(GATE_W * 0.5 + 0.2, 0.22, 6, 16, Transform3D(Basis(Vector3.UP, PI), Vector3(0.0, GATE_H - GATE_W * 0.5 - 0.2, gz0 - 0.08)), capc, TownKit.WOOD, PI)
	for sx: float in [-1.0, 1.0]:
		b.box(0.5, GATE_H - GATE_W * 0.5 - 0.2, 0.32, Vector3(sx * (GATE_W * 0.5 + 0.2), (GATE_H - GATE_W * 0.5 - 0.2) * 0.5, gz0 - 0.08), capc, 0.06)
	b.box(1.25, 1.45, 0.28, Vector3(0.0, GATE_H + 0.95, gz0 - 0.12), TownKit.shade(capc, 1.04), 0.14)
	b.box(0.72, 0.8, 0.12, Vector3(0.0, GATE_H + 0.98, gz0 - 0.3), gold, 0.08, TownKit.GILT)
	b.ball(0.15, Vector3(0.0, GATE_H + 1.85, gz0 - 0.15), gold, TownKit.GILT)
	# a lantern on a bracket either side, lit through the night
	for sx: float in [-1.0, 1.0]:
		var lx := sx * (GATE_W * 0.5 + 1.0)
		b.box(0.08, 0.08, 0.5, Vector3(lx, GATE_H + 0.1, gz0 - 0.25), _iron, 0.0, TownKit.IRON)
		b.cyl(0.16, 0.12, 0.34, Vector3(lx, GATE_H - 0.18, gz0 - 0.48), _iron, 6, TownKit.IRON)
		b.ball(0.11, Vector3(lx, GATE_H - 0.2, gz0 - 0.48), Color(2.4, 1.3, 0.45), TownKit.GLOW)
		b.cone(0.2, 0.18, Vector3(lx, GATE_H + 0.07, gz0 - 0.48), _iron, 6, TownKit.IRON)
	if S.hoarding:
		# a timber gallery hung out over the gate on beams, for dropping things on the unwelcome
		var y0 := WH - 0.2
		var tim := _timber
		var dark := TownKit.lin("#3e2a1a")
		for x: float in [-2.5, -1.25, 0.0, 1.25, 2.5]:
			b.box(0.2, 0.2, 2.4, Vector3(x, y0, gz0 - 0.2), dark)
		b.box(5.6, 0.1, 1.3, Vector3(0.0, y0 + 0.15, gz0 - 0.75), func(p: Vector3) -> Color: return TownKit.shade(tim, 0.8 + 0.2 * float(posmod(floori((p.x + 9.0) / 0.3), 2))))
		var ph := PH
		b.box(5.6, PH + 0.5, 0.12, Vector3(0.0, y0 + 0.2 + (PH + 0.5) * 0.5, gz0 - 1.38), func(p: Vector3) -> Color:
			var slot := absf(fmod(p.x, 1.1)) < 0.12 and p.y > y0 + 0.9
			return TownKit.shade(tim, (0.25 if slot else 0.82) + 0.12 * float(posmod(floori((p.x + 9.0) / 0.28), 2))))
		for x: float in [-2.75, 2.75]:
			b.box(0.12, ph + 0.5, 1.3, Vector3(x, y0 + 0.2 + (ph + 0.5) * 0.5, gz0 - 0.75), TownKit.shade(tim, 0.75))
		var roofc: Color = P.roof
		b.gable(1.7, 0.7, 6.0, Vector3(0.0, y0 + PH + 0.7, gz0 - 0.7), func(p: Vector3) -> Color: return TownKit.shade(roofc, 0.85 + 0.15 * float(posmod(floori((p.x + 20.0) / 0.35), 2))), true)
	# the ramp: from the gate down to the ground behind the fort, with low kerbs
	var ramp_len := 3.0
	var foot := 0.0
	for it in 3:
		foot = _G(0.0, gz0 - ramp_len)
		ramp_len = clampf(-foot * 2.1 + 1.5, 2.5, 10.0)
	foot = _G(0.0, gz0 - ramp_len)
	var ramp := func(lift: float) -> PackedVector2Array:
		return PackedVector2Array([Vector2(gz0 + 0.3, lift), Vector2(gz0 + 0.3, -D), Vector2(gz0 - ramp_len - 0.4, minf(-D, foot - 1.0)), Vector2(gz0 - ramp_len - 0.4, foot + lift * 0.3 - 0.05)])
	var pf: Color = P.floor
	var lo: Color = P.lo
	prism(b, ramp.call(0.0), -GATE_W * 0.5 - 0.25, GATE_W * 0.5 + 0.25, func(c: Vector3, n: Vector3) -> Color:
		return TownKit.shade(pf, 0.86 + _hash(floori(c.z / 0.7), 3.0) * 0.14) if n.y > 0.5 else TownKit.shade(lo, 0.85), 0.8, 0.7)
	for sx: float in [-1.0, 1.0]:
		var x0 := sx * (GATE_W * 0.5 + 0.25)
		var x1 := sx * (GATE_W * 0.5 + 0.7)
		var ft := foot
		prism(b, ramp.call(0.55), minf(x0, x1), maxf(x0, x1), func(c: Vector3, n: Vector3) -> Color: return ashlar(c, n, ft))
		# the kerbs are walls
		var t := 0.15
		while t <= 1.0:
			_block(sx * (GATE_W * 0.5 + 0.48), gz0 - ramp_len * t, 0.42)
			t += 0.28
	return {"ramp_len": ramp_len, "ramp_foot_y": foot + float(site.y)}


## The two door leaves, each in its own frame hinged at the jamb (x 0), its
## leaf reaching in toward the middle: [{mesh, x, side}].
func _doors() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var wood := TownKit.lin("#5c3a22")
	for sx: float in [-1.0, 1.0]:
		var leaf := TownKit.new(29)
		var w := GATE_W * 0.5 - 0.04
		leaf.box(w, GATE_H - 0.1, 0.16, Vector3(-sx * w * 0.5, (GATE_H - 0.1) * 0.5, 0.0), func(p: Vector3) -> Color: return TownKit.shade(wood, 0.85 + 0.15 * float(posmod(floori((p.x + 9.0) / 0.27), 2))))
		for y: float in [0.6, 1.6, 2.6]:
			leaf.box(w * 0.94, 0.12, 0.2, Vector3(-sx * w * 0.5, y, 0.0), _iron, 0.0, TownKit.IRON)
		for i in 4:
			leaf.ball(0.045, Vector3(-sx * (0.25 + i * 0.36), 2.1, -0.11), _iron, TownKit.IRON)
		out.append({"mesh": leaf.commit(), "x": sx * GATE_W * 0.5, "side": sx})
	return out


# ------------------------------------------------------------------ the plaza

## Barracks, the magazine (or chapel, or keep), stairs to the rampart, the
## brazier, benches and the flagstaff; and where the garrison stands about.
func _plaza() -> Dictionary:
	var yaw := float(site.yaw)
	var lo: Color = P.lo
	var wash: Color = P.wash
	var tile: Color = P.tile
	var capc: Color = P.cap
	var stone: Color = P.stone
	var door := TownKit.lin("#6b4226")
	# barracks against one wall, whitewashed under tiles
	var bx := -ms * (PL - 1.8)
	var bl := minf(9.2, 2.0 * PL - 5.6)
	var bz := -1.2
	b.box(3.6, 2.8, bl, Vector3(bx, 1.4, bz), func(p: Vector3) -> Color: return TownKit.shade(lo, 0.9) if p.y < 0.35 else wash, 0.08)
	var roof := _piece("roof", Vector3(bx, 3.6, bz))
	(roof.intact as TownKit).gable(4.4, 1.5, bl + 0.7, Vector3(bx, 2.8, bz), func(p: Vector3) -> Color: return TownKit.shade(tile, 0.86 + 0.14 * float(posmod(floori((p.z + 20.0) / 0.32), 2))), false)
	# burnt out: blackened rafters and the ridge pole sagging, a scrap of tiles at either end
	var z := bz - bl * 0.5 + 0.3
	while z <= bz + bl * 0.5 - 0.2:
		for sx: float in [-1.0, 1.0]:
			if rnd.next() < 0.3:
				continue
			var t := 0.55 + rnd.next() * 0.45
			_rafter(roof.broken, Vector3(bx + sx * 2.0, 2.82, z), Vector3(bx + sx * 2.0 * (1.0 - t), 2.82 + 1.45 * t, z + (rnd.next() - 0.5) * 0.2), 0.07)
		z += 1.1
	_rafter(roof.broken, Vector3(bx, 4.2, bz - bl * 0.5 + 0.2), Vector3(bx + 0.1, 3.4, bz + 0.4), 0.09)
	_rafter(roof.broken, Vector3(bx - 0.1, 3.1, bz + 1.6), Vector3(bx, 4.15, bz + bl * 0.5 - 0.2), 0.09)
	var t1 := scorched(TownKit.shade(tile, 0.86), 0.5 + rnd.next() * 0.3)
	(roof.broken as TownKit).gable(4.4, 1.5, 1.4, Vector3(bx, 2.8, bz + bl * 0.5 - 0.35), t1, false)
	(roof.broken as TownKit).gable(4.4, 1.5, 0.9, Vector3(bx, 2.8, bz - bl * 0.5 + 0.1), scorched(TownKit.shade(tile, 0.86), 0.6), false)
	for i in 6:
		var sz := 0.18 + rnd.next() * 0.12
		rock(roof.broken, sz, Vector3(bx + ms * (2.2 + rnd.next() * 0.8), 0.12, bz + (rnd.next() - 0.5) * bl), scorched(tile, 0.4 + rnd.next() * 0.4))
	var roof_at: Array[Vector3] = []
	for t: float in [-1.0, 0.0, 1.0]:
		roof_at.append(Vector3(bx, 3.9, bz + t * bl * 0.33))
	var dx := bx + ms * 1.82
	var dzs: Array[float] = [bz - bl * 0.37, bz, bz + bl * 0.37]
	for dz in dzs:
		b.box(0.08, 1.7, 0.95, Vector3(dx, 0.85, dz), door)
		b.box(0.1, 0.12, 1.15, Vector3(dx, 1.78, dz), capc)
	for wz: float in [(dzs[0] + dzs[1]) * 0.5, (dzs[1] + dzs[2]) * 0.5]:
		b.box(0.06, 0.6, 0.6, Vector3(dx, 1.6, wz), TownKit.lin("#3d5a6a" if float(P.moss) > 0.0 else "#2f6f9a"))
	var bzz := bz - bl * 0.5 + 1.0
	while bzz <= bz + bl * 0.5 - 0.9:
		_block(bx, bzz, 2.1)
		bzz += 1.5
	# barrels and crates by its door
	for it: Array in [[bx + ms * 2.35, bz + bl * 0.5 - 0.6, "c", 0.0], [bx + ms * 2.4, bz + bl * 0.5 - 1.4, "b", 0.0], [bx + ms * 2.3, bz + bl * 0.5 - 0.6, "c", 0.6], [bx + ms * 2.6, bz - bl * 0.5 - 0.7, "b", 0.0]]:
		var lx: float = it[0]
		var lz: float = it[1]
		var lift: float = it[3]
		if absf(lz) > PL - 0.5:
			continue
		var ry := rnd.next() * 0.8
		if it[2] == "c":
			b.crate(Transform3D(Basis(Vector3.UP, ry), Vector3(lx, 0.3 + lift, lz)), 0.6)
		else:
			b.barrel(Transform3D(Basis(Vector3.UP, ry), Vector3(lx, 0.42 + lift, lz)), 0.84, 0.3)
		if lift == 0.0:
			_block(lx, lz, 0.45)
	# across the plaza: the powder magazine, a chapel, or the keep
	var mx := ms * (PL - 1.9)
	var mz := -PL + 2.6
	if S.hall == "magazine":
		b.box(3.0, 2.2, 3.8, Vector3(mx, 1.1, mz), func(p: Vector3) -> Color: return TownKit.shade(stone, 0.86 + _hash(floori(p.y / 0.5), floori(p.z / 0.9)) * 0.12), 0.06)
		b.half_cyl(1.5, 3.8, Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(mx, 2.2, mz)), capc, 14)
		b.box(0.08, 1.5, 0.9, Vector3(mx - ms * 1.52, 0.75, mz), _iron, 0.0, TownKit.IRON)
		# a lightning rod, for the obvious reason
		b.beam(Vector3(mx, 3.6, mz + 1.6), Vector3(mx, 5.4, mz + 1.6), 0.025, _iron, TownKit.IRON, 4)
		_block(mx, mz - 0.9, 1.8)
		_block(mx, mz + 0.9, 1.8)
	elif S.hall == "chapel":
		# a little whitewashed chapel, its bell hung in an espadaña over the door
		var cx := ms * (PL - 2.1)
		var cz := -PL + 3.6
		b.box(3.2, 3.0, 4.4, Vector3(cx, 1.5, cz), func(p: Vector3) -> Color: return TownKit.shade(lo, 0.9) if p.y < 0.4 else wash, 0.08)
		b.gable(3.8, 1.3, 4.8, Vector3(cx, 3.0, cz), func(p: Vector3) -> Color: return TownKit.shade(tile, 0.86 + 0.14 * float(posmod(floori((p.z + 20.0) / 0.32), 2))), false)
		var fz := cz + 2.25
		b.box(2.4, 2.0, 0.4, Vector3(cx, 4.0, fz), wash, 0.06)
		b.box(1.1, 0.9, 0.4, Vector3(cx, 5.3, fz), wash, 0.06)
		b.box(2.6, 0.14, 0.5, Vector3(cx, 5.0, fz), capc)
		b.box(0.62, 0.8, 0.44, Vector3(cx, 4.25, fz), TownKit.lin("#2a2420"))
		b.lathe(PackedVector2Array([Vector2(0.02, 0.36), Vector2(0.16, 0.34), Vector2(0.2, 0.12), Vector2(0.27, 0.0)]), _move(Vector3(cx, 3.95, fz)), TownKit.lin("#b08a3a"), 10, TownKit.GILT)
		b.box(0.05, 0.5, 0.05, Vector3(cx, 5.95, fz), _iron, 0.0, TownKit.IRON)
		b.box(0.32, 0.05, 0.05, Vector3(cx, 6.05, fz), _iron, 0.0, TownKit.IRON)
		b.box(0.08, 1.8, 0.95, Vector3(cx, 0.9, fz + 0.01), door)
		_block(cx, cz - 1.1, 2.0)
		_block(cx, cz + 1.1, 2.0)
	else:
		# the keep: a tall round tower in the corner, the last place to hold out
		var k := keep_spot(S, ms)
		var kx: float = k.x
		var kz: float = k.z
		var kr: float = k.r
		var ktop: float = k.top
		var slit := TownKit.lin("#2a2420")
		lathe(b, densify(PackedVector2Array([Vector2(0.0, -0.5), Vector2(kr + 0.45, -0.5), Vector2(kr, 1.8), Vector2(kr, ktop), Vector2(0.0, ktop + 0.02)])), 18, Vector3(kx, 0.0, kz), func(p: Vector3, n: Vector3) -> Color:
			if p.y > ktop - 0.01:
				return cap_stone(p, n, 0.92)
			var a := atan2(p.z - kz, p.x - kx)
			# arrow slits up its face
			if absf(sin(a * 2.0 + 0.6)) < 0.08 and p.y > 2.2 and p.y < ktop - 1.0 and posmod(floori(p.y / 1.4), 2) == 0:
				return slit
			return ashlar(Vector3(a * kr, p.y, 0.0), Vector3.BACK, -0.5))
		b.torus(kr + 0.05, 0.14, 6, 22, Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(kx, ktop - 0.12, kz)), capc)
		lathe(b, PackedVector2Array([Vector2(kr + 0.05, ktop), Vector2(kr + 0.05, ktop + 0.5), Vector2(kr - 0.7, ktop + 0.5), Vector2(kr - 0.7, ktop + 0.02)]), 18, Vector3(kx, 0.0, kz), _cap)
		var n := roundi(TAU * kr / 1.5)
		for i in n:
			var a := TAU * i / n
			box(b, 0.85, 0.75, 0.62, Transform3D(Basis(Vector3.UP, -a + PI * 0.5), Vector3(kx + cos(a) * (kr - 0.32), ktop + 0.87, kz + sin(a) * (kr - 0.32))), _cap)
		var da := atan2(-kz, -kx)
		b.box(0.95, 1.9, 0.3, Vector3(kx + cos(da) * (kr - 0.05), 0.95, kz + sin(da) * (kr - 0.05)), door, 0.0, TownKit.WOOD, 0.0, -da + PI * 0.5)
		_block(kx, kz, kr + 0.4)
	# stairs up to the rampart along the wall facing the barracks
	var steps := roundi(WH / 0.44)
	var st_h := WH / steps
	var st_top := minf(PL - 0.95, H - float(S.R) - 0.7 if S.tower == "point" else (H - 0.4 - float(S.R) - 0.6 if S.tower == "square" else PL - 0.95))
	for i in steps:
		var sz := st_top - (steps - 1 - i) * 0.55
		b.box(1.4, (i + 1) * st_h, 0.56, Vector3(ms * (PL - 0.7), (i + 1) * st_h * 0.5, sz), TownKit.shade(stone, 0.92 + (i % 2) * 0.05))
	for i in 4:
		_block(ms * (PL - 0.75), st_top - 0.6 - i * 1.4, 0.8)
	# the brazier: an iron basket of coals on a tripod in the middle of the plaza
	var fz := -1.2
	var iron := TownKit.lin("#3a3532")
	for i in 3:
		var a := TAU * i / 3.0 + 0.4
		b.beam(Vector3(cos(a) * 0.55, 0.0, fz + sin(a) * 0.55), Vector3(cos(a) * 0.18, 0.95, fz + sin(a) * 0.18), 0.04, iron, TownKit.IRON)
	b.lathe(PackedVector2Array([Vector2(0.05, 0.86), Vector2(0.32, 0.9), Vector2(0.48, 1.06), Vector2(0.52, 1.14)]), _move(Vector3(0.0, 0.0, fz)), TownKit.lin("#2a2826"), 12, TownKit.IRON)
	b.ball(0.42, Vector3(0.0, 1.08, fz), Color(2.6, 0.85, 0.2), TownKit.GLOW, Vector3(1.0, 0.2, 1.0))
	_block(0.0, fz, 0.7)
	# stone benches round the brazier, where the garrison sits at ease
	var seats: Array[Vector3] = []
	var fw := _W(0.0, fz)
	for a: float in [0.9, 2.5, 4.1, 5.5]:
		var lx := cos(a) * 2.6
		var lz := fz + sin(a) * 2.6
		b.box(1.6, 0.42, 0.5, Vector3(lx, 0.21, lz), TownKit.shade(capc, 0.9), 0.1, TownKit.WOOD, 0.0, -a + PI * 0.5)
		var pt := _W(lx * 0.96, fz + (lz - fz) * 0.96)
		seats.append(Vector3(pt.x, pt.z, atan2(fw.x - pt.x, fw.z - pt.z)))
		_block(lx, lz, 0.5)
	# the flagstaff: a tall mast on a stone plinth near the sea wall, with a signal yard
	var sz := PL - 1.8
	var top := 12.6
	var mast := TownKit.lin("#3e2a1a")
	b.box(1.3, 0.7, 1.3, Vector3(0.0, 0.35, sz), capc, 0.1)
	b.beam(Vector3(0.0, 0.6, sz), Vector3(0.0, top, sz), 0.14, mast)
	b.beam(Vector3(-1.6, top - 3.4, sz), Vector3(1.6, top - 3.4, sz), 0.06, mast)
	b.ball(0.2, Vector3(0.0, top + 0.1, sz), TownKit.lin("#d8a640"), TownKit.GILT)
	_block(0.0, sz, 0.75)
	# round shot stacked by every gun
	var shot := TownKit.lin("#2a2a2c")
	for g: Vector3 in S.guns:
		var ix := sin(g.z)
		var iz := cos(g.z)
		# beside the gun along the wall, a little in from the parapet
		var px := g.x + iz * 1.45 - ix * 0.9
		var pz := g.y - ix * 1.45 - iz * 0.9
		for o: Vector3 in [Vector3(-0.15, 0.14, -0.15), Vector3(0.15, 0.14, -0.15), Vector3(-0.15, 0.14, 0.15), Vector3(0.15, 0.14, 0.15), Vector3(0.0, 0.36, 0.0)]:
			b.ball(0.14, Vector3(px + o.x, WH + o.y, pz + o.z), shot, TownKit.IRON)
	# the walls are walls: rings of discs along their middles, the gate left open
	var span := H - float(S.R) if S.tower == "point" else H - 1.0
	for side in 4:
		var u := -span + 0.8
		while u <= span - 0.8:
			if not (side == 2 and absf(u) < GATE_W * 0.5 + 1.6):
				var l := face_to_fort(side, u, H - T * 0.5)
				_block(l.x, l.y, T * 0.5 + 0.2)
			u += 1.4
	# the gate's jambs, so nobody slips in round the doors' edge
	for sx: float in [-1.0, 1.0]:
		_block(sx * (GATE_W * 0.5 + 0.9), -H + T * 0.5, 0.9)
	# where people stand about when at ease: by the gate, the magazine, the stairs, under the flag
	var posts: Array[Vector3] = []
	for pd: Array in [[-1.2, -PL + 1.4, PI], [1.2, -PL + 1.4, PI], [ms * (PL - 4.3), mz + 2.6, -ms * PI * 0.5], [ms * (PL - 2.6), st_top - 2.2, 0.0], [-1.6, sz - 1.4, 0.0], [bx + ms * 2.6, 1.2, ms * PI * 0.5]]:
		var p := _W(float(pd[0]), float(pd[1]))
		posts.append(Vector3(p.x, p.z, yaw + float(pd[2])))
	var fire := _W(0.0, fz, 1.1)
	var chest := _W(bx + ms * 2.5, -3.2, 0.0)
	return {
		"fire": fire,
		"chest": chest,
		"chest_yaw": yaw + ms * PI * 0.5,
		"flag_top": _W(0.0, sz, top - 0.3),
		"flag_drop": top - 2.4,
		"seats": seats,
		"posts": posts,
		"roof_at": roof_at,
	}


# ------------------------------------------------------------------ the guns

## One shore gun: a bronze barrel on its trunnions (pointing +z, pivot at the
## origin) and a garrison carriage with trucks (its base at y = -GUN_PIVOT).
## {barrel, carriage}.
static func gun_parts() -> Dictionary:
	var bronze := TownKit.lin("#8d6a3c")
	var dark := TownKit.lin("#5a4123")
	var barrel := TownKit.new(31)
	var prof := PackedVector2Array()
	for p: Vector2 in [Vector2(0, -0.86), Vector2(0.12, -0.84), Vector2(0.15, -0.78), Vector2(0.1, -0.72), Vector2(0.08, -0.66), Vector2(0.26, -0.62), Vector2(0.28, -0.5), Vector2(0.26, -0.44), Vector2(0.25, 0.1), Vector2(0.27, 0.14), Vector2(0.27, 0.22),
			Vector2(0.23, 0.26), Vector2(0.2, 1.2), Vector2(0.22, 1.24), Vector2(0.22, 1.32), Vector2(0.19, 1.36), Vector2(0.18, 1.62), Vector2(0.22, 1.68), Vector2(0.23, 1.78), Vector2(0.15, 1.8), Vector2(0.13, 1.7), Vector2(0.0, 1.68)]:
		prof.append(p)
	# (turned up the y axis, then laid down along +z)
	var lay := Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3.ZERO)
	var m := barrel._mark()
	barrel.kit.lathe(lay, prof, 14)
	barrel.paint_from(m.x, func(p: Vector3) -> Color: return TownKit.shade(bronze, 0.9 + 0.12 * sin(p.z * 3.0)), TownKit.IRON)
	barrel.cyl(0.075, 0.075, 0.74, Vector3.ZERO, bronze, 8, TownKit.IRON, 0.0, PI * 0.5)
	# the dolphins (lifting handles) cast on top
	for sx: float in [-1.0, 1.0]:
		barrel.torus(0.07, 0.025, 4, 8, Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(sx * 0.08, 0.27, 0.22)), bronze, TownKit.IRON, PI)
	var carriage := TownKit.new(37)
	var y0 := -GUN_PIVOT
	var hub := TownKit.lin("#3c2c1c")
	for sx: float in [-1.0, 1.0]:
		# stepped cheeks
		carriage.box(0.13, 0.5, 1.45, Vector3(sx * 0.31, y0 + 0.45, -0.15), func(p: Vector3) -> Color: return TownKit.shade(dark, 0.9 + 0.1 * float(posmod(floori((p.y + 3.0) / 0.17), 2))), 0.03)
		carriage.box(0.13, 0.3, 0.7, Vector3(sx * 0.31, y0 + 0.82, 0.1), dark, 0.03)
		for z: float in [-0.62, 0.42]:
			carriage.cyl(0.22, 0.22, 0.12, Vector3(sx * 0.42, y0 + 0.22, z), func(p: Vector3) -> Color: return TownKit.shade(hub, 0.8 + 0.2 * absf(sin(atan2(p.y - y0 - 0.22, p.z - z) * 4.0))), 12, TownKit.WOOD, 0.0, PI * 0.5)
	for z: float in [-0.62, 0.42]:
		carriage.cyl(0.06, 0.06, 0.95, Vector3(0.0, y0 + 0.22, z), TownKit.lin(IRON_DARK), 6, TownKit.IRON, 0.0, PI * 0.5)
	carriage.box(0.5, 0.1, 1.2, Vector3(0.0, y0 + 0.24, -0.15), dark)
	# the quoin wedge under the breech
	carriage.box(0.32, 0.1, 0.4, Vector3(0.0, y0 + 0.62, -0.62), TownKit.lin("#6a4c2c"))
	return {"barrel": barrel.commit(), "carriage": carriage.commit()}


## A heap of fallen masonry and a split carriage, for a silenced gun (origin
## on the rampart), its stone white so each fort's own tints it.
static func rubble() -> ArrayMesh:
	var t := TownKit.new(41)
	var r := Mulberry32.new(4242)
	for i in 9:
		var a := r.next() * TAU
		var d := r.next() * 0.9
		var s := 0.22 + r.next() * 0.26
		var g := 0.7 + r.next() * 0.35
		var ry := r.next() * 3.0
		dodeca(t.kit, Transform3D(Basis(Vector3.UP, ry) * Basis.from_scale(Vector3(1.2, 0.7, 1.0) * s), Vector3(cos(a) * d, s * 0.4, sin(a) * d * 0.8 + 0.3)), _store(Color(g, g, g)))
	# a scorched beam end and a cracked wheel
	t.box(0.13, 0.13, 1.1, Vector3(0.35, 0.18, -0.4), TownKit.lin("#2b1e14"), 0.0, TownKit.WOOD, 0.0, 0.7, 0.2)
	t.cyl(0.22, 0.22, 0.12, Vector3(-0.5, 0.2, -0.3), TownKit.lin("#2b2016"), 10, TownKit.WOOD, PI / 2.4)
	return t.commit()


## A shot scar: a blackened crater with a pale rim of fresh-broken stone and a
## few chips standing proud, facing +z (centred on the surface it marks),
## grey so each fort's stone tints it.
static func pock() -> ArrayMesh:
	var t := TownKit.new(43)
	var k := t.kit
	var r := Mulberry32.new(919)
	var N := 11
	var ring := func(rad: float, z: float) -> Array[Vector3]:
		var out: Array[Vector3] = []
		for i in N:
			var a := TAU * i / N
			var j := 0.75 + r.next() * 0.5
			out.append(Vector3(cos(a) * rad * j, sin(a) * rad * j, z))
		return out
	# (all of it standing a hair proud of the face it's laid on)
	var mid := Vector3(0.0, 0.0, 0.005)
	var inner: Array[Vector3] = ring.call(0.42, 0.015)
	var rim: Array[Vector3] = ring.call(0.62, 0.05)
	var outer: Array[Vector3] = ring.call(0.95, 0.01)
	var g := func(v: float) -> Color: return _store(Color(v, v, v))
	var add := func(p: Array[Vector3], c: Array[Color]) -> void:
		var i := k.verts.size()
		for j in 3:
			k.verts.append(p[j])
			k.normals.append(Vector3.BACK)
			k.colors.append(c[j])
		k.tri(i, i + 1, i + 2)
	var c05: Color = g.call(0.05)
	var c09: Color = g.call(0.09)
	var c72: Color = g.call(0.72)
	var c42: Color = g.call(0.42)
	for i in N:
		var n := (i + 1) % N
		add.call([mid, inner[i], inner[n]] as Array[Vector3], [c05, c09, c09] as Array[Color])
		add.call([inner[i], rim[i], rim[n]] as Array[Vector3], [c09, c72, c72] as Array[Color])
		add.call([inner[i], rim[n], inner[n]] as Array[Vector3], [c09, c72, c09] as Array[Color])
		add.call([rim[i], outer[i], outer[n]] as Array[Vector3], [c72, c42, c42] as Array[Color])
		add.call([rim[i], outer[n], rim[n]] as Array[Vector3], [c72, c42, c72] as Array[Color])
	for i in 4:
		var a := r.next() * TAU
		var d := 0.7 + r.next() * 0.35
		var s := 0.08 + r.next() * 0.06
		var ry := r.next() * 3.0
		var rx := r.next() * 3.0
		k.octahedron(Transform3D(Basis(Vector3.RIGHT, rx) * Basis(Vector3.UP, ry), Vector3(cos(a) * d, sin(a) * d, 0.03)), s)
		for v in range(k.colors.size() - 24, k.colors.size()):
			k.colors[v] = _store(Color.WHITE)
	return t.commit()


## One fallen block (white, the fort's stone tints it), for masonry knocked off a face.
static func block_mesh() -> ArrayMesh:
	var t := TownKit.new(47)
	dodeca(t.kit, Transform3D(Basis.from_scale(Vector3(1.3, 0.75, 1.0) * 0.34), Vector3.ZERO), _store(Color.WHITE))
	return t.commit()
