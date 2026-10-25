class_name HullBar
extends Control
## A hull's health as a bar (shaders/ui_bar.gdshader): the fill eases to the
## hull's state, and a blow leaves a pale ghost of what was lost that holds a
## moment, then drains after it. Low, it turns red and pulses. Your own bar
## carries plank seams; the bars over enemy ships are slimmer and plain, with
## little marks beside them for what special shot has done to her (a
## flickering flame, torn canvas, a gun crew struck through), and while she
## burns the bar itself smoulders.

const TEAL := [Color("#22b8ad"), Color("#8ff2d7")]
const RED := [Color("#d8402f"), Color("#ff9d6a")]
## Below this share of her hull she is in danger.
const LOW := 0.35
## An enemy bar's marks: their size, and the room before and between them (units).
const MARK := 13.0 * HudStyle.PX
const MARK_GAP := 5.0 * HudStyle.PX
const MARK_STEP := 2.0 * HudStyle.PX

var frac := 1.0
var _shown := 1.0
var _ghost := 1.0
var _hold := 0.0
var _low := false
var _t := 0.0
var _enemy := false
## The bar's colours while she's whole (TEAL, or a tint()).
var _hi: Array = TEAL
var _mat: ShaderMaterial
## Flame, torn canvas, thinned crews (enemy bars only), and which show.
var _marks: Array[TextureRect] = []
var _shown_marks := -1


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
		for id: String in ["flame", "torn", "crew"]:
			var m := TextureRect.new()
			m.texture = Icons.mark(id, MARK)
			m.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			m.size = Vector2(MARK, MARK)
			m.pivot_offset = m.size * 0.5
			m.mouse_filter = Control.MOUSE_FILTER_IGNORE
			m.visible = false
			add_child(m)
			_marks.append(m)
	else:
		_paint(TEAL)


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED or what == NOTIFICATION_READY:
		_mat.set_shader_parameter("size", size)


## Its colours while healthy (left, right), and whether it shows plank seams.
func tint(c: Array, seams := true) -> void:
	_hi = c
	_mat.set_shader_parameter("seams", 1.0 if seams else 0.0)
	_paint(RED if _low and not _enemy else c)


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


## What special shot has done to her: ablaze (the bar smoulders and a flame
## flickers beside it), her canvas shredded, her gun crews cut down.
func show_marks(afire: bool, torn: bool, crew: bool) -> void:
	var bits := (1 if afire else 0) | (2 if torn else 0) | (4 if crew else 0)
	if bits == _shown_marks:
		return
	_shown_marks = bits
	var x := size.x + MARK_GAP
	for i in 3:
		var m := _marks[i]
		m.visible = bits & (1 << i) != 0
		if m.visible:
			m.position = Vector2(x, (size.y - MARK) * 0.5)
			x += MARK + MARK_STEP
	_mat.set_shader_parameter("smoulder", 1.0 if afire else 0.0)


func _process(dt: float) -> void:
	_t += dt
	if _shown_marks > 0 and _shown_marks & 1 != 0:
		# the flame flickers: up a hair, a size larger and brighter, and back, every second
		var f := 0.5 - 0.5 * cos(_t * TAU)
		var m := _marks[0]
		m.scale = Vector2.ONE * (1.0 + 0.15 * f)
		m.position.y = (size.y - MARK) * 0.5 - f * HudStyle.PX
		m.self_modulate = Color(1.0 + 0.3 * f, 1.0 + 0.15 * f, 1.0)
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
			_paint(RED if low else _hi)
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
