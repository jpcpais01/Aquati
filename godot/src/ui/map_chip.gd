class_name MapChip
extends UiButton
## The treasure map's chip in the HUD (the web's .map-chip): hidden until the
## first piece; a rolled chart with three torn slots that fill in as pieces
## come in; once whole a little compass whose needle points to the X across
## the screen, a wax seal on its rim and how far it is; at the X a red seal
## with a spade on it, glowing. A tap (or T) opens the map. When the chest is
## up it chars and curls away.

const PARCH_INK := Color("#e9cf95")

var touch := false
## Shown (a piece in hand), whole, standing at the X.
var on := false
var whole := false
var near := false
var _shown := 0
var _flying := 0
var _key := ""
var _nav := ""
var _kick := "Treasure map"
var _line := ""
var _ang := 0.0
var _u := HudStyle.K
var _face: _Face
var _anim := ""
var _anim_t := 0.0
var _pop := -1
var _pop_t := 1.0
var _clock := 0.0
var _host: Control


func _init() -> void:
	super(Vector2(124.0, 44.0) * HudStyle.K, 22.0 * HudStyle.K, 30.0 * HudStyle.K)
	squeeze = 0.95
	_face = _Face.new()
	_face.chip = self
	add_child(_face)
	visible = false


## The layer the flying pieces cross (the HUD's root).
func set_host(h: Control) -> void:
	_host = h


## Sized for a thumb (touch) or a mouse.
func set_touch(t: bool) -> void:
	touch = t
	_u = HudStyle.KT * 1.08 if t else HudStyle.K
	_key = ""


## The map in hand (TreasureMaps.state); once whole, `from` where the ship
## (or the captain ashore) is, `x` the X in the world and the camera to
## point it across the screen.
func show_map(m: Dictionary, from: Vector3, x: Variant, cam: Camera3D) -> void:
	var pieces := int(m.get("pieces", 0))
	var n := TreasureMaps.pieces_in(pieces)
	var shown := pieces & ~_flying
	var key := "%d|%d" % [shown, n]
	if key != _key:
		var was := _key
		_key = key
		var before := int(was.split("|")[0]) if was != "" else 0
		# the map's spent (the chest is up): the chip burns away before it goes
		if was != "" and n == 0 and was.ends_with("|3"):
			_play("spent")
			return
		on = n > 0
		whole = n == 3 and _flying == 0
		_shown = shown
		if not whole:
			near = false
			_line = "%d/3" % TreasureMaps.pieces_in(shown)
			_kick = "One piece to go" if TreasureMaps.pieces_in(shown) == 2 else "Treasure map"
		_nav = ""
		if on and not visible:
			visible = true
			_play("in")
		elif not on:
			visible = false
		if was != "" and TreasureMaps.pieces_in(shown) > TreasureMaps.pieces_in(before):
			_play("bump")
			for i in 3:
				if shown & (1 << i) and not before & (1 << i):
					_pop = i
					_pop_t = 0.0
					break
		_style()
	if n < 3 or _flying != 0 or x == null or cam == null:
		return
	var X: Vector3 = x
	# the way to the X, as the screen sees it
	var fwd := -cam.global_transform.basis.z
	var ang := 0.0
	if absf(fwd.y) < 0.8:
		# from eye level: a compass bearing against the way you face (up = dead ahead)
		var f := Vector2(fwd.x, fwd.z).normalized()
		var v := Vector2(X.x - from.x, X.z - from.z)
		ang = atan2(v.x * -f.y + v.y * f.x, v.x * f.x + v.y * f.y)
	else:
		var a := cam.unproject_position(Vector3(from.x, X.y, from.z))
		var b := cam.unproject_position(X)
		var d := b - a
		if cam.is_position_behind(X):
			d = -d
		ang = atan2(d.x, -d.y)
	var dist := Vector2(X.x - from.x, X.z - from.z).length()
	var close := dist < 28.0
	var nk := "%d|%s" % [roundi(ang * 18.0), "n" if close else MapScene.distance(dist)]
	if nk == _nav:
		return
	_nav = nk
	_ang = ang
	if close != near:
		near = close
		_style()
	_line = "Dig here" if close else MapScene.distance(dist)
	_kick = "X marks the spot" if close else "To the X"
	_relay()


## A torn piece found: a scrap of parchment tumbles from where it turned up
## (`at` on the screen, or null for the middle) into its slot, and the slot
## fills as it lands.
func fly_piece(i: int, at: Variant) -> void:
	_flying |= 1 << i
	_key = ""
	if not visible:
		visible = true
		on = true
		_play("in")
	_relay()
	if _host == null:
		_land(i, null)
		return
	var vp := get_viewport_rect().size
	var s: Vector2 = at if at != null else Vector2(vp.x * 0.5, vp.y * 0.42)
	var t := get_global_transform() * _face.slot_at(i)
	var fly := _Fly.new()
	_host.add_child(fly)
	fly.from = s
	fly.to = t
	fly.mid = Vector2((s.x + t.x) / 2.0 + (-1.0 if t.x < s.x else 1.0) * 40.0 * HudStyle.PX, minf(s.y, t.y) - 80.0 * HudStyle.PX)
	fly.spin = (-1.0 if randf() < 0.5 else 1.0) * deg_to_rad(300.0 + randf() * 160.0)
	fly.done.connect(_land.bind(i, fly))


func _land(i: int, fly: Node) -> void:
	if fly != null:
		fly.queue_free()
	_flying &= ~(1 << i)
	if _anim != "spent":
		_key = ""


func _play(what: String) -> void:
	_anim = what
	_anim_t = 0.0
	set_process(true)


func _process(dt: float) -> void:
	super(dt)
	_clock += dt
	_anim_t += dt
	if _pop >= 0:
		_pop_t += dt
		if _pop_t > 0.6:
			_pop = -1
	var s := 1.0
	var a := 1.0
	var r := 0.0
	var y := 0.0
	match _anim:
		"in":
			var k := clampf(_anim_t / 0.55, 0.0, 1.0)
			s = lerpf(0.85, 1.0, HudStyle.spring(k))
			a = minf(1.0, k * 3.0)
			if k >= 1.0:
				_anim = ""
		"bump":
			var k := clampf(_anim_t / 0.5, 0.0, 1.0)
			s = 1.0 + 0.12 * sin(k * PI) * (1.0 - k * 0.5)
			if k >= 1.0:
				_anim = ""
		"spent":
			var k := clampf(_anim_t / 1.5, 0.0, 1.0)
			var e := k * k
			a = 1.0 - e
			s = lerpf(1.0, 0.6, e)
			r = deg_to_rad(-6.0) * e
			y = -6.0 * e
			_face.burn = minf(1.0, k / 0.3) if k < 0.3 else 1.0 - (k - 0.3) / 0.7 * 0.6
			if k >= 1.0:
				_anim = ""
				_face.burn = 0.0
				on = false
				whole = false
				near = false
				visible = false
				_key = ""
	modulate.a = a
	rotation = r
	_face.position.y = y
	if not down:
		scale = Vector2(s, s) * rest
	_face.queue_redraw()
	if _anim == "" and _pop < 0 and not near and not down:
		set_process(false)
	if near:
		_style()


## The chip's glass for its state: parchment-brown, gold once whole, red at the X.
func _style() -> void:
	if whole and near:
		var pulse := 0.5 - 0.5 * cos(_clock / 1.1 * TAU)
		p("c_top", Color(70.0 / 255.0, 44.0 / 255.0, 16.0 / 255.0, 0.86)).p("c_foot", Color(30.0 / 255.0, 18.0 / 255.0, 8.0 / 255.0, 0.84))
		p("c_border", Color(1.0, 140.0 / 255.0, 100.0 / 255.0, 0.75)).p("c_glow", Color(1.0, 110.0 / 255.0, 70.0 / 255.0, 0.6 * pulse)).p("glow", 20.0 * HudStyle.PX)
		set_process(true)
	elif whole:
		p("c_top", Color(70.0 / 255.0, 44.0 / 255.0, 16.0 / 255.0, 0.86)).p("c_foot", Color(30.0 / 255.0, 18.0 / 255.0, 8.0 / 255.0, 0.84))
		p("c_border", Color(0.957, 0.78, 0.396, 0.6)).p("c_glow", Color(0.957, 0.706, 0.275, 0.3)).p("glow", 16.0 * HudStyle.PX)
	else:
		p("c_top", Color(54.0 / 255.0, 38.0 / 255.0, 20.0 / 255.0, 0.7)).p("c_foot", Color(24.0 / 255.0, 17.0 / 255.0, 10.0 / 255.0, 0.72))
		p("c_border", Color(233.0 / 255.0, 207.0 / 255.0, 149.0 / 255.0, 0.26)).p("c_glow", Color(0, 0, 0, 0)).p("glow", 0.0)
	p("hi", 0.12).p("c_shadow", Color(0.0, 8.0 / 255.0, 14.0 / 255.0, 0.3)).p("shadow", Vector2(4.0, 14.0) * HudStyle.PX)
	_relay()


## Sized round its words.
func _relay() -> void:
	var k := _u
	var kf := HudStyle.font("inter", 700, 1)
	var bf := HudStyle.tnum(HudStyle.font("inter", 800))
	var ks := roundi(maxf(7.5 * HudStyle.PX, 8.5 * k))
	var bs := roundi(maxf(14.0 * HudStyle.PX, 17.0 * k) if whole else maxf(13.0 * HudStyle.PX, 15.0 * k))
	var kw := kf.get_string_size(_kick.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, ks).x * 1.08
	var bw := bf.get_string_size(_line, HORIZONTAL_ALIGNMENT_LEFT, -1, bs).x
	var row := bw if whole else 3.0 * 9.0 * k + 4.0 * k + 7.0 * k + bw
	var w := maxf(124.0 * k, 5.0 * k + 34.0 * k + 9.0 * k + maxf(kw, row) + 12.0 * k)
	var h := 44.0 * k if not touch else 42.0 * k
	if size != Vector2(w, h):
		p("radius", h * 0.5)
		resize(Vector2(w, h))
		_face.size = size
	_face.queue_redraw()


## What the chip shows, drawn.
class _Face:
	extends Control
	var chip: MapChip
	var burn := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	## Where slot `i` sits, in the chip's own space.
	func slot_at(i: int) -> Vector2:
		var k := chip._u
		var x0 := 5.0 * k + 34.0 * k + 9.0 * k
		var kh := maxf(7.5 * HudStyle.PX, 8.5 * k)
		return Vector2(x0 + i * 11.0 * k + 4.5 * k, size.y * 0.5 + kh * 0.55 + 1.0 * k)

	func _draw() -> void:
		var c := chip
		var k := c._u
		var h := size.y
		var dc := Vector2(5.0 * k + 17.0 * k, h * 0.5)
		var dr := 17.0 * k
		if burn > 0.0:
			draw_circle(size * 0.5, size.x * 0.6, Color(1.0, 0.47, 0.16, 0.25 * burn), true, -1.0, true)
		draw_circle(dc + Vector2(0, 2.0 * k), dr, Color(0, 0, 0, 0.3), true, -1.0, true)
		if c.whole and c.near:
			# the red seal, a spade on it
			draw_circle(dc, dr, Color("#6d1410"), true, -1.0, true)
			draw_circle(dc - Vector2(dr, dr) * 0.12, dr * 0.82, Color("#a5221a"), true, -1.0, true)
			draw_circle(dc - Vector2(dr, dr) * 0.24, dr * 0.5, Color("#e0503c"), true, -1.0, true)
			draw_arc(dc, dr - 0.75, 0.0, TAU, 40, Color(1.0, 190.0 / 255.0, 160.0 / 255.0, 0.5), 1.5, true)
			var sp := Icons.texture("spade", dr * 1.12)
			draw_texture_rect(sp, Rect2(dc - Vector2(dr, dr) * 0.56, Vector2(dr, dr) * 1.12), false, Color("#ffe6d4"))
		elif c.whole:
			# a compass: a dark face ringed in gold ticks, its needle on the X
			draw_circle(dc, dr, Color("#2e1d0a"), true, -1.0, true)
			for q in 8:
				var a := q * TAU / 8.0 - deg_to_rad(3.0)
				var pts := PackedVector2Array([dc, dc + Vector2(cos(a), sin(a)) * dr, dc + Vector2(cos(a + deg_to_rad(6.0)), sin(a + deg_to_rad(6.0))) * dr])
				draw_colored_polygon(pts, Color(1.0, 220.0 / 255.0, 150.0 / 255.0, 0.85))
			draw_circle(dc, dr * 0.52, Color(8.0 / 255.0, 26.0 / 255.0, 38.0 / 255.0, 0.96), true, -1.0, true)
			draw_arc(dc, dr - 0.75, 0.0, TAU, 40, Color("#e3b35a"), 1.5, true)
			var nh := dr * 0.64
			var nw := dr * 0.34 * 0.5
			var tip := dc + Vector2(0, -nh).rotated(c._ang)
			var bl := dc + Vector2(-nw, nh).rotated(c._ang)
			var br := dc + Vector2(nw, nh).rotated(c._ang)
			var notch := dc + Vector2(0, nh * 0.56).rotated(c._ang)
			MapMarks.glow(self, dc, dr * 0.5, dr * 0.4, Color(1.0, 210.0 / 255.0, 120.0 / 255.0, 0.45))
			draw_colored_polygon(PackedVector2Array([tip, notch, bl]), Color("#ffe7a8"))
			draw_colored_polygon(PackedVector2Array([tip, br, notch]), Color("#d29a3a"))
			# the wax seal on its rim
			var sc := dc + Vector2(dr * 0.88, dr * 0.82)
			var sr := 7.5 * k
			var seal := PackedVector2Array()
			for q in 32:
				var a := q * TAU / 32.0
				seal.append(sc + Vector2(cos(a), sin(a)) * sr * (0.92 if q % 2 else 1.0))
			draw_colored_polygon(seal, Color("#b3271b"))
			var xr := sr * 0.3
			draw_line(sc - Vector2(xr, xr), sc + Vector2(xr, xr), Color("#ffd8c0"), maxf(1.0, sr * 0.2), true)
			draw_line(sc + Vector2(xr, -xr), sc + Vector2(-xr, xr), Color("#ffd8c0"), maxf(1.0, sr * 0.2), true)
		else:
			# a rolled chart
			draw_circle(dc, dr, Color("#b8884a"), true, -1.0, true)
			draw_circle(dc - Vector2(dr, dr) * 0.12, dr * 0.84, Color("#e6c88a"), true, -1.0, true)
			draw_circle(dc - Vector2(dr, dr) * 0.24, dr * 0.45, Color("#fbefcd"), true, -1.0, true)
			draw_arc(dc, dr - 0.5, 0.0, TAU, 40, Color(96.0 / 255.0, 62.0 / 255.0, 24.0 / 255.0, 0.55), 1.0, true)
			var ic := Icons.texture("scroll", dr * 1.16)
			draw_texture_rect(ic, Rect2(dc - Vector2(dr, dr) * 0.58, Vector2(dr, dr) * 1.16), false, Color("#5b3a16"))
		# the words: the kicker over the slots (or the way to the X)
		var x0 := 5.0 * k + 34.0 * k + 9.0 * k
		var kf := HudStyle.font("inter", 700, 1)
		var ks := roundi(maxf(7.5 * HudStyle.PX, 8.5 * k))
		var bf := HudStyle.tnum(HudStyle.font("inter", 800))
		var bs := roundi(maxf(14.0 * HudStyle.PX, 17.0 * k) if c.whole else maxf(13.0 * HudStyle.PX, 15.0 * k))
		var kc := Color("#ffc2ae") if c.near else Color(MapChip.PARCH_INK, 0.78)
		var top := h * 0.5 - (ks + bs) * 0.5 - 1.0 * k
		draw_string(kf, Vector2(x0, top + kf.get_ascent(ks)), c._kick.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, ks, kc)
		var ry := top + ks + 2.0 * k
		var bx := x0
		if not c.whole:
			for i in 3:
				var at := slot_at(i)
				var have := bool(c._shown & (1 << i))
				var sc := 1.0
				var rot := deg_to_rad([-4.0, 3.0, -1.0][i])
				if i == c._pop:
					var e := HudStyle.spring(clampf(c._pop_t / 0.6, 0.0, 1.0))
					sc = lerpf(2.2, 1.0, e)
					rot += deg_to_rad(-20.0) * (1.0 - e)
				TreasureMapScreen.scrap(self, at, 15.0 * k * sc, rot, have, Color("#efdba8"), Color("#8a6230"))
			bx = x0 + 3.0 * 11.0 * k + 5.0 * k
		var ink := Color("#ffd0bf") if c.near else HudStyle.GOLD_HI if c.whole else HudStyle.INK
		draw_string(bf, Vector2(bx, ry + bf.get_ascent(bs)), c._line, HORIZONTAL_ALIGNMENT_LEFT, -1, bs, ink)
		# the key that opens it, on a keyboard
		if not c.touch:
			var kk := "T"
			var kfs := roundi(maxf(8.0 * HudStyle.PX, 8.5 * k))
			var kw := kf.get_string_size(kk, HORIZONTAL_ALIGNMENT_LEFT, -1, kfs).x + 6.0 * k
			var kh := kfs * 1.45
			draw_rect(Rect2(Vector2(3.0 * k, 1.0 * k), Vector2(kw, kh)), Color(4.0 / 255.0, 16.0 / 255.0, 24.0 / 255.0, 0.78))
			draw_string(kf, Vector2(3.0 * k + 3.0 * k, 1.0 * k + (kh + kf.get_ascent(kfs) - kf.get_descent(kfs)) * 0.5), kk, HORIZONTAL_ALIGNMENT_LEFT, -1, kfs, HudStyle.INK_3)


## A found piece tumbling from where it turned up into its slot on the chip.
class _Fly:
	extends Control
	signal done
	var from := Vector2.ZERO
	var mid := Vector2.ZERO
	var to := Vector2.ZERO
	var spin := 0.0
	var _t := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		top_level = true
		z_index = 40

	func _process(dt: float) -> void:
		_t += dt
		if _t >= 1.15:
			set_process(false)
			done.emit()
			return
		queue_redraw()

	func _draw() -> void:
		var u := clampf(_t / 1.15, 0.0, 1.0)
		# (the web's eased keyframes: up off the find, a high arc, down into the slot)
		var e := u * u * (3.0 - 2.0 * u)
		var at: Vector2
		var s: float
		var a := 1.0
		var r: float
		if e < 0.22:
			var k := e / 0.22
			at = from.lerp(from + Vector2(0, -30.0 * HudStyle.PX), k)
			s = lerpf(0.4, 1.5, k)
			a = k
			r = spin * 0.15 * k
		elif e < 0.6:
			var k := (e - 0.22) / 0.38
			at = (from + Vector2(0, -30.0 * HudStyle.PX)).lerp(mid, k)
			s = lerpf(1.5, 1.15, k)
			r = lerpf(spin * 0.15, spin * 0.6, k)
		else:
			var k := (e - 0.6) / 0.4
			at = mid.lerp(to, k)
			s = lerpf(1.15, 0.45, k)
			r = lerpf(spin * 0.6, spin, k)
		var h := 34.0 * HudStyle.PX * 0.6 * s
		MapMarks.glow(self, at, h * 0.4, h * 0.5, Color(1.0, 214.0 / 255.0, 138.0 / 255.0, 0.8 * a))
		TreasureMapScreen.scrap(self, at, h, r, true, Color(Color("#ecd6a2"), a), Color(Color("#7d5628"), a))
