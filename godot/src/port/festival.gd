class_name Festival
## Feast nights (the web game's src/port/festival.ts). Every trading port
## keeps its own feast, one night in three, and on the full moon every port
## in the isles keeps one at once. From dusk the quay is strung with paper
## lanterns that light one after another, the townsfolk dance, the band
## strikes up, paper-lantern boats are set down on the water to drift out to
## sea, and through the middle of the night the lighthouse sends fireworks up
## over the harbour, with a grand finale at midnight. This file holds the
## calendar and the lantern strings; the show itself is run by Festivals.

## One feast per trading port, in TradePort.SPECS order: its name, a line of
## flavour, the lanterns' paper colours and the shells the town likes best.
const FEASTS: Array[Dictionary] = [
	{"name": "The Spice Feast", "line": "Saffron lanterns and pepper-red rockets over the harbour",
		"colors": ["#ff7a2a", "#ffc34d", "#e8342a", "#ff9a5a", "#fff0c8"], "shells": ["palm", "chrysanthemum", "crackle", "peony"]},
	{"name": "Gold Night", "line": "The counting house lights the whole quay in gold",
		"colors": ["#ffd263", "#fff0c0", "#ffb347", "#7fb0ff", "#ffe9a0"], "shells": ["willow", "peony", "ring", "strobe"]},
	{"name": "Night of the Coral Saints", "line": "Pink lanterns and paper boats for the coral saints",
		"colors": ["#ff8fa8", "#ffc4d0", "#5fe0d0", "#fff0e0", "#ff6f91"], "shells": ["fish", "ring", "peony", "saturn"]},
	{"name": "The Rum Harvest", "line": "The new rum is tapped and the town dances till dawn",
		"colors": ["#ffa040", "#8ad060", "#ffd060", "#ff6a3a", "#fff0c8"], "shells": ["crackle", "palm", "crossette", "willow"]},
	{"name": "The Drizzle Lanterns", "line": "Tea-house lanterns glowing through the mist",
		"colors": ["#ff8fb0", "#fff2e0", "#9fe0c0", "#ffb070", "#d9a0ff"], "shells": ["willow", "strobe", "ring", "chrysanthemum"]},
	{"name": "The Jade Moon", "line": "Jade lanterns float out to sea for luck",
		"colors": ["#60f0a0", "#c0ffd8", "#ffd080", "#40d0c0", "#fff0c8"], "shells": ["saturn", "fish", "crossette", "ring"]},
]

const FULL_MOON := {"name": "The Full Moon Fair", "line": "Every port in the isles lights its lanterns tonight"}

## The shape of one paper lantern (a round chōchin): radius, height, and
## whether it is glowing paper (1) or a dark cap (0).
## (The web's has six rings round six sides; five of each draw it as round
## at the distances it's seen from, for two thirds of the triangles.)
const PROFILE: Array[Vector3] = [
	Vector3(0.02, 0.21, 0.0),
	Vector3(0.12, 0.17, 0.0),
	Vector3(0.175, 0.04, 1.0),
	Vector3(0.15, -0.12, 1.0),
	Vector3(0.05, -0.2, 0.0),
]
const SEG := 5
## Room on the string per lantern (m).
const PITCH := 1.3


static func feast(i: int) -> Dictionary:
	return FEASTS[posmod(i, FEASTS.size())]


## Which ports (by index) keep their feast on night n: each its own every
## third night, and all of them on the full moon.
static func feast_ports(night: int, ports: int, full_moon: bool) -> PackedInt32Array:
	var out := PackedInt32Array()
	for i in ports:
		if full_moon or (night + i) % 3 == 0:
			out.append(i)
	return out


## How far a feast night has got at an hour: lanterns going up through dusk,
## out before dawn.
static func level(hour: float) -> float:
	return MathX.smooth(18.9, 19.9, hour) if hour >= 12.0 else 1.0 - MathX.smooth(3.6, 4.6, hour)


## Whether the night's moon is full (phase 0 new .. 0.5 full), judged at the
## coming midnight (`day` 0 midnight .. 1).
static func moon_is_full(phase: float, day: float) -> bool:
	# the phase steps an eighth of the month a day: look ahead to the coming midnight
	var ahead := fposmod(1.0 - day, 1.0)
	var p := fposmod(phase + ahead / 8.0, 1.0)
	return absf(p - 0.5) < 1.0 / 16.0


## A point on a string of lanterns from a to b, sagging `sag` in the middle.
static func sag_at(a: Vector3, b: Vector3, sag: float, t: float) -> Vector3:
	var p := a.lerp(b, t)
	p.y = a.y + (b.y - a.y) * t - sag * 4.0 * t * (1.0 - t)
	return p


## Every lantern on every string (spans: [a, b, sag]) in one mesh. Each
## vertex carries its colour and whether it's paper (COLOR: rgb, a), its
## lantern's hanging point (UV: x, z; UV2.x: y) so the shader can swing it
## on the wind, and its turn in the lighting order (UV2.y). Returns
## {"mesh", "count"} (the mesh null when there are no spans).
static func festoon(spans: Array, colors: Array, seed_value: int) -> Dictionary:
	var n := PROFILE.size()
	# the lathe, laid out column by column round the axis as three.js lays it
	var lp := PackedVector3Array()
	var ln := PackedVector3Array()
	for i in SEG + 1:
		var phi := float(i) / SEG * TAU
		var s := sin(phi)
		var c := cos(phi)
		for j in n:
			var pr := PROFILE[j]
			# the profile's own normal, out from its slope
			var a := PROFILE[maxi(j - 1, 0)]
			var b := PROFILE[mini(j + 1, n - 1)]
			var d := Vector2(b.x - a.x, b.y - a.y)
			var nn := Vector2(-d.y, d.x).normalized()
			lp.append(Vector3(pr.x * s, pr.y, pr.x * c))
			ln.append(Vector3(nn.x * s, nn.y, nn.x * c))
	var li := PackedInt32Array()
	for i in SEG:
		for j in n - 1:
			var a := i * n + j
			var b := a + n
			li.append_array([a, b, a + 1, b + 1, a + 1, b])
	var rnd := seed_value * 9301 + 49297
	var cols: Array[Color] = []
	for h: String in colors:
		cols.append(Color(h).srgb_to_linear())
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var col := PackedColorArray()
	var uv := PackedVector2Array()
	var uv2 := PackedVector2Array()
	var idx := PackedInt32Array()
	var total := spans.size()
	var count := 0
	for si in total:
		var sp: Array = spans[si]
		var a0: Vector3 = sp[0]
		var b0: Vector3 = sp[1]
		var sag: float = sp[2]
		var many := maxi(1, floori(a0.distance_to(b0) / PITCH))
		for k in many:
			var t := (k + 0.5) / many
			var p := sag_at(a0, b0, sag, t)
			var cc := cols[(k + si * 2 + count) % cols.size()]
			rnd = (rnd * 9301 + 49297) % 233280
			var big := 0.85 + float(rnd) / 233280.0 * 0.3
			rnd = (rnd * 9301 + 49297) % 233280
			var turn := float(rnd) / 233280.0 * PI
			rnd = (rnd * 9301 + 49297) % 233280
			# lit along each string in turn, a lamplighter working down the quay
			var order := minf(0.97, (si + t) / total * 0.9 + float(rnd) / 233280.0 * 0.05)
			var base := pos.size()
			var cs := cos(turn)
			var sn := sin(turn)
			for v in lp.size():
				var q := lp[v] * big
				q.y -= 0.24 * big
				pos.append(Vector3(p.x + q.x * cs - q.z * sn, p.y + q.y, p.z + q.x * sn + q.z * cs))
				var m := ln[v]
				nor.append(Vector3(m.x * cs - m.z * sn, m.y, m.x * sn + m.z * cs))
				col.append(Color(cc.r, cc.g, cc.b, PROFILE[v % n].z))
				uv.append(Vector2(p.x, p.z))
				uv2.append(Vector2(p.y, order))
			for i in li:
				idx.append(base + i)
			count += 1
	if pos.is_empty():
		return {"mesh": null, "count": 0}
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	arr[Mesh.ARRAY_NORMAL] = nor
	arr[Mesh.ARRAY_COLOR] = col
	arr[Mesh.ARRAY_TEX_UV] = uv
	arr[Mesh.ARRAY_TEX_UV2] = uv2
	arr[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	# a little more room for the swing
	var box := mesh.get_aabb().grow(1.0)
	mesh.custom_aabb = box
	return {"mesh": mesh, "count": count}
