class_name Shipwright
extends CanvasLayer
## The Shipwright (the web's customizer), laid out as the web lays it out on
## a phone held sideways: up top on the left the way back and "Shipwright"
## over where she lies, and down the right a panel of glass: the tabs (Flag,
## Sails, Hull, Refit, Presets), the open tab's choices scrolling under a
## finger, and at its foot "Surprise me" and Done. Every pick is hers at once:
## the game dresses her in it (changed) and keeps it. The Flag tab flies her
## flag on a stage and takes a brush to it (FlagStage); "any colour" opens a
## picker over the choices (ColourPop). The Refit tab fits her parts (Parts):
## her figures as bars, and for each slot a track from the standard fit to
## the mythic part, a card under it about the one tapped. A drag on the world
## beside the panel swings the camera round her, a pinch or the wheel brings
## it in or backs it off.

## Her look changed (a copy): the game dresses her in it and keeps it.
signal changed(look: Dictionary)
## What the camera should show her by: "flag", "sails", "hull", "guns",
## "bow" or "overview".
signal focus(what: String)
## A drag across the world (a share of the screen's width), and a pinch or the
## wheel (a factor on how far the camera stands off).
signal swing(dx: float)
signal zoom(f: float)
## The brush came out (its layer, for her flag to show) or was put away (null).
signal brush(layer: Texture2D)
## Her saved designs changed (a copy).
signal designs_changed(list: Array)
## A part fitted on her in a slot (Parts.SLOTS), or the standard fit (""):
## the game fits it, and builds it into her.
signal fit(slot: String, id: String)
## The Refit tab was looked at: the parts found since are new no longer.
signal seen
signal done
signal clicked

const TABS := [["flag", "Flag", "sw_flag"], ["sails", "Sails", "sw_sails"], ["hull", "Hull", "sw_hull"], ["refit", "Refit", "sw_refit"], ["presets", "Presets", "sw_star"]]
const FOCUS := {"flag": "flag", "sails": "sails", "hull": "hull", "refit": "overview", "presets": "overview"}
## The shot each of the Refit tab's slots brings the camera round to.
const SLOT_FOCUS := {"hull": "hull", "sails": "sails", "guns": "guns", "figure": "bow"}
## The standard fit's colour where a part has its rarity's (the web's
## rgba(234, 242, 245, .55) on its step, .5 on its card).
const STANDARD := Color(0.918, 0.949, 0.961, 0.55)
const DARK_INK := Color("#0a1c26")
const WHITE_PILL := Color("#f4f8f9")
const LINE := HudStyle.STROKE
const GOLD_SOFT := Color8(239, 196, 99)
const RED := Color("#e5604f")

var look := ShipLook.fresh()
var designs: Array = []
var tab := "flag"
## The hull's part whose colour the Hull tab is choosing.
var part := "topsides"
## Where she lies, over the title.
var place := "Home Harbour"
## Draws the tiles' and cards' pictures (the Outfitter's: her flag's drawings are shared).
var baker: LookBaker
## The parts locker (a copy of the game's: {owned, fit, unseen}, see Parts),
## the class of ship being refitted, and where a part not yet found is for
## sale today ((id) -> a trading port's name, or "").
var locker := Parts.fresh()
var cls_id := "sloop"
var where_sold := Callable()

var _px := MenuKit.PX
var _vp := Vector2(1280.0, 720.0)
var _root: Control
var _world: Control
var _panel_at := Rect2()
var _holder: Control
var _panel: UiBox
var _tabs: Array = []
var _body: Control
var _content: Control
var _park: Control
var _dice: UiButton
var _die: TextureRect
var _die_t := 1.0
## The buttons of its frame (the way back, the tabs, the foot), and the open tab's.
var _buttons: Array[UiButton] = []
var _cbuttons: Array[UiButton] = []
var _stage: FlagStage
var _pop: ColourPop
var _flag_tex: Texture2D
var _reveal := MenuKit.Reveal.new()
var _t := 0.0
## The body's scroll (units down), how far it goes, and its fling (units/s).
var _scroll := 0.0
var _scroll_max := 0.0
var _fling := 0.0
## A finger on the body: where, and whether it scrolls ("scroll"), works the
## slider ("slide") or hasn't decided ("").
var _down := false
var _from := Vector2.ZERO
var _last := Vector2.ZERO
var _last_ms := 0
var _mode := ""
var _grab: _Slider
## Fingers on the world, and the pinch's last spread.
var _pts := {}
var _pinch := 0.0
## The open tab as laid out: its cursor and width, its grids (to redraw
## their pictures when a colour changes), swatch rows, hull parts, the
## slider and the save card.
var _y := 0.0
var _iw := 0.0
var _x0 := 0.0
var _grids: Array = []
var _rows: Array = []
var _part_btns: Array = []
var _slider: _Slider
var _name: LineEdit
var _save: _SaveCard
## The Refit tab as laid out: where pieces are being added, its blocks (each
## moved down as one when a card above it grows), the stat bars, each slot's
## track ({nodes, card, block}) and the step last tapped on each ("" the
## standard fit).
var _into: Control
var _blocks: Array[Control] = []
var _bars: _RBars
var _tracks := {}
var _picked := {}
## What the camera was last asked to show.
var _focus := ""
## A change to hand over at the frame's end (a drag sends one a frame).
var _due := false
## When the pictures are next redrawn (after a colour dragged on the picker).
var _thumbs_at := -1.0
## The brush's layer being kept as a PNG: the job, what it made, and the
## look it was painted on (a whole new look since drops it).
var _paint_task := -1
var _paint_out := [""]
var _paint_gen := 0
var _gen := 0
var _save_after_paint := false


func _ready() -> void:
	layer = 7
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	_park = Control.new()
	_park.visible = false
	_park.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_park)
	_stage = FlagStage.new()
	_stage.toggled.connect(_toggle_paint)
	_stage.clicked.connect(func() -> void: clicked.emit())
	_park.add_child(_stage)
	visible = false
	set_process(false)
	get_viewport().size_changed.connect(func() -> void:
		if visible:
			_build())


## Up, on the Flag tab, with her look, her saved designs and, for the
## Refit tab, her class and the parts locker.
func open(p_look: Dictionary, p_designs: Array, p_cls := "", p_locker: Dictionary = {}) -> void:
	look = p_look.duplicate(true)
	designs = p_designs.duplicate(true)
	if p_cls != "":
		cls_id = p_cls
	if not p_locker.is_empty():
		locker = p_locker.duplicate(true)
	_picked.clear()
	tab = "flag"
	part = "topsides"
	visible = true
	_t = 0.0
	_scroll = 0.0
	_fling = 0.0
	_focus = ""
	_build()
	set_process(true)
	_look_at(FOCUS[tab])


## Down (the brush put away, the last change handed over).
func close() -> void:
	if not visible:
		return
	_commit_paint()
	_flush()
	for b in _buttons + _cbuttons:
		b.cancel()
	_release()
	_pts.clear()
	if _pop != null:
		_pop.close()
	if _name != null:
		_name.release_focus()
	visible = false
	set_process(_paint_task >= 0)


func is_open() -> bool:
	return visible


## The back button: the picker closes, the keyboard goes, or the Shipwright is done.
func go_back() -> bool:
	if not visible:
		return false
	if _pop != null and _pop.is_open():
		_pop.close()
		return true
	if _name != null and _name.has_focus():
		_name.release_focus()
		return true
	_done()
	return true


## Her flag as last drawn, on the stage (`painted`: the brush's latest work in it).
func set_flag(tex: Texture2D, painted := false) -> void:
	_flag_tex = tex
	_stage.set_flag(tex, painted)


## The parts locker changed (a copy is kept): the Refit tab's dot follows
## what's new. The tab itself stays as laid out (its own taps are in it).
func set_parts(p_locker: Dictionary) -> void:
	locker = p_locker.duplicate(true)


## The panel's box on the screen, so the camera frames her beside it.
func panel_rect() -> Rect2:
	return _panel_at if visible else Rect2()


func _done() -> void:
	clicked.emit()
	_commit_paint()
	_flush()
	done.emit()


# ------------------------------------------------------------------ layout


func _build() -> void:
	_park_stage()
	for c in _root.get_children():
		_root.remove_child(c)
		c.queue_free()
	_buttons.clear()
	_cbuttons.clear()
	_tabs.clear()
	_reveal.clear()
	_pop = null
	_vp = get_viewport().get_visible_rect().size
	_root.size = _vp
	var px := _px
	var mx := _vp.x * 0.03
	var my := _vp.y * 0.03
	# the world beside the panel: a drag swings the camera round her
	_world = Control.new()
	_world.size = _vp
	_world.mouse_filter = Control.MOUSE_FILTER_STOP
	_world.gui_input.connect(_on_world)
	_root.add_child(_world)
	# a soft shade behind the title, so it reads over a bright sky
	var shade := UiBox.new(Vector2(minf(560.0 * px, _vp.x * 0.7), 200.0 * px), 0.0, 0.0)
	shade.p("radial", Vector4(0.0, 0.0, 1.0, 1.0)).p("radial_stop", 0.7).p("c_top", Color8(2, 14, 22, 140)).p("c_foot", Color8(2, 14, 22, 0))
	shade.p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0))
	_root.add_child(shade)
	var head := _build_head()
	head.position = Vector2(mx, my)
	_root.add_child(head)
	# the panel, down the right
	var w := minf(400.0 * px, _vp.x * 0.46)
	var h := _vp.y - my * 2.0
	_panel_at = Rect2(_vp.x - mx - w, my, w, h)
	_holder = Control.new()
	_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_holder.position = _panel_at.position
	_holder.size = _panel_at.size
	_root.add_child(_holder)
	_panel = UiBox.new(_panel_at.size, 22.0 * px, 110.0 * px)
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.p("c_top", Color8(14, 38, 52, 189)).p("c_foot", Color8(6, 20, 30, 219)).p("c_border", LINE).p("hi", 0.09)
	_panel.p("c_shadow", Color8(0, 6, 12, 107)).p("shadow", Vector2(30.0, 80.0) * px)
	_holder.add_child(_panel)
	var bar := _build_tabs(w)
	_panel.add_child(bar)
	var foot_h := 7.0 * px * 2.0 + 40.0 * px
	var top := bar.position.y + bar.size.y
	_body = Control.new()
	_body.clip_contents = true
	_body.mouse_filter = Control.MOUSE_FILTER_STOP
	_body.position = Vector2(0.0, top)
	_body.size = Vector2(w, h - top - foot_h)
	_body.gui_input.connect(_on_body)
	_panel.add_child(_body)
	_content = Control.new()
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.add_child(_content)
	var foot := _build_foot(w, foot_h)
	foot.position = Vector2(0.0, h - foot_h)
	_panel.add_child(foot)
	_pop = ColourPop.new()
	_pop.position = _body.position
	_pop.size = _body.size
	_pop.clicked.connect(func() -> void: clicked.emit())
	_panel.add_child(_pop)
	_render(true)
	_reveal.add(head, MenuKit.FADE, 0.0, 0.6)
	_reveal.add(shade, MenuKit.FADE, 0.0, 0.6)
	_reveal.add(_holder, MenuKit.SLIDE, 0.0, 0.55, -40.0 * px)
	_step(0.0)


## The way back, and "Shipwright" under where she lies.
func _build_head() -> Control:
	var px := _px
	var head := Control.new()
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var d := 40.0 * px
	var back := MenuKit.round("sw_back", d, 22.0 * px)
	back.p("c_shadow", Color(0.0, 0.0, 0.0, 0.2)).p("shadow", Vector2(8.0, 24.0) * px)
	back.pressed.connect(_done)
	head.add_child(back)
	_buttons.append(back)
	var kick := MenuKit.words(place.to_upper(), "inter", 700, 11.0 * px, HudStyle.AQUA, 0.22, 1.21)
	var title := MenuKit.words("Shipwright", "inter", 800, 24.0 * px, HudStyle.INK, -0.025, 1.0)
	var th := kick.size.y + 2.0 * px + 24.0 * px
	var x := d + 10.0 * px
	var y := (d - th) * 0.5
	kick.position = Vector2(x, y)
	MenuKit.line_at(title, x, y + kick.size.y + 2.0 * px, 24.0 * px)
	head.add_child(kick)
	head.add_child(title)
	head.size = Vector2(x + maxf(kick.size.x, title.size.x), d)
	return head


## The tabs: a dark tray across the panel's top, the open one a white pill.
func _build_tabs(w: float) -> UiBox:
	var px := _px
	var th := 31.0 * px
	var pad := 3.0 * px
	var gap := 4.0 * px
	var bw := w - 12.0 * px
	var tray := UiBox.new(Vector2(bw, th + pad * 2.0), 16.0 * px, 4.0)
	MenuKit.flat(tray)
	tray.p("c_top", Color(0.0, 0.0, 0.0, 0.24)).p("c_foot", Color(0.0, 0.0, 0.0, 0.24)).p("c_border", Color(1.0, 1.0, 1.0, 0.06)).p("hi", 0.0)
	tray.position = Vector2(6.0, 6.0) * px
	var tw := (bw - pad * 2.0 - gap * (TABS.size() - 1)) / TABS.size()
	# the names go when they don't all fit beside their icons (as on the web on a phone)
	var labels: Array[UiText] = []
	var named := true
	for t: Array in TABS:
		var l := MenuKit.words(str(t[1]).to_upper(), "inter", 700, 10.5 * px, Color.WHITE, 0.12)
		labels.append(l)
		named = named and 17.0 * px + 6.0 * px + l.size.x + 12.0 * px <= tw
	for i in TABS.size():
		var id := str(TABS[i][0])
		var b := UiButton.new(Vector2(tw, th), 13.0 * px, 24.0 * px)
		b.squeeze = 0.96
		b.p("border", 0.0).p("hi", 0.0)
		var ic := Icons.rect(str(TABS[i][2]), 17.0 * px)
		var label := labels[i]
		label.visible = named
		var cw := ic.size.x + (6.0 * px + label.size.x if named else 0.0)
		ic.position = Vector2((tw - cw) * 0.5, (th - ic.size.y) * 0.5)
		label.position = Vector2(ic.position.x + ic.size.x + 6.0 * px, (th - label.size.y) * 0.5)
		b.add_child(ic)
		b.add_child(label)
		# something new behind it: a gold dot over its corner (the web's .sw-new)
		var dot := UiBox.new(Vector2(8.0, 8.0) * px, 4.0 * px, 14.0 * px)
		dot.p("c_top", HudStyle.GOLD).p("c_foot", HudStyle.GOLD).p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0))
		dot.p("c_ring", Color8(6, 20, 30, 230)).p("ring", 2.0 * px).p("c_glow", Color8(244, 199, 101, 204)).p("glow", 10.0 * px)
		dot.position = Vector2(tw * 0.5 + 10.0 * px, 5.0 * px)
		dot.pivot_offset = dot.size * 0.5
		b.add_child(dot)
		b.position = Vector2(pad + i * (tw + gap), pad)
		b.pressed.connect(func() -> void:
			if tab != id:
				clicked.emit()
				_set_tab(id))
		tray.add_child(b)
		_buttons.append(b)
		var k := 1.0 if id == tab else 0.0
		_tabs.append([id, b, ic, label, k, dot, 1.0 if _has_new(id) else 0.0])
	_tick_tabs(1.0)
	return tray


## The foot: "Surprise me" and Done.
func _build_foot(w: float, h: float) -> Control:
	var px := _px
	var foot := Control.new()
	foot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	foot.size = Vector2(w, h)
	var rule := MenuKit.rule(w, Color(1.0, 1.0, 1.0, 0.07))
	foot.add_child(rule)
	var gap := 7.0 * px
	var inner := w - 16.0 * px - gap
	var bh := 40.0 * px
	var dw := inner * 1.25 / 2.25
	_dice = UiButton.new(Vector2(dw, bh), bh * 0.5, 24.0 * px)
	MenuKit.flat(MenuKit.glass(_dice, Color(1.0, 1.0, 1.0, 0.075)))
	var t := MenuKit.words("Surprise me", "inter", 700, 13.0 * px, HudStyle.INK, 0.02)
	var ip := 17.0 * px
	var ig := 9.0 * MenuKit.U
	var cw := ip + ig + t.size.x
	_die = Icons.rect("die", ip)
	_die.position = Vector2((dw - cw) * 0.5, (bh - ip) * 0.5)
	_die.pivot_offset = _die.size * 0.5
	t.position = Vector2(_die.position.x + ip + ig, (bh - t.size.y) * 0.5)
	_dice.add_child(_die)
	_dice.add_child(t)
	_dice.position = Vector2(8.0 * px, 7.0 * px)
	_dice.pressed.connect(_surprise)
	foot.add_child(_dice)
	_buttons.append(_dice)
	var ow := inner - dw
	var ok := UiButton.new(Vector2(ow, bh), bh * 0.5, 40.0 * px)
	HudStyle.gold(ok, MenuKit.U)
	var ot := MenuKit.words("Done", "inter", 700, 13.0 * px, HudStyle.GOLD_INK, 0.02)
	ot.position = (Vector2(ow, bh) - ot.size) * 0.5
	ok.add_child(ot)
	ok.position = Vector2(_dice.position.x + dw + gap, 7.0 * px)
	ok.pressed.connect(_done)
	foot.add_child(ok)
	_buttons.append(ok)
	return foot


## The open tab's choices, laid out afresh (the scroll kept, unless `top`).
func _render(top := false) -> void:
	if _pop != null:
		_pop.close()
	_park_stage()
	for c in _content.get_children():
		_content.remove_child(c)
		c.queue_free()
	_cbuttons.clear()
	_grids.clear()
	_rows.clear()
	_part_btns.clear()
	_slider = null
	_name = null
	_save = null
	_into = _content
	_blocks.clear()
	_bars = null
	_tracks.clear()
	var px := _px
	var w := _panel_at.size.x
	_x0 = 12.0 * px
	_iw = w - 24.0 * px
	_y = 0.0
	match tab:
		"flag":
			_render_flag()
		"sails":
			_render_sails()
		"hull":
			_render_hull()
		"refit":
			_render_refit()
		_:
			_render_presets()
	_y += 12.0 * px
	_content.size = Vector2(w, _y)
	_scroll_max = maxf(0.0, _y - _body.size.y)
	_scroll = 0.0 if top else clampf(_scroll, 0.0, _scroll_max)
	_fling = 0.0
	_content.position.y = -_scroll


func _park_stage() -> void:
	if _stage.get_parent() != _park:
		_stage.get_parent().remove_child(_stage)
		_park.add_child(_stage)


func _set_tab(id: String) -> void:
	_commit_paint()
	if _pop != null:
		_pop.close()
	tab = id
	_render(true)
	_look_at(FOCUS[tab])


# ------------------------------------------------------------------ tabs


func _render_flag() -> void:
	var px := _px
	var f: Dictionary = look.flag
	_stage.build(_iw + 12.0 * px, f)
	_stage.set_flag(_flag_tex)
	_park.remove_child(_stage)
	_stage.position = Vector2(_x0 - 6.0 * px, 8.0 * px)
	_content.add_child(_stage)
	_y = _stage.position.y + _stage.size.y
	_section("Shape")
	_grid(Heraldry.SHAPES, str(f.shape), 4, Vector2(64.0, 40.0), func(id: String, sz: Vector2i) -> String:
		var d: Dictionary = look.flag.duplicate()
		d.shape = id
		d.paint = ""
		return Heraldry.flag_svg(d, 64.0, 40.0, sz, false, 4.0),
		func(id: String) -> void: look.flag.shape = id)
	_section("Field")
	_swatches(ShipLook.PALETTES.flag, str(f.bg), func(v: String) -> void: look.flag.bg = v)
	_section("Pattern")
	_grid(Heraldry.PATTERNS, str(f.pattern), 5, Vector2(56.0, 35.0), func(id: String, sz: Vector2i) -> String:
		var d: Dictionary = look.flag.duplicate()
		d.merge({"pattern": id, "emblem": "none", "backing": "none", "paint": "", "shape": "square"}, true)
		return Heraldry.flag_svg(d, 56.0, 35.0, sz, false, 4.0),
		func(id: String) -> void: look.flag.pattern = id)
	_section("Pattern colour")
	_swatches(ShipLook.PALETTES.flag, str(f.pattern_color), func(v: String) -> void: look.flag.pattern_color = v)
	_section("Emblem")
	_grid(Heraldry.EMBLEMS, str(f.emblem), 4, Vector2(56.0, 56.0), func(id: String, sz: Vector2i) -> String:
		return Heraldry.tile_svg(id, "none", str(look.flag.emblem_color), str(look.flag.bg), sz.x),
		func(id: String) -> void: look.flag.emblem = id)
	_section("Behind it")
	_grid(Heraldry.BACKINGS, str(f.backing), 3, Vector2(56.0, 56.0), func(id: String, sz: Vector2i) -> String:
		return Heraldry.tile_svg(str(look.flag.emblem), id, str(look.flag.emblem_color), str(look.flag.bg), sz.x),
		func(id: String) -> void: look.flag.backing = id)
	_section("Emblem colour")
	_swatches(ShipLook.PALETTES.flag, str(f.emblem_color), func(v: String) -> void: look.flag.emblem_color = v)
	_section("Emblem size")
	_slider = _Slider.new(_iw, float(f.emblem_scale), 0.6, 1.4, 0.02)
	_slider.position = Vector2(_x0, _y)
	_slider.moved.connect(func(v: float) -> void:
		look.flag.emblem_scale = v
		_change())
	_content.add_child(_slider)
	_y += _slider.size.y


func _render_sails() -> void:
	var px := _px
	var s: Dictionary = look.sail
	_section("Sailcloth")
	_swatches(ShipLook.PALETTES.sail, str(s.cloth), func(v: String) -> void: look.sail.cloth = v)
	_section("Pattern")
	_grid(ShipLook.SAIL_PATTERNS, str(s.pattern), 3, Vector2(54.0, 58.0), func(id: String, sz: Vector2i) -> String:
		return Shipwright.sail_svg(id, str(look.sail.cloth), str(look.sail.accent), sz),
		func(id: String) -> void: look.sail.pattern = id)
	_section("Accent colour")
	_swatches(ShipLook.PALETTES.sail, str(s.accent), func(v: String) -> void: look.sail.accent = v)
	_section("Emblem on the mainsail")
	var seg := _Seg.new([[true, "Show it"], [false, "Plain"]], bool(s.mark))
	seg.position = Vector2(_x0, _y)
	seg.chosen.connect(func(v: Variant) -> void:
		clicked.emit()
		look.sail.mark = bool(v)
		_change())
	_content.add_child(seg)
	_cbuttons.append_array(seg.buttons)
	_y += seg.size.y
	if str(look.flag.emblem) == "none":
		var note := UiText.new([["Your flag has no emblem yet. Pick one on the Flag tab.", HudStyle.font("inter", 500), roundi(12.0 * px), HudStyle.INK_2]], _iw, 1.3)
		note.position = Vector2(_x0, _y + 8.0 * px)
		_content.add_child(note)
		_y = note.position.y + note.size.y
	_section("Emblem colour")
	_swatches(ShipLook.PALETTES.sail, str(s.mark_color), func(v: String) -> void: look.sail.mark_color = v)


func _render_hull() -> void:
	var px := _px
	_section("Paintwork")
	var cols := 3
	var gap := 7.0 * px
	var pw := (_iw - gap * (cols - 1)) / cols
	var ph := 36.0 * px
	for i in ShipLook.HULL_PARTS.size():
		var hp: Array = ShipLook.HULL_PARTS[i]
		var id := str(hp[0])
		var b := _Part.new(Vector2(pw, ph), str(hp[1]), Color(str(look.hull[id])))
		b.position = Vector2(_x0 + (i % cols) * (pw + gap), _y + (i / cols) * (ph + gap))
		b.set_on(id == part)
		b.pressed.connect(func() -> void:
			if part == id:
				return
			clicked.emit()
			part = id
			_render()
			_look_at("hull"))
		_content.add_child(b)
		_cbuttons.append(b)
		_part_btns.append([id, b])
	var rows := ceili(ShipLook.HULL_PARTS.size() / float(cols))
	_y += rows * ph + (rows - 1) * gap
	_section("Colour")
	var pal := ""
	for hp: Array in ShipLook.HULL_PARTS:
		if hp[0] == part:
			pal = str(hp[2])
	var key := part
	_swatches(ShipLook.PALETTES[pal], str(look.hull[key]), func(v: String) -> void: look.hull[key] = v)


func _render_presets() -> void:
	var px := _px
	_section("Ship's name")
	var row_h := 45.0 * px
	var chip_w := 48.0 * px
	_name = LineEdit.new()
	_name.max_length = ShipLook.NAME_MAX
	_name.placeholder_text = "Name your ship"
	_name.text = str(look.name)
	_name.size = Vector2(_iw - 8.0 * px - chip_w, row_h)
	_name.position = Vector2(_x0, _y)
	_name.add_theme_font_override("font", HudStyle.font("cinzel", 700, roundi(0.06 * 17.0 * px)))
	_name.add_theme_font_size_override("font_size", roundi(17.0 * px))
	_name.add_theme_color_override("font_color", HudStyle.INK)
	_name.add_theme_color_override("font_placeholder_color", HudStyle.INK_3)
	_name.add_theme_color_override("caret_color", HudStyle.INK)
	_name.add_theme_color_override("selection_color", Color(1.0, 1.0, 1.0, 0.2))
	var normal := _field_box(false)
	_name.add_theme_stylebox_override("normal", normal)
	_name.add_theme_stylebox_override("focus", _field_box(true))
	_name.add_theme_stylebox_override("read_only", normal)
	_name.text_changed.connect(func(text: String) -> void:
		look.name = ShipLook.clean_name(text)
		_change()
		_sync_save())
	_name.text_submitted.connect(func(_text: String) -> void: _name.release_focus())
	_content.add_child(_name)
	var dice := UiButton.new(Vector2(chip_w, row_h), row_h * 0.5, 4.0)
	MenuKit.flat(dice)
	dice.p("c_top", Color8(6, 24, 34, 184)).p("c_foot", Color8(6, 24, 34, 184)).p("c_border", LINE).p("hi", 0.0)
	var die := Icons.rect("die", 20.0 * px)
	die.position = (dice.size - die.size) * 0.5
	dice.add_child(die)
	dice.position = Vector2(_x0 + _iw - chip_w, _y)
	dice.pressed.connect(func() -> void:
		clicked.emit()
		look.name = ShipLook.random_name()
		_name.text = str(look.name)
		_change()
		_sync_save())
	_content.add_child(dice)
	_cbuttons.append(dice)
	_y += row_h
	# your designs: a card to save this one first, then the saved, newest first
	_section("Your designs")
	var gap := 8.0 * px
	var cw := (_iw - gap) * 0.5
	var cards: Array[UiButton] = []
	_save = _SaveCard.new(Vector2(cw, 112.0 * px))
	_save.pressed.connect(_save_design)
	cards.append(_save)
	for d: Dictionary in designs:
		var dl: Dictionary = d.look
		var card := _Card.new(cw, str(d.name), dl, ShipLook.same_design(dl, look), true)
		_thumb(card.pic, Heraldry.flag_svg(dl.flag, 84.0, 52.0, _pixels(card.pic.size), true, 4.0))
		var id := str(d.id)
		card.pressed.connect(func() -> void:
			clicked.emit()
			_commit_paint()
			_take(dl.duplicate(true), false))
		card.deleted.connect(func() -> void:
			clicked.emit()
			delete_design(id))
		card.armed.connect(func() -> void: clicked.emit())
		cards.append(card)
	_lay_cards(cards, cw, gap)
	_sync_save()
	_section("Famous colours")
	cards = []
	for i in ShipLook.PRESETS.size():
		var pl := ShipLook.preset(i)
		var card := _Card.new(cw, str(ShipLook.PRESETS[i][0]), pl, ShipLook.same_style(pl, look), false)
		_thumb(card.pic, Heraldry.flag_svg(pl.flag, 84.0, 52.0, _pixels(card.pic.size), true, 4.0))
		card.pressed.connect(func() -> void:
			clicked.emit()
			_commit_paint()
			# a famous ship's colours, under her own name
			var l := pl.duplicate(true)
			l.name = look.name
			_take(l, false))
		cards.append(card)
	_lay_cards(cards, cw, gap)


## Her refit (the web's renderRefit): her figures as bars, the class's own
## and what her parts add, then for each slot a track from the standard fit
## through its five parts, common to mythic, and under it a card about the
## step last tapped (or the part she carries). Looking is what makes the
## parts found since new no longer (seen).
func _render_refit() -> void:
	var cls := ShipClass.named(cls_id)
	var owned: Dictionary = locker.get("owned", {})
	var unseen: Array = locker.get("unseen", [])
	_block(func() -> void:
		_section("The %s's refit" % cls.name, "%d/%d parts found" % [owned.size(), Parts.all().size()])
		_bars = _RBars.new(_iw, cls.stats, Parts.refit_bars(cls, _fit()))
		_bars.position = Vector2(_x0, _y)
		_into.add_child(_bars)
		_y += _bars.size.y)
	for slot: String in Parts.SLOTS:
		_block(func() -> void: _render_slot(slot, owned, unseen))
	if not unseen.is_empty():
		seen.emit()


## A slot's track: the standard fit and its five parts in six steps along
## a line running through the rarities' colours, and the card under them.
func _render_slot(slot: String, owned: Dictionary, unseen: Array) -> void:
	var px := _px
	var parts := Parts.of_slot(slot)
	var own := 0
	for pt: Dictionary in parts:
		if owned.has(pt.id):
			own += 1
	_section(str(Parts.SLOT_NAMES[slot]), "%d/%d" % [own, parts.size()])
	var gap := 6.0 * px
	var cw := (_iw - gap * 5.0) / 6.0
	# a narrow panel takes the web's small-screen steps
	var compact := cw < 54.0 * px
	var art := minf((44.0 if compact else 54.0) * px, cw)
	var top := _y + 2.0 * px
	var line := _TrackLine.new(Vector2(_iw * 0.88, 2.0 * px))
	line.position = Vector2(_x0 + _iw * 0.06, top + art * 0.5 - 1.0 * px)
	_into.add_child(line)
	var on := str(_fit().get(slot, ""))
	var nodes: Array[_Node] = []
	var row_h := 0.0
	for i in 6:
		var pt: Dictionary = {} if i == 0 else parts[i - 1]
		var n := _Node.new(cw, art, compact, pt, slot, pt.is_empty() or owned.has(pt.id), not pt.is_empty() and unseen.has(pt.id))
		n.position = Vector2(_x0 + i * (cw + gap), top)
		n.set_on(n.id == on)
		n.pressed.connect(_tap_node.bind(slot, n))
		_into.add_child(n)
		_cbuttons.append(n)
		nodes.append(n)
		row_h = maxf(row_h, n.size.y)
	var card := _PartInfo.new(_iw)
	card.position = Vector2(_x0, top + row_h + 4.0 * px + 8.0 * px)
	_into.add_child(card)
	_tracks[slot] = {"nodes": nodes, "card": card, "block": _into}
	_fill_card(slot, str(_picked.get(slot, on)))
	_y = card.position.y + card.size.y


## Her fit (this class's loadout in the locker).
func _fit() -> Dictionary:
	return (locker.get("fit", {}) as Dictionary).get(cls_id, {})


## A slot's card shows a part (or with "" the standard fit): whether she
## carries it, or where it may be had.
func _fill_card(slot: String, id: String) -> void:
	var card: _PartInfo = _tracks[slot].card
	var pt := Parts.part(id) if id != "" else {}
	if pt.is_empty():
		card.show_standard(slot)
		return
	var em := ""
	var gold := false
	if (locker.get("owned", {}) as Dictionary).has(id):
		if str(_fit().get(slot, "")) == id:
			em = "Fitted"
			gold = true
	else:
		var where := str(where_sold.call(id)) if where_sold.is_valid() else ""
		em = "For sale today at %s" % where if where != "" else "Not found yet · chests, wrecks and port shipwrights"
	card.show_part(pt, slot, em, gold)


## A step tapped: its card comes up, the camera comes round to that part of
## her, and if it's hers it's fitted (the bars follow, the step pulses, and
## the game builds it into her).
func _tap_node(slot: String, n: _Node) -> void:
	clicked.emit()
	_picked[slot] = n.id
	n.clear_new()
	_look_at(str(SLOT_FOCUS[slot]), true)
	if n.owned and n.id != str(_fit().get(slot, "")):
		var fits: Dictionary = locker.get("fit", {})
		var f: Dictionary = fits.get(cls_id, {})
		if n.id == "":
			f.erase(slot)
		else:
			f[slot] = n.id
		fits[cls_id] = f
		locker.fit = fits
		for o: _Node in _tracks[slot].nodes:
			o.set_on(o == n)
		fit.emit(slot, n.id)
		_bars.show_bars(Parts.refit_bars(ShipClass.named(cls_id), _fit()))
		if n.id != "":
			n.pulse()
	_fill_card(slot, n.id)
	if n.id != "":
		(_tracks[slot].card as _PartInfo).fade_in()
	var t: Dictionary = _tracks[slot]
	var card: _PartInfo = t.card
	(t.block as Control).size.y = card.position.y + card.size.y
	_restack()


## Lays out what `build` adds as a block of its own, moved as one when a
## card above it changes its height (_restack).
func _block(build: Callable) -> void:
	var b := Control.new()
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.position = Vector2(0.0, _y)
	_content.add_child(b)
	var y0 := _y
	_into = b
	_y = 0.0
	build.call()
	b.size = Vector2(_panel_at.size.x, _y)
	_into = _content
	_y = y0 + b.size.y
	_blocks.append(b)


## The blocks laid one under another again (a card changed its height).
func _restack() -> void:
	if _blocks.is_empty():
		return
	var y := _blocks[0].position.y
	for b in _blocks:
		b.position.y = y
		y += b.size.y
	_y = y + 12.0 * _px
	_content.size.y = _y
	_scroll_max = maxf(0.0, _y - _body.size.y)
	_scroll_to(_scroll)


## A CSS color-mix in srgb: `w` of `a` with the rest of `b`, their alphas
## weighing their colours in.
static func css_mix(a: Color, w: float, b: Color) -> Color:
	var al := a.a * w + b.a * (1.0 - w)
	if al <= 0.0:
		return Color(0.0, 0.0, 0.0, 0.0)
	var wa := a.a * w / al
	var wb := b.a * (1.0 - w) / al
	return Color(a.r * wa + b.r * wb, a.g * wa + b.g * wb, a.b * wa + b.b * wb, al)


## The name field's box, as the web's (white edged and ringed while typing).
func _field_box(focused: bool) -> StyleBoxFlat:
	var px := _px
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(1.0, 1.0, 1.0, 0.06)
	sb.border_color = Color.WHITE if focused else LINE
	sb.set_border_width_all(maxi(1, roundi(px)))
	sb.set_corner_radius_all(roundi(12.0 * px))
	sb.corner_detail = 8
	sb.content_margin_left = 14.0 * px
	sb.content_margin_right = 14.0 * px
	sb.content_margin_top = 8.0 * px
	sb.content_margin_bottom = 8.0 * px
	sb.anti_aliasing = true
	if focused:
		sb.shadow_color = Color(1.0, 1.0, 1.0, 0.12)
		sb.shadow_size = roundi(4.0 * px)
	return sb


func _lay_cards(cards: Array[UiButton], cw: float, gap: float) -> void:
	var y := _y
	var row_h := 0.0
	for i in cards.size():
		var c := cards[i]
		if i % 2 == 0 and i > 0:
			y += row_h + gap
			row_h = 0.0
		c.position = Vector2(_x0 + (i % 2) * (cw + gap), y)
		row_h = maxf(row_h, c.size.y)
		_content.add_child(c)
		_cbuttons.append(c)
	# a row's cards all as tall as its tallest
	for i in range(0, cards.size(), 2):
		var h := cards[i].size.y
		if i + 1 < cards.size():
			h = maxf(h, cards[i + 1].size.y)
			cards[i + 1].resize(Vector2(cw, h))
		cards[i].resize(Vector2(cw, h))
	_y = y + row_h


# ------------------------------------------------------------------ pieces


## A section's heading (the web's h3), a count on its right if given.
func _section(title: String, count := "") -> void:
	var px := _px
	var h := MenuKit.words(title.to_upper(), "inter", 700, 11.0 * px, HudStyle.AQUA, 0.22, 1.21)
	h.position = Vector2(_x0, _y + 10.0 * px)
	_into.add_child(h)
	if count != "":
		var c := MenuKit.words(count.to_upper(), "inter", 700, 11.0 * px, HudStyle.INK_3, 0.04, 1.21)
		c.position = Vector2(_x0 + _iw - c.size.x, h.position.y)
		_into.add_child(c)
		h.cut_to(_iw - c.size.x - 8.0 * px)
	_y = h.position.y + h.size.y + 8.0 * px


## A row of colours (the palette, the colour chosen if it's not among them,
## and any colour at all on the picker).
func _swatches(palette: Array, value: String, set_to: Callable) -> void:
	var px := _px
	var d := 30.0 * px
	var gap := 7.0 * px
	var all: Array = palette.duplicate()
	var v := value.to_lower()
	if not all.has(v):
		all.append(v)
	var x := 0.0
	var y := _y
	var list: Array = []
	var row := [list, null, set_to]
	for c: String in all:
		if x > 0.0 and x + d > _iw + 0.5:
			x = 0.0
			y += d + gap
		var col := Color(c)
		var sw := Swatch.new(col, d)
		sw.position = Vector2(_x0 + x, y)
		sw.set_on(c == v)
		sw.pressed.connect(func() -> void:
			clicked.emit()
			set_to.call(c)
			_mark_row(row, c, false)
			_change()
			_refresh_thumbs())
		_content.add_child(sw)
		_cbuttons.append(sw)
		list.append([c, sw])
		x += d + gap
	if x > 0.0 and x + d > _iw + 0.5:
		x = 0.0
		y += d + gap
	var any := CustomSwatch.new(d)
	any.position = Vector2(_x0 + x, y)
	any.pressed.connect(func() -> void:
		clicked.emit()
		_pop.open(Color(_value_of(row)), func(col: Color) -> void:
			var hx := "#" + col.to_html(false)
			set_to.call(hx)
			_mark_row(row, hx, true)
			_change()
			_thumbs_at = _t + 0.2))
	_content.add_child(any)
	_cbuttons.append(any)
	row[1] = any
	row.append(v)
	_rows.append(row)
	_y = y + d


## The colour a row has chosen.
func _value_of(row: Array) -> String:
	return str(row[3])


## A row's colour chosen: its swatch lit (or the picker's, with the colour in it).
func _mark_row(row: Array, value: String, custom: bool) -> void:
	row[3] = value
	for it: Array in row[0]:
		(it[1] as Swatch).set_on(not custom and str(it[0]) == value)
	(row[1] as CustomSwatch).pick(Color(value) if custom else null)


## A grid of tiles, each a picture (drawn by the baker, `size` CSS px at
## most) over its name; the one chosen lit.
func _grid(items: Array, value: String, cols: int, natural: Vector2, svg_for: Callable, set_to: Callable) -> void:
	var px := _px
	var gap := 7.0 * px
	var tw := (_iw - gap * (cols - 1)) / cols
	var pic := natural * px
	if pic.x > tw - 8.0 * px:
		pic *= (tw - 8.0 * px) / pic.x
	var th := 7.0 * px + pic.y + 4.0 * px + 10.0 * px * 1.21 + 5.0 * px
	var tiles: Array = []
	var grid := [tiles, svg_for]
	for i in items.size():
		var id := str(items[i][0])
		var t := _Tile.new(Vector2(tw, th), pic, str(items[i][1]))
		t.position = Vector2(_x0 + (i % cols) * (tw + gap), _y + (i / cols) * (th + gap))
		t.set_on(id == value)
		t.pressed.connect(func() -> void:
			clicked.emit()
			set_to.call(id)
			for o: Array in tiles:
				(o[1] as _Tile).set_on(o[0] == id)
			_change()
			_refresh_thumbs())
		_content.add_child(t)
		_cbuttons.append(t)
		tiles.append([id, t])
		_thumb(t.pic, svg_for.call(id, _pixels(pic)))
	_grids.append(grid)
	var rows := ceili(items.size() / float(cols))
	_y += rows * th + (rows - 1) * gap


## A picture's size in the screen's pixels.
func _pixels(sz: Vector2) -> Vector2i:
	var k := Icons.density()
	return Vector2i(maxi(4, ceili(sz.x * k)), maxi(4, ceili(sz.y * k)))


## Puts the drawing of `svg` in a picture (at once if it was drawn lately).
func _thumb(r: TextureRect, svg: String) -> void:
	if str(r.get_meta("svg", "")) == svg:
		return
	r.set_meta("svg", svg)
	# (held weakly: the tab may be laid out afresh before the drawing lands)
	var ref: WeakRef = weakref(r)
	var t := baker.draw(svg, func(tex: Texture2D) -> void:
		var pic: TextureRect = ref.get_ref()
		if pic != null and str(pic.get_meta("svg", "")) == svg and tex != null:
			pic.texture = tex)
	if t != null:
		r.texture = t


## Every picture that shows her colours, drawn afresh (and the hull parts' dots).
func _refresh_thumbs() -> void:
	_thumbs_at = -1.0
	for g: Array in _grids:
		var svg_for: Callable = g[1]
		for o: Array in g[0]:
			var t: _Tile = o[1]
			_thumb(t.pic, svg_for.call(str(o[0]), _pixels(t.pic.size)))
	for pb: Array in _part_btns:
		(pb[1] as _Part).set_colour(Color(str(look.hull[str(pb[0])])))


## A change made: handed over at the frame's end (one a frame, however many).
func _change() -> void:
	_due = true
	if _save != null:
		_sync_save()


func _flush() -> void:
	if _due:
		_due = false
		changed.emit(look.duplicate(true))


## A whole new look (a famous ship's colours, a saved design, a surprise):
## hers at once, the tab laid out afresh.
func _take(l: Dictionary, spin: bool) -> void:
	look = l
	_gen += 1
	_due = true
	if spin:
		_die_t = 0.0
	_render()


func _surprise() -> void:
	clicked.emit()
	_commit_paint()
	_take(ShipLook.random_look(str(look.name)), true)


# ------------------------------------------------------------------ designs


## The save card says whether this look is saved, or the hold is full.
func _sync_save() -> void:
	if _save == null:
		return
	var saved := false
	for d: Dictionary in designs:
		if ShipLook.same_design(d.look, look):
			saved = true
			break
	_save.show_state("saved" if saved else ("full" if designs.size() >= ShipLook.MAX_SAVED else "save"))


## A saved design deleted (its card's delete, tapped twice).
func delete_design(id: String) -> void:
	for i in designs.size():
		if str(designs[i].id) == id:
			designs.remove_at(i)
			designs_changed.emit(designs.duplicate(true))
			if visible and tab == "presets":
				_render()
			return


func _save_design() -> void:
	if _save == null or _save.state != "save":
		return
	clicked.emit()
	if _stage.painting or _paint_task >= 0:
		# saved once the brush's layer is kept
		_save_after_paint = true
		_commit_paint()
		return
	var l := look.duplicate(true)
	var id := "%x%04x" % [int(Time.get_unix_time_from_system() * 1000.0), randi() % 0x10000]
	designs.push_front({"id": id, "name": ShipLook.design_name(l, designs), "look": l})
	if designs.size() > ShipLook.MAX_SAVED:
		designs.resize(ShipLook.MAX_SAVED)
	designs_changed.emit(designs.duplicate(true))
	_render()


# ------------------------------------------------------------------ the brush


func _toggle_paint() -> void:
	if _stage.painting:
		_commit_paint()
	else:
		_stage.brush_color = Color(str(look.flag.emblem_color))
		_stage.erase = false
		_stage.begin(str(look.flag.paint))
		brush.emit(_stage.layer())
		_flush()
	if tab == "flag":
		_render()


## The brush put away: its layer is kept as a PNG off the main thread and
## becomes her flag's paint (unless a whole new look was taken meanwhile).
func _commit_paint() -> void:
	if not _stage.painting:
		return
	var img := _stage.end()
	if _paint_task >= 0:
		WorkerThreadPool.wait_for_task_completion(_paint_task)
	var out := _paint_out
	_paint_gen = _gen
	_paint_task = WorkerThreadPool.add_task(func() -> void: out[0] = FlagStage.encode(img), false, "Shipwright paint")
	set_process(true)


func _paint_kept() -> void:
	WorkerThreadPool.wait_for_task_completion(_paint_task)
	_paint_task = -1
	if _paint_gen == _gen:
		look.flag.paint = str(_paint_out[0])
	# the layer comes down as soon as her flag, the paint in it, is drawn
	brush.emit(null)
	_due = false
	changed.emit(look.duplicate(true))
	if _save_after_paint:
		_save_after_paint = false
		if visible and _save != null:
			_save_design()
	elif visible and tab == "flag":
		_refresh_thumbs()


# ------------------------------------------------------------------ shots and the smoke test


## A tab opened, as a tap on it would.
func pick_tab(id: String) -> void:
	if visible and id != tab and FOCUS.has(id):
		_set_tab(id)


## A whole look taken, as a famous ship's card would take it.
func take(l: Dictionary) -> void:
	if visible:
		_commit_paint()
		_take(l.duplicate(true), false)


## The brush out on the Flag tab and a stroke along `points` (shares of her
## flag across and down), as a finger would draw it.
func paint_stroke(points: PackedVector2Array) -> void:
	pick_tab("flag")
	if visible and not _stage.painting:
		_toggle_paint()
	_stage.stroke(points)


## The brush put away (Done painting), its work kept off the main thread.
func paint_done() -> void:
	if _stage.painting:
		_toggle_paint()


## Whether the brush's work is still being kept.
func paint_busy() -> bool:
	return _paint_task >= 0


## The colour picker opened on the open tab's first row of colours.
func pick_any() -> void:
	if visible and not _rows.is_empty():
		(_rows[0][1] as CustomSwatch).pressed.emit()


## This design saved, as the save card would (false: it's saved already or
## the hold is full).
func save_design() -> bool:
	pick_tab("presets")
	if _save == null or _save.state != "save":
		return false
	_save_design()
	return true


## The Refit tab open on a slot's track, scrolled to bring it into view
## (the web's scrollIntoView), and its step `id` tapped (the one she
## carries if none is given).
func pick_part(slot: String, id := "?") -> void:
	pick_tab("refit")
	if not visible or not _tracks.has(slot):
		return
	var t: Dictionary = _tracks[slot]
	var want := str(_fit().get(slot, "")) if id == "?" else id
	for n: _Node in t.nodes:
		if n.id == want:
			_tap_node(slot, n)
	var first: _Node = t.nodes[0]
	_scroll_to((t.block as Control).position.y + first.position.y + first.size.y * 0.5 - _body.size.y * 0.5)


# ------------------------------------------------------------------ the frame


func _process(dt: float) -> void:
	if _paint_task >= 0 and WorkerThreadPool.is_task_completed(_paint_task):
		_paint_kept()
	if not visible:
		set_process(_paint_task >= 0)
		return
	_t += dt
	if not _down and absf(_fling) > 1.0:
		_scroll_to(_scroll + _fling * dt)
		_fling *= exp(-4.0 * dt)
	if _thumbs_at >= 0.0 and _t >= _thumbs_at:
		_refresh_thumbs()
	_flush()
	_step(dt)


func _step(dt: float) -> void:
	_reveal.step(_t)
	_tick_tabs(dt)
	if _die_t < 1.0:
		_die_t = minf(1.0, _die_t + dt / 0.45)
		_die.rotation = TAU * (1.0 - pow(1.0 - _die_t, 3.0))
	if _slider != null:
		_slider.tick(dt)
	if _bars != null:
		_bars.tick(dt)
	for t: Dictionary in _tracks.values():
		for n: _Node in t.nodes:
			n.tick(dt)
		(t.card as _PartInfo).tick(dt)


## The tabs ease toward the open one: its white pill and dark ink. A tab
## with something new behind it wears a gold dot, popping in on a spring.
func _tick_tabs(dt: float) -> void:
	for it: Array in _tabs:
		var want := 1.0 if it[0] == tab else 0.0
		var k := move_toward(float(it[4]), want, dt / 0.2)
		it[4] = k
		var b: UiButton = it[1]
		b.p("c_top", Color(WHITE_PILL, k)).p("c_foot", Color(WHITE_PILL, k))
		b.p("c_shadow", Color(0.0, 0.0, 0.0, 0.25 * k)).p("shadow", Vector2(6.0, 20.0) * _px)
		var ink := HudStyle.INK_2.lerp(DARK_INK, k)
		(it[2] as TextureRect).self_modulate = ink
		(it[3] as UiText).modulate = ink
		var nk := move_toward(float(it[6]), 1.0 if _has_new(str(it[0])) else 0.0, dt / 0.3)
		it[6] = nk
		var dot: UiBox = it[5]
		dot.visible = nk > 0.0
		dot.modulate.a = minf(1.0, nk / 0.67)
		var ds := lerpf(0.4, 1.0, HudStyle.spring(nk))
		dot.scale = Vector2(ds, ds)


## Whether a tab has something new behind it (the Refit tab: parts found
## and not yet looked at).
func _has_new(id: String) -> bool:
	return id == "refit" and not (locker.get("unseen", []) as Array).is_empty()


## The camera brought round to `what` (unless it's on it already and `keep`:
## a step on the Refit tab's track leaves the swing alone then).
func _look_at(what: String, keep := false) -> void:
	if keep and what == _focus:
		return
	_focus = what
	focus.emit(what)


# ------------------------------------------------------------------ input


## Keys go no further while it's up (a name being typed takes its own first).
func _unhandled_input(event: InputEvent) -> void:
	if visible and event is InputEventKey:
		get_viewport().set_input_as_handled()


func _scroll_to(s: float) -> void:
	_scroll = clampf(s, 0.0, _scroll_max)
	if _scroll <= 0.0 or _scroll >= _scroll_max:
		_fling = 0.0
	_content.position.y = -_scroll


## The body under a finger or the mouse: a drag up or down scrolls it; one
## along the slider (or a tap on it) sets it.
func _on_body(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION:
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_scroll_to(_scroll - 40.0 * MenuKit.U)
			return
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_scroll_to(_scroll + 40.0 * MenuKit.U)
			return
		if event.button_index != MOUSE_BUTTON_LEFT:
			return
	var touch := event is InputEventScreenTouch
	var click: bool = event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION
	if touch and event.index != 0:
		return
	if touch or click:
		if event.pressed:
			_down = true
			_from = event.position
			_last = event.position
			_last_ms = Time.get_ticks_msec()
			_mode = ""
			_fling = 0.0
			_grab = _slider if _slider != null and _slider_hit(event.position) else null
		elif _down:
			if _mode == "" and _grab != null:
				_grab.set_at(_slider_x(event.position))
				_mode = "slide"
			if _mode == "slide":
				clicked.emit()
			_release()
		return
	var moved: bool = (event is InputEventScreenDrag and event.index == 0) or (event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION)
	if not moved or not _down:
		return
	var d: Vector2 = event.position - _from
	if _mode == "":
		if _grab != null and absf(d.x) > 6.0 and absf(d.x) > absf(d.y):
			_mode = "slide"
			_grab.held = true
		elif absf(d.y) > UiButton.SLOP:
			_mode = "scroll"
	if _mode == "slide":
		_grab.set_at(_slider_x(event.position))
	elif _mode == "scroll":
		var dy: float = event.position.y - _last.y
		var now := Time.get_ticks_msec()
		var dts := maxf(0.001, (now - _last_ms) / 1000.0)
		_fling = lerpf(_fling, -dy / dts, 0.5)
		_last_ms = now
		_scroll_to(_scroll - dy)
	_last = event.position


func _release() -> void:
	_down = false
	_mode = ""
	if _grab != null:
		_grab.held = false
	_grab = null


func _slider_hit(at: Vector2) -> bool:
	var r := Rect2(_slider.position + Vector2(0.0, -_scroll), _slider.size)
	return r.grow(6.0 * _px).has_point(at)


## Where a point of the body falls along the slider (units from its left).
func _slider_x(at: Vector2) -> float:
	return at.x - _slider.position.x


## The world beside the panel: a drag swings the camera round her, a pinch
## (or the wheel, or a trackpad) brings it in or backs it off.
func _on_world(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed:
			_pts[e.index] = e.position
		else:
			_pts.erase(e.index)
		_pinch = _spread() if _pts.size() == 2 else 0.0
	elif e is InputEventScreenDrag:
		if not _pts.has(e.index):
			return
		var was: Vector2 = _pts[e.index]
		_pts[e.index] = e.position
		if _pts.size() == 1:
			swing.emit((e.position.x - was.x) / maxf(1.0, _vp.x))
		elif _pts.size() == 2:
			var s := _spread()
			if _pinch > 1.0 and s > 1.0:
				zoom.emit(_pinch / s)
			_pinch = s
	elif e is InputEventMouseButton and e.device != InputEvent.DEVICE_ID_EMULATION:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				_pts[-1] = mb.position
			else:
				_pts.erase(-1)
		elif mb.pressed and (mb.button_index == MOUSE_BUTTON_WHEEL_UP or mb.button_index == MOUSE_BUTTON_WHEEL_DOWN):
			var notch := mb.factor if mb.factor > 0.0 else 1.0
			# the web's exp(deltaY * 0.0012), a notch being 100 px
			zoom.emit(exp((-0.12 if mb.button_index == MOUSE_BUTTON_WHEEL_UP else 0.12) * notch))
	elif e is InputEventMouseMotion and e.device != InputEvent.DEVICE_ID_EMULATION:
		if _pts.has(-1):
			var was: Vector2 = _pts[-1]
			_pts[-1] = e.position
			swing.emit((e.position.x - was.x) / maxf(1.0, _vp.x))
	elif e is InputEventMagnifyGesture:
		zoom.emit(1.0 / maxf(0.01, e.factor))
	_world.accept_event()


func _spread() -> float:
	var pts: Array = _pts.values()
	return (pts[0] as Vector2).distance_to(pts[1]) if pts.size() >= 2 else 0.0


# ------------------------------------------------------------------ art


## A sail's tile: a bellied square of canvas in its cloth, its pattern in the
## accent (the web's sailThumb), `px` big.
static func sail_svg(pattern: String, cloth: String, accent: String, px: Vector2i) -> String:
	var outline := "M6.48 4.64Q27 9.28 47.52 4.64Q52.92 29 49.68 53.36Q27 46.4 4.32 53.36Q1.08 29 6.48 4.64Z"
	var art := ""
	match pattern:
		"stripes":
			for i in [1, 3, 5, 7]:
				art += '<rect x="%s" width="6" height="58"/>' % Heraldry.n(i * 6.0)
		"band":
			art = '<rect y="33.64" width="54" height="11.6"/>'
		"border":
			art = '<path d="%s" fill="none" stroke="%s" stroke-width="9.72"/>' % [outline, accent]
		"cross":
			art = '<rect x="23.22" width="7.56" height="58"/><rect y="24.36" width="54" height="8.12"/>'
		"diagonal":
			art = '<path d="M0 20.3L35.1 58H0Z"/>'
	return '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 54 58" preserveAspectRatio="none"><defs><clipPath id="s"><path d="%s"/></clipPath></defs><g clip-path="url(#s)"><rect width="54" height="58" fill="%s"/><g fill="%s">%s</g></g><path d="%s" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="1.5"/></svg>' % [px.x, px.y, outline, cloth, accent, art, outline]


# ------------------------------------------------------------------ widgets


## A colour to pick: a round of it, lit inside and shadowed under; the one
## chosen ringed dark and white, glowing, and standing a little proud.
class Swatch:
	extends UiButton
	var on := false

	func _init(c: Color, d: float) -> void:
		super(Vector2(d, d), d * 0.5, 22.0 * MenuKit.PX)
		squeeze = 0.94
		pivot_offset = size * 0.5
		p("c_top", c).p("c_mid", c).p("mid", 0.55).p("c_foot", c.darkened(0.16))
		p("c_border", Color(1.0, 1.0, 1.0, 0.25)).p("hi", 0.0)
		set_on(false)

	func set_on(v: bool) -> void:
		on = v
		var px := MenuKit.PX
		if v:
			p("c_shadow", Color(0.627, 0.941, 1.0, 0.45)).p("shadow", Vector2(0.0, 16.0 * px))
			p("c_glow", Color.WHITE).p("glow", 0.6).p("glow_spread", 4.0 * px)
			p("c_ring", Color("#0a2230")).p("ring", 2.0 * px)
		else:
			p("c_shadow", Color(0.0, 0.0, 0.0, 0.25)).p("shadow", Vector2(2.0, 6.0) * px)
			p("c_glow", Color(0.0, 0.0, 0.0, 0.0)).p("glow", 0.0).p("ring", 0.0)
		set_rest(1.08 if v else 1.0)


## Any colour at all: the rainbow round, the colour picked in its middle.
class CustomSwatch:
	extends Swatch
	var _mat: ShaderMaterial

	func _init(d: float) -> void:
		super(Color(0.0, 0.0, 0.0, 0.0), d)
		var r := ColorRect.new()
		r.size = Vector2(d, d)
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		r.show_behind_parent = true
		_mat = ShaderMaterial.new()
		_mat.shader = preload("res://shaders/colour_pick.gdshader")
		_mat.set_shader_parameter("mode", 2)
		_mat.set_shader_parameter("rect", r.size)
		r.material = _mat
		add_child(r)

	## The colour picked on it (null: none, the rainbow whole).
	func pick(c: Variant) -> void:
		set_on(c != null)
		_mat.set_shader_parameter("centre", 0.735 if c != null else 0.0)
		if c != null:
			_mat.set_shader_parameter("picked", c)


## A tile in a grid: its picture over its name.
class _Tile:
	extends UiButton
	var pic: TextureRect
	var _cap: UiText

	func _init(sz: Vector2, pic_size: Vector2, title: String) -> void:
		super(sz, 13.0 * MenuKit.PX, 26.0 * MenuKit.PX)
		var px := MenuKit.PX
		squeeze = 0.96
		pic = TextureRect.new()
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.size = pic_size
		pic.position = Vector2((sz.x - pic_size.x) * 0.5, 7.0 * px)
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(pic)
		_cap = MenuKit.words(title, "inter", 600, 10.0 * px, Color.WHITE, 0.04)
		_cap.cut_to(sz.x - 8.0 * px)
		_cap.position = Vector2((sz.x - _cap.size.x) * 0.5, pic.position.y + pic_size.y + 4.0 * px)
		add_child(_cap)
		set_on(false)

	func set_on(v: bool) -> void:
		var px := MenuKit.PX
		var fill := Color(1.0, 1.0, 1.0, 0.13 if v else 0.04)
		p("c_top", fill).p("c_foot", fill).p("hi", 0.0)
		p("c_border", Color.WHITE if v else LINE).p("border", 2.0 * px if v else 1.0)
		p("c_shadow", Color(0.235, 0.863, 0.824, 0.18 if v else 0.0)).p("shadow", Vector2(8.0, 22.0) * px)
		_cap.modulate = HudStyle.INK if v else HudStyle.INK_2


## A part of her hull, its colour in a dot beside its name.
class _Part:
	extends UiButton
	var _dot: UiBox

	func _init(sz: Vector2, title: String, c: Color) -> void:
		super(sz, 13.0 * MenuKit.PX, 4.0)
		var px := MenuKit.PX
		squeeze = 0.97
		var d := 18.0 * px
		_dot = UiBox.new(Vector2(d, d), d * 0.5, 2.0)
		MenuKit.flat(_dot)
		_dot.p("c_border", Color(1.0, 1.0, 1.0, 0.3)).p("hi", 0.0)
		_dot.position = Vector2(8.0 * px, (sz.y - d) * 0.5)
		add_child(_dot)
		var t := MenuKit.words(title, "inter", 600, 12.0 * px, HudStyle.INK)
		t.cut_to(sz.x - 8.0 * px * 2.0 - d - 8.0 * px)
		t.position = Vector2(8.0 * px + d + 8.0 * px, (sz.y - t.size.y) * 0.5)
		add_child(t)
		set_colour(c)
		set_on(false)

	func set_colour(c: Color) -> void:
		_dot.p("c_top", c).p("c_foot", c)

	func set_on(v: bool) -> void:
		var px := MenuKit.PX
		var fill := Color(1.0, 1.0, 1.0, 0.13 if v else 0.04)
		p("c_top", fill).p("c_foot", fill).p("hi", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0))
		p("c_border", Color.WHITE if v else LINE).p("border", 2.0 * px if v else 1.0)


## Choices in a pill (the web's segmented control), the chosen one white.
class _Seg:
	extends UiBox
	signal chosen(v: Variant)
	var buttons: Array[UiButton] = []
	var _opts: Array = []

	func _init(opts: Array, value: Variant) -> void:
		var px := MenuKit.PX
		super(Vector2(10.0, 10.0), 999.0, 4.0)
		MenuKit.flat(self)
		p("c_top", Color(1.0, 1.0, 1.0, 0.04)).p("c_foot", Color(1.0, 1.0, 1.0, 0.04)).p("c_border", LINE).p("hi", 0.0)
		var x := 3.0 * px
		var bh := 7.0 * px * 2.0 + 12.0 * px * 1.21
		for o: Array in opts:
			var t := MenuKit.words(str(o[1]), "inter", 700, 12.0 * px, Color.WHITE)
			var bw := t.size.x + 32.0 * px
			var b := UiButton.new(Vector2(bw, bh), bh * 0.5, 4.0)
			b.squeeze = 0.96
			MenuKit.flat(b)
			b.p("border", 0.0).p("hi", 0.0)
			t.position = (Vector2(bw, bh) - t.size) * 0.5
			b.add_child(t)
			b.position = Vector2(x, 3.0 * px)
			var v: Variant = o[0]
			b.pressed.connect(func() -> void:
				_show(v)
				chosen.emit(v))
			add_child(b)
			buttons.append(b)
			_opts.append([v, b, t])
			x += bw
		resize(Vector2(x + 3.0 * px, bh + 6.0 * px))
		_show(value)

	func _show(value: Variant) -> void:
		for o: Array in _opts:
			var on: bool = o[0] == value
			var fill := WHITE_PILL if on else Color(1.0, 1.0, 1.0, 0.0)
			(o[1] as UiButton).p("c_top", fill).p("c_foot", fill)
			(o[2] as UiText).modulate = DARK_INK if on else HudStyle.INK_2


## A value on a track (the web's range input, in gold): the body's input
## works it (Shipwright._on_body), so a drag up or down still scrolls.
class _Slider:
	extends Control
	signal moved(v: float)
	var held := false
	var value := 1.0
	var _lo := 0.0
	var _hi := 1.0
	var _step := 0.0
	var _thumb: UiBox
	var _s := 1.0

	func _init(w: float, v: float, lo: float, hi: float, step: float) -> void:
		var px := MenuKit.PX
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_lo = lo
		_hi = hi
		_step = step
		value = v
		size = Vector2(w, 30.0 * px)
		_thumb = UiBox.new(Vector2(18.0, 18.0) * px, 9.0 * px, 12.0 * px)
		_thumb.p("c_top", HudStyle.GOLD_HI).p("c_foot", HudStyle.GOLD).p("border", 0.0).p("hi", 0.0)
		_thumb.p("c_shadow", Color(0.0, 0.0, 0.0, 0.35)).p("shadow", Vector2(2.0, 6.0) * px)
		_thumb.pivot_offset = _thumb.size * 0.5
		add_child(_thumb)
		tick(0.0)

	## Set from a point along it (units from its left).
	func set_at(x: float) -> void:
		var r := 9.0 * MenuKit.PX
		var k := clampf((x - r) / maxf(1.0, size.x - r * 2.0), 0.0, 1.0)
		var v := _lo + (_hi - _lo) * k
		if _step > 0.0:
			v = snappedf(v, _step)
		if absf(v - value) > 1e-4:
			value = v
			moved.emit(v)
			queue_redraw()

	func tick(dt: float) -> void:
		_s = move_toward(_s, 1.15 if held else 1.0, dt / 0.15)
		_thumb.scale = Vector2(_s, _s)
		var r := 9.0 * MenuKit.PX
		var k := (value - _lo) / (_hi - _lo)
		_thumb.position = Vector2(r + (size.x - r * 2.0) * k - _thumb.size.x * 0.5, (size.y - _thumb.size.y) * 0.5)

	func _draw() -> void:
		var px := MenuKit.PX
		var h := 4.0 * px
		var r := 9.0 * px
		var y := (size.y - h) * 0.5
		var sb := StyleBoxFlat.new()
		sb.set_corner_radius_all(ceili(h * 0.5))
		sb.anti_aliasing = true
		sb.bg_color = Color(1.0, 1.0, 1.0, 0.16)
		draw_style_box(sb, Rect2(r, y, size.x - r * 2.0, h))
		sb.bg_color = HudStyle.GOLD
		var k := (value - _lo) / (_hi - _lo)
		draw_style_box(sb, Rect2(r, y, maxf(h, (size.x - r * 2.0) * k), h))


## A ship's colours on a card: her flag, her name, and dots of her topsides,
## planking, canvas, its accent and her gilding. A saved design's card has
## its delete: the first tap arms it ("Delete?"), a second within 4 s deletes.
class _Card:
	extends UiButton
	signal deleted
	signal armed
	var pic: TextureRect
	var _del: UiButton
	var _del_t: UiText
	var _arm_at := -1.0
	var _on := false

	func _init(w: float, title: String, l: Dictionary, on: bool, can_delete: bool) -> void:
		var px := MenuKit.PX
		var pad := 10.0 * px
		var name_h := 13.0 * px * 1.21
		var h := pad + 52.0 * px + 8.0 * px + name_h + 5.0 * px + 12.0 * px + pad
		super(Vector2(w, h), 14.0 * px, 4.0)
		squeeze = 0.97
		_on = on
		pic = TextureRect.new()
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.size = Vector2(84.0, 52.0) * px
		pic.position = Vector2(pad, pad)
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(pic)
		var t := MenuKit.words(title, "inter", 700, 13.0 * px, HudStyle.INK)
		t.cut_to(w - pad * 2.0)
		t.position = Vector2(pad, pad + 52.0 * px + 8.0 * px)
		add_child(t)
		var dots := [l.hull.topsides, l.hull.planks, l.sail.cloth, l.sail.accent, l.hull.gilding]
		for i in dots.size():
			var d := UiBox.new(Vector2(12.0, 12.0) * px, 6.0 * px, 2.0)
			MenuKit.flat(d)
			var c := Color(str(dots[i]))
			d.p("c_top", c).p("c_foot", c).p("c_border", Color(1.0, 1.0, 1.0, 0.3)).p("hi", 0.0)
			d.position = Vector2(pad + i * 16.0 * px, t.position.y + name_h + 5.0 * px)
			add_child(d)
		if can_delete:
			_del = UiButton.new(Vector2(24.0, 24.0) * px, 12.0 * px, 4.0)
			_del.mouse_filter = Control.MOUSE_FILTER_STOP
			MenuKit.flat(_del)
			_del.p("border", 0.0).p("hi", 0.0)
			_del_t = MenuKit.words("×", "inter", 600, 16.0 * px, HudStyle.INK_2)
			_del.add_child(_del_t)
			_del.pressed.connect(_on_del)
			add_child(_del)
			_arm(false)
		_style()

	func resize(sz: Vector2) -> void:
		super(sz)
		if _del != null:
			_del.position = Vector2(sz.x - _del.size.x - 6.0 * MenuKit.PX, 6.0 * MenuKit.PX)

	func _on_del() -> void:
		if _arm_at < 0.0:
			_arm(true)
			armed.emit()
			return
		deleted.emit()

	func _arm(on: bool) -> void:
		var px := MenuKit.PX
		_arm_at = Time.get_ticks_msec() / 1000.0 if on else -1.0
		if on:
			_del_t.set_runs([["Delete?", HudStyle.font("inter", 700, roundi(0.04 * 11.0 * px)), roundi(11.0 * px), Color.WHITE]])
		else:
			_del_t.set_runs([["×", HudStyle.font("inter", 600), roundi(16.0 * px), HudStyle.INK_2]])
		var dw := maxf(24.0 * px, _del_t.size.x + 12.0 * px)
		_del.resize(Vector2(dw, 24.0 * px))
		_del.modulate.a = 1.0 if on else 0.7
		var fill := RED if on else Color8(8, 20, 30, 219)
		_del.p("c_top", fill).p("c_foot", fill)
		_del_t.position = (_del.size - _del_t.size) * 0.5
		_del.position = Vector2(size.x - dw - 6.0 * px, 6.0 * px)
		set_process(true)
		_style()

	func _style() -> void:
		var px := MenuKit.PX
		var fill := Color(1.0, 1.0, 1.0, 0.04)
		p("c_top", fill).p("c_foot", fill).p("hi", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0))
		if _arm_at >= 0.0:
			p("c_border", RED).p("border", 1.0)
		else:
			p("c_border", Color.WHITE if _on else LINE).p("border", 2.0 * px if _on else 1.0)

	func _process(dt: float) -> void:
		super(dt)
		if _arm_at < 0.0:
			return
		if Time.get_ticks_msec() / 1000.0 - _arm_at > 4.0:
			_arm(false)
		else:
			# the button settling stops the frames: the timer needs them
			set_process(true)


## The card that saves this look: a dashed gold slot with a "+", or (saved,
## or the hold full) a solid one that says so.
class _SaveCard:
	extends UiButton
	var state := ""
	var _ring: UiBox
	var _icon: TextureRect
	var _b: UiText
	var _small: UiText
	var _dash: _DashEdge

	func _init(sz: Vector2) -> void:
		super(sz, 14.0 * MenuKit.PX, 4.0)
		var px := MenuKit.PX
		squeeze = 0.97
		_dash = _DashEdge.new(sz, 14.0 * px)
		add_child(_dash)
		_ring = UiBox.new(Vector2(30.0, 30.0) * px, 15.0 * px, 2.0)
		MenuKit.flat(_ring)
		_ring.p("border", 0.0).p("hi", 0.0)
		add_child(_ring)
		_icon = Icons.rect("plus", 17.0 * px)
		_ring.add_child(_icon)
		_b = MenuKit.words("", "inter", 700, 13.0 * px, HudStyle.INK)
		_small = UiText.new([["", HudStyle.font("inter", 500), roundi(10.5 * px), HudStyle.INK_2]], sz.x - 20.0 * px, 1.3)
		_small.align = HORIZONTAL_ALIGNMENT_CENTER
		add_child(_b)
		add_child(_small)

	func resize(sz: Vector2) -> void:
		super(sz)
		if _dash != null:
			_dash.size = sz
			_dash.queue_redraw()
			_lay()

	func show_state(s: String) -> void:
		if s == state:
			return
		state = s
		var px := MenuKit.PX
		var open := s == "save"
		enabled = open
		var icon := "plus" if open else ("check" if s == "saved" else "anchor")
		_icon.texture = Icons.texture(icon, 17.0 * px)
		var text: Array = {"save": ["Save this design", "Keep it to sail with later"], "saved": ["Saved", "This design is in your collection"],
				"full": ["Hold is full", "Delete a design to save more (max %d)" % ShipLook.MAX_SAVED]}[s]
		_b.set_text(str(text[0]))
		_small.set_text(str(text[1]))
		var fill := Color(GOLD_SOFT, 0.06) if open else Color(1.0, 1.0, 1.0, 0.03)
		p("c_top", fill).p("c_foot", fill).p("hi", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0))
		p("border", 0.0 if open else 1.0).p("c_border", LINE)
		_dash.visible = open
		var ring := HudStyle.GOLD if open else Color(GOLD_SOFT, 0.14)
		_ring.p("c_top", ring).p("c_foot", ring)
		_icon.self_modulate = HudStyle.GOLD_INK if open else HudStyle.GOLD
		_lay()

	func _lay() -> void:
		var px := MenuKit.PX
		_icon.position = (_ring.size - _icon.size) * 0.5
		var h := _ring.size.y + 4.0 * px + _b.size.y + 4.0 * px + _small.size.y
		var y := (size.y - h) * 0.5
		_ring.position = Vector2((size.x - _ring.size.x) * 0.5, y)
		_b.position = Vector2((size.x - _b.size.x) * 0.5, y + _ring.size.y + 4.0 * px)
		_small.position = Vector2((size.x - _small.size.x) * 0.5, _b.position.y + _b.size.y + 4.0 * px)


## A dashed gold edge round a rounded box.
class _DashEdge:
	extends Control
	var _r := 0.0

	func _init(sz: Vector2, r: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = sz
		_r = r

	func _draw() -> void:
		var c := Color(GOLD_SOFT, 0.55)
		var w := maxf(1.0, MenuKit.PX)
		var d := 4.0 * MenuKit.PX
		var r := _r
		var h := w * 0.5
		draw_dashed_line(Vector2(r, h), Vector2(size.x - r, h), c, w, d, false)
		draw_dashed_line(Vector2(r, size.y - h), Vector2(size.x - r, size.y - h), c, w, d, false)
		draw_dashed_line(Vector2(h, r), Vector2(h, size.y - r), c, w, d, false)
		draw_dashed_line(Vector2(size.x - h, r), Vector2(size.x - h, size.y - r), c, w, d, false)
		for k in 4:
			var cx := r if k == 0 or k == 3 else size.x - r
			var cy := r if k < 2 else size.y - r
			var a0 := PI + k * PI * 0.5
			draw_arc(Vector2(cx, cy), r - h, a0 + 0.35, a0 + PI * 0.5 - 0.35, 6, c, w, true)


## Her figures as bars (the web's .sw-rbars): the class's own in pale sea
## green, what her refit adds in gold (or takes away, in red), each easing
## over to a change.
class _RBars:
	extends UiBox
	const KEYS := [["speed", "Speed"], ["agility", "Agility"], ["armour", "Armour"], ["hull", "Hull"], ["firepower", "Firepower"]]
	var _base := {}
	var _tw := 0.0
	## Each: {label, fill, gain, from, to, now (the fill's end and the gain's
	## width, as shares of the track), t (through the ease)}.
	var _rows: Array[Dictionary] = []

	func _init(w: float, base: Dictionary, now: Dictionary) -> void:
		var px := MenuKit.PX
		var lh := 10.0 * px * 1.21
		super(Vector2(w, 20.0 * px + lh * KEYS.size() + 6.0 * px * (KEYS.size() - 1)), 14.0 * px, 2.0)
		MenuKit.flat(self)
		var fill := Color(0.0, 0.0, 0.0, 0.22)
		p("c_top", fill).p("c_foot", fill).p("c_border", Color(1.0, 1.0, 1.0, 0.05)).p("hi", 0.0)
		_base = base
		var x := 12.0 * px + 74.0 * px + 10.0 * px
		_tw = w - x - 12.0 * px
		for i in KEYS.size():
			var y := 10.0 * px + i * (lh + 6.0 * px)
			var label := MenuKit.words(str(KEYS[i][1]).to_upper(), "inter", 700, 10.0 * px, Color.WHITE, 0.12, 1.21)
			MenuKit.line_at(label, 12.0 * px, y, lh)
			add_child(label)
			# the track clips what runs along it, the gold's glow too (overflow: hidden)
			var track := UiBox.new(Vector2(_tw, 6.0 * px), 3.0 * px, 2.0)
			MenuKit.flat(track)
			var tf := Color(1.0, 1.0, 1.0, 0.08)
			track.p("c_top", tf).p("c_foot", tf).p("border", 0.0).p("hi", 0.0)
			track.position = Vector2(x, y + (lh - 6.0 * px) * 0.5)
			track.clip_contents = true
			add_child(track)
			var b := UiBox.new(Vector2(6.0, 6.0) * px, 3.0 * px, 2.0)
			MenuKit.flat(b)
			b.p("c_top", Color("#8fd8d0")).p("c_foot", Color("#e9f6f4")).p("horiz", 1.0).p("border", 0.0).p("hi", 0.0)
			track.add_child(b)
			var em := UiBox.new(Vector2(6.0, 6.0) * px, 3.0 * px, 12.0 * px)
			MenuKit.flat(em)
			em.p("border", 0.0).p("hi", 0.0)
			track.add_child(em)
			_rows.append({"label": label, "fill": b, "gain": em, "from": Vector2.ZERO, "to": Vector2.ZERO, "now": Vector2.ZERO, "t": 1.0})
		show_bars(now, false)

	## The bars for her figures now, eased there (or at once).
	func show_bars(now: Dictionary, ease := true) -> void:
		var px := MenuKit.PX
		for i in KEYS.size():
			var k := str(KEYS[i][0])
			var b0 := minf(1.0, float(_base[k]))
			var b1 := minf(1.25, float(now[k]))
			var r := _rows[i]
			var mood := 1 if b1 > b0 + 0.004 else (-1 if b1 < b0 - 0.004 else 0)
			r.from = r.now if ease else Vector2(minf(b0, b1), absf(b1 - b0)) / 1.25
			r.to = Vector2(minf(b0, b1), absf(b1 - b0)) / 1.25
			r.t = 0.0 if ease else 1.0
			(r.label as UiText).modulate = HudStyle.GOLD_HI if mood > 0 else HudStyle.INK_3
			var em: UiBox = r.gain
			if mood < 0:
				em.p("c_top", Color("#ff7563")).p("c_foot", Color("#e5604f")).p("mid", -1.0).p("horiz", 1.0).p("glow", 0.0)
			else:
				em.p("c_top", HudStyle.GOLD_TOP).p("c_mid", HudStyle.GOLD_MID).p("mid", 0.52).p("c_foot", HudStyle.GOLD_FOOT).p("horiz", 0.0)
				em.p("c_glow", Color8(255, 200, 90, 178)).p("glow", 10.0 * px)
			_lay(r, r.from)

	func tick(dt: float) -> void:
		for r in _rows:
			if float(r.t) < 1.0:
				r.t = minf(1.0, float(r.t) + dt / 0.45)
				_lay(r, (r.from as Vector2).lerp(r.to, HudStyle.eased(float(r.t))))

	func _lay(r: Dictionary, v: Vector2) -> void:
		r.now = v
		var h := 6.0 * MenuKit.PX
		var b: UiBox = r.fill
		b.visible = v.x * _tw > 0.5
		b.resize(Vector2(maxf(v.x * _tw, 1.0), h))
		var em: UiBox = r.gain
		em.visible = v.y * _tw > 0.5
		em.position.x = v.x * _tw
		em.resize(Vector2(maxf(v.y * _tw, 1.0), h))


## A step on a slot's track (the web's .sw-node): a part's portrait in a
## dark tile ringed in its rarity's colour, over the rarity's name (or the
## standard fit's); greyed under a padlock until it's found, "New" until it
## has been looked at; legendary parts shimmer, mythic ones are ringed in
## turning light, and the one she carries is ringed white and glows.
class _Node:
	extends UiButton
	const DIM := preload("res://shaders/ui_dim.gdshader")
	const RING := preload("res://shaders/part_ring.gdshader")
	## The part ("" the standard fit), whether it's hers, its rarity (-1 none).
	var id := ""
	var owned := true
	var tier := -1
	var _rc := STANDARD
	var _art: Control
	var _tile: UiBox
	var _badge: UiBox
	var _pulse := 1.0
	var _shine := -1.0

	func _init(w: float, s: float, compact: bool, pt: Dictionary, slot: String, p_owned: bool, fresh: bool) -> void:
		var px := MenuKit.PX
		var fs := (7.5 if compact else 8.5) * px
		var em := 0.04 if compact else 0.1
		var called := "Standard" if pt.is_empty() else str(Parts.RARITIES[int(pt.tier)].name)
		var label := MenuKit.words(called.to_upper(), "inter", 800, fs, Color.WHITE, em, 1.21)
		# a name too long for its step (and the gap beside it) is set smaller
		if label.size.x > w + 5.0 * px:
			fs *= (w + 5.0 * px) / label.size.x
			label.queue_free()
			label = MenuKit.words(called.to_upper(), "inter", 800, fs, Color.WHITE, em, 1.21)
		super(Vector2(w, s + 4.0 * px + label.size.y), 15.0 * px, 4.0)
		squeeze = 0.95
		owned = p_owned
		if not pt.is_empty():
			id = str(pt.id)
			tier = int(pt.tier)
			_rc = Parts.RARITIES[tier].css
		var r := (12.0 if compact else 15.0) * px
		var pad := (5.0 if compact else 6.0) * px
		_art = Control.new()
		_art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_art.size = Vector2(s, s)
		_art.position = Vector2((w - s) * 0.5, 0.0)
		_art.pivot_offset = _art.size * 0.5
		add_child(_art)
		_tile = UiBox.new(Vector2(s, s), r, 48.0 * px)
		_tile.p("hi", 0.0).p("border", 1.5 * px).p("c_border", Color(_rc, _rc.a * 0.55))
		var mythic := tier == 4 and owned
		if pt.is_empty():
			_tile.p("c_top", Color("#1a3442")).p("c_border", Color(1.0, 1.0, 1.0, 0.18))
		elif mythic:
			_tile.p("c_top", Color("#2a1e4a"))
		else:
			_tile.p("c_top", Shipwright.css_mix(_rc, 0.3 if tier == 3 and owned else 0.26, Color("#0d2230")))
		# circle at 50% 35% to 75% of the farthest corner
		_tile.p("c_foot", Color("#07061a") if mythic else Color("#06121b")).p("radial", Vector4(0.5, 0.35, 1.0, 1.0)).p("radial_stop", 0.615)
		_art.add_child(_tile)
		if mythic:
			# the ring of turning light, from just outside the tile to just inside its edge
			var ring := ColorRect.new()
			ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var m := 4.0 * px
			ring.position = Vector2(-m, -m)
			ring.size = Vector2(s + m * 2.0, s + m * 2.0)
			var mat := ShaderMaterial.new()
			mat.shader = RING
			mat.set_shader_parameter("quad", ring.size)
			mat.set_shader_parameter("outer", Vector3(s * 0.5 + 2.0 * px, s * 0.5 + 2.0 * px, r + 2.0 * px))
			mat.set_shader_parameter("inner", Vector3(s * 0.5 - 1.0 * px, s * 0.5 - 1.0 * px, r - 1.0 * px))
			mat.set_shader_parameter("soft", 0.5 * px)
			ring.material = mat
			_art.add_child(ring)
		elif tier == 3 and owned:
			_shine = 0.0
			_tile.p("sheen_w", 0.9).p("sheen_span", Vector2(-2.17, 4.5)).p("sheen_a", 0.32)
		var pic := TextureRect.new()
		pic.texture = Icons.part(id if id != "" else "standard:" + slot, s - pad * 2.0)
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.position = Vector2(pad, pad)
		pic.size = Vector2(s - pad * 2.0, s - pad * 2.0)
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_art.add_child(pic)
		if not owned:
			var dim := ShaderMaterial.new()
			dim.shader = DIM
			pic.material = dim
			var l := 16.0 * px
			for k in 2:
				var lock := Icons.rect("lock", l, Color(0.0, 0.0, 0.0, 0.55) if k == 0 else Color(1.0, 1.0, 1.0, 0.75))
				lock.position = Vector2((s - l) * 0.5, (s - l) * 0.5 + (1.0 * px if k == 0 else 0.0))
				_art.add_child(lock)
		label.modulate = HudStyle.INK_4 if not owned else Shipwright.css_mix(_rc, 0.8, Color.WHITE)
		label.position = Vector2((w - label.size.x) * 0.5, s + 4.0 * px)
		add_child(label)
		if fresh:
			var t := MenuKit.words("NEW", "inter", 800, 8.0 * px, HudStyle.GOLD_INK, 0.08, 1.21)
			_badge = UiBox.new(t.size + Vector2(10.0, 2.0) * px, 99.0, 2.0)
			MenuKit.flat(_badge)
			_badge.p("c_top", HudStyle.GOLD_TOP).p("c_mid", HudStyle.GOLD_MID).p("mid", 0.52).p("c_foot", HudStyle.GOLD_FOOT).p("border", 0.0).p("hi", 0.0)
			t.position = Vector2(5.0, 1.0) * px
			_badge.add_child(t)
			_badge.position = Vector2(w + 2.0 * px - _badge.size.x, -6.0 * px)
			add_child(_badge)
		set_on(false)

	## Ringed white and glowing in its colour: the one she carries.
	func set_on(v: bool) -> void:
		var px := MenuKit.PX
		if v:
			_tile.p("c_ring", Color(1.0, 1.0, 1.0, 0.95)).p("ring", 2.0 * px)
			_tile.p("c_glow", Color(_rc, _rc.a * 0.55)).p("glow", 24.0 * px)
			_tile.p("c_shadow", Color(0.627, 0.941, 1.0, 0.28)).p("shadow", Vector2(10.0, 36.0) * px)
		else:
			_tile.p("ring", 0.0).p("glow", 0.0)
			_tile.p("c_shadow", Color(0.0, 0.0, 0.0, 0.35)).p("shadow", Vector2(6.0, 16.0) * px)

	## Fitted: it swells and settles on a spring.
	func pulse() -> void:
		_pulse = 0.0

	func clear_new() -> void:
		if _badge != null:
			_badge.visible = false

	func tick(dt: float) -> void:
		if _pulse < 1.0:
			_pulse = minf(1.0, _pulse + dt / 0.38)
			# the web's 1 -> 1.14 -> 1 run through cubic-bezier(.3, 1.6, .5, 1),
			# its overshoot carrying it a touch under before it settles
			var e := MathX.bezier(0.3, 1.6, 0.5, 1.0, _pulse)
			var k := 1.0 + 0.14 * (1.0 - absf(e * 2.0 - 1.0)) if e <= 1.0 else 1.0 - 0.28 * (e - 1.0)
			_art.scale = Vector2(k, k)
		if _shine >= 0.0:
			_shine = fmod(_shine + dt, 3.2)
			_tile.p("sheen", _shine / 3.2)

	# (no box of its own: its tile is the art's)
	func _draw() -> void:
		pass


## The line a slot's track hangs on, running through the rarities' colours.
class _TrackLine:
	extends Control
	const STOPS := [[0.0, Color(1.0, 1.0, 1.0, 0.18)], [0.4, Color("#6cc8ff")], [0.6, Color("#c48bff")], [0.8, Color("#ffbe3d")], [1.0, Color("#ff5f9e")]]

	func _init(sz: Vector2) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = sz
		modulate.a = 0.35

	func _draw() -> void:
		for i in STOPS.size() - 1:
			var x0: float = STOPS[i][0] * size.x
			var x1: float = STOPS[i + 1][0] * size.x
			var c0: Color = STOPS[i][1]
			var c1: Color = STOPS[i + 1][1]
			draw_polygon(PackedVector2Array([Vector2(x0, 0.0), Vector2(x1, 0.0), Vector2(x1, size.y), Vector2(x0, size.y)]), PackedColorArray([c0, c1, c1, c0]))


## The card under a slot's track (the web's .sw-pinfo): the part's rarity
## and slot, its name, what it is, what it does for her, and whether she
## carries it or where it may be had; or what the standard fit is.
class _PartInfo:
	extends UiBox
	var _body: Control
	var _fade := 1.0

	func _init(w: float) -> void:
		super(Vector2(w, 40.0), 14.0 * MenuKit.PX, 2.0)
		MenuKit.flat(self)
		p("hi", 0.0).p("border", 1.0)
		_body = Control.new()
		_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_body)

	func show_standard(slot: String) -> void:
		_fill(Color(STANDARD, 0.5), "Standard fit", "Shipwright's %s" % str(Parts.SLOT_NAMES[slot]).to_lower(),
				"What she was built with. Find upgrades in chests and wrecks at sea, or buy them from the shipwright at a trading port.", [], "", false)

	## A part; `em` the line at its foot ("Fitted" in gold, or where to find it).
	func show_part(pt: Dictionary, slot: String, em: String, gold: bool) -> void:
		var r: Dictionary = Parts.RARITIES[int(pt.tier)]
		_fill(r.css, "%s · %s" % [r.name, Parts.SLOT_NAMES[slot]], str(pt.name), str(pt.blurb), Parts.stat_lines(pt.stats), em, gold)

	## Comes up from a touch low and faint (a part just tapped).
	func fade_in() -> void:
		_fade = 0.0
		tick(0.0)

	func tick(dt: float) -> void:
		if _fade >= 1.0:
			return
		_fade = minf(1.0, _fade + dt / 0.22)
		var k := 1.0 - (1.0 - _fade) * (1.0 - _fade)
		_body.modulate.a = lerpf(0.4, 1.0, k)
		_body.position.y = (1.0 - k) * 4.0 * MenuKit.PX

	func _fill(rc: Color, kicker: String, title: String, blurb: String, lines: Array, em: String, gold: bool) -> void:
		var px := MenuKit.PX
		for c in _body.get_children():
			_body.remove_child(c)
			c.queue_free()
		var w := size.x
		var iw := w - 24.0 * px
		var x := 12.0 * px
		p("c_top", Shipwright.css_mix(rc, 0.1, Color8(10, 30, 42, 204))).p("c_foot", Color8(4, 14, 22, 217)).p("c_border", Color(rc, rc.a * 0.25))
		var small := UiText.new([[kicker.to_upper(), HudStyle.font("inter", 800, roundi(0.14 * 9.5 * px)), roundi(9.5 * px), rc]], iw, 1.21)
		small.position = Vector2(x, 10.0 * px)
		_body.add_child(small)
		var b := UiText.new([[title, HudStyle.font("cinzel", 700), roundi(15.0 * px), HudStyle.INK]], iw, 1.2, true)
		b.position = Vector2(x, small.position.y + small.size.y + 2.0 * px)
		_body.add_child(b)
		var para := UiText.new([[blurb, HudStyle.font("inter", 500), roundi(12.0 * px), HudStyle.INK_2]], iw, 1.45, true)
		para.position = Vector2(x, b.position.y + b.size.y + 4.0 * px)
		_body.add_child(para)
		var y := para.position.y + para.size.y
		if not lines.is_empty():
			y += 8.0 * px
			var cx := 0.0
			var ch := 0.0
			for l: Array in lines:
				var chip := _chip(str(l[0]), bool(l[1]))
				if cx > 0.0 and cx + chip.size.x > iw:
					cx = 0.0
					y += ch + 5.0 * px
				chip.position = Vector2(x + cx, y)
				_body.add_child(chip)
				cx += chip.size.x + 5.0 * px
				ch = chip.size.y
			y += ch
		if em != "":
			y += 9.0 * px
			var e := UiText.new([[em.to_upper(), HudStyle.font("inter", 800, roundi(0.1 * 10.0 * px)), roundi(10.0 * px), HudStyle.GOLD_HI if gold else HudStyle.INK_3]], iw, 1.21)
			e.position = Vector2(x, y)
			_body.add_child(e)
			y += e.size.y
		resize(Vector2(w, y + 11.0 * px))

	## What a part does for her, in a pill: green for the better, red for the worse.
	func _chip(text: String, bad: bool) -> UiBox:
		var px := MenuKit.PX
		var t := MenuKit.words(text, "inter", 700, 10.5 * px, Color("#ffd3cc") if bad else Color("#dff8d8"), 0.0, 1.21)
		var c := UiBox.new(t.size + Vector2(16.0, 6.0) * px, 99.0, 2.0)
		MenuKit.flat(c)
		var fill := Color8(255, 117, 99, 33) if bad else Color8(120, 220, 140, 33)
		c.p("c_top", fill).p("c_foot", fill).p("hi", 0.0).p("c_border", Color8(255, 117, 99, 71) if bad else Color8(120, 220, 140, 64))
		t.position = Vector2(8.0, 3.0) * px
		c.add_child(t)
		return c
