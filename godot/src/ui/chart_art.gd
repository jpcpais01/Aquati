class_name ChartArt
extends RefCounted
## The sea chart's fixed geography and its engravings, as the web game's
## src/ui/chart.ts lays them out: the bounds of the known sea, the lane
## across the high seas between the archipelagos (and the Sereno current
## either side of it), the great compass rose in the empty water south of
## it, the Banco del Sereno, and the leadsman's soundings, all from the
## web's own noise so they land where its depths say. The engravings, the
## open sea and each archipelago's square, are drawn once on the GPU
## (shaders/chart_sea.gdshader, shaders/chart_isles.gdshader), read back and
## kept as mipmapped textures, a piece a frame at warm-up.

## Pirates are only charted within this range of you (m).
const SPYGLASS := 650.0
## The open water between the archipelagos, as the chart names it.
const HIGH_SEAS_NAME := "Mar Sereno"
## The engravings' pixels: the open sea across, an archipelago's square across.
const SEA_PX := 1024
const ISLE_PX := 1024


## The sailing lane across the high seas (or a current alongside it): start,
## bow and end of a quadratic curve, and the way along it and to its south.
class Lane:
	var a := Vector2.ZERO
	var q := Vector2.ZERO
	var b := Vector2.ZERO
	var u := Vector2.ZERO
	var p := Vector2.ZERO

	## The point `t` (0..1) along it.
	func at(t: float) -> Vector2:
		return a * (1.0 - t) * (1.0 - t) + q * 2.0 * (1.0 - t) * t + b * t * t

	## Its heading at `t`, not normalised.
	func tangent(t: float) -> Vector2:
		return (q - a) * 2.0 * (1.0 - t) + (b - q) * 2.0 * t


var regions: Array[Region] = []
## The whole known sea: every archipelago's square and the high seas between.
var sea := Rect2()
## As close as one archipelago could be looked at before, whatever the sea's size.
var max_zoom := 1.0
## The great rose (x, z, radius) and the shoal under the lane.
var rose := Vector3.ZERO
var bank := Vector2.ZERO
## Depth soundings over the open sea: x, z and fathoms.
var soundings: Array[Vector3] = []
## The engravings, once drawn: the open sea, and each archipelago's by its id.
var sea_tex: Texture2D
var isle_tex := {}
var _building := false
var _seed := 0


func _init(p_regions: Array[Region]) -> void:
	regions = p_regions
	var lo := Vector2(INF, INF)
	var hi := -lo
	for r in regions:
		lo = lo.min(Vector2(r.centre.x, r.centre.z))
		hi = hi.max(Vector2(r.centre.x, r.centre.z))
	var e := Vector2(World.EDGE_R, World.EDGE_R)
	sea = Rect2(lo - e, hi - lo + e * 2.0)
	max_zoom = 6.0 * maxf(sea.size.x, sea.size.y) / Region.SIZE
	var l := lane()
	if l != null:
		var m := l.at(0.5)
		rose = Vector3(m.x + l.p.x * 1050.0 + l.u.x * 250.0, m.y + l.p.y * 1050.0 + l.u.y * 250.0, 300.0)
		bank = l.at(0.72) - l.p * 120.0
	_sound()


## The lane between the first two archipelagos, its perpendicular `off`
## metres to the south (a current alongside it), or null with only one.
func lane(off := 0.0) -> Lane:
	if regions.size() < 2:
		return null
	var a := Vector2(regions[0].centre.x, regions[0].centre.z)
	var b := Vector2(regions[1].centre.x, regions[1].centre.z)
	var l := Lane.new()
	l.u = (b - a).normalized()
	l.p = Vector2(-l.u.y, l.u.x)
	l.a = a + l.u * 1150.0 + l.p * off
	l.q = (a + b) * 0.5 + l.p * (520.0 + off * 1.15)
	l.b = b - l.u * 1150.0 + l.p * off
	return l


## The archipelago whose heart lies nearest (x, z), and how far off it is.
func nearest(x: float, z: float) -> float:
	var d := INF
	for r in regions:
		d = minf(d, Vector2(r.centre.x - x, r.centre.z - z).length())
	return d


## How far (x, z) lies past the edge of the known sea (negative inside).
func edge(x: float, z: float) -> float:
	var p := Vector2(x, z)
	var best := INF
	for i in regions.size():
		var a := Vector2(regions[i].centre.x, regions[i].centre.z)
		for j in range(i, regions.size()):
			best = minf(best, p.distance_to(Geometry2D.get_closest_point_to_segment(p, a, Vector2(regions[j].centre.x, regions[j].centre.z))))
	return best - World.EDGE_R


## How deep the open sea runs at (x, z): 0 on an archipelago's shelf .. 1 in
## the abyss, with rolling banks and the long shoal under the lane (the
## web's seaDepth, which shaders/chart_sea.gdshader engraves).
func depth(x: float, z: float) -> float:
	var shelf := clampf((nearest(x, z) - 1050.0) / 1500.0, 0.0, 1.0)
	var sh := shelf * shelf * (3.0 - 2.0 * shelf)
	var n := vnoise(x / 1500.0, z / 1500.0) * 0.6 + vnoise(x / 610.0 + 17.0, z / 610.0 - 9.0) * 0.28 + vnoise(x / 260.0 - 4.0, z / 260.0 + 31.0) * 0.12
	var bk := Vector2((x - bank.x) / 520.0, (z - bank.y) / 300.0).length()
	var shoal := exp(-bk * bk) * 0.55
	return clampf(sh * (0.8 + (n - 0.5) * 0.8) - shoal * sh + (1.0 - sh) * 0.02, 0.0, 1.0)


## A cheap smooth value noise on a unit lattice, 0..1: the web's vnoise, its
## 32-bit hash bit for bit.
static func vnoise(x: float, z: float) -> float:
	var xf := floorf(x)
	var zf := floorf(z)
	var xi := int(xf)
	var zi := int(zf)
	var fx := x - xf
	var fz := z - zf
	var u := fx * fx * (3.0 - 2.0 * fx)
	var v := fz * fz * (3.0 - 2.0 * fz)
	var h00 := _hash(xi, zi)
	var h10 := _hash(xi + 1, zi)
	var h01 := _hash(xi, zi + 1)
	var h11 := _hash(xi + 1, zi + 1)
	var a := h00 + (h10 - h00) * u
	var b := h01 + (h11 - h01) * u
	return a + (b - a) * v


static func _hash(i: int, j: int) -> float:
	var n := (i * 374761393 + j * 668265263) & 0xFFFFFFFF
	n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
	return (n ^ (n >> 16)) / 4294967295.0


## Soundings, in fathoms, where a leadsman might have dropped a line: well
## off the archipelagos, inside the known sea, never two close together.
func _sound() -> void:
	soundings.clear()
	_seed = 90210
	for n in 900:
		if soundings.size() >= 110:
			break
		var x := sea.position.x + _rnd() * sea.size.x
		var z := sea.position.y + _rnd() * sea.size.y
		if nearest(x, z) < 1200.0 or edge(x, z) > -90.0:
			continue
		var close := false
		for s in soundings:
			if Vector2(s.x - x, s.y - z).length() < 520.0:
				close = true
				break
		if close:
			continue
		var d := depth(x, z)
		soundings.append(Vector3(x, z, roundf(20.0 + d * d * 1500.0)))


# the web's soundings generator, its 32-bit steps bit for bit
func _rnd() -> float:
	_seed = (Mulberry32._imul(_seed ^ (_seed >> 15), 2246822507) + 0x9e3779b9) & 0xFFFFFFFF
	return _seed / 4294967296.0


## Engraves whatever isn't yet, an engraving a frame (`host`: a node in the
## tree to hang the canvases on while they draw).
func build(host: Node) -> void:
	# (a headless run draws nothing to read back: the chart goes unengraved)
	if _building or drawn() or DisplayServer.get_name() == "headless":
		return
	_building = true
	for r in regions:
		if isle_tex.has(r.id):
			continue
		var m := ShaderMaterial.new()
		m.shader = preload("res://shaders/chart_isles.gdshader")
		m.set_shader_parameter("height_tex", r.height_tex)
		m.set_shader_parameter("height_rect", r.height_rect())
		m.set_shader_parameter("corner", Vector2(r.x0, r.z0))
		m.set_shader_parameter("size", Region.SIZE)
		m.set_shader_parameter("res", float(ISLE_PX))
		m.set_shader_parameter("mist", r.biome > 0.5)
		isle_tex[r.id] = await _engrave(host, m, Vector2i(ISLE_PX, ISLE_PX), true)
	if sea_tex == null:
		var h := roundi(SEA_PX * sea.size.y / sea.size.x)
		var m := ShaderMaterial.new()
		m.shader = preload("res://shaders/chart_sea.gdshader")
		m.set_shader_parameter("frame", Vector3(sea.position.x, sea.position.y, sea.size.x / SEA_PX))
		m.set_shader_parameter("px", Vector2(SEA_PX, h))
		if regions.size() >= 2:
			m.set_shader_parameter("home", Vector2(regions[0].centre.x, regions[0].centre.z))
			m.set_shader_parameter("away", Vector2(regions[1].centre.x, regions[1].centre.z))
		m.set_shader_parameter("bank", bank)
		m.set_shader_parameter("edge_r", World.EDGE_R)
		var pts := PackedVector2Array()
		var l := lane()
		for k in 13:
			pts.append(l.at(k / 12.0) if l != null else Vector2(1e6, 1e6))
		m.set_shader_parameter("lane", pts)
		sea_tex = await _engrave(host, m, Vector2i(SEA_PX, h), false)
	_building = false


## Whether every engraving is drawn.
func drawn() -> bool:
	return sea_tex != null and isle_tex.size() >= regions.size()


## One engraving: the shader drawn once into a canvas of its own, read back
## and mipmapped (so it stays crisp shrunk to a corner of the chart).
static func _engrave(host: Node, m: ShaderMaterial, px: Vector2i, alpha: bool) -> Texture2D:
	var vp := SubViewport.new()
	vp.size = px
	vp.disable_3d = true
	vp.transparent_bg = alpha
	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	var rect := ColorRect.new()
	rect.size = Vector2(px)
	rect.material = m
	vp.add_child(rect)
	host.add_child(vp)
	await RenderingServer.frame_post_draw
	var img := vp.get_texture().get_image()
	vp.queue_free()
	if img == null or img.is_empty():
		return null
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)
