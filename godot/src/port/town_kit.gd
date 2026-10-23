class_name TownKit
extends RefCounted
## The web game's port Builder (src/port/port.ts) over a MeshKit: boxes,
## turned posts, balls, beams, gables, shingled roofs and striped canvas laid
## down in a town's own frame (+x along the shore, +z out to sea) as one
## vertex-painted mesh for ship_parts.gdshader. Paint is the web's linear
## colour (or a function of the vertex's position, returning one), and the
## kind of stuff it is: wood, ironwork, gilt or lamplight. Lamplight is HDR in
## the web's paint; the town's material multiplies its glass by GLOW_GAIN, so
## it is stored divided by that.

const WOOD := MeshKit.WOOD
const IRON := MeshKit.IRON
const GLOW := MeshKit.GLOW
const GILT := MeshKit.GILT
## The town material's glow_gain (ship_parts.gdshader).
const GLOW_GAIN := 6.0

var kit: MeshKit


func _init(seed_value: int = 7) -> void:
	kit = MeshKit.new(seed_value)


## A web colour (an sRGB hex) in linear light, as the web's lin() gives it.
static func lin(hex: String) -> Color:
	return Color(hex).srgb_to_linear()


## A linear colour scaled (the web's shade()).
static func shade(c: Color, f: float) -> Color:
	return Color(c.r * f, c.g * f, c.b * f)


## A transform from the web's placement: rotated about x, then z, then y, then moved.
static func place(pos: Vector3, rx: float = 0.0, ry: float = 0.0, rz: float = 0.0) -> Transform3D:
	return Transform3D(Basis(Vector3.UP, ry) * Basis(Vector3.BACK, rz) * Basis(Vector3.RIGHT, rx), pos)


## Paints everything laid down since vertex v0: a colour, or a function of
## the vertex's position that returns one.
func paint_from(v0: int, paint: Variant, kind: float) -> void:
	var a := MeshKit.code(kind)
	var fn: Callable = paint if paint is Callable else Callable()
	var solid := Color()
	if not fn.is_valid():
		solid = _store(paint, kind, a)
	for i in range(v0, kit.verts.size()):
		kit.colors[i] = _store(fn.call(kit.verts[i]), kind, a) if fn.is_valid() else solid


static func _store(c: Color, kind: float, a: float) -> Color:
	if kind == GLOW:
		c = c / GLOW_GAIN
	var s := Color(minf(c.r, 1.0), minf(c.g, 1.0), minf(c.b, 1.0)).linear_to_srgb()
	s.a = a
	return s


## Flat facets for everything since (v0, i0): each triangle gets its own
## corners and its face's normal (the web's flat parts: gables, spires, caps).
func facet(v0: int, i0: int) -> void:
	var tris := kit.indices.slice(i0)
	var pos := kit.verts.slice(v0)
	var col := kit.colors.slice(v0)
	kit.verts.resize(v0)
	kit.normals.resize(v0)
	kit.colors.resize(v0)
	kit.indices.resize(i0)
	for k in range(0, tris.size(), 3):
		var a := pos[tris[k] - v0]
		var b := pos[tris[k + 1] - v0]
		var c := pos[tris[k + 2] - v0]
		# stored clockwise: this cross points out
		var n := (c - a).cross(b - a).normalized()
		var base := kit.verts.size()
		for j in 3:
			kit.verts.append([a, b, c][j])
			kit.normals.append(n)
			kit.colors.append(col[tris[k + j] - v0])
			kit.indices.append(base + j)


func _mark() -> Vector2i:
	return Vector2i(kit.verts.size(), kit.indices.size())


# ------------------------------------------------------------------ parts

## A box (rounded when r is big enough to show), centred at pos.
func box(w: float, h: float, d: float, pos: Vector3, paint: Variant, r: float = 0.0, kind: float = WOOD, rx: float = 0.0, ry: float = 0.0, rz: float = 0.0) -> void:
	box_xf(place(pos, rx, ry, rz), Vector3(w, h, d), paint, r, kind)


func box_xf(xf: Transform3D, size: Vector3, paint: Variant, r: float = 0.0, kind: float = WOOD) -> void:
	var m := _mark()
	# a bevel under a few centimetres is lost at any distance the town is seen from
	if r >= 0.07:
		kit.rbox(xf, size, minf(r, minf(size.x, minf(size.y, size.z)) * 0.5 - 1e-3), 1)
	else:
		kit.box(xf, size)
	paint_from(m.x, paint, kind)


## An upright cylinder (radius rt at the top, rb at the bottom), centred at pos.
func cyl(rt: float, rb: float, h: float, pos: Vector3, paint: Variant, seg: int = 8, kind: float = WOOD, rx: float = 0.0, rz: float = 0.0, caps: bool = true, ry: float = 0.0) -> void:
	var xf := place(pos, rx, ry, rz)
	var m := _mark()
	kit.spar(xf * Vector3(0.0, -h * 0.5, 0.0), xf * Vector3(0.0, h * 0.5, 0.0), rb, rt, seg, caps)
	paint_from(m.x, paint, kind)


## A cylinder up xf's y axis, centred on its origin (for parts placed by a
## transform rather than the web's angles).
func cyl_xf(rt: float, rb: float, h: float, xf: Transform3D, paint: Variant, seg: int = 8, kind: float = WOOD, caps: bool = true) -> void:
	var m := _mark()
	kit.spar(xf * Vector3(0.0, -h * 0.5, 0.0), xf * Vector3(0.0, h * 0.5, 0.0), rb, rt, seg, caps)
	paint_from(m.x, paint, kind)


## A ball (squashed or stretched by s), as few facets as its size allows.
func ball(r: float, pos: Vector3, paint: Variant, kind: float = WOOD, s: Vector3 = Vector3.ONE) -> void:
	var m := _mark()
	var w := 6 if r < 0.16 else (8 if r < 0.5 else 10)
	var h := 4 if r < 0.16 else (6 if r < 0.5 else 7)
	kit.sphere(Transform3D(Basis.from_scale(s), pos), r, w, h)
	paint_from(m.x, paint, kind)


## Part of a sphere (three.js SphereGeometry's angles), placed by xf.
func dome(xf: Transform3D, r: float, w: int, h: int, paint: Variant, kind: float = WOOD, theta_len: float = PI * 0.5) -> void:
	var m := _mark()
	kit.sphere(xf, r, w, h, 0.0, TAU, 0.0, theta_len)
	paint_from(m.x, paint, kind)


## A round beam from a to b.
func beam(a: Vector3, b: Vector3, r: float, paint: Variant, kind: float = WOOD, seg: int = 6) -> void:
	var m := _mark()
	kit.spar(a, b, r, r, seg, true)
	paint_from(m.x, paint, kind)


## A cone standing on its base at pos (tip up), faceted if flat.
func cone(r: float, h: float, pos: Vector3, paint: Variant, seg: int = 8, kind: float = WOOD, flat: bool = false, ry: float = 0.0) -> void:
	var m := _mark()
	kit.cone(place(pos, 0.0, ry), r, h, seg)
	if flat:
		facet(m.x, m.y)
	paint_from(m.x, paint, kind)


## A turned profile of (radius, y) pairs, either way up, spun round pos's upright.
func lathe(profile: PackedVector2Array, xf: Transform3D, paint: Variant, seg: int = 10, kind: float = WOOD) -> void:
	var p := profile
	if p[0].y > p[p.size() - 1].y:
		p = profile.duplicate()
		p.reverse()
	var m := _mark()
	kit.lathe(xf, p, seg)
	paint_from(m.x, paint, kind)


## A ring (three.js TorusGeometry: in the frame's XY plane, facing +z), arc < TAU leaves it open.
func torus(big_r: float, r: float, radial: int, tubular: int, xf: Transform3D, paint: Variant, kind: float = WOOD, arc: float = TAU) -> void:
	var m := _mark()
	kit.torus(xf, big_r, r, radial, tubular, arc)
	paint_from(m.x, paint, kind)


## A flat fan facing +z (three.js CircleGeometry from angle a0 through a_len).
func fan(r: float, seg: int, a0: float, a_len: float, pos: Vector3, paint: Variant, kind: float = WOOD) -> void:
	var m := _mark()
	var c := kit.add_vertex(pos, Vector3.BACK)
	for i in seg + 1:
		var a := a0 + a_len * i / seg
		kit.add_vertex(pos + Vector3(cos(a), sin(a), 0.0) * r, Vector3.BACK)
	for i in seg:
		kit.tri(c, c + 1 + i, c + 2 + i)
	paint_from(m.x, paint, kind)


## A flat quad, corners counter-clockwise seen from its face; `both` gives it a back too.
func quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, paint: Variant, kind: float = WOOD, both: bool = false) -> void:
	var m := _mark()
	var n := (b - a).cross(d - a).normalized()
	var i := kit.add_vertex(a, n)
	kit.add_vertex(b, n)
	kit.add_vertex(c, n)
	kit.add_vertex(d, n)
	kit.quad(i, i + 1, i + 2, i + 3)
	if both:
		var j := kit.add_vertex(a, -n)
		kit.add_vertex(b, -n)
		kit.add_vertex(c, -n)
		kit.add_vertex(d, -n)
		kit.quad(j, j + 3, j + 2, j + 1)
	paint_from(m.x, paint, kind)


## A gable's triangle of wall: span across, rising to `rise` at the ridge,
## `length` along it; its base on pos's y. Faceted, as the web's.
func gable(span: float, rise: float, length: float, pos: Vector3, paint: Variant, ridge_along_x: bool) -> void:
	var m := _mark()
	var hs := span * 0.5
	var hl := length * 0.5
	# the triangle in (across, up), swept along the ridge
	var tri_pts: Array[Vector2] = [Vector2(-hs, 0.0), Vector2(hs, 0.0), Vector2(0.0, rise)]
	var at := func(p: Vector2, along: float) -> Vector3:
		return pos + (Vector3(along, p.y, p.x) if ridge_along_x else Vector3(p.x, p.y, along))
	var ends := [-hl, hl]
	# the two triangular ends
	for e in 2:
		var s := -1.0 if e == 0 else 1.0
		var a: Vector3 = at.call(tri_pts[0], ends[e])
		var b: Vector3 = at.call(tri_pts[1], ends[e])
		var c: Vector3 = at.call(tri_pts[2], ends[e])
		var n := (Vector3.RIGHT if ridge_along_x else Vector3.BACK) * s
		var i := kit.add_vertex(a, n)
		kit.add_vertex(b, n)
		kit.add_vertex(c, n)
		if (b - a).cross(c - a).dot(n) > 0.0:
			kit.tri(i, i + 1, i + 2)
		else:
			kit.tri(i, i + 2, i + 1)
	# the sloping sides and the floor
	for k in 3:
		var p0: Vector2 = tri_pts[k]
		var p1: Vector2 = tri_pts[(k + 1) % 3]
		var a: Vector3 = at.call(p0, -hl)
		var b: Vector3 = at.call(p1, -hl)
		var c: Vector3 = at.call(p1, hl)
		var d: Vector3 = at.call(p0, hl)
		var mid := (a + c) * 0.5
		var centre: Vector3 = at.call(Vector2(0.0, rise / 3.0), 0.0)
		var n := (b - a).cross(d - a).normalized()
		var i := kit.add_vertex(a, n)
		kit.add_vertex(b, n)
		kit.add_vertex(c, n)
		kit.add_vertex(d, n)
		if n.dot(mid - centre) > 0.0:
			kit.quad(i, i + 1, i + 2, i + 3)
		else:
			kit.quad(i, i + 3, i + 2, i + 1)
			for j in 4:
				kit.normals[i + j] = -n
	paint_from(m.x, paint, WOOD)


## A shingled roof over a w-wide building whose walls rise to `top`, its
## ridge `rise` above them along x (or along z), `span` across the eaves:
## courses of shingles laid each a touch flatter than the pitch, so every
## course's lower edge stands proud over the one below it, in alternating
## shades; and a round ridge cap.
func roof(w: float, span: float, rise: float, x: float, top: float, z: float, col: Color, ridge_along_x: bool = true) -> void:
	var half := span * 0.5
	var a := atan2(rise, half)
	var length := (half + 0.55) / cos(a)
	var courses := maxi(3, ceili(length / 0.42))
	var cl := length / courses
	var ridge := Vector3(x, top + rise + 0.14, z)
	for s: float in [-1.0, 1.0]:
		# down the slope from the ridge, and out of the roof
		var down := Vector3(0.0, -sin(a), s * cos(a)) if ridge_along_x else Vector3(s * cos(a), -sin(a), 0.0)
		for k in courses:
			var c := ridge + down * (cl * (k + 0.5))
			var tilt := a - 0.1
			var xf: Transform3D
			if ridge_along_x:
				xf = Transform3D(Basis(Vector3.RIGHT, s * tilt), c)
				box_xf(xf, Vector3(w + 1.1, 0.2, cl + 0.1), shade(col, 0.9 if k % 2 else 1.05))
			else:
				xf = Transform3D(Basis(Vector3.BACK, -s * tilt), c)
				box_xf(xf, Vector3(cl + 0.1, 0.2, w + 1.1), shade(col, 0.9 if k % 2 else 1.05))
	if ridge_along_x:
		cyl(0.18, 0.18, w + 1.3, Vector3(x, top + rise + 0.2, z), shade(col, 0.75), 8, WOOD, 0.0, PI * 0.5)
	else:
		cyl(0.18, 0.18, w + 1.3, Vector3(x, top + rise + 0.2, z), shade(col, 0.75), 8, WOOD, PI * 0.5)


## A strip of striped canvas (an awning): `width` along x centred on pos,
## `depth` down its slope, tipped `pitch` from upright (the web's
## rotateX(-PI/2 + pitch)); stripes `stripe` wide, counted from x = -20 of
## the town, in two colours, each its own quad so the edges stay crisp.
func awning(width: float, depth: float, pitch: float, pos: Vector3, stripe: float, c0: Color, c1: Color) -> void:
	var b := Basis(Vector3.RIGHT, -PI * 0.5 + pitch)
	var up := b * Vector3(0.0, depth * 0.5, 0.0)
	var x0 := pos.x - width * 0.5
	var x1 := pos.x + width * 0.5
	var x := x0
	while x < x1 - 1e-4:
		var k := floori((x + 20.0) / stripe + 1e-4)
		var nx := minf(x1, -20.0 + (k + 1) * stripe)
		var col := c0 if posmod(k, 2) == 1 else c1
		var p := Vector3(x, pos.y, pos.z)
		var q := Vector3(nx, pos.y, pos.z)
		quad(p - up, q - up, q + up, p + up, col, WOOD, true)
		x = nx


## A barrel: its staves turned and four iron hoops proud of them (the web's
## PropGeo.barrel, whose hoops were only paint between its few rings).
func barrel(xf: Transform3D, h: float = 0.9, r: float = 0.36, seg: int = 10) -> void:
	var prof := PackedVector2Array()
	for y: float in [-0.5, -0.25, 0.0, 0.25, 0.5]:
		prof.append(Vector2(r * (1.0 - 0.16 * 4.0 * y * y), y * h))
	prof.insert(0, Vector2(0.01, -0.5 * h))
	prof.append(Vector2(0.01, 0.5 * h))
	var m := _mark()
	kit.lathe(xf, prof, seg)
	paint_from(m.x, func(p: Vector3) -> Color:
		var q := xf.affine_inverse() * p
		return lin("#9a6a3c") * (0.9 + 0.12 * sin(atan2(q.z, q.x) * 7.0)) if absf(q.y) < h * 0.49 else lin("#6e4a28"), WOOD)
	for y: float in [-0.47, -0.32, 0.32, 0.47]:
		var rr := r * (1.0 - 0.16 * 4.0 * y * y) + 0.008
		var mh := _mark()
		kit.spar(xf * Vector3(0.0, y * h - 0.02, 0.0), xf * Vector3(0.0, y * h + 0.02, 0.0), rr, rr, seg, false)
		paint_from(mh.x, lin("#3a3532"), IRON)


## Half a cylinder lying along the frame's x axis, its round side up (a
## casket's lid, a strap over it): `length` long, radius r, closed.
func half_cyl(r: float, length: float, xf: Transform3D, paint: Variant, seg: int = 10, kind: float = WOOD) -> void:
	var m := _mark()
	var nb := xf.basis.inverse().transposed()
	var hl := length * 0.5
	var base := kit.verts.size()
	for i in seg + 1:
		var a := PI * i / seg
		var d := Vector3(0.0, sin(a), cos(a))
		var n := (nb * d).normalized()
		kit.add_vertex(xf * Vector3(-hl, d.y * r, d.z * r), n)
		kit.add_vertex(xf * Vector3(hl, d.y * r, d.z * r), n)
	for i in seg:
		var v := base + i * 2
		kit.quad(v, v + 1, v + 3, v + 2)
	# the flat underside and the two half-disc ends
	var down := (nb * Vector3.DOWN).normalized()
	var u := kit.add_vertex(xf * Vector3(-hl, 0.0, r), down)
	kit.add_vertex(xf * Vector3(-hl, 0.0, -r), down)
	kit.add_vertex(xf * Vector3(hl, 0.0, -r), down)
	kit.add_vertex(xf * Vector3(hl, 0.0, r), down)
	kit.quad(u, u + 1, u + 2, u + 3)
	for e: float in [-1.0, 1.0]:
		var n := (nb * Vector3(e, 0.0, 0.0)).normalized()
		var c := kit.add_vertex(xf * Vector3(e * hl, 0.0, 0.0), n)
		for i in seg + 1:
			var a := PI * i / seg
			kit.add_vertex(xf * Vector3(e * hl, sin(a) * r, cos(a) * r), n)
		for i in seg:
			if e > 0.0:
				kit.tri(c, c + 2 + i, c + 1 + i)
			else:
				kit.tri(c, c + 1 + i, c + 2 + i)
	paint_from(m.x, paint, kind)


## A crate: planked box with darker battens along its edges.
func crate(xf: Transform3D, s: float = 0.62) -> void:
	box_xf(xf, Vector3(s, s, s), lin("#b8864e"))
	var dark := lin("#6e4a28")
	var e := s * 0.5 - 0.02
	for ax in 3:
		for a: float in [-1.0, 1.0]:
			for b: float in [-1.0, 1.0]:
				var c := Vector3.ZERO
				var size := Vector3(0.05, 0.05, 0.05)
				size[ax] = s + 0.02
				c[(ax + 1) % 3] = a * e
				c[(ax + 2) % 3] = b * e
				box_xf(xf * Transform3D(Basis.IDENTITY, c), size, dark)


func commit() -> ArrayMesh:
	return kit.commit()


func commit_lod() -> ArrayMesh:
	return kit.commit_lod()


func triangles() -> int:
	return kit.indices.size() / 3
