class_name PirateAI
extends RefCounted
## A pirate captain. She patrols between open-water waypoints, comes about
## to hunt you once you're sighted (or the moment you fire on her, or her
## pack has seen you), jockeys for a broadside at her own best range keeping
## you abeam on whichever side is loaded, keeps off the shallows and clear of
## other hulls, and runs for it when her hull is in tatters. Wingmen of a
## flotilla keep station on their flagship. The web game's PirateAI.

enum Mode { PATROL, ENGAGE, FLEE }


## A flotilla: wingmen keep station on the flagship, and when one ship sights
## you the whole pack comes about to hunt together.
class Pack:
	var alert_t := -1e9
	var leader: PirateAI


var ship: Ship
var mode := Mode.PATROL
var pack: Pack
## Station off the flagship: x abeam (+ to her port), z astern (m).
var slot := Vector2.ZERO
var aggression := 0.55
## The ship she is hunting (you), chosen a few times a second.
var target: Ship

var _wp := Vector2.ZERO
var _think := 0.0
var _desired := 0.0
var _side_bias := 1.0
var _aim_delay := 0.0
var _rng := RandomNumberGenerator.new()
## A set piece's choice of shot for her every broadside (Ammo, -1 her own).
var force_ammo := -1


func _init(p_ship: Ship, difficulty: float) -> void:
	ship = p_ship
	aggression = clampf(0.55 + difficulty * 0.15, 0.4, 1.0)
	_rng.randomize()
	_side_bias = 1.0 if _rng.randf() < 0.5 else -1.0
	_wp = Vector2(ship.pos.x, ship.pos.z)
	_desired = ship.heading


## A fresh waypoint 120 to 380 m off in open water, in her own archipelago.
func _pick_waypoint(world: World) -> void:
	var home := world.region_at(ship.pos.x, ship.pos.z)
	for i in 30:
		var a := _rng.randf() * TAU
		var r := 120.0 + _rng.randf() * 260.0
		var x := ship.pos.x + cos(a) * r
		var z := ship.pos.z + sin(a) * r
		if world.region_at(x, z) != home or world.past_edge(x, z).z > -60.0:
			continue
		if world.ground_height(x, z) < -7.0 and (world.hazards == null or not world.hazards.vortex_at(x, z, 1.6)):
			_wp = Vector2(x, z)
			return


## Steers off the shallows: probes ahead and to either side, and turns the
## least that clears them. Hot on your heels a captain reads the breakers
## over a reef too late, and skirts a maelstrom far too close. `escaping`:
## already in a maelstrom's grip, she only looks for land.
func _avoid(world: World, heading: float, escaping := false) -> float:
	var s := ship
	var L := s.cls.length
	var reckless := mode == Mode.ENGAGE
	var hz := world.hazards
	var look := [L * 0.8, L * 1.6, L * 2.6 + s.speed * 2.0]
	var blocked := func(ang: float, d: float) -> bool:
		var x := s.pos.x + sin(ang) * d
		var z := s.pos.z + cos(ang) * d
		var h := world.ground_height(x, z)
		if h > -s.cls.draft - 1.5:
			if h > -0.2 or world.reef_at(x, z) < 0.3:
				return true
			if not reckless or d < L:
				return true
		if not escaping and hz != null and hz.vortex_at(x, z, 0.6 if reckless else 1.25):
			return true
		return world.past_edge(x, z).z > 0.0
	var ahead := false
	for d: float in look:
		if blocked.call(heading, d):
			ahead = true
			break
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


func update(dt: float, world: World, player: Ship) -> void:
	var s := ship
	if not s.alive:
		s.rudder = 0.0
		return
	_think -= dt
	target = player if player != null and player.alive else null
	var dx := target.pos.x - s.pos.x if target != null else 0.0
	var dz := target.pos.z - s.pos.z if target != null else 0.0
	var dist := Vector2(dx, dz).length()
	var hp_f := s.hp / s.max_hp
	var reach := s.cls.muzzle_speed * s.cls.muzzle_speed / Ship.GRAVITY * 0.55

	if _think <= 0.0:
		_think = 0.4 + _rng.randf() * 0.3
		var provoked := s.last_attacker != null and s.last_attacker == player and world.time - s.last_hit < 25.0
		var pk := pack
		if pk != null and pk.leader != null and (not is_instance_valid(pk.leader.ship) or not pk.leader.ship.alive):
			pk.leader = null
		# the pack answers a sighting by any of its ships
		if pk != null and target != null and world.time - pk.alert_t < 20.0 and dist < 560.0:
			provoked = true
		if target != null and hp_f < 0.22 and mode != Mode.FLEE and _rng.randf() < 0.5:
			mode = Mode.FLEE
		elif target != null and (dist < 230.0 or provoked) and mode != Mode.FLEE:
			mode = Mode.ENGAGE
		elif mode == Mode.ENGAGE and (target == null or dist > 340.0):
			mode = Mode.PATROL
		elif mode == Mode.FLEE and (target == null or dist > 300.0):
			mode = Mode.PATROL
		if pk != null and mode == Mode.ENGAGE and target != null:
			pk.alert_t = world.time

		var lead: Ship = pk.leader.ship if pk != null and pk.leader != null and pk.leader != self else null
		if mode == Mode.PATROL and lead != null:
			# keep station on the flagship's quarter, aiming a little ahead of
			# the station to fall in alongside rather than chase her stern
			var sh := sin(lead.heading)
			var ch := cos(lead.heading)
			var tx := lead.pos.x + ch * slot.x - sh * slot.y
			var tz := lead.pos.z - sh * slot.x - ch * slot.y
			var gap := Vector2(tx - s.pos.x, tz - s.pos.z).length()
			_desired = lead.heading if gap < 14.0 else atan2(tx + sh * 20.0 - s.pos.x, tz + ch * 20.0 - s.pos.z)
			s.sail_target = clampf(lead.sail_target + (0.35 if gap > 40.0 else (0.15 if gap > 18.0 else 0.0)), 0.25, 1.0)
		elif mode == Mode.PATROL:
			if Vector2(_wp.x - s.pos.x, _wp.y - s.pos.z).length() < 40.0:
				_pick_waypoint(world)
			_desired = atan2(_wp.x - s.pos.x, _wp.y - s.pos.z)
			s.sail_target = 0.5
		elif mode == Mode.ENGAGE and target != null:
			var bearing := atan2(dx, dz)
			var rel := MathX.angle_delta(s.heading, bearing)
			# keep the enemy abeam on whichever side is nearer, or loaded
			var side := 1 if rel > 0.0 else -1
			if not s.can_fire(side) and s.can_fire(-side) and dist < reach * 0.9:
				side = -side
			var ideal := reach * 0.55
			var off := PI * 0.5
			if dist > ideal * 1.5:
				off = PI * 0.22
			elif dist > ideal * 1.1:
				off = PI * 0.38
			elif dist < ideal * 0.55:
				off = PI * 0.72
			_desired = bearing - side * off
			s.sail_target = 1.0 if dist > ideal * 1.2 else 0.75
		elif mode == Mode.FLEE and target != null:
			_desired = atan2(-dx, -dz) + sin(world.time * 0.3) * 0.3
			s.sail_target = 1.0
		# keep clear of other ships
		for o: Ship in world.ships:
			if o == s or not o.alive:
				continue
			var ox := o.pos.x - s.pos.x
			var oz := o.pos.z - s.pos.z
			if Vector2(ox, oz).length() < (o.cls.length + s.cls.length) * 0.75:
				_desired += MathX.angle_delta(_desired, atan2(-ox, -oz)) * 0.5

	# the sea has her: in a maelstrom's grip every hand goes to the braces to
	# spiral out with the flow, and hard on the coral she claws off for deep water
	var esc := world.hazards.escape(s.pos.x, s.pos.z) if world.hazards != null else NAN
	if not is_nan(esc):
		_desired = esc
		s.sail_target = 1.0
	elif s.scrape > 0.12:
		var g := world.ground_gradient(s.pos.x, s.pos.z)
		if g.length_squared() > 1e-6:
			_desired = atan2(-g.x, -g.y)
		s.sail_target = 1.0
	s.rudder = clampf(MathX.angle_delta(s.heading, _avoid(world, _desired, not is_nan(esc))) * 2.2, -1.0, 1.0)

	# gunnery: a broadside the moment you bear
	if target != null and mode != Mode.PATROL and dist < reach * 1.05:
		var rel := MathX.angle_delta(s.heading, atan2(dx, dz))
		var arc := 0.32 + aggression * 0.1
		_aim_delay -= dt
		if _aim_delay <= 0.0:
			for side: int in [1, -1]:
				if absf(rel - side * PI * 0.5) < arc and s.can_fire(side):
					s.ammo = _pick_ammo(dist, target)
					s.fire(side, target)
					_aim_delay = 0.6 + _rng.randf() * 1.2 / aggression
					break


## Now and then a pirate crew rams home something nastier: if it will reach,
## and isn't wasted on a ship already suffering it.
func _pick_ammo(dist: float, target: Ship) -> int:
	if force_ammo >= 0:
		return force_ammo
	var r := _rng.randf()
	for pick: Array in Ammo.PIRATE.get(ship.cls.id, []):
		var kind: int = pick[0]
		if r < float(pick[1]):
			if dist > ship.gun_range(kind) * 0.9:
				return Ammo.ROUND
			if kind == Ammo.CHAIN and target.torn > 4.0:
				return Ammo.ROUND
			if kind == Ammo.FIRE and target.afire > 4.0:
				return Ammo.ROUND
			if kind == Ammo.GRAPE and target.crew_hit > 4.0:
				return Ammo.ROUND
			return kind
		r -= float(pick[1])
	return Ammo.ROUND
