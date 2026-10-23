class_name World
extends RefCounted
## The sea every ship shares: its swell, the breeze, the canvas of disturbed
## water, the particles, the ships on it, the shot flying between them and
## the wreckage they leave, and the clock. Blows struck and ships lost are
## told through its signals.

## The edge of the known sea: a long oval this far (m) round every archipelago
## and the lanes between them. Beyond it the swell turns you back.
const EDGE_R := 1700.0

## A ball struck a hull: `dealt` is the damage done.
signal hit(ship: Ship, attacker: Ship, dealt: float, at: Vector3)
## A ship's last blow: she is going down.
signal sunk(ship: Ship, attacker: Ship)
## Something the camera should feel (a broadside, a hit, a magazine going up), 0..1.
signal shook(amount: float)
## A bite of the flames burning her (fire shot): `dealt` is the damage done.
signal burned(ship: Ship, attacker: Ship, dealt: float)
## A special shot left its mark: "ablaze", "shredded" or "crew".
signal status(ship: Ship, what: String, attacker: Ship)

var waves: Waves
var wind: Wind
var wake: WakeField
var fx: Particles
var shots: Shots
var debris: Debris
var loot: Loot
## The voyage's sound: everything out on the water is heard through it.
var sound: Sound
## Every ship afloat (and every wreck still going down): yours first.
var ships: Array[Ship] = []
## Where the voyage is heard from (the camera's focus), and how far off it hangs.
var listener := Vector3.ZERO
var listener_zoom := 100.0
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


## How loudly something at `p` carries to the listener (0..1): the web game's
## falloff, so far-off cannon only rumble and barely shake the view.
func loudness(p: Vector3) -> float:
	var d := Vector2(p.x - listener.x, p.z - listener.z).length()
	var r := listener_zoom * 0.9
	return minf(1.0, r / (r + d * 1.4))


## How something at `p` is heard (the web's soundAt): how loud (0..1), where
## across the view (-1 left .. 1 right, more past the edges: the camera looks
## north, so right is +x) and how far off (m).
func heard(p: Vector3) -> Vector3:
	var dx := p.x - listener.x
	var d := Vector2(dx, p.z - listener.z).length()
	var r := listener_zoom * 0.9
	return Vector3(minf(1.0, r / (r + d * 1.4)), dx / (r * 0.8), d)
