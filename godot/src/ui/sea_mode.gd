class_name SeaMode
extends Control
## Which seas you sail, in the harbour over Set Sail (the web's #sea-mode as
## a phone held sideways lays it out): Adventure, where the Brethren hunt on
## sight, or Peaceful, where nobody fires first (Peace). Two choices in a dark
## pill, the lit half sliding across under the one picked, ember red under
## the crossed blades and sea-glass green under the dove, which bobs.

## A choice was tapped: `peaceful` is what's picked now.
signal picked(peaceful: bool)
signal clicked

const LIT := {
	false: [Color(1.0, 0.549, 0.431, 0.3), Color(0.627, 0.196, 0.118, 0.34), Color(1.0, 0.627, 0.51, 0.45)],
	true: [Color(0.588, 1.0, 0.902, 0.3), Color(0.078, 0.471, 0.431, 0.36), Color(0.667, 1.0, 0.925, 0.5)],
}

var peaceful := false
var _track: UiBox
var _lit: UiBox
var _halves: Array[UiButton] = []
var _icons: Array[TextureRect] = []
var _words: Array[UiText] = []
## The lit half: where it rests (0 Adventure .. 1 Peaceful), and its way.
var _x := 0.0
var _v := 0.0
var _t := 0.0
var _pad := 0.0
var _half := 0.0


func _init(w: float) -> void:
	var u := MenuKit.U
	var t := MenuKit.T
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pad = 4.0 * u
	var h := 40.0 * u
	size = Vector2(w, h)
	_half = (w - _pad * 2.0) * 0.5
	_track = UiBox.new(size, 18.0 * u, 4.0)
	MenuKit.flat(_track)
	_track.p("c_top", Color(0.024, 0.086, 0.125, 0.55)).p("c_foot", Color(0.024, 0.086, 0.125, 0.55)).p("c_border", Color(1.0, 1.0, 1.0, 0.07)).p("hi", 0.0)
	add_child(_track)
	_lit = UiBox.new(Vector2(_half, h - _pad * 2.0), 14.0 * u, 20.0 * u)
	_lit.p("hi", 0.0).p("c_shadow", Color(0.0, 0.0, 0.0, 0.25)).p("shadow", Vector2(6.0, 18.0) * u)
	_lit.position = Vector2(_pad, _pad)
	add_child(_lit)
	var choices := [["swords", "ADVENTURE"], ["dove", "PEACEFUL"]]
	for i in 2:
		var b := UiButton.new(Vector2(_half, h - _pad * 2.0), 14.0 * u, 4.0)
		MenuKit.flat(b)
		b.p("c_top", Color(0.0, 0.0, 0.0, 0.0)).p("c_foot", Color(0.0, 0.0, 0.0, 0.0)).p("c_border", Color(0.0, 0.0, 0.0, 0.0)).p("hi", 0.0)
		b.squeeze = 0.96
		b.position = Vector2(_pad + _half * i, _pad)
		var ic := Icons.rect(str(choices[i][0]), 20.0 * u)
		var word := MenuKit.words(str(choices[i][1]), "inter", 800, 11.5 * t, Color.WHITE, 0.08)
		var x := (_half - ic.size.x - 7.0 * u - word.size.x) * 0.5
		ic.position = Vector2(x, (b.size.y - ic.size.y) * 0.5)
		ic.pivot_offset = ic.size * 0.5
		MenuKit.line_at(word, x + ic.size.x + 7.0 * u, 0.0, b.size.y)
		b.add_child(ic)
		b.add_child(word)
		var on := i == 1
		b.pressed.connect(func() -> void:
			clicked.emit()
			if on != peaceful:
				set_peaceful(on)
				picked.emit(on))
		add_child(b)
		_halves.append(b)
		_icons.append(ic)
		_words.append(word)
	_paint()
	_x = 0.0
	_place()


## Shows `on` picked; the lit half slides across to it.
func set_peaceful(on: bool, now := false) -> void:
	peaceful = on
	_paint()
	if now:
		_x = 1.0 if on else 0.0
		_v = 0.0
		_place()


func buttons() -> Array[UiButton]:
	return _halves


func _paint() -> void:
	var c: Array = LIT[peaceful]
	_lit.p("c_top", c[0]).p("c_foot", c[1]).p("c_border", c[2])
	for i in 2:
		var sel := (i == 1) == peaceful
		var glow := Peace.DOVE_INK if i == 1 else Peace.BLADES_INK
		_icons[i].self_modulate = glow if sel else HudStyle.INK_3
		_words[i].modulate = HudStyle.INK if sel else HudStyle.INK_3


func _process(dt: float) -> void:
	_t += dt
	# a spring under the lit half (the web's --spring: a little overshoot)
	var want := 1.0 if peaceful else 0.0
	_v += ((want - _x) * 240.0 - _v * 22.0) * dt
	_x += _v * dt
	if absf(want - _x) < 1e-3 and absf(_v) < 1e-3:
		_x = want
		_v = 0.0
	_place()
	# the dove, picked, rides a gentle air
	var dove := _icons[1]
	if peaceful:
		var k := sin(_t * TAU / 3.6)
		dove.position.y = (_halves[1].size.y - dove.size.y) * 0.5 - k * 1.5 * MenuKit.U
		dove.rotation = k * 0.06
	else:
		dove.position.y = (_halves[1].size.y - dove.size.y) * 0.5
		dove.rotation = 0.0


func _place() -> void:
	_lit.position.x = _pad + _half * _x
