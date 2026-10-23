class_name UiButton
extends UiBox
## A box that is a button: it squeezes under a finger (the web's :active) and
## is pressed when the finger lifts over it, unless it wandered off first (a
## drag that scrolls a sheet is never a tap). Touch and the mouse both work
## it, never twice for one tap (the engine sends a touch as a click too).
## It lets every touch carry on up to the screen it sits on, so a sheet it
## sits in can scroll under the same finger.

signal pressed
## Held down (true) or let go (false): for a look that answers the finger.
signal held(down: bool)

## A finger that moves further than this (units) is dragging, not tapping.
const SLOP := 14.0

## How far it squeezes while held (1: not at all).
var squeeze := 0.97
var enabled := true
var down := false
var _from := Vector2.ZERO
var _k := 1.0


func _init(sz: Vector2, radius: float, p_margin: float) -> void:
	super(sz, radius, p_margin)
	mouse_filter = Control.MOUSE_FILTER_PASS
	set_process(false)


func resize(sz: Vector2) -> void:
	super(sz)
	pivot_offset = sz * 0.5


## Lets go without pressing (the screen it's on is leaving).
func cancel() -> void:
	if down:
		down = false
		held.emit(false)
		set_process(true)


func _gui_input(event: InputEvent) -> void:
	var touch := event is InputEventScreenTouch
	var click: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION
	if touch or click:
		if event.pressed:
			if enabled:
				down = true
				_from = event.position
				held.emit(true)
				set_process(true)
		elif down:
			down = false
			held.emit(false)
			set_process(true)
			if Rect2(Vector2.ZERO, size).has_point(event.position):
				pressed.emit()
		return
	var moved := event is InputEventScreenDrag or (event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION)
	if moved and down and event.position.distance_to(_from) > SLOP:
		cancel()


func _process(dt: float) -> void:
	_k += ((squeeze if down else 1.0) - _k) * MathX.damp(30.0, dt)
	if not down and absf(_k - 1.0) < 0.002:
		_k = 1.0
		set_process(false)
	scale = Vector2(_k, _k)
