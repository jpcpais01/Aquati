class_name ShotPie
extends Control
## The shot on a touch screen: a round button riding over the big Fire,
## wearing the shot that's loaded (and, for a special, how many broadsides
## of it are left). Hold it, or push off it, and a pie of eight slices opens
## round it: the five kinds of shot and the rockets across its top half, each
## with what's left of it, and below them two empty racks. The rockets'
## slice opens the firework locker (FireworkPicker) to choose which kind.
## Slide onto a slice and let go to ram its shot home, or back to the middle
## to think better of it; let go without sliding and the pie stays open for
## a tap, as a quick tap opens it too. A touch anywhere else or a few idle
## seconds fold it away. The control sits at the button's centre.

signal picked(kind: int)

const BTN := 46.0 * HudStyle.KT
## The pie: the hub round the button, the slices' outer edge, the gap
## between them, their corners, and how far the one under the finger
## stands out.
const HUB := 33.0 * HudStyle.KT
const OUTER := 104.0 * HudStyle.KT
const GAP := 3.0 * HudStyle.KT
const CORNER := 6.0 * HudStyle.KT
const POP := 6.0 * HudStyle.KT
const SLICES := 8
## The slice each kind of shot sits in, clockwise from the top: round shot
## due left round to grape due right, the arc a thumb sweeps easiest.
const SLOT := [6, 7, 0, 1, 2, 3]
## Seconds a still press takes to open the pie, and how far (HUD units) a
## finger may stray before it's a push that opens it at once.
const HOLD := 0.22
const SLOP := 9.0 * HudStyle.KT
## Seconds the pie stays open untouched.
const IDLE := 4.0
const GLASS := Color(0.063, 0.157, 0.212)
const FOOT := Color(0.024, 0.078, 0.118)
## Room round the pie for its glow and its pool of shade.
const MARGIN := 44.0
## Seconds a slice takes to bloom open (each a beat after the one before)
## and to fold away.
const BLOOM := 0.3
const BEAT := 0.022
const FOLD := 0.16

var _btn: _Button
var _pie: _Pie
var _slots: Array[_Slot] = []
var _title: PanelContainer
var _title_name: Label
var _title_line: Label
var _title_kind := -2
var _open := false
var _idle := 0.0
var _shown := ""
var _sel := 0
var _stock := PackedInt32Array()
## The finger on the button: held how long, where it went down, whether
## the pie was already open then, whether the pie opened under it (letting
## go picks), the slice under it, and whether it's been out on one.
var _finger := -1
var _held_t := 0.0
var _down_at := Vector2.ZERO
var _was_open := false
var _under := false
var _hot := -1
var _visited := false
## Where the pie's centre sits from the button's (only off it when the
## screen's edge is too close), and the pie eased open.
var _c := Vector2.ZERO
var _pool := 0.0
## Per slice: its bloom (0 folded .. 1 open, overshooting on the way) and
## where it set off from, how far through, and eased: under the finger,
## loaded, none left.
var _k := PackedFloat32Array()
var _from := PackedFloat32Array()
var _t := PackedFloat32Array()
var _hot_e := PackedFloat32Array()
var _sel_e := PackedFloat32Array()
var _dim := PackedFloat32Array()
var _dirty := true


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_k.resize(SLICES)
	_from.resize(SLICES)
	_t.resize(SLICES)
	_hot_e.resize(SLICES)
	_sel_e.resize(SLICES)
	_dim.resize(SLICES)
	_t.fill(1.0)
	_stock = Ammo.fresh_stock()
	_pie = _Pie.new()
	_pie.tapped.connect(_on_slice_tapped)
	add_child(_pie)
	for i in Ammo.COUNT:
		var s := _Slot.new(i)
		add_child(s)
		_slots.append(s)
	_title = PanelContainer.new()
	_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var k := HudStyle.K
	var box := HudStyle.panel(12.0 * k, Vector2(11.0 * k, 6.0 * k))
	box.bg_color = Color(0.039, 0.11, 0.157, 0.88)
	_title.add_theme_stylebox_override("panel", box)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 1)
	_title_name = HudStyle.label("", "inter", 800, roundi(12.0 * k), HudStyle.INK, roundi(12.0 * k * 0.04))
	_title_line = HudStyle.label("", "inter", 500, roundi(10.5 * k), HudStyle.INK_2)
	for l: Label in [_title_name, _title_line]:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(l)
	_title.add_child(col)
	_title.visible = false
	_title.modulate.a = 0.0
	add_child(_title)
	_btn = _Button.new()
	_btn.touched.connect(_on_touch)
	add_child(_btn)


## The shot loaded and what's left of each kind (round shot -1, endless).
func show_state(sel: int, stock: PackedInt32Array) -> void:
	var key := "%d:%s" % [sel, stock]
	if key == _shown:
		return
	_shown = key
	_sel = sel
	_stock = stock.duplicate()
	_btn.show_shot(sel, stock[sel])
	for s in _slots:
		s.show_state(s.kind == sel, stock[s.kind])
	for i in Ammo.COUNT:
		_dim[SLOT[i]] = 1.0 if stock[i] == 0 else 0.0
	_title_kind = -2
	_dirty = true


func is_open() -> bool:
	return _open


## How far open the pie is (0 shut .. 1 open), for the guns under it to dim.
func openness() -> float:
	return _pool


## Opens the pie for a tap (or folds it away).
func set_open(open: bool) -> void:
	if open == _open:
		return
	_open = open
	_idle = 0.0
	_btn.focus = open
	if open:
		_place_pie()
		_title.visible = true
	else:
		_under = false
		_hot = -1
	_pie.mouse_filter = Control.MOUSE_FILTER_STOP if open else Control.MOUSE_FILTER_IGNORE
	for i in SLICES:
		_from[i] = _k[i]
		_t[i] = -_order(i) * BEAT / BLOOM if open else 0.0
	_pie.visible = true
	_dirty = true


## A set piece's view of the pie: open as if a finger had slid onto `kind`.
func show_held(kind: int) -> void:
	set_open(true)
	_under = true
	_finger = -3
	_hot = SLOT[kind]
	_visited = true
	_dirty = true


## The kind of firework chosen: the rockets' slice and the button wear it.
func set_firework(id: String) -> void:
	_btn.set_firework(id)
	_slots[Ammo.FIREWORK].set_firework(id)


## None of that shot left.
func deny(kind: int) -> void:
	_slots[kind].deny()


## Shot found in salvage: the button bumps and a "+n" rises off it.
func gain(kind: int, n: int) -> void:
	_btn.gain(n, Ammo.COLOR[kind])


## A new kind rammed home: the ball drops into the button.
func loaded() -> void:
	_btn.loaded()


## A slice's beat in the bloom: the kinds of shot first, left to right, then the empty racks.
func _order(i: int) -> int:
	var at := SLOT.find(i)
	return at if at >= 0 else Ammo.COUNT + (i - 3)


## The kind of shot in a slice (-1: an empty rack).
static func kind_in(i: int) -> int:
	return SLOT.find(i)


## The slice at a point (from the pie's centre), or -1 in the hub.
static func _slice_at(v: Vector2) -> int:
	if v.length() < HUB * 0.9:
		return -1
	var a := fposmod(atan2(v.x, -v.y), TAU)
	return int(floor(a / (TAU / SLICES) + 0.5)) % SLICES


## Whether a touch at a point (from the pie's centre) lands on a kind of shot.
static func takes(v: Vector2) -> bool:
	var i := _slice_at(v)
	return i >= 0 and kind_in(i) >= 0 and v.length() <= OUTER + POP


## Keeps the pie on screen: its centre on the button's unless an edge is too close.
func _place_pie() -> void:
	if not is_inside_tree():
		return
	var vp := get_viewport_rect().size
	var reach := Vector2.ONE * (OUTER + POP + 8.0)
	var g := get_global_transform().origin
	_c = Vector2.ZERO.clamp(reach - g, vp - reach - g)
	_pie.position = _c - _pie.size * 0.5
	_place_title()


func _place_title() -> void:
	_title.size = _title.get_combined_minimum_size()
	var at := _c + Vector2(-_title.size.x * 0.5, -OUTER - POP - 10.0 * HudStyle.K - _title.size.y)
	# kept on screen
	if is_inside_tree():
		var g := get_global_transform().origin
		at.x = clampf(at.x, 8.0 - g.x, get_viewport_rect().size.x - 8.0 - _title.size.x - g.x)
	_title.position = at.round()


## The finger on the button: down, moving or lifted (1, 2, 3), at a point in
## this control.
func _on_touch(phase: int, finger: int, at: Vector2) -> void:
	if phase == 1:
		if _finger >= 0 or _finger == -2:
			return
		_finger = finger
		_held_t = 0.0
		_down_at = at
		_was_open = _open
		_visited = false
		_hot = -1
		_under = _open
		_idle = 0.0
		Input.vibrate_handheld(8)
		return
	if finger != _finger:
		return
	if phase == 2:
		if not _open and at.distance_to(_down_at) > SLOP:
			_unfold()
		if _under:
			_track(at)
		return
	# lifted
	_finger = -1
	if not _under:
		# a quick tap: the pie opens for a tap
		set_open(true)
		return
	_under = false
	if _hot >= 0:
		var kind := kind_in(_hot)
		_hot = -1
		_dirty = true
		picked.emit(kind)
		# none of it left: it stays open (shaking that slice) for another pick
		if _stock[kind] != 0:
			set_open(false)
		return
	# back in the middle after a look round: thought better of it; a still
	# hold leaves it open for a tap, and a tap on an open pie's button folds it
	if _visited or _was_open:
		set_open(false)


## Held long enough, or pushed off: the pie opens under the finger.
func _unfold() -> void:
	if _open:
		return
	set_open(true)
	_under = true
	Input.vibrate_handheld(12)


## The finger moving over the open pie: the slice it's on (a kind of shot,
## not an empty rack) stands out, with a tick as it changes.
func _track(at: Vector2) -> void:
	_idle = 0.0
	var hot := -1
	# a finger that hasn't strayed off its spot picks nothing (where the
	# pie had to sit off the button, the button lies over a slice)
	if at.distance_to(_down_at) > SLOP or _visited:
		hot = _slice_at(at - _c)
		if hot >= 0 and kind_in(hot) < 0:
			hot = -1
	if hot != _hot:
		_hot = hot
		_dirty = true
		if hot >= 0:
			_visited = true
			Input.vibrate_handheld(5)


## A tap on a slice of the open pie.
func _on_slice_tapped(v: Vector2) -> void:
	var i := _slice_at(v)
	var kind := kind_in(i) if i >= 0 else -1
	if kind < 0:
		return
	_idle = 0.0
	picked.emit(kind)
	if _stock[kind] != 0:
		set_open(false)


func _process(dt: float) -> void:
	# hidden under a finger (the HUD fading for her farewell): that finger's let go
	if (_finger >= 0 or _finger == -2) and is_inside_tree() and not _btn.is_visible_in_tree():
		_finger = -1
		set_open(false)
	if _finger >= 0 or _finger == -2:
		if not _open:
			_held_t += dt
			if _held_t >= HOLD:
				_unfold()
	elif _open and _finger != -3:
		_idle += dt
		if _idle > IDLE:
			set_open(false)
	var moving := _dirty
	_dirty = false
	for i in SLICES:
		if _t[i] < 1.0:
			_t[i] += dt / (BLOOM if _open else FOLD)
			var u := clampf(_t[i], 0.0, 1.0)
			var to := 1.0 if _open else 0.0
			_k[i] = lerpf(_from[i], to, HudStyle.spring(u) if _open else HudStyle.eased(u))
			moving = true
		var want_hot := 1.0 if i == _hot else 0.0
		var want_sel := 1.0 if kind_in(i) == _sel else 0.0
		if _hot_e[i] != want_hot or _sel_e[i] != want_sel:
			_hot_e[i] = move_toward(_hot_e[i], want_hot, dt / 0.12)
			_sel_e[i] = move_toward(_sel_e[i], want_sel, dt / 0.16)
			moving = true
	var pool_want := 1.0 if _open else 0.0
	if _pool != pool_want:
		_pool = move_toward(_pool, pool_want, dt / (0.2 if _open else FOLD))
		moving = true
	if not moving:
		return
	var shut := not _open and _pool <= 0.0
	for i in SLICES:
		if _k[i] > 0.002:
			shut = false
	_pie.visible = not shut
	_title.visible = not shut
	if shut:
		for s in _slots:
			s.visible = false
		return
	_pie.paint(_k, _hot_e, _sel_e, _dim, _pool)
	for s in _slots:
		var i: int = SLOT[s.kind]
		var dir := Vector2(sin(i * TAU / SLICES), -cos(i * TAU / SLICES))
		var mid := HUB + POP * _hot_e[i] + (OUTER - HUB) * 0.5 * _k[i]
		s.place(_c + dir * mid, lerpf(0.5, 1.0, minf(_k[i], 1.2)) * (1.0 + 0.1 * _hot_e[i]), smoothstep(0.0, 0.4, _k[i]), _hot_e[i])
	# the title: the shot under the finger, or the one loaded
	var kind := kind_in(_hot) if _hot >= 0 else _sel
	if kind != _title_kind:
		_title_kind = kind
		_title_name.text = Ammo.NAME[kind]
		_title_name.add_theme_color_override("font_color", Ammo.COLOR[kind])
		var n := _stock[kind]
		_title_line.text = Ammo.GIST[kind] if n < 0 else "%s · %d left" % [Ammo.GIST[kind], n]
		_place_title()
	_title.modulate.a = _pool


func _input(event: InputEvent) -> void:
	# a touch anywhere else folds the open pie away
	if not _open or _finger >= 0 or _finger == -2:
		return
	var at: Variant = null
	if event is InputEventScreenTouch and event.pressed:
		at = event.position
	elif event is InputEventMouseButton and event.pressed and event.device != InputEvent.DEVICE_ID_EMULATION:
		at = event.position
	if at == null:
		return
	var p: Vector2 = get_global_transform().affine_inverse() * (at as Vector2)
	if _btn.get_rect().has_point(p) or takes(p - _c):
		return
	_finger = -1
	set_open(false)


## A press on a HUD button: a finger down, or the mouse's left button (not
## the mouse the engine makes of a touch).
static func pressed(event: InputEvent) -> bool:
	if event is InputEventScreenTouch:
		return event.pressed
	return event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION


## The shot button: glass tinted with the shot loaded, its ball, its count.
## It follows the finger that presses it until it lifts: down (1), moving
## (2) and lifted (3), at a point in the pie's control.
class _Button:
	extends Control
	signal touched(phase: int, finger: int, at: Vector2)

	var focus := false
	var _disc: ShotDisc
	var _icon: TextureRect
	var _count: Badge
	var _gain: Label
	var _kind := -1
	var _fw := "peony"
	var _n := 0
	var _focus_e := 0.0
	var _press := -1.0
	var _load := -1.0
	var _rise := -1.0

	func _init() -> void:
		var d := ShotPie.BTN
		custom_minimum_size = Vector2(d, d)
		size = custom_minimum_size
		position = -size * 0.5
		pivot_offset = size * 0.5
		mouse_filter = Control.MOUSE_FILTER_STOP
		_disc = ShotDisc.new(d, ShotDisc.Style.GLASS)
		_disc.put(&"tint", 0.22)
		_disc.put(&"c_glass", Color(ShotPie.GLASS, 0.8))
		_disc.put(&"c_foot", Color(ShotPie.FOOT, 0.9))
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
		_gain = ShotPie.rise_label()
		add_child(_gain)

	func set_firework(id: String) -> void:
		if id == _fw:
			return
		_fw = id
		if _kind == Ammo.FIREWORK:
			_kind = -1
			show_shot(Ammo.FIREWORK, _n)

	func show_shot(kind: int, n: int) -> void:
		_n = n
		var fw := kind == Ammo.FIREWORK
		var ac: Color = Fireworks.color(_fw) if fw else Ammo.COLOR[kind]
		if kind != _kind:
			_kind = kind
			_icon.texture = Icons.firework(_fw, size.x * 0.74) if fw else Icons.plunder(Ammo.ID[kind], size.x * 0.74, true)
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
		var phase := 0
		var finger := 0
		if event is InputEventScreenTouch:
			phase = 1 if event.pressed else 3
			finger = event.index
		elif event is InputEventScreenDrag:
			phase = 2
			finger = event.index
		elif event.device != InputEvent.DEVICE_ID_EMULATION:
			# the mouse stands in for a finger (-2)
			finger = -2
			if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
				phase = 1 if event.pressed else 3
			elif event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
				phase = 2
		if phase == 0:
			return
		accept_event()
		if phase == 1:
			_press = 0.0
		touched.emit(phase, finger, get_transform() * (event as InputEventFromWindow).position)

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


## The pie's glass, one quad the shader paints (shaders/shot_pie.gdshader),
## taking the taps on its slices while it's open for one.
class _Pie:
	extends Control
	signal tapped(v: Vector2)

	var _mat: ShaderMaterial
	var _ac := PackedVector4Array()

	func _init() -> void:
		var r := ShotPie.OUTER + ShotPie.POP + ShotPie.MARGIN
		size = Vector2(r, r) * 2.0
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		visible = false
		_mat = ShaderMaterial.new()
		_mat.shader = preload("res://shaders/shot_pie.gdshader")
		_mat.set_shader_parameter("quad", size)
		_mat.set_shader_parameter("hub", ShotPie.HUB)
		_mat.set_shader_parameter("outer", ShotPie.OUTER)
		_mat.set_shader_parameter("gap", ShotPie.GAP)
		_mat.set_shader_parameter("corner", ShotPie.CORNER)
		_mat.set_shader_parameter("pop", ShotPie.POP)
		_mat.set_shader_parameter("c_glass", Color(ShotPie.GLASS, 0.86))
		_mat.set_shader_parameter("c_foot", Color(ShotPie.FOOT, 0.94))
		_ac.resize(ShotPie.SLICES)
		for i in ShotPie.SLICES:
			var kind := ShotPie.kind_in(i)
			var c: Color = Ammo.COLOR[kind] if kind >= 0 else Color.WHITE
			_ac[i] = Vector4(c.r, c.g, c.b, 1.0 if kind >= 0 else 0.0)
		_mat.set_shader_parameter("ac", _ac)
		material = _mat

	func paint(grow: PackedFloat32Array, hot: PackedFloat32Array, sel: PackedFloat32Array, dim: PackedFloat32Array, pool: float) -> void:
		_mat.set_shader_parameter("grow", grow)
		_mat.set_shader_parameter("hot", hot)
		_mat.set_shader_parameter("sel", sel)
		_mat.set_shader_parameter("dim", dim)
		_mat.set_shader_parameter("pool", pool)

	## Only the slices with shot in them take a touch: the hub is the
	## button's, and the empty racks and the quad's corners let it through
	## to the guns and the sea.
	func _has_point(p: Vector2) -> bool:
		return ShotPie.takes(p - size * 0.5)

	func _gui_input(event: InputEvent) -> void:
		if ShotPie.pressed(event):
			accept_event()
			tapped.emit((event as InputEventFromWindow).position - size * 0.5)

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color.WHITE)


## A kind of shot on its slice: its ball and its name, what's left of it.
class _Slot:
	extends Control

	const ICON := 30.0 * HudStyle.KT

	var kind := 0
	var _body: Control
	var _icon: TextureRect
	var _label: Label
	var _count: Badge
	var _on := false
	var _alpha := 1.0
	var _deny := -1.0

	func _init(k: int) -> void:
		kind = k
		var d := ICON
		var kt := HudStyle.KT
		custom_minimum_size = Vector2(d, d)
		size = custom_minimum_size
		pivot_offset = size * 0.5
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		visible = false
		_body = Control.new()
		_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_body.size = size
		add_child(_body)
		_icon = TextureRect.new()
		_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_icon.texture = Icons.plunder(Ammo.ID[k], d, true)
		_icon.size = Vector2(d, d)
		_icon.position = Vector2(0.0, -4.0 * kt)
		_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_body.add_child(_icon)
		var px := 7.5 * kt
		_label = HudStyle.label(Ammo.SHORT[k].to_upper(), "inter", 800, roundi(px), HudStyle.INK_2, roundi(px * 0.12))
		_label.size = _label.get_combined_minimum_size()
		_label.position = Vector2((d - _label.size.x) * 0.5, d - 2.0 * kt)
		_body.add_child(_label)
		_count = Badge.new(Color(0.016, 0.063, 0.094, 0.92), HudStyle.INK, 9.0 * kt, 3.0 * kt, 16.0 * kt, Color(1, 1, 1, 0.14), 99, 1.55)
		_body.add_child(_count)
		_count.pin(Vector2(d + 6.0 * kt, -6.0 * kt), Vector2(1.0, 0.0))

	func set_firework(id: String) -> void:
		_icon.texture = Icons.firework(id, ICON)

	func show_state(on: bool, n: int) -> void:
		_on = on
		_count.set_text("∞" if n < 0 else str(n))
		_alpha = 0.42 if n == 0 else 1.0

	func deny() -> void:
		_deny = 0.0

	## On its slice: its centre, its size (1 full), how far it's faded in,
	## and how far it stands out under the finger.
	func place(at: Vector2, s: float, a: float, hot: float) -> void:
		visible = a > 0.0
		position = at - size * 0.5
		scale = Vector2(s, s)
		modulate.a = a * _alpha
		# the loaded kind's name in full ink, the one under the finger in its shot's colour
		var ink := HudStyle.INK if _on else HudStyle.INK_2
		_label.add_theme_color_override("font_color", ink.lerp(Ammo.COLOR[kind], hot))

	func _process(dt: float) -> void:
		if _deny >= 0.0:
			_deny += dt / 0.38
			_body.position.x = HudStyle.shake(_deny) * 3.0 * HudStyle.PX
			if _deny >= 1.0:
				_deny = -1.0
				_body.position.x = 0.0


## The "+n" that rises off a button when shot is found.
static func rise_label() -> Label:
	var l := HudStyle.label("", "inter", 800, roundi(11.0 * HudStyle.K), HudStyle.INK)
	l.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.55))
	l.add_theme_constant_override("shadow_offset_x", 0)
	l.add_theme_constant_override("shadow_offset_y", 2)
	l.add_theme_constant_override("shadow_outline_size", 5)
	l.modulate.a = 0.0
	return l
