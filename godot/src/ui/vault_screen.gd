class_name VaultScreen
extends CanvasLayer
## The Treasure Vault (the web's vault.ts), laid out as the web lays it out on
## a phone held sideways. The chest itself is a real chest out on the sea
## beside her (VaultStage); this is everything drawn over it: the purse, the
## dock of buttons beside the chest (open one, free once a day, or ten with
## an epic inside), the chest's own "Tap to open", the opening (the chest
## charging through the rarities inside, then bursting), the cards that fly
## out of its mouth and turn over, the showcase where she tries on what you
## found, the collection and the odds. A tap during the opening skips to the
## cards; back steps back a view at a time, then closes it.

## Asks of the stage: "charge", "burst", "pulse" (a rarity) or "settle".
signal stage(op: String, tier: int)
## The camera's shot: home, charge, burst or cards.
signal focus(shot: String)
## Dress her in an item to show it off ("" back as she was).
signal preview(id: String)
## An open was paid for (1 or 10): a ten brings a bonus ship part.
signal pulled(n: int)
## She wears an item from now on.
signal equipped(id: String)
## A sound: click, rumble, burst, flip or coin (and a rarity).
signal sfx(what: String, tier: int)
signal closed

enum View { HOME, OPENING, REVEAL, SHOW, COLL }

## The vault (Progress), set by the game: UI scripts check.gd loads can't name autoloads.
var progress = null
## The chest's mouth and outline on screen (the game sets them each frame).
var chest_at := Vector2(-1.0, -1.0)
var chest_rect := Rect2()

var _root: Control
var _vp := Vector2.ZERO
var _view := View.HOME
var _shade: ShaderMaterial
var _deep := 0.0
var _head: Control
var _purse_amt: UiText
var _purse: UiBox
var _back: UiButton
var _dock: Control
var _dock_x := 0.0
var _pity: Control
var _buy_one: UiButton
var _buy_ten: UiButton
var _links: Array[UiButton] = []
var _hot: Control
var _hot_pill: Control
var _hot_seen := false
var _skip_tag: Control
var _flash: _Flash
var _fx: _Sparkles
var _reveal: Control
var _cards: Control
var _foot: Control
var _show: Control
var _coll: Control
var _odds: Control
var _results: Array[Dictionary] = []
var _card_list: Array[VaultCard] = []
var _show_list: Array[Dictionary] = []
var _show_idx := 0
var _show_from := View.REVEAL
var _show_panel: Control
var _coll_kind := "skin"
var _last_n := 1
var _t := 0.0
var _view_t := 0.0
## The opening under way: {res, top, tier, next, stage} (empty when none).
var _op := {}
var _skip := false
## Timed steps: [at (s on _t), callable].
var _later: Array = []
## The collection's scroll, its reach, and a finger on it.
var _scroll := 0.0
var _scroll_max := 0.0
var _grid: Control
var _drag := false
var _drag_y := 0.0
var _fling := 0.0


func _ready() -> void:
	layer = 8
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_PASS
	_root.gui_input.connect(_on_root)
	add_child(_root)
	visible = false
	set_process(false)
	get_viewport().size_changed.connect(func() -> void:
		if visible:
			_build())


func open() -> void:
	visible = true
	_t = 0.0
	_hot_seen = false
	_op = {}
	_later.clear()
	_build()
	_home()
	set_process(true)


func close() -> void:
	visible = false
	set_process(false)
	_op = {}
	_later.clear()
	for c in _root.get_children():
		_root.remove_child(c)
		c.queue_free()
	_card_list.clear()


func is_open() -> bool:
	return visible


func is_busy() -> bool:
	return not _op.is_empty()


## The back button: skip the opening, close the odds, step back a view, or close.
func go_back() -> bool:
	if not visible:
		return false
	if is_busy():
		_fast_forward()
		return true
	sfx.emit("click", 0)
	if _odds != null and _odds.visible:
		_odds.visible = false
	elif _view == View.SHOW:
		_leave_show()
	elif _view == View.COLL or _view == View.REVEAL:
		_home()
	else:
		closed.emit()
	return true


func view_name() -> String:
	return ["home", "opening", "reveal", "show", "coll"][_view]


## The part of the screen the scene should be framed into, clear of
## whichever panel is up (units).
func free_rect() -> Rect2:
	var r := Rect2(Vector2.ZERO, _vp)
	var panel: Control = _dock if _view == View.HOME else (_show_panel if _view == View.SHOW else null)
	if panel == null or not is_instance_valid(panel):
		return r
	var b := Rect2(panel.position, panel.size)
	if b.position.x > _vp.x * 0.45:
		r.size.x = b.position.x
	elif b.end.x < _vp.x * 0.55:
		r.position.x = b.end.x
		r.size.x = _vp.x - b.end.x
	return r



# ------------------------------------------------------------------ driven (shots, the smoke test)


## Opens the chest n times as its buttons would; false if the purse is short.
func buy(n: int) -> bool:
	if not visible or is_busy():
		return false
	var before := _view
	_buy(n)
	return _view != before


## Every card still face down turned over at once.
func reveal_all() -> void:
	_skip = true
	for c in _card_list:
		if not c.is_open and not c.flying():
			_turn(c)


func cards_out() -> bool:
	if _view != View.REVEAL or _card_list.is_empty():
		return false
	for c in _card_list:
		if c.flying():
			return false
	return true


func all_open() -> bool:
	for c in _card_list:
		if not c.is_open:
			return false
	return not _card_list.is_empty()


## The showcase of the i-th card out (or of the collection's).
func show_card(i: int) -> void:
	if _card_list.is_empty():
		return
	var list: Array[Dictionary] = []
	for c in _card_list:
		list.append(c.item)
	_open_show(list, clampi(i, 0, list.size() - 1), _view if _view == View.COLL else View.REVEAL)


func show_collection(kind := "skin") -> void:
	if visible and not is_busy():
		_coll_kind = kind
		_show_collection()


func show_odds() -> void:
	if visible and not is_busy():
		_show_odds()


## Equip in the showcase, as its button would.
func equip_shown() -> bool:
	if _view != View.SHOW or _show_list.is_empty() or progress == null:
		return false
	var it: Dictionary = _show_list[_show_idx]
	if not progress.owns_item(it.id) or not progress.wear(it.id):
		return false
	equipped.emit(it.id)
	_render_show()
	return true

# ------------------------------------------------------------------ build


func _build() -> void:
	for c in _root.get_children():
		_root.remove_child(c)
		c.queue_free()
	_card_list.clear()
	_links.clear()
	_show_panel = null
	_vp = get_viewport().get_visible_rect().size
	_root.size = _vp
	var px := MenuKit.PX
	var mx := _vp.x * 0.03
	var my := _vp.y * 0.03
	# legibility over a bright sea, deepening behind the cards
	var shade := ColorRect.new()
	shade.size = _vp
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shade = ShaderMaterial.new()
	_shade.shader = preload("res://shaders/menu_shade.gdshader")
	_shade.set_shader_parameter("top_rgb", Vector3(1.0, 10.0, 16.0) / 255.0)
	_shade.set_shader_parameter("top_a", 0.6)
	_shade.set_shader_parameter("top_s", 170.0 * px / _vp.y)
	_shade.set_shader_parameter("foot_rgb", Vector3(1.0, 10.0, 16.0) / 255.0)
	_shade.set_shader_parameter("foot_a", 0.32)
	_shade.set_shader_parameter("foot_s", 0.28)
	_shade.set_shader_parameter("rad", Vector4(0.5, 0.52, 0.85, 0.75))
	_shade.set_shader_parameter("fade", 1.0)
	shade.material = _shade
	_root.add_child(shade)
	# the chest out on the water is the big button
	_hot = Control.new()
	_hot.mouse_filter = Control.MOUSE_FILTER_STOP
	_hot.gui_input.connect(_on_hot)
	_hot.visible = false
	_root.add_child(_hot)
	_hot_pill = Control.new()
	_hot_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hot_pill.visible = false
	_root.add_child(_hot_pill)
	_fx = _Sparkles.new(_vp)
	_flash = _Flash.new(_vp)
	_head = _build_head(mx, my)
	_root.add_child(_head)
	_dock = _build_dock(mx, my)
	_root.add_child(_dock)
	_reveal = Control.new()
	_reveal.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_reveal.size = _vp
	_root.add_child(_reveal)
	_cards = Control.new()
	_cards.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_reveal.add_child(_cards)
	_foot = Control.new()
	_foot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_reveal.add_child(_foot)
	_show = Control.new()
	_show.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_show.size = _vp
	_root.add_child(_show)
	_coll = Control.new()
	_coll.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_coll.size = _vp
	_root.add_child(_coll)
	var skip := MenuKit.words("TAP TO SKIP", "inter", 700, 11.0 * px, HudStyle.INK_3, 0.18, 1.2)
	_skip_tag = UiBox.new(skip.size + Vector2(32.0, 14.0) * px, 99.0 * px, 0.0)
	(_skip_tag as UiBox).p("c_top", Color(0, 0, 0, 0.32)).p("c_foot", Color(0, 0, 0, 0.32)).p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0, 0, 0, 0))
	skip.position = Vector2(16.0, 7.0) * px
	_skip_tag.add_child(skip)
	_skip_tag.position = Vector2((_vp.x - _skip_tag.size.x) * 0.5, _vp.y - my - 10.0 * px - _skip_tag.size.y)
	_skip_tag.visible = false
	_root.add_child(_skip_tag)
	_root.add_child(_fx)
	_root.add_child(_flash)
	_odds = Control.new()
	_odds.visible = false
	_root.add_child(_odds)
	_sync()
	_set_view(_view)


## The back button, "PEARLS OF THE DEEP" over "Treasure Vault", and the purse.
func _build_head(mx: float, my: float) -> Control:
	var px := MenuKit.PX
	var head := Control.new()
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.position = Vector2(mx, my)
	head.size = Vector2(_vp.x - mx * 2.0, 40.0 * px)
	_back = MenuKit.round("sw_back", 40.0 * px, 20.0 * px)
	_back.pressed.connect(func() -> void: go_back())
	head.add_child(_back)
	var kick := MenuKit.words("PEARLS OF THE DEEP", "inter", 700, 9.5 * px, HudStyle.GOLD, 0.22, 1.2)
	var title := MenuKit.words("Treasure Vault", "inter", 800, 22.0 * px, HudStyle.INK, -0.025, 1.0)
	title.halo = Color(0, 0, 0, 0.18)
	var tx := _back.size.x + 14.0 * px
	var th := kick.size.y + 2.0 * px + 22.0 * px
	kick.position = Vector2(tx, (head.size.y - th) * 0.5)
	MenuKit.line_at(title, tx, kick.position.y + kick.size.y + 2.0 * px, 22.0 * px)
	head.add_child(kick)
	head.add_child(title)
	# the purse: a coin and your gold, in a dark pill rimmed in gold
	var coin := Icons.rect("coin", 22.0 * px)
	_purse_amt = MenuKit.words("0", "inter", 800, 15.0 * px, HudStyle.GOLD_HI, 0.0, 1.2)
	_purse_amt.runs[0][1] = HudStyle.tnum(_purse_amt.runs[0][1])
	_purse = UiBox.new(Vector2(10.0, 40.0) * px, 20.0 * px, 30.0 * px)
	_purse.p("c_top", Color8(40, 30, 10, 158)).p("c_foot", Color8(20, 14, 4, 194))
	_purse.p("c_border", Color8(244, 199, 101, 89)).p("border", 1.0 * px).p("hi", 0.09)
	_purse.p("c_shadow", Color(0, 0, 0, 0.3)).p("shadow", Vector2(8.0, 26.0) * px)
	_purse.p("c_glow", Color8(244, 199, 101, 31)).p("glow", 26.0 * px)
	coin.name = "Coin"
	_purse.add_child(coin)
	_purse.add_child(_purse_amt)
	head.add_child(_purse)
	return head


## The dock beside the chest: the pity meter, the two opens, the links.
func _build_dock(mx: float, my: float) -> Control:
	var px := MenuKit.PX
	var w := minf(280.0 * px, _vp.x * 0.38)
	var top := my + 46.0 * px
	var h := _vp.y - my - top
	var pad := 12.0 * px
	var gap := 9.0 * px
	var dock := UiBox.new(Vector2(w, h), 26.0 * px, 40.0 * px)
	dock.p("c_top", Color8(14, 34, 48, 199)).p("c_foot", Color8(6, 18, 28, 219))
	dock.p("c_border", HudStyle.STROKE).p("border", 1.0 * px).p("hi", 0.09)
	dock.p("c_shadow", Color(0.0, 0.031, 0.055, 0.38)).p("shadow", Vector2(18.0, 50.0) * MenuKit.U)
	dock.position = Vector2(_vp.x - mx - w, top)
	_dock_x = dock.position.x
	var iw := w - pad * 2.0
	_pity = Control.new()
	_pity.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pity.size = Vector2(iw, 13.0 * px * 1.25 + 8.0 * px + 8.0 * px + 8.0 * px + 13.0 * px * 1.25)
	dock.add_child(_pity)
	_buy_one = UiButton.new(Vector2(iw, 46.0 * px), 23.0 * px, 30.0 * px)
	_buy_one.pressed.connect(func() -> void: _buy(1))
	dock.add_child(_buy_one)
	_buy_ten = UiButton.new(Vector2(iw, 46.0 * px), 23.0 * px, 30.0 * px)
	HudStyle.gold(_buy_ten, MenuKit.U)
	_buy_ten.pressed.connect(func() -> void: _buy(10))
	dock.add_child(_buy_ten)
	var links := Control.new()
	links.mouse_filter = Control.MOUSE_FILTER_IGNORE
	links.size = Vector2(iw, 13.0 * px * 1.2 + 12.0 * px)
	for i in 2:
		var l := UiButton.new(Vector2(10.0, links.size.y), 8.0 * px, 0.0)
		l.p("c_top", Color(0, 0, 0, 0)).p("c_foot", Color(0, 0, 0, 0)).p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0, 0, 0, 0))
		l.pressed.connect(_show_collection if i == 0 else _show_odds)
		links.add_child(l)
		_links.append(l)
	dock.add_child(links)
	var total := _pity.size.y + gap + _buy_one.size.y + gap + 12.0 * px + _buy_ten.size.y + gap + links.size.y
	var y := maxf(pad, (h - total) * 0.5)
	_pity.position = Vector2(pad, y)
	y += _pity.size.y + gap
	_buy_one.position = Vector2(pad, y)
	y += _buy_one.size.y + gap + 12.0 * px
	_buy_ten.position = Vector2(pad, y)
	y += _buy_ten.size.y + gap
	links.position = Vector2(pad, y)
	return dock


## The dock's words, the purse and the chest's tag, as the vault stands now.
func _sync() -> void:
	if progress == null or _purse == null:
		return
	var px := MenuKit.PX
	var v: Dictionary = progress.vault
	var gold: int = progress.purse
	_purse_amt.set_text(MenuKit.num(gold))
	var coin: Control = _purse.get_node("Coin")
	var pw := 10.0 * px + coin.size.x + 9.0 * px + _purse_amt.size.x + 14.0 * px
	_purse.resize(Vector2(pw, 40.0 * px))
	_purse.position = Vector2(_head.size.x - pw, 0.0)
	coin.position = Vector2(10.0 * px - 2.5 * px, (40.0 * px - coin.size.y) * 0.5)
	_purse_amt.position = Vector2(10.0 * px + coin.size.x - 5.0 * px + 9.0 * px, (40.0 * px - _purse_amt.size.y) * 0.5)
	# the pity
	for c in _pity.get_children():
		c.queue_free()
	var left: Vector2i = Cosmetics.pity_left(v)
	var w := _pity.size.x
	var r1 := _row("Legendary within", "%d open%s" % [left.x, "" if left.x == 1 else "s"], 13.0, 15.0, HudStyle.GOLD_HI, w)
	_pity.add_child(r1)
	var meter := _Meter.new(Vector2(w, 8.0 * px), float(Cosmetics.HARD_PITY - left.x) / Cosmetics.HARD_PITY)
	meter.position = Vector2(0.0, r1.size.y + 8.0 * px)
	_pity.add_child(meter)
	var r2 := _row("Epic or better within", str(left.y), 13.0, 13.0, Color("#d9b8ff"), w)
	r2.position = Vector2(0.0, meter.position.y + meter.size.y + 8.0 * px)
	_pity.add_child(r2)
	# the opens
	var free: bool = Cosmetics.free_ready(v)
	_fill_buy(_buy_one, "OPEN ×1", "FREE TODAY" if free else MenuKit.num(Cosmetics.PULL_COST), free, false)
	if free:
		_buy_one.p("c_top", Color8(60, 200, 180, 82)).p("c_foot", Color8(20, 110, 100, 82)).p("c_border", Color8(159, 232, 216, 128)).p("border", 1.0 * px)
		_buy_one.p("c_glow", Color8(94, 227, 212, 64)).p("glow", 24.0 * px).p("c_shadow", Color(0, 0, 0, 0)).p("hi", 0.09)
	else:
		MenuKit.flat(MenuKit.glass(_buy_one))
		_buy_one.p("c_glow", Color(0, 0, 0, 0))
	_fill_buy(_buy_ten, "OPEN ×10", MenuKit.num(Cosmetics.TEN_COST), false, true)
	_able(_buy_one, free or gold >= Cosmetics.PULL_COST)
	_able(_buy_ten, gold >= Cosmetics.TEN_COST)
	# the links
	var found: int = Cosmetics.collected(v)
	var labels := [[["Collection ", 600, HudStyle.INK_2], ["%d/%d" % [found, Cosmetics.pool().size()], 800, HudStyle.INK]], [["Odds & rules", 600, HudStyle.INK_2]]]
	for i in 2:
		var l := _links[i]
		for c in l.get_children():
			c.queue_free()
		var runs := []
		for r: Array in labels[i]:
			runs.append([r[0], HudStyle.font("inter", r[1]), roundi(13.0 * px), r[2]])
		var t := UiText.new(runs, 0.0, 1.2)
		l.resize(Vector2(t.size.x + 8.0 * px, l.size.y))
		t.position = Vector2(4.0 * px, (l.size.y - t.size.y) * 0.5)
		l.add_child(t)
		l.position = Vector2(0.0 if i == 0 else _pity.size.x - l.size.x, 0.0)
	_fill_hot_pill(free, free or gold >= Cosmetics.PULL_COST)


func _row(a: String, b: String, pa: float, pb: float, cb: Color, w: float) -> Control:
	var px := MenuKit.PX
	var row := Control.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ta := MenuKit.words(a, "inter", 500, pa * px, HudStyle.INK_2, 0.0, 1.25)
	var tb := MenuKit.words(b, "inter", 800, pb * px, cb, 0.0, 1.25)
	tb.runs[0][1] = HudStyle.tnum(tb.runs[0][1])
	tb.set_runs(tb.runs)
	row.size = Vector2(w, maxf(ta.size.y, tb.size.y))
	# on a common baseline
	ta.position = Vector2(0.0, row.size.y - ta.size.y + (ta.size.y - ta.baseline()) - (tb.size.y - tb.baseline()) * 0.0)
	tb.position = Vector2(w - tb.size.x, row.size.y - tb.size.y)
	ta.position.y = tb.position.y + tb.baseline() - ta.baseline()
	row.add_child(ta)
	row.add_child(tb)
	return row


## An open's button: OPEN ×n on the left, its price (a coin and gold) or
## FREE TODAY on the right; the ten's "EPIC INSIDE" tag on its shoulder.
func _fill_buy(b: UiButton, label: String, cost: String, free: bool, ten: bool) -> void:
	var px := MenuKit.PX
	for c in b.get_children():
		c.queue_free()
	var ink := HudStyle.GOLD_INK if ten else HudStyle.INK
	var l := MenuKit.words(label, "inter", 800, 15.0 * px, ink, 0.08, 1.2)
	l.position = Vector2(20.0 * px, (b.size.y - l.size.y) * 0.5)
	b.add_child(l)
	if free:
		var f := MenuKit.words(cost, "inter", 800, 12.0 * px, HudStyle.AQUA, 0.1, 1.2)
		f.position = Vector2(b.size.x - 20.0 * px - f.size.x, (b.size.y - f.size.y) * 0.5)
		b.add_child(f)
	else:
		var amt := MenuKit.words(cost, "inter", 800, 15.0 * px, ink, 0.0, 1.2)
		amt.position = Vector2(b.size.x - 20.0 * px - amt.size.x, (b.size.y - amt.size.y) * 0.5)
		var coin := Icons.rect("coin", 20.0 * px)
		coin.position = Vector2(amt.position.x - 4.0 * px - coin.size.x, (b.size.y - coin.size.y) * 0.5)
		b.add_child(coin)
		b.add_child(amt)
	if ten:
		var t := MenuKit.words("EPIC INSIDE", "inter", 800, 10.0 * px, Color.WHITE, 0.06, 1.2)
		var tag := UiBox.new(t.size + Vector2(18.0, 4.0) * px, 99.0 * px, 16.0 * px)
		tag.p("c_top", Color("#b77cff")).p("c_foot", Color("#7a35d6")).p("border", 0.0).p("hi", 0.2)
		tag.p("c_shadow", Color8(122, 53, 214, 128)).p("shadow", Vector2(4.0, 14.0) * px)
		t.position = Vector2(9.0, 2.0) * px
		tag.add_child(t)
		tag.position = Vector2(b.size.x - 14.0 * px - tag.size.x, -9.0 * px)
		b.add_child(tag)


func _able(b: UiButton, on: bool) -> void:
	b.enabled = on
	b.modulate = Color(1, 1, 1, 1) if on else Color(0.62, 0.62, 0.62, 0.45)


## The tag over the chest: "FREE CHEST · Tap to open", or "TAP TO OPEN".
func _fill_hot_pill(free: bool, can: bool) -> void:
	var px := MenuKit.PX
	for c in _hot_pill.get_children():
		c.queue_free()
	_hot_pill.set_meta("can", can)
	if not can:
		return
	var a := MenuKit.words("FREE CHEST" if free else "TAP TO OPEN", "inter", 800, 13.0 * px, HudStyle.GOLD_HI, 0.08, 1.2)
	var b: UiText = MenuKit.words("Tap to open", "inter", 600, 11.5 * px, HudStyle.INK_2, 0.0, 1.2) if free else null
	var w := maxf(a.size.x, b.size.x if b != null else 0.0) + 32.0 * px
	var h := 8.0 * px + a.size.y + (1.0 * px + b.size.y if b != null else 0.0) + 9.0 * px
	var pill := UiBox.new(Vector2(w, h), 16.0 * px, 30.0 * px)
	pill.p("c_top", Color8(6, 18, 28, 184)).p("c_foot", Color8(6, 18, 28, 184))
	pill.p("c_border", Color8(244, 199, 101, 115)).p("border", 1.0 * px).p("hi", 0.0)
	pill.p("c_shadow", Color(0, 0, 0, 0.35)).p("shadow", Vector2(10.0, 30.0) * px)
	pill.p("c_glow", Color8(244, 199, 101, 51)).p("glow", 22.0 * px)
	pill.position = Vector2(-w * 0.5, -h - 6.0 * px)
	a.position = Vector2((w - a.size.x) * 0.5, 8.0 * px)
	pill.add_child(a)
	if b != null:
		b.position = Vector2((w - b.size.x) * 0.5, a.position.y + a.size.y + 1.0 * px)
		pill.add_child(b)
	var notch := _Notch.new(10.0 * px)
	notch.position = Vector2(-5.0 * px, -6.0 * px - 5.0 * px)
	_hot_pill.add_child(pill)
	_hot_pill.add_child(notch)


# ------------------------------------------------------------------ views


func _set_view(v: View) -> void:
	_view = v
	_view_t = 0.0
	_reveal.visible = v == View.REVEAL
	_show.visible = v == View.SHOW
	_coll.visible = v == View.COLL
	_skip_tag.visible = v == View.OPENING
	if v != View.HOME:
		_hot.visible = false
		_hot_pill.visible = false


func _home() -> void:
	_set_view(View.HOME)
	_clear(_cards)
	_clear(_foot)
	_clear(_show)
	_clear(_coll)
	_card_list.clear()
	_show_panel = null
	if _odds != null:
		_odds.visible = false
	preview.emit("")
	stage.emit("settle", 0)
	focus.emit("home")
	_flash.tint = Color("#ffbe3d")
	_sync()


func _clear(c: Control) -> void:
	for n in c.get_children():
		c.remove_child(n)
		n.queue_free()


## The chest's outline (units) from the stage: the tap target follows it,
## and "Tap to open" rides over it.
func _place_chest() -> void:
	var on := _view == View.HOME and chest_rect.size.x > 8.0
	_hot.visible = on
	_hot_pill.visible = on and bool(_hot_pill.get_meta("can", false))
	if not on:
		return
	var pad := 12.0 * MenuKit.PX
	_hot.position = chest_rect.position - Vector2(pad, pad)
	_hot.size = chest_rect.size + Vector2(pad, pad) * 2.0
	var bob := (0.5 - 0.5 * cos(_t * TAU / 2.2)) * 7.0 * MenuKit.PX
	_hot_pill.position = Vector2(chest_rect.get_center().x, chest_rect.position.y - 14.0 * MenuKit.PX - bob)
	if not _hot_seen:
		_hot_seen = true
		_hot_pill.modulate.a = 0.0
	_hot_pill.modulate.a = minf(1.0, _hot_pill.modulate.a + get_process_delta_time() / 0.4)


func _on_hot(event: InputEvent) -> void:
	var tap: bool = (event is InputEventScreenTouch and not event.pressed) or (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed and event.device != InputEvent.DEVICE_ID_EMULATION)
	if tap and _view == View.HOME and not is_busy():
		_buy(1)


## Any tap during the opening goes straight to the cards; the collection scrolls.
func _on_root(event: InputEvent) -> void:
	var press: bool = (event is InputEventScreenTouch and event.pressed) or (event is InputEventMouseButton and event.pressed and event.device != InputEvent.DEVICE_ID_EMULATION)
	if press and is_busy():
		_fast_forward()


# ------------------------------------------------------------------ the opening


func _buy(n: int) -> void:
	if is_busy() or progress == null:
		return
	var res: Array[Dictionary] = progress.pull(n)
	sfx.emit("click", 0)
	if res.is_empty():
		var b := _buy_ten if n == 10 else _buy_one
		var x := b.position.x
		var tw := create_tween()
		for d: float in [-6.0, 6.0, 0.0]:
			tw.tween_property(b, "position:x", x + d * MenuKit.PX, 0.065)
		return
	_last_n = n
	pulled.emit(n)
	_play(res)


## The chest wakes, its light climbing through the rarities inside, then
## bursts open on the best of them and the cards come out.
func _play(res: Array[Dictionary]) -> void:
	_skip = false
	_clear(_cards)
	_clear(_foot)
	_clear(_show)
	_clear(_coll)
	_card_list.clear()
	_set_view(View.OPENING)
	preview.emit("")
	var top := 0
	for r in res:
		top = maxi(top, int(r.item.rarity))
	stage.emit("settle", 0)
	focus.emit("charge")
	_tint(0)
	stage.emit("charge", 0)
	sfx.emit("rumble", 0)
	_op = {"res": res, "top": top, "tier": 0, "next": _t + 0.95, "burst": -1.0}


func _step_opening() -> void:
	if _op.is_empty():
		return
	var top: int = _op.top
	if float(_op.burst) < 0.0:
		if _skip or _t >= float(_op.next):
			var t: int = int(_op.tier) + 1
			if t <= top and not _skip:
				_op.tier = t
				_tint(t)
				stage.emit("charge", t)
				sfx.emit("rumble", t)
				_pulse(t, false)
				_op.next = _t + (1.15 if t == 3 else 0.85)
			else:
				# burst open
				_tint(top)
				focus.emit("burst")
				stage.emit("burst", top)
				sfx.emit("burst", top)
				_pulse(top, true)
				_fx.burst(chest_at, Cosmetics.RARITIES[top].css, 30 + top * 20, 0, 0.8)
				_op.burst = _t
				_op.next = _t + (1.8 if top == 3 else (1.4 if top == 2 else 1.1))
		return
	if _skip or _t >= float(_op.next):
		var res: Array[Dictionary] = _op.res
		_op = {}
		_skip = false
		focus.emit("cards")
		_deal(res)


func _fast_forward() -> void:
	_skip = true


func _tint(tier: int) -> void:
	_flash.tint = Cosmetics.RARITIES[tier].css


## A flash of the rarity's light from the chest (a big one washes the screen).
func _pulse(tier: int, big: bool) -> void:
	_flash.go(chest_at, big)
	if big and tier == 3:
		for c in _card_list:
			c.quake()


# ------------------------------------------------------------------ the cards


## The cards, out of the chest's mouth into their places: one big card, or
## two rows of five, as big as the screen allows.
func _deal(res: Array[Dictionary]) -> void:
	var px := MenuKit.PX
	_results = res
	_set_view(View.REVEAL)
	_clear(_cards)
	_card_list.clear()
	var my := _vp.y * 0.03
	var mx := _vp.x * 0.03
	var top := my + 40.0 * px
	var foot_h := 40.0 * px
	var gap_f := 8.0 * px
	var avail := _vp.y - top - my - foot_h - gap_f
	var n := res.size()
	var cols := 1 if n == 1 else mini(5, n)
	var rows := ceili(float(n) / cols)
	var cw := 0.0
	if n == 1:
		cw = clampf(_vp.y * 0.46, 120.0 * px, 200.0 * px)
		cw = minf(cw, avail / 1.4)
	else:
		# five across, two rows down, the gap 12% of a card
		cw = minf(150.0 * px, minf((_vp.x - mx * 2.0) / (cols + (cols - 1) * 0.12), avail / (rows * 1.4 + (rows - 1) * 0.12)))
	var gap := cw * 0.12
	var grid := Vector2(cols * cw + (cols - 1) * gap, rows * cw * 1.4 + (rows - 1) * gap)
	_cards.position = Vector2((_vp.x - grid.x) * 0.5, top + (avail - grid.y) * 0.5)
	_cards.size = grid
	var worn := _worn()
	for i in n:
		var r: Dictionary = res[i]
		var it: Dictionary = r.item
		var c := VaultCard.new(cw, it, r, false, false, false, 0, worn.has(it.id))
		c.position = Vector2((i % cols) * (cw + gap), (i / cols) * (cw * 1.4 + gap))
		c.pressed.connect(_tap_card.bind(c))
		_cards.add_child(c)
		_card_list.append(c)
		var spin := (1.0 if i % 2 else -1.0) * (14.0 + (i % 3) * 8.0)
		c.fly_from(chest_at - _cards.position, 0.08 + i * 0.085, spin)
	_foot.position = Vector2(0.0, _cards.position.y + grid.y + gap_f)
	_render_foot()
	# a single card turns itself over once it lands, then shows itself off
	if n == 1:
		var c := _card_list[0]
		_after(0.95, func() -> void:
			if _view == View.REVEAL and is_instance_valid(c) and not c.is_open:
				_turn(c)
				var it: Dictionary = c.item
				_after(1.5 if int(it.rarity) >= 2 else 1.1, func() -> void:
					if _view == View.REVEAL and is_instance_valid(c):
						_open_show([it], 0, View.REVEAL)))


func _worn() -> Array:
	var v: Dictionary = progress.vault
	return (v.equip as Dictionary).values()


func _tap_card(c: VaultCard) -> void:
	if is_busy() or c.flying():
		return
	if not c.is_open:
		_turn(c)
	elif _view == View.REVEAL:
		sfx.emit("click", 0)
		var list: Array[Dictionary] = []
		for r in _results:
			list.append(r.item)
		_open_show(list, _card_list.find(c), View.REVEAL)
	elif _view == View.COLL:
		sfx.emit("click", 0)
		var list: Array[Dictionary] = []
		for x in _card_list:
			list.append(x.item)
		_open_show(list, _card_list.find(c), View.COLL)


## Turns a card over: its sound and its light from the chest, sparks off it,
## a duplicate's coin, and a legendary shaking the cards.
func _turn(c: VaultCard) -> void:
	if c.is_open:
		return
	var tier := c.rarity
	c.turn_over()
	sfx.emit("flip", tier)
	stage.emit("pulse", tier)
	var mid := _cards.position + c.position + c.size * 0.5
	_fx.burst(mid, c.rc, 14 + tier * 14, tier * 5 if tier >= 2 else 0, 0.7 + tier * 0.15)
	if not c.result.is_empty() and not bool(c.result.get("fresh", false)):
		_after(0.24, func() -> void: sfx.emit("coin", 0))
	if tier == 3:
		_tint(3)
		_pulse(3, true)
	_render_foot()


## Under the cards: "Reveal all" while any are face down; then Done and
## the same open again.
func _render_foot() -> void:
	var px := MenuKit.PX
	_clear(_foot)
	var hidden: Array[VaultCard] = []
	for c in _card_list:
		if not c.is_open:
			hidden.append(c)
	if not hidden.is_empty():
		if _results.size() > 1:
			var all := _button("Reveal all", false, 170.0 * px)
			all.pressed.connect(func() -> void:
				sfx.emit("click", 0)
				# the rarest last, for the drum roll
				hidden.sort_custom(func(a: VaultCard, b: VaultCard) -> bool: return a.rarity < b.rarity)
				for i in hidden.size():
					var c := hidden[i]
					_after(i * 0.14 + (0.38 if c.rarity == 3 else 0.0), func() -> void:
						if is_instance_valid(c):
							_turn(c)))
			all.position = Vector2((_vp.x - all.size.x) * 0.5, 0.0)
			_foot.add_child(all)
		return
	var v: Dictionary = progress.vault
	var free: bool = Cosmetics.free_ready(v)
	var again: UiButton
	if _last_n == 10:
		again = _button("Open ×10 · ", true, 170.0 * px, MenuKit.num(Cosmetics.TEN_COST))
	elif free:
		again = _button("Open again · Free", true, 170.0 * px)
	else:
		again = _button("Open again · ", true, 170.0 * px, MenuKit.num(Cosmetics.PULL_COST))
	_able(again, Cosmetics.free_ready(v) if _last_n == 1 and free else int(progress.purse) >= (Cosmetics.TEN_COST if _last_n == 10 else Cosmetics.PULL_COST))
	again.pressed.connect(func() -> void: _buy(_last_n))
	var done := _button("Done", false, 170.0 * px)
	done.pressed.connect(func() -> void:
		sfx.emit("click", 0)
		_home())
	var gap := 10.0 * px
	var w := done.size.x + gap + again.size.x
	done.position = Vector2((_vp.x - w) * 0.5, 0.0)
	again.position = Vector2(done.position.x + done.size.x + gap, 0.0)
	_foot.add_child(done)
	_foot.add_child(again)


## A button 40 tall: glass, or gold; a coin and a price after its words.
func _button(label: String, gold: bool, min_w: float, price := "", h := 40.0 * MenuKit.PX, fs := 15.0) -> UiButton:
	var px := MenuKit.PX
	var ink := HudStyle.GOLD_INK if gold else HudStyle.INK
	var runs := [[label, HudStyle.font("inter", 700), roundi(fs * px), ink]]
	var t := UiText.new(runs, 0.0, 1.2)
	var coin_w := 0.0
	var amt: UiText = null
	if price != "":
		amt = MenuKit.words(price, "inter", 700, fs * px, ink, 0.0, 1.2)
		coin_w = 16.0 * px + 6.0 * px
	var need := t.size.x + coin_w + (amt.size.x if amt != null else 0.0)
	var w := maxf(min_w, need + 44.0 * px)
	var b := UiButton.new(Vector2(w, h), h * 0.5, 30.0 * px)
	if gold:
		HudStyle.gold(b, MenuKit.U)
	else:
		MenuKit.glass(b)
		b.p("c_shadow", Color(0, 0, 0, 0.18)).p("shadow", Vector2(6.0, 18.0) * px)
	var x := (w - need) * 0.5
	t.position = Vector2(x, (h - t.size.y) * 0.5)
	b.add_child(t)
	if amt != null:
		var coin := Icons.rect("coin", 20.0 * px)
		coin.position = Vector2(x + t.size.x + 1.0 * px, (h - coin.size.y) * 0.5)
		b.add_child(coin)
		amt.position = Vector2(x + t.size.x + coin_w, (h - amt.size.y) * 0.5)
		b.add_child(amt)
	return b


# ------------------------------------------------------------------ the showcase


func _open_show(list: Array[Dictionary], i: int, from: View) -> void:
	_show_list = list
	_show_idx = maxi(0, i)
	_show_from = from
	_set_view(View.SHOW)
	_render_show()


func _step_show(d: int) -> void:
	if _show_list.size() < 2:
		return
	sfx.emit("click", 0)
	_show_idx = (_show_idx + d + _show_list.size()) % _show_list.size()
	_render_show()


## Down the left: the card, big, beside what it is, a live line on what to
## watch, Equip (or how it's still in the chest), the way back and arrows
## through the rest; she wears it out on the water.
func _render_show() -> void:
	var px := MenuKit.PX
	_clear(_show)
	var it := _show_list[_show_idx]
	var v: Dictionary = progress.vault
	var owned: bool = progress.owns_item(it.id)
	var res := {}
	if _show_from == View.REVEAL:
		for r in _results:
			if r.item.id == it.id:
				res = r
				break
	var R: Dictionary = Cosmetics.RARITIES[int(it.rarity)]
	var mx := _vp.x * 0.03
	var my := _vp.y * 0.03
	var top := my + 40.0 * px
	var h := _vp.y - my - top
	var w := minf(330.0 * px, _vp.x * 0.44)
	_show_panel = Control.new()
	_show_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_show_panel.position = Vector2(mx, top)
	_show_panel.size = Vector2(w, h)
	_show.add_child(_show_panel)
	var cw := minf(130.0 * px, _vp.y * 0.4)
	var worn: bool = str((v.equip as Dictionary).get(it.kind, "")) == it.id
	var card := VaultCard.new(cw, it, res, true, false, not owned, int((v.owned as Dictionary).get(it.id, 0)), worn)
	_show_panel.add_child(card)
	# what it is
	var iw := w - cw - 10.0 * px
	var info := UiBox.new(Vector2(iw, 10.0), 22.0 * px, 40.0 * px)
	info.p("c_top", Color8(14, 34, 48, 209)).p("c_foot", Color8(6, 18, 28, 230))
	info.p("c_border", HudStyle.STROKE).p("border", 1.0 * px).p("hi", 0.09)
	info.p("c_shadow", Color(0.0, 0.031, 0.055, 0.38)).p("shadow", Vector2(18.0, 50.0) * MenuKit.U)
	var pad := Vector2(12.0, 10.0) * px
	var tw := iw - pad.x * 2.0
	var kind_s := "%s · %s%s" % [R.name, Cosmetics.KIND_NAMES[it.kind], " · Animated" if int(it.rarity) == 3 and it.kind == "skin" else ""]
	var kind := MenuKit.words(kind_s.to_upper(), "inter", 700, 10.5 * px, R.css, 0.18, 1.2)
	kind.cut_to(tw)
	kind.position = pad
	info.add_child(kind)
	var title := MenuKit.words(str(it.name), "inter", 800, 16.0 * px, HudStyle.INK, -0.015, 1.1)
	title.wrap = tw
	title.set_runs(title.runs)
	title.position = Vector2(pad.x, kind.position.y + kind.size.y + 4.0 * px)
	info.add_child(title)
	var what := "Your ship is wearing it now" if it.kind == "skin" else ("Watch your broadside: this is the blast" if it.kind == "blast" else "Watch the shots fly: this is the trail")
	var live := MenuKit.words(what, "inter", 600, 12.5 * px, HudStyle.AQUA, 0.0, 1.3)
	live.wrap = tw - 16.0 * px
	live.set_runs(live.runs)
	live.position = Vector2(pad.x + 16.0 * px, title.position.y + title.size.y + 6.0 * px)
	var dot := _Dot.new(8.0 * px, HudStyle.AQUA)
	dot.position = Vector2(pad.x + 4.0 * px, live.position.y + live.baseline() - 4.0 * px - 3.0 * px)
	info.add_child(dot)
	info.add_child(live)
	var y := live.position.y + live.size.y + 8.0 * px
	if owned:
		var on := worn
		var eq := _button("Equipped" if on else "Equip", not on, tw, "", 36.0 * px, 13.0)
		if on:
			eq.p("c_top", Color(1, 1, 1, 0.92)).p("c_mid", Color(1, 1, 1, 0.92)).p("c_foot", Color(1, 1, 1, 0.92)).p("c_shadow", Color(0, 0, 0, 0)).p("c_lo", Color(0, 0, 0, 0))
			(eq.get_child(0) as UiText).runs[0][3] = Color("#0a1c26")
			(eq.get_child(0) as UiText).queue_redraw()
		eq.pressed.connect(func() -> void:
			if str((progress.vault.equip as Dictionary).get(it.kind, "")) == it.id:
				return
			sfx.emit("click", 0)
			progress.wear(it.id)
			equipped.emit(it.id)
			_render_show())
		eq.position = Vector2(pad.x, y)
		info.add_child(eq)
		y += eq.size.y + 6.0 * px
	else:
		var lock := Icons.rect("lock", 16.0 * px, HudStyle.INK_2)
		var note := MenuKit.words("Not found yet. It waits in the chest.", "inter", 600, 12.0 * px, HudStyle.INK_2, 0.0, 1.3)
		note.wrap = tw - 24.0 * px
		note.set_runs(note.runs)
		lock.position = Vector2(pad.x, y + (note.size.y - lock.size.y) * 0.5)
		note.position = Vector2(pad.x + 24.0 * px, y)
		info.add_child(lock)
		info.add_child(note)
		y += note.size.y + 6.0 * px
	var back := _button("Back to cards" if _show_from == View.REVEAL else "Back to collection", false, tw, "", 36.0 * px, 13.0)
	back.pressed.connect(func() -> void:
		sfx.emit("click", 0)
		_leave_show())
	back.position = Vector2(pad.x, y)
	info.add_child(back)
	y += back.size.y
	if _show_list.size() > 1:
		y += 6.0 * px
		var prev := MenuKit.round("sw_back", 30.0 * px, 16.0 * px, false)
		var next := MenuKit.round("chev", 30.0 * px, 16.0 * px, false)
		prev.pressed.connect(func() -> void: _step_show(-1))
		next.pressed.connect(func() -> void: _step_show(1))
		var count := MenuKit.words("%d / %d" % [_show_idx + 1, _show_list.size()], "inter", 700, 12.0 * px, HudStyle.INK_3, 0.0, 1.2)
		var nw := prev.size.x + 10.0 * px + count.size.x + 10.0 * px + next.size.x
		var nx := (iw - nw) * 0.5
		prev.position = Vector2(nx, y)
		count.position = Vector2(nx + prev.size.x + 10.0 * px, y + (prev.size.y - count.size.y) * 0.5)
		next.position = Vector2(count.position.x + count.size.x + 10.0 * px, y)
		info.add_child(prev)
		info.add_child(count)
		info.add_child(next)
		y += prev.size.y
	info.resize(Vector2(iw, y + pad.y))
	# the card beside it, the two centred down the panel
	var row_h := maxf(card.size.y, info.size.y)
	card.position = Vector2(0.0, (h - card.size.y) * 0.5)
	info.position = Vector2(cw + 10.0 * px, (h - info.size.y) * 0.5)
	_show_panel.size.y = h
	_show_panel.add_child(info)
	card.modulate.a = 0.0
	var tw2 := create_tween().set_parallel()
	tw2.tween_property(card, "modulate:a", 1.0, 0.42)
	card.position.y += 16.0 * px
	tw2.tween_property(card, "position:y", card.position.y - 16.0 * px, 0.42).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	info.modulate.a = 0.0
	tw2.tween_property(info, "modulate:a", 1.0, 0.4)
	row_h = row_h
	preview.emit(str(it.id))


func _leave_show() -> void:
	preview.emit("")
	_clear(_show)
	_show_panel = null
	if _show_from == View.REVEAL:
		_set_view(View.REVEAL)
		focus.emit("cards")
		var worn := _worn()
		for c in _card_list:
			c.set_worn(worn.has(c.item.id))
	else:
		_set_view(View.COLL)
		_render_collection()
		focus.emit("home")


# ------------------------------------------------------------------ the collection


func _show_collection() -> void:
	sfx.emit("click", 0)
	_set_view(View.COLL)
	_scroll = 0.0
	_render_collection()


## A sheet over the sea: how much you've found, a tab for each kind, and a
## grid of every card (found ones in colour, the rest locked).
func _render_collection() -> void:
	var px := MenuKit.PX
	_clear(_coll)
	_card_list.clear()
	var v: Dictionary = progress.vault
	var mx := _vp.x * 0.03
	var my := _vp.y * 0.03
	var top := my + 40.0 * px
	var w := minf(1080.0 * px, _vp.x - mx * 2.0)
	var sheet := UiBox.new(Vector2(w, _vp.y - my - top), 22.0 * px, 40.0 * px)
	sheet.p("c_top", Color8(10, 28, 40, 224)).p("c_foot", Color8(4, 14, 22, 235))
	sheet.p("c_border", HudStyle.STROKE).p("border", 1.0 * px).p("hi", 0.09)
	sheet.p("c_shadow", Color(0.0, 0.031, 0.055, 0.38)).p("shadow", Vector2(18.0, 50.0) * MenuKit.U)
	sheet.position = Vector2((_vp.x - w) * 0.5, top)
	_coll.add_child(sheet)
	var pad := Vector2(12.0, 12.0) * px
	var iw := w - pad.x * 2.0
	var found: int = Cosmetics.collected(v)
	var all := Cosmetics.pool().size()
	var count := UiText.new([["%d" % found, HudStyle.font("inter", 800), roundi(20.0 * px), HudStyle.INK],
			[" of %d found" % all, HudStyle.font("inter", 500), roundi(13.0 * px), HudStyle.INK_2]], 0.0, 1.2)
	count.position = pad
	sheet.add_child(count)
	var tip := MenuKit.words("Tap any card to try it on your ship", "inter", 500, 12.0 * px, HudStyle.INK_3, 0.0, 1.2)
	tip.position = Vector2(w - pad.x - tip.size.x, pad.y + count.baseline() - tip.baseline())
	sheet.add_child(tip)
	var meter := _Meter.new(Vector2(iw * 0.42, 8.0 * px), float(found) / all)
	meter.position = Vector2(pad.x + count.size.x + 14.0 * px, pad.y + count.baseline() - 6.0 * px)
	meter.size.x = maxf(40.0 * px, tip.position.x - 14.0 * px - meter.position.x)
	sheet.add_child(meter)
	# the tabs: a segmented bar
	var ty := count.position.y + count.size.y + 8.0 * px
	var bar := UiBox.new(Vector2(iw, 36.0 * px), 20.0 * px, 0.0)
	bar.p("c_top", Color(0, 0, 0, 0.28)).p("c_foot", Color(0, 0, 0, 0.28)).p("c_border", Color(1, 1, 1, 0.06)).p("border", 1.0 * px).p("hi", 0.0).p("c_shadow", Color(0, 0, 0, 0))
	bar.position = Vector2(pad.x, ty)
	sheet.add_child(bar)
	var tab_w := (iw - 8.0 * px - 8.0 * px) / 3.0
	for i in 3:
		var kind: String = Cosmetics.KINDS[i]
		var items := Cosmetics.of_kind(kind).filter(func(x: Dictionary) -> bool: return not bool(x.base))
		var own := 0
		for it: Dictionary in items:
			if progress.owns_item(it.id):
				own += 1
		var sel := kind == _coll_kind
		var tab := UiButton.new(Vector2(tab_w, 28.0 * px), 16.0 * px, 20.0 * px)
		if sel:
			tab.p("c_top", Color("#f4f8f9")).p("c_foot", Color("#f4f8f9")).p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0, 0, 0, 0.25)).p("shadow", Vector2(6.0, 20.0) * px)
		else:
			tab.p("c_top", Color(0, 0, 0, 0)).p("c_foot", Color(0, 0, 0, 0)).p("border", 0.0).p("hi", 0.0).p("c_shadow", Color(0, 0, 0, 0))
		var ink := Color("#0a1c26") if sel else HudStyle.INK_2
		var t := UiText.new([[str(Cosmetics.KIND_NAMES[kind]) + "s ", HudStyle.font("inter", 700, roundi(0.06 * 12.0 * px)), roundi(12.0 * px), ink],
				["%d/%d" % [own, items.size()], HudStyle.font("inter", 600), roundi(12.0 * px), Color(ink, ink.a * 0.6)]], 0.0, 1.2)
		t.position = (tab.size - t.size) * 0.5
		tab.add_child(t)
		tab.position = Vector2(4.0 * px + i * (tab_w + 4.0 * px), 4.0 * px)
		tab.pressed.connect(func() -> void:
			if _coll_kind == kind:
				return
			sfx.emit("click", 0)
			_coll_kind = kind
			_scroll = 0.0
			_render_collection())
		bar.add_child(tab)
	# the grid, scrolling under a finger
	var gy := ty + bar.size.y + 12.0 * px
	var body := Control.new()
	body.clip_contents = true
	body.mouse_filter = Control.MOUSE_FILTER_PASS
	body.position = Vector2(pad.x - 6.0 * px, gy)
	body.size = Vector2(iw + 12.0 * px, sheet.size.y - gy)
	body.gui_input.connect(_on_grid)
	sheet.add_child(body)
	_grid = Control.new()
	_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(_grid)
	var items := Cosmetics.of_kind(_coll_kind)
	items.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if bool(a.base) != bool(b.base):
			return bool(a.base)
		return int(a.rarity) > int(b.rarity))
	var gap := 10.0 * px
	var cols := maxi(1, floori((body.size.x - 12.0 * px + gap) / (108.0 * px + gap)))
	var cw := (body.size.x - 12.0 * px - gap * (cols - 1)) / cols
	var worn := _worn()
	for i in items.size():
		var it: Dictionary = items[i]
		var owned: bool = progress.owns_item(it.id)
		var c := VaultCard.new(cw, it, {}, true, true, not owned, int((v.owned as Dictionary).get(it.id, 0)), worn.has(it.id))
		c.position = Vector2(6.0 * px + (i % cols) * (cw + gap), 6.0 * px + (i / cols) * (cw * 1.4 + gap))
		c.pressed.connect(_tap_card.bind(c))
		_grid.add_child(c)
		_card_list.append(c)
	var rows := ceili(float(items.size()) / cols)
	var gh := 6.0 * px + rows * cw * 1.4 + (rows - 1) * gap + 22.0 * px
	_scroll_max = maxf(0.0, gh - body.size.y)
	_scroll = clampf(_scroll, 0.0, _scroll_max)
	_grid.position.y = -_scroll
	sheet.modulate.a = 0.0
	create_tween().tween_property(sheet, "modulate:a", 1.0, 0.3)


func _on_grid(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_scroll_to(_scroll - 40.0 * MenuKit.U)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_scroll_to(_scroll + 40.0 * MenuKit.U)
	var touch: bool = event is InputEventScreenTouch and event.index == 0
	var click: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION
	if touch or click:
		_drag = event.pressed
		_drag_y = event.position.y
		_fling = 0.0
		return
	var moved: bool = (event is InputEventScreenDrag and event.index == 0) or (event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION)
	if moved and _drag:
		var dy: float = event.position.y - _drag_y
		_drag_y = event.position.y
		var dt := maxf(0.001, get_process_delta_time())
		_fling = lerpf(_fling, -dy / dt, 0.5)
		_scroll_to(_scroll - dy)


func _scroll_to(s: float) -> void:
	_scroll = clampf(s, 0.0, _scroll_max)
	if _scroll <= 0.0 or _scroll >= _scroll_max:
		_fling = 0.0
	if _grid != null and is_instance_valid(_grid):
		_grid.position.y = -_scroll


# ------------------------------------------------------------------ odds


func _show_odds() -> void:
	sfx.emit("click", 0)
	var px := MenuKit.PX
	_clear(_odds)
	_odds.size = _vp
	_odds.mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.0, 0.024, 0.047, 0.6)
	dim.size = _vp
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	dim.gui_input.connect(func(e: InputEvent) -> void:
		var up: bool = (e is InputEventScreenTouch and not e.pressed) or (e is InputEventMouseButton and not e.pressed and e.device != InputEvent.DEVICE_ID_EMULATION)
		if up:
			go_back())
	_odds.add_child(dim)
	# two columns on a phone held sideways: the table, and the rules
	var w := minf(780.0 * px, _vp.x - 40.0 * px)
	var pad := 22.0 * px
	var col := (w - pad * 3.0) * 0.5
	var card := UiBox.new(Vector2(w, 10.0), 26.0 * px, 40.0 * px)
	card.p("c_top", Color8(16, 40, 56, 245)).p("c_foot", Color8(6, 20, 30, 250))
	card.p("c_border", HudStyle.STROKE).p("border", 1.0 * px).p("hi", 0.09)
	card.p("c_shadow", Color(0.0, 0.031, 0.055, 0.38)).p("shadow", Vector2(18.0, 50.0) * MenuKit.U)
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	var h2 := MenuKit.words("Odds & rules", "inter", 800, 22.0 * px, HudStyle.INK, 0.0, 1.2)
	h2.position = Vector2(pad, pad)
	card.add_child(h2)
	var y := h2.position.y + h2.size.y + 12.0 * px
	var cx := [0.0, 0.34, 0.56, 0.8]
	var heads := ["RARITY", "CHANCE", "POOL", "DUPLICATE"]
	for i in 4:
		var th := MenuKit.words(heads[i], "inter", 700, 10.0 * px, HudStyle.INK_3, 0.16, 1.2)
		th.position = Vector2(pad + col * cx[i], y)
		card.add_child(th)
	y += 10.0 * px * 1.2 + 6.0 * px
	for r: int in [3, 2, 1, 0]:
		var R: Dictionary = Cosmetics.RARITIES[r]
		var rule := MenuKit.rule(col, HudStyle.STROKE)
		rule.position = Vector2(pad, y)
		card.add_child(rule)
		y += 8.0 * px
		var n := 0
		for it in Cosmetics.pool():
			if int(it.rarity) == r:
				n += 1
		var gem := _Gems.new(1, 9.0 * px * 0.71, R.css)
		var cells := [str(R.name), "%.1f%%" % (float(Cosmetics.ODDS[r]) * 100.0), "%d items" % n, "+" + MenuKit.num(int(R.refund))]
		var ty := y
		for i in 4:
			var t := MenuKit.words(cells[i], "inter", 800 if i == 0 else 500, 13.0 * px, R.css if i == 0 else HudStyle.INK, 0.0, 1.25)
			t.position = Vector2(pad + col * cx[i] + (18.0 * px if i == 0 else 0.0), ty)
			card.add_child(t)
			if i == 0:
				gem.position = Vector2(pad, ty + (t.size.y - gem.size.y) * 0.5)
		card.add_child(gem)
		y += 13.0 * px * 1.25 + 8.0 * px
	var by := y + 14.0 * px
	var legendary := 0
	for it in Cosmetics.of_kind("skin"):
		if int(it.rarity) == 3:
			legendary += 1
	var rules := [
		[["A ", 500], ["Legendary", 700], [" is certain within %d opens, and the odds climb every open after %d." % [Cosmetics.HARD_PITY, Cosmetics.SOFT_PITY], 500]],
		[["An ", 500], ["Epic or better", 700], [" turns up at least once every %d opens, and every ×10 holds one." % Cosmetics.EPIC_PITY, 500]],
		[["Items you don't own yet are three times as likely as ones you do.", 500]],
		[["Duplicates pay back gold. One chest a day is free.", 500]],
		[["%d legendary skins are alive: they move, and they glow after dark." % legendary, 500]],
	]
	var ry := h2.position.y + h2.size.y + 12.0 * px
	var rx := pad * 2.0 + col
	for line: Array in rules:
		var runs := []
		for bit: Array in line:
			runs.append([bit[0], HudStyle.font("inter", bit[1]), roundi(13.0 * px), HudStyle.INK if bit[1] == 700 else HudStyle.INK_2])
		var t := UiText.new(runs, col - 18.0 * px, 1.5)
		t.position = Vector2(rx + 18.0 * px, ry)
		var b := _Dot.new(5.0 * px, HudStyle.INK_3)
		b.position = Vector2(rx + 4.0 * px, ry + t.baseline() - 6.0 * px)
		card.add_child(b)
		card.add_child(t)
		ry += t.size.y + 4.0 * px
	var ok := _button("Got it", true, col, "", 44.0 * px)
	ok.pressed.connect(func() -> void: go_back())
	ok.position = Vector2(rx, maxf(ry + 10.0 * px, by - 44.0 * px))
	card.add_child(ok)
	var ch := maxf(by, ok.position.y + ok.size.y) + pad
	card.resize(Vector2(w, ch))
	card.position = (_vp - card.size) * 0.5
	_odds.add_child(card)
	_odds.visible = true
	card.modulate.a = 0.0
	create_tween().tween_property(card, "modulate:a", 1.0, 0.25)


# ------------------------------------------------------------------ the frame


## Something to do `s` seconds from now (dropped if the vault closes first).
func _after(s: float, f: Callable) -> void:
	_later.append([_t + s, f])


func _process(dt: float) -> void:
	_t += dt
	_view_t += dt
	var i := 0
	while i < _later.size():
		if _t >= float(_later[i][0]):
			var f: Callable = _later[i][1]
			_later.remove_at(i)
			f.call()
		else:
			i += 1
	_step_opening()
	_place_chest()
	if _drag == false and absf(_fling) > 1.0:
		_scroll_to(_scroll + _fling * dt)
		_fling *= exp(-4.0 * dt)
	# the shade deepens behind the cards and the collection
	var want := 1.0 if _view == View.REVEAL or _view == View.COLL else 0.0
	_deep += (want - _deep) * MathX.damp(4.0, dt)
	_shade.set_shader_parameter("rad_in", Color(2.0 / 255.0, 12.0 / 255.0, 20.0 / 255.0, 0.42 * _deep))
	_shade.set_shader_parameter("rad_out", Color(1.0 / 255.0, 8.0 / 255.0, 14.0 / 255.0, 0.8 * _deep))
	# the head dims while the chest opens; the dock slides away off home
	_head.modulate.a = lerpf(_head.modulate.a, 0.35 if _view == View.OPENING else 1.0, MathX.damp(6.0, dt))
	var home := _view == View.HOME
	var k := MathX.damp(8.0 if home else 10.0, dt)
	_dock.modulate.a = lerpf(_dock.modulate.a, 1.0 if home else 0.0, k)
	_dock.position.x = lerpf(_dock.position.x, _dock_x + (0.0 if home else 40.0 * MenuKit.PX), k)
	_dock.visible = _dock.modulate.a > 0.02
	_skip_tag.modulate.a = clampf((_view_t - 1.2) / 0.8, 0.0, 1.0) if _view == View.OPENING else 0.0
	MenuKit.glint(_buy_ten, _t)


## Keys: Esc steps back, Space skips the opening, the arrows step the showcase.
func _unhandled_input(event: InputEvent) -> void:
	if not visible or not event is InputEventKey or not event.pressed:
		return
	var k: int = event.keycode
	if k == KEY_SPACE and is_busy():
		_fast_forward()
	elif _view == View.SHOW and (k == KEY_LEFT or k == KEY_RIGHT):
		_step_show(-1 if k == KEY_LEFT else 1)
	get_viewport().set_input_as_handled()


# ------------------------------------------------------------------ the pieces


## A thin meter, filled `k` of the way in gold.
class _Meter:
	extends Control
	var k := 0.0

	func _init(sz: Vector2, p_k: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = sz
		k = clampf(p_k, 0.0, 1.0)

	func _draw() -> void:
		var r := size.y * 0.5
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0, 0, 0, 0.35)
		sb.set_corner_radius_all(int(r))
		sb.border_color = Color(1, 1, 1, 0.06)
		sb.set_border_width_all(1)
		sb.anti_aliasing = true
		draw_style_box(sb, Rect2(Vector2.ZERO, size))
		if k <= 0.0:
			return
		var w := maxf(size.y, size.x * k)
		CosArt._sprites()
		draw_texture_rect(CosArt._glow, Rect2(Vector2(-r * 2.0, -r * 2.0), Vector2(w + r * 4.0, size.y + r * 4.0)), false, Color(1.0, 0.745, 0.24, 0.35))
		var pts := PackedVector2Array()
		var cols := PackedColorArray()
		var stops := [Color("#e0701a"), Color("#ffbe3d"), Color("#fff0b5")]
		for i in 3:
			var x := w * i / 2.0
			pts.append_array([Vector2(x, 0.0), Vector2(x, size.y)])
			cols.append_array([stops[i], stops[i]])
		var inner := StyleBoxFlat.new()
		inner.bg_color = Color.WHITE
		inner.set_corner_radius_all(int(r))
		inner.anti_aliasing = true
		# the gradient, clipped round at its ends
		var g := Gradient.new()
		g.offsets = PackedFloat32Array([0.0, 0.5, 1.0])
		g.colors = PackedColorArray(stops)
		for i in 2:
			var a := Vector2(w * i / 2.0, 0.0)
			var b := Vector2(w * (i + 1) / 2.0, size.y)
			draw_polygon(PackedVector2Array([Vector2(maxf(a.x, r * 0.5), 0.0), Vector2(minf(b.x, w - r * 0.5), 0.0), Vector2(minf(b.x, w - r * 0.5), size.y), Vector2(maxf(a.x, r * 0.5), size.y)]),
					PackedColorArray([stops[i], stops[i + 1], stops[i + 1], stops[i]]))
		draw_circle(Vector2(r, r), r, stops[0], true, -1.0, true)
		draw_circle(Vector2(w - r, r), r, stops[2], true, -1.0, true)


## A little round dot (a live pulse, a bullet).
class _Dot:
	extends Control
	var col := Color.WHITE
	var _t := 0.0

	func _init(d: float, c: Color) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = Vector2(d, d)
		col = c

	func _process(dt: float) -> void:
		_t += dt
		queue_redraw()

	func _draw() -> void:
		var r := size.x * 0.5
		var a := 1.0 if col == HudStyle.INK_3 else 0.35 + 0.65 * (0.5 + 0.5 * cos(_t * TAU / 1.6))
		CosArt._sprites()
		if col == HudStyle.AQUA:
			draw_texture_rect(CosArt._glow, Rect2(Vector2(-r * 2.0, -r * 2.0), size + Vector2(r, r) * 4.0), false, Color(col, 0.6 * a))
		draw_circle(Vector2(r, r), r, Color(col, col.a * a), true, -1.0, true)


## A rarity's gems (VaultCard's), for the odds table.
class _Gems:
	extends VaultCard._Gems


## The little arrow under the chest's tag.
class _Notch:
	extends Control

	func _init(d: float) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = Vector2(d, d)

	func _draw() -> void:
		var d := size.x
		draw_colored_polygon(PackedVector2Array([Vector2(0, 0), Vector2(d, 0), Vector2(d * 0.5, d * 0.5)]), Color8(6, 18, 28, 230))
		draw_polyline(PackedVector2Array([Vector2(0, 0), Vector2(d * 0.5, d * 0.5), Vector2(d, 0)]), Color8(244, 199, 101, 115), maxf(1.0, MenuKit.PX * 0.6), true)


## The flash of the chest's light over the screen: a radial bloom of the
## rarity's colour round the chest (a big one with a white wash first).
class _Flash:
	extends Control
	var tint := Color("#ffbe3d")
	var _at := Vector2.ZERO
	var _t := -1.0
	var _big := false

	func _init(vp: Vector2) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = vp
		CosArt._sprites()

	func go(at: Vector2, big: bool) -> void:
		_at = at
		_big = big
		_t = 0.0

	func _process(dt: float) -> void:
		if _t < 0.0:
			return
		_t += dt
		if _t > (1.2 if _big else 0.55):
			_t = -1.0
		queue_redraw()

	func _draw() -> void:
		if _t < 0.0:
			return
		var dur := 1.2 if _big else 0.55
		var k := _t / dur
		var a := (1.0 if _big else 0.8) * (1.0 - k) * (1.0 - k * 0.3)
		if _big and k < 0.25:
			draw_rect(Rect2(Vector2.ZERO, size), Color(1.0, 0.98, 0.91, 0.6 * (1.0 - k / 0.25) * a))
		var r := maxf(size.x, size.y) * 0.58
		var c := tint.lerp(Color.WHITE, 0.4)
		draw_texture_rect(CosArt._warm, Rect2(_at - Vector2(r, r), Vector2(r, r) * 2.0), false, Color(tint, 0.5 * a))
		var r2 := r * 0.35
		draw_texture_rect(CosArt._glow, Rect2(_at - Vector2(r2, r2), Vector2(r2, r2) * 2.0), false, Color(c, a))


## Sparks and coins over the screen (the web's Sparkles): bursts of the
## rarity's sparks, the big ones crossed with a star's rays, and gold coins
## tumbling out and falling.
class _Sparkles:
	extends Control
	var _ms: Array = []
	var _add: Control

	func _init(vp: Vector2) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = vp
		CosArt._sprites()
		_add = Control.new()
		_add.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_add.size = vp
		var m := CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		_add.material = m
		_add.draw.connect(_draw_sparks)
		add_child(_add)

	## n sparks from `at` in colour c, and `coins` coins; `speed` scales their flight.
	func burst(at: Vector2, c: Color, n: int, coins: int, speed: float) -> void:
		var px := MenuKit.PX
		for i in n:
			var a := randf() * TAU
			var sp := (120.0 + randf() * 480.0) * speed * px
			# [x, y, vx, vy, life, max, size, colour, kind, rot, spin]
			_ms.append([at.x, at.y, cos(a) * sp, sin(a) * sp - 120.0 * px, 0.0, 0.5 + randf() * 0.8, (1.4 + randf() * 2.8) * px, c, 0, 0.0, 0.0])
		for i in coins:
			var a := -PI * 0.5 + (randf() - 0.5) * 1.8
			var sp := (300.0 + randf() * 520.0) * px
			_ms.append([at.x, at.y, cos(a) * sp, sin(a) * sp, 0.0, 1.3 + randf() * 0.7, (5.0 + randf() * 4.0) * px, Color("#f6c766"), 2, randf() * 6.0, (randf() - 0.5) * 18.0])

	func _process(dt: float) -> void:
		if _ms.is_empty():
			return
		dt = minf(dt, 0.05)
		var px := MenuKit.PX
		for i in range(_ms.size() - 1, -1, -1):
			var m: Array = _ms[i]
			m[4] += dt
			if m[4] >= m[5]:
				_ms.remove_at(i)
				continue
			if m[8] == 0:
				m[2] *= exp(-2.4 * dt)
				m[3] = m[3] * exp(-2.4 * dt) + 260.0 * px * dt
			else:
				m[3] += 900.0 * px * dt
				m[9] += m[10] * dt
			m[0] += m[2] * dt
			m[1] += m[3] * dt
		queue_redraw()
		_add.queue_redraw()

	# the coins, laid over the scene
	func _draw() -> void:
		for m: Array in _ms:
			if m[8] != 2:
				continue
			var t: float = m[4] / m[5]
			var a := 1.0 - t * t
			var s: float = m[6]
			var sx := absf(cos(m[9]))
			var at := Vector2(m[0], m[1])
			draw_set_transform(at, 0.0, Vector2(maxf(0.08, sx), 1.0))
			draw_circle(Vector2.ZERO, s, Color(0.66, 0.42, 0.11, a), true, -1.0, true)
			draw_circle(Vector2(-s * 0.12, -s * 0.12), s * 0.82, Color(0.945, 0.765, 0.36, a), true, -1.0, true)
			draw_circle(Vector2(-s * 0.3, -s * 0.3), s * 0.35, Color(1.0, 0.965, 0.81, a * 0.9), true, -1.0, true)
		draw_set_transform(Vector2.ZERO)

	# the sparks, added to the light
	func _draw_sparks() -> void:
		for m: Array in _ms:
			if m[8] != 0:
				continue
			var t: float = m[4] / m[5]
			var a := 1.0 - t * t
			var s: float = m[6] * (1.0 - t * 0.6)
			var c: Color = m[7]
			var at := Vector2(m[0], m[1])
			_add.draw_texture_rect(CosArt._dot, Rect2(at - Vector2(s, s), Vector2(s, s) * 2.0), false, Color(c, a))
			if m[6] > 3.0 * MenuKit.PX:
				var l: float = m[6] * 3.0
				var th := 1.2 * MenuKit.PX
				_add.draw_rect(Rect2(at.x - l, at.y - th * 0.5, l * 2.0, th), Color(c, a))
				_add.draw_rect(Rect2(at.x - th * 0.5, at.y - l, th, l * 2.0), Color(c, a))
