class_name Ground
extends Node3D
## One archipelago's island ground: the 64 m chunks the world bake cut from
## the heightfield, each with its lighter levels. Godot picks a chunk's level
## by how far off it lies, so its error stays under a couple of pixels; a
## skirt hangs from every level's rim, so neighbours on different levels never
## gap. Every chunk draws the same vertex template (its grid, then the rim's
## skirt copies) and the ground shader lifts each vertex to its height.

## How many pixels a level's error may span (the web's SUB_PX).
const ERROR_PX := 2.0

var region: Region
var material: ShaderMaterial
var chunks := 0
var triangles := 0


func build(p_region: Region, lite: bool) -> void:
	region = p_region
	name = "Ground_" + region.id
	position = region.centre
	material = ShaderMaterial.new()
	material.shader = load("res://shaders/terrain_lite.gdshader" if lite else "res://shaders/terrain.gdshader")
	material.set_shader_parameter("height_tex", region.height_tex)
	material.set_shader_parameter("ground_tex", region.ground_tex)
	material.set_shader_parameter("cover_tex", region.cover_tex)
	material.set_shader_parameter("isle_tex", region.isle_tex)
	material.set_shader_parameter("shore_tex", region.shore_tex)
	material.set_shader_parameter("noise_tex", load("res://art/noise.png"))
	material.set_shader_parameter("foam_tex", load("res://art/foam.png"))

	var dir := Region.ROOT + region.id + "/"
	var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dir + "ground.json"))
	var cells := int(meta.chunk)
	var span := cells * Region.CELL
	var drop := float(meta.skirt)
	material.set_shader_parameter("region", Vector4(region.centre.x, region.centre.z, region.biome, drop))
	var blob := Region.unpack(dir + "ground.bin", int(meta.size))
	var template := _template(cells, int(meta.template))
	var groups := {}
	for c: Dictionary in meta.chunks:
		var levels: Array = c.levels
		var base: Array = levels[0]
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = template
		arrays[Mesh.ARRAY_INDEX] = _indices(blob, base)
		var lods := {}
		for k in range(1, levels.size()):
			var lv: Array = levels[k]
			lods[float(lv[0])] = _indices(blob, lv)
		var mesh := ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], lods)
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.material_override = material
		mi.position = Vector3(region.x0 - region.centre.x + float(c.i) * span, 0.0, region.z0 - region.centre.z + float(c.j) * span)
		var y0 := float(c.y0)
		var y1 := float(c.y1)
		mi.custom_aabb = AABB(Vector3(0.0, y0, 0.0), Vector3(span, y1 - y0, span))
		# a level may stray ERROR_PX pixels before a finer one takes over
		mi.lod_bias = 1.0 / ERROR_PX
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if y1 > 0.5 else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		# grouped by island, so an island's ground can be handed over as one
		var isle := int(c.isle)
		if not groups.has(isle):
			var g := Node3D.new()
			g.name = "Isle_%d" % isle if isle >= 0 else "Shoals"
			add_child(g)
			groups[isle] = g
		groups[isle].add_child(mi)
		chunks += 1
		triangles += int(base[2]) / 3


## The grid (row by row along +x, rows along +z) at y 0, then a copy of each
## rim vertex in the same order at y -1, which the shader hangs as the skirt.
static func _template(cells: int, count: int) -> PackedVector3Array:
	var vn := cells + 1
	var v := PackedVector3Array()
	v.resize(count)
	var sk := vn * vn
	for j in vn:
		for i in vn:
			var p := Vector3(i * Region.CELL, 0.0, j * Region.CELL)
			v[j * vn + i] = p
			if i == 0 or i == cells or j == 0 or j == cells:
				v[sk] = Vector3(p.x, -1.0, p.z)
				sk += 1
	return v


static func _indices(blob: PackedByteArray, level: Array) -> PackedInt32Array:
	var at := int(level[1]) * 4
	return blob.slice(at, at + int(level[2]) * 4).to_int32_array()
