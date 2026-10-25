class_name PrizeCard
extends Control
## Her fate, once her crew strikes (the web's prize card, src/ui/shore.ts):
## a glass card low in the middle of the screen with her colours bobbing
## over "She strikes her colours", her name, what her strongbox gave up, and
## the choice: take her as a prize (gold-edged, prize money) or scuttle her
## (her bounty, salvage and infamy). Keys 1 and 2 pick them on a keyboard.

signal picked(k: String)

const K := HudStyle.K
const PX := HudStyle.PX
const CORAL_INK := Color("#ffb08a")

var touch := false
var _card: UiBox
var _flag: TextureRect
var _flag_at := Vector2.ZERO
var _card_y := 0.0
var _buttons: Array[UiButton] = []
var _t := -1.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visible = false
	set_process(false)


func is_open() -> bool:
	return visible


## Up with her name, the haul and what each choice brings ({name, haul, prize, scuttle}).
func open(v: Dictionary) -> void:
	for c in get_children():
		remove_child(c)
		c.queue_free()
	_buttons.clear()
	var vp := get_viewport_rect().size
	var w := minf(vp.x - 32.0, 440.0 * K)
	var pad := 16.0 * K
	var inner := w - pad * 2.0
	_card = UiBox.new(Vector2(w, 100.0), 22.0 * K, 60.0 * PX)
	_card.p("c_top", Color(0.043, 0.11, 0.157, 0.86)).p("c_foot", Color(0.02, 0.07, 0.1, 0.9))
	_card.p("c_border", Color(0.957, 0.78, 0.396, 0.42)).p("c_shadow", Color(0.0, 0.031, 0.055, 0.5)).p("shadow", Vector2(18.0, 50.0) * PX)
	_card.p("c_glow", Color(0.957, 0.706, 0.275, 0.14)).p("glow", 40.0 * PX).p("hi", 0.09)
	_card.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_card)
	var y := pad
	var fd := 26.0 * K
	_flag = Icons.rect("flag", fd, HudStyle.GOLD)
	_flag_at = Vector2((w - fd) * 0.5, y)
	_flag.position = _flag_at
	_flag.pivot_offset = Vector2(fd, fd) * 0.5
	_card.add_child(_flag)
	y += fd + 4.0 * K
	var kfs := maxf(8.0 * PX, 9.5 * K)
	var kick := MenuKit.words("SHE STRIKES HER COLOURS", "inter", 700, kfs, HudStyle.GOLD, 0.24)
	kick.position = Vector2((w - kick.size.x) * 0.5, y)
	_card.add_child(kick)
	y += kick.size.y + 3.0 * K
	var name_t := UiText.new([["The %s is yours" % str(v.get("name", "pirate")), HudStyle.font("cinzel", 700, roundi(0.04 * 20.0 * K)), roundi(maxf(15.0 * PX, 20.0 * K)), HudStyle.INK]], inner, 1.15)
	name_t.align = HORIZONTAL_ALIGNMENT_CENTER
	name_t.fixed = inner
	name_t.position = Vector2(pad, y)
	_card.add_child(name_t)
	y += name_t.size.y + 4.0 * K
	var haul := UiText.new([[str(v.get("haul", "")), HudStyle.font("inter", 600), roundi(maxf(10.0 * PX, 12.0 * K)), HudStyle.INK_2]], inner, 1.3)
	haul.align = HORIZONTAL_ALIGNMENT_CENTER
	haul.fixed = inner
	haul.position = Vector2(pad, y)
	_card.add_child(haul)
	y += haul.size.y + 12.0 * K
	# the two choices side by side
	var gap := 8.0 * K
	var bw := (inner - gap) * 0.5
	var acts := [["prize", "harbour", "Take her as a prize", str(v.get("prize", "")), "1", true], ["scuttle", "firepower", "Scuttle her", str(v.get("scuttle", "")), "2", false]]
	var bh := 0.0
	var made: Array[UiButton] = []
	for a: Array in acts:
		var b := _act(bw, a[1], a[2], a[3], a[4], a[5])
		var key: String = a[0]
		b.pressed.connect(func() -> void: picked.emit(key))
		made.append(b)
		bh = maxf(bh, b.size.y)
	for i in made.size():
		var b := made[i]
		b.resize(Vector2(bw, bh))
		for c in b.get_children():
			if c.has_meta("mid"):
				(c as Control).position.y = (bh - (c as Control).size.y) * 0.5
		b.position = Vector2(pad + i * (bw + gap), y)
		_card.add_child(b)
		_buttons.append(b)
	y += bh + 14.0 * K
	_card.resize(Vector2(w, y))
	_card.pivot_offset = _card.size * 0.5
	var bottom := (150.0 * HudStyle.KT if touch else 56.0 * K) + 24.0 * K
	_card.position = Vector2((vp.x - w) * 0.5, vp.y - bottom - y)
	_card_y = _card.position.y
	visible = true
	_t = 0.0
	set_process(true)
	_step()


func close() -> void:
	if not visible:
		return
	for b in _buttons:
		b.cancel()
	visible = false
	set_process(false)


## A choice: its icon, its title and what it brings, its key in the corner.
func _act(w: float, icon: String, title: String, sub: String, key: String, gold: bool) -> UiButton:
	var ip := 22.0 * K
	var px := 12.0 * K
	var py := 10.0 * K
	var tw := w - px * 2.0 - ip - 9.0 * K
	var col := Control.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var t := UiText.new([[title, HudStyle.font("inter", 700), roundi(maxf(11.0 * PX, 13.5 * K)), HudStyle.INK]], tw, 1.2)
	col.add_child(t)
	var s := UiText.new([[sub, HudStyle.font("inter", 600), roundi(maxf(9.0 * PX, 10.5 * K)), HudStyle.INK_2]], tw, 1.25)
	s.position.y = t.size.y + 1.0
	col.add_child(s)
	col.size = Vector2(tw, s.position.y + s.size.y)
	col.set_meta("mid", true)
	var h := maxf(col.size.y, ip) + py * 2.0
	var b := UiButton.new(Vector2(w, h), 14.0 * K, 30.0 * PX)
	if gold:
		b.p("c_top", Color(0.957, 0.78, 0.396, 0.2)).p("c_foot", Color(0.957, 0.78, 0.396, 0.08)).p("c_border", Color(0.957, 0.78, 0.396, 0.65))
		b.p("c_shadow", Color(0.957, 0.706, 0.275, 0.22)).p("shadow", Vector2(6.0, 22.0) * PX)
	else:
		MenuKit.flat(b)
		b.p("c_top", Color(1.0, 1.0, 1.0, 0.05)).p("c_foot", Color(1.0, 1.0, 1.0, 0.05)).p("c_border", HudStyle.STROKE_2)
	b.p("hi", 0.06)
	var ic := Icons.rect(icon, ip, HudStyle.GOLD if gold else CORAL_INK)
	ic.position = Vector2(px, (h - ip) * 0.5)
	ic.set_meta("mid", true)
	b.add_child(ic)
	col.position = Vector2(px + ip + 9.0 * K, (h - col.size.y) * 0.5)
	b.add_child(col)
	if not touch:
		var kb := _kbd(key)
		kb.position = Vector2(w + 5.0 * K - kb.size.x, -7.0 * K)
		b.add_child(kb)
	return b


## A key cap, as the HUD's hints draw them.
static func _kbd(text: String) -> UiBox:
	var t := MenuKit.words(text, "inter", 600, 10.0 * K, HudStyle.INK)
	var h := t.size.y + 4.0 * K
	var w := maxf(h, t.size.x + 10.0 * K)
	var b := UiBox.new(Vector2(w, h), 6.0 * K, 2.0)
	MenuKit.flat(b)
	b.p("c_top", Color(0.06, 0.14, 0.19, 0.95)).p("c_foot", Color(0.04, 0.1, 0.14, 0.95)).p("c_border", Color(1.0, 1.0, 1.0, 0.22)).p("hi", 0.0)
	t.position = Vector2((w - t.size.x) * 0.5, (h - t.size.y) * 0.5)
	b.add_child(t)
	return b


func _process(dt: float) -> void:
	# (Godot turns processing on at ready: nothing to spring until it's opened)
	if _card == null or not visible:
		set_process(false)
		return
	_t += dt
	_step()


## Springs up into place, and her colours bob.
func _step() -> void:
	var k := clampf(_t / 0.55, 0.0, 1.0)
	var e := HudStyle.spring(k)
	_card.modulate.a = minf(1.0, k * 2.5)
	_card.scale = Vector2.ONE * lerpf(0.94, 1.0, e)
	_card.position.y = _card_y + 18.0 * PX * (1.0 - e)
	var b := 0.5 - 0.5 * cos(_t / 1.8 * TAU)
	_flag.position = _flag_at + Vector2(0.0, -2.0 * PX * b)
	_flag.rotation = deg_to_rad(-4.0) * b
