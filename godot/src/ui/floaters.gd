class_name Floaters
extends Control
## Words and numbers rising off the action, as on the web: the damage your
## guns deal in gold, what you take in coral, a flame's bite in amber; the
## plunder hauled aboard, glowing the finer it is (a legendary find in gold
## Cinzel, shimmering); shot found for the racks; and the marks special shot
## leaves, each in its own light (ablaze, sails shredded, crews cut down).
## Each pops in, drifts up slowing, and fades; a small pool of labels,
## reused oldest first, each kind a shared look.

enum Kind { GOOD, BAD, BURN, LOOT, RARE, EPIC, LEGENDARY, AMMO, ABLAZE, SHREDDED, CREW }

const POOL := 20
## By kind: its ink, its size (web px), its glows ([colour, reach (web px)],
## the brightest first), and whether it's set in small capitals.
const LOOKS := [
	[Color("#f4c765"), 15.0, [], false],
	[Color("#ff8a77"), 15.0, [], false],
	[Color("#ffb070"), 13.0, [], false],
	[Color("#fff1b8"), 15.0, [], false],
	[Color("#9fdcff"), 17.0, [[Color(0.314, 0.706, 1.0, 0.85), 10.0]], false],
	[Color("#e2c4ff"), 19.0, [[Color(1.0, 0.863, 0.549, 0.8), 2.0], [Color(0.745, 0.392, 1.0, 0.9), 12.0]], false],
	[Color("#fff0b0"), 24.0, [[Color("#ffb52e"), 6.0], [Color(1.0, 0.667, 0.118, 0.95), 16.0], [Color(1.0, 0.471, 0.078, 0.6), 30.0]], false],
	[Color("#fff4d6"), 13.0, [[Color(1.0, 0.745, 0.353, 0.7), 10.0]], true],
	[Color("#ffd2a0"), 13.0, [[Color(1.0, 0.431, 0.157, 0.95), 10.0]], true],
	[Color("#d6efff"), 13.0, [[Color(0.471, 0.784, 1.0, 0.8), 10.0]], true],
	[Color("#e4d8ff"), 13.0, [[Color(0.667, 0.549, 1.0, 0.85), 10.0]], true],
]
## Each glow is laid as rings of its colour, wider and fainter outward (the
## engine draws a text's shadow as a hard outline, not a blur).
const RINGS := 3

var _items: Array[_Item] = []
var _next := 0
var _looks: Array[LabelSettings] = []
var _t := 0.0


class _Item:
	var label: Label
	var kind := 0
	var t := 1.0
	var life := 0.0
	var at := Vector2.ZERO
	var vy := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for k in LOOKS.size():
		_looks.append(_look(k))
	for i in POOL:
		var it := _Item.new()
		it.label = Label.new()
		it.label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		it.label.label_settings = _looks[0]
		it.label.visible = false
		add_child(it.label)
		_items.append(it)


## The shared look of a kind: Inter (Cinzel for a legendary find), its ink,
## its glows as rings, and under them all the soft drop shadow.
static func _look(k: int) -> LabelSettings:
	var look: Array = LOOKS[k]
	var px: float = look[1] * HudStyle.PX
	var caps: bool = look[3]
	var s := LabelSettings.new()
	if k == Kind.LEGENDARY:
		s.font = HudStyle.font("cinzel", 700, roundi(px * 0.05))
	else:
		s.font = HudStyle.font("inter", 800, roundi(px * 0.14) if caps else 0)
	s.font_size = roundi(px)
	s.font_color = look[0]
	# the glows from the outermost in (the first drawn sits under the rest), then the drop shadow on top of those
	var glows: Array = look[2]
	var layers := []
	for gi in range(glows.size() - 1, -1, -1):
		var g: Array = glows[gi]
		var c: Color = g[0]
		var reach: float = g[1] * HudStyle.PX
		for r in range(RINGS - 1, -1, -1):
			var f := (r + 1.0) / RINGS
			layers.append([Color(c, c.a * 0.42 * (1.0 - f * 0.55)), roundi(reach * 0.75 * f), Vector2.ZERO])
	layers.append([Color(0.0, 0.0, 0.0, 0.3 if glows.is_empty() else 0.4), roundi(6.0 * HudStyle.PX * 0.55), Vector2(0.0, 2.0 * HudStyle.PX)])
	s.stacked_shadow_count = layers.size()
	for i in layers.size():
		var l: Array = layers[i]
		s.set_stacked_shadow_color(i, l[0])
		s.set_stacked_shadow_outline_size(i, maxi(1, l[1]))
		s.set_stacked_shadow_offset(i, l[2])
	return s


## Words at a screen point, `lift` units above it.
func pop(text: String, at: Vector2, kind: Kind = Kind.GOOD, lift := 0.0) -> void:
	# a free one, else the oldest
	var it: _Item = null
	for i in POOL:
		var c := _items[(_next + i) % POOL]
		if c.t >= c.life:
			it = c
			break
	if it == null:
		it = _items[_next]
	_next = (_items.find(it) + 1) % POOL
	var l := it.label
	it.kind = kind
	l.label_settings = _looks[kind]
	l.text = text.to_upper() if LOOKS[kind][3] else text
	l.modulate = Color.WHITE
	l.size = l.get_combined_minimum_size()
	l.pivot_offset = l.size * 0.5
	l.visible = true
	var p := at + Vector2(randf_range(-12.0, 12.0) * HudStyle.PX, -lift)
	# a broadside lands in a burst: stack its numbers up rather than piling them on one another
	var line := l.size.y * 0.8
	var moved := true
	while moved:
		moved = false
		for o in _items:
			var clear := (l.size.x + o.label.size.x) * 0.5 + 4.0 * HudStyle.PX
			if o != it and o.t < minf(o.life, 0.6) and absf(o.at.x - p.x) < clear and absf(o.at.y - p.y) < line:
				p.y = o.at.y - line
				moved = true
	it.t = 0.0
	match kind:
		Kind.LEGENDARY:
			it.life = 2.4
		Kind.EPIC:
			it.life = 1.9
		Kind.RARE, Kind.AMMO, Kind.ABLAZE, Kind.SHREDDED, Kind.CREW:
			it.life = 1.6
		_:
			it.life = 1.3
	it.at = p
	it.vy = -48.0 * HudStyle.PX
	_place(it)


## Every kind's look drawn once, out of sight in the corner, so their glyphs
## and glows are rasterized before the first fight needs them.
func warm() -> void:
	const GLYPHS := "0123456789+-:·' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
	for k in LOOKS.size():
		var l := Label.new()
		l.label_settings = _looks[k]
		l.text = GLYPHS.to_upper() if LOOKS[k][3] else GLYPHS
		l.position = Vector2(-4000.0, -4000.0)
		l.modulate.a = 0.01
		add_child(l)
		get_tree().create_timer(0.5).timeout.connect(l.queue_free)


func _process(dt: float) -> void:
	_t += dt
	for it in _items:
		if it.t >= it.life:
			continue
		it.t += dt
		it.at.y += it.vy * dt
		it.vy *= pow(0.97, dt * 60.0)
		if it.t >= it.life:
			it.label.visible = false
			continue
		_place(it)


func _place(it: _Item) -> void:
	var t := it.t
	# in over 0.15 s, out over the last 0.6
	var a := clampf(t / 0.15 if t < 0.15 else 1.0 - maxf(0.0, (t - (it.life - 0.6)) / 0.6), 0.0, 1.0)
	var m := Color(1.0, 1.0, 1.0, a)
	if it.kind == Kind.LEGENDARY:
		# a legendary find shimmers, gold to white and back twice a second
		var sh := 0.5 - 0.5 * cos(_t * TAU)
		m = Color(1.0, lerpf(1.0, 1.06, sh), lerpf(1.0, 1.45, sh), a)
	it.label.modulate = m
	# it pops, overshoots a touch, and settles
	var sc := 0.6 + t * 4.0 if t < 0.12 else 1.08 - minf(0.08, t * 0.2)
	it.label.scale = Vector2(sc, sc)
	it.label.position = it.at - it.label.size * 0.5
