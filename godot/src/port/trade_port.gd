class_name TradePort
extends Node3D
## One trading port (the web game's TradePort, src/port/tradePort.ts): a
## timber quay on its pilings with the warehouse, the harbour office and the
## town's landmark along its back, market stalls under striped canopies, a
## lighthouse at the far end, palms, painted signs and the town's flag; the
## thirteen townsfolk who keep it; and a ship come alongside, made fast with
## four mooring lines and a gangplank run out to her rail.
##
## Two builds of it: the whole town up close, and a shell of its bulk (the
## houses, the lighthouse, the canopies and the quay's face) once it lies
## across the water. Its frame: +x along the shore, +z out to sea, the quay's
## edge at z = 0 and its boards DECK above the sea.

## A piece of cargo reached the town (or, `on`, the ship), at a point (world).
signal delivered(id: String, on: bool, at: Vector3)
## The harbourmaster's bell struck, welcoming a ship in (world).
signal bell_rung(at: Vector3)
## The fisherman set a lantern boat down on the water, at a point (world).
signal lantern_set(at: Vector3)

const DECK := 1.8
const HALF := 28.5
## Where a ship's middle lies along the quay, and the porters' lane behind the berth.
const SHIP_X := -2.0
const LANE := -2.6
## The lantern posts on the quay (their lamps hang 0.6 m seaward of them).
const LANTERNS: Array[Vector2] = [Vector2(-25.0, -0.9), Vector2(-11.0, -0.9), Vector2(7.6, -0.9), Vector2(24.0, -7.5)]
const LANTERN_H := 3.2
const BOLLARDS: Array[float] = [-24.0, -16.0, -8.0, 0.0, 8.0, 16.0]
const STALLS: Array[float] = [5.5, 11.0, 21.0]
## The porters' places on their two benches.
const SEATS: Array[Vector2] = [Vector2(-23.5, -5.2), Vector2(-22.3, -5.2), Vector2(-13.0, -5.2), Vector2(-11.8, -5.2)]
const LIGHTHOUSE := Vector2(26.2, -3.2)
const LIGHTHOUSE_H := 8.5
const BELL := Vector3(16.2, DECK + 2.82, -2.0)
## The whole town up close inside NEAR_OUT (m), the shell once past it, back inside NEAR_IN;
## nothing at all past DRAW_END.
const NEAR_OUT := 380.0
const NEAR_IN := 330.0
const DRAW_END := 1650.0

## Who keeps the town, in the order of `figures`: the thirteen who keep it,
## and six more who only come out on a feast night.
const ROLES: Array[String] = ["merchant", "merchant", "merchant", "porter", "porter", "porter", "porter", "stroller", "stroller", "kid", "harbourmaster", "musician", "fisher",
		"reveller", "reveller", "reveller", "reveller", "reveller", "reveller"]
## The first of the feast-night revellers.
const REVELS := 13
const DRUMMER := 17
const TOASTER := 18
## Where the feast night's ring dance turns, clear of the berth and the benches.
const RING := Vector2(-17.0, -3.1)
const PORTERS := 4
const KID := 9
const HARBOURMASTER := 10
const FIDDLER := 11
const FISHER := 12

## The six trading ports, in the order of their sites (the home waters' four,
## then Las Brumas' two): name, landmark, colours and what their markets want.
const SPECS: Array[Dictionary] = [
	{"name": "Porto Cinabre", "signature": "bazaar", "house": "Spice Bazaar",
		"wall": "#e9a35c", "wall2": "#f2d5a2", "roof": "#b8402c", "trim": "#f7ecd2", "awning": ["#c8352b", "#f5c542"], "flag": ["#c8352b", "#f5c542", "#f7ecd2"],
		"taste": {"provisions": 1.35, "cloth": 1.25, "spirits": 1.05, "coin": 1.0, "gems": 0.85, "jewellery": 0.9, "art": 0.8, "relics": 0.9},
		"tagline": "Spice merchants pay best for provisions and fine cloth."},
	{"name": "Aguadouro", "signature": "bank", "house": "Counting House",
		"wall": "#f3ecdc", "wall2": "#b9d3dc", "roof": "#3d5f7a", "trim": "#e2b552", "awning": ["#27407a", "#f3ecdc"], "flag": ["#27407a", "#e2b552", "#f3ecdc"],
		"taste": {"coin": 1.12, "gems": 1.35, "jewellery": 1.3, "relics": 1.0, "art": 0.95, "provisions": 0.8, "cloth": 0.85, "spirits": 0.85},
		"tagline": "The bankers here pay a fortune for gems, jewellery and coin."},
	{"name": "Sainte-Corália", "signature": "gallery", "house": "Curio Gallery",
		"wall": "#f2a99a", "wall2": "#fbefe2", "roof": "#2f8f8a", "trim": "#fff7ea", "awning": ["#2f8f8a", "#fbefe2"], "flag": ["#2f8f8a", "#f2a99a", "#fff7ea"],
		"taste": {"art": 1.45, "relics": 1.3, "jewellery": 1.1, "gems": 0.95, "coin": 1.0, "provisions": 0.85, "cloth": 0.95, "spirits": 0.75},
		"tagline": "Collectors here chase art and old relics above all."},
	{"name": "Ronvliet", "signature": "distillery", "house": "Ronvliet Distillery",
		"wall": "#f0cf5e", "wall2": "#8fbf7a", "roof": "#6b3a2a", "trim": "#f6efd8", "awning": ["#2f7d3a", "#f6efd8"], "flag": ["#2f7d3a", "#f0cf5e", "#6b3a2a"],
		"taste": {"spirits": 1.5, "provisions": 1.15, "cloth": 1.0, "coin": 1.0, "gems": 0.85, "jewellery": 0.85, "art": 0.8, "relics": 0.9},
		"tagline": "A thirsty town: spirits and provisions fetch top coin."},
	{"name": "Vila Garoa", "signature": "bazaar", "house": "Tea & Silk Bazaar",
		"wall": "#bfe0d0", "wall2": "#f4e6dc", "roof": "#3f6f62", "trim": "#faf4ea", "awning": ["#d9667a", "#faf4ea"], "flag": ["#3f6f62", "#d9667a", "#faf4ea"],
		"taste": {"spirits": 1.35, "cloth": 1.3, "jewellery": 1.15, "provisions": 1.0, "coin": 0.95, "gems": 0.95, "art": 0.9, "relics": 0.85},
		"tagline": "Damp hills, dry throats: tea houses pay well for spirits, cloth and jewellery."},
	{"name": "Esmeraldeau", "signature": "gallery", "house": "Jade Carvers' Gallery",
		"wall": "#f3e7cf", "wall2": "#a9cdb8", "roof": "#7a3e52", "trim": "#fff8ec", "awning": ["#2e8a6e", "#f3e7cf"], "flag": ["#2e8a6e", "#f3e7cf", "#7a3e52"],
		"taste": {"relics": 1.45, "gems": 1.25, "art": 1.2, "jewellery": 1.0, "coin": 0.95, "provisions": 0.9, "cloth": 0.85, "spirits": 0.85},
		"tagline": "The carvers of the mist buy relics, gems and old art to inspire their jade."},
]

# the web's port palette, in linear light (src/port/port.ts)
static var C_TIMBER := TownKit.lin("#5a3d26")
static var C_TIMBER_DARK := TownKit.lin("#3e2a1a")
static var C_PILE := TownKit.lin("#5b4330")
static var C_ALGAE := TownKit.lin("#2f3d2a")
static var C_CREAM := TownKit.lin("#f3e6c8")
static var C_STONE := TownKit.lin("#9a8f84")
static var C_IRON := TownKit.lin("#2a2c30")
static var C_GOLD := TownKit.lin("#f2c45a")
static var C_DOOR := TownKit.lin("#7a3626")
static var C_DARK := TownKit.lin("#1a0e08")
## Lamplight paint: HDR, as the web's.
const C_GLASS := Color(2.6, 1.7, 0.75)
const C_LAMP := Color(5.5, 3.6, 1.5)


## What every town shares: its materials (the ships' own shaders, so the
## towns compile next to nothing new) and the meshes of the things that move.
class Arts:
	var parts: ShaderMaterial
	var deck: ShaderMaterial
	var sign: ShaderMaterial
	var flag: ShaderMaterial
	var rope: ShaderMaterial
	var halo: ShaderMaterial
	## What a porter carries, by how (Treasure.carry_of).
	var carry := {}
	var plank: ArrayMesh
	var bell: ArrayMesh
	var bobber: ArrayMesh
	var rod: ArrayMesh
	## The island planting's palms, three of them, and their in-between cuts.
	var palms: Array[ArrayMesh] = []
	var palms_mid: Array[ArrayMesh] = []

	func _init() -> void:
		parts = ShaderMaterial.new()
		parts.shader = ShipModel.SHADERS["parts"]
		parts.set_shader_parameter("glow_gain", TownKit.GLOW_GAIN)
		# the web's gold leaf glows a little of its own
		parts.set_shader_parameter("gilt_glow", Vector3(0.35, 0.22, 0.03))
		deck = ShaderMaterial.new()
		deck.shader = preload("res://shaders/town_deck.gdshader")
		# the web's quay planking (#c9a06b, toned 1, 0.94, 0.88)
		var plank_col := TownKit.lin("#c9a06b") * Color(1.0, 0.94, 0.88)
		deck.set_shader_parameter("c_plank", plank_col.linear_to_srgb())
		sign = ShaderMaterial.new()
		sign.shader = preload("res://shaders/town_sign.gdshader")
		sign.set_shader_parameter("atlas", preload("res://art/town_signs.png"))
		flag = ShaderMaterial.new()
		flag.shader = preload("res://shaders/town_flag.gdshader")
		flag.set_shader_parameter("atlas", preload("res://art/town_flags.png"))
		rope = ShaderMaterial.new()
		rope.shader = ShipModel.SHADERS["rope"]
		halo = ShaderMaterial.new()
		halo.shader = ShipModel.SHADERS["halo"]
		for kind: String in ["crate", "barrel", "sack", "casket", "painting", "idol"]:
			var k := TownKit.new(5)
			TradePort.carry_shape(k, kind, Transform3D.IDENTITY)
			carry[kind] = k.commit()
		# the gangplank, cleated for the porters' feet: a metre long, stretched to fit
		var p := TownKit.new(3)
		p.box_xf(Transform3D(Basis.IDENTITY, Vector3(0.0, 0.0, 0.5)), Vector3(0.9, 0.1, 1.0), TradePort.C_TIMBER)
		for i in range(1, 6):
			p.box_xf(Transform3D(Basis.IDENTITY, Vector3(0.0, 0.07, i / 6.0)), Vector3(0.8, 0.05, 0.06), TradePort.C_TIMBER)
		plank = p.commit()
		var b := TownKit.new(4)
		b.lathe(PackedVector2Array([Vector2(0.02, 0.0), Vector2(0.16, -0.04), Vector2(0.2, -0.22), Vector2(0.28, -0.44), Vector2(0.3, -0.5), Vector2(0.01, -0.5)]), Transform3D.IDENTITY, TradePort.C_GOLD, 12, TownKit.GILT)
		b.ball(0.06, Vector3(0.0, -0.48, 0.0), TownKit.lin("#8a5a12"), TownKit.GILT)
		bell = b.commit()
		var f := TownKit.new(6)
		f.dome(Transform3D.IDENTITY, 0.11, 10, 4, TownKit.lin("#d8322a"))
		f.dome(Transform3D(Basis(Vector3.RIGHT, PI), Vector3.ZERO), 0.11, 10, 4, TownKit.lin("#f3ecdc"))
		bobber = f.commit()
		var r := TownKit.new(8)
		r.cyl(0.012, 0.03, 3.2, Vector3(0.0, 1.6, 0.0), TownKit.lin("#6e4a28"), 6)
		r.cyl(0.06, 0.06, 0.05, Vector3(0.05, 0.35, 0.0), TownKit.lin("#3a3a3a"), 10, TownKit.IRON, 0.0, PI * 0.5)
		rod = r.commit()
		var fk := Flora.kit()
		for i: int in [0, 3, 6]:
			palms.append(fk.meshes[i])
			palms_mid.append(fk.meshes[i + 1])


## A porter's load, or a painting on its easel, laid into a kit at xf.
static func carry_shape(k: TownKit, kind: String, xf: Transform3D) -> void:
	match kind:
		"crate":
			k.crate(xf, 0.6)
		"barrel":
			k.barrel(xf * Transform3D(Basis(Vector3.BACK, PI * 0.5), Vector3.ZERO), 0.8, 0.3, 10)
		"sack":
			var m := k.kit.verts.size()
			var i0 := k.kit.indices.size()
			k.kit.sphere(xf * Transform3D(Basis.from_scale(Vector3(1.0, 1.15, 0.8)), Vector3.ZERO), 0.34, 12, 9)
			# gathered at the neck, fuller at the bottom
			var inv := xf.affine_inverse()
			for v in range(m, k.kit.verts.size()):
				var q := inv * k.kit.verts[v]
				var s := 1.0 + maxf(0.0, -q.y) * 0.25 - maxf(0.0, q.y - 0.25) * 1.2
				k.kit.verts[v] = xf * Vector3(q.x * s, q.y, q.z * s)
			k.kit.recompute_normals(m, i0)
			k.paint_from(m, func(p: Vector3) -> Color:
				var q := inv * p
				return TownKit.lin("#c9a46a") * (0.88 + 0.12 * absf(sin(q.x * 40.0 + q.y * 30.0))), TownKit.WOOD)
			k.cyl_xf(0.06, 0.08, 0.1, xf * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.4, 0.0)), TownKit.lin("#8a6440"), 8)
			k.torus(0.075, 0.02, 4, 10, xf * Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0.0, 0.37, 0.0)), TownKit.lin("#5a3a20"))
		"casket":
			var w := 0.56
			var h := 0.3
			var d := 0.38
			k.box_xf(xf, Vector3(w, h, d), TownKit.lin("#6a2c1c"))
			k.half_cyl(d * 0.5, w, xf * Transform3D(Basis.IDENTITY, Vector3(0.0, h * 0.5, 0.0)), TownKit.lin("#7d3a22"))
			var strap := TownKit.lin("#e8b64c")
			for x: float in [-0.18, 0.18]:
				k.box_xf(xf * Transform3D(Basis.IDENTITY, Vector3(x, 0.0, 0.0)), Vector3(0.05, h + 0.02, d + 0.02), strap, 0.0, TownKit.GILT)
				k.half_cyl(d * 0.5 + 0.012, 0.05, xf * Transform3D(Basis.IDENTITY, Vector3(x, h * 0.5, 0.0)), strap, 10, TownKit.GILT)
			k.box_xf(xf * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.08, d * 0.5 + 0.01)), Vector3(0.1, 0.12, 0.03), TownKit.lin("#ffd263"), 0.0, TownKit.GILT)
		"painting":
			var w := 0.95
			var h := 0.7
			k.box_xf(xf, Vector3(w - 0.1, h - 0.1, 0.04), TownKit.lin("#3a2a20"))
			# a little sunset seascape on the canvas: sea, the sun's line, sky
			var bands := [[0.0, "#1d4f6e"], [0.32, "#3f8fa8"], [0.33, "#ffd38a"], [0.35, "#ffd38a"], [0.36, "#f3a35c"], [1.0, "#6a4a8a"]]
			var cw := (w - 0.1) * 0.5
			var ch := h - 0.1
			for i in bands.size() - 1:
				var y0 := -ch * 0.5 + ch * float(bands[i][0])
				var y1 := -ch * 0.5 + ch * float(bands[i + 1][0])
				var c0 := TownKit.lin(bands[i][1])
				var c1 := TownKit.lin(bands[i + 1][1])
				k.quad(xf * Vector3(-cw, y0, 0.021), xf * Vector3(cw, y0, 0.021), xf * Vector3(cw, y1, 0.021), xf * Vector3(-cw, y1, 0.021),
						func(p: Vector3) -> Color: return c0 if (xf.affine_inverse() * p).y < (y0 + y1) * 0.5 else c1)
			var gilt := TownKit.lin("#d8a43c")
			for bar: Array in [[0.0, h * 0.5 - 0.03, w, 0.07], [0.0, -h * 0.5 + 0.03, w, 0.07], [w * 0.5 - 0.03, 0.0, 0.07, h], [-w * 0.5 + 0.03, 0.0, 0.07, h]]:
				k.box_xf(xf * Transform3D(Basis.IDENTITY, Vector3(bar[0], bar[1], 0.01)), Vector3(bar[2], bar[3], 0.08), gilt, 0.0, TownKit.GILT)
		"idol":
			var gold := C_GOLD
			k.cyl_xf(0.2, 0.24, 0.12, xf, gold, 10, TownKit.GILT)
			k.dome(xf * Transform3D(Basis.from_scale(Vector3(1.0, 1.25, 0.9)), Vector3(0.0, 0.24, 0.0)), 0.17, 10, 8, gold, TownKit.GILT, PI)
			k.box_xf(xf * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.5, 0.0)), Vector3(0.26, 0.22, 0.22), gold, 0.07, TownKit.GILT)
			k.box_xf(xf * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.62, 0.0)), Vector3(0.34, 0.05, 0.05), TownKit.lin("#e0a83a"), 0.0, TownKit.GILT)
			for x: float in [-0.06, 0.06]:
				k.ball(0.035, xf * Vector3(x, 0.52, 0.11), TownKit.lin("#3cf0a0"), TownKit.GILT)


## A walk along straight legs, at a pace, with a stride phase and an easing heading.
class Walker:
	var x := 0.0
	var z := 0.0
	var yaw := 0.0
	var phase := 0.0
	var path: Array[Vector2] = []
	var moving := false

	func set_at(px: float, pz: float, pyaw: float = INF) -> void:
		x = px
		z = pz
		if pyaw != INF:
			yaw = pyaw
		path.clear()

	## Straight there along the porters' lane: out to it, along it, then in.
	func route(tx: float, tz: float) -> void:
		path.clear()
		if absf(tx - x) > 0.6:
			if absf(z - LANE) > 0.3:
				path.append(Vector2(x, LANE))
			path.append(Vector2(tx, LANE))
		path.append(Vector2(tx, tz))

	## Steps along the path; true once it is walked.
	func step(dt: float, speed: float) -> bool:
		moving = false
		while not path.is_empty():
			var t := path[0]
			var dx := t.x - x
			var dz := t.y - z
			var d := sqrt(dx * dx + dz * dz)
			if d < 0.05:
				path.pop_front()
				continue
			var s := minf(d, speed * dt)
			x += dx / d * s
			z += dz / d * s
			phase += s * 3.4
			turn(atan2(dx, dz), dt, 7.0)
			moving = true
			return false
		return true

	func turn(want: float, dt: float, rate: float = 5.0) -> void:
		yaw += MathX.angle_delta(yaw, want) * MathX.damp(rate, dt)


## A porter: their bench, the job in hand and how far through it.
class Porter:
	var fig: Figure
	var w := Walker.new()
	var seat := Vector2.ZERO
	## {id, on}: a good off the ship to the town, or (on) supplies up the plank.
	var job := {}
	var stage := &"idle"
	var t := 0.0
	## Along the gangplank, 0 its foot .. 1 its top.
	var k := 0.0
	var holding := ""
	var cargo: MeshInstance3D


var index := 0
var spec: Dictionary
var site: Dictionary
var market: Treasure.Market
var title := ""
## The quay's depth back to the beach (m).
var depth := 28.0
var figures: Array[Figure] = []
## The ship tied up alongside (null none), and how much the town has noticed yours (0..1).
var ship: Ship
var attention := 0.0
## Where the porters carry goods to: the warehouse's doors and the landmark's.
var warehouse_door := Vector2.ZERO
var house_door := Vector2.ZERO
## The gangplank's foot on the quay and its top at her rail (town frame).
var plank_foot := Vector3.ZERO
var plank_top := Vector3.ZERO
## The town in the world, and back.
var xf := Transform3D.IDENTITY
var inv := Transform3D.IDENTITY

var _arts: Arts
var _world: World
var _near := Node3D.new()
var _far := Node3D.new()
var _detail := true
var _time := 0.0
var _cheer_t := 99.0
var _cheer_level := 0.0
var _bell_t := 99.0
var _bell := Node3D.new()
var _walkers: Array[Walker] = []
var _porters: Array[Porter] = []
var _jobs: Array[Dictionary] = []
## The strollers' two loops, walked by arc length: even points round each, and its length.
var _loops: Array[PackedVector3Array] = []
var _loop_len := PackedFloat32Array()
var _loop_t := PackedFloat32Array([0.0, 0.0])
var _plank: MeshInstance3D
var _ropes: MeshInstance3D
var _rope_mesh := ArrayMesh.new()
var _rod: MeshInstance3D
var _bobber: MeshInstance3D
var _chimney := Vector3.INF
var _smoke_t := 0.0
var _flag := Node3D.new()
var _ship_local := Vector3.INF
var _lamps: Array[Vector4] = []
## Triangles in the near build and the far shell (for the budget), and in
## the feast-night dressing (drawn only on a feast night, close to).
var tris := Vector2i.ZERO
var fest_tris := 0
## The town's own feast (Festival.FEASTS), and how far tonight's has got
## (0 an ordinary night .. 1 in full swing: Festivals keeps it).
var feast: Dictionary
var festive := 0.0
## The lantern strings, their poles and the drummer's barrel: hidden till a feast.
var _fest := Node3D.new()
var _lantern_mat: ShaderMaterial
## Whether the feast-night crowd is out (true at first, so the first frame puts it away).
var _revels := true
var _ring_rot := 0.0
var _ring_dir := 1.0
var _ring_t := 0.0
## Since the last shell broke overhead (negative: one is on its way up).
var _sky_t := 99.0
## Since the harbourmaster gave the signal for a rocket.
var _fuse_t := 99.0
## Since the fisherman began to set a lantern boat down.
var _rel_t := 99.0


## Builds the town on its site (a world bake's port: x, z, its seaward
## normal nx, nz, and the quay's depth) for spec `i`; its townsfolk dressed
## from `styles` (one per role).
func setup(p_site: Dictionary, i: int, arts: Arts, world: World, styles: Array[Dictionary]) -> void:
	site = p_site
	index = i
	spec = SPECS[i]
	title = spec.name
	depth = float(site.depth)
	_arts = arts
	_world = world
	name = "TradePort%d" % i
	market = Treasure.Market.new(spec.taste, spec.tagline, i * 17 + 3)
	feast = Festival.feast(i)
	xf = Transform3D(Basis(Vector3.UP, atan2(float(site.nx), float(site.nz))), Vector3(float(site.x), 0.0, float(site.z)))
	inv = xf.affine_inverse()
	transform = xf
	_time = randf() * 100.0
	_near.name = "Near"
	_far.name = "Far"
	add_child(_near)
	add_child(_far)
	_far.visible = false
	for k in ROLES.size():
		var fig := Figure.new(styles[k], i * 19 + k + 1)
		figures.append(fig)
	figures[KID].size = 0.66
	figures[FIDDLER].prop = CrewModel.PROP_FIDDLE
	figures[HARBOURMASTER].prop = CrewModel.PROP_PIPE
	figures[TOASTER].prop = CrewModel.PROP_MUG
	_build()


## World point -> the town's frame.
func to_town(p: Vector3) -> Vector3:
	return inv * p


func to_world(p: Vector3) -> Vector3:
	return xf * p


func _local_height(x: float, z: float) -> float:
	var w := xf * Vector3(x, 0.0, z)
	return _world.ground_height(w.x, w.z)


# ------------------------------------------------------------------ build

func _build() -> void:
	var n := TownKit.new(31 + index)
	var f := TownKit.new(37 + index)
	var back := -depth + 0.8
	_build_deck(n, f)
	# warehouse on the left, harbour office behind the berth, the town's landmark on the right
	_warehouse(n, f, -17.0, back)
	_office(n, f, -3.2, back)
	var front := _landmark(n, f, 16.0, back)
	house_door = Vector2(16.0, front + 0.7)
	_lighthouse(n, f)
	for i in STALLS.size():
		_stall(n, f, i, -5.6)
	_props(n)
	for p in LANTERNS:
		_lamps.append(lantern(n, p.x, p.y))
	# the flagpole on the office's back slope (both builds)
	for b: TownKit in [n, f]:
		b.cyl(0.07, 0.1, 5.7, Vector3(-6.2, DECK + 10.75, -depth + 2.6), C_TIMBER_DARK, 6)
	_signs(n)
	tris = Vector2i(n.triangles(), f.triangles())
	var near_mesh := MeshInstance3D.new()
	near_mesh.name = "Town"
	near_mesh.mesh = n.commit_lod()
	near_mesh.material_override = _arts.parts
	_near.add_child(near_mesh)
	var far_mesh := MeshInstance3D.new()
	far_mesh.name = "Shell"
	far_mesh.mesh = f.commit()
	far_mesh.material_override = _arts.parts
	far_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_far.add_child(far_mesh)
	_flag_build()
	_palms()
	_extras()
	_festoon()


func _build_deck(n: TownKit, f: TownKit) -> void:
	var D := depth
	var W := HALF * 2.0
	var deck := MeshInstance3D.new()
	deck.name = "Deck"
	deck.mesh = slab(W, 0.32, D)
	deck.material_override = _arts.deck
	deck.position = Vector3(0.0, DECK - 0.16, -D * 0.5)
	add_child(deck)
	var rnd := Mulberry32.new(31 + index * 7)
	for x in _steps(-W * 0.5 + 0.3, W * 0.5, 4.0, true):
		pile(n, x, -0.25, rnd.next())
		if roundi(x) % 8 == 0:
			pile(f, x, -0.25, rnd.next())
	var z := -4.0
	while z > -D:
		pile(n, -W * 0.5 + 0.3, z, rnd.next())
		pile(n, W * 0.5 - 0.3, z, rnd.next())
		z -= 4.0
	# cross-bracing under the quay's face
	for x in _steps(-W * 0.5 + 0.3, W * 0.5 - 4.0, 4.0, false):
		n.beam(Vector3(x, DECK - 0.45, -0.1), Vector3(x + 4.0, -0.9, -0.1), 0.07, C_PILE)
		n.beam(Vector3(x, -0.9, -0.1), Vector3(x + 4.0, DECK - 0.45, -0.1), 0.07, C_PILE)
	for b: TownKit in [n, f]:
		b.box(W + 0.4, 0.5, 0.34, Vector3(0.0, DECK - 0.3, 0.08), C_TIMBER_DARK, 0.08)
		b.box(W + 0.4, 0.14, 0.4, Vector3(0.0, DECK + 0.07, 0.05), TownKit.shade(C_TIMBER, 1.15), 0.05)
	for s: float in [-1.0, 1.0]:
		n.box(0.4, 0.14, D, Vector3(s * (W * 0.5 + 0.05), DECK + 0.07, -D * 0.5), TownKit.shade(C_TIMBER, 1.15), 0.05)
	# rope fenders hung on the quay's face, and its bollards
	for x in _steps(-W * 0.5 + 2.0, W * 0.5, 6.5, false):
		n.torus(0.26, 0.11, 6, 12, Transform3D(Basis.IDENTITY, Vector3(x, DECK - 0.55, 0.32)), TownKit.lin("#c9b38a"))
	for x in BOLLARDS:
		n.lathe(PackedVector2Array([Vector2(0.24, 0.0), Vector2(0.22, 0.3), Vector2(0.16, 0.42), Vector2(0.2, 0.55), Vector2(0.26, 0.62), Vector2(0.01, 0.66)]),
				Transform3D(Basis.IDENTITY, Vector3(x, DECK + 0.08, -0.35)), C_IRON, 10, TownKit.IRON)
	# steps down to the beach at the back
	for i in 5:
		n.box(3.0, 0.16, 0.5, Vector3(-10.0, DECK - 0.36 * i - 0.1, -D - 0.25 - i * 0.48), TownKit.shade(C_TIMBER, 1.05 - i * 0.03))


## from, from + step, ... up to `to` (included if `upto`).
static func _steps(from: float, to: float, step: float, upto: bool) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	var x := from
	while x < to or (upto and x <= to):
		out.append(x)
		x += step
	return out


## A pile driven into the seabed, leaning a hair (`r` its random draw):
## weed-dark below the waterline, weathered timber above; `cap` gives it a
## head showing through the boards.
static func pile(b: TownKit, x: float, z: float, r: float, cap := false) -> void:
	var length := DECK + 9.0
	var p := TownKit.place(Vector3(x, (DECK - 9.0) * 0.5 + 0.05, z), 0.0, 0.0, (r - 0.5) * 0.05)
	var lo := p * Vector3(0.0, -length * 0.5, 0.0)
	var hi := p * Vector3(0.0, length * 0.5, 0.0)
	var k := (0.35 - lo.y) / (hi.y - lo.y)
	var mid := lo.lerp(hi, k)
	var r_mid := lerpf(0.25, 0.21, k)
	var m := b.kit.verts.size()
	b.kit.spar(lo, mid, 0.25, r_mid, 7, true)
	b.paint_from(m, func(q: Vector3) -> Color:
		return C_ALGAE.lerp(C_PILE, MathX.smooth(-1.5, 0.35, q.y) * 0.4), TownKit.WOOD)
	m = b.kit.verts.size()
	b.kit.spar(mid, hi, r_mid, 0.21, 7, true)
	b.paint_from(m, func(q: Vector3) -> Color:
		return TownKit.shade(C_PILE, 0.9 + fmod(q.y * 3.0, 1.0) * 0.04), TownKit.WOOD)
	if cap:
		b.cyl(0.25, 0.25, 0.12, Vector3(x, DECK + 0.02, z), C_TIMBER_DARK, 7)


## The quay's boards: a slab whose top is drawn in the town's own metres (UV
## (x, z), so the planks run out to the berth); its edges' UVs are pushed far
## off, out of reach of the lanterns' pools.
static func slab(w: float, h: float, d: float) -> ArrayMesh:
	var pos := PackedVector3Array()
	var nrm := PackedVector3Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	var hs := Vector3(w, h, d) * 0.5
	for f: Array in [[Vector3.UP, Vector3.BACK, Vector3.RIGHT], [Vector3.DOWN, Vector3.RIGHT, Vector3.BACK],
			[Vector3.RIGHT, Vector3.UP, Vector3.BACK], [Vector3.LEFT, Vector3.BACK, Vector3.UP],
			[Vector3.BACK, Vector3.RIGHT, Vector3.UP], [Vector3.FORWARD, Vector3.UP, Vector3.RIGHT]]:
		var nn: Vector3 = f[0]
		var u: Vector3 = f[1]
		var v: Vector3 = f[2]
		var c := nn * hs
		var hu := u * hs
		var hv := v * hs
		var o := pos.size()
		for q: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
			var p := c + hu * q.x + hv * q.y
			pos.append(p)
			nrm.append(nn)
			# the top in the town's metres (its middle is d/2 inshore of the quay's edge)
			uv.append(Vector2(p.x, p.z - d * 0.5) if nn == Vector3.UP else Vector2(p.x + p.z, p.y) + Vector2(1000.0, 1000.0))
		# u x v = n: corners counter-clockwise from outside, wound clockwise for Godot
		idx.append_array([o, o + 2, o + 1, o, o + 3, o + 2])
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = pos
	a[Mesh.ARRAY_NORMAL] = nrm
	a[Mesh.ARRAY_TEX_UV] = uv
	a[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	return mesh


## A lantern on its post; returns its lamp (x, y, z, brightness).
static func lantern(b: TownKit, x: float, z: float, h: float = LANTERN_H) -> Vector4:
	b.cyl(0.09, 0.12, h, Vector3(x, DECK + h * 0.5, z), C_TIMBER_DARK, 6)
	b.box(0.08, 0.08, 0.7, Vector3(x, DECK + h - 0.1, z + 0.3), C_TIMBER_DARK)
	var ly := DECK + h - 0.55
	b.ball(0.17, Vector3(x, ly, z + 0.6), C_LAMP, TownKit.GLOW, Vector3(1.0, 1.3, 1.0))
	b.cone(0.24, 0.24, Vector3(x, ly + 0.3, z + 0.6), C_IRON, 6, TownKit.IRON)
	b.cyl(0.14, 0.11, 0.08, Vector3(x, ly - 0.24, z + 0.6), C_IRON, 8, TownKit.IRON)
	return Vector4(x, ly, z + 0.6, 1.0)


static func siding(b: TownKit, w: float, h: float, x: float, y0: float, z: float, col: Color) -> void:
	var n := floori(h / 0.32)
	for i in n:
		b.box(w, 0.3, 0.06, Vector3(x, y0 + 0.16 + i * (h / n), z), TownKit.shade(col, 0.94 if i % 2 else 1.03))


static func window(b: TownKit, x: float, y: float, z: float, w: float, h: float, shutter: Color, flowers: bool = false) -> void:
	b.box(w + 0.26, h + 0.26, 0.14, Vector3(x, y, z), C_CREAM)
	b.box(w, h, 0.06, Vector3(x, y, z + 0.05), C_GLASS, 0.0, TownKit.GLOW)
	b.box(0.07, h, 0.06, Vector3(x, y, z + 0.1), C_CREAM)
	b.box(w, 0.07, 0.06, Vector3(x, y, z + 0.1), C_CREAM)
	# shutters swung open against the wall
	for s: float in [-1.0, 1.0]:
		b.box_xf(Transform3D(Basis(Vector3.UP, -s * 1.15), Vector3(x + s * (w * 0.5 + 0.13), y, z + 0.08)) * Transform3D(Basis.IDENTITY, Vector3(s * w * 0.25, 0.0, 0.0)), Vector3(w * 0.5, h + 0.1, 0.06), shutter)
	if flowers:
		b.box(w + 0.3, 0.28, 0.34, Vector3(x, y - h * 0.5 - 0.26, z + 0.2), C_TIMBER)
		var cols := ["#e8455a", "#f5c542", "#f08fb8", "#ffffff"]
		for i in 7:
			b.ball(0.11, Vector3(x - w * 0.5 + 0.05 + (i / 6.0) * (w - 0.1), y - h * 0.5 - 0.06, z + 0.22 + (i % 2) * 0.06), TownKit.lin("#3f8a3a" if i % 3 == 1 else cols[i % 4]))


static func door(b: TownKit, x: float, y0: float, z: float, w: float = 1.6, h: float = 2.5) -> void:
	b.box(w + 0.3, h + 0.25, 0.18, Vector3(x, y0 + (h + 0.25) * 0.5, z), C_CREAM)
	b.box(w, h, 0.12, Vector3(x, y0 + h * 0.5, z + 0.05), C_DOOR)
	b.ball(0.07, Vector3(x + w * 0.32, y0 + h * 0.45, z + 0.14), C_GOLD, TownKit.GILT)


## A shingled roof; the far shell's is one plain slab a side.
func _roof(b: TownKit, far: bool, w: float, span: float, rise: float, x: float, top: float, z: float, col: Color, along_x: bool = true) -> void:
	if not far:
		b.roof(w, span, rise, x, top, z, col, along_x)
		return
	var half := span * 0.5
	var a := atan2(rise, half)
	var length := (half + 0.55) / cos(a)
	for s: float in [-1.0, 1.0]:
		if along_x:
			b.box_xf(Transform3D(Basis(Vector3.RIGHT, s * a), Vector3(x, top + rise - length * 0.5 * sin(a) + 0.14, z + length * 0.5 * cos(a) * s)), Vector3(w + 1.1, 0.26, length), col)
		else:
			b.box_xf(Transform3D(Basis(Vector3.BACK, -s * a), Vector3(x + length * 0.5 * cos(a) * s, top + rise - length * 0.5 * sin(a) + 0.14, z)), Vector3(length, 0.26, w + 1.1), col)


func _warehouse(n: TownKit, f: TownKit, cx: float, back: float) -> void:
	var W := 10.0
	var Dp := 7.0
	var H := 5.2
	var cz := back + Dp * 0.5
	var front := back + Dp
	var y0 := DECK
	var wall := TownKit.lin(spec.wall2)
	var trim := TownKit.lin(spec.trim)
	for b: TownKit in [n, f]:
		b.box(W, H, Dp, Vector3(cx, y0 + H * 0.5, cz), wall, 0.1)
		b.gable(Dp + 0.2, 2.6, W + 0.2, Vector3(cx, y0 + H, cz), wall, true)
		_roof(b, b == f, W, Dp + 0.2, 2.6, cx, y0 + H, cz, TownKit.lin(spec.roof))
	siding(n, W - 0.5, H - 0.1, cx, y0, front + 0.02, wall)
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			n.box(0.4, H + 0.1, 0.4, Vector3(cx + sx * (W * 0.5 + 0.02), y0 + H * 0.5, cz + sz * (Dp * 0.5 + 0.02)), trim, 0.08)
	# big doors, one ajar, a dark hold behind
	n.box(4.2, 3.9, 0.2, Vector3(cx, y0 + 1.95, front + 0.08), C_CREAM)
	n.box(3.6, 3.6, 0.1, Vector3(cx, y0 + 1.8, front + 0.06), TownKit.lin("#0c0a08"))
	for leaf: Vector2 in [Vector2(-1.0, 0.25), Vector2(1.0, 1.3)]:
		var s := leaf.x
		var hinge := Transform3D(Basis(Vector3.UP, s * leaf.y), Vector3(cx + s * 1.8, y0 + 1.8, front + 0.16))
		n.box_xf(hinge * Transform3D(Basis.IDENTITY, Vector3(-s * 0.9, 0.0, 0.0)), Vector3(1.8, 3.6, 0.12), C_DOOR)
		# ledged and braced, like a barn's
		var dark := TownKit.shade(C_DOOR, 0.72)
		for y: float in [-1.15, 1.15]:
			n.box_xf(hinge * Transform3D(Basis.IDENTITY, Vector3(-s * 0.9, y, 0.075)), Vector3(1.62, 0.16, 0.04), dark)
		n.box_xf(hinge * Transform3D(Basis(Vector3.BACK, s * 0.86), Vector3(-s * 0.9, 0.0, 0.075)), Vector3(2.5, 0.14, 0.035), dark)
	# hoist beam and its ring
	n.box(0.32, 0.32, 2.2, Vector3(cx, y0 + H + 1.6, front + 0.9), C_TIMBER)
	n.torus(0.2, 0.06, 6, 12, Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(cx, y0 + H + 1.3, front + 1.8)), C_IRON, TownKit.IRON)
	warehouse_door = Vector2(cx, front + 0.8)


func _office(n: TownKit, f: TownKit, cx: float, back: float) -> void:
	var W := 8.4
	var Dp := 6.2
	var cz := back + Dp * 0.5
	var front := back + Dp
	var y0 := DECK
	var wall := TownKit.lin(spec.wall)
	var roof := TownKit.lin(spec.roof)
	for b: TownKit in [n, f]:
		b.box(W, 3.4, Dp, Vector3(cx, y0 + 1.7, cz), wall, 0.1)
		b.box(W + 0.5, 3.0, Dp + 0.4, Vector3(cx, y0 + 5.0, cz), TownKit.shade(wall, 0.92), 0.1)
		b.gable(Dp + 0.4, 2.4, W + 0.5, Vector3(cx, y0 + 6.5, cz), wall, true)
		_roof(b, b == f, W + 0.4, Dp + 0.4, 2.4, cx, y0 + 6.5, cz, roof)
	siding(n, W - 0.4, 3.2, cx, y0, front + 0.02, wall)
	n.box(W + 0.9, 0.3, Dp + 0.9, Vector3(cx, y0 + 3.5, cz), C_TIMBER_DARK, 0.08)
	# balcony with a rail over the door
	n.box(W - 1.6, 0.16, 1.3, Vector3(cx, y0 + 3.62, front + 0.7), C_TIMBER)
	for i in 11:
		n.box(0.07, 0.8, 0.07, Vector3(cx - (W - 1.8) * 0.5 + (i / 10.0) * (W - 1.8), y0 + 4.08, front + 1.3), C_CREAM)
	n.box(W - 1.6, 0.08, 0.1, Vector3(cx, y0 + 4.5, front + 1.3), TownKit.lin(spec.trim))
	door(n, cx, y0, front + 0.04)
	window(n, cx - 2.6, y0 + 1.7, front + 0.08, 1.1, 1.0, roof, true)
	window(n, cx + 2.6, y0 + 1.7, front + 0.08, 1.1, 1.0, roof, true)
	for wx: float in [-2.4, 0.0, 2.4]:
		window(n, cx + wx, y0 + 5.1, front + 0.28, 0.9, 1.0, roof, false)
	# a clock in a dormer over the eaves
	var gy := y0 + 7.3
	n.box(1.7, 1.6, 1.6, Vector3(cx, gy, front - 0.6), wall)
	n.gable(1.9, 0.7, 1.7, Vector3(cx, gy + 0.8, front - 0.6), roof, false)
	n.cyl(0.62, 0.62, 0.12, Vector3(cx, gy, front + 0.25), C_CREAM, 18, TownKit.WOOD, PI * 0.5)
	n.torus(0.64, 0.07, 6, 20, Transform3D(Basis.IDENTITY, Vector3(cx, gy, front + 0.3)), C_GOLD, TownKit.GILT)
	n.box(0.06, 0.45, 0.04, Vector3(cx, gy + 0.18, front + 0.34), C_IRON, 0.0, TownKit.IRON)
	n.box(0.32, 0.06, 0.04, Vector3(cx + 0.14, gy, front + 0.34), C_IRON, 0.0, TownKit.IRON)


## The town's landmark; returns its front face.
func _landmark(n: TownKit, f: TownKit, cx: float, back: float) -> float:
	var wall := TownKit.lin(spec.wall)
	var trim := TownKit.lin(spec.trim)
	var roof := TownKit.lin(spec.roof)
	var y0 := DECK
	var W := 10.0
	match spec.signature:
		"bank":
			var Dp := 7.0
			var cz := back + Dp * 0.5
			var front := back + Dp
			for b: TownKit in [n, f]:
				b.box(W, 5.6, Dp, Vector3(cx, y0 + 2.8, cz), wall, 0.08)
				b.box(W + 0.6, 0.5, Dp + 0.6, Vector3(cx, y0 + 5.8, cz), trim)
				# drum and golden dome
				b.cyl(2.3, 2.4, 1.4, Vector3(cx, y0 + 6.7, cz), wall, 20)
				b.dome(Transform3D(Basis.IDENTITY, Vector3(cx, y0 + 7.4, cz)), 2.35, 20, 10, C_GOLD, TownKit.GILT)
				b.cyl(0.08, 0.12, 1.2, Vector3(cx, y0 + 10.2, cz), C_GOLD, 8, TownKit.GILT)
			n.ball(0.22, Vector3(cx, y0 + 10.9, cz), C_GOLD, TownKit.GILT)
			# portico: steps, columns and a pediment
			for i in 3:
				n.box(7.4 - i * 0.4, 0.16, 0.5, Vector3(cx, y0 + 0.08 + i * 0.16, front + 1.7 - i * 0.45), TownKit.shade(C_STONE, 1.25 - i * 0.05))
			for k: float in [-3.0, -1.0, 1.0, 3.0]:
				n.cyl(0.26, 0.3, 4.7, Vector3(cx + k * 0.95, y0 + 2.8, front + 1.0), C_CREAM, 12)
				n.box(0.7, 0.2, 0.7, Vector3(cx + k * 0.95, y0 + 5.2, front + 1.0), trim)
			n.box(7.6, 0.4, 1.8, Vector3(cx, y0 + 5.45, front + 0.85), C_CREAM)
			n.gable(7.6, 1.3, 1.8, Vector3(cx, y0 + 5.65, front + 0.85), C_CREAM, false)
			door(n, cx, y0 + 0.48, front + 0.04, 1.7, 2.8)
			for wx: float in [-3.6, 3.6]:
				window(n, cx + wx, y0 + 3.0, front + 0.06, 0.9, 1.7, TownKit.lin("#27407a"))
			return front + 1.7
		"bazaar":
			var Dp := 7.0
			var cz := back + Dp * 0.5
			var front := back + Dp
			for b: TownKit in [n, f]:
				b.box(W, 5.0, Dp, Vector3(cx, y0 + 2.5, cz), wall, 0.12)
				b.box(W + 0.4, 0.7, Dp + 0.4, Vector3(cx, y0 + 5.2, cz), trim, 0.1)
				for dx: float in [-2.8, 2.8]:
					b.cyl(1.2, 1.25, 0.6, Vector3(cx + dx, y0 + 5.8, cz), trim, 14)
					b.dome(Transform3D(Basis.from_scale(Vector3(1.0, 1.25, 1.0)), Vector3(cx + dx, y0 + 6.1, cz)), 1.25, 14, 8, roof)
			for dx: float in [-2.8, 2.8]:
				n.cone(0.14, 0.8, Vector3(cx + dx, y0 + 8.0, cz), C_GOLD, 8, TownKit.GILT)
			# three horseshoe arches, dark inside, with spice sacks at their feet
			for k: float in [-1.0, 0.0, 1.0]:
				var ax := cx + k * 3.1
				n.box(2.1, 2.6, 0.1, Vector3(ax, y0 + 1.3, front + 0.02), C_DARK)
				n.fan(1.05, 14, 0.0, PI, Vector3(ax, y0 + 2.6, front + 0.03), C_DARK)
				n.torus(1.15, 0.12, 6, 16, Transform3D(Basis.IDENTITY, Vector3(ax, y0 + 2.6, front + 0.06)), trim, TownKit.WOOD, PI)
				for s: float in [-1.0, 1.0]:
					n.box(0.24, 2.6, 0.24, Vector3(ax + s * 1.15, y0 + 1.3, front + 0.06), trim)
			var spice := ["#c8352b", "#e8962a", "#f5c542", "#7a3a1a", "#5a7a2a", "#b84a6a"]
			for i in spice.size():
				var sx := cx - 4.2 + i * 1.65
				n.cyl(0.32, 0.38, 0.6, Vector3(sx, y0 + 0.3, front + 0.75), TownKit.lin("#c9a46a"), 10)
				n.dome(Transform3D(Basis.from_scale(Vector3(1.0, 0.55, 1.0)), Vector3(sx, y0 + 0.6, front + 0.75)), 0.3, 10, 6, TownKit.lin(spice[i]))
			# a striped awning out front
			n.awning(W - 0.6, 2.0, 0.38, Vector3(cx, y0 + 3.55, front + 0.95), 0.9, TownKit.lin(spec.awning[0]), TownKit.lin(spec.awning[1]))
			return front + 1.6
		"gallery":
			var Dp := 7.0
			var cz := back + Dp * 0.5
			var front := back + Dp
			for b: TownKit in [n, f]:
				b.box(W, 5.4, Dp, Vector3(cx, y0 + 2.7, cz), wall, 0.1)
				# gabled to the sea, its roof running front to back
				b.gable(W + 0.3, 2.8, Dp + 0.3, Vector3(cx, y0 + 5.4, cz), wall, false)
				_roof(b, b == f, Dp, W + 0.3, 2.8, cx, y0 + 5.4, cz, roof, false)
				# bell tower at the back corner, spire on top
				b.box(2.6, 9.6, 2.6, Vector3(cx + 3.4, y0 + 4.8, back + 1.4), TownKit.lin(spec.wall2), 0.08)
				b.cone(2.0, 3.4, Vector3(cx + 3.4, y0 + 11.3, back + 1.4), roof, 4, TownKit.WOOD, true, PI * 0.25)
			# belfry openings and the bell
			for s: float in [-1.0, 1.0]:
				n.box(0.9, 1.5, 0.1, Vector3(cx + 3.4, y0 + 8.3, back + 1.4 + s * 1.32), C_DARK)
			n.lathe(PackedVector2Array([Vector2(0.02, 0.0), Vector2(0.22, -0.06), Vector2(0.3, -0.35), Vector2(0.42, -0.7), Vector2(0.01, -0.7)]),
					Transform3D(Basis.IDENTITY, Vector3(cx + 3.4, y0 + 8.9, back + 1.4)), C_GOLD, 12, TownKit.GILT)
			n.torus(0.2, 0.05, 4, 10, Transform3D(Basis.IDENTITY, Vector3(cx + 3.4, y0 + 13.15, back + 1.4)), C_GOLD, TownKit.GILT)
			# rose window in the gable, the portal, and two framed paintings on easels out front
			var face := front + 0.15
			n.cyl(0.85, 0.85, 0.1, Vector3(cx, y0 + 6.3, face + 0.05), C_GLASS, 16, TownKit.GLOW, PI * 0.5)
			n.torus(0.9, 0.12, 6, 18, Transform3D(Basis.IDENTITY, Vector3(cx, y0 + 6.3, face + 0.1)), TownKit.lin(spec.trim))
			door(n, cx, y0, front + 0.04, 1.9, 3.0)
			n.torus(1.0, 0.13, 6, 14, Transform3D(Basis.IDENTITY, Vector3(cx, y0 + 3.0, front + 0.14)), TownKit.lin(spec.trim), TownKit.WOOD, PI)
			for s: float in [-1.0, 1.0]:
				var ex := cx + s * 3.2
				for k: float in [-1.0, 1.0]:
					n.beam(Vector3(ex + k * 0.4, y0, front + 1.3), Vector3(ex, y0 + 1.9, front + 1.0), 0.04, C_TIMBER_DARK)
				carry_shape(n, "painting", Transform3D(Basis(Vector3.RIGHT, -0.2), Vector3(ex, y0 + 1.45, front + 1.25)))
			return front + 1.6
		_:
			# the distillery
			var Dp := 7.2
			var cz := back + Dp * 0.5
			var front := back + Dp
			var barn := TownKit.shade(roof, 1.6)
			var brick := TownKit.lin("#a8523a")
			for b: TownKit in [n, f]:
				b.box(W, 4.8, Dp, Vector3(cx, y0 + 2.4, cz), barn, 0.08)
				b.gable(Dp + 0.2, 2.9, W + 0.2, Vector3(cx, y0 + 4.8, cz), barn, true)
				_roof(b, b == f, W, Dp + 0.2, 2.9, cx, y0 + 4.8, cz, TownKit.lin("#3a2a22"))
			# the tall brick chimney, course on course (one block far off)
			f.box(1.2, 11.0, 1.2, Vector3(cx - 3.6, y0 + 5.5, back + 1.2), TownKit.shade(brick, 0.92))
			for i in 33:
				var inset := 0.0 if i % 2 else 0.03
				n.box(1.2 - inset, 11.0 / 33.0, 1.2 - inset, Vector3(cx - 3.6, y0 + (i + 0.5) * 11.0 / 33.0, back + 1.2), TownKit.shade(brick, 0.85 if i % 2 else 0.99))
			_chimney = Vector3(cx - 3.6, y0 + 11.2, back + 1.2)
			n.box(1.45, 0.3, 1.45, Vector3(cx - 3.6, y0 + 11.0, back + 1.2), C_TIMBER_DARK)
			siding(n, W - 0.5, 4.6, cx, y0, front + 0.02, barn)
			door(n, cx + 1.5, y0, front + 0.04, 2.6, 3.0)
			window(n, cx - 2.6, y0 + 2.2, front + 0.08, 1.2, 1.1, TownKit.lin(spec.wall2), true)
			# copper still with its swan neck, and a pyramid of rum barrels
			var sx := cx + 5.6
			var sz := front + 1.3
			var copper := TownKit.lin("#c8743a")
			n.dome(Transform3D(Basis.from_scale(Vector3(1.0, 1.1, 1.0)), Vector3(sx, y0 + 1.15, sz)), 1.0, 16, 10, copper, TownKit.GILT, PI)
			n.cyl(0.25, 0.5, 1.1, Vector3(sx, y0 + 2.6, sz), copper, 12, TownKit.GILT)
			n.beam(Vector3(sx, y0 + 3.1, sz), Vector3(sx - 1.8, y0 + 2.4, sz - 0.2), 0.08, copper, TownKit.GILT)
			n.cyl(0.42, 0.42, 1.2, Vector3(sx - 1.9, y0 + 1.6, sz - 0.2), C_TIMBER, 10)
			n.cyl(1.05, 1.05, 0.3, Vector3(sx, y0 + 0.15, sz), C_STONE, 14)
			for lvl in 3:
				for i in 3 - lvl:
					n.barrel(Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(cx - 4.6 + i * 0.8 + lvl * 0.4, y0 + 0.37 + lvl * 0.66, front + 1.1)), 0.95, 0.37, 8)
			return front + 1.4


func _lighthouse(n: TownKit, f: TownKit) -> void:
	var cx := LIGHTHOUSE.x
	var cz := LIGHTHOUSE.y
	var H := LIGHTHOUSE_H
	var y0 := DECK
	for b: TownKit in [n, f]:
		# red and white bands, each its own drum
		var y := 0.0
		var k := 0
		while y < H - 1e-3:
			var y1 := minf(y + 1.4, H)
			var m := b.kit.verts.size()
			b.kit.spar(Vector3(cx, y0 + y, cz), Vector3(cx, y0 + y1, cz), lerpf(1.45, 1.0, y / H), lerpf(1.45, 1.0, y1 / H), 14, k == 0)
			b.paint_from(m, TownKit.lin("#c8352b") if k % 2 else TownKit.lin("#f6f0e2"), TownKit.WOOD)
			y = y1
			k += 1
		b.cyl(1.5, 1.5, 0.25, Vector3(cx, y0 + H + 0.1, cz), C_TIMBER_DARK, 14)
		b.cyl(0.8, 0.8, 1.3, Vector3(cx, y0 + H + 0.9, cz), C_LAMP, 12, TownKit.GLOW)
		b.cone(1.15, 1.2, Vector3(cx, y0 + H + 2.15, cz), TownKit.lin(spec.roof), 12, TownKit.WOOD, true)
	# a rail round its gallery
	for i in 16:
		var a := TAU * i / 16.0
		n.box(0.05, 0.6, 0.05, Vector3(cx + cos(a) * 1.42, y0 + H + 0.52, cz + sin(a) * 1.42), C_TIMBER_DARK)
	n.torus(1.42, 0.03, 4, 32, Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(cx, y0 + H + 0.82, cz)), C_TIMBER_DARK)
	_lamps.append(Vector4(cx, y0 + H + 0.9, cz, 1.6))


## A market stall: counter, posts, striped canopy and its wares.
func _stall(n: TownKit, f: TownKit, i: int, z: float) -> void:
	var x := STALLS[i]
	var a0 := TownKit.lin(spec.awning[0])
	var a1 := TownKit.lin(spec.awning[1])
	n.box(3.4, 0.95, 1.1, Vector3(x, DECK + 0.48, z), C_TIMBER)
	n.box(3.6, 0.1, 1.3, Vector3(x, DECK + 1.0, z), TownKit.shade(C_TIMBER, 1.2))
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			n.box(0.12, 2.6, 0.12, Vector3(x + sx * 1.7, DECK + 1.3, z + sz * 0.62 - 0.35), C_TIMBER_DARK)
	for b: TownKit in [n, f]:
		b.awning(3.9, 2.2, 0.3, Vector3(x, DECK + 2.55, z - 0.3), 0.49, a0, a1)
	# the scalloped valance along its front
	for k in 8:
		n.fan(0.25, 8, PI, PI, Vector3(x - 1.72 + k * 0.49, DECK + 2.22, z + 0.76), a0 if k % 2 else a1)
	var rnd := Mulberry32.new(i * 13 + index * 5 + 1)
	var wares := (index + i) % 4
	for k in 14:
		var wx := x - 1.45 + (k % 7) * 0.48
		var wz := z - 0.25 + floorf(k / 7.0) * 0.42
		var y := DECK + 1.12
		match wares:
			0:
				# fruit: oranges, limes, bananas
				var c: String = ["#f08a24", "#9ad04a", "#f5d342", "#d8322a"][int(rnd.next() * 4.0)]
				for j in 3:
					n.ball(0.1, Vector3(wx + (j - 1) * 0.12, y + (0.12 if j == 1 else 0.0), wz), TownKit.lin(c))
			1:
				# fish laid out on the counter
				var m := n.kit.verts.size()
				n.kit.sphere(Transform3D(Basis(Vector3.UP, rnd.next()), Vector3(wx, y, wz)) * Transform3D(Basis.from_scale(Vector3(2.2, 0.55, 0.8)), Vector3.ZERO), 0.12, 8, 5)
				n.paint_from(m, TownKit.lin("#b8c8d0"), TownKit.WOOD)
			2:
				# bolts of cloth
				n.cyl(0.12, 0.12, 0.42, Vector3(wx, y + 0.06, wz), TownKit.lin(["#c8352b", "#2f8ad8", "#f5c542", "#2f7d3a", "#e98fb0"][k % 5]), 8, TownKit.WOOD, PI * 0.5)
			_:
				# pots and jars
				n.lathe(PackedVector2Array([Vector2(0.01, 0.0), Vector2(0.12, 0.02), Vector2(0.15, 0.12), Vector2(0.08, 0.26), Vector2(0.09, 0.3), Vector2(0.01, 0.3)]),
						Transform3D(Basis.IDENTITY, Vector3(wx, y - 0.04, wz)), TownKit.lin(["#c2583f", "#3f9c98", "#e9b864"][k % 3]), 8)


func _prop_barrel(n: TownKit, x: float, z: float, h: float = 0.95, tilt: float = 0.0, ry: float = 0.0) -> void:
	n.barrel(Transform3D(Basis(Vector3.UP, ry) * Basis(Vector3.BACK, tilt), Vector3(x, DECK + (0.37 if tilt != 0.0 else h * 0.5), z)), h, 0.37, 8)


func _prop_crate(n: TownKit, x: float, y: float, z: float, s: float, ry: float) -> void:
	n.crate(Transform3D(Basis(Vector3.UP, ry), Vector3(x, DECK + y + s * 0.5, z)), s)


func _props(n: TownKit) -> void:
	var wx := warehouse_door.x
	var wz := warehouse_door.y
	# stacks by the warehouse doors
	_prop_crate(n, wx - 3.8, 0.0, wz - 0.3, 1.1, 0.1)
	_prop_crate(n, wx - 2.7, 0.0, wz - 0.5, 1.0, -0.2)
	_prop_crate(n, wx - 3.3, 1.1, wz - 0.4, 0.9, 0.3)
	_prop_barrel(n, wx + 3.0, wz - 0.4)
	_prop_barrel(n, wx + 3.8, wz - 0.6, 0.9)
	_prop_barrel(n, wx + 3.4, wz + 0.5, 0.95, PI * 0.5, 0.4)
	# the porters' benches: a plank across two barrels each
	for bx: float in [-22.9, -12.4]:
		_prop_barrel(n, bx - 0.75, -5.2, 0.48)
		_prop_barrel(n, bx + 0.75, -5.2, 0.48)
		n.box(2.4, 0.08, 0.5, Vector3(bx, DECK + 0.52, -5.2), TownKit.shade(C_TIMBER, 1.1))
	# the fiddler's barrel
	_prop_barrel(n, -9.5, -6.4, 0.85)
	# the bell post by the harbourmaster
	for s: float in [-1.0, 1.0]:
		n.box(0.16, 2.9, 0.16, Vector3(BELL.x + s * 0.55, DECK + 1.45, BELL.z), C_TIMBER_DARK)
	n.box(1.4, 0.18, 0.22, Vector3(BELL.x, DECK + 2.9, BELL.z), C_TIMBER)
	# planters full of flowers
	for p: Vector2 in [Vector2(-7.5, -4.4), Vector2(2.0, -4.4)]:
		n.cyl(0.55, 0.62, 0.5, Vector3(p.x, DECK + 0.25, p.y), C_TIMBER, 12)
		var cols := ["#e8455a", "#f5c542", "#f08fb8", "#ffffff", "#3f8a3a"]
		for k in 9:
			var a := k / 9.0 * TAU
			n.ball(0.13, Vector3(p.x + cos(a) * 0.32, DECK + 0.6, p.y + sin(a) * 0.32), TownKit.lin(cols[k % 5]))
		n.ball(0.32, Vector3(p.x, DECK + 0.62, p.y), TownKit.lin("#3f8a3a"), TownKit.WOOD, Vector3(1.0, 0.6, 1.0))


## The painted boards: the town's name over the office and on a board over
## the quay (readable from your deck), its landmark's and the warehouse's.
func _signs(n: TownKit) -> void:
	var back := -depth + 0.8
	var bank: bool = spec.signature == "bank"
	var boards := [
		[5.6, 1.05, 0, Vector3(-3.2, DECK + 3.0, back + 6.4)],
		[4.8, 0.9, 1, Vector3(16.0, DECK + (4.6 if bank else 4.4), back + 7.0 + (1.95 if bank else 0.25))],
		[4.0, 0.75, 2, Vector3(-17.0, DECK + 4.4, back + 7.2)],
		[6.2, 1.16, 0, Vector3(9.5, DECK + 3.1, -1.4)],
	]
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	var rows := SPECS.size() * 3.0
	for bd: Array in boards:
		var w: float = bd[0]
		var h: float = bd[1]
		var p: Vector3 = bd[3]
		var v0 := (index * 3 + int(bd[2])) / rows
		var v1 := v0 + 1.0 / rows
		var o := pos.size()
		pos.append_array([p + Vector3(-w * 0.5, h * 0.5, 0.0), p + Vector3(w * 0.5, h * 0.5, 0.0), p + Vector3(w * 0.5, -h * 0.5, 0.0), p + Vector3(-w * 0.5, -h * 0.5, 0.0)])
		# a hair in from the row's edges, so the next row's border doesn't bleed in
		uv.append_array([Vector2(0.0, v0 + 0.0015), Vector2(1.0, v0 + 0.0015), Vector2(1.0, v1 - 0.0015), Vector2(0.0, v1 - 0.0015)])
		idx.append_array([o, o + 1, o + 2, o, o + 2, o + 3])
		# its board behind it
		n.box(w + 0.12, h + 0.12, 0.08, p - Vector3(0.0, 0.0, 0.05), C_TIMBER_DARK)
	# the board over the quay stands on two posts
	for s: float in [-1.0, 1.0]:
		n.cyl(0.07, 0.07, DECK + 2.52 - DECK, Vector3(9.5 + s * 3.15, DECK + 1.26, -1.47), C_TIMBER_DARK, 6)
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
	var mi := MeshInstance3D.new()
	mi.name = "Signs"
	mi.mesh = mesh
	mi.material_override = _arts.sign
	_near.add_child(mi)


## The town's flag, on its pole over the harbour office, turned by the wind.
func _flag_build() -> void:
	var w := 3.2
	var h := 2.0
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	var cols := 14
	var rows := 4
	for j in rows + 1:
		for i in cols + 1:
			var u := float(i) / cols
			var v := float(j) / rows
			pos.append(Vector3(u * w, -v * h, 0.0))
			uv.append(Vector2(u, (index + v * 0.995 + 0.0025) / SPECS.size()))
	for j in rows:
		for i in cols:
			var a := j * (cols + 1) + i
			idx.append_array([a, a + 1, a + cols + 2, a, a + cols + 2, a + cols + 1])
	var nrm := PackedVector3Array()
	nrm.resize(pos.size())
	nrm.fill(Vector3.BACK)
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	arr[Mesh.ARRAY_NORMAL] = nrm
	arr[Mesh.ARRAY_TEX_UV] = uv
	arr[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	var mi := MeshInstance3D.new()
	mi.name = "Flag"
	mi.mesh = mesh
	mi.material_override = _arts.flag
	# (waving, it reaches a little out of its plane)
	mi.extra_cull_margin = 0.6
	_flag.name = "FlagPivot"
	_flag.position = Vector3(-6.2, DECK + 13.4, -depth + 2.6)
	_flag.add_child(mi)
	add_child(_flag)


## Palms round the town: on the beach behind it, or on the quay's boards.
func _palms() -> void:
	var rnd := Mulberry32.new(77 + index * 11)
	var D := depth
	var spots: Array[Vector2] = [Vector2(-27.0, -D - 4.0), Vector2(-8.0, -D - 5.0), Vector2(8.0, -D - 4.5), Vector2(24.0, -D - 3.5), Vector2(-28.5, -D * 0.4), Vector2(29.0, -D * 0.6)]
	# the island planting's three palms: trunk heights and leans they were grown with
	var trunk := [8.5, 10.5, 7.0]
	var leans := [1.6, 2.4, 0.9]
	var hi: Array[PackedFloat32Array] = [PackedFloat32Array(), PackedFloat32Array(), PackedFloat32Array()]
	for i in spots.size():
		var x := spots[i].x
		var z := spots[i].y
		var y := maxf(_local_height(x, z), 0.2) - 0.2
		# no beach there: leave it out
		if y < 0.1 and z < -D:
			continue
		var height := 8.0 + rnd.next() * 3.0
		var lean := 1.4 + rnd.next()
		var yaw := rnd.next() * TAU
		# the palm whose lean, grown to this height, is nearest the one wanted
		var best := 0
		for v in 3:
			if absf(leans[v] * height / trunk[v] - lean) < absf(leans[best] * height / trunk[best] - lean):
				best = v
		var s: float = height / trunk[best]
		var t := Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * s), Vector3(x, DECK if z > -D else y, z))
		var b := t.basis
		var buf := hi[best]
		buf.append_array(PackedFloat32Array([b.x.x, b.y.x, b.z.x, t.origin.x, b.x.y, b.y.y, b.z.y, t.origin.y, b.x.z, b.y.z, b.z.z, t.origin.z, 1.0, 1.0, 1.0, fmod(i * 0.37 + index * 0.21, 1.0)]))
		hi[best] = buf
	var mat: ShaderMaterial = Flora.kit().materials["palm"]
	for v in 3:
		var count := hi[v].size() / 16
		if count == 0:
			continue
		# every frond up close, the in-between cut past a hundred metres
		for lv in 2:
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.use_custom_data = true
			mm.mesh = _arts.palms[v] if lv == 0 else _arts.palms_mid[v]
			mm.instance_count = count
			mm.buffer = hi[v]
			var mmi := MultiMeshInstance3D.new()
			mmi.name = "Palms%d%s" % [v, "" if lv == 0 else "Mid"]
			mmi.multimesh = mm
			mmi.material_override = mat
			if lv == 0:
				mmi.visibility_range_end = 110.0
				mmi.visibility_range_end_margin = 8.0
			else:
				mmi.visibility_range_begin = 110.0
				mmi.visibility_range_begin_margin = 8.0
			_near.add_child(mmi)


## The moving parts: the bell, the fisherman's rod and float, the mooring
## lines and gangplank, the porters' loads; the lamps' halos after dark.
func _extras() -> void:
	_bell.name = "Bell"
	_bell.position = BELL
	var bm := MeshInstance3D.new()
	bm.mesh = _arts.bell
	bm.material_override = _arts.parts
	_bell.add_child(bm)
	_near.add_child(_bell)
	_rod = MeshInstance3D.new()
	_rod.name = "Rod"
	_rod.mesh = _arts.rod
	_rod.material_override = _arts.parts
	_near.add_child(_rod)
	_bobber = MeshInstance3D.new()
	_bobber.name = "Float"
	_bobber.mesh = _arts.bobber
	_bobber.material_override = _arts.parts
	_bobber.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_near.add_child(_bobber)
	_ropes = MeshInstance3D.new()
	_ropes.name = "Lines"
	_ropes.mesh = _rope_mesh
	_ropes.material_override = _arts.rope
	_ropes.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_near.add_child(_ropes)
	_plank = MeshInstance3D.new()
	_plank.name = "Gangplank"
	_plank.mesh = _arts.plank
	_plank.material_override = _arts.parts
	_plank.visible = false
	add_child(_plank)
	_near.add_child(halo_mesh(_lamps, _arts.halo))
	for i in 4:
		_walkers.append(Walker.new())
	# the strollers' loops: one along the market front, one along the warehouse end
	for pts: Array in [[[4.0, -1.9], [13.0, -1.6], [23.0, -2.2], [24.5, -3.8], [14.0, -4.0], [3.5, -3.6]],
			[[-26.0, -2.0], [-18.0, -1.6], [-9.0, -2.0], [-8.6, -3.7], [-17.0, -4.1], [-25.6, -3.8]]]:
		var ctrl := PackedVector3Array()
		for p: Array in pts:
			ctrl.append(Vector3(p[0], 0.0, p[1]))
		var even := Curves.even(ctrl, true, 120)
		var length := 0.0
		for k in even.size():
			length += even[k].distance_to(even[(k + 1) % even.size()])
		_loops.append(even)
		_loop_len.append(length)
	_loop_t = PackedFloat32Array([randf() * _loop_len[0], randf() * _loop_len[1]])
	for i in PORTERS:
		var p := Porter.new()
		p.fig = figures[3 + i]
		p.seat = SEATS[i]
		p.w.set_at(p.seat.x, p.seat.y, 0.0)
		p.t = randf() * 5.0
		p.cargo = MeshInstance3D.new()
		p.cargo.name = "Load%d" % i
		p.cargo.material_override = _arts.parts
		p.cargo.visible = false
		_near.add_child(p.cargo)
		_porters.append(p)


## The feast-night dressing: strings of paper lanterns criss-crossing the
## quay, from poles along its edge to the houses and down from the
## lighthouse; pennants on the poles, and an upturned barrel for the drummer.
func _festoon() -> void:
	var back := -depth + 0.8
	var wf := back + 7.0
	var of := back + 6.2
	var lf := back + 7.0
	var Y := DECK
	var pole_x: Array[float] = [-27.6, -19.8, -12.6, -7.4, 2.4, 6.0, 13.6, 20.2, 27.4]
	var PZ := -0.85
	var PH := 4.5
	var top: Array[Vector3] = []
	for x in pole_x:
		top.append(Vector3(x, Y + PH - 0.12, PZ))
	var bank: bool = spec.signature == "bank"
	var W1 := Vector3(-21.6, Y + 4.9, wf + 0.25)
	var W2 := Vector3(-12.4, Y + 4.9, wf + 0.25)
	var HO := Vector3(-17.0, Y + 6.75, wf + 1.95)
	var O1 := Vector3(-7.0, Y + 4.5, of + 1.3)
	var O2 := Vector3(0.6, Y + 4.5, of + 1.3)
	var L1 := Vector3(12.3, Y + 5.5, lf + 1.75) if bank else Vector3(11.4, Y + 4.8, lf + 0.2)
	var L2 := Vector3(19.7, Y + 5.5, lf + 1.75) if bank else Vector3(20.6, Y + 4.8, lf + 0.2)
	# from the lighthouse gallery's rail, fanning down to the quay like a maypole's ribbons
	var rim := func(to: Vector3) -> Vector3:
		var d := Vector2(to.x - LIGHTHOUSE.x, to.z - LIGHTHOUSE.y)
		d = d.normalized() if d.length() > 1e-3 else Vector2(1.0, 0.0)
		return Vector3(LIGHTHOUSE.x + d.x * 1.45, Y + 8.85, LIGHTHOUSE.y + d.y * 1.45)
	var pairs: Array = []
	for i in top.size() - 1:
		pairs.append([top[i], top[i + 1]])
	pairs.append_array([[top[0], W1], [top[1], HO], [top[2], W2], [HO, W1], [HO, W2], [top[3], O1], [top[4], O2], [top[5], L1], [top[6], L1], [top[7], L2], [W2, O1], [O2, L1],
		[rim.call(top[8]), top[8]], [rim.call(top[7]), top[7]], [rim.call(top[6]), top[6]], [rim.call(L2), L2]])
	var spans: Array = []
	var rk := RopeKit.new(index + 50)
	for pr: Array in pairs:
		var a: Vector3 = pr[0]
		var b: Vector3 = pr[1]
		var sag := 0.2 + a.distance_to(b) * 0.045
		spans.append([a, b, sag])
		rk.rope(a, b, 0.012, Color("#2a1d14"), sag, 8)
	var g := Festival.festoon(spans, feast.colors, 7 + index * 13)
	_lantern_mat = ShaderMaterial.new()
	_lantern_mat.shader = preload("res://shaders/feast_lanterns.gdshader")
	var lanterns := MeshInstance3D.new()
	lanterns.name = "Lanterns"
	lanterns.mesh = g.mesh
	lanterns.material_override = _lantern_mat
	lanterns.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var cords := MeshInstance3D.new()
	cords.name = "Cords"
	cords.mesh = rk.commit()
	cords.material_override = _arts.rope
	cords.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# poles with pennants in the town's colours, and an upturned barrel for the drummer
	var b := TownKit.new(41 + index)
	for i in pole_x.size():
		var x := pole_x[i]
		b.cyl(0.06, 0.08, PH, Vector3(x, Y + PH * 0.5, PZ), C_TIMBER_DARK, 6)
		b.cone(0.09, 0.22, Vector3(x, Y + PH + 0.1, PZ), C_GOLD, 6, TownKit.GILT)
		var c := TownKit.lin(str(spec.flag[i % 2]))
		b.quad(Vector3(x + 0.06, Y + PH - 0.12, PZ), Vector3(x + 0.76, Y + PH - 0.32, PZ), Vector3(x + 0.06, Y + PH - 0.52, PZ), Vector3(x + 0.06, Y + PH - 0.52, PZ), c, TownKit.WOOD, true)
	b.barrel(Transform3D(Basis.IDENTITY, Vector3(-7.6, Y + 0.45, -6.0)), 0.9, 0.36)
	var dressing := MeshInstance3D.new()
	dressing.name = "Poles"
	dressing.mesh = b.commit()
	dressing.material_override = _arts.parts
	dressing.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_fest.name = "FeastDressing"
	_fest.add_child(dressing)
	_fest.add_child(lanterns)
	_fest.add_child(cords)
	_fest.visible = false
	add_child(_fest)
	fest_tris = b.triangles() + g.count * Festival.SEG * (Festival.PROFILE.size() - 1) * 2 + spans.size() * 16


## The halos round a town's lanterns and its lighthouse's lamp after dark
## (ShipModel's halo cards: four corners at each light).
static func halo_mesh(lamps: Array[Vector4], mat: Material) -> MeshInstance3D:
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var uv2 := PackedVector2Array()
	var col := PackedColorArray()
	var idx := PackedInt32Array()
	for l in lamps:
		var o := pos.size()
		var at := Vector3(l.x, l.y, l.z)
		for c in ShipModel.CARD:
			pos.append(at)
			uv.append(c)
			# the lighthouse's lamp wears a bigger, brighter halo than a lantern's
			uv2.append(Vector2(1.0 if l.w <= 1.0 else 3.0, at.dot(Vector3(0.83, 1.31, 0.57))))
			col.append(Color(l.w, 0.0, 0.0))
		idx.append_array([o, o + 1, o + 2, o, o + 2, o + 3])
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = pos
	a[Mesh.ARRAY_TEX_UV] = uv
	a[Mesh.ARRAY_TEX_UV2] = uv2
	a[Mesh.ARRAY_COLOR] = col
	a[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	var mi := MeshInstance3D.new()
	mi.name = "Halos"
	mi.mesh = mesh
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.extra_cull_margin = ShipModel.HALO_MARGIN
	return mi


## The lamps lit after dark, for the sea to mirror: world position and brightness.
func lamps() -> Array[Vector4]:
	var out: Array[Vector4] = []
	for l in _lamps:
		var p := xf * Vector3(l.x, l.y, l.z)
		out.append(Vector4(p.x, p.y, p.z, minf(l.w, 1.2)))
	return out


# ------------------------------------------------------------------ docking

## Where a ship of this beam ties up (world x, z) and her heading: her bow
## along the quay, her port side to it.
func berth(beam: float) -> Vector3:
	var p := xf * Vector3(SHIP_X, 0.0, beam * 0.5 + 1.15)
	return Vector3(p.x, p.z, atan2(float(site.nz), -float(site.nx)))


## A ship off the quay's seaward face, close enough to come alongside.
func in_reach(p: Vector3) -> bool:
	var l := inv * Vector3(p.x, 0.0, p.z)
	return l.z > 2.0 and l.z < 95.0 and absf(l.x) < 60.0


## How far a point lies from the quay (roughly: for markers and attention).
func distance(p: Vector3) -> float:
	var l := inv * Vector3(p.x, 0.0, p.z)
	return Vector2(maxf(0.0, absf(l.x) - HALF), maxf(0.0, maxf(l.z, -depth - l.z))).length()


## A seaward point and heading to sail off from, clear of the quay.
func cast_off(beam: float) -> Vector3:
	var p := xf * Vector3(SHIP_X + 14.0, 0.0, beam * 0.5 + 16.0)
	# bow along the quay, swung a little out to sea
	return Vector3(p.x, p.z, atan2(float(site.nz), -float(site.nx)) - 0.7)


## Keeps a hull out of the pilings: her bow, middle and stern pushed out the
## nearest way (to sea, or round an end of the quay).
func repel(s: Ship) -> void:
	var fx := sin(s.heading)
	var fz := cos(s.heading)
	var L := s.cls.length
	for k: float in [0.46, 0.0, -0.42]:
		var l := inv * Vector3(s.pos.x + fx * L * k, 0.0, s.pos.z + fz * L * k)
		if absf(l.x) > HALF + 0.5 or l.z > 0.5 or l.z < -depth - 0.5:
			continue
		var out := [0.5 - l.z, HALF + 0.5 - l.x, l.x + HALF + 0.5]
		var m: float = out.min()
		var dir := out.find(m)
		var away := Vector3(0.0, 0.0, 1.0) if dir == 0 else Vector3(1.0 if dir == 1 else -1.0, 0.0, 0.0)
		var w := xf.basis * away
		var push := minf(m + 0.05, 1.5)
		s.pos.x += w.x * push
		s.pos.z += w.z * push
		s.speed *= 0.92


## Ties a ship up alongside (or, null, lets her go: whatever is still on
## the plank goes home).
func set_ship(s: Ship) -> void:
	ship = s
	_plank.visible = s != null
	if s != null:
		_bell_t = 0.0
		_moor()
	else:
		_jobs.clear()
		for p in _porters:
			if p.stage != &"idle":
				_send_home(p)


## Holds a ship in her berth (she rides the swell there as at anchor).
func pin(s: Ship) -> void:
	var b := berth(s.cls.beam)
	s.pos = Vector3(b.x, 0.0, b.y)
	s.heading = b.z
	s.speed = 0.0


## Porters carry these goods ashore (or, `on`, supplies aboard), one trip each.
func unload(goods: PackedStringArray, on: bool = false) -> void:
	for i in mini(goods.size(), 16):
		_jobs.append({"id": goods[i], "on": on})


## The townsfolk throw up their arms: 1 for a good sale, 2 a fortune.
func cheer(level: float) -> void:
	_cheer_level = maxf(level, _cheer_level if _cheer_t < 2.5 else 0.0)
	_cheer_t = 0.0


## The camera's view of a docked ship and the quay behind her, swung `az`
## round and drawn back by `zoom`: [eye, look-at] (world).
func shot(s: Ship, az: float, zoom: float) -> Array[Vector3]:
	var L := s.cls.length
	var look := xf * Vector3(SHIP_X + 4.0, DECK + 2.2, -2.5)
	var along := Vector3(float(site.nz), 0.0, -float(site.nx))
	var out := Vector3(float(site.nx), 0.0, float(site.nz))
	var a := 0.42 + az
	var elev := 0.34
	var dist := (34.0 + L * 0.85) * zoom
	var dir := out * cos(a) + along * sin(a)
	var eye := look + dir * cos(elev) * dist
	eye.y += sin(elev) * dist
	return [eye, look]


## Whether the townsfolk are close enough to be drawn and moving.
func lively() -> bool:
	return _detail and visible


## Whether the feast-night dressing is up (and drawn).
func dressed() -> bool:
	return _fest.visible and visible


## Whether the feast-night crowd is out (the revellers are only drawn then).
func reveling() -> bool:
	return _revels


## A feast night's line for the market, or the town's usual one.
func tagline() -> String:
	return "%s tonight: the whole town is out, and every merchant pays more." % feast.name if festive > 0.5 else str(spec.tagline)


## Where the town's rockets go up from (world): the lighthouse gallery (k
## even) and the far end of the quay.
func launch_spot(k: int) -> Vector3:
	return xf * (Vector3(-27.4, DECK + 0.6, -0.6) if k % 2 else Vector3(LIGHTHOUSE.x, DECK + 9.2, LIGHTHOUSE.y))


## The town's middle, a few metres up: where its lantern-light comes from (world).
func glow_at() -> Vector3:
	return xf * Vector3(0.0, DECK + 6.0, -3.5)


## A rocket going up: the harbourmaster gives the signal and everyone looks
## up for the break, `delay` s off.
func rocket(delay: float) -> void:
	_fuse_t = 0.0
	_sky_t = minf(_sky_t, -delay)


## The fisherman leans down and sets a lantern boat on the water.
func release() -> void:
	if _rel_t > 2.2:
		_rel_t = 0.0


# ------------------------------------------------------------------ frame

## Swaps the whole town for its shell (and back) by the camera's distance;
## returns that distance.
func lod(cam: Vector3) -> float:
	var d := Vector2(cam.x - xf.origin.x, cam.z - xf.origin.z).length()
	var want := d < NEAR_OUT if _detail else d < NEAR_IN
	if want != _detail:
		_detail = want
		_near.visible = want
		_far.visible = not want
	visible = d < DRAW_END
	_fest.visible = _detail and festive > 0.005
	return d


## A frame of the town: what it has noticed, the bell, its flag and smoke;
## and while it is close enough, its townsfolk and the ship tied up.
func update(dt: float, player: Ship) -> void:
	_time += dt
	var t := _time
	var pd := distance(player.pos) if player != null and player.alive else INF
	var want := 1.0 if ship != null else 1.0 - MathX.smooth(70.0, 200.0, pd)
	attention += (want - attention) * MathX.damp(1.2, dt)
	_cheer_t += dt
	_bell_t += dt
	var wd := inv.basis * Vector3(_world.wind.dir_x, 0.0, _world.wind.dir_z)
	_flag.rotation.y = atan2(-wd.z, wd.x)
	_smoke(dt)
	_sky_t += dt
	_fuse_t += dt
	_lantern_mat.set_shader_parameter("lit", festive * 1.04)
	_lantern_mat.set_shader_parameter("sway", Vector3(wd.x, wd.z, _world.wind.strength))
	var revels := festive > 0.3
	if revels != _revels:
		_revels = revels
		# the fisherman puts his rod away for the night
		_rod.visible = not revels
		_bobber.visible = not revels
	if not lively():
		return
	for fig in figures:
		fig.rest()
	_ship_local = inv * player.pos if player != null else Vector3.INF
	var cheer := sin(_cheer_t / 2.6 * PI) if _cheer_t < 2.6 else 0.0
	if festive > 0.5:
		_update_porters(dt, t, cheer)
		_feast_folk(dt, t, cheer)
		_moor()
		_lines()
		return
	_merchants(t, cheer)
	_update_porters(dt, t, cheer)
	_strollers(dt, t, cheer)
	_kid(dt, t)
	_harbourmaster(dt, t, cheer)
	_fiddler(t)
	_fisher(t)
	_moor()
	_lines()


func _place(fig: Figure, x: float, z: float, yaw: float, y: float = DECK) -> void:
	fig.place(x, z, yaw, y)


func _look_at_ship(fig: Figure, x: float, z: float, yaw: float, k: float = 1.0) -> void:
	if _ship_local == Vector3.INF:
		return
	var want := atan2(_ship_local.x - x, _ship_local.z - z)
	fig.head_rot.y = clampf(MathX.angle_delta(yaw, want), -1.1, 1.1) * k


func _wave(fig: Figure, left: bool, ph: float) -> void:
	fig.reach(left, 2.75, 0.35 + sin(ph) * 0.35, 0.35 + 0.25 * sin(ph))
	fig.pose[CrewModel.P_HAND_L if left else CrewModel.P_HAND_R] = 0.0
	fig.pose[CrewModel.P_SMILE] = 1.0
	fig.pose[CrewModel.P_BROW] = 0.5


func _hurrah(fig: Figure, k: float) -> void:
	if k <= 0.0:
		return
	fig.reach(true, 2.9 * k, 0.55 * k, 0.2)
	fig.reach(false, 2.9 * k, 0.55 * k, 0.2)
	fig.pose[CrewModel.P_HAND_L] = 0.9
	fig.pose[CrewModel.P_HAND_R] = 0.9
	fig.pose[CrewModel.P_JAW] = 0.65 * k
	fig.pose[CrewModel.P_SMILE] = 1.0
	fig.pose[CrewModel.P_BROW] = 0.8 * k
	fig.hips_pos.y = Figure.HIP + absf(sin(_time * 9.0)) * 0.1 * k


## The merchants keep their stalls and cry their wares.
func _merchants(t: float, cheer: float) -> void:
	for i in 3:
		var fig := figures[i]
		var x := STALLS[i]
		var z := -6.75
		_place(fig, x + sin(t * 0.3 + i * 2.0) * 0.6, z, 0.0)
		var cyc := fmod(t * 0.6 + i * 1.7, 6.0)
		if cheer > 0.0 and _cheer_level > 0.0:
			_hurrah(fig, cheer)
		elif attention > 0.55 and cyc < 2.2:
			_wave(fig, i % 2 == 0, t * 7.0 + i)
		elif cyc < 3.2:
			# a hand cupped to the mouth: "fresh limes!"
			fig.reach(false, 1.45, 0.25, 2.25)
			fig.pose[CrewModel.P_JAW] = 0.55 * maxf(0.0, sin(t * 8.0 + i))
			fig.pose[CrewModel.P_BROW] = 0.5
		else:
			# leaning on the counter, arranging the wares
			fig.reach(true, 0.95 + sin(t * 2.0 + i) * 0.1, 0.1, 0.9)
			fig.reach(false, 0.95 - sin(t * 2.0 + i) * 0.1, 0.1, 0.9)
			fig.hips_rot.x = 0.12
			fig.head_rot.x = 0.3
		if cyc >= 3.2:
			fig.head_rot.y = sin(t * 0.4 + i) * 0.5
		else:
			_look_at_ship(fig, x, z, 0.0, attention)


## The strollers walk their loops, and hurry to the quay's edge to watch you come in.
func _strollers(dt: float, t: float, cheer: float) -> void:
	for k in 2:
		var fig := figures[7 + k]
		var w := _walkers[k]
		var spot := Vector2(-14.0 if k == 1 else 8.5, -0.95)
		var watching := attention > 0.5 and not (ship != null and _bell_t > 25.0)
		if watching:
			if not w.path.is_empty():
				w.step(dt, 2.2)
			else:
				w.moving = false
				if Vector2(w.x - spot.x, w.z - spot.y).length() > 0.3:
					w.path.append(spot)
			if not w.moving:
				w.turn(0.0, dt, 3.0)
				if posmod(floori(t / 3.0 + k), 2) == 0:
					_wave(fig, k == 0, t * 7.0 + k * 2.0)
				elif ship != null:
					# pointing out your ship
					fig.reach(false, 1.6, 0.1, 0.1)
		else:
			# back to the loop: walk to its nearest point, then follow it
			var L := _loop_len[k]
			var p := _loop_at(k, _loop_t[k])
			if Vector2(p.x - w.x, p.z - w.z).length() > 0.6:
				if w.path.is_empty():
					w.path.append(Vector2(p.x, p.z))
				w.step(dt, 1.6)
			else:
				w.path.clear()
				var pace := 0.9 if k == 1 else 1.05
				_loop_t[k] = fmod(_loop_t[k] + dt * pace, L)
				var q := _loop_at(k, _loop_t[k])
				var ahead := _loop_at(k, _loop_t[k] + 0.5)
				w.x = q.x
				w.z = q.z
				w.phase += dt * 3.4 * pace
				w.turn(atan2(ahead.x - q.x, ahead.z - q.z), dt, 6.0)
				w.moving = true
		_place(fig, w.x, w.z, w.yaw)
		if w.moving:
			fig.walk(w.phase, 0.8)
		if not w.moving or watching:
			_look_at_ship(fig, w.x, w.z, w.yaw, 0.8)
		else:
			fig.head_rot.y = sin(t * 0.5 + k) * 0.35
		if cheer > 0.0 and not w.moving:
			_hurrah(fig, cheer * 0.8)


## A point `s` metres round stroller loop k.
func _loop_at(k: int, s: float) -> Vector3:
	var pts := _loops[k]
	var n := pts.size()
	var f := fposmod(s, _loop_len[k]) / _loop_len[k] * n
	var i := floori(f)
	return pts[i % n].lerp(pts[(i + 1) % n], f - i)


## The kid trots after a stroller, and dashes to the edge to jump and wave.
func _kid(dt: float, t: float) -> void:
	var fig := figures[KID]
	var w := _walkers[2]
	var b := _walkers[1]
	var excited := attention > 0.4
	var tx := -11.8 if excited else b.x - sin(b.yaw) * 1.3 + cos(b.yaw) * 0.6
	var tz := -0.85 if excited else b.z - cos(b.yaw) * 1.3 - sin(b.yaw) * 0.6
	var d := Vector2(tx - w.x, tz - w.z).length()
	if d > 0.25:
		w.path.clear()
		w.path.append(Vector2(tx, tz))
		w.step(dt, 3.2 if excited else clampf(d * 1.5, 0.8, 2.6))
	else:
		w.moving = false
	_place(fig, w.x, w.z, w.yaw)
	if w.moving:
		fig.walk(w.phase * 1.4, 1.0)
	elif excited:
		w.turn(0.0, dt, 5.0)
		var hop := absf(sin(t * 6.5))
		fig.root_pos.y = DECK + hop * 0.22
		_wave(fig, true, t * 9.0)
		_wave(fig, false, t * 9.0 + 1.6)
		fig.pose[CrewModel.P_KNEE_L] = 0.4 * (1.0 - hop)
		fig.pose[CrewModel.P_KNEE_R] = 0.4 * (1.0 - hop)
		_look_at_ship(fig, w.x, w.z, w.yaw, 1.0)
	else:
		_look_at_ship(fig, w.x, w.z, w.yaw, 0.5)


## The harbourmaster waves you in with both arms, then rings the bell.
func _harbourmaster(dt: float, t: float, cheer: float) -> void:
	var fig := figures[HARBOURMASTER]
	var x := 15.0
	var z := -1.5
	_place(fig, x, z, 0.15)
	var ring := ship != null and _bell_t < 4.5
	if ring:
		fig.root_yaw = 1.2
		var pull := maxf(0.0, sin(_bell_t * 5.5))
		fig.reach(false, 2.1 - pull * 0.6, 0.1, 0.6 + pull * 0.6)
		fig.pose[CrewModel.P_HAND_R] = 1.0
		_bell.rotation.x = sin(_bell_t * 5.5) * 0.7 * (1.0 - _bell_t / 4.5)
		if floori(_bell_t * 5.5 / PI) != floori((_bell_t - dt) * 5.5 / PI):
			bell_rung.emit(xf * BELL)
	elif attention > 0.35 and ship == null:
		# semaphore: both arms sweeping overhead
		var s := sin(t * 3.2)
		fig.reach(true, 2.6, 0.3 + s * 0.6, 0.15)
		fig.reach(false, 2.6, 0.3 - s * 0.6, 0.15)
		fig.pose[CrewModel.P_JAW] = 0.4
		_look_at_ship(fig, x, z, 0.15, 1.0)
		_bell.rotation.x *= 1.0 - MathX.damp(3.0, dt)
	else:
		# pipe in hand, an eye on the porters
		fig.reach(false, 1.1 + 0.4 * maxf(0.0, sin(t * 0.7)), 0.2, 1.9 * maxf(0.0, sin(t * 0.7)))
		fig.reach(true, 0.2, 0.3, 1.6)
		fig.head_rot.y = sin(t * 0.35) * 0.6
		_bell.rotation.x *= 1.0 - MathX.damp(3.0, dt)
	if cheer > 0.0 and _cheer_level > 1.0 and not ring:
		_hurrah(fig, cheer)


## A fiddler on a barrel: a lively hornpipe while you're in port.
func _fiddler(t: float) -> void:
	var fig := figures[FIDDLER]
	_place(fig, -9.5, -6.4, 0.25)
	fig.sit(0.85)
	var w := t * (9.0 if ship != null else 6.5)
	var bow := sin(w * 0.5)
	fig.reach(true, 1.15, -0.55, 1.95)
	fig.reach(false, 0.85, 0.45 + 0.12 * bow, 1.1 + 0.45 * bow)
	fig.head_rot = Vector3(0.22, 0.35, 0.07 * bow)
	fig.leg_r = -1.35 + 0.15 * maxf(0.0, sin(w))
	fig.pose[CrewModel.P_SMILE] = 1.0


## Fishing off the far end of the quay, legs swinging over the water.
func _fisher(t: float) -> void:
	var fig := figures[FISHER]
	_place(fig, 22.2, 0.32, 0.1, DECK + 0.02)
	fig.hips_pos.y = 0.12
	fig.hips_rot.x = -0.12
	fig.leg_l = -0.25 + sin(t * 1.6) * 0.28
	fig.leg_r = -0.25 + sin(t * 1.6 + 2.2) * 0.28
	fig.pose[CrewModel.P_KNEE_L] = 0.25 + maxf(0.0, sin(t * 1.6)) * 0.3
	fig.pose[CrewModel.P_KNEE_R] = 0.25 + maxf(0.0, sin(t * 1.6 + 2.2)) * 0.3
	fig.pose[CrewModel.P_HAND_L] = 1.0
	fig.pose[CrewModel.P_HAND_R] = 1.0
	var cyc := fmod(t, 9.0)
	# a bite: the rod jerks up
	var bite := sin((cyc - 7.2) / 1.8 * PI) if cyc > 7.2 else 0.0
	fig.arm(true, -1.0 - bite * 0.5, 0.0, -0.35)
	fig.arm(false, -1.0 - bite * 0.5, 0.0, 0.35)
	fig.head_rot.x = 0.25 - bite * 0.3
	if attention > 0.6:
		_look_at_ship(fig, 22.2, 0.32, 0.1, 0.8)
	_rod.transform = fig.hips_xf() * Transform3D(Basis(Vector3.RIGHT, 0.95 - bite * 0.45), Vector3(0.0, 0.36, 0.38))
	var bw := xf * Vector3(22.8, 0.0, 6.2)
	var dip := sin((cyc - 6.6) / 0.6 * PI * 3.0) * 0.12 if cyc > 6.6 and cyc < 7.2 else 0.0
	_bobber.position = Vector3(22.8, _world.water_height(bw.x, bw.z) + 0.02 - dip, 6.2)


# ------------------------------------------------------------------ feast night

## The town on a feast night: everyone not carrying cargo joins a ring dance,
## two couples swing each other round, the fiddler and a drummer on a barrel
## play for them, the merchants clap along, a fellow with a mug toasts the
## night, the harbourmaster sends the rockets up and the fisherman sets
## lantern boats on the water. Every face turns up when a shell breaks.
func _feast_folk(dt: float, t: float, cheer: float) -> void:
	var f := figures
	var beat := t * 2.2 # the band's quarter notes, near enough
	var bounce := absf(sin(beat * PI))
	var s := _sky_t
	var up := minf(1.0, s / 0.35) * (1.0 - MathX.smooth(2.6, 4.0, s)) if s > 0.0 and s < 4.0 else 0.0
	var gaze := func(fig: Figure, k: float) -> void:
		fig.head_rot.x = minf(fig.head_rot.x, -0.6 * up * k)
		if up > 0.5:
			fig.pose[CrewModel.P_JAW] = maxf(fig.pose[CrewModel.P_JAW], 0.5 * up * k) # "ooh"
	var sing := func(fig: Figure, i: int) -> void:
		fig.pose[CrewModel.P_SMILE] = 1.0
		fig.pose[CrewModel.P_JAW] = 0.35 * maxf(0.0, sin(t * 6.5 + i * 1.9))

	# -- the merchants clap along behind their stalls
	for i in 3:
		var fig := f[i]
		_place(fig, STALLS[i], -6.75, 0.0)
		if cheer > 0.0 and _cheer_level > 0.0:
			_hurrah(fig, cheer)
		else:
			# the hands meet on the beat
			var apart := absf(sin(beat * PI + i * 0.4))
			fig.reach(true, 1.35, 0.06 + 0.3 * apart, 1.15)
			fig.reach(false, 1.35, 0.06 + 0.3 * apart, 1.15)
			fig.pose[CrewModel.P_HAND_L] = 0.1
			fig.pose[CrewModel.P_HAND_R] = 0.1
			fig.hips_rot.z = sin(beat * PI * 0.5 + i) * 0.07
			fig.hips_pos.y = Figure.HIP + bounce * 0.03
			sing.call(fig, i)
		fig.head_rot.y = sin(t * 0.5 + i * 1.7) * 0.5
		gaze.call(fig, 1.0)

	# -- the ring dance: idle porters, both strollers and the kid, hand in hand
	var ring: Array = []
	for p in _porters:
		if p.stage == &"idle":
			ring.append([p.fig, p.w])
	ring.append_array([[f[7], _walkers[0]], [f[KID], _walkers[2]], [f[8], _walkers[1]]])
	var PERIOD := 9.0
	var was := fmod(_ring_t, PERIOD)
	_ring_t += dt
	var ph := fmod(_ring_t, PERIOD)
	if ph < was:
		_ring_dir = -_ring_dir
	var stamp := ph > PERIOD - 1.4
	if not stamp:
		_ring_rot += _ring_dir * 0.6 * dt
	var n := ring.size()
	var R := 1.1 + n * 0.17
	for i in n:
		var fig: Figure = ring[i][0]
		var w: Walker = ring[i][1]
		fig.rest()
		var kid := fig == f[KID]
		var a := _ring_rot + float(i) / n * TAU
		var sx := RING.x + sin(a) * R
		var sz := RING.y + cos(a) * R
		if Vector2(sx - w.x, sz - w.z).length() > 0.35:
			# joining in: hurry to a place in the ring
			w.path.clear()
			w.path.append(Vector2(sx, sz))
			w.step(dt, 3.2 if kid else 2.6)
			_place(fig, w.x, w.z, w.yaw)
			fig.walk(w.phase * (1.3 if kid else 1.0), 0.9)
			fig.pose[CrewModel.P_SMILE] = 1.0
			continue
		w.path.clear()
		w.x = sx
		w.z = sz
		w.moving = false
		w.yaw = atan2(RING.x - sx, RING.y - sz)
		_place(fig, sx, sz, w.yaw)
		if stamp:
			# stamp, stamp, a clap over the head, and round the other way
			var k := (ph - (PERIOD - 1.4)) / 1.4
			var apart := absf(sin(k * PI * 3.0))
			fig.reach(true, 2.7, 0.08 + 0.3 * apart, 0.5)
			fig.reach(false, 2.7, 0.08 + 0.3 * apart, 0.5)
			var lift := maxf(0.0, sin(k * PI * 4.0))
			if i % 2:
				fig.leg_l = -0.5 * lift
				fig.pose[CrewModel.P_KNEE_L] = 0.8 * lift
			else:
				fig.leg_r = -0.5 * lift
				fig.pose[CrewModel.P_KNEE_R] = 0.8 * lift
			fig.pose[CrewModel.P_SMILE] = 1.0
			fig.pose[CrewModel.P_JAW] = 0.6
		else:
			# side-stepping round, hands joined with the neighbours, a hop on every beat
			fig.walk(beat * PI, 0.5)
			fig.root_pos.y = DECK + bounce * (0.14 if kid else 0.08)
			var sw := sin(beat * PI) * 0.12
			fig.reach(true, 0.25 + sw, 1.15, 0.3)
			fig.reach(false, 0.25 - sw, 1.15, 0.3)
			fig.pose[CrewModel.P_HAND_L] = 0.85
			fig.pose[CrewModel.P_HAND_R] = 0.85
			sing.call(fig, i)
		fig.pose[CrewModel.P_BROW] = 0.5
		if cheer > 0.0:
			_hurrah(fig, cheer)
		gaze.call(fig, 0.7)

	# -- two couples swinging each other round
	for c in 2:
		var px := 11.8 if c == 0 else 20.6
		var pz := -3.0 if c == 0 else -3.6
		var ang := t * 2.1 + sin(t * 0.37 + c) * 1.4 + c * 2.0
		for j in 2:
			var fig := f[13 + c * 2 + j]
			var side := 1.0 if j == 0 else -1.0
			var x := px + sin(ang) * 0.42 * side
			var z := pz + cos(ang) * 0.42 * side
			_place(fig, x, z, atan2(px - x, pz - z), DECK + bounce * 0.06)
			fig.walk(ang * 2.2 + j * PI, 0.45)
			# both hands held, leaning back into the spin
			fig.reach(true, 1.05, 0.2, 0.35)
			fig.reach(false, 1.05, 0.2, 0.35)
			fig.pose[CrewModel.P_HAND_L] = 0.85
			fig.pose[CrewModel.P_HAND_R] = 0.85
			fig.hips_rot.x = -0.1
			sing.call(fig, c * 2 + j)
			if cheer > 0.0:
				_hurrah(fig, cheer)
			gaze.call(fig, 0.6)

	# -- the drummer on his barrel, a hand on every beat
	var dr := f[DRUMMER]
	_place(dr, -7.6, -6.65, 0.0)
	var hit := sin(beat * PI)
	dr.reach(true, 0.7 + 0.5 * maxf(0.0, hit), 0.18, 1.3 - 0.4 * maxf(0.0, hit))
	dr.reach(false, 0.7 + 0.5 * maxf(0.0, -hit), 0.18, 1.3 - 0.4 * maxf(0.0, -hit))
	dr.pose[CrewModel.P_HAND_L] = 0.4
	dr.pose[CrewModel.P_HAND_R] = 0.4
	dr.hips_pos.y = Figure.HIP + bounce * 0.03
	dr.hips_rot.x = 0.12
	dr.head_rot.x = 0.15 + 0.15 * bounce
	dr.head_rot.z = sin(beat * PI * 0.5) * 0.1
	sing.call(dr, 17)
	gaze.call(dr, 0.5)

	# -- a fellow with a mug, toasting the night out over the water
	var to := f[TOASTER]
	_place(to, -25.5, -1.3, 0.1)
	var cyc := fmod(t, 6.5)
	var raise := sin(cyc / 1.8 * PI) if cyc < 1.8 else 0.0
	to.reach(false, 1.1 + 1.6 * raise, 0.25, 1.4 - 0.9 * raise)
	to.reach(true, 0.15, 0.3, 0.3)
	to.hips_rot.z = sin(t * 1.1) * 0.08 # a little unsteady by now
	to.pose[CrewModel.P_SMILE] = 1.0
	to.pose[CrewModel.P_JAW] = 0.6 * raise
	if cheer > 0.0:
		_hurrah(to, cheer)
	gaze.call(to, 1.0)

	# -- the harbourmaster rings you in, then sends the rockets up
	var hm := f[HARBOURMASTER]
	_place(hm, 15.0, -1.5, 0.15)
	if ship != null and _bell_t < 4.5:
		hm.root_yaw = 1.2
		var pull := maxf(0.0, sin(_bell_t * 5.5))
		hm.reach(false, 2.1 - pull * 0.6, 0.1, 0.6 + pull * 0.6)
		hm.pose[CrewModel.P_HAND_R] = 1.0
		_bell.rotation.x = sin(_bell_t * 5.5) * 0.7 * (1.0 - _bell_t / 4.5)
		if floori(_bell_t * 5.5 / PI) != floori((_bell_t - dt) * 5.5 / PI):
			bell_rung.emit(xf * BELL)
	else:
		_bell.rotation.x *= 1.0 - MathX.damp(3.0, dt)
		if _fuse_t < 1.6:
			# "light her!": an arm flung up at the sky
			var k := sin(minf(1.0, _fuse_t / 1.6) * PI)
			hm.reach(false, 1.6 + 1.3 * k, 0.15, 0.1)
			hm.pose[CrewModel.P_JAW] = 0.7 * k
		else:
			# tapping a foot, pipe going, a hand beating time
			hm.reach(false, 1.0 + 0.25 * bounce, 0.25, 1.6)
			hm.leg_r = -0.15 * bounce
		hm.reach(true, -0.2, 0.75, 1.8)
		hm.pose[CrewModel.P_SMILE] = 1.0
		hm.head_rot.y = sin(t * 0.4) * 0.4
		gaze.call(hm, 1.0)

	# -- the fiddler, faster now, bouncing on his barrel
	var fd := f[FIDDLER]
	_place(fd, -9.5, -6.4, 0.25)
	fd.sit(0.85)
	fd.hips_pos.y += bounce * 0.03
	var bow := sin(t * 11.0 * 0.5)
	fd.reach(true, 1.15, -0.55, 1.95)
	fd.reach(false, 0.85, 0.45 + 0.14 * bow, 1.1 + 0.5 * bow)
	fd.head_rot = Vector3(0.15, 0.35, 0.1 * bow)
	fd.leg_r = -1.35 + 0.22 * maxf(0.0, sin(beat * PI * 2.0))
	fd.pose[CrewModel.P_SMILE] = 1.0

	# -- the fisherman sets lantern boats down off the end
	var fi := f[FISHER]
	_place(fi, 22.2, 0.32, 0.1, DECK + 0.02)
	fi.hips_pos.y = 0.12
	fi.leg_l = -0.25 + sin(t * 1.3) * 0.25
	fi.leg_r = -0.25 + sin(t * 1.3 + 2.2) * 0.25
	fi.pose[CrewModel.P_KNEE_L] = 0.3
	fi.pose[CrewModel.P_KNEE_R] = 0.3
	var rel_was := _rel_t
	_rel_t += dt
	if _rel_t < 1.8:
		# reaching down to the water with the little boat in both hands
		var k := sin(_rel_t / 1.8 * PI)
		fi.hips_rot.x = 0.55 * k
		fi.reach(true, 0.55 + 0.4 * k, 0.12, 0.25)
		fi.reach(false, 0.55 + 0.4 * k, 0.12, 0.25)
		fi.pose[CrewModel.P_HAND_L] = 0.6
		fi.pose[CrewModel.P_HAND_R] = 0.6
		fi.head_rot.x = 0.35 * k
		if rel_was < 0.9 and _rel_t >= 0.9:
			lantern_set.emit(xf * Vector3(22.25, 0.0, 1.25))
	else:
		# watching them go
		fi.reach(true, 0.4, 0.3, 0.3)
		fi.reach(false, 0.4, 0.3, 0.3)
		fi.head_rot.x = 0.1
		fi.pose[CrewModel.P_SMILE] = 1.0
		gaze.call(fi, 1.0)


func _send_home(p: Porter) -> void:
	p.job = {}
	_hold(p, "")
	if p.stage in [&"up", &"grab", &"drop"]:
		# off the plank first
		p.w.set_at(plank_foot.x, plank_foot.z)
	p.stage = &"home"
	p.w.route(p.seat.x, p.seat.y)


func _hold(p: Porter, c: String) -> void:
	p.holding = c
	p.cargo.visible = c != ""
	if c != "":
		p.cargo.mesh = _arts.carry[c]


## The porters: dice on their benches, then the cargo, a trip at a time.
func _update_porters(dt: float, t: float, cheer: float) -> void:
	var foot := plank_foot
	var top := plank_top
	var docked := ship != null
	for i in _porters.size():
		var p := _porters[i]
		var fig := p.fig
		var w := p.w
		p.t += dt
		var heavy := p.holding in ["barrel", "idol", "painting"]
		var speed := (1.6 if heavy else 2.0) if p.holding != "" else 2.8
		var plank_len := maxf(1.0, foot.distance_to(top))
		match p.stage:
			&"idle", &"ready":
				if docked and _next_job(p, i):
					pass
				else:
					if docked and i < 2 and p.stage == &"idle":
						# two of them stroll over to meet the ship
						p.stage = &"ready"
						w.route(foot.x + (1.4 if i == 1 else -1.4), foot.z - 0.5)
					if not docked and p.stage == &"ready":
						p.stage = &"home"
						w.route(p.seat.x, p.seat.y)
			&"toA":
				if w.step(dt, speed):
					p.t = 0.0
					if p.job.on:
						p.stage = &"grab"
					else:
						p.stage = &"up"
						p.k = 0.0
			&"up":
				p.k = minf(1.0, p.k + dt * speed / plank_len)
				if p.k >= 1.0:
					p.t = 0.0
					p.stage = &"drop" if p.job.on else &"grab"
			&"grab":
				if p.t > 0.4 and p.holding == "":
					_hold(p, Treasure.carry_of(p.job.id))
				if p.t > 0.8:
					p.t = 0.0
					if p.job.on:
						p.stage = &"toB"
						w.route(foot.x, foot.z)
					else:
						p.stage = &"down"
			&"down":
				p.k = maxf(0.0, p.k - dt * speed / plank_len)
				if p.k <= 0.0:
					w.set_at(foot.x, foot.z)
					if p.job.on:
						if not _next_job(p, i):
							p.stage = &"home"
							w.route(p.seat.x, p.seat.y)
					else:
						p.stage = &"toB"
						var cat := Treasure.cat_of(p.job.id)
						var to := warehouse_door if cat in ["spirits", "provisions", "cloth"] else house_door
						w.route(to.x + (0.5 if i % 2 else -0.5), to.y)
			&"toB":
				if w.step(dt, speed):
					if p.job.on:
						p.stage = &"up"
						p.k = 0.0
					else:
						p.stage = &"drop"
						p.t = 0.0
			&"drop":
				if p.t > 0.45 and p.holding != "":
					var at := xf * Vector3(fig.root_pos.x, DECK + 1.4, fig.root_pos.z + (0.0 if p.job.on else 0.6))
					_hold(p, "")
					delivered.emit(p.job.id, p.job.on, at)
				if p.t > 0.8:
					p.t = 0.0
					if p.job.on:
						p.stage = &"down"
					elif not _next_job(p, i):
						p.stage = &"home"
						w.route(p.seat.x, p.seat.y)
			&"home":
				if w.step(dt, speed):
					p.stage = &"idle"
					p.job = {}
		# where they are and how they stand
		var x := w.x
		var z := w.z
		var y := DECK
		var on_plank := p.stage == &"up" or p.stage == &"down" or ((p.stage == &"grab" or p.stage == &"drop") and p.k > 0.5)
		if on_plank:
			x = lerpf(foot.x, top.x, p.k)
			y = lerpf(foot.y, top.y, p.k)
			z = lerpf(foot.z, top.z, p.k)
			var to_top := atan2(top.x - foot.x, top.z - foot.z)
			var up := p.stage == &"up" or ((p.stage == &"grab" or p.stage == &"drop") and p.t < 0.4)
			w.turn(to_top if up else to_top + PI, dt, 9.0)
			if p.stage == &"up" or p.stage == &"down":
				w.phase += dt * speed * 3.4
		_place(fig, x, z, w.yaw, y)
		var moving := w.moving or p.stage == &"up" or p.stage == &"down"
		if p.stage == &"idle":
			# on the bench, rolling dice and swapping tales
			fig.sit(0.52)
			w.turn(0.0, dt, 2.0)
			var chat := sin(t * 0.9 + i * 2.1)
			fig.head_rot.y = (-0.5 if i % 2 else 0.5) * maxf(0.0, chat)
			fig.pose[CrewModel.P_JAW] = 0.4 * maxf(0.0, sin(t * 9.0 + i)) if chat > 0.3 else 0.0
			if i % 2 == 0:
				fig.reach(false, 0.9 + maxf(0.0, sin(t * 2.4)) * 0.6, 0.2, 1.2)
			else:
				fig.reach(true, 0.5, 0.3, 1.5)
			if attention > 0.6 and not docked:
				fig.head_rot.y = 0.3
			if cheer > 0.0 and _cheer_level > 1.0:
				fig.reach(true, 2.6 * cheer, 0.4, 0.3)
				fig.reach(false, 2.6 * cheer, 0.4, 0.3)
				fig.pose[CrewModel.P_JAW] = 0.6 * cheer
		else:
			if moving:
				fig.walk(w.phase, 0.7 if p.holding != "" else 0.9)
			if p.holding != "":
				if p.holding in ["crate", "barrel", "sack"]:
					fig.arm(true, -2.85, 0.0, 0.32)
					fig.arm(false, -2.85, 0.0, -0.32)
				else:
					fig.reach(true, 1.05, 0.12, 0.85)
					fig.reach(false, 1.05, 0.12, 0.85)
				fig.pose[CrewModel.P_HAND_L] = 0.25
				fig.pose[CrewModel.P_HAND_R] = 0.25
				fig.pose[CrewModel.P_BROW] = 0.5 if heavy else 0.2
				fig.hips_rot.x = 0.06 if heavy else 0.0
			elif p.stage == &"ready" and not moving:
				# hands on hips, waiting for the hatch to open
				w.turn(atan2(top.x - w.x, top.z - w.z), dt, 4.0)
				fig.reach(true, -0.2, 0.75, 1.8)
				fig.reach(false, -0.2, 0.75, 1.8)
				fig.pose[CrewModel.P_SMILE] = 0.8
			elif p.stage == &"grab" or p.stage == &"drop":
				fig.reach(true, 1.3, 0.1, 0.5)
				fig.reach(false, 1.3, 0.1, 0.5)
				fig.hips_rot.x = 0.35
		# the load rides on their hips: overhead, or carried before them
		if p.holding != "":
			var over := p.holding in ["crate", "barrel", "sack"]
			var at := Vector3(0.0, 1.43 + (0.05 if p.holding == "barrel" else 0.0), 0.05) if over else Vector3(0.0, 0.4, 0.42)
			p.cargo.transform = fig.hips_xf() * Transform3D(Basis(Vector3.UP, PI * 0.5 if p.holding == "barrel" else 0.0), at)


## Hands a porter the next job waiting, and sets them off; false if there's none.
func _next_job(p: Porter, i: int) -> bool:
	if _jobs.is_empty():
		return false
	p.job = _jobs.pop_front()
	p.t = 0.0
	p.stage = &"toA"
	if p.job.on:
		p.w.route(warehouse_door.x + (0.7 if i % 2 else -0.7), warehouse_door.y)
	else:
		p.w.route(plank_foot.x + (0.25 if i % 2 else -0.25), plank_foot.z)
	return true


## The ship's lines to the bollards and the gangplank from the quay to her
## rail, where she lies now (she rides the swell).
func _moor() -> void:
	if ship == null:
		return
	var sh := ship.model.shape
	var m := inv * ship.model.global_transform
	var top := m * Vector3(sh.half_beam(0.45) * 0.95, sh.main_deck_y(0.45) + ship.cls.bulwark, sh.z(0.45))
	plank_top = top
	plank_foot = Vector3(top.x, DECK, -1.3)
	var foot := Vector3(top.x, DECK + 0.08, -1.3)
	var d := top - foot
	_plank.transform = Transform3D(Basis.looking_at(d, Vector3.UP, true) * Basis.from_scale(Vector3(1.0, 1.0, d.length())), foot)


## Rebuilds the lines: the mooring lines while she's tied up, and the
## fisherman's line from his rod's tip to the float.
func _lines() -> void:
	var rk := RopeKit.new(index)
	if ship != null:
		var sh := ship.model.shape
		var L := ship.cls.length
		var m := inv * ship.model.global_transform
		var pairs := [[0.96, SHIP_X + L * 0.5 + 5.0], [0.05, SHIP_X - L * 0.5 - 5.0], [0.7, SHIP_X + L * 0.05], [0.32, SHIP_X - L * 0.05]]
		for pr: Array in pairs:
			var tt: float = pr[0]
			var a := m * Vector3(sh.half_beam(tt) * 0.8, sh.top(tt) + 0.2, sh.z(tt))
			var b := Vector3(_nearest_bollard(pr[1]), DECK + 0.6, -0.35)
			rk.rope(a, b, 0.035, Color("#4a3626"), a.distance_to(b) * 0.06)
	if _rod.visible:
		var tip := _rod.transform * Vector3(0.0, 3.2, 0.0)
		rk.rope(tip, _bobber.position + Vector3(0.0, 0.08, 0.0), 0.006, Color("#f3ecdc"), 0.4)
	rk.commit(_rope_mesh)


func _nearest_bollard(x: float) -> float:
	var best := BOLLARDS[0]
	for b in BOLLARDS:
		if absf(b - x) < absf(best - x):
			best = b
	return best


## Smoke from the distillery's chimney, drifting off downwind.
func _smoke(dt: float) -> void:
	if _chimney == Vector3.INF or not visible:
		return
	_smoke_t += dt
	if _smoke_t < 0.3:
		return
	_smoke_t = 0.0
	var p := xf * _chimney
	var wd := Vector3(_world.wind.dir_x, 0.0, _world.wind.dir_z)
	_world.fx.emit(p + Vector3(randf_range(-0.15, 0.15), 0.0, randf_range(-0.15, 0.15)), Vector3(wd.x * 1.1, 1.4 + randf() * 0.5, wd.z * 1.1),
			6.0 + randf() * 2.0, 0.9, 4.2, Color(0.96, 0.95, 0.94, 0.34), Color(0.86, 0.86, 0.88), 0.0, 0.25, Particles.SMOKE, 0.5, Vector2.ZERO, randf_range(-0.15, 0.15))


## The townsfolk drawn this frame: each one's placement (world), pose row,
## hat, held prop and kit, through `emit` (Crew.emit_figure's shape).
func draw_folk(emit: Callable) -> void:
	for i in figures.size():
		var fig := figures[i]
		# the revellers only come out on a feast night
		if fig.palette < 0 or (i >= REVELS and not _revels):
			continue
		emit.call(xf * fig.body_xf(), fig.write(), fig.look.hat, fig.prop, fig.kit)
