class_name Haunt
extends RefCounted
## The Hollow Jack's power (an event ship's, ShipClass.ability "phantom"):
## the Phantom Run. Called on, she crosses over into the spirit world: a
## ragged front of ghost-fire burns across her and she thins to a mist with a
## cold green rim (the ship_*_phantom shaders), her fires go out, no shot,
## ram or reef can touch her, her crew fade from her decks and she runs half
## as fast again whatever the wind. When the run's over she comes back with a
## Banshee's Wail: a ring of dread racing out over the water that hurts every
## ship it reaches, the nearest worst, and cuts down their gun crews. Then the
## power sleeps a while before it can be called on again.

const READY := 0
const PHANTOM := 1
const RESTING := 2

## Seconds the crossing takes, each way.
const CROSS := 0.7
## Seconds she's in the spirit world, the crossings included.
const SPAN := 7.0
## Seconds before she can call on it again, from her return.
const REST := 40.0
## How far the wail reaches (m), the seconds it takes to get there, and what
## it does to a ship at her side (it falls off to a little under half at the edge).
const WAIL_R := 75.0
const WAIL_T := 0.9
const WAIL_DMG := 110.0
## While she's a ghost: her speed (times her best, any wind) and her helm.
const SPEED := 1.5
const TURN := 1.3

const SHADERS := {
	"hull": preload("res://shaders/ship_hull_phantom.gdshader"),
	"stern": preload("res://shaders/ship_stern_phantom.gdshader"),
	"deck": preload("res://shaders/ship_deck_phantom.gdshader"),
	"parts": preload("res://shaders/ship_parts_phantom.gdshader"),
	"rope": preload("res://shaders/ship_rope_phantom.gdshader"),
	"sail": preload("res://shaders/ship_sail_phantom.gdshader"),
	"flag": preload("res://shaders/ship_flag_phantom.gdshader"),
}
const GREEN := Color(0.9, 4.2, 2.2)
const GREEN_END := Color(0.05, 0.9, 0.42)

## The kind of each of her shaders (plain or wounded), to find its phantom.
static var _kinds := {}

var ship: Ship
var state := READY
## Seconds into the state.
var t := 0.0
## How far over she is (0 solid .. 1 a ghost): what the shaders draw.
var phantom := 0.0
## [MeshInstance3D, its own material, its shadow setting] for each she wears a phantom over.
var _worn: Array = []
## Her phantom materials, by the material they stand in for.
var _mats := {}
var _noise: Texture2D
## The wail's ring (seconds since it went out; -1 none), and the ships it has reached.
var _wail_t := -1.0
var _wailed: Array[Ship] = []
var _wisp_t := 0.0


func _init(p_ship: Ship) -> void:
	ship = p_ship


## How ready the power is (0 just spent .. 1 ready), for the button's ring.
func ready01() -> float:
	match state:
		READY:
			return 1.0
		PHANTOM:
			return 0.0
	return clampf(t / REST, 0.0, 1.0)


func can_call() -> bool:
	return state == READY and ship.alive


## Calls on the Phantom Run. False if it's spent or she's done for.
func call_up() -> bool:
	if not can_call():
		return false
	state = PHANTOM
	t = 0.0
	# the spirit world puts out her fires and knits her canvas
	ship.afire = 0.0
	ship.afire_by = null
	ship.torn = 0.0
	ship.phantom = true
	_wear()
	var w := ship.world
	var mid := Vector3(ship.pos.x, ship.position.y + ship.cls.freeboard + 1.5, ship.pos.z)
	_burst(mid, 1.0)
	if w.sound != null:
		var h := w.heard(ship.pos)
		w.sound.phantom(h.x, h.y, h.z)
	w.status.emit(ship, "phantom", ship)
	return true


func update(dt: float) -> void:
	if dt <= 0.0:
		return
	t += dt
	match state:
		PHANTOM:
			# over in CROSS seconds, back over the last CROSS
			phantom = clampf(t / CROSS, 0.0, 1.0) * clampf((SPAN - t) / CROSS, 0.0, 1.0)
			phantom = phantom * phantom * (3.0 - 2.0 * phantom)
			_fade(phantom)
			# untouchable till she's half back
			ship.phantom = ship.alive and t < SPAN - CROSS * 0.5
			_wisps(dt)
			if t >= SPAN:
				_unwear()
				phantom = 0.0
				state = RESTING
				t = 0.0
				ship.phantom = false
				if ship.alive:
					_wail_out()
		RESTING:
			if t >= REST:
				state = READY
				t = 0.0
				if ship.world.sound != null and ship.team == Ship.Team.PLAYER:
					ship.world.sound.toll()
				ship.world.status.emit(ship, "haunt_ready", ship)
	if _wail_t >= 0.0:
		_wail_step(dt)


## Back to solid at once, the power ready (a new voyage, the harbour).
func reset() -> void:
	_unwear()
	phantom = 0.0
	state = READY
	t = 0.0
	_wail_t = -1.0
	ship.phantom = false


# ------------------------------------------------------------------ her look

static func _kind_of(sh: Shader) -> String:
	if _kinds.is_empty():
		for k: String in ShipModel.SHADERS:
			_kinds[ShipModel.SHADERS[k]] = k
		for k: String in ShipDamage.DMG_SHADERS:
			_kinds[ShipDamage.DMG_SHADERS[k]] = k
	return _kinds.get(sh, "")


## One of each of her phantom shaders on her own meshes, for the game's
## warm-up: the first Phantom Run mustn't stutter while they build.
static func warm_meshes(model: ShipModel) -> Array[Node3D]:
	var out: Array[Node3D] = []
	var seen := {}
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		var own := mi.material_override as ShaderMaterial
		if own == null:
			continue
		var kind := _kind_of(own.shader)
		if not SHADERS.has(kind) or seen.has(kind):
			continue
		seen[kind] = true
		var m := ShaderMaterial.new()
		m.shader = SHADERS[kind]
		m.set_shader_parameter("phantom", 0.5)
		var w := MeshInstance3D.new()
		w.mesh = mi.mesh
		w.material_override = m
		out.append(w)
	return out


## Her phantom materials over her own, the uniforms (her paint, her wounds)
## copied across; no shadows for a ghost.
func _wear() -> void:
	_unwear()
	if _noise == null:
		_noise = load("res://art/noise.png")
	for node in ship.model.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		var own := mi.material_override as ShaderMaterial
		if own == null:
			continue
		var kind := _kind_of(own.shader)
		if not SHADERS.has(kind):
			continue
		var m: ShaderMaterial = _mats.get(own)
		if m == null:
			m = ShaderMaterial.new()
			m.shader = SHADERS[kind]
			m.set_shader_parameter("dmg_noise", _noise)
			_mats[own] = m
		ShipDamage._copy_paint(own, m)
		m.set_shader_parameter("phantom", 0.0)
		_worn.append([mi, own, mi.cast_shadow])
		mi.material_override = m
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _unwear() -> void:
	for w: Array in _worn:
		var mi: MeshInstance3D = w[0]
		if is_instance_valid(mi) and mi.material_override == _mats.get(w[1]):
			mi.material_override = w[1]
			mi.cast_shadow = w[2]
	_worn.clear()


func _fade(p: float) -> void:
	for m: ShaderMaterial in _mats.values():
		m.set_shader_parameter("phantom", p)


# ------------------------------------------------------------------ effects

## A gust of ghost-fire and green mist bursting off her.
func _burst(at: Vector3, k: float) -> void:
	var fx := ship.world.fx
	var L := ship.cls.length
	for i in 34:
		var a := randf() * TAU
		var r := randf_range(0.1, 0.55) * L
		var p := at + Vector3(cos(a) * r * 0.45, randf_range(-1.0, 5.0), sin(a) * r)
		var v := Vector3(cos(a) * randf_range(2.0, 6.0), randf_range(1.0, 4.0), sin(a) * randf_range(2.0, 6.0)) * k
		fx.emit(p, v, randf_range(0.6, 1.2), randf_range(0.25, 0.45), randf_range(0.9, 1.5), GREEN * 0.8, GREEN_END, -1.2, 1.6, Particles.SOFT, 0.05, Vector2.ZERO, randf_range(-1.5, 1.5), true)
	for i in 14:
		var a := randf() * TAU
		var p := at + Vector3(cos(a) * L * 0.2, randf_range(-1.5, 2.0), sin(a) * L * 0.35)
		fx.emit(p, Vector3(cos(a) * 2.5, randf_range(0.2, 1.2), sin(a) * 2.5) + ship.vel * 0.5, randf_range(3.0, 4.5), randf_range(2.0, 3.0), randf_range(7.0, 10.0),
				Color(0.55, 0.95, 0.78, 0.4), Color(0.7, 1.0, 0.86), -0.15, 1.0, Particles.SMOKE, 0.12)


## While she's a ghost: will-o'-wisps streaming off her rails and spars, and
## a green mist trailing on the water in her wake.
func _wisps(dt: float) -> void:
	_wisp_t += dt * (22.0 + 20.0 * phantom)
	var fx := ship.world.fx
	var xf := ship.model.global_transform if ship.model.is_inside_tree() else ship.transform * ship.model.transform
	var pts := ship.model.haunt_points
	while _wisp_t > 1.0:
		_wisp_t -= 1.0
		var p: Vector3
		if not pts.is_empty() and randf() < 0.45:
			p = xf * pts[randi() % pts.size()]
		else:
			var u := randf_range(-0.45, 0.45) * ship.cls.length
			var side := 1.0 if randf() < 0.5 else -1.0
			p = xf * Vector3(side * ship.cls.beam * randf_range(0.0, 0.5), randf_range(0.5, ship.cls.freeboard + 9.0), u)
		var v := -ship.vel * 0.35 + Vector3(randf_range(-0.6, 0.6), randf_range(0.6, 1.8), randf_range(-0.6, 0.6))
		fx.emit(p, v, randf_range(0.8, 1.5), randf_range(0.2, 0.36), 0.05, GREEN, GREEN_END, -0.6, 0.6, Particles.SPARK, 0.05, Vector2.ZERO, 0.0, true)
		if randf() < 0.25:
			var q := xf * Vector3(randf_range(-0.5, 0.5) * ship.cls.beam, 0.0, randf_range(-0.5, 0.2) * ship.cls.length)
			q.y = ship.world.water_height(q.x, q.z) + 0.4
			fx.emit(q, Vector3(randf_range(-0.5, 0.5), 0.15, randf_range(-0.5, 0.5)), randf_range(2.5, 3.5), randf_range(1.6, 2.4), randf_range(5.0, 7.0),
					Color(0.5, 0.95, 0.75, 0.32), Color(0.66, 1.0, 0.85), -0.05, 0.8, Particles.SMOKE, 0.2)


## She's back: the Banshee's Wail goes out.
func _wail_out() -> void:
	_wail_t = 0.0
	_wailed.clear()
	var w := ship.world
	var at := Vector3(ship.pos.x, ship.position.y + ship.cls.freeboard + 1.0, ship.pos.z)
	_burst(at, 1.6)
	# the ring itself: ghost-fire racing out flat over the water, a band of
	# green mist rolling out behind it, and sparks thrown up off its crest
	var sea := w.water_height(ship.pos.x, ship.pos.z) + 0.6
	var n := 110
	for i in n:
		var a := TAU * (i + randf() * 0.5) / n
		var d := Vector3(cos(a), 0.0, sin(a))
		var o := Vector3(ship.pos.x, sea, ship.pos.z) + d * 4.0
		var sp := WAIL_R / WAIL_T * randf_range(0.82, 0.92)
		fx_emit(o, d * sp + Vector3(0, randf_range(0.0, 0.8), 0), WAIL_T * randf_range(1.05, 1.2), 2.2, 4.6, GREEN, GREEN_END, 0.0, 0.25)
		if i % 3 == 0:
			fx_emit(o + Vector3(0, 0.5, 0), d * sp * 0.6 + Vector3(0, randf_range(2.0, 5.0), 0), randf_range(0.9, 1.4), 0.35, 0.05, Color(1.6, 6.0, 3.2), GREEN_END, -0.8, 1.4)
		if i % 2 == 0:
			w.fx.emit(o, d * sp * 0.45, randf_range(2.0, 2.8), 2.5, 7.0, Color(0.5, 0.95, 0.75, 0.38), Color(0.66, 1.0, 0.85), -0.1, 1.1, Particles.SMOKE, 0.05)
	if w.sound != null:
		var h := w.heard(ship.pos)
		w.sound.wail(h.x, h.y, h.z)
	w.shook.emit(0.55 if ship.team == Ship.Team.PLAYER else 0.4 * w.loudness(ship.pos))
	ship.kick_roll(0.06)


func fx_emit(p: Vector3, v: Vector3, life: float, s0: float, s1: float, c0: Color, c1: Color, grav: float, drag: float) -> void:
	ship.world.fx.emit(p, v, life, s0, s1, c0, c1, grav, drag, Particles.SOFT, 0.02, Vector2.ZERO, 0.0, true)


## The ring spreading: each ship it reaches (not her own side) takes its blow.
func _wail_step(dt: float) -> void:
	_wail_t += dt
	var k := clampf(_wail_t / WAIL_T, 0.0, 1.0)
	var r := WAIL_R * (1.0 - (1.0 - k) * (1.0 - k))
	var w := ship.world
	for s in w.ships:
		if s == ship or not s.alive or s.removed or _wailed.has(s):
			continue
		if s.team == ship.team or s.prize:
			continue
		var d := Vector2(s.pos.x - ship.pos.x, s.pos.z - ship.pos.z).length() - s.cls.length * 0.35
		if d > r:
			continue
		_wailed.append(s)
		var near := clampf(d / WAIL_R, 0.0, 1.0)
		var at := Vector3(s.pos.x, s.position.y + s.cls.freeboard + 1.0, s.pos.z)
		var dealt := s.damage(WAIL_DMG * lerpf(1.0, 0.45, near), ship, null, false, "wail")
		w.hit.emit(s, ship, dealt, at)
		if s.alive and s.rake(ship):
			w.status.emit(s, "dread", ship)
		s.kick_roll(0.1 * (1.0 - near * 0.5))
		for i in 10:
			var a := randf() * TAU
			w.fx.emit(at + Vector3(cos(a), randf_range(-1.0, 2.0), sin(a)) * s.cls.beam * 0.4, Vector3(cos(a) * 2.0, randf_range(1.5, 3.5), sin(a) * 2.0),
					randf_range(0.7, 1.2), randf_range(0.3, 0.5), 0.06, Color(1.4, 5.5, 3.0), GREEN_END, -0.8, 1.0, Particles.SPARK, 0.02, Vector2.ZERO, 0.0, true)
	if k >= 1.0:
		_wail_t = -1.0
