extends SceneTree
## CI gate, run headless after the import: every script compiles, each ship
## class that is built comes out sound (no NaNs, every solid face wound the
## way its normals point, within its triangle budget), the crew bake loads
## and agrees with the game on every id, each deck takes its crew, the touch
## shot pie opens and picks as a finger works it, the zoom runs out to its
## lean and back and a pinch is never taken for the helm, every weather
## settles in whole and the sky turns from one to the next without a jump,
## the night sky wheels and the moon keeps its phase, the sea-spark blooms lie
## where they should, a bolt of lightning comes down where it can be seen,
## the baked world loads whole (both archipelagos, their ground maps and
## their planting), and every sound and song is baked and plays as the web's
## do (see _check_sound). Prints CHECK OK.

## Classes the port has built so far, and their triangle budgets (all layers).
const SHIPS := {"sloop": 60000, "brig": 82000, "galleon": 106000}
## The archipelagos the bake writes.
const REGIONS := ["home", "brumas"]
## Every sound the game plays, as tools/audio/bake_audio.mjs names them.
const SOUNDS := ["air0", "air1", "air2", "ammo0", "ammo1", "ammo2", "ammo3", "ammo4", "blast", "bubbles",
		"cannon0", "cannon1", "cannon2", "chain", "chime", "click", "coin", "crunch", "earth", "flames", "founder",
		"grape", "groan", "guns_ready", "ignite", "noise", "recoil", "scrape0", "scrape1", "shell", "steam",
		"tally0", "tally1", "tally2", "tally3", "tally4", "tally5",
		"tally_best0", "tally_best1", "tally_best2", "tally_best3", "tally_best4", "tally_best5",
		"thunder_far", "thunder_near", "treasure1", "treasure2", "treasure3", "treasure4", "water", "whoosh", "wood"]
## The mix's buses past Master (Sound.build_buses).
const BUSES := [&"UI", &"Mix", &"SFX", &"Air6k", &"Air2k5", &"Air1k", &"Air450", &"Echo",
		&"EchoAir6k", &"EchoAir2k5", &"EchoAir1k", &"EchoAir450", &"Amb", &"Bed", &"Surf", &"Wind",
		&"Rain", &"Roar", &"Music", &"Deep"]

var _errors := 0


func _initialize() -> void:
	_check_scripts("res://src")
	for id: String in SHIPS:
		_check_ship(id, SHIPS[id])
	_check_crew()
	_check_pie()
	_check_zoom()
	_check_weather()
	_check_night()
	_check_world()
	# the helm's reach is a share of the window, and a strike is aimed by the
	# lens: those checks wait for the tree to run
	await process_frame
	_check_touch()
	_check_lightning()
	await _check_sound()
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
	# every lantern and cabin window wears its halo after dark
	var halos := model.get_node_or_null("Halos") as MeshInstance3D
	var lights := model.lamps.size() + model.windows.size()
	if model.lamps.is_empty() or model.windows.size() % 4 != 0 or halos == null or halos.mesh.surface_get_array_len(0) != lights * 4:
		_fail("%s: %d lanterns and %d cabin windows, and their halos don't match" % [id, model.lamps.size(), model.windows.size()])
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


## The touch shot pie worked by a finger: a tap opens it for a tap, a hold
## or a push opens it under the finger, letting go on a slice loads that
## shot, back in the middle thinks better of it, a kind with none left keeps
## it open, and the empty racks take no touch.
func _check_pie() -> void:
	var pie := ShotPie.new()
	root.add_child(pie)
	pie.position = root.get_visible_rect().size - Vector2(220.0, 206.0)
	var stock := Ammo.fresh_stock()
	stock[Ammo.CHAIN] = 0
	pie.show_state(Ammo.ROUND, stock)
	var got: Array[int] = []
	pie.picked.connect(func(k: int) -> void: got.append(k))
	var on := func(kind: int) -> Vector2:
		var a: float = ShotPie.SLOT[kind] * TAU / ShotPie.SLICES
		return Vector2(sin(a), -cos(a)) * (ShotPie.HUB + ShotPie.OUTER) * 0.5
	var steps := 0
	# a tap opens it for a tap, and a tap on fire shot loads it
	pie._on_touch(1, 0, Vector2.ZERO)
	pie._on_touch(3, 0, Vector2.ZERO)
	steps += 1 if pie.is_open() else 0
	pie._on_slice_tapped(on.call(Ammo.FIRE))
	steps += 1 if got == [Ammo.FIRE] and not pie.is_open() else 0
	# a hold opens it under the finger; sliding onto grape shot and letting go loads it
	got.clear()
	pie._on_touch(1, 0, Vector2.ZERO)
	pie._process(ShotPie.HOLD + 0.01)
	steps += 1 if pie.is_open() else 0
	pie._on_touch(2, 0, on.call(Ammo.GRAPE))
	pie._on_touch(3, 0, on.call(Ammo.GRAPE))
	steps += 1 if got == [Ammo.GRAPE] and not pie.is_open() else 0
	# a push opens it at once; out onto shell, back to the middle and let go: nothing
	got.clear()
	pie._on_touch(1, 0, Vector2.ZERO)
	pie._on_touch(2, 0, on.call(Ammo.SHELL))
	steps += 1 if pie.is_open() else 0
	pie._on_touch(2, 0, Vector2(2.0, 2.0))
	pie._on_touch(3, 0, Vector2(2.0, 2.0))
	steps += 1 if got.is_empty() and not pie.is_open() else 0
	# a still hold leaves it open for a tap; none of a kind left keeps it open
	pie._on_touch(1, 0, Vector2.ZERO)
	pie._process(ShotPie.HOLD + 0.01)
	pie._on_touch(3, 0, Vector2.ZERO)
	steps += 1 if pie.is_open() else 0
	pie._on_slice_tapped(on.call(Ammo.CHAIN))
	steps += 1 if got == [Ammo.CHAIN] and pie.is_open() else 0
	# the empty racks below let a touch through to the guns
	var rack := Vector2(0.0, 1.0) * (ShotPie.HUB + ShotPie.OUTER) * 0.5
	steps += 1 if not ShotPie.takes(rack) and ShotPie.takes(on.call(Ammo.ROUND)) else 0
	if steps != 9:
		_fail("pie: only %d of 9 steps worked as a finger would expect" % steps)
	pie.queue_free()
	print("pie: %d of 9 steps as expected" % steps)


## Out to the farthest zoom, a fresh push leans the camera over and it stays
## leaned; in, it straightens up before it closes in.
func _check_zoom() -> void:
	var cam := CameraRig.new()
	cam.set_view(0.9, 0.0)
	var steps := 0
	cam.zoom_by(5.0, 0.0)
	steps += 1 if cam.zoom == 1.0 and cam.tilt == 0.0 else 0
	# pushing on in the same breath holds at the stop
	cam.zoom_by(5.0, 0.1)
	steps += 1 if cam.tilt == 0.0 else 0
	# a fresh push leans it over, all the way
	cam.zoom_by(5.0, 0.5)
	cam.zoom_by(20.0, 0.55)
	steps += 1 if cam.tilt == 1.0 and cam.zoom == 1.0 else 0
	# and there it stays, however far you push
	cam.zoom_by(20.0, 1.5)
	cam.zoom_by(20.0, 2.5)
	steps += 1 if cam.tilt == 1.0 and cam.zoom == 1.0 else 0
	# in: it straightens up first, then closes in
	cam.zoom_by(-5.0, 3.0)
	steps += 1 if cam.tilt > 0.0 and cam.tilt < 1.0 and cam.zoom == 1.0 else 0
	cam.zoom_by(-20.0, 3.1)
	cam.zoom_by(-5.0, 3.2)
	steps += 1 if cam.tilt == 0.0 and cam.zoom < 1.0 else 0
	if steps != 6:
		_fail("zoom: only %d of 6 steps went as the wheel or a pinch would expect" % steps)
	cam.free()
	print("zoom: %d of 6 steps as expected" % steps)


## The touch helm only takes a finger low on the left, and two fingers
## landing together are a pinch even when the first came down on the helm.
func _check_touch() -> void:
	# (loaded here, not named: it reads the Settings autoload, which a script
	# run on its own only has once it is running)
	var c = load("res://src/game/controls.gd").new()
	root.add_child(c)
	var vp := root.get_visible_rect().size
	var touch := func(i: int, at: Vector2, down: bool) -> void:
		var e := InputEventScreenTouch.new()
		e.index = i
		e.position = at
		e.pressed = down
		c._on_touch(e)
	var drag := func(i: int, at: Vector2) -> void:
		var e := InputEventScreenDrag.new()
		e.index = i
		e.position = at
		c._on_drag(e)
	var thumb := vp * Vector2(0.2, 0.8)
	var mid := vp * Vector2(0.62, 0.5)
	var steps := 0
	# the thumb by the sail lever steers
	touch.call(0, thumb, true)
	drag.call(0, thumb + Vector2(0.0, -40.0))
	steps += 1 if c.helm_down() and c.steering else 0
	# a second finger straight after: a pinch, and the helm lets go
	touch.call(1, mid, true)
	steps += 1 if not c.helm_down() and not c.steering else 0
	drag.call(1, mid + Vector2(60.0, 0.0))
	steps += 1 if c.zoom < 0.0 else 0
	touch.call(0, thumb, false)
	touch.call(1, mid, false)
	c.consume()
	# up the left side, or mid screen, a finger is no helm
	touch.call(0, vp * Vector2(0.2, 0.2), true)
	touch.call(0, vp * Vector2(0.2, 0.2), false)
	touch.call(1, vp * Vector2(0.45, 0.8), true)
	steps += 1 if not c.helm_down() else 0
	touch.call(1, vp * Vector2(0.45, 0.8), false)
	# a finger already on the helm a while keeps it when another lands
	touch.call(0, thumb, true)
	c._helm_ms -= 1000
	touch.call(1, mid, true)
	steps += 1 if c.helm_down() else 0
	touch.call(0, thumb, false)
	touch.call(1, mid, false)
	if steps != 5:
		_fail("touch: only %d of 5 steps went as fingers would expect" % steps)
	c.queue_free()
	print("touch: %d of 5 steps as expected" % steps)


## Every weather settles in whole and as it should look (a storm darker than
## a clear day, rain soaking the decks), the very hot noon keeps to its time
## and place, and left to itself the sky turns from one weather to the next
## with nothing jumping on the way.
func _check_weather() -> void:
	var a := Atmosphere.new()
	a.set_hour(10.0)
	var steps := 0
	var sane := 0
	var lum := {}
	var wet := {}
	for k: StringName in Atmosphere.KINDS:
		a.set_mode(k, true)
		a.update(0.0)
		var ok := a.kind == k and a.cover >= 0.0 and a.cover <= 1.0 and a.veil.x >= 0.0 and a.fog_range.x < a.fog_range.y
		for x: float in [a.cover, a.rain, a.storm, a.fog, a.wind, a.sea, a.wet, a.exposure, a.veil.x, a.veil.y, a.veil.w,
				a.light_tint.x, a.key_color.y, a.fog_color.z, a.zenith.x, a.horizon.y, a.haze.z]:
			ok = ok and is_finite(x)
		sane += 1 if ok else 0
		lum[k] = a.light_tint.dot(Vector3(0.2126, 0.7152, 0.0722))
		wet[k] = a.wet
	steps += 1 if sane == Atmosphere.KINDS.size() else 0
	steps += 1 if lum[&"storm"] < lum[&"clear"] * 0.75 and wet[&"rain"] > 0.5 and wet[&"clear"] == 0.0 else 0
	# the scorching noon: only out on the high seas, and only at noon
	var home := a.needs(&"hot") != ""
	a.climate = &"open"
	a.set_hour(12.5)
	var noon := a.needs(&"hot") == ""
	a.set_hour(16.0)
	steps += 1 if home and noon and a.needs(&"hot") != "" else 0
	# an hour of nature's own weather, half a second at a time
	var b := Atmosphere.new()
	b.set_mode(&"auto")
	var seen := {b.kind: true}
	var turns := [0]
	b.changed.connect(func(_k: StringName, _t: String, _l: String) -> void: turns[0] += 1)
	var jump := 0.0
	for i in 7200:
		var was := [b.cover, b.rain, b.storm, b.fog, b.wind, b.sea, b.wet]
		b.update(0.5)
		seen[b.kind] = true
		var now := [b.cover, b.rain, b.storm, b.fog, b.wind, b.sea, b.wet]
		for j in now.size():
			jump = maxf(jump, absf(now[j] - was[j]))
	# (a snap from one weather to the next moves something a fifth of its range at once)
	steps += 1 if seen.size() >= 3 and turns[0] >= 1 and jump < 0.1 else 0
	if steps != 4:
		_fail("weather: only %d of 4 steps as expected (%d kinds seen in an hour, largest step %.3f)" % [steps, seen.size(), jump])
	print("weather: %d of 4 steps as expected; an hour of it turned through %d kinds, %d announced" % [steps, seen.size(), turns[0]])


## The night: the stars wheel about the pole as the hours turn, the moon
## shows only after dark and is lit just as far as its phase says, the
## sea-spark blooms lie out on the crossing to Las Brumas (two of them) and
## nowhere near an archipelago, and the glowing seas keep to the dark and to
## the blooms.
func _check_night() -> void:
	var a := Atmosphere.new()
	var steps := 0
	a.set_mode(&"clear", true)
	a.set_hour(12.0)
	a.update(0.0)
	var day := [a.moon_show, a.sea_glow]
	a.set_hour(23.0)
	a.update(0.0)
	var r1 := a.star_rot
	var lit_ok := true
	for ph: float in [0.0, 0.2, 0.5, 0.8]:
		a.moon_phase = ph
		a.update(0.0)
		lit_ok = lit_ok and absf((1.0 + a.moon_sun.dot(-a.moon_dir)) * 0.5 - a.moon_lit) < 0.01 and absf(a.moon_sun.length() - 1.0) < 1e-3
	var night := [a.moon_show, a.sea_glow]
	steps += 1 if day[0] == 0.0 and day[1] == 0.0 and night[0] > 0.5 and night[1] > 0.5 and lit_ok else 0
	a.set_hour(1.0)
	a.update(0.0)
	var r2 := a.star_rot
	var pole := Atmosphere.POLE
	var east := Atmosphere.EAST
	steps += 1 if absf(r1.determinant() - 1.0) < 1e-4 and (r1 * pole - pole).length() < 1e-4 and (r2 * east - r1 * east).length() > 0.3 else 0
	# two blooms along the crossing, none round either archipelago
	var centres := PackedVector2Array([Vector2.ZERO, Vector2(6600.0, -2800.0)])
	var runs := 0
	var inside := false
	var peak := 0.0
	for i in 401:
		var t := i / 400.0
		var g := SeaGlow.at(6600.0 * t, -2800.0 * t, centres)
		peak = maxf(peak, g)
		if g > 0.3 and not inside:
			runs += 1
		inside = g > 0.3
	var near := 0.0
	for i in 64:
		var ang := TAU * i / 64.0
		for c in centres:
			near = maxf(near, SeaGlow.at(c.x + cos(ang) * 1300.0, c.y + sin(ang) * 1300.0, centres))
	steps += 1 if runs == 2 and peak > 0.95 and near == 0.0 else 0
	# the glowing seas: only by night, only in a bloom (a held one keeps a little longer)
	a.bloom = 0.8
	var dark_in := a.needs(&"glow") == ""
	a.bloom = 0.2
	var edge := a.needs(&"glow") != "" and a.needs(&"glow", true) == ""
	a.bloom = 0.0
	var out := a.needs(&"glow") != ""
	a.bloom = 0.8
	a.set_hour(15.0)
	var noon := a.needs(&"glow") != ""
	a.set_hour(23.0)
	a.set_mode(&"glow", true)
	a.update(0.0)
	steps += 1 if dark_in and edge and out and noon and a.kind == &"glow" and a.sea_glow >= 0.6 else 0
	if steps != 4:
		_fail("night: only %d of 4 steps as expected (moon %.2f / %.2f, blooms %d peaking %.2f, %.2f near the isles)" % [steps, day[0], night[0], runs, peak, near])
	print("night: %d of 4 steps as expected; %d blooms on the crossing" % [steps, runs])


## A bolt of lightning comes down out ahead of the lens, from the cloud base
## to the sea, as one sound ribbon; its flash leaps up and dies away.
func _check_lightning() -> void:
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.look_at_from_position(Vector3(0.0, 150.0, 80.0), Vector3.ZERO)
	var l := Lightning.new()
	root.add_child(l)
	var steps := 0
	var st := l.strike(Vector3.ZERO, cam, true)
	# ahead of the lens (the top of the screen is -z here) and out of the way of the ship
	var d := Vector2(st.x, st.z)
	steps += 1 if st.bolt and d.y < 0.0 and d.length() > 150.0 else 0
	var m: ArrayMesh = l.mesh
	var ok := m.get_surface_count() == 1
	var low := INF
	var high := -INF
	if ok:
		var arrays := m.surface_get_arrays(0)
		var pos: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		ok = pos.size() > 0 and idx.size() % 3 == 0
		for p in pos:
			ok = ok and is_finite(p.x) and is_finite(p.y) and is_finite(p.z)
			low = minf(low, p.y)
			high = maxf(high, p.y)
		for i in idx:
			ok = ok and i >= 0 and i < pos.size()
	# (a ribbon turned to the eye tilts with the jagged channel: half its
	# width can dip a few metres either side of the sea at the foot)
	steps += 1 if ok and low > -8.0 and low < 2.0 and high > 300.0 else 0
	var f := [0.0, 0.0]
	for i in 6:
		l.update(1.0 / 30.0, 0.0, Vector3.ZERO, cam)
		f[0] = maxf(f[0], l.flash)
	for i in 60:
		l.update(1.0 / 30.0, 0.0, Vector3.ZERO, cam)
	f[1] = l.flash
	steps += 1 if f[0] > 0.3 and f[1] < 0.01 and not l.visible else 0
	if steps != 3:
		_fail("lightning: only %d of 3 steps as expected (strike at %.0f, %.0f; flash %.2f then %.3f)" % [steps, st.x, st.z, f[0], f[1]])
	l.queue_free()
	cam.queue_free()
	print("lightning: %d of 3 steps as expected" % steps)


## The sound: every sound the game plays is baked, each of its takes on disk,
## the sea's noise and the open sea's theme loop, and each song has its
## numbers. Then, live: every take loads; each bus of the mix sends to one
## before it; a sound takes the air bus its distance leaves it and arrives
## late by the distance it carried (thunder all the way, however far); the
## web's pan law comes through; a close blow ducks the sea and lets it back;
## a crowded mix lets the faint go first and never grows past its cap, and
## sound off plays nothing; the band plays every song before any repeats; and
## something out on the water is heard where it is.
func _check_sound() -> void:
	var t0 := Time.get_ticks_usec()
	var m: Variant = JSON.parse_string(FileAccess.get_file_as_string(Sound.MANIFEST))
	if not m is Dictionary:
		_fail("sound: no %s (run tools/audio/bake_audio.mjs)" % Sound.MANIFEST)
		return
	var sfx: Dictionary = m.get("sfx", {})
	var takes := 0
	for key: String in SOUNDS:
		if not sfx.has(key):
			_fail("sound: %s isn't baked" % key)
			continue
		var e: Dictionary = sfx[key]
		for i in (e.gain as Array).size():
			takes += 1
			var path := "res://audio/sfx/%s_%d.%s" % [key, i, e.ext]
			if not ResourceLoader.exists(path):
				_fail("sound: no " + path)
	var noise: AudioStreamWAV = load("res://audio/sfx/noise_0.wav")
	if noise == null or noise.loop_mode != AudioStreamWAV.LOOP_FORWARD:
		_fail("sound: the sea's noise doesn't loop")
	var music: Dictionary = m.get("music", {})
	var songs := 0
	for n: String in music:
		var e: Dictionary = music[n]
		var path := Music.DIR + n + ".ogg"
		if not ResourceLoader.exists(path):
			_fail("sound: no " + path)
		elif e.get("loop", false):
			var theme: AudioStreamOggVorbis = load(path)
			if not theme.loop:
				_fail("sound: %s doesn't loop" % path)
		else:
			songs += 1
			var end := float(e.get("end", 0.0))
			var lean := Vector2(float(e.get("day", -1.0)), float(e.get("night", -1.0)))
			if str(e.get("title", "")).is_empty() or float(e.get("gain", 0.0)) <= 0.0 or end <= 0.0 or end > float(e.get("seconds", 0.0)) + 1.0 \
					or lean.x < 0.0 or lean.x > 1.0 or lean.y < 0.0 or lean.y > 1.0:
				_fail("sound: %s's numbers are off (%s)" % [n, e])

	var snd := Sound.new()
	root.add_child(snd)
	var wait := Time.get_ticks_msec()
	while not snd.loaded() and Time.get_ticks_msec() - wait < 20000:
		await process_frame
	# driven by hand from here
	snd.set_process(false)
	var steps := 0
	steps += 1 if snd.loaded() and snd.loaded_takes() == takes else 0
	var sends := true
	for n: StringName in BUSES:
		var i := AudioServer.get_bus_index(n)
		sends = sends and i > 0 and AudioServer.get_bus_index(AudioServer.get_bus_send(i)) < i
	steps += 1 if sends else 0
	var air := [Sound.air_bus(17000.0), Sound.air_bus(7000.0), Sound.air_bus(2500.0), Sound.air_bus(1000.0), Sound.air_bus(260.0)]
	steps += 1 if air == [0, 1, 2, 3, 4] else 0
	# a splash a second's sail of sound away: late by that, and dulled to the 1 kHz air
	var played := snd.played
	snd.splash(1.0, 0.0, Sound.SPEED_OF_SOUND)
	var cue: Sound._Cue = snd._cues.back()
	var on_time := is_equal_approx(cue.at - snd._now, 1.0) and cue.air == 3 and cue.wet > 0.0
	snd._process(0.5)
	on_time = on_time and snd.played == played
	snd._process(0.55)
	on_time = on_time and snd.played == played + 1
	steps += 1 if on_time else 0
	# thunder is never hurried: two seconds' worth of distance is two seconds late
	snd.thunder(1.0, 0.0, Sound.SPEED_OF_SOUND * 2.0)
	cue = snd._cues.back()
	steps += 1 if is_equal_approx(cue.at - snd._now, 2.0) and cue.stereo and cue.air == 4 and snd.peals == 1 else 0
	# the pan law: equal power, and a stereo take's far side folded into the near
	var lr: Array[Vector2] = [Sound.pan_gains(0.0, false), Sound.pan_gains(-1.0, false), Sound.pan_gains(1.0, false),
			Sound.pan_gains(0.0, true), Sound.pan_gains(-1.0, true), Sound.pan_gains(3.0, true)]
	var law: Array[Vector2] = [Vector2(sqrt(0.5), sqrt(0.5)), Vector2(1.0, 0.0), Vector2(0.0, 1.0), Vector2.ONE, Vector2(sqrt(2.0), 0.0), Vector2(0.0, sqrt(2.0))]
	var panned := true
	for i in lr.size():
		panned = panned and (lr[i] - law[i]).length() < 1e-4
	steps += 1 if panned else 0
	# the duck: held till the blow lands, down for a moment, then most of the way back in a second
	snd.duck(snd._now + 3.0, 0.5)
	var at := snd._now + 3.0
	var duck := Vector3(snd.duck_gain(at - 0.1), snd.duck_gain(at + 0.06), snd.duck_gain(at + 1.12))
	steps += 1 if is_equal_approx(duck.x, 1.0) and is_equal_approx(duck.y, 0.5) and absf(duck.z - (1.0 - 0.5 * exp(-1.25))) < 1e-3 else 0
	# a crowded mix: past CROWDED the faint are let go, and never more than MAX_VOICES at once
	var dropped := snd.dropped
	while snd._voices <= Sound.CROWDED:
		snd.splash(1.0, 0.0)
	snd.splash(0.6, 0.0)
	var faint := snd.dropped == dropped + 1
	for i in Sound.MAX_VOICES:
		snd.splash(1.0, 0.0)
	steps += 1 if faint and snd._voices == Sound.MAX_VOICES else 0
	# sound off: nothing new plays, and the mix is silent
	snd.set_muted(true)
	var quiet := snd._cues.size()
	snd.coin()
	snd.thunder(1.0, 0.0, 100.0)
	steps += 1 if snd._cues.size() == quiet and AudioServer.is_bus_mute(AudioServer.get_bus_index(&"Mix")) else 0
	snd.set_muted(false)
	# the band: every song before any repeats, and never the same one twice running
	var band := snd.music
	var seen := {}
	for i in band.songs.size():
		seen[band.pick()] = true
	var last := band._last
	steps += 1 if band.songs.size() == songs and seen.size() == songs and band.pick() != last else 0
	# heard where it is: 90 m to the right of the listener, at the camera's zoom of 100 m
	var w := World.new()
	w.listener = Vector3(10.0, 0.0, 5.0)
	w.listener_zoom = 100.0
	var h := w.heard(Vector3(100.0, 3.0, 5.0))
	steps += 1 if (h - Vector3(90.0 / 216.0, 1.25, 90.0)).length() < 1e-4 else 0
	snd.queue_free()
	if steps != 11:
		_fail("sound: only %d of 11 steps as expected (%s)" % [steps, snd.stats()])
	print("sound: %d of 11 steps as expected; %d sounds in %d takes, %d songs, loaded in %.0f ms" % [steps, SOUNDS.size(), takes, songs, (Time.get_ticks_usec() - t0) / 1000.0])


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
