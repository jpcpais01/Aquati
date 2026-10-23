class_name CrewView
extends Node3D
## Every sailor on the sea in a handful of instanced draws (the web game's
## CrewRenderer). Each cut of the sculpt (CrewModel) is a multimesh per mesh
## of it: the body, and the hats, held props and bigger extras, so a sailor
## costs the triangles of what he wears. A sailor drawn this frame takes a
## row of the pose texture (his 24 joint angles and expressions, then his
## palette row, hat, prop and kit flags) and each of his instances carries
## only its placement and that row; shaders/crew.gdshader poses him. His
## colours sit in the palette texture, one row per sailor afloat, written
## once when he comes aboard.

## Sailors drawn at once (rows of the pose texture), and palette rows.
const ROWS := 256
## The near sculpt is for the few within a few metres of the lens.
const NEAR_MAX := 16
## Floats per instance: the 3x4 transform's rows, then (pose row, -, -, -).
const STRIDE := 16
## How far a posed sailor reaches from his placement (m), for the bounds.
const REACH := 2.6


class Batch:
	var mm := MultiMesh.new()
	var mi := MultiMeshInstance3D.new()
	var buf := PackedFloat32Array()
	var n := 0
	var cap := 0


var material: ShaderMaterial
var _levels: Array[CrewModel.Level] = []
## Per level, its batches in the order of its meshes.
var _batches: Array[Array] = []
## Sailors queued at each level this frame, and their bounds.
var _count := PackedInt32Array([0, 0, 0, 0])
var _lo := PackedVector3Array()
var _hi := PackedVector3Array()
var _drawn := 0
var _pose := PackedFloat32Array()
var _pose_img: Image
var _pose_tex: ImageTexture
var _pal_img: Image
var _pal_tex: ImageTexture
var _pal_dirty := false
var _row := PackedFloat32Array()


func _init() -> void:
	material = ShaderMaterial.new()
	material.shader = preload("res://shaders/crew.gdshader")
	_pose_img = Image.create_empty(CrewModel.ROW_FLOATS / 4, ROWS, false, Image.FORMAT_RGBAF)
	_pose_tex = ImageTexture.create_from_image(_pose_img)
	_pal_img = Image.create_empty(CrewModel.SLOTS, ROWS, false, Image.FORMAT_RGBAF)
	_pal_tex = ImageTexture.create_from_image(_pal_img)
	material.set_shader_parameter("crew_pose", _pose_tex)
	material.set_shader_parameter("crew_palette", _pal_tex)
	_row.resize(STRIDE)
	_levels = CrewModel.levels()
	for li in _levels.size():
		var lv := _levels[li]
		var bs: Array[Batch] = []
		for i in lv.meshes.size():
			var b := Batch.new()
			b.mm.transform_format = MultiMesh.TRANSFORM_3D
			b.mm.use_custom_data = true
			b.mm.mesh = lv.meshes[i]
			b.mi.multimesh = b.mm
			b.mi.material_override = material
			# a speck's own shadow is a pixel or two on the deck: not worth its draw
			b.mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if li == CrewModel.SPECK else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			b.mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
			b.mi.visible = false
			b.mi.name = "%s%d" % [lv.name.capitalize(), i]
			add_child(b.mi)
			bs.append(b)
		_batches.append(bs)
		_lo.append(Vector3.ZERO)
		_hi.append(Vector3.ZERO)


## A sailor's colours, CrewModel.SLOTS of them, into palette row `row`.
func set_row(row: int, slots: PackedColorArray) -> void:
	for s in CrewModel.SLOTS:
		_pal_img.set_pixel(s, row, slots[s])
	_pal_dirty = true


func begin() -> void:
	_drawn = 0
	_count.fill(0)
	_pose.resize(0)
	for bs: Array[Batch] in _batches:
		for b in bs:
			if b.n > 0:
				b.n = 0
				b.buf.resize(0)


## Queues one posed sailor at a level (CrewModel.NEAR ..): his placement,
## his pose row (CrewModel.ROW_FLOATS), hat, held prop and the extras he
## wears at that level (Level.extras).
func push(xf: Transform3D, pose: PackedFloat32Array, level: int, hat: int, prop: int, kit: Array[PackedInt32Array]) -> void:
	if _drawn >= ROWS:
		return
	if level == CrewModel.NEAR and _count[CrewModel.NEAR] >= NEAR_MAX:
		level = CrewModel.FAR
	var o := xf.origin
	if _count[level] == 0:
		_lo[level] = o
		_hi[level] = o
	else:
		_lo[level] = _lo[level].min(o)
		_hi[level] = _hi[level].max(o)
	_count[level] += 1
	_pose.append_array(pose)
	var b := xf.basis
	_row[0] = b.x.x
	_row[1] = b.y.x
	_row[2] = b.z.x
	_row[3] = o.x
	_row[4] = b.x.y
	_row[5] = b.y.y
	_row[6] = b.z.y
	_row[7] = o.y
	_row[8] = b.x.z
	_row[9] = b.y.z
	_row[10] = b.z.z
	_row[11] = o.z
	_row[12] = _drawn
	_drawn += 1
	var bs: Array[Batch] = _batches[level]
	var lv := _levels[level]
	_add(bs[0])
	var hm := lv.hat_mesh[hat]
	if hm > 0:
		_add(bs[hm])
	var pm := lv.prop_mesh[prop]
	if pm > 0:
		_add(bs[pm])
	for i in kit[level]:
		_add(bs[i])


func _add(b: Batch) -> void:
	b.buf.append_array(_row)
	b.n += 1


func end() -> void:
	for li in _batches.size():
		var bs: Array[Batch] = _batches[li]
		var bounds := AABB(_lo[li] - Vector3.ONE * REACH, _hi[li] - _lo[li] + Vector3.ONE * REACH * 2.0)
		for b in bs:
			if b.n == 0:
				if b.mi.visible:
					b.mi.visible = false
				continue
			if b.n > b.cap:
				b.cap = maxi(8, nearest_po2(b.n))
				b.mm.instance_count = b.cap
			b.buf.resize(b.cap * STRIDE)
			b.mm.buffer = b.buf
			b.mm.visible_instance_count = b.n
			b.mm.custom_aabb = bounds
			b.mi.visible = true
	if _drawn > 0:
		_pose.resize(ROWS * CrewModel.ROW_FLOATS)
		_pose_img.set_data(CrewModel.ROW_FLOATS / 4, ROWS, false, Image.FORMAT_RGBAF, _pose.to_byte_array())
		_pose_tex.update(_pose_img)
	if _pal_dirty:
		_pal_dirty = false
		_pal_tex.update(_pal_img)


## How many sailors went out at each level last frame, and in how many draws.
func stats() -> PackedInt32Array:
	var draws := 0
	for bs: Array[Batch] in _batches:
		for b in bs:
			if b.mi.visible:
				draws += 1
	return PackedInt32Array([_count[0], _count[1], _count[2], _count[3], draws])
