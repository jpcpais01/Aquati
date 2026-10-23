extends SceneTree
## CI gate, run headless after the import: every script compiles, each ship
## class that is built comes out sound (no NaNs, every solid face wound the
## way its normals point, within its triangle budget), the crew bake loads
## and agrees with the game on every id, each deck takes its crew, and the
## baked world loads whole (both archipelagos, their ground maps and their
## planting). Prints CHECK OK.

## Classes the port has built so far, and their triangle budgets (all layers).
const SHIPS := {"sloop": 60000, "brig": 82000, "galleon": 106000}
## The archipelagos the bake writes.
const REGIONS := ["home", "brumas"]

var _errors := 0


func _initialize() -> void:
	_check_scripts("res://src")
	for id: String in SHIPS:
		_check_ship(id, SHIPS[id])
	_check_crew()
	_check_world()
	if _errors == 0:
		print("CHECK OK")
	else:
		printerr("CHECK FAILED: %d problem(s)" % _errors)
	quit(1 if _errors > 0 else 0)


func _fail(msg: String) -> void:
	printerr("  FAIL ", msg)
	_errors += 1


func _check_scripts(dir: String) -> void:
	for f in DirAccess.get_files_at(dir):
		if not f.ends_with(".gd"):
			continue
		var path := dir.path_join(f)
		var s: Script = load(path)
		if s == null or not s.can_instantiate():
			_fail("script does not compile: " + path)
	for d in DirAccess.get_directories_at(dir):
		_check_scripts(dir.path_join(d))


func _check_ship(id: String, budget: int) -> void:
	var t0 := Time.get_ticks_usec()
	var model := ShipModel.create(ShipClass.named(id), Livery.named("player"))
	var ms := (Time.get_ticks_usec() - t0) / 1000.0
	var total := 0
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		if mi.mesh == null or mi.mesh.get_surface_count() == 0:
			continue
		var arrays := mi.mesh.surface_get_arrays(0)
		var v: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		var tris := idx.size() / 3
		total += tris
		for p in v:
			if not p.is_finite():
				_fail("%s/%s: vertex is not finite" % [id, mi.name])
				break
		var n = arrays[Mesh.ARRAY_NORMAL]
		# the rigging, the sails and the flags are two-sided
		if n == null or mi.name in ["Rigging", "Sail", "Flag"] or String(mi.name).begins_with("Sail"):
			continue
		var normals: PackedVector3Array = n
		var flipped := 0
		for k in range(0, idx.size(), 3):
			var a := v[idx[k]]
			var b := v[idx[k + 1]]
			var c := v[idx[k + 2]]
			# Godot's front faces wind clockwise: this cross points out
			var face := (c - a).cross(b - a)
			if face.length_squared() < 1e-14:
				continue
			var avg := normals[idx[k]] + normals[idx[k + 1]] + normals[idx[k + 2]]
			if face.dot(avg) < 0.0:
				flipped += 1
		var share := float(flipped) / maxf(tris, 1.0)
		print("  %s/%s: %d triangles, %d inside out%s" % [id, mi.name, tris, flipped, _lods(arrays)])
		if share > 0.01:
			_fail("%s/%s: %.1f%% of faces point against their normals" % [id, mi.name, share * 100.0])
	print("%s: %d triangles, built in %.0f ms" % [id, total, ms])
	if total > budget:
		_fail("%s: %d triangles is over its budget of %d" % [id, total, budget])
	_check_spars(id, model)
	model.free()


## Every mast and the bowsprit has its piece to fall, and no triangle of the
## merged meshes (at any level of detail) spans two spars, or a spar and the
## hull: a shot-away spar's vertices collapse, and such a triangle would
## stretch across the ship.
func _check_spars(id: String, model: ShipModel) -> void:
	if model.spars.size() != model.cls.masts.size() + 1:
		_fail("%s: %d spars for %d masts and a bowsprit" % [id, model.spars.size(), model.cls.masts.size()])
	var pieces := ""
	for sp in model.spars:
		var n := 0 if sp.piece == null or sp.piece.get_surface_count() == 0 else sp.piece.surface_get_array_index_len(0) / 3
		pieces += " %d" % n
		if n == 0:
			_fail("%s: spar %d has no piece" % [id, sp.group])
	print("  %s: spar pieces%s triangles" % [id, pieces])
	for part: String in ["Parts", "Small", "Fine"]:
		var mi := model.get_node_or_null(part) as MeshInstance3D
		if mi == null:
			continue
		var arrays := mi.mesh.surface_get_arrays(0)
		var cols: PackedColorArray = arrays[Mesh.ARRAY_COLOR]
		var spar := PackedInt32Array()
		spar.resize(cols.size())
		for i in cols.size():
			spar[i] = int(cols[i].a * 255.0) & 15
			if spar[i] > model.spars.size():
				_fail("%s/%s: a vertex stands on spar %d" % [id, part, spar[i]])
				return
		var im := ImporterMesh.new()
		im.add_surface(Mesh.PRIMITIVE_TRIANGLES, arrays)
		im.generate_lods(60.0, 25.0, [])
		var levels: Array[PackedInt32Array] = [arrays[Mesh.ARRAY_INDEX]]
		for l in im.get_surface_lod_count(0):
			levels.append(im.get_surface_lod_indices(0, l))
		for l in levels.size():
			var idx := levels[l]
			var mixed := 0
			for k in range(0, idx.size(), 3):
				var a := spar[idx[k]]
				if spar[idx[k + 1]] != a or spar[idx[k + 2]] != a:
					mixed += 1
			if mixed > 0:
				_fail("%s/%s: %d triangles at detail level %d span two spars" % [id, part, mixed, l])


## The LOD ladder a surface gets: triangles per level and the switch error (m).
func _lods(arrays: Array) -> String:
	var im := ImporterMesh.new()
	im.add_surface(Mesh.PRIMITIVE_TRIANGLES, arrays)
	im.generate_lods(60.0, 25.0, [])
	var out := ""
	for i in im.get_surface_lod_count(0):
		out += " / %d @ %.3f" % [im.get_surface_lod_indices(0, i).size() / 3, im.get_surface_lod_size(0, i)]
	return (", LODs" + out) if out != "" else ""


## The crew bake (tools/crew/bake_crew.mjs) loads whole and agrees with
## CrewModel on every id, every ship's deck musters her crew on its planks,
## and every look rolled is a full palette.
func _check_crew() -> void:
	var t0 := Time.get_ticks_usec()
	var meta: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://art/crew.json"))
	if not meta is Dictionary:
		_fail("crew: art/crew.json is unreadable (run tools/crew/bake_crew.mjs)")
		return
	var consts := (CrewModel as Script).get_script_constant_map()
	var prefix := {"tint": "TINT_", "hat": "HAT_", "prop": "PROP_", "pose": "P_"}
	for key: String in prefix:
		var ids: Dictionary = meta[key]
		for id: String in ids:
			var c: String = prefix[key] + _snake(id)
			if not consts.has(c) or int(consts[c]) != int(ids[id]):
				_fail("crew: %s is %d in the bake but %s in CrewModel" % [c, int(ids[id]), consts.get(c)])
	var bits: Dictionary = meta.bit
	for id: String in bits:
		var c := "F_" + _snake(id)
		if int(consts.get(c, -1)) != 1 << int(bits[id]):
			_fail("crew: %s is bit %d in the bake but %s in CrewModel" % [c, int(bits[id]), consts.get(c)])
	if int(meta.slots) != CrewModel.SLOTS or int(meta.poseSize) != CrewModel.POSE_SIZE:
		_fail("crew: %d slots and %d pose channels in the bake" % [int(meta.slots), int(meta.poseSize)])
	var levels := CrewModel.levels()
	if levels.size() != 4:
		_fail("crew: %d cuts of the sculpt, not 4" % levels.size())
		return
	var line := ""
	for lv in levels:
		var tris := 0
		for i in lv.meshes.size():
			if lv.meshes[i].get_surface_count() != 1:
				_fail("crew/%s: mesh %d is empty" % [lv.name, i])
			tris += lv.triangles[i]
		line += ", %s %d triangles in %d meshes" % [lv.name, tris, lv.meshes.size()]
	if levels[CrewModel.SPECK].meshes.size() != 1:
		_fail("crew: the speck is %d meshes, not one" % levels[CrewModel.SPECK].meshes.size())
	var rng := RandomNumberGenerator.new()
	for i in 400:
		var look := CrewLook.make(i % 2 == 0, i % 7 == 0, i % 7 == 1, rng)
		if look.slots.size() != CrewModel.SLOTS or look.hat < 0 or look.hat > CrewModel.HAT_STRAW or look.flags >= 1 << 20:
			_fail("crew: a look rolled %d slots, hat %d, kit %d" % [look.slots.size(), look.hat, look.flags])
			break
	# every deck musters her crew on its planks, each gun of a side manned
	var rows := [0]
	var take := func(_look: CrewLook) -> int:
		rows[0] += 1
		return rows[0] - 1
	var w := World.new()
	for id: String in SHIPS:
		var s := Ship.create(ShipClass.named(id), Livery.named("player"), w)
		var c := ShipCrew.new(s, take, false)
		var guns := 0
		for p in c.posts:
			guns += 1 if p.side == 1 else 0
		var hands := 2 if id == "sloop" else (3 if id == "brig" else 5)
		if c.sailors.size() != 2 + guns + hands or guns == 0:
			_fail("crew/%s: %d sailors for %d guns a side" % [id, c.sailors.size(), guns])
		for sl in c.sailors:
			var t := c.t_of(sl.z)
			if t < sl.zone.t0 - 0.01 or t > sl.zone.t1 + 0.01 or absf(sl.x) > sl.zone.half_width(t) + 0.01:
				_fail("crew/%s: a sailor stands off his deck at (%.2f, %.2f)" % [id, sl.x, sl.z])
		line += "; %s %d aboard, %d at the guns" % [id, c.sailors.size(), guns]
		s.free()
	print("crew%s, checked in %.0f ms" % [line, (Time.get_ticks_usec() - t0) / 1000.0])


## camelCase to the constants' UPPER_SNAKE ("armLX" to "ARM_LX").
static func _snake(s: String) -> String:
	var out := ""
	for i in s.length():
		var ch := s[i]
		if i > 0 and ch != ch.to_lower() and s[i - 1] == s[i - 1].to_lower():
			out += "_"
		out += ch.to_upper()
	return out


func _check_world() -> void:
	var t0 := Time.get_ticks_usec()
	var regions := Region.load_all()
	var ids := regions.map(func(r: Region) -> String: return r.id)
	if ids != REGIONS:
		_fail("world: archipelagos %s, not %s (run tools/world/bake_world.mjs)" % [ids, REGIONS])
		return
	var plants := 0
	var batches := 0
	for r in regions:
		if r.heights.size() != Region.GRID * Region.GRID:
			_fail("%s: %d heights" % [r.id, r.heights.size()])
			continue
		var lo := INF
		var hi := -INF
		for h in r.heights:
			lo = minf(lo, h)
			hi = maxf(hi, h)
		if not (is_finite(lo) and is_finite(hi)) or lo < -150.0 or hi > 400.0:
			_fail("%s: heights run %.1f .. %.1f m" % [r.id, lo, hi])
		for tex: Texture2D in [r.height_tex, r.shore_tex, r.ground_tex, r.cover_tex, r.isle_tex]:
			if tex == null or tex.get_width() == 0:
				_fail("%s: a ground map is missing" % r.id)
		if r.islands.is_empty():
			_fail("%s: no islands" % r.id)
		# (loaded here, not named: a script this one names compiles before
		# the autoloads exist, and the planting reads Settings)
		var f: Node3D = load("res://src/world/flora.gd").new()
		f.build(r)
		if f.plants == 0 or f.batches == 0:
			_fail("%s: nothing planted" % r.id)
		plants += f.plants
		batches += f.batches
		print("  %s: %d islands, %.1f .. %.1f m, %d plants in %d batches" % [r.id, r.islands.size(), lo, hi, f.plants, f.batches])
		f.free()
	# a new game starts at sea
	var spawn: Vector2 = load("res://src/game/game.gd").SPAWN
	var w := World.new()
	w.regions = regions
	if w.ground_height(spawn.x, spawn.y) > -2.0:
		_fail("world: the spawn point is aground (%.1f m)" % w.ground_height(spawn.x, spawn.y))
	print("world: %d archipelagos, %d plants in %d batches, loaded in %.0f ms" % [regions.size(), plants, batches, (Time.get_ticks_usec() - t0) / 1000.0])
