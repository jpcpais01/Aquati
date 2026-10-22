class_name Grade
extends Node
## The web game's colour grade as the environment's colour-correction table.
##
## The environment runs Godot's linear tonemapper at half exposure, so the
## table's input is sRGB(scene light x exposure / 2) and every pixel, from the
## shade of a sail to a glint off the swell, lands in its 0..1 range (on a
## phone the 3D colour buffer itself stops at 2). shaders/grade_lut.gdshader
## paints the 32x32x32 table on the GPU, a frame later it is read back once
## and handed to the environment as a 3D texture. Re-baking when the hour's
## grade drifts is cheap: one small draw and one read-back.

const N := 32

var _vp: SubViewport
var _mat: ShaderMaterial
var _env: Environment
var _busy := false
var _lo := Vector3.ZERO
var _hi := Vector3.ZERO
var _sat := 0.0
var _contrast := 0.0
var _vibrance := 0.0


func _init(env: Environment) -> void:
	_env = env


func _ready() -> void:
	_vp = SubViewport.new()
	_vp.size = Vector2i(N * N, N)
	_vp.disable_3d = true
	_vp.transparent_bg = false
	_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(_vp)
	var rect := ColorRect.new()
	rect.size = Vector2(N * N, N)
	_mat = ShaderMaterial.new()
	_mat.shader = load("res://shaders/grade_lut.gdshader")
	rect.material = _mat
	_vp.add_child(rect)


## Repaints the table if the grade has moved far enough to see.
func follow(lo: Vector3, hi: Vector3, sat: float, contrast: float, vibrance: float) -> void:
	if _busy or DisplayServer.get_name() == "headless":
		return
	if (lo - _lo).length() + (hi - _hi).length() + absf(sat - _sat) + absf(contrast - _contrast) + absf(vibrance - _vibrance) < 0.004:
		return
	_lo = lo
	_hi = hi
	_sat = sat
	_contrast = contrast
	_vibrance = vibrance
	_bake()


func _bake() -> void:
	_busy = true
	_mat.set_shader_parameter("split_lo", _lo)
	_mat.set_shader_parameter("split_hi", _hi)
	_mat.set_shader_parameter("sat", _sat)
	_mat.set_shader_parameter("contrast", _contrast)
	_mat.set_shader_parameter("vibrance", _vibrance)
	_vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw
	var img := _vp.get_texture().get_image()
	_busy = false
	if img == null or img.get_width() != N * N:
		return
	img.convert(Image.FORMAT_RGBA8)
	var slices: Array[Image] = []
	for z in N:
		slices.append(img.get_region(Rect2i(z * N, 0, N, N)))
	var tex := ImageTexture3D.new()
	if tex.create(Image.FORMAT_RGBA8, N, N, N, false, slices) != OK:
		return
	_env.adjustment_color_correction = tex
