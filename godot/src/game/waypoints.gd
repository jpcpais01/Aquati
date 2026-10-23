class_name Waypoints
extends Node3D
## Waypoints (the web game's src/game/waypoints.ts): pins the captain drops on
## the sea chart, each raised in the world as a thin pillar of light with
## ripples rolling out where it meets the sea. They're kept with your
## progress (the archipelagos never change, so a pin still marks the same
## cove next voyage). Sail into one and it's struck off with a flare and a
## chime.
##
## One draw for them all: every pin, and those still dissolving, is an
## instance of a mesh holding both the ring and the pillar, the GPU laying the
## ring on the very swell the ocean draws and turning the pillar to the
## camera (shaders/waypoint.gdshader).

## Pins on the chart at once; dropping another lifts the oldest.
const MAX := 5
## Sailing this close strikes a pin off.
const REACH := 26.0
## A pin only counts as reached once you've first been this far from it.
const ARM := 70.0
## Seconds for a new pin's light to fall from the sky, and for a lifted or
## reached one to dissolve.
const DROP := 1.1
const FADE := 1.6
## Each pin colour's light (linear HDR; MapMarks.PIN is how the maps draw it).
const GLOW: Array[Color] = [Color(2.4, 1.55, 0.55), Color(0.55, 2.1, 2.0), Color(2.4, 0.75, 1.25), Color(1.3, 0.95, 2.6), Color(1.1, 2.2, 0.55)]
## Instances: the pins, and as many again still dissolving.
const SLOTS := MAX * 2
## Floats per instance: a 3x4 transform, the colour and the custom vec4.
const STRIDE := 20
## The ring's grid, cells a side (it lies on the swell).
const RING_CELLS := 12


class Pin:
	## Counts up from 1 over the voyage (its light's seed).
	var id := 0
	var x := 0.0
	var z := 0.0
	## Its colour, an index into GLOW and MapMarks.PIN.
	var hue := 0
	## Seconds since it was dropped.
	var age := 0.0
	## How far it has dissolved (0..1); below 0 while it stands.
	var gone := -1.0
	## Reached rather than lifted: it goes in a flare.
	var reached := false
	## Sailed far enough from it to be able to reach it.
	var armed := false


## The pins standing, oldest first (the maps number them so).
var pins: Array[Pin] = []
var world: World
## Lifted or reached, still dissolving.
var _fading: Array[Pin] = []
var _next := 1
var _mat: ShaderMaterial
var _mm: MultiMesh
var _buf := PackedFloat32Array()


func setup(p_world: World) -> void:
	world = p_world
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/waypoint.gdshader")
	_mm = MultiMesh.new()
	_mm.transform_format = MultiMesh.TRANSFORM_3D
	_mm.use_colors = true
	_mm.use_custom_data = true
	_mm.mesh = _mesh()
	_mm.instance_count = SLOTS
	_mm.visible_instance_count = 0
	# the GPU lays the rings and turns the pillars: the bounds can't come from the transforms
	_mm.custom_aabb = AABB(Vector3(-1e5, -50.0, -1e5), Vector3(2e5, 300.0, 2e5))
	var mi := MultiMeshInstance3D.new()
	mi.name = "Pillars"
	mi.multimesh = _mm
	mi.material_override = _mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	add_child(mi)
	_buf.resize(SLOTS * STRIDE)
	_load()


## Drops a pin at (x, z), from a ship at `from` (a pin dropped right under her
## waits until she's sailed off before it can be reached); when the chart is
## full the oldest is lifted to make room.
func add(x: float, z: float, from: Variant = null) -> Pin:
	if pins.size() >= MAX:
		lift(pins[0])
	var pin := Pin.new()
	pin.id = _next
	_next += 1
	pin.x = x
	pin.z = z
	pin.hue = _free_hue(-1)
	pin.armed = from == null or Vector2((from as Vector3).x - x, (from as Vector3).z - z).length() > ARM
	pins.append(pin)
	_keep()
	return pin


## The pin within `r` metres of (x, z), nearest first, or null.
func near(x: float, z: float, r: float) -> Pin:
	var best: Pin = null
	var bd := r
	for p in pins:
		var d := Vector2(p.x - x, p.z - z).length()
		if d < bd:
			bd = d
			best = p
	return best


## Takes a pin off the chart, its light dissolving (`reached`: in a flare).
func lift(pin: Pin, reached := false) -> void:
	var i := pins.find(pin)
	if i < 0:
		return
	pins.remove_at(i)
	pin.gone = 0.0
	pin.reached = reached
	_fading.append(pin)
	if _fading.size() > SLOTS - MAX:
		_fading.remove_at(0)
	_keep()


## Lifts every pin: the whole chart cleared, each pillar dissolving.
func clear() -> void:
	for p in pins.duplicate():
		lift(p)


## Every pin gone at once, no light left dissolving (a set piece's fresh chart).
func wipe() -> void:
	pins.clear()
	_fading.clear()
	_keep()


## The pin a 1-based number names on the maps.
func number(pin: Pin) -> int:
	return pins.find(pin) + 1


## Moves the lights on: `at` is where the captain is (null when nobody's
## sailing), `ocean` and `eye` the swell the rings ride this frame. Returns a
## pin just sailed into (already struck off), or null.
func update(dt: float, at: Variant, ocean: Ocean, eye: Vector3) -> Pin:
	var hit: Pin = null
	for p in pins:
		p.age += dt
		if at == null:
			continue
		var d := Vector2((at as Vector3).x - p.x, (at as Vector3).z - p.z).length()
		if d > ARM:
			p.armed = true
		elif p.armed and d < REACH and hit == null:
			hit = p
	if hit != null:
		lift(hit, true)
	for i in range(_fading.size() - 1, -1, -1):
		var p := _fading[i]
		p.age += dt
		p.gone += dt / FADE
		if p.gone >= 1.0:
			_fading.remove_at(i)
	if visible:
		_follow(ocean, eye)
		_write()
	return hit


## The swell the rings ride, as the ocean draws it this frame.
func _follow(ocean: Ocean, eye: Vector3) -> void:
	_mat.set_shader_parameter("wave_a", world.waves.packed_a)
	_mat.set_shader_parameter("wave_b", world.waves.packed_b)
	_mat.set_shader_parameter("grid_warp", ocean.grid_warp)
	_mat.set_shader_parameter("grid_origin", Vector2(ocean.position.x, ocean.position.z))
	_mat.set_shader_parameter("eye", eye)


## The archipelago whose seabed damps the swell under the rings.
func set_region(r: Region) -> void:
	_mat.set_shader_parameter("seabed_tex", r.height_tex)
	_mat.set_shader_parameter("seabed_rect", r.height_rect())
	_mat.set_shader_parameter("has_seabed", 1.0)


## Lays every light into the instances: its foot, colour and how it's going.
func _write() -> void:
	var n := 0
	for p: Pin in pins + _fading:
		if n >= SLOTS:
			break
		var g := GLOW[p.hue]
		var gone := maxf(0.0, p.gone)
		# reached: a bright flare that swells then fades; lifted: it just dissolves
		var flare := sin(minf(1.0, gone) * PI) if p.reached else 0.0
		var fade := 1.0 - gone * gone if p.reached else 1.0 - gone
		var o := n * STRIDE
		# an identity basis, the foot in the last column: on the land or the sea
		_buf[o] = 1.0
		_buf[o + 1] = 0.0
		_buf[o + 2] = 0.0
		_buf[o + 3] = p.x
		_buf[o + 4] = 0.0
		_buf[o + 5] = 1.0
		_buf[o + 6] = 0.0
		_buf[o + 7] = maxf(0.0, world.ground_height(p.x, p.z))
		_buf[o + 8] = 0.0
		_buf[o + 9] = 0.0
		_buf[o + 10] = 1.0
		_buf[o + 11] = p.z
		_buf[o + 12] = g.r
		_buf[o + 13] = g.g
		_buf[o + 14] = g.b
		_buf[o + 15] = fade
		_buf[o + 16] = p.age
		_buf[o + 17] = fmod(p.id * 0.618, 1.0)
		_buf[o + 18] = flare
		_buf[o + 19] = 0.0 if p.reached else gone
		n += 1
	if n > 0:
		RenderingServer.multimesh_set_buffer(_mm.get_rid(), _buf)
	_mm.visible_instance_count = n


## The first colour no standing pin wears (`want` first, when it's free).
func _free_hue(want: int) -> int:
	var used := {}
	for p in pins:
		used[p.hue] = true
	if want >= 0 and want < GLOW.size() and not used.has(want):
		return want
	var hue := 0
	while used.has(hue):
		hue += 1
	return hue


## Keeps the chart's pins with your progress.
func _keep() -> void:
	var out := []
	for p in pins:
		out.append([roundi(p.x), roundi(p.z), p.hue])
	Progress.keep_pins(out)


## The pins kept from the last voyage, already standing (no drop from the sky).
func _load() -> void:
	for r: Array in Progress.pins:
		var pin := Pin.new()
		pin.id = _next
		_next += 1
		pin.x = float(r[0])
		pin.z = float(r[1])
		pin.hue = _free_hue(int(r[2]))
		pin.age = DROP + 2.0
		pins.append(pin)


## The mesh: the ring, a grid (y 0, x and z -1..1) the shader lays on the
## swell, and the pillar, a strip (y 1, x -0.5..0.5 across, z 0..1 up).
static func _mesh() -> ArrayMesh:
	var v := PackedVector3Array()
	var idx := PackedInt32Array()
	var n := RING_CELLS
	for j in n + 1:
		for i in n + 1:
			v.append(Vector3(-1.0 + 2.0 * i / n, 0.0, -1.0 + 2.0 * j / n))
	for j in n:
		for i in n:
			var a := j * (n + 1) + i
			idx.append_array([a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2])
	var b := v.size()
	for c: Vector2 in [Vector2(-0.5, 0.0), Vector2(0.5, 0.0), Vector2(0.5, 1.0), Vector2(-0.5, 1.0)]:
		v.append(Vector3(c.x, 1.0, c.y))
	idx.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = v
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return m
