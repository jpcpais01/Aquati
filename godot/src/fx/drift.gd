class_name Drift
extends Node3D
## What the open sea carries (the web game's game/drift.ts): messages in
## bottles bobbing along with a glint of sun on the glass, and mats of
## flotsam far from any shore: a raft of sun-bleached driftwood, or a golden
## tangle of kelp with its floats. Crabs ride them (scuttling sideways about
## the logs, claws up at a passing ship, plopping off the edge when a hull
## comes too close), and now and then a crate has fetched up in the weed. All
## of it drifts downwind as fast as the barrels and chests (Loot.WINDAGE), so
## a crate keeps to its mat. A handful of each at most: placed here every
## frame, a multimesh for each shape.

## A crate has fetched up in a fresh mat (put a barrel or chest there).
signal crate(x: float, z: float, kelp: bool)
## A gull should come and stand on `spot` (it moves with its flotsam)...
signal rider(spot: Spot)
## ...and that spot's flotsam is gone.
signal rider_gone(spot: Spot)

const BOTTLE_MAX := 3
const MAT_MAX := 4
const CRAB_MAX := 18
## Drift with the wind, as fast as the floating salvage (m/s).
const DRIFT := 0.25
## The stuff each part is made of (MeshKit kinds, read by drift.gdshader).
const WOOD := MeshKit.WOOD
const SHELL := MeshKit.ROPE
const GLASS := MeshKit.IRON
const SUN := MeshKit.GLOW


class Shape:
	var mesh: ArrayMesh
	var radius := 0.0
	## Where crabs walk: log tops [ax, az, bx, bz, y] (driftwood), or none
	## (kelp: anywhere on the weed).
	var logs: Array = []
	var kelp := false
	## Where a gull can stand (mat-local), the best spot first.
	var perch: Array[Vector3] = []


## A gull's footing on a mat, carried round with it (world space).
class Spot:
	var at := Vector3.ZERO


class Bottle:
	var x := 0.0
	var z := 0.0
	var phase := 0.0
	var age := 0.0
	var life := 260.0
	var sparkle := 0.0


class Crab:
	## Mat-local, and where it's scuttling to.
	var x := 0.0
	var z := 0.0
	var y := 0.0
	var tx := 0.0
	var tz := 0.0
	var ty := 0.0
	var face := 0.0
	var wait := 0.0
	var claws := 0.0
	var wave := 0.0
	## Over the side: falling (world space), then gone.
	var off := false
	var w := Vector3.ZERO
	var vy := 0.0
	var seed := 0.0


class Mat:
	var shape := 0
	var x := 0.0
	var z := 0.0
	var vx := 0.0
	var vz := 0.0
	var yaw := 0.0
	var spin := 0.0
	var age := 0.0
	var life := 0.0
	var sink := 0.0
	var quat := Quaternion.IDENTITY
	var y := 0.0
	var crabs: Array[Crab] = []
	var scared := false
	var spots: Array[Spot] = []

	func xf() -> Transform3D:
		return Transform3D(Basis(quat), Vector3(x, y, z))


var bottles: Array[Bottle] = []
var mats: Array[Mat] = []
var shapes: Array[Shape] = []
var _mat_mm: Array[MultiMesh] = []
var _bottle_mm: MultiMesh
var _crab_mm: MultiMesh
var _claw_mm: MultiMesh
var _bottle_t := 0.0
var _mat_t := 0.0


func _init() -> void:
	name = "Drift"
	var m := ShaderMaterial.new()
	m.shader = preload("res://shaders/drift.gdshader")
	shapes = [driftwood(11), driftwood(57), kelp_mat(23), kelp_mat(91)]
	for s in shapes:
		_mat_mm.append(_make(s.mesh, m, MAT_MAX, "Mat"))
	_bottle_mm = _make(bottle_mesh(), m, BOTTLE_MAX, "Bottles")
	_crab_mm = _make(crab_mesh(), m, CRAB_MAX, "Crabs")
	_claw_mm = _make(claw_mesh(), m, CRAB_MAX * 2, "Claws")
	_reset_clocks()


func _make(mesh: Mesh, m: Material, cap: int, nm: String) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = cap
	mm.visible_instance_count = 0
	var mi := MultiMeshInstance3D.new()
	mi.name = nm
	mi.multimesh = mm
	mi.material_override = m
	# they wander far from where the multimesh was made
	mi.custom_aabb = AABB(Vector3(-1e5, -50.0, -1e5), Vector3(2e5, 100.0, 2e5))
	# low on the water, their shadows barely show
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mm


func _reset_clocks() -> void:
	_bottle_t = randf_range(35.0, 60.0)
	_mat_t = randf_range(18.0, 32.0)


## Every bottle bobbing about.
func count() -> int:
	return bottles.size()


func crab_count() -> int:
	var n := 0
	for m in mats:
		n += m.crabs.size()
	return n


## Puts a bottle on the water (also to test: --bottle).
func drop_bottle(x: float, z: float) -> void:
	if bottles.size() >= BOTTLE_MAX:
		bottles.pop_front()
	var b := Bottle.new()
	b.x = x
	b.z = z
	b.phase = randf() * 10.0
	bottles.append(b)


## Sets a mat of flotsam adrift here: `kind` 0 driftwood, 1 kelp (-1 either),
## with `birds` gulls loafing on it (-1: as chance has it).
func drop_mat(x: float, z: float, kind: int = -1, birds: int = -1) -> void:
	if mats.size() >= MAT_MAX:
		_gone(mats.pop_front())
	var k := kind if kind >= 0 else randi() % 2
	var m := Mat.new()
	m.shape = k * 2 + randi() % 2
	var s := shapes[m.shape]
	m.x = x
	m.z = z
	m.yaw = randf() * TAU
	m.spin = (randf() - 0.5) * 0.02
	m.life = randf_range(300.0, 360.0)
	m.quat = Quaternion(Vector3.UP, m.yaw)
	var n := 1 + randi() % 3 if s.kelp else 2 + randi() % 3
	for i in n:
		var c := Crab.new()
		c.face = randf() * TAU
		c.wait = randf() * 3.0
		c.seed = randf() * 100.0
		_pick_spot(s, c)
		c.x = c.tx
		c.z = c.tz
		c.y = c.ty
		m.crabs.append(c)
	mats.append(m)
	# a gull or two loafing on top
	if birds < 0:
		birds = (2 if randf() < 0.3 else 1) if randf() < 0.7 else 0
	for i in mini(birds, s.perch.size()):
		var sp := Spot.new()
		sp.at = m.xf() * s.perch[i]
		m.spots.append(sp)
	for sp in m.spots:
		rider.emit(sp)
	if randf() < 0.38:
		# a crate caught up in it (in the weed's heart, or bumping along beside the logs)
		var a := randf() * TAU
		var r := 0.3 if s.kelp else s.radius * 0.55
		crate.emit(x + cos(a) * r, z + sin(a) * r, s.kelp)


func _pick_spot(s: Shape, c: Crab) -> void:
	if not s.logs.is_empty():
		var l: Array = s.logs.pick_random()
		var t := randf_range(0.1, 0.9)
		c.tx = lerpf(l[0], l[2], t)
		c.tz = lerpf(l[1], l[3], t)
		c.ty = float(l[4]) - 0.02
	else:
		var a := randf() * TAU
		var d := sqrt(randf()) * s.radius * 0.5
		c.tx = cos(a) * d
		c.tz = sin(a) * d
		c.ty = 0.07


## Somewhere ahead of her bows, in open water well clear of any land.
func _find_open(world: World, s: Ship, d0: float, d1: float) -> Variant:
	for k in 8:
		var a := s.heading + (randf() - 0.5) * 1.5
		var d := randf_range(d0, d1)
		var x := s.pos.x + sin(a) * d
		var z := s.pos.z + cos(a) * d
		if world.ground_height(x, z) > -9.0:
			continue
		var ok := true
		for j in 4:
			var b := j * TAU / 4.0
			if world.ground_height(x + cos(b) * 28.0, z + sin(b) * 28.0) > -5.0:
				ok = false
				break
		if ok:
			return Vector2(x, z)
	return null


## A frame of the drift. `collector` (or null) and `radius` work like the
## salvage's magnet; `ship` (or null: nothing new turns up) is whose waters
## fill with flotsam, more of it out on the high seas. The bottles swept up.
func update(dt: float, world: World, collector: Variant, radius: float, ships: Array[Ship], ship: Ship, high_seas: bool) -> Array[Bottle]:
	var got: Array[Bottle] = []
	if dt <= 0.0:
		_upload(world)
		return got
	if ship != null and ship.alive:
		_bottle_t -= dt
		if _bottle_t < 0.0:
			_bottle_t = randf_range(45.0, 80.0) if high_seas else randf_range(75.0, 130.0)
			var at: Variant = _find_open(world, ship, 110.0, 190.0) if bottles.size() < 2 else null
			if at != null:
				drop_bottle(at.x, at.y)
		_mat_t -= dt
		if _mat_t < 0.0:
			_mat_t = randf_range(32.0, 60.0) if high_seas else randf_range(50.0, 90.0)
			var at: Variant = _find_open(world, ship, 150.0, 260.0) if mats.size() < 3 else null
			# driftwood far from land, kelp nearer the isles
			if at != null:
				drop_mat(at.x, at.y, 0 if randf() < (0.62 if high_seas else 0.4) else 1)
	var dx := world.wind.dir_x * DRIFT * dt
	var dz := world.wind.dir_z * DRIFT * dt
	var far: Variant = ship.pos if ship != null else collector

	for i in range(bottles.size() - 1, -1, -1):
		var b := bottles[i]
		b.age += dt
		b.x += dx
		b.z += dz
		if collector != null:
			var ox: float = collector.x - b.x
			var oz: float = collector.z - b.z
			var d := sqrt(ox * ox + oz * oz)
			if d < radius * 0.5:
				got.append(b)
				bottles.remove_at(i)
				continue
			elif d < radius:
				var pull := minf(d, (6.0 + 26.0 * (1.0 - d / radius)) * dt)
				b.x += ox / d * pull
				b.z += oz / d * pull
		if b.age > b.life or (far != null and Vector2(far.x - b.x, far.z - b.z).length() > 800.0):
			bottles.remove_at(i)
			continue
		b.sparkle += dt
		if b.sparkle > 0.5:
			b.sparkle = 0.0
			# the sun catching the glass
			world.fx.sparkle(Vector3(b.x, world.water_height(b.x, b.z) + 0.1, b.z), 0.8, Color(1.5, 1.35, 0.95) / 2.2)

	for i in range(mats.size() - 1, -1, -1):
		var m := mats[i]
		var s := shapes[m.shape]
		m.age += dt
		var k := exp(-0.8 * dt)
		m.vx *= k
		m.vz *= k
		# hulls shoulder the flotsam aside
		var near := INF
		for o in ships:
			if not o.alive:
				continue
			var ox := m.x - o.pos.x
			var oz := m.z - o.pos.z
			near = minf(near, sqrt(ox * ox + oz * oz) - o.cls.length * 0.5)
			var fx := sin(o.heading)
			var fz := cos(o.heading)
			var along := ox * fx + oz * fz
			if absf(along) > o.cls.length * 0.5 + s.radius * 0.5:
				continue
			var lx := ox - fx * along
			var lz := oz - fz * along
			var ld := sqrt(lx * lx + lz * lz)
			var reach := o.cls.beam * 0.5 + s.radius * 0.6
			if ld < reach and ld > 1e-3:
				var push := (reach - ld) * 1.2 + absf(o.speed) * 0.25
				m.vx += lx / ld * push * dt * 2.0
				m.vz += lz / ld * push * dt * 2.0
		m.x += dx + m.vx * dt
		m.z += dz + m.vz * dt
		m.yaw += m.spin * dt
		if m.age > m.life:
			m.sink += dt * 0.25
		if m.sink > 1.4 or (far != null and Vector2(far.x - m.x, far.z - m.z).length() > 900.0):
			_gone(m)
			mats.remove_at(i)
			continue
		_place(m, world, dt)
		# a ship coming close sends the crabs over the side
		if not m.scared and near < 24.0:
			m.scared = true
		_crabs(m, s, world, dt)
	_upload(world)
	return got


## Rides the mat on the swell: heaves with the water and tilts to its slope.
func _place(m: Mat, world: World, dt: float) -> void:
	var s := shapes[m.shape]
	var r := s.radius * 0.55
	var h0 := world.water_height(m.x, m.z)
	var hx := world.water_height(m.x + r, m.z)
	var hz := world.water_height(m.x, m.z + r)
	var n := Vector3(-(hx - h0) / r, 1.0, -(hz - h0) / r).normalized()
	var q := Quaternion(Vector3.UP, n) * Quaternion(Vector3.UP, m.yaw)
	m.quat = m.quat.slerp(q, minf(1.0, dt * 4.0))
	m.y += (h0 + (0.07 if s.kelp else -0.2) - m.sink - m.y) * minf(1.0, dt * 6.0)
	if not m.spots.is_empty():
		var x := m.xf()
		for i in m.spots.size():
			m.spots[i].at = x * s.perch[i]


func _gone(m: Mat) -> void:
	for sp in m.spots:
		rider_gone.emit(sp)
	m.spots.clear()


func _crabs(m: Mat, s: Shape, world: World, dt: float) -> void:
	for i in range(m.crabs.size() - 1, -1, -1):
		var c := m.crabs[i]
		if c.off:
			# over the side: a little fall, a plop, gone
			c.vy -= 9.8 * dt
			c.w.y += c.vy * dt
			if c.w.y < world.water_height(c.w.x, c.w.z) - 0.5:
				m.crabs.remove_at(i)
			continue
		if m.scared and c.wait >= 0.0:
			# bolt for the edge away from the ship, and drop off it
			c.wait = -1.0
			var a := atan2(c.z, c.x) + (randf() - 0.5) * 0.6
			c.tx = cos(a) * s.radius * 0.95
			c.tz = sin(a) * s.radius * 0.95
			c.ty = 0.02
		var ox := c.tx - c.x
		var oz := c.tz - c.z
		var d := sqrt(ox * ox + oz * oz)
		if d > 0.04:
			# crabs go sideways: face across the way they're walking
			var step := minf(d, (1.6 if m.scared else 0.45) * dt)
			c.x += ox / d * step
			c.z += oz / d * step
			c.y += (c.ty - c.y) * (1.0 - exp(-6.0 * dt))
			var da := wrapf(atan2(ox, oz) + PI * 0.5 - c.face, -PI, PI)
			# either flank will do
			if absf(da) > PI * 0.5:
				da -= signf(da) * PI
			c.face += da * (1.0 - exp(-8.0 * dt))
			c.claws += (0.15 - c.claws) * (1.0 - exp(-6.0 * dt))
		elif m.scared:
			# off the edge
			c.off = true
			c.w = m.xf() * Vector3(c.x, c.y, c.z)
			c.vy = 1.2
			var at := Vector3(c.w.x, world.water_height(c.w.x, c.w.z), c.w.z)
			world.fx.splash(at, 0.12)
			var h := world.heard(at)
			if h.x > 0.4 and world.sound != null:
				world.sound.splash(h.x * 0.05, h.y, h.z)
		else:
			c.wait -= dt
			# claws up and waving now and then: at the gulls, at the sky, at you
			c.wave = maxf(0.0, c.wave - dt)
			if c.wave <= 0.0 and randf() < dt * 0.15:
				c.wave = 1.6 + randf()
			c.claws += ((1.0 if c.wave > 0.0 else 0.0) - c.claws) * (1.0 - exp(-5.0 * dt))
			if c.wait < 0.0:
				c.wait = 1.5 + randf() * 5.0
				_pick_spot(s, c)


func _upload(world: World) -> void:
	var n := [0, 0, 0, 0]
	var nc := 0
	var nk := 0
	var t := world.time
	for m in mats:
		var mx := m.xf()
		_mat_mm[m.shape].set_instance_transform(n[m.shape], mx)
		n[m.shape] += 1
		for c in m.crabs:
			if nc >= CRAB_MAX:
				break
			var moving := not c.off and Vector2(c.tx - c.x, c.tz - c.z).length() > 0.04
			# a scurry: the body bobs and rocks as the legs patter
			var bob := absf(sin(t * 22.0 + c.seed)) * 0.012 if moving else 0.0
			var rock := sin(t * 22.0 + c.seed) * 0.06 if moving else sin(t * 1.3 + c.seed) * 0.02
			var b := Basis.from_euler(Vector3(0.0, c.face, rock), EULER_ORDER_YXZ)
			var cx: Transform3D
			if c.off:
				cx = Transform3D(Basis(m.quat) * b, c.w)
			else:
				cx = mx * Transform3D(b, Vector3(c.x, c.y + bob, c.z))
			_crab_mm.set_instance_transform(nc, cx)
			nc += 1
			# the claws: raised and snipping when it waves, tucked in front as it walks
			var up := c.claws
			for side: float in [-1.0, 1.0]:
				var snip := sin(t * 9.0 + c.seed + side) * 0.25 * up if up > 0.5 else 0.0
				var kb := Basis.from_euler(Vector3(-0.2 - up + snip, side * (0.45 - up * 0.15), side * up * 0.3), EULER_ORDER_YXZ)
				_claw_mm.set_instance_transform(nk, cx * Transform3D(kb, Vector3(side * 0.11, 0.12, 0.13)))
				nk += 1
	for k in 4:
		_mat_mm[k].visible_instance_count = n[k]
	var nb := 0
	for b in bottles:
		# lying on its side, neck cocked up, rolling and nodding on the swell
		var y := world.water_height(b.x, b.z)
		var fade := minf(minf(1.0, b.age * 1.2), maxf(0.0, (b.life - b.age) / 3.0))
		var bs := Basis.from_euler(Vector3(sin(t * 1.7 + b.phase) * 0.35, b.phase + t * 0.05, 0.18 + sin(t * 1.2 + b.phase) * 0.12), EULER_ORDER_YXZ)
		_bottle_mm.set_instance_transform(nb, Transform3D(bs, Vector3(b.x, y - 0.06 - (1.0 - fade) * 0.6, b.z)))
		nb += 1
	_bottle_mm.visible_instance_count = nb
	_crab_mm.visible_instance_count = nc
	_claw_mm.visible_instance_count = nk


func clear() -> void:
	bottles.clear()
	for m in mats:
		_gone(m)
	mats.clear()
	for mm in _mat_mm:
		mm.visible_instance_count = 0
	for mm in [_bottle_mm, _crab_mm, _claw_mm]:
		(mm as MultiMesh).visible_instance_count = 0
	_reset_clocks()


# ------------------------------------------------------------------ sculpt

static func _hex(h: int) -> Color:
	return Color.hex((h << 8) | 0xff)


## Recolours the vertices from v0 on by f(position) (sRGB), keeping their kind.
static func _shade(kit: MeshKit, v0: int, f: Callable) -> void:
	for i in range(v0, kit.verts.size()):
		var c: Color = f.call(kit.verts[i])
		kit.colors[i] = Color(c.r, c.g, c.b, kit.colors[i].a)


## Moves the vertices from v0 on by xf.
static func _move(kit: MeshKit, v0: int, xf: Transform3D) -> void:
	var nb := xf.basis.inverse().transposed()
	for i in range(v0, kit.verts.size()):
		kit.verts[i] = xf * kit.verts[i]
		kit.normals[i] = (nb * kit.normals[i]).normalized()


## A frond lying on the water: a tapering ribbon along a wavy path, facing up.
static func _ribbon(kit: MeshKit, rng: RandomNumberGenerator, x: float, z: float, yaw: float, length: float, width: float, col: Callable) -> void:
	const N := 8
	var a := yaw
	var px := x
	var pz := z
	var pts: Array[Vector4] = []
	for i in N + 1:
		pts.append(Vector4(px, pz, a, 0.02 + (rng.randf() - 0.35) * 0.05))
		a += (rng.randf() - 0.5) * 0.7
		px += cos(a) * length / N
		pz += sin(a) * length / N
	var v0 := kit.vertex_count()
	var i0 := kit.indices.size()
	for i in N:
		var p0 := pts[i]
		var p1 := pts[i + 1]
		var w0 := width * sin(PI * (0.15 + 0.85 * i / N)) * 0.5 + 0.02
		var w1 := width * sin(PI * (0.15 + 0.85 * (i + 1) / N)) * 0.5 + 0.02
		var l0 := Vector3(p0.x - sin(p0.z) * w0, p0.w, p0.y + cos(p0.z) * w0)
		var r0 := Vector3(p0.x + sin(p0.z) * w0, p0.w, p0.y - cos(p0.z) * w0)
		var l1 := Vector3(p1.x - sin(p1.z) * w1, p1.w, p1.y + cos(p1.z) * w1)
		var r1 := Vector3(p1.x + sin(p1.z) * w1, p1.w, p1.y - cos(p1.z) * w1)
		var c0: Color = col.call(float(i) / N)
		var c1: Color = col.call(float(i + 1) / N)
		var vs := [[l0, c0], [l1, c1], [r0, c0], [r1, c1]]
		var at: Array[int] = []
		for v: Array in vs:
			kit.paint(v[1], WOOD, 0.0)
			at.append(kit.add_vertex(v[0], Vector3.UP))
		# wound so the face looks up
		for tr: Array in [[at[0], at[1], at[2]], [at[2], at[1], at[3]]]:
			var e := (kit.verts[tr[1]] - kit.verts[tr[0]]).cross(kit.verts[tr[2]] - kit.verts[tr[0]])
			if e.y > 0.0:
				kit.tri(tr[0], tr[1], tr[2])
			else:
				kit.tri(tr[0], tr[2], tr[1])
	kit.recompute_normals(v0, i0)


const KELP := [0x5b4a1d, 0x6b5622, 0x4a3d18, 0x7a6428, 0x544a1e]


static func _kelp_colour(rng: RandomNumberGenerator) -> Callable:
	var base := _hex(KELP[rng.randi() % KELP.size()])
	var tip := _hex(0x957a33)
	return func(k: float) -> Color: return base.lerp(tip, maxf(0.0, k - 0.55) * 1.8)


## A raft of sun-bleached logs, crossed and snagged with weed.
static func driftwood(seed_value: int) -> Shape:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var kit := MeshKit.new(seed_value)
	var s := Shape.new()
	var wet := _hex(0x4d4a36)
	var end := _hex(0x6a543c)
	var n := 3 + rng.randi() % 3
	var biggest := 0.0
	for i in n:
		var length := 3.4 + rng.randf() * 3.6
		var r := 0.17 + rng.randf() * 0.17
		var yaw := rng.randf() * PI
		var cx := (rng.randf() - 0.5) * 2.2
		var cz := (rng.randf() - 0.5) * 2.2
		# crossing logs ride up on the ones beneath
		var y := 0.0 if i == 0 else 0.06 + rng.randf() * 0.14
		var bend := (rng.randf() - 0.5) * 0.5
		var ph := rng.randf() * 10.0
		var r_top := r * (0.55 + rng.randf() * 0.15)
		var pale := _hex([0xcdbd9f, 0xbca98a, 0xc4b398, 0xae9c80][rng.randi() % 4])
		var place := Transform3D(Basis(Vector3.UP, yaw), Vector3(cx, y, cz))
		# modelled along y, then laid down (its "up" +x)
		var lay := place * Transform3D(Basis(Vector3(0, 0, 1), PI * 0.5), Vector3.ZERO)
		var v0 := kit.vertex_count()
		var i0 := kit.indices.size()
		const RAD := 13
		const SEG := 7
		for a in RAD + 1:
			var th0 := TAU * (a % RAD) / RAD
			for j in SEG + 1:
				var ly := -length * 0.5 + length * j / SEG
				var rad := lerpf(r, r_top, float(j) / SEG)
				var px := rad * sin(th0)
				var pz := rad * cos(th0)
				var th := atan2(pz, px)
				# gnarled: the girth swells and pinches along the trunk, and it's never quite round
				var sw := 1.0 + 0.14 * sin(ly * 2.3 + ph) + 0.07 * sin(ly * 5.3 + ph * 2.0) + 0.08 * sin(th * 3.0 + ph + ly * 0.7)
				var t := ly / (length * 0.5)
				# sun-bleached on top, dark and weedy where the sea washes it; grain streaks and browner, broken ends
				var top := clampf((cos(th) + 0.25) / 1.1, 0.0, 1.0)
				var grain := 0.88 + 0.12 * sin(th * 9.0 + ly * 1.7 + ph) * sin(ly * 0.9 + th * 2.0)
				var knot := maxf(0.0, sin(ly * 3.1 + ph * 3.0) * sin(th * 2.0 + ph) - 0.8) * 2.5
				var c := wet.lerp(pale, top)
				c = Color(c.r * grain, c.g * grain, c.b * grain)
				kit.paint(c.lerp(end, minf(1.0, knot + maxf(0.0, absf(t) - 0.93) * 14.0)), WOOD, 0.0)
				kit.add_vertex(Vector3(px * sw, ly, pz * sw + bend * (1.0 - t * t)), Vector3.UP)
		kit.grid(v0, RAD + 1, SEG + 1, true)
		kit.recompute_normals(v0, i0)
		kit.paint(end, WOOD, 0.0)
		for e: float in [-1.0, 1.0]:
			kit.disc(Transform3D(Basis(Vector3.RIGHT, -PI * 0.5 * e), Vector3(0.0, length * 0.5 * e, 0.0)), (r if e < 0.0 else r_top) * 0.95, 10)
		_move(kit, v0, lay)
		var dx := cos(yaw) * length * 0.5
		var dz := -sin(yaw) * length * 0.5
		var ty := y + r * 0.85
		s.logs.append([cx - dx * 0.8, cz - dz * 0.8, cx + dx * 0.8, cz + dz * 0.8, ty])
		s.radius = maxf(s.radius, Vector2(cx, cz).length() + length * 0.5)
		if length * r > biggest:
			biggest = length * r
			s.perch.push_front(Vector3(cx + dx * 0.25, ty, cz + dz * 0.25))
		else:
			s.perch.append(Vector3(cx - dx * 0.3, ty, cz - dz * 0.3))
		# a snapped-off branch stub or two reaching up out of the water
		var stubs := int(rng.randf() * 2.6)
		for k in stubs:
			var t := (rng.randf() - 0.5) * 0.7
			var a := Vector3(t * length, r * 0.5, 0.0)
			var b := a + Vector3((rng.randf() - 0.5) * 0.5, 0.25 + rng.randf() * 0.45, (rng.randf() - 0.5) * 0.6)
			var sv := kit.vertex_count()
			kit.spar(a, b, r * 0.3, r * 0.08, 5)
			var hr := r * 1.4
			_shade(kit, sv, func(p: Vector3) -> Color: return wet.lerp(pale, clampf(p.y / hr, 0.0, 1.0)))
			_move(kit, sv, place)
		# the first log still has its root plate: stubby roots splayed out and down into the sea
		if i == 0:
			var o := Vector3(length * 0.5, 0.0, 0.0)
			for k in 5:
				var a := k * TAU / 5.0 + rng.randf() * 0.6
				var rl := 0.5 + rng.randf() * 0.6
				var b := o + Vector3(0.15 + rng.randf() * 0.3, cos(a) * rl * 0.5 - 0.15, sin(a) * rl)
				var sv := kit.vertex_count()
				kit.spar(o, b, 0.06, 0.02, 5)
				_shade(kit, sv, func(p: Vector3) -> Color: return wet.lerp(end, clampf(p.y / 0.3 + 0.5, 0.0, 1.0)))
				_move(kit, sv, place)
	# weed snagged across the logs
	for k in 4:
		var v0 := kit.vertex_count()
		_ribbon(kit, rng, (rng.randf() - 0.5) * 2.0, (rng.randf() - 0.5) * 2.0, rng.randf() * TAU, 1.4 + rng.randf() * 1.6, 0.16, _kelp_colour(rng))
		_move(kit, v0, Transform3D(Basis.IDENTITY, Vector3(0.0, 0.1, 0.0)))
	s.mesh = kit.commit()
	return s


## A golden tangle of kelp: fronds streaming out of a matted heap, its floats,
## its stipes and a stick or two caught up in it.
static func kelp_mat(seed_value: int) -> Shape:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var kit := MeshKit.new(seed_value)
	var s := Shape.new()
	s.kelp = true
	s.radius = 3.4 + rng.randf() * 1.6
	s.perch = [Vector3(0.3, 0.17, -0.2), Vector3(-0.6, 0.12, 0.5)]
	var n := 56 + rng.randi() % 16
	var floats := _hex(0x8a6c28)
	var lit := Color(minf(1.0, floats.r * 1.3), minf(1.0, floats.g * 1.25), minf(1.0, floats.b * 1.1))
	for i in n:
		var a := rng.randf() * TAU
		var d := sqrt(rng.randf()) * s.radius * 0.4
		var x := cos(a) * d
		var z := sin(a) * d
		var inner := rng.randf() < 0.35
		var length := 0.8 + rng.randf() * 1.2 if inner else 1.6 + rng.randf() * 2.4
		# streaming outward from the tangle, with short ones matted every which way across it
		var yaw := rng.randf() * TAU if inner else a + (rng.randf() - 0.5) * 1.8
		_ribbon(kit, rng, x, z, yaw, length, 0.12 + rng.randf() * 0.12, _kelp_colour(rng))
		# a gas bladder or two along the frond
		var nb := int(rng.randf() * 2.4)
		for k in nb:
			var t := 0.15 + rng.randf() * 0.7
			var br := 0.04 + rng.randf() * 0.035
			var v0 := kit.vertex_count()
			kit.paint(floats, WOOD, 0.0)
			kit.sphere(Transform3D(Basis.from_scale(Vector3(1.3, 0.75, 1.0)), Vector3(x + cos(yaw) * length * t, 0.05, z + sin(yaw) * length * t)), br, 6, 4)
			_shade(kit, v0, func(p: Vector3) -> Color: return lit if p.y > 0.06 else floats)
	# the heart of it: a low heap of matted weed
	var v0 := kit.vertex_count()
	var i0 := kit.indices.size()
	kit.paint(_hex(0x6e5a25), WOOD, 0.0)
	kit.sphere(Transform3D.IDENTITY, 1.0, 14, 6, 0.0, TAU, 0.0, PI * 0.5)
	for k in range(v0, kit.vertex_count()):
		var p := kit.verts[k]
		var th := atan2(p.z, p.x)
		var w := 1.0 + 0.25 * sin(th * 3.0 + seed_value) + 0.12 * sin(th * 7.0 + seed_value * 2.0)
		kit.verts[k] = Vector3(p.x * s.radius * 0.27 * w, p.y * 0.12, p.z * s.radius * 0.22 * w)
	kit.recompute_normals(v0, i0)
	_shade(kit, v0, func(p: Vector3) -> Color:
		var f := 0.8 + 0.3 * sin(p.x * 7.1 + p.z * 5.3) * sin(p.x * 3.7 - p.z * 8.9)
		var c := _hex(0x6e5a25 if p.y > 0.07 else 0x56471c)
		return Color(c.r * f, c.g * f, c.b * f))
	# the thick stipes knotted in the middle, and a stick or two caught up in it
	kit.paint(_hex(0x54431a), WOOD, 0.0)
	for k in 6:
		var a := rng.randf() * TAU
		var l := 0.8 + rng.randf() * 1.4
		kit.spar(Vector3(cos(a) * 0.4, 0.09, sin(a) * 0.4), Vector3(cos(a + 2.4) * l, 0.05, sin(a + 2.4) * l), 0.045, 0.03, 5)
	for k in 2:
		var a := rng.randf() * TAU
		var p0 := Vector3(cos(a) * s.radius * 0.3, 0.07, sin(a) * s.radius * 0.3)
		var sv := kit.vertex_count()
		kit.spar(p0, p0 + Vector3(cos(a + 1.7) * 1.3, 0.02, sin(a + 1.7) * 1.3), 0.06, 0.04, 6)
		_shade(kit, sv, func(p: Vector3) -> Color: return _hex(0xb6a688) if p.y > 0.07 else _hex(0x5f5644))
	s.mesh = kit.commit()
	return s


## A shore crab, a touch over life size so it reads from the masthead:
## carapace, eyes on stalks, eight legs.
static func crab_mesh() -> ArrayMesh:
	var kit := MeshKit.new(3)
	var shell := _hex(0xc4482a)
	var belly := _hex(0xe8a978)
	var v0 := kit.vertex_count()
	kit.paint(shell, SHELL, 0.0)
	kit.sphere(Transform3D(Basis.from_scale(Vector3(1.25, 0.42, 0.95)), Vector3(0.0, 0.11, 0.0)), 0.17, 12, 7)
	_shade(kit, v0, func(p: Vector3) -> Color:
		return Color(shell.r * (0.9 + p.z * 0.6), shell.g * (0.9 + p.z * 0.6), shell.b) if p.y > 0.1 else belly)
	for sd: float in [-1.0, 1.0]:
		kit.paint(shell, SHELL, 0.0)
		kit.spar(Vector3(sd * 0.05, 0.15, 0.12), Vector3(sd * 0.065, 0.21, 0.15), 0.012, 0.01, 5)
		for k in 4:
			var z := 0.07 - k * 0.055
			var hip := Vector3(sd * 0.17, 0.1, z)
			var knee := Vector3(sd * 0.31, 0.17, z * 1.35 - 0.01)
			var toe := Vector3(sd * 0.39, 0.0, z * 1.6 - 0.02)
			kit.spar(hip, knee, 0.018, 0.015, 5)
			kit.spar(knee, toe, 0.015, 0.006, 5)
		kit.paint(_hex(0x141110), SHELL, 0.0)
		kit.ball(Vector3(sd * 0.066, 0.215, 0.152), 0.022, 7, 5)
	return kit.commit()


## One claw, from its shoulder at the origin, reaching forward (+z).
static func claw_mesh() -> ArrayMesh:
	var kit := MeshKit.new(4)
	var shell := _hex(0xcf4f2c)
	kit.paint(shell, SHELL, 0.0)
	kit.spar(Vector3.ZERO, Vector3(0.0, 0.03, 0.11), 0.022, 0.02, 6)
	kit.sphere(Transform3D(Basis.from_scale(Vector3(0.75, 0.6, 1.2)), Vector3(0.0, 0.035, 0.15)), 0.05, 9, 6)
	kit.paint(_hex(0x2a1a14), SHELL, 0.0)
	kit.spar(Vector3(0.0, 0.05, 0.19), Vector3(0.0, 0.07, 0.25), 0.016, 0.005, 5)
	kit.spar(Vector3(0.0, 0.025, 0.19), Vector3(0.0, 0.015, 0.245), 0.014, 0.005, 5)
	return kit.commit()


## A turned profile of (radius, y) spun through only part of a turn (three.js
## LatheGeometry's phiStart and phiLength).
static func _lathe_arc(kit: MeshKit, profile: PackedVector2Array, segs: int, start: float, length: float) -> void:
	var m := profile.size()
	var pn := PackedVector2Array()
	pn.resize(m)
	for k in m:
		var d := Vector2.ZERO
		if k > 0:
			var e := profile[k] - profile[k - 1]
			d += Vector2(e.y, -e.x).normalized()
		if k < m - 1:
			var e := profile[k + 1] - profile[k]
			d += Vector2(e.y, -e.x).normalized()
		pn[k] = d.normalized() if d.length() > 1e-6 else Vector2(0, 1)
	var base := kit.vertex_count()
	for i in segs + 1:
		var ph := start + length * i / segs
		var sp := sin(ph)
		var cp := cos(ph)
		for k in m:
			kit.add_vertex(Vector3(profile[k].x * sp, profile[k].y, profile[k].x * cp), Vector3(pn[k].x * sp, pn[k].y, pn[k].x * cp).normalized())
	kit.grid(base, segs + 1, m, true)


## A corked bottle lying on its side, neck along +x, with a rolled letter
## inside. The glass is opaque, so the top of it is left open as a window the
## letter shows through, its edges caught by two bright lines of sun.
static func bottle_mesh() -> ArrayMesh:
	const S := 1.7
	var kit := MeshKit.new(5)
	var glass := _hex(0x2a7563)
	var sky := _hex(0x83c9b4)
	# modelled upright (along y); "up" once it is laid down is -x here
	var tint := func(p: Vector3) -> Color:
		var k := minf(1.0, clampf(-p.x / (0.1 * S), 0.0, 1.0) * 0.8 + (0.2 if p.y > 0.26 * S and p.y < 0.36 * S else 0.0))
		return glass.lerp(sky, k)
	var prof := func(pts: Array) -> PackedVector2Array:
		var out := PackedVector2Array()
		for q: Vector2 in pts:
			out.append(q * S)
		return out
	const W := 0.55
	const UP := PI * 1.5
	kit.paint(glass, GLASS, 0.0)
	var v0 := kit.vertex_count()
	_lathe_arc(kit, prof.call([Vector2(0.0, 0.0), Vector2(0.085, 0.0), Vector2(0.1, 0.012), Vector2(0.102, 0.05)]), 16, 0.0, TAU)
	# the body, open along the top
	_lathe_arc(kit, prof.call([Vector2(0.102, 0.05), Vector2(0.1, 0.25)]), 16, UP + W, TAU - W * 2.0)
	_lathe_arc(kit, prof.call([Vector2(0.1, 0.25), Vector2(0.088, 0.3), Vector2(0.055, 0.34), Vector2(0.038, 0.37), Vector2(0.036, 0.44), Vector2(0.044, 0.45), Vector2(0.042, 0.465)]), 16, 0.0, TAU)
	_shade(kit, v0, tint)
	# the inside of the glass seen through the window
	kit.paint(glass * Color(0.6, 0.6, 0.6), GLASS, 0.0)
	_lathe_arc(kit, prof.call([Vector2(0.094, 0.25), Vector2(0.096, 0.05)]), 16, UP + W, TAU - W * 2.0)
	kit.paint(_hex(0xa98456), WOOD, 0.0)
	kit.spar(Vector3(0.0, 0.45 * S, 0.0), Vector3(0.0, 0.51 * S, 0.0), 0.03 * S, 0.034 * S, 10)
	kit.paint(_hex(0xa3261e), WOOD, 0.0)
	kit.spar(Vector3(0.0, 0.501 * S, 0.0), Vector3(0.0, 0.519 * S, 0.0), 0.046 * S, 0.046 * S, 10)
	kit.paint(_hex(0xcdb88a), WOOD, 0.0)
	kit.hoop(Vector3(0.0, 0.41 * S, 0.0), 0.04 * S, 0.006 * S, 4, 12)
	# the letter: a roll of paper tied with a red thread
	kit.paint(Color(0.86, 0.76, 0.56), WOOD, 0.0)
	kit.spar(Vector3(-0.02 * S, 0.055 * S, 0.0), Vector3(-0.02 * S, 0.245 * S, 0.0), 0.06 * S, 0.06 * S, 12)
	var thread := Vector3(-0.02 * S, 0.14 * S, 0.0)
	kit.paint(_hex(0xa3261e), WOOD, 0.0)
	kit.spar(thread, thread + Vector3(0.0, 0.022 * S, 0.0), 0.0605 * S, 0.0605 * S, 12, false)
	# sun along the window's edges
	kit.paint(Color.WHITE, SUN, 0.0)
	for a: float in [UP + W, UP - W]:
		var at := Vector3(sin(a) * 0.103 * S, 0.0, cos(a) * 0.103 * S)
		kit.spar(at + Vector3(0.0, 0.055 * S, 0.0), at + Vector3(0.0, 0.245 * S, 0.0), 0.005 * S, 0.005 * S, 4)
	_move(kit, 0, Transform3D(Basis(Vector3(0, 0, 1), -PI * 0.5), Vector3.ZERO))
	return kit.commit()
