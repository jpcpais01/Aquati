class_name Region
extends RefCounted
## One archipelago's square of the world, as the world bake wrote it
## (tools/world/entry.ts runs the web game's own generator): the 2 m
## heightfield, the ground maps the island shader reads, the surf field, and
## the index of its islands, reefs and sites. Everything is unpacked with
## engine calls (no per-texel script loops), so loading costs a few frames.

const GRID := 1025
const CELL := 2.0
const SIZE := 2048.0
const HALF := 1024.0
## The open ocean between the archipelagos: deep, level seabed (the web's FLOOR_DEPTH).
const FLOOR_DEPTH := -17.0
const ROOT := "res://world/"

var id := ""
var title := ""
var motto := ""
## The square's middle (y 0), and its south-west (min x, min z) corner.
var centre := Vector3.ZERO
var x0 := 0.0
var z0 := 0.0
## 0 the home isles, 1 Las Brumas (pink coral sand, jade turf, karst limestone).
var biome := 0.0
var islands: Array = []
var reefs: Array = []
var ports: Array = []
var forts: Array = []
var camps: Array = []
var maelstroms: Array = []

## Heights (m) row by row along +x, rows along +z from (x0, z0).
var heights := PackedFloat32Array()
## Open-sea coral per grid point (0..255).
var reef := PackedByteArray()
## RG16F, a texel per grid point: the height (the vertex shaders lift the
## ground with it, the sea reads its depth from it) and the open-sea coral.
var height_tex: ImageTexture
## RGBA16F over the square: travel time of a wave to the shore, the seaward
## direction, and the exposure to the swell (the surf, see ground.gdshaderinc).
var shore_tex: ImageTexture
var ground_tex: Texture2D
var cover_tex: Texture2D
var isle_tex: Texture2D


static func load_all() -> Array[Region]:
	var out: Array[Region] = []
	var w: Variant = JSON.parse_string(FileAccess.get_file_as_string(ROOT + "world.json"))
	if not w is Dictionary:
		push_error("world.json is missing: run tools/world/bake_world.mjs")
		return out
	for d: Dictionary in w.regions:
		out.append(Region.new(d))
	return out


static func unpack(path: String, size: int) -> PackedByteArray:
	return FileAccess.get_file_as_bytes(path).decompress(size, FileAccess.COMPRESSION_DEFLATE)


func _init(d: Dictionary) -> void:
	id = d.id
	title = d.name
	motto = d.motto
	centre = Vector3(d.x, 0.0, d.z)
	x0 = d.x0
	z0 = d.z0
	biome = 1.0 if id == "brumas" else 0.0
	islands = d.islands
	reefs = d.reefs
	ports = d.ports
	forts = d.forts
	camps = d.camps
	maelstroms = d.maelstroms
	var dir := ROOT + id + "/"
	var sizes: Dictionary = d.sizes
	var himg := Image.create_from_data(GRID, GRID, false, Image.FORMAT_RGH, unpack(dir + "height.bin", int(sizes.height)))
	height_tex = ImageTexture.create_from_image(himg)
	var hf := himg.duplicate() as Image
	hf.convert(Image.FORMAT_RF)
	heights = hf.get_data().to_float32_array()
	reef = unpack(dir + "reef.bin", int(sizes.reef))
	var res := int(d.shore)
	shore_tex = ImageTexture.create_from_image(Image.create_from_data(res, res, false, Image.FORMAT_RGBAH, unpack(dir + "shore.bin", int(sizes.shore))))
	ground_tex = load(dir + "ground.png")
	cover_tex = load(dir + "cover.png")
	isle_tex = load(dir + "isle.png")


## Whether (x, z) lies in this archipelago's square.
func contains(x: float, z: float) -> bool:
	return absf(x - centre.x) < HALF and absf(z - centre.z) < HALF


## The ground's height (m) at (x, z), bilinear over the grid as the web's Terrain.heightAt.
func height_at(x: float, z: float) -> float:
	if not contains(x, z):
		return FLOOR_DEPTH
	var fx := clampf((x - x0) / CELL, 0.0, GRID - 1.001)
	var fz := clampf((z - z0) / CELL, 0.0, GRID - 1.001)
	var i := int(fx)
	var j := int(fz)
	var tx := fx - i
	var tz := fz - j
	var k := j * GRID + i
	return lerpf(lerpf(heights[k], heights[k + 1], tx), lerpf(heights[k + GRID], heights[k + GRID + 1], tx), tz)


## How much living reef lies under (x, z): 0 open water or island shelf .. 1 coral.
func reef_at(x: float, z: float) -> float:
	if not contains(x, z):
		return 0.0
	var fx := clampf((x - x0) / CELL, 0.0, GRID - 1.001)
	var fz := clampf((z - z0) / CELL, 0.0, GRID - 1.001)
	var i := int(fx)
	var j := int(fz)
	var tx := fx - i
	var tz := fz - j
	var k := j * GRID + i
	return lerpf(lerpf(reef[k], reef[k + 1], tx), lerpf(reef[k + GRID], reef[k + GRID + 1], tx), tz) / 255.0


## The slope of the ground (dh/dx, dh/dz) at (x, z).
func gradient_at(x: float, z: float) -> Vector2:
	return Vector2(height_at(x + CELL, z) - height_at(x - CELL, z), height_at(x, z + CELL) - height_at(x, z - CELL)) / (2.0 * CELL)


## The island whose shore lies nearest (x, z), and how far off it is (m, negative inside).
func nearest_island(x: float, z: float) -> Dictionary:
	var best := {}
	var bd := INF
	for isl: Dictionary in islands:
		var d := Vector2(float(isl.x) - x, float(isl.z) - z).length() - float(isl.r)
		if d < bd:
			bd = d
			best = isl
	return {"island": best, "dist": bd}


## The ground's square as the sea's shaders take it: corner x, corner z,
## size, 1 / size, with the texel centres on the grid points.
func height_rect() -> Vector4:
	return Vector4(x0 - CELL * 0.5, z0 - CELL * 0.5, GRID * CELL, 1.0 / (GRID * CELL))


## The surf field's square: corner x, corner z, size, 1 / size.
func shore_rect() -> Vector4:
	return Vector4(x0, z0, SIZE, 1.0 / SIZE)
