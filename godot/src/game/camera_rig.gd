class_name CameraRig
extends Camera3D
## The near-top-down follow camera: a diorama view that steepens as you zoom
## out, a velocity look-ahead, a critically damped zoom spring, trauma shake,
## and past the farthest zoom a cinematic lean toward the horizon. In the
## harbour it circles the ship at anchor instead, low and slow, and swings
## down into the follow view as she sets sail; tied up at a trading port it
## holds the town's shot of her alongside the quay, and at the Shipwright
## glides from the orbit to whatever the open tab is about (and back into
## the orbit when it's done). Ported from the web game's src/game/cameraRig.ts.

## Cinematic tilt at its fullest (radians above the horizon), and close in.
const CINE_PITCH := 0.74
const CINE_PITCH_NEAR := 0.6
## How long a zoom must rest against its stop before a fresh push leans it over.
const TILT_GATE := 0.2
const NEAR_DIST := 70.0
const FAR_DIST := 270.0
## The lens (vertical degrees), the web's at sea, and circling the harbour.
const FOV := 34.0
const ORBIT_FOV := 30.0
## How long the camera takes to swing off a shot back into the orbit (s).
const BACK := 1.2

## What the camera looks at, on the water.
var target := Vector3.ZERO
## 0 close .. 1 far.
var zoom := 0.45
## Past the farthest zoom: 0 the usual high view .. 1 leaned over.
var tilt := 0.0
var shake_scale := 1.0
## The lens in use (vertical degrees): a set piece may narrow it for a close-up.
var lens := FOV
## A shot the camera blends toward (her farewell): where it stands, what it
## looks at and its lens, and how far blended (0 off .. 1 all the shot).
var cine_pos := Vector3.ZERO
var cine_look := Vector3.ZERO
var cine_fov := FOV
var cine_w := 0.0
## The harbour's orbit: on while the menu is up. It pulls in as close as fits
## every corner of her bounds (bowsprit, masts and trucks too) into the part of
## the screen the menu leaves free, and slides the frame across so she sits in
## the middle of it. `orbit_box` is her bounds in her own frame (her
## waterline amidships, bow along +z), `orbit_xf` where that frame stands
## (put once she's at anchor, its height riding the swell), and
## `orbit_frame` the free space: where its middle is, as a share of the
## screen from the centre (x, y), and how much of it is free (z, w), as
## Harbour.framing() gives it.
var orbit := false
var orbit_box := AABB(Vector3(-4.0, -1.5, -12.0), Vector3(8.0, 21.5, 24.0))
var orbit_xf := Transform3D.IDENTITY
var orbit_frame := Vector4(0.0, 0.0, 1.0, 1.0)
## How far round her the orbit has come (radians; it creeps on at 0.06 a second).
var orbit_angle := 0.6
## Tied up at a trading port: the camera glides after a shot of her and the
## quay (where it stands, what it looks at, its lens, and how briskly it
## chases them), framed in the space the market's panel leaves free
## (`port_frame`, as orbit_frame).
var port := false
## Ashore: a close, lower third-person frame over the captain's shoulder (the
## web's foot view), eased in and out; north stays up.
var foot := false
## Ground height under the camera ashore, so it never dips into a hillside.
var ground := Callable()
var _ft := 0.0
var shot_pos := Vector3.ZERO
var shot_look := Vector3.ZERO
var shot_fov := 38.0
var shot_pace := 1.0
var port_frame := Vector4(0.0, 0.0, 1.0, 1.0)

var _focus := Vector3.ZERO
var _zoom_smooth := 0.45
var _zoom_vel := 0.0
var _tilt_smooth := 0.0
var _pushed_at := -1e9
var _trauma := 0.0
var _pitch := 1.0
## 0 circling the harbour .. 1 following, eased; and how far the orbit stands off.
var _blend := 1.0
var _b := 1.0
var _orbit_dist := 0.0
## The frame slid across (shares of the screen), easing after orbit_frame.
var _shift := Vector2.ZERO
## The port shot as it glides: where the camera is, what it looks at and its lens.
var _cur_pos := Vector3.ZERO
var _cur_look := Vector3.ZERO
var _cur_fov := 38.0
## What the camera looked at last frame (a shot starts from it).
var _look := Vector3.ZERO
## Off a shot and back into the orbit: where it was and its lens when it
## left the shot, and how far it still has to swing (1 .. 0, over BACK s).
var _back_pos := Vector3.ZERO
var _back_look := Vector3.ZERO
var _back_fov := FOV
var _back_k := 0.0


func _ready() -> void:
	fov = lens
	near = 2.0
	far = 2600.0


## Wheel or pinch (positive = out). Out at the farthest zoom, a fresh push
## (one that has rested TILT_GATE seconds against the stop) leans the camera
## over toward the horizon, and there it stays however far you push on. In,
## it straightens up first, then closes in: one track out and back.
func zoom_by(d: float, now: float) -> void:
	var step := d * 0.06
	if foot:
		zoom = clampf(zoom + step, 0.0, 1.0)
		return
	if step < 0.0:
		if tilt > 0.0:
			tilt = maxf(0.0, tilt + step * 1.6)
		else:
			zoom = maxf(0.0, zoom + step)
		return
	if zoom < 1.0:
		zoom = minf(1.0, zoom + step)
		if zoom >= 1.0:
			_pushed_at = now
		return
	if tilt <= 0.0:
		# still pushing in the same breath: hold at the stop
		var rested := now - _pushed_at >= TILT_GATE
		_pushed_at = now
		if not rested:
			return
	tilt = minf(1.0, tilt + step * 1.6)


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


func next_view() -> void:
	var v: Array = VIEWS[(view_index() + 1) % VIEWS.size()]
	set_view(v[0], v[1])


func tilt_blend() -> float:
	return MathX.smoother(_tilt_smooth) * (1.0 - foot_blend())


## 0 at sea .. 1 ashore, eased.
func foot_blend() -> float:
	return _ft * _ft * (3.0 - 2.0 * _ft)


## Cut straight to (or away from) the frame ashore, behind the veil.
func snap_foot() -> void:
	_ft = 1.0 if foot else 0.0


## How far the camera hangs from what it follows (drives shadow reach, sound
## and fx radii): circling the harbour, how far it stands off her.
func distance() -> float:
	if port:
		return _cur_pos.distance_to(_cur_look)
	return lerpf(_orbit_dist, _follow_distance(), _b) if _b < 1.0 else _follow_distance()


func _follow_distance() -> float:
	var z := _zoom_smooth * _zoom_smooth * 0.6 + _zoom_smooth * 0.4
	return lerpf(lerpf(NEAR_DIST, FAR_DIST, z), lerpf(13.0, 46.0, z), foot_blend())


## Visible half-extent of the sea round the focus.
func ground_radius() -> float:
	if port:
		return 62.0
	return clampf(distance() * 0.75, 70.0, 260.0)


## How far (m) from the lens the sun's shadows need to reach: as far as the
## ground in view runs, and no further than the web game's shadow square round
## the focus (the ground radius in 16 m steps), past which it draws none.
func shadow_reach() -> float:
	if port:
		# her, the quay and the town behind it
		return distance() + 70.0
	var dist := _follow_distance()
	var h := sin(_pitch) * dist
	var r := minf(260.0, ceilf(clampf(dist * 0.75, 70.0, 260.0) / 16.0) * 16.0)
	var reach := Vector2(cos(_pitch) * dist + r, h).length()
	var top := _pitch - deg_to_rad(FOV * 0.5)
	if top > 0.05:
		reach = minf(reach, h / sin(top) * 1.05)
	# circling the harbour the shadows only need to reach a little past her
	return lerpf(_orbit_dist + 60.0, reach, _b) if _b < 1.0 else reach


func shake(a: float) -> void:
	_trauma = minf(1.2, _trauma + a * shake_scale)


func snap_to(p: Vector3) -> void:
	_focus = p
	target = p


## Straight into the orbit, as if it had been circling all along (the game's
## first frame in the harbour).
func orbit_snap() -> void:
	orbit = true
	_blend = 0.0
	_b = 0.0
	_orbit_dist = 0.0
	_shift = Vector2(orbit_frame.x, orbit_frame.y)


## Straight onto the port shot (behind the veil, coming alongside).
func snap_shot() -> void:
	_cur_pos = shot_pos
	_cur_look = shot_look
	_cur_fov = shot_fov
	_shift = Vector2(port_frame.x, port_frame.y)


## Onto a shot from wherever the camera is (the Shipwright, from the orbit):
## it glides there rather than cutting.
func begin_shot() -> void:
	_cur_pos = global_position
	_cur_look = _look
	_cur_fov = fov
	_back_k = 0.0
	port = true


## Off the shot and back into the orbit, swinging round into it from where
## the shot left the camera (the orbit takes up the shot's side of her).
func leave_shot() -> void:
	if not port:
		return
	port = false
	_back_pos = _cur_pos
	_back_look = _cur_look
	_back_fov = fov
	_back_k = 1.0
	var off := _cur_pos - orbit_xf * orbit_box.get_center()
	orbit_angle = atan2(off.x, off.z)


func update_rig(dt: float, follow: Vector3, vel: Vector3, time: float) -> void:
	if port:
		_port_shot(dt, time)
		return
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
	_ft = clampf(_ft + (dt if foot else -dt) / 0.9, 0.0, 1.0)
	var fb := foot_blend()

	var ahead := Vector3(vel.x, 0.0, vel.z) * lerpf(lerpf(1.4, 3.0, _zoom_smooth), 0.45, fb)
	_focus = _focus.lerp(follow + ahead, MathX.damp(2.2, dt))
	target = _focus

	# camera due south of the focus, looking north and down
	# (ashore it sits lower, more over the shoulder than overhead)
	var pitch := lerpf(lerpf(lerpf(0.91, 1.1, _zoom_smooth), lerpf(CINE_PITCH_NEAR, CINE_PITCH, _zoom_smooth), tilt_blend()), lerpf(0.62, 0.98, _zoom_smooth), fb)
	_pitch = pitch
	var dist := _follow_distance()
	var pos := _focus + Vector3(0.0, sin(pitch) * dist, cos(pitch) * dist)
	if fb > 0.0 and ground.is_valid():
		pos.y = maxf(pos.y, float(ground.call(pos.x, pos.z)) + 2.2)
	var look := _focus
	# the harbour's orbit, and the swing between it and the follow view
	_blend += ((0.0 if orbit else 1.0) - _blend) * MathX.damp(3.0 if orbit else 1.4, dt)
	if not orbit and _blend > 0.9995:
		_blend = 1.0
	_b = MathX.smooth(0.0, 1.0, _blend)
	orbit_angle += dt * 0.06
	var lens_now := lens
	if _b < 1.0:
		var aim := _orbit_pose(dt)
		var op := aim + Vector3(sin(orbit_angle) * 1.6, 0.62, cos(orbit_angle) * 1.6).normalized() * _orbit_dist
		op.y += sin(time * 0.2) * 1.2
		pos = op.lerp(pos, _b)
		look = aim.lerp(look, _b)
		lens_now = lerpf(ORBIT_FOV, lens, _b)
	if _back_k > 0.0:
		# off a shot: from where it left the camera into the view it goes back to
		_back_k = maxf(0.0, _back_k - dt / BACK)
		var k := MathX.smoother(1.0 - _back_k)
		pos = _back_pos.lerp(pos, k)
		look = _back_look.lerp(look, k)
		lens_now = lerpf(_back_fov, lens_now, k)
	if cine_w > 0.0:
		# whatever the camera follows now, blended toward the shot and its subject
		pos = pos.lerp(cine_pos, cine_w)
		look = look.lerp(cine_look, cine_w)
		target = target.lerp(Vector3(cine_look.x, 0.0, cine_look.z), cine_w)

	# trauma shake, squared for a punchy falloff
	_trauma = maxf(0.0, _trauma - dt * 1.6)
	var s := _trauma * _trauma
	if s > 0.0:
		var k := s * (0.6 + _zoom_smooth) * (1.0 - cine_w * 0.5)
		pos += Vector3((sin(time * 47.0) + sin(time * 31.0)) * k * 0.6, sin(time * 53.0) * k * 0.5, sin(time * 41.0 + 1.0) * k * 0.6)
	_look = look
	global_transform = Transform3D(Basis.looking_at(look - pos, Vector3.UP), pos)
	fov = lerpf(lens_now, cine_fov, cine_w)
	# the near plane rides up with the camera: a far view keeps its depth precision
	# (ashore the lens is a few metres off the captain: the near plane comes in with it)
	near = lerpf(clampf(pos.y * 0.08, 2.0, 30.0), 0.5, fb)
	far = 2600.0
	_slide_frame(dt)


func _port_shot(dt: float, time: float) -> void:
	_cur_pos = _cur_pos.lerp(shot_pos, MathX.damp(2.4 * shot_pace, dt))
	_cur_look = _cur_look.lerp(shot_look, MathX.damp(3.0 * shot_pace, dt))
	_cur_fov = lerpf(_cur_fov, shot_fov, MathX.damp(3.0 * shot_pace, dt))
	_look = _cur_look
	var pos := _cur_pos
	_trauma = maxf(0.0, _trauma - dt * 1.6)
	var s := _trauma * _trauma
	if s > 0.0:
		pos += Vector3((sin(time * 47.0) + sin(time * 31.0)) * s * 0.12, sin(time * 53.0) * s * 0.1, sin(time * 41.0 + 1.0) * s * 0.12)
	global_transform = Transform3D(Basis.looking_at(_cur_look - pos, Vector3.UP), pos)
	target = Vector3(_cur_look.x, 0.0, _cur_look.z)
	_focus = target
	fov = _cur_fov
	near = 2.0
	far = 2600.0
	_slide_frame(dt)


## Where the orbit looks this frame (her bounds' middle), its distance eased
## toward the closest that fits every corner of them into the free space.
func _orbit_pose(dt: float) -> Vector3:
	var vp := get_viewport().get_visible_rect().size
	var tv := tan(deg_to_rad(ORBIT_FOV * 0.5))
	var tan_v := tv * maxf(0.15, orbit_frame.w) * 0.94
	var tan_h := tv * vp.x / maxf(1.0, vp.y) * maxf(0.15, orbit_frame.z) * 0.94
	var mid := orbit_box.get_center()
	var b := orbit_xf.basis
	var dir := Vector3(sin(orbit_angle) * 1.6, 0.62, cos(orbit_angle) * 1.6).normalized()
	var right := (-dir).cross(Vector3.UP).normalized()
	var up := right.cross(-dir)
	var want := 10.0
	for i in 8:
		var q := b * (orbit_box.get_endpoint(i) - mid)
		var z := q.dot(dir)
		want = maxf(want, maxf(z + absf(q.dot(right)) / tan_h, z + absf(q.dot(up)) / tan_v))
	_orbit_dist = want if _orbit_dist <= 0.0 else _orbit_dist + (want - _orbit_dist) * MathX.damp(2.5, dt)
	return orbit_xf.origin + b * mid


## Slides the frame so she sits in the space the menu leaves free (an
## off-centre frustum, the web's setViewOffset); it eases out as the camera
## swings down into the follow view.
func _slide_frame(dt: float) -> void:
	var want := Vector2(port_frame.x, port_frame.y) if port else Vector2(orbit_frame.x, orbit_frame.y) * (1.0 - _b)
	_shift += (want - _shift) * MathX.damp(6.0 if port else 2.5, dt)
	if absf(_shift.x) + absf(_shift.y) < 1e-4:
		_shift = Vector2.ZERO
		if projection != PROJECTION_PERSPECTIVE:
			projection = PROJECTION_PERSPECTIVE
		return
	var vp := get_viewport().get_visible_rect().size
	var h := 2.0 * near * tan(deg_to_rad(fov * 0.5))
	projection = PROJECTION_FRUSTUM
	size = h
	frustum_offset = Vector2(-_shift.x * h * vp.x / maxf(1.0, vp.y), _shift.y * h)
