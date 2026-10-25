class_name Hud
extends CanvasLayer
## The voyage HUD, in the web game's glass and gold: who she is and how her
## hull holds up, with the gold, the hold (a tap peeks inside), ships sunk
## and isles charted under it (top left), the wind and the sky badge (the
## weather's picture and the clock: a tap on either picks the weather or the
## hour) with the camera button (top right), the canvas set and the speed in knots with the
## shot rack beside them (bottom centre; on touch the knots alone, riding on
## the sail lever), the bars over enemy ships and the
## words rising off a fight or a haul, and on touch screens the helm ring,
## the sail lever (bottom left) and the guns with the shot button over them
## (bottom right). Built in code; each frame only changes text when the value
## it shows has changed.

signal sail_set(level: int)
signal view_pressed
## The pause button: the voyage held, Anchored.
signal pause_pressed
## A gun button: +1 port, -1 starboard, 0 the big Fire.
signal fire_pressed(side: int)
## A kind of shot picked off the rack or the pie (Ammo).
signal ammo_picked(kind: int)
## A kind of firework picked from the locker (Fireworks.ORDER).
signal firework_picked(id: String)
## The sky badge tapped: its clock (true) or the weather's picture.
signal sky_tapped(clock: bool)
## The minimap was tapped: open the sea chart.
signal map_pressed
## A button with nothing more to say than its click (the hold's chip).
signal clicked
## The touch controls came up (a finger was seen) or went.
signal touch_set(on: bool)
## The helmsman's pill: the captain takes the helm back.
signal helm_cancel
## Ashore on touch: the Jump button.
signal jump_pressed
## Ashore on touch: the cutlass and the pistol.
signal strike_pressed
## Her power called on (an event ship's: the Hollow Jack's Phantom Run).
signal ability_pressed
## Her fate picked on the prize card: "prize" or "scuttle".
signal prize_picked(k: String)
signal pistol_pressed

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
## The speed's figure and unit, stacked on a desktop, side by side on touch.
var _speed_box: BoxContainer
var _pill: PanelContainer
var _pill_box: StyleBoxFlat
var _pips: _SailPips
var _rack: ShotRack
var _rack_sep: Control
var _pie: ShotPie
var _ability: AbilityButton
## Whether she has a power to show (Haunt).
var _has_ability := false
## The firework locker, over the rockets slot or the shot button.
var _fw_pick: FireworkPicker
var _fw := ""
var _fw_shown := ""
var _ammo_sel := 0
## The loaded shot's name and what it does, over the rack for a moment.
var _tag: PanelContainer
var _tag_name: Label
var _tag_line: Label
var _tag_kind := -1
var _tag_left := 0.0
var _tag_hover := false
var _tag_e := 0.0
var _speed: Label
var _kn: Label
var _nav: PanelContainer
var _wind: _WindArrow
var _clock: Label
var _clock_key: _SkyKey
var _sky_icon: _SkyKey
## What a tap on the sky badge chose, said for a moment beside it: a chip, or
## for a weather that waits for its time and place a card saying what for.
var _say: PanelContainer
var _say_box: StyleBoxFlat
var _say_lock: TextureRect
var _say_title: Label
var _say_line: Label
var _say_left := 0.0
var _say_e := 0.0
## The round minimap atop the corner column.
var minimap: Minimap
var _zoom: _ZoomButton
var _pause: UiButton
var _pins: PinTags
var _lever: SailLever
var _helm: HelmRing
var _ap: HelmPill
var _hz: HazardPill
## A fort's bar (and its title card), under the hazard pill.
var _ft: FortBar
var _prize: PrizeCard
## The Kraken's bar, cards, warnings and grip (its vignette lies low, by the hull's).
var _kr: KrakenHud
## Ashore: the sea's controls (the knots, the sail lever, the guns) stand down for the Jump button.
var _ashore := false
var _jump: UiButton
## Ashore: the landing party's health where the ship's panel was, bars over
## the cutthroats, the blades on touch, and the keys along the foot once.
var _party: PartyPanel
var _foes: FoeBars
var _blades: ShorePad
var _hint: PanelContainer
var _hint_t := 0.0
var _hz_room := -1.0
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
	_kr = KrakenHud.new()
	root.add_child(_kr.vig)

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
	_party = PartyPanel.new()
	_party.visible = false
	_status.add_child(_party)
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
	_hold.pressed.connect(func() -> void:
		clicked.emit()
		_peek.toggle())
	root.add_child(_peek)

	# the corner column (the web's .nav): the minimap, the wind and the sky
	# under it in a slim strip, and a row of round buttons under that
	minimap = Minimap.new()
	minimap.pressed.connect(func() -> void: map_pressed.emit())
	root.add_child(minimap)
	# the strip: the wind's arrow, a hairline, the weather and the clock
	var px := HudStyle.PX
	var strip := StyleBoxFlat.new()
	strip.bg_color = Color(8.0 / 255.0, 22.0 / 255.0, 32.0 / 255.0, 0.72)
	strip.border_color = Color(1.0, 1.0, 1.0, 0.08)
	strip.set_border_width_all(1)
	strip.set_corner_radius_all(99)
	strip.corner_detail = 10
	strip.anti_aliasing = true
	strip.content_margin_left = 8.0 * k
	strip.content_margin_right = 11.0 * k
	_nav = PanelContainer.new()
	_nav.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_nav.add_theme_stylebox_override("panel", strip)
	_nav.custom_minimum_size = Vector2(0.0, maxf(22.0 * px, 28.0 * k))
	var nav_row := HBoxContainer.new()
	nav_row.add_theme_constant_override("separation", 0)
	var icon := maxf(15.0 * px, 19.0 * k)
	_wind = _WindArrow.new()
	_wind.custom_minimum_size = Vector2(icon, icon)
	_wind.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	nav_row.add_child(_wind)
	nav_row.add_child(_gap(9.0 * k))
	# the hairline before the sky, inset so it never touches the rim
	var hair := ColorRect.new()
	hair.color = Color(1.0, 1.0, 1.0, 0.14)
	hair.custom_minimum_size = Vector2(1.0, roundf(_nav.custom_minimum_size.y * 0.56))
	hair.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	nav_row.add_child(hair)
	nav_row.add_child(_gap(9.0 * k - 1.0))
	_sky_icon = _SkyKey.new()
	_sky_icon.custom_minimum_size = Vector2(icon, icon)
	_sky_icon.pressed.connect(func() -> void: sky_tapped.emit(false))
	nav_row.add_child(_sky_icon)
	nav_row.add_child(_gap(6.0 * k))
	_clock = HudStyle.label("09:00", "inter", 700, roundi(maxf(10.0 * px, 12.0 * k)), HudStyle.INK, 1)
	_clock.add_theme_font_override("font", HudStyle.tnum(HudStyle.font("inter", 700, 1)))
	_clock_key = _SkyKey.new(_clock)
	_clock_key.pressed.connect(func() -> void: sky_tapped.emit(true))
	nav_row.add_child(_clock_key)
	_nav.add_child(nav_row)
	root.add_child(_nav)
	_say_box = HudStyle.panel(999, Vector2(11.0 * k, 0))
	_say_box.bg_color = Color(0.031, 0.086, 0.125, 0.82)
	_say_box.border_color = Color(1.0, 1.0, 1.0, 0.1)
	_say_box.shadow_color = Color(0.0, 0.03, 0.055, 0.25)
	_say_box.shadow_size = roundi(12.0 * px)
	_say_box.shadow_offset = Vector2(0.0, 6.0 * px)
	_say = PanelContainer.new()
	_say.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_say.add_theme_stylebox_override("panel", _say_box)
	_say.visible = false
	var say_col := VBoxContainer.new()
	say_col.add_theme_constant_override("separation", roundi(2.0 * k))
	say_col.alignment = BoxContainer.ALIGNMENT_CENTER
	var say_row := HBoxContainer.new()
	var say_px := roundi(maxf(10.0 * px, 12.0 * k))
	say_row.add_theme_constant_override("separation", roundi(say_px * 0.4))
	_say_lock = Icons.rect("lock", say_px * 0.85)
	_say_lock.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	say_row.add_child(_say_lock)
	_say_title = HudStyle.label("", "inter", 600, say_px, HudStyle.INK)
	say_row.add_child(_say_title)
	say_col.add_child(say_row)
	_say_line = HudStyle.label("", "inter", 500, roundi(maxf(10.0 * px, 11.5 * k)), Color(1.0, 1.0, 1.0, 0.78))
	_say_line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	say_col.add_child(_say_line)
	_say.add_child(say_col)
	root.add_child(_say)
	# the round buttons: pause, and the camera's zoom with its four stops
	_pause = _round_button("pause")
	_pause.pressed.connect(func() -> void: pause_pressed.emit())
	root.add_child(_pause)
	_zoom = _ZoomButton.new()
	_zoom.pressed.connect(func() -> void: view_pressed.emit())
	root.add_child(_zoom)

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
	# the speed: on a desktop the figure over its unit, like a gauge's
	# readout; on touch the figure and a small "kn" side by side
	var sp := BoxContainer.new()
	sp.add_theme_constant_override("separation", 5)
	_speed = HudStyle.label("0", "inter", 800, 25, HudStyle.INK, -1)
	_speed.custom_minimum_size = Vector2(32, 0)
	_speed.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_kn = HudStyle.label("KNOTS", "inter", 700, 9, HudStyle.INK_3, 2)
	_kn.size_flags_vertical = Control.SIZE_SHRINK_END
	_kn.custom_minimum_size = Vector2(0, 22)
	_speed_box = sp
	sp.add_child(_speed)
	sp.add_child(_kn)
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
	_rack.picked.connect(func(kind: int) -> void:
		# rockets already loaded: the locker opens to choose which kind
		if kind == Ammo.FIREWORK and _ammo_sel == Ammo.FIREWORK:
			_fw_pick.opener = _rack.slot(kind)
			_fw_pick.idles = false
			_fw_pick.toggle(_rack.slot(kind).get_global_rect())
		else:
			ammo_picked.emit(kind))
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

	# the helmsman's pill, low in the middle while he has the wheel
	_ap = HelmPill.new()
	_ap.cancel.connect(func() -> void: helm_cancel.emit())
	root.add_child(_ap)
	_hz = HazardPill.new()
	root.add_child(_hz)
	_ft = FortBar.new()
	root.add_child(_ft)
	root.add_child(_kr)
	_prize = PrizeCard.new()
	_prize.picked.connect(func(k: String) -> void: prize_picked.emit(k))
	root.add_child(_prize)

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
	_pins = PinTags.new()
	root.add_child(_pins)
	root.move_child(_pins, _status.get_index())

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
	_pie = ShotPie.new()
	_pie.picked.connect(func(kind: int) -> void:
		if kind == Ammo.FIREWORK:
			# on touch the rockets slice opens the locker: tapping a kind loads it
			_fw_pick.opener = null
			_fw_pick.idles = true
			_fw_pick.open_over(Rect2(_pie.global_position - Vector2.ONE * ShotPie.BTN * 0.5, Vector2.ONE * ShotPie.BTN))
		else:
			ammo_picked.emit(kind))
	root.add_child(_pie)
	_ability = AbilityButton.new()
	_ability.pressed.connect(func() -> void: ability_pressed.emit())
	_ability.visible = false
	root.add_child(_ability)
	_fw_pick = FireworkPicker.new()
	_fw_pick.picked.connect(func(id: String) -> void: firework_picked.emit(id))
	root.add_child(_fw_pick)
	# ashore on touch: a big round Jump under the right thumb
	var jd := 76.0 * HudStyle.KT
	_jump = UiButton.new(Vector2(jd, jd), jd * 0.5, 24.0 * HudStyle.PX)
	round_look(_jump)
	var ji := Icons.rect("jump", 30.0 * HudStyle.KT, HudStyle.INK)
	ji.position = Vector2((jd - ji.size.x) * 0.5, jd * 0.5 - ji.size.y * 0.62)
	ji.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_jump.add_child(ji)
	var jl := HudStyle.label("JUMP", "inter", 800, roundi(9.0 * HudStyle.KT), HudStyle.INK_3, roundi(9.0 * HudStyle.KT * 0.16))
	jl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	jl.size = Vector2(jd, jl.get_minimum_size().y)
	jl.position = Vector2(0.0, jd * 0.5 + ji.size.y * 0.42)
	jl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_jump.add_child(jl)
	_jump.held.connect(_on_jump_held)
	_jump.visible = false
	_blades = ShorePad.new()
	_blades.strike.connect(func() -> void: strike_pressed.emit())
	_blades.pistol.connect(func() -> void: pistol_pressed.emit())
	_blades.visible = false
	root.add_child(_blades)
	root.add_child(_jump)
	_foes = FoeBars.new()
	root.add_child(_foes)
	root.move_child(_foes, _bars.get_index() + 1)
	# the keys ashore, along the foot, until they've had a while to be read
	var hb := HudStyle.panel(999.0, Vector2(16.0, 7.0))
	_hint = PanelContainer.new()
	_hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hint.add_theme_stylebox_override("panel", hb)
	_hint.add_child(HudStyle.label("WASD walk  ·  Shift run  ·  Space jump  ·  Click cutlass  ·  Q pistol  ·  F act", "inter", 600, 12, HudStyle.INK_2))
	_hint.visible = false
	root.add_child(_hint)
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
	_party.position = Vector2.ZERO
	_party.size = _party.get_combined_minimum_size()
	var head := _party if _ashore else _ship_panel
	_chips.position = Vector2(0.0, head.size.y + 5.0 * HudStyle.K)
	_chips.size = _chips.get_combined_minimum_size()
	# a computer's HUD sits smaller than a phone's (the sea is the star, and
	# a mouse needs no thumb-sized targets): the status card, the corner
	# column and the console are scaled down from their top-left corners,
	# the corner's two buttons a little more
	var hk := _hk()
	var hb := hk * (0.86 if hk < 1.0 else 1.0)
	for c: Control in [_status, minimap, _nav, _pill, _tag, _fw_pick]:
		c.scale = Vector2(hk, hk)
	for c: UiButton in [_pause, _zoom]:
		# (buttons rest at a size round their centre, and squeeze from it)
		c.set_rest(hb)
	# the hold's peek is drawn at a phone's touch size: on a desktop it comes
	# down to the status card's scale
	var hp := hk * (HudStyle.K / HudStyle.PX) if hk < 1.0 else 1.0
	_peek.scale = Vector2(hp, hp)
	_status.position = Vector2(mx, my)
	# the corner column, centred under the minimap: the strip, then the
	# buttons (three to a row in the web's, so as wide as three)
	var k := HudStyle.K
	var b := _pause.size.x * hb
	var col_w := 3.0 * _pause.size.x * hk + 16.0 * k * hk
	var cx := vp.x - mx - col_w * 0.5
	minimap.position = Vector2(cx - Minimap.SIZE * hk * 0.5, my)
	var ns := _nav.get_combined_minimum_size()
	_nav.size = ns
	_nav.position = Vector2(roundf(cx - ns.x * hk * 0.5), my + (Minimap.SIZE + 9.0 * k) * hk)
	var by := _nav.position.y + (ns.y + 7.0 * k) * hk
	var gap := 8.0 * k * hk
	var inset := _pause.size * (1.0 - hb) * 0.5
	_pause.position = Vector2(cx - gap * 0.5 - b, by) - inset
	_zoom.position = Vector2(cx + gap * 0.5, by) - inset
	var ps := _pill.get_combined_minimum_size()
	_pill.size = ps
	_pill.position = Vector2((vp.x - ps.x * hk) * 0.5, vp.y - my - ps.y * hk)
	if _touch_ui:
		# the knots ride on top of the sail lever, so the foot of the screen
		# between the thumbs is free (for the prompt to come alongside)
		_pill.position = Vector2(mx, vp.y - my - SailLever.TH - 8.0 * HudStyle.PX - ps.y)
	_lever.position = Vector2(mx, vp.y - my - SailLever.TH)
	# the helmsman's pill: above the knots on a desktop; on touch, where the knots were
	_ap.place(Vector2(vp.x * 0.5, vp.y - my - (0.0 if _touch_ui else 66.0 * k)), minf(420.0 * k, vp.x - 2.0 * mx - 24.0 * HudStyle.PX))
	_pad.position = Vector2(vp.x - mx - _pad.size.x, vp.y - my - _pad.size.y)
	# ashore: the blades bottom right, the Jump riding over Strike
	_blades.position = Vector2(vp.x - mx - _blades.size.x, vp.y - my - _blades.size.y)
	var sc := _blades.strike_centre()
	_jump.position = Vector2(sc.x - _jump.size.x * 0.5, sc.y - FirePad.MAIN * 0.5 - 12.0 * HudStyle.KT - _jump.size.y)
	var hs := _hint.get_combined_minimum_size()
	_hint.size = hs
	_hint.position = Vector2((vp.x - hs.x) * 0.5, vp.y - my - hs.y)
	# the shot button rides over Fire, a little clear of it
	_pie.position = _pad.position + Vector2(FirePad.SIDE + FirePad.GAP + FirePad.MAIN * 0.5, _pad.size.y - FirePad.MAIN - 12.0 * HudStyle.KT - ShotPie.BTN * 0.5)
	# her power: on touch over Port, under the right thumb; on a computer beside the knots
	var am := AbilityButton.MARGIN
	if _touch_ui:
		_ability.scale = Vector2.ONE
		var port_top := _pad.position.y + _pad.size.y - FirePad.LIFT - FirePad.SIDE
		_ability.position = Vector2(_pad.position.x + FirePad.SIDE * 0.5 - _ability.size.x * 0.5, port_top - 14.0 * HudStyle.KT - AbilityButton.D - am)
	else:
		var ak := 0.62 * hk
		_ability.scale = Vector2(ak, ak)
		_ability.position = Vector2(_pill.position.x + ps.x * hk + 14.0 * k - am * ak, _pill.position.y + ps.y * hk * 0.5 - _ability.size.y * ak * 0.5)
	_ability.pivot_offset = Vector2.ZERO
	_ability.show_key(not _touch_ui)
	_peek.place(Vector2(mx, my + (_chips.position.y + _chips.size.y) * hk + 8.0 * HudStyle.K))
	_place_tag()
	_place_say()
	_hz.place(Vector2(vp.x * 0.5, my + 2.0 * HudStyle.PX), minf(560.0 * k, vp.x - 2.0 * mx - 2.0 * (Minimap.SIZE + 16.0 * k)))
	_ft.place(Vector2(vp.x * 0.5, my + 2.0 * HudStyle.PX + (_hz.size.y + 6.0 * k if _hz.on() else 0.0)), minf(560.0 * k, vp.x - 2.0 * mx - 2.0 * (Minimap.SIZE + 16.0 * k)))
	_kr.place(Vector2(vp.x * 0.5, my + 2.0 * HudStyle.PX + (_hz.size.y + 6.0 * k if _hz.on() else 0.0)), minf(460.0 * k, vp.x - 2.0 * mx - 2.0 * (Minimap.SIZE + 16.0 * k)))
	# the toasts step down under the pill and the bar while they're up
	_hz_room = _top_room()
	_toasts.offset_top = my + _hz_room


## A round glass button with a line icon (the web's .icon-btn in the corner).
func _round_button(icon: String) -> UiButton:
	var d := maxf(28.0 * HudStyle.PX, 32.0 * HudStyle.K)
	var b := UiButton.new(Vector2(d, d), d * 0.5, 24.0 * HudStyle.PX)
	round_look(b)
	var ic := Icons.rect(icon, maxf(13.0 * HudStyle.PX, 15.0 * HudStyle.K))
	ic.position = (b.size - ic.size) * 0.5
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(ic)
	return b


## The corner's round buttons: dark glass, a hairline, a soft shadow; they
## take the touch (the sea under them is not steered).
static func round_look(b: UiButton) -> void:
	var fill := Color(10.0 / 255.0, 28.0 / 255.0, 40.0 / 255.0, 0.78)
	b.p("c_top", fill).p("c_foot", fill).p("c_border", HudStyle.STROKE).p("hi", 0.09).p("hi_px", HudStyle.PX)
	b.p("c_shadow", Color(0.0, 8.0 / 255.0, 14.0 / 255.0, 0.2)).p("shadow", Vector2(6.0, 18.0) * HudStyle.PX)
	b.squeeze = 0.92
	b.mouse_filter = Control.MOUSE_FILTER_STOP


## A fixed gap in a row.
static func _gap(w: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(w, 0.0)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


## The helmsman's pill: his view of her course (Helmsman.view; {} while he
## hasn't the wheel), the rudder he holds, and the frame's seconds.
func show_helm(view: Dictionary, rudder: float, dt: float) -> void:
	_ap.show_view(view, rudder, dt)


## The sea's dangers: what has her watch's attention (HazardPill.show_view; {} for nothing).
func show_hazard(view: Dictionary) -> void:
	_hz.show_view(view)
	_restack()


## A fort in sight: its bar (FortBar.set_view; {} hides it).
func show_fort(view: Dictionary) -> void:
	_ft.show_bar(not view.is_empty())
	if not view.is_empty():
		_ft.set_view(view)
	_restack()


## A fort is yours: its title card.
func fort_taken(name_: String, line: String) -> void:
	_ft.taken(name_, line)


func fort_clear() -> void:
	_ft.clear()
	_restack()


## The Kraken: its HUD (KrakenHud) for the game to drive.
func kraken() -> KrakenHud:
	return _kr


## The Kraken's bar up or down (the toasts step out of its way).
func kraken_bar(on: bool) -> void:
	_kr.show_bar(on)
	_restack()


## How far down the top of the screen the pill and the fort's bar reach.
func _top_room() -> float:
	var k := HudStyle.K
	var room := _hz.size.y + 8.0 * k if _hz.on() else 0.0
	if _ft.on():
		room += _ft.height() + 8.0 * k
	if _kr.on():
		room += _kr.height() + 8.0 * k
	return room


## The fort's bar under the pill, the toasts under both.
func _restack() -> void:
	var room := _top_room()
	if room != _hz_room:
		_hz_room = room
		var vp := get_viewport().get_visible_rect().size
		var my := vp.y * 0.03
		_ft.place(Vector2(vp.x * 0.5, my + 2.0 * HudStyle.PX + (_hz.size.y + 6.0 * HudStyle.K if _hz.on() else 0.0)), _ft._most)
		_kr.place(Vector2(vp.x * 0.5, my + 2.0 * HudStyle.PX + (_hz.size.y + 6.0 * HudStyle.K if _hz.on() else 0.0) + (_ft.height() + 8.0 * HudStyle.K if _ft.on() else 0.0)), _kr._most)
		_toasts.offset_top = my + room


## Whether the helmsman's pill is up.
func helm_on() -> bool:
	return _ap.on()


## How tall the helmsman's pill stands while it's up (0 if not): the prompt to come alongside steps up over it.
func helm_height() -> float:
	return _ap.size.y if _ap.on() else 0.0


## The waypoints' tags where their pillars stand, or on the screen's edge.
func show_pins(pins: Waypoints, from: Vector3, cam: Camera3D, world: World) -> void:
	_pins.keep_off = _ap.get_rect() if _ap.on() else Rect2()
	_pins.show_pins(pins, from, cam, world)


## The HUD's view of the voyage; text only changes when the number it shows does.
func show_state(ship: Ship, wind: Wind, view: int, vignette: float) -> void:
	_text("speed", _speed, str(roundi(absf(ship.speed) * 1.94)))
	var lvl := roundi(ship.sail_target * 3.0)
	_pips.set_level(lvl)
	_lever.show_state(lvl, ship.sail_level)
	_wind.set_wind(wind.dir_x, wind.dir_z)
	_zoom.set_view(view)
	_helm.heading = ship.heading
	_text("class", _ship_class, ship.cls.name.to_upper())
	_text("name", _ship_name, ship.ship_name)
	_vig_mat.set_shader_parameter("strength", vignette)


## The sky badge: the clock (to five minutes, pale blue by night) and the
## weather's picture (Atmosphere.icon).
func show_sky(hour: float, icon: String) -> void:
	var m := int(fmod(hour, 24.0) * 60.0) / 5 * 5
	if _text("clock", _clock, "%02d:%02d" % [m / 60, m % 60]):
		var night := hour < 5.5 or hour > 19.5
		_clock.add_theme_color_override("font_color", Color("#d3dcff") if night else HudStyle.INK)
	if _shown.get("sky", "") != icon:
		_shown["sky"] = icon
		_sky_icon.set_icon(Icons.texture(icon, _sky_icon.custom_minimum_size.x))


## Gold pips on the weather's picture and on the clock while the weather or
## the hour is held rather than left to run.
func sky_pins(weather: bool, hour: bool) -> void:
	_sky_icon.set_pin(weather)
	_clock_key.set_pin(hour)


## Says what a tap on the sky badge chose, in a chip beside it. With `need`,
## it's a weather that can't be had here and now: a little card names it,
## locked, and says what it waits for, up long enough to read.
func sky_say(text: String, need := "") -> void:
	var card := need != ""
	_say_title.text = text
	_say_lock.visible = card
	_say_line.visible = card
	_say_line.text = need
	# a card as the web's .sky-say.need: 150 px wide, its padding 8 by 12 at its --k
	var k := HudStyle.K
	_say_line.custom_minimum_size = Vector2(150.0 * HudStyle.PX - 24.0 * k, 0.0) if card else Vector2.ZERO
	_say_box.set_corner_radius_all(roundi(12.0 * k) if card else 999)
	_say_box.content_margin_top = 8.0 * k if card else 0.0
	_say_box.content_margin_bottom = 8.0 * k if card else 0.0
	_say_box.content_margin_left = 12.0 * k if card else 11.0 * k
	_say_box.content_margin_right = 12.0 * k if card else 11.0 * k
	_say_title.add_theme_font_override("font", HudStyle.font("inter", 700 if card else 600))
	_say.custom_minimum_size = Vector2(0.0, 0.0 if card else _nav.size.y)
	_say.reset_size()
	_say_left = 4.2 if card else 1.8
	_say.visible = true
	_place_say()


func _place_say() -> void:
	if _say == null:
		return
	_say.size = _say.get_combined_minimum_size()
	var slide := (1.0 - HudStyle.eased(_say_e)) * 8.0 * HudStyle.PX
	_say.position = Vector2(_nav.position.x - 8.0 * HudStyle.K - _say.size.x + slide, _nav.position.y + (_nav.size.y * _hk() - _say.size.y) * 0.5)


## A soft ring ripples off the wind's arrow as the wind comes round.
func wind_shift() -> void:
	_wind.shift()


## The touch controls on (a touch was seen) or off.
func show_touch(on: bool) -> void:
	_touch_ui = on
	_apply_mode()
	# and on touch it's a slim chip over the sail lever: the number big, the unit a small "kn"
	var k := HudStyle.K
	_pill_box.content_margin_left = 9.0 * k if on else 18.0
	_pill_box.content_margin_right = 10.0 * k if on else 5.0 * k
	_pill_box.content_margin_top = 3.0 * k if on else 6.0
	_pill_box.content_margin_bottom = 3.0 * k if on else 6.0
	_pill_box.bg_color = Color(0.024, 0.078, 0.118, 0.5) if on else HudStyle.PANEL
	_pill_box.shadow_size = 0 if on else 10
	_speed.add_theme_font_size_override("font_size", roundi(maxf(17.0 * HudStyle.PX, 22.0 * k)) if on else 25)
	var kn_px := roundi(maxf(8.5 * HudStyle.PX, 9.5 * k))
	_kn.text = "kn" if on else "KNOTS"
	_kn.add_theme_font_override("font", HudStyle.font("inter", 700, roundi(kn_px * 0.04) if on else 2))
	_kn.add_theme_font_size_override("font_size", kn_px if on else 9)
	_kn.custom_minimum_size = Vector2(0.0, 23.0 if on else 0.0)
	_speed_box.vertical = not on
	_speed_box.alignment = BoxContainer.ALIGNMENT_BEGIN if on else BoxContainer.ALIGNMENT_CENTER
	_speed_box.add_theme_constant_override("separation", roundi(2.0 * HudStyle.PX) if on else -5)
	_speed.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if on else HORIZONTAL_ALIGNMENT_CENTER
	_speed.custom_minimum_size = Vector2(32.0 if on else 44.0, 0.0)
	_kn.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT if on else HORIZONTAL_ALIGNMENT_CENTER
	_kn.size_flags_vertical = Control.SIZE_SHRINK_END if on else Control.SIZE_SHRINK_CENTER
	_kn.size_flags_horizontal = Control.SIZE_FILL if on else Control.SIZE_SHRINK_CENTER
	if on:
		_tag_left = 0.0
		_tag_hover = false
	_layout()
	touch_set.emit(on)


func touch_ui() -> bool:
	return _touch_ui


## How much smaller than a phone's the HUD sits: a desktop with keys and a
## mouse takes it at 0.9.
func _hk() -> float:
	return 0.9 if Settings.desktop and not _touch_ui else 1.0


## Ashore (`on`) or afloat: the knots, the sail lever, the guns and the
## shot stand down while the captain walks, and on touch the Jump comes up.
func set_ashore(on: bool, isle := "", head := "LANDING PARTY") -> void:
	_party.set_isle(isle, head)
	if not on:
		show_prize({})
	if on == _ashore:
		return
	_ashore = on
	_ship_panel.visible = not on
	_party.visible = on
	if not on:
		_foes.clear()
	# the keys show a while each time ashore, then fade
	_hint_t = 14.0 if on else 0.0
	_hint.modulate.a = 1.0
	_apply_mode()
	_layout()


## Ashore, each frame: the party's health, the pistol's load, and bars over the foes in the fight.
func show_shore(shore: Shore, cam: Camera3D) -> void:
	var rows := []
	for m in shore.party:
		rows.append([m.name, m.walker.hp, m.walker.max_hp, m.walker.is_down()])
	_party.show_party(rows)
	var ps := _party.get_combined_minimum_size()
	if ps != _party.size:
		_layout()
	_blades.show_state(shore.pistol_load(), shore.fighting())
	_foes.show_foes(shore.foes, cam)


func _on_jump_held(on: bool) -> void:
	if on:
		jump_pressed.emit()


func _apply_mode() -> void:
	var on := _touch_ui
	var sea := not _ashore
	_lever.visible = on and sea
	_pad.visible = on and sea
	_pie.visible = on and sea
	if not on or not sea:
		_pie.set_open(false)
	if not sea:
		_fw_pick.set_open(false)
	_jump.visible = on and not sea
	_blades.visible = on and not sea
	_hint.visible = not on and not sea and _hint_t > 0.0
	_pill.visible = sea
	_ability.visible = sea and _has_ability
	# the lever shows the canvas and the pie the shot, so the pill keeps just the knots
	_pips.visible = not on
	_rack.visible = not on
	_rack_sep.visible = not on


## Her power each frame (null: she has none).
func show_ability(h: Haunt) -> void:
	var has := h != null
	if has != _has_ability:
		_has_ability = has
		_apply_mode()
	if not has:
		return
	var left := clampf((Haunt.SPAN - h.t) / Haunt.SPAN, 0.0, 1.0) if h.state == Haunt.PHANTOM else 0.0
	_ability.show_state(h.ready01(), 1.0 if h.state == Haunt.PHANTOM else 0.0, left)


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
	_ammo_sel = sel
	_rack.show_state(sel, stock)
	_pie.show_state(sel, stock)


## The firework locker ({id: count}) and the kind chosen, which the rockets
## slot and the shot button wear.
func show_fireworks(counts: Dictionary, sel: String) -> void:
	var key := "%s:%s" % [sel, counts]
	if key == _fw_shown:
		return
	_fw_shown = key
	_fw_pick.show_counts(counts, sel)
	if sel != _fw:
		_fw = sel
		_tag_kind = -1
	_rack.set_firework(sel)
	_pie.set_firework(sel)


## A set piece's view of the firework locker: open over the rockets slot
## (or, on touch, the shot button).
func open_locker() -> void:
	if _rack.visible:
		_fw_pick.opener = _rack.slot(Ammo.FIREWORK)
		_fw_pick.idles = false
		_fw_pick.open_over(_rack.slot(Ammo.FIREWORK).get_global_rect())
	else:
		_fw_pick.opener = null
		_fw_pick.idles = true
		_fw_pick.open_over(Rect2(_pie.global_position - Vector2.ONE * ShotPie.BTN * 0.5, Vector2.ONE * ShotPie.BTN))


func close_fw_picker() -> void:
	_fw_pick.set_open(false)


## A kind of shot just loaded: the ball drops in, and (on a desktop) its name
## and what it does show over the rack for a moment.
func ammo_loaded(kind: int) -> void:
	_rack.loaded(kind)
	_pie.loaded()
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
	_pie.deny(kind)


## Shot found in salvage: its slot (and the shot button) bump with a "+n".
func ammo_gain(kind: int, n: int) -> void:
	_rack.gain(kind, n)
	_pie.gain(kind, n)


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
		if kind == Ammo.FIREWORK:
			# rockets: the kind chosen, and how to choose another
			_tag_name.text = "Fireworks · %s" % Fireworks.kind(_fw).name
			_tag_name.add_theme_color_override("font_color", Fireworks.color(_fw))
			_tag_line.text = "Press 6 again, or click, to choose another kind"
		_tag.size = _tag.get_combined_minimum_size()
		_place_tag()
	_tag.visible = true


func _place_tag() -> void:
	# over the console's right end
	var k := HudStyle.K
	_tag.size = _tag.get_combined_minimum_size()
	var hk := _hk()
	_tag.position = Vector2(_pill.position.x + (_pill.size.x - 8.0 * k - _tag.size.x) * hk, _pill.position.y - (10.0 * k + _tag.size.y) * hk)


func _process(dt: float) -> void:
	# the shot's tag: in on a short rise, out after a moment (or once the mouse leaves its slot)
	if _tag_left > 0.0:
		_tag_left -= dt
	var want := 1.0 if (_tag_left > 0.0 or _tag_hover) and not _touch_ui else 0.0
	if want != _tag_e or _tag.visible:
		_tag_e = move_toward(_tag_e, want, dt / 0.2)
		_tag.modulate.a = _tag_e
		var k := HudStyle.K
		_tag.position.y = _pill.position.y - (10.0 * k + _tag.size.y) * _hk() + (1.0 - HudStyle.eased(_tag_e)) * 6.0 * k
		if _tag_e <= 0.0:
			_tag.visible = false
	# the keys ashore fade once they've had a while to be read
	if _hint.visible:
		_hint_t -= dt
		_hint.modulate.a = clampf(_hint_t / 1.2, 0.0, 1.0)
		if _hint_t <= 0.0:
			_hint.visible = false
	# the guns dim under the open shot pie
	var guns := 1.0 - 0.6 * _pie.openness()
	if _pad.modulate.a != guns:
		_pad.modulate.a = guns
	# the sky badge's say: in on a short slide, out once it has been read
	if _say.visible:
		_say_left -= dt
		_say_e = move_toward(_say_e, 1.0 if _say_left > 0.0 else 0.0, dt / (0.25 if _say_left > 0.0 else 0.3))
		_say.modulate.a = _say_e
		_place_say()
		if _say_e <= 0.0 and _say_left <= 0.0:
			_say.visible = false


## The hold: the room used of the room aboard on its chip (coral when it's
## full), and what the peek shows.
func show_hold(hold: Treasure.Hold) -> void:
	var used := hold.used()
	_hold.set_value("%d/%d" % [used, hold.capacity], used)
	_hold.set_full(used >= hold.capacity)


## The hold the peek looks into (a fresh voyage brings a fresh hold).
func watch_hold(hold: Treasure.Hold) -> void:
	_peek.watch(hold)


## Opens the hold's peek, or the touch shot pie (a set piece's view of them:
## the pie open for a tap, or held with a finger on a kind of shot).
func open_peek() -> void:
	_peek.set_open(true)


func open_pie(held := -1) -> void:
	if held >= 0:
		_pie.show_held(held)
	else:
		_pie.set_open(true)


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


## The back button: the hold's peek or the shot pie, open, folds away
## (true if one did).
func close_popups() -> bool:
	var was := _peek.visible or _pie.is_open() or _fw_pick.is_open()
	_peek.set_open(false)
	_pie.set_open(false)
	_fw_pick.set_open(false)
	return was


## The prize card ({name, haul, prize, scuttle}; {} takes it down).
func show_prize(v: Dictionary) -> void:
	if v.is_empty():
		_prize.close()
		return
	_prize.touch = _touch_ui
	_prize.open(v)


func prize_open() -> bool:
	return _prize.is_open()


## A fresh voyage: a new hull's bar from full, the tally from nothing, the HUD back.
func reset() -> void:
	_prize.close()
	_hull_frac = -1.0
	for c: _Chip in [_gold, _hold, _kills, _isles]:
		c.reset()
	_peek.set_open(false)
	_pie.set_open(false)
	_fw_pick.set_open(false)
	_kr.clear()
	_restack()
	fade(true, 0.4)


## Fades the whole HUD out (her farewell) or back in (at once: no `seconds`).
func fade(on: bool, seconds := 0.6) -> void:
	var root := get_node("Root") as Control
	if _fading != null:
		_fading.kill()
		_fading = null
	# hidden, its buttons let go and stop catching touches
	if seconds <= 0.0:
		root.modulate.a = 1.0 if on else 0.0
		root.visible = on
		return
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
## A find told with its picture (`art`): plunder of a `rarity` (0..4), or a
## ship part as the web ranks them (0, 2, 3, 4, and 5 for a mythic one,
## edged in violet in a glow of its kind's colours, its kicker running
## aqua to violet to pink).
func loot_toast(art: Texture2D, rarity: int, kicker: String, title: String, life := 3.0) -> void:
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := _toast_box.duplicate() as StyleBoxFlat
	box.content_margin_left = 10.0 * HudStyle.K
	box.content_margin_right = 18.0
	if rarity == 3:
		box.border_color = Color(0.769, 0.545, 1.0, 0.6)
	elif rarity == 4:
		box.border_color = Color(1.0, 0.71, 0.18, 0.8)
		box.shadow_color = Color(1.0, 0.71, 0.18, 0.3)
		box.shadow_size = 18
		box.shadow_offset = Vector2.ZERO
	elif rarity >= 5:
		# (its glows are drawn behind it, and its drop shadow would only dull them)
		box.border_color = Color(0.776, 0.608, 1.0, 0.9)
		box.shadow_color = Color(0.0, 0.0, 0.0, 0.0)
	panel.add_theme_stylebox_override("panel", box)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var icon := TextureRect.new()
	icon.texture = art
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = Vector2(48.0, 48.0)
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	var ink: Color = [HudStyle.GOLD, HudStyle.GOLD, Color("#6cc8ff"), Color("#c48bff"), Color("#ffbe3d"), Color.WHITE][clampi(rarity, 0, 5)]
	var lines: Array[Label] = [HudStyle.label(kicker.to_upper(), "inter", 700, 9, ink, 2), HudStyle.label(title, "cinzel", 700, 15, HudStyle.INK, 1)]
	for l in lines:
		l.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.6))
		l.add_theme_constant_override("shadow_offset_x", 0)
		l.add_theme_constant_override("shadow_offset_y", 1)
		col.add_child(l)
	row.add_child(col)
	panel.add_child(row)
	var glow: UiBox = null
	if rarity >= 5:
		# the kicker's colours run across the words' column (no shadow under them)
		var w := col.get_combined_minimum_size().x
		lines[0].remove_theme_color_override("font_shadow_color")
		lines[0].material = HudStyle.text_grad([Color("#7fe8ff"), Color("#c69bff"), Color("#ff5f9e"), Color("#ff5f9e"), Vector2(0.5, 1.0)], 0.0, maxf(w, 1.0), true)
		# two glows round it, aqua wide and pink close in, under its drop shadow
		var sz := panel.get_combined_minimum_size()
		glow = UiBox.new(sz, sz.y * 0.5, 60.0 * HudStyle.K)
		glow.p("c_top", Color(0.0, 0.0, 0.0, 0.0)).p("c_foot", Color(0.0, 0.0, 0.0, 0.0)).p("border", 0.0).p("hi", 0.0)
		glow.p("c_glow", Color(0.498, 0.91, 1.0, 0.35)).p("glow", 40.0 * HudStyle.K)
		glow.p("c_shadow", Color(1.0, 0.373, 0.62, 0.3)).p("shadow", Vector2(0.0, 22.0 * HudStyle.K))
	_card(panel, life, glow)


## Sets a toast's card in the stack across the top: in on a spring from just
## above, out drifting up as it fades; three at most. A `glow` behind it
## rides with it.
func _card(panel: PanelContainer, life: float, glow: UiBox = null) -> void:
	# the stack lays out the slot; the card moves freely inside it
	var slot := Control.new()
	slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slot.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var card: Control = panel
	if glow != null:
		card = Control.new()
		card.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(glow)
		card.add_child(panel)
	slot.add_child(card)
	_toasts.add_child(slot)
	while _toasts.get_child_count() > 3:
		var old := _toasts.get_child(0)
		_toasts.remove_child(old)
		old.queue_free()
	var size := panel.get_combined_minimum_size()
	slot.custom_minimum_size = size
	panel.size = size
	card.size = size
	card.pivot_offset = size * 0.5
	card.modulate.a = 0.0
	card.position.y = -14.0
	card.scale = Vector2(0.94, 0.94)
	var tw := card.create_tween().set_parallel(true).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(card, "modulate:a", 1.0, 0.35).set_trans(Tween.TRANS_SINE)
	tw.tween_property(card, "position:y", 0.0, 0.55)
	tw.tween_property(card, "scale", Vector2.ONE, 0.55)
	tw.chain().tween_property(card, "modulate:a", 0.0, 0.6).set_delay(maxf(life - 0.55, 0.0)).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(card, "position:y", -8.0, 0.6).set_delay(maxf(life - 0.55, 0.0)).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.chain().tween_callback(slot.queue_free)


func _text(key: String, l: Label, text: String) -> bool:
	if _shown.get(key, "") == text:
		return false
	_shown[key] = text
	l.text = text
	return true


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


## The wind's arrow, pointing the way it blows on screen (north is up); as
## the wind comes round, three soft rings ripple off it.
class _WindArrow:
	extends Control
	const RING := 1.6
	var _angle := 999.0
	var _ring := -1.0

	func _init() -> void:
		custom_minimum_size = Vector2(20, 20)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_process(false)

	func set_wind(dx: float, dz: float) -> void:
		var a := atan2(dx, -dz)
		if absf(a - _angle) > 0.01:
			_angle = a
			queue_redraw()

	func shift() -> void:
		_ring = 0.0
		set_process(true)

	func _process(dt: float) -> void:
		_ring += dt
		if _ring >= RING * 3.0:
			_ring = -1.0
			set_process(false)
		queue_redraw()

	func _draw() -> void:
		var c := size * 0.5
		if _ring >= 0.0:
			var t := HudStyle.eased(fmod(_ring, RING) / RING)
			draw_arc(c, (size.x * 0.5 + 4.0) * lerpf(0.6, 1.7, t), 0.0, TAU, 40, Color(HudStyle.AQUA, 0.9 * (1.0 - t)), 1.5, true)
		var s := size.x / 24.0
		draw_set_transform(c, _angle, Vector2(s, s))
		draw_colored_polygon(PackedVector2Array([Vector2(0, -10), Vector2(6, 8), Vector2(0, 4), Vector2(-6, 8)]), HudStyle.AQUA_HI)
		draw_colored_polygon(PackedVector2Array([Vector2(0, -10), Vector2(0, 4), Vector2(-6, 8)]), HudStyle.AQUA)
		draw_set_transform(Vector2.ZERO)


## One of the sky badge's two soft keys, the weather's picture or the clock:
## it lights up under the mouse and dips when pressed (a halo round it, so the
## pill never changes size), and a gold pip marks a weather or an hour held.
class _SkyKey:
	extends MarginContainer
	signal pressed
	var _tex: Texture2D
	var _hover := false
	var _down := 0.0
	var _pin := 0.0
	var _pin_to := 0.0

	func _init(label: Label = null) -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		for side in ["left", "right", "top", "bottom"]:
			add_theme_constant_override("margin_" + side, 0)
		if label != null:
			add_child(label)
		else:
			custom_minimum_size = Vector2(20, 20)
		mouse_entered.connect(func() -> void:
			_hover = true
			queue_redraw())
		mouse_exited.connect(func() -> void:
			_hover = false
			queue_redraw())
		set_process(false)

	func set_icon(tex: Texture2D) -> void:
		_tex = tex
		queue_redraw()

	func set_pin(on: bool) -> void:
		_pin_to = 1.0 if on else 0.0
		set_process(true)

	# a fingertip's worth more to hit than the glyph itself (only half the gap
	# between the two keys sideways, so each keeps its own side)
	func _has_point(p: Vector2) -> bool:
		return Rect2(Vector2(-3.0, -10.0), size + Vector2(6.0, 20.0)).has_point(p)

	func _gui_input(event: InputEvent) -> void:
		if ShotPie.pressed(event):
			_down = 1.0
			set_process(true)
			pressed.emit()
			accept_event()

	func _process(dt: float) -> void:
		_down = move_toward(_down, 0.0, dt / 0.22)
		_pin = move_toward(_pin, _pin_to, dt / 0.28)
		pivot_offset = size * 0.5
		scale = Vector2.ONE * (1.0 - 0.1 * sin(_down * PI * 0.5))
		if _down <= 0.0 and _pin == _pin_to:
			set_process(false)
		queue_redraw()

	func _draw() -> void:
		var glow := maxf(0.12 if _hover and not Settings.mobile else 0.0, 0.2 * _down)
		if glow > 0.0:
			var halo := StyleBoxFlat.new()
			halo.bg_color = Color(1.0, 1.0, 1.0, glow)
			halo.set_corner_radius_all(99)
			halo.corner_detail = 8
			halo.anti_aliasing = true
			draw_style_box(halo, Rect2(Vector2(-4.0, -4.0), size + Vector2(8.0, 8.0)))
		if _tex != null:
			draw_texture_rect(_tex, Rect2(Vector2.ZERO, size), false)
		if _pin > 0.0:
			var e := HudStyle.eased(_pin)
			var at := Vector2(size.x + 0.5, 0.5)
			draw_circle(at, 4.0 * lerpf(0.4, 1.0, e), Color(0.031, 0.086, 0.125, 0.9 * _pin), true, -1.0, true)
			draw_circle(at, 2.5 * lerpf(0.4, 1.0, e), Color(HudStyle.GOLD, _pin), true, -1.0, true)


## The zoom button: a lens over four pips that fill up through close, mid,
## far and leaned over (the last swelling a little).
class _ZoomButton:
	extends UiButton
	var view := -1
	var _pips: Control

	func _init() -> void:
		var d := maxf(28.0 * HudStyle.PX, 32.0 * HudStyle.K)
		super(Vector2(d, d), d * 0.5, 24.0 * HudStyle.PX)
		Hud.round_look(self)
		var ic := Icons.rect("zoom", maxf(13.0 * HudStyle.PX, 15.0 * HudStyle.K))
		ic.position = (size - ic.size) * 0.5 - Vector2(0.0, 2.0 * HudStyle.PX)
		ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(ic)
		_pips = Control.new()
		_pips.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_pips.size = size
		_pips.draw.connect(_draw_pips)
		add_child(_pips)

	func set_view(v: int) -> void:
		if v != view:
			view = v
			_pips.queue_redraw()

	func _draw_pips() -> void:
		var r := 1.5 * HudStyle.PX
		var step := 3.0 * HudStyle.PX + 2.0 * HudStyle.PX
		var y := size.y * 0.87 - r
		for i in 4:
			var at := Vector2(size.x * 0.5 + (i - 1.5) * step, y)
			if i <= view:
				var big := 1.35 if view == 3 and i == 3 else 1.0
				MapMarks.glow(_pips, at, r * big, 4.0 * HudStyle.PX, Color(244.0 / 255.0, 213.0 / 255.0, 138.0 / 255.0, 0.7))
				_pips.draw_circle(at, r * big, HudStyle.GOLD, true, -1.0, true)
			else:
				_pips.draw_circle(at, r, Color(1.0, 1.0, 1.0, 0.28), true, -1.0, true)


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
		if ShotPie.pressed(event):
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
