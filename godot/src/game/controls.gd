class_name Controls
extends Node
## Keyboard, mouse and touch, folded into one small helm state.
##
## Keys: A / D or the arrows put the helm over, W / S (or up / down) set more
## or less canvas a notch at a time, C cycles the camera, the wheel zooms.
## Touch: a drag anywhere on the left of the screen is the helm (point where
## the bow should go: screen up is north, as the camera looks), the sail
## lever on the right sets the canvas, two fingers pinch the zoom.

signal touch_seen

## -1 starboard .. +1 port (keys).
var rudder := 0.0
## The touch helm: the world heading to put the bow on, while a finger is down.
var steer_heading := 0.0
var steering := false
## Where the helm finger went down and where it is (screen pixels), for the ring.
var helm_origin := Vector2.ZERO
var helm_at := Vector2.ZERO
## Pulses, cleared by consume().
var sail_delta := 0
var zoom := 0.0
var view_next := false
var touch := false

var _helm_id := -1
var _touches := {}
var _pinch_d := -1.0

const _ACTIONS := {
	"helm_port": [KEY_A, KEY_LEFT],
	"helm_starboard": [KEY_D, KEY_RIGHT],
	"sail_more": [KEY_W, KEY_UP],
	"sail_less": [KEY_S, KEY_DOWN],
	"camera_view": [KEY_C, KEY_V],
}


func _ready() -> void:
	touch = DisplayServer.is_touchscreen_available() and Settings.mobile
	for action: String in _ACTIONS:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for key: Key in _ACTIONS[action]:
			var ev := InputEventKey.new()
			ev.physical_keycode = key
			InputMap.action_add_event(action, ev)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.is_action("sail_more"):
			sail_delta += 1
		elif event.is_action("sail_less"):
			sail_delta -= 1
		elif event.is_action("camera_view"):
			view_next = true
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION:
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom -= event.factor if event.factor > 0.0 else 1.0
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom += event.factor if event.factor > 0.0 else 1.0
	elif event is InputEventScreenTouch:
		_on_touch(event)
	elif event is InputEventScreenDrag:
		_on_drag(event)
	elif event is InputEventMagnifyGesture:
		zoom += (1.0 - event.factor) * 8.0


func _on_touch(e: InputEventScreenTouch) -> void:
	if not touch:
		touch = true
		touch_seen.emit()
	var w := get_viewport().get_visible_rect().size.x
	if e.pressed:
		_touches[e.index] = e.position
		if _helm_id < 0 and e.position.x < w * 0.55 and _touches.size() == 1:
			_helm_id = e.index
			helm_origin = e.position
			helm_at = e.position
		elif _touches.size() == 2 and _helm_id < 0:
			_pinch_d = _pinch_distance()
	else:
		_touches.erase(e.index)
		if e.index == _helm_id:
			_helm_id = -1
			steering = false
		if _touches.size() < 2:
			_pinch_d = -1.0


func _on_drag(e: InputEventScreenDrag) -> void:
	_touches[e.index] = e.position
	if e.index == _helm_id:
		helm_at = e.position
		var d := e.position - helm_origin
		# a little dead zone, then the bow follows the finger's bearing
		if d.length() > 8.0:
			steer_heading = atan2(d.x, d.y)
			steering = true
	elif _pinch_d > 0.0 and _touches.size() == 2:
		var nd := _pinch_distance()
		zoom += (_pinch_d - nd) / 40.0
		_pinch_d = nd


func _pinch_distance() -> float:
	var pts: Array = _touches.values()
	return (pts[0] as Vector2).distance_to(pts[1])


## Reads the held keys; call once a frame before using the state.
func poll() -> void:
	rudder = Input.get_action_strength("helm_port") - Input.get_action_strength("helm_starboard")


func helm_down() -> bool:
	return _helm_id >= 0


func consume() -> void:
	sail_delta = 0
	zoom = 0.0
	view_next = false
