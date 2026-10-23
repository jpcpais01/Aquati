class_name UiBox
extends Control
## A rounded box drawn by shaders/ui_box.gdshader in one quad, with room
## round it for its shadow and glow: the web game's glass panels and gold
## buttons. Set the look with p(param, value); resize() keeps the quad round it.

const BOX := preload("res://shaders/ui_box.gdshader")

var mat: ShaderMaterial
var margin := 0.0


func _init(sz: Vector2, radius: float, p_margin: float) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin = p_margin
	mat = ShaderMaterial.new()
	mat.shader = BOX
	material = mat
	p("radius", radius)
	resize(sz)


func resize(sz: Vector2) -> void:
	size = sz
	p("quad", sz + Vector2(margin, margin) * 2.0)
	p("at", Vector2(margin, margin))
	p("box", sz)
	queue_redraw()


func p(param: String, value: Variant) -> UiBox:
	mat.set_shader_parameter(param, value)
	return self


func _draw() -> void:
	draw_rect(Rect2(-Vector2(margin, margin), size + Vector2(margin, margin) * 2.0), Color.WHITE)
