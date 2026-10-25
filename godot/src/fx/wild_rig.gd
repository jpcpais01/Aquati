class_name WildSculpt
extends RefCounted
## The island beasts' shared skeleton and modelling kit (the web game's
## src/fx/wild/rig.ts). Every animal, goat or crab or macaw, is one sculpted
## mesh whose vertices each know which joint moves them: the head and neck
## (bending through a weight that grows along the neck), the legs (swinging
## through the gait with a knee lift), the tail, the wings (folding back along
## the flanks or beating), and two spare joints for each animal's own trick (a
## jaw, an ear flick, a dewlap, a raised claw). The pose is a dozen numbers per
## animal, set on the CPU and applied in shaders/wild.gdshader, so every
## species draws in one instanced call (its shadow too).
##
## Each vertex also carries a second colouring: an individual can wear either
## (a white goat or a brown one, a scarlet macaw or a blue-and-gold, a striped
## piglet beside its sow) at no extra cost.
##
## A sculpt is built three times: in full, as the light cut a beast wears once
## it is small on screen (fewer sides round every tube, no in-between rings,
## and the tiniest pieces, eyes and the like, left off), and as the speck it
## wears when it is a few pixels tall (three or four sides to everything).
##
## The mesh's vertex data: CUSTOM0 = colour, the second colour's red;
## CUSTOM1 = the second colour's green and blue, joint, weight; CUSTOM2 = leg
## phase (or the head's draw-back), axis (or side), how much the head joint
## moves it; CUSTOM3 = the joint's pivot; UV, UV2.x = the neck's root.

## Joints: what moves a vertex.
const BODY := 0
const HEAD := 1
const LEG := 2
const TAIL := 3
const WING := 4
const SPEC_A := 5
const SPEC_B := 6

## Leg swing axes (`f` on a leg): fore-and-aft, out to the side (crabs), or round the hip (sprawling lizards).
const AX_X := 0
const AX_Z := 1
const AX_Y := 2
## Added to a leg's axis: it also folds up under the body with special A (a flamingo's one-leg stance).
const TUCK_A := 4

## Raises (or with a negative value, lowers) everything added from now on, pivots too.
var lift := 0.0
## Levels of detail.
const FULL := 0
const LIGHT := 1
const SPECK := 2

## Which cut: FULL, LIGHT (fewer sides, no in-between rings, no tiny pieces) or SPECK.
var lod := FULL
## Lighter than full: pieces no bigger than this (m) are left off (the speck
## leaves off blobs four times as big: eyes, noses; never a thin leg).
var tiny := 0.0
var _tiny_blob := 0.0
var light: bool:
	get:
		return lod != FULL

var _pos := PackedVector3Array()
var _col := PackedColorArray()
var _alt := PackedColorArray()
var _rig := PackedFloat32Array()
var _piv := PackedVector3Array()
var _hd := PackedFloat32Array()
var _idx := PackedInt32Array()
var _head := Vector3.ZERO
# the joint what comes next is tagged with
var _part := BODY
var _w: Variant = 1.0
var _z := 0.0
var _f := 0.0
var _bp := Vector3.ZERO
var _hw: Variant = 0.0


## `head`: the neck's root; the head joint turns everything about it.
func _init(head := Vector3.ZERO, p_lod := FULL, p_tiny := 0.0) -> void:
	_head = head
	lod = p_lod
	tiny = p_tiny
	_tiny_blob = p_tiny * (4.0 if lod == SPECK else 1.0)


## A ring of a tube: its centre and half-width (side to side) and half-height.
static func ring(p: Vector3, rx: float, ry := -1.0) -> Array:
	return [p, rx, rx if ry < 0.0 else ry]


## Mirrors a point to side `s` (+1 left, -1 right).
static func m(p: Vector3, s: float) -> Vector3:
	return Vector3(p.x * s, p.y, p.z)


## An sRGB hex colour, in the linear space the shader lights.
static func hex(h: int) -> Color:
	return Color.hex((h << 8) | 0xff).srgb_to_linear()


static func mul(c: Color, k: float) -> Color:
	return Color(c.r * k, c.g * k, c.b * k)


## One colour for both colourings.
static func flat(c: Color, alt := Color(-1, -1, -1)) -> Callable:
	var b := c if alt.r < 0.0 else alt
	return func(_p: Vector3, _n: Vector3, _t: float) -> Array: return [c, b]


## A weight that ramps from 0 at `a` to 1 at `b` along one axis (0 = |x|, 1 = y, 2 = z).
static func ramp(axis: int, a: float, b: float) -> Callable:
	return func(p: Vector3) -> float: return MathX.smooth(a, b, absf(p.x) if axis == 0 else (p.y if axis == 1 else p.z))


## A weight that ramps from 0 at `a` to 1 at `b`, measured along the line between them (a neck bends evenly through its thickness).
static func along(a: Vector3, b: Vector3, lo := 0.0, hi := 1.0) -> Callable:
	var d := b - a
	var l2 := d.length_squared()
	return func(p: Vector3) -> float: return MathX.smooth(lo, hi, (p - a).dot(d) / l2)


## Tags what comes next with a joint (whatever isn't given goes back to its default).
func set_bone(part := BODY, w: Variant = 1.0, z := 0.0, f := 0.0, piv := Vector3.ZERO, hw: Variant = 0.0) -> WildSculpt:
	_part = part
	_w = w
	_z = z
	_f = f
	_bp = piv
	_hw = hw
	return self


## The body (or the neck and head, as far as `hw` has them follow the head
## joint; `z`: how far the head draws back with special A, a tortoise's).
func body(hw: Variant = 0.0, z := 0.0) -> WildSculpt:
	return set_bone(BODY, 1.0, z, 0.0, Vector3.ZERO, hw)


## Any other joint: its pivot, weight, axis or side, leg phase, head weight.
func joint(part: int, piv: Vector3, w: Variant = 1.0, f := 0.0, z := 0.0, hw: Variant = 0.0) -> WildSculpt:
	return set_bone(part, w, z, f, piv, hw)


func _vert(p: Vector3, n: Vector3, paint: Callable, t: float) -> int:
	var ab: Array = paint.call(p, n, t)
	_pos.append(Vector3(p.x, p.y + lift, p.z))
	_col.append(ab[0])
	_alt.append(ab[1])
	var w: float = _w.call(p) if _w is Callable else float(_w)
	var hw: float = _hw.call(p) if _hw is Callable else float(_hw)
	_rig.append(_part)
	_rig.append(w)
	_rig.append(_z)
	_rig.append(_f)
	_piv.append(Vector3(_bp.x, _bp.y + lift, _bp.z))
	_hd.append(_head.x)
	_hd.append(_head.y + lift)
	_hd.append(_head.z)
	_hd.append(hw)
	return _pos.size() - 1


func _sides(n: int) -> int:
	if lod == SPECK:
		return 4 if n >= 9 else 3
	if lod == LIGHT:
		return maxi(3, roundi(n * 0.6)) if n >= 6 else maxi(3, n - 1)
	return n


## A ring halfway between each pair, on a Catmull-Rom curve through them (radii too).
static func _smooth_rings(r: Array) -> Array:
	var cr := func(a: float, b: float, c: float, d: float) -> float: return (-a + 9.0 * b + 9.0 * c - d) / 16.0
	var out := []
	for i in r.size() - 1:
		var a: Array = r[maxi(0, i - 1)]
		var b: Array = r[i]
		var c: Array = r[i + 1]
		var d: Array = r[mini(r.size() - 1, i + 2)]
		out.append(b)
		var pa: Vector3 = a[0]
		var pb: Vector3 = b[0]
		var pc: Vector3 = c[0]
		var pd: Vector3 = d[0]
		out.append([Vector3(cr.call(pa.x, pb.x, pc.x, pd.x), cr.call(pa.y, pb.y, pc.y, pd.y), cr.call(pa.z, pb.z, pc.z, pd.z)),
				maxf(0.0005, cr.call(a[1], b[1], c[1], d[1])), maxf(0.0005, cr.call(a[2], b[2], c[2], d[2]))])
	out.append(r[r.size() - 1])
	return out


## A tube through `rings` (each an ellipse), its frame carried along the path
## so it never twists. The ends are rounded off with a cap reaching `cap0` /
## `cap1` radii past them. Longer tubes get a ring between each pair, on a
## smooth curve through them.
func tube(rings: Array, paint: Callable, sides := 8, cap0 := 0.6, cap1 := 0.6, smooth := true) -> WildSculpt:
	if light:
		var big := 0.0
		for r: Array in rings:
			big = maxf(big, maxf(r[1], r[2]))
		if big < tiny:
			return self
	if smooth and rings.size() > 2 and not light:
		rings = _smooth_rings(rings)
	sides = _sides(sides)
	var n := rings.size()
	var pts := PackedVector3Array()
	for r: Array in rings:
		pts.append(r[0])
	var tans := PackedVector3Array()
	for i in n:
		tans.append((pts[mini(n - 1, i + 1)] - pts[maxi(0, i - 1)]).normalized())
	# a frame that starts side-on and is carried along without spinning
	var ids := []
	var u := Vector3.ZERO
	for i in n:
		var t := tans[i]
		if i == 0:
			var ref := Vector3(0, 0, 1) if absf(t.y) > 0.9 else Vector3(0, 1, 0)
			u = t.cross(ref).normalized()
			if absf(t.y) <= 0.9 and u.x < 0.0:
				u = -u
		else:
			u = (u - t * u.dot(t)).normalized()
		var w := t.cross(u).normalized()
		if absf(t.y) <= 0.9 and w.y < 0.0:
			w = -w
		var rx: float = rings[i][1]
		var ry: float = rings[i][2]
		var rr := PackedInt32Array()
		for s in sides:
			var a := float(s) / sides * TAU
			var c := cos(a)
			var sn := sin(a)
			var p := pts[i] + u * (sn * rx) + w * (c * ry)
			var nn := (u * (sn / maxf(rx, 1e-4)) + w * (c / maxf(ry, 1e-4))).normalized()
			rr.append(_vert(p, nn, paint, float(i) / (n - 1)))
		ids.append(rr)
	for i in n - 1:
		var a: PackedInt32Array = ids[i]
		var b: PackedInt32Array = ids[i + 1]
		var mid := pts[i].lerp(pts[i + 1], 0.5)
		for s in sides:
			var s2 := (s + 1) % sides
			_tri(a[s], a[s2], b[s2], mid)
			_tri(a[s], b[s2], b[s], mid)
	# rounded ends
	for e in 2:
		var i := 0 if e == 0 else n - 1
		var dir := -1.0 if e == 0 else 1.0
		var r := minf(rings[i][1], rings[i][2])
		var tip := _vert(pts[i] + tans[i] * dir * r * (cap0 if e == 0 else cap1), tans[i] * dir, paint, 0.0 if e == 0 else 1.0)
		var rr: PackedInt32Array = ids[i]
		for s in sides:
			_tri(rr[s], rr[(s + 1) % sides], tip, pts[i])
	return self


## An ellipsoid centred at `c` with half-axes r, its long axis along z.
func blob(c: Vector3, r: Vector3, paint: Callable, sides := 8, rings := 6) -> WildSculpt:
	if light:
		if maxf(r.x, maxf(r.y, r.z)) < _tiny_blob:
			return self
		rings = 3 if lod == SPECK else maxi(3, ceili(rings * 0.6))
	var out := []
	for i in rings + 1:
		var th := 0.12 + float(i) / rings * (PI - 0.24)
		var k := sin(th)
		out.append([c + Vector3(0, 0, -cos(th) * r.z), r.x * k, r.y * k])
	return tube(out, paint, sides, 0.9, 0.9, false)


## A thin double-sided plate (wing, ear, fin, webbed foot, tail fan): the
## outline is fanned from its first point, `top` painting the side the
## outline's winding faces (or the side toward `face`), `bottom` the other.
func slab(outline: Array, thick: float, top: Callable, bottom := Callable(), face := Vector3.ZERO) -> WildSculpt:
	if not bottom.is_valid():
		bottom = top
	var pts := PackedVector3Array(outline)
	if light:
		var lo := pts[0]
		var hi := pts[0]
		for p in pts:
			lo = lo.min(p)
			hi = hi.max(p)
		if (hi - lo).length() * 0.5 < tiny:
			return self
	var nrm := Vector3.ZERO
	for i in range(1, pts.size() - 1):
		nrm += (pts[i] - pts[0]).cross(pts[i + 1] - pts[0])
	nrm = nrm.normalized()
	if face != Vector3.ZERO and nrm.dot(face) < 0.0:
		nrm = -nrm
	var mid := Vector3.ZERO
	for p in pts:
		mid += p
	mid /= pts.size()
	for side: float in [1.0, -1.0]:
		var ids := PackedInt32Array()
		for i in pts.size():
			ids.append(_vert(pts[i] + nrm * side * thick * 0.5, nrm * side, top if side > 0.0 else bottom, float(i) / (pts.size() - 1)))
		var inside := mid - nrm * side
		for i in range(1, ids.size() - 1):
			_tri(ids[0], ids[i], ids[i + 1], inside)
	return self


## A leg: hip, then joints down to the foot.
func leg(rings: Array, phase: float, paint: Callable, axis := AX_X, sides := 6) -> WildSculpt:
	set_bone(LEG, 1.0, phase, axis, rings[0][0])
	return tube(rings, paint, sides, 0.3, 0.45)


## A triangle wound to face away from `inside` (clockwise, as Godot draws a front face).
func _tri(a: int, b: int, c: int, inside: Vector3) -> void:
	var pa := _pos[a]
	var nn := (_pos[b] - pa).cross(_pos[c] - pa)
	var d := (pa + _pos[b] + _pos[c]) / 3.0 - inside
	# (lift moved every point alike, so the test holds on the lifted points)
	if nn.dot(d) < 0.0:
		_idx.append(a)
		_idx.append(b)
		_idx.append(c)
	else:
		_idx.append(a)
		_idx.append(c)
		_idx.append(b)


func triangles() -> int:
	return _idx.size() / 3


## The sculpt as a mesh, its normals smoothed over shared vertices.
func mesh() -> ArrayMesh:
	var n := _pos.size()
	var nrm := PackedVector3Array()
	nrm.resize(n)
	for i in range(0, _idx.size(), 3):
		var a := _idx[i]
		var b := _idx[i + 1]
		var c := _idx[i + 2]
		# (clockwise: the face's outward normal is (c - a) x (b - a))
		var f := (_pos[c] - _pos[a]).cross(_pos[b] - _pos[a])
		nrm[a] += f
		nrm[b] += f
		nrm[c] += f
	var c0 := PackedFloat32Array()
	var c1 := PackedFloat32Array()
	var c2 := PackedFloat32Array()
	var c3 := PackedFloat32Array()
	var uv := PackedVector2Array()
	var uv2 := PackedVector2Array()
	c0.resize(n * 4)
	c1.resize(n * 4)
	c2.resize(n * 4)
	c3.resize(n * 4)
	uv.resize(n)
	uv2.resize(n)
	for i in n:
		nrm[i] = nrm[i].normalized() if nrm[i].length_squared() > 1e-20 else Vector3.UP
		var col := _col[i]
		var alt := _alt[i]
		c0[i * 4] = col.r
		c0[i * 4 + 1] = col.g
		c0[i * 4 + 2] = col.b
		c0[i * 4 + 3] = alt.r
		c1[i * 4] = alt.g
		c1[i * 4 + 1] = alt.b
		c1[i * 4 + 2] = _rig[i * 4]
		c1[i * 4 + 3] = _rig[i * 4 + 1]
		c2[i * 4] = _rig[i * 4 + 2]
		c2[i * 4 + 1] = _rig[i * 4 + 3]
		c2[i * 4 + 2] = _hd[i * 4 + 3]
		var p := _piv[i]
		c3[i * 4] = p.x
		c3[i * 4 + 1] = p.y
		c3[i * 4 + 2] = p.z
		uv[i] = Vector2(_hd[i * 4], _hd[i * 4 + 1])
		uv2[i] = Vector2(_hd[i * 4 + 2], 0.0)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = _pos
	arrays[Mesh.ARRAY_NORMAL] = nrm
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_TEX_UV2] = uv2
	arrays[Mesh.ARRAY_CUSTOM0] = c0
	arrays[Mesh.ARRAY_CUSTOM1] = c1
	arrays[Mesh.ARRAY_CUSTOM2] = c2
	arrays[Mesh.ARRAY_CUSTOM3] = c3
	arrays[Mesh.ARRAY_INDEX] = _idx
	var flags := 0
	for k: int in [Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT, Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT, Mesh.ARRAY_FORMAT_CUSTOM2_SHIFT, Mesh.ARRAY_FORMAT_CUSTOM3_SHIFT]:
		flags |= Mesh.ARRAY_CUSTOM_RGBA_FLOAT << k
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, flags)
	return mesh
