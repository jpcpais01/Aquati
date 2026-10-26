extends Node
## Player settings and the graphics tier they pick, applied to the window and
## its viewport. Autoloaded as `Settings`.
##
## Phones run the Mobile renderer in one tile-resident pass where they can:
## the 3D buffer is the 10-bit one (the grade is built for its 0..2 range),
## the tonemap is a subpass of the scene, and there is no glow, so nothing but
## the finished frame ever leaves the GPU's tile memory.

signal changed

enum Quality { LOW, MEDIUM, HIGH }

const PATH := "user://settings.cfg"

var quality: Quality = Quality.MEDIUM
## The sound on or off, the music's own switch, and the volume sliders (0..1; the web's defaults).
var sound := true
var music_on := true
var master := 1.0
var music := 0.8
var sfx := 1.0
var ambience := 1.0
var shake := 1.0
## Peaceful seas (Peace): every pirate, fort, camp and the Kraken still sail,
## but none of them fires until you do. Picked in the harbour or Settings.
var peaceful := false
## The frame counter at the top of the screen (the web's default: on).
var fps := true
## Phones and tablets: touch controls, a 60 fps cap, the lean graphics path.
var mobile := false
## A computer (the Windows game): a window that can go full screen, and a
## way back to the desktop.
var desktop := false
## The window fills the screen (the desktop game's default; F11 or
## Alt+Enter switches, as does Settings).
var fullscreen := true
## The interface's size on a computer (the web's HUD size: compact 0.86,
## normal 1, large 1.16).
var ui_size := 1.0
## A run told to play as a phone (--phone): the short side of the screen it
## pretends to have, in dp; 0 reads the real screen.
var phone_lines := 0.0
## The weather and the hour picked on the sky badge ("auto", or one of
## Atmosphere.WEATHER or TIMES), kept for the next voyage.
var weather := "auto"
var time := "auto"

var _cfg := ConfigFile.new()


func _ready() -> void:
	mobile = OS.has_feature("mobile") or OS.has_feature("web_android") or OS.has_feature("web_ios")
	desktop = OS.has_feature("pc") and not mobile
	quality = Quality.MEDIUM if mobile else Quality.HIGH
	if _cfg.load(PATH) == OK:
		quality = clampi(_cfg.get_value("graphics", "quality", quality), 0, 2) as Quality
		sound = _cfg.get_value("audio", "sound", sound)
		music_on = _cfg.get_value("audio", "music_on", music_on)
		master = _cfg.get_value("audio", "master", master)
		music = _cfg.get_value("audio", "music", music)
		sfx = _cfg.get_value("audio", "sfx", sfx)
		ambience = _cfg.get_value("audio", "ambience", ambience)
		shake = _cfg.get_value("game", "shake", shake)
		peaceful = bool(_cfg.get_value("game", "peaceful", peaceful))
		fps = _cfg.get_value("interface", "fps", fps)
		weather = _cfg.get_value("sky", "weather", weather)
		time = _cfg.get_value("sky", "time", time)
		fullscreen = _cfg.get_value("display", "fullscreen", fullscreen)
		ui_size = clampf(float(_cfg.get_value("display", "ui_size", ui_size)), 0.7, 1.4)
	apply()
	fit_ui()
	# only an exported game takes the whole screen on its own: a run from the
	# editor binary (the checks, the shots) keeps the window it was given
	if desktop and OS.has_feature("template"):
		apply_window()
	get_window().size_changed.connect(_on_window_resized)


## The menus and the HUD are drawn in units made for a phone held sideways
## (720 tall), which on a computer's screen made everything twice the size
## the web game draws it. On a computer the canvas is sized the web's way
## instead, a CSS pixel a screen pixel at 1080p (the web's --hs for small
## windows), and kept in proportion to the window above that, so a 1440p or
## 4K screen sees the same layout, only sharper (Windows' display scaling is
## left out: it made the interface huge on high-DPI screens). Times the
## Interface size picked in Settings; a small window never gets less room
## than the phone layouts were made for.
func fit_ui() -> void:
	var w := get_window()
	if w == null:
		return
	var f := 1.0
	var px := Vector2(w.size)
	if desktop and DisplayServer.get_name() != "headless" and px.x > 0.0 and px.y > 0.0:
		var hs := 1.0
		if px.y <= 420.0:
			hs = 0.74
		elif px.x <= 600.0 or px.y <= 540.0:
			hs = 0.8
		elif px.x <= 1000.0 or px.y <= 680.0:
			hs = 0.9
		# canvas units tall: a unit is 1/K of a CSS pixel at --k
		var tall := clampf(px.y * HudStyle.K / hs, 720.0, 1080.0 * HudStyle.K) / ui_size
		var s := px.y / tall
		s = minf(s, minf(px.y / 720.0, px.x / 1100.0))
		f = s / minf(px.x / 1280.0, px.y / 720.0)
	if absf(w.content_scale_factor - f) > 1e-4:
		w.content_scale_factor = f


func set_ui_size(v: float) -> void:
	ui_size = clampf(v, 0.7, 1.4)
	save()
	fit_ui()
	changed.emit()


## Play as a phone `lines` dp across its short side would, at its default
## MEDIUM: the lean graphics path, and the plants and crews sized on its
## screen (a desktop run's --phone, to see what a phone draws).
func pretend_phone(lines: float) -> void:
	mobile = true
	desktop = false
	quality = Quality.MEDIUM
	phone_lines = clampf(lines, 320.0, 720.0)
	apply()
	fit_ui()


## The window as `fullscreen` says: the whole screen (borderless, so
## Alt+Tab is instant), or a window of most of it, centred, that can be
## resized freely.
func apply_window() -> void:
	if not desktop or DisplayServer.get_name() == "headless":
		return
	var w := get_window()
	if fullscreen:
		w.mode = Window.MODE_FULLSCREEN
		return
	if w.mode == Window.MODE_WINDOWED:
		return
	w.mode = Window.MODE_WINDOWED
	var screen := DisplayServer.screen_get_usable_rect(w.current_screen)
	var size := Vector2i((Vector2(screen.size) * 0.8).round())
	# 16:9 at most, so a wide monitor doesn't get a letterbox of a window
	size.x = mini(size.x, roundi(size.y * 16.0 / 9.0))
	w.size = size
	w.position = screen.position + (screen.size - size) / 2


func set_fullscreen(on: bool) -> void:
	fullscreen = on
	save()
	apply_window()
	changed.emit()


## F11, or Alt+Enter: full screen or a window, from anywhere in the game.
func _input(event: InputEvent) -> void:
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo or not desktop:
		return
	if k.keycode == KEY_F11 or (k.alt_pressed and k.keycode in [KEY_ENTER, KEY_KP_ENTER]):
		get_viewport().set_input_as_handled()
		set_fullscreen(not fullscreen)


## The window was put into or out of full screen some other way (the
## system's own keys or title bar): the switch follows.
func _on_window_resized() -> void:
	fit_ui()
	if not desktop or not OS.has_feature("template"):
		return
	var w := get_window()
	var full := w.mode == Window.MODE_FULLSCREEN or w.mode == Window.MODE_EXCLUSIVE_FULLSCREEN
	if full != fullscreen and DisplayServer.get_name() != "headless":
		fullscreen = full
		save()
		changed.emit()


func set_quality(q: Quality) -> void:
	quality = q
	save()
	apply()


func save() -> void:
	_cfg.set_value("graphics", "quality", quality)
	_cfg.set_value("audio", "sound", sound)
	_cfg.set_value("audio", "music_on", music_on)
	_cfg.set_value("audio", "master", master)
	_cfg.set_value("audio", "music", music)
	_cfg.set_value("audio", "sfx", sfx)
	_cfg.set_value("audio", "ambience", ambience)
	_cfg.set_value("game", "shake", shake)
	_cfg.set_value("game", "peaceful", peaceful)
	_cfg.set_value("interface", "fps", fps)
	_cfg.set_value("sky", "weather", weather)
	_cfg.set_value("sky", "time", time)
	_cfg.set_value("display", "fullscreen", fullscreen)
	_cfg.set_value("display", "ui_size", ui_size)
	_cfg.save(PATH)


## Glow costs the mobile renderer its single-pass frame: only on HIGH.
func glow() -> bool:
	return quality == Quality.HIGH and not mobile


func shadow_splits() -> int:
	return 2 if quality == Quality.LOW else 3 if quality == Quality.HIGH and not mobile else 2


func apply() -> void:
	var vp := get_viewport()
	if vp == null:
		return
	# a phone sips power at 60; a desktop runs with its display
	Engine.max_fps = 60 if mobile else 0
	match quality:
		Quality.LOW:
			vp.msaa_3d = Viewport.MSAA_DISABLED
		Quality.MEDIUM:
			vp.msaa_3d = Viewport.MSAA_2X
		Quality.HIGH:
			vp.msaa_3d = Viewport.MSAA_4X if not mobile else Viewport.MSAA_2X
	# Render 3D at native size on phones up to about 2.7 megapixels (full HD
	# class), where the tonemap stays a subpass; scale down beyond that and on
	# LOW. The Mobile renderer drops the subpass as soon as it scales, so a
	# small cut buys nothing.
	var px := float(vp.get_visible_rect().size.x * vp.get_visible_rect().size.y)
	var win := DisplayServer.window_get_size()
	if win.x > 0:
		px = float(win.x * win.y)
	var scale := 1.0
	if mobile:
		if quality == Quality.LOW:
			scale = clampf(sqrt(1.3e6 / px), 0.5, 1.0)
		elif px > 2.8e6:
			scale = clampf(sqrt(2.4e6 / px), 0.6, 1.0)
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
	vp.scaling_3d_scale = scale
	vp.use_debanding = true
	changed.emit()
