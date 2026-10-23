class_name ShipDamage
extends RefCounted
## What the guns do to a ship, and how she goes down (the web game's
## ShipDamage). Every breach a ball tears is remembered and drawn on her
## timbers: a jagged hole ringed with raw splinters, soot and cooling embers,
## splintered planks bristling from it, until her crew boards it over with
## fresh planks as she mends; scorch spreads over her hull and her canvas
## tears to rags as the fight goes on. She floods and settles lower as her
## hull fails, lists toward her holes (the low ones most), and smoke curls
## out of them once she is badly hurt.
##
## Her rig takes a beating too: a ball through a mast, or a battering that
## leaves her badly hurt, snaps it (or the bowsprit, at the bows), and it
## topples over the side with all it carries and floats off as wreckage
## (Debris). Lost masts cost her speed. Once her hull is sound again her
## crew re-rigs her, hauling each spar back up out of its stump.
##
## Her first wound gives her her own copies of the damage variants of the
## ship shaders (ship_*_dmg.gdshader), which draw all this from the data
## kept here; a ship never hit draws with the cheap shared ones.
##
## When she goes she either breaks her back, the two halves of her hull
## sinking apart round the break, or capsizes onto her beam ends, lurching;
## her masts come down either way, her lanterns go out, cargo and timber
## spill out, and she lingers smouldering before the sea takes her. Your own
## ship founders by the stern within moments and comes to rest on the
## bottom, so the farewell can follow her down.

## Seconds a wreck takes to slip under once her time afloat is up.
const WRECK_FINAL := 13.0
const MAX_HOLES := 16
const SHARDS_PER_HOLE := 5
## A shard slot left empty.
const NO_SHARD := Transform3D(Basis(Vector3.ZERO, Vector3.ZERO, Vector3.ZERO), Vector3.ZERO)
## The hoist of one spar as the crew re-rigs her (s), and the stagger between spars.
const RAISE_T := 1.9
const RAISE_GAP := 0.6
const DMG_SHADERS := {
	"hull": preload("res://shaders/ship_hull_dmg.gdshader"),
	"stern": preload("res://shaders/ship_stern_dmg.gdshader"),
	"deck": preload("res://shaders/ship_deck_dmg.gdshader"),
	"parts": preload("res://shaders/ship_parts_dmg.gdshader"),
	"rope": preload("res://shaders/ship_rope_dmg.gdshader"),
	"sail": preload("res://shaders/ship_sail_dmg.gdshader"),
	"flag": preload("res://shaders/ship_flag_dmg.gdshader"),
}
## Her meshes, and the kind of material each draws with.
const SKINNED := {"Hull": "hull", "Transom": "stern", "Deck": "deck", "Parts": "parts", "Small": "parts", "Fine": "parts", "Rigging": "rope"}
## The materials that draw her breaches.
const HOLED: Array[String] = ["hull", "stern", "deck", "parts"]
enum Mode { CAPSIZE, SPLIT }

static var _noise: Texture2D
static var _shard_mesh: ArrayMesh

var ship: Ship
## How far the flooding hull has settled (m), and her list (rad, + lifts the port side).
var lowered := 0.0
var list := 0.0
## The breaches, in her own frame: {c (on the skin), side (+1 port), r (m),
## patched, order, seed, birth (the sea's clock when torn)}.
var holes: Array[Dictionary] = []
## When a founder came to rest on the seabed (-1 not yet).
var rest_t := -1.0
## How she goes when she goes (a Mode), or -1 for the sea to decide.
var wreck_mode := -1

# the wreck's pose this frame (see wreck_pose)
var pose_y := 0.0
var pose_pitch := 0.0
var pose_roll := 0.0
## 1 still riding the swell .. 0 gone under.
var afloat := 1.0
var done := false

var _order := 0
var _smoke_t := 0.0
var _seed := randf() * 10.0
var _mast_hp := PackedFloat32Array()
## The rig's two moments in a fight: a mast sprung at half her hull, another at a quarter.
var _events := 0
var _sail_hits := 0.0
var _since_hit := 0.0
var _wear := 0.0
var _canvas := 0.0
## Spars shot away (bit group - 1), as the shaders drop them.
var _gone := 0
var _sent_state := Vector4(-1.0, -1.0, -1.0, -1.0)
## Her own damage materials by kind, from her first wound; the bow half's once she breaks in two.
var _skin := {}
var _bow_skin := {}
var _shards: MultiMeshInstance3D
## The breaches with shards (a bit per slot), and every shard's place and paint, as set.
var _shard_slots := 0
var _shard_xf: Array[Transform3D] = []
var _shard_col := PackedColorArray()
## Spars toppling on their hinges: {node, spar, axis, angle, vel, delay, max, gravity, started}.
var _hinges: Array[Dictionary] = []
## Spars going back up: {spar, node, t, dust, landed}.
var _raising: Array[Dictionary] = []
## The rig left aboard, hidden while its copy goes over the side (shown again once she's re-rigged).
var _hidden: Array[Node3D] = []

# the wreck
var _mode := Mode.CAPSIZE
var _roll := 0.0
var _pitch := 0.0
var _depth := 0.0
var _fall := 0.0
var _fall_v := 0.0
var _split_z := 0.0
## Seconds till her back breaks (-1 not coming).
var _split_in := -1.0
var _bow: Node3D
var _stern_a := 0.0
var _bow_a := 0.0
var _stern_r := 0.0
var _bow_r := 0.0
var _sep := 0.0
var _pivot_y := 0.0
var _burn := 1.0


func _init(p_ship: Ship) -> void:
	ship = p_ship
	_mast_hp.resize(p_ship.cls.masts.size())
	_mast_hp.fill(1.0)


## Her own frame (the stern half's, once she's broken in two) in the world.
func _frame() -> Transform3D:
	return ship.transform * ship.model.transform


func _bow_frame() -> Transform3D:
	return ship.transform * _bow.transform


# ------------------------------------------------------------------ the skin

## Her first wound: her own copies of the damage materials, drawn from the shared ones.
func _ensure_skin() -> void:
	if not _skin.is_empty():
		return
	var model := ship.model
	if _noise == null:
		_noise = load("res://art/noise.png")
	for kind: String in DMG_SHADERS:
		var base := model.shared_material(kind)
		var m := ShaderMaterial.new()
		m.shader = DMG_SHADERS[kind]
		for u: Dictionary in base.shader.get_shader_uniform_list():
			var v: Variant = base.get_shader_parameter(u.name)
			if v != null:
				m.set_shader_parameter(u.name, v)
		m.set_shader_parameter("dmg_noise", _noise)
		_skin[kind] = m
	for part: String in SKINNED:
		var mi := model.get_node_or_null(part) as MeshInstance3D
		if mi != null:
			mi.material_override = _skin[SKINNED[part]]
	for sd in model.sails:
		(sd.node as MeshInstance3D).material_override = _skin["sail"]
	for f in model.flags:
		f.material_override = _skin["flag"]
	_sync_holes()
	_sync_state()
	_sync_gone()


func _materials() -> Array:
	return _skin.values() + _bow_skin.values()


func _sync_holes() -> void:
	if _skin.is_empty():
		return
	var shape := ship.model.shape
	var hv := PackedVector4Array()
	var iv := PackedVector4Array()
	hv.resize(MAX_HOLES)
	iv.resize(MAX_HOLES)
	for i in holes.size():
		var h := holes[i]
		var c: Vector3 = h.c
		var r: float = h.r
		hv[i] = Vector4(c.x, c.y, c.z, -r if h.patched else r)
		# breaches only open up above the hold's floor; lower ones read as dark, flooded holes
		iv[i] = Vector4(float(h.side), shape.main_deck_y(shape.t_at(c.z)) - 0.18, float(h.seed), float(h.birth))
	for kind in HOLED:
		for skin: Dictionary in [_skin, _bow_skin]:
			var m: ShaderMaterial = skin.get(kind)
			if m != null:
				m.set_shader_parameter("dmg_holes", hv)
				m.set_shader_parameter("dmg_info", iv)
				m.set_shader_parameter("dmg_count", holes.size())


## Wear, fire and torn canvas, when they have changed enough to show.
func _sync_state() -> void:
	if _skin.is_empty():
		return
	var st := Vector4(_wear, ship.burning, _seed, _canvas)
	var d := (st - _sent_state).abs()
	if maxf(maxf(d.x, d.y), maxf(d.z, d.w)) < 0.004:
		return
	_sent_state = st
	for m: ShaderMaterial in _materials():
		m.set_shader_parameter("dmg_state", st)


func _sync_gone() -> void:
	for skin: Dictionary in [_skin, _bow_skin]:
		for kind: String in ["parts", "rope"]:
			var m: ShaderMaterial = skin.get(kind)
			if m != null:
				m.set_shader_parameter("dmg_gone", _gone)


# ------------------------------------------------------------------ holes

func _add_hole(c: Vector3, side: int, r: float) -> void:
	var now := fmod(ship.world.time, 4096.0)
	# a ball landing in an existing breach tears it wider
	for i in holes.size():
		var h := holes[i]
		if not h.patched and int(h.side) == side and (h.c as Vector3).distance_to(c) < float(h.r) * 0.75:
			h.r = minf(float(h.r) * 1.22, 1.35)
			h.birth = now
			_sync_holes()
			_place_shards(i, h)
			return
	var hole := {"c": c, "side": side, "r": r, "patched": false, "order": _order, "seed": randf() * 7.0, "birth": now}
	_order += 1
	var slot := holes.size()
	if slot < MAX_HOLES:
		holes.append(hole)
	else:
		# full: the oldest patch gives way, else the oldest breach
		var best_score := INF
		for i in holes.size():
			var score := float(holes[i].order) - (1e6 if holes[i].patched else 0.0)
			if score < best_score:
				best_score = score
				slot = i
		holes[slot] = hole
	_sync_holes()
	_place_shards(slot, hole)


## A board snapped off short, narrowing to a splinter (1 m along +x).
static func _shard() -> ArrayMesh:
	if _shard_mesh == null:
		var rings: Array[PackedVector3Array] = []
		for x: float in [0.0, 0.5, 1.0]:
			var w := 0.075 * (0.25 if x > 0.7 else 1.0)
			rings.append(PackedVector3Array([Vector3(x, 0.025, w), Vector3(x, 0.025, -w), Vector3(x, -0.025, -w), Vector3(x, -0.025, w)]))
		_shard_mesh = Debris.prism(rings).commit()
	return _shard_mesh


## One of everything a ship's wounds draw with (her damage materials on her
## own meshes, the splinters at her breaches), for the game to draw once,
## too small to see, before the first shot: building those shaders in the
## middle of a fight would stutter it.
static func warm_meshes(model: ShipModel) -> Array[Node3D]:
	var out: Array[Node3D] = []
	var mats := {}
	for kind: String in DMG_SHADERS:
		var m := ShaderMaterial.new()
		m.shader = DMG_SHADERS[kind]
		mats[kind] = m
	var meshes: Array = []
	for part: String in SKINNED:
		var mi := model.get_node_or_null(part) as MeshInstance3D
		if mi != null:
			meshes.append([mi.mesh, mats[SKINNED[part]]])
	if not model.sails.is_empty():
		meshes.append([(model.sails[0].node as MeshInstance3D).mesh, mats["sail"]])
	if not model.flags.is_empty():
		meshes.append([model.flags[0].mesh, mats["flag"]])
	for pair: Array in meshes:
		var mi := MeshInstance3D.new()
		mi.mesh = pair[0]
		mi.material_override = pair[1]
		out.append(mi)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = _shard()
	mm.instance_count = 1
	var shards := MultiMeshInstance3D.new()
	shards.multimesh = mm
	shards.material_override = model.shared_material("parts")
	out.append(shards)
	return out


## Splintered planks bristling from breach `slot` (none once it's patched).
func _place_shards(slot: int, h: Dictionary) -> void:
	if _shards == null:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = _shard()
		mm.instance_count = MAX_HOLES * SHARDS_PER_HOLE
		mm.visible_instance_count = 0
		_shard_xf.resize(mm.instance_count)
		_shard_xf.fill(NO_SHARD)
		_shard_col.resize(mm.instance_count)
		_shards = MultiMeshInstance3D.new()
		_shards.name = "Shards"
		_shards.multimesh = mm
		_shards.material_override = ship.model.shared_material("parts")
		ship.model.add_child(_shards)
	var mm := _shards.multimesh
	var base := slot * SHARDS_PER_HOLE
	if h.patched:
		for k in SHARDS_PER_HOLE:
			mm.set_instance_transform(base + k, NO_SHARD)
			_shard_xf[base + k] = NO_SHARD
		_shard_slots &= ~(1 << slot)
	else:
		var liv := ship.livery
		var painted: Array[Color] = [liv.hull, liv.strake, liv.wale]
		var side := float(h.side)
		var c: Vector3 = h.c
		var r: float = h.r
		for k in SHARDS_PER_HOLE:
			var a := float(k) / SHARDS_PER_HOLE * TAU + randf_range(-0.4, 0.4)
			var rr := r * randf_range(0.42, 0.62)
			var pos := c + Vector3(-side * 0.04, sin(a) * rr, cos(a) * rr)
			# planks run fore and aft: the shards point along the strakes, bent out of the hull
			var along := 1.0 if cos(a) >= 0.0 else -1.0
			var dir := Vector3(side * randf_range(0.35, 1.1), randf_range(-0.35, 0.35) + sin(a) * 0.3, -along * randf_range(0.5, 1.0)).normalized()
			var q := Quaternion(Vector3.RIGHT, dir) * Quaternion(Vector3.RIGHT, randf() * PI)
			var size := Vector3(r * randf_range(0.6, 1.25), randf_range(1.1, 1.8), randf_range(1.0, 1.7))
			var xf := Transform3D(Basis(q) * Basis.from_scale(size), pos)
			var col := MeshKit.shade(painted[randi() % painted.size()] if randf() < 0.45 else _raw_wood(), randf_range(0.85, 1.1))
			mm.set_instance_transform(base + k, xf)
			mm.set_instance_color(base + k, col)
			_shard_xf[base + k] = xf
			_shard_col[base + k] = col
		_shard_slots |= 1 << slot
	# draw only up to the last splintered breach
	var top := 0
	var bits := _shard_slots
	while bits != 0:
		top += 1
		bits >>= 1
	mm.visible_instance_count = top * SHARDS_PER_HOLE
	_shards.visible = _shard_slots != 0


## Fresh-split timber (sRGB).
static func _raw_wood() -> Color:
	return Color(0.72, 0.55, 0.36).linear_to_srgb()


# ------------------------------------------------------------------ hits

## A ball (or a reef, or another hull) struck her: `at` is the world point,
## or null for a blow anywhere along her side.
func on_hit(at: Variant, dmg: float) -> void:
	var s := ship
	var shape := s.model.shape
	var L := s.cls.length
	_since_hit = 0.0
	_ensure_skin()
	var frame := _frame()
	var local: Vector3
	if at is Vector3:
		local = frame.affine_inverse() * (at as Vector3)
	else:
		local = Vector3(randf_range(-1.0, 1.0), randf(), randf_range(-0.35, 0.35) * L)
	var t := clampf(local.z / L + 0.5, 0.04, 0.96)
	var side := 1 if local.x >= 0.0 else -1
	var y := clampf(local.y, -0.7, shape.top(t) - 0.2)
	var c := Vector3(side * shape.half_width_at_y(t, y), y, shape.z(t))
	var r := randf_range(0.6, 0.9) * clampf(dmg / 20.0, 0.85, 1.3) * (0.8 + L / 100.0)
	_add_hole(c, side, r)

	# planks blasted out into the sea
	if s.world.debris != null:
		var out := (frame.basis * Vector3(side, 0.15, 0.0)).normalized()
		var liv := s.livery
		s.world.debris.splinters(frame * c, out, s.vel, [liv.hull, liv.strake, _raw_wood()] as Array[Color], 2 + randi() % 3)

	# the rig takes a beating too
	var f := s.hp / s.max_hp
	var spars := s.model.spars
	var masts := s.cls.masts
	for i in masts.size():
		if not spars[i].broken and absf(c.z - spars[i].pivot.z) < 2.6:
			_mast_hp[i] -= 0.05 + 0.14 * (1.0 - f)
	var weak := _weakest_mast()
	if weak >= 0 and _events == 0 and f < 0.55 and masts.size() > 1:
		_events = 1
		_mast_hp[weak] -= 0.75
	weak = _weakest_mast()
	if weak >= 0 and _events <= 1 and f < 0.28:
		_events = 2
		_mast_hp[weak] -= 0.85
	var fall := Vector3(-side, 0.0, randf_range(-0.3, 0.3)).normalized()
	for i in masts.size():
		if not spars[i].broken and _mast_hp[i] <= 0.0:
			_break_mast(i, fall, 0.0)
	if not spars[masts.size()].broken and ((t > 0.84 and f < 0.6 and randf() < 0.5) or (f < 0.22 and randf() < 0.22)):
		_break_bowsprit(0.0)


func _weakest_mast() -> int:
	var best := -1
	for i in _mast_hp.size():
		if not ship.model.spars[i].broken and (best < 0 or _mast_hp[i] < _mast_hp[best]):
			best = i
	return best


## The mast still standing nearest a point `local_z` along her keel (her
## own frame), or -1 with none left.
func nearest_mast(local_z: float) -> int:
	var best := -1
	var bd := INF
	for i in ship.cls.masts.size():
		var sp := ship.model.spars[i]
		if sp.broken:
			continue
		var d := absf(sp.pivot.z - local_z)
		if d < bd:
			bd = d
			best = i
	return best


## Is a ball above her hull (her own frame) passing through a mast (x = 2)
## or the canvas round one (x = 1)? y: which mast.
func rig_test(local: Vector3) -> Vector2i:
	var B := ship.cls.beam
	var spars := ship.model.spars
	var shape := ship.model.shape
	for i in ship.cls.masts.size():
		var sp := spars[i]
		var m: Dictionary = ship.cls.masts[i]
		var y0 := shape.deck_y(m.t)
		if sp.broken or local.y < y0 + 0.6 or local.y > y0 + float(m.height):
			continue
		var dz := local.z - sp.pivot.z
		if Vector2(local.x, dz).length() < 0.55:
			return Vector2i(2, i)
		if absf(dz) < 1.1 and absf(local.x) < B * 0.8 and local.y > y0 + 2.0:
			return Vector2i(1, i)
	return Vector2i(0, -1)


## A ball tore through canvas (kind 1) or smashed into mast `mast` (kind 2), at world point `at`.
func on_rig_hit(kind: int, mast: int, at: Vector3, ball_vel: Vector3) -> void:
	var fx := ship.world.fx
	_since_hit = 0.0
	if kind == 1:
		_ensure_skin()
		_sail_hits += 1.0
		var cloth := ship.livery.sail.srgb_to_linear()
		for i in 6:
			fx.emit(at, Vector3(ball_vel.x * 0.05 + randf_range(-2.0, 2.0), randf_range(-1.0, 2.0), ball_vel.z * 0.05 + randf_range(-2.0, 2.0)),
					randf_range(0.8, 1.6), randf_range(0.12, 0.3), 0.1, cloth, cloth, 4.0, 2.0, Particles.CHUNK, 0.001, Vector2.ZERO, randf_range(-10.0, 10.0))
		fx.emit(at, Vector3(ball_vel.x * 0.04, 0.0, ball_vel.z * 0.04), 1.2, 0.8, 2.6, Color(cloth.r, cloth.g, cloth.b, 0.35), cloth, 0.0, 2.0, Particles.SMOKE)
		return
	_mast_hp[mast] -= 0.36
	fx.wood_hit(at, Vector3(ball_vel.x, 0.0, ball_vel.z).normalized())
	if _mast_hp[mast] <= 0.0:
		var lv := _frame().basis.inverse() * ball_vel
		var fall := Vector3(lv.x, 0.0, lv.z * 0.3)
		if fall.length_squared() < 1e-4:
			fall = Vector3.RIGHT
		_break_mast(mast, fall.normalized(), 0.0)


## Snaps mast i (the bowsprit, past her last mast) after `delay` s, to fall
## over either side: a set piece's.
func dismast(i: int, delay: float = 0.0) -> void:
	if i >= ship.cls.masts.size():
		_break_bowsprit(delay)
	else:
		_break_mast(i, Vector3(1.0 if randf() < 0.5 else -1.0, 0.0, randf_range(-0.3, 0.3)), delay)


## Lost spars cost her way: each mast gone takes a share of her canvas.
func speed_factor() -> float:
	var n := ship.cls.masts.size()
	var lost := 0
	for i in n:
		if ship.model.spars[i].broken:
			lost += 1
	return 1.0 - 0.28 * float(lost) / maxf(1.0, n)


# ------------------------------------------------------------------ snapping

func _break_mast(i: int, fall: Vector3, delay: float) -> void:
	var sp := ship.model.spars[i]
	if sp.broken or (not _raising.is_empty() and ship.alive):
		return
	_mast_hp[i] = 0.0
	var dir := Vector3(fall.x, 0.0, fall.z)
	if dir.length_squared() < 1e-4:
		dir = Vector3(1.0 if randf() < 0.5 else -1.0, 0.0, 0.0)
	dir = dir.normalized()
	# a ship heeling over drops her masts to leeward
	if absf(list) > 0.05:
		dir.x = dir.x * 0.5 - signf(list) * 0.5
	dir.z = clampf(dir.z, -0.35, 0.35)
	_snap(sp, Vector3.UP.cross(dir.normalized()).normalized(), randf_range(1.15, 1.35), delay)


func _break_bowsprit(delay: float) -> void:
	var sp := ship.model.spars[ship.model.spars.size() - 1]
	if sp.broken or (not _raising.is_empty() and ship.alive):
		return
	_snap(sp, Vector3.RIGHT, 0.95, delay)


## Snaps spar `sp` off where it breaks: its part of the merged meshes drops
## out (the shaders fold it away), and its piece, with copies of all it
## carries, hangs on a hinge at the break that topples about `axis` (after
## `delay` s), up to `max_angle`, then falls free into the sea.
func _snap(sp: ShipModel.Spar, axis: Vector3, max_angle: float, delay: float) -> void:
	_ensure_skin()
	var model := ship.model
	sp.broken = true
	sp.axis = axis
	sp.lean = minf(max_angle * 0.62, 0.8)
	var hinge := Node3D.new()
	hinge.name = "Snapped"
	hinge.position = sp.pivot
	hinge.add_child(_whole(sp))
	for n in sp.nodes:
		n.visible = false
		_hidden.append(n)
	# jagged splinters on the stump and on the broken end
	var orient := Basis(Quaternion(Vector3.UP, sp.long))
	var stump := _splinters(sp.radius, 1.0)
	stump.transform = Transform3D(orient, sp.centre)
	model.add_child(stump)
	sp.stump = stump
	var end := _splinters(sp.radius, -1.0)
	end.transform = Transform3D(orient, sp.centre - sp.pivot)
	hinge.add_child(end)
	model.add_child(hinge)
	_gone |= 1 << (sp.group - 1)
	_sync_gone()
	_hinges.append({"node": hinge, "spar": sp, "axis": axis, "angle": 0.0, "vel": randf_range(0.12, 0.3), "delay": delay,
			"max": max_angle, "gravity": 1.5 * 9.8 / maxf(4.0, sp.length), "started": false, "canvas": _canvas_normal(sp)})
	if delay <= 0.0:
		_crack(hinge)


## Which way the canvas on spar sp faces as it stood (her frame): a mast's
## sails as they were braced, the jib on the bowsprit.
func _canvas_normal(sp: ShipModel.Spar) -> Vector3:
	if sp.bowsprit:
		return Vector3.RIGHT
	var rig: String = ship.cls.masts[sp.group - 1].rig
	return sp.nodes[0].basis.z if rig == "square" else sp.nodes[0].basis.x


## The spar as it stood, whole, with copies of all it carries (in its
## hinge's frame: the break at the origin).
func _whole(sp: ShipModel.Spar) -> Node3D:
	var frame := Node3D.new()
	frame.position = -sp.pivot
	var piece := MeshInstance3D.new()
	piece.name = "Piece"
	piece.mesh = sp.piece
	piece.material_override = ship.model.shared_material("parts")
	frame.add_child(piece)
	for n in sp.nodes:
		var copy := n.duplicate() as Node3D
		copy.visible = true
		frame.add_child(copy)
	return frame


## The splintered end of a broken spar of radius r: a ring of jagged spikes
## round a heartwood disc, pointing up its axis (dir 1) or back down it (-1).
func _splinters(r: float, dir: float) -> MeshInstance3D:
	var kit := MeshKit.new(randi())
	var rr := clampf(r, 0.08, 0.6)
	for i in 7:
		var a := float(i) / 7.0 * TAU + randf() * 0.5
		var h := randf_range(0.15, 0.7) * maxf(1.0, rr * 3.0)
		var w := rr * randf_range(0.55, 0.95) * 0.55
		var xf := Transform3D(Basis(Vector3.BACK, randf_range(-0.25, 0.25)), Vector3(cos(a) * rr * 0.45, 0.0, sin(a) * rr * 0.45)) * Transform3D(Basis.IDENTITY, Vector3(0.0, h * 0.5 - 0.02, 0.0))
		if dir < 0.0:
			xf = Transform3D(Basis(Vector3.RIGHT, PI), Vector3.ZERO) * xf
		kit.paint(Color(0.78, 0.6, 0.4).linear_to_srgb(), MeshKit.WOOD, 0.15)
		kit.cone(xf, w, h, 3)
	kit.paint(Color(0.78, 0.6, 0.4).linear_to_srgb(), MeshKit.WOOD, 0.1)
	kit.spar(Vector3(0.0, -0.025, 0.0), Vector3(0.0, 0.025, 0.0), rr * 0.95, rr * 0.95, 8)
	var mi := MeshInstance3D.new()
	mi.name = "Splinters"
	mi.mesh = kit.commit()
	mi.material_override = ship.model.shared_material("parts")
	return mi


func _crack(hinge: Node3D) -> void:
	ship.world.fx.wood_hit(hinge.global_position, Vector3(randf_range(-1.0, 1.0), 0.5, randf_range(-1.0, 1.0)).normalized())


func _update_hinges(dt: float) -> void:
	for i in range(_hinges.size() - 1, -1, -1):
		var h := _hinges[i]
		if h.delay > 0.0:
			h.delay -= dt
			if h.delay > 0.0:
				continue
		if not h.started:
			h.started = true
			_crack(h.node)
		h.vel += float(h.gravity) * sin(float(h.angle) + 0.06) * dt
		h.angle += float(h.vel) * dt
		(h.node as Node3D).basis = Basis(h.axis as Vector3, float(h.angle))
		if h.angle > h.max:
			_hinges.remove_at(i)
			_release(h)


## Over the side: the debris takes the spar, still turning, and floats it off.
func _release(h: Dictionary) -> void:
	var node: Node3D = h.node
	var sp: ShipModel.Spar = h.spar
	var debris := ship.world.debris
	if debris == null or not node.is_inside_tree():
		node.queue_free()
		return
	var parent_basis := (node.get_parent() as Node3D).global_transform.basis
	var omega := (parent_basis * (h.axis as Vector3)).normalized() * float(h.vel)
	var mid := node.global_transform.basis * (sp.long * sp.length * 0.5)
	debris.add_body(node, omega.cross(mid) + ship.vel, omega * 0.6, sp.long, sp.length, h.canvas)


# ------------------------------------------------------------------ re-rigging

## The crew re-rigs once the hull is sound: the wreckage is cut away and each
## lost spar is hauled back up out of its stump in turn, fore to aft.
func _repair_rig() -> void:
	for h in _hinges:
		_release(h)
	_hinges.clear()
	var lost: Array[ShipModel.Spar] = []
	for sp in ship.model.spars:
		if sp.broken:
			lost.append(sp)
	if lost.is_empty():
		_finish_rig()
		return
	lost.sort_custom(func(a: ShipModel.Spar, b: ShipModel.Spar) -> bool: return a.pivot.z > b.pivot.z)
	for i in lost.size():
		var sp := lost[i]
		var g := Node3D.new()
		g.name = "Hoisting"
		g.add_child(_whole(sp))
		g.transform = Transform3D(Basis(sp.axis, sp.lean) * Basis.from_scale(Vector3.ONE * 0.001), sp.pivot)
		ship.model.add_child(g)
		_raising.append({"spar": sp, "node": g, "t": -i * RAISE_GAP, "dust": 0.0, "landed": false})


## Each spar swings up off the rail, overshoots, and settles into its step
## with a knock and a shower of sawdust.
func _update_raise(dt: float) -> void:
	if _raising.is_empty():
		return
	var fx := ship.world.fx
	var frame := _frame()
	var done_all := true
	for r in _raising:
		r.t += dt
		if r.t < RAISE_T:
			done_all = false
		if r.t < 0.0:
			continue
		var sp: ShipModel.Spar = r.spar
		if sp.stump != null:
			sp.stump.visible = false
		var u := minf(1.0, float(r.t) / RAISE_T)
		# grows out of the stump fast, then the hoist: up past plumb and back
		var g := 1.0 - pow(1.0 - minf(1.0, u / 0.38), 3.0)
		var k := MathX.smooth(0.08, 1.0, u)
		var swing := sp.lean * (1.0 - k) * (1.0 - k) - sin(k * PI * 2.2) * pow(1.0 - k, 1.4) * 0.09
		var sq := 1.0 + sin(minf(1.0, u / 0.38) * PI) * 0.06
		(r.node as Node3D).basis = Basis(sp.axis, swing) * Basis.from_scale(Vector3(g / sqrt(sq), g * sq, g / sqrt(sq)))
		var foot := frame * sp.centre
		# sawdust and shavings fly off the step while the spar goes up
		r.dust -= dt
		if u < 0.85 and r.dust <= 0.0:
			r.dust = 0.16
			fx.wood_hit(foot, Vector3(randf_range(-1.0, 1.0), 0.8, randf_range(-1.0, 1.0)).normalized())
		# a glint running up the new timber
		if u < 0.9 and randf() < dt * 14.0:
			var up := Basis(sp.axis, swing) * sp.long * (sp.length * g * minf(1.0, u * 1.6))
			fx.sparkle(frame * (sp.centre + up), 0.8)
		if not r.landed and u > 0.62:
			r.landed = true
			for j in 3:
				fx.wood_hit(foot, Vector3(randf_range(-1.0, 1.0), 0.6, randf_range(-1.0, 1.0)).normalized())
			for j in 7:
				fx.sparkle(frame * (sp.centre + sp.long * (sp.length * j / 6.0)) + Vector3(randf_range(-0.6, 0.6), randf_range(-0.4, 0.4), randf_range(-0.6, 0.6)))
	if done_all:
		_finish_rig()


## The hoisted copies give way to her own rig, whole again, and it's made fast.
func _finish_rig() -> void:
	for r in _raising:
		(r.node as Node3D).queue_free()
	_raising.clear()
	for n in _hidden:
		n.visible = true
	_hidden.clear()
	for sp in ship.model.spars:
		if sp.stump != null:
			sp.stump.queue_free()
			sp.stump = null
		sp.broken = false
	_mast_hp.fill(1.0)
	_events = 0
	_gone = 0
	_sync_gone()
	if not ship.alive:
		return
	var frame := _frame()
	var shape := ship.model.shape
	for m: Dictionary in ship.cls.masts:
		var p := frame * Vector3(0.0, shape.deck_y(m.t) + float(m.height) * 0.75, shape.z(m.t))
		for k in 3:
			ship.world.fx.sparkle(p + Vector3(randf_range(-1.2, 1.2), randf_range(-2.0, 3.0), randf_range(-1.2, 1.2)), 0.7)


# ------------------------------------------------------------------ afloat

## Flooding, mending, scorch and canvas, smoke from her breaches and her
## spars coming down or going back up, while she still fights.
func update(dt: float) -> void:
	var s := ship
	var world := s.world
	var dmg := 1.0 - s.hp / s.max_hp
	_since_hit += dt
	# settle lower and list toward the side with the most (and lowest) holes
	var lean := 0.0
	var open: Array[Dictionary] = []
	for h in holes:
		if h.patched:
			continue
		open.append(h)
		lean += float(h.side) * float(h.r) * (1.0 + clampf(1.0 - (h.c as Vector3).y / 1.6, 0.0, 1.2))
	var list_target := clampf(-lean * 0.016, -0.1, 0.1) * minf(1.0, dmg * 2.2)
	list += (list_target - list) * minf(1.0, dt * 0.35)
	var low_target := pow(dmg, 1.5) * s.cls.freeboard * 0.24
	lowered += (low_target - lowered) * minf(1.0, dt * 0.4)

	# scorch and torn canvas build quickly, and fade slowly as the crew repairs
	var wear_t := clampf(dmg * 1.15, 0.0, 1.0)
	_wear += (wear_t - _wear) * minf(1.0, dt * (2.0 if wear_t > _wear else 0.05))
	if _since_hit > 9.0:
		_sail_hits = maxf(0.0, _sail_hits - dt * 0.05)
	var canvas_t := clampf(dmg * 0.72 + _sail_hits * 0.07, 0.0, 0.92)
	_canvas += (canvas_t - _canvas) * minf(1.0, dt * (3.0 if canvas_t > _canvas else 0.06))
	_sync_state()

	# the crew boards breaches over as the hull is mended
	var budget := ceili(dmg * 16.0) + 1
	if open.size() > budget:
		var oldest := open[0]
		for h in open:
			if int(h.order) < int(oldest.order):
				oldest = h
		oldest.patched = true
		open.erase(oldest)
		_sync_holes()
		_place_shards(holes.find(oldest), oldest)
		var wp := _frame() * (oldest.c as Vector3)
		for k in 4:
			world.fx.sparkle(wp)
	# whole again, and the guns quiet a while: the lost spars go back up
	if s.hp / s.max_hp > 0.97 and _since_hit > 8.0 and _raising.is_empty() and _gone != 0:
		_repair_rig()
	_update_raise(dt)

	# smoke curling out of the breaches
	if dmg > 0.35 and not open.is_empty():
		_smoke_t += dt * (0.8 + dmg * 3.0)
		while _smoke_t > 1.0:
			_smoke_t -= 1.0
			var h: Dictionary = open[randi() % open.size()]
			var wp := _frame() * (h.c as Vector3)
			if wp.y < world.water_height(wp.x, wp.z) + 0.1:
				continue
			var g := randf_range(0.14, 0.24)
			world.fx.emit(wp, Vector3(s.vel.x * 0.5 + randf_range(-0.4, 0.4), randf_range(1.2, 2.6), s.vel.z * 0.5 + randf_range(-0.4, 0.4)),
					randf_range(2.2, 3.6), 0.7, randf_range(3.5, 5.5), Color(g, g * 0.95, g * 0.92, 0.5), Color(0.42, 0.41, 0.4), -0.5, 0.6, Particles.SMOKE, 0.15)
	_update_hinges(dt)


## A random point on her deck (either half of a wreck), in the world, above
## the water (a wreck's drowned deck has no flames): null if none was found.
func fire_point() -> Variant:
	var pts := ship.model.deck_points
	if pts.is_empty():
		return null
	for k in 3:
		var lp := pts[randi() % pts.size()]
		var p := (_bow_frame() if _bow != null and lp.z > _split_z else _frame()) * lp
		if ship.alive or p.y > ship.world.water_height(p.x, p.z) + 0.15:
			return p
	return null


# ------------------------------------------------------------------ going down

## She's done for: she breaks her back or goes over onto her beam ends
## (toward the side she was listing to), her masts come down, her lights go
## out and her cargo spills into the sea.
func on_death() -> void:
	var s := ship
	var c := s.cls
	var shape := s.model.shape
	_ensure_skin()
	# a spar still going up is whole enough to come down again with the rest
	if not _raising.is_empty():
		_finish_rig()
	# + rolls her port side up: she goes over toward her list
	var over := signf(list) if absf(list) > 1e-4 else (1.0 if randf() < 0.5 else -1.0)
	var fall_x := -over
	var spars := s.model.spars
	var split := randf() < (0.3 if c.id == "sloop" else 0.65) if wreck_mode < 0 else wreck_mode == Mode.SPLIT
	if split:
		_mode = Mode.SPLIT
		# she breaks where she's weakest: away from the masts, toward the latest breach
		var last: Variant = null
		for h in holes:
			if last == null or int(h.order) > int(last.order):
				last = h
		var best := 0.5
		var best_score := -INF
		for i in 13:
			var t := 0.36 + i / 12.0 * 0.28
			var z := shape.z(t)
			var clear := 6.0
			for k in c.masts.size():
				clear = minf(clear, absf(spars[k].pivot.z - z))
			var near := -absf((last.c as Vector3).z - z) * 0.15 if last != null else 0.0
			var score := clear + near + randf() * 0.8
			if score > best_score:
				best_score = score
				best = t
		_split_z = shape.z(best)
		# the halves hinge about her rail at the break, so they open out below
		# and nothing crosses over; the break settles just awash
		_pivot_y = maxf(shape.top(best), maxf(shape.top(best - 0.05), shape.top(best + 0.05))) + 0.3
		_depth = _pivot_y + 0.35
		# everything tall comes down; nothing stands on a broken back
		for i in c.masts.size():
			_break_mast(i, Vector3(fall_x * randf_range(0.6, 1.0), 0.0, randf_range(-0.3, 0.3)), randf_range(0.15, 2.4))
		_break_bowsprit(randf_range(0.3, 1.6))
		_split_in = 0.2
		_stern_a = randf_range(0.32, 0.55)
		_bow_a = randf_range(0.22, 0.48)
		_stern_r = randf_range(-0.25, 0.25)
		_bow_r = randf_range(-0.3, 0.3)
		_sep = randf_range(0.6, 1.8)
		_roll = over * randf_range(0.0, 0.18)
		_pitch = 0.0
	else:
		_mode = Mode.CAPSIZE
		# she rolls onto her beam ends; masts left standing lie out over the water
		_roll = over * randf_range(1.05, 1.38)
		_pitch = (1.0 if randf() < 0.5 else -1.0) * randf_range(0.06, 0.22)
		_depth = c.draft * 0.35 + c.freeboard * 0.3
		var standing: Array[int] = []
		for i in c.masts.size():
			if not spars[i].broken:
				standing.append(i)
		if standing.size() > 1 and randf() < 0.6:
			_break_mast(standing[randi() % standing.size()], Vector3(fall_x, 0.0, randf_range(-0.3, 0.3)), randf_range(0.6, 2.5))
	# lights out: lanterns dark, the great cabin's windows black
	(_skin["stern"] as ShaderMaterial).set_shader_parameter("lit", 0.0)
	(_skin["parts"] as ShaderMaterial).set_shader_parameter("glow_gain", 0.0)
	# cargo and timber spill out
	var debris := s.world.debris
	if debris == null:
		return
	var frame := _frame()
	debris.cargo(frame * Vector3(0.0, shape.main_deck_y(0.5), 0.0), s.vel, 3 + floori(c.length / 7.0), c.beam * 0.35)
	var liv := s.livery
	var cols: Array[Color] = [liv.hull, liv.strake, _raw_wood(), liv.trim]
	for i in 4:
		var p := frame * Vector3(randf_range(-1.0, 1.0) * c.beam * 0.4, shape.main_deck_y(0.5), randf_range(-0.4, 0.4) * c.length)
		debris.splinters(p, Vector3(randf_range(-1.0, 1.0), 0.4, randf_range(-1.0, 1.0)).normalized(), s.vel, cols, 5 + floori(c.length / 6.0))


## Her back breaks: the bow becomes a half of its own, drawn with its own
## copies of her damage materials, each half keeping its side of the break.
func _split_hull() -> void:
	var model := ship.model
	_bow = Node3D.new()
	_bow.name = "Bow"
	ship.add_child(_bow)
	for part: String in ["Hull", "Deck", "Parts", "Small", "Fine"]:
		var src := model.get_node_or_null(part) as MeshInstance3D
		if src == null:
			continue
		var kind: String = SKINNED[part]
		if not _bow_skin.has(kind):
			_bow_skin[kind] = (_skin[kind] as ShaderMaterial).duplicate()
		var mi := MeshInstance3D.new()
		mi.name = part
		mi.mesh = src.mesh
		mi.material_override = _bow_skin[kind]
		mi.cast_shadow = src.cast_shadow
		mi.visibility_range_end = src.visibility_range_end
		mi.visibility_range_end_margin = src.visibility_range_end_margin
		_bow.add_child(mi)
	# the rigging is gone with the masts
	var rig := model.get_node_or_null("Rigging") as Node3D
	if rig != null:
		rig.visible = false
	# each half keeps the splinters, stumps and toppling spars on its side
	if _shards != null:
		var mm := _shards.multimesh
		var bow_mm := MultiMesh.new()
		bow_mm.transform_format = MultiMesh.TRANSFORM_3D
		bow_mm.use_colors = true
		bow_mm.mesh = mm.mesh
		bow_mm.instance_count = mm.instance_count
		bow_mm.visible_instance_count = mm.visible_instance_count
		for i in mm.visible_instance_count:
			var xf := _shard_xf[i]
			if xf.origin.z > _split_z:
				mm.set_instance_transform(i, NO_SHARD)
				bow_mm.set_instance_transform(i, xf)
				bow_mm.set_instance_color(i, _shard_col[i])
			else:
				bow_mm.set_instance_transform(i, NO_SHARD)
		var bow_shards := MultiMeshInstance3D.new()
		bow_shards.name = "Shards"
		bow_shards.multimesh = bow_mm
		bow_shards.material_override = _shards.material_override
		_bow.add_child(bow_shards)
	for h in _hinges:
		var node: Node3D = h.node
		if node.position.z > _split_z:
			node.reparent(_bow)
	for sp in model.spars:
		if sp.stump != null and sp.centre.z > _split_z:
			sp.stump.reparent(_bow)
	var jag := 1.6 + ship.cls.beam * 0.12
	for m: ShaderMaterial in _skin.values():
		m.set_shader_parameter("dmg_split", Vector4(_split_z, -1.0, jag, 1.0))
	for m: ShaderMaterial in _bow_skin.values():
		m.set_shader_parameter("dmg_split", Vector4(_split_z, 1.0, jag, 1.0))
	# a burst of timber and spray where she snaps
	var world := ship.world
	var wp := _frame() * Vector3(0.0, 0.5, _split_z)
	world.fx.explosion(wp, 0.8)
	world.fx.splash(wp, 1.6)
	world.wake.stamp(wp.x, wp.z, 4.0, 0.8)
	world.wake.stamp(wp.x, wp.z, 7.0, 0.5, true)
	world.wake.push(wp.x, wp.z, 5.0, -0.9)


## The wreck's pose `t` seconds after she went: how far she has sunk, and
## her pitch and roll on top of the swell's (and the two halves of a broken
## back, about the break). Fills pose_*, afloat and done.
func wreck_pose(t: float, dt: float) -> void:
	var s := ship
	var c := s.cls
	var world := s.world
	if _split_in >= 0.0:
		_split_in -= dt
		if _split_in < 0.0:
			_split_hull()
	var split := _mode == Mode.SPLIT
	var e := MathX.smooth(0.0, 9.0 if split else 7.0, t)
	var lurch := sin(minf(t, 1.2) * PI / 1.2) * 0.35
	var y := -_depth * e - lurch
	# run aground on the shallows instead of sinking through the reef
	var bed := world.ground_height(s.pos.x, s.pos.z)
	var life := s.wreck_life
	var plunge := 0.0
	var heel := 0.0
	afloat = 1.0
	if t < life:
		y = maxf(y, bed + c.draft * 0.55)
	done = not s.founders and t > life + WRECK_FINAL
	if t > life and not s.founders:
		var u := t - life
		y -= u * u * 0.07 + u * 0.15
	elif t > life:
		# a quick founder goes down by the stern, bow reaching for the sky, and
		# heels over as she sinks; she glides down at a stately pace and comes
		# to rest on her side on the seabed
		var u := t - life
		var rest := bed + maxf(c.draft * 0.9, c.beam * 0.38)
		if rest_t < 0.0:
			# gathers way, then eases the last couple of metres onto the sand
			var left := y - _fall - rest
			_fall_v = minf(minf(1.9, _fall_v + dt * 0.55), 0.2 + maxf(left, 0.0) * 0.7)
			_fall += _fall_v * dt
			if left < 0.12:
				rest_t = t
		var settled := 0.0 if rest_t < 0.0 else MathX.smooth(0.0, 3.5, t - rest_t)
		y = maxf(y - _fall, rest)
		plunge = minf(0.42, u * 0.07) * (1.0 - settled * 0.75)
		heel = signf(_roll if _roll != 0.0 else 1.0) * minf(1.2, _fall * 0.065 + settled * 0.15)
		afloat = 1.0 - MathX.smooth(0.0, c.draft * 2.5, _fall)
	# bubbles and foam as she goes
	if (t < 7.0 or (t > life and t < life + WRECK_FINAL)) and randf() < (0.3 if t > life else 0.12):
		var a := randf_range(-0.45, 0.45) * c.length
		var px := s.pos.x + sin(s.heading) * a + randf_range(-1.0, 1.0) * c.beam * 0.5
		var pz := s.pos.z + cos(s.heading) * a + randf_range(-1.0, 1.0) * c.beam * 0.5
		world.fx.splash(Vector3(px, world.water_height(px, pz), pz), 0.3)
		world.wake.stamp(px, pz, randf_range(1.2, 2.6), 0.35)
	# thin smoke keeps rising from the smouldering wreck long after the flames die
	if t > 20.0 and t < 100.0 and randf() < 0.06:
		var p: Variant = fire_point()
		if p != null:
			var w := world.wind
			world.fx.emit(p, Vector3(w.dir_x * 0.6, randf_range(1.2, 2.2), w.dir_z * 0.6), randf_range(4.0, 6.0), 1.2, randf_range(5.0, 8.0),
					Color(0.32, 0.31, 0.3, 0.32 * (1.0 - (t - 20.0) / 80.0)), Color(0.6, 0.6, 0.6), -0.25, 0.3, Particles.SMOKE, 0.5)
	# a slow, heavy sway on the swell
	var sway := sin(t * 0.37 + _seed) * 0.02
	pose_y = y
	pose_pitch = _pitch * e - plunge
	pose_roll = _roll * e + heel + (0.0 if split else sway)
	if split and _bow != null:
		# the two halves sag about the break and drift apart
		var pv := Vector3(0.0, _pivot_y, _split_z)
		var bs := Basis.from_euler(Vector3(_stern_a * e, 0.0, _stern_r * e + sway))
		s.model.transform = Transform3D(bs, pv - bs * pv)
		var bb := Basis.from_euler(Vector3(-_bow_a * e, 0.0, _bow_r * e - sway))
		_bow.transform = Transform3D(bb, pv - bb * pv + Vector3(0.0, 0.0, _sep * e))
		# the embers along the break die down as she goes
		var burn := maxf(0.0, 1.0 - t / 40.0) * afloat * afloat
		if absf(burn - _burn) > 0.01:
			_burn = burn
			var jag := 1.6 + c.beam * 0.12
			for m: ShaderMaterial in _skin.values():
				m.set_shader_parameter("dmg_split", Vector4(_split_z, -1.0, jag, burn))
			for m: ShaderMaterial in _bow_skin.values():
				m.set_shader_parameter("dmg_split", Vector4(_split_z, 1.0, jag, burn))
	_sync_state()
	_update_hinges(dt)
