class_name Hud
extends CanvasLayer
## The voyage HUD, in the web game's glass and gold: who she is (top left),
## the wind and the hour with the camera button (top right), the canvas set
## and the speed in knots (bottom centre), and on touch screens the helm ring
## and the sail lever. Built in code; each frame only changes text when the
## value it shows has changed.

signal sail_set(level: int)
signal view_pressed

var controls: Controls

var _vignette: ColorRect
var _vig_mat: ShaderMaterial
var _ship_panel: PanelContainer
var _ship_class: Label
var _ship_name: Label
var _pill: PanelContainer
var _pips: _SailPips
var _speed: Label
var _nav: PanelContainer
var _wind: _WindArrow
var _clock: Label
var _view: _ViewButton
var _lever: SailLever
var _helm: HelmRing
var _toasts: VBoxContainer
var _toast_box: StyleBoxFlat
var _shown := {}


func _ready() -> void:
	layer = 5
	var root := Control.new()
	root.name = "Root"
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	_vignette = ColorRect.new()
	_vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_vignette.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_vig_mat = ShaderMaterial.new()
	_vig_mat.shader = preload("res://shaders/vignette.gdshader")
	_vignette.material = _vig_mat
	root.add_child(_vignette)

	# who she is
	_ship_panel = PanelContainer.new()
	_ship_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ship_panel.add_theme_stylebox_override("panel", HudStyle.panel(14, Vector2(12, 7)))
	var id := VBoxContainer.new()
	id.add_theme_constant_override("separation", -2)
	_ship_class = HudStyle.label("SLOOP", "inter", 700, 10, HudStyle.INK_3, 2)
	_ship_name = HudStyle.label("Kestrel", "cinzel", 700, 19, HudStyle.INK)
	id.add_child(_ship_class)
	id.add_child(_ship_name)
	_ship_panel.add_child(id)
	root.add_child(_ship_panel)

	# the wind, the hour, the camera
	_nav = PanelContainer.new()
	_nav.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_nav.add_theme_stylebox_override("panel", HudStyle.panel(999, Vector2(12, 5)))
	var nav_row := HBoxContainer.new()
	nav_row.add_theme_constant_override("separation", 8)
	_wind = _WindArrow.new()
	_clock = HudStyle.label("09:00", "inter", 700, 14, HudStyle.INK_2)
	nav_row.add_child(_wind)
	nav_row.add_child(_clock)
	_nav.add_child(nav_row)
	root.add_child(_nav)
	_view = _ViewButton.new()
	_view.pressed.connect(func() -> void: view_pressed.emit())
	root.add_child(_view)

	# canvas and speed
	_pill = PanelContainer.new()
	_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pill.add_theme_stylebox_override("panel", HudStyle.panel(999, Vector2(18, 6)))
	var helm := HBoxContainer.new()
	helm.add_theme_constant_override("separation", 12)
	helm.alignment = BoxContainer.ALIGNMENT_CENTER
	_pips = _SailPips.new()
	helm.add_child(_pips)
	var sp := HBoxContainer.new()
	sp.add_theme_constant_override("separation", 5)
	_speed = HudStyle.label("0", "inter", 800, 25, HudStyle.INK, -1)
	_speed.custom_minimum_size = Vector2(32, 0)
	_speed.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var kn := HudStyle.label("KNOTS", "inter", 700, 9, HudStyle.INK_3, 2)
	kn.size_flags_vertical = Control.SIZE_SHRINK_END
	kn.custom_minimum_size = Vector2(0, 22)
	sp.add_child(_speed)
	sp.add_child(kn)
	helm.add_child(sp)
	_pill.add_child(helm)
	root.add_child(_pill)

	# touch: the helm ring and the sail lever
	_helm = HelmRing.new()
	_helm.controls = controls
	_helm.visible = false
	root.add_child(_helm)
	_lever = SailLever.new()
	_lever.level_set.connect(func(n: int) -> void: sail_set.emit(n))
	root.add_child(_lever)
	_lever.visible = controls != null and controls.touch
	if controls:
		controls.touch_seen.connect(func() -> void:
			_lever.visible = true
			_layout())

	# notes across the top: an island discovered
	_toasts = VBoxContainer.new()
	_toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toasts.add_theme_constant_override("separation", 5)
	_toasts.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_toasts.grow_horizontal = Control.GROW_DIRECTION_BOTH
	root.add_child(_toasts)
	_toast_box = HudStyle.panel(999, Vector2(16, 5))
	_toast_box.bg_color = Color(0.035, 0.1, 0.145, 0.66)
	_toast_box.border_color = Color(HudStyle.GOLD, 0.3)
	_toast_box.shadow_color = Color(0.0, 0.03, 0.055, 0.22)
	_toast_box.content_margin_bottom = 6

	get_viewport().size_changed.connect(_layout)
	_layout.call_deferred()


func _layout() -> void:
	var vp := get_viewport().get_visible_rect().size
	var mx := vp.x * 0.03
	var my := vp.y * 0.03
	_ship_panel.position = Vector2(mx, my)
	var ns := _nav.get_combined_minimum_size()
	_nav.size = ns
	var vb := _view.custom_minimum_size
	_view.position = Vector2(vp.x - mx - vb.x, my)
	_nav.position = Vector2(_view.position.x - 8.0 - ns.x, my + (vb.y - ns.y) * 0.5)
	var ps := _pill.get_combined_minimum_size()
	_pill.size = ps
	_pill.position = Vector2((vp.x - ps.x) * 0.5, vp.y - my - ps.y)
	_lever.position = Vector2(vp.x - mx - _lever.size.x, vp.y - my - _lever.size.y - 24.0)
	_toasts.offset_top = my


## The HUD's view of the voyage; text only changes when the number it shows does.
func show_state(ship: Ship, wind: Wind, hour: float, view: int, vignette: float) -> void:
	_text("speed", _speed, str(roundi(absf(ship.speed) * 1.94)))
	var lvl := roundi(ship.sail_target * 3.0)
	_pips.set_level(lvl)
	_lever.show_state(lvl, ship.sail_level)
	_wind.set_wind(wind.dir_x, wind.dir_z)
	var h := int(hour) % 24
	var m := int(fmod(hour, 1.0) * 60.0) / 10 * 10
	_text("clock", _clock, "%02d:%02d" % [h, m])
	_view.set_view(view)
	_helm.heading = ship.heading
	_text("class", _ship_class, ship.cls.name.to_upper())
	_text("name", _ship_name, ship.cls.title)
	_vig_mat.set_shader_parameter("strength", vignette)


## A note across the top of the screen, a gold kicker over a title (an
## island discovered), gone after `life` seconds; three at most.
func toast(kicker: String, title: String, life := 3.4) -> void:
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override("panel", _toast_box)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	for l: Label in [HudStyle.label(kicker.to_upper(), "inter", 700, 9, HudStyle.GOLD, 2), HudStyle.label(title, "cinzel", 700, 15, HudStyle.INK, 1)]:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.6))
		l.add_theme_constant_override("shadow_offset_x", 0)
		l.add_theme_constant_override("shadow_offset_y", 1)
		col.add_child(l)
	panel.add_child(col)
	# the stack lays out the slot; the card moves freely inside it
	var slot := Control.new()
	slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slot.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	slot.add_child(panel)
	_toasts.add_child(slot)
	while _toasts.get_child_count() > 3:
		var old := _toasts.get_child(0)
		_toasts.remove_child(old)
		old.queue_free()
	var size := panel.get_combined_minimum_size()
	slot.custom_minimum_size = size
	panel.size = size
	panel.pivot_offset = size * 0.5
	# in on a spring from just above, out drifting up as it fades
	panel.modulate.a = 0.0
	panel.position.y = -14.0
	panel.scale = Vector2(0.94, 0.94)
	var tw := panel.create_tween().set_parallel(true).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(panel, "modulate:a", 1.0, 0.35).set_trans(Tween.TRANS_SINE)
	tw.tween_property(panel, "position:y", 0.0, 0.55)
	tw.tween_property(panel, "scale", Vector2.ONE, 0.55)
	tw.chain().tween_property(panel, "modulate:a", 0.0, 0.6).set_delay(maxf(life - 0.55, 0.0)).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(panel, "position:y", -8.0, 0.6).set_delay(maxf(life - 0.55, 0.0)).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.chain().tween_callback(slot.queue_free)


func _text(key: String, l: Label, text: String) -> void:
	if _shown.get(key, "") != text:
		_shown[key] = text
		l.text = text


## Three little sails that fill gold as you set more canvas.
class _SailPips:
	extends Control
	var level := -1

	func _init() -> void:
		custom_minimum_size = Vector2(46, 14)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size_flags_vertical = Control.SIZE_SHRINK_CENTER

	func set_level(n: int) -> void:
		if n != level:
			level = n
			queue_redraw()

	func _draw() -> void:
		var x := 0.0
		var dims := [Vector2(11, 8), Vector2(13, 10), Vector2(14, 12)]
		for i in 3:
			var d: Vector2 = dims[i]
			var y0 := size.y - d.y
			var pts := PackedVector2Array([Vector2(x + d.x * 0.14, y0), Vector2(x + d.x * 0.86, y0), Vector2(x + d.x, size.y), Vector2(x, size.y)])
			if i < level:
				draw_polygon(pts, PackedColorArray([Color("#fffaf0"), Color("#fffaf0"), HudStyle.GOLD, HudStyle.GOLD]))
			else:
				draw_colored_polygon(pts, HudStyle.OFF)
			x += d.x + 4.0


## The wind's arrow, pointing the way it blows on screen (north is up).
class _WindArrow:
	extends Control
	var _angle := 999.0

	func _init() -> void:
		custom_minimum_size = Vector2(20, 20)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_wind(dx: float, dz: float) -> void:
		var a := atan2(dx, -dz)
		if absf(a - _angle) > 0.01:
			_angle = a
			queue_redraw()

	func _draw() -> void:
		var c := size * 0.5
		var s := size.x / 24.0
		draw_set_transform(c, _angle, Vector2(s, s))
		draw_colored_polygon(PackedVector2Array([Vector2(0, -10), Vector2(6, 8), Vector2(0, 4), Vector2(-6, 8)]), HudStyle.AQUA_HI)
		draw_colored_polygon(PackedVector2Array([Vector2(0, -10), Vector2(0, 4), Vector2(-6, 8)]), HudStyle.AQUA)
		draw_set_transform(Vector2.ZERO)


## The camera button: a lens and four pips for close, mid, far and leaned over.
class _ViewButton:
	extends Control
	signal pressed
	var view := -1

	func _init() -> void:
		custom_minimum_size = Vector2(44, 44)
		size = custom_minimum_size
		mouse_filter = Control.MOUSE_FILTER_STOP

	func set_view(v: int) -> void:
		if v != view:
			view = v
			queue_redraw()

	func _gui_input(event: InputEvent) -> void:
		if (event is InputEventScreenTouch and event.pressed) or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION):
			pressed.emit()
			accept_event()

	func _draw() -> void:
		draw_style_box(HudStyle.panel(12), Rect2(Vector2.ZERO, size))
		var c := Vector2(size.x * 0.5, size.y * 0.44)
		draw_arc(c + Vector2(-2, -2), 7.5, 0.0, TAU, 28, HudStyle.INK, 2.2, true)
		draw_line(c + Vector2(3.5, 3.5), c + Vector2(9, 9), HudStyle.INK, 2.6, true)
		for i in 4:
			var p := Vector2(size.x * 0.5 - 9.0 + i * 6.0, size.y - 7.0)
			draw_circle(p, 1.7, HudStyle.GOLD if i == view else HudStyle.INK_4, true, -1.0, true)
