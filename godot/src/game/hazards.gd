class_name Hazards
extends RefCounted
## The sea's own dangers, out where no island shelters you (the web's
## game/hazards.ts).
##
## Maelstroms: great whirlpools turn in deep water, three off the home
## islands and one in Las Brumas. Their pull reaches out a long way; inside
## it the current drags a ship round and in, swinging her head with the
## spin, and the sea itself falls away into a funnel she heels down into
## (Vortex shapes the water, the ocean draws it on its own ring mesh). Near
## the eye the strain wrings her timbers; in the throat the sea drags her
## under, and once it comes in over her rail she's gone down it. They swell
## in a storm and slacken a little in fair weather, and you sail out of one
## by running before the wind, spiralling out with the flow.
##
## Reefs: open-sea coral a metre or two under the surface (the bake raises
## it, Ship grinds keels on it). Here only the warnings: what lies ahead of
## her bow and how much water is over it.
##
## Pirates keep clear of both while they patrol (PirateAI); one on your
## heels when the sea takes her is yours: the guns that drove her there
## get the credit.

## A blow the sea struck a ship: "maelstrom" (the strain, the throat) with
## the damage it did. The game says so over her.
signal struck(ship: Ship, kind: String, dealt: float)

## Which way each turns (the web's NAMES: the bake keeps only where and how wide).
const DIRS := {"La Gargantilha": 1, "Redemolino Noir": -1, "El Ojo de Juracán": 1, "Sorvedouro da Bruma": -1}
## Peak swirl (m/s, at the edge of the throat) and inflow at full strength.
const SWIRL := 8.5
const INFLOW := 3.1
## Radius fraction where the swirl peaks; inside it the water turns like a solid wheel.
const CORE := 0.17
## Strain from the funnel's walls and its throat, as fractions of her hull a second.
const STRAIN := 0.018
const THROAT := 0.055
## The maw: inside this radius fraction the throat drags a hull under, at up
## to DRAW of the way a second (light hulls ride it a little longer). Fight
## clear in time and she bobs back up; let it reach her rail and she's gone.
const MAW := 0.15
const DRAW := 0.2

var world: World
## Every maelstrom: {name, x, z, r0, phase, v (its Vortex)}.
var maelstroms: Array[Dictionary] = []
## Every open-sea reef: {name, kind, x, z, r}.
var reefs: Array[Dictionary] = []

## Hull strain owed to each ship, paid in bites: {acc, t}.
var _strain := {}
var _fx_t := 0.0
var _storm := 0.0


func _init(p_world: World) -> void:
	world = p_world
	var i := 0
	for r in world.regions:
		for m: Dictionary in r.maelstroms:
			var nm := str(m.name)
			var dir: int = DIRS.get(nm, 1 if i % 2 == 0 else -1)
			var v := Vortex.new(float(m.x), float(m.z), float(m.r), dir)
			maelstroms.append({"name": nm, "x": v.x, "z": v.z, "r0": v.r, "phase": fmod(37.3 * (i + 1), 100.0), "v": v})
			i += 1
		for f: Dictionary in r.reefs:
			reefs.append(f)
	world.vortices.clear()
	for m in maelstroms:
		world.vortices.append(m.v)
	world.hazards = self
	sync()


## Every maelstrom stilled (or stirred again): the farewell's sea doesn't need them.
func set_live(on: bool) -> void:
	for m in maelstroms:
		(m.v as Vortex).k = 1.0 if on else 0.0
	sync()


## Whether (x, z) lies within `margin` radii of a maelstrom's eye.
func vortex_at(x: float, z: float, margin: float) -> bool:
	for m in maelstroms:
		var v: Vortex = m.v
		if Vector2(v.x - x, v.z - z).length() < v.r * margin:
			return true
	return false


## The heading out of a maelstrom's grip for a ship at (x, z) (NAN when she's
## clear): out and round with the flow, since fighting straight across the
## current only stalls her.
func escape(x: float, z: float) -> float:
	for m in maelstroms:
		var v: Vortex = m.v
		var dx := x - v.x
		var dz := z - v.z
		if Vector2(dx, dz).length() > v.r * 0.95 or v.k <= 0.05:
			continue
		return atan2(dx, dz) + v.dir * -0.55
	return NAN


## How near the eye of a live maelstrom (x, z) lies: 1 at the eye .. 0 past `reach` radii.
func eye_at(x: float, z: float, reach: float) -> float:
	var best := 0.0
	for m in maelstroms:
		var v: Vortex = m.v
		if v.k <= 0.05:
			continue
		var u := Vector2(x - v.x, z - v.z).length() / v.r
		if u < reach:
			best = maxf(best, 1.0 - u / reach)
	return best


## The water's flow at (x, z): x, z its speed (m/s), and the swing it gives a
## hull's head (rad/s; headings run the other way round from the water).
func flow_at(x: float, z: float) -> Vector3:
	var fx := 0.0
	var fz := 0.0
	var spin := 0.0
	for m in maelstroms:
		var v: Vortex = m.v
		if v.k <= 0.0:
			continue
		var dx := x - v.x
		var dz := z - v.z
		var d := Vector2(dx, dz).length()
		var u := d / v.r
		if u > 1.3 or d < 0.01:
			continue
		var edge := 1.0 - MathX.smooth(0.7, 1.3, u)
		# a Rankine vortex: a solid core, then a swirl that falls away with distance
		var vt := v.k * SWIRL * (u / CORE if u < CORE else pow(CORE / u, 0.62)) * edge
		# (easing off at the very eye, so what reaches it hangs there rather than jittering across)
		var vr := v.k * INFLOW * edge * (0.35 + 0.65 * (1.0 - minf(u, 1.0))) * minf(1.0, u / 0.03)
		var rx := dx / d
		var rz := dz / d
		# the water turns toward increasing atan2(z, x) when dir is 1 (as the
		# ocean's arms do): along dir * (-rz, rx), and in toward the eye
		fx += -rz * v.dir * vt - rx * vr
		fz += rx * v.dir * vt - rz * vr
		spin -= vt / maxf(d, 6.0) * v.dir
	return Vector3(fx, fz, spin)


## Where `s` stands with the nearest maelstrom (empty when well clear of
## all): {m, u (radii from the eye), dist, flow (m/s), out (her own speed
## away from the eye, negative: being drawn in)}.
func state_of(s: Ship, reach := 2.6) -> Dictionary:
	var best := {}
	for m in maelstroms:
		var v: Vortex = m.v
		var dx := s.pos.x - v.x
		var dz := s.pos.z - v.z
		var dist := Vector2(dx, dz).length()
		var u := dist / v.r
		if u > reach or (not best.is_empty() and u > float(best.u)):
			continue
		var out := (s.vel.x * dx + s.vel.z * dz) / dist if dist > 0.01 else 0.0
		best = {"m": m, "u": u, "dist": dist, "flow": s.current.length(), "out": out}
	return best


## The reef (x, z) lies in or within `pad` of (empty for none).
func reef_near(x: float, z: float, pad := 0.0) -> Dictionary:
	for r in reefs:
		if Vector2(float(r.x) - x, float(r.z) - z).length() < float(r.r) + pad:
			return r
	return {}


## Coral ahead of her bow that her keel would strike within `look` m: how
## far ahead (m) and the water over it (m) (x < 0: the way is clear).
func shoal_ahead(s: Ship, look: float) -> Vector2:
	if reef_near(s.pos.x, s.pos.z, look + 20.0).is_empty():
		return Vector2(-1.0, 0.0)
	var f := s.forward()
	var b := s.cls.beam * 0.45
	var px := f.z
	var pz := -f.x
	var keel := s.cls.draft * 0.95 + 0.15
	var d := s.cls.length * 0.5
	while d <= look:
		for o: float in [0.0, b, -b]:
			var x := s.pos.x + f.x * d + px * o
			var z := s.pos.z + f.z * d + pz * o
			if world.reef_at(x, z) < 0.3:
				continue
			var depth := -world.ground_height(x, z)
			if depth < keel:
				return Vector2(d - s.cls.length * 0.5, depth)
		d += 3.0
	return Vector2(-1.0, 0.0)


## A step of the sea's dangers: the maelstroms breathe (deeper and wider in a
## storm), the current takes every hull in its reach, the throat drags down
## what it holds and wrings what's near it, floating salvage is swept round
## and swallowed, and spray flies off the throats near `view`.
func update(dt: float, view: Vector3, storm: float) -> void:
	var t := world.time
	_storm += (storm - _storm) * MathX.damp(0.2, dt)
	for m in maelstroms:
		var v: Vortex = m.v
		if v.k <= 0.0 and dt > 0.0:
			continue
		var breath := 0.92 + 0.08 * sin(t * 0.031 + float(m.phase)) + 0.05 * sin(t * 0.083 + float(m.phase) * 2.3)
		v.k = breath * (1.0 + _storm * 0.28)
		v.r = float(m.r0) * (1.0 + _storm * 0.14)
	sync()
	if dt <= 0.0:
		return
	for s in world.ships:
		if s.removed:
			continue
		var fl := flow_at(s.pos.x, s.pos.z)
		s.current = Vector2(fl.x, fl.y)
		# dragged down, she whirls faster and faster with the water; a heavy hull answers slowly
		s.spin = fl.z * 0.75 / sqrt(s.cls.mass) * (1.0 + s.drawn * 1.8)
		_drag(s, dt)
		if s.alive:
			_wring(s, dt)
	_sweep(dt)
	_spray(dt, view)


## The throat at the heart of the funnel pulls a hull down into it: deeper
## and deeper while she lingers, till the sea pours over her rail and takes
## her (no blast, no wreck wallowing on the surface: she goes on down the
## throat). A wreck that drifts into it is swallowed the same way.
func _drag(s: Ship, dt: float) -> void:
	if s.swallowed:
		return
	if s.phantom:
		# no throat can hold a ghost (Haunt): she rises out of it
		s.drawn = maxf(0.0, s.drawn - dt * 0.35)
		return
	var pull := 0.0
	for m in maelstroms:
		var v: Vortex = m.v
		if v.k <= 0.05:
			continue
		var u := Vector2(s.pos.x - v.x, s.pos.z - v.z).length() / v.r
		if u < MAW:
			pull = maxf(pull, (1.0 - u / MAW) * minf(v.k, 1.3))
	if not s.alive:
		if pull > 0.45 and s.sink_t < s.wreck_life:
			s.swallowed = true
		return
	if pull <= 0.0:
		# clear of the maw she bobs back up, slowly
		s.drawn = maxf(0.0, s.drawn - dt * 0.12)
		return
	var was := s.drawn
	s.drawn += dt * DRAW * pow(pull, 0.75) * (0.8 + 0.2 * s.cls.mass)
	# the first time the throat really takes hold, her timbers cry out
	if was < 0.35 and s.drawn >= 0.35:
		if world.sound != null:
			var h := world.heard(s.pos)
			world.sound.crunch(h.x, h.y, h.z, 0.5)
		world.shook.emit(0.35 if s.team == Ship.Team.PLAYER else 0.0)
	if s.drawn < 1.0:
		return
	# the sea comes in over her rail: she's gone
	s.drawn = 1.0
	s.swallowed = true
	var by := _driven_by(s)
	var dealt := s.damage(s.hp * 4.0 + s.max_hp, by, null, false, "maelstrom")
	struck.emit(s, "maelstrom", dealt)


## The strain of the funnel on a hull: a creak near the eye, ruin in its throat.
func _wring(s: Ship, dt: float) -> void:
	var rate := 0.0
	for m in maelstroms:
		var v: Vortex = m.v
		var u := Vector2(s.pos.x - v.x, s.pos.z - v.z).length() / v.r
		if u > 0.42:
			continue
		var wall := pow(1.0 - u / 0.42, 1.5) * STRAIN
		var throat := (1.0 - u / 0.13) * THROAT if u < 0.13 else 0.0
		rate += (wall + throat) * v.k
	var st: Dictionary = _strain.get(s, {})
	if rate <= 0.0:
		if not st.is_empty():
			_strain.erase(s)
		return
	if st.is_empty():
		st = {"acc": 0.0, "t": 0.0}
		_strain[s] = st
	st.acc = float(st.acc) + rate * s.max_hp * dt
	st.t = float(st.t) - dt
	if float(st.t) > 0.0:
		return
	st.t = 0.7
	var by := _driven_by(s)
	var dealt := s.damage(float(st.acc), by, null, false, "maelstrom")
	st.acc = 0.0
	struck.emit(s, "maelstrom", dealt)


## Whose guns drove her there: a pirate the player had under fire this last
## minute and a half goes down to the player's credit (the web's lured kill).
func _driven_by(s: Ship) -> Ship:
	var by := s.last_attacker
	if by == null or s.team != Ship.Team.PIRATE or by.team != Ship.Team.PLAYER or not by.alive:
		return null
	return by if world.time - s.last_hit < 90.0 else null


## Salvage afloat is swept round with the water, and the throat swallows what it reaches.
func _sweep(dt: float) -> void:
	if world.loot == null:
		return
	var items := world.loot.all()
	var moved := false
	for i in range(items.size() - 1, -1, -1):
		var it: Loot.Item = items[i]
		if it.moored:
			continue
		var at := world.loot.where(it)
		var fl := flow_at(at.x, at.y)
		if fl.x == 0.0 and fl.y == 0.0:
			continue
		it.base += Vector2(fl.x, fl.y) * dt * 0.85
		moved = true
		at = world.loot.where(it)
		for m in maelstroms:
			var v: Vortex = m.v
			if Vector2(at.x - v.x, at.y - v.z).length() < v.r * 0.07:
				world.loot.remove(it)
				world.fx.splash(Vector3(at.x, world.water_height(at.x, at.y), at.y), 0.5)
				break
	if moved:
		world.loot.moved()


## Mist boiling up off the throat and spindrift flung from the churn, near enough to see.
func _spray(dt: float, view: Vector3) -> void:
	_fx_t += dt
	if _fx_t < 0.05:
		return
	var step := _fx_t
	_fx_t = 0.0
	for m in maelstroms:
		var v: Vortex = m.v
		if v.k <= 0.05 or Vector2(view.x - v.x, view.z - v.z).length() > 460.0:
			continue
		var n := (1 if randf() < step * 14.0 * v.k else 0) + (1 if randf() < step * 10.0 else 0)
		for i in n:
			var a := randf() * TAU
			var rr := v.r * (0.09 + randf() * 0.07)
			var x := v.x + cos(a) * rr
			var z := v.z + sin(a) * rr
			var y := world.water_height(x, z) + 0.3
			# tangent to the turn
			var tx := -sin(a) * v.dir
			var tz := cos(a) * v.dir
			var sp := v.k * SWIRL * 0.75
			if i == 0:
				world.fx.emit(Vector3(x, y, z), Vector3(tx * sp * 0.6, 1.4 + randf() * 1.6, tz * sp * 0.6), 2.4 + randf() * 1.4, 2.4, 8.0 + randf() * 5.0,
						Color(1.2, 1.26, 1.3, 0.2), Color(1.1, 1.14, 1.18, 0.0), -0.2, 0.5, Particles.SMOKE, 0.25, Vector2.ZERO, randf_range(-0.4, 0.4))
			else:
				world.fx.emit(Vector3(x, y, z), Vector3(tx * sp + cos(a) * 1.5, 2.5 + randf() * 3.0, tz * sp + sin(a) * 1.5), 0.7 + randf() * 0.4, 0.5, 1.4,
						Color(1.3, 1.36, 1.4, 0.6), Color(1.3, 1.36, 1.4, 0.0), 11.0, 0.9, Particles.SOFT, 0.02)


## The roar of the nearest maelstrom, from where the voyage is heard:
## Vector3(how loud 0..~1.2, pan, how near its eye 0..1).
func roar() -> Vector3:
	var best := 0.0
	var pan := 0.0
	var near := 0.0
	var l := world.listener
	for m in maelstroms:
		var v: Vortex = m.v
		if v.k <= 0.05:
			continue
		var dx := v.x - l.x
		var dz := v.z - l.z
		var d := Vector2(dx, dz).length()
		var vol := pow(clampf(1.0 - (d - v.r * 0.4) / (v.r * 3.6), 0.0, 1.0), 1.6) * minf(1.2, v.k)
		if vol > best:
			best = vol
			pan = dx / maxf(d, v.r * 0.6)
			near = clampf(1.0 - d / v.r, 0.0, 1.0)
	return Vector3(best, pan, near)


## Hands the maelstroms to the shaders (a global slot each).
func sync() -> void:
	for i in Vortex.N:
		var p := Vector4(0.0, 0.0, 1.0, 0.0)
		if i < maelstroms.size():
			p = (maelstroms[i].v as Vortex).packed()
		RenderingServer.global_shader_parameter_set("vortex_%d" % i, p)
