class_name PartyPanel
extends PanelContainer
## Ashore, where the ship's panel was (the web's .party-panel): the landing
## party's health, the captain first in gold and bigger, then each hand by
## name, a bar each that drains (with a pale ghost of the blow) and turns
## red when they're hurt badly; a man knocked cold goes dim, "Out cold".

const GOLD_BAR := [Color("#e2a63a"), Color("#ffe39a")]

var _isle: Label
var _head: Label
var _rows: Array[_Row] = []
var _list: VBoxContainer


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var k := HudStyle.K
	var box := HudStyle.panel(18.0 * k, Vector2.ZERO)
	box.content_margin_left = 12.0 * k
	box.content_margin_right = 12.0 * k
	box.content_margin_top = 9.0 * k
	box.content_margin_bottom = 10.0 * k
	add_theme_stylebox_override("panel", box)
	custom_minimum_size = Vector2(228.0 * k, 0.0)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", roundi(6.0 * k))
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", roundi(8.0 * k))
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_head = HudStyle.label("LANDING PARTY", "inter", 700, roundi(maxf(8.0, 9.0 * k)), HudStyle.GOLD, 2)
	_isle = HudStyle.label("", "cinzel", 700, roundi(maxf(10.0, 12.0 * k)), HudStyle.INK_2, 1)
	_isle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_isle.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_isle.clip_text = true
	_isle.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	head.add_child(_head)
	head.add_child(_isle)
	col.add_child(head)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", roundi(4.0 * k))
	_list.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(_list)
	add_child(col)


## The island they're on, under the panel's heading.
func set_isle(isle: String) -> void:
	_isle.text = isle


## Each member's [name, hp, max_hp, down], the captain first.
func show_party(rows: Array) -> void:
	while _rows.size() < rows.size():
		var r := _Row.new(_rows.is_empty())
		_list.add_child(r)
		_rows.append(r)
	for i in _rows.size():
		var r := _rows[i]
		r.visible = i < rows.size()
		if r.visible:
			var d: Array = rows[i]
			r.show_member(str(d[0]), float(d[1]), float(d[2]), bool(d[3]))


class _Row:
	extends HBoxContainer

	var cap := false
	var _name: Label
	var _bar: HullBar
	var _state: Label
	var _key := ""

	func _init(p_cap: bool) -> void:
		cap = p_cap
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var k := HudStyle.K
		add_theme_constant_override("separation", roundi(8.0 * k))
		if cap:
			_name = HudStyle.label("", "cinzel", 700, roundi(maxf(11.0, 13.5 * k)), HudStyle.INK, 1)
		else:
			_name = HudStyle.label("", "inter", 600, roundi(maxf(9.5, 11.0 * k)), HudStyle.INK_2)
		_name.custom_minimum_size = Vector2(68.0 * k, 0.0)
		_name.clip_text = true
		_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		add_child(_name)
		_bar = HullBar.new()
		_bar.tint(GOLD_BAR if cap else HullBar.TEAL, false)
		_bar.custom_minimum_size = Vector2(0.0, maxf(6.0, 8.0 * k) if cap else maxf(4.0, 5.0 * k))
		_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		add_child(_bar)
		if cap:
			_state = HudStyle.label("", "inter", 800, roundi(maxf(10.5, 13.0 * k)), HudStyle.INK)
		else:
			_state = HudStyle.label("", "inter", 600, roundi(maxf(9.5, 11.0 * k)), HudStyle.INK_3)
		_state.custom_minimum_size = Vector2(44.0 * k, 0.0)
		_state.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		add_child(_state)

	func show_member(who: String, hp: float, max_hp: float, down: bool) -> void:
		var f := clampf(hp / maxf(max_hp, 1.0), 0.0, 1.0)
		var key := "%s|%d|%s" % [who, roundi(f * 60.0), down]
		if key == _key:
			return
		var fresh := _key == ""
		_key = key
		_name.text = who
		_bar.set_frac(f, fresh)
		if down:
			_state.text = "Down" if cap else "Out cold"
			_state.add_theme_color_override("font_color", Color("#ffb3a6"))
		else:
			_state.text = "%d" % ceili(hp) if cap else ""
			_state.add_theme_color_override("font_color", HudStyle.INK if cap else HudStyle.INK_3)
		modulate.a = 0.55 if down else 1.0
