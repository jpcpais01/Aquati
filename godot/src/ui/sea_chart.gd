class_name SeaChart
extends CanvasLayer
## The sea chart (the web game's #chart and src/ui/chart.ts): a hand-inked
## overview of the whole known sea over the world frosted behind it, which
## keeps sailing. The open sea engraved in its depths, with the rhumb lines
## of a great rose, the leadsman's soundings and the Sereno current; each
## archipelago engraved from the seabed you sail (a rumour under mist until
## you've sailed into it), its isles named once charted and its market towns
## marked; and live over it all your ship, the pirates within spyglass
## range, the plunder afloat, the wind, your waypoints and the helmsman's
## course. Drag to pan, pinch or the wheel to zoom, a double tap zooms in;
## a tap opens a card over the pin, port or isle under the finger (on open
## sea it drops a pin there first) to sail there or lift the pin.
##
## Drawn in four layers: the sea and the archipelagos with their names, and
## the isles and towns over them, are drawn again only when the view moves;
## the current, the lane and the plunder under the isles, and the ships,
## pins and the rose over everything, every frame.

## Closed (the close button, a tap on the world round it, or the back button).
signal closed
signal clicked
## A tap on the chart: the world spot, and how far round it a fingertip reaches (m).
signal tapped(x: float, z: float, pick: float)
## The Clear pill lifted every pin.
signal pins_cleared

## The web's CSS pixels in HUD units: the chart's canvas pixels, and its
## buttons' --u.
const PX := HudStyle.PX
const U := HudStyle.K
## A tap waits this long for a second one (s): two quick taps zoom in.
const TAP_WAIT := 0.23
const DOUBLE := 0.45
## The chart's ink.
const SEA_INK := Color(8.0 / 255.0, 30.0 / 255.0, 40.0 / 255.0)
const GLASS_3 := Color(8.0 / 255.0, 20.0 / 255.0, 30.0 / 255.0, 0.86)
const PIN_GOLD := Color("#ffd27a")
const LEGEND := [["you", "You"], ["foe", "Pirates"], ["loot", "Salvage"], ["wind", "Wind"], ["pin", "Tap: pin · sail there"]]

var art: ChartArt
var scene: MapScene
## The card over the place last tapped (the game fills it and answers its buttons).
var card: ChartCard
## When a finger or the mouse last went down on the chart (ms): the
## helmsman leaves it open while a hand is on it.
var poked_ms := 0

var _root: Control
var _back: ColorRect
var _back_mat: ShaderMaterial
var _frame: Control
var _content: Control
var _under: _Layer
var _flow: _Layer
var _over: _Layer
var _live: _Layer
var _chrome: ColorRect
var _chrome_mat: ShaderMaterial
var _ui: Control
var _head: UiBox
var _isles: UiText
var _legend: Control
var _btns: Control
var _clear: UiButton
var _clear_n := -1
var _centre: UiButton
var _close: UiButton
## The frame on screen, and its canvas's size (HUD units).
var _rect := Rect2()
var _W := 1.0
var _H := 1.0
## The view: the world spot in the middle, and the zoom (1: the whole sea fits).
var _cx := 0.0
var _cz := 0.0
var _zoom := 1.0
var _t := 0.0
var _clock := 0.0
var _key := []
var _fog: GradientTexture2D
## The fingers (or the mouse, -1) down on the chart, where they are now.
var _pts := {}
var _dragged := 0.0
var _multi := false
var _pinch := 0.0
var _touch := false
## A tap waiting out a second one: where (x, z, pick), and till when.
var _tap := Vector3.ZERO
var _tap_at := -1.0
var _last_up := -10.0
var _last_at := Vector2.ZERO
var _down_outside := false
## The world spot the card stands over, and its mark's colour for the ring breathing round it.
var _card_at := Vector2.ZERO
var _card_color := HudStyle.GOLD


func _ready() -> void:
	layer = 7
	visible = false
	set_process(false)
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.gui_input.connect(_outside_input)
	add_child(_root)
	_back_mat = _frame_material(false)
	_back = ColorRect.new()
	_back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_back.material = _back_mat
	_root.add_child(_back)
	_frame = Control.new()
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_frame)
	_content = Control.new()
	_content.clip_contents = true
	_content.mouse_filter = Control.MOUSE_FILTER_STOP
	_content.mouse_default_cursor_shape = Control.CURSOR_DRAG
	_content.gui_input.connect(_chart_input)
	_frame.add_child(_content)
	_under = _Layer.new(_paint_under)
	_flow = _Layer.new(_paint_flow)
	_over = _Layer.new(_paint_over)
	_live = _Layer.new(_paint_live)
	for l: _Layer in [_under, _flow, _over, _live]:
		_content.add_child(l)
	_chrome_mat = _frame_material(true)
	_chrome = ColorRect.new()
	_chrome.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_chrome.material = _chrome_mat
	_root.add_child(_chrome)
	_ui = Control.new()
	_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_ui)
	card = ChartCard.new()
	_ui.add_child(card)
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.7, 1.0])
	g.colors = PackedColorArray([Color8(206, 222, 226, 87), Color8(180, 204, 212, 41), Color8(180, 204, 212, 0)])
	_fog = GradientTexture2D.new()
	_fog.gradient = g
	_fog.fill = GradientTexture2D.FILL_RADIAL
	_fog.fill_from = Vector2(0.5, 0.5)
	_fog.fill_to = Vector2(1.0, 0.5)
	_fog.width = 128
	_fog.height = 128
	get_viewport().size_changed.connect(func() -> void:
		if visible:
			_layout())


## Opens on the waters you're in, as close as one archipelago used to fill
## it, centred on your ship (out on the high seas, on the whole sea).
func open() -> void:
	if visible or scene == null or scene.player == null:
		return
	visible = true
	_t = 0.0
	_layout()
	var p := scene.player.pos
	var high := float(scene.nearest_region(p.x, p.z)[1]) >= MapScene.HIGH_SEAS_R
	_zoom = 1.0 if high else minf(art.max_zoom, 1.35 * minf(_W, _H) / Region.SIZE / (_fit() / 0.96))
	_cx = p.x
	_cz = p.z
	_clamp_view()
	_pts.clear()
	_tap_at = -1.0
	_last_up = -10.0
	_key = []
	set_process(true)
	_step()
	_refresh()


func close() -> void:
	if not visible:
		return
	for b: UiButton in [_clear, _centre, _close]:
		if b != null:
			b.cancel()
	_pts.clear()
	_tap_at = -1.0
	card.hide_card()
	visible = false
	set_process(false)


func is_open() -> bool:
	return visible


## The back button: the card closes, else the chart.
func go_back() -> bool:
	if not visible:
		return false
	if card.is_open():
		card.closed.emit()
		return true
	close()
	closed.emit()
	return true


## Opens the card over a world spot (ChartCard.show_place's `info`), its
## mark ringed in the card's colour; already open, it hops over.
func show_card(x: float, z: float, info: Dictionary) -> void:
	_card_at = Vector2(x, z)
	_card_color = info.get("accent", HudStyle.GOLD)
	card.show_place(info, Vector2(_W, _H))
	_place_card()


func hide_card() -> void:
	card.hide_card()


func _place_card() -> void:
	if card.is_open():
		card.place(to_canvas(_card_at.x, _card_at.y), _W, _H)


## Back over your ship, at the zoom you have.
func recentre() -> void:
	if scene != null and scene.player != null:
		_cx = scene.player.pos.x
		_cz = scene.player.pos.z
		_clamp_view()


## The view: the world spot in the middle (x, z) and the zoom.
func view() -> Vector3:
	return Vector3(_cx, _cz, _zoom)


## Looks elsewhere (a set piece's view): the world spot in the middle and
## the zoom (0: as it is).
func look(x: float, z: float, zoom := 0.0) -> void:
	_cx = x
	_cz = z
	if zoom > 0.0:
		_zoom = clampf(zoom, 1.0, art.max_zoom)
	_clamp_view()


## An input event as the chart's canvas takes it (the smoke test's taps).
func poke(e: InputEvent) -> void:
	_handle(e)


## A world spot's place on the chart's canvas.
func to_canvas(x: float, z: float) -> Vector2:
	var s := _scale()
	return Vector2((x - _cx) * s + _W * 0.5, (z - _cz) * s + _H * 0.5)


## The world spot under a point of the chart's canvas (x, z).
func to_world(at: Vector2) -> Vector2:
	var s := _scale()
	return Vector2(_cx + (at.x - _W * 0.5) / s, _cz + (at.y - _H * 0.5) / s)


func _process(dt: float) -> void:
	_t += dt
	_clock += dt
	if _t < 0.5:
		_step()
	if _tap_at >= 0.0 and _clock >= _tap_at:
		_tap_at = -1.0
		tapped.emit(_tap.x, _tap.y, _tap.z)
	_refresh()


## Redraws what moves, and what's still once the view or what it shows has changed.
func _refresh() -> void:
	var key := [_cx, _cz, _zoom, _W, _H, art.drawn(), scene.discovered.size(), _charted_mask()]
	if key != _key:
		_key = key
		_under.queue_redraw()
		_over.queue_redraw()
	_flow.queue_redraw()
	_live.queue_redraw()
	_sync_head()
	_place_card()


## The chart coming in: the world frosting over (the web's fade, 0.35 s),
## the frame rising out of it, scaling up from 95% (its chart-in, 0.4 s).
func _step() -> void:
	var f := MathX.bezier(0.25, 0.1, 0.25, 1.0, clampf(_t / 0.35, 0.0, 1.0))
	var e := HudStyle.eased(clampf(_t / 0.4, 0.0, 1.0))
	var s := lerpf(0.95, 1.0, e)
	for n: Control in [_frame, _ui]:
		n.scale = Vector2(s, s)
		n.modulate.a = f * e
	var sz := _rect.size * s
	var at := _rect.get_center() - sz * 0.5
	for m: ShaderMaterial in [_back_mat, _chrome_mat]:
		m.set_shader_parameter("fade", f)
		m.set_shader_parameter("alpha", f * e)
		m.set_shader_parameter("box", sz)
		m.set_shader_parameter("radius", 20.0 * PX * s)
	_back_mat.set_shader_parameter("at", at)
	_chrome_mat.set_shader_parameter("at", at - _rect.position)


## Lays the screen out: the frame inside the screen's margins (3% round),
## the head top left, the buttons top right, the legend along the foot.
func _layout() -> void:
	var vp := get_viewport().get_visible_rect().size
	_root.size = vp
	var m := vp * 0.03
	var sz := (vp - m * 2.0).min(Vector2(1180.0, 880.0) * PX)
	_rect = Rect2(((vp - sz) * 0.5).round(), sz.round())
	_W = _rect.size.x
	_H = _rect.size.y
	_back.size = vp
	_back_mat.set_shader_parameter("quad", vp)
	_back_mat.set_shader_parameter("lod", _blur_lod(10.0 * U))
	_chrome.position = _rect.position
	_chrome.size = _rect.size
	_chrome_mat.set_shader_parameter("quad", _rect.size)
	_chrome_mat.set_shader_parameter("lod", _blur_lod(10.0 * U))
	for n: Control in [_frame, _ui]:
		n.position = _rect.position
		n.size = _rect.size
		n.pivot_offset = _rect.size * 0.5
	_content.size = _rect.size
	for l: _Layer in [_under, _flow, _over, _live]:
		l.size = _rect.size
		l.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_build_ui()
	_clamp_view()
	_step()


## The frame's look, under the chart (the frosted world and the frame's
## shadow) or over it (its shade, light and border).
func _frame_material(chrome: bool) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = preload("res://shaders/chart_frame.gdshader")
	m.set_shader_parameter("chrome", chrome)
	m.set_shader_parameter("saturate", 1.15)
	# the web's dim: an ellipse 120% by 90% of the screen round 50% 40%
	m.set_shader_parameter("rad", Vector4(0.5, 0.4, 1.2, 0.9))
	m.set_shader_parameter("rad_in", Color(3.0 / 255.0, 14.0 / 255.0, 22.0 / 255.0, 0.42))
	m.set_shader_parameter("rad_out", Color(2.0 / 255.0, 10.0 / 255.0, 16.0 / 255.0, 0.78))
	m.set_shader_parameter("c_shadow", Color(0.0, 0.0, 0.0, 0.5))
	m.set_shader_parameter("shadow", Vector2(40.0, 110.0) * PX)
	m.set_shader_parameter("c_inset", Color(4.0 / 255.0, 18.0 / 255.0, 26.0 / 255.0, 0.6))
	m.set_shader_parameter("inset", 90.0 * PX)
	m.set_shader_parameter("hi", 0.12)
	m.set_shader_parameter("hi_px", 1.0 * PX)
	m.set_shader_parameter("c_border", HudStyle.STROKE_2)
	m.set_shader_parameter("border", 1.0 * PX)
	return m


## How far down the screen's mip chain a blur of `r` units reaches.
static func _blur_lod(r: float) -> float:
	return clampf(log(maxf(1.0, r * Icons.density())) / log(2.0) - 0.5, 1.0, 6.0)


# ------------------------------------------------------------------ the head, legend and buttons


func _build_ui() -> void:
	for c in _ui.get_children():
		if c == card:
			continue
		_ui.remove_child(c)
		c.queue_free()
	_clear = null
	_clear_n = -1
	# the head: what this is and how much of the sea you've charted
	var h2 := MenuKit.words("Sea Chart", "inter", 800, 15.0 * PX, HudStyle.INK, -0.01, 1.2)
	_isles = MenuKit.words(_isles_line(), "inter", 600, 11.5 * PX, HudStyle.AQUA, 0.04, 1.2)
	_head = UiBox.new(Vector2.ONE, 14.0 * PX, 4.0)
	MenuKit.flat(_head)
	_head.p("c_top", GLASS_3).p("c_foot", GLASS_3).p("c_border", HudStyle.STROKE).p("hi", 0.0)
	# (padded inside its 1 px border, as the web's box)
	h2.position = Vector2(14.0, 8.0) * PX
	_isles.position = Vector2(14.0 * PX, h2.position.y + h2.size.y + 2.0 * PX)
	_head.add_child(h2)
	_head.add_child(_isles)
	_head.position = Vector2(10.0, 10.0) * PX
	_ui.add_child(_head)
	_fit_head()
	# the legend along the foot
	_legend = _Legend.new()
	_legend.position = Vector2((_W - _legend.size.x) * 0.5, _H - 10.0 * PX - _legend.size.y).round()
	_ui.add_child(_legend)
	# the buttons top right: clear the pins (while there are any), back over your ship, close
	_btns = Control.new()
	_btns.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ui.add_child(_btns)
	_centre = _round("target")
	_centre.pressed.connect(func() -> void:
		clicked.emit()
		recentre())
	_close = _round("close")
	_close.pressed.connect(func() -> void:
		clicked.emit()
		go_back())
	_btns.add_child(_centre)
	_btns.add_child(_close)
	# the card over everything in the frame
	_ui.move_child(card, -1)
	_sync_head()


func _round(icon: String) -> UiButton:
	# (a phone's round buttons, 38 px against the menus' 42)
	var b := MenuKit.round(icon, 38.0 * U, 18.0 * U, false)
	b.squeeze = 0.92
	b.mouse_filter = Control.MOUSE_FILTER_STOP
	return b


## The head's count of isles, and the Clear pill as the pins come and go.
func _sync_head() -> void:
	var line := _isles_line()
	if _isles != null and line != _isles.runs[0][0]:
		_isles.set_text(line)
		_fit_head()
	var n := scene.pins.pins.size() if scene.pins != null else 0
	if n != _clear_n:
		_clear_n = n
		if _clear != null:
			_clear.queue_free()
			_clear = null
		if n > 0:
			_clear = _clear_pill(n)
			_btns.add_child(_clear)
			_btns.move_child(_clear, 0)
		_place_buttons()


func _isles_line() -> String:
	var total := 0
	for r in scene.world.regions:
		total += r.islands.size()
	return "%d / %d isles charted" % [scene.discovered.size(), total]


func _fit_head() -> void:
	var h2: UiText = _head.get_child(0)
	var w := maxf(h2.size.x, _isles.size.x) + 28.0 * PX
	var h := _isles.position.y + _isles.size.y + 9.0 * PX
	_head.resize(Vector2(w, h).round())


func _place_buttons() -> void:
	var x := _W - 10.0 * PX
	var kids := _btns.get_children()
	for i in range(kids.size() - 1, -1, -1):
		var b: Control = kids[i]
		if b.is_queued_for_deletion():
			continue
		x -= b.size.x
		b.position = Vector2(x, 10.0 * PX).round()
		x -= 8.0 * PX


## Remove every waypoint at once: a gilt-edged pill, only while pins are down.
func _clear_pill(n: int) -> UiButton:
	var t := MenuKit.words("Clear %d pins" % n if n > 1 else "Clear pin", "inter", 600, 12.5 * U, PIN_GOLD)
	var h := 42.0 * U
	var ip := 14.0 * U
	var gap := 6.0 * PX
	var w := 11.0 * U + ip + gap + t.size.x + 14.0 * U
	var b := UiButton.new(Vector2(w, h).round(), h * 0.5, 20.0 * PX)
	MenuKit.flat(MenuKit.glass(b))
	b.p("c_border", Color(PIN_GOLD, 0.45)).p("glow", 14.0 * PX).p("c_glow", Color(PIN_GOLD, 0.18))
	b.squeeze = 0.94
	b.mouse_filter = Control.MOUSE_FILTER_STOP
	# (the web's icon spills out of its 14 px slot at its usual 18)
	var ic := Icons.rect("close", 18.0 * U, PIN_GOLD)
	ic.position = Vector2(11.0 * U + (ip - 18.0 * U) * 0.5, (h - 18.0 * U) * 0.5)
	t.position = Vector2(11.0 * U + ip + gap, (h - t.size.y) * 0.5)
	b.add_child(ic)
	b.add_child(t)
	b.pressed.connect(func() -> void:
		clicked.emit()
		clear_pins())
	return b


## Lifts every waypoint off the chart (its "Clear pins").
func clear_pins() -> void:
	if scene.pins != null:
		scene.pins.clear()
	pins_cleared.emit()


# ------------------------------------------------------------------ the view


func _fit() -> float:
	return minf(_W / art.sea.size.x, _H / art.sea.size.y) * 0.96


## Canvas units per metre.
func _scale() -> float:
	return _fit() * _zoom


## Zooms by `f` about a point of the canvas, keeping the spot under it there.
func _zoom_at(f: float, at: Vector2) -> void:
	var w := to_world(at)
	_zoom = clampf(_zoom * f, 1.0, art.max_zoom)
	var s := _scale()
	_cx = w.x - (at.x - _W * 0.5) / s
	_cz = w.y - (at.y - _H * 0.5) / s
	_clamp_view()


## Keeps the sea on the chart: a little open water past its edge at most.
func _clamp_view() -> void:
	var s := _scale()
	var ex := _W * 0.5 / s
	var ez := _H * 0.5 / s
	var pad := 40.0 * PX / s
	var sea := art.sea
	var mid := sea.get_center()
	_cx = mid.x if ex + pad >= sea.size.x * 0.5 else clampf(_cx, sea.position.x + ex - pad, sea.end.x - ex + pad)
	_cz = mid.y if ez + pad >= sea.size.y * 0.5 else clampf(_cz, sea.position.y + ez - pad, sea.end.y - ez + pad)


## 0 while one archipelago fills the chart .. 1 once it has shrunk to a corner of the whole sea.
func _farness() -> float:
	return clampf((0.5 - _scale() * 1024.0 / minf(_W, _H)) / 0.2, 0.0, 1.0)


func _charted(r: Region) -> bool:
	return r == null or r.id == "home" or Progress.charted(r.id)


## The archipelago whose waters hold (x, z), or null out on the high seas.
func _region_at(x: float, z: float) -> Region:
	var near: Array = scene.nearest_region(x, z)
	return near[0] if float(near[1]) < MapScene.HIGH_SEAS_R else null


## Whether the chart may show a spot (not inside a rumoured archipelago).
func shows(x: float, z: float) -> bool:
	return _charted(_region_at(x, z))


func _charted_mask() -> int:
	var m := 0
	for i in scene.world.regions.size():
		if _charted(scene.world.regions[i]):
			m |= 1 << i
	return m


# ------------------------------------------------------------------ input


## Drag to pan, pinch, the wheel or a trackpad to zoom; a tap waits a beat
## for a second (two zoom in) before it drops or lifts a pin.
func _chart_input(e: InputEvent) -> void:
	_handle(e)
	_content.accept_event()


func _handle(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		_touch = true
		_press(e.index, e.position, e.pressed)
	elif e is InputEventScreenDrag:
		_move(e.index, e.position)
	elif e is InputEventMouseButton and e.device != InputEvent.DEVICE_ID_EMULATION:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			_touch = false
			_press(-1, mb.position, mb.pressed)
		elif mb.pressed and (mb.button_index == MOUSE_BUTTON_WHEEL_UP or mb.button_index == MOUSE_BUTTON_WHEEL_DOWN):
			var notch := mb.factor if mb.factor > 0.0 else 1.0
			# a wheel's notch scrolls 100 px in a browser: the web zooms by exp(-deltaY * 0.0015)
			_zoom_at(exp((0.15 if mb.button_index == MOUSE_BUTTON_WHEEL_UP else -0.15) * notch), mb.position)
	elif e is InputEventMouseMotion and e.device != InputEvent.DEVICE_ID_EMULATION:
		_move(-1, e.position)
	elif e is InputEventMagnifyGesture:
		_zoom_at(e.factor, e.position)
	elif e is InputEventPanGesture:
		var s := _scale()
		_cx += e.delta.x * 20.0 / s
		_cz += e.delta.y * 20.0 / s
		_clamp_view()


func _press(id: int, at: Vector2, down: bool) -> void:
	if down:
		poked_ms = Time.get_ticks_msec()
		if _pts.is_empty():
			_multi = false
		_pts[id] = at
		_dragged = 0.0
		if _pts.size() == 2:
			_pinch = _pinch_dist()
			_multi = true
		return
	if not _pts.has(id):
		return
	_pts.erase(id)
	_pinch = _pinch_dist() if _pts.size() == 2 else 0.0
	if not _pts.is_empty() or _multi or _dragged > 6.0 * PX:
		return
	if _clock - _last_up < DOUBLE and at.distance_to(_last_at) < 40.0 * PX:
		# the second tap of two: in we go, and neither drops a pin
		_tap_at = -1.0
		_last_up = -10.0
		_zoom_at(2.0, at)
		return
	var w := to_world(at)
	_tap = Vector3(w.x, w.y, (26.0 if _touch else 16.0) * PX / _scale())
	_tap_at = _clock + TAP_WAIT
	_last_up = _clock
	_last_at = at


func _move(id: int, at: Vector2) -> void:
	if not _pts.has(id):
		return
	var p: Vector2 = _pts[id]
	var d := at - p
	_pts[id] = at
	if _pts.size() == 1:
		var s := _scale()
		_cx -= d.x / s
		_cz -= d.y / s
		_dragged += absf(d.x) + absf(d.y)
	elif _pts.size() == 2:
		var nd := _pinch_dist()
		if _pinch > 0.0:
			var pts: Array = _pts.values()
			_zoom_at(nd / _pinch, ((pts[0] as Vector2) + (pts[1] as Vector2)) * 0.5)
		_pinch = nd
	_clamp_view()


func _pinch_dist() -> float:
	var pts: Array = _pts.values()
	return (pts[0] as Vector2).distance_to(pts[1]) if pts.size() >= 2 else 0.0


## A tap on the frosted world round the frame closes the chart.
func _outside_input(e: InputEvent) -> void:
	var touch := e is InputEventScreenTouch
	var click: bool = e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT and e.device != InputEvent.DEVICE_ID_EMULATION
	if not (touch or click):
		return
	if e.pressed:
		_down_outside = not _rect.has_point(e.position)
	elif _down_outside:
		_down_outside = false
		if not _rect.has_point(e.position):
			go_back()
	_root.accept_event()


# ------------------------------------------------------------------ the layers


## The open sea and the archipelagos: the engraving, the rhumb lines of the
## great rose, the soundings and the open sea's names; each archipelago's
## square (or its rumour under mist), the graticule, and zoomed out far
## enough to see more than one, their names.
func _paint_under(ci: CanvasItem) -> void:
	ci.draw_rect(Rect2(Vector2.ZERO, Vector2(_W, _H)), Color("#05182a"))
	var s := _scale()
	var sea := art.sea
	var r0 := to_canvas(sea.position.x, sea.position.y)
	var sea_rect := Rect2(r0, sea.size * s)
	if art.sea_tex != null:
		ci.draw_texture_rect(art.sea_tex, sea_rect, false)
	else:
		ci.draw_rect(sea_rect, Color("#0c3a52"))
	var view := Rect2(Vector2.ZERO, Vector2(_W, _H))
	var far := _farness()
	_rhumbs(ci, s, sea_rect)
	_sea_names(ci, s, far)
	# the archipelagos, each engraved from its seabed (a rumour till you've sailed in)
	for r in scene.world.regions:
		var rect := Rect2(to_canvas(r.x0, r.z0), Vector2.ONE * Region.SIZE * s)
		if not rect.intersects(view):
			continue
		var tex: Texture2D = art.isle_tex.get(r.id)
		if _charted(r):
			if tex != null:
				ci.draw_texture_rect(tex, rect, false)
			continue
		if tex != null:
			ci.draw_texture_rect(tex, rect, false, Color(1.0, 1.0, 1.0, 0.22))
		ci.draw_texture_rect(_fog, rect, false)
	# the graticule: finer as you zoom in
	var grid := 2048.0 if s * 1024.0 < 90.0 * PX else (1024.0 if s * 256.0 < 40.0 * PX else 256.0)
	var lines := PackedVector2Array()
	var v := ceilf(sea.position.x / grid) * grid
	while v <= sea.end.x:
		var x := to_canvas(v, 0.0).x
		if x >= -2.0 and x <= _W + 2.0:
			lines.append(Vector2(x, sea_rect.position.y))
			lines.append(Vector2(x, sea_rect.end.y))
		v += grid
	v = ceilf(sea.position.y / grid) * grid
	while v <= sea.end.y:
		var y := to_canvas(0.0, v).y
		if y >= -2.0 and y <= _H + 2.0:
			lines.append(Vector2(sea_rect.position.x, y))
			lines.append(Vector2(sea_rect.end.x, y))
		v += grid
	if not lines.is_empty():
		ci.draw_multiline(lines, Color(1.0, 244.0 / 255.0, 214.0 / 255.0, 0.07), 1.0 * PX)
	# the archipelagos' names, large, once you can see more than one
	if far > 0.02:
		var cinzel := HudStyle.font("cinzel", 700)
		var serif := HudStyle.font("serif-italic", 500)
		for r in scene.world.regions:
			var at := to_canvas(r.centre.x, r.centre.z - 1120.0)
			var known := _charted(r)
			MapMarks.words(ci, at, r.title, cinzel, _px(22.0), _fade(Color("#ffe7a8") if known else Color(225.0 / 255.0, 236.0 / 255.0, 238.0 / 255.0, 0.75), far), 5.0 * PX, _fade(Color(SEA_INK, 0.75), far))
			var sub := r.motto if known else "Uncharted · only sailors' tales"
			MapMarks.words(ci, at + Vector2(0.0, 20.0 * PX), sub, serif, _px(12.0), _fade(Color(1.0, 236.0 / 255.0, 190.0 / 255.0, 0.8) if known else Color(225.0 / 255.0, 236.0 / 255.0, 238.0 / 255.0, 0.65), far), 4.0 * PX, _fade(Color(SEA_INK, 0.75), far))


## The rhumb lines, the 32 winds of the great rose run out across the whole
## sea, and the rose itself; the soundings; the shoal and its name.
func _rhumbs(ci: CanvasItem, s: float, sea_rect: Rect2) -> void:
	var rc := to_canvas(art.rose.x, art.rose.y)
	var rr := art.rose.z * s
	var reach := art.sea.size.length() * s
	var box := PackedVector2Array([sea_rect.position, Vector2(sea_rect.end.x, sea_rect.position.y), sea_rect.end, Vector2(sea_rect.position.x, sea_rect.end.y)])
	var tiers := [[Color(1.0, 232.0 / 255.0, 178.0 / 255.0, 0.17), 1.1], [Color(140.0 / 255.0, 222.0 / 255.0, 196.0 / 255.0, 0.12), 0.8], [Color(242.0 / 255.0, 160.0 / 255.0, 136.0 / 255.0, 0.1), 0.8]]
	for tier in 3:
		var lines := PackedVector2Array()
		for k in 32:
			var kt := 0 if k % 4 == 0 else (1 if k % 2 == 0 else 2)
			if kt != tier:
				continue
			var a := k / 32.0 * TAU
			var dir := Vector2(sin(a), -cos(a))
			for part: PackedVector2Array in Geometry2D.intersect_polyline_with_polygon(PackedVector2Array([rc + dir * rr * 1.05, rc + dir * reach]), box):
				for i in range(1, part.size()):
					lines.append(part[i - 1])
					lines.append(part[i])
		if not lines.is_empty():
			ci.draw_multiline(lines, tiers[tier][0], float(tiers[tier][1]) * PX, true)
	_sea_rose(ci, rc, rr)
	# soundings, in fathoms
	var serif5 := HudStyle.font("serif-italic", 500)
	var fs := _px(9.0)
	var ink := Color(200.0 / 255.0, 228.0 / 255.0, 232.0 / 255.0, 0.36)
	var mid := MapMarks.middle(serif5, fs)
	var edge := 20.0 * PX
	for p in art.soundings:
		var at := to_canvas(p.x, p.y)
		if at.x < -edge or at.y < -edge or at.x > _W + edge or at.y > _H + edge:
			continue
		var t := str(int(p.z))
		ci.draw_string(serif5, Vector2(at.x - serif5.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x * 0.5, at.y + mid), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, ink)


## The open sea's own names, along the lane: the shoal ringed in dots, the
## current, and either side the edge of the known sea.
func _sea_names(ci: CanvasItem, s: float, far: float) -> void:
	var l := art.lane()
	if l == null:
		return
	var ang := l.u.angle()
	var serif5 := HudStyle.font("serif-italic", 500)
	var serif6 := HudStyle.font("serif-italic", 600)
	# the Banco del Sereno, ringed in fine dots
	var bc := to_canvas(art.bank.x, art.bank.y)
	var ring := PackedVector2Array()
	for i in 73:
		var t := i / 72.0 * TAU
		ring.append(bc + Vector2(cos(t) * 380.0 * s, sin(t) * 210.0 * s).rotated(ang))
	var dots := MapMarks.dashes(ring, 1.5 * PX, 3.0 * PX, 0.0, 0.0, Rect2(Vector2.ZERO, Vector2(_W, _H)).grow(4.0))
	if not dots.is_empty():
		ci.draw_multiline(dots, Color(200.0 / 255.0, 236.0 / 255.0, 236.0 / 255.0, 0.3), 1.0 * PX, true)
	_label(ci, art.bank - l.p * 290.0, ang, "Banco del Sereno", serif6, 11.0, Color(205.0 / 255.0, 238.0 / 255.0, 238.0 / 255.0, 0.35 + 0.4 * far))
	var cs := art.lane(330.0)
	_label(ci, cs.at(0.5) + l.p * 120.0, ang, "Corriente del Sereno  ", serif5, 10.0, Color(170.0 / 255.0, 236.0 / 255.0, 238.0 / 255.0, 0.3 + 0.4 * far), true)
	var mid := Vector2(scene.world.regions[0].centre.x + scene.world.regions[1].centre.x, scene.world.regions[0].centre.z + scene.world.regions[1].centre.z) * 0.5
	for side: float in [-1.0, 1.0]:
		_label(ci, mid + l.p * side * (World.EDGE_R + 230.0), ang, "Beyond, the swell turns every keel back", serif5, 12.0, Color(170.0 / 255.0, 204.0 / 255.0, 214.0 / 255.0, 0.4))


## Words in ink along `ang` over the world spot `w` (with `arrow`, a long
## arrow after them: the fonts have no ⟶).
func _label(ci: CanvasItem, w: Vector2, ang: float, text: String, font: Font, css: float, color: Color, arrow := false) -> void:
	var at := to_canvas(w.x, w.y)
	var edge := 400.0 * PX
	if at.x < -edge or at.y < -edge or at.x > _W + edge or at.y > _H + edge:
		return
	var fs := _px(css)
	var tw := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var aw := fs * 1.5 if arrow else 0.0
	var x0 := -(tw + aw) * 0.5
	ci.draw_set_transform(at, ang)
	ci.draw_string(font, Vector2(x0, MapMarks.middle(font, fs)), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, color)
	if arrow:
		var y := -fs * 0.08
		var x1 := x0 + tw + aw
		var lw := maxf(1.0, fs * 0.07)
		ci.draw_line(Vector2(x0 + tw, y), Vector2(x1 - lw, y), color, lw, true)
		ci.draw_polyline(PackedVector2Array([Vector2(x1 - fs * 0.28, y - fs * 0.2), Vector2(x1, y), Vector2(x1 - fs * 0.28, y + fs * 0.2)]), color, lw, true)
	ci.draw_set_transform(Vector2.ZERO)


## The open sea's great compass rose, inked in gilt and sea-green, an old
## portolan's flourish.
func _sea_rose(ci: CanvasItem, c: Vector2, r: float) -> void:
	if r < 6.0 * PX or c.x < -r * 1.3 or c.y < -r * 1.3 or c.x > _W + r * 1.3 or c.y > _H + r * 1.3:
		return
	var gilt := Color(1.0, 232.0 / 255.0, 178.0 / 255.0, 0.42)
	# rings, with a tick for every one of the 32 winds
	ci.draw_arc(c, r, 0.0, TAU, 96, gilt, maxf(0.8 * PX, r * 0.012), true)
	ci.draw_arc(c, r * 0.9, 0.0, TAU, 96, gilt, maxf(0.6 * PX, r * 0.006), true)
	var ticks := PackedVector2Array()
	for k in 128:
		var a := k / 128.0 * TAU
		var d := Vector2(sin(a), -cos(a))
		ticks.append(c + d * r * (0.86 if k % 4 == 0 else 0.94))
		ticks.append(c + d * r * 0.99)
	ci.draw_multiline(ticks, gilt, maxf(0.6 * PX, r * 0.006), true)
	# the star: long cardinals, the half-winds behind, each point lit on one flank
	for k in 8:
		_point(ci, c, k / 8.0 * TAU + PI / 8.0, r * 0.58, r * 0.07, Color(140.0 / 255.0, 214.0 / 255.0, 190.0 / 255.0, 0.5), Color(30.0 / 255.0, 80.0 / 255.0, 84.0 / 255.0, 0.6))
	for k in 4:
		_point(ci, c, k / 4.0 * TAU + PI / 4.0, r * 0.66, r * 0.1, Color(232.0 / 255.0, 236.0 / 255.0, 222.0 / 255.0, 0.55), Color(36.0 / 255.0, 66.0 / 255.0, 80.0 / 255.0, 0.65))
	for k in 4:
		_point(ci, c, k / 4.0 * TAU, r * (0.9 if k == 0 else 0.84), r * 0.13, Color(246.0 / 255.0, 206.0 / 255.0, 112.0 / 255.0, 0.75), Color(120.0 / 255.0, 82.0 / 255.0, 34.0 / 255.0, 0.75))
	ci.draw_circle(c, r * 0.04, Color(246.0 / 255.0, 206.0 / 255.0, 112.0 / 255.0, 0.85), true, -1.0, true)
	# and the cardinal letters
	if r > 22.0 * PX:
		var f := HudStyle.font("cinzel", 700)
		var fs := roundi(minf(26.0 * PX, r * 0.13))
		var mid := MapMarks.middle(f, fs)
		var big := r * 1.1
		for l: Array in [["N", Vector2(0.0, -big), Color(1.0, 226.0 / 255.0, 150.0 / 255.0, 0.8)], ["S", Vector2(0.0, big), Color(232.0 / 255.0, 236.0 / 255.0, 222.0 / 255.0, 0.55)], ["E", Vector2(big, 0.0), Color(232.0 / 255.0, 236.0 / 255.0, 222.0 / 255.0, 0.55)], ["W", Vector2(-big, 0.0), Color(232.0 / 255.0, 236.0 / 255.0, 222.0 / 255.0, 0.55)]]:
			var t: String = l[0]
			var at: Vector2 = c + (l[1] as Vector2)
			ci.draw_string(f, Vector2(at.x - f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x * 0.5, at.y + mid), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, l[2])


## One point of the rose: a long thin kite from the middle, lit on one flank.
static func _point(ci: CanvasItem, c: Vector2, a: float, length: float, width: float, lit: Color, dark: Color) -> void:
	var tip := c + Vector2(sin(a), -cos(a)) * length
	var n := Vector2(cos(a), sin(a)) * width
	ci.draw_colored_polygon(PackedVector2Array([c, tip, c + n]), lit)
	ci.draw_colored_polygon(PackedVector2Array([c, tip, c - n]), dark)


## What flows under the isles: the Sereno current and its counter-set either
## side of the lane, the lane itself dotted like an old sailing route, and
## the plunder afloat.
func _paint_flow(ci: CanvasItem) -> void:
	var view := Rect2(Vector2.ZERO, Vector2(_W, _H)).grow(8.0 * PX)
	var far := _farness()
	var l := art.lane()
	if l != null:
		var flow := 0.4 + 0.6 * far
		for set: Vector2 in [Vector2(330.0, 1.0), Vector2(-360.0, -1.0)]:
			var c := art.lane(set.x)
			var a := to_canvas(c.a.x, c.a.y)
			var q := to_canvas(c.q.x, c.q.y)
			var b := to_canvas(c.b.x, c.b.y)
			var dashes := MapMarks.dashes(_curve(a, q, b), 2.0 * PX, 7.0 * PX, -_clock * 6.0 * set.y * PX, 0.5 * PX, view)
			if not dashes.is_empty():
				ci.draw_multiline(dashes, Color(150.0 / 255.0, 232.0 / 255.0, 236.0 / 255.0, 0.22 * flow), 1.0 * PX, true)
			# drifting chevrons showing the set
			var marks := PackedVector2Array()
			var k := 5.0 * PX
			for n in 7:
				var t := 0.06 + fposmod((n + 0.5) / 7.0 + _clock * 0.006 * set.y, 1.0) * 0.88
				var p := a * (1.0 - t) * (1.0 - t) + q * 2.0 * (1.0 - t) * t + b * t * t
				if not view.has_point(p):
					continue
				var d := ((q - a) * 2.0 * (1.0 - t) + (b - q) * 2.0 * t).normalized() * set.y
				marks.append_array([p - d * k + Vector2(-d.y, d.x) * k * 0.8, p, p, p - d * k - Vector2(-d.y, d.x) * k * 0.8])
			if not marks.is_empty():
				ci.draw_multiline(marks, Color(170.0 / 255.0, 240.0 / 255.0, 240.0 / 255.0, 0.55 * flow), 1.4 * PX, true)
		# the lane, from the Fortunate Isles' edge to Las Brumas', bowed like a real course
		if far > 0.02:
			var lane := MapMarks.dashes(_curve(to_canvas(l.a.x, l.a.y), to_canvas(l.q.x, l.q.y), to_canvas(l.b.x, l.b.y)), 3.0 * PX, 9.0 * PX, -_clock * 4.0 * PX, 1.0 * PX, view)
			if not lane.is_empty():
				ci.draw_multiline(lane, Color(1.0, 236.0 / 255.0, 190.0 / 255.0, 0.45 * far), 2.0 * PX, true)
	# salvage, glowing in its rarity's colour
	var loot := scene.world.loot
	for it in loot.all():
		var w := loot.where(it)
		var at := to_canvas(w.x, w.y)
		if not view.has_point(at):
			continue
		var col: Color = MapMarks.LOOT[it.tier]
		var r := (5.0 if it.tier >= 3 else (4.0 if it.tier > 0 else 3.0)) * PX
		MapMarks.glow(ci, at, r, (14.0 if it.tier >= 3 else 8.0) * PX * 0.5, col)
		ci.draw_circle(at, r, col, true, -1.0, true)


## The lane across the high seas named; the isles, named once charted (else
## a question mark), and the market towns, every sailor knows where they
## are. Zoomed out to the whole sea, the isles go and the towns shrink to marks.
func _paint_over(ci: CanvasItem) -> void:
	var s := _scale()
	var far := _farness()
	var detail := far < 0.5
	var view := Rect2(Vector2.ZERO, Vector2(_W, _H)).grow(60.0 * PX)
	var l := art.lane()
	if far > 0.02 and l != null:
		var a := to_canvas(l.a.x, l.a.y)
		var b := to_canvas(l.b.x, l.b.y)
		var m := to_canvas(l.at(0.5).x, l.at(0.5).y)
		var serif6 := HudStyle.font("serif-italic", 600)
		var serif5 := HudStyle.font("serif-italic", 500)
		ci.draw_set_transform(m, (b - a).angle())
		MapMarks.words(ci, Vector2(0.0, -14.0 * PX), ChartArt.HIGH_SEAS_NAME, serif6, _px(15.0), _fade(Color(190.0 / 255.0, 236.0 / 255.0, 240.0 / 255.0, 0.9), far), 4.0 * PX, _fade(Color(SEA_INK, 0.7), far))
		MapMarks.words(ci, Vector2(0.0, 6.0 * PX), "the high seas · calm water, dolphins, whales", serif5, _px(11.0), _fade(Color(190.0 / 255.0, 236.0 / 255.0, 240.0 / 255.0, 0.7), far), 4.0 * PX, _fade(Color(SEA_INK, 0.7), far))
		ci.draw_set_transform(Vector2.ZERO)
	var cinzel := HudStyle.font("cinzel", 700)
	if detail:
		var inter5 := HudStyle.font("inter", 500)
		var name_px := _px(minf(18.0, 12.0 + _zoom * 1.2))
		for r in scene.world.regions:
			if not _charted(r):
				continue
			for isl: Dictionary in r.islands:
				var at := to_canvas(float(isl.x), float(isl.z))
				if not view.has_point(at):
					continue
				var ly := at.y + maxf(14.0 * PX, float(isl.r) * s * 0.55 + 12.0 * PX)
				if scene.known(r, isl):
					MapMarks.words(ci, Vector2(at.x, ly), str(isl.name), cinzel, name_px, Color("#fff1c8"), 4.0 * PX, Color(SEA_INK, 0.75))
				else:
					MapMarks.words(ci, at, "?", cinzel, _px(20.0), Color(1.0, 241.0 / 255.0, 184.0 / 255.0, 0.95), 4.0 * PX, Color(SEA_INK, 0.7))
					MapMarks.words(ci, Vector2(at.x, ly), "Uncharted", inter5, _px(11.0), Color(1.0, 241.0 / 255.0, 200.0 / 255.0, 0.7), 4.0 * PX, Color(SEA_INK, 0.7))
	# the market towns
	for tp in scene.ports:
		var w := MapScene.port_at(tp)
		if not shows(w.x, w.y):
			continue
		var at := to_canvas(w.x, w.y)
		if not view.has_point(at):
			continue
		MapMarks.port(ci, at, (9.0 if detail else 5.0) * PX)
		if detail:
			MapMarks.words(ci, at - Vector2(0.0, 18.0 * PX), tp.title, cinzel, _px(12.0), Color("#ffd77a"), 4.0 * PX, Color(SEA_INK, 0.8))


## The live marks over it all: the helmsman's course, your spyglass's reach
## and your heading, the pirates in range, you, your waypoints with their
## courses, the place the card is open over, the wind's rose and the scale.
func _paint_live(ci: CanvasItem) -> void:
	var s := _scale()
	var view := Rect2(Vector2.ZERO, Vector2(_W, _H)).grow(4.0 * PX)
	var me := scene.player
	var pc := to_canvas(me.pos.x, me.pos.z)
	if scene.route.size() > 1:
		var course := PackedVector2Array()
		course.resize(scene.route.size())
		for i in scene.route.size():
			course[i] = to_canvas(scene.route[i].x, scene.route[i].y)
		MapMarks.route(ci, course, _clock, PX, view.grow(20.0 * PX))
	# the spyglass's reach, and the way she's heading
	var reach := ChartArt.SPYGLASS * s
	var ring := PackedVector2Array()
	var n := clampi(ceili(reach * TAU / (3.0 * PX)), 48, 1440)
	for i in n + 1:
		var a := i * TAU / n
		ring.append(pc + Vector2(cos(a), sin(a)) * reach)
	var glass := Color(1.0, 244.0 / 255.0, 214.0 / 255.0, 0.28)
	var dash := MapMarks.dashes(ring, 4.0 * PX, 6.0 * PX, 0.0, 0.0, view)
	if not dash.is_empty():
		ci.draw_multiline(dash, glass, 1.2 * PX, true)
	var bow := pc + Vector2(sin(me.heading), cos(me.heading)) * 160.0 * s
	dash = MapMarks.dashes(PackedVector2Array([pc, bow]), 4.0 * PX, 6.0 * PX, 0.0, 0.0, view)
	if not dash.is_empty():
		ci.draw_multiline(dash, Color(1.0, 1.0, 1.0, 0.55), 1.2 * PX, true)
	# the pirates your spyglass can make out
	for sh in scene.world.ships:
		if sh == me or not sh.alive:
			continue
		var at := to_canvas(sh.pos.x, sh.pos.z)
		if sh.team == Ship.Team.PLAYER:
			MapMarks.ship(ci, at, sh.heading, HudStyle.AQUA, 11.0 * PX, 2.0 * PX, Color(0.0, 0.0, 0.0, 0.55))
		elif Vector2(sh.pos.x - me.pos.x, sh.pos.z - me.pos.z).length() <= ChartArt.SPYGLASS:
			MapMarks.ship(ci, at, sh.heading, Color("#ff6a55"), 10.0 * PX, 2.0 * PX, Color(0.0, 0.0, 0.0, 0.55))
	# you are here
	var pulse := fposmod(_clock * 0.8, 1.0)
	ci.draw_arc(pc, (10.0 + pulse * 22.0) * PX, 0.0, TAU, 48, Color(1.0, 1.0, 1.0, 0.7 * (1.0 - pulse)), 2.0 * PX, true)
	MapMarks.ship(ci, pc, me.heading, Color.WHITE, 14.0 * PX, 2.0 * PX, Color(0.0, 0.0, 0.0, 0.55))
	# the waypoints: a dotted course from the ship, the pin and how far
	if scene.pins != null and not scene.pins.pins.is_empty():
		var pins := scene.pins.pins
		for pin in pins:
			var course := MapMarks.dashes(PackedVector2Array([pc, to_canvas(pin.x, pin.z)]), 2.0 * PX, 6.0 * PX, 0.0, 0.8 * PX, view)
			if not course.is_empty():
				ci.draw_multiline(course, Color(MapMarks.PIN[pin.hue], 0.7), 1.6 * PX, true)
		var inter6 := HudStyle.font("inter", 600)
		var inter7 := HudStyle.font("inter", 700)
		for i in pins.size():
			var pin := pins[i]
			var at := to_canvas(pin.x, pin.z)
			if not view.grow(40.0 * PX).has_point(at):
				continue
			var css: Color = MapMarks.PIN[pin.hue]
			# a dropped pin lands with a little bounce
			var k := minf(1.0, pin.age / 0.45)
			var drop := ((1.0 - k) * (1.0 - k) * 26.0 - sin(k * PI) * 3.0) * PX
			var rp := fposmod(_clock * 0.6 + i * 0.3, 1.0)
			var rx := (6.0 + rp * 16.0) * PX
			var oval := PackedVector2Array()
			for j in 41:
				var a := j / 40.0 * TAU
				oval.append(at + Vector2(cos(a) * rx, sin(a) * rx * 0.5))
			ci.draw_polyline(oval, Color(css, 0.6 * (1.0 - rp)), 1.5 * PX, true)
			MapMarks.pin(ci, at - Vector2(0.0, drop), 10.0 * PX, css, str(i + 1), inter7)
			var t := MapScene.distance(Vector2(pin.x - me.pos.x, pin.z - me.pos.z).length())
			var fs := _px(11.5)
			MapMarks.words(ci, Vector2(at.x, at.y + 7.0 * PX + inter6.get_ascent(fs)), t, inter6, fs, css, 3.5 * PX, Color(SEA_INK, 0.8), true)
	# the place whose card is open: a soft ring breathing round it
	if card.is_open():
		var at := to_canvas(_card_at.x, _card_at.y)
		var b := 0.5 + 0.5 * sin(_clock * 3.2)
		var rr := (15.0 + b * 3.0) * PX
		ci.draw_arc(at, rr, 0.0, TAU, 64, Color(_card_color, 0.55 + 0.35 * b), 2.0 * PX, true)
		ci.draw_arc(at, rr, 0.0, TAU, 64, Color(_card_color, 0.25), 6.0 * PX, true)
	var w := scene.world.wind
	_wind_rose(ci, Vector2(_W - 58.0 * PX, _H - 58.0 * PX), 40.0 * PX, w.dir_x, w.dir_z)
	_scale_bar(ci, Vector2(18.0 * PX, _H - 22.0 * PX), s)


## The wind's rose, bottom right: north in gold, and an arrow the way the wind blows.
func _wind_rose(ci: CanvasItem, c: Vector2, r: float, wx: float, wz: float) -> void:
	ci.draw_circle(c, r + 6.0 * PX, Color(8.0 / 255.0, 26.0 / 255.0, 36.0 / 255.0, 0.55), true, -1.0, true)
	var hw := 5.0 * PX
	for i in 4:
		var a := (i + 1) * PI * 0.5
		var pts := PackedVector2Array([Vector2(0.0, -r), Vector2(hw, 0.0), Vector2(-hw, 0.0)])
		for j in 3:
			pts[j] = c + pts[j].rotated(a)
		ci.draw_colored_polygon(pts, Color("#efc463") if i == 3 else Color(1.0, 241.0 / 255.0, 214.0 / 255.0, 0.85))
	var f := HudStyle.font("cinzel", 700)
	var fs := _px(11.0)
	ci.draw_string(f, Vector2(c.x - f.get_string_size("N", HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x * 0.5, c.y - r - 16.0 * PX + MapMarks.middle(f, fs)), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#efc463"))
	var turn := PI - atan2(wx, wz)
	var ink := Color("#7fe3f0")
	ci.draw_line(c + Vector2(0.0, r * 0.7).rotated(turn), c + Vector2(0.0, -r * 0.55).rotated(turn), ink, 2.0 * PX, true)
	var head := PackedVector2Array([Vector2(0.0, -r * 0.75), Vector2(hw, -r * 0.5), Vector2(-hw, -r * 0.5)])
	for j in 3:
		head[j] = c + head[j].rotated(turn)
	ci.draw_colored_polygon(head, ink)


## The scale, bottom left: the first round distance more than 60 px long.
func _scale_bar(ci: CanvasItem, at: Vector2, s: float) -> void:
	var metres := 2000.0
	for m: float in [100.0, 200.0, 500.0, 1000.0, 2000.0]:
		if m * s > 60.0 * PX:
			metres = m
			break
	var length := metres * s
	var ink := Color(1.0, 241.0 / 255.0, 214.0 / 255.0, 0.85)
	var tick := 4.0 * PX
	ci.draw_polyline(PackedVector2Array([at - Vector2(0.0, tick), at, at + Vector2(length, 0.0), at + Vector2(length, -tick)]), ink, 2.0 * PX, true)
	var f := HudStyle.font("inter", 500)
	var fs := _px(11.0)
	var t := "%d m" % int(metres) if metres < 1000.0 else "%d km" % int(metres / 1000.0)
	ci.draw_string(f, Vector2(at.x + 2.0 * PX, at.y - 6.0 * PX - f.get_descent(fs)), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, ink)


## A quadratic curve through the canvas, as a polyline.
static func _curve(a: Vector2, q: Vector2, b: Vector2) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in 49:
		var t := i / 48.0
		pts.append(a * (1.0 - t) * (1.0 - t) + q * 2.0 * (1.0 - t) * t + b * t * t)
	return pts


## The web's CSS px as a font size here.
static func _px(css: float) -> int:
	return roundi(css * PX)


static func _fade(c: Color, k: float) -> Color:
	return Color(c, c.a * k)


## One of the chart's layers, painted by the chart.
class _Layer:
	extends Control
	var paint: Callable

	func _init(f: Callable) -> void:
		paint = f
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		paint.call(self)


## The legend along the chart's foot: what each mark is, and what a tap does.
class _Legend:
	extends Control
	var _box: UiBox
	var _ink: Control
	var _font: Font
	var _fs := 0
	var _xs: Array[float] = []

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var px := HudStyle.PX
		_font = HudStyle.font("inter", 600)
		_fs = roundi(10.5 * px)
		var dot := 9.0 * px
		# (inside its 1 px border, as the web's box)
		var x := 13.0 * px
		for i in SeaChart.LEGEND.size():
			if i > 0:
				x += 11.0 * px
			_xs.append(x)
			x += dot + 6.0 * px + _font.get_string_size(str(SeaChart.LEGEND[i][1]), HORIZONTAL_ALIGNMENT_LEFT, -1, _fs).x
		var sz := Vector2(x + 13.0 * px, roundf(_fs * 1.21) + 14.0 * px).round()
		size = sz
		_box = UiBox.new(sz, sz.y * 0.5, 4.0)
		MenuKit.flat(_box)
		_box.p("c_top", SeaChart.GLASS_3).p("c_foot", SeaChart.GLASS_3).p("c_border", HudStyle.STROKE).p("hi", 0.0)
		add_child(_box)
		_ink = Control.new()
		_ink.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_ink.size = sz
		_ink.draw.connect(_draw_ink)
		add_child(_ink)

	func _draw_ink() -> void:
		var px := HudStyle.PX
		var dot := 9.0 * px
		var cy := size.y * 0.5
		var base := cy + MapMarks.middle(_font, _fs)
		for i in SeaChart.LEGEND.size():
			var kind: String = SeaChart.LEGEND[i][0]
			var c := Vector2(_xs[i] + dot * 0.5, cy)
			match kind:
				"you":
					_ink.draw_circle(c, dot * 0.5, Color.WHITE, true, -1.0, true)
				"foe":
					_ink.draw_circle(c, dot * 0.5, Color("#ff6a55"), true, -1.0, true)
				"loot":
					MapMarks.glow(_ink, c, dot * 0.5, 6.0 * px * 0.5, Color("#ffd06e"))
					_ink.draw_circle(c, dot * 0.5, Color("#ffe08a"), true, -1.0, true)
				"wind":
					_ink.draw_circle(c, dot * 0.5, Color("#7fe3f0"), true, -1.0, true)
				"pin":
					# a teardrop, its point straight down (the web's square corner turned under)
					MapMarks.glow(_ink, c, dot * 0.5, 6.0 * px * 0.5, SeaChart.PIN_GOLD)
					var pts := PackedVector2Array()
					for j in 25:
						var a := PI * 0.75 + j / 24.0 * PI * 1.5
						pts.append(c + Vector2(cos(a), sin(a)) * dot * 0.5)
					pts.append(c + Vector2(0.0, dot * 0.5 * sqrt(2.0)))
					_ink.draw_colored_polygon(pts, SeaChart.PIN_GOLD)
			_ink.draw_string(_font, Vector2(_xs[i] + dot + 6.0 * px, base), str(SeaChart.LEGEND[i][1]), HORIZONTAL_ALIGNMENT_LEFT, -1, _fs, HudStyle.INK_2)
