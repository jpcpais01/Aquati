class_name Particles
extends MultiMeshInstance3D
## The sea's spray, smoke, sparks and splinters: a ring of launched particles
## that the GPU flies on in closed form (shaders/particles.gdshader). emit()
## writes one slot of the instance buffer and the buffer goes up once a frame
## if anything was launched; nothing runs per particle per frame on the CPU.
##
## One draw holds both of the web game's pools: a glow (a flash, a spark, a
## flame) writes no coverage, so the same premultiplied blend that lays smoke
## over the sea adds the light on top.

const CAPACITY := 4096
## Floats per particle: a 3x4 transform, a colour and the custom vec4.
const STRIDE := 20
## The particles' clock is wound back by this much when it gets there, so the
## GPU's arithmetic on it stays precise however long you sail.
const REBASE := 1024.0

## Kinds: a soft droplet or glow, smoke, a hot spark, a tumbling splinter.
const SOFT := 0
const SMOKE := 1
const SPARK := 2
const CHUNK := 3

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
## floats it up), drag bleeds its speed. Smoke also drifts with `breeze`
## (m/s) once its own push dies; anything else turns at `spin` (rad/s).
## `glow` adds its light instead of covering what is behind it.
func emit(pos: Vector3, vel: Vector3, life: float, size: float, size_end: float, color: Color, color_end: Color, grav: float = 0.0, drag: float = 0.0, kind: int = SOFT, fade_in: float = 0.08, breeze: Vector2 = Vector2.ZERO, spin: float = 0.0, glow: bool = false) -> void:
	var o := _next * STRIDE
	_next = (_next + 1) % CAPACITY
	# the transform's rows, as MultiMesh lays them out: the shader reads its
	# columns back as velocity, (gravity, drag, kind), (breeze or spin, end colour)
	_buf[o] = vel.x
	_buf[o + 1] = grav
	_buf[o + 2] = breeze.x if kind == SMOKE else spin
	_buf[o + 3] = pos.x
	_buf[o + 4] = vel.y
	_buf[o + 5] = drag
	_buf[o + 6] = breeze.y
	_buf[o + 7] = pos.y
	_buf[o + 8] = vel.z
	_buf[o + 9] = float(kind + (4 if glow else 0)) + clampf(fade_in, 0.001, 0.999)
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


# ------------------------------------------------------------------ recipes

## White water thrown up where something strikes the sea: a crown of drops,
## a central column and a drifting mist.
func splash(pos: Vector3, scale: float = 1.0) -> void:
	var white := Color(1.3, 1.4, 1.45, 0.95)
	for i in int(22.0 * scale):
		var a := randf() * TAU
		var r := randf_range(0.5, 3.2)
		emit(pos + Vector3(cos(a) * 0.3, 0.1, sin(a) * 0.3), Vector3(cos(a) * r, randf_range(7.0, 15.0) * scale, sin(a) * r),
				randf_range(0.8, 1.4), randf_range(0.35, 0.8), 0.25, white, white, 16.0, 0.6, SOFT, 0.01)
	var column := Color(1.3, 1.38, 1.42, 0.7)
	for i in 4:
		emit(pos + Vector3(0.0, 0.3 + i * 0.6, 0.0), Vector3(0.0, randf_range(4.0, 9.0) * scale, 0.0),
				randf_range(0.7, 1.0), scale, 2.4 * scale, column, column, 9.0, 1.2, SMOKE)
	var mist := Color(1.2, 1.28, 1.32, 0.35)
	for i in 5:
		emit(pos + Vector3(randf_range(-1.0, 1.0), 0.4, randf_range(-1.0, 1.0)), Vector3(randf_range(-1.0, 1.0), randf_range(0.5, 1.5), randf_range(-1.0, 1.0)),
				randf_range(1.4, 2.4), 1.4 * scale, 4.5 * scale, mist, mist, 0.0, 1.5, SMOKE)


## A cloud of churned sand where a keel strikes the bottom (or a ball the shore).
func sand_hit(pos: Vector3) -> void:
	var sand := Color(1.0, 0.9, 0.7, 0.55)
	for i in 10:
		emit(pos, Vector3(randf_range(-4.0, 4.0), randf_range(2.0, 8.0), randf_range(-4.0, 4.0)),
				randf_range(1.0, 2.0), 1.0, randf_range(3.0, 5.0), sand, sand, 2.0, 1.6, SMOKE)


## A gun going off: the flash, a spit of sparks, and the three layers of
## powder smoke (a fast jet along the barrel, a slow bank by the port, dark
## wisps from the flash). `carry` is the ship's own way, which the smoke keeps.
func muzzle(pos: Vector3, dir: Vector3, carry: Vector3) -> void:
	emit(pos, Vector3.ZERO, 0.12, 2.6, 4.16, Color(9.0, 6.0, 2.6, 1.0), Color(4.0, 1.4, 0.3), 0.0, 0.0, SOFT, 0.001, Vector2.ZERO, 0.0, true)
	for i in 5:
		var sp := randf_range(10.0, 22.0)
		emit(pos, Vector3(dir.x * sp + randf_range(-2.0, 2.0) + carry.x, dir.y * sp + randf_range(-1.0, 2.0), dir.z * sp + randf_range(-2.0, 2.0) + carry.z),
				randf_range(0.1, 0.22), randf_range(0.8, 1.6), 0.3, Color(6.0, 3.2, 1.0, 1.0), Color(2.0, 0.5, 0.1), 0.0, 6.0, SOFT, 0.001, Vector2.ZERO, 0.0, true)
	for i in 8:
		var sp := randf_range(5.0, 16.0)
		var g := randf_range(0.74, 0.9)
		emit(pos + dir * 0.6, Vector3(dir.x * sp + randf_range(-1.4, 1.4) + carry.x * 0.6, randf_range(0.1, 1.4), dir.z * sp + randf_range(-1.4, 1.4) + carry.z * 0.6),
				randf_range(2.4, 4.0), randf_range(1.0, 1.7), randf_range(5.5, 8.5), Color(g * 1.1, g * 1.08, g * 1.05, randf_range(0.5, 0.72)), Color(g * 1.02, g * 1.02, g * 1.04), -0.3, 2.0, SMOKE, 0.04)
	for i in 4:
		var sp := randf_range(1.5, 4.0)
		var g := randf_range(0.82, 0.95)
		emit(pos + dir * 1.2 + Vector3(randf_range(-0.6, 0.6), randf_range(-0.2, 0.5), randf_range(-0.6, 0.6)), Vector3(dir.x * sp + carry.x * 0.8, randf_range(0.3, 0.9), dir.z * sp + carry.z * 0.8),
				randf_range(4.5, 6.5), randf_range(2.2, 3.2), randf_range(9.0, 13.0), Color(g, g, g * 1.02, randf_range(0.28, 0.4)), Color(g * 1.04, g * 1.04, g * 1.07), -0.18, 1.2, SMOKE, 0.25)
	for i in 3:
		var sp := randf_range(14.0, 24.0)
		emit(pos, Vector3(dir.x * sp + randf_range(-3.0, 3.0) + carry.x, randf_range(-0.5, 2.0), dir.z * sp + randf_range(-3.0, 3.0) + carry.z),
				randf_range(0.9, 1.5), randf_range(0.5, 0.8), randf_range(2.5, 3.5), Color(0.36, 0.33, 0.3, randf_range(0.5, 0.7)), Color(0.7, 0.68, 0.66), -0.2, 4.5, SMOKE, 0.01)


## A ball striking timber: a hot flash, a spray of tumbling splinters, a puff
## of dust and smoke, and a few sparks. `normal` points out of the hull.
func wood_hit(pos: Vector3, normal: Vector3) -> void:
	emit(pos, Vector3.ZERO, 0.16, 3.2, 4.5, Color(8.0, 4.5, 1.6, 1.0), Color(3.0, 0.8, 0.2), 0.0, 0.0, SOFT, 0.001, Vector2.ZERO, 0.0, true)
	for i in 16:
		var sp := randf_range(4.0, 13.0)
		var br := randf_range(0.55, 0.9)
		var c := Color(0.55 * br, 0.36 * br, 0.2 * br, 1.0)
		emit(pos, Vector3(normal.x * sp + randf_range(-4.0, 4.0), randf_range(3.0, 11.0), normal.z * sp + randf_range(-4.0, 4.0)),
				randf_range(0.9, 1.7), randf_range(0.18, 0.42), randf_range(0.18, 0.42), c, c, 18.0, 0.4, CHUNK, 0.001, Vector2.ZERO, randf_range(-14.0, 14.0))
	var dust := Color(0.42, 0.4, 0.38, 0.6)
	for i in 7:
		emit(pos, Vector3(normal.x * randf_range(1.0, 4.0) + randf_range(-1.0, 1.0), randf_range(0.5, 2.5), normal.z * randf_range(1.0, 4.0) + randf_range(-1.0, 1.0)),
				randf_range(1.5, 2.6), 1.2, randf_range(4.0, 6.0), dust, Color(0.62, 0.6, 0.58), -0.6, 1.3, SMOKE)
	for i in 8:
		emit(pos, Vector3(randf_range(-9.0, 9.0), randf_range(2.0, 10.0), randf_range(-9.0, 9.0)),
				randf_range(0.3, 0.7), randf_range(0.12, 0.25), randf_range(0.12, 0.25), Color(8.0, 4.0, 1.2, 1.0), Color(3.0, 0.6, 0.1), 14.0, 0.0, SPARK, 0.001, Vector2.ZERO, 0.0, true)


## A ship's magazine going up: a fireball, burning debris arcing out,
## timbers flung high, and a towering pall of black smoke.
func explosion(pos: Vector3, scale: float = 1.0) -> void:
	var at := pos + Vector3(0.0, 1.0, 0.0)
	emit(at, Vector3.ZERO, 0.35, 9.0 * scale, 16.0 * scale, Color(12.0, 6.0, 2.0, 1.0), Color(3.0, 0.8, 0.15), 0.0, 0.0, SOFT, 0.001, Vector2.ZERO, 0.0, true)
	for i in 26:
		var a := randf() * TAU
		var sp := randf_range(3.0, 12.0) * scale
		emit(at, Vector3(cos(a) * sp, randf_range(3.0, 14.0) * scale, sin(a) * sp),
				randf_range(0.5, 1.1), randf_range(1.4, 2.8) * scale, 0.5, Color(8.0, 3.4, 0.9, 1.0), Color(2.2, 0.4, 0.05), 3.0, 2.2, SOFT, 0.001, Vector2.ZERO, 0.0, true)
	for i in 30:
		var a := randf() * TAU
		var sp := randf_range(5.0, 18.0) * scale
		var br := randf_range(0.4, 0.8)
		var c := Color(0.5 * br, 0.34 * br, 0.2 * br, 1.0)
		var s := randf_range(0.3, 0.8)
		emit(at, Vector3(cos(a) * sp, randf_range(6.0, 20.0), sin(a) * sp),
				randf_range(1.2, 2.4), s, s, c, c, 18.0, 0.3, CHUNK, 0.001, Vector2.ZERO, randf_range(-12.0, 12.0))
	var pall := Color(0.2, 0.19, 0.18, 0.6)
	for i in 16:
		emit(pos + Vector3(randf_range(-2.0, 2.0), randf_range(1.0, 3.0), randf_range(-2.0, 2.0)), Vector3(randf_range(-2.0, 2.0), randf_range(1.5, 5.0), randf_range(-2.0, 2.0)),
				randf_range(3.0, 6.0), 3.0 * scale, randf_range(10.0, 16.0) * scale, pall, Color(0.5, 0.49, 0.48), -0.4, 0.8, SMOKE, 0.1)


## One tongue of flame licking up off a burning deck, and now and then the
## dark smoke it sends up.
func flame(pos: Vector3, intensity: float = 1.0) -> void:
	emit(pos + Vector3(randf_range(-0.5, 0.5), randf_range(0.0, 0.4), randf_range(-0.5, 0.5)), Vector3(randf_range(-0.4, 0.4), randf_range(2.0, 4.5), randf_range(-0.4, 0.4)),
			randf_range(0.45, 0.8), randf_range(0.9, 1.6) * intensity, 0.3, Color(7.0, 3.2, 0.8, 1.0), Color(3.0, 0.5, 0.08), 0.0, 0.0, SOFT, 0.05, Vector2.ZERO, randf_range(-2.0, 2.0), true)
	if randf() < 0.55:
		emit(pos + Vector3(randf_range(-0.4, 0.4), 1.2, randf_range(-0.4, 0.4)), Vector3(randf_range(-0.3, 0.3), randf_range(2.5, 4.5), randf_range(-0.3, 0.3)),
				randf_range(2.5, 4.5), 1.3 * intensity, randf_range(5.0, 8.0) * intensity, Color(0.22, 0.2, 0.19, 0.55), Color(0.45, 0.44, 0.43), -0.3, 0.35, SMOKE, 0.2)


## A twinkle of gold (a breach boarded over, a coin found).
func sparkle(pos: Vector3, scale: float = 1.0) -> void:
	emit(pos + Vector3(randf_range(-0.8, 0.8), randf_range(0.2, 1.4), randf_range(-0.8, 0.8)) * scale, Vector3(0.0, 0.8 * scale, 0.0),
			randf_range(0.5, 0.9), randf_range(0.3, 0.6) * scale, 0.05, Color(6.0, 4.6, 1.6, 1.0), Color(6.0, 4.6, 1.6), 0.0, 0.0, SPARK, 0.1, Vector2.ZERO, 0.0, true)


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
