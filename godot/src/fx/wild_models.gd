class_name WildModels
## The fifteen island beasts, sculpted (the web game's src/fx/wild/models.ts).
## Each is built nose to +z, standing on y = 0, at life size in metres (the
## game scales them up a touch to read from the deck). Every part is tagged
## with the joint that moves it (see WildSculpt), and every vertex carries two
## colourings, so one mesh dresses a whole species: buck and doe, scarlet and
## blue-and-gold, sow and striped piglet.

const S := preload("res://src/fx/wild_rig.gd")
const BODY := S.BODY
const LEG := S.LEG
const TAIL := S.TAIL
const WING := S.WING
const SPEC_A := S.SPEC_A
const SPEC_B := S.SPEC_B
const AX_X := S.AX_X
const AX_Y := S.AX_Y
const AX_Z := S.AX_Z
const TUCK_A := S.TUCK_A
const W := Color(0.9, 0.9, 0.88)


## Every species' meshes in Wildlife's species order, each as its cuts [full, light, speck].
static func all() -> Array:
	var out := []
	for k in 15:
		var list := []
		for g in (2 if k == 1 else 1):
			list.append([build(k, g, S.FULL), build(k, g, S.LIGHT), build(k, g, S.SPECK)])
		out.append(list)
	return out


## Species `k`'s mesh `g` (a deer: 1 the stag), at a level of detail (WildSculpt.FULL ..).
static func build(k: int, g: int, lod: int) -> ArrayMesh:
	return sculpt(k, g, lod).mesh()


static func sculpt(k: int, g: int, lod: int) -> WildSculpt:
	match k:
		0: return goat(lod)
		1: return deer(g == 1, lod)
		2: return boar(lod)
		3: return monkey(lod)
		4: return macaw(lod)
		5: return pelican(lod)
		6: return booby(lod)
		7: return flamingo(lod)
		8: return egret(lod)
		9: return iguana(lod)
		10: return tortoise(lod)
		11: return seal(lod)
		12: return crab(lod)
		13: return butterfly(lod)
	return hummingbird(lod)


static func V(x: float, y: float, z: float) -> Vector3:
	return Vector3(x, y, z)


static func R(p: Vector3, rx: float, ry := -1.0) -> Array:
	return S.ring(p, rx, ry)


static func M(p: Vector3, s: float) -> Vector3:
	return Vector3(p.x * s, p.y, p.z)


static func H(h: int) -> Color:
	return S.hex(h)


static func sm(a: float, b: float, x: float) -> float:
	return MathX.smooth(a, b, x)


static func eye() -> Callable:
	return S.flat(H(0x0c0a08))


## Painted by height: hooves and lower legs darker than the coat above.
static func shin(coat: Color, low: Color, alt_coat := Color(-1, 0, 0), alt_low := Color(-1, 0, 0), knee := 0.25, hoof := 0.05, hoof_c := Color(-1, 0, 0)) -> Callable:
	var ac := coat if alt_coat.r < 0.0 else alt_coat
	var al := low if alt_low.r < 0.0 else alt_low
	var hc := H(0x2a2420) if hoof_c.r < 0.0 else hoof_c
	return func(p: Vector3, _n: Vector3, _t: float) -> Array:
		if p.y < hoof:
			return [hc, hc]
		var k := MathX.smooth(knee, knee * 0.5, p.y)
		return [coat.lerp(low, k), ac.lerp(al, k)]


## The size (m) under which the lighter cuts leave a piece off, for a beast this big.
static func _tiny(size: float) -> float:
	return size * 0.008


# ---------------------------------------------------------------- goat

static func goat(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.68, 0.3), lod, _tiny(1.3))
	var brown := H(0x8a5632)
	var tan := H(0xc7a173)
	var dark := H(0x3e2a1c)
	var white := H(0xece6d8)
	var cream := H(0xd8ccb4)
	# A: a brown goat with a dark dorsal stripe; B: a white one with a tan face
	var coat := func(p: Vector3, n: Vector3, _t: float) -> Array:
		var stripe := n.y > 0.82 and absf(p.x) < 0.05
		var k := MathX.smooth(-0.4, 0.3, n.y)
		return [dark if stripe else tan.lerp(brown, k), cream.lerp(white, k)]
	s.body().tube([
		R(V(0, 0.74, -0.52), 0.07, 0.08), R(V(0, 0.73, -0.44), 0.16, 0.2), R(V(0, 0.7, -0.22), 0.2, 0.26),
		R(V(0, 0.7, 0.06), 0.21, 0.27), R(V(0, 0.74, 0.28), 0.18, 0.24), R(V(0, 0.8, 0.4), 0.12, 0.15),
	], coat, 10, 0.5, 0.4)
	# neck: bends from the chest, the head following it all the way
	s.body(S.along(V(0, 0.8, 0.34), V(0, 1.07, 0.52), 0.05, 1.0)).tube([R(V(0, 0.8, 0.34), 0.09, 0.1), R(V(0, 0.96, 0.46), 0.075, 0.08), R(V(0, 1.07, 0.52), 0.06, 0.065)], coat, 8, 0.2, 0.2)
	var muz := H(0x9a6a40)
	var face := func(p: Vector3, n: Vector3, _t: float) -> Array:
		var muzzle := MathX.smooth(0.66, 0.76, p.z)
		return [tan.lerp(brown, MathX.smooth(-0.3, 0.4, n.y)).lerp(dark, muzzle * 0.6), tan.lerp(muz, muzzle * 0.7)]
	s.body(1.0).tube([R(V(0, 1.12, 0.5), 0.065, 0.07), R(V(0, 1.11, 0.6), 0.058, 0.064), R(V(0, 1.04, 0.72), 0.042, 0.046), R(V(0, 1.0, 0.77), 0.03, 0.032)], face, 8, 0.6, 0.7)
	s.blob(V(0, 1.0, 0.71), V(0.022, 0.03, 0.03), S.flat(dark, H(0x6a4a30)), 6, 4) # beard
	s.tube([R(V(0, 0.99, 0.7), 0.018), R(V(0, 0.9, 0.68), 0.006)], S.flat(dark, H(0x6a4a30)), 5, 0.2, 0.6)
	for sd: float in [1.0, -1.0]:
		s.body(1.0).blob(M(V(0.056, 1.13, 0.6), sd), V(0.014, 0.014, 0.014), S.flat(H(0xb8902a)), 6, 4)
		s.blob(M(V(0.064, 1.135, 0.603), sd), V(0.007, 0.009, 0.007), eye(), 5, 3)
		# horns sweep up and back
		s.tube([R(M(V(0.035, 1.17, 0.55), sd), 0.022), R(M(V(0.05, 1.25, 0.52), sd), 0.018), R(M(V(0.07, 1.31, 0.44), sd), 0.012), R(M(V(0.09, 1.3, 0.36), sd), 0.005)], S.flat(H(0x5a5048), H(0x8a7a64)), 6, 0.2, 0.5)
		# ears flick out sideways
		s.joint(SPEC_A, M(V(0.05, 1.13, 0.55), sd), 1.0, sd, 0.0, 1.0)
		s.slab([M(V(0.05, 1.14, 0.56), sd), M(V(0.15, 1.12, 0.54), sd), M(V(0.17, 1.1, 0.5), sd), M(V(0.06, 1.11, 0.52), sd)], 0.012, face, S.flat(H(0xd8a890)), V(0, 1, 0))
	var lg := shin(brown, dark, white, cream, 0.3, 0.05)
	for sd: float in [1.0, -1.0]:
		s.leg([R(M(V(0.1, 0.66, 0.3), sd), 0.07), R(M(V(0.1, 0.32, 0.32), sd), 0.048), R(M(V(0.1, 0.07, 0.31), sd), 0.036), R(M(V(0.1, 0.0, 0.33), sd), 0.038)], PI / 2.0 if sd > 0.0 else PI * 1.5, lg)
		s.leg([R(M(V(0.11, 0.68, -0.36), sd), 0.085), R(M(V(0.11, 0.34, -0.44), sd), 0.05), R(M(V(0.1, 0.07, -0.38), sd), 0.036), R(M(V(0.1, 0.0, -0.36), sd), 0.038)], 0.0 if sd > 0.0 else PI, lg)
	s.joint(TAIL, V(0, 0.84, -0.48)).tube([R(V(0, 0.84, -0.48), 0.035), R(V(0, 0.92, -0.54), 0.03), R(V(0, 0.97, -0.53), 0.012)], S.flat(dark, cream), 6, 0.3, 0.6)
	return s


# ---------------------------------------------------------------- deer

static func deer(stag: bool, lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.82, 0.32), lod, _tiny(1.5))
	var red := H(0x9a5a30)
	var belly := H(0xe9dcc6)
	var dark := H(0x3a2418)
	var spot_c := H(0xf2e6d0)
	var fawn := H(0xa8683a)
	# A: summer red coat; B: a dappled fawn
	var coat := func(p: Vector3, n: Vector3, _t: float) -> Array:
		var k := MathX.smooth(-0.45, 0.15, n.y)
		var a := belly.lerp(red, k)
		var spot := n.y > 0.1 and sin(p.x * 61.0 + p.z * 13.0) * sin(p.z * 57.0 - p.y * 31.0) > 0.55 and absf(p.x) > 0.04
		return [a, spot_c if spot else belly.lerp(fawn, k)]
	s.body().tube([
		R(V(0, 0.88, -0.48), 0.06, 0.07), R(V(0, 0.9, -0.4), 0.15, 0.17), R(V(0, 0.88, -0.16), 0.17, 0.2),
		R(V(0, 0.89, 0.1), 0.17, 0.21), R(V(0, 0.93, 0.3), 0.14, 0.18), R(V(0, 0.99, 0.4), 0.09, 0.12),
	], coat, 10, 0.5, 0.4)
	s.body(S.along(V(0, 0.98, 0.36), V(0, 1.3, 0.52), -0.15, 1.0)).tube([R(V(0, 0.98, 0.36), 0.08, 0.1), R(V(0, 1.14, 0.46), 0.065, 0.075), R(V(0, 1.3, 0.52), 0.055, 0.06)], coat, 8, 0.2, 0.2)
	var face := func(p: Vector3, n: Vector3, _t: float) -> Array:
		var nose := MathX.smooth(0.75, 0.8, p.z)
		var c := belly.lerp(red, MathX.smooth(-0.4, 0.3, n.y)).lerp(dark, nose)
		return [c, c]
	s.body(1.0).tube([R(V(0, 1.34, 0.49), 0.06, 0.065), R(V(0, 1.32, 0.6), 0.052, 0.058), R(V(0, 1.24, 0.73), 0.032, 0.036), R(V(0, 1.21, 0.78), 0.024, 0.026)], face, 8, 0.6, 0.8)
	for sd: float in [1.0, -1.0]:
		s.body(1.0).blob(M(V(0.05, 1.35, 0.6), sd), V(0.013, 0.015, 0.016), eye(), 6, 4)
		s.joint(SPEC_A, M(V(0.04, 1.38, 0.5), sd), 1.0, sd, 0.0, 1.0)
		s.slab([M(V(0.04, 1.38, 0.51), sd), M(V(0.1, 1.47, 0.49), sd), M(V(0.15, 1.52, 0.47), sd), M(V(0.15, 1.48, 0.45), sd), M(V(0.07, 1.4, 0.48), sd)], 0.012, face, S.flat(H(0xe0b8a8)), V(0, 0, 1))
		if stag:
			# a young stag's first branched antlers
			var bone := S.flat(H(0xc8b490))
			var a := M(V(0.03, 1.4, 0.53), sd)
			var b := M(V(0.1, 1.55, 0.5), sd)
			var c := M(V(0.14, 1.72, 0.44), sd)
			s.body(1.0).tube([R(a, 0.02), R(b, 0.016), R(c, 0.01), R(M(V(0.15, 1.8, 0.4), sd), 0.004)], bone, 5, 0.2, 0.5)
			s.tube([R(b, 0.012), R(M(V(0.12, 1.64, 0.6), sd), 0.007), R(M(V(0.13, 1.68, 0.64), sd), 0.003)], bone, 5, 0.2, 0.5)
			s.tube([R(c, 0.01), R(M(V(0.2, 1.8, 0.48), sd), 0.003)], bone, 5, 0.2, 0.5)
	var lg := shin(red, H(0x6a3a20), fawn, H(0x6a3a20), 0.35, 0.05, H(0x1e1814))
	for sd: float in [1.0, -1.0]:
		s.leg([R(M(V(0.09, 0.82, 0.3), sd), 0.05), R(M(V(0.09, 0.42, 0.32), sd), 0.03), R(M(V(0.09, 0.06, 0.31), sd), 0.022), R(M(V(0.09, 0.0, 0.33), sd), 0.024)], PI / 2.0 if sd > 0.0 else PI * 1.5, lg)
		s.leg([R(M(V(0.1, 0.84, -0.34), sd), 0.075), R(M(V(0.1, 0.44, -0.46), sd), 0.035), R(M(V(0.09, 0.06, -0.38), sd), 0.022), R(M(V(0.09, 0.0, -0.36), sd), 0.024)], 0.0 if sd > 0.0 else PI, lg)
	# the white flag under the tail
	var flag := func(_p: Vector3, n: Vector3, _t: float) -> Array: return [red, fawn] if n.y > 0.2 else [W, W]
	s.joint(TAIL, V(0, 0.95, -0.48)).tube([R(V(0, 0.95, -0.48), 0.045, 0.03), R(V(0, 0.88, -0.55), 0.04, 0.025), R(V(0, 0.81, -0.58), 0.015)], flag, 6, 0.3, 0.6)
	return s


# ---------------------------------------------------------------- boar

static func boar(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.5, 0.32), lod, _tiny(1.1))
	var bristle := H(0x6a5646)
	var grey := H(0x846e5a)
	var rufous := H(0x9a6238)
	var stripe := H(0xe0c89a)
	var mane_c := H(0x3a2e24)
	var pale := H(0xc89a68)
	# A: a bristly sow; B: a piglet in its humbug stripes
	var coat := func(p: Vector3, n: Vector3, _t: float) -> Array:
		var k := MathX.smooth(-0.3, 0.8, n.y)
		var mane := 0.6 if n.y > 0.85 else 0.0
		var band := p.z < 0.4 and n.y < 0.85 and cos(atan2(n.y, absf(n.x)) * 5.0) > 0.2
		return [grey.lerp(bristle, k).lerp(mane_c, mane), stripe if band else pale.lerp(rufous, k)]
	s.body().tube([
		R(V(0, 0.5, -0.52), 0.1, 0.12), R(V(0, 0.52, -0.42), 0.19, 0.22), R(V(0, 0.55, -0.12), 0.22, 0.26),
		R(V(0, 0.59, 0.16), 0.22, 0.28), R(V(0, 0.57, 0.34), 0.18, 0.23), R(V(0, 0.53, 0.44), 0.13, 0.17),
	], coat, 10, 0.5, 0.3)
	var snout := H(0x9a7a6a)
	var snout_b := H(0xc89a8a)
	var head := func(p: Vector3, n: Vector3, t: float) -> Array:
		var c: Array = coat.call(p, n, t)
		var k := MathX.smooth(0.72, 0.8, p.z)
		return [(c[0] as Color).lerp(snout, k), (c[1] as Color).lerp(snout_b, k)]
	s.body(1.0).tube([R(V(0, 0.56, 0.38), 0.15, 0.17), R(V(0, 0.5, 0.55), 0.12, 0.13), R(V(0, 0.41, 0.71), 0.07, 0.068), R(V(0, 0.37, 0.8), 0.058, 0.052)], head, 9, 0.2, 0.15)
	s.blob(V(0, 0.37, 0.815), V(0.05, 0.045, 0.012), S.flat(H(0x6a4a44), H(0xa06a64)), 8, 3) # the snout's disc
	for sd: float in [1.0, -1.0]:
		s.body(1.0).blob(M(V(0.075, 0.55, 0.56), sd), V(0.01, 0.012, 0.012), eye(), 5, 3)
		s.tube([R(M(V(0.055, 0.37, 0.72), sd), 0.012), R(M(V(0.075, 0.42, 0.75), sd), 0.008), R(M(V(0.07, 0.45, 0.74), sd), 0.002)], S.flat(H(0xe8dcc0), H(0x9a7a6a)), 5, 0.2, 0.5)
		s.joint(SPEC_A, M(V(0.07, 0.66, 0.42), sd), 1.0, sd, 0.0, 1.0)
		s.slab([M(V(0.06, 0.66, 0.43), sd), M(V(0.12, 0.77, 0.38), sd), M(V(0.14, 0.66, 0.37), sd)], 0.014, S.flat(bristle, rufous), S.flat(H(0x7a5a4a)), V(0, 0, 1))
	var lg := shin(grey, bristle, rufous, H(0x6a4228), 0.2, 0.04, H(0x1a1410))
	for sd: float in [1.0, -1.0]:
		s.leg([R(M(V(0.1, 0.45, 0.28), sd), 0.065), R(M(V(0.1, 0.2, 0.3), sd), 0.038), R(M(V(0.1, 0.0, 0.31), sd), 0.032)], PI / 2.0 if sd > 0.0 else PI * 1.5, lg)
		s.leg([R(M(V(0.11, 0.46, -0.34), sd), 0.08), R(M(V(0.11, 0.24, -0.41), sd), 0.04), R(M(V(0.11, 0.0, -0.36), sd), 0.032)], 0.0 if sd > 0.0 else PI, lg)
	s.joint(TAIL, V(0, 0.56, -0.52), S.ramp(2, -0.52, -0.6)).tube([R(V(0, 0.56, -0.52), 0.016), R(V(0, 0.46, -0.58), 0.012), R(V(0, 0.37, -0.57), 0.02)], S.flat(bristle, rufous), 5, 0.3, 0.8)
	return s


# ---------------------------------------------------------------- capuchin

static func monkey(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.38, 0.18), lod, _tiny(0.8))
	s.lift = -0.05
	var fur := H(0x4a3424)
	var cream := H(0xead6b2)
	var gold := H(0x9a7444)
	var pale := H(0xf2e2c4)
	var body := func(p: Vector3, n: Vector3, _t: float) -> Array:
		# the cream mantle over the shoulders and throat
		var mantle := p.z > 0.1 and (n.y < 0.2 or n.z > 0.5)
		return [cream if mantle else fur, pale if mantle else gold]
	s.body().tube([R(V(0, 0.33, -0.21), 0.08), R(V(0, 0.34, -0.12), 0.12, 0.115), R(V(0, 0.36, 0.04), 0.125, 0.125), R(V(0, 0.38, 0.15), 0.105, 0.11), R(V(0, 0.4, 0.22), 0.07, 0.075)], body, 9, 0.5, 0.3)
	var cap_a := H(0x1e1610)
	var cap_b := H(0x5a4228)
	var face := func(_p: Vector3, n: Vector3, _t: float) -> Array:
		var cap := n.y > 0.55
		var front := n.z > 0.35 and not cap
		return [cap_a if cap else (cream if front else fur), cap_b if cap else (pale if front else gold)]
	s.body(1.0).blob(V(0, 0.47, 0.28), V(0.07, 0.074, 0.068), face, 10, 7)
	s.blob(V(0, 0.44, 0.335), V(0.036, 0.03, 0.03), S.flat(H(0xd8a888), H(0xe8c0a0)), 7, 4)
	for sd: float in [1.0, -1.0]:
		s.blob(M(V(0.066, 0.48, 0.27), sd), V(0.012, 0.022, 0.02), S.flat(H(0xc89a80)), 5, 3)
		s.blob(M(V(0.025, 0.47, 0.335), sd), V(0.009, 0.009, 0.006), eye(), 5, 3)
	var limb := S.flat(fur, gold)
	s.lift = 0.0
	for sd: float in [1.0, -1.0]:
		s.leg([R(M(V(0.08, 0.32, 0.15), sd), 0.048), R(M(V(0.09, 0.16, 0.19), sd), 0.037), R(M(V(0.085, 0.0, 0.17), sd), 0.032)], PI / 2.0 if sd > 0.0 else PI * 1.5, limb)
		s.leg([R(M(V(0.08, 0.28, -0.15), sd), 0.06), R(M(V(0.1, 0.15, -0.07), sd), 0.044), R(M(V(0.085, 0.0, -0.14), sd), 0.034)], 0.0 if sd > 0.0 else PI, limb)
	s.lift = -0.05
	# the long tail, curling at the tip
	s.joint(TAIL, V(0, 0.36, -0.2), S.ramp(2, -0.18, -0.75)).tube([
		R(V(0, 0.36, -0.2), 0.03), R(V(0, 0.4, -0.34), 0.026), R(V(0, 0.47, -0.5), 0.022), R(V(0, 0.54, -0.63), 0.019),
		R(V(0, 0.56, -0.74), 0.016), R(V(0, 0.5, -0.8), 0.014), R(V(0, 0.45, -0.76), 0.012),
	], limb, 6, 0.3, 0.8)
	return s


# ---------------------------------------------------------------- macaw

static func macaw(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.24, 0.1), lod, _tiny(0.9))
	s.lift = -0.07
	var red := H(0xd21c16)
	var yellow := H(0xf4c014)
	var blue := H(0x1c48c8)
	var gold := H(0xf2b014)
	var sky := H(0x1a6ad8)
	var green := H(0x3a9a40)
	var body := func(_p: Vector3, n: Vector3, _t: float) -> Array: return [red, sky if n.y > -0.15 else gold]
	s.body().blob(V(0, 0.22, 0), V(0.065, 0.07, 0.15), body, 9, 7)
	var face := func(p: Vector3, n: Vector3, _t: float) -> Array:
		var patch := absf(n.x) > 0.45 and p.z > 0.16
		var brow := n.y > 0.5 and p.z > 0.18
		return [W if patch else red, W if patch else (green if brow else (gold if n.y < -0.3 else sky))]
	s.body(1.0).blob(V(0, 0.275, 0.165), V(0.05, 0.056, 0.058), face, 9, 6)
	s.tube([R(V(0, 0.285, 0.205), 0.026, 0.028), R(V(0, 0.272, 0.245), 0.02, 0.024), R(V(0, 0.235, 0.258), 0.008), R(V(0, 0.215, 0.248), 0.003)], S.flat(H(0xe8dcc8), H(0x202020)), 6, 0.2, 0.4)
	s.tube([R(V(0, 0.248, 0.2), 0.02, 0.016), R(V(0, 0.238, 0.228), 0.012, 0.01)], S.flat(H(0x1a1a1a)), 5, 0.2, 0.5)
	for sd: float in [1.0, -1.0]:
		s.blob(M(V(0.042, 0.285, 0.185), sd), V(0.007, 0.008, 0.008), S.flat(H(0xe8e0c0)), 5, 3)
	# the long tail streams behind
	var tail_b := H(0x2a4ac0)
	s.joint(TAIL, V(0, 0.21, -0.12), S.ramp(2, -0.1, -0.5)).tube([R(V(0, 0.215, -0.12), 0.04, 0.014), R(V(0, 0.2, -0.3), 0.03, 0.01), R(V(0, 0.19, -0.48), 0.012, 0.006)],
			func(p: Vector3, _n: Vector3, _t: float) -> Array: return [blue if p.z < -0.38 else red, tail_b if p.z < -0.3 else sky], 6, 0.3, 0.8)
	var plum := H(0x8a3a5a)
	for sd: float in [1.0, -1.0]:
		# red coverts, a band of yellow, blue flight feathers (or blue over gold)
		var top := func(p: Vector3, _n: Vector3, _t: float) -> Array:
			var x := absf(p.x)
			return [red if x < 0.17 else (yellow if x < 0.25 else blue), sky if x < 0.28 else blue]
		var under := func(p: Vector3, _n: Vector3, _t: float) -> Array: return [red if absf(p.x) < 0.2 else plum, gold]
		s.joint(WING, M(V(0.05, 0.245, 0.04), sd), S.ramp(0, 0.06, 0.47), sd)
		s.slab([
			M(V(0.05, 0.245, 0.08), sd), M(V(0.2, 0.25, 0.07), sd), M(V(0.36, 0.245, 0.02), sd), M(V(0.47, 0.24, -0.06), sd),
			M(V(0.42, 0.24, -0.11), sd), M(V(0.3, 0.245, -0.11), sd), M(V(0.15, 0.245, -0.09), sd), M(V(0.05, 0.245, -0.06), sd),
		], 0.012, top, under, V(0, 1, 0))
		s.lift = 0.0
		s.leg([R(M(V(0.03, 0.1, 0.03), sd), 0.016), R(M(V(0.03, 0.04, 0.05), sd), 0.012), R(M(V(0.03, 0.0, 0.07), sd), 0.01)], 0.0 if sd > 0.0 else PI, S.flat(H(0x5a5a5a)))
		s.lift = -0.07
	return s


# ---------------------------------------------------------------- pelican

static func pelican(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.62, 0.22), lod, _tiny(1.4))
	s.lift = -0.2
	var grey := H(0x8a8278)
	var silver := H(0xb4ada2)
	var brown := H(0x8a7462)
	var back_b := H(0x8a7a66)
	var body := func(_p: Vector3, n: Vector3, _t: float) -> Array: return [silver if n.y > 0.2 else grey, back_b if n.y > 0.2 else brown]
	s.body().blob(V(0, 0.55, 0), V(0.17, 0.16, 0.36), body, 10, 7)
	s.tube([R(V(0, 0.56, -0.28), 0.1, 0.06), R(V(0, 0.55, -0.44), 0.05, 0.02)], S.flat(H(0x4a423a)), 6, 0.3, 0.5)
	var nape := H(0x5a3424)
	var throat := H(0xf0ead8)
	var neck := func(_p: Vector3, n: Vector3, _t: float) -> Array: return [nape if n.z < -0.2 else throat, brown]
	s.body(S.along(V(0, 0.62, 0.24), V(0, 0.9, 0.27))).tube([R(V(0, 0.62, 0.24), 0.065), R(V(0, 0.74, 0.29), 0.055), R(V(0, 0.84, 0.25), 0.05), R(V(0, 0.9, 0.27), 0.05)], neck, 8, 0.2, 0.2)
	s.body(1.0).blob(V(0, 0.92, 0.3), V(0.052, 0.056, 0.075), S.flat(H(0xf2e6b8), H(0x8a7058)), 8, 5)
	for sd: float in [1.0, -1.0]:
		s.blob(M(V(0.042, 0.935, 0.34), sd), V(0.008, 0.008, 0.008), S.flat(H(0xd8d0a0)), 5, 3)
	s.tube([R(V(0, 0.925, 0.36), 0.03, 0.018), R(V(0, 0.89, 0.58), 0.026, 0.013), R(V(0, 0.865, 0.72), 0.02, 0.012), R(V(0, 0.85, 0.745), 0.006)], S.flat(H(0x9a8a72)), 7, 0.2, 0.5)
	# the pouch opens downward from the bill
	s.joint(SPEC_A, V(0, 0.9, 0.36), 1.0, 0.0, 0.0, 1.0).tube([R(V(0, 0.89, 0.37), 0.026, 0.016), R(V(0, 0.85, 0.52), 0.028, 0.032), R(V(0, 0.86, 0.69), 0.014, 0.01)], S.flat(H(0x4a3e34)), 7, 0.2, 0.5)
	var feet := S.flat(H(0x2a2826))
	var tip_a := H(0x2e2620)
	var tip_b := H(0x3a2e24)
	for sd: float in [1.0, -1.0]:
		s.lift = 0.0
		s.leg([R(M(V(0.07, 0.27, -0.05), sd), 0.04), R(M(V(0.07, 0.12, 0.0), sd), 0.028), R(M(V(0.07, 0.02, 0.05), sd), 0.024)], 0.0 if sd > 0.0 else PI, feet)
		s.slab([M(V(0.07, 0.008, 0.03), sd), M(V(0.14, 0.008, 0.16), sd), M(V(0.07, 0.008, 0.19), sd), M(V(0.0, 0.008, 0.16), sd)], 0.01, feet, feet, V(0, 1, 0))
		s.lift = -0.2
		var top := func(p: Vector3, _n: Vector3, _t: float) -> Array:
			var tip := absf(p.x) > 0.7 or p.z < -0.15
			return [tip_a if tip else silver, tip_b if tip else back_b]
		s.joint(WING, M(V(0.12, 0.62, 0.1), sd), S.ramp(0, 0.14, 1.0), sd)
		s.slab([
			M(V(0.12, 0.62, 0.16), sd), M(V(0.45, 0.63, 0.17), sd), M(V(0.8, 0.62, 0.1), sd), M(V(1.02, 0.61, 0.0), sd),
			M(V(0.98, 0.61, -0.08), sd), M(V(0.8, 0.61, -0.14), sd), M(V(0.5, 0.62, -0.2), sd), M(V(0.2, 0.62, -0.2), sd), M(V(0.12, 0.62, -0.14), sd),
		], 0.016, top, S.flat(grey, brown), V(0, 1, 0))
	return s


# ---------------------------------------------------------------- blue-footed booby

static func booby(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.5, 0.15), lod, _tiny(0.9))
	s.lift = -0.18
	var brown := H(0x8a6a52)
	var white := H(0xf2efe8)
	var streak := H(0xd6c8b0)
	var foot := H(0x1aa8e0)
	var back_b := H(0x5a4434)
	var belly_b := H(0xd8d0c4)
	var body := func(_p: Vector3, n: Vector3, _t: float) -> Array: return [brown, back_b] if n.y > 0.15 else [white, belly_b]
	s.body().blob(V(0, 0.42, 0), V(0.11, 0.12, 0.24), body, 9, 7)
	s.joint(TAIL, V(0, 0.42, -0.2)).tube([R(V(0, 0.42, -0.2), 0.05, 0.02), R(V(0, 0.4, -0.37), 0.006, 0.004)], S.flat(brown), 6, 0.3, 0.5)
	var streak_b := H(0x9a8a74)
	var head := func(p: Vector3, _n: Vector3, _t: float) -> Array:
		var k := 0.82 if sin(p.y * 160.0 + p.x * 40.0) > 0.4 else 1.0
		return [S.mul(streak, k), S.mul(streak_b, k)]
	s.body(S.ramp(1, 0.5, 0.66)).tube([R(V(0, 0.5, 0.16), 0.055), R(V(0, 0.6, 0.18), 0.045), R(V(0, 0.67, 0.18), 0.045)], head, 8, 0.2, 0.2)
	s.body(1.0).blob(V(0, 0.7, 0.2), V(0.045, 0.05, 0.06), head, 8, 5)
	s.tube([R(V(0, 0.705, 0.25), 0.024, 0.022), R(V(0, 0.69, 0.33), 0.01), R(V(0, 0.68, 0.37), 0.003)], S.flat(H(0x7a8a9a)), 6, 0.2, 0.4)
	for sd: float in [1.0, -1.0]:
		s.blob(M(V(0.035, 0.715, 0.235), sd), V(0.007, 0.008, 0.008), S.flat(H(0xf0ecc0)), 5, 3)
	var feet := S.flat(foot, H(0x6aa0c0))
	for sd: float in [1.0, -1.0]:
		s.lift = 0.0
		s.leg([R(M(V(0.05, 0.16, 0.02), sd), 0.03), R(M(V(0.055, 0.07, 0.05), sd), 0.022), R(M(V(0.055, 0.015, 0.05), sd), 0.02)], 0.0 if sd > 0.0 else PI, feet)
		s.joint(LEG, M(V(0.05, 0.16, 0.02), sd), 1.0, AX_X, 0.0 if sd > 0.0 else PI)
		s.slab([M(V(0.055, 0.008, 0.02), sd), M(V(0.13, 0.008, 0.15), sd), M(V(0.06, 0.008, 0.2), sd), M(V(-0.005, 0.008, 0.15), sd)], 0.012, feet, feet, V(0, 1, 0))
		s.lift = -0.18
		s.joint(WING, M(V(0.09, 0.48, 0.08), sd), S.ramp(0, 0.1, 0.75), sd)
		s.slab([
			M(V(0.09, 0.48, 0.12), sd), M(V(0.35, 0.49, 0.11), sd), M(V(0.6, 0.48, 0.03), sd), M(V(0.76, 0.47, -0.06), sd),
			M(V(0.6, 0.47, -0.1), sd), M(V(0.3, 0.48, -0.13), sd), M(V(0.09, 0.48, -0.1), sd),
		], 0.014, S.flat(brown), S.flat(H(0xd8d0c8), H(0x8a7a6a)), V(0, 1, 0))
	return s


# ---------------------------------------------------------------- flamingo

static func flamingo(lod: int) -> WildSculpt:
	var s := S.new(V(0, 1.0, 0.2), lod, _tiny(1.7))
	var pink := H(0xf7a0b0)
	var coral := H(0xf07080)
	var ash := H(0xddd4d0)
	var ash_back := H(0xc8bab4)
	var leg_c := S.flat(H(0xe8687a), H(0x9a8a88))
	s.body().blob(V(0, 0.98, 0), V(0.13, 0.13, 0.25), func(_p: Vector3, n: Vector3, _t: float) -> Array: return [coral if n.y > 0.4 else pink, ash_back if n.y > 0.4 else ash], 9, 7)
	s.tube([R(V(0, 0.99, -0.2), 0.07, 0.05), R(V(0, 0.96, -0.33), 0.02, 0.01)], S.flat(H(0x1e1a1a), H(0x4a4444)), 6, 0.3, 0.5)
	# the S of the neck, bending from its root in the chest
	s.body(S.ramp(1, 1.0, 1.6)).tube([
		R(V(0, 1.02, 0.18), 0.05), R(V(0, 1.12, 0.24), 0.036), R(V(0, 1.25, 0.25), 0.03), R(V(0, 1.38, 0.21), 0.028),
		R(V(0, 1.5, 0.2), 0.028), R(V(0, 1.6, 0.23), 0.03), R(V(0, 1.64, 0.27), 0.033),
	], S.flat(pink, ash), 7, 0.2, 0.2)
	s.body(1.0).blob(V(0, 1.66, 0.3), V(0.035, 0.04, 0.05), S.flat(pink, ash), 8, 5)
	for sd: float in [1.0, -1.0]:
		s.blob(M(V(0.03, 1.675, 0.31), sd), V(0.007, 0.007, 0.007), S.flat(H(0xf0d020)), 5, 3)
	var tip := H(0x141010)
	var bill_a := H(0xf0c4c4)
	var bill_b := H(0xb8b0b0)
	s.tube([R(V(0, 1.67, 0.34), 0.02, 0.022), R(V(0, 1.655, 0.4), 0.018, 0.02), R(V(0, 1.6, 0.43), 0.014), R(V(0, 1.55, 0.42), 0.007)],
			func(p: Vector3, _n: Vector3, _t: float) -> Array: return [tip, tip] if p.y < 1.62 else [bill_a, bill_b], 6, 0.2, 0.5)
	var black_a := H(0x161212)
	var black_b := H(0x3a3434)
	var cover_b := H(0xd8ccc8)
	for sd: float in [1.0, -1.0]:
		# the right leg folds up into the feathers for the one-legged rest
		var ax := AX_X + (TUCK_A if sd < 0.0 else 0)
		s.leg([R(M(V(0.05, 0.92, 0.0), sd), 0.022), R(M(V(0.05, 0.5, -0.04), sd), 0.017), R(M(V(0.05, 0.04, 0.0), sd), 0.012), R(M(V(0.05, 0.0, 0.05), sd), 0.012)], 0.0 if sd > 0.0 else PI, leg_c, ax, 5)
		s.joint(LEG, M(V(0.05, 0.92, 0.0), sd), 1.0, ax, 0.0 if sd > 0.0 else PI)
		s.slab([M(V(0.05, 0.006, 0.02), sd), M(V(0.09, 0.006, 0.11), sd), M(V(0.05, 0.006, 0.13), sd), M(V(0.01, 0.006, 0.11), sd)], 0.008, leg_c, leg_c, V(0, 1, 0))
		var top := func(p: Vector3, _n: Vector3, _t: float) -> Array:
			var x := absf(p.x)
			var black := x > 0.55 or (p.z < -0.08 and x > 0.25)
			return [black_a if black else coral, black_b if black else cover_b]
		s.joint(WING, M(V(0.1, 1.02, 0.1), sd), S.ramp(0, 0.12, 0.85), sd)
		s.slab([M(V(0.1, 1.02, 0.14), sd), M(V(0.4, 1.03, 0.13), sd), M(V(0.7, 1.02, 0.05), sd), M(V(0.86, 1.02, -0.05), sd), M(V(0.7, 1.02, -0.12), sd), M(V(0.4, 1.02, -0.15), sd), M(V(0.1, 1.02, -0.12), sd)], 0.014, top, S.flat(pink, ash), V(0, 1, 0))
	return s


# ---------------------------------------------------------------- egret / heron

static func egret(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.75, 0.14), lod, _tiny(1.2))
	# A: a great egret, snow white; B: a slate-grey heron with a white neck
	var slate := H(0xa2acb6)
	var belly_b := H(0xd0d6dc)
	var body := func(_p: Vector3, n: Vector3, _t: float) -> Array: return [W, slate if n.y > -0.2 else belly_b]
	s.body().blob(V(0, 0.72, 0), V(0.09, 0.1, 0.2), body, 9, 6)
	s.tube([R(V(0, 0.72, -0.18), 0.05, 0.03), R(V(0, 0.7, -0.3), 0.008)], S.flat(W, slate), 6, 0.3, 0.5)
	s.body(S.ramp(1, 0.76, 1.15)).tube([
		R(V(0, 0.75, 0.14), 0.04), R(V(0, 0.85, 0.2), 0.03), R(V(0, 0.95, 0.17), 0.024), R(V(0, 1.03, 0.1), 0.022),
		R(V(0, 1.1, 0.1), 0.022), R(V(0, 1.16, 0.15), 0.024),
	], S.flat(W, H(0xe8e8e4)), 7, 0.2, 0.2)
	var crown := H(0x34383c)
	s.body(1.0).blob(V(0, 1.18, 0.18), V(0.028, 0.032, 0.045), func(_p: Vector3, n: Vector3, _t: float) -> Array: return [W, crown if n.y > 0.6 else W], 8, 5)
	for sd: float in [1.0, -1.0]:
		s.blob(M(V(0.022, 1.188, 0.2), sd), V(0.006, 0.006, 0.006), S.flat(H(0xf0d030)), 5, 3)
	s.tube([R(V(0, 1.18, 0.215), 0.013, 0.014), R(V(0, 1.175, 0.3), 0.006), R(V(0, 1.17, 0.37), 0.0015)], S.flat(H(0xf2c018), H(0xd8a020)), 6, 0.2, 0.6)
	var leg_c := S.flat(H(0x1e1e1c), H(0x5a5040))
	for sd: float in [1.0, -1.0]:
		s.leg([R(M(V(0.04, 0.66, 0.0), sd), 0.02), R(M(V(0.04, 0.36, -0.03), sd), 0.013), R(M(V(0.04, 0.02, 0.01), sd), 0.01)], 0.0 if sd > 0.0 else PI, leg_c, AX_X, 5)
		s.joint(LEG, M(V(0.04, 0.66, 0.0), sd), 1.0, AX_X, 0.0 if sd > 0.0 else PI)
		s.slab([M(V(0.04, 0.005, -0.04), sd), M(V(0.09, 0.005, 0.1), sd), M(V(0.04, 0.005, 0.14), sd), M(V(0.0, 0.005, 0.1), sd)], 0.008, leg_c, leg_c, V(0, 1, 0))
		s.joint(WING, M(V(0.08, 0.76, 0.06), sd), S.ramp(0, 0.1, 0.8), sd)
		s.slab([M(V(0.08, 0.76, 0.1), sd), M(V(0.35, 0.77, 0.1), sd), M(V(0.65, 0.76, 0.03), sd), M(V(0.8, 0.76, -0.06), sd), M(V(0.65, 0.76, -0.12), sd), M(V(0.35, 0.76, -0.14), sd), M(V(0.08, 0.76, -0.1), sd)], 0.012, body, S.flat(W, H(0xb8c0c8)), V(0, 1, 0))
	return s


# ---------------------------------------------------------------- iguana

static func iguana(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.16, 0.24), lod, _tiny(1.4))
	var green := H(0x5c9a38)
	var belly := H(0xa8c878)
	var band := H(0x2a4a20)
	var rust := H(0xb07038)
	var grey := H(0x6e6a5c)
	var band_b := H(0x4a3a2a)
	var skin := func(p: Vector3, n: Vector3, _t: float) -> Array:
		var k := MathX.smooth(-0.5, 0.3, n.y)
		var banded := p.z < -0.35 and fposmod(-p.z * 7.0, 1.0) < 0.38
		var scales := 0.9 if sin(p.x * 220.0) * sin(p.z * 210.0) > 0.7 else 1.0
		return [S.mul(band if banded else belly.lerp(green, k), scales), S.mul(band_b if banded else grey.lerp(rust, k), scales)]
	s.body().tube([R(V(0, 0.13, -0.26), 0.06, 0.055), R(V(0, 0.15, -0.12), 0.09, 0.075), R(V(0, 0.16, 0.05), 0.095, 0.08), R(V(0, 0.16, 0.18), 0.075, 0.07), R(V(0, 0.17, 0.26), 0.055, 0.058)], skin, 9, 0.2, 0.2)
	s.body(1.0).tube([R(V(0, 0.185, 0.28), 0.05, 0.052), R(V(0, 0.185, 0.36), 0.045, 0.042), R(V(0, 0.165, 0.44), 0.03, 0.028), R(V(0, 0.155, 0.47), 0.015)], skin, 8, 0.2, 0.6)
	for sd: float in [1.0, -1.0]:
		s.blob(M(V(0.045, 0.165, 0.31), sd), V(0.016, 0.02, 0.02), S.flat(H(0xc8d8a0), H(0xd8c8a8)), 6, 4)
		s.blob(M(V(0.035, 0.205, 0.37), sd), V(0.009, 0.009, 0.01), S.flat(H(0x8a5a20)), 5, 3)
	# the dewlap fans out under the throat: pale green, scaled, its edge saw-toothed in darker skin
	var e_a := H(0x6a9a40)
	var e_b := H(0x8a6a40)
	var d0 := H(0xc8e098)
	var d1 := H(0xe8d088)
	var db := H(0xd8b890)
	var dewlap := func(p: Vector3, _n: Vector3, _t: float) -> Array:
		var edge := p.y < 0.085
		return [e_a if edge else d0.lerp(d1, MathX.smooth(0.14, 0.08, p.y)), e_b if edge else db]
	s.joint(SPEC_A, V(0, 0.145, 0.38), 1.0, 0.0, 0.0, 1.0).slab([V(0, 0.145, 0.38), V(0, 0.145, 0.27), V(0, 0.07, 0.29), V(0, 0.065, 0.35)], 0.008, dewlap, dewlap, V(1, 0, 0))
	# a crest of spines down the back
	var spine := S.flat(H(0x7aaa50), H(0x8a7a5a))
	for i in 9:
		var z := 0.26 - i * 0.055
		var y := 0.17 + 0.07 + (0.012 if i < 3 else 0.0)
		s.joint(TAIL if i > 4 else BODY, V(0, 0.13, -0.22), 0.05 if i > 4 else 1.0, 0.0, 0.0, 1.0 if i < 1 else 0.0)
		s.slab([V(0, y - 0.04, z + 0.02), V(0, y + (0.035 if i < 4 else 0.02), z - 0.005), V(0, y - 0.04, z - 0.03)], 0.006, spine, spine, V(1, 0, 0))
	s.joint(TAIL, V(0, 0.13, -0.22), S.ramp(2, -0.2, -1.05)).tube([
		R(V(0, 0.13, -0.22), 0.055, 0.05), R(V(0, 0.11, -0.45), 0.04), R(V(0, 0.08, -0.7), 0.026), R(V(0, 0.05, -0.95), 0.013), R(V(0, 0.03, -1.12), 0.005),
	], skin, 7, 0.2, 0.6)
	for sd: float in [1.0, -1.0]:
		s.leg([R(M(V(0.07, 0.13, 0.15), sd), 0.038), R(M(V(0.15, 0.12, 0.18), sd), 0.028), R(M(V(0.19, 0.0, 0.22), sd), 0.02)], 0.0 if sd > 0.0 else PI, skin, AX_Y)
		s.leg([R(M(V(0.07, 0.12, -0.16), sd), 0.045), R(M(V(0.17, 0.1, -0.13), sd), 0.032), R(M(V(0.2, 0.0, -0.22), sd), 0.021)], PI if sd > 0.0 else 0.0, skin, AX_Y)
	return s


# ---------------------------------------------------------------- giant tortoise

static func tortoise(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.3, 0.42), lod, _tiny(1.1))
	var shell_d := H(0x544a3c)
	var shell_l := H(0x9a8a68)
	var skin_c := H(0x948c7e)
	var sb0 := H(0x6a5a40)
	var sb1 := H(0xb0a070)
	# scutes: paler centres ringed with darker growth lines
	var shell := func(p: Vector3, _n: Vector3, _t: float) -> Array:
		var u := p.x * 8.5
		var v := p.z * 7.0 + fmod(floorf(u + 0.5), 2.0) * 0.5
		var du := u - roundf(u)
		var dv := v - roundf(v)
		var r := Vector2(du, dv * 0.9).length()
		var k := MathX.smooth(0.5, 0.15, r) * (0.75 + 0.25 * cos(r * 30.0))
		return [shell_d.lerp(shell_l, k), sb0.lerp(sb1, k)]
	s.body().blob(V(0, 0.36, 0), V(0.42, 0.3, 0.52), shell, 14, 9)
	s.blob(V(0, 0.27, 0), V(0.45, 0.08, 0.55), S.flat(H(0x463e32), H(0x5a4e3a)), 14, 4)
	var skin := func(p: Vector3, _n: Vector3, _t: float) -> Array:
		if sin(p.x * 120.0) * sin(p.z * 110.0 + p.y * 90.0) > 0.6:
			return [S.mul(skin_c, 0.85), S.mul(skin_c, 0.95)]
		return [skin_c, S.mul(skin_c, 1.1)]
	# the neck draws back into the shell (z = 1: the head joint's draw-back)
	s.body(S.ramp(2, 0.3, 0.7), 1.0).tube([R(V(0, 0.3, 0.32), 0.1), R(V(0, 0.32, 0.5), 0.085), R(V(0, 0.38, 0.64), 0.072), R(V(0, 0.44, 0.72), 0.065)], skin, 8, 0.2, 0.2)
	s.body(1.0, 1.0).blob(V(0, 0.47, 0.8), V(0.07, 0.065, 0.1), skin, 9, 6)
	for sd: float in [1.0, -1.0]:
		s.blob(M(V(0.055, 0.49, 0.83), sd), V(0.011, 0.012, 0.012), eye(), 5, 3)
	s.tube([R(V(0, 0.44, 0.86), 0.045, 0.012), R(V(0, 0.44, 0.9), 0.02, 0.008)], S.flat(H(0x2a2620)), 6, 0.2, 0.5)
	for sd: float in [1.0, -1.0]:
		s.leg([R(M(V(0.3, 0.26, 0.32), sd), 0.1), R(M(V(0.36, 0.12, 0.38), sd), 0.09), R(M(V(0.36, 0.0, 0.38), sd), 0.095)], PI / 2.0 if sd > 0.0 else PI * 1.5, skin, AX_X, 7)
		s.leg([R(M(V(0.28, 0.24, -0.32), sd), 0.1), R(M(V(0.32, 0.1, -0.36), sd), 0.095), R(M(V(0.32, 0.0, -0.36), sd), 0.1)], 0.0 if sd > 0.0 else PI, skin, AX_X, 7)
	s.joint(TAIL, V(0, 0.22, -0.48)).tube([R(V(0, 0.22, -0.48), 0.04), R(V(0, 0.14, -0.6), 0.008)], skin, 5, 0.3, 0.5)
	return s


# ---------------------------------------------------------------- sea lion

static func seal(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.36, 0.4), lod, _tiny(2.0))
	var wet := H(0x6a5444)
	var belly := H(0x94785e)
	var tan := H(0x9a8060)
	var sand := H(0xc0a888)
	var coat := func(_p: Vector3, n: Vector3, _t: float) -> Array:
		var k := MathX.smooth(-0.5, 0.3, n.y)
		return [belly.lerp(wet, k), sand.lerp(tan, k)]
	s.body().tube([
		R(V(0, 0.17, -0.95), 0.06, 0.05), R(V(0, 0.2, -0.8), 0.15, 0.12), R(V(0, 0.25, -0.45), 0.26, 0.22),
		R(V(0, 0.3, -0.05), 0.3, 0.27), R(V(0, 0.33, 0.25), 0.27, 0.27), R(V(0, 0.36, 0.42), 0.2, 0.22),
	], coat, 11, 0.4, 0.3)
	s.body(S.along(V(0, 0.38, 0.46), V(0, 0.53, 0.68))).tube([R(V(0, 0.38, 0.46), 0.17, 0.18), R(V(0, 0.47, 0.6), 0.12, 0.125), R(V(0, 0.53, 0.68), 0.105, 0.105)], coat, 9, 0.2, 0.2)
	s.body(1.0).blob(V(0, 0.56, 0.73), V(0.1, 0.1, 0.12), coat, 10, 7)
	s.blob(V(0, 0.53, 0.84), V(0.06, 0.05, 0.06), coat, 8, 5)
	s.blob(V(0, 0.545, 0.895), V(0.022, 0.016, 0.012), S.flat(H(0x141210)), 6, 3)
	for sd: float in [1.0, -1.0]:
		s.blob(M(V(0.06, 0.6, 0.8), sd), V(0.016, 0.018, 0.016), eye(), 6, 4)
		s.blob(M(V(0.085, 0.6, 0.72), sd), V(0.008, 0.016, 0.01), coat, 5, 3)
	var flip := S.flat(H(0x463a30), H(0x7a6650))
	for sd: float in [1.0, -1.0]:
		# fore flippers prop the chest up; hind flippers turn forward under the hips to walk
		s.joint(LEG, M(V(0.22, 0.3, 0.32), sd), 1.0, AX_X, 0.0 if sd > 0.0 else PI)
		s.tube([R(M(V(0.2, 0.3, 0.32), sd), 0.07, 0.08), R(M(V(0.29, 0.13, 0.38), sd), 0.05, 0.035)], coat, 7, 0.2, 0.2)
		s.slab([M(V(0.26, 0.15, 0.36), sd), M(V(0.4, 0.01, 0.42), sd), M(V(0.46, 0.01, 0.56), sd), M(V(0.4, 0.01, 0.6), sd), M(V(0.3, 0.1, 0.46), sd)], 0.02, flip, flip, V(0, 1, 0))
		s.joint(LEG, M(V(0.09, 0.18, -0.86), sd), 1.0, AX_X, PI if sd > 0.0 else 0.0)
		s.slab([M(V(0.07, 0.17, -0.86), sd), M(V(0.26, 0.02, -1.15), sd), M(V(0.2, 0.02, -1.26), sd), M(V(0.1, 0.02, -1.22), sd), M(V(0.03, 0.12, -0.95), sd)], 0.018, flip, flip, V(0, 1, 0))
	return s


# ---------------------------------------------------------------- land crab

static func crab(lod: int) -> WildSculpt:
	var s := S.new(Vector3.ZERO, lod, _tiny(0.5))
	var red := H(0xd8401a)
	var under := H(0xf0a070)
	var sand := H(0xd8c49a)
	var pale := H(0xf2e6c8)
	var shell_p := func(_p: Vector3, n: Vector3, _t: float) -> Array: return [red, sand] if n.y > -0.2 else [under, pale]
	s.body().blob(V(0, 0.075, 0), V(0.1, 0.036, 0.075), shell_p, 12, 6)
	var limb := S.flat(H(0xe0582a), H(0xe0cfa8))
	for sd: float in [1.0, -1.0]:
		# eyes up on their stalks
		s.joint(SPEC_B, M(V(0.03, 0.095, 0.06), sd))
		s.tube([R(M(V(0.03, 0.095, 0.06), sd), 0.007), R(M(V(0.035, 0.13, 0.066), sd), 0.006)], limb, 5, 0.2, 0.2)
		s.blob(M(V(0.035, 0.137, 0.067), sd), V(0.011, 0.011, 0.011), eye(), 6, 4)
		# claws raise for the threat, and pick at the sand
		s.joint(SPEC_A, M(V(0.07, 0.065, 0.06), sd))
		s.tube([R(M(V(0.07, 0.065, 0.06), sd), 0.014), R(M(V(0.105, 0.07, 0.1), sd), 0.014), R(M(V(0.12, 0.07, 0.13), sd), 0.016)], limb, 6, 0.3, 0.3)
		s.blob(M(V(0.125, 0.07, 0.16), sd), V(0.022, 0.017, 0.035), shell_p, 7, 5)
		s.tube([R(M(V(0.115, 0.07, 0.185), sd), 0.008), R(M(V(0.11, 0.072, 0.215), sd), 0.003)], S.flat(H(0xf0e0c8)), 4, 0.2, 0.4)
		for i in 4:
			var z := 0.04 - i * 0.032
			s.leg([R(M(V(0.08, 0.065, z), sd), 0.012), R(M(V(0.14, 0.095, z * 1.3), sd), 0.011), R(M(V(0.18, 0.0, z * 1.55 - 0.01), sd), 0.005)], i * PI * 0.5 + (0.0 if sd > 0.0 else PI), limb, AX_Z, 5)
	return s


# ---------------------------------------------------------------- butterfly

static func butterfly(lod: int) -> WildSculpt:
	var s := S.new(Vector3.ZERO, lod, _tiny(0.25))
	var morpho := H(0x2a8aff)
	var edge := H(0x0c1220)
	var orange := H(0xf08a18)
	var vein := H(0x1a1008)
	var glow := H(0x60c0ff)
	var top := func(p: Vector3, _n: Vector3, _t: float) -> Array:
		var r := Vector2(p.x, p.z * 1.2).length()
		var rim := r > 0.058
		var veined := not rim and absf(sin(atan2(p.z, absf(p.x)) * 9.0)) < 0.12
		return [edge if rim else morpho.lerp(glow, MathX.smooth(0.05, 0.02, r) * 0.5), vein if rim or veined else orange]
	var e_a := H(0xe8c070)
	var u_a := H(0x6a5030)
	var e_b := H(0x2a2a2a)
	var u_b := H(0xc88a40)
	var under := func(p: Vector3, _n: Vector3, _t: float) -> Array:
		var ey := Vector2(absf(p.x) - 0.04, p.z + 0.012).length() < 0.01
		return [e_a if ey else u_a, e_b if ey else u_b]
	var black := S.flat(H(0x1a1410))
	s.body().tube([R(V(0, 0, -0.035), 0.004), R(V(0, 0, 0.0), 0.007), R(V(0, 0.002, 0.025), 0.006)], black, 5, 0.5, 0.5)
	s.blob(V(0, 0.003, 0.033), V(0.006, 0.006, 0.006), black, 5, 3)
	for sd: float in [1.0, -1.0]:
		s.tube([R(M(V(0.003, 0.006, 0.036), sd), 0.0012), R(M(V(0.014, 0.018, 0.062), sd), 0.001), R(M(V(0.016, 0.02, 0.066), sd), 0.0022)], black, 3, 0.2, 0.3)
		s.joint(WING, M(V(0.003, 0, 0), sd), 0.0, sd)
		s.slab([M(V(0.003, 0, 0.012), sd), M(V(0.05, 0, 0.032), sd), M(V(0.076, 0, 0.014), sd), M(V(0.066, 0, -0.012), sd), M(V(0.003, 0, -0.004), sd)], 0.002, top, under, V(0, 1, 0))
		s.slab([M(V(0.003, 0, -0.002), sd), M(V(0.055, 0, -0.018), sd), M(V(0.052, 0, -0.048), sd), M(V(0.022, 0, -0.058), sd), M(V(0.003, 0, -0.026), sd)], 0.002, top, under, V(0, 1, 0))
	return s


# ---------------------------------------------------------------- hummingbird

static func hummingbird(lod: int) -> WildSculpt:
	var s := S.new(V(0, 0.005, 0.03), lod, _tiny(0.3))
	var emerald := H(0x22b050)
	var violet := H(0x5a3ae0)
	var ruby := H(0xe0183a)
	var teal := H(0x20d8c8)
	var b_a := H(0xd8dcd0)
	var b_b := H(0xc8c8d8)
	var body := func(p: Vector3, n: Vector3, _t: float) -> Array:
		var throat := n.y < -0.1 and p.z > 0.01
		var belly := n.y < -0.3
		return [ruby if throat else (b_a if belly else emerald), teal if throat else (b_b if belly else violet)]
	s.body().blob(V(0, 0, 0), V(0.017, 0.018, 0.04), body, 8, 6)
	s.body(1.0).blob(V(0, 0.012, 0.042), V(0.014, 0.015, 0.016), body, 8, 5)
	for sd: float in [1.0, -1.0]:
		s.blob(M(V(0.011, 0.016, 0.05), sd), V(0.004, 0.004, 0.004), eye(), 4, 3)
	s.tube([R(V(0, 0.012, 0.056), 0.003), R(V(0, 0.008, 0.11), 0.0008)], S.flat(H(0x141414)), 4, 0.2, 0.3)
	s.joint(TAIL, V(0, 0, -0.035)).slab([V(0, 0.002, -0.032), V(0.018, 0.0, -0.07), V(0, 0.0, -0.075), V(-0.018, 0.0, -0.07)], 0.003, S.flat(H(0x1a4a2a), H(0x2a2060)), S.flat(H(0x2a2a2a)), V(0, 1, 0))
	var wing := S.flat(H(0x3a4442), H(0x3a3a48))
	for sd: float in [1.0, -1.0]:
		s.joint(WING, M(V(0.01, 0.012, 0.01), sd), 0.0, sd)
		s.slab([M(V(0.01, 0.012, 0.014), sd), M(V(0.04, 0.014, 0.008), sd), M(V(0.066, 0.014, -0.004), sd), M(V(0.062, 0.014, -0.014), sd), M(V(0.01, 0.012, -0.008), sd)], 0.002, wing, wing, V(0, 1, 0))
	return s
