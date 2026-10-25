class_name FireworkSky
extends MultiMeshInstance3D
## The night sky's fireworks (the web game's fx/fireworks.ts), drawn
## entirely on the GPU (shaders/fireworks.gdshader). Every star, rocket,
## spark, crackle and flash is written once into the instance buffer the
## moment its rocket leaves the gun: where it starts, how fast, when it's
## born, how long it lives, its colours and how it behaves. Stars that split
## or crackle are just more stars with a later birth, planned up front, so a
## whole multi-break showpiece is decided at launch with no simulation at all.
##
## The bursts light the night: four lights for every lit surface (sails,
## decks, islands) and the sea's mirror of them, fed the brightest bursts of
## the moment. Their bangs, whistles and crackles are told through `sounded`.

## A firework's sound at a point: "launch", "whistle", "burst", "big",
## "crackle", "pop" or "sizzle", with how heavy it is (about 0.35 .. 1.5).
signal sounded(kind: StringName, at: Vector3, power: float)

## Lights shared with the lit surfaces and the sea.
const LIGHTS := 4
## Floats per star: a 3x4 transform, a colour and the custom vec4.
const STRIDE := 20
## A quiet sky starts its clock over past this, so the GPU's arithmetic on it stays precise.
const REBASE := 1000.0
## The bursts' light on the lit surfaces, and the stars' own brightness: the
## web's are tuned for its bloom and tone curve, these for the port's grade.
const LAMP := 0.35
const GAIN := 0.32

const ROCKET_K := 0.08
const ROCKET_G := 11.0
const ELEV := 1.2217305 # 70°

# star behaviours (the integer part of the mode; the fraction is a per-star seed)
const PLAIN := 0
const GLITTER := 1 # twinkling head, a trail of glitter
const STROBE := 2 # hangs, then blinks on and off
const FISH := 3 # wriggles as it swims
const FLASH := 4 # a soft ball of light at the break
const POP := 5 # a crackle: a hard white pop, gone in a blink
const HANG := 6 # willow: slow, dim and drooping, glittering at the end
const ROCKET := 7 # the rocket's own head
const TENTACLE := 8 # a writhing arm (the Kraken's Bloom)

## The palette (linear HDR).
const C := {
	"coral": Vector3(7.5, 1.7, 2.0), "rose": Vector3(7.2, 1.4, 3.6), "gold": Vector3(7.0, 4.3, 1.3),
	"amber": Vector3(5.0, 2.5, 0.6), "ember": Vector3(2.2, 0.6, 0.08), "white": Vector3(7.6, 7.6, 8.2),
	"silver": Vector3(6.0, 6.6, 7.8), "ice": Vector3(3.2, 5.4, 8.5), "aqua": Vector3(1.3, 6.0, 6.8),
	"violet": Vector3(4.8, 1.9, 8.0), "green": Vector3(2.0, 6.6, 2.4), "sea": Vector3(1.4, 7.0, 4.4),
	"lemon": Vector3(6.8, 6.2, 1.6), "red": Vector3(8.5, 1.1, 1.0), "blue": Vector3(1.6, 2.6, 8.6),
	"pink": Vector3(8.0, 2.6, 6.2),
}

## The smoke the bursts leave hanging in the sky goes up through these.
var fx: Particles
## The sea that mirrors the bursts.
var ocean: Ocean

var _cap := 3072
var _density := 1.0
var _buf := PackedFloat32Array()
var _head := 0
var _used := 0
var _dirty := false
var _now := 0.0
var _live_until := -1.0
var _mat: ShaderMaterial
## {at, pos, sound, power, smoke, light}
var _events: Array[Dictionary] = []
## {p, c (normalised), t0, power, dur, flick}
var _lights: Array[Dictionary] = []
## A steady light that isn't a burst (a festival town's lanterns), lit while nothing brighter needs its slot.
var _steady := {}
var _lamps: Array[OmniLight3D] = []
var _was_lit := true
## Where to break, metres over the guns: set from the camera so a burst fills the view without leaving it.
var _height := 40.0
var _cam_right := Vector3.RIGHT
var _cam_up := Vector3(0.0, 0.6, -0.8)
var _cam_pos := Vector3(0.0, 100.0, 100.0)


## `scale` is the quality's (0.45 .. 1): fewer stars on a slower phone.
func setup(scale: float) -> void:
	_density = clampf(scale, 0.45, 1.0)
	_cap = 6144 if scale >= 0.9 else (4608 if scale >= 0.7 else 3072)
	# a strip: tail cap, eight body columns along the flight, head cap; two rows across
	var cols := [-1.0, 0.0, 1.0 / 7.0, 2.0 / 7.0, 3.0 / 7.0, 4.0 / 7.0, 5.0 / 7.0, 6.0 / 7.0, 1.0, 2.0]
	var verts := PackedVector3Array()
	for u: float in cols:
		verts.append(Vector3(u, -1.0, 0.0))
		verts.append(Vector3(u, 1.0, 0.0))
	var idx := PackedInt32Array()
	for i in cols.size() - 1:
		var a := i * 2
		idx.append_array([a, a + 2, a + 1, a + 1, a + 2, a + 3])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_INDEX] = idx
	var strip := ArrayMesh.new()
	strip.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = strip
	mm.instance_count = _cap
	mm.visible_instance_count = 0
	# the instance transforms carry launch data, not placements: cull by hand
	mm.custom_aabb = AABB(Vector3(-1e5, -500.0, -1e5), Vector3(2e5, 2000.0, 2e5))
	_buf.resize(_cap * STRIDE)
	mm.buffer = _buf
	multimesh = mm
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/fireworks.gdshader")
	_mat.set_shader_parameter("gain", GAIN)
	material_override = _mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	visible = false
	for i in LIGHTS:
		var l := OmniLight3D.new()
		l.name = "Burst%d" % i
		l.top_level = true
		l.omni_range = 120.0
		l.omni_attenuation = 1.0
		l.shadow_enabled = false
		l.light_specular = 0.3
		l.visible = false
		add_child(l)
		_lamps.append(l)
	_write_lights()


## Called every frame with the view, so bursts break where you'll see them:
## `distance` the camera's from its focus, `eye` how far it has come down to
## the water (0 overhead .. 1 at the rail).
func view(cam: Camera3D, distance: float, eye: float, viewport_h: float) -> void:
	# high enough to clear the masts, low enough that the break sits in the upper half of the frame
	var tf := tan(deg_to_rad(cam.fov * 0.5))
	var span := 2.0 * tf * distance
	_height = lerpf(clampf(span * 0.27, 22.0, 66.0), 46.0, eye)
	var b := cam.global_basis
	_cam_right = b.x.normalized()
	_cam_up = b.y.normalized()
	_cam_pos = cam.global_position
	_mat.set_shader_parameter("px", 2.0 * tf / maxf(1.0, viewport_h))


## Anything still in the sky, or about to be.
func busy() -> bool:
	return _now <= _live_until or not _events.is_empty()


## A steady glow at a point (a quay strung with lanterns): it lights the town
## and shimmers on the water like the bursts do, and gives up its slot
## whenever the sky is busier. A power of 0 puts it out.
func glow(at: Vector3, c := Vector3(1.0, 0.6, 0.3), power := 0.0) -> void:
	if power <= 0.001:
		_steady = {}
		return
	if _steady.is_empty():
		_steady = _light(at, c, 0.0, power, 1.0, 0.0)
	_steady.p = at
	_steady.c = c / maxf(maxf(c.x, c.y), maxf(c.z, 1e-3))
	_steady.power = power


## Puts the sky out at once (a new voyage, the farewell).
func clear() -> void:
	_events.clear()
	_lights.clear()
	_live_until = -1.0
	multimesh.visible_instance_count = 0
	visible = false
	_now += 60.0 # every star in the ring is long dead now
	_write_lights()


# ------------------------------------------------------------------ launching

## One gun's rocket. `k` of `n` is its place in the volley, so a broadside
## fans out and breaks at staggered heights instead of on top of itself.
## `dir` is the gun's own outward heading (flat), `carry` the ship's way.
func launch(id: String, from: Vector3, dir: Vector3, carry: Vector3, k: int, n: int) -> void:
	var show := Fireworks.tier(id) == 2
	# a showpiece goes up alone off the middle gun; its neighbours fire white salutes
	var salute := show and k > 0
	var f := float(k) / (n - 1) - 0.5 if n > 1 else 0.0
	var yaw := ((0.0 if k == 0 else (-0.5 if k % 2 == 1 else 0.5)) if show else f * 0.55) + randf_range(-0.06, 0.06)
	var big := 1.3 if show and not salute else (0.72 if salute else 1.0)
	# a gun facing away up the screen throws its break toward the top edge: send it a little lower
	var away := maxf(0.0, dir.x * _cam_up.x + dir.z * _cam_up.z) / maxf(1e-3, Vector2(_cam_up.x, _cam_up.z).length())
	var h := _height * (1.0 - 0.3 * away) * big * (1.0 if show else 0.86 + 0.28 * fmod(k * 0.618, 1.0)) * randf_range(0.95, 1.05)
	var tb := 1.35 + h * 0.013 + (-0.25 if salute else 0.0)
	# the vertical speed that carries it to h in tb seconds against drag and gravity
	var ek := 1.0 - exp(-ROCKET_K * tb)
	var gk := ROCKET_G / ROCKET_K
	var vy := ((h + gk * tb) * ROCKET_K) / ek - gk
	var vh := vy / tan(ELEV + randf_range(-0.04, 0.04))
	var c := cos(yaw)
	var s := sin(yaw)
	var dx := dir.x * c - dir.z * s
	var dz := dir.x * s + dir.z * c
	var v0 := Vector3(dx * vh + carry.x, vy, dz * vh + carry.z)
	var t0 := _now
	_rocket(from, v0, t0, tb, id, salute or show)
	var at := traj(from, v0, ROCKET_K, ROCKET_G, tb)
	var vb := traj_v(v0, ROCKET_K, ROCKET_G, tb) * 0.22
	var whistle := id == "fish" or id == "strobe" or id == "kraken" or (id == "crossette" and k == 0)
	_event(t0, from, &"whistle" if whistle else &"launch", 1.3 if show and not salute else 1.0, 0, {})
	var r := h * (0.3 if salute else 0.4)
	var t_b := t0 + tb
	if salute:
		_salute(at, vb, t_b, r)
	else:
		_burst(id, at, vb, t_b, r, k)


## Position after t seconds of flight under linear drag k and gravity g (the shader's twin).
static func traj(x0: Vector3, v0: Vector3, k: float, g: float, t: float) -> Vector3:
	var e := exp(-k * t)
	var f := (1.0 - e) / k
	var gk := g / k
	return Vector3(x0.x + v0.x * f, x0.y + (v0.y + gk) * f - gk * t, x0.z + v0.z * f)


static func traj_v(v0: Vector3, k: float, g: float, t: float) -> Vector3:
	var e := exp(-k * t)
	var gk := g / k
	return Vector3(v0.x * e, (v0.y + gk) * e - gk, v0.z * e)


## n directions spread evenly over a sphere (a Fibonacci lattice), turned by `rot`.
static func fib(i: int, n: int, rot: float) -> Vector3:
	var y := 1.0 - ((i + 0.5) / n) * 2.0
	var r := sqrt(maxf(0.0, 1.0 - y * y))
	var a := i * 2.399963 + rot
	return Vector3(cos(a) * r, y, sin(a) * r)


static func _rnd_dir() -> Vector3:
	return Vector3(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)).normalized()


## The rocket itself: a bright spitting head and the sparks it sheds on the climb.
func _rocket(x0: Vector3, v0: Vector3, t0: float, tb: float, id: String, heavy: bool) -> void:
	var palm := id == "palm"
	var head := Vector3(6.0, 5.4, 2.0) if palm else Vector3(6.4, 4.6, 2.2)
	_star(x0, v0, t0, tb, head, head * 0.8, 0.36 if heavy or palm else 0.28, ROCKET_K, ROCKET_G, 0.7 if palm else 0.3, ROCKET, 0.0)
	var sparks := roundi((30 if palm else (22 if heavy else 14)) * _density)
	var sc := Vector3(5.5, 4.2, 1.2) if palm else Vector3(6.5, 3.6, 1.2)
	for i in sparks:
		var ts := (i + randf()) / sparks * tb * 0.97
		var e := traj(x0, v0, ROCKET_K, ROCKET_G, ts)
		var fv := traj_v(v0, ROCKET_K, ROCKET_G, ts)
		var g := Vector3(-fv.x * 0.08 + randf_range(-2.4, 2.4), -fv.y * 0.08 + randf_range(-1.5, 1.5), -fv.z * 0.08 + randf_range(-2.4, 2.4))
		_star(e, g, t0 + ts, randf_range(0.45, 1.3 if palm else 0.85), sc, C.ember, randf_range(0.1, 0.16), 2.0, 7.0, 0.06, GLITTER, 0.0)


## The white salute that flanks a showpiece.
func _salute(at: Vector3, vb: Vector3, t_b: float, r: float) -> void:
	var n := roundi(70 * _density)
	var k := 1.9
	var rot := randf() * TAU
	for i in n:
		var d := fib(i, n, rot) * (r * k * randf_range(0.92, 1.06)) + vb
		_star(at, d, t_b, randf_range(1.2, 1.6), C.silver, C.ice, 0.3, k, 2.6, 0.22, GLITTER, 0.0)
	_flash(at, t_b, r * 0.55, Vector3(7.0, 7.0, 8.0))
	_event(t_b, at, &"burst", 0.6, 4, _light(at, Vector3(0.9, 0.95, 1.0), t_b, 1.1, 1.3, 0.0))


func _flash(at: Vector3, t: float, size: float, c: Vector3) -> void:
	_star(at, Vector3.ZERO, t, 0.32, c, c * 0.4, size, 1.0, 0.0, 0.0, FLASH, 0.0)


func _light(at: Vector3, c: Vector3, t0: float, power: float, dur: float, flick: float) -> Dictionary:
	var m := maxf(maxf(c.x, c.y), maxf(c.z, 1e-3))
	return {"p": at, "c": c / m, "t0": t0, "power": power, "dur": dur, "flick": flick}


## A sphere of stars: the building block of most shells. `o` holds n,
## speed, k, g, life (Vector2), c0, c1, size, trail, mode and optionally
## jitter and vary (a Callable i -> [c0, c1]).
func _shell(at: Vector3, vb: Vector3, t: float, o: Dictionary) -> void:
	var n := maxi(12, roundi(o.n * _density))
	var rot := randf() * TAU
	var j: float = o.get("jitter", 0.05)
	var life: Vector2 = o.life
	var vary: Callable = o.get("vary", Callable())
	for i in n:
		var d := fib(i, n, rot) + Vector3(randf_range(-j, j), randf_range(-j, j), randf_range(-j, j))
		d = d.normalized() * (o.speed * randf_range(0.94, 1.05)) + vb
		var c0: Vector3 = o.c0
		var c1: Vector3 = o.c1
		if vary.is_valid():
			var pair: Array = vary.call(i)
			c0 = pair[0]
			c1 = pair[1]
		_star(at, d, t, randf_range(life.x, life.y), c0, c1, o.size * randf_range(0.9, 1.1), o.k, o.g, o.trail, o.mode, 0.0)


## A flat ring of stars in the plane across `normal`.
func _ring_of(at: Vector3, vb: Vector3, t: float, normal: Vector3, o: Dictionary) -> void:
	var n := maxi(16, roundi(o.n * _density))
	var a := normal.cross(Vector3.UP if absf(normal.y) < 0.9 else Vector3.RIGHT).normalized()
	var b := normal.cross(a)
	var rot := randf() * TAU
	var life: Vector2 = o.life
	for i in n:
		var ang := float(i) / n * TAU + rot
		var d: Vector3 = (a * cos(ang) + b * sin(ang)) * (o.speed * randf_range(0.98, 1.02)) + vb
		_star(at, d, t, randf_range(life.x, life.y), o.c0, o.c1, o.size, o.k, o.g, o.trail, o.mode, 0.0)


## A plane facing the camera from `at` (tipped a little at random), for rings that read as rings.
func _facing(at: Vector3, tilt: float) -> Vector3:
	var to_cam := (_cam_pos - at).normalized()
	return to_cam.lerp(_rnd_dir(), tilt).normalized()


# ------------------------------------------------------------------ the shells

func _burst(id: String, at: Vector3, vb: Vector3, t: float, r: float, k: int) -> void:
	match id:
		"peony":
			var pal := [[C.coral, C.gold], [C.rose, C.white], [C.coral, C.lemon], [C.pink, C.gold]]
			var c0: Vector3 = pal[k % pal.size()][0]
			var c1: Vector3 = pal[k % pal.size()][1]
			_shell(at, vb, t, {"n": 160, "speed": r * 1.8, "k": 1.8, "g": 3.0, "life": Vector2(1.6, 2.05), "c0": c0, "c1": c1, "size": 0.42, "trail": 0.12, "mode": PLAIN})
			_flash(at, t, r * 0.5, Vector3(8.0, 5.0, 4.0))
			_event(t, at, &"burst", 1.0, 6, _light(at, c0.lerp(c1, 0.4), t, 1.6, 1.9, 0.0))
		"chrysanthemum":
			_shell(at, vb, t, {"n": 130, "speed": r * 1.4, "k": 1.4, "g": 3.5, "life": Vector2(2.0, 2.5), "c0": C.gold, "c1": C.amber, "size": 0.32, "trail": 0.6, "mode": GLITTER})
			# a silver pistil at the heart
			_shell(at, vb, t, {"n": 36, "speed": r * 1.8 * 0.4, "k": 1.8, "g": 2.0, "life": Vector2(0.9, 1.2), "c0": C.white, "c1": C.silver, "size": 0.3, "trail": 0.1, "mode": PLAIN})
			_flash(at, t, r * 0.5, Vector3(8.0, 6.0, 3.0))
			_event(t, at, &"burst", 1.0, 6, _light(at, C.gold, t, 1.7, 2.3, 0.0))
		"willow":
			_shell(at, vb, t, {"n": 110, "speed": r * 2.4 * 0.85, "k": 2.4, "g": 4.6, "life": Vector2(3.6, 4.5), "c0": Vector3(5.4, 3.0, 0.8), "c1": Vector3(2.2, 0.8, 0.12), "size": 0.26, "trail": 1.5, "mode": HANG})
			_flash(at, t, r * 0.45, Vector3(7.0, 5.0, 2.4))
			_event(t, at, &"burst", 0.9, 6, _light(at, Vector3(1.0, 0.62, 0.22), t, 1.4, 4.0, 0.0))
			_event(t + 0.9, at, &"sizzle", 0.8, 0, {})
		"palm":
			var fronds := 7
			var rot := randf() * TAU
			for i in fronds:
				var a := rot + float(i) / fronds * TAU + randf_range(-0.12, 0.12)
				var fv := Vector3(cos(a), randf_range(0.25, 0.45), sin(a)).normalized() * (r * 0.95 * 1.15) + vb
				var life := randf_range(2.2, 2.6)
				_star(at, fv, t, life, Vector3(2.4, 6.4, 1.8), Vector3(6.0, 4.0, 0.9), 0.62, 0.95, 7.0, 0.95, GLITTER, 0.0)
				# each frond sheds gold glitter all along its bow
				var drops := roundi(9 * _density)
				for j in drops:
					var ts := (j + randf()) / drops * life * 0.9
					var g := traj(at, fv, 0.95, 7.0, ts)
					var d := Vector3(randf_range(-1.5, 1.5), randf_range(-1.0, 0.6), randf_range(-1.5, 1.5))
					_star(g, d, t + ts, randf_range(0.6, 1.1), Vector3(6.4, 4.6, 1.4), C.ember, 0.16, 2.2, 6.0, 0.1, GLITTER, 0.0)
			_flash(at, t, r * 0.5, Vector3(6.0, 7.0, 3.0))
			_event(t, at, &"burst", 1.0, 5, _light(at, Vector3(0.65, 1.0, 0.35), t, 1.5, 2.2, 0.0))
		"ring":
			var n1 := _facing(at, 0.45)
			var n2 := _facing(at, 0.7)
			_ring_of(at, vb, t, n1, {"n": 70, "speed": r * 1.8, "k": 1.8, "g": 2.0, "life": Vector2(1.8, 2.1), "c0": C.aqua, "c1": Vector3(0.8, 3.6, 6.0), "size": 0.4, "trail": 0.16, "mode": PLAIN})
			_ring_of(at, vb, t, n2, {"n": 64, "speed": r * 1.8 * 0.78, "k": 1.8, "g": 2.0, "life": Vector2(1.8, 2.1), "c0": C.violet, "c1": C.pink, "size": 0.38, "trail": 0.16, "mode": PLAIN})
			_shell(at, vb, t, {"n": 14, "speed": r * 1.8 * 0.18, "k": 1.8, "g": 1.0, "life": Vector2(0.8, 1.1), "c0": C.white, "c1": C.ice, "size": 0.4, "trail": 0.0, "mode": PLAIN})
			_flash(at, t, r * 0.4, Vector3(4.0, 6.0, 8.0))
			_event(t, at, &"burst", 0.9, 4, _light(at, Vector3(0.55, 0.85, 1.0), t, 1.5, 1.9, 0.0))
		"crossette":
			var n := roundi(11 * maxf(0.7, _density))
			var rot := randf() * TAU
			for i in n:
				var cv := fib(i, n, rot) * (r * 0.95) + vb
				var ts := randf_range(0.55, 0.72)
				_star(at, cv, t, ts, C.silver, C.white, 0.34, 1.0, 3.0, 0.32, GLITTER, 0.0)
				# the split: four pieces flung across its flight, a little cross of fire
				var sp := traj(at, cv, 1.0, 3.0, ts)
				var sv := traj_v(cv, 1.0, 3.0, ts)
				var fwd := sv.normalized()
				var a := fwd.cross(Vector3.UP)
				if a.length_squared() < 1e-4:
					a = Vector3.RIGHT
				a = a.normalized()
				var b := fwd.cross(a)
				for q in 4:
					var ang := q / 4.0 * TAU + randf_range(-0.15, 0.15)
					var e := (a * cos(ang) + b * sin(ang)) * (r * 0.75) + sv * 0.45
					_star(sp, e, t + ts, randf_range(0.95, 1.25), C.ice, C.blue, 0.3, 1.9, 3.0, 0.26, PLAIN, 0.0)
				_flash(sp, t + ts, r * 0.12, Vector3(6.0, 7.0, 8.0))
			_flash(at, t, r * 0.35, Vector3(7.0, 7.0, 8.0))
			_event(t, at, &"burst", 0.8, 4, _light(at, Vector3(0.85, 0.92, 1.0), t, 1.2, 0.9, 0.0))
			_event(t + 0.62, at, &"pop", 1.0, 0, _light(at, Vector3(0.6, 0.8, 1.0), t + 0.62, 1.3, 1.4, 0.0))
		"strobe":
			_shell(at, vb, t, {"n": 120, "speed": r * 2.2 * 0.8, "k": 2.2, "g": 1.3, "life": Vector2(3.0, 3.9), "c0": C.white, "c1": Vector3(5.5, 6.5, 8.5), "size": 0.4, "trail": 0.06, "mode": STROBE, "jitter": 0.18})
			_flash(at, t, r * 0.45, Vector3(7.0, 7.5, 8.0))
			_event(t, at, &"burst", 0.85, 4, _light(at, Vector3(0.92, 0.96, 1.0), t, 1.4, 3.6, 1.0))
			_event(t + 1.0, at, &"crackle", 0.35, 0, {})
		"crackle":
			var n := maxi(30, roundi(70 * _density))
			var rot := randf() * TAU
			var k0 := 1.6
			var g0 := 3.6
			for i in n:
				var d := fib(i, n, rot) * (r * k0 * randf_range(0.85, 1.05)) + vb
				var life := randf_range(1.15, 1.5)
				_star(at, d, t, life, C.gold, C.amber, 0.34, k0, g0, 0.28, PLAIN, 0.0)
				# each egg hatches into a hail of pops where it dies
				var end := traj(at, d, k0, g0, life)
				for q in 3:
					_star(end, _rnd_dir() * randf_range(3.0, 8.0), t + life + randf_range(-0.05, 0.3), randf_range(0.07, 0.16), Vector3(9.0, 8.4, 6.5), Vector3(6.0, 4.0, 1.5), 0.5, 6.0, 0.0, 0.0, POP, 0.0)
			_flash(at, t, r * 0.45, Vector3(8.0, 5.5, 2.0))
			_event(t, at, &"burst", 0.9, 5, _light(at, C.gold, t, 1.4, 1.6, 0.0))
			_event(t + 1.3, at, &"crackle", 1.0, 0, _light(at, Vector3(1.0, 0.85, 0.6), t + 1.3, 1.6, 0.6, 1.0))
		"fish":
			var n := maxi(20, roundi(48 * _density))
			var rot := randf() * TAU
			for i in n:
				var d := fib(i, n, rot) + Vector3(randf_range(-0.2, 0.2), randf_range(-0.2, 0.2), randf_range(-0.2, 0.2))
				d = d.normalized() * (r * 1.2 * randf_range(0.6, 1.0)) + vb
				var c0: Vector3 = C.aqua if randf() < 0.5 else C.lemon
				_star(at, d, t, randf_range(2.0, 2.7), c0, c0 * 0.6, 0.3, 1.2, 1.4, 0.5, FISH, randf_range(0.7, 1.3))
			_flash(at, t, r * 0.35, Vector3(5.0, 8.0, 7.0))
			_event(t, at, &"burst", 0.7, 3, _light(at, Vector3(0.5, 1.0, 0.85), t, 1.2, 2.4, 0.0))
		"saturn":
			_shell(at, vb, t, {"n": 96, "speed": r * 2.0 * 0.62, "k": 2.0, "g": 1.8, "life": Vector2(1.9, 2.3), "c0": C.violet, "c1": Vector3(3.0, 1.1, 5.2), "size": 0.4, "trail": 0.12, "mode": PLAIN})
			var tilt := _facing(at, 0.35).lerp(Vector3.UP, 0.35).normalized()
			_ring_of(at, vb, t, tilt, {"n": 80, "speed": r * 1.6 * 1.12, "k": 1.6, "g": 1.8, "life": Vector2(2.1, 2.5), "c0": C.gold, "c1": C.lemon, "size": 0.36, "trail": 0.2, "mode": GLITTER})
			_flash(at, t, r * 0.45, Vector3(6.0, 4.0, 8.0))
			_event(t, at, &"burst", 1.0, 5, _light(at, Vector3(0.85, 0.6, 1.0), t, 1.6, 2.2, 0.0))
		"kraken":
			_kraken(at, vb, t, r)
		"roger":
			_roger(at, vb, t, r)
		"fortune":
			_fortune(at, vb, t, r)


## Kraken's Bloom: a sea-green maw, then eight great arms of fire curling down at the sea.
func _kraken(at: Vector3, vb: Vector3, t: float, r: float) -> void:
	_shell(at, vb, t, {"n": 150, "speed": r * 1.6 * 0.62, "k": 1.6, "g": 1.6, "life": Vector2(2.1, 2.6), "c0": Vector3(0.8, 4.2, 2.6), "c1": Vector3(0.4, 2.2, 3.0), "size": 0.38, "trail": 0.2, "mode": PLAIN})
	# the arms: each a stream of stars fired one after another down the same curling path
	var arms := 8
	var rot := randf() * TAU
	var per := roundi(18 * maxf(0.6, _density))
	for a in arms:
		var ang := rot + float(a) / arms * TAU
		var v := Vector3(cos(ang), randf_range(-0.35, 0.05), sin(ang)).normalized() * (r * 1.15) + vb
		var seed := randf()
		for i in per:
			var delay := float(i) / per * 0.75
			# the arm's stars overlap along it, so each is dim on its own: together they keep their colour
			var c0: Vector3 = (C.violet as Vector3).lerp(C.sea, float(i) / per) * 0.26
			_star(at, v, t + delay, 3.1 - delay * 0.6, c0, Vector3(0.26, 1.2, 0.85), 0.46 - float(i) / per * 0.2, 0.75, 4.2, 0.55, TENTACLE, r * 0.12, seed)
		# a crackle of suckers at the tip as each arm dies away
		var tip := traj(at, v, 0.75, 4.2, 2.2)
		for q in 4:
			_star(tip, _rnd_dir() * randf_range(2.0, 6.0), t + 2.2 + randf_range(0.0, 0.5), randf_range(0.08, 0.16), Vector3(6.0, 9.0, 7.0), C.sea, 0.6, 6.0, 0.0, 0.0, POP, 0.0)
	# a ring of glowing eyes (gold) as it spreads
	_ring_of(at, vb, t + 0.15, _facing(at, 0.25), {"n": 40, "speed": r * 2.2 * 0.5, "k": 2.2, "g": 0.6, "life": Vector2(2.4, 2.8), "c0": C.lemon, "c1": C.gold, "size": 0.42, "trail": 0.0, "mode": STROBE})
	_flash(at, t, r * 0.8, Vector3(1.2, 3.6, 2.4))
	_event(t, at, &"big", 1.4, 10, _light(at, Vector3(0.4, 1.0, 0.75), t, 2.6, 3.4, 0.0))
	_event(t + 2.3, at, &"crackle", 1.0, 0, _light(at, Vector3(0.6, 1.0, 0.8), t + 2.3, 1.6, 0.8, 1.0))


## The Jolly Roger: the skull and crossbones written in white fire, facing you, with a crimson crown.
func _roger(at: Vector3, vb: Vector3, t: float, r: float) -> void:
	var k := 2.6
	# the shape forms as the stars slow: launched at k × offset they come to rest at the offset
	var s := r * 1.15
	for pt: Vector3 in roger_shape(_density):
		var d := (_cam_right * (pt.x * s * k) + _cam_up * (pt.y * s * k) + vb) * randf_range(0.97, 1.03)
		var eye := pt.z == 1.0
		var bone := pt.z == 2.0
		var c0: Vector3 = C.red if eye else (Vector3(7.4, 7.0, 6.2) if bone else C.white)
		var c1 := Vector3(6.0, 0.4, 0.3) if eye else (Vector3(5.5, 4.6, 3.2) if bone else Vector3(5.2, 5.8, 7.4))
		_star(at, d, t, randf_range(3.4, 3.9), c0, c1, 0.5 if eye else 0.36, k, 0.9, 0.08, HANG, 0.0)
	# the crimson crown: a ring of red glitter round the skull and a crackle all round
	var n := roundi(60 * _density)
	for i in n:
		var a := float(i) / n * TAU
		var d := _cam_right * (cos(a) * r * 1.55 * 1.7) + _cam_up * (sin(a) * r * 1.55 * 1.7) + vb
		_star(at, d, t + 0.25, randf_range(1.6, 2.0), C.red, Vector3(3.0, 0.3, 0.2), 0.34, 1.7, 2.4, 0.4, GLITTER, 0.0)
		if i % 2 == 0:
			var end := traj(at, d, 1.7, 2.4, 1.8)
			_star(end, _rnd_dir() * randf_range(2.0, 5.0), t + 2.0 + randf_range(0.0, 0.35), randf_range(0.07, 0.15), Vector3(9.0, 6.0, 6.0), C.red, 0.55, 6.0, 0.0, 0.0, POP, 0.0)
	_flash(at, t, r * 0.7, Vector3(8.0, 8.0, 9.0))
	_event(t, at, &"big", 1.3, 10, _light(at, Vector3(1.0, 0.95, 0.95), t, 2.4, 3.6, 0.0))
	_event(t + 2.05, at, &"crackle", 1.0, 0, _light(at, Vector3(1.0, 0.35, 0.3), t + 2.05, 1.8, 0.8, 1.0))


## Fortune's Finale: a golden crown, rings of every colour breaking round it, then a rain of gold coins.
func _fortune(at: Vector3, vb: Vector3, t: float, r: float) -> void:
	# the crown: a huge golden kamuro that hangs and glitters
	_shell(at, vb, t, {"n": 200, "speed": r * 2.2 * 0.95, "k": 2.2, "g": 3.2, "life": Vector2(3.8, 4.6), "c0": Vector3(7.4, 5.2, 1.6), "c1": Vector3(3.0, 1.3, 0.25), "size": 0.32, "trail": 1.1, "mode": HANG})
	_flash(at, t, r * 0.8, Vector3(9.0, 7.0, 3.0))
	_event(t, at, &"big", 1.5, 10, _light(at, Vector3(1.0, 0.78, 0.35), t, 2.8, 4.2, 0.0))
	# the satellite breaks: peonies of every colour going off round it
	var pals := [[C.red, C.gold], [C.green, C.lemon], [C.blue, C.white], [C.pink, C.violet], [C.aqua, C.white], [C.violet, C.pink]]
	var sats := 6
	var rot := randf() * TAU
	for i in sats:
		var a := rot + float(i) / sats * TAU
		var p := at + _cam_right * (cos(a) * r * 0.95) + _cam_up * (sin(a) * r * 0.95 * 0.8)
		var ts := t + 0.55 + i * 0.22
		var c0: Vector3 = pals[i][0]
		var c1: Vector3 = pals[i][1]
		_shell(p, Vector3.ZERO, ts, {"n": 70, "speed": r * 0.42 * 2.0, "k": 2.0, "g": 2.6, "life": Vector2(1.3, 1.7), "c0": c0, "c1": c1, "size": 0.34, "trail": 0.12, "mode": PLAIN})
		_flash(p, ts, r * 0.25, c0 * 0.9)
		_event(ts, p, &"burst", 0.7, 2, {} if i % 2 == 1 else _light(p, c0.lerp(c1, 0.3), ts, 1.4, 1.4, 0.0))
	# a rain of gold coins glinting down to the sea
	var coins := roundi(130 * _density)
	for i in coins:
		var p := at + Vector3(randf_range(-1.0, 1.0), randf_range(-0.6, 0.6), randf_range(-1.0, 1.0)) * (r * 1.2)
		var d := Vector3(randf_range(-1.0, 1.0), randf_range(-0.5, 1.0), randf_range(-1.0, 1.0))
		_star(p, d, t + 1.9 + randf_range(0.0, 0.6), randf_range(2.4, 3.2), Vector3(7.5, 5.6, 1.8), Vector3(5.0, 3.0, 0.7), 0.3, 2.0, 2.4, 0.18, STROBE, 0.0)
	# and the crown crackles out
	var pops := roundi(90 * _density)
	for i in pops:
		var p := at + fib(i, pops, rot) * (r * randf_range(0.6, 1.1))
		_star(p, _rnd_dir() * randf_range(2.0, 5.0), t + 3.0 + randf_range(0.0, 0.6), randf_range(0.07, 0.15), Vector3(9.0, 8.5, 6.0), C.gold, 0.55, 6.0, 0.0, 0.0, POP, 0.0)
	_event(t + 3.1, at, &"crackle", 1.2, 0, _light(at, Vector3(1.0, 0.9, 0.6), t + 3.1, 2.0, 0.9, 1.0))


## Points of the skull and crossbones in a unit frame (x right, y up, about
## ±1), each tagged in z: 0 skull, 1 eye, 2 bone.
static func roger_shape(density: float) -> PackedVector3Array:
	var out := PackedVector3Array()
	var d := maxf(0.6, density)
	var arc := func(cx: float, cy: float, rx: float, ry: float, a0: float, a1: float, n: int, part: int) -> void:
		var m := maxi(4, roundi(n * d))
		for i in m + 1:
			var a := a0 + (a1 - a0) * i / m
			out.append(Vector3(cx + cos(a) * rx, cy + sin(a) * ry, part))
	var line := func(x0: float, y0: float, x1: float, y1: float, n: int, part: int) -> void:
		var m := maxi(3, roundi(n * d))
		for i in m + 1:
			out.append(Vector3(x0 + (x1 - x0) * i / m, y0 + (y1 - y0) * i / m, part))
	# cranium: most of a circle, open at the bottom where the jaw hangs
	arc.call(0.0, 0.28, 0.5, 0.46, -0.32, PI + 0.32, 34, 0)
	# cheeks down to the jaw
	line.call(-0.47, 0.13, -0.3, -0.18, 5, 0)
	line.call(0.47, 0.13, 0.3, -0.18, 5, 0)
	# the jaw and its teeth
	line.call(-0.3, -0.18, -0.26, -0.36, 3, 0)
	line.call(0.3, -0.18, 0.26, -0.36, 3, 0)
	line.call(-0.26, -0.36, 0.26, -0.36, 8, 0)
	for i in range(-2, 3):
		line.call(i * 0.1, -0.2, i * 0.1, -0.34, 2, 0)
	# eye sockets, burning red
	arc.call(-0.19, 0.26, 0.13, 0.12, 0.0, TAU, 12, 1)
	arc.call(0.19, 0.26, 0.13, 0.12, 0.0, TAU, 12, 1)
	out.append(Vector3(-0.19, 0.26, 1.0))
	out.append(Vector3(0.19, 0.26, 1.0))
	# the nose
	line.call(0.0, 0.1, -0.06, -0.02, 2, 0)
	line.call(0.0, 0.1, 0.06, -0.02, 2, 0)
	# crossbones beneath, knuckled at the ends
	line.call(-0.72, -0.5, 0.72, -1.0, 18, 2)
	line.call(-0.72, -1.0, 0.72, -0.5, 18, 2)
	for e: Vector2 in [Vector2(-0.72, -0.5), Vector2(0.72, -1.0), Vector2(-0.72, -1.0), Vector2(0.72, -0.5)]:
		arc.call(e.x - 0.05 * signf(e.x), e.y + 0.06, 0.07, 0.07, 0.0, TAU, 6, 2)
		arc.call(e.x - 0.05 * signf(e.x), e.y - 0.06, 0.07, 0.07, 0.0, TAU, 6, 2)
	return out


# ------------------------------------------------------------------ the ring

func _star(x0: Vector3, v0: Vector3, t0: float, life: float, c0: Vector3, c1: Vector3, size: float, drag: float, grav: float, trail: float, mode: int, amp: float, seed := -1.0) -> void:
	if seed < 0.0:
		seed = randf()
	var i := _head
	_head = (_head + 1) % _cap
	_used = maxi(_used, i + 1)
	var o := i * STRIDE
	# the transform's rows, as MultiMesh lays them out: the shader reads its
	# columns back as velocity, (drag, gravity, mode), (amplitude, trail, size), start
	_buf[o] = v0.x
	_buf[o + 1] = drag
	_buf[o + 2] = amp
	_buf[o + 3] = x0.x
	_buf[o + 4] = v0.y
	_buf[o + 5] = grav
	_buf[o + 6] = trail
	_buf[o + 7] = x0.y
	_buf[o + 8] = v0.z
	_buf[o + 9] = mode + minf(seed, 0.999)
	_buf[o + 10] = size
	_buf[o + 11] = x0.z
	_buf[o + 12] = c0.x
	_buf[o + 13] = c0.y
	_buf[o + 14] = c0.z
	_buf[o + 15] = c1.x
	_buf[o + 16] = t0
	_buf[o + 17] = life
	_buf[o + 18] = c1.y
	_buf[o + 19] = c1.z
	_dirty = true
	_live_until = maxf(_live_until, t0 + life + trail)


func _event(at: float, pos: Vector3, sound: StringName, power: float, smoke: int, light: Dictionary) -> void:
	_events.append({"at": at, "pos": pos, "sound": sound, "power": power, "smoke": smoke, "light": light})


# ------------------------------------------------------------------ every frame

## The sky's clock runs on the world's (it stops while the world is paused).
func step(dt: float) -> void:
	_now += dt
	# sounds, lights and smoke whose moment has come
	for i in range(_events.size() - 1, -1, -1):
		var e := _events[i]
		if e.at > _now:
			continue
		_events.remove_at(i)
		if _now - e.at < 0.5:
			sounded.emit(e.sound, e.pos, e.power)
		if not (e.light as Dictionary).is_empty():
			_lights.append(e.light)
		if fx != null:
			for s in int(e.smoke):
				var r := _height * 0.18
				var g := randf_range(0.55, 0.7)
				var col := Color(g, g * 0.98, g * 0.96, randf_range(0.05, 0.08))
				var p: Vector3 = e.pos + Vector3(randf_range(-r, r), randf_range(-r, r) * 0.6, randf_range(-r, r))
				fx.emit(p, Vector3(randf_range(-0.6, 0.6), randf_range(-0.3, 0.4), randf_range(-0.6, 0.6)), randf_range(6.0, 9.0),
						randf_range(3.0, 5.0), randf_range(8.0, 12.0), col, col, 0.02, 0.6, Particles.SMOKE, 0.6)
	for i in range(_lights.size() - 1, -1, -1):
		if _now - float(_lights[i].t0) > float(_lights[i].dur):
			_lights.remove_at(i)
	_write_lights()

	var live := _now <= _live_until
	if _dirty:
		_dirty = false
		multimesh.buffer = _buf
	multimesh.visible_instance_count = _used if live else 0
	visible = live
	if live:
		_mat.set_shader_parameter("clock", _now)
	# a quiet sky: start the clock over so its float keeps full precision
	if not live and _events.is_empty() and _now > REBASE:
		_now = 0.0
		_live_until = -1.0
		for j in _used:
			_buf[j * STRIDE + 17] = 0.0
		_dirty = true


## A light's strength at the moment.
func _light_value(l: Dictionary) -> float:
	if l == _steady:
		# the lanterns' glow: steady, with the faintest candle waver
		return float(l.power) * (0.94 + 0.06 * sin(_now * 7.3) * sin(_now * 3.1))
	var t := _now - float(l.t0)
	if t < 0.0:
		return 0.0
	var k := maxf(0.0, 1.0 - t / float(l.dur))
	var v := float(l.power) * (exp(-t * 7.0) * 1.4 + k * k * 0.75)
	if float(l.flick) > 0.0:
		v *= 0.45 + 0.9 * randf()
	return v


## The brightest bursts of the moment into the four lights, and the sea's mirror of them.
func _write_lights() -> void:
	var ls: Array[Dictionary] = _lights.duplicate()
	if not _steady.is_empty():
		ls.append(_steady)
	var vals := {}
	for l in ls:
		vals[l] = _light_value(l)
	if ls.size() > LIGHTS:
		ls.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(vals[a]) > float(vals[b]))
	var any := false
	var pos: Array[Vector4] = []
	var cols: Array[Vector3] = []
	for i in LIGHTS:
		var lamp: OmniLight3D = _lamps[i] if i < _lamps.size() else null
		if i >= ls.size():
			pos.append(Vector4.ZERO)
			cols.append(Vector3.ZERO)
			if lamp != null:
				lamp.visible = false
			continue
		var l := ls[i]
		var v: float = vals[l]
		var p: Vector3 = l.p
		var c: Vector3 = l.c
		pos.append(Vector4(p.x, p.y, p.z, v))
		cols.append(c)
		any = any or v > 0.0
		if lamp != null:
			lamp.visible = v > 0.01
			lamp.position = p
			lamp.light_color = Color(c.x, c.y, c.z)
			lamp.light_energy = v * LAMP
	if ocean != null and ocean.material != null and (any or _was_lit):
		ocean.material.set_shader_parameter("fw_lights", pos)
		ocean.material.set_shader_parameter("fw_colors", cols)
	_was_lit = any
