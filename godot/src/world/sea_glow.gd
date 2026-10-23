class_name SeaGlow
## Sea-spark blooms (the web game's world/seaGlow.ts): stretches of the high
## seas thick with glowing plankton. By day they are just open water; on a
## dark night every wake, bow wave, breaking crest and splash in them lights
## up electric blue. The blooms lie in broad warped patches (a few hundred
## metres to a kilometre across) only out past the archipelagos, and one or
## two always lie across the crossing to Las Brumas. The sea draws the very
## same field (sea_glow_at, shaders/ocean.gdshader), from the centres handed
## to it.

## Shifts the pattern so the crossing between the archipelagos runs through two blooms.
const OX := 4200.0
const OZ := 1350.0
## The blooms only start this far from every archipelago's centre (m: just
## past the edge of the high seas), and come in over the next stretch.
const START := 1420.0
const RAMP := 360.0


## How thick the bloom is at (x, z): 0 none .. 1 the heart of one.
## `centres`: every archipelago's (x, z).
static func at(x: float, z: float, centres: PackedVector2Array) -> float:
	var d := INF
	for c in centres:
		d = minf(d, Vector2(x - c.x, z - c.y).length())
	var open := MathX.smooth(START, START + RAMP, d)
	if open <= 0.0:
		return 0.0
	var px := x + OX
	var pz := z + OZ
	var g := sin(px * 0.0021 + 1.7 * sin(pz * 0.0013 + 0.4)) * sin(pz * 0.0026 + 1.5 * sin(px * 0.0011 + 2.2))
	return open * MathX.smooth(0.22, 0.52, g)
