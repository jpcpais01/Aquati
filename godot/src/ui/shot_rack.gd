class_name ShotRack
extends Control
## The shot rack on a desktop, in the console beside the knots (the web's
## .rack): a slot for each kind of shot with its key and what's left of it.
## The loaded one sits forward in a ring whose halves are the two broadsides,
## the left half filling as the port guns reload and the right as the
## starboard guns do, white once they're run out and gold with a foe in that
## side's arc. A slot is clicked (or its key pressed) to load it.

signal picked(kind: int)
## The mouse came over a slot (its kind), or left it (-1).
signal hovered(kind: int)

const SLOT := Vector2(44.0, 48.0) * HudStyle.K
const BALL := 34.0 * HudStyle.K
const GAP := 3.0 * HudStyle.K
const PAD_L := 2.0 * HudStyle.K
const PAD_R := 6.0 * HudStyle.K

var _slots: Array[_Slot] = []
var _sel := -1
var _shown := ""
# each broadside (port, starboard): reloaded, run out and hot as told, then eased
var _rl := Vector2.ONE
var _ready := Vector2.ONE
var _hot := Vector2.ZERO
var _rdy_e := Vector2.ONE
var _hot_e := Vector2.ZERO
var _flash := Vector2.ZERO
var _ping := Vector2.ZERO


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(PAD_L + PAD_R + SLOT.x * Ammo.COUNT + GAP * (Ammo.COUNT - 1), SLOT.y)
	size = custom_minimum_size
	for i in Ammo.COUNT:
		var s := _Slot.new(i)
		s.position = Vector2(PAD_L + i * (SLOT.x + GAP), 0.0)
		s.picked.connect(func(k: int) -> void: picked.emit(k))
		s.hovered.connect(func(k: int) -> void: hovered.emit(k))
		add_child(s)
		_slots.append(s)


## The shot loaded and what's left of each kind (round shot -1, endless).
func show_state(sel: int, stock: PackedInt32Array) -> void:
	var key := "%d:%s" % [sel, stock]
	if key == _shown:
		return
	_shown = key
	_sel = sel
	for s in _slots:
		s.show_state(s.kind == sel, stock[s.kind])


## Each frame: each side's reload (0..1), whether her guns are run out and
## whether a foe sits in that side's loaded arc.
func show_guns(p_rl: float, p_ready: bool, s_rl: float, s_ready: bool, p_hot: bool, s_hot: bool) -> void:
	_rl = Vector2(p_rl, s_rl)
	_ready = Vector2(1.0 if p_ready else 0.0, 1.0 if s_ready else 0.0)
	_hot = Vector2(1.0 if p_hot else 0.0, 1.0 if s_hot else 0.0)


## A side pressed while its guns still load: its half flushes coral.
func flash(side: int) -> void:
	if side > 0:
		_flash.x = 0.001
	else:
		_flash.y = 0.001


## A side's guns are run out again mid-fight: its half pings bright.
func ping(side: int) -> void:
	if side > 0:
		_ping.x = 0.001
	else:
		_ping.y = 0.001


func deny(kind: int) -> void:
	_slots[kind].deny()


func gain(kind: int, n: int) -> void:
	_slots[kind].gain(n)


func loaded(kind: int) -> void:
	_slots[kind].loaded()


func _process(dt: float) -> void:
	if _sel < 0 or not is_visible_in_tree():
		return
	var k := MathX.damp(18.0, dt)
	_rdy_e += (_ready - _rdy_e) * k
	_hot_e += (_hot - _hot_e) * k
	for i in 2:
		if _flash[i] > 0.0:
			_flash[i] += dt / 0.4
			if _flash[i] >= 1.0:
				_flash[i] = 0.0
		if _ping[i] > 0.0:
			_ping[i] += dt / 0.6
			if _ping[i] >= 1.0:
				_ping[i] = 0.0
	var d := _slots[_sel].disc
	d.put(&"rl", _rl.snapped(Vector2(0.002, 0.002)))
	d.put(&"rdy", _rdy_e.snapped(Vector2(0.01, 0.01)))
	d.put(&"hot", _hot_e.snapped(Vector2(0.01, 0.01)))
	d.put(&"flash", _flash.snapped(Vector2(0.005, 0.005)))
	d.put(&"ping", _ping.snapped(Vector2(0.005, 0.005)))


class _Slot:
	extends Control
	signal picked(kind: int)
	signal hovered(kind: int)

	var kind := 0
	var disc: ShotDisc
	var _ball: Control
	var _icon: TextureRect
	var _kd: Badge
	var _n: Badge
	var _gain: Label
	var _on := false
	var _empty := false
	var _hover := false
	var _on_e := 0.0
	var _hover_e := 0.0
	var _deny := -1.0
	var _load := -1.0
	var _rise := -1.0

	func _init(k: int) -> void:
		kind = k
		var K := HudStyle.K
		var sz := ShotRack.SLOT
		var b := ShotRack.BALL
		custom_minimum_size = sz
		size = sz
		pivot_offset = sz * 0.5
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		tooltip_text = "%s (%d): %s" % [Ammo.NAME[k], k + 1, Ammo.BLURB[k]]
		_ball = Control.new()
		_ball.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_ball.size = Vector2(b, b)
		_ball.position = (sz - _ball.size) * 0.5
		_ball.pivot_offset = _ball.size * 0.5
		add_child(_ball)
		disc = ShotDisc.new(b, ShotDisc.Style.RACK)
		disc.put(&"ac", Ammo.COLOR[k])
		disc.put(&"ring_out", 4.0 * K)
		disc.put(&"ring_w", 2.75 * K)
		_ball.add_child(disc)
		_icon = TextureRect.new()
		_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_icon.texture = Icons.plunder(Ammo.ID[k], b * 0.88, true)
		_icon.size = Vector2(b, b) * 0.88
		_icon.position = (_ball.size - _icon.size) * 0.5
		_icon.pivot_offset = _icon.size * 0.5
		_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_ball.add_child(_icon)
		_kd = Badge.new(Color(0.016, 0.063, 0.094, 0.7), HudStyle.INK_3, 8.5 * K, 3.0 * K, 0.0, Color(0, 0, 0, 0), 4, 1.45)
		add_child(_kd)
		_kd.pin(Vector2(1.0, 1.0) * K, Vector2.ZERO)
		_kd.set_text(str(k + 1))
		_n = Badge.new(Color(0.016, 0.063, 0.094, 0.86), HudStyle.INK_2, 9.0 * K, 4.0 * K, 16.0 * K, Color(1, 1, 1, 0.1), 99, 1.5)
		add_child(_n)
		_n.pin(Vector2(sz.x * 0.5, sz.y + 1.0 * K), Vector2(0.5, 1.0))
		_gain = ShotPie.rise_label()
		_gain.add_theme_color_override("font_color", Ammo.COLOR[k])
		add_child(_gain)
		mouse_entered.connect(func() -> void:
			_hover = true
			hovered.emit(kind))
		mouse_exited.connect(func() -> void:
			_hover = false
			hovered.emit(-1))

	func show_state(on: bool, n: int) -> void:
		_on = on
		_empty = n == 0
		_n.set_text("∞" if n < 0 else str(n))
		var ink := HudStyle.INK if on else HudStyle.INK_2
		if _empty:
			ink = Color("#ff9d8c")
		_n.set_colors(Color(0.016, 0.063, 0.094, 0.86), ink, Color(Ammo.COLOR[kind], 0.7) if on else Color(1, 1, 1, 0.1))
		_kd.set_colors(HudStyle.INK if on else Color(0.016, 0.063, 0.094, 0.7), Color("#06141e") if on else HudStyle.INK_3)
		modulate.a = 0.38 if _empty else 1.0
		# the loaded slot draws over its neighbours
		if on:
			move_to_front()

	func deny() -> void:
		_deny = 0.0

	func gain(n: int) -> void:
		_gain.text = "+%d" % n
		_gain.size = _gain.get_combined_minimum_size()
		_rise = 0.0

	func loaded() -> void:
		_load = 0.0

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION:
			picked.emit(kind)
			accept_event()

	func _process(dt: float) -> void:
		_on_e += ((1.0 if _on else 0.0) - _on_e) * MathX.damp(16.0, dt)
		_hover_e += ((1.0 if _hover and not _on else 0.0) - _hover_e) * MathX.damp(16.0, dt)
		disc.put(&"lit", snappedf(_on_e, 0.01))
		disc.put(&"hover", snappedf(_hover_e, 0.01))
		var s := 1.0 + 0.12 * _on_e
		var x := 0.0
		if _deny >= 0.0:
			_deny += dt / 0.38
			x = HudStyle.shake(_deny) * 3.0 * HudStyle.K
			if _deny >= 1.0:
				_deny = -1.0
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
		# under the mouse the ball lifts a little
		var lift := _hover_e * 2.0 * HudStyle.K
		_ball.position = (size - _ball.size) * 0.5 + Vector2(x, -lift)
		_ball.scale = Vector2.ONE * (1.0 + 0.05 * _hover_e) * bump
		_icon.position.y = (_ball.size.y - _icon.size.y) * 0.5 + drop.x * _icon.size.y
		_icon.scale = Vector2.ONE * drop.y
		_icon.modulate.a = drop.z
