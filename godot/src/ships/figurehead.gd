class_name Figurehead
## The carved head at the bow: a knee of the head run out forward of the stem
## under the bowsprit, gilt-edged with trailboards on its cheeks, and on its
## tip the figure, about a fifth of the ship's length, leaning out over the
## cutwater as far as the bowsprit lets it. The figures were sculpted offline
## for the web game and converted by tools/bake_figures.mjs. Ported from the
## web game's src/ships/figureheads.ts.

## The bowsprit's rake (see ShipModel).
const SPRIT_ANGLE := 0.32
## Gilt as painted in the bake: trim pieces take the ship's own trim instead.
const BAKED_GILT := Color("#e8b649")

## Glowing and metal jewels, linear.
const GLOW := {
	"window": Color(5.0, 3.2, 1.4), "ember": Color(3.2, 0.85, 0.18), "aether": Color(0.32, 1.45, 2.8),
	"violet": Color(1.55, 0.5, 2.9), "star": Color(2.4, 2.5, 3.1),
}
const METAL := {
	"iron": "#23262b", "bronze": "#b07a3b", "brass": "#d4a84e", "blued": "#34466e", "gold": "#e8b649",
	"paleGold": "#f6d98a", "amber": "#c98a2a", "obsidian": "#18151f", "pearl": "#eceaf4", "silver": "#c5cad6",
	"ruby": "#8a1420",
}

static var _index := {}
static var _bin := PackedByteArray()


class Head:
	## The tip of the knee, where the figure's hips sit.
	var at := Vector3.ZERO
	## Figure units to metres.
	var scale := 1.0
	## How far the figure leans out from upright (radians).
	var lean := 0.62
	var place := Transform3D.IDENTITY
	## The middle of the figure, for cameras.
	var centre := Vector3.ZERO
	## Front face of the stem post.
	var stem := 0.0
	## Where the knee's lower edge meets the stem.
	var y_low := 0.0
	## On the knee's cutwater under the figure: where the bobstay is set up.
	var foot := Vector3.ZERO

	## A point in the figure's frame (y up, z forward) in hull space.
	func p(fy: float, fz: float, fx: float = 0.0) -> Vector3:
		return place * Vector3(fx, fy, fz)


static func _rot_x(p: Vector3, a: float) -> Vector3:
	return Vector3(p.x, p.y * cos(a) - p.z * sin(a), p.y * sin(a) + p.z * cos(a))


## Where the figure goes on a hull, and how big: hips just under the rail on
## a knee ahead of the stem, leaning only as far as it must to keep its crown
## clear of the bowsprit.
static func bow_head(s: HullShape, c: ShipClass) -> Head:
	var h := Head.new()
	var length := c.length
	var top := s.top(1.0)
	var bot := s.bottom(1.0)
	h.stem = s.z(1.0) + (0.11 + length * 0.003) * 1.4
	var bz := s.z(0.985)
	var by := s.top(0.985) - 0.1 - 0.24
	var crown := [Vector3(0, 1.34, 0.02), Vector3(0, 1.27, 0.3), Vector3(0, 1.18, 0.46)]
	var tail := [Vector3(0, -0.68, 0.12), Vector3(0, -0.6, 0.32)]
	var big := 1.75 + length * 0.04
	var size := big
	var lean := 0.62
	var at := Vector3.ZERO
	var found := false
	while size > big * 0.6 and not found:
		lean = 0.62
		while lean <= 1.1:
			var drop := -1e9
			for p: Vector3 in tail:
				drop = maxf(drop, -_rot_x(p, lean).y)
			at = Vector3(0, maxf(lerpf(bot, top, 0.4), 0.5 + drop * size), h.stem + 0.3 * size)
			var fits := true
			for k: Vector3 in crown:
				var q := _rot_x(k, lean) * size + at
				if q.y >= by + tan(SPRIT_ANGLE) * (q.z - bz) - 0.2:
					fits = false
					break
			if fits:
				found = true
				break
			lean += 0.03
		if not found:
			size -= 0.04
	h.at = at
	h.scale = size
	h.lean = lean
	h.place = Transform3D(Basis(Vector3.RIGHT, lean).scaled(Vector3(size, size, size)), at)
	h.centre = h.p(0.6, 0.05)
	h.y_low = maxf(maxf(bot + 0.15, h.p(-0.62, -0.1).y - 0.35), 0.35)
	h.foot = Vector3(0, h.y_low + 0.12, h.stem).lerp(h.p(-0.55, -0.12), 0.4)
	return h


## three.js SplineCurve: uniform Catmull-Rom through 2D points.
static func spline(pts: PackedVector2Array, t: float) -> Vector2:
	var n := pts.size()
	var p := (n - 1) * t
	var ip := mini(floori(p), n - 1)
	var w := p - ip
	var p0 := pts[ip if ip == 0 else ip - 1]
	var p1 := pts[ip]
	var p2 := pts[n - 1 if ip > n - 2 else ip + 1]
	var p3 := pts[n - 1 if ip > n - 3 else ip + 2]
	var v0 := (p2 - p0) * 0.5
	var v1 := (p3 - p1) * 0.5
	var t2 := w * w
	var t3 := w * t2
	return (2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * w + p1


## The knee of the head: a deep, rounded bracket from the stem out to the
## figure's hips, thinning like a cutwater, gilt beading round its edges and
## a carved trailboard scroll on each cheek. Returns its top curve, lower edge
## and half thickness, for the head rails.
static func build_knee(s: HullShape, c: ShipClass, h: Head, wood: MeshKit, trim: MeshKit, col: Color, trim_col: Color, detail: bool) -> Dictionary:
	var length := c.length
	var top := s.top(1.0)
	var back := h.stem - 0.35
	var shoulder := h.p(0.3, -0.32)
	var y_top := minf(top - 0.5, shoulder.y - 0.15)
	var v2 := func(p: Vector3) -> Vector2: return Vector2(p.z, p.y)
	var low := PackedVector2Array([Vector2(back, h.y_low), Vector2(h.stem, h.y_low + 0.12), v2.call(h.p(-0.55, -0.12)), v2.call(h.p(-0.24, -0.06)), v2.call(h.p(0.02, -0.05))])
	var top_pts := PackedVector2Array([v2.call(h.p(0.2, -0.12)), v2.call(shoulder), Vector2(lerpf(h.stem, shoulder.z, 0.4), lerpf(y_top, shoulder.y, 0.3)), Vector2(back, y_top)])
	# the outline (z, y): along the lower edge, back over the top, straight home
	var outline := PackedVector2Array()
	var per := 5 if detail else 3
	var n_low := low.size() * per
	for i in n_low:
		outline.append(spline(low, float(i) / n_low))
	var upper := PackedVector2Array([low[low.size() - 1]])
	upper.append_array(top_pts)
	var n_up := upper.size() * per
	for i in n_up + 1:
		outline.append(spline(upper, float(i) / n_up))
	var th := 0.24 + length * 0.006
	var bev := 0.07 + length * 0.0015
	var tip := h.p(0.02, -0.05).z
	var thin := func(zz: float) -> float: return lerpf(1.0, 0.6, clampf((zz - h.stem) / (tip - h.stem), 0.0, 1.0))
	_pillow(wood, outline, th * 0.5, bev, thin, col, 3 if detail else 2)

	var edge := low.slice(1)
	var half := th * 0.5 + bev * 0.7
	var r := 0.045 + length * 0.0012
	trim.paint(trim_col, MeshKit.GILT, 0.02)
	for side: float in [1.0, -1.0]:
		var bead := PackedVector3Array()
		for k in 11:
			var q := spline(edge, k / 10.0)
			var f := clampf((q.x - h.stem) / (tip - h.stem), 0.0, 1.0)
			bead.append(Vector3(side * lerpf(half, half * 0.6, f), q.y + 0.06, q.x - 0.05))
		trim.sweep(bead, func(_u: float) -> float: return r, 5, 20)
		var crest := PackedVector3Array()
		for k in 11:
			var q := spline(top_pts, k / 10.0)
			var f := clampf((q.x - h.stem) / (tip - h.stem), 0.0, 1.0)
			crest.append(Vector3(side * lerpf(half, half * 0.6, f), q.y - 0.06, q.x))
		trim.sweep(crest, func(_u: float) -> float: return r * 0.85, 5, 20)
		var board := PackedVector3Array()
		for k in 9:
			var u := k / 8.0
			var a := spline(edge, lerpf(0.15, 0.95, u))
			var b := spline(top_pts, lerpf(0.85, 0.05, u))
			var m := a.lerp(b, 0.45)
			var f := clampf((m.x - h.stem) / (tip - h.stem), 0.0, 1.0)
			board.append(Vector3(side * (lerpf(half, half * 0.6, f) + 0.01), m.y, m.x))
		var end := board[board.size() - 1]
		var dir := (end - board[board.size() - 2]).normalized()
		var curl := scroll(end + dir * 0.05 + Vector3(0, -0.16, 0), Vector3.BACK, Vector3.UP, 0.16 + length * 0.004, 0.9, PI * 0.5, 10)
		var path := board.slice(0, board.size() - 1)
		path.append_array(curl)
		trim.sweep(path, func(u: float) -> float: return lerpf(r * 1.5, r * 0.6, u), 6, 34)
		trim.ball(curl[curl.size() - 1], r * 1.4, 6, 4)
		# a carved acanthus leaf at the start of the board
		trim.ball(board[0], r * 2.2, 8, 6)
	return {"top": top_pts, "edge": edge, "half": half}


## Points on a carved scroll: a spiral of `turns` winding in from radius big_r
## round c, in the plane (ax, ay).
static func scroll(c: Vector3, ax: Vector3, ay: Vector3, big_r: float, turns: float, a0: float = 0.0, n: int = 14) -> PackedVector3Array:
	var out := PackedVector3Array()
	for k in n + 1:
		var f := float(k) / n
		var a := a0 + f * turns * TAU
		var rr := big_r * (1.0 - 0.72 * f)
		out.append(c + ax * cos(a) * rr + ay * sin(a) * rr)
	return out


## A flat 2D outline (z, y) given thickness across x, its edges rounded over:
## like a three.js extrusion with a bevel. thin(z) narrows it toward the tip.
static func _pillow(kit: MeshKit, outline: PackedVector2Array, half_th: float, bev: float, thin: Callable, col: Color, bevel_segs: int) -> void:
	kit.paint(col, MeshKit.WOOD, 0.02)
	var n := outline.size()
	var area := 0.0
	for i in n:
		var a := outline[i]
		var b := outline[(i + 1) % n]
		area += a.x * b.y - b.x * a.y
	var ccw := area > 0.0
	# outward normals of the outline, averaged at each corner
	var nrm := PackedVector2Array()
	for i in n:
		var d0 := (outline[i] - outline[posmod(i - 1, n)]).normalized()
		var d1 := (outline[(i + 1) % n] - outline[i]).normalized()
		var e := Vector2(d0.y, -d0.x) + Vector2(d1.y, -d1.x)
		if not ccw:
			e = -e
		nrm.append(e.normalized())
	# rings round the rim: the front cheek's edge, round over onto the wall,
	# along it, and round under to the back cheek: [out, side, along-x]
	var rings: Array[Vector3] = []
	for k in bevel_segs + 1:
		var phi := PI * 0.5 * k / bevel_segs
		rings.append(Vector3(sin(phi), 1.0, cos(phi)))
	for k in range(bevel_segs, -1, -1):
		var phi := PI * 0.5 * k / bevel_segs
		rings.append(Vector3(sin(phi), -1.0, cos(phi)))
	var base := kit.vertex_count()
	for ring: Vector3 in rings:
		for i in n:
			var o := outline[i]
			var w: float = thin.call(o.x)
			var p2 := o + nrm[i] * bev * ring.x
			var x := ring.y * (half_th * w + bev * ring.z)
			var nn := Vector3(ring.y * ring.z, nrm[i].y * ring.x, nrm[i].x * ring.x).normalized()
			kit.add_vertex(Vector3(x, p2.y, p2.x), nn)
	# stitch ring to ring; the winding follows the outline's direction
	for k in rings.size() - 1:
		for i in n:
			var a := base + k * n + i
			var b := base + k * n + (i + 1) % n
			var cc := base + (k + 1) * n + (i + 1) % n
			var d := base + (k + 1) * n + i
			if ccw:
				kit.quad(a, b, cc, d)
			else:
				kit.quad(a, d, cc, b)
	# the two flat cheeks
	var tris := Geometry2D.triangulate_polygon(outline)
	for side: float in [1.0, -1.0]:
		var cap := kit.vertex_count()
		for i in n:
			var o := outline[i]
			kit.add_vertex(Vector3(side * (half_th * float(thin.call(o.x)) + bev), o.y, o.x), Vector3(side, 0, 0))
		for t in range(0, tris.size(), 3):
			var i0 := tris[t]
			var i1 := tris[t + 1]
			var i2 := tris[t + 2]
			# the triangle's facing in (z, y): + is counter-clockwise
			var a2 := outline[i1] - outline[i0]
			var b2 := outline[i2] - outline[i0]
			var cw := a2.x * b2.y - a2.y * b2.x
			# (z, y) counter-clockwise faces -x (z x y = -x)
			if (cw > 0.0) == (side < 0.0):
				kit.tri(cap + i0, cap + i1, cap + i2)
			else:
				kit.tri(cap + i0, cap + i2, cap + i1)


# ------------------------------------------------------------------ baked figures

## Reads the baked figures now (on the main thread), before the shipyard's
## workers build hulls that carve them.
static func warm() -> void:
	_load()


static func _load() -> bool:
	if not _index.is_empty():
		return true
	var txt := FileAccess.get_file_as_string("res://art/figures.json")
	var parsed: Variant = JSON.parse_string(txt)
	if parsed == null:
		push_warning("figureheads: could not read art/figures.json")
		return false
	_index = parsed
	_bin = FileAccess.get_file_as_bytes("res://art/figures.bin")
	return not _bin.is_empty()


## Builds a figure ("mermaid", "lion", ...) into the kits by material.
static func build_figure(fig: String, h: Head, kits: Dictionary, trim_col: Color) -> void:
	if not _load() or not _index.has(fig):
		return
	var trim_lin := trim_col.srgb_to_linear()
	var gl := _lum(BAKED_GILT.srgb_to_linear())
	for pc: Dictionary in _index[fig]:
		var nv := int(pc.verts)
		var ni := int(pc.indices)
		var pos := _bin.slice(int(pc.pos), int(pc.pos) + nv * 12).to_vector3_array()
		var nrm := _bin.slice(int(pc.nrm), int(pc.nrm) + nv * 12).to_vector3_array()
		var raw := _bin.slice(int(pc.col), int(pc.col) + nv * 4)
		var idx := _bin.slice(int(pc.idx), int(pc.idx) + ni * 4).to_int32_array()
		var bucket: String = pc.bucket
		var cols := PackedColorArray()
		cols.resize(nv)
		var kind: float = {"wood": MeshKit.WOOD, "iron": MeshKit.IRON, "trim": MeshKit.GILT, "glow": MeshKit.GLOW}[bucket]
		for i in nv:
			var cc := Color8(raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2])
			if bucket == "trim":
				# gilt in the ship's own trim colour, its carved shading kept
				var t := _lum(cc.srgb_to_linear()) / gl
				cc = Color(minf(trim_lin.r * t, 1.0), minf(trim_lin.g * t, 1.0), minf(trim_lin.b * t, 1.0)).linear_to_srgb()
			cc.a = MeshKit.code(kind)
			cols[i] = cc
		var m := h.place * _frame(pc.frame, h.lean)
		var kit: MeshKit = kits[bucket]
		kit.add_arrays(pos, nrm, idx, cols, m)
		for j: Dictionary in pc.get("jewels", []):
			var at := m * Vector3(j.at[0], j.at[1], j.at[2])
			var r := float(j.r) * h.scale
			var w := 12 if r > 0.08 else 7
			var jk: String = j.kind
			if GLOW.has(jk):
				var g: Color = GLOW[jk]
				var peak := maxf(g.r, maxf(g.g, g.b))
				kits.glow.paint(Color(g.r / peak, g.g / peak, g.b / peak).linear_to_srgb(), MeshKit.GLOW, 0.0)
				kits.glow.ball(at, r, w, ceili(w * 0.7))
			else:
				kits.trim.paint(Color(METAL.get(jk, METAL.pearl)), MeshKit.GILT, 0.03)
				kits.trim.ball(at, r, w, ceili(w * 0.7))


static func _lum(c: Color) -> float:
	return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722


## Where a piece's own frame sits in the figure's frame: heads are levelled to
## look ahead (a touch up by their tilt), ship-axis pieces undo the lean.
static func _frame(f: Dictionary, lean: float) -> Transform3D:
	var kind: String = f.kind
	if kind == "body":
		return Transform3D.IDENTITY
	var pitch := -lean * 0.85 - float(f.tilt) if kind == "head" else -lean
	return Transform3D(Basis(Vector3.RIGHT, pitch), Vector3(f.at[0], f.at[1], f.at[2]))
