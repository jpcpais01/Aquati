class_name AbilityButton
extends Control
## An event ship's power on the HUD (the Hollow Jack's Phantom Run): a disc
## of dark violet glass with a little ghost in it. A ring of ghost-fire runs
## round it as the power comes back after use, and once it's ready the disc
## breathes in jack-o'-lantern orange; while she's in the spirit world it
## glows green and the ring drains away with the time she has left. It fires
## on contact (like the guns), with G beside it on a computer.

signal pressed

const D := 62.0 * HudStyle.KT
## Room round the disc for its glow.
const MARGIN := 18.0
const VIOLET := Color(0.075, 0.04, 0.11, 0.86)
const GREEN := Color("#7dffc0")
const ORANGE := Color("#ff9a2a")

var _ready01 := 1.0
var _ghost := 0.0
var _left := 0.0
var _on := false
var _e_ready := 1.0
var _flash := 0.0
var _key := false
var _label: Label
var _t := 0.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(D, D) + Vector2.ONE * MARGIN * 2.0
	size = custom_minimum_size
	pivot_offset = size * 0.5
	_label = HudStyle.label("PHANTOM", "inter", 800, roundi(9.0 * HudStyle.KT), HudStyle.INK_2, roundi(9.0 * HudStyle.KT * 0.16))
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_label)
	_label.size = Vector2(size.x, _label.get_minimum_size().y)
	_label.position = Vector2(0.0, MARGIN + D * 0.73)


## Shows the G beside it (a computer's keys).
func show_key(on: bool) -> void:
	if on != _key:
		_key = on
		queue_redraw()


## Each frame: how ready the power is (0 .. 1), how far she's crossed over
## (0 .. 1) and, while she's over, the share of her time left.
func show_state(ready01: float, ghost: float, left: float) -> void:
	var was := _ready01 >= 1.0
	_ready01 = ready01
	_ghost = ghost
	_left = left
	if ready01 >= 1.0 and not was:
		_flash = 1.0
	_on = ready01 >= 1.0


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_t += delta
	_e_ready += ((1.0 if _on else 0.0) - _e_ready) * minf(1.0, delta * 8.0)
	_flash = maxf(0.0, _flash - delta * 1.4)
	queue_redraw()


func _gui_input(event: InputEvent) -> void:
	var down: bool = (event is InputEventScreenTouch and event.pressed) or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT)
	if not down:
		return
	var p: Vector2 = event.position
	if p.distance_to(size * 0.5) > D * 0.5 + 6.0:
		return
	accept_event()
	pressed.emit()


func _draw() -> void:
	var c := size * 0.5
	var r := D * 0.5
	var breath := 0.5 + 0.5 * sin(_t * 3.2)
	var hot := ORANGE.lerp(GREEN, _ghost)
	# the glow: orange breathing while it's ready, green while she's a ghost, a burst when it comes back
	var glow := _e_ready * (0.35 + 0.25 * breath) * (1.0 - _ghost) + _ghost * 0.7 + _flash
	if glow > 0.01:
		for i in 4:
			var g := hot
			g.a = glow * 0.13 * (1.0 - i / 4.0)
			draw_circle(c, r + 3.0 + i * 4.0, g)
	draw_circle(c, r, VIOLET.lerp(Color(0.05, 0.16, 0.12, 0.9), _ghost))
	draw_arc(c, r - 0.5, 0.0, TAU, 48, Color(1, 1, 1, 0.14), 1.2, true)
	# the ring: filling back up, full and warm, or draining while she's over
	var w := 4.0 * HudStyle.KT
	var share := _left if _ghost > 0.0 else _ready01
	var ring := GREEN if _ghost > 0.0 or _ready01 < 1.0 else ORANGE
	draw_arc(c, r - w * 0.5 - 2.0, 0.0, TAU, 48, Color(1, 1, 1, 0.08), w, true)
	if share > 0.0:
		var a0 := -PI * 0.5
		draw_arc(c, r - w * 0.5 - 2.0, a0, a0 + TAU * share, maxi(8, roundi(48 * share)), Color(ring, 0.95 if _on or _ghost > 0.0 else 0.6), w, true)
	# the ghost: a round head, a body falling to a ragged hem, two dark eyes
	var gs := r * 0.46
	var gc := c + Vector2(0.0, -r * 0.1)
	var ink := Color("#eafff4").lerp(GREEN, 0.25 + 0.5 * _ghost)
	if not _on and _ghost <= 0.0:
		ink.a = 0.45
	var pts := PackedVector2Array()
	for i in 13:
		var a := PI + PI * i / 12.0
		pts.append(gc + Vector2(cos(a), sin(a)) * gs * 0.62)
	var sway := sin(_t * 2.6) * gs * 0.06
	pts.append(gc + Vector2(gs * 0.62 + sway, gs * 0.75))
	for i in 7:
		var x := gs * (0.62 - 1.24 * (i + 1) / 7.0)
		var y := gs * (0.75 if i % 2 == 1 else 0.98) + sin(_t * 4.0 + i) * gs * 0.04
		pts.append(gc + Vector2(x + sway, y))
	draw_colored_polygon(pts, ink)
	var eye := Color(0.05, 0.03, 0.08, 0.9 if ink.a > 0.5 else 0.5)
	for sx: float in [-1.0, 1.0]:
		draw_set_transform(gc + Vector2(sx * gs * 0.24, -gs * 0.08), 0.0, Vector2(0.75, 1.0))
		draw_circle(Vector2.ZERO, gs * 0.13, eye)
	draw_set_transform(gc + Vector2(0.0, gs * 0.28), 0.0, Vector2(0.7, 1.0))
	draw_circle(Vector2.ZERO, gs * 0.1, eye)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if _key:
		# the key on a computer, a little chip on the rim
		var kc := c + Vector2(r * 0.72, -r * 0.72)
		draw_circle(kc, 9.0 * HudStyle.K, Color(0.04, 0.03, 0.06, 0.92))
		draw_arc(kc, 9.0 * HudStyle.K, 0.0, TAU, 24, Color(1, 1, 1, 0.3), 1.0, true)
		var f := HudStyle.font("inter", 800)
		var fs := roundi(10.0 * HudStyle.K)
		var tw := f.get_string_size("G", HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
		draw_string(f, kc + Vector2(-tw.x * 0.5, tw.y * 0.32), "G", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, HudStyle.INK)
