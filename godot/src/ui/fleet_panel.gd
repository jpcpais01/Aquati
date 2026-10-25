class_name FleetPanel
extends PanelContainer
## Your escorts on the HUD (the web's fleet panel): each ship's name, her
## hull and what she's about, and the three orders you can signal (O cycles
## them on a keyboard). Under the status card while you have a fleet.

signal order_picked(order: String)

var _rows: VBoxContainer
var _btns := {}
var _order := ""
var _shown := []


func _init() -> void:
	var k := HudStyle.K
	var sb := HudStyle.panel(12.0 * k, Vector2.ZERO)
	sb.content_margin_left = 9.0 * k
	sb.content_margin_right = 9.0 * k
	sb.content_margin_top = 6.0 * k
	sb.content_margin_bottom = 7.0 * k
	add_theme_stylebox_override("panel", sb)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(228.0 * k, 0.0)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", roundi(4.0 * k))
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(box)
	box.add_child(HudStyle.label("YOUR FLEET", "inter", 700, roundi(7.5 * k), HudStyle.GOLD, 2))
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override("separation", roundi(3.0 * k))
	_rows.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(_rows)
	var orders := HBoxContainer.new()
	orders.add_theme_constant_override("separation", roundi(4.0 * k))
	orders.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(orders)
	var bw := (228.0 - 18.0 - 8.0) / 3.0 * k
	var bh := maxf(22.0 * HudStyle.PX, 22.0 * k)
	for o: String in Fleet.ORDERS:
		var b := UiButton.new(Vector2(bw, bh), bh * 0.5, 6.0 * HudStyle.PX)
		b.custom_minimum_size = Vector2(bw, bh)
		b.squeeze = 0.94
		b.mouse_filter = Control.MOUSE_FILTER_STOP
		var l := HudStyle.label(str(Fleet.ORDER_INFO[o].short), "inter", 700, roundi(9.5 * k), HudStyle.INK)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		l.size = Vector2(bw, bh)
		b.add_child(l)
		b.pressed.connect(func() -> void: order_picked.emit(o))
		orders.add_child(b)
		_btns[o] = [b, l]


## The fleet as it stands: [{name, cls, hp (0..1), status}] and the order flying.
func show_fleet(list: Array, order: String) -> void:
	if order != _order:
		_order = order
		for o: String in _btns:
			var b: UiButton = _btns[o][0]
			var l: Label = _btns[o][1]
			var on := o == order
			if on:
				b.p("c_top", HudStyle.GOLD_TOP).p("c_mid", HudStyle.GOLD_MID).p("mid", 0.52).p("c_foot", HudStyle.GOLD_FOOT).p("border", 0.0).p("hi", 0.0)
			else:
				var fill := Color(1.0, 1.0, 1.0, 0.07)
				b.p("c_top", fill).p("c_mid", fill).p("c_foot", fill).p("c_border", HudStyle.STROKE).p("border", 1.0).p("hi", 0.0)
			l.add_theme_color_override("font_color", HudStyle.GOLD_INK if on else HudStyle.INK_2)
	var k := HudStyle.K
	if _rows.get_child_count() != list.size():
		for c in _rows.get_children():
			_rows.remove_child(c)
			c.queue_free()
		for i in list.size():
			var row := VBoxContainer.new()
			row.add_theme_constant_override("separation", 1)
			row.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var top := HBoxContainer.new()
			top.add_theme_constant_override("separation", roundi(6.0 * k))
			top.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var nm := HudStyle.label("", "cinzel", 700, roundi(10.0 * k), HudStyle.INK, 1)
			nm.custom_minimum_size = Vector2(92.0 * k, 0.0)
			nm.clip_text = true
			nm.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
			top.add_child(nm)
			var bar := HullBar.new()
			bar.custom_minimum_size = Vector2(0.0, maxf(3.0, 4.0 * k))
			bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			top.add_child(bar)
			row.add_child(top)
			var st := HudStyle.label("", "inter", 600, roundi(8.0 * k), HudStyle.INK_3)
			st.clip_text = true
			st.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
			row.add_child(st)
			_rows.add_child(row)
	for i in list.size():
		var e: Dictionary = list[i]
		var row := _rows.get_child(i)
		var top := row.get_child(0)
		(top.get_child(0) as Label).text = str(e.name)
		(top.get_child(1) as HullBar).set_frac(float(e.hp))
		(row.get_child(1) as Label).text = str(e.status)
