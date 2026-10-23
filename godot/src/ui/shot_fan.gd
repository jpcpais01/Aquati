class_name ShotFan
extends Control
## The shot on a touch screen, as on the web: a round button riding over the
## big Fire, wearing the shot that's loaded (and, for a special, how many
## broadsides of it are left). A tap fans the five kinds of shot out round it
## on a quarter arc, from straight up round to due left, each with what's
## left of it; a chip loads its shot and folds the fan away, as does a touch
## anywhere else or a few idle seconds. The control sits at the button's
## centre.

signal picked(kind: int)

const BTN := 46.0 * HudStyle.KT
const CHIP := 46.0 * HudStyle.KT
## The arc the chips open on, from the button's centre, and the turn between them.
const RADIUS := 140.0 * HudStyle.KT
const STEP := PI / 8.0
## Seconds the fan stays open untouched.
const IDLE := 4.0
const GLASS := Color(0.063, 0.157, 0.212)
const FOOT := Color(0.024, 0.078, 0.118)

var _btn: _Button
var _chips: Array[_Chip] = []
var _open := false
var _idle := 0.0
var _shown := ""


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_btn = _Button.new()
	_btn.tapped.connect(func() -> void:
		set_open(not _open)
		Input.vibrate_handheld(8))
	add_child(_btn)
	for i in Ammo.COUNT:
		var c := _Chip.new(i)
		c.tapped.connect(func(k: int) -> void:
			picked.emit(k)
			set_open(false))
		add_child(c)
		_chips.append(c)


## The shot loaded and what's left of each kind (round shot -1, endless).
func show_state(sel: int, stock: PackedInt32Array) -> void:
	var key := "%d:%s" % [sel, stock]
	if key == _shown:
		return
	_shown = key
	_btn.show_shot(sel, stock[sel])
	for c in _chips:
		c.show_state(c.kind == sel, stock[c.kind])


func is_open() -> bool:
	return _open


func set_open(open: bool) -> void:
	if open == _open:
		return
	_open = open
	_idle = 0.0
	_btn.focus = open
	for c in _chips:
		c.fold(open)


## None of that shot left.
func deny(kind: int) -> void:
	_chips[kind].deny()


## Shot found in salvage: the button bumps and a "+n" rises off it.
func gain(kind: int, n: int) -> void:
	_btn.gain(n, Ammo.COLOR[kind])


## A new kind rammed home: the ball drops into the button.
func loaded() -> void:
	_btn.loaded()


func _process(dt: float) -> void:
	if _open:
		_idle += dt
		if _idle > IDLE:
			set_open(false)


func _input(event: InputEvent) -> void:
	# a touch anywhere else folds the fan away
	if not _open:
		return
	var at: Variant = null
	if event is InputEventScreenTouch and event.pressed:
		at = event.position
	elif event is InputEventMouseButton and event.pressed and event.device != InputEvent.DEVICE_ID_EMULATION:
		at = event.position
	if at == null:
		return
	if _btn.get_global_rect().has_point(at):
		return
	for c in _chips:
		if c.get_global_rect().has_point(at):
			_idle = 0.0
			return
	set_open(false)


## A press on a HUD button: a finger down, or the mouse's left button (not
## the mouse the engine makes of a touch).
static func pressed(event: InputEvent) -> bool:
	if event is InputEventScreenTouch:
		return event.pressed
	return event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION


## The shot button: glass tinted with the shot loaded, its ball, its count.
class _Button:
	extends Control
	signal tapped

	var focus := false
	var _disc: ShotDisc
	var _icon: TextureRect
	var _count: Badge
	var _gain: Label
	var _kind := -1
	var _focus_e := 0.0
	var _press := -1.0
	var _load := -1.0
	var _rise := -1.0

	func _init() -> void:
		var d := ShotFan.BTN
		custom_minimum_size = Vector2(d, d)
		size = custom_minimum_size
		position = -size * 0.5
		pivot_offset = size * 0.5
		mouse_filter = Control.MOUSE_FILTER_STOP
		_disc = ShotDisc.new(d, ShotDisc.Style.GLASS)
		_disc.put(&"tint", 0.22)
		_disc.put(&"c_glass", Color(ShotFan.GLASS, 0.8))
		_disc.put(&"c_foot", Color(ShotFan.FOOT, 0.9))
		_disc.put(&"drop", 0.3)
		add_child(_disc)
		_icon = TextureRect.new()
		_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_icon.size = Vector2(d, d) * 0.74
		_icon.position = (size - _icon.size) * 0.5
		_icon.pivot_offset = _icon.size * 0.5
		_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_icon)
		var kt := HudStyle.KT
		_count = Badge.new(Color.WHITE, Color("#06141e"), 10.0 * kt, 4.0 * kt, 17.0 * kt, Color(0, 0, 0, 0), 99, 1.55)
		add_child(_count)
		_count.pin(Vector2(d + 4.0 * kt, d + 3.0 * kt), Vector2(1.0, 1.0))
		_gain = ShotFan.rise_label()
		add_child(_gain)

	func show_shot(kind: int, n: int) -> void:
		var ac: Color = Ammo.COLOR[kind]
		if kind != _kind:
			_kind = kind
			_icon.texture = Icons.plunder(Ammo.ID[kind], size.x * 0.74, true)
			_disc.put(&"ac", ac)
			_disc.put(&"c_edge", Color(ac, 0.45))
			_count.set_colors(ac, Color("#06141e"))
		# round shot never runs out: no count
		_count.visible = n >= 0
		_count.set_text(str(n))

	func gain(n: int, ac: Color) -> void:
		_gain.text = "+%d" % n
		_gain.add_theme_color_override("font_color", ac)
		_gain.size = _gain.get_combined_minimum_size()
		_rise = 0.0

	func loaded() -> void:
		_load = 0.0

	func _gui_input(event: InputEvent) -> void:
		if ShotFan.pressed(event):
			_press = 0.0
			tapped.emit()
			accept_event()

	func _process(dt: float) -> void:
		_focus_e += ((1.0 if focus else 0.0) - _focus_e) * MathX.damp(20.0, dt)
		_disc.put(&"focus", snappedf(_focus_e, 0.01))
		# a press sinks it a touch
		var s := 1.0
		if _press >= 0.0:
			_press += dt / 0.22
			s = lerpf(0.92, 1.0, HudStyle.spring(_press)) if _press < 1.0 else 1.0
			if _press >= 1.0:
				_press = -1.0
		scale = Vector2(s, s)
		var drop := Vector3(0.0, 1.0, 1.0)
		if _load >= 0.0:
			_load += dt / 0.45
			drop = HudStyle.load_drop(_load)
			if _load >= 1.0:
				_load = -1.0
		var bump := 1.0
		if _rise >= 0.0:
			_rise += dt / 1.3
			var g := HudStyle.gain_rise(_rise)
			_gain.position = Vector2((size.x - _gain.size.x) * 0.5, -6.0 * HudStyle.K - _gain.size.y * 0.5 + g.x * HudStyle.K)
			_gain.modulate.a = g.y
			bump = g.z
			if _rise >= 1.0:
				_rise = -1.0
				_gain.modulate.a = 0.0
		_icon.position.y = (size.y - _icon.size.y) * 0.5 + drop.x * _icon.size.y
		_icon.scale = Vector2.ONE * drop.y * bump
		_icon.modulate.a = drop.z


## A kind of shot in the fan: its ball and its name, what's left of it.
class _Chip:
	extends Control
	signal tapped(kind: int)

	var kind := 0
	var _body: Control
	var _disc: ShotDisc
	var _label: Label
	var _count: Badge
	var _ang := 0.0
	var _open := false
	## The fan's spread (0 folded .. 1 open, overshooting on the way) and its
	## opacity, eased from where they were to where they're bound.
	var _k := 0.0
	var _a := 0.0
	var _from := Vector2.ZERO
	var _t := 1.0
	var _deny := -1.0

	func _init(k: int) -> void:
		kind = k
		var d := ShotFan.CHIP
		var kt := HudStyle.KT
		_ang = -PI * 0.5 - k * ShotFan.STEP
		custom_minimum_size = Vector2(d, d)
		size = custom_minimum_size
		pivot_offset = size * 0.5
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		visible = false
		modulate.a = 0.0
		_body = Control.new()
		_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_body.size = size
		add_child(_body)
		_disc = ShotDisc.new(d, ShotDisc.Style.GLASS)
		var ac: Color = Ammo.COLOR[k]
		_disc.put(&"ac", ac)
		_disc.put(&"tint", 0.18)
		_disc.put(&"c_glass", Color(ShotFan.GLASS, 0.86))
		_disc.put(&"c_foot", Color(ShotFan.FOOT, 0.94))
		_disc.put(&"drop", 0.35)
		_body.add_child(_disc)
		var icon := TextureRect.new()
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.texture = Icons.plunder(Ammo.ID[k], d * 0.62, true)
		icon.size = Vector2(d, d) * 0.62
		icon.position = Vector2((d - icon.size.x) * 0.5, (d - icon.size.y) * 0.5 - d * 0.06)
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_body.add_child(icon)
		var px := 7.5 * kt
		_label = HudStyle.label(Ammo.SHORT[k].to_upper(), "inter", 800, roundi(px), HudStyle.INK_2, roundi(px * 0.12))
		_label.size = _label.get_combined_minimum_size()
		_label.position = Vector2((d - _label.size.x) * 0.5, d - 4.0 * kt - _label.size.y * 0.85)
		_body.add_child(_label)
		_count = Badge.new(Color(0.016, 0.063, 0.094, 0.92), HudStyle.INK, 9.0 * kt, 3.0 * kt, 16.0 * kt, Color(1, 1, 1, 0.14), 99, 1.55)
		_body.add_child(_count)
		_count.pin(Vector2(d + 3.0 * kt, -3.0 * kt), Vector2(1.0, 0.0))
		_place()

	func show_state(on: bool, n: int) -> void:
		_disc.put(&"sel", 1.0 if on else 0.0)
		_label.add_theme_color_override("font_color", HudStyle.INK if on else HudStyle.INK_2)
		_count.set_text("∞" if n < 0 else str(n))
		_body.modulate.a = 0.42 if n == 0 else 1.0

	## Open (or fold) the chip along its spoke, a beat after the one before it.
	func fold(open: bool) -> void:
		_open = open
		_from = Vector2(_k, _a)
		_t = -kind * 0.025 / 0.32
		visible = true
		mouse_filter = Control.MOUSE_FILTER_STOP if open else Control.MOUSE_FILTER_IGNORE

	func deny() -> void:
		_deny = 0.0

	func _gui_input(event: InputEvent) -> void:
		if _open and ShotFan.pressed(event):
			tapped.emit(kind)
			accept_event()

	func _process(dt: float) -> void:
		if _t < 1.0:
			_t += dt / 0.32
			var u := clampf(_t, 0.0, 1.0)
			var to := 1.0 if _open else 0.0
			_k = lerpf(_from.x, to, HudStyle.spring(u) if _open else HudStyle.eased(u))
			_a = lerpf(_from.y, to, clampf(u * 0.32 / 0.18, 0.0, 1.0))
			if _t >= 1.0 and not _open:
				visible = false
			_place()
		if _deny >= 0.0:
			_deny += dt / 0.38
			_body.position.x = HudStyle.shake(_deny) * 3.0 * HudStyle.PX
			if _deny >= 1.0:
				_deny = -1.0
				_body.position.x = 0.0

	func _place() -> void:
		var r := ShotFan.RADIUS * lerpf(0.4, 1.0, _k)
		position = Vector2(cos(_ang), sin(_ang)) * r - size * 0.5
		var s := lerpf(0.4, 1.0, _k)
		scale = Vector2(s, s)
		modulate.a = _a


## The "+n" that rises off a button when shot is found.
static func rise_label() -> Label:
	var l := HudStyle.label("", "inter", 800, roundi(11.0 * HudStyle.K), HudStyle.INK)
	l.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.55))
	l.add_theme_constant_override("shadow_offset_x", 0)
	l.add_theme_constant_override("shadow_offset_y", 2)
	l.add_theme_constant_override("shadow_outline_size", 5)
	l.modulate.a = 0.0
	return l
