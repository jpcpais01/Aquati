class_name Hud
extends CanvasLayer
## The voyage HUD, in the web game's glass and gold: who she is and how her
## hull holds up, with the gold, the hold (a tap peeks inside), ships sunk
## and isles charted under it (top left), the wind and the hour with the
## camera button (top right), the canvas set and the speed in knots with the
## shot rack beside them (bottom centre), the bars over enemy ships and the
## words rising off a fight or a haul, and on touch screens the helm ring,
## the sail lever (bottom left) and the guns with the shot button over them
## (bottom right). Built in code; each frame only changes text when the value
## it shows has changed.

signal sail_set(level: int)
signal view_pressed
## A gun button: +1 port, -1 starboard, 0 the big Fire.
signal fire_pressed(side: int)
## A kind of shot picked off the rack or the fan (Ammo).
signal ammo_picked(kind: int)

var controls: Controls

var _vignette: ColorRect
var _vig_mat: ShaderMaterial
var _ship_panel: PanelContainer
var _ship_box: StyleBoxFlat
var _ship_class: Label
var _ship_name: Label
var _hull: HullBar
var _hull_hp: Label
var _hull_max: Label
var _hull_low := false
var _hull_frac := -1.0
var _chips: HBoxContainer
var _gold: _Chip
var _hold: _Chip
var _kills: _Chip
var _isles: _Chip
var _peek: HoldPeek
var _status: Control
var _bars: EnemyBars
var _floaters: Floaters
var _pad: FirePad
var _touch_ui := false
var _pill: PanelContainer
var _pill_box: StyleBoxFlat
var _pips: _SailPips
var _rack: ShotRack
var _rack_sep: Control
var _fan: ShotFan
## The loaded shot's name and what it does, over the rack for a moment.
var _tag: PanelContainer
var _tag_name: Label
var _tag_line: Label
var _tag_kind := -1
var _tag_left := 0.0
var _tag_hover := false
var _tag_e := 0.0
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
var _fading: Tween


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

	# who she is and how her hull holds up, and the tally under her
	_status = Control.new()
	_status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_status)
	var k := HudStyle.K
	_ship_box = HudStyle.panel(14.0 * k, Vector2.ZERO)
	_ship_box.content_margin_left = 9.0 * k
	_ship_box.content_margin_right = 11.0 * k
	_ship_box.content_margin_top = 7.0 * k
	_ship_box.content_margin_bottom = 8.0 * k
	_ship_panel = PanelContainer.new()
	_ship_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ship_panel.add_theme_stylebox_override("panel", _ship_box)
	_ship_panel.custom_minimum_size = Vector2(228.0 * k, 0.0)
	var id := VBoxContainer.new()
	id.add_theme_constant_override("separation", 0)
	_ship_class = HudStyle.label("SLOOP", "inter", 700, roundi(7.5 * k), HudStyle.GOLD, 2)
	_ship_name = HudStyle.label("Kestrel", "cinzel", 700, roundi(13.0 * k), HudStyle.INK, 1)
	_ship_name.clip_text = true
	_ship_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	id.add_child(_ship_class)
	id.add_child(_ship_name)
	# the hull: a bar with plank seams, and what's left of her in numbers
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(7.0 * k))
	_hull = HullBar.new()
	_hull.custom_minimum_size = Vector2(0.0, maxf(4.0, 5.0 * k))
	_hull.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hull.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_hull)
	var num := HBoxContainer.new()
	num.add_theme_constant_override("separation", 0)
	_hull_hp = HudStyle.label("260", "inter", 800, roundi(12.0 * k), HudStyle.INK)
	_hull_max = HudStyle.label("/260", "inter", 600, roundi(8.5 * k), HudStyle.INK_3)
	_hull_max.size_flags_vertical = Control.SIZE_SHRINK_END
	_hull_max.custom_minimum_size = Vector2(0.0, 0.0)
	num.add_child(_hull_hp)
	num.add_child(_hull_max)
	row.add_child(num)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0.0, 5.0 * k)
	id.add_child(gap)
	id.add_child(row)
	_ship_panel.add_child(id)
	_status.add_child(_ship_panel)
	_chips = HBoxContainer.new()
	_chips.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_chips.add_theme_constant_override("separation", roundi(4.0 * k))
	_gold = _Chip.new("coin", "0")
	_hold = _Chip.new("crate", "0/10", true)
	_kills = _Chip.new("skull", "0")
	_isles = _Chip.new("isle", "0")
	for c: _Chip in [_gold, _hold, _kills, _isles]:
		_chips.add_child(c)
	_status.add_child(_chips)
	# a tap on the hold peeks inside
	_peek = HoldPeek.new()
	_peek.opener = _hold
	_hold.pressed.connect(func() -> void: _peek.toggle())
	root.add_child(_peek)

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

	# canvas and speed, and on a desktop the shot rack beside them
	_pill = PanelContainer.new()
	_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pill_box = HudStyle.panel(999, Vector2(18, 6))
	_pill.add_theme_stylebox_override("panel", _pill_box)
	var console := HBoxContainer.new()
	console.add_theme_constant_override("separation", roundi(4.0 * k))
	console.mouse_filter = Control.MOUSE_FILTER_IGNORE
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
	console.add_child(helm)
	# a hairline between the knots and the rack, a little clear of the knots
	_rack_sep = Control.new()
	_rack_sep.custom_minimum_size = Vector2(10.0 * k + 1.0, 34.0 * k)
	_rack_sep.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_rack_sep.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rack_sep.draw.connect(func() -> void: _rack_sep.draw_rect(Rect2(_rack_sep.size.x - 1.0, 0.0, 1.0, _rack_sep.size.y), Color(1, 1, 1, 0.08)))
	console.add_child(_rack_sep)
	_rack = ShotRack.new()
	_rack.picked.connect(func(kind: int) -> void: ammo_picked.emit(kind))
	_rack.hovered.connect(_rack_hover)
	console.add_child(_rack)
	_pill.add_child(console)
	root.add_child(_pill)
	_tag = PanelContainer.new()
	_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tag_box := HudStyle.panel(12.0 * k, Vector2(11.0 * k, 6.0 * k))
	tag_box.bg_color = Color(0.039, 0.11, 0.157, 0.88)
	_tag.add_theme_stylebox_override("panel", tag_box)
	var tag_col := VBoxContainer.new()
	tag_col.add_theme_constant_override("separation", 1)
	tag_col.alignment = BoxContainer.ALIGNMENT_END
	_tag_name = HudStyle.label("", "inter", 800, roundi(12.0 * k), HudStyle.INK, roundi(12.0 * k * 0.04))
	_tag_line = HudStyle.label("", "inter", 500, roundi(10.5 * k), HudStyle.INK_2)
	for l: Label in [_tag_name, _tag_line]:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		tag_col.add_child(l)
	_tag.add_child(tag_col)
	_tag.modulate.a = 0.0
	_tag.visible = false
	root.add_child(_tag)

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

	# numbers rising off a fight, and the bars over enemy ships (those under
	# the panels, as they're pinned to the ships)
	_floaters = Floaters.new()
	root.add_child(_floaters)
	_bars = EnemyBars.new()
	root.add_child(_bars)
	root.move_child(_bars, _status.get_index())

	# touch: the helm ring, the sail lever and the guns
	_helm = HelmRing.new()
	_helm.controls = controls
	_helm.visible = false
	root.add_child(_helm)
	_lever = SailLever.new()
	_lever.level_set.connect(func(n: int) -> void: sail_set.emit(n))
	root.add_child(_lever)
	_pad = FirePad.new()
	_pad.fire.connect(func(side: int) -> void: fire_pressed.emit(side))
	root.add_child(_pad)
	_fan = ShotFan.new()
	_fan.picked.connect(func(kind: int) -> void: ammo_picked.emit(kind))
	root.add_child(_fan)
	show_touch(controls != null and controls.touch)
	if controls:
		controls.touch_seen.connect(func() -> void: show_touch(true))

	get_viewport().size_changed.connect(_layout)
	_layout.call_deferred()


func _layout() -> void:
	var vp := get_viewport().get_visible_rect().size
	var mx := vp.x * 0.03
	var my := vp.y * 0.03
	_ship_panel.position = Vector2.ZERO
	_ship_panel.size = _ship_panel.get_combined_minimum_size()
	_chips.position = Vector2(0.0, _ship_panel.size.y + 5.0 * HudStyle.K)
	_chips.size = _chips.get_combined_minimum_size()
	_status.position = Vector2(mx, my)
	var ns := _nav.get_combined_minimum_size()
	_nav.size = ns
	var vb := _view.custom_minimum_size
	_view.position = Vector2(vp.x - mx - vb.x, my)
	_nav.position = Vector2(_view.position.x - 8.0 - ns.x, my + (vb.y - ns.y) * 0.5)
	var ps := _pill.get_combined_minimum_size()
	_pill.size = ps
	_pill.position = Vector2((vp.x - ps.x) * 0.5, vp.y - my - ps.y)
	_lever.position = Vector2(mx, vp.y - my - SailLever.TH)
	_pad.position = Vector2(vp.x - mx - _pad.size.x, vp.y - my - _pad.size.y)
	# the shot button rides over Fire, a little clear of it
	_fan.position = _pad.position + Vector2(FirePad.SIDE + FirePad.GAP + FirePad.MAIN * 0.5, _pad.size.y - FirePad.MAIN - 12.0 * HudStyle.KT - ShotFan.BTN * 0.5)
	_peek.place(Vector2(mx, my + _chips.position.y + _chips.size.y + 8.0 * HudStyle.K))
	_place_tag()
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
	_text("name", _ship_name, ship.ship_name)
	_vig_mat.set_shader_parameter("strength", vignette)


## The touch controls on (a touch was seen) or off.
func show_touch(on: bool) -> void:
	_touch_ui = on
	_lever.visible = on
	_pad.visible = on
	_fan.visible = on
	if not on:
		_fan.set_open(false)
	# the lever shows the canvas and the fan the shot, so the pill keeps just the knots
	_pips.visible = not on
	_rack.visible = not on
	_rack_sep.visible = not on
	_pill_box.content_margin_right = 18.0 if on else 5.0 * HudStyle.K
	if on:
		_tag_left = 0.0
		_tag_hover = false
	_layout()


## Her hull and the tally: a blow shakes the panel and flushes its edge coral.
func show_hull(ship: Ship, isles: int, isles_total: int) -> void:
	var frac := clampf(ship.hp / ship.max_hp, 0.0, 1.0)
	if absf(frac - _hull_frac) > 1e-4:
		if frac < _hull_frac - 0.001:
			_hull_flash()
		_hull.set_frac(frac, _hull_frac < 0.0)
		_hull_frac = frac
	_text("hp", _hull_hp, str(ceili(maxf(0.0, ship.hp))))
	_text("hpmax", _hull_max, "/%d" % roundi(ship.max_hp))
	var low := frac < HullBar.LOW
	if low != _hull_low:
		_hull_low = low
		_hull_hp.add_theme_color_override("font_color", Color("#ffb3a6") if low else HudStyle.INK)
	_gold.set_value(str(ship.gold), ship.gold)
	_kills.set_value(str(ship.kills), ship.kills)
	_isles.set_value("%d/%d" % [isles, isles_total], isles)


## The guns: each side's reload and readiness, and what the big Fire would
## loose (on the touch pad) or the reload halves round the shot loaded (on
## the rack).
func show_guns(ship: Ship, gun: Gunnery) -> void:
	var hot := func(b: Gunnery.Broadside) -> bool: return b.ready and b.target != null
	if _rack.visible:
		_rack.show_guns(ship.readiness(1), ship.can_fire(1), ship.readiness(-1), ship.can_fire(-1), hot.call(gun.port), hot.call(gun.starboard))
	if not _pad.visible:
		return
	var auto := gun.auto_side(ship) if ship.alive else 0
	var hot_a: bool = auto != 0 and hot.call(gun.side_of(auto))
	_pad.show_state(ship.readiness(1), ship.can_fire(1), ship.readiness(-1), ship.can_fire(-1), auto, hot.call(gun.port), hot.call(gun.starboard), hot_a)


## A side's guns are run out again mid-fight; or it was pressed too soon.
func guns_ready(side: int) -> void:
	_pad.ping(side)
	_rack.ping(side)


func guns_deny(side: int) -> void:
	_pad.deny(side)
	_rack.flash(side)


## The shot loaded and what's left of each kind (round shot -1, endless).
func show_ammo(sel: int, stock: PackedInt32Array) -> void:
	_rack.show_state(sel, stock)
	_fan.show_state(sel, stock)


## A kind of shot just loaded: the ball drops in, and (on a desktop) its name
## and what it does show over the rack for a moment.
func ammo_loaded(kind: int) -> void:
	_rack.loaded(kind)
	_fan.loaded()
	ammo_tag(kind)


## The loaded shot's name and what it does, over the rack for a moment.
func ammo_tag(kind: int) -> void:
	if _touch_ui:
		return
	_show_tag(kind)
	_tag_left = 2.4


## None of that shot left: its slot and its chip shake.
func ammo_deny(kind: int) -> void:
	_rack.deny(kind)
	_fan.deny(kind)


## Shot found in salvage: its slot (and the shot button) bump with a "+n".
func ammo_gain(kind: int, n: int) -> void:
	_rack.gain(kind, n)
	_fan.gain(kind, n)


func _rack_hover(kind: int) -> void:
	_tag_hover = kind >= 0
	if kind >= 0:
		_show_tag(kind)


func _show_tag(kind: int) -> void:
	if kind != _tag_kind:
		_tag_kind = kind
		_tag_name.text = Ammo.NAME[kind]
		_tag_name.add_theme_color_override("font_color", Ammo.COLOR[kind])
		var line: String = Ammo.BLURB[kind].split(". ")[0]
		_tag_line.text = line.trim_suffix(".")
		_tag.size = _tag.get_combined_minimum_size()
		_place_tag()
	_tag.visible = true


func _place_tag() -> void:
	# over the console's right end
	var k := HudStyle.K
	_tag.size = _tag.get_combined_minimum_size()
	_tag.position = Vector2(_pill.position.x + _pill.size.x - 8.0 * k - _tag.size.x, _pill.position.y - 10.0 * k - _tag.size.y)


func _process(dt: float) -> void:
	# the shot's tag: in on a short rise, out after a moment (or once the mouse leaves its slot)
	if _tag_left > 0.0:
		_tag_left -= dt
	var want := 1.0 if (_tag_left > 0.0 or _tag_hover) and not _touch_ui else 0.0
	if want != _tag_e or _tag.visible:
		_tag_e = move_toward(_tag_e, want, dt / 0.2)
		_tag.modulate.a = _tag_e
		var k := HudStyle.K
		_tag.position.y = _pill.position.y - 10.0 * k - _tag.size.y + (1.0 - HudStyle.eased(_tag_e)) * 6.0 * k
		if _tag_e <= 0.0:
			_tag.visible = false


## The hold: the room used of the room aboard on its chip (coral when it's
## full), and what the peek shows.
func show_hold(hold: Treasure.Hold) -> void:
	var used := hold.used()
	_hold.set_value("%d/%d" % [used, hold.capacity], used)
	_hold.set_full(used >= hold.capacity)


## The hold the peek looks into (a fresh voyage brings a fresh hold).
func watch_hold(hold: Treasure.Hold) -> void:
	_peek.watch(hold)


## Opens the hold's peek, or the touch shot fan (a set piece's view of them).
func open_peek() -> void:
	_peek.set_open(true)


func open_fan() -> void:
	_fan.set_open(true)


## The bars over the enemy ships in view.
func show_bars(ships: Array[Ship], player: Ship, cam: Camera3D) -> void:
	_bars.show_ships(ships, player, cam)


## Words rising off a point in the world, `lift` web px above it.
func floater(text: String, world_at: Vector3, cam: Camera3D, kind: Floaters.Kind = Floaters.Kind.GOOD, lift := 0.0) -> void:
	if cam.is_position_behind(world_at):
		return
	var at := cam.unproject_position(world_at)
	var vp := get_viewport().get_visible_rect().size
	if at.x < 0.0 or at.y < 0.0 or at.x > vp.x or at.y > vp.y:
		return
	_floaters.pop(text, at, kind, lift * HudStyle.PX)


## The floaters' looks and the HUD's art drawn once before they're needed.
func warm() -> void:
	_floaters.warm()


## A fresh voyage: a new hull's bar from full, the tally from nothing, the HUD back.
func reset() -> void:
	_hull_frac = -1.0
	for c: _Chip in [_gold, _hold, _kills, _isles]:
		c.reset()
	_peek.set_open(false)
	_fan.set_open(false)
	fade(true, 0.4)


## Fades the whole HUD out (her farewell) or back in.
func fade(on: bool, seconds := 0.6) -> void:
	var root := get_node("Root") as Control
	if _fading != null:
		_fading.kill()
	# hidden, its buttons let go and stop catching touches
	if on:
		root.visible = true
	_fading = root.create_tween()
	_fading.tween_property(root, "modulate:a", 1.0 if on else 0.0, seconds).set_trans(Tween.TRANS_SINE)
	if not on:
		_fading.tween_callback(func() -> void: root.visible = false)


func _hull_flash() -> void:
	# the edge flushes coral and the panel jolts left, then right
	var tw := _ship_panel.create_tween().set_parallel(true)
	_ship_box.border_color = Color(1.0, 0.459, 0.388, 0.9)
	tw.tween_property(_ship_box, "border_color", HudStyle.STROKE, 0.36).set_delay(0.09)
	var x0 := 0.0
	var j := 2.0 * HudStyle.K
	tw.tween_property(_ship_panel, "position:x", x0 - j, 0.09)
	tw.chain().tween_property(_ship_panel, "position:x", x0 + j, 0.11)
	tw.chain().tween_property(_ship_panel, "position:x", x0, 0.25).set_trans(Tween.TRANS_SINE)


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
	_card(panel, life)


## A fine piece of plunder hauled aboard: a toast with its portrait, its
## kicker in the colour of its rarity (2 rare .. 4 legendary), the card's
## edge violet for an epic find and gold and glowing for a legendary one.
func loot_toast(good: String, rarity: int, kicker: String, title: String, life := 3.0) -> void:
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := _toast_box.duplicate() as StyleBoxFlat
	box.content_margin_left = 10.0 * HudStyle.K
	box.content_margin_right = 18.0
	if rarity == 3:
		box.border_color = Color(0.769, 0.545, 1.0, 0.6)
	elif rarity >= 4:
		box.border_color = Color(1.0, 0.71, 0.18, 0.8)
		box.shadow_color = Color(1.0, 0.71, 0.18, 0.3)
		box.shadow_size = 18
		box.shadow_offset = Vector2.ZERO
	panel.add_theme_stylebox_override("panel", box)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var icon := TextureRect.new()
	icon.texture = Icons.plunder(good, 48.0)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = Vector2(48.0, 48.0)
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	var ink: Color = [HudStyle.GOLD, HudStyle.GOLD, Color("#6cc8ff"), Color("#c48bff"), Color("#ffbe3d")][clampi(rarity, 0, 4)]
	for l: Label in [HudStyle.label(kicker.to_upper(), "inter", 700, 9, ink, 2), HudStyle.label(title, "cinzel", 700, 15, HudStyle.INK, 1)]:
		l.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.6))
		l.add_theme_constant_override("shadow_offset_x", 0)
		l.add_theme_constant_override("shadow_offset_y", 1)
		col.add_child(l)
	row.add_child(col)
	panel.add_child(row)
	_card(panel, life)


## Sets a toast's card in the stack across the top: in on a spring from just
## above, out drifting up as it fades; three at most.
func _card(panel: PanelContainer, life: float) -> void:
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


## A tally on the HUD: a badge and a number, popping gold when it goes up;
## `clickable`, it opens something (the hold's peek).
class _Chip:
	extends PanelContainer
	signal pressed
	var _label: Label
	var _box: StyleBoxFlat
	var _value := -1
	var _text := ""
	var _full := false

	func _init(badge: String, text: String, clickable := false) -> void:
		var k := HudStyle.K
		mouse_filter = Control.MOUSE_FILTER_STOP if clickable else Control.MOUSE_FILTER_IGNORE
		if clickable:
			mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		_box = StyleBoxFlat.new()
		_box.bg_color = Color(0.031, 0.086, 0.125, 0.7)
		_box.border_color = Color(1, 1, 1, 0.08)
		_box.set_border_width_all(1)
		_box.set_corner_radius_all(99)
		_box.corner_detail = 8
		_box.anti_aliasing = true
		var disc := 11.0 * k
		# the badge art carries a margin round its disc (for the coin's glow)
		var slack := disc * 0.25
		_box.content_margin_left = 5.0 * k - slack
		_box.content_margin_right = 8.0 * k
		add_theme_stylebox_override("panel", _box)
		custom_minimum_size = Vector2(0.0, 21.0 * k)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", roundi(5.0 * k - slack))
		row.alignment = BoxContainer.ALIGNMENT_CENTER
		var icon := Icons.rect(badge, disc * 1.5)
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(icon)
		_label = HudStyle.label(text, "inter", 700, roundi(10.5 * k), HudStyle.INK)
		_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(_label)
		add_child(row)

	func reset() -> void:
		_value = -1
		_text = ""

	func _gui_input(event: InputEvent) -> void:
		if ShotFan.pressed(event):
			pressed.emit()
			accept_event()

	## Full up: its number turns coral.
	func set_full(full: bool) -> void:
		if full != _full:
			_full = full
			_label.add_theme_color_override("font_color", HudStyle.CORAL if full else HudStyle.INK)

	func set_value(text: String, value: int) -> void:
		if text == _text:
			return
		_text = text
		_label.text = text
		if _value >= 0 and value > _value:
			_bump()
		_value = value

	func _bump() -> void:
		pivot_offset = size * 0.5
		var tw := create_tween().set_parallel(true)
		tw.tween_property(self, "scale", Vector2(1.16, 1.16), 0.17).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(_box, "bg_color", Color(0.957, 0.78, 0.396, 0.35), 0.17)
		tw.chain().tween_property(self, "scale", Vector2.ONE, 0.33).set_trans(Tween.TRANS_SINE)
		tw.tween_property(_box, "bg_color", Color(0.031, 0.086, 0.125, 0.7), 0.33)
