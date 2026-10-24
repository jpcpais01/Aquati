class_name VaultStage
extends Node3D
## The Treasure Vault's stage (the web's vault stage): a great chest riding
## the swell off her seaward beam, drawn by the loot chests' own shader, its
## column of light climbing through the rarities as it charges and flaring
## when it bursts open, and the camera's shots of it all.

const LOOT := preload("res://shaders/loot.gdshader")
const BEACON := preload("res://shaders/loot_beacon.gdshader")
## How far off her beam it rides (m), and how big a chest it is.
const OFF := 11.0
const SIZE := 2.4

var world: World
## Which side of her it rides (1 port, -1 starboard) and where.
var side := 1
var at := Vector3.ZERO
var _chest: MultiMeshInstance3D
var _beacon: MultiMeshInstance3D
var _mat: ShaderMaterial
var _charge := 0.0
var _want := 0.0
var _tint := Color.WHITE
var _jump := 0.0


func _init(p_world: World) -> void:
	world = p_world
	visible = false
	_mat = ShaderMaterial.new()
	_mat.shader = LOOT
	_mat.set_shader_parameter("glow_gain", Loot.GLOW_GAIN)
	_chest = _one(Loot.build_meshes()[4], _mat)
	var bm := ShaderMaterial.new()
	bm.shader = BEACON
	_beacon = _one(Loot._beacon_mesh(), bm)


func _one(mesh: Mesh, mat: Material) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = 1
	# the shader places it on the swell itself
	mm.custom_aabb = AABB(Vector3(-1e5, -200.0, -1e5), Vector3(2e5, 400.0, 2e5))
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


## Up beside a ship, on the side with open water.
func show_by(s: Ship) -> void:
	var left := s.port_dir()
	var hl := world.ground_height(s.pos.x + left.x * 45.0, s.pos.z + left.z * 45.0)
	var hr := world.ground_height(s.pos.x - left.x * 45.0, s.pos.z - left.z * 45.0)
	side = 1 if hl <= hr else -1
	at = s.pos + left * (side * OFF) + Vector3(sin(s.heading), 0.0, cos(s.heading)) * 2.0
	at.y = 0.0
	_charge = 0.0
	_want = 0.0
	_jump = 0.0
	visible = true
	_pack()


func hide_stage() -> void:
	visible = false


## Its light climbs to a rarity's (0..3).
func charge(tier: int) -> void:
	_tint = Cosmetics.RARITIES[tier].css
	_want = 0.35 + 0.2 * tier
	world.fx.treasure(at + Vector3(0.0, 1.2, 0.0), _tint, mini(4, tier + 1))


## Bursts open: a leap, a flare and treasure flung high.
func burst(tier: int) -> void:
	_tint = Cosmetics.RARITIES[tier].css
	_want = 1.0
	_charge = 1.4
	_jump = 1.0
	for k in 2:
		world.fx.treasure(at + Vector3(0.0, 1.5, 0.0), _tint, mini(4, tier + 1 + k))


## Back to riding quietly, its light low.
func settle() -> void:
	_want = 0.12
	_tint = Color("#f1c35c")


func _process(dt: float) -> void:
	if not visible:
		return
	_charge = move_toward(_charge, _want, dt * 1.5)
	_jump = maxf(0.0, _jump - dt * 1.6)
	_pack()


# the loot shaders' packing (src/game/loot.gd). The chest: (scale, drifts,
# pulses), (bob phase, spin), -, (x, ride, z). Its beacon: its glow (linear
# HDR), (halo radius, beam height, phase), -, (x, drifts, z). Both: (born, life).
func _pack() -> void:
	var clock := fmod(world.time, Debris.CLOCK_WRAP)
	var hop := sin(_jump * PI) * 0.9
	var c := _chest.multimesh
	c.set_instance_transform(0, Transform3D(Basis(Vector3(SIZE * (1.0 + _charge * 0.06), 0.0, 1.0), Vector3(0.0, 0.35, 0.0), Vector3.ZERO),
			Vector3(at.x, 0.25 + hop, at.z)))
	c.set_instance_custom_data(0, Color(clock - 30.0, 1e6, 0.0, 0.0))
	var lin := _tint.srgb_to_linear()
	var glow := Vector3(lin.r, lin.g, lin.b) * (0.6 + _charge * 3.0)
	var b := _beacon.multimesh
	b.set_instance_transform(0, Transform3D(Basis(glow, Vector3(3.0 + _charge * 3.0, 6.0 + _charge * 16.0, 0.0), Vector3.ZERO), Vector3(at.x, 0.0, at.z)))
	b.set_instance_custom_data(0, Color(clock - 30.0, 1e6, 0.0, 0.0))


## The camera's shot: [where it stands, what it looks at] for home (her and
## the chest), charge, burst and cards (the chest low in the frame).
func shot(kind: String, s: Ship) -> Array[Vector3]:
	var mid := (s.pos + at) * 0.5
	var out := (at - s.pos).normalized()
	var along := Vector3(sin(s.heading), 0.0, cos(s.heading))
	match kind:
		"charge":
			return [at + out * 9.0 + along * 4.0 + Vector3(0.0, 4.0, 0.0), at + Vector3(0.0, 1.2, 0.0)]
		"burst":
			return [at + out * 7.0 + along * 2.0 + Vector3(0.0, 2.2, 0.0), at + Vector3(0.0, 2.0, 0.0)]
		"cards":
			return [at + out * 12.0 + Vector3(0.0, 9.0, 0.0), at + Vector3(0.0, 4.5, 0.0)]
	return [mid + out * 26.0 + along * 10.0 + Vector3(0.0, 10.0, 0.0), mid + Vector3(0.0, 2.0, 0.0)]
