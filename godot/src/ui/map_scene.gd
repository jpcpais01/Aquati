class_name MapScene
extends RefCounted
## What the minimap and the sea chart show, as the game keeps it: the ships
## and the plunder afloat (the world's), the archipelagos and their isles,
## the trading ports, the isles charted this voyage, the waypoints, and the
## ship you sail. The game sets it up once and keeps her current.

## Past this far from every archipelago's heart you're on the high seas.
const HIGH_SEAS_R := 1380.0

var world: World
var player: Ship
var ports: Array[TradePort] = []
## The isles charted this voyage ("region id/isle id").
var discovered := {}
var pins: Waypoints
## The helmsman's course from her bow to her goal (x, z), while he has the wheel.
var route := PackedVector2Array()
## The island forts, and whose they are: {x, z, name, ours, quiet} each.
var forts: Array[Dictionary] = []


## The archipelago whose heart lies nearest (x, z), and how far that is.
func nearest_region(x: float, z: float) -> Array:
	var best: Region = null
	var bd := INF
	for r in world.regions:
		var d := Vector2(r.centre.x - x, r.centre.z - z).length()
		if d < bd:
			bd = d
			best = r
	return [best, bd]


## Whether an isle has been charted this voyage.
func known(r: Region, isl: Dictionary) -> bool:
	return discovered.has("%s/%d" % [r.id, int(isl.id)])


## Where a trading port's quay stands (x, z).
static func port_at(tp: TradePort) -> Vector2:
	return Vector2(float(tp.site.x), float(tp.site.z))


## Distance as a sailor reads it: metres up close (to ten), kilometres beyond
## (the web's fmtDist).
static func distance(m: float) -> String:
	if m < 1000.0:
		return "%d m" % (roundi(m / 10.0) * 10)
	return ("%.1f km" if m < 10000.0 else "%.0f km") % (m / 1000.0)
