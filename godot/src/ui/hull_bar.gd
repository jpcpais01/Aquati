class_name HullBar
extends Control
## A hull's health as a bar (shaders/ui_bar.gdshader): the fill eases to the
## hull's state, and a blow leaves a pale ghost of what was lost that holds a
## moment, then drains after it. Low, it turns red and pulses. Your own bar
## carries plank seams; the bars over enemy ships are slimmer and plain.

const TEAL := [Color("#22b8ad"), Color("#8ff2d7")]
const RED := [Color("#d8402f"), Color("#ff9d6a")]
## Below this share of her hull she is in danger.
const LOW := 0.35

var frac := 1.0
var _shown := 1.0
var _ghost := 1.0
var _hold := 0.0
var _low := false
var _t := 0.0
var _enemy := false
var _mat: ShaderMaterial


func _init(enemy: bool = false) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_enemy = enemy
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/ui_bar.gdshader")
	material = _mat
	if enemy:
		_mat.set_shader_parameter("seams", 0.0)
		_mat.set_shader_parameter("c_track", Color(0.016, 0.055, 0.078, 0.62))
		_mat.set_shader_parameter("c_rim", Color(1, 1, 1, 0.2))
		_mat.set_shader_parameter("c_ghost", Color(1.0, 0.94, 0.84, 0.0))
		_paint(RED)
	else:
		_paint(TEAL)


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED or what == NOTIFICATION_READY:
		_mat.set_shader_parameter("size", size)


func _paint(c: Array) -> void:
	_mat.set_shader_parameter("c_left", c[0])
	_mat.set_shader_parameter("c_right", c[1])


## The hull's share left (0..1). A drop leaves the ghost behind for a moment.
func set_frac(f: float, snap: bool = false) -> void:
	f = clampf(f, 0.0, 1.0)
	if snap:
		frac = f
		_shown = f
		_ghost = f
		_push()
		return
	if f < frac - 1e-4:
		_hold = 0.35
	frac = f


func _process(dt: float) -> void:
	_t += dt
	var was_shown := _shown
	var was_ghost := _ghost
	_shown += (frac - _shown) * MathX.damp(14.0, dt)
	if frac > _ghost:
		_ghost = frac
	elif _hold > 0.0:
		_hold -= dt
	else:
		_ghost += (frac - _ghost) * MathX.damp(4.5, dt)
	var low := frac < LOW
	if low != _low:
		_low = low
		if not _enemy:
			_paint(RED if low else TEAL)
	if absf(_shown - was_shown) > 1e-4 or absf(_ghost - was_ghost) > 1e-4 or _low:
		_push()


func _push() -> void:
	_mat.set_shader_parameter("fill", _shown)
	_mat.set_shader_parameter("ghost", _ghost)
	# low: the whole bar breathes brighter once a second
	_mat.set_shader_parameter("flare", (0.5 - 0.5 * cos(_t * TAU)) if _low else 0.0)


func _draw() -> void:
	# one quad the shader paints
	draw_rect(Rect2(Vector2.ZERO, size), Color.WHITE)
