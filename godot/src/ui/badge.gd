class_name Badge
extends PanelContainer
## A little rounded count pinned to a corner of a HUD button (the shot left
## of a kind, a key to press): a pill of colour with a number in it, which
## keeps its corner as the number grows.

var label: Label
var _box: StyleBoxFlat
var _pin := Vector2.ZERO
var _align := Vector2.ZERO


## `px` the type's size, `pad` the room either side of it, `min_w` the
## narrowest it gets, `line` its height in lines of type; `ring` a hairline
## round it (none if clear).
func _init(bg: Color, ink: Color, px: float, pad: float, min_w: float, ring := Color(0, 0, 0, 0), radius := 99, line := 1.5) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_box = StyleBoxFlat.new()
	_box.bg_color = bg
	_box.set_corner_radius_all(radius)
	_box.corner_detail = 6
	_box.anti_aliasing = true
	_box.border_color = ring
	_box.set_border_width_all(1 if ring.a > 0.0 else 0)
	_box.content_margin_left = pad
	_box.content_margin_right = pad
	add_theme_stylebox_override("panel", _box)
	label = HudStyle.label("", "inter", 800, roundi(px), ink)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.custom_minimum_size = Vector2(maxf(0.0, min_w - pad * 2.0), roundf(px * line))
	add_child(label)


## Keeps the badge's `align` corner (0..1 across, 0..1 down) on `at`, in its parent.
func pin(at: Vector2, align: Vector2) -> void:
	_pin = at
	_align = align
	_place()


func set_text(text: String) -> void:
	if label.text == text:
		return
	label.text = text
	_place()


func set_colors(bg: Color, ink: Color, ring := Color(0, 0, 0, 0)) -> void:
	_box.bg_color = bg
	_box.border_color = ring
	_box.set_border_width_all(1 if ring.a > 0.0 else 0)
	label.add_theme_color_override("font_color", ink)


func _place() -> void:
	size = get_combined_minimum_size()
	position = (_pin - size * _align).round()
