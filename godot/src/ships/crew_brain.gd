class_name CrewBrain
extends RefCounted
## The poses every sailor is built from (rest, the stride, a crouch), what
## his hands and face do for the job at hand, and the sea once he's over the
## side: the leap, the splash, a laboured breaststroke away from the wreck
## until his strength gives out. Shared by every ShipCrew; the web game's
## free functions in src/ships/crew.ts.

## Props gripped two-handed, and how tight the off hand closes on them.
const OFF_HAND := {
	CrewModel.PROP_RAMMER: 0.95, CrewModel.PROP_MOP: 0.95, CrewModel.PROP_BUCKET: 0.9,
	CrewModel.PROP_SPYGLASS: 0.85, CrewModel.PROP_FIDDLE: 0.7,
}

## Arms easy at the sides, elbows and knees just off straight, hands half shut.
static var REST := PackedFloat32Array([
	0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.15, 0.0, 0.1, 0.15, 0.0,
	0.04, 0.0, 0.04, 0.0, 0.0, 0.3, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0,
])
## A second pose to blend an overlay (a cheer, a flinch) in from.
static var _tmp := PackedFloat32Array()


static func rest(o: PackedFloat32Array) -> void:
	o.fill(0.0)
	o[CrewModel.P_ARM_LZ] = 0.1
	o[CrewModel.P_ARM_RZ] = 0.1
	o[CrewModel.P_ELBOW_L] = 0.15
	o[CrewModel.P_ELBOW_R] = 0.15
	o[CrewModel.P_KNEE_L] = 0.04
	o[CrewModel.P_KNEE_R] = 0.04
	o[CrewModel.P_HAND_L] = 0.3
	o[CrewModel.P_HAND_R] = 0.3


## The stride at phase `ph`: a walk, or (run 1) a run; busy arms carry something.
static func walk(o: PackedFloat32Array, ph: float, run: float, arms_busy: bool = false) -> void:
	var s := sin(ph)
	var c := cos(ph)
	var leg_a := 0.5 + 0.3 * run
	o[CrewModel.P_LEG_LX] = leg_a * s
	o[CrewModel.P_LEG_RX] = -leg_a * s
	var kn := 0.75 + 0.6 * run
	o[CrewModel.P_KNEE_L] = 0.1 + kn * maxf(0.0, c)
	o[CrewModel.P_KNEE_R] = 0.1 + kn * maxf(0.0, -c)
	if not arms_busy:
		var arm_a := 0.35 + 0.45 * run
		o[CrewModel.P_ARM_LX] = -arm_a * s
		o[CrewModel.P_ARM_RX] = arm_a * s
		o[CrewModel.P_ELBOW_L] = 0.25 + 1.0 * run + 0.25 * maxf(0.0, -s)
		o[CrewModel.P_ELBOW_R] = 0.25 + 1.0 * run + 0.25 * maxf(0.0, s)
	o[CrewModel.P_SPINE_X] = 0.05 + 0.25 * run
	o[CrewModel.P_SPINE_Y] = 0.1 * s
	o[CrewModel.P_HEAD_X] = -0.05 - 0.15 * run
	o[CrewModel.P_ROOT_Y] = -0.015 - 0.05 * run - (0.035 + 0.04 * run) * s * s


## Down on his haunches by k (0..1), both feet planted: thighs forward, knees back, hips dropped.
static func crouch(o: PackedFloat32Array, k: float) -> void:
	var th := 0.55 * k
	var kn := 1.1 * k
	o[CrewModel.P_LEG_LX] = th
	o[CrewModel.P_LEG_RX] = th
	o[CrewModel.P_KNEE_L] = kn
	o[CrewModel.P_KNEE_R] = kn
	o[CrewModel.P_ROOT_Y] = -(0.38 * (1.0 - cos(th)) + 0.42 * (1.0 - cos(kn - th)))
	o[CrewModel.P_SPINE_X] += th * 0.6


## The scratch pose an overlay is built in, at rest.
static func overlay() -> PackedFloat32Array:
	if _tmp.is_empty():
		_tmp.resize(CrewModel.POSE_SIZE)
	rest(_tmp)
	return _tmp


## Blends the overlay pose (from overlay()) into t by w.
static func blend_in(t: PackedFloat32Array, w: float) -> void:
	if w <= 0.0:
		return
	var k := minf(1.0, w)
	for i in CrewModel.POSE_SIZE:
		t[i] += (_tmp[i] - t[i]) * k


## His arms raised and roaring: a kill.
static func cheer_pose(o: PackedFloat32Array, tt: float) -> void:
	var j := maxf(0.0, sin(tt * 8.5))
	o[CrewModel.P_ARM_RX] = 2.7 + 0.3 * sin(tt * 8.5)
	o[CrewModel.P_ARM_LX] = 2.5 + 0.3 * sin(tt * 8.5 + 1.3)
	o[CrewModel.P_ARM_RZ] = -0.35
	o[CrewModel.P_ARM_LZ] = -0.35
	o[CrewModel.P_ELBOW_L] = 0.35
	o[CrewModel.P_ELBOW_R] = 0.2
	o[CrewModel.P_HEAD_X] = -0.3
	o[CrewModel.P_HAND_L] = 1.0
	o[CrewModel.P_HAND_R] = 1.0
	o[CrewModel.P_JAW] = 0.65 + 0.35 * sin(tt * 8.5)
	o[CrewModel.P_BROW] = 0.8
	o[CrewModel.P_SMILE] = 1.0
	o[CrewModel.P_GAZE_Y] = 0.3
	o[CrewModel.P_KNEE_L] = 0.5 * (1.0 - j)
	o[CrewModel.P_KNEE_R] = 0.5 * (1.0 - j)
	o[CrewModel.P_LEG_LX] = 0.25 * (1.0 - j)
	o[CrewModel.P_LEG_RX] = 0.25 * (1.0 - j)
	o[CrewModel.P_ROOT_Y] = j * 0.22 - (1.0 - j) * 0.08


## Ducked behind his arms: a ball has struck home.
static func flinch_pose(o: PackedFloat32Array) -> void:
	o[CrewModel.P_SPINE_X] = 0.35
	crouch(o, 0.9)
	o[CrewModel.P_ARM_LX] = 2.3
	o[CrewModel.P_ARM_RX] = 2.2
	o[CrewModel.P_ARM_LZ] = -0.1
	o[CrewModel.P_ARM_RZ] = -0.1
	o[CrewModel.P_ELBOW_L] = 1.9
	o[CrewModel.P_ELBOW_R] = 1.9
	o[CrewModel.P_HEAD_X] = 0.55
	o[CrewModel.P_HAND_L] = 0.15
	o[CrewModel.P_HAND_R] = 0.15
	o[CrewModel.P_JAW] = 0.35
	o[CrewModel.P_BROW] = 1.0
	o[CrewModel.P_SMILE] = -0.7


## Hands and faces: what a sailor's fingers and features are doing for the job at hand.
static func face(sl: Sailor, t: PackedFloat32Array, tt: float, walking: bool, battle: bool, prop: int) -> void:
	t[CrewModel.P_SMILE] = sl.mood
	t[CrewModel.P_BROW] = 0.15 * sin(tt * 0.37)
	if battle:
		t[CrewModel.P_SMILE] = minf(sl.mood, 0.0) - 0.25
		t[CrewModel.P_BROW] = -0.55
	if prop != CrewModel.PROP_NONE:
		t[CrewModel.P_HAND_R] = 0.8 if prop == CrewModel.PROP_FIDDLE else 1.0
		t[CrewModel.P_HAND_L] = OFF_HAND.get(prop, t[CrewModel.P_HAND_L])
	if walking:
		return
	match sl.act:
		Sailor.Act.HELM, Sailor.Act.HAUL:
			t[CrewModel.P_HAND_L] = 1.0
			t[CrewModel.P_HAND_R] = 1.0
			if sl.act == Sailor.Act.HAUL:
				t[CrewModel.P_BROW] -= 0.3
				# heave-ho
				t[CrewModel.P_JAW] = 0.3 + 0.3 * maxf(0.0, sin(tt * 4.2))
			else:
				t[CrewModel.P_BROW] -= 0.15
		Sailor.Act.COIL, Sailor.Act.SWAB:
			t[CrewModel.P_HAND_L] = maxf(t[CrewModel.P_HAND_L], 0.85)
			t[CrewModel.P_HAND_R] = maxf(t[CrewModel.P_HAND_R], 0.85)
		Sailor.Act.PACE:
			# hands clasped at the small of the back
			t[CrewModel.P_HAND_L] = 0.7
			t[CrewModel.P_HAND_R] = 0.7
			t[CrewModel.P_BROW] -= 0.25
		Sailor.Act.LEAN:
			t[CrewModel.P_HAND_L] = 0.55
			t[CrewModel.P_HAND_R] = 1.0 if prop == CrewModel.PROP_PIPE else 0.55
		Sailor.Act.POINT, Sailor.Act.RAIL:
			if battle:
				# bellowing orders across the deck
				t[CrewModel.P_JAW] = 0.45 + 0.4 * maxf(0.0, sin(tt * 5.3))
				t[CrewModel.P_BROW] = -0.9
				t[CrewModel.P_SMILE] = -0.3
		Sailor.Act.GUN:
			t[CrewModel.P_BROW] = -0.6
			t[CrewModel.P_JAW] = 0.12
		Sailor.Act.POWDER, Sailor.Act.BUCKET:
			t[CrewModel.P_BROW] = 0.5
			t[CrewModel.P_JAW] = 0.35
			t[CrewModel.P_SMILE] = -0.3
		Sailor.Act.CHAT:
			if sin(tt * 0.9 + sl.seed) > 0.0:
				# syllables, and the eyebrows doing half the talking
				t[CrewModel.P_JAW] = 0.12 + 0.4 * maxf(0.0, sin(tt * 11.0)) * (0.5 + 0.5 * sin(tt * 2.7))
				t[CrewModel.P_BROW] = 0.45 * maxf(0.0, sin(tt * 1.9))
				t[CrewModel.P_SMILE] = sl.mood + 0.3
				if prop == CrewModel.PROP_NONE:
					t[CrewModel.P_HAND_R] = 0.15
			else:
				# listening, amused
				t[CrewModel.P_SMILE] = sl.mood + 0.15 + 0.4 * maxf(0.0, sin(tt * 1.3))
				t[CrewModel.P_HAND_L] = 0.5
				if prop == CrewModel.PROP_NONE:
					t[CrewModel.P_HAND_R] = 0.5
		Sailor.Act.FIDDLE:
			t[CrewModel.P_SMILE] = 0.7
			t[CrewModel.P_BROW] = 0.3
			t[CrewModel.P_GAZE_Y] = -0.25
		Sailor.Act.JIG:
			var hips := fmod(sl.seed, 2.0) >= 1.0
			t[CrewModel.P_HAND_L] = 0.5 if hips else 0.7
			t[CrewModel.P_HAND_R] = 0.5 if hips else 0.7
			t[CrewModel.P_SMILE] = 1.0
			t[CrewModel.P_JAW] = 0.3 * maxf(0.0, sin(tt * 3.75))
			t[CrewModel.P_BROW] = 0.5
		Sailor.Act.SIT:
			t[CrewModel.P_HAND_L] = 0.4
			t[CrewModel.P_HAND_R] = 1.0 if prop == CrewModel.PROP_PIPE else 0.4
			t[CrewModel.P_SMILE] = sl.mood + 0.2
		_:
			if t[CrewModel.P_ELBOW_L] > 1.4 and t[CrewModel.P_ARM_LZ] > 0.4:
				# hands on hips
				t[CrewModel.P_HAND_L] = 0.55
				t[CrewModel.P_HAND_R] = 0.55


## A sailor over the side (world space): flying from the rail, then swimming
## away from the wreck until he tires and goes under (mode GONE).
static func step_loose(sl: Sailor, dt: float, world: World) -> void:
	var t := sl.target
	var tt := world.time * sl.tempo + sl.seed
	rest(t)
	if sl.mode == Sailor.Mode.AIR:
		sl.vy -= 9.8 * dt
		sl.wx += sl.vx * dt
		sl.wy += sl.vy * dt
		sl.wz += sl.vz * dt
		if sl.dive:
			t[CrewModel.P_ARM_LX] = 2.9
			t[CrewModel.P_ARM_RX] = 2.9
			t[CrewModel.P_ARM_LZ] = -0.15
			t[CrewModel.P_ARM_RZ] = -0.15
			t[CrewModel.P_SPINE_X] = 0.2
		else:
			# cannonball!
			t[CrewModel.P_LEG_LX] = 1.9
			t[CrewModel.P_LEG_RX] = 1.9
			t[CrewModel.P_KNEE_L] = 2.3
			t[CrewModel.P_KNEE_R] = 2.3
			t[CrewModel.P_ARM_LX] = 1.0
			t[CrewModel.P_ARM_RX] = 1.0
			t[CrewModel.P_ELBOW_L] = 1.6
			t[CrewModel.P_ELBOW_R] = 1.6
			t[CrewModel.P_SPINE_X] = 0.4
			t[CrewModel.P_ROOT_Y] = 0.3
		var wh := world.water_height(sl.wx, sl.wz)
		if sl.wy < wh and sl.vy < 0.0:
			sl.mode = Sailor.Mode.SWIM
			sl.swim_t = 0.0
			sl.vx *= 0.15
			sl.vz *= 0.15
			sl.wy = wh
			world.fx.splash(Vector3(sl.wx, wh, sl.wz), 0.32)
			if world.sound != null:
				var h := world.heard(Vector3(sl.wx, wh, sl.wz))
				world.sound.splash(h.x * 0.18, h.y, h.z)
	elif sl.mode == Sailor.Mode.SWIM:
		sl.swim_t += dt
		# a laboured breaststroke away from the wreck
		var w := tt * 3.2
		t[CrewModel.P_ARM_LX] = 1.7 + 0.6 * sin(w)
		t[CrewModel.P_ARM_RX] = 1.7 + 0.6 * sin(w)
		t[CrewModel.P_ARM_LZ] = 0.5 + 0.6 * cos(w)
		t[CrewModel.P_ARM_RZ] = 0.5 + 0.6 * cos(w)
		t[CrewModel.P_ELBOW_L] = 0.5 + 0.4 * maxf(0.0, -cos(w))
		t[CrewModel.P_ELBOW_R] = 0.5 + 0.4 * maxf(0.0, -cos(w))
		t[CrewModel.P_LEG_LX] = 0.3 + 0.35 * sin(w + 1.0)
		t[CrewModel.P_LEG_RX] = 0.3 + 0.35 * sin(w + 1.0)
		t[CrewModel.P_KNEE_L] = 0.9 + 0.6 * sin(w + 2.0)
		t[CrewModel.P_KNEE_R] = 0.9 + 0.6 * sin(w + 2.0)
		t[CrewModel.P_HEAD_X] = -0.95
		var sp := 0.9 * (0.6 + 0.4 * maxf(0.0, sin(w)))
		var k := MathX.damp(2.0, dt)
		sl.vx += (sin(sl.yaw) * sp - sl.vx) * k
		sl.vz += (cos(sl.yaw) * sp - sl.vz) * k
		sl.wx += sl.vx * dt
		sl.wz += sl.vz * dt
		sl.want_yaw += sin(tt * 0.3) * 0.2 * dt
		if sl.swim_t > 6.0 + fmod(sl.seed, 3.0):
			sl.fade += dt * 0.35
		sl.wy += (world.water_height(sl.wx, sl.wz) - sl.fade - sl.wy) * MathX.damp(5.0, dt)
		if sl.fade > 2.2:
			sl.mode = Sailor.Mode.GONE
	if sl.mode == Sailor.Mode.AIR:
		# the yell all the way down
		t[CrewModel.P_JAW] = 1.0
		t[CrewModel.P_BROW] = 1.0
		t[CrewModel.P_SMILE] = 0.2 if sl.dive else 0.6
		t[CrewModel.P_HAND_L] = 0.0 if sl.dive else 1.0
		t[CrewModel.P_HAND_R] = 0.0 if sl.dive else 1.0
	elif sl.mode == Sailor.Mode.SWIM:
		# spluttering, eyes on the horizon
		t[CrewModel.P_JAW] = 0.25 + 0.25 * maxf(0.0, sin(tt * 3.2 + 1.5))
		t[CrewModel.P_BROW] = 0.55
		t[CrewModel.P_SMILE] = -0.4
		t[CrewModel.P_HAND_L] = 0.15
		t[CrewModel.P_HAND_R] = 0.15
		t[CrewModel.P_GAZE_Y] = 0.35
	sl.prop = CrewModel.PROP_NONE
	sl.settle_loose(dt)


## Where a sailor over the side is drawn (feet at the origin of his frame):
## lying in the water, chest at the surface and head up, or tumbling through
## the air from the rail.
static func loose_xf(sl: Sailor) -> Transform3D:
	var sc := Basis.from_scale(Vector3(sl.girth, sl.height, sl.girth))
	if sl.mode == Sailor.Mode.SWIM:
		return Transform3D(Basis.from_euler(Vector3(1.15, sl.yaw, 0.0)) * sc, Vector3(sl.wx, sl.wy - 0.04, sl.wz)) * Transform3D(Basis.IDENTITY, Vector3(0.0, -1.3, 0.0))
	var tumble := clampf(-sl.vy * 0.12, 0.0, 1.4) if sl.dive else clampf(-sl.vy * 0.05, -0.3, 0.6)
	return Transform3D(Basis.from_euler(Vector3(tumble, sl.yaw, 0.0)) * sc, Vector3(sl.wx, sl.wy + 0.9, sl.wz)) * Transform3D(Basis.IDENTITY, Vector3(0.0, -0.9, 0.0))
