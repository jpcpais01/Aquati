class_name Ship
extends Node3D
## A ship under sail, and in a fight. She answers her helm and the canvas
## set, draws on the wind by her point of sail, slips a little to leeward,
## rides the swell, heels to the breeze and out of her turns, swings her yards
## and booms across on springs, and leaves a wake, a curling bow wave, spray
## and a wisp of galley smoke behind her. Her guns fire in a rippling
## broadside, laid on a ship (leading her) or a point on the sea; blows breach
## and flood her, set her burning when she is badly hurt, and the last one
## blows her magazine and sends her down (see ShipDamage). The web game's Ship.

## Point of sail (degrees off dead downwind) to speed factor.
const WIND_TABLE := [[0.0, 0.8], [40.0, 0.96], [90.0, 1.0], [120.0, 0.9], [145.0, 0.62], [165.0, 0.38], [180.0, 0.3]]
## Hull pressure along the keel: [fraction of length from midships, weight,
## radius in beams]. The bow shoves water up, the shoulders, waist and
## quarters draw it down and the stern lifts it again (net zero, so a ship
## hove to never digs a hole); the wake canvas grows the V-waves from it.
const HULL_PRESSURE := [[0.44, 1.0, 0.32], [0.24, -0.75, 0.36], [0.0, -0.5, 0.4], [-0.22, -0.35, 0.38], [-0.42, 0.6, 0.34]]
## Where along her keel she feels for the ground (fraction of length from midships).
const KEEL_PROBES := [0.46, 0.2, -0.1, -0.42]
const SPRAY := Color(1.4, 1.5, 1.55, 0.9)
const GRAVITY := 14.0
## How far the guns can train off the beam (rad): your crews, and a pirate's.
const PLAYER_ARC := 0.5
const PIRATE_ARC := 0.32
## Seconds a wreck lingers afloat before her final plunge.
const WRECK_LIFE := 180.0

enum Team { PLAYER, PIRATE }
const SMOKE := Color(0.82, 0.8, 0.78, 0.32)
const SMOKE_END := Color(1.05, 1.04, 1.02)

static var _count := 0

## A blow the helm feels (0..1): running aground, the first bite of a reef.
signal struck(amount: float)

var cls: ShipClass
var livery: Livery
var model: ShipModel
var bow_wave: BowWave
var world: World
var dmg: ShipDamage
var team := Team.PLAYER
var ship_name := ""

var hp := 0.0
var max_hp := 0.0
var alive := true
## Gone under (or sailed off the edge of the world): the game lets her go.
var removed := false
## Seconds since she went, and how long her wreck lingers afloat.
var sink_t := 0.0
var wreck_life := WRECK_LIFE
## Founders go down by the stern and settle on the seabed (your own ship, for
## the farewell); every other wreck slips under and is gone.
var founders := false
## Seconds left loading each broadside (port, starboard), and the full load.
var reload := PackedFloat32Array([0.0, 0.0])
var reload_full := PackedFloat32Array([1.0, 1.0])
## When each gun (model.muzzles) last went off, by the sea's clock: her gun crews jump clear.
var gun_fired_at := PackedFloat32Array()
var gold := 0
var kills := 0
var last_hit := -100.0
var last_attacker: Ship
## How the last blow came: "shot", "rammed" or "aground".
var last_cause := "shot"
## 0 .. 1: flames along her deck when badly hurt, and as the wreck goes down.
var burning := 0.0
## The shot her guns load for the next broadside (Ammo.ROUND ..).
var ammo := Ammo.ROUND
## With fireworks loaded, which kind goes up (Fireworks.ORDER).
var firework := "peony"
## The look of her guns going off and of her round shot's trail
## (Cosmetics.BLAST_STYLES / TRAIL_STYLES: your vault's, plain powder for anyone else).
var blast := 0
var trail := 0
## Seconds left burning (fire shot), and who lit her.
var afire := 0.0
var afire_by: Ship
## Seconds her canvas stays shredded (chain shot).
var torn := 0.0
## Seconds her gun crews stay thinned (grape shot).
var crew_hit := 0.0
## Her power, an event ship's (Haunt: the Hollow Jack's Phantom Run), or null.
var haunt: Haunt
## Crossed into the spirit world (Haunt): nothing can touch her.
var phantom := false

## Where she floats (y unused) and how she moves over the ground.
var pos := Vector3.ZERO
var vel := Vector3.ZERO
## Radians; 0 sails toward +Z, a positive turn swings the bow to port.
var heading := 0.0
var speed := 0.0
var ang_vel := 0.0
## -1 hard to starboard .. +1 hard to port.
var rudder := 0.0
## Canvas ordered (0 furled .. 1 all plain sail) and canvas actually set.
var sail_target := 0.5
var sail_level := 0.5
## A shove from another hull, bleeding off against the keel.
var drift := Vector2.ZERO
var anchored := false
## How hard her keel grinds on coral (0 clear .. 1 hard aground).
var scrape := 0.0
## The water's own flow under her (x, z m/s): a maelstrom's current, and
## the swing it gives her head (rad/s); both set each frame by the Hazards.
var current := Vector2.ZERO
var spin := 0.0
## How far a maelstrom's throat has dragged her under (0 .. 1: the sea over
## her rail), and whether it has taken her (no blast: she goes down the throat).
var drawn := 0.0
var swallowed := false

var _id := 0
var _heave := 0.0
var _pitch := 0.0
var _roll := 0.0
var _roll_kick := 0.0
var _wake_t := 0.0
var _spray_t := 0.0
var _galley_t := 0.0
# rig springs: the yards and booms swing across on a tack or gybe instead of snapping
var _rig_brace := 0.0
var _rig_brace_v := 0.0
var _rig_lee := 1.0
var _rig_lee_v := 0.0
var _lee_target := 1.0
var _rng := RandomNumberGenerator.new()
var _ground_cooldown := 0.0
var _scrape_t := 0.0
var _fire_t := 0.0
var _burn_acc := 0.0
var _burn_t := 0.0
# broadside guns waiting their turn in the ripple: [time, muzzle index, target, point, shot]
var _pending: Array = []


## `p_model` may be one the shipyard built ahead of time; one built here
## carries `p_fit`, her refit (Parts). She sails and fights with her class's
## figures refitted with what her model carries.
static func create(p_cls: ShipClass, p_livery: Livery, p_world: World, p_team: Team = Team.PLAYER, p_model: ShipModel = null, p_fit: Dictionary = {}) -> Ship:
	var s := Ship.new()
	_count += 1
	s._id = _count
	s.name = "Ship%d" % _count
	s.model = p_model if p_model != null else ShipModel.create(p_cls, p_livery, true, p_fit)
	var c := Parts.refit(p_cls, s.model.fit)
	s.cls = c
	s.livery = p_livery
	s.world = p_world
	s.team = p_team
	s.ship_name = c.title
	s.max_hp = c.hp
	s.hp = c.hp
	s.reload_full = PackedFloat32Array([c.reload, c.reload])
	s._rng.seed = 977 * _count
	s._galley_t = s._rng.randf()
	s.add_child(s.model)
	if c.ability == "phantom":
		s.haunt = Haunt.new(s)
	s.gun_fired_at.resize(s.model.muzzles.size())
	s.gun_fired_at.fill(-100.0)
	s.dmg = ShipDamage.new(s)
	s.bow_wave = BowWave.new()
	s.bow_wave.setup(s.model.shape, p_cls)
	s.add_child(s.bow_wave)
	return s


## A fresh hull of her class in place of the one she wears (her paintwork
## or her parts changed in the Shipwright): she rides on as she was, her crew
## aboard, with the figures of the refit it carries (as hale as she was).
## Only for a ship that hasn't been in a fight (her wounds live on the old one).
func refit(p_model: ShipModel) -> void:
	var hale := hp / max_hp if max_hp > 0.0 else 1.0
	cls = Parts.refit(cls, p_model.fit)
	max_hp = cls.hp
	hp = max_hp * hale
	var old := model
	var at := old.get_index()
	p_model.transform = old.transform
	remove_child(old)
	old.queue_free()
	model = p_model
	add_child(model)
	move_child(model, at)
	dmg = ShipDamage.new(self)


func forward() -> Vector3:
	return Vector3(sin(heading), 0.0, cos(heading))


## The port beam (her left hand, looking forward).
func port_dir() -> Vector3:
	return Vector3(cos(heading), 0.0, -sin(heading))


## Her guns' muzzle velocity with a kind of shot (the one loaded by
## default): lighter and lumpier shot flies slower and falls shorter.
func muzzle_speed(kind: int = -1) -> float:
	return cls.muzzle_speed * float(Ammo.SPEED[ammo if kind < 0 else kind])


## The reach of her guns (m) at the usual elevations, with the shot loaded.
func gun_range(kind: int = -1) -> float:
	var v := muzzle_speed(kind)
	return v * v / GRAVITY * 0.62


## The elevation (rad) that drops a ball at speed v onto a mark d metres off
## and h metres above the muzzle (the flatter of the two arcs).
static func elevation_for(v: float, d: float, h: float) -> float:
	if d < 0.01:
		return 0.0
	var a := GRAVITY * d * d / (2.0 * v * v)
	var disc := d * d - 4.0 * a * (a + h)
	if disc < 0.0:
		return PI * 0.25
	return atan((d - sqrt(disc)) / (2.0 * a))


## Where chain shot is laid: the middle of her canvas.
func sail_aim_height() -> float:
	var top := 0.0
	for m: Dictionary in cls.masts:
		top = maxf(top, float(m.height))
	return model.shape.top(0.5) + 0.6 + top * 0.42


## How hard the yards and booms are swinging across (the hands tail on to the braces).
func rig_activity() -> float:
	return absf(_rig_brace_v) + absf(_rig_lee_v) * 0.5


## The side heeled up out of the water: +1 port, -1 starboard.
func high_side() -> int:
	return 1 if _roll >= 0.0 else -1


## Index into reload for a side (+1 port, -1 starboard).
static func side_index(side: int) -> int:
	return 0 if side > 0 else 1


func can_fire(side: int) -> bool:
	return alive and reload[side_index(side)] <= 0.0


## Reload progress of a side: 0 just fired .. 1 run out.
func readiness(side: int) -> float:
	var i := side_index(side)
	return clampf(1.0 - reload[i] / reload_full[i], 0.0, 1.0)


## Begins a rippling broadside from one side (+1 port, -1 starboard), laid on
## a ship (led) or a point on the sea, or square off the beam. False while
## the guns are still loading.
func fire(side: int, target: Ship = null, point: Variant = null) -> bool:
	if not can_fire(side):
		return false
	var ms: Array[int] = []
	for i in model.muzzles.size():
		if int(model.muzzles[i].side) == side:
			ms.append(i)
	# from the middle outward, for a rolling thunder
	ms.sort_custom(func(a: int, b: int) -> bool: return absf((model.muzzles[a].pos as Vector3).z) < absf((model.muzzles[b].pos as Vector3).z))
	if ammo == Ammo.FIREWORK:
		# rockets: a showpiece goes up off the middle gun with a white salute
		# either side; anything else, up to four guns spread along the side,
		# one after another
		var show := Fireworks.tier(firework) == 2
		var n := mini(3 if show else 4, ms.size())
		var along := ms.duplicate()
		along.sort_custom(func(a: int, b: int) -> bool: return (model.muzzles[a].pos as Vector3).z < (model.muzzles[b].pos as Vector3).z)
		for k in n:
			var gun: int = ms[k] if show else along[mini(along.size() - 1, floori((k + 0.5) * along.size() / n))]
			_pending.append([world.time + (k * 0.4 if show else k * 0.22 + randf() * 0.06), gun, null, null, ammo, firework, k, n])
	else:
		for k in ms.size():
			_pending.append([world.time + k * 0.085 + randf() * 0.05, ms[k], target, point, ammo])
	var si := side_index(side)
	reload[si] = cls.reload * float(Ammo.RELOAD[ammo])
	reload_full[si] = reload[si]
	_roll_kick += side * 0.05 * (cls.cannons_per_side / 5.0) / cls.mass * (0.2 if ammo == Ammo.FIREWORK else 1.0)
	return true


## One gun of the ripple going off: the shot laid on its mark (a bag of
## grape bursting out in a cone, chain laid high into her canvas), the flash
## and the smoke.
func _shoot(p: Array) -> void:
	var m: Dictionary = model.muzzles[int(p[1])]
	gun_fired_at[int(p[1])] = world.time
	var kind: int = p[4]
	var at := transform * (m.pos as Vector3)
	var dir := Basis(Vector3.UP, heading) * (m.dir as Vector3)
	if kind == Ammo.FIREWORK:
		dir = Vector3(dir.x, 0.0, dir.z).normalized()
		if world.sky != null:
			world.sky.launch(str(p[5]), at, dir, vel, int(p[6]), int(p[7]))
		world.fx.shot_muzzle(at, dir, vel, kind)
		if team == Team.PLAYER:
			world.shook.emit(0.08)
		return
	var v := muzzle_speed(kind) * randf_range(0.97, 1.03)
	var mine := team == Team.PLAYER
	var dist := 60.0
	var target: Ship = p[2]
	var aim: Variant = p[3]
	var aim_h := NAN
	if target != null and target.alive:
		aim = target.pos
		if kind == Ammo.CHAIN:
			aim_h = target.position.y + target.sail_aim_height() - at.y
	if aim != null:
		# Lead the mark. Your own crews also allow for the ship's way, which the
		# ball keeps (in a running duel that drift alone would carry whole
		# broadsides past her bow); pirate crews only lead their mark.
		var tv := target.vel if target != null and target.alive else Vector3.ZERO
		var rvx := tv.x - (vel.x if mine else 0.0)
		var rvz := tv.z - (vel.z if mine else 0.0)
		var a: Vector3 = aim
		var tof := Vector2(a.x - at.x, a.z - at.z).length() / (v * 0.95)
		var lead := Vector2.ZERO
		for it in 2:
			lead = Vector2(a.x + rvx * tof - at.x, a.z + rvz * tof - at.z)
			var e := elevation_for(v, lead.length(), aim_h) if not is_nan(aim_h) else 0.5 * asin(clampf(GRAVITY * lead.length() / (v * v), 0.0, 1.0))
			tof = lead.length() / (v * cos(e))
		dist = lead.length()
		var base := atan2(dir.x, dir.z)
		var arc := PLAYER_ARC if mine else PIRATE_ARC
		var fa := base + clampf(MathX.angle_delta(base, atan2(lead.x, lead.y)), -arc, arc)
		dir = Vector3(sin(fa), 0.0, cos(fa))
	var elev: float
	if not is_nan(aim_h):
		elev = clampf(elevation_for(v, dist, aim_h), -0.05, 0.7)
	else:
		elev = clampf(0.5 * asin(clampf(GRAVITY * dist / (v * v), 0.0, 1.0)), 0.015, 0.47)
	# pirate gun crews are a little less disciplined than yours
	var sloppy := 1.0 if mine else 2.4
	var yaw := atan2(dir.x, dir.z) + (randf() - 0.5) * 0.035 * sloppy
	var pitch := elev + (randf() - 0.5) * 0.02 * sloppy
	var spread: float = Ammo.SPREAD[kind]
	var dealt := cls.damage * float(Ammo.DAMAGE[kind])
	for b in int(Ammo.BALLS[kind]):
		# the first ball flies true, the rest of the bag scatters
		var fy := yaw + ((randf() - 0.5) * 2.0 * spread if b > 0 else 0.0)
		var fp := pitch + ((randf() - 0.5) * spread if b > 0 else 0.0)
		var vk := randf_range(0.94, 1.04) if b > 0 else 1.0
		var bv := Vector3(sin(fy) * cos(fp), sin(fp), cos(fy) * cos(fp)) * v * vk + vel
		world.shots.fire(at, bv, self, dealt, kind, trail)
	world.fx.muzzle(at, dir, vel, blast)
	if kind != Ammo.ROUND:
		world.fx.shot_muzzle(at, dir, vel, kind)
	if blast == Particles.THUNDER:
		# the thunderclap's shockwave rings out across the water
		var w := at + dir * 2.5
		world.wake.stamp(w.x, w.z, 4.0, 0.9, true)
		world.wake.push(w.x, w.z, 2.2, -0.25)
	if world.sound != null:
		var h := world.heard(at)
		world.sound.cannon(h.x, h.y, h.z, clampf((cls.length - 15.0) / 14.0, 0.0, 1.0))
	world.shook.emit(0.35 if mine else 0.12 * world.loudness(at))


## A blow to her (a ball, a ram, the ground), at a world point or anywhere
## along her side; `hull` false for one that misses her timbers. Returns the
## damage done, after her armour.
func damage(amount: float, attacker: Ship, at: Variant = null, hull: bool = true, cause: String = "shot") -> float:
	if not alive or phantom:
		return 0.0
	var d := amount * (1.0 - cls.armor) * randf_range(0.85, 1.15)
	hp -= d
	if hull:
		dmg.on_hit(at, d)
	last_hit = world.time
	last_cause = cause
	if attacker != null:
		last_attacker = attacker
	_roll_kick += (randf() - 0.5) * 0.04
	if hp <= 0.0:
		die(attacker)
	return d


## She's done for: the magazine goes up, and the wreck begins to settle.
func die(attacker: Ship) -> void:
	if not alive:
		return
	hp = 0.0
	alive = false
	sink_t = 0.0
	_pending.clear()
	if attacker != null:
		attacker.kills += 1
	if swallowed:
		# no blast: the sea closes over her rail and she goes, in a burst of white water
		for i in 3:
			var a := (i / 3.0 - 0.33) * cls.length
			world.fx.splash(Vector3(pos.x + sin(heading) * a, position.y + 0.5, pos.z + cos(heading) * a), 0.9 + i * 0.2)
		if world.sound != null:
			var h := world.heard(pos)
			world.sound.splash(h.x, h.y, h.z)
	else:
		world.fx.explosion(Vector3(pos.x, model.shape.main_deck_y(0.5), pos.z), 0.6 + cls.length / 40.0)
		if world.sound != null:
			var h := world.heard(pos)
			world.sound.explosion(h.x, h.y, h.z)
	world.shook.emit(1.2 if team == Team.PLAYER else 0.5 * world.loudness(pos))
	dmg.on_death()
	world.sunk.emit(self, attacker)


## Fire shot struck home: she burns the longer for every ball. True if she
## has only just caught.
func ignite(by: Ship) -> bool:
	if not alive or phantom:
		return false
	var fresh := afire <= 0.0
	afire = minf(Ammo.BURN_MAX, maxf(0.0, afire) + Ammo.BURN_PER_HIT)
	if by != null:
		afire_by = by
		last_attacker = by
	last_hit = world.time
	return fresh


## Chain shot tore through her canvas. True if her sails were whole a moment ago.
func shred(by: Ship) -> bool:
	if not alive or phantom:
		return false
	var fresh := torn <= 0.0
	torn = Ammo.TORN_TIME
	if by != null:
		last_attacker = by
	last_hit = world.time
	return fresh


## Grape shot swept her deck. True if her gun crews were at full strength.
func rake(by: Ship) -> bool:
	if not alive or phantom:
		return false
	var fresh := crew_hit <= 0.0
	crew_hit = Ammo.CREW_TIME
	if by != null:
		last_attacker = by
	last_hit = world.time
	return fresh


func place(x: float, z: float, h: float) -> void:
	pos = Vector3(x, 0.0, z)
	heading = h
	speed = 0.0
	ang_vel = 0.0
	drawn = 0.0
	current = Vector2.ZERO
	spin = 0.0
	_heave = world.water_height(x, z) + world.funnel_at(x, z)
	step(0.0)


## How far below her riding height a maelstrom has dragged her (m).
func drawn_sink() -> float:
	return pow(minf(drawn, 1.2), 1.6) * (cls.freeboard + cls.draft * 0.35)


## Points of sail: how much of her best speed the wind gives her.
static func wind_factor(rel_deg: float) -> float:
	var a := absf(rel_deg)
	for i in range(1, WIND_TABLE.size()):
		if a <= WIND_TABLE[i][0]:
			var a0: float = WIND_TABLE[i - 1][0]
			var f0: float = WIND_TABLE[i - 1][1]
			var t: float = (a - a0) / (float(WIND_TABLE[i][0]) - a0)
			return lerpf(f0, WIND_TABLE[i][1], t * t * (3.0 - 2.0 * t))
	return 0.3


func step(dt: float) -> void:
	var c := cls
	# ------------------------------------------------ cannons
	if not _pending.is_empty():
		for i in range(_pending.size() - 1, -1, -1):
			if world.time >= float(_pending[i][0]):
				var p: Array = _pending[i]
				_pending.remove_at(i)
				if alive:
					_shoot(p)
	# grape thinned her gun crews: the survivors load slower
	var rl := dt * (Ammo.CREW_RELOAD if crew_hit > 0.0 else 1.0)
	reload[0] = maxf(0.0, reload[0] - rl)
	reload[1] = maxf(0.0, reload[1] - rl)
	crew_hit = maxf(0.0, crew_hit - dt)
	torn = maxf(0.0, torn - dt)
	if afire > 0.0:
		_burn(dt)
	if haunt != null:
		haunt.update(dt)

	var fwd := forward()
	var fx := fwd.x
	var fz := fwd.z
	var w := world.wind
	# 0 = running dead downwind
	var rel := MathX.angle_delta(atan2(w.dir_x, w.dir_z), heading)
	var rel_deg := rad_to_deg(rel)
	var gust := world.gust_at(pos.x, pos.z)

	# ------------------------------------------------ sailing
	if alive:
		sail_level += clampf(sail_target - sail_level, -dt * 0.6, dt * 0.6)
		# a battered hull drags: she loses way as she floods
		var hp_f := 0.72 + 0.28 * (hp / max_hp)
		var wf := wind_factor(rel_deg) * (0.75 + 0.25 * w.strength) * (1.0 + gust * 0.08)
		# every mast shot away takes a share of her canvas with it, and shredded
		# canvas (chain shot) draws far less wind until it's mended
		var torn_k := 1.0 - Ammo.TORN_SLOW * minf(1.0, torn / 3.0)
		var target := c.max_speed * sail_level * wf * hp_f * dmg.speed_factor() * torn_k
		if phantom:
			# a ghost runs before a wind of her own
			target = maxf(target, c.max_speed * maxf(sail_level, 0.5)) * Haunt.SPEED
		var rate := c.accel if target > speed else c.accel * 1.4
		speed += (target - speed) * MathX.damp(rate, dt)
		var steer := clampf(0.28 + 0.9 * (speed / c.max_speed), 0.28, 1.1)
		var target_ang := rudder * c.turn_rate * steer * (Haunt.TURN if phantom else 1.0)
		ang_vel += (target_ang - ang_vel) * MathX.damp(2.6 / sqrt(c.mass), dt)
		speed *= 1.0 - absf(ang_vel) * 0.08 * dt
	else:
		# the wreck loses way, her canvas hanging in rags
		speed *= 1.0 - MathX.damp(0.8, dt)
		ang_vel *= 1.0 - MathX.damp(1.0, dt)
		sail_level = maxf(0.0, sail_level - dt * 0.3)
	if anchored:
		speed = 0.0
		ang_vel = 0.0
	heading = wrapf(heading + (ang_vel + spin) * dt, -PI, PI)

	# leeway: a little sideways slip with the wind
	var port := port_dir()
	var cross := w.dir_x * port.x + w.dir_z * port.z
	var slip := cross * 0.35 * sail_level * w.strength
	drift *= 1.0 - MathX.damp(1.5, dt)
	vel = Vector3(fx * speed + port.x * slip + drift.x + current.x, 0.0, fz * speed + port.z * slip + drift.y + current.y)
	pos.x += vel.x * dt
	pos.z += vel.z * dt

	var L := c.length
	var B := c.beam
	_land(dt, fx, fz, L)
	# the edge of the known sea: past it the swell turns her back
	var over := world.past_edge(pos.x, pos.z)
	if over.z > 0.0:
		pos.x += over.x * over.z * 0.05
		pos.z += over.y * over.z * 0.05

	# ------------------------------------------------ buoyancy
	var hb := world.water_height(pos.x + fx * L * 0.38, pos.z + fz * L * 0.38)
	var hs := world.water_height(pos.x - fx * L * 0.38, pos.z - fz * L * 0.38)
	var h_port := world.water_height(pos.x + port.x * B * 0.5, pos.z + port.z * B * 0.5)
	var h_stbd := world.water_height(pos.x - port.x * B * 0.5, pos.z - port.z * B * 0.5)
	var resp := MathX.damp(3.2 / c.mass, dt) if dt > 0.0 else 1.0
	# a maelstrom's funnel is no swell to ride over: she sits down its wall at once
	var funnel := world.funnel_at(pos.x, pos.z) if not world.vortices.is_empty() else 0.0
	var target_heave := (hb + hs + h_port + h_stbd) * 0.25 + funnel
	var target_pitch := -atan2(hb - hs, L * 0.76) * 0.9
	var target_roll := atan2(h_port - h_stbd, B) * 0.8
	# heel out of the turn, and to leeward under the press of canvas
	target_roll += ang_vel * speed * 0.022
	target_roll += -cross * sail_level * w.strength * 0.07 / sqrt(c.mass)
	_roll_kick *= 1.0 - MathX.damp(2.2, dt)
	target_roll += _roll_kick
	var sink_y := 0.0
	var swell := 1.0
	if not alive:
		# the wreck settles into her last pose and lingers before slipping under;
		# once she's under, the swell no longer lifts her
		sink_t += dt
		dmg.wreck_pose(sink_t, dt)
		sink_y = dmg.pose_y
		swell = dmg.afloat
		target_pitch = target_pitch * 0.3 * swell + dmg.pose_pitch
		target_roll = target_roll * 0.3 * swell + dmg.pose_roll
		if dmg.done:
			removed = true
	elif dt > 0.0:
		# flooding: she rides lower and lists toward her holes
		dmg.update(dt)
		sink_y = -dmg.lowered
		target_roll += dmg.list
		if drawn > 0.0:
			# a maelstrom's throat dragging her down: settling by the head, her
			# timbers shuddering, till the sea comes in over the rail
			var d := drawn
			sink_y -= drawn_sink()
			target_pitch += d * d * 0.22
			target_roll += sin(world.time * 7.3 + pos.x) * 0.03 * d + sin(world.time * 2.1) * 0.05 * d
			if randf() < dt * 6.0 * d:
				# green water pouring in over her gunwales
				var a := randf_range(-0.4, 0.4) * c.length
				var side := 1.0 if randf() < 0.5 else -1.0
				var gx := pos.x + fx * a + port.x * side * c.beam * 0.5
				var gz := pos.z + fz * a + port.z * side * c.beam * 0.5
				world.fx.splash(Vector3(gx, world.water_height(gx, gz), gz), 0.3 + d * 0.35)
	_heave += (target_heave - _heave) * resp
	_pitch += (target_pitch - _pitch) * resp
	_roll += (target_roll - _roll) * resp
	transform = Transform3D(Basis.from_euler(Vector3(_pitch, heading, _roll)), Vector3(pos.x, _heave - funnel + sink_y - c.draft * 0.06, pos.z))

	# ------------------------------------------------ the rig
	var brace_target := clampf(rel * 0.45, -0.75, 0.75) * minf(1.0, absf(rel_deg) / 30.0)
	# hysteresis, so the canvas doesn't flicker sides dead on or off the wind
	if cross > 0.06:
		_lee_target = 1.0
	elif cross < -0.06:
		_lee_target = -1.0
	# slightly under-damped springs, slower on heavier hulls: a weighty swing with a soft settle
	var rig_k := 26.0 / sqrt(c.mass)
	var rig_c := 2.0 * sqrt(rig_k) * 0.72
	var rdt := minf(dt, 0.1)
	while rdt > 0.0:
		var h := minf(rdt, 1.0 / 60.0)
		rdt -= h
		_rig_brace_v += ((brace_target - _rig_brace) * rig_k - _rig_brace_v * rig_c) * h
		_rig_brace += _rig_brace_v * h
		_rig_lee_v += ((_lee_target - _rig_lee) * rig_k * 0.8 - _rig_lee_v * rig_c) * h
		_rig_lee = clampf(_rig_lee + _rig_lee_v * h, -1.08, 1.08)
	# the pennant streams downwind, in the ship's own frame
	var lx := w.dir_x * port.x + w.dir_z * port.z
	var lz := w.dir_x * fx + w.dir_z * fz
	var flag_ang := atan2(-lz, lx)
	# the canvas spills and luffs while it crosses over, then fills on the new side; gusts puff it out
	var fill := clampf(wind_factor(rel_deg) * w.strength * (1.1 + gust * 0.45), 0.25, 1.25) * (0.3 + 0.7 * minf(1.0, absf(_rig_lee)))
	model.update_rig(sail_level, -_rig_brace, _rig_lee, flag_ang, fill, clampf(w.strength * (1.0 + gust * 0.5), 0.2, 1.4))
	model.tick(world.time)

	if dt <= 0.0:
		return
	_wake(dt, fx, fz, port, L, B)
	if alive:
		_galley(dt, w)
	_flames(dt, swell)


## Fire shot burning her: the flames eat her hull in bites, told as they land.
func _burn(dt: float) -> void:
	afire -= dt
	if alive:
		_burn_acc += max_hp * Ammo.BURN_RATE * dt
		_burn_t += dt
		if _burn_t >= 0.8 or afire <= 0.0:
			var by := afire_by
			var d := damage(_burn_acc, by, null, false)
			_burn_acc = 0.0
			_burn_t = 0.0
			world.burned.emit(self, by, d)
			if world.sound != null and randf() < 0.5:
				var h := world.heard(pos)
				world.sound.flames(h.x, h.y, h.z)
	if afire <= 0.0:
		afire = 0.0
		afire_by = null


## Fires when she is badly hurt, or set alight by fire shot (the flames run
## along her whole deck), or going down, doused as she goes under.
func _flames(dt: float, swell: float) -> void:
	var f := hp / max_hp
	if alive:
		burning = (0.4 - f) / 0.4 if f < 0.4 else 0.0
		if afire > 0.0:
			burning = maxf(burning, 0.55 + 0.45 * minf(1.0, afire / 8.0))
	else:
		burning = (1.0 - sink_t / 26.0) * swell * swell * swell if sink_t < 22.0 else 0.0
	if burning <= 0.0:
		return
	_fire_t += dt * (2.0 + burning * 10.0)
	while _fire_t > 1.0:
		_fire_t -= 1.0
		var p: Variant = dmg.fire_point()
		if p != null:
			world.fx.flame(p, 0.7 + burning * 0.6)


## The ground under her keel. A beach or a rock shelf shoves her back off
## (hard, if she ran onto it at speed); open-sea coral is a crest she either
## clears or grinds across, by how much water she draws.
func _land(dt: float, fx: float, fz: float, L: float) -> void:
	var c := cls
	_ground_cooldown -= dt
	var grind := 0.0
	var gp := Vector2.ZERO
	for pf: float in KEEL_PROBES:
		var px := pos.x + fx * L * pf
		var pz := pos.z + fz * L * pf
		var h := world.ground_height(px, pz)
		var reef := world.reef_at(px, pz) if h < 0.0 else 0.0
		if reef > 0.3:
			var k := clampf((h + c.draft * 0.95) / 0.9, 0.0, 1.0) * smoothstep(0.3, 0.6, reef)
			if k > grind:
				grind = k
				gp = Vector2(px, pz)
			continue
		var lim := -c.draft * 0.75
		if h <= lim:
			continue
		# up the slope she came: straight back down it
		var g := world.ground_gradient(px, pz)
		var gl := maxf(g.length(), 1e-3)
		var push := minf(2.5, (h - lim) * 0.6 + 0.05)
		pos.x -= g.x / gl * push
		pos.z -= g.y / gl * push
		if speed > 3.5 and _ground_cooldown <= 0.0 and alive:
			_ground_cooldown = 1.2
			damage(speed * 1.8, null, Vector3(px, 0.2, pz), true, "aground")
			world.fx.sand_hit(Vector3(px, 0.5, pz))
			world.fx.splash(Vector3(px, world.water_height(px, pz), pz), 0.5 + minf(0.6, speed / 25.0))
			if world.sound != null:
				var ear := world.heard(pos)
				world.sound.crunch(ear.x, ear.y, ear.z, minf(1.0, speed / 12.0))
				world.sound.thud(ear.x, ear.y, ear.z)
			struck.emit(0.5)
		# the bow ploughing in stops her hardest
		speed *= pow(0.86 if pf > 0.3 else 0.95, dt * 60.0)
	_grind_reef(grind, gp, dt)


## Her keel on coral (k 0..1, deepest at p): it drags her up short and
## stiffens her helm, in shuddering bites, the first strike the worst. Hard
## aground she barely moves until she works her way off into deeper water.
func _grind_reef(k: float, p: Vector2, dt: float) -> void:
	var was := scrape
	scrape += (k - scrape) * MathX.damp(14.0 if k > scrape else 5.0, dt)
	if k < 0.02:
		return
	var spd := absf(speed)
	speed *= 1.0 - MathX.damp(k * 1.35, dt)
	ang_vel *= 1.0 - MathX.damp(k * 1.8, dt)
	var strike := was < 0.06 and spd > 1.5
	_scrape_t -= dt
	if _scrape_t > 0.0 and not strike:
		return
	_scrape_t = 0.5 + _rng.randf() * 0.15
	# she shudders, throws up a cloud of churned sand and splintered coral, and foams at the hull
	kick_roll((_rng.randf() - 0.5) * 0.06 * k + (signf(_rng.randf() - 0.5) * 0.05 if strike else 0.0))
	var wy := world.water_height(p.x, p.y)
	world.fx.sand_hit(Vector3(p.x, wy + 0.1, p.y))
	if strike or _rng.randf() < 0.5:
		world.fx.splash(Vector3(p.x, wy, p.y), 0.35 + k * 0.4 + (0.3 if strike else 0.0))
	world.wake.stamp(p.x, p.y, cls.beam * 0.7, 0.35 * k)
	if world.sound != null:
		var h := world.heard(pos)
		world.sound.scrape(h.x, h.y, h.z, k, strike)
	if strike:
		struck.emit(0.45 * k + 0.15)


func _wake(dt: float, fx: float, fz: float, port: Vector3, L: float, B: float) -> void:
	var wake := world.wake
	var spd := absf(speed)
	# a wreck's wake dies away as she settles
	var wake_k := 1.0 if alive else maxf(0.0, 1.0 - sink_t / 3.0)
	if spd > 0.3 and wake_k > 0.0:
		# pressure every frame: the canvas grows the Kelvin arms and the transverse
		# swell from it. The bow surges and eases as she pitches and the hull yaws a
		# touch, so the arms come out uneven; a little jitter roughens the crests.
		var tt := world.time + _id * 7.31
		var surge := 1.0 + 0.22 * sin(tt * 1.37) * sin(tt * 0.53 + 1.1) + _pitch * 3.0
		var press := 10.5 * (minf(spd, 16.0) / 12.0) * sqrt(B / 6.2) * wake_k * dt * maxf(0.5, surge)
		var yaw := sin(tt * 0.71) * 0.12 * B
		for hpr: Array in HULL_PRESSURE:
			var u: float = hpr[0]
			var j := (_rng.randf() - 0.5) * 0.16 * B + yaw * u * 2.0
			var a := 1.0 + (_rng.randf() - 0.5) * 0.35
			wake.press(pos.x + fx * L * u + port.x * j, pos.z + fz * L * u + port.z * j, B * float(hpr[2]) * (0.9 + _rng.randf() * 0.2), press * float(hpr[1]) * a)
	_wake_t += dt
	if _wake_t > 0.04 and spd > 0.5 and wake_k > 0.0:
		_wake_t = 0.0
		var k := clampf(spd / 12.0, 0.0, 1.25) * wake_k
		# the stern: churned white wash, a dense core with ragged eddies tumbling off it
		var sx := pos.x - fx * L * 0.5
		var sz := pos.z - fz * L * 0.5
		wake.stamp(sx, sz, B * 0.5, 0.3 * k)
		for i in 2:
			var o := (_rng.randf() - 0.5) * B * 0.8
			var a := _rng.randf() * L * 0.12
			wake.stamp(sx + port.x * o - fx * a, sz + port.z * o - fz * a, B * (0.18 + _rng.randf() * 0.16), 0.16 * k)
		# where the bow sheet runs out onto the sea it leaves fine ribbons of lace
		# peeling away on both sides: thin stamps strung along its landing line
		for side: float in [1.0, -1.0]:
			for s0: float in [0.22, 0.45, 0.7, 0.92]:
				var l := bow_wave.landing(s0 + (_rng.randf() - 0.5) * 0.08, side)
				var wx := pos.x + port.x * l.x + fx * l.y
				var wz := pos.z + port.z * l.x + fz * l.y
				wake.stamp(wx, wz, (0.35 + _rng.randf() * 0.3) * sqrt(B / 6.2), (0.22 + 0.1 * s0) * k * (0.5 + _rng.randf()))
			# lateral wash hugging the hull, in uneven clumps
			if _rng.randf() < 0.7:
				var u := 0.2 - _rng.randf() * 0.45
				var out := side * B * (0.5 + _rng.randf() * 0.14)
				wake.stamp(pos.x + fx * L * u + port.x * out, pos.z + fz * L * u + port.z * out, B * 0.2 * (0.5 + _rng.randf()), 0.16 * k * (0.5 + _rng.randf()))
		# hard over: the stern skids outward and smears a fan of foam
		var skid := minf(1.0, absf(ang_vel) * spd * 0.12)
		if skid > 0.08:
			var out := -signf(ang_vel) * B * 0.55
			wake.stamp(pos.x - fx * L * 0.38 + port.x * out, pos.z - fz * L * 0.38 + port.z * out, B * 0.36, 0.22 * skid * wake_k)
	# the bow wave sheet rides the waterline, growing with speed
	var bow_amp := minf(1.2, spd / 12.0) if alive else 0.0
	bow_wave.follow(pos.x, _heave, pos.z, heading, _pitch * 0.8, bow_amp, spd, dt)
	# bow spray: fine droplets thrown off the crest of the sheet at speed, in bursts
	# when she buries her nose in a swell. Small, quick and falling: water, not smoke.
	if alive and spd > cls.max_speed * 0.35:
		var fast := (spd / cls.max_speed - 0.35) / 0.65
		var slam := maxf(0.0, _pitch - 0.02) * 30.0
		_spray_t += dt * (fast * fast * 40.0 + slam * 50.0)
		var crest := _heave + (0.18 + 0.7 * bow_amp) * sqrt(B / 6.2) * 0.9
		while _spray_t > 1.0:
			_spray_t -= 1.0
			var side := 1.0 if _rng.randf() < 0.5 else -1.0
			var l := bow_wave.landing(0.04 + _rng.randf() * 0.22, side)
			var f := 0.25 + _rng.randf() * 0.35
			var x := pos.x + port.x * l.x * f + fx * l.y
			var z := pos.z + port.z * l.x * f + fz * l.y
			var out := 1.2 + _rng.randf() * 2.6 + fast * 1.5
			var up := 1.6 + _rng.randf() * 2.4 + slam * 0.8
			for i in 2 + _rng.randi() % 3:
				var jx := (_rng.randf() - 0.5) * 0.6
				var v := Vector3(port.x * side * (out + jx) + vel.x * 0.9 - fx * _rng.randf() * 1.5, up + _rng.randf() * 0.5, port.z * side * (out + jx) + vel.z * 0.9 - fz * _rng.randf() * 1.5)
				world.fx.emit(Vector3(x, crest, z), v, 0.4 + _rng.randf() * 0.4, 0.06 + _rng.randf() * 0.09, 0.035, SPRAY, SPRAY, 14.0, 0.5, 0, 0.01)


## A lazy wisp from the galley stovepipe, carried off downwind.
func _galley(dt: float, w: Wind) -> void:
	if model.chimney == Vector3.ZERO:
		return
	_galley_t += dt * 2.2
	if _galley_t <= 1.0:
		return
	var breeze := Vector2(w.dir_x, w.dir_z) * (1.2 + w.strength * 4.5)
	var push := 0.6 + w.strength * 1.4
	while _galley_t > 1.0:
		_galley_t -= 1.0
		var p := model.global_transform * model.chimney
		var v := Vector3(vel.x * 0.85 + w.dir_x * push + (_rng.randf() - 0.5) * 0.2, 0.7 + _rng.randf() * 0.3, vel.z * 0.85 + w.dir_z * push + (_rng.randf() - 0.5) * 0.2)
		world.fx.emit(p + Vector3(0, 0.05, 0), v, 2.2 + _rng.randf() * 1.2, 0.32, 1.6 + _rng.randf() * 0.8, SMOKE, SMOKE_END, -0.15, 0.6, 1, 0.15, breeze)


## A sudden lurch (a broadside's recoil, a sea slamming into her quarter).
func kick_roll(amount: float) -> void:
	_roll_kick = clampf(_roll_kick + amount, -0.3, 0.3)
