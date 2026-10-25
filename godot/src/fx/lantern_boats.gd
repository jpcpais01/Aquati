class_name LanternBoats
extends Node3D
## Paper-lantern boats (the web game's fx/lanternBoats.ts): on a feast night
## the townsfolk set little folded boats on the water, each with a candle
## burning in a paper lantern, and the tide and the breeze carry them out to
## sea in a long, spreading trail of lights. Each rides the swell on its own,
## turns slowly as it goes, is shouldered aside by any hull that sails
## through them, and gutters out after a few minutes. One multimesh draws
## them all; a second lays a soft pool of candlelight on the water round each.

const CAP := 72


class Boat:
	var x := 0.0
	var z := 0.0
	var vx := 0.0
	var vz := 0.0
	## The way the tide sets, out from the quay.
	var ox := 0.0
	var oz := 0.0
	var yaw := 0.0
	var spin := 0.0
	var age := 0.0
	var life := 0.0
	var seed := 0.0
	var tint := Color.WHITE


var boats: Array[Boat] = []
var _mesh := MultiMeshInstance3D.new()
var _pools := MultiMeshInstance3D.new()


func _init() -> void:
	name = "LanternBoats"
	for mi: MultiMeshInstance3D in [_mesh, _pools]:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = boat_mesh() if mi == _mesh else _pool_mesh()
		mm.instance_count = CAP
		mm.visible_instance_count = 0
		mi.multimesh = mm
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		# they wander far from where the multimesh was made
		mi.custom_aabb = AABB(Vector3(-1e5, -50.0, -1e5), Vector3(2e5, 100.0, 2e5))
		add_child(mi)
	var m := ShaderMaterial.new()
	m.shader = preload("res://shaders/lantern_boat.gdshader")
	_mesh.material_override = m
	var pm := ShaderMaterial.new()
	pm.shader = preload("res://shaders/lantern_pool.gdshader")
	_pools.material_override = pm
	_mesh.name = "Boats"
	_pools.name = "Pools"


func count() -> int:
	return boats.size()


func full() -> bool:
	return boats.size() >= CAP


## Sets one on the water at (x, z), to drift out along (ox, oz), its
## lantern glowing `tint` (linear).
func launch(x: float, z: float, ox: float, oz: float, tint: Color) -> void:
	if full():
		return
	var b := Boat.new()
	var sp := 0.12 + randf() * 0.1
	b.x = x
	b.z = z
	b.vx = ox * sp
	b.vz = oz * sp
	b.ox = ox
	b.oz = oz
	b.yaw = randf() * TAU
	b.spin = (randf() - 0.5) * 0.3
	b.life = 150.0 + randf() * 110.0
	b.seed = randf() * 100.0
	b.tint = tint
	boats.append(b)


func clear() -> void:
	boats.clear()
	_mesh.multimesh.visible_instance_count = 0
	_pools.multimesh.visible_instance_count = 0


func update(dt: float, world: World, pushers: Array[Ship]) -> void:
	var bs := boats
	for i in range(bs.size() - 1, -1, -1):
		var b := bs[i]
		b.age += dt
		if b.age > b.life:
			bs[i] = bs[bs.size() - 1]
			bs.pop_back()
	var mm := _mesh.multimesh
	var pm := _pools.multimesh
	mm.visible_instance_count = bs.size()
	pm.visible_instance_count = bs.size()
	if bs.is_empty():
		return
	var wind := world.wind
	var k := 1.0 - exp(-0.6 * dt)
	for i in bs.size():
		var b := bs[i]
		# the ebb draws them out, the breeze leans on them, each wanders a little its own way
		var wander := sin(b.age * 0.11 + b.seed) * 0.09
		var tx := b.ox * 0.3 + wind.dir_x * 0.1 * wind.strength - b.oz * wander
		var tz := b.oz * 0.3 + wind.dir_z * 0.1 * wind.strength + b.ox * wander
		b.vx += (tx - b.vx) * k
		b.vz += (tz - b.vz) * k
		# shouldered aside by any hull sailing through them, and dragged along in her wash
		for s in pushers:
			var dx := b.x - s.pos.x
			var dz := b.z - s.pos.z
			var half := s.cls.length * 0.5 + 1.0
			if dx * dx + dz * dz > half * half:
				continue
			var fx := sin(s.heading)
			var fz := cos(s.heading)
			var lz := dx * fx + dz * fz
			var lx := dx * fz - dz * fx
			var u := minf(1.0, absf(lz) / half)
			var hb := (s.cls.beam * 0.5 + 0.7) * sqrt(1.0 - u * u)
			if absf(lx) >= hb:
				continue
			var side := -1.0 if lx < 0.0 else 1.0
			var push := hb - absf(lx)
			b.x += fz * side * push
			b.z += -fx * side * push
			var pk := minf(1.0, push)
			b.vx += (fz * side * 0.8 + fx * s.speed * 0.3) * pk
			b.vz += (-fx * side * 0.8 + fz * s.speed * 0.3) * pk
			b.spin += side * 0.4 * pk
		b.spin *= 1.0 - minf(1.0, dt * 0.08)
		b.x += b.vx * dt
		b.z += b.vz * dt
		b.yaw += b.spin * dt
		# riding the swell: pitched along her length, rolled across it
		var y := world.water_height(b.x, b.z)
		var hx := world.water_height(b.x + 0.35, b.z) - y
		var hz := world.water_height(b.x, b.z + 0.35) - y
		var cy := cos(b.yaw)
		var sy := sin(b.yaw)
		var along := hx * sy + hz * cy
		var across := hx * cy - hz * sy
		var basis := Basis.from_euler(Vector3(-atan2(along, 0.35), b.yaw, atan2(across, 0.35)), EULER_ORDER_YXZ)
		mm.set_instance_transform(i, Transform3D(basis, Vector3(b.x, y - 0.015, b.z)))
		pm.set_instance_transform(i, Transform3D(Basis.from_scale(Vector3(2.6, 1.0, 2.6)), Vector3(b.x, y + 0.06, b.z)))
		# lit as it's set down, and guttering out at the end
		var fade := minf(1.0, b.age / 0.8)
		var left := b.life - b.age
		var gutter := maxf(0.0, left / 12.0) * (0.6 + 0.4 * absf(sin(b.age * 9.0 + b.seed))) if left < 12.0 else 1.0
		var w := fade * gutter
		var c := b.tint
		mm.set_instance_color(i, Color(c.r, c.g, c.b, w))
		pm.set_instance_color(i, Color(c.r * 0.6 + 0.4, c.g * 0.6 + 0.25, c.b * 0.6 + 0.1, w))


## A little paper boat with a square paper lantern standing amidships; UV.x
## how it glows: 0 dark, 0.18 the folded hull catching the candle, 1 the
## lantern's paper.
static func boat_mesh() -> ArrayMesh:
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var uv := PackedVector2Array()
	var tri := func(a: Vector3, b: Vector3, c: Vector3, glow: float) -> void:
		var n := (c - a).cross(b - a).normalized()
		for p in [a, b, c]:
			pos.append(p)
			nor.append(n)
			uv.append(Vector2(glow, 0.0))
	var quad := func(a: Vector3, b: Vector3, c: Vector3, d: Vector3, glow: float) -> void:
		tri.call(a, b, c, glow)
		tri.call(a, c, d, glow)
	# the hull: folded in at the keel, its ends drawn up to points
	var zs := [-1.0, 0.0, 1.0]
	var top: Array[Vector3] = []
	var bot: Array[Vector3] = []
	for s: float in zs:
		var tz := 0.27 * s
		var ty := 0.12 if s != 0.0 else 0.08
		top.append_array([Vector3(-0.12, ty, tz), Vector3(0.12, ty, tz)])
		bot.append_array([Vector3(-0.066, -0.02, 0.135 * s), Vector3(0.066, -0.02, 0.135 * s)])
	for j in 2:
		var a := j * 2
		var b := a + 2
		# port and starboard sides, the deck and the keel
		quad.call(top[a], top[b], bot[b], bot[a], 0.18)
		quad.call(top[a + 1], bot[a + 1], bot[b + 1], top[b + 1], 0.18)
		quad.call(top[a], top[a + 1], top[b + 1], top[b], 0.18)
		quad.call(bot[a], bot[b], bot[b + 1], bot[a + 1], 0.18)
	quad.call(top[0], bot[0], bot[1], top[1], 0.18)
	quad.call(top[4], top[5], bot[5], bot[4], 0.18)
	# the lantern's four paper walls, and its dark cap
	for i in 4:
		var a0 := PI * 0.25 + i * PI * 0.5
		var a1 := a0 + PI * 0.5
		var lo0 := Vector3(sin(a0) * 0.085, 0.12, cos(a0) * 0.085)
		var lo1 := Vector3(sin(a1) * 0.085, 0.12, cos(a1) * 0.085)
		var hi0 := Vector3(sin(a0) * 0.075, 0.29, cos(a0) * 0.075)
		var hi1 := Vector3(sin(a1) * 0.075, 0.29, cos(a1) * 0.075)
		quad.call(lo0, hi0, hi1, lo1, 1.0)
		var c0 := Vector3(sin(a0) * 0.105, 0.29, cos(a0) * 0.105)
		var c1 := Vector3(sin(a1) * 0.105, 0.29, cos(a1) * 0.105)
		tri.call(c0, Vector3(0.0, 0.36, 0.0), c1, 0.0)
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	arr[Mesh.ARRAY_NORMAL] = nor
	arr[Mesh.ARRAY_TEX_UV] = uv
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return mesh


static func _pool_mesh() -> ArrayMesh:
	var q := PlaneMesh.new()
	q.size = Vector2(1.0, 1.0)
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, q.get_mesh_arrays())
	return mesh
