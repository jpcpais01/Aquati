class_name Rain
extends MeshInstance3D
## Rain round the view (shaders/rain.gdshader): one static buffer of drop
## quads, every drop's fall, streak and splash worked out on the GPU from its
## own number and the clock. Heavier rain just draws more of the buffer, so a
## drizzle costs a fraction of a storm, and with none falling it isn't drawn.

## Drops by quality (low, medium, high).
const COUNT := [2400, 4800, 7200]
## The longest cycle a drop runs (s): the tile only resizes between drops' lives.
const MAX_CYCLE := 1.9
## The clock wraps on this (s), a whole number of no drop's cycle in particular:
## at the wrap every drop just takes a fresh slot.
const CLOCK_WRAP := 3600.0

var _world: World
var _mat: ShaderMaterial
var _box := ZoomBox.new(MAX_CYCLE)
var _count := 0


func setup(world: World) -> void:
	_world = world
	_count = COUNT[Settings.quality]
	mesh = ZoomBox.quads(_count)
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/rain.gdshader")
	material_override = _mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	visible = false


## The archipelago whose seabed damps the swell the drops splash on.
func set_region(r: Region) -> void:
	_mat.set_shader_parameter("seabed_tex", r.height_tex)
	_mat.set_shader_parameter("seabed_rect", r.height_rect())
	_mat.set_shader_parameter("has_seabed", 1.0)


## amount 0 dry .. 1 a downpour, round (cx, cz) seen from cam_dist away; the
## wind slants the drops.
func update(amount: float, at: Vector3, cam_dist: float, ocean: Ocean, eye: Vector3) -> void:
	var n := floori(_count * minf(1.0, amount * 1.1))
	visible = n > 0
	if not visible:
		return
	var w := _world.wind
	var now := fmod(_world.time, CLOCK_WRAP)
	var m := _mat
	m.set_shader_parameter("now", now)
	m.set_shader_parameter("drops", n)
	m.set_shader_parameter("amount", amount)
	m.set_shader_parameter("center", Vector2(at.x, at.z))
	# tall enough that the nearest drops stream right past the lens
	_box.update(Vector2(clampf(cam_dist * 0.8, 50.0, 230.0), clampf(cam_dist * 0.62, 30.0, 160.0)), now, m)
	var slant := 3.0 + w.strength * 7.0
	m.set_shader_parameter("fall", Vector2(w.dir_x, w.dir_z) * slant)
	m.set_shader_parameter("scale", 1.0 + amount * 0.3)
	m.set_shader_parameter("wave_a", _world.waves.packed_a)
	m.set_shader_parameter("wave_b", _world.waves.packed_b)
	m.set_shader_parameter("grid_warp", ocean.grid_warp)
	m.set_shader_parameter("grid_origin", Vector2(ocean.position.x, ocean.position.z))
	m.set_shader_parameter("eye", eye)
