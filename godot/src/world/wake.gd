class_name WakeField
extends Node
## A camera-centred, world-aligned canvas of disturbed water that scrolls with
## the focus: foam in R, wake height in G, its vertical velocity in B (see
## shaders/wake_sim.gdshader). Two SubViewports take turns: each frame one
## steps the simulation from the other and adds this frame's stamps on top.
## The ocean reads the latest for displacement, normals and foam.

const RES := 512
const SIZE := 300.0
const MAX_STAMPS := 320
const WAVE_SPEED := 4.0
const VEL_DAMP := 0.18
const FOAM_HALF_LIFE := 1.9
const MAX_STAMP_RADIUS := 60.0
## Hard bounds per kind (foam blob, foam ring, height, velocity), so a stray
## number from gameplay can never flood the canvas.
const MAX_STAMP := [3.0, 3.0, 2.5, 4.0]

var center := Vector2.ZERO
var _vps: Array[SubViewport] = []
var _sims: Array[ShaderMaterial] = []
var _mms: Array[MultiMesh] = []
var _cur := 0
var _last := Vector2.ZERO
var _sim_time := 0.0
var _n := 0
## Steps left in which the canvases are wiped instead of stepped: a new
## render target holds whatever was in memory before.
var _wipe := 2
var _sx := PackedFloat32Array()
var _sz := PackedFloat32Array()
var _sr := PackedFloat32Array()
var _ss := PackedFloat32Array()
var _sk := PackedFloat32Array()


func _ready() -> void:
	_sx.resize(MAX_STAMPS)
	_sz.resize(MAX_STAMPS)
	_sr.resize(MAX_STAMPS)
	_ss.resize(MAX_STAMPS)
	_sk.resize(MAX_STAMPS)
	var sim_shader: Shader = load("res://shaders/wake_sim.gdshader")
	var stamp_mat := ShaderMaterial.new()
	stamp_mat.shader = load("res://shaders/wake_stamp.gdshader")
	var noise: Texture2D = load("res://art/noise.png")
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	for i in 2:
		var vp := SubViewport.new()
		vp.size = Vector2i(RES, RES)
		vp.use_hdr_2d = true
		vp.disable_3d = true
		vp.transparent_bg = false
		vp.render_target_clear_mode = SubViewport.CLEAR_MODE_ALWAYS
		vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
		add_child(vp)
		var rect := ColorRect.new()
		rect.position = Vector2.ZERO
		rect.size = Vector2(RES, RES)
		var m := ShaderMaterial.new()
		m.shader = sim_shader
		m.set_shader_parameter("noise_tex", noise)
		m.set_shader_parameter("texel", 1.0 / RES)
		rect.material = m
		vp.add_child(rect)
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_2D
		mm.use_custom_data = true
		mm.mesh = quad
		mm.instance_count = MAX_STAMPS
		mm.visible_instance_count = 0
		var mmi := MultiMeshInstance2D.new()
		mmi.multimesh = mm
		mmi.material = stamp_mat
		vp.add_child(mmi)
		_vps.append(vp)
		_sims.append(m)
		_mms.append(mm)
	# each canvas steps from the other
	_sims[0].set_shader_parameter("prev", _vps[1].get_texture())
	_sims[1].set_shader_parameter("prev", _vps[0].get_texture())
	# nothing reads the field until both canvases have been wiped
	RenderingServer.global_shader_parameter_set("wake_rect", Vector4(1e7, 1e7, SIZE, 1.0 / SIZE))


## The latest state, for the ocean.
func texture() -> Texture2D:
	return _vps[_cur].get_texture()


## Lets waves feel the sea floor: slower in shallows, stopped by land.
func set_seabed(tex: Texture2D, rect: Vector4) -> void:
	for m in _sims:
		m.set_shader_parameter("seabed_tex", tex)
		m.set_shader_parameter("seabed_rect", rect)
		m.set_shader_parameter("has_seabed", 1.0)


func _add(x: float, z: float, radius: float, strength: float, kind: int) -> void:
	if _n >= MAX_STAMPS or not is_finite(x) or not is_finite(z) or not is_finite(strength) or not radius > 0.0:
		return
	var lim: float = MAX_STAMP[kind]
	_sx[_n] = x
	_sz[_n] = z
	_sr[_n] = minf(radius, MAX_STAMP_RADIUS)
	_ss[_n] = clampf(strength, 0.0 if kind < 2 else -lim, lim)
	_sk[_n] = kind
	_n += 1


## Paints foam: a soft blob, or a ring.
func stamp(x: float, z: float, radius: float, strength: float, ring: bool = false) -> void:
	_add(x, z, radius, strength, 1 if ring else 0)


## Displaces the surface by `amount` metres at the centre: a splash crater, a heave.
func push(x: float, z: float, radius: float, amount: float) -> void:
	_add(x, z, radius, amount, 2)


## Accelerates the surface: `amount` is force x dt in m/s, so a moving hull's
## pressure is frame-rate independent.
func press(x: float, z: float, radius: float, amount: float) -> void:
	_add(x, z, radius, amount, 3)


func step(focus_x: float, focus_z: float, dt: float) -> void:
	var texel := SIZE / RES
	if not is_finite(focus_x) or not is_finite(focus_z):
		focus_x = center.x
		focus_z = center.y
	if not is_finite(dt):
		dt = 1.0 / 60.0
	# snap to texels so scrolling never smears the foam
	var cx := roundf(focus_x / texel) * texel
	var cz := roundf(focus_z / texel) * texel
	var h := clampf(dt, 1.0 / 480.0, 1.0 / 20.0)
	_sim_time += h
	var dst := 1 - _cur
	var m := _sims[dst]
	m.set_shader_parameter("shift", Vector2((cx - _last.x) / SIZE, (cz - _last.y) / SIZE))
	m.set_shader_parameter("rect", Vector4(cx, cz, SIZE, 1.0 / SIZE))
	m.set_shader_parameter("dt", h)
	m.set_shader_parameter("k", pow(WAVE_SPEED / texel, 2.0) * h)
	m.set_shader_parameter("vel_damp", exp(-VEL_DAMP * h))
	m.set_shader_parameter("foam_decay", pow(0.5, h / FOAM_HALF_LIFE))
	m.set_shader_parameter("foam_gain", h * 2.2)
	m.set_shader_parameter("sim_time", _sim_time)
	m.set_shader_parameter("wipe", 1.0 if _wipe > 0 else 0.0)
	_last = Vector2(cx, cz)
	center = _last
	# this frame's stamps, in canvas pixels
	var mm := _mms[dst]
	var px_per_m := RES / SIZE
	for i in _n:
		var px := ((_sx[i] - cx) / SIZE + 0.5) * RES
		var py := ((_sz[i] - cz) / SIZE + 0.5) * RES
		var d := _sr[i] * 2.0 * px_per_m
		mm.set_instance_transform_2d(i, Transform2D(0.0, Vector2(d, d), 0.0, Vector2(px, py)))
		mm.set_instance_custom_data(i, Color(_ss[i], _sk[i], 0.0, 0.0))
	mm.visible_instance_count = _n if _wipe <= 0 else 0
	_n = 0
	_vps[dst].render_target_update_mode = SubViewport.UPDATE_ONCE
	_cur = dst
	if _wipe > 0:
		_wipe -= 1
		return
	RenderingServer.global_shader_parameter_set("wake_rect", Vector4(cx, cz, SIZE, 1.0 / SIZE))
