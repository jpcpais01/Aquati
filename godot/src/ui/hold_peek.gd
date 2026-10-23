class_name HoldPeek
extends PanelContainer
## A peek into the hold from the HUD's hold chip (the web's .hold-peek): the
## room she has used of what she has, what's aboard, finest first, each good
## with its little portrait in its rarity's colour and how many, and roughly
## what it would all fetch at market. Drawn afresh whenever the hold changes
## while it's open.

## Its width and the tallest its list grows before it scrolls (of the screen).
const W := 300.0 * HudStyle.PX
const LIST_MAX := 0.5
## The colour of a good's name, by rarity (commons in plain ink).
const NAME_INK := [HudStyle.INK, Color("#a8f0b2"), Color("#9adaff"), Color("#dab6ff"), Color("#ffd27a")]

## The chip that opens it: a press there toggles it, rather than closing it as a press anywhere else does.
var opener: Control

var _room: Label
var _scroll: ScrollContainer
var _rows: VBoxContainer
var _empty: Label
var _worth: HBoxContainer
var _worth_row: Control
var _worth_n: Label
var _hold: Treasure.Hold
var _in := -1.0
## Where it rests (its top), for the entrance.
var _y := 0.0


func _init() -> void:
	var px := HudStyle.PX
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.035, 0.102, 0.145, 0.94)
	box.border_color = Color(1, 1, 1, 0.2)
	box.set_border_width_all(1)
	box.set_corner_radius_all(roundi(18.0 * px))
	box.corner_detail = 10
	box.anti_aliasing = true
	box.shadow_color = Color(0.0, 0.031, 0.055, 0.38)
	box.shadow_size = roundi(18.0 * px)
	box.shadow_offset = Vector2(0.0, 9.0 * px)
	box.content_margin_left = 12.0 * px
	box.content_margin_right = 12.0 * px
	box.content_margin_top = 10.0 * px
	box.content_margin_bottom = 10.0 * px
	add_theme_stylebox_override("panel", box)
	custom_minimum_size = Vector2(W, 0.0)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(col)
	var head := HBoxContainer.new()
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var h := roundi(10.0 * px)
	head.add_child(HudStyle.label("SHIP'S HOLD", "inter", 700, h, HudStyle.GOLD, roundi(h * 0.22)))
	var fill := Control.new()
	fill.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_child(fill)
	_room = HudStyle.label("", "inter", 700, h, HudStyle.INK_2, roundi(h * 0.08))
	head.add_child(_room)
	col.add_child(head)
	col.add_child(_gap(6.0 * px))
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	_scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	col.add_child(_scroll)
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override("separation", roundi(2.0 * px))
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rows.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scroll.add_child(_rows)
	_empty = HudStyle.label("Nothing aboard yet. Chests and wreckage fill the hold; trading ports buy it.", "inter", 500, roundi(12.0 * px), HudStyle.INK_2)
	_empty.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_empty.custom_minimum_size = Vector2(W - 24.0 * px, 0.0)
	col.add_child(_empty)
	_worth = HBoxContainer.new()
	_worth.add_theme_constant_override("separation", roundi(5.0 * px))
	_worth.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var coin := Icons.rect("coin", 12.0 * px * 1.5)
	coin.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_worth.add_child(coin)
	var w := roundi(12.0 * px)
	_worth.add_child(HudStyle.label("Worth about", "inter", 600, w, HudStyle.INK_2))
	_worth_n = HudStyle.label("", "inter", 800, w, HudStyle.GOLD_HI)
	_worth.add_child(_worth_n)
	_worth.add_child(HudStyle.label("at market", "inter", 600, w, HudStyle.INK_2))
	var wrap := VBoxContainer.new()
	wrap.add_theme_constant_override("separation", 0)
	wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wrap.add_child(_gap(6.0 * px))
	wrap.add_child(_worth)
	col.add_child(wrap)
	_worth_row = wrap


static func _gap(h: float) -> Control:
	var g := Control.new()
	g.custom_minimum_size = Vector2(0.0, h)
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return g


## The hold it shows: redrawn as it changes, while open.
func watch(hold: Treasure.Hold) -> void:
	if _hold != null and _hold.changed.is_connected(_on_changed):
		_hold.changed.disconnect(_on_changed)
	_hold = hold
	_hold.changed.connect(_on_changed)
	if visible:
		_draw_hold()


func toggle() -> void:
	set_open(not visible)


func set_open(open: bool) -> void:
	if open == visible:
		return
	visible = open
	if open:
		_draw_hold()
		# up from just below, fading in
		_in = 0.0
		modulate.a = 0.0


func _input(event: InputEvent) -> void:
	if not visible:
		return
	var at: Variant = null
	if event is InputEventScreenTouch and event.pressed:
		at = event.position
	elif event is InputEventMouseButton and event.pressed and event.device != InputEvent.DEVICE_ID_EMULATION:
		at = event.position
	if at == null or get_global_rect().has_point(at) or (opener != null and opener.get_global_rect().has_point(at)):
		return
	set_open(false)


func _on_changed() -> void:
	if visible:
		_draw_hold()


func _draw_hold() -> void:
	if _hold == null:
		return
	var px := HudStyle.PX
	_room.text = "%d / %d ROOM" % [_hold.used(), _hold.capacity]
	for c in _rows.get_children():
		c.queue_free()
	var list := _hold.list()
	for e: Array in list:
		var id: String = e[0]
		var n: int = e[1]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", roundi(8.0 * px))
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var icon := TextureRect.new()
		icon.texture = Icons.plunder(id, 28.0 * px)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.custom_minimum_size = Vector2(28.0, 28.0) * px
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(icon)
		var name_l := HudStyle.label(Treasure.name_of(id), "inter", 600, roundi(12.5 * px), NAME_INK[Treasure.rarity_of(id)])
		name_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_l.clip_text = true
		name_l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		name_l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		row.add_child(name_l)
		var cnt := HudStyle.label("×%d" % n if n > 1 else "", "inter", 700, roundi(12.5 * px), HudStyle.INK_2)
		cnt.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		row.add_child(cnt)
		_rows.add_child(row)
	var has := not list.is_empty()
	_scroll.visible = has
	_empty.visible = not has
	# the list scrolls once it would run past four tenths of the screen
	var row_h := 28.0 * px + 2.0 * px
	var vp := get_viewport_rect().size.y if is_inside_tree() else 720.0
	_scroll.custom_minimum_size = Vector2(W - 24.0 * px, minf(list.size() * row_h, vp * LIST_MAX))
	var worth := _hold.worth()
	_worth_row.visible = worth > 0
	_worth_n.text = _thousands(worth)
	size = get_combined_minimum_size()


static func _thousands(n: int) -> String:
	var s := str(n)
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return s + out


func _process(dt: float) -> void:
	if _in >= 0.0:
		_in += dt / 0.25
		var e := HudStyle.spring(minf(_in, 1.0))
		modulate.a = clampf(_in * 1.6, 0.0, 1.0)
		position.y = _y + (1.0 - e) * 8.0 * HudStyle.PX
		if _in >= 1.0:
			_in = -1.0
			position.y = _y


## Its place under the chips.
func place(at: Vector2) -> void:
	_y = at.y
	position = at
