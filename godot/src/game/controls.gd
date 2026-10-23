class_name Controls
extends Node
## Keyboard, mouse and touch, folded into one small helm state.
##
## Keys: A / D or the arrows put the helm over, W / S (or up / down) set more
## or less canvas a notch at a time, Q and E fire the port and starboard
## broadsides and Space whichever suits, 1 to 5 load a kind of shot and R
## the next kind aboard, F comes alongside a quay, C cycles the camera, the wheel zooms. A click on the sea fires the side you point into, at what you
## point at. Touch: a drag that starts low on the left, where the thumb
## rests by the sail lever, is the helm (point where the bow should go: screen
## up is north, as the camera looks), the sail lever bottom left sets the
## canvas, the guns sit bottom right, two fingers anywhere pinch the zoom.

signal touch_seen

## The touch helm takes a finger that comes down left of this share of the
## screen's width and below this share of its height: the corner the left
## thumb rests in. Anywhere else a finger is free to pinch.
const HELM_ZONE := Vector2(0.36, 0.38)
## A second finger this soon after the helm's (s) turns the pair into a
## pinch: two fingers never land at quite the same instant.
const PINCH_GRACE := 0.3

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
## Pulses: a broadside called (+1 port, -1 starboard), the one-button fire,
## and a click on the sea (fire the side pointed into).
var fire_side := 0
var fire_auto := false
var fire_aim := false
## Pulses: a kind of shot picked by its key (Ammo, -1 none), and the next kind aboard.
var ammo_pick := -1
var ammo_cycle := false
## A skip (Space, Enter or a tap) while the farewell plays.
var skip := false
## A pulse: come alongside the quay she's off (F).
var interact := false
## The mouse over the sea (screen units), while there is one.
var pointer := Vector2.ZERO
var pointer_active := false
var touch := false

var _helm_id := -1
## When the helm finger went down (ms).
var _helm_ms := 0
var _touches := {}
var _pinch_d := -1.0

const _ACTIONS := {
	"helm_port": [KEY_A, KEY_LEFT],
	"helm_starboard": [KEY_D, KEY_RIGHT],
	"sail_more": [KEY_W, KEY_UP],
	"sail_less": [KEY_S, KEY_DOWN],
	"camera_view": [KEY_C, KEY_V],
	"fire_port": [KEY_Q],
	"fire_starboard": [KEY_E],
	"fire_auto": [KEY_SPACE],
	"ammo_next": [KEY_R],
	"ammo_1": [KEY_1, KEY_KP_1],
	"ammo_2": [KEY_2, KEY_KP_2],
	"ammo_3": [KEY_3, KEY_KP_3],
	"ammo_4": [KEY_4, KEY_KP_4],
	"ammo_5": [KEY_5, KEY_KP_5],
	"confirm": [KEY_ENTER, KEY_KP_ENTER],
	"interact": [KEY_F],
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
		elif event.is_action("fire_port"):
			fire_side = 1
		elif event.is_action("fire_starboard"):
			fire_side = -1
		elif event.is_action("fire_auto"):
			fire_auto = true
			skip = true
		elif event.is_action("confirm"):
			skip = true
		elif event.is_action("ammo_next"):
			ammo_cycle = true
		elif event.is_action("interact"):
			interact = true
		else:
			for i in Ammo.COUNT:
				if event.is_action("ammo_%d" % (i + 1)):
					ammo_pick = i
	elif event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION:
		pointer = event.position
		pointer_active = true
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION:
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom -= event.factor if event.factor > 0.0 else 1.0
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom += event.factor if event.factor > 0.0 else 1.0
		elif event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			pointer = event.position
			pointer_active = true
			fire_aim = true
			skip = true
	elif event is InputEventScreenTouch:
		_on_touch(event)
	elif event is InputEventScreenDrag:
		_on_drag(event)
	elif event is InputEventMagnifyGesture:
		zoom += (1.0 - event.factor) * 8.0


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_MOUSE_EXIT:
		pointer_active = false


func _on_touch(e: InputEventScreenTouch) -> void:
	if not touch:
		touch = true
		touch_seen.emit()
	# touch never leaves a stale pointer on the water
	pointer_active = false
	var vp := get_viewport().get_visible_rect().size
	if e.pressed:
		skip = true
		_touches[e.index] = e.position
		if _touches.size() == 1 and _helm_id < 0 and e.position.x < vp.x * HELM_ZONE.x and e.position.y > vp.y * HELM_ZONE.y:
			_helm_id = e.index
			_helm_ms = Time.get_ticks_msec()
			helm_origin = e.position
			helm_at = e.position
		elif _touches.size() == 2:
			# the other finger of a pinch, even if the first came down on the helm
			if _helm_id >= 0 and Time.get_ticks_msec() - _helm_ms < PINCH_GRACE * 1000.0:
				_helm_id = -1
				steering = false
			if _helm_id < 0:
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


## Lets go of everything held and pending: a screen came up over the helm,
## or the helm is someone else's to take now.
func reset() -> void:
	_touches.clear()
	_helm_id = -1
	steering = false
	_pinch_d = -1.0
	consume()


func consume() -> void:
	sail_delta = 0
	zoom = 0.0
	view_next = false
	fire_side = 0
	fire_auto = false
	fire_aim = false
	ammo_pick = -1
	ammo_cycle = false
	skip = false
	interact = false
