class_name ShoreGround
extends RefCounted
## The islands as ground to walk on (the web game's Ground, src/shore/ground.ts):
## how high the sand is underfoot, where the sea gets too deep to wade, which
## slopes are too steep to climb, the trunks and boulders to walk round and
## the towns' walls. Also where a boat can be run up a beach.

## Deepest water (m below the still sea) anyone wades into.
const WADE := 0.8
## Steepest ground (rise per metre) anyone climbs.
const STEEP := 1.15
## The trunks and boulders people on foot walk round, by the planting's kind,
## and how wide (m, times the plant's size).
const SOLID_R := {"palm": 0.3, "tree": 0.42, "treeFern": 0.3, "banana": 0.2, "rock": 0.95}
## Their buckets' size (m).
const CELL := 8.0

var world: World
## Towns and the harbour (x, z, r): no wandering through their walls.
var towns: Array[Vector3] = []
## Discs nobody walks into on top of the plants (x, z, r): camp furniture, the boat.
var blocks: Array[Vector3] = []
## Trunks and boulders (x, z, r) bucketed by CELL.
var _solids := {}
var solid_count := 0
var _near: Array[Vector3] = []


func _init(p_world: World, regions: Array[Region]) -> void:
	world = p_world
	for r in regions:
		for p: Dictionary in r.ports:
			_clear_port(p)
		_plant_solids(r)


## The quay and the town behind it (the web's portClearings): four discs along the shore.
func _clear_port(s: Dictionary) -> void:
	var nx := float(s.nx)
	var nz := float(s.nz)
	var depth := float(s.depth)
	var tx := nz
	var tz := -nx
	var v := -depth * 0.5 - 2.0
	var rr := maxf(depth * 0.5 + 7.0, 15.0)
	for u: float in [-24.0, -8.0, 8.0, 24.0]:
		towns.append(Vector3(float(s.x) + tx * u + nx * v, float(s.z) + tz * u + nz * v, rr))


## The island planting's trunks and boulders, read from the world bake's plants.
func _plant_solids(r: Region) -> void:
	var dir := Region.ROOT + r.id + "/"
	var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dir + "plants.json"))
	var data := Region.unpack(dir + "plants.bin", int(meta.size)).to_float32_array()
	for s: Dictionary in meta.sets:
		var rad: float = SOLID_R.get(str(s.kind), 0.0)
		if rad <= 0.0:
			continue
		for c: Array in s.cells:
			var first := int(c[2])
			for i in int(c[3]):
				var o := (first + i) * 16
				var k := Vector3(data[o], data[o + 4], data[o + 8]).length()
				var px := data[o + 3] + r.centre.x
				var pz := data[o + 11] + r.centre.z
				var key := _key(floori(px / CELL), floori(pz / CELL))
				if not _solids.has(key):
					_solids[key] = [] as Array[Vector3]
				(_solids[key] as Array[Vector3]).append(Vector3(px, pz, rad * k))
				solid_count += 1


static func _key(gx: int, gz: int) -> int:
	return (gx + 4096) * 8192 + gz + 4096


func height(x: float, z: float) -> float:
	return world.ground_height(x, z)


## Rise per metre at a point.
func slope(x: float, z: float) -> float:
	return world.ground_gradient(x, z).length()


## Can a body of radius `r` stand here?
func open(x: float, z: float, r := 0.3) -> bool:
	var h := height(x, z)
	if h < -WADE:
		return false
	if h > 0.5 and slope(x, z) > STEEP:
		return false
	for t in towns:
		if (x - t.x) * (x - t.x) + (z - t.y) * (z - t.y) < (t.z + r) * (t.z + r):
			return false
	return true


## Every trunk, boulder or block whose disc might reach near (x, z) (x, z, r).
func solids_near(x: float, z: float) -> Array[Vector3]:
	var out := _near
	out.clear()
	var gx := floori(x / CELL)
	var gz := floori(z / CELL)
	for ox in range(-1, 2):
		for oz in range(-1, 2):
			var cell: Variant = _solids.get(_key(gx + ox, gz + oz))
			if cell != null:
				out.append_array(cell as Array[Vector3])
	out.append_array(blocks)
	return out


## Is there a trunk, boulder or block within `r` of a point?
func solid_near(x: float, z: float, r: float) -> bool:
	for o in solids_near(x, z):
		if Vector2(o.x - x, o.y - z).length() < o.z + r:
			return true
	return false


## Moves a walker from (x, z) by (dx, dz), sliding along whatever stops it:
## deep water, cliffs, towns, and round trunks, boulders and blocks.
func step(x: float, z: float, dx: float, dz: float, r: float) -> Vector2:
	var nx := x + dx
	var nz := z + dz
	if not open(nx, nz, r):
		if open(nx, z, r):
			nz = z
		elif open(x, nz, r):
			nx = x
		else:
			nx = x
			nz = z
	# trunks, boulders and blocks push you round them: every overlap's push
	# summed, so two side by side (a log's two ends) act as one wall rather
	# than shoving you back and forth between them
	var ml := maxf(Vector2(dx, dz).length(), 1e-6)
	for pass_i in 3:
		var px := 0.0
		var pz := 0.0
		for o in solids_near(nx, nz):
			var ox := nx - o.x
			var oz := nz - o.y
			var mn := o.z + r
			var d2 := ox * ox + oz * oz
			if d2 >= mn * mn:
				continue
			var d := maxf(sqrt(d2), 1e-3)
			var ux := ox / d
			var uz := oz / d
			px += ux * (mn - d)
			pz += uz * (mn - d)
			# walking square into a trunk: step round it instead of stopping dead
			var into := -(dx * ux + dz * uz) / ml
			if pass_i == 0 and into > 0.6:
				var side := 1.0 if dx * -uz + dz * ux >= 0.0 else -1.0
				px += -uz * side * (mn - d) * into
				pz += ux * side * (mn - d) * into
		if px == 0.0 and pz == 0.0:
			break
		if open(nx + px, nz + pz, r):
			nx += px
			nz += pz
		else:
			break
	return Vector2(nx, nz)


## The nearest beach a boat can be pulled up on from a ship at (x, z): clean
## water all the way in, a gentle beach, then land you can walk on. {} when
## there's none; else {island, x, z, dx, dz, sand_x, sand_z}: the keel
## touches at (x, z), the beach runs on inland along (dx, dz), and the first
## dry sand lies at (sand_x, sand_z).
func landing(x: float, z: float, reach := 85.0) -> Dictionary:
	var reg := world.region_at(x, z)
	if reg == null:
		return {}
	var near := reg.nearest_island(x, z)
	if near.is_empty() or float(near.dist) > reach + 30.0:
		return {}
	var isl: Dictionary = near.island
	var a0 := atan2(float(isl.x) - x, float(isl.z) - z)
	var best := {}
	var best_d := INF
	for off: float in [0.0, 0.22, -0.22, 0.45, -0.45, 0.75, -0.75, 1.1, -1.1]:
		var a := a0 + off
		var dx := sin(a)
		var dz := cos(a)
		var keel := -1.0
		var d := 4.0
		while d < reach:
			if height(x + dx * d, z + dz * d) > -0.45:
				keel = d
				break
			d += 1.5
		if keel < 0.0 or keel >= best_d:
			continue
		var bx := x + dx * keel
		var bz := z + dz * keel
		# dry sand within a few metres, and gentle going a little way past it
		var sand := -1.0
		var e := 0.0
		while e < 14.0:
			if height(bx + dx * e, bz + dz * e) > 0.3:
				sand = e
				break
			e += 0.75
		if sand < 0.0:
			continue
		var sx := bx + dx * (sand + 1.5)
		var sz := bz + dz * (sand + 1.5)
		var ok := open(sx, sz, 1.0) and slope(sx, sz) < 0.5
		var f := 2.0
		while f <= 8.0 and ok:
			ok = open(sx + dx * f, sz + dz * f, 0.5)
			f += 2.0
		if not ok:
			continue
		best_d = keel
		best = {"island": isl, "x": bx, "z": bz, "dx": dx, "dz": dz, "sand_x": sx, "sand_z": sz}
	return best
