class_name Hunters
extends RefCounted
## The voyage's heat (the web game's heat and hunters, src/game/game.ts):
## the infamy your guns have earned this voyage, the wanted level it lights,
## and the Brethren's named captains it sends after you (Bounty), one at a
## time, a breather after each one claimed, and only once her ship is ready
## on the slipway (Shipyard.hunter). A new voyage starts cold.

## Infamy earned this voyage, hunters sent and claimed, and the breather
## (seconds) before the next may set out.
var pts := 0
var sent := 0
var claimed := 0
var cool := 0.0
## The captains met this voyage (id -> true), and the next one the Brethren will send.
var met := {}
var next := {}
## The named captains at sea: ship -> captain.
var ships := {}
## The nearest of them still afloat, and how far off (m); null none.
var near: Ship
var near_d := INF


## The wanted level (0 .. 5).
func level() -> int:
	return Bounty.wanted_level(pts)


## The Crown's extra on every pirate bounty for how hot the voyage runs.
func heat_k() -> float:
	return 1.0 + level() * Bounty.HEAT_BONUS


## A new voyage: no infamy, no hunters; the first to come is always one of
## the cheapest (a hull built for a later one is no use now).
func reset() -> void:
	pts = 0
	sent = 0
	claimed = 0
	cool = 0.0
	met.clear()
	ships.clear()
	near = null
	near_d = INF
	if not next.is_empty() and int(next.tier) != 1:
		next = {}
	if next.is_empty():
		next = Bounty.pick(Progress.bounty, 1, met)


## Infamy earned: [the wanted level before, after].
func add(n: int) -> Vector2i:
	var was := level()
	pts += n
	return Vector2i(was, level())


## Keeps the next captain chosen and the yard building her ship, finds the
## nearest hunter afloat, and sends the next once she's earned: true if one
## should set out now (`send` does it).
func step(dt: float, player: Ship, yard: Shipyard, high_seas: bool) -> bool:
	cool -= dt
	if next.is_empty():
		next = Bounty.pick(Progress.bounty, mini(5, sent + 1), met)
	yard.hunter = str(next.id)
	near = null
	near_d = INF
	for s: Ship in ships.keys():
		if not is_instance_valid(s) or not s.alive:
			continue
		var d := Vector2(s.pos.x - player.pos.x, s.pos.z - player.pos.z).length()
		if d < near_d:
			near_d = d
			near = s
	return near == null and player.alive and not high_seas and cool <= 0.0 \
			and Bounty.hunters_earned(pts) > sent and yard.count(next.cls, "hunter:" + str(next.id)) > 0


## The next captain sails in from over the horizon (null if there's no
## open water or her hull just went): the captain sent.
func send(player: Ship, pirates: Pirates, yard: Shipyard) -> Dictionary:
	var c := next
	var at: Variant = pirates.find_open_water(player.pos.x, player.pos.z, 470.0, 600.0)
	if at == null:
		return {}
	var model := yard.take(c.cls, "hunter:" + str(c.id))
	if model == null:
		return {}
	var p: Vector2 = at
	var heading := atan2(player.pos.x - p.x, player.pos.z - p.y)
	var ai := pirates.launch_hunter(c, model, p.x, p.y, heading)
	ships[ai.ship] = c
	next = {}
	sent += 1
	met[c.id] = true
	Progress.hunter_seen(str(c.id))
	return c


## A named captain gone (sunk, or her flag struck): her captain, if she was one.
func gone(s: Ship) -> Dictionary:
	var c: Dictionary = ships.get(s, {})
	ships.erase(s)
	return c
