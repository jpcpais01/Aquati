class_name Veil
extends CanvasLayer
## The veil between scenes (the web's #sw-veil): the screen washes over in the
## deep teal of the sea with a line in small capitals saying where you're
## bound ("Setting a course for Las Brumas…"), the world changes behind it,
## and it lifts once what changed has drawn. While it's up it takes every
## touch, so nothing is pressed twice on the way.

## Seconds it takes to come over or lift (the web's 0.42 s CSS ease), and
## how long it waits before the change behind it (the web's 430 ms).
const FADE := 0.42
const HOLD := 0.43

## Covering, changing or lifting: one at a time.
var busy := false

var _rect: ColorRect
var _mat: ShaderMaterial
var _text: UiText
var _mid: Callable
## Seconds since it began to come over, the frames still to draw before it
## lifts (-1: the change hasn't run yet), and the fade: from, to, how far.
var _t := 0.0
var _frames := -1
var _from := 0.0
var _to := 0.0
var _k := 1.0


func _ready() -> void:
	layer = 20
	_rect = ColorRect.new()
	_rect.mouse_filter = Control.MOUSE_FILTER_STOP
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/veil.gdshader")
	_rect.material = _mat
	add_child(_rect)
	visible = false
	set_process(false)
	get_viewport().size_changed.connect(_layout)


## Comes over the screen saying `text`, runs `mid` once it's covered, and
## lifts two frames after (the web's fade()).
func cover(text: String, mid: Callable) -> void:
	if busy:
		return
	busy = true
	_mid = mid
	_t = 0.0
	_frames = -1
	_fade(1.0)
	if _text != null:
		_rect.remove_child(_text)
		_text.queue_free()
	_text = MenuKit.words(text.to_upper(), "cinzel", 700, 13.0 * MenuKit.PX, HudStyle.INK_2, 0.32, 1.0)
	_rect.add_child(_text)
	_layout()
	visible = true
	set_process(true)
	_alpha()


func _layout() -> void:
	var vp := get_viewport().get_visible_rect().size
	_rect.size = vp
	if _text != null:
		_text.position = ((vp - _text.size) * 0.5).round()


func _fade(to: float) -> void:
	_from = _alpha_now()
	_to = to
	_k = 0.0


func _alpha_now() -> float:
	return lerpf(_from, _to, MathX.bezier(0.25, 0.1, 0.25, 1.0, _k))


func _alpha() -> void:
	var a := _alpha_now()
	_mat.set_shader_parameter("alpha", a)
	_text.modulate.a = a


func _process(delta: float) -> void:
	# whatever ran behind it may have taken a while: the lift still plays out whole
	var dt := minf(delta, 1.0 / 30.0)
	_t += dt
	_k = minf(1.0, _k + dt / FADE)
	if _mid.is_valid() and _t >= HOLD:
		var m := _mid
		_mid = Callable()
		m.call()
		_frames = 2
	elif _frames > 0:
		_frames -= 1
		if _frames == 0:
			_fade(0.0)
	_alpha()
	if _frames == 0 and _k >= 1.0:
		visible = false
		busy = false
		set_process(false)
