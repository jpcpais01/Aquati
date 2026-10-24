class_name HelmRing
extends Control
## The touch helm under your thumb: a compass ring where the finger went
## down, a bow mark showing where she points now, and an arc of the turn
## still to come out to the knob at the heading you asked for.

const RADIUS := 60.0

var controls: Controls
## The ship's heading (radians, world).
var heading := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func _process(_dt: float) -> void:
	if controls and (controls.helm_down() or visible):
		visible = controls.helm_down()
		queue_redraw()


## Screen direction of a world heading: the camera looks north, so world +X is
## screen right and world +Z screen down.
static func _dir(h: float) -> Vector2:
	return Vector2(sin(h), cos(h))


func _draw() -> void:
	if controls == null or not controls.helm_down():
		return
	var c := controls.helm_origin
	if controls.foot:
		_draw_stick(c)
		return
	draw_circle(c, RADIUS + 14.0, Color(0.04, 0.1, 0.15, 0.42), true, -1.0, true)
	draw_arc(c, RADIUS, 0.0, TAU, 64, Color(1, 1, 1, 0.28), 2.0, true)
	# the bow, where she points now
	var hd := _dir(heading)
	var side := Vector2(-hd.y, hd.x)
	var tip := c + hd * (RADIUS + 9.0)
	draw_colored_polygon(PackedVector2Array([tip, c + hd * (RADIUS - 5.0) + side * 7.0, c + hd * (RADIUS - 5.0) - side * 7.0]), HudStyle.INK)
	if not controls.steering:
		return
	# the turn still to come, then the knob at the heading asked for
	var want := controls.steer_heading
	var turn := MathX.angle_delta(heading, want)
	var a0 := atan2(hd.y, hd.x)
	var steps := maxi(2, int(absf(turn) / 0.08))
	var pts := PackedVector2Array()
	for i in steps + 1:
		# screen angle runs opposite to the heading's sense
		var a := a0 - turn * float(i) / steps
		pts.append(c + Vector2(cos(a), sin(a)) * RADIUS)
	if pts.size() >= 2:
		draw_polyline(pts, HudStyle.GOLD, 4.0, true)
	var wd := _dir(want)
	draw_circle(c + wd * RADIUS, 15.0, Color(0.97, 0.98, 0.99, 0.95), true, -1.0, true)
	draw_circle(c + wd * RADIUS, 15.0, HudStyle.GOLD, false, 2.0, true)
	draw_line(c + wd * (RADIUS - 6.0), c + wd * (RADIUS + 6.0), Color("#1f1404"), 2.0, true)


## Ashore: a plain stick, its base where the thumb went down and the knob
## following it out to the rim (gold once it's pushed to a run).
func _draw_stick(c: Vector2) -> void:
	var r := Controls.STICK * HudStyle.PX
	draw_circle(c, r + 14.0, Color(0.04, 0.1, 0.15, 0.42), true, -1.0, true)
	draw_arc(c, r, 0.0, TAU, 64, Color(1, 1, 1, 0.28), 2.0, true)
	var d := controls.helm_at - c
	var k := minf(d.length(), r) / maxf(d.length(), 1e-3)
	var at := c + d * k
	var running := d.length() > r * 0.94
	draw_circle(at, 17.0, Color(0.97, 0.98, 0.99, 0.95), true, -1.0, true)
	draw_circle(at, 17.0, HudStyle.GOLD if running else Color(1, 1, 1, 0.5), false, 2.0, true)
