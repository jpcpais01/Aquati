class_name FireworkPicker
extends PanelContainer
## The firework locker (the web's .fw-pick): which kind goes up with the next
## broadside of rockets. The ten kinds in a grid of five, the three
## showpieces under a gold rule, each with its portrait, its short name and
## how many are aboard; the one under the pointer (or loaded) named and
## described at the top. Opened from the rockets slot of the rack (once
## fireworks are loaded) or the rockets slice of the touch shot pie; a press
## anywhere else, or a few idle seconds on touch, folds it away.

signal picked(id: String)

const W := 372.0
## Seconds it stays open untouched on a touch screen.
const IDLE := 7.0

## What opened it: a press there leaves it to that control (which toggles it).
var opener: Control
## Folds away by itself when left alone (touch).
var idles := false

var _sel := "peony"
var _counts := {}
var _opts := {}
var _name: Label
var _line: Label
var _in := -1.0
var _idle := 0.0
var _y := 0.0


func _init() -> void:
	var k := HudStyle.K
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.035, 0.09, 0.14, 0.96)
	box.border_color = HudStyle.STROKE
	box.set_border_width_all(1)
	box.set_corner_radius_all(roundi(16.0 * k))
	box.corner_detail = 10
	box.anti_aliasing = true
	box.shadow_color = Color(0.0, 0.024, 0.047, 0.5)
	box.shadow_size = roundi(22.0 * k)
	box.shadow_offset = Vector2(0.0, 9.0 * k)
	box.content_margin_left = 10.0 * k
	box.content_margin_right = 10.0 * k
	box.content_margin_top = 10.0 * k
	box.content_margin_bottom = 8.0 * k
	add_theme_stylebox_override("panel", box)
	custom_minimum_size = Vector2(W * k, 0.0)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(col)
	var head := VBoxContainer.new()
	head.add_theme_constant_override("separation", roundi(2.0 * k))
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var h := roundi(9.5 * k)
	head.add_child(HudStyle.label("FIREWORK LOCKER", "inter", 700, h, HudStyle.INK_3, roundi(h * 0.22)))
	_name = HudStyle.label("", "inter", 800, roundi(13.0 * k), HudStyle.INK, roundi(13.0 * k * 0.02))
	head.add_child(_name)
	_line = HudStyle.label("", "inter", 500, roundi(10.5 * k), HudStyle.INK_2)
	_line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_line.custom_minimum_size = Vector2((W - 28.0) * k, 28.0 * k)
	head.add_child(_line)
	var hm := MarginContainer.new()
	hm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right"]:
		hm.add_theme_constant_override("margin_" + side, roundi(4.0 * k))
	hm.add_theme_constant_override("margin_bottom", roundi(8.0 * k))
	hm.add_child(head)
	col.add_child(hm)
	col.add_child(_grid(Fireworks.of_tier(0) + Fireworks.of_tier(1), 5, false))
	# the showpieces, under a gold rule
	var rule := HBoxContainer.new()
	rule.add_theme_constant_override("separation", roundi(8.0 * k))
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var line_l := _Rule.new()
	var line_r := _Rule.new()
	rule.add_child(line_l)
	rule.add_child(HudStyle.label("SHOWPIECES", "inter", 700, h, HudStyle.GOLD_HI, roundi(h * 0.22)))
	rule.add_child(line_r)
	var rm := MarginContainer.new()
	rm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rm.add_theme_constant_override("margin_top", roundi(10.0 * k))
	rm.add_theme_constant_override("margin_bottom", roundi(6.0 * k))
	rm.add_child(rule)
	col.add_child(rm)
	col.add_child(_grid(Fireworks.of_tier(2), 3, true))
	var foot := HudStyle.label("Sold by the pyrotechnists in trading ports · found in fine chests", "inter", 500, roundi(10.0 * k), HudStyle.INK_4)
	foot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	foot.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	foot.custom_minimum_size = Vector2((W - 20.0) * k, 0.0)
	var fm := MarginContainer.new()
	fm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fm.add_theme_constant_override("margin_top", roundi(8.0 * k))
	fm.add_child(foot)
	col.add_child(fm)
	_hover(_sel)


func _grid(ids: Array, cols: int, show: bool) -> GridContainer:
	var k := HudStyle.K
	var g := GridContainer.new()
	g.columns = cols
	g.add_theme_constant_override("h_separation", roundi(6.0 * k))
	g.add_theme_constant_override("v_separation", roundi(6.0 * k))
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for id: String in ids:
		var o := _Opt.new(id, show)
		o.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		o.chosen.connect(_on_chosen)
		o.hovered.connect(func(on: bool) -> void: _hover(id if on else _sel))
		g.add_child(o)
		_opts[id] = o
	return g


## What's in the locker ({id: count}) and the kind loaded.
func show_counts(counts: Dictionary, sel: String) -> void:
	_counts = counts.duplicate()
	_sel = sel
	for id: String in _opts:
		(_opts[id] as _Opt).show_state(int(_counts.get(id, 0)), id == sel)
	if visible:
		_hover(_sel)


func _hover(id: String) -> void:
	_name.text = Fireworks.kind(id).name
	_name.add_theme_color_override("font_color", Fireworks.color(id))
	_line.text = Fireworks.gist(id)


func _on_chosen(id: String) -> void:
	if int(_counts.get(id, 0)) <= 0:
		(_opts[id] as _Opt).deny()
		return
	picked.emit(id)
	set_open(false)


func is_open() -> bool:
	return visible


func toggle(anchor: Rect2) -> void:
	if visible:
		set_open(false)
	else:
		open_over(anchor)


## Opens above a rect on screen (what opened it), kept on screen.
func open_over(anchor: Rect2) -> void:
	_hover(_sel)
	visible = true
	size = get_combined_minimum_size()
	var vp := get_viewport_rect().size
	var sz := size * scale
	var x := clampf(anchor.position.x + anchor.size.x * 0.5 - sz.x * 0.5, 8.0, vp.x - sz.x - 8.0)
	_y = maxf(8.0, anchor.position.y - sz.y - 12.0)
	position = Vector2(x, _y).round()
	_in = 0.0
	_idle = 0.0
	modulate.a = 0.0


func set_open(open: bool) -> void:
	if not open:
		visible = false
	elif not visible:
		open_over(Rect2(get_viewport_rect().size * 0.5, Vector2.ZERO))


func _input(event: InputEvent) -> void:
	if not visible:
		return
	_idle = 0.0
	var at: Variant = null
	if event is InputEventScreenTouch and event.pressed:
		at = event.position
	elif event is InputEventMouseButton and event.pressed and event.device != InputEvent.DEVICE_ID_EMULATION:
		at = event.position
	if at == null or get_global_rect().has_point(at) or (opener != null and opener.is_visible_in_tree() and opener.get_global_rect().has_point(at)):
		return
	set_open(false)


func _process(dt: float) -> void:
	if not visible:
		return
	if idles:
		_idle += dt
		if _idle > IDLE:
			set_open(false)
			return
	if _in >= 0.0:
		_in += dt / 0.28
		var e := HudStyle.spring(minf(_in, 1.0))
		modulate.a = clampf(_in * 1.6, 0.0, 1.0)
		position.y = _y + (1.0 - e) * 8.0 * HudStyle.K
		if _in >= 1.0:
			_in = -1.0
			position.y = _y


## A gold hairline either side of the showpieces' heading.
class _Rule:
	extends Control

	func _init() -> void:
		size_flags_horizontal = Control.SIZE_EXPAND_FILL
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		custom_minimum_size = Vector2(0.0, 1.0)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var n := 12
		for i in n:
			var t := (i + 0.5) / n
			var a := 0.5 * sin(t * PI)
			draw_rect(Rect2(size.x * i / n, 0.0, size.x / n + 0.5, 1.0), Color(1.0, 0.843, 0.43, a))


## One kind in the locker.
class _Opt:
	extends Control
	signal chosen(id: String)
	signal hovered(on: bool)

	var id := ""
	var show := false
	var _n := 0
	var _on := false
	var _hover := false
	var _hover_e := 0.0
	var _deny := -1.0
	var _art: TextureRect
	var _label: Label
	var _count: Badge
	var _t := 0.0

	func _init(p_id: String, p_show: bool) -> void:
		id = p_id
		show = p_show
		var k := HudStyle.K
		var art := (46.0 if show else 38.0) * k
		custom_minimum_size = Vector2(0.0, art + 22.0 * k)
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		tooltip_text = "%s: %s" % [Fireworks.kind(id).name, Fireworks.kind(id).blurb]
		_art = TextureRect.new()
		_art.texture = Icons.firework(id, art)
		_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_art.size = Vector2(art, art)
		_art.pivot_offset = _art.size * 0.5
		_art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_art)
		_label = HudStyle.label(str(Fireworks.kind(id).short), "inter", 700, roundi(9.5 * k), HudStyle.INK_2, roundi(9.5 * k * 0.04))
		_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		add_child(_label)
		_count = Badge.new(Color(0.016, 0.063, 0.094, 0.9), HudStyle.INK, 9.0 * k, 3.0 * k, 15.0 * k, Color(1, 1, 1, 0.12), 99, 1.5)
		add_child(_count)
		mouse_entered.connect(func() -> void:
			_hover = true
			hovered.emit(true))
		mouse_exited.connect(func() -> void:
			_hover = false
			hovered.emit(false))

	func show_state(n: int, on: bool) -> void:
		_n = n
		_on = on
		_count.set_text(str(n))
		_count.set_colors(Color(0.016, 0.063, 0.094, 0.9), Color("#ff9d8c") if n <= 0 else HudStyle.INK, Color(1, 1, 1, 0.12))
		_label.add_theme_color_override("font_color", HudStyle.INK if on else HudStyle.INK_2)
		modulate = Color(1, 1, 1, 0.32) if n <= 0 else Color.WHITE
		queue_redraw()

	func deny() -> void:
		_deny = 0.0

	func _gui_input(event: InputEvent) -> void:
		var press: bool = (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT) or (event is InputEventScreenTouch and event.pressed)
		if press:
			chosen.emit(id)
			accept_event()

	func _notification(what: int) -> void:
		if what == NOTIFICATION_RESIZED:
			_layout()

	func _layout() -> void:
		var k := HudStyle.K
		_art.position = Vector2((size.x - _art.size.x) * 0.5, 6.0 * k)
		_label.size = Vector2(size.x, _label.get_combined_minimum_size().y)
		_label.position = Vector2(0.0, size.y - _label.size.y - 4.0 * k)
		_count.pin(Vector2(size.x - 4.0 * k, 3.0 * k), Vector2(1.0, 0.0))

	func _draw() -> void:
		var k := HudStyle.K
		var c := Fireworks.color(id)
		var r := Rect2(Vector2.ZERO, size)
		var sb := StyleBoxFlat.new()
		sb.set_corner_radius_all(roundi(12.0 * k))
		sb.corner_detail = 8
		sb.anti_aliasing = true
		var base := Color(0.04, 0.03, 0.016, 0.92) if show else Color(0.012, 0.04, 0.07, 0.9)
		sb.bg_color = base.lerp(c, 0.12 if show else 0.09)
		sb.set_border_width_all(roundi(2.0 * k) if _on else 1)
		sb.border_color = Color.WHITE if _on else (Color(1.0, 0.843, 0.43, 0.4) if show else Color(1, 1, 1, 0.07).lerp(Color(c, 0.55), _hover_e))
		if _on:
			sb.shadow_color = Color(c, 0.45)
			sb.shadow_size = roundi(10.0 * k)
		draw_style_box(sb, r)
		# a soft glow of its colour behind the portrait
		draw_circle(_art.position + _art.size * 0.5, _art.size.x * 0.42, Color(c, 0.1 + 0.06 * _hover_e))

	func _process(dt: float) -> void:
		var h := 1.0 if _hover and _n > 0 else 0.0
		var was := _hover_e
		_hover_e += (h - _hover_e) * MathX.damp(16.0, dt)
		if absf(_hover_e - was) > 0.002:
			queue_redraw()
		var x := 0.0
		if _deny >= 0.0:
			_deny += dt / 0.38
			x = HudStyle.shake(_deny) * 3.0 * HudStyle.K
			if _deny >= 1.0:
				_deny = -1.0
		var lift := -2.0 * HudStyle.K * _hover_e
		_art.position = Vector2((size.x - _art.size.x) * 0.5 + x, 6.0 * HudStyle.K + lift)
		if show and _n > 0:
			# the showpieces shimmer
			_t += dt
			var s := 0.5 + 0.5 * sin(_t * TAU / 2.6)
			_art.modulate = Color(1.0 + 0.15 * s, 1.0 + 0.15 * s, 1.0 + 0.15 * s)
