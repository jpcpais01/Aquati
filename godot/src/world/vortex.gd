class_name Vortex
extends RefCounted
## The shape of a maelstrom's water (the web's world/vortex.ts), shared by
## the ocean (shaders/inc/vortex.gdshaderinc, its GLSL twin) and the
## buoyancy, so a ship caught in one heels down the very funnel you see. The
## sea sinks in a broad bowl toward the eye, then falls away down steep
## walls into a throat tens of metres deep (the bake carves an abyss in the
## seabed under it); the swell flattens as the spinning water smooths it.
## See game/hazards.gd for the currents and everything else a maelstrom does.

## At most this many maelstroms turn at once (a global shader slot each).
const N := 4
## Depth of the bowl and of the throat at full strength, for a 100 m maelstrom (m).
const BOWL := 8.0
const THROAT := 30.0
## Radius of the throat (where it is half its depth), as a fraction of the radius.
const THROAT_W := 0.12
const C2 := THROAT_W * THROAT_W
## The ring mesh reaches a little past the rim, tucked under the flat sea it joins.
const RIM := 1.1

var x := 0.0
var z := 0.0
## Radius of its pull (m).
var r := 100.0
## Strength 0 (still) .. ~1.3 (raging in a storm).
var k := 1.0
## Which way it turns: 1 anticlockwise seen from above, -1 clockwise.
var dir := 1


func _init(p_x := 0.0, p_z := 0.0, p_r := 100.0, p_dir := 1) -> void:
	x = p_x
	z = p_z
	r = p_r
	dir = p_dir


## Bigger maelstroms dig deeper, but less than in proportion.
static func depth_scale(radius: float) -> float:
	return sqrt(radius / 100.0)


## The deepest a maelstrom of radius `radius` draws the sea down at strength `strength` (m).
static func depth(radius: float, strength: float) -> float:
	return absf(strength) * depth_scale(radius) * (BOWL + THROAT)


## How far the surface is drawn down at (px, pz) (m, positive = lower).
func dip(px: float, pz: float) -> float:
	if k <= 0.0:
		return 0.0
	var u := Vector2(px - x, pz - z).length() / r
	if u >= 1.0:
		return 0.0
	var f := 1.0 - u
	var g := 1.0 - u * u
	return k * depth_scale(r) * (BOWL * f * f + THROAT * C2 / (u * u + C2) * g * g)


## How much of the swell survives at (px, pz): the turning water smooths it out.
func calm(px: float, pz: float) -> float:
	if k <= 0.0:
		return 1.0
	var u := Vector2(px - x, pz - z).length() / r
	return 1.0 - minf(0.8, 0.65 * k) * (1.0 - MathX.smooth(0.3, 1.0, u))


## Its global shader slot: x, z, radius, strength * direction (still: strength 0).
func packed() -> Vector4:
	return Vector4(x, z, r, k * dir)
