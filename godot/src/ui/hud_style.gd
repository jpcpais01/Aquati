class_name HudStyle
## The HUD's palette, type and panels: the web game's glassy night-sea
## panels, white ink and gold.

const INK := Color("#f5f8f9")
const INK_2 := Color(0.918, 0.949, 0.961, 0.74)
const INK_3 := Color(0.918, 0.949, 0.961, 0.5)
const INK_4 := Color(0.918, 0.949, 0.961, 0.3)
const GOLD := Color("#f4c765")
const GOLD_HI := Color("#ffe7a8")
const GOLD_LO := Color("#d99a35")
const AQUA := Color("#5ee3d4")
const AQUA_HI := Color("#bff4ec")
const CORAL := Color("#ff7563")
## Dark ink on gold (the Fire button, the gold pills).
const GOLD_INK := Color("#1f1404")
const PANEL := Color(0.043, 0.11, 0.157, 0.82)
const STROKE := Color(1, 1, 1, 0.11)
const OFF := Color(1, 1, 1, 0.16)

## The web's CSS pixels in HUD units, as it sizes its HUD on a phone held
## sideways (about 390 CSS px tall to our 720): panels and type (its --k,
## 0.74 there), touch controls (--kt, 0.84), and what it never scales.
const K := 1.37
const KT := 1.55
const PX := 1.85
## The menus' type (the web's --t, 0.87 there: it shrinks half as fast as
## --u, so text stays readable as the spacing tightens). Menu sizes take K,
## the web's --u being its --k on that phone.
const T := 1.61
## The menus' glass and its brighter edge (the web's --glass-2, --stroke-2).
const GLASS_2 := Color(0.055, 0.133, 0.188, 0.68)
const STROKE_2 := Color(1, 1, 1, 0.2)
## The web's --gold-grad: top, middle (at 52%) and foot.
const GOLD_TOP := Color("#ffeab0")
const GOLD_MID := Color("#f6c766")
const GOLD_FOOT := Color("#e0a443")

static var _fonts := {}
static var _variants := {}


## A panel: rounded glass with a hairline edge and a soft drop shadow.
static func panel(radius: float, pad: Vector2 = Vector2(10, 6)) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = PANEL
	sb.border_color = STROKE
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(int(radius))
	sb.corner_detail = 10
	sb.shadow_color = Color(0.0, 0.03, 0.055, 0.28)
	sb.shadow_size = 10
	sb.shadow_offset = Vector2(0, 5)
	sb.content_margin_left = pad.x
	sb.content_margin_right = pad.x
	sb.content_margin_top = pad.y
	sb.content_margin_bottom = pad.y
	sb.anti_aliasing = true
	return sb


## Inter at a weight (500 .. 800) or Cinzel (700, 900), with optional tracking.
static func font(family: String, weight: int, spacing: int = 0) -> Font:
	var key := "%s%d|%d" % [family, weight, spacing]
	if _fonts.has(key):
		return _fonts[key]
	var base: FontFile = load("res://fonts/%s-%d.woff2" % [family, weight])
	var f: Font = base
	if spacing != 0:
		var fv := FontVariation.new()
		fv.base_font = base
		fv.spacing_glyph = spacing
		f = fv
	_fonts[key] = f
	return f


## The font with tabular figures, so counting numbers don't jitter.
static func tnum(f: Font) -> Font:
	var key := "t%d" % f.get_instance_id()
	if not _variants.has(key):
		var fv := FontVariation.new()
		fv.base_font = f
		fv.opentype_features = {TextServerManager.get_primary_interface().name_to_tag("tnum"): 1}
		_variants[key] = fv
	return _variants[key]


## The font slanted (the fonts carry no italic).
static func italic(f: Font) -> Font:
	var key := "i%d" % f.get_instance_id()
	if not _variants.has(key):
		var fv := FontVariation.new()
		fv.base_font = f
		fv.variation_transform = Transform2D(Vector2(1.0, 0.0), Vector2(0.2, 1.0), Vector2.ZERO)
		_variants[key] = fv
	return _variants[key]


## Text painted with a gradient down its line (shaders/text_grad.gdshader):
## [c0, c1, c2, c3, stops] over `height` units from `top`.
static func text_grad(g: Array, top: float, height: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = preload("res://shaders/text_grad.gdshader")
	m.set_shader_parameter("c0", g[0])
	m.set_shader_parameter("c1", g[1])
	m.set_shader_parameter("c2", g[2])
	m.set_shader_parameter("c3", g[3])
	m.set_shader_parameter("stops", g[4])
	m.set_shader_parameter("top", top)
	m.set_shader_parameter("height", height)
	return m


## A box as the web's gold button (.btn.primary): its gradient, its warm
## glow underneath and the inset light along the top and shade along the foot.
static func gold(b: UiBox, k: float) -> UiBox:
	b.p("c_top", GOLD_TOP).p("c_mid", GOLD_MID).p("mid", 0.52).p("c_foot", GOLD_FOOT).p("border", 0.0)
	b.p("c_shadow", Color(0.957, 0.706, 0.275, 0.32)).p("shadow", Vector2(10.0, 30.0) * k)
	b.p("hi", 0.7).p("c_lo", Color(0.588, 0.353, 0.059, 0.28)).p("lo_px", 2.0 * PX)
	return b


## The web's --spring (overshooting a touch, then settling) and --ease
## timing curves, at x in 0..1.
static func spring(x: float) -> float:
	return MathX.bezier(0.25, 1.4, 0.4, 1.0, x)


static func eased(x: float) -> float:
	return MathX.bezier(0.2, 0.9, 0.25, 1.0, x)


## The web's "no" shake (a button pressed in vain): -1..1 of its reach, t
## 0..1 through it.
static func shake(t: float) -> float:
	const KEYS := [0.0, -1.0, 1.0, -1.0, 1.0, 0.0]
	var x := clampf(t, 0.0, 1.0) * 5.0
	var i := mini(int(x), 4)
	return lerpf(KEYS[i], KEYS[i + 1], x - i)


## A ball of shot rammed home (the web's ball-load), t 0..1 through it: its
## drop (of its height, down), its scale and its opacity.
static func load_drop(t: float) -> Vector3:
	if t < 0.6:
		var u := spring(t / 0.6)
		return Vector3(lerpf(-0.4, 0.06, u), lerpf(0.6, 1.06, u), clampf(u, 0.0, 1.0))
	var v := spring((t - 0.6) / 0.4)
	return Vector3(lerpf(0.06, 0.0, v), lerpf(1.06, 1.0, v), 1.0)


## Shot found in salvage (the web's gain-rise and gain-bump), t 0..1 through
## its 1.3 s: the "+n" rising off a button (its rise in K units, its opacity)
## and the button's bump (its scale; the bump is done 0.5 s in).
static func gain_rise(t: float) -> Vector3:
	var y := lerpf(6.0, -22.0, eased(t))
	var a := eased(t / 0.15) if t < 0.15 else 1.0 - eased((t - 0.15) / 0.85)
	var b := t * 1.3 / 0.5
	var s := 1.0
	if b < 0.4:
		s = lerpf(1.0, 1.22, spring(b / 0.4))
	elif b < 1.0:
		s = lerpf(1.22, 1.0, spring((b - 0.4) / 0.6))
	return Vector3(y, clampf(a, 0.0, 1.0), s)


static func label(text: String, family: String, weight: int, size: int, color: Color, spacing: int = 0) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", font(family, weight, spacing))
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l
