class_name Kraken
extends RefCounted
## The Kraken: a rare terror that rises in a storm (the web's game/kraken.ts).
##
## It comes in stages. First the omen: the sea goes dark and boils around
## your ship as something vast passes beneath her. Then the arms burst up all
## around, each one planted in the sea and reaching for you. An arm rears
## back (a crimson shimmer marks where it will fall), then whips down across
## the water; sail out of the line or take the blow. Now and then one coils
## round your hull and holds her fast until you shoot it loose. Beaten arms
## recoil, spurting ink, and grow back; beat enough and the head itself
## surfaces for a while, its great eyes the place to aim. Wound it deep and
## it rages: more arms, faster blows, a maelstrom that drags you in. Kill it
## and the deep gives up its hoard.
##
## Its body is KrakenView's; the sea over it goes dark and turns (the ocean
## reads the `kraken` and `kraken_ink` shader globals this keeps).

enum Phase { OFF, OMEN, FIGHT, DYING, LEAVE }
enum { DOWN, RISE, IDLE, REAR, STRIKE, LIE, LIFT, REACH, GRAB, RECOIL, SINK }
enum Part { ARM, HEAD, EYE }

## A blow it took (gathered for a moment, so a grape volley reads as one):
## `mine` when the player's guns struck it.
signal hurt(dmg: float, at: Vector3, crit: bool, part: int, mine: bool)
## It struck her: "slam" (an arm across her) or "crush" (its coils).
signal player_hit(dmg: float, at: Vector3, kind: String)
## The arms burst up out of the sea: the fight is on.
signal rose
## Wounded past two thirds (1), then past one third (2).
signal staged(stage: int)
signal head_moved(up: bool)
## It seized her (on), or let go: `freed` when she was shot loose.
signal gripped(on: bool, freed: bool)
signal arm_beaten(at: Vector3)
## Slain: its hoard rises here.
signal defeated(at: Vector3)
## Gone back down (`slain`, or it gave up the chase).
signal gone(slain: bool)
## Peaceful seas: the first blow on it wakes its fury.
signal provoked_now

const SPINE := KrakenView.SPINE
## Each arm's length and girth at the root: six that fight, two short ones about the head.
const SPECS: Array[Vector2] = [Vector2(33.0, 2.05), Vector2(31.0, 1.95), Vector2(34.0, 2.1), Vector2(30.0, 1.9),
		Vector2(32.0, 2.0), Vector2(33.5, 2.05), Vector2(17.0, 1.35), Vector2(18.0, 1.4)]
## Arms fighting at once in each stage (the head's crown arms come on top).
const ACTIVE := [4, 5, 6]
const ATTACK_GAP := [5.0, 3.8, 2.8]
const REAR_TIME := [1.65, 1.4, 1.2]
const GRAB_ODDS := [0.15, 0.24, 0.32]
const SLAM_HIT := [0.15, 0.18, 0.21]
const CRUSH_RATE := [0.032, 0.042, 0.052]
const STRIKE_TIME := 0.4
## Body hit points before the class factor, and an arm's.
const BODY_HP := 3000.0
const ARM_HP := 165.0
## Ammo (Ammo.ROUND ..) against arm / head. Chain cleaves flesh, shells blast the head.
const VS := [Vector2(1.0, 1.0), Vector2(0.95, 1.6), Vector2(0.8, 0.8), Vector2(1.9, 0.6), Vector2(1.25, 0.65), Vector2(0.0, 0.0)]
## How far the head lurks from its prey while submerged.
## Peaceful seas: left in peace this long, it loses interest and slips back down (s).
const LINGER := 48.0
const LURK := 48.0
const DEEP := -17.0
const SURFACED := 2.4
## Its hit points scale with the ship it hunts.
const HULL_K := {"sloop": 0.72, "brig": 1.0, "galleon": 1.32, "revenant": 1.25}


class Arm:
	var i := 0
	var L := 30.0
	var R0 := 2.0
	var crown := false
	var state := DOWN
	var t := 0.0
	var dur := 0.0
	var out := 0.0
	var ax := 0.0
	var az := 0.0
	var phi := 0.0
	# pose, eased toward each state's shape
	var lean0 := 0.0
	var lean := 0.0
	var curl := 0.0
	var flat := 0.0
	var sway := 0.0
	var hp := ARM_HP
	var max_hp := ARM_HP
	var flash := 0.0
	var flinch := 0.0
	var flinch_v := 0.0
	var arousal := 0.0
	var aim_x := 0.0
	var aim_z := 0.0
	var locked := false
	var seed := 0.0
	var wrap := 0.0
	var grab_dealt := 0.0
	var burn := 0.0
	var burn_t := 0.0
	## Seconds to the next crushing tick while it holds her.
	var tick := 0.0
	## It has broken the surface on this rising.
	var burst := false
	var regrow := 0.0
	var used := 0.0
	var pts := PackedFloat32Array()
	var nrm := PackedFloat32Array()
	var girth := PackedFloat32Array()
	var wrap_pts := PackedFloat32Array()
	var wrap_nrm := PackedFloat32Array()
	## Height of the lying pose's flat run above its root, for placing it on the sea.
	var lie_rise := 0.0


## Damage gathered per part for a moment.
class Tally:
	var dmg := 0.0
	var crit := false
	var at := Vector3.ZERO
	var t := 0.0
	var mine := false


var view: KrakenView
var world: World
var phase := Phase.OFF
## Seconds into the current phase.
var t := 0.0
var hp := BODY_HP
var max_hp := BODY_HP
## 0, 1 or 2: wounded past two thirds, then past one third.
var stage := 0
## Where it lies under the sea (and where its head rises).
var body := Vector3(0.0, DEEP, 0.0)
var arms: Array[Arm] = []
var _prey: Ship
var _body_az := 0.0
var _head_y := DEEP - 30.0
var _head_yaw := 0.0
var _head_pitch := 0.0
var _head_roll := 0.0
var _head_flash := 0.0
## 0 lurking beneath, 1 surfacing or surfaced, 2 going back down.
var _head := 0
var _head_t := 0.0
var _head_timer := 26.0
var _beaten := 0
var _roar_t := -1.0
var _rage := 0.0
var _pallor := 0.0
var _lid := 1.0
var _blink_t := 3.0
var _ink := 0.0
var _swirl := 0.0
var _swirl_r := 40.0
var _attack_t := 4.0
var _grab_cool := 12.0
var _fx_t := 0.0
var _bubble_t := 0.0
var _tallies := {}
var _dropped := false
var _gaze := Vector2.ZERO
## Seconds the player has been out of its reach (it gives up eventually).
var _lost_t := 0.0
var _omen_len := 9.0
## How hard it is raining (0..1, set by the game): rain douses an arm afire.
var rain := 0.0
## Peaceful seas (set by the game each frame): it rises, and looks, and only
## fights if it's struck; and whether something of yours has struck it this time up.
var calm := false
var provoked := false


func _init(p_world: World) -> void:
	world = p_world
	view = KrakenView.new(SPECS)
	for i in SPECS.size():
		var a := Arm.new()
		a.i = i
		a.L = SPECS[i].x
		a.R0 = SPECS[i].y
		a.crown = i >= 6
		a.seed = randf() * 100.0
		a.pts.resize(SPINE * 3)
		a.nrm.resize(SPINE * 3)
		a.girth.resize(SPINE)
		a.girth.fill(1.0)
		a.wrap_pts.resize(SPINE * 3)
		a.wrap_nrm.resize(SPINE * 3)
		# the lying pose's flat run sits this far above its root
		_turtle(a, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0)
		a.lie_rise = a.pts[roundi(SPINE * 0.4) * 3 + 1]
		arms.append(a)


func active() -> bool:
	return phase != Phase.OFF


## Arms up and fighting (not the omen, its death or its leaving).
func fighting() -> bool:
	return phase == Phase.FIGHT


func head_up() -> bool:
	return _head == 1 and _head_y > SURFACED - 4.0


## The arm holding your ship, and how close she is to breaking free (0..1); -1 if none.
func grip() -> float:
	for a in arms:
		if a.state == GRAB:
			return clampf(a.grab_dealt / (a.max_hp * 0.38), 0.0, 1.0)
	return -1.0


## Arms rearing to strike, for the HUD's warnings: world points above them.
func warnings() -> Array[Vector3]:
	var out: Array[Vector3] = []
	for a in arms:
		if a.state != REAR and a.state != REACH:
			continue
		var k := roundi(SPINE * 0.85) * 3
		out.append(Vector3(a.pts[k], a.pts[k + 1] + 4.0, a.pts[k + 2]))
	return out


## Begins the omen near the prey; the arms come `omen` seconds later.
func summon(prey: Ship, omen := 9.0) -> void:
	reset()
	_prey = prey
	phase = Phase.OMEN
	t = 0.0
	var f: float = HULL_K.get(prey.cls.id, 1.0)
	max_hp = BODY_HP * f
	hp = max_hp
	for a in arms:
		a.max_hp = ARM_HP * f
		a.hp = a.max_hp
	# it comes from ahead and passes right under her keel
	var h := prey.heading
	_body_az = h + PI + randf_range(-0.6, 0.6)
	body = Vector3(prey.pos.x + sin(h) * 90.0, DEEP + 3.0, prey.pos.z + cos(h) * 90.0)
	_head_y = DEEP + 3.0
	_omen_len = omen
	view.visible = true


func reset() -> void:
	phase = Phase.OFF
	t = 0.0
	stage = 0
	_rage = 0.0
	_pallor = 0.0
	_ink = 0.0
	_swirl = 0.0
	_head = 0
	_head_t = 0.0
	_head_y = DEEP - 30.0
	_head_timer = 26.0
	_beaten = 0
	_attack_t = 4.0
	_grab_cool = 12.0
	_dropped = false
	_lost_t = 0.0
	provoked = false
	_tallies.clear()
	if _prey != null:
		_prey.held = 0.0
	_prey = null
	for a in arms:
		a.state = DOWN
		a.out = 0.0
		a.wrap = 0.0
		a.burn = 0.0
		a.flat = 0.0
		a.flash = 0.0
		view.write_rest(a.i, 0.0, -400.0, 0.0)
	view.commit()
	view.visible = false
	view.begin_marks()
	view.end_marks()
	RenderingServer.global_shader_parameter_set(&"kraken", Vector4(0.0, 0.0, 1.0, 0.0))
	RenderingServer.global_shader_parameter_set(&"kraken_ink", 0.0)


## It slips back down: arms sink, the head dives, the sea clears.
func leave() -> void:
	if phase == Phase.OFF or phase == Phase.LEAVE or phase == Phase.DYING:
		return
	phase = Phase.LEAVE
	t = 0.0
	if _prey != null:
		_prey.held = 0.0
	for a in arms:
		if a.state != DOWN:
			_set_state(a, SINK)
	if _head == 1:
		_dive_head()


# ---------------------------------------------------------------- update

func update(dt: float, prey: Ship) -> void:
	if phase == Phase.OFF:
		return
	t += dt
	if prey != null and prey.alive:
		_prey = prey
	var p: Ship = _prey if _prey != null and _prey.alive else null
	match phase:
		Phase.OMEN:
			_update_omen(dt, p)
		Phase.FIGHT:
			_update_fight(dt, p)
		Phase.DYING:
			_update_dying(dt)
		Phase.LEAVE:
			_swirl = maxf(0.0, _swirl - dt * 0.25)
			if t > 5.0 and arms.all(func(a: Arm) -> bool: return a.state == DOWN):
				reset()
				gone.emit(false)
				return
	if phase == Phase.OFF:
		return
	_update_head(dt, p)
	for a in arms:
		_update_arm(a, dt, p)
	_flush_tallies(dt)
	_draw_marks(p)
	view.commit()
	_ink = maxf(0.0, _ink - dt * 0.06)
	RenderingServer.global_shader_parameter_set(&"kraken", Vector4(body.x, body.z, _swirl_r, _swirl))
	RenderingServer.global_shader_parameter_set(&"kraken_ink", minf(1.0, _ink))


func _shake(a: float, at: Vector3) -> void:
	world.shook.emit(a * world.loudness(at))


func _update_omen(dt: float, p: Ship) -> void:
	var k := t / _omen_len
	_swirl = smoothstep(0.0, 0.8, k) * 0.55
	_swirl_r = 26.0 + k * 24.0
	# the dark shape glides on under her
	if p != null:
		var h := atan2(p.pos.x - body.x, p.pos.z - body.z)
		var sp := 9.0
		body.x += sin(h) * sp * dt + p.vel.x * dt * 0.9
		body.z += cos(h) * sp * dt + p.vel.z * dt * 0.9
		_head_yaw += MathX.angle_delta(_head_yaw, h) * MathX.damp(1.5, dt)
	# bubbles boil up over it, faster as it nears the surface
	_bubble_t += dt * (4.0 + k * 26.0)
	while _bubble_t > 1.0:
		_bubble_t -= 1.0
		var r := sqrt(randf()) * _swirl_r * 0.7
		var ang := randf() * TAU
		var x := body.x + cos(ang) * r
		var z := body.z + sin(ang) * r
		if world.ground_height(x, z) > -4.0:
			continue
		var y := world.water_height(x, z)
		world.wake.stamp(x, z, randf_range(0.6, 1.6), randf_range(0.12, 0.3))
		var white := Color(1.3, 1.4, 1.45, 0.85)
		world.fx.emit(Vector3(x, y + 0.1, z), Vector3(randf_range(-0.4, 0.4), randf_range(0.6, 1.8), randf_range(-0.4, 0.4)), randf_range(0.5, 1.0),
				randf_range(0.15, 0.35), 0.05, white, white, 6.0, 0.0, Particles.SOFT, 0.02)
	if t > _omen_len and p != null:
		phase = Phase.FIGHT
		t = 0.0
		_attack_t = 2.6
		# three arms burst up around her at once: one right alongside
		_raise(arms[0], p, 0.36, 0.0)
		_raise(arms[1], p, 0.55, 0.45)
		_raise(arms[2], p, 0.6, 0.9)
		_roar(1.0)
		_shake(1.1, p.pos)
		rose.emit()
	elif p == null and t > 2.0:
		leave()


func _update_fight(dt: float, p: Ship) -> void:
	if p == null:
		# she's gone down: it lingers over the wreck a moment, then sinks away
		if t > 3.0:
			leave()
		return
	var hp_f := hp / max_hp
	var st := 2 if hp_f < 0.33 else (1 if hp_f < 0.66 else 0)
	if st > stage:
		stage = st
		_roar(1.0)
		_ink = minf(1.4, _ink + 0.8)
		_ink_burst(body.x, body.z, 1.6)
		# the beaten arms come straight back, angrier
		for a in arms:
			if a.state == DOWN and not a.crown:
				a.regrow = minf(a.regrow, randf_range(0.5, 2.0))
		staged.emit(stage)
	_rage += ((1.0 if stage == 2 else stage * 0.35) - _rage) * MathX.damp(0.8, dt)
	_swirl += ((0.62 + stage * 0.2) - _swirl) * MathX.damp(0.5, dt)
	_swirl_r += ((48.0 + stage * 18.0) - _swirl_r) * MathX.damp(0.4, dt)
	# the maelstrom drags her toward the beast once it rages
	if stage == 2 and _head != 1:
		var dx := body.x - p.pos.x
		var dz := body.z - p.pos.z
		var d := Vector2(dx, dz).length()
		if d > 20.0 and d < 140.0:
			var pull := 1.6 * dt * (1.0 - d / 140.0)
			p.drift.x += dx / d * pull
			p.drift.y += dz / d * pull
	# the body lurks off her quarter, keeping pace beneath the sea
	if _head == 0:
		_body_az += dt * 0.07
		var tx := p.pos.x + sin(_body_az) * LURK
		var tz := p.pos.z + cos(_body_az) * LURK
		var dx := tx - body.x
		var dz := tz - body.z
		var d := Vector2(dx, dz).length()
		var sp := minf(d, 13.0 * dt)
		if d > 0.01:
			body.x += dx / d * sp
			body.z += dz / d * sp
	# left far behind: it gives the chase up
	var far := Vector2(p.pos.x - body.x, p.pos.z - body.z).length()
	_lost_t = _lost_t + dt if far > 160.0 else 0.0
	if _lost_t > 12.0:
		leave()
		return
	# left in peace, it loses interest and slips back down
	if docile() and t > LINGER:
		leave()
		return
	# keep enough arms in the fight
	var want: int = ACTIVE[stage]
	var up := 0
	for a in arms:
		if not a.crown and a.state != DOWN:
			up += 1
	for a in arms:
		if a.crown or a.state != DOWN:
			continue
		a.regrow -= dt
		if up < want and a.regrow <= 0.0:
			_raise(a, p, randf_range(0.42, 0.72), 0.0)
			up += 1
	# the head surfaces after enough arms are beaten, or now and then regardless
	_head_timer -= dt
	if _head == 0 and (_beaten >= 2 or _head_timer <= 0.0):
		_surface_head(p)
	if _head == 1 and _head_t > 13.0:
		_dive_head()
	# attacks
	_grab_cool -= dt
	_attack_t -= dt
	if _attack_t <= 0.0 and not docile():
		var gap: float = ATTACK_GAP[stage] * (1.45 if _head == 1 else 1.0)
		_attack_t = gap * randf_range(0.75, 1.25)
		_attack(p)


func _update_dying(dt: float) -> void:
	_pallor = smoothstep(0.5, 4.5, t)
	_rage = maxf(0.0, _rage - dt * 0.5)
	_swirl = _swirl if t < 1.8 else maxf(0.0, _swirl - dt * 0.4)
	# the arms writhe a while longer, then sink for good
	if t > 2.6 and t - dt <= 2.6:
		for a in arms:
			if a.state != DOWN:
				_set_state(a, SINK)
	if t > 1.8 and t - dt <= 1.8:
		# the maelstrom collapses: a great ring of white water rolls out
		for i in 3:
			world.wake.stamp(body.x, body.z, 14.0 + i * 9.0, 1.2 - i * 0.3, true)
		world.wake.push(body.x, body.z, 18.0, -1.6)
		_ink_burst(body.x, body.z, 2.2)
		_shake(0.8, body)
	if t > 3.6 and not _dropped:
		_dropped = true
		defeated.emit(Vector3(body.x, 0.0, body.z))
	if t > 9.5:
		reset()
		gone.emit(true)


# ---------------------------------------------------------------- head

func _surface_head(p: Ship) -> void:
	# never through an island
	if world.ground_height(body.x, body.z) > -10.0:
		_head_timer = 6.0
		return
	_head = 1
	_head_t = 0.0
	_beaten = 0
	# it rises where it lurks, turned to face her
	_head_yaw = atan2(p.pos.x - body.x, p.pos.z - body.z)
	head_moved.emit(true)
	# its crown of short arms writhes up on either side
	for a in arms:
		if not a.crown:
			continue
		var side := 1.0 if a.i == 6 else -1.0
		var h := _head_yaw + side * 1.05
		a.ax = body.x + sin(h) * 10.0
		a.az = body.z + cos(h) * 10.0
		a.phi = h
		a.burst = false
		_set_state(a, RISE)
		a.hp = a.max_hp


func _dive_head() -> void:
	if _head != 1:
		return
	_head = 2
	_head_t = 0.0
	_head_timer = [28.0, 24.0, 19.0][stage]
	head_moved.emit(false)
	for a in arms:
		if a.crown and a.state != DOWN:
			_set_state(a, SINK)


func _update_head(dt: float, p: Ship) -> void:
	_head_t += dt
	var dying := phase == Phase.DYING
	var ty := DEEP
	if phase == Phase.OMEN:
		ty = lerpf(DEEP + 3.0, -12.0, smoothstep(0.2, 0.75, t / _omen_len))
	if _head == 1:
		ty = SURFACED
	if dying:
		ty = SURFACED + 0.6 if t < 4.5 else SURFACED - (t - 4.5) * 4.2
	if phase == Phase.LEAVE and _head != 1:
		ty = DEEP - 12.0
	var was := _head_y
	# a great heave up through the surface, a slow sink back
	var rate := (1.1 if _head == 1 else 0.6) if ty > _head_y else (0.7 if _head == 2 else 0.5)
	_head_y += (ty - _head_y) * MathX.damp(rate, dt)
	if _head == 2 and _head_y < DEEP + 1.0:
		_head = 0
	var wy := world.water_height(body.x, body.z)
	# breaking the surface: water sheets off it
	if was < wy - 3.0 and _head_y >= wy - 3.0 and ty > was:
		world.fx.splash(Vector3(body.x, wy, body.z), 3.2)
		for i in 4:
			world.wake.stamp(body.x, body.z, 8.0 + i * 5.0, 0.9 - i * 0.15, true)
		world.wake.push(body.x, body.z, 10.0, 1.2)
		_sound_at(body, func(h: Vector3) -> void: world.sound.kraken_rise(h.x, h.y, h.z, 1.3))
		if not dying:
			_roar(0.9, 1.2)
	if _head_y > wy - 6.0 and _head_y < wy + 6.0:
		_fx_t += dt * (26.0 if _head_y > wy - 2.0 else 8.0)
		var white := Color(1.25, 1.35, 1.4, 0.8)
		while _fx_t > 1.0:
			_fx_t -= 1.0
			var a := randf() * TAU
			var r := randf_range(4.0, 8.0)
			var x := body.x + cos(a) * r
			var z := body.z + sin(a) * r
			world.fx.emit(Vector3(x, _head_y + randf_range(1.0, 9.0), z), Vector3(cos(a) * randf_range(0.5, 2.0), randf_range(-1.0, 1.0), sin(a) * randf_range(0.5, 2.0)),
					randf_range(0.7, 1.3), randf_range(0.2, 0.5), 0.12, white, white, 13.0, 0.0, Particles.SOFT, 0.02)
			if randf() < 0.3:
				world.wake.stamp(x, z, randf_range(1.5, 3.0), 0.35)
	# face the prey; tilt back and sway as it breathes
	if p != null and not dying:
		var want := atan2(p.pos.x - body.x, p.pos.z - body.z)
		_head_yaw += MathX.angle_delta(_head_yaw, want) * MathX.damp(0.9 if _head == 1 else 0.4, dt)
	var tt := world.time
	var roaring := _roar_t >= 0.0 and _roar_t < 2.4
	if _roar_t >= 0.0:
		_roar_t += dt
	var breath := sin(tt * 0.9) * 0.5 + (sin(_roar_t * 9.0) * 0.4 if roaring else 0.0)
	_head_pitch = -0.18 + sin(tt * 0.45) * 0.05 + (-0.2 * sin(minf(1.0, _roar_t / 2.4) * PI) if roaring else 0.0) + (smoothstep(4.5, 9.0, t) * -0.7 if dying else 0.0)
	_head_roll = sin(tt * 0.33) * 0.05 + (smoothstep(3.0, 9.0, t) * 0.35 if dying else 0.0)
	_head_flash = maxf(0.0, _head_flash - dt * 4.0)
	view.set_head(body.x, _head_y, body.z, _head_yaw, _head_pitch, _head_roll, breath, _rage + _head_flash * 0.5, _pallor, _head_flash)
	# eyes: watch her, blink now and then, close as it dies
	_blink_t -= dt
	if _blink_t < 0.0:
		_blink_t = randf_range(2.5, 6.0)
	var blink := 1.0 - sin(_blink_t / 0.18 * PI) if _blink_t < 0.18 else 1.0
	_lid += (((1.0 - smoothstep(3.0, 6.0, t)) if dying else 1.0) * blink - _lid) * MathX.damp(18.0, dt)
	if p != null:
		var rel := MathX.angle_delta(_head_yaw, atan2(p.pos.x - body.x, p.pos.z - body.z))
		_gaze.x += (clampf(-rel, -1.0, 1.0) - _gaze.x) * MathX.damp(3.0, dt)
		_gaze.y += (-0.4 - _gaze.y) * MathX.damp(3.0, dt)
	view.set_gaze(_gaze.x, _gaze.y, _lid, clampf(0.25 + _rage * 0.5 + (0.4 if roaring else 0.0) + _pallor, 0.0, 1.0))


func _sound_at(at: Vector3, play: Callable) -> void:
	if world.sound != null:
		play.call(world.heard(at))


func _roar(big: float, delay := 0.0) -> void:
	_roar_t = 0.0
	var st := stage
	_sound_at(body, func(h: Vector3) -> void: world.sound.kraken_roar(maxf(h.x, 0.55) * big, h.y * 0.5, h.z, st, delay))
	_shake(0.45 * big, body)


func _ink_burst(x: float, z: float, scale: float) -> void:
	_ink = minf(1.5, _ink + 0.3 * scale)
	for i in int(10.0 * scale):
		var a := randf() * TAU
		var r := randf() * 5.0 * scale
		var px := x + cos(a) * r
		var pz := z + sin(a) * r
		world.fx.emit(Vector3(px, world.water_height(px, pz) + 0.2, pz), Vector3(cos(a) * randf_range(1.0, 4.0) * scale, randf_range(0.0, 0.4), sin(a) * randf_range(1.0, 4.0) * scale),
				randf_range(5.0, 9.0), randf_range(3.0, 5.0) * scale, randf_range(9.0, 15.0) * scale, Color(0.05, 0.015, 0.07, 0.75), Color(0.1, 0.05, 0.12),
				0.0, 1.4, Particles.SMOKE, 0.15, Vector2(0.001, 0.0), randf_range(-0.2, 0.2))


# ---------------------------------------------------------------- arms

func _set_state(a: Arm, s: int, dur := 0.0) -> void:
	a.state = s
	a.t = 0.0
	a.dur = dur


## Plants an arm in the sea near her (at `reach` of its length) and sends it up, `delay` seconds from now.
func _raise(a: Arm, p: Ship, reach: float, delay: float) -> void:
	var spot := _pick_anchor(a, p, reach)
	a.ax = spot.x
	a.az = spot.y
	a.phi = atan2(p.pos.x - a.ax, p.pos.z - a.az)
	a.hp = a.max_hp
	a.burn = 0.0
	a.wrap = 0.0
	a.flat = 0.0
	a.lean0 = 0.0
	a.lean = 0.0
	a.curl = 0.0
	a.burst = false
	_set_state(a, RISE)
	a.t = -delay


func _pick_anchor(a: Arm, p: Ship, reach: float) -> Vector2:
	var best := Vector2(p.pos.x + a.L * reach, p.pos.z)
	var best_score := -INF
	var min_d := p.cls.length * 0.5 + a.R0 + 4.0
	for k in 24:
		# most often ahead of her, where she's sailing into
		var ahead := randf() < 0.55
		var ang := p.heading + randf_range(-1.3, 1.3) if ahead else randf() * TAU
		var d := maxf(min_d, a.L * reach * randf_range(0.85, 1.15))
		var lead := minf(p.speed, 12.0) * 1.6
		var x := p.pos.x + sin(ang) * d + sin(p.heading) * lead
		var z := p.pos.z + cos(ang) * d + cos(p.heading) * lead
		if world.ground_height(x, z) > -7.0:
			continue
		var score := randf()
		for o in arms:
			if o == a or o.state == DOWN or o.crown:
				continue
			var od := Vector2(o.ax - x, o.az - z).length()
			if od < 14.0:
				score -= (14.0 - od) * 0.4
		if score > best_score:
			best_score = score
			best = Vector2(x, z)
	return best


static func _dist(a: Arm, p: Ship) -> float:
	return Vector2(p.pos.x - a.ax, p.pos.z - a.az).length()


func _attack(p: Ship) -> void:
	var busy := 0
	var grabbing := false
	var ready: Array[Arm] = []
	for a in arms:
		if a.state == REAR or a.state == STRIKE or a.state == REACH:
			busy += 1
		if a.state == GRAB or a.state == REACH:
			grabbing = true
		if not a.crown and a.state == IDLE and a.t > 0.8:
			ready.append(a)
	if busy >= (1 if stage == 0 else 2) or ready.is_empty():
		return
	# the least recently used arm that can reach her
	ready.sort_custom(func(x: Arm, y: Arm) -> bool: return x.used < y.used)
	if not grabbing and _grab_cool <= 0.0 and randf() < GRAB_ODDS[stage]:
		for g in ready:
			var d := _dist(g, p)
			if d < g.L * 0.7 and d > p.cls.beam:
				_grab_cool = 16.0 - stage * 3.0
				g.used = world.time
				_set_state(g, REACH, 1.15)
				_sound_at(p.pos, func(h: Vector3) -> void: world.sound.kraken_whip(h.x, h.y, h.z, 0.7))
				return
	var s: Arm = null
	for a in ready:
		var d := _dist(a, p)
		if d < a.L * 0.95 and d > 5.0:
			s = a
			break
	if s == null:
		# nothing in reach: the arm furthest from her sinks to come up beside her
		var far := ready[0]
		for a in ready:
			if _dist(a, p) > _dist(far, p):
				far = a
		if _dist(far, p) > far.L * 0.95:
			_set_state(far, SINK)
		_attack_t = minf(_attack_t, 1.2)
		return
	s.used = world.time
	s.locked = false
	_set_state(s, REAR, REAR_TIME[stage] * randf_range(0.92, 1.08))
	# raging, it sometimes brings a second arm down right after the first
	if stage == 2 and randf() < 0.45:
		for a in ready:
			var d := _dist(a, p)
			if a != s and d < a.L * 0.95 and d > 5.0:
				a.used = world.time
				a.locked = false
				_set_state(a, REAR, REAR_TIME[stage] * 1.35)
				break


func _update_arm(a: Arm, dt: float, p: Ship) -> void:
	a.t += dt
	if a.t < 0.0:
		return
	a.flash = maxf(0.0, a.flash - dt * 3.5)
	# flinch: a spring knocked by each hit
	a.flinch_v += (-a.flinch * 60.0 - a.flinch_v * 9.0) * dt
	a.flinch += a.flinch_v * dt
	var tt := world.time
	var stg := stage
	var t_lean0 := 0.12
	var t_lean := 0.38
	var t_curl := 1.7
	var t_sway := 0.28
	var rate := 2.2
	var t_out := 1.0
	# turn toward her (the planted root stays put)
	if p != null and a.state != STRIKE and a.state != LIE and not (a.state == REAR and a.locked) and a.state != GRAB and a.state != RECOIL:
		var want := a.phi if a.crown else atan2(a.aim_x - a.ax, a.aim_z - a.az)
		if not a.crown:
			var lead := maxf(0.0, a.dur - a.t) + STRIKE_TIME if a.state == REAR else 0.6
			a.aim_x = p.pos.x + p.vel.x * lead * 0.85
			a.aim_z = p.pos.z + p.vel.z * lead * 0.85
		a.phi += MathX.angle_delta(a.phi, want) * MathX.damp(5.0 if a.state == REAR else 1.6, dt)
	var roused := a.state == REAR or a.state == GRAB or a.state == RECOIL
	a.arousal += ((1.0 if roused else _rage * 0.6) - a.arousal) * MathX.damp(3.0, dt)
	match a.state:
		DOWN:
			t_out = 0.0
		RISE:
			# bursting up: a straight spear first, then the tip hooks over
			if not a.burst:
				a.burst = true
				_eruption(a)
			var k := clampf(a.t / 1.7, 0.0, 1.0)
			t_curl = 1.7 * smoothstep(0.4, 1.0, k)
			t_lean = 0.38 * k
			rate = 1.6
			a.out += (1.0 - a.out) * MathX.damp(2.4, dt)
			if a.t > 1.8:
				_set_state(a, IDLE)
			if a.out < 0.98 and randf() < dt * 30.0:
				_drip(a)
		IDLE:
			t_sway = 0.3 + stg * 0.06
			if p != null and not a.crown:
				var d := _dist(a, p)
				# out of reach of her now (or right under her): sink to come up somewhere nearer
				if (a.t > 2.0 and d > a.L * 1.02) or d < p.cls.beam * 0.5 + a.R0:
					_set_state(a, SINK)
		REAR:
			# rearing back, tip coiled tight, trembling with the effort
			var k := clampf(a.t / a.dur, 0.0, 1.0)
			t_lean0 = 0.05
			t_lean = lerpf(0.38, -0.95, k * k * (3.0 - 2.0 * k))
			t_curl = lerpf(1.7, 2.9, k)
			t_sway = 0.08
			rate = 4.0
			a.flinch += sin(tt * 47.0 + a.seed) * 0.0035 * k
			if not a.locked and a.t > a.dur - 0.32:
				a.locked = true
			if a.t >= a.dur:
				_set_state(a, STRIKE, STRIKE_TIME)
				_sound_at(Vector3(a.ax, 4.0, a.az), func(h: Vector3) -> void: world.sound.kraken_whip(h.x, h.y, h.z, 1.0))
		STRIKE:
			# the whip: accelerating all the way down
			var k := clampf(a.t / a.dur, 0.0, 1.0)
			a.flat = k * k
			t_lean = -0.95
			t_curl = lerpf(2.9, 0.8, k)
			t_sway = 0.0
			rate = 12.0
			if k >= 1.0:
				a.flat = 1.0
				_impact(a, p)
				_set_state(a, LIE, 1.7 - stg * 0.2)
		LIE:
			a.flat = 1.0
			t_sway = 0.05
			if a.t >= a.dur:
				_set_state(a, LIFT, 1.1)
		LIFT:
			var k := clampf(a.t / a.dur, 0.0, 1.0)
			a.flat = 1.0 - k * k * (3.0 - 2.0 * k)
			if k >= 1.0:
				_set_state(a, IDLE)
		REACH:
			# it coils for her hull; at full speed she can still slip it
			if p == null:
				_set_state(a, LIFT, 0.8)
			else:
				var k := clampf(a.t / a.dur, 0.0, 1.0)
				_build_wrap(a, p)
				a.wrap = k * k * (3.0 - 2.0 * k) * 0.92
				if k >= 1.0:
					if p.speed > p.cls.max_speed * 0.72:
						# missed: she sailed out of its coils
						a.wrap = 0.6
						_set_state(a, SINK)
						world.fx.splash(Vector3(p.pos.x, world.water_height(p.pos.x, p.pos.z), p.pos.z), 1.2)
					else:
						a.grab_dealt = 0.0
						_set_state(a, GRAB, 9.0)
						p.held = 1.0
						p.kick_roll(_side_of(a, p) * 0.12)
						_shake(0.6, p.pos)
						_sound_at(p.pos, func(h: Vector3) -> void: world.sound.crunch(h.x, h.y, h.z, 1.0))
						gripped.emit(true, false)
		GRAB:
			if p == null:
				_release(a, false)
			else:
				_build_wrap(a, p)
				a.wrap += (1.0 - a.wrap) * MathX.damp(6.0, dt)
				p.held = 1.0
				# the coils tighten and ease
				var squeeze := 0.94 + 0.06 * sin(tt * 3.2)
				for i in SPINE:
					a.girth[i] = squeeze if i > SPINE * 0.35 else 1.0
				p.kick_roll(_side_of(a, p) * sin(tt * 2.1) * 0.004)
				# crushing: a steady toll on the hull, in ticks
				a.tick += dt
				if a.tick > 0.7:
					a.tick = 0.0
					var dmg: float = p.max_hp * CRUSH_RATE[stg] * 0.7 * (1.0 - p.cls.armor * 0.4)
					player_hit.emit(dmg, Vector3(p.pos.x, p.position.y + p.cls.freeboard + 1.0, p.pos.z), "crush")
					if randf() < 0.6:
						_sound_at(p.pos, func(h: Vector3) -> void: world.sound.crunch(h.x * 0.7, h.y, h.z, 0.5))
					world.fx.wood_hit(Vector3(p.pos.x + randf_range(-2.0, 2.0), p.position.y + p.cls.freeboard, p.pos.z + randf_range(-2.0, 2.0)), Vector3.UP)
				if a.grab_dealt >= a.max_hp * 0.38:
					_release(a, true)
				elif a.t >= a.dur:
					# held too long: a last, splintering squeeze before it lets go
					player_hit.emit(p.max_hp * 0.08, Vector3(p.pos.x, p.position.y + 2.0, p.pos.z), "crush")
					_shake(0.9, p.pos)
					_release(a, false)
		RECOIL:
			# beaten: it thrashes, spurts ink and drops away
			t_sway = 1.1
			t_lean = 0.6 * sin(a.t * 9.0 + a.seed)
			t_curl = 3.2
			rate = 6.0
			a.flat = maxf(0.0, a.flat - dt * 2.0)
			a.wrap = maxf(0.0, a.wrap - dt * 2.5)
			a.flash = maxf(a.flash, 0.4)
			if a.t > 0.9:
				_set_state(a, SINK)
				a.regrow = randf_range(9.0, 14.0) - stg * 2.5
		SINK:
			t_out = 0.0
			t_curl = 0.9
			a.flat = maxf(0.0, a.flat - dt * 2.0)
			a.wrap = maxf(0.0, a.wrap - dt * 2.0)
			a.out -= dt * (0.7 if a.crown else 0.9)
			if a.out <= 0.0:
				a.out = 0.0
				_set_state(a, DOWN)
				if a.regrow <= 0.0:
					a.regrow = randf_range(0.3, 1.2)
				# its wake: the sea closes over it
				world.wake.stamp(a.ax, a.az, a.R0 * 3.0, 0.6, true)
	if a.state != GRAB:
		a.girth.fill(1.0)
	if a.state != SINK and a.state != DOWN and a.state != RISE:
		a.out += (t_out - a.out) * MathX.damp(3.0, dt)
	a.lean0 += (t_lean0 - a.lean0) * MathX.damp(rate, dt)
	a.lean += (t_lean - a.lean) * MathX.damp(rate, dt)
	a.curl += (t_curl - a.curl) * MathX.damp(rate, dt)
	a.sway += (t_sway - a.sway) * MathX.damp(2.0, dt)

	# fire shot: it burns where it stands above the water (rain douses it)
	if a.burn > 0.0:
		a.burn -= dt * (1.0 + rain * 1.6)
		a.burn_t += dt
		if a.burn_t > 0.6 and a.state != DOWN:
			a.burn_t = 0.0
			_hurt_arm(a, a.max_hp * 0.04, null, false, true)
		if randf() < dt * 14.0:
			var k := (2 + randi() % (SPINE - 4)) * 3
			if a.pts[k + 1] > 0.5:
				world.fx.flame(Vector3(a.pts[k], a.pts[k + 1], a.pts[k + 2]), 0.9)

	if a.state == DOWN:
		if a.out <= 0.0:
			view.write_rest(a.i, a.ax, -400.0, a.az)
		return
	_pose(a, tt)
	# where it stands in the sea it churns a collar of foam
	if a.out > 0.15 and randf() < dt * 9.0:
		world.wake.stamp(a.ax + sin(a.phi) * 0.5, a.az + cos(a.phi) * 0.5, a.R0 * randf_range(1.4, 2.2), 0.22)
	view.write_arm(a.i, a.pts, a.nrm, a.girth, minf(1.0, a.flash), a.seed, a.arousal, _pallor)


## Port (+1) or starboard (-1) of her the arm stands on.
func _side_of(a: Arm, p: Ship) -> float:
	var s := signf(MathX.angle_delta(p.heading, atan2(a.ax - p.pos.x, a.az - p.pos.z)))
	return s if s != 0.0 else 1.0


func _release(a: Arm, freed: bool) -> void:
	if _prey != null:
		_prey.held = 0.0
	gripped.emit(false, freed)
	if a.hp <= 0.0:
		return
	# shot loose: it recoils and sinks; let go: it slides back down
	_set_state(a, RECOIL if freed else SINK)
	a.regrow = randf_range(4.0, 7.0)


## The arm bursts from the sea: spray, a crater in the swell and a rush of water.
func _eruption(a: Arm) -> void:
	var y := world.water_height(a.ax, a.az)
	var at := Vector3(a.ax, y, a.az)
	world.fx.splash(at, 1.6 if a.crown else 2.4)
	world.wake.stamp(a.ax, a.az, a.R0 * 4.0, 1.1)
	world.wake.stamp(a.ax, a.az, a.R0 * 7.0, 0.7, true)
	world.wake.push(a.ax, a.az, a.R0 * 3.0, 0.9)
	var size := 0.8 if a.crown else 1.0
	_sound_at(at, func(h: Vector3) -> void: world.sound.kraken_rise(h.x, h.y, h.z, size))


## Water streaming off a rising arm.
func _drip(a: Arm) -> void:
	var k := (randi() % (SPINE - 2) + 1) * 3
	var y := a.pts[k + 1]
	if y < 0.5:
		return
	var white := Color(1.2, 1.3, 1.35, 0.75)
	world.fx.emit(Vector3(a.pts[k] + randf_range(-1.0, 1.0), y, a.pts[k + 2] + randf_range(-1.0, 1.0)), Vector3(randf_range(-1.0, 1.0), randf_range(-1.0, 0.5), randf_range(-1.0, 1.0)),
			randf_range(0.8, 1.5), randf_range(0.25, 0.5), 0.15, white, white, 14.0, 0.0, Particles.SOFT, 0.02)


## Closest distance between segments p0-p1 and q0-q1, and where along the second (0..1).
static func seg_seg(p0: Vector3, p1: Vector3, q0: Vector3, q1: Vector3) -> Vector2:
	var d1 := p1 - p0
	var d2 := q1 - q0
	var r := p0 - q0
	var a := d1.dot(d1)
	var e := d2.dot(d2)
	var f := d2.dot(r)
	var s := 0.0
	var tt := 0.0
	if a < 1e-8 and e < 1e-8:
		return Vector2(r.length(), 0.0)
	if a < 1e-8:
		tt = clampf(f / e, 0.0, 1.0)
	else:
		var c := d1.dot(r)
		if e < 1e-8:
			s = clampf(-c / a, 0.0, 1.0)
		else:
			var b := d1.dot(d2)
			var den := a * e - b * b
			s = clampf((b * f - c * e) / den, 0.0, 1.0) if den > 1e-8 else 0.0
			tt = (b * s + f) / e
			if tt < 0.0:
				tt = 0.0
				s = clampf(-c / a, 0.0, 1.0)
			elif tt > 1.0:
				tt = 1.0
				s = clampf((b - c) / a, 0.0, 1.0)
	return Vector2((r + d1 * s - d2 * tt).length(), tt)


## The whip lands: across the sea from root to tip, and on her if she's under it.
func _impact(a: Arm, p: Ship) -> void:
	var n := SPINE
	for i in range(roundi(n * 0.3), n, 4):
		var x := a.pts[i * 3]
		var z := a.pts[i * 3 + 2]
		if world.ground_height(x, z) > 0.5:
			continue
		world.fx.splash(Vector3(x, world.water_height(x, z), z), 1.5 + (1.0 - float(i) / n) * 1.2)
		world.wake.stamp(x, z, a.R0 * 2.4, 1.2)
		world.wake.push(x, z, a.R0 * 1.6, -0.9)
	var tip := (n - 1) * 3
	world.wake.stamp(a.pts[tip], a.pts[tip + 2], 9.0, 0.8, true)
	var mid := roundi(n * 0.6) * 3
	var m := Vector3(a.pts[mid], 0.0, a.pts[mid + 2])
	var h := world.heard(m)
	if world.sound != null:
		world.sound.kraken_slam(h.x, h.y, h.z)
	world.shook.emit(0.9 * h.x + 0.2)
	if p == null or not p.alive:
		return
	# her hull as a segment down the keel against the arm's length on the water
	var fx := sin(p.heading)
	var fz := cos(p.heading)
	var hl := p.cls.length * 0.45
	var k0 := Vector3(p.pos.x - fx * hl, 0.0, p.pos.z - fz * hl)
	var k1 := Vector3(p.pos.x + fx * hl, 0.0, p.pos.z + fz * hl)
	var best := INF
	var at := 0
	for i in range(roundi(n * 0.2), n - 1):
		var q0 := Vector3(a.pts[i * 3], 0.0, a.pts[i * 3 + 2])
		var q1 := Vector3(a.pts[i * 3 + 3], 0.0, a.pts[i * 3 + 5])
		var dd := seg_seg(k0, k1, q0, q1).x
		var gap := dd - a.R0 * KrakenView.profile(float(i) / (n - 1)) - p.cls.beam * 0.5
		if gap < best:
			best = gap
			at = i
	if best < 0.4:
		var dmg: float = p.max_hp * SLAM_HIT[stage] * (1.0 - p.cls.armor * 0.4)
		player_hit.emit(dmg, Vector3(a.pts[at * 3], p.position.y + p.cls.freeboard, a.pts[at * 3 + 2]), "slam")
		p.kick_roll(_side_of(a, p) * -0.2)
		# knocked bodily sideways through the water
		p.drift.x += sin(a.phi) * 3.5
		p.drift.y += cos(a.phi) * 3.5
		world.fx.splash(Vector3(p.pos.x, world.water_height(p.pos.x, p.pos.z), p.pos.z), 2.0)
	elif best < 5.0:
		# a near miss: the wave of it rocks her hard
		p.kick_roll(_side_of(a, p) * -0.09)


## Poses an arm as a chain of equal links from its root: each link turns a
## little further toward the prey along the arm (a gentle lean low down, a
## hooked curl at the tip), plus a slow side-to-side sway and a flinch. The
## lying pose (after a slam) bends over flat across the water instead, and a
## grab blends toward a coil round her hull.
func _pose(a: Arm, tt: float) -> void:
	var flat := a.flat
	var idle_base := -(4.5 + (1.0 - a.out) * a.L * 1.06)
	# the flat run lies on the sea with its upper half showing
	var lie_base := -a.lie_rise + a.R0 * 0.25
	var by := lerpf(idle_base, lie_base, flat) + world.water_height(a.ax, a.az) * 0.6
	_turtle(a, a.ax, by, a.az, tt, flat, a.flinch)
	if a.wrap > 0.001:
		var w := a.wrap
		for i in SPINE * 3:
			a.pts[i] = lerpf(a.pts[i], a.wrap_pts[i], w)
			a.nrm[i] = lerpf(a.nrm[i], a.wrap_nrm[i], w)


func _turtle(a: Arm, x: float, y: float, z: float, tt: float, flat: float, flinch: float) -> void:
	var ds := a.L / (SPINE - 1)
	var hx := sin(a.phi)
	var hz := cos(a.phi)
	var sx := hz
	var sz := -hx
	var px := x
	var py := y
	var pz := z
	var ph := a.seed
	var sw := a.sway
	for k in SPINE:
		a.pts[k * 3] = px
		a.pts[k * 3 + 1] = py
		a.pts[k * 3 + 2] = pz
		var v := (k + 0.5) / (SPINE - 1)
		# standing: a lean toward her, a hooked tip and a wave travelling up the arm
		var th0 := a.lean0 + a.lean * pow(v, 1.2) + a.curl * v * v * v + sin(tt * 1.1 + ph - v * 3.2) * sw * 0.6 * v - flinch * v
		# lying: up out of the water, then flat along the sea to a lifted tip
		var th1 := PI * 0.5 * smoothstep(0.0, 0.24, v) + 0.5 * pow(v, 6.0) + sin(tt * 2.0 + ph - v * 6.0) * 0.04 * v
		var th := lerpf(th0, th1, flat)
		var ps := sin(tt * 0.8 + ph * 1.7 - v * 2.6) * sw * 0.7 * v * (1.0 - flat * 0.9)
		var st := sin(th)
		var ct := cos(th)
		var cp := cos(ps)
		var sp := sin(ps)
		var dx := hx * st * cp + sx * sp
		var dy := ct * cp
		var dz := hz * st * cp + sz * sp
		# the sucker side: toward the inside of the bend (toward her, or down onto the sea)
		var nx := hx * ct
		var ny := -st
		var nz := hz * ct
		var dn := nx * dx + ny * dy + nz * dz
		nx -= dx * dn
		ny -= dy * dn
		nz -= dz * dn
		var nl := Vector3(nx, ny, nz).length()
		if nl == 0.0:
			nl = 1.0
		a.nrm[k * 3] = nx / nl
		a.nrm[k * 3 + 1] = ny / nl
		a.nrm[k * 3 + 2] = nz / nl
		px += dx * ds
		py += dy * ds
		pz += dz * ds


## The coil: up out of the sea beside her, over the rail, and round her hull
## amidships (between the masts), suckers clamped to the planking. Built in
## her own frame so it rides every roll and pitch of the hull.
func _build_wrap(a: Arm, p: Ship) -> void:
	var shape := p.model.shape
	# the gap between masts nearest midships
	var tc := 0.5
	var best_gap := -1.0
	var tt := 0.3
	while tt <= 0.7001:
		var g := INF
		for m: Dictionary in p.cls.masts:
			g = minf(g, absf(float(m.t) - tt))
		if g > best_gap:
			best_gap = g
			tc = tt
		tt += 0.02
	var zc := shape.z(tc)
	var top := shape.top(tc)
	var bot := maxf(shape.bottom(tc), -p.cls.draft)
	var hw := shape.half_width_at_y(tc, maxf(0.0, top - 0.6))
	var r := a.R0 * 0.55
	var yc := (top + bot) * 0.5
	var ra := hw + r * 0.9
	var rb := (top - bot) * 0.5 + r * 0.9
	# path in her frame: root out in the sea, rising to the rail, then round and round
	var frame := p.global_transform
	var inv := frame.affine_inverse()
	var root := inv * Vector3(a.ax, -6.0, a.az)
	var side := 1.0 if root.x >= 0.0 else -1.0
	var start := Vector3(side * ra, yc, zc)
	var path := PackedVector3Array()
	var n0 := 10
	for i in n0:
		var k := float(i) / n0
		# a rising arc from the root to her side
		path.append(Vector3(lerpf(root.x, start.x, k), lerpf(root.y, start.y, k) + sin(k * PI) * 4.0, lerpf(root.z, start.z, k)))
	var turns := 1.25
	var nc := 40
	for i in nc + 1:
		var th := float(i) / nc * turns * TAU
		# from her side up over the deck and down the far side, under the keel and round again
		path.append(Vector3(cos(th) * ra * side, yc + sin(th) * rb, zc + float(i) / nc * 2.2 * side))
	# resample to equal links along the path
	var cum := PackedFloat32Array([0.0])
	for i in range(1, path.size()):
		cum.append(cum[i - 1] + path[i].distance_to(path[i - 1]))
	var total := cum[cum.size() - 1]
	var L := minf(a.L, total)
	var j := 0
	for k in SPINE:
		var s := float(k) / (SPINE - 1) * L
		while j < cum.size() - 2 and cum[j + 1] < s:
			j += 1
		var f := clampf((s - cum[j]) / maxf(cum[j + 1] - cum[j], 1e-4), 0.0, 1.0)
		var v := path[j].lerp(path[j + 1], f)
		# suckers face the hull: toward the coil's axis
		var w := Vector3(-v.x, -(v.y - yc), 0.0).normalized()
		if k < n0 * 0.6:
			w = Vector3.UP
		var wp := frame * v
		a.wrap_pts[k * 3] = wp.x
		a.wrap_pts[k * 3 + 1] = wp.y
		a.wrap_pts[k * 3 + 2] = wp.z
		var wn := (frame.basis * w).normalized()
		a.wrap_nrm[k * 3] = wn.x
		a.wrap_nrm[k * 3 + 1] = wn.y
		a.wrap_nrm[k * 3 + 2] = wn.z


# ---------------------------------------------------------------- warnings on the sea

func _draw_marks(p: Ship) -> void:
	view.begin_marks()
	for a in arms:
		if a.state == REAR or (a.state == STRIKE and a.t < a.dur):
			var k := clampf(a.t / a.dur, 0.0, 1.0) if a.state == REAR else 1.0
			view.strip(a.ax, world.water_height(a.ax, a.az) + 0.25, a.az, a.phi, a.L * 0.98, a.R0 * 2.6, smoothstep(0.0, 0.35, k), 1.0 if a.locked else k * 0.6, a.seed)
		if a.state == REACH and p != null:
			view.ring(p.pos.x, world.water_height(p.pos.x, p.pos.z) + 0.3, p.pos.z, p.cls.length * 0.75, smoothstep(0.0, 0.4, a.t / a.dur))
	view.end_marks()


# ---------------------------------------------------------------- being hit

## Peaceful seas, and nobody has struck it: its arms sway and watch, and
## nothing comes down on her.
func docile() -> bool:
	return calm and not provoked


## A ball in flight between `prev` and `pos` this step: true if it struck an
## arm or the head (which takes the blow); on peaceful seas, that's a quarrel.
func strike(prev: Vector3, pos: Vector3, damage: float, owner: Ship, kind: int) -> bool:
	if not _strike_at(prev, pos, damage, owner, kind):
		return false
	_provoke()
	return true


## It was only looking: now it fights.
func _provoke() -> void:
	if provoked:
		return
	provoked = true
	if calm and phase == Phase.FIGHT:
		_attack_t = minf(_attack_t, 1.1)
		_roar(1.0)
		provoked_now.emit()


func _strike_at(prev: Vector3, pos: Vector3, damage: float, owner: Ship, kind: int) -> bool:
	if phase != Phase.FIGHT and phase != Phase.DYING:
		return false
	if owner.team != Ship.Team.PLAYER and owner != _prey:
		return false
	for a in arms:
		if a.state == DOWN or a.out < 0.25:
			continue
		var dx := pos.x - a.ax
		var dz := pos.z - a.az
		if dx * dx + dz * dz > (a.L + 6.0) * (a.L + 6.0):
			continue
		for i in SPINE - 1:
			var y0 := a.pts[i * 3 + 1]
			var y1 := a.pts[i * 3 + 4]
			if y0 < -1.0 and y1 < -1.0:
				continue
			var q0 := Vector3(a.pts[i * 3], y0, a.pts[i * 3 + 2])
			var q1 := Vector3(a.pts[i * 3 + 3], y1, a.pts[i * 3 + 5])
			var h := seg_seg(prev, pos, q0, q1)
			var r := a.R0 * KrakenView.profile((i + h.y) / (SPINE - 1)) * a.girth[i] + 0.3
			if h.x < r:
				_hit_arm(a, damage, owner, kind, q0.lerp(q1, h.y))
				return true
	if _head_y > -6.0:
		var loc := view.head_root.transform.affine_inverse() * pos
		var ex := KrakenView.EYE.x + 0.6
		var ey := KrakenView.EYE.y
		var ez := KrakenView.EYE.z + 0.5
		var ed := minf(Vector3(loc.x - ex, loc.y - ey, loc.z - ez).length(), Vector3(loc.x + ex, loc.y - ey, loc.z - ez).length())
		var face := Vector3(loc.x / 6.4, (loc.y + 0.2) / 6.2, (loc.z - 1.2) / 6.6).length()
		var mantle := Vector3(loc.x / 5.4, (loc.y - 6.5) / 5.6, (loc.z + 3.0) / 5.4).length()
		if ed < KrakenView.EYE.w + 0.7 or face < 1.0 or mantle < 1.0:
			_hit_head(damage, owner, kind, pos, ed < KrakenView.EYE.w + 0.7)
			return true
	return false


## An explosive shell's burst: every arm and the head near it take a share.
func blast(at: Vector3, radius: float, damage: float, owner: Ship) -> void:
	if phase != Phase.FIGHT or owner == null or owner.team != Ship.Team.PLAYER:
		return
	for a in arms:
		if a.state == DOWN or a.out < 0.25:
			continue
		var best := INF
		for i in range(0, SPINE, 2):
			if a.pts[i * 3 + 1] < -1.5:
				continue
			best = minf(best, Vector3(a.pts[i * 3] - at.x, a.pts[i * 3 + 1] - at.y, a.pts[i * 3 + 2] - at.z).length() - a.R0)
		if best < radius:
			_provoke()
			_hurt_arm(a, damage * (0.35 + 0.65 * (1.0 - maxf(0.0, best) / radius)), owner, true)
	if _head_y > -6.0:
		var d := Vector2(at.x - body.x, at.z - body.z).length() - 6.5
		if d < radius:
			_provoke()
			_hurt_head(damage * VS[Ammo.SHELL].y * (0.35 + 0.65 * (1.0 - maxf(0.0, d) / radius)), at, false, true)


func _hit_arm(a: Arm, damage: float, owner: Ship, kind: int, at: Vector3) -> void:
	var mul: float = VS[kind].x * (1.5 if a.state == LIE else 1.0)
	flesh_hit(world.fx, at, kind == Ammo.FIRE)
	_sound_at(at, func(h: Vector3) -> void: world.sound.kraken_flesh(h.x, h.y, h.z))
	if kind == Ammo.SHELL:
		world.fx.shell_burst(at, false, 1.0)
		_sound_at(at, func(h: Vector3) -> void: world.sound.shell(h.x, h.y, h.z))
		blast(at, 7.5, damage * 1.7, owner)
	if kind == Ammo.FIRE:
		a.burn = minf(10.0, a.burn + 3.0)
	# knocked back from the blow
	a.flinch_v += 0.9 + (0.8 if kind == Ammo.CHAIN else 0.0)
	_hurt_arm(a, damage * mul, owner, owner.team == Ship.Team.PLAYER)
	if randf() < 0.35:
		world.fx.emit(at, Vector3(randf_range(-2.0, 2.0), randf_range(1.0, 3.0), randf_range(-2.0, 2.0)), randf_range(1.2, 2.0), randf_range(0.6, 1.0), randf_range(2.0, 3.5),
				Color(0.08, 0.02, 0.1, 0.7), Color(0.12, 0.06, 0.14), 4.0, 1.4, Particles.SMOKE, 0.02)


## Shot into its flesh: a hot flash, a spray of sea water off the skin, dark
## gobbets and a puff of ink (the web's particles.fleshHit).
static func flesh_hit(fx: Particles, pos: Vector3, fire: bool) -> void:
	var c0 := Color(9.0, 4.0, 1.0, 1.0) if fire else Color(3.4, 1.6, 1.3, 1.0)
	fx.emit(pos, Vector3.ZERO, 0.12, 2.6, 3.6, c0, Color(1.0, 0.2, 0.15), 0.0, 0.0, Particles.SOFT, 0.001, Vector2.ZERO, 0.0, true)
	var white := Color(1.15, 1.2, 1.22, 0.85)
	for i in 14:
		var a := randf() * TAU
		var sp := randf_range(2.0, 8.0)
		fx.emit(pos, Vector3(cos(a) * sp, randf_range(2.0, 9.0), sin(a) * sp), randf_range(0.6, 1.2), randf_range(0.18, 0.4), 0.1, white, white, 15.0, 0.6, Particles.SOFT, 0.01)
	var gore := Color(0.22, 0.03, 0.08, 0.95)
	for i in 9:
		fx.emit(pos, Vector3(randf_range(-4.0, 4.0), randf_range(1.0, 6.0), randf_range(-4.0, 4.0)), randf_range(0.7, 1.3), randf_range(0.22, 0.42), 0.2, gore, gore, 14.0, 0.5, Particles.SOFT, 0.01)
	for i in 3:
		fx.emit(pos, Vector3(randf_range(-1.0, 1.0), randf_range(0.5, 2.0), randf_range(-1.0, 1.0)), randf_range(1.2, 2.0), 0.8, randf_range(2.4, 3.4),
				Color(0.1, 0.03, 0.12, 0.6), Color(0.16, 0.08, 0.18), 3.0, 1.5, Particles.SMOKE, 0.02)


func _hurt_arm(a: Arm, dmg: float, by: Ship, mine: bool, burn := false) -> void:
	if dmg <= 0.0 or phase != Phase.FIGHT:
		return
	a.flash = minf(1.4, a.flash + (0.15 if burn else 0.7))
	if a.state == GRAB:
		a.grab_dealt += dmg
	# a fair share of every wound reaches the body
	hp -= dmg * (0.6 if a.crown else 0.35)
	var pt := roundi(SPINE * 0.5) * 3
	_tally("a%d" % a.i, dmg, Vector3(a.pts[pt], a.pts[pt + 1], a.pts[pt + 2]), false, mine or (by != null and by.team == Ship.Team.PLAYER))
	if not a.crown:
		a.hp -= dmg
		if a.hp <= 0.0 and a.state != RECOIL and a.state != SINK and a.state != DOWN:
			a.hp = 0.0
			if a.state == GRAB:
				_release(a, true)
			_set_state(a, RECOIL)
			_beaten += 1
			hp -= max_hp * 0.05
			var at := Vector3(a.ax, world.water_height(a.ax, a.az), a.az)
			_ink_burst(a.ax, a.az, 1.0)
			_sound_at(at, func(h: Vector3) -> void: world.sound.kraken_hurt(h.x, h.y, h.z, false))
			arm_beaten.emit(at)
	_check_death()


func _hit_head(damage: float, owner: Ship, kind: int, at: Vector3, eye: bool) -> void:
	flesh_hit(world.fx, at, kind == Ammo.FIRE)
	var h := world.heard(at)
	if world.sound != null:
		world.sound.kraken_flesh(h.x, h.y, h.z)
	if kind == Ammo.SHELL:
		world.fx.shell_burst(at, false, 1.2)
		if world.sound != null:
			world.sound.shell(h.x, h.y, h.z)
	var mul: float = VS[kind].y * (2.2 if eye else 1.0)
	_hurt_head(damage * mul, at, eye, owner.team == Ship.Team.PLAYER)
	if eye:
		# struck in the eye: it shrieks and the lid slams shut
		_lid = 0.0
		_blink_t = 0.5
		if randf() < 0.5 and world.sound != null:
			world.sound.kraken_hurt(maxf(h.x, 0.5), h.y, h.z, true)


func _hurt_head(dmg: float, at: Vector3, crit: bool, mine: bool) -> void:
	if phase != Phase.FIGHT:
		return
	hp -= dmg
	_head_flash = minf(1.5, _head_flash + (1.0 if crit else 0.5))
	_tally("eye" if crit else "head", dmg, at, crit, mine)
	_check_death()


func _check_death() -> void:
	if hp > 0.0 or phase != Phase.FIGHT:
		return
	hp = 0.0
	phase = Phase.DYING
	t = 0.0
	if _prey != null:
		_prey.held = 0.0
	gripped.emit(false, true)
	# the head comes up for its last
	_head = 1
	_head_t = 0.0
	for a in arms:
		if a.state != DOWN:
			_set_state(a, RECOIL)
		a.regrow = 1e9
	_sound_at(body, func(h: Vector3) -> void: world.sound.kraken_death(maxf(h.x, 0.6), h.y * 0.5, h.z))
	_shake(1.0, body)


func _tally(key: String, dmg: float, at: Vector3, crit: bool, mine: bool) -> void:
	var tl: Tally = _tallies.get(key)
	if tl != null:
		tl.dmg += dmg
		tl.crit = tl.crit or crit
		tl.mine = tl.mine or mine
		tl.at = at
	else:
		tl = Tally.new()
		tl.dmg = dmg
		tl.crit = crit
		tl.at = at
		tl.mine = mine
		_tallies[key] = tl


func _flush_tallies(dt: float) -> void:
	for k: String in _tallies.keys():
		var tl: Tally = _tallies[k]
		tl.t += dt
		if tl.t < 0.16:
			continue
		_tallies.erase(k)
		hurt.emit(tl.dmg, tl.at, tl.crit, Part.EYE if k == "eye" else (Part.HEAD if k == "head" else Part.ARM), tl.mine)


# ---------------------------------------------------------------- the guns' view

## Arms standing up out of the sea and the surfaced head, for the gunnery to lay on.
func marks() -> Array[Vector3]:
	var out: Array[Vector3] = []
	if phase != Phase.FIGHT:
		return out
	for a in arms:
		if a.state == DOWN or a.state == SINK or a.state == RECOIL or a.out < 0.6:
			continue
		# a lying arm is marked where it lies; a standing one where it meets the sea
		var k := (roundi(SPINE * 0.55) if a.flat > 0.5 else 3) * 3
		out.append(Vector3(a.pts[k], 0.0, a.pts[k + 2]))
	if head_up():
		out.append(Vector3(body.x + sin(_head_yaw) * 3.0, 0.0, body.z + cos(_head_yaw) * 3.0))
	return out


## What the camera should keep in frame with her, or null.
func focus() -> Variant:
	if phase != Phase.FIGHT and phase != Phase.DYING:
		return null
	return Vector3(body.x, 0.0, body.z)
