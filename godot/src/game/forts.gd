class_name Forts
extends Node3D
## The Brethren's island forts (the web game's src/game/forts.ts). Each holds
## a rise above the sea with bronze guns in the embrasures of its walls; come
## within their reach and they traverse onto you and open fire, leading your
## ship like any gun crew. Batter a gun's embrasure (or burst a shell on it)
## and it is silenced, its carriage smashed and its masonry tumbled; silence
## them all and the beach below is yours to land on. Ashore, the garrison
## sallies out of the gate to meet you. Beat it and the commandant's colours
## come down the staff and yours go up: the fort's guns then cover you and
## fire on any pirate that comes near, it pays a tribute into your purse as
## the hours pass, and its carpenters patch your hull while you lie under its
## walls. Forts taken stay taken, voyage after voyage.
##
## A fort shows the battering it takes: every ball that strikes stone leaves a
## blackened scar and knocks blocks tumbling down the face, a gun's stretch of
## parapet caves in as its crew are shot up, its tower tops come down under a
## steady fire, and a fort silenced burns, its barracks roof going up in
## flames. One you've taken stays scarred, its gaps stopped with gabions and
## planks. The stonework is built at load (FortKit); what comes down is swapped
## out of one mesh per state, never compiled mid-voyage.

## A fort's guns open on you.
signal open_fire(f: Fort)
## A ball of yours struck its guns (or near them).
signal struck(f: Fort, g: Gun, dmg: float, at: Vector3, direct: bool)
## A gun is silenced; `last` when it was the last of them.
signal silenced(f: Fort, g: Gun, last: bool)

## How far the guns reach, and how far a fort's bar shows.
const RANGE := 205.0
const SHOW_RANGE := 360.0
const GUN_HP := 150.0
const RELOAD := 6.4
const SHOT_SPEED := 66.0
const SHOT_DAMAGE := 21.0
const GRAVITY := 14.0
## Each gun traverses this far either side of its embrasure, at this rate (rad/s).
const ARC := 1.3
const TURN := 0.62
## A fort's gun stands high: her gunnery may lay on it this far past her usual reach.
const MARK_REACH := 1.3
## Shot scars and fallen blocks each fort keeps (the oldest give way to the newest).
const POCKS := 40
const DEBRIS := 24
## A gun's parapet caves in once she's this far shot up; a tower's top comes down after this many hits.
const PARAPET_HP := 0.5
const TOWER_HITS := 4
## Tribute per hour a fort pays, and the most it holds for you (hours' worth).
const TRIBUTE_HOUR := 150
const TRIBUTE_CAP := 8.0
## Sail this close to a fort of yours to collect, and lie this close for its carpenters.
const COLLECT_R := 220.0
const HAVEN_R := 175.0
## What each shot does to a gun crew, by Ammo kind (round, chain, grape, fire, shell, firework, wraith).
const AMMO_MULT := {Ammo.ROUND: 1.0, Ammo.CHAIN: 0.3, Ammo.GRAPE: 0.4, Ammo.FIRE: 0.75, Ammo.SHELL: 1.5}


## One gun on the rampart.
class Gun:
	var fort: Fort
	var slot := 0
	## The carriage on the rampart (world), and the embrasure's facing.
	var base := Vector3.ZERO
	var yaw0 := 0.0
	var yaw := 0.0
	var pitch := 0.02
	var hp := GUN_HP
	var dead := false
	## Seconds since she was silenced (for smoke and fire).
	var dead_t := 0.0
	var reload := 0.0
	## 1 just fired, easing back to 0 as the crew run her out again.
	var recoil := 0.0
	## Seconds the crew are thinned (grape) or shaken (wraith-fire): slower to reload.
	var shaken := 0.0
	var smoke_t := 0.0
	var target: Ship
	## Elevation wanted for the target (rad), or -1 out of reach.
	var want := -1.0
	var want_yaw := 0.0


## One fort's breakable stonework in one state (whole, wrecked or patched),
## every piece's triangles in one mesh: a piece that's down has its vertices
## folded to a point, and the surface is rebuilt (rarely: a piece at a time).
class Shards:
	var mi: MeshInstance3D
	var _arrays: Array
	var _full: PackedVector3Array
	var _ranges := {}
	var _shown := {}
	var _dirty := false

	static func make(pieces: Array[Dictionary], state: String, mat: Material) -> Shards:
		var k := MeshKit.new()
		var ranges := {}
		for p in pieces:
			var t: TownKit = p[state]
			if t.kit.indices.is_empty():
				continue
			var at := k.vertex_count()
			k.merge(t.kit)
			ranges[p.key] = Vector2i(at, k.vertex_count() - at)
		if ranges.is_empty():
			return null
		var s := Shards.new()
		s._ranges = ranges
		for key: String in ranges:
			s._shown[key] = true
		s._arrays = k.arrays()
		s._full = (s._arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array).duplicate()
		s.mi = MeshInstance3D.new()
		s.mi.material_override = mat
		s._commit()
		return s

	func set_on(key: String, on: bool) -> void:
		if not _ranges.has(key) or _shown.has(key) == on:
			return
		if on:
			_shown[key] = true
		else:
			_shown.erase(key)
		_dirty = true

	func all(on: bool) -> void:
		for key: String in _ranges:
			set_on(key, on)

	func flush() -> void:
		if _dirty:
			_dirty = false
			_commit()

	func _commit() -> void:
		mi.visible = not _shown.is_empty()
		var pos := _full.duplicate()
		for key: String in _ranges:
			if _shown.has(key):
				continue
			var r: Vector2i = _ranges[key]
			for i in range(r.x, r.x + r.y):
				pos[i] = Vector3.ZERO
		_arrays[Mesh.ARRAY_VERTEX] = pos
		var m := ArrayMesh.new()
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, _arrays)
		# (the folded pieces sit at the frame's middle: keep the whole fort's bounds)
		m.custom_aabb = AABB(Vector3(-30.0, -20.0, -30.0), Vector3(60.0, 50.0, 60.0))
		mi.mesh = m


## A block knocked off a face, tumbling down to lie at its foot.
class Falling:
	var slot := 0
	var p := Vector3.ZERO
	var v := Vector3.ZERO
	var rot := Vector3.ZERO
	var spin := Vector3.ZERO
	var s := 1.0
	var wet := false


## A fire on the stonework (world), and how long it burns, then smoulders.
class Blaze:
	var at := Vector3.ZERO
	var t := 0.0
	var flames := 0.0
	var smoke := 0.0
	var size := 1.0
	var acc := 0.0


class Fort:
	var index := 0
	var id := ""
	var name := ""
	var site := {}
	var layout := {}
	var style := {}
	var corners: Array[Dictionary] = []
	var guns: Array[Gun] = []
	var ours := false
	## What its shot is fired by, as far as the cannonballs know (never in the ships list).
	var gunner: Ship
	## Its garrison, a camp ashore (set once the shore has it).
	var garrison: Shore.Camp
	## Its guns are firing (they had a target lately).
	var alert := false
	var quiet := 0.0
	## Gate doors: 0 shut .. 1 swung open.
	var doors := 0.0
	## Your colours: 0 at the foot of the staff .. 1 at the truck, and the beat before they start up.
	var up := 0.0
	var hoist := 0.0
	var node: Node3D
	var door_nodes: Array[Node3D] = []
	var mine: Node3D
	## Its stonework whole, wrecked, and patched with timber.
	var shards := {}
	## Pieces knocked down, and those patched since.
	var down := {}
	var patched := {}
	var tower_hits := PackedInt32Array([0, 0, 0, 0])
	var roof_hits := 0
	var pocks: MultiMesh
	var pock_n := 0
	var debris: MultiMesh
	var debris_n := 0
	var falling: Array[Falling] = []
	var blazes: Array[Blaze] = []
	## Pieces to bring down in a moment (after the last gun goes quiet): [key, t].
	var pending: Array = []
	var barrels: MultiMesh
	var carriages: MultiMesh
	var rubble: MultiMesh
	var tris := 0

	func live_guns() -> int:
		var n := 0
		for g in guns:
			if not g.dead:
				n += 1
		return n


var forts: Array[Fort] = []
var world: World
var _ground: ShoreGround
var _flag_mesh: Mesh
var _flag_mat: Material
var _rubble_tint := Color.WHITE
var _mat: Material


## Builds every fort in `regions` (in the islands' frame: `ground` gives the
## terrain's height), in the towns' material.
func _init(p_world: World, ground: ShoreGround, regions: Array[Region], mat: Material) -> void:
	name = "Forts"
	world = p_world
	_ground = ground
	_mat = mat
	var parts := FortKit.gun_parts()
	var rubble_mesh := FortKit.rubble()
	var pock_mesh := FortKit.pock()
	var block_mesh := FortKit.block_mesh()
	_rubble_tint = Color(0.878, 0.824, 0.698)
	var i := 0
	for r in regions:
		for site: Dictionary in r.forts:
			var f := _build(i, site, ground, mat, parts, rubble_mesh, pock_mesh, block_mesh)
			forts.append(f)
			i += 1
	for f in forts:
		for g in f.guns:
			_pose(g)


func _build(i: int, site: Dictionary, ground: ShoreGround, mat: Material, parts: Dictionary, rubble_mesh: Mesh, pock_mesh: Mesh, block_mesh: Mesh) -> Fort:
	var L := FortKit.build(site, func(x: float, z: float) -> float: return world.ground_height(x, z), 7300 + i * 41)
	var f := Fort.new()
	f.index = i
	f.site = site
	f.layout = L
	f.style = L.style
	f.corners = FortKit.corners(f.style)
	f.name = str(site.name)
	f.id = "fort:" + str(site.island)
	f.tris = int(L.tris)
	var S := f.style
	f.node = Node3D.new()
	f.node.name = "Fort%d" % i
	f.node.position = Vector3(float(site.x), float(site.y), float(site.z))
	f.node.rotation.y = float(site.yaw)
	add_child(f.node)
	var body := MeshInstance3D.new()
	body.mesh = L.mesh
	body.material_override = mat
	f.node.add_child(body)
	for d: Dictionary in L.doors:
		var dn := Node3D.new()
		dn.position = Vector3(float(d.x), 0.0, -float(S.H) + 0.75)
		dn.set_meta("side", float(d.side))
		var dm := MeshInstance3D.new()
		dm.mesh = d.mesh
		dm.material_override = mat
		dn.add_child(dm)
		f.node.add_child(dn)
		f.door_nodes.append(dn)
	# what a battering knocks down, three ways over
	for state: String in ["intact", "broken", "patch"]:
		var sh := Shards.make(L.pieces, state, mat)
		if sh != null:
			f.node.add_child(sh.mi)
			f.tris += (sh.mi.mesh as ArrayMesh).surface_get_array_index_len(0) / 3 if state == "intact" else 0
			if state != "intact":
				sh.all(false)
				sh.flush()
		f.shards[state] = sh
	# its plaza and ramp are floor to walk on, its walls are walls
	var H: float = S.H
	var foot := float(L.ramp_foot_y)
	var rl := float(L.ramp_len)
	var sy := float(site.y)
	ground.lifts.append({"x": float(site.x), "z": float(site.z), "r": H * 1.5 + rl, "at": func(x: float, z: float) -> float:
		var p := FortKit.to_fort(site, x, z)
		if absf(p.x) < H - 0.15 and absf(p.y) < H - 0.15:
			return sy
		if absf(p.x) < FortKit.GATE_W * 0.5 + 0.3 and p.y <= -H + 0.3 and p.y > -H - rl:
			return foot + (sy - foot) * clampf((p.y + H + rl) / rl, 0.0, 1.0)
		return NAN})
	for b: Vector3 in L.blocks:
		ground.add_solid(b.x, b.y, b.z)
	f.mine = Node3D.new()
	f.mine.visible = false
	add_child(f.mine)
	# the guns, their carriages and the heaps where they fell, the scars and fallen blocks: the fort's own small sets
	var n := maxi(1, (L.guns as Array).size())
	f.barrels = _instanced(parts.barrel, n, true)
	f.carriages = _instanced(parts.carriage, n, true)
	f.rubble = _instanced(rubble_mesh, n, true)
	f.rubble.visible_instance_count = 0
	f.pocks = _instanced(pock_mesh, POCKS, false)
	f.pocks.visible_instance_count = 0
	f.debris = _instanced(block_mesh, DEBRIS, true)
	f.debris.visible_instance_count = 0
	var gunner := Ship.new()
	gunner.ship_name = f.name
	gunner.team = Ship.Team.PIRATE
	gunner.pos = f.node.position
	gunner.cls = ShipClass.new()
	gunner.cls.id = "fort"
	gunner.cls.name = "Fort"
	gunner.cls.length = 30.0
	gunner.cls.beam = 30.0
	f.gunner = gunner
	var k := 0
	for gs: Dictionary in L.guns:
		var g := Gun.new()
		g.fort = f
		g.slot = k
		g.base = gs.pos
		g.yaw0 = float(gs.yaw)
		g.yaw = g.yaw0
		g.want_yaw = g.yaw0
		g.reload = 2.0 + k * 1.3
		f.guns.append(g)
		k += 1
	return f


func _instanced(mesh: Mesh, n: int, shadow: bool) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = mesh
	mm.instance_count = n
	for i in n:
		mm.set_instance_transform(i, Transform3D.IDENTITY)
		mm.set_instance_color(i, Color.WHITE)
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.material_override = _mat
	if not shadow:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mm


## Your ship's colours, flown over the forts you hold (her flag's own mesh and material).
func set_colours(mesh: Mesh, mat: Material) -> void:
	_flag_mesh = mesh
	_flag_mat = mat
	for f in forts:
		for c in f.mine.get_children():
			c.queue_free()
		if mesh == null:
			continue
		var m := MeshInstance3D.new()
		m.mesh = mesh
		m.material_override = mat
		var w := maxf(mesh.get_aabb().size.x, 1e-3)
		m.scale = Vector3.ONE * (3.9 / w)
		f.mine.add_child(m)
		_raise(f)


## Who holds what, from the save: yours fly your colours with the gate open; the rest are manned.
func apply(taken: Dictionary) -> void:
	for f in forts:
		var ours := taken.has(f.id)
		f.ours = ours
		f.gunner.team = Ship.Team.PLAYER if ours else Ship.Team.PIRATE
		f.up = 1.0 if ours else 0.0
		f.hoist = 0.0
		f.doors = 1.0 if ours else 0.0
		_doors(f)
		f.alert = false
		for g in f.guns:
			g.dead = false
			g.hp = GUN_HP
			g.dead_t = 0.0
			g.shaken = 0.0
			g.recoil = 0.0
			g.target = null
			g.yaw = g.yaw0
			g.reload = 2.0 + randf() * 3.0
			_pose(g)
		_mend(f)
		if ours:
			_scarred(f)
		if f.garrison != null:
			var c := f.garrison
			c.empty = ours
			if ours:
				c.routed = true
				c.opened = true
				c.alert = false
				c.flag.visible = false
				c.strike = 1.0
		_raise(f)
		_flush(f)


## The fort is yours: her colours are coming down; yours follow them up.
func conquer(f: Fort) -> void:
	f.ours = true
	f.gunner.team = Ship.Team.PLAYER
	f.alert = false
	f.up = 0.0
	# a beat for theirs to come down first
	f.hoist = -2.6
	for g in f.guns:
		g.target = null
	_raise(f)


func _raise(f: Fort) -> void:
	var top: Vector3 = f.layout.flag_top
	f.mine.visible = f.ours and f.mine.get_child_count() > 0
	var e := f.up * f.up * (3.0 - 2.0 * f.up)
	f.mine.position = Vector3(top.x, top.y - (1.0 - e) * float(f.layout.flag_drop), top.z)


func _doors(f: Fort) -> void:
	var k := f.doors * f.doors * (3.0 - 2.0 * f.doors)
	for d in f.door_nodes:
		d.rotation.y = -float(d.get_meta("side")) * k * 1.75


# ------------------------------------------------------------------ per frame

func update(dt: float, player: Ship, focus: Vector3) -> void:
	for f in forts:
		var near := Vector2(float(f.site.x) - focus.x, float(f.site.z) - focus.z).length()
		# colours flying downwind, going up the staff after a conquest
		f.mine.rotation.y = atan2(-world.wind.dir_z, world.wind.dir_x)
		if f.ours and f.up < 1.0:
			f.hoist += dt
			if f.hoist > 0.0:
				f.up = minf(1.0, f.hoist / 3.4)
			_raise(f)
		# the gate swings open for a sally (or for the new owners)
		var open := 1.0 if f.ours or (f.garrison != null and (f.garrison.alert or f.garrison.routed)) else 0.0
		if f.doors != open:
			f.doors += clampf(open - f.doors, -dt * 0.5, dt * 0.7)
			_doors(f)
		# the wreck going on: pieces coming down, blocks tumbling, fires burning
		for i in range(f.pending.size() - 1, -1, -1):
			var q: Array = f.pending[i]
			q[1] = float(q[1]) - dt
			if float(q[1]) > 0.0:
				continue
			f.pending.remove_at(i)
			_knock(f, str(q[0]))
		if not f.falling.is_empty():
			_tumble(f, dt)
		if not f.blazes.is_empty():
			_burn(f, dt, near)
		var dirty := false
		var any := false
		for g in f.guns:
			if g.dead:
				# knocked off her trunnions: she goes over in a moment
				if g.dead_t < 0.7:
					_pose(g)
				g.dead_t += dt
				if near < 700.0:
					_smoke(g, dt)
				continue
			g.reload -= dt * (0.55 if g.shaken > 0.0 else 1.0)
			g.shaken = maxf(0.0, g.shaken - dt)
			if g.recoil > 0.0:
				g.recoil = maxf(0.0, g.recoil - dt * 0.9)
				dirty = true
			if near > 900.0:
				g.target = null
				continue
			_pick(g, f, player)
			if g.target != null:
				any = true
			dirty = _lay(g, dt) or dirty
			if g.target != null and g.want >= 0.0 and g.reload <= 0.0 and absf(MathX.angle_delta(g.yaw, g.want_yaw)) < 0.035:
				_fire(g, f)
		if dirty:
			for g in f.guns:
				if not g.dead:
					_pose(g)
		for k: String in f.shards:
			if f.shards[k] != null:
				(f.shards[k] as Shards).flush()
		if any:
			f.quiet = 0.0
			if not f.alert:
				f.alert = true
				if not f.ours:
					open_fire.emit(f)
		elif f.alert:
			f.quiet += dt
			if f.quiet > 20.0:
				f.alert = false


## The nearest mark within the gun's arc and reach: you or your escorts for theirs, pirates for yours.
func _pick(g: Gun, f: Fort, player: Ship) -> void:
	var best: Ship = null
	var bd := RANGE
	for s: Ship in world.ships:
		if not s.alive or s.removed or s.phantom:
			continue
		if f.ours:
			# (the dead are no business of a garrison's)
			if s.team != Ship.Team.PIRATE or s.ghost or s.prize or s.lashed:
				continue
		elif s.team != Ship.Team.PLAYER:
			continue
		var dx := s.pos.x - g.base.x
		var dz := s.pos.z - g.base.z
		var d := Vector2(dx, dz).length()
		# a little hysteresis: a gun keeps its mark
		var dd := d - (25.0 if s == g.target else 0.0)
		if d > RANGE or dd >= bd:
			continue
		if absf(MathX.angle_delta(g.yaw0, atan2(dx, dz))) > ARC:
			continue
		bd = dd
		best = s
	g.target = best


## Lays the gun on its mark: leads her, finds the elevation, and traverses round. Returns true if it moved.
func _lay(g: Gun, dt: float) -> bool:
	var s := g.target
	var py := g.base.y + FortKit.GUN_PIVOT
	var want_pitch := 0.02
	if s != null:
		var tx := s.pos.x
		var tz := s.pos.z
		var v := SHOT_SPEED
		g.want = -1.0
		for it in 3:
			var d := Vector2(tx - g.base.x, tz - g.base.z).length()
			var h := 1.4 - py
			var v2 := v * v
			var disc := v2 * v2 - GRAVITY * (GRAVITY * d * d + 2.0 * h * v2)
			if disc < 0.0:
				break
			var e := atan((v2 - sqrt(disc)) / (GRAVITY * d))
			var tof := d / (v * cos(e))
			tx = s.pos.x + s.vel.x * tof * 0.9
			tz = s.pos.z + s.vel.z * tof * 0.9
			g.want = e
		g.want_yaw = atan2(tx - g.base.x, tz - g.base.z)
		# the embrasure only lets her swing so far
		g.want_yaw = g.yaw0 + clampf(MathX.angle_delta(g.yaw0, g.want_yaw), -ARC, ARC)
		if g.want >= 0.0:
			want_pitch = g.want
	else:
		g.want_yaw = g.yaw0
	var y0 := g.yaw
	var p0 := g.pitch
	g.yaw += clampf(MathX.angle_delta(g.yaw, g.want_yaw), -TURN * dt, TURN * dt)
	g.pitch += (want_pitch - g.pitch) * MathX.damp(2.5, dt)
	return absf(g.yaw - y0) > 1e-5 or absf(g.pitch - p0) > 1e-5


func _aim(yaw: float, pitch: float) -> Vector3:
	return Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))


func _fire(g: Gun, f: Fort) -> void:
	var d := _aim(g.yaw, g.pitch)
	var pos := g.base + Vector3(0.0, FortKit.GUN_PIVOT, 0.0) + d * 1.9
	# gun crews ashore are steady, but no gun is perfect
	var vel := _aim(g.yaw + (randf() - 0.5) * 0.042, g.pitch + (randf() - 0.5) * 0.02) * SHOT_SPEED * (0.985 + randf() * 0.03)
	world.shots.fire(pos, vel, f.gunner, SHOT_DAMAGE, Ammo.ROUND)
	world.fx.muzzle(pos, Vector3(d.x, 0.0, d.z).normalized(), Vector3.ZERO, Particles.POWDER)
	var h := world.heard(pos)
	if world.sound != null:
		world.sound.cannon(h.x, h.y, h.z, 1.0)
	world.shook.emit(0.1 * h.x)
	g.recoil = 1.0
	g.reload = RELOAD + randf() * 2.4
	# the rest of the battery fires in a ragged ripple behind her, not all at once
	for o in f.guns:
		if o != g and not o.dead and o.reload < 0.6:
			o.reload = 0.6 + randf() * 1.2


## Smoke from a silenced gun: a fire on the rampart for a while, then a long dark smudge.
func _smoke(g: Gun, dt: float) -> void:
	g.smoke_t -= dt
	if g.smoke_t > 0.0:
		return
	g.smoke_t = 0.12 if g.dead_t < 14.0 else (0.45 if g.dead_t < 50.0 else 1.6)
	var p := g.base + Vector3(0.0, 0.5, 0.0)
	# her carriage and the powder by her burn a good while
	if g.dead_t < 14.0:
		world.fx.flame(p, 0.75 * (1.0 - g.dead_t / 14.0) + 0.25)
	var w := world.wind
	world.fx.emit(p + Vector3((randf() - 0.5) * 1.2, 0.6, (randf() - 0.5) * 1.2), Vector3(w.dir_x * 1.4, 2.2 + randf(), w.dir_z * 1.4),
			5.0 + randf() * 3.0, 1.4, 7.0, Color(0.26, 0.24, 0.23, 0.5 if g.dead_t < 40.0 else 0.28), Color(0.55, 0.54, 0.53), 0.0, 0.25, Particles.SMOKE, 0.4, Vector2.ZERO, (randf() - 0.5) * 0.4)


# ------------------------------------------------------------------ the gunnery's marks

## The guns of hostile forts within reach of `p`, as points for her gunnery
## to lay on. A gun stands up on its wall, so each mark is set out past it on
## the water, where a ball fired flat for that range would arc through it.
func marks(p: Ship, reach: float) -> Array[Vector3]:
	var out: Array[Vector3] = []
	if p == null or not p.alive:
		return out
	var v := p.muzzle_speed()
	for f in forts:
		if f.ours or Vector2(float(f.site.x) - p.pos.x, float(f.site.z) - p.pos.z).length() > RANGE + 60.0:
			continue
		for g in f.guns:
			if g.dead:
				continue
			var dx := g.base.x - p.pos.x
			var dz := g.base.z - p.pos.z
			var D := Vector2(dx, dz).length()
			var h := g.base.y + 0.9 - 2.0
			var v2 := v * v
			var disc := v2 * v2 - GRAVITY * (GRAVITY * D * D + 2.0 * h * v2)
			if disc < 0.0 or D < 1.0:
				continue
			var e := atan((v2 - sqrt(disc)) / (GRAVITY * D))
			var flat := v2 * sin(2.0 * e) / GRAVITY
			# too high and far for her guns' elevation: no lock until she closes
			if flat > reach * MARK_REACH or e > 0.46:
				continue
			out.append(Vector3(p.pos.x + dx / D * flat, 0.0, p.pos.z + dz / D * flat))
	return out


# ------------------------------------------------------------------ shot striking the walls

## A cannonball in flight at `p`: true if it struck one of the forts (and is spent).
func strike(p: Vector3, vel: Vector3, damage: float, owner: Ship, kind: int) -> bool:
	for f in forts:
		var R := FortKit.reach(f.style) + 1.0
		if absf(p.x - float(f.site.x)) > R or absf(p.z - float(f.site.z)) > R:
			continue
		if owner == f.gunner:
			continue
		var l := FortKit.to_fort(f.site, p.x, p.z)
		var y := p.y - float(f.site.y)
		var S := f.style
		if y > float(S.WH) + float(S.rise) + float(S.PH) + 4.5:
			continue
		# the guns themselves stand up over the parapet: a ball can find one square on its muzzle
		var gun := false
		for g in f.guns:
			if (g.base + Vector3(0.0, 0.75, 0.0)).distance_squared_to(p) < 1.5 * 1.5:
				gun = true
		if not gun and not FortKit.solid(S, f.corners, l.x, l.y, y, float(f.layout.ms)):
			continue
		_impact(f, p, vel, damage, owner, kind, l.x, l.y, y)
		return true
	return false


func _impact(f: Fort, at: Vector3, vel: Vector3, damage: float, owner: Ship, kind: int, lx: float, lz: float, ly: float) -> void:
	var shell := kind == Ammo.SHELL
	var h := world.heard(at)
	var snd := world.sound
	if shell:
		world.fx.shell_burst(at, false)
		if snd != null:
			snd.shell(h.x, h.y, h.z)
		world.shook.emit(0.4 * h.x * h.x)
	else:
		world.fx.sand_hit(at)
		# chips of masonry kicked off the face
		var chip := Color(0.86, 0.78, 0.62)
		for i in 6:
			var s := 0.09 + randf() * 0.08
			world.fx.emit(at, Vector3(-vel.x * 0.04 + (randf() - 0.5) * 5.0, 2.0 + randf() * 4.0, -vel.z * 0.04 + (randf() - 0.5) * 5.0),
					0.8 + randf() * 0.5, s, 0.06, chip, chip, 12.0, 0.4, Particles.SOFT, 0.01)
		if kind == Ammo.FIRE:
			world.fx.fire_hit(at)
		elif kind == Ammo.WRAITH:
			world.fx.wraith_hit(at, Vector3.ZERO)
		if snd != null and (kind != Ammo.GRAPE or randf() < 0.3):
			snd.thud(h.x, h.y, h.z)
	# the stone takes its scar, and a block or two comes away down the face
	var sf := FortKit.surface(f.style, f.corners, lx, lz, ly)
	var j := int(sf.j)
	var sat: Vector3 = sf.at
	var sn: Vector3 = sf.n
	if kind != Ammo.GRAPE and kind != Ammo.CHAIN:
		_scar(f, sat, sn, 1.15 if shell else 0.55 + randf() * 0.35)
		if sn.y < 0.5:
			var wp := FortKit.to_world(f.site, sat.x, sat.z)
			wp.y = float(f.site.y) + sat.y
			var wn := sn.rotated(Vector3.UP, float(f.site.yaw))
			var n := 2 if shell else (1 if randf() < 0.6 else 0)
			for i in n:
				_drop(f, wp, wn, 0.7 + randf() * 0.6)
	# only your guns (and your escorts') can hurt the Brethren's walls
	if f.ours or owner == null or owner.team != Ship.Team.PLAYER:
		return
	# a corner's top brought down by steady fire; the barracks fired by a shell or a hot shot in the plaza
	var tj := j if j >= 0 else FortKit.corner_at(f.corners, lx, lz, 1.5)
	if tj >= 0 and ly > float(f.corners[tj].top) - 3.0 and kind != Ammo.GRAPE and kind != Ammo.CHAIN:
		f.tower_hits[tj] += 2 if shell else 1
		if f.tower_hits[tj] >= TOWER_HITS:
			_knock(f, "tower%d" % tj)
	var PL := float(f.style.H) - float(f.style.T)
	if maxf(absf(lx), absf(lz)) < PL + 0.5 and ly < 4.0:
		f.roof_hits += 3 if kind == Ammo.FIRE or shell else 1
		if f.roof_hits >= 3:
			_knock(f, "roof")
	var mult: float = AMMO_MULT.get(kind, 1.0)
	var near: Gun = null
	var nd := INF
	for g in f.guns:
		if g.dead:
			continue
		var d := (g.base + Vector3(0.0, 0.6, 0.0)).distance_to(at)
		if d < nd:
			nd = d
			near = g
	if shell:
		# the burst catches every gun crew within its reach
		var R := 7.0
		for g in f.guns:
			if g.dead:
				continue
			var d := (g.base + Vector3(0.0, 0.6, 0.0)).distance_to(at)
			if d > R:
				continue
			_hurt(f, g, damage * mult * (0.45 + 0.55 * (1.0 - d / R)), at, d < 3.2)
		if near != null and nd > R:
			_hurt(f, near, damage * 0.25, at, false)
		return
	if near == null:
		return
	var direct := nd < 3.4
	# a ball on the masonry well away from a gun shakes her crew and cracks the stonework round her
	var k := 1.0 if direct else (0.32 if nd < 12.0 else 0.16)
	if (kind == Ammo.GRAPE or kind == Ammo.WRAITH) and nd < 6.0:
		near.shaken = 10.0
	_hurt(f, near, damage * mult * k, at, direct)


func _hurt(f: Fort, g: Gun, dmg: float, at: Vector3, direct: bool) -> void:
	if g.dead:
		return
	g.hp -= dmg
	struck.emit(f, g, dmg, at, direct)
	# her embrasure caves in round her before she's done
	if g.hp < GUN_HP * PARAPET_HP:
		_knock(f, "gun%d" % g.slot)
	if g.hp > 0.0:
		return
	g.hp = 0.0
	g.dead = true
	g.dead_t = 0.0
	g.target = null
	var p := g.base + Vector3(0.0, 0.8, 0.0)
	world.fx.explosion(p, 0.75)
	var h := world.heard(p)
	if world.sound != null:
		world.sound.explosion(h.x, h.y, h.z)
	world.shook.emit(0.5 * h.x)
	_pose(g)
	_flush(f)
	var last := f.live_guns() == 0
	if last:
		# the last of them: the seaward towers come down, and the fire takes the barracks
		f.pending.append_array([["tower0", 1.0], ["tower1", 2.1], ["roof", 3.4]])
	silenced.emit(f, g, last)


# ------------------------------------------------------------------ the wreck

func _piece(f: Fort, key: String) -> Dictionary:
	for p: Dictionary in f.layout.pieces:
		if p.key == key:
			return p
	return {}


func _show(f: Fort, state: String, key: String, on: bool) -> void:
	var sh: Shards = f.shards.get(state)
	if sh != null:
		sh.set_on(key, on)


## Brings a piece of the fort down (with its dust, falling blocks and fire unless `quiet`).
func _knock(f: Fort, key: String, quiet := false) -> void:
	if f.down.has(key):
		return
	var pc := _piece(f, key)
	if pc.is_empty():
		return
	f.down[key] = true
	_show(f, "intact", key, false)
	_show(f, "broken", key, true)
	if quiet:
		return
	var pat: Vector3 = pc.at
	var at := FortKit.to_world(f.site, pat.x, pat.z)
	at.y = float(f.site.y) + pat.y
	var roof := key == "roof"
	var tower := key.begins_with("tower")
	var big := 1.5 if tower else (1.1 if roof else 1.0)
	# a roar of masonry, a cloud of dust and stone flying
	var h := world.heard(at)
	if world.sound != null:
		world.sound.explosion(h.x * (0.6 if roof else 0.85), h.y, h.z)
		world.sound.thud(h.x, h.y, h.z)
	world.shook.emit(0.35 * big * h.x)
	var cap: Color = f.style.P.cap
	var dust := Color(cap.r * 1.1, cap.g * 1.05, cap.b, 0.6)
	for i in int(9 * big):
		world.fx.emit(at + Vector3((randf() - 0.5) * 2.5 * big, randf() * 1.5, (randf() - 0.5) * 2.5 * big), Vector3((randf() - 0.5) * 3.0, 0.6 + randf() * 2.4, (randf() - 0.5) * 3.0),
				2.4 + randf() * 2.2, 1.4 * big, (5.0 + randf() * 3.0) * big, dust, Color(dust.r * 0.9, dust.g * 0.9, dust.b * 0.9), -0.15, 1.4, Particles.SMOKE, 0.04, Vector2.ZERO, (randf() - 0.5) * 0.6)
	var stone := Color(cap.r * 0.9, cap.g * 0.9, cap.b * 0.85)
	for i in int(16 * big):
		var s := 0.16 + randf() * 0.22
		world.fx.emit(at + Vector3((randf() - 0.5) * 2.0, randf(), (randf() - 0.5) * 2.0), Vector3((randf() - 0.5) * 9.0, 2.0 + randf() * 6.0, (randf() - 0.5) * 9.0),
				1.4 + randf() * 1.2, s, s, stone, stone, 16.0, 0.3, Particles.CHUNK, 0.001, Vector2.ZERO, (randf() - 0.5) * 14.0)
	# a few real blocks go over the side
	var l := FortKit.to_fort(f.site, at.x, at.z)
	var n := Vector3(0.0, 0.0, 1.0)
	if l.length() > 0.5:
		n = Vector3(l.x, 0.0, l.y).normalized().rotated(Vector3.UP, float(f.site.yaw))
	if not roof:
		for i in 4 if tower else 2:
			_drop(f, at, n, 0.8 + randf() * 0.7)
	# and it burns
	var bz := Blaze.new()
	bz.at = at - Vector3(0.0, 0.4 if roof else 0.6, 0.0)
	bz.flames = 46.0 if roof else (12.0 if tower else 6.0)
	bz.smoke = 150.0 if roof else 70.0
	bz.size = 1.25 if roof else 0.9
	f.blazes.append(bz)
	if roof:
		var ra: Array = f.layout.roof_at
		for i in ra.size():
			if i == 1:
				continue
			var r: Vector3 = ra[i]
			var b2 := Blaze.new()
			b2.at = FortKit.to_world(f.site, r.x, r.z)
			b2.at.y = float(f.site.y) + r.y - 0.4
			b2.t = -2.0 - randf() * 4.0
			b2.flames = 40.0
			b2.smoke = 120.0
			b2.size = 1.1
			f.blazes.append(b2)


## A ball's scar on the stone (fort frame point and outward normal).
func _scar(f: Fort, at: Vector3, n: Vector3, size: float) -> void:
	var k := f.pock_n % POCKS
	f.pock_n += 1
	# the scar's +z along the face's outward normal, turned to the world, spun at random
	var d := n.rotated(Vector3.UP, float(f.site.yaw)).normalized()
	var b := MeshKit.aim_z(d) * Basis(Vector3.BACK, randf() * TAU)
	var p := FortKit.to_world(f.site, at.x, at.z)
	p.y = float(f.site.y) + at.y
	f.pocks.set_instance_transform(k, Transform3D(b.scaled_local(Vector3(size, size, 1.0)), p))
	f.pocks.set_instance_color(k, _tint(f.style.P.stone, 0.95 + randf() * 0.1))
	f.pocks.visible_instance_count = mini(POCKS, f.pock_n)


## A linear stone colour as a multiplier on the kit's own (sRGB) paint.
static func _tint(c: Color, k: float) -> Color:
	var s := (c * k).linear_to_srgb()
	return Color(s.r, s.g, s.b, 1.0)


## A block knocked loose at `at` (world) to tumble down the face, thrown out along `n`.
func _drop(f: Fort, at: Vector3, n: Vector3, s: float) -> void:
	if f.falling.size() > 10:
		return
	var out := Vector3(n.x, 0.0, n.z)
	if out.length_squared() < 1e-4:
		out = Vector3(randf() - 0.5, 0.0, randf() - 0.5)
	out = out.normalized()
	var b := Falling.new()
	b.p = at + out * 0.5
	b.v = out * (1.2 + randf() * 2.2) + Vector3((randf() - 0.5) * 1.5, 1.0 + randf() * 2.0, (randf() - 0.5) * 1.5)
	b.slot = f.debris_n % DEBRIS
	f.debris_n += 1
	# a block that was already lying here makes way
	for i in range(f.falling.size() - 1, -1, -1):
		if f.falling[i].slot == b.slot:
			f.falling.remove_at(i)
	b.rot = Vector3(randf() * 3.0, randf() * 3.0, 0.0)
	b.spin = Vector3((randf() - 0.5) * 9.0, (randf() - 0.5) * 6.0, (randf() - 0.5) * 9.0)
	b.s = s
	b.wet = b.p.y < 0.0
	f.falling.append(b)
	f.debris.set_instance_color(b.slot, _tint(f.style.P.stone, 0.72 + randf() * 0.3))
	f.debris.visible_instance_count = mini(DEBRIS, f.debris_n)


func _tumble(f: Fort, dt: float) -> void:
	for i in range(f.falling.size() - 1, -1, -1):
		var b := f.falling[i]
		b.v.y -= 15.0 * dt
		b.p += b.v * dt
		b.rot += b.spin * dt
		# into the sea: a splash, then down slowly to the bottom
		if not b.wet and b.p.y < 0.0 and world.ground_height(b.p.x, b.p.z) < -0.2:
			b.wet = true
			world.fx.splash(Vector3(b.p.x, 0.0, b.p.z), 0.45 * b.s)
			b.v *= 0.25
		var floor_y := maxf(_ground.height(b.p.x, b.p.z), -8.0) + 0.22 * b.s
		var done := false
		if b.p.y <= floor_y:
			b.p.y = floor_y
			if b.v.y < -3.0 and not b.wet:
				# a bounce, with a puff of dust
				b.v = Vector3(b.v.x * 0.5, b.v.y * -0.32, b.v.z * 0.5)
				b.spin *= 0.5
				world.fx.emit(b.p, Vector3(0.0, 0.8, 0.0), 1.2, 0.5, 1.8, Color(0.8, 0.74, 0.62, 0.45), Color(0.8, 0.74, 0.62), 0.0, 2.0, Particles.SMOKE, 0.02)
			else:
				# settled: lay it flat-ish where it stopped
				b.rot.x = roundf(b.rot.x / PI) * PI + (randf() - 0.5) * 0.3
				b.rot.z = roundf(b.rot.z / PI) * PI + (randf() - 0.5) * 0.3
				done = true
		f.debris.set_instance_transform(b.slot, Transform3D(Basis.from_euler(b.rot).scaled_local(Vector3.ONE * b.s), b.p))
		if done:
			f.falling.remove_at(i)


func _burn(f: Fort, dt: float, near: float) -> void:
	for i in range(f.blazes.size() - 1, -1, -1):
		var z := f.blazes[i]
		z.t += dt
		if z.t > z.flames + z.smoke:
			f.blazes.remove_at(i)
			continue
		if z.t < 0.0 or near > 750.0:
			continue
		z.acc += dt
		var flaming := z.t < z.flames
		var rate := 0.09 if flaming else (0.5 if z.t < z.flames + z.smoke * 0.4 else 1.3)
		while z.acc > rate:
			z.acc -= rate
			if flaming:
				var k := minf(1.0, z.t / 2.0) * (1.0 - z.t / z.flames * 0.5)
				world.fx.flame(z.at, z.size * (0.6 + k * 0.6))
			else:
				var w := world.wind
				var a := 0.4 * (1.0 - (z.t - z.flames) / z.smoke) + 0.08
				world.fx.emit(z.at + Vector3((randf() - 0.5) * 1.4, 0.5, (randf() - 0.5) * 1.4), Vector3(w.dir_x * 1.2, 1.8 + randf(), w.dir_z * 1.2),
						5.0 + randf() * 3.0, 1.2 * z.size, 6.5 * z.size, Color(0.24, 0.22, 0.21, a), Color(0.55, 0.54, 0.53), 0.0, 0.25, Particles.SMOKE, 0.4, Vector2.ZERO, (randf() - 0.5) * 0.4)


## Every piece whole again, the scars and fallen blocks gone (a fresh voyage).
func _mend(f: Fort) -> void:
	f.down.clear()
	f.patched.clear()
	for k: String in f.shards:
		var sh: Shards = f.shards[k]
		if sh != null:
			sh.all(k == "intact")
			sh.flush()
	f.tower_hits = PackedInt32Array([0, 0, 0, 0])
	f.roof_hits = 0
	f.pock_n = 0
	f.debris_n = 0
	f.pocks.visible_instance_count = 0
	f.debris.visible_instance_count = 0
	f.falling.clear()
	f.blazes.clear()
	f.pending.clear()


## A fort that's yours, as you left it: its guns remounted behind gabions and
## plank mantlets where the parapet came down, the seaward towers still
## broken, its face pocked where your shot went home.
func _scarred(f: Fort) -> void:
	for p: Dictionary in f.layout.pieces:
		var key := str(p.key)
		if key == "roof":
			continue
		if key.begins_with("gun") or key == "tower0" or key == "tower1":
			_knock(f, key, true)
		if key.begins_with("gun"):
			_show(f, "patch", key, true)
			f.patched[key] = true
	var rnd := Mulberry32.new(f.index * 131 + 7)
	var S := f.style
	var H: float = S.H
	for i in 16:
		# most on the sea wall, the rest on the flanks toward the sea
		var side := 0 if rnd.next() < 0.6 else (1 if rnd.next() < 0.5 else 3)
		var u := (rnd.next() - 0.5) * 2.0 * (H - 3.0)
		var y := float(S.WH) * (0.2 + rnd.next() * 0.75)
		var v := H - 0.3
		var x := u if side == 0 else (v if side == 1 else -v)
		var z := v if side == 0 else rnd.next() * H * 0.8
		var sf := FortKit.surface(S, f.corners, x, z, y)
		_scar(f, sf.at, sf.n, 0.55 + rnd.next() * 0.45)
	for k: String in f.shards:
		if f.shards[k] != null:
			(f.shards[k] as Shards).flush()


# ------------------------------------------------------------------ drawing the guns

func _pose(g: Gun) -> void:
	var f := g.fort
	var i := g.slot
	var pivot := g.base + Vector3(0.0, FortKit.GUN_PIVOT, 0.0)
	if g.dead:
		# the barrel knocked off her trunnions and lying across the wrecked carriage: over she goes, with a bounce
		var t := clampf(g.dead_t / 0.55, 0.0, 1.0)
		var k := pow(t / 0.75, 2.0) if t < 0.75 else 1.0 - sin((t - 0.75) / 0.25 * PI) * 0.12
		var q0 := Basis.from_euler(Vector3(-g.pitch, g.yaw, 0.0)).get_rotation_quaternion()
		var q1 := Basis.from_euler(Vector3(-0.3, g.yaw + 0.6, 0.45)).get_rotation_quaternion()
		f.barrels.set_instance_transform(i, Transform3D(Basis(q0.slerp(q1, k)), Vector3(pivot.x, g.base.y + FortKit.GUN_PIVOT + (0.32 - FortKit.GUN_PIVOT) * k, pivot.z)))
		f.barrels.set_instance_color(i, Color(1.0 - 0.58 * t, 1.0 - 0.62 * t, 1.0 - 0.66 * t))
		var c0 := Basis(Vector3.UP, g.yaw).get_rotation_quaternion()
		var c1 := Basis.from_euler(Vector3(0.1, g.yaw - 0.3, 0.38)).get_rotation_quaternion()
		f.carriages.set_instance_transform(i, Transform3D(Basis(c0.slerp(c1, k)), Vector3(pivot.x, g.base.y + FortKit.GUN_PIVOT + (-0.1 - FortKit.GUN_PIVOT) * k, pivot.z)))
		f.carriages.set_instance_color(i, Color(1.0 - 0.7 * t, 1.0 - 0.73 * t, 1.0 - 0.75 * t))
		f.rubble.set_instance_transform(i, Transform3D(Basis(Vector3.UP, g.yaw0).scaled_local(Vector3.ONE * maxf(1e-4, k)), g.base))
		# its masonry is the fort's own stone
		var cap: Color = (f.style.P.cap as Color).linear_to_srgb()
		var rt := _rubble_tint
		f.rubble.set_instance_color(i, Color(minf(cap.r / rt.r, 1.0), minf(cap.g / rt.g, 1.0), minf(cap.b / rt.b, 1.0)))
		return
	var back := sin(minf(1.0, g.recoil) * PI * 0.5) * 0.45 if g.recoil > 0.0 else 0.0
	var d := Vector3(sin(g.yaw), 0.0, cos(g.yaw))
	f.barrels.set_instance_transform(i, Transform3D(Basis(Vector3.UP, g.yaw) * Basis(Vector3.RIGHT, -g.pitch), pivot - d * back))
	f.barrels.set_instance_color(i, Color.WHITE)
	f.carriages.set_instance_transform(i, Transform3D(Basis(Vector3.UP, g.yaw), pivot - d * back * 0.8))
	f.carriages.set_instance_color(i, Color.WHITE)


func _flush(f: Fort) -> void:
	# a rubble heap stands only where a gun is down
	var heaps := 0
	for g in f.guns:
		if g.dead:
			heaps = maxi(heaps, g.slot + 1)
	f.rubble.visible_instance_count = heaps
	for g in f.guns:
		if not g.dead and g.slot < heaps:
			f.rubble.set_instance_transform(g.slot, Transform3D(Basis.from_scale(Vector3.ONE * 1e-4), g.base))


# ------------------------------------------------------------------ questions the game asks

## Guns still firing.
func live_count(f: Fort) -> int:
	return f.live_guns()


func by_gunner(s: Ship) -> Fort:
	if s == null:
		return null
	for f in forts:
		if f.gunner == s:
			return f
	return null


## The hostile fort whose live guns reach (x, z), if any.
func covering(x: float, z: float) -> Fort:
	for f in forts:
		if f.ours:
			continue
		for g in f.guns:
			if not g.dead and Vector2(g.base.x - x, g.base.z - z).length() < RANGE - 20.0:
				return f
	return null


## The fort nearest (x, z) within `r`.
func nearest(x: float, z: float, r := SHOW_RANGE) -> Fort:
	var best: Fort = null
	var bd := r
	for f in forts:
		var d := Vector2(float(f.site.x) - x, float(f.site.z) - z).length()
		if d < bd:
			bd = d
			best = f
	return best


## A fort of yours near enough to patch her up.
func haven_near(x: float, z: float, r := HAVEN_R) -> Fort:
	for f in forts:
		if f.ours and f.up >= 1.0 and Vector2(float(f.site.x) - x, float(f.site.z) - z).length() < r:
			return f
	return null


func collect_range(f: Fort, x: float, z: float) -> bool:
	return f.ours and Vector2(float(f.site.x) - x, float(f.site.z) - z).length() < COLLECT_R


## A hostile fort that's firing on you right now, for the camera to keep in frame.
func engaging(x: float, z: float) -> Fort:
	for f in forts:
		if f.ours or not f.alert or Vector2(float(f.site.x) - x, float(f.site.z) - z).length() >= RANGE + 40.0:
			continue
		for g in f.guns:
			if g.target != null:
				return f
	return null


## The island a fort stands on, by name.
func on_isle(isle: String) -> Fort:
	for f in forts:
		if str(f.site.island) == isle:
			return f
	return null


## Where the fort's gate is (world), to steer a landing party by.
func gate(f: Fort) -> Vector3:
	return FortKit.to_world(f.site, 0.0, -float(f.style.H) - 2.0)


func triangles() -> int:
	var n := 0
	for f in forts:
		n += f.tris
	return n

