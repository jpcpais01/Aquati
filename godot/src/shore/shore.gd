class_name Shore
extends Node3D
## Going ashore (the web game's Shore, src/shore/shore.ts): the ship's boat
## pulled up on a beach, and the landing party (the captain and four hands
## off her own deck, the same faces and clothes) walking the island: the
## captain where you steer them, at a walk or a run, with a hop over the
## rough; the hands in a loose knot behind, each on his own line, drifting
## about it, setting off a beat late, stopping to look at something and
## jogging to catch up, chatting with his mate, and when the captain stands
## a while, watching the sea, leaning, chatting, then sitting down on the
## sand.
##
## Some isles have a camp of cutthroats round a fire, who grab their blades
## and come running when you get close; your hands pick a man each, and run
## to cover anyone who goes for the captain. The captain cuts (three in a
## row, the last a lunge), parries are steel on steel, the pistol has one
## ball and a slow reload. Rout the camp and its plunder chest is yours.
## Everyone is drawn by the crews' instanced sailor (Crew.crowds).
##
## The same blades serve at sea. Board a crippled pirate (Boarding) and the
## captain and hands swing across on lines to fight her crew for her rolling
## deck: walkers keep world x/z as they do ashore, and her deck (her crew's
## ShipCrew plan) keeps them between her rails and round her masts and guns,
## then carries them onto her planks, so they heave, pitch and roll with her
## and stand up against the roll as her own crew do. Cut down her captain
## and enough of his men and the rest throw down their blades and go to
## their knees.

## A step, and the captain's jumps (for the game's sound and shake).
signal stepped(k: float, wet: bool, hard: bool)
signal hopped(up: bool, k: float, wet: bool, hard: bool)
## A number or a word over someone's head (`kind`: FLOAT_*).
signal floated(text: String, at: Vector3, kind: int)
## The view shakes (a blow landed by or on the captain).
signal shook(amount: float)
## A camp takes up arms; its last man is down; you open its chest.
signal alarmed(camp: Camp)
signal camp_routed(camp: Camp)
signal plundered(camp: Camp)
## The captain is down.
signal captain_fell
## A foe is cut down for good.
signal fallen(w: ShoreWalker, boss: bool)
## A boarded ship's crew is beaten: the survivors throw down their blades.
signal prize_struck(prize: Ship)
## A boarder lands on her deck.
signal landed(w: ShoreWalker, captain: bool)

const FLOAT_HIT := 0
const FLOAT_BAD := 1
const FLOAT_LOOT := 2

const CAP_HP := 120.0
const HAND_HP := 75.0
const FOE_HP := 52.0
const BOSS_HP := 115.0
## How far ahead of a walker a cut reaches, and a lunge (m).
const REACH := 2.0
const LUNGE := 2.5
## A body's radius among trunks and walls (m).
const BODY := 0.3
const PISTOL_RELOAD := 7.0
const PISTOL_RANGE := 18.0
## Camps nearer the camera than this (m) are simulated and drawn.
const CAMP_LIVE := 270.0
## Camps further than this (m) are lost in the haze: not drawn at all.
const CAMP_SHOW := 1500.0
## A camp takes up arms when the landing party comes this close to its fire,
## and gives up the chase this far from home (m).
const CAMP_ALARM := 19.0
const LEASH := 42.0
## A fort's garrison stands to when the party comes this close to the plaza's brazier, and chases this far.
const FORT_ALARM := 31.0
const FORT_LEASH := 78.0
## The garrison: soldiers, and their commandant.
const GARRISON := 5
const COMMANDANT_HP := 160.0
## A boarder's flight across on a line (s), and how high the leap carries over the rails.
const SWING_T := 1.15
const SWING_UP := 1.35
const HAND_NAMES := ["Bones", "Patch", "Old Hobb", "Sully", "Barnaby", "Nell", "Red Jack", "Iko", "Dutch", "Mags", "Tam", "Quill", "Rook", "Bess", "Finch", "Salty"]
## Each hand's place in the knot: [to the captain's right, ahead] (m).
const SLOTS := [[-1.5, -1.9], [1.5, -1.9], [-1.0, -3.7], [1.0, -3.7], [-2.3, -0.4], [2.3, -0.4]]
## What the captain's three cuts deal, and a cutthroat's (a camp's captain's) and a hand's.
const CAP_CUTS := [20.0, 17.0, 31.0]


## What steers the captain this frame: the wanted stride in world space
## (length 0..1), a run, a jump, a cut and a shot (pulses), and where the
## pointer is on the ground (has_aim) to cut or shoot toward.
class Steer:
	var mx := 0.0
	var mz := 0.0
	var run := false
	var jump := false
	var strike := false
	var pistol := false
	var has_aim := false
	var aim := Vector2.ZERO


## One of the landing party.
class Member:
	var walker: ShoreWalker
	var name := ""
	## How a hand keeps with the party (null for the captain).
	var follow: Follow


## A hand on the march: his own place in a loose knot, drifting about it,
## his own pace and moments.
class Follow:
	## His place: [to the captain's right, ahead] (m). Swapped with a mate's now and then.
	var slot := Vector2.ZERO
	## Drifting about that place (m), and where to next.
	var wx := 0.0
	var wz := 0.0
	var tx := 0.0
	var tz := 0.0
	var w_t := randf() * 2.0
	## On the move, or stood (with some give before either changes).
	var going := false
	## A beat before he sets off after the captain.
	var wait := 0.15 + randf() * 0.5
	var rest_t := 0.0
	## A touch quicker or slower than the rest.
	var pace := 0.92 + randf() * 0.16
	## Stopped to look at something, and when he'll next do so.
	var pause_t := 0.0
	var next_pause := 8.0 + randf() * 20.0
	## A glance about as he walks, and when he'll next look.
	var glance := 0.0
	var glance_t := randf() * 3.0
	var talk_t := 2.0 + randf() * 6.0
	## Walking into something without getting anywhere (s); then a few steps aside.
	var stuck := 0.0
	var aside := 0.0

	func _init(i: int) -> void:
		var s: Array = SLOTS[i]
		slot = Vector2(float(s[0]) + (randf() - 0.5) * 0.5, float(s[1]) + (randf() - 0.5) * 0.8)


## A boarder on the way across: perched on your rail, then out over the gap on a line.
class Swing:
	## Seconds before he leaps, and into the flight.
	var delay := 0.0
	var t := 0.0
	## Where he leaps from: t along the boarders' own rail, its sign the side.
	var from_t := 0.0
	## Where he lands on her deck (her own frame).
	var lx := 0.0
	var lz := 0.0
	## The rigging the line hangs from (set at the leap), and his fist on it.
	var pivot := Vector3.ZERO
	var hand := Vector3.ZERO
	var y := 0.0


## A camp of cutthroats in a glade a short walk in from the beach.
class Camp:
	var index := 0
	## {island, x, z, yaw, y} as the world bake placed it.
	var site := {}
	## The island it's on ({name, r, ...}).
	var island := {}
	## ShoreKit.camp's layout: fire, chest, chest_yaw, flag_top, seats, posts, blocks.
	var layout := {}
	var gang: Array[ShoreWalker] = []
	## Seat or post each cutthroat keeps when at ease: {x, z, yaw, idle, seat_h}.
	var spots: Array[Dictionary] = []
	## The camp's huts, colours and chest, put away whole when far out of sight.
	var holder: Node3D
	var flag: Node3D
	var chest: Node3D
	var lid: Node3D
	var alert := false
	var routed := false
	var opened := false
	## 0..1: the lid swinging open; the colours coming down once routed.
	var open := 0.0
	var strike := 0.0
	var live := false
	var fire_t := 0.0
	## A fort's walls, when this is its garrison rather than a camp of
	## cutthroats: {x, z, yaw, H, T, pad} (the gate on the landward face, -z).
	var fort := {}
	## Nobody home: a fort of yours, its old garrison long gone.
	var empty := false

	func fire() -> Vector3:
		return layout.fire


var ground: ShoreGround
var active := false
var ship: Ship
## The beach the boat came in on (ShoreGround.landing's shape).
var landing := {}
var captain: ShoreWalker
var party: Array[Member] = []
var camps: Array[Camp] = []
## Foes the party is fighting right now (alert and near), for the HUD's bars.
var foes: Array[ShoreWalker] = []
var time := 0.0
var defeated := false
## Seconds left on the pistol's reload.
var pistol_t := 0.0
## Facing of the party's march (the captain's heading, eased).
var _march := 0.0
var _still_t := 0.0
## Till two hands next swap sides on the march.
var _swap_t := 20.0
var _combo := 0
var _combo_t := 0.0
var _queued := false
var _shot_at := -1.0
var _sheath_t := 0.0
var _calm_t := 0.0
## Hit-stop: a few frames' pause when a heavy blow lands.
var _stop := 0.0
## Everyone walking this frame, and those the party may cut at.
var _all: Array[ShoreWalker] = []
var _hostile: Array[ShoreWalker] = []
## Things to do a moment from now: [shore time, Callable].
var _later: Array = []
## The deck being fought over (her crew's plan of it) and the ship it
## belongs to (null ashore); her crew, fighting for it; how many of them
## turned out (for their nerve), and whether they've struck.
var deck: ShipCrew
var prize: Ship
var crew_foes: Array[ShoreWalker] = []
var struck := false
## Which of her sides the boarders' ship lies against (+1 port).
var board_side := 1
var _crew_at := 0
## Fore and aft ends of her open deck (her own z), inside the bulkheads.
var _z0 := 0.0
var _z1 := 0.0
## Boarders on their way across (ShoreWalker -> Swing), and those in the air this frame.
var _swings := {}
var _air := {}
var _feet: Array[ShoreWalker] = []
var _boat: MeshInstance3D
var _boat_blocks: Array[Vector3] = []
var _crew: Crew
var _world: World

static var _body_mesh: ArrayMesh
static var _lid_mesh: ArrayMesh
static var _flag_mesh: ArrayMesh
static var _flag_mat: ShaderMaterial


func _init(p_ground: ShoreGround, crew: Crew, parts: Material, regions: Array[Region] = []) -> void:
	name = "Shore"
	ground = p_ground
	_crew = crew
	_boat = MeshInstance3D.new()
	_boat.name = "Boat"
	_boat.mesh = ShoreKit.boat()
	_boat.material_override = parts
	_boat.visible = false
	add_child(_boat)
	crew.crowds.append(_draw)
	if _body_mesh == null:
		_body_mesh = ShoreKit.chest_body()
		_lid_mesh = ShoreKit.chest_lid()
		_flag_mesh = ShoreKit.flag()
		_flag_mat = ShaderMaterial.new()
		_flag_mat.shader = preload("res://shaders/shore_flag.gdshader")
		_flag_mat.set_shader_parameter("roger", preload("res://art/jolly_roger.png"))
	for r in regions:
		for s: Dictionary in r.camps:
			_build_camp(s, r, parts)


## Where the boat lies on the beach.
func boat_pos() -> Vector3:
	return _boat.position


## Puts the boat on `beach` and the captain and four hands of `ship` on the sand.
func land(p_ship: Ship, beach: Dictionary, world: World) -> void:
	leave()
	ship = p_ship
	landing = beach
	active = true
	defeated = false
	pistol_t = 0.0
	_combo = 0
	_calm_t = 0.0
	_world = world
	var dx := float(beach.dx)
	var dz := float(beach.dz)
	var yaw := atan2(dx, dz)
	# run up until her forefoot grounds, so she sits in the shallows, not under them
	var mx := float(beach.x) + dx * 1.2
	var mz := float(beach.z) + dz * 1.2
	var L := ShoreKit.BOAT_L
	var hb := ground.height(mx + dx * L * 0.4, mz + dz * L * 0.4)
	var hs := maxf(ground.height(mx - dx * L * 0.4, mz - dz * L * 0.4), -0.3)
	var b := Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, -atan2(hb - hs, L * 0.8) * 0.8) * Basis(Vector3.BACK, 0.05)
	_boat.transform = Transform3D(b, Vector3(mx, maxf((hb + hs) * 0.5, -0.24) - 0.04, mz))
	_boat.visible = true
	_boat_blocks.clear()
	for k: float in [-1.5, 0.0, 1.5]:
		_boat_blocks.append(Vector3(mx + dx * k, mz + dz * k, 0.85))
	ground.blocks.append_array(_boat_blocks)
	# the captain and four hands step out onto the sand
	_raise_party(4)
	var sx := float(beach.sand_x)
	var sz := float(beach.sand_z)
	captain.place(sx + dx * 1.2, sz + dz * 1.2, yaw)
	_march = yaw
	_still_t = 0.0
	for i in range(1, party.size()):
		var side := 1.0 if (i - 1) % 2 == 1 else -1.0
		var back := 0.6 if i - 1 < 2 else -0.9
		var w := 1.3 + ((i - 1) >> 1) * 0.5
		party[i].walker.place(sx + dx * back - dz * side * w, sz + dz * back + dx * side * w, yaw + side * 0.3)
	for m in party:
		m.walker.visible = true
		m.walker.idle = ShoreWalker.Idle.STAND
		m.walker.y = ground.height(m.walker.x, m.walker.z)


## The captain and up to `n` hands off the ship's deck as walkers (their own
## sailors, so faces and clothes match), named, with a place in the knot.
func _raise_party(n: int) -> void:
	party.clear()
	var sc := _crew.of(ship)
	var off: Array[Sailor] = []
	if sc != null:
		off = sc.muster(n)
	var names := HAND_NAMES.duplicate()
	names.shuffle()
	var cap: Sailor = null
	var hands: Array[Sailor] = []
	for sl in off:
		if sl.role == Sailor.Role.CAPTAIN and cap == null:
			cap = sl
		else:
			hands.append(sl)
	captain = _walker(cap, true)
	var head := Member.new()
	head.walker = captain
	head.name = "Captain"
	party.append(head)
	for i in n:
		var m := Member.new()
		m.walker = _walker(hands[i] if i < hands.size() else null, false)
		m.name = names[i]
		m.follow = Follow.new(mini(i, SLOTS.size() - 1))
		party.append(m)


func _walker(sl: Sailor, cap: bool) -> ShoreWalker:
	var hp := CAP_HP if cap else HAND_HP
	if sl != null:
		return ShoreWalker.new(ShoreWalker.Team.PARTY, sl.look, sl.row, hp, sl.girth, sl.height)
	# short-handed: someone fresh in the ship's colours
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var look := CrewLook.make(false, cap, false, rng)
	return ShoreWalker.new(ShoreWalker.Team.PARTY, look, _crew.take_row(look.slots), hp, 1.0, 1.0, true)


## Everyone back in the boat and aboard; the boat is hoisted in.
func leave() -> void:
	if not active:
		return
	active = false
	for m in party:
		if m.walker.owns_row:
			_crew.free_row(m.walker.palette)
	party.clear()
	captain = null
	foes.clear()
	if ship != null and is_instance_valid(ship):
		var sc := _crew.of(ship)
		if sc != null:
			sc.welcome_back()
	ship = null
	for b in _boat_blocks:
		ground.blocks.erase(b)
	_boat_blocks.clear()
	_boat.visible = false
	landing = {}
	_end_boarding()
	# camps that gave chase settle back down round their fires
	for c in camps:
		if c.routed or not c.alert:
			continue
		c.alert = false
		_rest_camp(c)


## A fresh voyage: every camp manned again, its colours up and its chest shut.
func reset_camps() -> void:
	for c in camps:
		c.alert = false
		c.routed = false
		c.opened = false
		c.open = 0.0
		c.strike = 0.0
		c.lid.rotation.x = 0.0
		c.flag.visible = true
		c.flag.position = c.layout.flag_top
		_rest_camp(c)


## The camp whose fire is within `r` of (x, z), or null.
func camp_at(x: float, z: float, r: float) -> Camp:
	for c in camps:
		if Vector2(float(c.site.x) - x, float(c.site.z) - z).length() < r:
			return c
	return null


## Draws the party and the live camps' people through the crews' sailor (a Crew.crowds callable).
func _draw(emit: Callable) -> void:
	if active:
		for m in party:
			var w := m.walker
			if w.visible and not w.hidden and w.palette >= 0:
				emit.call(w.xf, w.write(), w.look.hat, w.prop, w.kit)
	for w in crew_foes:
		if w.visible and w.palette >= 0:
			emit.call(w.xf, w.write(), w.look.hat, w.prop, w.kit)
	for c in camps:
		if not c.live:
			continue
		for w in c.gang:
			if w.palette >= 0:
				emit.call(w.xf, w.write(), w.look.hat, w.prop, w.kit)


# ---------------------------------------------------------------- the camps

func _build_camp(s: Dictionary, r: Region, parts: Material) -> void:
	var c := Camp.new()
	c.index = camps.size()
	c.site = s
	for isl: Dictionary in r.islands:
		if isl.name == s.island:
			c.island = isl
	var L := ShoreKit.camp(s, ground.height, 4100 + c.index * 37)
	c.layout = L
	for d: Vector3 in L.blocks:
		ground.add_solid(d.x, d.y, d.z)
	c.holder = Node3D.new()
	c.holder.name = "Camp%d" % c.index
	add_child(c.holder)
	var mi := MeshInstance3D.new()
	mi.mesh = L.mesh
	mi.material_override = parts
	c.holder.add_child(mi)
	# the colours, flying downwind from the masthead
	c.flag = Node3D.new()
	c.flag.position = L.flag_top
	var fm := MeshInstance3D.new()
	fm.mesh = _flag_mesh
	fm.material_override = _flag_mat
	fm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# (waving, it reaches a little out of its plane)
	fm.extra_cull_margin = 0.4
	c.flag.add_child(fm)
	c.holder.add_child(c.flag)
	# the chest: a body and a lid on its hinge
	c.chest = Node3D.new()
	c.chest.position = L.chest
	c.chest.rotation.y = float(L.chest_yaw)
	var body := MeshInstance3D.new()
	body.mesh = _body_mesh
	body.material_override = parts
	c.chest.add_child(body)
	c.lid = Node3D.new()
	c.lid.position = Vector3(0.0, ShoreKit.CHEST_H, -ShoreKit.CHEST_D * 0.5)
	var lm := MeshInstance3D.new()
	lm.mesh = _lid_mesh
	lm.material_override = parts
	c.lid.add_child(lm)
	c.chest.add_child(c.lid)
	c.holder.add_child(c.chest)
	_muster(c)
	camps.append(c)


## A fort's garrison, manned like a camp behind stone walls (the fort itself
## is built by Forts): `layout` is the fort's (fire, chest, flag_top,
## flag_drop, seats, posts), `walls` {x, z, yaw, H, T, pad}.
func add_garrison(site: Dictionary, island: Dictionary, layout: Dictionary, walls: Dictionary, parts: Material) -> Camp:
	var c := Camp.new()
	c.index = camps.size()
	c.site = site
	c.island = island
	c.layout = layout
	c.fort = walls
	c.holder = Node3D.new()
	c.holder.name = "Garrison%d" % c.index
	add_child(c.holder)
	# the Brethren's colours, big enough to read from the sea
	c.flag = Node3D.new()
	c.flag.position = layout.flag_top
	c.flag.scale = Vector3.ONE * 2.3
	var fm := MeshInstance3D.new()
	fm.mesh = _flag_mesh
	fm.material_override = _flag_mat
	fm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	fm.extra_cull_margin = 0.4
	c.flag.add_child(fm)
	c.holder.add_child(c.flag)
	c.chest = Node3D.new()
	c.chest.position = layout.chest
	c.chest.rotation.y = float(layout.chest_yaw)
	c.chest.scale = Vector3.ONE * 1.25
	var body := MeshInstance3D.new()
	body.mesh = _body_mesh
	body.material_override = parts
	c.chest.add_child(body)
	c.lid = Node3D.new()
	c.lid.position = Vector3(0.0, ShoreKit.CHEST_H, -ShoreKit.CHEST_D * 0.5)
	var lm := MeshInstance3D.new()
	lm.mesh = _lid_mesh
	lm.material_override = parts
	c.lid.add_child(lm)
	c.chest.add_child(c.lid)
	c.holder.add_child(c.chest)
	_muster(c)
	camps.append(c)
	return c


## A camp's gang: three to five cutthroats, and a big boss on the larger isles.
func _muster(c: Camp) -> void:
	var rnd := Mulberry32.new(900 + c.index * 71)
	var L := c.layout
	for s: Vector3 in L.seats:
		c.spots.append({"x": s.x, "z": s.y, "yaw": s.z, "idle": ShoreWalker.Idle.SIT, "seat_h": 0.38})
	var f: Vector3 = L.fire
	var yaw := float(c.site.yaw)
	for k: float in [0.4, 2.7, 4.6]:
		var a := yaw + k
		var x := f.x + sin(a) * 1.45
		var z := f.z + cos(a) * 1.45
		c.spots.append({"x": x, "z": z, "yaw": atan2(f.x - x, f.z - z), "idle": ShoreWalker.Idle.WARM, "seat_h": 0.0})
	var posts: Array = L.posts
	for k in posts.size():
		var p: Vector3 = posts[k]
		var idle := ShoreWalker.Idle.WATCH if k == 1 else (ShoreWalker.Idle.LEAN if k == 2 else ShoreWalker.Idle.STAND)
		c.spots.append({"x": p.x, "z": p.y, "yaw": p.z, "idle": idle, "seat_h": 0.0})
	var isle_r := float(c.island.get("r", 60.0))
	var fort := not c.fort.is_empty()
	var n := GARRISON + 1 if fort else 3 + floori(rnd.next() * 2.0) + (1 if isle_r > 85.0 else 0)
	var rng := RandomNumberGenerator.new()
	rng.seed = 900 + c.index * 71
	for k in n:
		var boss := k == 0 and (fort or isle_r > 70.0)
		var look := _foe_look(boss, rnd, rng)
		var hp := (COMMANDANT_HP if fort else BOSS_HP) if boss else FOE_HP
		var w := ShoreWalker.new(ShoreWalker.Team.FOE, look, -1, hp, (1.2 if fort else 1.16) if boss else 0.94 + rnd.next() * 0.16, (1.08 if fort else 1.06) if boss else 0.95 + rnd.next() * 0.1, true)
		if fort:
			w.title = "Commandant" if boss else ""
		c.gang.append(w)
	_rest_camp(c)


## A cutthroat's rags: the pirate crews' looks, roughened, the boss in a long coat and tricorn.
static func _foe_look(boss: bool, rnd: Mulberry32, rng: RandomNumberGenerator) -> CrewLook:
	var l := CrewLook.make(true, boss, false, rng)
	if not boss:
		l.flags |= CrewModel.F_KERCHIEF if rnd.next() < 0.5 else 0
		l.flags |= CrewModel.F_PISTOL if rnd.next() < 0.35 else 0
		if l.hat == CrewModel.HAT_NONE and rnd.next() < 0.5:
			l.hat = CrewModel.HAT_BANDANA
			l.slots[CrewModel.TINT_HAT] = Color(0.45, 0.04, 0.03, -1.0 if rnd.next() < 0.5 else 0.0)
	else:
		l.flags = (l.flags & ~CrewModel.F_PARROT) | CrewModel.F_BEARD | CrewModel.F_BELT | CrewModel.F_PISTOL
	return l


## Everyone back at their places round the fire, whole again, blades away.
func _rest_camp(c: Camp) -> void:
	var pick := c.spots.duplicate()
	for k in c.gang.size():
		var w := c.gang[k]
		var s: Dictionary = c.spots[k % c.spots.size()]
		if not pick.is_empty():
			s = pick.pop_at(0 if k % 2 == 0 else pick.size() / 2)
		w.place(float(s.x), float(s.z), float(s.yaw))
		w.idle = s.idle
		w.seat_h = float(s.seat_h)
		w.hp = w.max_hp
		w.down_t = -1.0
		w.fall = 0.0
		w.rise = 0.0
		w.armed = false
		w.target = null
		w.cut_t = -1.0
		w.idle_t = 4.0 + randf() * 14.0
		w.y = ground.height(w.x, w.z)


## The camp comes alive near the camera (its people take palette rows), or goes quiet.
func _set_live(c: Camp, on: bool) -> void:
	c.live = on
	for w in c.gang:
		if on:
			w.palette = _crew.take_row(w.look.slots)
			w.visible = true
			w.y = ground.height(w.x, w.z)
		else:
			_crew.free_row(w.palette)
			w.palette = -1
			w.visible = false


# ---------------------------------------------------------------- boarding

## Over the side and onto `p_prize`: the captain and `o.hands` of `p_ship`'s
## crew perch on her rail and swing across one after another, while `o.foes`
## of the prize's crew (her captain first, `o.boss_hp` strong, called
## `o.boss`, the rest `o.hand`) wait for them on her deck, blades out. The
## rest of her people have bolted below. False if she has no crew to meet them.
func board(p_ship: Ship, p_prize: Ship, o: Dictionary, world: World) -> bool:
	var plan := _crew.of(p_prize)
	if plan == null:
		return false
	leave()
	_world = world
	deck = plan
	prize = p_prize
	ship = p_ship
	active = true
	defeated = false
	struck = false
	pistol_t = 0.0
	_combo = 0
	_calm_t = 0.0
	var m := plan.main
	_z0 = plan.shape.z(m.t0) + 0.25
	_z1 = plan.shape.z(m.t1) - 0.25
	# which of her sides lies against ours, and which of ours against hers
	board_side = 1 if _local(ship.pos.x, ship.pos.z).x >= 0.0 else -1
	var our_side := 1 if (prize.pos.x - ship.pos.x) * cos(ship.heading) - (prize.pos.z - ship.pos.z) * sin(ship.heading) >= 0.0 else -1
	_raise_party(int(o.hands))
	# spread along her near rail, the captain mid-deck and the hands fanned out fore and aft of him
	var n := party.size()
	var z0 := plan.shape.z(m.t0) + 1.2
	var z1 := plan.shape.z(m.t1) - 1.2
	var slots: Array[float] = []
	for i in n:
		slots.append(lerpf(z0, z1, (i + 0.5) / n if n > 1 else 0.5))
	var zm := (z0 + z1) * 0.5
	slots.sort_custom(func(a: float, b: float) -> bool: return absf(a - zm) < absf(b - zm))
	var L := ship.cls.length
	for i in n:
		var w := party[i].walker
		var sw := Swing.new()
		sw.lz = slots[i] + (randf() - 0.5) * 0.5
		var t := clampf(plan.t_of(sw.lz), m.t0, m.t1)
		sw.lx = board_side * (m.half_width(t) - 1.6 - randf() * 0.7)
		# straight across from our own rail
		var at := _world_of(sw.lx, sw.lz)
		var ox := at.x - ship.pos.x
		var oz := at.y - ship.pos.z
		var from_t := clampf((ox * sin(ship.heading) + oz * cos(ship.heading)) / L + 0.5, 0.2, 0.8)
		sw.from_t = from_t * our_side
		sw.delay = 0.35 if i == 0 else 0.1 + i * 0.22 + randf() * 0.12
		_swings[w] = sw
		w.visible = true
		w.armed = true
		w.hang = 0.5
		w.idle = ShoreWalker.Idle.STAND
		var r := Boarding.rail_point(ship, from_t, our_side, 0.2)
		w.place(r.x, r.z, atan2(at.x - r.x, at.y - r.z))
		sw.y = r.y
		w.y = r.y
	_march = ship.heading
	_still_t = 0.0
	# her crew: those who stand and fight, the captain at their head
	var theirs := plan.muster(99, true)
	crew_foes.clear()
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	for k in int(o.foes):
		var sl: Sailor = theirs[k] if k < theirs.size() else null
		var boss := sl.role == Sailor.Role.CAPTAIN if sl != null else (k == 0 and theirs.is_empty())
		var hp := float(o.boss_hp) if boss else FOE_HP
		var w: ShoreWalker
		var l: Vector2
		var yaw: float
		if sl != null:
			w = ShoreWalker.new(ShoreWalker.Team.FOE, sl.look, sl.row, hp, sl.girth * (1.08 if boss else 1.0), sl.height * (1.04 if boss else 1.0))
			l = Vector2(sl.x, clampf(sl.z, z0 - 0.8, z1 + 0.8))
			yaw = sl.yaw
		else:
			# short-handed (every palette row taken): someone fresh from below
			var look := CrewLook.make(true, boss, false, rng)
			var row := _crew.take_row(look.slots)
			if row < 0:
				break
			w = ShoreWalker.new(ShoreWalker.Team.FOE, look, row, hp, 1.08 if boss else 1.0, 1.04 if boss else 1.0, true)
			l = plan.free_spot(m)
			yaw = rng.randf_range(-PI, PI)
		w.title = str(o.boss) if boss else str(o.hand)
		l = _keep(l, BODY + 0.1)
		var wp := _world_of(l.x, l.y)
		w.place(wp.x, wp.y, yaw + prize.heading)
		w.visible = true
		w.armed = true
		w.shout = 0.6 + randf() * 0.8
		w.idle_t = randf() * 0.6
		crew_foes.append(w)
	_crew_at = crew_foes.size()
	return true


## Lets go of a boarded deck: her fighters go back to being her crew (or
## stay below, as a prize's do).
func _end_boarding(crew_back := true) -> void:
	if deck == null:
		return
	for w in crew_foes:
		if w.owns_row:
			_crew.free_row(w.palette)
	crew_foes.clear()
	_swings.clear()
	_air.clear()
	if crew_back and prize != null and is_instance_valid(prize):
		deck.welcome_back()
	deck = null
	prize = null
	struck = false


## Off the deck of a prize sent away with a prize crew: her own people stay battened below.
func leave_as_prize() -> void:
	_end_boarding(false)
	leave()


## The boarders' flights across: perched, then out over the gap, then onto her planks.
func _update_swings(dt: float, world: World) -> void:
	if deck == null or ship == null:
		_swings.clear()
		return
	for w: ShoreWalker in _swings.keys():
		var sw: Swing = _swings[w]
		sw.t += dt
		var rail := Boarding.rail_point(ship, absf(sw.from_t), 1 if sw.from_t >= 0.0 else -1, 0.2)
		var to := _world_of(sw.lx, sw.lz)
		var to_y := deck_height(to.x, to.y)
		var u := (sw.t - sw.delay) / SWING_T
		if u < 0.0:
			# crouched on the rail, a hand on the line, waiting his turn
			w.x = rail.x
			w.z = rail.z
			sw.y = rail.y
			w.hang = 0.55
			w.want_yaw = atan2(to.x - w.x, to.y - w.z)
			w.turn(dt, 8.0)
			sw.pivot = Vector3((rail.x + to.x) * 0.5, maxf(rail.y, to_y) + 7.0, (rail.z + to.y) * 0.5)
			_air[w] = true
			continue
		if u < 1.0:
			if sw.t - dt < sw.delay:
				# the leap: a yell and a creak of the line taking the weight
				w.shout = 0.7
				if world.sound != null:
					var h := world.heard(rail)
					world.sound.swish(h.x * 0.9, h.y)
					if w == captain or randf() < 0.5:
						world.sound.yell(h.x * 0.5, h.y, h.z)
			var e := u * u * (3.0 - 2.0 * u)
			w.x = lerpf(rail.x, to.x, e)
			w.z = lerpf(rail.z, to.y, e)
			sw.y = lerpf(rail.y, to_y, e) + SWING_UP * sin(PI * minf(1.0, u * 1.08))
			w.hang = 1.0
			w.want_yaw = atan2(to.x - rail.x, to.y - rail.z)
			w.turn(dt, 10.0)
			sw.hand = Vector3(w.x + sin(w.yaw) * 0.12, sw.y + 2.05 * w.height, w.z + cos(w.yaw) * 0.12)
			_air[w] = true
			continue
		# down on her planks with a thump, carried a step on by the swing
		_swings.erase(w)
		w.place(to.x, to.y, w.yaw)
		w.kx = sin(w.yaw) * 2.2
		w.kz = cos(w.yaw) * 2.2
		w.y = to_y
		_dust(Vector3(to.x, to_y + 0.1, to.y), world, 0.9)
		landed.emit(w, w == captain)
	# the hanging pose lets go as they find their feet
	for mb in party:
		var w := mb.walker
		if not _air.has(w) and w.hang > 0.0:
			w.hang = maxf(0.0, w.hang - dt * 3.5)


## The lines the boarders swing on, from the rigging overhead to each fist
## (for Boarding to draw): [from, to, slack] each.
func swing_lines() -> Array:
	var out := []
	for w: ShoreWalker in _swings.keys():
		var sw: Swing = _swings[w]
		if sw.t < sw.delay:
			# a line held ready, hanging slack from the yard
			sw.hand = Vector3(w.x + sin(w.yaw) * 0.25, sw.y + 1.55 * w.height, w.z + cos(w.yaw) * 0.25)
			out.append([sw.pivot, sw.hand, 0.4])
		else:
			out.append([sw.pivot, sw.hand, 0.0])
	return out


## Her crew fights for her deck: blades out to meet the boarders, every man for the nearest.
func _think_deck(dt: float) -> void:
	var fighters: Array[ShoreWalker] = []
	for mb in party:
		if not mb.walker.is_down() and not _air.has(mb.walker):
			fighters.append(mb.walker)
	var cap := captain
	for k in crew_foes.size():
		var w := crew_foes[k]
		if w.is_down():
			continue
		if w.yielded > 0.0 or struck:
			w.vx *= 1.0 - MathX.damp(10.0, dt)
			w.vz *= 1.0 - MathX.damp(10.0, dt)
			continue
		w.armed = true
		if fighters.is_empty() or defeated:
			# the boarders are still coming: face the rail they'll come over
			w.vx *= 1.0 - MathX.damp(6.0, dt)
			w.vz *= 1.0 - MathX.damp(6.0, dt)
			var r := _world_of(board_side * 3.0, _local(w.x, w.z).y)
			w.want_yaw = atan2(r.x - w.x, r.y - w.z)
			w.turn(dt, 6.0)
			continue
		if w.target == null or not w.target.standing() or _air.has(w.target) or randf() < dt * 0.15:
			var best: ShoreWalker = null
			var bd := INF
			for p in fighters:
				var taken := 0
				for o in crew_foes:
					if o != w and o.target == p:
						taken += 1
				var d := Vector2(p.x - w.x, p.z - w.z).length() + taken * 2.5 - (2.0 if p == cap else 0.0)
				if d < bd:
					bd = d
					best = p
			w.target = best
		if w.target != null:
			_duel(w, w.target, dt, k, 0.38 if w.max_hp > FOE_HP else 0.22)


## Her crew's nerve: with her captain down and most of them cut down too, the rest throw in.
func _morale(world: World) -> void:
	if struck or prize == null:
		return
	var up := 0
	var boss: ShoreWalker = null
	for w in crew_foes:
		if w.standing():
			up += 1
		if w.max_hp > FOE_HP and boss == null:
			boss = w
	var headless := boss == null or boss.is_down()
	if up > 0 and not (headless and up <= maxi(1, roundi(_crew_at * 0.34))):
		return
	struck = true
	var cry := 0
	for w in crew_foes:
		w.target = null
		if w.is_down():
			continue
		w.armed = false
		w.cut_t = -1.0
		w.parry = 0.0
		w.yielded = 0.01
		w.shout = 0.0
		# "Quarter! Quarter!"
		if cry < 2:
			cry += 1
			var at := w
			_later.append([time + 0.15 + cry * 0.45, func() -> void: floated.emit("Quarter!", Vector3(at.x, at.y + 2.3, at.z), FLOAT_LOOT)])
	for mb in party:
		var w := mb.walker
		w.target = null
		if not w.is_down() and w != captain:
			w.cheer = 2.6 + randf() * 0.6
	if world.sound != null:
		world.sound.cheer(0.85, 0.0, 0.0, 5)
	prize_struck.emit(prize)


## The captain has backed up against the rail our own ship lies alongside.
func _at_own_rail() -> bool:
	var cap := captain
	if deck == null or cap == null:
		return false
	var l := _local(cap.x, cap.z)
	var t := clampf(deck.t_of(l.y), deck.main.t0, deck.main.t1)
	return l.x * board_side > deck.main.half_width(t) - 0.95


# ---------------------------------------------------------------- her deck

## World (x, z) into her own frame (her heading and position only): (x across to port, z ahead).
func _local(x: float, z: float) -> Vector2:
	var s := prize
	var dx := x - s.pos.x
	var dz := z - s.pos.z
	var sh := sin(s.heading)
	var ch := cos(s.heading)
	return Vector2(dx * ch - dz * sh, dx * sh + dz * ch)


## ...and back out to the world's (x, z).
func _world_of(lx: float, lz: float) -> Vector2:
	var s := prize
	var sh := sin(s.heading)
	var ch := cos(s.heading)
	return Vector2(s.pos.x + lx * ch + lz * sh, s.pos.z - lx * sh + lz * ch)


## The world height of her planks under (x, z).
func deck_height(x: float, z: float) -> float:
	var l := _local(x, z)
	return (prize.transform * Vector3(l.x, deck.deck_y(deck.main, l.x, l.y), l.y)).y


## Half the deck's width at her own z, less a body's girth.
func _room(lz: float, r: float) -> float:
	var t := clampf(deck.t_of(lz), deck.main.t0, deck.main.t1)
	return maxf(0.2, deck.main.half_width(t) - r - 0.08)


## A point of her own frame clamped onto the open deck, clear of masts, guns and hatches.
func _keep(l: Vector2, r: float) -> Vector2:
	for k in 2:
		for o in deck.obstacles:
			var dx := l.x - o.x
			var dz := l.y - o.y
			var d := Vector2(dx, dz).length()
			var mn := o.z + r
			if d >= mn:
				continue
			if d < 1e-4:
				l.x += mn
				continue
			l = Vector2(o.x + dx / d * mn, o.y + dz / d * mn)
		l.y = clampf(l.y, _z0 + r, _z1 - r)
		var w := _room(l.y, r)
		l.x = clampf(l.x, -w, w)
	return l


## Walks (x, z) by (dx, dz) over her deck, kept clear of everything on it.
func _deck_step(x: float, z: float, dx: float, dz: float, r: float) -> Vector2:
	var l := _keep(_local(x + dx, z + dz), r)
	return _world_of(l.x, l.y)


## Is a world point on her planks (with some slack)?
func holds(x: float, z: float, slack := 0.0) -> bool:
	if deck == null:
		return false
	var l := _local(x, z)
	return l.y > _z0 - slack and l.y < _z1 + slack and absf(l.x) < _room(l.y, 0.0) + slack


## Carries a walker posed flat (at its plank height in her frame) onto the
## rolling deck: into her frame, stood upright about its feet against the
## roll, then out through her transform. Also sets its world height, for
## blood and dust.
func _ride(w: ShoreWalker) -> void:
	var s := prize
	var l := _local(w.x, w.z)
	var foot := Vector3(l.x, deck.deck_y(deck.main, l.x, l.y), l.y)
	var flat := Transform3D(Basis(Vector3.UP, s.heading), Vector3(s.pos.x, 0.0, s.pos.z)).affine_inverse()
	var up := Transform3D(Basis(deck.upright), foot) * Transform3D(Basis.IDENTITY, -foot)
	w.xf = s.transform * up * flat * w.xf
	w.y = (s.transform * foot).y


# ---------------------------------------------------------------- per frame

## A frame ashore (or of the camps, seen from the sea): `focus` is where the
## camera looks, which wakes the camps near it.
func update(dt: float, world: World, inp: Steer, focus: Vector3) -> void:
	_world = world
	time += dt
	# hit-stop: the island freezes for a heartbeat as a heavy blow lands
	if _stop > 0.0:
		_stop -= dt
		dt *= 0.08
	var i := 0
	while i < _later.size():
		if time >= float(_later[i][0]):
			var fn: Callable = _later[i][1]
			_later.remove_at(i)
			fn.call()
		else:
			i += 1
	var all := _all
	all.clear()
	_hostile.clear()
	for c in camps:
		# (a fight on a ship's deck is no place to walk an island's cutthroats: they'd be walked on her planks)
		var live := deck == null and not c.empty and Vector2(float(c.site.x) - focus.x, float(c.site.z) - focus.z).length() < CAMP_LIVE
		if live != c.live:
			_set_live(c, live)
		_camp_fx(c, dt, world, focus)
		if live:
			all.append_array(c.gang)
	# a boarded ship's crew, and everyone the party may fight
	all.append_array(crew_foes)
	_hostile.append_array(all)
	var cap := captain if active else null
	if cap != null:
		for m in party:
			all.append(m.walker)
	if all.is_empty():
		return
	for w in all:
		w.tick(dt)
	# boarders still on their way across stay out of the scrum till they land
	_air.clear()
	if not _swings.is_empty():
		_update_swings(dt, world)
	var feet := all
	if not _air.is_empty():
		feet = _feet
		feet.clear()
		for w in all:
			if not _air.has(w):
				feet.append(w)
	if cap != null:
		if not _air.has(cap):
			_steer_captain(dt, inp, world)
		_think_party(dt)
	for c in camps:
		if c.live:
			_think_camp(c, dt, world)
	if deck != null:
		_think_deck(dt)
	_move(feet, dt)
	_resolve(feet, world)
	for w in all:
		var run := clampf((w.stride - ShoreWalker.WALK) / (ShoreWalker.RUN - ShoreWalker.WALK), 0.0, 1.0)
		w.animate(dt, world.time, run)
		_stand(w, dt, world)
		_blade_trail(w, world)
	_gather()


## The alert foes near the party, nearest first (for bars and the prompt).
func _gather() -> void:
	foes.clear()
	if not active or captain == null:
		return
	for c in camps:
		if not c.live or not c.alert:
			continue
		for w in c.gang:
			if w.alive() and Vector2(w.x - captain.x, w.z - captain.z).length() < 40.0:
				foes.append(w)
	for w in crew_foes:
		if w.alive() and w.yielded <= 0.0:
			foes.append(w)


func fighting() -> bool:
	return not foes.is_empty()


## The pistol's reload: 0 just fired .. 1 loaded.
func pistol_load() -> float:
	return 1.0 - pistol_t / PISTOL_RELOAD


## The captain, where you steer them: a walk, a run on Shift (or the stick
## pushed to its rim), a hop, the cutlass and the pistol.
func _steer_captain(dt: float, inp: Steer, world: World) -> void:
	var cap := captain
	if cap.is_down():
		cap.vx = 0.0
		cap.vz = 0.0
		return
	var len := minf(1.0, Vector2(inp.mx, inp.mz).length())
	# a jump: not mid-cut, not with the pistol up, not from deep water
	var hop := inp.jump and not cap.airborne() and cap.ready() and not cap.cutting() and cap.aim <= 0.0 and cap.wade < 0.5
	if hop and cap.jump():
		hopped.emit(true, 0.0, cap.wade > 0.08, deck != null)
	var fight := fighting()
	var top := ShoreWalker.RUN if inp.run and not cap.cutting() else ShoreWalker.WALK
	var wade := 1.0 - minf(0.5, cap.wade * 0.65)
	var busy := 0.25 if cap.cutting() else (0.35 if cap.aim > 0.0 else 1.0)
	var wx := (inp.mx if len > 0.02 else 0.0) * top * wade * busy
	var wz := (inp.mz if len > 0.02 else 0.0) * top * wade * busy
	# aloft there's little to push against: the jump carries the run-up
	var k := MathX.damp(10.0 if len > 0.02 else 14.0, dt) * (0.12 if cap.airborne() else 1.0)
	cap.vx += (wx - cap.vx) * k
	cap.vz += (wz - cap.vz) * k
	if len > 0.1 and not cap.cutting():
		cap.want_yaw = atan2(inp.mx, inp.mz)
	_still_t = 0.0 if len > 0.05 else _still_t + dt
	# the knot follows the way you walk, not every twitch of the stick
	if Vector2(cap.vx, cap.vz).length() > 1.0:
		_march += MathX.angle_delta(_march, atan2(cap.vx, cap.vz)) * MathX.damp(2.2, dt)

	# the cutlass: chain up to three cuts, the last a lunge
	_combo_t -= dt
	if inp.strike:
		if cap.cutting() and cap.cut_t > ShoreWalker.CUT_WIND[cap.cut]:
			_queued = true
		elif not cap.cutting():
			_cut_now(cap, inp)
	if not cap.cutting() and _queued:
		_queued = false
		_cut_now(cap, inp)
	if cap.cutting():
		_sheath_t = 0.0
	elif not fight:
		_sheath_t += dt
		if _sheath_t > 4.0:
			cap.armed = false
	if fight and not cap.armed:
		cap.armed = true

	# the pistol: one ball, a slow reload
	pistol_t = maxf(0.0, pistol_t - dt)
	if inp.pistol and pistol_t <= 0.0 and _shot_at < 0.0:
		var t := _pistol_target(cap, inp)
		if t != null:
			cap.want_yaw = atan2(t.x - cap.x, t.z - cap.z)
		elif inp.has_aim:
			cap.want_yaw = atan2(inp.aim.x - cap.x, inp.aim.y - cap.z)
		cap.target = t
		_shot_at = 0.0
		cap.aim = 1.0
	if _shot_at >= 0.0:
		_shot_at += dt
		if _shot_at > 0.24 and pistol_t <= 0.0:
			_fire(cap, world)
		if _shot_at > 0.7:
			_shot_at = -1.0
			cap.aim = 0.0
	cap.turn(dt, 16.0 if cap.cutting() else 11.0)


## A cut: locked onto whoever is in reach in front (or under the pointer).
func _cut_now(cap: ShoreWalker, inp: Steer) -> void:
	if _combo_t < 0.0:
		_combo = 0
	var c := _combo % 3
	var best: ShoreWalker = null
	var bs := INF
	var want := atan2(inp.aim.x - cap.x, inp.aim.y - cap.z) if inp.has_aim else cap.want_yaw
	for w in _hostile:
		if not w.standing():
			continue
		var d := Vector2(w.x - cap.x, w.z - cap.z).length()
		if d > 3.6:
			continue
		var off := absf(MathX.angle_delta(want, atan2(w.x - cap.x, w.z - cap.z)))
		var s := d + off * 1.6
		if s < bs:
			bs = s
			best = w
	if best != null:
		cap.want_yaw = atan2(best.x - cap.x, best.z - cap.z)
	elif inp.has_aim:
		cap.want_yaw = want
	cap.yaw += MathX.angle_delta(cap.yaw, cap.want_yaw) * 0.6
	if not cap.swing(c):
		return
	_combo += 1
	_combo_t = 0.95
	cap.cooldown = 0.04
	_sheath_t = 0.0
	if c == 2:
		# the lunge carries you in
		cap.kx += sin(cap.yaw) * 4.2
		cap.kz += cos(cap.yaw) * 4.2


func _pistol_target(cap: ShoreWalker, inp: Steer) -> ShoreWalker:
	var best: ShoreWalker = null
	var bs := INF
	var face := atan2(inp.aim.x - cap.x, inp.aim.y - cap.z) if inp.has_aim else cap.yaw
	for w in _hostile:
		if not w.standing():
			continue
		var d := Vector2(w.x - cap.x, w.z - cap.z).length()
		if d > PISTOL_RANGE:
			continue
		var off := absf(MathX.angle_delta(face, atan2(w.x - cap.x, w.z - cap.z)))
		var s := d * 0.15 + off * (3.0 if inp.has_aim else 1.2)
		if s < bs:
			bs = s
			best = w
	return best


## The flintlock goes off: a flash and a puff of smoke at the muzzle, the
## crack, and the ball finds its man (or not, at a long range).
func _fire(cap: ShoreWalker, world: World) -> void:
	pistol_t = PISTOL_RELOAD
	var t := cap.target
	# the muzzle sits at the end of the outstretched left arm
	var s := sin(cap.yaw)
	var c := cos(cap.yaw)
	var hand := Vector3(cap.x + s * 0.75 + c * 0.2, cap.y + 1.42, cap.z + c * 0.75 - s * 0.2)
	var fx := world.fx
	fx.emit(hand, Vector3.ZERO, 0.08, 0.5, 0.9, Color(9.0, 6.0, 2.4, 1.0), Color(4.0, 1.6, 0.3), 0.0, 0.0, Particles.SOFT, 0.001, Vector2.ZERO, 0.0, true)
	for i in 6:
		fx.emit(hand, Vector3(s * (1.5 + i * 0.5) + randf() - 0.5, 0.4 + randf() * 0.5, c * (1.5 + i * 0.5) + randf() - 0.5),
				1.6 + randf(), 0.25, 1.4 + randf(), Color(1.05, 1.03, 1.0, 0.5), Color(1.05, 1.03, 1.0), -0.25, 1.4, Particles.SMOKE, 0.02)
	_sound("pistol", hand)
	shook.emit(0.06)
	if t == null or not t.standing():
		return
	var dist := Vector2(t.x - cap.x, t.z - cap.z).length()
	if randf() > 0.95 - dist * 0.012:
		floated.emit("Missed", Vector3(t.x, t.y + 2.2, t.z), FLOAT_HIT)
		return
	_hurt(t, cap, 38.0 + randf() * 10.0, world, true, true)


# ---------------------------------------------------------------- the landing party's hands

func _think_party(dt: float) -> void:
	var cap := captain
	var hands: Array[ShoreWalker] = []
	for i in range(1, party.size()):
		hands.append(party[i].walker)
	var fight := fighting()
	_calm_t = 0.0 if fight else _calm_t + dt
	# a man down gets back up once the fighting is over
	for w in hands:
		if w.is_down() and _calm_t > 2.5 and w.down_t > 2.0:
			w.get_up(w.max_hp * 0.4)
	# regain breath between fights
	for m in party:
		var w := m.walker
		if not fight and not w.is_down() and time - w.last_hurt > 5.0:
			w.hp = minf(w.max_hp, w.hp + dt * 6.0)
	# who's going for the captain? the nearest free hand runs to stop them
	var covering := {}
	for f in foes:
		if f.target != cap or f.is_down() or Vector2(f.x - cap.x, f.z - cap.z).length() > 5.0:
			continue
		var best: ShoreWalker = null
		var bd := INF
		for h in hands:
			if not h.ready() or covering.has(h):
				continue
			var d := Vector2(h.x - f.x, h.z - f.z).length()
			if d < bd:
				bd = d
				best = h
		if best != null:
			covering[best] = f
	if not fight:
		_swap_sides(dt)
	for i in hands.size():
		var w := hands[i]
		if w.is_down() or _air.has(w):
			continue
		# pick a fight
		if fight:
			w.armed = true
			if covering.has(w):
				w.target = covering[w]
			if w.target == null or not w.target.standing() or Vector2(w.target.x - cap.x, w.target.z - cap.z).length() > 17.0:
				w.target = null
				var bd := INF
				for f in foes:
					if not f.standing():
						continue
					# spread out: a man already taken counts as further away
					var taken := 0
					for o in hands:
						if o != w and o.target == f:
							taken += 1
					var d := Vector2(f.x - w.x, f.z - w.z).length() + taken * 4.0 + (-3.0 if f.target == cap else 0.0)
					if d < bd:
						bd = d
						w.target = f
			if w.target != null:
				_duel(w, w.target, dt, i, 0.28)
				continue
		else:
			w.target = null
			if _calm_t > 3.0:
				w.armed = false
		_keep_up(w, party[i + 1].follow, i, dt, hands)
		w.turn(dt, 7.0)


## On the march: each hand walks his own line in a loose knot behind the
## captain, drifting about it, slower or quicker than the next man, setting
## off a beat late and stopping a few steps on, now and then stopping to
## look at something and jogging to catch up, chatting with his mate, the
## knot strung out at a run and bunched at a stroll.
func _keep_up(w: ShoreWalker, f: Follow, i: int, dt: float, hands: Array[ShoreWalker]) -> void:
	var cap := captain
	var cap_v := Vector2(cap.vx, cap.vz).length()
	var cap_run := clampf((cap_v - ShoreWalker.WALK) / (ShoreWalker.RUN - ShoreWalker.WALK), 0.0, 1.0)
	var marching := cap_v > 0.6
	var mate: ShoreWalker = hands[i ^ 1] if (i ^ 1) < hands.size() else null
	# drift about your place: a step out to the side, a little ahead, dropping back
	f.w_t -= dt
	if f.w_t <= 0.0:
		f.w_t = 2.5 + randf() * 4.0
		f.tx = (randf() - 0.5) * 2.0
		f.tz = (randf() - 0.5) * 1.6
	var kw := MathX.damp(0.5, dt)
	f.wx += (f.tx - f.wx) * kw
	f.wz += (f.tz - f.wz) * kw
	# a word with your mate as you go
	if marching and cap_run < 0.5 and mate != null and not mate.is_down():
		f.talk_t -= dt
		if f.talk_t <= 0.0:
			w.talking = not w.talking and not mate.talking and randf() < 0.55
			f.talk_t = 3.0 + randf() * 5.0 if w.talking else 4.0 + randf() * 9.0
	else:
		w.talking = false
	var chat := mate != null and not mate.is_down() and (w.talking or mate.talking) and Vector2(mate.x - w.x, mate.z - w.z).length() < 4.5
	# strung out at a run, bunched up at a stroll; talkers drift together
	var rx := (f.slot.x + f.wx * (1.0 if marching else 0.5)) * (0.75 if chat else 1.0)
	var rz := (f.slot.y + f.wz) * (1.0 + cap_run * 0.7)
	var sm := sin(_march)
	var cm := cos(_march)
	var lead := 0.3 if marching else 0.0
	var tx := cap.x + sm * rz - cm * rx + cap.vx * lead
	var tz := cap.z + cm * rz + sm * rx + cap.vz * lead
	var dx := tx - w.x
	var dz := tz - w.z
	var d := Vector2(dx, dz).length()
	# set off a beat after you're left a few steps behind; stop once there and the captain has
	if not f.going:
		f.rest_t += dt
		if d > 2.4 or (d > 1.4 and f.rest_t > 4.0):
			f.wait -= dt
			if f.wait <= 0.0:
				f.going = true
				f.wait = 0.15 + randf() * 0.55
				f.rest_t = 0.0
	elif not marching:
		# there, or stuck behind a rock or a mate: near enough
		f.rest_t = f.rest_t + dt if Vector2(w.vx, w.vz).length() < 0.35 else 0.0
		if d < 0.75 or f.rest_t > 1.2:
			f.going = false
			f.rest_t = 0.0
	# something caught his eye
	f.next_pause -= dt
	if f.next_pause <= 0.0 and marching and cap_run < 0.3 and d < 3.0 and f.pause_t <= 0.0:
		f.next_pause = 12.0 + randf() * 25.0
		f.pause_t = 0.8 + randf() * 1.4
		f.glance = (-1.0 if randf() < 0.5 else 1.0) * (0.6 + randf() * 0.5)
		f.glance_t = f.pause_t + 0.4
	f.glance_t -= dt
	if f.glance_t <= 0.0:
		f.glance_t = 2.0 + randf() * 4.0
		f.glance = (randf() - 0.5) * 1.5 if randf() < 0.4 else 0.0
	var sp := 0.0
	if f.pause_t > 0.0:
		f.pause_t -= dt
	elif f.going:
		# the captain's pace, a touch quicker to close a gap, a run to catch up when left behind
		sp = cap_v * f.pace + clampf((d - 0.5) * 1.3, -1.2, ShoreWalker.RUN)
		if d > 7.0:
			sp = maxf(sp, ShoreWalker.RUN * 0.95)
		if not marching:
			sp = minf(sp, clampf(d * 1.6, 0.9, ShoreWalker.WALK))
		sp = clampf(sp, 0.0, ShoreWalker.RUN * 1.08) * (1.0 - minf(0.45, w.wade * 0.6))
	var ux := dx / d if d > 1e-3 else 0.0
	var uz := dz / d if d > 1e-3 else 0.0
	# through a fort's gate rather than into its walls
	var r := via(w.x, w.z, w.x + dx, w.z + dz)
	var detour := r.x != w.x + dx or r.y != w.z + dz
	if detour:
		var rl := maxf(Vector2(r.x - w.x, r.y - w.z).length(), 1e-6)
		ux = (r.x - w.x) / rl
		uz = (r.y - w.z) / rl
	if marching and not detour:
		# near your place, walk the way the party walks rather than chasing the spot
		var bl := clampf(1.0 - d / 1.5, 0.0, 1.0) * 0.7
		ux = lerpf(ux, cap.vx / cap_v, bl)
		uz = lerpf(uz, cap.vz / cap_v, bl)
		var ul := maxf(Vector2(ux, uz).length(), 1e-6)
		ux /= ul
		uz /= ul
	# room to swing your arms
	var ex := 0.0
	var ez := 0.0
	for o in party:
		var m := o.walker
		if m == w or m.is_down():
			continue
		var ox := w.x - m.x
		var oz := w.z - m.z
		var e := Vector2(ox, oz).length()
		var room := 1.25 if m == cap else 1.05
		if e < room and e > 1e-3:
			ex += ox / e * (room - e)
			ez += oz / e * (room - e)
	# hemmed in against a rock or a trunk: a few steps aside, then on
	f.stuck = f.stuck + dt if sp > 1.0 and w.stride < 0.4 else maxf(0.0, f.stuck - dt)
	if f.stuck > 1.0:
		f.stuck = 0.0
		f.aside = (1.0 if fmod(w.seed, 2.0) < 1.0 else -1.0) * 0.9
	if f.aside != 0.0:
		var a := signf(f.aside)
		f.aside -= a * minf(absf(f.aside), dt)
		var px := -uz * a
		var pz := ux * a
		ux = ux * 0.3 + px
		uz = uz * 0.3 + pz
	var wx := ux * sp + ex * 2.0
	var wz := uz * sp + ez * 2.0
	var k := MathX.damp(3.4 if sp * sp > w.vx * w.vx + w.vz * w.vz else 4.5, dt)
	w.vx += (wx - w.vx) * k
	w.vz += (wz - w.vz) * k
	var v := Vector2(w.vx, w.vz).length()
	if f.going or f.pause_t > 0.0:
		if v > 0.5:
			w.want_yaw = atan2(w.vx, w.vz)
		w.idle = ShoreWalker.Idle.STAND
		w.idle_t = 0.0
		var look := clampf(MathX.angle_delta(w.yaw, atan2(mate.x - w.x, mate.z - w.z)), -1.1, 1.1) if chat else f.glance
		w.look_yaw += (look - w.look_yaw) * MathX.damp(4.0, dt)
	else:
		_at_ease(w, i, dt)
	# left far behind (a cliff between you): catch up out of sight
	if d > 45.0:
		w.place(tx, tz, _march)


## Two hands swap sides on the march now and then.
func _swap_sides(dt: float) -> void:
	if Vector2(captain.vx, captain.vz).length() < 0.6:
		return
	_swap_t -= dt
	if _swap_t > 0.0:
		return
	_swap_t = 15.0 + randf() * 25.0
	var a := 1 if randf() < 0.5 else 3
	if a + 1 >= party.size():
		return
	var fa := party[a].follow
	var fb := party[a + 1].follow
	var t := fa.slot
	fa.slot = fb.slot
	fb.slot = t


## Stood about while the captain looks around: watch the sea, chat, then sit down on the sand.
func _at_ease(w: ShoreWalker, i: int, dt: float) -> void:
	w.idle_t += dt
	if _still_t < 2.5:
		w.idle = ShoreWalker.Idle.STAND
		w.look_t -= dt
		if w.look_t < 0.0:
			w.look_t = 1.5 + randf() * 3.0
			w.look_yaw = (randf() - 0.5) * 1.6
		return
	if w.idle_t < 0.1 or (w.idle == ShoreWalker.Idle.STAND and w.idle_t > 3.0):
		var r := fmod(i * 0.37 + _still_t * 0.013 + w.seed, 1.0)
		if _still_t > 14.0 and i != 0:
			w.idle = ShoreWalker.Idle.GROUND
		elif r < 0.3:
			w.idle = ShoreWalker.Idle.WATCH
		elif r < 0.6:
			w.idle = ShoreWalker.Idle.CHAT
		elif r < 0.8:
			w.idle = ShoreWalker.Idle.LEAN
		else:
			w.idle = ShoreWalker.Idle.STAND
		w.idle_t = 0.2
	if w.idle == ShoreWalker.Idle.CHAT:
		# turn to the nearest mate
		var j := 1 + (i ^ 1)
		if j < party.size():
			var mate := party[j].walker
			w.want_yaw = atan2(mate.x - w.x, mate.z - w.z)
	elif w.idle == ShoreWalker.Idle.WATCH or w.idle == ShoreWalker.Idle.GROUND:
		# face the way the captain looks
		w.want_yaw = captain.yaw + (i - 1.5) * 0.25


## Fight `t`: close in at your own angle round them, circle, cut when ready, parry theirs.
func _duel(w: ShoreWalker, t: ShoreWalker, dt: float, k: int, parry: float) -> void:
	if not w.ready():
		w.vx *= 1.0 - MathX.damp(10.0, dt)
		w.vz *= 1.0 - MathX.damp(10.0, dt)
		return
	var dx := t.x - w.x
	var dz := t.z - w.z
	var d := maxf(Vector2(dx, dz).length(), 1e-3)
	w.want_yaw = atan2(dx, dz)
	# stand off at a spot round the target of your own, so a gang surrounds rather than stacks
	var ang := atan2(-dx, -dz) + sin(time * 0.5 + w.seed) * 0.5 + ((k % 3) - 1) * 0.35
	var want := 1.45
	# round a fort's walls to its gate, if they stand between
	var r := via(w.x, w.z, t.x + sin(ang) * want, t.z + cos(ang) * want)
	var ex := r.x - w.x
	var ez := r.y - w.z
	var ed := Vector2(ex, ez).length()
	var sp := ShoreWalker.RUN * 0.92 if d > 6.0 else (ShoreWalker.WALK * 1.25 if d > 2.4 else clampf(ed * 2.2, 0.0, 1.6))
	if ed > 0.15:
		w.vx += (ex / ed * sp - w.vx) * MathX.damp(7.0, dt)
		w.vz += (ez / ed * sp - w.vz) * MathX.damp(7.0, dt)
	else:
		w.vx *= 1.0 - MathX.damp(8.0, dt)
		w.vz *= 1.0 - MathX.damp(8.0, dt)
	if d > 6.0:
		w.want_yaw = atan2(w.vx, w.vz)
	# they're winding up at me: maybe get the blade across
	if t.cutting() and t.target == w and t.cut_t < ShoreWalker.CUT_WIND[t.cut] and w.parry <= 0.0 and not w.cutting() and d < 2.6 and randf() < parry * dt * 12.0:
		w.parry = 0.42
	if d < REACH + 0.2 and w.cooldown <= 0.0 and not w.cutting() and w.parry <= 0.0:
		w.swing(0 if randf() < 0.55 else 1)
		w.cooldown = (1.25 if w.team == ShoreWalker.Team.FOE else 1.0) + randf() * 0.6
	w.turn(dt, 10.0)


# ---------------------------------------------------------------- the camps

func _think_camp(c: Camp, dt: float, world: World) -> void:
	var cap := captain if active else null
	var f := c.fire()
	var alarm := FORT_ALARM if not c.fort.is_empty() else CAMP_ALARM
	var leash := FORT_LEASH if not c.fort.is_empty() else LEASH
	# the party comes too close: up and at them
	if not c.alert and not c.routed and cap != null and not defeated:
		var near := INF
		for m in party:
			var w := m.walker
			near = minf(near, Vector2(w.x - f.x, w.z - f.z).length() - alarm)
			for g in c.gang:
				if g.alive() and not g.is_down():
					near = minf(near, Vector2(w.x - g.x, w.z - g.z).length() - 9.0)
		if near < 0.0:
			_raise(c, world)
	for k in c.gang.size():
		var w := c.gang[k]
		if w.is_down():
			continue
		if c.alert and cap != null:
			# pick (or keep) a man to fight: the captain draws the most blades
			if w.target == null or w.target.is_down() or not w.target.alive() or randf() < dt * 0.15:
				var best: ShoreWalker = null
				var bd := INF
				for m in party:
					var p := m.walker
					if p.is_down():
						continue
					var taken := 0
					for o in c.gang:
						if o != w and o.target == p:
							taken += 1
					var d := Vector2(p.x - w.x, p.z - w.z).length() + taken * 3.0 - (2.5 if p == cap else 0.0)
					if d < bd:
						bd = d
						best = p
				w.target = best
			var t := w.target
			# too far from home and nobody pressing: give up and walk back
			if t == null or Vector2(t.x - f.x, t.z - f.z).length() > leash:
				w.target = null
				_go_home(w, c, k, dt)
				continue
			w.armed = true
			_duel(w, t, dt, k, 0.36 if w.max_hp > FOE_HP else 0.22)
			continue
		_go_home(w, c, k, dt)
	# a gang that's lost its quarry stands down
	if c.alert and not c.routed:
		var lost := true
		var home := true
		for w in c.gang:
			if not w.is_down() and w.target != null:
				lost = false
			if not w.is_down() and Vector2(w.x - f.x, w.z - f.z).length() >= (11.0 if not c.fort.is_empty() else 9.0):
				home = false
		if lost and (home or cap == null):
			c.alert = false
			for w in c.gang:
				w.armed = false
				if not w.is_down():
					w.hp = w.max_hp


## Back to your place by the fire (and, now and then, a stroll to another one).
func _go_home(w: ShoreWalker, c: Camp, k: int, dt: float) -> void:
	w.idle_t -= dt
	var s: Dictionary = c.spots[(k + (1 if w.idle_t < -40.0 else 0)) % c.spots.size()]
	if w.idle_t < -40.0:
		w.idle_t = 10.0 + randf() * 20.0
		# swap places with an empty spot
		var free: Array[Dictionary] = []
		for o in c.spots:
			var taken := false
			for g in c.gang:
				if g != w and Vector2(g.x - float(o.x), g.z - float(o.z)).length() < 0.6:
					taken = true
			if not taken:
				free.append(o)
		if not free.is_empty():
			s = free[randi() % free.size()]
	var r := via(w.x, w.z, float(s.x), float(s.z))
	var dx := r.x - w.x
	var dz := r.y - w.z
	var d := Vector2(float(s.x) - w.x, float(s.z) - w.z).length()
	if d > 0.35:
		var sp := minf(ShoreWalker.WALK if c.alert else 1.35, d * 1.5 + 0.3)
		var dl := maxf(Vector2(dx, dz).length(), 1e-6)
		w.vx += (dx / dl * sp - w.vx) * MathX.damp(5.0, dt)
		w.vz += (dz / dl * sp - w.vz) * MathX.damp(5.0, dt)
		w.want_yaw = atan2(dx, dz)
		w.idle = ShoreWalker.Idle.STAND
		w.seat_h = 0.0
	else:
		w.vx *= 1.0 - MathX.damp(8.0, dt)
		w.vz *= 1.0 - MathX.damp(8.0, dt)
		w.idle = s.idle
		w.seat_h = float(s.seat_h)
		w.want_yaw = float(s.yaw)
		if not c.alert:
			w.armed = false
	w.turn(dt, 6.0)


## To arms: every cutthroat up, blades out, a war cry; the party draws too.
func _raise(c: Camp, _world_: World) -> void:
	c.alert = true
	for w in c.gang:
		if w.is_down():
			continue
		w.armed = true
		w.shout = 0.9 + randf() * 0.4
		w.idle = ShoreWalker.Idle.STAND
		w.seat_h = 0.0
	_sound("war_cry", c.fire(), false, mini(5, c.gang.size()))
	for m in party:
		m.walker.armed = true
		if m.walker != captain:
			m.walker.shout = 0.6
	alarmed.emit(c)


# ---------------------------------------------------------------- movement

## Nobody stands inside anybody else; everyone steps over the ground,
## sliding along whatever stops them, their stride counted in footfalls.
func _move(all: Array[ShoreWalker], dt: float) -> void:
	var n := all.size()
	for i in n:
		var a := all[i]
		for j in range(i + 1, n):
			var b := all[j]
			var dx := a.x - b.x
			var dz := a.z - b.z
			var d2 := dx * dx + dz * dz
			var mn := 0.45 if a.is_down() or b.is_down() else 0.62
			if d2 > mn * mn or d2 < 1e-6:
				continue
			var d := sqrt(d2)
			var push := (mn - d) * 0.5 * minf(1.0, dt * 10.0)
			var ka := 0.2 if a.is_down() else 1.0
			var kb := 0.2 if b.is_down() else 1.0
			a.x += dx / d * push * ka
			a.z += dz / d * push * ka
			b.x -= dx / d * push * kb
			b.z -= dz / d * push * kb
	for w in all:
		var kd := MathX.damp(4.0 if w.is_down() else 7.0, dt)
		w.kx -= w.kx * kd
		w.kz -= w.kz * kd
		var mx := (0.0 if w.is_down() else w.vx) + w.kx
		var mz := (0.0 if w.is_down() else w.vz) + w.kz
		# sat or stood still by the fire: nothing to step
		if absf(mx) + absf(mz) < 1e-4 and w.stride < 0.01:
			w.stride = 0.0
			continue
		var px := w.x
		var pz := w.z
		var to := _deck_step(w.x, w.z, mx * dt, mz * dt, BODY) if deck != null else ground.step(w.x, w.z, mx * dt, mz * dt, BODY)
		w.x = to.x
		w.z = to.y
		var moved := Vector2(w.x - px, w.z - pz).length() / maxf(dt, 1e-4)
		w.stride += ((0.0 if w.is_down() else moved) - w.stride) * MathX.damp(12.0, dt)
		w.wade = 0.0 if deck != null else maxf(0.0, -ground.height(w.x, w.z))
		# no footfalls in mid-air
		if w.stride < 0.08 or w.airborne():
			continue
		# footfalls twice a stride: ~1.4 m walking, longer at a run
		var before := w.phase
		w.phase += moved * dt / w.step_len() * PI
		if floori(before / PI) != floori(w.phase / PI):
			_footfall(w)
		if w.phase > 1e4:
			w.phase -= PI * 2000.0


## Poses a walker onto whatever is under its feet (or in the air on a line).
func _stand(w: ShoreWalker, dt: float, world: World) -> void:
	if _air.has(w):
		w.place3((_swings[w] as Swing).y)
		return
	var g: float
	if deck != null:
		var l := _local(w.x, w.z)
		g = deck.deck_y(deck.main, l.x, l.y)
	else:
		g = ground.height(w.x, w.z)
	var hit := w.fly(dt, g)
	w.place3(g)
	if deck != null:
		_ride(w)
	if hit > 0.0:
		_touch_down(w, hit, world)


## Feet back on the ground after a jump: a thud, a puff of sand or a splash.
func _touch_down(w: ShoreWalker, hit: float, world: World) -> void:
	var k := clampf((hit - 2.0) / 4.0, 0.0, 1.0)
	var wet := w.wade > 0.08
	if w == captain:
		hopped.emit(false, k, wet, deck != null)
	if deck != null:
		return
	var y := world.water_height(w.x, w.z) if wet else w.y + 0.05
	var n := 10 if wet else 7
	var fx := world.fx
	for i in n:
		var a := float(i) / n * TAU + randf() * 0.5
		var sp := (1.6 if wet else 1.1) + randf() * 1.2
		if wet:
			fx.emit(Vector3(w.x, y, w.z), Vector3(sin(a) * sp + w.vx * 0.2, 1.8 + randf() * 1.8, cos(a) * sp + w.vz * 0.2),
					0.5 + randf() * 0.3, 0.1 + randf() * 0.08, 0.05, Color(1.3, 1.4, 1.45, 0.85), Color(1.3, 1.4, 1.45), 11.0, 0.8, Particles.SOFT, 0.01)
		else:
			fx.emit(Vector3(w.x + sin(a) * 0.2, y, w.z + cos(a) * 0.2), Vector3(sin(a) * sp, 0.4 + randf() * 0.5, cos(a) * sp),
					0.45 + randf() * 0.3, 0.12 + randf() * 0.1, 0.32, Color(0.95, 0.86, 0.68, 0.35), Color(0.95, 0.86, 0.68), 1.5, 3.5, Particles.SOFT, 0.02)


func _footfall(w: ShoreWalker) -> void:
	var wet := w.wade > 0.08
	if w == captain:
		stepped.emit(clampf(w.stride / ShoreWalker.RUN, 0.3, 1.0), wet, deck != null)
	if deck != null:
		return
	var fx := _world.fx
	if wet:
		if randf() < 0.7:
			var y := _world.water_height(w.x, w.z)
			for i in 3:
				fx.emit(Vector3(w.x, y, w.z), Vector3((randf() - 0.5) * 1.6 + w.vx * 0.2, 1.4 + randf() * 1.6, (randf() - 0.5) * 1.6 + w.vz * 0.2),
						0.5 + randf() * 0.3, 0.09 + randf() * 0.08, 0.05, Color(1.3, 1.4, 1.45, 0.85), Color(1.3, 1.4, 1.45), 11.0, 0.8, Particles.SOFT, 0.01)
	elif w.stride > 3.6 and randf() < 0.5:
		# sand kicked up at a run
		fx.emit(Vector3(w.x, w.y + 0.05, w.z), Vector3(-w.vx * 0.15, 0.5, -w.vz * 0.15),
				0.9, 0.25, 0.9, Color(0.95, 0.85, 0.66, 0.35), Color(0.95, 0.85, 0.66), 0.4, 2.2, Particles.SMOKE, 0.03)


## A pale smear of light along the cutlass's arc, from the wind-up through the blow.
func _blade_trail(w: ShoreWalker, world: World) -> void:
	var c := w.cut
	var on: bool = w.cutting() and w.cut_t > ShoreWalker.CUT_WIND[c] * 0.8 and w.cut_t < ShoreWalker.CUT_HIT[c] + 0.09 and w.palette >= 0 and not w.hidden
	if not on:
		w.tip_live = false
		return
	var tip := w.blade_at(1.0)
	var mid := w.blade_at(0.45)
	if w.tip_live:
		var n := mini(16, ceili(tip.distance_to(w.tip) / 0.07))
		# brightest through the blow itself
		var hot := clampf(1.4 - absf(w.cut_t - ShoreWalker.CUT_HIT[c]) * 9.0, 0.45, 1.0)
		for j in range(1, n + 1):
			var f := float(j) / n
			# a band from mid-blade out to the tip, thickest and brightest at the edge
			for e in 3:
				var along := e * 0.5
				var p0 := w.mid.lerp(w.tip, along)
				var p1 := mid.lerp(tip, along)
				var k := hot * (0.55 + 0.45 * along)
				world.fx.emit(p0.lerp(p1, f), Vector3.ZERO, 0.09 + 0.08 * f, 0.07 + 0.08 * along, 0.03,
						Color(1.6 * k, 1.68 * k, 1.85 * k, 0.3 + 0.3 * along), Color(0.35, 0.4, 0.5), 0.0, 0.0, Particles.SOFT, 0.005, Vector2.ZERO, 0.0, true)
	w.tip = tip
	w.mid = mid
	w.tip_live = true


# ---------------------------------------------------------------- blows

func _resolve(all: Array[ShoreWalker], world: World) -> void:
	for a in all:
		if not a.cutting() or a.hit_done or a.cut_t < ShoreWalker.CUT_HIT[a.cut] or a.is_down():
			continue
		a.hit_done = true
		var reach := LUNGE if a.cut == 2 else REACH
		var arc := 1.65 if a.cut == 1 else 1.05
		var hits: Array[ShoreWalker] = []
		for b in all:
			if b.team == a.team or not b.standing():
				continue
			var dx := b.x - a.x
			var dz := b.z - a.z
			if Vector2(dx, dz).length() > reach + 0.15:
				continue
			if absf(MathX.angle_delta(a.yaw, atan2(dx, dz))) > arc:
				continue
			hits.append(b)
		var at := Vector3(a.x + sin(a.yaw) * 1.1, a.y + 1.15, a.z + cos(a.yaw) * 1.1)
		if hits.is_empty():
			_sound("swish", at)
			continue
		# the backhand sweeps through two; the others find one
		hits.sort_custom(func(p: ShoreWalker, q: ShoreWalker) -> bool:
			return Vector2(p.x - a.x, p.z - a.z).length() < Vector2(q.x - a.x, q.z - a.z).length())
		var cap := a == captain
		for h in mini(hits.size(), 2 if a.cut == 1 else 1):
			var b := hits[h]
			var facing := absf(MathX.angle_delta(b.yaw, atan2(a.x - b.x, a.z - b.z))) < 1.3
			if b.parry > 0.0 and facing and not (cap and a.cut == 2):
				# steel meets steel
				_sparks(Vector3((a.x + b.x) * 0.5, a.y + 1.3, (a.z + b.z) * 0.5), world, 10)
				_sound("clash", at)
				a.stagger = 0.4
				a.cut_t = -1.0
				a.kx -= sin(a.yaw) * 1.6
				a.kz -= cos(a.yaw) * 1.6
				if cap or b == captain:
					shook.emit(0.05)
				continue
			var base: float = CAP_CUTS[a.cut] if cap else ((15.0 if a.max_hp > FOE_HP else 10.0) if a.team == ShoreWalker.Team.FOE else 12.0)
			_hurt(b, a, base * (0.85 + randf() * 0.3), world, a.cut == 2, cap)


## `b` takes a blow (or a ball) from `a`.
func _hurt(b: ShoreWalker, a: ShoreWalker, dmg: float, world: World, heavy: bool, by_captain: bool) -> void:
	b.hp -= dmg
	b.last_hurt = time
	b.flinch = 0.3
	# a blow cuts a wind-up short (the captain shrugs off a light one)
	if b.cutting() and (b != captain or heavy or b.cut_t < ShoreWalker.CUT_WIND[b.cut]):
		b.cut_t = -1.0
	var dx := b.x - a.x
	var dz := b.z - a.z
	var d := maxf(Vector2(dx, dz).length(), 1e-3)
	var push := 5.0 if heavy else 2.6
	b.kx += dx / d * push
	b.kz += dz / d * push
	if b.team == ShoreWalker.Team.FOE and b.target == null:
		b.target = a
	# a blade drawn on one of them is drawn on them all
	if b.team == ShoreWalker.Team.FOE and a.team != ShoreWalker.Team.FOE:
		var camp := _camp_of(b)
		if camp != null and not camp.alert and not camp.routed:
			_raise(camp, world)
	var at := Vector3(b.x, b.y + 1.2, b.z)
	_sound("thwack", at, heavy)
	_dust(at, world, 1.3 if heavy else 0.8)
	if by_captain:
		floated.emit("%d" % roundi(dmg), Vector3(b.x, b.y + 2.2, b.z), FLOAT_HIT)
		shook.emit(0.12 if heavy else 0.06)
		_stop = 0.085 if heavy else 0.05
	elif b == captain:
		floated.emit("-%d" % roundi(dmg), Vector3(b.x, b.y + 2.2, b.z), FLOAT_BAD)
		shook.emit(0.14)
	if b.hp > 0.0:
		return
	b.hp = 0.0
	b.knock_down()
	b.kx *= 1.4
	b.kz *= 1.4
	_sound("thwack", at, true, 1, 0.8)
	if by_captain:
		_stop = 0.12
	# a puff of sand where they land, and stars for the knocked-out
	_later.append([time + 0.38, func() -> void: _dust(Vector3(b.x, b.y + 0.2, b.z), world, 1.8)])
	for i in 4:
		world.fx.sparkle(Vector3(b.x, b.y + 0.4, b.z), 0.5, Color(1.4, 1.2, 0.5))
	if b == captain:
		defeated = true
		captain_fell.emit()
		return
	if b.team == ShoreWalker.Team.FOE:
		var boss := b.max_hp > FOE_HP
		fallen.emit(b, boss)
		# his spirit slips out of him once he's hit the sand
		_later.append([time + 0.85, func() -> void: _wisp(Vector3(b.x, b.y, b.z), world, boss)])
		var camp := _camp_of(b)
		if camp != null and not camp.routed:
			var all_down := true
			for w in camp.gang:
				if not w.is_down():
					all_down = false
			if all_down:
				_rout(camp)
		if crew_foes.has(b):
			_morale(world)


func _camp_of(w: ShoreWalker) -> Camp:
	for c in camps:
		if c.gang.has(w):
			return c
	return null


## The last cutthroat is down: the hands cheer, and the chest is yours.
func _rout(c: Camp) -> void:
	c.routed = true
	c.alert = false
	for m in party:
		var w := m.walker
		if w.is_down():
			continue
		w.target = null
		if w != captain:
			w.cheer = 2.6 + randf() * 0.6
	if captain != null and _world != null and _world.sound != null:
		_world.sound.cheer(0.8, 0.0, 0.0, 4)
	camp_routed.emit(c)


func _sparks(at: Vector3, world: World, n: int) -> void:
	for i in n:
		world.fx.emit(at, Vector3((randf() - 0.5) * 7.0, randf() * 4.5, (randf() - 0.5) * 7.0), 0.18 + randf() * 0.22, 0.08 + randf() * 0.06, 0.02,
				Color(9.0, 7.0, 3.2, 1.0), Color(4.0, 1.6, 0.3), 9.0, 1.2, Particles.SPARK, 0.001, Vector2.ZERO, 0.0, true)
	world.fx.emit(at, Vector3.ZERO, 0.08, 0.5, 0.9, Color(6.0, 5.0, 3.0, 1.0), Color(2.0, 1.0, 0.3), 0.0, 0.0, Particles.SOFT, 0.001, Vector2.ZERO, 0.0, true)


## Sand ashore; on a deck, a puff of old caulk and grime off the planks.
func _dust(at: Vector3, world: World, k: float) -> void:
	var on_deck := deck != null
	var c := Color(0.78, 0.74, 0.68, 0.3) if on_deck else Color(0.98, 0.9, 0.74, 0.42)
	for i in (2 if on_deck else 3) + roundi(k * 2.0):
		world.fx.emit(at + Vector3((randf() - 0.5) * 0.4, 0.0, (randf() - 0.5) * 0.4), Vector3((randf() - 0.5) * 2.0 * k, 0.4 + randf() * k, (randf() - 0.5) * 2.0 * k),
				0.7 + randf() * 0.5, 0.3 * k, (0.8 if on_deck else 1.1) * k, c, Color(c, 1.0), 0.3, 2.4, Particles.SMOKE, 0.02)


## A cutthroat's spirit leaving him: a pale wisp that curls up off the sand and fades.
func _wisp(at: Vector3, world: World, boss: bool) -> void:
	var n := 14 if boss else 9
	for i in n:
		var a := i * 0.9
		var r := 0.15 + randf() * 0.25
		world.fx.emit(at + Vector3(cos(a) * r, 0.2 + randf() * 0.6, sin(a) * r), Vector3(-sin(a) * 0.4, 1.2 + randf() * 1.4, cos(a) * 0.4),
				1.2 + randf() * 0.8, 0.22 + randf() * 0.15, 0.6, Color(0.7, 1.6, 1.25, 0.55), Color(0.3, 0.9, 0.7), -0.4, 0.8, Particles.SOFT, 0.15, Vector2.ZERO, 0.0, true)


## A sound out of the fight, where it happens: "swish", "clash", "thwack"
## (heavy or not), "pistol", or a war cry of `n` voices.
func _sound(kind: String, at: Vector3, heavy := false, n := 3, k := 1.0) -> void:
	if _world == null or _world.sound == null:
		return
	var h := _world.heard(at)
	var s := _world.sound
	match kind:
		"swish":
			s.swish(h.x * k, h.y)
		"clash":
			s.clash(h.x * k, h.y, h.z)
		"thwack":
			s.thwack(h.x * k, h.y, h.z, heavy)
		"pistol":
			s.pistol(h.x * k, h.y, h.z)
		"war_cry":
			s.war_cry(h.x * k, h.y, h.z, n)


# ---------------------------------------------------------------- the camps' fires, flags and chests

func _camp_fx(c: Camp, dt: float, world: World, focus: Vector3) -> void:
	var L := c.layout
	var f: Vector3 = L.fire
	var d := Vector2(f.x - focus.x, f.z - focus.z).length()
	# far out past the haze the whole camp leaves the scene
	var show := d < CAMP_SHOW
	if c.holder.visible != show:
		c.holder.visible = show
	if not show:
		return
	# the jolly roger flies downwind (and comes down when the camp is routed)
	if d < 520.0:
		c.flag.rotation.y = atan2(-world.wind.dir_z, world.wind.dir_x)
		if c.routed and c.strike < 1.0:
			c.strike = minf(1.0, c.strike + dt * 0.45)
			c.flag.position.y = (L.flag_top as Vector3).y - c.strike * float(L.get("flag_drop", 4.4))
			if c.strike >= 1.0:
				c.flag.visible = false
	# the lid swings open on its hinge
	if c.opened and c.open < 1.0:
		c.open = minf(1.0, c.open + dt * 1.6)
		var k := c.open
		c.lid.rotation.x = -1.95 * (1.0 - pow(1.0 - k, 3.0)) - sin(k * PI) * 0.12
	if d > 190.0 or dt <= 0.0:
		return
	# a crackling fire, its smoke, and the odd ember
	c.fire_t += dt * (11.0 if d < 90.0 else 5.0)
	var fx := world.fx
	while c.fire_t > 1.0:
		c.fire_t -= 1.0
		fx.emit(f + Vector3(randf_range(-0.22, 0.22), 0.1 + randf() * 0.15, randf_range(-0.22, 0.22)), Vector3(randf_range(-0.15, 0.15), randf_range(0.9, 1.8), randf_range(-0.15, 0.15)),
				randf_range(0.35, 0.6), randf_range(0.3, 0.5), 0.08, Color(6.0, 2.7, 0.7, 1.0), Color(2.6, 0.45, 0.07), 0.0, 0.0, Particles.SOFT, 0.04, Vector2.ZERO, randf_range(-2.0, 2.0), true)
		if randf() < 0.3:
			fx.emit(f + Vector3(randf_range(-0.2, 0.2), 0.9, randf_range(-0.2, 0.2)), Vector3(randf_range(-0.15, 0.15), randf_range(0.8, 1.4), randf_range(-0.15, 0.15)),
					randf_range(2.5, 4.0), 0.35, randf_range(1.6, 2.6), Color(0.3, 0.28, 0.27, 0.32), Color(0.55, 0.54, 0.53), -0.1, 0.35, Particles.SMOKE, 0.25)
	if randf() < dt * 2.5:
		fx.emit(f + Vector3((randf() - 0.5) * 0.4, 0.4, (randf() - 0.5) * 0.4), Vector3((randf() - 0.5) * 0.8, 2.0 + randf() * 2.0, (randf() - 0.5) * 0.8),
				1.0 + randf(), 0.07, 0.02, Color(8.0, 3.4, 0.8, 1.0), Color(3.0, 0.6, 0.1), -0.6, 0.6, Particles.SPARK, 0.01, Vector2.ZERO, 0.0, true)


# ---------------------------------------------------------------- the prompt

## What a tap (or F) would do here: {key, title, sub, ok}, or {}.
func prompt(ship_name: String) -> Dictionary:
	if not active or captain == null or captain.is_down() or defeated:
		return {}
	var cap := captain
	if deck != null:
		# back over your own rail while the fight goes against you
		if struck or not _swings.is_empty() or not _at_own_rail():
			return {}
		return {"key": "retreat", "title": "Fall back to the %s" % ship_name, "sub": "Cut the lines and leave her be", "ok": true}
	var b := _boat.position
	if Vector2(cap.x - b.x, cap.z - b.z).length() < 4.2:
		for f in foes:
			if not f.is_down() and Vector2(f.x - cap.x, f.z - cap.z).length() < 12.0:
				return {"key": "fight", "title": "Cutthroats on your heels", "sub": "Fight them off before you push off", "ok": false}
		return {"key": "boat", "title": "Row back to the %s" % ship_name, "sub": "The hands climb in and pull for the ship", "ok": true}
	var c := _chest_near()
	if c != null:
		if not c.fort.is_empty():
			if not c.routed:
				return {"key": "chest", "title": "The fort's strongbox", "sub": "Beat the garrison to claim it", "ok": false}
			return {"key": "chest", "title": "Open the fort's strongbox", "sub": "The garrison's pay chest is yours", "ok": true}
		if not c.routed:
			return {"key": "chest", "title": "A locked chest", "sub": "Rout the camp to claim it", "ok": false}
		return {"key": "chest", "title": "Open the cutthroats' chest", "sub": "Their plunder is yours", "ok": true}
	return {}


func _chest_near() -> Camp:
	if captain == null:
		return null
	for c in camps:
		if not c.live or c.opened:
			continue
		var at: Vector3 = c.layout.chest
		if Vector2(at.x - captain.x, at.z - captain.z).length() < (2.8 if not c.fort.is_empty() else 2.4):
			return c
	return null


## Acts on the prompt: "boat" to row back, else does the deed here (opens
## a routed camp's chest) and returns "".
func interact() -> String:
	var p := prompt("")
	if p.is_empty() or not bool(p.ok):
		return ""
	if p.key == "boat" or p.key == "retreat":
		return "boat"
	var c := _chest_near()
	if c != null and c.routed and not c.opened:
		c.opened = true
		var cap := captain
		var at: Vector3 = c.layout.chest
		cap.want_yaw = atan2(at.x - cap.x, at.z - cap.z)
		for m in party:
			if m.walker != cap and not m.walker.is_down():
				m.walker.cheer = 2.2
		if _world != null:
			_world.fx.treasure(at + Vector3(0.0, 0.6, 0.0), Color(1.4, 1.1, 0.5), 3)
		plundered.emit(c)
	return ""


# ---------------------------------------------------------------- forts' walls

## Where to head for, to get from (x, z) to (gx, gz): straight there, or
## round a fort's walls and through its gate if they stand in the way.
func via(x: float, z: float, gx: float, gz: float) -> Vector2:
	if deck != null:
		return Vector2(gx, gz)
	for c in camps:
		var f := c.fort
		if f.is_empty():
			continue
		var H := float(f.H)
		var reach := H + 40.0
		if absf(x - float(f.x)) > reach or absf(z - float(f.z)) > reach:
			continue
		var a := FortKit.to_fort(f, x, z)
		var b := FortKit.to_fort(f, gx, gz)
		var in_a := absf(a.x) < H and absf(a.y) < H
		var in_b := absf(b.x) < H and absf(b.y) < H
		if in_a and in_b:
			return Vector2(gx, gz)
		var t := b
		var mouth_in := -H + float(f.T) + 1.4
		var mouth_out := -H - 2.8
		var pad := float(f.get("pad", 1.0))
		if in_a:
			# in the plaza or the passage: to the gate, then out through it
			var passage := absf(a.x) < 1.5 and a.y < mouth_in + 0.4
			t = Vector2(0.0, mouth_out if passage else mouth_in)
		elif in_b:
			# outside, bound in: round to the gate's mouth, then in through it
			var at_gate := absf(a.x) < 1.7 and a.y > mouth_out - 0.9
			t = Vector2(0.0, mouth_in if at_gate else mouth_out)
			if not at_gate:
				t = _round_walls(a, t, H, pad)
		else:
			t = _round_walls(a, t, H, pad)
		if t == b:
			return Vector2(gx, gz)
		var wp := FortKit.to_world(f, t.x, t.y)
		return Vector2(wp.x, wp.z)
	return Vector2(gx, gz)


## From a (outside a fort of half-width H, fort frame) toward t: straight on, or to the corner that gets you round.
static func _round_walls(a: Vector2, t: Vector2, H: float, pad: float) -> Vector2:
	var E := H + maxf(0.6, pad * 0.5)
	if not _cuts(a, t, E):
		return t
	var C := H + pad + 2.4
	var best := t
	var bd := INF
	for k: Vector2 in [Vector2(C, C), Vector2(-C, C), Vector2(C, -C), Vector2(-C, -C)]:
		if _cuts(a, k, E):
			continue
		var d := a.distance_to(k) + k.distance_to(t) + (H * 2.0 if _cuts(k, t, E) else 0.0)
		if d < bd:
			bd = d
			best = k
	return best


## Does the segment a→b cut the square |x|, |z| < E? (Liang-Barsky)
static func _cuts(a: Vector2, b: Vector2, E: float) -> bool:
	var t0 := 0.0
	var t1 := 1.0
	var dx := b.x - a.x
	var dz := b.y - a.y
	var p := [-dx, dx, -dz, dz]
	var q := [a.x + E, E - a.x, a.y + E, E - a.y]
	for i in 4:
		var pi_: float = p[i]
		var qi: float = q[i]
		if pi_ == 0.0:
			if qi < 0.0:
				return false
			continue
		var r := qi / pi_
		if pi_ < 0.0:
			if r > t1:
				return false
			t0 = maxf(t0, r)
		else:
			if r < t0:
				return false
			t1 = minf(t1, r)
	return t1 - t0 > 1e-4
