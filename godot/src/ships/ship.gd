class_name Ship
extends Node3D
## A ship under sail. She answers her helm and the canvas set, draws on the
## wind by her point of sail, slips a little to leeward, rides the swell,
## heels to the breeze and out of her turns, swings her yards and booms across
## on springs, and leaves a wake, a curling bow wave, spray and a wisp of
## galley smoke behind her. The web game's Ship, sailing half: the guns and
## the fighting come aboard with the bigger ships.

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


static func create(p_cls: ShipClass, p_livery: Livery, p_world: World) -> Ship:
	var s := Ship.new()
	_count += 1
	s._id = _count
	s.name = "Ship%d" % _count
	s.cls = p_cls
	s.livery = p_livery
	s.world = p_world
	s._rng.seed = 977 * _count
	s._galley_t = s._rng.randf()
	s.model = ShipModel.create(p_cls, p_livery)
	s.add_child(s.model)
	s.bow_wave = BowWave.new()
	s.bow_wave.setup(s.model.shape, p_cls)
	s.add_child(s.bow_wave)
	return s


func forward() -> Vector3:
	return Vector3(sin(heading), 0.0, cos(heading))


## The port beam (her left hand, looking forward).
func port_dir() -> Vector3:
	return Vector3(cos(heading), 0.0, -sin(heading))


func place(x: float, z: float, h: float) -> void:
	pos = Vector3(x, 0.0, z)
	heading = h
	speed = 0.0
	ang_vel = 0.0
	_heave = world.water_height(x, z)
	step(0.0)


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
	var fwd := forward()
	var fx := fwd.x
	var fz := fwd.z
	var w := world.wind
	# 0 = running dead downwind
	var rel := MathX.angle_delta(atan2(w.dir_x, w.dir_z), heading)
	var rel_deg := rad_to_deg(rel)
	var gust := world.gust_at(pos.x, pos.z)

	# ------------------------------------------------ sailing
	sail_level += clampf(sail_target - sail_level, -dt * 0.6, dt * 0.6)
	var wf := wind_factor(rel_deg) * (0.75 + 0.25 * w.strength) * (1.0 + gust * 0.08)
	var target := c.max_speed * sail_level * wf
	var rate := c.accel if target > speed else c.accel * 1.4
	speed += (target - speed) * MathX.damp(rate, dt)
	var steer := clampf(0.28 + 0.9 * (speed / c.max_speed), 0.28, 1.1)
	var target_ang := rudder * c.turn_rate * steer
	ang_vel += (target_ang - ang_vel) * MathX.damp(2.6 / sqrt(c.mass), dt)
	speed *= 1.0 - absf(ang_vel) * 0.08 * dt
	if anchored:
		speed = 0.0
		ang_vel = 0.0
	heading = wrapf(heading + ang_vel * dt, -PI, PI)

	# leeway: a little sideways slip with the wind
	var port := port_dir()
	var cross := w.dir_x * port.x + w.dir_z * port.z
	var slip := cross * 0.35 * sail_level * w.strength
	drift *= 1.0 - MathX.damp(1.5, dt)
	vel = Vector3(fx * speed + port.x * slip + drift.x, 0.0, fz * speed + port.z * slip + drift.y)
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
	var hp := world.water_height(pos.x + port.x * B * 0.5, pos.z + port.z * B * 0.5)
	var hst := world.water_height(pos.x - port.x * B * 0.5, pos.z - port.z * B * 0.5)
	var resp := MathX.damp(3.2 / c.mass, dt) if dt > 0.0 else 1.0
	var target_heave := (hb + hs + hp + hst) * 0.25
	var target_pitch := -atan2(hb - hs, L * 0.76) * 0.9
	var target_roll := atan2(hp - hst, B) * 0.8
	# heel out of the turn, and to leeward under the press of canvas
	target_roll += ang_vel * speed * 0.022
	target_roll += -cross * sail_level * w.strength * 0.07 / sqrt(c.mass)
	_roll_kick *= 1.0 - MathX.damp(2.2, dt)
	target_roll += _roll_kick
	_heave += (target_heave - _heave) * resp
	_pitch += (target_pitch - _pitch) * resp
	_roll += (target_roll - _roll) * resp
	transform = Transform3D(Basis.from_euler(Vector3(_pitch, heading, _roll)), Vector3(pos.x, _heave - c.draft * 0.06, pos.z))

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

	if dt <= 0.0:
		return
	_wake(dt, fx, fz, port, L, B)
	_galley(dt, w)


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
		if speed > 3.5 and _ground_cooldown <= 0.0:
			_ground_cooldown = 1.2
			world.fx.sand_hit(Vector3(px, 0.5, pz))
			world.fx.splash(Vector3(px, world.water_height(px, pz), pz), 0.5 + minf(0.6, speed / 25.0))
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
	if strike:
		struck.emit(0.45 * k + 0.15)


func _wake(dt: float, fx: float, fz: float, port: Vector3, L: float, B: float) -> void:
	var wake := world.wake
	var spd := absf(speed)
	if spd > 0.3:
		# pressure every frame: the canvas grows the Kelvin arms and the transverse
		# swell from it. The bow surges and eases as she pitches and the hull yaws a
		# touch, so the arms come out uneven; a little jitter roughens the crests.
		var tt := world.time + _id * 7.31
		var surge := 1.0 + 0.22 * sin(tt * 1.37) * sin(tt * 0.53 + 1.1) + _pitch * 3.0
		var press := 10.5 * (minf(spd, 16.0) / 12.0) * sqrt(B / 6.2) * dt * maxf(0.5, surge)
		var yaw := sin(tt * 0.71) * 0.12 * B
		for hp: Array in HULL_PRESSURE:
			var u: float = hp[0]
			var j := (_rng.randf() - 0.5) * 0.16 * B + yaw * u * 2.0
			var a := 1.0 + (_rng.randf() - 0.5) * 0.35
			wake.press(pos.x + fx * L * u + port.x * j, pos.z + fz * L * u + port.z * j, B * float(hp[2]) * (0.9 + _rng.randf() * 0.2), press * float(hp[1]) * a)
	_wake_t += dt
	if _wake_t > 0.04 and spd > 0.5:
		_wake_t = 0.0
		var k := clampf(spd / 12.0, 0.0, 1.25)
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
			wake.stamp(pos.x - fx * L * 0.38 + port.x * out, pos.z - fz * L * 0.38 + port.z * out, B * 0.36, 0.22 * skid)
	# the bow wave sheet rides the waterline, growing with speed
	var bow_amp := minf(1.2, spd / 12.0)
	bow_wave.follow(pos.x, _heave, pos.z, heading, _pitch * 0.8, bow_amp, spd, dt)
	# bow spray: fine droplets thrown off the crest of the sheet at speed, in bursts
	# when she buries her nose in a swell. Small, quick and falling: water, not smoke.
	if spd > cls.max_speed * 0.35:
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
