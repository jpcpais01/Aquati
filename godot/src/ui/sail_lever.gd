class_name SailLever
extends Control
## The touch sail lever, bottom left as on the web: four notches from Stop to
## Full that stay where you leave them, like W / S. Drag the gold knob or tap
## a notch; it clicks into each detent as it passes and springs home when you
## let go. The little square-rigger on the knob lets her sail down as you set
## more canvas, and the rail fills gold as the hands actually set (or take
## in) the canvas.

signal level_set(level: int)

const LABELS := ["Stop", "Slow", "Half", "Full"]
## The knob and the track's height (the web's --kn and --th).
const KN := 44.0 * HudStyle.KT
const TH := 164.0 * HudStyle.KT
## Fixed CSS-pixel details: the rail and the notch marks.
const RAIL := 4.0 * HudStyle.PX
const NOTCH := Vector2(16.0, 2.0) * HudStyle.PX
const LABEL_PX := 9.0 * HudStyle.KT

const KNOB_SVG := '<defs><radialGradient id="k" cx="0.4" cy="0.32" r="0.907"><stop offset="0" stop-color="#fff6d6"/><stop offset="0.45" stop-color="#f4c765"/><stop offset="1" stop-color="#c08528"/></radialGradient><radialGradient id="i" cx="0.5" cy="0.455" r="0.5"><stop offset="0.8" stop-color="#784610" stop-opacity="0"/><stop offset="1" stop-color="#784610" stop-opacity="0.4"/></radialGradient></defs><circle cx="12" cy="12" r="12" fill="url(#k)"/><circle cx="12" cy="12" r="12" fill="url(#i)"/>'
## The knob's soft shadow (0 6px 16px rgba(0,0,0,0.35)), as a disc fading out.
const SHADOW_SVG := '<defs><radialGradient id="s"><stop offset="0.37" stop-color="#000" stop-opacity="0.35"/><stop offset="0.58" stop-color="#000" stop-opacity="0.17"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><circle cx="12" cy="12" r="12" fill="url(#s)"/>'

## The ordered notch (0..3) and the canvas really set (0..1).
var level := 0
var set_fraction := 0.0

var _touch := -1
## Where a finger holds the knob (0..1), or -1.
var _drag := -1.0
# the knob on its spring, and its swell while held
var _kpos := 0.0
var _kvel := 0.0
var _swell := 1.0
var _font: Font
var _track_box: StyleBoxFlat
var _knob: Texture2D
var _shadow: Texture2D
var _cloth: PackedVector2Array


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_font = HudStyle.font("inter", 800, roundi(LABEL_PX * 0.16))
	custom_minimum_size = Vector2(KN + 6.0 + 64.0, TH)
	size = custom_minimum_size
	_track_box = HudStyle.panel(KN * 0.5)
	_track_box.bg_color = Color(0.043, 0.122, 0.165, 0.74)
	_track_box.shadow_size = 14
	_track_box.shadow_offset = Vector2(0, 8)
	_knob = Icons.svg("lever-knob", KNOB_SVG, Vector2(KN, KN))
	var sh := (KN * 0.5 + 16.0 * HudStyle.KT) * 2.0
	_shadow = Icons.svg("lever-shadow", SHADOW_SVG, Vector2(sh, sh))
	_cloth = _cloth_outline()
	_kpos = level / 3.0


## The cloth's outline on the knob's 24 grid: the web's square sail, its
## leeches bellying out a touch.
static func _cloth_outline() -> PackedVector2Array:
	var pts := PackedVector2Array([Vector2(5.6, 6.6), Vector2(18.4, 6.6)])
	for i in range(1, 9):
		pts.append(_bezier(Vector2(18.4, 6.6), Vector2(19.1, 10.3), Vector2(18.9, 13.8), Vector2(17.8, 17.2), i / 8.0))
	pts.append(Vector2(6.2, 17.2))
	for i in range(1, 8):
		pts.append(_bezier(Vector2(6.2, 17.2), Vector2(5.1, 13.8), Vector2(4.9, 10.3), Vector2(5.6, 6.6), i / 8.0))
	return pts


static func _bezier(a: Vector2, b: Vector2, c: Vector2, d: Vector2, t: float) -> Vector2:
	var u := 1.0 - t
	return a * u * u * u + b * 3.0 * u * u * t + c * 3.0 * u * t * t + d * t * t * t


## The knob's centre for a position 0 (Stop) .. 1 (Full).
func _knob_y(f: float) -> float:
	return TH - KN * 0.5 - f * (TH - KN)


func _fraction_at(y: float) -> float:
	return clampf((TH - KN * 0.5 - y) / (TH - KN), 0.0, 1.0)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and _touch < 0:
			_touch = event.index
			_move(event.position.y)
			accept_event()
		elif not event.pressed and event.index == _touch:
			_release()
			accept_event()
	elif event is InputEventScreenDrag and event.index == _touch:
		_move(event.position.y)
		accept_event()
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_touch = 99
			_move(event.position.y)
		else:
			_release()
		accept_event()
	elif event is InputEventMouseMotion and _touch == 99:
		_move(event.position.y)
		accept_event()


func _release() -> void:
	_touch = -1
	_drag = -1.0


func _notification(what: int) -> void:
	if what == NOTIFICATION_VISIBILITY_CHANGED and not is_visible_in_tree():
		_release()


func _move(y: float) -> void:
	var f := _fraction_at(y)
	var n := roundi(f * 3.0)
	# magnetic notches: the knob leans toward the nearest detent rather than floating free
	_drag = n / 3.0 + (f - n / 3.0) * 0.4
	if n != level:
		level = n
		level_set.emit(n)
		Input.vibrate_handheld(30 if n == 0 else 12)


func show_state(p_level: int, p_set: float) -> void:
	if p_level != level or absf(p_set - set_fraction) > 0.004:
		level = p_level
		set_fraction = p_set
		queue_redraw()


func _process(dt: float) -> void:
	var was := Vector2(_kpos, _swell)
	if _drag >= 0.0:
		# held: the knob follows the finger at once
		_kpos += (_drag - _kpos) * MathX.damp(40.0, dt)
		_kvel = 0.0
	else:
		# let go: it springs into its notch with a little overshoot
		var k := 260.0
		var c := 2.0 * sqrt(k) * 0.62
		var h := minf(dt, 0.05)
		_kvel += ((level / 3.0 - _kpos) * k - _kvel * c) * h
		_kpos += _kvel * h
	_swell += ((1.08 if _drag >= 0.0 else 1.0) - _swell) * MathX.damp(14.0, dt)
	if absf(_kpos - was.x) > 1e-4 or absf(_swell - was.y) > 1e-4:
		queue_redraw()


func _draw() -> void:
	var cx := KN * 0.5
	# the glass track
	draw_style_box(_track_box, Rect2(0.0, 0.0, KN, TH))
	# the rail runs notch to notch; its gold is the canvas actually set
	var top := _knob_y(1.0)
	var bot := _knob_y(0.0)
	draw_rect(Rect2(cx - RAIL * 0.5, top, RAIL, bot - top), Color(1, 1, 1, 0.12))
	if set_fraction > 0.003:
		# (the web scales the gradient with the fill: always gold at its foot, pale at its head)
		var fy := lerpf(bot, top, set_fraction)
		var head := Color("#ffe9a8")
		var foot := Color("#d4952f")
		draw_polygon(PackedVector2Array([Vector2(cx - RAIL * 0.5, fy), Vector2(cx + RAIL * 0.5, fy), Vector2(cx + RAIL * 0.5, bot), Vector2(cx - RAIL * 0.5, bot)]),
				PackedColorArray([head, head, foot, foot]))
	# the notches: Stop's mark longer and brighter
	for i in 4:
		var y := _knob_y(i / 3.0)
		var w := NOTCH.x * (22.0 / 16.0 if i == 0 else 1.0)
		draw_rect(Rect2(cx - w * 0.5, y - NOTCH.y * 0.5, w, NOTCH.y), Color(1, 1, 1, 0.55 if i == 0 else 0.34))
	# the names, the set one lit and nudged out
	var lx := KN + 2.0 + 4.0
	for i in 4:
		var y := _knob_y(i / 3.0) + LABEL_PX * 0.36
		var on := i == level
		var col := (Color.WHITE if i == 0 else HudStyle.GOLD) if on else Color(1, 1, 1, 0.5)
		var x := lx + (3.0 * HudStyle.KT if on else 0.0)
		draw_string(_font, Vector2(x, y + 1.5), LABELS[i].to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(LABEL_PX), Color(0, 0, 0, 0.45))
		draw_string(_font, Vector2(x, y), LABELS[i].to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(LABEL_PX), col)
	# the knob: its shadow, the gold boss, and on it a little square-rigger
	var kc := Vector2(cx, _knob_y(_kpos))
	var kr := KN * 0.5 * _swell
	var sh := _shadow.get_size() / Icons.density() * _swell
	draw_texture_rect(_shadow, Rect2(kc + Vector2(0.0, 6.0 * HudStyle.KT) - sh * 0.5, sh), false)
	draw_texture_rect(_knob, Rect2(kc - Vector2(kr, kr), Vector2(kr, kr) * 2.0), false)
	# the icon is 62% of the knob, on a 24 grid
	var u := KN * 0.62 / 24.0 * _swell
	var o := kc - Vector2(12.0, 12.0) * u
	var pos := clampf(_kpos, 0.0, 1.0)
	var mast := Color("#6b3f0e")
	draw_line(o + Vector2(12.0, 2.5) * u, o + Vector2(12.0, 21.5) * u, mast, 1.8 * u, true)
	draw_line(o + Vector2(5.0, 6.2) * u, o + Vector2(19.0, 6.2) * u, mast, 1.8 * u, true)
	var trim := Color("#8a5718")
	var ca := minf(1.0, pos * 6.0)
	if ca > 0.01:
		# the cloth drops from the yard as more canvas is set
		var sy := maxf(0.06, pos)
		var pts := PackedVector2Array()
		for p in _cloth:
			pts.append(o + Vector2(p.x, 6.6 + (p.y - 6.6) * sy) * u)
		draw_colored_polygon(pts, Color(Color("#fffaf0"), ca))
		pts.append(pts[0])
		draw_polyline(pts, Color(trim, ca), 0.8 * u, true)
	var fa := clampf(1.0 - pos * 3.0, 0.0, 1.0)
	if fa > 0.01:
		# furled on the yard
		var fr := Rect2(o + Vector2(5.2, 5.6) * u, Vector2(13.6, 2.4) * u)
		draw_rect(fr, Color(Color("#f6ead0"), fa))
		draw_rect(fr, Color(trim, fa), false, 0.7 * u)
