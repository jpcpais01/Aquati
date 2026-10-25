class_name Survivors
extends Node3D
## Shipwreck survivors (the web game's src/game/survivors.ts). When a pirate
## goes down, a few of her hands make it to the wreckage: a broken yard or a
## torn-off hatch cover, two or three of them clinging to it with their arms
## over the wood and their legs kicking in the water. As a ship comes near,
## one hauls himself up and waves both arms, shouting; they tire as the
## minutes pass. Throw them a line and they swim for your side and climb the
## hull, one after another, to sign on with your crew. Sail on, and the
## current takes them. The hands are drawn by the crews' sailor (a crowd of
## Crew), the wreckage as two multimeshes.

## One more hand is over the rail: the raft, and how many are still to come.
signal aboard(raft: Raft, left: int)

const RAFT_MAX := 6
const LIFE := 150.0
## From the hull's side, how far a line can be thrown (m).
const LINE_REACH := 14.0

## Where the hands hang on, in raft space: [along x, side z, facing yaw].
const HOLDS := [
	[[-1.4, 0.42, PI], [0.2, -0.42, 0.0], [1.3, 0.42, PI], [-0.5, -0.42, 0.0]],
	[[0.0, 0.95, PI], [1.2, 0.0, -PI / 2.0], [0.0, -0.95, 0.0], [-1.2, 0.0, PI / 2.0]],
]

const _DOWN := Transform3D(Basis.IDENTITY, Vector3(0.0, -1.3, 0.0))

enum Mode { CLING, SWIM, CLIMB }


class Hand:
	var look: CrewLook
	var row := -1
	var pose := PackedFloat32Array()
	var target := PackedFloat32Array()
	var kit: Array[PackedInt32Array] = []
	var hold := 0
	var seed := 0.0
	var mode := Mode.CLING
	var t := 0.0
	var delay := 0.0
	var x := 0.0
	var y := 0.0
	var z := 0.0
	var yaw := 0.0
	## Which of them waves and shouts when a ship comes by.
	var caller := false
	var xf := Transform3D.IDENTITY


class Raft:
	## 0 a broken yard, 1 a hatch cover.
	var kind := 0
	var x := 0.0
	var z := 0.0
	var y := 0.0
	var yaw := 0.0
	var basis := Basis.IDENTITY
	var age := 0.0
	var sink := 0.0
	var hands: Array[Hand] = []
	## The ship they sailed in, and how many clung on to begin with.
	var from := ""
	var crew := 0
	## A line is aboard: they're coming.
	var saved: Ship


var rafts: Array[Raft] = []
var _crew: Crew
var _mm: Array[MultiMesh] = []
var _rng := RandomNumberGenerator.new()


func _init(crew: Crew) -> void:
	name = "Survivors"
	_crew = crew
	_rng.randomize()
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/wreckage.gdshader")
	for m: ArrayMesh in [_spar_mesh(), _hatch_mesh()]:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = m
		mm.instance_count = RAFT_MAX
		mm.visible_instance_count = 0
		_mm.append(mm)
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		mi.material_override = mat
		# (they ride wherever the wreck went down: no culling box worth the reckoning)
		mi.custom_aabb = AABB(Vector3(-1e5, -50.0, -1e5), Vector3(2e5, 100.0, 2e5))
		add_child(mi)
	crew.crowds.append(_draw)


## A snapped yard, still trailing a rag of sail and a coil of line (long axis x).
static func _spar_mesh() -> ArrayMesh:
	var k := MeshKit.new(31)
	k.paint(Color8(0x5b, 0x3d, 0x24))
	k.spar(Vector3(-2.3, 0.0, 0.0), Vector3(2.3, 0.0, 0.0), 0.15, 0.19, 10)
	# the splintered break
	k.paint(Color8(0x8a, 0x64, 0x40))
	for i in 4:
		var l := 0.4 + i * 0.08
		k.cone(Transform3D(Basis(Vector3(0, 0, 1), -PI / 2.0), Vector3(2.3 + l * 0.5, sin(i * 2.1) * 0.08, cos(i * 2.1) * 0.08)), 0.06, l, 4)
	k.paint(Color8(0x2f, 0x2a, 0x26), MeshKit.IRON)
	for x in [-1.6, 0.2, 1.4]:
		k.spar(Vector3(x - 0.04, 0.0, 0.0), Vector3(x + 0.04, 0.0, 0.0), 0.2, 0.2, 10)
	# a torn rag of sail still lashed to it, half awash
	k.paint(Color8(0xbf, 0xb2, 0x93))
	k.box(Transform3D(Basis.from_euler(Vector3(0.35, 0.2, 0.0)), Vector3(-0.9, 0.02, -0.4)), Vector3(1.1, 0.03, 0.6))
	k.paint(Color8(0xb8, 0xa1, 0x72), MeshKit.ROPE)
	k.torus(Transform3D(Basis.IDENTITY, Vector3(0.9, 0.17, -0.15)), 0.28, 0.05, 5, 14)
	return k.commit()


## A hatch cover torn off the deck: a grating in a heavy frame, a cask lashed to it.
static func _hatch_mesh() -> ArrayMesh:
	var k := MeshKit.new(37)
	k.paint(Color8(0x6e, 0x4a, 0x2b))
	k.box(Transform3D.IDENTITY, Vector3(2.0, 0.14, 1.5))
	k.paint(Color8(0x4a, 0x30, 0x19))
	for i in range(-3, 4):
		k.box(Transform3D(Basis.IDENTITY, Vector3(i * 0.26, 0.09, 0.0)), Vector3(0.07, 0.05, 1.36))
	for z in [-0.4, 0.0, 0.4]:
		k.box(Transform3D(Basis.IDENTITY, Vector3(0.0, 0.09, z)), Vector3(1.86, 0.05, 0.06))
	k.paint(Color8(0x8f, 0x5d, 0x34))
	k.spar(Vector3(0.15, 0.25, -0.35), Vector3(0.85, 0.25, -0.35), 0.26, 0.26, 10)
	return k.commit()


## `n` of a sunken ship's hands cling to her wreckage here.
func spawn(x: float, z: float, n: int, from: String) -> void:
	if rafts.size() >= RAFT_MAX:
		_drop(0)
	var r := Raft.new()
	r.kind = 0 if _rng.randf() < 0.6 else 1
	r.x = x
	r.z = z
	r.yaw = _rng.randf() * TAU
	r.from = from
	var order := [0, 1, 2, 3]
	order.shuffle()
	var holds: Array = HOLDS[r.kind]
	for i in mini(n, holds.size()):
		var h := Hand.new()
		h.look = CrewLook.make(true, false, false, _rng)
		h.row = _crew.take_row(h.look.slots)
		if h.row < 0:
			break
		h.pose = CrewBrain.REST.duplicate()
		h.pose.resize(CrewModel.ROW_FLOATS)
		h.pose[CrewModel.STYLE_ROW] = h.row
		h.pose[CrewModel.STYLE_HAT] = h.look.hat
		h.pose[CrewModel.STYLE_FLAGS] = h.look.flags
		h.pose[CrewModel.STYLE_PROP] = CrewModel.PROP_NONE
		h.target = CrewBrain.REST.duplicate()
		for lv in CrewModel.levels():
			h.kit.append(lv.extras(h.look.flags))
		h.hold = order[i]
		h.seed = _rng.randf() * 100.0
		h.caller = i == 0
		r.hands.append(h)
	if r.hands.is_empty():
		return
	r.crew = r.hands.size()
	rafts.append(r)


## The nearest raft of survivors a line from `s` can reach (none while one is already coming aboard).
func reachable(s: Ship) -> Raft:
	var best: Raft = null
	var bd := LINE_REACH
	for r in rafts:
		if r.saved != null:
			return null
		if r.hands.is_empty():
			continue
		var d := Vector2(r.x - s.pos.x, r.z - s.pos.z).length() - maxf(s.cls.beam * 0.5, s.cls.length * 0.25)
		if d < bd:
			bd = d
			best = r
	return best


## The nearest raft still waiting for a line, and how far: [raft, d] or [].
func nearest(x: float, z: float) -> Array:
	var out := []
	for r in rafts:
		if r.hands.is_empty() or r.saved != null:
			continue
		var d := Vector2(r.x - x, r.z - z).length()
		if out.is_empty() or d < float(out[1]):
			out = [r, d]
	return out


## A line thrown: one after another they let go and swim for `s`.
func rescue(r: Raft, s: Ship) -> void:
	r.saved = s
	for i in r.hands.size():
		var h := r.hands[i]
		h.delay = 0.3 + i * 0.7
		h.mode = Mode.SWIM
		h.t = 0.0


## Every hand in the water (for the smoke test's tally).
func count() -> int:
	var n := 0
	for r in rafts:
		n += r.hands.size()
	return n


func _drop(i: int) -> void:
	for h in rafts[i].hands:
		_crew.free_row(h.row)
		h.row = -1
	rafts.remove_at(i)


func clear() -> void:
	for i in range(rafts.size() - 1, -1, -1):
		_drop(i)
	for mm in _mm:
		mm.visible_instance_count = 0


## A frame: `focus` is where the camera looks (a raft left far behind is taken by the current).
func update(dt: float, world: World, focus: Vector3) -> void:
	var counts := [0, 0]
	var w := world.wind
	for i in range(rafts.size() - 1, -1, -1):
		var r := rafts[i]
		if dt > 0.0:
			r.age += dt
			r.x += w.dir_x * 0.3 * dt
			r.z += w.dir_z * 0.3 * dt
			var far := Vector2(r.x - focus.x, r.z - focus.z).length()
			if r.hands.is_empty() or (r.age > LIFE and far > 260.0) or far > 900.0:
				r.sink += dt * 0.3
			if r.sink > 1.5:
				_drop(i)
				continue
		# ride the swell
		var h0 := world.water_height(r.x, r.z)
		var hx := world.water_height(r.x + 1.2, r.z)
		var hz := world.water_height(r.x, r.z + 1.2)
		var n := Vector3(-(hx - h0) / 1.2, 1.0, -(hz - h0) / 1.2).normalized()
		var want := Basis(Quaternion(Vector3.UP, n)) * Basis(Vector3.UP, r.yaw)
		var first := r.age < 0.1
		r.basis = want.orthonormalized() if first else Basis(r.basis.get_rotation_quaternion().slerp(want.get_rotation_quaternion(), minf(1.0, dt * 4.0)))
		r.y += (h0 - 0.06 - r.sink - r.y) * (1.0 if first else minf(1.0, dt * 6.0))
		_mm[r.kind].set_instance_transform(counts[r.kind], Transform3D(r.basis, Vector3(r.x, r.y, r.z)))
		counts[r.kind] += 1
		if dt > 0.0:
			_hands(r, world, dt, focus)
	for k in 2:
		_mm[k].visible_instance_count = counts[k]


func _hands(r: Raft, world: World, dt: float, focus: Vector3) -> void:
	var tt := world.time
	var raft_xf := Transform3D(r.basis, Vector3(r.x, r.y, r.z))
	var near := Vector2(r.x - focus.x, r.z - focus.z).length()
	var tired := clampf((r.age - 80.0) / 60.0, 0.0, 1.0)
	for i in range(r.hands.size() - 1, -1, -1):
		var h := r.hands[i]
		var T := h.target
		CrewBrain.rest(T)
		var k := tt * (0.9 + fmod(h.seed, 0.3)) + h.seed
		if h.mode == Mode.CLING or (h.mode == Mode.SWIM and h.delay > 0.0):
			if h.mode == Mode.SWIM:
				h.delay -= dt
			var hold: Array = HOLDS[r.kind][h.hold]
			# chest against the wood, arms thrown over it, legs kicking slowly below
			var at := raft_xf * Vector3(hold[0], 0.0, hold[1])
			h.x = at.x
			h.z = at.z
			h.y = r.y + 0.02
			h.yaw = r.basis.get_euler(EULER_ORDER_YXZ).y + float(hold[2])
			var waving := h.caller and near < 90.0 and r.saved == null and tired < 0.8
			T[CrewModel.P_ARM_LX] = 1.45
			T[CrewModel.P_ARM_RX] = 1.45
			T[CrewModel.P_ARM_LZ] = 0.25
			T[CrewModel.P_ARM_RZ] = 0.25
			T[CrewModel.P_ELBOW_L] = 0.9
			T[CrewModel.P_ELBOW_R] = 0.9
			T[CrewModel.P_LEG_LX] = 0.35 + 0.3 * sin(k * 2.2)
			T[CrewModel.P_LEG_RX] = 0.35 - 0.3 * sin(k * 2.2)
			T[CrewModel.P_KNEE_L] = 0.6 + 0.3 * sin(k * 2.2 + 1.0)
			T[CrewModel.P_KNEE_R] = 0.6 - 0.3 * sin(k * 2.2 + 1.0)
			T[CrewModel.P_HEAD_X] = -0.55 + tired * 0.6
			T[CrewModel.P_HEAD_Y] = sin(k * 0.3) * 0.4
			T[CrewModel.P_BROW] = 0.6
			T[CrewModel.P_SMILE] = -0.3 - tired * 0.3
			T[CrewModel.P_HAND_L] = 0.8
			T[CrewModel.P_HAND_R] = 0.8
			T[CrewModel.P_JAW] = 0.15 + 0.1 * maxf(0.0, sin(k * 1.1))
			if waving:
				# up on the spar, both arms over his head, hollering
				var wv := sin(k * 7.0)
				T[CrewModel.P_ARM_LX] = 2.75
				T[CrewModel.P_ARM_RX] = 2.75
				T[CrewModel.P_ARM_LZ] = 0.35 + 0.35 * wv
				T[CrewModel.P_ARM_RZ] = 0.35 - 0.35 * wv
				T[CrewModel.P_ELBOW_L] = 0.25
				T[CrewModel.P_ELBOW_R] = 0.25
				T[CrewModel.P_HAND_L] = 0.0
				T[CrewModel.P_HAND_R] = 0.0
				T[CrewModel.P_HEAD_X] = -0.35
				T[CrewModel.P_JAW] = 0.55 + 0.35 * maxf(0.0, sin(k * 5.0))
				T[CrewModel.P_BROW] = 1.0
				T[CrewModel.P_SMILE] = 0.1
			elif r.saved != null:
				# a line! grins all round
				T[CrewModel.P_SMILE] = 0.7
				T[CrewModel.P_HEAD_X] = -0.4
			_pose(h, dt, 0.3 if waving else 0.62 - tired * 0.12)
			continue
		var s := r.saved
		if s == null or not is_instance_valid(s) or not s.alive:
			# the ship is gone: back to the wreckage
			h.mode = Mode.CLING
			r.saved = null
			continue
		# the side of her hull nearest them, at the waterline
		var side := s.port_dir()
		var dx := h.x - s.pos.x
		var dz := h.z - s.pos.z
		var sg := 1.0 if dx * side.x + dz * side.z >= 0.0 else -1.0
		var fx := sin(s.heading)
		var fz := cos(s.heading)
		var along := clampf(dx * fx + dz * fz, -s.cls.length * 0.25, s.cls.length * 0.2)
		var hull := s.cls.beam * 0.5 + 0.35
		var tx := s.pos.x + fx * along + side.x * sg * hull
		var tz := s.pos.z + fz * along + side.z * sg * hull
		var face := atan2(-side.x * sg, -side.z * sg)
		if h.mode == Mode.SWIM:
			# a hard crawl for the ship's side
			h.t += dt
			var ox := tx - h.x
			var oz := tz - h.z
			var d := Vector2(ox, oz).length()
			var step := minf(d, (2.4 + absf(s.speed) * 0.9) * dt)
			h.x += ox / maxf(d, 1e-3) * step
			h.z += oz / maxf(d, 1e-3) * step
			h.y = world.water_height(h.x, h.z)
			var want := atan2(ox, oz) if d > 0.6 else face
			h.yaw += MathX.angle_delta(h.yaw, want) * MathX.damp(5.0, dt)
			var st := k * 4.5
			T[CrewModel.P_ARM_LX] = 2.6 + 0.5 * sin(st)
			T[CrewModel.P_ARM_RX] = 2.6 - 0.5 * sin(st)
			T[CrewModel.P_ARM_LZ] = 0.3
			T[CrewModel.P_ARM_RZ] = 0.3
			T[CrewModel.P_LEG_LX] = 0.4 + 0.4 * sin(st * 1.4)
			T[CrewModel.P_LEG_RX] = 0.4 - 0.4 * sin(st * 1.4)
			T[CrewModel.P_HEAD_X] = -1.0
			T[CrewModel.P_JAW] = 0.3
			_pose(h, dt, 1.1)
			if d < 0.5 or h.t > 9.0:
				h.mode = Mode.CLIMB
				h.t = 0.0
			continue
		# up the tumblehome on the man-ropes, hand over hand
		h.t += dt
		var deck := s.position.y + s.cls.freeboard
		var k2 := minf(1.0, h.t / 1.6)
		var wl := world.water_height(tx, tz)
		h.x = tx
		h.z = tz
		h.y = wl - 0.9 + (deck + 0.2 - wl + 0.9) * (k2 * k2 * (3.0 - 2.0 * k2))
		h.yaw = face
		var st2 := h.t * 9.0
		T[CrewModel.P_ARM_LX] = 2.6 + 0.35 * sin(st2)
		T[CrewModel.P_ARM_RX] = 2.6 - 0.35 * sin(st2)
		T[CrewModel.P_ELBOW_L] = 0.6 + 0.4 * sin(st2)
		T[CrewModel.P_ELBOW_R] = 0.6 - 0.4 * sin(st2)
		T[CrewModel.P_LEG_LX] = 0.9 + 0.5 * sin(st2)
		T[CrewModel.P_LEG_RX] = 0.9 - 0.5 * sin(st2)
		T[CrewModel.P_KNEE_L] = 1.2
		T[CrewModel.P_KNEE_R] = 1.2
		T[CrewModel.P_HEAD_X] = -0.4
		T[CrewModel.P_HAND_L] = 1.0
		T[CrewModel.P_HAND_R] = 1.0
		_pose(h, dt, 0.0)
		if h.t > 1.7:
			_crew.free_row(h.row)
			h.row = -1
			r.hands.remove_at(i)
			aboard.emit(r, r.hands.size())


## Eases the pose and places the figure: `tilt` leans the body forward into the water.
func _pose(h: Hand, dt: float, tilt: float) -> void:
	var kk := MathX.damp(8.0, dt)
	for i in CrewModel.POSE_SIZE:
		h.pose[i] += (h.target[i] - h.pose[i]) * kk
	if h.mode == Mode.CLIMB:
		# feet at the origin, standing against her side
		h.xf = Transform3D(Basis(Vector3.UP, h.yaw), Vector3(h.x, h.y, h.z))
		return
	# the chest at the surface, the rest hanging down into the sea
	h.xf = Transform3D(Basis.from_euler(Vector3(tilt, h.yaw, 0.0)), Vector3(h.x, h.y - 0.05, h.z)) * _DOWN


## The hands in the water, queued with the crews' sailors (Crew.crowds).
func _draw(emit: Callable) -> void:
	for r in rafts:
		for h in r.hands:
			if h.row >= 0:
				emit.call(h.xf, h.pose, h.look.hat, CrewModel.PROP_NONE, h.kit)


## How many of a sunken ship's hands make it, spread over her wreckage.
static func of_class(cls: String) -> Array[int]:
	var n := (1 if randf() < 0.5 else 2) if cls == "sloop" else (2 + (1 if randf() < 0.4 else 0) if cls == "brig" else 3 + (1 if randf() < 0.5 else 0))
	# more than three take two pieces of wreckage
	return [2, n - 2] if n > 3 else [n]
