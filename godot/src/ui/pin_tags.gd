class_name PinTags
extends Control
## The waypoints' tags on the HUD (the web game's .wpin): at the foot of each
## pin's pillar of light a little pill in its colour, a glowing dot and how
## far it is; a pin out of sight rides the edge of the screen instead, an
## arrow pointing the way. Closing in, a tag fades: the pillar says enough.

## The web's CSS px at its --k, in HUD units.
const U := HudStyle.K
## How far in from the screen's edge a tag rides (the web's 28 and 32 px).
const EDGE := Vector2(28.0, 32.0) * HudStyle.PX

var _tags: Array[_Tag] = []


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## Each pin's tag where its pillar stands on screen (`from`: where you are).
func show_pins(pins: Waypoints, from: Vector3, cam: Camera3D, world: World) -> void:
	var n := pins.pins.size() if pins != null and visible else 0
	while _tags.size() < n:
		var t := _Tag.new()
		add_child(t)
		_tags.append(t)
	for i in _tags.size():
		_tags[i].visible = i < n
	if n == 0:
		return
	var vp := get_viewport().get_visible_rect().size
	var c := vp * 0.5
	var half := c - EDGE
	for i in n:
		var pin := pins.pins[i]
		var p := Vector3(pin.x, maxf(0.0, world.ground_height(pin.x, pin.z)) + 3.0, pin.z)
		var behind := cam.is_position_behind(p)
		var o := cam.unproject_position(p) - c
		# behind the camera the projection flips: mirror it back, so the arrow still points the right way
		if behind:
			o = -o
		var k := maxf(absf(o.x) / half.x, absf(o.y) / half.y)
		var edge := k > 1.0 or behind
		if edge:
			o = o / k if k > 1e-4 else Vector2(0.0, half.y)
		var d := Vector2(pin.x - from.x, pin.z - from.z).length()
		var t := _tags[i]
		t.set_pin(MapMarks.PIN[pin.hue], MapScene.distance(d), edge, atan2(o.y, o.x))
		t.position = c + o + Vector2(-28.0, 16.0) * U
		# a tag fades as you close in
		t.modulate.a = 1.0 if edge else clampf((d - 20.0) / 60.0, 0.15, 1.0)


class _Tag:
	extends Control
	var _box: UiBox
	var _ink: Control
	var _color := Color.TRANSPARENT
	var _text := ""
	var _edge := false
	var _angle := 0.0
	var _font: Font

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_font = HudStyle.tnum(HudStyle.font("inter", 600))
		_box = UiBox.new(Vector2(60.0, 26.0), 999.0, 30.0)
		_box.p("c_top", Color(4.0 / 255.0, 14.0 / 255.0, 20.0 / 255.0, 0.55)).p("c_foot", Color(4.0 / 255.0, 14.0 / 255.0, 20.0 / 255.0, 0.55))
		_box.p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0))
		_box.p("ring", 1.0 * HudStyle.PX).p("glow", 14.0 * HudStyle.PX)
		add_child(_box)
		_ink = Control.new()
		_ink.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_ink.draw.connect(_draw_ink)
		add_child(_ink)

	func set_pin(color: Color, text: String, edge: bool, angle: float) -> void:
		if color != _color:
			_color = color
			_box.p("c_ring", Color(color, 0.55)).p("c_glow", Color(color, 0.35))
		var changed := text != _text or edge != _edge
		if changed or (edge and absf(angle - _angle) > 0.002):
			_edge = edge
			_angle = angle
			_ink.queue_redraw()
		if changed:
			_text = text
			var fs := _px()
			var w := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			var sz := Vector2(6.0 * U + 7.0 * U + 5.0 * U + w + 8.0 * U, roundf(fs * 1.2) + 6.0 * U)
			_box.resize(sz)
			_ink.size = sz
			size = sz

	func _px() -> int:
		return roundi(11.0 * U)

	func _draw_ink() -> void:
		var h := _ink.size.y
		var dot := Vector2(6.0 * U + 3.5 * U, h * 0.5)
		if _edge:
			# an arrowhead pointing the way, softly glowing (about as much ink
			# as the web's 9 by 10 triangle, but long and slim: near equilateral,
			# turned on a slant it reads as pointing elsewhere)
			MapMarks.glow(_ink, dot, 4.0 * U, 4.0 * HudStyle.PX, Color(_color, 0.6))
			var pts := PackedVector2Array()
			for q: Vector2 in [Vector2(7.0, 0.0), Vector2(-5.0, -3.6), Vector2(-5.0, 3.6)]:
				pts.append(dot + (q * U).rotated(_angle))
			_ink.draw_colored_polygon(pts, _color)
			# (its edges smoothed, so a slanting one isn't a staircase)
			pts.append(pts[0])
			_ink.draw_polyline(pts, _color, 1.0, true)
		else:
			MapMarks.glow(_ink, dot, 3.5 * U, 8.0 * HudStyle.PX, Color(_color, 0.7))
			_ink.draw_circle(dot, 3.5 * U, _color, true, -1.0, true)
		var fs := _px()
		var base := (h + _font.get_ascent(fs) - _font.get_descent(fs)) * 0.5
		_ink.draw_string(_font, Vector2(6.0 * U + 7.0 * U + 5.0 * U, base), _text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, _color)
