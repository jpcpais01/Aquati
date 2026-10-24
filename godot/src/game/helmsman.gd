class_name Helmsman
extends Node
## The helmsman (the web game's src/game/autopilot.ts): pick a place on the
## sea chart (a pin, a port, an isle), give the word, and he sails her there
## himself.
##
## The course is plotted through the voyage's waters (SeaNav, laid out for
## her hull when she weighs anchor) and pulled taut into a few long legs.
## While she sails only the leg in hand is looked at: a lookahead point along
## it to steer for, a corner ahead to shorten sail for, and when a leg runs
## into the eye of the wind, a beat to windward in long boards inside the
## clear water either side of it. The course is plotted afresh only when
## she's been pushed well off it or stops making way.
##
## Laying out the waters and plotting a course are a worker's jobs, one at
## a time: a course asked for comes back a frame or two later (`plotted`),
## and she sails on as she was meanwhile.

## A course set for the place asked for (`ok`), or no sea to sail there through.
signal plotted(ok: bool)
signal arrived(target: Target)
## He gives up the wheel (aground, boxed in): a line to say why.
signal gave_up(why: String)

enum State { IDLE, PLOTTING, SAILING, ARRIVED }

const DEG := PI / 180.0
## Off the eye of the wind a beat sails each board (relative to downwind,
## ~132°: the best way made good to windward).
const TACK := 48.0 * DEG
## A leg closer than this to the eye of the wind is beaten up in boards.
const BEAT_WITHIN := 40.0 * DEG
## Farthest she stands off a leg either way while beating up it (m).
const LANE := 110.0
## Out past this far from every archipelago's heart (m), the trade wind carries her.
const HIGH_SEAS_R := 1380.0
## Seconds she lies hove to at her mark, arrived, before he gives the wheel back.
const LINGER := 2.6


## Somewhere the captain asked to be taken.
class Target:
	## pin, port or isle.
	var kind := &"pin"
	var name := ""
	## The place itself (where the chart marks it).
	var x := 0.0
	var z := 0.0
	## Where she lies off it (a port's quay face, an isle's shore; the place itself for a pin).
	var aim := Vector2.ZERO
	## A waypoint's id: she's arrived once the pin is struck off.
	var pin := -1
	## A port: arrived as soon as she's within reach of its quay.
	var port: TradePort

	static func make(p_kind: StringName, p_name: String, p_x: float, p_z: float) -> Target:
		var t := Target.new()
		t.kind = p_kind
		t.name = p_name
		t.x = p_x
		t.z = p_z
		t.aim = Vector2(p_x, p_z)
		return t


var state := State.IDLE
var target: Target
## The canvas she cruises under: full, unless the captain trims it while he steers.
var cruise := 1.0
## The waters, laid out for the hull she sails (null until they are).
var nav: SeaNav

var _regions: Array[Region] = []
var _centres := PackedVector2Array()
var _soundings: Array = []
## The course: its legs' ends from where she was, and each one's course still to sail.
var _xs := PackedVector2Array()
var _rest := PackedFloat32Array()
var _short := false
var _leg := 0
## Her hard clearance (m): room round her hull to turn and lie (the web's hardR).
var _hard := 24.0
var _tack := 0
var _tack_t := 0.0
## A leg too hemmed in to beat up: she just pinches up it.
var _no_beat := -1
var _tacks := 0
var _about_t := 0.0
var _best := INF
var _best_t := 0.0
var _slow_t := 0.0
var _stuck := 0
var _replan_t := 0.0
var _speed_avg := 0.0
var _total := 1.0
var _arrived_t := 0.0
## Where she makes for (moved off any land onto open water once plotted).
var _goal := Vector2.ZERO
var _how := ""
## The worker's job in hand (-1 none), what it is, and what it left.
var _task := -1
var _job := &""
var _out := {}
## Jobs waiting: the waters for a hull ([draft, reach]), and a course;
## and the hull whose waters are being laid out.
var _want_nav: Array = []
var _laying: Array = []
var _want_plot := {}
## Bumped whenever the wish changes: a course plotted for an old one is dropped.
var _ticket := 0


## The archipelagos whose waters he'll sail.
func setup(regions: Array[Region]) -> void:
	_regions = regions
	_centres.clear()
	for r in regions:
		_centres.append(Vector2(r.centre.x, r.centre.z))


## The room a hull needs round her (m): a sloop ~25, a galleon ~33.
static func hard_reach(cls: ShipClass) -> float:
	return 16.0 + cls.length * 0.45 + cls.beam * 0.5


## Lays out the waters for her hull, if they aren't already (a new voyage, a new ship).
func prepare(cls: ShipClass) -> void:
	var want := [cls.draft, hard_reach(cls)]
	if (nav != null and [nav.draft, nav.reach] == want) or _want_nav == want or (_task >= 0 and _laying == want):
		return
	_want_nav = want
	_pump()


## Sets her on a course for `t`: plotted on a worker, `plotted` says how it went.
func engage(ship: Ship, t: Target) -> void:
	prepare(ship.cls)
	target = t
	_hard = hard_reach(ship.cls)
	_goal = t.aim
	cruise = 1.0
	_tack = 0
	_tacks = 0
	_stuck = 0
	_slow_t = 0.0
	_how = ""
	_speed_avg = absf(ship.speed)
	_xs = PackedVector2Array()
	state = State.PLOTTING
	_ticket += 1
	_want_plot = {"from": Vector2(ship.pos.x, ship.pos.z), "goal": _goal, "fresh": true, "draft": ship.cls.draft, "reach": _hard, "ticket": _ticket}
	_pump()


## The captain takes the helm back (or the voyage moves on): she sails on as she is.
func disengage() -> void:
	state = State.IDLE
	target = null
	_xs = PackedVector2Array()
	_rest = PackedFloat32Array()
	_want_plot = {}
	_ticket += 1


## He has the wheel, or is plotting the course to take it with.
func active() -> bool:
	return state == State.SAILING or state == State.PLOTTING


## Whether her course came up short of the goal (walled in by land or coral).
func short() -> bool:
	return _short


## The course still ahead of her, from `from` (her bow) to the goal, for the charts.
func route(from: Vector3) -> PackedVector2Array:
	var out := PackedVector2Array()
	if state != State.SAILING or _xs.size() < 2:
		return out
	out.append(Vector2(from.x, from.z))
	for i in range(_leg + 1, _xs.size()):
		out.append(_xs[i])
	return out


## The HUD's view of her progress ({} while he isn't at the helm): the place's
## name, metres still to sail along the course ("left"), the share of it
## behind her ("done"), seconds to go at her recent speed ("eta", -1 while
## she's barely moving), how she's sailing ("how") and whether she's "arrived".
func view(ship: Ship) -> Dictionary:
	if target == null or _xs.size() < 2 or not (state == State.SAILING or state == State.ARRIVED):
		return {}
	var left := 0.0
	if state == State.SAILING:
		left = _xs[_leg + 1].distance_to(Vector2(ship.pos.x, ship.pos.z)) + _rest[_leg + 1]
	return {
		"name": target.name,
		"left": left,
		"done": clampf(1.0 - left / _total, 0.0, 1.0),
		"eta": left / _speed_avg if _speed_avg > 1.0 else -1.0,
		"how": _how if _how != "" else "Setting sail",
		"arrived": state == State.ARRIVED,
	}


func _process(_dt: float) -> void:
	_pump()


func _exit_tree() -> void:
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1


# ------------------------------------------------------------------ the worker


## Takes in a job done, and sets the next going: the waters first, then a course.
func _pump() -> void:
	if _task >= 0:
		if not WorkerThreadPool.is_task_completed(_task):
			return
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
		_finish()
	if not _want_nav.is_empty():
		var w := _want_nav
		_want_nav = []
		_laying = w
		_job = &"nav"
		_task = WorkerThreadPool.add_task(_lay_out.bind(_soundings, float(w[0]), float(w[1])), false, "Helmsman: the waters")
		return
	if _want_plot.is_empty():
		return
	var req := _want_plot
	if nav == null or [nav.draft, nav.reach] != [req.draft, req.reach]:
		# (her hull's waters aren't laid out: they come first)
		_want_nav = [req.draft, req.reach]
		_pump()
		return
	_want_plot = {}
	_job = &"plot"
	_task = WorkerThreadPool.add_task(_plot.bind(nav, req), false, "Helmsman: a course")


## (a worker) Sounds the archipelagos once, then lays out their waters for a hull.
func _lay_out(soundings: Array, draft: float, reach: float) -> void:
	var s := soundings
	if s.size() != _regions.size():
		s = []
		for r in _regions:
			s.append(SeaNav.Soundings.take(r))
	_out = {"soundings": s, "nav": SeaNav.build(s, _centres, draft, reach)}


## (a worker) Plots a course through `waters`.
func _plot(waters: SeaNav, req: Dictionary) -> void:
	var a: Vector2 = req.from
	var g: Vector2 = req.goal
	_out = {"req": req, "course": waters.plot(a.x, a.y, g.x, g.y)}


func _finish() -> void:
	var out := _out
	_out = {}
	if _job == &"nav":
		_soundings = out.soundings
		nav = out.nav
		_laying = []
		return
	var req: Dictionary = out.req
	if int(req.ticket) != _ticket or target == null:
		return
	var c: Dictionary = out.course
	var fresh: bool = req.fresh
	if c.is_empty():
		if fresh:
			state = State.IDLE
			target = null
			plotted.emit(false)
		else:
			disengage()
			gave_up.emit("No clear water to sail on through")
		return
	_xs = c.xs
	_rest = c.rest
	_short = c.short
	_goal = c.goal
	_no_beat = -1
	_leg = 0
	_best = INF
	_best_t = 0.0
	_replan_t = 1.5
	if fresh:
		_total = maxf(1.0, _rest[0])
		state = State.SAILING
		plotted.emit(true)


## Plots again from where she is, to the same goal (she sails on meanwhile).
func _replot(ship: Ship) -> void:
	_replan_t = INF
	_want_plot = {"from": Vector2(ship.pos.x, ship.pos.z), "goal": _goal, "fresh": false, "draft": ship.cls.draft, "reach": _hard, "ticket": _ticket}
	_pump()


# ------------------------------------------------------------------ the helm


## Each frame while she's under the helmsman: sets her rudder and her sail.
## `pin_gone`: the waypoint she's bound for was just struck off.
func steer(ship: Ship, dt: float, wind: Wind, hulls: Array[Ship], pin_gone: bool) -> void:
	if state == State.ARRIVED:
		_arrived_t += dt
		if _arrived_t > LINGER:
			disengage()
		return
	if state != State.SAILING or _xs.size() < 2 or target == null:
		return
	var x := ship.pos.x
	var z := ship.pos.z
	var n := _xs.size()
	# move on to the next leg once she's abreast of this one's end (or cut the corner)
	while _leg < n - 2:
		var a0 := _xs[_leg]
		var e0 := _xs[_leg + 1]
		var l0 := e0 - a0
		var l2 := l0.length_squared()
		var u0 := ((x - a0.x) * l0.x + (z - a0.y) * l0.y) / (l2 if l2 > 0.0 else 1.0)
		if u0 > 0.995 or Vector2(e0.x - x, e0.y - z).length() < maxf(26.0, _hard):
			_leg += 1
			_tack = 0
			continue
		break
	var i := _leg
	var a := _xs[i]
	var b := _xs[i + 1]
	var length := a.distance_to(b)
	if length <= 0.0:
		length = 1.0
	var dir := (b - a) / length
	var u := clampf(((x - a.x) * dir.x + (z - a.y) * dir.y) / length, 0.0, 1.0)
	# how far she stands off the leg, signed by which side
	var side := (x - a.x) * dir.y - (z - a.y) * dir.x
	var to_end := Vector2(b.x - x, b.y - z).length()
	var left := to_end + _rest[i + 1]
	_speed_avg += (absf(ship.speed) - _speed_avg) * minf(1.0, dt * 0.5)

	# ---- arrived?
	var last_leg := i >= n - 2
	var arrive_r := 16.0 if target.kind == &"pin" else 30.0
	var in_reach := target.port != null and left < 120.0 and target.port.in_reach(ship.pos)
	if pin_gone or in_reach or (last_leg and to_end < arrive_r):
		ship.sail_target = 0.0
		ship.rudder = 0.0
		state = State.ARRIVED
		_arrived_t = 0.0
		_how = "Arrived"
		arrived.emit(target)
		return

	# ---- pushed well off the course, or making no way: plot again from here
	_replan_t -= dt
	if left < _best - 4.0:
		_best = left
		_best_t = 0.0
	else:
		_best_t += dt
	_slow_t = _slow_t + dt if _speed_avg < 0.8 else 0.0
	if _speed_avg > 2.5:
		_stuck = 0
	var balked := _slow_t > 9.0 or _best_t > 30.0
	if _replan_t <= 0.0 and (absf(side) > (LANE + 70.0 if _tack != 0 else 95.0) or balked):
		if balked:
			_stuck += 1
			if _stuck >= 4:
				disengage()
				gave_up.emit("She can make no headway: take the helm")
				return
		_slow_t = 0.0
		_replot(ship)

	# ---- where to point her
	var upwind := atan2(-wind.dir_x, -wind.dir_z)
	var leg_brg := atan2(dir.x, dir.y)
	var open := MathX.smooth(HIGH_SEAS_R - 150.0, HIGH_SEAS_R + 450.0, _offshore(x, z))
	var off := MathX.angle_delta(upwind, leg_brg)
	var beat := open < 0.5 and _no_beat != i and to_end > 90.0 and absf(off) < BEAT_WITHIN
	var want := 0.0
	_tack_t += dt
	_about_t -= dt
	if beat:
		# long boards either side of the leg, coming about at the edge of the clear water
		if _tack == 0:
			_tack = 1 if MathX.angle_delta(upwind, ship.heading) >= 0.0 else -1
		var h := upwind + _tack * TACK
		# which way this board carries her across the leg
		var drift := 1.0 if sin(MathX.angle_delta(leg_brg, h)) > 0.0 else -1.0
		var half := minf(LANE, maxf(26.0, to_end * 0.42))
		var past_lane := drift * side > half
		# and never stand on into danger
		var blind := _blind(x, z, h)
		if (past_lane and _tack_t > 6.0) or (blind and _tack_t > 3.0):
			var h2 := upwind - _tack * TACK
			if blind and _blind(x, z, h2):
				# hemmed in on both boards: no room to tack here, pinch up the leg as she can
				_no_beat = i
				_tack = 0
			else:
				_tack = -_tack
				_tack_t = 0.0
				_tacks += 1
				_about_t = 4.0
				h = h2
		want = h if _tack != 0 else leg_brg
	else:
		_tack = 0
		# chase a point a little way along the course
		var rem := clampf(absf(ship.speed) * 2.6 + 22.0, 26.0, 75.0)
		var on := a + dir * u * length
		var q := on
		var k := i
		while true:
			var e := _xs[k + 1]
			var d := q.distance_to(e)
			if d >= rem or k >= n - 2:
				q += (e - q) * (minf(1.0, rem / d) if d > 0.0 else 0.0)
				break
			rem -= d
			q = e
			k += 1
		# pulled well wide of the course, come back to it more squarely
		var back := clampf(absf(side) / 60.0, 0.0, 1.0)
		want = atan2(q.x - x, q.y - z)
		if back > 0.4:
			want = atan2(q.x - x + (on.x - x) * back, q.y - z + (on.y - z) * back)
	# the current and her leeway set her sideways: lay off a little for it
	if Vector2(ship.vel.x, ship.vel.z).length() > 2.0:
		want -= clampf(MathX.angle_delta(ship.heading, atan2(ship.vel.x, ship.vel.z)), -0.3, 0.3) * 0.8
	# give way to any hull close under her bow
	for o in hulls:
		if o == ship or not o.alive:
			continue
		var ox := o.pos.x - x
		var oz := o.pos.z - z
		var dd := sqrt(ox * ox + oz * oz)
		if dd > 85.0 or dd < 1.0:
			continue
		var rel := MathX.angle_delta(ship.heading, atan2(ox, oz))
		if absf(rel) > 0.75:
			continue
		want -= (1.0 if rel >= 0.0 else -1.0) * (1.0 - dd / 85.0) * 0.65
	var err := MathX.angle_delta(ship.heading, want)
	ship.rudder = clampf(err * 2.4, -1.0, 1.0)

	# ---- how much canvas
	var sail := cruise
	# swinging round onto a new heading: less way, a tighter turn
	if absf(err) > 1.3:
		sail = minf(sail, 2.0 / 3.0)
	# a sharp corner coming up: shorten sail into it
	if not last_leg and not beat:
		var nxt := _xs[i + 2] - b
		var turn := absf(MathX.angle_delta(leg_brg, atan2(nxt.x, nxt.y)))
		if turn > 1.0 and to_end < 60.0 + absf(ship.speed) * 4.0:
			sail = minf(sail, 1.0 / 3.0 if turn > 2.0 else 2.0 / 3.0)
	# the last stretch: easing in, so she glides up to her mark and stops gently
	# (into the wind she's slow enough already; running free she takes in canvas)
	if left < 170.0:
		var vt := clampf((left - 8.0) / 13.0, 1.6, 12.0)
		sail = minf(sail, cruise * clampf(vt / maxf(0.5, absf(ship.speed)), 0.12, 1.0))
	ship.sail_target = sail

	# ---- the word on the HUD
	if left < 170.0:
		_how = "Easing in"
	elif absf(ship.speed) < 1.2:
		_how = "Making sail"
	elif beat:
		_how = "Coming about" if _about_t > 0.0 else ("Beating to windward · tack %d" % _tacks if _tacks > 0 else "Beating to windward")
	elif absf(err) > 1.3:
		_how = "Bringing her round"
	elif open > 0.5:
		_how = "The trade wind carries her"
	else:
		var rel_deg := absf(MathX.angle_delta(atan2(wind.dir_x, wind.dir_z), ship.heading)) / DEG
		if rel_deg < 50.0:
			_how = "Running before the wind"
		elif rel_deg < 120.0:
			_how = "On a broad reach"
		else:
			_how = "Close-hauled" if Ship.wind_factor(rel_deg) < 0.5 else "On a reach"


## Danger within a board's length ahead on heading `h`.
func _blind(x: float, z: float, h: float) -> bool:
	if nav == null:
		return false
	var sx := sin(h)
	var sz := cos(h)
	for d: float in [40.0, 80.0, 120.0]:
		if nav.clear_at(x + sx * d, z + sz * d) < _hard * 0.9:
			return true
	return false


## How far she is from the nearest archipelago's heart.
func _offshore(x: float, z: float) -> float:
	var best := INF
	for c in _centres:
		best = minf(best, Vector2(c.x - x, c.y - z).length())
	return best
