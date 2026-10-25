class_name Convoys
extends RefCounted
## Merchant convoys of the high seas (the web's convoys.ts). Out on Mar
## Sereno, between the two archipelagos, the trading houses run their
## cargoes across in company: a tubby Ronvliet fluyt deep-laden with casks, a
## slim Aguadouro xebec under striped lateens carrying bullion, a little
## tan-sailed Vila Garoa ketch with tea and silk from the mist. Two or three
## sail together in line, at the pace of the slowest. Come alongside and hail
## one, and she heaves to and opens her hatches: she buys from your hold at
## her own house's prices and sells you what she carries. Fire on them (or
## ram one) and the whole convoy cracks on sail and runs, and will not trade
## with you.
##
## Every hull is a real ship off the shipyard's slipway (cargo lashed on
## deck, no guns), and the hulls that come home unscathed go back on it to
## be sent out again, so a convoy costs nothing to launch. They sail apart
## from the fighting ships: no pirate, gunner or fort aims at them.

const KINDS := ["fluyt", "xebec", "ketch"]

## Each house: what she is (for the toast and the market), her names and
## masters, what she carries in her hold (and sells you) and what she pays
## for yours, against the fair price.
const HOUSES := {
	"fluyt": {
		"title": "Ronvliet fluyt", "house": "Ronvliet Company",
		"names": ["Morgenster", "Goede Hoop", "Zeemeeuw", "Gouden Leeuw", "Witte Valk", "Vrouw Maria", "Drie Gebroeders", "Noordster"],
		"masters": ["Pieter Ronvliet", "Jan de Wit", "Hendrikje Smit", "Willem Kuyper", "Klaas Visser", "Anneke Brand"],
		"wares": ["rum", "cider", "brandy", "wine", "reserve", "coffee", "sugar", "cheese", "hardtack", "oranges", "saltfish", "tobacco", "spices", "saffron"],
		"tagline": "Casks and victuals from the distillery. She pays well for cloth, coin and gems.",
		"mult": {"cloth": 1.25, "coin": 1.1, "gems": 1.1, "jewellery": 1.05, "art": 1.0, "relics": 0.95, "provisions": 0.72, "spirits": 0.7},
	},
	"xebec": {
		"title": "Aguadouro xebec", "house": "Aguadouro Bullion Line",
		"names": ["Santa Luzia", "Estrela do Mar", "Flor de Prata", "Dom Sebastião", "Rainha do Sul", "Andorinha", "São Gabriel", "Boa Ventura"],
		"masters": ["Duarte Lemos", "Inês Barreto", "Afonso Carvalho", "Beatriz Sampaio", "Rodrigo Teles"],
		"wares": ["pennies", "cowries", "silver", "coral", "doubloons", "ingots", "pearls", "emeralds", "cameo", "ruby", "diamond"],
		"tagline": "Bullion out of the counting houses. She pays well for victuals, spirits and cloth.",
		"mult": {"provisions": 1.25, "spirits": 1.2, "cloth": 1.1, "art": 1.05, "relics": 1.0, "coin": 0.72, "gems": 0.72, "jewellery": 0.72},
	},
	"ketch": {
		"title": "Vila Garoa ketch", "house": "Vila Garoa tea packet",
		"names": ["Garça Branca", "Névoa", "Lua Rosa", "Bruma Doce", "Orvalho", "Lótus", "Grou", "Chuvisco"],
		"masters": ["Lin Garoa", "Amaya Teodoro", "Chen Bastos", "Rosa Nakamura", "Tomás Ito"],
		"wares": ["tea", "silk", "lace", "calico", "indigo", "rope", "pipe", "scrimshaw", "jade", "musicBox", "carpet"],
		"tagline": "Tea and silk out of the mist. She pays well for spirits, relics and gems.",
		"mult": {"spirits": 1.3, "relics": 1.2, "gems": 1.15, "coin": 1.0, "jewellery": 1.0, "provisions": 0.72, "art": 0.72, "cloth": 0.7},
	},
}

## Seconds after you reach the high seas before the first convoy can heave
## into sight, and between convoys.
const FIRST_WAIT := Vector2(30.0, 65.0)
const NEXT_WAIT := Vector2(120.0, 210.0)
## Beyond this from the camera's focus they're too far to see: no physics, no draw.
const FAR := 760.0
## An archipelago's islands lie inside this of its centre; past HIGH_SEAS_R lie the high seas.
const REGION_R := 960.0
const HIGH_SEAS_R := 1380.0
## How close (m, between the hulls' ends) she answers a hail.
const HAIL_R := 26.0

## A convoy came into sight.
signal sighted(c: Convoy)
## You fired on one (or rammed her): they all run.
signal scattered(c: Convoy, m: Merchant)


class Merchant:
	var ship: Ship
	var kind := ""
	var master := ""
	var market: Treasure.Market
	## Her counter: [{id, n, price, deal}], finest first (deal: priced under the fair value).
	var wares: Array[Dictionary] = []
	## Place in the line (0 leads), and her echelon offset off the leader's wake (m, + to port).
	var slot := 0
	var side := 0.0
	## Fired on (or rammed): she's broken up rather than sent out again with her scars.
	var struck := false

	func title() -> String:
		return str(HOUSES[kind].title)

	func house() -> String:
		return str(HOUSES[kind].house)


class Convoy:
	var fleet: Array[Merchant] = []
	## Where she's bound.
	var dest: Region
	## Seen from your deck yet (the toast).
	var sighted := false
	## Fired on: every hull runs from you and none will trade.
	var scattered := false
	## The ship you're alongside, trading (all the convoy heaves to).
	var parley: Merchant
	var t := 0.0


## The convoy at sea (one at a time), if any.
var convoy: Convoy
var world: World
var shipyard: Shipyard
var stage: Node3D
var _wait := randf_range(FIRST_WAIT.x, FIRST_WAIT.y)
var _crossing := false


func setup(p_world: World, p_yard: Shipyard, p_stage: Node3D) -> void:
	world = p_world
	shipyard = p_yard
	stage = p_stage


static func livery_of(kind: String) -> String:
	return "merchant-" + kind


## Her house's kind ("" for any ship that isn't a merchantman).
static func kind_of(s: Ship) -> String:
	return s.cls.id if s != null and s.team == Ship.Team.MERCHANT else ""


## The merchant houses' liveries (their flags are drawn with everyone's at the start).
static func liveries() -> Array[Livery]:
	var out: Array[Livery] = []
	for k: String in KINDS:
		out.append(Livery.named(livery_of(k)))
	return out


## Her manifest for this crossing: four to six lots of her house's goods,
## now and then one going cheap; finest first.
static func manifest(kind: String) -> Array[Dictionary]:
	var pool: Array = (HOUSES[kind].wares as Array).duplicate()
	var lots := 4 + randi() % 3
	var out: Array[Dictionary] = []
	# rarer goods turn up less often
	var weight := func(r: int) -> float: return [1.0, 0.75, 0.4, 0.14, 0.0][r]
	var deal := randf() < 0.6
	for i in lots:
		if pool.is_empty():
			break
		var tot := 0.0
		for id: String in pool:
			tot += weight.call(Treasure.rarity_of(id))
		var r := randf() * tot
		var k := 0
		while k < pool.size() - 1:
			r -= weight.call(Treasure.rarity_of(pool[k]))
			if r <= 0.0:
				break
			k += 1
		var id: String = pool[k]
		pool.remove_at(k)
		var rar := Treasure.rarity_of(id)
		var n := (2 + randi() % 3) if rar == 0 else ((1 + randi() % 3) if rar == 1 else ((1 + randi() % 2) if rar == 2 else 1))
		# the house's asking price: a little over fair, or a bargain to clear the hold
		# (her own goods never fetch that much back from her: she pays under 0.75 of fair for them)
		var cheap := deal and rar <= 2 and randf() < 0.5
		if cheap:
			deal = false
		var mult := (0.86 + randf() * 0.06) if cheap else (1.04 + randf() * 0.12)
		out.append({"id": id, "n": n, "price": maxi(1, roundi(Treasure.price_of(id) * mult)), "deal": cheap})
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return Treasure.price_of(a.id) > Treasure.price_of(b.id))
	return out


# ------------------------------------------------------------------ the yard

## The kinds the yard should lay down (none on the slipway, none at sea),
## told to the shipyard each frame.
func wanted() -> Array[String]:
	var out: Array[String] = []
	for k: String in KINDS:
		if shipyard.count(k, livery_of(k)) > 0:
			continue
		var afloat := false
		if convoy != null:
			for m in convoy.fleet:
				afloat = afloat or m.kind == k
		if not afloat:
			out.append(k)
	return out


## Hulls ready on the slipway.
func stocked() -> int:
	var n := 0
	for k: String in KINDS:
		n += shipyard.count(k, livery_of(k))
	return n


func merchant_of(s: Ship) -> Merchant:
	if convoy == null:
		return null
	for m in convoy.fleet:
		if m.ship == s:
			return m
	return null


# ------------------------------------------------------------------ at sea

## Sends a convoy out across `p`'s path, beyond the edge of what the camera
## sees (`view_r`): most head the other way and pass you; some sail your
## way, slower, so you overhaul them. `near`: right ahead, for testing.
func spawn(p: Ship, view_r: float, near := false) -> bool:
	if convoy != null or stocked() < 2 or world.regions.size() < 2:
		return false
	var A := world.regions[0]
	var B := world.regions[1]
	var u := Vector2(B.centre.x - A.centre.x, B.centre.z - A.centre.z)
	var ul := u.length()
	var f := Vector2(sin(p.heading), cos(p.heading))
	var along := f.dot(u) / ul
	var ahead := (A if randf() < 0.5 else B) if absf(along) < 0.3 else (B if along > 0.0 else A)
	var passing := near or randf() < 0.65
	var dest := (B if ahead == A else A) if passing else ahead
	var D := 150.0 if near else maxf(480.0, view_r + 260.0) * (1.0 if passing else 0.7)
	var sd := 1.0 if randf() < 0.5 else -1.0
	var off := (40.0 if near else (90.0 + randf() * 90.0 if passing else 50.0 + randf() * 60.0)) * sd
	var x := p.pos.x + f.x * D + f.y * off
	var z := p.pos.z + f.y * D - f.x * off
	# keep well inside the known sea: drawn in toward the lane between the archipelagos
	var a := Vector2(A.centre.x, A.centre.z)
	var q := Geometry2D.get_closest_point_to_segment(Vector2(x, z), a, a + u)
	var d := q.distance_to(Vector2(x, z))
	var lim := World.EDGE_R - 320.0
	if d > lim:
		x = q.x + (x - q.x) / d * lim
		z = q.y + (z - q.y) / d * lim
	# out on the open ocean, clear of every isle and reef
	for r in world.regions:
		if Vector2(r.centre.x - x, r.centre.z - z).length() < HIGH_SEAS_R + 120.0:
			return false
	var heading := atan2(dest.centre.x - x, dest.centre.z - z)

	# two or three hulls, the slowest leading so the line keeps together
	var ready: Array[String] = []
	for k: String in KINDS:
		if shipyard.count(k, livery_of(k)) > 0:
			ready.append(k)
	ready.shuffle()
	var n := 3 if ready.size() >= 3 and randf() < 0.45 else 2
	ready = ready.slice(0, n)
	ready.sort_custom(func(k1: String, k2: String) -> bool: return ShipClass.named(k1).max_speed < ShipClass.named(k2).max_speed)
	var c := Convoy.new()
	c.dest = dest
	var hx := sin(heading)
	var hz := cos(heading)
	var back := 0.0
	var prev: ShipClass = null
	for i in ready.size():
		var kind := ready[i]
		var model := shipyard.take(kind, livery_of(kind))
		var s := Ship.create(ShipClass.named(kind), model.livery, world, Ship.Team.MERCHANT, model)
		var h: Dictionary = HOUSES[kind]
		s.ship_name = str((h.names as Array).pick_random())
		for t in 6:
			var taken := false
			for o in c.fleet:
				taken = taken or o.ship.ship_name == s.ship_name
			if not taken:
				break
			s.ship_name = str((h.names as Array).pick_random())
		s.hardy = true
		if i > 0:
			back += (prev.length + s.cls.length) * 0.5 + 15.0
		prev = s.cls
		var side := 0.0 if i == 0 else (1.0 if i % 2 else -1.0) * (5.0 + randf() * 3.0)
		stage.add_child(s)
		s.place(x - hx * back + hz * side, z - hz * back - hx * side, heading)
		s.sail_target = 0.7
		s.sail_level = 0.7
		s.speed = s.cls.max_speed * 0.8
		world.ships.append(s)
		var m := Merchant.new()
		m.ship = s
		m.kind = kind
		m.master = str((h.masters as Array).pick_random())
		m.market = Treasure.Market.new(h.mult, h.tagline, randi() % 1000000)
		m.wares = manifest(kind)
		m.slot = i
		m.side = side
		c.fleet.append(m)
	convoy = c
	return true


## Back to the yard (unscathed hulls) or the breakers (the rest).
func _retire() -> void:
	var c := convoy
	convoy = null
	_wait = randf_range(NEXT_WAIT.x, NEXT_WAIT.y)
	if c == null:
		return
	for m in c.fleet:
		var s := m.ship
		world.ships.erase(s)
		if not is_instance_valid(s):
			continue
		if s.get_parent() != null:
			s.get_parent().remove_child(s)
		# (a hull that ever took a blow keeps its scars: she goes to the breakers)
		if not m.struck and s.alive and s.hp >= s.max_hp and s.last_hit < 0.0 and s.model.get_parent() == s:
			s.remove_child(s.model)
			s.model.transform = Transform3D.IDENTITY
			s.model.visible = true
			shipyard.keep(s.model)
		s.removed = true
		s.queue_free()


## Sails the convoy a frame (and now and then sends one out while you're on
## the high seas). `focus`: what the camera looks at; `view_r`: how far round
## it the view reaches.
func update(dt: float, p: Ship, focus: Vector3, view_r: float, high_seas: bool, can_spawn: bool) -> void:
	# the yard lays down what's wanted, first of all out on the high seas
	shipyard.trade = wanted()
	shipyard.trade_first = high_seas
	if high_seas != _crossing:
		_crossing = high_seas
		if high_seas:
			_wait = minf(_wait, randf_range(FIRST_WAIT.x, FIRST_WAIT.y))
	var c := convoy
	if c == null:
		if high_seas and can_spawn and p != null and p.alive and dt > 0.0:
			_wait -= dt
			if _wait <= 0.0 and not spawn(p, view_r):
				_wait = 4.0
		return
	if dt <= 0.0:
		return
	c.t += dt
	var lead := c.fleet[0].ship
	for m in c.fleet:
		_steer(m, c, lead, p)
	var far := true
	for m in c.fleet:
		var s := m.ship
		var d := Vector2(s.pos.x - focus.x, s.pos.z - focus.z).length()
		# over the horizon: just carried along her course, nothing drawn
		s.dormant = d >= FAR and c.parley == null
		s.visible = not s.dormant
		if not s.dormant:
			far = false
	var to_p := Vector2(lead.pos.x - p.pos.x, lead.pos.z - p.pos.z).length() if p != null else INF
	if not c.sighted and to_p < view_r + 120.0:
		c.sighted = true
		sighted.emit(c)
	# gone: well astern of you (or of a voyage that has ended), or come to her landfall
	var landfall := Vector2(lead.pos.x - c.dest.centre.x, lead.pos.z - c.dest.centre.z).length() < REGION_R + 380.0
	if c.parley == null and far and (to_p > 1250.0 or (not high_seas and to_p > 800.0) or (landfall and to_p > 500.0)):
		_retire()


## Line ahead behind the leader, at the leader's pace; or, scattered, every hull running from you.
func _steer(m: Merchant, c: Convoy, lead: Ship, p: Ship) -> void:
	var s := m.ship
	if c.parley != null:
		# hove to while you trade, sails half in
		s.anchored = true
		s.sail_target = 0.25
		s.rudder = 0.0
		return
	s.anchored = false
	var want: float
	if c.scattered and p != null:
		# away from you under every stitch she has, a little off the line so they spread
		want = atan2(s.pos.x - p.pos.x, s.pos.z - p.pos.z) + m.side * 0.04
		s.sail_target = 1.0
	elif m.slot == 0:
		want = atan2(c.dest.centre.x - s.pos.x, c.dest.centre.z - s.pos.z)
		# a long, easy pace the others can hold; off her landfall she shortens sail and lies to in the roads
		var home := Vector2(c.dest.centre.x - s.pos.x, c.dest.centre.z - s.pos.z).length()
		s.sail_target = 0.0 if home < REGION_R + 300.0 else (0.25 if home < REGION_R + 420.0 else 0.72)
	else:
		# her station: astern of the ship ahead, a little out to one side
		var ahead := c.fleet[m.slot - 1].ship
		var hx := sin(lead.heading)
		var hz := cos(lead.heading)
		var gap := (ahead.cls.length + s.cls.length) * 0.5 + 15.0
		var sx := ahead.pos.x - hx * gap + hz * m.side
		var sz := ahead.pos.z - hz * gap - hx * m.side
		# steer for a point a little ahead of the station, so she closes it smoothly
		want = atan2(sx + hx * 22.0 - s.pos.x, sz + hz * 22.0 - s.pos.z)
		var lag := (sx - s.pos.x) * hx + (sz - s.pos.z) * hz
		s.sail_target = clampf(lead.sail_level * (lead.cls.max_speed / s.cls.max_speed) + lag * 0.03, 0.15, 1.0)
	# give your ship a berth unless you're coming alongside slowly
	if p != null and p.alive and not c.scattered:
		var dx := p.pos.x - s.pos.x
		var dz := p.pos.z - s.pos.z
		var d := Vector2(dx, dz).length()
		var fwd := (dx * sin(s.heading) + dz * cos(s.heading)) / maxf(d, 1.0)
		if d < 45.0 and fwd > 0.5:
			want += (-1.0 if MathX.angle_delta(s.heading, atan2(dx, dz)) > 0.0 else 1.0) * 0.5 * (1.0 - d / 45.0)
	s.rudder = clampf(MathX.angle_delta(s.heading, want) * 1.8, -1.0, 1.0)


# ------------------------------------------------------------------ you and them

## The merchantman near enough `p` to hail, if any would answer.
func hailable(p: Ship) -> Merchant:
	var c := convoy
	if c == null or c.scattered or c.parley != null or not p.alive:
		return null
	var best: Merchant = null
	var bd := INF
	for m in c.fleet:
		var s := m.ship
		var d := Vector2(s.pos.x - p.pos.x, s.pos.z - p.pos.z).length() - (s.cls.length + p.cls.length) * 0.5
		if d < HAIL_R and d < bd:
			bd = d
			best = m
	return best


## She heaves to and comes alongside `p`, on whichever beam she lay; the rest of the line heaves to round you.
func parley(m: Merchant, p: Ship) -> void:
	var c := convoy
	if c == null:
		return
	c.parley = m
	var s := m.ship
	var pd := p.port_dir()
	var side := 1.0 if (s.pos.x - p.pos.x) * pd.x + (s.pos.z - p.pos.z) * pd.z >= 0.0 else -1.0
	var gap := (p.cls.beam + s.cls.beam) * 0.5 + 4.5
	s.place(p.pos.x + pd.x * side * gap, p.pos.z + pd.z * side * gap, p.heading)
	s.drift = Vector2.ZERO
	for o in c.fleet:
		o.ship.anchored = true
		o.ship.speed = 0.0
		o.ship.dormant = false
		o.ship.visible = true


## You cast off: she sails on with the convoy.
func release() -> void:
	var c := convoy
	if c == null or c.parley == null:
		return
	c.parley = null
	for o in c.fleet:
		o.ship.anchored = false
		o.ship.speed = o.ship.cls.max_speed * 0.25


## A blow from your side (a ball, a ram, the flames): the convoy scatters.
func offend(s: Ship, by: Ship) -> void:
	var c := convoy
	if c == null or by == null or by.team != Ship.Team.PLAYER:
		return
	var m := merchant_of(s)
	if m == null:
		return
	m.struck = true
	if c.scattered:
		return
	c.scattered = true
	scattered.emit(c, m)


## Every hull back in the yard (a fresh voyage).
func clear() -> void:
	_wait = randf_range(FIRST_WAIT.x, FIRST_WAIT.y)
	_crossing = false
	_retire()
	_wait = randf_range(FIRST_WAIT.x, FIRST_WAIT.y)
