class_name RopeKit
extends RefCounted
## Collects a ship's rigging into one ribbon mesh for ship_rope.gdshader: two
## vertices per point along each rope, both on its axis, which the shader
## spreads into a camera-facing strip as wide as the rope (never thinner than
## a pixel). Ropes that sag hang in a gentle curve.

const TAR := Color("#2a1f16")
const HEMP := Color("#8c7150")

var verts := PackedVector3Array()
var custom := PackedFloat32Array()
var uvs := PackedVector2Array()
var colors := PackedColorArray()
var indices := PackedInt32Array()
var _rng := RandomNumberGenerator.new()


func _init(seed_value: int = 11) -> void:
	_rng.seed = seed_value


func is_empty() -> bool:
	return indices.is_empty()


## One rope from a to b, radius r (m); sag is how far its middle droops.
func rope(a: Vector3, b: Vector3, r: float = 0.03, col: Color = TAR, sag: float = 0.0) -> void:
	var length := a.distance_to(b)
	if length < 1e-3:
		return
	var segs := 4 if sag > 0.0 and length > 4.0 else 1
	var jit := pow(0.9 + _rng.randf() * 0.2, 0.4545)
	var paint := Color(minf(col.r * jit, 1.0), minf(col.g * jit, 1.0), minf(col.b * jit, 1.0))
	var base := verts.size()
	for i in segs + 1:
		var f := float(i) / segs
		var p := a.lerp(b, f)
		p.y -= 4.0 * f * (1.0 - f) * sag
		# the curve's slope: the straight run plus the droop's own
		var t := (b - a) + Vector3(0, -4.0 * (1.0 - 2.0 * f) * sag, 0)
		t = t.normalized()
		for s: float in [-1.0, 1.0]:
			verts.append(p)
			custom.append_array([t.x, t.y, t.z, r])
			uvs.append(Vector2(s, f))
			colors.append(paint)
	for i in segs:
		var v := base + i * 2
		indices.append_array([v, v + 2, v + 1, v + 1, v + 2, v + 3])


func commit() -> ArrayMesh:
	var mesh := ArrayMesh.new()
	if indices.is_empty():
		return mesh
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_CUSTOM0] = custom
	arrays[Mesh.ARRAY_INDEX] = indices
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT)
	# the shader widens the ribbons, so give the culler some slack
	mesh.custom_aabb = _bounds().grow(0.5)
	return mesh


func _bounds() -> AABB:
	var box := AABB(verts[0], Vector3.ZERO)
	for p in verts:
		box = box.expand(p)
	return box
