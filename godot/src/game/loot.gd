class_name Loot
extends Node3D
## Floating salvage (the web game's Loot): barrels and treasure chests that
## bob on the swell and glint in the sun. Sail through them to haul their
## goods into the hold, their shot into the racks, and patch your hull.
## Chests come in four rarities above the humble barrel, each with its own
## craft, a beacon you can spot from afar (a glow pooled on the water and,
## for the finer ones, a shaft of light) and finer plunder inside (Treasure).
##
## The CPU only says where each item is reckoned from, and writes that again
## when it changes (dropped, hauled, drawn in toward a hull); the GPU floats
## it on the very swell the ocean draws, carried on the wind, bobbing and
## turning (shaders/loot.gdshader), and lays its beacon on the water round it
## (shaders/loot_beacon.gdshader). A draw for each rarity afloat, and one for
## every beacon.

## Items of a rarity drawn at once.
const MAX := 64
## Share of her hull an item patches, by tier (0 barrel .. 4 legendary chest).
const HEAL := [0.1, 0.06, 0.1, 0.16, 0.3]
## Each rarity's beacon (linear HDR), its beam's height (m, none for 0), its
## halo's radius on the water (m), the seconds between its glints and its size.
const GLOW := [Color(0.0, 0.0, 0.0), Color(0.55, 1.7, 0.65), Color(0.35, 1.2, 2.6), Color(1.7, 0.45, 2.8), Color(3.4, 2.0, 0.45)]
const BEAM := [0.0, 0.0, 7.0, 11.0, 18.0]
const HALO := [0.0, 1.7, 2.3, 2.9, 3.8]
const SPARKLE := [0.6, 0.24, 0.14, 0.09, 0.045]
const SCALE := [1.0, 1.0, 1.08, 1.16, 1.3]
## Drift on the wind (m/s).
const WINDAGE := 0.25
## Floats per instance: a 3x4 transform and the custom vec4.
const STRIDE := 16
## The beacon's halo, cells a side (it lies on the swell).
const HALO_CELLS := 8
## Lamplight paint (and the hoard's gold) is HDR: its colour times this.
const GLOW_GAIN := 3.0


class Item:
	var tier := 0
	## What's inside, best first.
	var goods := PackedStringArray()
	var heal := 0.0
	var spin := 0.0
	var phase := 0.0
	var age := 0.0
	var life := 0.0
	var sparkle := 0.0
	## Fetched up in the shallows: doesn't drift, and keeps three times as long.
	var moored := false
	## Where it is reckoned from: its place, less the wind's carry since the loot began.
	var base := Vector2.ZERO
	## When it was dropped, on the sea's clock.
	var born := 0.0


var world: World
var _items: Array[Item] = []
## How far the wind has carried what floats (m).
var _drift := Vector2.ZERO
var _mat: ShaderMaterial
var _beacon_mat: ShaderMaterial
var _mm: Array[MultiMesh] = []
var _mi: Array[MultiMeshInstance3D] = []
var _bufs: Array[PackedFloat32Array] = []
var _beacons: MultiMesh
var _beacon_mi: MultiMeshInstance3D
var _bbuf := PackedFloat32Array()
var _dirty := true


func setup(p_world: World) -> void:
	world = p_world
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/loot.gdshader")
	_mat.set_shader_parameter("glow_gain", GLOW_GAIN)
	_beacon_mat = ShaderMaterial.new()
	_beacon_mat.shader = preload("res://shaders/loot_beacon.gdshader")
	var cull := AABB(Vector3(-1e5, -200.0, -1e5), Vector3(2e5, 400.0, 2e5))
	var meshes := build_meshes()
	for k in 5:
		var buf := PackedFloat32Array()
		buf.resize(MAX * STRIDE)
		_bufs.append(buf)
		var mm := _ring(meshes[k], cull, MAX)
		_mm.append(mm)
		var mi := _instance(mm, _mat, ["Barrels", "Chests", "RareChests", "EpicChests", "LegendaryChests"][k])
		_mi.append(mi)
	_bbuf.resize(MAX * 4 * STRIDE)
	_beacons = _ring(_beacon_mesh(), cull, MAX * 4)
	_beacon_mi = _instance(_beacons, _beacon_mat, "Beacons")


static func _ring(mesh: Mesh, cull: AABB, n: int) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = n
	mm.visible_instance_count = 0
	# the GPU floats them: the bounds can't come from the transforms
	mm.custom_aabb = cull
	return mm


func _instance(mm: MultiMesh, mat: Material, label: String) -> MultiMeshInstance3D:
	var mi := MultiMeshInstance3D.new()
	mi.name = label
	mi.multimesh = mm
	mi.material_override = mat
	# awash, their shadows barely show
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	mi.visible = false
	add_child(mi)
	return mi


## The swell the loot rides, as the ocean draws it this frame (and the wind's carry).
func _follow(ocean: Ocean, eye: Vector3) -> void:
	for m: ShaderMaterial in [_mat, _beacon_mat]:
		m.set_shader_parameter("drift", _drift)
		m.set_shader_parameter("wave_a", world.waves.packed_a)
		m.set_shader_parameter("wave_b", world.waves.packed_b)
		m.set_shader_parameter("grid_warp", ocean.grid_warp)
		m.set_shader_parameter("grid_origin", Vector2(ocean.position.x, ocean.position.z))
		m.set_shader_parameter("eye", eye)


## The archipelago whose seabed damps the swell under the loot.
func set_region(r: Region) -> void:
	for m: ShaderMaterial in [_mat, _beacon_mat]:
		m.set_shader_parameter("seabed_tex", r.height_tex)
		m.set_shader_parameter("seabed_rect", r.height_rect())
		m.set_shader_parameter("has_seabed", 1.0)


## Rolls a chest's rarity; `luck` 0..1 shifts the odds toward the good stuff.
static func roll_tier(luck: float, min_tier: int = 1) -> int:
	var r := randf()
	var t := 1
	if r < 0.025 + luck * 0.09:
		t = 4
	elif r < 0.1 + luck * 0.22:
		t = 3
	elif r < 0.32 + luck * 0.3:
		t = 2
	return maxi(t, min_tier)


## Scatters salvage round (x, z): `luck` 0..1 improves the chests' odds, and
## a `jackpot` makes the first a fine one.
func drop(x: float, z: float, count: int, luck: float = 0.0, jackpot: bool = false) -> void:
	for i in count:
		var a := randf() * TAU
		var r := randf_range(3.0, 11.0)
		var chest := (jackpot and i == 0) or randf() < 0.16 + luck * 0.1
		var tier := roll_tier(luck, 2 if jackpot and i == 0 else 1) if chest else 0
		_add(x + cos(a) * r, z + sin(a) * r, tier, Treasure.roll_contents(tier), HEAL[tier], randf_range(-0.2, 0.2))


## One barrel or chest set down on the water just here (`moored` in the shallows).
func place(x: float, z: float, tier: int, moored: bool = false) -> void:
	var it := _add(x, z, tier, Treasure.roll_contents(tier), HEAL[tier], randf_range(-0.1, 0.1))
	if moored:
		it.moored = true
		it.base = Vector2(x, z)
		it.life *= 3.0


## Goods the hold had no room for, bobbing back on the water in a barrel or
## chest of their rarity.
func float_goods(x: float, z: float, goods: PackedStringArray, tier: int) -> void:
	if not goods.is_empty():
		_add(x, z, tier, goods, 0.0, randf_range(-0.2, 0.2))


func _add(x: float, z: float, tier: int, goods: PackedStringArray, heal: float, spin: float) -> Item:
	var it := Item.new()
	it.tier = tier
	it.goods = goods
	it.heal = heal
	it.spin = spin
	it.phase = randf() * 10.0
	it.life = 240.0 + tier * 60.0
	it.base = Vector2(x, z) - _drift
	it.born = fmod(world.time, Debris.CLOCK_WRAP)
	_items.append(it)
	_dirty = true
	return it


## Where an item floats now (x, z).
func where(it: Item) -> Vector2:
	return it.base if it.moored else it.base + _drift


## Ages and carries everything afloat; draws in what lies within `radius` of
## the `collector` (null for none) and returns what it hauled. `refuse` says
## an item has no room aboard: it drifts on untouched.
func update(dt: float, collector: Variant, radius: float, refuse: Callable, ocean: Ocean, eye: Vector3) -> Array[Item]:
	var got: Array[Item] = []
	var w := world.wind
	_drift += Vector2(w.dir_x, w.dir_z) * WINDAGE * dt
	var c := Vector2.ZERO
	if collector != null:
		c = Vector2((collector as Vector3).x, (collector as Vector3).z)
	for i in range(_items.size() - 1, -1, -1):
		var it := _items[i]
		it.age += dt
		if it.age > it.life:
			_items.remove_at(i)
			_dirty = true
			continue
		var at := where(it)
		if collector != null:
			var d := at.distance_to(c)
			if d < radius and refuse.call(it):
				pass
			elif d < radius * 0.5:
				got.append(it)
				_items.remove_at(i)
				_dirty = true
				continue
			elif d < radius:
				# a magnet that pulls harder the closer it comes
				var pull := minf(d, (6.0 + 26.0 * (1.0 - d / radius)) * dt)
				it.base += (c - at) / d * pull
				at = where(it)
				_dirty = true
		it.sparkle += dt
		if it.sparkle > float(SPARKLE[it.tier]):
			it.sparkle = 0.0
			var p := Vector3(at.x, world.water_height(at.x, at.y), at.y)
			world.fx.sparkle(p, 1.5 if it.tier >= 3 else 1.0, (GLOW[it.tier] as Color) if it.tier > 0 else null)
	_follow(ocean, eye)
	if _dirty:
		_dirty = false
		_write()
	return got


## Lays every item into its rarity's ring and every beacon into theirs.
func _write() -> void:
	var counts := [0, 0, 0, 0, 0]
	var nb := 0
	for it in _items:
		var k := it.tier
		var n: int = counts[k]
		if n >= MAX:
			continue
		counts[k] = n + 1
		var sc: float = SCALE[k]
		var ride := 0.05 + (sc - 1.0) * 0.4 if k > 0 else -0.05
		var o := n * STRIDE
		var buf := _bufs[k]
		# columns: (scale, drifts, pulses), (phase, spin, -), (-), (x, ride, z)
		buf[o] = sc
		buf[o + 1] = it.phase
		buf[o + 2] = 0.0
		buf[o + 3] = it.base.x
		buf[o + 4] = 0.0 if it.moored else 1.0
		buf[o + 5] = it.spin
		buf[o + 6] = 0.0
		buf[o + 7] = ride
		buf[o + 8] = 1.0 if k >= 3 else 0.0
		buf[o + 9] = 0.0
		buf[o + 10] = 0.0
		buf[o + 11] = it.base.y
		buf[o + 12] = it.born
		buf[o + 13] = it.life
		buf[o + 14] = 0.0
		buf[o + 15] = 0.0
		if k == 0 or nb >= MAX * 4:
			continue
		# its beacon: (glow), (halo, beam, phase), (-), (x, drifts, z)
		var g: Color = GLOW[k]
		var b := nb * STRIDE
		_bbuf[b] = g.r
		_bbuf[b + 1] = float(HALO[k])
		_bbuf[b + 2] = 0.0
		_bbuf[b + 3] = it.base.x
		_bbuf[b + 4] = g.g
		_bbuf[b + 5] = float(BEAM[k])
		_bbuf[b + 6] = 0.0
		_bbuf[b + 7] = 0.0 if it.moored else 1.0
		_bbuf[b + 8] = g.b
		_bbuf[b + 9] = it.phase
		_bbuf[b + 10] = 0.0
		_bbuf[b + 11] = it.base.y
		_bbuf[b + 12] = it.born
		_bbuf[b + 13] = it.life
		_bbuf[b + 14] = 0.0
		_bbuf[b + 15] = 0.0
		nb += 1
	for k in 5:
		var n: int = counts[k]
		_mi[k].visible = n > 0
		if n > 0:
			_mm[k].buffer = _bufs[k]
		_mm[k].visible_instance_count = n
	_beacon_mi.visible = nb > 0
	if nb > 0:
		_beacons.buffer = _bbuf
	_beacons.visible_instance_count = nb


## The nearest item afloat to (x, z), or null.
func nearest(x: float, z: float) -> Item:
	var best: Item = null
	var bd := INF
	for it in _items:
		var d := where(it).distance_squared_to(Vector2(x, z))
		if d < bd:
			bd = d
			best = it
	return best


func all() -> Array[Item]:
	return _items


## How many items of each tier are afloat.
func counts() -> PackedInt32Array:
	var n := PackedInt32Array([0, 0, 0, 0, 0])
	for it in _items:
		n[it.tier] += 1
	return n


func clear() -> void:
	_items.clear()
	_dirty = true
	_write()


## One item of each rarity and a beacon as the game draws them, for it to
## draw once, too small to see, before the first ship goes down (see
## Game._warm_up).
func warm_meshes() -> Array[Node3D]:
	var out: Array[Node3D] = []
	for mm: MultiMesh in _mm + [_beacons]:
		var one := MultiMesh.new()
		one.transform_format = MultiMesh.TRANSFORM_3D
		one.use_custom_data = true
		one.mesh = mm.mesh
		one.instance_count = 1
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = one
		mi.material_override = _beacon_mat if mm == _beacons else _mat
		out.append(mi)
	return out


# ------------------------------------------------------------------ the craft

## The five meshes: the barrel, then a chest of each rarity.
static func build_meshes() -> Array[ArrayMesh]:
	var out: Array[ArrayMesh] = [_barrel()]
	for t in 4:
		out.append(_chest(t))
	return out


## A cask on its side: staves and two black iron hoops.
static func _barrel() -> ArrayMesh:
	var k := MeshKit.new(11)
	k.paint(Color("#8f5d34"), MeshKit.WOOD, 0.0)
	k.spar(Vector3(-0.55, 0.0, 0.0), Vector3(0.55, 0.0, 0.0), 0.42, 0.42, 12)
	k.paint(Color("#2c2622"), MeshKit.IRON, 0.0)
	for x: float in [-0.38, 0.38]:
		k.spar(Vector3(x - 0.04, 0.0, 0.0), Vector3(x + 0.04, 0.0, 0.0), 0.44, 0.44, 12)
	return k.commit()


## Each rarity's chest: body, lid, straps, ironwork or gilding, a lock, and
## the finer ones a gem; the legendary sits ajar on a glowing hoard. Body,
## lid, bands, lock, bands across, corners, studs, lid open (rad), gem.
const CHESTS := [
	["#6e4528", "#7d4f2d", "#3a3532", "#55504a", 2, false, false, 0.0, ""],
	["#1f5774", "#2a6f92", "#d8e2e8", "#eef4f8", 2, true, false, 0.0, "#58c8ff"],
	["#3f1f5e", "#55297c", "#e8b64c", "#f6cd63", 3, true, true, 0.0, "#c070ff"],
	["#5a1c14", "#e4ad3e", "#ffd263", "#ffe08a", 3, true, true, 0.62, "#ff4060"],
]


static func _chest(t: int) -> ArrayMesh:
	var s: Array = CHESTS[t]
	const W := 1.2
	const H := 0.7
	const D := 0.8
	var body := Color(s[0])
	var lid := Color(s[1])
	var band := Color(s[2])
	var lock := Color(s[3])
	var bands: int = s[4]
	var open: float = s[7]
	# iron fittings on the plainer chests, polished silver, then gold
	var metal := MeshKit.GILT if t >= 2 else MeshKit.IRON
	var k := MeshKit.new(21 + t)
	k.paint(body, MeshKit.WOOD, 0.0)
	k.box(Transform3D(Basis.IDENTITY, Vector3.ZERO), Vector3(W, H, D))
	# rim mouldings round the foot and the top of the body
	k.paint(MeshKit.shade(band, 0.85), metal, 0.0)
	k.box(Transform3D(Basis.IDENTITY, Vector3(0.0, -H * 0.5 + 0.04, 0.0)), Vector3(W + 0.06, 0.08, D + 0.06))
	k.box(Transform3D(Basis.IDENTITY, Vector3(0.0, H * 0.5 - 0.03, 0.0)), Vector3(W + 0.04, 0.06, D + 0.04))
	# the lid: a half-barrel hinged along the back top edge
	var hinge := Transform3D(Basis.IDENTITY, Vector3(0.0, H * 0.5, -D * 0.5)) * Transform3D(Basis(Vector3.RIGHT, -open), Vector3.ZERO) * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.0, D * 0.5))
	var xs: Array = [-0.4, 0.0, 0.4] if bands == 3 else [-0.35, 0.35]
	k.paint(lid, MeshKit.GILT if t == 3 else MeshKit.WOOD, 0.0)
	_half_barrel(k, hinge, -W * 0.5, W * 0.5, D * 0.5, 14)
	k.paint(MeshKit.shade(lid, 0.8), MeshKit.GILT if t == 3 else MeshKit.WOOD, 0.0)
	_half_disc(k, hinge, W * 0.5, D * 0.5, 14, 1.0)
	_half_disc(k, hinge, -W * 0.5, D * 0.5, 14, -1.0)
	# its underside, seen when it stands open
	k.paint(MeshKit.shade(lid, 0.45), MeshKit.WOOD, 0.0)
	k.box(hinge * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.01, 0.0)), Vector3(W - 0.02, 0.02, D - 0.02))
	k.paint(band, metal, 0.0)
	for x: float in xs:
		_half_barrel(k, hinge, x - 0.05, x + 0.05, D * 0.5 + 0.03, 14)
	if s[6]:
		for x: float in [-0.2, 0.2]:
			for q in 3:
				var a := (q + 1) * PI * 0.25
				k.sphere(hinge * Transform3D(Basis.IDENTITY, Vector3(x, sin(a) * (D * 0.5 + 0.01), cos(a) * (D * 0.5 + 0.01))), 0.035, 6, 4)
	# straps down the body and, on the finer ones, its corners
	for x: float in xs:
		k.box(Transform3D(Basis.IDENTITY, Vector3(x, 0.0, 0.0)), Vector3(0.1, H + 0.04, D + 0.04))
	if s[5]:
		for cx: float in [-1.0, 1.0]:
			for cz: float in [-1.0, 1.0]:
				k.box(Transform3D(Basis.IDENTITY, Vector3(cx * (W * 0.5 - 0.02), 0.0, cz * (D * 0.5 - 0.02))), Vector3(0.1, H + 0.06, 0.1))
	# the lock plate, and its hasp while it's shut
	k.paint(lock, metal, 0.0)
	k.box(Transform3D(Basis.IDENTITY, Vector3(0.0, 0.2, D * 0.5 + 0.03)), Vector3(0.24, 0.28, 0.06))
	if open == 0.0:
		k.paint(MeshKit.shade(lock, 0.8), metal, 0.0)
		k.box(Transform3D(Basis.IDENTITY, Vector3(0.0, 0.38, D * 0.5 + 0.05)), Vector3(0.1, 0.16, 0.05))
	# a handle hanging at each end
	k.paint(MeshKit.shade(band, 0.75), metal, 0.0)
	for sx: float in [-1.0, 1.0]:
		k.torus(Transform3D(Basis(Vector3(0.0, 0.0, 1.0), Vector3(0.0, -1.0, 0.0), Vector3(1.0, 0.0, 0.0)), Vector3(sx * (W * 0.5 + 0.03), 0.12, 0.0)), 0.12, 0.025, 4, 8, PI)
	if s[8] != "":
		_glow(k, Color(s[8]), 2.6)
		k.sphere(Transform3D(Basis.from_scale(Vector3(1.0, 1.3, 0.6)), Vector3(0.0, 0.18, D * 0.5 + 0.07)), 0.075, 4, 2)
	if open > 0.0:
		# a heap of coins and jewels bulging out of the open chest
		_glow(k, Color("#ffc24a"), 1.9)
		k.sphere(Transform3D(Basis.from_scale(Vector3(1.08, 0.5, 0.72)), Vector3(0.0, H * 0.5 - 0.04, 0.0)), 0.5, 14, 4, 0.0, TAU, 0.0, PI * 0.5)
		var rng := RandomNumberGenerator.new()
		rng.seed = 7
		_glow(k, Color("#ffd772"), 2.4)
		for i in 16:
			var tilt := Basis(Vector3.RIGHT, (rng.randf() - 0.5) * 1.6) * Basis(Vector3.BACK, (rng.randf() - 0.5) * 1.6)
			var a := rng.randf() * TAU
			var r := rng.randf() * 0.42
			var c := Vector3(cos(a) * r * 1.2, H * 0.5 + 0.12 + rng.randf() * 0.14, sin(a) * r * 0.75)
			var up := tilt * Vector3(0.0, 0.01, 0.0)
			k.spar(c - up, c + up, 0.07, 0.07, 7)
		var jewels := [Color("#ff3c64"), Color("#3cf0a0"), Color("#50a8ff")]
		for i in 5:
			_glow(k, jewels[i % 3], 3.0)
			var a := rng.randf() * TAU
			var r := 0.15 + rng.randf() * 0.3
			k.sphere(Transform3D(Basis.IDENTITY, Vector3(cos(a) * r, H * 0.5 + 0.2, sin(a) * r * 0.6)), 0.06, 4, 2)
	return k.commit()


## Lamplight paint for a gem or the gold: its colour times `boost`, as the
## shader multiplies it back up (GLOW_GAIN).
static func _glow(k: MeshKit, c: Color, boost: float) -> void:
	k.paint(MeshKit.shade(c, boost / GLOW_GAIN), MeshKit.GLOW, 0.0)


## The round top half of a cylinder of radius r lying along X from x0 to x1
## (in the frame xf), open at the ends.
static func _half_barrel(k: MeshKit, xf: Transform3D, x0: float, x1: float, r: float, segs: int) -> void:
	var nb := xf.basis.inverse().transposed()
	var base := k.vertex_count()
	for i in segs + 1:
		var a := PI * i / segs
		var d := Vector3(0.0, sin(a), cos(a))
		var n := (nb * d).normalized()
		k.add_vertex(xf * Vector3(x0, d.y * r, d.z * r), n)
		k.add_vertex(xf * Vector3(x1, d.y * r, d.z * r), n)
	for i in segs:
		var v := base + i * 2
		k.quad(v, v + 1, v + 3, v + 2)


## A half disc closing the end of the half barrel at x, facing `sgn` along X.
static func _half_disc(k: MeshKit, xf: Transform3D, x: float, r: float, segs: int, sgn: float) -> void:
	var n := (xf.basis.inverse().transposed() * Vector3(sgn, 0.0, 0.0)).normalized()
	var centre := k.add_vertex(xf * Vector3(x, 0.0, 0.0), n)
	var ring := k.vertex_count()
	for i in segs + 1:
		var a := PI * i / segs
		k.add_vertex(xf * Vector3(x, sin(a) * r, cos(a) * r), n)
	for i in segs:
		if sgn > 0.0:
			k.tri(centre, ring + i + 1, ring + i)
		else:
			k.tri(centre, ring + i, ring + i + 1)


## A beacon: the halo, a grid of cells (y 0, x and z -1..1) the shader lays
## on the swell, and the beam, a strip (y 1, x -0.5..0.5 across, z 0..1 up).
static func _beacon_mesh() -> ArrayMesh:
	var v := PackedVector3Array()
	var idx := PackedInt32Array()
	var n := HALO_CELLS
	for j in n + 1:
		for i in n + 1:
			v.append(Vector3(-1.0 + 2.0 * i / n, 0.0, -1.0 + 2.0 * j / n))
	for j in n:
		for i in n:
			var a := j * (n + 1) + i
			idx.append_array([a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2])
	var b := v.size()
	for c: Vector2 in [Vector2(-0.5, 0.0), Vector2(0.5, 0.0), Vector2(0.5, 1.0), Vector2(-0.5, 1.0)]:
		v.append(Vector3(c.x, 1.0, c.y))
	idx.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = v
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return m
