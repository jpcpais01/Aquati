class_name Lightning
extends MeshInstance3D
## A storm's lightning (shaders/lightning.gdshader). Two kinds, as in the real
## thing: a strike from cloud to sea, a forked, jagged channel grown by
## midpoint displacement that flickers through several return strokes; and
## sheet lightning, the deck lit up from inside far off, no channel to be
## seen. Both feed one flash that the sky, the sea, the light on everything
## and the grade brighten with (Atmosphere.flash).

## A strike as it begins: where it came down, whether as a bolt, how hard.
class Strike:
	var x := 0.0
	var z := 0.0
	var bolt := false
	var power := 1.0


## The flash this frame (0 .. ~2).
var flash := 0.0
var _t := 0.0
## Seconds of full storm to the next strike.
var _timer := 9.0
## The return strokes of the strike under way: (when, how bright).
var _strokes: Array[Vector2] = []
var _bolt := false
var _mat: ShaderMaterial
var _mesh := ArrayMesh.new()
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/lightning.gdshader")
	mesh = _mesh
	material_override = _mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	visible = false


## Runs the storm's lightning for dt seconds, round the camera's target `at`
## (storm: 0 .. 1). Hands back a strike on the frame one begins.
func update(dt: float, storm: float, at: Vector3, cam: Camera3D) -> Strike:
	_t += dt
	# each return stroke leaps up and dies away fast
	var f := 0.0
	for s in _strokes:
		if _t >= s.x:
			f += s.y * exp(-(_t - s.x) * 16.0)
	if not _strokes.is_empty() and _t > _strokes[-1].x + 0.6:
		_strokes.clear()
	flash = f
	var glow := f if _bolt else 0.0
	visible = glow >= 0.01
	if visible:
		_mat.set_shader_parameter("bolt", minf(glow, 1.4))
	if storm < 0.3 or dt == 0.0:
		_timer = maxf(_timer, 4.0)
		return null
	_timer -= dt * storm
	if _timer > 0.0:
		return null
	# a storm at its height flashes every few seconds
	_timer = _rng.randf_range(3.0, 13.0)
	return strike(at, cam, _rng.randf() < 0.55)


## A strike now, round `at`: a bolt down to the sea, or sheet lightning far off.
func strike(at: Vector3, cam: Camera3D, bolt: bool) -> Strike:
	var st := Strike.new()
	st.bolt = bolt
	st.power = _rng.randf_range(0.6, 1.0)
	# out ahead of the lens, where a channel stays on screen
	var b := cam.global_basis
	var ahead := Vector2(-b.z.x, -b.z.z)
	if ahead.length() < 0.2:
		# looking straight down: the top of the screen is ahead
		ahead = Vector2(b.y.x, b.y.z)
	if ahead.length() < 1e-3:
		ahead = Vector2(0.0, -1.0)
	var a := ahead.angle() + _rng.randf_range(-0.9, 0.9)
	var d := _rng.randf_range(170.0, 560.0) if bolt else _rng.randf_range(500.0, 1400.0)
	st.x = at.x + cos(a) * d
	st.z = at.z + sin(a) * d
	_strokes.clear()
	var n := (2 + _rng.randi() % 3) if bolt else (1 + _rng.randi() % 2)
	var when := _t
	for i in n:
		_strokes.append(Vector2(when, (1.0 if bolt else 0.45) * st.power * (1.0 if i == 0 else _rng.randf_range(0.45, 0.9))))
		when += _rng.randf_range(0.05, 0.16)
	_bolt = bolt
	if bolt:
		_build(st.x, st.z, cam.global_position)
	return st


## Grows a forked channel from the cloud base down to the sea at (x, z), as
## ribbons turned to the eye.
func _build(x: float, z: float, eye: Vector3) -> void:
	var top := _rng.randf_range(330.0, 420.0)
	var main := _channel(Vector3(x + _rng.randf_range(-60.0, 60.0), top, z + _rng.randf_range(-60.0, 60.0)), Vector3(x, 0.0, z), 7, 0.55)
	var lines: Array[PackedVector3Array] = [main]
	for i in 2 + _rng.randi() % 3:
		var s := main[floori(_rng.randf_range(0.12, 0.6) * main.size())]
		var len := s.y * _rng.randf_range(0.25, 0.55)
		var ang := _rng.randf() * TAU
		lines.append(_channel(s, s + Vector3(cos(ang) * len * 0.7, -len, sin(ang) * len * 0.7), 5, 0.5))
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	for l in lines.size():
		var pts := lines[l]
		var n := pts.size()
		var wide := 2.2 if l == 0 else 1.0
		for i in n:
			var p := pts[i]
			var tan := pts[mini(n - 1, i + 1)] - pts[maxi(0, i - 1)]
			var v := p - eye
			var side := tan.cross(v).normalized()
			# a few pixels across whatever the range, thinning toward the tips
			var w := wide * maxf(1.0, v.length() * 0.004) * (0.55 + 0.45 * (1.0 - float(i) / n))
			var br := 1.0 if l == 0 else (1.0 - float(i) / n * 0.7) * 0.55
			if i < n - 1:
				var o := pos.size()
				idx.append_array([o, o + 1, o + 2, o + 1, o + 3, o + 2])
			pos.append(p - side * w)
			pos.append(p + side * w)
			uv.append(Vector2(-1.0, br))
			uv.append(Vector2(1.0, br))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_INDEX] = idx
	_mesh.clear_surfaces()
	_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)


## A jagged path from a to b by recursive midpoint displacement (2^depth segments).
func _channel(a: Vector3, b: Vector3, depth: int, rough: float) -> PackedVector3Array:
	var pts := PackedVector3Array([a, b])
	var amp := a.distance_to(b) * 0.18
	for d in depth:
		var out := PackedVector3Array()
		out.resize(pts.size() * 2 - 1)
		for i in pts.size() - 1:
			out[i * 2] = pts[i]
			out[i * 2 + 1] = (pts[i] + pts[i + 1]) * 0.5 + Vector3(_rng.randf_range(-amp, amp), _rng.randf_range(-amp, amp) * 0.25, _rng.randf_range(-amp, amp))
		out[-1] = pts[-1]
		pts = out
		amp *= rough
	return pts
