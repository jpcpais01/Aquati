class_name FlagStage
extends Control
## The Flag tab's stage (the web's living flag preview): her flag as you
## design it, flying from a pole on a patch of sky, and the brush. "Paint"
## holds the flag still and brings out the paint bar (the flag's colours and
## a few more, three brush sizes, the eraser, undo and clear); "Done
## painting" puts the brush away. The brush paints a layer of its own (the
## web's 384 x 238 canvas) on the GPU, in a SubViewport the strokes are drawn
## into as the finger moves; her flag at the masthead shows the layer as it's
## painted (layer()), and it's kept as a PNG once the brush is put away
## (Shipwright: encode()). The stage grows while painting, the bar in its own
## rows over the flag rather than across it.

## "Paint" or "Done painting" tapped.
signal toggled
signal clicked

const PAINT := Heraldry.PAINT
## The brushes (the web's widths on its 256-wide flag) and their dots.
const BRUSHES := [6.0, 12.0, 24.0]
## Strokes that can be taken back.
const UNDO := 20
## Whether the layer can be read back (a headless run draws nothing: the
## brush works, its work isn't kept).
static var _reads := DisplayServer.get_name() != "headless"
## The stage's height (CSS px), and while painting.
const H := 104.0
const H_PAINT := 232.0

var painting := false
## The brush was put away and its layer stays over the flag until her flag
## comes drawn with the paint in it (set_flag).
var held := false
var brush_color := Color("#f2c45a")
var brush_size := 6.0
var erase := false

var _px := MenuKit.PX
var _t := 0.0
var _bg: UiBox
var _sky: UiBox
var _pole: _Pole
var _flag: ColorRect
var _mat: ShaderMaterial
var _box := Rect2()
var _dash: _Dash
var _chip: UiButton
var _bar: Control
var _bar_btns: Array = []
var _layer: SubViewport
var _ink: _Strokes
var _rub: _Strokes
var _blit: _Blit
var _undo: Array[Image] = []
## A stroke under way, and where it last was (on the layer).
var _stroke := false
var _last := Vector2.ZERO


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	clip_contents = true
	_layer = SubViewport.new()
	_layer.size = PAINT
	_layer.transparent_bg = true
	_layer.disable_3d = true
	_layer.render_target_clear_mode = SubViewport.CLEAR_MODE_ONCE
	_layer.render_target_update_mode = SubViewport.UPDATE_ONCE
	_ink = _Strokes.new()
	_rub = _Strokes.new()
	var m := ShaderMaterial.new()
	m.shader = preload("res://shaders/paint_erase.gdshader")
	_rub.material = m
	_blit = _Blit.new()
	_layer.add_child(_blit)
	_layer.add_child(_ink)
	_layer.add_child(_rub)
	add_child(_layer)
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/flag_stage.gdshader")
	_mat.set_shader_parameter("paint_tex", _layer.get_texture())


## The brush's layer, as her flag at the masthead shows it while painting.
func layer() -> Texture2D:
	return _layer.get_texture()


## Lays the stage out `w` units wide (its height follows: painting or not),
## the paint bar's colours led by the flag's own.
func build(w: float, flag: Dictionary) -> void:
	for c in get_children():
		if c != _layer:
			remove_child(c)
			c.queue_free()
	_bar_btns.clear()
	var px := _px
	var h := (H_PAINT if painting else H) * px
	size = Vector2(w, h)
	custom_minimum_size = size
	# a patch of sky: a soft light high on the left over a sea-blue wash
	_bg = UiBox.new(size, 20.0 * px, 2.0)
	MenuKit.flat(_bg)
	_bg.p("c_top", Color8(120, 180, 220, 71)).p("c_foot", Color8(30, 110, 130, 56)).p("c_border", HudStyle.STROKE).p("hi", 0.0)
	add_child(_bg)
	_sky = UiBox.new(size, 20.0 * px, 2.0)
	MenuKit.flat(_sky)
	_sky.p("radial", Vector4(0.3, 0.3, 0.99, 0.99)).p("radial_stop", 0.6).p("border", 0.0).p("hi", 0.0)
	_sky.p("c_top", Color8(143, 211, 232, 89)).p("c_foot", Color8(143, 211, 232, 0))
	add_child(_sky)
	# the flag: below the bar while painting, clear of the chip otherwise
	var area := Rect2(Vector2.ZERO, size)
	if painting:
		_bar = _build_bar(w, flag)
		var top := _bar.position.y + _bar.size.y + 6.0 * px
		area = Rect2(0.0, top, w, h - top)
	_box = _flag_box(area)
	_pole = _Pole.new(_box, h, px)
	add_child(_pole)
	var amp := _box.size.y * 0.07 * 1.3 + 2.0 * px
	_flag = ColorRect.new()
	_flag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flag.position = Vector2(_box.position.x, _box.position.y - amp)
	_flag.size = Vector2(_box.size.x, _box.size.y + amp * 2.0)
	_flag.material = _mat
	_mat.set_shader_parameter("rect", _flag.size)
	_mat.set_shader_parameter("box", Vector4(0.0, amp, _box.size.x, _box.size.y))
	_mat.set_shader_parameter("painting", painting or held)
	_mat.set_shader_parameter("wave", 0.0 if painting else 1.0)
	add_child(_flag)
	if painting:
		_dash = _Dash.new(_box.grow(1.0), px)
		add_child(_dash)
		add_child(_bar)
		mouse_filter = Control.MOUSE_FILTER_STOP
	else:
		_chip = _paint_chip()
		_chip.position = size - _chip.size - Vector2(10.0, 10.0) * px
		add_child(_chip)
		mouse_filter = Control.MOUSE_FILTER_PASS
	_tick(0.0)


## Her flag as last drawn (`painted`: with the brush's latest work in it, so
## its layer can come down).
func set_flag(tex: Texture2D, painted := false) -> void:
	_mat.set_shader_parameter("flag_tex", tex)
	if painted and held and not painting:
		held = false
		_mat.set_shader_parameter("painting", false)


## The web's flagBox: the flag 82% of the stage across (no taller than 86%
## of it), its hoist 12% in from the left.
func _flag_box(r: Rect2) -> Rect2:
	var fw := r.size.x * 0.82
	var fh := fw * Heraldry.ASPECT
	var s := minf(1.0, r.size.y * 0.86 / fh)
	return Rect2(r.position.x + r.size.x * 0.12, r.position.y + (r.size.y - fh * s) * 0.5 - r.size.y * 0.02, fw * s, fh * s)


## The chip at the stage's foot: "Paint".
func _paint_chip() -> UiButton:
	var px := _px
	var t := MenuKit.words("Paint", "inter", 700, 12.0 * px, HudStyle.INK, 0.06)
	var ip := 13.0 * px
	var gap := 6.0 * px
	var h := 7.0 * px * 2.0 + t.size.y
	var b := UiButton.new(Vector2(13.0 * px * 2.0 + ip + gap + t.size.x, h), h * 0.5, 4.0)
	MenuKit.flat(b)
	b.p("c_top", Color8(6, 24, 34, 184)).p("c_foot", Color8(6, 24, 34, 184)).p("c_border", HudStyle.STROKE).p("hi", 0.0)
	var ic := Icons.rect("pencil", ip)
	ic.position = Vector2(13.0 * px, (h - ip) * 0.5)
	t.position = Vector2(13.0 * px + ip + gap, (h - t.size.y) * 0.5)
	b.add_child(ic)
	b.add_child(t)
	b.pressed.connect(func() -> void:
		clicked.emit()
		toggled.emit())
	return b


## The paint bar: the colours in their row, the brushes, the eraser, undo and
## clear in the next, and "Done painting" at its end.
func _build_bar(w: float, flag: Dictionary) -> Control:
	var px := _px
	var bar := Control.new()
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.position = Vector2(8.0, 8.0) * px
	var gap := 5.0 * px
	var row := 28.0 * px
	var x := 0.0
	var seen := {}
	for c: String in [str(flag.emblem_color), str(flag.pattern_color), "#141212", "#f3ecdc", "#b8262b", "#f2c45a", "#1fa3a0", "#2f7d3a"]:
		var k := c.to_lower()
		if seen.has(k):
			continue
		seen[k] = true
		var col := Color(k)
		var sw := Shipwright.Swatch.new(col, 22.0 * px)
		sw.position = Vector2(x, (row - sw.size.y) * 0.5)
		sw.pressed.connect(func() -> void:
			clicked.emit()
			brush_color = col
			erase = false
			_sync_bar())
		bar.add_child(sw)
		_bar_btns.append(["colour", sw, col])
		x += sw.size.x + gap
	var y := row + gap
	x = 0.0
	for s: float in BRUSHES:
		var d := s / 2.4 * px
		var b := _tool(func(c: Control) -> void:
			var dot := _Dot.new(d)
			dot.position = (c.size - dot.size) * 0.5
			c.add_child(dot))
		b.pressed.connect(func() -> void:
			clicked.emit()
			brush_size = s
			_sync_bar())
		_bar_btns.append(["size", b, s])
		b.position = Vector2(x, y)
		bar.add_child(b)
		x += b.size.x + gap
	for it: Array in [["eraser", "erase"], ["undo", "undo"], ["close", "clear"]]:
		var icon := str(it[0])
		var b := _tool(func(c: Control) -> void:
			var ic := Icons.rect(icon, 15.0 * px)
			ic.position = (c.size - ic.size) * 0.5
			c.add_child(ic))
		var what := str(it[1])
		b.pressed.connect(func() -> void:
			clicked.emit()
			match what:
				"erase":
					erase = not erase
				"undo":
					undo()
				"clear":
					clear()
			_sync_bar())
		_bar_btns.append([what, b, null])
		b.position = Vector2(x, y)
		bar.add_child(b)
		x += b.size.x + gap
	# "Done painting", gold, at the end of the tools' row
	var t := MenuKit.words("Done painting", "inter", 700, 12.0 * px, HudStyle.GOLD_INK, 0.06)
	var ip := 13.0 * px
	var h := row
	var done := UiButton.new(Vector2(12.0 * px * 2.0 + ip + 6.0 * px + t.size.x, h), h * 0.5, 20.0 * px)
	HudStyle.gold(done, MenuKit.U * 0.5)
	var ic := Icons.rect("check", ip, HudStyle.GOLD_INK)
	ic.position = Vector2(12.0 * px, (h - ip) * 0.5)
	t.position = Vector2(12.0 * px + ip + 6.0 * px, (h - t.size.y) * 0.5)
	done.add_child(ic)
	done.add_child(t)
	done.position = Vector2(maxf(x, w - 16.0 * px - done.size.x), y)
	done.pressed.connect(func() -> void:
		clicked.emit()
		toggled.emit())
	bar.add_child(done)
	bar.size = Vector2(w - 16.0 * px, y + row)
	_sync_bar_on(bar)
	return bar


## A tool on the bar: a small square of dark glass.
func _tool(fill: Callable) -> UiButton:
	var px := _px
	var b := UiButton.new(Vector2(28.0, 28.0) * px, 9.0 * px, 4.0)
	MenuKit.flat(b)
	b.p("hi", 0.0)
	fill.call(b)
	return b


func _sync_bar() -> void:
	if _bar != null:
		_sync_bar_on(_bar)


func _sync_bar_on(_b: Control) -> void:
	for it: Array in _bar_btns:
		var kind := str(it[0])
		if kind == "colour":
			(it[1] as Shipwright.Swatch).set_on(not erase and (it[2] as Color).to_html(false) == brush_color.to_html(false))
			continue
		var on := (kind == "size" and is_equal_approx(float(it[2]), brush_size)) or (kind == "erase" and erase)
		var b: UiButton = it[1]
		var fill := Color(1.0, 1.0, 1.0, 0.22) if on else Color8(6, 24, 34, 179)
		b.p("c_top", fill).p("c_foot", fill).p("c_border", Color.WHITE if on else HudStyle.STROKE)


func _process(dt: float) -> void:
	_tick(dt)


func _tick(dt: float) -> void:
	_t += dt
	_mat.set_shader_parameter("t", _t)


# ------------------------------------------------------------------ the brush


## The brush comes out: the layer starts as the flag's paint (a PNG data URL, or "").
func begin(paint: String) -> void:
	painting = true
	held = false
	_undo.clear()
	_stroke = false
	_ink.clear()
	_rub.clear()
	var tex: Texture2D = null
	if paint.begins_with("data:image/png"):
		var img := Image.new()
		var raw := Marshalls.base64_to_raw(paint.get_slice(",", 1))
		if img.load_png_from_buffer(raw) == OK:
			tex = ImageTexture.create_from_image(img)
	_blit.show_image(tex, false)
	_redraw(true)


## The brush is put away: the layer as painted (premultiplied, as drawn), for
## encode(). It stays over the flag until her flag is drawn with it.
func end() -> Image:
	painting = false
	held = true
	_stroke = false
	return _layer.get_texture().get_image() if _reads else null


## The layer as end() gave it, kept as the web keeps its canvas: a PNG data
## URL, its colour straight again ("" if nothing is painted). Any thread.
static func encode(img: Image) -> String:
	if img == null or img.is_empty():
		return ""
	if img.get_format() != Image.FORMAT_RGBA8:
		img.convert(Image.FORMAT_RGBA8)
	var data := img.get_data()
	var inked := false
	for i in range(0, data.size(), 4):
		var a := data[i + 3]
		if a == 0:
			continue
		if a > 8:
			inked = true
		if a < 255:
			var k := 255.0 / a
			data[i] = mini(255, roundi(data[i] * k))
			data[i + 1] = mini(255, roundi(data[i + 1] * k))
			data[i + 2] = mini(255, roundi(data[i + 2] * k))
	if not inked:
		return ""
	var out := Image.create_from_data(img.get_width(), img.get_height(), false, Image.FORMAT_RGBA8, data)
	return "data:image/png;base64," + Marshalls.raw_to_base64(out.save_png_to_buffer())


## A stroke along `points` (shares of the flag across and down), as a finger
## drawing it would (the smoke test, a shot's --paint).
func stroke(points: PackedVector2Array) -> void:
	if not painting or points.is_empty():
		return
	_keep()
	var last := points[0] * Vector2(PAINT)
	_dab(last, last)
	for i in range(1, points.size()):
		var p := points[i] * Vector2(PAINT)
		_dab(last, p)
		last = p


## Takes the last stroke (or clear) back.
func undo() -> void:
	if _undo.is_empty():
		return
	_blit.show_image(ImageTexture.create_from_image(_undo.pop_back()), true)
	_redraw(true)


## Wipes the layer (undo brings it back).
func clear() -> void:
	_keep()
	_blit.show_image(null, false)
	_redraw(true)


func _keep() -> void:
	if not _reads:
		return
	_undo.append(_layer.get_texture().get_image())
	if _undo.size() > UNDO:
		_undo.pop_front()


## Draws what's waiting into the layer this frame (from a clear one, when `wipe`).
func _redraw(wipe: bool) -> void:
	if wipe:
		_layer.render_target_clear_mode = SubViewport.CLEAR_MODE_ONCE
	_layer.render_target_update_mode = SubViewport.UPDATE_ONCE
	_blit.queue_redraw()
	_ink.queue_redraw()
	_rub.queue_redraw()


func _to_layer(at: Vector2) -> Vector2:
	return (at - _box.position) / _box.size * Vector2(PAINT)


func _gui_input(event: InputEvent) -> void:
	if not painting:
		return
	var touch := event is InputEventScreenTouch
	var click: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION
	if touch and event.index != 0:
		return
	if touch or click:
		if event.pressed:
			if _bar != null and Rect2(_bar.position, _bar.size).has_point(event.position):
				return
			_keep()
			_stroke = true
			_last = _to_layer(event.position)
			_dab(_last, _last)
			accept_event()
		elif _stroke:
			_stroke = false
			accept_event()
		return
	var moved: bool = (event is InputEventScreenDrag and event.index == 0) or (event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION)
	if moved and _stroke:
		var p := _to_layer(event.position)
		if p.distance_to(_last) >= 0.75:
			_dab(_last, p)
			_last = p
		accept_event()


## A stroke from a to b on the layer, round at its ends (the web's lineTo
## with round caps), in the brush's colour or rubbing out.
func _dab(a: Vector2, b: Vector2) -> void:
	var width := brush_size * (PAINT.x / 256.0)
	(_rub if erase else _ink).add(a, b, width, Color.WHITE if erase else brush_color)
	_redraw(false)


## Strokes waiting to be drawn into the layer (each drawn once: the layer
## keeps what it's given and is never cleared under them).
class _Strokes:
	extends Node2D
	var _segs: Array = []

	func add(a: Vector2, b: Vector2, width: float, color: Color) -> void:
		_segs.append([a, b, width, color])

	func clear() -> void:
		_segs.clear()

	func _draw() -> void:
		for s: Array in _segs:
			var a: Vector2 = s[0]
			var b: Vector2 = s[1]
			var w: float = s[2]
			var c: Color = s[3]
			if a.distance_to(b) > 0.01:
				draw_line(a, b, c, w, true)
			draw_circle(a, w * 0.5, c, true, -1.0, true)
			draw_circle(b, w * 0.5, c, true, -1.0, true)
		_segs.clear()


## A picture laid over the cleared layer once: the flag's paint as kept, or a
## stroke taken back (as the layer held it, premultiplied: laid back exactly).
class _Blit:
	extends Node2D
	var _tex: Texture2D
	var _mat := CanvasItemMaterial.new()

	func show_image(tex: Texture2D, premultiplied: bool) -> void:
		_tex = tex
		_mat.blend_mode = CanvasItemMaterial.BLEND_MODE_PREMULT_ALPHA if premultiplied else CanvasItemMaterial.BLEND_MODE_MIX
		material = _mat

	func _draw() -> void:
		if _tex != null:
			draw_texture_rect(_tex, Rect2(Vector2.ZERO, Vector2(Heraldry.PAINT)), false)
			_tex = null


## The flagpole: a turned pole, lit down its middle, and its gilt finial.
class _Pole:
	extends Control
	var _box := Rect2()
	var _h := 0.0
	var _px := 1.0

	func _init(box: Rect2, h: float, px: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_box = box
		_h = h
		_px = px

	func _draw() -> void:
		var x := _box.position.x - 4.0 * _px
		var top := _box.position.y - 14.0 * _px
		var bot := _h - 4.0 * _px
		var l := Color("#5a3d26")
		var m := Color("#a8794c")
		var r := Color("#4a2e18")
		var hw := 3.0 * _px
		draw_polygon(PackedVector2Array([Vector2(x - hw, top), Vector2(x, top), Vector2(x, bot), Vector2(x - hw, bot)]), PackedColorArray([l, m, m, l]))
		draw_polygon(PackedVector2Array([Vector2(x, top), Vector2(x + hw, top), Vector2(x + hw, bot), Vector2(x, bot)]), PackedColorArray([m, r, r, m]))
		draw_circle(Vector2(x, _box.position.y - 16.0 * _px), 6.0 * _px, Color("#efc463"), true, -1.0, true)


## The dashed line round the flag while it's held still for the brush.
class _Dash:
	extends Control
	var _px := 1.0

	func _init(r: Rect2, px: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		position = r.position
		size = r.size
		_px = px

	func _draw() -> void:
		var c := Color(1.0, 0.941, 0.824, 0.35)
		var w := maxf(1.0, _px * 0.6)
		var d := 6.0 * _px
		for e: Array in [[Vector2.ZERO, Vector2(size.x, 0.0)], [Vector2(size.x, 0.0), size], [size, Vector2(0.0, size.y)], [Vector2(0.0, size.y), Vector2.ZERO]]:
			draw_dashed_line(e[0], e[1], c, w, d, false)


## A brush's size, as a dot.
class _Dot:
	extends Control

	func _init(d: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = Vector2(d, d)

	func _draw() -> void:
		draw_circle(size * 0.5, size.x * 0.5, HudStyle.INK, true, -1.0, true)
