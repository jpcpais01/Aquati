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
## sand. They're drawn by the crews' instanced sailor (Crew.crowds).

## A step, and the captain's jumps (for the game's sound and shake).
signal stepped(k: float, wet: bool, hard: bool)
signal hopped(up: bool, k: float, wet: bool, hard: bool)

const CAP_HP := 120.0
const HAND_HP := 75.0
## A body's radius among trunks and walls (m).
const BODY := 0.3
const HAND_NAMES := ["Bones", "Patch", "Old Hobb", "Sully", "Barnaby", "Nell", "Red Jack", "Iko", "Dutch", "Mags", "Tam", "Quill", "Rook", "Bess", "Finch", "Salty"]
## Each hand's place in the knot: [to the captain's right, ahead] (m).
const SLOTS := [[-1.5, -1.9], [1.5, -1.9], [-1.0, -3.7], [1.0, -3.7], [-2.3, -0.4], [2.3, -0.4]]


## What steers the captain this frame: the wanted stride in world space
## (length 0..1), a run, and a jump (a pulse).
class Steer:
	var mx := 0.0
	var mz := 0.0
	var run := false
	var jump := false


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


var ground: ShoreGround
var active := false
var ship: Ship
## The beach the boat came in on (ShoreGround.landing's shape).
var landing := {}
var captain: ShoreWalker
var party: Array[Member] = []
var time := 0.0
## Facing of the party's march (the captain's heading, eased).
var _march := 0.0
var _still_t := 0.0
## Till two hands next swap sides on the march.
var _swap_t := 20.0
var _boat: MeshInstance3D
var _boat_blocks: Array[Vector3] = []
var _crew: Crew
var _fx: Particles
var _water: Callable


func _init(p_ground: ShoreGround, crew: Crew, parts: Material) -> void:
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


## Where the boat lies on the beach.
func boat_pos() -> Vector3:
	return _boat.position


## Puts the boat on `beach` and the captain and four hands of `ship` on the sand.
func land(p_ship: Ship, beach: Dictionary, world: World) -> void:
	leave()
	ship = p_ship
	landing = beach
	active = true
	_fx = world.fx
	_water = world.water_height
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


## Draws the party through the crews' sailor (a Crew.crowds callable).
func _draw(emit: Callable) -> void:
	if not active:
		return
	for m in party:
		var w := m.walker
		if w.visible and not w.hidden and w.palette >= 0:
			emit.call(w.xf, w.write(), w.look.hat, w.prop, w.kit)


# ---------------------------------------------------------------- per frame

func update(dt: float, world: World, inp: Steer) -> void:
	if not active or captain == null:
		return
	time += dt
	for m in party:
		m.walker.tick(dt)
	_steer_captain(dt, inp)
	_think_party(dt)
	_move(dt)
	for m in party:
		var w := m.walker
		var run := clampf((w.stride - ShoreWalker.WALK) / (ShoreWalker.RUN - ShoreWalker.WALK), 0.0, 1.0)
		w.animate(dt, world.time, run)
		_stand(w, dt, world)


## The captain, where you steer them: a walk, a run on Shift (or the stick
## pushed to its rim), a hop.
func _steer_captain(dt: float, inp: Steer) -> void:
	var cap := captain
	if cap.is_down():
		cap.vx = 0.0
		cap.vz = 0.0
		return
	var len := minf(1.0, Vector2(inp.mx, inp.mz).length())
	# a jump: not mid-cut, not from deep water
	var hop := inp.jump and not cap.airborne() and cap.ready() and not cap.cutting() and cap.wade < 0.5
	if hop and cap.jump():
		hopped.emit(true, 0.0, cap.wade > 0.08, false)
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
	cap.turn(dt, 16.0 if cap.cutting() else 11.0)


func _think_party(dt: float) -> void:
	var hands: Array[ShoreWalker] = []
	for i in range(1, party.size()):
		hands.append(party[i].walker)
	# regain breath, and get back up
	for m in party:
		var w := m.walker
		if w.is_down() and w.down_t > 2.0:
			w.get_up(w.max_hp * 0.4)
		if not w.is_down():
			w.hp = minf(w.max_hp, w.hp + dt * 6.0)
	_swap_sides(dt)
	for i in hands.size():
		var w := hands[i]
		if w.is_down():
			continue
		w.target = null
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
	if marching:
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


## Nobody stands inside anybody else; everyone steps over the ground,
## sliding along whatever stops them, their stride counted in footfalls.
func _move(dt: float) -> void:
	var n := party.size()
	for i in n:
		var a := party[i].walker
		for j in range(i + 1, n):
			var b := party[j].walker
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
	for m in party:
		var w := m.walker
		var kd := MathX.damp(4.0 if w.is_down() else 7.0, dt)
		w.kx -= w.kx * kd
		w.kz -= w.kz * kd
		var mx := (0.0 if w.is_down() else w.vx) + w.kx
		var mz := (0.0 if w.is_down() else w.vz) + w.kz
		var px := w.x
		var pz := w.z
		var to := ground.step(w.x, w.z, mx * dt, mz * dt, BODY)
		w.x = to.x
		w.z = to.y
		var moved := Vector2(w.x - px, w.z - pz).length() / maxf(dt, 1e-4)
		w.stride += ((0.0 if w.is_down() else moved) - w.stride) * MathX.damp(12.0, dt)
		w.wade = maxf(0.0, -ground.height(w.x, w.z))
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


## Poses a walker onto the ground under its feet.
func _stand(w: ShoreWalker, dt: float, world: World) -> void:
	var g := ground.height(w.x, w.z)
	var hit := w.fly(dt, g)
	w.place3(g)
	if hit > 0.0:
		_touch_down(w, hit, world)


## Feet back on the ground after a jump: a thud, a puff of sand or a splash.
func _touch_down(w: ShoreWalker, hit: float, world: World) -> void:
	var k := clampf((hit - 2.0) / 4.0, 0.0, 1.0)
	var wet := w.wade > 0.08
	if w == captain:
		hopped.emit(false, k, wet, false)
	var y := world.water_height(w.x, w.z) if wet else w.y + 0.05
	var n := 10 if wet else 7
	for i in n:
		var a := float(i) / n * TAU + randf() * 0.5
		var sp := (1.6 if wet else 1.1) + randf() * 1.2
		if wet:
			_fx.emit(Vector3(w.x, y, w.z), Vector3(sin(a) * sp + w.vx * 0.2, 1.8 + randf() * 1.8, cos(a) * sp + w.vz * 0.2),
					0.5 + randf() * 0.3, 0.1 + randf() * 0.08, 0.05, Color(1.3, 1.4, 1.45, 0.85), Color(1.3, 1.4, 1.45), 11.0, 0.8, Particles.SOFT, 0.01)
		else:
			_fx.emit(Vector3(w.x + sin(a) * 0.2, y, w.z + cos(a) * 0.2), Vector3(sin(a) * sp, 0.4 + randf() * 0.5, cos(a) * sp),
					0.45 + randf() * 0.3, 0.12 + randf() * 0.1, 0.32, Color(0.95, 0.86, 0.68, 0.35), Color(0.95, 0.86, 0.68), 1.5, 3.5, Particles.SOFT, 0.02)


func _footfall(w: ShoreWalker) -> void:
	var wet := w.wade > 0.08
	if w == captain:
		stepped.emit(clampf(w.stride / ShoreWalker.RUN, 0.3, 1.0), wet, false)
	if wet:
		if randf() < 0.7:
			var y: float = _water.call(w.x, w.z)
			for i in 3:
				_fx.emit(Vector3(w.x, y, w.z), Vector3((randf() - 0.5) * 1.6 + w.vx * 0.2, 1.4 + randf() * 1.6, (randf() - 0.5) * 1.6 + w.vz * 0.2),
						0.5 + randf() * 0.3, 0.09 + randf() * 0.08, 0.05, Color(1.3, 1.4, 1.45, 0.85), Color(1.3, 1.4, 1.45), 11.0, 0.8, Particles.SOFT, 0.01)
	elif w.stride > 3.6 and randf() < 0.5:
		# sand kicked up at a run
		_fx.emit(Vector3(w.x, w.y + 0.05, w.z), Vector3(-w.vx * 0.15, 0.5, -w.vz * 0.15),
				0.9, 0.25, 0.9, Color(0.95, 0.85, 0.66, 0.35), Color(0.95, 0.85, 0.66), 0.4, 2.2, Particles.SMOKE, 0.03)


# ---------------------------------------------------------------- the prompt

## What a tap (or F) would do here: {key, title, sub, ok}, or {}.
func prompt(ship_name: String) -> Dictionary:
	if not active or captain == null or captain.is_down():
		return {}
	var b := _boat.position
	if Vector2(captain.x - b.x, captain.z - b.z).length() < 4.2:
		return {"key": "boat", "title": "Row back to the %s" % ship_name, "sub": "The hands climb in and pull for the ship", "ok": true}
	return {}


## Acts on the prompt: "boat" to row back, else "".
func interact() -> String:
	var p := prompt("")
	if p.is_empty() or not bool(p.ok):
		return ""
	return str(p.key)
