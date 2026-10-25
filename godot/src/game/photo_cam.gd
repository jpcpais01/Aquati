class_name PhotoCam
extends RefCounted
## Photo mode's free camera (the web game's game/photoCam.ts). One pose
## drives both modes: a pivot, a heading (yaw), a pitch and a distance, the
## camera `dist` metres back from the pivot along its view. Orbit swings the
## camera round the pivot; fly turns the view about the camera itself and
## drags the pivot along in front of it, so switching between them never
## jumps. Every control moves the wanted pose and the camera eases after it,
## which reads as a steady, weighted dolly.

const PITCH_MIN := -1.5
const PITCH_MAX := 1.25
const DIST_MIN := 3.0
const DIST_MAX := 520.0

var fly := false
## The wanted pose.
var pivot := Vector3.ZERO
var yaw := 0.0
var pitch := -0.9
var dist := 80.0
var fov := 40.0
var roll := 0.0
var home_fov := 40.0
## The camera may roam this far from the anchor (her ship).
var anchor := Vector3.ZERO
var range_m := 900.0
## Height of whatever the camera must stay above at (x, z): island or sea.
var ground := func(_x: float, _z: float) -> float: return 0.0

# the eased pose the camera actually shows
var _sp := Vector3.ZERO
var _yaw := 0.0
var _pitch := 0.0
var _dist := 80.0
var _fov := 40.0
var _roll := 0.0
var _home := {}


## The view's direction for a heading and pitch (a camera looks down -z).
static func forward(p_yaw: float, p_pitch: float) -> Vector3:
	var c := cos(p_pitch)
	return Vector3(-sin(p_yaw) * c, sin(p_pitch), -cos(p_yaw) * c)


## Takes over from wherever the game's camera is, aiming at the sea (or the
## ship) it looks at.
func begin(cam: Camera3D, pivot_y: float) -> void:
	var d := -cam.global_basis.z
	pitch = clampf(asin(clampf(d.y, -1.0, 1.0)), PITCH_MIN, PITCH_MAX)
	yaw = atan2(-d.x, -d.z)
	# the pivot lands where the view meets the sea, or a little way ahead
	var at := (cam.global_position.y - pivot_y) / -d.y if d.y < -0.08 else 40.0
	dist = clampf(at, DIST_MIN, DIST_MAX)
	pivot = cam.global_position + d * dist
	fov = clampf(cam.fov, 15.0, 100.0)
	home_fov = fov
	roll = 0.0
	_home = {"pivot": pivot, "yaw": yaw, "pitch": pitch, "dist": dist}
	_snap()


## Back to the shot photo mode opened on.
func reset() -> void:
	if _home.is_empty():
		return
	pivot = _home.pivot
	yaw = _home.yaw
	pitch = _home.pitch
	dist = _home.dist
	fov = home_fov
	roll = 0.0


func _snap() -> void:
	_sp = pivot
	_yaw = yaw
	_pitch = pitch
	_dist = dist
	_fov = fov
	_roll = roll


## Where the camera stands for the wanted pose.
func _eye() -> Vector3:
	return pivot - forward(yaw, pitch) * dist


## A drag of (dx, dy) pixels: orbit round the pivot, or turn the head in flight.
func rotate(dx: float, dy: float) -> void:
	var k := 0.0052 * clampf(fov / 45.0, 0.35, 1.4)
	if fly:
		var eye := _eye()
		yaw -= dx * k
		pitch = clampf(pitch - dy * k, PITCH_MIN, PITCH_MAX)
		pivot = eye + forward(yaw, pitch) * dist
	else:
		yaw -= dx * k
		pitch = clampf(pitch - dy * k, PITCH_MIN, PITCH_MAX)


## Slides the scene under a finger: (dx, dy) pixels on a screen `h` pixels tall.
func pan(dx: float, dy: float, h: float) -> void:
	var m := dist * 2.0 * tan(deg_to_rad(fov * 0.5)) / maxf(1.0, h)
	var r := Vector3(cos(yaw), 0.0, -sin(yaw))
	var ahead := Vector3(-sin(yaw), 0.0, -cos(yaw))
	# looking straight down a drag maps onto the sea; looking out it lifts the view
	var down := clampf(-sin(pitch), 0.0, 1.0)
	pivot += r * (-dx * m) + ahead * (dy * m * down)
	pivot.y += dy * m * (1.0 - down)


## Wheel or pinch: > 1 pulls back. Orbit changes the distance, flight dollies along the view.
func zoom(f: float) -> void:
	if not fly:
		dist = clampf(dist * f, DIST_MIN, DIST_MAX)
		return
	pivot -= forward(yaw, pitch) * (maxf(4.0, dist * 0.6) * log(f))


## Keys: x strafe, y rise, z forward, each -1..1; `fast` triples the pace.
func move(dt: float, x: float, y: float, z: float, fast: bool) -> void:
	if x == 0.0 and y == 0.0 and z == 0.0:
		return
	var v := clampf(dist * 0.9, 8.0, 220.0) * (3.0 if fast else 1.0) * dt
	var r := Vector3(cos(yaw), 0.0, -sin(yaw))
	var ahead := forward(yaw, pitch) if fly else Vector3(-sin(yaw), 0.0, -cos(yaw))
	pivot += r * (x * v) + ahead * (z * v)
	pivot.y += y * v


## Keeps the wanted pose above the sea and the isles, and within reach of her.
func _constrain() -> void:
	var dx := pivot.x - anchor.x
	var dz := pivot.z - anchor.z
	var r := sqrt(dx * dx + dz * dz)
	if r > range_m:
		pivot.x = anchor.x + dx / r * range_m
		pivot.z = anchor.z + dz / r * range_m
	pivot.y = clampf(pivot.y, -6.0, 600.0)
	var eye := _eye()
	var floor_y: float = ground.call(eye.x, eye.z)
	if eye.y >= floor_y:
		return
	if not fly:
		# slide down the dome until the lens skims the surface
		var s := clampf((pivot.y - floor_y) / dist, -1.0, 1.0)
		pitch = clampf(minf(pitch, asin(s)), PITCH_MIN, PITCH_MAX)
		var e2 := _eye()
		var f2: float = ground.call(e2.x, e2.z)
		if e2.y < f2:
			pivot.y += f2 - e2.y
	else:
		pivot.y += floor_y - eye.y


## Eases the shown pose toward the wanted one and places the camera.
func update(dt: float, cam: Camera3D) -> void:
	_constrain()
	var k := MathX.damp(9.0, dt)
	_sp = _sp.lerp(pivot, k)
	_yaw += (yaw - _yaw) * k
	_pitch += (pitch - _pitch) * k
	_dist += (dist - _dist) * k
	_fov += (fov - _fov) * MathX.damp(12.0, dt)
	_roll += (roll - _roll) * MathX.damp(12.0, dt)
	var pos := _sp - forward(_yaw, _pitch) * _dist
	# the eased path can cut a corner through a wave crest: never show the inside
	var floor_y: float = ground.call(pos.x, pos.z)
	pos.y = maxf(pos.y, floor_y)
	cam.projection = Camera3D.PROJECTION_PERSPECTIVE
	cam.global_transform = Transform3D(Basis.from_euler(Vector3(_pitch, _yaw, deg_to_rad(_roll)), EULER_ORDER_YXZ), pos)
	cam.fov = _fov
	cam.near = clampf((pos.y - floor_y) * 0.05, 0.1, 6.0)
	cam.far = 3600.0


## The eased pivot (what the shadows and the sea centre on), and how far back the camera is.
func focus_point() -> Vector3:
	return _sp


func shown_dist() -> float:
	return _dist
