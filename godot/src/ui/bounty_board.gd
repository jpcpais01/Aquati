class_name BountyBoard
extends CanvasLayer
## The Wanted Board (the web's bounties sheet, src/ui/bounty.ts): your infamy
## among the Brethren (its rank in a blood-red seal, the bar to the next, and
## four tallies), and a wall of parchment notices, one for every named
## captain: unknown till one has come hunting you, "At large" once she has,
## and stamped SUNK once her bounty is claimed. Opened from the harbour's
## tools or the pause menu; it scrolls under a finger or the wheel.

signal closed
signal clicked

const HOW := "Every pirate you sink raises your wanted level for the voyage. At each new skull the Brethren send a named captain after you: tougher, faster and sharper-eyed than any crew, with a Crown bounty to match. Your lifetime infamy raises every bounty the Crown pays."

var _root: Control
var _back: ShaderMaterial
var _holder: Control
var _close: UiButton
var _body: Control
var _content: Control
var _reveal := MenuKit.Reveal.new()
var _t := 0.0
var _scroll := 0.0
var _scroll_max := 0.0
var _fling := 0.0
var _down := false
var _from := Vector2.ZERO
var _last := Vector2.ZERO
var _last_ms := 0
var _dragging := false


func _ready() -> void:
	layer = 9
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_root)
	visible = false
	set_process(false)
	get_viewport().size_changed.connect(func() -> void:
		if visible:
			_build())


func open() -> void:
	_t = 0.0
	_scroll = 0.0
	_fling = 0.0
	visible = true
	_build()
	set_process(true)


func close() -> void:
	if not visible:
		return
	if _close != null:
		_close.cancel()
	_down = false
	visible = false
	set_process(false)
	closed.emit()


func is_open() -> bool:
	return visible


## The back button: the board closes.
func go_back() -> bool:
	if not visible:
		return false
	clicked.emit()
	close()
	return true


func _build() -> void:
	for c in _root.get_children():
		_root.remove_child(c)
		c.queue_free()
	_reveal.clear()
	var vp := get_viewport().get_visible_rect().size
	_root.size = vp
	var u := MenuKit.U
	var t := MenuKit.T
	var px := MenuKit.PX
	var mx := vp.x * 0.03
	var my := vp.y * 0.03
	var glass := ColorRect.new()
	glass.size = vp
	glass.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_back = ShaderMaterial.new()
	_back.shader = preload("res://shaders/menu_blur.gdshader")
	_back.set_shader_parameter("lod", PauseScreen._blur_lod(10.0 * u))
	_back.set_shader_parameter("saturate", 1.15)
	_back.set_shader_parameter("rad", Vector4(0.5, 0.4, 1.2, 0.9))
	_back.set_shader_parameter("rad_in", Color8(3, 14, 22, 107))
	_back.set_shader_parameter("rad_out", Color8(2, 10, 16, 199))
	_back.set_shader_parameter("fade", 0.0)
	glass.material = _back
	_root.add_child(glass)
	var w := minf(1020.0 * u, vp.x - mx * 2.0)
	var head_h := 12.0 * u + 38.0 * u + 10.0 * u
	var pad := 20.0 * u
	var inner := w - pad * 2.0
	_content = Control.new()
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l: Dictionary = Progress.bounty
	var y := _head(l, inner, pad, 14.0 * u)
	y += 18.0 * u
	var rule := MenuKit.rule(inner, Color(1.0, 1.0, 1.0, 0.07))
	rule.position = Vector2(pad, y)
	_content.add_child(rule)
	y += 18.0 * u + 6.0 * u
	y = _wall(l, inner, pad, y)
	_content.size = Vector2(w, y + 16.0 * u)
	var h := minf(head_h + _content.size.y, vp.y - my * 2.0)
	_holder = Control.new()
	_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_holder.size = Vector2(w, h)
	_holder.position = (vp - _holder.size) * 0.5
	_holder.pivot_offset = _holder.size * 0.5
	_root.add_child(_holder)
	var sheet := UiBox.new(Vector2(w, h), 22.0 * u, 110.0 * u)
	sheet.p("c_top", Color8(16, 40, 54, 214)).p("c_foot", Color8(6, 20, 30, 240)).p("c_border", HudStyle.STROKE)
	sheet.p("c_shadow", Color(0.0, 0.0, 0.0, 0.5)).p("shadow", Vector2(40.0, 110.0) * u)
	_holder.add_child(sheet)
	var title := MenuKit.words("Wanted Board", "inter", 800, 22.0 * t, HudStyle.INK, -0.025, 1.02)
	MenuKit.line_at(title, 20.0 * u, 12.0 * u, 38.0 * u)
	sheet.add_child(title)
	_close = MenuKit.round("close", 38.0 * u, 16.0 * u, false)
	_close.position = Vector2(w - 14.0 * u - 38.0 * u, 12.0 * u)
	_close.pressed.connect(func() -> void: go_back())
	sheet.add_child(_close)
	var hair := MenuKit.rule(w, Color(1.0, 1.0, 1.0, 0.07))
	hair.position = Vector2(0.0, head_h - hair.size.y)
	sheet.add_child(hair)
	_body = Control.new()
	_body.clip_contents = true
	_body.mouse_filter = Control.MOUSE_FILTER_STOP
	_body.position = Vector2(0.0, head_h)
	_body.size = Vector2(w, h - head_h)
	_body.gui_input.connect(_on_body)
	_body.add_child(_content)
	sheet.add_child(_body)
	_scroll_max = maxf(0.0, _content.size.y - _body.size.y)
	_scroll_to(_scroll)
	_reveal.add(_holder, MenuKit.POP, 0.0, 0.45, 12.0 * px)
	_step(0.0)


## Your rank: the seal, its title and line, the bar to the next, the four
## tallies, and how it works. Returns the y under it.
func _head(l: Dictionary, w: float, x: float, y: float) -> float:
	var u := MenuKit.U
	var t := MenuKit.T
	var infamy := int(l.infamy)
	var rank := Bounty.repute_rank(infamy)
	var r: Array = Bounty.REPUTE[rank]
	var nxt: Array = Bounty.REPUTE[rank + 1] if rank + 1 < Bounty.REPUTE.size() else []
	var bonus := Bounty.bonus(infamy)
	var seal := _Seal.new(64.0 * u, clampi(int(l.best), 0, 5))
	seal.position = Vector2(x, y)
	_content.add_child(seal)
	var tx := x + 64.0 * u + 16.0 * u
	var tw := w - (tx - x)
	var ty := y
	var kick := MenuKit.words("YOUR INFAMY AMONG THE BRETHREN", "inter", 700, 10.0 * t, HudStyle.GOLD, 0.2, 1.2)
	var title := MenuKit.words(str(r[1]), "cinzel", 700, 28.0 * t, HudStyle.INK, 0.04, 1.1)
	var line := UiText.new([[str(r[2]), HudStyle.font("inter", 500), roundi(13.5 * t), HudStyle.INK_2]], tw, 1.35)
	var col_h := kick.size.y + 3.0 * u + title.size.y + 2.0 * u + line.size.y
	ty += maxf(0.0, (64.0 * u - col_h) * 0.5)
	for part: Control in [kick, title, line]:
		part.position = Vector2(tx, ty)
		_content.add_child(part)
		ty += part.size.y + (3.0 if part == kick else 2.0) * u
	y += maxf(64.0 * u, col_h) + 12.0 * u
	var prog := 1.0 if nxt.is_empty() else clampf(float(infamy - int(r[0])) / float(int(nxt[0]) - int(r[0])), 0.0, 1.0)
	var bar := _Bar.new(Vector2(w, 8.0 * u), prog)
	bar.position = Vector2(x, y)
	_content.add_child(bar)
	y += 8.0 * u + 10.0 * u
	var nl := UiText.new([
		[MenuKit.num(infamy), HudStyle.font("inter", 700), roundi(12.5 * t), HudStyle.INK],
		[(" / %s infamy · next: " % MenuKit.num(int(nxt[0]))) if not nxt.is_empty() else " infamy · the highest rank there is", HudStyle.font("inter", 500), roundi(12.5 * t), HudStyle.INK_3],
		[str(nxt[1]) if not nxt.is_empty() else "", HudStyle.font("inter", 700), roundi(12.5 * t), HudStyle.GOLD_HI],
	])
	nl.position = Vector2(x, y)
	_content.add_child(nl)
	y += nl.size.y + 14.0 * u
	var sunk := 0
	for c: Dictionary in Bounty.CAPTAINS:
		if int((l.sunk as Dictionary).get(c.id, 0)) > 0:
			sunk += 1
	var stats := [
		["+%d%%" % roundi((bonus - 1.0) * 100.0), "", "Crown bounty bonus"],
		[str(sunk), "/%d" % Bounty.CAPTAINS.size(), "Captains sunk"],
		[MenuKit.num(int(l.claimed)), "", "Bounty gold"],
		[str(int(l.best)), "/5", "Most wanted"],
	]
	var narrow := w < 520.0 * u
	var per := 2 if narrow else 4
	var gap := 8.0 * u
	var sw := (w - gap * (per - 1)) / per
	var sh := 62.0 * u
	for i in stats.size():
		var s: Array = stats[i]
		var tile := UiBox.new(Vector2(sw, sh), 16.0 * u, 0.0)
		tile.p("c_top", Color(1.0, 1.0, 1.0, 0.05)).p("c_foot", Color(1.0, 1.0, 1.0, 0.05)).p("c_border", Color(1.0, 1.0, 1.0, 0.06))
		tile.position = Vector2(x + (i % per) * (sw + gap), y + (i / per) * (sh + gap))
		var big := UiText.new([
			[str(s[0]), HudStyle.tnum(HudStyle.font("inter", 800)), roundi(19.0 * t), HudStyle.INK],
			[str(s[1]), HudStyle.font("inter", 800), roundi(12.0 * t), HudStyle.INK_3],
		])
		big.position = Vector2(roundf((sw - big.size.x) * 0.5), 11.0 * u)
		tile.add_child(big)
		var cap := MenuKit.words(str(s[2]).to_upper(), "inter", 600, 9.5 * t, HudStyle.INK_3, 0.14, 1.2)
		cap.position = Vector2(roundf((sw - cap.size.x) * 0.5), sh - 10.0 * u - cap.size.y)
		tile.add_child(cap)
		_content.add_child(tile)
	y += ((stats.size() + per - 1) / per) * (sh + gap) - gap + 12.0 * u
	var how := UiText.new([[HOW, HudStyle.font("inter", 500), roundi(12.5 * t), HudStyle.INK_3]], w, 1.5)
	how.position = Vector2(x, y)
	_content.add_child(how)
	return y + how.size.y


## The wall of notices, as many to a row as fit (two at the least). Returns the y under it.
func _wall(l: Dictionary, w: float, x: float, y: float) -> float:
	var u := MenuKit.U
	var narrow := w < 520.0 * u
	var gx := (10.0 if narrow else 16.0) * u
	var gy := (16.0 if narrow else 22.0) * u
	var cols := 2 if narrow else maxi(2, floori((w + gx) / (196.0 * u + gx)))
	var pw := (w - gx * (cols - 1)) / cols
	var bonus := Progress.bounty_bonus()
	var seen: Array = l.seen
	var posters: Array[_Poster] = []
	for c: Dictionary in Bounty.CAPTAINS:
		var st := "sunk" if int((l.sunk as Dictionary).get(c.id, 0)) > 0 else ("large" if seen.has(c.id) else "unknown")
		posters.append(_Poster.new(c, st, l, bonus, pw))
	var row_y := y
	var i := 0
	while i < posters.size():
		var row_h := 0.0
		for j in cols:
			if i + j < posters.size():
				row_h = maxf(row_h, posters[i + j].size.y)
		for j in cols:
			if i + j >= posters.size():
				break
			var p := posters[i + j]
			p.set_height(row_h)
			p.position = Vector2(x + j * (pw + gx), row_y)
			_content.add_child(p)
		row_y += row_h + gy
		i += cols
	return row_y - gy


## Keys go no further while it's up: the screen under it would take them.
func _unhandled_input(event: InputEvent) -> void:
	if visible and event is InputEventKey:
		get_viewport().set_input_as_handled()


func _process(dt: float) -> void:
	_t += dt
	if not _down and absf(_fling) > 1.0:
		_scroll_to(_scroll + _fling * dt)
		_fling *= exp(-4.0 * dt)
	_step(dt)


func _step(_dt: float) -> void:
	_back.set_shader_parameter("fade", clampf(_t / 0.35, 0.0, 1.0))
	_reveal.step(_t)


func _scroll_to(s: float) -> void:
	_scroll = clampf(s, 0.0, _scroll_max)
	if _scroll <= 0.0 or _scroll >= _scroll_max:
		_fling = 0.0
	_content.position.y = -_scroll


## A drag up or down the body scrolls it (a fling carries on), and the wheel.
func _on_body(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION:
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_scroll_to(_scroll - 40.0 * MenuKit.U)
			return
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_scroll_to(_scroll + 40.0 * MenuKit.U)
			return
		if event.button_index != MOUSE_BUTTON_LEFT:
			return
	var touch := event is InputEventScreenTouch
	var click: bool = event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION
	if touch or click:
		if event.pressed:
			_down = true
			_dragging = false
			_from = event.position
			_last = event.position
			_last_ms = Time.get_ticks_msec()
			_fling = 0.0
		else:
			_down = false
		return
	var moved := event is InputEventScreenDrag or (event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION)
	if not moved or not _down:
		return
	if not _dragging and absf(event.position.y - _from.y) > UiButton.SLOP:
		_dragging = true
	if _dragging:
		var dy: float = event.position.y - _last.y
		var now := Time.get_ticks_msec()
		var dts := maxf(0.001, (now - _last_ms) / 1000.0)
		_fling = lerpf(_fling, -dy / dts, 0.5)
		_last_ms = now
		_scroll_to(_scroll - dy)
	_last = event.position


## The rank's seal: a blood-red wax disc with the most wanted you've been in skulls (three over two).
class _Seal:
	extends Control
	var n := 0

	func _init(d: float, p_n: int) -> void:
		n = p_n
		size = Vector2(d, d)
		custom_minimum_size = size
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var r := size.x * 0.5
		var c := size * 0.5
		var u := MenuKit.U
		draw_circle(c + Vector2(0.0, 8.0 * u), r * 1.02, Color(0.55, 0.08, 0.04, 0.22))
		# the wax: dark at the rim, bright toward its upper left
		for i in 6:
			var f := float(i) / 5.0
			draw_circle(c.lerp(size * Vector2(0.38, 0.32), f * 0.8), r * (1.0 - f * 0.62), Color("#5a0f0c").lerp(Color("#d8473a"), f), true, -1.0, true)
		draw_arc(c, r - 1.0 * u, PI * 1.1, PI * 1.9, 24, Color(1.0, 0.78, 0.7, 0.35), 2.0 * u, true)
		var sw := 11.0 * u
		var sh := sw * 26.0 / 24.0
		var g := 2.0 * u
		var tex := WantedHud.skull(sw, Color.WHITE)
		for i in 5:
			var row := 0 if i < 3 else 1
			var in_row := 3 if row == 0 else 2
			var k := i if row == 0 else i - 3
			var rw := in_row * sw + (in_row - 1) * g
			var at := Vector2(c.x - rw * 0.5 + k * (sw + g), c.y - sh - g * 0.5 + row * (sh + g))
			draw_texture_rect(tex, Rect2(at, Vector2(sw, sh)), false, Color("#ffe1b0") if i < n else Color(0.157, 0.024, 0.016, 0.55))


## The bar toward the next rank: blood into gold.
class _Bar:
	extends Control
	var p := 0.0

	func _init(sz: Vector2, p_p: float) -> void:
		size = sz
		p = p_p
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var h := size.y
		draw_rect(Rect2(Vector2.ZERO, size), Color(1.0, 1.0, 1.0, 0.08))
		draw_circle(Vector2(h * 0.5, h * 0.5), h * 0.5, Color(1.0, 1.0, 1.0, 0.0))
		var w := maxf(h, size.x * p) if p > 0.0 else 0.0
		if w <= 0.0:
			return
		var pts := PackedVector2Array([Vector2(0, 0), Vector2(w, 0), Vector2(w, h), Vector2(0, h)])
		var cols := PackedColorArray([Color("#8e1b17"), _at(w / size.x), _at(w / size.x), Color("#8e1b17")])
		draw_rect(Rect2(-2.0, -2.0, w + 4.0, h + 4.0), Color(0.9, 0.38, 0.31, 0.18))
		draw_polygon(pts, cols)

	static func _at(f: float) -> Color:
		return Color("#8e1b17").lerp(Color("#e5604f"), f / 0.6) if f < 0.6 else Color("#e5604f").lerp(Color("#f4c765"), (f - 0.6) / 0.4)


## A captain's notice: parchment with ragged edges, pinned at a tilt.
class _Poster:
	extends Control
	var st := ""
	var _edge := PackedVector2Array()

	func _init(c: Dictionary, p_st: String, l: Dictionary, bonus: float, w: float) -> void:
		st = p_st
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var u := MenuKit.U
		var t := MenuKit.T
		var ink := WantedHud.PARCH_INK
		var ink2 := Color(ink, 0.7)
		var known := st != "unknown"
		var cls: String = ShipClass.named(c.cls).name
		var iw := w - 24.0 * u
		var y := 18.0 * u
		var bust := WantedHud.Bust.new(Vector2(minf(112.0 * u, iw * 0.8), minf(122.0 * u, iw * 0.8 * 122.0 / 112.0)))
		var items: Array = [
			[_line("WANTED", "cinzel", 900, 24.0, ink, iw, 0.08), 0.0],
			[_line("DEAD OR DROWNED", "inter", 700, 8.5, ink2, iw, 0.25), 3.0],
			[bust, 9.0],
			[_line(str(c.name) if known else "Unknown captain", "cinzel", 700, 15.5, Color(ink, 1.0 if known else 0.7), iw, 0.03), 12.0],
			[_line("“%s”" % c.epithet if known else "Not yet sighted", "serif-italic", 600, 12.5, WantedHud.BLOOD if known else ink2, iw), 2.0],
			[_line(("%s · %s" % [cls, c.ship]).to_upper() if known else ("A %s of the Brethren" % cls.to_lower()).to_upper(), "inter", 600, 10.0, Color(ink2, ink2.a * (1.0 if known else 0.7)), iw, 0.08), 5.0],
			[WantedHud.Tier.new(int(c.tier), 11.0 * u, ink, Color(ink, 0.18)), 6.0],
		]
		bust.set_face(c.face, false, not known)
		if not known:
			bust.modulate = Color(0.92, 0.86, 0.76)
		for it: Array in items:
			var n: Control = it[0]
			y += float(it[1]) * u
			n.position = Vector2(roundf((w - n.size.x) * 0.5), y)
			add_child(n)
			y += n.size.y
		y += 8.0 * u
		var rule := ColorRect.new()
		rule.color = Color(ink, 0.3)
		rule.size = Vector2(w * 0.86, 1.0)
		rule.position = Vector2(w * 0.07, y)
		rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(rule)
		y += 6.0 * u
		var rw := UiText.new([
			["REWARD  ", HudStyle.font("inter", 700, roundi(2.0 * t)), roundi(9.0 * t), ink2],
			[MenuKit.num(roundi(int(c.bounty) * bonus)), HudStyle.font("cinzel", 900), roundi(21.0 * t), ink],
			["  GOLD", HudStyle.font("inter", 700, roundi(2.0 * t)), roundi(9.0 * t), ink2],
		])
		rw.position = Vector2(roundf((w - rw.size.x) * 0.5), y)
		add_child(rw)
		y += rw.size.y + 6.0 * u
		var tr := _line(str(c.trait) if known else "Raise your wanted level to draw them out.", "serif-italic", 500, 11.0, ink2, iw)
		tr.position = Vector2(12.0 * u, y)
		add_child(tr)
		y += tr.size.y
		size = Vector2(w, y + 16.0 * u)
		if st == "sunk":
			var times := int((l.sunk as Dictionary).get(c.id, 0))
			var when := ""
			if (l.first as Dictionary).has(c.id):
				var d := Time.get_date_dict_from_unix_time(int(l.first[c.id]))
				when = "%d %s %d" % [d.day, ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][int(d.month) - 1], d.year]
			add_child(_Stamp.new(("%d times · first " % times if times > 1 else "") + when, Vector2(w * 0.5, size.y * 0.25)))
		elif st == "large":
			# (clipped to the notice's corner, as the web's clip-path does)
			var clip := Control.new()
			clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
			clip.clip_contents = true
			clip.size = Vector2(w, 80.0 * u)
			clip.add_child(_Ribbon.new(w))
			add_child(clip)
		var tilt := ((str(c.id).unicode_at(0) * 7 + str(c.id).length() * 13) % 9 - 4) * 0.35
		rotation = deg_to_rad(tilt)
		_shape()

	## Every notice in a row as tall as the tallest.
	func set_height(h: float) -> void:
		size.y = h
		_shape()

	func _shape() -> void:
		pivot_offset = size * 0.5
		# the clip-path's ragged edge, in fractions of the sheet
		var f := [
			[0, 1.5], [6, 0], [18, 1], [33, 0.2], [47, 1.2], [62, 0], [78, 0.8], [92, 0.1], [100, 1.4],
			[99.4, 18], [100, 36], [99.2, 55], [100, 74], [99.5, 90], [100, 98.6],
			[88, 100], [72, 99.2], [55, 100], [40, 99.3], [24, 100], [9, 99.4], [0, 100],
			[0.6, 82], [0, 64], [0.7, 45], [0, 27],
		]
		_edge.clear()
		for p: Array in f:
			_edge.append(Vector2(size.x * float(p[0]) / 100.0, size.y * float(p[1]) / 100.0))
		queue_redraw()

	## A centred line (or lines) of the notice's text, wrapped to its width.
	func _line(text: String, family: String, weight: int, px: float, color: Color, w: float, em := 0.0) -> UiText:
		var t := MenuKit.T
		var f := HudStyle.font(family, weight, roundi(em * px * t))
		var out := UiText.new([[text, f, roundi(px * t), color]], w, 1.2)
		out.align = HORIZONTAL_ALIGNMENT_CENTER
		out.fit(w)
		return out

	func _draw() -> void:
		var u := MenuKit.U
		# its shadow on the board, then the parchment: light at its upper left, browned toward the foot
		var sh := PackedVector2Array()
		for p in _edge:
			sh.append(p + Vector2(0.0, 12.0 * u))
		draw_colored_polygon(sh, Color(0.0, 0.0, 0.0, 0.3))
		var cols := PackedColorArray()
		for p in _edge:
			var f := clampf((p.y / size.y) * 0.8 + (p.x / size.x) * 0.2, 0.0, 1.0)
			cols.append(WantedHud.PARCH.lerp(Color("#dcc596"), f))
		draw_polygon(_edge, cols)
		# a couple of foxing stains
		draw_circle(size * Vector2(0.7, 0.3), size.x * 0.025, Color(0.55, 0.37, 0.16, 0.12))
		draw_circle(size * Vector2(0.25, 0.75), size.x * 0.035, Color(0.55, 0.37, 0.16, 0.1))
		draw_polyline(_edge + PackedVector2Array([_edge[0]]), Color(0.43, 0.27, 0.08, 0.35), 1.5 * u, true)
		# the nail it hangs from
		var n := Vector2(size.x * 0.5, 10.0 * u)
		draw_circle(n + Vector2(0.0, 1.0), 4.0 * u, Color(0.0, 0.0, 0.0, 0.4))
		draw_circle(n, 4.0 * u, Color("#5a544c"))
		draw_circle(n - Vector2(1.0, 1.0) * u, 2.6 * u, Color("#c9c3b8"))


## The SUNK stamp across a claimed notice.
class _Stamp:
	extends Control
	var _line := ""

	func _init(line: String, centre: Vector2) -> void:
		_line = line
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var u := MenuKit.U
		var t := MenuKit.T
		var f := HudStyle.font("cinzel", 900, roundi(4.0 * t))
		var w := maxf(f.get_string_size("SUNK", HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(30.0 * t)).x, HudStyle.font("inter", 800).get_string_size(line.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(8.5 * t)).x)
		size = Vector2(w + 28.0 * u, (30.0 + (14.0 if line != "" else 0.0)) * t + 12.0 * u)
		position = centre - Vector2(size.x * 0.5, 0.0)
		pivot_offset = size * 0.5
		rotation = deg_to_rad(-14.0)

	func _draw() -> void:
		var u := MenuKit.U
		var t := MenuKit.T
		var blood := Color(WantedHud.BLOOD, 0.92)
		var r := Rect2(Vector2.ZERO, size)
		draw_rect(r.grow(2.0 * u), Color(0.965, 0.894, 0.769, 0.5))
		draw_rect(r, Color(0.965, 0.894, 0.769, 0.72))
		draw_rect(r, blood, false, 1.2 * u)
		draw_rect(r.grow(-2.6 * u), blood, false, 1.2 * u)
		var f := HudStyle.font("cinzel", 900, roundi(4.0 * t))
		var px := roundi(30.0 * t)
		var w := f.get_string_size("SUNK", HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
		draw_string(f, Vector2((size.x - w) * 0.5, 5.0 * u + px * 0.86), "SUNK", HORIZONTAL_ALIGNMENT_LEFT, -1, px, blood)
		if _line != "":
			var g := HudStyle.font("inter", 800, roundi(1.0 * t))
			var gp := roundi(8.5 * t)
			var s := _line.to_upper()
			var gw := g.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, gp).x
			draw_string(g, Vector2((size.x - gw) * 0.5, size.y - 6.0 * u), s, HORIZONTAL_ALIGNMENT_LEFT, -1, gp, blood)


## The "At large" ribbon across a notice's upper right corner.
class _Ribbon:
	extends Control

	func _init(w: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var u := MenuKit.U
		size = Vector2(120.0 * u, 8.5 * MenuKit.T + 8.0 * u)
		position = Vector2(w + 30.0 * u - size.x, 14.0 * u)
		pivot_offset = size * 0.5
		rotation = deg_to_rad(38.0)

	func _draw() -> void:
		var t := MenuKit.T
		draw_rect(Rect2(Vector2(0.0, 2.0), size), Color(0.0, 0.0, 0.0, 0.3))
		draw_rect(Rect2(Vector2.ZERO, size), WantedHud.BLOOD)
		var f := HudStyle.font("inter", 800, roundi(2.0 * t))
		var px := roundi(8.5 * t)
		var w := f.get_string_size("AT LARGE", HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
		draw_string(f, Vector2((size.x - w) * 0.5, size.y * 0.5 + px * 0.36), "AT LARGE", HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color("#fff1e0"))
