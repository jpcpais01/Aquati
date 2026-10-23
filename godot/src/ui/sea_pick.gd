class_name SeaPick
extends CanvasLayer
## "Where shall we sail?": the picker between Set Sail and the voyage, laid
## out as the web lays it out on a phone held sideways. A card for each
## archipelago, side by side: a little painted chart of its isles with an
## anchor where you'll weigh it (shaders/sea_chart.gdshader paints each once,
## on the GPU, from the very seabed you'll sail), its name, a line on what
## it's like and a few facts. One tap on a card weighs anchor there: it
## glows, the other bows out, and a beat later the voyage begins. Back to
## harbour (top left), a tap off the cards or the back button return to the
## harbour; 1 and 2, the arrows and Enter work it from a keyboard.

## A card was tapped: the voyage sets out there (`id`, an archipelago's).
signal chosen(id: String)
signal back
signal clicked

## The web's painted chart (art pixels), and how much taller it is than a
## card's window onto it on a phone held sideways (its middle shows).
const ART := Vector2(520.0, 300.0)
const CROP := 1.45
const VIBE := {
	"home": "Sunlit lagoons, white beaches and your home port. The easy way in.",
	"brumas": "Limestone towers and jade jungle in a drifting mist, a long voyage from home.",
}
## Each archipelago's land on its chart: sand, low and high green, rock and the peaks.
const LAND := {
	"home": [Color8(246, 228, 182), Color8(124, 196, 92), Color8(58, 146, 76), Color8(150, 132, 112), Color8(214, 204, 186)],
	"brumas": [Color8(236, 228, 210), Color8(92, 176, 132), Color8(44, 128, 104), Color8(196, 204, 190), Color8(236, 240, 230)],
}
## How long the chosen card glows before the voyage sets out (s).
const BEAT := 0.26

## The seas on offer (setup()): each {id, name, region, isles, berth, chips, gold}.
var _seas: Array[Dictionary] = []
## Each sea's painted chart: [its SubViewport, the anchor's place on it (shares)].
var _charts := {}
var _root: Control
var _shade: ShaderMaterial
var _head: Control
var _back: UiButton
var _holders: Array[Control] = []
var _cards: Array[UiButton] = []
var _pings: Array[UiBox] = []
var _reveal := MenuKit.Reveal.new()
var _vp := Vector2.ZERO
var _def := "home"
var _remembered := false
## Seconds since it opened, and since a card was chosen (-1 none yet).
var _t := 0.0
var _picked := -1
var _picked_t := 0.0
## The card a keyboard has picked out (-1 none), and where a tap off the cards began.
var _focus := -1
var _press := Vector2(-1.0, -1.0)


func _ready() -> void:
	layer = 7
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.gui_input.connect(_on_backdrop)
	add_child(_root)
	visible = false
	set_process(false)
	get_viewport().size_changed.connect(func() -> void:
		if visible and _picked < 0:
			_build())


## The seas to offer: their names, isles, berths and facts, and their regions
## (whose seabeds the charts are painted from).
func setup(seas: Array[Dictionary]) -> void:
	_seas = seas


## Up, the sea set out from last time (or the home waters) marked: "Last
## voyage" once one has been picked, "Start here" before.
func open(def_id: String, remembered: bool) -> void:
	_def = def_id
	_remembered = remembered
	_t = 0.0
	_picked = -1
	_focus = -1
	visible = true
	_build()
	set_process(true)


func close() -> void:
	for b in _all_buttons():
		b.cancel()
	visible = false
	set_process(false)


func is_open() -> bool:
	return visible


## The back button: straight back to the harbour (not once a card is chosen).
func go_back() -> bool:
	if not visible:
		return false
	if _picked < 0:
		clicked.emit()
		close()
		back.emit()
	return true


func _all_buttons() -> Array[UiButton]:
	var out: Array[UiButton] = []
	out.append_array(_cards)
	if _back != null:
		out.append(_back)
	return out


func _build() -> void:
	for c in _root.get_children():
		_root.remove_child(c)
		c.queue_free()
	_reveal.clear()
	_holders.clear()
	_cards.clear()
	_pings.clear()
	_back = null
	_vp = get_viewport().get_visible_rect().size
	_root.size = _vp
	var u := MenuKit.U
	var t := MenuKit.T
	var px := MenuKit.PX
	var mx := _vp.x * 0.03
	var my := _vp.y * 0.03
	# the sea darkened round the cards, deepest at the edges
	var shade := ColorRect.new()
	shade.size = _vp
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shade = ShaderMaterial.new()
	_shade.shader = preload("res://shaders/menu_shade.gdshader")
	_shade.set_shader_parameter("rad", Vector4(0.5, 0.46, 0.9, 0.7))
	_shade.set_shader_parameter("rad_in", Color8(3, 18, 28, 71))
	_shade.set_shader_parameter("rad_out", Color8(2, 10, 18, 189))
	_shade.set_shader_parameter("top_rgb", Vector3(2.0, 12.0, 20.0) / 255.0)
	_shade.set_shader_parameter("top_a", 0.35)
	_shade.set_shader_parameter("top_s", 0.3)
	_shade.set_shader_parameter("foot_rgb", Vector3(2.0, 12.0, 20.0) / 255.0)
	_shade.set_shader_parameter("foot_a", 0.45)
	_shade.set_shader_parameter("foot_s", 0.3)
	_shade.set_shader_parameter("fade", 0.0)
	shade.material = _shade
	_root.add_child(shade)
	# the cards, side by side, under the question
	var cw := minf(400.0 * u, _vp.x * 0.45)
	var gap := 20.0 * u
	var cards: Array[UiButton] = []
	var ch := 0.0
	for i in _seas.size():
		var c := _card(i, _seas[i], cw)
		cards.append(c)
		ch = maxf(ch, c.size.y)
	var title := MenuKit.words("Where shall we sail?", "inter", 800, 24.0 * t, HudStyle.INK, -0.025, 1.04)
	title.halo = Color(0.0, 0.0, 0.0, 0.14)
	var title_h := 24.0 * t * 1.04
	var total := title_h + 10.0 * u + ch
	var top := my + maxf(0.0, (_vp.y - my * 2.0 - total) * 0.5)
	_head = Control.new()
	_head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_head.position = Vector2(0.0, top)
	_head.size = Vector2(_vp.x, title_h)
	MenuKit.line_at(title, (_vp.x - title.size.x) * 0.5, 0.0, title_h)
	_head.add_child(title)
	_root.add_child(_head)
	var row_w := cw * cards.size() + gap * (cards.size() - 1)
	var x := (_vp.x - row_w) * 0.5
	for i in cards.size():
		# each card in a holder that brings it in and bows it out; the card squeezes itself
		var h := Control.new()
		h.mouse_filter = Control.MOUSE_FILTER_IGNORE
		h.size = cards[i].size
		h.position = Vector2(x, top + title_h + 10.0 * u)
		h.pivot_offset = h.size * 0.5
		h.add_child(cards[i])
		_root.add_child(h)
		_holders.append(h)
		_cards.append(cards[i])
		_reveal.add(h, MenuKit.POP, i * 0.08, 0.5, 12.0 * px)
		x += cw + gap
	_back = MenuKit.pill("", "Back to harbour", 14.0 * t + 16.0 * u, 14.0 * u, 14.0 * t, 600, Color(0.031, 0.086, 0.125, 0.6), HudStyle.INK_2)
	_back.position = Vector2(mx, my)
	_back.pressed.connect(func() -> void: go_back())
	_root.add_child(_back)
	_reveal.add(_head, MenuKit.RISE, 0.0, 0.45, 14.0 * px)
	_reveal.add(_back, MenuKit.FADE, 0.0, 0.6)
	_step(0.0)


## A sea's card: its chart's window (with the anchor and, on the sea set out
## from last time, its tag), then its name, its line and its facts.
func _card(i: int, sea: Dictionary, w: float) -> UiButton:
	var u := MenuKit.U
	var t := MenuKit.T
	var px := MenuKit.PX
	var id := str(sea.id)
	var def := id == _def
	var art_h := w / (ART.x / ART.y * CROP)
	var pad := 20.0 * u
	# the words first: they set how tall the card is
	var body: Array[Control] = []
	var y := art_h - 26.0 * u
	var name_h := 26.0 * t * 1.1
	var nm := MenuKit.words(str(sea.name), "cinzel", 700, 26.0 * t, HudStyle.INK, 0.01, 1.1)
	nm.halo = Color(0.0, 0.0, 0.0, 0.22)
	MenuKit.line_at(nm, pad, y, name_h)
	body.append(nm)
	y += name_h + 4.0 * u + 2.0 * u
	var vibe := UiText.new([[str(VIBE.get(id, "")), HudStyle.font("inter", 500), roundi(13.0 * t), HudStyle.INK_2]], w - pad * 2.0, 1.45)
	vibe.position = Vector2(pad, y)
	body.append(vibe)
	y += vibe.size.y + 4.0 * u + 8.0 * u
	var cx := pad
	var row_h := 0.0
	var chips: Array = sea.chips
	for k in chips.size():
		var chip := _chip(str(chips[k]), k == int(sea.get("gold", -1)))
		if cx > pad and cx + chip.size.x > w - pad:
			cx = pad
			y += row_h + 6.0 * u
		chip.position = Vector2(cx, y)
		body.append(chip)
		cx += chip.size.x + 6.0 * u
		row_h = chip.size.y
	y += row_h + 18.0 * u
	var card := UiButton.new(Vector2(w, y), 22.0 * u, 70.0 * u)
	card.squeeze = 0.985
	card.p("c_top", Color8(14, 36, 50, 230)).p("c_foot", Color8(6, 18, 28, 240)).p("c_border", HudStyle.STROKE_2)
	if def:
		card.p("c_border", Color8(244, 199, 101, 191)).p("ring", 1.0 * px).p("c_ring", Color8(244, 199, 101, 102))
		card.p("glow", 44.0 * px).p("c_glow", Color8(244, 199, 101, 41))
	card.pressed.connect(func() -> void: _pick(i))
	# the chart's window, inside the card's hairline
	var chart := _chart(sea, w)
	var art := TextureRect.new()
	art.texture = (chart[0] as SubViewport).get_texture()
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_SCALE
	art.position = Vector2(1.0, 1.0)
	art.size = Vector2(w - 2.0, art_h - 1.0)
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var am := ShaderMaterial.new()
	am.shader = preload("res://shaders/sea_card.gdshader")
	am.set_shader_parameter("box", art.size)
	am.set_shader_parameter("radius", 22.0 * u - 1.0)
	am.set_shader_parameter("crop", CROP)
	am.set_shader_parameter("style", 0 if id == "home" else 1)
	art.material = am
	card.add_child(art)
	# where you'll weigh anchor
	var pin_at: Vector2 = chart[1]
	var pd := 30.0 * u
	var pin := UiBox.new(Vector2(pd, pd), pd * 0.5, 30.0 * u)
	pin.p("c_top", HudStyle.GOLD_TOP).p("c_mid", HudStyle.GOLD_MID).p("mid", 0.52).p("c_foot", HudStyle.GOLD_FOOT)
	pin.p("border", 0.0).p("hi", 0.0).p("ring", 2.0 * px).p("c_ring", Color(1.0, 1.0, 1.0, 0.85))
	pin.p("c_shadow", Color(0.0, 0.0, 0.0, 0.45)).p("shadow", Vector2(4.0, 14.0) * px)
	var py := clampf(0.5 + (pin_at.y - 0.5) * CROP, 0.14, 0.78)
	pin.position = Vector2(art.position.x + pin_at.x * art.size.x, art.position.y + py * art.size.y) - Vector2(pd, pd) * 0.5
	var ping := UiBox.new(Vector2(pd, pd), pd * 0.5, 8.0 * u)
	MenuKit.flat(ping)
	ping.p("c_top", Color(0.0, 0.0, 0.0, 0.0)).p("c_foot", Color(0.0, 0.0, 0.0, 0.0)).p("hi", 0.0)
	ping.p("border", 2.0 * px).p("c_border", HudStyle.GOLD_HI)
	ping.pivot_offset = Vector2(pd, pd) * 0.5
	pin.add_child(ping)
	_pings.append(ping)
	var anchor := Icons.rect("anchor", pd * 0.62, HudStyle.GOLD_INK)
	anchor.position = Vector2(pd, pd) * 0.19
	pin.add_child(anchor)
	card.add_child(pin)
	if def:
		var tt := MenuKit.words("LAST VOYAGE" if _remembered else "START HERE", "inter", 800, 11.0 * t, HudStyle.GOLD_INK, 0.08, 1.0)
		var th := 11.0 * t + 10.0 * u
		var tag := UiBox.new(Vector2(tt.size.x + 20.0 * u, th), th * 0.5, 20.0 * u)
		tag.p("c_top", HudStyle.GOLD_TOP).p("c_mid", HudStyle.GOLD_MID).p("mid", 0.52).p("c_foot", HudStyle.GOLD_FOOT)
		tag.p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.35)).p("shadow", Vector2(4.0, 14.0) * px)
		MenuKit.line_at(tt, 10.0 * u, 5.0 * u, 11.0 * t)
		tag.add_child(tt)
		tag.position = art.position + Vector2(12.0, 12.0) * u
		card.add_child(tag)
	for n in body:
		card.add_child(n)
	return card


## A fact on a card, in a pill: gold for the bounty a first landfall pays.
func _chip(text: String, gold: bool) -> UiBox:
	var u := MenuKit.U
	var t := MenuKit.T
	var tt := MenuKit.words(text, "inter", 600, 12.0 * t, HudStyle.GOLD_HI if gold else HudStyle.INK_2, 0.0, 1.0)
	var h := 12.0 * t + 10.0 * u + 2.0
	var b := UiBox.new(Vector2(tt.size.x + 20.0 * u + 2.0, h), h * 0.5, 2.0)
	MenuKit.flat(b)
	var fill := Color8(244, 199, 101, 26) if gold else Color(1.0, 1.0, 1.0, 0.06)
	b.p("c_top", fill).p("c_foot", fill).p("hi", 0.0).p("c_border", Color8(244, 199, 101, 115) if gold else HudStyle.STROKE)
	MenuKit.line_at(tt, 10.0 * u + 1.0, 5.0 * u + 1.0, 12.0 * t)
	b.add_child(tt)
	return b


## A sea's chart, painted once at the size its card shows it (and again if
## the card grows): its canvas, and the anchor's place on it (shares).
func _chart(sea: Dictionary, w: float) -> Array:
	var id := str(sea.id)
	var scale := Icons.density()
	var want := Vector2i(maxi(64, ceili(w * scale)), maxi(36, ceili(w * scale * ART.y / ART.x)))
	if _charts.has(id) and (_charts[id][0] as SubViewport).size == want:
		return _charts[id]
	if _charts.has(id):
		(_charts[id][0] as SubViewport).queue_free()
	# framed on its isles and its berth, with some sea round them
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for isl: Dictionary in sea.isles:
		var c := Vector2(float(isl.x), float(isl.z))
		var r := float(isl.r)
		lo = lo.min(c - Vector2(r, r))
		hi = hi.max(c + Vector2(r, r))
	var berth: Vector2 = sea.berth
	lo = lo.min(berth)
	hi = hi.max(berth)
	var span := hi - lo + Vector2(180.0, 180.0)
	var mpp := maxf(span.x / ART.x, span.y / ART.y)
	var corner := (lo + hi) * 0.5 - ART * mpp * 0.5
	var region: Region = sea.region
	var land: Array = LAND.get(id, LAND.home)
	var m := ShaderMaterial.new()
	m.shader = preload("res://shaders/sea_chart.gdshader")
	m.set_shader_parameter("height_tex", region.height_tex)
	m.set_shader_parameter("height_rect", region.height_rect())
	m.set_shader_parameter("frame", Vector3(corner.x, corner.y, mpp))
	m.set_shader_parameter("art", ART)
	for k in 5:
		var c: Color = land[k]
		m.set_shader_parameter(["sand", "low", "mid", "rock", "peak"][k], Vector3(c.r, c.g, c.b))
	if id != "home":
		# the mist isles sit in their fog: the web's 26 banks, from its seed
		var fog := PackedVector3Array()
		var seed := 4111
		for n in 26:
			var v := PackedFloat32Array()
			for j in 3:
				seed = (seed * 1103515245 + 12345) & 0xFFFFFFFF
				v.append(seed / 4294967296.0)
			fog.append(Vector3(v[0] * ART.x, v[1] * ART.y, 30.0 + v[2] * 70.0))
		m.set_shader_parameter("fog", fog)
		m.set_shader_parameter("fogs", fog.size())
	var vp := SubViewport.new()
	vp.name = "Chart_" + id
	vp.size = want
	vp.disable_3d = true
	vp.transparent_bg = false
	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	var paint := ColorRect.new()
	paint.size = Vector2(want)
	paint.material = m
	vp.add_child(paint)
	add_child(vp)
	var pin := (berth - corner) / mpp / ART
	_charts[id] = [vp, pin]
	return _charts[id]


## Weighs anchor in the archipelago `id`, as a tap on its card does.
func pick(id: String) -> void:
	_pick(_index(id))


## A card tapped: it glows, the other bows out, and a beat later the voyage sets out.
func _pick(i: int) -> void:
	if _picked >= 0 or i < 0 or i >= _seas.size():
		return
	_picked = i
	_picked_t = 0.0
	clicked.emit()
	for b in _all_buttons():
		b.cancel()
	var card := _cards[i]
	card.p("c_border", HudStyle.GOLD_HI).p("ring", 2.0 * MenuKit.PX).p("c_ring", HudStyle.GOLD)
	card.p("glow", 70.0 * MenuKit.PX).p("c_glow", Color8(244, 199, 101, 102))


func _process(dt: float) -> void:
	_t += dt
	_step(dt)
	if _picked >= 0:
		_picked_t += dt
		if _picked_t >= BEAT:
			var id := str(_seas[_picked].id)
			close()
			chosen.emit(id)


func _step(dt: float) -> void:
	_shade.set_shader_parameter("fade", clampf(_t / 0.3, 0.0, 1.0))
	if _picked < 0:
		_reveal.step(_t)
		for i in _holders.size():
			# a keyboard's pick stands a little proud
			var lift := -6.0 * MenuKit.PX if i == _focus and _reveal.done(_t) else 0.0
			_cards[i].position.y += (lift - _cards[i].position.y) * MathX.damp(14.0, dt)
	else:
		# the chosen card swells and glows; the rest bow out
		var k := clampf(_picked_t / 0.25, 0.0, 1.0)
		var s := HudStyle.spring(clampf(_picked_t / 0.35, 0.0, 1.0))
		for i in _holders.size():
			var h := _holders[i]
			if i == _picked:
				h.scale = Vector2.ONE * lerpf(1.0, 1.03, s)
				h.modulate.a = 1.0
			else:
				h.scale = Vector2.ONE * lerpf(1.0, 0.96, s)
				h.modulate.a = minf(h.modulate.a, 1.0 - k)
		var f := 1.0 - clampf(_picked_t / 0.2, 0.0, 1.0)
		_head.modulate.a = minf(_head.modulate.a, f)
		_back.modulate.a = minf(_back.modulate.a, f)
	# the anchors' pings, every 2.2 s, easing out as they spread
	var p := fmod(_t, 2.2) / 2.2
	var e := 1.0 - (1.0 - p) * (1.0 - p)
	for ping in _pings:
		ping.scale = Vector2.ONE * lerpf(1.0, 2.6, e)
		ping.modulate.a = lerpf(0.9, 0.0, e)


## A tap on the sea round the cards: back to the harbour.
func _on_backdrop(event: InputEvent) -> void:
	var touch := event is InputEventScreenTouch
	var click: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION
	if not (touch or click):
		return
	var at: Vector2 = event.position
	if event.pressed:
		_press = at if not _over_buttons(at) else Vector2(-1.0, -1.0)
	elif _press.x >= 0.0:
		if at.distance_to(_press) < UiButton.SLOP and not _over_buttons(at):
			go_back()
		_press = Vector2(-1.0, -1.0)


func _over_buttons(at: Vector2) -> bool:
	for b in _all_buttons():
		if b.get_global_rect().has_point(at):
			return true
	return false


func _unhandled_input(event: InputEvent) -> void:
	if not visible or _picked >= 0 or not (event is InputEventKey) or not event.pressed or event.echo:
		return
	var n := _seas.size()
	var i := _focus if _focus >= 0 else maxi(0, _index(_def))
	match event.keycode:
		KEY_1, KEY_2, KEY_3:
			var k: int = event.keycode - KEY_1
			if k < n:
				_pick(k)
		KEY_LEFT, KEY_UP, KEY_A, KEY_W:
			_focus = (i + n - 1) % n if _focus >= 0 else i
		KEY_RIGHT, KEY_DOWN, KEY_D, KEY_S:
			_focus = (i + 1) % n if _focus >= 0 else i
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			_pick(i)
		_:
			return
	get_viewport().set_input_as_handled()


func _index(id: String) -> int:
	for i in _seas.size():
		if str(_seas[i].id) == id:
			return i
	return -1
