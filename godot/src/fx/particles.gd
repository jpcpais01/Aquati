class_name Particles
extends MultiMeshInstance3D
## The sea's spray, smoke and glints: a ring of launched particles that the
## GPU flies on in closed form (shaders/particles.gdshader). emit() writes one
## slot of the instance buffer and the buffer goes up once a frame if anything
## was launched; nothing runs per particle per frame on the CPU.

const CAPACITY := 1024
## Floats per particle: a 3x4 transform, a colour and the custom vec4.
const STRIDE := 20
## The particles' clock is wound back by this much when it gets there, so the
## GPU's arithmetic on it stays precise however long you sail.
const REBASE := 1024.0

var _buf := PackedFloat32Array()
var _next := 0
var _now := 0.0
var _dirty := false
var _mat: ShaderMaterial


func _ready() -> void:
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = quad
	mm.instance_count = CAPACITY
	# the instance transforms carry launch data, not placements: cull by hand
	mm.custom_aabb = AABB(Vector3(-1e5, -500.0, -1e5), Vector3(2e5, 1000.0, 2e5))
	_buf.resize(CAPACITY * STRIDE)
	mm.buffer = _buf
	multimesh = mm
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/particles.gdshader")
	_mat.set_shader_parameter("noise_tex", preload("res://art/noise.png"))
	material_override = _mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gi_mode = GeometryInstance3D.GI_MODE_DISABLED


## Launches one particle. `color` is its HDR start colour and opacity,
## `color_end` the colour it fades toward; gravity pulls down (negative
## floats it up), drag bleeds its speed; kind 0 is a soft droplet or glow,
## 1 smoke, which also drifts with `breeze` (m/s) once its own push dies.
func emit(pos: Vector3, vel: Vector3, life: float, size: float, size_end: float, color: Color, color_end: Color, grav: float = 0.0, drag: float = 0.0, kind: int = 0, fade_in: float = 0.08, breeze: Vector2 = Vector2.ZERO) -> void:
	var o := _next * STRIDE
	_next = (_next + 1) % CAPACITY
	# the transform's rows, as MultiMesh lays them out: the shader reads its
	# columns back as velocity, (gravity, drag, kind), (breeze, end colour)
	_buf[o] = vel.x
	_buf[o + 1] = grav
	_buf[o + 2] = breeze.x
	_buf[o + 3] = pos.x
	_buf[o + 4] = vel.y
	_buf[o + 5] = drag
	_buf[o + 6] = breeze.y
	_buf[o + 7] = pos.y
	_buf[o + 8] = vel.z
	_buf[o + 9] = float(kind) + clampf(fade_in, 0.001, 0.999)
	_buf[o + 10] = _pack(color_end)
	_buf[o + 11] = pos.z
	_buf[o + 12] = color.r
	_buf[o + 13] = color.g
	_buf[o + 14] = color.b
	_buf[o + 15] = color.a
	_buf[o + 16] = _now
	_buf[o + 17] = life
	_buf[o + 18] = size
	_buf[o + 19] = size_end
	_dirty = true


## An HDR colour (0..16 a channel) as one exactly representable float, 8 bits
## a channel on a square-root scale.
static func _pack(c: Color) -> float:
	var r := roundi(sqrt(clampf(c.r, 0.0, 16.0) / 16.0) * 255.0)
	var g := roundi(sqrt(clampf(c.g, 0.0, 16.0) / 16.0) * 255.0)
	var b := roundi(sqrt(clampf(c.b, 0.0, 16.0) / 16.0) * 255.0)
	return float(r * 65536 + g * 256 + b)


## Ends every particle in flight.
func clear() -> void:
	for i in CAPACITY:
		_buf[i * STRIDE + 17] = 0.0
	_dirty = true


func _process(delta: float) -> void:
	_now += delta
	if _now > REBASE:
		_now -= REBASE
		for i in CAPACITY:
			_buf[i * STRIDE + 16] -= REBASE
		_dirty = true
	_mat.set_shader_parameter("now", _now)
	if _dirty:
		_dirty = false
		multimesh.buffer = _buf
