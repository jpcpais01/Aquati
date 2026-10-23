class_name Spindrift
extends MeshInstance3D
## Spindrift (shaders/spindrift.gdshader): in a blow the wind tears the tops
## off the breaking crests and flings them downwind as sheets of spray. Like
## the rain, one static buffer of sheets animated entirely on the GPU, only
## as much of it drawn as the blow calls for, and none at all in fair weather.

## Sheets by quality (low, medium, high).
const COUNT := [140, 260, 400]
## The longest cycle a sheet runs (s): the tile only resizes between sheets' lives.
const MAX_CYCLE := 3.8
## The clock wraps on this (s): at the wrap every sheet just takes a fresh slot.
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
	_mat.shader = preload("res://shaders/spindrift.gdshader")
	material_override = _mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	visible = false


## amount 0 none .. 1 a full gale, round the camera's target `at` seen from
## cam_dist away.
func update(amount: float, at: Vector3, cam_dist: float) -> void:
	var n := ceili(_count * minf(1.0, amount * 1.4)) if amount > 0.01 else 0
	visible = n > 0
	if not visible:
		return
	var now := fmod(_world.time, CLOCK_WRAP)
	var m := _mat
	m.set_shader_parameter("now", now)
	m.set_shader_parameter("sheets", n)
	m.set_shader_parameter("amount", minf(1.0, amount))
	m.set_shader_parameter("center", Vector2(at.x, at.z))
	_box.update(Vector2(clampf(cam_dist * 0.8, 50.0, 230.0), 0.0), now, m)
	m.set_shader_parameter("speed", 8.0 + _world.wind.strength * 7.0)
	m.set_shader_parameter("wave_a", _world.waves.packed_a)
	m.set_shader_parameter("wave_b", _world.waves.packed_b)
	m.set_shader_parameter("gusts", _world.wind.packed)
