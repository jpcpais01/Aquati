class_name WantedHud
extends RefCounted
## The bounty side of the HUD (the web game's WantedHud and BountyBanner,
## src/ui/bounty.ts): the voyage's wanted meter under the purse, the pointer
## to whoever hunts you while she's out of sight, and the big notices for a
## hunter setting out and a bounty claimed. Hud owns the three and places them.

## The jolly roger the skull pips are cut from (the web's --skull mask).
const SKULL := '<path fill-rule="evenodd" d="M12 1C6 1 2 5.2 2 10.6c0 3.2 1.5 5.4 3.6 6.8V21a1.5 1.5 0 0 0 1.5 1.5h1.4V20h1.6v2.5h3.8V20h1.6v2.5h1.4a1.5 1.5 0 0 0 1.5-1.5v-3.6c2.1-1.4 3.6-3.6 3.6-6.8C22 5.2 18 1 12 1zM8.2 9.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zm7.6 0a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM12 14.6l-1.5 2.6h3z" fill="%s"/>'
const BLOOD := Color("#b3261e")
const BLOOD_HI := Color("#ff6b55")
const PARCH := Color("#efe0bb")
const PARCH_INK := Color("#2b1a0d")


## A skull pip `w` HUD units across in a flat colour, or the fill's gradient (`lit`: brighter at the crown).
static func skull(w: float, color: Color, grad := false, lit := false) -> Texture2D:
	var fill := "#" + color.to_html(false)
	var defs := ""
	if grad:
		defs = '<defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient></defs>' % (["#ff5040", "#ffe7a8"] if lit else ["#ff6b55", "#ffd28a"])
		fill = "url(#g)"
	var key := "wanted-skull-%s%s%s" % [color.to_html(), grad, lit]
	return Icons.svg(key, defs + SKULL % fill, Vector2(w, w * 26.0 / 24.0), Rect2(0, 0, 24, 26), false)


## A row of `of` skulls, `n` of them lit (a poster's tier), `w` units each.
class Tier:
	extends Control
	var n := 0
	var of := 5
	var w := 11.0
	var on := PARCH_INK
	var off := Color(PARCH_INK, 0.18)
	var gap := 3.0

	func _init(p_n: int, p_w: float, p_on: Color, p_off: Color, p_of := 5) -> void:
		n = p_n
		w = p_w
		on = p_on
		off = p_off
		of = p_of
		gap = p_w * 0.27
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		custom_minimum_size = Vector2(of * w + (of - 1) * gap, w * 26.0 / 24.0)
		size = custom_minimum_size

	func _draw() -> void:
		var a := WantedHud.skull(w, Color.WHITE)
		var h := w * 26.0 / 24.0
		for i in of:
			draw_texture_rect(a, Rect2(i * (w + gap), 0.0, w, h), false, on if i < n else off)


## The voyage's wanted meter: five skulls filling from the jaw up toward the
## next, the word WANTED (or the hunter's name and how far off she is).
class Meter:
	extends PanelContainer
	var _pips: _Pips
	var _lbl: Label
	var _hunt: Label
	var _box: StyleBoxFlat
	var _key := ""
	var _hunt_key := ""
	var _bump := 1.0
	var _in := 1.0

	func _init() -> void:
		var k := HudStyle.K
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_box = StyleBoxFlat.new()
		_box.bg_color = Color(0.13, 0.06, 0.06, 0.76)
		_box.border_color = Color(1.0, 0.47, 0.39, 0.22)
		_box.set_border_width_all(1)
		_box.set_corner_radius_all(99)
		_box.corner_detail = 10
		_box.anti_aliasing = true
		_box.content_margin_left = 9.0 * k
		_box.content_margin_right = 11.0 * k
		add_theme_stylebox_override("panel", _box)
		custom_minimum_size = Vector2(0.0, maxf(20.0 * HudStyle.PX, 26.0 * k))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", roundi(8.0 * k))
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_pips = _Pips.new(maxf(10.0 * HudStyle.PX, 13.0 * k))
		_pips.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(_pips)
		_lbl = HudStyle.label("WANTED", "inter", 800, roundi(maxf(9.0 * HudStyle.PX, 10.0 * k)), Color(1.0, 0.85, 0.8, 0.75), 2)
		_lbl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(_lbl)
		_hunt = HudStyle.label("", "cinzel", 700, roundi(maxf(10.5 * HudStyle.PX, 12.0 * k)), Color("#ffd8cc"))
		_hunt.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		_hunt.visible = false
		row.add_child(_hunt)
		add_child(row)
		visible = false

	func reset() -> void:
		_key = ""
		_hunt_key = ""
		visible = false
		_hunt.visible = false
		_lbl.visible = true

	func show_heat(pts: int, level: int, hunter: String, dist: float) -> void:
		var p := Bounty.wanted_progress(pts)
		var key := "%d|%.2f" % [level, p]
		if key != _key:
			var grew := _key != "" and int(_key.split("|")[0]) < level
			if not visible and pts > 0:
				_in = 0.0
			_key = key
			visible = pts > 0
			_pips.level = level
			_pips.p = p
			_pips.hot = level >= 3
			_pips.queue_redraw()
			if grew:
				_bump = 0.0
		var hk := "%s|%d" % [hunter, roundi(dist / 10.0)] if hunter != "" else ""
		if hk != _hunt_key:
			_hunt_key = hk
			_hunt.visible = hunter != ""
			_lbl.visible = hunter == ""
			_hunt.text = "%s  %d m" % [hunter, roundi(dist)] if hunter != "" else ""
			reset_size()

	func _process(dt: float) -> void:
		if not visible:
			return
		pivot_offset = size * Vector2(0.0, 0.5)
		if _in < 1.0:
			_in = minf(1.0, _in + dt / 0.6)
			modulate.a = _in
			position.x = -12.0 * HudStyle.K * (1.0 - HudStyle.spring(_in))
		elif position.x != 0.0:
			position.x = 0.0
		if _bump < 1.0:
			_bump = minf(1.0, _bump + dt / 0.9)
			var b := sin(clampf(_bump / 0.3, 0.0, 1.0) * PI * 0.5) if _bump < 0.3 else 1.0 - (_bump - 0.3) / 0.7
			scale = Vector2.ONE * (1.0 + 0.14 * b)
			_box.border_color = Color(1.0, 0.47, 0.39, 0.22).lerp(Color(1.0, 0.55, 0.43, 0.85), b)
			_box.shadow_color = Color(1.0, 0.31, 0.2, 0.55 * b)
			_box.shadow_size = roundi(13.0 * b)
		elif scale != Vector2.ONE:
			scale = Vector2.ONE
			_box.border_color = Color(1.0, 0.47, 0.39, 0.22)
			_box.shadow_size = 0


class _Pips:
	extends Control
	var level := 0
	var p := 0.0
	var hot := false
	var w := 13.0
	var _shown := 0.0

	func _init(p_w: float) -> void:
		w = p_w
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		custom_minimum_size = Vector2(5.0 * w + 4.0 * 3.0 * HudStyle.K, w * 26.0 / 24.0)

	func _process(dt: float) -> void:
		var want := level + p
		if absf(_shown - want) > 0.001:
			_shown = move_toward(_shown, want, dt / 0.5 * maxf(1.0, absf(want - _shown)))
			queue_redraw()

	func _draw() -> void:
		var gap := 3.0 * HudStyle.K
		var h := w * 26.0 / 24.0
		var base := WantedHud.skull(w, Color(1.0, 0.9, 0.82, 0.16))
		var fill := WantedHud.skull(w, Color.WHITE, true)
		var lit := WantedHud.skull(w, Color.WHITE, true, true)
		for i in 5:
			var r := Rect2(i * (w + gap), 0.0, w, h)
			var f := clampf(_shown - i, 0.0, 1.0)
			if i < level and hot:
				# the lit skulls of a hot voyage glow
				draw_texture_rect(lit, r.grow(w * 0.12), false, Color(1.0, 0.35, 0.24, 0.45))
			draw_texture_rect(base, r, false)
			if f <= 0.0:
				continue
			var t: Texture2D = lit if i < level else fill
			var ts := t.get_size()
			# rising from the jaw
			draw_texture_rect_region(t, Rect2(r.position.x, r.position.y + h * (1.0 - f), w, h * f), Rect2(0.0, ts.y * (1.0 - f), ts.x, ts.y * f))


## Points at the hunter from the edge of the screen while she's out of
## sight: a pulsing blood-red disc with a skull, an arrow off it toward her,
## and her name and range under it.
class Mark:
	extends Control
	var _label: Label
	var _pill: PanelContainer
	var _dir := 0.0
	var _t := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var k := HudStyle.K
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0.118, 0.024, 0.016, 0.78)
		sb.set_corner_radius_all(99)
		sb.corner_detail = 8
		sb.anti_aliasing = true
		sb.content_margin_left = 8.0 * k
		sb.content_margin_right = 8.0 * k
		sb.content_margin_top = 2.0 * k
		sb.content_margin_bottom = 2.0 * k
		_pill = PanelContainer.new()
		_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_pill.add_theme_stylebox_override("panel", sb)
		_label = HudStyle.label("", "inter", 700, roundi(maxf(10.0 * HudStyle.PX, 11.0 * k)), Color("#ffe0d6"))
		_pill.add_child(_label)
		add_child(_pill)
		visible = false

	## Puts it on the screen's edge toward her (`sx`, `sy` her place on screen,
	## mirrored when she's behind the camera), or hides it while she's in view.
	func point(sx: float, sy: float, in_front: bool, dist: float, hunter: String, vp: Vector2) -> void:
		var k := HudStyle.K
		var m := 46.0 * k
		if in_front and sx > m and sx < vp.x - m and sy > m and sy < vp.y - m:
			visible = false
			return
		var dx := sx - vp.x * 0.5
		var dy := sy - vp.y * 0.5
		if not in_front:
			dx = -dx
			dy = -dy
		var l := maxf(1.0, Vector2(dx, dy).length())
		dx /= l
		dy /= l
		var hw := vp.x * 0.5 - m - 12.0 * k
		var hh := vp.y * 0.5 - m - 30.0 * k
		var s := minf(hw / maxf(1e-3, absf(dx)), hh / maxf(1e-3, absf(dy)))
		position = Vector2(vp.x * 0.5 + dx * s, vp.y * 0.5 + dy * s).round()
		_dir = atan2(dy, dx)
		var t := "%s · %d m" % [hunter, roundi(dist)]
		if _label.text != t:
			_label.text = t
			_pill.reset_size()
		_pill.position = Vector2(-_pill.size.x * 0.5, 21.0 * k)
		visible = true
		queue_redraw()

	func hide_mark() -> void:
		visible = false

	func _process(dt: float) -> void:
		if visible:
			_t += dt
			queue_redraw()

	func _draw() -> void:
		var k := HudStyle.K
		var r := 17.0 * k
		var pulse := 0.5 - 0.5 * cos(_t * TAU / 1.4)
		# the glow, the ring of light and the disc
		for i in 4:
			var g := r + (4.0 + i * 5.0) * k * (0.7 + 0.5 * pulse)
			draw_circle(Vector2.ZERO, g, Color(1.0, 0.27, 0.16, (0.16 + 0.1 * pulse) / (i + 1)))
		draw_circle(Vector2.ZERO, r + 2.0, Color(1.0, 0.86, 0.78, 0.85))
		draw_circle(Vector2.ZERO, r, Color("#7a1410"))
		draw_circle(Vector2(-0.1, -0.15) * r, r * 0.72, Color("#a52a20"))
		draw_circle(Vector2(-0.1, -0.15) * r, r * 0.42, Color("#c83a2e"))
		var sw := r * 2.0 * 0.56
		var sk := WantedHud.skull(sw, Color("#ffe9d6"))
		draw_texture_rect(sk, Rect2(Vector2(-sw * 0.5, -sw * 13.0 / 24.0), Vector2(sw, sw * 26.0 / 24.0)), false)
		# the arrow, off the disc toward her
		var d := Vector2(cos(_dir), sin(_dir))
		var n := Vector2(-d.y, d.x)
		var a := d * 19.0 * k
		var tip := d * 30.0 * k
		draw_colored_polygon(PackedVector2Array([a + n * 7.0 * k, tip, a - n * 7.0 * k]), Color("#ffd2c4"))


## The big notices: a hunter sets out after you, or her bounty is yours.
class Banner:
	extends PanelContainer
	var _box: StyleBoxFlat
	var _bust: Bust
	var _col: VBoxContainer
	var _t := 1e9
	var _life := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var k := HudStyle.K
		_box = StyleBoxFlat.new()
		_box.set_corner_radius_all(roundi(22.0 * k))
		_box.corner_detail = 12
		_box.anti_aliasing = true
		_box.set_border_width_all(1)
		_box.shadow_size = roundi(26.0 * k)
		_box.shadow_offset = Vector2(0.0, 12.0 * k)
		_box.content_margin_left = 12.0 * k
		_box.content_margin_right = 22.0 * k
		_box.content_margin_top = 12.0 * k
		_box.content_margin_bottom = 12.0 * k
		add_theme_stylebox_override("panel", _box)
		var row := HBoxContainer.new()
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_theme_constant_override("separation", roundi(14.0 * k))
		_bust = Bust.new(Vector2(78.0, 86.0) * k)
		_bust.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(_bust)
		_col = VBoxContainer.new()
		_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_col.add_theme_constant_override("separation", roundi(2.0 * k))
		_col.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(_col)
		add_child(row)
		visible = false

	## A named captain sets out after you.
	func hunt(c: Dictionary, gold: int) -> void:
		_style(false)
		_bust.set_face(c.face, false)
		_lines([
			["A PRICE ON YOUR HEAD", "inter", 800, 10.0, WantedHud.BLOOD_HI, 3],
			["", "", 0, 2.0, Color.WHITE, 0],
			[str(c.epithet), "cinzel", 700, 23.0, Color("#fff2e6"), 1],
			["%s · %s" % [ShipClass.named(c.cls).name, c.ship], "inter", 600, 11.5, Color(1.0, 0.886, 0.839, 0.72), 1, int(c.tier)],
			["“%s”" % c.taunt, "serif-italic", 500, 13.5, Color("#ffe8dc"), 0],
			["%s gold bounty" % MenuKit.num(gold), "inter", 800, 12.5, HudStyle.GOLD_HI, 0, -1, true],
		])
		_open(7.0)

	## Her bounty is yours.
	func claimed(c: Dictionary, gold: int, infamy: int) -> void:
		_style(true)
		_bust.set_face(c.face, true)
		_lines([
			["BOUNTY CLAIMED", "inter", 800, 10.0, HudStyle.GOLD, 3],
			["", "", 0, 2.0, Color.WHITE, 0],
			[str(c.epithet), "cinzel", 700, 23.0, Color("#fff2e6"), 1],
			["The %s is on the bottom" % c.ship, "inter", 600, 11.5, Color(1.0, 0.886, 0.839, 0.72), 1],
			["+%s gold" % MenuKit.num(gold), "inter", 800, 20.0, HudStyle.GOLD_HI, 0, -1, true],
			["INFAMY +%d" % infamy, "inter", 700, 11.0, Color(1.0, 0.784, 0.706, 0.8), 2],
		])
		_open(6.5)

	func clear() -> void:
		visible = false
		_t = 1e9

	func _style(gold: bool) -> void:
		_box.bg_color = Color(0.17, 0.11, 0.025, 0.94) if gold else Color(0.15, 0.035, 0.03, 0.93)
		_box.border_color = Color(0.957, 0.78, 0.396, 0.6) if gold else Color(1.0, 0.59, 0.47, 0.4)
		_box.shadow_color = Color(0.0, 0.0, 0.0, 0.5)

	func _lines(rows: Array) -> void:
		for c in _col.get_children():
			c.queue_free()
		var k := HudStyle.K
		for r: Array in rows:
			if r[1] == "":
				continue
			var px := roundi(maxf(r[3] * 0.75 * HudStyle.PX, r[3] * k))
			var l := HudStyle.label(r[0], r[1], r[2], px, r[4], r[5])
			l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if r[1] == "serif-italic" else TextServer.AUTOWRAP_OFF
			if r[1] == "serif-italic":
				# wrapped past a comfortable measure, else as wide as the words
				var tw := HudStyle.font(r[1], r[2]).get_string_size(str(r[0]), HORIZONTAL_ALIGNMENT_LEFT, -1, px).x + 2.0
				l.custom_minimum_size = Vector2(minf(tw, minf(380.0 * k, 300.0 * HudStyle.PX)), 0.0)
			if r.size() > 7 and r[7]:
				l.add_theme_color_override("font_shadow_color", Color(1.0, 0.75, 0.24, 0.45))
				l.add_theme_constant_override("shadow_outline_size", roundi(6.0 * k))
			if r.size() > 6 and int(r[6]) > 0:
				var row := HBoxContainer.new()
				row.mouse_filter = Control.MOUSE_FILTER_IGNORE
				row.add_theme_constant_override("separation", roundi(8.0 * k))
				row.add_child(l)
				var t := WantedHud.Tier.new(int(r[6]), maxf(9.0 * HudStyle.PX, 11.0 * k), Color("#ff8a70"), Color(1.0, 0.86, 0.78, 0.2))
				t.size_flags_vertical = Control.SIZE_SHRINK_CENTER
				row.add_child(t)
				_col.add_child(row)
			else:
				_col.add_child(l)

	func _open(life: float) -> void:
		_life = life
		_t = 0.0
		visible = true
		modulate.a = 0.0
		reset_size()

	func _process(dt: float) -> void:
		if not visible:
			return
		_t += dt
		pivot_offset = size * 0.5
		var a := 1.0
		var y := 0.0
		var s := 1.0
		var rot := 0.0
		if _t < 0.7:
			var e := HudStyle.spring(_t / 0.7)
			a = clampf(_t / 0.35, 0.0, 1.0)
			y = -20.0 * (1.0 - e)
			s = 0.9 + 0.1 * e
			rot = deg_to_rad(-1.5) * (1.0 - e)
		elif _t > _life - 0.7:
			var o := clampf((_t - (_life - 0.7)) / 0.7, 0.0, 1.0)
			a = 1.0 - o
			y = -10.0 * o
			s = 1.0 - 0.03 * o
		if _t >= _life:
			visible = false
			return
		modulate.a = a
		scale = Vector2(s, s)
		rotation = rot
		position.y = _top + y * HudStyle.K

	var _top := 0.0

	func place(centre_x: float, top: float) -> void:
		_top = top
		reset_size()
		position = Vector2(roundf(centre_x - size.x * 0.5), top)


## A poster's bust: the engraving in its oval frame (ink, parchment, ink),
## and on a claimed one the red SUNK stamped across it.
class Bust:
	extends Control
	var _tex: Texture2D
	var _stamp := false
	var _t := 0.0

	func _init(sz: Vector2) -> void:
		custom_minimum_size = sz
		size = sz
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_face(face: Dictionary, stamp: bool, unknown := false) -> void:
		_tex = Portrait.texture(face, size.y, unknown)
		_stamp = stamp
		_t = 0.0
		queue_redraw()

	func _process(dt: float) -> void:
		if _stamp and _t < 1.2:
			_t += dt
			queue_redraw()

	func _oval(grow: float, n := 48) -> PackedVector2Array:
		var c := size * 0.5
		var r := size * 0.5 + Vector2(grow, grow)
		var pts := PackedVector2Array()
		for i in n:
			var a := TAU * i / n
			pts.append(c + Vector2(cos(a) * r.x, sin(a) * r.y))
		return pts

	func _draw() -> void:
		var k := HudStyle.K
		draw_colored_polygon(_oval(4.0 * k * 0.7), Color("#e6cf9c"))
		draw_colored_polygon(_oval(2.0 * k * 0.7), WantedHud.PARCH_INK)
		draw_colored_polygon(_oval(0.0), Color("#ecdcb6"))
		if _tex != null:
			var pts := _oval(0.0)
			var uvs := PackedVector2Array()
			for p in pts:
				uvs.append(p / size)
			draw_colored_polygon(pts, Color.WHITE, uvs, _tex)
		if _stamp:
			var t := clampf((_t - 0.55) / 0.5, 0.0, 1.0)
			if t <= 0.0:
				return
			var e := 1.0 + 1.6 * (1.0 - HudStyle.spring(t))
			var f := HudStyle.font("cinzel", 900, 2)
			var px := roundi(17.0 * k)
			var w := f.get_string_size("SUNK", HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
			var box := Vector2(w + 14.0 * k, px * 1.3)
			draw_set_transform(Vector2(size.x * 0.5, size.y * 0.36 + box.y * 0.5), deg_to_rad(-16.0), Vector2(e, e))
			var r := Rect2(-box * 0.5, box)
			draw_rect(r, Color(1.0, 0.93, 0.84, 0.55 * t))
			draw_rect(r, Color(WantedHud.BLOOD, t), false, 2.0)
			draw_rect(r.grow(-3.0), Color(WantedHud.BLOOD, t * 0.8), false, 1.0)
			draw_string(f, Vector2(-w * 0.5, px * 0.36), "SUNK", HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color(WantedHud.BLOOD, t))
			draw_set_transform(Vector2.ZERO)
