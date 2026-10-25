class_name Birds
extends Node3D
## Herring gulls (the web game's fx/birds.ts). Each one is a little sculpted
## bird (body, head, hooked beak, grey mantle, black-and-white wingtips, fanned
## tail, pink legs) skinned in shaders/gull.gdshader: shoulders and wrists flap
## with a lagging hand, the wings fold back along the flanks when it lands,
## the tail spreads to brake, the legs drop and the head turns. On the CPU each
## gull flies with a little steering model (banking into its turns, pitching
## into climbs, gliding with occasional flap bursts, riding the gusts) and
## goes about its day: wheeling over its island, trailing a ship to circle her
## masts, landing on mast caps, fighting tops, the jib-boom and the shore
## rocks, bobbing on the swell, and scattering in a screaming cloud when the
## guns go off. All of it is one instanced draw.
##
## A few more gulls wait off stage: riders, that loaf on drifting kelp and
## driftwood far out at sea (and wheel round it while a ship goes by), and the
## carrier, who flies in with a scroll on her back, lands on your rail, calls
## out her news and is gone again.

## Model scale: ~2.6 m across the wings, a touch big so it reads from the bird's-eye camera.
const S := 1.5
## Hip to sole (m).
const LEG := 0.205 * S
const SCARE_GUNS := 75.0
const SCARE_BOOM := 120.0
const RIDERS := 6
## Spar index of the carrier's spot on the rail: stands as long as the ship does.
const RAIL := -9
## Past this (m) a gull is a pixel or two at most, and mostly fogged out.
const GULL_FAR := 520.0

enum Mode { SOAR, LAND, PERCH, FLOAT, TAKEOFF, FLEE, OFF }
enum Kind { FLOCK, RIDER, CARRIER }


class Perch:
	var ship: Ship
	var spar := 0
	## Ship-model space on a ship, world space on the shore.
	var local := Vector3.ZERO
	var taken := false
	## A rider's footing on drifting flotsam (Drift.Spot): it moves.
	var spot: Object


class Gull:
	var kind := Kind.FLOCK
	var home: Dictionary
	var mode := Mode.SOAR
	## Time left in this mode.
	var t := 0.0
	var pos := Vector3.ZERO
	var vel := Vector3.ZERO
	var yaw := 0.0
	var pitch := 0.0
	var bank := 0.0
	# the wing rig, eased toward its targets every frame
	var phase := 0.0
	var amp := 0.0
	var fold := 0.0
	var legs := 0.0
	var dih := 0.12
	var head := 0.0
	var head_t := 0.0
	var head_clock := 0.0
	var nod := 0.0
	var tail := 0.0
	var burst := 0.0
	var burst_clock := 0.0
	# the soaring circle
	var cx := 0.0
	var cz := 0.0
	var r := 20.0
	var h := 20.0
	var dir := 1.0
	var escort: Ship
	# where it's landing
	var perch: Perch
	var water: Variant = null
	## Where a scare came from.
	var from := Vector3.ZERO
	## Touchdown offset, settled out on the perch.
	var off := Vector3.ZERO
	## The long call's head toss.
	var call := 0.0
	var seed := 0.0
	## A rider's patch of flotsam (its perch moves with it).
	var raft: Perch
	## A rider or carrier with nothing left to do: seconds until it leaves the stage.
	var life := 0.0
	## The carrier's news, told on touchdown.
	var news: Callable
	## The carrier is on her errand: no gunfire turns her back.
	var errand := false


## Gulls drawn this frame.
var drawn := 0
var sound: Sound
var _gulls: Array[Gull] = []
var _shore: Array[Perch] = []
var _ship_perches := {}
var _guns_seen := {}
var _dead := {}
var _cry_clock := 3.0
var _time := 0.0
var _carrier: Gull
var _mm: MultiMesh
var _mmi: MultiMeshInstance3D
var _scroll: MultiMesh
var _scroll_mi: MultiMeshInstance3D
var _ground: Callable


## `islands` (every region's) give every perch; the flock first nests round
## `homes`. `count` gulls in the flock; `ground` is the height of the land.
func setup(islands: Array, homes: Array, count: int, ground: Callable) -> void:
	_ground = ground
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/gull.gdshader")
	var all := count + RIDERS + 1
	_mm = MultiMesh.new()
	_mm.transform_format = MultiMesh.TRANSFORM_3D
	_mm.use_colors = true
	_mm.use_custom_data = true
	_mm.mesh = gull_mesh()
	_mm.instance_count = all
	_mm.visible_instance_count = 0
	_mm.custom_aabb = AABB(Vector3(-1e5, -100.0, -1e5), Vector3(2e5, 400.0, 2e5))
	_mmi = MultiMeshInstance3D.new()
	_mmi.name = "Gulls"
	_mmi.multimesh = _mm
	_mmi.material_override = mat
	_mmi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	add_child(_mmi)
	_scroll = MultiMesh.new()
	_scroll.transform_format = MultiMesh.TRANSFORM_3D
	_scroll.use_colors = true
	_scroll.use_custom_data = true
	_scroll.mesh = scroll_mesh()
	_scroll.instance_count = 1
	_scroll.visible_instance_count = 0
	_scroll.custom_aabb = _mm.custom_aabb
	_scroll_mi = MultiMeshInstance3D.new()
	_scroll_mi.name = "Scroll"
	_scroll_mi.multimesh = _scroll
	_scroll_mi.material_override = mat
	_scroll_mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	add_child(_scroll_mi)

	# shore rocks and beaches to stand on
	for isl: Dictionary in islands:
		var n := 0
		var ir := float(isl.r)
		for k in 80:
			if n >= 5:
				break
			var a := randf() * TAU
			var d := ir * (0.35 + randf() * 0.75)
			var x := float(isl.x) + cos(a) * d
			var z := float(isl.z) + sin(a) * d
			var h: float = ground.call(x, z)
			if h < 0.5 or h > 6.0:
				continue
			# keep it level enough to stand on
			if absf(ground.call(x + 1.0, z) - ground.call(x - 1.0, z)) + absf(ground.call(x, z + 1.0) - ground.call(x, z - 1.0)) > 1.6:
				continue
			var p := Perch.new()
			p.local = Vector3(x, h, z)
			_shore.append(p)
			n += 1

	for i in all:
		var g := Gull.new()
		g.kind = Kind.FLOCK if i < count else (Kind.RIDER if i < count + RIDERS else Kind.CARRIER)
		g.home = homes[i % homes.size()]
		g.t = 6.0 + randf() * 20.0
		g.yaw = randf() * TAU
		g.phase = randf() * TAU
		g.head_clock = randf() * 2.0
		g.burst_clock = 2.0 + randf() * 6.0
		g.dir = -1.0 if randf() < 0.5 else 1.0
		g.seed = randf() * 100.0
		_gulls.append(g)
		if g.kind != Kind.FLOCK:
			g.mode = Mode.OFF
			if g.kind == Kind.CARRIER:
				_carrier = g
			continue
		_new_circle(g)
		var a := randf() * TAU
		g.pos = Vector3(g.cx + cos(a) * g.r, g.h, g.cz + sin(a) * g.r)
		g.vel = Vector3(-sin(a) * g.dir * 9.0, 0.0, cos(a) * g.dir * 9.0)
		# a few already loafing on the rocks when the voyage begins
		if i % 4 == 1:
			var p := _free_shore(g)
			if p != null:
				p.taken = true
				g.perch = p
				g.mode = Mode.PERCH
				g.t = 5.0 + randf() * 30.0
				g.pos = p.local + Vector3(0.0, LEG, 0.0)
				g.vel = Vector3.ZERO
				g.fold = 1.0
				g.legs = 1.0


## Gulls in the flock (riders and the carrier aside), and how many are out.
func count() -> Vector2i:
	var n := 0
	var out := 0
	for g in _gulls:
		if g.kind == Kind.FLOCK:
			n += 1
		elif g.mode != Mode.OFF:
			out += 1
	return Vector2i(n, out)


## How the flock is spending its time: [soaring, on perches, afloat, escorting].
func census() -> Array[int]:
	var c: Array[int] = [0, 0, 0, 0]
	for g in _gulls:
		if g.kind != Kind.FLOCK:
			continue
		if g.mode == Mode.PERCH:
			c[1] += 1
		elif g.mode == Mode.FLOAT:
			c[2] += 1
		else:
			c[0] += 1
		if g.escort != null:
			c[3] += 1
	return c


## The flock moves to another archipelago's isles (done out on the high
## seas, where none of them is in sight): each gull lets go of its perch or
## escort and is found circling over its new home.
func rehome(homes: Array) -> void:
	if homes.is_empty() or _gulls.is_empty() or _gulls[0].home == homes[0]:
		return
	for i in _gulls.size():
		var g := _gulls[i]
		if g.kind != Kind.FLOCK:
			continue
		if g.perch != null:
			g.perch.taken = false
		g.perch = null
		g.water = null
		g.home = homes[i % homes.size()]
		g.mode = Mode.SOAR
		g.fold = 0.0
		g.legs = 0.0
		g.t = 6.0 + randf() * 20.0
		_new_circle(g)
		var a := randf() * TAU
		g.pos = Vector3(g.cx + cos(a) * g.r, g.h, g.cz + sin(a) * g.r)
		g.vel = Vector3(-sin(a) * g.dir * 9.0, 0.0, cos(a) * g.dir * 9.0)


func _new_circle(g: Gull) -> void:
	var isl := g.home
	g.escort = null
	if g.raft != null:
		# wheel low over the flotsam, waiting for the ship to pass
		var at := _perch_world(g.raft)
		g.cx = at.x
		g.cz = at.z
		g.r = 9.0 + randf() * 8.0
		g.h = 8.0 + randf() * 6.0
		return
	var ir := float(isl.r)
	g.cx = float(isl.x) + (randf() - 0.5) * ir
	g.cz = float(isl.z) + (randf() - 0.5) * ir
	g.r = 16.0 + randf() * ir * 0.7
	g.h = maxf(14.0, float(isl.peak) * 0.8) + 5.0 + randf() * 16.0
	if randf() < 0.3:
		g.dir = -g.dir


func _free_shore(g: Gull) -> Perch:
	var best: Perch = null
	var bd := INF
	var hr := float(g.home.r)
	for p in _shore:
		if p.taken:
			continue
		var d := Vector2(p.local.x - float(g.home.x), p.local.z - float(g.home.z)).length() / hr + randf()
		if d < bd and d < 2.6:
			bd = d
			best = p
	return best


func _perches_of(ship: Ship) -> Array:
	var list: Variant = _ship_perches.get(ship)
	if list == null:
		list = []
		for q: Dictionary in ship.model.perches:
			var p := Perch.new()
			p.ship = ship
			p.spar = int(q.spar)
			p.local = q.pos
			list.append(p)
		_ship_perches[ship] = list
	return list


func _perch_ok(p: Perch) -> bool:
	var s := p.ship
	if s == null:
		return true
	if not is_instance_valid(s) or not s.alive or not s.visible:
		return false
	if p.spar == RAIL:
		return true
	var spars := s.model.spars
	var i := spars.size() - 1 if p.spar < 0 else p.spar
	return i < 0 or i >= spars.size() or not spars[i].broken


func _perch_world(p: Perch) -> Vector3:
	if p.spot != null:
		return p.spot.at
	if p.ship == null:
		return p.local
	return p.ship.model.global_transform * p.local


func _release(g: Gull) -> void:
	if g.perch != null:
		g.perch.taken = false
	g.perch = null
	g.water = null


## A gull comes to loaf on a patch of drifting flotsam: `spot` (a Drift.Spot)
## is where it stands, kept moving with the drift. False when every rider is
## already out.
func ride(spot: Object) -> bool:
	var g: Gull = null
	for o in _gulls:
		if o.kind == Kind.RIDER and o.mode == Mode.OFF:
			g = o
			break
	if g == null:
		return false
	var p := Perch.new()
	p.spot = spot
	p.taken = true
	g.raft = p
	g.perch = p
	g.water = null
	g.mode = Mode.PERCH
	g.t = 20.0 + randf() * 40.0
	g.pos = spot.at + Vector3(0.0, LEG, 0.0)
	g.vel = Vector3.ZERO
	g.yaw = randf() * TAU
	g.fold = 1.0
	g.legs = 1.0
	g.amp = 0.0
	g.life = 0.0
	g.off = Vector3.ZERO
	return true


## The flotsam under `spot` is gone: its gull flies off and leaves the stage.
func unride(spot: Object, wind: Wind) -> void:
	for g in _gulls:
		if g.raft == null or g.raft.spot != spot:
			continue
		g.raft = null
		g.life = 16.0
		if g.mode == Mode.PERCH:
			_take_off(g, wind)
		else:
			_release(g)


## True while the carrier is out on an errand.
func carrying() -> bool:
	return _carrier != null and _carrier.mode != Mode.OFF


## The carrier gull flies in from `from` (a Vector2, or null: upwind) with a
## scroll on her back, lands on the ship's rail, and `news` is told the moment
## her feet touch the wood. False if she is already out.
func carry(ship: Ship, wind: Wind, news: Callable, from: Variant = null) -> bool:
	var g := _carrier
	if g == null or g.mode != Mode.OFF or not ship.alive:
		return false
	var s := ship.model.shape
	var t := 0.3
	var top := s.top(t)
	var rail := Perch.new()
	rail.ship = ship
	rail.spar = RAIL
	rail.local = Vector3(s.half_width_at_y(t, top) - 0.07, top + 0.04, s.z(t))
	rail.taken = true
	var a := atan2(-wind.dir_x, -wind.dir_z)
	if from != null:
		a = atan2(from.x - ship.pos.x, from.y - ship.pos.z)
	a += (randf() - 0.5) * 0.6
	var d := 150.0 + randf() * 40.0
	g.pos = Vector3(ship.pos.x + sin(a) * d, 30.0 + randf() * 8.0, ship.pos.z + cos(a) * d)
	g.vel = Vector3(-sin(a) * 10.0, 0.0, -cos(a) * 10.0)
	g.yaw = a + PI
	g.fold = 0.0
	g.legs = 0.0
	g.raft = null
	g.water = null
	g.escort = null
	g.perch = rail
	g.mode = Mode.LAND
	g.t = 50.0
	g.news = news
	g.errand = true
	g.life = 0.0
	return true


## Called home: the carrier (and any riders) leave at once (a new voyage).
func recall() -> void:
	for g in _gulls:
		if g.kind == Kind.FLOCK:
			continue
		g.mode = Mode.OFF
		g.raft = null
		g.perch = null
		g.news = Callable()
		g.errand = false
	_ship_perches.clear()
	_guns_seen.clear()
	_dead.clear()


## Tells the carrier's news (once) and sends her about her business.
func _deliver(g: Gull) -> void:
	var f := g.news
	g.news = Callable()
	if f.is_valid():
		f.call()


## Decide what to do after a spell of soaring.
func _plan(g: Gull, ships: Array[Ship], wind: Wind) -> void:
	if g.kind != Kind.FLOCK:
		var raft := g.raft
		if raft == null:
			g.mode = Mode.OFF
			return
		# back down onto the flotsam once no hull is near it
		if not raft.taken and not _ship_near(ships, _perch_world(raft), 34.0):
			_start_landing(g, raft, null)
			return
		_new_circle(g)
		g.mode = Mode.SOAR
		g.t = 4.0 + randf() * 5.0
		return
	var r := randf()
	var near: Ship = null
	var nd := 150.0
	for s in ships:
		if not s.alive or not s.visible:
			continue
		var d := Vector2(s.pos.x - g.pos.x, s.pos.z - g.pos.z).length()
		if d < nd:
			nd = d
			near = s
	if near != null and r < 0.28:
		# tag along with a passing ship and wheel round her masts
		g.escort = near
		g.mode = Mode.SOAR
		g.t = 15.0 + randf() * 25.0
		g.r = near.cls.length * (0.45 + randf() * 0.5)
		g.h = float(near.cls.masts[0].height) + 6.0 + randf() * 10.0
		return
	if near != null and r < 0.5:
		var free: Array = _perches_of(near).filter(func(p: Perch) -> bool: return not p.taken and _perch_ok(p))
		if not free.is_empty():
			_start_landing(g, free.pick_random(), null)
			return
	if r < 0.72:
		var p := _free_shore(g)
		if p != null:
			_start_landing(g, p, null)
			return
	if r < 0.86:
		for k in 10:
			var a := randf() * TAU
			var d := float(g.home.r) * (0.9 + randf() * 0.6)
			var x := float(g.home.x) + cos(a) * d
			var z := float(g.home.z) + sin(a) * d
			if _ground.call(x, z) < -4.0:
				_start_landing(g, null, Vector3(x, 0.0, z))
				return
	_new_circle(g)
	g.mode = Mode.SOAR
	g.t = 10.0 + randf() * 25.0


func _start_landing(g: Gull, p: Perch, water: Variant) -> void:
	g.escort = null
	g.mode = Mode.LAND
	g.t = 40.0
	g.perch = p
	g.water = water
	if p != null:
		p.taken = true


func _take_off(g: Gull, wind: Wind) -> void:
	_release(g)
	g.mode = Mode.TAKEOFF
	g.t = 1.3 + randf() * 0.5
	# spring off into the wind
	var sp := 3.0 + randf()
	g.vel.x += -wind.dir_x * sp + sin(g.yaw) * 2.0
	g.vel.z += -wind.dir_z * sp + cos(g.yaw) * 2.0
	g.vel.y = 3.2
	g.phase = -0.6


static func _ship_near(ships: Array[Ship], at: Vector3, r: float) -> bool:
	for s in ships:
		if s.alive and Vector2(s.pos.x - at.x, s.pos.z - at.z).length() < r + s.cls.length * 0.5:
			return true
	return false


## Puts every gull near `at` to flight (the guns, a magazine going up).
func scare(at: Vector3, radius: float, world: World, ship: Ship = null) -> void:
	var shrieks := 0
	for g in _gulls:
		if g.mode == Mode.FLEE or g.mode == Mode.OFF or g.errand:
			continue
		var on_board := g.perch != null and ship != null and g.perch.ship == ship
		var d := Vector2(g.pos.x - at.x, g.pos.z - at.z).length()
		if not on_board and (d > radius * (0.7 + randf() * 0.3) or (g.mode == Mode.SOAR and randf() < 0.35)):
			continue
		var grounded := g.mode == Mode.PERCH or g.mode == Mode.FLOAT
		_release(g)
		g.escort = null
		g.mode = Mode.FLEE
		g.t = 2.6 + randf() * 2.0
		g.from = at
		if grounded:
			g.vel.y = 4.5
			g.phase = -0.6
		if shrieks < 3 and randf() < 0.5:
			shrieks += 1
			_cry(g, world, 1 + randi() % 3, 0.1 + randf() * 0.5)


func _cry(g: Gull, world: World, notes: int, delay := 0.0) -> void:
	if not visible or sound == null:
		return
	var h := world.heard(g.pos)
	if h.x < 0.18:
		return
	sound.gull(h.x * h.x, h.y, notes, delay)
	if g.mode == Mode.PERCH or g.mode == Mode.FLOAT:
		g.call = 0.35 * notes + 0.3


func update(dt: float, world: World, camera: Camera3D) -> void:
	if dt <= 0.0:
		# time stands still (a paused photo), but the camera may still roam
		_pack(camera)
		return
	_time += dt
	var time := _time
	var ships := world.ships
	var wind := world.wind

	# the guns (and a magazine going up) put every gull nearby to flight
	for s in ships:
		var last := -100.0
		for t in s.gun_fired_at:
			last = maxf(last, t)
		var seen: float = _guns_seen.get(s, -100.0)
		if last > seen:
			_guns_seen[s] = last
			scare(s.pos, SCARE_GUNS, world, s)
		if not s.alive and not _dead.has(s):
			_dead[s] = true
			scare(s.pos, SCARE_BOOM, world, s)

	# a gull somewhere within earshot calls now and then
	_cry_clock -= dt
	if _cry_clock < 0.0:
		_cry_clock = 3.0 + randf() * 9.0
		var g: Gull = _gulls.pick_random()
		if g.mode != Mode.FLEE and g.mode != Mode.OFF:
			_cry(g, world, 3 + randi() % 3 if randf() < 0.3 else 1 + randi() % 2)

	var upwind := atan2(-wind.dir_x, -wind.dir_z)
	for g in _gulls:
		if g.mode == Mode.OFF:
			continue
		g.t -= dt
		# a rider without its flotsam, or the carrier with her errand run, flies off and away
		if g.kind != Kind.FLOCK and g.raft == null and not g.errand:
			g.life -= dt
			if g.life < 0.0:
				_release(g)
				g.mode = Mode.OFF
				continue
		var amp_t := 0.0
		var fold_t := 0.0
		var legs_t := 0.0
		var dih_t := 0.12
		var tail_t := 0.0
		var rate := 13.0
		var flying := true
		var pitch_t := 0.0
		var bank_t := 0.0
		var head_t := 0.0
		var nod_t := 0.0
		var gust := wind.gust_at(g.pos.x, g.pos.z)

		if (g.perch != null and not _perch_ok(g.perch)) or (g.escort != null and (not is_instance_valid(g.escort) or not g.escort.alive or not g.escort.visible)):
			if g.errand:
				# her ship is gone: the news goes back where it came from
				g.news = Callable()
				g.errand = false
				g.life = 12.0
			if g.mode == Mode.PERCH:
				_take_off(g, wind)
			else:
				_release(g)
				g.escort = null
				if g.mode == Mode.LAND:
					_new_circle(g)
					g.mode = Mode.SOAR
					g.t = 8.0 + randf() * 10.0

		var hs := Vector2(g.vel.x, g.vel.z).length()
		var want := Vector3.ZERO
		var acc := 7.0

		match g.mode:
			Mode.SOAR:
				if g.escort != null:
					g.cx = g.escort.pos.x + g.escort.vel.x * 1.2
					g.cz = g.escort.pos.z + g.escort.vel.z * 1.2
				elif g.raft != null:
					var at := _perch_world(g.raft)
					g.cx = at.x
					g.cz = at.z
				else:
					# circles drift downwind like thermals, then the gull works back upwind
					g.cx += wind.dir_x * 0.7 * dt
					g.cz += wind.dir_z * 0.7 * dt
				var dx := g.pos.x - g.cx
				var dz := g.pos.z - g.cz
				var d := maxf(0.1, Vector2(dx, dz).length())
				var err := clampf((d - g.r) / g.r, -1.0, 1.0) * 1.6
				var sp := 9.0 + gust * 2.5 + (minf(g.escort.speed, 9.0) * 0.6 if g.escort != null else 0.0)
				want = Vector3(-dz / d * g.dir - dx / d * err, 0.0, dx / d * g.dir - dz / d * err).normalized() * sp
				var floor_y: float = _ground.call(g.pos.x + g.vel.x * 2.0, g.pos.z + g.vel.z * 2.0) + 8.0
				var h_t := maxf(g.h + sin(time * 0.31 + g.seed) * 3.0, floor_y)
				want.y = clampf((h_t - g.pos.y) * 0.6, -2.2, 3.2)
				if g.escort != null:
					want += Vector3(g.escort.vel.x, 0.0, g.escort.vel.z) * 0.8
				# mostly gliding, with a burst of wingbeats every so often
				g.burst_clock -= dt
				if g.burst_clock < 0.0:
					g.burst = 0.9 + randf() * 1.8
					g.burst_clock = 4.0 + randf() * 8.0
				g.burst -= dt
				var need := clampf(want.y * 0.35 + (sp - hs) * 0.25, 0.0, 1.0)
				amp_t = maxf(0.62 if g.burst > 0.0 else 0.0, need * 0.7)
				dih_t = 0.14 + gust * 0.08 * sin(time * 5.3 + g.seed)
				head_t = -g.bank * 0.5
				if g.t < 0.0:
					_plan(g, ships, wind)
			Mode.LAND:
				var tgt: Vector3
				if g.perch != null:
					tgt = _perch_world(g.perch) + Vector3(0.0, LEG, 0.0)
				else:
					var wv: Vector3 = g.water
					tgt = Vector3(wv.x, world.water_height(wv.x, wv.z) + 0.05 * S, wv.z)
				var dx := tgt.x - g.pos.x
				var dz := tgt.z - g.pos.z
				var dh := Vector2(dx, dz).length()
				var d3 := Vector2(dh, tgt.y - g.pos.y).length()
				var sp := clampf(dh * 0.65, 1.4, 10.0)
				want = Vector3(dx / maxf(dh, 0.01) * sp, 0.0, dz / maxf(dh, 0.01) * sp)
				if g.perch != null and g.perch.ship != null:
					want += Vector3(g.perch.ship.vel.x, 0.0, g.perch.ship.vel.z)
				# glide down a slope that steepens into a flare over the spot
				var above := minf(dh * 0.3, 14.0) if dh > 8.0 else dh * 0.16
				var floor_y: float = _ground.call(g.pos.x + g.vel.x * 2.0, g.pos.z + g.vel.z * 2.0) + 6.0 if dh > 14.0 else -INF
				want.y = clampf((maxf(tgt.y + above, floor_y) - g.pos.y) * 1.3, -4.0, 3.0)
				acc = 10.0 if dh < 10.0 else 7.0
				var flare := MathX.smooth(9.0, 2.0, dh)
				amp_t = maxf(flare * 0.9, clampf(want.y * 0.3, 0.0, 0.7))
				rate = lerpf(13.0, 19.0, flare)
				dih_t = lerpf(0.14, 0.55, flare)
				tail_t = flare
				legs_t = MathX.smooth(7.0, 2.5, dh) if g.perch != null else 0.0
				pitch_t = -0.55 * flare
				if d3 < 0.45 * S or (dh < 0.6 and g.pos.y < tgt.y + 0.5):
					g.mode = Mode.PERCH if g.perch != null else Mode.FLOAT
					g.t = 8.0 + randf() * 40.0 if g.perch != null else 10.0 + randf() * 35.0
					g.off = g.pos - tgt
					g.vel = Vector3.ZERO
					g.call = 0.0
					if g.errand:
						# feet on the rail: a long call to say she's here, and the news is told
						g.t = 7.5
						_cry(g, world, 4)
						g.call = 1.6
						_deliver(g)
					elif g.raft != null:
						g.t = 25.0 + randf() * 40.0
				elif g.errand and g.t < 0.0:
					# she never caught the ship up: the news is shouted down from the sky
					_deliver(g)
					g.errand = false
					g.life = 12.0
					_release(g)
					_new_circle(g)
					g.mode = Mode.SOAR
					g.t = 10.0
				elif g.t < 0.0:
					_release(g)
					_new_circle(g)
					g.mode = Mode.SOAR
					g.t = 10.0
			Mode.PERCH, Mode.FLOAT:
				flying = false
				fold_t = 1.0
				legs_t = 1.0 if g.mode == Mode.PERCH else 0.0
				if g.mode == Mode.PERCH:
					g.off *= 1.0 - MathX.damp(9.0, dt)
					g.pos = _perch_world(g.perch) + Vector3(0.0, LEG, 0.0) + g.off
					pitch_t = 0.06
				else:
					var wv: Vector3 = g.water
					var x := wv.x + wind.dir_x * 0.25 * dt
					var z := wv.z + wind.dir_z * 0.25 * dt
					g.water = Vector3(x, 0.0, z)
					var y := world.water_height(x, z)
					g.pos = Vector3(lerpf(g.pos.x, x, MathX.damp(8.0, dt)), lerpf(g.pos.y, y + 0.05 * S, MathX.damp(10.0, dt)), lerpf(g.pos.z, z, MathX.damp(8.0, dt)))
					# ride the swell: tilt with the water under it
					var fx := sin(g.yaw) * 0.5
					var fz := cos(g.yaw) * 0.5
					pitch_t = (world.water_height(x + fx, z + fz) - world.water_height(x - fx, z - fz)) * -0.9
					bank_t = (world.water_height(x + fz, z - fx) - y) * 1.2
					for s in ships:
						if s.alive and Vector2(s.pos.x - x, s.pos.z - z).length() < s.cls.length * 0.6 + 8.0:
							g.t = 0.0
							break
				# a hull bearing down on the flotsam puts its gull up
				if g.raft != null and g.mode == Mode.PERCH and _ship_near(ships, g.pos, 22.0):
					g.t = minf(g.t, randf() * 0.4)
				# face into the wind, looking about (the carrier looks aft, along her ship, at whoever reads her news)
				var face := g.perch.ship.heading + PI - 0.5 if g.errand and g.perch != null and g.perch.ship != null else upwind + sin(g.seed) * 0.5
				g.yaw += MathX.angle_delta(g.yaw, face) * MathX.damp(1.2, dt)
				g.head_clock -= dt
				if g.head_clock < 0.0:
					g.head_clock = 0.6 + randf() * 2.4
					g.head_t = 0.0 if randf() < 0.3 else (randf() - 0.5) * 2.2
				head_t = g.head_t
				nod_t = 0.1 + sin(time * 1.7 + g.seed) * 0.05
				if g.call > 0.0:
					# the long call: head thrown back, beak to the sky
					g.call -= dt
					head_t = 0.0
					nod_t = -0.7 * MathX.smooth(0.0, 0.25, g.call)
				elif randf() < dt * 0.04:
					_cry(g, world, 2 + randi() % 4)
				# a lazy wing stretch now and then
				if sin(time * 0.23 + g.seed * 7.0) > 0.985:
					fold_t = 0.35
					dih_t = 0.9
				if g.t < 0.0:
					if g.errand:
						g.errand = false
						g.life = 14.0
					_take_off(g, wind)
			Mode.TAKEOFF:
				want = Vector3(sin(g.yaw) * 8.0, 3.0, cos(g.yaw) * 8.0)
				acc = 9.0
				amp_t = 1.0
				rate = 19.0
				dih_t = 0.3
				tail_t = 0.5
				pitch_t = -0.3
				if g.t < 0.0:
					g.mode = Mode.SOAR
					g.t = 8.0 + randf() * 18.0
					_new_circle(g)
			Mode.FLEE:
				var dx := g.pos.x - g.from.x
				var dz := g.pos.z - g.from.z
				var d := maxf(0.1, Vector2(dx, dz).length())
				var wob := sin(time * 2.3 + g.seed) * 0.5
				var ax := dx / d
				var az := dz / d
				want = Vector3(ax * cos(wob) - az * sin(wob), 0.0, az * cos(wob) + ax * sin(wob)) * 13.0
				want.y = 5.0
				acc = 13.0
				amp_t = 1.0
				rate = 20.0
				dih_t = 0.2
				if g.t < 0.0:
					g.mode = Mode.SOAR
					g.t = 10.0 + randf() * 15.0
					_new_circle(g)
					g.h += 6.0

		if flying:
			# steer: ease the velocity toward the wish, limited like real wing loading
			var v := (want - g.vel) * 1.6
			var ah := Vector2(v.x, v.z).length()
			if ah > acc:
				v.x *= acc / ah
				v.z *= acc / ah
			v.y = clampf(v.y, -6.0, 8.0)
			# a gust lifts and rocks it
			v.y += gust * sin(time * 3.1 + g.seed * 3.0) * 1.5
			g.vel += v * dt
			g.pos += g.vel * dt
			var sp := Vector2(g.vel.x, g.vel.z).length()
			if sp > 0.4:
				g.yaw += MathX.angle_delta(g.yaw, atan2(g.vel.x, g.vel.z)) * MathX.damp(6.0, dt)
			var lat := (g.vel.z * v.x - g.vel.x * v.z) / maxf(sp, 1.0)
			bank_t = clampf(-atan(lat / 9.8) * 1.4, -1.0, 1.0) + gust * sin(time * 6.7 + g.seed) * 0.12
			pitch_t += clampf(-atan2(g.vel.y, maxf(sp, 1.0)) * 0.6, -0.45, 0.45)
			# a strong climb or a slow crawl through the air needs wingbeats
			amp_t = maxf(amp_t, clampf((g.vel.y - 1.0) * 0.25, 0.0, 0.8))

		# ease the rig toward this frame's pose
		var k := MathX.damp(5.0 if flying else 8.0, dt)
		g.amp = lerpf(g.amp, amp_t, MathX.damp(4.0, dt))
		g.fold = lerpf(g.fold, fold_t, MathX.damp(5.0 if fold_t > g.fold else 9.0, dt))
		g.legs = lerpf(g.legs, legs_t, MathX.damp(4.0, dt))
		g.dih = lerpf(g.dih, dih_t, MathX.damp(5.0, dt))
		g.tail = lerpf(g.tail, tail_t, MathX.damp(5.0, dt))
		g.head = lerpf(g.head, head_t, MathX.damp(6.0, dt))
		g.nod = lerpf(g.nod, nod_t, MathX.damp(8.0, dt))
		g.bank = lerpf(g.bank, bank_t, k)
		g.pitch = lerpf(g.pitch, pitch_t, k)
		# keep beating through the stroke while gliding settles the wings level
		g.phase = fmod(g.phase + dt * rate * (0.3 + 0.7 * minf(1.0, g.amp * 2.0)), TAU)
	_pack(camera)


## Only the gulls in view (or casting a shadow into it) go to the GPU,
## packed to the front; a speck past the fog's reach is left out too.
func _pack(camera: Camera3D) -> void:
	var c := _carrier
	if c != null and c.news.is_valid() and c.mode != Mode.OFF:
		_scroll.set_instance_transform(0, _xf(c))
		_scroll.visible_instance_count = 1
	else:
		_scroll.visible_instance_count = 0
	var n := 0
	if camera != null and visible:
		var cam := camera.global_position
		var planes := camera.get_frustum()
		for g in _gulls:
			if g.mode == Mode.OFF:
				continue
			# the shadow can land well to the side of a high gull: the sphere grows with height
			var rad := 2.0 + maxf(0.0, g.pos.y) * 1.6
			if g.pos.distance_squared_to(cam) > GULL_FAR * GULL_FAR:
				continue
			var inside := true
			for pl in planes:
				if pl.distance_to(g.pos) > rad:
					inside = false
					break
			if not inside:
				continue
			_mm.set_instance_transform(n, _xf(g))
			_mm.set_instance_color(n, Color(g.phase, g.amp, g.fold, g.legs))
			_mm.set_instance_custom_data(n, Color(g.dih, g.head, g.tail, g.nod))
			n += 1
	_mm.visible_instance_count = n
	drawn = n


static func _xf(g: Gull) -> Transform3D:
	return Transform3D(Basis.from_euler(Vector3(g.pitch, g.yaw, g.bank)).scaled_local(Vector3(S, S, S)), g.pos)


# ------------------------------------------------------------------ sculpt

class _Kit:
	var pos := PackedVector3Array()
	var fold := PackedVector3Array()
	var rig := PackedFloat32Array()
	var col := PackedColorArray()
	var idx := PackedInt32Array()

	func vert(p: Vector3, c: Color, r := Vector4.ZERO, f: Variant = null) -> int:
		pos.append(p)
		fold.append(p if f == null else f)
		rig.append_array([r.x, r.y, r.z, r.w])
		col.append(c)
		return pos.size() - 1

	## A triangle wound to face out, away from a point inside its part (Godot's front faces turn clockwise).
	func tri(a: int, b: int, c: int, inside: Vector3) -> void:
		var g := (pos[a] + pos[b] + pos[c]) / 3.0 - inside
		var n := (pos[b] - pos[a]).cross(pos[c] - pos[a])
		if n.dot(g) < 0.0:
			idx.append_array([a, b, c])
		else:
			idx.append_array([a, c, b])

	func quad(a: int, b: int, c: int, d: int, inside: Vector3) -> void:
		tri(a, b, c, inside)
		tri(a, c, d, inside)

	func commit() -> ArrayMesh:
		# smooth normals, area-weighted, from the faces round each vertex
		var nrm := PackedVector3Array()
		nrm.resize(pos.size())
		for i in range(0, idx.size(), 3):
			var a := idx[i]
			var b := idx[i + 1]
			var c := idx[i + 2]
			# clockwise front faces: the outward normal is (c - a) x (b - a)
			var n := (pos[c] - pos[a]).cross(pos[b] - pos[a])
			nrm[a] += n
			nrm[b] += n
			nrm[c] += n
		var c0 := PackedFloat32Array()
		var c1 := PackedFloat32Array()
		var c2 := PackedFloat32Array()
		for i in pos.size():
			nrm[i] = nrm[i].normalized() if nrm[i].length_squared() > 1e-14 else Vector3.UP
			c0.append_array([col[i].r, col[i].g, col[i].b, rig[i * 4 + 3]])
			c1.append_array([fold[i].x, fold[i].y, fold[i].z, 0.0])
			c2.append_array([rig[i * 4], rig[i * 4 + 1], rig[i * 4 + 2], 0.0])
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = pos
		arrays[Mesh.ARRAY_NORMAL] = nrm
		arrays[Mesh.ARRAY_CUSTOM0] = c0
		arrays[Mesh.ARRAY_CUSTOM1] = c1
		arrays[Mesh.ARRAY_CUSTOM2] = c2
		arrays[Mesh.ARRAY_INDEX] = idx
		var flags := 0
		for k: int in [Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT, Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT, Mesh.ARRAY_FORMAT_CUSTOM2_SHIFT]:
			flags |= Mesh.ARRAY_CUSTOM_RGBA_FLOAT << k
		var m := ArrayMesh.new()
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, flags)
		return m


static func _sm(e0: float, e1: float, x: float) -> float:
	return MathX.smooth(e0, e1, x)


## The gull, a unit bird (the instance scales it by S): body, neck and head
## lofted in one, the hooked beak, the eyes, the two airfoil wings (with
## where each point lies folded back along the flank), the tail fan, and the
## pink legs that tuck up under the belly in flight.
static func gull_mesh() -> ArrayMesh:
	var k := _Kit.new()
	var white := Color(0.93, 0.93, 0.91)
	var mantle := Color(0.3, 0.34, 0.41)
	var black := Color(0.06, 0.06, 0.07)
	var yellow := Color(0.98, 0.72, 0.12)
	var red := Color(0.85, 0.12, 0.06)
	var pink := Color(0.86, 0.55, 0.47)
	var head := Vector4(0, 0, 1, 0)

	# body + neck + head: one smooth loft along z (tail -z, beak +z): z, half-width, half-height, centre y
	var rings := [
		[-0.3, 0.022, 0.016, 0.02], [-0.22, 0.048, 0.038, 0.016], [-0.12, 0.074, 0.064, 0.006],
		[0.0, 0.088, 0.08, 0.0], [0.1, 0.082, 0.075, 0.006], [0.18, 0.056, 0.056, 0.022],
		[0.235, 0.044, 0.047, 0.045], [0.285, 0.054, 0.055, 0.062], [0.335, 0.05, 0.05, 0.064],
		[0.375, 0.031, 0.033, 0.058], [0.397, 0.014, 0.016, 0.052],
	]
	const N := 8
	var ring_ids: Array = []
	for rg: Array in rings:
		var z: float = rg[0]
		var hw := _sm(0.17, 0.26, z)
		var ids: Array[int] = []
		for j in N:
			var a := float(j) / N * TAU
			var sx := sin(a)
			var cy := cos(a)
			var y: float = rg[3] + cy * rg[2] * (0.9 if cy < 0.0 else 1.0) # flatter belly
			var back := cy > 0.3 and z > -0.2 and z < 0.14
			ids.append(k.vert(Vector3(sx * rg[1], y, z), mantle if back else white, Vector4(0, 0, hw, 0)))
		ring_ids.append(ids)
	for r in rings.size() - 1:
		var inside := Vector3(0.0, (rings[r][3] + rings[r + 1][3]) * 0.5, (rings[r][0] + rings[r + 1][0]) * 0.5)
		for j in N:
			var j2 := (j + 1) % N
			k.quad(ring_ids[r][j], ring_ids[r][j2], ring_ids[r + 1][j2], ring_ids[r + 1][j], inside)
	var tail_tip := k.vert(Vector3(0, 0.02, -0.32), white)
	var nose_tip := k.vert(Vector3(0, 0.052, 0.402), yellow, head)
	var last: Array = ring_ids[rings.size() - 1]
	for j in N:
		k.tri(ring_ids[0][j], ring_ids[0][(j + 1) % N], tail_tip, Vector3(0, 0.02, -0.28))
		k.tri(last[j], last[(j + 1) % N], nose_tip, Vector3(0, 0.052, 0.38))

	# hooked yellow beak with the red gonys spot
	var top := k.vert(Vector3(0, 0.066, 0.392), yellow, head)
	var bl := k.vert(Vector3(0.015, 0.05, 0.392), yellow, head)
	var br := k.vert(Vector3(-0.015, 0.05, 0.392), yellow, head)
	var bot := k.vert(Vector3(0, 0.036, 0.392), yellow, head)
	var gonys := k.vert(Vector3(0, 0.033, 0.452), red, head)
	var tip := k.vert(Vector3(0, 0.043, 0.498), yellow, head)
	var bin := Vector3(0, 0.05, 0.43)
	k.tri(top, bl, tip, bin)
	k.tri(top, br, tip, bin)
	k.tri(bl, gonys, tip, bin)
	k.tri(br, gonys, tip, bin)
	k.tri(bl, bot, gonys, bin)
	k.tri(br, bot, gonys, bin)
	# beady eyes
	for s: float in [1.0, -1.0]:
		var c := Vector3(s * 0.043, 0.074, 0.312)
		var e := 0.011
		var ids := [
			k.vert(c + Vector3(s * e, 0, 0), black, head), k.vert(c + Vector3(0, e, 0), black, head),
			k.vert(c + Vector3(0, 0, e), black, head), k.vert(c + Vector3(0, -e, 0), black, head),
			k.vert(c + Vector3(0, 0, -e), black, head),
		]
		var inside := c - Vector3(s * e, 0, 0)
		for j in range(1, 5):
			k.tri(ids[0], ids[j], ids[(j % 4) + 1], inside)

	# wings: an airfoil slab per side, the hand swept back to a long pointed tip.
	# Each station: span s, leading edge z, trailing edge z, thickness.
	var st := [
		[0.05, 0.16, -0.13, 0.055], [0.2, 0.17, -0.14, 0.04], [0.4, 0.16, -0.12, 0.03],
		[0.54, 0.11, -0.11, 0.024], [0.66, 0.06, -0.115, 0.018], [0.77, 0.0, -0.12, 0.013],
		[0.87, -0.08, -0.13, 0.006],
	]
	var wy := 0.035
	for sgn: float in [1.0, -1.0]:
		var ids: Array = []
		for w: Array in st:
			var s: float = w[0]
			var zl: float = w[1]
			var zt: float = w[2]
			var th: float = w[3]
			var zm := zl * 0.62 + zt * 0.38
			var hand := s > 0.62
			var wtip := s > 0.72
			var top_c := black if hand else (Color(0.2, 0.22, 0.26) if s > 0.5 else mantle)
			# white trailing edge, a white "mirror" near the tip
			var te_c := (white if s < 0.8 else black) if wtip else (black if hand else white)
			var bot_c := Color(0.2, 0.2, 0.22) if hand else white
			var r := Vector4(_sm(0.03, 0.12, s), _sm(0.36, 0.45, s), 0, 0)
			# folded: the wing laid back along the flank, the black tips crossing over the tail
			var u := (s - 0.05) / 0.82
			var fx := sgn * (0.088 - 0.1 * pow(u, 1.5))
			var fy := 0.058 + 0.012 * (1.0 - u) + (0.005 * u if sgn > 0.0 else 0.0)
			var fz := 0.12 - u * 0.6
			var pts := [[zl, 0.0], [zm, th / 2.0], [zt, 0.0], [zm, -th / 2.0]]
			var cols := [top_c, top_c, te_c, bot_c]
			var ring: Array[int] = []
			for q in 4:
				var z: float = pts[q][0]
				var t: float = pts[q][1]
				var cc := z - (zl + zt) / 2.0
				ring.append(k.vert(Vector3(sgn * s, wy + t, z), cols[q], r, Vector3(fx + sgn * cc * 0.32, fy - cc * 0.22 + t, fz + cc * 0.1)))
			ids.append(ring)
		for i in st.size() - 1:
			var inside := Vector3(sgn * (st[i][0] + st[i + 1][0]) / 2.0, wy, (st[i][1] + st[i][2] + st[i + 1][1] + st[i + 1][2]) / 4.0)
			for q in 4:
				k.quad(ids[i][q], ids[i][(q + 1) % 4], ids[i + 1][(q + 1) % 4], ids[i + 1][q], inside)
		var lst: Array = ids[st.size() - 1]
		var n0: Array = st[st.size() - 1]
		k.quad(lst[0], lst[1], lst[2], lst[3], Vector3(sgn * (n0[0] - 0.02), wy, (n0[1] + n0[2]) / 2.0))
		var f0: Array = ids[0]
		k.quad(f0[0], f0[1], f0[2], f0[3], Vector3(sgn * (st[0][0] + 0.02), wy, (st[0][1] + st[0][2]) / 2.0))

	# tail: a short fan that spreads to brake on landing
	var tw := Vector4(0, 0, 0, -1)
	var tth := 0.009
	var fans: Array = []
	for y: float in [0.02 + tth, 0.02 - tth]:
		fans.append([
			k.vert(Vector3(0.034, y, -0.2), white, tw), k.vert(Vector3(0.064, y, -0.365), white, tw),
			k.vert(Vector3(0, y, -0.39), white, tw), k.vert(Vector3(-0.064, y, -0.365), white, tw),
			k.vert(Vector3(-0.034, y, -0.2), white, tw),
		])
	var tin := Vector3(0, 0.02, -0.3)
	for f: Array in fans:
		k.tri(f[0], f[1], f[2], tin)
		k.tri(f[0], f[2], f[4], tin)
		k.tri(f[4], f[2], f[3], tin)
	for q in 4:
		k.quad(fans[0][q], fans[0][q + 1], fans[1][q + 1], fans[1][q], tin)

	# pink legs and webbed feet; tucked back under the belly in flight
	var lw := Vector4(0, 0, 0, 1)
	for s: float in [1.0, -1.0]:
		var hip := Vector3(s * 0.032, -0.05, -0.02)
		var ank := Vector3(s * 0.036, -0.192, 0.0)
		var hip_f := Vector3(s * 0.03, -0.05, -0.04)
		var ank_f := Vector3(s * 0.028, -0.062, -0.15)
		var w := 0.008
		var leg: Array[int] = []
		for pr: Array in [[hip, hip_f], [ank, ank_f]]:
			var p: Vector3 = pr[0]
			var f: Vector3 = pr[1]
			for j in 4:
				var a := float(j) / 4.0 * TAU
				var o := Vector3(cos(a) * w, 0.0, sin(a) * w)
				leg.append(k.vert(p + o, pink, lw, Vector3(f.x + o.x, f.y + o.z * 0.5, f.z)))
		var leg_in := Vector3(s * 0.034, -0.12, -0.01)
		for j in 4:
			k.quad(leg[j], leg[(j + 1) % 4], leg[4 + (j + 1) % 4], leg[4 + j], leg_in)
		# foot: three toes splayed forward with the web between
		var y := -0.203
		var foot := [
			k.vert(Vector3(ank.x, y + 0.008, ank.z - 0.01), pink, lw, Vector3(ank_f.x, ank_f.y, ank_f.z - 0.01)),
			k.vert(Vector3(ank.x + s * 0.035, y, ank.z + 0.06), pink, lw, Vector3(ank_f.x + s * 0.012, ank_f.y, ank_f.z - 0.05)),
			k.vert(Vector3(ank.x, y, ank.z + 0.075), pink, lw, Vector3(ank_f.x, ank_f.y - 0.004, ank_f.z - 0.06)),
			k.vert(Vector3(ank.x - s * 0.03, y, ank.z + 0.06), pink, lw, Vector3(ank_f.x - s * 0.012, ank_f.y, ank_f.z - 0.05)),
		]
		var foot_in := Vector3(ank.x, y + 0.03, ank.z + 0.03)
		k.tri(foot[0], foot[1], foot[2], foot_in)
		k.tri(foot[0], foot[2], foot[3], foot_in)
		var sole: Array[int] = []
		for i: int in foot:
			sole.append(k.vert(Vector3(k.pos[i].x, y - 0.004, k.pos[i].z), pink, lw, k.fold[i] - Vector3(0, 0.004, 0)))
		var sole_in := Vector3(ank.x, y + 0.02, ank.z + 0.03)
		k.tri(sole[0], sole[1], sole[2], sole_in)
		k.tri(sole[0], sole[2], sole[3], sole_in)
	return k.commit()


## The scroll tied across the carrier's back with a red ribbon (gull model
## space, behind the shoulders): drawn with the gull's own shader, unrigged.
static func scroll_mesh() -> ArrayMesh:
	var k := _Kit.new()
	var o := Vector3(0.0, 0.094, -0.035)
	var paper := Color(0.93, 0.85, 0.66)
	var ends := Color(0.78, 0.68, 0.5)
	var ribbon := Color(0.78, 0.1, 0.08)
	# the roll and its band: tubes along x
	for part: Array in [[0.026, 0.065, paper, true], [0.029, 0.012, ribbon, false]]:
		var rr: float = part[0]
		var hl: float = part[1]
		var rim: Array[int] = []
		for e: float in [-1.0, 1.0]:
			for j in 10:
				var a := float(j) / 10.0 * TAU
				rim.append(k.vert(o + Vector3(e * hl, cos(a) * rr, sin(a) * rr), part[2]))
		for j in 10:
			k.quad(rim[j], rim[(j + 1) % 10], rim[10 + (j + 1) % 10], rim[10 + j], o)
		if part[3]:
			for e in 2:
				var c := k.vert(o + Vector3((e * 2 - 1) * hl, 0, 0), ends)
				var cap: Array[int] = []
				for j in 10:
					var a := float(j) / 10.0 * TAU
					cap.append(k.vert(o + Vector3((e * 2 - 1) * hl, cos(a) * rr, sin(a) * rr), ends))
				for j in 10:
					k.tri(c, cap[j], cap[(j + 1) % 10], o)
	# the ribbon's tails trail back over the rump
	for s: float in [-1.0, 1.0]:
		var b := Basis(Vector3.UP, s * 0.25)
		var c := o + Vector3(s * 0.012, 0.018, -0.045)
		var hx := 0.006
		var hy := 0.002
		var hz := 0.035
		var v: Array[int] = []
		for corner in 8:
			var p := Vector3(hx if corner & 1 else -hx, hy if corner & 2 else -hy, hz if corner & 4 else -hz)
			v.append(k.vert(c + b * p, ribbon))
		for f: Array in [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]:
			k.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], c)
	return k.commit()
