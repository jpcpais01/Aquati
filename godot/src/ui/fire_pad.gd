class_name FirePad
extends Control
## The guns on a touch screen, bottom right as on the web: a big gold Fire
## with Port and Stbd riding either side. Fire looses whichever side is
## outlined in gold (the loaded side with a foe in its arc). Each side's ring
## fills aqua as her guns load and turns gold when they're run out; a button
## warms while a foe sits in its loaded arc, a warm ring bursts off it the
## moment its guns are ready again mid-fight, and a press while they're still
## loading flushes it coral. Buttons fire on contact, with no delay, so a
## thumb can steer while the other fires.

## +1 port, -1 starboard, 0 the big Fire (whichever side suits).
signal fire(side: int)

const SIDE := 60.0 * HudStyle.KT
const MAIN := 84.0 * HudStyle.KT
const GAP := 10.0 * HudStyle.KT
## The side buttons ride this much higher than Fire's foot.
const LIFT := 26.0 * HudStyle.KT

var _port: _Button
var _main: _Button
var _star: _Button


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_port = _Button.new(1, SIDE)
	_main = _Button.new(0, MAIN)
	_star = _Button.new(-1, SIDE)
	for b: _Button in [_port, _main, _star]:
		add_child(b)
		b.pressed.connect(func(s: int) -> void: fire.emit(s))
	custom_minimum_size = Vector2(SIDE * 2.0 + MAIN + GAP * 2.0, maxf(MAIN, SIDE + LIFT))
	size = custom_minimum_size
	var h := size.y
	_port.position = Vector2(0.0, h - LIFT - SIDE)
	_main.position = Vector2(SIDE + GAP, h - MAIN)
	_star.position = Vector2(SIDE + GAP + MAIN + GAP, h - LIFT - SIDE)


## Each frame: each side's reload (0..1) and whether her guns are run out,
## the side the big Fire would loose (+1, -1, 0), and which buttons are hot.
func show_state(p_rl: float, p_ready: bool, s_rl: float, s_ready: bool, auto: int, hot_p: bool, hot_s: bool, hot_a: bool) -> void:
	_port.show_state(p_rl, p_ready, auto == 1, hot_p)
	_star.show_state(s_rl, s_ready, auto == -1, hot_s)
	_main.show_state(1.0, true, false, hot_a)


## A side's guns are run out again mid-fight.
func ping(side: int) -> void:
	(_port if side > 0 else _star).ping()


## A side was pressed while its guns are still loading.
func deny(side: int) -> void:
	(_port if side > 0 else _star).deny()


class _Button:
	extends Control
	## Fired on contact.
	signal pressed(side: int)

	## Room round the disc for its glow, its shadow and the ring bursting off it.
	const MARGIN := 46.0

	var side := 0
	var _mat: ShaderMaterial
	var _icon: TextureRect
	var _label: Label
	# what it shows, and the same eased
	var _reload := 1.0
	var _ready := true
	var _aim := false
	var _hot := false
	var _e_ready := 1.0
	var _e_aim := 0.0
	var _e_hot := 0.0
	var _ping := 0.0
	var _flash := 0.0
	var _press := 1.0
	var _shown := Vector4(-1.0, -1.0, -1.0, -1.0)
	var _shown_fx := Vector2(-1.0, -1.0)
	var _lit := -1.0
	## The fingers (or the mouse, -1) holding it down.
	var _down := {}

	func _init(s: int, d: float, icon_id := "", text := "") -> void:
		side = s
		custom_minimum_size = Vector2(d, d)
		size = custom_minimum_size
		pivot_offset = size * 0.5
		mouse_filter = Control.MOUSE_FILTER_STOP
		_mat = ShaderMaterial.new()
		_mat.shader = preload("res://shaders/fire_button.gdshader")
		_mat.set_shader_parameter("quad", size + Vector2(MARGIN, MARGIN) * 2.0)
		_mat.set_shader_parameter("radius", d * 0.5)
		_mat.set_shader_parameter("gold", 1.0 if s == 0 else 0.0)
		material = _mat
		var main := s == 0
		var col := VBoxContainer.new()
		col.alignment = BoxContainer.ALIGNMENT_CENTER
		col.add_theme_constant_override("separation", 1)
		col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.position = Vector2.ZERO
		col.size = size
		var ink := HudStyle.GOLD_INK if main else HudStyle.INK_3
		if icon_id == "":
			icon_id = "cannon" if main else ("chevL" if s > 0 else "chev")
		_icon = Icons.rect(icon_id, (30.0 if main else 20.0) * HudStyle.KT, ink)
		_icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		col.add_child(_icon)
		if text == "":
			text = "FIRE" if main else ("PORT" if s > 0 else "STBD")
		var px := (12.0 if main else 9.0) * HudStyle.KT
		_label = HudStyle.label(text, "inter", 800, roundi(px), ink, roundi(px * (0.2 if main else 0.16)))
		_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(_label)
		add_child(col)

	func show_state(reload: float, ready: bool, aim: bool, hot: bool) -> void:
		_reload = reload
		if ready and not _ready:
			_e_ready = 1.0
		_ready = ready
		_aim = aim
		_hot = hot

	func ping() -> void:
		_ping = 0.001

	func deny() -> void:
		_flash = 0.001

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventScreenTouch:
			if event.pressed:
				if _down.is_empty():
					_hit()
				_down[event.index] = true
			else:
				_down.erase(event.index)
			accept_event()
		elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION:
			if event.pressed:
				_hit()
				_down[-1] = true
			else:
				_down.erase(-1)
			accept_event()

	func _hit() -> void:
		pressed.emit(side)
		Input.vibrate_handheld(12)

	func _notification(what: int) -> void:
		# a finger lifted while the button was hidden never comes back up
		if what == NOTIFICATION_VISIBILITY_CHANGED and not is_visible_in_tree():
			_down.clear()

	func _process(dt: float) -> void:
		var k := MathX.damp(18.0, dt)
		_e_ready += ((1.0 if _ready else 0.0) - _e_ready) * k
		_e_aim += ((1.0 if _aim else 0.0) - _e_aim) * k
		_e_hot += ((1.0 if _hot else 0.0) - _e_hot) * k
		if _ping > 0.0:
			_ping += dt / 0.6
			if _ping >= 1.0:
				_ping = 0.0
		if _flash > 0.0:
			_flash += dt / 0.35
			if _flash >= 1.0:
				_flash = 0.0
		# pressed it sinks a little; the coral flush swells it for a beat
		_press += ((0.92 if not _down.is_empty() else 1.0) - _press) * MathX.damp(30.0, dt)
		var s := _press * (1.0 + 0.04 * sin(_flash * PI))
		scale = Vector2(s, s)
		var st := Vector4(snappedf(_reload, 0.002), snappedf(_e_ready, 0.01), snappedf(_e_aim, 0.01), snappedf(_e_hot, 0.01))
		if st != _shown:
			_shown = st
			_mat.set_shader_parameter("reload", st.x)
			_mat.set_shader_parameter("ready", st.y)
			_mat.set_shader_parameter("aim", st.z)
			_mat.set_shader_parameter("hot", st.w)
		# a side's label and chevron wake when her guns are run out, or Fire would loose them
		var lit := maxf(_shown.y, _shown.z)
		if side != 0 and lit != _lit:
			_lit = lit
			var ink := HudStyle.INK_3.lerp(HudStyle.INK, lit)
			_icon.self_modulate = ink
			_label.add_theme_color_override("font_color", ink)
		var fx := Vector2(_ping, _flash)
		if fx != _shown_fx:
			_shown_fx = fx
			_mat.set_shader_parameter("ping", fx.x)
			_mat.set_shader_parameter("flash", fx.y)

	func _draw() -> void:
		# one quad the shader paints, with room round it for the glow
		draw_rect(Rect2(-Vector2(MARGIN, MARGIN), size + Vector2(MARGIN, MARGIN) * 2.0), Color.WHITE)
