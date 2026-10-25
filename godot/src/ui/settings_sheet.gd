class_name SettingsSheet
extends CanvasLayer
## Settings, on a sheet over whatever opened it (the harbour or the paused
## voyage), laid out as the web lays it out on a phone held sideways: the
## sound (its switch, the volumes and the music's own switch), the frame
## counter, and how hard the camera shakes. A change applies at once and is
## kept (Settings). The sheet scrolls under a finger (or the wheel); a volume
## slider takes a finger that moves along it or taps it, and lets one that
## moves up or down scroll the sheet instead.

signal closed
signal clicked
## Game updates, tapped: the update card (UpdateCard).
signal updates
## Quit to desktop, tapped (the desktop game).
signal quit

## The rows: [kind, the Settings field, title, line(, the choices)].
const GROUPS := [
	["SOUND", [
		["switch", "sound", "Sound", "Every sound in the game"],
		["slider", "master", "Master volume", "Everything at once"],
		["slider", "music", "Music", "The harbour theme and the songs at sea"],
		["slider", "sfx", "Effects", "Cannons, splinters, thunder and the crew"],
		["slider", "ambience", "Ambience", "Surf, wind and rain"],
		["switch", "music_on", "Play music", "Off leaves the sea, the wind and the ship to themselves"],
	]],
	["GRAPHICS", [
		["switch", "fps", "Frame counter", "Show frames per second at the top of the screen"],
	]],
	["INTERFACE", [
		["seg", "shake", "Camera shake", "From cannon fire, rams and treasure", [[1.0, "Full"], [0.4, "Gentle"], [0.0, "Off"]]],
	]],
]

## On a computer: the window's switch, the keys, and the way out.
const DESKTOP_GRAPHICS := ["switch", "fullscreen", "Full screen", "Or a window you can size as you like (F11 or Alt+Enter switches too)"]
const DESKTOP_INTERFACE := ["seg", "ui_size", "Interface size", "The menus and the HUD, for your screen", [[0.86, "Compact"], [1.0, "Normal"], [1.16, "Large"]]]
const KEYS := [
	["keys", "", "At the helm", "A / D or the arrows steer · W / S set more or less sail · Shift runs ashore · Space jumps"],
	["keys", "", "The guns", "Q / E fire port / starboard · Space fires the side that bears · click the sea to aim · 1 to 5 load a shot, R the next"],
	["keys", "", "Around the sea", "M the sea chart · F come alongside a quay · C or V the camera · the wheel zooms · Esc pauses"],
]

## The game's updates (on the Android and Windows games: the GAME group's row shows them).
var updater: Updater

var _root: Control
var _back: ShaderMaterial
var _holder: Control
var _sheet: UiBox
var _close: UiButton
var _body: Control
var _content: Control
var _switches: Array[_Switch] = []
var _sliders: Array[_Slider] = []
var _segs: Array = []
var _buttons: Array[UiButton] = []
var _reveal := MenuKit.Reveal.new()
var _t := 0.0
## The scroll (units down the content), how far it can go, and its fling (units/s).
var _scroll := 0.0
var _scroll_max := 0.0
var _fling := 0.0
## A finger or the mouse down on the body: where, and whether it's scrolling
## ("scroll"), working a slider ("slide") or not yet decided ("").
var _down := false
var _from := Vector2.ZERO
var _last := Vector2.ZERO
var _last_ms := 0
var _mode := ""
var _grab: _Slider


func _ready() -> void:
	layer = 9
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_root)
	visible = false
	set_process(false)
	get_viewport().size_changed.connect(func() -> void:
		if visible:
			_build())


func open() -> void:
	_t = 0.0
	_scroll = 0.0
	_fling = 0.0
	visible = true
	_build()
	set_process(true)


func close() -> void:
	if not visible:
		return
	for b in _buttons:
		b.cancel()
	_release()
	visible = false
	set_process(false)
	closed.emit()


func is_open() -> bool:
	return visible


## The back button: the sheet closes.
func go_back() -> bool:
	if not visible:
		return false
	clicked.emit()
	close()
	return true


func _build() -> void:
	for c in _root.get_children():
		_root.remove_child(c)
		c.queue_free()
	_switches.clear()
	_sliders.clear()
	_segs.clear()
	_buttons.clear()
	_reveal.clear()
	var vp := get_viewport().get_visible_rect().size
	_root.size = vp
	var u := MenuKit.U
	var t := MenuKit.T
	var px := MenuKit.PX
	var mx := vp.x * 0.03
	var my := vp.y * 0.03
	# whatever is behind, dimmed and frosted
	var glass := ColorRect.new()
	glass.size = vp
	glass.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_back = ShaderMaterial.new()
	_back.shader = preload("res://shaders/menu_blur.gdshader")
	_back.set_shader_parameter("lod", PauseScreen._blur_lod(10.0 * u))
	_back.set_shader_parameter("saturate", 1.15)
	_back.set_shader_parameter("rad", Vector4(0.5, 0.4, 1.2, 0.9))
	_back.set_shader_parameter("rad_in", Color8(3, 14, 22, 107))
	_back.set_shader_parameter("rad_out", Color8(2, 10, 16, 199))
	_back.set_shader_parameter("fade", 0.0)
	glass.material = _back
	_root.add_child(glass)
	# the sheet: as wide as it may be, as tall as its rows (up to the screen)
	var w := minf(760.0 * u, vp.x - mx * 2.0)
	var head_h := 12.0 * u + 38.0 * u + 10.0 * u
	_content = Control.new()
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var inner := w - 16.0 * u - 20.0 * u
	var y := 12.0 * u
	var groups: Array = GROUPS.duplicate(true)
	var game_rows := []
	if updater != null and updater.enabled:
		game_rows.append(["update", "", "Game updates", _update_line()])
	if Settings.desktop:
		(groups[1][1] as Array).append(DESKTOP_GRAPHICS)
		(groups[2][1] as Array).push_front(DESKTOP_INTERFACE)
		groups.append(["KEYS", KEYS])
		game_rows.append(["quit", "", "Quit to desktop", "Everything you've won is kept"])
	if not game_rows.is_empty():
		groups.append(["GAME", game_rows])
	for g: Array in groups:
		var h4 := MenuKit.words(str(g[0]), "inter", 700, 11.0 * t, HudStyle.AQUA, 0.22, 1.21)
		h4.position = Vector2(20.0 * u + 2.0, y)
		_content.add_child(h4)
		y += h4.size.y + 8.0 * u
		for r: Array in g[1]:
			var row := _row(r, inner)
			row.position = Vector2(20.0 * u, y)
			_content.add_child(row)
			y += row.size.y + 4.0 * u
		y += 14.0 * u - 4.0 * u
	var content_h := y - 14.0 * u + 4.0 * u + 16.0 * u - 4.0 * u
	_content.size = Vector2(w, content_h)
	var h := minf(head_h + content_h, vp.y - my * 2.0)
	_holder = Control.new()
	_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_holder.size = Vector2(w, h)
	_holder.position = (vp - _holder.size) * 0.5
	_holder.pivot_offset = _holder.size * 0.5
	_root.add_child(_holder)
	_sheet = UiBox.new(Vector2(w, h), 22.0 * u, 110.0 * u)
	_sheet.p("c_top", Color8(16, 40, 54, 214)).p("c_foot", Color8(6, 20, 30, 240)).p("c_border", HudStyle.STROKE)
	_sheet.p("c_shadow", Color(0.0, 0.0, 0.0, 0.5)).p("shadow", Vector2(40.0, 110.0) * u)
	_holder.add_child(_sheet)
	# the head: its title, the close, a hairline under them
	var title := MenuKit.words("Settings", "inter", 800, 22.0 * t, HudStyle.INK, -0.025, 1.02)
	MenuKit.line_at(title, 20.0 * u, 12.0 * u, 38.0 * u)
	_sheet.add_child(title)
	_close = MenuKit.round("close", 38.0 * u, 16.0 * u, false)
	_close.position = Vector2(w - 14.0 * u - 38.0 * u, 12.0 * u)
	_close.pressed.connect(func() -> void: go_back())
	_sheet.add_child(_close)
	_buttons.append(_close)
	var hair := MenuKit.rule(w, Color(1.0, 1.0, 1.0, 0.07))
	hair.position = Vector2(0.0, head_h - hair.size.y)
	_sheet.add_child(hair)
	# the body: the rows, scrolling under a finger, clipped to the sheet
	_body = Control.new()
	_body.clip_contents = true
	_body.mouse_filter = Control.MOUSE_FILTER_STOP
	_body.position = Vector2(0.0, head_h)
	_body.size = Vector2(w, h - head_h)
	_body.gui_input.connect(_on_body)
	_body.add_child(_content)
	_sheet.add_child(_body)
	_scroll_max = maxf(0.0, content_h - _body.size.y)
	_scroll = clampf(_scroll, 0.0, _scroll_max)
	_reveal.add(_holder, MenuKit.POP, 0.0, 0.45, 12.0 * px)
	_sync()
	_step(0.0)


## Keys go no further while it's up: the screen under it would take them.
func _unhandled_input(event: InputEvent) -> void:
	if visible and event is InputEventKey:
		get_viewport().set_input_as_handled()


## A row: its title and line on the left, its switch, slider or choices on the right.
func _row(r: Array, w: float) -> UiBox:
	var u := MenuKit.U
	var t := MenuKit.T
	var kind := str(r[0])
	var key := str(r[1])
	var ctl: Control
	match kind:
		"switch":
			ctl = _Switch.new(key)
			_switches.append(ctl)
		"slider":
			ctl = _Slider.new(key)
			_sliders.append(ctl)
		"update":
			ctl = _update_tag()
		"quit":
			ctl = _tag("close", "Quit", false)
		"keys":
			ctl = Control.new()
			ctl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_:
			ctl = _seg(key, r[4])
	var pad_l := 16.0 * u
	var pad_r := 10.0 * u
	var tw := w - pad_l - pad_r - ctl.size.x - 18.0 * u
	var b := MenuKit.words(str(r[2]), "inter", 700, 15.0 * t, HudStyle.INK, 0.0, 1.21)
	var small := UiText.new([[str(r[3]), HudStyle.font("inter", 500), roundi(12.5 * t), HudStyle.INK_3]], tw, 1.4)
	var text_h := b.size.y + 3.0 * u + small.size.y
	var h := maxf(64.0 * u, 16.0 * u + maxf(text_h, ctl.size.y))
	var row: UiBox
	if kind == "switch" or kind == "update" or kind == "quit":
		var btn := UiButton.new(Vector2(w, h), 18.0 * u, 4.0)
		btn.squeeze = 0.99
		if kind == "update":
			btn.pressed.connect(func() -> void:
				clicked.emit()
				updates.emit())
		elif kind == "quit":
			btn.pressed.connect(func() -> void:
				clicked.emit()
				quit.emit())
		else:
			btn.pressed.connect(func() -> void: _toggle(key))
		_buttons.append(btn)
		row = btn
	else:
		row = UiBox.new(Vector2(w, h), 18.0 * u, 4.0)
	MenuKit.flat(row)
	row.p("c_top", Color(1.0, 1.0, 1.0, 0.045)).p("c_foot", Color(1.0, 1.0, 1.0, 0.045)).p("c_border", Color(1.0, 1.0, 1.0, 0.05)).p("hi", 0.0)
	b.position = Vector2(pad_l, (h - text_h) * 0.5)
	small.position = Vector2(pad_l, b.position.y + b.size.y + 3.0 * u)
	ctl.position = Vector2(w - pad_r - ctl.size.x, (h - ctl.size.y) * 0.5)
	for n: Control in [b, small, ctl]:
		row.add_child(n)
	return row


## The Game updates row's line: this build, and what's newer.
func _update_line() -> String:
	var v := "Version " + updater.installed
	if updater.available():
		return v + " · " + str(updater.latest.name) + " is out"
	if updater.state == Updater.CURRENT:
		return v + " · the newest build"
	return v + " · tap to look for a newer one"


## Its tag on the right: Update in gilt when there's one, else Check.
func _update_tag() -> UiBox:
	var on := updater.available()
	return _tag("download" if on else "refresh", "Update" if on else "Check now", on)


## A row's tag: an icon and a word in a pill, gilt when `on`.
func _tag(icon: String, word: String, on: bool) -> UiBox:
	var u := MenuKit.U
	var t := MenuKit.T
	var tt := MenuKit.words(word, "inter", 700, 12.5 * t, HudStyle.GOLD_INK if on else HudStyle.INK)
	var ic := Icons.rect(icon, 15.0 * u, HudStyle.GOLD_INK if on else HudStyle.INK_2)
	var bh := 34.0 * u
	var box := UiBox.new(Vector2(14.0 * u + ic.size.x + 7.0 * u + tt.size.x + 16.0 * u, bh), bh * 0.5, 20.0 * u)
	if on:
		HudStyle.gold(box, u * 0.6)
	else:
		MenuKit.flat(box)
		box.p("c_top", Color(1.0, 1.0, 1.0, 0.08)).p("c_foot", Color(1.0, 1.0, 1.0, 0.08)).p("c_border", Color(1.0, 1.0, 1.0, 0.1)).p("hi", 0.0)
	ic.position = Vector2(14.0 * u, (bh - ic.size.y) * 0.5)
	MenuKit.line_at(tt, ic.position.x + ic.size.x + 7.0 * u, 0.0, bh)
	box.add_child(ic)
	box.add_child(tt)
	return box


## Choices in a pill, the chosen one lit white.
func _seg(key: String, opts: Array) -> Control:
	var u := MenuKit.U
	var t := MenuKit.T
	var box := UiBox.new(Vector2(10.0, 10.0), 999.0, 4.0)
	MenuKit.flat(box)
	box.p("c_top", Color(0.0, 0.0, 0.0, 0.25)).p("c_foot", Color(0.0, 0.0, 0.0, 0.25)).p("c_border", Color(1.0, 1.0, 1.0, 0.07)).p("hi", 0.0)
	var x := 3.0 * u
	var bh := 34.0 * u
	var btns: Array = []
	for o: Array in opts:
		var tt := MenuKit.words(str(o[1]), "inter", 700, 12.5 * t, Color.WHITE)
		var bw := tt.size.x + 28.0 * u
		var btn := UiButton.new(Vector2(bw, bh), bh * 0.5, 24.0 * u)
		btn.squeeze = 0.96
		btn.p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.25)).p("shadow", Vector2(4.0, 14.0) * u)
		MenuKit.line_at(tt, 14.0 * u, 0.0, bh)
		btn.add_child(tt)
		btn.position = Vector2(x, 3.0 * u)
		var v: float = o[0]
		btn.pressed.connect(func() -> void: _choose(key, v))
		box.add_child(btn)
		_buttons.append(btn)
		btns.append([btn, tt, v])
		x += bw
	box.resize(Vector2(x + 3.0 * u, bh + 6.0 * u))
	_segs.append([key, btns])
	return box


func _toggle(key: String) -> void:
	clicked.emit()
	if key == "fullscreen":
		Settings.set_fullscreen(not Settings.fullscreen)
		_sync()
		return
	Settings.set(key, not bool(Settings.get(key)))
	_apply(true)


func _choose(key: String, v: float) -> void:
	clicked.emit()
	if key == "ui_size":
		# the canvas resizes, and the sheet is rebuilt at the new size
		Settings.set_ui_size(v)
		return
	Settings.set(key, v)
	_apply(true)


## Applies what changed (the sound hears it at once), kept when `keep`.
func _apply(keep: bool) -> void:
	Settings.changed.emit()
	if keep:
		Settings.save()
	_sync()


## Every control showing what Settings holds.
func _sync() -> void:
	for s in _switches:
		s.on = bool(Settings.get(s.key))
	for s in _sliders:
		s.set_value(float(Settings.get(s.key)))
	for seg: Array in _segs:
		var v := float(Settings.get(str(seg[0])))
		var best := 0
		var opts: Array = seg[1]
		for i in opts.size():
			if absf(float(opts[i][2]) - v) < absf(float(opts[best][2]) - v):
				best = i
		for i in opts.size():
			var btn: UiButton = opts[i][0]
			var tt: UiText = opts[i][1]
			var sel := i == best
			var fill := Color("#f4f8f9") if sel else Color(1.0, 1.0, 1.0, 0.0)
			btn.p("c_top", fill).p("c_foot", fill).p("c_shadow", Color(0.0, 0.0, 0.0, 0.25 if sel else 0.0))
			tt.modulate = Color("#0a1c26") if sel else HudStyle.INK_2


func _process(dt: float) -> void:
	_t += dt
	if not _down and absf(_fling) > 1.0:
		_scroll_to(_scroll + _fling * dt)
		_fling *= exp(-4.0 * dt)
	_step(dt)


func _step(dt: float) -> void:
	_back.set_shader_parameter("fade", clampf(_t / 0.35, 0.0, 1.0))
	_reveal.step(_t)
	for s in _switches:
		s.tick(dt)
	for s in _sliders:
		s.tick(dt)


func _scroll_to(s: float) -> void:
	_scroll = clampf(s, 0.0, _scroll_max)
	if _scroll <= 0.0 or _scroll >= _scroll_max:
		_fling = 0.0
	_content.position.y = -_scroll


## The body under a finger or the mouse: a drag up or down scrolls it, one
## along a slider (or a tap on it) sets its volume.
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
	if touch or click:
		if event.pressed:
			_down = true
			_from = event.position
			_last = event.position
			_last_ms = Time.get_ticks_msec()
			_mode = ""
			_fling = 0.0
			_grab = _slider_at(event.position)
		elif _down:
			if _mode == "" and _grab != null:
				# a tap on a slider sets it there
				_slide_to(event.position)
				_mode = "slide"
			if _mode == "slide":
				Settings.save()
				clicked.emit()
			_release()
		return
	var moved := event is InputEventScreenDrag or (event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION)
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
		_slide_to(event.position)
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


## The slider under a point of the body, if any.
func _slider_at(at: Vector2) -> _Slider:
	var c := at + Vector2(0.0, _scroll)
	for s in _sliders:
		var r := Rect2(_content.get_global_transform().affine_inverse() * s.get_global_position(), s.size)
		if r.grow(6.0 * MenuKit.U).has_point(c):
			return s
	return null


func _slide_to(at: Vector2) -> void:
	var s := _grab
	var c := at + Vector2(0.0, _scroll)
	var x0 := (_content.get_global_transform().affine_inverse() * s.get_global_position()).x + s.track.x
	var v := clampf((c.x - x0) / s.track.y, 0.0, 1.0)
	v = roundf(v * 100.0) / 100.0
	if absf(v - float(Settings.get(s.key))) > 1e-4:
		Settings.set(s.key, v)
		_apply(false)


## A switch: a pill that turns teal, its knob springing across.
class _Switch:
	extends Control
	var key := ""
	var on := false
	var _k := -1.0
	var _track: UiBox
	var _knob: UiBox

	func _init(p_key: String) -> void:
		key = p_key
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var u := MenuKit.U
		size = Vector2(50.0, 30.0) * u
		_track = UiBox.new(size, size.y * 0.5, 2.0)
		MenuKit.flat(_track)
		_track.p("hi", 0.0).p("c_border", Color(1.0, 1.0, 1.0, 0.08))
		add_child(_track)
		_knob = UiBox.new(Vector2(24.0, 24.0) * u, 12.0 * u, 12.0 * u)
		_knob.p("c_top", Color.WHITE).p("c_foot", Color.WHITE).p("border", 0.0).p("hi", 0.0)
		_knob.p("c_shadow", Color(0.0, 0.0, 0.0, 0.3)).p("shadow", Vector2(3.0, 8.0) * u)
		add_child(_knob)

	func tick(dt: float) -> void:
		var want := 1.0 if on else 0.0
		if _k < 0.0:
			_k = want
		_k = move_toward(_k, want, dt / 0.3)
		var e := HudStyle.spring(_k if on else 1.0 - _k)
		var x := e if on else 1.0 - e
		var u := MenuKit.U
		_knob.position = Vector2(3.0 * u + 20.0 * u * x, 3.0 * u)
		var c := clampf(_k, 0.0, 1.0)
		_track.p("c_top", Color(1.0, 1.0, 1.0, 0.14).lerp(Color("#6ff0e1"), c)).p("c_foot", Color(1.0, 1.0, 1.0, 0.14).lerp(Color("#22b3a8"), c))


## A volume: a white bar along a dark track, a thumb (gold and a little
## bigger while held) and the number beside it.
class _Slider:
	extends Control
	var key := ""
	var held := false
	## The track's left (units, in the slider) and its length.
	var track := Vector2.ZERO
	var _v := 0.0
	var _out: UiText
	var _thumb: UiBox
	var _s := 1.0

	func _init(p_key: String) -> void:
		key = p_key
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var px := MenuKit.PX
		size = Vector2(220.0, 34.0) * px
		track = Vector2(10.0 * px, size.x - 12.0 * px - 30.0 * px - 20.0 * px)
		var out := MenuKit.words("100", "inter", 700, 12.5 * px, HudStyle.INK_2)
		out.runs[0][1] = HudStyle.tnum(out.runs[0][1])
		out.set_runs(out.runs)
		out.align = HORIZONTAL_ALIGNMENT_RIGHT
		out.fit(30.0 * px)
		out.position = Vector2(size.x - 30.0 * px, (size.y - out.size.y) * 0.5)
		_out = out
		add_child(out)
		_thumb = UiBox.new(Vector2(20.0, 20.0) * px, 10.0 * px, 14.0 * px)
		_thumb.p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.35)).p("shadow", Vector2(3.0, 10.0) * px)
		_thumb.pivot_offset = _thumb.size * 0.5
		add_child(_thumb)

	func set_value(v: float) -> void:
		_v = clampf(v, 0.0, 1.0)
		_out.set_text(str(roundi(_v * 100.0)))
		queue_redraw()

	func tick(dt: float) -> void:
		_s = move_toward(_s, 1.18 if held else 1.0, dt / 0.15)
		var c := HudStyle.GOLD if held else Color("#f4f8f9")
		_thumb.p("c_top", c).p("c_foot", c)
		_thumb.scale = Vector2(_s, _s)
		var px := MenuKit.PX
		_thumb.position = Vector2(track.x + track.y * _v - 10.0 * px, (size.y - 20.0 * px) * 0.5)

	func _draw() -> void:
		var px := MenuKit.PX
		var h := 6.0 * px
		var y := (size.y - h) * 0.5
		var r := Rect2(track.x, y, track.y, h)
		var sb := StyleBoxFlat.new()
		sb.set_corner_radius_all(int(ceilf(h * 0.5)))
		sb.anti_aliasing = true
		sb.bg_color = Color(0.0, 0.0, 0.0, 0.3)
		draw_style_box(sb, r)
		if _v > 0.0:
			sb.bg_color = Color("#f4f8f9")
			draw_style_box(sb, Rect2(r.position, Vector2(maxf(h, r.size.x * _v), h)))
