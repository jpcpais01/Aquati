class_name Minimap
extends Control
## The round minimap atop the HUD's corner column (the web game's #minimap and
## its compass bezel): north up, 420 m round your ship to the rim. The sea
## and the isles are painted from the seabed you sail (shaders/minimap.gdshader),
## with the web's marks over them: the trading ports' gilt medallions (the
## nearest pinned to the rim when none is in sight), the waypoints (those
## past the rim pinned to it with how far to sail), the isles not yet charted,
## plunder afloat by its rarity, the helmsman's course, the pirates and your
## ship; out on the high seas each archipelago is pinned to the rim, named,
## to steer by.
##
## The map is drawn into its own little canvas twenty times a second, as the
## web redraws its own, and shown every frame as a disc with a soft shadow
## under it and a shade inside its rim (shaders/minimap_face.gdshader), a
## fine compass ring round it. A tap opens the sea chart.

signal pressed

## World metres from the middle to the rim.
const R := 420.0
## The web draws its minimap into a canvas this many pixels across: the marks
## are sized in its pixels.
const CANVAS := 360.0
## Seconds between redraws.
const EVERY := 0.05
## The disc across, and the bezel's overhang round it, in HUD units (the
## web's 126 and 4 CSS px at its --k).
const SIZE := 126.0 * HudStyle.K
const BEZEL := 4.0 * HudStyle.K
## Room round the disc for its shadow: left, top, right, bottom.
const SPILL := Vector4(70.0, 44.0, 70.0, 96.0)

var scene: MapScene

var _vp: SubViewport
var _ground: ColorRect
var _ground_mat: ShaderMaterial
var _marks: _Marks
var _face: ColorRect
var _face_mat: ShaderMaterial
var _bezel: _Bezel
var _wait := 0.0
var _down := 0.0


func _init() -> void:
	custom_minimum_size = Vector2(SIZE, SIZE)
	size = custom_minimum_size
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND


func _ready() -> void:
	var px := maxi(64, ceili(SIZE * Icons.density()))
	_vp = SubViewport.new()
	_vp.size = Vector2i(px, px)
	_vp.disable_3d = true
	_vp.transparent_bg = false
	_vp.msaa_2d = Viewport.MSAA_4X
	_vp.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR
	_vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	add_child(_vp)
	_ground = ColorRect.new()
	_ground.size = Vector2(px, px)
	_ground_mat = ShaderMaterial.new()
	_ground_mat.shader = preload("res://shaders/minimap.gdshader")
	_ground_mat.set_shader_parameter("view", Vector3(0.0, 0.0, R * 2.0))
	_ground.material = _ground_mat
	_vp.add_child(_ground)
	_marks = _Marks.new()
	_marks.size = Vector2(px, px)
	_marks.map = self
	_vp.add_child(_marks)

	_face = ColorRect.new()
	_face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_face.position = Vector2(-SPILL.x, -SPILL.y)
	_face.size = Vector2(SIZE + SPILL.x + SPILL.z, SIZE + SPILL.y + SPILL.w)
	_face_mat = ShaderMaterial.new()
	_face_mat.shader = preload("res://shaders/minimap_face.gdshader")
	_face_mat.set_shader_parameter("map", _vp.get_texture())
	_face_mat.set_shader_parameter("quad", _face.size)
	_face_mat.set_shader_parameter("centre", Vector2(SPILL.x, SPILL.y) + Vector2(SIZE, SIZE) * 0.5)
	_face_mat.set_shader_parameter("radius", SIZE * 0.5)
	_face_mat.set_shader_parameter("shadow", Vector2(14.0, 34.0) * HudStyle.PX)
	_face_mat.set_shader_parameter("inset", 30.0 * HudStyle.PX)
	_face.material = _face_mat
	add_child(_face)
	_bezel = _Bezel.new()
	_bezel.position = Vector2(-BEZEL, -BEZEL)
	_bezel.size = Vector2(SIZE, SIZE) + Vector2(BEZEL, BEZEL) * 2.0
	add_child(_bezel)
	set_process(false)


## The archipelagos' seabeds to paint the sea from (the first two).
func set_scene(s: MapScene) -> void:
	scene = s
	var regions := s.world.regions
	for i in 2:
		var tag := "ab"[i]
		if i < regions.size():
			_ground_mat.set_shader_parameter("height_" + tag, regions[i].height_tex)
			_ground_mat.set_shader_parameter("rect_" + tag, regions[i].height_rect())
		else:
			_ground_mat.set_shader_parameter("rect_" + tag, Vector4(0.0, 0.0, 1.0, 0.0))


## Draws the map afresh every twentieth of a second (call each frame while it shows).
func tick(dt: float) -> void:
	_wait -= dt
	if _wait > 0.0 or scene == null or scene.player == null:
		return
	_wait = EVERY
	var p := scene.player.pos
	_ground_mat.set_shader_parameter("view", Vector3(p.x, p.z, R * 2.0))
	_marks.queue_redraw()
	_vp.render_target_update_mode = SubViewport.UPDATE_ONCE


## A finger on the disc itself, not the corners of its box.
func _has_point(p: Vector2) -> bool:
	return p.distance_to(size * 0.5) <= SIZE * 0.5 + 4.0


func _gui_input(event: InputEvent) -> void:
	if ShotPie.pressed(event):
		_down = 1.0
		set_process(true)
		pressed.emit()
		accept_event()


# a press dips the disc a touch, as the web's :active does
func _process(dt: float) -> void:
	_down = move_toward(_down, 0.0, dt / 0.25)
	var s := 1.0 - 0.03 * sin(_down * PI * 0.5)
	_face.pivot_offset = Vector2(SPILL.x, SPILL.y) + Vector2(SIZE, SIZE) * 0.5
	_face.scale = Vector2(s, s)
	if _down <= 0.0:
		set_process(false)


## The marks over the sea, in the minimap's own canvas, sized in the web's
## canvas pixels (u of ours to each of its).
class _Marks:
	extends Control
	var map: Minimap

	func _draw() -> void:
		var sc := map.scene
		if sc == null or sc.player == null:
			return
		var S := size.x
		var u := S / CANVAS
		var h := S * 0.5
		var c := Vector2(h, h)
		var me := sc.player.pos
		var k := h / R
		var to_map := func(x: float, z: float) -> Vector2: return c + Vector2(x - me.x, z - me.z) * k
		var cinzel := HudStyle.font("cinzel", 700)
		var inter := HudStyle.font("inter", 700)
		# out on the high seas: each archipelago pinned to the rim, named, to steer by
		if float(sc.nearest_region(me.x, me.z)[1]) > MapScene.HIGH_SEAS_R:
			var gilt := Color(1.0, 231.0 / 255.0, 168.0 / 255.0, 0.95)
			var ink := Color(8.0 / 255.0, 30.0 / 255.0, 40.0 / 255.0, 0.8)
			for r in sc.world.regions:
				var a := atan2(r.centre.z - me.z, r.centre.x - me.x)
				var dir := Vector2(cos(a), sin(a))
				var rr := h - 16.0 * u
				_arrow(c + dir * rr, a, [Vector2(10, 0), Vector2(-6, -7), Vector2(-3, 0), Vector2(-6, 7)], u, gilt, ink, 2.0 * u)
				MapMarks.words(self, c + dir * (rr - 30.0 * u), r.title, cinzel, roundi(15.0 * u), gilt, 4.0 * u, ink)
		# isles not yet charted: a soft question mark
		var q_size := roundi(18.0 * u)
		var q_w := cinzel.get_string_size("?", HORIZONTAL_ALIGNMENT_LEFT, -1, q_size).x
		for r in sc.world.regions:
			for isl: Dictionary in r.islands:
				var at: Vector2 = to_map.call(float(isl.x), float(isl.z))
				if at.distance_to(c) > h + 20.0 * u or sc.known(r, isl):
					continue
				draw_string(cinzel, at + Vector2(-q_w * 0.5, 6.0 * u), "?", HORIZONTAL_ALIGNMENT_LEFT, -1, q_size, Color(1.0, 241.0 / 255.0, 184.0 / 255.0, 0.9))
		# plunder afloat, by its rarity
		for it in sc.world.loot.all():
			var w := sc.world.loot.where(it)
			var at: Vector2 = to_map.call(w.x, w.y)
			if at.distance_to(c) > h + 6.0 * u:
				continue
			draw_circle(at, (4.5 if it.tier >= 3 else 3.5 if it.tier > 0 else 2.6) * u, MapMarks.LOOT[it.tier], true, -1.0, true)
		# trading ports: in view where they are, else the nearest pinned to the rim to steer by
		var near: TradePort = null
		var nd := INF
		var seen := false
		for tp in sc.ports:
			var at2 := MapScene.port_at(tp)
			var d := Vector2(at2.x - me.x, at2.y - me.z).length()
			if d < R - 20.0:
				MapMarks.port(self, to_map.call(at2.x, at2.y), 13.0 * u)
				seen = true
			elif d < nd:
				nd = d
				near = tp
		if near != null and not seen:
			var at3 := MapScene.port_at(near)
			var a := atan2(at3.y - me.z, at3.x - me.x)
			MapMarks.port(self, c + Vector2(cos(a), sin(a)) * (h - 18.0 * u), 10.0 * u, 0.9)
		# a maelstrom's pull ringed in coral red round its wheeling spiral; a reef's danger mark
		if sc.world.hazards != null:
			var now := Time.get_ticks_msec() / 1000.0
			for m in sc.world.hazards.maelstroms:
				var v: Vortex = m.v
				var at5: Vector2 = to_map.call(v.x, v.z)
				var rr := v.r * k
				if at5.distance_to(c) > h + rr + 14.0 * u:
					continue
				MapMarks.pull_ring(self, at5, rr, 6.0 * u, now * 8.0 * u * v.dir, Color(1.0, 130.0 / 255.0, 100.0 / 255.0, 0.7), 2.0 * u)
				MapMarks.vortex(self, at5, clampf(rr * 0.5, 11.0 * u, 30.0 * u), now * 0.8, v.dir)
			for rf: Dictionary in sc.world.hazards.reefs:
				var at6: Vector2 = to_map.call(float(rf.x), float(rf.z))
				if at6.distance_to(c) < h + 14.0 * u:
					MapMarks.reef(self, at6, 9.0 * u)
		# the island forts
		for f: Dictionary in sc.forts:
			var at7: Vector2 = to_map.call(float(f.x), float(f.z))
			if at7.distance_to(c) < h + 14.0 * u:
				MapMarks.fort(self, at7, 11.0 * u, bool(f.ours), bool(f.quiet))
		# the helmsman's course, flowing on ahead of her
		if sc.route.size() > 1:
			var course := PackedVector2Array()
			course.resize(sc.route.size())
			for i in sc.route.size():
				course[i] = to_map.call(sc.route[i].x, sc.route[i].y)
			MapMarks.route(self, course, Time.get_ticks_msec() / 1000.0, 1.5 * u, Rect2(Vector2.ZERO, size))
		# the X: off the edge, pinned to the rim and pointing the way
		if not sc.treasure.is_empty():
			var at8: Vector2 = to_map.call(float(sc.treasure.x), float(sc.treasure.z))
			var rx := h - 16.0 * u
			var dx := at8.distance_to(c)
			MapMarks.x_mark(self, c + (at8 - c) * (rx / dx if dx > rx else 1.0), (8.0 if dx > rx else 11.0) * u)
		# the other ships: pirates in red, your escorts in the fleet's aqua
		for s in sc.world.ships:
			if s == sc.player or not s.alive:
				continue
			# (a merchantman willing to trade in gold)
			var col := Color("#5ee3d4") if s.team == Ship.Team.PLAYER else (Color("#f2c45a") if s.team == Ship.Team.MERCHANT else Color("#ff6a55"))
			var at4: Vector2 = to_map.call(s.pos.x, s.pos.z)
			if at4.distance_to(c) < h + 14.0 * u:
				MapMarks.ship(self, at4, s.heading, col, 11.0 * u, 2.0 * u)
		# waypoints: in range where they stand, else on the rim with how far to sail
		if sc.pins != null:
			var n := 0
			for pin in sc.pins.pins:
				n += 1
				var css := MapMarks.PIN[pin.hue]
				var d := Vector2(pin.x - me.x, pin.z - me.z).length()
				if d < R - 30.0:
					MapMarks.pin(self, to_map.call(pin.x, pin.z), 13.0 * u, css, str(n), inter)
					continue
				var a := atan2(pin.z - me.z, pin.x - me.x)
				var dir := Vector2(cos(a), sin(a))
				var rr := h - 16.0 * u
				var tip := c + dir * rr
				MapMarks.glow(self, tip, 6.0 * u, 10.0 * u, Color(css, 0.5))
				_arrow(tip, a, [Vector2(11, 0), Vector2(-7, 9), Vector2(-3, 0), Vector2(-7, -9)], u, css, Color(20.0 / 255.0, 14.0 / 255.0, 6.0 / 255.0, 0.7), 2.0 * u)
				var lab := c + Vector2(dir.x * (rr - 36.0 * u), dir.y * (rr - 30.0 * u))
				MapMarks.words(self, lab, MapScene.distance(d), inter, roundi(19.0 * u), css, 5.0 * u, Color(6.0 / 255.0, 22.0 / 255.0, 30.0 / 255.0, 0.85))
		# and you, in white
		MapMarks.ship(self, c, sc.player.heading, Color.WHITE, 14.0 * u, 2.0 * u)
		# a faint rim inside the bezel
		draw_arc(c, h - 2.0 * u, 0.0, TAU, 96, Color(1.0, 240.0 / 255.0, 210.0 / 255.0, 0.25), 3.0 * u, true)

	## An arrowhead pinned to the rim, `pts` in the web's canvas pixels pointing along +x, turned to `a`.
	func _arrow(at: Vector2, a: float, pts: Array, u: float, fill: Color, edge: Color, width: float) -> void:
		var poly := PackedVector2Array()
		for p: Vector2 in pts:
			poly.append(at + (p * u).rotated(a))
		draw_colored_polygon(poly, fill)
		poly.append(poly[0])
		draw_polyline(poly, edge, width, true)


## The compass ring round the disc (the web's compassBezel): a fine ring
## inside a bright one, ticks every 15°, the cardinal letters and a gold pip
## for north, all with a soft dark shadow so it reads on any sea.
class _Bezel:
	extends Control
	const LETTERS := [["E", Vector2(186.0, 104.5)], ["S", Vector2(100.0, 190.5)], ["W", Vector2(14.0, 104.5)]]

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var k := size.x / 200.0
		var shade := Vector2(0.0, 1.0 * HudStyle.PX)
		draw_texture_rect(_art(true), Rect2(shade, size), false, Color(1.0, 1.0, 1.0, 0.55))
		draw_texture_rect(_art(false), Rect2(Vector2.ZERO, size), false)
		var f := HudStyle.font("inter", 800)
		var fs := roundi(13.0 * k)
		for l: Array in LETTERS:
			var t: String = l[0]
			var at: Vector2 = l[1] * k
			var w := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			var p := Vector2(at.x - w * 0.5, at.y)
			draw_string_outline(f, p + shade, t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, roundi(11.0 * k), Color(0.0, 0.0, 0.0, 0.3))
			draw_string_outline(f, p, t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, roundi(7.0 * k), Color(4.0 / 255.0, 18.0 / 255.0, 26.0 / 255.0, 0.8))
			draw_string(f, p, t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE)

	## The ring, the ticks and the north pip as the web's SVG; `shadow`: the
	## same shapes a little broader, in soft black, for the drop shadow.
	func _art(shadow: bool) -> Texture2D:
		var ticks := ""
		for i in 24:
			if i % 6 == 0:
				continue
			var a := i / 24.0 * TAU
			var r0 := 90.0 if i % 3 == 0 else 93.0
			ticks += '<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f"/>' % [100.0 + sin(a) * r0, 100.0 - cos(a) * r0, 100.0 + sin(a) * 96.5, 100.0 - cos(a) * 96.5]
		var doc: String
		if shadow:
			doc = '<g fill="none" stroke="#000" stroke-opacity="0.45" stroke-linecap="round"><circle cx="100" cy="100" r="98.5" stroke-width="4.4"/><circle cx="100" cy="100" r="88" stroke-width="2.4" stroke-opacity="0.2"/><g stroke-width="3.5">%s</g></g><path d="M100 3 L108.5 17 L100 13.5 L91.5 17 Z" fill="#000" fill-opacity="0.45" stroke="#000" stroke-opacity="0.45" stroke-width="3" stroke-linejoin="round"/>' % ticks
		else:
			doc = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4cc"/><stop offset="1" stop-color="#e9b24a"/></linearGradient></defs><circle cx="100" cy="100" r="98.5" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2.4"/><circle cx="100" cy="100" r="88" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="1"/><g stroke="#fff" stroke-opacity="0.75" stroke-width="1.5" stroke-linecap="round">%s</g><path d="M100 3 L108.5 17 L100 13.5 L91.5 17 Z" fill="none" stroke="#04121a" stroke-opacity="0.8" stroke-width="1.5" stroke-linejoin="round"/><path d="M100 3 L108.5 17 L100 13.5 L91.5 17 Z" fill="url(#g)"/>' % ticks
		return Icons.svg("bezel:%s" % shadow, doc, size, Rect2(0.0, 0.0, 200.0, 200.0))
