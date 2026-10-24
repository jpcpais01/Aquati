class_name Harbour
extends CanvasLayer
## The harbour, where every voyage begins, laid out as the web lays it out on
## a phone held sideways. Your ship rides at anchor centre stage while the
## camera slowly circles her (CameraRig's orbit, framed into the space this
## leaves free: framing()). The title runs along the top with the tools at the
## far end, her card hugs the left edge (her class and name, her numbers and
## her qualities as bars), and the ship picker, the Shipwright and Set Sail
## share the bottom row. A/D or the arrows (or 1-3) pick a ship, Enter sets sail.

## A ship was picked on the picker (the game swaps her in, then set_ship()).
signal picked(id: String)
signal sail
## The Shipwright, to dress her: her flag, sails, paintwork and name.
signal shipwright
## The Treasure Vault's pill.
signal vault
signal settings
signal sound
signal clicked

const SHIPS: Array[String] = ["sloop", "brig", "galleon"]
## Each class's silhouette on its tab, as a share of the tallest.
const ART := {"sloop": 0.7, "brig": 0.86, "galleon": 1.0}
const STATS := [["speed", "SPEED"], ["agility", "AGILITY"], ["armour", "ARMOUR"], ["hull", "HULL"], ["firepower", "FIREPOWER"]]

var ship := "sloop"
var sound_on := true
## Each class's refit ((id) -> its loadout, see Parts): her card shows her
## figures with it, the pips it adds in gold.
var loadout := Callable()

var _vp := Vector2(1280.0, 720.0)
var _root: Control
var _shade_mat: ShaderMaterial
var _reveal := MenuKit.Reveal.new()
## Seconds since it came up, and since the card last changed ship.
var _t := 0.0
var _swap := 1e9
## FORTUNE's gilt and its glint: the material, and its CSS box (width,
## height, left padding).
var _main_mat: ShaderMaterial
var _main_box := Vector3.ZERO
var _tools: Array[UiButton] = []
var _sound_btn: UiButton
var _card_slot: Control
var _card: Control
var _card_w := 0.0
var _pips: Array[_Pips] = []
var _tray: UiBox
var _tabs: Array[_Tab] = []
var _sail: UiButton
var _wright: UiButton
var _vault: UiButton
var _vault_dot: _VaultDot
## A free open waiting or finds not yet looked at: the Vault's pill wears a pip.
var vault_ready := false
var _frame := Vector4(0.0, 0.0, 1.0, 1.0)


func _ready() -> void:
	layer = 6
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	visible = false
	set_process(false)
	get_viewport().size_changed.connect(func() -> void:
		if visible:
			_build())


## Up, with `id` at anchor: everything rises in.
func open(id: String) -> void:
	ship = id
	visible = true
	_t = 0.0
	_swap = 1e9
	_build()
	set_process(true)


func close() -> void:
	for b in _all_buttons():
		b.cancel()
	visible = false
	set_process(false)


func is_open() -> bool:
	return visible


## The ship at anchor changed: her card and the picker follow.
func set_ship(id: String) -> void:
	if id == ship or not visible:
		ship = id
		return
	ship = id
	_fill_card()
	_swap = 0.0
	for tab in _tabs:
		tab.want = 1.0 if tab.id == ship else 0.0


func set_sound(on: bool) -> void:
	sound_on = on
	if _sound_btn != null:
		MenuKit.set_icon(_sound_btn, "sound" if on else "sound_off", HudStyle.INK if on else HudStyle.INK_3)


## Where the ship should sit: the middle of the space the menu leaves free,
## as a share of the screen from its centre, and how much of it is free
## (CameraRig.orbit_shift).
func framing() -> Vector4:
	return _frame


func _all_buttons() -> Array[UiButton]:
	var out: Array[UiButton] = []
	out.append_array(_tools)
	for t in _tabs:
		out.append(t)
	if _sail != null:
		out.append(_sail)
	if _wright != null:
		out.append(_wright)
	if _vault != null:
		out.append(_vault)
	return out


func _build() -> void:
	for c in _root.get_children():
		_root.remove_child(c)
		c.queue_free()
	# (her card went with its slot)
	_card = null
	_reveal.clear()
	_tools.clear()
	_tabs.clear()
	_vp = get_viewport().get_visible_rect().size
	_root.size = _vp
	var u := MenuKit.U
	var mx := _vp.x * 0.03
	var my := _vp.y * 0.03
	# the sea shaded behind the card, the title and the bottom row
	var shade := ColorRect.new()
	shade.size = _vp
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shade_mat = ShaderMaterial.new()
	_shade_mat.shader = preload("res://shaders/menu_shade.gdshader")
	_shade_mat.set_shader_parameter("lr_rgb", Vector3(2.0, 14.0, 22.0) / 255.0)
	_shade_mat.set_shader_parameter("lr_a", Vector3(0.58, 0.26, 0.0))
	_shade_mat.set_shader_parameter("lr_s", Vector2(0.24, 0.4))
	_shade_mat.set_shader_parameter("top_rgb", Vector3(2.0, 16.0, 26.0) / 255.0)
	_shade_mat.set_shader_parameter("top_a", 0.45)
	_shade_mat.set_shader_parameter("top_s", 0.2)
	_shade_mat.set_shader_parameter("foot_rgb", Vector3(2.0, 16.0, 26.0) / 255.0)
	_shade_mat.set_shader_parameter("foot_a", 0.55)
	_shade_mat.set_shader_parameter("foot_s", 0.28)
	_shade_mat.set_shader_parameter("fade", 0.0)
	shade.material = _shade_mat
	_root.add_child(shade)
	var head := _build_head()
	head.position = Vector2(mx, my)
	_root.add_child(head)
	var tools := _build_tools()
	tools.position = Vector2(_vp.x - mx - tools.size.x, my)
	_root.add_child(tools)
	# her card, straight on the sea; it slides when she changes
	_card_slot = Control.new()
	_card_slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_card_slot.position = Vector2(mx, my + 76.0 * u)
	_root.add_child(_card_slot)
	_fill_card()
	var tray := _build_tabs()
	tray.position = Vector2(mx, _vp.y - my - tray.size.y)
	_root.add_child(tray)
	_sail = MenuKit.gold("anchor", "SET SAIL", 40.0 * MenuKit.PX, 26.0 * u, 16.0 * MenuKit.T, 22.0 * u)
	_sail.position = _vp - Vector2(mx, my) - _sail.size
	_sail.pressed.connect(func() -> void: sail.emit())
	_root.add_child(_sail)
	# the Shipwright beside it, in dark glass (the web's dock row)
	_wright = MenuKit.pill("", "Shipwright", _sail.size.y, 16.0 * u, 14.5 * MenuKit.T, 700, Color(0.031, 0.102, 0.149, 0.66), HudStyle.INK, 0.04)
	_wright.position = Vector2(_sail.position.x - 8.0 * u - _wright.size.x, _sail.position.y)
	_wright.pressed.connect(func() -> void:
		clicked.emit()
		shipwright.emit())
	_root.add_child(_wright)
	# and the Treasure Vault beside that: a little gilded chest, a pip when
	# a free open is waiting or a find hasn't been looked at
	_vault = MenuKit.pill("", "Vault", _sail.size.y, 16.0 * u, 14.5 * MenuKit.T, 700, Color(0.031, 0.102, 0.149, 0.66), HudStyle.INK, 0.04)
	var vt: Control = _vault.get_node("Text")
	var cw := 20.0 * MenuKit.PX
	var gap := 8.0 * u
	_vault.resize(_vault.size + Vector2(cw + gap, 0.0))
	vt.position.x += cw + gap
	var chest := _VaultChest.new(Vector2(cw, 17.0 * MenuKit.PX))
	chest.position = Vector2(16.0 * u, (_vault.size.y - chest.size.y) * 0.5)
	_vault.add_child(chest)
	_vault_dot = _VaultDot.new(9.0 * MenuKit.PX)
	_vault_dot.position = Vector2(_vault.size.x - 8.0 * MenuKit.PX - _vault_dot.size.x, 6.0 * MenuKit.PX)
	_vault.add_child(_vault_dot)
	_vault.position = Vector2(_wright.position.x - 8.0 * u - _vault.size.x, _sail.position.y)
	_vault.pressed.connect(func() -> void:
		clicked.emit()
		vault.emit())
	_root.add_child(_vault)
	# the stage left for her: right of her card, from the top down to the bottom row
	var left := _card_slot.position.x + _card_w + 8.0 * MenuKit.PX
	var bottom := minf(tray.position.y, _sail.position.y) - 4.0 * MenuKit.PX
	_frame = Vector4((left + _vp.x) * 0.5 / _vp.x - 0.5, (my + bottom) * 0.5 / _vp.y - 0.5, (_vp.x - left) / _vp.x, (bottom - my) / _vp.y)
	var rise := 14.0 * MenuKit.PX
	_reveal.add(head, MenuKit.RISE, 0.0, 0.9, rise)
	_reveal.add(_card_slot, MenuKit.RISE, 0.1, 0.9, rise)
	_reveal.add(tray, MenuKit.RISE, 0.15, 0.9, rise)
	_reveal.add(tools, MenuKit.RISE, 0.15, 0.9, rise)
	_reveal.add(_sail, MenuKit.RISE, 0.2, 0.9, rise)
	_reveal.add(_wright, MenuKit.RISE, 0.2, 0.9, rise)
	_reveal.add(_vault, MenuKit.RISE, 0.2, 0.9, rise)
	_step(0.0)


## The crest and the title: "— SHORES O’ —" engraved over FORTUNE in gilt,
## a glint of sun sweeping across it now and then.
func _build_head() -> Control:
	var u := MenuKit.U
	var head := Control.new()
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var cd := 32.0 * u
	var view := Rect2(0.0, 0.0, 64.0, 64.0)
	var crest := Control.new()
	crest.mouse_filter = Control.MOUSE_FILTER_IGNORE
	crest.size = Vector2(cd, cd)
	for part: Array in [["crest-ring", Art.crest_ring()], ["crest-rose", Art.crest_rose()]]:
		var r := TextureRect.new()
		r.texture = Icons.svg(part[0], part[1], Vector2(cd, cd), view)
		r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		r.size = Vector2(cd, cd)
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		crest.add_child(r)
	head.add_child(crest)
	# the logo, its type in the web's em of 26px * --t
	var em := 26.0 * MenuKit.T
	var pre_px := 0.26 * em
	var o_px := pre_px * 1.25
	var shores := UiText.new([["SHORES", HudStyle.font("cinzel", 700, roundi(0.5 * pre_px)), roundi(pre_px), Color("#ffe9b8")]], 0.0, 1.0)
	var o := UiText.new([["O’", HudStyle.italic(HudStyle.font("cinzel", 700, roundi(0.08 * o_px))), roundi(o_px), HudStyle.GOLD]], 0.0, 1.0)
	var line_w := 2.6 * pre_px
	var gap := 0.7 * pre_px
	var pre_w := 0.5 * pre_px + line_w + gap + shores.size.x + gap + o.size.x + gap + line_w
	var main := UiText.new([["FORTUNE", HudStyle.font("cinzel", 700, roundi(0.14 * em)), roundi(em), Color.WHITE]], 0.0, 1.0)
	var mpad := 0.14 * em
	var main_w := mpad + main.size.x
	var logo_w := maxf(pre_w, main_w)
	var main_y := o_px + 0.32 * pre_px
	var logo_h := main_y + em
	var lx := cd + 9.0 * u
	var ly := maxf(0.0, (cd - logo_h) * 0.5)
	crest.position = Vector2(0.0, ly + (logo_h - cd) * 0.5)
	# the engraved line: a rule, SHORES, O’ and a rule, centred over the name
	var px0 := lx + (logo_w - pre_w) * 0.5 + 0.5 * pre_px
	var mid := ly + o_px * 0.5
	var rule_l := _Rule.new(Vector2(line_w, maxf(1.0, MenuKit.PX * 0.75)), false)
	rule_l.position = Vector2(px0, mid - rule_l.size.y * 0.5)
	MenuKit.line_at(shores, px0 + line_w + gap, ly + (o_px - pre_px) * 0.5, pre_px)
	MenuKit.line_at(o, shores.position.x + shores.size.x + gap, ly, o_px)
	var rule_r := _Rule.new(rule_l.size, true)
	rule_r.position = Vector2(o.position.x + o.size.x + gap, rule_l.position.y)
	for n: Control in [rule_l, shores, o, rule_r]:
		head.add_child(n)
	# FORTUNE, gilt top to foot
	var box_x := lx + (logo_w - main_w) * 0.5
	MenuKit.line_at(main, box_x + mpad, ly + main_y, em)
	_main_mat = HudStyle.text_grad([Color("#fffaf0"), Color("#ffe3a0"), Color("#e2a84a"), Color("#b9802c"), Vector2(0.48, 0.78)], ly + main_y - main.position.y, em)
	main.material = _main_mat
	_main_box = Vector3(main_w, em, mpad)
	head.add_child(main)
	head.size = Vector2(lx + logo_w, maxf(cd, logo_h))
	return head


## The tools, top right: Settings and the sound.
func _build_tools() -> Control:
	var u := MenuKit.U
	var box := Control.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var d := maxf(34.0 * MenuKit.PX, 40.0 * u)
	var ip := 17.0 * MenuKit.PX
	var gear := MenuKit.round("sliders", d, ip)
	gear.pressed.connect(func() -> void:
		clicked.emit()
		settings.emit())
	_sound_btn = MenuKit.round("sound", d, ip)
	_sound_btn.pressed.connect(func() -> void: sound.emit())
	set_sound(sound_on)
	var x := 0.0
	for b: UiButton in [gear, _sound_btn]:
		b.position = Vector2(x, 0.0)
		box.add_child(b)
		_tools.append(b)
		x += d + 7.0 * u
	box.size = Vector2(x - 7.0 * u, d)
	return box


## Her card: "The Corsair" (and how many parts she has fitted), her name,
## four numbers and five bars, all with her refit.
func _fill_card() -> void:
	var u := MenuKit.U
	var t := MenuKit.T
	if _card != null:
		_card_slot.remove_child(_card)
		_card.queue_free()
	_pips.clear()
	_card = Control.new()
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_card_slot.add_child(_card)
	var base := ShipClass.named(ship)
	var fit: Dictionary = loadout.call(ship) if loadout.is_valid() else {}
	var c := Parts.refit(base, fit)
	var bars := Parts.refit_bars(base, fit)
	var n_parts := Parts.loadout_parts(fit).size()
	var w := 250.0 * u
	var kick := MenuKit.words("THE " + c.title.to_upper(), "inter", 700, 10.5 * t, HudStyle.GOLD, 0.24)
	if n_parts > 0:
		var r: Array = kick.runs[0]
		r[0] = str(r[0]) + " · "
		kick.set_runs([r, ["%d PART%s FITTED" % [n_parts, "S" if n_parts > 1 else ""], r[1], r[2], HudStyle.GOLD_HI]])
	_card.add_child(kick)
	var name_px := 25.0 * t
	var nm := MenuKit.words(c.name, "cinzel", 700, name_px, HudStyle.INK, 0.05, 1.0)
	MenuKit.line_at(nm, 0.0, kick.size.y + 4.0 * u, name_px)
	_card.add_child(nm)
	var y := kick.size.y + 4.0 * u + name_px + 10.0 * u
	# guns, hull, reload, hold
	var facts := [["%d" % (c.cannons_per_side * 2), "GUNS"], ["%d" % roundi(c.hp), "HULL"], ["%.1fs" % c.reload, "RELOAD"], ["%d" % int(Treasure.HOLD_ROOM.get(c.id, 12)), "HOLD"]]
	var gap := 5.0 * u
	var cw := (w - gap * 3.0) / 4.0
	var fh := 0.0
	for i in 4:
		var cell := UiBox.new(Vector2(cw, 10.0), 12.0 * u, 2.0)
		MenuKit.flat(cell)
		cell.p("c_top", Color(0.016, 0.071, 0.11, 0.42)).p("c_foot", Color(0.016, 0.071, 0.11, 0.42)).p("c_border", Color(1, 1, 1, 0.05)).p("hi", 0.0)
		var b := MenuKit.words(str(facts[i][0]), "inter", 800, 16.0 * t, HudStyle.INK, -0.01)
		b.runs[0][1] = HudStyle.tnum(b.runs[0][1])
		b.set_runs(b.runs)
		var l := MenuKit.words(str(facts[i][1]), "inter", 600, 9.0 * t, HudStyle.INK_3, 0.16)
		b.position = Vector2((cw - b.size.x) * 0.5, 6.0 * u)
		l.position = Vector2((cw - l.size.x) * 0.5, b.position.y + b.size.y)
		fh = l.position.y + l.size.y + 5.0 * u
		cell.add_child(b)
		cell.add_child(l)
		cell.position = Vector2(i * (cw + gap), y)
		_card.add_child(cell)
	for cell in _card.get_children():
		if cell is UiBox:
			(cell as UiBox).resize(Vector2(cw, fh))
	y += fh + 12.0 * u
	# her qualities, ten pips each; the labels' column as wide as the widest
	var labels: Array[UiText] = []
	var col := 76.0 * u
	for s: Array in STATS:
		var l := MenuKit.words(str(s[1]), "inter", 600, 10.5 * t, HudStyle.INK_2, 0.14)
		labels.append(l)
		col = maxf(col, l.size.x + 4.0 * u)
	var ic := 16.0 * u
	var cg := 9.0 * u
	var pw := w - ic - cg - col - cg
	for i in STATS.size():
		var s: Array = STATS[i]
		var row_h := maxf(ic, labels[i].size.y)
		var icon := Icons.rect(str(s[0]), ic, HudStyle.AQUA)
		icon.position = Vector2(0.0, y + (row_h - ic) * 0.5)
		labels[i].position = Vector2(ic + cg, y + (row_h - labels[i].size.y) * 0.5)
		# the pips her refit adds glow gold
		var was := maxi(1, roundi(float(base.stats.get(s[0], 0.5)) * 10.0))
		var pips := _Pips.new(clampi(roundi(float(bars.get(s[0], 0.5)) * 10.0), 1, 10), pw, was)
		pips.position = Vector2(ic + cg + col + cg, y + (row_h - pips.size.y) * 0.5)
		pips.t = _swap
		for n: Control in [icon, labels[i], pips]:
			_card.add_child(n)
		_pips.append(pips)
		y += row_h + 6.0 * u
	_card_w = w
	_card.size = Vector2(w, y)


## The picker: a tray of three tabs, bottom left.
func _build_tabs() -> Control:
	var u := MenuKit.U
	var pad := 5.0 * u
	var gap := 4.0 * u
	var w := 290.0 * u
	var tw := (w - pad * 2.0 - gap * 2.0) / 3.0
	var name_h := 10.0 * MenuKit.T * 1.21
	var th := 4.0 * u + 30.0 * u + MenuKit.PX + name_h + 5.0 * u
	_tray = UiBox.new(Vector2(w, th + pad * 2.0), 20.0 * u, 60.0 * u)
	_tray.p("c_top", Color(0.024, 0.086, 0.125, 0.55)).p("c_foot", Color(0.024, 0.086, 0.125, 0.55)).p("c_border", Color(1, 1, 1, 0.08)).p("hi", 0.0)
	_tray.p("c_shadow", Color(0.0, 0.031, 0.055, 0.3)).p("shadow", Vector2(14.0, 40.0) * MenuKit.PX * 0.74)
	for i in SHIPS.size():
		var tab := _Tab.new(SHIPS[i], Vector2(tw, th))
		tab.position = Vector2(pad + i * (tw + gap), pad)
		tab.on = 1.0 if SHIPS[i] == ship else 0.0
		tab.want = tab.on
		tab.pressed.connect(func() -> void:
			if tab.id != ship:
				clicked.emit()
				picked.emit(tab.id))
		_tray.add_child(tab)
		_tabs.append(tab)
	return _tray


func _process(dt: float) -> void:
	_t += dt
	_swap += dt
	_step(dt)


func _step(dt: float) -> void:
	_reveal.step(_t)
	_shade_mat.set_shader_parameter("fade", HudStyle.eased(clampf(_t / 1.2, 0.0, 1.0)))
	MenuKit.glint(_sail, _t)
	_glint_logo()
	# a new ship's card slides in from a little to the right, its bars growing in
	var k := HudStyle.eased(clampf(_swap / 0.4, 0.0, 1.0))
	_card.modulate.a = lerpf(0.15, 1.0, k)
	_card.position.x = (1.0 - k) * 10.0 * MenuKit.PX
	for p in _pips:
		p.set_t(_swap)
	for tab in _tabs:
		tab.tick(dt, _t)
	if _vault_dot != null:
		_vault_dot.tick(_t, vault_ready)


## The sun's glint across FORTUNE (the web's logoGlint): every 7 s from 1.2 s
## in, a lean band sweeping the gilt in the last 30% of the cycle.
func _glint_logo() -> void:
	var w := _main_box.x
	var h := _main_box.y
	var p := -1.6
	if _t > 1.2:
		var ph := fmod(_t - 1.2, 7.0) / 7.0
		if ph > 0.7:
			p = -1.6 + 4.2 * MathX.bezier(0.42, 0.0, 0.58, 1.0, (ph - 0.7) / 0.3)
	var centre := 0.966 * (1.1 * w - 1.2 * w * p) + 0.1295 * h - 0.966 * _main_box.z
	_main_mat.set_shader_parameter("glint", centre)
	_main_mat.set_shader_parameter("glint_w", 0.12 * (2.125 * w + 0.259 * h))


func _unhandled_input(event: InputEvent) -> void:
	if not visible or not (event is InputEventKey) or not event.pressed or event.echo:
		return
	var i := SHIPS.find(ship)
	var to := ""
	match event.keycode:
		KEY_A, KEY_LEFT:
			to = SHIPS[(i + SHIPS.size() - 1) % SHIPS.size()]
		KEY_D, KEY_RIGHT:
			to = SHIPS[(i + 1) % SHIPS.size()]
		KEY_1, KEY_2, KEY_3:
			to = SHIPS[event.keycode - KEY_1]
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			get_viewport().set_input_as_handled()
			sail.emit()
			return
		_:
			return
	get_viewport().set_input_as_handled()
	if to != ship:
		clicked.emit()
		picked.emit(to)


## A hairline fading in from nothing toward the title (the logo's rules).
class _Rule:
	extends Control
	var _toward_left := false

	func _init(sz: Vector2, toward_left: bool) -> void:
		size = sz
		_toward_left = toward_left
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var gold := Color(0.957, 0.78, 0.396, 0.9)
		var clear := Color(gold, 0.0)
		var a := gold if _toward_left else clear
		var b := clear if _toward_left else gold
		draw_primitive(PackedVector2Array([Vector2.ZERO, Vector2(size.x, 0.0), size, Vector2(0.0, size.y)]), PackedColorArray([a, b, b, a]), PackedVector2Array())


## A quality as ten pips in a dark track, the lit ones teal warming toward
## gold along the bar (the web mixes them in Oklab), the ones her refit
## adds in gold; when the card changes they grow in one after another.
class _Pips:
	extends Control
	const N := 10
	var lit := 0
	var t := 1e9
	var _pip := Vector2.ZERO
	var _pad := 0.0
	var _gap := 0.0
	var _track: StyleBoxFlat
	var _on: Array[StyleBoxFlat] = []
	var _off: Array[StyleBoxFlat] = []

	func _init(n: int, w: float, was := N) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		lit = n
		_pad = 2.0 * MenuKit.PX * 0.74
		_gap = _pad
		var h := 6.0 * MenuKit.U
		_pip = Vector2((w - _pad * 2.0 - _gap * (N - 1)) / N, h)
		size = Vector2(w, h + _pad * 2.0)
		_track = StyleBoxFlat.new()
		_track.bg_color = Color(0.0, 0.0, 0.0, 0.32)
		_track.set_corner_radius_all(int(ceilf(size.y * 0.5)))
		_track.anti_aliasing = true
		var r := int(ceilf(h * 0.5))
		for k in N:
			var on := StyleBoxFlat.new()
			if k >= was:
				on.bg_color = HudStyle.GOLD_MID
				on.border_color = HudStyle.GOLD_TOP
				on.border_width_top = 1
				on.shadow_color = Color(1.0, 0.784, 0.353, 0.55)
			else:
				on.bg_color = Harbour.oklab_mix(Color("#3fd3c6"), Color("#ffd77a"), k * 0.11)
				on.shadow_color = Color(0.369, 0.89, 0.831, 0.25)
			on.shadow_size = int(6.0 * MenuKit.U)
			on.anti_aliasing = true
			var off := StyleBoxFlat.new()
			off.bg_color = Color(1.0, 1.0, 1.0, 0.06)
			off.anti_aliasing = true
			for sb: StyleBoxFlat in [on, off]:
				if k == 0:
					sb.corner_radius_top_left = r
					sb.corner_radius_bottom_left = r
				if k == N - 1 or (sb == on and k == lit - 1):
					sb.corner_radius_top_right = r
					sb.corner_radius_bottom_right = r
			_on.append(on)
			_off.append(off)

	## Seconds since the card changed: each lit pip grows in 26 ms after the last.
	func set_t(v: float) -> void:
		if t > 1.0 and v > 1.0:
			t = v
			return
		t = v
		queue_redraw()

	func _draw() -> void:
		draw_style_box(_track, Rect2(Vector2.ZERO, size))
		for k in N:
			var at := Vector2(_pad + k * (_pip.x + _gap), _pad)
			if k >= lit:
				draw_style_box(_off[k], Rect2(at, _pip))
				continue
			var e := HudStyle.eased(clampf((t - k * 0.026) / 0.45, 0.0, 1.0))
			if e <= 0.0:
				continue
			var w := _pip.x * lerpf(0.2, 1.0, e)
			_on[k].bg_color.a = e
			draw_style_box(_on[k], Rect2(at + Vector2((_pip.x - w) * 0.5, 0.0), Vector2(w, _pip.y)))


## A ship on the picker: her silhouette over a line of sea, and her class.
## The one at anchor is lit teal from below and ringed in white, her
## silhouette in her colours, bobbing on the swell.
class _Tab:
	extends UiButton
	var id := ""
	## How lit (0..1), and what it's heading for (a 0.25 s crossfade).
	var on := 0.0
	var want := 0.0
	var _lit: UiBox
	var _dim_art: TextureRect
	var _art: TextureRect
	var _art_at := Vector2.ZERO
	var _name: UiText

	func _init(p_id: String, sz: Vector2) -> void:
		super(sz, 15.0 * MenuKit.U, 2.0)
		id = p_id
		var u := MenuKit.U
		_lit = UiBox.new(sz, 15.0 * u, 70.0 * u)
		_lit.p("radial", Vector4(0.5, 1.0, 1.0, 0.9)).p("radial_stop", 0.7)
		_lit.p("c_top", Color(0.369, 0.89, 0.831, 0.34)).p("c_foot", Color(1.0, 1.0, 1.0, 0.07))
		_lit.p("border", 2.0 * MenuKit.PX).p("c_border", Color(1.0, 1.0, 1.0, 0.9)).p("hi", 0.0)
		_lit.p("ring", 5.0 * u).p("c_ring", Color(1.0, 1.0, 1.0, 0.08))
		_lit.p("c_shadow", Color(0.235, 0.863, 0.824, 0.22)).p("shadow", Vector2(14.0, 34.0) * u)
		add_child(_lit)
		# the art's box: the sea under her, and her bottom on it
		var pad := 4.0 * u
		var art_box := Rect2(pad, pad, sz.x - pad * 2.0, 30.0 * u)
		var sea := TextureRect.new()
		var sea_sz := Vector2(art_box.size.x * 0.84, 6.0 * u)
		sea.texture = Icons.svg("tab-sea", '<path d="M0 3q5-3 10 0t10 0 10 0 10 0 10 0 10 0" fill="none" stroke="#7fe0d6" stroke-width="1.2" opacity=".55"/>', sea_sz, Rect2(0, 0, 60, 6))
		sea.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		sea.size = sea_sz
		sea.position = Vector2(art_box.position.x + (art_box.size.x - sea_sz.x) * 0.5, art_box.end.y - 3.0 * u - sea_sz.y)
		sea.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(sea)
		var h := 28.0 * u * float(Harbour.ART.get(id, 1.0))
		_dim_art = MenuKit.ship_art(id, h, false)
		_art = MenuKit.ship_art(id, h, true)
		_art_at = Vector2(art_box.position.x + (art_box.size.x - _art.size.x) * 0.5, art_box.end.y - h)
		for a: TextureRect in [_dim_art, _art]:
			a.position = _art_at
			a.pivot_offset = a.size * 0.5
			add_child(a)
		_name = MenuKit.words(ShipClass.named(id).name.to_upper(), "inter", 700, 10.0 * MenuKit.T, Color.WHITE, 0.08)
		_name.position = Vector2((sz.x - _name.size.x) * 0.5, art_box.end.y + MenuKit.PX)
		add_child(_name)

	func _draw() -> void:
		pass

	func tick(dt: float, t: float) -> void:
		on = move_toward(on, want, dt / 0.25)
		var e := HudStyle.eased(on)
		_lit.modulate.a = e
		_art.modulate.a = e
		_dim_art.modulate.a = 1.0 - e
		_name.modulate = HudStyle.INK_3.lerp(HudStyle.INK, e)
		# the lit ship bobs on the swell
		var b := (1.0 - cos(t / 3.2 * TAU)) * 0.5 * e
		_art.position = _art_at + Vector2(0.0, -1.5 * MenuKit.PX * b)
		_art.rotation = deg_to_rad(-1.2) * b


## Mixes two colours in Oklab (CSS color-mix(in oklab, a, b t)): even steps
## of hue and lightness, where a plain blend between teal and gold goes grey.
static func oklab_mix(a: Color, b: Color, t: float) -> Color:
	var la := _oklab(a)
	var lb := _oklab(b)
	return _from_oklab(la.lerp(lb, clampf(t, 0.0, 1.0)), lerpf(a.a, b.a, t))


static func _oklab(c: Color) -> Vector3:
	var lin := c.srgb_to_linear()
	var l := 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b
	var m := 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b
	var s := 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b
	l = pow(l, 1.0 / 3.0)
	m = pow(m, 1.0 / 3.0)
	s = pow(s, 1.0 / 3.0)
	return Vector3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


static func _from_oklab(v: Vector3, alpha: float) -> Color:
	var l := v.x + 0.3963377774 * v.y + 0.2158037573 * v.z
	var m := v.x - 0.1055613458 * v.y - 0.0638541728 * v.z
	var s := v.x - 0.0894841775 * v.y - 1.2914855480 * v.z
	l = l * l * l
	m = m * m * m
	s = s * s * s
	var lin := Color(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s, alpha)
	return Color(clampf(lin.r, 0.0, 1.0), clampf(lin.g, 0.0, 1.0), clampf(lin.b, 0.0, 1.0), alpha).linear_to_srgb()


## The Vault pill's chest (the web's .mv-chest): a lid of warm wood over a
## gilt band and a darker body, two gilt straps and a gilt rim.
class _VaultChest:
	extends Control

	func _init(sz: Vector2) -> void:
		size = sz
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var w := size.x
		var h := size.y
		var r := w * 0.25
		var gold := Color("#f1c35c")
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color("#5e3218")
		sb.set_corner_radius_all(int(round(r * 0.6)))
		sb.corner_radius_top_left = int(round(r))
		sb.corner_radius_top_right = int(round(r))
		draw_style_box(sb, Rect2(Vector2.ZERO, size))
		var lid := sb.duplicate() as StyleBoxFlat
		lid.bg_color = Color("#8a4f2a")
		lid.corner_radius_bottom_left = 0
		lid.corner_radius_bottom_right = 0
		draw_style_box(lid, Rect2(0.0, 0.0, w, h * 0.42))
		draw_rect(Rect2(0.0, h * 0.42, w, h * 0.1), gold)
		draw_rect(Rect2(w * 0.18, 0.0, w * 0.1, h), gold)
		draw_rect(Rect2(w * 0.72, 0.0, w * 0.1, h), gold)
		var rim := StyleBoxFlat.new()
		rim.draw_center = false
		rim.border_color = Color(gold, 0.75)
		rim.set_border_width_all(maxi(1, int(round(1.5 * MenuKit.PX))))
		rim.corner_radius_top_left = sb.corner_radius_top_left
		rim.corner_radius_top_right = sb.corner_radius_top_right
		rim.corner_radius_bottom_left = sb.corner_radius_bottom_left
		rim.corner_radius_bottom_right = sb.corner_radius_bottom_right
		draw_style_box(rim, Rect2(Vector2.ZERO, size))


## The Vault pill's pip (the web's .mv-dot): gold with a dark ring, breathing
## a glow every 2.2 s while it's up; it pops in and out.
class _VaultDot:
	extends Control

	var _on := 0.0
	var _glow := 0.0

	func _init(d: float) -> void:
		size = Vector2(d, d)
		pivot_offset = size * 0.5
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func tick(t: float, ready: bool) -> void:
		var to := 1.0 if ready else 0.0
		var dt := get_process_delta_time()
		_on = move_toward(_on, to, dt / 0.25)
		_glow = 0.5 - 0.5 * cos(t * TAU / 2.2)
		modulate.a = _on
		scale = Vector2.ONE * lerpf(0.4, 1.0, HudStyle.eased(_on))
		visible = _on > 0.0
		queue_redraw()

	func _draw() -> void:
		var c := size * 0.5
		var r := size.x * 0.5
		var gold := Color("#ffbe3d")
		for i in 6:
			var k := float(i + 1) / 6.0
			draw_circle(c, r + 2.0 * MenuKit.PX + k * (5.0 + 6.0 * _glow) * MenuKit.PX, Color(gold, 0.07 * (1.0 - k) * (0.6 + _glow)))
		draw_circle(c, r + 2.0 * MenuKit.PX, Color(0.008, 0.055, 0.086, 0.6))
		draw_circle(c, r, gold)
