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


## How far below a line's middle its baseline sits, for text set on its
## middle (the canvas's textBaseline "middle").
static func middle(font: Font, size: int) -> float:
	return (font.get_ascent(size) - font.get_descent(size)) * 0.5


## Text centred on `at` (its middle, or with `base` its baseline), with a
## dark stroke `stroke` wide round it as the web's strokeText, then filled.
static func words(ci: CanvasItem, at: Vector2, text: String, font: Font, size: int, fill: Color, stroke: float, edge: Color, base := false) -> void:
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var p := Vector2(at.x - w * 0.5, at.y + (0.0 if base else middle(font, size)))
	if stroke > 0.0 and edge.a > 0.0:
		ci.draw_string_outline(font, p, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, maxi(1, roundi(stroke)), edge)
	ci.draw_string(font, p, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, fill)


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
