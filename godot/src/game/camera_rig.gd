class_name CameraRig
extends Camera3D
## The near-top-down follow camera: a diorama view that steepens as you zoom
## out, a velocity look-ahead, a critically damped zoom spring, trauma shake,
## and past the farthest zoom a cinematic lean toward the horizon. Ported
## from the web game's src/game/cameraRig.ts.

## Cinematic tilt at its fullest (radians above the horizon), and close in.
const CINE_PITCH := 0.74
const CINE_PITCH_NEAR := 0.6
## How long a zoom must rest against its stop before a fresh push tilts.
const TILT_GATE := 0.2
const NEAR_DIST := 70.0
const FAR_DIST := 300.0

## What the camera looks at, on the water.
var target := Vector3.ZERO
## 0 close .. 1 far.
var zoom := 0.45
## Past the farthest zoom: 0 the usual high view .. 1 leaned over.
var tilt := 0.0
var shake_scale := 1.0

var _focus := Vector3.ZERO
var _zoom_smooth := 0.45
var _zoom_vel := 0.0
var _tilt_smooth := 0.0
var _pushed_at := -1e9
var _tilt_open := false
var _tilt_dir := 1.0
var _trauma := 0.0


func _ready() -> void:
	fov = 30.0
	near = 2.0
	far = 2600.0


## Wheel or pinch (positive = out). Out at the stop, a push that has rested
## TILT_GATE seconds tips the camera toward the horizon, or straightens it up.
func zoom_by(d: float, now: float) -> void:
	var step := d * 0.06
	if step < 0.0:
		zoom = maxf(0.0, zoom + step)
		return
	if zoom < 1.0:
		zoom = minf(1.0, zoom + step)
		if zoom >= 1.0:
			_pushed_at = now
		return
	if not _tilt_open:
		var rested := now - _pushed_at >= TILT_GATE
		_pushed_at = now
		if not rested:
			return
		_tilt_open = true
		_tilt_dir = -1.0 if tilt >= 0.5 else 1.0
	tilt = clampf(tilt + step * 1.6 * _tilt_dir, 0.0, 1.0)
	if tilt <= 0.0 or tilt >= 1.0:
		_tilt_open = false
		_pushed_at = now


## The zoom button's stops: close, mid, far, far leaned over.
const VIEWS := [[0.12, 0.0], [0.48, 0.0], [1.0, 0.0], [1.0, 1.0]]


func view_index() -> int:
	if tilt > 0.5:
		return 3
	var best := 0
	for i in 3:
		if absf(VIEWS[i][0] - zoom) < absf(VIEWS[best][0] - zoom):
			best = i
	return best


func set_view(z: float, t: float) -> void:
	zoom = clampf(z, 0.0, 1.0)
	tilt = clampf(t, 0.0, 1.0)
	_tilt_open = false


func next_view() -> void:
	var v: Array = VIEWS[(view_index() + 1) % VIEWS.size()]
	set_view(v[0], v[1])


func tilt_blend() -> float:
	return MathX.smoother(_tilt_smooth)


## How far the camera hangs from what it follows (drives shadow reach, sound and fx radii).
func distance() -> float:
	var z := _zoom_smooth * _zoom_smooth * 0.6 + _zoom_smooth * 0.4
	return lerpf(NEAR_DIST, FAR_DIST, z)


## Visible half-extent of the sea round the focus.
func ground_radius() -> float:
	return clampf(distance() * 0.75, 70.0, 260.0)


func shake(a: float) -> void:
	_trauma = minf(1.2, _trauma + a * shake_scale)


func snap_to(p: Vector3) -> void:
	_focus = p
	target = p


func update_rig(dt: float, follow: Vector3, vel: Vector3, time: float) -> void:
	# a critically damped spring, not a plain lag: the spring carries its speed
	# from notch to notch and glides instead of zooming in surges
	var zw := 8.0
	var zx := _zoom_smooth - zoom
	var ze := exp(-zw * dt)
	var zt := (_zoom_vel + zw * zx) * dt
	_zoom_vel = (_zoom_vel - zw * zt) * ze
	_zoom_smooth = zoom + (zx + zt) * ze
	# a slow, weighty swing, like a crane shot settling
	_tilt_smooth += (tilt - _tilt_smooth) * MathX.damp(2.2, dt)

	var look := Vector3(vel.x, 0.0, vel.z) * lerpf(1.4, 3.0, _zoom_smooth)
	_focus = _focus.lerp(follow + look, MathX.damp(2.2, dt))
	target = _focus

	# camera due south of the focus, looking north and down
	var pitch := lerpf(lerpf(0.91, 1.1, _zoom_smooth), lerpf(CINE_PITCH_NEAR, CINE_PITCH, _zoom_smooth), tilt_blend())
	var dist := distance()
	var pos := _focus + Vector3(0.0, sin(pitch) * dist, cos(pitch) * dist)

	# trauma shake, squared for a punchy falloff
	_trauma = maxf(0.0, _trauma - dt * 1.6)
	var s := _trauma * _trauma
	if s > 0.0:
		var k := s * (0.6 + _zoom_smooth)
		pos += Vector3((sin(time * 47.0) + sin(time * 31.0)) * k * 0.6, sin(time * 53.0) * k * 0.5, sin(time * 41.0 + 1.0) * k * 0.6)
	global_transform = Transform3D(Basis.looking_at(_focus - pos, Vector3.UP), pos)
	fov = 30.0
	# the near plane rides up with the camera: a far view keeps its depth precision
	near = clampf(pos.y * 0.08, 2.0, 30.0)
	far = 2600.0
