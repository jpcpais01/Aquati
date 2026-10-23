class_name ZoomBox
extends RefCounted
## The world-locked tile that rain and spindrift wrap round the view grows
## and shrinks with the zoom. Every particle's spot in it is scaled by its
## size, so resizing it under particles in flight would fling them all
## somewhere else (in a fight the camera pulls in and out with the enemy every
## frame). Instead a particle keeps the size it was born with for its whole
## cycle: the tile changes size only at an instant (at), particles born before
## it keep the old size (prev), and the next change waits until every one of
## those has run out. The shaders' side is born_box() in their own code.

var box := Vector2.ZERO
var prev := Vector2.ZERO
var at := -1e9
var _primed := false
## The longest particle cycle (s), so no particle outlives two sizes.
var _cycle := 1.0


func _init(max_cycle: float) -> void:
	_cycle = max_cycle


## The buffer such particles are drawn from: `count` quads whose corners the
## shader places from their vertex numbers alone, so it holds nothing but
## its indices; never culled, since they're placed round the view.
static func quads(count: int) -> ArrayMesh:
	var pos := PackedVector3Array()
	pos.resize(count * 4)
	var idx := PackedInt32Array()
	idx.resize(count * 6)
	for i in count:
		var o := i * 4
		var j := i * 6
		idx[j] = o
		idx[j + 1] = o + 1
		idx[j + 2] = o + 2
		idx[j + 3] = o + 1
		idx[j + 4] = o + 3
		idx[j + 5] = o + 2
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	m.custom_aabb = AABB(Vector3(-1e5, -100.0, -1e5), Vector3(2e5, 600.0, 2e5))
	return m


## Moves the tile toward `want` without disturbing particles in flight; now
## is the particles' clock. Hands the material the tile, the old one and
## the moment it changed.
func update(want: Vector2, now: float, mat: ShaderMaterial) -> void:
	if not _primed:
		_primed = true
		box = want
		prev = want
	else:
		# (the clock wraps)
		if now < at:
			at = -1e9
		if box != want and now - at >= _cycle:
			prev = box
			box = want
			at = now
	mat.set_shader_parameter("box", box)
	mat.set_shader_parameter("box_prev", prev)
	mat.set_shader_parameter("box_at", at)
