class_name Mirage
extends MeshInstance3D
## A mirage on a scorching noon (the web game's fx/mirage.ts): a little
## island that isn't there. A dune of pale sand, three leaning palms and a
## tiny domed shrine float a few metres over the sea, with their own image
## hanging upside down beneath them (shaders/mirage.gdshader does the
## breathing, the sliding air and the shimmer). Sail into it and it parts
## round the hull like a curtain and frays away. One mesh, built once,
## moved wherever the heat conjures the next one.

## The ship has sailed into it (once).
signal entered

## True while one is out there.
var active := false
var x := 0.0
var z := 0.0
## Its radius on the water (m).
var size := 24.0

var _t := 0.0
var _fade := 0.0
var _passed := false
var _mat: ShaderMaterial
var _mir := Vector4.ZERO


func _init() -> void:
	mesh = build()
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/mirage.gdshader")
	material_override = _mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	extra_cull_margin = 2.0
	visible = false


## Conjures one at (px, pz), `p_size` metres across the dune.
func spawn(px: float, pz: float, p_size: float, yaw: float) -> void:
	active = true
	x = px
	z = pz
	size = p_size
	_t = 0.0
	_fade = 0.0
	_passed = false
	position = Vector3(px, 0.0, pz)
	rotation = Vector3(0.0, yaw, 0.0)
	scale = Vector3.ONE * p_size
	_mir = Vector4(0.0, 0.0, 0.0, randf() * 50.0)
	visible = true


## `heat` 0..1 keeps it alive; the ship at (sx, sz) parts it and, once
## through, lets it go. `time` is the world's clock.
func update(dt: float, sx: float, sz: float, heat: float, time: float) -> void:
	if not active:
		return
	_t += dt
	var d := Vector2(sx - x, sz - z).length()
	if not _passed and d < size * 0.7:
		_passed = true
		entered.emit()
	# it lingers a minute at most, and frays away once you're through it
	var gone := _t > 75.0 or heat < 0.35 or (_passed and d > size * 2.2)
	var want := 0.0 if gone else 1.0
	_fade += (want - _fade) * (1.0 - exp(-dt / (2.2 if want > 0.0 else 1.6)))
	if gone and _fade < 0.01:
		clear()
		return
	var near := MathX.smooth(size * 0.6, size * 3.0, d)
	_mir.x = _fade * (0.55 + 0.45 * near)
	_mir.y = 1.0 + 1.6 * (1.0 - near) + (1.0 - _fade) * 2.0
	_mir.z = 0.2 + 0.8 * _fade * _fade * _fade * (_fade * (_fade * 6.0 - 15.0) + 10.0)
	_mat.set_shader_parameter("mir", _mir)
	_mat.set_shader_parameter("part_at", Vector3(sx, sz, 16.0))
	_mat.set_shader_parameter("now", fmod(time, 3600.0))


func clear() -> void:
	active = false
	visible = false


# ------------------------------------------------------------------ the island

## The island and its inverted image, a unit across (the node scales it up):
## COLOR.r carries the part (0 sand, .25 trunk, .5 frond, .75 column, 1 gilt)
## and COLOR.g 1 for the image hanging upside down.
static func build() -> ArrayMesh:
	var pos := PackedVector3Array()
	var nrm := PackedVector3Array()
	var part := PackedFloat32Array()
	# the dune: a low, lopsided mound
	var prof := [Vector2(0.0, 0.2), Vector2(0.22, 0.2), Vector2(0.45, 0.16), Vector2(0.68, 0.1), Vector2(0.86, 0.045), Vector2(1.0, 0.012), Vector2(1.06, 0.0)]
	_grid(pos, nrm, part, 0, 28, prof.size() - 1, func(u: float, v: float) -> Vector3:
		var i := int(v * (prof.size() - 1) + 0.5)
		var pp: Vector2 = prof[i]
		var ph := u * TAU
		var px := pp.x * sin(ph)
		var pz := pp.x * cos(ph)
		var a := atan2(pz, px)
		var k := 1.0 + 0.16 * sin(a * 2.0 + 0.6) + 0.07 * sin(a * 5.0 + 1.9)
		return Vector3(px * k * 1.15, pp.y * (1.0 + 0.35 * sin(a + 0.4)), pz * k * 0.9))
	# the palms, leaning out from the crown of the dune
	for palm: Array in [[-0.18, 0.05, 0.62, 0.5, -0.5], [0.05, -0.12, 0.74, -0.35, 0.3], [0.24, 0.16, 0.52, 0.9, 0.45]]:
		var px: float = palm[0]
		var pz: float = palm[1]
		var hgt: float = palm[2]
		var lean: float = palm[3]
		var yaw: float = palm[4]
		var dx := sin(yaw) * lean
		var dz := cos(yaw) * lean
		_grid(pos, nrm, part, 1, 6, 6, func(u: float, v: float) -> Vector3:
			var y := v * hgt
			var r := lerpf(0.026, 0.014, v)
			var b := v * v * 0.28
			return Vector3(sin(u * TAU) * r + dx * b + px, y + 0.17, cos(u * TAU) * r + dz * b + pz))
		var top := Vector3(px + dx * 0.28, hgt + 0.17, pz + dz * 0.28)
		for f in 7:
			var flen := 0.24 + (f % 3) * 0.03
			var a := float(f) / 7.0 * TAU + yaw
			_grid(pos, nrm, part, 2, 6, 1, func(u: float, v: float) -> Vector3:
				var r := u * flen
				var w := (v - 0.5) * 0.07 * (1.0 - u * 0.85)
				# arching up from the crown and drooping toward the tip
				var y := sin(u * 2.4) * 0.05 - u * u * 0.13
				return Vector3(top.x + cos(a) * r - sin(a) * w, top.y + y, top.z + sin(a) * r + cos(a) * w))
	# the shrine: four slim columns under a gilded dome
	var sx := -0.42
	var sz := -0.2
	for c in 4:
		var a := float(c) / 4.0 * TAU + 0.4
		var cx := sx + cos(a) * 0.075
		var cz := sz + sin(a) * 0.075
		_grid(pos, nrm, part, 3, 6, 1, func(u: float, v: float) -> Vector3:
			var r := lerpf(0.022, 0.018, v)
			return Vector3(cx + sin(u * TAU) * r, 0.15 + v * 0.2, cz + cos(u * TAU) * r))
	_grid(pos, nrm, part, 4, 14, 7, func(u: float, v: float) -> Vector3:
		var th := v * PI * 0.5
		return Vector3(sx + sin(u * TAU) * cos(th) * 0.11, 0.35 + sin(th) * 0.11 * 1.25, sz + cos(u * TAU) * cos(th) * 0.11))
	_grid(pos, nrm, part, 4, 6, 1, func(u: float, v: float) -> Vector3:
		var r := 0.018 * (1.0 - v)
		return Vector3(sx + sin(u * TAU) * r, 0.49 + v * 0.12, sz + cos(u * TAU) * r))
	# and the same again hanging upside down beneath it, the inferior mirage
	var n := pos.size()
	var col := PackedColorArray()
	col.resize(n * 2)
	for i in n:
		col[i] = Color(part[i] * 0.25, 0.0, 0.0)
		col[n + i] = Color(part[i] * 0.25, 1.0, 0.0)
	pos.append_array(pos.duplicate())
	nrm.append_array(nrm.duplicate())
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_NORMAL] = nrm
	arrays[Mesh.ARRAY_COLOR] = col
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	m.custom_aabb = AABB(Vector3(-1.4, -1.0, -1.4), Vector3(2.8, 2.6, 2.8))
	return m


## A (nu x nv)-cell sheet of triangles from f(u, v) over 0..1 x 0..1, its
## normals taken from the sheet's own slopes.
static func _grid(pos: PackedVector3Array, nrm: PackedVector3Array, part: PackedFloat32Array, kind: int, nu: int, nv: int, f: Callable) -> void:
	var pts := []
	for j in nv + 1:
		for i in nu + 1:
			pts.append(f.call(float(i) / nu, float(j) / nv))
	var nn := []
	for j in nv + 1:
		for i in nu + 1:
			var du: Vector3 = pts[j * (nu + 1) + mini(i + 1, nu)] - pts[j * (nu + 1) + maxi(i - 1, 0)]
			var dv: Vector3 = pts[mini(j + 1, nv) * (nu + 1) + i] - pts[maxi(j - 1, 0) * (nu + 1) + i]
			var c := du.cross(dv)
			nn.append(c.normalized() if c.length_squared() > 1e-12 else Vector3.UP)
	for j in nv:
		for i in nu:
			var a := j * (nu + 1) + i
			var b := a + 1
			var c := a + nu + 1
			var d := c + 1
			for k in [a, c, b, b, c, d]:
				pos.append(pts[k])
				nrm.append(nn[k])
				part.append(float(kind))
