class_name MapMarks
## The marks the minimap and the sea chart share, as the web draws them
## (src/ui/chart.ts portMark and pinMark, and the ships' arrowheads): a
## trading port's gilt medallion with its pair of scales, a waypoint's
## glowing teardrop pin with its number, a ship's arrowhead, and the soft
## glow a canvas shadow lays under them. Drawn into any canvas item, in its
## own pixels.

## The waypoints' colours, by hue (the web's PIN_COLORS).
const PIN: Array[Color] = [Color("#ffd27a"), Color("#7ff0e6"), Color("#ff97b8"), Color("#bba6ff"), Color("#b8f27c")]
## Plunder afloat by its tier, as the maps dot it (the web's RARITY).
const LOOT: Array[Color] = [Color("#e8d3a0"), Color("#7fe08e"), Color("#6cc8ff"), Color("#c48bff"), Color("#ffb52e")]
const GILT := Color("#f4c255")
const GILT_EDGE := Color(40.0 / 255.0, 22.0 / 255.0, 6.0 / 255.0, 0.85)
const GILT_GLOW := Color(1.0, 196.0 / 255.0, 80.0 / 255.0, 0.8)
const SCALES := Color("#4a2a0c")
const PIN_EDGE := Color(20.0 / 255.0, 14.0 / 255.0, 6.0 / 255.0, 0.75)
const PIN_INK := Color(20.0 / 255.0, 14.0 / 255.0, 6.0 / 255.0, 0.82)

## Soft discs for glows, by how much of their radius is blur (in twentieths).
static var _glows := {}
## A waypoint's teardrop outline for a pin of radius 1, its point at the origin.
static var _tear := PackedVector2Array()


## The glow a canvas shadow (blur `blur`) lays round a disc of radius `r` at `at`.
static func glow(ci: CanvasItem, at: Vector2, r: float, blur: float, color: Color) -> void:
	var out := r + blur
	if out <= 0.0 or color.a <= 0.0:
		return
	var q := clampi(roundi(blur / out * 20.0), 1, 20)
	ci.draw_texture_rect(_glow_tex(q), Rect2(at - Vector2(out, out), Vector2(out, out) * 2.0), false, color)


static func _glow_tex(q: int) -> Texture2D:
	if _glows.has(q):
		return _glows[q]
	const N := 64
	var img := Image.create(N, N, false, Image.FORMAT_LA8)
	var b := q / 20.0
	for j in N:
		for i in N:
			var t := Vector2(i + 0.5 - N * 0.5, j + 0.5 - N * 0.5).length() / (N * 0.5)
			img.set_pixel(i, j, Color(1.0, 1.0, 1.0, 1.0 - smoothstep(-b, b, t - (1.0 - b))))
	var tex := ImageTexture.create_from_image(img)
	_glows[q] = tex
	return tex


## A ship's arrowhead, `size` long from its middle to its bow, turned to her
## `heading` (north up: forward is +z down the canvas), with a dark edge.
static func ship(ci: CanvasItem, at: Vector2, heading: float, color: Color, size: float, edge := 2.0, edge_color := Color(0.0, 0.0, 0.0, 0.5)) -> void:
	var a := PI - heading
	var pts := PackedVector2Array([Vector2(0.0, -size), Vector2(size * 0.62, size * 0.8), Vector2(0.0, size * 0.45), Vector2(-size * 0.62, size * 0.8)])
	for i in pts.size():
		pts[i] = at + pts[i].rotated(a)
	ci.draw_colored_polygon(pts, color)
	pts.append(pts[0])
	ci.draw_polyline(pts, edge_color, edge, true)


## A trading port: a gilt disc of radius `r`, softly glowing, with a pair of
## scales inked on it (`alpha` fades the whole mark).
static func port(ci: CanvasItem, at: Vector2, r: float, alpha := 1.0) -> void:
	glow(ci, at, r, r, Color(GILT_GLOW, GILT_GLOW.a * alpha))
	ci.draw_circle(at, r, Color(GILT, alpha), true, -1.0, true)
	ci.draw_circle(at, r, Color(GILT_EDGE, GILT_EDGE.a * alpha), false, maxf(1.5, r * 0.2), true)
	var k := r / 10.0
	var ink := Color(SCALES, alpha)
	var w := 1.6 * k
	# the post, its foot and the beam
	ci.draw_line(at + Vector2(0.0, -5.5) * k, at + Vector2(0.0, 5.5) * k, ink, w, true)
	ci.draw_line(at + Vector2(-4.0, 5.5) * k, at + Vector2(4.0, 5.5) * k, ink, w, true)
	ci.draw_line(at + Vector2(-5.5, -3.5) * k, at + Vector2(5.5, -3.5) * k, ink, w, true)
	# and the two pans hung off it
	for s: float in [-1.0, 1.0]:
		var pan := PackedVector2Array([at + Vector2(s * 5.5 - 3.0, 0.5) * k, at + Vector2(s * 5.5 + 3.0, 0.5) * k, at + Vector2(s * 5.5, -3.5) * k])
		ci.draw_colored_polygon(pan, ink)


## A waypoint: a glowing teardrop pin `r` across standing on its spot, its
## number (or a dot) in dark ink on its head.
static func pin(ci: CanvasItem, at: Vector2, r: float, color: Color, label: String, font: Font, alpha := 1.0) -> void:
	if _tear.is_empty():
		_tear = _teardrop()
	var tint := Color(color, color.a * alpha)
	# the spot itself, a soft glowing dot under the pin
	glow(ci, at, r * 0.38, r * 1.4, Color(color, 0.55 * alpha))
	ci.draw_set_transform(at, 0.0, Vector2(1.0, 0.2 / 0.38))
	ci.draw_circle(Vector2.ZERO, r * 0.38, tint, true, -1.0, true)
	ci.draw_set_transform(Vector2.ZERO)
	# the teardrop head standing above it
	var hy := -r * 1.55
	glow(ci, at + Vector2(0.0, hy), r * 0.82, r * 1.4, Color(color, 0.55 * alpha))
	var pts := PackedVector2Array()
	pts.resize(_tear.size())
	for i in _tear.size():
		pts[i] = at + _tear[i] * r
	ci.draw_colored_polygon(pts, tint)
	pts.append(pts[0])
	ci.draw_polyline(pts, Color(PIN_EDGE, PIN_EDGE.a * alpha), maxf(1.2, r * 0.16), true)
	var ink := Color(PIN_INK, PIN_INK.a * alpha)
	if label == "":
		ci.draw_circle(at + Vector2(0.0, hy), r * 0.3, ink, true, -1.0, true)
		return
	var sz := roundi(r * 1.05)
	var head := at + Vector2(0.0, hy + r * 0.05)
	ci.draw_string(font, Vector2(head.x - font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x * 0.5, head.y + middle(font, sz)), label, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, ink)


## The helmsman's course (the web's drawRoute), through `pts` on the canvas:
## a broad faint underlay, gold dashes flowing on ahead of her (`time` in
## seconds) in a soft glow, and her goal ringed and dotted; `s` scales it all
## (the chart draws it in its CSS pixels, the minimap half as big again).
## Dashes reaching outside `clip` are left out.
static func route(ci: CanvasItem, pts: PackedVector2Array, time: float, s: float, clip: Rect2) -> void:
	if pts.size() < 2:
		return
	# the underlay: one shape (round-capped and round-jointed), so its faint gold never doubles up
	for poly in Geometry2D.offset_polyline(pts, 3.5 * s, Geometry2D.JOIN_ROUND, Geometry2D.END_ROUND):
		if not Geometry2D.is_polygon_clockwise(poly):
			ci.draw_colored_polygon(poly, Color(1.0, 206.0 / 255.0, 110.0 / 255.0, 0.2))
	# the dashes flowing on ahead, in a glow (the canvas shadow, as two soft broader strokes under them)
	var off := -time * 26.0 * s
	var wide := dashes(pts, 9.0 * s, 7.0 * s, off, 2.5 * s, clip)
	if not wide.is_empty():
		ci.draw_multiline(wide, Color(1.0, 200.0 / 255.0, 90.0 / 255.0, 0.1), 9.4 * s, true)
		ci.draw_multiline(dashes(pts, 9.0 * s, 7.0 * s, off, 1.75 * s, clip), Color(1.0, 200.0 / 255.0, 90.0 / 255.0, 0.14), 5.9 * s, true)
		ci.draw_multiline(dashes(pts, 9.0 * s, 7.0 * s, off, 1.2 * s, clip), Color("#ffdc8c"), 2.4 * s, true)
	# her goal: a ring spreading off it, and a gold dot
	var end := pts[pts.size() - 1]
	var ring := fposmod(time * 0.7, 1.0)
	ci.draw_arc(end, (5.0 + ring * 14.0) * s, 0.0, TAU, 48, Color(1.0, 220.0 / 255.0, 140.0 / 255.0, 0.8 * (1.0 - ring)), 2.0 * s, true)
	ci.draw_circle(end, 4.0 * s, Color("#ffe3a0"), true, -1.0, true)
	ci.draw_circle(end, 4.0 * s, Color(40.0 / 255.0, 26.0 / 255.0, 4.0 / 255.0, 0.8), false, 1.5 * s, true)


## How far below a line's middle its baseline sits, for text set on its
## middle (the canvas's textBaseline "middle").
static func middle(font: Font, size: int) -> float:
	return (font.get_ascent(size) - font.get_descent(size)) * 0.5


## Text centred on `at` (its middle, or with `base` its baseline), with a
## dark stroke `stroke` wide round it as the web's strokeText, then filled.
## (An outline of size n reaches n / 4 past the glyph; a canvas stroke of
## width w, centred on the glyph's edge, reaches w / 2.)
static func words(ci: CanvasItem, at: Vector2, text: String, font: Font, size: int, fill: Color, stroke: float, edge: Color, base := false) -> void:
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var p := Vector2(at.x - w * 0.5, at.y + (0.0 if base else middle(font, size)))
	if stroke > 0.0 and edge.a > 0.0:
		ci.draw_string_outline(font, p, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, maxi(1, roundi(stroke * 2.0)), edge)
	ci.draw_string(font, p, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, fill)


## The dashes of a canvas's setLineDash([on, off]) along a polyline, the
## pattern shifted `offset` along it (its lineDashOffset): each dash straight
## from its start to its end, lengthened `cap` past both (a round cap's
## reach), and only those reaching into `clip`. Pairs for draw_multiline.
## (Stretches of line well clear of `clip` are stepped over in one go, so a
## long course on a chart zoomed in costs no more than what shows of it.)
static func dashes(pts: PackedVector2Array, on: float, off: float, offset: float, cap: float, clip: Rect2) -> PackedVector2Array:
	var out := PackedVector2Array()
	var period := on + off
	if pts.size() < 2 or on <= 0.0 or off <= 0.0:
		return out
	# a dash reaching into the clip lies wholly within this
	var near := clip.grow(on + cap + 1.0)
	var ph := fposmod(offset, period)
	var start := pts[0]
	for i in range(1, pts.size()):
		var a := pts[i - 1]
		var b := pts[i]
		var length := a.distance_to(b)
		if length <= 0.0:
			continue
		var dir := (b - a) / length
		var span := _span(a, dir, length, near)
		var t := span.x
		if t > 0.0:
			# over the stretch before the line comes near: a dash begun in it starts where it began
			ph = fposmod(ph + t, period)
			if ph < on and t - ph >= 0.0:
				start = a + dir * (t - ph)
		while true:
			var bound := on if ph < on else period
			var need := bound - ph
			if t + need > span.y:
				ph += span.y - t
				break
			t += need
			var p := a + dir * t
			if bound == on:
				_dash(out, start, p, cap, clip)
				ph = on
			else:
				ph = 0.0
				start = p
		if span.y < length:
			# and over the stretch after it
			ph = fposmod(ph + length - span.y, period)
			if ph < on and length - ph >= span.y:
				start = b - dir * ph
	# (the last dash cut short where the line ends, unless it hasn't begun)
	if ph > 0.0 and ph < on:
		_dash(out, start, pts[pts.size() - 1], cap, clip)
	return out


## The stretch of a line from `a` along `dir` (`length` long) inside `r`:
## (from, to) along it, both `length` when it never comes in.
static func _span(a: Vector2, dir: Vector2, length: float, r: Rect2) -> Vector2:
	var t0 := 0.0
	var t1 := length
	for axis in 2:
		var p := a[axis]
		var d := dir[axis]
		var lo := r.position[axis]
		var hi := r.end[axis]
		if absf(d) < 1e-9:
			if p < lo or p > hi:
				return Vector2(length, length)
			continue
		var ta := (lo - p) / d
		var tb := (hi - p) / d
		t0 = maxf(t0, minf(ta, tb))
		t1 = minf(t1, maxf(ta, tb))
		if t0 >= t1:
			return Vector2(length, length)
	return Vector2(t0, t1)


static func _dash(out: PackedVector2Array, a: Vector2, b: Vector2, cap: float, clip: Rect2) -> void:
	var d := b - a
	var l := d.length()
	var e := d / l * cap if l > 1e-6 else Vector2(cap, 0.0)
	var from := a - e
	var to := b + e
	if Rect2(from, Vector2.ZERO).expand(to).intersects(clip, true):
		out.append(from)
		out.append(to)


## The teardrop: a point at the spot, flaring out and round over the head.
static func _teardrop() -> PackedVector2Array:
	var hy := -1.55
	var out := PackedVector2Array()
	var a0 := Vector2(0.0, -0.05)
	# up the left flank
	for i in 9:
		out.append(_bezier(a0, Vector2(-0.25, -0.55), Vector2(-0.82, -0.95), Vector2(-0.82, hy), i / 8.0))
	# over the head
	for i in range(1, 16):
		var a := PI + PI * i / 16.0
		out.append(Vector2(cos(a) * 0.82, hy + sin(a) * 0.82))
	# and down the right
	for i in 9:
		out.append(_bezier(Vector2(0.82, hy), Vector2(0.82, -0.95), Vector2(0.25, -0.55), a0, i / 8.0))
	out.remove_at(out.size() - 1)
	return out


static func _bezier(a: Vector2, b: Vector2, c: Vector2, d: Vector2, t: float) -> Vector2:
	var u := 1.0 - t
	return a * u * u * u + b * 3.0 * u * u * t + c * 3.0 * u * t * t + d * t * t * t


## A maelstrom (the web's vortexMark): an inked spiral winding in, turned by
## `turn` (radians) so it slowly wheels on the live maps, mirrored for one
## that turns the other way, round a dark eye.
static func vortex(ci: CanvasItem, at: Vector2, r: float, turn := 0.0, dir := 1) -> void:
	var pts := PackedVector2Array()
	pts.resize(41)
	for i in 41:
		var t := i / 40.0
		var a := t * PI * 4.2
		var rr := r * (0.08 + 0.92 * t)
		pts[i] = at + Vector2(cos(a) * rr * dir, sin(a) * rr).rotated(turn * dir)
	ci.draw_polyline(pts, Color(8.0 / 255.0, 20.0 / 255.0, 28.0 / 255.0, 0.7), maxf(1.2, r * 0.42), true)
	ci.draw_polyline(pts, Color("#ff9a7a"), maxf(1.2, r * 0.2), true)
	ci.draw_circle(at, maxf(1.5, r * 0.14), Color("#1a0a08"), true, -1.0, true)


## A maelstrom's pull: a dashed coral ring of radius `r`, its dashes
## (`dash` long) running round with the water.
static func pull_ring(ci: CanvasItem, at: Vector2, r: float, dash: float, run: float, color: Color, width: float) -> void:
	if r < 2.0:
		return
	var circ := TAU * r
	var n := maxi(2, int(circ / (dash * 2.0)))
	var step := TAU / n
	var off := fmod(run / r, step)
	for i in n:
		var a0 := off + i * step
		ci.draw_arc(at, r, a0, a0 + step * 0.5, maxi(3, int(dash / 3.0)), color, width, true)


## A fort on a map (the web's fortMark): a little crenellated tower, coral
## red while the Brethren hold it (sandy once its guns are silent), aqua once it's yours.
static func fort(ci: CanvasItem, at: Vector2, r: float, ours: bool, quiet := false) -> void:
	var k := r / 10.0
	var fill := Color("#5ee3d4") if ours else (Color("#c9a98a") if quiet else Color("#ff8a6a"))
	var pts := PackedVector2Array([Vector2(-8, 8), Vector2(-8, -4)])
	for m: Vector2 in [Vector2(-8, -4.6), Vector2(-1.7, 1.7), Vector2(4.6, 8)]:
		pts.append(Vector2(m.x, -8))
		pts.append(Vector2(m.y, -8))
		pts.append(Vector2(m.y, -4))
	pts.append(Vector2(8, 8))
	pts.append(Vector2(2.4, 8))
	# the arched gate
	for i in range(1, 8):
		var a := PI * i / 8.0
		pts.append(Vector2(cos(a) * 2.4, 8.0 - sin(a) * 2.4))
	pts.append(Vector2(-2.4, 8))
	for i in pts.size():
		pts[i] = at + pts[i] * k
	glow(ci, at, r * 1.1, r * 0.9, Color(94.0 / 255.0, 227.0 / 255.0, 212.0 / 255.0, 0.55) if ours else Color(1.0, 120.0 / 255.0, 80.0 / 255.0, 0.5))
	ci.draw_colored_polygon(pts, fill)
	var loop := pts.duplicate()
	loop.append(pts[0])
	ci.draw_polyline(loop, Color(20.0 / 255.0, 10.0 / 255.0, 4.0 / 255.0, 0.85), maxf(1.4, 1.6 * k), true)


## A reef (the web's reefMark): the old chartmakers' danger mark, a cross ringed with dots.
static func reef(ci: CanvasItem, at: Vector2, r: float) -> void:
	var ink := Color(8.0 / 255.0, 20.0 / 255.0, 28.0 / 255.0, 0.7)
	var coral := Color("#ffb38a")
	for pass_ in 2:
		var w := maxf(1.1, r * (0.36 if pass_ == 0 else 0.17))
		var c := ink if pass_ == 0 else coral
		ci.draw_line(at + Vector2(-r * 0.55, 0.0), at + Vector2(r * 0.55, 0.0), c, w, true)
		ci.draw_line(at + Vector2(0.0, -r * 0.55), at + Vector2(0.0, r * 0.55), c, w, true)
		if pass_ == 0:
			# (the strokes' round caps)
			for e: Vector2 in [Vector2(-1, 0), Vector2(1, 0), Vector2(0, -1), Vector2(0, 1)]:
				ci.draw_circle(at + e * r * 0.55, w * 0.5, c, true, -1.0, true)
	var dot := maxf(1.0, r * 0.12)
	for i in 8:
		var a := i / 8.0 * TAU + PI / 8.0
		var p := at + Vector2(cos(a), sin(a)) * r
		ci.draw_circle(p, dot + 0.5, Color(8.0 / 255.0, 20.0 / 255.0, 28.0 / 255.0, 0.6), true, -1.0, true)
		ci.draw_circle(p, dot, coral, true, -1.0, true)
