class_name ColourPop
extends Control
## The Shipwright's "any colour" (the web hands it to the phone's own colour
## input): a card of glass over the panel's choices, the hue's shades in a
## square (richer across, darker down) and every hue in a strip beside it,
## the colour as it stands in a round with its hex, and Done. Each move of a
## finger on them is the colour at once (on_pick), so she wears it while
## it's chosen; Done, a tap off the card or the back button puts it away.

signal clicked

const SHADER := preload("res://shaders/colour_pick.gdshader")

var _px := MenuKit.PX
var _on_pick := Callable()
var _h := 0.0
var _s := 0.0
var _v := 0.0
var _card: UiBox
var _sv: ColorRect
var _sv_mat: ShaderMaterial
var _hue: ColorRect
var _sv_knob: UiBox
var _hue_knob: UiBox
var _dot: UiBox
var _hex: UiText
var _done: UiButton
## What a finger is working: "sv", "hue", "off" (it came down off the card) or "".
var _drag := ""
var _t := 1.0
var _built_for := Vector2.ZERO


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	set_process(false)


## Up over the choices, on `value`; `on_pick` is called with each colour chosen.
func open(value: Color, on_pick: Callable) -> void:
	if _built_for != size:
		_build()
	_on_pick = on_pick
	# a grey keeps the hue it had (it has none of its own)
	if value.s > 0.001:
		_h = value.h
	_s = value.s
	_v = value.v
	_drag = ""
	_t = 0.0
	visible = true
	_show()
	set_process(true)


func close() -> void:
	if not visible:
		return
	visible = false
	_drag = ""
	_on_pick = Callable()
	_done.cancel()
	set_process(false)


func is_open() -> bool:
	return visible


func _build() -> void:
	for c in get_children():
		remove_child(c)
		c.queue_free()
	_built_for = size
	var px := _px
	# the choices dimmed under it
	var dim := ColorRect.new()
	dim.color = Color(0.008, 0.04, 0.063, 0.55)
	dim.size = size
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)
	var pad := 14.0 * px
	var gap := 10.0 * px
	var cw := size.x - 24.0 * px
	var head := MenuKit.words("ANY COLOUR", "inter", 700, 11.0 * px, HudStyle.AQUA, 0.22, 1.21)
	var foot_h := 36.0 * px
	var strip := 26.0 * px
	var rest := pad + head.size.y + gap + 12.0 * px + foot_h + pad
	var sv_h := clampf(size.y - 24.0 * px - rest, 80.0 * px, 150.0 * px)
	var ch := rest + sv_h
	_card = UiBox.new(Vector2(cw, ch), 18.0 * px, 60.0 * px)
	_card.p("c_top", Color8(16, 42, 58, 242)).p("c_foot", Color8(8, 24, 34, 247)).p("c_border", HudStyle.STROKE_2).p("hi", 0.09)
	_card.p("c_shadow", Color(0.0, 0.02, 0.04, 0.45)).p("shadow", Vector2(18.0, 46.0) * px)
	_card.position = (size - _card.size) * 0.5
	_card.pivot_offset = _card.size * 0.5
	add_child(_card)
	head.position = Vector2(pad, pad)
	_card.add_child(head)
	var y := pad + head.size.y + gap
	var sv_w := cw - pad * 2.0 - gap - strip
	_sv_mat = _material(0, Vector2(sv_w, sv_h))
	_sv = _patch(_sv_mat, Vector2(pad, y), Vector2(sv_w, sv_h))
	_card.add_child(_sv)
	_hue = _patch(_material(1, Vector2(strip, sv_h)), Vector2(pad + sv_w + gap, y), Vector2(strip, sv_h))
	_card.add_child(_hue)
	# the knobs: a ring on the square, a bar across the strip, each in its colour
	var kd := 22.0 * px
	_sv_knob = UiBox.new(Vector2(kd, kd), kd * 0.5, 14.0 * px)
	_sv_knob.p("c_border", Color.WHITE).p("border", 3.0 * px).p("hi", 0.0)
	_sv_knob.p("c_shadow", Color(0.0, 0.0, 0.0, 0.4)).p("shadow", Vector2(2.0, 8.0) * px)
	_card.add_child(_sv_knob)
	_hue_knob = UiBox.new(Vector2(strip + 8.0 * px, 14.0 * px), 7.0 * px, 14.0 * px)
	_hue_knob.p("c_border", Color.WHITE).p("border", 3.0 * px).p("hi", 0.0)
	_hue_knob.p("c_shadow", Color(0.0, 0.0, 0.0, 0.4)).p("shadow", Vector2(2.0, 8.0) * px)
	_card.add_child(_hue_knob)
	# the foot: the colour in a round, its hex, and Done
	var fy := y + sv_h + 12.0 * px
	var dd := 30.0 * px
	_dot = UiBox.new(Vector2(dd, dd), dd * 0.5, 2.0)
	MenuKit.flat(_dot)
	_dot.p("c_border", Color(1.0, 1.0, 1.0, 0.35)).p("border", 1.5 * px).p("hi", 0.0)
	_dot.position = Vector2(pad, fy + (foot_h - dd) * 0.5)
	_card.add_child(_dot)
	_hex = MenuKit.words("#FFFFFF", "inter", 700, 13.0 * px, HudStyle.INK, 0.06)
	_hex.position = Vector2(pad + dd + 10.0 * px, fy + (foot_h - _hex.size.y) * 0.5)
	_card.add_child(_hex)
	var t := MenuKit.words("Done", "inter", 700, 13.0 * px, HudStyle.GOLD_INK, 0.02)
	var bw := t.size.x + 44.0 * px
	_done = UiButton.new(Vector2(bw, foot_h), foot_h * 0.5, 30.0 * px)
	HudStyle.gold(_done, MenuKit.U * 0.6)
	t.position = (_done.size - t.size) * 0.5
	_done.add_child(t)
	_done.position = Vector2(cw - pad - bw, fy)
	_done.pressed.connect(func() -> void:
		clicked.emit()
		close())
	_card.add_child(_done)


func _material(mode: int, sz: Vector2) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = SHADER
	m.set_shader_parameter("mode", mode)
	m.set_shader_parameter("rect", sz)
	m.set_shader_parameter("radius", 10.0 * _px)
	return m


func _patch(m: ShaderMaterial, at: Vector2, sz: Vector2) -> ColorRect:
	var r := ColorRect.new()
	r.material = m
	r.position = at
	r.size = sz
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


## The knobs, the round and the hex at the colour as it stands.
func _show() -> void:
	var c := Color.from_hsv(_h, _s, _v)
	var pure := Color.from_hsv(_h, 1.0, 1.0)
	_sv_mat.set_shader_parameter("hue", _h)
	_sv_knob.p("c_top", c).p("c_foot", c)
	_sv_knob.position = _sv.position + Vector2(_s, 1.0 - _v) * _sv.size - _sv_knob.size * 0.5
	_hue_knob.p("c_top", pure).p("c_foot", pure)
	_hue_knob.position = _hue.position + Vector2(_hue.size.x * 0.5, _h * _hue.size.y) - _hue_knob.size * 0.5
	_dot.p("c_top", c).p("c_foot", c)
	_hex.set_text("#" + c.to_html(false).to_upper())


func _pick() -> void:
	_show()
	if _on_pick.is_valid():
		_on_pick.call(Color.from_hsv(_h, _s, _v))


func _process(dt: float) -> void:
	if _t < 1.0:
		_t = minf(1.0, _t + dt / 0.2)
		var k := HudStyle.eased(_t)
		_card.modulate.a = k
		_card.scale = Vector2.ONE * lerpf(0.94, 1.0, k)
		modulate.a = minf(1.0, _t * 2.0)


func _gui_input(event: InputEvent) -> void:
	var touch := event is InputEventScreenTouch
	var click: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION
	if touch and event.index != 0:
		accept_event()
		return
	if touch or click:
		var at: Vector2 = event.position - _card.position
		if event.pressed:
			var grow := 8.0 * _px
			if Rect2(_sv.position, _sv.size).grow(grow).has_point(at):
				_drag = "sv"
				_work(at)
			elif Rect2(_hue.position, _hue.size).grow(grow).has_point(at):
				_drag = "hue"
				_work(at)
			elif not Rect2(Vector2.ZERO, _card.size).has_point(at):
				_drag = "off"
			else:
				_drag = ""
		else:
			if _drag == "off" and not Rect2(Vector2.ZERO, _card.size).has_point(at):
				clicked.emit()
				close()
			_drag = ""
		accept_event()
		return
	var moved: bool = (event is InputEventScreenDrag and event.index == 0) or (event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION)
	if moved and (_drag == "sv" or _drag == "hue"):
		_work(event.position - _card.position)
	accept_event()


## A finger at `at` (on the card) working the square or the strip.
func _work(at: Vector2) -> void:
	if _drag == "sv":
		var k := ((at - _sv.position) / _sv.size).clamp(Vector2.ZERO, Vector2.ONE)
		_s = k.x
		_v = 1.0 - k.y
	else:
		_h = clampf((at.y - _hue.position.y) / _hue.size.y, 0.0, 0.9999)
	_pick()
