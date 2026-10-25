class_name LetterCard
extends Control
## A note that has come aboard (the web's ui/letter.ts): a message fished
## out of a bottle. It unrolls at the side of the view as a sheet of
## salt-stained paper (ink, a wax seal, a signature, what it brings you) and
## rolls itself up again after a while; a tap or click puts it away sooner.
## The voyage sails on beneath it. One arriving while another is open waits
## its turn.

const K := HudStyle.K
const INK := Color("#3a2614")
const INK_TITLE := Color("#2b1a0d")
const INK_SIGN := Color("#4a2a12")
const SEALS := {
	"red": [Color("#e0574a"), Color("#a3241f"), Color("#6e1210")],
	"black": [Color("#5a5450"), Color("#1e1a18"), Color("#0b0908")],
	"gold": [Color("#ffe08a"), Color("#d99a35"), Color("#8a5a12")],
}

var _queue: Array = []
var _life := 0.0
var _t := -1.0
## Fading out (seconds left), or -1.
var _out := -1.0
var _sheet: _Sheet
var _badge: Control
var _reward: Control
var _sheet_h := 0.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	set_process(false)
	gui_input.connect(func(e: InputEvent) -> void:
		if (e is InputEventMouseButton and e.pressed) or (e is InputEventScreenTouch and e.pressed):
			accept_event()
			hide_letter())


func _ready() -> void:
	# (the engine turns _process on as it enters the tree)
	set_process(visible and _sheet != null)


func is_open() -> bool:
	return visible and _out < 0.0


## Unrolls a letter: {via ("bottle" or "gull"), kicker, title, body (paragraphs),
## sign, reward, seal ("red", "black", "gold"), art (a Texture2D)}.
func show_letter(v: Dictionary, life := 11.0) -> void:
	if visible:
		_queue.append([v, life])
		return
	_build(v)
	_life = life
	_t = 0.0
	_out = -1.0
	modulate.a = 0.0
	visible = true
	set_process(true)


func hide_letter() -> void:
	if not visible or _out >= 0.0:
		return
	_out = 0.4


func clear() -> void:
	_queue.clear()
	visible = false
	set_process(false)


func _process(dt: float) -> void:
	if _out >= 0.0:
		_out -= dt
		modulate.a = clampf(_out / 0.4, 0.0, 1.0)
		if _out <= 0.0:
			visible = false
			set_process(false)
			if not _queue.is_empty():
				var next: Array = _queue.pop_front()
				get_tree().create_timer(0.05).timeout.connect(func() -> void: show_letter(next[0], next[1]))
		return
	_t += dt
	modulate.a = minf(1.0, _t / 0.25)
	# the sheet unrolls from the top, the badge and the reward spring in
	var u := HudStyle.eased(clampf(_t / 0.7, 0.0, 1.0))
	_sheet.reveal = u
	_sheet.rotation = deg_to_rad(lerpf(-2.5, -1.0, u))
	_sheet.position.y = _badge.size.y + 6.0 * K - 10.0 * (1.0 - u)
	var b := HudStyle.spring(clampf(_t / 0.5, 0.0, 1.0))
	_badge.modulate.a = clampf(_t / 0.5, 0.0, 1.0)
	_badge.position.y = 8.0 * (1.0 - b)
	if _reward != null:
		var r := clampf((_t - 0.45) / 0.55, 0.0, 1.0)
		_reward.modulate.a = r
		_reward.scale = Vector2.ONE * lerpf(0.9, 1.0, HudStyle.spring(r))
	if _t > _life:
		hide_letter()


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
	_sheet.position = Vector2(0.0, badge.size.y + 6.0 * K)
	add_child(_sheet)
	var h := _sheet.position.y + _sheet.size.y
	var reward := str(v.get("reward", ""))
	if reward != "":
		var l := HudStyle.label(reward, "inter", 700, roundi(maxf(10.5, 12.0 * K)), HudStyle.GOLD_INK, roundi(12.0 * K * 0.04))
		var ls := l.get_combined_minimum_size()
		var pill := UiBox.new(Vector2(ls.x + 24.0 * K, ls.y + 9.0 * K), (ls.y + 9.0 * K) * 0.5, 30.0 * HudStyle.PX)
		HudStyle.gold(pill, HudStyle.PX * 0.5)
		l.position = Vector2(12.0 * K, 4.0 * K)
		pill.add_child(l)
		pill.position = Vector2((w - pill.size.x) * 0.5, h + 8.0 * K)
		pill.pivot_offset = pill.size * 0.5
		add_child(pill)
		_reward = pill
		h = pill.position.y + pill.size.y
	size = Vector2(w, h)
	# at the side of the view, halfway down
	position = Vector2(ml, roundf((vp.y - h) * 0.5))


## The paper itself: salt-stained, darker at its edges, a tide mark where
## the sea got in round the cork, the words inked on it and a broken seal.
class _Sheet:
	extends Control
	## How much of it has unrolled (0..1).
	var reveal := 1.0:
		set(r):
			reveal = r
			queue_redraw()
			if _clip != null:
				_clip.size.y = size.y * r
	var seal: Array
	var art: Texture2D
	var _clip: Control

	func _init(v: Dictionary, w: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		seal = SEALS.get(str(v.get("seal", "red")), SEALS.red)
		art = v.get("art", null)
		_clip = Control.new()
		_clip.clip_contents = true
		_clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_clip)
		var px := 18.0 * K
		var iw := w - px * 2.0
		var y := 16.0 * K
		var ad := 64.0 * K
		if art != null:
			var ring := _Art.new(art, ad)
			ring.position = Vector2(w - px - ad + 4.0 * K, y - 2.0 * K)
			_clip.add_child(ring)
		var title := UiText.new([[str(v.get("title", "")), HudStyle.font("serif-italic", 600), roundi(maxf(13.0, 16.0 * K)), INK_TITLE]], iw - (ad + 8.0 * K if art != null else 0.0), 1.2)
		title.position = Vector2(px, y)
		_clip.add_child(title)
		y += title.size.y + 6.0 * K
		var body_f := HudStyle.font("serif-italic", 500)
		var bs := roundi(maxf(11.0, 13.0 * K))
		for p: String in v.get("body", []):
			# (the portrait floats beside the first lines)
			var pw := iw - (ad + 8.0 * K if art != null and y < 16.0 * K + ad + 4.0 * K else 0.0)
			var t := UiText.new([[p, body_f, bs, INK]], pw, 1.38)
			t.position = Vector2(px, y)
			_clip.add_child(t)
			y += t.size.y + 6.0 * K
		var sign := str(v.get("sign", ""))
		if sign != "":
			var s := UiText.new([[sign, body_f, roundi(maxf(12.0, 14.5 * K)), INK_SIGN]], iw - 30.0 * K, 1.25)
			s.align = HORIZONTAL_ALIGNMENT_RIGHT
			s.fit(iw - 30.0 * K)
			s.position = Vector2(px, y + 2.0 * K)
			_clip.add_child(s)
			y += s.size.y + 2.0 * K
		if art != null:
			y = maxf(y, 16.0 * K + ad + 8.0 * K)
		size = Vector2(w, y + 18.0 * K)
		_clip.size = size
		pivot_offset = size * 0.5

	func _draw() -> void:
		var h := size.y * reveal
		if h < 1.0:
			return
		var w := size.x
		var r := Rect2(Vector2.ZERO, Vector2(w, h))
		# its shadow on the sea
		for i in 4:
			var g := (4 - i) * 3.0 * K
			draw_rect(Rect2(r.position + Vector2(-g * 0.5, 10.0 * K - g * 0.3), r.size + Vector2(g, g)), Color(0.0, 0.04, 0.07, 0.06))
		# the paper: pale in the middle, browned toward its edges
		var cols := PackedColorArray()
		var pts := PackedVector2Array()
		var c0 := Color("#f3e4c0")
		var c1 := Color("#d6b77d")
		const N := 24
		var centre := Vector2(w * 0.5, h * 0.5)
		pts.append(centre)
		cols.append(c0)
		for i in N + 1:
			var a := TAU * i / N
			var d := Vector2(cos(a), sin(a))
			# out to the rectangle's edge
			var tx := (w * 0.5) / maxf(absf(d.x), 1e-4)
			var ty := (h * 0.5) / maxf(absf(d.y), 1e-4)
			pts.append(centre + d * minf(tx, ty))
			cols.append(c1)
		var tris := PackedInt32Array()
		for i in N:
			tris.append_array([0, i + 1, i + 2])
		RenderingServer.canvas_item_add_triangle_array(get_canvas_item(), tris, pts, cols)
		# the paler heart, foxing, and the tide mark
		draw_circle(centre, minf(w, h) * 0.38, Color(0.953, 0.894, 0.753, 0.55))
		draw_circle(Vector2(w * 0.18, h * 0.12), w * 0.1, Color(0.59, 0.39, 0.16, 0.1))
		draw_circle(Vector2(w * 0.86, h * 0.78), w * 0.12, Color(0.51, 0.33, 0.12, 0.1))
		draw_circle(Vector2(w * 0.7, h * 0.24), w * 0.04, Color(0.47, 0.31, 0.12, 0.12))
		draw_arc(Vector2(w * 0.85, -0.04 * w), w * 0.23, PI * 0.45, PI * 1.05, 24, Color(0.55, 0.37, 0.16, 0.18), 2.0, true)
		draw_rect(r, Color(0.43, 0.27, 0.08, 0.35), false, 1.0)
		draw_rect(r.grow(-1.0), Color(1.0, 0.96, 0.86, 0.3), false, 1.0)
		# the wax seal in the corner, broken open
		if reveal >= 0.999:
			var sd := 26.0 * K
			var sc := Vector2(w - 10.0 * K - sd * 0.5, h - 10.0 * K - sd * 0.5)
			draw_circle(sc + Vector2(0.0, 1.0), sd * 0.5, Color(0.0, 0.0, 0.0, 0.3))
			for i in 5:
				var f := float(i) / 4.0
				var c: Color = (seal[2] as Color).lerp(seal[1], minf(1.0, f * 1.6)) if f < 0.6 else (seal[1] as Color).lerp(seal[0], (f - 0.6) / 0.4)
				draw_circle(sc.lerp(sc + Vector2(-0.14, -0.18) * sd, f), sd * 0.5 * (1.0 - f * 0.55), c, true, -1.0, true)
			# the break across it
			draw_polyline(PackedVector2Array([sc + Vector2(0.04, 0.5) * sd, sc + Vector2(-0.04, 0.1) * sd, sc + Vector2(-0.1, 0.5) * sd]), Color("#3a2614"), 1.6, true)


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
