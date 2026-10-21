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
var music := 0.8
var sfx := 1.0
var shake := 1.0
## Phones and tablets: touch controls, a 60 fps cap, the lean graphics path.
var mobile := false

var _cfg := ConfigFile.new()


func _ready() -> void:
	mobile = OS.has_feature("mobile") or OS.has_feature("web_android") or OS.has_feature("web_ios")
	quality = Quality.MEDIUM if mobile else Quality.HIGH
	if _cfg.load(PATH) == OK:
		quality = clampi(_cfg.get_value("graphics", "quality", quality), 0, 2) as Quality
		music = _cfg.get_value("audio", "music", music)
		sfx = _cfg.get_value("audio", "sfx", sfx)
		shake = _cfg.get_value("game", "shake", shake)
	apply()


func set_quality(q: Quality) -> void:
	quality = q
	save()
	apply()


func save() -> void:
	_cfg.set_value("graphics", "quality", quality)
	_cfg.set_value("audio", "music", music)
	_cfg.set_value("audio", "sfx", sfx)
	_cfg.set_value("game", "shake", shake)
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
