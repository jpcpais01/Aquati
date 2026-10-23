class_name Collisions
extends RefCounted
## Hull-to-hull contact. Each hull is a capsule along her keel (a fair fit
## for a waterline long, narrow and rounded at both ends), so a ship glancing
## off another's quarter slides along her side and swings, while a bow driven
## square into a beam stops dead and staves her in. One impulse at the
## touching point resolves each contact: the heavier hull barely moves, the
## lighter is shoved aside and spun; its along-keel part changes her way, the
## sideways part goes into her drift (which the keel soon soaks up) and its
## lever arm into her yaw. The web game's ShipCollisions.

const RESTITUTION := 0.22
## Closing speed (m/s) before timbers break.
const RAM_MIN := 1.3
const COOLDOWN := 0.7
## A hull carrying at least this share of the closing speed was driving into
## the other (a ram); less, she was struck.
const FAULT := 0.3

## When each pair last struck (key: the two ships' instance ids).
var _last := {}
# _closest's answers: the nearest points on the two keels, and how far along each (-1..1)
var _ca := Vector2.ZERO
var _cb := Vector2.ZERO
var _ta := 0.0
var _tb := 0.0


func resolve(world: World) -> void:
	var ships := world.ships
	for i in ships.size():
		var a := ships[i]
		# wrecks settle below passing keels
		if a.removed or (not a.alive and a.sink_t > 3.0):
			continue
		for j in range(i + 1, ships.size()):
			var b := ships[j]
			if b.removed or (not b.alive and b.sink_t > 3.0):
				continue
			var reach := (a.cls.length + b.cls.length) * 0.5
			if Vector2(b.pos.x - a.pos.x, b.pos.z - a.pos.z).length_squared() > reach * reach:
				continue
			_pair(a, b, world)
	if _last.size() > 64:
		for k: int in _last.keys():
			if world.time - float(_last[k]) > 5.0:
				_last.erase(k)


static func _radius(s: Ship) -> float:
	return s.cls.beam * 0.47


static func _half(s: Ship) -> float:
	return maxf(0.5, s.cls.length * 0.45 - _radius(s))


static func _inertia(s: Ship) -> float:
	return s.cls.mass * (s.cls.length * s.cls.length + s.cls.beam * s.cls.beam) / 12.0


## The closest points between the two keel segments.
func _closest(a: Ship, b: Ship) -> void:
	var fa := Vector2(sin(a.heading), cos(a.heading))
	var fb := Vector2(sin(b.heading), cos(b.heading))
	var ha := _half(a)
	var hb := _half(b)
	var r := Vector2(a.pos.x - b.pos.x, a.pos.z - b.pos.z)
	var d := fa.dot(fb)
	var e := fa.dot(r)
	var f := fb.dot(r)
	var den := 1.0 - d * d
	var s := clampf((d * f - e) / den, -ha, ha) if den > 1e-5 else 0.0
	var u := clampf(d * s + f, -hb, hb)
	s = clampf(d * u - e, -ha, ha)
	u = clampf(d * s + f, -hb, hb)
	_ca = Vector2(a.pos.x, a.pos.z) + fa * s
	_cb = Vector2(b.pos.x, b.pos.z) + fb * u
	_ta = s / ha
	_tb = u / hb


func _pair(a: Ship, b: Ship, world: World) -> void:
	_closest(a, b)
	var ra := _radius(a)
	var n := _cb - _ca
	var d := n.length()
	var min_d := ra + _radius(b)
	if d >= min_d:
		return
	if d < 1e-4:
		n = Vector2(b.pos.x - a.pos.x, b.pos.z - a.pos.z)
		d = n.length()
		if d < 1e-4:
			n = Vector2(1.0, 0.0)
			d = 1.0
	n /= d
	# the contact on the seam, and each hull's lever arm to it
	var p := _ca + n * ra
	var r_a := p - Vector2(a.pos.x, a.pos.z)
	var r_b := p - Vector2(b.pos.x, b.pos.z)
	var ia := 1.0 / a.cls.mass
	var ib := 1.0 / b.cls.mass
	var ja := _inertia(a)
	var jb := _inertia(b)

	# push apart by inverse mass, so the heavier hull holds her ground
	var corr := minf(min_d - d, 1.5) / (ia + ib)
	a.pos.x -= n.x * corr * ia
	a.pos.z -= n.y * corr * ia
	b.pos.x += n.x * corr * ib
	b.pos.z += n.y * corr * ib

	# relative velocity at the contact (point velocity = v + w * (r.z, -r.x))
	var va := Vector2(a.vel.x + a.ang_vel * r_a.y, a.vel.z - a.ang_vel * r_a.x)
	var vb := Vector2(b.vel.x + b.ang_vel * r_b.y, b.vel.z - b.ang_vel * r_b.x)
	var vn := (vb - va).dot(n)
	if vn >= 0.0:
		return
	var arm_a := r_a.y * n.x - r_a.x * n.y
	var arm_b := r_b.y * n.x - r_b.x * n.y
	var jn := -(1.0 + RESTITUTION) * vn / (ia + ib + arm_a * arm_a / ja + arm_b * arm_b / jb)
	# and a little friction along the seam, so a glancing blow drags and swings her
	var t := Vector2(-n.y, n.x)
	var vt := (vb - va).dot(t)
	var t_arm_a := r_a.y * t.x - r_a.x * t.y
	var t_arm_b := r_b.y * t.x - r_b.x * t.y
	var jt := clampf(-vt / (ia + ib + t_arm_a * t_arm_a / ja + t_arm_b * t_arm_b / jb), -jn * 0.3, jn * 0.3)
	var j := n * jn + t * jt
	_impulse(a, -j * ia, -(r_a.y * j.x - r_a.x * j.y) / ja)
	_impulse(b, j * ib, (r_b.y * j.x - r_b.x * j.y) / jb)

	var closing := -vn
	# heel away from the blow: struck high on the side, the rail goes over
	var pa := a.port_dir()
	a.kick_roll((n.x * pa.x + n.y * pa.z) * closing * 0.012 / a.cls.mass)
	var pb := b.port_dir()
	b.kick_roll(-(n.x * pb.x + n.y * pb.z) * closing * 0.012 / b.cls.mass)

	var key := mini(a.get_instance_id(), b.get_instance_id()) ^ (maxi(a.get_instance_id(), b.get_instance_id()) << 1)
	var since := world.time - float(_last.get(key, -100.0))
	if closing < RAM_MIN:
		# a slow grind along each other's sides: foam squeezed up the seam, a creak now and then
		if since > 0.45 and absf(vt) > 1.2:
			_last[key] = world.time
			world.wake.stamp(p.x, p.y, 2.5, 0.6)
			if world.sound != null:
				var h := world.heard(Vector3(p.x, 0.0, p.y))
				world.sound.crunch(h.x * 0.5, h.y, h.z, 0.05)
		return
	if since < COOLDOWN:
		return
	_last[key] = world.time
	# who drove into whom: each hull's own way along the line between them (a
	# ship lying still is rammed, she doesn't ram; head on, it's both their doing)
	var ca := va.dot(n)
	var cb := -vb.dot(n)
	_impact(a, b, p, n, closing, world, ca > closing * FAULT and ca > RAM_MIN * 0.5, cb > closing * FAULT and cb > RAM_MIN * 0.5)


## Timbers breaking: `a_rams` / `b_rams` that hull drove into the other, so
## the blow she deals is hers.
func _impact(a: Ship, b: Ship, p: Vector2, n: Vector2, closing: float, world: World, a_rams: bool, b_rams: bool) -> void:
	var force := clampf((closing - RAM_MIN) / 11.0, 0.0, 1.0)
	# the bow is built to take a blow; a beam or quarter is not
	var bow_a := _ta > 0.55 and sin(a.heading) * n.x + cos(a.heading) * n.y > 0.45
	var bow_b := _tb > 0.55 and -(sin(b.heading) * n.x + cos(b.heading) * n.y) > 0.45
	var ma := a.cls.mass
	var mb := b.cls.mass
	var base := closing * closing * 0.55
	var same := a.team == b.team
	var scale := 0.35 if same else 1.0
	var dmg_a := minf(base * (2.0 * mb / (ma + mb)) * (0.45 if bow_a else 1.0) * (1.25 if bow_b else 1.0) * scale, a.max_hp * 0.5)
	var dmg_b := minf(base * (2.0 * ma / (ma + mb)) * (0.45 if bow_b else 1.0) * (1.25 if bow_a else 1.0) * scale, b.max_hp * 0.5)
	var y := world.water_height(p.x, p.y)
	var at := Vector3(p.x, y + 1.0 + minf(a.cls.draft, b.cls.draft) * 0.4, p.y)
	# a pirate sailing into your side is her doing, not yours
	if dmg_a > 1.0:
		var dealt := a.damage(dmg_a, null if same or not b_rams else b, at, true, "rammed")
		world.hit.emit(a, b, dealt, at)
	if dmg_b > 1.0:
		var dealt := b.damage(dmg_b, null if same or not a_rams else a, at, true, "rammed")
		world.hit.emit(b, a, dealt, at)
	# splinters bursting out of both hulls, water flung up between them
	world.fx.wood_hit(at, Vector3(-n.x, 0.0, -n.y))
	if force > 0.35:
		world.fx.wood_hit(at, Vector3(n.x, 0.0, n.y))
	world.fx.splash(Vector3(p.x, y, p.y), 0.55 + force * 0.85)
	world.wake.stamp(p.x, p.y, 3.0 + force * 5.0, 1.0, true)
	world.wake.stamp(p.x, p.y, 2.0 + force * 2.0, 1.2)
	world.wake.push(p.x, p.y, 2.5 + force * 3.0, 0.35 + force * 0.6)
	var h := world.heard(Vector3(p.x, 0.0, p.y))
	if world.sound != null:
		world.sound.crunch(h.x, h.y, h.z, force)
		world.sound.hit(h.x * (0.4 + force * 0.6), h.y, h.z)
		if force > 0.3:
			world.sound.splash(h.x * 0.6, h.y, h.z)
	var mine := a.team == Ship.Team.PLAYER or b.team == Ship.Team.PLAYER
	world.shook.emit(0.3 + force * 0.9 if mine else 0.25 * h.x * force)


static func _impulse(s: Ship, dv: Vector2, dw: float) -> void:
	var f := Vector2(sin(s.heading), cos(s.heading))
	var along := dv.dot(f)
	s.speed += along
	s.drift += dv - f * along
	s.ang_vel = clampf(s.ang_vel + dw, -1.6, 1.6)
