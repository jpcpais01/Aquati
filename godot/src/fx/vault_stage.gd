class_name VaultStage
extends Node3D
## The Treasure Vault's stage, out on the real sea (the web's vaultStage): a
## gilded sea chest that surfaces off her quarter, trembles as the luck
## inside climbs through the rarities, light leaking round its lid, then
## bursts open in a column of light, a fan of god rays, a glare, a shockwave
## across the swell and a fountain of coins, the finest finds with star
## shells overhead. Everything is built when the game starts, so nothing new
## is drawn (or compiled) the first time the vault opens. The camera's shots
## of it all are here too.

## The chest flinched the camera (an amount for CameraRig.shake).
signal quake(amount: float)

const CHEST := preload("res://shaders/vault_chest.gdshader")
const LIGHT := preload("res://shaders/vault_light.gdshader")
const GLARE := preload("res://shaders/vault_glow.gdshader")
const RING := preload("res://shaders/vault_ring.gdshader")

## The chest: width (across its front), body height, depth (m).
const W := 2.1
const H := 1.15
const D := 1.35
## Each vault rarity's glow (linear HDR): common, rare, epic, legendary.
const TINTS: Array[Vector3] = [Vector3(0.7, 2.4, 2.0), Vector3(0.6, 1.5, 3.4), Vector3(2.2, 0.8, 3.6), Vector3(4.0, 2.4, 0.7)]
## The warm lamplight of a closed chest at rest.
const REST := Vector3(2.6, 1.6, 0.55)
## No bloom on a phone: the lamplight's brightest channel is held here so it
## keeps its hue instead of burning white (PartModels.GLOW_PEAK's lesson).
const PEAK := 1.6

var world: World
var ocean: Ocean
## Up and drawing (false once it has sunk away again).
var active := false
## Dims the open chest while the showcase has her on stage.
var hushed := false
## Where it floats, which way is out to sea from her, and her bow.
var pos := Vector3.ZERO
var out := Vector3.RIGHT
var fwd := Vector3.FORWARD
var ship: Ship

var _chest := Node3D.new()
var _lid := Node3D.new()
var _gem_mat: ShaderMaterial
var _hoard_mat: ShaderMaterial
var _beam: MeshInstance3D
var _rays: MeshInstance3D
var _glow: MeshInstance3D
var _seam: MeshInstance3D
var _ring: MeshInstance3D
var _side := 1

var _rise := 0.0
var _rise_to := 0.0
var _splashed := false
var _lid_k := 0.0
var _lid_v := 0.0
var _lid_to := 0.0
var _rattle := 0.0
var _shake := 0.0
var _col := REST
var _col_to := REST
var _beam_amt := 0.0
var _rays_amt := 0.0
var _seam_amt := 0.0
var _seam_to := 0.0
var _flash := 0.0
var _ring_t := -1.0
var _ring_big := 1.0
var _open := false
var _hush := 0.0
var _t := 0.0
var _spark_t := 0.0
var _fireworks: Array[Vector2] = []
var _burst_tier := -1
var _pulse_tier := -1


func _init(p_world: World, p_ocean: Ocean) -> void:
	world = p_world
	ocean = p_ocean
	name = "VaultStage"
	visible = false
	set_process(false)
	var wood := ShaderMaterial.new()
	wood.shader = CHEST
	_gem_mat = ShaderMaterial.new()
	_gem_mat.shader = CHEST
	_gem_mat.set_shader_parameter("glow_gain", 1.0)
	_hoard_mat = ShaderMaterial.new()
	_hoard_mat.shader = CHEST
	_hoard_mat.set_shader_parameter("glow_gain", 1.0)
	add_child(_chest)
	_mesh(_body(), wood, _chest, true)
	_lid.position = Vector3(0.0, H, -D * 0.5)
	_chest.add_child(_lid)
	_mesh(_lid_mesh(), wood, _lid, true)
	var g := MeshKit.new(5)
	g.paint(Color.WHITE, MeshKit.GLOW, 0.0)
	g.octahedron(Transform3D(Basis.from_scale(Vector3(1.0, 1.25, 0.55)), Vector3(0.0, H - 0.26, D * 0.5 + 0.11)), 0.1)
	_mesh(g.commit(), _gem_mat, _chest, false)
	_mesh(_hoard(), _hoard_mat, _chest, false)
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	_beam = _light(LIGHT, 0, quad)
	_beam.material_override.set_shader_parameter("k", Vector4(2.6, 46.0, 0.0, 0.0))
	var cone := CylinderMesh.new()
	cone.top_radius = 6.5
	cone.bottom_radius = 0.55
	cone.height = 8.0
	cone.radial_segments = 64
	cone.rings = 1
	cone.cap_top = false
	cone.cap_bottom = false
	_rays = _light(LIGHT, 1, cone)
	_rays.material_override.set_shader_parameter("k", Vector4(1.0, 8.0, 0.5, 0.0))
	var two := QuadMesh.new()
	two.size = Vector2(2.0, 2.0)
	_seam = _light(GLARE, 2, two)
	_glow = _light(GLARE, 2, two)
	_ring = _light(RING, 3, _grid(24))


func _mesh(m: Mesh, mat: Material, parent: Node3D, shadow: bool) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


func _light(shader: Shader, kind: int, m: Mesh) -> MeshInstance3D:
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("kind", kind)
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# the shaders stand them up, turn them and lay them on the swell
	mi.custom_aabb = AABB(Vector3(-60.0, -10.0, -60.0), Vector3(120.0, 70.0, 120.0))
	add_child(mi)
	return mi


## A flat grid (x, z in -1..1) for the ring the shader lays on the swell.
static func _grid(n: int) -> ArrayMesh:
	var v := PackedVector3Array()
	var idx := PackedInt32Array()
	for j in n + 1:
		for i in n + 1:
			v.append(Vector3(-1.0 + 2.0 * i / n, 0.0, -1.0 + 2.0 * j / n))
	for j in n:
		for i in n:
			var a := j * (n + 1) + i
			idx.append_array([a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = v
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return m


# ------------------------------------------------------------------ the craft

const WOOD := Color("#6b2f1a")
const WOOD_DK := Color("#3c170c")
const GOLD := Color("#f2c25a")
const GOLD_DK := Color("#b27a22")
const STUD := Color("#fff0b8")


## The body: planked mahogany on gilded feet, its rims, straps and corners
## gold, studs along its top, a shield of a lock with its keyhole on the
## front (+z), a ring handle at each end.
static func _body() -> ArrayMesh:
	var k := MeshKit.new(31)
	k.paint(WOOD, MeshKit.WOOD, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0.0, H * 0.5, 0.0)), Vector3(W, H, D), 0.05)
	k.paint(WOOD_DK, MeshKit.WOOD, 0.0)
	for y: float in [0.3, 0.62, 0.92]:
		for z: float in [-1.0, 1.0]:
			k.box(Transform3D(Basis.IDENTITY, Vector3(0.0, y, z * (D * 0.5 + 0.005))), Vector3(W - 0.02, 0.025, 0.02))
	k.paint(GOLD_DK, MeshKit.GILT, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0.0, 0.06, 0.0)), Vector3(W + 0.1, 0.12, D + 0.1), 0.03)
	k.paint(GOLD, MeshKit.GILT, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0.0, H - 0.04, 0.0)), Vector3(W + 0.08, 0.09, D + 0.08), 0.03)
	for x: float in [-0.66, 0.0, 0.66]:
		k.paint(GOLD if x == 0.0 else GOLD_DK, MeshKit.GILT, 0.0)
		k.box(Transform3D(Basis.IDENTITY, Vector3(x, H * 0.5, 0.0)), Vector3(0.14, H + 0.02, D + 0.06))
	for cx: float in [-1.0, 1.0]:
		for cz: float in [-1.0, 1.0]:
			k.paint(GOLD, MeshKit.GILT, 0.0)
			k.rbox(Transform3D(Basis.IDENTITY, Vector3(cx * (W * 0.5 - 0.02), H * 0.5, cz * (D * 0.5 - 0.02))), Vector3(0.16, H + 0.06, 0.16), 0.04)
			k.paint(GOLD_DK, MeshKit.GILT, 0.0)
			k.ball(Vector3(cx * (W * 0.5 - 0.06), -0.02, cz * (D * 0.5 - 0.06)), 0.11, 10, 6)
	k.paint(STUD, MeshKit.GILT, 0.0)
	for i in 9:
		var x := -W * 0.5 + 0.12 + i * (W - 0.24) / 8.0
		for z: float in [-1.0, 1.0]:
			k.ball(Vector3(x, H - 0.12, z * (D * 0.5 + 0.035)), 0.035, 6, 4)
	# the lock: a six-sided shield of a plate, its keyhole dark
	k.paint(GOLD, MeshKit.GILT, 0.0)
	k.spar(Vector3(0.0, H - 0.3, D * 0.5 + 0.03), Vector3(0.0, H - 0.3, D * 0.5 + 0.09), 0.2, 0.26, 6)
	k.paint(Color("#120806"), MeshKit.WOOD, 0.0)
	k.box(Transform3D(Basis.IDENTITY, Vector3(0.0, H - 0.4, D * 0.5 + 0.095)), Vector3(0.05, 0.12, 0.02))
	k.paint(GOLD_DK, MeshKit.GILT, 0.0)
	for sx: float in [-1.0, 1.0]:
		k.torus(Transform3D(Basis(Vector3(0.0, 0.0, 1.0), Vector3(0.0, 1.0, 0.0), Vector3(-1.0, 0.0, 0.0)), Vector3(sx * (W * 0.5 + 0.06), H * 0.55, 0.0)), 0.17, 0.035, 6, 14)
	return k.commit()


## The lid: a half barrel hinged along its back edge (its origin the hinge,
## the barrel reaching forward along +z), capped at the ends, gold straps
## studded over it, a lip front and back, a crown ring on top and the hasp
## hanging over the lock.
static func _lid_mesh() -> ArrayMesh:
	var k := MeshKit.new(32)
	var r := D * 0.5
	var at := Transform3D(Basis.IDENTITY, Vector3(0.0, 0.0, r))
	k.paint(WOOD, MeshKit.WOOD, 0.0)
	Loot._half_barrel(k, at, -W * 0.5, W * 0.5, r, 20)
	k.paint(WOOD_DK, MeshKit.WOOD, 0.0)
	Loot._half_disc(k, at, W * 0.5, r, 20, 1.0)
	Loot._half_disc(k, at, -W * 0.5, r, 20, -1.0)
	# its underside, seen when it stands open
	k.box(at * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.03, 0.0)), Vector3(W - 0.04, 0.04, D - 0.04))
	for x: float in [-0.66, 0.0, 0.66]:
		k.paint(GOLD if x == 0.0 else GOLD_DK, MeshKit.GILT, 0.0)
		Loot._half_barrel(k, at, x - 0.075, x + 0.075, r + 0.045, 20)
		Loot._half_disc(k, at, x + 0.075, r + 0.045, 20, 1.0)
		Loot._half_disc(k, at, x - 0.075, r + 0.045, 20, -1.0)
		k.paint(STUD, MeshKit.GILT, 0.0)
		for q in range(1, 6):
			var a := q / 6.0 * PI
			k.ball(at * Vector3(x + 0.11, sin(a) * (r + 0.05), cos(a) * (r + 0.05)), 0.04, 6, 4)
	k.paint(GOLD, MeshKit.GILT, 0.0)
	for z: float in [r, -r]:
		k.rbox(at * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.03, z)), Vector3(W + 0.08, 0.08, 0.08), 0.02)
	k.torus(at * Transform3D(Basis.IDENTITY, Vector3(0.0, r + 0.16, 0.0)), 0.13, 0.035, 6, 16)
	k.paint(GOLD_DK, MeshKit.GILT, 0.0)
	k.rbox(at * Transform3D(Basis.IDENTITY, Vector3(0.0, -0.06, r + 0.04)), Vector3(0.12, 0.2, 0.05), 0.015)
	return k.commit()


## The hoard heaped inside: a glowing mound of coins, more coins tumbled
## over it and jewels on top.
static func _hoard() -> ArrayMesh:
	var k := MeshKit.new(33)
	k.paint(Color("#ffc24a"), MeshKit.GLOW, 0.0)
	k.sphere(Transform3D(Basis.from_scale(Vector3(1.45, 0.42, 0.88)), Vector3(0.0, H - 0.05, 0.0)), 0.62, 18, 5, 0.0, TAU, 0.0, PI * 0.5)
	var rng := RandomNumberGenerator.new()
	rng.seed = 11
	k.paint(Color("#ffe08a"), MeshKit.GLOW, 0.0)
	for i in 26:
		var tilt := Basis(Vector3.RIGHT, (rng.randf() - 0.5) * 1.8) * Basis(Vector3.BACK, (rng.randf() - 0.5) * 1.8)
		var a := rng.randf() * TAU
		var d := sqrt(rng.randf()) * 0.72
		var c := Vector3(cos(a) * d * 1.15, H + 0.08 + rng.randf() * 0.18 * (1.0 - d), sin(a) * d * 0.62)
		var up := tilt * Vector3(0.0, 0.011, 0.0)
		k.spar(c - up, c + up, 0.085, 0.085, 10)
	var jewels := [Color("#ff3c64"), Color("#3cf0a0"), Color("#50a8ff"), Color("#c070ff")]
	for i in 7:
		k.paint(jewels[i % 4], MeshKit.GLOW, 0.0)
		var a := rng.randf() * TAU
		var d := 0.15 + rng.randf() * 0.45
		k.octahedron(Transform3D(Basis.IDENTITY, Vector3(cos(a) * d, H + 0.22, sin(a) * d * 0.55)), 0.075)
	return k.commit()


# ------------------------------------------------------------------ what it does


## Surfaces beside her, on the side with open water (+1 port, -1 starboard).
func show_by(s: Ship, side: int) -> void:
	ship = s
	_side = side
	_place()
	active = true
	visible = true
	set_process(true)
	_rise = 0.0
	_rise_to = 1.0
	_splashed = false
	_open = false
	hushed = false
	_hush = 0.0
	_lid_k = 0.0
	_lid_v = 0.0
	_lid_to = 0.0
	_rattle = 0.0
	_shake = 0.0
	_col_to = REST
	_col = REST
	_beam_amt = 0.0
	_rays_amt = 0.0
	_seam_amt = 0.0
	_seam_to = 0.0
	_flash = 0.0
	_ring_t = -1.0
	_fireworks.clear()
	_burst_tier = -1
	_pulse_tier = -1
	_t = 0.0
	if world.region != null:
		var m: ShaderMaterial = _ring.material_override
		m.set_shader_parameter("seabed_tex", world.region.height_tex)
		m.set_shader_parameter("seabed_rect", world.region.height_rect())
		m.set_shader_parameter("has_seabed", 1.0)
	_step(0.0)


## Sinks back into the deep.
func sink() -> void:
	_rise_to = 0.0
	_lid_to = 0.0
	_open = false
	_seam_to = 0.0
	_rattle = 0.0
	_shake = 0.0
	_fireworks.clear()


## Off her quarter on its side, a little astern, its front turned to where
## the camera stands to watch it.
func _place() -> void:
	var s := ship
	out = s.port_dir() * _side
	fwd = s.forward()
	pos = Vector3(s.pos.x, 0.0, s.pos.z) + out * (s.cls.beam * 0.5 + 5.2) - fwd * (s.cls.length * 0.5 + 2.0)


## The luck inside climbs a step: the chest shakes harder, light leaks
## round its lid in that rarity's colour, a ring of it runs over the water.
func charge(tier: int) -> void:
	_col_to = TINTS[tier]
	_rattle = 0.05 + tier * 0.035
	_shake = 0.012 + tier * 0.014
	_seam_to = 0.5 + tier * 0.35
	_flash = maxf(_flash, 0.6 + tier * 0.25)
	_ring_t = 0.0
	_ring_big = 0.45 + tier * 0.12
	quake.emit(0.18 + tier * 0.1)
	_spurt(10 + tier * 8, 0.8)


## The lid bursts open on the best find.
func burst(tier: int) -> void:
	_open = true
	_col_to = TINTS[tier]
	_col = _col_to
	_rattle = 0.0
	_shake = 0.0
	_seam_to = 0.0
	_lid_to = 1.95
	_lid_v = 9.0 + tier * 1.5
	_beam_amt = 2.6 + tier * 0.6
	_rays_amt = 1.6 + tier * 0.4
	_flash = 2.4 + tier * 0.8
	_ring_t = 0.0
	_ring_big = 1.0 + tier * 0.45
	quake.emit(0.55 + tier * 0.2)
	_burst_tier = tier
	if tier >= 2:
		for i in (7 if tier == 3 else 3):
			_fireworks.append(Vector2(_t + 0.35 + i * (0.22 if tier == 3 else 0.3), tier))


## A card turns over: the column and the glare flare in its colour.
func pulse(tier: int) -> void:
	_col_to = TINTS[tier]
	_flash = maxf(_flash, 0.9 + tier * 0.5)
	_beam_amt = maxf(_beam_amt, 1.4 + tier * 0.5)
	if tier >= 2:
		_ring_t = 0.0
		_ring_big = 0.6 + tier * 0.25
	_pulse_tier = tier


## Back to the closed chest at rest.
func settle() -> void:
	_open = false
	_lid_to = 0.0
	_rattle = 0.0
	_shake = 0.0
	_seam_to = 0.0
	_col_to = REST
	_fireworks.clear()


## The chest's mouth, in the world.
func mouth() -> Vector3:
	return _chest.global_transform * Vector3(0.0, H + 0.3, 0.0)


func _process(dt: float) -> void:
	_step(dt)


func _step(dt: float) -> void:
	if not active:
		return
	_t += dt
	_rise += (_rise_to - _rise) * minf(1.0, dt * (1.6 if _rise_to > _rise else 2.2))
	if _rise_to == 0.0 and _rise < 0.02:
		active = false
		visible = false
		set_process(false)
		return
	# a moored ship swings a touch: keep station off her quarter
	if ship != null and is_instance_valid(ship):
		_place()
	var p := pos
	var wh := world.water_height(p.x, p.z)
	# riding the swell: heave, pitch and roll from the surface round it
	var hx := world.water_height(p.x + fwd.x * 1.2, p.z + fwd.z * 1.2) - world.water_height(p.x - fwd.x * 1.2, p.z - fwd.z * 1.2)
	var hz := world.water_height(p.x + out.x * 0.8, p.z + out.z * 0.8) - world.water_height(p.x - out.x * 0.8, p.z - out.z * 0.8)
	var r := MathX.smooth(0.0, 1.0, minf(1.0, _rise * 1.08))
	var y := wh - 0.42 - (1.0 - r) * 3.4 + sin(_t * 1.7) * 0.05
	if not _splashed and _rise_to > 0.0 and _rise > 0.45:
		_splashed = true
		world.fx.splash(Vector3(p.x, wh, p.z), 1.6)
		world.wake.push(p.x, p.z, 3.2, -0.5)
		world.wake.stamp(p.x, p.z, 4.5, 0.9, true)
		if world.sound != null:
			world.sound.splash(0.5, 0.0)
		_ring_t = 0.0
		_ring_big = 0.7
		_flash = 1.2
	# the shake that builds while it charges
	var sh := _shake
	var jx := (sin(_t * 61.0) + sin(_t * 37.0)) * sh
	var jz := sin(_t * 53.0 + 1.0) * sh
	# its front to the camera's side of it: out to sea and astern
	var face := (out * 6.4 - fwd * 4.8).normalized()
	var yaw := atan2(face.x, face.z)
	# the swell's slope in the chest's own frame (x across its front, z out of it)
	var across := Vector3(face.z, 0.0, -face.x)
	var sx := (hx * fwd.dot(face) + hz * out.dot(face)) / 2.4
	var sz := (hx * fwd.dot(across) + hz * out.dot(across)) / 2.0
	var tilt := Vector3(atan(sx) * 0.6 + sin(_t * 43.0) * sh * 0.9, yaw, -atan(sz) * 0.6 + sin(_t * 47.0) * sh * 1.2)
	_chest.transform = Transform3D(Basis.from_euler(tilt, EULER_ORDER_YXZ), Vector3(p.x + jx, y + absf(sin(_t * 29.0)) * sh * 2.0, p.z + jz))
	# the lid: a springy hinge, rattling while it charges
	var want := _lid_to + (maxf(0.0, sin(_t * 23.0) * sin(_t * 9.0)) * _rattle if _rattle > 0.0 else 0.0)
	_lid_v += ((want - _lid_k) * 90.0 - _lid_v * 9.0) * dt
	_lid_k += _lid_v * dt
	_lid.transform = Transform3D(Basis(Vector3.RIGHT, -_lid_k), Vector3(0.0, H, -D * 0.5))

	# the light
	_col = _col.lerp(_col_to, minf(1.0, dt * 4.0))
	var c := _col
	_flash = maxf(0.0, _flash - dt * 2.6)
	_seam_amt += (_seam_to - _seam_amt) * minf(1.0, dt * 5.0)
	var open_k := MathX.smooth(0.0, 1.0, minf(1.0, _lid_k / 1.4)) if _open else 0.0
	_hush += ((1.0 if hushed else 0.0) - _hush) * minf(1.0, dt * 2.0)
	var quiet := 1.0 - _hush * 0.82
	var rest_beam := (0.9 + sin(_t * 2.2) * 0.12) * quiet if _open else 0.0
	_beam_amt += (rest_beam - _beam_amt) * minf(1.0, dt * 1.6)
	_rays_amt += ((0.75 * quiet if _open else 0.0) - _rays_amt) * minf(1.0, dt * 1.4)
	var glow_amt := ((0.55 + open_k * 0.35) * (0.4 + quiet * 0.6) if _open else 0.12 + _seam_amt * 0.25) * r + _flash * 0.9
	var m := mouth()
	var lc := _lin(c)
	_shine(_beam, m, lc, _beam_amt * r * 0.55)
	_shine(_rays, m - Vector3(0.0, 0.3, 0.0), lc, _rays_amt * open_k * 0.45)
	_rays.basis = _chest.basis
	_shine(_glow, m, lc, glow_amt)
	# shut, the glare backlights the chest so its outline stands against it;
	# open, it pours out of the mouth toward the camera
	_glow.material_override.set_shader_parameter("k", Vector4(2.6 + _flash * 1.8, 0.8 + _flash * 0.6, 0.6 + _flash * 0.5, 1.4 if _open else -1.1))
	# the seam: light leaking round the lid and out of the keyhole
	_shine(_seam, _chest.transform * Vector3(0.0, H - 0.05, D * 0.5 + 0.12), lc, (0.0 if _open else _seam_amt * 0.7 + 0.06) * r)
	_seam.material_override.set_shader_parameter("k", Vector4(0.9 + _seam_amt * 0.5, 1.2 + _seam_amt * 1.4, 0.4 + _seam_amt * 0.6, 0.6))
	# the gem in the lock and the hoard
	var gk := 0.7 + _seam_amt * 0.9 + _flash * 0.4 + (0.4 if _open else 0.0)
	_gem_mat.set_shader_parameter("glow", _peak(c * gk))
	var hk := 0.4 + open_k * 1.6 + _flash * 0.4
	hk = minf(hk, PEAK)
	_hoard_mat.set_shader_parameter("glow", Vector3(hk, hk, hk))
	# the shockwave across the water
	var rm: ShaderMaterial = _ring.material_override
	if _ring_t >= 0.0:
		_ring_t += dt
		var k := _ring_t / (0.9 + _ring_big * 0.3)
		if k >= 1.0:
			_ring_t = -1.0
		_ring.position = Vector3(p.x, wh, p.z)
		rm.set_shader_parameter("color", lc)
		rm.set_shader_parameter("k", Vector4(1.5 + (1.0 - (1.0 - k) * (1.0 - k)) * 16.0 * _ring_big, 0.0, 0.0, 0.0))
		rm.set_shader_parameter("amt", (1.0 - k) * (1.0 - k) * 1.3 if k < 1.0 else 0.0)
		_follow(rm)
	else:
		rm.set_shader_parameter("amt", 0.0)
	_ring.visible = _ring_t >= 0.0
	_particles(dt, m, c, r, wh)


## A light placed at `at`, its colour and how much of it shows.
func _shine(mi: MeshInstance3D, at: Vector3, col: Vector3, amt: float) -> void:
	mi.position = at
	mi.visible = amt > 0.002
	var mat: ShaderMaterial = mi.material_override
	mat.set_shader_parameter("color", col)
	mat.set_shader_parameter("amt", amt)


## The web's HDR glow brought under a phone's ceiling (no bloom there), its
## hue kept: the light effects add a fraction of it.
func _lin(c: Vector3) -> Vector3:
	return c * (PEAK / maxf(1.0, maxf(c.x, maxf(c.y, c.z))))


static func _peak(c: Vector3) -> Vector3:
	var m := maxf(c.x, maxf(c.y, c.z))
	return c * (PEAK / m) if m > PEAK else c


## The swell the ring rides, as the ocean draws it this frame.
func _follow(m: ShaderMaterial) -> void:
	m.set_shader_parameter("wave_a", world.waves.packed_a)
	m.set_shader_parameter("wave_b", world.waves.packed_b)
	if ocean != null:
		m.set_shader_parameter("grid_warp", ocean.grid_warp)
		m.set_shader_parameter("grid_origin", Vector2(ocean.position.x, ocean.position.z))
	var cam := get_viewport().get_camera_3d()
	if cam != null:
		m.set_shader_parameter("eye", cam.global_position)


# ------------------------------------------------------------------ sparks, coins and star shells


func _particles(dt: float, m: Vector3, c: Vector3, r: float, wh: float) -> void:
	var fx := world.fx
	if _burst_tier >= 0:
		var tier := _burst_tier
		_burst_tier = -1
		var tint := Color(c.x, c.y, c.z) * (0.5 / maxf(1.0, maxf(c.x, maxf(c.y, c.z)) * 0.5))
		fx.treasure(m - Vector3(0.0, 0.6, 0.0), tint, tier + 1)
		_coins(m, 30 + tier * 25, 1.0 + tier * 0.2)
		_spurt(30 + tier * 20, 1.6)
		world.wake.push(pos.x, pos.z, 2.6 + tier * 0.6, -0.35 - tier * 0.12)
		world.wake.stamp(pos.x, pos.z, 5.0 + tier * 2.0, 1.0, true)
		world.fx.splash(Vector3(pos.x, wh, pos.z), 0.6 + tier * 0.3)
	if _pulse_tier >= 0:
		var tier := _pulse_tier
		_pulse_tier = -1
		_spurt(8 + tier * 10, 1.0 + tier * 0.3)
		if tier >= 2:
			_coins(m, 8 + tier * 6, 0.8)
	for i in range(_fireworks.size() - 1, -1, -1):
		if _t < _fireworks[i].x:
			continue
		var tier := int(_fireworks[i].y)
		_fireworks.remove_at(i)
		_firework(tier)
	_spark_t -= dt
	if _spark_t <= 0.0 and r > 0.9:
		_spark_t = 0.05 if _open else (0.07 if _seam_amt > 0.1 else 0.4)
		if _open:
			# motes drifting up the column
			var a := randf() * TAU
			var rr := randf_range(0.1, 0.8)
			var mc := _hot(c, 1.4)
			fx.emit(m + Vector3(cos(a) * rr, randf_range(-0.2, 0.4), sin(a) * rr), Vector3(randf_range(-0.3, 0.3), randf_range(2.5, 6.0), randf_range(-0.3, 0.3)),
					randf_range(1.2, 2.4), randf_range(0.08, 0.2), 0.02, mc, mc, 0.0, 0.3, Particles.SPARK, 0.1, Vector2.ZERO, 0.0, true)
		elif _seam_amt > 0.1:
			_spurt(2, 0.5)
		else:
			# a glint off the gilding now and then
			fx.sparkle(_chest.transform * Vector3(randf_range(-W * 0.5, W * 0.5), randf_range(0.2, H + 0.5), D * 0.5 + 0.1), 0.35, Color(1.3, 1.0, 0.5))


## An HDR particle colour from the glow, `k` times as hot (opaque).
static func _hot(c: Vector3, k: float) -> Color:
	return Color(c.x * k, c.y * k, c.z * k, 1.0)


## Sparks squirting out of the seam (charging) or the mouth (open).
func _spurt(n: int, power: float) -> void:
	var xf := _chest.transform
	var c := _col
	for i in n:
		var p := xf * Vector3(randf_range(-W * 0.5, W * 0.5), H + 0.02, randf_range(-0.2, D * 0.5 + 0.1))
		var a := randf() * TAU
		var sp := randf_range(1.5, 5.0) * power
		var face := xf.basis.z
		var v := Vector3(cos(a) * sp * 0.6 + face.x * sp * 0.4, randf_range(2.0, 7.0) * power, sin(a) * sp * 0.6 + face.z * sp * 0.4)
		world.fx.emit(p, v, randf_range(0.35, 0.8), randf_range(0.05, 0.12), 0.02, _hot(c, 1.6), _hot(c, 0.4), 7.0, 1.2, Particles.SPARK, 0.001, Vector2.ZERO, 0.0, true)


## Gold coins thrown up out of the chest, tumbling back into the sea.
func _coins(at: Vector3, n: int, power: float) -> void:
	var face := _chest.transform.basis.z
	for i in n:
		var a := randf() * TAU
		var r := randf_range(0.5, 3.6) * power
		var s := randf_range(0.16, 0.26)
		world.fx.emit(at + Vector3(randf_range(-0.4, 0.4), 0.0, randf_range(-0.3, 0.3)),
				Vector3(cos(a) * r + face.x * 1.2, randf_range(6.0, 13.0) * power, sin(a) * r + face.z * 1.2),
				randf_range(1.1, 1.9), s, s, Color(5.5, 3.8, 1.1, 1.0), Color(3.0, 1.6, 0.3), 15.0, 0.35, Particles.CHUNK, 0.001, Vector2.ZERO, randf_range(-16.0, 16.0), true)


## Epic and legendary: a star shell bursting over the chest.
func _firework(tier: int) -> void:
	var top := mouth() + Vector3.UP * randf_range(9.0, 16.0) + fwd * randf_range(-5.0, 5.0) + out * randf_range(-2.0, 4.0)
	var base := TINTS[tier]
	var n := 46 if tier == 3 else 30
	var hue := randf()
	for i in n:
		# a sphere of sparks, some in the rarity's colour, some white-gold
		var u := randf() * 2.0 - 1.0
		var a := randf() * TAU
		var s := sqrt(1.0 - u * u)
		var sp := randf_range(5.0, 8.0)
		var col := Vector3(4.5, 3.6, 2.0) if i % 3 == 0 else (Vector3(base.x, base.y * 0.8 + 0.6, base.z + 1.0) if tier == 3 and hue > 0.5 else base)
		world.fx.emit(top, Vector3(cos(a) * s * sp, u * sp + 1.0, sin(a) * s * sp), randf_range(0.9, 1.5), randf_range(0.18, 0.32), 0.03,
				_hot(col, 1.5), _hot(col, 0.3), 4.0, 1.4, Particles.SPARK, 0.001, Vector2.ZERO, 0.0, true)
	world.fx.emit(top, Vector3.ZERO, 0.25, 3.0, 6.0, _hot(base, 1.2), Color(0.0, 0.0, 0.0), 0.0, 0.0, Particles.SOFT, 0.001, Vector2.ZERO, 0.0, true)
	quake.emit(0.08)
	if world.sound != null:
		world.sound.shell(0.18, 0.0, 40.0)


# ------------------------------------------------------------------ the camera


## A shot of it: [where the camera stands, what it looks at, its lens (deg)].
## `fit` widens it when the screen left free is narrow; `t` slowly turns the
## shots of her (home, charge, burst, cards, ship, guns).
func shot(kind: String, fit: float, t: float) -> Array:
	var s := ship
	var C := pos
	var o := out
	var f := fwd
	var eye := Vector3.ZERO
	var look := Vector3.ZERO
	var lens := 40.0
	match kind:
		"charge":
			eye = C + o * (4.4 * fit) - f * (3.1 * fit) + Vector3.UP * 1.7
			look = C + Vector3.UP * 0.85
			lens = 38.0
		"burst":
			eye = C + o * (10.5 * fit) - f * (7.5 * fit) + Vector3.UP * 2.4
			look = C + Vector3.UP * 3.2
			lens = 46.0
		"cards":
			eye = C + o * (9.0 * fit) - f * (6.5 * fit) + Vector3.UP * 4.5
			look = C + Vector3.UP * 2.4
			lens = 42.0
		"ship":
			var L := s.cls.length
			var mast_h := s.model.flag_pivot.global_position.y
			look = Vector3(s.pos.x, mast_h * 0.36, s.pos.z)
			var a := 0.62 + sin(t * 0.18) * 0.32
			var d := (L * 1.12 + 17.0) * fit
			var dir := o * cos(a) + f * sin(a)
			eye = look + dir * (d * 0.97) + Vector3.UP * (d * 0.2)
			lens = 36.0
		"guns":
			# off the bow quarter, low over the water, looking back down the
			# gunports as the broadside rolls out across the frame
			var L := s.cls.length
			var hb := s.cls.beam * 0.5
			var c0 := Vector3(s.pos.x, 0.0, s.pos.z)
			eye = c0 + o * (hb + 7.0 * fit) + f * (L * 0.75 * fit) + Vector3.UP * 3.4
			look = c0 + o * (hb + 5.5) - f * (L * 0.15) + Vector3.UP * 1.8
			lens = 50.0
		_:
			eye = C + o * (6.4 * fit) - f * (4.8 * fit) + Vector3.UP * (2.6 + fit * 0.4)
			look = C + Vector3.UP * 1.15 + f * 1.2 - o * 0.6
	eye.y = maxf(eye.y, 1.6)
	return [eye, look, lens]


## Which of her broadsides faces the chest and the open water (+1 port,
## -1 starboard), and a point out there to lay it on: [side, point].
func gun_side() -> Array:
	var s := ship
	var at := Vector3(s.pos.x, 0.0, s.pos.z) + out * 72.0 + fwd * 6.0
	return [1 if out.dot(s.port_dir()) >= 0.0 else -1, at]


## Where a point of the world sits on screen (units), and whether it's in
## front of the camera: the camera's own projection, slid frame and all
## (Camera3D.unproject_position ignores its frustum offset).
static func on_screen(cam: Camera3D, p: Vector3) -> Vector3:
	var vp := cam.get_viewport().get_visible_rect().size
	var v := cam.global_transform.affine_inverse() * p
	var c := cam.get_camera_projection() * Vector4(v.x, v.y, v.z, 1.0)
	if c.w <= 1e-4:
		return Vector3(vp.x * 0.5, vp.y * 0.55, 0.0)
	return Vector3((c.x / c.w * 0.5 + 0.5) * vp.x, (0.5 - c.y / c.w * 0.5) * vp.y, 1.0)


## The chest's mouth on screen (for the cards to fly out of).
func screen_point(cam: Camera3D) -> Vector2:
	var p := on_screen(cam, mouth())
	return Vector2(p.x, p.y)


## The chest's outline on screen (the tap target).
func screen_rect(cam: Camera3D) -> Rect2:
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	var xf := _chest.global_transform
	for i in 8:
		var q := on_screen(cam, xf * Vector3(W * 0.5 if i & 1 else -W * 0.5, H + D * 0.5 if i & 2 else 0.0, D * 0.5 if i & 4 else -D * 0.5))
		lo = lo.min(Vector2(q.x, q.y))
		hi = hi.max(Vector2(q.x, q.y))
	return Rect2(lo, hi - lo)
