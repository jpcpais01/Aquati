class_name CosArt
## The Treasure Vault's card art for the Shipwright's Skins and Guns tabs
## (the web's swatch.ts and fxPreview.ts), and the cards themselves.
##
## A skin's card is a little ship painted with the very pattern she wears at
## sea (skin_card.gdshader), drawn once into its own viewport (an animated
## skin keeps drawing, but only while its card is on screen) with the sea it
## rides drawn live over it. A blast or trail plays a looping vignette: a gun
## fires, or a ball flies across trailing it, a few dozen particles on the CPU
## drawn as soft sprites, the glowing ones in an additive layer of their own.

const SKIN_CARD := preload("res://shaders/skin_card.gdshader")
## The web card's art, 168 x 110.
const ASPECT := 110.0 / 168.0

static var _glow: Texture2D
static var _puff: Texture2D
static var _dot: Texture2D
static var _warm: Texture2D


## The web's CSS filter on art not yet found: grayscale(0.85) brightness(0.5).
static func dim(c: Color) -> Color:
	var l := c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
	return Color(lerpf(c.r, l, 0.85) * 0.5, lerpf(c.g, l, 0.85) * 0.5, lerpf(c.b, l, 0.85) * 0.5, c.a)


static func _radial(stops: PackedFloat32Array, alphas: PackedFloat32Array) -> Texture2D:
	var g := Gradient.new()
	g.offsets = stops
	var cs := PackedColorArray()
	for a in alphas:
		cs.append(Color(1.0, 1.0, 1.0, a))
	g.colors = cs
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	t.width = 64
	t.height = 64
	return t


## The sprites: a soft glow, a smoke puff, a hard little spark.
static func _sprites() -> void:
	if _glow == null:
		_glow = _radial(PackedFloat32Array([0.0, 0.5, 1.0]), PackedFloat32Array([1.0, 0.35, 0.0]))
		_puff = _radial(PackedFloat32Array([0.0, 0.5, 1.0]), PackedFloat32Array([1.0, 0.8, 0.0]))
		_dot = _radial(PackedFloat32Array([0.0, 0.86, 1.0]), PackedFloat32Array([1.0, 1.0, 0.0]))
		_warm = _radial(PackedFloat32Array([0.0, 0.7, 1.0]), PackedFloat32Array([1.0, 0.0, 0.0]))


## Whether a control shows anywhere in the window (its card scrolled into view).
static func on_screen(c: Control) -> bool:
	return c.is_visible_in_tree() and c.get_global_rect().intersects(c.get_viewport_rect())


# ------------------------------------------------------------------ the cards


## A vault item's card (the web's .sw-cos-card): its art over its name and
## rarity, locked and dimmed until it's found, a New badge while it's fresh,
## ringed white while she wears it.
class Card:
	extends UiButton
	var id := ""
	var owned := true
	var _rc := Color.WHITE

	func _init(w: float, it: Dictionary, p_owned: bool, fresh: bool, index: int) -> void:
		var px := MenuKit.PX
		id = str(it.id)
		owned = p_owned
		var r: Dictionary = Cosmetics.RARITIES[int(it.rarity)]
		_rc = r.css
		var art_h := roundf(w * ASPECT)
		var called := "Standard" if bool(it.base) else str(r.name)
		var name := MenuKit.words(str(it.name), "inter", 700, 12.5 * px, HudStyle.INK if owned else HudStyle.INK_3, 0.0, 1.2)
		var rar := MenuKit.words(called.to_upper(), "inter", 800, 9.5 * px, _rc, 0.14, 1.21)
		var h := art_h + (7.0 + 9.0 + 1.0) * px + name.size.y + rar.size.y
		super(Vector2(w, h), 16.0 * px, 40.0 * px)
		squeeze = 0.96
		p("c_top", Color(10 / 255.0, 30 / 255.0, 42 / 255.0, 0.8)).p("c_foot", Color(4 / 255.0, 14 / 255.0, 22 / 255.0, 0.9)).p("hi", 0.0)
		var art: Control = SkinArt.new(Vector2(w - 2.0 * px, art_h), it, not owned) if it.kind == "skin" \
				else FxArt.new(Vector2(w - 2.0 * px, art_h), it, not owned, index)
		art.position = Vector2(1.0, 1.0) * px
		add_child(art)
		name.position = Vector2(10.0 * px, art_h + 7.0 * px)
		name.cut_to(w - 20.0 * px)
		add_child(name)
		rar.position = Vector2(10.0 * px, name.position.y + name.size.y + 1.0 * px)
		add_child(rar)
		if not owned:
			var l := 22.0 * px
			for k in 2:
				var lock := Icons.rect("lock", l, Color(0.0, 0.0, 0.0, 0.5) if k == 0 else Color(1.0, 1.0, 1.0, 0.8))
				lock.position = Vector2((w - l) * 0.5, (art_h - l) * 0.5 + (2.0 * px if k == 0 else 0.0))
				add_child(lock)
		if fresh:
			var t := MenuKit.words("NEW", "inter", 800, 9.0 * px, Color("#1f1404"), 0.1, 1.21)
			var badge := UiBox.new(Vector2(t.size.x + 14.0 * px, t.size.y + 4.0 * px), 999.0, 4.0 * px)
			HudStyle.gold(badge, MenuKit.U)
			t.position = Vector2(7.0, 2.0) * px
			badge.p("c_shadow", Color(0.0, 0.0, 0.0, 0.3)).p("shadow", Vector2(2.0, 6.0) * px)
			badge.add_child(t)
			badge.position = Vector2(7.0, 7.0) * px
			add_child(badge)
		set_on(false)

	## Not hers yet: a shake of the head.
	func shake() -> void:
		var x := position.x
		var tw := create_tween()
		for d: float in [5.0, -4.0, 3.0, -2.0, 0.0]:
			tw.tween_property(self, "position:x", x + d * MenuKit.PX, 0.05)

	## Ringed white (the web's --focus) while she wears it.
	func set_on(v: bool) -> void:
		var px := MenuKit.PX
		if v:
			p("c_border", Color(0.0, 0.0, 0.0, 0.0)).p("border", 0.0)
			p("c_ring", Color(1.0, 1.0, 1.0, 0.95)).p("ring", 2.0 * px)
			p("c_glow", Color(1.0, 1.0, 1.0, 0.14)).p("glow", 6.0 * px)
			p("c_shadow", Color(0.627, 0.941, 1.0, 0.28)).p("shadow", Vector2(10.0, 36.0) * px)
		else:
			p("c_border", Color(_rc, 0.4)).p("border", 1.0 * px)
			p("ring", 0.0).p("glow", 0.0)
			p("c_shadow", Color(0.0, 0.0, 0.0, 0.25)).p("shadow", Vector2(2.0, 8.0) * px)


## The Treasure Vault's banner (the web's .sw-vault): its chest, what of
## the vault you've found, your purse, a glint sweeping across it.
class Banner:
	extends UiButton
	var _shine := 0.0

	func _init(w: float, found: int, of: int, purse: int, what: String) -> void:
		var px := MenuKit.PX
		var title := MenuKit.words("Treasure Vault", "inter", 800, 15.0 * px, HudStyle.GOLD_HI, 0.0, 1.2)
		var sub := MenuKit.words("%d of %d found · new %s inside" % [found, of, what], "inter", 500, 11.5 * px, HudStyle.INK_2, 0.0, 1.21)
		var h := maxf(34.0 * px, title.size.y + 2.0 * px + sub.size.y) + 24.0 * px
		super(Vector2(w, h), 18.0 * px, 40.0 * px)
		squeeze = 0.98
		p("c_top", Color8(40, 28, 8, 140)).p("c_foot", Color8(16, 12, 4, 153)).p("hi", 0.09)
		p("c_border", Color8(244, 199, 101, 89)).p("border", 1.0 * px)
		p("c_glow", Color8(244, 199, 101, 26)).p("glow", 24.0 * px)
		p("sheen_w", 0.16).p("sheen_span", Vector2(-1.0, 7.0)).p("sheen_a", 0.16)
		var warm := Control.new()
		warm.mouse_filter = Control.MOUSE_FILTER_IGNORE
		warm.size = Vector2(w, h)
		warm.draw.connect(func() -> void:
			# a warm light off the chest, an ellipse 60% x 120% at its left edge
			var r := Vector2(w * 0.6, h * 1.2)
			warm.draw_texture_rect_region(CosArt._warm, Rect2(Vector2(0.0, h * 0.5 - r.y), Vector2(r.x, r.y * 2.0)), Rect2(32.0, 0.0, 32.0, 64.0), Color8(255, 190, 61, 64)))
		CosArt._sprites()
		add_child(warm)
		var chest := _Chest.new(Vector2(40.0, 34.0) * px)
		chest.position = Vector2(14.0 * px, (h - chest.size.y) * 0.5)
		add_child(chest)
		var coin := Icons.rect("coin", 14.0 * px)
		var amt := MenuKit.words(MenuKit.num(purse), "inter", 800, 13.0 * px, HudStyle.GOLD_HI, 0.0, 1.21)
		amt.position = Vector2(w - 14.0 * px - amt.size.x, (h - amt.size.y) * 0.5)
		coin.position = Vector2(amt.position.x - 6.0 * px - coin.size.x, (h - coin.size.y) * 0.5)
		add_child(coin)
		add_child(amt)
		var tx := chest.position.x + chest.size.x + 12.0 * px
		title.position = Vector2(tx, (h - title.size.y - 2.0 * px - sub.size.y) * 0.5)
		sub.position = Vector2(tx, title.position.y + title.size.y + 2.0 * px)
		add_child(title)
		add_child(sub)
		title.cut_to(coin.position.x - 12.0 * px - tx)
		sub.cut_to(coin.position.x - 12.0 * px - tx)

	func _process(dt: float) -> void:
		_shine = fmod(_shine + dt, 3.2)
		# ease-in-out, and back: the web's alternate sweep
		var u := _shine / 3.2
		p("sheen", 0.5 - 0.5 * cos(u * TAU))

	## A tap: the vault itself opens in the next update; for now a nod.
	func nudge() -> void:
		var tw := create_tween()
		tw.tween_property(self, "scale", Vector2(1.02, 1.02), 0.08)
		tw.tween_property(self, "scale", Vector2.ONE, 0.18)


## The vault's little chest: dark wood banded in gold, glowing.
class _Chest:
	extends Control

	func _init(sz: Vector2) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = sz

	func _draw() -> void:
		var w := size.x
		var h := size.y
		var px := MenuKit.PX
		var gold := Color("#f1c35c")
		var glow := CosArt._warm
		if glow != null:
			draw_texture_rect(glow, Rect2(Vector2(-16.0, -16.0) * px, size + Vector2(32.0, 32.0) * px), false, Color8(255, 190, 61, 110))
		draw_rect(Rect2(0.0, 0.0, w, h * 0.42), Color("#8a4f2a"))
		draw_rect(Rect2(0.0, h * 0.42, w, h * 0.08), gold)
		draw_rect(Rect2(0.0, h * 0.5, w, h * 0.5), Color("#5e3218"))
		for x0: float in [0.18, 0.74]:
			draw_rect(Rect2(w * x0, 0.0, w * 0.08, h), gold)
		draw_rect(Rect2(Vector2.ONE * px, size - Vector2(2.0, 2.0) * px), Color(gold, 0.7), false, 2.0 * px)


# ------------------------------------------------------------------ skins


## A skin on a little ship (the web's drawSkinCard).
class SkinArt:
	extends Control
	var _vp: SubViewport
	var _mat: ShaderMaterial
	var _sea: Control
	var _locked := false
	var _animated := false
	var _t := 0.0
	var _odd := false

	func _init(sz: Vector2, it: Dictionary, locked: bool) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = sz
		_locked = locked
		_animated = bool(it.animated)
		_vp = SubViewport.new()
		_vp.size = Vector2i(maxi(1, roundi(sz.x)), maxi(1, roundi(sz.y)))
		_vp.transparent_bg = true
		_vp.disable_3d = true
		_vp.render_target_update_mode = SubViewport.UPDATE_ONCE
		add_child(_vp)
		var paint := ColorRect.new()
		paint.size = Vector2(_vp.size)
		_mat = ShaderMaterial.new()
		_mat.shader = SKIN_CARD
		_mat.set_shader_parameter("res", Vector2(_vp.size))
		var r: Dictionary = Cosmetics.RARITIES[int(it.rarity)]
		_mat.set_shader_parameter("deep", r.deep)
		var cs: Array = it.colors
		_mat.set_shader_parameter("paint", cs[0])
		_mat.set_shader_parameter("locked", 1.0 if locked else 0.0)
		# the skin's own uniforms, as on her materials but its glow lit up for show
		_mat.set_shader_parameter("skin_id", int(it.pattern))
		_mat.set_shader_parameter("skin_a", cs[0])
		_mat.set_shader_parameter("skin_b", cs[1])
		_mat.set_shader_parameter("skin_c", cs[2])
		_mat.set_shader_parameter("skin_p", Vector4(maxf(float(it.glow), 0.6), float(it.sail), 0.0, fmod(int(it.pattern) * 7.31, 10.0)))
		paint.material = _mat
		_vp.add_child(paint)
		var pic := TextureRect.new()
		pic.texture = _vp.get_texture()
		pic.size = sz
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var pm := CanvasItemMaterial.new()
		pm.blend_mode = CanvasItemMaterial.BLEND_MODE_PREMULT_ALPHA
		pic.material = pm
		add_child(pic)
		_sea = Control.new()
		_sea.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_sea.size = sz
		_sea.draw.connect(_draw_sea)
		add_child(_sea)

	func _process(dt: float) -> void:
		_t += minf(dt, 0.05)
		if not CosArt.on_screen(self):
			return
		_sea.queue_redraw()
		# an animated skin moves on (at half the frame rate: it's a card)
		_odd = not _odd
		if _animated and _odd:
			_mat.set_shader_parameter("t", _t)
			_vp.render_target_update_mode = SubViewport.UPDATE_ONCE

	## The sea she sits in: a swell along her boot top, darkening below.
	func _draw_sea() -> void:
		var w := size.x
		var h := size.y
		var y0 := h * (0.6 + 0.26 * 0.8)
		# the web's wave runs in its canvas's pixels (a 2x screen's)
		var f := 0.08 * 336.0 / w
		var top := PackedVector2Array()
		var x := 0.0
		while true:
			top.append(Vector2(x, y0 + sin(x * f + _t * 1.6) * h * 0.012))
			if x >= w:
				break
			x = minf(w, x + w / 28.0)
		var y30 := y0 + (h - y0) * 0.3
		var c0 := _c(Color8(40, 150, 170, 0))
		var c30 := _c(Color8(30, 120, 150, 191))
		var c1 := _c(Color8(8, 40, 60, 242))
		for i in top.size() - 1:
			var a := top[i]
			var b := top[i + 1]
			_sea.draw_polygon(PackedVector2Array([a, b, Vector2(b.x, y30), Vector2(a.x, y30)]),
					PackedColorArray([c0.lerp(c30, clampf((a.y - y0) / (y30 - y0), 0.0, 1.0)), c0.lerp(c30, clampf((b.y - y0) / (y30 - y0), 0.0, 1.0)), c30, c30]))
		_sea.draw_polygon(PackedVector2Array([Vector2(0.0, y30), Vector2(w, y30), Vector2(w, h), Vector2(0.0, h)]), PackedColorArray([c30, c30, c1, c1]))
		_sea.draw_polyline(top, _c(Color8(220, 250, 255, 128)), maxf(1.0, MenuKit.PX * 0.5), true)

	func _c(c: Color) -> Color:
		return CosArt.dim(c) if _locked else c


# ------------------------------------------------------------------ blasts and trails


## A particle of a vignette: where, how fast, how old, how big, its colours,
## and how it's drawn (0 a soft glow, 1 a smoke puff, 2 a spark, 3 a chip).
class _Q:
	var x := 0.0
	var y := 0.0
	var vx := 0.0
	var vy := 0.0
	var life := 0.0
	var span := 1.0
	var s0 := 4.0
	var s1 := 4.0
	var c0 := Color.WHITE
	var c1 := Color.WHITE
	var a := 1.0
	var add := false
	var drag := 0.0
	var grav := 0.0
	var shape := 0
	var rot := 0.0
	var spin := 0.0


## A gun firing its muzzle blast, or a ball flying across trailing its trail
## (the web's drawFx, its 200-wide stage scaled to the card).
class FxArt:
	extends Control
	const CONFETTI: Array[Color] = [Color8(255, 90, 170), Color8(255, 210, 60), Color8(70, 210, 255), Color8(140, 230, 80), Color8(255, 140, 40), Color8(180, 110, 255)]
	# each trail: its smoke trace (colour, alpha), its glowing streak (a
	# colour, "rainbow" or none) and the motes it sheds
	const TRAILS := {
		"powder": [Color8(240, 238, 234), 0.45, null],
		"spray": [Color8(240, 252, 255), 0.4, null],
		"soot": [Color8(70, 64, 60), 0.6, null],
		"ember": [Color8(190, 170, 155), 0.35, Color8(255, 140, 50)],
		"frost": [Color8(225, 245, 255), 0.42, Color8(140, 220, 255)],
		"comet": [Color8(255, 240, 215), 0.35, Color8(255, 200, 90)],
		"ghost": [Color8(190, 255, 225), 0.35, Color8(110, 255, 180)],
		"rainbow": [Color8(255, 255, 255), 0.3, "rainbow"],
		"starfall": [Color8(220, 220, 255), 0.3, Color8(210, 190, 255)],
		"wraith": [Color8(170, 255, 215), 0.35, Color8(90, 255, 170)],
	}
	var _qs: Array[_Q] = []
	var _bolts: Array = []
	var _hist := PackedVector2Array()
	var _kind := "blast"
	var _style := "powder"
	var _deep := Color.BLACK
	var _locked := false
	var _add: Control
	var _top: Control
	var _t := 0.0
	var _next := 0.3
	var _ball := -1.0
	var _recoil := 0.0

	func _init(sz: Vector2, it: Dictionary, locked: bool, index: int) -> void:
		CosArt._sprites()
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		clip_contents = true
		size = sz
		_kind = str(it.kind)
		_style = (Cosmetics.BLAST_STYLES if _kind == "blast" else Cosmetics.TRAIL_STYLES)[int(it.style)]
		_deep = (Cosmetics.RARITIES[int(it.rarity)] as Dictionary).deep
		_locked = locked
		# the guns along a row don't all go off at once
		_next = 0.3 + fmod(index * 0.37, 2.0)
		_add = Control.new()
		_add.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_add.size = sz
		var m := CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		_add.material = m
		_add.draw.connect(_draw_add)
		add_child(_add)
		_top = Control.new()
		_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_top.size = sz
		_top.draw.connect(_draw_top)
		add_child(_top)

	func _c(c: Color, a := 1.0) -> Color:
		var o := Color(c, c.a * a)
		return CosArt.dim(o) if _locked else o

	func _q(x: float, y: float, o: Dictionary) -> void:
		if _qs.size() > 260:
			_qs.pop_front()
		var q := _Q.new()
		q.x = x
		q.y = y
		q.rot = randf() * TAU
		for k: String in o:
			q.set(k, o[k])
		_qs.append(q)

	# ---------------------------------------------------------------- blasts (a gun at the left firing right)

	func _smoke(x: float, y: float, tint: Color, n := 6, alpha := 0.55) -> void:
		for i in n:
			var g := randf_range(0.85, 1.0)
			_q(x, y, {"vx": randf_range(20, 90), "vy": randf_range(-14, 4), "span": randf_range(1.6, 2.6), "s0": randf_range(4, 6), "s1": randf_range(16, 24),
				"c0": Color(tint.r * g, tint.g * g, tint.b * g), "c1": tint, "a": alpha, "drag": 1.8, "grav": -6.0, "shape": 1})

	func _flash(x: float, y: float, c: Color, s := 14.0) -> void:
		_q(x, y, {"span": 0.16, "s0": s, "s1": s * 1.6, "c0": c, "c1": Color(c.r * 0.5, c.g * 0.3, c.b * 0.2), "add": true})

	func _sparks(x: float, y: float, c: Color, n: int, spread := 40.0) -> void:
		for i in n:
			_q(x, y, {"vx": randf_range(80, 200), "vy": randf_range(-spread, spread), "span": randf_range(0.15, 0.35), "s0": randf_range(1.4, 2.2), "s1": 0.4,
				"c0": c, "c1": Color(c.r * 0.6, c.g * 0.3, c.b * 0.2), "add": true, "drag": 5.0, "shape": 2})

	func _blast(style: String, x: float, y: float) -> void:
		match style:
			"seasalt":
				_flash(x, y, Color8(255, 255, 255), 16.0)
				_sparks(x, y, Color8(235, 245, 255), 6)
				_smoke(x, y, Color8(252, 252, 255), 8, 0.7)
				for i in 8:
					_q(x, y, {"vx": randf_range(40, 120), "vy": randf_range(-50, -10), "span": randf_range(0.6, 1.0), "s0": 1.3, "s1": 0.8,
						"c0": Color8(230, 248, 255), "c1": Color8(200, 230, 245), "grav": 160.0, "shape": 2})
			"soot":
				_flash(x, y, Color8(255, 150, 60))
				_sparks(x, y, Color8(255, 140, 50), 7)
				_smoke(x, y, Color8(60, 55, 52), 8, 0.8)
			"ember":
				_flash(x, y, Color8(255, 170, 80))
				for i in 20:
					_q(x, y, {"vx": randf_range(40, 150), "vy": randf_range(-110, -20), "span": randf_range(0.9, 1.6), "s0": randf_range(1.4, 2.2), "s1": 0.5,
						"c0": Color8(255, 190, 90), "c1": Color8(255, 70, 20), "add": true, "grav": 140.0, "drag": 0.6, "shape": 2})
				_smoke(x, y, Color8(235, 215, 195), 4, 0.45)
			"ring":
				_flash(x, y, Color8(255, 214, 140), 11.0)
				for i in 22:
					var a := i / 22.0 * TAU
					_q(x + 6.0, y + sin(a) * 4.0, {"vx": 70.0 + cos(a) * 10.0, "vy": sin(a) * 30.0, "span": 2.2, "s0": 3.0, "s1": 6.0,
						"c0": Color8(250, 250, 252), "c1": Color8(235, 240, 245), "a": 0.75, "drag": 1.1, "shape": 1})
			"azure":
				_flash(x, y, Color8(140, 220, 255), 16.0)
				_sparks(x, y, Color8(120, 230, 255), 12, 60.0)
				for i in 6:
					_q(x, y, {"vx": randf_range(60, 150), "vy": randf_range(-12, 12), "span": randf_range(0.25, 0.4), "s0": 5.0, "s1": 11.0,
						"c0": Color8(90, 170, 255), "c1": Color8(30, 60, 200), "add": true, "drag": 4.0})
				_smoke(x, y, Color8(205, 228, 255), 5, 0.5)
			"confetti":
				_flash(x, y, Color8(255, 240, 200), 10.0)
				for i in 36:
					var s := randf_range(1.8, 2.6)
					_q(x, y, {"vx": randf_range(40, 170), "vy": randf_range(-120, 0), "span": randf_range(1.6, 2.6), "s0": s, "s1": s,
						"c0": CONFETTI[i % 6], "c1": CONFETTI[i % 6], "grav": 60.0, "drag": 2.0, "spin": randf_range(-10, 10), "shape": 3})
				_smoke(x, y, Color8(248, 246, 250), 3, 0.4)
			"dragon":
				_flash(x, y, Color8(255, 220, 120), 18.0)
				for i in 34:
					_q(x, y, {"vx": randf_range(120, 300), "vy": randf_range(-28, 28), "span": randf_range(0.3, 0.6), "s0": randf_range(4, 6), "s1": randf_range(12, 18),
						"c0": Color8(255, 245, 200) if i < 8 else Color8(255, 160, 50), "c1": Color8(200, 40, 10), "add": true, "drag": 3.0, "grav": -40.0})
				for i in 12:
					_q(x + randf_range(30, 90), y, {"vx": randf_range(20, 80), "vy": randf_range(-60, 0), "span": randf_range(1.0, 1.6), "s0": 1.8, "s1": 0.4,
						"c0": Color8(255, 180, 80), "c1": Color8(255, 60, 10), "add": true, "grav": 120.0, "shape": 2})
				_smoke(x + 30.0, y, Color8(70, 62, 58), 6, 0.6)
			"thunder":
				_flash(x, y, Color8(235, 230, 255), 20.0)
				for b in 3:
					var pts := PackedVector2Array([Vector2(x, y)])
					var p := Vector2(x, y)
					var ang := randf_range(-0.7, 0.7)
					for i in 7:
						p += Vector2(cos(ang) * randf_range(10, 20), sin(ang) * randf_range(8, 16) + randf_range(-9, 9))
						pts.append(p)
					_bolts.append([pts, 0.22])
				_sparks(x, y, Color8(200, 180, 255), 14, 90.0)
				for i in 16:
					var a := i / 16.0 * TAU
					_q(x + 10.0, y + 12.0, {"vx": cos(a) * 120.0, "vy": sin(a) * 18.0, "span": 0.35, "s0": 4.0, "s1": 7.0,
						"c0": Color8(170, 140, 255), "c1": Color8(60, 30, 160), "add": true, "drag": 3.0})
				_smoke(x, y, Color8(240, 238, 252), 5, 0.45)
			"wraith":
				# ghost-fire: a green flash and wisps that climb away
				_flash(x, y, Color8(150, 255, 210), 16.0)
				_sparks(x, y, Color8(120, 255, 190), 12, 50.0)
				for i in 10:
					_q(x, y, {"vx": randf_range(40, 110), "vy": randf_range(-30, -5), "span": randf_range(0.8, 1.2), "s0": 3.0, "s1": 9.0,
						"c0": Color8(110, 255, 180), "c1": Color8(20, 120, 80), "add": true, "drag": 1.5, "grav": -30.0})
				_smoke(x, y, Color8(190, 240, 220), 5, 0.45)
			_:
				_flash(x, y, Color8(255, 214, 140))
				_sparks(x, y, Color8(255, 190, 90), 6)
				_smoke(x, y, Color8(232, 228, 220))

	## What a trail sheds as the ball flies.
	func _emit(x: float, y: float, t: float) -> void:
		match _style:
			"spray":
				_q(x, y, {"vx": randf_range(-20, 20), "vy": randf_range(-20, 0), "span": 0.6, "s0": 1.0, "s1": 0.6, "c0": Color8(240, 252, 255), "c1": Color8(190, 230, 245), "grav": 120.0, "shape": 2})
			"ember":
				_q(x, y, {"vx": randf_range(-15, 15), "vy": randf_range(-10, 10), "span": randf_range(0.5, 0.9), "s0": 1.6, "s1": 0.4, "c0": Color8(255, 190, 90), "c1": Color8(255, 60, 10), "add": true, "grav": 80.0, "shape": 2})
			"frost":
				if randf() < 0.7:
					_q(x + randf_range(-4, 4), y + randf_range(-4, 4), {"vx": randf_range(-8, 8), "vy": randf_range(-4, 12), "span": randf_range(0.6, 1.0), "s0": 1.5, "s1": 0.3, "c0": Color8(210, 245, 255), "c1": Color8(90, 180, 255), "add": true, "shape": 2})
			"comet":
				if randf() < 0.6:
					_q(x + randf_range(-3, 3), y + randf_range(-3, 3), {"vx": randf_range(-10, 10), "vy": randf_range(-6, 10), "span": randf_range(0.6, 1.1), "s0": 1.6, "s1": 0.3, "c0": Color8(255, 230, 140), "c1": Color8(255, 140, 30), "add": true, "shape": 2})
			"ghost", "wraith":
				if randf() < 0.6:
					_q(x + sin(t * 9.0) * 3.0, y + cos(t * 11.0) * 3.0, {"vx": randf_range(-6, 6), "vy": randf_range(-14, -4), "span": randf_range(0.6, 1.0), "s0": 1.6, "s1": 0.3, "c0": Color8(140, 255, 200), "c1": Color8(20, 160, 90), "add": true, "shape": 2})
			"rainbow":
				if randf() < 0.7:
					var c := Color.from_hsv(fposmod(t * 0.7 + randf_range(-0.25, 0.25), 1.0), 1.0, 1.0)
					_q(x + randf_range(-4, 4), y + randf_range(-4, 4), {"vx": randf_range(-14, 14), "vy": randf_range(-8, 14), "span": randf_range(0.7, 1.2), "s0": 1.7, "s1": 0.3, "c0": c, "c1": c, "add": true, "shape": 2})
			"starfall":
				_q(x + randf_range(-5, 5), y + randf_range(-5, 5), {"vx": randf_range(-4, 4), "vy": randf_range(2, 10), "span": randf_range(1.2, 2.0), "s0": randf_range(1.6, 2.4), "s1": 0.4,
					"c0": Color8(255, 255, 255) if randf() < 0.5 else Color8(200, 160, 255), "c1": Color8(140, 110, 255), "add": true, "shape": 2})

	# ---------------------------------------------------------------- the loop

	func _process(dt: float) -> void:
		dt = minf(dt, 0.05)
		_t += dt
		var k := size.x / 200.0
		var h := size.y / k
		var gx := 40.0
		var gy := h * 0.56
		_next -= dt
		if _next <= 0.0:
			_next = 2.1 if _kind == "blast" else 2.4
			_recoil = 1.0
			if _kind == "blast":
				_blast(_style, gx, gy)
			else:
				_blast("powder", gx, gy)
				_ball = 0.0
				_hist.clear()
		_recoil = maxf(0.0, _recoil - dt * 4.0)
		for i in range(_qs.size() - 1, -1, -1):
			var q := _qs[i]
			q.life += dt
			if q.life >= q.span:
				_qs.remove_at(i)
				continue
			var f := exp(-q.drag * dt)
			q.vx *= f
			q.vy *= f
			q.vy += q.grav * dt
			q.x += q.vx * dt
			q.y += q.vy * dt
			q.rot += q.spin * dt
		for i in range(_bolts.size() - 1, -1, -1):
			_bolts[i][1] -= dt
			if _bolts[i][1] <= 0.0:
				_bolts.remove_at(i)
		if _kind == "trail" and _ball >= 0.0:
			_ball += dt
			var b := Vector2(gx + _ball * 150.0, gy - _ball * 70.0 + _ball * _ball * 55.0)
			if b.x > 215.0 or b.y > h:
				_ball = -1.0
			else:
				_hist.append(b)
				if _hist.size() > 40:
					_hist.remove_at(0)
				_emit(b.x, b.y, _t)
				if randf() < 0.5:
					_emit(b.x - 2.0, b.y + 1.0, _t + 0.05)
		if CosArt.on_screen(self):
			queue_redraw()
			_add.queue_redraw()
			_top.queue_redraw()

	# the backdrop, the sea strip, the smoke trace and the plain particles
	func _draw() -> void:
		var k := size.x / 200.0
		var w := size.x
		var h := size.y
		var r := w * 0.7
		draw_texture_rect(CosArt._glow, Rect2(Vector2(w, h) * 0.5 - Vector2(r, r), Vector2(r, r) * 2.0), false, _c(_deep, 0.333))
		var y0 := h * 0.8
		var top := _c(Color8(30, 120, 150, 140))
		var foot := _c(Color8(6, 34, 52, 230))
		draw_polygon(PackedVector2Array([Vector2(0.0, y0), Vector2(w, y0), Vector2(w, h), Vector2(0.0, h)]), PackedColorArray([top, top, foot, foot]))
		if _kind == "trail" and _ball >= 0.0 and _hist.size() > 1:
			var tr: Array = TRAILS.get(_style, TRAILS.powder)
			var n := _hist.size()
			for i in range(1, n):
				var f := float(i) / n
				draw_line(_hist[i - 1] * k, _hist[i] * k, _c(tr[0], float(tr[1]) * f), (6.0 - f * 3.5) * k, true)
		_particles(self, false, k)

	# the glowing streak, the additive particles, the thunder's bolts
	func _draw_add() -> void:
		var k := size.x / 200.0
		if _kind == "trail" and _ball >= 0.0 and _hist.size() > 1:
			var st: Variant = (TRAILS.get(_style, TRAILS.powder) as Array)[2]
			if st != null:
				var from := maxi(0, _hist.size() - 14)
				var n := _hist.size() - from
				for i in range(1, n):
					var f := float(i) / n
					var c: Color = Color.from_hsv(fposmod(_t * 1.2 - f * 0.8, 1.0), 1.0, 1.0) if st is String else st
					_add.draw_line(_hist[from + i - 1] * k, _hist[from + i] * k, _c(c, f * 0.9), (1.0 + f * 3.5) * k, true)
		_particles(_add, true, k)
		for b: Array in _bolts:
			var pts := PackedVector2Array()
			for p in b[0] as PackedVector2Array:
				pts.append(p * k)
			_add.draw_polyline(pts, _c(Color8(200, 190, 255), minf(1.0, float(b[1]) * 8.0)), 2.0 * k, true)
			_add.draw_polyline(pts, _c(Color.WHITE, minf(1.0, float(b[1]) * 10.0)), 0.8 * k, true)

	func _particles(on: Control, add: bool, k: float) -> void:
		for q in _qs:
			if q.add != add:
				continue
			var t := q.life / q.span
			var a := q.a * minf(1.0, q.life / 0.05) * (1.0 - t * t)
			var s := (q.s0 + (q.s1 - q.s0) * sqrt(t)) * k
			if a <= 0.01 or s <= 0.1:
				continue
			var c := _c(q.c0.lerp(q.c1, t), a)
			var at := Vector2(q.x, q.y) * k
			if q.shape == 3:
				# a chip of confetti tumbling: a little rectangle, foreshortened
				var ax := Vector2(cos(q.rot), sin(q.rot)) * s
				var ay := Vector2(-sin(q.rot), cos(q.rot)) * s * 0.6 * cos(q.rot * 1.7)
				on.draw_colored_polygon(PackedVector2Array([at - ax - ay, at + ax - ay, at + ax + ay, at - ax + ay]), c)
			else:
				var tex: Texture2D = CosArt._dot if q.shape == 2 else (CosArt._puff if q.shape == 1 else CosArt._glow)
				on.draw_texture_rect(tex, Rect2(at - Vector2(s, s), Vector2(s, s) * 2.0), false, c)

	# the ball and the gun, over it all
	func _draw_top() -> void:
		var k := size.x / 200.0
		var gy := size.y / k * 0.56
		if _kind == "trail" and _ball >= 0.0 and not _hist.is_empty():
			_top.draw_circle(_hist[_hist.size() - 1] * k, 2.6 * k, _c(Color("#1c1d20")), true, -1.0, true)
		var o := Vector2(40.0 - 22.0 - _recoil * 6.0, gy) * k
		var wood := _c(Color("#5a3a22"))
		_top.draw_rect(Rect2(o + Vector2(-4.0, 3.0) * k, Vector2(22.0, 8.0) * k), wood)
		for wx: float in [0.0, 14.0]:
			_top.draw_circle(o + Vector2(wx, 12.0) * k, 4.0 * k, _c(Color("#2e1d12")), true, -1.0, true)
		# the barrel, lit from above
		var hi := _c(Color("#6b6f78"))
		var mid := _c(Color("#2a2c31"))
		var lo := _c(Color("#141519"))
		var muz := hi.lerp(mid, 0.28)
		_top.draw_polygon(PackedVector2Array([o + Vector2(-6.0, -5.0) * k, o + Vector2(22.0, -3.6) * k, o + Vector2(22.0, 0.0) * k, o + Vector2(-6.0, 0.0) * k]),
				PackedColorArray([hi, muz, mid, mid]))
		_top.draw_polygon(PackedVector2Array([o + Vector2(-6.0, 0.0) * k, o + Vector2(22.0, 0.0) * k, o + Vector2(22.0, 3.6) * k, o + Vector2(-6.0, 5.0) * k]),
				PackedColorArray([mid, mid, mid.lerp(lo, 0.72), lo]))
		var gold := _c(Color("#d8a54a"))
		_top.draw_rect(Rect2(o + Vector2(20.0, -4.2) * k, Vector2(3.0, 8.4) * k), gold)
		_top.draw_rect(Rect2(o + Vector2(4.0, -4.8) * k, Vector2(2.0, 9.6) * k), gold)
