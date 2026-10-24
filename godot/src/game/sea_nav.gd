class_name SeaNav
extends RefCounted
## The waters the helmsman plans through, for one hull (the web game's
## autopilot NavGrid, rebuilt to last a whole voyage): each archipelago's
## square laid out in 8 m cells, every cell too shoal for her keel, or over
## living coral close under it, struck out; each open cell's clearance from
## the nearest of those (a chamfer distance transform, in metres); and an A*
## grid (the engine's AStarGrid2D) whose cells cost more the nearer they run
## to danger. Between the squares the high seas are deep water all the way,
## and the known sea round them is a long oval (convex): a course leaves one
## square in a straight line for the next.
##
## Built once a voyage on a worker thread, then only ever read; a course is
## plotted on a worker too (see Helmsman), so neither costs a frame.

## Metres a cell: the web's finest.
const CELL := 8.0
## Cells along a side of an archipelago's square.
const N := 256
## Open-sea coral this thick (of 255) strikes out water she'd otherwise
## clear (the web's 0.22).
const CORAL := 57
## A goal is looked for this far round where it was asked for (m).
const GOAL_SPAN := 520.0
## Her own cell aground (close inshore): open water this many cells off will do.
const START_SPAN := 6
## The edge of the known sea: a goal stands at least this far inside it (m).
const EDGE_IN := 90.0

## One archipelago's soundings (the same for every hull): the shoalest of
## the web's five soundings round each cell's middle (bounded by the 2 m
## grid points under them: the middle itself, a grid point, and the four
## round each sounding off it on the diagonals), and whether coral grows
## there.
class Soundings:
	var x0 := 0.0
	var z0 := 0.0
	var shoal := PackedFloat32Array()
	var coral := PackedByteArray()

	static func take(r: Region) -> Soundings:
		var s := Soundings.new()
		s.x0 = r.x0
		s.z0 = r.z0
		var h := r.heights
		var reef := r.reef
		var g := Region.GRID
		s.shoal.resize(N * N)
		s.coral.resize(N * N)
		for j in N:
			# each cell's middle is a grid point (4i + 2, 4j + 2): its rows, two either side
			var r2 := (4 * j + 2) * g
			var r0 := r2 - 2 * g
			var r1 := r2 - g
			var r3 := r2 + g
			var r4 := r2 + 2 * g
			for i in N:
				var c := 4 * i + 2
				var o0 := r0 + c
				var o1 := r1 + c
				var o3 := r3 + c
				var o4 := r4 + c
				var top := maxf(maxf(maxf(h[o0 - 2], h[o0 - 1]), maxf(h[o0 + 1], h[o0 + 2])), maxf(maxf(h[o1 - 2], h[o1 - 1]), maxf(h[o1 + 1], h[o1 + 2])))
				top = maxf(top, maxf(maxf(maxf(h[o3 - 2], h[o3 - 1]), maxf(h[o3 + 1], h[o3 + 2])), maxf(maxf(h[o4 - 2], h[o4 - 1]), maxf(h[o4 + 1], h[o4 + 2]))))
				var k := j * N + i
				s.shoal[k] = maxf(top, h[r2 + c])
				s.coral[k] = 1 if reef[r2 + c] >= CORAL else 0
		return s


## One archipelago's square, for this hull.
class Field:
	var x0 := 0.0
	var z0 := 0.0
	var blocked := PackedByteArray()
	var clear := PackedFloat32Array()
	var astar: AStarGrid2D
	## The least clearance along the square's rim: open water every course into it may count on.
	var rim := 0.0

	func contains(x: float, z: float) -> bool:
		return x >= x0 and z >= z0 and x < x0 + N * CELL and z < z0 + N * CELL

	func index(x: float, z: float) -> int:
		var i := clampi(floori((x - x0) / CELL), 0, N - 1)
		var j := clampi(floori((z - z0) / CELL), 0, N - 1)
		return j * N + i

	func middle(k: int) -> Vector2:
		return Vector2(x0 + ((k % N) + 0.5) * CELL, z0 + ((k / N) + 0.5) * CELL)

	## How far the point lies outside the square (0 inside).
	func outside(x: float, z: float) -> float:
		var dx := maxf(maxf(x0 - x, x - (x0 + N * CELL)), 0.0)
		var dz := maxf(maxf(z0 - z, z - (z0 + N * CELL)), 0.0)
		return sqrt(dx * dx + dz * dz)

	## The nearest cell to `k` that isn't land or shoal, within `r` cells (the
	## web's nearestOpen: the roomier water a little preferred), or -1.
	func nearest_open(k: int, r: int) -> int:
		var i0 := k % N
		var j0 := k / N
		var best := -1
		var bd := INF
		for j in range(maxi(0, j0 - r), mini(N - 1, j0 + r) + 1):
			for i in range(maxi(0, i0 - r), mini(N - 1, i0 + r) + 1):
				var q := j * N + i
				if blocked[q]:
					continue
				var d := (i - i0) * (i - i0) + (j - j0) * (j - j0) - clear[q] * 0.02
				if d < bd:
					bd = d
					best = q
		return best


var fields: Array[Field] = []
var draft := 0.0
## Her hard clearance (m): what she needs round her hull to turn and lie.
var reach := 0.0
## Every archipelago's middle (the known sea is the oval round them).
var _centres := PackedVector2Array()
## The least rim of all the squares (see Field.rim).
var _rim := 0.0


## The waters for a hull of `draft` needing `reach` metres round her, from
## the archipelagos' soundings (heavy: a worker's job).
static func build(soundings: Array, centres: PackedVector2Array, p_draft: float, p_reach: float) -> SeaNav:
	var nav := SeaNav.new()
	nav.draft = p_draft
	nav.reach = p_reach
	nav._centres = centres
	nav._rim = INF
	for s: Soundings in soundings:
		var f := _field(s, p_draft, p_reach)
		nav.fields.append(f)
		nav._rim = minf(nav._rim, f.rim)
	if nav.fields.is_empty():
		nav._rim = 0.0
	return nav


static func _field(s: Soundings, p_draft: float, R: float) -> Field:
	var f := Field.new()
	f.x0 = s.x0
	f.z0 = s.z0
	var NN := N * N
	var shallow := -(p_draft + 1.0)
	var coral := -(p_draft + 2.6)
	var B := PackedByteArray()
	B.resize(NN)
	var D := PackedFloat32Array()
	D.resize(NN)
	for k in NN:
		var h := s.shoal[k]
		var shut := h > shallow or (h > coral and s.coral[k] == 1)
		B[k] = 1 if shut else 0
		D[k] = 0.0 if shut else 1e9
	# clearance: a two-pass chamfer distance transform, in metres
	var a := CELL
	var d := CELL * sqrt(2.0)
	for j in N:
		for i in N:
			var k := j * N + i
			var v := D[k]
			if v == 0.0:
				continue
			if i > 0:
				v = minf(v, D[k - 1] + a)
			if j > 0:
				v = minf(v, D[k - N] + a)
				if i > 0:
					v = minf(v, D[k - N - 1] + d)
				if i < N - 1:
					v = minf(v, D[k - N + 1] + d)
			D[k] = v
	for j in range(N - 1, -1, -1):
		for i in range(N - 1, -1, -1):
			var k := j * N + i
			var v := D[k]
			if v == 0.0:
				continue
			if i < N - 1:
				v = minf(v, D[k + 1] + a)
			if j < N - 1:
				v = minf(v, D[k + N] + a)
				if i < N - 1:
					v = minf(v, D[k + N + 1] + d)
				if i > 0:
					v = minf(v, D[k + N - 1] + d)
			D[k] = v
	f.blocked = B
	f.clear = D
	var rim := INF
	for t in N:
		rim = minf(rim, minf(minf(D[t], D[(N - 1) * N + t]), minf(D[t * N], D[t * N + N - 1])))
	f.rim = rim
	# the A* grid: the struck-out cells solid (a row's run at a time), the
	# water near danger dearer (a lot inside her clearance, a little just outside it)
	var g := AStarGrid2D.new()
	g.region = Rect2i(0, 0, N, N)
	g.cell_size = Vector2(CELL, CELL)
	g.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	g.default_compute_heuristic = AStarGrid2D.HEURISTIC_EUCLIDEAN
	g.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	g.update()
	var near := R * 2.5
	for j in N:
		var run := -1
		for i in N + 1:
			var shut := i < N and B[j * N + i] == 1
			if shut:
				if run < 0:
					run = i
				continue
			if run >= 0:
				g.fill_solid_region(Rect2i(run, j, i - run, 1))
				run = -1
			if i < N:
				var c := D[j * N + i]
				if c < near:
					g.set_point_weight_scale(Vector2i(i, j), pen(c, R))
	f.astar = g
	return f


## How much dearer a cell is this close to danger (the web's pen).
static func pen(c: float, R: float) -> float:
	if c < R:
		return 1.0 + 7.0 * (1.0 - c / R)
	if c < R * 2.5:
		return 1.0 + 0.5 * (1.0 - (c - R) / (R * 1.5))
	return 1.0


## The square holding (x, z), or null out on the high seas.
func field_at(x: float, z: float) -> Field:
	for f in fields:
		if f.contains(x, z):
			return f
	return null


## The clearance (m) at a point: its cell's in an archipelago's square; out
## on the high seas at least as far as the nearest square and the open
## water round its rim.
func clear_at(x: float, z: float) -> float:
	var out := INF
	for f in fields:
		if f.contains(x, z):
			return f.clear[f.index(x, z)]
		out = minf(out, f.outside(x, z))
	return out + _rim


## A straight run from a to b keeps at least `need` metres off any danger:
## felt along in strides as long as the clearance allows (a distance field
## is never closer than it says), never longer than half a cell near it.
func sight(a: Vector2, b: Vector2, need: float) -> bool:
	var d := b - a
	var L := d.length()
	if L < 1e-4:
		return true
	var u := d / L
	var t := 0.0
	var c := clear_at(a.x, a.y)
	while true:
		t = minf(L, t + maxf(CELL * 0.5, (c - need) * 0.75))
		var p := a + u * t
		c = clear_at(p.x, p.y)
		if c < need:
			return false
		if t >= L:
			return true
	return true


## How far (x, z) lies past the edge of the known sea (m; negative inside),
## and the way back in (World.past_edge).
func _edge(p: Vector2) -> Vector3:
	var best := INF
	var back := Vector2.ZERO
	for i in _centres.size():
		for j in range(i, _centres.size()):
			var q := Geometry2D.get_closest_point_to_segment(p, _centres[i], _centres[j])
			var dd := p.distance_to(q)
			if dd < best:
				best = dd
				back = (q - p) / maxf(dd, 1e-3)
	return Vector3(back.x, back.y, best - World.EDGE_R) if best < INF else Vector3(0.0, 0.0, -World.EDGE_R)


## A course from (sx, sz) for the goal (gx, gz): {"xs": the legs' ends from
## her bow on, "rest": each one's course still to sail, "short": the goal is
## walled in and this is as near as she can get, "goal": where she makes for
## (moved off any land onto open water with room to lie in)}; or {} when
## there's no sea to sail there through.
func plot(sx: float, sz: float, gx: float, gz: float) -> Dictionary:
	var R := reach
	var s := Vector2(sx, sz)
	var g := Vector2(gx, gz)
	# well inside the swell that turns every keel back at the edge
	var e := _edge(g)
	if e.z > -EDGE_IN:
		g += Vector2(e.x, e.y) * (e.z + EDGE_IN)
	# the goal: its own cell when it's open water with room to lie in, else
	# the nearest such water off it, a little toward her side
	var gf := field_at(g.x, g.y)
	var goal_k := -1
	if gf != null:
		goal_k = _goal_cell(gf, g, s)
		if goal_k < 0:
			return {}
		# (lie off it, not on it: make for that water's middle)
		if goal_k != gf.index(g.x, g.y):
			g = gf.middle(goal_k)
	# her own cell may lie in the shoal margin (close inshore): from the nearest open water
	var sf := field_at(s.x, s.y)
	var start_k := -1
	if sf != null:
		start_k = sf.index(s.x, s.y)
		if sf.blocked[start_k] == 1:
			start_k = sf.nearest_open(start_k, START_SPAN)
		if start_k < 0:
			return {}
	# the line from her to the goal crosses the squares in turn: A* through each
	var pts := PackedVector2Array([s])
	var cl := PackedFloat32Array([sf.clear[start_k] if sf != null else clear_at(s.x, s.y)])
	var found := true
	for cross: Array in _crossings(s, g):
		var f: Field = cross[0]
		var t0: float = cross[1]
		var t1: float = cross[2]
		var here := f == sf and t0 <= 0.0
		var there := f == gf and t1 >= 1.0
		var ka := start_k if here else _open_near(f, s.lerp(g, t0))
		var kb := goal_k if there else _open_near(f, s.lerp(g, t1))
		if ka < 0 or kb < 0:
			return {}
		var to := Vector2i(kb % N, kb / N)
		var path := f.astar.get_id_path(Vector2i(ka % N, ka / N), to, true)
		if path.is_empty():
			return {}
		# (her own cell and the goal's own cell give way to the spots themselves)
		var last := path.size() - (1 if there and path[-1] == to else 0)
		for n in range(1 if here else 0, last):
			var k := path[n].y * N + path[n].x
			pts.append(f.middle(k))
			cl.append(f.clear[k])
		if path[-1] != to:
			found = false
			break
	if found:
		pts.append(g)
		cl.append(gf.clear[goal_k] if gf != null else clear_at(g.x, g.y))
	elif pts.size() < 2:
		return {}
	# pulled taut: each leg runs as far as the water stays as clear as the cells it replaces
	var xs := PackedVector2Array([s])
	var a := 0
	var n_pts := pts.size()
	while a < n_pts - 1:
		var b := a + 1
		var run := minf(cl[a], cl[b])
		for c in range(b + 1, n_pts):
			var m := minf(run, cl[c])
			if not sight(pts[a], pts[c], minf(R, m) * 0.92):
				break
			run = m
			b = c
		xs.append(pts[b])
		a = b
	var rest := PackedFloat32Array()
	rest.resize(xs.size())
	for i in range(xs.size() - 2, -1, -1):
		rest[i] = rest[i + 1] + xs[i].distance_to(xs[i + 1])
	return {"xs": xs, "rest": rest, "short": not found, "goal": g}


## The web's goalCell: the goal's own cell, or the best water off it.
func _goal_cell(f: Field, g: Vector2, s: Vector2) -> int:
	var R := reach
	var k := f.index(g.x, g.y)
	if f.blocked[k] == 0 and f.clear[k] >= R * 0.8:
		return k
	var span := ceili(GOAL_SPAN / CELL)
	var i0 := k % N
	var j0 := k / N
	var best := -1
	var bd := INF
	for j in range(maxi(0, j0 - span), mini(N - 1, j0 + span) + 1):
		var z := f.z0 + (j + 0.5) * CELL
		for i in range(maxi(0, i0 - span), mini(N - 1, i0 + span) + 1):
			var q := j * N + i
			if f.blocked[q] == 1:
				continue
			var x := f.x0 + (i + 0.5) * CELL
			var dd := Vector2(x - g.x, z - g.y).length() + maxf(0.0, R - f.clear[q]) * 4.0 + Vector2(x - s.x, z - s.y).length() * 0.08
			if dd < bd:
				bd = dd
				best = q
	return best


## The cell under a point on the line, or the nearest open one to it.
func _open_near(f: Field, p: Vector2) -> int:
	var k := f.index(p.x, p.y)
	return k if f.blocked[k] == 0 else f.nearest_open(k, START_SPAN)


## Where the line from a to b runs through each square: [field, t in, t out]
## in the order she'd sail them.
func _crossings(a: Vector2, b: Vector2) -> Array:
	var out := []
	var d := b - a
	for f in fields:
		var t0 := 0.0
		var t1 := 1.0
		var ok := true
		for axis in 2:
			var p := a[axis]
			var v := d[axis]
			var lo := f.x0 if axis == 0 else f.z0
			var hi := lo + N * CELL
			if absf(v) < 1e-9:
				if p < lo or p >= hi:
					ok = false
				continue
			var ta := (lo - p) / v
			var tb := (hi - p) / v
			t0 = maxf(t0, minf(ta, tb))
			t1 = minf(t1, maxf(ta, tb))
		if ok and t0 <= t1:
			out.append([f, t0, t1])
	out.sort_custom(func(x: Array, y: Array) -> bool: return float(x[1]) < float(y[1]))
	return out
