class_name Figure
extends RefCounted
## One townsperson (the web game's Figure, src/port/pirates.ts): a skeleton
## laid out on the crew sculpt's joints, posed by what the town has them doing
## and drawn by the ship crews' instanced sailor (CrewView). Arms are posed
## either the crews' way, swung forward then out (reach), or as plain Euler
## angles out-then-forward, which are re-expressed the crews' way when the
## pose is written. Rotations are the web's: hips in XYZ order, the head
## nodding, turning and tilting.

## The sculpt's joints (the web's RIG).
const HIP := 0.88

var style: Dictionary
var look: CrewLook
## Their row of the pose texture: joint angles and expressions, then the
## style (palette row, hat, held prop, kit flags).
var row := PackedFloat32Array()
## Their palette row while drawn (-1 none).
var palette := -1
## The meshes of their extras at each cut (CrewModel.Level.extras).
var kit: Array[PackedInt32Array] = []
var girth := 1.0
## Some folk grin more than others.
var mood := 0.0
var prop := CrewModel.PROP_NONE

# the skeleton, in the town's frame
var root_pos := Vector3.ZERO
var root_yaw := 0.0
var size := 1.0
var hips_pos := Vector3(0.0, HIP, 0.0)
var hips_rot := Vector3.ZERO
var head_rot := Vector3.ZERO
var arm_l := Vector3.ZERO
var arm_r := Vector3.ZERO
## An arm posed by reach() (forward, then out), not as Euler angles.
var reach_l := false
var reach_r := false
var elbow_l := 0.0
var elbow_r := 0.0
var leg_l := 0.0
var leg_r := 0.0
## Everything the joints don't say: fingers, jaw, brows, gaze, smile and knees (CrewModel.P_*).
var pose := PackedFloat32Array()


func _init(p_style: Dictionary, seed_value: int) -> void:
	style = p_style
	girth = float(style.get("girth", 1.0))
	mood = 0.25 + 0.5 * absf(sin(seed_value * 12.9898))
	look = Figure.look_of(style, seed_value)
	pose.resize(CrewModel.POSE_SIZE)
	row.resize(CrewModel.ROW_FLOATS)
	row[CrewModel.STYLE_HAT] = look.hat
	row[CrewModel.STYLE_FLAGS] = look.flags
	for lv in CrewModel.levels():
		kit.append(lv.extras(look.flags))
	rest()


## Back to a neutral stand, hands loose, wearing their usual expression.
func rest() -> void:
	hips_pos = Vector3(0.0, HIP, 0.0)
	hips_rot = Vector3.ZERO
	head_rot = Vector3.ZERO
	arm_l = Vector3(0.0, 0.0, 0.12)
	arm_r = Vector3(0.0, 0.0, -0.12)
	reach_l = false
	reach_r = false
	elbow_l = -0.15
	elbow_r = -0.15
	leg_l = 0.0
	leg_r = 0.0
	pose.fill(0.0)
	pose[CrewModel.P_KNEE_L] = 0.04
	pose[CrewModel.P_KNEE_R] = 0.04
	pose[CrewModel.P_HAND_L] = 0.3
	pose[CrewModel.P_HAND_R] = 0.3
	pose[CrewModel.P_SMILE] = mood


## The classic toy walk cycle, with knees and elbows.
func walk(phase: float, amp: float = 1.0) -> void:
	var s := sin(phase)
	var c := cos(phase)
	leg_l = s * 0.55 * amp
	leg_r = -s * 0.55 * amp
	pose[CrewModel.P_KNEE_L] = 0.1 + 0.8 * amp * maxf(0.0, -c)
	pose[CrewModel.P_KNEE_R] = 0.1 + 0.8 * amp * maxf(0.0, c)
	arm_l.x = -s * 0.5 * amp
	arm_r.x = s * 0.5 * amp
	elbow_l = -0.25 - 0.25 * amp * maxf(0.0, s)
	elbow_r = -0.25 - 0.25 * amp * maxf(0.0, -s)
	hips_pos.y = HIP + (absf(c) - 1.0) * 0.035 * amp
	hips_rot.z = s * 0.045 * amp
	hips_rot.y = s * 0.08 * amp


## An arm posed the way the ship crews pose theirs: swung forward, then out,
## then the elbow bent.
func reach(left: bool, fwd: float, out: float, elbow: float) -> void:
	if left:
		arm_l = Vector3(-fwd, 0.0, out)
		reach_l = true
		elbow_l = -elbow
	else:
		arm_r = Vector3(-fwd, 0.0, -out)
		reach_r = true
		elbow_r = -elbow


## An arm posed as Euler angles (XYZ, out-then-forward).
func arm(left: bool, x: float, y: float, z: float) -> void:
	if left:
		arm_l = Vector3(x, y, z)
		reach_l = false
	else:
		arm_r = Vector3(x, y, z)
		reach_r = false


## Seated on something `seat` metres high, thighs forward, shins hanging.
func sit(seat: float) -> void:
	hips_pos.y = seat + 0.08
	leg_l = -1.35
	leg_r = -1.35
	pose[CrewModel.P_KNEE_L] = 1.35
	pose[CrewModel.P_KNEE_R] = 1.35


## Where they stand in the town, which way they face, and on what.
func place(x: float, z: float, yaw: float, y: float) -> void:
	root_pos = Vector3(x, y, z)
	root_yaw = yaw


## The town-frame transform of their hips (props hang from it).
func hips_xf() -> Transform3D:
	return Transform3D(Basis(Vector3.UP, root_yaw).scaled(Vector3.ONE * size), root_pos) * Transform3D(Basis.from_euler(hips_rot, EULER_ORDER_XYZ), hips_pos)


## The sculpt's placement (its hip joint on the skeleton's hips), in the town's frame.
func body_xf() -> Transform3D:
	return hips_xf() * Transform3D(Basis.from_scale(Vector3(girth, 1.0, girth)), Vector3(0.0, -HIP, 0.0))


## Copies the joints into the pose row the crews' shader reads.
func write() -> PackedFloat32Array:
	for i in CrewModel.POSE_SIZE:
		row[i] = pose[i]
	var l := _crew_arm(arm_l, reach_l)
	var r := _crew_arm(arm_r, reach_r)
	row[CrewModel.P_ARM_LX] = l.x
	row[CrewModel.P_ARM_LZ] = l.y
	row[CrewModel.P_ARM_RX] = r.x
	row[CrewModel.P_ARM_RZ] = -r.y
	row[CrewModel.P_ELBOW_L] = -elbow_l
	row[CrewModel.P_ELBOW_R] = -elbow_r
	row[CrewModel.P_LEG_LX] = -leg_l
	row[CrewModel.P_LEG_RX] = -leg_r
	row[CrewModel.P_HEAD_X] = head_rot.x
	row[CrewModel.P_HEAD_Y] = head_rot.y
	row[CrewModel.P_HEAD_Z] = head_rot.z
	if prop != CrewModel.PROP_NONE:
		row[CrewModel.P_HAND_R] = maxf(row[CrewModel.P_HAND_R], 0.95)
	row[CrewModel.STYLE_ROW] = palette
	row[CrewModel.STYLE_PROP] = prop
	return row


## Forward swing and outward swing (the crews' convention) for an arm.
static func _crew_arm(e: Vector3, crew: bool) -> Vector2:
	if crew:
		return Vector2(-e.x, e.z)
	var d := Basis.from_euler(e, EULER_ORDER_XYZ) * Vector3.DOWN
	var fwd := asin(clampf(d.z, -1.0, 1.0))
	var sx := fwd
	var a := atan2(d.x, -d.y)
	# an arm raised overhead: reach up and over rather than out and twisted round
	var a2 := atan2(-d.x, d.y)
	if absf(a2) < absf(a):
		sx = PI - fwd
		a = a2
	return Vector2(sx, a)


# ------------------------------------------------------------------ looks

## The crew-sculpt palette and kit for a townsperson in this style (the
## web's lookOf, with its own seeded numbers so they dress the same).
static func look_of(st: Dictionary, seed_value: int) -> CrewLook:
	var r := seed_value * 7.31 + 1.0
	var rnd := func() -> float:
		r = fmod(r * 16807.0, 2147483647.0)
		return r / 2147483647.0
	var pick := func(a: Array) -> Variant:
		return a[int(rnd.call() * a.size()) % a.size()]
	var hex := func(h: String, a: float = 0.0) -> Color:
		var c := Color(h).srgb_to_linear()
		c.a = a
		return c
	var s := PackedColorArray()
	s.resize(CrewModel.SLOTS)
	s.fill(Color(1.0, 1.0, 1.0, 0.0))
	s[CrewModel.TINT_GHOST] = Color(0.0, 0.0, 0.0, 0.0)
	var shirt: Color = hex.call(st.shirt)
	var skin: Color = hex.call(st.skin)
	var pants: Color = hex.call(st.pants)
	s[CrewModel.TINT_SKIN] = skin
	s[CrewModel.TINT_SHIRT] = shirt
	s[CrewModel.TINT_COAT] = shirt
	var sleeves: float = rnd.call()
	s[CrewModel.TINT_SLEEVE] = skin if sleeves < 0.25 else shirt
	s[CrewModel.TINT_FOREARM] = skin if sleeves < 0.6 else shirt
	s[CrewModel.TINT_TROUSERS] = pants
	s[CrewModel.TINT_SHIN] = pants
	s[CrewModel.TINT_BOOTS] = hex.call(st.boots)
	s[CrewModel.TINT_SASH] = hex.call(pick.call(["#a3241f", "#2a6fd0", "#e2b552", "#2f6b47", "#5e1414"]))
	s[CrewModel.TINT_HAT] = hex.call(st.hat_color, -1.0 if st.hat == CrewModel.HAT_BANDANA else 0.0)
	var beard: String = st.get("beard", "")
	s[CrewModel.TINT_HAIR] = hex.call(beard if beard != "" else pick.call(["#1b1512", "#2e2018", "#4a3020", "#6b4325", "#8a5a2b", "#8d8a86"]))
	s[CrewModel.TINT_TRIM] = hex.call("#d4a64a")
	s[CrewModel.TINT_WOOD] = hex.call("#8a6440")
	s[CrewModel.TINT_METAL] = hex.call("#c7ced6")
	s[CrewModel.TINT_GLOW] = hex.call("#ff7a2a", 7.0)
	s[CrewModel.TINT_CLOTH] = hex.call("#d8ccb0")
	s[CrewModel.TINT_STRIPE] = hex.call(pick.call(["#f1ead9", "#1f3550", "#9c2a2a"]))
	s[CrewModel.TINT_DARK] = hex.call("#1a1210")
	s[CrewModel.TINT_WHITE] = hex.call("#f6f2ea")
	s[CrewModel.TINT_PUPIL] = hex.call(pick.call(["#5a3a1e", "#6b4423", "#3b6e8f", "#4f7a3a", "#3f2a18"]))
	s[CrewModel.TINT_PARROT] = hex.call("#d8322a")
	s[CrewModel.TINT_WING] = hex.call("#2f8ad8")
	s[CrewModel.TINT_BEAK] = hex.call("#f3d27a")
	s[CrewModel.TINT_VEST] = hex.call(pick.call(["#3a2a22", "#5e1414", "#2d2a33", "#6b4a2b"]))
	s[CrewModel.TINT_PLUME] = hex.call("#efe6d6")
	s[CrewModel.TINT_LEATHER] = hex.call(pick.call(["#3b2a1e", "#2a1f18", "#5a3a24"]))
	s[CrewModel.TINT_MOUTH] = hex.call("#4a1618")
	s[CrewModel.TINT_TONGUE] = hex.call("#c75a5e")
	s[CrewModel.TINT_SHINE] = hex.call("#ffffff", 0.6)
	var flags: int = CrewModel.F_BOOTS | int(st.get("flags", 0))
	if beard != "":
		flags |= (CrewModel.F_BEARD | CrewModel.F_MOUSTACHE) if rnd.call() < 0.7 else CrewModel.F_MOUSTACHE
	if sleeves >= 0.25 and sleeves < 0.6:
		flags |= CrewModel.F_ROLLED
	elif sleeves >= 0.6:
		flags |= CrewModel.F_CUFFS
	if rnd.call() < 0.5:
		flags |= CrewModel.F_EARRING
	if rnd.call() < 0.4:
		flags |= CrewModel.F_BELT
	if rnd.call() < 0.3:
		flags |= CrewModel.F_KERCHIEF
	if st.hat == CrewModel.HAT_NONE and rnd.call() < 0.3:
		flags |= CrewModel.F_PONYTAIL
	var look := CrewLook.new()
	look.slots = s
	look.hat = st.hat
	look.flags = flags
	return look


## How a townsperson of each role dresses (the web's townStyle): merchants
## in vests, porters with their sleeves rolled, strollers in coats and
## tricorns, the harbourmaster in his.
static func style_for(role: String, rnd: Mulberry32, spec: Dictionary) -> Dictionary:
	var skin: String = rnd.pick(["#f3c9a5", "#e8b48c", "#d59a6e", "#c68a5e", "#a86e48", "#8d5a3b", "#6e4630"])
	var shirt: String = rnd.pick(["#f1ead9", "#e9dcc0", "#c8d6d2", "#f3ecdc", spec.wall2, spec.awning[0], "#5b8fb5", "#d9a441"])
	var pants: String = rnd.pick(["#2d3f66", "#6b4a2b", "#3b4c3a", "#262a36", "#4a3a2a", "#d8c8a6", "#3a5f8a"])
	var hair: String = rnd.pick(["#1b1512", "#2e2018", "#4a3020", "#6b4325", "#8a5a2b", "#8d8a86", "#d8d0c4"])
	var beard: String = hair if rnd.next() < 0.45 else ""
	var boots: String = rnd.pick(["#3a2618", "#2a1c12", "#1d1612"])
	var st := {"shirt": shirt, "pants": pants, "skin": skin, "hat": CrewModel.HAT_NONE, "hat_color": "#000000", "beard": beard, "boots": boots}
	match role:
		"merchant":
			st.hat = rnd.pick([CrewModel.HAT_STRAW, CrewModel.HAT_NONE, CrewModel.HAT_KNIT])
			st.hat_color = rnd.pick(["#e8cf8a", "#9c2a2a", "#2f6b47"])
			st.girth = 1.05 + rnd.next() * 0.15
			st.flags = CrewModel.F_VEST | (CrewModel.F_CUFFS if rnd.next() < 0.5 else 0)
		"porter":
			st.shirt = rnd.pick(["#f1ead9", "#c8d6d2", "#d9a441", "#9c2a2a"])
			st.hat = rnd.pick([CrewModel.HAT_BANDANA, CrewModel.HAT_KNIT, CrewModel.HAT_NONE])
			st.hat_color = rnd.pick(["#c8352b", "#2f8ad8", "#2f6b47", "#e0a13a"])
			st.girth = 1.08 + rnd.next() * 0.14
			st.flags = CrewModel.F_ROLLED | (CrewModel.F_BAREFOOT if rnd.next() < 0.4 else 0)
		"stroller":
			st.hat = CrewModel.HAT_TRICORN
			st.hat_color = rnd.pick(["#1f1b1a", "#27407a", "#5a3a22"])
			st.flags = CrewModel.F_COAT | CrewModel.F_CUFFS | (CrewModel.F_PLUME if rnd.next() < 0.5 else 0)
		"kid":
			st.beard = ""
			st.hat = CrewModel.HAT_STRAW if rnd.next() < 0.5 else CrewModel.HAT_NONE
			st.hat_color = "#e8cf8a"
			st.flags = CrewModel.F_BAREFOOT | CrewModel.F_ROLLED
		"harbourmaster":
			st.shirt = "#f3ecdc"
			st.beard = "#d8d0c4"
			st.hat = CrewModel.HAT_TRICORN
			st.hat_color = "#141212"
			st.girth = 1.12
			st.flags = CrewModel.F_COAT | CrewModel.F_CUFFS | CrewModel.F_BELT
		"musician":
			st.hat = CrewModel.HAT_STRAW
			st.hat_color = "#e8cf8a"
			st.flags = CrewModel.F_VEST | CrewModel.F_ROLLED
		"fisher":
			st.hat = CrewModel.HAT_STRAW
			st.hat_color = "#d8c08a"
			st.flags = CrewModel.F_ROLLED | CrewModel.F_BAREFOOT | CrewModel.F_GARTERS
	return st
