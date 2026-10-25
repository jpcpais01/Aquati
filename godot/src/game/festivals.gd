class_name Festivals
extends RefCounted
## Runs every feast night (the web game's Festivals, src/port/festival.ts):
## counts the nights, picks tonight's towns, lights them up at dusk and puts
## them out before dawn, and for whichever towns are in sight puts on the
## show: rockets from the lighthouse (a grand finale at midnight), lantern
## boats set down on the water, the band.

## The lanterns are going up somewhere tonight: the towns, and whether it's the full-moon fair.
signal dusk(ports: Array[TradePort], full: bool)
## A town roaring at its finale.
signal cheered(port: TradePort)

## Fireworks over the harbour from this hour until a couple of hours after midnight.
const SHOW_FROM := 20.4
const SHOW_TO := 2.2
## How far off a town's show (rockets, lantern boats, the band) is still put on (m).
const SHOW_REACH := 1100.0
const BOATS_REACH := 700.0
const BAND_REACH := 340.0

## Nights since the voyage began (the count moves on at noon).
var night := 0
var full_moon := false
## A town held at its feast whatever the night (a set piece's --feast), -1
## none, and lantern boats already out off it at every new voyage (--boats).
var forced := -1
var strew := 0
var _tonight := PackedInt32Array()
var _last_day := -1.0
var _last_hour := 12.0
var _dusk := false
var _next := PackedFloat32Array()
var _boat_t := PackedFloat32Array()
var _tints: Array = []
var _queue: Array[Dictionary] = []
var _tune := 0
var _band_left := 0.0
var _ports: Array[TradePort] = []
var _sky: FireworkSky
var _boats: LanternBoats
var _sound: Node


func _init(ports: Array, sky: FireworkSky, boats: LanternBoats, sound: Node) -> void:
	_ports.assign(ports)
	_sky = sky
	_boats = boats
	_sound = sound
	for i in _ports.size():
		var p := _ports[i]
		_next.append(0.0)
		_boat_t.append(randf() * 3.0)
		var tints: Array[Color] = []
		for h: String in p.feast.colors:
			tints.append(Color(h).srgb_to_linear())
		_tints.append(tints)
		p.lantern_set.connect(func(at: Vector3) -> void: _launch_boat(i, at))


## A new voyage: the count starts again and every town is dark.
func reset() -> void:
	night = 0
	_last_day = -1.0
	_dusk = false
	_queue.clear()
	_boats.clear()
	for p in _ports:
		p.festive = 0.0
		p.market.bonus = 1.0
	if forced >= 0:
		_ports[forced].festive = 1.0
		strew_boats(forced, strew)


func _plan(day: float, phase: float) -> void:
	full_moon = Festival.moon_is_full(phase, day)
	_tonight = Festival.feast_ports(night, _ports.size(), full_moon)
	if forced >= 0 and not _tonight.has(forced):
		_tonight.append(forced)


## Whether a town keeps its feast tonight.
func keeps(port: TradePort) -> bool:
	return _tonight.has(_ports.find(port))


## The next feast night's news (tonight's, or the one under way): {towns
## (names), feast, line, full, when ("now" or "tonight")}, or {} for none.
func news(day: float, phase: float) -> Dictionary:
	var hour := day * 24.0
	var picked := _tonight
	var full := full_moon
	var now := Festival.level(hour) > 0.02
	# a morning's news is of the coming night, which the count reaches at noon
	if not now and hour < 12.0:
		full = Festival.moon_is_full(phase, day)
		picked = Festival.feast_ports(night + 1, _ports.size(), full)
	if picked.is_empty():
		return {}
	var towns: Array[String] = []
	for i in picked:
		towns.append(_ports[i].title)
	var first := _ports[picked[0]]
	return {"towns": towns, "feast": FULL_MOON_NAME if full else str(first.feast.name),
		"line": FULL_MOON_LINE if full else str(first.feast.line), "full": full, "when": "now" if now else "tonight"}


const FULL_MOON_NAME: String = Festival.FULL_MOON.name
const FULL_MOON_LINE: String = Festival.FULL_MOON.line


## A frame of the feasts: `dt` on the world's clock (0 while paused),
## `real_dt` for the band, `day` and `phase` the clock and the moon, `cam`
## the camera's position, `active` whether a voyage is under way (only then
## does dusk send word); `world` keeps the time and hears the band.
func update(dt: float, real_dt: float, world: World, day: float, phase: float, cam: Vector3, active: bool) -> void:
	# the count of nights moves on at noon
	if _last_day < 0.0:
		_plan(day, phase)
	elif _last_day < 0.5 and day >= 0.5 and day - _last_day < 0.25:
		night += 1
		_plan(day, phase)
	_last_day = day
	var hour := day * 24.0
	var midnight := _last_hour > 23.0 and hour < 1.0
	_last_hour = hour
	var level := Festival.level(hour)
	var is_dusk := level > 0.02 and not _tonight.is_empty()
	if is_dusk and not _dusk and active:
		var towns: Array[TradePort] = []
		for i in _tonight:
			towns.append(_ports[i])
		dusk.emit(towns, full_moon)
	_dusk = is_dusk

	var showing := hour >= SHOW_FROM or hour < SHOW_TO
	var glow: TradePort = null
	var gd := INF
	var band: TradePort = null
	var bd := INF
	var now := world.time
	for i in _ports.size():
		var p := _ports[i]
		var want := level if _tonight.has(i) else 0.0
		if i == forced:
			want = maxf(want, 1.0)
		if dt > 0.0:
			p.festive += (want - p.festive) * (1.0 - exp(-0.9 * dt))
		if absf(want - p.festive) < 0.002:
			p.festive = want
		p.market.bonus = 1.15 if p.festive > 0.5 else 1.0
		if p.festive < 0.05:
			continue
		var o := p.xf.origin
		var d := Vector2(cam.x - o.x, cam.z - o.z).length()
		if d < gd:
			gd = d
			glow = p
		if p.festive > 0.5 and d < bd:
			bd = d
			band = p
		if dt <= 0.0 or d > SHOW_REACH:
			continue
		# rockets off the lighthouse every few seconds, and the finale on the stroke of midnight
		if p.festive > 0.6 and (showing or i == forced) and now >= _next[i]:
			_next[i] = now + randf_range(4.5, 10.0)
			var shells: Array = p.feast.shells
			var n := 1 + randi() % 3
			var id: String = shells.pick_random()
			var ids: Array[String] = []
			for k in n:
				ids.append(str(shells.pick_random()) if randf() < 0.25 else id)
			_volley(p, ids, 0 if randf() < 0.6 else 1)
		if midnight and p.festive > 0.6:
			finale(p, now)
		# lantern boats: the fisherman sets most down off the end, the rest go in all along the quay
		if p.festive > 0.7 and d < BOATS_REACH:
			_boat_t[i] -= dt
			if _boat_t[i] <= 0.0:
				_boat_t[i] = randf_range(2.4, 4.8)
				if _boats.full():
					continue
				if randf() < 0.45:
					p.release()
				else:
					# clear of a ship lying alongside
					var x := (randf_range(-27.5, -25.0) if randf() < 0.5 else randf_range(21.0, 27.5)) if p.ship != null else randf_range(-27.5, 27.5)
					_launch_boat(i, p.xf * Vector3(x, 0.0, 1.2))
	for k in range(_queue.size() - 1, -1, -1):
		var q := _queue[k]
		if q.at > now:
			continue
		_queue.remove_at(k)
		if not (q.ids as Array).is_empty():
			_volley(q.port, q.ids, q.spot)
		else:
			cheered.emit(q.port)

	# the nearest lit town's glow on its quay and the water before it
	if glow != null and gd < 800.0:
		var gk := glow.festive * (1.0 - MathX.smooth(500.0, 800.0, gd))
		_sky.glow(glow.glow_at(), Vector3(1.0, 0.6, 0.3), 0.45 * gk)
	else:
		_sky.glow(Vector3.ZERO, Vector3.ONE, 0.0)

	# the band, heard across the water
	if band != null and bd < BAND_REACH and dt > 0.0:
		_band_left -= real_dt
		if _band_left <= 0.0:
			var h := world.heard(band.glow_at())
			_band_left = _sound.festival_tune(_tune, h.x * 0.24 * band.festive, h.y, h.z) - 0.01
			_tune += 1
	elif band == null or bd >= BAND_REACH:
		_band_left = 0.0


## Lantern boats already out off town i, as though it had been setting them
## down for a while (a set piece's --boats): strewn up to `reach` m out.
func strew_boats(i: int, n: int, reach := 70.0) -> void:
	var p := _ports[i]
	for k in n:
		var at := p.xf * Vector3(randf_range(-30.0, 30.0), 0.0, 1.5 + pow(randf(), 0.8) * reach)
		_launch_boat(i, at)
		var b: LanternBoats.Boat = _boats.boats.back()
		b.age = randf_range(1.0, 120.0)


func _launch_boat(i: int, at: Vector3) -> void:
	var p := _ports[i]
	_boats.launch(at.x, at.z, float(p.site.nx), float(p.site.nz), (_tints[i] as Array).pick_random())


func _volley(p: TradePort, ids: Array, spot: int) -> void:
	var from := p.launch_spot(spot)
	var n := ids.size()
	var nx := float(p.site.nx)
	var nz := float(p.site.nz)
	for k in n:
		# out over the harbour, fanned a little either side
		var a := ((float(k) / (n - 1) - 0.5) if n > 1 else 0.0) * 0.5 + randf_range(-0.2, 0.2) + (0.35 if spot else -0.35)
		var c := cos(a)
		var s := sin(a)
		_sky.launch(str(ids[k]), from, Vector3(nx * c - nz * s, 0.0, nx * s + nz * c), Vector3.ZERO, k, n)
	p.rocket(1.9)


## Midnight: the sky over the harbour thrown wide open.
func finale(p: TradePort, now: float) -> void:
	var sh: Array = p.feast.shells
	var plan := [
		[0.0, ["peony", "peony", "peony"], 0],
		[1.2, ["chrysanthemum", "chrysanthemum", "chrysanthemum"], 1],
		[2.6, [sh[0], "ring", sh[1]], 0],
		[4.2, ["crackle", "crackle", "crackle", "crackle"], 1],
		[6.4, ["fortune", "fortune", "fortune"], 0],
		[9.4, ["willow", "willow", "willow", "willow", "willow"], 1],
		[10.6, [sh[2], sh[3], sh[2]], 0],
	]
	for st: Array in plan:
		_queue.append({"at": now + float(st[0]), "port": p, "ids": st[1], "spot": st[2]})
	_queue.append({"at": now + 8.6, "port": p, "ids": [], "spot": 0})
	_queue.append({"at": now + 13.0, "port": p, "ids": [], "spot": 0})


## Shells and cheers still to come (for the checks).
func queued() -> int:
	return _queue.size()
