class_name WreckScreen
extends CanvasLayer
## "Lost to the Depths": her farewell, as on the web. The moment she's lost
## the view is letterboxed and captioned with her name and what sank her, a
## red bruise flaring at the edges and a depth gauge counting her down. Once
## she's gone the view drowns (shaders/farewell_drown.gdshader) and the voyage
## is laid out over it: her plaque with a porthole of her going under, your
## renown and rank on a turning crest, the tally against your records, the
## voyage as a line from harbour to the sea floor with every deed pinned on
## it, the ship's log, and the ways back up: Sail again, or Choose a new
## ship back in the harbour. Built for a phone held sideways: the card fits
## one screen, scaled to it, with nothing to scroll. Records are kept with
## the rest of your progress (Progress).

signal retry
## Choose a new ship: back to the harbour.
signal harbour
## A tally tile's number has landed (the sixth, her renown), a new record or not.
signal tallied(i: int, best: bool)

const RANKS := [
	[0, "Bilge Rat", "Swabbed more decks than foes."],
	[150, "Powder Monkey", "Kept the guns fed, mostly."],
	[400, "Deckhand", "Found your sea legs."],
	[800, "Buccaneer", "The taverns know your name."],
	[1400, "Corsair", "Merchants trim their sails at your flag."],
	[2200, "Sea Wolf", "Pirates count their guns when you appear."],
	[3300, "Dread Captain", "Mothers warn their children of you."],
	[4800, "Terror of the Isles", "Whole flotillas turn tail."],
	[7000, "Legend of the Archipelago", "They will sing of this voyage."],
]
const KIND_ICON := {"kill": "skull", "chest": "coin", "isle": "isle", "trade": "coin", "bounty": "skull"}
## The card's columns in CSS pixels: renown, the least the tally needs, the log.
const COL_A := 232.0
const COL_B := 400.0
const COL_C := 252.0
const GAP := 10.0
## The most CSS pixels in a unit the card grows to on a roomy screen.
const U_MAX := 1.6
## The web's --ease and --spring curves, and CSS ease.
const EASE := Vector4(0.2, 0.9, 0.25, 1.0)
const SPRING := Vector4(0.25, 1.4, 0.4, 1.0)
const CSS_EASE := Vector4(0.25, 0.1, 0.25, 1.0)

const GOLD_GRAD := [Color("#ffeab0"), Color("#f6c766"), Color("#e0a443"), Color("#e0a443"), Vector2(0.52, 1.0)]
const SEA_GRAD := [Color("#ffffff"), Color("#eafffb"), Color("#9fe9de"), Color("#5cc6bb"), Vector2(0.38, 0.78)]

enum { RISE, SLIDE, LETTER, FADE }

## Screen units, CSS pixels in units for the letterbox, and for the card.
var _vp := Vector2(1280.0, 720.0)
var _px := HudStyle.PX
var _u := 1.0
## Touch controls: no keyboard hints.
var touch := false

var _veil: ColorRect
var _plain: ShaderMaterial
var _drown: ShaderMaterial
var _water := 0.0

var _cine: Control
var _bar_top: ColorRect
var _bar_bot: ColorRect
var _bar_h := 80.0
var _caps: Array[UiText] = []
var _cap_at: Array[Vector2] = []
var _gauge: Control
var _gauge_n: UiText
var _gauge_unit: UiText
var _gauge_at := Vector2.ZERO
var _skip: UiText
var _skipped := false

var _dead: Control
var _card: Control
var _bubbles: _Bubbles
var _report := {}
var _built := false
var _anims: Array[_Anim] = []
var _ticks: Array[Control] = []
var _sail: _Sail
var _again: _Again
var _armed := 1e9

## Seconds since the letterbox came in, since it began to leave, and since
## the card (-1: not yet).
var _t_cine := -1.0
var _t_out := -1.0
var _t_card := -1.0
var _gauge_t := -1.0
var _rest_t := -1.0

## The count-up: the tiles' numbers and what they reach, the renown.
var _tally: Array[UiText] = []
var _tally_to: Array[float] = []
var _tally_best: Array[bool] = []
var _tiles: Array[UiBox] = []
var _tags: Array[Control] = []
var _landed: Array[float] = []
var _score: UiText
var _score_row: Control
var _score_to := 0
var _score_tag: Control
var _score_best := false
var _medal: _Medal
var _medal_fill := 0.0
var _medal_land := -1.0


func _ready() -> void:
	layer = 8
	touch = touch or DisplayServer.is_touchscreen_available()
	_plain = ShaderMaterial.new()
	_plain.shader = preload("res://shaders/farewell.gdshader")
	_drown = ShaderMaterial.new()
	_drown.shader = preload("res://shaders/farewell_drown.gdshader")
	_veil = ColorRect.new()
	_veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_veil.material = _plain
	_veil.visible = false
	add_child(_veil)
	_cine = Control.new()
	_cine.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cine.visible = false
	add_child(_cine)
	_dead = Control.new()
	_dead.mouse_filter = Control.MOUSE_FILTER_STOP
	_dead.visible = false
	add_child(_dead)
	set_process(false)


## The moment she's lost: letterbox the view and caption it.
func begin(r: Dictionary) -> void:
	_report = r
	_vp = get_viewport().get_visible_rect().size
	_px = _vp.y / 390.0
	_built = false
	_skipped = false
	_t_cine = 0.0
	_t_out = -1.0
	_t_card = -1.0
	_gauge_t = -1.0
	_rest_t = -1.0
	_water = 0.0
	_veil.size = _vp
	_veil.material = _plain
	_veil.visible = true
	for m: ShaderMaterial in [_plain, _drown]:
		m.set_shader_parameter("size", _vp)
		m.set_shader_parameter("px", _px)
		m.set_shader_parameter("card", 0.0)
		m.set_shader_parameter("hurt", 0.0)
	_drown.set_shader_parameter("depth", 0.0)
	_build_cine(r)
	_cine.visible = true
	_dead.visible = false
	set_process(true)


## How drowned the view is (0 above .. 1 under), as the camera dives.
func water(k: float) -> void:
	_water = k
	_veil.material = _drown if k > 0.001 else _plain
	_drown.set_shader_parameter("depth", k)


## The letterbox's depth gauge, counting her down (fathoms); it turns gold
## when she comes to rest.
func depth(fathoms: int, rested: bool) -> void:
	if _gauge == null:
		return
	if _gauge_t < 0.0:
		_gauge_t = 0.0
	if rested and _rest_t < 0.0:
		_rest_t = 0.0
	_gauge_n.set_runs([[str(fathoms), _gauge_n.runs[0][1], _gauge_n.runs[0][2], _gauge_n.runs[0][3]]])
	_gauge_unit.set_runs([["FATHOM" if fathoms == 1 else "FATHOMS", _gauge_unit.runs[0][1], _gauge_unit.runs[0][2], _gauge_unit.runs[0][3]]])
	_place_gauge()


## A tap took the cinematic straight to the plunge: the hint has done its job.
func skipped() -> void:
	_skipped = true


## The farewell card over the drowned sea.
func show_card(r: Dictionary) -> void:
	_report = r
	if not _built:
		_build_card(r)
	_t_out = 0.0
	_t_card = 0.0
	_armed = 0.9
	_dead.visible = true
	_save_records()
	_step(0.0)


func end() -> void:
	set_process(false)
	_veil.visible = false
	_cine.visible = false
	_dead.visible = false
	_t_cine = -1.0
	_t_card = -1.0
	_clear(_cine)
	_clear(_dead)
	_built = false
	_gauge = null


func _clear(n: Node) -> void:
	for c in n.get_children():
		c.queue_free()


func _process(dt: float) -> void:
	_step(dt)


func _step(dt: float) -> void:
	if _t_cine >= 0.0:
		_t_cine += dt
	if _t_out >= 0.0:
		_t_out += dt
	if _gauge_t >= 0.0:
		_gauge_t += dt
	if _rest_t >= 0.0:
		_rest_t += dt
	# build the card quietly while she settles, so it's ready the moment she's gone
	if not _built and _t_cine > 3.0 and not _report.is_empty():
		_build_card(_report)
	_step_cine()
	if _t_card >= 0.0:
		_t_card += dt
		_step_card(dt)


# ---------------------------------------------------------------- the letterbox

func _build_cine(r: Dictionary) -> void:
	_clear(_cine)
	_caps.clear()
	_cap_at.clear()
	_cine.size = _vp
	var px := _px
	_bar_h = clampf(_vp.y * 0.11, 40.0 * px, 104.0 * px)
	_bar_top = ColorRect.new()
	_bar_bot = ColorRect.new()
	for b: ColorRect in [_bar_top, _bar_bot]:
		b.color = Color("#01070b")
		b.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.size = Vector2(_vp.x, _bar_h)
		_cine.add_child(b)
	# the caption, over the foot bar: who she was, and what sank her
	var halo := Color(0.0, 0.0, 0.0, 0.42)
	var kick := UiText.new([["ABANDON SHIP", _font("inter", 700, 0.22, 9.6 * px), roundi(9.6 * px), HudStyle.CORAL]])
	var name_px := clampf(_vp.x * 0.044, 26.0 * px, 50.0 * px)
	var cls: ShipClass = ShipClass.named(str(r.cls))
	var nm := UiText.new([
		[str(r.ship), _font("cinzel", 700, 0.02, name_px), roundi(name_px), HudStyle.INK],
		["   " + cls.name.to_upper(), _font("inter", 700, 0.22, 11.0 * px), roundi(11.0 * px), HudStyle.INK_3],
	], 0.0, 1.05)
	var cause_px := clampf(_vp.x * 0.016, 14.0 * px, 17.0 * px)
	var cause := UiText.new(_cause_runs(r, _font("inter", 500, 0.0, cause_px), _font("cinzel", 700, 0.03, cause_px), roundi(cause_px), HudStyle.INK_2, HudStyle.GOLD_HI, false), 0.0, 1.4)
	var left := _vp.x * 0.05
	var bottom := _vp.y - _bar_h - clampf(_vp.y * 0.03, 14.0 * px, 30.0 * px)
	var y := bottom - cause.size.y
	var ys := [y - 8.0 * px - nm.size.y - 6.0 * px - kick.size.y, y - 8.0 * px - nm.size.y, y]
	var i := 0
	for t: UiText in [kick, nm, cause]:
		t.halo = halo
		t.position = Vector2(left, ys[i])
		_cine.add_child(t)
		_caps.append(t)
		_cap_at.append(t.position)
		i += 1
	# the depth gauge and the skip hint, at the right of the foot bar
	_gauge = Control.new()
	_gauge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cine.add_child(_gauge)
	var glyph := _Glyph.new(Vector2(8.0, 22.0) * px, px)
	_gauge.add_child(glyph)
	var n_px := clampf(_vp.x * 0.022, 18.0 * px, 24.0 * px)
	_gauge_n = UiText.new([["0", _tnum(_font("cinzel", 700, 0.0, n_px)), roundi(n_px), HudStyle.INK]], 0.0, 1.0)
	_gauge_unit = UiText.new([["FATHOMS", _font("inter", 700, 0.2, 10.5 * px), roundi(10.5 * px), HudStyle.INK_3]], 0.0, 1.0)
	_gauge.add_child(_gauge_n)
	_gauge.add_child(_gauge_unit)
	_gauge.modulate.a = 0.0
	var skip_text := "TAP TO SKIP" if touch else "SKIP  ·  SPACE"
	_skip = UiText.new([[skip_text, _font("inter", 600, 0.08, 12.0 * px), roundi(12.0 * px), HudStyle.INK_3]])
	_skip.modulate.a = 0.0
	_cine.add_child(_skip)
	_place_gauge()


func _place_gauge() -> void:
	if _gauge == null:
		return
	var px := _px
	var mid := _vp.y - _bar_h + (_bar_h - _vp.y * 0.03) * 0.5
	var right := _vp.x * 0.95
	_skip.position = Vector2(right - _skip.size.x, mid - _skip.size.y * 0.5)
	var glyph: Control = _gauge.get_child(0)
	var gap := 6.0 * px
	var nw := maxf(_gauge_n.size.x, _gauge_n.runs[0][1].get_string_size("00", HORIZONTAL_ALIGNMENT_LEFT, -1, _gauge_n.runs[0][2]).x)
	var w := glyph.size.x + gap + nw + gap + _gauge_unit.size.x
	var base := _gauge_n.baseline()
	glyph.position = Vector2(0.0, base - _gauge_n.runs[0][2] * 0.36 - glyph.size.y * 0.5)
	_gauge_n.position = Vector2(glyph.size.x + gap + nw - _gauge_n.size.x, 0.0)
	_gauge_unit.position = Vector2(glyph.size.x + gap + nw + gap, base - _gauge_unit.baseline())
	_gauge.size = Vector2(w, _gauge_n.size.y)
	var margin := clampf(_vp.x * 0.03, 14.0 * px, 30.0 * px)
	_gauge_at = Vector2(_skip.position.x - margin - w, mid - _gauge_n.size.y * 0.5)


func _step_cine() -> void:
	if not _cine.visible:
		return
	var t := _t_cine
	# the blow: a hot red bruise at the edges that fades as she settles
	var hurt := 0.0
	if t < 2.4:
		var k := t / 2.4
		hurt = _bz(Vector4(0.0, 0.0, 0.58, 1.0), k / 0.08) if k < 0.08 else 1.0 - _bz(Vector4(0.0, 0.0, 0.58, 1.0), (k - 0.08) / 0.92)
	for m: ShaderMaterial in [_plain, _drown]:
		m.set_shader_parameter("hurt", hurt)
	# the bars slide in, and out again for the card
	var e := _bz(EASE, t / 1.1)
	if _t_out >= 0.0:
		e = 1.0 - _bz(EASE, _t_out / 0.9)
	_bar_top.position = Vector2(0.0, -_bar_h * 1.01 * (1.0 - e))
	_bar_bot.position = Vector2(0.0, _vp.y - _bar_h + _bar_h * 1.01 * (1.0 - e))
	var shift := _bar_h * 1.01 * (1.0 - e)
	# the caption rises in line by line, and fades as the bars leave
	var out := 1.0 if _t_out < 0.0 else 1.0 - clampf(_t_out / 0.5, 0.0, 1.0)
	var lag := [0.7, 0.95, 1.35]
	for i in _caps.size():
		var k := _bz(EASE, (t - lag[i]) / 1.0)
		_caps[i].modulate.a = k * out
		_caps[i].position = _cap_at[i] + Vector2(0.0, (1.0 - k) * 12.0 * _px + (1.0 - out) * 10.0 * _px)
	# the gauge comes up when she starts down, and the hint after a moment
	if _gauge != null:
		var g := _bz(EASE, _gauge_t / 0.6) if _gauge_t >= 0.0 else 0.0
		_gauge.modulate.a = g * out
		_gauge.position = _gauge_at + Vector2(0.0, (1.0 - g) * 6.0 * _px + shift)
		var rest := clampf(_rest_t / 0.8, 0.0, 1.0) if _rest_t >= 0.0 else 0.0
		_gauge_n.modulate = HudStyle.INK.lerp(HudStyle.GOLD_HI, rest)
		var s := clampf((t - 2.0) / 0.6, 0.0, 1.0) if not _skipped and _t_out < 0.0 else 0.0
		_skip.modulate.a = s
		_skip.position.y = _vp.y - _bar_h + (_bar_h - _vp.y * 0.03) * 0.5 - _skip.size.y * 0.5 + shift
	if _t_out > 1.0:
		_cine.visible = false


# ---------------------------------------------------------------- the card

## Lays the card out: the head (title and plaque), then renown, the tally
## and the voyage, and the log over the way back up, in three columns.
## Sized in the web's CSS pixels at _u units each, as large as fits.
func _build_card(r: Dictionary) -> void:
	_built = true
	var mx := maxf(_vp.x * 0.03, 16.0)
	var my := _vp.y * 0.03
	var avail := _vp - Vector2(mx, my) * 2.0
	# lay it out as big as it may go, then at the size that fits (a narrower
	# card can lay its parts out differently, so check again)
	_u = U_MAX
	var need := _layout(r, avail)
	for i in 3:
		var k := minf(avail.x / need.x, avail.y / need.y)
		if k >= 0.999:
			break
		_u *= k * 0.995
		need = _layout(r, avail)
	_card.position = Vector2(mx + (avail.x - need.x) * 0.5, my + maxf(0.0, (avail.y - need.y) * 0.5))
	# the light pooled behind the title
	var pool := Vector4(_vp.x * 0.5, _card.position.y + (-40.0 + 300.0 * 0.42) * _u, minf(1100.0 * _u, need.x * 1.3) * 0.5, 150.0 * _u)
	for m: ShaderMaterial in [_plain, _drown]:
		m.set_shader_parameter("pool", pool)


## Builds the card at the current scale; returns its size.
func _layout(r: Dictionary, avail: Vector2) -> Vector2:
	_clear(_dead)
	_anims.clear()
	_ticks.clear()
	_tally.clear()
	_tally_to.clear()
	_tally_best.clear()
	_tiles.clear()
	_tags.clear()
	_landed.clear()
	_dead.size = _vp
	_bubbles = _Bubbles.new(_vp, _px)
	_dead.add_child(_bubbles)
	_ticks.append(_bubbles)
	_card = Control.new()
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dead.add_child(_card)
	var u := _u
	var recs := _load_records()
	var score := _renown(r)
	var first := int(recs.voyages) == 0
	var best := {
		"renown": _beat(first, score, recs.renown), "gold": _beat(first, r.gold, recs.gold), "kills": _beat(first, r.kills, recs.kills),
		"isles": _beat(first, r.isles, recs.isles), "time": _beat(first, r.time, recs.time),
	}
	# how wide: the tally takes whatever the renown and the log leave
	var width := minf(avail.x, 1180.0 * u)
	var wb := width - (COL_A + COL_C + GAP * 2.0) * u
	if wb < COL_B * u:
		wb = COL_B * u
		width = (COL_A + COL_B + COL_C + GAP * 2.0) * u
	var y := _build_head(r, width)
	y += 12.0 * u
	var body := Control.new()
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.position = Vector2(0.0, y)
	_card.add_child(body)
	var a := _build_rank(r, score, best)
	var b := _build_stats(r, recs, best, first, wb)
	var c := _build_log(r)
	var h := maxf(a.size.y, maxf(b.size.y, c.size.y))
	_stretch_rank(a, h)
	_stretch_stats(b, h)
	_stretch_log(c, h, r)
	b.position.x = (COL_A + GAP) * u
	c.position.x = b.position.x + wb + GAP * u
	for p: Control in [a, b, c]:
		body.add_child(p)
	_rise(a, 0.7, 0.75)
	_rise(b, 0.8, 0.75)
	_rise(c, 0.9, 0.75)
	return Vector2(width, y + h)


func _build_head(r: Dictionary, width: float) -> float:
	var u := _u
	var cls: ShipClass = ShipClass.named(str(r.cls))
	# the kicker: shipwrecked, and how
	var kp := 11.0 * u
	var runs := [["SHIPWRECKED", _font("inter", 700, 0.22, kp), roundi(kp), HudStyle.CORAL], ["  •  ", _font("inter", 700, 0.0, kp), roundi(kp), Color(HudStyle.CORAL, 0.6)]]
	runs.append_array(_cause_runs(r, _font("inter", 700, 0.16, kp), _font("cinzel", 700, 0.08, kp), roundi(kp), HudStyle.INK_3, HudStyle.INK_2, true))
	var kick := UiText.new(runs, 0.0, 1.2)
	kick.position = Vector2((width - kick.size.x) * 0.5, 0.0)
	_card.add_child(kick)
	_rise(kick, 0.0, 0.7)
	var y := kick.size.y + 4.0 * u
	# the title: each letter sinks into place, each word sways on the swell
	var tp := 46.0 * u
	var tf := _font("inter", 800, -0.045, tp)
	var mat := _grad(SEA_GRAD, 0.0, tf.get_height(roundi(tp)) + 0.06 * tp)
	var title := "Lost to the Depths"
	var full := tf.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(tp)).x
	var x0 := (width - full) * 0.5
	var line := 0.94 * tp
	var top := y + (line - tf.get_height(roundi(tp))) * 0.5
	var words := title.split(" ")
	var at := 0
	for wi in words.size():
		var word := _Sway.new(wi, u)
		word.position = Vector2(0.0, top)
		_card.add_child(word)
		_ticks.append(word)
		for ci in words[wi].length():
			var ch := words[wi][ci]
			var x := tf.get_string_size(title.substr(0, at + ci + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(tp)).x - tf.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(tp)).x
			var l := UiText.new([[ch, tf, roundi(tp), Color.WHITE]], 0.0, 0.0)
			l.material = mat
			l.position = Vector2(x0 + x, 0.0)
			l.pivot_offset = l.size * 0.5
			word.add_child(l)
			_letter(l, 0.1 + (wi * 4 + ci) * 0.045, tp)
		at += words[wi].length() + 1
	y += line + 8.0 * u
	# the plaque: a porthole with her going under, her name in brass, her epitaph
	var port_d := 60.0 * u
	var plaque := Control.new()
	plaque.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var text_w := minf(760.0 * u, width) - port_d - 14.0 * u
	var name_px := 22.0 * u
	var nm := UiText.new([[str(r.ship), _font("cinzel", 700, 0.03, name_px), roundi(name_px), Color.WHITE]], 0.0, 1.05)
	nm.material = _grad(GOLD_GRAD, 0.0, nm.size.y)
	var cl := UiText.new([[cls.name.to_upper(), _font("inter", 800, 0.24, 10.5 * u), roundi(10.5 * u), HudStyle.INK_3]])
	var ep := UiText.new(_epitaph(r), text_w, 1.45)
	var qp := 12.5 * u
	var quip := UiText.new([["“%s”" % _quip(r), _italic(_font("inter", 500, 0.0, qp)), roundi(qp), HudStyle.INK_3]], text_w, 1.45)
	var tw := maxf(nm.size.x + 12.0 * u + cl.size.x, maxf(ep.size.x, quip.size.x))
	var th := nm.size.y + 3.0 * u + ep.size.y + 3.0 * u + quip.size.y
	var ph := maxf(port_d, th)
	var port := _Port.new(port_d, u, cls)
	port.position = Vector2(0.0, (ph - port_d) * 0.5)
	plaque.add_child(port)
	var tx := port_d + 14.0 * u
	var ty := (ph - th) * 0.5
	nm.position = Vector2(tx, ty)
	cl.position = Vector2(tx + nm.size.x + 12.0 * u, ty + nm.baseline() - cl.baseline())
	ep.position = Vector2(tx, ty + nm.size.y + 3.0 * u)
	quip.position = Vector2(tx, ep.position.y + ep.size.y + 3.0 * u)
	for n: Control in [nm, cl, ep, quip]:
		plaque.add_child(n)
	plaque.size = Vector2(tx + tw, ph)
	plaque.position = Vector2((width - plaque.size.x) * 0.5, y)
	_card.add_child(plaque)
	_rise(plaque, 0.55, 0.8)
	return y + ph


## Renown and rank: the medal filling toward the next rank, the score
## counting up, the rank, the ladder of all nine, and how far to the next.
func _build_rank(_r: Dictionary, score: int, best: Dictionary) -> UiBox:
	var u := _u
	var w := COL_A * u
	var panel := _panel(Vector2(w, 10.0), 26.0)
	var ri := _rank_of(score)
	var rank: Array = RANKS[ri]
	var nxt: Array = RANKS[ri + 1] if ri + 1 < RANKS.size() else []
	var prog := 1.0 if nxt.is_empty() else float(score - int(rank[0])) / float(int(nxt[0]) - int(rank[0]))
	var col := Control.new()
	col.name = "Col"
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(col)
	var y := 0.0
	var md := 96.0 * u
	_medal = _Medal.new(md, u)
	_medal.position = Vector2((w - md) * 0.5, y)
	col.add_child(_medal)
	_ticks.append(_medal)
	_medal_fill = clampf(prog, 0.0, 1.0)
	_medal_land = -1.0
	_score_best = bool(best.renown)
	y += md + 12.0 * u
	var kick := UiText.new([["YOUR RENOWN", _font("inter", 700, 0.22, 10.0 * u), roundi(10.0 * u), HudStyle.INK_3]], 0.0, 1.2)
	kick.position = Vector2((w - kick.size.x) * 0.5, y)
	col.add_child(kick)
	y += kick.size.y + 3.0 * u
	_score_row = Control.new()
	_score_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_score_row.position = Vector2(0.0, y)
	col.add_child(_score_row)
	var sp := 34.0 * u
	_score = UiText.new([["0", _tnum(_font("inter", 800, -0.03, sp)), roundi(sp), Color.WHITE]], 0.0, 1.0)
	_score.material = _grad(GOLD_GRAD, 0.0, _score.size.y)
	_score_row.add_child(_score)
	_score_to = score
	_score_tag = _pill("NEW BEST")
	_score_tag.visible = false
	_score_row.add_child(_score_tag)
	_score_row.size = Vector2(w, _score.size.y)
	_place_score()
	y += _score.size.y + 3.0 * u
	var rn := UiText.new([[str(rank[1]), _font("inter", 800, -0.01, 17.0 * u), roundi(17.0 * u), HudStyle.INK]], 0.0, 1.15)
	rn.position = Vector2((w - rn.size.x) * 0.5, y)
	col.add_child(rn)
	y += rn.size.y + 2.0 * u
	var rl := UiText.new([[str(rank[2]), _font("inter", 500, 0.0, 13.0 * u), roundi(13.0 * u), HudStyle.INK_3]], w - 36.0 * u, 1.45)
	rl.align = HORIZONTAL_ALIGNMENT_CENTER
	rl.size.x = w - 36.0 * u
	rl.position = Vector2(18.0 * u, y)
	col.add_child(rl)
	y += rl.size.y + 10.0 * u
	var lad := _Ladder.new(ri, RANKS.size(), u, _font("inter", 700, 0.14, 9.5 * u))
	lad.position = Vector2((w - lad.size.x) * 0.5, y)
	col.add_child(lad)
	_ticks.append(lad)
	y += lad.size.y + 10.0 * u
	var np := 11.5 * u
	var nr: Array
	if nxt.is_empty():
		nr = [["The highest rank on these seas", _font("inter", 600, 0.0, np), roundi(np), HudStyle.INK_3]]
	else:
		nr = [[_num(int(nxt[0]) - score), _font("inter", 700, 0.0, np), roundi(np), HudStyle.GOLD], [" renown to " + str(nxt[1]), _font("inter", 600, 0.0, np), roundi(np), HudStyle.INK_3]]
	var nt := UiText.new(nr, 0.0, 1.2)
	var pill := UiBox.new(nt.size + Vector2(24.0, 12.0) * u, 999.0, 2.0)
	pill.p("c_top", Color(1, 1, 1, 0.05)).p("c_foot", Color(1, 1, 1, 0.05)).p("border", 0.0).p("c_shadow", Color(0, 0, 0, 0)).p("hi", 0.0)
	nt.position = Vector2(12.0, 6.0) * u
	pill.add_child(nt)
	pill.position = Vector2((w - pill.size.x) * 0.5, y)
	col.add_child(pill)
	y += pill.size.y
	col.size = Vector2(w, y)
	panel.resize(Vector2(w, y + 32.0 * u))
	return panel


func _stretch_rank(panel: UiBox, h: float) -> void:
	var col: Control = panel.get_node("Col")
	col.position.y = (h - col.size.y) * 0.5
	panel.resize(Vector2(panel.size.x, h))


func _place_score() -> void:
	var w := _score_row.size.x
	var gap := 10.0 * _u
	var rw := _score.size.x + ((gap + _score_tag.size.x) if _score_tag.visible else 0.0)
	_score.position = Vector2((w - rw) * 0.5, 0.0)
	_score_tag.position = Vector2(_score.position.x + _score.size.x + gap, (_score.size.y - _score_tag.size.y) * 0.5)


## The tally (time, gold, prizes, isles) against your records, and the voyage.
func _build_stats(r: Dictionary, recs: Dictionary, best: Dictionary, first: bool, wb: float) -> Control:
	var u := _u
	var col := Control.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tw := (wb - 8.0 * u * 3.0) / 4.0
	var specs := [
		["clock", "AT SEA", float(r.time), bool(best.time), float(recs.time)],
		["coin", "GOLD", float(r.gold), bool(best.gold), float(recs.gold)],
		["skull", "SUNK", float(r.kills), bool(best.kills), float(recs.kills)],
		["isle", "ISLES OF %d" % int(r.isles_total), float(r.isles), bool(best.isles), float(recs.isles)],
	]
	var th := 0.0
	for i in 4:
		var s: Array = specs[i]
		var tile := _tile(i, s, first, tw)
		tile.position = Vector2(i * (tw + 8.0 * u), 0.0)
		col.add_child(tile)
		th = tile.size.y
		_rise(tile, 0.8 + i * 0.08, 0.6)
	# the voyage, from harbour to the sea floor
	var vy := _panel(Vector2(wb, 10.0), 26.0)
	vy.name = "Voyage"
	vy.position = Vector2(0.0, th + 10.0 * u)
	col.add_child(vy)
	var pad := Vector2(18.0, 14.0) * u
	var kick := UiText.new([["THE VOYAGE", _font("inter", 700, 0.22, 10.0 * u), roundi(10.0 * u), HudStyle.INK_3]], 0.0, 1.2)
	kick.position = pad
	vy.add_child(kick)
	var len_t := UiText.new([[_duration(float(r.time)), _font("inter", 600, 0.04, 10.0 * u), roundi(10.0 * u), HudStyle.INK_4]], 0.0, 1.2)
	len_t.position = Vector2(wb - pad.x - len_t.size.x, pad.y)
	vy.add_child(len_t)
	var track := _Track.new(r, wb - pad.x * 2.0 - 24.0 * u, 52.0 * u, u)
	track.position = Vector2(pad.x + 12.0 * u, pad.y + kick.size.y + 8.0 * u)
	vy.add_child(track)
	_ticks.append(track)
	# the ends of the line: set sail, the log's length, lost
	var ep := 9.5 * u
	var ef := _font("inter", 700, 0.14, ep)
	var ends_y := track.position.y + track.size.y + 6.0 * u
	var anchor := Icons.rect("anchor", 13.0 * u, HudStyle.AQUA)
	var set_sail := UiText.new([["SET SAIL", ef, roundi(ep), HudStyle.INK_3]], 0.0, 1.2)
	anchor.position = Vector2(pad.x, ends_y + (set_sail.size.y - anchor.size.y) * 0.5)
	set_sail.position = Vector2(pad.x + 18.0 * u, ends_y)
	var n := (r.events as Array).size()
	var mid := UiText.new([["%d %s in the log" % [n, "entry" if n == 1 else "entries"] if n > 0 else "A quiet voyage", _font("inter", 600, 0.08, 10.5 * u), roundi(10.5 * u), HudStyle.INK_4]], 0.0, 1.2)
	mid.position = Vector2((wb - mid.size.x) * 0.5, ends_y + (set_sail.size.y - mid.size.y) * 0.5)
	var lost := UiText.new([["LOST · " + _clock(float(r.time)), ef, roundi(ep), HudStyle.CORAL]], 0.0, 1.2)
	lost.position = Vector2(wb - pad.x - lost.size.x, ends_y)
	for e: Control in [anchor, set_sail, mid, lost]:
		vy.add_child(e)
	# the finer tally, pinned to the panel's foot
	var minor := Control.new()
	minor.name = "Minor"
	minor.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vy.add_child(minor)
	var shots := int(r.shots)
	var hits := int(r.hits)
	var rate := mini(100, roundi(hits * 100.0 / shots)) if shots > 0 else 0
	var dealt := int(r.dealt)
	var kills := int(r.kills)
	var rows := [
		["target", "ACCURACY", "%d%%" % rate if shots > 0 else "–", "%d of %d hit" % [hits, shots] if shots > 0 else "no shots fired"],
		["cannon", "DAMAGE", _num(dealt), "%s per prize" % _num(roundi(float(dealt) / kills)) if kills > 0 else "hull points"],
		["hull", "TAKEN", _num(int(r.get("taken", 0))), "hull points"],
		["wind", "SAILED", "%.1f" % float(r.miles), "sea miles"],
	]
	# four across where there's room for their words, else two by two
	var cols := 4 if wb / u >= 490.0 else 2
	var cw := (wb - pad.x * 2.0 - 16.0 * u * (cols - 1)) / cols
	var mh := 0.0
	for i in 4:
		var m := _minor(rows[i], cw)
		minor.add_child(m)
		mh = maxf(mh, m.size.y)
	for i in 4:
		var m: Control = minor.get_child(i)
		m.position = Vector2(pad.x + (i % cols) * (cw + 16.0 * u), 12.0 * u + floori(i / float(cols)) * (mh + 12.0 * u))
	minor.size = Vector2(wb, 12.0 * u + (mh + 12.0 * u) * (4.0 / cols) - 12.0 * u)
	var natural := ends_y + set_sail.size.y + 10.0 * u + minor.size.y + pad.y
	vy.resize(Vector2(wb, natural))
	col.size = Vector2(wb, vy.position.y + natural)
	return col


func _stretch_stats(col: Control, h: float) -> void:
	var vy: UiBox = col.get_node("Voyage")
	var vh := h - vy.position.y
	vy.resize(Vector2(vy.size.x, vh))
	var minor: Control = vy.get_node("Minor")
	minor.position.y = vh - 14.0 * _u - minor.size.y
	var rule := ColorRect.new()
	rule.color = Color(1, 1, 1, 0.06)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rule.position = Vector2(18.0 * _u, minor.position.y)
	rule.size = Vector2(vy.size.x - 36.0 * _u, maxf(1.0, _u * 0.8))
	vy.add_child(rule)
	col.size.y = h


func _tile(i: int, s: Array, first: bool, w: float) -> UiBox:
	var u := _u
	var tile := _panel(Vector2(w, 10.0), 22.0)
	var y := 14.0 * u
	var icon := Icons.rect(str(s[0]), 18.0 * u * 1.5)
	icon.position = Vector2((w - icon.size.x) * 0.5, y - 4.5 * u)
	tile.add_child(icon)
	y += 18.0 * u + 5.0 * u
	var np := 26.0 * u
	var num := UiText.new([[_tally_fmt(i, 0.0), _tnum(_font("inter", 800, -0.03, np)), roundi(np), HudStyle.INK]], 0.0, 1.0)
	num.align = HORIZONTAL_ALIGNMENT_CENTER
	num.fit(w)
	num.position = Vector2(0.0, y)
	num.pivot_offset = Vector2(w * 0.5, num.size.y * 0.5)
	tile.add_child(num)
	y += num.size.y + 5.0 * u
	var lab := UiText.new([[str(s[1]), _font("inter", 700, 0.16, 10.5 * u), roundi(10.5 * u), HudStyle.INK_3]], 0.0, 1.2)
	lab.position = Vector2((w - lab.size.x) * 0.5, y)
	tile.add_child(lab)
	y += lab.size.y + 3.0 * u
	# the record it's measured against
	var v: float = s[2]
	var rec: float = s[4]
	var tag: bool = s[3]
	var fmt := _clock(rec) if i == 0 else _num(roundi(rec))
	var rt := "First voyage" if first else ("was " + fmt if tag else ("best " + fmt if rec > 0.0 else ("a first" if v > 0.0 else " ")))
	var rec_t := UiText.new([[rt, _font("inter", 600, 0.0, 10.5 * u), roundi(10.5 * u), Color(HudStyle.GOLD, 0.7) if tag else HudStyle.INK_4]], 0.0, 1.2)
	if tag:
		rec_t.strike = Color(HudStyle.GOLD, 0.45)
	rec_t.position = Vector2((w - rec_t.size.x) * 0.5, y)
	tile.add_child(rec_t)
	y += rec_t.size.y + 11.0 * u
	tile.resize(Vector2(w, y))
	var pill := _pill("NEW BEST")
	pill.position = Vector2((w - pill.size.x) * 0.5, -9.0 * u)
	pill.visible = false
	tile.add_child(pill)
	_tally.append(num)
	_tally_to.append(v)
	_tally_best.append(tag)
	_tiles.append(tile)
	_tags.append(pill)
	_landed.append(-1.0)
	return tile


func _minor(row: Array, w: float) -> Control:
	var u := _u
	var m := Control.new()
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var disc := UiBox.new(Vector2(32.0, 32.0) * u, 999.0, 1.0)
	disc.p("c_top", Color(HudStyle.AQUA, 0.1)).p("c_foot", Color(HudStyle.AQUA, 0.1)).p("border", 0.0).p("c_shadow", Color(0, 0, 0, 0)).p("hi", 0.0)
	var icon := Icons.rect(str(row[0]), 18.0 * u, HudStyle.AQUA)
	icon.position = Vector2(7.0, 7.0) * u
	disc.add_child(icon)
	m.add_child(disc)
	var tx := 42.0 * u
	var cut := w - tx
	var lab := UiText.new([[str(row[1]), _font("inter", 700, 0.16, 10.0 * u), roundi(10.0 * u), HudStyle.INK_3]], 0.0, 1.2)
	lab.cut_to(cut)
	var val := UiText.new([[str(row[2]), _tnum(_font("inter", 800, -0.02, 18.0 * u)), roundi(18.0 * u), HudStyle.INK]], 0.0, 1.2)
	var sub := UiText.new([[str(row[3]), _font("inter", 500, 0.0, 11.5 * u), roundi(11.5 * u), HudStyle.INK_3]], 0.0, 1.3)
	sub.cut_to(cut)
	var h := lab.size.y + val.size.y + sub.size.y
	var top := maxf(0.0, (32.0 * u - h) * 0.5)
	lab.position = Vector2(tx, top)
	val.position = Vector2(tx, top + lab.size.y)
	sub.position = Vector2(tx, val.position.y + val.size.y)
	disc.position = Vector2(0.0, maxf(0.0, (h - 32.0 * u) * 0.5))
	for n: Control in [lab, val, sub]:
		m.add_child(n)
	m.size = Vector2(w, maxf(h, 32.0 * u))
	return m


## The ship's log: the last few deeds worth writing down, and the end; and
## under it the way back up.
func _build_log(r: Dictionary) -> Control:
	var u := _u
	var col := Control.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var w := COL_C * u
	var panel := _panel(Vector2(w, 10.0), 26.0)
	panel.name = "Log"
	col.add_child(panel)
	_sail = _Sail.new(str(r.cls), w, u, not touch)
	_sail.name = "Sail"
	_sail.pressed.connect(_on_sail)
	col.add_child(_sail)
	_ticks.append(_sail)
	_again = _Again.new(w, u, not touch)
	_again.name = "Again"
	_again.pressed.connect(_on_again)
	col.add_child(_again)
	_ticks.append(_again)
	# the least it needs: the kicker, the end, and room for a few entries
	var natural := 18.0 * u + 12.0 * u + 12.0 * u + _row_h() * 4.0 + 14.0 * u
	panel.resize(Vector2(w, natural))
	col.size = Vector2(w, natural + _ways_h())
	return col


## The ways back up under the log: Sail again over Choose a new ship.
func _ways_h() -> float:
	return 10.0 * _u + _sail.size.y + 8.0 * _u + _again.size.y


func _row_h() -> float:
	return 44.0 * _u


func _stretch_log(col: Control, h: float, r: Dictionary) -> void:
	var u := _u
	var panel: UiBox = col.get_node("Log")
	var sail: Control = col.get_node("Sail")
	var again: Control = col.get_node("Again")
	var ph := h - _ways_h()
	panel.resize(Vector2(panel.size.x, ph))
	sail.position = Vector2(0.0, ph + 10.0 * u)
	again.position = Vector2(0.0, sail.position.y + sail.size.y + 8.0 * u)
	_rise(sail, 1.2, 0.7)
	_rise(again, 1.28, 0.7)
	var w := panel.size.x
	var pad := Vector2(20.0, 18.0) * u
	var events: Array = r.events
	var room := maxi(1, int((ph - pad.y - 12.0 * u - 12.0 * u - 14.0 * u) / _row_h()))
	var shown := events.slice(maxi(0, events.size() - (room - 1)))
	var kick := UiText.new([["SHIP'S LOG", _font("inter", 700, 0.22, 10.0 * u), roundi(10.0 * u), HudStyle.INK_3]], 0.0, 1.2)
	kick.position = pad
	panel.add_child(kick)
	if events.size() > shown.size():
		var more := UiText.new([["%d earlier %s" % [events.size() - shown.size(), "entry" if events.size() - shown.size() == 1 else "entries"], _font("inter", 600, 0.04, 10.0 * u), roundi(10.0 * u), HudStyle.INK_4]], 0.0, 1.2)
		more.position = Vector2(w - pad.x - more.size.x, pad.y)
		panel.add_child(more)
	var y := pad.y + kick.size.y + 12.0 * u
	var rows: Array = []
	for e: Dictionary in shown:
		rows.append([_clock(float(e.t)), KIND_ICON.get(str(e.kind), "coin"), [[str(e.text), _font("inter", 700, 0.0, 13.0 * u), roundi(13.0 * u), HudStyle.INK]], [[str(e.detail), _font("inter", 500, 0.0, 11.5 * u), roundi(11.5 * u), HudStyle.INK_3]]])
	if shown.is_empty():
		rows.append(["", "", [], [["A quiet voyage. Nothing worth writing down.", _font("inter", 500, 0.0, 11.5 * u), roundi(11.5 * u), HudStyle.INK_3]]])
	rows.append([_clock(float(r.time)), "skull", [["Lost with all hands", _font("inter", 700, 0.0, 13.0 * u), roundi(13.0 * u), HudStyle.CORAL]],
			_cause_runs(r, _font("inter", 500, 0.0, 11.5 * u), _font("cinzel", 700, 0.03, 11.0 * u), roundi(11.5 * u), HudStyle.INK_3, HudStyle.GOLD_HI, false)])
	var tx := pad.x + 36.0 * u + 10.0 * u + 16.0 * u + 10.0 * u
	var cut := w - pad.x - tx
	for i in rows.size():
		var row: Array = rows[i]
		var line := Control.new()
		line.mouse_filter = Control.MOUSE_FILTER_IGNORE
		line.position = Vector2(0.0, y)
		panel.add_child(line)
		var rh := 0.0
		if str(row[0]) != "":
			var tm := UiText.new([[str(row[0]), _tnum(_font("inter", 600, 0.0, 11.5 * u)), roundi(11.5 * u), HudStyle.INK_3]], 0.0, 1.3)
			tm.position = Vector2(pad.x + 36.0 * u - tm.size.x, 1.0 * u)
			line.add_child(tm)
			var ic := Icons.rect(str(row[1]), 14.0 * u * 1.5)
			ic.position = Vector2(pad.x + 36.0 * u + 10.0 * u + 1.0 * u - 3.5 * u, -2.5 * u)
			line.add_child(ic)
		var ty := 0.0
		if not (row[2] as Array).is_empty():
			var b := UiText.new(row[2], 0.0, 1.3)
			b.cut_to(cut)
			b.position = Vector2(tx, 0.0)
			line.add_child(b)
			ty = b.size.y + 1.0 * u
		var sm := UiText.new(row[3], cut if str(row[0]) != "" else w - pad.x * 2.0, 1.3)
		sm.position = Vector2(tx if str(row[0]) != "" else pad.x, ty)
		line.add_child(sm)
		rh = ty + sm.size.y
		# the thread of the voyage, down through the markers
		if i < rows.size() - 1 and str(row[0]) != "":
			var thread := _Thread.new(Vector2(pad.x + 53.0 * u, 17.0 * u), _row_h() - 18.0 * u, u)
			line.add_child(thread)
		_slide(line, 1.05 + i * 0.07, 0.5)
		y += maxf(_row_h(), rh + 10.0 * u)


func _on_sail() -> void:
	if _t_card >= 0.0 and _t_card >= _armed:
		retry.emit()


func _on_again() -> void:
	if can_leave():
		harbour.emit()


## Whether the card has settled enough to be left (a tap that skipped the
## farewell mustn't also take a way back up).
func can_leave() -> bool:
	return _dead.visible and _t_card >= 0.0 and _t_card >= _armed


func _unhandled_input(event: InputEvent) -> void:
	if not _dead.visible or _t_card < _armed:
		return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE]:
		get_viewport().set_input_as_handled()
		retry.emit()


func _step_card(dt: float) -> void:
	var t := _t_card
	# the drowned backdrop, the shafts and everything on it fade in together
	var f := _bz(CSS_EASE, t / 1.2)
	_dead.modulate.a = f
	for m: ShaderMaterial in [_plain, _drown]:
		m.set_shader_parameter("card", f)
	for a in _anims:
		_animate(a, t)
	for c in _ticks:
		c.call("tick", t, dt)
	# the numbers roll up one after another, each landing with a little bump
	var t0 := 0.7
	for i in _tally.size():
		var k := clampf((t - t0 - i * 0.26) / 0.9, 0.0, 1.0)
		var v := _tally_to[i] * (1.0 - pow(1.0 - k, 3.0))
		_tally[i].set_text(_tally_fmt(i, v))
		if k >= 1.0 and _landed[i] < 0.0:
			_landed[i] = t
			Input.vibrate_handheld(24 if _tally_best[i] else 8)
			tallied.emit(i, _tally_best[i])
		_step_landed(i, t)
	var ks := clampf((t - t0 - 0.3) / 2.0, 0.0, 1.0)
	_score.set_text(_num(roundi(_score_to * (1.0 - pow(1.0 - ks, 3.0)))))
	if ks >= 1.0 and _medal_land < 0.0:
		_medal_land = t
		_score_tag.visible = _score_best
		Input.vibrate_handheld(30 if _score_best else 10)
		tallied.emit(5, _score_best)
	_place_score()
	# the medal's ring fills to the rank's share, then it lands with a glow
	_medal.fill = _medal_fill * _bz(EASE, (t - 1.0) / 2.3)
	_medal.landed = _bz(EASE, (t - _medal_land) / 0.6) if _medal_land >= 0.0 else 0.0
	_medal.best = 1.0 if _score_best else 0.0
	var ms := 1.0 + 0.04 * (_bz(SPRING, (t - _medal_land) / 0.6) if _medal_land >= 0.0 else 0.0)
	_medal.scale = Vector2(ms, ms)
	if _medal_land >= 0.0:
		_pop(_score_tag, (t - _medal_land) / 0.6)
	if _sail != null:
		_sail.armed = t >= _armed
	if _again != null:
		_again.armed = t >= _armed


## A landed tile: its number bumps, and a record lights it gold with its pill.
func _step_landed(i: int, t: float) -> void:
	var l := _landed[i]
	if l < 0.0:
		return
	var k := clampf((t - l) / 0.55, 0.0, 1.0)
	var e := _bz(SPRING, k / 0.4) if k < 0.4 else 1.0 - _bz(SPRING, (k - 0.4) / 0.6)
	var s := 1.0 + 0.14 * e
	_tally[i].scale = Vector2(s, s)
	var best := _tally_best[i]
	var base := HudStyle.GOLD_HI if best else HudStyle.INK
	_tally[i].modulate = base.lerp(Color.WHITE, e)
	if best:
		var g := clampf((t - l) / 0.4, 0.0, 1.0)
		_tiles[i].p("c_border", Color(1, 1, 1, 0.11).lerp(Color(HudStyle.GOLD, 0.55), g))
		_tiles[i].p("c_glow", Color(HudStyle.GOLD, 0.22 * g))
		_tags[i].visible = true
		_pop(_tags[i], (t - l) / 0.6)


## wkTag / wkPill: a pill pops in from a pinch with a springy overshoot.
func _pop(n: Control, k: float) -> void:
	var e := _bz(SPRING, clampf(k, 0.0, 1.0))
	n.modulate.a = clampf(e, 0.0, 1.0)
	var s := lerpf(0.4, 1.0, e)
	n.pivot_offset = n.size * 0.5
	n.scale = Vector2(s, s)


func _rise(n: Control, delay: float, dur: float) -> void:
	_anim(n, RISE, delay, dur, 14.0 * _u)


func _slide(n: Control, delay: float, dur: float) -> void:
	_anim(n, SLIDE, delay, dur, 22.0 * _u)


func _letter(n: Control, delay: float, em: float) -> void:
	_anim(n, LETTER, delay, 1.1, em)


func _anim(n: Control, kind: int, delay: float, dur: float, dist: float) -> void:
	var a := _Anim.new()
	a.node = n
	a.base = n.position
	a.kind = kind
	a.delay = delay
	a.dur = dur
	a.dist = dist
	_anims.append(a)
	_animate(a, 0.0)


func _animate(a: _Anim, t: float) -> void:
	var k := clampf((t - a.delay) / a.dur, 0.0, 1.0)
	match a.kind:
		RISE:
			var e := _bz(EASE, k)
			a.node.modulate.a = e
			a.node.position = a.base + Vector2(0.0, (1.0 - e) * a.dist)
		SLIDE:
			var e := _bz(EASE, k)
			a.node.modulate.a = e
			a.node.position = a.base - Vector2((1.0 - e) * a.dist, 0.0)
		LETTER:
			# wkLetter: from above, tipped and large, overshooting a touch at 60%
			var op := 0.0
			var ty := 0.0
			var rot := 0.0
			var sc := 1.0
			if k < 0.6:
				var e := _bz(EASE, k / 0.6)
				op = e
				ty = lerpf(-0.7, 0.06, e)
				rot = lerpf(-8.0, 1.0, e)
				sc = lerpf(1.12, 1.0, e)
			else:
				var e := _bz(EASE, (k - 0.6) / 0.4)
				op = 1.0
				ty = lerpf(0.06, 0.0, e)
				rot = lerpf(1.0, 0.0, e)
			a.node.modulate.a = op
			a.node.position = a.base + Vector2(0.0, ty * a.dist)
			a.node.rotation = deg_to_rad(rot)
			a.node.scale = Vector2(sc, sc)
		FADE:
			a.node.modulate.a = _bz(CSS_EASE, k)


# ---------------------------------------------------------------- words

func _cause_runs(r: Dictionary, base: Font, name_font: Font, sz: int, c_base: Color, c_name: Color, upper: bool) -> Array:
	var killer := str(r.get("killer", ""))
	var cause := str(r.get("cause", "shot"))
	var lead := "Rammed by " if cause == "rammed" else "Sunk by "
	var parts: Array
	if str(r.get("maelstrom", "")) != "":
		parts = [["Swallowed by ", false], [str(r.maelstrom), true]]
	elif cause == "aground":
		parts = [["Holed on the reef", false]]
	elif cause == "kraken":
		parts = [["Dragged under by ", false], ["the Kraken", true]]
	elif cause == "fort":
		parts = [["Sunk by the guns of ", false], [killer, true]]
	elif killer == "":
		parts = [[lead + "pirates", false]]
	else:
		parts = [[lead + "the ", false], [killer, true]]
	var out := []
	for p: Array in parts:
		var text: String = p[0]
		out.append([text.to_upper() if upper else text, name_font if p[1] else base, sz, c_name if p[1] else c_base])
	return out


func _epitaph(r: Dictionary) -> Array:
	var u := _u
	var f := _font("inter", 500, 0.0, 13.0 * u)
	var sz := roundi(13.0 * u)
	var where := str(r.where) if str(r.where) != "" else "in open water"
	var at := "after %s at sea" % _duration(float(r.time))
	var fm := roundi(float(r.get("fathoms", 0.0)))
	if str(r.cause) == "aground":
		return [["She ran aground %s %s." % [where, at], f, sz, HudStyle.INK_2]]
	if str(r.get("maelstrom", "")) != "":
		return [["She was drawn down the maelstrom's throat %s." % at, f, sz, HudStyle.INK_2]]
	var how := "was pulled into the deep" if str(r.cause) == "kraken" else "went down"
	if fm >= 3:
		return [["She %s %s %s, and lies in " % [how, where, at], f, sz, HudStyle.INK_2],
				["%d fathoms" % fm, _font("inter", 700, 0.0, 13.0 * u), sz, HudStyle.AQUA], [".", f, sz, HudStyle.INK_2]]
	return [["She %s %s %s." % [how, where, at], f, sz, HudStyle.INK_2]]


## The parting words: the most fitting line for how the voyage went, a little at random.
func _quip(r: Dictionary) -> String:
	var fits: Array[String] = []
	var time := float(r.time)
	var kills := int(r.kills)
	var cls := str(r.cls)
	if time < 90.0:
		fits.append("Barely out of the harbour. The gulls will talk about this one.")
	if kills == 0 and time >= 90.0:
		fits.append("Not a single prize taken. The sea keeps no score, but the tavern does.")
	if kills >= 5:
		fits.append("%d ships went to the bottom before her. Davy Jones owes you a drink." % kills)
	if int(r.gold) >= 1500:
		fits.append("Her hold went down heavy with gold. Some lucky diver will thank you.")
	if int(r.isles_total) > 0 and int(r.isles) >= int(r.isles_total):
		fits.append("Every isle charted. Your maps will outlive your ship.")
	if str(r.cause) == "aground":
		fits.append("The reef doesn't care how fast you were sailing.")
	if str(r.cause) == "rammed":
		fits.append("Close quarters. Very close quarters.")
	if str(r.get("maelstrom", "")) != "":
		fits.assign(["Round and round and down. The sea keeps what it takes.",
				"Sail with the wind, the old hands say. Out, never across.",
				"The whirlpool turns on without you, patient as ever."])
	if str(r.cause) == "kraken":
		fits.assign(["The old sailors were right. Something lives down there.",
				"Eight arms, one ship. The sums were never in your favour.",
				"The Kraken sleeps again, and your ship sleeps with it."])
	if str(r.killer_cls) == "galleon" and cls == "sloop":
		fits.append("A sloop against a galleon. Brave. Briefly.")
	if str(r.killer_cls) == "sloop" and cls == "galleon":
		fits.append("Brought down by a sloop. Nobody needs to know, galleon captain.")
	if int(r.shots) > 20 and float(r.hits) / maxf(1.0, float(r.shots)) < 0.15:
		fits.append("The gunners swear the sea moved.")
	if fits.is_empty():
		fits.assign(["Dead men tell no tales.", "The sea gives, and the sea takes.", "Fair winds, captain. Wherever she rests.",
				"Every captain goes down with a story. This was yours.", "She fought to the last plank."])
	return fits[randi() % fits.size()]


static func _renown(r: Dictionary) -> int:
	return roundi(float(r.gold) + int(r.kills) * 120 + int(r.isles) * 90 + float(r.time) / 5.0)


static func _rank_of(score: int) -> int:
	var i := 0
	while i + 1 < RANKS.size() and score >= int(RANKS[i + 1][0]):
		i += 1
	return i


static func _beat(first: bool, v: Variant, best: Variant) -> bool:
	return not first and float(v) > float(best) and float(v) > 0.0


static func _clock(t: float) -> String:
	return "%d:%02d" % [floori(t / 60.0), floori(fmod(t, 60.0))]


static func _duration(t: float) -> String:
	var m := floori(t / 60.0)
	var s := floori(fmod(t, 60.0))
	if m == 0:
		return "mere moments" if s < 5 else "%d seconds" % s
	return "%d minute%s%s" % [m, "" if m == 1 else "s", " %ds" % s if s > 0 else ""]


## A whole number with its thousands marked, as the web's toLocaleString.
static func _num(n: int) -> String:
	return MenuKit.num(n)


func _tally_fmt(i: int, v: float) -> String:
	return _clock(v) if i == 0 else _num(roundi(v))


# ---------------------------------------------------------------- records

## Your bests before this voyage.
func _load_records() -> Dictionary:
	return Progress.records.duplicate()


## This voyage counted, and any bests it beat kept.
func _save_records() -> void:
	var r := _report
	var recs := Progress.records
	recs.voyages = int(recs.voyages) + 1
	recs.renown = maxi(int(recs.renown), _renown(r))
	recs.gold = maxi(int(recs.gold), int(r.gold))
	recs.kills = maxi(int(recs.kills), int(r.kills))
	recs.isles = maxi(int(recs.isles), int(r.isles))
	recs.time = maxf(float(recs.time), float(r.time))
	Progress.touch()


# ---------------------------------------------------------------- pieces

func _font(family: String, weight: int, em: float, px: float) -> Font:
	return HudStyle.font(family, weight, roundi(em * px))


func _tnum(f: Font) -> Font:
	return HudStyle.tnum(f)


## The quip's slant (the fonts carry no italic).
func _italic(f: Font) -> Font:
	return HudStyle.italic(f)


func _grad(g: Array, top: float, height: float) -> ShaderMaterial:
	return HudStyle.text_grad(g, top, height)


## A glass panel: the web's .wk-panel (radius in CSS pixels).
func _panel(sz: Vector2, radius: float) -> UiBox:
	var b := UiBox.new(sz, radius * _u, 70.0 * _u)
	b.p("c_shadow", Color(0.0, 0.031, 0.055, 0.38)).p("shadow", Vector2(18.0, 50.0) * _u)
	return b


## A gold "New best" pill.
func _pill(text: String) -> UiBox:
	var u := _u
	var t := UiText.new([[text, _font("inter", 800, 0.14, 9.0 * u), roundi(9.0 * u), HudStyle.GOLD_INK]], 0.0, 1.0)
	var b := UiBox.new(t.size + Vector2(16.0, 9.0) * u, 999.0, 26.0 * u)
	b.p("c_top", GOLD_GRAD[0]).p("c_mid", GOLD_GRAD[1]).p("mid", 0.52).p("c_foot", GOLD_GRAD[2]).p("border", 0.0).p("hi", 0.0)
	b.p("c_shadow", Color(0.957, 0.706, 0.275, 0.4)).p("shadow", Vector2(6.0, 18.0) * u)
	t.position = Vector2(8.0, 5.0) * u
	b.add_child(t)
	return b


static func _bz(c: Vector4, k: float) -> float:
	return MathX.bezier(c.x, c.y, c.z, c.w, clampf(k, 0.0, 1.0))


class _Anim:
	var node: Control
	var base := Vector2.ZERO
	var kind := 0
	var delay := 0.0
	var dur := 0.7
	var dist := 14.0


## Text in runs of their own font, size and colour on a shared baseline,
## wrapped to a width or cut short with an ellipsis; drawn in one item, so a
## gradient material paints it whole.
## A word of the title, swaying on the swell (wkSway).
class _Sway:
	extends Control
	var _lag := 0.0
	var _u := 1.0
	var _y := -1.0

	func _init(i: int, u: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_lag = i * 1.5
		_u = u

	func tick(t: float, _dt: float) -> void:
		if _y < 0.0:
			_y = position.y
		position.y = _y - 4.0 * _u * (0.5 - 0.5 * cos(TAU * (t + _lag) / 6.0))


## The porthole: shaders/porthole.gdshader with her silhouette in it.
class _Port:
	extends Control
	var margin := 0.0

	func _init(d: float, u: float, cls: ShipClass) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = Vector2(d, d)
		margin = 52.0 * u
		var mat := ShaderMaterial.new()
		mat.shader = preload("res://shaders/porthole.gdshader")
		mat.set_shader_parameter("quad", size + Vector2(margin, margin) * 2.0)
		mat.set_shader_parameter("radius", d * 0.5)
		mat.set_shader_parameter("u", u)
		var art := Art.ship(cls, Color(0.016, 0.086, 0.118, 0.88), Color(0.804, 0.961, 0.933, 0.32), Color(0.016, 0.086, 0.118, 0.8))
		var view: Rect2 = art[1]
		var w := d * 0.84
		mat.set_shader_parameter("ship", Icons.svg("port-" + cls.id, art[0], Vector2(w, w * view.size.y / view.size.x), view))
		mat.set_shader_parameter("aspect", view.size.x / view.size.y)
		material = mat

	func _draw() -> void:
		draw_rect(Rect2(-Vector2(margin, margin), size + Vector2(margin, margin) * 2.0), Color.WHITE)


## The renown medal: shaders/medal.gdshader with the crest in it.
class _Medal:
	extends Control
	var fill := 0.0
	var landed := 0.0
	var best := 0.0
	var _mat: ShaderMaterial
	var _margin := 0.0
	var _shown := Vector3(-1.0, -1.0, -1.0)

	func _init(d: float, u: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = Vector2(d, d)
		pivot_offset = size * 0.5
		_margin = 80.0 * u
		_mat = ShaderMaterial.new()
		_mat.shader = preload("res://shaders/medal.gdshader")
		_mat.set_shader_parameter("quad", size + Vector2(_margin, _margin) * 2.0)
		_mat.set_shader_parameter("radius", d * 0.5)
		_mat.set_shader_parameter("u", u)
		var ch := d * 0.333
		_mat.set_shader_parameter("crest_half", ch)
		var view := Rect2(0, 0, 64, 64)
		_mat.set_shader_parameter("crest", Icons.svg("crest-ring", Art.crest_ring(), Vector2(ch, ch) * 2.0, view, true))
		_mat.set_shader_parameter("rose", Icons.svg("crest-rose", Art.crest_rose(), Vector2(ch, ch) * 2.0, view, true))
		material = _mat

	func tick(t: float, _dt: float) -> void:
		# the rose turns once a minute
		_mat.set_shader_parameter("turn", fmod(t, 60.0) / 60.0 * TAU)
		var s := Vector3(fill, landed, best)
		if s != _shown:
			_shown = s
			_mat.set_shader_parameter("fill", fill)
			_mat.set_shader_parameter("landed", landed)
			_mat.set_shader_parameter("best", best)

	func _draw() -> void:
		draw_rect(Rect2(-Vector2(_margin, _margin), size + Vector2(_margin, _margin) * 2.0), Color.WHITE)


## Nine ranks as nine pips: the ones behind you in old gold, yours glowing,
## each popping in turn; and "Rank N of 9".
class _Ladder:
	extends Control
	var _ri := 0
	var _n := 9
	var _u := 1.0
	var _font: Font
	var _t := 0.0
	var _label := ""
	var _box := StyleBoxFlat.new()

	func _init(ri: int, n: int, u: float, font: Font) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_box.anti_aliasing = true
		_box.corner_detail = 6
		_ri = ri
		_n = n
		_u = u
		_font = font
		_label = "RANK %d OF %d" % [ri + 1, n]
		var pips := (n - 1) * 11.0 * u + 18.0 * u + (n - 1) * 4.0 * u
		var lw := font.get_string_size(_label, HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(9.5 * u)).x
		size = Vector2(pips + 6.0 * u + lw, maxf(5.0 * u, font.get_height(roundi(9.5 * u))))

	func tick(t: float, _dt: float) -> void:
		var was := _t
		_t = t
		if was < 1.3 + _n * 0.06 + 0.5:
			queue_redraw()

	func _draw() -> void:
		var u := _u
		var x := 0.0
		var cy := size.y * 0.5
		for i in _n:
			var w := (18.0 if i == _ri else 11.0) * u
			var k := clampf((_t - 1.3 - i * 0.06) / 0.45, 0.0, 1.0)
			var e := MathX.bezier(0.25, 1.4, 0.4, 1.0, k)
			var sw := w * lerpf(0.2, 1.0, e)
			var r := Rect2(x + (w - sw) * 0.5, cy - 2.5 * u, sw, 5.0 * u)
			var col := Color(1, 1, 1, 0.1)
			if i < _ri:
				col = Color(0.937, 0.769, 0.388, 0.5)
			elif i == _ri:
				col = HudStyle.GOLD
				# its glow
				var g := clampf(e, 0.0, 1.0)
				_capsule(r.grow(5.0 * u), Color(HudStyle.GOLD, 0.08 * g))
				_capsule(r.grow(2.5 * u), Color(HudStyle.GOLD, 0.16 * g))
			col.a *= clampf(e, 0.0, 1.0)
			_capsule(r, col)
			x += w + 4.0 * u
		var fs := roundi(9.5 * u)
		draw_string(_font, Vector2(x + 2.0 * u, cy + _font.get_ascent(fs) * 0.5 - 1.0 * u), _label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, HudStyle.INK_3)

	## A pill in one piece (overlapping round ends would double its alpha).
	func _capsule(r: Rect2, col: Color) -> void:
		if col.a <= 0.0:
			return
		_box.bg_color = col
		_box.set_corner_radius_all(ceili(r.size.y * 0.5))
		draw_style_box(_box, r)


## The voyage as a line from harbour to the sea floor: the course running
## along it, and a pin for each deed (stacked when they crowd), the last at
## the end where she went down.
class _Track:
	extends Control
	var _pins: Array = []
	var _u := 1.0
	var _t := 0.0
	var _icons := {}

	func _init(r: Dictionary, w: float, h: float, u: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = Vector2(w, h)
		_u = u
		var T := maxf(float(r.time), 1.0)
		var last := -1.0
		var lane := 0
		for e: Dictionary in r.events:
			var x := clampf(float(e.t) / T, 0.02, 0.96)
			lane = (lane + 1) % 3 if x - last < 0.045 else 0
			last = x
			_pins.append([x, lane, str(e.kind)])
		for id: String in ["skull", "coin", "isle"]:
			_icons[id] = Icons.texture(id, 14.0 * u * 1.5)

	func tick(t: float, _dt: float) -> void:
		var was := _t
		_t = t
		if was < 1.1 + 1.8 + 0.6:
			queue_redraw()

	func _draw() -> void:
		var u := _u
		var w := size.x
		var base := size.y - 10.0 * u
		# the course, and the voyage running along it (the web scales the whole
		# gradient with the run, so it always ends in coral)
		_bar(w, base, Color(1, 1, 1, 0.08), Color(1, 1, 1, 0.08), Color(1, 1, 1, 0.08))
		var run := clampf((_t - 1.1) / 1.8, 0.0, 1.0)
		if run > 0.0:
			var fw := w * run
			_bar(fw, base, Color(HudStyle.AQUA, 0.05), Color(HudStyle.AQUA, 0.14), Color(HudStyle.CORAL, 0.12), 8.0 * u)
			_bar(fw, base, Color(HudStyle.AQUA, 0.35), HudStyle.AQUA, HudStyle.CORAL)
		for p: Array in _pins:
			_pin(p[0], p[1], str(p[2]), false)
		_pin(1.0, 0, "lost", true)

	## The course from harbour to x1: c0 to c1 at 70%, then to c2.
	func _bar(x1: float, base: float, c0: Color, c1: Color, c2: Color, grow := 0.0) -> void:
		var h := 3.0 * _u + grow
		var y0 := base - 3.0 * _u - grow * 0.5
		var xm := x1 * 0.7
		draw_polygon(PackedVector2Array([Vector2(0.0, y0), Vector2(xm, y0), Vector2(xm, y0 + h), Vector2(0.0, y0 + h)]), PackedColorArray([c0, c1, c1, c0]))
		draw_polygon(PackedVector2Array([Vector2(xm, y0), Vector2(x1, y0), Vector2(x1, y0 + h), Vector2(xm, y0 + h)]), PackedColorArray([c1, c2, c2, c1]))

	func _pin(x: float, lane: int, kind: String, end: bool) -> void:
		var u := _u
		var k := clampf((_t - 1.1 - x * 1.8) / 0.5, 0.0, 1.0)
		if k <= 0.0:
			return
		var e := MathX.bezier(0.25, 1.4, 0.4, 1.0, k)
		var a := clampf(e, 0.0, 1.0)
		var base := size.y - 10.0 * u
		var px := x * size.x
		var h := (26.0 if end else 16.0 + lane * 14.0) * u * lerpf(0.2, 1.0, e)
		var top := base - h
		var stalk0 := HudStyle.CORAL if end else Color(1, 1, 1, 0.4)
		var stalk1 := Color(1.0, 0.47, 0.39, 0.1) if end else Color(1, 1, 1, 0.05)
		draw_polygon(PackedVector2Array([Vector2(px - 0.5 * u, top), Vector2(px + 0.5 * u, top), Vector2(px + 0.5 * u, base), Vector2(px - 0.5 * u, base)]),
				PackedColorArray([Color(stalk0, stalk0.a * a), Color(stalk0, stalk0.a * a), Color(stalk1, stalk1.a * a), Color(stalk1, stalk1.a * a)]))
		var r := (13.0 if end else 10.0) * u
		var c := Vector2(px, top - (24.0 if end else 18.0) * u + r)
		var ring := Color(1, 1, 1, 0.18)
		match kind:
			"kill", "bounty":
				ring = Color(1.0, 0.549, 0.471, 0.55)
			"chest", "trade":
				ring = Color(0.957, 0.78, 0.396, 0.6)
			"isle", "fleet", "fort":
				ring = Color(0.369, 0.89, 0.831, 0.6)
		if end:
			draw_circle(c, r + 10.0 * u, Color(1.0, 0.43, 0.35, 0.12 * a), true, -1.0, true)
			draw_circle(c, r + 2.0 * u, Color(HudStyle.CORAL, a), true, -1.0, true)
			draw_circle(c, r, Color(Color("#3a0f0c"), a), true, -1.0, true)
		else:
			draw_circle(c + Vector2(0.0, 4.0 * u), r + 2.0 * u, Color(0, 0, 0, 0.18 * a), true, -1.0, true)
			draw_circle(c, r + 1.0 * u, Color(ring, ring.a * a), true, -1.0, true)
			draw_circle(c, r, Color(0.031, 0.118, 0.165, 0.95 * a), true, -1.0, true)
		var icon: Texture2D = _icons[WreckScreen.KIND_ICON.get(kind, "isle") if not end else "skull"]
		var s := (14.0 if end else 11.0) * u * 1.5
		draw_texture_rect(icon, Rect2(c - Vector2(s, s) * 0.5, Vector2(s, s)), false, Color(1, 1, 1, a))


## The faint thread of the voyage down the log, marker to marker.
class _Thread:
	extends Control

	func _init(at: Vector2, h: float, u: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		position = at
		size = Vector2(maxf(1.0, u * 0.8), h)

	func _draw() -> void:
		draw_polygon(PackedVector2Array([Vector2.ZERO, Vector2(size.x, 0.0), size, Vector2(0.0, size.y)]),
				PackedColorArray([Color(1, 1, 1, 0.18), Color(1, 1, 1, 0.18), Color(1, 1, 1, 0.06), Color(1, 1, 1, 0.06)]))


## The diver's depth gauge's little glass: two marks on a tube.
class _Glyph:
	extends Control
	var _px := 1.0

	func _init(sz: Vector2, px: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = sz
		_px = px

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		draw_rect(Rect2(0.0, size.y * 0.3, size.x, size.y * 0.04), Color(0.369, 0.89, 0.831, 0.6))
		draw_rect(Rect2(0.0, size.y * 0.58, size.x, size.y * 0.03), Color(0.369, 0.89, 0.831, 0.35))
		draw_rect(r, Color(0.627, 0.902, 0.882, 0.35), false, maxf(1.0, _px * 0.6))


## Bubbles drifting up behind the card: a few columns of them, each with its
## own size, speed and sway (bigger ones rise faster, as real ones do).
class _Bubbles:
	extends Control
	var _items: Array = []
	var _tex: Texture2D
	var _t := 0.0
	var _px := 1.0

	const SVG := '<defs><radialGradient id="r" cx="12" cy="12" r="12" gradientUnits="userSpaceOnUse"><stop offset="0.82" stop-color="#aaf0e8" stop-opacity="0"/><stop offset="1" stop-color="#aaf0e8" stop-opacity="0.2"/></radialGradient><radialGradient id="l" cx="0.54" cy="0.82" r="0.6" gradientTransform="translate(0.54 0.82) scale(1 0.567) translate(-0.54 -0.82)"><stop offset="0" stop-color="#aaf5e8" stop-opacity="0.4"/><stop offset="0.72" stop-color="#aaf5e8" stop-opacity="0"/></radialGradient><radialGradient id="g" cx="0.34" cy="0.28" r="0.166"><stop offset="0.53" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient><clipPath id="c"><circle cx="12" cy="12" r="12"/></clipPath></defs><g clip-path="url(#c)"><circle cx="12" cy="12" r="12" fill="url(#r)"/><rect width="24" height="24" fill="url(#l)"/><rect width="24" height="24" fill="url(#g)"/><circle cx="12" cy="13.6" r="11.2" fill="none" stroke="#befaf0" stroke-opacity="0.3" stroke-width="2"/></g><circle cx="12" cy="12" r="11.3" fill="none" stroke="#d6fcf6" stroke-opacity="0.55" stroke-width="1.4"/>'

	func _init(vp: Vector2, px: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = vp
		_px = px
		_tex = Icons.svg("bubble", SVG, Vector2(18.0, 18.0) * px)
		for c in 6:
			var x := 4.0 + randf() * 92.0
			for i in 2 + randi() % 3:
				var s := 10.0 + randf() * 8.0 if randf() < 0.2 else 3.0 + randf() * 6.0
				var d := 13.0 - s * 0.45 + randf() * 3.0
				_items.append([(x + (randf() - 0.5) * 3.0) / 100.0, s * px, d, randf() * 2.0 - 1.0, randf() * d])

	func tick(t: float, _dt: float) -> void:
		_t = t
		queue_redraw()

	func _draw() -> void:
		var vh := size.y
		for b: Array in _items:
			var ph := fposmod((_t + float(b[4])) / float(b[2]), 1.0)
			var w: float = b[3]
			var s: float = b[1]
			# wkBubble's keyframes, linear between
			var sx := _key(ph, [0.0, 0.25, 0.5, 0.75, 1.0], [0.0, w * 12.0, -w * 8.0, w * 14.0, w * 4.0]) * _px
			var kx := _key(ph, [0.0, 0.25, 0.5, 0.75, 1.0], [0.8, 0.86, 0.95, 1.04, 1.1])
			var ky := _key(ph, [0.0, 0.25, 0.5, 0.75, 1.0], [0.8, 0.92, 0.95, 0.96, 1.1])
			var a := _key(ph, [0.0, 0.08, 0.9, 1.0], [0.0, 0.9, 0.7, 0.0])
			var c := Vector2(float(b[0]) * size.x + s * 0.5 + sx, vh + 24.0 * _px - s * 0.5 - 1.12 * vh * ph)
			var sz := Vector2(s * kx, s * ky)
			draw_texture_rect(_tex, Rect2(c - sz * 0.5, sz), false, Color(1, 1, 1, a))

	static func _key(t: float, at: Array, v: Array) -> float:
		for i in range(1, at.size()):
			if t <= float(at[i]):
				return lerpf(float(v[i - 1]), float(v[i]), (t - float(at[i - 1])) / (float(at[i]) - float(at[i - 1])))
		return float(v[-1])


## The way back up: the big gold "Sail again", a glint running across it now
## and then; it presses on release, and only once the card has settled.
class _Sail:
	extends UiBox
	signal pressed
	var armed := false
	var _down := false
	var _press := 1.0
	var _u := 1.0

	func _init(cls_id: String, w: float, u: float, keys: bool) -> void:
		super(Vector2(w, 54.0 * u), 999.0, 34.0 * u)
		_u = u
		mouse_filter = Control.MOUSE_FILTER_STOP
		pivot_offset = size * 0.5
		p("c_top", Color("#ffeab0")).p("c_mid", Color("#f6c766")).p("mid", 0.52).p("c_foot", Color("#e0a443")).p("border", 0.0)
		p("c_shadow", Color(0.957, 0.706, 0.275, 0.32)).p("shadow", Vector2(10.0, 30.0) * u)
		p("hi", 0.7).p("c_lo", Color(0.588, 0.353, 0.059, 0.28)).p("lo_px", 2.0 * u)
		var ink := HudStyle.GOLD_INK
		var icon := Icons.rect("refresh", 19.0 * u, ink)
		var big := WreckScreen._text_static([["SAIL AGAIN", HudStyle.font("inter", 800, roundi(16.0 * u * 0.16)), roundi(16.0 * u), ink]])
		var cls: ShipClass = ShipClass.named(cls_id)
		var sub := WreckScreen._text_static([["A FRESH " + cls.name.to_upper(), HudStyle.font("inter", 700, roundi(10.0 * u * 0.12)), roundi(10.0 * u), Color(0.275, 0.157, 0.02, 0.62)]])
		var kbd: Control = null
		if keys:
			kbd = WreckScreen._text_static([["Enter", HudStyle.font("inter", 600, 0), roundi(10.0 * u), Color(ink, 0.8)]])
		var tw := maxf(big.size.x, sub.size.x)
		var row := icon.size.x + 9.0 * u + tw + ((8.0 * u + kbd.size.x + 12.0 * u) if kbd != null else 0.0)
		var x := (w - row) * 0.5
		icon.position = Vector2(x, (size.y - icon.size.y) * 0.5)
		var th := big.size.y + sub.size.y
		big.position = Vector2(x + icon.size.x + 9.0 * u, (size.y - th) * 0.5)
		sub.position = Vector2(big.position.x, big.position.y + big.size.y)
		for n: Control in [icon, big, sub]:
			add_child(n)
		if kbd != null:
			var kb := UiBox.new(kbd.size + Vector2(12.0, 4.0) * u, 7.0 * u, 2.0)
			kb.p("c_top", Color(0, 0, 0, 0.1)).p("c_foot", Color(0, 0, 0, 0.1)).p("c_border", Color(0, 0, 0, 0.14)).p("c_shadow", Color(0, 0, 0, 0)).p("hi", 0.0)
			kbd.position = Vector2(6.0, 2.0) * u
			kb.add_child(kbd)
			kb.position = Vector2(big.position.x + tw + 8.0 * u, (size.y - kb.size.y) * 0.5)
			add_child(kb)

	func tick(t: float, dt: float) -> void:
		# a glint runs across it every 4.5 s, from 2.4 s in
		var s := -1.0
		if t > 2.4:
			var ph := fmod(t - 2.4, 4.5) / 4.5
			if ph < 0.28:
				s = MathX.bezier(0.42, 0.0, 0.58, 1.0, ph / 0.28)
		p("sheen", s)
		_press += ((0.97 if _down else 1.0) - _press) * MathX.damp(30.0, dt)
		scale = Vector2(_press, _press)

	func _gui_input(event: InputEvent) -> void:
		var touch := event is InputEventScreenTouch
		var click: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION
		if not (touch or click):
			return
		accept_event()
		if event.pressed:
			_down = true
		elif _down:
			_down = false
			if Rect2(Vector2.ZERO, size).has_point(event.position) and armed:
				Input.vibrate_handheld(16)
				pressed.emit()


## The other way back up, under Sail again: "Choose a new ship" in a pill of
## dark glass, back to the harbour (Esc too); like it, it presses on release
## and only once the card has settled.
class _Again:
	extends UiBox
	signal pressed
	var armed := false
	var _down := false
	var _press := 1.0

	func _init(w: float, u: float, keys: bool) -> void:
		super(Vector2(w, 42.0 * u), 999.0, 4.0)
		mouse_filter = Control.MOUSE_FILTER_STOP
		pivot_offset = size * 0.5
		var fill := Color(0.039, 0.118, 0.165, 0.72)
		p("c_top", fill).p("c_foot", fill).p("c_border", HudStyle.STROKE).p("hi", 0.09).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0))
		var icon := Icons.rect("anchor", 17.0 * u, HudStyle.INK)
		var t := WreckScreen._text_static([["Choose a new ship", HudStyle.font("inter", 700, 0), roundi(14.5 * u), HudStyle.INK]])
		var kbd: Control = null
		if keys:
			kbd = WreckScreen._text_static([["Esc", HudStyle.font("inter", 600, 0), roundi(10.0 * u), HudStyle.INK_2]])
		var row := icon.size.x + 9.0 * u + t.size.x + ((8.0 * u + kbd.size.x + 12.0 * u) if kbd != null else 0.0)
		var x := (w - row) * 0.5
		icon.position = Vector2(x, (size.y - icon.size.y) * 0.5)
		t.position = Vector2(x + icon.size.x + 9.0 * u, (size.y - t.size.y) * 0.5)
		add_child(icon)
		add_child(t)
		if kbd != null:
			var kb := UiBox.new(kbd.size + Vector2(12.0, 4.0) * u, 7.0 * u, 2.0)
			kb.p("c_top", Color(1, 1, 1, 0.08)).p("c_foot", Color(1, 1, 1, 0.08)).p("c_border", Color(1, 1, 1, 0.14)).p("c_shadow", Color(0, 0, 0, 0)).p("hi", 0.0)
			kbd.position = Vector2(6.0, 2.0) * u
			kb.add_child(kbd)
			kb.position = Vector2(t.position.x + t.size.x + 8.0 * u, (size.y - kb.size.y) * 0.5)
			add_child(kb)

	func tick(_t: float, dt: float) -> void:
		_press += ((0.97 if _down else 1.0) - _press) * MathX.damp(30.0, dt)
		scale = Vector2(_press, _press)

	func _gui_input(event: InputEvent) -> void:
		var touch := event is InputEventScreenTouch
		var click: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION
		if not (touch or click):
			return
		accept_event()
		if event.pressed:
			_down = true
		elif _down:
			_down = false
			if Rect2(Vector2.ZERO, size).has_point(event.position) and armed:
				Input.vibrate_handheld(16)
				pressed.emit()


static func _text_static(runs: Array) -> UiText:
	return UiText.new(runs, 0.0, 1.15)
