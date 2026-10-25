class_name ShorePad
extends Control
## The blades ashore on a touch screen, bottom right where the guns were (the
## web's .shore-pad): a big gold Strike for the cutlass, with the Pistol
## riding beside it, its ring filling as the ball is rammed home and gold
## once it's loaded. Both act on contact, so a thumb can walk while the
## other fights. (The Jump sits over Strike: the HUD places it.)

signal strike
signal pistol

const SIDE := FirePad.SIDE
const MAIN := FirePad.MAIN
const GAP := 12.0 * HudStyle.KT
## The pistol rides this much higher than Strike's foot.
const LIFT := 30.0 * HudStyle.KT

var _strike: FirePad._Button
var _pistol: FirePad._Button


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pistol = FirePad._Button.new(1, SIDE, "pistol", "PISTOL")
	_strike = FirePad._Button.new(0, MAIN, "cutlass", "STRIKE")
	add_child(_pistol)
	add_child(_strike)
	_pistol.pressed.connect(func(_s: int) -> void: pistol.emit())
	_strike.pressed.connect(func(_s: int) -> void: strike.emit())
	custom_minimum_size = Vector2(SIDE + GAP + MAIN, maxf(MAIN, SIDE + LIFT))
	size = custom_minimum_size
	_pistol.position = Vector2(0.0, size.y - LIFT - SIDE)
	_strike.position = Vector2(SIDE + GAP, size.y - MAIN)


## Each frame: the pistol's load (0 just fired .. 1 loaded), and whether a
## fight is on (Strike warms).
func show_state(load: float, fight: bool) -> void:
	_pistol.show_state(clampf(load, 0.0, 1.0), load >= 1.0, false, fight and load >= 1.0)
	_strike.show_state(1.0, true, false, fight)


## The Strike button's centre (for the Jump to ride over it).
func strike_centre() -> Vector2:
	return position + _strike.position + _strike.size * 0.5
