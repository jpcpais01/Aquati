class_name Flora
extends Node3D
## One archipelago's planting, as the world bake wrote it (the web game's own
## Vegetation): coconut groves along the beaches, rain-tree jungle in the
## valleys, banana and fern understorey, shrubs, meadow flowers, grass, rocks
## and the beach's litter, one set per kind, variant and island.
##
## Each set is cut into 64 m squares, and each square shows the level that
## suits the size its plants make on screen, the web's per-plant rule: the
## detailed plant up close (its shadow cast by a lighter stand-in), an
## in-between cut, and a light one far off. Every level is a MultiMesh that
## Godot swaps by distance (a chain of visibility parents), so no script runs
## per frame. Ground cover shrinks away in the shader before its square is
## dropped. An island far off draws one light MultiMesh per set instead of its
## squares, and no ground cover.

## Ground cover smaller than this on screen (radius, px) isn't drawn at all.
const COVER_MIN_PX := 5.0
## How much nearer than its reach (m, past the island's own extent) the
## camera must come for an island to show its squares (the web's 210 m, and
## its lift with the camera's height at the usual zoom).
const NEAR_REACH := 300.0
## Past this (m) the haze has swallowed the plants: nothing is drawn.
const FAR_END := 1700.0
## Hysteresis at every switch, as a share of its distance.
const MARGIN := 0.064
## The web game drops a plant to its lighter level once it shrinks under the
## level's size on screen, and takes it back only once it is that size again
## after shrinking an eighth past it (0.88 lodPx). Each switch is pushed out
## so its band (MARGIN either way) runs over the same distances.
const LOD_BAND := 1.0 / (1.0 - MARGIN)

const MATERIALS := ["palm", "tree", "banana", "bush", "cover", "rock", "beach", "drift"]
## Materials whose shader shrinks the plants away (FLORA_FADE).
const FADING := ["cover", "beach"]

## The plant meshes and their materials, shared by every archipelago.
class Kit:
	var meshes: Array[ArrayMesh] = []
	## Bounding sphere of each mesh: centre (m) and radius (m).
	var centre := PackedVector3Array()
	var radius := PackedFloat32Array()
	## One material per kind of plant, and one per ground cover mesh (it
	## knows the distance that mesh shrinks away by).
	var materials := {}
	var fading := {}
	## Pixels a metre spans one metre off: a plant r m across, d m off, is
	## r * px_k / d pixels on screen.
	var px_k := 0.0

	func all_materials() -> Array:
		return materials.values() + fading.values()

	## Ground cover's material for one of its meshes.
	func fading_material(kind: String, mesh: int) -> ShaderMaterial:
		if not fading.has(mesh):
			var mat: ShaderMaterial = materials[kind].duplicate()
			mat.set_shader_parameter("fade_px", radius[mesh] * px_k / COVER_MIN_PX)
			fading[mesh] = mat
		return fading[mesh]

static var _kit: Kit

var region: Region
## MultiMeshes built, and plants planted.
var batches := 0
var plants := 0


## Loads world/flora once: every mesh, wound and painted as the web built it.
static func kit() -> Kit:
	if _kit != null:
		return _kit
	var k := Kit.new()
	var dir := Region.ROOT + "flora/"
	var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dir + "flora.json"))
	var blob := Region.unpack(dir + "flora.bin", int(meta.size))
	var flags := Mesh.ARRAY_CUSTOM_RGBA8_UNORM << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT
	for m: Dictionary in meta.meshes:
		var n := int(m.verts)
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = blob.slice(int(m.pos), int(m.pos) + n * 12).to_vector3_array()
		arrays[Mesh.ARRAY_NORMAL] = blob.slice(int(m.nrm), int(m.nrm) + n * 12).to_vector3_array()
		# the colour stays sRGB bytes: the shader decodes it
		arrays[Mesh.ARRAY_CUSTOM0] = blob.slice(int(m.col), int(m.col) + n * 4)
		arrays[Mesh.ARRAY_INDEX] = blob.slice(int(m.idx), int(m.idx) + int(m.indices) * 4).to_int32_array()
		var mesh := ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, flags)
		k.meshes.append(mesh)
		var c: Array = m.centre
		k.centre.append(Vector3(c[0], c[1], c[2]))
		k.radius.append(float(m.radius))
	k.px_k = screen_lines() / (2.0 * tan(deg_to_rad(CameraRig.FOV) * 0.5))
	var noise: Texture2D = load("res://art/noise.png")
	for name in MATERIALS:
		var mat := ShaderMaterial.new()
		mat.shader = load("res://shaders/flora_%s.gdshader" % name)
		mat.set_shader_parameter("noise_tex", noise)
		k.materials[name] = mat
	_kit = k
	return k


## How many of the web's CSS pixels tall the screen is: its plant sizes on
## screen (each set's lodPx and midPx) are measured in those. A phone is about
## 400 of them across its short side, as the web game finds it there; a
## desktop, or HIGH, keeps the 720 lines the window is laid out in.
static func screen_lines() -> float:
	if not Settings.mobile or Settings.quality == Settings.Quality.HIGH:
		return 720.0
	var size := DisplayServer.screen_get_size()
	var dpi := maxf(float(DisplayServer.screen_get_dpi()), 96.0)
	var lines := clampf(minf(size.x, size.y) * 160.0 / dpi, 320.0, 720.0)
	return lines * (0.8 if Settings.quality == Settings.Quality.LOW else 1.0)


## The gusts the plants lean from (Wind.packed), once a frame.
static func set_gusts(packed: PackedVector4Array) -> void:
	if _kit == null:
		return
	for mat: ShaderMaterial in _kit.all_materials():
		mat.set_shader_parameter("gusts", packed)


func build(p_region: Region) -> void:
	region = p_region
	name = "Flora_" + region.id
	position = region.centre
	var k := kit()
	var dir := Region.ROOT + region.id + "/"
	var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dir + "plants.json"))
	var data := Region.unpack(dir + "plants.bin", int(meta.size)).to_float32_array()
	var isles := {}
	for isl: Dictionary in region.islands:
		isles[int(isl.id)] = isl
	# per island: its squares (shown while the camera is near), and its far planting
	var near := {}
	var far := {}
	for s: Dictionary in meta.sets:
		var id := int(s.island)
		if not near.has(id):
			var g := Node3D.new()
			g.name = "Isle_%d" % id
			add_child(g)
			near[id] = g
		var lo := int(s.lo)
		if lo >= 0:
			if not far.has(id):
				var f := Node3D.new()
				f.name = "Isle_%d_far" % id
				add_child(f)
				far[id] = f
			_plant_far(s, data, far[id], isles[id])
		var cells: Array = s.cells
		for c: Array in cells:
			_plant_cell(s, c, data, near[id])
		plants += int(s.count)
	# an island's squares show only while its far planting is hidden by being near
	for id: int in far:
		var g: Node3D = near[id]
		g.visibility_parent = NodePath("../Isle_%d_far/%s" % [id, far[id].get_child(0).name])


## One square of a set: its levels, each over the distances where it suits.
func _plant_cell(s: Dictionary, c: Array, data: PackedFloat32Array, parent: Node3D) -> void:
	var k := _kit
	var hi := int(s.hi)
	var mid := int(s.mid)
	var sh := int(s.shadow)
	var lo := int(s.lo)
	var first := int(c[2])
	var count := int(c[3])
	var buf := data.slice(first * 16, (first + count) * 16)
	var s_mean := float(c[10])
	var s_max := float(c[11])
	# the box every level of the square shares, so they swap at one distance
	var cen := k.centre[hi]
	var r := k.radius[hi]
	var rxz := (r + Vector2(cen.x, cen.z).length()) * s_max
	var lo_y := float(c[4]) + minf(cen.y - r, 0.0) * s_max
	var hi_y := float(c[5]) + (cen.y + r) * s_max
	var box := AABB(Vector3(float(c[6]) - rxz, lo_y, float(c[7]) - rxz), Vector3(float(c[8]) - float(c[6]) + rxz * 2.0, hi_y - lo_y, float(c[9]) - float(c[7]) + rxz * 2.0))
	var mat: ShaderMaterial = k.materials[s.material]
	var casts := bool(s.shadows)
	if lo < 0:
		# ground cover: gone once it is under a few pixels, and shrunk away in
		# the shader before that (its furthest plant is half the square off)
		var end := minf(r * k.px_k / COVER_MIN_PX * s_max + Vector2(box.size.x, box.size.z).length() * 0.5, FAR_END)
		if s.material in FADING:
			mat = k.fading_material(s.material, hi)
		parent.add_child(_mmi(k.meshes[hi], buf, count, mat, box, 0.0, end, GeometryInstance3D.SHADOW_CASTING_SETTING_ON if casts else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF))
		return
	# where a plant of the square's usual size goes light, and (with an
	# in-between level) where it shows its every frond
	var d_lo := r * s_mean * k.px_k / float(s.lodPx) * LOD_BAND
	var d_hi := r * s_mean * k.px_k / float(s.midPx) * LOD_BAND if mid >= 0 else d_lo
	var off := GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var on := GeometryInstance3D.SHADOW_CASTING_SETTING_ON if casts else off
	# Each level shows only while the next lighter one is too near to (its
	# visibility parent): one switch is one state, so a square never shows two
	# levels at once, nor none while it lingers inside a switch's band.
	var light := _level(parent, _mmi(k.meshes[lo], buf, count, mat, box, d_lo, 0.0, on), null)
	var above := light
	if mid >= 0:
		# (the in-between cut is the stand-in's own: it casts its own shadow)
		above = _level(parent, _mmi(k.meshes[mid], buf, count, mat, box, d_hi, 0.0, on if sh == mid else off), light)
	# the detailed plant hands its shadow to the stand-in, when it has one
	_level(parent, _mmi(k.meshes[hi], buf, count, mat, box, 0.0, 0.0, off if sh >= 0 else on), above)
	if sh >= 0 and casts:
		_level(parent, _mmi(k.meshes[sh], buf, count, mat, box, 0.0, 0.0, GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY), above if sh == mid else light)


## Adds one level of a square, shown only while `lighter` is too near to show.
func _level(parent: Node3D, mmi: MultiMeshInstance3D, lighter: MultiMeshInstance3D) -> MultiMeshInstance3D:
	mmi.name = "L%d" % parent.get_child_count()
	parent.add_child(mmi)
	if lighter != null:
		mmi.visibility_parent = NodePath("../" + lighter.name)
	return mmi


## A whole set on a far island: its light mesh, one MultiMesh for all of it.
func _plant_far(s: Dictionary, data: PackedFloat32Array, parent: Node3D, isl: Dictionary) -> void:
	var cells: Array = s.cells
	var first := int(cells[0][2])
	var count := int(s.count)
	var buf := data.slice(first * 16, (first + count) * 16)
	# every set of an island shares the island's box, so they all swap at once
	var stretch := float(isl.stretch)
	var ext := float(isl.r) * maxf(stretch, 1.0 / stretch) * 1.15
	var peak := float(isl.peak)
	var c := Vector3(float(isl.x), 0.0, float(isl.z)) - region.centre
	var box := AABB(Vector3(c.x - ext, -0.2 * peak, c.z - ext), Vector3(ext * 2.0, peak * 1.2, ext * 2.0))
	# (that far off it is past the sun's shadow map: it casts none, as on the web)
	var mmi := _mmi(_kit.meshes[int(s.lo)], buf, count, _kit.materials[s.material], box, ext + NEAR_REACH, FAR_END, GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)
	mmi.name = "F%d" % parent.get_child_count()
	parent.add_child(mmi)


func _mmi(mesh: Mesh, buf: PackedFloat32Array, count: int, mat: Material, box: AABB, begin: float, end: float, shadow: GeometryInstance3D.ShadowCastingSetting) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = count
	mm.buffer = buf
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.custom_aabb = box
	mmi.cast_shadow = shadow
	mmi.visibility_range_begin = begin
	mmi.visibility_range_begin_margin = begin * MARGIN
	mmi.visibility_range_end = end
	mmi.visibility_range_end_margin = end * MARGIN
	batches += 1
	return mmi
