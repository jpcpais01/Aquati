class_name Floaters
extends Control
## Numbers rising off the action, as on the web: the damage your guns deal in
## gold, what you take in coral, a flame's bite in amber. Each pops in, drifts
## up slowing, and fades; a small pool of labels, reused oldest first.

enum Kind { GOOD, BAD, BURN }

const POOL := 20
const COLORS := [Color("#f4c765"), Color("#ff8a77"), Color("#ffb070")]

var _items: Array[_Item] = []
var _next := 0


class _Item:
	var label: Label
	var t := 1.0
	var life := 0.0
	var at := Vector2.ZERO
	var vy := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for i in POOL:
		var it := _Item.new()
		it.label = HudStyle.label("", "inter", 800, roundi(15.0 * HudStyle.PX), COLORS[0])
		it.label.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.32))
		it.label.add_theme_constant_override("shadow_offset_x", 0)
		it.label.add_theme_constant_override("shadow_offset_y", 3)
		it.label.add_theme_constant_override("shadow_outline_size", 6)
		it.label.visible = false
		add_child(it.label)
		_items.append(it)


## A number at a screen point.
func pop(text: String, at: Vector2, kind: Kind = Kind.GOOD) -> void:
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
	l.text = text
	l.add_theme_color_override("font_color", COLORS[kind])
	l.add_theme_font_size_override("font_size", roundi((13.0 if kind == Kind.BURN else 15.0) * HudStyle.PX))
	l.size = l.get_combined_minimum_size()
	l.pivot_offset = l.size * 0.5
	l.visible = true
	var p := at + Vector2(randf_range(-12.0, 12.0) * HudStyle.PX, 0.0)
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
	it.life = 1.3
	it.at = p
	it.vy = -48.0 * HudStyle.PX
	_place(it)


func _process(dt: float) -> void:
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
	it.label.modulate.a = clampf(t / 0.15 if t < 0.15 else 1.0 - maxf(0.0, (t - (it.life - 0.6)) / 0.6), 0.0, 1.0)
	# it pops, overshoots a touch, and settles
	var sc := 0.6 + t * 4.0 if t < 0.12 else 1.08 - minf(0.08, t * 0.2)
	it.label.scale = Vector2(sc, sc)
	it.label.position = it.at - it.label.size * 0.5
