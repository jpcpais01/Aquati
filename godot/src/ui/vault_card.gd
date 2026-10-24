class_name VaultCard
extends UiButton
## A Treasure Vault card (the web's .vc): face down it is deep-sea lacquer
## and a gilded compass rose glowing with what waits underneath (an epic
## breathes, a legendary trembles); turned over it is its rarity's gilded
## frame round the item's living art (CosArt), its name plate and gems, a
## shimmer of foil on the rarer ones, its badges (New, a duplicate's gold,
## Equipped) and, on a legendary, a slow ring of golden rays behind it.
## The card's body takes the fly-out of the chest, the turn and the pop;
## the button itself only squeezes under a finger.

## The web's card back (120 x 168): a gilded compass rose and border.
const BACK_SVG := '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b5"/><stop offset=".5" stop-color="#e9b552"/><stop offset="1" stop-color="#9c6418"/></linearGradient></defs><g fill="none" stroke="url(#g)" stroke-linecap="round"><rect x="7" y="7" width="106" height="154" rx="9" stroke-width="1.6"/><rect x="12" y="12" width="96" height="144" rx="6" stroke-width=".8" stroke-dasharray="2 3" opacity=".7"/><circle cx="60" cy="84" r="34" stroke-width="1.4"/><circle cx="60" cy="84" r="27" stroke-width=".7" opacity=".7"/><circle cx="60" cy="84" r="44" stroke-width=".6" opacity=".45"/>%s<circle cx="60" cy="84" r="4" fill="url(#g)"/>%s</g>'
## The turn (s) and its curve (the web's cubic-bezier(.3, 1.3, .45, 1)).
const FLIP := 0.85
const POP := 0.75
const FLY := 0.76

## The item, and what the open gave (empty from the collection): {fresh, refund}.
var item: Dictionary
var result: Dictionary
var rarity := 0
var is_open := false
var locked := false
var small := false
## Its rarity's colour and the deeper one.
var rc := Color.WHITE
var rd := Color.BLACK

var _w := 0.0
var _h := 0.0
var _em := 0.0
var _body := Control.new()
var _behind: _Behind
var _back: Control
var _front: Control
var _frame: UiBox
var _foil: UiBox
var _back_box: UiBox
var _eq: Control
var _t := 0.0
## 0 face down .. 1 face up, through the turn (overshooting a little).
var _flip := 0.0
var _flip_t := -1.0
var _pop_t := -1.0
var _fly_t := -1.0
var _fly_delay := 0.0
var _fly_from := Vector2.ZERO
var _fly_spin := 0.0
var _quake_t := -1.0


## `w` units wide (7:5 tall), face up if `open`; a result's badge (New, or
## the gold a duplicate paid back), else how many you hold; `count` and
## whether she wears it come from the vault.
func _init(w: float, it: Dictionary, p_result: Dictionary, open: bool, p_mini: bool, p_locked: bool, count: int, worn: bool) -> void:
	item = it
	result = p_result
	rarity = int(it.rarity)
	is_open = open
	locked = p_locked
	small = p_mini
	var r: Dictionary = Cosmetics.RARITIES[rarity]
	rc = r.css
	rd = r.deep
	_w = w
	_h = roundf(w * 1.4)
	_em = w * 0.083
	super(Vector2(w, _h), 1.15 * _em, 0.0)
	squeeze = 0.97
	# the button itself is only a hit area: the card is drawn by its body
	p("c_top", Color(0, 0, 0, 0)).p("c_foot", Color(0, 0, 0, 0)).p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0, 0, 0, 0))
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.size = size
	_body.pivot_offset = size * 0.5
	add_child(_body)
	_behind = _Behind.new(self)
	_body.add_child(_behind)
	_front = _build_front(count, worn)
	_body.add_child(_front)
	if not open:
		_back = _build_back()
		_body.add_child(_back)
	_flip = 1.0 if open else 0.0
	_apply_flip()
	set_process(true)


func _build_back() -> Control:
	var em := _em
	var c := Control.new()
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.size = size
	c.pivot_offset = size * 0.5
	_back_box = UiBox.new(size, 1.15 * em, 3.0 * em)
	_back_box.p("c_top", Color("#17405a")).p("c_foot", Color("#081a28")).p("hi", 0.0)
	_back_box.p("c_border", Color(0.957, 0.78, 0.396, 0.6)).p("border", 0.12 * em)
	_back_box.p("c_glow", Color(rc, 0.35 if rarity == 0 else 0.55)).p("glow", (0.9 if rarity == 0 else 1.6) * em)
	_back_box.p("c_shadow", Color(0, 0, 0, 0.45)).p("shadow", Vector2(1.0, 2.4) * em)
	_back_box.p("c_inset", Color(0, 0, 0, 0.22)).p("inset", 0.3 * em)
	_back_box.p("sheen_w", 0.16).p("sheen_span", Vector2(-1.5, 7.0)).p("sheen_a", 0.35 if rarity == 3 else 0.2)
	c.add_child(_back_box)
	# what waits underneath glows through the lacquer
	CosArt._sprites()
	var tint := Control.new()
	tint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tint.size = size
	tint.draw.connect(func() -> void:
		var rr := _w * 0.62
		tint.draw_texture_rect(CosArt._glow, Rect2(size * 0.5 - Vector2(rr, rr), Vector2(rr, rr) * 2.0), false, Color(rc, 0.3)))
	c.add_child(tint)
	var rays := ""
	for a in [0, 45, 90, 135, 180, 225, 270, 315]:
		var diag: bool = a % 90 != 0
		rays += '<path d="M60 %s L%s 84 L60 88 L%s 84 Z" transform="rotate(%d 60 84)" fill="url(#g)" fill-opacity="%s" stroke-width=".6"/>' % [
			84 - (30 if diag else 41), 62.5 if diag else 64, 57.5 if diag else 56, a, 0.45 if diag else 0.9]
	var gems := ""
	for q: Vector2 in [Vector2(20, 20), Vector2(100, 20), Vector2(20, 148), Vector2(100, 148)]:
		gems += '<path d="M%s %s L%s %s L%s %s L%s %s Z" fill="url(#g)" stroke-width=".5"/>' % [q.x - 5, q.y, q.x, q.y - 5, q.x + 5, q.y, q.x, q.y + 5]
	var art := TextureRect.new()
	art.texture = Icons.svg("vault-back", BACK_SVG % [rays, gems], size * 0.94, Rect2(0, 0, 120, 168))
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.size = size * 0.94
	art.position = size * 0.03
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.add_child(art)
	return c


func _build_front(count: int, worn: bool) -> Control:
	var em := _em
	var c := Control.new()
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.size = size
	c.pivot_offset = size * 0.5
	_frame = UiBox.new(size, 1.15 * em, 3.0 * em)
	var light := rc.lerp(Color.WHITE, 0.3)
	if rarity == 0:
		_frame.p("c_top", Color("#d6efe9")).p("c_mid", Color("#5f8f88")).p("mid", 0.45).p("c_foot", Color("#456f6a"))
	else:
		_frame.p("c_top", light).p("c_mid", rd).p("mid", 0.4).p("c_foot", rc.lerp(Color.WHITE, 0.25))
	_frame.p("border", 0.0).p("hi", 0.35)
	_frame.p("c_shadow", Color(0, 0, 0, 0.45)).p("shadow", Vector2(1.0, 2.4) * em)
	_frame.p("c_glow", Color(rc, 0.55 if rarity == 3 else 0.35)).p("glow", (2.4 if rarity == 3 else 1.4) * em)
	if rarity == 3:
		_frame.p("c_top", Color("#fff3c4")).p("c_mid", Color("#e0701a")).p("c_foot", Color("#ffe9a6"))
		_frame.p("sheen_w", 0.22).p("sheen_span", Vector2(-1.2, 5.5)).p("sheen_a", 0.6)
	c.add_child(_frame)
	var pad := 0.28 * em
	var aw := _w - pad * 2.0
	var ah := roundf(aw * 0.9)
	# the art, its top corners round (clipped by the panel it sits in)
	var win := Panel.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color("#06131c")
	sb.corner_radius_top_left = int(0.9 * em)
	sb.corner_radius_top_right = int(0.9 * em)
	sb.corner_radius_bottom_left = int(0.25 * em)
	sb.corner_radius_bottom_right = int(0.25 * em)
	sb.anti_aliasing = true
	win.add_theme_stylebox_override("panel", sb)
	win.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	win.mouse_filter = Control.MOUSE_FILTER_IGNORE
	win.position = Vector2(pad, pad)
	win.size = Vector2(aw, ah)
	c.add_child(win)
	var art: Control = CosArt.SkinArt.new(Vector2(aw, ah), item, locked) if item.kind == "skin" \
			else CosArt.FxArt.new(Vector2(aw, ah), item, locked, int(item.get("style", 0)) * 3 + rarity)
	win.add_child(art)
	if locked:
		var l := aw * 0.26
		for k in 2:
			var lock := Icons.rect("lock", l, Color(0, 0, 0, 0.5) if k == 0 else Color(1, 1, 1, 0.85))
			lock.position = Vector2((aw - l) * 0.5, (ah - l) * 0.5 + (0.12 * em if k == 0 else 0.0))
			win.add_child(lock)
	# the foil: a band of light drifting over the rarer ones
	if rarity >= 1 and not locked:
		_foil = UiBox.new(Vector2(aw, ah), 0.9 * em, 0.0)
		_foil.p("c_top", Color(0, 0, 0, 0)).p("c_foot", Color(0, 0, 0, 0)).p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0, 0, 0, 0))
		_foil.p("sheen_w", 0.35).p("sheen_span", Vector2(-1.5, 3.5)).p("sheen_a", [0.0, 0.12, 0.2, 0.28][rarity])
		_foil.position = win.position
		c.add_child(_foil)
	# the plate
	var py := pad + ah + 0.22 * em
	var plate := UiBox.new(Vector2(aw, _h - py - pad), 0.5 * em, 0.0)
	plate.p("c_top", rd.lerp(Color("#0d2433"), 0.74)).p("c_foot", Color("#061520")).p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0, 0, 0, 0))
	plate.position = Vector2(pad, py)
	c.add_child(plate)
	var kind := MenuKit.words(str(Cosmetics.KIND_NAMES[item.kind]).to_upper(), "inter", 700, 0.6 * em, HudStyle.INK_3, 0.16, 1.2)
	kind.position = Vector2(0.7 * em, 0.5 * em)
	kind.cut_to(aw - 1.4 * em)
	plate.add_child(kind)
	var nm := MenuKit.words(str(item.name), "inter", 800, 1.05 * em, HudStyle.INK_2 if locked else HudStyle.INK, -0.01, 1.1)
	nm.position = Vector2(0.7 * em, kind.position.y + kind.size.y)
	nm.cut_to(aw - 1.4 * em)
	plate.add_child(nm)
	var rar := MenuKit.words(str(Cosmetics.RARITIES[rarity].name).to_upper(), "inter", 800, 0.62 * em, rc, 0.14, 1.2)
	var gems := _Gems.new(rarity + 1, 0.62 * em, rc)
	var foot := plate.size.y - 0.55 * em
	gems.position = Vector2(0.7 * em, foot - rar.size.y * 0.5 - gems.size.y * 0.5)
	rar.position = Vector2(gems.position.x + gems.size.x + 0.35 * em, foot - rar.size.y)
	plate.add_child(gems)
	plate.add_child(rar)
	# badges
	if not result.is_empty():
		var fresh := bool(result.get("fresh", false))
		c.add_child(_badge("NEW" if fresh else "+%s GOLD" % MenuKit.num(int(result.get("refund", 0))), "new" if fresh else "dup", false))
	elif not locked and count > 1:
		c.add_child(_badge("×%d" % count, "dup", false))
	_eq = _badge("EQUIPPED", "eq", true)
	_eq.visible = worn and not locked
	c.add_child(_eq)
	return c


## A badge in a top corner: new (gold), dup (dark), eq (white, on the right).
func _badge(text: String, look: String, right: bool) -> Control:
	var em := _em
	var ink: Color = {"new": HudStyle.GOLD_INK, "dup": HudStyle.GOLD_HI, "eq": Color("#0a1c26")}[look]
	var t := MenuKit.words(text, "inter", 800, 0.6 * em, ink, 0.1, 1.2)
	var b := UiBox.new(Vector2(t.size.x + 1.5 * em, t.size.y + 0.64 * em), 99.0 * em, 1.5 * em)
	match look:
		"new":
			HudStyle.gold(b, em / 12.0)
			b.p("c_shadow", Color(0.957, 0.706, 0.275, 0.55)).p("shadow", Vector2(0.3, 1.0) * em)
		"dup":
			b.p("c_top", Color(0, 0, 0, 0.62)).p("c_foot", Color(0, 0, 0, 0.62)).p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0, 0, 0, 0))
		_:
			b.p("c_top", Color(0.957, 0.973, 0.976, 0.94)).p("c_foot", Color(0.957, 0.973, 0.976, 0.94)).p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0, 0, 0, 0.25)).p("shadow", Vector2(0.2, 0.8) * em)
	t.position = Vector2(0.75 * em, 0.32 * em)
	b.add_child(t)
	b.position = Vector2(_w - 0.75 * em - b.size.x if right else 0.75 * em, 0.75 * em)
	return b


## Whether she wears it (its Equipped badge).
func set_worn(on: bool) -> void:
	if _eq != null:
		_eq.visible = on and not locked


## Flies out of the chest's mouth (`from`, in the card's parent's units) into
## its place, `delay` s from now, spinning `spin` degrees as it comes.
func fly_from(from: Vector2, delay: float, spin: float) -> void:
	_fly_from = from - (position + size * 0.5)
	_fly_delay = delay
	_fly_spin = spin
	_fly_t = 0.0
	_place()


## Turns over (once), with a pop.
func turn_over() -> void:
	if is_open:
		return
	is_open = true
	_flip_t = 0.0
	_pop_t = 0.0
	_behind.burst()


## Shakes with the chest's quake.
func quake() -> void:
	_quake_t = 0.0


func flying() -> bool:
	return _fly_t >= 0.0 and _fly_t < _fly_delay + FLY


func _process(dt: float) -> void:
	# (the button sleeps once its squeeze settles: the card never does)
	super(dt)
	set_process(true)
	_t += dt
	if _flip_t >= 0.0:
		_flip_t += dt
		var k := minf(1.0, _flip_t / FLIP)
		_flip = MathX.bezier(0.3, 1.3, 0.45, 1.0, k)
		if k >= 1.0:
			_flip_t = -1.0
			_flip = 1.0
			if _back != null:
				_back.queue_free()
				_back = null
		_apply_flip()
	if _pop_t >= 0.0:
		_pop_t += dt
		if _pop_t >= POP:
			_pop_t = -1.0
	if _fly_t >= 0.0:
		_fly_t += dt
		if _fly_t >= _fly_delay + FLY:
			_fly_t = -1.0
	if _quake_t >= 0.0:
		_quake_t += dt
		if _quake_t >= 0.6:
			_quake_t = -1.0
	_place()
	# a face-down epic breathes, a face-down legendary trembles and glows;
	# the backs' glint sweeps
	if _back_box != null:
		var per := 1.4 if rarity == 3 else 3.2
		var u := fmod(_t, per) / per
		_back_box.p("sheen", 0.5 - 0.5 * cos(u * TAU) if not is_open else -1.0)
		if rarity >= 2 and not is_open:
			var wave := 0.5 - 0.5 * cos(_t * TAU / (1.0 if rarity == 3 else 1.8))
			_back_box.p("glow", (1.6 + wave * (1.4 if rarity == 3 else 0.8)) * _em)
			_back_box.p("c_glow", Color(rc, 0.55 + wave * 0.4))
	if _foil != null:
		# resting rare cards drift their foil on their own
		var f := 0.5 - 0.5 * cos(_t * TAU / 10.0)
		_foil.p("sheen", f)
	if rarity == 3 and _frame != null:
		# the legendary's gilded frame turns its light round
		_frame.p("mid", 0.25 + 0.5 * (0.5 - 0.5 * cos(_t * TAU / 5.0)))
		_frame.p("sheen", fmod(_t, 3.0) / 3.0)
	_behind.queue_redraw()


## The body's pose: flying out, popping, trembling, as it turns.
func _place() -> void:
	var off := Vector2.ZERO
	var sc := 1.0
	var rot := 0.0
	var alpha := 1.0
	if _fly_t >= 0.0:
		var k := clampf((_fly_t - _fly_delay) / FLY, 0.0, 1.0)
		var e := MathX.bezier(0.25, 0.8, 0.3, 1.05, k)
		# translate(d) scale(.12) rotate(spin), at .55 a third of the way and
		# lifted, scale .8 and turned back, then home
		if e < 0.55:
			var q := e / 0.55
			off = _fly_from.lerp(_fly_from * 0.35 - Vector2(0.0, 60.0 * MenuKit.PX), q)
			sc = lerpf(0.12, 0.8, q)
			rot = lerpf(_fly_spin, -_fly_spin * 0.4, q)
		else:
			var q := (e - 0.55) / 0.45
			off = (_fly_from * 0.35 - Vector2(0.0, 60.0 * MenuKit.PX)).lerp(Vector2.ZERO, q)
			sc = lerpf(0.8, 1.0, q)
			rot = lerpf(-_fly_spin * 0.4, 0.0, q)
		alpha = clampf(k / 0.18, 0.0, 1.0)
	if _pop_t >= 0.0:
		# up to 1.12 and lifted at 40%, on the web's spring
		var k := _pop_t / POP
		var bump := HudStyle.spring(k / 0.4) if k < 0.4 else 1.0 - HudStyle.spring((k - 0.4) / 0.6)
		sc *= 1.0 + 0.12 * bump
		off.y -= 0.4 * _em * bump
	if _quake_t >= 0.0:
		const KEYS := [Vector2(0, 0), Vector2(-7, 3), Vector2(6, -4), Vector2(-4, -2), Vector2(3, 3), Vector2(-1, 0), Vector2(0, 0)]
		const AT := [0.0, 0.15, 0.3, 0.45, 0.6, 0.8, 1.0]
		var k := _quake_t / 0.6
		for i in 6:
			if k <= AT[i + 1]:
				off += (KEYS[i] as Vector2).lerp(KEYS[i + 1], (k - AT[i]) / (AT[i + 1] - AT[i])) * MenuKit.PX
				break
	if rarity == 3 and not is_open and _back != null and _fly_t < 0.0:
		# the face-down legendary's wait: a tremble and a lift
		var w := sin(_t * TAU)
		rot += w * 1.2
		off.y -= absf(w) * 0.15 * _em
	_body.position = off
	_body.scale = Vector2(sc, sc)
	_body.rotation_degrees = rot
	_body.modulate.a = alpha


## The turn: the card narrows to its edge and widens again on its other face.
func _apply_flip() -> void:
	var ang := (1.0 - _flip) * PI
	var sx := maxf(0.001, absf(cos(ang)))
	var face_up := ang < PI * 0.5
	_front.visible = face_up
	_front.scale = Vector2(sx, 1.0)
	if _back != null:
		_back.visible = not face_up
		_back.scale = Vector2(sx, 1.0)


func _draw() -> void:
	pass


## The light behind a card: the burst as it turns over, an epic's soft glow,
## a legendary's slow ring of golden rays.
class _Behind:
	extends Control
	var card: VaultCard
	var _burst := -1.0

	func _init(c: VaultCard) -> void:
		card = c
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = c.size
		show_behind_parent = false
		var add := CanvasItemMaterial.new()
		add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = add
		CosArt._sprites()

	func burst() -> void:
		_burst = 0.0

	func _process(dt: float) -> void:
		if _burst >= 0.0:
			_burst += dt
			if _burst > 1.0:
				_burst = -1.0

	func _draw() -> void:
		var c := card
		var mid := size * 0.5
		if c.is_open and not c.small:
			if c.rarity == 3:
				# rays, masked to a ring round the card
				var r := maxf(size.x, size.y) * 0.92
				var turn := c._t * TAU / 16.0
				for i in 18:
					var a := turn + i * TAU / 18.0
					var d0 := Vector2(cos(a - 0.035), sin(a - 0.035))
					var d1 := Vector2(cos(a + 0.035), sin(a + 0.035))
					var gold := Color(1.0, 0.8, 0.35, 0.34)
					var none := Color(1.0, 0.8, 0.35, 0.0)
					draw_polygon(PackedVector2Array([mid + d0 * r * 0.25, mid + d1 * r * 0.25, mid + d1 * r, mid + d0 * r]),
							PackedColorArray([gold, gold, none, none]))
			elif c.rarity == 2:
				var r := maxf(size.x, size.y) * 0.7
				draw_texture_rect(CosArt._glow, Rect2(mid - Vector2(r, r), Vector2(r, r) * 2.0), false, Color(c.rc, 0.28))
		if _burst >= 0.0:
			var k := _burst / (0.6 if c.rarity == 0 else 1.0)
			if k < 1.0:
				var r := maxf(size.x, size.y) * (1.05 if c.rarity == 0 else 1.6) * lerpf(0.3, 1.3, k)
				draw_texture_rect(CosArt._glow, Rect2(mid - Vector2(r, r), Vector2(r, r) * 2.0), false, Color(c.rc.lerp(Color.WHITE, 0.25), 1.0 - k))


## A rarity's gems: n little diamonds glowing in its colour.
class _Gems:
	extends Control
	var n := 1
	var d := 4.0
	var col := Color.WHITE

	func _init(p_n: int, p_d: float, c: Color) -> void:
		n = p_n
		d = p_d
		col = c
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = Vector2(n * d * 1.42 + (n - 1) * d * 0.38, d * 1.42)
		CosArt._sprites()

	func _draw() -> void:
		var h := d * 0.71
		for i in n:
			var c := Vector2(h + i * (d * 1.42 + d * 0.38), h)
			draw_texture_rect(CosArt._glow, Rect2(c - Vector2(d, d) * 1.4, Vector2(d, d) * 2.8), false, Color(col, 0.5))
			draw_colored_polygon(PackedVector2Array([c + Vector2(0, -h), c + Vector2(h, 0), c + Vector2(0, h), c + Vector2(-h, 0)]), col)
