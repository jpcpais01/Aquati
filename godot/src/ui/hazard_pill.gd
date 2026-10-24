class_name HazardPill
extends Control
## The sea's dangers on the HUD (the web game's .hz, src/ui/hazard.ts
## HazardHud): a pill under the top of the screen while a maelstrom or a reef
## has your attention. Amber when one lies ahead, coral red and breathing
## once it has hold of you, aqua when your keel clears the coral. A ring
## round its icon shows how hard the maelstrom grips (or how much water is
## over the coral against what you draw), the spiral turns faster the nearer
## the eye, and an arrow points the way out. Laid out again only when its
## words change.

const K := HudStyle.K
const PX := HudStyle.PX
## Per level: the accent, its glow, the glass's top and foot.
const LEVELS := {
	"warn": [Color("#ffc46a"), Color(1.0, 180.0 / 255.0, 80.0 / 255.0, 0.45), Color(30.0 / 255.0, 24.0 / 255.0, 14.0 / 255.0, 0.9), Color(14.0 / 255.0, 10.0 / 255.0, 6.0 / 255.0, 0.88)],
	"danger": [Color("#ff7a5c"), Color(1.0, 96.0 / 255.0, 60.0 / 255.0, 0.6), Color(52.0 / 255.0, 16.0 / 255.0, 10.0 / 255.0, 0.92), Color(24.0 / 255.0, 6.0 / 255.0, 4.0 / 255.0, 0.9)],
	"info": [Color("#6ee6d6"), Color(94.0 / 255.0, 227.0 / 255.0, 212.0 / 255.0, 0.45), Color(10.0 / 255.0, 36.0 / 255.0, 40.0 / 255.0, 0.9), Color(4.0 / 255.0, 16.0 / 255.0, 20.0 / 255.0, 0.88)],
}
const TITLE := Color("#fff4e0")

const SPIRAL := '<path d="M12 12.2c.9-.1 1.4-.9 1.2-1.7-.3-1.1-1.6-1.6-2.7-1.2-1.6.6-2.2 2.5-1.6 4 .8 2 3.3 2.8 5.2 1.9 2.5-1.1 3.4-4.2 2.3-6.6-1.4-3-5.1-4.1-8-2.7C4.9 7.6 3.7 12 5.4 15.4c2 4 7.1 5.4 11 3.4" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round"/>'
const CORAL := '<path d="M12 22v-6.5M12 15.5c0-2.4-1.6-3.6-3.4-4.4M12 15.5c.1-2.6 1.5-4.4 3.6-5.3M8.6 11.1c-.6-1.8-.3-3.6.6-5M8.6 11.1C6.8 10.4 5 10.6 3.6 11.6M15.6 10.2c.4-1.9 0-3.9-1-5.4M15.6 10.2c1.6-.9 3.4-.9 4.8 0M9.2 6.1l-.4-2.4M14.6 4.8l.6-2.3" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round"/><path d="M3 22h18" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>'
const ARROW := '<path d="M12 3.5 18.5 12H14v8.5h-4V12H5.5z" fill="#ffffff"/>'

var _box: UiBox
var _ico_box: Control
var _ico: TextureRect
var _ring: Control
var _title: UiText
var _sub: UiText
var _arrow: TextureRect
var _key := ""
var _kind := ""
var _level := "warn"
var _on := false
## Coming in or going (s since it last turned), its fade and its rise as they were then and are now.
var _t := 9.0
var _fade_from := 0.0
var _rise_from := 0.0
var _fade := 0.0
var _rise := 0.0
## The ring: where it is and where it's going (eased over 0.35 s).
var _gauge := 0.0
var _gauge_to := 0.0
## Seconds per turn of the spiral, and the breathing glow's and the jolt's clocks.
var _spin_s := 6.0
var _breathe := 0.0
var _jolt := -1.0
## The arrow: shown 0..1, and its screen angle (radians, 0 up, clockwise).
var _arrow_e := 0.0
var _arrow_on := false
var _arrow_a := 0.0
## Where it hangs: the middle of its top, and how wide it may grow.
var _top := Vector2.ZERO
var _most := 600.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	set_process(false)
	_box = UiBox.new(Vector2(300.0, 60.0), 30.0, 90.0 * PX)
	_box.p("c_shadow", Color(0.0, 0.0, 0.0, 0.38)).p("shadow", Vector2(12.0, 34.0) * PX).p("hi", 0.08).p("hi_px", PX)
	add_child(_box)
	var d := maxf(30.0 * PX, 36.0 * K)
	_ico_box = Control.new()
	_ico_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ico_box.size = Vector2(d, d)
	add_child(_ico_box)
	_ring = Control.new()
	_ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ring.size = Vector2(d, d)
	_ring.draw.connect(_draw_ring)
	_ico_box.add_child(_ring)
	_ico = TextureRect.new()
	_ico.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ico.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_ico.stretch_mode = TextureRect.STRETCH_SCALE
	# (inset 22%, drawn over a wider grid for its glow to spread into)
	var is_ := d * 0.56 * 32.0 / 24.0
	_ico.size = Vector2(is_, is_)
	_ico.pivot_offset = _ico.size * 0.5
	_ico.position = (Vector2(d, d) - _ico.size) * 0.5
	_ico_box.add_child(_ico)
	var tfs := roundi(maxf(12.0 * PX, 14.5 * K))
	var sfs := roundi(maxf(9.5 * PX, 11.0 * K))
	_title = UiText.new([["", HudStyle.font("cinzel", 700, roundi(0.08 * tfs)), tfs, TITLE]], 0.0, 1.1)
	_sub = UiText.new([["", HudStyle.font("inter", 600, roundi(0.04 * sfs)), sfs, TITLE]], 0.0, 1.1)
	add_child(_title)
	add_child(_sub)
	var ad := maxf(18.0 * PX, 22.0 * K)
	_arrow = TextureRect.new()
	_arrow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_arrow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_arrow.stretch_mode = TextureRect.STRETCH_SCALE
	_arrow.texture = Icons.svg("hz-arrow", _glowing(ARROW), Vector2(ad, ad) * 32.0 / 24.0, Rect2(-4.0, -4.0, 32.0, 32.0))
	_arrow.size = Vector2(ad, ad) * 32.0 / 24.0
	_arrow.pivot_offset = _arrow.size * 0.5
	add_child(_arrow)


## Where it hangs: the middle of its top at `top`, at most `most` wide.
func place(top: Vector2, most: float) -> void:
	if top == _top and most == _most:
		return
	_top = top
	_most = most
	if _key != "":
		_lay()


func on() -> bool:
	return _on


## What it says (empty: nothing has your attention): {kind "vortex"|"reef",
## level "info"|"warn"|"danger", title, sub, gauge 0..1, spin (s a turn),
## arrow (screen angle, NAN for none)}.
func show_view(v: Dictionary) -> void:
	var want := not v.is_empty()
	if want != _on:
		_on = want
		_fade_from = _fade
		_rise_from = _rise
		_t = 0.0
		if want:
			visible = true
		set_process(true)
	if not want:
		return
	var kind := str(v.kind)
	var level := str(v.level)
	var key := "%s|%s|%s|%s" % [kind, level, v.title, v.sub]
	if key != _key:
		_key = key
		if kind != _kind:
			_kind = kind
			_ico.texture = Icons.svg("hz-" + kind, _glowing(SPIRAL if kind == "vortex" else CORAL), _ico.size, Rect2(-4.0, -4.0, 32.0, 32.0))
			_ico.rotation = 0.0
		# stepping up to danger: the pill gives a jolt
		if level == "danger" and _level != "danger":
			_jolt = 0.0
		_level = level
		var lv: Array = LEVELS.get(level, LEVELS.warn)
		var accent: Color = lv[0]
		_box.p("c_top", lv[2]).p("c_foot", lv[3]).p("c_border", Color(accent, 0.45))
		_ico.self_modulate = accent
		_arrow.self_modulate = accent
		_title.set_text(str(v.title))
		var sub := Color(accent.lerp(TITLE, 0.3), 1.0)
		_sub.set_runs([[str(v.sub), _sub.runs[0][1], _sub.runs[0][2], sub]])
		if level != "danger":
			_box.p("glow", 0.0)
		_lay()
	_gauge_to = clampf(float(v.gauge), 0.0, 1.0)
	_spin_s = maxf(0.3, float(v.get("spin", 6.0)))
	var a: float = v.get("arrow", NAN)
	var show_arrow := not is_nan(a)
	if show_arrow != _arrow_on:
		_arrow_on = show_arrow
		_lay()
	if show_arrow:
		_arrow_a = a


func _process(dt: float) -> void:
	_t += dt
	# in: fading up (0.4 s) and dropping 14 px from 95% on the spring (0.6 s); out the same way back
	var to := 1.0 if _on else 0.0
	_fade = lerpf(_fade_from, to, MathX.bezier(0.25, 0.1, 0.25, 1.0, clampf(_t / 0.4, 0.0, 1.0)))
	_rise = lerpf(_rise_from, to, HudStyle.spring(clampf(_t / 0.6, 0.0, 1.0)))
	modulate.a = clampf(_fade, 0.0, 1.0)
	var s := lerpf(0.95, 1.0, _rise)
	var jx := 0.0
	if _jolt >= 0.0:
		_jolt += dt
		var j := _jolt / 0.45
		if j >= 1.0:
			_jolt = -1.0
		else:
			# (the web's hzJolt: right, left, right a little, settled)
			jx = 4.0 * PX * sin(j * TAU * 1.5) * (1.0 - j)
			s *= 1.0 + 0.04 * sin(j * PI)
	scale = Vector2(s, s)
	position = Vector2(roundf(_top.x - size.x * 0.5 + jx), _top.y - (1.0 - _rise) * 14.0 * PX)
	# the spiral turns (anticlockwise, as the web's), faster the nearer the eye
	if _kind == "vortex":
		_ico.rotation = fmod(_ico.rotation - TAU * dt / _spin_s, TAU)
	# danger breathes: its glow swells and falls every 1.3 s
	if _level == "danger":
		_breathe = fmod(_breathe + dt / 1.3, 1.0)
		var b := 0.5 - 0.5 * cos(_breathe * TAU)
		_box.p("c_glow", Color(LEVELS.danger[1], 0.6 * b)).p("glow", maxf(0.01, 22.0 * K * b))
	if _gauge != _gauge_to:
		_gauge = move_toward(_gauge, _gauge_to, dt / 0.35)
		_ring.queue_redraw()
	var ae := move_toward(_arrow_e, 1.0 if _arrow_on else 0.0, dt / 0.4)
	if ae != _arrow_e:
		_arrow_e = ae
		_arrow.modulate.a = ae
	if _arrow_e > 0.0:
		_arrow.rotation = lerp_angle(_arrow.rotation, _arrow_a, 1.0 - exp(-dt / 0.08))
	if not _on and _t >= 0.6:
		visible = false
		set_process(false)


## Lays it out round its words: the icon in its ring, the title over the
## line under it (both cut short if the pill would grow too wide), the arrow.
func _lay() -> void:
	var d := _ico_box.size.x
	var gap := 10.0 * K
	var bw := 1.0
	var ad := _arrow.size.x * 24.0 / 32.0 if _arrow_on else 0.0
	_title.cut_to(0.0)
	_sub.cut_to(0.0)
	var tw := maxf(_title.size.x, _sub.size.x)
	var fixed := bw + 8.0 * K + d + gap + (gap + ad if _arrow_on else 0.0) + 14.0 * K + bw
	var room := maxf(60.0, _most - fixed)
	if tw > room:
		tw = room
		_title.cut_to(tw)
		_sub.cut_to(tw)
	var lt := HelmPill._line(_title)
	var ls := HelmPill._line(_sub)
	var th := lt + 3.0 * K + ls
	var ch := maxf(d, th)
	var w := roundf(fixed + tw)
	var h := roundf(bw + 7.0 * K + ch + 7.0 * K + bw)
	var cy := h * 0.5
	size = Vector2(w, h)
	pivot_offset = Vector2(size.x * 0.5, 0.0)
	_box.resize(size)
	_box.p("radius", h * 0.5)
	_ico_box.position = Vector2(bw + 8.0 * K, roundf(cy - d * 0.5))
	var tx := bw + 8.0 * K + d + gap
	var y := cy - th * 0.5
	MenuKit.line_at(_title, tx, y, lt)
	MenuKit.line_at(_sub, tx, y + lt + 3.0 * K, ls)
	_arrow.visible = _arrow_on
	_arrow.position = Vector2(tx + tw + gap + (ad - _arrow.size.x) * 0.5, roundf(cy - _arrow.size.y * 0.5))
	_ring.queue_redraw()


## The gauge: a faint full ring and the accent's arc over it, from the top clockwise.
func _draw_ring() -> void:
	var d := _ring.size.x
	var c := Vector2(d, d) * 0.5
	var w := d * 2.6 / 40.0
	var r := d * 17.0 / 40.0
	_ring.draw_arc(c, r, 0.0, TAU, 64, Color(1.0, 240.0 / 255.0, 210.0 / 255.0, 0.12), w, true)
	var g := clampf(_gauge, 0.0, 1.0)
	if g > 0.005:
		var accent: Color = LEVELS.get(_level, LEVELS.warn)[0]
		var a0 := -PI * 0.5
		_ring.draw_arc(c, r, a0, a0 + TAU * g, maxi(8, roundi(64 * g)), accent, w, true)
		# (round caps)
		_ring.draw_circle(c + Vector2(cos(a0), sin(a0)) * r, w * 0.5, accent, true, -1.0, true)
		var a1 := a0 + TAU * g
		_ring.draw_circle(c + Vector2(cos(a1), sin(a1)) * r, w * 0.5, accent, true, -1.0, true)


## A white glyph over its own soft glow (the web's drop-shadow), for tinting.
static func _glowing(art: String) -> String:
	return '<defs><filter id="g" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="1.6"/></filter></defs><g filter="url(#g)" opacity="0.55">%s</g>%s' % [art, art]
