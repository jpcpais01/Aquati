class_name PauseScreen
extends CanvasLayer
## Anchored: the voyage paused, laid out as the web lays it out on a phone
## held sideways. The sea stands still behind frosted glass, shaded from the
## left; the menu runs down the left (Resume voyage lit up white like a
## console's row, Settings, and Return to harbour, which asks for a second
## press before it gives the voyage up), and on the right "Voyage paused",
## her name under her silhouette and the voyage so far in four tiles. Up and
## down (or W and S) move along the menu, Enter takes the row lit.

signal resume
signal settings
signal harbour
signal clicked

## Seconds Return to harbour stays armed for its second press.
const ARM := 3.2
const ROWS := [["play", "Resume voyage"], ["sliders", "Settings"], ["harbour", "Return to harbour"]]

var _root: Control
var _back: ShaderMaterial
var _rows: Array[_Row] = []
var _reveal := MenuKit.Reveal.new()
var _info := {}
## The row lit (the keyboard's, or the first), and how long Return stays armed.
var _focus := 0
var _armed := 0.0
var _t := 0.0


func _ready() -> void:
	layer = 8
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_root)
	visible = false
	set_process(false)
	get_viewport().size_changed.connect(func() -> void:
		if visible:
			_build())


## Up over the frozen voyage: `info` holds her name and class, and the
## voyage's time, gold, ships sunk and isles charted.
func open(info: Dictionary) -> void:
	_info = info
	_t = 0.0
	_focus = 0
	_armed = 0.0
	visible = true
	_build()
	set_process(true)


func close() -> void:
	for r in _rows:
		r.cancel()
	visible = false
	set_process(false)


func is_open() -> bool:
	return visible


## The back button: back to the voyage.
func go_back() -> bool:
	if not visible:
		return false
	_act(0)
	return true


func _build() -> void:
	for c in _root.get_children():
		_root.remove_child(c)
		c.queue_free()
	_rows.clear()
	_reveal.clear()
	var vp := get_viewport().get_visible_rect().size
	_root.size = vp
	var u := MenuKit.U
	var t := MenuKit.T
	var px := MenuKit.PX
	var mx := vp.x * 0.03
	var my := vp.y * 0.03
	# the frozen sea, frosted and shaded in from the left
	var glass := ColorRect.new()
	glass.size = vp
	glass.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_back = ShaderMaterial.new()
	_back.shader = preload("res://shaders/menu_blur.gdshader")
	_back.set_shader_parameter("lod", _blur_lod(8.0 * u))
	_back.set_shader_parameter("saturate", 1.1)
	_back.set_shader_parameter("lr_rgb", Vector3(2.0, 12.0, 19.0) / 255.0)
	_back.set_shader_parameter("lr_a", Vector3(0.9, 0.66, 0.3))
	_back.set_shader_parameter("lr_s", Vector2(0.42, 1.0))
	_back.set_shader_parameter("fade", 0.0)
	glass.material = _back
	_root.add_child(glass)
	# the right-hand column: what's paused, whose ship, the voyage so far
	var cw := 400.0 * u
	var x2 := vp.x - mx - 8.0 * u - cw
	var parts: Array[Control] = []
	var kick := MenuKit.words("VOYAGE PAUSED", "inter", 700, 11.0 * t, HudStyle.AQUA, 0.22, 1.2)
	parts.append(kick)
	var title := MenuKit.words("Anchored", "inter", 800, 34.0 * t, HudStyle.INK, -0.025, 1.02)
	title.halo = Color(0.0, 0.0, 0.0, 0.1)
	parts.append(title)
	var ship := _ship_row()
	parts.append(ship)
	var tiles := _tiles(cw)
	parts.append(tiles)
	var gaps: Array[float] = [0.0, 4.0 * u, 8.0 * u, 14.0 * u]
	var col_h := 0.0
	for i in parts.size():
		col_h += gaps[i] + parts[i].size.y
	var top := my + maxf(0.0, (vp.y - my * 2.0 - col_h) * 0.5)
	var y := top
	for i in parts.size():
		y += gaps[i]
		parts[i].position = Vector2(x2, y)
		y += parts[i].size.y
		_root.add_child(parts[i])
	var slide := 22.0 * px
	_reveal.add(kick, MenuKit.SLIDE, 0.0, 0.5, slide)
	_reveal.add(title, MenuKit.SLIDE, 0.04, 0.5, slide)
	_reveal.add(ship, MenuKit.SLIDE, 0.08, 0.5, slide)
	_reveal.add(tiles, MenuKit.RISE, 0.15, 0.6, 14.0 * px)
	# the menu down the left, centred against that column
	var lw := 320.0 * u
	var rh := 50.0 * u
	var list_h := rh * ROWS.size() + (ROWS.size() - 1) * 1.0 + 6.0 * u
	var ly := top + (col_h - list_h) * 0.5
	for i in ROWS.size():
		var warn := i == ROWS.size() - 1
		if warn:
			ly += 6.0 * u
			var rule := MenuKit.rule(lw - 36.0 * u)
			rule.position = Vector2(mx + 8.0 * u + 18.0 * u, ly - 6.0 * u)
			_root.add_child(rule)
			_reveal.add(rule, MenuKit.FADE, 0.1 + i * 0.04, 0.5)
		var row := _Row.new(str(ROWS[i][0]), str(ROWS[i][1]), Vector2(lw, rh), warn)
		row.position = Vector2(mx + 8.0 * u, ly)
		var k := i
		row.pressed.connect(func() -> void: _act(k))
		_root.add_child(row)
		_rows.append(row)
		_reveal.add(row, MenuKit.SLIDE, 0.1 + i * 0.04, 0.5, slide)
		ly += rh + 1.0
	_step(0.0)


## Her silhouette in her colours, her class over her name.
func _ship_row() -> Control:
	var u := MenuKit.U
	var t := MenuKit.T
	var row := Control.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var id := str(_info.get("cls", "sloop"))
	var art := MenuKit.ship_art(id, 36.0 * u, true)
	var box := Vector2(maxf(54.0 * u, art.size.x), 36.0 * u)
	var cls := MenuKit.words(ShipClass.named(id).name.to_upper(), "inter", 700, 10.0 * t, HudStyle.GOLD, 0.22, 1.21)
	var nm := MenuKit.words(str(_info.get("ship", "")), "cinzel", 700, 19.0 * t, HudStyle.INK, 0.06, 1.21)
	var text_h := cls.size.y + nm.size.y
	var h := maxf(box.y, text_h)
	art.position = Vector2(0.0, (h - box.y) * 0.5 + box.y - art.size.y)
	var tx := box.x + 12.0 * u
	cls.position = Vector2(tx, (h - text_h) * 0.5)
	nm.position = Vector2(tx, cls.position.y + cls.size.y)
	for n: Control in [art, cls, nm]:
		row.add_child(n)
	row.size = Vector2(tx + maxf(cls.size.x, nm.size.x), h)
	return row


## The voyage so far: how long at sea, the gold, ships sunk, isles charted.
func _tiles(w: float) -> Control:
	var u := MenuKit.U
	var t := MenuKit.T
	var box := Control.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var secs := int(float(_info.get("time", 0.0)))
	var specs := [
		["clock", "%d:%02d" % [secs / 60, secs % 60], "AT SEA"],
		["coin", str(int(_info.get("gold", 0))), "GOLD"],
		["skull", str(int(_info.get("kills", 0))), "SUNK"],
		["isle", str(int(_info.get("isles", 0))), "ISLES"],
	]
	var gap := 10.0 * u
	var tw := (w - gap) * 0.5
	var th := 0.0
	for i in 4:
		var s: Array = specs[i]
		var pad := Vector2(18.0, 16.0) * u
		var badge := Icons.rect(str(s[0]), 14.0 * u * 1.5)
		badge.position = pad - Vector2(3.5, 3.5) * u
		var num := MenuKit.words(str(s[1]), "inter", 800, 28.0 * t, HudStyle.INK, -0.02, 1.21)
		num.runs[0][1] = HudStyle.tnum(num.runs[0][1])
		num.set_runs(num.runs)
		num.position = Vector2(pad.x, pad.y + 14.0 * u + 4.0 * u)
		var lab := MenuKit.words(str(s[2]), "inter", 600, 9.5 * t, HudStyle.INK_3, 0.16, 1.21)
		lab.position = Vector2(pad.x, num.position.y + num.size.y + 4.0 * u)
		th = lab.position.y + lab.size.y + pad.y
		var tile := UiBox.new(Vector2(tw, th), 20.0 * u, 2.0)
		MenuKit.flat(tile)
		tile.p("c_top", Color8(8, 22, 32, 140)).p("c_foot", Color8(8, 22, 32, 140)).p("c_border", Color(1.0, 1.0, 1.0, 0.06)).p("hi", 0.0)
		for n: Control in [badge, num, lab]:
			tile.add_child(n)
		tile.position = Vector2((i % 2) * (tw + gap), (i / 2) * (th + gap))
		box.add_child(tile)
	box.size = Vector2(w, th * 2.0 + gap)
	return box


## How far down the screen's mip chain a blur of `r` units reaches.
static func _blur_lod(r: float) -> float:
	return clampf(log(maxf(1.0, r * Icons.density())) / log(2.0) - 0.5, 1.0, 6.0)


func _act(i: int) -> void:
	match i:
		0:
			clicked.emit()
			resume.emit()
		1:
			clicked.emit()
			settings.emit()
		2:
			clicked.emit()
			if _armed > 0.0:
				_armed = 0.0
				harbour.emit()
			else:
				# a voyage is too much to lose to one stray tap
				_armed = ARM
				_rows[2].set_label("Press again to leave this voyage")


func _process(dt: float) -> void:
	_t += dt
	if _armed > 0.0:
		_armed -= dt
		if _armed <= 0.0:
			_armed = 0.0
			_rows[2].set_label(str(ROWS[2][1]))
	_step(dt)


func _step(dt: float) -> void:
	_back.set_shader_parameter("fade", clampf(_t / 0.35, 0.0, 1.0))
	_reveal.step(_t)
	for i in _rows.size():
		_rows[i].tick(dt, i == _focus, i == 2 and _armed > 0.0)


## Up and down along the menu, Enter takes the row lit; no key reaches the
## helm while the voyage is held.
func _unhandled_input(event: InputEvent) -> void:
	if not visible or not (event is InputEventKey):
		return
	get_viewport().set_input_as_handled()
	if not event.pressed or event.echo:
		return
	match event.keycode:
		KEY_UP, KEY_W:
			_focus = (_focus + _rows.size() - 1) % _rows.size()
		KEY_DOWN, KEY_S:
			_focus = (_focus + 1) % _rows.size()
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			_act(_focus)


## A row of the menu: an icon and its words; lit, it turns white with dark
## ink and stands a little proud; Return to harbour, armed, glows coral.
class _Row:
	extends UiButton
	var _icon: TextureRect
	var _text: UiText
	var _warn := false
	var _lit := 0.0
	var _arm := 0.0

	func _init(icon: String, label: String, sz: Vector2, warn: bool) -> void:
		super(sz, 16.0 * MenuKit.U, 60.0 * MenuKit.U)
		_warn = warn
		squeeze = 0.98
		var u := MenuKit.U
		p("c_top", Color(1.0, 1.0, 1.0, 0.0)).p("c_foot", Color(1.0, 1.0, 1.0, 0.0)).p("hi", 0.0).p("border", 0.0)
		p("c_shadow", Color(0.471, 0.902, 1.0, 0.0)).p("shadow", Vector2(14.0, 40.0) * u)
		p("ring", 5.0 * u).p("c_ring", Color(1.0, 1.0, 1.0, 0.0))
		_icon = Icons.rect(icon, 20.0 * u)
		_icon.position = Vector2(18.0 * u, (sz.y - _icon.size.y) * 0.5)
		add_child(_icon)
		_text = MenuKit.words(label, "inter", 700, 16.0 * MenuKit.T, Color.WHITE, 0.005, 1.21)
		MenuKit.line_at(_text, 18.0 * u + 20.0 * u + 14.0 * u, 0.0, sz.y)
		add_child(_text)

	func set_label(s: String) -> void:
		_text.set_text(s)

	## After the reveal has placed it this frame: lit, it stands 4 units proud.
	func tick(dt: float, lit: bool, armed: bool) -> void:
		_lit = move_toward(_lit, 1.0 if lit else 0.0, dt / 0.18)
		_arm = move_toward(_arm, 1.0 if armed else 0.0, dt / 0.18)
		var e := HudStyle.eased(_lit)
		var ink := (HudStyle.INK_3 if _warn else HudStyle.INK_2).lerp(Color("#0a1c26"), e)
		var fill := Color(0.969, 0.98, 0.984, 0.95 * e)
		if _arm > 0.0:
			var a := HudStyle.eased(_arm)
			ink = ink.lerp(Color("#2a0905") if lit else Color("#ffc2b8"), a)
			fill = fill.lerp(Color("#ff8f7f") if lit else Color(1.0, 0.459, 0.388, 0.16), a)
			p("border", 1.0).p("c_border", Color(1.0, 0.459, 0.388, 0.5 * a * (1.0 - e)))
		else:
			p("border", 0.0)
		p("c_top", fill).p("c_foot", fill)
		p("c_ring", Color(1.0, 1.0, 1.0, 0.12 * e)).p("c_shadow", Color(0.471, 0.902, 1.0, 0.2 * e))
		_text.modulate = ink
		_icon.self_modulate = Color(ink, ink.a * lerpf(0.8, 1.0, e))
		position.x += e * 4.0 * MenuKit.U
