class_name ShoreWalker
extends RefCounted
## Someone on foot on an island (the web game's ShoreWalker, src/shore/walker.ts):
## the captain, a hand from the landing party or one of the cutthroats. A
## walker is drawn by the crews' instanced sailor and posed here, joint by
## joint: the walk and run, a guard with the cutlass up, three cuts (an
## overhead slash, a backhand sweep and a lunging thrust), a parry, a flinch
## from a blow, a knock-out fall onto the sand, getting up again, sitting by a
## fire, chatting, keeping watch and cheering a win.

enum Team { PARTY, FOE }
enum Idle { STAND, SIT, GROUND, CHAT, WATCH, LEAN, WARM }

## Seconds into a cut (0 overhead, 1 backhand, 2 lunge): wind-up ends, the
## blade lands, follow-through ends, back on guard.
const CUT_WIND := [0.17, 0.15, 0.2]
const CUT_HIT := [0.23, 0.21, 0.27]
const CUT_HOLD := [0.34, 0.31, 0.4]
const CUT_END := [0.56, 0.5, 0.66]
## The step in behind each cut as the blade comes over (m/s, spent like a shove).
const STEP_IN := [1.7, 1.1, 2.9]

## Walking and running pace on foot (m/s).
const WALK := 3.0
const RUN := 5.3
## A jump: take-off speed (m/s) and the pull back down (m/s²): about 0.75 m up, 0.7 s aloft.
const JUMP_V := 4.4
const GRAVITY := 13.0

# The body's own sway, lean, twist and step the joints can't give, laid onto the matrix:
const SW := 0 # hips shifted sideways (m, to the left)
const RL := 1 # leaning sideways (rad, + to the right)
const PT := 2 # pitched forward (rad)
const TW := 3 # the hips turned (rad, + to the left)
const FW := 4 # stepped ahead (m)

const P_SPINE_X := CrewModel.P_SPINE_X
const P_SPINE_Y := CrewModel.P_SPINE_Y
const P_SPINE_Z := CrewModel.P_SPINE_Z
const P_HEAD_X := CrewModel.P_HEAD_X
const P_HEAD_Y := CrewModel.P_HEAD_Y
const P_HEAD_Z := CrewModel.P_HEAD_Z
const P_ARM_LX := CrewModel.P_ARM_LX
const P_ARM_LZ := CrewModel.P_ARM_LZ
const P_ELBOW_L := CrewModel.P_ELBOW_L
const P_ARM_RX := CrewModel.P_ARM_RX
const P_ARM_RZ := CrewModel.P_ARM_RZ
const P_ELBOW_R := CrewModel.P_ELBOW_R
const P_LEG_LX := CrewModel.P_LEG_LX
const P_KNEE_L := CrewModel.P_KNEE_L
const P_LEG_RX := CrewModel.P_LEG_RX
const P_KNEE_R := CrewModel.P_KNEE_R
const P_ROOT_Y := CrewModel.P_ROOT_Y
const P_HAND_L := CrewModel.P_HAND_L
const P_HAND_R := CrewModel.P_HAND_R
const P_JAW := CrewModel.P_JAW
const P_BROW := CrewModel.P_BROW
const P_SMILE := CrewModel.P_SMILE

static var _serial := 0
## The pose being built this frame, a second one to blend an overlay in from,
## and the body's sway under it.
static var _t := PackedFloat32Array()
static var _k := PackedFloat32Array()
static var _b := PackedFloat32Array([0.0, 0.0, 0.0, 0.0, 0.0])

var id := 0
var team := Team.PARTY
## What the HUD calls them over their bar ('' for the default).
var title := ""
var pose := PackedFloat32Array()
## The pose texture's row as drawn: the pose, then the style (palette row, hat, prop, kit flags).
var row := PackedFloat32Array()
var xf := Transform3D.IDENTITY
var prop := CrewModel.PROP_NONE
var visible := false
var hidden := false
var look: CrewLook
var palette := -1
## The meshes of their extras at each cut (CrewModel.Level.extras).
var kit: Array[PackedInt32Array] = []
var girth := 1.0
var height := 1.0
## Whether the palette row was taken for this walker (and must be given back).
var owns_row := false
# where and how fast
var x := 0.0
var z := 0.0
var y := 0.0
var vx := 0.0
var vz := 0.0
## Knock-back and shove, separate from the walker's own stride.
var kx := 0.0
var kz := 0.0
var yaw := 0.0
var want_yaw := 0.0
## Ground speed this frame (m/s) and the stride cycle: the left heel strikes at 0, the right at pi.
var stride := 0.0
var phase := randf() * 6.0
## How the body sways, leans and twists over its feet (see SW..FW), eased.
var body := PackedFloat32Array([0.0, 0.0, 0.0, 0.0, 0.0])
var _turn_rate := 0.0
var _accel := 0.0
var _last_yaw := NAN
var _last_speed := 0.0
## Talking as they walk (the jaw goes), and who to (the head turns via look_yaw).
var talking := false
## Depth of the water at the feet (0 on dry land).
var wade := 0.0
## Off the ground: the feet's height over it (m) and how fast they climb (m/s).
var air := 0.0
var vy := 0.0
## World height of the feet while aloft (NAN on the ground).
var _fly_y := NAN
## Seconds since the feet last came down from a jump, and how hard (m/s).
var land_t := 9.0
var land_v := 0.0
# fighting
var hp := 1.0
var max_hp := 1.0
var digging := false
var dig_phase := 0.0
var armed := false
var cut := 0
## Seconds into the current cut (-1 = not cutting).
var cut_t := -1.0
var hit_done := false
var cooldown := 0.0
var parry := 0.0
var stagger := 0.0
var flinch := 0.0
## Knocked down: seconds since the fall (-1 standing), and 0..1 how far over.
var down_t := -1.0
var fall := 0.0
var rise := 0.0
## The pistol raised, 0..1.
var aim := 0.0
var cheer := 0.0
var shout := 0.0
var last_hurt := -100.0
var target: ShoreWalker
# at ease
var idle := Idle.STAND
var idle_t := 0.0
var look_yaw := 0.0
var look_t := 0.0
## Extra hip drop for sitting on something (a log).
var seat_h := 0.0
var seed := randf() * 100.0
var tempo := 0.9 + randf() * 0.2
## Longer or shorter in the stride than the next man.
var step_k := 0.93 + randf() * 0.14


func _init(p_team: Team, p_look: CrewLook, p_palette: int, p_hp: float, p_girth := 1.0, p_height := 1.0, p_owns := false) -> void:
	id = _serial
	_serial += 1
	team = p_team
	look = p_look
	palette = p_palette
	max_hp = p_hp
	hp = p_hp
	girth = p_girth
	height = p_height
	owns_row = p_owns
	pose.resize(CrewModel.POSE_SIZE)
	CrewBrain.rest(pose)
	row.resize(CrewModel.ROW_FLOATS)
	row[CrewModel.STYLE_HAT] = look.hat
	row[CrewModel.STYLE_FLAGS] = look.flags
	for lv in CrewModel.levels():
		kit.append(lv.extras(look.flags))
	if _t.is_empty():
		_t.resize(CrewModel.POSE_SIZE)
		_k.resize(CrewModel.POSE_SIZE)


func is_down() -> bool:
	return down_t >= 0.0


func alive() -> bool:
	return hp > 0.0


func cutting() -> bool:
	return cut_t >= 0.0


func airborne() -> bool:
	return not is_nan(_fly_y)


## Can act: standing, not reeling.
func ready() -> bool:
	return not is_down() and stagger <= 0.0 and rise <= 0.0


## Fair game for a blade: on their feet and still fighting.
func standing() -> bool:
	return alive() and not is_down()


## Springs up off the ground; false if already aloft.
func jump(v := JUMP_V) -> bool:
	if airborne():
		return false
	_fly_y = y
	vy = v
	return true


## Carries a jump on over ground at `ground`; how hard the feet came down
## (m/s) on the frame they land, else 0.
func fly(dt: float, ground: float) -> float:
	land_t += dt
	if not airborne():
		return 0.0
	vy -= GRAVITY * dt
	_fly_y += vy * dt
	# still climbing over a rise: the ground catches the feet early
	if _fly_y > ground:
		return 0.0
	var hit := maxf(0.5, -vy)
	_fly_y = NAN
	vy = 0.0
	land_t = 0.0
	land_v = hit
	return hit


func place(px: float, pz: float, p_yaw: float) -> void:
	x = px
	z = pz
	yaw = p_yaw
	want_yaw = p_yaw
	vx = 0.0
	vz = 0.0
	kx = 0.0
	kz = 0.0
	_last_yaw = NAN
	_fly_y = NAN


## Ground covered per footfall at the current pace (m): longer steps as the pace picks up.
func step_len() -> float:
	var sp := stride
	var run := clampf((sp - WALK) / (RUN - WALK), 0.0, 1.0)
	return lerpf(clampf(0.42 + sp * 0.19, 0.5, 1.0), 0.62 + sp * 0.19, run) * step_k


## Starts a cut; false if busy.
func swing(c: int) -> bool:
	if not ready() or cutting() or cooldown > 0.0:
		return false
	cut = c
	cut_t = 0.0
	hit_done = false
	armed = true
	parry = 0.0
	return true


## Down onto the sand.
func knock_down() -> void:
	down_t = 0.0
	cut_t = -1.0
	parry = 0.0
	aim = 0.0
	vx = 0.0
	vz = 0.0


func get_up(p_hp: float) -> void:
	if not is_down():
		return
	down_t = -1.0
	rise = 1.0
	hp = maxf(hp, p_hp)


## Clocks the timers on.
func tick(dt: float) -> void:
	if digging:
		dig_phase += dt * 0.78 * tempo
	if cut_t >= 0.0:
		var was := cut_t
		cut_t += dt
		# the weight goes in behind the blade
		if was < CUT_WIND[cut] and cut_t >= CUT_WIND[cut]:
			kx += sin(yaw) * STEP_IN[cut]
			kz += cos(yaw) * STEP_IN[cut]
		if cut_t >= CUT_END[cut]:
			cut_t = -1.0
	cooldown = maxf(0.0, cooldown - dt)
	parry = maxf(0.0, parry - dt)
	stagger = maxf(0.0, stagger - dt)
	flinch = maxf(0.0, flinch - dt)
	cheer = maxf(0.0, cheer - dt)
	shout = maxf(0.0, shout - dt)
	if down_t >= 0.0:
		down_t += dt
		fall = minf(1.0, fall + dt * 2.4)
	elif rise > 0.0:
		rise = maxf(0.0, rise - dt * 1.1)
		fall = rise
	else:
		fall = 0.0


func turn(dt: float, rate := 9.0) -> void:
	yaw += MathX.angle_delta(yaw, want_yaw) * MathX.damp(rate, dt)


## Builds this frame's pose from what the walker is doing, and eases into it.
func animate(dt: float, time: float, run: float) -> void:
	var o := _t
	var B := _b
	var tt := time * tempo + seed
	CrewBrain.rest(o)
	B.fill(0.0)
	# turning and gathering speed, for leaning into both
	if dt > 0.0:
		var tr := 0.0 if is_nan(_last_yaw) else clampf(MathX.angle_delta(_last_yaw, yaw) / dt, -12.0, 12.0)
		_turn_rate += (tr - _turn_rate) * MathX.damp(10.0, dt)
		var ac := clampf((stride - _last_speed) / dt, -30.0, 30.0)
		_accel += (ac - _accel) * MathX.damp(5.0, dt)
	_last_yaw = yaw
	_last_speed = stride
	var down := is_down()
	var moving := stride > 0.25 and not down
	# turning on the spot: a few short shuffling steps round
	var shuffle := not moving and not down and cut_t < 0.0 and not digging and rise <= 0.0 and absf(_turn_rate) > 1.6 \
			and (armed or idle == Idle.STAND or idle == Idle.CHAT or idle == Idle.WATCH or idle == Idle.LEAN)
	if shuffle:
		phase += minf(6.0, absf(_turn_rate)) * dt * 0.9
	var stepping := moving or shuffle
	# at ease: what they're about while nobody fights
	if not stepping and not armed and not down:
		_ease(o, tt)
	if stepping:
		_gait(o, stride if moving else 0.9, run if moving else 0.0, tt)
		if wade > 0.15:
			# high steps through the shallows, arms out for balance
			o[P_KNEE_L] += 0.5 * minf(1.0, wade)
			o[P_KNEE_R] += 0.5 * minf(1.0, wade)
			o[P_ARM_LZ] = 0.45
			o[P_ARM_RZ] = 0.45
	if armed and not down:
		_guard(o, stepping, tt)
	var dig_now := digging and not moving and not down
	if dig_now:
		_dig_pose(o)
	if cut_t >= 0.0:
		_cut_pose(o)
	if aim > 0.0:
		# the pistol at arm's length, the head sighting along it
		var w := minf(1.0, aim * 1.6)
		o[P_ARM_LX] = lerpf(o[P_ARM_LX], 1.52, w)
		o[P_ARM_LZ] = lerpf(o[P_ARM_LZ], -0.18, w)
		o[P_ELBOW_L] = lerpf(o[P_ELBOW_L], 0.05, w)
		o[P_HAND_L] = lerpf(o[P_HAND_L], 0.85, w)
		o[P_SPINE_Y] = lerpf(o[P_SPINE_Y], 0.45, w)
		o[P_HEAD_Y] = lerpf(o[P_HEAD_Y], 0.2, w)
		o[P_BROW] = -0.6
	if parry > 0.0:
		# blade across the body, edge out
		o[P_ARM_RX] = 1.35
		o[P_ARM_RZ] = -0.55
		o[P_ELBOW_R] = 1.55
		o[P_ARM_LX] = 0.6
		o[P_ARM_LZ] = 0.55
		o[P_SPINE_X] = -0.12
		o[P_BROW] = -0.9
		CrewBrain.crouch(o, 0.35)
	if flinch > 0.0 and not down:
		var w := minf(1.0, flinch * 5.0)
		o[P_SPINE_X] = lerpf(o[P_SPINE_X], -0.38, w)
		o[P_HEAD_X] = lerpf(o[P_HEAD_X], -0.32, w)
		o[P_ARM_LZ] = lerpf(o[P_ARM_LZ], 0.75, w)
		o[P_ARM_LX] = lerpf(o[P_ARM_LX], 0.5, w)
		o[P_JAW] = 0.55 * w
		o[P_BROW] = 0.9
		o[P_SMILE] = -0.8
	if down or fall > 0.0:
		_sprawl(o, tt)
	if cheer > 0.0 and not down:
		var w := minf(1.0, minf(cheer * 2.0, (3.0 - cheer) * 4.0))
		var j := maxf(0.0, sin(tt * 8.5))
		var K := _k
		for i in CrewModel.POSE_SIZE:
			K[i] = o[i]
		K[P_ARM_RX] = 2.75 + 0.25 * sin(tt * 8.5)
		K[P_ARM_RZ] = -0.35
		K[P_ELBOW_R] = 0.2
		K[P_ARM_LX] = 2.5 + 0.3 * sin(tt * 8.5 + 1.3)
		K[P_ARM_LZ] = -0.35
		K[P_ELBOW_L] = 0.35
		K[P_HAND_L] = 1.0
		K[P_HAND_R] = 1.0
		K[P_HEAD_X] = -0.3
		K[P_JAW] = 0.65 + 0.35 * sin(tt * 8.5)
		K[P_BROW] = 0.8
		K[P_SMILE] = 1.0
		K[P_ROOT_Y] = j * 0.2 - (1.0 - j) * 0.06
		for i in CrewModel.POSE_SIZE:
			o[i] = lerpf(o[i], K[i], w)
	if not down:
		if airborne():
			_leap_pose(o)
		elif land_t < 0.4:
			# the knees take the landing, harder the further the drop
			var d := clampf(land_v / 7.0, 0.2, 0.6) * pow(1.0 - land_t / 0.4, 2.0)
			var th := 0.55 * d
			var kn := 1.1 * d
			o[P_LEG_LX] += th
			o[P_LEG_RX] += th
			o[P_KNEE_L] += kn
			o[P_KNEE_R] += kn
			o[P_ROOT_Y] -= 0.38 * (1.0 - cos(th)) + 0.42 * (1.0 - cos(kn - th))
			o[P_SPINE_X] += th * 0.6
	_face(o, tt, moving)
	# cuts snap, blows jolt, strides keep their snap; everything else eases
	var rate := 55.0 if cut_t >= 0.0 else (34.0 if flinch > 0.0 or parry > 0.0 else (9.0 if down else (26.0 if stepping else 13.0)))
	var k := MathX.damp(rate, dt)
	for i in CrewModel.POSE_SIZE:
		pose[i] += (o[i] - pose[i]) * k
	if down or fall > 0.0:
		B.fill(0.0)
	for i in 5:
		body[i] += (B[i] - body[i]) * k
	if dig_now:
		prop = CrewModel.PROP_SPADE
	elif armed or cheer > 0.0:
		prop = CrewModel.PROP_CUTLASS
	else:
		prop = CrewModel.PROP_NONE


## Aloft: knees tucked on the way up, legs reaching for the ground on the way down, arms out for balance.
func _leap_pose(o: PackedFloat32Array) -> void:
	var up := clampf(vy / JUMP_V, -1.0, 1.0)
	var tuck := 0.55 + 0.45 * up
	o[P_LEG_LX] = lerpf(o[P_LEG_LX], 0.75 * tuck + 0.15, 0.85)
	o[P_KNEE_L] = lerpf(o[P_KNEE_L], 1.25 * tuck + 0.2, 0.85)
	o[P_LEG_RX] = lerpf(o[P_LEG_RX], 0.35 * tuck - 0.1, 0.85)
	o[P_KNEE_R] = lerpf(o[P_KNEE_R], 0.9 * tuck + 0.35, 0.85)
	o[P_ROOT_Y] = lerpf(o[P_ROOT_Y], 0.0, 0.85)
	if not armed and cut_t < 0.0 and aim <= 0.0:
		o[P_ARM_LX] = lerpf(o[P_ARM_LX], 0.5 - 0.35 * up, 0.85)
		o[P_ARM_RX] = lerpf(o[P_ARM_RX], 0.5 - 0.35 * up, 0.85)
		o[P_ARM_LZ] = lerpf(o[P_ARM_LZ], 0.45, 0.85)
		o[P_ARM_RZ] = lerpf(o[P_ARM_RZ], 0.45, 0.85)
		o[P_ELBOW_L] = lerpf(o[P_ELBOW_L], 0.5, 0.85)
		o[P_ELBOW_R] = lerpf(o[P_ELBOW_R], 0.5, 0.85)
	o[P_SPINE_X] = lerpf(o[P_SPINE_X], 0.12 - 0.08 * up, 0.85)
	o[P_JAW] = maxf(o[P_JAW], 0.15)


## The stride: each leg keyed through heel strike, taking the weight, passing
## and pushing off (a run adds a moment aloft); the hips riding on the lowest
## foot, swaying over it and turning with the swinging leg, the shoulders
## against them, arms swinging a beat behind, the head kept level and looking
## where it's going; leaning into turns and into speeding up.
func _gait(o: PackedFloat32Array, sp: float, run: float, tt: float) -> void:
	var B := _b
	var u := phase / TAU
	var ph := phase
	# a slow walk is short steps, a brisk one long; a run is all reach
	var amp := lerpf(clampf(0.32 + sp * 0.31, 0.32, 1.25), 1.0, run)
	var a1 := minf(1.0, amp)
	for s in 2:
		var t := u + s * 0.5
		var th := lerpf(_loop(WALK_TH, t), _loop(RUN_TH, t), run) * amp
		var kn := maxf(0.0, lerpf(_loop(WALK_KN, t), _loop(RUN_KN, t), run)) * lerpf(0.5 + 0.5 * a1, 1.0, run)
		# a fighter prowls: knees bent, weight low
		if armed:
			th += 0.16
			kn += 0.3
		o[P_LEG_RX if s == 1 else P_LEG_LX] = th
		o[P_KNEE_R if s == 1 else P_KNEE_L] = kn
	# hips ride the lowest foot (up over a straight leg, down between steps) and leave the ground at a run
	var v := 2.0 * u - floorf(2.0 * u)
	var flight := sin(PI * (v - 0.72) / 0.28) if v > 0.72 else 0.0
	o[P_ROOT_Y] = _grounded(o) + flight * 0.075 * run

	var bank := clampf(-_turn_rate * sp * 0.028, -0.24, 0.24)
	var lean := clampf(_accel * 0.022, -0.09, 0.12)
	# over the standing foot, the hips turned with the swinging leg
	var sway := lerpf(0.032 * a1, 0.016, run) * cos(ph - lerpf(0.3, 0.18, run) * TAU)
	var twist := -lerpf(0.075 * a1, 0.11, run) * cos(ph - 0.03 * TAU)
	B[SW] = sway
	B[RL] = -sway * 0.9 + bank
	B[TW] = twist
	B[PT] = lerpf(0.015, 0.07, run) + lean * 0.6
	# the shoulders: turned against the hips, level over the swaying pelvis, a dip at each footfall
	o[P_SPINE_X] = lerpf(0.04, 0.2, run) + (0.1 if armed else 0.0) + lean * 0.8 + 0.02 * a1 * cos(2.0 * ph)
	o[P_SPINE_Y] = -twist + lerpf(0.1, 0.17, run) * a1 * cos(ph - 0.06 * TAU) + look_yaw * 0.15
	o[P_SPINE_Z] = sway * 1.4
	# arms swing against the legs, a beat late, elbows folding on the way forward
	var swing_k := cos(ph - 0.07 * TAU)
	var arm_a := lerpf(0.12 + 0.26 * minf(1.2, amp), 0.95, run)
	var bias := lerpf(0.04, 0.32, run)
	var eb := lerpf(0.18, 1.45, run)
	o[P_ARM_RX] = bias + arm_a * swing_k
	o[P_ARM_LX] = bias - arm_a * swing_k
	o[P_ELBOW_R] = eb + lerpf(0.32, 0.3, run) * maxf(0.0, swing_k)
	o[P_ELBOW_L] = eb + lerpf(0.32, 0.3, run) * maxf(0.0, -swing_k)
	o[P_ARM_RZ] = lerpf(0.07, 0.14, run) - 0.12 * run * maxf(0.0, swing_k)
	o[P_ARM_LZ] = lerpf(0.07, 0.14, run) - 0.12 * run * maxf(0.0, -swing_k)
	o[P_HAND_L] = lerpf(0.3, 0.8, run)
	o[P_HAND_R] = o[P_HAND_L]
	# the head stays level and looks ahead, into the turn, or at whoever he's talking to
	o[P_HEAD_Y] = -(twist + o[P_SPINE_Y]) * 0.85 + clampf(_turn_rate * 0.12, -0.4, 0.4) + look_yaw * 0.8
	o[P_HEAD_Z] = -(B[RL] + o[P_SPINE_Z]) * 0.8
	o[P_HEAD_X] = -(B[PT] + o[P_SPINE_X]) * 0.6 + 0.03 + 0.025 * a1 * cos(2.0 * ph + 0.6)
	# puffing at a run
	o[P_JAW] = run * (0.14 + 0.08 * sin(tt * 5.3))


## Standing about: the weight drifting from foot to foot, the free knee easing, breathing.
func _stance(o: PackedFloat32Array, tt: float) -> void:
	var B := _b
	var w := clampf(sin(tt * 0.21 + seed * 2.3) * 1.7, -1.0, 1.0)
	B[SW] = 0.028 * w
	B[RL] = -0.02 * w
	o[P_SPINE_Z] += 0.034 * w
	o[P_HEAD_Z] -= 0.02 * w
	if w > 0.0:
		o[P_KNEE_R] += 0.2 * w
		o[P_LEG_RX] += 0.07 * w
	else:
		o[P_KNEE_L] -= 0.2 * w
		o[P_LEG_LX] -= 0.07 * w
	o[P_ROOT_Y] = minf(o[P_ROOT_Y], _grounded(o))
	var br := sin(tt * 1.55 + seed)
	o[P_SPINE_X] += 0.014 * br
	o[P_HEAD_X] -= 0.012 * br
	o[P_ARM_LZ] += 0.02 + 0.012 * br
	o[P_ARM_RZ] += 0.02 + 0.012 * br


## A spade stroke: raise, drive in with a boot on the blade, lever up, toss the sand aside.
func _dig_pose(o: PackedFloat32Array) -> void:
	var u := fmod(dig_phase, 1.0)
	var i := DIG_AT.size() - 1
	while i > 0 and DIG_AT[i] > u:
		i -= 1
	var a: Dictionary = DIG[i]
	var b: Dictionary = DIG[(i + 1) % DIG.size()]
	var t0: float = DIG_AT[i]
	var t1: float = DIG_AT[i + 1] if i + 1 < DIG_AT.size() else 1.0
	var w := MathX.smooth(0.0, 1.0, (u - t0) / (t1 - t0))
	for k: int in DIG_KEYS:
		o[k] = lerpf(float(a.get(k, 0.0)), float(b.get(k, 0.0)), w)
	o[P_HAND_R] = 1.0
	o[P_HAND_L] = 1.0
	o[P_BROW] = -0.3
	o[P_JAW] = 0.35 if i == 1 else 0.1


## Blade up: a crouched guard, the cutlass held out ahead, the off hand out
## for balance, rocking on the balls of the feet.
func _guard(o: PackedFloat32Array, moving: bool, tt: float) -> void:
	var B := _b
	var b := sin(tt * 2.2) * 0.04
	if moving:
		o[P_ARM_RX] = 0.95 + 0.05 * sin(phase * 2.0)
		o[P_ARM_RZ] = 0.2
		o[P_ELBOW_R] = 0.9
		o[P_ARM_LZ] = 0.4
		o[P_ELBOW_L] = 0.9
		o[P_ARM_LX] = 0.35 + (o[P_ARM_LX] - 0.04) * 0.4
		return
	o[P_ARM_RX] = 0.78 + b
	o[P_ARM_RZ] = 0.18
	o[P_ELBOW_R] = 1.12
	o[P_ARM_LX] = 0.4
	o[P_ARM_LZ] = 0.48
	o[P_ELBOW_L] = 1.15
	o[P_HAND_L] = 0.45
	o[P_SPINE_Y] = -0.18
	o[P_SPINE_X] = 0.12
	o[P_HEAD_Y] = 0.25
	CrewBrain.crouch(o, 0.28 + b)
	o[P_LEG_LX] += 0.22
	o[P_LEG_RX] -= 0.18
	o[P_ROOT_Y] = _grounded(o)
	B[SW] = 0.02 * sin(tt * 1.1)
	B[RL] = -0.015 * sin(tt * 1.1)
	B[TW] = -0.12


## A cut, keyed: easing into the wind-up, a hang with the body coiled and the
## weight back, the blade whipped through (accelerating to the blow), carried
## on past it, settled, and back on guard. The hips lead, the head stays on
## the man being cut.
func _cut_pose(o: PackedFloat32Array) -> void:
	var B := _b
	var c := cut
	var t := cut_t
	var m: Array = _marks(c)
	var i := 0
	while i < 5 and t >= m[i + 1]:
		i += 1
	var e := _seg_ease(i, clampf((t - m[i]) / (m[i + 1] - m[i]), 0.0, 1.0))
	var keys: Array = CUTS[c]
	var a: Array = keys[i - 1] if i > 0 else []
	var zk: Array = keys[i] if i < 5 else []
	for k: int in KEYS:
		var f: float = (a[0] as Dictionary).get(k, o[k]) if not a.is_empty() else o[k]
		var g: float = (zk[0] as Dictionary).get(k, o[k]) if not zk.is_empty() else o[k]
		o[k] = lerpf(f, g, e)
	for j in 4:
		var bi: int = BODY_OF[j]
		var f: float = (a[1] as Array)[j] if not a.is_empty() else B[bi]
		var g: float = (zk[1] as Array)[j] if not zk.is_empty() else B[bi]
		B[bi] = lerpf(f, g, e)
	o[P_ROOT_Y] = _grounded(o)
	# eyes on the man in front
	o[P_HEAD_Y] = -(o[P_SPINE_Y] + B[TW]) * 0.8
	o[P_HEAD_X] = -(o[P_SPINE_X] + B[PT]) * 0.5 + 0.08
	o[P_HAND_R] = 1.0
	o[P_BROW] = -0.95
	o[P_JAW] = 0.6 if i >= 2 and i <= 3 else 0.2
	o[P_SMILE] = -0.5


## On the sand: limbs flung out, dazed.
func _sprawl(o: PackedFloat32Array, tt: float) -> void:
	var w := fall
	var lie := [[P_ARM_LX, 0.4], [P_ARM_LZ, 1.25 + 0.1 * sin(seed)], [P_ELBOW_L, 0.4], [P_ARM_RX, 0.2], [P_ARM_RZ, 1.1],
			[P_ELBOW_R, 0.6], [P_LEG_LX, 0.15], [P_KNEE_L, 0.35], [P_LEG_RX, 0.5], [P_KNEE_R, 0.9], [P_SPINE_X, -0.15],
			[P_HEAD_X, -0.25], [P_HEAD_Y, 0.45 * sin(seed * 3.0)], [P_ROOT_Y, 0.0]]
	for kv: Array in lie:
		o[kv[0]] = lerpf(o[kv[0]], kv[1], w)
	o[P_JAW] = 0.35 + 0.1 * sin(tt * 1.7)
	o[P_BROW] = 0.7
	o[P_SMILE] = -0.3
	o[P_HAND_L] = 0.2
	o[P_HAND_R] = 0.2


## At ease: sitting by the fire, warming hands, chatting, keeping watch.
func _ease(o: PackedFloat32Array, tt: float) -> void:
	match idle:
		Idle.SIT:
			var drop := maxf(0.3, 0.88 - seat_h - 0.06)
			o[P_ROOT_Y] = -drop
			o[P_LEG_LX] = 1.35
			o[P_LEG_RX] = 1.3
			o[P_KNEE_L] = 1.4
			o[P_KNEE_R] = 1.25
			o[P_SPINE_X] = 0.18
			o[P_ARM_LX] = 0.65
			o[P_ARM_RX] = 0.6
			o[P_ELBOW_L] = 1.1
			o[P_ELBOW_R] = 1.0
			o[P_ARM_LZ] = 0.12
			o[P_ARM_RZ] = 0.12
			o[P_HEAD_X] = 0.12 + 0.08 * sin(tt * 0.4)
		Idle.WARM:
			# hands out to the flames
			o[P_ARM_LX] = 1.15
			o[P_ARM_RX] = 1.15
			o[P_ELBOW_L] = 0.55
			o[P_ELBOW_R] = 0.55
			o[P_ARM_LZ] = -0.08
			o[P_ARM_RZ] = -0.08
			o[P_HAND_L] = 0.05
			o[P_HAND_R] = 0.05
			o[P_SPINE_X] = 0.15
			CrewBrain.crouch(o, 0.18)
		Idle.GROUND:
			# sat on the sand, leaning back on both hands
			o[P_ROOT_Y] = -0.74
			o[P_LEG_LX] = 1.45
			o[P_LEG_RX] = 1.38
			o[P_KNEE_L] = 0.55
			o[P_KNEE_R] = 1.0
			o[P_SPINE_X] = -0.32
			o[P_ARM_LX] = -0.55
			o[P_ARM_RX] = -0.55
			o[P_ARM_LZ] = 0.28
			o[P_ARM_RZ] = 0.28
			o[P_ELBOW_L] = 0.05
			o[P_ELBOW_R] = 0.05
			o[P_HEAD_X] = 0.15
		Idle.WATCH:
			# a hand shading the eyes, squinting out to sea
			_stance(o, tt)
			o[P_ARM_RX] = 2.25
			o[P_ARM_RZ] = 0.35
			o[P_ELBOW_R] = 2.35
			o[P_HAND_R] = 0.1
			o[P_ARM_LZ] = 0.6
			o[P_ELBOW_L] = 1.6
			o[P_HAND_L] = 0.55
			o[P_HEAD_X] = -0.08
		Idle.LEAN:
			# hands on hips
			_stance(o, tt)
			o[P_ARM_LZ] = 0.55
			o[P_ARM_RZ] = 0.55
			o[P_ELBOW_L] = 1.7
			o[P_ELBOW_R] = 1.7
			o[P_ARM_LX] = -0.15
			o[P_ARM_RX] = -0.15
		Idle.CHAT:
			_stance(o, tt)
			if sin(tt * 0.9) > 0.0:
				o[P_ARM_RX] = 0.75 + 0.3 * sin(tt * 2.6)
				o[P_ELBOW_R] = 1.2 + 0.4 * sin(tt * 3.1)
				o[P_ARM_RZ] = 0.2
			o[P_HEAD_Y] = 0.15 * sin(tt * 0.7)
		_:
			_stance(o, tt)
			o[P_HEAD_Y] = look_yaw * 0.7
			o[P_SPINE_Y] = look_yaw * 0.25


func _face(o: PackedFloat32Array, tt: float, moving: bool) -> void:
	if is_down():
		return
	if armed:
		o[P_BROW] = minf(o[P_BROW], -0.6)
		o[P_SMILE] = minf(o[P_SMILE], 0.2 if team == Team.FOE else -0.1)
		if team == Team.FOE:
			o[P_SMILE] = 0.35 # an ugly grin
	elif cheer <= 0.0:
		o[P_SMILE] = 0.3 + 0.2 * sin(seed)
		if idle == Idle.CHAT and not moving:
			var talk := sin(tt * 0.9) > 0.0
			o[P_JAW] = 0.12 + 0.4 * maxf(0.0, sin(tt * 11.0)) * (0.5 + 0.5 * sin(tt * 2.7)) if talk else 0.0
			o[P_SMILE] = 0.6 if talk else 0.45 + 0.3 * maxf(0.0, sin(tt * 1.3))
			o[P_BROW] = 0.4 * maxf(0.0, sin(tt * 1.9)) if talk else 0.1
		if idle == Idle.WATCH:
			o[P_BROW] = -0.4
		if talking and moving:
			o[P_JAW] = maxf(o[P_JAW], 0.1 + 0.36 * maxf(0.0, sin(tt * 10.5)) * (0.5 + 0.5 * sin(tt * 2.3)))
			o[P_SMILE] = 0.55
			o[P_BROW] = 0.3 * maxf(0.0, sin(tt * 1.7))
	if shout > 0.0:
		# a roar: mouth wide, brows down
		o[P_JAW] = 0.7 + 0.3 * sin(tt * 14.0)
		o[P_BROW] = -1.0
		o[P_SMILE] = -0.4
	if armed:
		o[P_HAND_R] = 1.0


## Writes the world placement: feet on the ground, the body's sway and lean on
## top, falling backwards when knocked down.
func place3(ground: float) -> void:
	var f := fall
	var ease := f * f * (3.0 - 2.0 * f)
	var up := 1.0 - ease
	var b := body
	# aloft the feet are where the jump has carried them
	air = maxf(0.0, _fly_y - ground) if airborne() else 0.0
	ground += air
	y = ground
	var rot := Basis.from_euler(Vector3(-ease * 1.5 + b[PT] * up, yaw + b[TW] * up, b[RL] * up), EULER_ORDER_YXZ)
	var s := sin(yaw)
	var c := cos(yaw)
	var sw := b[SW] * up * girth
	var fw := b[FW] * up
	xf = Transform3D(rot * Basis.from_scale(Vector3(girth, height, girth)),
			Vector3(x + c * sw + s * fw, ground + ease * 0.16 - (0.04 if wade > 0.0 else 0.0), z - s * sw + c * fw))


## The pose texture's row as it's drawn this frame.
func write() -> PackedFloat32Array:
	for i in CrewModel.POSE_SIZE:
		row[i] = pose[i]
	row[CrewModel.STYLE_ROW] = palette
	row[CrewModel.STYLE_PROP] = prop
	return row


# ---------------------------------------------------------------- the keys

## A periodic curve through [t, value] keys over one cycle (the last key
## repeats the first, a cycle on), Catmull-Rom between.
static func _loop(k: Array, t: float) -> float:
	var n := k.size() - 1
	t -= floorf(t)
	var i := 0
	while i < n - 1 and k[i + 1][0] <= t:
		i += 1
	var a: Array = k[i]
	var b: Array = k[i + 1]
	var pt: float = k[i - 1][0] if i > 0 else k[n - 1][0] - 1.0
	var pv: float = k[i - 1][1] if i > 0 else k[n - 1][1]
	var qt: float = k[i + 2][0] if i + 2 <= n else k[1][0] + 1.0
	var qv: float = k[i + 2][1] if i + 2 <= n else k[1][1]
	var h: float = b[0] - a[0]
	var u: float = (t - a[0]) / h
	var m0: float = (b[1] - pv) / (b[0] - pt) * h
	var m1: float = (qv - a[1]) / (qt - a[0]) * h
	var u2 := u * u
	var u3 := u2 * u
	return (2.0 * u3 - 3.0 * u2 + 1.0) * a[1] + (u3 - 2.0 * u2 + u) * m0 + (3.0 * u2 - 2.0 * u3) * b[1] + (u3 - u2) * m1


## How far below standing tall the hips must sit for the lower foot to touch the ground (<= 0).
static func _grounded(o: PackedFloat32Array) -> float:
	var l := 0.38 * cos(o[P_LEG_LX]) + 0.42 * cos(o[P_LEG_LX] - o[P_KNEE_L]) + 0.04
	var r := 0.38 * cos(o[P_LEG_RX]) + 0.42 * cos(o[P_LEG_RX] - o[P_KNEE_R]) + 0.04
	return minf(0.0, maxf(l, r) - 0.84)


## The marks every cut passes: on guard, easing back, coiled, the blow,
## carried through, settled, on guard.
static func _marks(c: int) -> Array:
	var w: float = CUT_WIND[c]
	var h: float = CUT_HIT[c]
	var hold: float = CUT_HOLD[c]
	return [0.0, w * 0.55, w, h, h + (hold - h) * 0.5, hold, CUT_END[c]]


## Into the wind-up gently, settling into the coil, whipped through to the
## blow, carried on, settled, home.
static func _seg_ease(i: int, x: float) -> float:
	match i:
		1:
			return 1.0 - (1.0 - x) * (1.0 - x)
		2:
			return pow(x, 2.4)
		3:
			return 1.0 - pow(1.0 - x, 3.0)
	return x * x * (3.0 - 2.0 * x)


# One leg's stride, from its heel striking out ahead (0) round to the next strike (1): [t, angle].
# Walking: the weight taken on a softening knee, carried over a straight leg,
# pushed off the toe at 0.6, and the leg swung through, knee high, to reach again.
const WALK_TH := [[0.0, 0.4], [0.15, 0.27], [0.35, 0.02], [0.6, -0.3], [0.72, -0.05], [0.88, 0.44], [1.0, 0.4]]
const WALK_KN := [[0.0, 0.05], [0.1, 0.26], [0.3, 0.07], [0.5, 0.18], [0.6, 0.5], [0.72, 1.05], [0.85, 0.55], [0.96, 0.04], [1.0, 0.05]]
# Running: a short stance on a deep knee, off the ground by 0.36, the heel kicked up to the seat and the thigh driven high.
const RUN_TH := [[0.0, 0.5], [0.18, 0.02], [0.36, -0.5], [0.5, -0.25], [0.72, 0.82], [0.88, 0.72], [1.0, 0.5]]
const RUN_KN := [[0.0, 0.32], [0.14, 0.7], [0.36, 0.32], [0.58, 1.95], [0.78, 1.35], [0.93, 0.35], [1.0, 0.32]]

## The spade stroke's keyframes, and where in the stroke (0..1) each falls.
const DIG_KEYS := [P_ARM_RX, P_ARM_RZ, P_ELBOW_R, P_ARM_LX, P_ARM_LZ, P_ELBOW_L, P_SPINE_X, P_SPINE_Y, P_LEG_RX, P_KNEE_R, P_KNEE_L, P_ROOT_Y, P_HEAD_X]
const DIG_AT := [0.0, 0.3, 0.58, 0.8]
const DIG := [
	{P_ARM_RX: 0.95, P_ELBOW_R: 1.15, P_ARM_LX: 1.05, P_ARM_LZ: -0.25, P_ELBOW_L: 1.25, P_SPINE_X: 0.22, P_KNEE_L: 0.15, P_KNEE_R: 0.15, P_ROOT_Y: -0.03, P_HEAD_X: 0.25},
	{P_ARM_RX: 0.42, P_ELBOW_R: 0.35, P_ARM_LX: 0.55, P_ARM_LZ: -0.2, P_ELBOW_L: 0.5, P_SPINE_X: 0.55, P_LEG_RX: 0.45, P_KNEE_R: 0.75, P_KNEE_L: 0.35, P_ROOT_Y: -0.1, P_HEAD_X: 0.35},
	{P_ARM_RX: 1.0, P_ELBOW_R: 0.85, P_ARM_LX: 0.9, P_ARM_LZ: -0.2, P_ELBOW_L: 0.9, P_SPINE_X: 0.42, P_KNEE_L: 0.4, P_KNEE_R: 0.4, P_ROOT_Y: -0.12, P_HEAD_X: 0.3},
	{P_ARM_RX: 1.35, P_ARM_RZ: 0.45, P_ELBOW_R: 0.55, P_ARM_LX: 1.15, P_ARM_LZ: 0.1, P_ELBOW_L: 0.7, P_SPINE_X: 0.22, P_SPINE_Y: -0.6, P_KNEE_L: 0.2, P_KNEE_R: 0.2, P_ROOT_Y: -0.05, P_HEAD_X: 0.15},
]

const KEYS := [P_ARM_RX, P_ARM_RZ, P_ELBOW_R, P_ARM_LX, P_ARM_LZ, P_ELBOW_L, P_SPINE_X, P_SPINE_Y, P_SPINE_Z, P_LEG_LX, P_LEG_RX, P_KNEE_L, P_KNEE_R]
## A cut key's body is [step ahead, pitch, roll, hip turn].
const BODY_OF := [FW, PT, RL, TW]
## Each cut as [easing back, coiled, the blow, carried through, settled]: [joint angles, body].
const CUTS := [
	# overhead: blade back over the shoulder, weight on the back foot, then down hard and across with a step in
	[
		[{P_ARM_RX: 2.3, P_ARM_RZ: 0.35, P_ELBOW_R: 1.6, P_SPINE_Y: -0.28, P_SPINE_X: -0.08, P_SPINE_Z: -0.05, P_ARM_LX: 0.85, P_ARM_LZ: 0.3, P_ELBOW_L: 0.5, P_LEG_LX: 0.25, P_KNEE_L: 0.35, P_LEG_RX: -0.1, P_KNEE_R: 0.45}, [-0.05, -0.04, 0.0, -0.08]],
		[{P_ARM_RX: 2.85, P_ARM_RZ: 0.42, P_ELBOW_R: 1.95, P_SPINE_Y: -0.45, P_SPINE_X: -0.16, P_SPINE_Z: -0.08, P_ARM_LX: 1.0, P_ARM_LZ: 0.2, P_ELBOW_L: 0.35, P_LEG_LX: 0.28, P_KNEE_L: 0.4, P_LEG_RX: -0.12, P_KNEE_R: 0.55}, [-0.1, -0.07, 0.02, -0.14]],
		[{P_ARM_RX: 0.6, P_ARM_RZ: -0.08, P_ELBOW_R: 0.12, P_SPINE_Y: 0.32, P_SPINE_X: 0.38, P_SPINE_Z: 0.06, P_ARM_LX: 0.1, P_ARM_LZ: 0.65, P_ELBOW_L: 0.9, P_LEG_LX: 0.7, P_KNEE_L: 1.0, P_LEG_RX: -0.45, P_KNEE_R: 0.45}, [0.08, 0.08, -0.03, 0.14]],
		[{P_ARM_RX: -0.05, P_ARM_RZ: -0.38, P_ELBOW_R: 0.2, P_SPINE_Y: 0.5, P_SPINE_X: 0.5, P_SPINE_Z: 0.1, P_ARM_LX: -0.25, P_ARM_LZ: 0.75, P_ELBOW_L: 0.9, P_LEG_LX: 0.72, P_KNEE_L: 1.05, P_LEG_RX: -0.48, P_KNEE_R: 0.48}, [0.12, 0.11, -0.05, 0.2]],
		[{P_ARM_RX: 0.3, P_ARM_RZ: -0.2, P_ELBOW_R: 0.45, P_SPINE_Y: 0.35, P_SPINE_X: 0.36, P_SPINE_Z: 0.04, P_ARM_LX: 0.1, P_ARM_LZ: 0.6, P_ELBOW_L: 0.9, P_LEG_LX: 0.6, P_KNEE_L: 0.85, P_LEG_RX: -0.36, P_KNEE_R: 0.45}, [0.08, 0.06, -0.02, 0.12]],
	],
	# backhand: blade drawn across to the off hip, shoulder turned in, then swept out wide as the body unwinds
	[
		[{P_ARM_RX: 1.35, P_ARM_RZ: -0.8, P_ELBOW_R: 1.5, P_SPINE_Y: 0.35, P_SPINE_X: 0.06, P_SPINE_Z: 0.04, P_ARM_LX: 0.3, P_ARM_LZ: 0.5, P_ELBOW_L: 1.2, P_LEG_LX: 0.25, P_KNEE_L: 0.4, P_LEG_RX: 0.15, P_KNEE_R: 0.45}, [-0.04, 0.02, 0.03, 0.12]],
		[{P_ARM_RX: 1.45, P_ARM_RZ: -1.05, P_ELBOW_R: 1.8, P_SPINE_Y: 0.58, P_SPINE_X: 0.1, P_SPINE_Z: 0.06, P_ARM_LX: 0.25, P_ARM_LZ: 0.45, P_ELBOW_L: 1.3, P_LEG_LX: 0.28, P_KNEE_L: 0.48, P_LEG_RX: 0.18, P_KNEE_R: 0.52}, [-0.06, 0.03, 0.05, 0.22]],
		[{P_ARM_RX: 1.5, P_ARM_RZ: 0.55, P_ELBOW_R: 0.12, P_SPINE_Y: -0.25, P_SPINE_X: 0.18, P_SPINE_Z: -0.04, P_ARM_LX: 0.2, P_ARM_LZ: 0.95, P_ELBOW_L: 0.6, P_LEG_LX: -0.1, P_KNEE_L: 0.4, P_LEG_RX: 0.6, P_KNEE_R: 0.75}, [0.06, 0.05, -0.04, -0.14]],
		[{P_ARM_RX: 1.3, P_ARM_RZ: 1.25, P_ELBOW_R: 0.2, P_SPINE_Y: -0.6, P_SPINE_X: 0.2, P_SPINE_Z: -0.08, P_ARM_LX: 0.15, P_ARM_LZ: 1.0, P_ELBOW_L: 0.5, P_LEG_LX: -0.14, P_KNEE_L: 0.42, P_LEG_RX: 0.62, P_KNEE_R: 0.8}, [0.09, 0.06, -0.07, -0.22]],
		[{P_ARM_RX: 1.2, P_ARM_RZ: 0.95, P_ELBOW_R: 0.4, P_SPINE_Y: -0.45, P_SPINE_X: 0.16, P_SPINE_Z: -0.05, P_ARM_LX: 0.2, P_ARM_LZ: 0.8, P_ELBOW_L: 0.7, P_LEG_LX: -0.08, P_KNEE_L: 0.38, P_LEG_RX: 0.5, P_KNEE_R: 0.68}, [0.06, 0.04, -0.04, -0.16]],
	],
	# lunge: drawn back to the hip, weight sunk on the back leg, then the point driven home with the whole body behind it
	[
		[{P_ARM_RX: 0.75, P_ARM_RZ: 0.2, P_ELBOW_R: 1.7, P_SPINE_Y: -0.32, P_SPINE_X: 0.0, P_SPINE_Z: -0.03, P_ARM_LX: 0.75, P_ARM_LZ: 0.3, P_ELBOW_L: 0.4, P_LEG_RX: -0.05, P_KNEE_R: 0.5, P_LEG_LX: 0.28, P_KNEE_L: 0.42}, [-0.07, -0.04, 0.0, -0.12]],
		[{P_ARM_RX: 0.6, P_ARM_RZ: 0.28, P_ELBOW_R: 2.1, P_SPINE_Y: -0.5, P_SPINE_X: -0.05, P_SPINE_Z: -0.05, P_ARM_LX: 0.95, P_ARM_LZ: 0.25, P_ELBOW_L: 0.2, P_LEG_RX: -0.08, P_KNEE_R: 0.62, P_LEG_LX: 0.32, P_KNEE_L: 0.5}, [-0.12, -0.06, 0.01, -0.22]],
		[{P_ARM_RX: 1.58, P_ARM_RZ: 0.02, P_ELBOW_R: 0.0, P_SPINE_Y: 0.45, P_SPINE_X: 0.3, P_SPINE_Z: 0.02, P_ARM_LX: -0.55, P_ARM_LZ: 0.55, P_ELBOW_L: 0.2, P_LEG_RX: 0.95, P_KNEE_R: 0.95, P_LEG_LX: -0.55, P_KNEE_L: 0.08}, [0.12, 0.12, -0.02, 0.24]],
		[{P_ARM_RX: 1.62, P_ARM_RZ: 0.0, P_ELBOW_R: 0.0, P_SPINE_Y: 0.52, P_SPINE_X: 0.36, P_SPINE_Z: 0.03, P_ARM_LX: -0.7, P_ARM_LZ: 0.6, P_ELBOW_L: 0.15, P_LEG_RX: 1.0, P_KNEE_R: 1.02, P_LEG_LX: -0.6, P_KNEE_L: 0.1}, [0.16, 0.14, -0.03, 0.28]],
		[{P_ARM_RX: 1.5, P_ARM_RZ: 0.04, P_ELBOW_R: 0.15, P_SPINE_Y: 0.42, P_SPINE_X: 0.3, P_SPINE_Z: 0.02, P_ARM_LX: -0.5, P_ARM_LZ: 0.55, P_ELBOW_L: 0.3, P_LEG_RX: 0.9, P_KNEE_R: 0.92, P_LEG_LX: -0.5, P_KNEE_L: 0.1}, [0.12, 0.1, -0.02, 0.22]],
	],
]
