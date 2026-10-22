class_name World
extends RefCounted
## The sea every ship shares: its swell, the breeze, the canvas of disturbed
## water, the particles and the clock.

## The edge of the known sea: a long oval this far (m) round every archipelago
## and the lanes between them. Beyond it the swell turns you back.
const EDGE_R := 1700.0

var waves: Waves
var wind: Wind
var wake: WakeField
var fx: Particles
## The archipelago under the sea the camera is on (null out on the open ocean before any is loaded).
var region: Region
## Every archipelago, for whatever lies outside the camera's.
var regions: Array[Region] = []
## Seconds of play.
var time := 0.0


func water_height(x: float, z: float) -> float:
	return waves.height_at(x, z, water_damp(x, z))


## The swell dies down over the shallows (the web's World.waterDamp).
func water_damp(x: float, z: float) -> float:
	var r := region_at(x, z)
	if r == null:
		return 1.0
	return clampf(-r.height_at(x, z) / 8.0, 0.12, 1.0)


## The ground's height (m) at (x, z): the seabed, or the island.
func ground_height(x: float, z: float) -> float:
	var r := region_at(x, z)
	return r.height_at(x, z) if r != null else Region.FLOOR_DEPTH


## The slope of the ground (dh/dx, dh/dz) at (x, z).
func ground_gradient(x: float, z: float) -> Vector2:
	var r := region_at(x, z)
	return r.gradient_at(x, z) if r != null else Vector2.ZERO


## How much living reef lies under (x, z): 0 open water or island shelf .. 1 coral.
func reef_at(x: float, z: float) -> float:
	var r := region_at(x, z)
	return r.reef_at(x, z) if r != null else 0.0


## The archipelago whose square holds (x, z), or null out on the high seas.
func region_at(x: float, z: float) -> Region:
	if region != null and region.contains(x, z):
		return region
	for r in regions:
		if r.contains(x, z):
			return r
	return null


## How far (x, z) lies past the edge of the known sea (z, m; negative
## inside), and which way is back (x, y: a unit step in x, z).
func past_edge(x: float, z: float) -> Vector3:
	var p := Vector2(x, z)
	var best := INF
	var back := Vector2.ZERO
	for i in regions.size():
		var a := Vector2(regions[i].centre.x, regions[i].centre.z)
		for j in range(i, regions.size()):
			var q := Geometry2D.get_closest_point_to_segment(p, a, Vector2(regions[j].centre.x, regions[j].centre.z))
			var d := p.distance_to(q)
			if d < best:
				best = d
				back = (q - p) / maxf(d, 1e-3)
	return Vector3(back.x, back.y, best - EDGE_R) if best < INF else Vector3(0.0, 0.0, -EDGE_R)


func gust_at(x: float, z: float) -> float:
	return wind.gust_at(x, z)
