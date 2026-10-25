class_name Wildlife
extends Node3D
## Island wildlife (the web game's src/fx/wild/wildlife.ts). Fifteen kinds of
## beast live on the isles, each where it would: goats on the crags, deer and
## giant tortoises in the meadows, wild boar rooting along the forest edge with
## a file of striped piglets behind, capuchins foraging below the trees and
## swarming up them, scarlet macaws in noisy pairs from crown to crown,
## iguanas basking on the rocks, sea lions hauled out on the shore, red crabs
## scuttling at the tideline, flamingo flocks and stalking egrets in the
## shallows, pelicans patrolling the surf and plunging for fish, blue-footed
## boobies dancing on the sea rocks, blue morphos over the wildflowers and
## hummingbirds at the hibiscus.
##
## Each one goes about its own life (grazing, rooting, preening, displaying,
## sleeping when the sun goes down) and minds the world around it: a captain
## walking up makes them look, then edge away or bolt, each in its own way. A
## goat bounds up the crag, a deer stots off flashing its tail, the sow
## bluff-charges before her family flees squealing, the monkeys shriek and go
## up the nearest tree, the tortoise just pulls its head in, the crabs dash
## for their burrows and the flamingos run across the water and take wing. A
## broadside, a pistol shot or a ball thumping into the hillside scatters the
## whole island. Only the isles near the camera are alive at any moment, and
## the beasts far off on screen think less often than the near ones; every
## species is one instanced draw per cut (see WildSculpt and wild.gdshader).

## A new kind of beast was seen up close for the first time.
signal spotted(beast_name: String, count: int, total: int)

const GOAT := 0
const DEER := 1
const BOAR := 2
const MONKEY := 3
const MACAW := 4
const PELICAN := 5
const BOOBY := 6
const FLAMINGO := 7
const EGRET := 8
const IGUANA := 9
const TORTOISE := 10
const SEAL := 11
const CRAB := 12
const BUTTERFLY := 13
const HUMMER := 14
const KINDS := 15

const NAMES := ["Wild goat", "Island deer", "Wild boar", "Capuchin monkey", "Scarlet macaw", "Brown pelican", "Blue-footed booby", "Flamingo",
		"Great egret", "Green iguana", "Giant tortoise", "Sea lion", "Red land crab", "Blue morpho", "Hummingbird"]
## Model scale (the sculpts are life size).
const SCALE := [1.1, 1.1, 1.1, 1.2, 1.35, 1.15, 1.2, 1.1, 1.15, 1.25, 1.15, 1.0, 1.7, 1.8, 2.2]
## Rough size at scale 1 (m), for culling and spotting.
const SIZE := [1.3, 1.5, 1.1, 0.8, 0.9, 1.4, 0.9, 1.7, 1.2, 1.4, 1.1, 2.0, 0.5, 0.25, 0.3]
## Instances of each of its meshes drawn at most.
const MAX := [32, 24, 36, 36, 32, 28, 36, 48, 20, 32, 16, 32, 64, 48, 24]
const SHADOW := [true, true, true, true, true, true, true, true, true, false, true, true, false, false, false]
## Metres covered in one gait cycle, and the legs' swing at a run (rad).
const STRIDE_M := [0.95, 1.25, 0.75, 0.55, 0.2, 0.4, 0.3, 0.7, 0.55, 0.45, 0.5, 0.9, 0.12, 1.0, 1.0]
const SWING := [0.55, 0.6, 0.6, 0.7, 0.4, 0.45, 0.5, 0.5, 0.55, 0.6, 0.32, 0.6, 0.6, 0.0, 0.0]
const WALK := [0.9, 1.0, 0.8, 0.9, 0.3, 0.5, 0.45, 0.35, 0.3, 0.35, 0.18, 0.9, 0.9, 0.0, 0.0]
const RUN := [5.2, 7.5, 5.5, 4.2, 0.5, 1.4, 1.2, 4.5, 1.8, 3.4, 0.22, 2.2, 3.2, 0.0, 0.0]
## Turn rate (rad/s).
const TURN := [3.2, 3.5, 3.6, 5.0, 4.0, 3.0, 3.5, 2.6, 2.5, 3.0, 0.7, 1.8, 9.0, 8.0, 10.0]
## How near a walker may come before it bolts (m).
const WARY := [13.0, 16.0, 9.0, 6.0, 10.0, 14.0, 7.0, 26.0, 18.0, 6.0, 3.2, 10.0, 4.0, 2.5, 3.0]
## Pivot of the body's pitch (y, z at scale 1): the hips, for sitting up and rearing.
const HIP := [Vector2(0.72, -0.36), Vector2(0.85, -0.34), Vector2(0.46, -0.34), Vector2(0.27, -0.15), Vector2(0.11, -0.02), Vector2(0.25, -0.05),
		Vector2(0.18, 0.0), Vector2(0.92, 0.0), Vector2(0.66, 0.0), Vector2(0.13, 0.0), Vector2(0.26, 0.0), Vector2(0.2, -0.6), Vector2(0.07, 0.0),
		Vector2.ZERO, Vector2.ZERO]
## How far the body drops lying down (m at scale 1).
const REST_DROP := [0.44, 0.52, 0.3, 0.13, 0.0, 0.15, 0.1, 0.0, 0.0, 0.04, 0.12, 0.0, 0.0, 0.0, 0.0]

# pose channels (eased toward their targets every frame)
const HP := 0
const HY := 1
const FLAP := 2
const FOLD := 3
const TAILW := 4
const SA := 5
const SB := 6
const TUCK := 7
const PITCH := 8
const ROLL := 9
const LIFT := 10
const STRIDE := 11
const NP := 12
const RATE := [6.0, 5.0, 7.0, 6.0, 6.0, 6.0, 6.0, 5.0, 5.0, 5.0, 4.0, 6.0]

# modes (each species uses the ones it needs)
const IDLE := 0
const WALKING := 1
const FLEE := 2
const REST := 3
const ALERT := 4
const FLY := 5
const LAND := 6
const PERCH := 7
const SWIM := 8
const CLIMB := 9
const HIDE := 10
const SHOW := 11
const DUEL := 12
const PLAY := 13
const LOOK := 14
const CHARGE := 15
const SIT := 16
const DIVE := 17
const TAKEOFF := 18
const DANCE := 19
const MARCH := 20
const STRIKE := 21
const DOWN := 22
const HOVER := 23
const CURIOUS := 24
const FOLLOW := 25

## An island comes alive when the view comes this near its shore (m).
const ACTIVE := 320.0
## How far past ACTIVE isles are surveyed ahead of time (m), so they're ready when the view arrives.
const AHEAD := 260.0
## Below this many pixels tall a beast isn't drawn.
const MIN_PX := 3.0
## A beast whose model metre spans fewer pixels than this wears the light cut
## (the web's light cut, held to 0.03 model units of error, under 0.8 px)...
const LIGHT_PX := 26.0
## ...and fewer than this, the speck.
const SPECK_PX := 9.0
## Beasts drawn at once (rows of the pose texture).
const ROWS := 512
## Floats per instance: the 3x4 transform's rows, then (pose row, -, -, -).
const STRIDE_F := 16
## How long (ms) a frame may spend surveying an isle the view is coming to, and one it has reached.
const SURVEY_MS := [0.6, 1.5]

## Broadleaf trunk heights by variant, and the palms' heights and leans (the plant sculpts').
const TREE_H := [3.3, 3.3, 6.4, 2.9, 3.3, 3.3]
const PALM_H := [8.5, 10.5, 7.0]
const PALM_LEAN := [1.6, 2.4, 0.9]
const PALM_SEED := [3, 7, 13]


## A tree a monkey can climb or a macaw perch on.
class Perch:
	var x := 0.0
	var y := 0.0
	var z := 0.0
	## Where the trunk is climbed to, and the top of the crown.
	var limb := Vector3.ZERO
	var top := Vector3.ZERO
	var palm := false
	var lean := 0.0
	var h := 0.0
	var sway := 0.0
	var s := 1.0
	var c := 1.0
	var sn := 0.0

	## Palms lean and curve: the trunk's point at t (0 foot .. 1 crown).
	func at(t: float) -> Vector3:
		if not palm:
			return Vector3(x, y + h * 0.85 * s * t, z)
		var lx := lean * t * t * s
		var ly := h * t * s
		var lz := sway * sin(t * PI) * 0.5 * s
		return Vector3(x + c * lx + sn * lz, y + ly, z - sn * lx + c * lz)


class Pop:
	var isl: Dictionary
	var id := 0
	var region: Region
	var flora: Flora
	var ext := 0.0
	var cx := 0.0
	var cz := 0.0
	var built := false
	var beasts: Array[Beast] = []
	var shallows := PackedVector3Array()
	var beach := PackedVector3Array()
	var rocks := PackedVector3Array()
	var meadow := PackedVector3Array()
	var forest := PackedVector3Array()
	var crags := PackedVector3Array()
	var trees: Array[Perch] = []
	var blooms := PackedVector3Array()
	var flowers := PackedVector3Array()
	## Round the island a little way out (3 m of water): pelicans patrol it, sea lions and boobies fish there.
	var ring := PackedVector3Array()


class Beast:
	var k := 0
	var geo := 0
	var s := 1.0
	var shade := 1.0
	var pop: Pop
	var x := 0.0
	var y := 0.0
	var z := 0.0
	var yaw := 0.0
	var vx := 0.0
	var vy := 0.0
	var vz := 0.0
	var speed := 0.0
	var want := 0.0
	## Walks this far off its heading (crabs go sideways).
	var side := 0.0
	var tx := 0.0
	var ty := 0.0
	var tz := 0.0
	var mode := IDLE
	var t := 0.0
	var u := 0.0
	var air := false
	var wet := false
	var hidden := false
	## Held mid-stride (a stalking heron): the gait doesn't advance and the legs stay where they are.
	var hold := false
	var gait := 0.0
	## Extra gait cycles a second, stepping on the spot (a booby's dance).
	var step := 0.0
	var flap_ph := 0.0
	var flap_hz := 0.0
	var slope := 0.0
	var cur: Array = []
	var tgt: Array = []
	## Pose easing this frame, times RATE.
	var quick := 1.0
	var fear := 0.0
	var fx := 0.0
	var fz := 0.0
	var lead: Beast
	var mate: Beast
	var ox := 0.0
	var oz := 0.0
	var home := Vector3.ZERO
	var tree: Perch
	var climb_t := 0.0
	## Height of a leap in progress (m).
	var jump := 0.0
	var seed := 0.0
	var clock := 0.0
	var adult := true
	## Game time it was last thought about, and its turn among its isle's beasts.
	var last := -1.0
	var slot := 0


class Threat:
	var x := 0.0
	var z := 0.0
	var y := 0.0
	## Multiplies every beast's wariness (running feet, a ship's bulk).
	var k := 1.0
	var pad := 0.0
	## Seconds this walker has kept still (a captain who waits is approached).
	var still := 0.0
	var yaw := 0.0


class Batch:
	var mm := MultiMesh.new()
	var mi := MultiMeshInstance3D.new()
	var buf := PackedFloat32Array()
	var n := 0
	var cap := 0
	var lo := Vector3.ZERO
	var hi := Vector3.ZERO


var world: World
var lite := false
## Every isle's population, surveyed the first time the view comes near.
var pops: Array[Pop] = []
var active: Array[Pop] = []
var time := 0.0
## Kinds of beast seen up close so far.
var seen := {}
## Beasts drawn last frame, and thought about.
var drawn := 0
var thought := 0
var night := 0.0
var storm := 0.0
var rain := 0.0

var _avoid: Array[Vector3] = []
var _material: ShaderMaterial
## Per species, per mesh, per cut: its batch.
var _batches: Array = []
var _guns_seen := {}
var _dead := {}
var _threats: Array[Threat] = []
var _still := {}
var _calls := 0
var _frame := 0
var _walkers: Array = []
var _job: Pop
var _job_step := 0
var _job_rnd: Mulberry32
var _job_gx := 0.0
var _tree_hash := {}
var _pose := PackedFloat32Array()
var _pose_img: Image
var _pose_tex: ImageTexture
var _row := PackedFloat32Array()
# the threat() result, read straight away
var _th_d := INF
var _th: Threat


func _init(p_regions: Array[Region], floras: Array, avoid: Array[Vector3], p_lite: bool) -> void:
	name = "Wildlife"
	lite = p_lite
	_avoid = avoid
	_material = ShaderMaterial.new()
	_material.shader = preload("res://shaders/wild.gdshader")
	_pose_img = Image.create_empty(3, ROWS, false, Image.FORMAT_RGBAF)
	_pose_tex = ImageTexture.create_from_image(_pose_img)
	_material.set_shader_parameter("wild_pose", _pose_tex)
	_row.resize(STRIDE_F)
	var meshes := WildModels.all()
	for k in KINDS:
		var per_geo := []
		for g in (meshes[k] as Array).size():
			var cuts := []
			for lod in 3:
				var b := Batch.new()
				b.mm.transform_format = MultiMesh.TRANSFORM_3D
				b.mm.use_custom_data = true
				b.mm.mesh = meshes[k][g][lod]
				b.mi.multimesh = b.mm
				b.mi.material_override = _material
				b.mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if SHADOW[k] and lod < WildSculpt.SPECK else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				b.mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
				b.mi.visible = false
				b.mi.name = "%s_%d_%d" % [NAMES[k].replace(" ", "_").replace("-", "_"), g, lod]
				add_child(b.mi)
				cuts.append(b)
			per_geo.append(cuts)
		_batches.append(per_geo)
	for ri in p_regions.size():
		var r := p_regions[ri]
		for isl: Dictionary in r.islands:
			var p := Pop.new()
			p.isl = isl
			p.id = int(isl.id)
			p.region = r
			p.flora = floras[ri] if ri < floras.size() else null
			var st := float(isl.stretch)
			p.ext = float(isl.r) * maxf(st, 1.0 / st) * 1.15
			p.cx = float(isl.x)
			p.cz = float(isl.z)
			pops.append(p)
	for k: Variant in Progress.fauna:
		seen[int(k)] = true


## Kinds of beast seen so far.
func spotted_count() -> int:
	return seen.size()


## Every beast on the isles surveyed so far.
func population() -> int:
	var n := 0
	for p in pops:
		n += p.beasts.size()
	return n


# ---------------------------------------------------------------- habitats

func _h(p: Pop, x: float, z: float) -> float:
	return p.region.height_at(x, z)


func _slope_at(p: Pop, x: float, z: float) -> float:
	var e := 1.5
	return Vector2(_h(p, x + e, z) - _h(p, x - e, z), _h(p, x, z + e) - _h(p, x, z - e)).length() / (2.0 * e)


func _avoided(x: float, z: float) -> bool:
	for c in _avoid:
		if (x - c.x) * (x - c.x) + (z - c.y) * (z - c.y) < c.z * c.z:
			return true
	return false


## Surveys an isle's habitats and settles its fauna, a slice at a time (see
## update): a big isle's survey is thousands of height and slope samples, and a
## zoom-out or a battle's pull-back brings several isles in range on
## consecutive frames. Returns true once it's done.
func _survey_step(p: Pop) -> bool:
	var ext := p.ext
	var step := clampf(ext / 40.0, 4.0, 8.0)
	match _job_step:
		0:
			_job_rnd = Mulberry32.new(p.id * 9973 + 31 * p.id + 5)
			_tree_hash.clear()
			_gather_plants(p)
			_job_gx = -ext
			_job_step = 1
			return false
		1:
			# the habitats, a row at a time
			var rnd := _job_rnd
			var gx := _job_gx
			var gz := -ext
			while gz <= ext:
				var x := p.cx + gx + (rnd.next() - 0.5) * step
				var z := p.cz + gz + (rnd.next() - 0.5) * step
				gz += step
				var h := _h(p, x, z)
				if h < -0.8 or _avoided(x, z):
					continue
				var sl := _slope_at(p, x, z)
				var spot := Vector3(x, h, z)
				if h < -0.1:
					if sl < 0.12 and h > -0.62 and p.region.reef_at(x, z) <= 0.0:
						p.shallows.append(spot)
				elif h < 1.7 and sl < 0.22:
					p.beach.append(spot)
				elif h < 5.0 and sl > 0.35:
					p.rocks.append(spot)
				elif h > 2.4 and sl < 0.3:
					if _tree_hash.has(_tkey(x, z)):
						p.forest.append(spot)
					else:
						p.meadow.append(spot)
				if h > 6.0 and sl > 0.45 and sl < 1.7:
					p.crags.append(spot)
			_job_gx += step
			if _job_gx > ext:
				_job_step = 2
			return false
		2:
			# the ring: out from the middle until there's three metres of water under the keel
			for kk in 24:
				var a := float(kk) / 24.0 * TAU
				var land := false
				var d := 0.0
				while d < ext * 1.8:
					var x := p.cx + cos(a) * d
					var z := p.cz + sin(a) * d
					var h := _h(p, x, z)
					if h > 0.0:
						land = true
					elif land and h < -2.8:
						if not _avoided(x, z):
							p.ring.append(Vector3(x, 0.0, z))
						break
					d += 4.0
			_job_step = 3
			return false
	_settle(p, _job_rnd)
	return true


static func _tkey(x: float, z: float) -> int:
	return int(floorf(x / 6.0)) * 100003 + int(floorf(z / 6.0))


## Trees first (the forest floor is wherever they crowd), then the blooms.
func _gather_plants(p: Pop) -> void:
	if p.flora == null:
		return
	var rnd := _job_rnd
	for kind: String in ["palm", "tree"]:
		for pl: Array in p.flora.plants_of(p.id, kind):
			var at: Vector3 = pl[0]
			if _avoided(at.x, at.z):
				continue
			_tree_hash[_tkey(at.x, at.z)] = true
			var tr := Perch.new()
			tr.x = at.x
			tr.y = at.y
			tr.z = at.z
			tr.s = float(pl[1])
			tr.c = cos(float(pl[2]))
			tr.sn = sin(float(pl[2]))
			var v := int(pl[3])
			if kind == "palm":
				tr.palm = true
				tr.h = PALM_H[v % 3]
				tr.lean = PALM_LEAN[v % 3]
				tr.sway = (Mulberry32.new(PALM_SEED[v % 3]).next() - 0.5) * 0.9
				tr.limb = tr.at(1.0) + Vector3(0, 0.15, 0)
				tr.top = tr.limb + Vector3(0, 0.25, 0)
			else:
				tr.h = TREE_H[v] if v < TREE_H.size() else 3.3
				# a limb a little out from the trunk, low in the crown
				var a := rnd.next() * TAU
				tr.limb = Vector3(tr.x + cos(a) * 0.55 * tr.s, tr.y + tr.h * 0.85 * tr.s, tr.z + sin(a) * 0.55 * tr.s)
				tr.top = Vector3(tr.x, tr.y + (tr.h + 3.4) * tr.s, tr.z)
			p.trees.append(tr)
	# thin long lists (a big isle has hundreds of palms)
	if p.trees.size() > 120:
		var every := ceili(p.trees.size() / 120.0)
		var kept: Array[Perch] = []
		for i in p.trees.size():
			if i % every == 0:
				kept.append(p.trees[i])
		p.trees = kept
	for pl: Array in p.flora.plants_of(p.id, "flowerBush"):
		var at: Vector3 = pl[0]
		if not _avoided(at.x, at.z):
			p.blooms.append(at + Vector3(0, 1.0 * float(pl[1]), 0))
	var wild := p.flora.plants_of(p.id, "wildflower")
	for i in range(0, wild.size(), 3):
		var at: Vector3 = wild[i][0]
		if not _avoided(at.x, at.z):
			p.flowers.append(at + Vector3(0, 0.22 * float(wild[i][1]), 0))
	p.blooms = _thin(p.blooms, 40)
	p.flowers = _thin(p.flowers, 60)


static func _thin(list: PackedVector3Array, most: int) -> PackedVector3Array:
	if list.size() <= most:
		return list
	var every := ceili(list.size() / float(most))
	var out := PackedVector3Array()
	for i in list.size():
		if i % every == 0:
			out.append(list[i])
	return out


## Who lives here: each kind of isle has its own fauna, and no two isles quite the same.
func _settle(p: Pop, rnd: Mulberry32) -> void:
	var kind := str(p.isl.kind)
	var chance := func(base: Dictionary, need: float, have: float) -> bool: return have >= need and rnd.next() < float(base.get(kind, 0.0))
	var n := func(a: float, b: float) -> int: return roundi(a + rnd.next() * (b - a) * (0.6 if lite else 1.0))
	var big := clampf(float(p.isl.r) / 120.0, 0.6, 1.6)
	var tree_tops := PackedVector3Array()
	for tr in p.trees:
		tree_tops.append(tr.top)
	if chance.call({"rocky": 0.95, "volcanic": 0.85, "karst": 0.75, "lush": 0.5}, 6, p.crags.size()):
		for h in (2 if big > 1.2 and rnd.next() < 0.5 else 1):
			_herd(p, GOAT, _pick(rnd, p.crags), n.call(3, 6), rnd)
	if chance.call({"lush": 0.75, "karst": 0.35, "rocky": 0.35, "volcanic": 0.25}, 16, p.meadow.size()):
		_herd(p, DEER, _pick(rnd, p.meadow), n.call(2, 5), rnd)
	if chance.call({"lush": 0.75, "karst": 0.65, "volcanic": 0.35, "rocky": 0.25}, 12, p.forest.size() + p.trees.size() / 3.0):
		_herd(p, BOAR, _pick(rnd, p.forest if p.forest.size() else (p.meadow if p.meadow.size() else p.beach)), n.call(3, 6), rnd)
	if chance.call({"lush": 0.75, "karst": 0.95, "volcanic": 0.3, "rocky": 0.25, "atoll": 0.3}, 10, p.trees.size()):
		var tr: Perch = p.trees[int(rnd.next() * p.trees.size())]
		_herd(p, MONKEY, Vector3(tr.x, tr.y, tr.z), n.call(4, 8), rnd)
	if chance.call({"lush": 0.75, "karst": 0.85, "atoll": 0.45, "volcanic": 0.35, "rocky": 0.35}, 6, p.trees.size()):
		_herd(p, MACAW, _pick(rnd, tree_tops), n.call(2, 3) * 2, rnd)
	if chance.call({"lush": 0.6, "karst": 0.5, "atoll": 0.75, "volcanic": 0.55, "rocky": 0.6}, 4, p.ring.size()) and p.rocks.size() + p.beach.size() > 4:
		_herd(p, PELICAN, _pick(rnd, p.rocks if p.rocks.size() else p.beach), n.call(3, 6), rnd)
	if chance.call({"rocky": 0.85, "volcanic": 0.85, "karst": 0.5, "atoll": 0.55, "lush": 0.3}, 5, p.rocks.size() + p.beach.size() / 4.0):
		_herd(p, BOOBY, _pick(rnd, p.rocks if p.rocks.size() else p.beach), n.call(4, 8), rnd)
	if chance.call({"atoll": 0.95, "lush": 0.55, "karst": 0.35, "volcanic": 0.3, "rocky": 0.25}, 14, p.shallows.size()):
		_herd(p, FLAMINGO, _pick(rnd, p.shallows), n.call(8, 15), rnd)
	if chance.call({"atoll": 0.7, "lush": 0.65, "karst": 0.6, "volcanic": 0.4, "rocky": 0.45}, 4, p.shallows.size() + p.beach.size() / 3.0):
		for e in n.call(1, 3):
			_herd(p, EGRET, _pick(rnd, p.shallows if p.shallows.size() else p.beach), 1, rnd)
	if chance.call({"volcanic": 0.95, "rocky": 0.65, "atoll": 0.6, "lush": 0.55, "karst": 0.45}, 5, p.rocks.size() + p.beach.size()):
		for e in n.call(3, 6):
			_herd(p, IGUANA, _pick(rnd, p.rocks if p.rocks.size() and rnd.next() < 0.6 else (p.beach if p.beach.size() else p.rocks)), 1, rnd)
	if chance.call({"volcanic": 0.75, "lush": 0.45, "rocky": 0.35, "atoll": 0.25}, 10, p.meadow.size()):
		for e in n.call(1, 3):
			_herd(p, TORTOISE, _pick(rnd, p.meadow), 1, rnd)
	if chance.call({"rocky": 0.75, "volcanic": 0.65, "karst": 0.4, "lush": 0.35, "atoll": 0.35}, 4, p.rocks.size() + p.beach.size() / 2.0) and p.ring.size():
		_herd(p, SEAL, _pick(rnd, p.rocks if p.rocks.size() and rnd.next() < 0.6 else (p.beach if p.beach.size() else p.rocks)), n.call(3, 7), rnd)
	if p.beach.size() >= 6 and rnd.next() < 0.92:
		for c in n.call(2, 3):
			_herd(p, CRAB, _pick(rnd, p.beach), n.call(5, 8), rnd)
	if kind != "volcanic" and chance.call({"lush": 0.85, "karst": 0.8, "rocky": 0.6, "atoll": 0.5}, 5, p.flowers.size()):
		for c in n.call(2, 3):
			_herd(p, BUTTERFLY, _pick(rnd, p.flowers), n.call(4, 7), rnd)
	if chance.call({"lush": 0.85, "karst": 0.85, "rocky": 0.6, "atoll": 0.6, "volcanic": 0.3}, 2, p.blooms.size()):
		for c in n.call(2, 4):
			_herd(p, HUMMER, _pick(rnd, p.blooms), 1, rnd)
	for i in p.beasts.size():
		p.beasts[i].slot = i


static func _pick(rnd: Mulberry32, list: PackedVector3Array) -> Vector3:
	return list[int(rnd.next() * list.size()) % list.size()]


## A herd, troop, flock, colony or swarm of `count` round `at`.
func _herd(p: Pop, k: int, at: Vector3, count: int, rnd: Mulberry32) -> void:
	var lead: Beast = null
	var prev: Beast = null
	for i in count:
		# the young: kids, fawns, piglets, pups
		var young := i > 0 and ((k == GOAT and rnd.next() < 0.3) or (k == DEER and rnd.next() < 0.25) or k == BOAR or (k == SEAL and rnd.next() < 0.3))
		var a := rnd.next() * TAU
		var r := 0.0
		match k:
			FLAMINGO: r = 1.5 + rnd.next() * 5.0
			CRAB: r = 1.0 + rnd.next() * 5.0
			BUTTERFLY, HUMMER: r = 0.5
			_: r = 2.0 + rnd.next() * 5.0
		var x := at.x + cos(a) * r * (1.0 if i else 0.0)
		var z := at.z + sin(a) * r * (1.0 if i else 0.0)
		var flying := k == BUTTERFLY or k == HUMMER or k == MACAW
		if not flying:
			var h := _h(p, x, z)
			var wader := k == FLAMINGO or k == EGRET
			if (h < -0.7 or h > 1.0) if wader else h < 0.1:
				x = at.x
				z = at.z
		var sc: float = SCALE[k] * (0.92 + rnd.next() * 0.16) * ((0.42 if k == BOAR else 0.6) if young else 1.0)
		var geo := 0
		if k == DEER and i == 0 and rnd.next() < 0.55:
			geo = 1
			sc *= 1.08
		# which of the two colourings: piglets wear stripes, fawns spots; the rest vary by breed
		var alt := false
		match k:
			BOAR, DEER, BOOBY: alt = young
			SEAL: alt = young or rnd.next() < 0.3
			MACAW: alt = (i / 2) % 2 == 1 and rnd.next() < 0.7
			EGRET: alt = rnd.next() < 0.4
			GOAT: alt = rnd.next() < 0.45
			FLAMINGO: alt = rnd.next() < 0.12
			IGUANA: alt = rnd.next() < 0.3
			CRAB: alt = rnd.next() < 0.35
			BUTTERFLY, HUMMER: alt = rnd.next() < 0.4
			MONKEY: alt = rnd.next() < 0.25
			TORTOISE: alt = rnd.next() < 0.4
			PELICAN: alt = rnd.next() < 0.3
		var b := Beast.new()
		b.k = k
		b.geo = geo
		b.s = sc
		b.shade = (2.0 if alt else 0.0) + 0.86 + rnd.next() * 0.24
		b.pop = p
		b.x = x
		b.z = z
		b.y = at.y if flying else _h(p, x, z)
		b.yaw = rnd.next() * TAU
		b.tx = x
		b.ty = at.y
		b.tz = z
		b.t = rnd.next() * 6.0
		b.gait = rnd.next() * TAU
		b.flap_ph = rnd.next() * TAU
		b.cur.resize(NP)
		b.cur.fill(0.0)
		b.tgt.resize(NP)
		b.tgt.fill(0.0)
		b.lead = null if i == 0 else (prev if k == BOAR else lead)
		b.home = at
		b.seed = rnd.next() * 100.0
		b.clock = rnd.next() * 5.0
		b.adult = not young
		if k == MACAW and i % 2 == 1 and prev != null:
			b.mate = prev
			prev.mate = b
		if k == BOAR and i == 0:
			b.s *= 1.05
		if k == MONKEY or k == MACAW:
			# they start the voyage up in the trees
			var tr := _near_tree(p, x, z, 30.0)
			if tr != null:
				b.tree = tr
				b.mode = PERCH
				b.air = true
				var pp := tr.top if k == MACAW else tr.limb
				b.x = pp.x + ((rnd.next() - 0.5) * 0.6 if k == MACAW else 0.0)
				b.y = pp.y
				b.z = pp.z + ((rnd.next() - 0.5) * 0.6 if k == MACAW else 0.0)
				b.climb_t = 1.0
		if k == BUTTERFLY or k == HUMMER:
			b.air = true
			b.y = at.y + 0.6
			b.mode = FLY
		if k == FLAMINGO or k == EGRET or k == BOOBY or k == PELICAN or k == MACAW:
			b.cur[FOLD] = 1.0
			b.tgt[FOLD] = 1.0
		p.beasts.append(b)
		if i == 0:
			lead = b
		prev = b


func _near_tree(p: Pop, x: float, z: float, r: float, not_this: Perch = null) -> Perch:
	var best: Perch = null
	var bd := r
	for t in p.trees:
		if t == not_this:
			continue
		var d := Vector2(t.x - x, t.z - z).length()
		if d < bd:
			bd = d
			best = t
	return best


## A random spot from `list` within `r` of (x, z) (or none, failing that: Vector3.INF).
static func _spot_near(list: PackedVector3Array, x: float, z: float, r: float) -> Vector3:
	if list.is_empty():
		return Vector3.INF
	for i in 8:
		var s := list[randi() % list.size()]
		if Vector2(s.x - x, s.z - z).length() < r:
			return s
	return Vector3.INF


# ---------------------------------------------------------------- the world nudges them

## Something loud at (x, z): everything within `r` startles, the nearer the worse.
func scare(x: float, z: float, r: float, level := 1.0) -> void:
	for p in active:
		if Vector2(p.cx - x, p.cz - z).length() > p.ext + r:
			continue
		for a in p.beasts:
			var d := Vector2(a.x - x, a.z - z).length()
			if d > r:
				continue
			var f := level * (1.0 - (d / r) * 0.6)
			if f > a.fear:
				a.fear = minf(1.2, f)
				a.fx = x
				a.fz = z


## The nearest walker or hull, as `wary` sees it: distance over its menace (in _th_d and _th, read them straight away).
func _threat(a: Beast, wary: float) -> void:
	var best: Threat = null
	var bd := INF
	for t in _threats:
		var d := (Vector2(t.x - a.x, t.z - a.z).length() - t.pad) / t.k
		if d < bd:
			bd = d
			best = t
	if best != null and bd < wary:
		# close enough to spook: the nearer, the more
		var f := 0.55 + (1.0 - bd / wary) * 0.6
		if f > a.fear:
			a.fear = f
			a.fx = best.x
			a.fz = best.z
	_th_d = bd
	_th = best


func _call(a: Beast, kind: String, n := 1, pitch := 1.0) -> void:
	if _calls > 3 or a.hidden or world.sound == null:
		return
	var h := world.heard(Vector3(a.x, a.y, a.z))
	# small beasts carry only a little way
	var reach := minf(1.0, (SIZE[a.k] * a.s) / 1.2) * 90.0 + 25.0
	if h.z > reach:
		return
	var v := h.x * (1.0 - h.z / reach)
	if v < 0.03:
		return
	_calls += 1
	world.sound.wild(kind, v, h.y, n, pitch / maxf(0.5, a.s / SCALE[a.k]))


func _dust(x: float, y: float, z: float, n := 3, size := 0.3) -> void:
	if world.fx == null:
		return
	var c := Color(0.72, 0.62, 0.48, 0.35)
	for i in n:
		world.fx.emit(Vector3(x + (randf() - 0.5) * 0.3, y + 0.05, z + (randf() - 0.5) * 0.3), Vector3((randf() - 0.5) * 0.8, 0.4 + randf() * 0.6, (randf() - 0.5) * 0.8),
				0.8 + randf() * 0.6, size * 0.5, size * 1.6, c, c, -0.1, 2.2, Particles.SMOKE, 0.05)


func _splash(x: float, z: float, size: float) -> void:
	var y := world.water_height(x, z)
	var at := Vector3(x, y, z)
	if world.fx == null:
		return
	world.fx.splash(at, size)
	world.wake.stamp(x, z, 0.6 + size, 0.5 + size * 0.5)
	var h := world.heard(at)
	if h.z < 140.0 and world.sound != null:
		world.sound.splash(h.x * size * 0.6, h.y, h.z)


# ---------------------------------------------------------------- locomotion

## Walks (or runs) toward (tx, tz) at `want`, turning as it can, keeping to
## ground it can stand on (`wade`: shallows too; `swim`: deep water only).
## Returns how far is left.
func _walk(a: Beast, dt: float, wade := false, swim := false, steep := 0.8) -> float:
	var k := a.k
	var dx := a.tx - a.x
	var dz := a.tz - a.z
	var d := sqrt(dx * dx + dz * dz)
	var want := a.want
	if d < 0.2 * a.s + 0.05:
		want = 0.0
	else:
		want = minf(want, d * 2.0 + 0.15)
	if d > 0.05 and want > 0.0:
		var turn := MathX.angle_delta(a.yaw, atan2(dx, dz) + a.side)
		a.yaw += clampf(turn, -TURN[k] * dt, TURN[k] * dt)
		# slow for a sharp turn
		want *= 1.0 - minf(0.7, absf(turn) * 0.35)
	var acc: float = 1.2 + RUN[k] * 1.2 if want > a.speed else 2.0 + RUN[k] * 2.0
	a.speed += clampf(want - a.speed, -acc * dt, acc * dt)
	if a.speed > 0.001:
		var hd := a.yaw - a.side
		var nx := a.x + sin(hd) * a.speed * dt
		var nz := a.z + cos(hd) * a.speed * dt
		var g := _h(a.pop, nx, nz)
		var here := _h(a.pop, a.x, a.z)
		var ok := g < -0.25 if swim else ((g > -0.72 and g < 3.0) if wade else g > 0.06)
		var climb := (g - here) / maxf(1e-3, a.speed * dt)
		if ok and climb < steep:
			a.x = nx
			a.z = nz
		else:
			# blocked: give up on that way
			a.speed *= 0.3
			a.tx = a.x
			a.tz = a.z
	if not a.hold:
		a.gait += (a.speed / (STRIDE_M[k] * a.s) + a.step) * TAU * dt
		a.tgt[STRIDE] = clampf(0.35 + (a.speed / maxf(RUN[k], 0.1)) * 0.75, 0.3, 1.0) * SWING[k] if a.speed > 0.03 or a.step > 0.0 else 0.0
	return d


## On its feet: stand on the ground and lean with the slope.
func _ground(a: Beast) -> void:
	a.y = _h(a.pop, a.x, a.z)
	var l: float = SIZE[a.k] * a.s * 0.45
	var fx := sin(a.yaw) * l
	var fz := cos(a.yaw) * l
	a.slope = clampf(-atan((_h(a.pop, a.x + fx, a.z + fz) - _h(a.pop, a.x - fx, a.z - fz)) / (2.0 * l)) * 0.85, -0.6, 0.6)


## Steers through the air toward (tx, ty, tz) at `speed`. Returns the distance left.
func _fly(a: Beast, dt: float, speed: float, agility := 2.0, floor_h := 2.5) -> float:
	var dx := a.tx - a.x
	var dy := a.ty - a.y
	var dz := a.tz - a.z
	var d := sqrt(dx * dx + dy * dy + dz * dz)
	var sp := minf(speed, d * 1.6 + 0.3)
	var k := minf(1.0, agility * dt)
	var inv := 1.0 / maxf(d, 1e-3)
	a.vx += (dx * inv * sp - a.vx) * k
	a.vy += (dy * inv * sp - a.vy) * k
	a.vz += (dz * inv * sp - a.vz) * k
	a.x += a.vx * dt
	a.y += a.vy * dt
	a.z += a.vz * dt
	var g := maxf(_h(a.pop, a.x, a.z), 0.0) + floor_h
	if a.y < g and d > 3.0:
		a.y = lerpf(a.y, g, MathX.damp(4.0, dt))
		a.vy = maxf(a.vy, 0.0)
	var hs := sqrt(a.vx * a.vx + a.vz * a.vz)
	if hs > 0.2:
		var turn := MathX.angle_delta(a.yaw, atan2(a.vx, a.vz))
		a.yaw += turn * MathX.damp(5.0, dt)
		a.tgt[ROLL] = clampf(-turn * 1.4, -0.9, 0.9)
	else:
		a.tgt[ROLL] = 0.0
	a.tgt[PITCH] = clampf(-atan2(a.vy, maxf(hs, 1.0)) * 0.8, -0.8, 0.9)
	a.speed = hs
	a.slope = 0.0
	return d


## Somewhere to run: `dist` away from the fright, on footing it can take
## ("land", "wade" or "water"), uphill if it likes heights.
func _flee_to(a: Beast, dist: float, how: String, up := 0.0) -> void:
	var base := atan2(a.x - a.fx, a.z - a.fz)
	var best := -INF
	for off: float in [0.0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]:
		var ang := base + off
		var x := a.x + sin(ang) * dist
		var z := a.z + cos(ang) * dist
		var h := _h(a.pop, x, z)
		var mid := _h(a.pop, (a.x + x) * 0.5, (a.z + z) * 0.5)
		var ok := false
		match how:
			"water": ok = h < -0.6
			"wade": ok = h > -0.7 and h < 0.8 and mid > -0.75
			_: ok = h > 0.15 and mid > 0.1
		var score := (10.0 if ok else 0.0) - absf(off) * 2.0 + ((h - a.y) * up if up != 0.0 else 0.0)
		if score > best:
			best = score
			a.tx = x
			a.tz = z


## A point within `r` of home it can stand on (`test` takes the ground's height).
func _wander(a: Beast, r: float, test := Callable()) -> bool:
	for i in 6:
		var ang := randf() * TAU
		var d := randf() * r
		var x := a.home.x + cos(ang) * d
		var z := a.home.z + sin(ang) * d
		var h := _h(a.pop, x, z)
		if (test.call(h) if test.is_valid() else h > 0.3) and not _avoided(x, z):
			a.tx = x
			a.tz = z
			return true
	a.tx = a.home.x
	a.tz = a.home.z
	return false


func _face_to(a: Beast, x: float, z: float, dt: float, rate := 3.0) -> void:
	a.yaw += MathX.angle_delta(a.yaw, atan2(x - a.x, z - a.z)) * MathX.damp(rate, dt)


## Head turn toward (x, z), as far as the neck allows.
func _look_at(a: Beast, x: float, z: float, most := 1.2) -> void:
	a.tgt[HY] = clampf(MathX.angle_delta(a.yaw, atan2(x - a.x, z - a.z)), -most, most)


## Lying down for the night (or a nap in the sun).
func _lie(a: Beast) -> void:
	a.tgt[LIFT] = -REST_DROP[a.k]
	a.tgt[TUCK] = 0.92
	a.tgt[STRIDE] = 0.0
	a.want = 0.0
	a.speed = 0.0


func _reset_pose(a: Beast) -> void:
	var t := a.tgt
	t[HP] = 0.0
	t[HY] = 0.0
	t[SA] = 0.0
	t[SB] = 0.0
	t[TUCK] = 0.0
	t[PITCH] = 0.0
	t[ROLL] = 0.0
	t[LIFT] = 0.0
	t[TAILW] = 0.0
	a.hold = false
	a.step = 0.0
	a.side = 0.0


static func _dist(a: Beast, b: Beast) -> float:
	return Vector2(b.x - a.x, b.z - a.z).length()


# ---------------------------------------------------------------- the beasts

## Goats, deer and boar: a herd that grazes, wanders, rests and bolts together.
func _grazer(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var th := _th
	var th_d := _th_d
	var dark := night > 0.62
	var tgt := a.tgt
	var leader := a.lead
	# the herd takes fright together
	if leader != null and leader.fear > 0.5 and a.fear < leader.fear * 0.9:
		a.fear = leader.fear * 0.9
		a.fx = leader.fx
		a.fz = leader.fz
	if a.fear > 0.5 and a.mode != FLEE and a.mode != CHARGE:
		# the sow stands her ground once (a bluff charge), then they're off
		if k == BOAR and a.adult and th != null and th_d < 7.0 and a.u <= 0.0 and a.fear < 1.0:
			a.mode = CHARGE
			a.t = 1.4
			a.u = 25.0
			_call(a, "grunt", 3, 0.85)
		else:
			a.mode = FLEE
			a.t = randf_range(3.5, 6.0)
			_reset_pose(a)
			_flee_to(a, 40.0 if k == DEER else 28.0, "land", 2.0 if k == GOAT else 0.0)
			a.want = RUN[k] * (1.0 if a.adult else 0.95)
			if k == GOAT:
				_call(a, "bleat" if a.adult else "kid")
			elif k == DEER and a.lead == null:
				_call(a, "snort")
			elif k == BOAR:
				_call(a, "squeal", 1 if a.adult else 2, 0.8 if a.adult else 1.3)
	elif th != null and th_d < WARY[k] * 1.9 and (a.mode == IDLE or a.mode == WALKING or a.mode == REST or a.mode == LOOK) and a.fear < 0.3:
		a.mode = ALERT
		a.t = randf_range(2.5, 5.0)
		a.fx = th.x
		a.fz = th.z
		if k == DEER and randf() < 0.6:
			_call(a, "snort")
	a.u -= dt
	a.t -= dt
	a.fear *= 1.0 - MathX.damp(0.25 if a.mode == FLEE else 0.6, dt)
	var tm := time + a.seed
	match a.mode:
		IDLE:
			# graze: head down, cropping, a step now and then
			_reset_pose(a)
			tgt[HP] = 1.15 + sin(tm * 9.0) * 0.12 if k == BOAR else 1.7 + sin(tm * 6.5) * 0.05
			tgt[HY] = sin(tm * 0.7) * 0.25
			tgt[PITCH] = 0.05 if k == BOAR else 0.12
			if k == DEER:
				tgt[SA] = 0.5 if sin(tm * 0.9) > 0.92 else 0.0
			tgt[TAILW] = sin(tm * 24.0) * 0.5 if sin(tm * 3.1) > 0.8 else 0.0
			a.clock -= dt
			if a.clock < 0.0:
				a.clock = randf_range(1.5, 4.0)
				a.tx = a.x + sin(a.yaw + randf_range(-0.6, 0.6)) * randf_range(0.3, 1.0)
				a.tz = a.z + cos(a.yaw + randf_range(-0.6, 0.6)) * randf_range(0.3, 1.0)
				a.want = WALK[k] * 0.4
				# the sow's snout turns the ground over
				if k == BOAR:
					_dust(a.x + sin(a.yaw) * 0.8 * a.s, a.y, a.z + cos(a.yaw) * 0.8 * a.s, 3, 0.25 * a.s)
					if randf() < 0.4:
						_call(a, "grunt", 1 + randi() % 2, 1.0 if a.adult else 1.5)
				elif randf() < 0.08:
					_call(a, ("bleat" if a.adult else "kid") if k == GOAT else "snort")
			_walk(a, dt, false, false, 3.0 if k == GOAT else 0.75)
			# deer lift their heads to look round every so often
			if k == DEER and sin(tm * 0.37) > 0.75:
				tgt[HP] = -0.15
				tgt[HY] = sin(tm * 0.9) * 0.8
				tgt[SA] = sin(tm * 4.3) * 0.4
			if a.t < 0.0:
				_grazer_next(a, dark)
		WALKING:
			_reset_pose(a)
			tgt[HP] = 0.45 if k == BOAR else 0.25
			if leader != null:
				_keep_up(a, leader)
			if _walk(a, dt, false, false, 3.0 if k == GOAT else 0.75) < 0.4 or a.t < 0.0:
				a.mode = IDLE
				a.t = randf_range(4.0, 12.0)
		LOOK:
			# a billy up on a high rock, surveying his kingdom
			_reset_pose(a)
			if _walk(a, dt, false, false, 3.0) < 0.5:
				tgt[HP] = -0.2
				tgt[HY] = sin(tm * 0.4) * 1.1
				if randf() < dt * 0.05:
					_call(a, "bleat")
			else:
				tgt[HP] = 0.2
			if a.t < 0.0:
				a.mode = IDLE
				a.t = randf_range(4.0, 10.0)
		PLAY:
			# kids frisk: little leaps and twists
			_reset_pose(a)
			a.clock -= dt
			if a.clock < 0.0 and a.vy == 0.0:
				a.clock = randf_range(0.5, 1.3)
				a.vy = randf_range(1.6, 2.6)
				a.yaw += randf_range(-1.6, 1.6)
				a.tx = a.x + sin(a.yaw) * randf_range(0.5, 2.0)
				a.tz = a.z + cos(a.yaw) * randf_range(0.5, 2.0)
				a.want = RUN[k] * 0.35
			_walk(a, dt, false, false, 3.0)
			if a.t < 0.0:
				a.mode = IDLE
				a.t = randf_range(3.0, 8.0)
		DUEL:
			# two billies rear and clash horns
			var m := a.mate
			if m == null or m.mode != DUEL:
				a.mode = IDLE
				a.t = 3.0
			else:
				_reset_pose(a)
				var d := _dist(a, m)
				_face_to(a, m.x, m.z, dt, 5.0)
				if d > 1.7 * a.s:
					a.tx = m.x
					a.tz = m.z
					a.want = WALK[k]
					_walk(a, dt, false, false, 3.0)
				else:
					a.speed = 0.0
					tgt[STRIDE] = 0.0
					# rear, hold, then come down hard
					var ph := fmod(a.u, 2.2) / 2.2
					a.u += dt * 2.0
					if ph < 0.45:
						tgt[PITCH] = -0.75
						tgt[HP] = 0.5
						tgt[TUCK] = 0.3
					else:
						tgt[PITCH] = 0.18
						tgt[HP] = 1.05
						a.quick = 3.0
					var was := fmod(a.u - dt * 2.0, 2.2) / 2.2
					if was < 0.6 and ph >= 0.6 and a.seed < m.seed:
						_call(a, "clack")
						_dust((a.x + m.x) * 0.5, a.y, (a.z + m.z) * 0.5, 4, 0.3)
				if a.t < 0.0:
					a.mode = IDLE
					a.t = randf_range(5.0, 10.0)
					m.mode = IDLE
					m.t = randf_range(5.0, 10.0)
		ALERT:
			# stare at it, head high (a deer flags its tail, a goat stamps)
			_reset_pose(a)
			_face_to(a, a.fx, a.fz, dt, 2.5)
			tgt[HP] = -0.3
			tgt[HY] = clampf(MathX.angle_delta(a.yaw, atan2(a.fx - a.x, a.fz - a.z)), -0.8, 0.8)
			if k == DEER:
				tgt[SA] = 0.35
				tgt[SB] = 1.0
			a.speed = 0.0
			tgt[STRIDE] = 0.0
			if a.t < 0.0:
				a.mode = IDLE
				a.t = randf_range(2.0, 5.0)
		CHARGE:
			# head down, straight at them... and pull up short with a snort
			_reset_pose(a)
			tgt[HP] = 0.55
			if th != null:
				a.tx = th.x
				a.tz = th.z
			a.want = RUN[k] * 1.1
			var d := _walk(a, dt)
			if d < 2.4 * a.s or a.t < 0.0:
				_call(a, "snort", 2, 0.7)
				_dust(a.x, a.y, a.z, 5, 0.35)
				a.mode = FLEE
				a.t = randf_range(4.0, 6.0)
				a.fear = 1.0
				if th != null:
					a.fx = th.x
					a.fz = th.z
				_flee_to(a, 30.0, "land")
				a.want = RUN[k]
		FLEE:
			_reset_pose(a)
			if leader != null and leader.mode == FLEE:
				_keep_up(a, leader, RUN[k] * 1.15)
			var d := _walk(a, dt, false, false, 3.0 if k == GOAT else 0.9)
			var kk: float = a.speed / RUN[k]
			if k == DEER:
				# stotting: bounds high off all four feet, the white flag up
				if a.vy == 0.0 and kk > 0.4:
					a.vy = randf_range(2.6, 3.3)
				tgt[TUCK] = 0.55 if a.cur[LIFT] > 0.15 else 0.0
				tgt[SB] = 1.0
				tgt[HP] = -0.25
			elif k == GOAT:
				if a.vy == 0.0 and kk > 0.5 and randf() < dt * 2.5:
					a.vy = randf_range(1.8, 2.6)
				tgt[HP] = -0.1
			else:
				tgt[HP] = 0.35
				tgt[TAILW] = sin(tm * 18.0) * 0.3
				tgt[SB] = 0.8
			if d < 1.0 or a.t < 0.0:
				if a.fear > 0.6:
					_flee_to(a, 20.0, "land", 2.0 if k == GOAT else 0.0)
				else:
					a.mode = ALERT
					a.t = randf_range(2.0, 4.0)
				a.t = maxf(a.t, 2.0)
		REST:
			_reset_pose(a)
			_lie(a)
			tgt[HP] = 0.25 + sin(tm * 0.2) * 0.1
			tgt[HY] = sin(tm * 0.13) * 0.5
			if a.t < 0.0 and not dark:
				a.mode = IDLE
				a.t = randf_range(3.0, 8.0)
			elif a.t < 0.0:
				a.t = randf_range(10.0, 30.0)
	# jumps and bounds: a little ballistic hop on top of the walk
	_hop(a, dt)
	if a.mode != REST and a.mode != DUEL and tgt[LIFT] < 0.0:
		tgt[LIFT] = 0.0
	_ground(a)


## Little ballistic leaps, carried in the LIFT channel.
func _hop(a: Beast, dt: float) -> void:
	if a.vy == 0.0:
		return
	a.jump += a.vy * dt
	a.vy -= 9.8 * dt
	if a.jump <= 0.0:
		a.jump = 0.0
		a.vy = 0.0
	a.cur[LIFT] = a.jump
	a.tgt[LIFT] = a.jump


func _grazer_next(a: Beast, dark: bool) -> void:
	var k := a.k
	if dark and randf() < 0.8:
		a.mode = REST
		a.t = randf_range(15.0, 40.0)
		return
	var leader := a.lead
	if leader != null and _dist(a, leader) > 7.0 * a.s:
		a.mode = WALKING
		a.t = 12.0
		_keep_up(a, leader)
		a.want = WALK[k] * 1.5
		return
	var r := randf()
	if k == GOAT and not a.adult and r < 0.4:
		a.mode = PLAY
		a.t = randf_range(3.0, 6.0)
		return
	if k == GOAT and a.adult and r < 0.14:
		# a high place to stand on
		var best := Vector3.INF
		for i in 8:
			var s := _spot_near(a.pop.crags, a.x, a.z, 18.0)
			if s != Vector3.INF and (best == Vector3.INF or s.y > best.y):
				best = s
		if best != Vector3.INF:
			a.mode = LOOK
			a.t = randf_range(10.0, 18.0)
			a.tx = best.x
			a.tz = best.z
			a.want = WALK[k] * 1.2
			return
	if k == GOAT and a.adult and r < 0.24:
		# pick a rival
		for b in a.pop.beasts:
			if b != a and b.k == GOAT and b.adult and b.mode == IDLE and _dist(a, b) < 9.0:
				a.mode = DUEL
				b.mode = DUEL
				a.mate = b
				b.mate = a
				a.t = randf_range(5.0, 8.0)
				b.t = a.t
				a.u = 0.0
				b.u = 0.1
				return
	if r < 0.55:
		a.mode = WALKING
		a.t = 15.0
		if leader != null:
			_keep_up(a, leader)
		else:
			_wander(a, 24.0 if k == GOAT else 30.0, func(h: float) -> bool: return h > 1.2)
		a.want = WALK[k]
		return
	a.t = randf_range(4.0, 12.0)


## Keep with the leader (piglets in a file behind their mother, the rest round the leader).
func _keep_up(a: Beast, lead: Beast, speed := 0.0) -> void:
	var k := a.k
	if k == BOAR:
		a.tx = lead.x - sin(lead.yaw) * 0.75 * lead.s
		a.tz = lead.z - cos(lead.yaw) * 0.75 * lead.s
	else:
		if a.ox == 0.0 and a.oz == 0.0:
			var ang := randf() * TAU
			a.ox = cos(ang) * randf_range(2.0, 5.0)
			a.oz = sin(ang) * randf_range(2.0, 5.0)
		a.tx = lead.x + a.ox
		a.tz = lead.z + a.oz
	var d := Vector2(a.tx - a.x, a.tz - a.z).length()
	a.want = speed if speed > 0.0 else maxf(lead.speed * 1.05, WALK[k] * 1.4 if d > 3.0 else WALK[k] * 0.6)
	a.want = minf(a.want, RUN[k] * 1.15)


## Capuchins: forage on the ground, sit and groom, swarm up the trees, chatter at intruders.
func _monkey(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var th := _th
	var th_d := _th_d
	var tgt := a.tgt
	var tm := time + a.seed
	var dark := night > 0.62
	a.t -= dt
	a.fear *= 1.0 - MathX.damp(0.4, dt)
	var up := a.mode == PERCH or a.mode == CLIMB
	if a.fear > 0.5 and not up and a.mode != FLEE:
		a.mode = FLEE
		a.tree = _near_tree(a.pop, a.x, a.z, 40.0)
		_call(a, "screech", 2)
		a.t = 8.0
	# a captain who keeps still (or walks slowly) is worth a closer look
	if th != null and not up and a.mode == IDLE and th_d < WARY[k] * 3.0 and th_d > WARY[k] * 1.2 and randf() < dt * 0.3:
		a.mode = CURIOUS
		a.t = randf_range(6.0, 12.0)
	match a.mode:
		IDLE, WALKING:
			_reset_pose(a)
			tgt[HP] = 0.6 + sin(tm * 2.1) * 0.2
			tgt[TAILW] = sin(tm * 0.8) * 0.3
			tgt[SB] = 0.4
			a.want = WALK[k] if a.mode == WALKING else 0.0
			if _walk(a, dt, false, false, 1.2) < 0.3 and a.mode == WALKING:
				a.mode = IDLE
				a.t = randf_range(1.0, 3.0)
			if a.t < 0.0:
				_monkey_next(a, dark)
			_ground(a)
		SIT:
			# sat up on its haunches, nibbling, looking about
			_reset_pose(a)
			a.speed = 0.0
			tgt[STRIDE] = 0.25
			a.gait = sin(tm * 3.0) * 0.8 + 1.6
			tgt[PITCH] = -1.05
			tgt[HP] = 0.85 + sin(tm * 1.7) * 0.15
			tgt[HY] = sin(tm * 0.6) * 1.0
			tgt[SB] = -0.6
			if a.mate != null and a.mate.mode == SIT:
				# grooming a friend
				_face_to(a, a.mate.x, a.mate.z, dt)
				tgt[HP] = 1.3 + sin(tm * 5.0) * 0.12
				tgt[HY] = 0.0
			if th != null and th_d < WARY[k] * 2.5:
				_look_at(a, th.x, th.z, 1.4)
			_ground(a)
			if a.t < 0.0:
				a.mate = null
				_monkey_next(a, dark)
		CURIOUS:
			# edges up for a look, sits and watches the visitor
			_reset_pose(a)
			if th == null:
				a.mode = IDLE
			else:
				var d := Vector2(th.x - a.x, th.z - a.z).length()
				if d > 5.5:
					a.tx = th.x
					a.tz = th.z
					a.want = WALK[k]
					_walk(a, dt, false, false, 1.2)
					tgt[HP] = 0.3
				else:
					a.speed = 0.0
					tgt[STRIDE] = 0.0
					tgt[PITCH] = -1.05
					tgt[HP] = 0.9
					_face_to(a, th.x, th.z, dt, 2.0)
					tgt[HY] = sin(tm * 0.9) * 0.3
					if randf() < dt * 0.25:
						_call(a, "chatter", 3)
				_ground(a)
				if a.t < 0.0:
					a.mode = WALKING
					_wander(a, 15.0)
					a.t = 10.0
		FLEE:
			# scamper for the nearest tree
			_reset_pose(a)
			var tr := a.tree
			if tr == null:
				_flee_to(a, 20.0, "land")
				a.want = RUN[k]
				_walk(a, dt, false, false, 1.5)
				_ground(a)
				if a.t < 0.0:
					a.mode = IDLE
					a.t = 2.0
			else:
				a.tx = tr.x
				a.tz = tr.z
				a.want = RUN[k]
				tgt[HP] = 0.2
				tgt[SB] = 0.6
				if _walk(a, dt, false, false, 2.0) < 0.5:
					a.mode = CLIMB
					a.climb_t = 0.0
					a.air = true
				_ground(a)
		CLIMB, DOWN:
			# hand over hand up (or down) the trunk
			_reset_pose(a)
			var tr := a.tree
			var length := (tr.top.y - tr.y if tr.palm else tr.limb.y - tr.y) + 1.0
			var rate: float = (RUN[k] * 0.7 if a.fear > 0.4 else WALK[k] * 1.4) / length
			a.climb_t = clampf(a.climb_t + (rate if a.mode == CLIMB else -rate) * dt, 0.0, 1.0)
			var tp := tr.at(a.climb_t)
			# cling to the trunk's side, belly to the bark
			var off := 0.16 * a.s
			a.x = tp.x - sin(a.yaw) * off
			a.z = tp.z - cos(a.yaw) * off
			a.y = tp.y
			a.speed = WALK[k]
			a.gait += dt * 6.0
			tgt[STRIDE] = SWING[k]
			# (it comes down tail first, looking down past its feet)
			tgt[PITCH] = -1.45
			tgt[HP] = 1.0 if a.mode == CLIMB else 1.35
			tgt[SB] = -0.8
			a.slope = 0.0
			if a.mode == CLIMB and a.climb_t >= 1.0:
				a.mode = PERCH
				a.t = randf_range(15.0, 30.0) if a.fear > 0.3 else randf_range(10.0, 40.0)
				if a.fear > 0.3:
					_call(a, "chatter", 4, 1.1)
			elif a.mode == DOWN and a.climb_t <= 0.0:
				a.mode = IDLE
				a.air = false
				a.t = randf_range(2.0, 5.0)
				a.x = tr.x + sin(a.yaw) * 0.5
				a.z = tr.z + cos(a.yaw) * 0.5
		PERCH:
			# sat on a limb (or among the fronds), tail hanging, scolding anyone below
			_reset_pose(a)
			var tr := a.tree
			var p := tr.top if tr.palm else tr.limb
			var e := MathX.damp(4.0, dt)
			a.x = lerpf(a.x, p.x, e)
			a.y = lerpf(a.y, p.y, e)
			a.z = lerpf(a.z, p.z, e)
			a.speed = 0.0
			if not tr.palm:
				_face_to(a, p.x * 2.0 - tr.x, p.z * 2.0 - tr.z, dt, 2.0)
			tgt[STRIDE] = 0.0
			tgt[PITCH] = -1.0
			tgt[HP] = 0.9 + sin(tm * 1.3) * 0.2
			tgt[HY] = sin(tm * 0.5) * 1.1
			tgt[SB] = -1.3
			tgt[TAILW] = sin(tm * 0.7) * 0.3
			a.slope = 0.0
			if th != null and th_d < WARY[k] * 3.0:
				# a scolding: bobbing and shrieking at them
				_look_at(a, th.x, th.z, 1.4)
				tgt[HP] = 1.2
				if a.fear > 0.2:
					tgt[LIFT] = absf(sin(tm * 9.0)) * 0.05
					if randf() < dt * 0.6:
						_call(a, "chatter", 3 + randi() % 3, 1.1)
			if a.t < 0.0 and a.fear < 0.25 and not dark:
				# across to a neighbouring tree, or back down
				var next := _near_tree(a.pop, tr.x, tr.z, 9.0, tr) if randf() < 0.35 else null
				if next != null:
					a.mode = PLAY
					a.tree = next
					var q := next.top if next.palm else next.limb
					a.tx = q.x
					a.ty = q.y
					a.tz = q.z
					var d := Vector2(q.x - a.x, q.z - a.z).length()
					a.u = d / 6.0
					var tt := maxf(a.u, 0.1)
					a.vy = ((q.y - a.y) + 0.5 * 9.8 * a.u * a.u) / tt
					a.vx = (q.x - a.x) / tt
					a.vz = (q.z - a.z) / tt
					a.yaw = atan2(a.vx, a.vz)
					_call(a, "chatter", 2)
				else:
					a.mode = DOWN
			elif a.t < 0.0:
				a.t = randf_range(10.0, 30.0)
		PLAY:
			# the leap from tree to tree
			a.x += a.vx * dt
			a.y += a.vy * dt
			a.z += a.vz * dt
			a.vy -= 9.8 * dt
			a.u -= dt
			tgt[PITCH] = -0.3
			tgt[TUCK] = 0.6
			tgt[SB] = 0.6
			tgt[STRIDE] = 0.0
			if a.u <= 0.0:
				a.mode = PERCH
				a.t = randf_range(6.0, 20.0)
				a.vx = 0.0
				a.vy = 0.0
				a.vz = 0.0


func _monkey_next(a: Beast, dark: bool) -> void:
	var r := randf()
	if dark or r < 0.22:
		var tr := _near_tree(a.pop, a.x, a.z, 25.0)
		if tr != null:
			a.tree = tr
			a.mode = FLEE
			a.fear = 0.0
			a.t = 20.0
			return
	if r < 0.5:
		a.mode = SIT
		a.t = randf_range(4.0, 12.0)
		# a friend to groom
		if randf() < 0.4:
			for b in a.pop.beasts:
				if b != a and b.k == MONKEY and b.mode == IDLE and _dist(a, b) < 4.0:
					b.mode = SIT
					b.t = a.t
					a.mate = b
					b.mate = a
					b.yaw = atan2(a.x - b.x, a.z - b.z)
					break
		return
	a.mode = WALKING
	a.t = 10.0
	var lead := a.lead
	if lead != null and _dist(a, lead) > 10.0:
		a.tx = lead.x + randf_range(-3.0, 3.0)
		a.tz = lead.z + randf_range(-3.0, 3.0)
	else:
		_wander(a, 14.0)


## Beats its wings for flight; `amp` and `hz` per species.
func _wings(a: Beast, amp: float, hz: float) -> void:
	a.tgt[FOLD] = 0.0
	a.tgt[FLAP] = amp
	a.flap_hz = hz
	a.tgt[TUCK] = 1.0


## Folds up on landing.
func _settle_wings(a: Beast) -> void:
	a.tgt[FOLD] = 1.0
	a.tgt[FLAP] = 0.0
	a.flap_hz = 0.5
	a.tgt[TUCK] = 0.0
	a.tgt[ROLL] = 0.0


## Glides in to (x, y, z), flaring at the end. Returns true on touchdown.
func _landing(a: Beast, dt: float, x: float, y: float, z: float, speed: float, hz: float) -> bool:
	var dh := Vector2(x - a.x, z - a.z).length()
	a.tx = x
	a.tz = z
	a.ty = y + (minf(dh * 0.3, 10.0) if dh > 6.0 else dh * 0.15)
	_fly(a, dt, maxf(1.2, minf(speed, dh * 0.9)), 2.5, 2.0 if dh > 10.0 else -10.0)
	var flare := MathX.smooth(7.0, 1.5, dh)
	_wings(a, 0.35 + flare * 0.5, hz * (1.0 + flare * 0.4))
	a.tgt[TUCK] = 1.0 - MathX.smooth(6.0, 2.0, dh)
	a.tgt[PITCH] -= flare * 0.5
	if dh < 0.35 and absf(a.y - y) < 0.35:
		a.x = x
		a.y = y
		a.z = z
		a.vx = 0.0
		a.vy = 0.0
		a.vz = 0.0
		_settle_wings(a)
		return true
	return false


func _take_off(a: Beast) -> void:
	a.air = true
	a.wet = false
	a.vy = 2.5
	a.vx = sin(a.yaw) * 2.0
	a.vz = cos(a.yaw) * 2.0


func _macaw(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var th := _th
	var th_d := _th_d
	var tgt := a.tgt
	var tm := time + a.seed
	var dark := night > 0.6
	a.t -= dt
	a.fear *= 1.0 - MathX.damp(0.5, dt)
	if a.fear > 0.5 and a.mode == PERCH and not a.pop.trees.is_empty():
		# bursts out of the crown, screaming
		a.mode = FLY
		a.tree = _far_tree(a)
		a.t = 30.0
		_take_off(a)
		_call(a, "squawk", 2 + randi() % 2)
		if a.mate != null and a.mate.mode == PERCH:
			a.mate.mode = FLY
			a.mate.tree = a.tree
			_take_off(a.mate)
	match a.mode:
		PERCH:
			_reset_pose(a)
			_settle_wings(a)
			if a.tree != null:
				a.y = lerpf(a.y, a.tree.top.y, MathX.damp(5.0, dt))
			tgt[PITCH] = -0.55
			tgt[SB] = -0.3
			a.speed = 0.0
			tgt[STRIDE] = 0.0
			# preening, head-bobbing, looking about
			var mood := sin(tm * 0.31)
			if dark:
				tgt[HY] = 2.4
				tgt[HP] = 0.3
			elif mood > 0.6:
				tgt[HY] = 1.6 * signf(sin(tm * 0.11))
				tgt[HP] = 1.1 + sin(tm * 6.0) * 0.15
			else:
				tgt[HY] = sin(tm * 0.8) * 1.2
				tgt[HP] = 0.55 + (absf(sin(tm * 7.0)) * 0.35 if mood < -0.7 else 0.0)
			if th != null and th_d < WARY[k] * 2.0:
				_look_at(a, th.x, th.z, 1.5)
			if not dark and randf() < dt * 0.05:
				_call(a, "squawk", 1 + randi() % 2)
			if a.t < 0.0 and not dark and (a.mate == null or a.seed < a.mate.seed):
				# off across the island, the pair together
				a.t = randf_range(14.0, 40.0)
				if randf() < 0.7 and a.pop.trees.size() > 1:
					a.mode = FLY
					a.tree = _far_tree(a)
					_take_off(a)
					if randf() < 0.6:
						_call(a, "squawk", 2)
					if a.mate != null and a.mate.mode == PERCH:
						a.mate.mode = FLY
						a.mate.tree = a.tree
						a.mate.t = 30.0
						_take_off(a.mate)
			elif a.t < 0.0:
				a.t = randf_range(10.0, 30.0)
		FLY:
			_reset_pose(a)
			var tr := a.tree
			if tr == null:
				a.mode = PERCH
				return
			# the mate flies at the leader's shoulder
			var m := a.mate
			var ox := 0.0
			var oz := 0.0
			var wing := m != null and m.mode == FLY and a.seed > m.seed
			if wing:
				ox = cos(m.yaw) * 1.4
				oz = -sin(m.yaw) * 1.4
			var tx := tr.top.x + ox * 0.3
			var tz := tr.top.z + oz * 0.3
			var dh := Vector2(tx - a.x, tz - a.z).length()
			if dh > 14.0:
				a.tx = m.x + ox if wing else tx
				a.tz = m.z + oz if wing else tz
				a.ty = maxf(tr.top.y, _h(a.pop, a.x, a.z) + 8.0) + 6.0
				_fly(a, dt, 11.0, 2.2, 6.0)
				_wings(a, 0.75, 4.2)
				tgt[SB] = 0.2
			elif _landing(a, dt, tx, tr.top.y, tz, 9.0, 4.2):
				a.mode = PERCH
				a.t = randf_range(15.0, 50.0)
			if a.t < -30.0:
				a.mode = PERCH
				a.t = 5.0


## A tree well across the island.
func _far_tree(a: Beast) -> Perch:
	var best: Perch = a.tree if a.tree != null else a.pop.trees[0]
	var bd := -1.0
	for i in 6:
		var t: Perch = a.pop.trees[randi() % a.pop.trees.size()]
		var d := Vector2(t.x - a.x, t.z - a.z).length()
		var score := d if d < 120.0 else 240.0 - d
		if score > bd:
			bd = score
			best = t
	return best


## Pelicans and boobies: a colony on the rocks, fishing trips out round the island.
func _seabird(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var th := _th
	var th_d := _th_d
	var tgt := a.tgt
	var tm := time + a.seed
	var pel := k == PELICAN
	var dark := night > 0.62
	var ring := a.pop.ring
	a.t -= dt
	a.fear *= 1.0 - MathX.damp(0.5, dt)
	if a.fear > 0.5 and (a.mode == IDLE or a.mode == DANCE or a.mode == SWIM or a.mode == WALKING):
		a.mode = FLY
		a.u = 0.0
		a.t = randf_range(20.0, 40.0)
		a.clock = randi() % maxi(1, ring.size())
		_take_off(a)
		if not pel:
			_call(a, "whistle", 2)
	match a.mode:
		IDLE, WALKING:
			_reset_pose(a)
			_settle_wings(a)
			tgt[HP] = 0.15 + sin(tm * 0.5) * 0.15
			tgt[HY] = sin(tm * 0.37) * 0.9
			var mood := sin(tm * 0.23 + a.seed)
			if pel and mood > 0.85:
				# the pouch stretch: bill to the sky, gape wide
				tgt[HP] = -0.5
				tgt[SA] = 0.7
			elif mood < -0.75:
				# preening under a wing
				tgt[HY] = 1.9 * signf(sin(a.seed))
				tgt[HP] = 1.3 + sin(tm * 5.0) * 0.2
			if dark:
				tgt[HY] = 2.5
				tgt[HP] = 0.25
			a.want = WALK[k] if a.mode == WALKING else 0.0
			if _walk(a, dt, false, false, 2.0) < 0.2 and a.mode == WALKING:
				a.mode = IDLE
			# a waddle's sway
			tgt[ROLL] = sin(a.gait) * 0.12 if a.speed > 0.05 else 0.0
			_ground(a)
			if th != null and th_d < WARY[k] * 2.0:
				_look_at(a, th.x, th.z)
			if a.t < 0.0:
				var r := randf()
				a.t = randf_range(6.0, 16.0)
				if dark:
					return
				if not pel and r < 0.3:
					# a male's courtship: the slow high-stepping of those famous blue feet
					for b in a.pop.beasts:
						if b != a and b.k == BOOBY and b.mode == IDLE and _dist(a, b) < 4.0:
							a.mode = DANCE
							a.mate = b
							a.t = randf_range(6.0, 10.0)
							_call(a, "whistle", 2)
							return
				if not ring.is_empty() and r < (0.55 if pel else 0.5):
					a.mode = FLY
					a.u = 0.0
					a.t = randf_range(25.0, 50.0)
					a.clock = randi() % ring.size()
					_take_off(a)
					# the others in the group follow the first one out
					if pel:
						var n := 0
						for b in a.pop.beasts:
							if b != a and b.k == PELICAN and b.mode == IDLE and n < 4 and _dist(a, b) < 20.0:
								b.mode = FOLLOW
								b.lead = a
								n += 1
								b.u = n
								b.t = a.t
								_take_off(b)
				elif r < 0.75:
					a.mode = WALKING
					_wander(a, 6.0, func(h: float) -> bool: return h > 0.1)
		DANCE:
			_reset_pose(a)
			var m := a.mate
			if m != null:
				_face_to(a, m.x, m.z, dt, 3.0)
			# lift one bright foot, then the other, slowly and with great ceremony; then point to the sky
			var ph := fposmod(a.t, 4.0) / 4.0
			a.speed = 0.0
			if ph > 0.35:
				a.step = 0.9
				tgt[STRIDE] = 1.1
				tgt[HP] = 0.35
				tgt[LIFT] = absf(sin(a.gait)) * 0.03
			else:
				a.step = 0.0
				tgt[STRIDE] = 0.0
				tgt[HP] = -0.9
				tgt[SB] = 0.85
				tgt[FOLD] = 0.35
				if ph > 0.3 and randf() < dt * 2.0:
					_call(a, "whistle", 1, 1.2)
			a.gait += a.step * TAU * dt
			_ground(a)
			if a.t < 0.0:
				a.mode = IDLE
				a.t = randf_range(4.0, 10.0)
		FLY, FOLLOW:
			# out round the island, low over the water; pelicans in a file behind their leader
			_reset_pose(a)
			var lead: Beast = a.lead if a.mode == FOLLOW else null
			if a.mode == FOLLOW and (lead == null or (lead.mode != FLY and lead.mode != DIVE)):
				a.mode = FLY
				lead = null
				a.clock = randi() % maxi(1, ring.size())
			if ring.is_empty():
				a.mode = LAND
				return
			var alt := 4.0 if pel else 9.0
			if lead != null:
				# echelon: each a few lengths behind and to one side of the bird ahead
				var back := 3.2 * a.u
				a.tx = lead.x - sin(lead.yaw) * back + cos(lead.yaw) * 1.2 * a.u
				a.tz = lead.z - cos(lead.yaw) * back - sin(lead.yaw) * 1.2 * a.u
				a.ty = maxf(a.y, 4.0) if lead.mode == DIVE else lead.y
				_fly(a, dt, 12.0, 2.2, 1.5)
				# the wingbeats roll back down the line
				a.flap_ph = lead.flap_ph - a.u * 0.9
			else:
				var p := ring[int(a.clock) % ring.size()]
				a.tx = p.x
				a.tz = p.z
				a.ty = alt + sin(tm * 0.4) * 1.5
				if _fly(a, dt, 9.0 if pel else 11.0, 1.4, 1.5) < 14.0:
					a.clock += 1.0
			# mostly gliding, with steady bursts of beats
			var beat := sin(tm * 0.6) > -0.2
			_wings(a, (0.5 if pel else 0.65) if beat else 0.08, 2.2 if pel else 3.6)
			if lead != null:
				a.flap_hz = lead.flap_hz
			# spotted a fish
			if lead == null and randf() < dt * (0.06 if pel else 0.09) and not dark:
				a.mode = DIVE
				a.u = 0.0
				a.tx = a.x + sin(a.yaw) * 8.0
				a.tz = a.z + cos(a.yaw) * 8.0
			if a.t < 0.0 or dark:
				a.mode = LAND
		DIVE:
			# climb, roll over and plunge, wings swept back like an arrow
			_reset_pose(a)
			a.u += dt
			var top := 9.0 if pel else 15.0
			if a.u < 1.4:
				a.ty = top
				_fly(a, dt, 8.0, 2.5, 1.0)
				_wings(a, 0.5, 2.4 if pel else 3.8)
			else:
				a.vy -= 22.0 * dt
				a.vx *= 1.0 - MathX.damp(0.8, dt)
				a.vz *= 1.0 - MathX.damp(0.8, dt)
				a.x += a.vx * dt
				a.y += a.vy * dt
				a.z += a.vz * dt
				tgt[FOLD] = 0.75 if pel else 0.95
				tgt[FLAP] = 0.0
				tgt[PITCH] = 1.35
				tgt[TUCK] = 1.0
				a.quick = 2.0
				var wy := world.water_height(a.x, a.z)
				if a.y < wy + 0.3:
					_splash(a.x, a.z, 0.8 if pel else 0.55)
					a.mode = SWIM
					a.wet = true
					a.air = false
					a.vx = 0.0
					a.vy = 0.0
					a.vz = 0.0
					a.t = randf_range(4.0, 9.0)
					a.y = wy - 0.5
					a.u = 0.0
		SWIM:
			# bob on the swell, bill down, then toss the catch back
			_reset_pose(a)
			_settle_wings(a)
			a.u += dt
			var wy := world.water_height(a.x, a.z)
			a.y = lerpf(a.y, wy - 0.38 * a.s, MathX.damp(3.0, dt))
			tgt[HP] = 0.9 if a.u < 1.5 else (-0.9 if a.u < 2.2 else 0.1)
			tgt[SA] = 0.5 if a.u < 1.5 and pel else 0.0
			tgt[PITCH] = 0.05
			tgt[TUCK] = 1.0
			a.slope = 0.0
			if a.t < 0.0:
				a.mode = FLY
				a.t = randf_range(10.0, 25.0)
				_take_off(a)
				_splash(a.x, a.z, 0.25)
		LAND:
			_reset_pose(a)
			if _landing(a, dt, a.home.x, maxf(a.home.y, _h(a.pop, a.home.x, a.home.z)), a.home.z, 8.0 if pel else 10.0, 2.2 if pel else 3.6):
				a.mode = IDLE
				a.air = false
				a.t = randf_range(10.0, 30.0)


func _flamingo(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var tgt := a.tgt
	var tm := time + a.seed
	var lead := a.lead
	var dark := night > 0.62
	a.t -= dt
	a.fear *= 1.0 - MathX.damp(0.3, dt)
	# the whole flock goes when one does
	if lead != null and lead.fear > 0.5 and a.fear < lead.fear * 0.95:
		a.fear = lead.fear * 0.95
		a.fx = lead.fx
		a.fz = lead.fz
	var grounded := a.mode == IDLE or a.mode == WALKING or a.mode == REST or a.mode == ALERT or a.mode == MARCH
	if a.fear > 0.75 and grounded:
		# run across the water, wings going, and lift off
		a.mode = TAKEOFF
		a.u = 0.0
		_reset_pose(a)
		_flee_to(a, 50.0, "wade")
		a.want = RUN[k]
		if randf() < 0.5:
			_call(a, "honk", 2 + randi() % 2)
	elif a.fear > 0.4 and grounded and a.mode != ALERT:
		a.mode = ALERT
		a.t = randf_range(3.0, 6.0)
		_flee_to(a, 10.0, "wade")
		if randf() < 0.3:
			_call(a, "honk", 1)
	# the flock's leader now and then starts the march: the famous massed display
	if lead == null and a.mode == IDLE and not dark and randf() < dt * 0.012:
		var dir := randf() * TAU
		for b in a.pop.beasts:
			if b.k == FLAMINGO and (b == a or b.lead == a) and b.mode == IDLE:
				b.mode = MARCH
				b.t = randf_range(9.0, 14.0)
				b.u = dir
		_call(a, "honk", 4)
	match a.mode:
		IDLE, WALKING:
			# feeding: head upside down in the water, sweeping side to side, stamping the mud
			_reset_pose(a)
			_settle_wings(a)
			tgt[HP] = 2.75
			tgt[HY] = sin(tm * 1.4) * 0.4
			tgt[PITCH] = 0.12
			a.want = WALK[k] * 0.6
			a.clock -= dt
			if a.clock < 0.0:
				a.clock = randf_range(2.0, 5.0)
				var cx := lead.x if lead != null else a.home.x
				var cz := lead.z if lead != null else a.home.z
				var ang := randf() * TAU
				var r := randf_range(1.5, 6.0) if lead != null else randf_range(0.0, 8.0)
				var h := _h(a.pop, cx + cos(ang) * r, cz + sin(ang) * r)
				if h > -0.65 and h < -0.08:
					a.tx = cx + cos(ang) * r
					a.tz = cz + sin(ang) * r
				if randf() < 0.05:
					_call(a, "honk", 1 + randi() % 2)
			_walk(a, dt, true)
			_ground(a)
			if a.t < 0.0:
				a.t = randf_range(8.0, 25.0)
				if dark or randf() < 0.25:
					a.mode = REST
					a.t = randf_range(15.0, 40.0)
		REST:
			# asleep on one leg, head laid back along the body
			_reset_pose(a)
			_settle_wings(a)
			a.speed = 0.0
			tgt[STRIDE] = 0.0
			tgt[SA] = 1.0
			tgt[HY] = 2.7
			tgt[HP] = 1.25
			if sin(tm * 0.3) > 0.8:
				# preening
				tgt[SA] = 0.0
				tgt[HY] = 1.5 * signf(sin(a.seed))
				tgt[HP] = 1.0 + sin(tm * 4.0) * 0.15
			_ground(a)
			if a.t < 0.0 and not dark:
				a.mode = IDLE
				a.t = randf_range(10.0, 20.0)
			elif a.t < 0.0:
				a.t = 20.0
		ALERT:
			_reset_pose(a)
			_settle_wings(a)
			tgt[HP] = -0.15
			tgt[HY] = sin(tm * 2.0) * 0.4
			a.want = WALK[k] * 1.6
			_walk(a, dt, true)
			_ground(a)
			if a.t < 0.0:
				a.mode = IDLE
				a.t = randf_range(4.0, 10.0)
		MARCH:
			# heads high, the flock bunched and stepping together, heads flagging, wings flashing open
			_reset_pose(a)
			_settle_wings(a)
			var cx := lead.x if lead != null else a.x
			var cz := lead.z if lead != null else a.z
			a.tx = cx + sin(a.u) * 6.0 + ((a.x - cx) * 0.4 if lead != null else 0.0)
			a.tz = cz + cos(a.u) * 6.0 + ((a.z - cz) * 0.4 if lead != null else 0.0)
			a.want = WALK[k] * 1.8
			tgt[HP] = -0.12
			tgt[HY] = sin(tm * 5.5) * 0.7
			if sin(tm * 0.9) > 0.85:
				tgt[FOLD] = 0.25
				tgt[SB] = 0.5
			_walk(a, dt, true)
			_ground(a)
			if randf() < dt * 0.15:
				_call(a, "honk", 2)
			if a.t < 0.0:
				a.mode = IDLE
				a.t = randf_range(6.0, 15.0)
		TAKEOFF:
			_reset_pose(a)
			a.u += dt
			_walk(a, dt, true)
			_ground(a)
			_wings(a, 0.75, 3.0)
			tgt[TUCK] = 0.0
			tgt[HP] = 1.1
			tgt[PITCH] = -0.1
			if a.u > 1.1:
				a.mode = FLY
				a.air = true
				a.vx = sin(a.yaw) * a.speed
				a.vz = cos(a.yaw) * a.speed
				a.vy = 1.5
				a.t = 25.0
				# somewhere else in the shallows to settle
				var s := _spot_near(a.pop.shallows, a.x, a.z, 400.0)
				a.home = lead.home if lead != null else (s if s != Vector3.INF else a.home)
				a.u = 0.0
		FLY:
			# neck stretched out ahead, legs trailing: a pink arrow in a loose line
			_reset_pose(a)
			var l: Beast = lead if lead != null and lead.mode == FLY else null
			if l != null:
				var i := a.pop.beasts.find(a) - a.pop.beasts.find(l)
				var row := float(i / 6) * (1.0 if i % 2 else -1.0)
				a.tx = l.x - sin(l.yaw) * 2.5 * (i % 6) + cos(l.yaw) * 1.6 * row
				a.tz = l.z - cos(l.yaw) * 2.5 * (i % 6) - sin(l.yaw) * 1.6 * row
				a.ty = l.y
				_fly(a, dt, 13.0, 2.4, 3.0)
			else:
				# (a straggler heads for wherever its leader is bound)
				var hm := lead.home if lead != null else a.home
				var dh := Vector2(hm.x - a.x, hm.z - a.z).length()
				a.u += dt
				if dh > 18.0 or a.u < 6.0:
					# a wide circle first, then on to the new feeding ground
					var ang := a.yaw + 0.5 if a.u < 6.0 else atan2(hm.x - a.x, hm.z - a.z)
					a.tx = a.x + sin(ang) * 20.0
					a.tz = a.z + cos(ang) * 20.0
					a.ty = maxf(12.0, _h(a.pop, a.x, a.z) + 10.0)
					_fly(a, dt, 11.0, 1.6, 4.0)
				else:
					a.mode = LAND
			_wings(a, 0.55, 2.6)
			tgt[HP] = 1.45
			if l != null and l.mode == LAND:
				a.mode = LAND
		LAND:
			_reset_pose(a)
			var tx := lead.home.x + fmod(a.seed, 7.0) - 3.5 if lead != null else a.home.x
			var tz := lead.home.z + fmod(a.seed * 7.0, 7.0) - 3.5 if lead != null else a.home.z
			tgt[HP] = 1.2
			if _landing(a, dt, tx, _h(a.pop, tx, tz), tz, 10.0, 2.6):
				a.mode = ALERT
				a.air = false
				a.t = randf_range(3.0, 6.0)
				a.fear = 0.0
				a.tx = a.x + sin(a.yaw) * 2.0
				a.tz = a.z + cos(a.yaw) * 2.0
			if a.t < -40.0:
				a.mode = IDLE
				a.air = false
			a.t -= dt


func _egret(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var th := _th
	var th_d := _th_d
	var tgt := a.tgt
	var tm := time + a.seed
	a.t -= dt
	a.u -= dt
	a.fear *= 1.0 - MathX.damp(0.4, dt)
	if a.fear > 0.55 and (a.mode == IDLE or a.mode == STRIKE or a.mode == WALKING):
		a.mode = FLY
		a.t = randf_range(6.0, 10.0)
		_take_off(a)
		_flee_to(a, 60.0, "wade")
		a.home = Vector3(a.tx, 0.0, a.tz)
		var s := _spot_near(a.pop.shallows if a.pop.shallows.size() else a.pop.beach, a.tx, a.tz, 120.0)
		if s != Vector3.INF:
			a.home = s
		_call(a, "croak", 2)
	match a.mode:
		IDLE, WALKING:
			# stalking: a slow step, then frozen mid-stride, neck drawn back, eyes on the water
			_reset_pose(a)
			_settle_wings(a)
			tgt[HP] = 0.55
			tgt[HY] = sin(tm * 0.5) * 0.4
			tgt[PITCH] = 0.08
			a.clock -= dt
			var held := a.hold
			if a.clock < 0.0:
				held = not held
				a.clock = randf_range(1.0, 3.5) if held else randf_range(0.5, 1.2)
				if not held and Vector2(a.tx - a.x, a.tz - a.z).length() < 0.5:
					_wander(a, 14.0, func(h: float) -> bool: return h > -0.55 and h < 0.4)
				# a fish!
				if held and randf() < 0.35:
					a.mode = STRIKE
					a.u = 0.9
			a.hold = held
			a.want = 0.0 if a.hold else WALK[k]
			if a.hold:
				a.speed = 0.0
			_walk(a, dt, true)
			_ground(a)
			if th != null and th_d < WARY[k] * 1.8:
				_look_at(a, th.x, th.z)
		STRIKE:
			# the stab, and (sometimes) the fish tossed back and swallowed
			_reset_pose(a)
			_settle_wings(a)
			a.speed = 0.0
			a.hold = true
			if a.u > 0.65:
				tgt[HP] = 0.2
			elif a.u > 0.45:
				tgt[HP] = 2.1
				a.quick = 6.0
				if a.u - dt <= 0.45:
					var bx := a.x + sin(a.yaw) * 0.45 * a.s
					var bz := a.z + cos(a.yaw) * 0.45 * a.s
					if _h(a.pop, bx, bz) < -0.05:
						_splash(bx, bz, 0.12)
			elif a.u > 0.1:
				tgt[HP] = -0.7
				a.quick = 2.0
			else:
				a.mode = IDLE
				a.hold = false
			_ground(a)
		FLY:
			# slow, deep wingbeats, neck folded back, legs trailing
			_reset_pose(a)
			a.ty = maxf(_h(a.pop, a.x, a.z), 0.0) + 6.0
			a.tx = a.home.x
			a.tz = a.home.z
			var d := _fly(a, dt, 7.0, 1.5, 2.0)
			_wings(a, 0.62, 1.9)
			tgt[HP] = 0.35
			if d < 14.0 or a.t < 0.0:
				a.mode = LAND
		LAND:
			_reset_pose(a)
			tgt[HP] = -0.2
			if _landing(a, dt, a.home.x, _h(a.pop, a.home.x, a.home.z), a.home.z, 6.0, 1.9):
				a.mode = IDLE
				a.air = false
				a.fear = 0.0
				a.tx = a.x
				a.tz = a.z


func _iguana(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var th := _th
	var th_d := _th_d
	var tgt := a.tgt
	var tm := time + a.seed
	a.t -= dt
	a.u -= dt
	a.fear *= 1.0 - MathX.damp(0.25, dt)
	if a.fear > 0.5 and a.mode != FLEE and a.mode != SWIM:
		a.mode = FLEE
		a.t = 4.0
		# the sea if it's handy, else away into the scrub
		var water := false
		var i := 0
		while i < 8 and not water:
			var ang := atan2(a.x - a.fx, a.z - a.fz) + (i - 3.5) * 0.6
			var x := a.x + sin(ang) * 18.0
			var z := a.z + cos(ang) * 18.0
			if _h(a.pop, x, z) < -0.6:
				a.tx = x
				a.tz = z
				water = true
			i += 1
		if not water:
			_flee_to(a, 14.0, "land")
		a.want = RUN[k]
		if randf() < 0.4:
			_call(a, "hiss")
	elif th != null and th_d < WARY[k] * 1.7 and a.mode == WALKING:
		# freeze: perhaps it hasn't been seen
		a.mode = IDLE
		a.t = randf_range(3.0, 6.0)
	tgt[TAILW] = 0.0
	match a.mode:
		IDLE:
			# basking, belly to the warm rock; now and then the head-bobbing display, dewlap out
			_reset_pose(a)
			a.speed = 0.0
			tgt[STRIDE] = 0.0
			tgt[LIFT] = -0.03
			tgt[HP] = -0.12
			tgt[TAILW] = sin(a.seed) * 0.3
			if a.u > 0.0:
				tgt[HP] = -0.3 + sin(a.u * 14.0) * 0.28
				tgt[SA] = -0.75
				tgt[LIFT] = 0.03 + maxf(0.0, sin(a.u * 7.0)) * 0.03
				a.quick = 2.0
			elif randf() < dt * 0.06:
				a.u = randf_range(1.2, 2.2)
			if th != null and th_d < WARY[k] * 2.2:
				_look_at(a, th.x, th.z, 0.6)
			_ground(a)
			if a.t < 0.0:
				a.t = randf_range(10.0, 40.0)
				if randf() < 0.4:
					a.mode = WALKING
					_wander(a, 10.0, func(h: float) -> bool: return h > 0.15)
					a.want = WALK[k]
		WALKING, FLEE:
			_reset_pose(a)
			tgt[HP] = -0.1
			# the body and tail swing from side to side with the legs
			tgt[TAILW] = -sin(a.gait) * 0.4
			a.quick = 2.0
			var d := _walk(a, dt, true)
			_ground(a)
			if _h(a.pop, a.x, a.z) < -0.35:
				a.mode = SWIM
				a.wet = true
				a.t = randf_range(12.0, 25.0)
				_splash(a.x, a.z, 0.2)
				a.tx = a.x + sin(a.yaw) * 14.0
				a.tz = a.z + cos(a.yaw) * 14.0
			elif d < 0.4 or a.t < -10.0:
				a.mode = IDLE
				a.t = randf_range(8.0, 20.0)
		SWIM:
			# legs folded back, swimming with great sweeps of the tail
			_reset_pose(a)
			tgt[TUCK] = 1.0
			tgt[TAILW] = sin(tm * 5.0) * 0.6
			tgt[HP] = -0.25
			a.quick = 2.0
			a.want = 1.1
			a.gait = 0.0
			# after a while, back ashore to bask
			if a.t < 0.0:
				a.tx = a.home.x
				a.tz = a.home.z
			_walk(a, dt, a.t < 0.0, a.t >= 0.0)
			a.y = world.water_height(a.x, a.z) - 0.12 * a.s
			a.slope = 0.0
			if a.t < 0.0 and _h(a.pop, a.x, a.z) > -0.3:
				a.mode = WALKING
				a.wet = false
				a.want = WALK[k]
				a.t = 10.0


func _tortoise(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var th := _th
	var th_d := _th_d
	var tgt := a.tgt
	var tm := time + a.seed
	var dark := night > 0.62
	a.t -= dt
	a.fear *= 1.0 - MathX.damp(0.15, dt)
	if a.fear > 0.45 and a.mode != HIDE:
		a.mode = HIDE
		a.t = randf_range(6.0, 12.0)
		_call(a, "hiss")
	match a.mode:
		IDLE, WALKING:
			# cropping the grass, or plodding on to the next patch, rocking from foot to foot
			_reset_pose(a)
			tgt[HP] = 0.15 if a.mode == WALKING else 0.85 + sin(tm * 2.4) * 0.07
			tgt[HY] = sin(tm * 0.3) * 0.4
			a.want = WALK[k] if a.mode == WALKING else 0.0
			_walk(a, dt, false, false, 0.6)
			tgt[ROLL] = sin(a.gait) * 0.05 if a.speed > 0.02 else 0.0
			if sin(tm * 0.17) > 0.9:
				# a long stretch of the neck to look about
				tgt[HP] = -0.75
				tgt[HY] = sin(tm * 0.5) * 0.9
			_ground(a)
			if a.t < 0.0:
				a.t = randf_range(10.0, 30.0)
				if dark:
					a.mode = REST
					a.t = randf_range(30.0, 60.0)
				elif randf() < 0.5:
					a.mode = WALKING
					_wander(a, 12.0, func(h: float) -> bool: return h > 1.5)
				else:
					a.mode = IDLE
		REST:
			_reset_pose(a)
			a.speed = 0.0
			tgt[STRIDE] = 0.0
			tgt[LIFT] = -0.1
			tgt[TUCK] = 0.5
			tgt[SA] = 0.18
			tgt[HP] = 0.3
			_ground(a)
			if a.t < 0.0:
				a.mode = REST if dark else IDLE
				a.t = randf_range(20.0, 40.0)
		HIDE:
			# head and legs drawn in, the shell down on the ground; a peek, and out again
			_reset_pose(a)
			a.speed = 0.0
			tgt[STRIDE] = 0.0
			var peek := a.t < 2.2 and a.t > 0.0
			tgt[SA] = 0.2 if peek else 0.42
			tgt[LIFT] = -0.13
			tgt[TUCK] = 0.4 if peek else 0.7
			tgt[HP] = -0.1 if peek else 0.0
			a.quick = 0.5 if peek else 2.5
			_ground(a)
			if a.t < 0.0:
				if a.fear > 0.3 or (th != null and th_d < WARY[k]):
					a.t = randf_range(3.0, 6.0)
				else:
					a.mode = IDLE
					a.t = randf_range(5.0, 10.0)


func _seal(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var th := _th
	var th_d := _th_d
	var tgt := a.tgt
	var tm := time + a.seed
	a.t -= dt
	a.u -= dt
	a.fear *= 1.0 - MathX.damp(0.3, dt)
	var in_sea := _h(a.pop, a.x, a.z) < -0.35
	var ring := a.pop.ring
	if a.fear > 0.55 and not in_sea and a.mode != FLEE:
		# barking, off down the rocks into the sea
		a.mode = FLEE
		a.t = 12.0
		var found := false
		var bd := INF
		for r in ring:
			var d := Vector2(r.x - a.x, r.z - a.z).length()
			if d < 80.0 and d < bd:
				bd = d
				a.tx = r.x
				a.tz = r.z
				found = true
		if not found:
			_flee_to(a, 20.0, "water")
		_call(a, "bark", 2 + randi() % 2, 1.0 if a.adult else 1.4)
	if in_sea:
		# swimming: low in the water, rolling lazily, porpoising out now and then
		_reset_pose(a)
		a.wet = true
		if a.mode != SWIM:
			a.mode = SWIM
			if a.t < 6.0:
				a.t = randf_range(20.0, 50.0)
			_splash(a.x, a.z, 0.5)
		a.want = 3.2 if a.fear > 0.3 else 1.6
		a.clock -= dt
		if a.clock < 0.0 or Vector2(a.tx - a.x, a.tz - a.z).length() < 2.0:
			a.clock = randf_range(4.0, 9.0)
			var r := _spot_near(ring, a.home.x, a.home.z, 90.0) if not ring.is_empty() else Vector3.INF
			a.tx = (r.x if r != Vector3.INF else a.x) + randf_range(-12.0, 12.0)
			a.tz = (r.z if r != Vector3.INF else a.z) + randf_range(-12.0, 12.0)
		if a.t < 0.0:
			a.tx = a.home.x
			a.tz = a.home.z
			a.want = 1.6
		a.gait += dt * 3.0
		tgt[STRIDE] = 0.4
		var porp := sin(tm * 0.9) > 0.94
		var wy := world.water_height(a.x, a.z)
		a.y = lerpf(a.y, wy - (0.05 if porp else 0.3) * a.s, MathX.damp(3.0, dt))
		tgt[ROLL] = sin(tm * 0.35) * 0.6
		tgt[HP] = -0.35
		tgt[PITCH] = -0.25 if porp else 0.0
		a.slope = 0.0
		_walk(a, dt, a.t < 0.0, a.t >= 0.0)
		if a.t < 0.0 and _h(a.pop, a.x, a.z) > -0.35:
			a.mode = WALKING
			a.wet = false
			a.t = 20.0
		return
	a.wet = false
	match a.mode:
		SWIM, WALKING, FLEE:
			# galumphing: the chest heaves up, the hips humped after it
			_reset_pose(a)
			if a.mode == SWIM:
				a.mode = WALKING
				a.tx = a.home.x
				a.tz = a.home.z
			a.want = RUN[k] if a.mode == FLEE else WALK[k]
			var d := _walk(a, dt, true, false, 1.6)
			tgt[PITCH] = sin(a.gait) * 0.12
			tgt[LIFT] = maxf(0.0, sin(a.gait)) * 0.06
			tgt[HP] = -0.25
			a.quick = 2.0
			_ground(a)
			if a.mode == WALKING and d < 0.6:
				a.mode = IDLE
				a.t = randf_range(15.0, 40.0)
			if a.mode == FLEE and d < 0.5:
				_flee_to(a, 10.0, "water")
		IDLE:
			# hauled out: dozing, rolling over, scratching with a flipper, barking at the world
			_reset_pose(a)
			a.speed = 0.0
			var mood := sin(tm * 0.13 + a.seed)
			if mood > 0.55:
				# on its side, waving a flipper
				tgt[ROLL] = 1.15
				tgt[STRIDE] = 0.7
				a.gait = sin(tm * 2.2) * 1.4
				tgt[HP] = 0.1
			elif mood < -0.6:
				tgt[HP] = 0.42
				tgt[STRIDE] = 0.0
			else:
				tgt[HP] = -0.35 + sin(tm * 0.4) * 0.15
				tgt[HY] = sin(tm * 0.3) * 0.7
				tgt[STRIDE] = 0.0
			if a.u > 0.0:
				# the bark: head flung up, bobbing with each
				tgt[HP] = -0.85 + sin(a.u * 11.0) * 0.18
				tgt[ROLL] = 0.0
				a.quick = 2.0
			elif randf() < dt * 0.04:
				a.u = randf_range(1.2, 2.2)
				_call(a, "bark", 2 + randi() % 3, 1.0 if a.adult else 1.4)
			if th != null and th_d < WARY[k] * 2.0:
				_look_at(a, th.x, th.z, 0.9)
				tgt[HP] = -0.5
				tgt[ROLL] = 0.0
			_ground(a)
			if a.t < 0.0:
				a.t = randf_range(20.0, 60.0)
				if randf() < 0.35 and not ring.is_empty():
					# a swim
					a.mode = FLEE
					a.fear = 0.0
					var r := _spot_near(ring, a.x, a.z, 80.0)
					if r == Vector3.INF:
						r = ring[randi() % ring.size()]
					a.tx = r.x
					a.tz = r.z
					a.t = 30.0


func _crab(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var th := _th
	var th_d := _th_d
	var tgt := a.tgt
	var tm := time + a.seed
	var dark := night > 0.5
	a.t -= dt
	a.fear *= 1.0 - MathX.damp(0.5, dt)
	if a.mode != HIDE and a.mode != FLEE and a.mode != DOWN:
		if a.fear > 0.85 or (th != null and th_d < WARY[k] * 0.6):
			# dash for it
			a.mode = FLEE
			a.t = randf_range(0.8, 1.6)
			_flee_to(a, 6.0, "land")
			a.want = RUN[k]
			if randf() < 0.3:
				_call(a, "click", 3)
		elif a.fear > 0.4 or (th != null and th_d < WARY[k] * 1.3):
			if a.mode != ALERT:
				a.mode = ALERT
				a.t = randf_range(1.5, 3.0)
			if th != null:
				a.fx = th.x
				a.fz = th.z
	match a.mode:
		IDLE, WALKING:
			# scuttle a little way, stop, pick at the sand with alternate claws
			tgt[HP] = 0.0
			tgt[HY] = 0.0
			tgt[LIFT] = 0.0
			tgt[SB] = 0.0
			a.hidden = false
			if a.mode == IDLE:
				a.want = 0.0
				tgt[SA] = maxf(0.0, sin(tm * 5.0)) * -0.35
			else:
				tgt[SA] = 0.0
			var d := _walk(a, dt)
			_ground(a)
			if a.mode == WALKING and d < 0.15:
				a.mode = IDLE
			if a.t < 0.0:
				a.t = randf_range(1.0, 2.5 if dark else 4.0)
				if not dark and randf() < 0.06:
					a.mode = DOWN
					a.t = randf_range(0.5, 0.8)
				else:
					a.mode = WALKING
					_wander(a, 9.0 if dark else 5.0, func(h: float) -> bool: return h > 0.08 and h < 2.5)
					_sideways(a, a.tx, a.tz)
					a.want = WALK[k] * randf_range(0.6, 1.3)
		ALERT:
			# claws up, body raised: come on then
			a.want = 0.0
			a.side = 0.0
			_face_to(a, a.fx, a.fz, dt, 8.0)
			tgt[SA] = -1.0
			tgt[LIFT] = 0.025
			tgt[SB] = 0.0
			_walk(a, dt)
			_ground(a)
			if a.t < 0.0:
				a.mode = IDLE
				a.t = randf_range(1.0, 3.0)
		FLEE:
			_sideways(a, a.tx, a.tz)
			tgt[SA] = -0.3
			tgt[LIFT] = 0.015
			a.want = RUN[k]
			_walk(a, dt)
			_ground(a)
			if a.t < 0.0:
				a.mode = DOWN
				a.t = 0.5
		DOWN:
			# into the burrow, sand spraying
			a.want = 0.0
			a.speed = 0.0
			tgt[LIFT] = -0.2
			tgt[SB] = 1.3
			tgt[SA] = 0.4
			a.gait += dt * 30.0
			tgt[STRIDE] = 0.5
			if randf() < dt * 8.0:
				_dust(a.x, a.y, a.z, 1, 0.12)
			_ground(a)
			if a.t < 0.0:
				a.mode = HIDE
				a.hidden = true
				a.t = randf_range(5.0, 14.0)
		HIDE:
			if a.t < 0.0:
				if a.fear > 0.2 or (th != null and th_d < WARY[k] * 1.6):
					a.t = randf_range(2.0, 5.0)
				else:
					# eyes up out of the sand first, then the rest
					a.mode = SHOW
					a.hidden = false
					a.t = 1.6
					a.cur[LIFT] = -0.17
		SHOW:
			tgt[LIFT] = -0.09 if a.t > 0.9 else 0.0
			tgt[SB] = 0.0
			a.quick = 0.6
			_ground(a)
			if a.t < 0.0:
				a.mode = IDLE
				a.t = randf_range(0.5, 2.0)


## Picks the sideways direction nearest to where a crab is facing.
func _sideways(a: Beast, x: float, z: float) -> void:
	var h := atan2(x - a.x, z - a.z)
	a.side = PI / 2.0 if absf(MathX.angle_delta(a.yaw, h + PI / 2.0)) < absf(MathX.angle_delta(a.yaw, h - PI / 2.0)) else -PI / 2.0


func _butterfly(a: Beast, dt: float) -> void:
	var k := a.k
	_threat(a, WARY[k])
	var th := _th
	var th_d := _th_d
	var tgt := a.tgt
	var tm := time + a.seed
	var away := night > 0.45 or rain > 0.3 or storm > 0.3
	a.t -= dt
	a.fear *= 1.0 - MathX.damp(1.0, dt)
	a.hidden = away
	if away:
		return
	if a.fear > 0.4 and a.mode == PERCH:
		a.mode = FLY
		a.t = randf_range(1.0, 2.0)
		a.ty = a.y + 1.5
	match a.mode:
		FLY:
			# the erratic, bobbing flutter
			a.clock -= dt
			if a.clock < 0.0:
				a.clock = randf_range(0.6, 1.8)
				var lead: Beast = a.lead if a.lead != null and randf() < 0.5 else null
				var ang := randf() * TAU
				var r := randf_range(0.5, 3.5)
				var cx := lead.x if lead != null else a.home.x
				var cz := lead.z if lead != null else a.home.z
				a.tx = cx + cos(ang) * r * (0.3 if lead != null else 1.0)
				a.tz = cz + sin(ang) * r * (0.3 if lead != null else 1.0)
				a.ty = maxf(_h(a.pop, a.tx, a.tz), 0.0) + randf_range(0.4, 1.8)
				if a.fear > 0.3:
					a.ty += 2.0
					a.tx += (a.x - a.fx) * 0.5
					a.tz += (a.z - a.fz) * 0.5
			_fly(a, dt, 1.6 + a.fear * 2.0, 3.0, 0.3)
			a.y += sin(tm * 9.0) * dt * 1.2
			a.yaw += sin(tm * 3.7) * dt * 2.0
			tgt[ROLL] = sin(tm * 5.0) * 0.3
			tgt[PITCH] = -0.2
			tgt[FLAP] = 1.15
			tgt[SB] = 0.1
			a.flap_hz = 8.5
			tgt[FOLD] = 0.0
			if a.t < 0.0 and a.fear < 0.2 and not a.pop.flowers.is_empty():
				var f := _spot_near(a.pop.flowers, a.home.x, a.home.z, 6.0)
				if f != Vector3.INF:
					a.mode = LAND
					a.tx = f.x + randf_range(-0.15, 0.15)
					a.ty = f.y
					a.tz = f.z + randf_range(-0.15, 0.15)
				a.t = randf_range(2.0, 5.0)
		LAND:
			_fly(a, dt, 1.3, 4.0, -5.0)
			a.flap_hz = 8.0
			tgt[FLAP] = 1.1
			if Vector3(a.tx - a.x, a.ty - a.y, a.tz - a.z).length() < 0.08:
				a.mode = PERCH
				a.t = randf_range(3.0, 9.0)
				a.vx = 0.0
				a.vy = 0.0
				a.vz = 0.0
			if a.t < -6.0:
				a.mode = FLY
		PERCH:
			# sat on a flower, wings slowly opening and closing in the sun
			a.speed = 0.0
			tgt[ROLL] = 0.0
			tgt[PITCH] = 0.0
			tgt[FLAP] = 0.65
			tgt[SB] = 0.72
			a.flap_hz = 0.35
			if th != null and th_d < WARY[k]:
				a.fear = 0.6
			if a.t < 0.0:
				a.mode = FLY
				a.t = randf_range(3.0, 8.0)


func _hummer(a: Beast, dt: float) -> void:
	var tgt := a.tgt
	var tm := time + a.seed
	a.hidden = night > 0.45 or storm > 0.4
	if a.hidden:
		return
	a.t -= dt
	a.fear *= 1.0 - MathX.damp(1.0, dt)
	var blooms := a.pop.blooms
	if a.fear > 0.5 and a.mode != FLY:
		a.mode = FLY
		a.t = 0.0
	match a.mode:
		HOVER:
			# at a flower: body upright, bill in the bloom, wings a blur, little backing-off and darting in
			_fly(a, dt, 2.0, 6.0, -5.0)
			tgt[PITCH] = -0.6
			tgt[ROLL] = 0.0
			tgt[SB] = 0.3
			tgt[TAILW] = sin(tm * 3.0) * 0.2
			_face_to(a, a.ox, a.oz, dt, 8.0)
			if randf() < dt * 0.4:
				_call(a, "chip", 1 + randi() % 2)
			# someone standing near on foot: come and have a look at them
			for i in _walkers.size():
				var wk: ShoreWalker = _walkers[i]
				var d := Vector2(wk.x - a.x, wk.z - a.z).length()
				if d < 9.0 and d > 2.0 and randf() < dt * 0.08:
					a.mode = CURIOUS
					a.t = randf_range(2.2, 3.4)
					a.lead = null
					a.mate = null
					a.clock = i
			if a.t < 0.0 and a.mode == HOVER:
				a.mode = FLY
				a.t = 0.0
		CURIOUS:
			# hums up to the captain's face and hangs there, looking
			var i := int(a.clock)
			if i >= _walkers.size():
				a.mode = FLY
			else:
				var wk: ShoreWalker = _walkers[i]
				a.tx = wk.x + sin(wk.yaw) * 0.85
				a.tz = wk.z + cos(wk.yaw) * 0.85
				a.ty = wk.y + 1.6 + sin(tm * 2.5) * 0.06
				_fly(a, dt, 6.0, 4.0, -5.0)
				_face_to(a, wk.x, wk.z, dt, 8.0)
				tgt[PITCH] = -0.55
				tgt[ROLL] = 0.0
				tgt[HY] = sin(tm * 1.7) * 0.5
				if randf() < dt * 1.5:
					_call(a, "chip", 1)
				if a.t < 0.0:
					a.mode = FLY
					a.t = 0.0
		_:
			# darting from bloom to bloom
			a.mode = FLY
			if a.t <= 0.0:
				a.t = 4.0
				var b := a.home
				if not blooms.is_empty():
					b = _spot_near(blooms, a.home.x, a.home.z, 25.0)
					if b == Vector3.INF:
						b = blooms[randi() % blooms.size()]
				var ang := randf() * TAU
				a.ox = b.x
				a.oz = b.z
				a.tx = b.x + cos(ang) * 0.45 * 1.2
				a.tz = b.z + sin(ang) * 0.45 * 1.2
				a.ty = b.y + randf_range(-0.1, 0.2)
				if a.fear > 0.3:
					a.tx = a.x + (a.x - a.fx) * 2.0
					a.tz = a.z + (a.z - a.fz) * 2.0
					a.ty = a.y + 3.0
			var d := _fly(a, dt, 9.0, 5.0, 0.4)
			tgt[PITCH] = 0.1
			if d < 0.2:
				a.mode = HOVER
				a.t = randf_range(1.5, 4.0)
				a.vx = 0.0
				a.vy = 0.0
				a.vz = 0.0
			if a.t < -4.0:
				a.t = 0.0
	# the wings beat too fast to see: a different blur of a stroke every frame
	tgt[FOLD] = 0.0
	tgt[FLAP] = 1.05
	a.flap_ph += 2.3 + randf() * 1.2
	a.flap_hz = 0.0
	a.cur[FLAP] = 1.05


# ---------------------------------------------------------------- the frame

## A frame of the isles' life: `focus` is what the view follows, `walkers`
## the people ashore the beasts keep an eye on, `px_k` how many pixels a metre
## spans one metre off.
func update(dt: float, camera: Camera3D, focus: Vector3, walkers: Array, px_k: float) -> void:
	# which isles are alive (and the nearest one still to survey, if none is under way)
	active.clear()
	var cam := camera.global_position
	var want: Pop = null
	var want_d := INF
	var job_d := INF
	for p in pops:
		var dc := Vector2(p.cx - cam.x, p.cz - cam.z).length() - p.ext
		var df := Vector2(p.cx - focus.x, p.cz - focus.z).length() - p.ext
		var d := minf(dc, df)
		if p == _job:
			job_d = d
		if not p.built:
			# in range soon (or now): worth surveying ahead, nearest first
			if d < ACTIVE + AHEAD and d < want_d:
				want = p
				want_d = d
			continue
		if d > ACTIVE:
			continue
		active.append(p)
	if _job == null and want != null:
		_job = want
		_job_step = 0
		job_d = want_d
	if _job != null:
		# a little each frame; an isle the view has already reached gets a bigger slice
		var budget := int(SURVEY_MS[1 if job_d <= ACTIVE else 0] * 1000.0)
		var t0 := Time.get_ticks_usec()
		while Time.get_ticks_usec() - t0 < budget:
			if _survey_step(_job):
				_job.built = true
				_job = null
				break
	_walkers = walkers
	_frame += 1
	if dt > 0.0 and not active.is_empty():
		_step(minf(dt, 0.1), cam, px_k)
	_pack(camera, px_k)


## Every isle surveyed and settled at once (a set piece, the checks).
func survey_all() -> void:
	for p in pops:
		if p.built:
			continue
		_job_step = 0
		while not _survey_step(p):
			pass
		p.built = true
	_job = null


func _step(dt: float, cam: Vector3, px_k: float) -> void:
	time += dt
	_calls = 0
	thought = 0
	# the guns (and a magazine going up): every beast for a long way round startles
	for s in world.ships:
		var last := -100.0
		for t in s.gun_fired_at:
			last = maxf(last, t)
		var seen_t: float = _guns_seen.get(s, -100.0)
		if last > seen_t:
			_guns_seen[s] = last
			scare(s.pos.x, s.pos.z, 260.0, 1.05)
		if not s.alive and not _dead.has(s):
			_dead[s] = true
			scare(s.pos.x, s.pos.z, 360.0, 1.1)
	# who's about: people on foot (running doubles their menace) and hulls close inshore
	_threats.clear()
	for wk: ShoreWalker in _walkers:
		var sp := Vector2(wk.vx, wk.vz).length()
		var st: Array = _still.get(wk, [0.0])
		st[0] = st[0] + dt if sp < 0.3 else 0.0
		_still[wk] = st
		# a captain who stands quietly is less of a fright
		var th := Threat.new()
		th.x = wk.x
		th.z = wk.z
		th.y = wk.y
		th.k = 1.75 if sp > 3.2 else (1.0 if sp > 0.4 else (0.55 if st[0] > 4.0 else 0.8))
		th.still = st[0]
		th.yaw = wk.yaw
		_threats.append(th)
	for s in world.ships:
		if not s.alive or not s.visible:
			continue
		var th := Threat.new()
		th.x = s.pos.x
		th.z = s.pos.z
		th.k = 1.1
		th.pad = s.cls.length * 0.5
		th.yaw = s.heading
		_threats.append(th)
	for p in active:
		for a in p.beasts:
			# the near ones think every frame; the far, every second or fourth
			var d := Vector3(a.x - cam.x, a.y - cam.y, a.z - cam.z).length()
			var px := a.s * px_k / maxf(d, 1.0)
			var every := 1 if px > 40.0 else (2 if px > 12.0 else 4)
			if (_frame + a.slot) % every != 0 and a.last >= 0.0:
				continue
			var adt := minf(time - a.last, 0.25) if a.last >= 0.0 else dt
			a.last = time
			if adt <= 0.0:
				continue
			thought += 1
			a.quick = 1.0
			match a.k:
				GOAT, DEER, BOAR: _grazer(a, adt)
				MONKEY: _monkey(a, adt)
				MACAW: _macaw(a, adt)
				PELICAN, BOOBY: _seabird(a, adt)
				FLAMINGO: _flamingo(a, adt)
				EGRET: _egret(a, adt)
				IGUANA: _iguana(a, adt)
				TORTOISE: _tortoise(a, adt)
				SEAL: _seal(a, adt)
				CRAB: _crab(a, adt)
				BUTTERFLY: _butterfly(a, adt)
				HUMMER: _hummer(a, adt)
			# ease the pose toward this frame's wishes
			var c := a.cur
			var t := a.tgt
			for i in NP:
				if i == LIFT and a.jump > 0.0:
					continue
				c[i] = lerpf(c[i], t[i], MathX.damp(RATE[i] * a.quick, adt))
			a.flap_ph = fmod(a.flap_ph + a.flap_hz * TAU * adt, TAU * 64.0)
			a.gait = fmod(a.gait, TAU * 64.0)


## Packs the beasts in view into their meshes, each in the cut its size on screen calls for.
func _pack(camera: Camera3D, px_k: float) -> void:
	for per_geo: Array in _batches:
		for cuts: Array in per_geo:
			for b: Batch in cuts:
				if b.n > 0:
					b.n = 0
					b.buf.resize(0)
	_pose.resize(0)
	drawn = 0
	var cam := camera.global_position
	var planes := camera.get_frustum()
	for p in active:
		for a in p.beasts:
			if a.hidden or drawn >= ROWS:
				continue
			var k := a.k
			var size: float = SIZE[k] * a.s
			var c := Vector3(a.x, a.y + size * 0.4, a.z)
			var d := c.distance_to(cam)
			if d * MIN_PX > size * px_k:
				continue
			var r: float = size * (1.6 if SHADOW[k] else 0.8)
			var inside := true
			for pl in planes:
				if pl.distance_to(c) > r:
					inside = false
					break
			if not inside:
				continue
			var px := a.s * px_k / maxf(d, 1.0)
			var lod := WildSculpt.FULL if px >= LIGHT_PX else (WildSculpt.LIGHT if px >= SPECK_PX else WildSculpt.SPECK)
			var b: Batch = _batches[k][a.geo][lod]
			var cu := a.cur
			# the body pitches about its hips
			var yaw := a.yaw + (sin(a.gait) * 0.14 if k == IGUANA and a.speed > 0.05 else 0.0)
			var q := Basis.from_euler(Vector3(cu[PITCH] + a.slope, yaw, cu[ROLL]), EULER_ORDER_YXZ)
			var hip: Vector2 = HIP[k]
			var hv := Vector3(0.0, hip.x * a.s, hip.y * a.s)
			var o := Vector3(a.x, a.y + cu[LIFT] * a.s, a.z) + hv.rotated(Vector3.UP, yaw) - q * hv
			var bs := Basis(q.x * a.s, q.y * a.s, q.z * a.s)
			_row[0] = bs.x.x
			_row[1] = bs.y.x
			_row[2] = bs.z.x
			_row[3] = o.x
			_row[4] = bs.x.y
			_row[5] = bs.y.y
			_row[6] = bs.z.y
			_row[7] = o.y
			_row[8] = bs.x.z
			_row[9] = bs.y.z
			_row[10] = bs.z.z
			_row[11] = o.z
			_row[12] = drawn
			if b.n == 0:
				b.lo = o
				b.hi = o
			else:
				b.lo = b.lo.min(o)
				b.hi = b.hi.max(o)
			b.buf.append_array(_row)
			b.n += 1
			_pose.append(a.gait)
			_pose.append(cu[STRIDE])
			_pose.append(cu[HP])
			_pose.append(cu[HY])
			_pose.append(a.flap_ph)
			_pose.append(cu[FLAP])
			_pose.append(cu[FOLD])
			_pose.append(cu[TAILW])
			_pose.append(cu[SA])
			_pose.append(cu[SB])
			_pose.append(cu[TUCK])
			_pose.append(a.shade)
			drawn += 1
			# close enough for a proper look: a new kind of beast for the log
			if not seen.has(k) and d < 12.0 + size * 18.0:
				_spot(k)
	for k in KINDS:
		var per_geo: Array = _batches[k]
		for cuts: Array in per_geo:
			for b: Batch in cuts:
				if b.n == 0:
					if b.mi.visible:
						b.mi.visible = false
					continue
				if b.n > b.cap:
					b.cap = maxi(8, nearest_po2(b.n))
					b.mm.instance_count = b.cap
				b.buf.resize(b.cap * STRIDE_F)
				b.mm.buffer = b.buf
				b.mm.visible_instance_count = b.n
				var reach: float = SIZE[k] * 2.6 * 2.0
				b.mm.custom_aabb = AABB(b.lo - Vector3.ONE * reach, b.hi - b.lo + Vector3.ONE * reach * 2.0)
				b.mi.visible = true
	if drawn > 0:
		_pose.resize(ROWS * 12)
		_pose_img.set_data(3, ROWS, false, Image.FORMAT_RGBAF, _pose.to_byte_array())
		_pose_tex.update(_pose_img)


func _spot(k: int) -> void:
	seen[k] = true
	Progress.see_fauna(k)
	spotted.emit(NAMES[k], seen.size(), KINDS)


## Every beast's mesh drawn once, tiny, out of sight (the warm-up compiles the shader here, not mid-voyage).
func warm(at: Vector3) -> void:
	_pose.resize(ROWS * 12)
	_pose.fill(0.0)
	for i in ROWS:
		_pose[i * 12 + 11] = 1.0
	_pose_img.set_data(3, ROWS, false, Image.FORMAT_RGBAF, _pose.to_byte_array())
	_pose_tex.update(_pose_img)
	for per_geo: Array in _batches:
		for cuts: Array in per_geo:
			for b: Batch in cuts:
				b.buf.resize(0)
				_row.fill(0.0)
				_row[0] = 0.01
				_row[5] = 0.01
				_row[10] = 0.01
				_row[3] = at.x
				_row[7] = at.y
				_row[11] = at.z
				b.buf.append_array(_row)
				b.n = 1
				b.cap = maxi(b.cap, 8)
				b.mm.instance_count = b.cap
				b.buf.resize(b.cap * STRIDE_F)
				b.mm.buffer = b.buf
				b.mm.visible_instance_count = 1
				b.mm.custom_aabb = AABB(at - Vector3.ONE, Vector3.ONE * 2.0)
				b.mi.visible = true
