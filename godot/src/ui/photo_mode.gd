class_name PhotoMode
extends CanvasLayer
## Photo mode (the web game's ui/photo.ts): the voyage holds its breath,
## every bit of HUD steps aside and a free camera (PhotoCam) roams the frozen
## scene. A card down the right sets the lens, the sky and a film look; one
## tap on the scene hides even that; the shutter saves a picture. Drag to
## orbit, two fingers (or the right mouse button) to pan, pinch or the wheel
## to zoom, a double tap to focus; on a keyboard WASD, Q and E move, [ and ]
## roll, F flies, H hides, R resets, Space takes the shot, Esc or P leaves.

signal closed
signal shutter
## The sky picked: an hour and a weather (&"" the weather as it was).
signal scene(hour: float, weather: StringName)
signal clicked

const FILTERS := [
	{"name": "Natural", "sat": 1.0, "con": 1.0, "fade": 0.0, "grain": 0.0, "vig": 0.0, "tint": Vector3(1, 1, 1), "mono": Vector3(1, 1, 1), "amt": 0.0},
	{"name": "Vivid", "sat": 1.32, "con": 1.12, "fade": 0.0, "grain": 0.0, "vig": 0.12, "tint": Vector3(1.01, 1, 0.99), "mono": Vector3(1, 1, 1), "amt": 0.0},
	{"name": "Golden", "sat": 1.12, "con": 1.06, "fade": 0.06, "grain": 0.0, "vig": 0.18, "tint": Vector3(1.1, 1, 0.82), "mono": Vector3(1, 1, 1), "amt": 0.0},
	{"name": "Lagoon", "sat": 1.18, "con": 1.04, "fade": 0.04, "grain": 0.0, "vig": 0.1, "tint": Vector3(0.9, 1.04, 1.07), "mono": Vector3(1, 1, 1), "amt": 0.0},
	{"name": "Moonlit", "sat": 0.72, "con": 1.1, "fade": 0.08, "grain": 0.012, "vig": 0.3, "tint": Vector3(0.8, 0.93, 1.18), "mono": Vector3(1, 1, 1), "amt": 0.0},
	{"name": "Faded film", "sat": 0.86, "con": 0.94, "fade": 0.32, "grain": 0.03, "vig": 0.22, "tint": Vector3(1.05, 1, 0.92), "mono": Vector3(1, 1, 1), "amt": 0.0},
	{"name": "Noir", "sat": 1.0, "con": 1.34, "fade": 0.0, "grain": 0.03, "vig": 0.42, "tint": Vector3(1, 1, 1), "mono": Vector3(1, 1, 1), "amt": 1.0},
	{"name": "Old chart", "sat": 1.0, "con": 1.08, "fade": 0.2, "grain": 0.035, "vig": 0.4, "tint": Vector3(1, 1, 1), "mono": Vector3(1.12, 0.95, 0.72), "amt": 1.0},
]
const FRAMES := [["Full", 0.0], ["16:9", 16.0 / 9.0], ["3:2", 1.5], ["1:1", 1.0], ["4:5", 0.8], ["9:16", 9.0 / 16.0], ["Cinema", 2.39]]
const WEATHERS: Array[StringName] = [&"", &"clear", &"fair", &"cloudy", &"mist", &"rain", &"storm", &"calm", &"hot", &"embers", &"glow"]
const TABS := [["camera", "Camera"], ["scene", "Sky"], ["lens", "Lens"], ["filter", "Filter"]]
const U := MenuKit.U

var cam := PhotoCam.new()
var active := false
## Opened from the pause menu (it goes back there), or straight from the helm.
var from_pause := false
var hour := 12.0
var weather := &""
var dof := 0.0
## Manual focus (m), or 0: whatever sits mid-frame (auto_focus, kept by the game).
var focus := 0.0
var auto_focus := 60.0
var exposure := 0.0
## The depth (m) of whatever is under a screen point, or -1 for open sky.
var pick_at := func(_p: Vector2) -> float: return -1.0
var touch := false

var _filter := 0
var _strength := 1.0
var _vignette := 0.0
var _grain := 0.0
var _frame := 0
var _grid := false
var _tab := "camera"
var _bare := false
var _bare_k := 0.0
## The shutter's frame is being drawn: nothing but the picture.
var _shooting := false

var _root: Control
var _look: ColorRect
var _mask: _Mask
var _chrome: Control
var _card: UiBox
var _body: Control
var _tabs := {}
var _modes := {}
var _flash: ColorRect
var _flash_t := 1.0
var _saved: UiBox
var _saved_t := 0.0
var _sliders := {}
var _keys := {}
var _ptrs := {}
var _down := {"at": Vector2.ZERO, "t": 0, "moved": false, "button": 0}
var _last_tap := {"at": Vector2.ZERO, "t": 0}
var _tap_t := -1.0


func _init() -> void:
	layer = 40
	visible = false


func _ready() -> void:
	set_process(false)


# ------------------------------------------------------------------ open & close

## Takes the camera over from `game_cam`, circling `anchor` (her ship) at `p_hour`.
func open(game_cam: Camera3D, anchor: Vector3, p_hour: float, p_from_pause: bool) -> void:
	active = true
	from_pause = p_from_pause
	cam.anchor = anchor
	cam.fly = false
	cam.begin(game_cam, anchor.y)
	hour = p_hour
	weather = &""
	focus = 0.0
	auto_focus = cam.shown_dist()
	_keys.clear()
	_ptrs.clear()
	_bare = false
	_bare_k = 0.0
	_build()
	visible = true
	set_process(true)


func close() -> void:
	active = false
	visible = false
	set_process(false)


## Android's back (or Esc) closes it.
func go_back() -> bool:
	if not active:
		return false
	closed.emit()
	return true


## The film look's uniforms, and how much light the lens lets in.
func look() -> Dictionary:
	var f: Dictionary = FILTERS[_filter]
	var s := _strength
	return {
		"saturation": lerpf(1.0, f.sat, s), "contrast": lerpf(1.0, f.con, s), "fade": float(f.fade) * s,
		"grain": float(f.grain) * s + _grain * 0.09, "vignette": float(f.vig) * s + _vignette * 1.1,
		"tint": Vector3.ONE.lerp(f.tint, s), "mono": f.mono, "mono_amount": float(f.amt) * s,
	}


## The shot's crop, in pixels of the screen (the frame ratio's window).
func crop(vp: Vector2) -> Rect2:
	var a: float = FRAMES[_frame][1]
	if a <= 0.0:
		return Rect2(Vector2.ZERO, vp)
	if a > vp.x / vp.y:
		var h := vp.x / a
		return Rect2(0.0, (vp.y - h) * 0.5, vp.x, h)
	var w := vp.y * a
	return Rect2((vp.x - w) * 0.5, 0.0, w, vp.y)


## The aperture for the lens's blur (0 none).
func aperture() -> float:
	return pow(dof, 1.4) if dof > 0.0 else 0.0


## Hides everything but the picture (and its film look), for the shutter.
func chrome(on: bool) -> void:
	_shooting = not on
	_chrome.visible = on and _bare_k < 0.999
	if _saved != null:
		_saved.visible = on
	_mask.shooting = not on
	_mask.queue_redraw()


## For the debug flags: a tab shown, a filter and a frame picked, the grid on.
func stage(tab: String, filter: int, frame: int, grid: bool) -> void:
	_filter = clampi(filter, 0, FILTERS.size() - 1)
	_frame = clampi(frame, 0, FRAMES.size() - 1)
	_grid = grid
	_show_tab(tab if TABS.any(func(t: Array) -> bool: return t[0] == tab) else "camera")
	_mask.queue_redraw()


## The shutter fired: a white blink.
func flash() -> void:
	_flash_t = 0.0


## The shot taken: its thumbnail slides in with where it went.
func saved(img: Image, title: String, line: String) -> void:
	if _saved != null:
		_saved.queue_free()
	var h := 54.0 * U
	var tw := h * img.get_width() / maxf(1.0, img.get_height())
	tw = clampf(tw, h * 0.5, h * 2.0)
	var t1 := MenuKit.words(title, "inter", 700, 12.5 * U, HudStyle.INK)
	var t2 := MenuKit.words(line, "inter", 500, 10.5 * U, HudStyle.INK_2)
	var w := 8.0 * U + tw + 10.0 * U + maxf(t1.size.x, t2.size.x) + 14.0 * U
	var box := UiBox.new(Vector2(w, h + 16.0 * U), 14.0 * U, 30.0 * U)
	MenuKit.glass(box, HudStyle.PANEL)
	var thumb := TextureRect.new()
	var small := img.duplicate() as Image
	small.resize(maxi(8, roundi(tw * 2.0)), maxi(8, roundi(h * 2.0)), Image.INTERPOLATE_BILINEAR)
	thumb.texture = ImageTexture.create_from_image(small)
	thumb.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	thumb.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	thumb.size = Vector2(tw, h)
	thumb.position = Vector2(8.0 * U, 8.0 * U)
	box.add_child(thumb)
	t1.position = Vector2(8.0 * U + tw + 10.0 * U, 8.0 * U + h * 0.5 - t1.size.y)
	t2.position = Vector2(t1.position.x, 8.0 * U + h * 0.5 + 2.0 * U)
	box.add_child(t1)
	box.add_child(t2)
	var vp := _root.size
	box.position = Vector2(vp.x * 0.03, vp.y - vp.y * 0.03 - box.size.y - 70.0 * U)
	_root.add_child(box)
	_saved = box
	_saved_t = 0.0


# ------------------------------------------------------------------ per frame

func _process(dt: float) -> void:
	if not active:
		return
	var x := _axis(KEY_D, KEY_A) + _axis(KEY_RIGHT, KEY_LEFT)
	var z := _axis(KEY_W, KEY_S) + _axis(KEY_UP, KEY_DOWN)
	var y := _axis(KEY_E, KEY_Q)
	cam.move(dt, signf(x), y, signf(z), _keys.has(KEY_SHIFT))
	var r := _axis(KEY_BRACKETRIGHT, KEY_BRACKETLEFT)
	if r != 0.0:
		cam.roll = clampf(cam.roll + r * 40.0 * dt, -45.0, 45.0)
		_set_slider("roll", cam.roll)
	# the film look on the frame below the controls
	var l := look()
	var m := _look.material as ShaderMaterial
	for k: String in l:
		m.set_shader_parameter(k, l[k])
	m.set_shader_parameter("seed", fmod(Time.get_ticks_msec() * 0.001, 100.0))
	# the controls fade away (a tap on the scene), and a single tap waits to see if a second follows
	_bare_k = move_toward(_bare_k, 1.0 if _bare else 0.0, dt / 0.25)
	_chrome.modulate.a = 1.0 - _bare_k
	_chrome.visible = _bare_k < 0.999 and not _shooting
	if _tap_t >= 0.0:
		_tap_t += dt
		if _tap_t > 0.3:
			_tap_t = -1.0
			_bare = not _bare
	if _flash_t < 1.0:
		_flash_t = minf(1.0, _flash_t + dt / 0.45)
		_flash.color.a = (1.0 - _flash_t) * 0.85
	if _saved != null:
		_saved_t += dt
		var k := minf(1.0, _saved_t / 0.35)
		var out := clampf((_saved_t - 4.2) / 0.4, 0.0, 1.0)
		_saved.modulate.a = k * (1.0 - out)
		if out >= 1.0:
			_saved.queue_free()
			_saved = null


func _axis(a: Key, b: Key) -> float:
	return (1.0 if _keys.has(a) else 0.0) - (1.0 if _keys.has(b) else 0.0)


# ------------------------------------------------------------------ the controls

func _build() -> void:
	for c in get_children():
		remove_child(c)
		c.queue_free()
	_tabs.clear()
	_modes.clear()
	_saved = null
	var vp := get_viewport().get_visible_rect().size
	_root = Control.new()
	_root.size = vp
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	# the film look over the frame (it reads the screen as drawn so far)
	_look = ColorRect.new()
	_look.size = vp
	_look.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var lm := ShaderMaterial.new()
	lm.shader = preload("res://shaders/photo_look.gdshader")
	_look.material = lm
	_root.add_child(_look)
	# the scene: where drags turn the camera
	var sc := Control.new()
	sc.size = vp
	sc.mouse_filter = Control.MOUSE_FILTER_STOP
	sc.gui_input.connect(_on_scene)
	_root.add_child(sc)
	_mask = _Mask.new(self)
	_mask.size = vp
	_root.add_child(_mask)
	_chrome = Control.new()
	_chrome.size = vp
	_chrome.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_chrome)
	var mx := vp.x * 0.03
	var my := vp.y * 0.03
	# the title and how to work it, top left
	var kick := HBoxContainer.new()
	kick.add_theme_constant_override("separation", roundi(6.0 * U))
	kick.mouse_filter = Control.MOUSE_FILTER_IGNORE
	kick.add_child(Icons.rect("camera", 15.0 * U, HudStyle.GOLD))
	kick.add_child(HudStyle.label("PHOTO MODE", "inter", 700, roundi(10.0 * U), HudStyle.GOLD, roundi(10.0 * U * 0.2)))
	kick.position = Vector2(mx, my)
	kick.size = kick.get_combined_minimum_size()
	_chrome.add_child(kick)
	var hint := "Drag to orbit · two fingers pan and zoom · double-tap to focus · tap to hide" if touch else "Drag to orbit · right drag to pan · wheel to zoom · WASD, Q, E to move · [ ] roll · double-click to focus"
	var hl := MenuKit.words(hint, "inter", 500, 10.5 * U, HudStyle.INK_2)
	hl.halo = Color(0.0, 0.0, 0.0, 0.35)
	hl.position = Vector2(mx, my + kick.size.y + 4.0 * U)
	_chrome.add_child(hl)
	# hide and leave, top right
	var d := 36.0 * U
	var close_b := MenuKit.round("close", d, 16.0 * U)
	close_b.position = Vector2(vp.x - mx - d, my)
	close_b.pressed.connect(func() -> void:
		clicked.emit()
		closed.emit())
	_chrome.add_child(close_b)
	var hide_b := MenuKit.round("eye_off", d, 16.0 * U)
	hide_b.position = Vector2(vp.x - mx - d * 2.0 - 8.0 * U, my)
	hide_b.pressed.connect(func() -> void:
		clicked.emit()
		_bare = true)
	_chrome.add_child(hide_b)
	# the card down the right
	var cw := minf(286.0 * U, vp.x * 0.42)
	_card = UiBox.new(Vector2(cw, 100.0), 18.0 * U, 40.0 * U)
	MenuKit.glass(_card, HudStyle.PANEL)
	_card.mouse_filter = Control.MOUSE_FILTER_STOP
	_card.position = Vector2(vp.x - mx - cw, my + d + 10.0 * U)
	_chrome.add_child(_card)
	var tx := 10.0 * U
	var tw := (cw - 20.0 * U - 3.0 * 4.0 * U) / 4.0
	for t: Array in TABS:
		var b := _pill(str(t[1]), tw, 28.0 * U, 11.0 * U)
		b.position = Vector2(tx, 10.0 * U)
		var id: String = t[0]
		b.pressed.connect(func() -> void:
			clicked.emit()
			_show_tab(id))
		_card.add_child(b)
		_tabs[id] = b
		tx += tw + 4.0 * U
	_body = Control.new()
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.position = Vector2(14.0 * U, 10.0 * U + 28.0 * U + 10.0 * U)
	_card.add_child(_body)
	_show_tab(_tab)
	# the foot: orbit or fly, the shutter, and back to the start
	var sd := 64.0 * U
	var fy := vp.y - my - sd
	var cx := (vp.x - cw - mx) * 0.5 + mx * 0.5
	var shut := _Shutter.new(sd)
	shut.position = Vector2(cx - sd * 0.5, fy)
	shut.pressed.connect(func() -> void: shutter.emit())
	_chrome.add_child(shut)
	var mw := 74.0 * U
	var mh := 32.0 * U
	var i := 0
	for m: Array in [["orbit", "Orbit"], ["fly", "Fly"]]:
		var b := _pill(str(m[1]), mw, mh, 11.5 * U, str(m[0]))
		b.position = Vector2(cx - sd * 0.5 - 18.0 * U - mw * (2 - i) - 4.0 * U * (1 - i), fy + (sd - mh) * 0.5)
		var flying: bool = m[0] == "fly"
		b.pressed.connect(func() -> void:
			clicked.emit()
			_set_fly(flying))
		_chrome.add_child(b)
		_modes[m[0]] = b
		i += 1
	_sync_modes()
	var reset_b := MenuKit.round("refresh", d, 16.0 * U)
	reset_b.position = Vector2(cx + sd * 0.5 + 18.0 * U, fy + (sd - d) * 0.5)
	reset_b.pressed.connect(func() -> void:
		clicked.emit()
		cam.reset())
	_chrome.add_child(reset_b)
	_flash = ColorRect.new()
	_flash.size = vp
	_flash.color = Color(1.0, 1.0, 1.0, 0.0)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_flash)
	_flash_t = 1.0


## A glass pill with a word (and an icon), lit gold while it's the one picked.
func _pill(text: String, w: float, h: float, px: float, icon := "") -> UiButton:
	var b := UiButton.new(Vector2(w, h), h * 0.5, 4.0)
	MenuKit.flat(MenuKit.glass(b))
	var t := MenuKit.words(text, "inter", 700, px, HudStyle.INK)
	var ip := px * 1.3
	var tw := t.size.x + ((ip + 6.0 * U) if icon != "" else 0.0)
	var x := (w - tw) * 0.5
	if icon != "":
		var ic := Icons.rect(icon, ip, HudStyle.INK)
		ic.name = "Icon"
		ic.position = Vector2(x, (h - ip) * 0.5)
		b.add_child(ic)
		x += ip + 6.0 * U
	t.name = "Text"
	t.position = Vector2(x, (h - t.size.y) * 0.5)
	b.add_child(t)
	return b


static func _mark(b: UiButton, on: bool) -> void:
	if on:
		b.p("c_top", HudStyle.GOLD_TOP).p("c_foot", HudStyle.GOLD_FOOT).p("c_border", Color(0, 0, 0, 0))
	else:
		var fill := HudStyle.GLASS_2
		b.p("c_top", fill).p("c_foot", fill).p("c_border", HudStyle.STROKE)
	var ink := HudStyle.GOLD_INK if on else HudStyle.INK
	var t: UiText = b.get_node("Text")
	t.runs[0][3] = ink
	t.set_runs(t.runs)
	if b.has_node("Icon"):
		(b.get_node("Icon") as TextureRect).self_modulate = ink


func _set_fly(on: bool) -> void:
	cam.fly = on
	_sync_modes()


func _sync_modes() -> void:
	for k: String in _modes:
		_mark(_modes[k], (k == "fly") == cam.fly)


func _show_tab(t: String) -> void:
	_tab = t
	for k: String in _tabs:
		_mark(_tabs[k], k == t)
	for c in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	_sliders.clear()
	var w := _card.size.x - 28.0 * U
	var y := 0.0
	match t:
		"camera":
			y = _slider(y, w, "fov", "Field of view", 15.0, 100.0, cam.fov, func(v: float) -> String: return "%d°" % roundi(v), func(v: float) -> void: cam.fov = v)
			y = _slider(y, w, "roll", "Roll", -45.0, 45.0, cam.roll, func(v: float) -> String: return "%s%d°" % ["+" if v > 0.5 else "", roundi(v)], func(v: float) -> void: cam.roll = 0.0 if absf(v) < 1.2 else v)
			var names: Array = FRAMES.map(func(f: Array) -> String: return str(f[0]))
			y = _chips(y, w, "Frame", names, _frame, func(i: int) -> int:
				_frame = i
				_mask.queue_redraw()
				return i)
			y = _chips(y, w, "Guides", ["Thirds grid"], 0 if _grid else -1, func(_i: int) -> int:
				_grid = not _grid
				_mask.queue_redraw()
				return 0 if _grid else -1)
		"scene":
			y = _slider(y, w, "hour", "Time of day", 0.0, 24.0, hour, func(v: float) -> String:
				var m := roundi(v * 60.0) % 1440
				return "%02d:%02d" % [m / 60, m % 60], func(v: float) -> void:
				hour = v
				scene.emit(hour, weather))
			var names: Array = WEATHERS.map(func(k: StringName) -> String: return "As it was" if k == &"" else str(Atmosphere.WEATHER[k].name))
			y = _chips(y, w, "Weather", names, WEATHERS.find(weather), func(i: int) -> int:
				weather = WEATHERS[i]
				scene.emit(hour, weather)
				return i)
			y = _note(y, w, "The sea keeps its swell, so every ship stays afloat on it.")
		"lens":
			y = _slider(y, w, "dof", "Depth of field", 0.0, 1.0, dof, func(v: float) -> String: return "Off" if v <= 0.0 else "f/%.1f" % (22.0 - v * 20.6), func(v: float) -> void: dof = v)
			y = _slider(y, w, "focus", "Focus", 0.0, 100.0, _focus_to_slider(focus) if focus > 0.0 else 0.0, func(v: float) -> String: return "Auto" if v <= 0.0 else "%d m" % roundi(_slider_to_focus(v)), func(v: float) -> void: focus = 0.0 if v <= 0.0 else _slider_to_focus(v))
			y = _slider(y, w, "ev", "Exposure", -2.0, 2.0, exposure, func(v: float) -> String: return "%s%.1f EV" % ["+" if v > 0.0 else "", v], func(v: float) -> void: exposure = 0.0 if absf(v) < 0.08 else v)
			y = _note(y, w, "Double-tap the scene to focus on that spot." if touch else "Double-click the scene to focus on that spot.")
		_:
			var names: Array = FILTERS.map(func(f: Dictionary) -> String: return str(f.name))
			y = _chips(y, w, "Look", names, _filter, func(i: int) -> int:
				_filter = i
				return i)
			y = _slider(y, w, "strength", "Strength", 0.0, 1.0, _strength, func(v: float) -> String: return "%d%%" % roundi(v * 100.0), func(v: float) -> void: _strength = v)
			y = _slider(y, w, "vig", "Vignette", -0.5, 1.0, _vignette, func(v: float) -> String: return "%s%d" % ["+" if v > 0.0 else "", roundi(v * 100.0)], func(v: float) -> void: _vignette = 0.0 if absf(v) < 0.03 else v)
			y = _slider(y, w, "grain", "Film grain", 0.0, 1.0, _grain, func(v: float) -> String: return str(roundi(v * 100.0)), func(v: float) -> void: _grain = v)
	_card.resize(Vector2(_card.size.x, _body.position.y + y + 6.0 * U))


## Focus slider: 0 auto, otherwise 2 m .. 800 m on a log scale.
static func _focus_to_slider(m: float) -> float:
	return roundf(maxf(1.0, log(m / 2.0) / log(400.0) * 100.0))


static func _slider_to_focus(v: float) -> float:
	return 2.0 * pow(400.0, v / 100.0)


func _slider(y: float, w: float, key: String, label: String, lo: float, hi: float, v: float, fmt: Callable, on: Callable) -> float:
	var s := _Slider.new(label, lo, hi, v, fmt, on, w)
	s.position = Vector2(0.0, y)
	s.changed.connect(func() -> void: pass)
	_body.add_child(s)
	_sliders[key] = s
	return y + s.size.y + 4.0 * U


func _set_slider(key: String, v: float) -> void:
	if _sliders.has(key):
		(_sliders[key] as _Slider).set_value(v)


## A row of pills; `on(i)` returns which is lit after a tap (-1 none).
func _chips(y: float, w: float, label: String, names: Array, sel: int, on: Callable) -> float:
	var l := MenuKit.words(label.to_upper(), "inter", 700, 9.0 * U, HudStyle.INK_3, 0.12)
	l.position = Vector2(0.0, y)
	_body.add_child(l)
	y += l.size.y + 5.0 * U
	var h := 26.0 * U
	var x := 0.0
	var row: Array[UiButton] = []
	for i in names.size():
		var t := MenuKit.words(str(names[i]), "inter", 600, 10.5 * U, HudStyle.INK)
		var bw := t.size.x + 20.0 * U
		if x > 0.0 and x + bw > w:
			x = 0.0
			y += h + 5.0 * U
		var b := _pill(str(names[i]), bw, h, 10.5 * U)
		b.position = Vector2(x, y)
		var k := i
		b.pressed.connect(func() -> void:
			clicked.emit()
			var now: int = on.call(k)
			for j in row.size():
				_mark(row[j], j == now))
		_body.add_child(b)
		row.append(b)
		_mark(b, i == sel)
		x += bw + 5.0 * U
	return y + h + 10.0 * U


func _note(y: float, w: float, text: String) -> float:
	var t := UiText.new([[text, HudStyle.font("inter", 500), roundi(10.0 * U), HudStyle.INK_3]], w, 1.35)
	t.position = Vector2(0.0, y + 2.0 * U)
	_body.add_child(t)
	return y + t.size.y + 8.0 * U


# ------------------------------------------------------------------ input

func _unhandled_input(event: InputEvent) -> void:
	if not active:
		return
	var k := event as InputEventKey
	if k == null:
		return
	get_viewport().set_input_as_handled()
	var key := k.keycode
	if not k.pressed:
		_keys.erase(key)
		return
	if k.echo:
		return
	match key:
		KEY_P:
			closed.emit()
		KEY_SPACE, KEY_ENTER, KEY_KP_ENTER:
			shutter.emit()
		KEY_H:
			_bare = not _bare
		KEY_F:
			_set_fly(not cam.fly)
		KEY_R:
			cam.reset()
		_:
			_keys[key] = true


func _on_scene(event: InputEvent) -> void:
	var vp := _root.size
	if event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION:
		var mb := event as InputEventMouseButton
		if mb.pressed and (mb.button_index == MOUSE_BUTTON_WHEEL_UP or mb.button_index == MOUSE_BUTTON_WHEEL_DOWN):
			cam.zoom(exp((-120.0 if mb.button_index == MOUSE_BUTTON_WHEEL_UP else 120.0) * mb.factor * 0.0016))
			return
		if mb.pressed:
			_ptrs[-1] = mb.position
			_down = {"at": mb.position, "t": Time.get_ticks_msec(), "moved": false, "button": mb.button_index}
		else:
			if _ptrs.erase(-1) and not _down.moved and Time.get_ticks_msec() - int(_down.t) < 380 and mb.button_index == MOUSE_BUTTON_LEFT:
				_tap(mb.position)
		return
	if event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION:
		if not _ptrs.has(-1):
			return
		var mm := event as InputEventMouseMotion
		if not _down.moved and mm.position.distance_to(_down.at) > 7.0:
			_down.moved = true
		_ptrs[-1] = mm.position
		if not _down.moved:
			return
		if int(_down.button) != MOUSE_BUTTON_LEFT or mm.shift_pressed:
			cam.pan(mm.relative.x, mm.relative.y, vp.y)
		else:
			cam.rotate(mm.relative.x, mm.relative.y)
		return
	if event is InputEventScreenTouch:
		var st := event as InputEventScreenTouch
		if st.pressed:
			_ptrs[st.index] = st.position
			if _ptrs.size() == 1:
				_down = {"at": st.position, "t": Time.get_ticks_msec(), "moved": false, "button": MOUSE_BUTTON_LEFT}
			else:
				_down.moved = true
		elif _ptrs.erase(st.index) and _ptrs.is_empty() and not st.canceled:
			if not _down.moved and Time.get_ticks_msec() - int(_down.t) < 380:
				_tap(st.position)
		return
	if event is InputEventScreenDrag:
		var sd := event as InputEventScreenDrag
		if not _ptrs.has(sd.index):
			return
		if _ptrs.size() >= 2:
			# a pinch zooms, the pair's midpoint pans
			var ids := _ptrs.keys()
			var a: Vector2 = _ptrs[ids[0]]
			var b: Vector2 = _ptrs[ids[1]]
			var d0 := a.distance_to(b)
			var m0 := (a + b) * 0.5
			_ptrs[sd.index] = sd.position
			a = _ptrs[ids[0]]
			b = _ptrs[ids[1]]
			var d1 := a.distance_to(b)
			if d0 > 8.0 and d1 > 8.0:
				cam.zoom(d0 / d1)
			var m1 := (a + b) * 0.5
			cam.pan(m1.x - m0.x, m1.y - m0.y, vp.y)
			return
		_ptrs[sd.index] = sd.position
		if not _down.moved and sd.position.distance_to(_down.at) > 7.0:
			_down.moved = true
		if _down.moved:
			cam.rotate(sd.relative.x, sd.relative.y)


## One tap shows or hides the controls; two quick taps focus the lens there.
func _tap(at: Vector2) -> void:
	var now := Time.get_ticks_msec()
	if now - int(_last_tap.t) < 320 and at.distance_to(_last_tap.at) < 36.0:
		_tap_t = -1.0
		_last_tap.t = 0
		_focus_at(at)
		return
	_last_tap = {"at": at, "t": now}
	_tap_t = 0.0


func _focus_at(at: Vector2) -> void:
	var d: float = pick_at.call(at)
	if d < 0.0:
		return
	focus = clampf(d, 2.0, 800.0)
	if dof <= 0.0:
		# focusing says you want the blur: open the lens up a little
		dof = 0.45
		_set_slider("dof", dof)
	_set_slider("focus", _focus_to_slider(focus))
	var r := _Ping.new()
	r.position = at
	_root.add_child(r)


# ------------------------------------------------------------------ parts

## The frame's crop (the screen outside it shaded) and the rule of thirds.
class _Mask:
	extends Control
	var pm: PhotoMode
	## The shutter's frame: the crop's outside goes black, no guides.
	var shooting := false

	func _init(p: PhotoMode) -> void:
		pm = p
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var r := pm.crop(size)
		var shade := Color(0.0, 0.0, 0.0, 1.0 if shooting else 0.55)
		if r.position.y > 0.0:
			draw_rect(Rect2(0.0, 0.0, size.x, r.position.y), shade)
			draw_rect(Rect2(0.0, r.end.y, size.x, size.y - r.end.y), shade)
		if r.position.x > 0.0:
			draw_rect(Rect2(0.0, 0.0, r.position.x, size.y), shade)
			draw_rect(Rect2(r.end.x, 0.0, size.x - r.end.x, size.y), shade)
		if shooting:
			return
		if r.size != size:
			draw_rect(r, Color(1.0, 1.0, 1.0, 0.5), false, 1.0)
		if pm._grid:
			for i in [1, 2]:
				var gx: float = r.position.x + r.size.x * i / 3.0
				var gy: float = r.position.y + r.size.y * i / 3.0
				draw_line(Vector2(gx, r.position.y), Vector2(gx, r.end.y), Color(1.0, 1.0, 1.0, 0.35), 1.0)
				draw_line(Vector2(r.position.x, gy), Vector2(r.end.x, gy), Color(1.0, 1.0, 1.0, 0.35), 1.0)


## A slider: its label and value over a track, dragged anywhere along it.
class _Slider:
	extends Control
	signal changed
	var lo := 0.0
	var hi := 1.0
	var v := 0.0
	var fmt: Callable
	var on: Callable
	var _out: UiText
	var _held := false
	var _track_y := 0.0

	func _init(label: String, p_lo: float, p_hi: float, p_v: float, p_fmt: Callable, p_on: Callable, w: float) -> void:
		lo = p_lo
		hi = p_hi
		fmt = p_fmt
		on = p_on
		mouse_filter = Control.MOUSE_FILTER_STOP
		var u := MenuKit.U
		var l := MenuKit.words(label, "inter", 600, 11.0 * u, HudStyle.INK_2)
		add_child(l)
		_out = MenuKit.words("00:00", "inter", 700, 11.0 * u, HudStyle.INK)
		_out.runs[0][1] = HudStyle.tnum(_out.runs[0][1])
		_out.align = HORIZONTAL_ALIGNMENT_RIGHT
		_out.fit(80.0 * u)
		_out.position = Vector2(w - 80.0 * u, 0.0)
		add_child(_out)
		_track_y = l.size.y + 10.0 * u
		size = Vector2(w, _track_y + 12.0 * u)
		set_value(p_v)

	func set_value(p: float) -> void:
		v = clampf(p, lo, hi)
		_out.set_text(str(fmt.call(v)))
		queue_redraw()

	func _gui_input(event: InputEvent) -> void:
		var press: bool = (event is InputEventScreenTouch) or (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION)
		if press:
			_held = event.pressed
			if _held:
				_slide(event.position.x)
			accept_event()
			queue_redraw()
			return
		var drag := event is InputEventScreenDrag or (event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION)
		if drag and _held:
			_slide(event.position.x)
			accept_event()

	func _slide(x: float) -> void:
		var u := MenuKit.U
		var k := clampf((x - 8.0 * u) / (size.x - 16.0 * u), 0.0, 1.0)
		set_value(lerpf(lo, hi, k))
		on.call(v)
		changed.emit()

	func _draw() -> void:
		var u := MenuKit.U
		var h := 4.0 * u
		var y := _track_y
		var x0 := 8.0 * u
		var tw := size.x - 16.0 * u
		var sb := StyleBoxFlat.new()
		sb.set_corner_radius_all(int(ceilf(h * 0.5)))
		sb.anti_aliasing = true
		sb.bg_color = Color(0.0, 0.0, 0.0, 0.35)
		draw_style_box(sb, Rect2(x0, y - h * 0.5, tw, h))
		var k := (v - lo) / (hi - lo)
		# filled from the neutral point (0, or the low end)
		var z := clampf((0.0 - lo) / (hi - lo), 0.0, 1.0)
		var a := minf(k, z)
		var b := maxf(k, z)
		if b - a > 0.002:
			sb.bg_color = Color("#f4f8f9")
			draw_style_box(sb, Rect2(x0 + tw * a, y - h * 0.5, maxf(h, tw * (b - a)), h))
		var c := HudStyle.GOLD if _held else Color("#f4f8f9")
		draw_circle(Vector2(x0 + tw * k, y + 1.5 * u), 9.0 * u, Color(0.0, 0.0, 0.0, 0.3), true, -1.0, true)
		draw_circle(Vector2(x0 + tw * k, y), 8.0 * u * (1.15 if _held else 1.0), c, true, -1.0, true)


## The shutter: a white disc in a white ring, squeezing as it's pressed.
class _Shutter:
	extends Control
	signal pressed
	var _down := false

	func _init(d: float) -> void:
		size = Vector2(d, d)
		pivot_offset = size * 0.5
		mouse_filter = Control.MOUSE_FILTER_STOP

	func _gui_input(event: InputEvent) -> void:
		var press: bool = (event is InputEventScreenTouch) or (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION)
		if not press:
			return
		accept_event()
		if event.pressed:
			_down = true
		elif _down:
			_down = false
			if Rect2(Vector2.ZERO, size).has_point(event.position):
				pressed.emit()
		scale = Vector2.ONE * (0.92 if _down else 1.0)

	func _draw() -> void:
		var c := size * 0.5
		var r := size.x * 0.5
		draw_circle(c + Vector2(0.0, 3.0), r, Color(0.0, 0.0, 0.0, 0.25), true, -1.0, true)
		draw_arc(c, r - 3.0, 0.0, TAU, 48, Color.WHITE, 4.0, true)
		draw_circle(c, r - 9.0, Color(1.0, 1.0, 1.0, 0.92), true, -1.0, true)
		var ic := Icons.texture("camera", r * 0.8)
		var s := Vector2(r, r) * 0.8
		draw_texture_rect(ic, Rect2(c - s * 0.5, s), false, Color(0.06, 0.13, 0.18))


## A focus ring blooming where the lens locked on.
class _Ping:
	extends Control
	var t := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(dt: float) -> void:
		t += dt
		queue_redraw()
		if t > 0.9:
			queue_free()

	func _draw() -> void:
		var k := t / 0.9
		var r := lerpf(16.0, 34.0, HudStyle.eased(minf(1.0, k * 1.6))) * MenuKit.U
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 40, Color(HudStyle.GOLD, 1.0 - k), 2.0, true)
		draw_circle(Vector2.ZERO, 2.5 * MenuKit.U, Color(HudStyle.GOLD, 1.0 - k))
