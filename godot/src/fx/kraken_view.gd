class_name KrakenView
extends Node3D
## The Kraken's body, drawn almost entirely on the GPU from a handful of
## numbers (the web's fx/krakenModel.ts KrakenView).
##
## Arms: one merged tube per arm whose every vertex is placed in the vertex
## shader (shaders/kraken_arm.gdshader) from a spine of 33 points the game
## poses each frame, written to a small float texture: position and girth,
## then the side the suckers face, per point, and a row's flash, bands,
## arousal and pallor. Only that texture goes up each frame.
##
## Head: a bulbous mantle with brow ridges, a siphon and two great eyes
## (shaders/kraken_head.gdshader), on a node the game turns and lifts.
##
## Marks: the crimson shimmers on the sea where a blow will land
## (shaders/kraken_mark.gdshader), an instanced quad each.
##
## Everything is built once with the voyage and stays in the scene, hidden
## until it first comes, so its shaders are compiled behind the loading
## screen and nothing about it is made mid-voyage.

## Spine points per arm (32 segments).
const SPINE := 33
## Arm slots: six that fight, two short ones that writhe about the head.
const ARMS := 8
const RINGS := 88
const SIDES := 18
## Texels per arm row: position + normal per spine point, then two of parameters.
const ROW := SPINE * 2 + 2
const MARKS := ARMS * 2
## Eye centre (x mirrored) and radius, in the head's own frame.
const EYE := Vector4(3.7, -0.9, 3.9, 1.35)

var specs: Array[Vector2] = []
## Per arm: SPINE points (xyz girth), SPINE sucker-side normals, then two params.
var data := PackedFloat32Array()
var arms: MeshInstance3D
var head: MeshInstance3D
## The head's frame: where it rises and how it turns (origin at the eyes' level, +z toward her).
var head_root: Node3D
var _img: Image
var _tex: ImageTexture
var _head_mat: ShaderMaterial
var _marks: MultiMeshInstance3D
var _n_marks := 0


## Girth along the arm, 0 root .. 1 tip, as a fraction of the root's.
static func profile(v: float) -> float:
	return (0.05 + 0.95 * pow(1.0 - v, 0.92)) * (1.0 + 0.16 * exp(-v * 14.0))


## `p_specs`: each arm's length (m) and girth at the root (m).
func _init(p_specs: Array[Vector2]) -> void:
	specs = p_specs
	name = "Kraken"
	data.resize(ROW * ARMS * 4)
	_img = Image.create_empty(ROW, ARMS, false, Image.FORMAT_RGBAF)
	for a in ARMS:
		write_rest(a, 0.0, -400.0, 0.0)
	_img.set_data(ROW, ARMS, false, Image.FORMAT_RGBAF, data.to_byte_array())
	_tex = ImageTexture.create_from_image(_img)
	var arm_mat := ShaderMaterial.new()
	arm_mat.shader = preload("res://shaders/kraken_arm.gdshader")
	arm_mat.set_shader_parameter("kr_spine", _tex)
	arms = MeshInstance3D.new()
	arms.name = "Arms"
	arms.mesh = _arm_mesh()
	arms.material_override = arm_mat
	# posed anywhere on the sea: never culled
	arms.custom_aabb = AABB(Vector3(-1e5, -1e3, -1e5), Vector3(2e5, 2e3, 2e5))
	arms.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	add_child(arms)
	head_root = Node3D.new()
	head_root.name = "Head"
	add_child(head_root)
	_head_mat = ShaderMaterial.new()
	_head_mat.shader = preload("res://shaders/kraken_head.gdshader")
	_head_mat.set_shader_parameter("kr_eye", EYE)
	head = MeshInstance3D.new()
	head.mesh = _head_mesh()
	head.material_override = _head_mat
	head.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	head_root.add_child(head)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	var quad := PlaneMesh.new()
	quad.size = Vector2.ONE
	mm.mesh = quad
	mm.instance_count = MARKS
	mm.visible_instance_count = 0
	_marks = MultiMeshInstance3D.new()
	_marks.name = "Marks"
	_marks.multimesh = mm
	var mk := ShaderMaterial.new()
	mk.shader = preload("res://shaders/kraken_mark.gdshader")
	mk.render_priority = 2
	_marks.material_override = mk
	_marks.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_marks.custom_aabb = arms.custom_aabb
	add_child(_marks)
	visible = false


## All the arms in one buffer: a tube per arm, its vertices placed by the shader.
func _arm_mesh() -> ArrayMesh:
	var per := (RINGS + 1) * (SIDES + 1)
	var n := per * specs.size()
	var pos := PackedVector3Array()
	pos.resize(n)
	var k0 := PackedFloat32Array()
	k0.resize(n * 4)
	var k1 := PackedFloat32Array()
	k1.resize(n * 4)
	var idx := PackedInt32Array()
	for arm in specs.size():
		var L := specs[arm].x
		var R0 := specs[arm].y
		var suck := 0.0
		var last_v := 0.0
		for i in RINGS + 1:
			# rings bunch up toward the tip, where it curls tightest
			var vv := 1.0 - pow(1.0 - float(i) / RINGS, 1.25)
			var r := 0.0 if i == RINGS else R0 * profile(vv)
			var dv := 0.002
			var slope := (R0 * (profile(minf(1.0, vv + dv)) - profile(maxf(0.0, vv - dv)))) / (2.0 * dv * L)
			# suckers stay a set fraction of the girth apart
			if i > 0:
				suck += ((vv - last_v) * L) / maxf(0.95 * R0 * profile((vv + last_v) * 0.5), 0.04)
			last_v = vv
			for j in SIDES + 1:
				var a := float(j) / SIDES * TAU - PI
				var k := arm * per + i * (SIDES + 1) + j
				k0[k * 4] = vv
				k0[k * 4 + 1] = a
				k0[k * 4 + 2] = float(arm)
				k1[k * 4] = r
				k1[k * 4 + 1] = 0.0 if i == RINGS else slope
				k1[k * 4 + 2] = suck
		for i in RINGS:
			for j in SIDES:
				var a := arm * per + i * (SIDES + 1) + j
				var b := a + SIDES + 1
				# (wound the other way from three.js's: Godot's front faces turn clockwise)
				idx.append_array([a, a + 1, b, a + 1, b + 1, b])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	arr[Mesh.ARRAY_CUSTOM0] = k0
	arr[Mesh.ARRAY_CUSTOM1] = k1
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	var fmt := (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) | (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT)
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, fmt)
	return m


## Where a point of the unit sphere goes on the head: a sphere pushed into a
## tall, back-swept sac with a flared crown below the water, brow ridges,
## bulging eyes and a siphon.
static func _sculpt(d: Vector3) -> Vector3:
	# the sac: taller than wide, swept back toward the top
	var x := d.x * 5.6
	var y := d.y * 8.8 + 2.4
	var z := d.z * 6.0
	var top := maxf(0.0, d.y)
	z -= pow(top, 1.5) * 4.2
	x *= 1.0 - top * top * 0.28
	# a waist under the eyes, then the crown of arm roots flaring out below the water
	var low := maxf(0.0, -d.y)
	var waist := exp(-pow((d.y + 0.25) / 0.16, 2.0)) * 0.1
	x *= 1.0 - waist + low * low * 0.55
	z *= 1.0 - waist + low * low * 0.55
	# eyes bulge out of the sides of the face
	for sx in [-1.0, 1.0]:
		var eye := Vector3(sx * 0.7, -0.38, 0.62).normalized()
		var k := exp(-d.distance_squared_to(eye) * 26.0)
		var out := Vector3(x, y - 2.4, z).normalized()
		x += out.x * k * 1.25
		y += out.y * k * 1.25
		z += out.z * k * 1.25
		# a heavy brow ridge arching over each eye
		eye = Vector3(sx * 0.62, -0.12, 0.6).normalized()
		var b := exp(-d.distance_squared_to(eye) * 30.0) * 0.7
		y += b * 0.5
		z += b * 0.6
		x += sx * b * 0.3
	# the siphon: a fleshy funnel on the left of the face, low down
	var sip := Vector3(-0.35, -0.7, 0.62).normalized()
	var s := exp(-d.distance_squared_to(sip) * 40.0)
	x -= s * 0.6
	y -= s * 0.4
	z += s * 1.7
	return Vector3(x, y, z)


## The head: a 72 x 52 sphere sculpted, its normals taken from the sculpt
## itself (no seam where the sphere's grid closes).
func _head_mesh() -> ArrayMesh:
	var W := 72
	var H := 52
	var pos := PackedVector3Array()
	var nrm := PackedVector3Array()
	var idx := PackedInt32Array()
	var e := 0.004
	for i in H + 1:
		var th := PI * float(i) / H
		for j in W + 1:
			var ph := TAU * float(j) / W
			var d := Vector3(-cos(ph) * sin(th), cos(th), sin(ph) * sin(th))
			var p := _sculpt(d)
			# two small steps across the sphere's surface, sculpted too
			var t1 := d.cross(Vector3.UP if absf(d.y) < 0.99 else Vector3.RIGHT).normalized()
			var t2 := d.cross(t1)
			var n := (_sculpt((d + t1 * e).normalized()) - p).cross(_sculpt((d + t2 * e).normalized()) - p).normalized()
			if n.dot(d) < 0.0:
				n = -n
			pos.append(p)
			nrm.append(n)
	for i in H:
		for j in W:
			var a := i * (W + 1) + j
			var b := a + W + 1
			idx.append_array([a, a + 1, b, a + 1, b + 1, b])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	arr[Mesh.ARRAY_NORMAL] = nrm
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m


## Triangles in the arms and the head.
func triangles() -> int:
	return specs.size() * RINGS * SIDES * 2 + 72 * 52 * 2


## An arm folded away to nothing (no girth, every point in one place): drawn, but no pixels.
func write_rest(arm: int, x: float, y: float, z: float) -> void:
	var o := arm * ROW * 4
	for i in SPINE:
		var b := o + i * 8
		data[b] = x
		data[b + 1] = y
		data[b + 2] = z
		data[b + 3] = 0.0
		data[b + 4] = 1.0
		data[b + 5] = 0.0
		data[b + 6] = 0.0
		data[b + 7] = 0.0
	var p := o + SPINE * 8
	for i in 8:
		data[p + i] = 0.0
	data[p + 4] = specs[arm].x
	data[p + 5] = specs[arm].y


## A posed spine: positions, girth scale per point and the sucker-side normals.
func write_arm(arm: int, pts: PackedFloat32Array, nrm: PackedFloat32Array, girth: PackedFloat32Array, flash: float, band: float, arousal: float, pallor: float) -> void:
	var o := arm * ROW * 4
	for i in SPINE:
		var b := o + i * 8
		data[b] = pts[i * 3]
		data[b + 1] = pts[i * 3 + 1]
		data[b + 2] = pts[i * 3 + 2]
		data[b + 3] = girth[i]
		data[b + 4] = nrm[i * 3]
		data[b + 5] = nrm[i * 3 + 1]
		data[b + 6] = nrm[i * 3 + 2]
	var p := o + SPINE * 8
	data[p] = flash
	data[p + 1] = band
	data[p + 2] = arousal
	data[p + 3] = pallor


## The spines up to the GPU.
func commit() -> void:
	_img.set_data(ROW, ARMS, false, Image.FORMAT_RGBAF, data.to_byte_array())
	_tex.update(_img)


func set_head(x: float, y: float, z: float, yaw: float, pitch: float, roll: float, breath: float, arousal: float, pallor: float, flash: float) -> void:
	head_root.transform = Transform3D(Basis.from_euler(Vector3(pitch, yaw, roll), EULER_ORDER_YXZ), Vector3(x, y, z))
	_head_mat.set_shader_parameter("kr_head", Vector4(breath, arousal, pallor, flash))


func set_gaze(x: float, y: float, open: float, dilate: float) -> void:
	_head_mat.set_shader_parameter("kr_gaze", Vector4(x, y, open, dilate))


func begin_marks() -> void:
	_n_marks = 0


## A slam's landing strip: from (x, z) along `ang` for `len` metres, `w` wide.
func strip(x: float, y: float, z: float, ang: float, len: float, w: float, alpha: float, urgency: float, seed: float) -> void:
	if _n_marks >= MARKS:
		return
	var along := Vector3(sin(ang), 0.0, cos(ang))
	var across := Vector3(cos(ang), 0.0, -sin(ang))
	var t := Transform3D(Basis(along * len, Vector3.UP, across * w), Vector3(x, y, z) + along * len * 0.5)
	_marks.multimesh.set_instance_transform(_n_marks, t)
	_marks.multimesh.set_instance_custom_data(_n_marks, Color(alpha, 0.0, seed, urgency))
	_n_marks += 1


## A pulsing ring `r` m round (x, z).
func ring(x: float, y: float, z: float, r: float, alpha: float) -> void:
	if _n_marks >= MARKS:
		return
	_marks.multimesh.set_instance_transform(_n_marks, Transform3D(Basis.from_scale(Vector3(r * 2.0, 1.0, r * 2.0)), Vector3(x, y, z)))
	_marks.multimesh.set_instance_custom_data(_n_marks, Color(alpha, 1.0, 0.0, 0.0))
	_n_marks += 1


func end_marks() -> void:
	_marks.multimesh.visible_instance_count = _n_marks
