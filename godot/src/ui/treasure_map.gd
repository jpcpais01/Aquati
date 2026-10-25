class_name TreasureMapScreen
extends Control
## The treasure map unrolled over the HUD (the web's TreasureMapUI.show,
## src/ui/treasureMap.ts): the pieces you hold laid together a little askew
## on the sheet (a new one swoops into place the first time you look), the
## ones you lack a dashed ghost; beside it the ledger: the pieces, one line of
## the riddle for each, and the way to the X once the map is whole, when the
## X glows and pings like a heartbeat. The world sails on beneath.

signal closed

const S := TreasureMapArt.S
const PX := HudStyle.PX
const T := HudStyle.T
const ROMAN := ["I", "II", "III"]
const PARCH := Color("#f3e4bf")

var is_open := false
var _art: TreasureMapArt
var _art_key := ""
var _pieces: Array[Dictionary] = []
var _pieces_key := ""
var _m := {}
var _fresh := 0
var _t := 1.0
var _clock := 0.0
var _dim: ColorRect
var _card: Control
var _sheet: _Sheet
var _side: UiBox
var _close: UiButton


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	set_process(false)
	_dim = ColorRect.new()
	_dim.color = Color(0.008, 0.035, 0.055, 0.62)
	_dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_dim)
	_card = Control.new()
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_card)
	_sheet = _Sheet.new()
	_sheet.screen = self
	_card.add_child(_sheet)


func _gui_input(event: InputEvent) -> void:
	# a tap on the dimmed sea round the card puts it away
	if event is InputEventMouseButton and event.pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		if not Rect2(_card.position, _card.size).has_point((event as InputEventMouseButton).position):
			closed.emit()
		accept_event()
	elif event is InputEventScreenTouch and event.pressed:
		if not Rect2(_card.position, _card.size).has_point((event as InputEventScreenTouch).position):
			closed.emit()
		accept_event()


## Unrolls the map: `m` the map in hand (TreasureMaps.state), `isl` the isle
## its X is on ({} before the first piece), `height` the ground at (x, z),
## `from` where the captain stands (x, z), for how far it is.
func open(m: Dictionary, isl: Dictionary, height: Callable, from: Vector2) -> void:
	_m = m.duplicate()
	is_open = true
	visible = true
	var n := TreasureMaps.pieces_in(int(m.pieces))
	var whole := n == 3
	var ok := n > 0 and not isl.is_empty()
	if ok:
		var key := "%d|%s|%s|%s|%s" % [int(m.seed), m.x, m.z, isl.x, isl.z]
		if key != _art_key or _art == null:
			if _art != null:
				_art.queue_free()
			_art = TreasureMapArt.new(m, isl, height)
			add_child(_art)
			_art_key = key
	_layout_pieces(int(m.seed) if ok else 7)
	_fresh = (int(m.pieces) & ~int(m.seen)) if ok else 0
	_t = 0.0 if _fresh else 1.0
	_sheet.ok = ok
	_build_side(m, isl, whole, n, ok, from)
	_place()
	_clock = 0.0
	_card.modulate.a = 0.0
	set_process(true)
	_step(0.0)


func close() -> void:
	if not is_open:
		return
	is_open = false
	visible = false
	if _close != null:
		_close.cancel()
	set_process(false)


func _process(dt: float) -> void:
	if not is_open:
		set_process(false)
		return
	_step(dt)


func _step(dt: float) -> void:
	_clock += dt
	if _t < 1.0:
		_t = minf(1.0, _t + dt / 0.82)
	# unrolls: up from a little below, a touch turned, growing to full size
	var k := clampf(_clock / 0.55, 0.0, 1.0)
	var e := HudStyle.spring(k)
	_card.modulate.a = minf(1.0, k * 2.5)
	_card.position.y = _card.get_meta("y", 0.0) + 18.0 * (1.0 - e)
	_card.rotation = deg_to_rad(-1.2) * (1.0 - e)
	_card.scale = Vector2.ONE * lerpf(0.94, 1.0, e)
	_sheet.queue_redraw()


## Sheet and ledger side by side, as large as the screen allows.
func _place() -> void:
	var vp := get_viewport_rect().size
	var side_w := _side.size.x
	var gap := 12.0 * PX
	var sw := minf(minf(vp.y - 20.0 * PX, vp.x - side_w - gap - 24.0 * PX), 600.0 * PX)
	_sheet.size = Vector2(sw, sw)
	_sheet.position = Vector2.ZERO
	_side.position = Vector2(sw + gap, (sw - _side.size.y) * 0.5)
	_card.size = Vector2(sw + gap + side_w, sw)
	_card.position = Vector2((vp.x - _card.size.x) * 0.5, (vp.y - sw) * 0.5)
	_card.set_meta("y", _card.position.y)
	_card.pivot_offset = _card.size * 0.5


# ------------------------------------------------------------------ the ledger

func _build_side(m: Dictionary, isl: Dictionary, whole: bool, n: int, ok: bool, from: Vector2) -> void:
	if _side != null:
		_side.queue_free()
	var w := 238.0 * PX
	var pad := 13.0 * PX
	var inner := w - pad * 2.0
	_side = UiBox.new(Vector2(w, 100.0), 16.0 * PX, 60.0 * PX)
	_side.p("c_top", Color(16.0 / 255.0, 34.0 / 255.0, 46.0 / 255.0, 0.94)).p("c_foot", Color(7.0 / 255.0, 19.0 / 255.0, 28.0 / 255.0, 0.92))
	_side.p("c_border", Color(0.957, 0.78, 0.396, 0.24)).p("c_shadow", Color(0.0, 6.0 / 255.0, 12.0 / 255.0, 0.45)).p("shadow", Vector2(24.0, 60.0) * PX).p("hi", 0.08)
	_side.mouse_filter = Control.MOUSE_FILTER_STOP
	_card.add_child(_side)
	var marks := _Marks.new()
	marks.size = Vector2(w, 10.0)
	_side.add_child(marks)
	var y := pad
	var name_ := str(isl.get("name", "")) if not isl.is_empty() else str(m.isle)
	var kick := MenuKit.words("X MARKS THE SPOT" if whole else "TREASURE MAP", "inter", 700, 9.0 * T, HudStyle.GOLD, 0.22)
	kick.position = Vector2(pad, y)
	_side.add_child(kick)
	y += kick.size.y + 3.0 * PX
	var title := UiText.new([["No map yet" if n == 0 else name_ if whole else "A torn map", HudStyle.font("cinzel", 700, 1), roundi(17.0 * PX), HudStyle.GOLD_HI if whole else HudStyle.INK]], inner - 40.0 * PX, 1.15)
	title.position = Vector2(pad, y)
	_side.add_child(title)
	_close = MenuKit.round("close", 38.0 * PX, 16.0 * PX, false)
	_close.position = Vector2(w - pad - 38.0 * PX + 6.0 * PX, pad - 4.0 * PX)
	_close.pressed.connect(func() -> void: closed.emit())
	_side.add_child(_close)
	y += title.size.y + 9.0 * PX
	# the pieces: three torn scraps, filled for those in hand
	var sh := 27.0 * PX * 0.82
	marks.scraps = Vector3(pad, y, sh)
	marks.have = int(m.pieces)
	var count := MenuKit.words("%d of 3" % n, "inter", 700, 11.0 * T, HudStyle.GOLD if whole else HudStyle.INK_2)
	count.position = Vector2(pad + 3.0 * (sh * 0.63 + 5.0 * PX) + 6.0 * PX, y + (sh - count.size.y) * 0.5)
	_side.add_child(count)
	y += sh + 9.0 * PX
	marks.rule_y = y
	y += 8.0 * PX
	# the riddle: a line for each piece read
	var clues: PackedStringArray = _art.clues if ok and _art != null else PackedStringArray()
	var disc := 20.0 * PX * 0.9
	marks.discs.clear()
	for i in 3:
		var read := i < n and i < clues.size()
		var line := clues[i] if read else "…" if i < n else "Torn away with a missing piece"
		var t := UiText.new([[line, HudStyle.font("serif-italic", 500 if not read else 600), roundi(11.5 * PX), PARCH if read else HudStyle.INK_4]], inner - disc - 9.0 * PX, 1.3)
		t.position = Vector2(pad + disc + 9.0 * PX, y + 1.0 * PX)
		_side.add_child(t)
		marks.discs.append(Vector4(pad + disc * 0.5, y + disc * 0.5, disc * 0.5, 1.0 if read else 0.0))
		var r := MenuKit.words(ROMAN[i], "cinzel", 700, 8.5 * T, Color("#ffe2cf") if read else HudStyle.INK_4)
		r.position = Vector2(pad + (disc - r.size.x) * 0.5, y + (disc - r.size.y) * 0.5)
		_side.add_child(r)
		y += maxf(disc, t.size.y) + 6.0 * PX
	y += 4.0 * PX
	# the way there
	var wb := ""
	var ws := ""
	var ang := 0.0
	if whole:
		var dx := float(m.x) - from.x
		var dz := float(m.z) - from.y
		var d := Vector2(dx, dz).length()
		ang = atan2(dx, -dz)
		wb = "You're standing almost on it" if d < 28.0 else "%s %s of you" % [MapScene.distance(d), TreasureMapArt.octant(dx, dz)]
		ws = "Go ashore there and dig where the sticks cross."
	else:
		wb = ("%d more piece%s to find" % [3 - n, "" if n == 2 else "s"]) if n > 0 else "Find a torn piece first"
		ws = "Torn pieces turn up in sea chests and in cutthroat camps."
	var nd := 30.0 * PX * 0.9
	var wpad := 9.0 * PX
	var tw := inner - wpad * 2.0 - nd - 10.0 * PX
	var b := UiText.new([[wb, HudStyle.font("inter", 700), roundi(12.5 * T), HudStyle.INK]], tw, 1.2)
	var s := UiText.new([[ws, HudStyle.font("inter", 500), roundi(10.5 * T), HudStyle.INK_3]], tw, 1.3)
	var wh := maxf(nd, b.size.y + 2.0 + s.size.y) + 7.0 * PX * 2.0
	marks.where = Rect2(pad, y, inner, wh)
	marks.whole = whole
	marks.needle = Vector4(pad + wpad + nd * 0.5, y + wh * 0.5, nd * 0.5, ang)
	var ty := y + (wh - (b.size.y + 2.0 + s.size.y)) * 0.5
	b.position = Vector2(pad + wpad + nd + 10.0 * PX, ty)
	s.position = Vector2(b.position.x, ty + b.size.y + 2.0)
	_side.add_child(b)
	_side.add_child(s)
	y += wh + pad
	_side.resize(Vector2(w, y))
	marks.size = Vector2(w, y)
	_side.move_child(marks, 0)


## The ledger's drawn bits: the scraps, the rule, the riddle's discs, the needle's box.
class _Marks:
	extends Control
	var scraps := Vector3.ZERO
	var have := 0
	var rule_y := 0.0
	var discs: Array[Vector4] = []
	var where := Rect2()
	var whole := false
	var needle := Vector4.ZERO

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var h := scraps.z
		var w := h * 0.63
		for i in 3:
			var at := Vector2(scraps.x + i * (w + 5.0 * PX) + w * 0.5, scraps.y + h * 0.5)
			var rot := deg_to_rad(-4.0 if i == 0 else 5.0 if i == 2 else 0.0)
			TreasureMapScreen.scrap(self, at, h, rot, bool(have & (1 << i)))
		draw_line(Vector2(scraps.x, rule_y), Vector2(size.x - scraps.x, rule_y), Color(0.957, 0.78, 0.396, 0.16), 1.0)
		for d in discs:
			var c := Vector2(d.x, d.y)
			if d.w > 0.5:
				draw_circle(c + Vector2(0, 1.5), d.z, Color(0, 0, 0, 0.3), true, -1.0, true)
				draw_circle(c, d.z, Color("#8a1d14"), true, -1.0, true)
				draw_circle(c - Vector2(d.z, d.z) * 0.22, d.z * 0.7, Color("#c8473a"), true, -1.0, true)
			else:
				MapMarks.pull_ring(self, c, d.z, 2.0 * PX, 0.0, Color(1.0, 232.0 / 255.0, 186.0 / 255.0, 0.25), 1.0)
		# the needle's box
		var box := StyleBoxFlat.new()
		box.set_corner_radius_all(int(14.0 * PX * 0.8))
		box.bg_color = Color(0.957, 0.78, 0.396, 0.09) if whole else Color(1, 1, 1, 0.04)
		box.border_color = Color(0.957, 0.78, 0.396, 0.3) if whole else HudStyle.STROKE
		box.set_border_width_all(1)
		box.anti_aliasing = true
		draw_style_box(box, where)
		var nc := Vector2(needle.x, needle.y)
		var nr := needle.z
		draw_circle(nc, nr, Color("#0d1e28"), true, -1.0, true)
		draw_circle(nc - Vector2(nr, nr) * 0.15, nr * 0.75, Color("#1c3340"), true, -1.0, true)
		draw_arc(nc, nr, 0.0, TAU, 32, Color(0.957, 0.78, 0.396, 0.4), 1.0, true)
		var a := needle.w
		var k := nr * 0.78 / 12.0
		var tr := func(p: Vector2) -> Vector2: return nc + ((p - Vector2(12, 12)) * k).rotated(a)
		var al := 1.0 if whole else 0.45
		draw_colored_polygon(PackedVector2Array([tr.call(Vector2(12, 2.5)), tr.call(Vector2(15, 12)), tr.call(Vector2(9, 12))]), Color(Color("#e5604f"), al))
		draw_colored_polygon(PackedVector2Array([tr.call(Vector2(9, 12)), tr.call(Vector2(15, 12)), tr.call(Vector2(12, 21.5))]), Color(Color("#e9dcc0"), al))
		draw_circle(nc, 1.6 * k, Color(HudStyle.GOLD, al), true, -1.0, true)


## A torn scrap of parchment (the web's SCRAP), `h` tall, centred on `at`:
## filled for a piece in hand, a dashed ghost for one still out there.
static func scrap(ci: CanvasItem, at: Vector2, h: float, rot: float, filled: bool, fill := Color("#e8d09a"), edge := Color("#7d5628")) -> void:
	var pts := PackedVector2Array()
	for p: Vector2 in [Vector2(1.2, 0.8), Vector2(9, 0.4), Vector2(8.1, 2.6), Vector2(9.3, 4.4), Vector2(8.2, 6.5), Vector2(9.4, 8.6), Vector2(8.3, 10.9), Vector2(9.2, 13), Vector2(8.4, 15.5), Vector2(0.7, 15.2), Vector2(1.6, 12.8), Vector2(0.6, 10.2), Vector2(1.5, 7.8), Vector2(0.5, 5.3), Vector2(1.4, 3.2)]:
		pts.append(at + ((p - Vector2(5, 8)) * (h / 16.0)).rotated(rot))
	var loop := pts.duplicate()
	loop.append(pts[0])
	if filled:
		var sh := pts.duplicate()
		for i in sh.size():
			sh[i] += Vector2(0, h * 0.06)
		ci.draw_colored_polygon(sh, Color(0, 0, 0, 0.3))
		ci.draw_colored_polygon(pts, fill)
		ci.draw_polyline(loop, edge, maxf(1.0, h * 0.045), true)
	else:
		ci.draw_colored_polygon(pts, Color(1.0, 232.0 / 255.0, 186.0 / 255.0, 0.05))
		for i in loop.size() - 1:
			if i % 2 == 0:
				ci.draw_line(loop[i], loop[i + 1], Color(1.0, 232.0 / 255.0, 186.0 / 255.0, 0.38), maxf(1.0, h * 0.045), true)


# ------------------------------------------------------------------ the pieces

## Where the tears fall and how each piece lies (fixed by the map's seed).
func _layout_pieces(seed_value: int) -> void:
	var key := str(seed_value)
	if key == _pieces_key:
		return
	_pieces_key = key
	var rnd := Mulberry32.new(seed_value + 3)
	var cuts := [0.0, S / 3.0 + (rnd.next() - 0.5) * 40.0, 2.0 * S / 3.0 + (rnd.next() - 0.5) * 40.0, S]
	var tear := func(x: float, sd: int) -> PackedVector2Array:
		var r := Mulberry32.new(sd)
		var pts := PackedVector2Array()
		var ph := r.next() * 9.0
		var y := 8.0
		while y <= S - 8.0:
			var a := sin(y * 0.045 + ph) * 6.0
			var b := (r.next() - 0.5) * 7.0
			var c := (r.next() - 0.5) * 9.0 if r.next() < 0.12 else 0.0
			pts.append(Vector2(x + a + b + c, y))
			y += 4.5
		pts[pts.size() - 1].y = S - 8.0
		return pts
	var deckle := func(a: Vector2, b: Vector2, sd: int) -> PackedVector2Array:
		var r := Mulberry32.new(sd)
		var pts := PackedVector2Array()
		var len := a.distance_to(b)
		var nrm := Vector2(-(b.y - a.y), b.x - a.x) / len
		var n := maxi(2, roundi(len / 9.0))
		for k in range(1, n):
			var t := float(k) / n
			pts.append(a.lerp(b, t) + nrm * (r.next() - 0.5) * 2.6)
		return pts
	var edges: Array = [null, tear.call(cuts[1], seed_value + 11), tear.call(cuts[2], seed_value + 29), null]
	var E := 8.0
	_pieces.clear()
	for i in 3:
		var L: PackedVector2Array
		if edges[i] == null:
			L = PackedVector2Array([Vector2(E, E)])
			L.append_array(deckle.call(Vector2(E, E), Vector2(E, S - E), seed_value + 41))
			L.append(Vector2(E, S - E))
		else:
			L = edges[i]
		var R: PackedVector2Array
		if edges[i + 1] == null:
			R = PackedVector2Array([Vector2(S - E, E)])
			R.append_array(deckle.call(Vector2(S - E, E), Vector2(S - E, S - E), seed_value + 43))
			R.append(Vector2(S - E, S - E))
		else:
			R = edges[i + 1]
		var path := L.duplicate()
		path.append_array(deckle.call(L[L.size() - 1], R[R.size() - 1], seed_value + 50 + i))
		var back := R.duplicate()
		back.reverse()
		path.append_array(back)
		path.append_array(deckle.call(R[0], L[0], seed_value + 60 + i))
		var tears: Array[PackedVector2Array] = []
		for e: Variant in [edges[i], edges[i + 1]]:
			if e != null:
				tears.append(e)
		# each piece lies a touch askew
		var a := deg_to_rad((rnd.next() - 0.5) * 2.2)
		var off := Vector2((rnd.next() - 0.5) * 5.0 + (i - 1) * 1.5, (rnd.next() - 0.5) * 6.0)
		var m := Transform2D(0.0, Vector2(S / 2.0, S / 2.0)) * Transform2D(a, Vector2.ZERO) * Transform2D(0.0, -Vector2(S / 2.0, S / 2.0) + off)
		var uv := PackedVector2Array()
		uv.resize(path.size())
		for k in path.size():
			uv[k] = path[k] / S
		_pieces.append({"path": path, "uv": uv, "tears": tears, "m": m, "cx": (float(cuts[i]) + float(cuts[i + 1])) / 2.0})


## The sheet: the pieces laid on the table, the X glowing on the one that shows it.
class _Sheet:
	extends Control
	var screen: TreasureMapScreen
	var ok := false

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var sc := screen
		var k := size.x / S
		var m := sc._m
		var have := int(m.get("pieces", 0)) if ok else 0
		var order := [0, 1, 2]
		order.sort_custom(func(a: int, b: int) -> bool:
			var ha := 1 if have & (1 << a) else 0
			var hb := 1 if have & (1 << b) else 0
			if ha != hb:
				return ha < hb
			return (1 if sc._fresh & (1 << a) else 0) < (1 if sc._fresh & (1 << b) else 0))
		var n := 0
		var tex: Texture2D = sc._art.sheet() if ok and sc._art != null else null
		for i: int in order:
			var p: Dictionary = sc._pieces[i]
			var pm: Transform2D = p.m
			var base := Transform2D(0.0, Vector2(k, k), 0.0, Vector2.ZERO)
			if not (have & (1 << i)):
				draw_set_transform_matrix(base * pm)
				_ghost(p)
				continue
			var alpha := 1.0
			var lift := Transform2D.IDENTITY
			if sc._fresh & (1 << i):
				# a stagger, then a swoop in from above with a little settle
				var u := clampf(sc._t * 1.25 - n * 0.2, 0.0, 1.0)
				n += 1
				var e := 1.0 if u >= 1.0 else 1.0 - pow(2.0, -9.0 * u) * cos(u * 7.5)
				var off := 1.0 - e
				var cx: float = p.cx
				lift = Transform2D(0.0, Vector2(cx + off * (-60.0 if i == 0 else 60.0 if i == 2 else 0.0), S / 2.0 - off * 150.0))
				lift = lift * Transform2D(off * (-0.35 if i == 1 else 0.3), Vector2(1.0 + off * 0.18, 1.0 + off * 0.18), 0.0, Vector2.ZERO)
				lift = lift * Transform2D(0.0, Vector2(-cx, -S / 2.0))
				alpha = minf(1.0, u * 3.0)
			draw_set_transform_matrix(base * lift * pm)
			var path: PackedVector2Array = p.path
			# its shadow on the table, soft
			for s in 3:
				var grown := Geometry2D.offset_polygon(path, 4.0 + s * 6.0, Geometry2D.JOIN_ROUND)
				if grown.is_empty():
					continue
				var sh: PackedVector2Array = grown[0]
				for q in sh.size():
					sh[q] += Vector2(0, 9.0)
				draw_colored_polygon(sh, Color(0, 0, 0, 0.12 * alpha))
			if tex != null:
				draw_polygon(path, PackedColorArray([Color(1, 1, 1, alpha)]), p.uv, tex)
			else:
				draw_colored_polygon(path, Color(Color("#d8bf88"), alpha))
			# a scorched rim round the outside, a darker stain along each tear
			var loop := path.duplicate()
			loop.append(path[0])
			draw_polyline(loop, Color(86.0 / 255.0, 48.0 / 255.0, 16.0 / 255.0, 0.42 * alpha), 2.5, true)
			for tr: PackedVector2Array in p.tears:
				draw_polyline(tr, Color(110.0 / 255.0, 70.0 / 255.0, 28.0 / 255.0, 0.2 * alpha), 3.5, true)
			# the torn fibres: a pale, ragged fringe
			for tr: PackedVector2Array in p.tears:
				draw_polyline(tr, Color(252.0 / 255.0, 243.0 / 255.0, 220.0 / 255.0, 0.92 * alpha), 1.4, true)
		draw_set_transform_matrix(Transform2D.IDENTITY)
		# the X's glow, over the piece that shows it once its piece has settled
		if ok and sc._t >= 1.0 and sc._art != null:
			var xa: Vector2 = sc._art.x_at
			for i in 3:
				var p: Dictionary = sc._pieces[i]
				if have & (1 << i) and Geometry2D.is_point_in_polygon(xa, p.path):
					var at: Vector2 = (p.m as Transform2D) * xa * k
					var r := size.x * 0.055
					var ph := fmod(sc._clock, 1.8) / 1.8
					var g := 1.0 + 0.18 * sin(ph * PI)
					draw_texture_rect(TreasureMapArt.spot(), Rect2(at - Vector2(r, r) * g * 1.4, Vector2(r, r) * g * 2.8), false, Color(1.0, 0.47, 0.27, 0.45 - 0.15 * sin(ph * PI)))
					var e := 1.0 - pow(1.0 - ph, 3.0)
					draw_arc(at, r * lerpf(0.45, 1.7, e), 0.0, TAU, 48, Color(170.0 / 255.0, 34.0 / 255.0, 22.0 / 255.0, 0.7 * (1.0 - ph)), 2.0, true)
					break

	## A piece you haven't got: its outline, a wax "?" and MISSING.
	func _ghost(p: Dictionary) -> void:
		var path: PackedVector2Array = p.path
		draw_colored_polygon(path, Color(1.0, 232.0 / 255.0, 186.0 / 255.0, 0.045))
		var loop := path.duplicate()
		loop.append(path[0])
		var dashed := MapMarks.dashes(loop, 6.0, 6.0, 0.0, 0.0, Rect2(-S, -S, S * 3.0, S * 3.0))
		draw_multiline(dashed, Color(1.0, 232.0 / 255.0, 186.0 / 255.0, 0.4), 1.5, true)
		# faint hatching, clipped to the piece
		var hatch := PackedVector2Array()
		var x := -S
		while x < S * 2.0:
			var seg := Geometry2D.intersect_polyline_with_polygon(PackedVector2Array([Vector2(x, 0), Vector2(x + S * 0.6, S)]), path)
			for sgm in seg:
				if sgm.size() >= 2:
					hatch.append(sgm[0])
					hatch.append(sgm[sgm.size() - 1])
			x += 13.0
		if not hatch.is_empty():
			draw_multiline(hatch, Color(1.0, 232.0 / 255.0, 186.0 / 255.0, 0.06), 1.0, true)
		var c := Vector2(float(p.cx), S / 2.0)
		var ring := PackedVector2Array()
		for i in 49:
			ring.append(c + Vector2(0, -8) + Vector2(cos(i * TAU / 48.0), sin(i * TAU / 48.0)) * 22.0)
		draw_multiline(MapMarks.dashes(ring, 3.0, 4.0, 0.0, 0.0, Rect2(-S, -S, S * 3.0, S * 3.0)), Color(244.0 / 255.0, 199.0 / 255.0, 101.0 / 255.0, 0.55), 1.4, true)
		var f := HudStyle.font("cinzel", 700)
		var qw := f.get_string_size("?", HORIZONTAL_ALIGNMENT_LEFT, -1, 24).x
		draw_string(f, c + Vector2(-qw / 2.0, -7.0 + MapMarks.middle(f, 24)), "?", HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color(244.0 / 255.0, 199.0 / 255.0, 101.0 / 255.0, 0.75))
		var fi := HudStyle.font("inter", 700, 2)
		var mw := fi.get_string_size("MISSING", HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
		draw_string(fi, c + Vector2(-mw / 2.0, 32.0 + MapMarks.middle(fi, 10)), "MISSING", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1.0, 232.0 / 255.0, 186.0 / 255.0, 0.6))
