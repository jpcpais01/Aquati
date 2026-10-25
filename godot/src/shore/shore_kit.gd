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


# ------------------------------------------------------------------ chests

## A plunder chest's height and depth (its lid is hinged at (0, H, -D / 2)).
const CHEST_W := 0.86
const CHEST_H := 0.44
const CHEST_D := 0.54


## The chest's body: banded planks, a dark plinth and a gilt lock plate.
static func chest_body() -> ArrayMesh:
	var b := TownKit.new(5)
	var wood := TownKit.lin("#6a3f22")
	var W := CHEST_W
	var H := CHEST_H
	var D := CHEST_D
	b.box(W, H, D, Vector3(0.0, H * 0.5, 0.0), func(p: Vector3) -> Color: return TownKit.shade(wood, 0.85 + 0.15 * float(posmod(floori((p.y + 1.0) / 0.11), 2))), 0.03)
	for x: float in [-W * 0.36, W * 0.36]:
		b.box(0.07, H + 0.01, D + 0.02, Vector3(x, H * 0.5, 0.0), TownKit.lin("#2c2a28"), 0.01, TownKit.IRON)
	b.box(W + 0.02, 0.05, D + 0.02, Vector3(0.0, 0.03, 0.0), TownKit.lin("#3a2414"), 0.01)
	b.box(0.13, 0.16, 0.05, Vector3(0.0, H - 0.07, D * 0.5 + 0.02), TownKit.lin("#d8a640"), 0.02, TownKit.GILT)
	return b.commit()


## The lid, curved over like a barrel top, its hinge at the origin.
static func chest_lid() -> ArrayMesh:
	var b := TownKit.new(6)
	var wood := TownKit.lin("#6a3f22")
	var D := CHEST_D
	b.half_cyl(D * 0.5, CHEST_W, Transform3D(Basis.from_scale(Vector3(1.0, 0.62, 1.0)), Vector3(0.0, 0.0, D * 0.5)),
			func(p: Vector3) -> Color: return TownKit.shade(wood, 0.95 + 0.1 * sin(p.x * 30.0)), 12)
	for x: float in [-CHEST_W * 0.36, CHEST_W * 0.36]:
		b.half_cyl(D * 0.5 + 0.012, 0.075, Transform3D(Basis.from_scale(Vector3(1.0, 0.64, 1.0)), Vector3(x, 0.0, D * 0.5)), TownKit.lin("#2c2a28"), 12, TownKit.IRON)
	b.box(0.12, 0.14, 0.04, Vector3(0.0, 0.0, D + 0.01), TownKit.lin("#d8a640"), 0.015, TownKit.GILT)
	return b.commit()


# ------------------------------------------------------------------ buried treasure

## What marks a treasure map's X on the ground (the web's buildDigMarks): two
## driftwood sticks crossed on the sand and a little cairn of stones a stride
## off. Local space, the X at the origin.
static func dig_marks(seed_value: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var b := TownKit.new(seed_value)
	var drift := TownKit.lin("#9c8466")
	for a: float in [PI * 0.25, -PI * 0.25]:
		var len := 1.5 + rng.randf() * 0.2
		var s := Vector3(sin(a), 0.0, cos(a)) * len * 0.5
		b.beam(Vector3(-s.x, 0.05, -s.z), Vector3(s.x, 0.09, s.z), 0.045, func(p: Vector3) -> Color: return TownKit.shade(drift, 0.85 + 0.25 * absf(sin(p.x * 13.0 + p.z * 11.0))))
	# the cairn
	var y := 0.0
	for i in 5:
		var r := 0.26 - i * 0.04 + rng.randf() * 0.03
		var m := b._mark()
		b.kit.sphere(Transform3D(Basis(Vector3.UP, rng.randf() * 3.0).scaled(Vector3(1.1, 0.7, 1.0)), Vector3(1.55 + (rng.randf() - 0.5) * 0.08, y + r * 0.6, 0.35 + (rng.randf() - 0.5) * 0.08)), r, 5, 3)
		b.facet(m.x, m.y)
		b.paint_from(m.x, TownKit.shade(TownKit.lin("#8d8a84"), 0.75 + rng.randf() * 0.4), TownKit.WOOD)
		y += r * 1.15
	return b.commit()


## The hole as it's dug (the web's holeGeometry): dark damp sand at the
## bottom, a lip of dry sand thrown up round it. It grows by scale.
static func dig_hole() -> ArrayMesh:
	var b := TownKit.new(3)
	var prof := PackedVector2Array([Vector2(0.0, -0.42), Vector2(0.35, -0.4), Vector2(0.62, -0.25), Vector2(0.8, -0.02), Vector2(0.95, 0.1), Vector2(1.15, 0.06), Vector2(1.35, 0.0)])
	var dry := TownKit.lin("#d8c49a")
	var wet := TownKit.lin("#5a4630")
	b.lathe(prof, Transform3D.IDENTITY, func(p: Vector3) -> Color:
		var r := Vector2(p.x, p.z).length()
		var c := wet.lerp(dry, clampf((r - 0.35) / 0.5, 0.0, 1.0)) if r < 0.8 else dry
		return TownKit.shade(c, 0.9 + 0.1 * sin(p.x * 17.0 + p.z * 13.0)), 18)
	return b.commit()


## The heap of spoil (damp, fresh-dug sand, a shade darker than the web's so it reads on the grass) beside the hole: a loose, lumpy mound thrown off the spade.
static func dig_spoil() -> ArrayMesh:
	var b := TownKit.new(4)
	var m := b._mark()
	b.kit.sphere(Transform3D(Basis.from_scale(Vector3(1.4, 0.36, 1.0)), Vector3.ZERO), 0.75, 14, 7, 0.0, TAU, 0.0, PI * 0.5)
	for i in range(m.x, b.kit.verts.size()):
		var v := b.kit.verts[i]
		var a := atan2(v.z, v.x)
		var r := 1.0 + 0.13 * sin(a * 3.0 + 1.0) + 0.07 * sin(a * 7.0)
		b.kit.verts[i] = Vector3(v.x * r, v.y * (1.0 + 0.22 * sin(v.x * 7.0 + v.z * 5.0) + 0.12 * sin(v.x * 13.0 - v.z * 11.0)), v.z * r)
	b.kit.recompute_normals(m.x, m.y)
	b.paint_from(m.x, func(p: Vector3) -> Color: return TownKit.shade(TownKit.lin("#a3865a"), 0.88 + 0.14 * sin(p.x * 23.0 + p.z * 19.0)), TownKit.WOOD)
	return b.commit()


# ------------------------------------------------------------------ camps

## A camp of cutthroats in a glade (the web's buildCamp), laid down in world
## space on the ground: a fire in its ring of stones with a pot on the spit,
## log benches round it, a patched tent with its mouth to the fire, their
## plunder stacked against it, a rack of blades and the pole for their
## colours. Returns {mesh, fire, chest, chest_yaw, flag_top, seats, posts,
## blocks}: where its people sit and stand (Vector3 x, z, yaw) and what's
## solid (Vector3 x, z, r).
static func camp(site: Dictionary, ground: Callable, seed_value: int) -> Dictionary:
	var rnd := Mulberry32.new(seed_value)
	var b := TownKit.new(seed_value)
	var sx := float(site.x)
	var sz := float(site.z)
	var yaw := float(site.yaw)
	var cy := cos(yaw)
	var sy := sin(yaw)
	# the camp's frame: +z toward the sea (the tent's mouth), +x to its left
	var W := func(lx: float, lz: float) -> Vector3: return Vector3(sx + lx * cy + lz * sy, 0.0, sz - lx * sy + lz * cy)
	var at := func(lx: float, lz: float, lift := 0.0) -> Vector3:
		var p: Vector3 = W.call(lx, lz)
		return Vector3(p.x, float(ground.call(p.x, p.z)) + lift, p.z)
	var g := func(p: Vector3) -> float: return float(ground.call(p.x, p.z))
	var blocks: Array[Vector3] = []
	var block := func(lx: float, lz: float, r: float) -> void:
		var p: Vector3 = W.call(lx, lz)
		blocks.append(Vector3(p.x, p.z, r))
	var timber := TownKit.lin("#5a3d26")
	var timber_dark := TownKit.lin("#3e2a1a")

	# the fire: a ring of stones, a cone of burning logs, an ember bed and a pot on the spit
	for i in 10:
		var a := i / 10.0 * TAU + rnd.next() * 0.2
		var s := 0.15 + rnd.next() * 0.06
		var m := b._mark()
		var pos: Vector3 = at.call(cos(a) * 0.72, sin(a) * 0.72, s * 0.35)
		b.kit.sphere(Transform3D(Basis(Vector3.UP, rnd.next() * TAU) * Basis.from_scale(Vector3(1.2, 0.75, 1.0)), pos), s, 5, 3)
		b.facet(m.x, m.y)
		b.paint_from(m.x, TownKit.shade(TownKit.lin("#8d8a84"), 0.8 + rnd.next() * 0.35), TownKit.WOOD)
	var fire: Vector3 = at.call(0.0, 0.0)
	var fy := fire.y
	var char_col := TownKit.lin("#1b1512")
	for i in 5:
		var a := i / 5.0 * TAU + 0.3
		var foot: Vector3 = W.call(cos(a) * 0.48, sin(a) * 0.48)
		foot.y = fy + 0.02
		var tip: Vector3 = W.call(cos(a) * 0.08, sin(a) * 0.08)
		tip.y = fy + 0.62
		b.beam(foot, tip, 0.05, func(p: Vector3) -> Color: return char_col if p.y > fy + 0.3 else timber_dark)
	b.ball(0.42, fire + Vector3(0.0, 0.02, 0.0), Color(2.4, 0.75, 0.18), TownKit.GLOW, Vector3(1.0, 0.22, 1.0))
	var across: Vector3 = W.call(1.0, 0.0) - W.call(0.0, 0.0)
	for s: float in [-1.0, 1.0]:
		var foot: Vector3 = W.call(s * 0.95, 0.0)
		foot.y = g.call(foot) - 0.1
		var top := foot + Vector3(0.0, 1.15, 0.0)
		b.beam(foot, top, 0.04, timber)
		b.beam(top, top + across * 0.14 * s + Vector3(0.0, 0.16, 0.0), 0.03, timber)
		b.beam(top, top - across * 0.14 * s + Vector3(0.0, 0.16, 0.0), 0.03, timber)
	var spit_a: Vector3 = W.call(-1.05, 0.0)
	var spit_b: Vector3 = W.call(1.05, 0.0)
	b.beam(Vector3(spit_a.x, fy + 1.12, spit_a.z), Vector3(spit_b.x, fy + 1.12, spit_b.z), 0.025, TownKit.lin("#4a4642"), TownKit.IRON)
	var pot := PackedVector2Array([Vector2(0.02, -0.2), Vector2(0.17, -0.18), Vector2(0.22, -0.06), Vector2(0.2, 0.08), Vector2(0.17, 0.1)])
	b.lathe(pot, Transform3D(Basis.IDENTITY, at.call(0.0, 0.0, 0.82)), TownKit.lin("#2a2826"), 12, TownKit.IRON)
	block.call(0.0, 0.0, 0.95)

	# log benches round the fire, sat on by whoever isn't busy
	var seats: Array[Vector3] = []
	var angles := [0.95, 2.4, 3.85, 5.3].slice(0, 3 + floori(rnd.next() * 2.0))
	for a: float in angles:
		var r := 2.25
		var cx := cos(a) * r
		var cz := sin(a) * r
		var p: Vector3 = at.call(cx, cz)
		var length := 1.9
		var py := p.y
		# weathered driftwood: grey-brown bark, paler where it's been sat on
		b.cyl(0.2, 0.22, length, p + Vector3(0.0, 0.14, 0.0), func(q: Vector3) -> Color:
			return TownKit.shade(TownKit.lin("#a08a6c") if q.y > py + 0.3 else TownKit.lin("#8a6d4e"), 0.85 + 0.25 * absf(sin(q.x * 9.0 + q.z * 7.0))),
			9, TownKit.WOOD, 0.0, PI * 0.5, true, yaw - a + PI * 0.5)
		for e: float in [-1.0, 1.0]:
			var ep: Vector3 = W.call(cx - sin(a) * e * length * 0.3, cz + cos(a) * e * length * 0.3)
			blocks.append(Vector3(ep.x, ep.z, 0.42))
		# sit facing the fire
		var seat: Vector3 = W.call(cx * 0.97, cz * 0.97)
		seats.append(Vector3(seat.x, seat.z, atan2(sx - seat.x, sz - seat.z)))

	# the tent: patched canvas over a ridge pole, its mouth to the fire
	var TZ := -4.6
	var span := 1.4
	var rise := 1.95
	var tlen := 3.2
	var canvas := TownKit.lin("#d9ccaa")
	var patch := TownKit.lin("#b59a6c")
	var slant := Vector2(span, rise).length()
	var lean := atan2(span, rise)
	var ty := -INF
	for uv: Vector2 in [Vector2(-1.2, -1.4), Vector2(1.2, -1.4), Vector2(-1.2, 1.4), Vector2(1.2, 1.4), Vector2.ZERO]:
		ty = maxf(ty, g.call(W.call(uv.x, TZ + uv.y)))
	ty -= 0.08
	var tc: Vector3 = W.call(0.0, TZ)
	var frame := Transform3D(Basis(Vector3.UP, yaw), Vector3(tc.x, ty, tc.z))
	for s: float in [-1.0, 1.0]:
		var xf := frame * Transform3D(Basis(Vector3.BACK, s * lean), Vector3(s * span * 0.5, rise * 0.5, 0.0))
		b.box_xf(xf, Vector3(0.035, slant, tlen), func(p: Vector3) -> Color:
			var u := p.y - ty
			var dirt := clampf(1.0 - u / 0.6, 0.0, 1.0) * 0.25
			var pz := patch if posmod(floori((p.x + p.z) * 1.7), 3) == 0 and u > 0.6 and u < 1.4 else canvas
			return TownKit.shade(pz, 1.0 - dirt))
	b.quad(frame * Vector3(-span, 0.0, -tlen * 0.5), frame * Vector3(span, 0.0, -tlen * 0.5), frame * Vector3(0.0, rise, -tlen * 0.5), frame * Vector3(0.0, rise, -tlen * 0.5), TownKit.shade(canvas, 0.92), TownKit.WOOD, true)
	# ridge pole, the front pole, and a bedroll in the mouth of the tent
	var ridge_a: Vector3 = W.call(0.0, TZ - tlen * 0.5 - 0.15)
	ridge_a.y = ty + rise + 0.02
	var ridge_b: Vector3 = W.call(0.0, TZ + tlen * 0.5 + 0.3)
	ridge_b.y = ty + rise + 0.02
	b.beam(ridge_a, ridge_b, 0.04, timber_dark)
	var front: Vector3 = W.call(0.0, TZ + tlen * 0.5 + 0.2)
	front.y = ty - 0.1
	b.beam(front, Vector3(ridge_b.x, ty + rise + 0.04, ridge_b.z), 0.035, timber_dark)
	b.cyl(0.17, 0.17, 1.2, at.call(0.4, TZ + 0.9, 0.17), TownKit.lin("#7a4a3a"), 8, TownKit.WOOD, 0.0, PI * 0.5, true, yaw + 1.2)
	block.call(0.0, TZ, 1.75)
	block.call(0.0, TZ + 1.2, 1.2)

	# the plunder: crates and barrels against the tent, a rack of blades
	for st: Array in [[2.1, TZ + 0.6, true, 0.0], [2.25, TZ - 0.3, false, 0.0], [2.0, TZ + 0.6, true, 0.62], [-2.15, TZ + 0.2, false, 0.0], [-2.3, TZ - 0.6, false, 0.0]]:
		var crate_ := bool(st[2])
		var lift := float(st[3])
		var p: Vector3 = at.call(float(st[0]), float(st[1]), (0.31 if crate_ else 0.43) + lift - 0.04)
		var xf := Transform3D(Basis(Vector3.UP, yaw + (rnd.next() - 0.5) * 0.6), p)
		if crate_:
			b.crate(xf, 0.62)
		else:
			b.barrel(xf, 0.86, 0.32)
		if lift == 0.0:
			block.call(float(st[0]), float(st[1]), 0.45)
	var rack_a: Vector3 = W.call(-2.6, -1.3)
	var rack_b: Vector3 = W.call(-2.6, 0.1)
	for p: Vector3 in [rack_a, rack_b]:
		var y0: float = g.call(p) - 0.1
		b.beam(Vector3(p.x, y0, p.z), Vector3(p.x, y0 + 1.25, p.z), 0.045, timber_dark)
	var ry0: float = g.call(rack_a) + 1.0
	b.beam(Vector3(rack_a.x, ry0, rack_a.z), Vector3(rack_b.x, ry0, rack_b.z), 0.03, timber)
	for i in 3:
		var p := rack_a.lerp(rack_b, 0.22 + i * 0.28)
		b.box(0.03, 0.85, 0.06, Vector3(p.x, ry0 - 0.1, p.z), TownKit.lin("#c7ced6"), 0.0, TownKit.IRON, 0.0, yaw, (rnd.next() - 0.5) * 0.15)
	block.call(-2.6, -0.6, 0.6)

	# the jolly roger's pole
	var pole: Vector3 = W.call(2.6, TZ + 2.2)
	var pole_y: float = g.call(pole) - 0.2
	b.beam(Vector3(pole.x, pole_y, pole.z), Vector3(pole.x, pole_y + 5.4, pole.z), 0.06, timber_dark)
	block.call(2.6, TZ + 2.2, 0.2)

	var chest: Vector3 = W.call(-1.25, TZ + 2.0)
	chest.y = g.call(chest) - 0.02
	block.call(-1.25, TZ + 2.0, 0.55)

	var posts: Array[Vector3] = []
	for pd: Array in [[1.4, TZ + 1.9, 0.4], [0.0, 4.2, 0.0], [-2.1, -2.2, -1.2], [3.2, 1.6, 0.9]]:
		var p: Vector3 = W.call(float(pd[0]), float(pd[1]))
		posts.append(Vector3(p.x, p.z, yaw + float(pd[2])))
	return {
		"mesh": b.commit(),
		"fire": fire,
		"chest": chest,
		"chest_yaw": yaw + 0.25,
		"flag_top": Vector3(pole.x, pole_y + 5.3, pole.z),
		"seats": seats,
		"posts": posts,
		"blocks": blocks,
	}


## A camp's colours: a 1.7 m flag hung from its masthead, the fly along +x.
static func flag() -> ArrayMesh:
	var w := 1.7
	var h := 1.06
	var cols := 10
	var rows := 3
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	for j in rows + 1:
		for i in cols + 1:
			var u := float(i) / cols
			var v := float(j) / rows
			pos.append(Vector3(u * w, -v * h, 0.0))
			uv.append(Vector2(u, v))
	for j in rows:
		for i in cols:
			var a := j * (cols + 1) + i
			idx.append_array([a, a + 1, a + cols + 2, a, a + cols + 2, a + cols + 1])
	var nrm := PackedVector3Array()
	nrm.resize(pos.size())
	nrm.fill(Vector3.BACK)
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	arr[Mesh.ARRAY_NORMAL] = nrm
	arr[Mesh.ARRAY_TEX_UV] = uv
	arr[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return mesh
