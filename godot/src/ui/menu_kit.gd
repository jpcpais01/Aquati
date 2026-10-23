class_name MenuKit
## The menus' shared pieces, drawn as the web game's CSS draws them: words in
## one font and colour, glass, the round tool buttons, glass pills and the
## gold button, and the reveals the screens come in with. Sizes are the web's
## CSS pixels at its menu scale on a phone held sideways: U for its --u
## sizes, T for its --t type, PX for what it never scales.

const U := HudStyle.K
const T := HudStyle.T
const PX := HudStyle.PX

## How a piece comes in: rising from below (the web's rise), sliding in from
## the left (slideIn), popping up a little smaller (pop), or fading.
enum { RISE, SLIDE, POP, FADE }


## Words in one run, `px` units tall and tracked `em` of that.
static func words(s: String, family: String, weight: int, px: float, color: Color, em := 0.0, lead := 1.2) -> UiText:
	return UiText.new([[s, HudStyle.font(family, weight, roundi(em * px)), roundi(px), color]], 0.0, lead)


## Places `t` with its line in a CSS line box `lh` tall at (x, y): its font's
## ascent and descent centred in the box, as CSS sets a line.
static func line_at(t: UiText, x: float, y: float, lh: float) -> void:
	var r: Array = t.runs[0]
	var f: Font = r[1]
	var sz: int = r[2]
	var asc := f.get_ascent(sz)
	t.position = Vector2(x, y + (lh - asc - f.get_descent(sz)) * 0.5 + asc - t.baseline())


## A ship class side on, `h` units tall: lit (her own colours: teal hull, white
## canvas, a gold wale and pennant) or dim (a pale ghost of her).
static func ship_art(id: String, h: float, lit: bool) -> TextureRect:
	var c := ShipClass.named(id)
	var a: Array
	if lit:
		a = Art.ship(c, Color("#1f8a92"), Color("#f7f3ea"), Color("#9a6a3a"), {"trim": HudStyle.GOLD, "trim_w": 0.45, "port": Color("#0a2b38"), "flag": HudStyle.GOLD})
	else:
		var ghost := Color(0.941, 0.965, 0.973)
		a = Art.ship(c, Color(ghost, 0.3), Color(ghost, 0.2), Color(ghost, 0.34), {"trim": Color(ghost, 0.24), "trim_w": 0.3, "port": Color(0.016, 0.071, 0.102, 0.5), "flag": Color(ghost, 0.3)})
	var view: Rect2 = a[1]
	var sz := Vector2(h * view.size.x / view.size.y, h)
	var r := TextureRect.new()
	r.texture = Icons.svg("ship-art:%s:%s" % [id, "lit" if lit else "dim"], a[0], sz, view)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_SCALE
	r.size = sz
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


## A whole number with its thousands marked, as the web's toLocaleString.
static func num(n: int) -> String:
	var s := str(absi(n))
	var out := ""
	while s.length() > 3:
		out = "," + s.right(3) + out
		s = s.left(s.length() - 3)
	return ("-" if n < 0 else "") + s + out


## A box filled flat with glass under a hairline (the web's --glass-2 and --stroke).
static func glass(b: UiBox, fill: Color = HudStyle.GLASS_2) -> UiBox:
	return b.p("c_top", fill).p("c_foot", fill).p("c_border", HudStyle.STROKE).p("hi", 0.09)


## A box with no drop shadow.
static func flat(b: UiBox) -> UiBox:
	return b.p("c_shadow", Color(0.0, 0.0, 0.0, 0.0))


## A round glass button with an icon (`icon_px` across) in the middle: the
## harbour's tools, a sheet's close.
static func round(icon: String, d: float, icon_px: float, shadow := true) -> UiButton:
	var b := UiButton.new(Vector2(d, d), d * 0.5, 36.0 * U)
	glass(b)
	if shadow:
		b.p("c_shadow", Color(0.0, 0.0, 0.0, 0.18)).p("shadow", Vector2(8.0, 24.0) * U)
	else:
		flat(b)
	var ic := Icons.rect(icon, icon_px)
	ic.name = "Icon"
	ic.position = (Vector2(d, d) - ic.size) * 0.5
	b.add_child(ic)
	return b


## A round button's icon swapped, and tinted.
static func set_icon(b: Control, icon: String, tint: Color = Color.WHITE) -> void:
	var ic: TextureRect = b.get_node("Icon")
	ic.texture = Icons.texture(icon, ic.size.x)
	ic.self_modulate = tint


## A glass pill, `h` tall with `pad` either side: an icon (if any) and words.
static func pill(icon: String, label: String, h: float, pad: float, px: float, weight := 600, fill: Color = HudStyle.GLASS_2, ink: Color = HudStyle.INK) -> UiButton:
	var t := words(label, "inter", weight, px, ink)
	var ip := px * 1.3
	var gap := 8.0 * U
	var w := pad * 2.0 + t.size.x + ((ip + gap) if icon != "" else 0.0)
	var b := UiButton.new(Vector2(w, h), h * 0.5, 4.0)
	flat(glass(b, fill))
	var x := pad
	if icon != "":
		var ic := Icons.rect(icon, ip, ink)
		ic.name = "Icon"
		ic.position = Vector2(x, (h - ip) * 0.5)
		b.add_child(ic)
		x += ip + gap
	t.name = "Text"
	t.position = Vector2(x, (h - t.size.y) * 0.5)
	b.add_child(t)
	return b


## The gold button (the web's .btn.primary.big): its gradient, warm glow and
## inset light, an icon and words in dark ink, and now and then a glint of
## sun sweeping across (glint() each frame). `w` 0: as wide as it needs.
static func gold(icon: String, label: String, h: float, pad: float, px: float, icon_px: float, w := 0.0) -> UiButton:
	var ink := HudStyle.GOLD_INK
	var t := words(label, "inter", 800, px, ink, 0.04)
	var gap := 9.0 * U
	var need := icon_px + gap + t.size.x
	var bw := maxf(w, pad * 2.0 + need)
	var b := UiButton.new(Vector2(bw, h), h * 0.5, 46.0 * U)
	HudStyle.gold(b, U)
	# the glint: a band 30% of the button wide, from 40% off its left to 130% across
	b.p("sheen_w", 0.3).p("sheen_span", Vector2(-1.333, 4.333)).p("sheen_a", 0.6)
	var ic := Icons.rect(icon, icon_px, ink)
	ic.name = "Icon"
	var x := (bw - need) * 0.5
	ic.position = Vector2(x, (h - icon_px) * 0.5)
	t.name = "Text"
	t.position = Vector2(x + icon_px + gap, (h - t.size.y) * 0.5)
	b.add_child(ic)
	b.add_child(t)
	return b


## The gold button's glint at `t` s since it came up: across in the first
## 30% of every 4.5 s, from 1.2 s in.
static func glint(b: UiBox, t: float) -> void:
	var s := -1.0
	if t > 1.2:
		var ph := fmod(t - 1.2, 4.5) / 4.5
		if ph < 0.3:
			s = MathX.bezier(0.42, 0.0, 0.58, 1.0, ph / 0.3)
	b.p("sheen", s)


## A thin rule.
static func rule(w: float, color := Color(1.0, 1.0, 1.0, 0.08)) -> ColorRect:
	var r := ColorRect.new()
	r.color = color
	r.size = Vector2(w, maxf(1.0, PX * 0.6))
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


## A screen's pieces coming in, each after its delay, on the web's --ease.
class Reveal:
	var _items: Array = []

	func clear() -> void:
		_items.clear()

	## `n` comes in after `delay` s, over `dur` s, from `dist` units away.
	func add(n: Control, kind: int, delay: float, dur: float, dist := 0.0) -> void:
		_items.append([n, n.position, kind, delay, dur, dist])
		_place(_items[-1], 0.0)

	## Where everything is, `t` s in.
	func step(t: float) -> void:
		for it: Array in _items:
			_place(it, t)

	func done(t: float) -> bool:
		for it: Array in _items:
			if t < float(it[3]) + float(it[4]):
				return false
		return true

	func _place(it: Array, t: float) -> void:
		var n: Control = it[0]
		if not is_instance_valid(n):
			return
		var k := clampf((t - float(it[3])) / float(it[4]), 0.0, 1.0)
		var e := HudStyle.eased(k)
		var base: Vector2 = it[1]
		var dist: float = it[5]
		n.modulate.a = e
		match int(it[2]):
			MenuKit.RISE:
				n.position = base + Vector2(0.0, (1.0 - e) * dist)
			MenuKit.SLIDE:
				n.position = base - Vector2((1.0 - e) * dist, 0.0)
			MenuKit.POP:
				n.position = base + Vector2(0.0, (1.0 - e) * dist)
				var s := lerpf(0.97, 1.0, e)
				n.pivot_offset = n.size * 0.5
				n.scale = Vector2(s, s)
