class_name Gunnery
extends Node3D
## Lays your broadsides, and only shows itself in a fight. Each side's guns
## cover a fan off the beam; a foe inside a loaded fan is locked, and only
## then does anything show in the world: a warm lantern glow gathers on the
## water round her hull, rippling with the swell. That is the moment to fire.
## The guns lead for both ships' way. With a mouse, the side you point into is
## the side you fire, and with no foe in it the shot goes where you point.
## The web game's Gunnery.

## A mark set out past a target standing high above the sea (a fort's gun,
## Forts.MARK_REACH): how far past the guns' usual reach it may lie.
const MARK_REACH := 1.3

## One side's guns: loaded or not, and what they are laid on.
class Broadside:
	## +1 port, -1 starboard.
	var side := 1
	var ready := true
	## Reload, 0 just fired .. 1 run out.
	var progress := 1.0
	## The foe these guns are laid on, if one sits inside the fan.
	var target: Ship
	## Or a mark that isn't a ship (a fort's gun), laid on at `impact`.
	var mark := false
	## Where the balls will fall (led), while aim_dist >= 0.
	var impact := Vector3.ZERO
	var aim_dist := -1.0
	## The mouse points into this side.
	var hover := false

	func _init(s: int) -> void:
		side = s


## A side has just finished loading, in a fight.
signal loaded(side: int)

var port := Broadside.new(1)
var starboard := Broadside.new(-1)
## A foe is close enough to fight.
var combat := false
## The nearest foe within reach, locked or not.
var focus: Ship
## The point on the sea under the mouse, or null (touch, or no pointer).
var pointer: Variant = null
## Marks on the sea that aren't ships (Forts.marks: where a ball fired flat
## for that range arcs through a fort's gun), set each frame by the game.
var marks: Array[Vector3] = []
## The nearest thing to fight is one of those marks.
var focus_mark := false

var _glow: MeshInstance3D
var _glow_mat: ShaderMaterial
var _glow_alpha := 0.0
var _pointer_side := 0
# _predict's answers: the reach the guns are laid for, where the balls fall, and the led point
var _reach := 0.0
var _impact := Vector3.ZERO
var _lead := Vector3.ZERO


func _ready() -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(2.0, 2.0)
	_glow_mat = ShaderMaterial.new()
	_glow_mat.shader = preload("res://shaders/gunnery_glow.gdshader")
	_glow = MeshInstance3D.new()
	_glow.mesh = plane
	_glow.material_override = _glow_mat
	_glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_glow.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	_glow.visible = false
	add_child(_glow)


func side_of(s: int) -> Broadside:
	return port if s > 0 else starboard


## Lays the guns on `foe`: fills _reach (the horizontal reach the guns are
## elevated for), _lead (the point they train on, relative to this ship,
## since the balls keep her way) and _impact (where on the sea they fall:
## where the foe will be when they arrive).
func _predict(p: Ship, foe: Ship) -> void:
	var v := p.muzzle_speed()
	var g := Ship.GRAVITY
	var rvx := foe.vel.x - p.vel.x
	var rvz := foe.vel.z - p.vel.z
	var tof := Vector2(foe.pos.x - p.pos.x, foe.pos.z - p.pos.z).length() / v
	for i in 2:
		_lead = Vector3(foe.pos.x + rvx * tof, 0.0, foe.pos.z + rvz * tof)
		_reach = Vector2(_lead.x - p.pos.x, _lead.z - p.pos.z).length()
		var e := 0.5 * asin(clampf(g * _reach / (v * v), 0.0, 1.0))
		tof = _reach / (v * cos(e))
	_impact = Vector3(foe.pos.x + foe.vel.x * tof, 0.0, foe.pos.z + foe.vel.z * tof)


## The side a point lies on (+1 port), and how far across that side's fan
## (|u| <= 1 inside, + toward the quarter).
func _bearing_u(p: Ship, x: float, z: float) -> Vector2:
	var rel := MathX.angle_delta(p.heading, atan2(x - p.pos.x, z - p.pos.z))
	return Vector2(1.0 if rel > 0.0 else -1.0, (absf(rel) - PI * 0.5) / Ship.PLAYER_ARC)


func update(dt: float, p: Ship, world: World, playing: bool, now: float) -> void:
	if p == null or not p.alive or not playing:
		_set_glow(null, dt, world, now)
		combat = false
		focus = null
		focus_mark = false
		port.target = null
		starboard.target = null
		port.mark = false
		starboard.mark = false
		return
	var R := p.gun_range()
	var r0 := p.cls.beam * 0.5 + 1.5

	# the side the mouse points into, and where on the water
	_pointer_side = 0
	if pointer != null:
		var pt: Vector3 = pointer
		if Vector2(pt.x - p.pos.x, pt.z - p.pos.z).length() < R * 1.35:
			_pointer_side = int(_bearing_u(p, pt.x, pt.z).x)

	# lay each side on the best foe inside its fan
	var best := {1: [null, INF], -1: [null, INF]}
	focus = null
	var focus_d := R * 1.3
	for s: Ship in world.ships:
		if s == p or not s.alive or s.removed or s.team == p.team or s.team == Ship.Team.MERCHANT or s.prize or s.lashed:
			continue
		var raw := Vector2(s.pos.x - p.pos.x, s.pos.z - p.pos.z).length()
		if raw > R * 1.4:
			continue
		if raw < focus_d:
			focus_d = raw
			focus = s
		_predict(p, s)
		var b := _bearing_u(p, _lead.x, _lead.z)
		# a hair of grace at the edges: the hull's length of guns covers it
		if absf(b.y) > 1.08 or _reach > R:
			continue
		var sd := int(b.x)
		var score := _reach + absf(b.y) * 60.0
		if _pointer_side == sd and pointer != null:
			var pt: Vector3 = pointer
			score = Vector2(pt.x - s.pos.x, pt.z - s.pos.z).length()
		if score < float(best[sd][1]):
			best[sd] = [s, score]
	# and the marks that aren't ships: they stand still, so no leading
	focus_mark = false
	for m in marks:
		var raw := Vector2(m.x - p.pos.x, m.z - p.pos.z).length()
		if raw > R * 1.4:
			continue
		if raw < focus_d:
			focus_d = raw
			focus = null
			focus_mark = true
		var b := _bearing_u(p, m.x, m.z)
		if absf(b.y) > 1.08 or raw > R * MARK_REACH or raw < r0 + 3.0:
			continue
		var sd := int(b.x)
		var score := raw + absf(b.y) * 60.0
		if _pointer_side == sd and pointer != null:
			var pt: Vector3 = pointer
			score = Vector2(pt.x - m.x, pt.z - m.z).length()
		if score < float(best[sd][1]):
			best[sd] = [m, score]
	combat = focus != null or focus_mark

	for st: Broadside in [port, starboard]:
		var i := Ship.side_index(st.side)
		var was := st.ready
		st.ready = p.reload[i] <= 0.0
		st.progress = p.readiness(st.side)
		var pick: Variant = best[st.side][0]
		st.mark = pick is Vector3
		st.target = null if st.mark else pick
		st.hover = _pointer_side == st.side
		st.aim_dist = -1.0
		if st.mark:
			st.impact = pick
			st.aim_dist = Vector2(st.impact.x - p.pos.x, st.impact.z - p.pos.z).length()
		elif st.target != null:
			_predict(p, st.target)
			st.impact = _impact
			st.aim_dist = Vector2(_impact.x - p.pos.x, _impact.z - p.pos.z).length()
		elif st.hover and pointer != null:
			st.impact = _clamp_point(p, st.side, pointer, R, r0)
			st.aim_dist = Vector2(st.impact.x - p.pos.x, st.impact.z - p.pos.z).length()
		if st.ready and not was and combat:
			loaded.emit(st.side)

	# the glow only gathers on a foe the loaded guns are laid on: the moment to fire
	var auto := auto_side(p)
	var lock: Ship = null
	if auto != 0:
		var st := side_of(auto)
		if st.ready:
			lock = st.target
	_set_glow(lock, dt, world, now)


## A point on the water clamped into a side's fan.
func _clamp_point(p: Ship, side: int, pt: Vector3, R: float, r0: float) -> Vector3:
	var rel := MathX.angle_delta(p.heading, atan2(pt.x - p.pos.x, pt.z - p.pos.z))
	var u := clampf((absf(rel) - PI * 0.5) / Ship.PLAYER_ARC, -1.0, 1.0)
	var a := p.heading + side * (PI * 0.5 + u * Ship.PLAYER_ARC)
	var d := clampf(Vector2(pt.x - p.pos.x, pt.z - p.pos.z).length(), r0 + 10.0, R)
	return Vector3(p.pos.x + sin(a) * d, 0.0, p.pos.z + cos(a) * d)


func _set_glow(mark: Ship, dt: float, world: World, now: float) -> void:
	_glow_alpha = minf(1.0, _glow_alpha + dt * 2.5) if mark != null else maxf(0.0, _glow_alpha - dt * 2.5)
	_glow.visible = _glow_alpha > 0.01
	if not _glow.visible:
		return
	_glow_mat.set_shader_parameter("strength", _glow_alpha * _glow_alpha * (3.0 - 2.0 * _glow_alpha))
	_glow_mat.set_shader_parameter("clock", fmod(now, 1000.0))
	if mark == null:
		return
	var size := mark.cls.length * 0.95
	_glow_mat.set_shader_parameter("plane", size)
	_glow_mat.set_shader_parameter("half_hull", Vector2(mark.cls.beam * 0.5 + 0.4, mark.cls.length * 0.5 + 0.4))
	_glow.transform = Transform3D(Basis(Vector3.UP, mark.heading).scaled(Vector3(size, 1.0, size)), Vector3(mark.pos.x, world.water_height(mark.pos.x, mark.pos.z) + 0.2, mark.pos.z))


## The broadside the one-button fire (Space, the big Fire button) should
## loose: +1 port, -1 starboard, 0 none.
func auto_side(p: Ship) -> int:
	var pt := port.target != null or port.mark
	var stt := starboard.target != null or starboard.mark
	var pd := port.aim_dist if pt else INF
	var sd := starboard.aim_dist if stt else INF
	# a loaded side with a foe in it beats everything
	if pt and port.ready and (not stt or not starboard.ready or pd <= sd):
		return 1
	if stt and starboard.ready:
		return -1
	# a foe in a fan that's still loading: that side (it'll say it's loading)
	if pt or stt:
		return 1 if pd <= sd else -1
	# nobody in the fans: the side facing the nearest foe
	if focus != null:
		return int(_bearing_u(p, focus.pos.x, focus.pos.z).x)
	return 0


## The side the mouse points into, or 0.
func hover_side() -> int:
	return _pointer_side


## Lays a broadside from `side`: on its foe, or where the mouse points, or
## square off the beam at a good fighting range. Returns whether she fired.
func fire(p: Ship, side: int) -> bool:
	var st := side_of(side)
	if st.target != null:
		return p.fire(side, st.target, st.impact)
	if st.mark:
		return p.fire(side, null, st.impact)
	if st.hover and st.aim_dist > 0.0:
		return p.fire(side, null, st.impact)
	var a := p.heading + side * PI * 0.5
	var R := p.gun_range() * 0.6
	return p.fire(side, null, Vector3(p.pos.x + sin(a) * R, 0.0, p.pos.z + cos(a) * R))
