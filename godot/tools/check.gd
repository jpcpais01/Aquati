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
## their planting), a broadside's damage numbers stack up clear of one
## another, every sound and song is baked and plays as the web's do (see
## _check_sound), the waypoints drop, number, arm and strike off as the web's,
## the sea chart's geography lands where the web's does and its view maps the
## sea to the canvas and back (_check_maps), the helmsman's courses keep to
## water deep enough for her keel, round the isles, across the high seas, off
## a goal on land and inside the edge of the known sea (_check_helm), her
## look and the Shipwright's designs are made whole from anything, drawn
## and kept (_check_looks), what's kept between voyages comes back whole
## from its save, takes nothing malformed from a damaged one and survives a
## crash mid-write (_check_progress), and the ship parts come out as the
## web's do and every class carries each of them soundly (_check_parts),
## and the game's updates read GitHub's releases as CI writes them, keep
## user://updates tidy and lay their card out in every state (_check_updates).
## Prints CHECK OK.

## Classes the port has built so far, and their triangle budgets (all layers).
const SHIPS := {"sloop": 60000, "brig": 82000, "galleon": 106000, "revenant": 112000}
## How far over her budget a class may go with a full set of parts bolted on.
const PARTS_OVER := 1.3
## The archipelagos the bake writes.
const REGIONS := ["home", "brumas"]
## A town's triangles close up and as its shell, at most.
const TOWN_TRIS := 26000
const TOWN_SHELL_TRIS := 3000
## A town's feast-night dressing (its lanterns, their cords and poles), drawn only on a feast night.
const FEAST_TRIS := 10000
## Puerto Marézia's triangles (its quay, buildings, palms and what moves; its folk are the crews').
const HOME_TRIS := 34000
## Each fort's stonework, whole and wrecked (the web's fort is about as much).
const FORT_TRIS := 26000
## Every sound the game plays, as tools/audio/bake_audio.mjs names them.
const SOUNDS := ["air0", "air1", "air2", "ammo0", "ammo1", "ammo2", "ammo3", "ammo4", "ammo5", "bell", "blast", "bosun_pipe", "bubbles",
		"cannon0", "cannon1", "cannon2", "card_flip", "chain", "cheer4", "cheer6", "chime", "clash", "click", "clunk", "coin", "creak0", "creak1", "creak2",
		"crunch", "earth", "flames", "foot_step", "founder", "fw_big", "fw_boom", "fw_crackle", "fw_pop", "fw_sizzle", "grape", "groan", "gull1", "gull2", "gull3", "guns_ready", "hop_hard", "hop_sand", "hop_up", "hop_wet", "ignite", "lap",
		"mallet", "murmur", "noise", "pistol", "pour0", "pour1", "purse", "recoil", "reel0", "reel1", "reel2", "reel3", "rocket", "sand_step", "scrape0", "scrape1", "shell",
		"squeeze_arrival", "squeeze_flourish", "steam", "swish", "phantom", "wail", "toll", "horn", "wanted2", "wanted3", "bounty",
		"thwack", "thwack_heavy", "tally0", "tally1", "tally2", "tally3", "tally4", "tally5",
		"tally_best0", "tally_best1", "tally_best2", "tally_best3", "tally_best4", "tally_best5",
		"thunder_far", "thunder_near", "treasure1", "treasure2", "treasure3", "treasure4",
		"vault_burst", "vault_rumble0", "vault_rumble1", "vault_rumble2", "vault_rumble3", "war_cry3", "war_cry5", "water", "wet_step", "whistle", "whoosh", "wood"]
## The mix's buses past Master (Sound.build_buses).
const BUSES := [&"UI", &"Mix", &"SFX", &"Air6k", &"Air2k5", &"Air1k", &"Air450", &"Echo",
		&"EchoAir6k", &"EchoAir2k5", &"EchoAir1k", &"EchoAir450", &"Amb", &"Bed", &"Surf", &"Wind",
		&"Rain", &"Roar", &"Music", &"Deep"]

var _errors := 0
## The baked world, for the home port's check (once the tree runs: her lines are tied to where she lies in it).
var _home_world: World


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
	_check_looks()
	_check_progress()
	_check_parts()
	_check_cosmetics()
	_check_fireworks()
	# the helm's reach is a share of the window, and a strike is aimed by the
	# lens: those checks wait for the tree to run
	await process_frame
	if _home_world != null:
		_check_home_port(_home_world)
	_check_touch()
	_check_lightning()
	_check_floaters()
	await _check_updates()
	await _check_sound()
	if _errors == 0:
		print("CHECK OK")
	else:
		printerr("CHECK FAILED: %d problem(s)" % _errors)
	quit(1 if _errors > 0 else 0)


## The in-game updates: versions and tags read, the releases picked over
## (drafts, pre-releases, the web's tags and builds without an APK left
## out), the notes split from CI's install line and set in blocks, the
## builds since yours named once each, old downloads cleared, and the card
## built in every state it can be in.
func _check_updates() -> void:
	var up: GDScript = load("res://src/core/updater.gd")
	if up.code_of("0.19.65") != 65 or up.code_of("android-v0.20.67") != 67 or up.code_of("0.1.0") != 0 or up.code_of("") != 0:
		_fail("updates: versions read wrong")
	if up.short_of("0.20.67") != "0.20" or up.short_of("1.2") != "1.2":
		_fail("updates: short versions wrong")
	var body := "## Shores O' Fortune for Android: maelstroms and reefs\n\n**Fixed in this build:** sails no longer flicker,\nand the camera button is quiet.\n\nThe nineteenth build.\n\n- **Maelstroms.** The sea falls away\n  in a bowl.\n- **Their pull.** Round and in.\n\n---\n\nInstall: download `x.apk`.\n"
	var n: PackedStringArray = up.notes_of(body)
	if n[0] != "Maelstroms and reefs" or n[1].contains("Install:") or not n[1].begins_with("**Fixed"):
		_fail("updates: notes split wrong: %s" % [n])
	if up.key_of(body) != "release" or up.key_of(body + "\n_Signed with the shared test key until..._") != "fallback" or up.key_of("x\n<!-- signed: release -->\nshared test key") != "release":
		_fail("updates: signing keys read wrong")
	var bl: Array = up.blocks(n[1])
	var kinds := []
	for b: Dictionary in bl:
		kinds.append(b.kind)
	if kinds != ["p", "p", "li", "li"]:
		_fail("updates: blocks %s" % [kinds])
	elif bl[0].runs[0] != ["Fixed in this build:", true] or str(bl[2].runs[1][0]) != " The sea falls away in a bowl." or str(bl[0].runs[1][0]).contains("\n"):
		_fail("updates: runs %s / %s" % [bl[0].runs, bl[2].runs])
	var apk := func(name: String) -> Dictionary:
		return {"name": name, "size": 1000, "state": "uploaded", "browser_download_url": "https://example.invalid/" + name, "digest": "sha256:ABC123"}
	var rel := func(tag: String, title: String, assets: Array, more := {}) -> Dictionary:
		var r := {"tag_name": tag, "draft": false, "prerelease": false, "assets": assets, "html_url": "https://example.invalid/" + tag, "published_at": "2026-10-24T12:06:54Z",
				"body": "## Shores O' Fortune for Android: %s\n\nNotes.\n\n---\n\nInstall." % title}
		r.merge(more, true)
		return r
	var releases := [
		rel.call("android-v0.19.63", "maelstroms and reefs", [apk.call("a.apk")]),
		rel.call("android-v0.21.70", "drafted", [apk.call("d.apk")], {"draft": true}),
		rel.call("android-v0.21.71", "trial", [apk.call("p.apk")], {"prerelease": true}),
		rel.call("v2.0.99", "the web", [apk.call("w.apk")]),
		rel.call("android-v0.20.68", "no apk yet", [{"name": "notes.txt", "size": 3}]),
		rel.call("android-v0.20.67", "the kraken", [apk.call("k.apk")]),
		rel.call("android-v0.19.65", "maelstroms and reefs", [{"name": "big.apk", "size": 9, "digest": null, "browser_download_url": "u"}]),
		"junk",
	]
	var picked: Array = up.pick(releases)
	var codes := []
	for b: Dictionary in picked:
		codes.append(int(b.code))
	if codes != [67, 65, 63]:
		_fail("updates: picked %s" % [codes])
	elif str(picked[0].sha256) != "ABC123" or str(picked[1].sha256) != "" or str(picked[0].title) != "The kraken" or int(picked[0].size) != 1000:
		_fail("updates: build read wrong: %s" % [picked[0]])
	# the Windows game takes the same releases' .exe, and only those that have one
	var win_rel := releases.duplicate()
	win_rel.append(rel.call("android-v0.23.80", "on windows", [apk.call("w.apk"), apk.call("shores-o-fortune-0.23.80-windows.exe")]))
	var wins: Array = up.pick(win_rel, ".exe")
	if wins.size() != 1 or int(wins[0].code) != 80 or not str(wins[0].url).ends_with("-windows.exe"):
		_fail("updates: the Windows build read wrong: %s" % [wins])
	elif int(up.pick(win_rel)[0].code) != 80 or not str(up.pick(win_rel)[0].url).ends_with("w.apk"):
		_fail("updates: the APK of a release with both read wrong")
	var u: Node = up.new()
	root.add_child(u)
	u.desktop = false
	u.installed_code = 63
	u.take(releases)
	if int(u.latest.get("code", 0)) != 67 or u.between != ["Maelstroms and reefs"]:
		_fail("updates: newer read wrong: %s %s" % [u.latest.get("code"), u.between])
	u.installed_code = 67
	u.take(releases)
	if not u.between.is_empty():
		_fail("updates: builds since the newest")
	# old downloads go, the newest stays
	DirAccess.make_dir_recursive_absolute(up.DIR)
	for f: String in ["shores-o-fortune-0.19.60.apk", "shores-o-fortune-0.20.67.apk", "shores-o-fortune-0.21.80.apk.part", "shores-o-fortune-0.21.80.apk"]:
		FileAccess.open(up.DIR.path_join(f), FileAccess.WRITE).store_string("x")
	u.tidy()
	var left := Array(DirAccess.get_files_at(up.DIR))
	if left != ["shores-o-fortune-0.21.80.apk"]:
		_fail("updates: tidy left %s" % [left])
	# and a build overtaken by a newer one goes too
	FileAccess.open(up.DIR.path_join("shores-o-fortune-0.21.81.apk"), FileAccess.WRITE).store_string("x")
	u.tidy(up.DIR.path_join("shores-o-fortune-0.21.81.apk"))
	left = Array(DirAccess.get_files_at(up.DIR))
	if left != ["shores-o-fortune-0.21.81.apk"]:
		_fail("updates: tidy kept %s" % [left])
	for f: String in left:
		DirAccess.remove_absolute(up.DIR.path_join(f))
	# the card in every state
	var card: CanvasLayer = load("res://src/ui/update_card.gd").new()
	card.updater = u
	root.add_child(card)
	await process_frame
	for at: String in ["offer", "downloading", "ready", "failed", "rekeyed"]:
		u.demo(card.own_notes, at)
		card.open()
		await process_frame
		if not card.is_open() or (at == "downloading") != (card._bar != null) or (at != "downloading") != (card._gold_btn != null) or (at == "rekeyed") != u.key_changed():
			_fail("updates: the card at %s laid out wrong" % at)
	for st: int in [up.CURRENT, up.CHECKING, up.IDLE]:
		u.state = st
		u.latest = {}
		u.changed.emit()
		await process_frame
		if card._built != st or card._content == null or card._content.size.y <= 0.0:
			_fail("updates: the card at state %d laid out wrong" % st)
	card.close()
	card.queue_free()
	u.queue_free()


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
	var lights := model.lamps.size() + model.windows.size() + model.glows.size()
	if model.lamps.is_empty() or model.windows.size() % 4 != 0 or model.glows.size() != model.glow_kinds.size() or halos == null or halos.mesh.surface_get_array_len(0) != lights * 4:
		_fail("%s: %d lanterns, %d cabin windows and %d glows, and their halos don't match" % [id, model.lamps.size(), model.windows.size(), model.glows.size()])
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


## A broadside's numbers landing on one spot stack up a line apart, each clear
## of those still rising, and every burst is placed (the stacking used to go
## round forever when a float rounded the wrong way, freezing the fight).
func _check_floaters() -> void:
	var f := Floaters.new()
	root.add_child(f)
	var placed := 0
	var crowded := 0
	for s in 8:
		seed(s + 1)
		for burst in 4:
			for i in 6:
				f.pop("-%d" % (7 + i), Vector2(640.0, 300.0 + burst * 0.37), Floaters.Kind.BAD)
				var it: Floaters._Item = f._items[(f._next + Floaters.POOL - 1) % Floaters.POOL]
				placed += 1
				for o: Floaters._Item in f._items:
					if o == it or o.t >= minf(o.life, 0.6):
						continue
					var clear := (it.label.size.x + o.label.size.x) * 0.5 + 4.0 * HudStyle.PX
					if absf(o.at.x - it.at.x) < clear and absf(o.at.y - it.at.y) < it.label.size.y * 0.8 - 0.51:
						crowded += 1
			f._process(1.0 / 30.0)
		# every number fades before the next broadside
		f._process(3.0)
	f.queue_free()
	if crowded > 0:
		_fail("floaters: %d of %d numbers landed on top of another" % [crowded, placed])
	print("floaters: %d numbers in 32 bursts, stacked clear of one another" % placed)

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
	for loop: String in ["noise", "lap", "murmur"]:
		var w: AudioStreamWAV = load("res://audio/sfx/%s_0.wav" % loop)
		if w == null or w.loop_mode != AudioStreamWAV.LOOP_FORWARD:
			_fail("sound: %s doesn't loop" % loop)
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
	_check_ports(w)
	_check_festivals(w)
	_home_world = w
	_check_maps(w)
	_check_helm(w)
	_check_hazards(w)
	_check_haunt(w)
	_check_shore(w)
	_check_camps(w)
	_check_forts(w)


## Ashore: the planting's trunks and boulders and the towns as walls, a
## beach found off an island with dry sand past the boat, nobody wading out
## past their depth or through a palm, and a walker's stride, jump and
## landing all posed with finite joints.
func _check_shore(w: World) -> void:
	var t0 := Time.get_ticks_usec()
	var g := ShoreGround.new(w, w.regions)
	var steps := 0
	var ports := 0
	for r in w.regions:
		ports += r.ports.size()
	# (every trunk stands on its island, in both archipelagos)
	var dry := 0
	for cell: Array in g._solids.values():
		for o: Vector3 in cell:
			dry += 1 if w.ground_height(o.x, o.y) > -0.3 else 0
	steps += 1 if g.solid_count > 500 and dry > g.solid_count * 0.97 and g.towns.size() == ports * 4 else 0
	# a beach off the first island, from deep water out past its shore
	var isl: Dictionary = w.regions[0].islands[0]
	var beach := {}
	for j in 16:
		var a := j * TAU / 16.0 + 0.3
		var d := float(isl.r) * 0.6
		while d < float(isl.r) * 3.0 + 200.0 and w.ground_height(float(isl.x) + sin(a) * d, float(isl.z) + cos(a) * d) > -6.0:
			d += 4.0
		beach = g.landing(float(isl.x) + sin(a) * (d + 22.0), float(isl.z) + cos(a) * (d + 22.0), 70.0)
		if not beach.is_empty():
			break
	var landed := not beach.is_empty() and g.height(beach.sand_x, beach.sand_z) > 0.3 and g.height(beach.x, beach.z) > -0.5 and g.open(beach.sand_x, beach.sand_z)
	steps += 1 if landed else 0
	# walking straight back out to sea: stopped at wading depth
	var wade := landed
	if landed:
		var at := Vector2(beach.sand_x, beach.sand_z)
		for i in 300:
			at = g.step(at.x, at.y, -float(beach.dx) * 0.2, -float(beach.dz) * 0.2, 0.3)
		wade = g.height(at.x, at.y) >= -ShoreGround.WADE - 0.05
	steps += 1 if wade else 0
	# walking square into a trunk: round it, never through it
	var round_ := false
	var probe := Vector2(float(isl.x), float(isl.z))
	for k in 400:
		var near := g.solids_near(probe.x + (k % 20) * 6.0 - 60.0, probe.y + (k / 20) * 6.0 - 60.0)
		if near.is_empty():
			continue
		var o: Vector3 = near[0]
		if not g.open(o.x - 2.0, o.y):
			continue
		var at := Vector2(o.x - 2.0, o.y)
		var nearest := INF
		for i in 60:
			at = g.step(at.x, at.y, 0.08, 0.0, 0.3)
			nearest = minf(nearest, at.distance_to(Vector2(o.x, o.y)))
		round_ = nearest >= o.z + 0.3 - 0.02
		break
	steps += 1 if round_ else 0
	# a stride, a jump and the landing, posed
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var wk := ShoreWalker.new(ShoreWalker.Team.PARTY, CrewLook.make(false, true, false, rng), 0, 120.0)
	wk.place(0.0, 0.0, 0.4)
	var finite := true
	var air := 0.0
	var came_down := 0.0
	for f in 120:
		wk.stride = 4.2
		wk.phase += 4.2 / 60.0 / wk.step_len() * PI
		if f == 40:
			wk.jump()
		wk.tick(1.0 / 60.0)
		wk.animate(1.0 / 60.0, f / 60.0, 0.5)
		came_down = maxf(came_down, wk.fly(1.0 / 60.0, 0.0))
		wk.place3(0.0)
		air = maxf(air, wk.air)
		for v in wk.pose:
			finite = finite and is_finite(v)
		finite = finite and wk.xf.origin.is_finite() and wk.xf.basis.x.is_finite()
	steps += 1 if finite and air > 0.5 and air < 1.0 and came_down > 3.0 else 0
	if steps != 5:
		_fail("shore: %d of 5 steps (%d solids, %d on dry ground, %d town walls for %d ports; beach %s; wade %s; round a trunk %s; posed %s, %.2f m aloft, down at %.1f m/s)" % [
				steps, g.solid_count, dry, g.towns.size(), ports, "found" if landed else "none", wade, round_, finite, air, came_down])
	print("shore: %d of 5 steps as expected; %d trunks and boulders, %d town walls, a beach on %s; %.0f ms" % [steps, g.solid_count, g.towns.size(), isl.name, (Time.get_ticks_usec() - t0) / 1000.0])


## The cutthroat camps: nine to an archipelago, each built with its gang
## round the fire; then a landing party set down by the first and the camp
## fought to a rout (the captain swinging at whoever's nearest, the hands
## at his back), and its chest thrown open.
func _check_camps(w: World) -> void:
	var t0 := Time.get_ticks_usec()
	var sea := World.new()
	sea.regions = w.regions
	sea.wind = Wind.new(0.6)
	sea.waves = Waves.new(0.6)
	var fx := Particles.new()
	root.add_child(fx)
	# (the tree isn't running yet: lay out its buffer by hand)
	if not fx.is_node_ready():
		fx._ready()
	sea.fx = fx
	var crew: Node3D = load("res://src/ships/crew.gd").new()
	var g := ShoreGround.new(sea, sea.regions)
	# (loaded, not named: the shore draws through the crews, which read Settings)
	var shore_gd: GDScript = load("res://src/shore/shore.gd")
	var shore: Node3D = shore_gd.new(g, crew, StandardMaterial3D.new(), sea.regions)
	root.add_child(shore)
	var steps := 0
	var want := 0
	for r in sea.regions:
		want += r.camps.size()
	var gangs := 0
	var bosses := 0
	var sane := true
	for c: Variant in shore.camps:
		gangs += c.gang.size()
		sane = sane and c.gang.size() >= 3 and c.gang.size() <= 6 and c.chest != null
		for f: ShoreWalker in c.gang:
			bosses += 1 if f.max_hp > 100.0 else 0
	steps += 1 if shore.camps.size() == want and want >= 18 and sane else 0
	# a landing party set down a stone's throw from the first camp, the gang roused
	var c0: Variant = shore.camps[0]
	var cx := float(c0.site.x)
	var cz := float(c0.site.z)
	var a := float(c0.site.yaw)
	var sx := cx + sin(a) * 10.0
	var sz := cz + cos(a) * 10.0
	if not g.open(sx, sz):
		for k in 24:
			var b := k * TAU / 24.0
			if g.open(cx + sin(b) * 10.0, cz + cos(b) * 10.0):
				sx = cx + sin(b) * 10.0
				sz = cz + cos(b) * 10.0
				break
	var ship := Ship.create(ShipClass.named("sloop"), Livery.named("player"), sea)
	var d := Vector2(cx - sx, cz - sz).normalized()
	shore.land(ship, {"x": sx - d.x * 3.0, "z": sz - d.y * 3.0, "dx": d.x, "dz": d.y, "sand_x": sx, "sand_z": sz, "island": c0.island}, sea)
	var steer: Variant = shore_gd.Steer.new()
	var alarmed := [false]
	var routed := [false]
	var plundered := [false]
	var fell := [false]
	shore.alarmed.connect(func(_c: Variant) -> void: alarmed[0] = true)
	shore.camp_routed.connect(func(_c: Variant) -> void: routed[0] = true)
	shore.plundered.connect(func(_c: Variant) -> void: plundered[0] = true)
	shore.captain_fell.connect(func() -> void: fell[0] = true)
	var dt := 1.0 / 30.0
	var t := 0.0
	var finite := true
	var swings := 0
	while t < 150.0 and not routed[0] and not fell[0]:
		var cap: ShoreWalker = shore.captain
		var near: ShoreWalker = null
		var nd := INF
		for f: ShoreWalker in c0.gang:
			var fd := Vector2(f.x - cap.x, f.z - cap.z).length()
			if f.alive() and not f.is_down() and fd < nd:
				nd = fd
				near = f
		steer.mx = 0.0
		steer.mz = 0.0
		steer.strike = false
		steer.has_aim = near != null
		if near != null:
			steer.aim = Vector2(near.x, near.z)
			if nd > 1.7:
				steer.mx = (near.x - cap.x) / nd
				steer.mz = (near.z - cap.z) / nd
				steer.run = nd > 6.0
			else:
				steer.strike = true
				swings += 1
			steer.pistol = nd < 12.0 and shore.pistol_load() >= 1.0
		shore.update(dt, sea, steer, Vector3(cap.x, cap.y, cap.z))
		sea.time += dt
		for m: Variant in shore.party:
			finite = finite and m.walker.xf.origin.is_finite()
		t += dt
	steps += 1 if alarmed[0] and routed[0] and not fell[0] and finite else 0
	# the chest: walk to it and throw it open
	if routed[0]:
		var at: Vector3 = c0.layout.chest
		for k in 600:
			var cap: ShoreWalker = shore.captain
			var v := Vector2(at.x - cap.x, at.z - cap.z)
			if v.length() < 1.6:
				break
			steer.mx = v.normalized().x
			steer.mz = v.normalized().y
			steer.strike = false
			steer.pistol = false
			shore.update(dt, sea, steer, Vector3(cap.x, cap.y, cap.z))
		var pr: Dictionary = shore.prompt("Sloop")
		if pr.is_empty() or str(pr.key) != "chest":
			# (wedged on a crate or the tent: the chest is the point here, not the path)
			var fire := Vector2(cx, cz)
			var off := (fire - Vector2(at.x, at.z)).normalized() * 1.3
			shore.captain.place(at.x + off.x, at.z + off.y, 0.0)
			shore.update(dt, sea, shore_gd.Steer.new(), Vector3(at.x, at.y, at.z))
			pr = shore.prompt("Sloop")
		if not pr.is_empty() and str(pr.key) == "chest":
			shore.interact()
	steps += 1 if plundered[0] else 0
	if steps != 3:
		var down := 0
		for f: ShoreWalker in c0.gang:
			down += 1 if not f.alive() else 0
		_fail("camps: %d of 3 steps (%d camps of %d, gangs sane %s; roused %s, routed %s after %.0f s, %d of %d down, captain %s at %.0f hp, finite %s; plundered %s, chest prompt %s)" % [
				steps, shore.camps.size(), want, sane, alarmed[0], routed[0], t, down, c0.gang.size(), "fell" if fell[0] else "standing", shore.captain.hp, finite, plundered[0], shore.prompt("Sloop")])
	print("camps: %d of 3 steps as expected; %d camps, %d cutthroats (%d bosses); the first routed in %.0f s of %d swings, captain at %.0f hp; %.0f ms" % [
			steps, shore.camps.size(), gangs, bosses, t, swings, shore.captain.hp, (Time.get_ticks_usec() - t0) / 1000.0])
	shore.leave()
	shore.free()
	crew.free()
	fx.free()


## The forts: five of them (three at home, two in Las Brumas), each in
## budget; its plaza floor to walk on; a ball on its sea wall struck and one
## over it flown past; marks on the water for her gunnery to lay on; its guns
## firing on a ship that closes and hitting her; battered silent by her shot
## (each gun's parapet down, the towers after the last); then taken and
## held, its gaps patched and its guns turned on pirates.
func _check_forts(w: World) -> void:
	var t0 := Time.get_ticks_usec()
	var sea := World.new()
	sea.regions = w.regions
	sea.wind = Wind.new(0.6)
	sea.waves = Waves.new(0.6)
	var fx := Particles.new()
	root.add_child(fx)
	if not fx.is_node_ready():
		fx._ready()
	sea.fx = fx
	var shots := Shots.new()
	shots.world = sea
	root.add_child(shots)
	if not shots.is_node_ready():
		shots._ready()
	sea.shots = shots
	# (the misses' rings on the water, kept and never drawn)
	sea.wake = WakeField.new()
	sea.wake._sx.resize(WakeField.MAX_STAMPS)
	sea.wake._sz.resize(WakeField.MAX_STAMPS)
	sea.wake._sr.resize(WakeField.MAX_STAMPS)
	sea.wake._ss.resize(WakeField.MAX_STAMPS)
	sea.wake._sk.resize(WakeField.MAX_STAMPS)
	var g := ShoreGround.new(sea, sea.regions)
	# (loaded, not named: the forts' garrisons are the shore's, which reads Settings)
	var forts: Node3D = load("res://src/game/forts.gd").new(sea, g, sea.regions, StandardMaterial3D.new())
	root.add_child(forts)
	sea.forts = forts
	var steps := 0
	var tris := PackedInt32Array()
	var budget := true
	var names := []
	for f: Variant in forts.forts:
		tris.append(f.tris)
		names.append(f.name)
		budget = budget and f.tris > 2000 and f.tris <= FORT_TRIS and f.guns.size() >= 3
	steps += 1 if forts.forts.size() == 5 and budget and names.has("Fortaleza da Bruma") else 0
	var f0: Variant = forts.forts[0]
	var site: Dictionary = f0.site
	var S: Dictionary = f0.style
	var H := float(S.H)
	var yaw := float(site.yaw)
	var sea_dir := Vector2(sin(yaw), cos(yaw))
	# the plaza is floor (its own height, level), the ramp climbs to the gate
	var mid := FortKit.to_world(site, 2.0, 1.0)
	var foot := FortKit.to_world(site, 0.0, -H - float(f0.layout.ramp_len) + 0.5)
	var floor_ok := absf(g.height(mid.x, mid.z) - float(site.y)) < 1e-3 and g.slope(mid.x, mid.z) == 0.0 and g.height(foot.x, foot.z) < float(site.y) - 0.3
	steps += 1 if floor_ok else 0
	# a ball on the sea wall's face is stopped; one high over the plaza flies on
	var face := FortKit.to_world(site, 0.0, H - 0.2)
	var hit_wall: bool = forts.strike(Vector3(face.x, float(site.y) + float(S.WH) * 0.5, face.z), Vector3(-sea_dir.x, 0.0, -sea_dir.y) * 60.0, 10.0, null, Ammo.ROUND)
	var over: bool = forts.strike(Vector3(float(site.x), float(site.y) + 30.0, float(site.z)), Vector3(0.0, -5.0, 60.0), 10.0, null, Ammo.ROUND)
	steps += 1 if hit_wall and not over else 0
	# her gunnery has a mark on the water for each live gun in reach
	var ship := Ship.create(ShipClass.named("sloop"), Livery.named("player"), sea)
	ship.pos = Vector3(float(site.x) + sea_dir.x * 150.0, 0.0, float(site.z) + sea_dir.y * 150.0)
	ship.heading = yaw + PI * 0.5
	ship.transform = Transform3D(Basis(Vector3.UP, ship.heading), ship.pos)
	sea.ships.append(ship)
	var marks: Array[Vector3] = forts.marks(ship, ship.gun_range())
	steps += 1 if not marks.is_empty() and marks.size() <= f0.guns.size() else 0
	# the guns lay on her, fire, and hit her
	var opened := [false]
	var hits := [0]
	forts.open_fire.connect(func(_f: Variant) -> void: opened[0] = true)
	sea.hit.connect(func(s: Ship, by: Ship, _d: float, _at: Vector3) -> void:
		if s == ship and by == f0.gunner:
			hits[0] += 1)
	var dt := 1.0 / 30.0
	var t := 0.0
	var fired_before := shots.fired[Ammo.ROUND]
	while t < 40.0 and hits[0] < 2:
		forts.update(dt, ship, ship.pos)
		shots.step(dt)
		sea.time += dt
		t += dt
	var fired := shots.fired[Ammo.ROUND] - fired_before
	steps += 1 if opened[0] and fired >= 2 and hits[0] >= 1 else 0
	# battered silent: every gun's parapet down, the towers and the roof after the last
	var silent := [0, false]
	forts.silenced.connect(func(_f: Variant, _g: Variant, last: bool) -> void:
		silent[0] += 1
		silent[1] = silent[1] or last)
	var shells := 0
	for k in 60:
		for gn: Variant in f0.guns:
			if gn.dead:
				continue
			var at: Vector3 = gn.base + Vector3(0.0, 0.75, 0.0)
			if forts.strike(at, Vector3(-sea_dir.x, -0.1, -sea_dir.y) * 60.0, 60.0, ship, Ammo.SHELL):
				shells += 1
	for k in 300:
		forts.update(dt, ship, ship.pos)
	var wrecked: bool = silent[1] and silent[0] == f0.guns.size() and f0.down.has("gun0") and f0.down.has("tower0") and f0.down.has("roof") and f0.pocks.visible_instance_count > 0
	steps += 1 if wrecked else 0
	# taken: her colours flying, patched, its guns hers
	forts.conquer(f0)
	forts.apply({f0.id: 1.0})
	var held: bool = f0.ours and f0.gunner.team == Ship.Team.PLAYER and f0.patched.has("gun0") and f0.down.has("tower0") and forts.live_count(f0) == f0.guns.size() and forts.covering(ship.pos.x, ship.pos.z) == null
	steps += 1 if held else 0
	if steps != 7:
		_fail("forts: %d of 7 steps (%d forts %s, triangles %s; plaza floor %s; wall struck %s, over it %s; %d marks; opened fire %s, %d balls, %d hits on her in %.0f s; %d silenced, last %s, down %s, %d scars from %d shells; held %s)" % [
				steps, forts.forts.size(), names, tris, floor_ok, hit_wall, over, marks.size(), opened[0], fired, hits[0], t, silent[0], silent[1], f0.down.keys(), f0.pocks.visible_instance_count, shells, held])
	print("forts: %d of 7 steps as expected; %s, %s triangles; the first fired %d balls, %d hits in %.0f s, silenced by %d shells; %.0f ms" % [
			steps, names, tris, fired, hits[0], t, shells, (Time.get_ticks_usec() - t0) / 1000.0])
	forts.free()
	shots.free()
	fx.free()
	ship.free()
	sea.wake.free()


## The sea's dangers: every maelstrom turning (three at home, one in Las
## Brumas, each its own way), its water falling away into a throat and the
## swell stilled over it, the current carrying a hull round and in, the way
## out given only inside its pull, and a galleon warned of the coral across
## her bow.
func _check_hazards(w: World) -> void:
	var t0 := Time.get_ticks_usec()
	var hz := Hazards.new(w)
	var steps := 0
	var names := hz.maelstroms.map(func(m: Dictionary) -> String: return str(m.name))
	steps += 1 if hz.maelstroms.size() == 4 and w.vortices.size() == 4 and names.has("Sorvedouro da Bruma") and hz.reefs.size() > 0 else 0
	# the water: deepest at the eye, nothing past the rim, falling all the way in; the swell stilled
	var shape := true
	for m in hz.maelstroms:
		var v: Vortex = m.v
		var was := -1.0
		for i in range(20, -1, -1):
			var d := v.dip(v.x + v.r * i / 20.0, v.z)
			shape = shape and d >= was - 1e-4
			was = d
		shape = shape and v.dip(v.x + v.r * 1.01, v.z) == 0.0 and absf(v.dip(v.x, v.z) - Vortex.depth(v.r, v.k)) < 0.5
		shape = shape and v.calm(v.x, v.z) < 0.5 and v.calm(v.x + v.r, v.z) > 0.99
		shape = shape and absf(w.funnel_at(v.x + v.r * 0.3, v.z) - v.dip(v.x + v.r * 0.3, v.z)) < 1e-3
	steps += 1 if shape else 0
	# the current: round the way it turns and in toward the eye; the way out only inside its pull
	var flow := true
	for m in hz.maelstroms:
		var v: Vortex = m.v
		for a: float in [0.0, 1.3, 2.9, 4.4]:
			var rx := cos(a)
			var rz := sin(a)
			var f := hz.flow_at(v.x + rx * v.r * 0.5, v.z + rz * v.r * 0.5)
			var round_ := (-rz * f.x + rx * f.y) * v.dir
			var inward := -(rx * f.x + rz * f.y)
			flow = flow and round_ > 2.0 and inward > 0.3 and signf(f.z) == -signf(v.dir)
		flow = flow and not is_nan(hz.escape(v.x + v.r * 0.5, v.z)) and is_nan(hz.escape(v.x + v.r * 1.2, v.z))
		flow = flow and hz.vortex_at(v.x + v.r, v.z, 1.25) and not hz.vortex_at(v.x + v.r * 1.5, v.z, 1.25)
	steps += 1 if flow else 0
	# coral across a galleon's bow: the leadsman sees it coming
	var rf: Dictionary = hz.reefs[0] if not hz.reefs.is_empty() else {}
	var shoal := Vector2(-1.0, 0.0)
	if not rf.is_empty():
		var g := Ship.create(ShipClass.named("galleon"), Livery.named("player"), w)
		# (set there, not placed: this world has no swell to float her on)
		g.pos = Vector3(float(rf.x), 0.0, float(rf.z) - float(rf.r) - 40.0)
		g.heading = 0.0
		shoal = hz.shoal_ahead(g, 160.0)
		g.free()
	steps += 1 if shoal.x >= 0.0 and shoal.y < ShipClass.named("galleon").draft else 0
	if steps != 4:
		_fail("hazards: only %d of 4 steps as expected (%s; shape %s, flow %s, shoal %s)" % [steps, names, shape, flow, shoal])
		return
	print("hazards: 4 of 4 steps as expected; %s, %d reefs, a galleon warned of %s %.0f m ahead (%.1f m of water), checked in %.0f ms" % [", ".join(names), hz.reefs.size(), rf.name, shoal.x, shoal.y, (Time.get_ticks_usec() - t0) / 1000.0])


## The event ships: Hallowtide's season on the calendar (wrapping nothing,
## its last day in), and the Hollow Jack's Phantom Run: nothing touches her
## while she's over, a brig at her side takes the Banshee's Wail when she's
## back (worse than one farther off, her gun crews cut down), and the power
## sleeps till its rest is out.
func _check_haunt(w: World) -> void:
	var t0 := Time.get_ticks_usec()
	var steps := 0
	var day := func(m: int, d: int) -> int: return Time.get_unix_time_from_datetime_dict({"year": 2026, "month": m, "day": d, "hour": 12})
	var was := ShipEvents.force
	ShipEvents.force = -1
	steps += 1 if ShipEvents.ship_on("revenant", day.call(10, 31)) and ShipEvents.ship_on("revenant", day.call(11, 8)) \
			and not ShipEvents.ship_on("revenant", day.call(11, 9)) and not ShipEvents.ship_on("revenant", day.call(7, 1)) \
			and not ShipEvents.ship_on("sloop", day.call(10, 31)) and ShipEvents.last_day("hallowtide") == "8 Nov" else 0
	ShipEvents.force = was
	var sea := World.new()
	sea.regions = w.regions
	sea.wind = Wind.new(0.6)
	sea.waves = Waves.new(0.6)
	var fx := Particles.new()
	root.add_child(fx)
	if not fx.is_node_ready():
		fx._ready()
	sea.fx = fx
	var jack := Ship.create(ShipClass.named("revenant"), Livery.named("player"), sea)
	var near := Ship.create(ShipClass.named("brig"), Livery.named("player"), sea, Ship.Team.PIRATE)
	var far := Ship.create(ShipClass.named("brig"), Livery.named("player"), sea, Ship.Team.PIRATE)
	for s: Ship in [jack, near, far]:
		root.add_child(s)
		sea.ships.append(s)
	jack.pos = Vector3(0.0, 0.0, 0.0)
	near.pos = Vector3(25.0, 0.0, 0.0)
	far.pos = Vector3(0.0, 0.0, 66.0)
	far.crew_hit = 1.0
	var h := jack.haunt
	var called := h != null and h.call_up()
	var hp := jack.hp
	var untouched := called and jack.phantom and jack.damage(500.0, near) == 0.0 and not jack.ignite(near) and jack.hp == hp
	for i in 30:
		h.update(1.0 / 30.0)
	untouched = untouched and h.phantom > 0.95 and jack.phantom
	steps += 1 if untouched else 0
	var hp_near := near.hp
	var hp_far := far.hp
	for i in int((Haunt.SPAN + Haunt.WAIL_T) * 30.0) + 10:
		h.update(1.0 / 30.0)
	var hurt_near := hp_near - near.hp
	var hurt_far := hp_far - far.hp
	steps += 1 if not jack.phantom and h.phantom == 0.0 and hurt_near > hurt_far and hurt_far > 0.0 and near.crew_hit > 0.0 else 0
	var resting := h.state == Haunt.RESTING and not h.call_up() and h.ready01() < 0.1
	for i in int(Haunt.REST * 10.0) + 2:
		h.update(0.1)
	steps += 1 if resting and h.state == Haunt.READY and h.can_call() else 0
	for s: Ship in [jack, near, far]:
		s.free()
	fx.free()
	if steps != 4:
		_fail("haunt: only %d of 4 steps as expected (called %s, untouched %s, wail %.0f near / %.0f far, resting %s)" % [steps, called, untouched, hurt_near, hurt_far, resting])
		return
	print("haunt: 4 of 4 steps as expected; the wail took %.0f off a brig alongside and %.0f off one %.0f m off, checked in %.0f ms" % [hurt_near, hurt_far, 66.0, (Time.get_ticks_usec() - t0) / 1000.0])


## The helmsman's waters (SeaNav), laid out for a sloop and a galleon: a
## course round an isle, one across the high seas to Las Brumas, a goal on
## land moved off it onto open water and one past the edge of the known sea
## brought back inside, every leg in water deeper than her keel needs; and
## the pill's times as the web writes them.
func _check_helm(w: World) -> void:
	var t0 := Time.get_ticks_usec()
	var steps := 0
	var soundings := []
	var centres := PackedVector2Array()
	for r in w.regions:
		soundings.append(SeaNav.Soundings.take(r))
		centres.append(Vector2(r.centre.x, r.centre.z))
	var helm: GDScript = load("res://src/game/helmsman.gd")
	var isl: Dictionary = w.regions[0].islands[0]
	var ix := float(isl.x)
	var iz := float(isl.z)
	var ir := float(isl.r)
	var brumas := Vector2(w.regions[1].centre.x, w.regions[1].centre.z)
	for id: String in ["sloop", "galleon"]:
		var cls := ShipClass.named(id)
		var nav := SeaNav.build(soundings, centres, cls.draft, helm.hard_reach(cls))
		var deep := cls.draft + 1.0
		# (the shoalest water along a course's legs, sounded every 2 m)
		var shoal := func(c: Dictionary) -> float:
			var xs: PackedVector2Array = c.xs
			var top := -INF
			for i in range(1, xs.size()):
				var n := maxi(1, ceili(xs[i - 1].distance_to(xs[i]) / 2.0))
				for k in n + 1:
					var p := xs[i - 1].lerp(xs[i], k / float(n))
					top = maxf(top, w.ground_height(p.x, p.y))
			return top
		var round_isle := nav.plot(ix - ir - 150.0, iz, ix + ir + 150.0, iz)
		var across := nav.plot(40.0, 210.0, brumas.x, brumas.y)
		var ashore := nav.plot(40.0, 210.0, ix, iz)
		var beyond := nav.plot(40.0, 210.0, -3000.0, 3500.0)
		var bad := []
		if round_isle.is_empty() or (round_isle.xs as PackedVector2Array).size() < 3 or shoal.call(round_isle) > -deep:
			bad.append("round %s: %s" % [isl.name, "no course" if round_isle.is_empty() else "%d legs, %.1f m at the shoalest" % [(round_isle.xs as PackedVector2Array).size() - 1, -shoal.call(round_isle)]])
		if across.is_empty() or across.short or float(across.rest[0]) < 6800.0 or float(across.rest[0]) > 9500.0 or shoal.call(across) > -deep:
			bad.append("to Las Brumas: %s" % ("no course" if across.is_empty() else "%.0f m, short %s, %.1f m at the shoalest" % [across.rest[0], across.short, -shoal.call(across)]))
		if ashore.is_empty() or (ashore.goal as Vector2).distance_to(Vector2(ix, iz)) < ir * 0.3 or w.ground_height(ashore.goal.x, ashore.goal.y) > -deep or shoal.call(ashore) > -deep:
			bad.append("for %s's heart: %s" % [isl.name, "no course" if ashore.is_empty() else "goal %s, %.1f m deep" % [ashore.goal, -w.ground_height(ashore.goal.x, ashore.goal.y)]])
		if beyond.is_empty() or w.past_edge(beyond.goal.x, beyond.goal.y).z > -60.0:
			bad.append("past the edge: %s" % ("no course" if beyond.is_empty() else "goal %s, %.0f m past it" % [beyond.goal, w.past_edge(beyond.goal.x, beyond.goal.y).z]))
		if bad.is_empty():
			steps += 1
		else:
			_fail("helm: the %s's courses: %s" % [id, "; ".join(bad)])
	var pill: GDScript = load("res://src/ui/helm_pill.gd")
	var eta := {-1.0: "", 7.0: "~10 s", 24.0: "~20 s", 25.0: "~30 s", 49.0: "~50 s", 50.0: "~1 min", 90.0: "~2 min", 3599.0: "~1 h 0 min", 7260.0: "~2 h 1 min"}
	var said := []
	for t: float in eta:
		if pill.eta(t) != eta[t]:
			said.append("%s for %d s" % [pill.eta(t), t])
	if said.is_empty() and is_equal_approx(helm.hard_reach(ShipClass.named("sloop")), 25.05):
		steps += 1
	else:
		_fail("helm: times read %s, a sloop's room %.2f m" % [", ".join(said), helm.hard_reach(ShipClass.named("sloop"))])
	print("helm: %d of 3 steps as expected; courses plotted in %.0f ms" % [steps, (Time.get_ticks_usec() - t0) / 1000.0])


## The trading ports: the web's own numbers (Mulberry32) and every market's
## prices to the coin at any hour; and each of the six towns built, inside
## its budget, with a galleon's berth and her way out to sea afloat.
func _check_ports(w: World) -> void:
	var t0 := Time.get_ticks_usec()
	var steps := 0
	# (loaded, not named: the towns plant the isles' palms, as flora.gd above)
	var town: GDScript = load("res://src/port/trade_port.gd")
	var figure: GDScript = load("res://src/port/figure.gd")
	var specs: Array = town.SPECS
	# the first draws of the web's generator (src/core/rng.ts)
	var draws := true
	for e: Array in [[1000, 0.795194907], [1097, 0.885539711], [31, 0.672256116], [77, 0.425601356], [1, 0.627073941]]:
		var got := Mulberry32.new(e[0]).next()
		if absf(got - float(e[1])) > 1e-8:
			draws = false
			_fail("ports: Mulberry32(%d) draws %.9f, not the web's %.9f" % [e[0], got, e[1]])
	steps += 1 if draws else 0
	# eight goods in each town at four hours, as the web's Market prices them
	var ids := ["rum", "silver", "emeralds", "portrait", "crown", "cider", "krakenBeak", "tea"]
	var hours := [0.0, 37.5, 600.0, 4321.25]
	var web := [[34, 72, 244, 282, 1894, 23, 3060, 112], [27, 73, 370, 315, 3314, 19, 3575, 56],
			[25, 62, 249, 408, 2904, 15, 4729, 71], [41, 70, 225, 228, 2084, 33, 3557, 91],
			[43, 70, 313, 318, 2614, 30, 3309, 87], [27, 59, 369, 397, 2628, 19, 5476, 72]]
	var priced := true
	for i in specs.size():
		var spec: Dictionary = specs[i]
		var m := Treasure.Market.new(spec.taste, "", i * 17 + 3)
		for j in ids.size():
			var t: float = hours[(i + j) % hours.size()]
			if m.price(ids[j], t) != int(web[i][j]):
				priced = false
				_fail("ports: %s pays %d for %s at %.2f s, the web %d" % [spec.name, m.price(ids[j], t), ids[j], t, web[i][j]])
	steps += 1 if priced else 0
	# the towns, as the game builds them
	var arts: RefCounted = town.Arts.new()
	var sites: Array[Dictionary] = []
	for r in w.regions:
		for p: Dictionary in r.ports:
			if not p.home:
				sites.append(p)
	if sites.size() != specs.size():
		_fail("ports: %d market sites in the world bake, not %d" % [sites.size(), specs.size()])
	var galleon := ShipClass.named("galleon")
	var near := 0
	var far := 0
	var built := true
	for i in mini(sites.size(), specs.size()):
		var rnd := Mulberry32.new(1000 + i * 97)
		var styles: Array[Dictionary] = []
		for role: String in town.ROLES:
			styles.append(figure.style_for(role, rnd, specs[i]))
		var port: Node3D = town.new()
		port.setup(sites[i], i, arts, w, styles)
		var tris: Vector2i = port.tris
		near = maxi(near, tris.x)
		far = maxi(far, tris.y)
		var b: Vector3 = port.berth(galleon.beam)
		var c: Vector3 = port.cast_off(galleon.beam)
		var bottom := minf(-w.ground_height(b.x, b.y), -w.ground_height(c.x, c.y))
		if tris.x <= 0 or tris.x > TOWN_TRIS or tris.y <= 0 or tris.y > TOWN_SHELL_TRIS:
			built = false
			_fail("ports: %s built %d triangles close up and %d as a shell (budgets %d, %d)" % [port.title, tris.x, tris.y, TOWN_TRIS, TOWN_SHELL_TRIS])
		if port.fest_tris <= 0 or port.fest_tris > FEAST_TRIS:
			built = false
			_fail("ports: %s's feast-night dressing has %d triangles (budget %d)" % [port.title, port.fest_tris, FEAST_TRIS])
		if bottom < galleon.draft + 1.0:
			built = false
			_fail("ports: a galleon at %s's quay has %.1f m under her keel" % [port.title, bottom - galleon.draft])
		if not port.in_reach(Vector3(c.x, 0.0, c.y)):
			built = false
			_fail("ports: casting off from %s leaves her out of its reach" % port.title)
		port.free()
	steps += 1 if built else 0
	print("ports: %d of 3 steps as expected; %d towns, at most %d triangles close up and %d as a shell, built in %.0f ms" % [
			steps, sites.size(), near, far, (Time.get_ticks_usec() - t0) / 1000.0])


## Puerto Marézia, the home port, as the game builds it: on a worker,
## within its triangle budget; a galleon alongside with water enough under
## her keel from bow to stern, her flag flying on the loft's pole; its dozen
## folk dressed, about their business for five seconds with nothing thrown
## out of place, and drawn with the crews; and her look on the awning, the
## bunting and the painter's bucket, each repainted only when its own
## colours change.
func _check_home_port(w: World) -> void:
	var t0 := Time.get_ticks_usec()
	var steps := 0
	var site := {}
	for r in w.regions:
		for p: Dictionary in r.ports:
			if p.home:
				site = p
	if site.is_empty():
		_fail("home: no home port in the world bake")
		return
	var sea := World.new()
	sea.regions = w.regions
	sea.wind = Wind.new(0.6)
	sea.waves = Waves.new(0.6)
	# (in the tree: its buffer is laid out when it's ready)
	var fx := Particles.new()
	root.add_child(fx)
	sea.fx = fx
	# (loaded, not named: the crews read Settings)
	var crew: Node3D = load("res://src/ships/crew.gd").new()
	var town: GDScript = load("res://src/port/trade_port.gd")
	var port: Node3D = load("res://src/port/home_port.gd").new()
	port.setup(site, town.Arts.new(), sea, crew)
	var title: String = port.title
	root.add_child(port)
	# built on a worker, as the harbour has it built a moment after it opens
	port.build_soon(0.0)
	var waited := 0
	while not port.built and waited < 30000:
		port.prepare(0.0)
		OS.delay_msec(5)
		waited += 5
	var tris: int = port.tris
	if not port.built:
		_fail("home: %s wasn't built on its worker in 30 s" % title)
	elif tris <= 0 or tris > HOME_TRIS:
		_fail("home: %s built %d triangles (budget %d)" % [title, tris, HOME_TRIS])
	else:
		steps += 1
	var built_ms := waited
	# a galleon alongside, as the Shipwright ties her up
	var g := Ship.create(ShipClass.named("galleon"), Livery.named("player"), sea)
	root.add_child(g)
	var look := ShipLook.preset(3)
	port.show_port(look, g)
	var b: Vector3 = port.berth(g.cls.beam)
	g.place(b.x, b.y, b.z)
	var shallow := INF
	for f: float in [-0.5, -0.25, 0.0, 0.25, 0.5]:
		for side: float in [-0.5, 0.5]:
			var at := Vector3(b.x, 0.0, b.y) + g.forward() * g.cls.length * f + g.port_dir() * g.cls.beam * side
			shallow = minf(shallow, -sea.ground_height(at.x, at.z))
	var flag: MeshInstance3D = port._flag
	if shallow < g.cls.draft + 1.0:
		_fail("home: a galleon at %s's quay has %.1f m under her keel" % [title, shallow - g.cls.draft])
	elif flag.material_override != g.model.shared_material("flag"):
		_fail("home: the loft's pole doesn't fly her flag")
	else:
		steps += 1
	# five seconds of the quay's day: everyone where they should be, all drawn
	var sound := true
	for i in 300:
		port.pin(g)
		port.update(1.0 / 60.0)
	for fig: Variant in port.figures:
		var o: Vector3 = (port.xf * fig.body_xf()).origin
		if not (is_finite(o.x) and is_finite(o.y) and is_finite(o.z)) or o.y < -2.0 or o.y > 20.0:
			sound = false
			_fail("home: a townsperson is thrown out to (%.1f, %.1f, %.1f)" % [o.x, o.y, o.z])
			break
	var drawn := [0]
	var crowds: Array[Callable] = crew.crowds
	for c in crowds:
		c.call(func(_xf: Transform3D, _pose: PackedFloat32Array, _hat: int, _prop: int, _kit: Array[PackedInt32Array]) -> void:
			drawn[0] += 1)
	if drawn[0] != 12 or port.figures.size() != 12:
		sound = false
		_fail("home: %d of its %d folk drawn, not 12" % [drawn[0], port.figures.size()])
	steps += 1 if sound else 0
	# her look on the quay, repainted for its own colours only
	var awning: Mesh = port._awning.mesh
	var bunting: Mesh = port._bunting.mesh
	var tip: Mesh = port._brush_tip.mesh
	var renamed := look.duplicate(true)
	renamed.name = "Check"
	port.set_look(renamed)
	var kept: bool = port._awning.mesh == awning and port._bunting.mesh == bunting and port._brush_tip.mesh == tip
	var recut := renamed.duplicate(true)
	recut.sail.cloth = "#123456" if str(recut.sail.cloth) != "#123456" else "#654321"
	port.set_look(recut)
	var redone: bool = port._awning.mesh != awning and port._bunting.mesh == bunting and port._brush_tip.mesh == tip
	if awning == null or bunting == null or tip == null or not kept or not redone:
		_fail("home: her look's colours on the quay (made %s, kept %s, repainted %s)" % [awning != null and bunting != null and tip != null, kept, redone])
	else:
		steps += 1
	port.hide_port()
	port.free()
	g.free()
	fx.free()
	crew.free()
	print("home: %d of 4 steps as expected; %s, %d triangles, built on a worker in %d ms, a galleon alongside in %.1f m of water, checked in %.0f ms" % [
			steps, title, tris, built_ms, shallow, (Time.get_ticks_usec() - t0) / 1000.0])


## Progress, on a scratch file of its own: a save comes back whole; a save
## damaged or edited by hand is taken field by field, nothing malformed let
## in; a crash between writing the fresh copy and swapping it in loses
## nothing; and a fresh game starts from the harbour's defaults.
## The maps: the waypoints (at most five, each its own colour, armed once
## you've sailed off and struck off when you sail into one), the distances
## they're labelled with, the sea chart's geography against the web's own
## numbers (its noise bit for bit, its lane, rose, shoal and soundings), the
## chart's view (a spot to the canvas and back, a zoom keeping the spot under
## the finger, the sea kept on the chart) and its dashed lines broken as a
## canvas breaks them.
func _check_maps(w: World) -> void:
	var steps := 0
	# the waypoints keep themselves with your progress: a scratch copy meanwhile
	var prog: Node = root.get_node_or_null("Progress")
	if prog == null:
		_fail("maps: no Progress to keep the pins with")
		return
	var kept_path: String = prog.path
	var kept_pins: Array = prog.pins.duplicate(true)
	prog.path = "user://check-maps.json"
	# (loaded, not named: they read Progress, which a script this one names
	# compiles without)
	var pins: Node3D = load("res://src/game/waypoints.gd").new()
	pins.visible = false
	for i in 6:
		pins.add(100.0 * (i + 1), 0.0, Vector3.ZERO)
	var hues := {}
	for p: Variant in pins.pins:
		hues[p.hue] = true
	if pins.pins.size() == 5 and pins.pins[0].x == 200.0 and hues.size() == 5 and prog.pins.size() == 5 and prog.pins[0] == [200, 0, pins.pins[0].hue]:
		steps += 1
	else:
		_fail("maps: six pins dropped left %d standing (oldest at %s), %d colours, %d kept" % [pins.pins.size(), pins.pins[0].x if not pins.pins.is_empty() else -1.0, hues.size(), prog.pins.size()])
	var third: Variant = pins.near(305.0, -4.0, 26.0)
	if third != null and third.x == 300.0 and pins.number(third) == 2 and pins.near(250.0, 0.0, 26.0) == null:
		steps += 1
	else:
		_fail("maps: a tap by the second pin didn't find it")
	# one dropped under the ship waits till she's sailed off, then sailing in strikes it off
	pins.wipe()
	var pin: Variant = pins.add(10.0, 0.0, Vector3.ZERO)
	var early: Variant = pins.update(0.1, Vector3(14.0, 0.0, 0.0), null, Vector3.ZERO)
	pins.update(0.1, Vector3(100.0, 0.0, 0.0), null, Vector3.ZERO)
	var hit: Variant = pins.update(0.1, Vector3(20.0, 0.0, 6.0), null, Vector3.ZERO)
	if early == null and hit == pin and pins.pins.is_empty() and pin.reached and pin.gone >= 0.0:
		steps += 1
	else:
		_fail("maps: a pin under the ship was struck off %s, sailing back in %s" % ["at once" if early != null else "not at once", "struck it" if hit == pin else "missed it"])
	pins.add(-50.0, 40.0)
	pins.wipe()
	if pins.pins.is_empty() and prog.pins.is_empty():
		steps += 1
	else:
		_fail("maps: a wipe left pins standing")
	pins.free()
	prog.save()
	for f: String in [prog.path, prog.path + ".tmp"]:
		if FileAccess.file_exists(f):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(f))
	prog.path = kept_path
	prog.pins = kept_pins
	# the distances the pins are labelled with, as the web writes them
	var scene: GDScript = load("res://src/ui/map_scene.gd")
	var dist := {0.0: "0 m", 283.0: "280 m", 996.0: "1000 m", 1049.0: "1.0 km", 1120.0: "1.1 km", 9940.0: "9.9 km", 23400.0: "23 km"}
	var bad := []
	for m: float in dist:
		if scene.distance(m) != dist[m]:
			bad.append("%s for %d m" % [scene.distance(m), m])
	if bad.is_empty():
		steps += 1
	else:
		_fail("maps: distances read %s" % ", ".join(bad))
	# the chart's geography, against the web's own numbers (tools: node on src/ui/chart.ts)
	var art := ChartArt.new(w.regions)
	var near := func(a: float, b: float, tol: float) -> bool: return absf(a - b) <= tol
	var lane := art.lane()
	var cur := art.lane(330.0)
	var geo: bool = art.sea == Rect2(-1700.0, -4500.0, 10000.0, 6200.0) and near.call(art.max_zoom, 29.296875, 1e-6) \
			and near.call(art.rose.x, 4041.7657, 0.05) and near.call(art.rose.y, -291.6753, 0.05) and art.rose.z == 300.0 \
			and near.call(art.bank.x, 4321.2039, 0.05) and near.call(art.bank.y, -1735.8387, 0.05) \
			and lane.a.distance_to(Vector2(1058.669, -449.1323)) < 0.05 and lane.q.distance_to(Vector2(3503.0859, -921.2975)) < 0.05 \
			and lane.b.distance_to(Vector2(5541.331, -2350.8677)) < 0.05 and lane.u.distance_to(Vector2(0.92058178, -0.39054985)) < 1e-5 \
			and cur.a.distance_to(Vector2(1187.5505, -145.3403)) < 0.05 and cur.q.distance_to(Vector2(3651.2996, -571.9367)) < 0.05 \
			and cur.b.distance_to(Vector2(5670.2124, -2047.0757)) < 0.05
	if geo:
		steps += 1
	else:
		_fail("maps: the chart's sea %s, rose %s, shoal %s, lane %s %s %s" % [art.sea, art.rose, art.bank, lane.a, lane.q, lane.b])
	var noise := {Vector2(0.3, 0.7): 0.6083508325702471, Vector2(-3.25, 12.5): 0.4017994024496699,
			Vector2(17.9, -9.1): 0.7800817280147193, Vector2(-24.6, 44.2): 0.4766380195464571}
	var deep := {Vector2(3000.0, -1500.0): 0.6068891884104751, Vector2(4200.0, 600.0): 0.8949079718085009,
			Vector2(-1500.0, -2000.0): 0.7509545250952342, Vector2(5000.0, -1200.0): 0.5975958328072973}
	var sea_ok: bool = near.call(art.edge(3000.0, -1500.0), -1490.7768677556235, 0.01) and near.call(art.edge(9000.0, -4000.0), 983.2815729997478, 0.01)
	for at: Vector2 in noise:
		# (the lattice points as the web's doubles: Vector2 holds them a touch off)
		var x := snappedf(at.x, 0.01)
		var z := snappedf(at.y, 0.01)
		sea_ok = sea_ok and near.call(ChartArt.vnoise(x, z), noise[at], 1e-6)
	for at: Vector2 in deep:
		sea_ok = sea_ok and near.call(art.depth(at.x, at.y), deep[at], 1e-4)
	if sea_ok:
		steps += 1
	else:
		_fail("maps: the open sea's depths aren't the web's (noise %.9f, depth %.6f, edge %.3f)" % [ChartArt.vnoise(0.3, 0.7), art.depth(3000.0, -1500.0), art.edge(3000.0, -1500.0)])
	var fathoms := 0.0
	for s in art.soundings:
		fathoms += s.z
	var sd := art.soundings
	if sd.size() == 55 and fathoms == 23414.0 and Vector2(sd[0].x, sd[0].y).distance_to(Vector2(-1005.3429, -933.8859)) < 0.05 and sd[0].z == 37.0 \
			and Vector2(sd[1].x, sd[1].y).distance_to(Vector2(3910.4459, -591.629)) < 0.05 and sd[1].z == 707.0 \
			and Vector2(sd[2].x, sd[2].y).distance_to(Vector2(5550.8223, -3787.9724)) < 0.05 and sd[2].z == 63.0 \
			and Vector2(sd[54].x, sd[54].y).distance_to(Vector2(4322.754, -3508.7944)) < 0.05 and sd[54].z == 1490.0:
		steps += 1
	else:
		_fail("maps: %d soundings, %.0f fathoms in all, the first %s (the web's: 55, 23414, (-1005.3, -933.9, 37))" % [sd.size(), fathoms, sd[0] if not sd.is_empty() else null])
	# the chart's view: a spot to the canvas and back, a zoom about the finger, the sea kept on it
	var chart: CanvasLayer = load("res://src/ui/sea_chart.gd").new()
	chart.art = art
	chart._W = 1100.0
	chart._H = 640.0
	chart.look(3300.0, -1400.0, 3.0)
	var round_trip := true
	for at: Vector2 in [Vector2(3300.0, -1400.0), Vector2(1200.0, -300.0), Vector2(5150.0, -2650.0), Vector2(2400.0, 900.0)]:
		var c: Vector2 = chart.to_canvas(at.x, at.y)
		round_trip = round_trip and (chart.to_world(c) as Vector2).distance_to(at) < 0.05
	round_trip = round_trip and (chart.to_canvas(3300.0, -1400.0) as Vector2).distance_to(Vector2(550.0, 320.0)) < 1e-3
	var finger := Vector2(240.0, 170.0)
	var under: Vector2 = chart.to_world(finger)
	chart._zoom_at(1.5, finger)
	var held := (chart.to_world(finger) as Vector2).distance_to(under) < 0.05 and is_equal_approx(chart.view().z, 4.5)
	chart._zoom_at(1000.0, finger)
	var deepest: float = chart.view().z
	chart.look(-5000.0, 9000.0, 1.0)
	var whole: Vector3 = chart.view()
	if round_trip and held and is_equal_approx(deepest, art.max_zoom) and whole.is_equal_approx(Vector3(3300.0, -1400.0, 1.0)):
		steps += 1
	else:
		_fail("maps: the chart's view: round trip %s, zoom about the finger %s, deepest zoom %.2f, the whole sea at %s" % [round_trip, held, deepest, whole])
	chart.free()
	# dashed lines broken as a canvas's setLineDash and lineDashOffset break them
	var line := PackedVector2Array([Vector2.ZERO, Vector2(100.0, 0.0)])
	var big := Rect2(-1e4, -1e4, 2e4, 2e4)
	var spans := func(d: PackedVector2Array) -> Array:
		var out := []
		for i in range(0, d.size(), 2):
			out.append([snappedf(d[i].x, 0.001), snappedf(d[i + 1].x, 0.001)])
		return out
	var corner := MapMarks.dashes(PackedVector2Array([Vector2.ZERO, Vector2(10.0, 0.0), Vector2(10.0, 10.0)]), 5.0, 1.0, 0.0, 0.0, big)
	var capped := MapMarks.dashes(line, 10.0, 10.0, 0.0, 1.5, big)
	if spans.call(MapMarks.dashes(line, 10.0, 10.0, 0.0, 0.0, big)) == [[0.0, 10.0], [20.0, 30.0], [40.0, 50.0], [60.0, 70.0], [80.0, 90.0]] \
			and spans.call(MapMarks.dashes(line, 10.0, 10.0, -5.0, 0.0, big)) == [[5.0, 15.0], [25.0, 35.0], [45.0, 55.0], [65.0, 75.0], [85.0, 95.0]] \
			and spans.call(MapMarks.dashes(line, 10.0, 10.0, 5.0, 0.0, big)) == [[0.0, 5.0], [15.0, 25.0], [35.0, 45.0], [55.0, 65.0], [75.0, 85.0], [95.0, 100.0]] \
			and spans.call(MapMarks.dashes(line, 10.0, 10.0, 0.0, 0.0, Rect2(35.0, -5.0, 20.0, 10.0))) == [[40.0, 50.0]] \
			and capped[0].is_equal_approx(Vector2(-1.5, 0.0)) and capped[1].is_equal_approx(Vector2(11.5, 0.0)) \
			and corner.size() == 8 and corner[2].is_equal_approx(Vector2(6.0, 0.0)) and corner[3].is_equal_approx(Vector2(10.0, 1.0)) \
			and MapMarks.dashes(line, 4.0, 0.0, 0.0, 0.0, big).is_empty():
		steps += 1
	else:
		_fail("maps: dashes broke as %s" % [spans.call(MapMarks.dashes(line, 10.0, 10.0, 5.0, 0.0, big))])
	print("maps: %d of 10 steps as expected" % steps)


## Her look and the Shipwright: a garbled look is made whole (what makes
## sense kept, the rest the default's), every famous ship's colours and a
## surprise come through unchanged and a seeded surprise is the same twice,
## designs are told apart and named as the web names them, every flag,
## pattern, emblem, backing and sail tile is drawn, her flag and mark are
## baked, the brush's layer is kept as a PNG that gives its colours back
## straight, and her look and designs come back whole from their save.
func _check_looks() -> void:
	var steps := 0
	var g := ShipLook.sanitize({"name": "<b>Sea Biscuit</b> of the Seven Seas and Beyond", "sail": "plain",
			"flag": {"shape": "triangle", "bg": "#12345", "pattern": "cross", "pattern_color": "#ABCDEF", "emblem": 7, "emblem_scale": 9.0, "paint": "javascript:1"},
			"hull": {"topsides": " #ABCDEF ", "planks": 12}})
	var d := ShipLook.fresh()
	if g.flag.shape == "square" and g.flag.bg == d.flag.bg and g.flag.pattern == "cross" and g.flag.pattern_color == "#abcdef" \
			and g.flag.emblem == d.flag.emblem and is_equal_approx(float(g.flag.emblem_scale), 1.4) and g.flag.paint == "" \
			and g.hull.topsides == "#abcdef" and g.hull.planks == d.hull.planks and g.sail == d.sail \
			and not str(g.name).contains("<") and str(g.name).length() <= ShipLook.NAME_MAX:
		steps += 1
	else:
		_fail("looks: a garbled look wasn't made whole: %s" % g)
	var bad := []
	for i in ShipLook.PRESETS.size():
		var pl := ShipLook.preset(i)
		if ShipLook.sanitize(pl) != pl:
			bad.append(ShipLook.PRESETS[i][0])
	var rng := RandomNumberGenerator.new()
	for k in 24:
		rng.seed = k
		var r := ShipLook.random_look("Gull", rng)
		rng.seed = k
		if ShipLook.random_look("Gull", rng) != r or ShipLook.sanitize(r) != r:
			bad.append("surprise %d" % k)
	if bad.is_empty():
		steps += 1
	else:
		_fail("looks: not whole as they stand, or not the same twice: %s" % ", ".join(bad))
	var a := ShipLook.preset(2)
	a.name = "Sea Biscuit"
	var b := ShipLook.preset(2)
	var taken := [{"name": "Sea Biscuit"}, {"name": "Sea Biscuit II"}]
	if ShipLook.same_style(a, b) and not ShipLook.same_design(a, b) and not ShipLook.same_style(a, ShipLook.preset(3)) \
			and ShipLook.design_name(a, taken) == "Sea Biscuit III" and ShipLook.design_name(b, taken) == "Design":
		steps += 1
	else:
		_fail("looks: designs told apart or named wrong (%s, %s)" % [ShipLook.design_name(a, taken), ShipLook.design_name(b, taken)])
	# every choice the Shipwright offers drawn as its tile is
	var undrawn := []
	var px := Vector2i(64, 40)
	for t: Array in [[Heraldry.SHAPES, "shape"], [Heraldry.PATTERNS, "pattern"], [Heraldry.EMBLEMS, "emblem"], [Heraldry.BACKINGS, "backing"]]:
		for id: String in Heraldry.ids(t[0]):
			var f: Dictionary = d.flag.duplicate()
			f[t[1]] = id
			var img := Heraldry.render(Heraldry.flag_svg(f, 64.0, 40.0, px, false, 4.0))
			if img == null or img.get_size() != px:
				undrawn.append(id)
			if t[1] == "emblem" and Heraldry.render(Heraldry.tile_svg(id, "rays", "#f2c45a", "#1b3f7a", 48)) == null:
				undrawn.append("tile " + id)
	for id: String in ShipLook.ids(ShipLook.SAIL_PATTERNS):
		if Heraldry.render(Shipwright.sail_svg(id, "#f4ead4", "#1f8a8a", Vector2i(54, 58))) == null:
			undrawn.append("sail " + id)
	var l := Livery.new()
	l.id = "check"
	ShipLook.dress(l, ShipLook.preset(7))
	var list: Array[Livery] = [l]
	Livery.bake(list)
	if l.flag_tex == null or l.mark_tex == null or l.flag_tex.get_width() != Livery.FLAG_PX_SMALL:
		undrawn.append("her flag and mark")
	if undrawn.is_empty():
		steps += 1
	else:
		_fail("looks: not drawn: %s" % ", ".join(undrawn))
	# the brush's layer (premultiplied, as drawn) kept straight
	var layer := Image.create(Heraldry.PAINT.x, Heraldry.PAINT.y, false, Image.FORMAT_RGBA8)
	var url := FlagStage.encode(layer)
	layer.set_pixel(3, 3, Color(1.0, 1.0, 1.0, 0.02))
	var faint := FlagStage.encode(layer)
	layer.set_pixel(10, 10, Color(0.95 * 0.5, 0.77 * 0.5, 0.35 * 0.5, 0.5))
	layer.set_pixel(20, 20, Color("#1fa3a0"))
	var kept := FlagStage.encode(layer)
	var back := Image.new()
	var ok := url == "" and faint == "" and kept.begins_with("data:image/png;base64,") \
			and back.load_png_from_buffer(Marshalls.base64_to_raw(kept.get_slice(",", 1))) == OK and back.get_size() == Heraldry.PAINT
	if ok:
		var c := back.get_pixel(10, 10)
		ok = absf(c.r - 0.95) < 0.02 and absf(c.g - 0.77) < 0.02 and absf(c.b - 0.35) < 0.02 and absf(c.a - 0.5) < 0.01 \
				and back.get_pixel(20, 20).is_equal_approx(Color("#1fa3a0")) and ShipLook.sanitize({"flag": {"paint": kept}}).flag.paint == kept
	if ok:
		steps += 1
	else:
		_fail("looks: the brush's layer wasn't kept straight")
	# her look and designs, saved and back
	var script: GDScript = load("res://src/core/progress.gd")
	var file := "user://check-looks.json"
	var make := func() -> Node:
		var n: Node = script.new()
		n.path = "user://check-looks-progress.json"
		n.looks_path = file
		return n
	var mine := ShipLook.preset(5)
	mine.name = "Check"
	mine.flag.paint = kept
	var saved := [{"id": "a1", "name": "Check", "look": mine}, {"id": "a2", "name": "Gull II", "look": ShipLook.random_look("Gull", rng)}]
	var p: Node = make.call()
	p.keep_look(mine)
	p.keep_designs(saved)
	p.save()
	var q: Node = make.call()
	q._load()
	# (as JSON, the way it's kept: a float comes back to the digits it was written in)
	if JSON.stringify(q.look, "", true) == JSON.stringify(mine, "", true) and JSON.stringify(q.designs, "", true) == JSON.stringify(saved, "", true):
		steps += 1
	else:
		_fail("looks: her look or designs didn't come back whole from their save")
	for n: Node in [p, q]:
		n.free()
	for f: String in [file, file + ".tmp", "user://check-looks-progress.json", "user://check-looks-progress.json.tmp"]:
		if FileAccess.file_exists(f):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(f))
	print("looks: %d of 6 steps as expected" % steps)


func _check_progress() -> void:
	var script: GDScript = load("res://src/core/progress.gd")
	var file := "user://check-progress.json"
	var make := func() -> Node:
		var n: Node = script.new()
		n.path = file
		return n
	for f: String in [file, file + ".tmp"]:
		if FileAccess.file_exists(f):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(f))
	var steps := 0
	# a save and a load
	var a: Node = make.call()
	a.earn(1250)
	a.earn(-250)
	a.chart("brumas")
	a.pick_ship("galleon")
	a.pick_sea("brumas")
	a.keep_view(0.731, 0.25)
	a.keep_pins([[120, -40, 2], [3300, -1400, 0]])
	a.records.voyages = 3
	a.records.time = 912.5
	a.save()
	var b: Node = make.call()
	b._load()
	if b.ship == "galleon" and b.start_sea == "brumas" and b.sea_picked and b.purse == 1000 and b.charted("brumas") \
			and not b.charted("home") and b.view.is_equal_approx(Vector2(0.731, 0.25)) and int(b.records.voyages) == 3 \
			and is_equal_approx(float(b.records.time), 912.5) and b.pins == [[120, -40, 2], [3300, -1400, 0]] and not FileAccess.file_exists(file + ".tmp"):
		steps += 1
	else:
		_fail("progress: a save didn't come back whole: %s, %s, %d gold, view %s, pins %s, records %s" % [b.ship, b.start_sea, b.purse, b.view, b.pins, b.records])
	# a damaged save: only what makes sense is taken
	var f := FileAccess.open(file, FileAccess.WRITE)
	f.store_string(JSON.stringify({"ship": "frigate", "start_sea": 7, "view": [9, -3], "purse": -40, "charts": {"brumas": 1700000000},
			"pins": [[1, 2, 9], "x", [1, 2], [5, "y", 1], [3.6, -2.4, -3], [10, 10, 1], [20, 20, 2], [30, 30, 3], [40, 40, 4]],
			"records": {"voyages": -2, "time": "a while", "gold": 640, "kills": "many"}, "extra": [1, 2]}))
	f.close()
	var c: Node = make.call()
	c._load()
	# (a save from before the vault gets the vault's opening purse, once)
	if c.ship == "sloop" and c.start_sea == "home" and not c.sea_picked and c.view == Vector2(1.0, 0.0) and c.purse == Cosmetics.START_PURSE \
			and c.charted("brumas") and int(c.records.voyages) == 0 and float(c.records.time) == 0.0 and int(c.records.gold) == 640 and int(c.records.kills) == 0 \
			and c.pins == [[1, 2, 4], [4, -2, 0], [10, 10, 1], [20, 20, 2], [30, 30, 3]]:
		steps += 1
	else:
		_fail("progress: a damaged save let something malformed in: %s, %s, view %s, %d gold, pins %s, records %s" % [c.ship, c.start_sea, c.view, c.purse, c.pins, c.records])
	# a crash after the fresh copy was written, before it was swapped in
	f = FileAccess.open(file, FileAccess.WRITE)
	f.store_string("{\"ship\": \"brig\", \"pur")
	f.close()
	f = FileAccess.open(file + ".tmp", FileAccess.WRITE)
	f.store_string(JSON.stringify({"ship": "brig", "purse": 77}))
	f.close()
	var d: Node = make.call()
	d._load()
	if d.ship == "brig" and d.purse == 77 + Cosmetics.START_PURSE:
		steps += 1
	else:
		_fail("progress: the fresh copy wasn't taken after a crash mid-swap (%s, %d gold)" % [d.ship, d.purse])
	# nothing kept yet: the harbour's defaults
	for g: String in [file, file + ".tmp"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(g))
	var e: Node = make.call()
	e._load()
	if e.ship == "sloop" and e.start_sea == "home" and not e.sea_picked and e.view.x < 0.0 and e.purse == Cosmetics.START_PURSE and e.charts.is_empty() \
			and e.pins.is_empty() and e.wearing("skin") == "skin:none" and e.owns_item("trail:powder") and not e.owns_item("skin:kraken"):
		steps += 1
	else:
		_fail("progress: a fresh game doesn't start from the defaults")
	for n: Node in [a, b, c, d, e]:
		n.free()
	for g: String in [file, file + ".tmp"]:
		if FileAccess.file_exists(g):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(g))
	print("progress: %d of 4 steps as expected" % steps)


## The vault's cosmetics against the web's own (tools/cosmetics_web.json,
## from src/data/cosmetics.ts on fixed seeds): the catalogue in the web's
## order, then two dozen runs of singles and tens on the same mulberry32
## streams, every find, refund, pity count and purse after each open. Then
## a damaged vault cleaned, and the Progress side: wear, award, pull, seen,
## a save and a load. And her colours: a skin on the player's livery.
func _check_cosmetics() -> void:
	var web: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://tools/cosmetics_web.json"))
	if not web is Dictionary:
		_fail("cosmetics: tools/cosmetics_web.json is unreadable")
		return
	var steps := 0
	# the catalogue
	var mine := Cosmetics.all()
	var items: Array = web.items
	var bad := ""
	if mine.size() != items.size():
		bad = "%d items, the web has %d" % [mine.size(), items.size()]
	for i in mini(mine.size(), items.size()):
		var it: Dictionary = mine[i]
		var w: Array = items[i]
		var ok: bool = it.id == w[0] and it.rarity == int(w[1])
		if ok and it.kind == "skin":
			ok = it.pattern == int(w[2]) and is_equal_approx(it.sail, float(w[4])) and is_equal_approx(it.glow, float(w[5])) \
					and it.animated == bool(w[6]) and it.base == bool(w[7])
			for c in 3:
				ok = ok and (it.colors[c] as Color).is_equal_approx(Color(str(w[3][c])))
		elif ok:
			var styles: Array[String] = Cosmetics.BLAST_STYLES if it.kind == "blast" else Cosmetics.TRAIL_STYLES
			ok = styles[it.style] == str(w[2]) and it.base == bool(w[4]) \
					and (it.tint[0] as Color).is_equal_approx(Color(str(w[3][0]))) and (it.tint[1] as Color).is_equal_approx(Color(str(w[3][1])))
		if not ok and bad == "":
			bad = "%s differs from the web's %s" % [it.id, w]
	if bad == "":
		steps += 1
	else:
		_fail("cosmetics: the catalogue isn't the web's: " + bad)
	# the runs: a fresh vault and 21500 gold, one day, singles and tens
	var ops: Array = web.ops
	var runs_ok := 0
	for run: Array in web.runs:
		var v := Cosmetics.fresh()
		var purse := Cosmetics.START_PURSE + 20000
		var rnd := Mulberry32.new(int(run[0]) * 7907 + 3)
		var why := ""
		for k in ops.size():
			var n := int(ops[k])
			var left := Cosmetics.pay(v, n, purse, "2026-01-01")
			if left < 0:
				why = "open %d couldn't be paid from %d" % [k, purse]
				break
			purse = left
			var got: Array = []
			for r in Cosmetics.open(v, n, rnd.next):
				purse += int(r.refund)
				got.append([r.item.id, r.fresh, r.refund])
			var step: Array = run[1][k]
			var pl := Cosmetics.pity_left(v)
			var same: bool = got.size() == (step[0] as Array).size()
			for j in got.size() if same else 0:
				var x: Array = step[0][j]
				same = same and got[j][0] == str(x[0]) and got[j][1] == bool(x[1]) and got[j][2] == int(x[2])
			if not same or pl != Vector2i(int(step[1][0]), int(step[1][1])) \
					or purse != int(step[2]) or int(v.pulls) != int(step[3]):
				why = "open %d: %s, pity %s, %d gold, %d pulls; the web's %s" % [k, got, pl, purse, v.pulls, step]
				break
		if why == "":
			runs_ok += 1
		elif runs_ok >= 0:
			_fail("cosmetics: seed %d's run strays from the web's at %s" % [run[0], why])
			runs_ok = -1000
	if runs_ok == (web.runs as Array).size():
		steps += 1
	# a damaged vault: only what makes sense is kept
	var d := Cosmetics.sanitize({"owned": {"skin:kintsugi": 2.7, "skin:nope": 1, "blast:seasalt": "x", "trail:comet": -3},
		"equip": {"skin": "skin:kintsugi", "blast": "blast:seasalt", "trail": "skin:none"}, "pity": {"leg": 99, "epic": -4},
		"pulls": "many", "daily": "2026-01-01T09:00", "unseen": ["skin:kintsugi", 7, "nope"]})
	if (d.owned as Dictionary).size() == 5 and int(d.owned["skin:kintsugi"]) == 2 and int(d.owned["trail:comet"]) == 1 \
			and d.equip == {"skin": "skin:kintsugi", "blast": "blast:powder", "trail": "trail:powder"} and d.pity == {"leg": 49, "epic": 0} \
			and int(d.pulls) == 0 and d.daily == "2026-01-01" and d.unseen == ["skin:kintsugi"] and Cosmetics.collected(d) == 2:
		steps += 1
	else:
		_fail("cosmetics: a damaged vault let something malformed in: %s" % d)
	# Progress: a trophy, a duplicate's refund, wearing it, a pull, seen, kept
	var script: GDScript = load("res://src/core/progress.gd")
	var file := "user://check-vault.json"
	var a: Node = script.new()
	a.path = file
	var r1: Dictionary = a.award("skin:kintsugi")
	var r2: Dictionary = a.award("skin:kintsugi")
	var refund := int(Cosmetics.RARITIES[int(Cosmetics.item("skin:kintsugi").rarity)].refund)
	var wore: bool = a.wear("skin:kintsugi")
	var cant: bool = a.wear("skin:harbour")
	var unseen: bool = a.has_unseen("skin")
	a.mark_items_seen("skin")
	var seen: bool = not a.has_unseen("skin")
	a.earn(3000)
	var before: int = a.purse
	var got: Array[Dictionary] = a.pull(10, Mulberry32.new(5).next)
	# a ten-pull's bonus ship part
	var bonus: Dictionary = a.vault_bonus(Mulberry32.new(9).next)
	var paid := before - Cosmetics.TEN_COST
	for g in got:
		paid += int(g.refund)
	var best := 0
	for g in got:
		best = maxi(best, int(g.item.rarity))
	a.save()
	var b: Node = script.new()
	b.path = file
	b._load()
	if r1.fresh and not r2.fresh and int(r2.refund) == refund and a.purse == paid and wore and not cant and unseen and seen and bonus.has("part") \
			and got.size() == 10 and best >= 2 and b.wearing("skin") == "skin:kintsugi" and b.owns_item("skin:kintsugi") \
			and int(b.vault.pulls) == 10 and b.purse == a.purse:
		steps += 1
	else:
		_fail("cosmetics: the vault's purse and wardrobe went astray: fresh %s/%s refund %d, wore %s/%s, %d gold (expected %d), best %d, kept %s" \
				% [r1.fresh, r2.fresh, r2.refund, wore, cant, a.purse, paid, best, b.vault])
	for n: Node in [a, b]:
		n.free()
	for g: String in [file, file + ".tmp"]:
		if FileAccess.file_exists(g):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(g))
	# her colours: a skin on the player's livery reaches every painted material
	var l := Livery.named("player")
	var was: Dictionary = l.skin
	l.skin = Cosmetics.skin("skin:kintsugi")
	ShipModel.restyle(l)
	var model := ShipModel.create(ShipClass.named("sloop"), l)
	var skinned := 0
	var plain := 0
	for mi: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		for s in mi.mesh.get_surface_count() if mi.mesh != null else 0:
			var m := mi.get_active_material(s) as ShaderMaterial
			if m == null:
				continue
			var path := m.shader.resource_path
			if path.ends_with("_skin.gdshader"):
				skinned += 1 if int(m.get_shader_parameter("skin_id")) == int(l.skin.pattern) else 0
			elif path.contains("ship_hull") or path.contains("ship_sail"):
				plain += 1
	model.free()
	l.skin = was
	ShipModel.restyle(l)
	if skinned >= 3 and plain == 0:
		steps += 1
	else:
		_fail("cosmetics: the player's skin reached %d materials (%d left plain)" % [skinned, plain])
	print("cosmetics: %d of 5 steps as expected; %d runs of %d opens matched the web's" % [steps, maxi(runs_ok, 0), ops.size()])


## Ship parts: their maths against the web's own (tools/parts_web.json, from
## src/ships/parts.ts on fixed seeds through tools' dump): the catalogue in
## the web's order, each port's stock over forty days, what chests, rolls and
## pirates come up with on the same mulberry32 streams, every refit and its
## bars, and each part's lines on its card. Then the locker: a find, a spare
## and its refund, fits right and wrong, a save and a load, and a damaged
## save cleaned. And each class built with each rarity's set bolted on:
## sound, within budget, every gun still with its muzzle where the barrel
## ends, and the mythic parts turning.
func _check_parts() -> void:
	var web: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://tools/parts_web.json"))
	if not web is Dictionary:
		_fail("parts: tools/parts_web.json is unreadable")
		return
	var steps := 0
	var ids := PackedStringArray()
	for p in Parts.all():
		ids.append(p.id)
	if ids == PackedStringArray(web.parts):
		steps += 1
	else:
		_fail("parts: the catalogue isn't the web's: %s" % ", ".join(ids))
	var off := 0
	for e: Array in web.stock:
		var got := PackedStringArray()
		for p in Parts.port_stock(int(e[0]), int(e[1])):
			got.append(p.id)
		if got != PackedStringArray(e[2]):
			off += 1
			if off <= 3:
				_fail("parts: port %d's shipwright has %s in on day %d, the web's %s" % [e[0], ", ".join(got), e[1], ", ".join(PackedStringArray(e[2]))])
	steps += 1 if off == 0 else 0
	off = 0
	for e: Array in web.chest:
		var tier := int(e[0])
		var luck := float(e[1])
		var got := ""
		for k in range(1, 201):
			var t := Parts.chest_part(tier, luck, Mulberry32.new(k * 7919 + tier * 31 + roundi(luck * 100.0)).next)
			got += "-" if t < 0 else str(t)
		if got != str(e[2]):
			off += 1
			_fail("parts: chests of tier %d at luck %.2f come up %s, the web's %s" % [tier, luck, got, e[2]])
	var every := int(web.owned_every)
	var owned := {}
	for i in ids.size():
		if i % every == 0:
			owned[ids[i]] = true
	var owns := func(pid: String) -> bool: return owned.has(pid)
	for e: Array in web.roll:
		var tier := int(e[0])
		for k in range(1, 61):
			var got := str(Parts.roll_part(tier, owns, Mulberry32.new(k * 104729 + tier).next).id)
			if got != str(e[1][k - 1]):
				off += 1
				_fail("parts: roll %d of tier %d found %s, the web's %s" % [k, tier, got, e[1][k - 1]])
				break
	for e: Array in web.pirate:
		var cls := str(e[0])
		for k in range(1, 301):
			var f := Parts.pirate_fit(cls, Mulberry32.new(k * 15485863 + cls.length()).next)
			var got := "" if f.is_empty() else str(f.values()[0])
			if got != str(e[1][k - 1]):
				off += 1
				_fail("parts: pirate %s %d carries %s, the web's %s" % [cls, k, got, e[1][k - 1]])
				break
	steps += 1 if off == 0 else 0
	off = 0
	for e: Array in web.refit:
		var c := Parts.refit(ShipClass.named(str(e[0])), e[2])
		var got := [c.hp, c.armor, c.max_speed, c.accel, c.turn_rate, c.reload, c.damage, c.muzzle_speed]
		var b := Parts.refit_bars(ShipClass.named(str(e[0])), e[2])
		var bars := [b.speed, b.agility, b.armour, b.hull, b.firepower]
		for i in got.size():
			if absf(float(got[i]) - float(e[3][i])) > 1e-6 * maxf(1.0, absf(float(e[3][i]))):
				off += 1
				_fail("parts: the %s's %s refit has %s, the web's %s" % [e[0], e[1], got, e[3]])
				break
		for i in bars.size():
			if absf(float(bars[i]) - float(e[4][i])) > 1e-6:
				off += 1
				_fail("parts: the %s's %s refit bars are %s, the web's %s" % [e[0], e[1], bars, e[4]])
				break
	for e: Array in web.lines:
		var got := Parts.stat_lines(Parts.part(str(e[0])).stats)
		if JSON.stringify(got) != JSON.stringify(e[1]):
			off += 1
			_fail("parts: %s's card says %s, the web's %s" % [e[0], got, e[1]])
	steps += 1 if off == 0 else 0
	steps += _check_locker()
	for id: String in SHIPS:
		steps += _check_fitted(id, SHIPS[id])
	print("parts: %d of %d steps as expected" % [steps, 5 + SHIPS.size()])


## The locker kept by Progress: a find and a spare, fits right and wrong,
## seen, a save and a load, and a damaged save cleaned (1 if all's well).
func _check_locker() -> int:
	var script: GDScript = load("res://src/core/progress.gd")
	var file := "user://check-parts.json"
	for f: String in [file, file + ".tmp"]:
		if FileAccess.file_exists(f):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(f))
	var a: Node = script.new()
	a.path = file
	var bad := PackedStringArray()
	var f1: Dictionary = a.grant_part("hull:aegis")
	var f2: Dictionary = a.grant_part("hull:aegis")
	if not f1.fresh or int(f1.refund) != 0 or f2.fresh or int(f2.refund) != 10000 or int(a.parts.owned["hull:aegis"]) != 2 or a.parts.unseen != ["hull:aegis"]:
		bad.append("a find and its spare (%s, %s)" % [f1, f2])
	if not a.grant_part("hull:nothing").is_empty():
		bad.append("a part that isn't")
	if not a.equip("brig", "hull", "hull:aegis") or a.equip("brig", "sails", "hull:aegis") or a.equip("brig", "guns", "guns:starfire") or a.equip("frigate", "hull", "hull:aegis"):
		bad.append("fits right and wrong")
	a.mark_seen(["hull:aegis"])
	if not a.parts.unseen.is_empty() or a.loadout("brig") != {"hull": "hull:aegis"} or a.equipped("sloop", "hull") != "":
		bad.append("seen, and the brig's loadout")
	a.save()
	var b: Node = script.new()
	b.path = file
	b._load()
	if b.parts.owned != {"hull:aegis": 2} or b.loadout("brig") != {"hull": "hull:aegis"} or not b.parts.unseen.is_empty():
		bad.append("a save and a load (%s)" % b.parts)
	var f := FileAccess.open(file, FileAccess.WRITE)
	f.store_string(JSON.stringify({"parts": {"owned": {"hull:aegis": 1, "hull:nope": 3, "sails:aether": -1, "guns:bronze": "x", "figure:lion": 2.0},
			"fit": {"brig": {"hull": "hull:aegis", "sails": "sails:aether", "guns": "hull:aegis", "figure": "figure:lion"}, "frigate": {"hull": "hull:aegis"}, "sloop": 4},
			"unseen": ["hull:aegis", "nope", 5, "hull:aegis"]}}))
	f.close()
	var c: Node = script.new()
	c.path = file
	c._load()
	if c.parts.owned != {"hull:aegis": 1, "figure:lion": 2} or c.loadout("brig") != {"hull": "hull:aegis", "figure": "figure:lion"} \
			or c.parts.fit.has("frigate") or c.parts.fit.has("sloop") or c.parts.unseen != ["hull:aegis"]:
		bad.append("a damaged save (%s)" % c.parts)
	for n: Node in [a, b, c]:
		n.free()
	for g: String in [file, file + ".tmp"]:
		if FileAccess.file_exists(g):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(g))
	for w in bad:
		_fail("parts: the locker got %s wrong" % w)
	return 1 if bad.is_empty() else 0


## Fireworks: the shot table has a sixth kind on every line; the
## pyrotechnists' stalls match the web's to the rocket; the locker hands out
## its welcome crate once, holds no more than each kind's room, takes a volley
## at a time, finds the next kind round and survives a save, a load and a
## damaged file; salvage only holds known kinds; and every kind, launched,
## climbs, breaks high over the guns with its bangs (and the showpieces' big
## ones), lights the night and the sea, and leaves the sky quiet again.
func _check_fireworks() -> void:
	var t0 := Time.get_ticks_usec()
	var steps := 0
	var bad := PackedStringArray()
	for arr: Array in [Ammo.ID, Ammo.NAME, Ammo.SHORT, Ammo.BLURB, Ammo.GIST, Ammo.COLOR, Ammo.DAMAGE, Ammo.RELOAD, Ammo.SPEED, Ammo.BALLS, Ammo.SPREAD, Ammo.SIZE, Ammo.MAX, Ammo.START]:
		if arr.size() != Ammo.COUNT:
			bad.append("a shot table line of %d" % arr.size())
	if Ammo.ID[Ammo.FIREWORK] != "firework" or Ammo.SPECIALS.has(Ammo.FIREWORK):
		bad.append("the fireworks' place among the shot")
	steps += 1 if bad.is_empty() else 0
	# (the web's pyroStock for the same port and day)
	var stalls := [[1, 20385, ["chrysanthemum", "peony", "palm", "fish", "ring", "strobe"]],
			[3, 20386, ["palm", "peony", "willow", "ring", "crackle", "strobe"]],
			[7, 19999, ["peony", "palm", "chrysanthemum", "crackle", "ring", "saturn", "roger"]],
			[2, 1, ["willow", "peony", "palm", "fish", "crossette", "strobe"]]]
	var stall_ok := true
	for c: Array in stalls:
		var got := Fireworks.stall(c[0], c[1])
		if Array(got) != c[2]:
			stall_ok = false
			bad.append("port %d's stall on day %d (%s)" % [c[0], c[1], got])
	steps += 1 if stall_ok else 0
	# the locker
	var script: GDScript = load("res://src/core/progress.gd")
	var file := "user://check-fireworks.json"
	for f: String in [file, file + ".tmp"]:
		if FileAccess.file_exists(f):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(f))
	var a: Node = script.new()
	a.path = file
	a._load()
	var locker_ok: bool = a.fireworks == Fireworks.WELCOME and a.rockets_total() == 8
	var got: Dictionary = a.stow_rockets({"peony": 40, "kraken": 1, "nonsense": 3})
	locker_ok = locker_ok and got == {"peony": 27, "kraken": 1} and a.rockets("peony") == 30 and a.rocket_room("peony") == 0
	locker_ok = locker_ok and a.take_rocket("kraken") and not a.take_rocket("kraken") and a.rockets("kraken") == 0
	locker_ok = locker_ok and a.next_rocket("willow") == "palm" and a.next_rocket("palm") == "peony"
	locker_ok = locker_ok and not a.tip_seen("fireworks") and a.tip_seen("fireworks")
	a.save()
	var b: Node = script.new()
	b.path = file
	b._load()
	locker_ok = locker_ok and b.fireworks == a.fireworks and b.tips == ["fireworks"]
	var f2 := FileAccess.open(file, FileAccess.WRITE)
	f2.store_string(JSON.stringify({"fireworks": {"peony": 99, "willow": -2, "ring": "x", "nope": 4, "roger": 2.0}, "tips": ["a", 3]}))
	f2.close()
	var c2: Node = script.new()
	c2.path = file
	c2._load()
	locker_ok = locker_ok and c2.fireworks == {"peony": 30, "roger": 2} and c2.tips == ["a"]
	var d: Node = script.new()
	d.path = file
	d._load()
	d.fireworks = {}
	d.save()
	d._load()
	# an emptied locker stays empty: the welcome crate comes only once
	locker_ok = locker_ok and d.fireworks.is_empty()
	for n: Node in [a, b, c2, d]:
		n.free()
	for g: String in [file, file + ".tmp"]:
		if FileAccess.file_exists(g):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(g))
	if not locker_ok:
		bad.append("the locker")
	steps += 1 if locker_ok else 0
	var loot_ok := true
	var found := 0
	for i in 300:
		var l := Fireworks.loot(i % 5)
		for id: String in l:
			loot_ok = loot_ok and Fireworks.KINDS.has(id) and int(l[id]) > 0
			found += int(l[id])
	if not loot_ok or found == 0:
		bad.append("salvage (%d rockets)" % found)
	steps += 1 if loot_ok and found > 0 else 0
	# the sky: every kind off one gun
	var sky := FireworkSky.new()
	root.add_child(sky)
	sky.setup(1.0)
	var heard := {}
	# (the lowest break kept in a dictionary: a lambda's own copy of a local wouldn't come back out)
	var lowest := {"y": 1e9}
	sky.sounded.connect(func(kind: StringName, at: Vector3, _power: float) -> void:
		heard[kind] = int(heard.get(kind, 0)) + 1
		if kind == &"burst" or kind == &"big":
			lowest.y = minf(lowest.y, at.y))
	var lit := false
	var sky_ok := true
	for i in Fireworks.ORDER.size():
		sky.launch(Fireworks.ORDER[i], Vector3(i * 30.0, 3.0, 0.0), Vector3.RIGHT, Vector3(0.0, 0.0, 3.0), 0, 1)
	sky_ok = sky_ok and sky.busy()
	for i in 30 * 9:
		sky.step(1.0 / 30.0)
		for l: OmniLight3D in sky._lamps:
			lit = lit or (l.visible and l.light_energy > 0.5)
	var spent := false
	for i in 30 * 6:
		sky.step(1.0 / 30.0)
	spent = not sky.busy() and not sky.visible
	var stars: int = sky._used
	var low: float = lowest.y
	for k: StringName in [&"launch", &"whistle", &"burst", &"big", &"crackle", &"pop", &"sizzle"]:
		if not heard.has(k):
			sky_ok = false
			bad.append("no %s heard" % k)
	sky_ok = sky_ok and int(heard.get(&"big", 0)) == 3 and low > 18.0 and lit and spent and stars > 1500 and stars <= sky._cap
	sky.free()
	if not sky_ok:
		bad.append("the sky (%s; lowest break %.0f m, lit %s, spent %s, %d stars)" % [heard, low, lit, spent, stars])
	steps += 1 if sky_ok else 0
	var shape := FireworkSky.roger_shape(1.0)
	steps += 1 if shape.size() > 150 else 0
	for w in bad:
		_fail("fireworks: " + w)
	print("fireworks: %d of 6 steps as expected; %d stars for a sky of every kind, %d bangs heard, %.0f ms" % [steps, stars, heard.values().reduce(func(x: int, y: int) -> int: return x + y, 0), (Time.get_ticks_usec() - t0) / 1000.0])


## Stands in for Sound in the feast-night check: counts the band's phrases.
class _Band extends Node:
	var tunes := 0
	func festival_tune(_i: int, vol: float, _pan: float, _dist: float) -> float:
		tunes += 1 if vol > 0.0 else 0
		return Sound.REEL_LEN


## Feast nights (Festival, Festivals, LanternBoats): the calendar as the
## web's, a town's lantern strings, a whole feast night off one town (dusk,
## the lanterns lit, the market's bonus, rockets, lantern boats, the band,
## the midnight finale and its cheers, put out by dawn, the news of the next
## one), and the boats drifting out and guttering away.
func _check_festivals(w: World) -> void:
	var t0 := Time.get_ticks_usec()
	# (loaded, not named: the towns' scripts read Settings, which a script this one names compiles before)
	var town: GDScript = load("res://src/port/trade_port.gd")
	var figure: GDScript = load("res://src/port/figure.gd")
	var runner: GDScript = load("res://src/game/festivals.gd")
	var steps := 0
	var bad := PackedStringArray()
	# the calendar (the web's feastPorts, feastLevel and moonIsFull)
	var cal := Array(Festival.feast_ports(0, 6, false)) == [0, 3] and Array(Festival.feast_ports(1, 6, false)) == [2, 5] \
			and Array(Festival.feast_ports(2, 6, false)) == [1, 4] and Festival.feast_ports(5, 6, true).size() == 6
	cal = cal and Festival.level(12.0) == 0.0 and Festival.level(21.0) == 1.0 and absf(Festival.level(19.4) - 0.5) < 1e-4 \
			and Festival.level(3.0) == 1.0 and absf(Festival.level(4.1) - 0.5) < 1e-4 and Festival.level(11.0) == 0.0
	cal = cal and Festival.moon_is_full(0.5, 0.0) and Festival.moon_is_full(0.45, 0.5) and not Festival.moon_is_full(0.3, 0.0) and not Festival.moon_is_full(0.5, 0.5)
	cal = cal and Festival.FEASTS.size() == town.SPECS.size()
	if not cal:
		bad.append("the calendar")
	steps += 1 if cal else 0
	# a town's lantern strings
	var site: Dictionary = {}
	for r in w.regions:
		for p: Dictionary in r.ports:
			if not p.home and site.is_empty():
				site = p
	var rnd := Mulberry32.new(1000)
	var styles: Array[Dictionary] = []
	for role: String in town.ROLES:
		styles.append(figure.style_for(role, rnd, town.SPECS[0]))
	var sea := World.new()
	sea.regions = w.regions
	sea.wind = Wind.new()
	sea.waves = Waves.new(0.6)
	var port: Node3D = town.new()
	port.setup(site, 0, town.Arts.new(), sea, styles)
	root.add_child(port)
	var lm := port.find_child("Lanterns", true, false) as MeshInstance3D
	var strings_ok: bool = lm != null and lm.mesh != null and port.figures.size() == 19
	var lanterns := 0
	if strings_ok:
		var arr := lm.mesh.surface_get_arrays(0)
		var verts: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		var uv2: PackedVector2Array = arr[Mesh.ARRAY_TEX_UV2]
		var cols: PackedColorArray = arr[Mesh.ARRAY_COLOR]
		lanterns = verts.size() / ((Festival.SEG + 1) * Festival.PROFILE.size())
		var paper: Array[Color] = []
		for h: String in port.feast.colors:
			paper.append(Color(h).srgb_to_linear())
		# (a mesh keeps its colours in 8 bits a channel)
		var of_paper := func(c: Color) -> bool:
			for q in paper:
				if absf(q.r - c.r) < 0.01 and absf(q.g - c.g) < 0.01 and absf(q.b - c.b) < 0.01:
					return true
			return false
		var odd := PackedStringArray()
		for i in verts.size():
			if not verts[i].is_finite() or uv2[i].y < 0.0 or uv2[i].y > 0.97 or uv2[i].x < town.DECK + 2.0:
				odd.append("lantern %d at %s, its turn %.2f" % [i / ((Festival.SEG + 1) * Festival.PROFILE.size()), verts[i], uv2[i].y])
			if not of_paper.call(cols[i]):
				odd.append("paper %s" % cols[i])
		if not odd.is_empty():
			strings_ok = false
			bad.append("%d odd lantern vertices (%s)" % [odd.size(), odd[0]])
	strings_ok = strings_ok and lanterns > 80
	if not strings_ok:
		bad.append("the lantern strings (%d lanterns)" % lanterns)
	steps += 1 if strings_ok else 0
	# a feast night off the town, from late afternoon to the morning after
	var sky := FireworkSky.new()
	root.add_child(sky)
	sky.setup(1.0)
	var boats := LanternBoats.new()
	root.add_child(boats)
	var band := _Band.new()
	root.add_child(band)
	var fest: RefCounted = runner.new([port], sky, boats, band)
	# (counted in a dictionary: a lambda's own copy of a local wouldn't come back out)
	var n := {"dusk": 0, "cheer": 0, "rocket": 0}
	fest.dusk.connect(func(_t: Array, _f: bool) -> void: n.dusk += 1)
	fest.cheered.connect(func(_p: Node3D) -> void: n.cheer += 1)
	sky.sounded.connect(func(kind: StringName, _at: Vector3, _pw: float) -> void:
		if kind == &"launch" or kind == &"whistle":
			n.rocket += 1)
	var cam: Vector3 = port.to_world(Vector3(0.0, 30.0, 120.0))
	sea.listener = cam
	var day := 16.0 / 24.0
	var dt := 0.5
	var peak := 0.0
	var bonus := 1.0
	var most_boats := 0
	var finale_seen := false
	# 16:00 .. 07:00 the next morning, an hour every 120 s
	for i in 3600:
		sea.time += dt
		day = fposmod(day + dt / (24.0 * 120.0), 1.0)
		fest.update(dt, dt, sea, day, 0.1, cam, true)
		# (in halves: a bang more than half a second late is let go unheard)
		sky.step(dt * 0.5)
		sky.step(dt * 0.5)
		boats.update(dt, sea, [] as Array[Ship])
		peak = maxf(peak, float(port.festive))
		bonus = maxf(bonus, port.market.bonus)
		most_boats = maxi(most_boats, boats.count())
		finale_seen = finale_seen or fest.queued() > 0
	var hour := day * 24.0
	var dusks: int = n.dusk
	var cheers: int = n.cheer
	var rockets: int = n.rocket
	var tunes := band.tunes
	var night_ok := dusks == 1 and peak > 0.99 and bonus == 1.15 and rockets > 20 and most_boats > 5 and tunes > 10 and finale_seen and cheers == 2
	night_ok = night_ok and port.festive == 0.0 and port.market.bonus == 1.0 and hour > 6.5 and hour < 8.0
	if not night_ok:
		bad.append("the night (%d dusks, festive %.2f, bonus %.2f, %d rockets, %d boats, %d phrases, finale %s, %d cheers, out by %.1f h: %.2f)" % [dusks, peak, bonus, rockets, most_boats, tunes, finale_seen, cheers, hour, port.festive])
	steps += 1 if night_ok else 0
	# the next feast's news: the count moved on at noon, night 1's towns are 2 and 5 (only one town here)
	for i in 1440:
		sea.time += dt
		day = fposmod(day + dt / (24.0 * 120.0), 1.0)
		fest.update(dt, dt, sea, day, 0.1, cam, true)
	var news: Dictionary = fest.news(day, 0.1)
	var news_ok: bool = fest.night == 1 and news.is_empty() and not fest.keeps(port)
	fest.forced = 0
	fest.reset()
	fest.update(0.0, 0.0, sea, 14.0 / 24.0, 0.1, cam, true)
	news = fest.news(14.0 / 24.0, 0.1)
	news_ok = news_ok and fest.keeps(port) and port.festive == 1.0 and news.get("towns", []) == [port.title] and news.get("when", "") == "tonight"
	if not news_ok:
		bad.append("the news (night %d, %s)" % [fest.night, news])
	steps += 1 if news_ok else 0
	# the boats: out from the quay on the tide, and every one guttered out in a few minutes
	boats.clear()
	var o: Vector3 = port.to_world(Vector3(0.0, 0.0, 1.2))
	for i in 6:
		boats.launch(o.x, o.z, float(site.nx), float(site.nz), Color.ORANGE)
	for i in 120:
		boats.update(0.5, sea, [] as Array[Ship])
	var out := 0.0
	for b in boats.boats:
		out += ((Vector2(b.x, b.z) - Vector2(o.x, o.z)).dot(Vector2(float(site.nx), float(site.nz)))) / boats.boats.size()
	var drift_ok := boats.count() == 6 and out > 5.0
	for i in 60:
		boats.update(5.0, sea, [] as Array[Ship])
	drift_ok = drift_ok and boats.count() == 0
	if not drift_ok:
		bad.append("the boats (%.1f m out)" % out)
	steps += 1 if drift_ok else 0
	for nd: Node in [port, sky, boats, band]:
		nd.free()
	for b2 in bad:
		_fail("festivals: " + b2)
	print("festivals: %d of 5 steps as expected; %d lanterns on a town, %d rockets and %d phrases of the band on a feast night, %.0f ms" % [steps, lanterns, rockets, tunes, (Time.get_ticks_usec() - t0) / 1000.0])


## A class built with each rarity's full set bolted on, and with each part
## alone: no NaNs, within PARTS_OVER of her budget, every gun's muzzle out
## at its barrel's end, and the mythic set's pieces turning (1 if all's well).
func _check_fitted(id: String, budget: int) -> int:
	var cls := ShipClass.named(id)
	if cls.is_event():
		# an event ship is her own: no refit goes on her, whatever's asked
		var ev := ShipModel.create(cls, Livery.named("player"), true, {"hull": "hull-mythic"})
		var bare := ev.fit.is_empty() and ev.livery.id == cls.livery and ev.asked == "player"
		ev.free()
		if not bare:
			_fail("parts: the %s took a refit, or not her own colours" % id)
		return 1 if bare else 0
	var base := ShipModel.create(cls, Livery.named("player"))
	var guns := base.muzzles.size()
	base.free()
	var bad := 0
	var line := PackedStringArray()
	for tier in 5:
		var fit := {}
		for p in Parts.all():
			if int(p.tier) == tier:
				fit[p.slot] = p.id
		var m := ShipModel.create(cls, Livery.named("player"), true, fit)
		var total := 0
		for node in m.find_children("*", "MeshInstance3D", true, false):
			var mi := node as MeshInstance3D
			if mi.mesh == null:
				continue
			for si in mi.mesh.get_surface_count():
				var arrays := mi.mesh.surface_get_arrays(si)
				var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
				total += idx.size() / 3 if not idx.is_empty() else (arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array).size() / 3
				for v: Vector3 in arrays[Mesh.ARRAY_VERTEX]:
					if not v.is_finite():
						_fail("parts: the %s with the %s set has a vertex that isn't finite (%s)" % [id, Parts.RARITIES[tier].id, mi.name])
						bad += 1
						break
		line.append("%s %d" % [Parts.RARITIES[tier].id, total])
		if total > budget * PARTS_OVER:
			_fail("parts: the %s with the %s set has %d triangles, over %d" % [id, Parts.RARITIES[tier].id, total, roundi(budget * PARTS_OVER)])
			bad += 1
		if m.muzzles.size() != guns:
			_fail("parts: the %s with the %s set has %d muzzles, not %d" % [id, Parts.RARITIES[tier].id, m.muzzles.size(), guns])
			bad += 1
		var tip := PartModels.barrel_tip(Parts.part(fit.guns))
		for mz: Dictionary in m.muzzles:
			if not (mz.pos as Vector3).is_finite() or absf((mz.dir as Vector3).length() - 1.0) > 1e-4:
				_fail("parts: the %s with %s has a muzzle astray" % [id, fit.guns])
				bad += 1
				break
		if tier == 4 and m._spinners.is_empty():
			_fail("parts: nothing turns on the %s with the mythic set" % id)
			bad += 1
		if tier < 2 and not m._spinners.is_empty():
			_fail("parts: something turns on the %s with the %s set" % [id, Parts.RARITIES[tier].id])
			bad += 1
		m.free()
	print("  %s fitted: %s" % [id, ", ".join(line)])
	return 1 if bad == 0 else 0
