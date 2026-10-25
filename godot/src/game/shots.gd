class_name Shots
extends Node3D
## Shot in flight, and the smoke it leaves hanging. A ball is written once
## into a ring the GPU reads (where it left the barrel, how fast, when, and
## what it is) and flies on there in closed form: its iron (two half-balls
## cartwheeling on their chain, for chain shot), its streak of hot air and
## its thread of powder smoke drifting off on the breeze all come from that
## one instance (shaders/shots.gdshader, shaders/smoke_trail.gdshader). Grape
## shot flies in a ring of its own, as it leaves no smoke. The CPU walks the
## same arcs to find what each ball strikes and plays what happens: the
## splash or the splinters, a shell's burst that catches every ship close by,
## a hull set ablaze, canvas torn to ribbons, a deck swept by a hail of
## musket balls, a ghost's wraith-fire unmanning a gun crew, or a ball passing
## clean through a phantom. Three draws for every ball at sea.

const GRAVITY := 14.0
const CAPACITY := 256
const PELLETS := 256
## Floats per ball: a 3x4 transform, a colour and the custom vec4 (see Particles).
const STRIDE := 20
const REBASE := 1024.0
## A ball still flying after this long (s) is forgotten.
const MAX_AGE := 7.0
## Lengths of a ball's thread of smoke, from the oldest wisp to the ball.
const TRAIL_SEGMENTS := 40
## Seconds a grape volley's hits on one ship are gathered over, to be told as one blow.
const RAKE_GATHER := 0.22
## Seconds between the sparks a lit fuse spits, and the embers red-hot iron sheds.
const SPARK_EVERY := 0.035
## The vault trails that shed motes behind round shot (Cosmetics.TRAIL_STYLES):
## powder and soot leave only their smoke.
## Wraith-fire flies as round shot does on the GPU, with the wraith's trail
## (a style only a phantom's guns wear), which the shader lights up.
const WRAITH_STYLE := 9
const MOTES: Array[bool] = [false, true, false, true, true, true, true, true, true, true, true]

var world: World
## Balls fired this voyage, by kind (each of a bag of grape counts).
var fired := PackedInt32Array([0, 0, 0, 0, 0, 0, 0])

var _buf := PackedFloat32Array()
var _pbuf := PackedFloat32Array()
var _next := 0
var _pnext := 0
var _now := 0.0
var _dirty := false
var _pdirty := false
var _live: Array[_Ball] = []
var _balls: MultiMesh
var _trails: MultiMesh
var _pellets: MultiMesh
var _shot_mat: ShaderMaterial
var _trail_mat: ShaderMaterial
## A grape volley's hits on each ship, gathered: ship -> [attacker, damage, where, seconds since the last].
var _rakes := {}
## When (world.time) each ship last sounded each special shot's blow (her id * 8 + which): a
## volley is heard as one, not ball by ball.
var _sounded := {}


class _Ball:
	var slot := 0
	var pellet := false
	var kind := Ammo.ROUND
	var p0 := Vector3.ZERO
	var v0 := Vector3.ZERO
	## Launch time on the shots' clock, and how far into its flight the CPU has walked it.
	var born := 0.0
	var t := 0.0
	var owner: Ship
	var damage := 0.0
	## The ship whose canvas it last tore through (once a ship, as it flies on).
	var tore: Ship
	var spark := 0.0
	## The vault trail round shot flies with (Cosmetics.TRAIL_STYLES).
	var style := 0
	## Heard tearing past the listener already.
	var heard := false
	## The ghost ship it last met, whether it passes through her (rolled once
	## a ship), and whether it has shimmered through one yet.
	var ghost: Ship
	var ghost_pass := false
	var shimmered := false


func _ready() -> void:
	_buf.resize(CAPACITY * STRIDE)
	_pbuf.resize(PELLETS * STRIDE)
	var cull := AABB(Vector3(-1e5, -500.0, -1e5), Vector3(2e5, 1000.0, 2e5))
	_shot_mat = ShaderMaterial.new()
	_shot_mat.shader = preload("res://shaders/shots.gdshader")
	_shot_mat.set_shader_parameter("gravity", GRAVITY)
	# the hot streak over its own smoke
	_shot_mat.render_priority = 1
	_trail_mat = ShaderMaterial.new()
	_trail_mat.shader = preload("res://shaders/smoke_trail.gdshader")
	_trail_mat.set_shader_parameter("gravity", GRAVITY)
	_trail_mat.set_shader_parameter("noise_tex", preload("res://art/noise.png"))
	var shot_mesh := _shot_mesh()
	_balls = _ring(shot_mesh, cull, _buf, CAPACITY)
	_trails = _ring(_trail_mesh(), cull, _buf, CAPACITY)
	_pellets = _ring(shot_mesh, cull, _pbuf, PELLETS)
	for pair: Array in [[_balls, _shot_mat], [_trails, _trail_mat], [_pellets, _shot_mat]]:
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = pair[0]
		mi.material_override = pair[1]
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
		add_child(mi)


func _ring(mesh: Mesh, cull: AABB, buf: PackedFloat32Array, n: int) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = n
	# the instance transforms carry launch data, not placements: cull by hand
	mm.custom_aabb = cull
	mm.buffer = buf
	return mm


## The streak (z 0), the ball's card (z 1), chain shot's second half-ball
## (z 2) and the chain slung between them (z 3), as four unit quads.
static func _shot_mesh() -> ArrayMesh:
	var v := PackedVector3Array()
	var idx := PackedInt32Array()
	for z: float in [0.0, 1.0, 2.0, 3.0]:
		var b := v.size()
		for c: Vector2 in [Vector2(-0.5, -0.5), Vector2(0.5, -0.5), Vector2(0.5, 0.5), Vector2(-0.5, 0.5)]:
			v.append(Vector3(c.x, c.y, z))
		idx.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
	return _mesh(v, idx)


## A strip TRAIL_SEGMENTS long: x -1..1 across, y 0..1 along.
static func _trail_mesh() -> ArrayMesh:
	var v := PackedVector3Array()
	var idx := PackedInt32Array()
	for k in TRAIL_SEGMENTS + 1:
		var u := float(k) / TRAIL_SEGMENTS
		v.append(Vector3(-1.0, u, 0.0))
		v.append(Vector3(1.0, u, 0.0))
	for k in TRAIL_SEGMENTS:
		var a := k * 2
		idx.append_array([a, a + 1, a + 2, a + 1, a + 3, a + 2])
	return _mesh(v, idx)


static func _mesh(v: PackedVector3Array, idx: PackedInt32Array) -> ArrayMesh:
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = v
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return m


## Looses one ball of `kind` (Ammo) from `pos` at `vel` (m/s, the ship's own
## way included); round shot flies with the vault trail `style` (a special
## shot always with its own).
func fire(pos: Vector3, vel: Vector3, owner: Ship, damage: float, kind: int = Ammo.ROUND, style := 0) -> void:
	fired[kind] += 1
	var pellet := kind == Ammo.GRAPE
	var slot: int
	if pellet:
		slot = _pnext
		_pnext = (_pnext + 1) % PELLETS
	else:
		slot = _next
		_next = (_next + 1) % CAPACITY
	# the ring has come round on a ball still flying (a sea full of broadsides): it drops
	for i in _live.size():
		if _live[i].slot == slot and _live[i].pellet == pellet:
			_live.remove_at(i)
			break
	var b := _Ball.new()
	b.slot = slot
	b.pellet = pellet
	b.kind = kind
	b.p0 = pos
	b.v0 = vel
	b.born = _now
	b.owner = owner
	b.damage = damage
	b.spark = randf() * SPARK_EVERY
	b.style = style if kind == Ammo.ROUND else (WRAITH_STYLE if kind == Ammo.WRAITH else 0)
	_live.append(b)
	var buf := _pbuf if pellet else _buf
	var o := slot * STRIDE
	buf[o] = vel.x
	buf[o + 1] = 0.0
	buf[o + 2] = 0.0
	buf[o + 3] = pos.x
	buf[o + 4] = vel.y
	buf[o + 5] = 0.0
	buf[o + 6] = 0.0
	buf[o + 7] = pos.y
	buf[o + 8] = vel.z
	buf[o + 9] = 0.0
	buf[o + 10] = 0.0
	buf[o + 11] = pos.z
	for k in 4:
		buf[o + 12 + k] = 1.0
	buf[o + 16] = _now
	buf[o + 17] = _now + MAX_AGE + 1.0
	buf[o + 18] = randf()
	buf[o + 19] = float((Ammo.ROUND if kind == Ammo.WRAITH else kind) + 8 * b.style)
	if pellet:
		_pdirty = true
	else:
		_dirty = true


## Where a ball is `t` seconds into its flight, and how fast it's going.
static func at(b: _Ball, t: float) -> Vector3:
	return b.p0 + b.v0 * t + Vector3(0.0, -0.5 * GRAVITY * t * t, 0.0)


static func vel_at(b: _Ball, t: float) -> Vector3:
	return b.v0 + Vector3(0.0, -GRAVITY * t, 0.0)


func step(dt: float) -> void:
	_now += dt
	if _now > REBASE:
		_rebase()
	for i in range(_live.size() - 1, -1, -1):
		var b := _live[i]
		var t1 := minf(_now - b.born, MAX_AGE)
		var stop := _fly(b, b.t, t1)
		b.t = t1
		if stop >= 0.0 or t1 >= MAX_AGE:
			var buf := _pbuf if b.pellet else _buf
			buf[b.slot * STRIDE + 17] = b.born + (stop if stop >= 0.0 else t1)
			if b.pellet:
				_pdirty = true
			else:
				_dirty = true
			_live.remove_at(i)
		else:
			if not b.heard:
				_tear_past(b)
			if b.kind == Ammo.SHELL or b.kind == Ammo.FIRE or ((b.kind == Ammo.ROUND or b.kind == Ammo.WRAITH) and MOTES[b.style]):
				_spit(b, dt)
	_flush_rakes(dt)
	_shot_mat.set_shader_parameter("now", _now)
	_trail_mat.set_shader_parameter("now", _now)
	if _dirty:
		_dirty = false
		_balls.buffer = _buf
		_trails.buffer = _buf
	if _pdirty:
		_pdirty = false
		_pellets.buffer = _pbuf


## A ball tearing close past the listener from a gun well off (not your own):
## heard sweeping across, a chain whirling by with a deep, throbbing moan
## and grape with a thin whistle.
func _tear_past(b: _Ball) -> void:
	var p := at(b, b.t)
	var l := world.listener
	if Vector2(p.x - l.x, p.z - l.z).length_squared() >= 15.0 * 15.0:
		return
	b.heard = true
	if world.sound == null or Vector2(b.owner.pos.x - l.x, b.owner.pos.z - l.z).length_squared() <= 35.0 * 35.0:
		return
	var h := world.heard(p)
	var to := world.heard(p + vel_at(b, b.t) * 0.5)
	world.sound.whoosh(h.x, h.y * 3.0, to.y * 3.0, 0.55 if b.kind == Ammo.CHAIN else (1.5 if b.kind == Ammo.GRAPE else 1.0))


## A lit fuse sputtering on a shell, embers shed off red-hot iron, and what
## a vault trail leaves hanging behind round shot (the web's trail()).
func _spit(b: _Ball, dt: float) -> void:
	b.spark += dt
	while b.spark > SPARK_EVERY:
		b.spark -= SPARK_EVERY
		var p := at(b, b.t - b.spark)
		if b.kind == Ammo.SHELL:
			var j := Vector3(randf_range(-0.08, 0.08), randf_range(-0.08, 0.08), randf_range(-0.08, 0.08))
			world.fx.emit(p + j, Vector3(randf_range(-1.5, 1.5), randf_range(-0.5, 2.0), randf_range(-1.5, 1.5)), randf_range(0.18, 0.4), randf_range(0.12, 0.2), 0.03,
					Color(8.0, 5.0, 1.6), Color(3.0, 1.0, 0.1), 6.0, 1.0, Particles.SPARK, 0.001, Vector2.ZERO, 0.0, true)
		elif b.kind == Ammo.FIRE:
			if randf() < 0.7:
				world.fx.emit(p + _jit(0.16), Vector3(randf_range(-0.8, 0.8), randf_range(0.0, 1.6), randf_range(-0.8, 0.8)), randf_range(0.5, 1.0), randf_range(0.14, 0.24), 0.04,
						Color(8.0, 3.4, 0.7), Color(2.0, 0.3, 0.02), 4.0, 0.6, Particles.SPARK, 0.01, Vector2.ZERO, 0.0, true)
		else:
			world.fx.trail_mote(p, vel_at(b, b.t), b.style, _now)


static func _jit(r: float) -> Vector3:
	return Vector3(randf_range(-r, r), randf_range(-r, r), randf_range(-r, r))


## Walks a ball along its arc from t0 to t1 (s of flight), in steps short
## enough that it can't skip through a hull. Returns when it struck
## something, or -1 while it flies on.
func _fly(b: _Ball, t0: float, t1: float) -> float:
	var span := (t1 - t0) * b.v0.length()
	var n := clampi(ceili(span / 0.7), 1, 16)
	var prev := at(b, t0)
	for k in n:
		var t := lerpf(t0, t1, float(k + 1) / n)
		var p := at(b, t)
		if _strike_ship(b, p, t):
			return t
		# the Kraken's arms and eye (Kraken.strike plays the blow)
		if world.kraken != null and world.kraken.strike(prev, p, b.damage, b.owner, b.kind):
			return t
		prev = p
		# a fort's walls (Forts.strike plays the blow)
		if world.forts != null and world.forts.strike(p, vel_at(b, t), b.damage, b.owner, b.kind):
			return t
		var ground := world.ground_height(p.x, p.z)
		if ground > 0.0 and p.y < ground:
			var g := Vector3(p.x, ground + 0.3, p.z)
			world.scared.emit(g, 140.0 if b.kind == Ammo.SHELL else 80.0)
			if b.kind == Ammo.SHELL:
				_detonate(b, g, false, null, 0.0)
			else:
				world.fx.sand_hit(g)
				if world.sound != null and (b.kind != Ammo.GRAPE or randf() < 0.25):
					var h := world.heard(p)
					world.sound.thud(h.x, h.y, h.z)
			return t
		var wy := world.water_height(p.x, p.z)
		if p.y < wy:
			_into_sea(b, Vector3(p.x, wy, p.z))
			return t
	return -1.0


## A ball into the sea: a shell bursts, grape kicks up a hail of little
## spouts, red-hot iron hisses up a gout of steam, and round shot throws up
## its white column and rings the water.
func _into_sea(b: _Ball, s: Vector3) -> void:
	if b.kind == Ammo.SHELL:
		_detonate(b, s, true, null, 0.0)
		return
	var snd := world.sound
	var h := world.heard(s)
	if b.kind == Ammo.GRAPE:
		world.fx.splash(s, 0.32)
		world.wake.stamp(s.x, s.z, 0.9, 0.5)
		if snd != null and randf() < 0.3:
			snd.splash(h.x * 0.5, h.y, h.z)
		return
	if b.kind == Ammo.FIRE:
		world.fx.steam(s)
		if snd != null:
			snd.sizzle(h.x, h.y, h.z)
	elif b.kind == Ammo.WRAITH:
		world.fx.wraith_splash(s)
	else:
		world.fx.splash(s, 1.0)
	if snd != null:
		snd.splash(h.x, h.y, h.z)
	world.wake.stamp(s.x, s.z, 2.2, 1.4)
	world.wake.stamp(s.x, s.z, 4.5, 0.8, true)
	# a crater that rings outward
	world.wake.push(s.x, s.z, 1.8, -0.35)


## Tests the ball (at p, t seconds into its flight) against every hull near
## it, in each hull's own frame: an oriented box shaped by her lines, and her
## rig above it. Returns true if it struck one.
func _strike_ship(b: _Ball, p: Vector3, t: float) -> bool:
	for s: Ship in world.ships:
		# a settled wreck sits too low and twisted to stop a ball; your gunners shoot past your own escorts
		if s == b.owner or s.removed or (not s.alive and s.sink_t > 2.0):
			continue
		if s.team == Ship.Team.PLAYER and b.owner.team == Ship.Team.PLAYER:
			continue
		# a ship crossed into the spirit world (Haunt): the ball flies through her
		if s.phantom:
			continue
		var dx := p.x - s.pos.x
		var dz := p.z - s.pos.z
		var reach := s.cls.length * 0.55
		if dx * dx + dz * dz > reach * reach:
			continue
		var local := s.transform.affine_inverse() * p
		var shape := s.model.shape
		var u := local.z / s.cls.length + 0.5
		if u < 0.0 or u > 1.02:
			continue
		var tc := clampf(u, 0.0, 1.0)
		var top := shape.top(tc) + 0.6
		if local.y > top:
			if not s.alive:
				continue
			if _above_deck(b, s, p, t, local, top, tc):
				return true
			continue
		if local.y < shape.bottom(tc) - 0.2:
			continue
		if absf(local.x) > shape.half_width_at_y(tc, maxf(local.y, 0.0)) + 0.15:
			continue
		if _phases(b, s):
			_phase_through(b, s, p, t)
			continue
		if not s.alive:
			if b.kind == Ammo.SHELL:
				_detonate(b, p, false, null, 0.0)
			else:
				world.fx.wood_hit(p, Vector3.UP)
			return true
		match b.kind:
			Ammo.GRAPE:
				_grape_hit(b, s, p)
			Ammo.CHAIN:
				_chain_hit(b, s, p, t, local, top)
			_:
				var n := s.port_dir() * (1.0 if local.x >= 0.0 else -1.0)
				# a phantom has no timber to splinter
				if s.ghost:
					world.fx.ecto_hit(p, n)
				elif b.kind != Ammo.WRAITH:
					world.fx.wood_hit(p, n)
				if world.sound != null:
					var h := world.heard(p)
					world.sound.hit(h.x, h.y, h.z)
				var dealt := s.damage(b.damage, b.owner, p, true, "shot", b.kind == Ammo.WRAITH)
				if b.kind == Ammo.WRAITH:
					_haunt(b, s, p, n)
				if b.kind == Ammo.SHELL:
					_detonate(b, p, false, s, dealt)
				else:
					if b.kind == Ammo.FIRE:
						_ignite(b, s, p)
					world.hit.emit(s, b.owner, dealt, p)
		return true
	return false


## A ball above her deck: chain scythes through anything standing there,
## grape sweeps the deck at head height, and anything else flies on through
## the rigging, tearing canvas or smashing into a mast. True if it stopped.
func _above_deck(b: _Ball, s: Ship, p: Vector3, t: float, local: Vector3, top: float, tc: float) -> bool:
	if b.kind == Ammo.CHAIN:
		var mast_h := 0.0
		for m: Dictionary in s.cls.masts:
			mast_h = maxf(mast_h, float(m.height))
		if absf(local.x) < s.cls.beam * 0.75 and local.y < top + mast_h * 0.95:
			if _phases(b, s):
				_phase_through(b, s, p, t)
				return false
			_chain_hit(b, s, p, t, local, top)
			return true
		return false
	if b.kind == Ammo.GRAPE:
		if local.y < top + 2.2 and absf(local.x) < s.model.shape.half_width_at_y(tc, maxf(0.0, top - 0.6)):
			if _phases(b, s):
				_phase_through(b, s, p, t)
				return false
			_grape_hit(b, s, p)
			return true
		return false
	var rig := s.dmg.rig_test(local)
	var v := vel_at(b, t)
	if rig.x == 2:
		if _phases(b, s):
			_phase_through(b, s, p, t)
			return false
		var dealt := s.damage(b.damage * 0.4, b.owner, p, false, "shot", b.kind == Ammo.WRAITH)
		s.dmg.on_rig_hit(2, rig.y, p, v)
		if b.kind == Ammo.SHELL:
			_detonate(b, p, false, s, dealt)
		else:
			if b.kind == Ammo.FIRE:
				_ignite(b, s, p)
			if b.kind == Ammo.WRAITH:
				_haunt(b, s, p, Vector3.ZERO)
			world.hit.emit(s, b.owner, dealt, p)
		return true
	if rig.x == 1 and b.tore != s and not _phases(b, s):
		b.tore = s
		s.dmg.on_rig_hit(1, rig.y, p, v)
		# red-hot shot through dry canvas: the sails catch
		if b.kind == Ammo.FIRE and randf() < 0.5:
			_ignite(b, s, p)
	return false


## Red-hot iron struck her: she catches, and burns on.
func _ignite(b: _Ball, s: Ship, p: Vector3) -> void:
	world.fx.fire_hit(p)
	if world.sound != null and _can_play(s, 1, 0.3):
		var h := world.heard(p)
		world.sound.ignite(h.x, h.y, h.z)
	if s.ignite(b.owner):
		world.status.emit(s, "ablaze", b.owner)
	elif s.ghost and _can_play(s, 6, 2.5):
		world.status.emit(s, "unburnt", b.owner)


## Chain through her rig: the canvas on the nearest mast torn to ribbons, now
## and then a spar knocked about, a little hull damage, and her way gone.
func _chain_hit(b: _Ball, s: Ship, p: Vector3, t: float, local: Vector3, top: float) -> void:
	var dealt := s.damage(b.damage, b.owner, null, false)
	var v := vel_at(b, t)
	var mi := s.dmg.nearest_mast(local.z)
	if mi >= 0:
		s.dmg.on_rig_hit(1, mi, p, v)
		s.dmg.on_rig_hit(1, mi, p, v)
		if randf() < 0.14 and local.y > top + 1.5:
			s.dmg.on_rig_hit(2, mi, p, v)
	world.fx.shreds(p, v, s.livery.sail.srgb_to_linear())
	if world.sound != null and _can_play(s, 2, 0.2):
		var h := world.heard(p)
		world.sound.chain(h.x, h.y, h.z)
	if s.shred(b.owner):
		world.status.emit(s, "shredded", b.owner)
	world.hit.emit(s, b.owner, dealt, p)


## A grape ball across her deck. A volley's hits are gathered and told as one blow.
func _grape_hit(b: _Ball, s: Ship, p: Vector3) -> void:
	var dealt := s.damage(b.damage, b.owner, null, false)
	world.fx.pellet_hit(p)
	if world.sound != null and _can_play(s, 3, 0.25):
		var h := world.heard(p)
		world.sound.grape(h.x, h.y, h.z)
	if s.rake(b.owner):
		world.status.emit(s, "crew", b.owner)
	elif s.ghost and _can_play(s, 6, 2.5):
		world.status.emit(s, "fleshless", b.owner)
	var r: Array = _rakes.get(s, [])
	if r.is_empty():
		_rakes[s] = [b.owner, dealt, p, 0.0]
	else:
		r[1] = float(r[1]) + dealt
		r[3] = 0.0
	# a killing ball is told at once, so the sinking is credited
	if not s.alive:
		_flush_rake(s)


# ------------------------------------------------------------------ ghosts

## Whether the ball passes clean through `s`, a ghost ship: rolled once a
## ball and ship.
func _phases(b: _Ball, s: Ship) -> bool:
	if not s.ghost or not s.alive:
		return false
	if b.ghost != s:
		b.ghost = s
		b.ghost_pass = randf() < Ammo.PHASE
	return b.ghost_pass


## The ball is inside a phantom's hull and carrying on: a shiver of light, once.
func _phase_through(b: _Ball, s: Ship, p: Vector3, t: float) -> void:
	if b.shimmered:
		return
	b.shimmered = true
	world.fx.phase_shimmer(p, vel_at(b, t))
	if _can_play(s, 5, 1.2):
		world.status.emit(s, "phased", b.owner)


## Wraith-fire struck home: green fire, and a crew that will not stand to its guns.
func _haunt(b: _Ball, s: Ship, p: Vector3, n: Vector3) -> void:
	world.fx.wraith_hit(p, n)
	if s.terrify(b.owner):
		world.status.emit(s, "dread", b.owner)


func _flush_rake(s: Ship) -> void:
	var r: Array = _rakes.get(s, [])
	_rakes.erase(s)
	if not r.is_empty():
		world.hit.emit(s, r[0], r[1], r[2])


func _flush_rakes(dt: float) -> void:
	if _rakes.is_empty():
		return
	for s: Ship in _rakes.keys():
		var r: Array = _rakes[s]
		r[3] = float(r[3]) + dt
		if float(r[3]) > RAKE_GATHER:
			_flush_rake(s)


## An explosive shell bursting on a hull, the shore or the sea. Every enemy
## hull close by is caught in it, so a near miss still tells: the nearer, the
## harder, and right alongside it breaches her. `direct` is the ship it
## struck (`dealt` what the ball itself did to her).
func _detonate(b: _Ball, at: Vector3, water: bool, direct: Ship, dealt: float) -> void:
	world.fx.shell_burst(at, water)
	if water:
		world.wake.stamp(at.x, at.z, 3.5, 1.6)
		world.wake.stamp(at.x, at.z, 7.0, 1.0, true)
		world.wake.push(at.x, at.z, 3.2, -0.6)
	var h := world.heard(at)
	if world.sound != null:
		world.sound.shell(h.x, h.y, h.z)
	world.shook.emit(0.45 * h.x * h.x)
	var base := b.damage / float(Ammo.DAMAGE[Ammo.SHELL])
	var R := Ammo.BLAST_RADIUS
	if world.kraken != null:
		world.kraken.blast(at, R, base * Ammo.BLAST_DAMAGE, b.owner)
	for s: Ship in world.ships:
		if s == b.owner or not s.alive or s.removed or s.team == b.owner.team:
			continue
		var dx := at.x - s.pos.x
		var dz := at.z - s.pos.z
		var reach := s.cls.length * 0.5 + R
		if dx * dx + dz * dz > reach * reach:
			continue
		# from the burst to her hull: an oriented box round the keel
		var local := s.transform.affine_inverse() * at
		var ox := maxf(0.0, absf(local.x) - s.cls.beam * 0.5)
		var oz := maxf(0.0, absf(local.z) - s.cls.length * 0.5)
		var dist := Vector2(ox, oz).length()
		if dist > R:
			continue
		var k := 1.0 - dist / R
		var close := dist < 1.6
		var d := s.damage(base * Ammo.BLAST_DAMAGE * (0.3 + 0.7 * k), b.owner, at if close else null, close)
		if s == direct:
			d += dealt
		world.hit.emit(s, b.owner, d, Vector3(at.x, maxf(at.y, s.position.y + 1.5), at.z))
	# the direct hit, if the burst passed her by (a ship the ball itself just
	# sank must still be told, or her sinking is never credited)
	if direct != null and (direct.team == b.owner.team or not direct.alive):
		world.hit.emit(direct, b.owner, dealt, at)


## Ends every ball in flight and all the smoke.
func clear() -> void:
	_live.clear()
	_rakes.clear()
	_sounded.clear()
	for pair: Array in [[_buf, CAPACITY], [_pbuf, PELLETS]]:
		var buf: PackedFloat32Array = pair[0]
		for i in int(pair[1]):
			buf[i * STRIDE + 16] = 0.0
			buf[i * STRIDE + 17] = 0.0
	_dirty = true
	_pdirty = true


## Whether ship `s` may sound special shot `which`'s blow again, `gap` s after the last.
func _can_play(s: Ship, which: int, gap: float) -> bool:
	var key := s.get_instance_id() * 8 + which
	if world.time - float(_sounded.get(key, -1e9)) < gap:
		return false
	_sounded[key] = world.time
	return true


## How many balls are in the air, by kind.
func flying() -> PackedInt32Array:
	var n := PackedInt32Array()
	n.resize(Ammo.KINDS)
	for b in _live:
		n[b.kind] += 1
	return n


## Winds the clock back so the GPU's arithmetic on it stays precise.
func _rebase() -> void:
	_now -= REBASE
	for i in CAPACITY:
		_buf[i * STRIDE + 16] -= REBASE
		_buf[i * STRIDE + 17] -= REBASE
	for i in PELLETS:
		_pbuf[i * STRIDE + 16] -= REBASE
		_pbuf[i * STRIDE + 17] -= REBASE
	for b in _live:
		b.born -= REBASE
	_dirty = true
	_pdirty = true
