class_name HelmPill
extends Control
## The helmsman's pill (the web game's .helm-ap, src/ui/helm.ts HelmHud): low
## in the middle of the screen while he has the wheel, dark glass edged in
## gold. A ship's wheel that turns as he puts the helm over, where she's
## bound, how far and how long, how she's sailing, a thread of gold along its
## foot filling as the course falls behind her, and a button to take the helm
## back; it flares as she arrives. Laid out again only when its words change.

## The captain takes the helm back.
signal cancel

const K := HudStyle.K
const PX := HudStyle.PX
const EDGE := Color(244.0 / 255.0, 199.0 / 255.0, 101.0 / 255.0, 0.42)
const EDGE_DONE := Color(1.0, 220.0 / 255.0, 140.0 / 255.0, 0.8)
const GLOW := Color(244.0 / 255.0, 190.0 / 255.0, 90.0 / 255.0, 0.16)
const FLARE := Color(1.0, 214.0 / 255.0, 120.0 / 255.0)
const HOW := Color(1.0, 232.0 / 255.0, 190.0 / 255.0, 0.78)
## Seconds for the flare as she arrives.
const FLARE_S := 1.1

var _box: UiBox
var _disc: UiBox
var _wheel: TextureRect
var _kick: UiText
var _name: UiText
var _dist: UiText
var _how: UiText
var _x: UiButton
var _bar: Control
var _key := ""
var _arrived := false
var _on := false
## Coming in or going (s since it last turned), its fade and its rise as they were then and are now.
var _t := 9.0
var _fade_from := 0.0
var _rise_from := 0.0
var _fade := 0.0
var _rise := 0.0
## The wheel's turn (degrees), and the thread of gold: where it's going from and to (0.5 s each step).
var _spin := 0.0
var _deg := 99.0
var _done := 0.0
var _done_from := 0.0
var _done_to := -1.0
var _done_t := 0.0
var _flare := -1.0
## Where it stands: the middle of its foot, and how wide it may grow.
var _foot := Vector2.ZERO
var _most := 600.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	set_process(false)
	_box = UiBox.new(Vector2(300.0, 80.0), 40.0, 90.0 * PX)
	_box.p("c_top", Color(26.0 / 255.0, 22.0 / 255.0, 12.0 / 255.0, 0.88)).p("c_foot", Color(10.0 / 255.0, 10.0 / 255.0, 8.0 / 255.0, 0.86))
	_box.p("c_border", EDGE).p("c_shadow", Color(0.0, 0.0, 0.0, 0.36)).p("shadow", Vector2(12.0, 34.0) * PX)
	_box.p("c_glow", GLOW).p("glow", 18.0 * K).p("hi", 0.1).p("hi_px", PX)
	add_child(_box)
	# the wheel, in a warm glow of its own
	var wd := maxf(30.0 * PX, 36.0 * K)
	_disc = UiBox.new(Vector2(wd, wd), wd * 0.5, 2.0)
	MenuKit.flat(_disc).p("radial", Vector4(0.5, 0.4, 0.781, 0.781)).p("radial_stop", 0.7)
	_disc.p("c_top", Color(1.0, 220.0 / 255.0, 140.0 / 255.0, 0.2)).p("c_foot", Color(1.0, 200.0 / 255.0, 100.0 / 255.0, 0.04)).p("border", 0.0).p("hi", 0.0)
	add_child(_disc)
	_wheel = TextureRect.new()
	_wheel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_wheel.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_wheel.stretch_mode = TextureRect.STRETCH_SCALE
	# (drawn over a wider grid than the wheel's 32, for its glow to spread into)
	var ws := wd * 0.82 * 44.0 / 32.0
	_wheel.texture = Icons.svg("helm-wheel", _wheel_art(), Vector2(ws, ws), Rect2(-6.0, -6.0, 44.0, 44.0))
	_wheel.size = Vector2(ws, ws)
	_wheel.pivot_offset = _wheel.size * 0.5
	_wheel.position = (Vector2(wd, wd) - _wheel.size) * 0.5
	_disc.add_child(_wheel)
	var kfs := roundi(maxf(7.5 * PX, 8.5 * K))
	var nfs := roundi(maxf(11.5 * PX, 13.5 * K))
	_kick = UiText.new([["SAILING TO", HudStyle.font("inter", 700, roundi(0.2 * kfs)), kfs, HudStyle.GOLD]], 0.0, 1.15)
	_name = UiText.new([["", HudStyle.font("cinzel", 700, roundi(0.04 * nfs)), nfs, HudStyle.INK]], 0.0, 1.15)
	_dist = UiText.new([["", HudStyle.tnum(HudStyle.font("inter", 600)), roundi(maxf(10.0 * PX, 11.0 * K)), HudStyle.INK_2]], 0.0, 1.15)
	_how = UiText.new([["", HudStyle.font("serif-italic", 500), roundi(maxf(9.5 * PX, 10.5 * K)), HOW]], 0.0, 1.15)
	for t: UiText in [_kick, _name, _dist, _how]:
		add_child(t)
	# take the helm: the one part of it a finger lands on (kept off the helm and the guns under it)
	var xd := maxf(30.0 * PX, 34.0 * K)
	_x = UiButton.new(Vector2(xd, xd), xd * 0.5, 4.0)
	MenuKit.flat(_x).p("c_top", Color(1.0, 1.0, 1.0, 0.07)).p("c_foot", Color(1.0, 1.0, 1.0, 0.07)).p("c_border", Color(1.0, 1.0, 1.0, 0.14)).p("hi", 0.0)
	_x.squeeze = 0.9
	_x.mouse_filter = Control.MOUSE_FILTER_STOP
	var xi := Icons.rect("x", xd * 0.52, HudStyle.INK_2)
	xi.position = (_x.size - xi.size) * 0.5
	_x.add_child(xi)
	_x.pressed.connect(func() -> void: cancel.emit())
	add_child(_x)
	_bar = Control.new()
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar.draw.connect(_draw_bar)
	add_child(_bar)


## Where it stands: its foot's middle at `foot`, at most `most` wide.
func place(foot: Vector2, most: float) -> void:
	if foot == _foot and most == _most:
		return
	_foot = foot
	_most = most
	if _key != "":
		_lay()


## Showing (and turning the wheel by the helm's `rudder`), or not.
func on() -> bool:
	return _on


## The helmsman's view of her course (Helmsman.view; {} while he hasn't the
## wheel), the rudder he holds, and the frame's seconds.
func show_view(v: Dictionary, rudder: float, dt: float) -> void:
	var want := not v.is_empty()
	if want != _on:
		_on = want
		_fade_from = _fade
		_rise_from = _rise
		_t = 0.0
		if want:
			_done_to = -1.0
			visible = true
		set_process(true)
	if not want:
		return
	var arrived: bool = v.arrived
	var dist := "" if arrived else MapScene.distance(float(v.left)) + ((" · " + eta(float(v.eta))) if float(v.eta) >= 0.0 else "")
	var key := "%s|%s|%s|%s" % [arrived, v.name, dist, v.how]
	if key != _key:
		var was := _arrived
		_key = key
		_arrived = arrived
		_kick.set_text("ARRIVED" if arrived else "SAILING TO")
		_name.set_text(str(v.name))
		_dist.set_text(dist)
		_how.set_text(str(v.how))
		_box.p("c_border", EDGE_DONE if arrived else EDGE)
		_x.visible = not arrived
		if arrived and not was:
			_flare = 0.0
		_lay()
	# the wheel turns the way he puts the helm, and drifts back as she steadies
	_spin += (-rudder * 130.0 - _spin) * minf(1.0, dt * 3.0)
	var deg := roundf(_spin * 2.0) / 2.0
	if deg != _deg:
		_deg = deg
		_wheel.rotation = deg_to_rad(deg)
	var d := roundf(float(v.done) * 400.0) / 400.0
	if d != _done_to:
		_done_from = _done
		_done_to = d
		_done_t = 0.0


## "~3 min", "~40 s", or nothing while she's barely moving (the web's fmtEta).
static func eta(s: float) -> String:
	if s < 0.0:
		return ""
	if s < 50.0:
		return "~%d s" % maxi(10, roundi(s / 10.0) * 10)
	var m := roundi(s / 60.0)
	return "~%d min" % m if m < 60 else "~%d h %d min" % [m / 60, m % 60]


func _process(dt: float) -> void:
	_t += dt
	# in: fading up (0.4 s) and rising 16 px from 94% on the spring (0.6 s); out the same way back
	var to := 1.0 if _on else 0.0
	_fade = lerpf(_fade_from, to, MathX.bezier(0.25, 0.1, 0.25, 1.0, clampf(_t / 0.4, 0.0, 1.0)))
	_rise = lerpf(_rise_from, to, HudStyle.spring(clampf(_t / 0.6, 0.0, 1.0)))
	modulate.a = clampf(_fade, 0.0, 1.0)
	var s := lerpf(0.94, 1.0, _rise)
	scale = Vector2(s, s)
	position = Vector2(roundf(_foot.x - size.x * 0.5), _foot.y - size.y + (1.0 - _rise) * 16.0 * PX)
	# the thread of gold catches up over half a second
	if _done_to >= 0.0 and _done != _done_to:
		_done_t += dt
		_done = lerpf(_done_from, _done_to, minf(1.0, _done_t / 0.5))
		_bar.queue_redraw()
	if _flare >= 0.0:
		_flare += dt
		_flare_step()
	if not _on and _t >= 0.6:
		visible = false
		set_process(false)


## Lays it out round its words: the wheel, the words (the name cut short if
## the pill would grow too wide), the button, the thread along its foot.
func _lay() -> void:
	var wd := _disc.size.x
	var xd := _x.size.x
	var gap := 10.0 * K
	var bw := 1.0
	for t: UiText in [_kick, _name, _how]:
		t.cut_to(0.0)
	var row := _name.size.x + 7.0 * K + _dist.size.x
	var tw := maxf(_kick.size.x, maxf(row, _how.size.x))
	var fixed := bw + 7.0 * K + wd + gap + gap + 4.0 * K + xd + 6.0 * K + bw
	var room := maxf(60.0, _most - fixed)
	if tw > room:
		tw = room
		_kick.cut_to(tw)
		_name.cut_to(maxf(30.0, tw - 7.0 * K - _dist.size.x))
		_how.cut_to(tw)
	# the three lines, each as tall as its font makes it (the web's font
	# shorthands set them back to line-height: normal)
	var lk := _line(_kick)
	var ln := _line(_name)
	var lh := _line(_how)
	var th := lk + ln + lh
	var ch := maxf(maxf(wd, xd), th)
	var w := roundf(fixed + tw)
	var h := roundf(bw + 6.0 * K + ch + 8.0 * K + bw)
	var cy := bw + 6.0 * K + ch * 0.5
	size = Vector2(w, h)
	pivot_offset = size * 0.5
	_box.resize(size)
	_box.p("radius", h * 0.5)
	_disc.position = Vector2(bw + 7.0 * K, roundf(cy - wd * 0.5))
	var tx := bw + 7.0 * K + wd + gap
	var y := cy - th * 0.5
	MenuKit.line_at(_kick, tx, y, lk)
	MenuKit.line_at(_name, tx, y + lk, ln)
	_dist.position = Vector2(tx + _name.size.x + 7.0 * K, _name.position.y + _name.baseline() - _dist.baseline())
	MenuKit.line_at(_how, tx, y + lk + ln, lh)
	_x.position = Vector2(w - bw - 6.0 * K - xd, roundf(cy - xd * 0.5))
	_bar.position = Vector2(bw + 20.0 * K, h - bw - 4.0 * PX)
	_bar.size = Vector2(maxf(0.0, w - 2.0 * bw - 40.0 * K), 2.0 * PX)
	_bar.queue_redraw()


## A line's height at line-height: normal (its font's own ascent and descent, unrounded).
static func _line(t: UiText) -> float:
	var f: Font = t.runs[0][1]
	return (f.get_ascent(1000) + f.get_descent(1000)) * float(t.runs[0][2]) / 1000.0


## The flare as she arrives (the web's apFlare): a broad warm glow swelling
## off the pill and its top edge brightening, a third of the way through,
## then back to its own soft glow.
func _flare_step() -> void:
	var t := _flare / FLARE_S
	if t >= 1.0:
		_flare = -1.0
		_box.p("c_glow", GLOW).p("glow", 18.0 * K).p("glow_spread", 0.0).p("hi", 0.1)
		return
	var c: Color
	var blur: float
	var spread: float
	var hi: float
	if t < 0.35:
		var e := MathX.bezier(0.25, 0.1, 0.25, 1.0, t / 0.35)
		c = Color(FLARE, 0.7).lerp(Color(FLARE, 0.55), e)
		blur = 34.0 * K * e
		spread = 4.0 * K * e
		hi = lerpf(0.1, 0.2, e)
	else:
		var e := MathX.bezier(0.25, 0.1, 0.25, 1.0, (t - 0.35) / 0.65)
		c = Color(FLARE, 0.55).lerp(GLOW, e)
		blur = lerpf(34.0 * K, 18.0 * K, e)
		spread = lerpf(4.0 * K, 0.0, e)
		hi = lerpf(0.2, 0.1, e)
	_box.p("c_glow", c).p("glow", maxf(0.01, blur)).p("glow_spread", spread).p("hi", hi)


## The thread along its foot: a faint track, and the gold filling it from
## the left (pale to bright), a soft glow off its end.
func _draw_bar() -> void:
	var w := _bar.size.x
	var h := _bar.size.y
	if w <= 0.0:
		return
	_bar.draw_rect(Rect2(0.0, 0.0, w, h), Color(1.0, 1.0, 1.0, 0.08))
	var fw := w * clampf(_done, 0.0, 1.0)
	if fw <= 0.5:
		return
	var pale := Color(244.0 / 255.0, 199.0 / 255.0, 101.0 / 255.0, 0.5)
	var bright := Color("#ffe3a0")
	_bar.draw_polygon(PackedVector2Array([Vector2(0.0, 0.0), Vector2(fw, 0.0), Vector2(fw, h), Vector2(0.0, h)]), PackedColorArray([pale, bright, bright, pale]))
	# (its glow, clipped to the thread as the web's is)
	var g := minf(6.0 * PX, w - fw)
	if g > 0.5:
		var lit := Color(1.0, 214.0 / 255.0, 120.0 / 255.0, 0.45)
		var none := Color(lit, 0.0)
		_bar.draw_polygon(PackedVector2Array([Vector2(fw, 0.0), Vector2(fw + g, 0.0), Vector2(fw + g, h), Vector2(fw, h)]), PackedColorArray([lit, none, none, lit]))


## The wheel in gold over its own warm glow (the web's drop-shadow, 4 px).
static func _wheel_art() -> String:
	var wheel: String = Icons.HELM["wheel"][0]
	var glow := wheel.replace('stroke="#ffffff"', 'stroke="#ffc45a"')
	var gold := wheel.replace('stroke="#ffffff"', 'stroke="#f4c765"')
	return '<defs><filter id="g" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="2.6"/></filter></defs><g filter="url(#g)" opacity="0.5">%s</g>%s' % [glow, gold]
