class_name DigGauge
extends UiBox
## The dig gauge (the web's .dig-gauge): low in the middle while the landing
## party digs at the X, how deep the hole's got (of six feet, bands of sand
## going darker down to the chest at the bottom), how many spades are at it,
## a kick of the spade on every spadeful, and "Heave!" when it strikes wood.

const K := HudStyle.K

var _key := ""
var _strokes := -1
var _k := 0.0
var _hands := 0
var _heave := false
var _kick := 1.0
var _clock := 0.0
var _face: _Face


func _init() -> void:
	super(Vector2(250.0, 42.0) * K, 21.0 * K, 30.0 * K)
	p("c_top", Color(0.043, 0.11, 0.157, 0.86)).p("c_foot", Color(0.02, 0.07, 0.1, 0.88)).p("hi", 0.08)
	p("c_shadow", Color(0.0, 8.0 / 255.0, 14.0 / 255.0, 0.35)).p("shadow", Vector2(10.0, 30.0) * HudStyle.PX)
	_face = _Face.new()
	_face.g = self
	_face.size = size
	add_child(_face)
	visible = false
	set_process(false)


## The dig as the shore tells it ({k, hands, strokes, heave}; {} while nobody digs).
func show_dig(v: Dictionary) -> void:
	if not v.is_empty() and int(v.strokes) != _strokes:
		if _strokes >= 0 and not bool(v.heave):
			_kick = 0.0
			set_process(true)
		_strokes = int(v.strokes)
	var key := "" if v.is_empty() else "%s|%d" % ["h" if bool(v.heave) else str(roundi(float(v.k) * 100.0)), int(v.hands)]
	if key == _key:
		return
	_key = key
	if v.is_empty():
		_strokes = -1
		visible = false
		set_process(false)
		return
	if not visible:
		visible = true
		_clock = 0.0
	_k = float(v.k)
	_hands = int(v.hands)
	_heave = bool(v.heave)
	if _heave:
		p("c_border", Color(1.0, 214.0 / 255.0, 120.0 / 255.0, 0.9)).p("c_glow", Color(1.0, 190.0 / 255.0, 70.0 / 255.0, 0.45)).p("glow", 26.0 * HudStyle.PX)
	else:
		p("c_border", Color(0.957, 0.78, 0.396, 0.45)).p("c_glow", Color(0, 0, 0, 0)).p("glow", 0.0)
	set_process(true)
	_face.queue_redraw()


func _process(dt: float) -> void:
	_clock += dt
	_kick = minf(1.0, _kick + dt / 0.45)
	# in on a spring the first time
	var e := HudStyle.spring(clampf(_clock / 0.3, 0.0, 1.0))
	scale = Vector2.ONE * lerpf(0.9, 1.0, e)
	modulate.a = minf(1.0, _clock / 0.15)
	_face.queue_redraw()
	if not _heave and _kick >= 1.0 and _clock > 0.3:
		set_process(false)


class _Face:
	extends Control
	var g: DigGauge

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var k := DigGauge.K
		var h := size.y
		# the spade on gold, swinging on every spadeful
		var dc := Vector2(7.0 * k + 14.0 * k, h * 0.5)
		var dr := 14.0 * k
		draw_circle(dc, dr, HudStyle.GOLD_FOOT, true, -1.0, true)
		draw_circle(dc - Vector2(0, dr * 0.18), dr * 0.82, HudStyle.GOLD_MID, true, -1.0, true)
		draw_circle(dc - Vector2(0, dr * 0.42), dr * 0.45, HudStyle.GOLD_TOP, true, -1.0, true)
		var sw := sin(clampf(g._kick / 0.35, 0.0, 1.0) * PI) if g._kick < 0.35 else sin(clampf((g._kick - 0.35) / 0.65, 0.0, 1.0) * PI * 0.5 + PI * 0.5)
		var ang := deg_to_rad(-28.0) * (sw if g._kick < 1.0 else 0.0)
		var isz := dr * 1.24
		var pivot := dc + Vector2(0, -isz * 0.3)
		draw_set_transform(pivot + Vector2(0, 2.0 * (sw if g._kick < 1.0 else 0.0)), ang, Vector2.ONE)
		draw_texture_rect(Icons.texture("spade", isz), Rect2(Vector2(-isz * 0.5, -isz * 0.2), Vector2(isz, isz)), false, HudStyle.GOLD_INK)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		# the words
		var x0 := 7.0 * k + 28.0 * k + 9.0 * k
		var x1 := size.x - 14.0 * k
		var bf := HudStyle.font("inter", 700)
		var bs := roundi(maxf(10.5 * HudStyle.PX, 12.5 * k))
		var sf := HudStyle.tnum(HudStyle.font("inter", 700))
		var ss := roundi(maxf(8.5 * HudStyle.PX, 9.5 * k))
		var bar_h := maxf(6.0 * HudStyle.PX, 7.0 * k)
		var top := (h - (bs + 4.0 * k + bar_h)) * 0.5
		var by := top + bf.get_ascent(bs)
		draw_string(bf, Vector2(x0, by), "Heave!" if g._heave else "Digging", HORIZONTAL_ALIGNMENT_LEFT, -1, bs, HudStyle.INK)
		var small := "The spade struck wood" if g._heave else "%.1f of 6 ft · %d spade%s" % [g._k * 6.0, g._hands, "" if g._hands == 1 else "s"]
		var smw := sf.get_string_size(small, HORIZONTAL_ALIGNMENT_LEFT, -1, ss).x
		draw_string(sf, Vector2(x1 - smw, by), small, HORIZONTAL_ALIGNMENT_LEFT, -1, ss, HudStyle.GOLD)
		# the hole: sand going darker down, six feet marked off, the chest at the foot
		var bar := Rect2(x0, top + bs + 4.0 * k, x1 - x0, bar_h)
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0, 0, 0, 0.4)
		sb.set_corner_radius_all(int(bar_h * 0.5))
		sb.anti_aliasing = true
		draw_style_box(sb, bar)
		var fill := 1.0 if g._heave else maxf(0.03, g._k)
		var fw := bar.size.x * fill
		var stops := [Color("#f3dfa6"), Color("#d8b06a"), Color("#a9763e"), Color("#6e4823")]
		if g._heave:
			var shine := 1.0 + 0.35 * (0.5 - 0.5 * cos(g._clock / 0.7 * PI))
			stops = [HudStyle.GOLD_TOP * shine, HudStyle.GOLD_MID * shine, HudStyle.GOLD_FOOT * shine, HudStyle.GOLD_FOOT * shine]
		var pts := PackedVector2Array()
		var cols := PackedColorArray()
		var r := bar_h * 0.5
		# (a rounded bar as a strip: the gradient runs the hole's whole length)
		var n := 24
		for i in n + 1:
			var x := bar.position.x + fw * i / n
			var t := (x - bar.position.x) / bar.size.x
			var c := _grad(stops, t)
			var inset := 0.0
			if x - bar.position.x < r:
				inset = r - sqrt(maxf(0.0, r * r - pow(r - (x - bar.position.x), 2.0)))
			elif bar.position.x + fw - x < r:
				inset = r - sqrt(maxf(0.0, r * r - pow(r - (bar.position.x + fw - x), 2.0)))
			pts.append(Vector2(x, bar.position.y + inset))
			cols.append(c)
		for i in range(n, -1, -1):
			var x := bar.position.x + fw * i / n
			var inset := pts[i].y - bar.position.y
			pts.append(Vector2(x, bar.end.y - inset))
			cols.append(cols[i])
		if fw > 1.0:
			draw_polygon(pts, cols)
		for i in range(1, 6):
			var x := bar.position.x + bar.size.x * i / 6.0
			draw_line(Vector2(x, bar.position.y), Vector2(x, bar.end.y), Color(4.0 / 255.0, 18.0 / 255.0, 26.0 / 255.0, 0.55), 1.0)
		var cw := 12.0 * k
		var ch := 10.0 * k
		var rattle := (sin(g._clock * TAU / 0.18) * 0.5 + 0.5) if g._heave else 0.0
		var cc := Vector2(bar.end.x + 5.0 * k - cw * 0.5, bar.position.y + bar_h * 0.5 - ch * 0.12 * rattle)
		draw_set_transform(cc, deg_to_rad(6.0) * rattle, Vector2.ONE)
		var chest := Rect2(-cw * 0.5, -ch * 0.5, cw, ch)
		draw_rect(chest, Color("#5e3418"))
		draw_rect(Rect2(chest.position, Vector2(cw, ch * 0.5)), Color("#a5683a"))
		draw_rect(Rect2(chest.position + Vector2(0, 0), Vector2(cw, 2.0 * k)), Color("#e6b450"))
		draw_rect(chest, Color("#2b1607"), false, 1.0)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	static func _grad(stops: Array, t: float) -> Color:
		var f := clampf(t, 0.0, 1.0) * (stops.size() - 1)
		var i := mini(int(f), stops.size() - 2)
		return (stops[i] as Color).lerp(stops[i + 1], f - i)
