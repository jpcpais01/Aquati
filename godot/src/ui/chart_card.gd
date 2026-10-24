class_name ChartCard
extends Control
## The little card the sea chart opens over whatever you tap on it (the web
## game's .chart-card, src/ui/helm.ts): the place named under a kicker in its
## mark's colour, how far and how long, a warning in coral if there's one, and
## the word to sail there ("Stop sailing" once she's bound there) and, over a
## waypoint, "Lift pin". It stands over its mark (under it when there's no
## room above), never off the chart's edges, its tail pointing at the mark.
## Sized in the web's CSS pixels (it sits in the chart's frame, unscaled).

signal sail
signal stop
signal lift
signal closed

const PX := HudStyle.PX
## The card's glass, top and foot.
const TOP := Color(14.0 / 255.0, 30.0 / 255.0, 40.0 / 255.0, 0.96)
const FOOT := Color(6.0 / 255.0, 16.0 / 255.0, 24.0 / 255.0, 0.95)
const WARN := Color("#ffb59a")

var _box: UiBox
var _tail: Control
var _kick: UiText
var _name: UiText
var _sub: UiText
var _warn: UiText
var _go: UiButton
var _go_icon: TextureRect
var _go_text: UiText
var _lift: UiButton
var _x: UiButton
var _accent := HudStyle.GOLD
var _edge := Color.WHITE
var _pin := false
var _bound := false
var _open := false
## Seconds since it came up or hopped to a new place (and which), and the rock of the sail icon.
var _t := 9.0
var _hop := false
var _rock := 0.0
var _below := false
var _tail_x := 0.0
var _at := Vector2(-1.0, -1.0)
var _frame := Vector2.ZERO


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	set_process(false)
	_box = UiBox.new(Vector2(200.0, 120.0) * PX, 18.0 * PX, 70.0 * PX)
	_box.p("c_top", TOP).p("c_foot", FOOT).p("hi", 0.09).p("hi_px", PX)
	_box.p("c_shadow", Color(0.0, 0.0, 0.0, 0.5)).p("shadow", Vector2(18.0, 44.0) * PX).p("glow", 22.0 * PX)
	add_child(_box)
	_tail = Control.new()
	_tail.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tail.draw.connect(_draw_tail)
	add_child(_tail)
	# (lines as the web sets them: at line-height normal, Inter's 1.21 and the
	# serif's 1.36 as phones draw Georgia, the name at 1.2)
	_kick = UiText.new([["", HudStyle.font("inter", 700, roundi(0.18 * 9.5 * PX)), roundi(9.5 * PX), _accent]], 0.0, 1.21, true)
	_name = UiText.new([["", HudStyle.font("cinzel", 700, roundi(0.03 * 16.0 * PX)), roundi(16.0 * PX), HudStyle.INK]], 0.0, 1.2, true)
	_sub = UiText.new([["", HudStyle.tnum(HudStyle.font("inter", 600)), roundi(11.5 * PX), HudStyle.INK_2]], 0.0, 1.21, true)
	_warn = UiText.new([["", HudStyle.font("serif-italic", 500), roundi(11.5 * PX), WARN]], 0.0, 1.36, true)
	for t: UiText in [_kick, _name, _sub, _warn]:
		add_child(t)
	# Sail there (gold), or Stop sailing (glass) once she's bound there
	_go = UiButton.new(Vector2(120.0, 38.0) * PX, 19.0 * PX, 30.0 * PX)
	_go.squeeze = 0.95
	_go.mouse_filter = Control.MOUSE_FILTER_STOP
	_go_icon = Icons.rect("sail", 18.0 * PX)
	_go_icon.pivot_offset = _go_icon.size * 0.5
	_go_text = UiText.new([["Sail there", HudStyle.font("inter", 700), roundi(13.0 * PX), HudStyle.GOLD_INK]], 0.0, 1.21)
	_go.add_child(_go_icon)
	_go.add_child(_go_text)
	_go.pressed.connect(func() -> void:
		if _bound:
			stop.emit()
		else:
			sail.emit())
	add_child(_go)
	_lift = UiButton.new(Vector2(96.0, 38.0) * PX, 19.0 * PX, 4.0)
	_lift.squeeze = 0.95
	_lift.mouse_filter = Control.MOUSE_FILTER_STOP
	var glass := Color(1.0, 1.0, 1.0, 0.06)
	MenuKit.flat(_lift).p("c_top", glass).p("c_foot", glass).p("c_border", Color(1.0, 1.0, 1.0, 0.16)).p("hi", 0.0)
	var li := Icons.rect("pin_off", 16.0 * PX, HudStyle.INK_2)
	var lt := UiText.new([["Lift pin", HudStyle.font("inter", 700), roundi(13.0 * PX), HudStyle.INK_2]], 0.0, 1.21)
	var lw := (11.0 + 16.0 + 7.0 + 14.0 + 2.0) * PX + lt.size.x
	_lift.resize(Vector2(lw, 38.0 * PX))
	li.position = Vector2(12.0 * PX, 11.0 * PX)
	MenuKit.line_at(lt, 12.0 * PX + 16.0 * PX + 7.0 * PX, 0.0, 38.0 * PX)
	_lift.add_child(li)
	_lift.add_child(lt)
	_lift.pressed.connect(func() -> void: lift.emit())
	add_child(_lift)
	_x = UiButton.new(Vector2(26.0, 26.0) * PX, 13.0 * PX, 2.0)
	_x.squeeze = 1.0
	_x.mouse_filter = Control.MOUSE_FILTER_STOP
	MenuKit.flat(_x).p("c_top", Color.TRANSPARENT).p("c_foot", Color.TRANSPARENT).p("border", 0.0).p("hi", 0.0)
	var xi := Icons.rect("x", 15.0 * PX, HudStyle.INK_3)
	xi.position = Vector2(5.5, 5.5) * PX
	_x.add_child(xi)
	_x.pressed.connect(func() -> void: closed.emit())
	add_child(_x)


func is_open() -> bool:
	return _open


## Opens over a place: {kicker, name, sub, warn, accent (Color), pin (a
## waypoint: offer to lift it), bound (she's sailing there: offer to stop)};
## already open, it hops over to the new place.
func show_place(info: Dictionary, frame: Vector2) -> void:
	_frame = frame
	_accent = info.get("accent", HudStyle.GOLD)
	_edge = edge_of(_accent)
	_pin = bool(info.get("pin", false))
	_kick.set_runs([[str(info.get("kicker", "")).to_upper(), _kick.runs[0][1], _kick.runs[0][2], _accent]])
	_name.runs[0][0] = str(info.get("name", ""))
	_sub.runs[0][0] = str(info.get("sub", ""))
	_warn.runs[0][0] = str(info.get("warn", ""))
	_box.p("c_border", _edge).p("c_glow", Color(_accent, 0.14))
	_lift.visible = _pin
	_bound = bool(info.get("bound", false))
	_hop = _open
	_open = true
	visible = true
	_t = 0.0
	_at = Vector2(-1.0, -1.0)
	_lay()
	set_process(true)


## Just the distance line, as she sails on with the chart open.
func set_sub(sub: String) -> void:
	if _open and str(_sub.runs[0][0]) != sub:
		_sub.runs[0][0] = sub
		_lay()


## She's bound for this place (or not): its button says so.
func set_bound(b: bool) -> void:
	if b == _bound:
		return
	_bound = b
	if _open:
		_lay()


func hide_card() -> void:
	if not _open:
		return
	_open = false
	visible = false
	set_process(false)
	for b: UiButton in [_go, _lift, _x]:
		b.cancel()


## Stands the card over its mark, `at` on the chart's canvas, inside a frame
## `w` by `h`: above it when there's room, else below; never off the edges.
func place(at: Vector2, w: float, h: float) -> void:
	if not _open:
		return
	_frame = Vector2(w, h)
	var cw := size.x
	var ch := size.y
	var below := at.y - ch - 34.0 * PX < 64.0 * PX
	var px := roundf(clampf(at.x - cw * 0.5, 10.0 * PX, w - cw - 10.0 * PX))
	var py := roundf(clampf(at.y + 26.0 * PX if below else at.y - ch - 30.0 * PX, 10.0 * PX, h - ch - 10.0 * PX))
	var tail := clampf(at.x - px, 18.0 * PX, cw - 18.0 * PX)
	if Vector2(px, py) != _at or below != _below or tail != _tail_x:
		_at = Vector2(px, py)
		_below = below
		_tail_x = tail
		_tail.queue_redraw()
	_animate()


## The border: the mark's colour mixed 38% into a faint white (the web's color-mix, premultiplied).
static func edge_of(c: Color) -> Color:
	var a := 0.38 * c.a + 0.62 * 0.1
	var rgb := (Vector3(c.r, c.g, c.b) * 0.38 * c.a + Vector3.ONE * 0.062) / a
	return Color(rgb.x, rgb.y, rgb.z, a)


## Lays its lines and buttons out, as wide as the widest of them (190 to 280 px).
func _lay() -> void:
	var pad := 14.0 * PX
	_go_text.set_text("Stop sailing" if _bound else "Sail there")
	var go_w := (11.0 + 18.0 + 7.0 + 14.0) * PX + _go_text.size.x
	var row := go_w + ((6.0 * PX + _lift.size.x) if _pin else 0.0)
	for t: UiText in [_name, _sub, _warn]:
		t.wrap = 0.0
		t.set_runs(t.runs)
	var inner := maxf(maxf(_kick.size.x + 22.0 * PX, _name.size.x + 18.0 * PX), maxf(maxf(_sub.size.x, _warn.size.x), row))
	var most := minf(280.0 * PX, _frame.x - 20.0 * PX) if _frame.x > 0.0 else 280.0 * PX
	var cw := roundf(clampf(inner + 2.0 * pad + 2.0, 190.0 * PX, maxf(190.0 * PX, most)))
	var in_w := cw - 2.0 * pad - 2.0
	# long names and lines wrap inside it
	_name.wrap = in_w - 18.0 * PX
	_sub.wrap = in_w
	_warn.wrap = in_w
	for t: UiText in [_name, _sub, _warn]:
		t.set_runs(t.runs)
	var y := 12.0 * PX + 1.0
	_kick.position = Vector2(pad + 1.0, y)
	y += _kick.size.y + 3.0 * PX
	_name.position = Vector2(pad + 1.0, y)
	y += _name.size.y + 3.0 * PX
	_sub.position = Vector2(pad + 1.0, y)
	y += _sub.size.y + 3.0 * PX
	var warned := str(_warn.runs[0][0]) != ""
	_warn.visible = warned
	if warned:
		_warn.position = Vector2(pad + 1.0, y)
		y += _warn.size.y + 3.0 * PX
	y += 8.0 * PX
	var lift_w := (_lift.size.x + 6.0 * PX) if _pin else 0.0
	_go.resize(Vector2(in_w - lift_w, 38.0 * PX))
	_go.position = Vector2(pad + 1.0, y)
	_lift.position = Vector2(pad + 1.0 + in_w - _lift.size.x, y)
	var need := 18.0 * PX + 7.0 * PX + _go_text.size.x
	var gx := (_go.size.x - need) * 0.5
	_go_icon.position = Vector2(gx, 10.0 * PX)
	MenuKit.line_at(_go_text, gx + 18.0 * PX + 7.0 * PX, 0.0, 38.0 * PX)
	_look_go()
	var ch := roundf(y + 38.0 * PX + 12.0 * PX + 1.0)
	size = Vector2(cw, ch)
	_box.resize(size)
	_tail.size = size
	_x.position = Vector2(cw - 6.0 * PX - _x.size.x, 6.0 * PX)
	_tail.queue_redraw()


## The button's look: gold to set off, glass (in ink, its sail rocking) once she's bound there.
func _look_go() -> void:
	var ink := HudStyle.INK if _bound else HudStyle.GOLD_INK
	_go_text.runs[0][3] = ink
	_go_text.set_runs(_go_text.runs)
	_go_icon.self_modulate = ink
	if _bound:
		var fill := Color(1.0, 1.0, 1.0, 0.1)
		MenuKit.flat(_go).p("c_top", fill).p("c_mid", fill).p("mid", -1.0).p("c_foot", fill).p("border", 1.0).p("c_border", Color(1.0, 1.0, 1.0, 0.18)).p("hi", 0.0)
	else:
		_go.p("c_top", HudStyle.GOLD_TOP).p("c_mid", HudStyle.GOLD_MID).p("mid", 0.52).p("c_foot", HudStyle.GOLD_FOOT).p("border", 0.0)
		_go.p("c_shadow", Color(240.0 / 255.0, 180.0 / 255.0, 70.0 / 255.0, 0.3)).p("shadow", Vector2(6.0, 18.0) * PX).p("hi", 0.5).p("hi_px", PX)
	_go_icon.rotation = 0.0
	_go_icon.position.y = 10.0 * PX


func _process(dt: float) -> void:
	_t += dt
	if _bound:
		# the sail rocks gently while she's bound there (the web's ccRock, 2.4 s)
		_rock = fmod(_rock + dt / 2.4, 1.0)
		var s := 0.5 - 0.5 * cos(_rock * TAU)
		_go_icon.rotation = deg_to_rad(-8.0) * s
		_go_icon.position.y = 10.0 * PX - 1.0 * PX * s
	_animate()


## Coming up (0.32 s, rising 8 px from 90% on the web's spring, about its
## tail) or hopping to a new place (0.3 s, from 94% and faint).
func _animate() -> void:
	var dur := 0.3 if _hop else 0.32
	var k := clampf(_t / dur, 0.0, 1.0)
	var e := HudStyle.spring(k)
	var s := lerpf(0.94 if _hop else 0.9, 1.0, e)
	pivot_offset = Vector2(_tail_x, 0.0 if _below else size.y)
	scale = Vector2(s, s)
	modulate.a = clampf(lerpf(0.4 if _hop else 0.0, 1.0, e), 0.0, 1.0)
	position = _at + Vector2(0.0, 0.0 if _hop else (1.0 - e) * 8.0 * PX)


## The little tail pointing down at the mark (or up, when the card stands under it).
func _draw_tail() -> void:
	# (the web's 12 px square turned 45°, centred on the card's edge)
	var r := 6.0 * sqrt(2.0) * PX
	var c := Vector2(_tail_x + 1.0 * PX, 0.0 if _below else size.y)
	var tip := Vector2(0.0, -r if _below else r)
	var pts := PackedVector2Array([c - tip, c + Vector2(r, 0.0), c + tip, c - Vector2(r, 0.0)])
	_tail.draw_colored_polygon(pts, TOP if _below else FOOT)
	_tail.draw_polyline(PackedVector2Array([c - Vector2(r, 0.0), c + tip, c + Vector2(r, 0.0)]), _edge, 1.0 * PX, true)
