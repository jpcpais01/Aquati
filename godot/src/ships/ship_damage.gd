class_name ShipDamage
extends RefCounted
## What the guns do to a hull, and how she goes down. Every breach a ball
## tears is remembered: she floods and settles lower as her hull fails, lists
## toward her holes (the low ones most), smoke curls out of them once she is
## badly hurt, and her crew boards the oldest over as she mends. When she
## goes she capsizes onto her beam ends, lurching, and lingers there
## smouldering before the sea takes her; your own ship founders by the stern
## within moments and comes to rest on the bottom, so the farewell can follow
## her down. The web game's ShipDamage, its breaches kept as data (the torn
## planking and the wrecks that break in two come with the broken masts).

## Seconds a wreck takes to slip under once her time afloat is up.
const WRECK_FINAL := 13.0
const MAX_HOLES := 16

var ship: Ship
## How far the flooding hull has settled (m), and her list (rad, + lifts the port side).
var lowered := 0.0
var list := 0.0
## The breaches, in her own frame: {c (on the skin), side (+1 port), r (m), patched, order}.
var holes: Array[Dictionary] = []
## When a founder came to rest on the seabed (-1 not yet).
var rest_t := -1.0

# the wreck's pose this frame (see wreck_pose)
var pose_y := 0.0
var pose_pitch := 0.0
var pose_roll := 0.0
## 1 still riding the swell .. 0 gone under.
var afloat := 1.0
var done := false

var _order := 0
var _smoke_t := 0.0
var _seed := randf() * 10.0
var _roll := 0.0
var _pitch := 0.0
var _depth := 0.0
var _fall := 0.0
var _fall_v := 0.0


func _init(p_ship: Ship) -> void:
	ship = p_ship


## A ball (or a reef, or another hull) struck her: `at` is the world point,
## or null for a blow anywhere along her side.
func on_hit(at: Variant, dmg: float) -> void:
	var s := ship
	var shape := s.model.shape
	var L := s.cls.length
	var local: Vector3
	if at is Vector3:
		local = s.transform.affine_inverse() * (at as Vector3)
	else:
		local = Vector3(randf_range(-1.0, 1.0), randf(), randf_range(-0.35, 0.35) * L)
	var t := clampf(local.z / L + 0.5, 0.04, 0.96)
	var side := 1 if local.x >= 0.0 else -1
	var y := clampf(local.y, -0.7, shape.top(t) - 0.2)
	var c := Vector3(side * shape.half_width_at_y(t, y), y, shape.z(t))
	var r := randf_range(0.6, 0.9) * clampf(dmg / 20.0, 0.85, 1.3) * (0.8 + L / 100.0)
	_add_hole(c, side, r)


func _add_hole(c: Vector3, side: int, r: float) -> void:
	# a ball landing in an existing breach tears it wider
	for h in holes:
		if not h.patched and int(h.side) == side and (h.c as Vector3).distance_to(c) < float(h.r) * 0.75:
			h.r = minf(float(h.r) * 1.22, 1.35)
			return
	var hole := {"c": c, "side": side, "r": r, "patched": false, "order": _order}
	_order += 1
	if holes.size() < MAX_HOLES:
		holes.append(hole)
		return
	# full: the oldest patch gives way, else the oldest breach
	var best := 0
	var best_score := INF
	for i in holes.size():
		var score := float(holes[i].order) - (1e6 if holes[i].patched else 0.0)
		if score < best_score:
			best_score = score
			best = i
	holes[best] = hole


## Flooding, mending and the smoke of her breaches, while she still fights.
func update(dt: float) -> void:
	var s := ship
	var world := s.world
	var dmg := 1.0 - s.hp / s.max_hp
	# settle lower and list toward the side with the most (and lowest) holes
	var lean := 0.0
	var open: Array[Dictionary] = []
	for h in holes:
		if h.patched:
			continue
		open.append(h)
		lean += float(h.side) * float(h.r) * (1.0 + clampf(1.0 - (h.c as Vector3).y / 1.6, 0.0, 1.2))
	var list_target := clampf(-lean * 0.016, -0.1, 0.1) * minf(1.0, dmg * 2.2)
	list += (list_target - list) * minf(1.0, dt * 0.35)
	var low_target := pow(dmg, 1.5) * s.cls.freeboard * 0.24
	lowered += (low_target - lowered) * minf(1.0, dt * 0.4)

	# the crew boards breaches over as the hull is mended
	var budget := ceili(dmg * 16.0) + 1
	if open.size() > budget:
		var oldest := open[0]
		for h in open:
			if int(h.order) < int(oldest.order):
				oldest = h
		oldest.patched = true
		open.erase(oldest)
		var wp := s.transform * (oldest.c as Vector3)
		for k in 4:
			world.fx.sparkle(wp)

	# smoke curling out of the breaches
	if dmg > 0.35 and not open.is_empty():
		_smoke_t += dt * (0.8 + dmg * 3.0)
		while _smoke_t > 1.0:
			_smoke_t -= 1.0
			var h: Dictionary = open[randi() % open.size()]
			var wp := s.transform * (h.c as Vector3)
			if wp.y < world.water_height(wp.x, wp.z) + 0.1:
				continue
			var g := randf_range(0.14, 0.24)
			world.fx.emit(wp, Vector3(s.vel.x * 0.5 + randf_range(-0.4, 0.4), randf_range(1.2, 2.6), s.vel.z * 0.5 + randf_range(-0.4, 0.4)),
					randf_range(2.2, 3.6), 0.7, randf_range(3.5, 5.5), Color(g, g * 0.95, g * 0.92, 0.5), Color(0.42, 0.41, 0.4), -0.5, 0.6, Particles.SMOKE, 0.15)


## A random point on her deck, in the world, above the water (a wreck's
## drowned deck has no flames): null if none was found.
func fire_point() -> Variant:
	var pts := ship.model.deck_points
	if pts.is_empty():
		return null
	for k in 3:
		var p := ship.transform * pts[randi() % pts.size()]
		if ship.alive or p.y > ship.world.water_height(p.x, p.z) + 0.15:
			return p
	return null


## She's done for: she goes over onto her beam ends, toward the side she was
## listing to, and settles low.
func on_death() -> void:
	var c := ship.cls
	var fall := signf(list) if absf(list) > 1e-4 else (1.0 if randf() < 0.5 else -1.0)
	_roll = fall * randf_range(1.05, 1.38)
	_pitch = (1.0 if randf() < 0.5 else -1.0) * randf_range(0.06, 0.22)
	_depth = c.draft * 0.35 + c.freeboard * 0.3


## The wreck's pose `t` seconds after she went: how far she has sunk, and
## her pitch and roll on top of the swell's. Fills pose_*, afloat and done.
func wreck_pose(t: float, dt: float) -> void:
	var s := ship
	var c := s.cls
	var world := s.world
	var e := MathX.smooth(0.0, 7.0, t)
	var lurch := sin(minf(t, 1.2) * PI / 1.2) * 0.35
	var y := -_depth * e - lurch
	# run aground on the shallows instead of sinking through the reef
	var bed := world.ground_height(s.pos.x, s.pos.z)
	var life := s.wreck_life
	var plunge := 0.0
	var heel := 0.0
	afloat = 1.0
	if t < life:
		y = maxf(y, bed + c.draft * 0.55)
	done = not s.founders and t > life + WRECK_FINAL
	if t > life and not s.founders:
		var u := t - life
		y -= u * u * 0.07 + u * 0.15
	elif t > life:
		# a quick founder goes down by the stern, bow reaching for the sky, and
		# heels over as she sinks; she glides down at a stately pace and comes
		# to rest on her side on the seabed
		var u := t - life
		var rest := bed + maxf(c.draft * 0.9, c.beam * 0.38)
		if rest_t < 0.0:
			# gathers way, then eases the last couple of metres onto the sand
			var left := y - _fall - rest
			_fall_v = minf(minf(1.9, _fall_v + dt * 0.55), 0.2 + maxf(left, 0.0) * 0.7)
			_fall += _fall_v * dt
			if left < 0.12:
				rest_t = t
		var settled := 0.0 if rest_t < 0.0 else MathX.smooth(0.0, 3.5, t - rest_t)
		y = maxf(y - _fall, rest)
		plunge = minf(0.42, u * 0.07) * (1.0 - settled * 0.75)
		heel = signf(_roll) * minf(1.2, _fall * 0.065 + settled * 0.15)
		afloat = 1.0 - MathX.smooth(0.0, c.draft * 2.5, _fall)
	# bubbles and foam as she goes
	if (t < 7.0 or (t > life and t < life + WRECK_FINAL)) and randf() < (0.3 if t > life else 0.12):
		var a := randf_range(-0.45, 0.45) * c.length
		var px := s.pos.x + sin(s.heading) * a + randf_range(-1.0, 1.0) * c.beam * 0.5
		var pz := s.pos.z + cos(s.heading) * a + randf_range(-1.0, 1.0) * c.beam * 0.5
		world.fx.splash(Vector3(px, world.water_height(px, pz), pz), 0.3)
		world.wake.stamp(px, pz, randf_range(1.2, 2.6), 0.35)
	# thin smoke keeps rising from the smouldering wreck long after the flames die
	if t > 20.0 and t < 100.0 and randf() < 0.06:
		var p: Variant = fire_point()
		if p != null:
			var w := world.wind
			world.fx.emit(p, Vector3(w.dir_x * 0.6, randf_range(1.2, 2.2), w.dir_z * 0.6), randf_range(4.0, 6.0), 1.2, randf_range(5.0, 8.0),
					Color(0.32, 0.31, 0.3, 0.32 * (1.0 - (t - 20.0) / 80.0)), Color(0.6, 0.6, 0.6), -0.25, 0.3, Particles.SMOKE, 0.5)
	# a slow, heavy sway on the swell
	var sway := sin(t * 0.37 + _seed) * 0.02
	pose_y = y
	pose_pitch = _pitch * e - plunge
	pose_roll = _roll * e + heel + sway
