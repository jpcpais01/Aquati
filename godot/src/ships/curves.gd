class_name Curves
## Smooth paths through control points (centripetal Catmull-Rom, as three.js
## draws them) and the twist-free frames that tubes are swept along.


## The point at parameter t (0..1 over the whole curve).
static func point(pts: PackedVector3Array, closed: bool, t: float) -> Vector3:
	var l := pts.size()
	var p := (l - (0 if closed else 1)) * t
	var ip := floori(p)
	var w := p - ip
	if closed:
		ip = posmod(ip, l)
	elif w == 0.0 and ip == l - 1:
		ip = l - 2
		w = 1.0
	var p0: Vector3
	var p3: Vector3
	if closed or ip > 0:
		p0 = pts[posmod(ip - 1, l)]
	else:
		p0 = pts[0] * 2.0 - pts[1]
	var p1 := pts[ip % l]
	var p2 := pts[(ip + 1) % l]
	if closed or ip + 2 < l:
		p3 = pts[(ip + 2) % l]
	else:
		p3 = pts[l - 1] * 2.0 - pts[l - 2]
	var dt0 := pow(p0.distance_squared_to(p1), 0.25)
	var dt1 := pow(p1.distance_squared_to(p2), 0.25)
	var dt2 := pow(p2.distance_squared_to(p3), 0.25)
	if dt1 < 1e-4:
		dt1 = 1.0
	if dt0 < 1e-4:
		dt0 = dt1
	if dt2 < 1e-4:
		dt2 = dt1
	var t1 := ((p1 - p0) / dt0 - (p2 - p0) / (dt0 + dt1) + (p2 - p1) / dt1) * dt1
	var t2 := ((p2 - p1) / dt1 - (p3 - p1) / (dt1 + dt2) + (p3 - p2) / dt2) * dt1
	var c2 := -3.0 * p1 + 3.0 * p2 - 2.0 * t1 - t2
	var c3 := 2.0 * p1 - 2.0 * p2 + t1 + t2
	return p1 + t1 * w + c2 * (w * w) + c3 * (w * w * w)


## `segs` even steps along the curve by arc length: segs + 1 points, or segs
## for a closed loop (the first is not repeated).
static func even(pts: PackedVector3Array, closed: bool, segs: int) -> PackedVector3Array:
	var out := PackedVector3Array()
	if pts.size() < 2:
		return pts
	# a dense polyline, then walk it in equal lengths
	var n := maxi(segs * 4, pts.size() * 8)
	var dense := PackedVector3Array()
	var acc := PackedFloat32Array()
	var total := 0.0
	for i in n + 1:
		var p := point(pts, closed, float(i) / n)
		if i > 0:
			total += p.distance_to(dense[i - 1])
		dense.append(p)
		acc.append(total)
	var count := segs if closed else segs + 1
	var j := 0
	for k in count:
		var target := total * float(k) / segs
		while j < n - 1 and acc[j + 1] < target:
			j += 1
		var span := acc[j + 1] - acc[j]
		var f := (target - acc[j]) / span if span > 1e-9 else 0.0
		out.append(dense[j].lerp(dense[j + 1], clampf(f, 0.0, 1.0)))
	return out


## Rotation-minimising frames along a polyline: [normals, binormals], with
## binormal = tangent x normal. A closed loop spreads its leftover twist.
static func frames(path: PackedVector3Array, closed: bool) -> Array:
	var n := path.size()
	var tangents := PackedVector3Array()
	tangents.resize(n)
	for i in n:
		var a := path[posmod(i - 1, n)] if (closed or i > 0) else path[i]
		var b := path[(i + 1) % n] if (closed or i < n - 1) else path[i]
		tangents[i] = (b - a).normalized()
	var normals := PackedVector3Array()
	var binormals := PackedVector3Array()
	normals.resize(n)
	binormals.resize(n)
	var t0 := tangents[0]
	var pick := Vector3.RIGHT
	if absf(t0.y) <= absf(t0.x) and absf(t0.y) <= absf(t0.z):
		pick = Vector3.UP
	elif absf(t0.z) <= absf(t0.x):
		pick = Vector3.BACK
	var side := t0.cross(pick).normalized()
	normals[0] = t0.cross(side).normalized()
	for i in range(1, n):
		var nn := normals[i - 1]
		var axis := tangents[i - 1].cross(tangents[i])
		if axis.length() > 1e-7:
			var ang := acos(clampf(tangents[i - 1].dot(tangents[i]), -1.0, 1.0))
			nn = nn.rotated(axis.normalized(), ang)
		# keep it square to the tangent against drift
		nn = (nn - tangents[i] * nn.dot(tangents[i])).normalized()
		normals[i] = nn
	if closed and n > 2:
		# the twist left over between the last frame and the first, shared out
		var last := normals[n - 1]
		var axis_t := tangents[0]
		var back := last.rotated(tangents[n - 1].cross(axis_t).normalized(), acos(clampf(tangents[n - 1].dot(axis_t), -1.0, 1.0))) if tangents[n - 1].cross(axis_t).length() > 1e-7 else last
		var twist := atan2(normals[0].cross(back).dot(axis_t), normals[0].dot(back))
		for i in range(1, n):
			normals[i] = normals[i].rotated(tangents[i], -twist * float(i) / n)
	for i in n:
		binormals[i] = tangents[i].cross(normals[i]).normalized()
	return [normals, binormals]
