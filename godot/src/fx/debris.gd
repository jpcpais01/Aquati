class_name Debris
extends Node3D
## Wreckage that outlives the shot that made it (the web game's Debris):
## planks blasted off a hull tumble through the air and slap into the sea,
## barrels and crates are thrown off a dying ship, and all of it bobs on the
## swell and drifts with the wind before slowly waterlogging and going under.
## Big broken-off parts (a toppled mast with its yards and canvas, a snapped
## bowsprit) splash down, roll flat and float away the same way. Hulls
## shoulder floating junk aside as they sail through it.
##
## The small pieces are three multimeshes. A piece in the air, settling into
## the water or drifting under it is placed here every frame; once it is
## adrift it is given a clock of its own instead and the GPU floats it on the
## very swell the ocean draws (debris.gdshader), so a sea strewn with
## hundreds of planks costs the CPU only the few that are flying and those a
## hull is pushing through. Pieces adrift are filed by where they float, so
## each hull only looks at the junk around it.

const PLANK_CAP := 360
const PROP_CAP := 72
const PLANK := 0
const BARREL := 1
const CRATE := 2
enum State { AIR, SETTLE, ADRIFT, UNDER, AGROUND }
## How high each kind rides (m above the surface).
const RIDE := [0.0, 0.12, 0.08]
## Seconds a piece takes to come to rest on the swell from its tumble.
const SETTLE_T := 0.6
## The wind's grip on what floats (of its strength).
const WINDAGE := 0.35
## Once its life is up a piece settles this fast (m/s), and is gone this far down.
const SINK_RATE := 0.35
const SINK_GONE := 2.2
## Cells the floating pieces are filed in (m), and the frames it takes to look them all over again.
const CELL := 24.0
const SCAN_FRAMES := 30
const CLOCK_WRAP := 4096.0
const CPU_PLACED := Color(0.0, 0.0, -1.0, 0.0)


class Piece:
	var kind := 0
	var slot := 0
	var state := State.AIR
	var order := 0
	var pos := Vector3.ZERO
	var vel := Vector3.ZERO
	var rot := Quaternion.IDENTITY
	var spin := Vector3.ZERO
	var scale := Vector3.ONE
	## The paint; its alpha the phase of its bob.
	var color := Color.WHITE
	var age := 0.0
	var life := 0.0
	## Under water: rises (> 0) or sinks (< 0) till it reaches the surface or the sand.
	var buoy := 0.0
	## Adrift: where its drift is reckoned from (x, z, less the wind's carry
	## up to then), the way it has on beyond the wind's, when that was (the
	## sea's clock) and the life it had left then.
	var base := Vector2.ZERO
	var way := Vector2.ZERO
	var t0 := 0.0
	var left := 0.0
	## Its pose at rest on the water, and the one it splashed down in.
	var rest := Quaternion.IDENTITY
	var land := Quaternion.IDENTITY
	var settle := 0.0
	var cell := Vector2i(1 << 30, 0)


class Body:
	var node: Node3D
	var vel := Vector3.ZERO
	var spin := Vector3.ZERO
	## Its long axis in its own frame, how long it is, and which way the
	## canvas it carries faces (zero for none).
	var axis := Vector3.UP
	var length := 1.0
	var canvas := Vector3.ZERO
	var floating := false
	var age := 0.0
	var life := 30.0
	var sink := 0.0
	var settle_from := Quaternion.IDENTITY
	var settle_to := Quaternion.IDENTITY
	var settle := 1.0
	var bob := 0.0


var world: World
var material: ShaderMaterial
var _mm: Array[MultiMesh] = []
var _mi: Array[MultiMeshInstance3D] = []
## The pieces of each kind, in the order of their slots.
var _lists := [[], [], []]
var _bodies: Array[Body] = []
## Floating pieces by cell.
var _grid := {}
## How far the wind has carried what floats (m), and its drift now (m/s).
var _drift := Vector2.ZERO
var _drift_v := Vector2.ZERO
var _clock := 0.0
## The highest the sea can reach this frame (m).
var _sea_top := 2.0
var _order := 0
var _scan := [0, 0, 0]


func setup(p_world: World) -> void:
	world = p_world
	material = ShaderMaterial.new()
	material.shader = preload("res://shaders/debris.gdshader")
	var meshes: Array[Mesh] = [_plank_mesh(), _barrel_mesh(), _crate_mesh()]
	for k in 3:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = meshes[k]
		mm.instance_count = PLANK_CAP if k == PLANK else PROP_CAP
		mm.visible_instance_count = 0
		# the GPU moves what's adrift: the bounds can't come from the transforms
		mm.custom_aabb = AABB(Vector3(-1e5, -200.0, -1e5), Vector3(2e5, 400.0, 2e5))
		var mi := MultiMeshInstance3D.new()
		mi.name = ["Planks", "Barrels", "Crates"][k]
		mi.multimesh = mm
		mi.material_override = material
		# awash, their shadows barely show: not worth drawing every piece twice
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.visible = false
		add_child(mi)
		_mm.append(mm)
		_mi.append(mi)


## One piece of each kind as the game draws them, for it to draw once, too
## small to see, before the first shot (see ShipDamage.warm_meshes).
func warm_meshes() -> Array[Node3D]:
	var out: Array[Node3D] = []
	for k in 3:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = _mm[k].mesh
		mm.instance_count = 1
		mm.set_instance_custom_data(0, CPU_PLACED)
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		mi.material_override = material
		out.append(mi)
	return out


## Points the floating at an archipelago's seabed (where the swell dies down
## and what drifts ashore comes to rest).
func set_region(r: Region) -> void:
	material.set_shader_parameter("seabed_tex", r.height_tex)
	material.set_shader_parameter("seabed_rect", r.height_rect())
	material.set_shader_parameter("has_seabed", 1.0)


# ------------------------------------------------------------------ spawning

## Planks blasted outward from a breach.
func splinters(at: Vector3, outward: Vector3, carry: Vector3, colors: Array[Color], n: int) -> void:
	for i in n:
		var sp := randf_range(4.0, 11.0)
		var vel := Vector3(outward.x * sp + randf_range(-3.0, 3.0) + carry.x, randf_range(3.0, 10.0), outward.z * sp + randf_range(-3.0, 3.0) + carry.z)
		var c := MeshKit.shade(colors[randi() % colors.size()], randf_range(0.8, 1.1))
		_add(PLANK, at, vel, c, Vector3(randf_range(0.45, 1.5), 1.0, randf_range(0.7, 1.3)), randf_range(35.0, 70.0))


## Cargo and loose gear thrown off a dying ship.
func cargo(at: Vector3, carry: Vector3, n: int, spread: float = 2.0) -> void:
	for i in n:
		var a := randf() * TAU
		var sp := randf_range(1.5, 6.0)
		var vel := Vector3(cos(a) * sp + carry.x, randf_range(4.0, 9.0), sin(a) * sp + carry.z)
		var p := at + Vector3(randf_range(-spread, spread), randf(), randf_range(-spread, spread))
		if randf() < 0.6:
			_add(BARREL, p, vel, MeshKit.shade(Color("#c2a07a"), randf_range(0.85, 1.1)), Vector3.ONE, randf_range(60.0, 110.0))
		else:
			_add(CRATE, p, vel, MeshKit.shade(Color("#dbbd9a"), randf_range(0.85, 1.1)), Vector3.ONE * randf_range(0.8, 1.15), randf_range(60.0, 110.0))


## Wreckage torn loose beneath the waves: planks and casks claw their way up
## toward the light, crates and ballast tumble slowly down to the sand.
func drown(at: Vector3, n: int, colors: Array[Color]) -> void:
	for i in n:
		var r := randf()
		var kind := PLANK if r < 0.55 else (BARREL if r < 0.8 else CRATE)
		var vel := Vector3(randf_range(-1.4, 1.4), randf_range(-0.4, 0.8), randf_range(-1.4, 1.4))
		var pos := at + Vector3(randf_range(-1.5, 1.5), randf_range(-0.5, 1.0), randf_range(-1.5, 1.5))
		var c: Color
		var scale := Vector3.ONE * randf_range(0.85, 1.1)
		if kind == PLANK:
			c = MeshKit.shade(colors[randi() % colors.size()], randf_range(0.75, 1.05))
			scale = Vector3(randf_range(0.6, 1.6), 1.0, randf_range(0.8, 1.3))
		else:
			c = Color("#c2a07a") if kind == BARREL else Color("#dbbd9a")
		var p := _add(kind, pos, vel, c, scale, randf_range(50.0, 80.0))
		p.state = State.UNDER
		# most timber floats; a crate full of shot does not
		if kind == CRATE:
			p.buoy = -randf_range(0.6, 1.1)
		elif kind == BARREL:
			p.buoy = randf_range(1.0, 1.6)
		else:
			p.buoy = randf_range(0.6, 1.4) if randf() < 0.8 else -randf_range(0.3, 0.5)
		p.spin *= 0.12


## Takes over a broken-off part (a toppled spar on its hinge): it falls the
## rest of the way, splashes down along its length and floats off. `axis` is
## its long axis in its own frame, `length` how far it reaches along it, and
## `canvas` which way the sails it carries face (they end up spread on the
## water).
func add_body(node: Node3D, vel: Vector3, spin: Vector3, axis: Vector3, length: float, canvas: Vector3 = Vector3.ZERO) -> void:
	var xf := node.global_transform
	if node.get_parent() != null:
		node.get_parent().remove_child(node)
	add_child(node)
	node.global_transform = xf
	var b := Body.new()
	b.node = node
	b.vel = vel
	b.spin = spin
	b.axis = axis
	b.length = length
	b.canvas = canvas
	b.life = randf_range(26.0, 40.0)
	b.bob = randf() * 10.0
	_bodies.append(b)


func _add(kind: int, pos: Vector3, vel: Vector3, color: Color, scale: Vector3, life: float) -> Piece:
	var list: Array = _lists[kind]
	if list.size() >= (PLANK_CAP if kind == PLANK else PROP_CAP):
		# the oldest of its kind gives way
		var oldest: Piece = list[0]
		for q: Piece in list:
			if q.order < oldest.order:
				oldest = q
		_remove(oldest)
	var p := Piece.new()
	p.kind = kind
	p.order = _order
	_order += 1
	p.pos = pos
	p.vel = vel
	p.rot = Quaternion.from_euler(Vector3(randf() * TAU, randf() * TAU, randf() * TAU))
	p.spin = Vector3(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)) * (randf_range(6.0, 16.0) if kind == PLANK else randf_range(2.0, 6.0))
	p.scale = scale
	p.color = Color(color.r, color.g, color.b, randf())
	p.life = life
	p.slot = list.size()
	list.append(p)
	var mm := _mm[kind]
	mm.visible_instance_count = list.size()
	_mi[kind].visible = true
	mm.set_instance_color(p.slot, p.color)
	_write(p)
	return p


## Hands a piece's slot to the last of its kind.
func _remove(p: Piece) -> void:
	var list: Array = _lists[p.kind]
	var mm := _mm[p.kind]
	var last: Piece = list[list.size() - 1]
	if last != p:
		list[p.slot] = last
		last.slot = p.slot
		mm.set_instance_color(last.slot, last.color)
		_write(last)
	list.pop_back()
	mm.visible_instance_count = list.size()
	_mi[p.kind].visible = not list.is_empty()
	_unfile(p)


## Puts a piece's pose in its slot: where it is for one the CPU moves, its
## drift for one adrift (see debris.gdshader).
func _write(p: Piece) -> void:
	var mm := _mm[p.kind]
	if p.state == State.ADRIFT:
		mm.set_instance_transform(p.slot, Transform3D(Basis(p.rest) * Basis.from_scale(p.scale), Vector3(p.base.x, RIDE[p.kind], p.base.y)))
		mm.set_instance_custom_data(p.slot, Color(p.way.x, p.way.y, p.t0, p.left))
	else:
		mm.set_instance_transform(p.slot, Transform3D(Basis(p.rot) * Basis.from_scale(p.scale), p.pos))
		mm.set_instance_custom_data(p.slot, CPU_PLACED)


# ------------------------------------------------------------------ afloat

## Seconds on the sea's clock since t0.
func _since(t0: float) -> float:
	return fposmod(_clock - t0, CLOCK_WRAP)


## Where a floating piece is now (x, z), and its way.
func _drift_at(p: Piece) -> Vector2:
	return p.base + _drift + p.way * ((1.0 - exp(-0.9 * _since(p.t0))) / 0.9)


func _way_at(p: Piece) -> Vector2:
	return p.way * exp(-0.9 * _since(p.t0)) + _drift_v


## Its drift reckoned afresh from here: at (x, z) with way v.
func _rebase(p: Piece, xz: Vector2, v: Vector2) -> void:
	p.left -= _since(p.t0)
	p.t0 = _clock
	p.base = xz - _drift
	p.way = v - _drift_v
	if p.state == State.ADRIFT:
		_write(p)
	_file(p, xz)


## The slow bob and roll of a piece afloat (as debris.gdshader has it).
func _wobble(p: Piece) -> Quaternion:
	var bob := _clock + p.color.a * 10.0
	return Basis.from_euler(Vector3(sin(bob * 1.3) * 0.12, sin(bob * 0.21) * 0.25, cos(bob * 1.1) * 0.12), EULER_ORDER_XYZ).get_rotation_quaternion()


func _file(p: Piece, xz: Vector2) -> void:
	var key := Vector2i(floori(xz.x / CELL), floori(xz.y / CELL))
	if key == p.cell:
		return
	_unfile(p)
	var cell: Array = _grid.get(key, [])
	if cell.is_empty():
		_grid[key] = cell
	cell.append(p)
	p.cell = key


func _unfile(p: Piece) -> void:
	if p.cell.x == 1 << 30:
		return
	var cell: Array = _grid.get(p.cell, [])
	cell.erase(p)
	if cell.is_empty():
		_grid.erase(p.cell)
	p.cell = Vector2i(1 << 30, 0)


## A piece meets the water: it slaps down and comes to rest on it, keeping its heading.
func _splash_down(p: Piece, wh: float, quiet: bool = false) -> void:
	p.state = State.SETTLE
	p.settle = 0.0
	p.land = p.rot
	var e := Basis(p.rot).get_euler(EULER_ORDER_YXZ)
	p.rest = Quaternion.from_euler(Vector3(randf_range(-0.15, 0.15), e.y, randf_range(-0.15, 0.15)))
	# barrels roll on their side
	if p.kind == BARREL and randf() < 0.65:
		p.rest = p.rest * Quaternion(Vector3.RIGHT, PI * 0.5)
	p.base = Vector2(p.pos.x, p.pos.z) - _drift
	p.way = Vector2(p.vel.x, p.vel.z) * 0.25 - _drift_v
	p.t0 = _clock
	p.left = p.life - p.age
	_file(p, Vector2(p.pos.x, p.pos.z))
	if quiet or randf() >= (0.3 if p.kind == PLANK else 1.0):
		return
	var at := Vector3(p.pos.x, wh, p.pos.z)
	world.fx.splash(at, 0.25 if p.kind == PLANK else 0.45)
	world.wake.stamp(at.x, at.z, 1.1, 0.3, true)
	world.wake.push(at.x, at.z, 0.9, -0.08 if p.kind == PLANK else -0.18)


func update(dt: float, pushers: Array[Ship], ocean: Ocean, eye: Vector3) -> void:
	_clock = fmod(world.time, CLOCK_WRAP)
	var w := world.wind
	_drift_v = Vector2(w.dir_x, w.dir_z) * WINDAGE * w.strength
	_drift += _drift_v * dt
	var top := 1.5
	for a in world.waves.amp:
		top += a
	_sea_top = top
	var m := material
	m.set_shader_parameter("drift", _drift)
	m.set_shader_parameter("wave_a", world.waves.packed_a)
	m.set_shader_parameter("wave_b", world.waves.packed_b)
	m.set_shader_parameter("grid_warp", ocean.grid_warp)
	m.set_shader_parameter("grid_origin", Vector2(ocean.position.x, ocean.position.z))
	m.set_shader_parameter("eye", eye)
	if dt <= 0.0:
		return
	for k in 3:
		_step_kind(k, dt)
	for s in pushers:
		_push_pieces(s)
	_step_bodies(dt, pushers)


func _step_kind(kind: int, dt: float) -> void:
	var list: Array = _lists[kind]
	# the ones the CPU moves, every frame
	for i in range(list.size() - 1, -1, -1):
		var p: Piece = list[i]
		p.age += dt
		match p.state:
			State.AIR:
				_fly(p, dt)
			State.SETTLE:
				_settle(p, dt)
			State.UNDER:
				_float_up(p, dt)
	# and the rest looked over in turn: refiled as they drift, gone once sunk or rotted
	var n := list.size()
	if n == 0:
		return
	var per := ceili(float(n) / SCAN_FRAMES)
	var i0: int = _scan[kind] % n
	var gone: Array[Piece] = []
	for j in mini(per, n):
		var p: Piece = list[(i0 + j) % n]
		if p.state == State.ADRIFT:
			if _since(p.t0) - p.left > SINK_GONE / SINK_RATE:
				gone.append(p)
			else:
				_file(p, _drift_at(p))
		elif p.state == State.AGROUND and p.age > p.life:
			gone.append(p)
	_scan[kind] = i0 + per
	for p in gone:
		_remove(p)


## Tumbling through the air till it meets the sea or the sand.
func _fly(p: Piece, dt: float) -> void:
	p.vel.y -= 16.0 * dt
	p.pos += p.vel * dt
	var l := p.spin.length()
	if l > 1e-4:
		p.rot = Quaternion(p.spin / l, l * dt) * p.rot
	var ground := world.ground_height(p.pos.x, p.pos.z)
	if p.pos.y < maxf(ground, 0.0) + _sea_top:
		var wh := world.water_height(p.pos.x, p.pos.z)
		if ground > wh - 0.1:
			if p.pos.y < ground + 0.1:
				p.state = State.AGROUND
				p.pos.y = ground + 0.08
		elif p.pos.y < wh:
			_splash_down(p, wh)
	_write(p)


## Its first moments afloat: easing out of its tumble into the swell's rhythm,
## carried as it will be adrift (so the GPU takes over without a seam).
func _settle(p: Piece, dt: float) -> void:
	p.settle += dt
	var xz := _drift_at(p)
	var wh := world.water_height(xz.x, xz.y)
	var y := maxf(wh + RIDE[p.kind], world.ground_height(xz.x, xz.y) + 0.08)
	var k := MathX.smooth(0.0, 1.0, p.settle / SETTLE_T)
	p.rot = p.land.slerp(_wobble(p) * p.rest, k)
	p.pos = Vector3(xz.x, y, xz.y)
	if p.settle >= SETTLE_T:
		p.state = State.ADRIFT
	_write(p)


## Adrift beneath the waves: heavy drag, a lazy tumble, a sway in the swell's surge.
func _float_up(p: Piece, dt: float) -> void:
	p.vel *= exp(-1.6 * dt)
	p.vel.y += p.buoy * dt
	p.settle += dt
	p.pos.x += (p.vel.x + sin(p.settle * 0.8 + p.buoy * 9.0) * 0.18) * dt
	p.pos.y += p.vel.y * dt
	p.pos.z += (p.vel.z + cos(p.settle * 0.6 + p.buoy * 5.0) * 0.18) * dt
	p.spin *= exp(-0.2 * dt)
	var l := p.spin.length()
	if l > 1e-4:
		p.rot = Quaternion(p.spin / l, l * dt) * p.rot
	var ground := world.ground_height(p.pos.x, p.pos.z)
	if p.pos.y > -_sea_top:
		var wh := world.water_height(p.pos.x, p.pos.z)
		if p.pos.y > wh - 0.2:
			# broke the surface: from here it bobs and drifts like any other flotsam
			p.vel *= 0.3
			_splash_down(p, wh, true)
			_write(p)
			return
	if p.pos.y < ground + 0.15:
		p.state = State.AGROUND
		p.pos.y = ground + 0.12
	_write(p)


## Hull s shoulders aside the junk afloat around her.
func _push_pieces(s: Ship) -> void:
	var r := s.cls.length
	var c0 := Vector2i(floori((s.pos.x - r) / CELL), floori((s.pos.z - r) / CELL))
	var c1 := Vector2i(floori((s.pos.x + r) / CELL), floori((s.pos.z + r) / CELL))
	for cx in range(c0.x, c1.x + 1):
		for cz in range(c0.y, c1.y + 1):
			var cell: Array = _grid.get(Vector2i(cx, cz), [])
			if cell.is_empty():
				continue
			for p: Piece in cell.duplicate():
				var xz := _drift_at(p)
				var v := _way_at(p)
				var shoved := _shove(xz, v, s, 0.3)
				if shoved.size() > 0:
					_rebase(p, shoved[0], shoved[1])


## Pushes a point (x, z) moving at v out of hull s: [position, way] if it
## was in her way, else empty.
static func _shove(xz: Vector2, v: Vector2, s: Ship, gain: float) -> Array[Vector2]:
	var out: Array[Vector2] = []
	var dx := xz.x - s.pos.x
	var dz := xz.y - s.pos.z
	var L := s.cls.length
	if dx * dx + dz * dz > L * L:
		return out
	var fx := sin(s.heading)
	var fz := cos(s.heading)
	var along := clampf(dx * fx + dz * fz, -L * 0.5, L * 0.5)
	var ox := dx - fx * along
	var oz := dz - fz * along
	var d := sqrt(ox * ox + oz * oz)
	var u := absf(along) / (L * 0.5)
	var reach := s.cls.beam * 0.5 * (1.0 - u * u * 0.6) + 0.4
	if d >= reach or d <= 1e-3:
		return out
	var k := (reach - d) / d
	var spd := absf(s.speed)
	out.append(Vector2(xz.x + ox * k, xz.y + oz * k))
	out.append(v + Vector2(ox / d * (1.0 + spd * gain) + fx * spd * 0.15, oz / d * (1.0 + spd * gain) + fz * spd * 0.15))
	return out


# ------------------------------------------------------------------ big parts

func _step_bodies(dt: float, pushers: Array[Ship]) -> void:
	var drift := _drift_v * 0.6
	for i in range(_bodies.size() - 1, -1, -1):
		var b := _bodies[i]
		var o := b.node
		b.age += dt
		if not b.floating:
			b.vel.y -= 14.0 * dt
			o.position += b.vel * dt
			var l := b.spin.length()
			if l > 1e-4:
				o.basis = Basis(b.spin / l, l * dt) * o.basis
			# has the middle of the part reached the sea?
			var ax := o.basis.orthonormalized() * b.axis
			var mid := o.position + ax * (b.length * 0.5)
			var wh := world.water_height(mid.x, mid.z)
			if mid.y < wh + 0.4:
				_splash_body(b, ax, wh)
		else:
			var k := exp(-0.7 * dt)
			b.vel.x = (b.vel.x - drift.x) * k + drift.x
			b.vel.z = (b.vel.z - drift.y) * k + drift.y
			o.position.x += b.vel.x * dt
			o.position.z += b.vel.z * dt
			b.settle = minf(1.0, b.settle + dt * 0.7)
			var st := b.settle * b.settle * (3.0 - 2.0 * b.settle)
			b.bob += dt
			b.settle_to = Quaternion(Vector3.UP, sin(b.bob * 0.15) * 0.0015) * b.settle_to
			o.quaternion = b.settle_from.slerp(b.settle_to, st)
			# waterlogged spars ride low and slowly go under
			b.sink += dt * (0.25 + (b.age - b.life) * 0.05 if b.age > b.life else 0.025)
			var mid := o.position + o.basis * (b.axis * (b.length * 0.5))
			var wh := world.water_height(mid.x, mid.z)
			var ground := world.ground_height(mid.x, mid.z)
			for s in pushers:
				var shoved := _shove(Vector2(o.position.x, o.position.z), Vector2(b.vel.x, b.vel.z), s, 0.1)
				if shoved.size() > 0:
					o.position.x = shoved[0].x
					o.position.z = shoved[0].y
					b.vel.x = shoved[1].x
					b.vel.z = shoved[1].y
			var ty := maxf(wh - 0.45 - b.sink + sin(b.bob * 1.2) * 0.08, ground + 0.2) - (mid.y - o.position.y)
			o.position.y += (ty - o.position.y) * minf(1.0, dt * 2.5)
			if b.sink > 9.0:
				_bodies.remove_at(i)
				o.queue_free()


## A big part hits the water: spray along its length, and it rolls to lie
## along the sea with its canvas spread on the water (not standing up off it
## like a fin).
func _splash_body(b: Body, ax: Vector3, wh: float) -> void:
	var o := b.node
	b.floating = true
	# awash, its shadow barely shows on the sea: not worth a second draw of every spar adrift
	for g in o.find_children("*", "GeometryInstance3D", true, false):
		(g as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	b.vel *= 0.2
	b.vel.y = 0.0
	b.settle = 0.0
	b.settle_from = o.quaternion
	var flat := Vector3(ax.x, 0.0, ax.z)
	if flat.length_squared() < 1e-4:
		flat = Vector3.RIGHT
	flat = flat.normalized()
	var q := Quaternion(ax.normalized(), flat) * o.quaternion
	var n := q * b.canvas
	n -= flat * n.dot(flat)
	if n.length_squared() > 1e-4:
		n = n.normalized()
		# not quite flat: the canvas half swamped
		q = Quaternion(flat, n.signed_angle_to(Vector3.UP if n.y >= 0.0 else Vector3.DOWN, flat) * 0.85) * q
	b.settle_to = q
	if world.sound != null:
		var h := world.heard(o.position + ax * (b.length * 0.5))
		world.sound.splash(h.x, h.y, h.z)
	for k in 5:
		var sp := o.position + ax * (b.length * k / 4.0)
		sp.y = world.water_height(sp.x, sp.z)
		world.fx.splash(sp, 1.1)
		world.wake.stamp(sp.x, sp.z, 2.2, 0.6)
		world.wake.stamp(sp.x, sp.z, 4.0, 0.45, true)
		world.wake.push(sp.x, sp.z, 2.4, -0.45)


## A fresh voyage: the sea swept clean.
func clear() -> void:
	for list: Array in _lists:
		list.clear()
	for k in 3:
		_mm[k].visible_instance_count = 0
		_mi[k].visible = false
	_grid.clear()
	for b in _bodies:
		b.node.queue_free()
	_bodies.clear()


## How many pieces are afloat or flying, and big parts adrift.
func counts() -> Vector2i:
	return Vector2i(_lists[0].size() + _lists[1].size() + _lists[2].size(), _bodies.size())


# ------------------------------------------------------------------ meshes

## A splintered board: a plank broken off ragged at one end.
static func _plank_mesh() -> ArrayMesh:
	var rings: Array[PackedVector3Array] = []
	for x: float in [-0.5, -0.1667, 0.1667]:
		rings.append(PackedVector3Array([Vector3(x, 0.035, 0.1), Vector3(x, 0.035, -0.1), Vector3(x, -0.035, -0.1), Vector3(x, -0.035, 0.1)]))
	var end := PackedVector3Array()
	var corners := [Vector2(0.035, 0.1), Vector2(0.035, -0.1), Vector2(-0.035, -0.1), Vector2(-0.035, 0.1)]
	for k in 4:
		var c: Vector2 = corners[k]
		end.append(Vector3(0.5 + sin(k * 78.233) * 0.08, c.x, c.y * (0.55 + sin(k * 12.9898) * 0.25)))
	rings.append(end)
	return _commit(prism(rings))


## A kit's mesh with its paint's alpha cleared to 1 (in a piece's colour the
## alpha is the phase of its bob, and the vertex colour multiplies it).
static func _commit(kit: MeshKit) -> ArrayMesh:
	for i in kit.colors.size():
		kit.colors[i].a = 1.0
	return kit.commit()


## Faceted solid through a run of four-cornered sections, capped at both
## ends, painted white (wood).
static func prism(rings: Array[PackedVector3Array]) -> MeshKit:
	var kit := MeshKit.new()
	kit.paint(Color.WHITE, MeshKit.WOOD, 0.0)
	for r in rings.size() - 1:
		var a := rings[r]
		var b := rings[r + 1]
		for k in 4:
			var k1 := (k + 1) % 4
			var n := (b[k] - a[k]).cross(a[k1] - a[k]).normalized()
			var v := kit.vertex_count()
			for p in [a[k], b[k], b[k1], a[k1]]:
				kit.add_vertex(p, n)
			kit.quad(v, v + 1, v + 2, v + 3)
	for e in 2:
		var ring := rings[0] if e == 0 else rings[rings.size() - 1]
		var n := (ring[1] - ring[0]).cross(ring[3] - ring[0]).normalized() * (1.0 if e == 0 else -1.0)
		var v := kit.vertex_count()
		for p in ring:
			kit.add_vertex(p, n)
		if e == 0:
			kit.quad(v, v + 1, v + 2, v + 3)
		else:
			kit.quad(v + 3, v + 2, v + 1, v)
	return kit


## A cask: bulging staves, dark iron hoops at the chimes and the quarters.
static func _barrel_mesh() -> ArrayMesh:
	var kit := MeshKit.new()
	kit.paint(Color.WHITE, MeshKit.WOOD, 0.0)
	var ys := [-0.37, -0.3, -0.22, -0.16, 0.0, 0.16, 0.22, 0.3, 0.37]
	var radial := 10
	var base := kit.vertex_count()
	for y: float in ys:
		var r := 0.27 * (1.0 + 0.12 * cos(y / 0.37 * PI * 0.5))
		var hoop := absf(y) > 0.36 or absf(absf(y) - 0.22) < 0.01
		for i in radial + 1:
			var a := TAU * (i % radial) / radial
			var d := Vector3(cos(a), 0.0, sin(a))
			kit.add_vertex(Vector3(d.x * r, y, d.z * r), d)
			if hoop:
				kit.colors[kit.vertex_count() - 1] = Color(0.32, 0.3, 0.28).linear_to_srgb()
	for j in ys.size() - 1:
		for i in radial:
			var a := base + j * (radial + 1) + i
			var c := a + radial + 1
			kit.quad(a, c, c + 1, a + 1)
	# the heads
	for e: float in [-1.0, 1.0]:
		var y: float = ys[0] if e < 0.0 else ys[ys.size() - 1]
		var r := 0.27 * (1.0 + 0.12 * cos(y / 0.37 * PI * 0.5))
		kit.disc(Transform3D(Basis(Vector3.RIGHT, -PI * 0.5 * e), Vector3(0, y, 0)), r, radial)
	return _commit(kit)


static func _crate_mesh() -> ArrayMesh:
	var kit := MeshKit.new()
	kit.paint(Color.WHITE, MeshKit.WOOD, 0.0)
	kit.box(Transform3D.IDENTITY, Vector3(0.62, 0.62, 0.62))
	return _commit(kit)
