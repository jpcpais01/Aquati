class_name Spirits
extends Node3D
## The souls of fallen pirates (the web game's fx/spirits.ts). When a
## cutthroat goes under with his ship, or falls on the sand, a fort's parade
## or a boarded deck, a little green ghost slips out of him: the same sailor
## in spirit (his own hat, his build), a round toy-like wisp with a curling
## tail and two hollow eyes. He pops up, bobs, looks up at you and does one
## last thing (waves, tips his hat, twirls, or shouts "boo!"), then floats
## off into the sky and is gone in a puff of motes.
##
## Cheap by construction: one MultiMesh with one material. Each ghost is a
## single instance written once when he is born; the whole performance after
## that (rise, gestures, sway, fade) plays out in shaders/spirit.gdshader from
## his birth time. The CPU only trails a few motes behind the living ones.

## Told when a ghost first shows, to give him a voice.
signal rose(at: Vector3)

## How far apart (m) ghosts rising together keep.
const SPACING := 2.1
## Seconds from the first glimmer to the last mote.
const LIFE := 4.8
## What a ghost does once he has his bearings.
const WAVE := 0
const TWIRL := 1
const TIP := 2
const BOO := 3
## The figure's parts (UV.x): the body, the hats by CrewModel.HAT_*, the arms.
const PART_BODY := 0
const PART_ARM_L := 10
const PART_ARM_R := 11


class Soul:
	var slot := 0
	var x := 0.0
	var y := 0.0
	var z := 0.0
	var t0 := 0.0
	var size := 1.0
	var mote_t := 0.0
	var sounded := false
	var poofed := false


## Ghosts that have gone up since the last clear.
var raised := 0
var _cap := 0
var _mm: MultiMesh
var _mat: ShaderMaterial
var _fx: Particles
var _live: Array[Soul] = []
var _free: Array[int] = []
var _used := 0
var _last_gesture := -1
var _now := 0.0


## `cap` ghosts in the air at once at most; `fx` trails their motes.
func setup(cap: int, fx: Particles) -> void:
	_cap = cap
	_fx = fx
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/spirit.gdshader")
	_mat.set_shader_parameter("life", LIFE)
	_mat.render_priority = 2
	_mm = MultiMesh.new()
	_mm.transform_format = MultiMesh.TRANSFORM_3D
	_mm.use_colors = true
	_mm.use_custom_data = true
	_mm.mesh = figure()
	_mm.instance_count = cap
	_mm.visible_instance_count = 0
	_mm.custom_aabb = AABB(Vector3(-1e5, -100.0, -1e5), Vector3(2e5, 400.0, 2e5))
	var mi := MultiMeshInstance3D.new()
	mi.name = "Ghosts"
	mi.multimesh = _mm
	mi.material_override = _mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	add_child(mi)
	for i in range(cap - 1, -1, -1):
		_free.append(i)
		_mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, Vector3(0.0, -1000.0, 0.0)))
		_mm.set_instance_custom_data(i, Color(-1e4, 1.0, 0.0, 0.0))
	visible = false


## How many are in the air right now.
func count() -> int:
	return _live.size()


## A ghost leaves a body: `f` {x, y, z, hat (CrewModel.HAT_*), girth,
## height, boss (bigger for a captain), delay (s before he rises)}, `now` on
## the world's clock. False when the sky is already full of them.
func release(f: Dictionary, now: float) -> bool:
	if _free.is_empty():
		return false
	var slot: int = _free.pop_back()
	var t0 := now + float(f.get("delay", 0.0))
	var hat := int(f.get("hat", 0))
	# never the same trick twice running, and only a hat-wearer tips his hat
	var gest := randi() % 4
	if gest == TIP and hat == CrewModel.HAT_NONE:
		gest = WAVE
	if gest == _last_gesture:
		gest = (gest + 1 + randi() % 2) % 4
	if gest == TIP and hat == CrewModel.HAT_NONE:
		gest = TWIRL
	_last_gesture = gest
	var size := float(f.get("height", 1.0)) * (1.12 if f.get("boss", false) else 1.0) * (0.94 + randf() * 0.12)
	# shipmates who drowned together each find a patch of sky of their own
	var x := float(f.x) + (randf() - 0.5) * 0.8
	var z := float(f.z) + (randf() - 0.5) * 0.8
	for pass_i in 3:
		for o in _live:
			if absf(o.t0 - t0) > 2.2:
				continue
			var dx := x - o.x
			var dz := z - o.z
			var d := Vector2(dx, dz).length()
			if d >= SPACING:
				continue
			var a := atan2(dz, dx) if d > 1e-3 else randf() * TAU
			x = o.x + cos(a) * SPACING
			z = o.z + sin(a) * SPACING
	_mm.set_instance_transform(slot, Transform3D(Basis.IDENTITY, Vector3(x, float(f.y), z)))
	_mm.set_instance_color(slot, Color(randf(), gest, size, hat))
	_mm.set_instance_custom_data(slot, Color(t0, float(f.get("girth", 1.0)), 0.0, 0.0))
	_used = maxi(_used, slot + 1)
	_mm.visible_instance_count = _used
	visible = true
	var s := Soul.new()
	s.slot = slot
	s.x = x
	s.y = float(f.y)
	s.z = z
	s.t0 = t0
	s.size = size
	_live.append(s)
	raised += 1
	return true


## Mirrors the shader's easeOutBack so the motes keep to the body.
static func _pop(age: float) -> float:
	var k := clampf(age / 0.75, 0.0, 1.0) - 1.0
	return 1.0 + 2.70158 * k * k * k + 1.70158 * k * k


## Height of a ghost's middle above where he was born, at `age` (the shader's rise, without the bob).
static func _rise(age: float) -> float:
	var asc := maxf(age - 2.75, 0.0)
	return -1.2 + 2.55 * _pop(age) + asc * asc * 0.55 + asc * 0.9


## Motes, voices and the last puff; frees each ghost once he's gone. `now` on the world's clock.
func update(dt: float, now: float) -> void:
	_now = now
	if _mat != null:
		_mat.set_shader_parameter("now", now)
	var P := _fx
	for i in range(_live.size() - 1, -1, -1):
		var s := _live[i]
		var age := now - s.t0
		if age < 0.0:
			continue
		if age > LIFE:
			_free.append(s.slot)
			_mm.set_instance_custom_data(s.slot, Color(-1e4, 1.0, 0.0, 0.0))
			_live.remove_at(i)
			continue
		var mid := s.y + _rise(age)
		if not s.sounded:
			s.sounded = true
			rose.emit(Vector3(s.x, s.y + 0.4, s.z))
			# a ring of green motes and a breath of pale mist as he comes free
			for k in 10:
				var th := k * TAU / 10.0 + randf() * 0.4
				var sp := 1.2 + randf() * 1.2
				P.emit(Vector3(s.x, s.y + 0.3, s.z), Vector3(cos(th) * sp, 0.8 + randf() * 1.4, sin(th) * sp),
						0.7 + randf() * 0.5, 0.2 + randf() * 0.12, 0.05, Color(0.7, 3.4, 2.0, 1.0), Color(0.15, 1.1, 0.6), -0.6, 2.2, Particles.SOFT, 0.05, Vector2.ZERO, 0.0, true)
			for k in 3:
				P.emit(Vector3(s.x + (randf() - 0.5) * 0.8, s.y + 0.3 + randf() * 0.6, s.z + (randf() - 0.5) * 0.8), Vector3((randf() - 0.5) * 0.6, 0.5 + randf() * 0.5, (randf() - 0.5) * 0.6),
						1.8 + randf() * 0.8, 0.9, 2.6, Color(0.62, 0.86, 0.78, 0.26), Color(0.8, 0.92, 0.88), -0.2, 0.8, Particles.SMOKE, 0.2)
		# a thin trail of motes off his tail
		s.mote_t -= dt
		if s.mote_t <= 0.0 and age < LIFE - 0.6:
			s.mote_t = 0.07 + randf() * 0.06
			P.emit(Vector3(s.x + (randf() - 0.5) * 0.35, mid - 0.85 * s.size + (randf() - 0.5) * 0.3, s.z + (randf() - 0.5) * 0.35),
					Vector3((randf() - 0.5) * 0.4, 0.2 + randf() * 0.5, (randf() - 0.5) * 0.4),
					0.8 + randf() * 0.6, 0.12 + randf() * 0.1, 0.02, Color(0.55, 2.7, 1.6, 1.0), Color(0.1, 0.8, 0.45), -0.25, 1.4, Particles.SOFT, 0.08, Vector2.ZERO, 0.0, true)
		# ...and as the last of him thins away, a soft pop of sparkles
		if not s.poofed and age > LIFE - 0.75:
			s.poofed = true
			for k in 12:
				var th := randf() * TAU
				var up := randf() * 2.0 - 0.4
				var sp := 1.4 + randf() * 1.6
				P.emit(Vector3(s.x, mid + 0.4 * s.size, s.z), Vector3(cos(th) * sp, up * sp * 0.6, sin(th) * sp),
						0.5 + randf() * 0.45, 0.16 + randf() * 0.1, 0.03, Color(1.4, 3.6, 2.6, 1.0), Color(0.2, 1.2, 0.7), 0.4, 2.6, Particles.SOFT, 0.02, Vector2.ZERO, 0.0, true)
	if _live.is_empty():
		_used = 0
		_mm.visible_instance_count = 0
	visible = not _live.is_empty()


func clear() -> void:
	for s in _live:
		_free.append(s.slot)
		_mm.set_instance_custom_data(s.slot, Color(-1e4, 1.0, 0.0, 0.0))
	_live.clear()
	_used = 0
	if _mm != null:
		_mm.visible_instance_count = 0
	visible = false


# ------------------------------------------------------------------ the figure

class _Kit:
	var pos := PackedVector3Array()
	var nrm := PackedVector3Array()
	var part := PackedFloat32Array()
	var idx := PackedInt32Array()
	var tag := 0

	func vert(p: Vector3, n: Vector3) -> int:
		pos.append(p)
		nrm.append(n.normalized())
		part.append(tag)
		return pos.size() - 1

	## A triangle, wound to face the way its vertices' normals point (Godot's front faces turn clockwise).
	func tri(a: int, b: int, c: int) -> void:
		var f := (pos[c] - pos[a]).cross(pos[b] - pos[a])
		if f.dot(nrm[a] + nrm[b] + nrm[c]) >= 0.0:
			idx.append_array([a, b, c])
		else:
			idx.append_array([a, c, b])

	## A (cols x rows) grid of vertices from v0 on, rows of `cols` each, wrapped round when `wrap`.
	func grid(v0: int, cols: int, rows: int) -> void:
		for r in rows - 1:
			for c in cols - 1:
				var a := v0 + r * cols + c
				tri(a, a + 1, a + cols)
				tri(a + 1, a + cols + 1, a + cols)

	## Moves the vertices from v0 on by `t` (normals with it, scaled or not).
	func xform(v0: int, t: Transform3D) -> void:
		var nb := t.basis.inverse().transposed()
		for i in range(v0, pos.size()):
			pos[i] = t * pos[i]
			nrm[i] = (nb * nrm[i]).normalized()

	## A lathe round y through profile points (r, y), its normals from the profile's slope.
	func lathe(pts: PackedVector2Array, radial: int) -> int:
		var v0 := pos.size()
		var n := pts.size()
		for i in radial + 1:
			# the seam goes round the back, away from the face
			var phi := float(i) / radial * TAU + PI
			for j in n:
				var p := pts[j]
				var a := pts[maxi(j - 1, 0)]
				var b := pts[mini(j + 1, n - 1)]
				var d := b - a
				var nr := Vector2(d.y, -d.x).normalized() if d.length_squared() > 1e-12 else Vector2(0.0, signf(p.y))
				vert(Vector3(maxf(0.0, p.x) * sin(phi), p.y, maxf(0.0, p.x) * cos(phi)), Vector3(nr.x * sin(phi), nr.y, nr.x * cos(phi)))
		for i in radial:
			for j in n - 1:
				var a := v0 + i * n + j
				tri(a, a + n, a + 1)
				tri(a + n, a + n + 1, a + 1)
		return v0

	## A sphere (or a cap of one, down to `theta_len` from the pole) of radius r, centred on the origin.
	func sphere(r: float, w: int, h: int, theta_len := PI) -> int:
		var pts := PackedVector2Array()
		for j in h + 1:
			var t := theta_len - float(j) / h * theta_len
			pts.append(Vector2(r * sin(t), r * cos(t)))
		return lathe(pts, w)

	## A capsule along y: radius r, the straight part `len` long.
	func capsule(r: float, length: float, cap_seg: int, radial: int) -> int:
		var pts := PackedVector2Array()
		for j in cap_seg + 1:
			var t := PI - float(j) / cap_seg * PI * 0.5
			pts.append(Vector2(r * sin(t), -length * 0.5 + r * cos(t)))
		for j in cap_seg + 1:
			var t := PI * 0.5 - float(j) / cap_seg * PI * 0.5
			pts.append(Vector2(r * sin(t), length * 0.5 + r * cos(t)))
		return lathe(pts, radial)

	## A torus lying in the xz plane: ring radius big, tube radius small.
	func torus(big: float, small: float, radial: int, tubular: int) -> int:
		var v0 := pos.size()
		for i in tubular + 1:
			var u := float(i) / tubular * TAU
			for j in radial + 1:
				var v := float(j) / radial * TAU
				var c := Vector3(cos(u), 0.0, sin(u))
				var n := c * cos(v) + Vector3.UP * sin(v)
				vert(c * big + n * small, n)
		grid(v0, radial + 1, tubular + 1)
		return v0

	func commit() -> ArrayMesh:
		var uv := PackedVector2Array()
		uv.resize(pos.size())
		for i in pos.size():
			uv[i] = Vector2(part[i], 0.0)
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = pos
		arrays[Mesh.ARRAY_NORMAL] = nrm
		arrays[Mesh.ARRAY_TEX_UV] = uv
		arrays[Mesh.ARRAY_INDEX] = idx
		var m := ArrayMesh.new()
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		return m


## A smooth Catmull-Rom curve through the control points (r, y), `steps` segments long.
static func _spline(pts: Array, steps: int) -> PackedVector2Array:
	var out := PackedVector2Array()
	var n := pts.size()
	for s in steps + 1:
		var t := float(s) / steps * (n - 1)
		var i := mini(int(t), n - 2)
		var w := t - i
		var p0: Vector2 = pts[maxi(i - 1, 0)]
		var p1: Vector2 = pts[i]
		var p2: Vector2 = pts[i + 1]
		var p3: Vector2 = pts[mini(i + 2, n - 1)]
		var w2 := w * w
		var w3 := w2 * w
		out.append(0.5 * ((2.0 * p1) + (-p0 + p2) * w + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * w2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * w3))
	return out


static func _pts(a: Array) -> Array:
	var out := []
	for p: Array in a:
		out.append(Vector2(p[0], p[1]))
	return out


## The ghost: head and body in one round pour, mitten-handed arms, and every
## hat a sailor can wear (the shader folds away all but his own).
static func figure() -> ArrayMesh:
	var k := _Kit.new()
	# head and body in one round pour: a dome of a head, a soft pinch of a neck,
	# shoulders, then a long taper into a tail that the shader curls
	k.tag = PART_BODY
	k.lathe(_spline(_pts([
		[0.0, -0.2], [0.05, -0.1], [0.1, 0.08], [0.16, 0.3], [0.22, 0.54], [0.28, 0.78], [0.32, 0.98], [0.335, 1.12],
		[0.3, 1.24], [0.235, 1.33], [0.215, 1.39], [0.26, 1.46], [0.305, 1.56], [0.318, 1.67], [0.3, 1.79], [0.245, 1.89],
		[0.15, 1.96], [0.0, 1.99],
	]), 30), 20)
	# arms: little mitten-handed tubes hanging from the shoulders (posed in the shader)
	for side: float in [-1.0, 1.0]:
		k.tag = PART_ARM_L if side < 0.0 else PART_ARM_R
		var v0 := k.capsule(0.072, 0.3, 3, 8)
		k.xform(v0, Transform3D(Basis.IDENTITY, Vector3(side * 0.29, 1.17 - 0.2, 0.0)))
		var v1 := k.sphere(0.098, 10, 7)
		k.xform(v1, Transform3D(Basis.IDENTITY, Vector3(side * 0.29, 1.17 - 0.42, 0.01)))
	# tricorn: a low crown and a rolled brim turned up into three corners, one to the front
	k.tag = CrewModel.HAT_TRICORN
	var cr := k.sphere(0.235, 14, 6, PI * 0.5)
	k.xform(cr, Transform3D(Basis.from_scale(Vector3(1.0, 0.62, 1.0)), Vector3(0.0, 1.84, 0.0)))
	var br := k.torus(0.285, 0.062, 7, 36)
	k.xform(br, Transform3D(Basis.from_scale(Vector3(1.0, 0.55, 1.0)), Vector3.ZERO))
	for i in range(br, k.pos.size()):
		var p := k.pos[i]
		var c := cos(3.0 * atan2(p.x, p.z))
		var r := 1.0 + 0.13 * c
		k.pos[i] = Vector3(p.x * r, p.y + 0.06 + 0.04 * c + 1.82, p.z * r)
	# bandana: a snug skullcap with a knot at the back and two tails that flutter
	k.tag = CrewModel.HAT_BANDANA
	var cap := k.sphere(0.333, 16, 7, PI * 0.44)
	k.xform(cap, Transform3D(Basis.IDENTITY, Vector3(0.0, 1.645, 0.0)))
	var kn := k.sphere(0.075, 8, 6)
	k.xform(kn, Transform3D(Basis.from_scale(Vector3(1.3, 1.0, 0.8)), Vector3(0.0, 1.76, -0.3)))
	for s: float in [-1.0, 1.0]:
		var t := k.capsule(0.035, 0.2, 2, 6)
		k.xform(t, Transform3D(Basis.from_scale(Vector3(1.6, 1.0, 0.6)), Vector3(0.0, -0.13, 0.0)))
		k.xform(t, Transform3D(Basis(Vector3.RIGHT, -0.35) * Basis(Vector3.BACK, s * 0.35), Vector3.ZERO))
		k.xform(t, Transform3D(Basis.IDENTITY, Vector3(s * 0.04, 1.73, -0.33)))
	# knit cap: a turned-up cuff and a floppy stocking (flopped in the shader) with a bobble
	k.tag = CrewModel.HAT_KNIT
	k.lathe(_spline(_pts([[0.0, 1.66], [0.3, 1.72], [0.318, 1.82], [0.26, 1.96], [0.15, 2.1], [0.05, 2.2], [0.0, 2.22]]), 14), 16)
	var cuff := k.torus(0.31, 0.05, 6, 24)
	k.xform(cuff, Transform3D(Basis.IDENTITY, Vector3(0.0, 1.74, 0.0)))
	var bob := k.sphere(0.075, 9, 6)
	k.xform(bob, Transform3D(Basis.IDENTITY, Vector3(0.0, 2.25, 0.0)))
	# straw hat: a wide, flat brim and a round-topped crown in one lathe
	k.tag = CrewModel.HAT_STRAW
	k.lathe(_spline(_pts([[0.0, 1.78], [0.3, 1.77], [0.46, 1.755], [0.49, 1.772], [0.45, 1.795], [0.24, 1.83], [0.215, 1.92], [0.19, 1.99], [0.1, 2.01], [0.0, 2.015]]), 26), 24)
	return k.commit()
