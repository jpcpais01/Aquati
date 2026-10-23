class_name ShotDisc
extends Control
## A round of shot's disc on the HUD, one quad the shader paints
## (shaders/shot_disc.gdshader): the touch shot button, a chip of the fan
## round it, or a ball of the desktop rack with its reload halves. Its
## uniforms are only written when what they show changes.

enum Style { GLASS, RACK }

## Room round the disc for its shadow, its glow and the focus ring.
const MARGIN := 50.0

var _mat: ShaderMaterial
var _vals := {}


func _init(d: float, style: Style) -> void:
	custom_minimum_size = Vector2(d, d)
	size = custom_minimum_size
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/shot_disc.gdshader")
	_mat.set_shader_parameter("quad", size + Vector2(MARGIN, MARGIN) * 2.0)
	_mat.set_shader_parameter("radius", d * 0.5)
	_mat.set_shader_parameter("style", float(style))
	material = _mat


## Sets one of the shader's uniforms, if it isn't already that.
func put(key: StringName, v: Variant) -> void:
	if _vals.get(key) != v:
		_vals[key] = v
		_mat.set_shader_parameter(key, v)


func _draw() -> void:
	draw_rect(Rect2(-Vector2(MARGIN, MARGIN), size + Vector2(MARGIN, MARGIN) * 2.0), Color.WHITE)
