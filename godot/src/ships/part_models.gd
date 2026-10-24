class_name PartModels
## The ship parts (Parts), modelled: the web game's src/ships/partModels.ts.
## Each builder lays its pieces into the ship's own kits (ShipModel), metal
## in the iron's paint and glass in the lamps', so a refit costs a few
## hundred triangles and no new draw calls; only the floating mythic bits
## (the wards, the crystal crowns, a halo) are meshes of their own, because
## they move (ShipModel.tick). Metal carries its colour in the vertex paint,
## so bronze, blued steel, gold and obsidian all share the one material.
##
## Local frame as ShipModel's: +Z bow, +Y up, +X port, waterline y = 0.

## The metals, as sRGB paint.
const METAL := {
	"iron": Color("#23262b"), "bronze": Color("#b07a3b"), "brass": Color("#d4a84e"), "blued": Color("#34466e"),
	"gold": Color("#e8b649"), "pale_gold": Color("#f6d98a"), "amber": Color("#c98a2a"), "obsidian": Color("#18151f"),
	"pearl": Color("#eceaf4"), "silver": Color("#c5cad6"), "ruby": Color("#8a1420"),
}
## The lights, linear and as bright as the web's (painted as lamp glass).
const GLOW := {
	"window": Color(5.0, 3.2, 1.4), "ember": Color(3.2, 0.85, 0.18), "aether": Color(0.32, 1.45, 2.8),
	"violet": Color(1.55, 0.5, 2.9), "star": Color(2.4, 2.5, 3.1),
}
## What the lamps' glass shines with, times its paint (ship_parts' glow_gain).
const GLOW_GAIN := 5.0
## How bright a light's strongest channel may shine. The web's bloom spreads
## its HDR lights into a halo of their own colour; with no bloom on a phone a
## channel past the grade's shoulder (src/render/grade.gd) burns the whole
## light white, so each keeps its hue a little under it.
const GLOW_PEAK := 1.25
const HEMP := Color("#9c8058")
const TAR := Color("#2a1f16")
const X := Vector3.RIGHT
const Y := Vector3.UP
const Z := Vector3.BACK


## Everything a part builder may add to, handed over by the ship model.
class Kit:
	var shape: HullShape
	var cls: ShipClass
	var livery: Livery
	var detail := true
	## The parts that cast shadows, the small ones, the close-range detail.
	var core: MeshKit
	var small: MeshKit
	var fine: MeshKit
	var ropes: RopeKit
	var cannon_ts := PackedFloat32Array()
	## The masts: {z, y0, h, r0, spar (its group, see ShipModel.Spar)}.
	var masts: Array[Dictionary] = []
	## What moves on its own: {kit, pos, basis, axis, spin, bob, rate, phase, spar}.
	var spinners: Array[Dictionary] = []

	## Marks what follows as standing on spar group g (0 the hull) in every kit.
	func on_spar(g: int) -> void:
		for k: MeshKit in [core, small, fine]:
			k.set_spar(g)


static func _v(x: float, y: float, z: float) -> Vector3:
	return Vector3(x, y, z)


static func _t(p: Vector3) -> Transform3D:
	return Transform3D(Basis.IDENTITY, p)


static func _rx(a: float) -> Transform3D:
	return Transform3D(Basis(X, a), Vector3.ZERO)


static func _rz(a: float) -> Transform3D:
	return Transform3D(Basis(Z, a), Vector3.ZERO)


static func _s(x: float, y: float, z: float) -> Transform3D:
	return Transform3D(Basis.from_scale(Vector3(x, y, z)), Vector3.ZERO)


## Metal paint (its colour in the vertex paint, the iron's shine).
static func _metal(k: MeshKit, c: Color, jitter := 0.04) -> void:
	k.paint(c, MeshKit.IRON, jitter)


## Light: lamp glass painted so it shines as bright as the web's.
static func _glow(k: MeshKit, c: Color) -> void:
	k.paint(glow_paint(c), MeshKit.GLOW, 0.0)


## A linear light as lamp glass's paint (its hue kept, see GLOW_PEAK).
static func glow_paint(c: Color) -> Color:
	var k := minf(1.0, GLOW_PEAK / maxf(c.r, maxf(c.g, maxf(c.b, 1e-4)))) / GLOW_GAIN
	return Color(c.r * k, c.g * k, c.b * k).linear_to_srgb()


static func _stem_z(k: Kit) -> float:
	return k.shape.z(1.0) + 0.11 + k.cls.length * 0.003


## A frame on the topsides, its normal levelled so things hang plumb.
static func _side_frame(s: HullShape, t: float, y: float, side: float, out: float, tilt := 0.0) -> Transform3D:
	var n := s.skin_normal(t, y, side)
	n.y = tilt
	return MeshKit.surface_frame(s.skin_point(t, y, side, out), n.normalized())


## Places along the hull, every `gap` metres between two fractions of her length.
static func _along(k: Kit, t0: float, t1: float, gap: float) -> PackedFloat32Array:
	var n := maxi(1, floori((t1 - t0) * k.cls.length / gap))
	var out := PackedFloat32Array()
	for i in n + 1:
		out.append(lerpf(t0, t1, float(i) / n))
	return out


## Whether something `half` metres long can sit on the topsides at t without
## fouling a gun, a channel and its chainplates, or the entry battens.
static func _clear_at(k: Kit, t: float, half: float, guns := true) -> bool:
	var s := k.shape
	var c := k.cls
	var length := c.length
	var z := s.z(t)
	var ts := k.cannon_ts
	if guns:
		for g in ts:
			if absf(s.z(g) - z) < 0.36 + half:
				return false
	for m: Dictionary in c.masts:
		var mt := float(m.t)
		var a := s.z(mt - 0.055 * 21.0 / length - 0.012) - 0.2
		var b := s.z(mt + 0.02 * 21.0 / length + 0.012) + 0.2
		if z + half > a and z - half < b:
			return false
	# the entry: the gap between guns nearest amidships with no mast at it
	var entry := -1.0
	for i in ts.size() - 1:
		var g := (ts[i + 1] + ts[i]) * 0.5
		var clear := true
		for m: Dictionary in c.masts:
			if absf(float(m.t) - g) <= 0.075:
				clear = false
		if clear and (entry < 0.0 or absf(g - 0.5) < absf(entry - 0.5)):
			entry = g
	if entry >= 0.0 and absf(s.z(entry) - z) < 0.45 + half:
		return false
	return true


## One side's run of a moulding along the topsides.
static func _side_run(k: Kit, side: float, y_of: Callable, out: float, t0 := 0.03, t1 := 0.95, n := 26) -> PackedVector3Array:
	var pts := PackedVector3Array()
	for i in n + 1:
		var t := lerpf(t0, t1, float(i) / n)
		pts.append(k.shape.skin_point(t, y_of.call(t), side, out))
	return pts


static func _wale_r(k: Kit) -> float:
	return 0.13 + k.cls.length * 0.0035


# ================================================================== hull plating


static func build_hull(k: Kit, p: Dictionary) -> void:
	match str(p.key):
		"strakes":
			_oak_strakes(k)
		"iron":
			_iron_straps(k)
		"pavisade":
			_pavisade(k)
		"dragonscale":
			_dragonscale(k)
		"aegis":
			_aegis(k)


## Common: two extra oak rubbing strakes and fat rope fenders over the side.
static func _oak_strakes(k: Kit) -> void:
	var s := k.shape
	var r := 0.075 + k.cls.length * 0.0018
	var col := MeshKit.blend(k.livery.wale, k.livery.hull, 0.55)
	var wr := _wale_r(k)
	for side: float in [1.0, -1.0]:
		for f: float in [0.38, 0.72]:
			var pts := _side_run(k, side, func(t: float) -> float: return lerpf(0.2, s.wale_y(t) - wr * 0.6, f), r * 0.4, 0.035, 0.93)
			k.core.paint(col)
			k.core.tube(pts, r, false, 6 if k.detail else 4, 2)
			k.core.ball(pts[0], r, 6, 4)
			k.core.ball(pts[pts.size() - 1], r, 6, 4)
		# rope fenders hung from the rail on a lanyard
		for t in _along(k, 0.14, 0.86, 3.4):
			if not _clear_at(k, t, 0.2):
				continue
			var y := s.wale_y(t) + wr + 0.3
			var m := _side_frame(s, t, y, side, 0.12)
			k.core.paint(HEMP)
			k.core.capsule(m, 0.13, 0.32, 3, 8)
			k.small.paint(TAR)
			for dy: float in [-0.14, 0.14]:
				k.small.torus(m * _t(_v(0, dy, 0)) * _rx(PI * 0.5), 0.135, 0.022, 3, 10)
			k.ropes.rope(m * _v(0, 0.32, 0), s.skin_point(t, s.top(t) + 0.04, side, -0.04), 0.022, HEMP, 0.0)


## Rare: wrought-iron straps from the waterline to the wale, riveted, under an iron cap rail.
static func _iron_straps(k: Kit) -> void:
	var s := k.shape
	var c := k.cls
	var iron := MeshKit.shade(METAL.iron, 1.15)
	var wr := _wale_r(k)
	for side: float in [1.0, -1.0]:
		for t in _along(k, 0.08, 0.9, 1.7):
			var y1 := s.wale_y(t) - wr * 0.9
			if y1 < 0.5:
				continue
			var pts := PackedVector3Array()
			for i in 5:
				pts.append(s.skin_point(t, lerpf(0.1, y1, i / 4.0), side, 0.025))
			_metal(k.core, iron)
			k.core.sweep(pts, func(_u: float) -> float: return 0.045, 4, 8)
			if k.detail:
				_metal(k.fine, METAL.iron)
				for i in 5:
					k.fine.ball(s.skin_point(t, lerpf(0.16, y1 - 0.05, i / 4.0), side, 0.07), 0.03, 5, 3)
		# a band at the boot-top and a capping along the rail
		_metal(k.core, iron)
		k.core.tube(_side_run(k, side, func(_t: float) -> float: return 0.17, 0.03, 0.03, 0.96), 0.05, false, 5, 2)
		k.core.tube(_side_run(k, side, func(t: float) -> float: return s.top(t) + 0.035, -0.09, 0.02, 0.97, 34), 0.06, false, 5, 2)
		# iron knees bolted over the bow and quarter
		for t: float in [0.06, 0.93]:
			k.core.rbox(_side_frame(s, t, s.wale_y(t) * 0.6, side, 0.04), Vector3(0.5, 0.9, 0.06), 0.03)
	# the cutwater sheathed in iron
	var z := _stem_z(k)
	var kr := 0.11 + c.length * 0.003
	_metal(k.core, iron)
	k.core.sweep(PackedVector3Array([_v(0, -0.2, z - kr * 0.2), _v(0, lerpf(s.bottom(1.0), s.top(1.0), 0.45), z + kr * 0.25), _v(0, s.top(1.0) - 0.6, z + kr * 0.7)]), func(_u: float) -> float: return kr * 0.85, 6, 10)


## Epic: bronze-bossed painted shields hung along the rails, and a bronze ram at the cutwater.
static func _pavisade(k: Kit) -> void:
	var s := k.shape
	var c := k.cls
	var r := 0.36 + c.length * 0.004
	var faces: Array[Color] = [k.livery.strake, k.livery.boot]
	var seg := 12 if k.detail else 9
	var n := 0
	for side: float in [1.0, -1.0]:
		for t in _along(k, 0.06, 0.9, r * 1.86):
			if not _clear_at(k, t, r * 0.8):
				continue
			var y := s.top(t) - r * 0.15
			var m := _side_frame(s, t, minf(y, s.top(t) - 0.05), side, 0.06, 0.1)
			# the shield's face, a shallow dome in the livery's colours
			k.core.paint(faces[n % 2], MeshKit.WOOD, 0.03)
			n += 1
			k.core.sphere(m * _t(_v(0, 0, -r * 0.5)) * _s(1, 1, 0.6) * _rx(PI * 0.5), r, seg, 3, 0.0, TAU, 0.0, 0.55)
			_metal(k.core, METAL.bronze)
			k.core.torus(m, r * 0.99, 0.04, 4, seg)
			k.core.sphere(m * _t(_v(0, 0, r * 0.05)) * _rx(PI * 0.5), r * 0.24, 8, 3, 0.0, TAU, 0.0, PI * 0.5)
			if k.detail:
				_metal(k.fine, METAL.bronze)
				for i in 8:
					var a := i / 8.0 * TAU
					k.fine.ball(m * _v(cos(a) * r * 0.78, sin(a) * r * 0.78, 0.035), 0.028, 4, 3)
	_bronze_ram(k, METAL.bronze, 1.0)


static func _bronze_ram(k: Kit, col: Color, scale: float) -> void:
	var length := k.cls.length
	var z := _stem_z(k)
	var ln := (0.9 + length * 0.03) * scale
	var prof := PackedVector2Array([Vector2(0, 0), Vector2(0.34, 0.04), Vector2(0.36, 0.2), Vector2(0.3, 0.42), Vector2(0.2, 0.7), Vector2(0.1, 0.92), Vector2(0, 1)])
	_metal(k.core, col)
	k.core.lathe(_t(_v(0, 0.12, z - 0.15)) * _rx(PI * 0.5) * _s(scale, ln, scale * 0.8), prof, 10 if k.detail else 7)
	# three fins, the trident's teeth
	for dy: float in [-0.18, 0.0, 0.18]:
		k.core.rbox(_t(_v(0, 0.12 + dy * scale, z + ln * 0.25)), Vector3(0.06, 0.05, ln * 0.55), 0.02, 1)
	k.core.sphere(_t(_v(0, 0.2, z - 0.12)) * _s(0.8, 1.2, 0.35), 0.42 * scale, 10, 6)


## Legendary: golden scale plates layered down the topsides, spines along the rails, a horned ram.
static func _dragonscale(k: Kit) -> void:
	var s := k.shape
	var c := k.cls
	var w := 0.42 + c.length * 0.006
	var h := w * 0.78
	var tones: Array[Color] = [METAL.gold, METAL.amber, METAL.bronze]
	# (each scale is a shallow dome a hand or two across: six sides and two
	# rings round it shade as round as the web's eight and four, at a third of the cost)
	var ws := 6 if k.detail else 5
	var hs := 2
	var wr := _wale_r(k)
	for side: float in [1.0, -1.0]:
		for t in _along(k, 0.06, 0.92, w * 0.8):
			var y1 := s.wale_y(t) - wr * 0.5
			var rows := maxi(2, floori((y1 - 0.25) / (h * 0.6)))
			for r in rows:
				# every other row sits half a scale along, like a fish's
				var tt := clampf(t + ((w * 0.4) / c.length if r % 2 == 1 else 0.0), 0.05, 0.93)
				var y := lerpf(0.3, y1, 0.5 if rows == 1 else float(r) / (rows - 1))
				var m := _side_frame(s, tt, y, side, 0.035 + r * 0.014)
				# (lying a few fingers proud of her side, they cast no shadow worth drawing)
				_metal(k.small, tones[(r + floori(t * 97.0)) % 3], 0.05)
				k.small.sphere(m * _t(_v(0, -h * 0.24, 0)) * _s(w * 0.56, h * 0.62, 0.055) * _rx(PI * 0.5), 1.0, ws, hs, 0.0, TAU, 0.0, PI * 0.5)
		# a crest of golden spines raked back along each rail
		_metal(k.core, METAL.gold)
		for t in _along(k, 0.05, 0.93, 1.05):
			if not _clear_at(k, t, 0.12, false):
				continue
			var ht := 0.42 + c.length * 0.008
			var p := s.skin_point(t, s.top(t) + 0.02, side, -0.07)
			k.core.cone(_t(p) * _rz(-side * 0.3) * _rx(-0.55) * _t(_v(0, ht * 0.5, 0)), 0.08, ht, 6)
	# a gilded horn sweeping forward and up from the cutwater
	var z := _stem_z(k)
	var reach := 1.1 + c.length * 0.03
	_metal(k.core, METAL.gold)
	k.core.sweep(PackedVector3Array([_v(0, 0.2, z - 0.2), _v(0, 0.16, z + reach * 0.45), _v(0, 0.32, z + reach * 0.85), _v(0, 0.7, z + reach)]), func(u: float) -> float: return lerpf(0.3, 0.025, pow(u, 0.8)), 8, 16)
	for side: float in [1.0, -1.0]:
		k.core.sweep(PackedVector3Array([_v(side * 0.2, 0.3, z - 0.1), _v(side * 0.42, 0.26, z + 0.3), _v(side * 0.5, 0.5, z + 0.55)]), func(u: float) -> float: return lerpf(0.13, 0.02, u), 6, 10)


## Mythic: obsidian plate veined with light, a glowing rail, and floating wards of light.
static func _aegis(k: Kit) -> void:
	var s := k.shape
	var c := k.cls
	var pw := 0.95 + c.length * 0.01
	var wr := _wale_r(k)
	for side: float in [1.0, -1.0]:
		var ts := _along(k, 0.07, 0.91, pw + 0.1)
		for i in ts.size() - 1:
			var t := (ts[i] + ts[i + 1]) * 0.5
			var y0 := 0.24
			var y1 := s.wale_y(t) - wr * 0.4
			var m := _side_frame(s, t, (y0 + y1) * 0.5, side, 0.05)
			_metal(k.core, METAL.obsidian, 0.08)
			k.core.rbox(m, Vector3(pw, y1 - y0, 0.09), 0.035, 1)
			_glow(k.core, GLOW.aether)
			# a chevron of light across each plate
			if k.detail:
				for sx: float in [-1.0, 1.0]:
					k.core.spar(m * _v(sx * pw * 0.32, -(y1 - y0) * 0.22, 0.05), m * _v(0, (y1 - y0) * 0.18, 0.05), 0.016, 0.016, 3)
			# the seam to the next plate glows
			k.core.rbox(_side_frame(s, ts[i + 1], (y0 + y1) * 0.5, side, 0.035), Vector3(0.05, y1 - y0, 0.05), 0.02, 1)
		_glow(k.core, GLOW.aether)
		k.core.tube(_side_run(k, side, func(_t: float) -> float: return 0.2, 0.04, 0.07, 0.91, 22), 0.028, false, 4, 2)
		k.core.tube(_side_run(k, side, func(t: float) -> float: return s.wale_y(t) - wr * 0.35, 0.04, 0.07, 0.91, 22), 0.028, false, 4, 2)
		# light runs along the rail cap
		_glow(k.core, GLOW.violet)
		k.core.tube(_side_run(k, side, func(t: float) -> float: return s.top(t) + 0.03, -0.09, 0.02, 0.97, 34), 0.03, false, 4, 2)
		# floating wards: hexagons of light standing off the hull, turning slowly
		var n := 3 if c.length > 25.0 else 2
		for i in n:
			var t := lerpf(0.28, 0.72, float(i) / (n - 1))
			var y := s.top(t) * 0.62
			var nrm := s.skin_normal(t, y, side)
			nrm.y = 0.0
			nrm = nrm.normalized()
			var big_r := 0.5 + c.length * 0.012
			var ward := MeshKit.new(17 + i)
			_glow(ward, GLOW.aether)
			ward.torus(Transform3D.IDENTITY, big_r, 0.045, 3, 6)
			ward.torus(_rz(PI / 6.0), big_r * 0.82, 0.016, 3, 6)
			_glow(ward, GLOW.violet)
			ward.torus(_rz(PI * 0.5), big_r * 0.52, 0.026, 3, 3)
			_glow(ward, GLOW.star)
			ward.torus(Transform3D.IDENTITY, big_r * 0.26, 0.02, 3, 16)
			ward.octahedron(Transform3D.IDENTITY, big_r * 0.11)
			# little runes at the hexagon's corners
			_glow(ward, GLOW.violet)
			for j in 6:
				var a := j / 6.0 * TAU + PI / 6.0
				ward.octahedron(_t(_v(cos(a) * big_r * 0.66, sin(a) * big_r * 0.66, 0)), big_r * 0.07)
			k.spinners.append({
				"kit": ward, "pos": s.skin_point(t, y, side, 1.25 + c.beam * 0.05), "basis": Basis(Y.cross(nrm).normalized(), Y, nrm),
				"axis": Z, "spin": (0.35 + i * 0.1) * side, "bob": 0.13, "rate": 1.1 + i * 0.23, "phase": i * 1.7 + (0.0 if side > 0.0 else 2.4), "spar": 0,
			})
	# the keel line burns faintly under the forefoot
	var z := _stem_z(k)
	_glow(k.core, GLOW.aether)
	k.core.sweep(PackedVector3Array([_v(0, -0.05, z - 0.25), _v(0, lerpf(s.bottom(1.0), s.top(1.0), 0.45), z + 0.04), _v(0, s.top(1.0) - 0.6, z + 0.12)]), func(_u: float) -> float: return 0.05, 4, 8)


# ================================================================== sails


## Sail parts are mostly in the cloth (ship_sail's sail_part); the higher ones dress the masts too.
static func build_sails(k: Kit, p: Dictionary) -> void:
	if int(p.tier) == 3:
		_sun_medallions(k)
	elif int(p.tier) == 4:
		_crystal_crowns(k)


## Legendary: a gilded sun on the fore and after faces of every mast, rays and all.
static func _sun_medallions(k: Kit) -> void:
	for m: Dictionary in k.masts:
		var h := float(m.h)
		var z := float(m.z)
		var r0 := float(m.r0)
		var y := float(m.y0) + h * 0.5
		var r := 0.26 + h * 0.006
		# up the mast, over the side with it
		k.on_spar(int(m.spar))
		for dir: float in [1.0, -1.0]:
			var zf := z + dir * (r0 * 0.82 + 0.05)
			_metal(k.core, METAL.gold)
			k.core.spar(_v(0, y, zf - 0.03), _v(0, y, zf + 0.03), r, r, 18)
			_metal(k.core, METAL.pale_gold)
			k.core.sphere(_t(_v(0, y, zf + dir * 0.03)) * _s(1, 1, 0.45) * _rx(dir * PI * 0.5), r * 0.62, 12, 5, 0.0, TAU, 0.0, PI * 0.5)
			for i in 12:
				var a := i / 12.0 * TAU
				var ln := r * 0.55 if i % 2 == 1 else r * 0.9
				_metal(k.core, METAL.amber if i % 2 == 1 else METAL.gold)
				k.core.cone(_t(_v(0, y, zf)) * _rz(a) * _t(_v(0, r + ln * 0.5 - 0.02, 0)), 0.05, ln, 4)
		# and a gilded ball on the truck
		_metal(k.core, METAL.gold)
		k.core.ball(_v(0, float(m.y0) + h + 0.12 + r0 * 0.5, z), r0 * 0.7, 10, 7)
		k.on_spar(0)


## Mythic: a crown of crystal shards turning above every masthead, in a ring of light.
static func _crystal_crowns(k: Kit) -> void:
	for i in k.masts.size():
		var m := k.masts[i]
		var big_r := 0.62 + float(m.r0) * 1.6
		var crown := MeshKit.new(29 + i)
		for j in 3:
			var a := j / 3.0 * TAU
			_glow(crown, GLOW.violet if j == 1 else GLOW.aether)
			crown.octahedron(_t(_v(cos(a) * big_r, 0, sin(a) * big_r)) * Transform3D(Basis(Y, a), Vector3.ZERO) * _rz(0.25) * _s(0.75, 2.4, 0.75), 0.16)
			_glow(crown, GLOW.star)
			crown.octahedron(_t(_v(cos(a + 1.05) * big_r, 0.1, sin(a + 1.05) * big_r)), 0.07)
		_glow(crown, GLOW.aether)
		crown.torus(_rx(PI * 0.5), big_r, 0.018, 3, 36)
		_glow(crown, GLOW.star)
		crown.octahedron(_t(_v(0, 0.25, 0)) * _s(1, 1.6, 1), 0.2)
		k.spinners.append({
			"kit": crown, "pos": _v(0, float(m.y0) + float(m.h) + 0.95, float(m.z)), "basis": Basis.IDENTITY,
			"axis": Y, "spin": 0.55 + i * 0.12, "bob": 0.14, "rate": 0.9 + i * 0.2, "phase": i * 2.1, "spar": int(m.spar),
		})


# ================================================================== guns


## How far along its barrel a part's bore opens (+y the muzzle, before the gun's scale).
static func barrel_tip(p: Dictionary) -> float:
	return float({"bronze": 0.84, "culverin": 1.04, "bombard": 0.7, "dragonmaw": 0.94, "starfire": 0.96}.get(str(p.key), 0.71))


static func _ring(k: MeshKit, xf: Transform3D, r: float, w: float, y: float, seg: int) -> void:
	k.torus(xf * _t(_v(0, y, 0)) * _rx(PI * 0.5), r, w, 4, seg)


static func _prof(pts: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p: Array in pts:
		out.append(Vector2(p[0], p[1]))
	return out


## A part's barrel laid into the kit at xf (its own frame: +y the muzzle).
static func barrel(k: MeshKit, p: Dictionary, xf: Transform3D, detail: bool) -> void:
	var seg := 12 if detail else 8
	match str(p.key):
		"bronze":
			_metal(k, METAL.bronze)
			k.lathe(xf, _prof([[0, -0.9], [0.08, -0.89], [0.11, -0.82], [0.065, -0.76], [0.2, -0.72], [0.225, -0.6], [0.215, -0.42], [0.2, -0.3], [0.188, 0.0], [0.175, 0.3], [0.16, 0.62], [0.2, 0.7], [0.21, 0.8], [0.18, 0.84], [0.1, 0.84], [0.1, 0.7], [0, 0.7]]), seg)
			_metal(k, MeshKit.shade(METAL.bronze, 0.85))
			for y: float in [-0.5, -0.12, 0.28, 0.58]:
				_ring(k, xf, 0.2 - y * 0.03, 0.03, y, seg)
		"culverin":
			_metal(k, METAL.blued)
			k.lathe(xf, _prof([[0, -0.92], [0.07, -0.91], [0.09, -0.85], [0.06, -0.8], [0.17, -0.76], [0.18, -0.55], [0.16, -0.3], [0.145, 0.3], [0.13, 0.9], [0.16, 0.96], [0.165, 1.04], [0.09, 1.04], [0.09, 0.96], [0, 0.96]]), seg)
			_metal(k, METAL.brass)
			for yr: Vector2 in [Vector2(-0.7, 0.18), Vector2(-0.32, 0.165), Vector2(0.2, 0.15), Vector2(0.62, 0.14), Vector2(0.98, 0.17)]:
				_ring(k, xf, yr.y, 0.028, yr.x, seg)
			# the dolphins: two lifting handles on top of the barrel (local -x is up once mounted)
			for dz: float in [-0.07, 0.07]:
				k.torus(xf * _t(_v(-0.15, -0.12, dz)) * _rz(PI * 0.5), 0.06, 0.018, 4, 8, PI)
		"bombard":
			_metal(k, METAL.iron)
			k.lathe(xf, _prof([[0, -0.82], [0.1, -0.81], [0.14, -0.74], [0.09, -0.68], [0.27, -0.64], [0.29, -0.5], [0.27, -0.2], [0.24, 0.2], [0.22, 0.4], [0.26, 0.5], [0.33, 0.62], [0.34, 0.68], [0.17, 0.68], [0.17, 0.58], [0, 0.58]]), seg)
			_metal(k, METAL.gold)
			for yr: Vector2 in [Vector2(-0.56, 0.29), Vector2(-0.25, 0.275), Vector2(0.1, 0.25), Vector2(0.44, 0.24)]:
				_ring(k, xf, yr.y, 0.04, yr.x, seg)
			# a crown of teeth round the flared mouth
			for i in 8:
				var a := i / 8.0 * TAU
				k.cone(xf * _t(_v(cos(a) * 0.29, 0.74, sin(a) * 0.29)), 0.05, 0.14, 4)
		"dragonmaw":
			_metal(k, METAL.gold)
			k.lathe(xf, _prof([[0, -0.86], [0.08, -0.85], [0.12, -0.78], [0.07, -0.72], [0.2, -0.68], [0.22, -0.55], [0.2, -0.2], [0.18, 0.3], [0.17, 0.48], [0, 0.48]]), seg)
			_metal(k, METAL.amber)
			for y: float in [-0.45, -0.1, 0.22]:
				_ring(k, xf, 0.205 - y * 0.02, 0.035, y, seg)
			# the head: upper jaw and brow above the bore (local -x is up), lower jaw below
			_metal(k, METAL.gold)
			k.sphere(xf * _t(_v(-0.1, 0.62, 0)) * _s(0.85, 1.75, 1.05), 0.2, 10, 7)
			_metal(k, METAL.amber)
			k.sphere(xf * _t(_v(0.15, 0.6, 0)) * _s(0.6, 1.6, 0.9), 0.15, 8, 6)
			_metal(k, METAL.iron)
			k.spar(xf * _v(0, 0.83, 0), xf * _v(0, 0.89, 0), 0.11, 0.1, 10, false)
			for dz: float in [-1.0, 1.0]:
				# horns sweeping back along the barrel
				_metal(k, METAL.pale_gold)
				k.sweep(xf * PackedVector3Array([_v(-0.24, 0.62, dz * 0.1), _v(-0.34, 0.45, dz * 0.16), _v(-0.36, 0.25, dz * 0.12), _v(-0.3, 0.12, dz * 0.08)]), func(u: float) -> float: return lerpf(0.055, 0.01, u), 5, 8)
				# teeth
				_metal(k, METAL.pearl)
				for y: float in [0.72, 0.84]:
					k.cone(xf * _t(_v(-0.02, y, dz * 0.1)) * _rz(PI * 0.5), 0.022, 0.07, 4)
				# ember eyes
				_glow(k, GLOW.ember)
				k.sphere(xf * _t(_v(-0.2, 0.7, dz * 0.12)), 0.035, 6, 4)
		"starfire":
			_metal(k, METAL.obsidian)
			k.lathe(xf, _prof([[0, -0.8], [0.15, -0.78], [0.19, -0.66], [0.17, -0.55], [0.1, -0.5], [0.08, 0.9], [0.11, 0.94], [0, 0.94]]), seg)
			# collars between the rings of light, as if the rings were held off the core by nothing
			_metal(k, METAL.silver)
			for y: float in [-0.22, 0.14, 0.5]:
				_ring(k, xf, 0.1, 0.03, y, seg)
			for yr: Vector2 in [Vector2(-0.38, 0.2), Vector2(-0.04, 0.18), Vector2(0.32, 0.16), Vector2(0.68, 0.14)]:
				_glow(k, GLOW.violet if yr.x > 0.5 else GLOW.aether)
				k.torus(xf * _t(_v(0, yr.x, 0)) * _rx(PI * 0.5), yr.y, 0.024, 3, 16)
			_glow(k, GLOW.violet)
			k.octahedron(xf * _t(_v(0, -0.95, 0)) * _s(1, 1.4, 1), 0.12)
			_glow(k, GLOW.star)
			k.spar(xf * _v(0, 0.93, 0), xf * _v(0, 0.97, 0), 0.075, 0.075, 10)


# ================================================================== figureheads


## The seraph's star cupped in her hands, and the halo turning level over her head.
static func seraph_lights(k: Kit, h: Figurehead.Head) -> void:
	var star := _v(0, 1.13, 0.44)
	_glow(k.core, GLOW.star)
	k.core.octahedron(h.place * _t(star), 0.1)
	for i in 8:
		var odd := i % 2 == 1
		k.core.cone(h.place * _t(star) * _rz(i * PI * 0.25) * _t(_v(0, 0.1 if odd else 0.14, 0)), 0.016, 0.1 if odd else 0.18, 3)
	var c := cos(h.lean)
	var s := sin(h.lean)
	var halo := MeshKit.new(41)
	_glow(halo, GLOW.star)
	halo.torus(_s(h.scale, h.scale, h.scale) * _rx(PI * 0.5), 0.16, 0.015, 3, 32)
	_glow(halo, GLOW.aether)
	halo.torus(_s(h.scale, h.scale, h.scale) * _rx(PI * 0.5), 0.115, 0.008, 3, 6)
	k.spinners.append({
		"kit": halo, "pos": h.place * _v(0, 1.07 + 0.24 * c - 0.06 * s, 0.03 - 0.24 * s - 0.06 * c), "basis": Basis(X, -0.3),
		"axis": Y, "spin": 0.9, "bob": 0.025, "rate": 1.6, "phase": 0.0, "spar": 0,
	})
