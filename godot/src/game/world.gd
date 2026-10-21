class_name World
extends RefCounted
## The sea every ship shares: its swell, the breeze, the canvas of disturbed
## water, the particles and the clock.

var waves: Waves
var wind: Wind
var wake: WakeField
var fx: Particles
## Seconds of play.
var time := 0.0


func water_height(x: float, z: float) -> float:
	return waves.height_at(x, z)


func gust_at(x: float, z: float) -> float:
	return wind.gust_at(x, z)
