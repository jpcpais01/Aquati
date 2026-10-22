class_name Pirates
extends Node
## The Brethren at sea: pirate captains sent out a few at a time, more as
## your tally of sunk ships grows, sometimes a flotilla of a flagship and
## her wingmen in a loose vee. They are sighted far off in open water, left
## behind for good once you've sailed far past them on patrol, and paid for
## in gold when you sink them. Wrecks linger only a few at a time. Hulls come
## off the shipyard's slipway, so a new sail never stutters the frame.

const NAMES := [
	"Black Gull", "Salt Widow", "Crimson Tide", "Grim Mariner", "Sea Wraith", "Rusty Anchor", "Dread Marlin", "Bone Siren",
	"Gilded Shark", "Howling Jenny", "Midnight Eel", "Scarlet Kraken",
]
## The Crown's bounty on each class (gold).
const BOUNTY := {"sloop": 60, "brig": 110, "galleon": 220}
## Lasting wrecks kept afloat at once, and how far from you one may linger.
const MAX_WRECKS := 3
const WRECK_REACH := 520.0
## A pirate on patrol this far astern of you is let go.
const RECYCLE := 820.0

## A pirate went down to your guns: what she was worth.
signal bounty(ship: Ship, gold: int)

var world: World
var shipyard: Shipyard
## Where new ships are added.
var stage: Node3D
var ais := {}
var spawn_timer := 8.0
var voyage_time := 0.0
## Off for set pieces (screenshots of a quiet sea).
var enabled := true

var _name_idx := randi() % NAMES.size()


func setup(p_world: World, p_yard: Shipyard, p_stage: Node3D) -> void:
	world = p_world
	shipyard = p_yard
	stage = p_stage
	world.sunk.connect(_on_sunk)


func step(dt: float, player: Ship) -> void:
	voyage_time += dt
	for s: Ship in world.ships:
		var ai: PirateAI = ais.get(s)
		if ai != null:
			ai.update(dt, world, player)
		# the crew patches her up between fights
		if s.team == Ship.Team.PIRATE and s.alive and world.time - s.last_hit > 9.0:
			s.hp = minf(s.max_hp, s.hp + s.max_hp * 0.006 * dt)
	if enabled and player != null and player.alive:
		_recycle(player)
		_spawn(dt, player)
	_retire_wrecks(player)


## A pirate of the class, out of the yard's stock: null if none is ready yet
## (or, with `now`, built on the spot).
func launch(id: String, x: float, z: float, heading: float, kills: int = 0, now: bool = false) -> PirateAI:
	var model := shipyard.take(id) if shipyard != null else null
	if model == null and not now:
		return null
	var livery := model.livery if model != null else Livery.named(Shipyard.LIVERIES[randi() % Shipyard.LIVERIES.size()])
	var s := Ship.create(ShipClass.named(id), livery, world, Ship.Team.PIRATE, model)
	s.ship_name = NAMES[_name_idx % NAMES.size()]
	_name_idx += 1
	stage.add_child(s)
	s.place(x, z, heading)
	s.sail_target = 0.5
	s.sail_level = 0.5
	s.speed = s.cls.max_speed * 0.4
	world.ships.append(s)
	var ai := PirateAI.new(s, kills / 4.0)
	ais[s] = ai
	return ai


## Open water rMin..rMax from (cx, cz), in the same archipelago, clear of other ships.
func find_open_water(cx: float, cz: float, r_min: float, r_max: float) -> Variant:
	var home := world.region_at(cx, cz)
	for i in 80:
		var a := randf() * TAU
		var r := randf_range(r_min, r_max)
		var x := cx + cos(a) * r
		var z := cz + sin(a) * r
		if world.region_at(x, z) != home or world.past_edge(x, z).z > -80.0:
			continue
		if world.ground_height(x, z) > -9.0:
			continue
		var clear := true
		for s: Ship in world.ships:
			if Vector2(s.pos.x - x, s.pos.z - z).length() < 80.0:
				clear = false
				break
		if clear:
			return Vector2(x, z)
	return null


func _alive_pirates() -> int:
	var n := 0
	for s: Ship in world.ships:
		if s.team == Ship.Team.PIRATE and s.alive:
			n += 1
	return n


func _spawn(dt: float, player: Ship) -> void:
	var kills := player.kills
	var want := mini(4, 2 + floori(kills / 4.0))
	var alive := _alive_pirates()
	spawn_timer -= dt
	if alive >= want or spawn_timer > 0.0:
		return
	var room := want - alive
	var ok := false
	if room >= 2 and voyage_time > 60.0 and randf() < 0.25:
		ok = _flotilla(player, mini(room, 3))
	if not ok:
		ok = _single(player)
	# nothing on the slipway yet: try again in a moment
	spawn_timer = randf_range(12.0, 20.0) if ok else 1.0


func _pick_class(kills: int) -> String:
	var roll := randf()
	var id := "sloop" if roll < 0.48 else ("brig" if roll < 0.82 else "galleon")
	if kills < 2 and id == "galleon":
		id = "brig"
	# whatever's ready, if that one isn't
	if shipyard != null and shipyard.count(id) == 0:
		for alt: String in ["sloop", "brig"]:
			if shipyard.count(alt) > 0:
				return alt
	return id


func _single(player: Ship) -> bool:
	var at: Variant = find_open_water(player.pos.x, player.pos.z, 280.0, 480.0)
	if at == null:
		return false
	var p: Vector2 = at
	return launch(_pick_class(player.kills), p.x, p.y, randf() * TAU, player.kills) != null


## A flagship with her wingmen in a loose vee astern.
func _flotilla(player: Ship, size: int) -> bool:
	var flag_id := "galleon" if player.kills >= 4 and randf() < 0.6 else "brig"
	if shipyard != null and (shipyard.count(flag_id) == 0 or shipyard.count("sloop") + shipyard.count("brig") < size):
		return false
	var at: Variant = find_open_water(player.pos.x, player.pos.z, 360.0, 520.0)
	if at == null:
		return false
	var p: Vector2 = at
	var flag := launch(flag_id, p.x, p.y, randf() * TAU, player.kills)
	if flag == null:
		return false
	var pack := PirateAI.Pack.new()
	pack.leader = flag
	flag.pack = pack
	var fs := flag.ship
	var sh := sin(fs.heading)
	var ch := cos(fs.heading)
	for i in size - 1:
		var side := 1.0 if i % 2 == 0 else -1.0
		var rank := 1 + i / 2
		var slot := Vector2(side * 34.0 * rank, 30.0 * rank)
		var x := fs.pos.x + ch * slot.x - sh * slot.y
		var z := fs.pos.z - sh * slot.x - ch * slot.y
		if world.ground_height(x, z) > -9.0:
			var o: Variant = find_open_water(fs.pos.x, fs.pos.z, 50.0, 110.0)
			if o == null:
				continue
			x = (o as Vector2).x
			z = (o as Vector2).y
		var id := "sloop" if randf() < 0.65 else "brig"
		if shipyard != null and shipyard.count(id) == 0:
			id = "brig" if id == "sloop" else "sloop"
		var ai := launch(id, x, z, fs.heading, player.kills)
		if ai != null:
			ai.pack = pack
			ai.slot = slot
	return true


## Pirates left far astern on patrol are let go, so the seas stay busy round you.
func _recycle(player: Ship) -> void:
	for s: Ship in world.ships:
		var ai: PirateAI = ais.get(s)
		if ai == null or not s.alive or ai.mode != PirateAI.Mode.PATROL:
			continue
		if Vector2(s.pos.x - player.pos.x, s.pos.z - player.pos.z).length() > RECYCLE:
			s.removed = true


## Only the freshest few wrecks stay afloat near you; older or distant ones
## slip under now (never before they've settled, so the pose carries on).
func _retire_wrecks(player: Ship) -> void:
	var wrecks: Array[Ship] = []
	for s: Ship in world.ships:
		if not s.alive and s != player and s.sink_t < s.wreck_life:
			wrecks.append(s)
	if wrecks.is_empty():
		return
	var focus := player.pos if player != null else world.listener
	wrecks.sort_custom(func(a: Ship, b: Ship) -> bool: return a.sink_t < b.sink_t)
	for i in wrecks.size():
		var s := wrecks[i]
		var far := Vector2(s.pos.x - focus.x, s.pos.z - focus.z).length() > WRECK_REACH
		if i >= MAX_WRECKS or far:
			s.wreck_life = maxf(s.sink_t, 9.0)


func _on_sunk(ship: Ship, attacker: Ship) -> void:
	if ship.team != Ship.Team.PIRATE:
		return
	# the replacement waits until the wreck has settled; the yard rests while she goes
	spawn_timer = maxf(spawn_timer, 10.0)
	if shipyard != null:
		shipyard.rest(3.0)
	if attacker != null and attacker.team == Ship.Team.PLAYER:
		var gold: int = BOUNTY.get(ship.cls.id, 60)
		attacker.gold += gold
		bounty.emit(ship, gold)


## Lets every ship flagged gone leave the sea (and the scene).
func sweep() -> void:
	for i in range(world.ships.size() - 1, -1, -1):
		var s := world.ships[i]
		if not s.removed:
			continue
		world.ships.remove_at(i)
		ais.erase(s)
		s.queue_free()


## A fresh voyage: every pirate and wreck gone.
func clear(keep: Ship) -> void:
	for s: Ship in world.ships:
		if s != keep:
			s.removed = true
	sweep()
	spawn_timer = 8.0
	voyage_time = 0.0
