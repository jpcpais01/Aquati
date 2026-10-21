class_name SailLever
extends Control
## The touch sail lever: four notches from Stop to Full that stay where you
## leave them, like W / S. Drag the knob or tap a notch; it clicks into each
## detent as it passes, and the rail fills as the hands actually set (or
## take in) the canvas.

signal level_set(level: int)

const LABELS := ["Stop", "Slow", "Half", "Full"]
const TRACK_W := 44.0

## The ordered notch (0..3) and the canvas really set (0..1).
var level := 0
var set_fraction := 0.0

var _touch := -1
var _drag := -1.0
var _font: Font


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(TRACK_W + 52.0, 210.0)
	size = custom_minimum_size
	_font = HudStyle.font("inter", 700, 1)


func _track() -> Rect2:
	return Rect2(Vector2.ZERO, Vector2(TRACK_W, size.y))


func _notch_y(n: float) -> float:
	var r := _track()
	var pad := TRACK_W * 0.5
	return r.end.y - pad - n / 3.0 * (r.size.y - pad * 2.0)


func _fraction_at(y: float) -> float:
	var r := _track()
	var pad := TRACK_W * 0.5
	return clampf((r.end.y - pad - y) / maxf(1.0, r.size.y - pad * 2.0), 0.0, 1.0)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and _touch < 0:
			_touch = event.index
			_move(event.position.y)
			accept_event()
		elif not event.pressed and event.index == _touch:
			_touch = -1
			_drag = -1.0
			queue_redraw()
			accept_event()
	elif event is InputEventScreenDrag and event.index == _touch:
		_move(event.position.y)
		accept_event()
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_touch = 99
			_move(event.position.y)
		else:
			_touch = -1
			_drag = -1.0
			queue_redraw()
		accept_event()
	elif event is InputEventMouseMotion and _touch == 99:
		_move(event.position.y)
		accept_event()


func _move(y: float) -> void:
	var f := _fraction_at(y)
	var n := roundi(f * 3.0)
	# magnetic notches: the knob leans toward the nearest detent rather than floating free
	_drag = n / 3.0 + (f - n / 3.0) * 0.4
	queue_redraw()
	if n != level:
		level = n
		level_set.emit(n)
		Input.vibrate_handheld(30 if n == 0 else 12)


func show_state(p_level: int, p_set: float) -> void:
	if p_level != level or absf(p_set - set_fraction) > 0.004:
		level = p_level
		set_fraction = p_set
		queue_redraw()


func _draw() -> void:
	var r := _track()
	var cx := r.get_center().x
	# the glass track
	var sb := HudStyle.panel(TRACK_W * 0.5)
	draw_style_box(sb, r)
	# the rail, filling with the canvas actually set
	var top := _notch_y(3.0)
	var bot := _notch_y(0.0)
	draw_line(Vector2(cx, bot), Vector2(cx, top), Color(1, 1, 1, 0.14), 4.0, true)
	var fill_y := lerpf(bot, top, set_fraction)
	if set_fraction > 0.005:
		draw_line(Vector2(cx, bot), Vector2(cx, fill_y), HudStyle.GOLD, 4.0, true)
	# the four notches and their names
	for i in 4:
		var y := _notch_y(i)
		var on := i <= level and level > 0
		draw_circle(Vector2(cx, y), 4.0, HudStyle.GOLD if on and i > 0 else Color(1, 1, 1, 0.3), true, -1.0, true)
		var col := HudStyle.INK if i == level else HudStyle.INK_3
		draw_string(_font, Vector2(r.end.x + 8.0, y + 4.0), LABELS[i].to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, 10, col)
	# the knob: a little sail, furled at Stop
	var kf := _drag if _drag >= 0.0 else level / 3.0
	var ky := lerpf(bot, top, kf)
	var kc := Vector2(cx, ky)
	draw_circle(kc, TRACK_W * 0.42, Color(0.96, 0.97, 0.98), true, -1.0, true)
	draw_circle(kc, TRACK_W * 0.42, Color(0, 0, 0, 0.2), false, 1.0, true)
	var ink := Color("#1f1404")
	draw_line(kc + Vector2(0, -11), kc + Vector2(0, 11), ink, 1.8, true)
	draw_line(kc + Vector2(-8, -7), kc + Vector2(8, -7), ink, 1.8, true)
	if level == 0:
		draw_rect(Rect2(kc + Vector2(-8, -8.2), Vector2(16, 2.6)), HudStyle.GOLD_LO)
	else:
		var h := 4.0 + 10.0 * level / 3.0
		var cloth := PackedVector2Array([kc + Vector2(-7.4, -6.4), kc + Vector2(7.4, -6.4), kc + Vector2(6.8, -6.4 + h), kc + Vector2(-6.8, -6.4 + h)])
		draw_colored_polygon(cloth, HudStyle.GOLD)
