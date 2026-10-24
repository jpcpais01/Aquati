class_name HomePort
extends Node3D
## Puerto Marézia, the home port (the web game's Port, src/port/port.ts),
## where the Shipwright works on her: a stilt-town harbour on a sunny beach.
## A plank quay on its pilings, the Salty Gull tavern, a sail loft that flies
## your colours, a cargo shed, a lookout tower, a working crane, palms, and a
## dozen pirates busy with their day: a barrel rolled round the crates, a
## crate hauled to the crane, a line off the quay, a squeezebox and a jig to
## it, a round at the tavern table, your topsides touched up from a rowboat,
## the lookout, a swabbie, the captain and his parrot, and a nap in the
## hammock. Its frame is the trading ports': +x along the shore, +z out to
## sea, the quay's edge at z = 0 and its boards DECK above the sea.
##
## It is only ever seen with the Shipwright open, so it is built off the main
## thread a moment after the harbour first opens (or, if she gets there
## first, behind the veil), shown with her alongside, and put away again
## when she sails back out to the anchorage.

const DECK := 1.8
const HALF := 32.0
## Where her middle lies along the quay.
const SHIP_X := -3.0
## The lantern posts (their lamps hang 0.6 m seaward: home_deck.gdshader pools their light).
const LANTERNS: Array[Vector2] = [Vector2(-10.5, -1.1), Vector2(9.5, -1.1), Vector2(24.2, -8.2), Vector2(-31.0, -8.5), Vector2(12.6, -9.6)]
const LANTERN_H := 3.3
const BOLLARDS: Array[float] = [-27.0, -19.0, -11.0, -3.0, 5.0, 13.0, 20.5]
const TAVERN := Vector2(19.0, -14.5)
const LOFT := Vector2(3.0, -13.5)
const WAREHOUSE := Vector2(-18.5, -14.5)
const TOWER := Vector2(28.6, -3.2)
const TOWER_H := 9.0
const CRANE := Vector2(-28.0, -1.8)
const HAMMOCK := Vector3(-8.1, DECK + 1.75, -14.2)
## The shop flag's pole, on the loft's roof.
const FLAG_AT := Vector3(-0.6, DECK + 12.05, -16.4)
## How long after the harbour opens it is built (s), off the main thread.
const BUILD_AFTER := 2.5

## Who keeps the quay, in the order of `figures` (the web's CAST).
const ROLLER := 0
const CARRIER := 1
const FISHER := 2
const MUSICIAN := 3
const DANCER := 4
const DRINKER_A := 5
const DRINKER_B := 6
const PAINTER := 7
const LOOKOUT := 8
const SWABBIE := 9
const CAPTAIN := 10
const SLEEPER := 11
const CAST: Array[Dictionary] = [
	{"shirt": "#f1ead9", "pants": "#2d3f66", "skin": "#f0c39a", "hat": CrewModel.HAT_BANDANA, "hat_color": "#c8352b", "beard": "", "boots": "#3a2618"},
	{"shirt": "#5b8fb5", "pants": "#6b4a2b", "skin": "#8d5a3b", "hat": CrewModel.HAT_NONE, "hat_color": "#000000", "beard": "#1c1410", "boots": "#2a1c12", "girth": 1.12},
	{"shirt": "#d9a441", "pants": "#3b4c3a", "skin": "#e8b48c", "hat": CrewModel.HAT_TRICORN, "hat_color": "#5a3a22", "beard": "#d8d0c4", "boots": "#3a2618"},
	{"shirt": "#9c2a2a", "pants": "#262a36", "skin": "#c68a5e", "hat": CrewModel.HAT_TRICORN, "hat_color": "#1f1b1a", "beard": "#3a2416", "patch": true, "boots": "#1d1612"},
	{"shirt": "#f1ead9", "pants": "#7a3a8a", "skin": "#f3c9a5", "hat": CrewModel.HAT_BANDANA, "hat_color": "#2f8ad8", "beard": "", "boots": "#3a2618"},
	{"shirt": "#2f6b47", "pants": "#4a3a2a", "skin": "#d59a6e", "hat": CrewModel.HAT_NONE, "hat_color": "#000000", "beard": "#a0461f", "boots": "#2a1c12", "girth": 1.18},
	{"shirt": "#e9dcc0", "pants": "#1f3550", "skin": "#6e4630", "hat": CrewModel.HAT_BANDANA, "hat_color": "#e0a13a", "beard": "", "patch": true, "boots": "#2a1c12"},
	{"shirt": "#f1ead9", "pants": "#3a5f8a", "skin": "#efc2a0", "hat": CrewModel.HAT_BANDANA, "hat_color": "#2f6b47", "beard": "#5a3a22", "boots": "#3a2618"},
	{"shirt": "#27407a", "pants": "#d8c8a6", "skin": "#e2a77c", "hat": CrewModel.HAT_TRICORN, "hat_color": "#27407a", "beard": "", "boots": "#1d1612"},
	{"shirt": "#c8d6d2", "pants": "#8a5a32", "skin": "#a86e48", "hat": CrewModel.HAT_BANDANA, "hat_color": "#9c2a2a", "beard": "", "boots": "#3a2618"},
	{"shirt": "#7a1f2b", "pants": "#1f1b1a", "skin": "#f0c7a4", "hat": CrewModel.HAT_TRICORN, "hat_color": "#141212", "beard": "#141212", "boots": "#141212", "girth": 1.08,
		"flags": CrewModel.F_COAT | CrewModel.F_PARROT | CrewModel.F_PLUME},
	{"shirt": "#e9a23b", "pants": "#3a3634", "skin": "#d8a07a", "hat": CrewModel.HAT_NONE, "hat_color": "#000000", "beard": "#6b4a2b", "boots": "#3a2618", "girth": 1.22},
]
## The barrel roller's round among the crates, and the porter's between the shed and the crane.
const ROLL_PATH: Array[Vector2] = [Vector2(-11.5, -3.6), Vector2(-7.6, -2.6), Vector2(-3.6, -3.4), Vector2(-3.0, -6.0), Vector2(-6.5, -7.2), Vector2(-10.8, -6.8)]
const CARRY_PATH: Array[Vector2] = [Vector2(-25.2, -6.4), Vector2(-21.5, -3.4), Vector2(-16.2, -4.0), Vector2(-14.8, -6.4), Vector2(-18.6, -8.2)]
## The palms: x, z, height, lean, turn, and whether z counts back from the quay's back (on the beach).
const PALMS: Array[Array] = [
	[-11.0, -14.0, 7.5, 1.4, 2.6, false], [-5.2, -14.4, 8.5, 1.8, 0.4, false], [11.2, -19.5, 9.5, 2.2, -0.6, false],
	[-30.0, -4.0, 9.0, 2.0, 2.2, true], [-15.0, -5.0, 10.5, 2.4, 1.2, true], [16.0, -4.5, 8.5, 1.6, -1.0, true],
	[29.0, -3.0, 9.5, 2.0, -0.4, true], [33.5, -12.0, 8.0, 1.5, -1.6, false],
]
## The strings of bunting, end to end: off the tavern's eaves to the tower, over the loft, along the shed, and down to the quay's lantern.
const BUNTING: Array[Vector3] = [
	Vector3(13.4, DECK + 6.6, -10.2), Vector3(27.3, DECK + 6.4, -1.9),
	Vector3(7.5, DECK + 4.8, -10.0), Vector3(13.4, DECK + 5.6, -10.2),
	Vector3(-12.9, DECK + 5.7, -9.8), Vector3(-1.6, DECK + 5.0, -9.6),
	Vector3(-1.5, DECK + 4.4, -10.0), Vector3(-10.5, DECK + 3.25, -0.6),
]

# the web's port palette (src/port/port.ts), in linear light; the rest are the towns'
static var C_OCHRE := TownKit.lin("#e9b864")
static var C_TEAL := TownKit.lin("#3f9c98")
static var C_TERRACOTTA := TownKit.lin("#c2583f")
static var C_SLATE := TownKit.lin("#4a5560")
static var C_SHED := TownKit.lin("#7c9bad")
static var C_CORAL := TownKit.lin("#e48a70")
static var C_MOSS := TownKit.lin("#2f7d6e")
static var C_SHUTTER_BLUE := TownKit.lin("#2f6f9a")
static var C_SHUTTER_GREEN := TownKit.lin("#3f8a4a")


## A walk round a loop by arc length (a closed centripetal Catmull-Rom
## through its points, as the web's): where s metres round lies, and which way it runs there.
class Loop:
	var pts := PackedVector3Array()
	var length := 0.0

	func _init(ctrl: Array[Vector2]) -> void:
		var c := PackedVector3Array()
		for p in ctrl:
			c.append(Vector3(p.x, 0.0, p.y))
		pts = Curves.even(c, true, 120)
		for k in pts.size():
			length += pts[k].distance_to(pts[(k + 1) % pts.size()])

	func at(s: float) -> Vector3:
		var n := pts.size()
		var f := fposmod(s, length) / length * n
		var i := floori(f)
		return pts[i % n].lerp(pts[(i + 1) % n], f - i)

	func yaw(s: float) -> float:
		var a := at(s - 0.25)
		var b := at(s + 0.25)
		return atan2(b.x - a.x, b.z - a.z)


var site: Dictionary
## "Puerto Marézia".
var title := ""
## The quay's depth back to the beach (m).
var depth := 28.0
var figures: Array[Figure] = []
## She who lies alongside (null none).
var ship: Ship
## The port in the world, and back.
var xf := Transform3D.IDENTITY
var inv := Transform3D.IDENTITY
## Triangles in the whole build (for the budget).
var tris := 0
## Built and in the scene.
var built := false

var _arts: TradePort.Arts
var _world: World
var _crew: Crew
var _deck_mat: ShaderMaterial
var _sign_mat: ShaderMaterial
var _wall_mat: ShaderMaterial
var _glyph_mat: ShaderMaterial
var _palm_mat: ShaderMaterial
## The beach under each palm off the quay (its height, or -1 for none: sea there).
var _beach := PackedFloat32Array()
var _task := -1
var _wait := -1.0
var _time := 0.0
var _dressed := false
var _look := {}
## What the look last painted (awning, bunting, the painter's colour), so a
## change elsewhere in the look rebuilds none of them.
var _keys := {}

# the build: made off the tree, then taken into it
var _town: Node3D
var _wall_tex: ImageTexture
var _lamps: Array[Vector4] = []
var _chimney := Vector3.ZERO
var _smoke_t := 0.0
var _roll := Loop.new(ROLL_PATH)
var _carry := Loop.new(CARRY_PATH)
var _walked := Vector3.ZERO
var _swab_yaw := 0.0
var _boat_at := Vector3(SHIP_X, 0.0, 8.0)
var _boom_yaw := -2.3
var _boom_xf := Transform3D.IDENTITY
var _load_at := Vector3.ZERO
var _flag_wind := -1.0
var _barrel: MeshInstance3D
var _crate: MeshInstance3D
var _rod: MeshInstance3D
var _bobber: MeshInstance3D
var _accordion: MeshInstance3D
var _brush: MeshInstance3D
var _brush_tip: MeshInstance3D
var _mop: MeshInstance3D
var _boat: MeshInstance3D
var _paint_top: MeshInstance3D
var _hammock: MeshInstance3D
var _boom: MeshInstance3D
var _load: MeshInstance3D
var _flag_pivot: Node3D
var _flag: MeshInstance3D
var _awning: MeshInstance3D
var _bunting: MeshInstance3D
var _plank: MeshInstance3D
var _lines: MeshInstance3D
var _line_mesh := ArrayMesh.new()
var _notes: Array[MeshInstance3D] = []
var _zzz: Array[MeshInstance3D] = []
## The bunting's pennants: their corners along the strings, and each one's colour (0 .. 3).
var _pennants := PackedVector3Array()
var _pennant_slot := PackedInt32Array()


## Lays the port out on its site (the world bake's home port: x, z, its
## seaward normal nx, nz and the quay's depth), sharing the towns' arts;
## its folk are drawn with the crews. Nothing is built yet.
func setup(p_site: Dictionary, arts: TradePort.Arts, world: World, crew: Crew) -> void:
	site = p_site
	depth = float(site.depth)
	title = "Puerto " + short_name(str(site.island))
	_arts = arts
	_world = world
	_crew = crew
	name = "HomePort"
	xf = Transform3D(Basis(Vector3.UP, atan2(float(site.nx), float(site.nz))), Vector3(float(site.x), 0.0, float(site.z)))
	inv = xf.affine_inverse()
	transform = xf
	visible = false
	for i in CAST.size():
		figures.append(Figure.new(CAST[i], i + 1))
	figures[DRINKER_A].prop = CrewModel.PROP_MUG
	figures[DRINKER_B].prop = CrewModel.PROP_MUG
	figures[LOOKOUT].prop = CrewModel.PROP_SPYGLASS
	_time = randf() * 100.0
	# its own planking (five lanterns' pools), boards and glyphs; the rest is the towns'
	_deck_mat = ShaderMaterial.new()
	_deck_mat.shader = preload("res://shaders/home_deck.gdshader")
	_deck_mat.set_shader_parameter("c_plank", _arts.deck.get_shader_parameter("c_plank"))
	_sign_mat = _arts.sign.duplicate() as ShaderMaterial
	_sign_mat.set_shader_parameter("atlas", preload("res://art/home_signs.png"))
	_wall_mat = _arts.sign.duplicate() as ShaderMaterial
	_glyph_mat = ShaderMaterial.new()
	_glyph_mat.shader = preload("res://shaders/home_glyph.gdshader")
	_glyph_mat.set_shader_parameter("glyphs", preload("res://art/home_glyphs.png"))
	_palm_mat = Flora.kit().materials["palm"]
	for p: Array in PALMS:
		var on_deck := not bool(p[5]) and absf(float(p[0])) < HALF and float(p[1]) > -depth
		if on_deck:
			_beach.append(0.0)
			continue
		var z: float = float(p[1]) - (depth if bool(p[5]) else 0.0)
		var w := xf * Vector3(float(p[0]), 0.0, z)
		var h := _world.ground_height(w.x, w.z)
		_beach.append(maxf(h, 0.2) - 0.2 if h > 0.1 else -1.0)
	crew.crowds.append(_draw_folk)


## An island's name without its "Isla" (the web's port name).
static func short_name(island: String) -> String:
	for p: String in ["Isla ", "Ilha ", "Ilhéu ", "Cayo ", "Punta ", "Baía ", "Roca "]:
		if island.begins_with(p):
			return island.substr(p.length()).strip_edges()
	return island


## Builds it `after` seconds from now, off the main thread (unless it is already).
func build_soon(after: float = BUILD_AFTER) -> void:
	if not built and _task < 0 and _town == null:
		_wait = after


## Builds it now (waiting for a build under way), into the scene.
func build_now() -> void:
	if built:
		return
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
	elif _town == null:
		_build()
	_wait = -1.0
	_finish()


## A frame while it waits: the build set going once its moment comes, and
## taken into the scene once it's done.
func prepare(dt: float) -> void:
	if built:
		return
	if _task >= 0:
		if WorkerThreadPool.is_task_completed(_task):
			WorkerThreadPool.wait_for_task_completion(_task)
			_task = -1
			_finish()
		return
	if _wait < 0.0:
		return
	_wait -= dt
	if _wait <= 0.0:
		_wait = -1.0
		_task = WorkerThreadPool.add_task(_build, false, "Puerto Marézia")


func _exit_tree() -> void:
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1


## World point -> the port's frame.
func to_port(p: Vector3) -> Vector3:
	return inv * p


## Unit vector along the quay (local +x, toward the tavern), and out to sea (world).
func along() -> Vector3:
	return Vector3(float(site.nz), 0.0, -float(site.nx))


func outward() -> Vector3:
	return Vector3(float(site.nx), 0.0, float(site.nz))


# ------------------------------------------------------------------ build

## Everything that's built, laid out off the scene tree (any thread).
func _build() -> void:
	var town := Node3D.new()
	town.name = "Town"
	var n := TownKit.new(41)
	_lamps.clear()
	_deck(n, town)
	_tavern(n, TAVERN.x, TAVERN.y)
	_loft(n, LOFT.x, LOFT.y)
	_warehouse(n, WAREHOUSE.x, WAREHOUSE.y)
	_tower(n, TOWER.x, TOWER.y)
	_props(n)
	_crane_base(n, CRANE.x, CRANE.y)
	_bunting_strings(town)
	var mi := _mesh(town, "Quay", n.commit_lod(), _arts.parts)
	mi.extra_cull_margin = 0.0
	_signs(town)
	_flag_build(town)
	_palms(town)
	_movers(town)
	town.add_child(TradePort.halo_mesh(_lamps, _arts.halo))
	_town = town
	tris = _count(town)


## Into the scene, with what only the main thread may touch.
func _finish() -> void:
	if _town == null:
		return
	add_child(_town)
	_wall_mat.set_shader_parameter("atlas", _wall_tex)
	for g in _notes:
		g.set_instance_shader_parameter("glyph", 0.0)
	for g in _zzz:
		g.set_instance_shader_parameter("glyph", 1.0)
	built = true
	_keys.clear()
	if not _look.is_empty():
		_apply_look()
	set_ship(ship)


func _mesh(parent: Node3D, n: String, m: Mesh, mat: Material, shadow := true) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = n
	mi.mesh = m
	mi.material_override = mat
	if not shadow:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


static func _count(root: Node) -> int:
	var count := 0
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var nd: Node = stack.pop_back()
		if nd is MeshInstance3D and (nd as MeshInstance3D).mesh != null:
			var m := (nd as MeshInstance3D).mesh
			for s in m.get_surface_count():
				count += m.surface_get_array_index_len(s) / 3
		elif nd is MultiMeshInstance3D and (nd as MultiMeshInstance3D).multimesh != null:
			var mm := (nd as MultiMeshInstance3D).multimesh
			# (the near cut of each palm, counted once)
			if not str(nd.name).ends_with("Mid") and mm.mesh != null:
				for s in mm.mesh.get_surface_count():
					count += mm.mesh.surface_get_array_index_len(s) / 3 * mm.instance_count
		stack.append_array(nd.get_children())
	return count


## The quay: planking on its pilings (each capped through the boards), braced
## along the face, a fender beam and rails, rope fenders, bollards, the
## lantern posts and the steps down to the beach.
func _deck(n: TownKit, town: Node3D) -> void:
	var D := depth
	var W := HALF * 2.0
	var slab := _mesh(town, "Deck", TradePort.slab(W, 0.32, D), _deck_mat)
	slab.position = Vector3(0.0, DECK - 0.16, -D * 0.5)
	var rnd := Mulberry32.new(17)
	var x := -W * 0.5 + 0.3
	while x <= W * 0.5:
		TradePort.pile(n, x, -0.25, rnd.next(), true)
		x += 4.0
	var z := -4.0
	while z > -D:
		TradePort.pile(n, -W * 0.5 + 0.3, z, rnd.next(), true)
		TradePort.pile(n, W * 0.5 - 0.3, z, rnd.next(), true)
		z -= 4.0
	z = -8.0
	while z > -D + 2.0:
		x = -W * 0.5 + 6.0
		while x < W * 0.5 - 4.0:
			var jitter := rnd.next() - 0.5
			TradePort.pile(n, x + jitter, z, rnd.next(), true)
			x += 8.0
		z -= 8.0
	x = -W * 0.5 + 0.3
	while x < W * 0.5 - 4.0:
		n.beam(Vector3(x, DECK - 0.45, -0.1), Vector3(x + 4.0, -0.9, -0.1), 0.07, TradePort.C_PILE)
		n.beam(Vector3(x, -0.9, -0.1), Vector3(x + 4.0, DECK - 0.45, -0.1), 0.07, TradePort.C_PILE)
		x += 4.0
	n.box(W + 0.4, 0.5, 0.34, Vector3(0.0, DECK - 0.3, 0.08), TradePort.C_TIMBER_DARK, 0.08)
	n.box(W + 0.4, 0.14, 0.4, Vector3(0.0, DECK + 0.07, 0.05), TownKit.shade(TradePort.C_TIMBER, 1.15), 0.05)
	for s: float in [-1.0, 1.0]:
		n.box(0.4, 0.14, D, Vector3(s * (W * 0.5 + 0.05), DECK + 0.07, -D * 0.5), TownKit.shade(TradePort.C_TIMBER, 1.15), 0.05)
	x = -W * 0.5 + 2.0
	while x < W * 0.5:
		n.torus(0.26, 0.11, 6, 12, Transform3D(Basis.IDENTITY, Vector3(x, DECK - 0.55, 0.32)), TownKit.lin("#c9b38a"))
		x += 6.5
	for b in BOLLARDS:
		n.lathe(PackedVector2Array([Vector2(0.24, 0.0), Vector2(0.22, 0.3), Vector2(0.16, 0.42), Vector2(0.2, 0.55), Vector2(0.26, 0.62), Vector2(0.01, 0.66)]),
				Transform3D(Basis.IDENTITY, Vector3(b, DECK + 0.08, -0.35)), TradePort.C_IRON, 10, TownKit.IRON)
	for p in LANTERNS:
		_lamps.append(TradePort.lantern(n, p.x, p.y, LANTERN_H))
	for i in 5:
		n.box(3.0, 0.16, 0.5, Vector3(-4.0, DECK - 0.36 * i - 0.1, -D - 0.25 - i * 0.48), TownKit.shade(TradePort.C_TIMBER, 1.05 - i * 0.03))


## The Salty Gull: ochre below, a teal storey over its sill beam, a tiled
## roof and a stone chimney (smoking), shuttered windows with flower boxes,
## a door with a lit pane and a bench on the porch.
func _tavern(n: TownKit, cx: float, cz: float) -> void:
	var W := 11.0
	var D := 8.0
	var y0 := DECK
	var front := cz + D * 0.5
	n.box(W, 3.6, D, Vector3(cx, y0 + 1.8, cz), C_OCHRE, 0.1)
	TradePort.siding(n, W - 0.5, 3.4, cx, y0, front + 0.02, C_OCHRE)
	n.box(W + 0.8, 0.32, D + 0.8, Vector3(cx, y0 + 3.7, cz), TradePort.C_TIMBER_DARK, 0.08)
	n.box(W + 0.5, 3.0, D + 0.5, Vector3(cx, y0 + 5.35, cz), C_TEAL, 0.1)
	TradePort.siding(n, W, 2.9, cx, y0 + 3.86, front + 0.28, C_TEAL)
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			n.box(0.42, 6.9, 0.42, Vector3(cx + sx * (W * 0.5 + 0.05), y0 + 3.45, cz + sz * (D * 0.5 + 0.05)), TradePort.C_TIMBER, 0.08)
	var top := y0 + 6.85
	n.gable(D + 0.5, 2.7, W + 0.5, Vector3(cx, top, cz), C_TEAL, true)
	n.roof(W, D + 0.5, 2.7, cx, top, cz, C_TERRACOTTA, true)
	# the chimney, course on course, and its cap
	var ch := Vector3(cx + 3.4, top + 2.0, cz - 1.6)
	for i in 10:
		var inset := 0.0 if i % 2 else 0.03
		n.box(1.0 - inset, 0.34, 1.0 - inset, Vector3(ch.x, ch.y - 1.7 + (i + 0.5) * 0.34, ch.z), TownKit.shade(TradePort.C_STONE, 0.85 if i % 2 else 0.97))
	n.box(1.25, 0.22, 1.25, Vector3(ch.x, top + 3.75, ch.z), TradePort.C_TIMBER_DARK)
	_chimney = Vector3(ch.x, top + 4.0, ch.z)
	# the door with its lit pane, the windows
	n.box(1.8, 2.7, 0.18, Vector3(cx, y0 + 1.35, front + 0.06), TradePort.C_CREAM)
	n.box(1.45, 2.45, 0.12, Vector3(cx, y0 + 1.25, front + 0.1), TradePort.C_DOOR)
	n.box(0.5, 0.42, 0.06, Vector3(cx, y0 + 1.9, front + 0.17), TradePort.C_GLASS, 0.0, TownKit.GLOW)
	n.ball(0.07, Vector3(cx + 0.5, y0 + 1.2, front + 0.2), TradePort.C_GOLD, TownKit.GILT)
	TradePort.window(n, cx - 3.4, y0 + 1.75, front + 0.08, 1.3, 1.1, C_SHUTTER_BLUE, true)
	TradePort.window(n, cx + 3.4, y0 + 1.75, front + 0.08, 1.3, 1.1, C_SHUTTER_BLUE, true)
	for wx: float in [-3.6, 0.0, 3.6]:
		TradePort.window(n, cx + wx, y0 + 5.3, front + 0.32, 1.0, 1.0, C_SHUTTER_GREEN, wx != 0.0)
	# a bench on the porch
	n.box(2.4, 0.12, 0.5, Vector3(cx - 3.4, y0 + 0.5, front + 0.6), TradePort.C_TIMBER)
	for sx: float in [-1.0, 1.0]:
		n.box(0.12, 0.5, 0.45, Vector3(cx - 3.4 + sx * 1.05, y0 + 0.25, front + 0.6), TradePort.C_TIMBER_DARK)


## The sail loft: open to the sea under a mossy lean-to roof, bolts of cloth
## on its racks, a workbench of paint pots, a treasure chest brimming by the
## door, and the shop flag (yours) on its pole over the roof.
func _loft(n: TownKit, cx: float, cz: float) -> void:
	var W := 9.0
	var D := 7.0
	var y0 := DECK
	var back := cz - D * 0.5
	n.box(W, 5.0, 0.4, Vector3(cx, y0 + 2.5, back), C_CORAL, 0.08)
	for s: float in [-1.0, 1.0]:
		n.box(0.4, 4.7, D, Vector3(cx + s * W * 0.5, y0 + 2.35, cz), C_CORAL, 0.08)
		n.box(0.5, 4.8, 0.5, Vector3(cx + s * W * 0.5, y0 + 2.4, cz + D * 0.5), TradePort.C_TIMBER, 0.08)
	TradePort.siding(n, W - 0.6, 4.8, cx, y0, back + 0.22, C_CORAL)
	# the roof, falling to the sea: courses of shingles from its back edge down
	var slope := atan2(1.3, D + 1.0)
	var length := Vector2(D + 1.4, 1.3).length()
	var down := Vector3(0.0, -sin(slope), cos(slope))
	var edge := Vector3(cx, y0 + 4.95, cz + 0.2) - down * length * 0.5
	var courses := ceili(length / 0.42)
	var cl := length / courses
	for k in courses:
		var c := edge + down * (cl * (k + 0.5)) + Vector3(0.0, 0.03, 0.0)
		n.box_xf(Transform3D(Basis(Vector3.RIGHT, slope - 0.06), c), Vector3(W + 1.2, 0.2, cl + 0.1), TownKit.shade(C_MOSS, 0.9 if k % 2 else 1.04))
	# the workbench and its paint pots
	n.box(3.4, 0.14, 1.1, Vector3(cx - 1.0, y0 + 0.95, cz + 1.2), TradePort.C_TIMBER)
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			n.box(0.12, 0.9, 0.12, Vector3(cx - 1.0 + sx * 1.5, y0 + 0.45, cz + 1.2 + sz * 0.42), TradePort.C_TIMBER_DARK)
	var pots := ["#c8352b", "#2f8ad8", "#f2c45a", "#2f7d3a", "#f3ecdc"]
	for i in pots.size():
		var p := Vector3(cx - 2.2 + i * 0.5, y0 + 1.14, cz + 1.25 + (i % 2) * 0.2)
		n.cyl(0.13, 0.12, 0.24, p, TradePort.C_IRON, 8, TownKit.IRON)
		n.cyl(0.115, 0.115, 0.02, p + Vector3(0.0, 0.125, 0.0), TownKit.lin(pots[i]), 8, TownKit.WOOD)
	# bolts of cloth on two racks
	for rack: Array in [[1.4, ["#c8352b", "#f3ecdc", "#27407a", "#f2c45a", "#141212"]], [2.7, ["#2f7d3a", "#e98fb0", "#f3ecdc", "#1fa3a0", "#e86a2c"]]]:
		var sy: float = rack[0]
		var cols: Array = rack[1]
		n.box(W - 1.4, 0.1, 0.8, Vector3(cx, y0 + sy, back + 0.65), TradePort.C_TIMBER)
		for i in cols.size():
			var col := TownKit.lin(cols[i])
			n.cyl(0.22, 0.22, 1.3, Vector3(cx - 3.0 + i * 1.5, y0 + sy + 0.27, back + 0.65), func(q: Vector3) -> Color:
				return TownKit.shade(col, 0.92 + absf(sin(q.y * 40.0)) * 0.1), 10, TownKit.WOOD, 0.0, PI * 0.5)
	# the treasure chest by the door, its lid thrown back, gold spilling out
	var tx := cx + 5.6
	var tz := cz + D * 0.5 + 1.7
	n.box(1.2, 0.6, 0.75, Vector3(tx, y0 + 0.3, tz), TradePort.C_DOOR, 0.06)
	for sx: float in [-0.45, 0.45]:
		n.box(0.1, 0.64, 0.8, Vector3(tx + sx, y0 + 0.32, tz), TradePort.C_GOLD, 0.0, TownKit.GILT)
	n.half_cyl(0.38, 1.2, Transform3D(Basis.IDENTITY, Vector3(tx, y0 + 0.62, tz - 0.38)) * Transform3D(Basis(Vector3.RIGHT, -1.9), Vector3.ZERO) * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.0, 0.38)), TradePort.C_DOOR)
	n.ball(0.5, Vector3(tx, y0 + 0.6, tz), TradePort.C_GOLD, TownKit.GILT, Vector3(1.1, 0.42, 0.68))
	var rnd := Mulberry32.new(9)
	for i in 9:
		var a := rnd.next() * TAU
		var px := tx + cos(a) * (0.8 + rnd.next() * 0.6)
		var pz := tz + sin(a) * (0.5 + rnd.next() * 0.5)
		n.cyl(0.1, 0.1, 0.03, Vector3(px, y0 + 0.02, pz), TradePort.C_GOLD, 10, TownKit.GILT, (rnd.next() - 0.5) * 0.4)
	# the sign's posts on the roof's edge, and the flagpole
	for sx: float in [-1.7, 1.7]:
		n.box(0.12, 1.5, 0.12, Vector3(cx + sx, y0 + 5.0, cz + D * 0.5 + 0.45), TradePort.C_TIMBER_DARK)
	n.cyl(0.07, 0.11, 7.2, Vector3(FLAG_AT.x, y0 + 8.6, FLAG_AT.z), TradePort.C_TIMBER_DARK, 6)
	n.ball(0.16, Vector3(FLAG_AT.x, y0 + 12.3, FLAG_AT.z), TradePort.C_GOLD, TownKit.GILT)
	# the awning's posts (the awning wears your sails' colours)
	for s: float in [-1.0, 1.0]:
		n.cyl(0.07, 0.08, 3.4, Vector3(cx + s * 4.6, DECK + 1.7, cz + D * 0.5 + 2.1), TradePort.C_TIMBER_DARK, 6)


## The cargo shed: gabled to the sea under slate, its great doors open on a
## dark hold, a porthole in the gable, the hoist beam with its rope and
## hook, and an anchor leant against the wall.
func _warehouse(n: TownKit, cx: float, cz: float) -> void:
	var W := 11.0
	var D := 9.0
	var y0 := DECK
	var front := cz + D * 0.5
	var H := 5.4
	n.box(W, H, D, Vector3(cx, y0 + H * 0.5, cz), C_SHED, 0.1)
	TradePort.siding(n, W - 0.5, H - 0.1, cx, y0, front + 0.02, C_SHED)
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			n.box(0.4, H + 0.1, 0.4, Vector3(cx + sx * (W * 0.5 + 0.02), y0 + H * 0.5, cz + sz * (D * 0.5 + 0.02)), TradePort.C_CREAM, 0.08)
	n.gable(W + 0.2, 3.0, D + 0.2, Vector3(cx, y0 + H, cz), C_SHED, false)
	n.roof(D, W + 0.2, 3.0, cx, y0 + H, cz, C_SLATE, false)
	# the doors, one ajar and one flung wide, ledged and braced like a barn's
	n.box(4.4, 4.0, 0.2, Vector3(cx, y0 + 2.0, front + 0.08), TradePort.C_CREAM)
	n.box(3.8, 3.7, 0.1, Vector3(cx, y0 + 1.85, front + 0.06), TownKit.lin("#0c0a08"))
	var dark := TownKit.shade(TradePort.C_DOOR, 0.72)
	for leaf: Vector2 in [Vector2(-1.0, 0.12), Vector2(1.0, 1.25)]:
		var s := leaf.x
		var hinge := Transform3D(Basis(Vector3.UP, s * leaf.y), Vector3(cx + s * 1.9, y0 + 1.85, front + 0.16))
		n.box_xf(hinge * Transform3D(Basis.IDENTITY, Vector3(-s * 0.95, 0.0, 0.0)), Vector3(1.9, 3.7, 0.12), TradePort.C_DOOR)
		for y: float in [-1.2, 1.2]:
			n.box_xf(hinge * Transform3D(Basis.IDENTITY, Vector3(-s * 0.95, y, 0.075)), Vector3(1.72, 0.16, 0.04), dark)
		n.box_xf(hinge * Transform3D(Basis(Vector3.BACK, s * 0.98), Vector3(-s * 0.95, 0.0, 0.075)), Vector3(2.7, 0.14, 0.035), dark)
	# the porthole in the gable, and the hoist
	n.torus(0.5, 0.1, 6, 16, Transform3D(Basis.IDENTITY, Vector3(cx, y0 + H + 1.65, front + 0.22)), TradePort.C_CREAM)
	n.cyl(0.45, 0.45, 0.06, Vector3(cx, y0 + H + 1.65, front + 0.18), TownKit.lin("#18222a"), 16, TownKit.WOOD, PI * 0.5)
	n.box(0.32, 0.32, 2.4, Vector3(cx, y0 + H + 2.45, front + 1.0), TradePort.C_TIMBER)
	n.torus(0.2, 0.06, 6, 12, Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(cx, y0 + H + 2.1, front + 2.0)), TradePort.C_IRON, TownKit.IRON)
	n.cyl(0.025, 0.025, 2.5, Vector3(cx, y0 + H + 0.85, front + 2.0), TownKit.lin("#b79a6a"), 4)
	n.torus(0.12, 0.03, 4, 10, Transform3D(Basis.IDENTITY, Vector3(cx, y0 + H - 0.5, front + 2.0)), TradePort.C_IRON, TownKit.IRON, PI * 1.4)
	# an anchor leant on the wall
	var ax := cx + W * 0.5 + 0.6
	var az := front - 1.5
	n.box(0.16, 2.4, 0.16, Vector3(ax, y0 + 1.2, az), TradePort.C_IRON, 0.0, TownKit.IRON, 0.0, 0.0, 0.2)
	n.box(1.2, 0.14, 0.14, Vector3(ax - 0.38, y0 + 2.0, az), TradePort.C_IRON, 0.0, TownKit.IRON, 0.0, 0.0, 0.2)
	n.torus(0.75, 0.09, 6, 16, TownKit.place(Vector3(ax + 0.22, y0 + 0.62, az), 0.0, 0.0, PI + 0.2), TradePort.C_IRON, TownKit.IRON, PI)


## The lookout tower: four raked legs, cross-braced, a railed platform under
## a pyramid roof with its lamp, a ladder up the front; at its foot a cannon
## guarding the harbour mouth and a pyramid of shot.
func _tower(n: TownKit, cx: float, cz: float) -> void:
	var H := TOWER_H
	var y0 := DECK
	var lo := 1.5
	var hi := 1.2
	var corners: Array[Vector2] = [Vector2(-1.0, -1.0), Vector2(1.0, -1.0), Vector2(1.0, 1.0), Vector2(-1.0, 1.0)]
	for c in corners:
		n.beam(Vector3(cx + c.x * lo, y0, cz + c.y * lo), Vector3(cx + c.x * hi, y0 + H, cz + c.y * hi), 0.17, TradePort.C_TIMBER)
	for i in 4:
		var a := corners[i]
		var b := corners[(i + 1) % 4]
		for span: Vector2 in [Vector2(0.6, 4.6), Vector2(4.6, 8.6)]:
			var ka := lo + (hi - lo) * (span.x / H)
			var kb := lo + (hi - lo) * (span.y / H)
			n.beam(Vector3(cx + a.x * ka, y0 + span.x, cz + a.y * ka), Vector3(cx + b.x * kb, y0 + span.y, cz + b.y * kb), 0.06, TradePort.C_TIMBER_DARK)
			n.beam(Vector3(cx + b.x * ka, y0 + span.x, cz + b.y * ka), Vector3(cx + a.x * kb, y0 + span.y, cz + a.y * kb), 0.06, TradePort.C_TIMBER_DARK)
	var py := y0 + H
	n.box(3.6, 0.3, 3.6, Vector3(cx, py, cz), TradePort.C_TIMBER, 0.08)
	for c in corners:
		n.box(0.14, 1.1, 0.14, Vector3(cx + c.x * 1.7, py + 0.6, cz + c.y * 1.7), TradePort.C_TIMBER_DARK)
		n.box(0.14, 2.3, 0.14, Vector3(cx + c.x * 1.55, py + 1.3, cz + c.y * 1.55), TradePort.C_TIMBER_DARK)
	for s: float in [-1.0, 1.0]:
		n.box(3.5, 0.1, 0.1, Vector3(cx, py + 1.1, cz + s * 1.7), TradePort.C_TIMBER)
		n.box(0.1, 0.1, 3.5, Vector3(cx + s * 1.7, py + 1.1, cz), TradePort.C_TIMBER)
	n.cone(2.9, 1.7, Vector3(cx, py + 3.25, cz), TownKit.shade(C_TERRACOTTA, 0.9), 4, TownKit.WOOD, true, PI * 0.25)
	n.ball(0.18, Vector3(cx, py + 4.25, cz), TradePort.C_GOLD, TownKit.GILT)
	n.ball(0.24, Vector3(cx, py + 1.85, cz), TradePort.C_LAMP, TownKit.GLOW, Vector3(1.0, 1.25, 1.0))
	n.cone(0.3, 0.26, Vector3(cx, py + 2.2, cz), TradePort.C_IRON, 6, TownKit.IRON)
	_lamps.append(Vector4(cx, py + 1.85, cz, 1.0))
	# the ladder up its front
	for s: float in [-1.0, 1.0]:
		n.beam(Vector3(cx + s * 0.32, y0, cz + lo + 0.1), Vector3(cx + s * 0.32, py + 0.2, cz + hi + 0.16), 0.045, TradePort.C_TIMBER_DARK)
	var y := 0.3
	while y < H:
		var k := lo + 0.1 + (hi + 0.06 - lo) * (y / H)
		n.box(0.64, 0.05, 0.05, Vector3(cx, y0 + y, cz + k), TradePort.C_TIMBER)
		y += 0.36
	# a cannon on its carriage, and its shot
	var gx := cx - 3.6
	var gz := -1.6
	n.box(1.0, 0.36, 1.5, Vector3(gx, y0 + 0.28, gz), TradePort.C_DOOR, 0.06)
	for s: float in [-1.0, 1.0]:
		n.cyl(0.24, 0.24, 0.12, Vector3(gx + s * 0.55, y0 + 0.24, gz), TradePort.C_TIMBER_DARK, 10, TownKit.WOOD, 0.0, PI * 0.5)
	n.lathe(PackedVector2Array([Vector2(0.01, -0.1), Vector2(0.11, -0.08), Vector2(0.2, -0.01), Vector2(0.22, 0.04), Vector2(0.2, 0.5), Vector2(0.16, 1.4), Vector2(0.19, 1.5), Vector2(0.19, 1.56), Vector2(0.01, 1.58)]),
			Transform3D(Basis(Vector3.RIGHT, PI * 0.5 - 0.12), Vector3(gx, y0 + 0.62, gz - 0.55)), TradePort.C_IRON, 10, TownKit.IRON)
	var m := n.kit.verts.size()
	for lvl in 3:
		var count := 3 - lvl
		for i in count:
			for j in count:
				n.kit.sphere(Transform3D(Basis.IDENTITY, Vector3(gx - 1.6 + (i - (count - 1) * 0.5) * 0.33, y0 + 0.16 + lvl * 0.27, gz - 0.2 + (j - (count - 1) * 0.5) * 0.33)), 0.16, 6, 4)
	n.paint_from(m, TradePort.C_IRON, TownKit.IRON)


func _put_barrel(n: TownKit, x: float, z: float, h: float = 0.95, tilt: float = 0.0, ry: float = 0.0) -> void:
	n.barrel(Transform3D(Basis(Vector3.UP, ry) * Basis(Vector3.BACK, tilt), Vector3(x, DECK + (0.37 if tilt != 0.0 else h * 0.5), z)), h, 0.37, 8)


func _put_crate(n: TownKit, x: float, y: float, z: float, s: float, ry: float) -> void:
	n.crate(Transform3D(Basis(Vector3.UP, ry), Vector3(x, DECK + y + s * 0.5, z)), s)


## What lies about the quay: crates and barrels by the shed, round the
## barrel roller's crates and on the tavern's porch, the musician's barrel,
## a table and stools, coils of rope by the bollards, the deck palms'
## planters and a signpost.
func _props(n: TownKit) -> void:
	_put_crate(n, -24.6, 0.0, -9.0, 1.1, 0.1)
	_put_crate(n, -23.4, 0.0, -9.3, 1.0, -0.2)
	_put_crate(n, -24.1, 1.1, -9.1, 0.9, 0.3)
	_put_crate(n, -14.2, 0.0, -8.6, 0.9, 0.5)
	_put_barrel(n, -12.8, -8.9)
	_put_barrel(n, -13.4, -7.9, 0.95, PI * 0.5, 0.4)
	_put_crate(n, -8.6, 0.0, -5.2, 1.0, 0.2)
	_put_crate(n, -7.4, 0.0, -5.0, 0.9, -0.15)
	_put_crate(n, -8.0, 0.95, -5.1, 0.8, 0.5)
	_put_barrel(n, -6.3, -5.4, 0.9)
	_put_barrel(n, 14.6, -9.3)
	_put_barrel(n, 15.4, -9.6, 0.9)
	_put_barrel(n, 23.6, -9.4, 0.95, PI * 0.5, 1.2)
	_put_barrel(n, 13.2, -6.4, 0.9)
	# the drinkers' table and stools, and a bottle on it
	n.cyl(0.65, 0.65, 0.1, Vector3(21.0, DECK + 0.85, -5.6), TradePort.C_TIMBER, 14)
	n.cyl(0.1, 0.16, 0.85, Vector3(21.0, DECK + 0.42, -5.6), TradePort.C_TIMBER_DARK)
	n.cyl(0.32, 0.36, 0.06, Vector3(21.0, DECK + 0.03, -5.6), TradePort.C_TIMBER_DARK, 10)
	for sx: float in [-1.2, 1.2]:
		n.cyl(0.27, 0.27, 0.08, Vector3(21.0 + sx, DECK + 0.5, -5.6), TradePort.C_TIMBER, 10)
		n.cyl(0.07, 0.12, 0.5, Vector3(21.0 + sx, DECK + 0.25, -5.6), TradePort.C_TIMBER_DARK)
	var glass := TownKit.lin("#2d6b3a")
	n.cyl(0.06, 0.08, 0.28, Vector3(21.1, DECK + 1.04, -5.4), glass, 8)
	n.cyl(0.025, 0.03, 0.12, Vector3(21.1, DECK + 1.24, -5.4), glass, 6)
	for x: float in [-19.8, 5.8, 13.8]:
		for i in 3:
			n.torus(0.42 - i * 0.07, 0.07, 5, 14, TownKit.place(Vector3(x, DECK + 0.06 + i * 0.12, -1.2), PI * 0.5), TownKit.lin("#c9a97a"))
	for p: Vector2 in [Vector2(-11.0, -14.0), Vector2(-5.2, -14.4), Vector2(11.2, -19.5)]:
		n.cyl(0.95, 1.05, 0.5, Vector3(p.x, DECK + 0.25, p.y), TradePort.C_TIMBER, 12)
		n.cyl(0.85, 0.85, 0.05, Vector3(p.x, DECK + 0.47, p.y), TownKit.lin("#d8c49a"), 12)
	# the signpost, its arms pointing every way
	n.cyl(0.08, 0.1, 2.6, Vector3(-0.2, DECK + 1.3, -7.6), TradePort.C_TIMBER_DARK, 6)
	for arm: Array in [[2.2, 0.3, TradePort.C_CREAM], [1.85, -0.5, TownKit.lin("#e7b866")], [1.5, 2.6, TownKit.lin("#9fd3d0")]]:
		var at := Transform3D(Basis(Vector3.UP, float(arm[1])), Vector3(-0.2, DECK + float(arm[0]), -7.6))
		n.box_xf(at * Transform3D(Basis.IDENTITY, Vector3(0.5, 0.0, 0.0)), Vector3(1.1, 0.24, 0.06), arm[2] as Color)


## The crane's mast and its struts (its boom slews: _movers).
func _crane_base(n: TownKit, cx: float, cz: float) -> void:
	var y0 := DECK
	n.cyl(0.32, 0.4, 6.2, Vector3(cx, y0 + 3.1, cz), TradePort.C_TIMBER, 8)
	for i in 4:
		var a := i / 4.0 * TAU + PI * 0.25
		n.beam(Vector3(cx + cos(a) * 1.5, y0, cz + sin(a) * 1.5), Vector3(cx, y0 + 2.4, cz), 0.09, TradePort.C_TIMBER_DARK)
	n.cyl(0.55, 0.55, 0.35, Vector3(cx, y0 + 0.18, cz), TradePort.C_TIMBER_DARK, 10)


## A point along a string of bunting, `f` of the way from a to b: it hangs
## in the same curve as its rope (RopeKit's), sagging 7% of its length.
static func _hang(a: Vector3, b: Vector3, f: float) -> Vector3:
	var p := a.lerp(b, f)
	p.y -= 4.0 * f * (1.0 - f) * a.distance_to(b) * 0.07
	return p


## The bunting's strings (their pennants are coloured by the look: _apply_look).
func _bunting_strings(town: Node3D) -> void:
	var rk := RopeKit.new(5)
	_pennants.clear()
	_pennant_slot.clear()
	var slot := 0
	for i in range(0, BUNTING.size(), 2):
		var a := BUNTING[i]
		var b := BUNTING[i + 1]
		var count := floori(a.distance_to(b) / 0.62)
		rk.rope(a, b, 0.015, Color("#3a2a1c"), a.distance_to(b) * 0.07, count * 2)
		for k in count:
			var t0 := (k + 0.15) / count
			var t1 := (k + 0.85) / count
			_pennants.append(_hang(a, b, t0))
			_pennants.append(_hang(a, b, (t0 + t1) * 0.5) + Vector3(0.0, -0.5, 0.0))
			_pennants.append(_hang(a, b, t1))
			_pennant_slot.append(slot % 4)
			slot += 1
	_mesh(town, "BuntingLines", rk.commit(), _arts.rope, false)


## The painted boards (the tavern's, the loft's and the shed's names, from
## art/home_signs.png), and the loft's wall of famous flags (drawn here).
func _signs(town: Node3D) -> void:
	var n := TownKit.new(43)
	var boards := [
		[4.6, 0.86, 0, Vector3(19.0, DECK + 3.05, -10.28)],
		[4.4, 0.83, 1, Vector3(3.0, DECK + 5.55, -9.48)],
		[4.6, 0.86, 2, Vector3(-18.5, DECK + 5.85, -9.76)],
	]
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	for bd: Array in boards:
		var w: float = bd[0]
		var h: float = bd[1]
		var p: Vector3 = bd[3]
		var v0 := int(bd[2]) / 3.0
		var v1 := v0 + 1.0 / 3.0
		_quad_uv(pos, uv, idx, p, w, h, v0 + 0.002, v1 - 0.002)
		n.box(w + 0.12, h + 0.12, 0.08, p - Vector3(0.0, 0.0, 0.05), TradePort.C_TIMBER_DARK)
	_mesh(town, "Signs", _uv_mesh(pos, uv, idx), _sign_mat)
	_mesh(town, "SignBoards", n.commit(), _arts.parts)
	# the wall of flags: four famous ships' colours on dark boards
	var img := Image.create(512, 96, false, Image.FORMAT_RGBA8)
	img.fill(Color("#4a2e18"))
	var famous := [1, 3, 5, 2]
	for i in famous.size():
		var f := Heraldry.render(Heraldry.flag_svg(ShipLook.preset(famous[i]).flag, 110.0, 72.0, Vector2i(110, 72)))
		if f != null:
			f.convert(Image.FORMAT_RGBA8)
			img.blend_rect(f, Rect2i(0, 0, f.get_width(), f.get_height()), Vector2i(14 + i * 125, 10))
	img.generate_mipmaps()
	_wall_tex = ImageTexture.create_from_image(img)
	var wp := PackedVector3Array()
	var wuv := PackedVector2Array()
	var widx := PackedInt32Array()
	_quad_uv(wp, wuv, widx, Vector3(3.0, DECK + 3.95, -16.7), 4.6, 0.86, 0.0, 1.0)
	_mesh(town, "FlagWall", _uv_mesh(wp, wuv, widx), _wall_mat, false)


## A board facing +z, w x h round p, its texture from rows v0 .. v1.
static func _quad_uv(pos: PackedVector3Array, uv: PackedVector2Array, idx: PackedInt32Array, p: Vector3, w: float, h: float, v0: float, v1: float) -> void:
	var o := pos.size()
	pos.append_array([p + Vector3(-w * 0.5, h * 0.5, 0.0), p + Vector3(w * 0.5, h * 0.5, 0.0), p + Vector3(w * 0.5, -h * 0.5, 0.0), p + Vector3(-w * 0.5, -h * 0.5, 0.0)])
	uv.append_array([Vector2(0.0, v0), Vector2(1.0, v0), Vector2(1.0, v1), Vector2(0.0, v1)])
	idx.append_array([o, o + 1, o + 2, o, o + 2, o + 3])


static func _uv_mesh(pos: PackedVector3Array, uv: PackedVector2Array, idx: PackedInt32Array) -> ArrayMesh:
	var nrm := PackedVector3Array()
	nrm.resize(pos.size())
	nrm.fill(Vector3.BACK)
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = pos
	a[Mesh.ARRAY_NORMAL] = nrm
	a[Mesh.ARRAY_TEX_UV] = uv
	a[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	return mesh


## The shop flag on the loft's roof: her own flag (her flag's material, so
## every stroke of the Shipwright's brush shows on it), 4.6 m on the fly,
## turned by the wind.
func _flag_build(town: Node3D) -> void:
	var w := 4.6
	var h := w * ShipModel.FLAG_ASPECT
	var gx := 18
	var gy := 5
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	for j in gy + 1:
		for i in gx + 1:
			var u := float(i) / gx
			var v := float(j) / gy
			pos.append(Vector3(u * w, -v * h, 0.0))
			uv.append(Vector2(u, v))
	for j in gy:
		for i in gx:
			var a := j * (gx + 1) + i
			idx.append_array([a, a + 1, a + gx + 2, a, a + gx + 2, a + gx + 1])
	var mesh := _uv_mesh(pos, uv, idx)
	mesh.custom_aabb = mesh.get_aabb().grow(0.6)
	_flag_pivot = Node3D.new()
	_flag_pivot.name = "FlagPivot"
	_flag_pivot.position = FLAG_AT
	town.add_child(_flag_pivot)
	_flag = _mesh(_flag_pivot, "Flag", mesh, null)


## The palms: three in planters on the quay (the hammock slung between two
## of them), the rest along the beach behind; each the island planting's
## palm that leans most like the web's, grown to its height.
func _palms(town: Node3D) -> void:
	var trunk := [8.5, 10.5, 7.0]
	var leans := [1.6, 2.4, 0.9]
	var bufs: Array[PackedFloat32Array] = [PackedFloat32Array(), PackedFloat32Array(), PackedFloat32Array()]
	for i in PALMS.size():
		var p: Array = PALMS[i]
		if _beach[i] < 0.0:
			continue
		var x: float = p[0]
		var z: float = float(p[1]) - (depth if bool(p[5]) else 0.0)
		var height: float = p[2]
		var lean: float = p[3]
		var on_deck := not bool(p[5]) and absf(x) < HALF and z > -depth
		var y := DECK + 0.45 if on_deck else _beach[i]
		var best := 0
		for v in 3:
			if absf(leans[v] * height / trunk[v] - lean) < absf(leans[best] * height / trunk[best] - lean):
				best = v
		var s: float = height / trunk[best]
		var b := Basis(Vector3.UP, float(p[4])).scaled(Vector3.ONE * s)
		bufs[best].append_array(PackedFloat32Array([b.x.x, b.y.x, b.z.x, x, b.x.y, b.y.y, b.z.y, y, b.x.z, b.y.z, b.z.z, z, 1.0, 1.0, 1.0, fmod(i * 0.37 + 0.13, 1.0)]))
	for v in 3:
		var count := bufs[v].size() / 16
		if count == 0:
			continue
		for lv in 2:
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.use_custom_data = true
			mm.mesh = _arts.palms[v] if lv == 0 else _arts.palms_mid[v]
			mm.instance_count = count
			mm.buffer = bufs[v]
			var mmi := MultiMeshInstance3D.new()
			mmi.name = "Palms%d%s" % [v, "" if lv == 0 else "Mid"]
			mmi.multimesh = mm
			mmi.material_override = _palm_mat
			if lv == 0:
				mmi.visibility_range_end = 110.0
				mmi.visibility_range_end_margin = 8.0
			else:
				mmi.visibility_range_begin = 110.0
				mmi.visibility_range_begin_margin = 8.0
			town.add_child(mmi)


## What moves: the rolled barrel, the porter's crate, the fisherman's rod and
## float, the squeezebox, the painter's brush and rowboat, the swabbie's mop,
## the hammock, the crane's boom and load, the gangplank and lines, the
## awning and bunting (in her colours), and the notes and snores.
func _movers(town: Node3D) -> void:
	var k := TownKit.new(51)
	k.barrel(Transform3D(Basis(Vector3.BACK, PI * 0.5), Vector3.ZERO), 0.9, 0.36, 10)
	_barrel = _mesh(town, "RolledBarrel", k.commit(), _arts.parts)
	_crate = _mesh(town, "Crate", _arts.carry["crate"], _arts.parts)
	_rod = _mesh(town, "Rod", _arts.rod, _arts.parts)
	_bobber = _mesh(town, "Float", _arts.bobber, _arts.parts, false)
	# the squeezebox: its bellows between two ends
	k = TownKit.new(52)
	for i in 6:
		k.box(0.06, 0.32, 0.22, Vector3(-0.18 + i * 0.072, 0.0, 0.0), TownKit.lin("#9c2a2a" if i % 2 else "#f0e2c0"))
	for s: float in [-1.0, 1.0]:
		k.box(0.08, 0.36, 0.25, Vector3(s * 0.25, 0.0, 0.0), TownKit.lin("#2a1f16"))
	_accordion = _mesh(town, "Squeezebox", k.commit(), _arts.parts)
	# the painter's long brush (its tip takes your topsides' colour)
	k = TownKit.new(53)
	k.cyl(0.025, 0.025, 1.7, Vector3(0.0, -0.85, 0.0), TownKit.lin("#b8864e"), 6)
	k.cyl(0.06, 0.04, 0.08, Vector3(0.0, -1.72, 0.0), TownKit.lin("#8c8a84"), 8, TownKit.IRON)
	_brush = _mesh(town, "Brush", k.commit(), _arts.parts)
	_brush_tip = _mesh(_brush, "Tip", null, _arts.parts)
	# the mop
	k = TownKit.new(54)
	k.cyl(0.025, 0.025, 1.5, Vector3(0.0, -0.75, 0.0), TownKit.lin("#b8864e"), 6)
	for i in 9:
		var a := i / 9.0 * TAU
		var at := Transform3D(Basis(Vector3.RIGHT, sin(a) * 0.5) * Basis(Vector3.BACK, cos(a) * 0.5), Vector3(cos(a) * 0.06, -1.6, sin(a) * 0.06))
		k.beam(at * Vector3(0.0, -0.14, 0.0), at * Vector3(0.0, 0.14, 0.0), 0.03, TownKit.lin("#e8e0cc"), TownKit.WOOD, 5)
	_mop = _mesh(town, "Mop", k.commit(), _arts.parts)
	_boat = _mesh(town, "Rowboat", _rowboat(), _arts.parts)
	_paint_top = _mesh(_boat, "Paint", null, _arts.parts, false)
	_hammock = _mesh(town, "Hammock", _hammock_mesh(), _arts.parts)
	# the crane's slewing boom, its counterweight and the load on its hook
	k = TownKit.new(55)
	k.beam(Vector3(0.0, 0.0, -1.2), Vector3(0.0, 2.6, 6.6), 0.15, TradePort.C_TIMBER)
	k.beam(Vector3(0.0, -0.6, 0.0), Vector3(0.0, 2.4, 6.0), 0.07, TradePort.C_TIMBER_DARK)
	k.box(1.0, 0.8, 0.9, Vector3(0.0, -0.1, -1.4), TradePort.C_STONE, 0.1)
	k.cyl(0.42, 0.42, 0.5, Vector3(0.0, 0.3, 0.0), TradePort.C_TIMBER_DARK, 10)
	k.torus(0.22, 0.06, 6, 12, Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(0.0, 2.55, 6.6)), TradePort.C_IRON, TownKit.IRON)
	_boom = _mesh(town, "Boom", k.commit(), _arts.parts)
	k = TownKit.new(56)
	k.crate(Transform3D(Basis.IDENTITY, Vector3(0.0, -0.6, 0.0)), 0.95)
	for bz: float in [0.25, -0.38]:
		k.barrel(Transform3D(Basis(Vector3.BACK, PI * 0.5), Vector3(0.0, -1.28, bz)), 0.8, 0.3, 10)
	_load = _mesh(_boom, "Load", k.commit(), _arts.parts)
	_plank = _mesh(town, "Gangplank", _arts.plank, _arts.parts)
	_plank.visible = false
	_lines = _mesh(town, "Lines", _line_mesh, _arts.rope, false)
	_awning = _mesh(town, "Awning", null, _arts.parts)
	_bunting = _mesh(town, "Bunting", null, _arts.parts)
	# the notes and the snores: cards the glyph shader turns to the eye
	var card := _uv_mesh(PackedVector3Array([Vector3(-0.5, 0.5, 0.0), Vector3(0.5, 0.5, 0.0), Vector3(0.5, -0.5, 0.0), Vector3(-0.5, -0.5, 0.0)]),
			PackedVector2Array([Vector2(0.0, 0.0), Vector2(1.0, 0.0), Vector2(1.0, 1.0), Vector2(0.0, 1.0)]), PackedInt32Array([0, 1, 2, 0, 2, 3]))
	card.custom_aabb = AABB(Vector3(-0.75, -0.75, -0.75), Vector3(1.5, 1.5, 1.5))
	for i in 6:
		var g := _mesh(town, ("Note%d" if i < 3 else "Snore%d") % (i % 3), card, _glyph_mat, false)
		if i < 3:
			_notes.append(g)
		else:
			_zzz.append(g)


## The painter's rowboat: a blue hull (cream below), its wooden insides and
## floor, a rim, two thwarts, the oars shipped along its sides and a bucket of
## paint (whose colour is the look's: _apply_look).
func _rowboat() -> ArrayMesh:
	var k := TownKit.new(57)
	var shell := Transform3D(Basis.from_scale(Vector3(0.85, 0.5, 1.7)), Vector3.ZERO)
	# split where the paint changes (y -0.32), so the line is crisp
	var cut := acos(-0.64)
	var m := k.kit.verts.size()
	k.kit.sphere(shell, 1.0, 16, 3, 0.0, TAU, PI * 0.5, cut - PI * 0.5)
	k.paint_from(m, C_SHUTTER_BLUE, TownKit.WOOD)
	m = k.kit.verts.size()
	k.kit.sphere(shell, 1.0, 16, 3, 0.0, TAU, cut, PI - cut)
	k.paint_from(m, TownKit.lin("#f3ecdc"), TownKit.WOOD)
	# her planking inside, down to the floor (the hull seen from within)
	m = k.kit.verts.size()
	var i0 := k.kit.indices.size()
	k.kit.sphere(Transform3D(Basis.from_scale(Vector3(0.8, 0.48, 1.62)), Vector3(0.0, 0.0, 0.0)), 1.0, 16, 2, 0.0, TAU, PI * 0.5, acos(-0.5) - PI * 0.5)
	_flip(k.kit, m, i0)
	k.paint_from(m, TownKit.shade(TownKit.lin("#a9814f"), 0.8), TownKit.WOOD)
	var rim := PackedVector3Array()
	for i in 16:
		var a := i / 16.0 * TAU
		rim.append(Vector3(cos(a) * 0.83, 0.02, sin(a) * 1.66))
	m = k.kit.verts.size()
	k.kit.tube(rim, 0.06, true, 5, 2)
	k.paint_from(m, TradePort.C_TIMBER_DARK, TownKit.WOOD)
	m = k.kit.verts.size()
	k.kit.disc(Transform3D(Basis(Vector3(0.72, 0.0, 0.0), Vector3(0.0, 0.0, 1.5), Vector3(0.0, 1.0, 0.0)), Vector3(0.0, -0.235, 0.0)), 1.0, 14)
	k.paint_from(m, TownKit.lin("#a9814f"), TownKit.WOOD)
	for z: float in [-0.8, 0.85]:
		k.box(1.5, 0.06, 0.28, Vector3(0.0, -0.08, z), TradePort.C_TIMBER)
	for s: float in [-1.0, 1.0]:
		k.cyl(0.03, 0.03, 2.6, Vector3(s * 0.55, 0.05, 0.0), TownKit.lin("#c9a97a"), 5, TownKit.WOOD, PI * 0.5)
	k.cyl(0.17, 0.14, 0.3, Vector3(-0.3, -0.08, -0.95), TradePort.C_IRON, 10)
	return k.commit()


## Turns the faces laid down since (v0, i0) inside out.
static func _flip(kit: MeshKit, v0: int, i0: int) -> void:
	for i in range(i0, kit.indices.size(), 3):
		var t := kit.indices[i + 1]
		kit.indices[i + 1] = kit.indices[i + 2]
		kit.indices[i + 2] = t
	for v in range(v0, kit.verts.size()):
		kit.normals[v] = -kit.normals[v]


## The hammock: striped canvas sagging between its spreaders (both faces),
## and the ropes up to the palms' trunks; slung at its ends' level, which it
## swings about.
func _hammock_mesh() -> ArrayMesh:
	var k := TownKit.new(58)
	var cols := 15
	var rows := 6
	var grid := PackedVector3Array()
	for j in rows:
		for i in cols:
			var x := -1.3 + 2.6 * i / (cols - 1)
			var z := -0.5 + 1.0 * j / (rows - 1)
			var u := x / 1.3
			grid.append(Vector3(x, -0.42 * (1.0 - u * u) + pow(z * 2.0, 2.0) * 0.22 * (1.0 - u * u * 0.6), z * (0.55 + 0.45 * absf(u))))
	var nrm := PackedVector3Array()
	for j in rows:
		for i in cols:
			var dx := grid[j * cols + mini(i + 1, cols - 1)] - grid[j * cols + maxi(i - 1, 0)]
			var dz := grid[mini(j + 1, rows - 1) * cols + i] - grid[maxi(j - 1, 0) * cols + i]
			nrm.append(dz.cross(dx).normalized())
	var red := TownKit.lin("#c8352b")
	var cream := TownKit.lin("#f3ecdc")
	for j in rows - 1:
		for i in cols - 1:
			var q := [j * cols + i, j * cols + i + 1, (j + 1) * cols + i + 1, (j + 1) * cols + i]
			var mid := (grid[q[0]].x + grid[q[1]].x) * 0.5
			var col := red if posmod(floori((mid + 1.3) * 2.3), 2) == 1 else cream
			for face in 2:
				var m := k.kit.verts.size()
				var s := 1.0 if face == 0 else -1.0
				for c: int in q:
					k.kit.add_vertex(grid[c], nrm[c] * s)
				# up is the face: corners wound counter-clockwise seen from above
				if face == 0:
					k.kit.quad(m, m + 3, m + 2, m + 1)
				else:
					k.kit.quad(m, m + 1, m + 2, m + 3)
				k.paint_from(m, col, TownKit.WOOD)
	var rope := TownKit.lin("#5a4632")
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			k.beam(Vector3(sx * 1.3, 0.0, sz * 0.25), Vector3(sx * 2.75, 0.55, 0.0), 0.015, rope, TownKit.WOOD, 4)
	return k.commit()


# ------------------------------------------------------------------ look and ship

## Her look on the quay: the awning striped in her sails' colours, the
## bunting in her flag's, the painter's brush and bucket in her topsides'.
func set_look(look: Dictionary) -> void:
	_look = look
	if built:
		_apply_look()


func _apply_look() -> void:
	var fl: Dictionary = _look.flag
	var sl: Dictionary = _look.sail
	var hl: Dictionary = _look.hull
	var cloth := str(sl.cloth)
	var c1 := str(sl.accent) if str(sl.accent) != cloth else str(fl.bg)
	var key := cloth + c1
	if _keys.get("awning") != key:
		_keys.awning = key
		_awning.mesh = _awning_mesh(TownKit.lin(cloth), TownKit.lin(c1))
	var bunt := [str(fl.bg), str(fl.emblem_color), str(fl.pattern_color), str(sl.accent)]
	key = "".join(PackedStringArray(bunt))
	if _keys.get("bunting") != key:
		_keys.bunting = key
		_bunting.mesh = _bunting_mesh(bunt)
	key = str(hl.topsides)
	if _keys.get("paint") != key:
		_keys.paint = key
		var col := TownKit.lin(key)
		var k := TownKit.new(59)
		k.box(0.22, 0.14, 0.07, Vector3(0.0, -1.82, 0.0), col)
		_brush_tip.mesh = k.commit()
		k = TownKit.new(60)
		k.cyl(0.155, 0.155, 0.02, Vector3(-0.3, 0.06, -0.95), col, 10)
		_paint_top.mesh = k.commit()


## The loft's awning: twelve stripes, each its own quad (crisp, both faces),
## and the scalloped valance hung along its front, each scallop its stripe's colour.
func _awning_mesh(c0: Color, c1: Color) -> ArrayMesh:
	var k := TownKit.new(61)
	var centre := Vector3(LOFT.x, DECK + 3.85, LOFT.y + 4.6)
	var up := Basis(Vector3.RIGHT, -PI * 0.5 + 0.42) * Vector3(0.0, 1.2, 0.0)
	for i in 12:
		var x0 := centre + Vector3(-4.8 + i * 0.8, 0.0, 0.0)
		var x1 := x0 + Vector3(0.8, 0.0, 0.0)
		var col := c0 if i % 2 == 0 else c1
		k.quad(x0 - up, x1 - up, x1 + up, x0 + up, col, TownKit.WOOD, true)
		var at := centre + Vector3(-4.4 + i * 0.8, -0.47, 1.1)
		_fan_both(k, 0.4, 10, PI, PI, at, col)
	return k.commit()


## A flat fan (TownKit.fan) with a back to it.
static func _fan_both(k: TownKit, r: float, seg: int, a0: float, a_len: float, pos: Vector3, col: Color) -> void:
	var m := k.kit.verts.size()
	var c := k.kit.add_vertex(pos, Vector3.BACK)
	for i in seg + 1:
		var a := a0 + a_len * i / seg
		k.kit.add_vertex(pos + Vector3(cos(a), sin(a), 0.0) * r, Vector3.BACK)
	for i in seg:
		k.kit.tri(c, c + 1 + i, c + 2 + i)
	var b := k.kit.add_vertex(pos, Vector3.FORWARD)
	for i in seg + 1:
		var a := a0 + a_len * i / seg
		k.kit.add_vertex(pos + Vector3(cos(a), sin(a), 0.0) * r, Vector3.FORWARD)
	for i in seg:
		k.kit.tri(b, b + 2 + i, b + 1 + i)
	k.paint_from(m, col, TownKit.WOOD)


## The pennants along the bunting's strings, in her flag's field, emblem and
## pattern colours and her sails' accent, by turns (both faces).
func _bunting_mesh(hexes: Array) -> ArrayMesh:
	var k := TownKit.new(62)
	var cols: Array[Color] = []
	for h: String in hexes:
		cols.append(TownKit.lin(h))
	for i in _pennant_slot.size():
		var a := _pennants[i * 3]
		var tip := _pennants[i * 3 + 1]
		var b := _pennants[i * 3 + 2]
		var n := (b - a).cross(tip - a).normalized()
		var m := k.kit.verts.size()
		for face in 2:
			var s := 1.0 if face == 0 else -1.0
			var v := k.kit.add_vertex(a, n * s)
			k.kit.add_vertex(b, n * s)
			k.kit.add_vertex(tip, n * s)
			# n = (b - a) x (tip - a): a, b, tip run counter-clockwise about it
			if face == 0:
				k.kit.tri(v, v + 1, v + 2)
			else:
				k.kit.tri(v, v + 2, v + 1)
		k.paint_from(m, cols[_pennant_slot[i]], TownKit.WOOD)
	return k.commit()


## Ties her up alongside (or, null, lets her go).
func set_ship(s: Ship) -> void:
	ship = s
	if not built:
		return
	_plank.visible = s != null
	if s == null:
		return
	_flag.material_override = s.model.shared_material("flag")
	var c := s.cls
	# the painter's boat lies off her seaward side, toward her bow
	_boat_at = Vector3(SHIP_X + c.length * 0.12, 0.0, c.beam * 0.5 + 1.15 + c.beam * 0.5 + 1.8)


## Where a ship of this beam lies alongside (world x, z) and her heading:
## her bow along the quay toward the tavern, her port side to it.
func berth(beam: float) -> Vector3:
	var p := xf * Vector3(SHIP_X, 0.0, beam * 0.5 + 1.15)
	return Vector3(p.x, p.z, atan2(float(site.nz), -float(site.nx)))


## Holds her in her berth (she rides the swell there).
func pin(s: Ship) -> void:
	var b := berth(s.cls.beam)
	s.pos = Vector3(b.x, 0.0, b.y)
	s.heading = b.z
	s.speed = 0.0


## The port shown, her alongside in her look and its folk about their day
## (built first if it isn't yet).
func show_port(look: Dictionary, s: Ship) -> void:
	build_now()
	set_look(look)
	set_ship(s)
	if not _dressed:
		_dressed = true
		for fig in figures:
			fig.palette = _crew.take_row(fig.look.slots)
	visible = true
	update(0.0)


## Put away again: her let go, its folk's colours handed back.
func hide_port() -> void:
	visible = false
	set_ship(null)
	if _dressed:
		_dressed = false
		for fig in figures:
			_crew.free_row(fig.palette)
			fig.palette = -1


## The lamps lit after dark, for the sea to mirror (world, brightness).
func lamps() -> Array[Vector4]:
	var out: Array[Vector4] = []
	if not built or not visible:
		return out
	for l in _lamps:
		var p := xf * Vector3(l.x, l.y, l.z)
		out.append(Vector4(p.x, p.y, p.z, l.w))
	return out


## Its planking and glyphs (its own shaders), for the game's warm-up: a
## card of each, so its first showing compiles nothing.
func warm_meshes() -> Array[MeshInstance3D]:
	var card := _uv_mesh(PackedVector3Array([Vector3(-0.5, 0.5, 0.0), Vector3(0.5, 0.5, 0.0), Vector3(0.5, -0.5, 0.0), Vector3(-0.5, -0.5, 0.0)]),
			PackedVector2Array([Vector2(0.0, 0.0), Vector2(1.0, 0.0), Vector2(1.0, 1.0), Vector2(0.0, 1.0)]), PackedInt32Array([0, 1, 2, 0, 2, 3]))
	var out: Array[MeshInstance3D] = []
	for mat: Material in [_deck_mat, _glyph_mat]:
		var mi := MeshInstance3D.new()
		mi.mesh = card
		mi.material_override = mat
		out.append(mi)
	return out


# ------------------------------------------------------------------ frame

## A frame of the port: its folk at their business, the boat and the float
## on the swell, the crane at work, her flag in the wind, the tavern's smoke
## and her lines.
func update(dt: float) -> void:
	if not built or not visible:
		return
	_time += dt
	var t := _time
	for fig in figures:
		fig.rest()
	_roller(dt, t)
	_carrier(dt)
	_fisherman(t)
	_squeezebox(t)
	_dancer(t)
	_drinkers(t)
	_painter(t)
	_lookout(t)
	_swabbie(dt, t)
	_captain(t)
	_sleeper(t)
	_crane(dt, t)
	var wd := inv.basis * Vector3(_world.wind.dir_x, 0.0, _world.wind.dir_z)
	_flag_pivot.rotation.y = atan2(-wd.z, wd.x)
	var fw := snappedf(clampf(_world.wind.strength, 0.2, 1.4), 0.02)
	if fw != _flag_wind:
		_flag_wind = fw
		_flag.set_instance_shader_parameter("flag_wind", fw)
	_smoke(dt)
	_moor()
	_rig_lines()


## Rolling a barrel round the crates, bent to it.
func _roller(dt: float, t: float) -> void:
	_walked.x += dt * 1.05
	var s := _walked.x
	var fig := figures[ROLLER]
	var p := _roll.at(s)
	fig.place(p.x, p.z, _roll.yaw(s), DECK)
	fig.walk(s * 5.4, 0.8)
	fig.hips_rot.x = 0.22
	fig.arm(true, -1.25 + sin(t * 5.0) * 0.05, 0.0, -0.15)
	fig.arm(false, -1.25 - sin(t * 5.0) * 0.05, 0.0, 0.15)
	fig.pose[CrewModel.P_HAND_L] = 0.15
	fig.pose[CrewModel.P_HAND_R] = 0.15
	fig.pose[CrewModel.P_BROW] = 0.3
	fig.pose[CrewModel.P_JAW] = 0.2
	var b := _roll.at(s + 0.95)
	_barrel.transform = Transform3D(Basis(Vector3.UP, _roll.yaw(s + 0.95)) * Basis(Vector3.RIGHT, s / 0.38), Vector3(b.x, DECK + 0.38, b.z))


## Hauling a crate overhead between the shed and the crane.
func _carrier(dt: float) -> void:
	_walked.y += dt * 1.15
	var s := _walked.y
	var fig := figures[CARRIER]
	var p := _carry.at(s)
	fig.place(p.x, p.z, _carry.yaw(s), DECK)
	fig.walk(s * 5.2, 0.85)
	fig.arm(true, -2.85, 0.0, 0.32)
	fig.arm(false, -2.85, 0.0, -0.32)
	fig.head_rot.x = 0.1
	fig.pose[CrewModel.P_HAND_L] = 0.2
	fig.pose[CrewModel.P_HAND_R] = 0.2
	fig.pose[CrewModel.P_BROW] = 0.4
	_crate.transform = fig.hips_xf() * Transform3D(Basis.IDENTITY, Vector3(0.0, 1.43, 0.05))


## A line off the quay's edge, legs swinging over the water; now and then a bite.
func _fisherman(t: float) -> void:
	var fig := figures[FISHER]
	fig.place(21.6, 0.32, 0.15, DECK + 0.02)
	fig.hips_pos.y = 0.12
	fig.hips_rot.x = -0.12
	fig.leg_l = -0.25 + sin(t * 1.6) * 0.28
	fig.leg_r = -0.25 + sin(t * 1.6 + 2.2) * 0.28
	fig.pose[CrewModel.P_KNEE_L] = 0.25 + maxf(0.0, sin(t * 1.6)) * 0.3
	fig.pose[CrewModel.P_KNEE_R] = 0.25 + maxf(0.0, sin(t * 1.6 + 2.2)) * 0.3
	fig.pose[CrewModel.P_HAND_L] = 1.0
	fig.pose[CrewModel.P_HAND_R] = 1.0
	var cyc := fmod(t, 9.0)
	var bite := sin((cyc - 7.2) / 1.8 * PI) if cyc > 7.2 else 0.0
	fig.arm(true, -1.0 - bite * 0.5, 0.0, -0.35)
	fig.arm(false, -1.0 - bite * 0.5, 0.0, 0.35)
	fig.head_rot.x = 0.25 - bite * 0.3
	fig.head_rot.y = sin(t * 0.3) * 0.2
	_rod.transform = fig.hips_xf() * Transform3D(Basis(Vector3.RIGHT, 0.95 - bite * 0.45), Vector3(0.0, 0.36, 0.38))
	var bw := xf * Vector3(22.2, 0.0, 6.2)
	var dip := sin((cyc - 6.6) / 0.6 * PI * 3.0) * 0.12 if cyc > 6.6 and cyc < 7.2 else 0.0
	_bobber.position = Vector3(22.2, _world.water_height(bw.x, bw.z) + 0.02 - dip, 6.2)


## A squeezebox on a barrel, singing along; notes rise off it.
func _squeezebox(t: float) -> void:
	var fig := figures[MUSICIAN]
	fig.place(13.2, -6.4, 0.55, DECK)
	fig.sit(0.9)
	fig.leg_r = -1.2 + maxf(0.0, sin(t * 8.0)) * 0.2
	fig.leg_l = -1.1
	var sq := sin(t * 2.4)
	fig.arm(true, -0.95, 0.0, 0.42 + sq * 0.22)
	fig.arm(false, -0.95, 0.0, -0.42 - sq * 0.22)
	fig.hips_rot.z = sq * 0.07
	fig.head_rot.z = sin(t * 4.0) * 0.13
	fig.head_rot.x = -0.12
	fig.pose[CrewModel.P_HAND_L] = 0.6
	fig.pose[CrewModel.P_HAND_R] = 0.6
	fig.pose[CrewModel.P_SMILE] = 0.9
	fig.pose[CrewModel.P_JAW] = 0.25 + 0.25 * maxf(0.0, sin(t * 4.8))
	_accordion.transform = fig.hips_xf() * Transform3D(Basis.from_scale(Vector3(1.0 + sq * 0.28, 1.0, 1.0)), Vector3(0.0, 0.36, 0.42))
	for i in _notes.size():
		var ph := fmod(t * 0.42 + i / 3.0, 1.0)
		var sc := 0.42 * sin(minf(1.0, ph * 1.3) * PI)
		_glyph(_notes[i], Vector3(13.2 + sin(ph * 6.0 + i * 2.0) * 0.35 + ph * 0.5, DECK + 2.2 + ph * 1.8, -6.2 + ph * 0.4), sc)


func _glyph(g: MeshInstance3D, at: Vector3, s: float) -> void:
	g.visible = s > 0.005
	if g.visible:
		g.transform = Transform3D(Basis.from_scale(Vector3.ONE * s), at)


## Dancing a jig to it.
func _dancer(t: float) -> void:
	var fig := figures[DANCER]
	var hop := absf(sin(t * 5.2))
	fig.place(15.4 + sin(t * 0.7) * 0.5, -4.6 + cos(t * 0.7) * 0.3, -1.2 + sin(t * 0.9) * 1.1, DECK)
	fig.hips_pos.y = Figure.HIP + hop * 0.16
	fig.leg_l = sin(t * 5.2) * 0.7
	fig.leg_r = -sin(t * 5.2) * 0.4
	fig.arm(true, 0.0, 0.0, 2.5 + sin(t * 5.2) * 0.35)
	fig.arm(false, -0.3, 0.0, -0.7 - cos(t * 5.2) * 0.4)
	fig.head_rot.z = sin(t * 5.2) * 0.15
	fig.pose[CrewModel.P_SMILE] = 1.0
	fig.pose[CrewModel.P_BROW] = 0.6
	fig.pose[CrewModel.P_JAW] = 0.35 * maxf(0.0, sin(t * 2.6))
	fig.pose[CrewModel.P_HAND_L] = 0.0


## A round at the tavern table: a swig each by turns, and every so often a
## clink of tankards across it.
func _drinkers(t: float) -> void:
	for d: Array in [[DRINKER_A, 19.8, PI * 0.5, 0.0], [DRINKER_B, 22.2, -PI * 0.5, 1.9]]:
		var fig := figures[int(d[0])]
		var off: float = d[3]
		fig.place(float(d[1]), -5.6, float(d[2]), DECK)
		fig.sit(0.5)
		var cyc := fmod(t + off, 4.4)
		var round_t := fmod(t + 0.5, 13.2)
		var cheers := round_t < 1.6
		var lift := sin(cyc / 1.5 * PI) if cyc < 1.5 and not cheers else 0.0
		var clink := sin(round_t / 1.6 * PI) if cheers else 0.0
		fig.arm(false, -0.75 - lift * 1.55 - clink * 1.1, 0.0, lift * 0.3 + clink * 0.35)
		fig.arm(true, -0.7, 0.0, 0.12)
		fig.head_rot.x = -lift * 0.42
		fig.hips_rot.x = -lift * 0.08 + clink * 0.1
		fig.hips_rot.z = sin(t * 1.3 + off) * 0.04
		fig.pose[CrewModel.P_HAND_L] = 0.5
		if clink > 0.0:
			fig.pose[CrewModel.P_JAW] = 0.7 * clink
			fig.pose[CrewModel.P_SMILE] = 1.0
			fig.pose[CrewModel.P_BROW] = 0.7 * clink
		else:
			fig.pose[CrewModel.P_JAW] = 0.3 * maxf(0.0, sin(t * 9.0 + off)) * (1.0 if sin(t * 0.8 + off) > 0.0 else 0.0)


## Touching up her topsides from the rowboat, rocking on the swell.
func _painter(t: float) -> void:
	var w := xf * Vector3(_boat_at.x, 0.0, _boat_at.z)
	var at := Vector3(_boat_at.x, _world.water_height(w.x, w.z) + 0.12, _boat_at.z)
	var boat := Transform3D(Basis.from_euler(Vector3(sin(t * 0.9 + 1.0) * 0.04, PI * 0.5, sin(t * 1.3) * 0.06), EULER_ORDER_XYZ), at)
	_boat.transform = boat
	var fig := figures[PAINTER]
	fig.parent = boat
	fig.place(0.15, 0.0, PI * 0.5, -0.15)
	var stroke := sin(t * 1.7)
	fig.arm(false, -2.05 + stroke * 0.3, 0.0, 0.12)
	fig.arm(true, -1.75 + stroke * 0.3, 0.0, -0.18)
	fig.hips_rot.x = -0.1 + stroke * 0.05
	fig.head_rot.x = -0.25
	fig.pose[CrewModel.P_HAND_R] = 1.0
	fig.pose[CrewModel.P_HAND_L] = 0.5
	fig.pose[CrewModel.P_GAZE_Y] = 0.3
	_brush.transform = fig.hand_xf(false)


## The lookout at the tower's rail, glass to the eye, scanning the horizon.
func _lookout(t: float) -> void:
	var fig := figures[LOOKOUT]
	var yaw := 0.6 + sin(t * 0.22) * 1.1
	fig.place(TOWER.x + sin(yaw) * 0.95, TOWER.y + cos(yaw) * 0.95, yaw, DECK + TOWER_H + 0.15)
	fig.reach(false, 1.62, 0.32, 1.52)
	fig.reach(true, 1.25, 0.3, 1.55)
	fig.pose[CrewModel.P_HAND_L] = 0.85
	fig.pose[CrewModel.P_BROW] = -0.35
	fig.head_rot.x = -0.05


## Swabbing the boards, to and fro along the quay.
func _swabbie(dt: float, t: float) -> void:
	var span := 5.5
	_walked.z += dt * 0.55
	var s := fmod(_walked.z, span * 2.0)
	var x := 0.5 + (s if s < span else span * 2.0 - s)
	var want := PI * 0.5 if s < span else -PI * 0.5
	_swab_yaw += MathX.angle_delta(_swab_yaw, want) * MathX.damp(4.0, dt)
	var fig := figures[SWABBIE]
	fig.place(x, -4.2, _swab_yaw, DECK)
	fig.walk(_walked.z * 6.0, 0.45)
	fig.hips_rot.y = sin(t * 3.2) * 0.4
	fig.hips_rot.x = 0.25
	fig.arm(true, -0.75, 0.0, -0.25)
	fig.arm(false, -0.85, 0.0, 0.25)
	fig.pose[CrewModel.P_HAND_L] = 0.95
	fig.pose[CrewModel.P_HAND_R] = 0.95
	_mop.transform = fig.hips_xf() * Transform3D(Basis(Vector3.RIGHT, 0.55), Vector3(0.0, 0.32, 0.36))


## The captain, parrot and all, hands on hips; now and then pointing her out.
func _captain(t: float) -> void:
	var fig := figures[CAPTAIN]
	fig.place(7.4, -6.6, 0.35, DECK)
	var cyc := fmod(t, 10.0)
	var point := sin((cyc - 6.5) / 2.8 * PI) if cyc > 6.5 and cyc < 9.3 else 0.0
	fig.arm(true, 0.35, 0.0, 0.75)
	fig.arm(false, 0.35 * (1.0 - point) - point * 1.55, -point * 0.3, -0.75 * (1.0 - point) - point * 0.1)
	fig.head_rot.y = -0.3 + sin(t * 0.5) * 0.35 - point * 0.25
	fig.hips_rot.x = -0.05


## Napping in the hammock as it swings; snores rise off him.
func _sleeper(t: float) -> void:
	var swing := sin(t * 0.85) * 0.12
	var pivot := Vector3(0.0, 0.55, 0.0)
	var hm := Transform3D(Basis(Vector3.UP, -0.07), HAMMOCK) * Transform3D(Basis(Vector3.RIGHT, swing), pivot) * Transform3D(Basis.IDENTITY, -pivot)
	_hammock.transform = hm
	var fig := figures[SLEEPER]
	# on his back, head toward the hammock's +x
	fig.parent = hm * Transform3D(Basis(Vector3(0.0, 0.0, 1.0), Vector3(1.0, 0.0, 0.0), Vector3(0.0, 1.0, 0.0)), Vector3(-0.95, -0.2, 0.0))
	fig.place(0.0, 0.0, 0.0, 0.0)
	fig.arm(true, -0.45, 0.0, -0.35)
	fig.arm(false, -0.45, 0.0, 0.35)
	fig.head_rot.x = -0.2
	fig.head_rot.y = 0.3
	var hp := fig.head_pos()
	for i in _zzz.size():
		var ph := fmod(t * 0.3 + i / 3.0, 1.0)
		var sc := (0.16 + ph * 0.3) * sin(minf(1.0, ph * 1.2) * PI)
		_glyph(_zzz[i], Vector3(hp.x + ph * 0.6, hp.y + 0.3 + ph * 1.4, hp.z + sin(ph * 5.0 + i) * 0.25), sc)


## The crane: swings its load out over the water, lowers it, hauls it up
## and swings it back to the yard, the load swaying as the boom slews.
func _crane(dt: float, t: float) -> void:
	var cyc := fmod(t, 18.0) / 18.0
	var swing := MathX.smooth(0.08, 0.32, cyc) - MathX.smooth(0.62, 0.86, cyc)
	var yaw := -2.3 + swing * 2.5
	var sway := (yaw - _boom_yaw) / dt if dt > 0.0 else 0.0
	_boom_yaw = yaw
	var drop := MathX.smooth(0.34, 0.46, cyc) - MathX.smooth(0.48, 0.6, cyc)
	var low := 1.0 - MathX.smooth(0.0, 0.06, cyc) + MathX.smooth(0.9, 1.0, cyc) if cyc < 0.06 or cyc > 0.9 else 0.0
	var rope := 2.4 + drop * 4.4 + low * 4.5
	_boom_xf = Transform3D(Basis(Vector3.UP, yaw), Vector3(CRANE.x, DECK + 6.1, CRANE.y))
	_boom.transform = _boom_xf
	_load_at = Vector3(sin(t * 2.1) * 0.05 + clampf(sway, -1.0, 1.0) * 0.25, 2.5 - rope, 6.6)
	_load.position = _load_at


## Smoke from the tavern's chimney, drifting off downwind.
func _smoke(dt: float) -> void:
	_smoke_t += dt
	if _smoke_t < 0.28:
		return
	_smoke_t = 0.0
	var p := xf * _chimney
	var wd := Vector3(_world.wind.dir_x, 0.0, _world.wind.dir_z)
	_world.fx.emit(p + Vector3(randf_range(-0.15, 0.15), 0.0, randf_range(-0.15, 0.15)), Vector3(wd.x * 1.1, 1.3 + randf() * 0.5, wd.z * 1.1),
			5.0 + randf() * 2.0, 0.7, 3.4, Color(1.0, 0.98, 0.96, 0.32), Color(0.9, 0.9, 0.92), 0.0, 0.25, Particles.SMOKE, 0.5, Vector2.ZERO, randf_range(-0.15, 0.15))


## The gangplank from the quay up to her rail amidships, where she lies now.
func _moor() -> void:
	if ship == null:
		return
	var sh := ship.model.shape
	var m := inv * ship.model.global_transform
	var top := m * Vector3(sh.half_beam(0.45) * 0.95, sh.main_deck_y(0.45) + ship.cls.bulwark, sh.z(0.45))
	var foot := Vector3(top.x, DECK + 0.08, -1.3)
	var d := top - foot
	_plank.transform = Transform3D(Basis.looking_at(d, Vector3.UP, true) * Basis.from_scale(Vector3(1.0, 1.0, d.length())), foot)


## The lines, rebuilt each frame: her four mooring lines to the bollards,
## the crane's fall to its load and the fisherman's line to his float.
func _rig_lines() -> void:
	var rk := RopeKit.new(13)
	if ship != null:
		var sh := ship.model.shape
		var L := ship.cls.length
		var m := inv * ship.model.global_transform
		for pr: Vector2 in [Vector2(0.96, SHIP_X + L * 0.5 + 5.0), Vector2(0.05, SHIP_X - L * 0.5 - 5.0), Vector2(0.7, SHIP_X + L * 0.05), Vector2(0.32, SHIP_X - L * 0.05)]:
			var a := m * Vector3(sh.half_beam(pr.x) * 0.8, sh.top(pr.x) + 0.2, sh.z(pr.x))
			var b := Vector3(_bollard(pr.y), DECK + 0.6, -0.35)
			rk.rope(a, b, 0.035, Color("#4a3626"), a.distance_to(b) * 0.06)
	rk.rope(_boom_xf * Vector3(0.0, 2.5, 6.6), _boom_xf * _load_at, 0.025, Color("#3a2a1c"))
	var tip := _rod.transform * Vector3(0.0, 3.2, 0.0)
	rk.rope(tip, _bobber.position + Vector3(0.0, 0.08, 0.0), 0.006, Color("#f3ecdc"), 0.4)
	rk.commit(_line_mesh)


func _bollard(x: float) -> float:
	var best := BOLLARDS[0]
	for b in BOLLARDS:
		if absf(b - x) < absf(best - x):
			best = b
	return best


## The folk drawn this frame (Crew.emit_figure's shape), while it's shown.
func _draw_folk(emit: Callable) -> void:
	if not _dressed or not visible:
		return
	for fig in figures:
		if fig.palette >= 0:
			emit.call(xf * fig.body_xf(), fig.write(), fig.look.hat, fig.prop, fig.kit)
