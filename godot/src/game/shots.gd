class_name Shots
extends Node3D
## Round shot in flight, and the smoke it leaves hanging. A ball is written
## once into a ring the GPU reads (where it left the barrel, how fast and
## when) and flies on there in closed form: its iron, its hot streak and its
## thread of powder smoke drifting off on the breeze all come from that one
## instance (shaders/shots.gdshader, shaders/smoke_trail.gdshader). The CPU
## walks the same arc to find what each ball strikes, plays the splash or the
## splinters, and writes the moment it stopped. Two draws for every ball at sea.

const GRAVITY := 14.0
const CAPACITY := 256
## Floats per ball: a 3x4 transform, a colour and the custom vec4 (see Particles).
const STRIDE := 20
const REBASE := 1024.0
## A ball still flying after this long (s) is forgotten.
const MAX_AGE := 7.0
## Lengths of a ball's thread of smoke, from the oldest wisp to the ball.
const TRAIL_SEGMENTS := 40

var world: World

var _buf := PackedFloat32Array()
var _next := 0
var _now := 0.0
var _dirty := false
var _live: Array[_Ball] = []
var _balls: MultiMesh
var _trails: MultiMesh
var _shot_mat: ShaderMaterial
var _trail_mat: ShaderMaterial


class _Ball:
	var slot := 0
	var p0 := Vector3.ZERO
	var v0 := Vector3.ZERO
	## Launch time on the shots' clock, and how far into its flight the CPU has walked it.
	var born := 0.0
	var t := 0.0
	var owner: Ship
	var damage := 0.0
	## The ship whose canvas it last tore through (once a ship, as it flies on).
	var tore: Ship


func _ready() -> void:
	_buf.resize(CAPACITY * STRIDE)
	var cull := AABB(Vector3(-1e5, -500.0, -1e5), Vector3(2e5, 1000.0, 2e5))
	_shot_mat = ShaderMaterial.new()
	_shot_mat.shader = preload("res://shaders/shots.gdshader")
	_shot_mat.set_shader_parameter("gravity", GRAVITY)
	# the hot streak over its own smoke
	_shot_mat.render_priority = 1
	_trail_mat = ShaderMaterial.new()
	_trail_mat.shader = preload("res://shaders/smoke_trail.gdshader")
	_trail_mat.set_shader_parameter("gravity", GRAVITY)
	_trail_mat.set_shader_parameter("noise_tex", preload("res://art/noise.png"))
	_balls = _ring(_shot_mesh(), cull)
	_trails = _ring(_trail_mesh(), cull)
	for pair: Array in [[_balls, _shot_mat], [_trails, _trail_mat]]:
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = pair[0]
		mi.material_override = pair[1]
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
		add_child(mi)


func _ring(mesh: Mesh, cull: AABB) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = CAPACITY
	# the instance transforms carry launch data, not placements: cull by hand
	mm.custom_aabb = cull
	mm.buffer = _buf
	return mm


## The streak (z 0) and the ball's card (z 1), as two unit quads.
static func _shot_mesh() -> ArrayMesh:
	var v := PackedVector3Array()
	var idx := PackedInt32Array()
	for z: float in [0.0, 1.0]:
		var b := v.size()
		for c: Vector2 in [Vector2(-0.5, -0.5), Vector2(0.5, -0.5), Vector2(0.5, 0.5), Vector2(-0.5, 0.5)]:
			v.append(Vector3(c.x, c.y, z))
		idx.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
	return _mesh(v, idx)


## A strip TRAIL_SEGMENTS long: x -1..1 across, y 0..1 along.
static func _trail_mesh() -> ArrayMesh:
	var v := PackedVector3Array()
	var idx := PackedInt32Array()
	for k in TRAIL_SEGMENTS + 1:
		var u := float(k) / TRAIL_SEGMENTS
		v.append(Vector3(-1.0, u, 0.0))
		v.append(Vector3(1.0, u, 0.0))
	for k in TRAIL_SEGMENTS:
		var a := k * 2
		idx.append_array([a, a + 1, a + 2, a + 1, a + 3, a + 2])
	return _mesh(v, idx)


static func _mesh(v: PackedVector3Array, idx: PackedInt32Array) -> ArrayMesh:
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = v
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return m


## Looses one ball from `pos` at `vel` (m/s, the ship's own way included).
func fire(pos: Vector3, vel: Vector3, owner: Ship, damage: float) -> void:
	var slot := _next
	_next = (_next + 1) % CAPACITY
	# the ring has come round on a ball still flying (a sea full of broadsides): it drops
	for i in _live.size():
		if _live[i].slot == slot:
			_live.remove_at(i)
			break
	var b := _Ball.new()
	b.slot = slot
	b.p0 = pos
	b.v0 = vel
	b.born = _now
	b.owner = owner
	b.damage = damage
	_live.append(b)
	var o := slot * STRIDE
	_buf[o] = vel.x
	_buf[o + 1] = 0.0
	_buf[o + 2] = 0.0
	_buf[o + 3] = pos.x
	_buf[o + 4] = vel.y
	_buf[o + 5] = 0.0
	_buf[o + 6] = 0.0
	_buf[o + 7] = pos.y
	_buf[o + 8] = vel.z
	_buf[o + 9] = 0.0
	_buf[o + 10] = 0.0
	_buf[o + 11] = pos.z
	for k in 4:
		_buf[o + 12 + k] = 1.0
	_buf[o + 16] = _now
	_buf[o + 17] = _now + MAX_AGE + 1.0
	_buf[o + 18] = randf()
	_buf[o + 19] = 0.0
	_dirty = true


## Where a ball is `t` seconds into its flight.
static func at(b: _Ball, t: float) -> Vector3:
	return b.p0 + b.v0 * t + Vector3(0.0, -0.5 * GRAVITY * t * t, 0.0)


func step(dt: float) -> void:
	_now += dt
	if _now > REBASE:
		_rebase()
	for i in range(_live.size() - 1, -1, -1):
		var b := _live[i]
		var t1 := minf(_now - b.born, MAX_AGE)
		var stop := _fly(b, b.t, t1)
		b.t = t1
		if stop >= 0.0 or t1 >= MAX_AGE:
			_buf[b.slot * STRIDE + 17] = b.born + (stop if stop >= 0.0 else t1)
			_dirty = true
			_live.remove_at(i)
	_shot_mat.set_shader_parameter("now", _now)
	_trail_mat.set_shader_parameter("now", _now)
	if _dirty:
		_dirty = false
		_balls.buffer = _buf
		_trails.buffer = _buf


## Walks a ball along its arc from t0 to t1 (s of flight), in steps short
## enough that it can't skip through a hull. Returns when it struck
## something, or -1 while it flies on.
func _fly(b: _Ball, t0: float, t1: float) -> float:
	var span := (t1 - t0) * b.v0.length()
	var n := clampi(ceili(span / 0.7), 1, 16)
	for k in n:
		var t := lerpf(t0, t1, float(k + 1) / n)
		var p := at(b, t)
		if _strike_ship(b, p, t):
			return t
		var ground := world.ground_height(p.x, p.z)
		if ground > 0.0 and p.y < ground:
			world.fx.sand_hit(Vector3(p.x, ground + 0.3, p.z))
			return t
		var wy := world.water_height(p.x, p.z)
		if p.y < wy:
			var s := Vector3(p.x, wy, p.z)
			world.fx.splash(s, 1.0)
			world.wake.stamp(s.x, s.z, 2.2, 1.4)
			world.wake.stamp(s.x, s.z, 4.5, 0.8, true)
			# a crater that rings outward
			world.wake.push(s.x, s.z, 1.8, -0.35)
			return t
	return -1.0


## Tests the ball (at p, t seconds into its flight) against every hull near
## it, in each hull's own frame: an oriented box shaped by her lines, and her
## rig above it. Returns true if it struck one.
func _strike_ship(b: _Ball, p: Vector3, t: float) -> bool:
	for s: Ship in world.ships:
		# a settled wreck sits too low and twisted to stop a ball; your gunners shoot past your own escorts
		if s == b.owner or s.removed or (not s.alive and s.sink_t > 2.0):
			continue
		if s.team == Ship.Team.PLAYER and b.owner.team == Ship.Team.PLAYER:
			continue
		var dx := p.x - s.pos.x
		var dz := p.z - s.pos.z
		var reach := s.cls.length * 0.55
		if dx * dx + dz * dz > reach * reach:
			continue
		var local := s.transform.affine_inverse() * p
		var shape := s.model.shape
		var u := local.z / s.cls.length + 0.5
		if u < 0.0 or u > 1.02:
			continue
		var tc := clampf(u, 0.0, 1.0)
		if local.y > shape.top(tc) + 0.6:
			if not s.alive:
				continue
			# high shots fly on through the rigging: they tear canvas, or smash into a mast
			var rig := s.dmg.rig_test(local)
			if rig.x == 2:
				var dealt := s.damage(b.damage * 0.4, b.owner, p, false)
				s.dmg.on_rig_hit(2, rig.y, p, b.v0 + Vector3(0.0, -GRAVITY * t, 0.0))
				world.hit.emit(s, b.owner, dealt, p)
				return true
			if rig.x == 1 and b.tore != s:
				b.tore = s
				s.dmg.on_rig_hit(1, rig.y, p, b.v0 + Vector3(0.0, -GRAVITY * t, 0.0))
			continue
		if local.y < shape.bottom(tc) - 0.2:
			continue
		if absf(local.x) > shape.half_width_at_y(tc, maxf(local.y, 0.0)) + 0.15:
			continue
		if not s.alive:
			world.fx.wood_hit(p, Vector3.UP)
			return true
		var side := 1.0 if local.x >= 0.0 else -1.0
		world.fx.wood_hit(p, s.port_dir() * side)
		var dealt := s.damage(b.damage, b.owner, p)
		world.hit.emit(s, b.owner, dealt, p)
		return true
	return false


## Ends every ball in flight and all the smoke.
func clear() -> void:
	_live.clear()
	for i in CAPACITY:
		_buf[i * STRIDE + 16] = 0.0
		_buf[i * STRIDE + 17] = 0.0
	_dirty = true


## Winds the clock back so the GPU's arithmetic on it stays precise.
func _rebase() -> void:
	_now -= REBASE
	for i in CAPACITY:
		_buf[i * STRIDE + 16] -= REBASE
		_buf[i * STRIDE + 17] -= REBASE
	for b in _live:
		b.born -= REBASE
	_dirty = true
