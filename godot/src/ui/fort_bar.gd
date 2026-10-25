class_name FortBar
extends Control
## A fort's chrome (the web game's src/ui/fort.ts FortHud): a stone-and-brass
## bar across the top of the screen while you're within sight of one (its
## name, a pip for each gun lit or smashed, the garrison and what to do next),
## and the title card when it falls to you. Warm limestone and brass for the
## Brethren's walls, aqua once it flies your colours. Laid out again only when
## its words change.

const K := HudStyle.K
const PX := HudStyle.PX
## A little round tower with a garita and a flag.
const TOWER := '<path d="M5 22V10h2V7.5h2V10h2V7.5h2V10h2V7.5h2V10h2v12h-5v-4.2a2 2 0 0 0-4 0V22z" fill="#ffffff"/><path d="M12 7.4V1.8" stroke="#ffffff" stroke-width="1.2"/><path d="M12.4 2h5l-1.4 1.6 1.4 1.6h-5z" fill="#ffffff"/>'
const GUN := '<path d="M2 5.2 17.6 3.4c.8-.1 1.4.5 1.4 1.2v.4h2.2v4h-2.2v.4c0 .7-.6 1.3-1.4 1.2L2 8.8a1.6 1.6 0 0 1-1.4-1.6v-.4c0-.8.6-1.5 1.4-1.6z" fill="#ffffff"/><circle cx="7" cy="10.4" r="2.6" fill="#ffffff" opacity=".75"/><circle cx="7" cy="10.4" r="1" fill="#120c06"/>'
const NAME := Color("#fff6e2")
const BRASS := Color("#e8b85a")
const AQUA := Color("#5ee3d4")
const DEAD := Color("#5a4a3a")
const HOT := Color("#ffe08a")

var _bar: Control
var _box: UiBox
var _sig: TextureRect
var _name: UiText
var _pips: Array[TextureRect] = []
var _garr: UiText
var _hint: UiText
var _card: Control
var _kicker: UiText
var _title: UiText
var _rule: Control
var _line: UiText
var _key := ""
var _guns := ""
var _ours := false
var _hot := false
var _on := false
var _t := 9.0
var _fade_from := 0.0
var _rise_from := 0.0
var _fade := 0.0
var _rise := 0.0
var _jolt := -1.0
var _card_t := -1.0
var _hot_t := 0.0
var _top := Vector2.ZERO
var _most := 600.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	set_process(false)
	_bar = Control.new()
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar.visible = false
	add_child(_bar)
	_box = UiBox.new(Vector2(300.0, 40.0), 12.0 * K, 40.0 * PX)
	_box.p("c_shadow", Color(10.0 / 255.0, 4.0 / 255.0, 0.0, 0.25)).p("shadow", Vector2(6.0, 18.0) * PX).p("hi", 0.08).p("hi_px", PX)
	_bar.add_child(_box)
	var sd := maxf(11.0 * PX, 13.0 * K)
	_sig = _icon("ft-tower", TOWER, Vector2(sd, sd), Rect2(0, 0, 24, 24))
	_bar.add_child(_sig)
	var nfs := roundi(maxf(10.5 * PX, 12.0 * K))
	_name = UiText.new([["", HudStyle.font("cinzel", 700, roundi(0.08 * nfs)), nfs, NAME]], 0.0, 1.1)
	_bar.add_child(_name)
	var gfs := roundi(maxf(8.0 * PX, 9.0 * K))
	_garr = UiText.new([["", HudStyle.font("inter", 700, roundi(0.12 * gfs)), gfs, Color(1.0, 228.0 / 255.0, 190.0 / 255.0, 0.82)]], 0.0, 1.1)
	_bar.add_child(_garr)
	var hfs := roundi(maxf(7.5 * PX, 8.5 * K))
	_hint = UiText.new([["", HudStyle.font("inter", 600, roundi(0.12 * hfs)), hfs, Color(240.0 / 255.0, 220.0 / 255.0, 180.0 / 255.0, 0.78)]], 0.0, 1.1)
	_bar.add_child(_hint)
	# the title card
	_card = Control.new()
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_card.visible = false
	add_child(_card)
	var kfs := roundi(maxf(10.0 * PX, 13.0 * K))
	_kicker = UiText.new([["THE FORT IS YOURS", HudStyle.font("inter", 700, roundi(0.42 * kfs)), kfs, Color(190.0 / 255.0, 250.0 / 255.0, 240.0 / 255.0, 0.9)]], 0.0, 1.1)
	_kicker.halo = Color(0.0, 0.0, 0.0, 0.8)
	_card.add_child(_kicker)
	var tfs := roundi(maxf(26.0 * PX, 58.0 * K * 0.62))
	_title = UiText.new([["", HudStyle.font("cinzel", 700, roundi(0.1 * tfs)), tfs, Color("#fff8e8")]], 0.0, 1.0)
	_title.halo = Color(244.0 / 255.0, 199.0 / 255.0, 101.0 / 255.0, 0.55)
	_card.add_child(_title)
	_rule = Control.new()
	_rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rule.draw.connect(_draw_rule)
	_card.add_child(_rule)
	var rd := maxf(16.0 * PX, 22.0 * K)
	var rt := _icon("ft-tower-gold", TOWER, Vector2(rd, rd), Rect2(0, 0, 24, 24))
	rt.self_modulate = HudStyle.GOLD
	_rule.add_child(rt)
	var lfs := roundi(maxf(11.0 * PX, 14.0 * K))
	_line = UiText.new([["", HudStyle.font("inter", 600, roundi(0.08 * lfs)), lfs, Color(1.0, 244.0 / 255.0, 220.0 / 255.0, 0.92)]], 0.0, 1.2)
	_line.halo = Color(0.0, 0.0, 0.0, 0.85)
	_card.add_child(_line)


static func _icon(key: String, art: String, sz: Vector2, view: Rect2) -> TextureRect:
	var r := TextureRect.new()
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_SCALE
	r.texture = Icons.svg(key, art, sz, view)
	r.size = sz
	return r


## Where the bar hangs: the middle of its top at `top`, at most `most` wide.
func place(top: Vector2, most: float) -> void:
	if top == _top and most == _most:
		return
	_top = top
	_most = most
	if _key != "":
		_lay()
	_lay_card()


func on() -> bool:
	return _on


## How tall the bar stands while it's up (0 if not).
func height() -> float:
	return _bar.size.y if _on else 0.0


func show_bar(want: bool) -> void:
	if want == _on:
		return
	_on = want
	_fade_from = _fade
	_rise_from = _rise
	_t = 0.0
	if want:
		_bar.visible = true
	set_process(true)


## What it says: {name, kind, ours, guns: Array[bool] (true while it can
## still fire), garrison (soldiers standing, -1 none to fight), hint, hot}.
func set_view(v: Dictionary) -> void:
	var guns: Array = v.guns
	var gs := ",".join(guns.map(func(g: bool) -> String: return "1" if g else "0"))
	var key := "%s|%s|%s|%s|%s|%s|%s" % [v.name, v.kind, v.ours, gs, v.garrison, v.hint, v.hot]
	if key == _key:
		return
	# a gun just fell silent: the bar shudders
	if _guns != "" and _guns != gs and str(v.name) in _key:
		_jolt = 0.0
		set_process(true)
	_guns = gs
	_key = key
	_ours = bool(v.ours)
	_hot = bool(v.hot)
	_name.set_text(str(v.name))
	var accent := AQUA if _ours else BRASS
	_sig.self_modulate = Color("#bff5ec") if _ours else Color("#f0dcae")
	if _ours:
		_box.p("c_top", Color(14.0 / 255.0, 40.0 / 255.0, 44.0 / 255.0, 0.7)).p("c_foot", Color(6.0 / 255.0, 18.0 / 255.0, 22.0 / 255.0, 0.62)).p("c_border", Color(94.0 / 255.0, 227.0 / 255.0, 212.0 / 255.0, 0.4))
	else:
		_box.p("c_top", Color(44.0 / 255.0, 32.0 / 255.0, 20.0 / 255.0, 0.7)).p("c_foot", Color(18.0 / 255.0, 12.0 / 255.0, 7.0 / 255.0, 0.62)).p("c_border", Color(240.0 / 255.0, 210.0 / 255.0, 150.0 / 255.0, 0.26))
	while _pips.size() < guns.size():
		var pw := maxf(13.0 * PX, 15.0 * K)
		var pip := _icon("ft-gun", GUN, Vector2(pw, pw * 14.0 / 24.0), Rect2(0, 0, 24, 14))
		pip.pivot_offset = pip.size * 0.5
		_bar.add_child(pip)
		_pips.append(pip)
	for i in _pips.size():
		var p := _pips[i]
		p.visible = i < guns.size()
		if not p.visible:
			continue
		var live: bool = guns[i]
		p.self_modulate = accent if live else Color(DEAD, 0.7)
		p.rotation = 0.0 if live else deg_to_rad(-14.0)
	var g := int(v.garrison)
	_garr.set_text(("GUNS COVER YOU" if _ours else ("GARRISON %d" % g if g >= 0 else "")))
	_garr.set_runs([[_garr.runs[0][0], _garr.runs[0][1], _garr.runs[0][2], Color(170.0 / 255.0, 245.0 / 255.0, 232.0 / 255.0, 0.85) if _ours else Color(1.0, 228.0 / 255.0, 190.0 / 255.0, 0.82)]])
	_hint.set_runs([[str(v.hint).to_upper(), _hint.runs[0][1], _hint.runs[0][2], HOT if _hot else Color(240.0 / 255.0, 220.0 / 255.0, 180.0 / 255.0, 0.78)]])
	_hint.halo = Color(1.0, 200.0 / 255.0, 80.0 / 255.0, 0.6) if _hot else Color(0.0, 0.0, 0.0, 0.0)
	if _hot:
		set_process(true)
	_lay()


## The title card: the fort's name in stone capitals and what it gives you.
func taken(name_: String, line: String) -> void:
	_title.set_text(name_.to_upper())
	_line.set_text(line)
	_lay_card()
	_card.visible = true
	_card_t = 0.0
	set_process(true)


func clear() -> void:
	show_bar(false)
	_card.visible = false
	_card_t = -1.0
	_key = ""
	_guns = ""


func _process(dt: float) -> void:
	_t += dt
	var to := 1.0 if _on else 0.0
	_fade = lerpf(_fade_from, to, clampf(_t / 0.5, 0.0, 1.0))
	_rise = lerpf(_rise_from, to, HudStyle.spring(clampf(_t / 0.7, 0.0, 1.0)))
	_bar.modulate.a = clampf(_fade, 0.0, 1.0)
	var s := lerpf(0.96, 1.0, _rise)
	var jx := 0.0
	var jy := 0.0
	if _jolt >= 0.0:
		_jolt += dt
		var j := _jolt / 0.42
		if j >= 1.0:
			_jolt = -1.0
		else:
			jx = 3.0 * PX * sin(j * TAU) * (1.0 - j)
			jy = PX * sin(j * PI) * 0.5
	_bar.scale = Vector2(s, s)
	_bar.position = Vector2(roundf(_top.x - _bar.size.x * 0.5 + jx), _top.y - (1.0 - _rise) * 16.0 * PX + jy)
	# the next step is yours: the hint pulses
	if _hot:
		_hot_t = fmod(_hot_t + dt / 0.9, 1.0)
		_hint.modulate.a = 1.0 - 0.4 * (0.5 - 0.5 * cos(_hot_t * TAU))
	else:
		_hint.modulate.a = 1.0
	if _card_t >= 0.0:
		_card_t += dt
		var k := _card_t / 6.2
		# in over 6%, held to 82%, then out drifting up
		var a := clampf(k / 0.06, 0.0, 1.0) if k < 0.06 else (1.0 if k < 0.82 else clampf(1.0 - (k - 0.82) / 0.18, 0.0, 1.0))
		_card.modulate.a = a
		_card.position.y = -10.0 * PX * clampf((k - 0.82) / 0.18, 0.0, 1.0)
		# the name settles in: down from above and out of a blur
		var e := clampf((_card_t - 0.25) / 1.0, 0.0, 1.0)
		var ee := 1.0 - pow(1.0 - e, 3.0)
		_title.modulate.a = ee
		_title.scale = Vector2.ONE * lerpf(1.2, 1.0, ee)
		if k >= 1.0:
			_card_t = -1.0
			_card.visible = false
	if not _on and _t >= 0.7:
		_bar.visible = false
	if (not _on and _t >= 0.7 or _on and _t >= 0.7) and _jolt < 0.0 and _card_t < 0.0 and not _hot:
		set_process(false)


func _lay() -> void:
	var bw := 1.0
	var px := 12.0 * K
	var gap := 6.0 * K
	_name.cut_to(0.0)
	var pw := 0.0
	for p in _pips:
		if p.visible:
			pw += p.size.x + 3.0 * K
	var row := pw + (8.0 * K + _garr.size.x if _garr.size.x > 0.0 else 0.0)
	var room := maxf(60.0, _most - 2.0 * px - _sig.size.x - gap - 12.0 * K - row)
	if _name.size.x > room:
		_name.cut_to(room)
	var top_w := _sig.size.x + gap + _name.size.x
	var w := maxf(top_w + 12.0 * K + row, _hint.size.x) + 2.0 * px
	var l1 := maxf(maxf(_sig.size.y, HelmPill._line(_name)), HelmPill._line(_garr))
	var l2 := HelmPill._line(_hint) if _hint.runs[0][0] != "" else 0.0
	var h := bw + 5.0 * K + l1 + (3.0 * K + l2 if l2 > 0.0 else 0.0) + 5.0 * K + bw
	_bar.size = Vector2(roundf(w), roundf(h))
	_bar.pivot_offset = Vector2(_bar.size.x * 0.5, 0.0)
	_box.resize(_bar.size)
	_box.p("radius", 12.0 * K)
	var x := (w - (top_w + 12.0 * K + row)) * 0.5
	var cy := bw + 5.0 * K + l1 * 0.5
	_sig.position = Vector2(x, roundf(cy - _sig.size.y * 0.5))
	x += _sig.size.x + gap
	MenuKit.line_at(_name, x, cy - HelmPill._line(_name) * 0.5, HelmPill._line(_name))
	x += _name.size.x + 12.0 * K
	for p in _pips:
		if not p.visible:
			continue
		p.position = Vector2(x, roundf(cy - p.size.y * 0.5))
		x += p.size.x + 3.0 * K
	x += 5.0 * K
	MenuKit.line_at(_garr, x, cy - HelmPill._line(_garr) * 0.5, HelmPill._line(_garr))
	if l2 > 0.0:
		MenuKit.line_at(_hint, (w - _hint.size.x) * 0.5, bw + 5.0 * K + l1 + 3.0 * K, l2)
	_hint.visible = l2 > 0.0


func _lay_card() -> void:
	var vp := get_viewport_rect().size if is_inside_tree() else Vector2(1280.0, 720.0)
	var cx := vp.x * 0.5
	var y := vp.y * 0.22
	_kicker.position = Vector2(roundf(cx - _kicker.size.x * 0.5), y)
	y += HelmPill._line(_kicker) + 6.0 * K
	_title.pivot_offset = _title.size * 0.5
	_title.position = Vector2(roundf(cx - _title.size.x * 0.5), y)
	y += _title.size.y + 10.0 * K
	var rh := maxf(16.0 * PX, 22.0 * K)
	_rule.size = Vector2(rh + 2.0 * (90.0 * K + 12.0 * K), rh)
	_rule.position = Vector2(roundf(cx - _rule.size.x * 0.5), y)
	var ic: TextureRect = _rule.get_child(0)
	ic.position = Vector2((_rule.size.x - ic.size.x) * 0.5, 0.0)
	_rule.queue_redraw()
	y += rh + 10.0 * K
	_line.wrap = minf(vp.x * 0.86, 560.0 * K)
	_line.align = HORIZONTAL_ALIGNMENT_CENTER
	_line.set_runs(_line.runs)
	_line.position = Vector2(roundf(cx - _line.size.x * 0.5), y)


## The rule under the name: two hairlines of gold fading out either side of the tower.
func _draw_rule() -> void:
	var h := _rule.size.y
	var lw := 90.0 * K
	var y := h * 0.5
	for side in 2:
		var x0 := 0.0 if side == 0 else _rule.size.x - lw
		var n := 24
		for i in n:
			var t0 := float(i) / n
			var t1 := float(i + 1) / n
			var a := sin(((t0 + t1) * 0.5) * PI) * 0.8
			_rule.draw_line(Vector2(x0 + lw * t0, y), Vector2(x0 + lw * t1, y), Color(HudStyle.GOLD, a), 1.0)
