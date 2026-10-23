class_name FpsMeter
extends CanvasLayer
## The frame counter at the top of the screen, as the web shows it: "60 FPS"
## in small white type, counted over every half second; Settings' Frame
## counter shows or hides it.

var _text: UiText
var _frames := 0
var _since := 0


func _ready() -> void:
	layer = 30
	_text = MenuKit.words("60 FPS", "inter", 600, 11.0 * MenuKit.PX, Color(1.0, 1.0, 1.0, 0.6), 0.0, 1.0)
	_text.runs[0][1] = HudStyle.tnum(_text.runs[0][1])
	_text.set_runs(_text.runs)
	_text.halo = Color(0.0, 0.0, 0.0, 0.4)
	add_child(_text)
	_since = Time.get_ticks_msec()
	Settings.changed.connect(_show)
	get_viewport().size_changed.connect(_place)
	_show()


func _show() -> void:
	visible = Settings.fps
	set_process(visible)
	_frames = 0
	_since = Time.get_ticks_msec()
	_place()


func _place() -> void:
	var vp := get_viewport().get_visible_rect().size
	_text.position = Vector2(roundf((vp.x - _text.size.x) * 0.5), roundf(5.0 * MenuKit.PX))


func _process(_dt: float) -> void:
	_frames += 1
	var now := Time.get_ticks_msec()
	if now - _since >= 500:
		_text.set_text("%d FPS" % roundi(_frames * 1000.0 / (now - _since)))
		_frames = 0
		_since = now
		_place()
