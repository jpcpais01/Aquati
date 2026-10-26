class_name LetterCard
extends Control
## A note that has come aboard (the web's ui/letter.ts): a message fished
## out of a bottle, or one off the carrier gull's back. It arrives rolled up
## and sealed with a dab of wax (a bottle's bobbing up from below, a gull's
## dropping in from above), the wax cracks, the paper unrolls down the side
## of the view (salt-stained, torn at its sides, the rest of it still rolled
## at its foot) and the words ink themselves in, line by line, as if the
## pen were still moving. Then its seal, what it brings you, and a thin
## line running down for how long it stays. A tap while it is still being
## written finishes the writing; a tap after that rolls it up and away. The
## voyage sails on beneath it. One arriving while another is open waits
## its turn.

## The wax cracked as it opens; it is rolled up and put away.
signal opened
signal put_away

const K := HudStyle.K
const INK := Color("#3a2614")
const INK_TITLE := Color("#2b1a0d")
const INK_SIGN := Color("#4a2a12")
const SEALS := {
	"red": [Color("#e0574a"), Color("#a3241f"), Color("#6e1210")],
	"black": [Color("#5a5450"), Color("#1e1a18"), Color("#0b0908")],
	"gold": [Color("#ffe08a"), Color("#d99a35"), Color("#8a5a12")],
}
const PAPER := preload("res://shaders/letter_paper.gdshader")
const INK_SHADER := preload("res://shaders/letter_ink.gdshader")

## Its timeline (seconds from its arrival): it slides in rolled up, the wax
## cracks, it unrolls, and the pen starts.
const ARRIVE := 0.5
const CRACK := 0.46
const OPEN := 0.6
const OPEN_FOR := 0.72
const PEN := 0.92
## Rolled up and away again.
const OUT := 0.62
## Its roll's radius rolled up, and the bit left curled at its foot.
const ROLL := 11.0 * K
const CURL := 4.5 * K

## Holds it at this many seconds into its arrival (a still for a screenshot), or -1.
var hold := -1.0

var _queue: Array = []
var _life := 0.0
var _t := -1.0
## Rolling up (seconds into it), or -1; how far open it was then.
var _out := -1.0
var _out_from := 1.0
## Written in full, and gone, this far in.
var _done := 0.0
var _gone := 0.0
var _cracked := false
## Rising from below (a bottle, 1) or dropping in from above (a gull, -1).
var _from := 1.0
var _sheet: _Sheet
var _badge: Control
var _reward: UiBox
var _sheet_y := 0.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	set_process(false)
	gui_input.connect(func(e: InputEvent) -> void:
		if (e is InputEventMouseButton and e.pressed) or (e is InputEventScreenTouch and e.pressed):
			accept_event()
			tap())


func _ready() -> void:
	# (the engine turns _process on as it enters the tree)
	set_process(visible and _sheet != null)


func is_open() -> bool:
	return visible and _out < 0.0


## Unrolls a letter: {via ("bottle" or "gull"), kicker, title, body (paragraphs),
## sign, reward, seal ("red", "black", "gold"), art (a Texture2D)}. `life`
## is about how long it stays, reading time and all.
func show_letter(v: Dictionary, life := 11.0) -> void:
	if visible:
		_queue.append([v, life])
		return
	_build(v)
	_life = life
	_t = 0.0
	_out = -1.0
	_cracked = false
	_from = -1.0 if v.get("via", "bottle") == "gull" else 1.0
	_done = PEN + _sheet.pen_for
	_gone = maxf(_done + life * 0.72, life)
	visible = true
	set_process(true)
	_pose()


## A tap: the writing finished at once if the pen is still going, else it is put away.
func tap() -> void:
	if not visible or _out >= 0.0:
		return
	if _t < _done - 0.05:
		_t = _done - 0.05
		return
	hide_letter()


func hide_letter() -> void:
	if not visible or _out >= 0.0:
		return
	_out = 0.0
	_out_from = _sheet.reveal
	put_away.emit()


func clear() -> void:
	_queue.clear()
	visible = false
	set_process(false)


func _process(dt: float) -> void:
	if _out >= 0.0:
		_out += dt
		if _out >= OUT:
			visible = false
			set_process(false)
			if not _queue.is_empty():
				var next: Array = _queue.pop_front()
				get_tree().create_timer(0.15).timeout.connect(func() -> void: show_letter(next[0], next[1]))
			return
	else:
		_t = hold if hold >= 0.0 else _t + dt
	_pose()
	if _out < 0.0 and hold < 0.0 and _t > _gone:
		hide_letter()


## Everything about it worked out from how far into its arrival (and its
## going) it is, so a tap can skip ahead.
func _pose() -> void:
	var t := _t
	var s := _sheet
	# sliding in, rolled up, with a breath of sea breeze once it is here
	var a := clampf(t / ARRIVE, 0.0, 1.0)
	var sway := clampf((t - ARRIVE) / 0.8, 0.0, 1.0)
	var y := _from * 70.0 * K * (1.0 - HudStyle.spring(a)) + sin(t * 0.9) * 1.3 * K * sway
	var rot := lerpf(_from * -7.0, -1.2, HudStyle.eased(a)) + sin(t * 1.25 + 0.6) * 0.35 * sway
	var x := 0.0
	var fade := clampf(t / 0.22, 0.0, 1.0)
	# the wax cracks, then it unrolls
	if not _cracked and t >= CRACK:
		_cracked = true
		if t < CRACK + 0.3:
			opened.emit()
	s.clasp.crack = clampf((t - CRACK) / 0.34, 0.0, 1.0) if t >= CRACK else -clampf((t - CRACK + 0.18) / 0.18, 0.0, 1.0)
	var u := HudStyle.eased(clampf((t - OPEN) / OPEN_FOR, 0.0, 1.0))
	var pen := clampf((t - PEN) / s.pen_for, 0.0, 1.0)
	var after := clampf((t - _done) / 0.4, 0.0, 1.0)
	var later := 1.0
	if _out >= 0.0:
		# rolled back up from the foot, then away to the side
		var o := clampf(_out / 0.36, 0.0, 1.0)
		u = _out_from * (1.0 - o * o)
		later = 1.0 - clampf(_out / 0.18, 0.0, 1.0)
		var g := clampf((_out - 0.26) / (OUT - 0.26), 0.0, 1.0)
		x = -70.0 * K * g * g
		rot -= 9.0 * g * g
		fade *= 1.0 - g
	s.reveal = u
	s.pen = pen
	s.seal.pop = after * later
	s.timer.left = (1.0 - clampf((t - _done) / maxf(_gone - _done, 0.1), 0.0, 1.0)) if t > _done and hold < 0.0 else 1.0
	s.timer.modulate.a = clampf((t - _done - 0.3) / 0.4, 0.0, 1.0) * later * (0.0 if hold >= 0.0 else 1.0)
	s.position = Vector2(x, _sheet_y + y)
	s.rotation = deg_to_rad(rot)
	s.modulate.a = fade
	# the badge drops in over it; what it brings springs in once it is written
	var b := clampf((t - 0.2) / 0.5, 0.0, 1.0)
	_badge.modulate.a = b * fade * (later if _out >= 0.0 else 1.0)
	_badge.position.y = 8.0 * K * (1.0 - HudStyle.spring(b))
	if _reward != null:
		var r := clampf((t - _done + 0.1) / 0.55, 0.0, 1.0)
		_reward.modulate.a = r * later
		_reward.scale = Vector2.ONE * lerpf(0.82, 1.0, HudStyle.spring(r))
		_reward.position.y = s.position.y + s.size.y + 10.0 * K + 10.0 * K * (1.0 - HudStyle.spring(r))
		var sh := (t - _done - 0.3) / 1.1
		_reward.p("sheen", sh if sh > 0.0 and sh < 1.0 else -1.0)


func _build(v: Dictionary) -> void:
	for c in get_children():
		remove_child(c)
		c.queue_free()
	_reward = null
	var vp := get_viewport_rect().size
	var ml := vp.x * 0.03
	var w := minf(300.0 * K, vp.x - ml * 2.0)
	# the badge: what it came in, and the kicker
	var badge := HBoxContainer.new()
	badge.add_theme_constant_override("separation", roundi(6.0 * K))
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.add_child(Icons.rect("gull" if v.get("via", "bottle") == "gull" else "bottle", 17.0 * K, HudStyle.GOLD))
	var kick := HudStyle.label(str(v.get("kicker", "")).to_upper(), "inter", 700, roundi(maxf(7.5, 8.5 * K)), HudStyle.GOLD, roundi(8.5 * K * 0.2))
	kick.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
	kick.add_theme_constant_override("shadow_offset_y", 1)
	badge.add_child(kick)
	badge.position = Vector2(6.0 * K, 0.0)
	badge.size = badge.get_combined_minimum_size()
	add_child(badge)
	_badge = badge
	# the sheet
	_sheet = _Sheet.new(v, w)
	_sheet_y = badge.size.y + 6.0 * K + CURL
	_sheet.position = Vector2(0.0, _sheet_y)
	add_child(_sheet)
	var h := _sheet_y + _sheet.size.y
	var reward := str(v.get("reward", ""))
	if reward != "":
		var l := HudStyle.label(reward, "inter", 700, roundi(maxf(10.5, 12.0 * K)), HudStyle.GOLD_INK, roundi(12.0 * K * 0.04))
		var ls := l.get_combined_minimum_size()
		var pill := UiBox.new(Vector2(ls.x + 24.0 * K, ls.y + 9.0 * K), (ls.y + 9.0 * K) * 0.5, 30.0 * HudStyle.PX)
		HudStyle.gold(pill, HudStyle.PX * 0.5)
		pill.p("sheen_w", 0.3).p("sheen_a", 0.7)
		l.position = Vector2(12.0 * K, 4.0 * K)
		pill.add_child(l)
		pill.position = Vector2((w - pill.size.x) * 0.5, h + 10.0 * K)
		pill.pivot_offset = pill.size * 0.5
		add_child(pill)
		_reward = pill
		h = pill.position.y + pill.size.y
	size = Vector2(w, h)
	# at the side of the view, halfway down
	position = Vector2(ml, roundf((vp.y - h) * 0.5))


## The paper itself (shaders/letter_paper.gdshader), the words inked on it,
## the wax that held it rolled, its seal and the line running down.
class _Sheet:
	extends Control
	## How far it has unrolled (0..1).
	var reveal := 1.0:
		set(r):
			reveal = r
			_open()
	## How far the pen has got (0..1).
	var pen := 1.0:
		set(p):
			pen = p
			_ink()
	## How long the pen takes over it.
	var pen_for := 1.0
	var seal: _Seal
	var clasp: _Clasp
	var timer: _Timer
	var art: _Art
	## The flat paper's height, opened.
	var full := 0.0
	var _clip: Control
	var _mat: ShaderMaterial
	## [UiText, its material, the line it starts on] each, and their lines in all.
	var _words: Array = []
	var _lines := 0.0

	func _init(v: Dictionary, w: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var colours: Array = SEALS.get(str(v.get("seal", "red")), SEALS.red)
		_mat = ShaderMaterial.new()
		_mat.shader = PAPER
		_mat.set_shader_parameter("k", K)
		_mat.set_shader_parameter("curl_r", CURL)
		_mat.set_shader_parameter("seed", randf() * 10.0)
		material = _mat
		_clip = Control.new()
		_clip.clip_contents = true
		_clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_clip)
		var px := 18.0 * K
		var iw := w - px * 2.0
		var y := 14.0 * K + CURL
		var ad := 64.0 * K
		var tex: Texture2D = v.get("art", null)
		if tex != null:
			art = _Art.new(tex, ad)
			art.position = Vector2(w - px - ad + 4.0 * K, y - 2.0 * K)
			_clip.add_child(art)
		var title := UiText.new([[str(v.get("title", "")), HudStyle.font("serif-italic", 600), roundi(maxf(13.0, 16.0 * K)), INK_TITLE]], iw - (ad + 8.0 * K if tex != null else 0.0), 1.2)
		title.position = Vector2(px, y)
		_write(title)
		y += title.size.y + 6.0 * K
		var body_f := HudStyle.font("serif-italic", 500)
		var bs := roundi(maxf(11.0, 13.0 * K))
		var top := y - title.size.y - 6.0 * K
		for p: String in v.get("body", []):
			# (the portrait floats beside the first lines)
			var pw := iw - (ad + 8.0 * K if tex != null and y < top + ad + 4.0 * K else 0.0)
			var t := UiText.new([[p, body_f, bs, INK]], pw, 1.38)
			t.position = Vector2(px, y)
			_write(t)
			y += t.size.y + 6.0 * K
		var sign := str(v.get("sign", ""))
		if sign != "":
			var s := UiText.new([[sign, body_f, roundi(maxf(12.0, 14.5 * K)), INK_SIGN]], iw - 30.0 * K, 1.25)
			s.align = HORIZONTAL_ALIGNMENT_RIGHT
			s.fit(iw - 30.0 * K)
			s.position = Vector2(px, y + 2.0 * K)
			_write(s)
			y += s.size.y + 2.0 * K
		if tex != null:
			y = maxf(y, top + ad + 8.0 * K)
		full = y + 16.0 * K
		size = Vector2(w, full + CURL)
		_clip.size = size
		pivot_offset = Vector2(w * 0.5, 0.0)
		_mat.set_shader_parameter("sheet", Vector2(w, full))
		# a line a moment, a long letter written a little quicker
		pen_for = clampf(_lines * 0.17, 0.9, 2.4)
		var sd := 26.0 * K
		seal = _Seal.new(colours, sd)
		seal.position = Vector2(w - 10.0 * K - sd * 0.5, full - 8.0 * K - sd * 0.5)
		add_child(seal)
		timer = _Timer.new()
		timer.position = Vector2(px, full - 6.0 * K)
		timer.size = Vector2(w - px * 2.0 - sd - 6.0 * K, 2.0)
		add_child(timer)
		clasp = _Clasp.new(colours)
		clasp.position = Vector2(w * 0.5, 0.0)
		add_child(clasp)

	func _write(t: UiText) -> void:
		var m := ShaderMaterial.new()
		m.shader = INK_SHADER
		m.set_shader_parameter("line_h", t._lh)
		m.set_shader_parameter("width", maxf(t.size.x, 1.0))
		t.material = m
		_clip.add_child(t)
		_words.append([t, m, _lines])
		_lines += maxf(1.0, roundf(t.size.y / maxf(t._lh, 1.0)))

	func _open() -> void:
		var h := full * reveal
		var r := lerpf(ROLL, CURL, reveal)
		_mat.set_shader_parameter("open_h", h)
		_mat.set_shader_parameter("roll_r", r)
		# the words show only where it lies open
		_clip.size.y = maxf(0.0, h - r * 0.8)
		clasp.position.y = h
		queue_redraw()

	func _ink() -> void:
		var g := pen * _lines
		for wd: Array in _words:
			(wd[1] as ShaderMaterial).set_shader_parameter("ink", g - float(wd[2]) if pen < 1.0 else 1000.0)
		if art != null:
			art.modulate.a = clampf(g * 1.4, 0.0, 1.0)

	func _draw() -> void:
		var m := 26.0 * K
		draw_rect(Rect2(-m, -CURL - m, size.x + m * 2.0, full + ROLL + m * 2.4), Color.WHITE)


## The wax that held it rolled up, round a turn of twine, until it cracks.
class _Clasp:
	extends Control
	## Swelling before it goes (-1..0), then cracking apart (0..1).
	var crack := -1.0:
		set(c):
			if c != crack:
				crack = c
				visible = c < 1.0
				queue_redraw()
	var colours: Array
	var _bits: Array = []

	func _init(c: Array) -> void:
		colours = c
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		for i in 6:
			_bits.append([randf_range(-1.0, 1.0), randf_range(-1.6, -0.4), randf_range(0.6, 1.2)])

	func _draw() -> void:
		var r := 8.5 * K
		var c := crack
		if c <= 0.0:
			# the twine round the roll, and the dab of wax over it
			var sw := 1.0 + 0.12 * maxf(0.0, 1.0 + c) * maxf(0.0, 1.0 + c)
			draw_rect(Rect2(-2.2 * K, -ROLL, 4.4 * K, ROLL * 2.0), Color("#8a6a3c"))
			draw_rect(Rect2(-0.6 * K, -ROLL, 1.2 * K, ROLL * 2.0), Color(1.0, 0.92, 0.75, 0.35))
			_blob(Vector2.ZERO, r * sw, 0.0, TAU, 1.0)
			return
		# cracked in two, the halves and a few crumbs falling away, the twine sprung
		var e := c * c
		var a := 1.0 - c
		for sd: float in [-1.0, 1.0]:
			var at := Vector2(sd * (3.0 + 16.0 * c) * K, 30.0 * K * e)
			var spin := sd * c * 0.9
			_blob(at, r, PI * 0.5 + spin + (PI if sd < 0.0 else 0.0), PI, a)
			var tw := Vector2(sd * (2.0 + 24.0 * c) * K, -ROLL * (1.0 - c) + 20.0 * K * e)
			draw_line(tw, tw + Vector2(sd * 9.0 * K, 6.0 * K).rotated(sd * c * 1.5), Color(0.54, 0.42, 0.24, a), 2.6 * K, true)
		for b: Array in _bits:
			var at := Vector2(float(b[0]) * 22.0 * K * c, (float(b[1]) * 14.0 * c + 46.0 * e) * K)
			draw_circle(at, 1.6 * K * float(b[2]), Color(colours[1] as Color, a), true, -1.0, true)

	## A dab of wax (or a piece of one): the arc from `from` round `span`.
	func _blob(at: Vector2, r: float, from: float, span: float, a: float) -> void:
		var pts := PackedVector2Array()
		const N := 20
		var whole := span >= TAU - 0.01
		if not whole:
			pts.append(at)
		for i in N + (0 if whole else 1):
			var t := from + span * i / N
			# lumpy, as wax is
			pts.append(at + Vector2(cos(t), sin(t)) * r * (1.0 + 0.07 * sin(t * 5.0 + 1.3)))
		draw_colored_polygon(pts, Color(0.0, 0.0, 0.0, 0.3 * a))
		var lit := PackedVector2Array()
		for p in pts:
			lit.append(at + (p - at) * 0.94 + Vector2(0.0, -0.8 * K))
		draw_colored_polygon(lit, Color(colours[1] as Color, a))
		var hi := PackedVector2Array()
		for p in pts:
			hi.append(at + (p - at) * 0.55 + Vector2(-0.18, -0.24) * r)
		draw_colored_polygon(hi, Color(colours[0] as Color, 0.75 * a))
		if whole:
			# the sigil pressed into it
			draw_arc(at + Vector2(0.0, -0.5 * K), r * 0.5, 0.0, TAU, 20, Color(colours[2] as Color, 0.85 * a), 1.4 * K, true)
			draw_line(at + Vector2(0.0, -0.32 * r), at + Vector2(0.0, 0.26 * r), Color(colours[2] as Color, 0.85 * a), 1.4 * K, true)


## Its seal in the corner, broken open, pressed on once the writing is done.
class _Seal:
	extends Control
	var pop := 0.0:
		set(p):
			if p != pop:
				pop = p
				visible = p > 0.0
				modulate.a = clampf(p * 3.0, 0.0, 1.0)
				scale = Vector2.ONE * lerpf(1.45, 1.0, HudStyle.spring(p))
				rotation = deg_to_rad(lerpf(-24.0, -6.0, HudStyle.eased(p)))
	var colours: Array
	var d := 26.0

	func _init(c: Array, p_d: float) -> void:
		colours = c
		d = p_d
		visible = false
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		draw_circle(Vector2(0.0, 1.0), d * 0.5, Color(0.0, 0.0, 0.0, 0.3))
		for i in 5:
			var f := float(i) / 4.0
			var c: Color = (colours[2] as Color).lerp(colours[1], minf(1.0, f * 1.6)) if f < 0.6 else (colours[1] as Color).lerp(colours[0], (f - 0.6) / 0.4)
			draw_circle(Vector2(-0.14, -0.18) * d * f, d * 0.5 * (1.0 - f * 0.55), c, true, -1.0, true)
		# the break across it
		draw_polyline(PackedVector2Array([Vector2(0.04, 0.5) * d, Vector2(-0.04, 0.1) * d, Vector2(-0.1, 0.5) * d]), INK, 1.6, true)


## A fine inked line along its foot, running down for as long as it stays.
class _Timer:
	extends Control
	var left := 1.0:
		set(l):
			if absf(l - left) > 0.002:
				left = l
				queue_redraw()

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var w := size.x * left
		if w < 1.0:
			return
		draw_line(Vector2.ZERO, Vector2(w, 0.0), Color(INK, 0.22), 1.2, true)
		draw_circle(Vector2(w, 0.0), 1.6, Color(INK, 0.4), true, -1.0, true)


## A portrait inked in a ring beside the text.
class _Art:
	extends Control
	var tex: Texture2D

	func _init(t: Texture2D, d: float) -> void:
		tex = t
		size = Vector2(d, d)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size * 0.5
		var r := size.x * 0.5
		draw_circle(c, r + 4.0, Color(0.23, 0.15, 0.08, 0.15), true, -1.0, true)
		draw_circle(c, r + 2.0, Color(0.23, 0.15, 0.08, 0.7), true, -1.0, true)
		draw_circle(c, r, Color("#e8d2a0"), true, -1.0, true)
		var pts := PackedVector2Array()
		var uvs := PackedVector2Array()
		const N := 32
		# the bust's 100 x 110 grid, its head and shoulders filling the ring
		var ts := tex.get_size()
		var asp := ts.y / ts.x
		for i in N:
			var a := TAU * i / N
			var p := Vector2(cos(a), sin(a))
			pts.append(c + p * r)
			uvs.append(Vector2(0.5 + p.x * 0.5, (0.5 + p.y * 0.5 / asp) - 0.02))
		draw_colored_polygon(pts, Color(1.0, 0.95, 0.85), uvs, tex)
