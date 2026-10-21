class_name Wind
extends RefCounted
## The breeze, and wind you can see: discrete gust puffs spawn upwind of the
## camera and roll across the sea. The ocean roughens into dark cat's paws
## under them, sails fill harder and a ship picks up a touch of way. One field
## feeds every effect, so they all agree on where the gust is.

const MAX_GUSTS := 8
## Puffs are stretched along the wind by this much.
const STRETCH := 1.8

var angle := 0.0
var dir_x := 0.0
var dir_z := 1.0
## 0 calm .. 1 a stiff breeze (storms go higher).
var strength := 0.6
## Weather scale on gust strength (1 = a normal breezy day).
var intensity := 1.0
## The breeze's run so far (heading integrated over time): textures scroll
## along it, so they keep flowing smoothly as the wind comes round.
var drift := Vector2.ZERO

var _gx := PackedFloat32Array()
var _gz := PackedFloat32Array()
var _age := PackedFloat32Array()
var _life := PackedFloat32Array()
var _radius := PackedFloat32Array()
var _str := PackedFloat32Array()
var _speed := PackedFloat32Array()
var _amp := PackedFloat32Array()
var _cx := 0.0
var _cz := 0.0
var _reach := 160.0
var _rng := RandomNumberGenerator.new()
## Shader copy: vec4(x, z, radius, amplitude) per puff.
var packed := PackedVector4Array()


func _init(start_angle: float = 0.6) -> void:
	_rng.seed = 1337
	set_angle(start_angle)
	for arr_name in ["_gx", "_gz", "_age", "_life", "_radius", "_str", "_speed", "_amp"]:
		var a: PackedFloat32Array = get(arr_name)
		a.resize(MAX_GUSTS)
		set(arr_name, a)
	packed.resize(MAX_GUSTS)
	for i in MAX_GUSTS:
		_spawn(i, true)


func set_angle(a: float) -> void:
	angle = a
	dir_x = sin(a)
	dir_z = cos(a)


func _spawn(i: int, scatter: bool) -> void:
	var r := _reach
	var along := _rng.randf_range(-1.1, 0.9) if scatter else _rng.randf_range(-1.35, -1.05)
	var across := _rng.randf_range(-1.0, 1.0)
	_gx[i] = _cx + dir_x * along * r - dir_z * across * r
	_gz[i] = _cz + dir_z * along * r + dir_x * across * r
	_speed[i] = _rng.randf_range(9.0, 15.0)
	_life[i] = r * 2.4 / _speed[i]
	_radius[i] = _rng.randf_range(16.0, 34.0)
	_str[i] = _rng.randf_range(0.55, 1.05)
	_age[i] = _rng.randf_range(0.0, _life[i] * 0.6) if scatter else 0.0
	_amp[i] = 0.0


func update(dt: float, cx: float, cz: float, reach: float) -> void:
	_cx = cx
	_cz = cz
	_reach = reach
	drift += Vector2(dir_x, dir_z) * dt
	for i in MAX_GUSTS:
		_age[i] += dt
		_gx[i] += dir_x * _speed[i] * dt
		_gz[i] += dir_z * _speed[i] * dt
		var dx := _gx[i] - cx
		var dz := _gz[i] - cz
		# respawn once spent, or once the camera has left it far behind
		if _age[i] > _life[i] or dx * dx + dz * dz > reach * reach * 4.0:
			_spawn(i, false)
		# swell in, hold, die away; plus a slow internal pulse
		var env := MathX.smooth(0.0, 2.2, _age[i]) * (1.0 - MathX.smooth(_life[i] - 3.0, _life[i], _age[i]))
		_amp[i] = _str[i] * intensity * env * (0.8 + 0.2 * sin(_age[i] * 1.7 + i))
		packed[i] = Vector4(_gx[i], _gz[i], _radius[i], _amp[i])


## Gust intensity at a point (0 calm .. ~1.4). Mirrors gust_at() in the shaders.
func gust_at(x: float, z: float) -> float:
	var s := 0.0
	var kk := 1.0 / STRETCH
	for i in MAX_GUSTS:
		var am := _amp[i]
		if am <= 0.0:
			continue
		var dx := x - _gx[i]
		var dz := z - _gz[i]
		var a := (dx * dir_x + dz * dir_z) * kk
		var b := -dx * dir_z + dz * dir_x
		var r := maxf(1.0 - (a * a + b * b) / (_radius[i] * _radius[i]), 0.0)
		s += am * r * r
	return minf(s, 1.4)
