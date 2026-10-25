class_name Embers
extends MeshInstance3D
## Ember rain round the view (shaders/embers.gdshader): grey ash tumbling
## down with a glowing ember among every few flakes, in a fixed tile wrapped
## round the camera's target. More ash in the air just draws more of the
## buffer; with none it isn't drawn at all.

## Flakes by quality (low, medium, high).
const COUNT := [700, 1400, 2200]
## The clock wraps on this (s): at the wrap every flake just takes a fresh slot.
const CLOCK_WRAP := 3600.0

var _mat: ShaderMaterial
var _count := 0


## quality 0 low .. 2 high (Settings.quality).
func setup(quality: int) -> void:
	_count = COUNT[clampi(quality, 0, 2)]
	mesh = ZoomBox.quads(_count)
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/embers.gdshader")
	material_override = _mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	visible = false


## `amount` 0 .. 1 of ash in the air, round the camera's target `at`.
func update(amount: float, at: Vector3, time: float) -> void:
	var n := floori(_count * minf(1.0, amount * 1.15))
	visible = n > 0
	if not visible:
		return
	_mat.set_shader_parameter("now", fmod(time, CLOCK_WRAP))
	_mat.set_shader_parameter("flakes", n)
	_mat.set_shader_parameter("amount", amount)
	_mat.set_shader_parameter("center", Vector2(at.x, at.z))


## Flakes drawn now.
func drawn() -> int:
	return floori(_count * minf(1.0, float(_mat.get_shader_parameter("amount")) * 1.15)) if visible else 0
