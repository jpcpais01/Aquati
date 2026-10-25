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

## The muzzle blasts, in Cosmetics.BLAST_STYLES' order.
const POWDER := 0
const SEASALT := 1
const SOOT := 2
const EMBER := 3
const RING := 4
const AZURE := 5
const CONFETTI := 6
const DRAGON := 7
const THUNDER := 8
const WRAITH := 9
## The Hollow Jack's own (an event ship's: no vault item): a jack-o'-lantern's
## orange flash, green ghost-fire licking through it, pumpkin embers and
## violet smoke; and the same in her trail.
const HALLOW := 10
## The carnival salute's paper.
const CONFETTI_COLOURS: Array[Color] = [Color(1.5, 0.35, 0.75), Color(1.5, 1.2, 0.2), Color(0.25, 1.2, 1.5), Color(0.6, 1.4, 0.3),
		Color(1.5, 0.6, 0.15), Color(0.9, 0.45, 1.5), Color(1.6, 1.6, 1.6)]

## The breeze smoke rides when it is launched with none of its own.
var wind: Wind

var _buf := PackedFloat32Array()
var _next := 0
var _now := 0.0
var _dirty := false
var _mat: ShaderMaterial
var _breeze := Vector2.ZERO


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
## (m/s; the wind's, if none) once its own push dies; anything else turns at
## `spin` (rad/s). `glow` adds its light instead of covering what is behind it.
func emit(pos: Vector3, vel: Vector3, life: float, size: float, size_end: float, color: Color, color_end: Color, grav: float = 0.0, drag: float = 0.0, kind: int = SOFT, fade_in: float = 0.08, breeze: Vector2 = Vector2.ZERO, spin: float = 0.0, glow: bool = false) -> void:
	var o := _next * STRIDE
	_next = (_next + 1) % CAPACITY
	# the transform's rows, as MultiMesh lays them out: the shader reads its
	# columns back as velocity, (gravity, drag, kind), (breeze or spin, end colour)
	_buf[o] = vel.x
	_buf[o + 1] = grav
	var bz := breeze if breeze != Vector2.ZERO else _breeze
	_buf[o + 2] = bz.x if kind == SMOKE else spin
	_buf[o + 3] = pos.x
	_buf[o + 4] = vel.y
	_buf[o + 5] = drag
	_buf[o + 6] = bz.y
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


## A gun going off in one of the vault's blasts (Cosmetics.BLAST_STYLES; the
## web's muzzle): the flash, a spit of sparks, and the three layers of
## powder smoke (a fast jet along the barrel, a slow bank by the port, dark
## wisps from the flash), each blast its own. `carry` is the ship's own way,
## which the smoke keeps.
func muzzle(pos: Vector3, dir: Vector3, carry: Vector3, style := POWDER) -> void:
	match style:
		SEASALT:
			_flash(pos, 2.8, Color(9.0, 9.4, 10.0), Color(3.0, 3.6, 4.4))
			_sparks(pos, dir, carry, 6, Color(7.0, 7.5, 8.0), Color(2.5, 3.0, 3.6))
			_smoke(pos, dir, carry, Color(1.12, 1.14, 1.16), 9, 6, 0, 1.15)
			var salt := Color(1.4, 1.5, 1.55, 0.9)
			for i in 10:
				var sp := randf_range(6.0, 14.0)
				emit(pos, Vector3(dir.x * sp + randf_range(-2.0, 2.0) + carry.x, randf_range(1.0, 5.0), dir.z * sp + randf_range(-2.0, 2.0) + carry.z),
						randf_range(0.6, 1.1), randf_range(0.1, 0.2), 0.08, salt, salt, 12.0, 1.2, SOFT, 0.01)
		SOOT:
			_flash(pos, 3.0, Color(9.0, 4.6, 1.3), Color(3.5, 1.0, 0.2))
			_sparks(pos, dir, carry, 7, Color(7.0, 3.0, 0.8), Color(2.0, 0.5, 0.1))
			_smoke(pos, dir, carry, Color(0.4, 0.37, 0.35), 9, 5, 6, 1.25)
		EMBER:
			_flash(pos, 3.0, Color(10.0, 5.2, 1.6), Color(4.0, 1.2, 0.2))
			_sparks(pos, dir, carry, 6, Color(8.0, 3.6, 0.9), Color(2.4, 0.5, 0.06))
			_embers(pos, dir, carry, 26, 1.0)
			_smoke(pos, dir, carry, Color(1.08, 0.98, 0.88), 7, 3, 2)
		RING:
			_flash(pos, 2.4, Color(9.0, 6.0, 2.6), Color(4.0, 1.4, 0.3))
			# a vortex ring rolling out of the gunport, widening as it goes
			var side := Vector3(-dir.z, 0.0, dir.x).normalized()
			for i in 26:
				var a := TAU * i / 26.0
				var r := Vector3(side.x * cos(a), sin(a), side.z * cos(a))
				var sp := randf_range(7.5, 8.5)
				emit(pos + Vector3(dir.x * 1.1, 0.0, dir.z * 1.1) + r * 0.35, Vector3(dir.x * sp + carry.x * 0.7, 0.35, dir.z * sp + carry.z * 0.7) + r * 2.6,
						randf_range(2.6, 3.2), 0.7, randf_range(2.0, 2.4), Color(1.12, 1.12, 1.14, 0.78), Color(1.05, 1.06, 1.1), -0.12, 1.25, SMOKE, 0.03)
			_smoke(pos, dir, carry, Color(1.0, 1.0, 1.0), 3, 2, 0, 0.7)
		AZURE:
			_flash(pos, 3.0, Color(3.0, 6.5, 11.0), Color(0.5, 1.6, 4.5))
			_sparks(pos, dir, carry, 12, Color(2.5, 6.0, 10.0), Color(0.4, 1.4, 4.0), SPARK)
			for i in 9:
				var sp := randf_range(6.0, 16.0)
				emit(pos, Vector3(dir.x * sp + randf_range(-1.0, 1.0) + carry.x, randf_range(-0.2, 1.0), dir.z * sp + randf_range(-1.0, 1.0) + carry.z),
						randf_range(0.25, 0.45), randf_range(0.6, 1.0), randf_range(1.6, 2.4), Color(2.0, 4.6, 9.0), Color(0.3, 0.7, 2.4), 0.0, 4.0, SOFT, 0.001, Vector2.ZERO, 0.0, true)
			_smoke(pos, dir, carry, Color(0.84, 0.94, 1.18), 8, 3, 0)
		CONFETTI:
			_flash(pos, 2.2, Color(9.0, 8.0, 5.0), Color(4.0, 2.6, 1.0))
			for i in 46:
				var sp := randf_range(5.0, 15.0)
				var c: Color = CONFETTI_COLOURS[i % CONFETTI_COLOURS.size()]
				var sz := randf_range(0.13, 0.22)
				emit(pos + Vector3(dir.x, 0.0, dir.z) * 0.5, Vector3(dir.x * sp + randf_range(-4.0, 4.0) + carry.x, randf_range(2.0, 9.0), dir.z * sp + randf_range(-4.0, 4.0) + carry.z),
						randf_range(2.4, 4.0), sz, sz, c, c, 2.4, 1.9, CHUNK, 0.001, Vector2.ZERO, randf_range(-12.0, 12.0))
			for i in 14:
				var sp := randf_range(4.0, 12.0)
				emit(pos, Vector3(dir.x * sp + randf_range(-3.0, 3.0) + carry.x, randf_range(1.0, 6.0), dir.z * sp + randf_range(-3.0, 3.0) + carry.z),
						randf_range(0.5, 1.0), randf_range(0.2, 0.35), 0.05, Color(7.0, 5.5, 2.0), Color(3.0, 1.6, 0.4), 2.0, 2.0, SPARK, 0.01, Vector2.ZERO, 0.0, true)
			_smoke(pos, dir, carry, Color(1.08, 1.06, 1.1), 4, 2, 0, 0.8)
		DRAGON:
			_flash(pos, 3.8, Color(12.0, 7.0, 2.2), Color(4.0, 1.2, 0.2))
			# a roaring cone of fire, white-hot at the mouth (kept well under
			# white where its flames overlap: there's no bloom to carry it)
			for i in 30:
				var sp := randf_range(12.0, 30.0)
				var spread := sp * 0.12
				var hot := i < 10
				emit(pos, Vector3(dir.x * sp + randf_range(-spread, spread) + carry.x, randf_range(-spread, spread) * 0.6 + 0.6, dir.z * sp + randf_range(-spread, spread) + carry.z),
						randf_range(0.35, 0.7) * (0.7 if hot else 1.0), randf_range(0.6, 1.0), randf_range(2.0, 3.0), Color(3.4, 2.4, 1.0) if hot else Color(2.8, 1.25, 0.3), Color(0.85, 0.15, 0.02),
						-2.5, 2.6, SOFT, 0.001, Vector2.ZERO, randf_range(-2.0, 2.0), true)
			_embers(pos, dir, carry, 20, 1.3)
			_smoke(pos, dir, carry, Color(0.34, 0.31, 0.3), 8, 4, 3, 1.1)
		THUNDER:
			_flash(pos, 3.4, Color(8.0, 8.5, 13.0), Color(3.0, 2.0, 9.0))
			# crackling arcs flung every way, mostly forward
			for i in 18:
				var sp := randf_range(18.0, 42.0)
				var f := randf_range(0.2, 1.0)
				emit(pos, Vector3(dir.x * sp * f + randf_range(-1.0, 1.0) * sp * 0.6 + carry.x, randf_range(-0.5, 1.0) * sp * 0.4, dir.z * sp * f + randf_range(-1.0, 1.0) * sp * 0.6 + carry.z),
						randf_range(0.12, 0.3), randf_range(0.18, 0.3), 0.05, Color(7.0, 7.0, 14.0), Color(3.0, 1.5, 9.0), 0.0, 8.0, SPARK, 0.001, Vector2.ZERO, 0.0, true)
			# a flat violet shock ring racing out over the water
			for i in 24:
				var a := TAU * i / 24.0
				emit(pos + Vector3(dir.x * 1.5, -0.3, dir.z * 1.5), Vector3(cos(a) * 15.0 + carry.x, 0.0, sin(a) * 15.0 + carry.z),
						0.32, 0.9, 1.8, Color(2.2, 1.8, 5.5), Color(0.6, 0.4, 2.2), 0.0, 3.2, SOFT, 0.001, Vector2.ZERO, 0.0, true)
			_smoke(pos, dir, carry, Color(1.02, 1.0, 1.1), 7, 3, 0)
		WRAITH:
			# a phantom's gun: a cold green flash, ghost-fire licking out of the
			# port, and pale corpse-light smoke that hangs too long
			_flash(pos, 2.6, Color(1.2, 5.2, 3.1), Color(0.15, 1.6, 0.8))
			_sparks(pos, dir, carry, 6, Color(2.4, 8.0, 5.0), Color(0.2, 1.8, 0.9))
			for i in 16:
				var sp := randf_range(7.0, 18.0)
				emit(pos, Vector3(dir.x * sp + randf_range(-1.6, 1.6) + carry.x, randf_range(-0.3, 1.6), dir.z * sp + randf_range(-1.6, 1.6) + carry.z),
						randf_range(0.3, 0.6), randf_range(0.5, 0.9), randf_range(1.6, 2.6), Color(1.6, 7.5, 4.2), Color(0.1, 1.2, 0.55), -2.4, 3.0, SOFT, 0.001, Vector2.ZERO, randf_range(-2.0, 2.0), true)
			_smoke(pos, dir, carry, Color(0.74, 1.08, 0.94), 7, 4, 0, 0.75)
		HALLOW:
			_flash(pos, 3.2, Color(10.0, 4.2, 0.6), Color(3.0, 0.7, 0.05))
			_sparks(pos, dir, carry, 6, Color(8.0, 3.4, 0.5), Color(2.2, 0.4, 0.02))
			for i in 12:
				var sp := randf_range(7.0, 17.0)
				emit(pos, Vector3(dir.x * sp + randf_range(-1.8, 1.8) + carry.x, randf_range(-0.3, 1.8), dir.z * sp + randf_range(-1.8, 1.8) + carry.z),
						randf_range(0.35, 0.65), randf_range(0.5, 0.9), randf_range(1.6, 2.6), Color(1.4, 6.8, 3.6), Color(0.1, 1.1, 0.5), -2.8, 3.0, SOFT, 0.001, Vector2.ZERO, randf_range(-2.0, 2.0), true)
			_embers(pos, dir, carry, 14, 0.9)
			_smoke(pos, dir, carry, Color(0.62, 0.5, 0.74), 8, 4, 2, 1.05)
		_:
			_flash(pos, 2.6, Color(9.0, 6.0, 2.6), Color(4.0, 1.4, 0.3))
			_sparks(pos, dir, carry, 5, Color(6.0, 3.2, 1.0), Color(2.0, 0.5, 0.1))
			_smoke(pos, dir, carry)


## What a vault trail leaves hanging behind a round shot at `pos` (flying at
## `vel`), every few hundredths of a second (the web's trail(); `now` turns
## the ghostlight's coils and the rainbow's colours). Powder and soot leave
## only their smoke.
func trail_mote(pos: Vector3, vel: Vector3, style: int, now: float) -> void:
	var j := func(r: float) -> Vector3: return Vector3(randf_range(-r, r), randf_range(-r, r), randf_range(-r, r))
	match style:
		1:
			var c := Color(1.4, 1.5, 1.55, 0.85)
			emit(pos + j.call(0.08), Vector3(randf_range(-1.0, 1.0), randf_range(0.0, 1.5), randf_range(-1.0, 1.0)), randf_range(0.4, 0.7), randf_range(0.08, 0.14), 0.05,
					c, c, 9.0, 0.0, SOFT, 0.01)
		3:
			emit(pos + j.call(0.08), Vector3(randf_range(-0.8, 0.8), randf_range(-0.5, 1.2), randf_range(-0.8, 0.8)), randf_range(0.5, 1.0), randf_range(0.14, 0.24), 0.04,
					Color(7.0, 3.0, 0.6), Color(2.0, 0.3, 0.02), 5.0, 0.6, SPARK, 0.01, Vector2.ZERO, 0.0, true)
		4:
			if randf() < 0.7:
				emit(pos + j.call(0.24), Vector3(randf_range(-0.4, 0.4), randf_range(-0.6, 0.2), randf_range(-0.4, 0.4)), randf_range(0.6, 1.1), randf_range(0.12, 0.2), 0.03,
						Color(3.0, 5.0, 7.0), Color(1.0, 2.4, 4.0), 0.0, 0.0, SPARK, 0.05, Vector2.ZERO, 0.0, true)
		5:
			if randf() < 0.6:
				emit(pos + j.call(0.16), Vector3(randf_range(-0.6, 0.6), randf_range(-0.4, 0.6), randf_range(-0.6, 0.6)), randf_range(0.7, 1.2), randf_range(0.14, 0.24), 0.03,
						Color(7.0, 5.0, 1.6), Color(3.0, 1.4, 0.2), 1.5, 0.0, SPARK, 0.01, Vector2.ZERO, 0.0, true)
		6, 9:
			# will-o'-wisp motes drifting off the green ribbon
			if randf() < 0.6:
				var ph := now * 6.0
				emit(pos + Vector3(sin(ph) * 0.25, cos(ph * 1.3) * 0.25, randf_range(-0.16, 0.16)), Vector3(randf_range(-0.4, 0.4), randf_range(0.3, 1.0), randf_range(-0.4, 0.4)),
						randf_range(0.6, 1.1), randf_range(0.12, 0.2), 0.03, Color(1.5, 5.0, 3.0), Color(0.15, 1.1, 0.6), 0.0, 0.0, SPARK, 0.02, Vector2.ZERO, 0.0, true)
		7:
			if randf() < 0.7:
				var h := Color.from_hsv(fposmod(now * 0.7 + randf_range(-0.25, 0.25), 1.0), 1.0, 1.0)
				emit(pos + j.call(0.24), Vector3(randf_range(-0.8, 0.8), randf_range(-0.3, 0.9), randf_range(-0.8, 0.8)), randf_range(0.7, 1.3), randf_range(0.14, 0.24), 0.03,
						Color(h.r * 5.0, h.g * 5.0, h.b * 5.0), h, 1.0, 0.0, SPARK, 0.01, Vector2.ZERO, 0.0, true)
		10:
			# pumpkin embers and will-o'-wisps, turn about
			if randf() < 0.5:
				emit(pos + j.call(0.1), Vector3(randf_range(-0.7, 0.7), randf_range(-0.4, 1.0), randf_range(-0.7, 0.7)), randf_range(0.5, 0.9), randf_range(0.14, 0.24), 0.04,
						Color(7.5, 2.8, 0.35), Color(2.0, 0.3, 0.02), 3.0, 0.6, SPARK, 0.01, Vector2.ZERO, 0.0, true)
			elif randf() < 0.7:
				var ph := now * 5.0
				emit(pos + Vector3(sin(ph) * 0.22, cos(ph * 1.3) * 0.22, randf_range(-0.14, 0.14)), Vector3(randf_range(-0.4, 0.4), randf_range(0.3, 1.0), randf_range(-0.4, 0.4)),
						randf_range(0.6, 1.0), randf_range(0.12, 0.2), 0.03, Color(1.4, 5.0, 2.8), Color(0.15, 1.1, 0.55), 0.0, 0.0, SPARK, 0.02, Vector2.ZERO, 0.0, true)
		8:
			var c := Color(6.0, 6.0, 7.5) if randf() < 0.5 else Color(4.5, 3.2, 8.0)
			emit(pos + j.call(0.16), Vector3(randf_range(-0.3, 0.3) - vel.x * 0.02, randf_range(-0.4, 0.2), randf_range(-0.3, 0.3) - vel.z * 0.02), randf_range(1.3, 2.2), randf_range(0.2, 0.34), 0.06,
					c, Color(1.6, 1.2, 3.0), 0.5, 1.0, SPARK, 0.02, Vector2.ZERO, 0.0, true)


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


## A twinkle of gold (a breach boarded over, a coin found), or of a
## rarity's colour (`tint`, linear) over plunder afloat.
func sparkle(pos: Vector3, scale: float = 1.0, tint: Variant = null) -> void:
	var c := Color(6.0, 4.6, 1.6) if tint == null else (tint as Color) * 2.2
	c.a = 1.0
	emit(pos + Vector3(randf_range(-0.8, 0.8), randf_range(0.2, 1.4), randf_range(-0.8, 0.8)) * scale, Vector3(0.0, 0.8 * scale, 0.0),
			randf_range(0.5, 0.9), randf_range(0.3, 0.6) * scale, 0.05, c, c, 0.0, 0.0, SPARK, 0.1, Vector2.ZERO, 0.0, true)


## Plunder hauled aboard: a flash, a fountain of gold coins and a ring of
## rarity-coloured sparks racing out across the water; the finest chests
## send a pillar of motes spiralling up to the sky. `tint` is linear.
func treasure(pos: Vector3, tint: Color, tier: int) -> void:
	var big := 0.6 + tier * 0.35
	_flash(pos + Vector3(0.0, 0.8, 0.0), 2.0 * big, tint * 2.4, tint * 0.4, 0.35 + tier * 0.08, 3.0)
	var coin := Color(5.5, 3.8, 1.1, 1.0)
	for i in 8 + tier * 8:
		var a := randf() * TAU
		var r := randf_range(1.0, 3.5) * big
		var s := randf_range(0.16, 0.26)
		emit(pos + Vector3(0.0, 0.6, 0.0), Vector3(cos(a) * r, randf_range(6.0, 11.0) * sqrt(big), sin(a) * r),
				randf_range(0.8, 1.3), s, s, coin, Color(3.0, 1.6, 0.3), 16.0, 0.4, CHUNK, 0.001, Vector2.ZERO, randf_range(-14.0, 14.0), true)
	var ring := 10 + tier * 8
	var hot := tint * 3.0
	hot.a = 1.0
	for i in ring:
		var a := float(i) / ring * TAU + randf_range(-0.1, 0.1)
		var sp := randf_range(5.0, 8.0) * big
		emit(pos + Vector3(0.0, 0.4, 0.0), Vector3(cos(a) * sp, randf_range(0.5, 2.0), sin(a) * sp),
				randf_range(0.5, 0.8), randf_range(0.25, 0.45), 0.05, hot, tint * 0.8, 0.0, 2.4, SPARK, 0.001, Vector2.ZERO, 0.0, true)
	if tier >= 3:
		var mote := tint * 2.6
		mote.a = 1.0
		for i in tier * 10:
			var a := i * 0.7
			var r := randf_range(0.4, 1.4)
			emit(pos + Vector3(cos(a) * r, randf_range(0.0, 2.0), sin(a) * r), Vector3(-sin(a) * 1.5, randf_range(5.0, 12.0), cos(a) * 1.5),
					randf_range(0.9, 1.6), randf_range(0.25, 0.5), 0.05, mote, Color(1.5, 1.2, 0.5), 0.0, 0.6, SPARK, 0.02, Vector2.ZERO, 0.0, true)


# ------------------------------------------------------------- shot types

## What a special load adds to the gun's own blast: a shell's fuse catching
## in a spit of sparks, a gout of flame and embers off red-hot shot, iron
## grinding on iron as the chain whips out, a bag of grape bursting in a cone.
func shot_muzzle(pos: Vector3, dir: Vector3, carry: Vector3, kind: int) -> void:
	match kind:
		Ammo.SHELL:
			_sparks(pos, dir, carry, 7, Color(9.0, 6.0, 2.0), Color(3.0, 1.0, 0.15), SPARK)
		Ammo.FIRE:
			for i in 12:
				var sp := randf_range(8.0, 20.0)
				emit(pos, Vector3(dir.x * sp + randf_range(-1.5, 1.5) + carry.x, randf_range(0.0, 1.5), dir.z * sp + randf_range(-1.5, 1.5) + carry.z),
						randf_range(0.25, 0.5), randf_range(0.5, 0.9), randf_range(1.6, 2.4), Color(10.0, 4.4, 1.0, 1.0), Color(2.6, 0.4, 0.04), -2.0, 3.0, SOFT, 0.001, Vector2.ZERO, randf_range(-2.0, 2.0), true)
			_embers(pos, dir, carry, 18, 1.1)
		Ammo.CHAIN:
			_sparks(pos, dir, carry, 5, Color(6.0, 6.0, 6.5), Color(1.6, 1.6, 2.0), SPARK)
		Ammo.FIREWORK:
			# a rocket's fuse catching: a fizzing fountain of sparks up the line of flight and a puff of pale smoke
			var ux := dir.x * 0.34
			var uz := dir.z * 0.34
			for i in 16:
				var sp := randf_range(5.0, 16.0)
				emit(pos + Vector3(0.0, 0.3, 0.0), Vector3((ux + randf_range(-0.25, 0.25)) * sp + carry.x, randf_range(0.6, 0.94) * sp, (uz + randf_range(-0.25, 0.25)) * sp + carry.z),
						randf_range(0.25, 0.6), randf_range(0.12, 0.22), 0.03, Color(8.0, 5.6, 2.2, 1.0), Color(3.0, 0.9, 0.3), 9.0, 2.5, SPARK, 0.001, Vector2.ZERO, 0.0, true)
			_flash(pos, 1.4, Color(8.0, 6.0, 4.0), Color(3.0, 1.4, 1.6))
			for i in 4:
				emit(pos + Vector3(randf_range(-0.4, 0.4), randf_range(0.0, 0.8), randf_range(-0.4, 0.4)), Vector3(ux * 4.0 + carry.x * 0.8 + randf_range(-0.5, 0.5), randf_range(1.5, 3.5), uz * 4.0 + carry.z * 0.8 + randf_range(-0.5, 0.5)),
						randf_range(2.2, 3.4), randf_range(0.8, 1.2), randf_range(3.5, 5.0), Color(0.95, 0.93, 0.92, 0.4), Color(0.95, 0.93, 0.92), -0.25, 1.4, SMOKE, 0.05, Vector2.ZERO, randf_range(-0.4, 0.4))
		Ammo.GRAPE:
			for i in 14:
				var sp := randf_range(14.0, 30.0)
				emit(pos, Vector3(dir.x * sp + randf_range(-5.0, 5.0) + carry.x, randf_range(-1.0, 3.0), dir.z * sp + randf_range(-5.0, 5.0) + carry.z),
						randf_range(0.12, 0.26), randf_range(0.16, 0.26), 0.04, Color(7.0, 5.0, 2.4, 1.0), Color(2.0, 0.8, 0.2), 0.0, 5.0, SPARK, 0.001, Vector2.ZERO, 0.0, true)
			for i in 5:
				var sp := randf_range(6.0, 14.0)
				emit(pos + Vector3(dir.x, 0.0, dir.z), Vector3(dir.x * sp + randf_range(-3.0, 3.0) + carry.x, randf_range(0.0, 1.2), dir.z * sp + randf_range(-3.0, 3.0) + carry.z),
						randf_range(1.6, 2.6), randf_range(0.8, 1.2), randf_range(4.0, 6.0), Color(0.88, 0.87, 0.85, 0.5), Color(0.88, 0.87, 0.85), -0.2, 2.4, SMOKE, 0.03)


## An explosive shell bursting: a fireball, shrapnel, timbers flung up, a
## black-brown pall that rolls up and hangs, and the sea thrown up in a white
## column round it if it burst in the water.
func shell_burst(pos: Vector3, water: bool, scale: float = 1.0) -> void:
	_flash(pos + Vector3(0.0, 0.5, 0.0), 6.0 * scale, Color(14.0, 9.0, 4.0), Color(4.0, 1.4, 0.3), 0.16, 11.0 / 6.0)
	var at := pos + Vector3(0.0, 0.6, 0.0)
	for i in 16:
		var a := randf() * TAU
		var sp := randf_range(2.0, 9.0) * scale
		emit(at, Vector3(cos(a) * sp, randf_range(2.0, 10.0) * scale, sin(a) * sp),
				randf_range(0.35, 0.75), randf_range(1.2, 2.2) * scale, randf_range(2.5, 3.6) * scale, Color(10.0, 4.2, 1.1, 1.0), Color(2.2, 0.35, 0.04), -1.0, 3.0, SOFT, 0.001, Vector2.ZERO, randf_range(-2.0, 2.0), true)
	at = pos + Vector3(0.0, 0.5, 0.0)
	for i in 26:
		var a := randf() * TAU
		var sp := randf_range(14.0, 34.0)
		emit(at, Vector3(cos(a) * sp, randf_range(1.0, 12.0), sin(a) * sp),
				randf_range(0.25, 0.6), randf_range(0.18, 0.3), 0.04, Color(9.0, 7.0, 3.6, 1.0), Color(3.0, 1.0, 0.2), 10.0, 2.2, SPARK, 0.001, Vector2.ZERO, 0.0, true)
	for i in 12:
		var a := randf() * TAU
		var sp := randf_range(4.0, 12.0)
		var br := randf_range(0.25, 0.5)
		var c := Color(br, br * 0.9, br * 0.8, 1.0)
		var s := randf_range(0.15, 0.35)
		emit(at, Vector3(cos(a) * sp, randf_range(5.0, 14.0), sin(a) * sp),
				randf_range(1.0, 1.8), s, s, c, c, 18.0, 0.3, CHUNK, 0.001, Vector2.ZERO, randf_range(-14.0, 14.0))
	for i in 9:
		emit(pos + Vector3(randf_range(-1.0, 1.0), randf_range(0.5, 2.0), randf_range(-1.0, 1.0)), Vector3(randf_range(-1.6, 1.6), randf_range(1.5, 4.0), randf_range(-1.6, 1.6)),
				randf_range(2.6, 4.5), 2.2 * scale, randf_range(7.0, 10.0) * scale, Color(0.2, 0.18, 0.17, 0.62), Color(0.48, 0.46, 0.45), -0.35, 0.9, SMOKE, 0.06)
	if water:
		splash(pos, 1.5)
		var white := Color(1.3, 1.36, 1.4, 0.5)
		for i in 16:
			var a := float(i) / 16.0 * TAU
			emit(pos + Vector3(0.0, 0.2, 0.0), Vector3(cos(a) * 9.0, randf_range(1.0, 3.0), sin(a) * 9.0),
					randf_range(0.8, 1.2), 1.4, 3.4, white, white, 2.0, 2.4, SMOKE, 0.01)


## Fire shot striking home: a burst of flame that catches and climbs, and a
## shower of embers.
func fire_hit(pos: Vector3) -> void:
	_flash(pos, 4.0, Color(10.0, 4.5, 1.2), Color(3.0, 0.6, 0.06), 0.2, 1.5)
	for i in 14:
		emit(pos + Vector3(randf_range(-0.6, 0.6), randf_range(-0.2, 0.4), randf_range(-0.6, 0.6)), Vector3(randf_range(-1.5, 1.5), randf_range(2.5, 6.0), randf_range(-1.5, 1.5)),
				randf_range(0.4, 0.8), randf_range(0.8, 1.5), 0.3, Color(9.0, 3.8, 0.9, 1.0), Color(3.0, 0.5, 0.06), 0.0, 1.0, SOFT, 0.02, Vector2.ZERO, randf_range(-2.0, 2.0), true)
	for i in 16:
		emit(pos, Vector3(randf_range(-7.0, 7.0), randf_range(2.0, 9.0), randf_range(-7.0, 7.0)),
				randf_range(0.8, 1.6), randf_range(0.14, 0.26), 0.04, Color(8.0, 3.4, 0.7, 1.0), Color(2.4, 0.4, 0.04), 9.0, 0.7, SPARK, 0.01, Vector2.ZERO, 0.0, true)


## Hot iron into the sea: a hissing gout of steam.
func steam(pos: Vector3) -> void:
	splash(pos, 0.6)
	var c := Color(1.32, 1.34, 1.36, 0.42)
	for i in 9:
		emit(pos + Vector3(randf_range(-0.5, 0.5), 0.3, randf_range(-0.5, 0.5)), Vector3(randf_range(-0.8, 0.8), randf_range(2.0, 5.0), randf_range(-0.8, 0.8)),
				randf_range(1.4, 2.4), 0.8, randf_range(3.5, 5.0), c, c, -0.8, 1.4, SMOKE, 0.04, Vector2.ZERO, randf_range(-0.6, 0.6))


## A bolt of lightning striking the sea: a burst of light where it meets
## the water, and the sea boiling up into steam.
func lightning(pos: Vector3) -> void:
	_flash(pos + Vector3(0.0, 2.0, 0.0), 40.0, Color(6.0, 7.0, 10.0), Color(0.5, 0.6, 1.0), 0.5, 70.0 / 40.0)
	var c := Color(0.9, 0.92, 0.95, 0.35)
	for i in 6:
		emit(pos + Vector3(randf_range(-4.0, 4.0), 0.0, randf_range(-4.0, 4.0)), Vector3(randf_range(-1.5, 1.5), randf_range(2.0, 5.0), randf_range(-1.5, 1.5)),
				randf_range(3.0, 5.0), 6.0, 22.0, c, c, 0.0, 0.6, SMOKE, 0.2)


## A grape ball striking a deck: a spark and a puff of splinters, not a breach.
func pellet_hit(pos: Vector3) -> void:
	_flash(pos, 0.9, Color(7.0, 4.2, 1.6), Color(2.0, 0.6, 0.1), 0.08, 1.4 / 0.9)
	for i in 4:
		var br := randf_range(0.55, 0.9)
		var c := Color(0.55 * br, 0.36 * br, 0.2 * br, 1.0)
		var s := randf_range(0.08, 0.2)
		emit(pos, Vector3(randf_range(-4.0, 4.0), randf_range(2.0, 7.0), randf_range(-4.0, 4.0)),
				randf_range(0.6, 1.1), s, s, c, c, 18.0, 0.4, CHUNK, 0.001, Vector2.ZERO, randf_range(-14.0, 14.0))


## Chain shot through the rigging: canvas torn to ribbons (`sail`, linear),
## cordage and splinters whirling away, a sigh of dust and a few sparks off
## the iron.
func shreds(pos: Vector3, vel: Vector3, sail: Color) -> void:
	var cloth := Color(sail.r, sail.g, sail.b, 1.0)
	for i in 18:
		var s := randf_range(0.18, 0.45)
		emit(pos + Vector3(randf_range(-1.2, 1.2), randf_range(-1.0, 1.0), randf_range(-1.2, 1.2)), Vector3(vel.x * 0.06 + randf_range(-3.0, 3.0), randf_range(-0.5, 3.0), vel.z * 0.06 + randf_range(-3.0, 3.0)),
				randf_range(1.6, 3.0), s, s, cloth, cloth, 2.2, 2.4, CHUNK, 0.001, Vector2.ZERO, randf_range(-9.0, 9.0))
	var cord := Color(0.3, 0.22, 0.14, 1.0)
	for i in 6:
		var s := randf_range(0.1, 0.18)
		emit(pos, Vector3(vel.x * 0.05 + randf_range(-4.0, 4.0), randf_range(0.0, 4.0), vel.z * 0.05 + randf_range(-4.0, 4.0)),
				randf_range(1.0, 1.8), s, s, cord, cord, 9.0, 1.0, CHUNK, 0.001, Vector2.ZERO, randf_range(-12.0, 12.0))
	emit(pos, Vector3(vel.x * 0.04, 0.0, vel.z * 0.04), 1.4, 1.0, 3.4, Color(sail.r, sail.g, sail.b, 0.3), cloth, 0.0, 2.0, SMOKE)
	for i in 4:
		emit(pos, Vector3(randf_range(-8.0, 8.0), randf_range(-2.0, 6.0), randf_range(-8.0, 8.0)),
				randf_range(0.15, 0.3), randf_range(0.16, 0.24), 0.04, Color(6.0, 6.0, 6.5, 1.0), Color(1.5, 1.5, 2.0), 0.0, 4.0, SPARK, 0.001, Vector2.ZERO, 0.0, true)


## A burst of light that swells and dies: `grow` times its size by the end.
func _flash(pos: Vector3, size: float, c0: Color, c1: Color, life: float = 0.12, grow: float = 1.6) -> void:
	c0.a = 1.0
	emit(pos, Vector3.ZERO, life, size, size * grow, c0, c1, 0.0, 0.0, SOFT, 0.001, Vector2.ZERO, 0.0, true)


## Sparks spat out along the bore.
func _sparks(pos: Vector3, dir: Vector3, carry: Vector3, n: int, c0: Color, c1: Color, kind: int = SOFT) -> void:
	c0.a = 1.0
	var spark := kind == SPARK
	for i in n:
		var sp := randf_range(10.0, 22.0)
		emit(pos, Vector3(dir.x * sp + randf_range(-2.0, 2.0) + carry.x, dir.y * sp + randf_range(-1.0, 2.0), dir.z * sp + randf_range(-2.0, 2.0) + carry.z),
				randf_range(0.1, 0.22), randf_range(0.2, 0.32) if spark else randf_range(0.8, 1.6), 0.05 if spark else 0.3, c0, c1, 0.0, 6.0, kind, 0.001, Vector2.ZERO, 0.0, true)


## Glowing embers that arc out and fall to the sea.
func _embers(pos: Vector3, dir: Vector3, carry: Vector3, n: int, reach: float) -> void:
	for i in n:
		var sp := randf_range(5.0, 15.0) * reach
		emit(pos, Vector3(dir.x * sp + randf_range(-3.0, 3.0) + carry.x, randf_range(2.0, 9.0), dir.z * sp + randf_range(-3.0, 3.0) + carry.z),
				randf_range(1.0, 2.2), randf_range(0.14, 0.28), 0.05, Color(7.0, 3.2, 0.7, 1.0), Color(2.4, 0.4, 0.04), 8.0, 0.7, SPARK, 0.01, Vector2.ZERO, 0.0, true)


## The three layers of gun smoke, `tint`ed and `alpha` times as thick: a
## fast dense jet out along the barrel, a slow bank that hangs by the
## gunport, and dark powder wisps from the flash.
func _smoke(pos: Vector3, dir: Vector3, carry: Vector3, tint := Color(1.0, 1.0, 1.0), jet := 8, bank := 4, wisps := 3, alpha := 1.0) -> void:
	for i in jet:
		var sp := randf_range(5.0, 16.0)
		var g := randf_range(0.74, 0.9)
		emit(pos + dir * 0.6, Vector3(dir.x * sp + randf_range(-1.4, 1.4) + carry.x * 0.6, randf_range(0.1, 1.4), dir.z * sp + randf_range(-1.4, 1.4) + carry.z * 0.6),
				randf_range(2.4, 4.0), randf_range(1.0, 1.7), randf_range(5.5, 8.5), Color(g * 1.1 * tint.r, g * 1.08 * tint.g, g * 1.05 * tint.b, minf(1.0, randf_range(0.5, 0.72) * alpha)),
				Color(g * 1.02 * tint.r, g * 1.02 * tint.g, g * 1.04 * tint.b), -0.3, 2.0, SMOKE, 0.04)
	for i in bank:
		var sp := randf_range(1.5, 4.0)
		var g := randf_range(0.82, 0.95)
		emit(pos + dir * 1.2 + Vector3(randf_range(-0.6, 0.6), randf_range(-0.2, 0.5), randf_range(-0.6, 0.6)), Vector3(dir.x * sp + carry.x * 0.8, randf_range(0.3, 0.9), dir.z * sp + carry.z * 0.8),
				randf_range(4.5, 6.5), randf_range(2.2, 3.2), randf_range(9.0, 13.0), Color(g * tint.r, g * tint.g, g * 1.02 * tint.b, minf(1.0, randf_range(0.28, 0.4) * alpha)),
				Color(g * 1.04 * tint.r, g * 1.04 * tint.g, g * 1.07 * tint.b), -0.18, 1.2, SMOKE, 0.25)
	for i in wisps:
		var sp := randf_range(14.0, 24.0)
		emit(pos, Vector3(dir.x * sp + randf_range(-3.0, 3.0) + carry.x, randf_range(-0.5, 2.0), dir.z * sp + randf_range(-3.0, 3.0) + carry.z),
				randf_range(0.9, 1.5), randf_range(0.5, 0.8), randf_range(2.5, 3.5), Color(0.36, 0.33, 0.3, randf_range(0.5, 0.7)), Color(0.7, 0.68, 0.66), -0.2, 4.5, SMOKE, 0.01)


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
	if wind != null:
		_breeze = Vector2(wind.dir_x, wind.dir_z) * (1.2 + wind.strength * 4.5)
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
