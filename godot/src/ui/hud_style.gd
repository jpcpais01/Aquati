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

static var _fonts := {}


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
