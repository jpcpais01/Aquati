class_name Boarding
extends Node3D
## Boarding a crippled prize, from the moment the hooks fly to the moment the
## lines are cut (the web game's Boarding, src/game/boarding.ts). Grapnels
## whirl up off your rail and arc across, bite into hers and come taut; the
## two ships glide to a stop and her hull is hauled in against yours, beam to
## beam, where both ride lashed together while the fight for her deck goes on
## (Shore.board). Afterwards the lines are cut, the hulls shoved apart, and a
## ship taken as a prize sails off under a prize crew, her colours struck and
## yours run up in their place.
##
## The lines are thick tarred rope drawn as short instanced segments (so they
## sag, whip and come taut) and the iron hooks biting into her rail, in the
## towns' own parts material: nothing new to compile.

## A grapnel whirled and thrown from our rail; it bites into hers; the hulls
## come together; hauled alongside and lashed: over the side, lads.
signal thrown(at: Vector3)
signal bit(at: Vector3)
signal met(at: Vector3)
signal lashed

enum Phase { IDLE, GRAPPLE, DECK, PART }

## When the lines are all fast and the haul begins, and when the hulls meet (s into the grapple).
const PULL0 := 1.35
const PULL1 := 3.1
## A grapnel's flight across (s), and how long the cut lines take to fall away.
const FLIGHT := 0.62
const PART_T := 1.6
## A prize under a prize crew sails off and is gone after this long or this far.
const PRIZE_LIFE := 55.0
const PRIZE_GONE := 470.0
## Rope segments and hooks drawn at most.
const ROPES := 140
const HOOKS := 8


class Grapnel:
	## Along our side (t) and hers.
	var ours := 0.0
	var hers := 0.0
	## When it leaves the thrower's hand, and whether it has bitten yet.
	var at := 0.0
	var bit := false
	var thrown := false
	var spin := 0.0


## Colours coming down a beaten ship's halyards (and, on a prize, yours going up in their place).
class Colours:
	var ship: Ship
	var t := 0.0
	var y0 := 0.0
	var e0 := 0.0
	var drop := 0.0
	var mine: Array[MeshInstance3D] = []
	## Seconds yours have been going up (-1: not yet).
	var up := -1.0


## A prize sailing off under a prize crew.
class Sailing:
	var ship: Ship
	var t := 0.0


var phase := Phase.IDLE
var ship: Ship
var prize: Ship
var t := 0.0
## Her side of us (+1 port) and our side of her.
var side := 1
var her_side := 1
## Prizes sailing off under a prize crew.
var prizes: Array[Sailing] = []
## Riding beam to beam the same way, or bow to stern.
var _same := true
## Where she ends up in our frame (x across to port, z ahead).
var _lat := 0.0
var _off := 0.0
## Her place in our frame (x, z, heading) and its drift as the lines take
## the strain; our own way through the water (x, z, heading), bleeding off.
var _rel := Vector3.ZERO
var _rel_v := Vector3.ZERO
var _glide := Vector3.ZERO
var _glide_v := Vector3.ZERO
var _grapnels: Array[Grapnel] = []
var _met := false
var _colours: Array[Colours] = []
var _ropes: MultiMesh
var _hooks: MultiMesh
var _n := 0
var _h := 0


func _init(parts: Material) -> void:
	name = "Boarding"
	_ropes = _multi(_rope_mesh(), ROPES)
	_hooks = _multi(_hook_mesh(), HOOKS)
	for mm: MultiMesh in [_ropes, _hooks]:
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		mi.material_override = parts
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		# (it moves with the ships: never culled by its first frame's box)
		mi.custom_aabb = AABB(Vector3(-1e5, -1e3, -1e5), Vector3(2e5, 2e3, 2e5))
		add_child(mi)


static func _multi(mesh: Mesh, n: int) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = n
	mm.visible_instance_count = 0
	return mm


## A length of tarred rope: an open five-sided tube of radius 1 up the y axis from 0 to 1.
static func _rope_mesh() -> ArrayMesh:
	var b := TownKit.new(3)
	b.cyl_xf(1.0, 1.0, 1.0, Transform3D(Basis.IDENTITY, Vector3(0.0, 0.5, 0.0)), TownKit.lin("#6d5636"), 5, TownKit.WOOD, false)
	return b.commit()


## A three-pronged iron grappling hook, shank up the +y axis, eye at the top.
static func _hook_mesh() -> ArrayMesh:
	var b := TownKit.new(5)
	var iron := TownKit.lin("#3a3836")
	b.cyl_xf(0.03, 0.035, 0.42, Transform3D(Basis.IDENTITY, Vector3(0.0, 0.21, 0.0)), iron, 6, TownKit.IRON)
	b.torus(0.05, 0.014, 4, 8, Transform3D(Basis.IDENTITY, Vector3(0.0, 0.46, 0.0)), iron, TownKit.IRON)
	for i in 3:
		# each prong curls up from the crown into a barbed point
		var xf := Transform3D(Basis(Vector3.UP, i / 3.0 * TAU), Vector3.ZERO) * Transform3D(Basis.IDENTITY, Vector3(0.13, 0.02, 0.0)) * Transform3D(Basis(Vector3.BACK, PI * 1.05), Vector3.ZERO)
		b.torus(0.13, 0.022, 4, 7, xf, iron, TownKit.IRON, PI * 0.72)
	return b.commit()


func busy() -> bool:
	return phase != Phase.IDLE


## A point on a ship's rail top (`side` +1 port), `inboard` of its edge, in the world.
static func rail_point(s: Ship, at_t: float, rail: int, inboard := 0.0) -> Vector3:
	var sh := s.model.shape
	var y := sh.top(at_t)
	return s.transform * Vector3(rail * (sh.half_width_at_y(at_t, y) - inboard), y, sh.z(at_t))


## Throws the grapnels across: `ours` and `hers` are the two ships' decks (their crews').
func begin(p_ship: Ship, p_prize: Ship, ours: ShipCrew, hers: ShipCrew) -> void:
	ship = p_ship
	prize = p_prize
	phase = Phase.GRAPPLE
	t = 0.0
	_met = false
	prize.lashed = true
	var sh := sin(ship.heading)
	var ch := cos(ship.heading)
	var dx := prize.pos.x - ship.pos.x
	var dz := prize.pos.z - ship.pos.z
	# her place in our frame now, and her way through the water relative to ours
	var rx := dx * ch - dz * sh
	var rz := dx * sh + dz * ch
	var vx := prize.vel.x - ship.vel.x
	var vz := prize.vel.z - ship.vel.z
	_rel = Vector3(rx, rz, MathX.angle_delta(ship.heading, prize.heading))
	_rel_v = Vector3(vx * ch - vz * sh, vx * sh + vz * ch, prize.ang_vel - ship.ang_vel)
	_glide = Vector3(ship.pos.x, ship.pos.z, ship.heading)
	_glide_v = Vector3(ship.vel.x, ship.vel.z, ship.ang_vel)
	side = 1 if rx >= 0.0 else -1
	_same = cos(_rel.z) >= 0.0
	# hull to hull at the waterline; the rails stand a stride apart above (tumblehome)
	_lat = side * (ship.cls.beam / 2.0 + prize.cls.beam / 2.0 + 0.3)
	# her waist opposite ours, so the decks face each other
	var mid_ours := ours.shape.z((ours.main.t0 + ours.main.t1) / 2.0)
	var mid_hers := hers.shape.z((hers.main.t0 + hers.main.t1) / 2.0)
	_off = mid_ours - (mid_hers if _same else -mid_hers)
	# our side of her: the far side of her keel from our own
	her_side = -side if _same else side
	# one line for every few metres of the shorter waist
	var span := minf(ours.main.t1 - ours.main.t0, 0.75) * ship.cls.length
	var n := clampi(roundi(span / 4.0), 3, 6)
	_grapnels.clear()
	for i in n:
		var g := Grapnel.new()
		g.ours = lerpf(ours.main.t0 + 0.04, ours.main.t1 - 0.04, (i + 0.5) / n)
		var z_o := ours.shape.z(g.ours) - _off
		var z_h := z_o if _same else -z_o
		g.hers = clampf(hers.t_of(z_h), hers.main.t0 + 0.02, hers.main.t1 - 0.02)
		g.at = 0.5 + i * 0.17 + randf() * 0.12
		g.spin = randf() * 6.0
		_grapnels.append(g)


## Before the ships move: both glide to a stop and are held, and she is
## hauled in from where she lay to her berth against our side.
func pin(dt: float) -> void:
	var s := ship
	var e := prize
	if phase == Phase.IDLE or s == null or e == null:
		return
	t += dt
	if phase == Phase.PART:
		if t > PART_T:
			_finish()
		return
	if not s.alive or not e.alive:
		part()
		return
	var kg := 1.0 - MathX.damp(1.3, dt)
	_glide_v *= kg
	_glide += _glide_v * dt
	_hold(s, _glide.x, _glide.y, _glide.z)
	# she drifts on as the lines snake out, then takes the strain and comes in
	var kr := 1.0 - MathX.damp(4.0 if t > PULL0 else 1.4, dt)
	_rel_v *= kr
	_rel += _rel_v * dt
	var u := 1.0 if phase == Phase.DECK else clampf((t - PULL0) / (PULL1 - PULL0), 0.0, 1.0)
	var k := u * u * (3.0 - 2.0 * u)
	var lx := lerpf(_rel.x, _lat, k)
	var lz := lerpf(_rel.y, _off, k)
	var lh := lerpf(_rel.z, 0.0 if _same else (PI if _rel.z >= 0.0 else -PI), k)
	var sh := sin(_glide.z)
	var ch := cos(_glide.z)
	_hold(e, _glide.x + lx * ch + lz * sh, _glide.y - lx * sh + lz * ch, _glide.z + lh)
	if phase == Phase.GRAPPLE and t >= PULL1 and not _met:
		_met = true
		phase = Phase.DECK
		met.emit(Vector3((s.pos.x + e.pos.x) / 2.0, 0.4, (s.pos.z + e.pos.z) / 2.0))
		lashed.emit()


static func _hold(s: Ship, x: float, z: float, h: float) -> void:
	s.pos.x = x
	s.pos.z = z
	s.heading = wrapf(h, -PI, PI)
	s.speed = 0.0
	s.ang_vel = 0.0
	s.drift = Vector2.ZERO
	s.anchored = true
	s.sail_target = 0.0
	s.rudder = 0.0


## The hulls shove apart as the lines are cut; a moment later it's all over.
func part() -> void:
	if phase == Phase.IDLE or phase == Phase.PART:
		return
	phase = Phase.PART
	t = 0.0
	var s := ship
	var e := prize
	if s == null or e == null:
		return
	s.anchored = false
	e.anchored = false
	e.lashed = false
	var port := s.port_dir()
	s.drift -= Vector2(port.x, port.z) * side * 1.3
	e.drift += Vector2(port.x, port.z) * side * 1.6


func _finish() -> void:
	if prize != null and is_instance_valid(prize):
		prize.lashed = false
	phase = Phase.IDLE
	ship = null
	prize = null
	_grapnels.clear()
	_begin()
	_end()


## Her crew has struck: her flag and ensign come down hand over hand.
func strike(s: Ship) -> void:
	var m := s.model
	var c := Colours.new()
	c.ship = s
	c.y0 = m.flag_pivot.position.y
	c.e0 = m.ensign_pivot.position.y
	c.drop = maxf(2.0, minf(c.y0 - m.shape.main_deck_y(0.5) - 2.2, c.y0 * 0.75))
	_colours.append(c)


## ...and on a prize, your own colours run up in their place (your flag's own
## material: nothing new to compile).
func hoist(s: Ship, by: Ship) -> void:
	var c: Colours = null
	for o in _colours:
		if o.ship == s:
			c = o
	if c == null or by.model.flags.is_empty():
		return
	var mat := by.model.flags[0].material_override
	for piv: Node3D in [s.model.flag_pivot, s.model.ensign_pivot]:
		var theirs: MeshInstance3D = null
		for ch in piv.get_children():
			if ch is MeshInstance3D:
				theirs = ch
				break
		if theirs == null:
			continue
		var m := MeshInstance3D.new()
		m.mesh = theirs.mesh
		m.material_override = mat
		m.visible = false
		piv.add_child(m)
		c.mine.append(m)
	c.up = 0.0


func _run_colours(dt: float) -> void:
	for i in range(_colours.size() - 1, -1, -1):
		var c := _colours[i]
		if not is_instance_valid(c.ship) or c.ship.removed:
			_colours.remove_at(i)
			continue
		var m := c.ship.model
		c.t += dt
		var k := clampf(c.t / 2.6, 0.0, 1.0)
		# hauled down in tugs, not one smooth slide
		var low := k * k * (3.0 - 2.0 * k) - sin(k * PI * 7.0) * 0.012 * (1.0 - k)
		if k >= 1.0:
			for piv: Node3D in [m.flag_pivot, m.ensign_pivot]:
				for ch in piv.get_children():
					if ch is MeshInstance3D:
						(ch as MeshInstance3D).visible = c.mine.has(ch) and c.up >= 0.0
			if c.up >= 0.0:
				c.up += dt
				var u := clampf(c.up / 3.2, 0.0, 1.0)
				low = 1.0 - u * u * (3.0 - 2.0 * u)
				if u >= 1.0:
					_colours.remove_at(i)
			elif c.t > 30.0:
				_colours.remove_at(i)
		m.flag_pivot.position.y = c.y0 - c.drop * low
		m.ensign_pivot.position.y = c.e0 - 1.3 * low


## She goes off under a prize crew: away from us and over the horizon.
func send_away(s: Ship) -> void:
	s.prize = true
	s.sail_target = 2.0 / 3.0
	var p := Sailing.new()
	p.ship = s
	prizes.append(p)


## After the ships move: the prizes on their way, the colours, and the
## lines between the rails and the boarders' ropes (`swings`: [from, to,
## slack] each, Shore.swing_lines).
func update(dt: float, world: World, swings: Array, player: Ship) -> void:
	_sail_prizes(dt, player)
	if not _colours.is_empty():
		_run_colours(dt)
	var s := ship
	var e := prize
	if phase == Phase.IDLE or s == null or e == null:
		return
	_begin()
	var pull := clampf((t - PULL0) / (PULL1 - PULL0), 0.0, 1.0)
	for g in _grapnels:
		var a := rail_point(s, g.ours, side, 0.12)
		var b := rail_point(e, g.hers, her_side, 0.06)
		if phase == Phase.PART:
			# cut: the loose end drops over the side and is hauled in
			var f := clampf(t / PART_T, 0.0, 1.0)
			var h := a.lerp(b, 0.55 * (1.0 - f))
			h.y = lerpf(b.y, maxf(world.water_height(h.x, h.z), a.y - 3.2), minf(1.0, f * 2.5))
			_line(a, h, 0.25 * (1.0 - f), 0.04, 0.15 * (1.0 - f), t * 9.0 + g.spin, 6)
			continue
		var u := (t - g.at) / FLIGHT
		if u < 0.0:
			if not g.thrown and t > g.at - 0.45:
				g.thrown = true
				thrown.emit(a)
			continue
		if u < 1.0:
			# in flight: an arc from the thrower's swing up over the gap, the line paying out behind
			var h := Vector3(a.x, a.y + 1.5, a.z).lerp(b, u)
			h.y += 2.4 * sin(PI * u)
			_line(a, h, 0.12, 0.034, 0.35 * (1.0 - u), t * 14.0 + g.spin, 7)
			var up := a - h
			up.y = 0.4
			_hook(h, up, g.spin + t * 18.0)
			continue
		if not g.bit:
			g.bit = true
			bit.emit(b)
		# fast: slack, then hauling taut, then working against the swell
		var sag := 0.07 + 0.04 * sin(world.time * 1.3 + g.spin) if phase == Phase.DECK else lerpf(0.9, 0.08, pull)
		_line(a, b, sag, 0.042, 0.08 if phase == Phase.GRAPPLE and pull <= 0.0 else 0.0, world.time * 3.0 + g.spin)
		var up := a - b
		up.y = 0.5
		_hook(b, up, g.spin)
	for r: Array in swings:
		var slack: float = r[2]
		_line(r[0], r[1], slack, 0.032, 0.0, 0.0, 6 if slack > 0.0 else 3)
	_end()


## Prizes under a prize crew: away from your guns, and gone once over the horizon.
func _sail_prizes(dt: float, player: Ship) -> void:
	for i in range(prizes.size() - 1, -1, -1):
		var p := prizes[i]
		var s := p.ship
		p.t += dt
		if not is_instance_valid(s) or not s.alive or s.removed:
			prizes.remove_at(i)
			continue
		# give the ship she was lashed to a wide berth, then turn for home
		var ax := s.pos.x - player.pos.x if player != null else 0.0
		var az := s.pos.z - player.pos.z if player != null else 0.0
		var d := Vector2(ax, az).length()
		var want := atan2(ax, az) if d > 1.0 else s.heading
		s.rudder = clampf(MathX.angle_delta(s.heading, want) * 2.0, -1.0, 1.0)
		s.sail_target = 2.0 / 3.0 if p.t > 2.0 else 0.2
		# gone over the horizon (or far enough off, after a while, that nobody sees her go)
		if d > PRIZE_GONE or (p.t > PRIZE_LIFE and d > 300.0) or p.t > PRIZE_LIFE * 4.0:
			s.removed = true
			prizes.remove_at(i)


## A fresh voyage: nothing lashed, no prizes on the way to port.
func reset() -> void:
	_finish()
	prizes.clear()
	_colours.clear()


# ------------------------------------------------------------------ the lines

func _begin() -> void:
	_n = 0
	_h = 0


func _end() -> void:
	_ropes.visible_instance_count = _n
	_hooks.visible_instance_count = _h


## A straight length of rope from a to b, `r` thick.
func _seg(a: Vector3, b: Vector3, r: float) -> void:
	if _n >= ROPES:
		return
	var d := b - a
	var len := d.length()
	if len < 1e-3:
		return
	_ropes.set_instance_transform(_n, Transform3D(_toward(d / len) * Basis.from_scale(Vector3(r, len, r)), a))
	_n += 1


## A rope hung from a to b with `sag` metres of droop at its middle (0 taut),
## and a sideways whip `wob` for a line still snaking through the air.
func _line(a: Vector3, b: Vector3, sag: float, r := 0.028, wob := 0.0, ph := 0.0, n := 9) -> void:
	var from := a
	for i in range(1, n + 1):
		var f := float(i) / n
		var p := a.lerp(b, f)
		var bow := 4.0 * f * (1.0 - f)
		p.y -= sag * bow
		if wob != 0.0:
			var w := sin(f * 7.0 + ph) * wob * bow
			p.x += w * 0.7
			p.z -= w * 0.7
			p.y += cos(f * 5.0 + ph) * wob * 0.5 * bow
		_seg(from, p, r)
		from = p


## A hook at `at`, shank pointing along `up` (toward the line it hangs from).
func _hook(at: Vector3, up: Vector3, spin: float) -> void:
	if _h >= HOOKS:
		return
	_hooks.set_instance_transform(_h, Transform3D(_toward(up.normalized()) * Basis(Vector3.UP, spin) * Basis.from_scale(Vector3.ONE * 1.25), at))
	_h += 1


## The turn that stands y up along `d` (a unit vector).
static func _toward(d: Vector3) -> Basis:
	if d.y < -0.9999:
		return Basis(Vector3.RIGHT, PI)
	return Basis(Quaternion(Vector3.UP, d))
