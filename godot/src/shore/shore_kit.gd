class_name ShoreKit
extends RefCounted
## What a landing party brings (the web game's src/shore/kit.ts): the ship's
## boat pulled up on the sand, laid down with the towns' builder so it shares
## their material and nothing new is compiled mid-voyage.

const BOAT_L := 5.4
const BOAT_B := 1.6


## The ship's boat, bow toward +z: lapped strakes in teal with a cream sheer
## stripe and red bottom paint, raw planking inside, thwarts, the oars laid
## across them, a coil of painter at the bow and a bailer.
static func boat() -> ArrayMesh:
	var b := TownKit.new(11)
	var L := BOAT_L
	var paint := TownKit.lin("#2f6f73")
	var stripe := TownKit.lin("#f1e6cc")
	var bottom := TownKit.lin("#7a3324")
	var raw := TownKit.lin("#b88a5a")
	var timber := TownKit.lin("#5a3d26")
	var timber_dark := TownKit.lin("#3e2a1a")
	var outside := func(p: Vector3) -> Color:
		var strake := 0.9 if posmod(floori((p.y + 0.02) / 0.105), 2) == 1 else 1.0
		if p.y > 0.6 + 0.16 * pow(p.z / (L * 0.5), 2.0):
			return TownKit.shade(stripe, strake)
		return TownKit.shade(bottom if p.y < 0.24 else paint, strake)
	var inside := func(p: Vector3) -> Color:
		return TownKit.shade(raw, 0.85 + 0.15 * float(posmod(floori(p.z / 0.32 + 40.0), 2)))
	for inner: bool in [false, true]:
		var m := b._mark()
		_shell(b.kit, inner)
		b.paint_from(m.x, inside if inner else outside, TownKit.WOOD)
	# gunwale caps and the transom
	var gun := PackedVector3Array()
	for i in 23:
		var t := i / 22.0
		gun.append(Vector3(_half_w(t) * 0.95, _sheer(t) + 0.015, (t - 0.5) * L))
	for s: float in [-1.0, 1.0]:
		for i in 22:
			var a := Vector3(gun[i].x * s, gun[i].y, gun[i].z)
			var c := Vector3(gun[i + 1].x * s, gun[i + 1].y, gun[i + 1].z)
			if a.distance_to(c) < 1e-3:
				continue
			b.beam(a, c, 0.045, timber_dark, TownKit.WOOD, 5)
	var tw := _half_w(0.0)
	var s0 := _sheer(0.0)
	var k0 := _keel(0.0)
	b.box(tw * 2.0, s0 - k0 - 0.05, 0.06, Vector3(0.0, (s0 + k0) * 0.5 + 0.02, -L * 0.5 + 0.03), func(p: Vector3) -> Color: return stripe if p.y > s0 - 0.14 else paint)
	# stem post, rising past the bow
	b.beam(Vector3(0.0, 0.1, L * 0.5 - 0.2), Vector3(0.0, _sheer(1.0) + 0.16, L * 0.5 + 0.02), 0.06, timber_dark)
	# thwarts, the oars across them, a coil of painter at the bow and a bailer
	for t: float in [0.26, 0.5, 0.72]:
		b.box(_half_w(t) * 0.9 * 2.0, 0.05, 0.28, Vector3(0.0, _sheer(t) - 0.2, (t - 0.5) * L), TownKit.shade(raw, 1.05), 0.015)
	for s: float in [-1.0, 1.0]:
		b.cyl(0.03, 0.03, 3.4, Vector3(s * 0.32, 0.58, -0.1), timber, 6, TownKit.WOOD, PI * 0.5, 0.0, true, s * 0.05)
		b.box(0.16, 0.02, 0.62, Vector3(s * 0.32 - s * 0.08, 0.58, -0.1 - 1.55), timber, 0.0, TownKit.WOOD, 0.0, s * 0.05)
	b.torus(0.16, 0.035, 5, 12, Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0.0, _sheer(0.84) - 0.25, (0.84 - 0.5) * L)), TownKit.lin("#cdb98a"))
	b.cyl(0.12, 0.09, 0.14, Vector3(0.25, 0.2, -0.9), TownKit.lin("#8a6440"), 8)
	return b.commit()


static func _half_w(t: float) -> float:
	return BOAT_B * 0.5 * pow(sin(PI * clampf(0.13 + t * 0.87, 0.0, 1.0)), 0.55)


static func _sheer(t: float) -> float:
	return 0.62 + 0.16 * pow(2.0 * t - 1.0, 2.0) + 0.07 * t


static func _keel(t: float) -> float:
	return 0.14 * pow(absf(2.0 * t - 1.0), 3.0)


## The hull's skin, outside or in: rings of the midship section swept stem to stern.
static func _shell(k: MeshKit, inner: bool) -> void:
	var nu := 22
	var nv := 12
	var v0 := k.verts.size()
	var i0 := k.indices.size()
	for i in nu + 1:
		var t := float(i) / nu
		var w := _half_w(t) * (0.9 if inner else 1.0)
		var g := _sheer(t) - (0.02 if inner else 0.0)
		var kk := _keel(t) + (0.07 if inner else 0.0)
		for j in nv + 1:
			var th := float(j) / nv * PI
			var s := pow(sin(th), 0.62)
			k.add_vertex(Vector3(w * cos(th), g - (g - kk) * s, (t - 0.5) * BOAT_L), Vector3.UP)
	for i in nu:
		for j in nv:
			var a := v0 + i * (nv + 1) + j
			var c := a + nv + 1
			if inner:
				k.tri(a, a + 1, c)
				k.tri(a + 1, c + 1, c)
			else:
				k.tri(a, c, a + 1)
				k.tri(a + 1, c, c + 1)
	k.recompute_normals(v0, i0)
