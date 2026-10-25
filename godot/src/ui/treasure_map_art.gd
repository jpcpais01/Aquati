class_name TreasureMapArt
extends SubViewport
## A treasure map, untorn (the web's drawArt, src/ui/treasureMap.ts): an
## island in ink and watercolour on old parchment, its X in red, the way in
## from the nearest beach dashed like footsteps, a compass rose, a serpent in
## the open water, a scale of paces and the isle's name on a ribbon. Drawn
## once on the GPU into this viewport (S x S sheet units at Q to each), its
## texture kept for the torn pieces, along with the riddle that goes with it.

## The sheet's drawing space, and the pixels to each of its units.
const S := 560.0
const Q := 2
## The terrain's samples across the sheet.
const RES := 168
const OCT := ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]

## The X on the sheet, and the riddle's three lines.
var x_at := Vector2.ZERO
var clues: PackedStringArray = []

var _ink: _Ink


## The compass word for a heading on the world (north is -z, as on the chart).
static func octant(dx: float, dz: float) -> String:
	return OCT[(roundi(atan2(dx, -dz) / (PI / 4.0)) + 8) % 8]


## The map for `m` (TreasureMaps.state), its X on `isl`; `height` gives the
## ground at (x, z).
func _init(m: Dictionary, isl: Dictionary, height: Callable) -> void:
	size = Vector2i(int(S) * Q, int(S) * Q)
	disable_3d = true
	transparent_bg = false
	render_target_update_mode = SubViewport.UPDATE_ONCE
	canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR
	_ink = _Ink.new()
	_ink.art = self
	_ink.plan(m, isl, height)
	add_child(_ink)


## The sheet, as a texture (mipmapped reads are left to the pieces' draw).
func sheet() -> Texture2D:
	return get_texture()


## Lays the whole map out: everything the draw needs, worked out once.
class _Ink:
	extends Node2D
	var art: TreasureMapArt
	var rnd: Mulberry32
	var hs := PackedFloat32Array()
	var N := RES + 1
	var cell := S / RES
	var span := 240.0
	var name_ := ""
	var wash: ImageTexture
	var xx := 0.0
	var xy := 0.0
	var rose_at := Vector2.ZERO
	var rose_k := 0
	var beast := Vector2(-1.0, -1.0)
	var hills: Array[Vector3] = []
	var best := Vector2(-1.0, -1.0)
	var paces := 0
	var seed_ := 0

	func plan(m: Dictionary, isl: Dictionary, height: Callable) -> void:
		seed_ = int(m.seed)
		rnd = Mulberry32.new(seed_)
		var ix := float(isl.x)
		var iz := float(isl.z)
		name_ = str(isl.get("name", "")) if str(isl.get("name", "")) != "" else str(m.isle)
		span = maxf(240.0, float(isl.r) * 2.7 * maxf(1.0, float(isl.get("stretch", 1.0))))
		var mx := float(m.x)
		var mz := float(m.z)
		# frame the isle, nudged so the X never sits dead centre
		var cx := ix * 0.75 + mx * 0.25
		var cz := iz * 0.75 + mz * 0.25
		hs.resize(N * N)
		for j in N:
			for i in N:
				hs[j * N + i] = height.call(cx + (float(i) / RES - 0.5) * span, cz + (float(j) / RES - 0.5) * span)
		xx = ((mx - cx) / span + 0.5) * S
		xy = ((mz - cz) / span + 0.5) * S
		art.x_at = Vector2(xx, xy)
		# the watercolour: a sea-green wash hugging the coast, the land in sand and sage
		var wr := RES * 2
		var img := Image.create(wr, wr, false, Image.FORMAT_RGBA8)
		for j in wr:
			for i in wr:
				var h := h_at((i + 0.5) / wr * S, (j + 0.5) / wr * S)
				var c: Color
				if h > 0.0:
					if h < 1.3:
						c = Color8(240, 222, 172, 191)
					else:
						var t := minf(1.0, (h - 1.3) / 16.0)
						c = Color((186.0 - t * 30.0) / 255.0, (182.0 - t * 52.0) / 255.0, (118.0 - t * 30.0) / 255.0, 0.55 + t * 0.1)
				else:
					c = Color(92.0 / 255.0, 156.0 / 255.0, 150.0 / 255.0, 0.5 * exp(h / 3.4))
				img.set_pixel(i, j, c)
		wash = ImageTexture.create_from_image(img)
		# where the ornaments go: the most open water in the corners
		var corners: Array[Vector2] = [Vector2(86, S - 92), Vector2(S - 86, S - 92), Vector2(86, 150), Vector2(S - 86, 150)]
		var score: Array[int] = []
		for c in corners:
			score.append(_water(c.x, c.y))
		rose_k = 0 if score[0] >= score[1] else 1
		rose_at = corners[rose_k]
		var rest: Array[int] = []
		for k in 4:
			if k != rose_k:
				rest.append(k)
		rest.sort_custom(func(a: int, b: int) -> bool: return score[a] > score[b])
		if score[rest[0]] > 40:
			beast = corners[rest[0]]
		# the parchment's blotches and fibres take the first of the seed's
		# numbers, as on the web, so the rest falls where the web's does
		_parchment_plan()
		# hills: humps on the high ground
		for k in 500:
			if hills.size() >= 9:
				break
			var x := 30.0 + rnd.next() * (S - 60.0)
			var y := 30.0 + rnd.next() * (S - 60.0)
			var h := h_at(x, y)
			if h < 9.0 or Vector2(x - xx, y - xy).length() < 30.0:
				continue
			var clear := true
			for q in hills:
				if Vector2(q.x - x, q.y - y).length() < 34.0:
					clear = false
					break
			if clear:
				hills.append(Vector3(x, y, h))
		hills.sort_custom(func(a: Vector3, b: Vector3) -> bool: return a.y < b.y)
		# the way in: from the nearest beach to the X
		for k in range(1, 48):
			if best.x >= 0.0:
				break
			for a in 32:
				var r := k * 5.0
				var ang := a / 32.0 * TAU
				var x := xx + cos(ang) * r
				var y := xy + sin(ang) * r
				if h_at(x, y) < 0.0:
					best = Vector2(x - cos(ang) * 6.0, y - sin(ang) * 6.0)
					break
		var to_w := func(px: float, py: float) -> Vector2: return Vector2(cx + (px / S - 0.5) * span, cz + (py / S - 0.5) * span)
		if best.x >= 0.0:
			var w: Vector2 = to_w.call(best.x, best.y)
			paces = maxi(10, roundi(Vector2(mx - w.x, mz - w.y).length() / 0.8 / 5.0) * 5)
			var hx: float = height.call(mx, mz)
			art.clues = PackedStringArray([
				"Land on the %s shore" % TreasureMapArt.octant(w.x - ix, w.y - iz),
				"Walk %d paces %s" % [paces, TreasureMapArt.octant(mx - w.x, mz - w.y)],
				"Dig %s, where the sticks cross" % ("in the sand above the tide" if hx < 1.6 else "among the palms" if hx < 7.0 else "up on the high ground"),
			])
		else:
			art.clues = PackedStringArray(["Land where you can", "Find the crossed sticks", "Dig where they lie"])

	## The ground at a point of the sheet, from the samples.
	func h_at(x: float, y: float) -> float:
		var fx := clampf(x / cell, 0.0, RES - 0.001)
		var fy := clampf(y / cell, 0.0, RES - 0.001)
		var i := int(fx)
		var j := int(fy)
		var u := fx - i
		var v := fy - j
		var k := j * N + i
		return (hs[k] * (1.0 - u) + hs[k + 1] * u) * (1.0 - v) + (hs[k + N] * (1.0 - u) + hs[k + N + 1] * u) * v

	func _water(x: float, y: float) -> int:
		var w := 0
		for k in 24:
			var a := k / 24.0 * TAU
			for r: float in [0.0, 24.0, 48.0]:
				if h_at(x + cos(a) * r, y + sin(a) * r) < -1.5:
					w += 1
		return w

	var blots: Array[Vector4] = []
	var blot_a: PackedFloat32Array = []
	var fibres := PackedVector2Array()
	var specks: Array[Vector4] = []
	var _paper: Texture2D
	var _vignette: Texture2D

	func _parchment_plan() -> void:
		for i in 70:
			blots.append(Vector4(rnd.next() * S, rnd.next() * S, 10.0 + rnd.next() * 60.0, 0.0))
			blot_a.append(0.03 + rnd.next() * 0.06)
		for i in 1500:
			var x := rnd.next() * S
			var y := rnd.next() * S
			var a := (rnd.next() - 0.5) * 0.9
			var l := 2.0 + rnd.next() * 7.0
			fibres.append(Vector2(x, y))
			fibres.append(Vector2(x + cos(a) * l, y + sin(a) * l))
		for i in 30:
			var al := 0.06 + rnd.next() * 0.12
			specks.append(Vector4(rnd.next() * S, rnd.next() * S, 0.6 + rnd.next() * 2.2, al))

	func _draw() -> void:
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(Q, Q))
		# ---- parchment: warm, blotched, fibrous
		# (the textures are kept: a canvas only holds on to what's still alive when it draws)
		_paper = TreasureMapArt.radial([Color("#f3e4bf"), Color("#f3e4bf"), Color("#e6cf9c"), Color("#b89159")], [0.0, 0.1 / 0.78, 0.6, 1.0], Vector2(0.47, 0.47), 0.78 * 2.0)
		draw_texture_rect(_paper, Rect2(0, 0, S, S), false)
		var spot := TreasureMapArt.spot()
		for i in blots.size():
			var b := blots[i]
			draw_texture_rect(spot, Rect2(b.x - b.z, b.y - b.z, b.z * 2.0, b.z * 2.0), false, Color(130.0 / 255.0, 86.0 / 255.0, 34.0 / 255.0, blot_a[i]))
		draw_multiline(fibres, Color(120.0 / 255.0, 82.0 / 255.0, 36.0 / 255.0, 0.07), 0.6, true)
		for s in specks:
			draw_circle(Vector2(s.x, s.y), s.z, Color(150.0 / 255.0, 92.0 / 255.0, 38.0 / 255.0, s.w), true, -1.0, true)
		# ---- rhumb lines out of the rose, as on a sailing master's chart
		for k in 16:
			var a := k / 16.0 * TAU
			var col := Color(120.0 / 255.0, 66.0 / 255.0, 30.0 / 255.0, 0.2) if k % 4 == 0 else Color(120.0 / 255.0, 66.0 / 255.0, 30.0 / 255.0, 0.13) if k % 2 == 0 else Color(150.0 / 255.0, 50.0 / 255.0, 40.0 / 255.0, 0.1)
			draw_line(rose_at + Vector2(cos(a), sin(a)) * 40.0, rose_at + Vector2(cos(a), sin(a)) * 900.0, col, 0.7, true)
		# ---- the watercolour
		draw_texture_rect(wash, Rect2(0, 0, S, S), false)
		# ---- ink: water-lines echoing the coast, the coast itself, the hills' contours
		for wl: Vector2 in [Vector2(-0.7, 0.5), Vector2(-1.7, 0.36), Vector2(-2.9, 0.26), Vector2(-4.4, 0.18), Vector2(-6.4, 0.12)]:
			_segs(_contour(wl.x), Color(44.0 / 255.0, 72.0 / 255.0, 70.0 / 255.0, wl.y), 0.85)
		for lv: float in [5.0, 10.0, 15.0, 20.0, 26.0]:
			_segs(_contour(lv), Color(112.0 / 255.0, 72.0 / 255.0, 32.0 / 255.0, 0.3), 0.8)
		# beach stipple
		for k in 900:
			var x := rnd.next() * S
			var y := rnd.next() * S
			var h := h_at(x, y)
			if h <= 0.05 or h > 1.1:
				continue
			draw_rect(Rect2(x, y, 0.9, 0.9), Color(100.0 / 255.0, 66.0 / 255.0, 30.0 / 255.0, 0.42))
		var coast := _contour(0.0)
		_segs(coast, Color(70.0 / 255.0, 40.0 / 255.0, 14.0 / 255.0, 0.16), 4.5)
		_segs(coast, Color(50.0 / 255.0, 28.0 / 255.0, 10.0 / 255.0, 0.9), 1.8)
		# ---- the sea: little ink waves
		for k in 90:
			var x := rnd.next() * S
			var y := rnd.next() * S
			if h_at(x, y) > -4.5 or h_at(x + 14.0, y) > -4.5 or h_at(x - 14.0, y) > -4.5 or Vector2(x - rose_at.x, y - rose_at.y).length() < 52.0:
				continue
			var w := TreasureMapArt.quad(Vector2(x - 6, y), Vector2(x - 3, y - 3.5), Vector2(x, y), 6)
			w.append_array(TreasureMapArt.quad(Vector2(x, y), Vector2(x + 3, y - 3.5), Vector2(x + 6, y), 6).slice(1))
			draw_polyline(w, Color(54.0 / 255.0, 40.0 / 255.0, 20.0 / 255.0, 0.5), 1.1, true)
		# ---- hills: shaded humps on the high ground
		for q in hills:
			var x := q.x
			var y := q.y
			var w := 16.0 + minf(16.0, q.z * 0.55)
			var hh := w * 0.55
			var hump := TreasureMapArt.cubic(Vector2(x - w / 2.0, y), Vector2(x - w * 0.3, y - hh * 0.9), Vector2(x - w * 0.1, y - hh * 1.25), Vector2(x + w * 0.05, y - hh), 10)
			hump.append_array(TreasureMapArt.cubic(Vector2(x + w * 0.05, y - hh), Vector2(x + w * 0.2, y - hh * 0.8), Vector2(x + w * 0.35, y - hh * 0.5), Vector2(x + w / 2.0, y), 10).slice(1))
			draw_colored_polygon(hump, Color(228.0 / 255.0, 208.0 / 255.0, 158.0 / 255.0, 0.85))
			draw_polyline(hump, Color(56.0 / 255.0, 34.0 / 255.0, 12.0 / 255.0, 0.85), 1.3, true)
			var lee := PackedVector2Array()
			for s in 5:
				var t := 0.25 + s * 0.15
				var px := x + w * 0.05 + w * 0.45 * t
				var py := y - hh * (1.0 - t) * 0.95
				lee.append(Vector2(px, py + 1.0))
				lee.append(Vector2(px - 2.5, minf(y - 1.0, py + hh * 0.45)))
			draw_multiline(lee, Color(56.0 / 255.0, 34.0 / 255.0, 12.0 / 255.0, 0.85), 0.8, true)
		# ---- palms on the low ground (none on the X)
		for k in 170:
			var x := rnd.next() * S
			var y := rnd.next() * S
			var h := h_at(x, y)
			if h < 0.9 or h > 8.5 or Vector2(x - xx, y - xy).length() < 24.0:
				continue
			var near := false
			for q in hills:
				if Vector2(q.x - x, q.y - y).length() < 18.0:
					near = true
					break
			if near:
				continue
			_palm(x, y, 0.85 + rnd.next() * 0.45, -1.0 if rnd.next() < 0.5 else 1.0)
		if best.x >= 0.0:
			_trail()
		_x_mark()
		# ---- the ornaments: compass rose, a sea serpent, a scale of paces
		_compass(rose_at, 40.0)
		if beast.x >= 0.0:
			_serpent(beast + Vector2(0, 10))
		_scale_bar(Vector2(S - 150.0 if rose_k == 0 else 44.0, S - 40.0))
		_ribbon(name_, Vector2(S / 2.0, 50.0))
		_age()

	## Contour segments through the samples at `level` (marching squares), in sheet units.
	func _contour(level: float) -> PackedVector2Array:
		var out := PackedVector2Array()
		for j in N - 1:
			for i in N - 1:
				var a := hs[j * N + i]
				var b := hs[j * N + i + 1]
				var c := hs[(j + 1) * N + i + 1]
				var d := hs[(j + 1) * N + i]
				var idx := (8 if a > level else 0) | (4 if b > level else 0) | (2 if c > level else 0) | (1 if d > level else 0)
				if idx == 0 or idx == 15:
					continue
				var T := Vector2((i + (level - a) / (b - a)) * cell, j * cell) if b != a else Vector2.ZERO
				var R := Vector2((i + 1) * cell, (j + (level - b) / (c - b)) * cell) if c != b else Vector2.ZERO
				var B := Vector2((i + (level - d) / (c - d)) * cell, (j + 1) * cell) if c != d else Vector2.ZERO
				var L := Vector2(i * cell, (j + (level - a) / (d - a)) * cell) if d != a else Vector2.ZERO
				match idx:
					1, 14:
						out.append_array(PackedVector2Array([L, B]))
					2, 13:
						out.append_array(PackedVector2Array([B, R]))
					3, 12:
						out.append_array(PackedVector2Array([L, R]))
					4, 11:
						out.append_array(PackedVector2Array([T, R]))
					6, 9:
						out.append_array(PackedVector2Array([T, B]))
					7, 8:
						out.append_array(PackedVector2Array([L, T]))
					5:
						out.append_array(PackedVector2Array([L, T, B, R]))
					10:
						out.append_array(PackedVector2Array([T, R, L, B]))
		return out

	## Ink along contour segments, with a hand's tremble (smooth, so the segments still meet).
	func _segs(segs: PackedVector2Array, col: Color, w: float) -> void:
		if segs.is_empty():
			return
		var o := PackedVector2Array()
		o.resize(segs.size())
		for k in segs.size():
			var p := segs[k]
			o[k] = Vector2(p.x + sin(p.y * 0.09 + p.x * 0.031) * 0.8, p.y + cos(p.x * 0.083 - p.y * 0.027) * 0.8)
		draw_multiline(o, col, w, true)

	func _palm(x: float, y: float, s: float, lean: float) -> void:
		draw_set_transform(Vector2(x, y) * Q, 0.0, Vector2(s, s) * Q)
		TreasureMapArt.ellipse(self, Vector2(1.5, 6.5), Vector2(4.5, 1.4), 0.0, Color(70.0 / 255.0, 50.0 / 255.0, 20.0 / 255.0, 0.16))
		draw_polyline(TreasureMapArt.quad(Vector2(0, 6.5), Vector2(lean * 2.4, 2), Vector2(lean * 1.4, -3), 8), Color(46.0 / 255.0, 34.0 / 255.0, 14.0 / 255.0, 0.85), 1.2, true)
		var t := Vector2(lean * 1.4, -3.0)
		for a: float in [-2.5, -1.7, -0.75, 0.75, 1.7, 2.5]:
			var e := Vector2(t.x + sin(a) * 6.0, t.y - cos(a) * 3.5 + absf(sin(a)) * 3.0)
			var leaf := TreasureMapArt.quad(t, Vector2(t.x + sin(a) * 3.6, t.y - cos(a) * 4.0 - 1.2), e, 6)
			leaf.append_array(TreasureMapArt.quad(e, Vector2(t.x + sin(a) * 2.6, t.y - cos(a) * 2.2), t, 6).slice(1))
			TreasureMapArt.fill(self, leaf, Color(90.0 / 255.0, 104.0 / 255.0, 52.0 / 255.0, 0.55))
			leaf.append(leaf[0])
			draw_polyline(leaf, Color(46.0 / 255.0, 34.0 / 255.0, 14.0 / 255.0, 0.85), 0.95, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(Q, Q))

	## The way in: dashes like footsteps from the beach to the X, an anchor
	## where the boat comes in, and "so many paces" along it.
	func _trail() -> void:
		var b := best
		var mid := Vector2((b.x + xx) / 2.0 + (rnd.next() - 0.5) * 40.0, (b.y + xy) / 2.0 + (rnd.next() - 0.5) * 40.0)
		var x := Vector2(xx, xy)
		var at := func(t: float) -> Vector2: return b * (1.0 - t) * (1.0 - t) + mid * 2.0 * (1.0 - t) * t + x * t * t
		var pts: Array[Vector3] = []
		var len := 0.0
		var prev: Vector2 = at.call(0.0)
		pts.append(Vector3(prev.x, prev.y, 0.0))
		for s in range(1, 81):
			var p: Vector2 = at.call(s / 80.0)
			len += p.distance_to(prev)
			pts.append(Vector3(p.x, p.y, len))
			prev = p
		var dash := PackedVector2Array()
		var d := 0.0
		var k0 := 0
		while d < len - 16.0:
			while k0 < pts.size() - 1 and pts[k0].z < d:
				k0 += 1
			var k1 := k0
			while k1 < pts.size() - 1 and pts[k1].z < d + 4.0:
				k1 += 1
			dash.append(Vector2(pts[k0].x, pts[k0].y))
			dash.append(Vector2(pts[k1].x, pts[k1].y))
			d += 9.0
		if not dash.is_empty():
			draw_multiline(dash, Color(64.0 / 255.0, 36.0 / 255.0, 14.0 / 255.0, 0.85), 1.8, true)
		var away := (b - x) / maxf(1.0, b.distance_to(x))
		_anchor(b + away * 14.0)
		if len > 64.0:
			var m: Vector2 = at.call(0.5)
			var d2: Vector2 = at.call(0.56)
			var ang := atan2(d2.y - m.y, d2.x - m.x)
			if ang > PI / 2.0:
				ang -= PI
			if ang < -PI / 2.0:
				ang += PI
			var f := HudStyle.font("serif-italic", 600)
			var label := "%d paces" % paces
			var w := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			draw_set_transform(m * Q, ang, Vector2(Q, Q))
			draw_string_outline(f, Vector2(-w / 2.0, -7.0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, 3, Color(240.0 / 255.0, 224.0 / 255.0, 180.0 / 255.0, 0.8))
			draw_string(f, Vector2(-w / 2.0, -7.0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(60.0 / 255.0, 34.0 / 255.0, 12.0 / 255.0, 0.9))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2(Q, Q))

	func _anchor(at: Vector2) -> void:
		var ink := Color(52.0 / 255.0, 30.0 / 255.0, 12.0 / 255.0, 0.85)
		draw_arc(at + Vector2(0, -6), 1.8, 0.0, TAU, 12, ink, 1.3, true)
		draw_line(at + Vector2(0, -4.2), at + Vector2(0, 5), ink, 1.3, true)
		draw_line(at + Vector2(-3, -2), at + Vector2(3, -2), ink, 1.3, true)
		var arm := TreasureMapArt.quad(at + Vector2(-5, 1.5), at + Vector2(-4, 5.5), at + Vector2(0, 5.5), 6)
		arm.append_array(TreasureMapArt.quad(at + Vector2(0, 5.5), at + Vector2(4, 5.5), at + Vector2(5, 1.5), 6).slice(1))
		draw_polyline(arm, ink, 1.3, true)

	## The X, in red ink, ringed, with a drip or two.
	func _x_mark() -> void:
		var x := Vector2(xx, xy)
		var ring := PackedVector2Array()
		for i in 41:
			var a := 0.3 + (TAU - 0.2) * i / 40.0
			ring.append(x + Vector2(cos(a) * 19.0, sin(a) * 16.0).rotated(-0.3))
		draw_polyline(ring, Color(150.0 / 255.0, 30.0 / 255.0, 20.0 / 255.0, 0.75), 1.4, true)
		for s: Array in [[Vector2(-10, -11), Vector2(11, 10)], [Vector2(10, -11), Vector2(-11, 11)]]:
			var a: Vector2 = s[0]
			var b: Vector2 = s[1]
			var st := TreasureMapArt.quad(x + a, x + (a + b) / 2.0 + Vector2(1.5, -1), x + b, 10)
			draw_polyline(st, Color("#9b2015"), 6.0, true)
			draw_circle(x + a, 3.0, Color("#9b2015"), true, -1.0, true)
			draw_circle(x + b, 3.0, Color("#9b2015"), true, -1.0, true)
			draw_polyline(TreasureMapArt.quad(x + a + Vector2(1, 1), x + (a + b) / 2.0 + Vector2(2, 0), x + b + Vector2(0.5, 1), 10), Color("#6e120b"), 2.0, true)
		var drip := Color("#8c1b12")
		draw_rect(Rect2(x + Vector2(10.2, 10), Vector2(1.6, 5)), drip)
		draw_circle(x + Vector2(11, 15.5), 1.4, drip, true, -1.0, true)
		draw_rect(Rect2(x + Vector2(-12, 11), Vector2(1.4, 3)), drip)

	func _compass(at: Vector2, r: float) -> void:
		var ink := Color(56.0 / 255.0, 32.0 / 255.0, 12.0 / 255.0, 0.85)
		draw_arc(at, r * 0.72, 0.0, TAU, 64, ink, 1.0, true)
		draw_arc(at, r * 0.8, 0.0, TAU, 64, ink, 1.0, true)
		var ticks := PackedVector2Array()
		for k in 32:
			var a := k / 32.0 * TAU
			var r0 := r * (0.64 if k % 4 == 0 else 0.69)
			ticks.append(at + Vector2(cos(a), sin(a)) * r0)
			ticks.append(at + Vector2(cos(a), sin(a)) * r * 0.72)
		draw_multiline(ticks, ink, 1.0, true)
		# eight points: the long ones north, east, south and west, each half in shadow
		for long: bool in [false, true]:
			for k in 4:
				var a := k / 4.0 * TAU + (0.0 if long else PI / 4.0)
				var L := r if long else r * 0.6
				var w := r * 0.15 if long else r * 0.12
				var tip := at + Vector2(0, -L).rotated(a)
				var o := at
				var right := at + Vector2(w, -w).rotated(a)
				var left := at + Vector2(-w, -w).rotated(a)
				draw_colored_polygon(PackedVector2Array([tip, right, o]), Color(150.0 / 255.0, 32.0 / 255.0, 22.0 / 255.0, 0.9) if long and k == 0 else ink)
				var half := PackedVector2Array([tip, left, o])
				draw_colored_polygon(half, Color(244.0 / 255.0, 230.0 / 255.0, 196.0 / 255.0, 0.95))
				half.append(tip)
				draw_polyline(half, ink, 0.9, true)
		draw_circle(at, 2.2, ink, true, -1.0, true)
		var f := HudStyle.font("cinzel", 700)
		var nw := f.get_string_size("N", HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
		draw_string(f, at + Vector2(-nw / 2.0, -r - 5.0), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, ink)

	## Here be serpents: a coiled back breaking the swell, ink on the open sea.
	func _serpent(at: Vector2) -> void:
		var flip := -1.0 if rnd.next() < 0.5 else 1.0
		draw_set_transform(at * Q, 0.0, Vector2(flip, 1.0) * Q)
		var dark := Color(48.0 / 255.0, 30.0 / 255.0, 12.0 / 255.0, 0.85)
		var green := Color(122.0 / 255.0, 140.0 / 255.0, 98.0 / 255.0, 0.9)
		var tubes: Array[PackedVector2Array] = []
		for hr: Vector2 in [Vector2(-10, 7), Vector2(8, 8), Vector2(26, 6)]:
			var arc := PackedVector2Array()
			for i in 13:
				var a := PI + PI * i / 12.0
				arc.append(Vector2(hr.x + cos(a) * hr.y, sin(a) * hr.y))
			tubes.append(arc)
		var tail := TreasureMapArt.quad(Vector2(32, 0), Vector2(40, -9), Vector2(44, -4), 8)
		tail.append_array(TreasureMapArt.quad(Vector2(44, -4), Vector2(46, 0), Vector2(42, -1), 5).slice(1))
		tubes.append(tail)
		tubes.append(TreasureMapArt.quad(Vector2(-17, 0), Vector2(-22, -14), Vector2(-30, -15), 8))
		for t in tubes:
			draw_polyline(t, dark, 4.2, true)
		for t in tubes:
			draw_polyline(t, green, 2.0, true)
		TreasureMapArt.ellipse(self, Vector2(-32, -15.5), Vector2(5.2, 3.2), -0.2, Color(122.0 / 255.0, 140.0 / 255.0, 98.0 / 255.0, 0.95), Color(48.0 / 255.0, 30.0 / 255.0, 12.0 / 255.0, 0.9), 1.1)
		draw_circle(Vector2(-33, -16.5), 0.9, Color(48.0 / 255.0, 30.0 / 255.0, 12.0 / 255.0, 0.95), true, -1.0, true)
		draw_multiline(PackedVector2Array([Vector2(-37, -15), Vector2(-41, -14), Vector2(-41, -14), Vector2(-43, -15.5), Vector2(-41, -14), Vector2(-43, -12.5)]), Color(150.0 / 255.0, 32.0 / 255.0, 22.0 / 255.0, 0.85), 0.8, true)
		for fx: float in [-10.0, 8.0, 26.0]:
			draw_colored_polygon(PackedVector2Array([Vector2(fx - 2, -6.5), Vector2(fx, -11), Vector2(fx + 2, -6.5)]), Color(48.0 / 255.0, 30.0 / 255.0, 12.0 / 255.0, 0.8))
		for wx: float in [-24.0, -1.0, 17.0, 35.0]:
			draw_polyline(TreasureMapArt.quad(Vector2(wx - 4, 2), Vector2(wx, 4.5), Vector2(wx + 4, 2), 6), Color(44.0 / 255.0, 72.0 / 255.0, 70.0 / 255.0, 0.55), 1.0, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(Q, Q))

	func _scale_bar(at: Vector2) -> void:
		var per := S / span * 0.8
		var p := 200
		for q: int in [25, 50, 100, 200]:
			if q * per >= 60.0:
				p = q
				break
		var w := p * per
		var ink := Color(56.0 / 255.0, 32.0 / 255.0, 12.0 / 255.0, 0.8)
		draw_rect(Rect2(at, Vector2(w, 4)), ink, false, 0.9)
		for k in [0, 2]:
			draw_rect(Rect2(at + Vector2(k * w / 4.0, 0), Vector2(w / 4.0, 4)), Color(56.0 / 255.0, 32.0 / 255.0, 12.0 / 255.0, 0.75))
		var f := HudStyle.font("serif-italic", 600)
		var label := "%d paces" % p
		var lw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
		draw_string(f, at + Vector2(w / 2.0 - lw / 2.0, 18), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(56.0 / 255.0, 32.0 / 255.0, 12.0 / 255.0, 0.85))

	## A furled ribbon with the isle's name on it.
	func _ribbon(text: String, at: Vector2) -> void:
		var f := HudStyle.font("cinzel", 700)
		var fs := 23
		var tw := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		while tw > 330.0 and fs > 13:
			fs -= 1
			tw = f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var w := tw + 56.0
		var h := 32.0
		var l := at.x - w / 2.0
		var r := at.x + w / 2.0
		var y := at.y
		var sag := 6.0
		var edge := Color(56.0 / 255.0, 32.0 / 255.0, 12.0 / 255.0, 0.85)
		for s: float in [-1.0, 1.0]:
			var ex := l if s < 0.0 else r
			var tail := PackedVector2Array([Vector2(ex - s * 8, y - h / 2 + 8), Vector2(ex + s * 22, y - h / 2 + 8), Vector2(ex + s * 13, y + 8), Vector2(ex + s * 22, y + h / 2 + 8), Vector2(ex - s * 8, y + h / 2 + 8)])
			draw_colored_polygon(tail, Color("#c9ab70"))
			tail.append(tail[0])
			draw_polyline(tail, edge, 1.1, true)
		var band := TreasureMapArt.quad(Vector2(l, y - h / 2), Vector2(at.x, y - h / 2 + sag * 2), Vector2(r, y - h / 2), 16)
		band.append_array(TreasureMapArt.quad(Vector2(r, y + h / 2), Vector2(at.x, y + h / 2 + sag * 2), Vector2(l, y + h / 2), 16))
		var cols := PackedColorArray()
		for p in band:
			cols.append(Color("#f3e3bb").lerp(Color("#d9bc82"), clampf((p.y - (y - h / 2)) / (h + sag), 0.0, 1.0)))
		draw_polygon(band, cols)
		band.append(band[0])
		draw_polyline(band, edge, 1.1, true)
		var asc := f.get_ascent(fs)
		var dsc := f.get_descent(fs)
		draw_string(f, Vector2(at.x - tw / 2.0, y + sag * 0.9 + 1.0 + (asc - dsc) / 2.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(56.0 / 255.0, 32.0 / 255.0, 12.0 / 255.0, 0.9))
		var it := HudStyle.font("serif-italic", 500)
		var sub := "Here lies the plunder"
		var sw := it.get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
		var sp := Vector2(at.x - sw / 2.0, y + h / 2 + sag + 17.0)
		draw_string_outline(it, sp, sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, 4, Color(240.0 / 255.0, 225.0 / 255.0, 186.0 / 255.0, 0.85))
		draw_string(it, sp, sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(70.0 / 255.0, 40.0 / 255.0, 14.0 / 255.0, 0.9))

	## Age: a coffee ring, a fold, darkened edges.
	func _age() -> void:
		var rx := 110.0 + rnd.next() * (S - 220.0)
		var ry := 110.0 + rnd.next() * (S - 220.0)
		var rr := 30.0 + rnd.next() * 14.0
		for k in 4:
			var al := 0.05 + rnd.next() * 0.06
			var w := 1.0 + rnd.next() * 2.5
			var c := Vector2(rx + (rnd.next() - 0.5) * 2.0, ry + (rnd.next() - 0.5) * 2.0)
			var r := rr + (rnd.next() - 0.5) * 3.0
			var a0 := rnd.next() * 6.0
			var a1 := rnd.next() * 6.0 + 4.0 + rnd.next() * 2.0
			draw_arc(c, r, a0, maxf(a0 + 0.1, a1), 48, Color(120.0 / 255.0, 70.0 / 255.0, 24.0 / 255.0, al), w, true)
		var fy := S * 0.5 + (rnd.next() - 0.5) * 30.0
		draw_line(Vector2(0, fy), Vector2(S, fy + 3), Color(1.0, 248.0 / 255.0, 228.0 / 255.0, 0.3), 1.0, true)
		draw_line(Vector2(0, fy + 1.4), Vector2(S, fy + 4.4), Color(96.0 / 255.0, 62.0 / 255.0, 26.0 / 255.0, 0.16), 1.0, true)
		var brown := Color(90.0 / 255.0, 52.0 / 255.0, 16.0 / 255.0)
		_vignette = TreasureMapArt.radial([Color(brown, 0.0), Color(brown, 0.0), Color(brown, 0.42)], [0.0, 0.36 / 0.74, 1.0], Vector2(0.5, 0.5), 0.74 * 2.0)
		draw_texture_rect(_vignette, Rect2(0, 0, S, S), false)
		var edge := TreasureMapArt.edge()
		var e := Color(78.0 / 255.0, 42.0 / 255.0, 12.0 / 255.0, 0.4)
		draw_texture_rect(edge, Rect2(0, 0, 26, S), false, e)
		draw_set_transform(Vector2(S, S) * Q, PI, Vector2(Q, Q))
		draw_texture_rect(edge, Rect2(0, 0, 26, S), false, e)
		draw_set_transform(Vector2(S, 0) * Q, PI / 2.0, Vector2(Q, Q))
		draw_texture_rect(edge, Rect2(0, 0, 26, S), false, e)
		draw_set_transform(Vector2(0, S) * Q, -PI / 2.0, Vector2(Q, Q))
		draw_texture_rect(edge, Rect2(0, 0, 26, S), false, e)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(Q, Q))


# ------------------------------------------------------------------ drawing helpers

## A radial gradient over a square, its centre at `c` (shares), reaching `r`
## shares of the side to its last stop.
static func radial(colors: Array, offsets: Array, c: Vector2, r: float) -> Texture2D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array(offsets)
	g.colors = PackedColorArray(colors)
	# (drawn into an image here: a gradient texture fills itself in later)
	var n := 128
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var rad := r * 0.5
	for j in n:
		for i in n:
			var d := Vector2((i + 0.5) / n - c.x, (j + 0.5) / n - c.y).length() / rad
			img.set_pixel(i, j, g.sample(clampf(d, 0.0, 1.0)))
	return ImageTexture.create_from_image(img)


static var _spot: Texture2D
static var _edge: Texture2D


## A soft round blot, white at its heart to clear at its rim (tinted where it's drawn).
static func spot() -> Texture2D:
	if _spot == null:
		_spot = radial([Color.WHITE, Color(1, 1, 1, 0)], [0.0, 1.0], Vector2(0.5, 0.5), 1.0)
	return _spot


## Dark along one edge to clear inward (tinted where it's drawn).
static func edge() -> Texture2D:
	if _edge == null:
		var img := Image.create(32, 2, false, Image.FORMAT_RGBA8)
		for i in 32:
			for j in 2:
				img.set_pixel(i, j, Color(1, 1, 1, 1.0 - (i + 0.5) / 32.0))
		_edge = ImageTexture.create_from_image(img)
	return _edge


## A quadratic curve from a over b to c, in n steps.
static func quad(a: Vector2, b: Vector2, c: Vector2, n: int) -> PackedVector2Array:
	var o := PackedVector2Array()
	for i in n + 1:
		var t := float(i) / n
		o.append(a * (1.0 - t) * (1.0 - t) + b * 2.0 * (1.0 - t) * t + c * t * t)
	return o


## A cubic curve from a over b and c to d, in n steps.
static func cubic(a: Vector2, b: Vector2, c: Vector2, d: Vector2, n: int) -> PackedVector2Array:
	var o := PackedVector2Array()
	for i in n + 1:
		var t := float(i) / n
		var u := 1.0 - t
		o.append(a * u * u * u + b * 3.0 * u * u * t + c * 3.0 * u * t * t + d * t * t * t)
	return o


## A filled ellipse (radii r, turned by `rot`), with an optional edge.
static func ellipse(ci: CanvasItem, at: Vector2, r: Vector2, rot: float, fill: Color, line := Color(0, 0, 0, 0), w := 0.0) -> void:
	var pts := PackedVector2Array()
	for i in 24:
		var a := TAU * i / 24.0
		pts.append(at + Vector2(cos(a) * r.x, sin(a) * r.y).rotated(rot))
	ci.draw_colored_polygon(pts, fill)
	if w > 0.0:
		pts.append(pts[0])
		ci.draw_polyline(pts, line, w, true)


## A filled shape that may fold over itself (a palm frond's two curves): fans
## it out from its first point rather than trusting a triangulation.
static func fill(ci: CanvasItem, pts: PackedVector2Array, col: Color) -> void:
	if Geometry2D.triangulate_polygon(pts).is_empty():
		for i in range(1, pts.size() - 1):
			ci.draw_colored_polygon(PackedVector2Array([pts[0], pts[i], pts[i + 1]]), col)
		return
	ci.draw_colored_polygon(pts, col)
