class_name KrakenHud
extends Control
## The Kraken's chrome (the web game's src/ui/kraken.ts KrakenHud): its health
## across the top of the screen, the title card as it rises, markers over arms
## about to fall, the struggle while it has her in its grip, the sea's edge
## closing in, and the victory card. Built once; only positions, sizes and
## alphas move while it runs.

const K := HudStyle.K
const PX := HudStyle.PX
const SIGIL := '<path d="M12 2.6c-3.4 0-5.8 2.6-5.8 5.8 0 2 .9 3.4 2 4.4-1.6 1.4-3.6 2.2-5.4 2 .9 1.6 3.4 2 5.2 1-.6 1.8-2 3.4-3.8 4 1.8.8 4.2 0 5.4-1.8.4 1.6.2 3.2-.6 4.4 1.8-.2 3-2 3-4 0 2 1.2 3.8 3 4-.8-1.2-1-2.8-.6-4.4 1.2 1.8 3.6 2.6 5.4 1.8-1.8-.6-3.2-2.2-3.8-4 1.8 1 4.3.6 5.2-1-1.8.2-3.8-.6-5.4-2 1.1-1 2-2.4 2-4.4 0-3.2-2.4-5.8-5.8-5.8z" fill="#ffffff"/><circle cx="9.6" cy="8.6" r="1.1" fill="#0b0414"/><circle cx="14.4" cy="8.6" r="1.1" fill="#0b0414"/>'
const WARN := 6
const VIOLET := Color("#b98cff")
const HOT := Color("#ffe08a")
const HINT := Color(214.0 / 255.0, 190.0 / 255.0, 1.0, 0.78)
## The fill's gradient by stage: calm violet, fury magenta, the maelstrom's red.
const STAGES := [
	[Color("#4a1e9a"), Color("#9a5cff"), Color("#d6a8ff"), Color(160.0 / 255.0, 100.0 / 255.0, 1.0, 0.6)],
	[Color("#6a1478"), Color("#d24ac8"), Color("#ff9ae6"), Color(230.0 / 255.0, 80.0 / 255.0, 200.0 / 255.0, 0.6)],
	[Color("#7a0a24"), Color("#ff3a5a"), Color("#ffb08a"), Color(1.0, 60.0 / 255.0, 90.0 / 255.0, 0.7)],
]
const GOLD_GRAD := [Color("#fffaf0"), Color("#ffe3a0"), Color("#e2a84a"), Color("#b9802c"), Vector2(0.48, 0.78)]

## The sea's edge closing in (shaders/kraken_vig.gdshader): the HUD hangs it
## low, under everything else.
var vig: ColorRect
var _vig_mat: ShaderMaterial
var _vig_a := 0.0
var _vig_g := 0.0
var _vig_t := 0.0

var _bar: Control
var _box: UiBox
var _sig: TextureRect
var _name: UiText
var _sub: UiText
var _track: UiBox
var _ghost_clip: Control
var _ghost: UiBox
var _fill_clip: Control
var _fill: UiBox
var _notches: Array[ColorRect] = []
var _hint: UiText
var _on := false
var _t := 9.0
var _fade_from := 0.0
var _rise_from := 0.0
var _fade := 0.0
var _rise := 0.0
var _hit := -1.0
var _hp := -1.0
var _fill_k := 1.0
var _ghost_k := 1.0
var _ghost_wait := 0.0
var _stage := -1
var _hint_text := ""
var _hot := false
var _hot_t := 0.0
var _top := Vector2.ZERO
var _most := 600.0

var _title: Control
var _t_kicker: UiText
var _letters: Array[UiText] = []
var _t_rule: Control
var _t_line: UiText
var _title_t := -1.0

var _grab: Control
var _g_word: UiText
var _g_line: UiText
var _g_track: UiBox
var _g_clip: Control
var _g_fill: UiBox
var _grab_on := false
var _grab_k := 0.0
var _grab_t := 0.0
var _grab_a := 0.0

var _warns: Array[Control] = []
var _warn_t := 0.0

var _win: Control
var _w_kicker: UiText
var _w_title: UiText
var _w_chips: Array[Control] = []
var _w_line: UiText
var _win_t := -1.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	set_process(false)
	vig = ColorRect.new()
	vig.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vig.set_anchors_preset(Control.PRESET_FULL_RECT)
	_vig_mat = ShaderMaterial.new()
	_vig_mat.shader = preload("res://shaders/kraken_vig.gdshader")
	vig.material = _vig_mat
	vig.visible = false
	_build_bar()
	_build_title()
	_build_grab()
	for i in WARN:
		var w := _Warn.new()
		w.visible = false
		add_child(w)
		_warns.append(w)
	_build_win()


func _build_bar() -> void:
	_bar = Control.new()
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar.visible = false
	add_child(_bar)
	_box = UiBox.new(Vector2(400.0, 60.0), 16.0 * K, 40.0 * PX)
	_box.p("c_top", Color(30.0 / 255.0, 12.0 / 255.0, 44.0 / 255.0, 0.9)).p("c_foot", Color(10.0 / 255.0, 4.0 / 255.0, 18.0 / 255.0, 0.88)).p("c_border", Color(185.0 / 255.0, 140.0 / 255.0, 1.0, 0.34))
	_box.p("c_shadow", Color(6.0 / 255.0, 0.0, 14.0 / 255.0, 0.45)).p("shadow", Vector2(14.0, 40.0) * PX).p("hi", 0.08).p("hi_px", PX)
	_box.p("c_glow", Color(120.0 / 255.0, 60.0 / 255.0, 220.0 / 255.0, 0.18)).p("glow", 26.0 * K)
	_bar.add_child(_box)
	var sd := maxf(14.0 * PX, 18.0 * K)
	_sig = _icon("kr-sigil", SIGIL, Vector2(sd, sd))
	_sig.self_modulate = VIOLET
	_bar.add_child(_sig)
	var nfs := roundi(maxf(13.0 * PX, 16.0 * K))
	_name = UiText.new([["THE KRAKEN", HudStyle.font("cinzel", 700, roundi(0.14 * nfs)), nfs, Color("#f4ecff")]], 0.0, 1.0)
	_name.halo = Color(185.0 / 255.0, 140.0 / 255.0, 1.0, 0.5)
	_bar.add_child(_name)
	var sfs := roundi(maxf(8.0 * PX, 9.5 * K))
	_sub = UiText.new([["TERROR OF THE DEEP", HudStyle.font("inter", 700, roundi(0.24 * sfs)), sfs, Color(214.0 / 255.0, 190.0 / 255.0, 1.0, 0.62)]], 0.0, 1.0)
	_bar.add_child(_sub)
	_track = UiBox.new(Vector2(300.0, 10.0), 99.0, 4.0 * PX)
	_track.p("c_top", Color(0.0, 0.0, 0.0, 0.5)).p("c_foot", Color(0.0, 0.0, 0.0, 0.5)).p("c_border", Color(185.0 / 255.0, 140.0 / 255.0, 1.0, 0.14)).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0)).p("hi", 0.0)
	_track.p("c_inset", Color(0.0, 0.0, 0.0, 0.6)).p("inset", 3.0 * PX)
	_bar.add_child(_track)
	_ghost_clip = _clip()
	_bar.add_child(_ghost_clip)
	_ghost = UiBox.new(Vector2(300.0, 10.0), 99.0, 0.0)
	var gc := Color(1.0, 226.0 / 255.0, 246.0 / 255.0, 0.72)
	_ghost.p("c_top", gc).p("c_foot", gc).p("border", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0)).p("hi", 0.0)
	_ghost_clip.add_child(_ghost)
	_fill_clip = _clip()
	_bar.add_child(_fill_clip)
	_fill = UiBox.new(Vector2(300.0, 10.0), 99.0, 0.0)
	_fill.p("horiz", 1.0).p("mid", 0.55).p("border", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0)).p("hi", 0.18)
	_fill_clip.add_child(_fill)
	for i in 2:
		var n := ColorRect.new()
		n.mouse_filter = Control.MOUSE_FILTER_IGNORE
		n.color = Color(10.0 / 255.0, 2.0 / 255.0, 18.0 / 255.0, 0.85)
		_bar.add_child(n)
		_notches.append(n)
	var hfs := roundi(maxf(9.0 * PX, 11.0 * K))
	_hint = UiText.new([["", HudStyle.font("inter", 600, roundi(0.16 * hfs)), hfs, HINT]], 0.0, 1.1)
	_bar.add_child(_hint)
	_paint_stage(0)


func _build_title() -> void:
	_title = Control.new()
	_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_title.visible = false
	add_child(_title)
	var kfs := roundi(maxf(10.0 * PX, 13.0 * K))
	_t_kicker = UiText.new([["FROM THE DEEP IT RISES", HudStyle.font("inter", 700, roundi(0.42 * kfs)), kfs, Color(214.0 / 255.0, 190.0 / 255.0, 1.0, 0.85)]], 0.0, 1.1)
	_t_kicker.halo = Color(0.0, 0.0, 0.0, 0.8)
	_title.add_child(_t_kicker)
	var tfs := roundi(maxf(34.0 * PX, 84.0 * K * 0.62))
	var tf := HudStyle.font("cinzel", 700)
	for c in "THE KRAKEN":
		if c == " ":
			continue
		var l := UiText.new([[c, tf, tfs, Color("#f6eeff")]], 0.0, 1.0)
		l.halo = Color(150.0 / 255.0, 90.0 / 255.0, 1.0, 0.65)
		_title.add_child(l)
		_letters.append(l)
	_t_rule = Control.new()
	_t_rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_t_rule.draw.connect(_draw_rule)
	_title.add_child(_t_rule)
	var rd := maxf(16.0 * PX, 22.0 * K)
	var rs := _icon("kr-sigil-rule", SIGIL, Vector2(rd, rd))
	rs.self_modulate = VIOLET
	_t_rule.add_child(rs)
	var lfs := roundi(maxf(10.0 * PX, 13.0 * K))
	_t_line = UiText.new([["SEVER ITS ARMS · STRIKE THE EYE", HudStyle.font("inter", 600, roundi(0.26 * lfs)), lfs, HOT]], 0.0, 1.1)
	_t_line.halo = Color(0.0, 0.0, 0.0, 0.9)
	_title.add_child(_t_line)


func _build_grab() -> void:
	_grab = Control.new()
	_grab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_grab.visible = false
	add_child(_grab)
	var wfs := roundi(maxf(22.0 * PX, 34.0 * K * 0.8))
	_g_word = UiText.new([["SEIZED!", HudStyle.font("cinzel", 700, roundi(0.16 * wfs)), wfs, Color("#ffd2dc")]], 0.0, 1.0)
	_g_word.halo = Color(1.0, 60.0 / 255.0, 100.0 / 255.0, 0.7)
	_grab.add_child(_g_word)
	var lfs := roundi(maxf(10.0 * PX, 12.0 * K))
	_g_line = UiText.new([["Pour shot into the arm, or crowd on sail and tear free", HudStyle.font("inter", 600, roundi(0.06 * lfs)), lfs, Color(1.0, 240.0 / 255.0, 244.0 / 255.0, 0.92)]], 0.0, 1.25)
	_g_line.halo = Color(0.0, 0.0, 0.0, 0.9)
	_g_line.align = HORIZONTAL_ALIGNMENT_CENTER
	_grab.add_child(_g_line)
	_g_track = UiBox.new(Vector2(300.0, 8.0), 99.0, 4.0 * PX)
	_g_track.p("c_top", Color(0.0, 0.0, 0.0, 0.55)).p("c_foot", Color(0.0, 0.0, 0.0, 0.55)).p("c_border", Color(0.0, 0.0, 0.0, 0.0)).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0)).p("hi", 0.0)
	_g_track.p("c_ring", Color(1.0, 160.0 / 255.0, 190.0 / 255.0, 0.3)).p("ring", 1.0)
	_grab.add_child(_g_track)
	_g_clip = _clip()
	_grab.add_child(_g_clip)
	_g_fill = UiBox.new(Vector2(300.0, 8.0), 99.0, 0.0)
	_g_fill.p("horiz", 1.0).p("c_top", Color("#ff8a3a")).p("c_foot", HOT).p("border", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0)).p("hi", 0.15)
	_g_clip.add_child(_g_fill)


func _build_win() -> void:
	_win = Control.new()
	_win.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_win.visible = false
	add_child(_win)
	var kfs := roundi(maxf(10.0 * PX, 13.0 * K))
	_w_kicker = UiText.new([["VICTORY", HudStyle.font("inter", 700, roundi(0.46 * kfs)), kfs, HudStyle.GOLD]], 0.0, 1.1)
	_w_kicker.halo = Color(0.0, 0.0, 0.0, 0.8)
	_win.add_child(_w_kicker)
	var tfs := roundi(maxf(26.0 * PX, 58.0 * K * 0.62))
	_w_title = UiText.new([["The Kraken is slain", HudStyle.font("cinzel", 700, roundi(0.08 * tfs)), tfs, Color.WHITE]], 0.0, 1.05)
	_w_title.halo = Color(1.0, 190.0 / 255.0, 80.0 / 255.0, 0.35)
	_w_title.material = HudStyle.text_grad(GOLD_GRAD, 0.0, _w_title.size.y)
	_win.add_child(_w_title)
	var lfs := roundi(maxf(10.0 * PX, 12.0 * K))
	_w_line = UiText.new([["ITS HOARD IS RISING FROM THE DEEP. HAUL IT ABOARD.", HudStyle.font("inter", 600, roundi(0.12 * lfs)), lfs, Color(1.0, 244.0 / 255.0, 220.0 / 255.0, 0.85)]], 0.0, 1.25)
	_w_line.halo = Color(0.0, 0.0, 0.0, 0.9)
	_w_line.align = HORIZONTAL_ALIGNMENT_CENTER
	_win.add_child(_w_line)


static func _icon(key: String, art: String, sz: Vector2) -> TextureRect:
	var r := TextureRect.new()
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_SCALE
	r.texture = Icons.svg(key, art, sz)
	r.size = sz
	return r


static func _clip() -> Control:
	var c := Control.new()
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.clip_contents = true
	return c


## Where the bar hangs: the middle of its top at `top`, at most `most` wide.
func place(top: Vector2, most: float) -> void:
	if top == _top and most == _most:
		return
	_top = top
	_most = most
	_lay_bar()
	if _title.visible:
		_lay_title()
	if _grab.visible:
		_lay_grab()
	if _win.visible:
		_lay_win()


func on() -> bool:
	return _on


## How tall the bar stands while it's up (0 if not).
func height() -> float:
	return _bar.size.y if _on else 0.0


## The boss bar (and the toasts stepping down out of its way).
func show_bar(want: bool) -> void:
	if want == _on:
		return
	_on = want
	_fade_from = _fade
	_rise_from = _rise
	_t = 0.0
	if want:
		_bar.visible = true
		_hp = -1.0
		_stage = -1
		_fill_k = 1.0
		_ghost_k = 1.0
		_lay_bar()
	else:
		set_grab(-1.0)
		warnings(PackedVector2Array())
	_wake()


func set_hp(frac: float, stage: int) -> void:
	var q := roundf(frac * 400.0) / 400.0
	if q != _hp:
		var hurt := _hp >= 0.0 and q < _hp
		_hp = q
		if hurt:
			_hit = 0.0
			_ghost_wait = 0.4
		else:
			_fill_k = q
			_ghost_k = q
			_size_hp()
	if stage != _stage:
		_stage = stage
		_paint_stage(stage)
	_wake()


func set_hint(text: String, hot := false) -> void:
	var t := text.to_upper()
	if t == _hint_text and hot == _hot:
		return
	_hint_text = t
	_hot = hot
	_hint.set_runs([[t, _hint.runs[0][1], _hint.runs[0][2], HOT if hot else HINT]])
	_hint.halo = Color(1.0, 200.0 / 255.0, 80.0 / 255.0, 0.6) if hot else Color(0.0, 0.0, 0.0, 0.0)
	_hint.modulate.a = 1.0
	_lay_bar()
	_wake()


## The name card as it rises.
func rise() -> void:
	_lay_title()
	_title.visible = true
	_title_t = 0.0
	_wake()


## The victory card: [{tex (Texture2D, null for the gold coin), label, rarity (-1 gold, 0..4), skin}].
func victory(rewards: Array) -> void:
	for c in _w_chips:
		c.queue_free()
	_w_chips.clear()
	for r: Dictionary in rewards:
		var chip := _Chip.new(r)
		_win.add_child(chip)
		_w_chips.append(chip)
	_lay_win()
	_win.visible = true
	_win_t = 0.0
	_wake()


## Held fast: the struggle prompt with how near she is to tearing free (0..1), -1 for free.
func set_grab(k: float) -> void:
	var want := k >= 0.0
	if want != _grab_on:
		_grab_on = want
		_grab_t = 0.0
		if want:
			_grab.visible = true
			_lay_grab()
	if want:
		var q := roundf(k * 100.0) / 100.0
		if q != _grab_k:
			_grab_k = q
			_g_clip.size.x = _g_track.size.x * q
	_wake()


## Markers over arms about to come down, in screen pixels (at most WARN).
func warnings(pts: PackedVector2Array) -> void:
	for i in WARN:
		var w := _warns[i]
		var on_ := i < pts.size()
		if on_ != w.visible:
			w.visible = on_
		if on_:
			w.position = pts[i].round()
	if not pts.is_empty():
		_wake()


## Everything off at once (a new voyage, the farewell).
func clear() -> void:
	show_bar(false)
	_title.visible = false
	_title_t = -1.0
	_win.visible = false
	_win_t = -1.0
	_vig_a = 0.0
	vig.visible = false


func _wake() -> void:
	set_process(true)


func _paint_stage(stage: int) -> void:
	var g: Array = STAGES[clampi(stage, 0, 2)]
	_fill.p("c_top", g[0]).p("c_mid", g[1]).p("c_foot", g[2])
	_fill.p("c_glow", g[3]).p("glow", (16.0 if stage == 2 else 14.0) * PX)


func _process(dt: float) -> void:
	var busy := false
	# the bar rises in and sinks away
	_t += dt
	var to := 1.0 if _on else 0.0
	_fade = lerpf(_fade_from, to, clampf(_t / 0.5, 0.0, 1.0))
	_rise = lerpf(_rise_from, to, HudStyle.spring(clampf(_t / 0.7, 0.0, 1.0)))
	_bar.modulate.a = clampf(_fade, 0.0, 1.0)
	_bar.scale = Vector2.ONE * lerpf(0.96, 1.0, _rise)
	var jx := 0.0
	var jy := 0.0
	if _hit >= 0.0:
		_hit += dt
		var j := _hit / 0.32
		if j >= 1.0:
			_hit = -1.0
			_box.p("c_border", Color(185.0 / 255.0, 140.0 / 255.0, 1.0, 0.34))
		else:
			jx = 2.0 * PX * sin(j * TAU)
			jy = PX * sin(j * PI) * 0.5
			_box.p("c_border", Color(185.0 / 255.0, 140.0 / 255.0, 1.0, 0.34).lerp(Color(1.0, 200.0 / 255.0, 230.0 / 255.0, 0.6), sin(j * PI)))
			busy = true
	_bar.position = Vector2(roundf(_top.x - _bar.size.x * 0.5 + jx), _top.y - (1.0 - _rise) * 16.0 * PX + jy)
	if _t < 0.7:
		busy = true
	elif not _on:
		_bar.visible = false
	if _on:
		# the fill drops at once, the pale ghost of what it lost follows after a beat
		if _hp >= 0.0 and (_fill_k != _hp or _ghost_k != _hp):
			_fill_k = move_toward(_fill_k, _hp, maxf(absf(_fill_k - _hp), 0.02) * dt / 0.18)
			if _ghost_wait > 0.0:
				_ghost_wait -= dt
			else:
				_ghost_k = move_toward(_ghost_k, _hp, maxf(absf(_ghost_k - _hp), 0.02) * dt / 0.5)
			_size_hp()
			busy = true
		# the maelstrom's rage: the fill throbs
		if _stage == 2:
			_fill.self_modulate = Color.WHITE * (1.0 + 0.35 * (0.5 - 0.5 * cos(_t / 0.9 * TAU)))
			busy = true
		else:
			_fill.self_modulate = Color.WHITE
		if _hot:
			_hot_t = fmod(_hot_t + dt / 0.8, 1.0)
			_hint.modulate.a = 1.0 - 0.4 * (0.5 - 0.5 * cos(_hot_t * TAU))
			busy = true
		else:
			_hint.modulate.a = 1.0
	# the sea's edge: rage darkens it, the grip reddens and pulses it
	var va := 1.0 if _grab_on else (0.6 if _on and _stage >= 2 else 0.0)
	_vig_a = move_toward(_vig_a, va, dt / (0.3 if _grab_on else 1.2))
	_vig_g = move_toward(_vig_g, 1.0 if _grab_on else 0.0, dt / 0.3)
	var pulse := 1.0
	if _grab_on:
		_vig_t = fmod(_vig_t + dt / 1.1, 1.0)
		pulse = 1.0 - 0.28 * (0.5 - 0.5 * cos(_vig_t * TAU))
	vig.visible = _vig_a > 0.002
	if vig.visible:
		_vig_mat.set_shader_parameter("alpha", _vig_a * pulse)
		_vig_mat.set_shader_parameter("grab", _vig_g)
	if _vig_a != va or _grab_on:
		busy = true
	# held fast
	if _grab.visible:
		_grab_t += dt
		_grab_a = move_toward(_grab_a, 1.0 if _grab_on else 0.0, dt / 0.25)
		var e := HudStyle.spring(clampf(_grab_t / 0.4, 0.0, 1.0)) if _grab_on else 1.0 - clampf(_grab_t / 0.25, 0.0, 1.0)
		_grab.modulate.a = _grab_a
		var s := lerpf(0.92, 1.0, e)
		_grab.scale = Vector2(s, s)
		_grab.position.y = (1.0 - e) * 10.0 * PX
		# the word shakes in the beast's grip
		var sh := fmod(_grab_t / 0.5, 1.0)
		var sw := sin(sh * TAU)
		_g_word.rotation = deg_to_rad(-1.0) * sw
		_g_word.position.x = _g_word.get_meta("x", 0.0) - 2.0 * PX * sw
		if not _grab_on and _grab_a <= 0.0:
			_grab.visible = false
		else:
			busy = true
	# arms about to fall: their rings spread
	var warn := false
	for w in _warns:
		if w.visible:
			warn = true
	if warn:
		_warn_t = fmod(_warn_t + dt / 0.8, 1.0)
		for w: _Warn in _warns:
			if w.visible:
				w.ring(_warn_t)
		busy = true
	# the title card
	if _title_t >= 0.0:
		_title_t += dt
		_card(_title, _title_t / 5.2, 0.8)
		var tf: float = _letters[0].runs[0][2]
		for i in _letters.size():
			var l := _letters[i]
			# one letter at a time, up out of the deep (the space counts its turn)
			var e := clampf((_title_t - 0.25 - float(i + (1 if i >= 3 else 0)) * 0.07) / 1.1, 0.0, 1.0)
			var ee := HudStyle.eased(e)
			l.modulate.a = ee
			l.scale = Vector2.ONE * lerpf(1.25, 1.0, ee)
			l.position.y = l.get_meta("y", 0.0) + (1.0 - ee) * 0.45 * tf
		_t_rule.set_meta("k", HudStyle.eased(clampf((_title_t - 1.0) / 1.0, 0.0, 1.0)))
		_t_rule.queue_redraw()
		_t_line.modulate.a = clampf((_title_t - 1.5) / 0.8, 0.0, 1.0)
		if _title_t >= 5.2:
			_title_t = -1.0
			_title.visible = false
		else:
			busy = true
	# the victory card
	if _win_t >= 0.0:
		_win_t += dt
		_card(_win, _win_t / 8.2, 0.8)
		for i in _w_chips.size():
			var c := _w_chips[i]
			var e := clampf((_win_t - 0.7 - float(i) * 0.14) / 0.6, 0.0, 1.0)
			c.modulate.a = clampf(e * 1.6, 0.0, 1.0)
			var sp := HudStyle.spring(e)
			c.scale = Vector2.ONE * lerpf(0.85, 1.0, sp)
			c.position.y = c.get_meta("y", 0.0) + (1.0 - sp) * 12.0 * PX
		if _win_t >= 8.2:
			_win_t = -1.0
			_win.visible = false
		else:
			busy = true
	if not busy:
		set_process(false)


## A card's life (the web's krCard): in over 6%, held to `hold`, then out drifting up.
func _card(c: Control, k: float, hold: float) -> void:
	c.modulate.a = clampf(k / 0.06, 0.0, 1.0) if k < 0.06 else (1.0 if k < hold else clampf(1.0 - (k - hold) / (1.0 - hold), 0.0, 1.0))
	c.position.y = -10.0 * PX * clampf((k - hold) / (1.0 - hold), 0.0, 1.0)


func _size_hp() -> void:
	var w := _track.size.x
	_fill_clip.size = Vector2(roundf(w * clampf(_fill_k, 0.0, 1.0)), _track.size.y)
	_ghost_clip.size = Vector2(roundf(w * clampf(_ghost_k, 0.0, 1.0)), _track.size.y)


func _vp() -> Vector2:
	return get_viewport_rect().size if is_inside_tree() else Vector2(1280.0, 720.0)


func _lay_bar() -> void:
	var w := roundf(clampf(_most, minf(220.0 * PX, _vp().x - 24.0 * PX), 460.0 * K))
	var px := 16.0 * K
	var py := 9.0 * K
	var l1 := maxf(_sig.size.y, maxf(HelmPill._line(_name), HelmPill._line(_sub)))
	var hh := roundf(maxf(7.0 * PX, 10.0 * K))
	var l3 := HelmPill._line(_hint) if _hint_text != "" else 0.0
	var h := py + l1 + 8.0 * K + hh + (6.0 * K + l3 if l3 > 0.0 else 0.0) + py
	_bar.size = Vector2(w, roundf(h))
	_bar.pivot_offset = Vector2(w * 0.5, 0.0)
	_box.resize(_bar.size)
	var cy := py + l1 * 0.5
	_sig.position = Vector2(px, roundf(cy - _sig.size.y * 0.5))
	var x := px + _sig.size.x + 8.0 * K
	_sub.cut_to(0.0)
	var room := w - px - x - 8.0 * K - _name.size.x
	if _sub.size.x > room:
		_sub.cut_to(maxf(room, 0.0))
	MenuKit.line_at(_name, x, cy - HelmPill._line(_name) * 0.5, HelmPill._line(_name))
	MenuKit.line_at(_sub, w - px - _sub.size.x, cy - HelmPill._line(_sub) * 0.5, HelmPill._line(_sub))
	var ty := roundf(py + l1 + 8.0 * K)
	var tw := w - 2.0 * px
	_track.resize(Vector2(tw, hh))
	_track.position = Vector2(px, ty)
	_track.p("radius", hh * 0.5)
	for c: Control in [_ghost_clip, _fill_clip]:
		c.position = _track.position
	_ghost.resize(Vector2(tw, hh))
	_ghost.p("radius", hh * 0.5)
	_fill.resize(Vector2(tw, hh))
	_fill.p("radius", hh * 0.5)
	for i in 2:
		var n := _notches[i]
		n.size = Vector2(maxf(2.0, PX), hh)
		n.position = Vector2(roundf(px + tw * (0.33 if i == 0 else 0.66) - n.size.x * 0.5), ty)
	_size_hp()
	_hint.visible = l3 > 0.0
	if l3 > 0.0:
		_hint.cut_to(0.0)
		if _hint.size.x > tw:
			_hint.cut_to(tw)
		MenuKit.line_at(_hint, roundf((w - _hint.size.x) * 0.5), ty + hh + 6.0 * K, l3)


func _lay_title() -> void:
	var vp := _vp()
	var cx := vp.x * 0.5
	var y := vp.y * 0.24
	_t_kicker.position = Vector2(roundf(cx - _t_kicker.size.x * 0.5), y)
	y += HelmPill._line(_t_kicker) + 6.0 * K
	# the letters in a row, tracked out with a gap for the space
	var tf: float = _letters[0].runs[0][2]
	var track := 0.14 * tf
	var gap := 0.4 * tf
	var tw := 0.0
	for i in _letters.size():
		tw += _letters[i].size.x + (track if i < _letters.size() - 1 else 0.0) + (gap if i == 2 else 0.0)
	var x := cx - tw * 0.5
	var lh := 0.0
	for i in _letters.size():
		var l := _letters[i]
		l.pivot_offset = l.size * 0.5
		l.position = Vector2(roundf(x), y)
		l.set_meta("y", y)
		x += l.size.x + track + (gap if i == 2 else 0.0)
		lh = maxf(lh, l.size.y)
	y += lh + 10.0 * K
	var rh := maxf(16.0 * PX, 22.0 * K)
	_t_rule.size = Vector2(rh + 2.0 * (110.0 * K + 12.0 * K), rh)
	_t_rule.position = Vector2(roundf(cx - _t_rule.size.x * 0.5), y)
	var ic: TextureRect = _t_rule.get_child(0)
	ic.position = Vector2((_t_rule.size.x - ic.size.x) * 0.5, 0.0)
	y += rh + 10.0 * K
	_t_line.position = Vector2(roundf(cx - _t_line.size.x * 0.5), y)


## The rule under the name: two violet hairlines drawing out from the sigil.
func _draw_rule() -> void:
	var k: float = _t_rule.get_meta("k", 0.0)
	if k <= 0.0:
		return
	var h := _t_rule.size.y
	var lw := 110.0 * K
	var y := h * 0.5
	var c := Color(214.0 / 255.0, 190.0 / 255.0, 1.0)
	var n := 24
	for side in 2:
		# each grows from the sigil outward
		var inner := lw if side == 0 else _t_rule.size.x - lw
		var dir := -1.0 if side == 0 else 1.0
		for i in n:
			var t0 := float(i) / n * k
			var t1 := float(i + 1) / n * k
			var a := (1.0 - (t0 + t1) * 0.5) * 0.8
			_t_rule.draw_line(Vector2(inner + dir * lw * t0, y), Vector2(inner + dir * lw * t1, y), Color(c, a), 1.0)


func _lay_grab() -> void:
	var vp := _vp()
	var w := minf(360.0 * K, vp.x - 32.0 * PX)
	_grab.size = Vector2(w, 0.0)
	_grab.pivot_offset = Vector2(w * 0.5, 0.0)
	var x0 := roundf((vp.x - w) * 0.5)
	_grab.position.x = x0
	var gx := roundf((w - _g_word.size.x) * 0.5)
	_g_word.pivot_offset = _g_word.size * 0.5
	_g_word.position = Vector2(gx, vp.y * 0.62)
	_g_word.set_meta("x", gx)
	var y := vp.y * 0.62 + _g_word.size.y + 7.0 * K
	_g_line.wrap = w
	_g_line.fixed = w
	_g_line.set_runs(_g_line.runs)
	_g_line.position = Vector2(0.0, y)
	y += _g_line.size.y + 10.0 * K
	var gh := roundf(maxf(6.0 * PX, 8.0 * K))
	_g_track.resize(Vector2(w, gh))
	_g_track.p("radius", gh * 0.5)
	_g_track.position = Vector2(0.0, y)
	_g_clip.position = _g_track.position
	_g_clip.size = Vector2(w * _grab_k, gh)
	_g_fill.resize(Vector2(w, gh))
	_g_fill.p("radius", gh * 0.5)


func _lay_win() -> void:
	var vp := _vp()
	var cx := vp.x * 0.5
	var y := vp.y * 0.2
	_w_kicker.position = Vector2(roundf(cx - _w_kicker.size.x * 0.5), y)
	y += HelmPill._line(_w_kicker) + 6.0 * K
	_w_title.position = Vector2(roundf(cx - _w_title.size.x * 0.5), y)
	y += _w_title.size.y + 16.0 * K
	# the chips in rows, each centred, wrapping inside the screen
	var most := vp.x - 32.0 * PX
	var gap := 10.0 * K
	var rows: Array = [[]]
	var rw := 0.0
	for c in _w_chips:
		var row: Array = rows[-1]
		if not row.is_empty() and rw + gap + c.size.x > most:
			rows.append([])
			rw = 0.0
			row = rows[-1]
		rw += (gap if not row.is_empty() else 0.0) + c.size.x
		row.append(c)
	for row: Array in rows:
		if row.is_empty():
			continue
		var w := -gap
		var hh := 0.0
		for c: Control in row:
			w += c.size.x + gap
			hh = maxf(hh, c.size.y)
		var x := cx - w * 0.5
		for c: Control in row:
			c.pivot_offset = c.size * 0.5
			c.position = Vector2(roundf(x), y)
			c.set_meta("y", y)
			x += c.size.x + gap
		y += hh + gap
	y += 14.0 * K - gap
	_w_line.wrap = most
	_w_line.set_runs(_w_line.runs)
	_w_line.position = Vector2(roundf(cx - _w_line.size.x * 0.5), y)


## A marker over an arm about to fall: a hot amber disc with a bang, and a ring spreading off it.
class _Warn:
	extends Control

	var _disc: UiBox
	var _ring: UiBox
	var _bang: UiText

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var d := maxf(22.0 * HudStyle.PX, 28.0 * HudStyle.K)
		_ring = UiBox.new(Vector2(d, d), d * 0.5, d * 1.2)
		_ring.p("c_top", Color(0.0, 0.0, 0.0, 0.0)).p("c_foot", Color(0.0, 0.0, 0.0, 0.0)).p("c_border", Color(1.0, 170.0 / 255.0, 60.0 / 255.0, 0.9)).p("border", 2.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0)).p("hi", 0.0)
		_ring.position = -Vector2(d, d) * 0.5
		_ring.pivot_offset = Vector2(d, d) * 0.5
		add_child(_ring)
		_disc = UiBox.new(Vector2(d, d), d * 0.5, 20.0 * HudStyle.PX)
		_disc.p("radial", Vector4(0.4, 0.35, 1.0, 1.0)).p("radial_stop", 0.9).p("c_top", Color("#fff2c0")).p("c_foot", Color("#e0501a")).p("border", 0.0)
		_disc.p("c_ring", Color(40.0 / 255.0, 0.0, 10.0 / 255.0, 0.6)).p("ring", 2.0).p("c_glow", Color(1.0, 120.0 / 255.0, 40.0 / 255.0, 0.8)).p("glow", 18.0)
		_disc.p("c_shadow", Color(0.0, 0.0, 0.0, 0.0)).p("hi", 0.2)
		_disc.position = -Vector2(d, d) * 0.5
		add_child(_disc)
		var fs := roundi(maxf(13.0 * HudStyle.PX, 17.0 * HudStyle.K))
		_bang = UiText.new([["!", HudStyle.font("inter", 800), fs, Color("#2a0008")]], 0.0, 1.0)
		add_child(_bang)
		MenuKit.line_at(_bang, -_bang.size.x * 0.5, -HelmPill._line(_bang) * 0.5, HelmPill._line(_bang))

	## How far the ring has spread (0..1).
	func ring(t: float) -> void:
		var e := 1.0 - pow(1.0 - t, 2.0)
		_ring.scale = Vector2.ONE * lerpf(1.0, 2.6, e)
		_ring.modulate.a = 1.0 - e


## A reward on the victory card: a dark pill with its art and what it is.
class _Chip:
	extends Control

	func _init(r: Dictionary) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var k := HudStyle.K
		var px := HudStyle.PX
		var rar := int(r.get("rarity", 0))
		var isz := maxf(22.0 * px, 30.0 * k)
		var fs := roundi(maxf(11.0 * px, 13.0 * k))
		var label := UiText.new([[str(r.get("label", "")), HudStyle.font("inter", 700), fs, Color("#f4f0ea")]], 0.0, 1.1)
		var h := roundf(isz + 12.0 * k)
		var w := roundf(7.0 * k + isz + 8.0 * k + label.size.x + 14.0 * k)
		size = Vector2(w, h)
		var box := UiBox.new(size, h * 0.5, 30.0 * px)
		box.p("c_top", Color(20.0 / 255.0, 26.0 / 255.0, 40.0 / 255.0, 0.92)).p("c_foot", Color(8.0 / 255.0, 10.0 / 255.0, 20.0 / 255.0, 0.9)).p("hi", 0.08).p("hi_px", px)
		box.p("c_shadow", Color(0.0, 0.0, 0.0, 0.4)).p("shadow", Vector2(10.0, 26.0) * px)
		var border := Color(1.0, 1.0, 1.0, 0.14)
		if rar == -1:
			border = Color(244.0 / 255.0, 199.0 / 255.0, 101.0 / 255.0, 0.5)
		elif rar == 3:
			border = Color(196.0 / 255.0, 139.0 / 255.0, 1.0, 0.6)
			box.p("c_glow", Color(196.0 / 255.0, 139.0 / 255.0, 1.0, 0.3)).p("glow", 16.0 * px)
		elif rar >= 4:
			border = Color(1.0, 181.0 / 255.0, 46.0 / 255.0, 0.7)
			box.p("c_glow", Color(1.0, 181.0 / 255.0, 46.0 / 255.0, 0.35)).p("glow", 18.0 * px)
		box.p("c_border", border)
		add_child(box)
		var ix := 7.0 * k
		var iy := (h - isz) * 0.5
		if bool(r.get("skin", false)):
			# the Kraken Ink livery: a swirl of ink, violet and sea-glass
			var sw := UiBox.new(Vector2(isz, isz), isz * 0.5, 12.0 * px)
			sw.p("radial", Vector4(0.34, 0.3, 1.1, 1.1)).p("c_top", Color("#3fd1c4")).p("c_foot", Color("#1a0f2e")).p("radial_stop", 0.9)
			sw.p("c_border", Color(1.0, 1.0, 1.0, 0.25)).p("c_glow", Color(63.0 / 255.0, 209.0 / 255.0, 196.0 / 255.0, 0.45)).p("glow", 12.0 * px).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0)).p("hi", 0.3)
			sw.p("c_inset", Color("#7b2a8c")).p("inset", isz * 0.3)
			sw.position = Vector2(ix, iy)
			add_child(sw)
		else:
			var tex: Texture2D = r.get("tex", null)
			if tex == null:
				tex = Icons.svg("badge:coin", Icons.BADGE["coin"], Vector2(isz, isz))
			var ic := TextureRect.new()
			ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
			ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			ic.stretch_mode = TextureRect.STRETCH_SCALE
			ic.texture = tex
			ic.size = Vector2(isz, isz)
			ic.position = Vector2(ix, iy)
			add_child(ic)
		add_child(label)
		MenuKit.line_at(label, ix + isz + 8.0 * k, (h - HelmPill._line(label)) * 0.5, HelmPill._line(label))
