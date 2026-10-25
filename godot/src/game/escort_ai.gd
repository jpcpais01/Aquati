class_name EscortAI
extends RefCounted
## An escort's captain (the web's EscortAI): keeps station on the flagship's
## quarter at her pace, guards her (whoever comes for her, and nothing she'd
## have to chase far), breaks formation to engage your target on "attack",
## heaves to and guards the waters on "hold", falls back under the flagship's
## guns when badly holed, and lets fly at any foe that wanders into a loaded
## broadside's arc. With the flagship gone she breaks off and makes for home.

enum Mode { STATION, FIGHT, HOLD, FALLBACK, ADRIFT }

var ship: Ship
## Her roster entry (Fleet), kept up to date with her hull and tally.
var rec: Dictionary
var order := "follow"
var mode := Mode.STATION
## The ship she's fighting, if any.
var target: Ship
## Her station off the flagship: x to port, y astern (m).
var slot := Vector2(20.0, 30.0)

var _think := 0.0
var _desired := 0.0
var _side_bias := 1.0
var _aim_delay := 0.0
## Seconds she has spent too far off station to fight: a breather before the leash lets go again.
var _leash_t := 0.0
var _rng := RandomNumberGenerator.new()


func _init(p_ship: Ship, p_rec: Dictionary) -> void:
	ship = p_ship
	rec = p_rec
	_desired = ship.heading
	_rng.randomize()
	_side_bias = 1.0 if _rng.randf() < 0.5 else -1.0


## How far her guns reach with round shot.
func reach() -> float:
	return ship.gun_range(Ammo.ROUND) * 0.92


## A word for the fleet panel.
func status() -> String:
	if not ship.alive:
		return "Lost"
	match mode:
		Mode.FIGHT:
			return "Engaging the %s" % target.ship_name if target != null else "Engaging"
		Mode.HOLD:
			return "Holding position"
		Mode.FALLBACK:
			return "Badly holed · falling back"
		Mode.ADRIFT:
			return "Hove to"
	return "No target · on station" if order == "attack" else "On station"


## Steering off the shallows and maelstroms: probe ahead and to either side.
func _avoid(world: World, heading: float, escaping := false) -> float:
	var s := ship
	var L := s.cls.length
	var hz := world.hazards
	var blocked := func(ang: float, d: float) -> bool:
		var x := s.pos.x + sin(ang) * d
		var z := s.pos.z + cos(ang) * d
		if world.ground_height(x, z) > -s.cls.draft - 1.5:
			return true
		if not escaping and hz != null and hz.vortex_at(x, z, 1.3):
			return true
		return world.past_edge(x, z).z > 0.0
	var look := [L * 0.8, L * 1.6, L * 2.6 + s.speed * 2.0]
	var ahead := false
	for d: float in look:
		ahead = ahead or blocked.call(heading, d)
	if not ahead:
		return heading
	for k in range(1, 7):
		var off := k * 0.32
		var left := true
		var right := true
		for d: float in look:
			left = left and not blocked.call(heading + off, d)
			right = right and not blocked.call(heading - off, d)
		if left and right:
			return heading + off * _side_bias
		if left:
			return heading + off
		if right:
			return heading - off
	return heading + PI * 0.6


## The way she'd make with full sail on heading `h` (for matching the flagship's pace).
func _full_speed(world: World, h: float) -> float:
	var s := ship
	var w := world.wind
	var rel := MathX.angle_delta(atan2(w.dir_x, w.dir_z), h)
	var hp_f := (0.72 + 0.28 * (s.hp / s.max_hp)) * s.dmg.speed_factor()
	return maxf(1.0, s.cls.max_speed * float(s.boost.speed) * Ship.wind_factor(rad_to_deg(rel)) * (0.75 + 0.25 * w.strength) * hp_f)


## `flag` is your ship (null once she's gone), `foes` every hostile ship
## afloat, `mark` the ship your own guns are laid on, `marks` anything else
## worth a broadside (the Kraken's arms, a hostile fort's guns).
func update(dt: float, world: World, flag: Ship, foes: Array[Ship], mark: Ship, marks: Array[Vector3] = []) -> void:
	var s := ship
	if not s.alive:
		s.rudder = 0.0
		return
	_think -= dt
	var range_m := reach()
	var flag_ok := flag != null and flag.alive
	if _think <= 0.0:
		_think = 0.35 + _rng.randf() * 0.25
		_leash_t = maxf(0.0, _leash_t - 0.4)
		_choose(world, flag if flag_ok else null, foes, mark, range_m)
		_steer(world, flag if flag_ok else null, range_m)
		# keep clear of other hulls (the flagship most of all)
		for o: Ship in world.ships:
			if o == s or not o.alive or o.removed:
				continue
			var ox := o.pos.x - s.pos.x
			var oz := o.pos.z - s.pos.z
			var near := (o.cls.length + s.cls.length) * (0.95 if o == flag else 0.75)
			if Vector2(ox, oz).length() < near:
				_desired += MathX.angle_delta(_desired, atan2(-ox, -oz)) * (0.7 if o == flag else 0.5)
	# caught by a maelstrom anyway: out with the flow under full sail
	var esc := world.hazards.escape(s.pos.x, s.pos.z) if world.hazards != null else NAN
	if not is_nan(esc):
		_desired = esc
		s.sail_target = 1.0
	s.rudder = clampf(MathX.angle_delta(s.heading, _avoid(world, _desired, not is_nan(esc))) * 2.2, -1.0, 1.0)
	_gunnery(dt, foes, marks, range_m)


## Picks what she's doing: who to fight, or where to be.
func _choose(world: World, flag: Ship, foes: Array[Ship], mark: Ship, range_m: float) -> void:
	var s := ship
	if flag == null:
		# the flagship is gone: she breaks off and makes for home
		mode = Mode.ADRIFT
		target = null
		return
	var hp_f := s.hp / s.max_hp
	var from_flag := Vector2(s.pos.x - flag.pos.x, s.pos.z - flag.pos.z).length()
	var leash := 650.0 if order == "attack" else (INF if order == "hold" else 240.0)
	if hp_f < 0.2 and order != "hold":
		# too badly holed to stand in the line: back under the flagship's guns
		mode = Mode.FALLBACK
		target = null
		return
	if from_flag > leash:
		_leash_t = 6.0
	var live := func(t: Ship) -> bool: return t != null and is_instance_valid(t) and t.alive and not t.removed and foes.has(t)
	var pick: Ship = null
	if order == "attack":
		if live.call(mark) and _dist2(mark, flag) < 700.0:
			pick = mark
		elif live.call(target) and _dist2(target, flag) < 560.0:
			pick = target
		else:
			pick = _nearest(foes, flag.pos, 480.0)
	elif order == "hold":
		pick = target if live.call(target) and _dist2(target, s) < range_m * 1.15 else _nearest(foes, s.pos, range_m * 1.05)
	elif _leash_t <= 0.0:
		# guarding: whoever comes for the flagship (or for her), and nothing she'd have to chase far
		var t := world.time
		var bd := INF
		for f in foes:
			var df := _dist2(f, flag)
			var de := _dist2(f, s)
			var hostile := (flag.last_attacker == f and t - flag.last_hit < 15.0) or (s.last_attacker == f and t - s.last_hit < 15.0)
			if de > range_m * 1.5 and not (hostile and df < 300.0):
				continue
			if df > 260.0:
				continue
			var score := de * (0.6 if hostile else 1.0) * (0.8 if f == target else 1.0)
			if score < bd:
				bd = score
				pick = f
	target = pick
	mode = Mode.FIGHT if pick != null else (Mode.HOLD if order == "hold" else Mode.STATION)


func _steer(world: World, flag: Ship, range_m: float) -> void:
	var s := ship
	s.boost.speed = 1.0
	if mode == Mode.ADRIFT or flag == null:
		# nothing to guard: away under easy sail, out of the fight
		s.sail_target = 1.0 / 3.0
		return
	if mode == Mode.HOLD:
		s.sail_target = 0.0
		_desired = s.heading
		return
	if mode == Mode.FIGHT and target != null:
		var t := target
		var dx := t.pos.x - s.pos.x
		var dz := t.pos.z - s.pos.z
		var d := Vector2(dx, dz).length()
		var bearing := atan2(dx, dz)
		var rel := MathX.angle_delta(s.heading, bearing)
		if order == "hold":
			# hove to: just swing the loaded broadside round onto her
			var near_side := 1 if rel > 0.0 else -1
			var side := near_side if s.can_fire(near_side) or not s.can_fire(-near_side) else -near_side
			_desired = bearing - side * PI * 0.5
			s.sail_target = 0.25 if absf(MathX.angle_delta(s.heading, _desired)) > 0.35 else 0.0
			return
		# keep her abeam on whichever side is loaded, at a comfortable range for the guns
		var side := 1 if rel > 0.0 else -1
		if not s.can_fire(side) and s.can_fire(-side) and d < range_m * 0.9:
			side = -side
		var ideal := range_m * 0.55
		var off := PI * 0.5
		if d > ideal * 1.5:
			off = PI * 0.22
		elif d > ideal * 1.1:
			off = PI * 0.38
		elif d < ideal * 0.55:
			off = PI * 0.72
		_desired = bearing - side * off
		s.sail_target = 1.0 if d > ideal * 1.2 else 0.75
		return
	# on station (or falling back to it, under all the canvas she has)
	var sl := slot * 0.6 if mode == Mode.FALLBACK else slot
	var sh := sin(flag.heading)
	var ch := cos(flag.heading)
	# port = (cos h, -sin h), forward = (sin h, cos h)
	var stx := flag.pos.x + ch * sl.x - sh * sl.y
	var stz := flag.pos.z - sh * sl.x - ch * sl.y
	var ex := stx - s.pos.x
	var ez := stz - s.pos.z
	var gap := Vector2(ex, ez).length()
	# + she's astern of her station; + her station is to port
	var along := ex * sh + ez * ch
	var across := ex * ch - ez * sh
	var stopped := flag.anchored or (flag.speed < 1.8 and flag.sail_target < 0.1)
	if stopped:
		# the flagship has hove to (or anchored): come up to the station and lie there
		if gap < 22.0:
			s.sail_target = 0.0
			_desired = flag.heading
		else:
			_desired = atan2(ex, ez)
			s.sail_target = 1.0 if gap > 60.0 else (2.0 / 3.0 if gap > 34.0 else 0.4)
		return
	if gap > 48.0:
		# well off station: steer for a point a little ahead of it, so she falls in alongside rather than chasing
		_desired = atan2(ex + sh * 26.0, ez + ch * 26.0)
		s.sail_target = 1.0
		if along > 0.0:
			s.boost.speed = 1.3
		return
	# in station: hold the flagship's course, easing across onto the line and matching her pace
	_desired = flag.heading + clampf(across * 0.035, -0.5, 0.5)
	# dropping astern of a flagship under full sail: a touch more than she has, so she can close up
	if along > 4.0:
		s.boost.speed = 1.0 + minf(0.25, along * 0.008)
	var want := flag.speed + clampf(along * 0.22, -3.5, 5.0)
	s.sail_target = clampf(want / _full_speed(world, _desired), 0.06, 1.0)


## Any foe (or other mark) sat in a loaded broadside's arc and in reach gets it.
func _gunnery(dt: float, foes: Array[Ship], marks: Array[Vector3], range_m: float) -> void:
	var s := ship
	_aim_delay -= dt
	if _aim_delay > 0.0 or mode == Mode.ADRIFT:
		return
	if not s.can_fire(1) and not s.can_fire(-1):
		return
	var fired := false
	# her own target first, then whoever else wanders into her guns, then the marks
	if target != null and is_instance_valid(target) and target.alive:
		fired = _try_at(target.pos.x, target.pos.z, target, range_m)
	if not fired:
		for f in foes:
			if f != target and f.alive and _try_at(f.pos.x, f.pos.z, f, range_m):
				fired = true
				break
	if not fired:
		for m in marks:
			if _try_at(m.x, m.z, null, range_m):
				fired = true
				break
	if fired:
		_aim_delay = 0.5 + _rng.randf() * 0.9


func _try_at(x: float, z: float, t: Ship, range_m: float) -> bool:
	var s := ship
	var d := Vector2(x - s.pos.x, z - s.pos.z).length()
	if d > range_m * 1.05 or d < s.cls.beam:
		return false
	var rel := MathX.angle_delta(s.heading, atan2(x - s.pos.x, z - s.pos.z))
	for side: int in [1, -1]:
		if absf(rel - side * PI * 0.5) < 0.42 and s.can_fire(side):
			s.ammo = Ammo.ROUND
			s.fire(side, t, null if t != null else Vector3(x, 0.0, z))
			return true
	return false


static func _dist2(a: Ship, b: Ship) -> float:
	return Vector2(a.pos.x - b.pos.x, a.pos.z - b.pos.z).length()


static func _nearest(foes: Array[Ship], at: Vector3, within: float) -> Ship:
	var best: Ship = null
	var bd := within
	for f in foes:
		var d := Vector2(f.pos.x - at.x, f.pos.z - at.z).length()
		if d < bd:
			bd = d
			best = f
	return best
