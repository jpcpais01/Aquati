class_name Sailor
extends RefCounted
## One crewman: where he stands on his deck (ship-local: +z to the bow, +x to
## port), what he's about, the pose he holds and the one he's easing into,
## and once he's over the side, where he is in the sea (world space). His
## brain is his ship's ShipCrew; CrewBrain swims him once she's gone.

enum Role { CAPTAIN, HELM, GUNNER, HAND }
enum Mode { ABOARD, AIR, SWIM, GONE }
enum Act { STAND, HELM, PACE, GLASS, POINT, RAIL, GUN, HAUL, SWAB, LEAN, SIT, COIL, CHAT, POWDER, BUCKET, PANIC, SALUTE, FIDDLE, JIG }

var role := Role.HAND
var look: CrewLook
## His palette row (CrewView), -1 once released.
var row := -1
var mode := Mode.ABOARD
var act := Act.STAND
var act_t := 0.0
var act_dur := 5.0
var x := 0.0
var z := 0.0
## Lift off the planks (a barrel to sit on).
var y := 0.0
var yaw := 0.0
var want_yaw := 0.0
## The pose he holds (CrewModel.P_*), then his row of the pose texture's
## style: palette row, hat, held prop, kit flags (CrewModel.ROW_FLOATS).
var pose := PackedFloat32Array()
## The pose he's easing into this frame.
var target := PackedFloat32Array()
var prop := CrewModel.PROP_NONE
var zone: ShipCrew.Zone
## The meshes of his extras at each cut (CrewModel.Level.extras).
var kit: Array[PackedInt32Array] = []

# walking
var walking_to := false
var goal_x := 0.0
var goal_z := 0.0
var goal_yaw := 0.0
var goal_turn := false
var run := false
var phase := 0.0
var moving := 0.0
var stuck := 0.0
## An obstacle he may walk into (the barrel he sits on), as its index.
var ignore := -1

# flavour
var seed := 0.0
var tempo := 1.0
## Some sailors just grin more than others.
var mood := 0.0
var height := 1.0
var girth := 1.0
var look_yaw := 0.0
var look_t := 0.0
var flinch := 0.0
var cheer := 0.0
var gun: ShipCrew.GunPost
var haul: ShipCrew.Haul
## The barrel he sits on (an obstacle index), or -1.
var seat := -1
var partner: Sailor
var panic_delay := 0.0
## Founder: he has set off for the high side.
var bolting := false

# free flight and swimming (world space)
var wx := 0.0
var wy := 0.0
var wz := 0.0
var vx := 0.0
var vy := 0.0
var vz := 0.0
var swim_t := 0.0
var dive := false
var fade := 0.0


func _init(p_role: Role, p_look: CrewLook, p_row: int, p_zone: ShipCrew.Zone, rng: RandomNumberGenerator) -> void:
	role = p_role
	look = p_look
	row = p_row
	zone = p_zone
	phase = rng.randf() * 6.0
	seed = rng.randf() * 100.0
	tempo = rng.randf_range(0.88, 1.12)
	mood = rng.randf_range(-0.15, 0.55)
	height = rng.randf_range(0.94, 1.06)
	girth = rng.randf_range(0.92, 1.12)
	dive = rng.randf() < 0.5
	pose = CrewBrain.REST.duplicate()
	pose.resize(CrewModel.ROW_FLOATS)
	pose[CrewModel.STYLE_ROW] = row
	pose[CrewModel.STYLE_HAT] = look.hat
	pose[CrewModel.STYLE_FLAGS] = look.flags
	target = CrewBrain.REST.duplicate()
	for lv in CrewModel.levels():
		kit.append(lv.extras(look.flags))


## Eases the pose toward the target at `rate`; the eyes lead every turn of
## the head, and of the body, and he swings round toward where he faces.
func settle(dt: float, rate: float, turn: float) -> void:
	var k := MathX.damp(rate, dt)
	for i in CrewModel.POSE_SIZE:
		pose[i] += (target[i] - pose[i]) * k
	var lead := (target[CrewModel.P_HEAD_Y] - pose[CrewModel.P_HEAD_Y]) * 1.4 + MathX.angle_delta(yaw, want_yaw) * 0.8
	pose[CrewModel.P_GAZE_X] = clampf(target[CrewModel.P_GAZE_X] + lead, -0.6, 0.6)
	pose[CrewModel.STYLE_PROP] = prop
	yaw += MathX.angle_delta(yaw, want_yaw) * MathX.damp(turn, dt)


## The same, without the eyes' lead (in the air and in the water).
func settle_loose(dt: float) -> void:
	var k := MathX.damp(10.0, dt)
	for i in CrewModel.POSE_SIZE:
		pose[i] += (target[i] - pose[i]) * k
	pose[CrewModel.STYLE_PROP] = prop
	yaw += MathX.angle_delta(yaw, want_yaw) * MathX.damp(4.0, dt)


func walk_to(gx: float, gz: float, p_run: bool = false, turn: bool = false, gyaw: float = 0.0, p_ignore: int = -1) -> void:
	walking_to = true
	goal_x = gx
	goal_z = gz
	goal_turn = turn
	goal_yaw = gyaw
	run = p_run
	stuck = 0.0
	ignore = p_ignore


func set_task(p_act: Act, dur: float) -> void:
	act = p_act
	act_t = 0.0
	act_dur = dur
	seat = -1
	partner = null
