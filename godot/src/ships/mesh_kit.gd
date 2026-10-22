class_name MeshKit
extends RefCounted
## Builds one vertex-painted mesh out of many small procedural parts: spars,
## turned profiles, tori, rounded boxes, swept tubes. Every vertex carries its
## part's paint (sRGB) and, in alpha, what the part is made of and the spar it
## stands on (see code()), so a whole ship's woodwork, ironwork, gilding and
## lamps share one draw call and one shader (ship_parts.gdshader), and a mast
## shot away can be dropped from it whole.
##
## Primitives take points in counter-clockwise order seen from outside (the
## right-hand normal points out) and flip them to Godot's clockwise front
## faces as they go in.

const WOOD := 0.0
const ROPE := 0.25
const IRON := 0.5
const GLOW := 0.75
const GILT := 1.0
## Timber a breach never opens through (the hold's floor): see ship_damage.gdshaderinc.
const HOLD := 1.25

var verts := PackedVector3Array()
var normals := PackedVector3Array()
var colors := PackedColorArray()
var indices := PackedInt32Array()

var _paint := Color(1, 1, 1, 0)
var _kind := WOOD
var _spar := 0
## Runs of geometry laid down on a spar: [spar, first vertex, end vertex, first index, end index]...
var _runs := PackedInt32Array()
var _run_v := 0
var _run_i := 0
var _rng := RandomNumberGenerator.new()


func _init(seed_value: int = 7) -> void:
	_rng.seed = seed_value


## Paint for the parts that follow: an sRGB colour and a material kind,
## nudged a touch lighter or darker so no two timbers match exactly.
func paint(color: Color, kind: float = WOOD, jitter: float = 0.05) -> void:
	var k := pow(1.0 + _rng.randf_range(-1.0, 1.0) * jitter, 0.4545)
	_kind = kind
	_paint = Color(minf(color.r * k, 1.0), minf(color.g * k, 1.0), minf(color.b * k, 1.0), code(kind, _spar))


## A vertex colour's alpha: the part's kind (in quarters) and the spar it
## stands on (0 the hull, 1 .. 15 a mast or the bowsprit, see ShipModel.Spar),
## as one byte. The half step survives the byte's truncation.
static func code(kind: float, spar: int = 0) -> float:
	return (roundi(kind * 4.0) * 16 + spar + 0.5) / 255.0


static func kind_of(alpha: float) -> float:
	return float(int(alpha * 255.0) >> 4) * 0.25


## What follows stands on spar s (0 the hull): it goes overboard with it.
func set_spar(s: int) -> void:
	if s == _spar:
		return
	_end_run()
	_spar = s
	_run_v = verts.size()
	_run_i = indices.size()
	_paint.a = code(_kind, s)


func _end_run() -> void:
	if _spar != 0 and indices.size() > _run_i:
		_runs.append_array([_spar, _run_v, verts.size(), _run_i, indices.size()])


## Copies everything laid down on spar s into `into`, as standing on the hull
## there (the piece that falls when it breaks).
func copy_spar(s: int, into: MeshKit) -> void:
	_end_run()
	_run_v = verts.size()
	_run_i = indices.size()
	for r in range(0, _runs.size(), 5):
		if _runs[r] != s:
			continue
		var v0 := _runs[r + 1]
		var v1 := _runs[r + 2]
		var shift := into.verts.size() - v0
		into.verts.append_array(verts.slice(v0, v1))
		into.normals.append_array(normals.slice(v0, v1))
		for i in range(v0, v1):
			var c := colors[i]
			c.a = code(kind_of(c.a), 0)
			into.colors.append(c)
		for i in range(_runs[r + 3], _runs[r + 4]):
			into.indices.append(indices[i] + shift)


func vertex_count() -> int:
	return verts.size()


func is_empty() -> bool:
	return indices.is_empty()


## Raw access for custom shapes: returns the new vertex's index.
func add_vertex(p: Vector3, n: Vector3) -> int:
	verts.append(p)
	normals.append(n)
	colors.append(_paint)
	return verts.size() - 1


func tri(a: int, b: int, c: int) -> void:
	indices.append(a)
	indices.append(c)
	indices.append(b)


## Quad a-b-c-d counter-clockwise from outside.
func quad(a: int, b: int, c: int, d: int) -> void:
	tri(a, b, c)
	tri(a, c, d)


## A (rows x cols) grid of vertices laid out row-major from `base`, stitched
## so that walking +col then +row runs counter-clockwise from outside.
func grid(base: int, rows: int, cols: int, flip: bool = false) -> void:
	for r in rows - 1:
		for k in cols - 1:
			var a := base + r * cols + k
			var b := a + 1
			var c := a + cols + 1
			var d := a + cols
			if flip:
				quad(a, d, c, b)
			else:
				quad(a, b, c, d)


## Smooth normals for the vertices from v0 on, from the triangles from index
## i0 on: for shapes laid down vertex by vertex.
func recompute_normals(v0: int, i0: int) -> void:
	for v in range(v0, verts.size()):
		normals[v] = Vector3.ZERO
	for k in range(i0, indices.size(), 3):
		var a := indices[k]
		var b := indices[k + 1]
		var c := indices[k + 2]
		# triangles are stored clockwise, so this cross points out
		var n := (verts[c] - verts[a]).cross(verts[b] - verts[a])
		for v: int in [a, b, c]:
			if v >= v0:
				normals[v] += n
	for v in range(v0, verts.size()):
		normals[v] = normals[v].normalized()


## Appends another kit's geometry.
func merge(o: MeshKit) -> void:
	var base := verts.size()
	verts.append_array(o.verts)
	normals.append_array(o.normals)
	colors.append_array(o.colors)
	for i in o.indices:
		indices.append(base + i)


## Raw arrays (already in Godot winding), painted with the current paint
## unless colours are given.
func add_arrays(p: PackedVector3Array, n: PackedVector3Array, idx: PackedInt32Array, cols: PackedColorArray = PackedColorArray(), xf: Transform3D = Transform3D.IDENTITY) -> void:
	var base := verts.size()
	var nb := xf.basis.inverse().transposed()
	verts.append_array(xf * p)
	for v in n:
		normals.append((nb * v).normalized())
	if cols.is_empty():
		for i in p.size():
			colors.append(_paint)
	else:
		colors.append_array(cols)
	for i in idx:
		indices.append(base + i)


# ------------------------------------------------------------------ primitives

## A tapered cylinder from a (radius r0) to b (radius r1), capped.
func spar(a: Vector3, b: Vector3, r0: float, r1: float, radial: int = 8, caps: bool = true) -> void:
	var axis := b - a
	var length := axis.length()
	if length < 1e-5:
		return
	var y := axis / length
	var x := (Vector3.RIGHT if absf(y.x) < 0.9 else Vector3.FORWARD).cross(y).normalized()
	var z := y.cross(x)
	var slope := (r0 - r1) / length
	var base := verts.size()
	for i in radial + 1:
		# the seam column repeats the first exactly, so the LOD welder joins it
		var ang := TAU * (i % radial) / radial
		var d := x * cos(ang) + z * sin(ang)
		var n := (d + y * slope).normalized()
		add_vertex(a + d * r0, n)
		add_vertex(b + d * r1, n)
	for i in radial:
		var v0 := base + i * 2
		quad(v0, v0 + 2, v0 + 3, v0 + 1)
	if caps:
		_disc(a, -y, x, z, r0, radial)
		_disc(b, y, x, z, r1, radial)


func _disc(c: Vector3, n: Vector3, x: Vector3, z: Vector3, r: float, radial: int) -> void:
	if r < 0.004:
		return
	var centre := add_vertex(c, n)
	var ring := verts.size()
	for i in radial:
		var ang := TAU * i / radial
		add_vertex(c + (x * cos(ang) + z * sin(ang)) * r, n)
	for i in radial:
		var p := ring + i
		var q := ring + (i + 1) % radial
		# going round from x to z winds counter-clockwise about x * z
		if n.dot(x.cross(z)) > 0.0:
			tri(centre, p, q)
		else:
			tri(centre, q, p)


## A flat disc of radius r facing +Z of the frame.
func disc(xf: Transform3D, r: float, radial: int = 10) -> void:
	var b := xf.basis
	_disc(xf.origin, b.z.normalized(), b.x, b.y, r, radial)


## Sphere (or, through xf, an ellipsoid). Partial spheres follow three.js'
## SphereGeometry: phi runs round the Y axis, theta down from the top.
func sphere(xf: Transform3D, r: float, w: int = 8, h: int = 6, phi0: float = 0.0, phi_len: float = TAU, theta0: float = 0.0, theta_len: float = PI) -> void:
	var nb := xf.basis.inverse().transposed()
	var base := verts.size()
	var full := phi_len >= TAU - 1e-6
	for j in h + 1:
		var th := theta0 + theta_len * j / h
		var st := sin(th)
		var ct := cos(th)
		# exact poles and seam, so coincident vertices weld for the LODs
		if absf(st) < 1e-6:
			st = 0.0
			ct = signf(ct)
		for i in w + 1:
			var ph := phi0 + phi_len * (i % w if full else i) / w
			var d := Vector3(-cos(ph) * st, ct, sin(ph) * st)
			add_vertex(xf * (d * r), (nb * d).normalized())
	# rows run top to bottom, columns round: that walk is clockwise from outside
	grid(base, h + 1, w + 1, true)


func ball(center: Vector3, r: float, w: int = 8, h: int = 6) -> void:
	sphere(Transform3D(Basis.IDENTITY, center), r, w, h)


## A ring of tube radius r round a circle of radius big_r in the frame's XY
## plane (three.js TorusGeometry); arc < TAU leaves it open.
func torus(xf: Transform3D, big_r: float, r: float, radial: int = 4, tubular: int = 12, arc: float = TAU) -> void:
	var nb := xf.basis.inverse().transposed()
	var base := verts.size()
	var full := arc >= TAU - 1e-6
	for j in radial + 1:
		var v := TAU * (j % radial) / radial
		for i in tubular + 1:
			var u := arc * (i % tubular if full else i) / tubular
			var cu := cos(u)
			var su := sin(u)
			var p := Vector3((big_r + r * cos(v)) * cu, (big_r + r * cos(v)) * su, r * sin(v))
			var n := Vector3(cos(v) * cu, cos(v) * su, sin(v))
			add_vertex(xf * p, (nb * n).normalized())
	grid(base, radial + 1, tubular + 1)


## A horizontal ring (round the Y axis) at `center`.
func hoop(center: Vector3, big_r: float, r: float, radial: int = 4, tubular: int = 12) -> void:
	torus(Transform3D(Basis(Vector3.RIGHT, PI * 0.5), center), big_r, r, radial, tubular)


## A turned profile of (radius, y) pairs from bottom to top, spun round Y.
func lathe(xf: Transform3D, profile: PackedVector2Array, segs: int = 10) -> void:
	var nb := xf.basis.inverse().transposed()
	var m := profile.size()
	# profile normals: averaged from the segments either side of each point
	var pn := PackedVector2Array()
	pn.resize(m)
	for k in m:
		var d := Vector2.ZERO
		if k > 0:
			var s := profile[k] - profile[k - 1]
			d += Vector2(s.y, -s.x).normalized()
		if k < m - 1:
			var s := profile[k + 1] - profile[k]
			d += Vector2(s.y, -s.x).normalized()
		pn[k] = d.normalized() if d.length() > 1e-6 else Vector2(0, 1)
	var base := verts.size()
	for i in segs + 1:
		var ph := TAU * (i % segs) / segs
		var sp := sin(ph)
		var cp := cos(ph)
		for k in m:
			var p := profile[k]
			var n := pn[k]
			add_vertex(xf * Vector3(p.x * sp, p.y, p.x * cp), (nb * Vector3(n.x * sp, n.y, n.x * cp)).normalized())
	grid(base, segs + 1, m, true)


## A softly rounded box (three.js RoundedBoxGeometry): `segs` facets round each edge.
func rbox(xf: Transform3D, size: Vector3, radius: float = -1.0, segs: int = 2) -> void:
	var half := size * 0.5
	var r := minf(radius if radius >= 0.0 else minf(size.x, minf(size.y, size.z)) * 0.28, minf(half.x, minf(half.y, half.z)) - 1e-3)
	r = maxf(r, 0.0)
	var inner := half - Vector3(r, r, r)
	var nb := xf.basis.inverse().transposed()
	# grid coordinates along one axis: the flat middle plus `segs` steps round each edge
	var stops := func(h: float, i_h: float) -> PackedFloat32Array:
		var out := PackedFloat32Array()
		for k in segs + 1:
			out.append(-h + (h - i_h) * float(k) / segs)
		for k in segs + 1:
			out.append(i_h + (h - i_h) * float(k) / segs)
		return out
	var sx: PackedFloat32Array = stops.call(half.x, inner.x)
	var sy: PackedFloat32Array = stops.call(half.y, inner.y)
	var sz: PackedFloat32Array = stops.call(half.z, inner.z)
	# each face: (normal axis, sign, u axis, v axis), u x v = outward normal
	var faces := [[0, 1.0, 1, 2], [0, -1.0, 2, 1], [1, 1.0, 2, 0], [1, -1.0, 0, 2], [2, 1.0, 0, 1], [2, -1.0, 1, 0]]
	var axes := [sx, sy, sz]
	for f: Array in faces:
		var na: int = f[0]
		var sgn: float = f[1]
		var ua: int = f[2]
		var va: int = f[3]
		var us: PackedFloat32Array = axes[ua]
		var vs: PackedFloat32Array = axes[va]
		var base := verts.size()
		for j in vs.size():
			for i in us.size():
				var p := Vector3.ZERO
				p[na] = half[na] * sgn
				p[ua] = us[i]
				p[va] = vs[j]
				var q := p.clamp(-inner, inner)
				var d := p - q
				var n := d.normalized() if d.length() > 1e-6 else Vector3.ZERO
				if n == Vector3.ZERO:
					n[na] = sgn
				var pos := q + n * r if r > 0.0 else p
				add_vertex(xf * pos, (nb * n).normalized())
		grid(base, vs.size(), us.size())


## A sharp-edged box.
func box(xf: Transform3D, size: Vector3) -> void:
	var h := size * 0.5
	var nb := xf.basis.inverse().transposed()
	var faces := [[0, 1.0, 1, 2], [0, -1.0, 2, 1], [1, 1.0, 2, 0], [1, -1.0, 0, 2], [2, 1.0, 0, 1], [2, -1.0, 1, 0]]
	for f: Array in faces:
		var na: int = f[0]
		var sgn: float = f[1]
		var ua: int = f[2]
		var va: int = f[3]
		var n := Vector3.ZERO
		n[na] = sgn
		var wn := (nb * n).normalized()
		var base := verts.size()
		for c: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
			var p := Vector3.ZERO
			p[na] = h[na] * sgn
			p[ua] = h[ua] * c.x
			p[va] = h[va] * c.y
			add_vertex(xf * p, wn)
		quad(base, base + 1, base + 2, base + 3)


## A cone standing on its base (centred, three.js ConeGeometry): tip at +y.
func cone(xf: Transform3D, r: float, h: float, radial: int = 8) -> void:
	var nb := xf.basis.inverse().transposed()
	var slope := r / h
	var base := verts.size()
	for i in radial + 1:
		var ang := TAU * i / radial
		var d := Vector3(sin(ang), 0.0, cos(ang))
		var n := (nb * (d + Vector3(0, slope, 0)).normalized()).normalized()
		add_vertex(xf * (d * r + Vector3(0, -h * 0.5, 0)), n)
		add_vertex(xf * Vector3(0, h * 0.5, 0), n)
	for i in radial:
		var v0 := base + i * 2
		tri(v0, v0 + 2, v0 + 1)
	var down := (nb * Vector3.DOWN).normalized()
	var centre := add_vertex(xf * Vector3(0, -h * 0.5, 0), down)
	var ring := verts.size()
	for i in radial:
		var ang := TAU * i / radial
		add_vertex(xf * Vector3(sin(ang) * r, -h * 0.5, cos(ang) * r), down)
	for i in radial:
		tri(centre, ring + (i + 1) % radial, ring + i)


## Tube along a centripetal Catmull-Rom curve through pts, radius r.
func tube(pts: PackedVector3Array, r: float, closed: bool = false, radial: int = 6, per_point: int = 4) -> void:
	var segs := maxi(8, pts.size() * per_point)
	sweep_with(Curves.even(pts, closed, segs), func(_u: float) -> float: return r, radial, closed)


## Tube along a smooth path with a varying radius r(u), u 0 start .. 1 end.
func sweep(pts: PackedVector3Array, r: Callable, radial: int = 6, segs: int = 18) -> void:
	sweep_with(Curves.even(pts, false, segs), r, radial, false)


func sweep_with(path: PackedVector3Array, r: Callable, radial: int, closed: bool) -> void:
	var n := path.size()
	if n < 2:
		return
	var frames := Curves.frames(path, closed)
	var nn: PackedVector3Array = frames[0]
	var bb: PackedVector3Array = frames[1]
	var base := verts.size()
	var rows := n + (1 if closed else 0)
	for i in rows:
		var k := i % n
		var u := float(i) / (rows - 1)
		var rr: float = r.call(u)
		for j in radial + 1:
			var a := TAU * (j % radial) / radial
			var d := (nn[k] * cos(a) + bb[k] * sin(a)).normalized()
			add_vertex(path[k] + d * rr, d)
	# round from N to B, then along the path, runs counter-clockwise from outside
	grid(base, rows, radial + 1)
	if not closed:
		var t0 := (path[0] - path[1]).normalized()
		var t1 := (path[n - 1] - path[n - 2]).normalized()
		_disc(path[0], t0, nn[0], bb[0], r.call(0.0), radial)
		_disc(path[n - 1], t1, nn[n - 1], bb[n - 1], r.call(1.0), radial)


## A square frame with a round section (a 4-segment torus turned square), facing +Z of xf.
func square_ring(xf: Transform3D, half: float, r: float) -> void:
	torus(xf * Transform3D(Basis(Vector3.BACK, PI * 0.25), Vector3.ZERO), half * sqrt(2.0), r, 5, 4)


# ------------------------------------------------------------------ out

func arrays() -> Array:
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = verts
	a[Mesh.ARRAY_NORMAL] = normals
	a[Mesh.ARRAY_COLOR] = colors
	a[Mesh.ARRAY_INDEX] = indices
	return a


func commit(mesh: ArrayMesh = null) -> ArrayMesh:
	if mesh == null:
		mesh = ArrayMesh.new()
	if indices.is_empty():
		return mesh
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays())
	return mesh


## The mesh with a chain of simplified index buffers that the renderer picks
## from by on-screen size (shadow passes included), so a ship far off draws a
## fraction of its triangles.
func commit_lod() -> ArrayMesh:
	if indices.is_empty():
		return ArrayMesh.new()
	return MeshKit.with_lods(arrays())


static func with_lods(surface: Array) -> ArrayMesh:
	var im := ImporterMesh.new()
	im.add_surface(Mesh.PRIMITIVE_TRIANGLES, surface)
	im.generate_lods(60.0, 25.0, [])
	return im.get_mesh()


## A local frame on a surface: x along the hull (horizontal), y up-ish, z = n.
static func surface_frame(p: Vector3, n: Vector3) -> Transform3D:
	var xa := Vector3.UP.cross(n).normalized()
	var ya := n.cross(xa).normalized()
	return Transform3D(Basis(xa, ya, n), p)


## Rotation taking +Z onto dir.
static func aim_z(dir: Vector3) -> Basis:
	var d := dir.normalized()
	var axis := Vector3.BACK.cross(d)
	if axis.length() < 1e-6:
		return Basis.IDENTITY if d.z > 0.0 else Basis(Vector3.UP, PI)
	return Basis(axis.normalized(), acos(clampf(Vector3.BACK.dot(d), -1.0, 1.0)))


## An sRGB paint scaled in linear light (the web game's colour.multiplyScalar).
static func shade(c: Color, f: float) -> Color:
	var l := c.srgb_to_linear()
	return Color(minf(l.r * f, 1.0), minf(l.g * f, 1.0), minf(l.b * f, 1.0)).linear_to_srgb()


## Two sRGB paints mixed in linear light.
static func blend(a: Color, b: Color, t: float) -> Color:
	return a.srgb_to_linear().lerp(b.srgb_to_linear(), t).linear_to_srgb()
