class_name LoadingScreen
extends CanvasLayer
## The loading screen, as the web game's: a real moment from the game (a ship
## off the pink shore of Las Brumas) drifting slowly closer under a vignette,
## the crest's rose turning, the gilt name, a line of advice that changes
## every few seconds, and a thin bar filling aqua to gold with a glint running
## along it. The game builds its world a piece a frame behind it (Game._load)
## and calls progress() between pieces; everything here moves by the clock,
## so a long piece never knocks it off its pace. finish() holds it until the
## frames behind it run even (every shader drawn once), then it fades away.

## The web's tips, the first one first.
const TIPS := [
	"Charting the archipelago…",
	"Sail across the wind for the best speed",
	"Your guns fire to the sides: warm light around a foe means fire",
	"Salvage floats to you: sail close to collect it",
	"Every isle you chart pays a bounty",
	"Chain shot shreds sails, grape cuts down gun crews, fire burns on",
	"Gusts darken the water: chase them for a burst of speed",
]
const SCENE := preload("res://art/loading_brumas.webp")
## How long the scene takes to drift in (s), and how far (from a cover fit).
const DRIFT_S := 16.0
const DRIFT := 0.09
## Seconds per turn of the rose; per tip; for the fade away.
const TURN_S := 9.0
const TIP_S := 2.4
const FADE_S := 0.9

var _vp := Vector2(1280.0, 720.0)
var _root: Control
var _scene: TextureRect
var _shade: ColorRect
var _brand: Control
var _rose: TextureRect
var _tip: UiText
var _bar: _Bar
var _t := 0.0
var _tip_i := 0
var _tip_t := 0.0
## The bar's goal and where it has got to (0..1).
var _goal := 0.0
var _shown := 0.0
## Fading away: seconds into it (-1 until then).
var _out := -1.0


func _ready() -> void:
	layer = 100
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_root)
	_build()
	get_viewport().size_changed.connect(_build)
	_step(0.0)


## Sends the bar on toward `p` (0..1).
func progress(p: float) -> void:
	_goal = maxf(_goal, clampf(p, 0.0, 1.0))


## Waits until the frames run even (a few in a row on time, after every
## shader's first draw), fills the bar and starts the fade; it frees itself
## once faded. `quick` (shots and the smoke test) goes at once.
func finish(quick := false) -> void:
	if quick:
		queue_free()
		return
	var tree := get_tree()
	var since := Time.get_ticks_msec()
	var even := 0
	var last := since
	while true:
		await tree.process_frame
		var now := Time.get_ticks_msec()
		var dt := now - last
		last = now
		even = even + 1 if dt < 45 else 0
		# the warm-up's own pieces linger a second (Game._warm_up)
		var waited := now - since
		_goal = maxf(_goal, lerpf(0.86, 0.97, clampf(waited / 1500.0, 0.0, 1.0)))
		if (even >= 8 and waited > 1100) or waited > 6000:
			break
	_goal = 1.0
	# the bar runs home, then the curtain lifts
	while _shown < 0.995:
		await tree.process_frame
	_out = 0.0
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE


func _process(dt: float) -> void:
	# a frame held up by the world's building moves things on at most a
	# tenth of a second, so it never leaps
	_step(minf(dt, 0.1))


func _step(dt: float) -> void:
	_t += dt
	var vp := _vp
	# the scene drifts closer, cover-fitted
	var k := HudStyle.eased(clampf(_t / DRIFT_S, 0.0, 1.0))
	var tex := Vector2(SCENE.get_size())
	var s := maxf(vp.x / tex.x, vp.y / tex.y) * (1.0 + DRIFT * k)
	_scene.size = tex * s
	_scene.position = (vp - _scene.size) * 0.5 + Vector2(-0.012, -0.006) * vp * k
	# the brand rises in over its first second, as the web's .brand does
	var r := HudStyle.eased(clampf(_t / 1.0, 0.0, 1.0))
	_brand.modulate.a = r
	_brand.position.y = _brand_y() + (1.0 - r) * 16.0 * HudStyle.PX
	_shade.modulate.a = r
	# out of the boot screen's deep sea
	_scene.modulate.a = HudStyle.eased(clampf(_t / 0.6, 0.0, 1.0))
	_rose.rotation = TAU * fmod(_t / TURN_S, 1.0)
	# the tips, each rising in
	_tip_t += dt
	if _tip_t >= TIP_S:
		_tip_t = 0.0
		_tip_i = (_tip_i + 1) % TIPS.size()
		_set_tip()
	var ti := HudStyle.eased(clampf(_tip_t / 0.5, 0.0, 1.0))
	_tip.modulate.a = ti
	_tip.position.y = _tip_y() + (1.0 - ti) * 4.0 * HudStyle.PX
	# the bar glides toward its goal and creeps on while a piece takes long
	_shown = move_toward(_shown, _goal, maxf(_goal - _shown, 0.02) * dt * 5.0)
	_bar.fill = _shown
	_bar.t = _t
	_bar.queue_redraw()
	if _out >= 0.0:
		_out += dt
		var o := clampf(_out / FADE_S, 0.0, 1.0)
		_root.modulate.a = 1.0 - o
		if o >= 1.0:
			queue_free()


# ------------------------------------------------------------------ layout

## The web's sizes on this screen: its CSS px in our units, and the logo's
## clamp(44px, 9vw, 104px).
func _em() -> float:
	return clampf(0.09 * _vp.x / HudStyle.PX, 44.0, 104.0) * HudStyle.PX


func _brand_y() -> float:
	return (_vp.y - _brand.size.y) * 0.5


func _tip_y() -> float:
	return float(_tip.get_meta("y"))


func _build() -> void:
	_vp = get_viewport().get_visible_rect().size
	for c in _root.get_children():
		c.free()
	_root.size = _vp
	var px := HudStyle.PX
	# the deep sea under it all, then the scene
	var bg := ColorRect.new()
	bg.color = ProjectSettings.get_setting("application/boot_splash/bg_color", Color("#0b2a3a"))
	bg.size = _vp
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(bg)
	_scene = TextureRect.new()
	_scene.texture = SCENE
	_scene.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_scene.stretch_mode = TextureRect.STRETCH_SCALE
	_scene.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_scene.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_scene)
	# the vignette and the bottom shade, so the name and the bar read over it
	_shade = ColorRect.new()
	_shade.size = _vp
	_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sm := ShaderMaterial.new()
	sm.shader = preload("res://shaders/loading_shade.gdshader")
	_shade.material = sm
	_root.add_child(_shade)

	# the brand: crest, name, tip and bar, one column in the middle
	_brand = Control.new()
	_brand.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_brand)
	var em := _em()
	var cd := 64.0 * px
	var view := Rect2(0.0, 0.0, 64.0, 64.0)
	var crest := Control.new()
	crest.mouse_filter = Control.MOUSE_FILTER_IGNORE
	crest.size = Vector2(cd, cd)
	var glow := _Glow.new()
	glow.size = crest.size
	crest.add_child(glow)
	for part: Array in [["crest-ring", Art.crest_ring()], ["crest-rose", Art.crest_rose()]]:
		var r := TextureRect.new()
		r.texture = Icons.svg(part[0], part[1], Vector2(cd, cd), view)
		r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		r.size = Vector2(cd, cd)
		r.pivot_offset = r.size * 0.5
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		crest.add_child(r)
		_rose = r
	_brand.add_child(crest)
	# "— SHORES O’ —" over FORTUNE, as the harbour's title sets it, larger
	var pre_px := 0.26 * em
	var o_px := pre_px * 1.25
	var shores := UiText.new([["SHORES", HudStyle.font("cinzel", 700, roundi(0.5 * pre_px)), roundi(pre_px), Color("#ffe9b8")]], 0.0, 1.0)
	var o := UiText.new([["O’", HudStyle.italic(HudStyle.font("cinzel", 700, roundi(0.08 * o_px))), roundi(o_px), HudStyle.GOLD]], 0.0, 1.0)
	var line_w := 2.6 * pre_px
	var gap := 0.7 * pre_px
	var pre_w := 0.5 * pre_px + line_w + gap + shores.size.x + gap + o.size.x + gap + line_w
	var main := UiText.new([["FORTUNE", HudStyle.font("cinzel", 700, roundi(0.14 * em)), roundi(em), Color.WHITE]], 0.0, 1.0)
	var mpad := 0.14 * em
	var main_w := mpad + main.size.x
	var w := maxf(maxf(pre_w, main_w), 280.0 * px)
	var y := cd + 18.0 * px
	var px0 := (w - pre_w) * 0.5 + 0.5 * pre_px
	var mid := y + o_px * 0.5
	var rule_l := _Rule.new(Vector2(line_w, maxf(1.0, px * 0.75)), false)
	rule_l.position = Vector2(px0, mid - rule_l.size.y * 0.5)
	MenuKit.line_at(shores, px0 + line_w + gap, y + (o_px - pre_px) * 0.5, pre_px)
	MenuKit.line_at(o, shores.position.x + shores.size.x + gap, y, o_px)
	var rule_r := _Rule.new(rule_l.size, true)
	rule_r.position = Vector2(o.position.x + o.size.x + gap, rule_l.position.y)
	for n: Control in [rule_l, shores, o, rule_r]:
		_brand.add_child(n)
	y += o_px + 0.32 * pre_px
	MenuKit.line_at(main, (w - main_w) * 0.5 + mpad, y, em)
	main.material = HudStyle.text_grad([Color("#fffaf0"), Color("#ffe3a0"), Color("#e2a84a"), Color("#b9802c"), Vector2(0.48, 0.78)], y - main.position.y, em)
	var drop := _Drop.new(main)
	_brand.add_child(drop)
	_brand.add_child(main)
	y += em
	crest.position = Vector2((w - cd) * 0.5, 0.0)
	# the tip, then the bar
	y += 16.0 * px
	_tip = UiText.new([["", HudStyle.font("inter", 500, roundi(0.02 * 13.0 * px)), roundi(13.0 * px), HudStyle.INK_3]], 0.0, 1.4)
	_tip.halo = Color(0.0, 0.0, 0.0, 0.45)
	_tip.set_meta("y", y)
	_tip.set_meta("w", w)
	_brand.add_child(_tip)
	_set_tip()
	y += 13.0 * px * 1.4 + 30.0 * px
	_bar = _Bar.new()
	_bar.size = Vector2(minf(280.0 * px, 0.64 * _vp.x), maxf(2.0, 3.0 * px * 0.75))
	_bar.position = Vector2((w - _bar.size.x) * 0.5, y)
	_brand.add_child(_bar)
	y += _bar.size.y
	_brand.size = Vector2(w, y)
	_brand.position = Vector2((_vp.x - w) * 0.5, _brand_y())


func _set_tip() -> void:
	_tip.set_text(TIPS[_tip_i])
	var w: float = _tip.get_meta("w")
	_tip.position.x = (w - _tip.size.x) * 0.5


## A hairline fading in from nothing toward the name (the logo's rules).
class _Rule:
	extends Control
	var _toward_left := false

	func _init(sz: Vector2, toward_left: bool) -> void:
		size = sz
		_toward_left = toward_left
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var gold := Color(0.957, 0.78, 0.396, 0.9)
		var clear := Color(gold, 0.0)
		var a := gold if _toward_left else clear
		var b := clear if _toward_left else gold
		draw_primitive(PackedVector2Array([Vector2.ZERO, Vector2(size.x, 0.0), size, Vector2(0.0, size.y)]), PackedColorArray([a, b, b, a]), PackedVector2Array())


## The name's soft dark shadow (the web's drop-shadow 0 6px 26px): its
## letters drawn dark a few times about the drop, faint.
class _Drop:
	extends Control
	var _of: UiText

	func _init(of: UiText) -> void:
		_of = of
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		position = of.position
		size = of.size

	func _draw() -> void:
		var r: Array = _of.runs[0]
		var f: Font = r[1]
		var sz: int = r[2]
		var base := Vector2(0.0, _of.baseline())
		var d := 6.0 * HudStyle.PX * 0.5
		for i in 8:
			var a := TAU * i / 8.0
			var off := Vector2(cos(a), sin(a)) * d * 1.6 + Vector2(0.0, d)
			draw_string(f, base + off, str(r[0]), HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0.0, 0.02, 0.04, 0.05))


## A soft dark pool behind the crest (its drop shadow).
class _Glow:
	extends Control

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size * 0.5 + Vector2(0.0, 4.0 * HudStyle.PX)
		var r := size.x * 0.5
		for i in 6:
			var k := 1.0 - i / 6.0
			draw_circle(c, r * (0.75 + 0.35 * k), Color(0.0, 0.0, 0.0, 0.035), true, -1.0, true)


## The bar: a faint track, the fill (aqua into gold, with its glow) and a
## glint that runs along the track forever, so it never looks stuck.
class _Bar:
	extends Control
	var fill := 0.0
	var t := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var h := size.y
		_round(Rect2(Vector2.ZERO, size), Color(1.0, 1.0, 1.0, 0.1), Color(1.0, 1.0, 1.0, 0.1))
		var fw := size.x * clampf(fill, 0.0, 1.0)
		if fw > 0.5:
			# its glow, then the fill
			for i in 4:
				var g := (4.0 - i) * 3.0 * HudStyle.PX * 0.5
				var a := 0.07 + i * 0.03
				_round(Rect2(-g * 0.5, -g * 0.5, fw + g, h + g), Color(HudStyle.AQUA, a), Color(HudStyle.AQUA.lerp(HudStyle.GOLD, fill), a))
			_round(Rect2(0.0, 0.0, fw, h), HudStyle.AQUA, HudStyle.AQUA.lerp(HudStyle.GOLD, fill))
		# the glint: 40% of the track, crossing it every 1.8 s
		var p := MathX.bezier(0.4, 0.0, 0.3, 1.0, fmod(t, 1.8) / 1.8)
		var gw := size.x * 0.4
		var gx := -gw + (size.x + gw) * p
		var x0 := maxf(0.0, gx)
		var x1 := minf(size.x, gx + gw)
		if x1 > x0:
			var c := Color(1.0, 1.0, 1.0, 0.4)
			var l := Color(1.0, 1.0, 1.0, 0.4 * (1.0 - absf((x0 - gx) / gw * 2.0 - 1.0)))
			var r := Color(1.0, 1.0, 1.0, 0.4 * (1.0 - absf((x1 - gx) / gw * 2.0 - 1.0)))
			var m := clampf(gx + gw * 0.5, x0, x1)
			draw_primitive(PackedVector2Array([Vector2(x0, 0.0), Vector2(m, 0.0), Vector2(m, h), Vector2(x0, h)]), PackedColorArray([l, c, c, l]), PackedVector2Array())
			draw_primitive(PackedVector2Array([Vector2(m, 0.0), Vector2(x1, 0.0), Vector2(x1, h), Vector2(m, h)]), PackedColorArray([c, r, r, c]), PackedVector2Array())

	# a capsule from left colour a to right colour b
	func _round(r: Rect2, a: Color, b: Color) -> void:
		var rad := r.size.y * 0.5
		draw_circle(r.position + Vector2(rad, rad), rad, a, true, -1.0, true)
		draw_circle(r.position + Vector2(r.size.x - rad, rad), rad, b, true, -1.0, true)
		var x0 := r.position.x + rad
		var x1 := r.end.x - rad
		if x1 > x0:
			draw_primitive(PackedVector2Array([Vector2(x0, r.position.y), Vector2(x1, r.position.y), Vector2(x1, r.end.y), Vector2(x0, r.end.y)]), PackedColorArray([a, b, b, a]), PackedVector2Array())
