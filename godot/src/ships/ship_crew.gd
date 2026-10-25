class_name ShipCrew
extends RefCounted
## One ship's crew, and the deck they know (ship-local metres, +z to the bow,
## +x to port): where it runs, how wide, how high its planks sit and what
## stands on it. They read what their ship is doing. They man the guns on
## the side the enemy is on, sponge, load and ram in time with the real
## reload, touch off each gun as it fires and stagger from the recoil; haul
## on the lines when the canvas is trimmed or the yards swing across; swab,
## coil, lounge, gossip, fiddle and dance in quiet water; duck when a ball
## strikes home, roar at a kill, fight fires with buckets, and when she
## founders make for the high side and go over while the captain salutes and
## goes down with her. The web game's ShipCrew (src/ships/crew.ts).

## Samples along a deck zone of its planks' height and width.
const ZONE_SAMPLES := 40


## A stretch of deck at one level: the main deck, or a castle's.
class Zone:
	var t0 := 0.0
	var t1 := 1.0
	var _y := PackedFloat32Array()
	var _hw := PackedFloat32Array()

	func _init(shape: HullShape, a: float, b: float, lift: float) -> void:
		t0 = a
		t1 = b
		for i in ZONE_SAMPLES:
			var t := lerpf(a, b, i / float(ZONE_SAMPLES - 1))
			var y := shape.sheer(t) - shape.c.bulwark + lift
			_y.append(y)
			# where a sailor can stand, a hand's breadth in from the bulwark
			_hw.append(maxf(0.3, shape.half_width_at_y(t, y) - 0.14))

	func _at(arr: PackedFloat32Array, t: float) -> float:
		var u := clampf((t - t0) / (t1 - t0), 0.0, 1.0) * (ZONE_SAMPLES - 1)
		var i := mini(int(u), ZONE_SAMPLES - 2)
		return lerpf(arr[i], arr[i + 1], u - i)

	## The planks' height at t.
	func y(t: float) -> float:
		return _at(_y, t)

	## How far out from the centreline a sailor can stand at t.
	func half_width(t: float) -> float:
		return _at(_hw, t)


## Where a gun crew stands to serve a gun, beside its breech.
class GunPost:
	var muzzle := 0
	var side := 1
	var x := 0.0
	var z := 0.0
	var t := 0.0


## A pin rail to haul on, by a mast.
class Haul:
	var x := 0.0
	var z := 0.0
	var side := 1
	var zone: Zone


var ship: Ship
var shape: HullShape
var L := 15.0
var main: Zone
var quarter: Zone
var fore: Zone
var helm_zone: Zone
## What stands on the deck, as (x, z, radius).
var obstacles := PackedVector3Array()
## The barrels a hand may sit on (obstacle indices).
var seats := PackedInt32Array()
var posts: Array[GunPost] = []
var hauls: Array[Haul] = []
## Where the helmsman stands (x, z), and the hatch the powder comes up.
var helm := Vector2.ZERO
var hatch := Vector2.ZERO
var sailors: Array[Sailor] = []
## Off screen the crew thinks every few frames: the time it's owed, and frames since.
var lag := 0.0
var skipped := 0
var battle := false
var enemy: Ship
var enemy_dist := 1e9
## The beam the guns are manned on (+1 port, -1 starboard).
var gun_side := 1
var last_fire := -100.0
## When each broadside last went (port, starboard).
var volley_at := PackedFloat32Array([-100.0, -100.0])
## Ship-local "world up": people stand against the roll instead of with the deck.
var upright := Quaternion.IDENTITY
var rng := RandomNumberGenerator.new()

var _prev_reload := PackedFloat32Array([0.0, 0.0])
var _last_hit := -100.0
var _kills := 0
var _dead_seen := false


## Her crew comes aboard; `take_row` hands each a palette row for his look
## (-1 when the sea is full). `lean` (phones) ships one deck hand fewer.
func _init(p_ship: Ship, take_row: Callable, lean: bool) -> void:
	ship = p_ship
	shape = ship.model.shape
	var c := ship.cls
	L = c.length
	rng.seed = hash(ship.name) ^ 0x5eed
	var m := 0.75 / L
	var sc := c.stern_castle
	var fc := c.fore_castle
	main = Zone.new(shape, float(sc.t) + m if not sc.is_empty() else 0.07, float(fc.t) - m if not fc.is_empty() else 0.86, 0.0)
	if not sc.is_empty():
		quarter = Zone.new(shape, 0.045, float(sc.t) - m, float(sc.h))
	if not fc.is_empty():
		fore = Zone.new(shape, float(fc.t) + m, 0.92, float(fc.h))
	_kills = ship.kills

	# what's on deck (ShipModel's layout)
	var B := c.beam
	for i in c.masts.size():
		var mast: Dictionary = c.masts[i]
		var mz := shape.z(float(mast.t))
		obstacles.append(Vector3(0.0, mz, 0.12 + float(mast.height) * 0.0085 + 0.16))
		_seat(Vector3(B * 0.24, mz - 0.9, 0.36))
		_seat(Vector3(B * 0.27, mz - 0.3, 0.36))
		if i % 2 == 0:
			obstacles.append(Vector3(-B * 0.24, mz - 0.8, 0.48))
		else:
			_seat(Vector3(-B * 0.26, mz + 0.7, 0.36))
		obstacles.append(Vector3(-B * 0.1, mz + 0.9, 0.32))
	obstacles.append(Vector3(B * 0.2, shape.z(0.86), 0.42))
	obstacles.append_array(ship.model.deck_props)
	var wt := float(sc.t) * 0.55 if not sc.is_empty() else 0.16
	obstacles.append(Vector3(0.0, shape.z(wt) - 0.06, 0.66))
	helm = Vector2(0.0, shape.z(wt) - 0.66)
	helm_zone = quarter if quarter != null else main
	var cap_t := 0.53
	var cap_z := shape.z(cap_t)
	for mast: Dictionary in c.masts:
		if absf(float(mast.t) - cap_t) < 0.05:
			cap_z += 1.6
			break
	obstacles.append(Vector3(0.0, cap_z, 0.9))
	if c.id == "galleon":
		for k in range(-2, 3):
			obstacles.append(Vector3(0.0, shape.z(0.62) + k * 0.85, 0.95))
	var hatch_t := 0.46
	for t: float in [0.46, 0.6]:
		var clear := true
		for mast: Dictionary in c.masts:
			if absf(float(mast.t) - t) < 0.05:
				clear = false
		if clear:
			hatch_t = t
			break
	hatch = Vector2(B * 0.05, shape.z(hatch_t) + 0.5)

	# gun posts on the open main deck, inboard of each carriage
	var k := 0.75 + L * 0.011
	for i in ship.model.muzzles.size():
		var mz: Dictionary = ship.model.muzzles[i]
		var p: Vector3 = mz.pos
		var dir: Vector3 = mz.dir
		# the chasers fire fore and aft from the castles
		if absf(dir.z) > 0.5:
			continue
		var t := p.z / L + 0.5
		if t < main.t0 or t > main.t1:
			continue
		var side := int(mz.side)
		var hw := shape.half_width_at_y(t, p.y)
		obstacles.append(Vector3(side * (hw - 0.13 - 0.42 * k), p.z, 0.42 * k + 0.08))
		var post := GunPost.new()
		post.muzzle = i
		post.side = side
		post.x = side * (hw - 0.13 - 0.85 * k - 0.42)
		post.z = p.z
		post.t = t
		posts.append(post)
	for p in posts:
		# stand beside the breech, whichever side is clearer
		p.z += 0.42 if clearance(p.x, p.z + 0.42) >= clearance(p.x, p.z - 0.42) else -0.42
	# pin rails at each mast for hauling
	for mast: Dictionary in c.masts:
		var t := float(mast.t) + 0.55 / L
		var zone := zone_at(t)
		if zone == null:
			continue
		var hw := zone.half_width(t)
		for side: int in [1, -1]:
			var h := Haul.new()
			h.x = side * (hw - 0.4)
			h.z = shape.z(t)
			h.side = side
			h.zone = zone
			hauls.append(h)

	# muster the crew: the helmsman, the captain, a gun crew to each gun of a
	# side, and the deck hands
	var port_posts: Array[GunPost] = []
	for p in posts:
		if p.side == 1:
			port_posts.append(p)
	var hands := (2 if c.id == "sloop" else (3 if c.id == "brig" else 5)) - (1 if lean else 0)
	var roles: Array[Sailor.Role] = [Sailor.Role.HELM, Sailor.Role.CAPTAIN]
	for i in port_posts.size():
		roles.append(Sailor.Role.GUNNER)
	for i in hands:
		roles.append(Sailor.Role.HAND)
	var pirate := ship.team == Ship.Team.PIRATE
	var gunner := 0
	for role in roles:
		var look := CrewLook.make(pirate, role == Sailor.Role.CAPTAIN, role == Sailor.Role.HELM, rng, ship.cls.haunt or ship.ghost)
		var row: int = take_row.call(look)
		if row < 0:
			break
		var zone := helm_zone if role == Sailor.Role.HELM or role == Sailor.Role.CAPTAIN else main
		var sl := Sailor.new(role, look, row, zone, rng)
		if role == Sailor.Role.GUNNER:
			sl.gun = port_posts[gunner % port_posts.size()]
			gunner += 1
		_place(sl)
		sailors.append(sl)


func _seat(o: Vector3) -> void:
	seats.append(obstacles.size())
	obstacles.append(o)


# ------------------------------------------------------------------ deck geometry

func t_of(z: float) -> float:
	return z / L + 0.5


func zone_at(t: float) -> Zone:
	for zn: Zone in [main, quarter, fore]:
		if zn != null and t >= zn.t0 and t <= zn.t1:
			return zn
	return null


## The planks' height under (x, z), crowned a little toward the centreline.
func deck_y(zone: Zone, x: float, z: float) -> float:
	var t := t_of(z)
	return zone.y(t) + 0.06 * maxf(0.0, 1.0 - absf(x) / zone.half_width(t))


## How far (x, z) stands clear of everything on deck.
func clearance(x: float, z: float) -> float:
	var best := 1e9
	for o in obstacles:
		best = minf(best, Vector2(x - o.x, z - o.y).length() - o.z)
	return best


## A random free spot on a zone's deck (by the rail, if asked).
func free_spot(zone: Zone, near_rail: bool = false) -> Vector2:
	for i in 24:
		var t := rng.randf_range(zone.t0 + 0.02, zone.t1 - 0.02)
		var hw := zone.half_width(t) - 0.38
		if hw < 0.2:
			continue
		var x := (-1.0 if rng.randf() < 0.5 else 1.0) * hw if near_rail else rng.randf_range(-hw, hw)
		var z := shape.z(t)
		if clearance(x, z) <= 0.32:
			continue
		var crowded := false
		for o in sailors:
			if o.mode == Sailor.Mode.ABOARD and absf(o.x - x) < 0.7 and absf(o.z - z) < 0.7 and Vector2(o.x - x, o.z - z).length() < 0.7:
				crowded = true
				break
		if not crowded:
			return Vector2(x, z)
	return Vector2(0.0, shape.z((zone.t0 + zone.t1) * 0.5))


func _place(sl: Sailor) -> void:
	if sl.role == Sailor.Role.HELM:
		sl.x = helm.x
		sl.z = helm.y
		sl.act = Sailor.Act.HELM
	else:
		var p := free_spot(sl.zone)
		sl.x = p.x
		sl.z = p.y
		sl.act = Sailor.Act.PACE if sl.role == Sailor.Role.CAPTAIN else Sailor.Act.STAND
		sl.act_dur = rng.randf_range(0.5, 4.0)
	sl.yaw = 0.0 if sl.role == Sailor.Role.HELM else rng.randf_range(-PI, PI)
	sl.want_yaw = sl.yaw


## Where a sailor aboard is drawn: on his deck, stood against the roll.
func matrix_of(sl: Sailor) -> Transform3D:
	var b := Basis(upright * Quaternion(Vector3.UP, sl.yaw)) * Basis.from_scale(Vector3(sl.girth, sl.height, sl.girth))
	return ship.transform * Transform3D(b, Vector3(sl.x, deck_y(sl.zone, sl.x, sl.z) + sl.y, sl.z))


# ------------------------------------------------------------------ per frame

func update(dt: float, world: World) -> void:
	var sh := ship
	var time := world.time
	# who she's fighting
	enemy = null
	enemy_dist = 1e9
	for o in world.ships:
		if o == sh or not o.alive or o.removed or o.team == sh.team or o.prize or sh.prize:
			continue
		var d := Vector2(o.pos.x - sh.pos.x, o.pos.z - sh.pos.z).length()
		if d < enemy_dist:
			enemy_dist = d
			enemy = o
	for i in 2:
		if sh.reload[i] > _prev_reload[i] + 0.3:
			volley_at[i] = time
			last_fire = time
			gun_side = 1 if i == 0 else -1
		_prev_reload[i] = sh.reload[i]
	# a ship at anchor keeps an easy watch until someone actually opens fire
	var near := enemy != null and enemy_dist < 230.0 and not sh.anchored
	battle = sh.alive and (near or time - last_fire < 8.0 or time - sh.last_hit < 6.0)
	if near:
		var rel := MathX.angle_delta(sh.heading, atan2(enemy.pos.x - sh.pos.x, enemy.pos.z - sh.pos.z))
		var want := 1 if rel > 0.0 else -1
		var cur := Ship.side_index(gun_side)
		# don't abandon a half-loaded battery unless the enemy is plainly on the other beam
		var mid := sh.reload[cur] > 0.0 and sh.reload[cur] < sh.reload_full[cur] * 0.75
		if want != gun_side and absf(absf(rel) - PI * 0.5) < 1.2 and not mid:
			gun_side = want
	# hits make everyone duck; kills make everyone roar
	if sh.last_hit > _last_hit:
		_last_hit = sh.last_hit
		if sh.alive:
			for sl in sailors:
				if sl.mode == Sailor.Mode.ABOARD:
					sl.flinch = maxf(sl.flinch, rng.randf_range(0.5, 0.75))
	if sh.kills > _kills:
		_kills = sh.kills
		for sl in sailors:
			if sl.mode == Sailor.Mode.ABOARD:
				sl.cheer = rng.randf_range(2.6, 3.4)
	if not sh.alive and not _dead_seen:
		_dead_seen = true
		for sl in sailors:
			sl.panic_delay = rng.randf_range(2.4, 3.2) if sl.role == Sailor.Role.HELM else rng.randf_range(0.15, 2.6)
			sl.flinch = 0.0
			sl.cheer = 0.0

	# the way up, in her own frame
	var v := sh.transform.basis.get_rotation_quaternion().inverse() * Vector3.UP
	var q := Quaternion(Vector3.UP, v)
	var ang := q.get_angle()
	upright = Quaternion.IDENTITY.slerp(q, minf(0.8, 0.5 / ang) if ang > 1e-4 else 0.8)

	for sl in sailors:
		if sl.mode == Sailor.Mode.ABOARD:
			if not sl.away:
				_think(sl, dt, world)
		elif sl.mode == Sailor.Mode.AIR or sl.mode == Sailor.Mode.SWIM:
			CrewBrain.step_loose(sl, dt, world)
	# keep folk from standing inside each other (the helmsman holds his wheel,
	# and nobody shifts a man off his barrel)
	var n := sailors.size()
	var shove := 0.5 * minf(1.0, dt * 8.0)
	for i in n:
		var a := sailors[i]
		if a.mode != Sailor.Mode.ABOARD or a.seat >= 0 or a.away:
			continue
		for j in range(i + 1, n):
			var b := sailors[j]
			if b.mode != Sailor.Mode.ABOARD or b.seat >= 0 or b.away:
				continue
			var dx := a.x - b.x
			var dz := a.z - b.z
			var d2 := dx * dx + dz * dz
			if d2 >= 0.36 or d2 <= 1e-6:
				continue
			var d := sqrt(d2)
			var push := (0.6 - d) * shove / d
			if a.act != Sailor.Act.HELM:
				a.x += dx * push
				a.z += dz * push
			if b.act != Sailor.Act.HELM:
				b.x -= dx * push
				b.z -= dz * push


# ------------------------------------------------------------------ the landing party

## The captain and up to `n` hands (the helmsman too, with `helm`) called
## away from the deck, to go ashore or to meet boarders (the web's muster):
## they leave the deck, and come back with welcome_back.
func muster(n: int, helm := false) -> Array[Sailor]:
	var out: Array[Sailor] = []
	var hands: Array[Sailor] = []
	var roles: Array[Sailor.Role] = [Sailor.Role.CAPTAIN, Sailor.Role.HAND, Sailor.Role.GUNNER]
	if helm:
		roles.append(Sailor.Role.HELM)
	for role: Sailor.Role in roles:
		for sl in sailors:
			if sl.role != role or sl.mode != Sailor.Mode.ABOARD or sl.away:
				continue
			if role == Sailor.Role.CAPTAIN:
				if out.is_empty():
					out.append(sl)
			elif hands.size() < n:
				hands.append(sl)
	out.append_array(hands)
	for sl in out:
		sl.away = true
		sl.seat = -1
		sl.walking_to = false
		sl.act = Sailor.Act.STAND
	return out


## Everyone called away is back aboard, each at a free spot on deck.
func welcome_back() -> void:
	for sl in sailors:
		if not sl.away:
			continue
		sl.away = false
		if sl.mode == Sailor.Mode.ABOARD:
			var p := free_spot(sl.zone)
			sl.x = p.x
			sl.z = p.y
			sl.act_dur = 0.0


# ------------------------------------------------------------------ walking

## Steps toward the goal around what's on deck. True on arrival.
func _step_walk(sl: Sailor, dt: float) -> bool:
	if not sl.walking_to:
		return true
	var dx := sl.goal_x - sl.x
	var dz := sl.goal_z - sl.z
	var d := sqrt(dx * dx + dz * dz)
	if d < 0.07:
		sl.walking_to = false
		sl.moving = 0.0
		if sl.goal_turn:
			sl.want_yaw = sl.goal_yaw
		return true
	var mx := dx / d
	var mz := dz / d
	var through := sl.stuck > 2.5
	if not through:
		var near := minf(1.0, d) * 2.2
		for i in obstacles.size():
			if i == sl.ignore:
				continue
			var o := obstacles[i]
			var ox := sl.x - o.x
			var oz := sl.z - o.y
			var reach := o.z + 0.55
			if absf(ox) >= reach or absf(oz) >= reach:
				continue
			var od := sqrt(ox * ox + oz * oz)
			if od >= reach or od <= 1e-4:
				continue
			# push away and slide round the side the goal lies on; it fades out
			# close to the goal so a post beside a gun or a barrel can be reached
			var w := (1.0 - od / reach) * near
			var tx := -oz / od
			var tz := ox / od
			var sgn := 1.0 if tx * dx + tz * dz > 0.0 else -1.0
			mx += ox / od * w + tx * sgn * w * 0.8
			mz += oz / od * w + tz * sgn * w * 0.8
		var ml := sqrt(mx * mx + mz * mz)
		if ml > 1e-6:
			mx /= ml
			mz /= ml
	var speed := (3.3 if sl.run else 1.3) * sl.tempo * minf(1.0, 0.35 + d * 1.2)
	var step := minf(d, speed * dt)
	var px := sl.x
	var pz := sl.z
	sl.x += mx * step
	sl.z += mz * step
	_confine(sl)
	var moved := Vector2(sl.x - px, sl.z - pz).length()
	sl.stuck = sl.stuck + dt if moved < step * 0.3 else maxf(0.0, sl.stuck - dt)
	sl.moving = moved / maxf(dt, 1e-4)
	sl.phase += moved / (1.9 if sl.run else 1.3) * TAU
	if moved > 1e-4:
		sl.want_yaw = atan2(mx, mz)
	if through or sl.stuck > 4.0:
		# shove through rather than stand frozen against a barrel forever
		sl.x += dx / d * step * 0.6
		sl.z += dz / d * step * 0.6
	return false


func _confine(sl: Sailor) -> void:
	var zn := sl.zone
	var t := clampf(t_of(sl.z), zn.t0, zn.t1)
	sl.z = shape.z(t)
	var hw := zn.half_width(t) - 0.28
	sl.x = clampf(sl.x, -hw, hw)


## Walks to a spot and, once there, takes up `act`.
func _idle_at(sl: Sailor, want: Vector2, turn: bool, yaw: float, act: Sailor.Act) -> void:
	if Vector2(sl.x - want.x, sl.z - want.y).length() > 0.08:
		if not sl.walking_to or absf(sl.goal_x - want.x) + absf(sl.goal_z - want.y) > 0.01:
			sl.walk_to(want.x, want.y, false, turn, yaw)
		sl.act = Sailor.Act.STAND
	else:
		sl.act = act


## The bearing (ship-local) to a point in the world.
func _yaw_to(p: Vector3) -> float:
	return MathX.angle_delta(ship.heading, atan2(p.x - ship.pos.x, p.z - ship.pos.z))


# ------------------------------------------------------------------ brains

func _think(sl: Sailor, dt: float, world: World) -> void:
	var sh := ship
	var t := sl.target
	var time := world.time
	var tt := time * sl.tempo + sl.seed
	sl.act_t += dt
	CrewBrain.rest(t)
	var prop := CrewModel.PROP_NONE

	if not sh.alive:
		# the dead don't abandon ship: a laid ghost's crew stand to the last and
		# are simply gone with the curse
		if sh.ghost:
			return
		_founder(sl, dt, world)
		return

	# what this sailor should be doing right now
	match sl.role:
		Sailor.Role.HELM:
			_idle_at(sl, helm, true, 0.0, Sailor.Act.HELM)
		Sailor.Role.CAPTAIN:
			_captain_plan(sl, time)
		_:
			_hand_plan(sl)

	var walking := sl.walking_to and not _step_walk(sl, dt)
	var run := 1.0 if sl.run else 0.0
	# chores are timed from arrival, not from setting off
	if walking and sl.act != Sailor.Act.GUN:
		sl.act_t = 0.0

	match sl.act:
		Sailor.Act.HELM:
			var r := sh.rudder
			var spin := sin(tt * 5.0) * 0.35 * absf(r) if absf(r) > 0.35 else 0.0
			t[CrewModel.P_ARM_LX] = 1.05 - 0.35 * r + spin
			t[CrewModel.P_ARM_RX] = 1.05 + 0.35 * r - spin
			t[CrewModel.P_ARM_LZ] = -0.05
			t[CrewModel.P_ARM_RZ] = -0.05
			t[CrewModel.P_ELBOW_L] = 0.55 + 0.2 * r
			t[CrewModel.P_ELBOW_R] = 0.55 - 0.2 * r
			t[CrewModel.P_SPINE_Y] = r * 0.18
			t[CrewModel.P_SPINE_Z] = -r * 0.06
			t[CrewModel.P_SPINE_X] = 0.08
			t[CrewModel.P_HEAD_Y] = r * 0.25 + sin(tt * 0.31) * 0.2
			t[CrewModel.P_HEAD_X] = -0.12
			t[CrewModel.P_LEG_LX] = 0.12
			t[CrewModel.P_LEG_RX] = -0.1
			t[CrewModel.P_KNEE_L] = 0.18
			sl.want_yaw = 0.0
			if sl.cheer > 0.0:
				# one fist off the wheel for a kill
				t[CrewModel.P_ARM_RX] = 2.7 + sin(tt * 9.0) * 0.25
				t[CrewModel.P_ARM_RZ] = -0.3
				t[CrewModel.P_ELBOW_R] = 0.3
				t[CrewModel.P_HAND_R] = 1.0
				t[CrewModel.P_JAW] = 0.6 + 0.3 * sin(tt * 9.0)
				t[CrewModel.P_SMILE] = 1.0
				t[CrewModel.P_BROW] = 0.7
		Sailor.Act.PACE:
			if walking:
				CrewBrain.walk(t, sl.phase, run, true)
			t[CrewModel.P_ARM_LX] = -0.5
			t[CrewModel.P_ARM_RX] = -0.5
			t[CrewModel.P_ARM_LZ] = 0.28
			t[CrewModel.P_ARM_RZ] = 0.28
			t[CrewModel.P_ELBOW_L] = 1.25
			t[CrewModel.P_ELBOW_R] = 1.25
			t[CrewModel.P_HEAD_Y] = 0.0 if walking else sin(tt * 0.5) * 0.5
			t[CrewModel.P_SPINE_X] += 0.04
		Sailor.Act.GLASS:
			prop = CrewModel.PROP_SPYGLASS
			_spyglass(t)
		Sailor.Act.RAIL, Sailor.Act.POINT:
			prop = CrewModel.PROP_CUTLASS
			if walking:
				CrewBrain.walk(t, sl.phase, run)
			elif sl.act == Sailor.Act.POINT:
				_point(t, tt)
			else:
				t[CrewModel.P_LEG_LX] = 0.25
				t[CrewModel.P_KNEE_L] = 0.3
				t[CrewModel.P_LEG_RX] = -0.12
				t[CrewModel.P_ARM_LZ] = 0.45
				t[CrewModel.P_ELBOW_L] = 1.8
				t[CrewModel.P_ARM_LX] = 0.15
				t[CrewModel.P_ARM_RX] = 0.25
				t[CrewModel.P_ELBOW_R] = 0.5
				t[CrewModel.P_HEAD_Y] = sin(tt * 0.6) * 0.3
		Sailor.Act.GUN:
			prop = _gunnery(sl, t, walking, run, time, tt)
		Sailor.Act.POWDER:
			prop = CrewModel.PROP_BUCKET
			if walking:
				CrewBrain.walk(t, sl.phase, run, true)
				t[CrewModel.P_ARM_RX] = 0.35
				t[CrewModel.P_ELBOW_R] = 1.3
				t[CrewModel.P_ARM_LX] = -0.6 * sin(sl.phase)
				t[CrewModel.P_ELBOW_L] = 1.2
			else:
				t[CrewModel.P_SPINE_X] = 0.4
				CrewBrain.crouch(t, 0.7)
				t[CrewModel.P_ARM_RX] = 0.9
				t[CrewModel.P_ARM_LX] = 0.9
				t[CrewModel.P_ELBOW_R] = 0.4
				t[CrewModel.P_ELBOW_L] = 0.5
		Sailor.Act.BUCKET:
			prop = CrewModel.PROP_BUCKET
			if walking:
				CrewBrain.walk(t, sl.phase, run, true)
				t[CrewModel.P_ARM_RX] = 0.25
				t[CrewModel.P_ELBOW_R] = 0.5
			else:
				var cyc := fmod(sl.act_t * 0.85, 1.0)
				var wind := cyc / 0.55 if cyc < 0.55 else 0.0
				var thr := sin((cyc - 0.55) / 0.45 * PI) if cyc >= 0.55 else 0.0
				t[CrewModel.P_ARM_RX] = -0.6 * wind + 2.0 * thr
				t[CrewModel.P_ARM_LX] = -0.4 * wind + 1.8 * thr
				t[CrewModel.P_ELBOW_R] = 0.3
				t[CrewModel.P_ELBOW_L] = 0.4
				t[CrewModel.P_SPINE_X] = -0.15 * wind + 0.45 * thr
				t[CrewModel.P_SPINE_Y] = 0.3 * wind
				t[CrewModel.P_LEG_LX] = 0.4
				t[CrewModel.P_KNEE_L] = 0.35
				t[CrewModel.P_LEG_RX] = -0.2
				if cyc >= 0.7 and cyc - dt * 0.85 < 0.7:
					_douse(sl, world)
		Sailor.Act.HAUL:
			if walking:
				CrewBrain.walk(t, sl.phase, run)
			else:
				var w := tt * 4.2
				t[CrewModel.P_ARM_LX] = 2.35 + 0.5 * sin(w)
				t[CrewModel.P_ARM_RX] = 2.35 + 0.5 * sin(w + PI)
				t[CrewModel.P_ELBOW_L] = 0.35 + 0.45 * (0.5 + 0.5 * cos(w))
				t[CrewModel.P_ELBOW_R] = 0.35 + 0.45 * (0.5 - 0.5 * cos(w))
				t[CrewModel.P_ARM_LZ] = 0.05
				t[CrewModel.P_ARM_RZ] = 0.05
				t[CrewModel.P_SPINE_X] = -0.2 + 0.08 * sin(w * 2.0)
				t[CrewModel.P_HEAD_X] = -0.35
				t[CrewModel.P_LEG_LX] = 0.3
				t[CrewModel.P_KNEE_L] = 0.35
				t[CrewModel.P_LEG_RX] = -0.15
				t[CrewModel.P_KNEE_R] = 0.2
				t[CrewModel.P_ROOT_Y] = -0.05
		Sailor.Act.SWAB:
			prop = CrewModel.PROP_MOP
			if walking:
				CrewBrain.walk(t, sl.phase, run, true)
				t[CrewModel.P_ARM_RX] = 0.3
				t[CrewModel.P_ELBOW_R] = 0.3
			else:
				var w := tt * 2.6
				t[CrewModel.P_SPINE_X] = 0.3
				t[CrewModel.P_SPINE_Y] = 0.28 * sin(w)
				t[CrewModel.P_ARM_RX] = 0.75 + 0.25 * sin(w)
				t[CrewModel.P_ARM_LX] = 0.95 + 0.25 * sin(w)
				t[CrewModel.P_ARM_LZ] = -0.2
				t[CrewModel.P_ARM_RZ] = 0.05
				t[CrewModel.P_ELBOW_R] = 0.35
				t[CrewModel.P_ELBOW_L] = 0.75
				t[CrewModel.P_LEG_LX] = 0.3
				t[CrewModel.P_KNEE_L] = 0.3
				t[CrewModel.P_KNEE_R] = 0.15
				t[CrewModel.P_ROOT_Y] = -0.04
				# inch along the deck as the boards get scrubbed
				var step := cos(w) * 0.12 * dt
				sl.x += cos(sl.yaw) * step
				sl.z -= sin(sl.yaw) * step
				_confine(sl)
		Sailor.Act.LEAN:
			if walking:
				CrewBrain.walk(t, sl.phase, run)
			else:
				if sl.look.smoker:
					prop = CrewModel.PROP_PIPE
				t[CrewModel.P_SPINE_X] = 0.5
				t[CrewModel.P_ARM_LX] = 1.15
				t[CrewModel.P_ARM_RX] = 1.15
				t[CrewModel.P_ARM_LZ] = -0.12
				t[CrewModel.P_ARM_RZ] = -0.12
				t[CrewModel.P_ELBOW_L] = 1.45
				t[CrewModel.P_ELBOW_R] = 1.45
				t[CrewModel.P_HEAD_X] = -0.42
				t[CrewModel.P_HEAD_Y] = sin(tt * 0.35) * 0.45
				t[CrewModel.P_LEG_LX] = 0.12
				t[CrewModel.P_KNEE_L] = 0.4
				t[CrewModel.P_ROOT_Y] = -0.03
		Sailor.Act.SIT:
			if walking:
				CrewBrain.walk(t, sl.phase, run)
			else:
				if sl.look.smoker:
					prop = CrewModel.PROP_PIPE
				t[CrewModel.P_LEG_LX] = 1.45
				t[CrewModel.P_LEG_RX] = 1.45
				t[CrewModel.P_KNEE_L] = 1.35 + sin(tt * 1.7) * 0.18
				t[CrewModel.P_KNEE_R] = 1.35 + sin(tt * 1.7 + 2.0) * 0.18
				t[CrewModel.P_SPINE_X] = 0.1
				t[CrewModel.P_ARM_LX] = 0.55
				t[CrewModel.P_ARM_RX] = 0.55
				t[CrewModel.P_ELBOW_L] = 0.7
				t[CrewModel.P_ELBOW_R] = 0.7
				t[CrewModel.P_HEAD_Y] = sin(tt * 0.27) * 0.5
				t[CrewModel.P_ROOT_Y] = -0.8
		Sailor.Act.COIL:
			if walking:
				CrewBrain.walk(t, sl.phase, run)
			else:
				var w := tt * 3.0
				t[CrewModel.P_SPINE_X] = 0.35
				CrewBrain.crouch(t, 0.85)
				t[CrewModel.P_ARM_RX] = 0.75 + 0.3 * sin(w)
				t[CrewModel.P_ARM_RZ] = 0.15 + 0.25 * cos(w)
				t[CrewModel.P_ARM_LX] = 0.7
				t[CrewModel.P_ARM_LZ] = 0.05
				t[CrewModel.P_ELBOW_R] = 0.5
				t[CrewModel.P_ELBOW_L] = 0.9
				t[CrewModel.P_HEAD_X] = 0.3
		Sailor.Act.CHAT:
			if walking:
				CrewBrain.walk(t, sl.phase, run)
			else:
				var talk := sin(tt * 0.9 + sl.seed) > 0.0
				if sl.look.drinker:
					prop = CrewModel.PROP_MUG
					# a swig of grog between remarks
					var sip := fmod(tt * 0.23 + sl.seed, 1.0) < 0.16
					t[CrewModel.P_ARM_LX] = -0.2
					t[CrewModel.P_ARM_LZ] = 0.4
					t[CrewModel.P_ELBOW_L] = 1.7
					t[CrewModel.P_ARM_RX] = 1.85 if sip else (0.6 + 0.3 * sin(tt * 3.1) if talk else 0.3)
					t[CrewModel.P_ARM_RZ] = 0.15 if sip else 0.2
					t[CrewModel.P_ELBOW_R] = 2.35 if sip else 1.35
					t[CrewModel.P_HEAD_X] = -0.4 if sip else 0.08 * sin(tt * 4.0)
				elif talk:
					t[CrewModel.P_ARM_RX] = 0.55 + 0.35 * sin(tt * 3.1)
					t[CrewModel.P_ARM_RZ] = 0.2
					t[CrewModel.P_ELBOW_R] = 1.2 + 0.3 * sin(tt * 2.3)
					t[CrewModel.P_HEAD_X] = 0.08 * sin(tt * 4.0)
				else:
					t[CrewModel.P_ARM_LX] = -0.2
					t[CrewModel.P_ARM_LZ] = 0.4
					t[CrewModel.P_ELBOW_L] = 1.7
					t[CrewModel.P_ARM_RZ] = 0.4
					t[CrewModel.P_ARM_RX] = -0.2
					t[CrewModel.P_ELBOW_R] = 1.7
					t[CrewModel.P_HEAD_X] = 0.1 + 0.1 * sin(tt * 1.3)
				t[CrewModel.P_SPINE_Z] = 0.05 * sin(tt * 0.5)
				if sl.partner != null:
					sl.want_yaw = atan2(sl.partner.x - sl.x, sl.partner.z - sl.z)
		Sailor.Act.FIDDLE:
			prop = CrewModel.PROP_FIDDLE
			if walking:
				CrewBrain.walk(t, sl.phase, run, true)
				t[CrewModel.P_ARM_LX] = 0.4
				t[CrewModel.P_ELBOW_L] = 1.3
				t[CrewModel.P_ARM_RX] = 0.25
				t[CrewModel.P_ELBOW_R] = 0.6
			else:
				# a hornpipe: fiddle tucked under the chin, the bow sawing, a foot tapping the beat
				var w := time * 7.5
				var bow := sin(w * 0.5)
				t[CrewModel.P_ARM_LX] = 1.15
				t[CrewModel.P_ARM_LZ] = -0.55
				t[CrewModel.P_ELBOW_L] = 1.95
				t[CrewModel.P_ARM_RX] = 0.85
				t[CrewModel.P_ARM_RZ] = 0.45 + 0.12 * bow
				t[CrewModel.P_ELBOW_R] = 1.1 + 0.45 * bow
				t[CrewModel.P_HEAD_X] = 0.22
				t[CrewModel.P_HEAD_Y] = 0.35
				t[CrewModel.P_SPINE_Z] = 0.07 * bow
				t[CrewModel.P_SPINE_X] = -0.04
				t[CrewModel.P_LEG_RX] = 0.12 * maxf(0.0, sin(w))
				t[CrewModel.P_KNEE_R] = 0.1 + 0.18 * maxf(0.0, sin(w))
				t[CrewModel.P_KNEE_L] = 0.12
				t[CrewModel.P_ROOT_Y] = -0.015 - 0.015 * absf(sin(w))
		Sailor.Act.JIG:
			var f := sl.partner
			if f == null or f.act != Sailor.Act.FIDDLE or f.mode != Sailor.Mode.ABOARD:
				sl.act_dur = 0.0
			if walking:
				CrewBrain.walk(t, sl.phase, run)
			else:
				var w := time * 7.5
				var k := sin(w * 0.5)
				if fmod(sl.seed, 2.0) < 1.0:
					# arms folded high across the chest, sailor-fashion
					t[CrewModel.P_ARM_LX] = 0.95
					t[CrewModel.P_ARM_RX] = 0.95
					t[CrewModel.P_ARM_LZ] = -0.55
					t[CrewModel.P_ARM_RZ] = -0.55
					t[CrewModel.P_ELBOW_L] = 2.1
					t[CrewModel.P_ELBOW_R] = 2.1
				else:
					t[CrewModel.P_ARM_LZ] = 0.5
					t[CrewModel.P_ARM_RZ] = 0.5
					t[CrewModel.P_ELBOW_L] = 1.6
					t[CrewModel.P_ELBOW_R] = 1.6
					t[CrewModel.P_ARM_LX] = -0.15
					t[CrewModel.P_ARM_RX] = -0.15
				t[CrewModel.P_LEG_LX] = 0.75 * maxf(0.0, k)
				t[CrewModel.P_KNEE_L] = 0.1 + 1.25 * maxf(0.0, k)
				t[CrewModel.P_LEG_RX] = 0.75 * maxf(0.0, -k)
				t[CrewModel.P_KNEE_R] = 0.1 + 1.25 * maxf(0.0, -k)
				t[CrewModel.P_ROOT_Y] = 0.07 * absf(k) - 0.03
				t[CrewModel.P_SPINE_Z] = 0.12 * k
				t[CrewModel.P_SPINE_X] = -0.05
				t[CrewModel.P_HEAD_Y] = 0.25 * sin(w * 0.25)
				t[CrewModel.P_HEAD_X] = -0.1
				if f != null:
					sl.want_yaw = atan2(f.x - sl.x, f.z - sl.z) + sin(time * 0.6 + sl.seed) * 0.6
		_:
			if walking:
				CrewBrain.walk(t, sl.phase, run)
			else:
				if sl.look.smoker:
					prop = CrewModel.PROP_PIPE
				t[CrewModel.P_SPINE_X] = 0.02 + 0.015 * sin(tt * 1.7)
				t[CrewModel.P_HEAD_Y] = sl.look_yaw
				t[CrewModel.P_LEG_LX] = 0.06 * sin(tt * 0.2)
				t[CrewModel.P_KNEE_L] = 0.1 + 0.1 * maxf(0.0, sin(tt * 0.2))
				if sin(tt * 0.17) > 0.6:
					# hands on hips
					t[CrewModel.P_ARM_LZ] = 0.5
					t[CrewModel.P_ARM_RZ] = 0.5
					t[CrewModel.P_ELBOW_L] = 1.6
					t[CrewModel.P_ELBOW_R] = 1.6
					t[CrewModel.P_ARM_LX] = -0.15
					t[CrewModel.P_ARM_RX] = -0.15
	# idle glances
	sl.look_t -= dt
	if sl.look_t <= 0.0:
		sl.look_t = rng.randf_range(1.5, 5.0)
		sl.look_yaw = rng.randf_range(-0.9, 0.9)

	CrewBrain.face(sl, t, tt, walking, enemy != null and enemy_dist < 260.0, prop)

	# overlays: cheering and ducking
	if sl.cheer > 0.0:
		sl.cheer -= dt
		if sl.act != Sailor.Act.HELM and sl.act != Sailor.Act.SIT and not walking:
			CrewBrain.cheer_pose(CrewBrain.overlay(), tt)
			CrewBrain.blend_in(t, minf(1.0, minf(sl.cheer * 2.0, (3.2 - sl.cheer) * 4.0)))
			if sl.role == Sailor.Role.CAPTAIN or sl.prop == CrewModel.PROP_CUTLASS:
				prop = CrewModel.PROP_CUTLASS
	if sl.flinch > 0.0:
		sl.flinch -= dt
		if sl.act != Sailor.Act.SIT:
			CrewBrain.flinch_pose(CrewBrain.overlay())
			CrewBrain.blend_in(t, minf(1.0, sl.flinch * 4.0) * minf(1.0, (0.75 - sl.flinch) * 10.0 + 0.3))
	sl.prop = prop
	if prop == CrewModel.PROP_PIPE and rng.randf() < dt * 0.45:
		_puff(sl, world)

	# up on the barrel he sits on
	var lift := 0.74 if sl.seat >= 0 and not walking and sl.act == Sailor.Act.SIT else 0.0
	sl.y += (lift - sl.y) * MathX.damp(9.0, dt)
	sl.settle(dt, 16.0 if walking else 9.0, 10.0 if sl.walking_to else 6.0)


func _spyglass(t: PackedFloat32Array) -> void:
	t[CrewModel.P_ARM_RX] = 1.62
	t[CrewModel.P_ELBOW_R] = 1.52
	t[CrewModel.P_ARM_RZ] = 0.32
	t[CrewModel.P_ARM_LX] = 1.25
	t[CrewModel.P_ELBOW_L] = 1.55
	t[CrewModel.P_ARM_LZ] = 0.3
	t[CrewModel.P_HEAD_X] = -0.08
	t[CrewModel.P_LEG_LX] = 0.15
	t[CrewModel.P_KNEE_L] = 0.15


func _point(t: PackedFloat32Array, tt: float) -> void:
	t[CrewModel.P_ARM_RX] = 1.8 + sin(tt * 6.0) * 0.08
	t[CrewModel.P_ARM_RZ] = 0.12
	t[CrewModel.P_ELBOW_R] = 0.08
	t[CrewModel.P_ARM_LX] = -0.3
	t[CrewModel.P_ARM_LZ] = 0.35
	t[CrewModel.P_ELBOW_L] = 0.4
	t[CrewModel.P_SPINE_X] = -0.04
	t[CrewModel.P_HEAD_X] = -0.18
	t[CrewModel.P_LEG_LX] = 0.38
	t[CrewModel.P_KNEE_L] = 0.32
	t[CrewModel.P_LEG_RX] = -0.22
	t[CrewModel.P_ROOT_Y] = -0.04


## A puff from his pipe, carried along with the ship.
func _puff(sl: Sailor, world: World) -> void:
	var c := cos(sl.yaw)
	var s := sin(sl.yaw)
	var lx := -0.08 * sl.girth
	var lz := 0.24 * sl.girth
	var p := ship.transform * Vector3(sl.x + lx * c + lz * s, deck_y(sl.zone, sl.x, sl.z) + sl.y + sl.pose[CrewModel.P_ROOT_Y] + 1.64 * sl.height, sl.z - lx * s + lz * c)
	var v := Vector3(ship.vel.x + rng.randf_range(-0.1, 0.1), rng.randf_range(0.25, 0.45), ship.vel.z + rng.randf_range(-0.1, 0.1))
	world.fx.emit(p, v, rng.randf_range(1.4, 2.2), 0.08, rng.randf_range(0.45, 0.7), Color(0.9, 0.9, 0.9, 0.4), Color(1.05, 1.05, 1.05, 0.4), -0.1, 1.2, Particles.SMOKE, 0.1)


## A bucketful thrown on the flames.
func _douse(sl: Sailor, world: World) -> void:
	var p := ship.transform * Vector3(sl.x + sin(sl.yaw) * 0.8, deck_y(sl.zone, sl.x, sl.z) + 1.2, sl.z + cos(sl.yaw) * 0.8)
	for i in 6:
		var v := Vector3(rng.randf_range(-1.5, 1.5), rng.randf_range(1.0, 3.5), rng.randf_range(-1.5, 1.5))
		world.fx.emit(p, v, rng.randf_range(0.5, 0.8), rng.randf_range(0.12, 0.22), 0.08, Color(1.2, 1.3, 1.35, 0.85), Color(1.2, 1.3, 1.35, 0.85), 12.0, 0.8, Particles.SOFT, 0.01)


# ------------------------------------------------------------------ roles

func _captain_plan(sl: Sailor, time: float) -> void:
	var e := enemy
	var zone := sl.zone
	if battle:
		# to the rail on the engaged beam, cutlass drawn, and bellow the order as each volley goes
		var side := gun_side
		var t := clampf(t_of(helm.y) + 1.2 / L, zone.t0, zone.t1)
		var want := Vector2(side * (zone.half_width(t) - 0.62), shape.z(t))
		if sl.act != Sailor.Act.RAIL and sl.act != Sailor.Act.POINT:
			sl.act = Sailor.Act.RAIL
			sl.act_t = 0.0
		if not sl.walking_to and Vector2(sl.x - want.x, sl.z - want.y).length() > 0.3:
			sl.walk_to(want.x, want.y, true, true, side * PI * 0.5)
		var since := time - maxf(volley_at[0], volley_at[1])
		sl.act = Sailor.Act.POINT if not sl.walking_to and since >= 0.0 and since < 1.4 else Sailor.Act.RAIL
		if not sl.walking_to and e != null:
			sl.want_yaw = _yaw_to(e.pos)
		return
	if sl.act == Sailor.Act.RAIL or sl.act == Sailor.Act.POINT:
		sl.act = Sailor.Act.PACE
		sl.act_t = 0.0
		sl.act_dur = 0.0
	if sl.act_t < sl.act_dur:
		return
	# stroll the quarterdeck; now and then stop for a long look through the glass
	if e != null and enemy_dist < 320.0 and rng.randf() < 0.6:
		sl.act = Sailor.Act.GLASS
		sl.act_t = 0.0
		sl.act_dur = rng.randf_range(3.0, 5.0)
		sl.walking_to = false
		sl.want_yaw = _yaw_to(e.pos)
		return
	if sl.act == Sailor.Act.PACE and rng.randf() < 0.3:
		sl.act = Sailor.Act.GLASS
		sl.act_t = 0.0
		sl.act_dur = rng.randf_range(2.5, 4.5)
		sl.walking_to = false
		sl.want_yaw = (-1.0 if rng.randf() < 0.5 else 1.0) * rng.randf_range(1.2, 1.9)
		return
	sl.act = Sailor.Act.PACE
	sl.act_t = 0.0
	var ta := clampf(t_of(helm.y) + rng.randf_range(0.4, 2.4) / L, zone.t0, zone.t1)
	var side := -1.0 if rng.randf() < 0.5 else 1.0
	sl.walk_to(side * zone.half_width(ta) * rng.randf_range(0.25, 0.55), shape.z(ta))
	sl.act_dur = rng.randf_range(3.0, 7.0)


func _hand_plan(sl: Sailor) -> void:
	var sh := ship
	# battle stations
	if battle:
		if sl.role == Sailor.Role.GUNNER and sl.gun != null:
			var want: GunPost = null
			for p in posts:
				if p.side == gun_side and absf(p.z - sl.gun.z) < 0.9:
					want = p
					break
			if want == null:
				for p in posts:
					if p.side == gun_side:
						want = p
						break
			if want != null:
				sl.gun = want
			if sl.act != Sailor.Act.GUN:
				sl.act = Sailor.Act.GUN
				sl.act_t = 0.0
				sl.seat = -1
				sl.y = 0.0
			if not sl.walking_to and Vector2(sl.x - sl.gun.x, sl.z - sl.gun.z).length() > 0.12:
				sl.walk_to(sl.gun.x, sl.gun.z, true, true, sl.gun.side * PI * 0.5)
			return
		if sh.burning > 0.0 and fmod(sl.seed, 2.0) < 1.2:
			_firefight(sl)
			return
		# powder monkeys: shuttle cartridges from the hatch to the guns
		if sl.act != Sailor.Act.POWDER:
			sl.act = Sailor.Act.POWDER
			sl.act_t = 0.0
			sl.act_dur = 0.0
			sl.seat = -1
			sl.walking_to = false
		if not sl.walking_to and sl.act_t >= sl.act_dur:
			if Vector2(sl.x - hatch.x, sl.z - hatch.y).length() < 0.9:
				var side_posts: Array[GunPost] = []
				for p in posts:
					if p.side == gun_side:
						side_posts.append(p)
				if not side_posts.is_empty():
					var p := side_posts[rng.randi() % side_posts.size()]
					var away := signf(p.z - sl.z) if absf(p.z - sl.z) > 1e-4 else 1.0
					sl.walk_to(p.x - p.side * 0.55, p.z - away * 0.5, true)
			else:
				sl.walk_to(hatch.x + rng.randf_range(-0.4, 0.4), hatch.y + rng.randf_range(-0.6, 0.6), true)
			sl.act_t = 0.0
			sl.act_dur = rng.randf_range(0.5, 0.9)
		elif sl.walking_to:
			sl.act_t = 0.0
		return
	if sh.burning > 0.0:
		_firefight(sl)
		return

	# trimming canvas or swinging yards: hands to the pin rails
	var trimming := absf(sh.sail_target - sh.sail_level) > 0.03 or sh.rig_activity() > 0.35
	if trimming and sl.act != Sailor.Act.HAUL and not hauls.is_empty():
		var taken := 0
		for o in sailors:
			if o.act == Sailor.Act.HAUL:
				taken += 1
		if taken < mini(hauls.size(), 4):
			var best: Haul = null
			var bd := INF
			for h in hauls:
				if h.zone != sl.zone:
					continue
				var held := false
				for o in sailors:
					if o.act == Sailor.Act.HAUL and o.haul == h:
						held = true
						break
				var d := Vector2(h.x - sl.x, h.z - sl.z).length()
				if not held and d < bd:
					bd = d
					best = h
			if best != null:
				sl.set_task(Sailor.Act.HAUL, rng.randf_range(2.5, 4.0))
				sl.haul = best
				sl.walk_to(best.x, best.z, true, true, best.side * PI * 0.5)
				return
	if sl.act == Sailor.Act.HAUL and (trimming or sl.walking_to):
		sl.act_t = 0.0
		return
	if sl.act == Sailor.Act.GUN or sl.act == Sailor.Act.POWDER or sl.act == Sailor.Act.BUCKET:
		sl.act_dur = 0.0
	if sl.walking_to or sl.act_t < sl.act_dur:
		return

	# a new chore
	sl.haul = null
	sl.seat = -1
	sl.partner = null
	var r := rng.randf()
	var zone := sl.zone
	var aboard := 0
	var jigs := 0
	var fiddler: Sailor = null
	for o in sailors:
		if o.mode != Sailor.Mode.ABOARD:
			continue
		aboard += 1
		if o.act == Sailor.Act.JIG:
			jigs += 1
		elif o.act == Sailor.Act.FIDDLE and fiddler == null:
			fiddler = o
	# a fiddler strikes up now and then, and the hands nearby can't help but dance
	if fiddler != null and fiddler != sl and fiddler.zone == zone and not fiddler.walking_to and fiddler.act_dur - fiddler.act_t > 4.0 and rng.randf() < 0.6 and jigs < 3:
		sl.set_task(Sailor.Act.JIG, fiddler.act_dur - fiddler.act_t)
		sl.partner = fiddler
		var a := rng.randf() * TAU
		var rr := rng.randf_range(1.1, 1.5)
		sl.walk_to(fiddler.x + sin(a) * rr, fiddler.z + cos(a) * rr)
		return
	if r < 0.08 and fiddler == null and aboard >= 5:
		sl.set_task(Sailor.Act.FIDDLE, rng.randf_range(18.0, 28.0))
		var p := free_spot(zone)
		sl.walk_to(p.x, p.y, false, true, rng.randf_range(-PI, PI))
		return
	if r < 0.2:
		sl.set_task(Sailor.Act.SWAB, rng.randf_range(7.0, 13.0))
		var p := free_spot(zone)
		sl.walk_to(p.x, p.y, false, true, rng.randf_range(-PI, PI))
	elif r < 0.42:
		sl.set_task(Sailor.Act.LEAN, rng.randf_range(8.0, 15.0))
		var p := free_spot(zone, true)
		sl.walk_to(p.x, p.y, false, true, signf(p.x) * PI * 0.5)
	elif r < 0.58 and not seats.is_empty():
		var seat := seats[rng.randi() % seats.size()]
		var o := obstacles[seat]
		var t := t_of(o.y)
		var free := t > zone.t0 and t < zone.t1
		for other in sailors:
			if other.seat == seat:
				free = false
				break
		if free:
			sl.set_task(Sailor.Act.SIT, rng.randf_range(10.0, 18.0))
			sl.seat = seat
			var face := -(signf(o.x) if absf(o.x) > 1e-4 else 1.0) * PI * 0.5 + rng.randf_range(-0.5, 0.5)
			sl.walk_to(o.x, o.y, false, true, face, seat)
		else:
			sl.set_task(Sailor.Act.STAND, rng.randf_range(2.0, 4.0))
	elif r < 0.7:
		sl.set_task(Sailor.Act.COIL, rng.randf_range(5.0, 9.0))
		var p := free_spot(zone)
		sl.walk_to(p.x, p.y, false, true, rng.randf_range(-PI, PI))
	elif r < 0.85:
		var mate: Sailor = null
		for o in sailors:
			if o != sl and o.mode == Sailor.Mode.ABOARD and o.zone == zone and (o.act == Sailor.Act.STAND or o.act == Sailor.Act.LEAN or o.act == Sailor.Act.COIL) and not o.walking_to and o.partner == null:
				mate = o
				break
		if mate != null:
			sl.set_task(Sailor.Act.CHAT, rng.randf_range(6.0, 11.0))
			sl.partner = mate
			var a := rng.randf() * TAU
			sl.walk_to(mate.x + sin(a) * 0.95, mate.z + cos(a) * 0.95)
			if mate.act == Sailor.Act.STAND:
				mate.act = Sailor.Act.CHAT
				mate.act_t = 0.0
				mate.act_dur = sl.act_dur
				mate.partner = sl
		else:
			sl.set_task(Sailor.Act.STAND, rng.randf_range(2.0, 5.0))
	else:
		sl.set_task(Sailor.Act.STAND, rng.randf_range(2.5, 6.0))
		var p := free_spot(zone)
		sl.walk_to(p.x, p.y)


func _firefight(sl: Sailor) -> void:
	if sl.act != Sailor.Act.BUCKET:
		sl.act = Sailor.Act.BUCKET
		sl.act_t = 0.0
		sl.act_dur = 0.0
		sl.seat = -1
	if not sl.walking_to and sl.act_t > sl.act_dur:
		var pts := PackedVector3Array()
		for p in ship.model.deck_points:
			var t := t_of(p.z)
			if t > sl.zone.t0 and t < sl.zone.t1:
				pts.append(p)
		var at: Vector2
		if pts.is_empty():
			at = free_spot(sl.zone)
		else:
			var p := pts[rng.randi() % pts.size()]
			at = Vector2(p.x, p.z)
		var off := rng.randf_range(0.9, 1.3) * (-1.0 if rng.randf() < 0.5 else 1.0)
		sl.walk_to(at.x + off, at.y + rng.randf_range(-0.6, 0.6), true, true, -PI * 0.5 if off > 0.0 else PI * 0.5)
		sl.act_t = 0.0
		sl.act_dur = rng.randf_range(2.5, 4.0)
	elif sl.walking_to:
		sl.act_t = 0.0


## The gun drill in time with the real reload: sponge, load, ram, run her
## out, then crouch by the breech with the match until the volley comes and
## the gun bucks back on its breeching. Returns what's in his hands.
func _gunnery(sl: Sailor, t: PackedFloat32Array, walking: bool, run: float, time: float, tt: float) -> int:
	var sh := ship
	var g := sl.gun
	if walking or g == null:
		CrewBrain.walk(t, sl.phase, run)
		return CrewModel.PROP_NONE
	sl.want_yaw = g.side * PI * 0.5
	var si := Ship.side_index(g.side)
	var reload := sh.reload[si]
	var p := 1.0 - reload / sh.reload_full[si]
	var fired := sh.gun_fired_at[g.muzzle] if g.muzzle < sh.gun_fired_at.size() else -100.0
	var since := time - fired
	var volley := volley_at[si]
	# the volley is rippling down the battery but this gun hasn't gone yet: the match to the touch-hole
	if reload > 0.0 and fired < volley and time - volley < 1.2:
		t[CrewModel.P_ARM_RX] = 1.0
		t[CrewModel.P_ELBOW_R] = 0.15
		t[CrewModel.P_ARM_LX] = 0.2
		t[CrewModel.P_ARM_LZ] = 0.5
		t[CrewModel.P_ELBOW_L] = 0.9
		t[CrewModel.P_SPINE_X] = 0.4
		t[CrewModel.P_HEAD_X] = 0.1
		t[CrewModel.P_LEG_LX] = 0.45
		t[CrewModel.P_KNEE_L] = 0.4
		t[CrewModel.P_LEG_RX] = -0.3
		t[CrewModel.P_ROOT_Y] = -0.08
		return CrewModel.PROP_LINSTOCK
	if since >= 0.0 and since < 0.85:
		# the gun bucks back on its breeching: jump clear, arm up against the blast
		var k := sin(minf(1.0, since / 0.85) * PI)
		t[CrewModel.P_SPINE_X] = -0.3 * k
		t[CrewModel.P_SPINE_Y] = 0.3 * k
		t[CrewModel.P_ARM_LX] = 1.7
		t[CrewModel.P_ELBOW_L] = 1.9
		t[CrewModel.P_ARM_RX] = 0.4
		t[CrewModel.P_ARM_RZ] = 0.6
		t[CrewModel.P_LEG_LX] = -0.3 * k
		t[CrewModel.P_LEG_RX] = 0.35 * k
		t[CrewModel.P_KNEE_R] = 0.5 * k
		t[CrewModel.P_HEAD_X] = 0.3
		t[CrewModel.P_HEAD_Y] = -0.5 * k
		t[CrewModel.P_ROOT_Y] = 0.06 * k
		return CrewModel.PROP_LINSTOCK
	if reload > 0.0:
		if p < 0.45 or (p >= 0.6 and p < 0.84):
			# sponge out, then ram home: the staff drives in and out through the port
			var ram := p >= 0.6
			var w := (p - 0.6) / 0.24 * PI * 4.0 if ram else p / 0.45 * PI * 6.0
			var push := 0.5 + 0.5 * cos(w)
			t[CrewModel.P_ARM_RX] = 1.45
			t[CrewModel.P_ARM_LX] = 1.4
			t[CrewModel.P_ARM_RZ] = -0.1
			t[CrewModel.P_ARM_LZ] = -0.25
			t[CrewModel.P_ELBOW_R] = 0.15 + 1.0 * push
			t[CrewModel.P_ELBOW_L] = 0.3 + 1.0 * push
			t[CrewModel.P_SPINE_X] = 0.35 + 0.2 * (1.0 - push)
			t[CrewModel.P_HEAD_X] = -0.15
			t[CrewModel.P_LEG_LX] = 0.45
			t[CrewModel.P_KNEE_L] = 0.45
			t[CrewModel.P_LEG_RX] = -0.3
			t[CrewModel.P_KNEE_R] = 0.1
			t[CrewModel.P_ROOT_Y] = -0.09
			return CrewModel.PROP_RAMMER
		if p < 0.6:
			# cartridge and ball into the muzzle
			t[CrewModel.P_SPINE_X] = 0.5
			CrewBrain.crouch(t, 0.75)
			t[CrewModel.P_ARM_LX] = 1.1
			t[CrewModel.P_ARM_RX] = 1.1
			t[CrewModel.P_ELBOW_L] = 0.5 + 0.3 * sin(tt * 5.0)
			t[CrewModel.P_ELBOW_R] = 0.5 + 0.3 * sin(tt * 5.0 + 1.0)
			t[CrewModel.P_ARM_LZ] = -0.2
			t[CrewModel.P_ARM_RZ] = -0.2
			return CrewModel.PROP_NONE
		# run her out: heave on the gun tackle
		var w := sin(tt * 4.5)
		t[CrewModel.P_SPINE_X] = -0.25 + 0.12 * w
		t[CrewModel.P_ARM_LX] = 0.9
		t[CrewModel.P_ARM_RX] = 0.9
		t[CrewModel.P_ELBOW_L] = 0.25 + 0.25 * w
		t[CrewModel.P_ELBOW_R] = 0.25 + 0.25 * w
		t[CrewModel.P_LEG_LX] = 0.5
		t[CrewModel.P_KNEE_L] = 0.6
		t[CrewModel.P_LEG_RX] = -0.2
		t[CrewModel.P_KNEE_R] = 0.35
		t[CrewModel.P_ROOT_Y] = -0.12
		return CrewModel.PROP_NONE
	# loaded and run out: crouched by the breech, match smouldering, eyes on the enemy
	t[CrewModel.P_SPINE_X] = 0.28 + sin(tt * 1.4) * 0.03
	CrewBrain.crouch(t, 0.45)
	t[CrewModel.P_ARM_RX] = 0.75
	t[CrewModel.P_ELBOW_R] = 0.45
	t[CrewModel.P_ARM_LX] = 0.35
	t[CrewModel.P_ARM_LZ] = 0.25
	t[CrewModel.P_ELBOW_L] = 0.9
	t[CrewModel.P_HEAD_X] = -0.3
	if enemy != null:
		t[CrewModel.P_HEAD_Y] = clampf(MathX.angle_delta(sl.yaw, _yaw_to(enemy.pos)), -0.8, 0.8)
	return CrewModel.PROP_LINSTOCK


# ------------------------------------------------------------------ abandon ship

## She's going down: the captain salutes and goes down with her, the
## helmsman fights the wheel to the last, and everyone else makes for the
## high side and goes over.
func _founder(sl: Sailor, dt: float, world: World) -> void:
	var sh := ship
	var t := sl.target
	var tt := world.time * sl.tempo + sl.seed
	sl.seat = -1
	sl.y += (0.0 - sl.y) * MathX.damp(6.0, dt)
	sl.prop = CrewModel.PROP_NONE
	if sl.role == Sailor.Role.CAPTAIN:
		sl.act = Sailor.Act.SALUTE
		if sl.walking_to:
			_step_walk(sl, dt)
			CrewBrain.walk(t, sl.phase, 0.0)
		else:
			t[CrewModel.P_ARM_RX] = 2.0
			t[CrewModel.P_ARM_RZ] = 0.3
			t[CrewModel.P_ELBOW_R] = 1.7
			t[CrewModel.P_HEAD_X] = -0.15
			sl.want_yaw = 0.0
	elif sl.role == Sailor.Role.HELM and sl.panic_delay > 1.1:
		sl.panic_delay -= dt
		t[CrewModel.P_ARM_LX] = 1.05 + sin(tt * 7.0) * 0.5
		t[CrewModel.P_ARM_RX] = 1.05 - sin(tt * 7.0) * 0.5
		t[CrewModel.P_ELBOW_L] = 0.6
		t[CrewModel.P_ELBOW_R] = 0.6
		t[CrewModel.P_SPINE_Y] = sin(tt * 3.5) * 0.25
		t[CrewModel.P_HEAD_Y] = sin(tt * 2.1) * 0.7
		CrewBrain.crouch(t, 0.25)
		sl.want_yaw = 0.0
	else:
		sl.act = Sailor.Act.PANIC
		sl.panic_delay -= dt
		if not sl.walking_to and not sl.bolting:
			# make for the high side and go over
			var side := sh.high_side()
			var at := clampf(t_of(sl.z) + rng.randf_range(-0.06, 0.06), sl.zone.t0, sl.zone.t1)
			sl.walk_to(side * (sl.zone.half_width(at) - 0.25), shape.z(at), true, true, side * PI * 0.5)
			sl.bolting = true
		if sl.walking_to and not _step_walk(sl, dt):
			CrewBrain.walk(t, sl.phase, 1.0, true)
			t[CrewModel.P_ARM_LX] = 2.4 + sin(tt * 11.0) * 0.4
			t[CrewModel.P_ARM_RX] = 2.2 + sin(tt * 12.0 + 1.0) * 0.4
			t[CrewModel.P_ARM_LZ] = 0.5
			t[CrewModel.P_ARM_RZ] = 0.5
		else:
			t[CrewModel.P_ARM_LX] = 0.6 + sin(tt * 9.0) * 0.5
			t[CrewModel.P_ARM_RX] = 0.6 + sin(tt * 8.0 + 2.0) * 0.5
			t[CrewModel.P_ARM_LZ] = 0.8
			t[CrewModel.P_ARM_RZ] = 0.8
			t[CrewModel.P_HEAD_Y] = sin(tt * 2.3) * 0.8
			CrewBrain.crouch(t, 0.3)
			if sl.panic_delay <= 0.0:
				_leap(sl)
	if sl.act == Sailor.Act.SALUTE:
		# stiff upper lip; the hand flat at the brim
		t[CrewModel.P_HAND_R] = 0.0
		t[CrewModel.P_BROW] = -0.2
		t[CrewModel.P_SMILE] = 0.1
		t[CrewModel.P_HAND_L] = 0.6
	else:
		# terror: brows up, mouth wide, hands splayed
		t[CrewModel.P_JAW] = 0.75 + 0.25 * sin(tt * 6.0)
		t[CrewModel.P_BROW] = 1.0
		t[CrewModel.P_SMILE] = -0.8
		t[CrewModel.P_HAND_L] = 0.0
		t[CrewModel.P_HAND_R] = 0.0
		t[CrewModel.P_GAZE_Y] = 0.2 * sin(tt * 2.0)
	if sl.mode != Sailor.Mode.ABOARD:
		return
	sl.settle(dt, 12.0, 10.0 if sl.walking_to else 6.0)
	# the sea comes over the rail: whoever is still aboard is swimming now (or gone down with her)
	var p := ship.transform * Vector3(sl.x, deck_y(sl.zone, sl.x, sl.z) + sl.y + 0.9, sl.z)
	if p.y < world.water_height(p.x, p.z):
		_to_world(sl)
		if sl.role == Sailor.Role.CAPTAIN:
			sl.mode = Sailor.Mode.GONE
		else:
			sl.mode = Sailor.Mode.SWIM
			sl.swim_t = 0.0
			sl.wy = world.water_height(sl.wx, sl.wz)


## Copies his place on deck into the world.
func _to_world(sl: Sailor) -> void:
	var p := ship.transform * Vector3(sl.x, deck_y(sl.zone, sl.x, sl.z) + sl.y, sl.z)
	sl.wx = p.x
	sl.wy = p.y
	sl.wz = p.z
	sl.yaw = ship.heading + sl.yaw
	sl.want_yaw = sl.yaw


## Over the side, from whichever rail he's nearest.
func _leap(sl: Sailor) -> void:
	_to_world(sl)
	var side := 1.0 if sl.x >= 0.0 else -1.0
	var port := ship.port_dir() * side
	var out := rng.randf_range(2.6, 3.6)
	sl.vx = ship.vel.x + port.x * out
	sl.vz = ship.vel.z + port.z * out
	sl.vy = rng.randf_range(3.2, 4.4)
	sl.mode = Sailor.Mode.AIR
	sl.yaw = atan2(port.x, port.z)
	sl.want_yaw = sl.yaw
