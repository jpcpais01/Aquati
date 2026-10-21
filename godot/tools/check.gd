extends SceneTree
## CI gate, run headless after the import: every script compiles, and each
## ship class that is built comes out sound (no NaNs, every solid face wound
## the way its normals point, within its triangle budget). Prints CHECK OK.

## Classes the port has built so far, and their triangle budgets (all layers).
const SHIPS := {"sloop": 60000}

var _errors := 0


func _initialize() -> void:
	_check_scripts("res://src")
	for id: String in SHIPS:
		_check_ship(id, SHIPS[id])
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
	model.free()


## The LOD ladder a surface gets: triangles per level and the switch error (m).
func _lods(arrays: Array) -> String:
	var im := ImporterMesh.new()
	im.add_surface(Mesh.PRIMITIVE_TRIANGLES, arrays)
	im.generate_lods(60.0, 25.0, [])
	var out := ""
	for i in im.get_surface_lod_count(0):
		out += " / %d @ %.3f" % [im.get_surface_lod_indices(0, i).size() / 3, im.get_surface_lod_size(0, i)]
	return (", LODs" + out) if out != "" else ""
