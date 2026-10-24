class_name UpdateCard
extends CanvasLayer
## "A new build has made port": the card the harbour brings up when GitHub
## has a newer build of the game than this one (Updater), and Settings'
## Game updates row opens by hand. On the left the build's seal: the crest's
## compass rose turning in a breathing gold halo, the new version in gilt
## and, under it, yours, with your ship riding the swell at the foot. On the
## right what the build brings, its release notes set as the web sets its
## type (scrolling under a finger, fading out at the foot), and along the
## bottom what to do: Update (with the download's size), the download
## itself (a gilt bar your ship sails along, with how much has come, how
## fast and how long it has left; Cancel), Install now once it's in and its
## seal checked, and Try again if it broke off. Closing it never stops a
## download: it carries on behind the harbour, whose Update pill shows how
## far it has got. With nothing newer it says so, over this build's own notes.

signal clicked
signal closed

const CHECKING_LINES := ["Asking GitHub for the newest build", "Reading the harbour master's list"]

var updater: Updater
## This build's own notes (RELEASE_NOTES.md, shipped in the APK), for when
## it is the newest.
var own_notes := ""
## Your ship's class, riding the swell under the seal.
var ship := "sloop"

var _root: Control
var _back: ShaderMaterial
var _holder: Control
var _card: UiBox
var _reveal := MenuKit.Reveal.new()
var _t := 0.0
var _buttons: Array[UiButton] = []
var _gold_btn: UiButton
## The state the card was laid out for (Updater's), and whether it shows the
## new build (or this one).
var _built := -1
var _new := false
var _rose: TextureRect
var _halo: _Halo
var _boat: TextureRect
var _boat_at := Vector2.ZERO
var _bar: _Bar
var _figures: UiText
var _figures_r: UiText
var _hint: UiText
## The notes: their clip (fading them out at its edges), the column that
## scrolls in it, and the scroll (units down), how far it goes, its fling.
var _body: _Fade
var _content: Control
var _scroll := 0.0
var _scroll_max := 0.0
var _fling := 0.0
var _down := false
var _from := Vector2.ZERO
var _last := Vector2.ZERO
var _last_ms := 0
var _dragging := false


func _ready() -> void:
	layer = 8
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_root)
	visible = false
	set_process(false)
	get_viewport().size_changed.connect(func() -> void:
		if visible:
			_build())
	var f := FileAccess.open("res://RELEASE_NOTES.md", FileAccess.READ)
	if f != null:
		own_notes = f.get_as_text()


func open() -> void:
	if updater == null:
		return
	if not updater.changed.is_connected(_on_changed):
		updater.changed.connect(_on_changed)
	_t = 0.0
	_scroll = 0.0
	_fling = 0.0
	visible = true
	_build()
	set_process(true)


func close() -> void:
	if not visible:
		return
	for b in _buttons:
		b.cancel()
	_down = false
	visible = false
	set_process(false)
	closed.emit()


func is_open() -> bool:
	return visible


## The back button: the card closes (a download carries on).
func go_back() -> bool:
	if not visible:
		return false
	clicked.emit()
	close()
	return true


func _on_changed() -> void:
	if not visible:
		return
	if _layout_of(updater.state) != _built:
		_build()
	else:
		_tick_download()


## States that share a layout share a build: a download moving on only
## moves its bar.
static func _layout_of(s: int) -> int:
	return Updater.DOWNLOADING if s == Updater.VERIFYING else s


func _build() -> void:
	for c in _root.get_children():
		_root.remove_child(c)
		c.queue_free()
	_buttons.clear()
	_reveal.clear()
	_gold_btn = null
	_bar = null
	_figures = null
	_figures_r = null
	_hint = null
	_boat = null
	var st := updater.state
	_built = _layout_of(st)
	_new = updater.available()
	var vp := get_viewport().get_visible_rect().size
	_root.size = vp
	var u := MenuKit.U
	var t := MenuKit.T
	var px := MenuKit.PX
	var mx := vp.x * 0.03
	var my := vp.y * 0.03
	# the harbour behind, dimmed and frosted
	var glass := ColorRect.new()
	glass.size = vp
	glass.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_back = ShaderMaterial.new()
	_back.shader = preload("res://shaders/menu_blur.gdshader")
	_back.set_shader_parameter("lod", PauseScreen._blur_lod(10.0 * u))
	_back.set_shader_parameter("saturate", 1.15)
	_back.set_shader_parameter("rad", Vector4(0.5, 0.4, 1.2, 0.9))
	_back.set_shader_parameter("rad_in", Color8(3, 14, 22, 107))
	_back.set_shader_parameter("rad_out", Color8(2, 10, 16, 199))
	_back.set_shader_parameter("fade", 1.0 if _t > 0.35 else 0.0)
	glass.material = _back
	_root.add_child(glass)
	var w := minf(800.0 * u, vp.x - mx * 2.0)
	var h := minf(480.0 * u, vp.y - my * 2.0)
	_holder = Control.new()
	_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_holder.size = Vector2(w, h)
	_holder.position = (vp - _holder.size) * 0.5
	_holder.pivot_offset = _holder.size * 0.5
	_root.add_child(_holder)
	_card = UiBox.new(Vector2(w, h), 24.0 * u, 110.0 * u)
	_card.p("c_top", Color8(16, 40, 54, 222)).p("c_foot", Color8(6, 20, 30, 242)).p("c_border", HudStyle.STROKE)
	_card.p("c_shadow", Color(0.0, 0.0, 0.0, 0.5)).p("shadow", Vector2(40.0, 110.0) * u)
	_holder.add_child(_card)
	var pad := 12.0 * u
	var seal_w := clampf(w * 0.3, 190.0 * u, 250.0 * u)
	var seal := _build_seal(Vector2(seal_w, h - pad * 2.0))
	seal.position = Vector2(pad, pad)
	_card.add_child(seal)
	# the right-hand column: the head, the notes, the foot
	var rx := pad + seal_w + 24.0 * u
	var rw := w - rx - 22.0 * u
	var close := MenuKit.round("close", 36.0 * u, 15.0 * u, false)
	close.position = Vector2(w - 14.0 * u - close.size.x, 14.0 * u)
	close.pressed.connect(func() -> void: go_back())
	_card.add_child(close)
	_buttons.append(close)
	var head := _build_head(rw - close.size.x - 10.0 * u)
	head.position = Vector2(rx, 22.0 * u)
	_card.add_child(head)
	var foot := _build_foot(rw)
	foot.position = Vector2(rx, h - 20.0 * u - foot.size.y)
	_card.add_child(foot)
	# the notes between them, clipped and fading at their edges
	var top := head.position.y + head.size.y + 12.0 * u
	var hair := MenuKit.rule(rw, Color(1.0, 1.0, 1.0, 0.07))
	hair.position = Vector2(rx, top)
	_card.add_child(hair)
	var bottom := foot.position.y - 12.0 * u
	_body = _Fade.new()
	_body.position = Vector2(rx - 4.0 * u, top + hair.size.y)
	_body.size = Vector2(rw + 8.0 * u, maxf(10.0, bottom - top - hair.size.y))
	_body.fade = Vector2(10.0, 30.0) * u
	_body.gui_input.connect(_on_body)
	_content = _build_notes(rw)
	_content.position.x = 4.0 * u
	_body.add_child(_content)
	_card.add_child(_body)
	_scroll_max = maxf(0.0, _content.size.y - _body.size.y)
	_scroll_to(_scroll)
	var foot_rule := MenuKit.rule(rw, Color(1.0, 1.0, 1.0, 0.07))
	foot_rule.position = Vector2(rx, bottom)
	_card.add_child(foot_rule)
	var rise := 12.0 * px
	_reveal.add(_holder, MenuKit.POP, 0.0, 0.45, rise)
	_reveal.add(seal, MenuKit.FADE, 0.08, 0.6)
	_reveal.add(head, MenuKit.RISE, 0.1, 0.55, rise)
	_reveal.add(_body, MenuKit.RISE, 0.16, 0.6, rise)
	_reveal.add(foot, MenuKit.RISE, 0.22, 0.6, rise)
	_tick_download()
	_step(0.0)


## The build's seal: the crest turning in its halo, the version in gilt,
## its build, yours under it, and your ship on the swell at the foot.
func _build_seal(sz: Vector2) -> Control:
	var u := MenuKit.U
	var t := MenuKit.T
	var panel := UiBox.new(sz, 18.0 * u, 2.0)
	MenuKit.flat(panel)
	panel.p("radial", Vector4(0.5, 0.36, 0.95, 0.85)).p("radial_stop", 1.0)
	panel.p("c_top", Color8(28, 92, 104, 150)).p("c_foot", Color8(4, 22, 32, 120))
	panel.p("c_border", Color(1.0, 0.86, 0.55, 0.12)).p("hi", 0.06).p("inset", 18.0 * u).p("c_inset", Color(0.0, 0.0, 0.0, 0.18))
	panel.clip_contents = true
	var v := updater.latest if _new else {}
	var version := str(v.get("name", updater.installed))
	# the crest in its halo
	var cd := minf(sz.x * 0.5, 104.0 * u)
	var em := 34.0 * t
	var block := cd + 14.0 * u + em + 4.0 * u + 9.5 * t * 1.2 + 14.0 * u + 12.0 * t * 1.2
	var cy := maxf(8.0 * u, (sz.y - 62.0 * u - block) * 0.5)
	_halo = _Halo.new(cd * 1.9)
	_halo.position = Vector2((sz.x - _halo.size.x) * 0.5, cy + (cd - _halo.size.y) * 0.5)
	panel.add_child(_halo)
	var view := Rect2(0.0, 0.0, 64.0, 64.0)
	var ring := TextureRect.new()
	ring.texture = Icons.svg("crest-ring", Art.crest_ring(), Vector2(cd, cd), view)
	_rose = TextureRect.new()
	_rose.texture = Icons.svg("crest-rose", Art.crest_rose(), Vector2(cd, cd), view)
	for r: TextureRect in [ring, _rose]:
		r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		r.size = Vector2(cd, cd)
		r.position = Vector2((sz.x - cd) * 0.5, cy)
		r.pivot_offset = r.size * 0.5
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		panel.add_child(r)
	# the version, gilt top to foot, and its build
	var big := MenuKit.words(Updater.short_of(version), "cinzel", 700, em, Color.WHITE, 0.04, 1.0)
	var y := cy + cd + 14.0 * u
	MenuKit.line_at(big, (sz.x - big.size.x) * 0.5, y, em)
	big.material = HudStyle.text_grad([Color("#fffaf0"), Color("#ffe3a0"), Color("#e2a84a"), Color("#b9802c"), Vector2(0.48, 0.78)], y - big.position.y, em)
	panel.add_child(big)
	y += em + 4.0 * u
	var build := MenuKit.words("BUILD %d" % Updater.code_of(version) if Updater.code_of(version) > 0 else "THIS BUILD", "inter", 700, 9.5 * t, HudStyle.AQUA, 0.24)
	build.position = Vector2((sz.x - build.size.x) * 0.5, y)
	panel.add_child(build)
	y += build.size.y + 14.0 * u
	# and yours: what it replaces, or that it's the newest
	var yours: UiText
	if _new:
		yours = UiText.new([["YOURS  ", HudStyle.font("inter", 700, roundi(0.2 * 9.5 * t)), roundi(9.5 * t), HudStyle.INK_3], [updater.installed, HudStyle.tnum(HudStyle.font("inter", 600)), roundi(12.0 * t), HudStyle.INK_2]], 0.0, 1.2)
	else:
		yours = UiText.new([["UP TO DATE", HudStyle.font("inter", 700, roundi(0.2 * 9.5 * t)), roundi(9.5 * t), HudStyle.AQUA_HI]], 0.0, 1.2)
	var ic := 0.0
	if not _new:
		ic = 13.0 * u
		var tick := Icons.rect("tick", ic, HudStyle.AQUA)
		tick.position = Vector2((sz.x - yours.size.x - ic - 5.0 * u) * 0.5, y + (yours.size.y - ic) * 0.5)
		panel.add_child(tick)
	yours.position = Vector2((sz.x - yours.size.x + (ic + 5.0 * u if ic > 0.0 else 0.0)) * 0.5, y)
	panel.add_child(yours)
	# your ship at the foot, riding a line of sea
	var sea_sz := Vector2(sz.x * 0.86, 7.0 * u)
	var sea := TextureRect.new()
	sea.texture = Icons.svg("tab-sea", '<path d="M0 3q5-3 10 0t10 0 10 0 10 0 10 0 10 0" fill="none" stroke="#7fe0d6" stroke-width="1.2" opacity=".55"/>', sea_sz, Rect2(0, 0, 60, 6))
	sea.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	sea.size = sea_sz
	sea.position = Vector2((sz.x - sea_sz.x) * 0.5, sz.y - 22.0 * u)
	sea.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bh := minf(44.0 * u, sz.y - (y + yours.size.y) - 40.0 * u)
	if bh > 16.0 * u:
		_boat = MenuKit.ship_art(ship, bh, true)
		_boat_at = Vector2((sz.x - _boat.size.x) * 0.5, sea.position.y + 3.5 * u - bh)
		_boat.position = _boat_at
		_boat.pivot_offset = Vector2(_boat.size.x * 0.5, bh)
		panel.add_child(_boat)
	panel.add_child(sea)
	return panel


## The head: what this is, the build's title, its figures and what else
## came since yours.
func _build_head(w: float) -> Control:
	var u := MenuKit.U
	var t := MenuKit.T
	var box := Control.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var st := updater.state
	var kicker := ""
	var kick_c := HudStyle.GOLD
	var title := ""
	var meta := ""
	var own := Updater.notes_of(own_notes)
	if _new:
		kicker = "A NEW BUILD HAS MADE PORT"
		title = str(updater.latest.title)
		if title == "":
			title = "Shores O’ Fortune " + Updater.short_of(str(updater.latest.name))
		var bits: Array[String] = ["Version " + str(updater.latest.name)]
		if int(updater.latest.size) > 0:
			bits.append(_mb(int(updater.latest.size)))
		var when := _when(str(updater.latest.published))
		if when != "":
			bits.append(when)
		meta = " · ".join(bits)
	else:
		title = own[0] if own[0] != "" else "Shores O’ Fortune"
		meta = "Version " + updater.installed
		match st:
			Updater.CHECKING:
				kicker = "ASKING FOR THE NEWEST BUILD"
				kick_c = HudStyle.AQUA
			Updater.CURRENT:
				kicker = "YOU’RE SAILING THE NEWEST BUILD"
				kick_c = HudStyle.AQUA
				meta += " · checked just now"
			_:
				kicker = "COULDN’T REACH THE HARBOUR MASTER"
				kick_c = HudStyle.CORAL
	var k := MenuKit.words(kicker, "inter", 700, 10.5 * t, kick_c, 0.22)
	box.add_child(k)
	var y := k.size.y + 6.0 * u
	var tt := UiText.new([[title, HudStyle.font("inter", 800, roundi(-0.02 * 25.0 * t)), roundi(25.0 * t), HudStyle.INK]], w, 1.08)
	tt.halo = Color(0.0, 0.0, 0.0, 0.1)
	tt.position = Vector2(0.0, y)
	box.add_child(tt)
	y += tt.size.y + 6.0 * u
	var m := UiText.new([[meta, HudStyle.tnum(HudStyle.font("inter", 600)), roundi(12.0 * t), HudStyle.INK_3]], w, 1.3)
	m.position = Vector2(0.0, y)
	box.add_child(m)
	y += m.size.y
	if _new and not updater.between.is_empty():
		var also := UiText.new([["Also aboard since yours: ", HudStyle.font("inter", 700), roundi(12.0 * t), HudStyle.GOLD_HI], [", ".join(updater.between), HudStyle.font("inter", 500), roundi(12.0 * t), HudStyle.INK_2]], w, 1.35)
		also.position = Vector2(0.0, y + 4.0 * u)
		box.add_child(also)
		y += 4.0 * u + also.size.y
	box.size = Vector2(w, y)
	return box


## The notes as blocks: paragraphs, and bullets hung off gold diamonds.
func _build_notes(w: float) -> Control:
	var u := MenuKit.U
	var t := MenuKit.T
	var col := Control.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var md := str(updater.latest.notes) if _new else Updater.notes_of(own_notes)[1]
	var sz := roundi(13.5 * t)
	var plain := HudStyle.font("inter", 500)
	var bold := HudStyle.font("inter", 700)
	var y := 10.0 * u
	var indent := 18.0 * u
	for b: Dictionary in Updater.blocks(md):
		var kind := str(b.kind)
		var runs := []
		for r: Array in b.runs:
			if kind == "h":
				runs.append([str(r[0]).to_upper(), HudStyle.font("inter", 700, roundi(0.18 * 10.5 * t)), roundi(10.5 * t), HudStyle.AQUA])
			else:
				runs.append([str(r[0]), bold if bool(r[1]) else plain, sz, HudStyle.INK if bool(r[1]) else HudStyle.INK_2])
		if runs.is_empty():
			continue
		var x := indent if kind == "li" else 0.0
		var text := UiText.new(runs, w - x, 1.5)
		text.position = Vector2(x, y)
		col.add_child(text)
		if kind == "li":
			var dot := _Diamond.new(6.0 * u)
			dot.position = Vector2(4.0 * u, y + text.baseline() - sz * 0.36 - dot.size.y * 0.5)
			col.add_child(dot)
		y += text.size.y + (7.0 * u if kind == "li" else 10.0 * u)
	if y <= 10.0 * u:
		var none := UiText.new([["No notes came with this build.", plain, sz, HudStyle.INK_3]], w, 1.5)
		none.position = Vector2(0.0, y)
		col.add_child(none)
		y += none.size.y
	col.size = Vector2(w, y + 14.0 * u)
	return col


## The foot: a line on the left (or the download's bar and figures) and the
## buttons on the right.
func _build_foot(w: float) -> Control:
	var u := MenuKit.U
	var t := MenuKit.T
	var px := MenuKit.PX
	var box := Control.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bh := 46.0 * u
	var st := updater.state
	var ghost := Color(0.031, 0.102, 0.149, 0.66)
	var btns: Array[UiButton] = []
	var later := func(label: String) -> UiButton:
		var b := MenuKit.pill("", label, bh, 18.0 * u, 14.0 * t, 700, ghost, HudStyle.INK, 0.02)
		b.pressed.connect(func() -> void: go_back())
		return b
	var line := ""
	var line_c := HudStyle.INK_3
	if _new and updater.key_changed() and st != Updater.DOWNLOADING and st != Updater.VERIFYING:
		# Android won't put a build signed with another key over this one
		btns.append(later.call("Later"))
		_gold_btn = MenuKit.gold("flag", "RELEASE PAGE", bh, 22.0 * u, 14.5 * t, 19.0 * u)
		_gold_btn.pressed.connect(func() -> void:
			clicked.emit()
			OS.shell_open(str(updater.latest.page)))
		line = "It's signed with a new key, so Android won't put it over yours: uninstall this one first (its saves go with it), then install it from its release page."
		line_c = HudStyle.GOLD_HI
	else:
		match st:
			Updater.OFFER:
				btns.append(later.call("Later"))
				var size := int(updater.latest.size)
				_gold_btn = MenuKit.gold("download", "UPDATE" + ("  ·  " + _mb(size) if size > 0 else ""), bh, 22.0 * u, 14.5 * t, 19.0 * u)
				_gold_btn.pressed.connect(func() -> void:
					clicked.emit()
					updater.download())
				line = "Everything you've won stays aboard."
			Updater.DOWNLOADING, Updater.VERIFYING:
				var cancel := MenuKit.pill("", "Cancel", bh, 18.0 * u, 14.0 * t, 700, ghost, HudStyle.INK, 0.02)
				cancel.pressed.connect(func() -> void:
					clicked.emit()
					updater.cancel())
				btns.append(cancel)
			Updater.READY, Updater.INSTALLING:
				btns.append(later.call("Later"))
				_gold_btn = MenuKit.gold("anchor", "INSTALL NOW" if st == Updater.READY else "INSTALL", bh, 22.0 * u, 14.5 * t, 19.0 * u)
				_gold_btn.pressed.connect(func() -> void:
					clicked.emit()
					updater.install())
				if st == Updater.READY:
					line = "Downloaded and checked. Android asks you to confirm the install."
				elif updater.error != "":
					line = updater.error
					line_c = HudStyle.GOLD_HI
				else:
					line = "The first time, Android asks to allow installs from Shores O’ Fortune: allow it, come back and tap Install."
					line_c = HudStyle.INK_2
			Updater.FAILED:
				btns.append(later.call("Later"))
				_gold_btn = MenuKit.gold("refresh", "TRY AGAIN", bh, 22.0 * u, 14.5 * t, 19.0 * u)
				_gold_btn.pressed.connect(func() -> void:
					clicked.emit()
					updater.download())
				line = updater.error
				line_c = HudStyle.CORAL
			Updater.CURRENT:
				_gold_btn = MenuKit.gold("anchor", "FAIR WINDS", bh, 24.0 * u, 14.5 * t, 19.0 * u)
				_gold_btn.pressed.connect(func() -> void: go_back())
				line = "New builds are offered here the moment they're out."
			Updater.CHECKING:
				btns.append(later.call("Close"))
				line = CHECKING_LINES[0]
				line_c = HudStyle.INK_2
			_:
				btns.append(later.call("Close"))
				_gold_btn = MenuKit.gold("refresh", "TRY AGAIN", bh, 22.0 * u, 14.5 * t, 19.0 * u)
				_gold_btn.pressed.connect(func() -> void:
					clicked.emit()
					updater.check())
				line = "Check you're online, then try again."
	if _gold_btn != null:
		btns.append(_gold_btn)
	# a download's figures sit over its bar, with room for her on it
	var loading := st == Updater.DOWNLOADING or st == Updater.VERIFYING
	var fh := 62.0 * u if loading else bh
	var x := w
	for i in range(btns.size() - 1, -1, -1):
		var b := btns[i]
		x -= b.size.x
		b.position = Vector2(x, fh - bh)
		box.add_child(b)
		_buttons.append(b)
		x -= 8.0 * u
	var room := x - 14.0 * u
	if loading:
		# the bar your ship sails along, its figures over it
		_figures = UiText.new([["", HudStyle.font("inter", 700), roundi(12.0 * t), HudStyle.INK], ["", HudStyle.tnum(HudStyle.font("inter", 600)), roundi(12.0 * t), HudStyle.INK_3]], 0.0, 1.2)
		_figures_r = UiText.new([["", HudStyle.tnum(HudStyle.font("inter", 600)), roundi(12.0 * t), HudStyle.INK_2]], 0.0, 1.2)
		_figures_r.align = HORIZONTAL_ALIGNMENT_RIGHT
		_figures_r.fixed = room
		_bar = _Bar.new(Vector2(room, 9.0 * u), ship)
		_figures.position = Vector2(0.0, 0.0)
		_figures_r.position = Vector2(0.0, 0.0)
		_bar.position = Vector2(0.0, fh - _bar.size.y - 4.0 * u)
		for n: Control in [_figures, _figures_r, _bar]:
			box.add_child(n)
	elif line != "":
		_hint = UiText.new([[line, HudStyle.font("inter", 500), roundi(12.5 * t), line_c]], room, 1.35)
		# (a long line makes the foot taller, the buttons centred on it)
		if _hint.size.y > fh:
			fh = _hint.size.y
			for b in btns:
				b.position.y = (fh - bh) * 0.5
		_hint.position = Vector2(0.0, (fh - _hint.size.y) * 0.5)
		box.add_child(_hint)
	box.size = Vector2(w, fh)
	return box


## The download's bar and figures, as it moves on.
func _tick_download() -> void:
	if _bar == null:
		return
	_bar.set_progress(updater.progress(), updater.state == Updater.VERIFYING)
	if updater.state == Updater.VERIFYING:
		_figures.set_runs([["Checking the seal", _figures.runs[0][1], _figures.runs[0][2], HudStyle.INK], ["", _figures.runs[1][1], _figures.runs[1][2], HudStyle.INK_3]])
		_figures_r.set_text(_mb(updater.total))
		return
	var r0: Array = _figures.runs[0]
	var r1: Array = _figures.runs[1]
	var of := (" of " + _mb(updater.total)) if updater.total > 0 else ""
	_figures.set_runs([["Downloading  ", r0[1], r0[2], HudStyle.INK], [_mb(updater.got, false) + of, r1[1], r1[2], HudStyle.INK_3]])
	var right := "%d%%" % roundi(updater.progress() * 100.0) if updater.total > 0 else ""
	var eta := updater.eta()
	if eta >= 0.0 and updater.got > 0:
		right += ("  ·  " if right != "" else "") + _left(eta)
	_figures_r.set_text(right)


func _process(dt: float) -> void:
	_t += dt
	if not _down and absf(_fling) > 1.0:
		_scroll_to(_scroll + _fling * dt)
		_fling *= exp(-4.0 * dt)
	_step(dt)


func _step(_dt: float) -> void:
	_back.set_shader_parameter("fade", clampf(_t / 0.35, 0.0, 1.0))
	_reveal.step(_t)
	if _gold_btn != null:
		MenuKit.glint(_gold_btn, _t)
	# the rose turns a full round a minute, the halo breathes
	if _rose != null:
		_rose.rotation = _t * TAU / 60.0
	if _halo != null:
		_halo.breathe(0.5 - 0.5 * cos(_t * TAU / 3.6))
	if _boat != null:
		var b := (1.0 - cos(_t / 3.2 * TAU)) * 0.5
		_boat.position = _boat_at + Vector2(0.0, -2.0 * MenuKit.PX * b)
		_boat.rotation = deg_to_rad(-1.6) * b + deg_to_rad(0.8)
	if _bar != null:
		_bar.tick(_t)
	if _hint != null and updater.state == Updater.CHECKING:
		var dots := int(_t * 2.5) % 4
		_hint.set_text(CHECKING_LINES[int(_t / 4.0) % CHECKING_LINES.size()] + ".".repeat(dots))


## Keys go no further while it's up (Enter takes the gold button).
func _unhandled_input(event: InputEvent) -> void:
	if not visible or not (event is InputEventKey):
		return
	get_viewport().set_input_as_handled()
	if event.pressed and not event.echo and event.keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE] and _gold_btn != null:
		_gold_btn.pressed.emit()


func _scroll_to(s: float) -> void:
	_scroll = clampf(s, 0.0, _scroll_max)
	if _scroll <= 0.0 or _scroll >= _scroll_max:
		_fling = 0.0
	if _content != null:
		_content.position.y = -_scroll
	if _body != null:
		# the top fades only once something has scrolled under it, the foot
		# only while there's more below
		_body.ends = Vector2(clampf(_scroll / (10.0 * MenuKit.U), 0.0, 1.0), clampf((_scroll_max - _scroll) / (20.0 * MenuKit.U), 0.0, 1.0))


## The notes under a finger or the mouse: a drag scrolls them, a flick flings.
func _on_body(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION:
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_scroll_to(_scroll - 40.0 * MenuKit.U)
			return
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_scroll_to(_scroll + 40.0 * MenuKit.U)
			return
		if event.button_index != MOUSE_BUTTON_LEFT:
			return
	var touch := event is InputEventScreenTouch
	var click: bool = event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION
	if touch or click:
		_down = event.pressed
		_dragging = false
		if _down:
			_from = event.position
			_last = event.position
			_last_ms = Time.get_ticks_msec()
			_fling = 0.0
		return
	var moved := event is InputEventScreenDrag or (event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION)
	if not moved or not _down:
		return
	if not _dragging and absf(event.position.y - _from.y) > UiButton.SLOP:
		_dragging = true
	if _dragging:
		var dy: float = event.position.y - _last.y
		var now := Time.get_ticks_msec()
		var dts := maxf(0.001, (now - _last_ms) / 1000.0)
		_fling = lerpf(_fling, -dy / dts, 0.5)
		_last_ms = now
		_scroll_to(_scroll - dy)
	_last = event.position


## Bytes as the phone's own downloads put them: "118 MB", "73.4 MB".
static func _mb(bytes: int, unit := true) -> String:
	var mb := bytes / 1048576.0
	var s := ("%.1f" % mb) if mb < 100.0 else ("%d" % roundi(mb))
	return s + (" MB" if unit else "")


## Seconds left, said plainly.
static func _left(s: float) -> String:
	if s < 5.0:
		return "almost there"
	if s < 60.0:
		return "about %d s left" % (ceili(s / 5.0) * 5)
	return "about %d min left" % ceili(s / 60.0)


## When a release came out, relative to now ("today", "yesterday", "3 days ago").
static func _when(iso: String) -> String:
	if iso.length() < 19:
		return ""
	var at := Time.get_unix_time_from_datetime_string(iso.left(19))
	var days := floori((Time.get_unix_time_from_system() - at) / 86400.0)
	if days <= 0:
		return "out today"
	if days == 1:
		return "out yesterday"
	return "out %d days ago" % days


## The notes' clip: it masks them by its own alpha (clip_children), solid
## through the middle and fading to nothing over `fade` units at the top
## and the foot, each as far as `ends` says.
class _Fade:
	extends Control
	var fade := Vector2(10.0, 30.0)
	var ends := Vector2.ONE:
		set(v):
			if v != ends:
				ends = v
				queue_redraw()

	func _init() -> void:
		clip_children = CanvasItem.CLIP_CHILDREN_ONLY
		mouse_filter = Control.MOUSE_FILTER_STOP

	func _draw() -> void:
		var w := size.x
		var h := size.y
		var a := fade.x * ends.x
		var b := h - fade.y * ends.y
		var solid := Color.WHITE
		var clear := Color(1.0, 1.0, 1.0, 0.0)
		var top := clear if ends.x > 0.0 else solid
		var foot := clear if ends.y > 0.0 else solid
		draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(w, 0), Vector2(w, a), Vector2(0, a)]), PackedColorArray([top, top, solid, solid]))
		draw_rect(Rect2(0.0, a, w, maxf(0.0, b - a)), solid)
		draw_polygon(PackedVector2Array([Vector2(0, b), Vector2(w, b), Vector2(w, h), Vector2(0, h)]), PackedColorArray([solid, solid, foot, foot]))


## A bullet: a small gold diamond with a lighter top.
class _Diamond:
	extends Control

	func _init(d: float) -> void:
		size = Vector2(d, d)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size * 0.5
		var r := size.x * 0.5
		var pts := PackedVector2Array([c + Vector2(0, -r), c + Vector2(r, 0), c + Vector2(0, r), c + Vector2(-r, 0)])
		draw_polygon(pts, PackedColorArray([HudStyle.GOLD_HI, HudStyle.GOLD, HudStyle.GOLD_LO, HudStyle.GOLD]))


## The crest's halo: soft gold rings that breathe.
class _Halo:
	extends Control
	var _k := 0.0

	func _init(d: float) -> void:
		size = Vector2(d, d)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func breathe(k: float) -> void:
		_k = k
		queue_redraw()

	func _draw() -> void:
		var c := size * 0.5
		var r := size.x * 0.5
		var gold := Color("#ffcf6e")
		for i in 10:
			var f := float(i + 1) / 10.0
			draw_circle(c, r * lerpf(0.3, 1.0, f), Color(gold, 0.035 * (1.0 - f) * (0.7 + 0.5 * _k)))
		draw_circle(c, r * 0.3, Color(Color("#0b3546"), 0.35))


## The download's bar: a dark track, the gilt filling it with a glint that
## keeps running, a bright bead at its end and your ship sailing on it.
class _Bar:
	extends Control
	var _track: UiBox
	var _fill: UiBox
	var _bead: Control
	var _boat: TextureRect
	var _p := 0.0
	var _shown := 0.0
	var _sealing := false

	func _init(sz: Vector2, ship_id: String) -> void:
		size = sz
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var u := MenuKit.U
		_track = UiBox.new(sz, sz.y * 0.5, 2.0)
		MenuKit.flat(_track)
		_track.p("c_top", Color(0.0, 0.0, 0.0, 0.36)).p("c_foot", Color(0.0, 0.0, 0.0, 0.28)).p("c_border", Color(1.0, 1.0, 1.0, 0.07)).p("hi", 0.0)
		add_child(_track)
		_fill = UiBox.new(sz, sz.y * 0.5, 16.0 * u)
		HudStyle.gold(_fill, u * 0.5)
		_fill.p("c_glow", Color(1.0, 0.8, 0.4, 0.4)).p("glow", 8.0 * u)
		_fill.p("sheen_w", 0.22).p("sheen_span", Vector2(-1.0, 5.6)).p("sheen_a", 0.55)
		add_child(_fill)
		_boat = MenuKit.ship_art(ship_id, 27.0 * u, true)
		_boat.pivot_offset = Vector2(_boat.size.x * 0.5, _boat.size.y)
		add_child(_boat)

	func set_progress(p: float, sealing: bool) -> void:
		_p = clampf(p, 0.0, 1.0)
		_sealing = sealing

	func tick(t: float) -> void:
		var dt := get_process_delta_time()
		_shown = lerpf(_shown, _p, MathX.damp(6.0, dt))
		var h := size.y
		var w := maxf(h, size.x * _shown)
		_fill.resize(Vector2(w, h))
		_fill.p("sheen", fmod(t * (0.9 if not _sealing else 1.6), 1.6) / 1.6)
		# she rides at the gilt's head, bowing to the swell
		var b := (1.0 - cos(t / 1.6 * TAU)) * 0.5
		var x := clampf(w - _boat.size.x * 0.62, 0.0, size.x - _boat.size.x)
		_boat.position = Vector2(x, -_boat.size.y + h * 0.35 - 1.5 * MenuKit.PX * b)
		_boat.rotation = deg_to_rad(-2.0) * b + deg_to_rad(1.0)
