class_name Escorts
extends RefCounted
## Your fleet afloat (Fleet): the roster's ships put to sea round you when
## you sail, each sailed by her captain (EscortAI) on her station, her hull
## and tally written back to the roster, struck off it when she goes down.

var world: World
## Where new ships are added.
var stage: Node3D
var ais: Array[EscortAI] = []
var order := "follow"


func setup(p_world: World, p_stage: Node3D) -> void:
	world = p_world
	stage = p_stage


## The escorts still afloat.
func ships() -> Array[Ship]:
	var out: Array[Ship] = []
	for ai in ais:
		if ai.ship.alive and not ai.ship.removed:
			out.append(ai.ship)
	return out


func ai_of(s: Ship) -> EscortAI:
	for ai in ais:
		if ai.ship == s:
			return ai
	return null


## The whole roster put to sea on their stations off `flag`.
func form(flag: Ship, roster: Array, p_order: String) -> void:
	clear()
	order = p_order
	for rec: Dictionary in roster:
		launch(rec, flag)


## One of the roster built and put to sea on her station off `flag` (hulls
## are built on the spot: it's under the veil, or at the quay).
func launch(rec: Dictionary, flag: Ship) -> EscortAI:
	var s := Ship.create(ShipClass.named(str(rec.cls)), Livery.named(str(rec.livery)), world, Ship.Team.PLAYER)
	s.escort = true
	s.ship_name = str(rec.name)
	stage.add_child(s)
	s.hp = s.max_hp * float(rec.hp)
	s.kills = int(rec.kills)
	world.ships.append(s)
	var ai := EscortAI.new(s, rec)
	ai.order = order
	ais.append(ai)
	_restation(flag)
	_put_on_station(ai, flag)
	return ai


## A ship already afloat signs on (a prize's crew turning their coats).
func adopt(s: Ship, rec: Dictionary, flag: Ship) -> EscortAI:
	s.team = Ship.Team.PLAYER
	s.escort = true
	s.prize = false
	s.lashed = false
	s.hunter = ""
	s.ship_name = str(rec.name)
	var ai := EscortAI.new(s, rec)
	ai.order = order
	ais.append(ai)
	_restation(flag)
	return ai


## Each one's station for the fleet as it stands.
func _restation(flag: Ship) -> void:
	var fl := flag.cls.length if flag != null else 30.0
	for i in ais.size():
		ais[i].slot = Fleet.station(i, ais.size(), fl, ais[i].ship.cls.length)


## Puts her on her station off `flag` at once, under way with her (or as
## near as open water allows).
func _put_on_station(ai: EscortAI, flag: Ship) -> void:
	var s := ai.ship
	var h := flag.heading
	var sh := sin(h)
	var ch := cos(h)
	var spots: Array[Vector2] = [ai.slot, Vector2(-ai.slot.x, ai.slot.y), ai.slot * 1.6, Vector2(ai.slot.x * 0.5, ai.slot.y * 2.2), Vector2(-ai.slot.x * 1.4, ai.slot.y * 1.8)]
	var at := Vector2(flag.pos.x + ch * ai.slot.x - sh * ai.slot.y, flag.pos.z - sh * ai.slot.x - ch * ai.slot.y)
	for sl in spots:
		var x := flag.pos.x + ch * sl.x - sh * sl.y
		var z := flag.pos.z - sh * sl.x - ch * sl.y
		if world.ground_height(x, z) < -s.cls.draft - 3.0 and world.past_edge(x, z).z < -40.0:
			at = Vector2(x, z)
			break
	s.place(at.x, at.y, h)
	s.anchored = false
	s.sail_target = flag.sail_target
	s.sail_level = flag.sail_level
	s.speed = flag.speed


## Everyone back on station off `flag` (she's just been put out past a quay's end).
func restation_now(flag: Ship) -> void:
	_restation(flag)
	for ai in ais:
		if ai.ship.alive:
			_put_on_station(ai, flag)


## Every escort lets go her anchor (or drops it, `on`: tied up alongside a
## quay, the fleet lies off it and waits).
func anchor(on: bool) -> void:
	for ai in ais:
		var s := ai.ship
		if not s.alive:
			continue
		s.anchored = on
		if on:
			s.sail_target = 0.0
			s.rudder = 0.0


## A frame of the fleet: `flag` your ship (null once she's gone), `foes`
## every hostile afloat, `mark` the ship your guns are laid on, `marks`
## anything else worth a broadside. Their crews patch them up between fights.
func update(dt: float, flag: Ship, foes: Array[Ship], mark: Ship, marks: Array[Vector3]) -> void:
	for ai in ais:
		var s := ai.ship
		if s.anchored and s.alive:
			s.rudder = 0.0
			continue
		ai.update(dt, world, flag, foes, mark, marks)
		if s.alive and world.time - s.last_hit > 9.0:
			s.hp = minf(s.max_hp, s.hp + s.max_hp * 0.01 * dt)


## One of ours went down: off the roster (and the fleet's tally of ships
## lost), her place closed up. Her roster entry, or {} if she wasn't ours.
func on_sunk(s: Ship, flag: Ship) -> Dictionary:
	var ai := ai_of(s)
	if ai == null:
		return {}
	ais.erase(ai)
	Progress.discharge(str(ai.rec.id), true)
	_restation(flag)
	return ai.rec


## Every ship's hull and tally written to the roster.
func sync() -> void:
	for ai in ais:
		if ai.ship.alive:
			Progress.keep_escort(str(ai.rec.id), ai.ship.hp / ai.ship.max_hp, ai.ship.kills)


## A standing order for the whole fleet.
func set_order(o: String) -> void:
	order = o
	for ai in ais:
		ai.order = o
	Progress.set_order(o)


## Pays one off: she leaves the fleet (and the sea) at once.
func dismiss(id: String, flag: Ship) -> void:
	for ai in ais:
		if str(ai.rec.id) == id:
			ai.ship.removed = true
			ais.erase(ai)
			break
	Progress.discharge(id)
	_restation(flag)


## Every escort gone from the sea (the voyage over): the sea's sweep takes the hulls.
func clear() -> void:
	for ai in ais:
		ai.ship.removed = true
	ais.clear()
