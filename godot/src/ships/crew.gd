class_name Crew
extends Node3D
## Every crew afloat (the web game's CrewSystem): a ShipCrew comes aboard
## each new ship, those over the side when she's gone swim on as orphans,
## and each frame the sailors in the picture are drawn, the cut of the
## sculpt picked by how big they stand on screen: the full one within a few
## metres of the lens, the far one, the distant cut and, once a metre is a
## few pixels, the speck. A crew too far off to matter is left alone; one out
## of the picture (and whose shadows are too) thinks every third frame in
## bigger steps, and one made only of specks every other frame.

## A metre is under this many pixels (of the screen's shorter side, see
## Flora.screen_lines) once a sailor is drawn as a speck.
const SPECK_PX := 16.0
## The full sculpt (fingers, lashes, laces) only this close (m).
const NEAR_DIST := 26.0

var view: CrewView
## Phones: one deck hand fewer per ship.
var lean := false
## Ship -> ShipCrew.
var _crews := {}
var _orphans: Array[Sailor] = []
var _free := PackedInt32Array()
var _planes: Array[Plane] = []
var _shadow := Vector3.DOWN
var _eye := Vector3.ZERO
var _near2 := 0.0
var _distant2 := 0.0
var _speck2 := 0.0


func _init() -> void:
	lean = Settings.mobile and Settings.quality != Settings.Quality.HIGH
	view = CrewView.new()
	view.name = "View"
	add_child(view)
	for i in range(CrewView.ROWS - 1, -1, -1):
		_free.append(i)


func _take_row(look: CrewLook) -> int:
	if _free.is_empty():
		return -1
	var row := _free[_free.size() - 1]
	_free.resize(_free.size() - 1)
	view.set_row(row, look.slots)
	return row


func _release(sl: Sailor) -> void:
	if sl.row >= 0:
		_free.append(sl.row)
		sl.row = -1


## A fresh voyage: every crew and swimmer gone.
func clear() -> void:
	for c: ShipCrew in _crews.values():
		for sl in c.sailors:
			_release(sl)
	for sl in _orphans:
		_release(sl)
	_crews.clear()
	_orphans.clear()
	view.begin()
	view.end()


## A ship's crew (null until she has one).
func of(ship: Ship) -> ShipCrew:
	return _crews.get(ship)


## Sailors afloat (aboard and over the side) and how many crews.
func counts() -> Vector2i:
	var n := _orphans.size()
	for c: ShipCrew in _crews.values():
		n += c.sailors.size()
	return Vector2i(n, _crews.size())


## A frame of every crew: `focus` and `view_r` the sea that matters, the
## camera to pick the cuts and cull by, `to_light` the way to the sun (or moon).
func update(dt: float, world: World, camera: Camera3D, focus: Vector3, view_r: float, to_light: Vector3) -> void:
	# crews come aboard new ships, and are cast adrift when a ship is gone
	for s in world.ships:
		if not s.removed and not _crews.has(s):
			_crews[s] = ShipCrew.new(s, _take_row, lean)
	for s: Variant in _crews.keys():
		if is_instance_valid(s) and not (s as Ship).removed and world.ships.has(s):
			continue
		var c: ShipCrew = _crews[s]
		for sl in c.sailors:
			if sl.mode == Sailor.Mode.AIR or sl.mode == Sailor.Mode.SWIM:
				_orphans.append(sl)
			else:
				_release(sl)
		_crews.erase(s)

	var th := tan(deg_to_rad(camera.fov * 0.5))
	_near2 = NEAR_DIST * NEAR_DIST
	# the distant cut past 50 m (further through a long lens)...
	_distant2 = pow(50.0 * tan(deg_to_rad(15.0)) / th, 2.0)
	# ...and a speck once a metre is under SPECK_PX pixels
	var speck := Flora.screen_lines() / (2.0 * th * SPECK_PX)
	_speck2 = speck * speck
	_eye = camera.global_position
	_planes = camera.get_frustum()
	# a sailor's shadow falls this way, about two metres per metre of height at the lowest sun
	_shadow = -to_light / maxf(to_light.y, 0.22)

	view.begin()
	for s: Ship in _crews:
		var c: ShipCrew = _crews[s]
		var p := s.position
		if Vector2(p.x - focus.x, p.z - focus.z).length() > view_r + c.L:
			continue
		var seen := _ship_in_view(s)
		var reach := speck + c.L * 0.6
		var stride := 3 if seen == 0 else (2 if _eye.distance_squared_to(p) > reach * reach else 1)
		if dt > 0.0:
			c.lag += dt
			c.skipped += 1
			if c.skipped >= stride:
				c.update(minf(c.lag, 0.1), world)
				c.lag = 0.0
				c.skipped = 0
		if seen == 0:
			continue
		for sl in c.sailors:
			if sl.mode == Sailor.Mode.ABOARD:
				_emit(sl, c.matrix_of(sl), seen == 2)
			elif sl.mode != Sailor.Mode.GONE:
				_emit(sl, CrewBrain.loose_xf(sl), false)
	for i in range(_orphans.size() - 1, -1, -1):
		var sl := _orphans[i]
		if dt > 0.0:
			CrewBrain.step_loose(sl, dt, world)
		if sl.mode == Sailor.Mode.GONE:
			_release(sl)
			_orphans.remove_at(i)
			continue
		_emit(sl, CrewBrain.loose_xf(sl), false)
	view.end()


func _emit(sl: Sailor, xf: Transform3D, inside: bool) -> void:
	var o := xf.origin
	if not inside and not _in_view(o):
		return
	var d2 := _eye.distance_squared_to(o)
	var level := CrewModel.FAR
	if d2 < _near2:
		level = CrewModel.NEAR
	elif d2 > _speck2:
		level = CrewModel.SPECK
	elif d2 > _distant2:
		level = CrewModel.DISTANT
	view.push(xf, sl.pose, level, sl.look.hat, sl.prop, sl.kit)


## 0 outside the frustum, 1 across its edge, 2 wholly inside.
func _sphere(c: Vector3, r: float) -> int:
	var inside := true
	for pl in _planes:
		var d := pl.distance_to(c)
		if d > r:
			return 0
		if d > -r:
			inside = false
	return 2 if inside else 1


## Whether a sailor standing at `o`, or the shadow he casts, is in the picture.
func _in_view(o: Vector3) -> bool:
	for k in 5:
		var t := k * 0.5
		if _sphere(Vector3(o.x + _shadow.x * t, o.y + 0.9 + _shadow.y * t, o.z + _shadow.z * t), 1.6) > 0:
			return true
	return false


## Whether any of a ship's deck, or the shadows her crew cast, is in the
## picture (0 no, 1 some, 2 her whole deck: no sailor aboard needs a look).
func _ship_in_view(s: Ship) -> int:
	var r := s.cls.length * 0.6 + 6.0
	var p := s.position + Vector3(0.0, 3.0, 0.0)
	var deck := _sphere(p, r)
	if deck == 2:
		return 2
	if deck == 1 or _sphere(p + _shadow * 6.0, r) > 0:
		return 1
	return 0
