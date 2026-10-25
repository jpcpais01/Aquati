class_name MarketPanel
extends CanvasLayer
## The trading port's market (the web's MarketUI), laid out as the web lays
## it out on a phone held sideways: a card down the right of the screen that
## leaves the quay and its porters in view. Your hold is on its counter,
## finest first, each lot at what it fetches here today with a Sell of its
## own (the prices drift while you watch, and flash as they change), and
## Sell everything under them; the chandlery mends the hull and fills the
## racks of special shot; the shipwright has three parts in today, paid for
## from your purse; Cast off puts to sea. A sale's gold flies into the purse
## in coins, and the purse counts it up. The card's body scrolls under a
## finger, each section's name pinned to its top while the goods pass under
## it.
##
## Alongside a merchantman (Convoys) the same card is her counter: your hold
## sells at her house's prices, and her cargo is laid out under it to buy
## (no chandlery, no stalls, no shipwright out at sea).
##
## At sea, off a quay's seaward face, the prompt to come alongside sits at
## the foot of the screen (a tap on it, or F, docks), saying what's to be had
## there, or why not while pirates are on her tail.

signal sell(id: String)
signal sell_all
signal repair
signal restock
## A part bought from the shipwright.
signal buy_part(id: String)
## A rocket bought off the pyrotechnist's stall (Fireworks.ORDER).
signal buy_firework(id: String)
## One of a lot bought off a merchantman's counter.
signal buy_ware(id: String)
## The harbour master's: a ship and her crew signed on, or one of yours paid off.
signal hire(id: String)
signal pay_off(id: String)
signal leave
## The prompt tapped while she may come alongside.
signal dock
signal clicked

const PX := MenuKit.PX
const U := MenuKit.U
const T := MenuKit.T
const K := HudStyle.K
## A price going up, down or holding (the web's .up, .down, .even).
const UP := Color("#7fe08e")
const DOWN := Color("#ff8a78")
## The card's fill, top to foot, and the band a section's name sits on.
const CARD_TOP := Color(0.047, 0.125, 0.173, 0.94)
const CARD_FOOT := Color(0.024, 0.071, 0.11, 0.92)
const BAND := Color(0.043, 0.114, 0.157)
## The purse's and the Sells' wash of gold, and their edges.
const WASH := Color(0.957, 0.78, 0.396, 0.12)
const EDGE := Color(0.957, 0.78, 0.396, 0.4)
## Seconds the card takes to slide in, a row to come in or fold away, a
## price's flash, the purse's bump and the prompt's rise.
const CARD_IN := 0.55
const ROW_IN := 0.45
const ROW_OUT := 0.35
const TICK := 0.6
const BUMP := 0.5
const PROMPT_IN := 0.3
## Seconds a part just bought swells and rings for (the web's mk-bought).
const BOUGHT := 0.9
## What a part does, for the better and the worse.
const GOOD := Color("#c9f2c4")
const BAD := Color("#ffbcb2")

## The touch layout: no key hints, and the prompt at the very foot of the screen.
var touch := false

var _root: Control
var _holder: Control
var _fx: Control
var _card: UiBox
## Where the card rests once it has slid in.
var _rest := Vector2.ZERO
var _purse: UiBox
var _purse_coin: TextureRect
var _purse_n: UiText
var _body: Control
var _content: Control
var _list: Control
var _below: Control
var _bands: Array[UiBox] = []
var _room: UiText
var _empty: Control
var _all: UiButton
var _all_coin: TextureRect
var _all_v: UiText
var _fix: _Svc
var _shot: _Svc
## The shipwright's counter: its parts and the note under them, and the
## purse on its band.
var _wright: Control
var _prows: Array[_PRow] = []
## The pyrotechnist's stall: today's rockets ([{id, price, owned, room}]) on rows.
var _pyro: Control
var _frows: Array[_PRow] = []
var _pyro_offers: Array = []
var _pyro_h := 0.0
## Alongside a merchantman: her cargo ([{id, n, price, deal, room}]) is
## laid on the stall's shelf instead, under HER CARGO.
var _trader := false
var _wares: Array = []
var _bare: UiText
var _wnote: UiText
var _wp_coin: TextureRect
## The harbour master's desk: your escorts and the ships for hire.
var _crew: Control
var _hrows: Array[_PRow] = []
var _hands: Array = []
var _crew_h := 0.0
var _crew_n: UiText
var _wp_n: UiText
var _fade: TextureRect
var _leave: UiButton
var _rows := {}
var _flying: Array[_Fly] = []

## The card's measures for this screen: the gutter, its inner width, a row's
## width and height, a section band's height, where the list starts, and
## (from the top of what's below the list) where the chandlery's services sit.
var _gx := 0.0
var _iw := 0.0
var _rw := 0.0
var _row_h := 0.0
var _band_h := 0.0
var _list_y := 0.0
var _yard_y := 0.0
var _svc_h := 0.0
## How tall the shipwright's counter is, its parts and the note.
var _wright_h := 0.0
## Where what's below the list is going (it follows the list as it closes up).
var _below_to := 0.0

var _open := false
var _title := ""
var _market: Treasure.Market
var _hold: Treasure.Hold
var _gold := 0
var _shown := 0.0
var _time := 0.0
var _price_t := 0.0
## The chandlery: repair's price and the hull it mends, the shot's price and the broadsides it buys.
var _svc := PackedInt32Array([0, 0, 0, 0])
## The shipwright's parts today ([{part, owned}]) and the purse they're paid from.
var _offers: Array = []
var _ppurse := 0
## Seconds since the card came up; the purse's bump (s into it, < 0 waiting
## for the coins to land); the list laid out afresh this long from now (< 0 not).
var _t := 0.0
var _bump := 0.0
var _bumping := false
var _render_in := -1.0
## The scroll (units down the body), how far it can go and its fling
## (units/s); a finger or the mouse down on the body, where, and whether
## it's scrolling yet.
var _scroll := 0.0
var _scroll_max := 0.0
var _fling := 0.0
var _down := false
var _from := Vector2.ZERO
var _last := Vector2.ZERO
var _last_ms := 0
var _dragging := false

## The prompt to come alongside: its pill, the key for it, the line above
## it; what it says (its key, and as given), whether she may, where it rests
## and how long since it came up (< 0: down).
var _prompt: UiButton
var _p_why: Label
var _p_look: LabelSettings
var _p_state := ""
var _p_dict := {}
var _p_ok := false
var _p_y := 0.0
## The helmsman's pill is up in the bottom middle (this tall; 0: down): the prompt steps up over it.
var _pill_h := 0.0
var _p_t := -1.0


func _ready() -> void:
	layer = 6
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	_holder = Control.new()
	_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_holder)
	_prompt = UiButton.new(Vector2(10.0, 10.0), 5.0, 50.0)
	# a tap on it goes no further (the helm and the guns are under it)
	_prompt.mouse_filter = Control.MOUSE_FILTER_STOP
	_prompt.visible = false
	_prompt.pressed.connect(func() -> void:
		if _p_ok:
			dock.emit())
	_root.add_child(_prompt)
	_p_look = _caption_look(maxf(9.0 * PX, 10.0 * K))
	_fx = Control.new()
	_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_fx)
	get_viewport().size_changed.connect(_on_resize)
	_on_resize()


func _on_resize() -> void:
	_root.size = get_viewport().get_visible_rect().size
	if _open:
		_build()
		_render(false)
	if not _p_dict.is_empty():
		_lay_prompt()


## Touch or keys: the key hints go, and the prompt moves to the foot of the screen.
func set_touch(on: bool) -> void:
	if on == touch:
		return
	touch = on
	_on_resize()


## The line over the town's name (a feast night says so).
var kicker := "TRADING PORT"


## The market opens on `title`'s counter: `market`'s prices for `hold`, with
## `gold` in the purse, at the sea's clock `t`.
## With `wares` (a merchantman's cargo, see set_wares) it's her counter.
func open(title: String, market: Treasure.Market, hold: Treasure.Hold, gold: int, t: float, wares: Variant = null) -> void:
	_trader = wares != null
	_wares = wares if wares != null else []
	_title = title
	_market = market
	_hold = hold
	_gold = gold
	_shown = gold
	_time = t
	_price_t = 0.0
	_scroll = 0.0
	_fling = 0.0
	_t = 0.0
	_bumping = false
	_render_in = -1.0
	_open = true
	_build()
	_render(true)
	_step(0.0)


func close() -> void:
	if not _open:
		return
	_open = false
	_release()
	_clear_fly()
	_render_in = -1.0
	if _card != null:
		_holder.remove_child(_card)
		_card.queue_free()
		_card = null
	_rows.clear()
	_prows.clear()
	_frows.clear()
	_hrows.clear()
	_offers = []
	_trader = false
	_wares = []


func is_open() -> bool:
	return _open


## Scrolls the shipwright's counter up to the top of the card.
func show_wright() -> void:
	if _card == null or _prows.is_empty():
		return
	_step(0.0)
	_fling = 0.0
	_scroll_to(_below.position.y + _wright.position.y - _band_h - 2.0 * PX)


## Scrolls the pyrotechnist's stall up to the top of the card.
func show_pyro() -> void:
	if _card == null or _frows.is_empty():
		return
	_step(0.0)
	_fling = 0.0
	_scroll_to(_below.position.y + _pyro.position.y - _band_h - 2.0 * PX)


## Scrolls the harbour master's desk up to the top of the card.
func show_hands() -> void:
	if _card == null or _hrows.is_empty():
		return
	_step(0.0)
	_fling = 0.0
	_scroll_to(_below.position.y + _crew.position.y - _band_h - 2.0 * PX)


## Whether the prompt to come alongside is up, and she may.
func prompt_ok() -> bool:
	return _prompt.visible and _p_ok


## Where the card rests (canvas units), so the camera can keep her in the
## space it leaves; nothing while it's shut.
func panel_rect() -> Rect2:
	if not _open or _card == null:
		return Rect2()
	return Rect2(_rest, _card.size)


## What the chandlery would charge to mend `repair_hp` of hull and to fill
## `shot_n` broadsides of special shot (0: nothing to do).
func set_services(repair_cost: int, repair_hp: int, shot_cost: int, shot_n: int) -> void:
	_svc = PackedInt32Array([repair_cost, repair_hp, shot_cost, shot_n])
	_apply_services()


## What's in the purse: it counts up (or down) to it.
func set_gold(g: int) -> void:
	_gold = g
	_apply_services()
	_fill_pyro()
	for i in mini(_hands.size(), _hrows.size()):
		_hrows[i].set_hand(_hands[i], _gold)


## The pyrotechnist's stall: today's rockets ([{id, price, owned, room}]),
## each with how many the locker holds; `bought`, one just bought, swells
## and rings. The same rockets again stay put, each brought up to date.
func set_pyro(offers: Array, bought := "") -> void:
	var same := offers.size() == _frows.size()
	for i in mini(offers.size(), _frows.size()):
		same = same and str(offers[i].id) == _frows[i].id
	_pyro_offers = offers
	if _card == null:
		return
	if same:
		_fill_pyro()
	else:
		_build_pyro(true)
	for r in _frows:
		if r.id == bought:
			r.t_just = 0.0


## A merchantman's cargo: each lot ({id, n, price, deal, room}) at her
## asking price, against the fair one; `bought`, one just bought, swells and
## rings. The same lots again stay put, each brought up to date.
func set_wares(offers: Array, bought := "") -> void:
	var same := offers.size() == _frows.size()
	for i in mini(offers.size(), _frows.size()):
		same = same and str(offers[i].id) == _frows[i].id
	_wares = offers
	if _card == null or not _trader:
		return
	if same:
		_fill_pyro()
	else:
		_build_pyro(true)
	for r in _frows:
		if r.id == bought:
			r.t_just = 0.0


## The shipwright's counter: today's parts ([{part, owned}]) and what's in
## the purse they're paid from; `bought`, one just bought, swells and rings.
## The same parts again stay put, each brought up to date.
func set_parts(offers: Array, purse: int, bought := "") -> void:
	var same := offers.size() == _prows.size()
	for i in mini(offers.size(), _prows.size()):
		same = same and str(offers[i].part.id) == _prows[i].id
	_offers = offers
	_ppurse = purse
	if _card == null:
		return
	if same:
		_fill_wright()
	else:
		_build_wright(true)
	for r in _prows:
		if r.id == bought:
			r.t_just = 0.0


## The harbour master's desk: your escorts ({id, mine: true, name, cls,
## master, chip}) to pay off, then the ships for hire ({..., mine: false,
## price, can}); `full` when the fleet has no room for another.
func set_hands(list: Array, fleet_n: int) -> void:
	_hands = list
	if _card == null:
		return
	_build_crew(fleet_n)


## The hold changed under the counter (a lot bought): its rows laid out afresh.
func restock_hold() -> void:
	if _open:
		_render(false)


## A lot sold for `value`: its row flies coins into the purse and folds away.
func sold(id: String, value: int) -> void:
	var r: _Row = _rows.get(id)
	if r == null or r.folding:
		_render(false)
		return
	r.fold(0.0, mini(9, 3 + floori(log(1.0 + value / 40.0) / log(2.0))))
	_render_in = 0.38


## The whole hold sold for `value`: the rows fold away one after another,
## each flying its coins, and a shower more off Sell everything.
func sold_all(value: int) -> void:
	var rows := _ordered()
	for i in rows.size():
		rows[i].fold(i * 0.07, 4)
	if _all != null:
		_coins(_all.get_global_rect(), mini(14, 6 + floori(log(1.0 + value / 200.0) / log(2.0))))
	_render_in = rows.size() * 0.07 + 0.38


## A frame of the market: the purse counts towards what it holds, and the
## prices are read afresh once a second at the sea's clock `t`.
func tick(dt: float, t: float) -> void:
	if not _open:
		return
	_time = t
	if _shown != _gold:
		var d := _gold - _shown
		_shown = float(_gold) if absf(d) < 1.0 else _shown + d * minf(1.0, dt * 6.0)
		var s := MenuKit.num(roundi(_shown))
		if _purse_n != null and str(_purse_n.runs[0][0]) != s:
			_purse_n.set_text(s)
			_lay_purse()
	_price_t += dt
	if _price_t > 1.0:
		_price_t = 0.0
		_prices()


# ------------------------------------------------------------------ the card

func _build() -> void:
	if _card != null:
		_holder.remove_child(_card)
		_card.queue_free()
	_rows.clear()
	_bands.clear()
	_clear_fly()
	_release()
	var vp := get_viewport().get_visible_rect().size
	var w := minf(380.0 * PX, vp.x * 0.46)
	var h := vp.y * 0.94
	_rest = Vector2(vp.x * 0.97 - w, vp.y * 0.03)
	_card = UiBox.new(Vector2(w, h), 26.0 * PX, 135.0)
	_card.mouse_filter = Control.MOUSE_FILTER_STOP
	_card.p("c_top", CARD_TOP).p("c_foot", CARD_FOOT).p("c_border", HudStyle.STROKE_2).p("hi", 0.09)
	_card.p("c_shadow", Color(0.0, 0.031, 0.055, 0.38)).p("shadow", Vector2(18.0, 50.0) * PX)
	_card.position = _rest
	_holder.add_child(_card)

	# the head: a trading port and its name, and the purse
	var x0 := 14.0 * PX
	var y0 := 10.0 * PX
	var kick := _words(kicker, 700, 10.0, HudStyle.GOLD, 0.22)
	kick.position = Vector2(x0, y0)
	_card.add_child(kick)
	var name_lh := 18.0 * 1.1 * PX
	var nm := MenuKit.words(_title, "cinzel", 700, 18.0 * PX, HudStyle.INK, 0.04, 1.1)
	MenuKit.line_at(nm, x0, y0 + kick.size.y + 1.0 * PX, name_lh)
	_card.add_child(nm)
	var head_h := kick.size.y + 1.0 * PX + name_lh + 2.0 * PX
	var ph := 30.0 * PX
	_purse = UiBox.new(Vector2(ph, ph), ph * 0.5, 4.0)
	MenuKit.flat(_purse)
	_purse.p("c_top", WASH).p("c_foot", WASH).p("c_border", EDGE).p("hi", 0.0)
	_purse_coin = Icons.rect("coin", 16.0 * PX * 1.5)
	_purse.add_child(_purse_coin)
	_purse_n = _words(MenuKit.num(roundi(_shown)), 800, 14.0, HudStyle.GOLD_HI, 0.0, true)
	_purse.add_child(_purse_n)
	_card.add_child(_purse)
	_lay_purse()
	nm.cut_to(maxf(40.0, _purse.position.x - 12.0 * PX - x0))

	# the foot: Cast off
	var fh := 38.0 * PX
	_leave = _cast_off(fh)
	_leave.position = Vector2((w - _leave.size.x) * 0.5, h - 8.0 * PX - fh)
	_leave.pressed.connect(func() -> void:
		clicked.emit()
		leave.emit())
	_card.add_child(_leave)

	# the body between them, everything in it scrolling as one
	var by := y0 + head_h + 6.0 * PX
	_body = Control.new()
	_body.clip_contents = true
	_body.mouse_filter = Control.MOUSE_FILTER_STOP
	_body.position = Vector2(1.0, by)
	_body.size = Vector2(w - 2.0, _leave.position.y - 6.0 * PX - by)
	_body.gui_input.connect(_on_body)
	_card.add_child(_body)
	_content = Control.new()
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.size = Vector2(_body.size.x, _body.size.y)
	_body.add_child(_content)
	_gx = 10.0 * PX - 1.0
	_iw = w - 20.0 * PX - 2.0
	_rw = _iw - 4.0 * PX
	_row_h = 58.0 * PX
	var lf := HudStyle.font("inter", 700)
	var lsz := roundi(10.0 * PX)
	_band_h = 16.0 * PX + lf.get_ascent(lsz) + lf.get_descent(lsz)
	_list_y = _band_h + 2.0 * PX
	_list = Control.new()
	_list.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_list.position = Vector2(_gx + 2.0 * PX, _list_y)
	_content.add_child(_list)
	_empty = _empty_box(_rw)
	_empty.position = Vector2(0.0, 2.0 * PX)
	_list.add_child(_empty)

	# below the list: Sell everything, and the chandlery
	_below = Control.new()
	_below.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_below.position = Vector2(_gx, _list_y)
	_content.add_child(_below)
	var ah := 42.0 * PX
	_all = UiButton.new(Vector2(_iw, ah), ah * 0.5, 46.0 * U)
	HudStyle.gold(_all, U)
	var all_l := MenuKit.words("SELL EVERYTHING", "inter", 800, 16.0 * T, HudStyle.GOLD_INK, 0.1)
	MenuKit.line_at(all_l, 22.0 * PX, 0.0, ah)
	_all.add_child(all_l)
	_all_coin = Icons.rect("coin", 16.0 * PX * 1.5)
	_all.add_child(_all_coin)
	var vf := HudStyle.tnum(HudStyle.font("inter", 800, roundi(0.02 * 16.0 * T)))
	_all_v = UiText.new([["0", vf, roundi(16.0 * T), HudStyle.GOLD_INK]], 0.0, 1.0)
	_all.add_child(_all_v)
	_all.pressed.connect(func() -> void:
		clicked.emit()
		sell_all.emit())
	_below.add_child(_all)
	_lay_all()
	_yard_y = ah + 6.0 * PX + _band_h + 2.0 * PX
	var sw := (_iw - 8.0 * PX) * 0.5
	_fix = _Svc.new("hammer", "Repair the hull", sw)
	_fix.position = Vector2(0.0, _yard_y)
	_fix.pressed.connect(func() -> void:
		clicked.emit()
		repair.emit())
	_below.add_child(_fix)
	_shot = _Svc.new("shot", "Restock the shot", sw)
	_shot.position = Vector2(sw + 8.0 * PX, _yard_y)
	_shot.pressed.connect(func() -> void:
		clicked.emit()
		restock.emit())
	_below.add_child(_shot)

	# the pyrotechnist's stall under the chandlery: today's rockets
	_pyro = Control.new()
	_pyro.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_below.add_child(_pyro)
	_frows.clear()
	# (a merchantman's bought out: her hold is bare)
	_bare = UiText.new([["Her hold is bare. ", HudStyle.font("inter", 700), roundi(12.0 * PX), HudStyle.INK_2], ["You have bought everything she was carrying.", HudStyle.font("inter", 500), roundi(12.0 * PX), HudStyle.INK_3]], _iw - 4.0 * PX, 1.4)
	_bare.position = Vector2(2.0 * PX, 4.0 * PX)
	_bare.visible = false
	_pyro.add_child(_bare)
	_fix.visible = not _trader
	_shot.visible = not _trader

	# the shipwright's counter under that: today's parts, and a note
	_wright = Control.new()
	_wright.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_below.add_child(_wright)
	_wnote = UiText.new([["Paid from your purse. New parts are fitted at the Shipwright before your next voyage.", HudStyle.font("inter", 500), roundi(10.5 * PX), HudStyle.INK_3]], _iw - 4.0 * PX, 1.4)
	_wright.add_child(_wnote)
	_prows.clear()

	# the sections' names, over everything they pin above
	var hold_band := _band("YOUR HOLD")
	_room = _words("", 700, 10.0, HudStyle.INK_2, 0.08)
	hold_band.add_child(_room)
	_content.add_child(hold_band)
	_bands.append(hold_band)
	var yard_band := _band("CHANDLERY")
	_content.add_child(yard_band)
	_bands.append(yard_band)
	# (the stall's name drawn under the shipwright's, which pins over it)
	var pyro_band := _band("HER CARGO" if _trader else "PYROTECHNIST")
	var pyro_note := _words("BUY HERE, SELL DEAR IN PORT" if _trader else "ROCKETS FOR YOUR FIREWORK LOCKER", 700, 9.0, HudStyle.INK_4, 0.12)
	pyro_note.position = Vector2(pyro_band.size.x - _gx - 6.0 * PX - pyro_note.size.x, 8.0 * PX + 1.0 * PX)
	pyro_band.add_child(pyro_note)
	_content.add_child(pyro_band)
	var wright_band := _band("SHIPWRIGHT")
	_wp_coin = Icons.rect("coin", 11.0 * PX * 1.5)
	wright_band.add_child(_wp_coin)
	_wp_n = _words("0", 700, 10.0, HudStyle.GOLD_HI, 0.22, true)
	wright_band.add_child(_wp_n)
	_content.add_child(wright_band)
	_bands.append(wright_band)
	_bands.append(pyro_band)
	# and the harbour master's desk at the foot: your escorts, and ships for hire
	_crew = Control.new()
	_crew.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_below.add_child(_crew)
	_hrows.clear()
	var crew_band := _band("HARBOUR MASTER")
	_crew_n = _words("", 700, 9.0, HudStyle.INK_4, 0.12)
	crew_band.add_child(_crew_n)
	_content.add_child(crew_band)
	_bands.append(crew_band)
	_build_pyro(false)
	_build_wright(false)
	_build_crew(-1)
	_apply_services()

	# the body's foot fades while there's more below
	_fade = TextureRect.new()
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var g := Gradient.new()
	var foot := CARD_TOP.lerp(CARD_FOOT, clampf((_body.position.y + _body.size.y) / h, 0.0, 1.0))
	g.set_color(0, Color(foot, 0.0))
	g.set_color(1, Color(foot, 0.92))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill_from = Vector2(0.0, 0.0)
	gt.fill_to = Vector2(0.0, 1.0)
	gt.width = 4
	gt.height = 64
	_fade.texture = gt
	_fade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_fade.stretch_mode = TextureRect.STRETCH_SCALE
	_fade.size = Vector2(_body.size.x, 28.0 * PX)
	_fade.position = Vector2(0.0, _body.size.y - _fade.size.y)
	_body.add_child(_fade)


## Lays the hold out on the counter, finest first: a row for each lot (new
## ones coming in one after another when `enter`), or the empty hold; and
## what's below the list follows to where it now ends.
func _render(enter: bool) -> void:
	if _card == null:
		return
	var items: Array = _hold.list() if _hold != null else []
	var have := {}
	for lot: Array in items:
		have[lot[0]] = lot[1]
	for id: String in _rows.keys():
		var gone: _Row = _rows[id]
		if int(have.get(id, 0)) != gone.n:
			_rows.erase(id)
			_list.remove_child(gone)
			gone.queue_free()
	var y := 2.0 * PX
	for i in items.size():
		var id: String = items[i][0]
		var r: _Row = _rows.get(id)
		if r == null:
			r = _Row.new(id, int(items[i][1]), _rw)
			r.sell_btn.pressed.connect(_on_sell.bind(id))
			_list.add_child(r)
			_rows[id] = r
			r.y_now = y
			r.t_in = -minf(i, 5) * 0.04 if enter else ROW_IN
		r.y_to = y
		y += _row_h + 6.0 * PX
	_empty.visible = items.is_empty()
	var list_h := 4.0 * PX + (_empty.size.y if items.is_empty() else items.size() * _row_h + (items.size() - 1) * 6.0 * PX)
	_below_to = _list_y + list_h + 6.0 * PX
	if enter:
		_below.position.y = _below_to
	if _hold != null:
		_room.set_text("%d / %d ROOM" % [_hold.used(), _hold.capacity])
		_room.position = Vector2(_bands[0].size.x - _gx - 6.0 * PX - _room.size.x, 8.0 * PX)
	_dull_all(items.is_empty())
	_prices(true)


## Today's prices on every row (each one that changed flashes, unless
## `force`), and what the whole hold would fetch on Sell everything.
func _prices(force := false) -> void:
	if _market == null or _hold == null or _card == null:
		return
	var total := 0
	for lot: Array in _hold.list():
		var id: String = lot[0]
		var n: int = lot[1]
		var p := _market.price(id, _time)
		total += p * n
		var r: _Row = _rows.get(id)
		if r == null or r.folding:
			continue
		var now := MenuKit.num(p * n)
		if now == r.shown and not force:
			continue
		var tr := _market.trend(id, _time)
		var ink := HudStyle.INK_3 if absf(tr) < 0.03 else (UP if tr > 0.0 else DOWN)
		var was := r.shown
		r.set_price(now, ("%s each · " % MenuKit.num(p)) if n > 1 else "", tr >= 0.0, " %d%%" % absi(floori(tr * 100.0 + 0.5)), ink)
		if not force and was != "":
			r.t_tick = 0.0
	_all_v.set_text(MenuKit.num(total))
	_lay_all()


func _apply_services() -> void:
	if _fix == null or _card == null:
		return
	var rc := _svc[0]
	var sc := _svc[2]
	var h1 := _fix.lay(("Patch %s hull" % MenuKit.num(_svc[1])) if rc > 0 else "Sound as a bell", MenuKit.num(rc) if rc > 0 else "—", rc <= 0, rc > 0 and rc <= _gold)
	var h2 := _shot.lay(("%d broadsides of special shot" % _svc[3]) if sc > 0 else "The racks are full", MenuKit.num(sc) if sc > 0 else "—", sc <= 0, sc > 0 and sc <= _gold)
	_svc_h = maxf(h1, h2)
	_fix.resize(Vector2(_fix.size.x, _svc_h))
	_shot.resize(Vector2(_shot.size.x, _svc_h))
	_lay_wright()


## The shipwright's parts laid on the counter afresh (coming in one after
## another when `enter`).
func _build_wright(enter: bool) -> void:
	if _wright == null:
		return
	for r in _prows:
		_wright.remove_child(r)
		r.queue_free()
	_prows.clear()
	for i in _offers.size():
		var r := _PRow.new(_offers[i].part, _iw)
		r.buy_btn.pressed.connect(_on_buy.bind(r))
		r.t_in = -minf(i, 5) * 0.04 if enter else ROW_IN
		_wright.add_child(r)
		_prows.append(r)
	_fill_wright()
	for r in _prows:
		_step_prow(r, 0.0)


## Each part's Buy as things stand (Owned, or dimmed while the purse won't
## stretch to it), and the purse on the band.
func _fill_wright() -> void:
	for i in mini(_offers.size(), _prows.size()):
		var o: Dictionary = _offers[i]
		var owned := bool(o.owned)
		_prows[i].set_state(owned, not owned and _ppurse >= int(Parts.RARITIES[o.part.tier].price))
	_lay_wright()
	if _wp_n == null:
		return
	_wp_n.set_text(MenuKit.num(_ppurse))
	var b := _bands[2]
	_wp_n.position = Vector2(b.size.x - _gx - 6.0 * PX - _wp_n.size.x, 8.0 * PX)
	var d := 11.0 * PX
	_wp_coin.position = Vector2(_wp_n.position.x - 5.0 * PX - d * 0.5, _wp_n.position.y + _wp_n.size.y * 0.5) - _wp_coin.size * 0.5


## The counter under the chandlery: its parts one under another, the note
## under them; nothing while the shipwright has nothing in.
func _lay_wright() -> void:
	if _wright == null:
		return
	# (alongside a merchantman her cargo comes straight under Sell everything)
	var top0 := (_yard_y - _band_h - 2.0 * PX) if _trader else (_yard_y + _svc_h + 6.0 * PX)
	_pyro.position = Vector2(0.0, top0 + _band_h + 2.0 * PX)
	var py := 0.0
	for r in _frows:
		r.y_at = py
		py += r.size.y + 6.0 * PX
	_bare.visible = _trader and _frows.is_empty()
	if _bare.visible:
		py = _bare.size.y + 14.0 * PX
	_pyro_h = py
	_pyro.visible = _trader or not _frows.is_empty()
	var top := (_pyro.position.y + _pyro_h + _band_h + 2.0 * PX) if _pyro.visible else (_yard_y + _svc_h + 6.0 * PX + _band_h + 2.0 * PX)
	_wright.visible = not _trader
	_wright.position = Vector2(0.0, top)
	var y := 0.0
	for r in _prows:
		r.y_at = y
		y += r.size.y + 6.0 * PX
	_wnote.position = Vector2(2.0 * PX, y + 6.0 * PX)
	_wright_h = _wnote.position.y + _wnote.size.y
	_wright.visible = not _prows.is_empty() and not _trader
	if _crew == null:
		return
	var ct := top
	if _wright.visible:
		ct = _wright.position.y + _wright_h + 10.0 * PX + _band_h + 2.0 * PX
	_crew.position = Vector2(0.0, ct)
	var hy := 0.0
	for r in _hrows:
		r.y_at = hy
		hy += r.size.y + 6.0 * PX
	_crew_h = maxf(0.0, hy - 6.0 * PX)
	_crew.visible = not _trader and not _hrows.is_empty()


## Your escorts and the ships for hire laid on the desk afresh; `fleet_n`
## how many sail with you (-1: as last told).
func _build_crew(fleet_n: int) -> void:
	if _crew == null:
		return
	for r in _hrows:
		_crew.remove_child(r)
		r.queue_free()
	_hrows.clear()
	for i in _hands.size():
		var o: Dictionary = _hands[i]
		var r := _PRow.new({"hand": true, "id": o.id, "o": o}, _iw)
		r.buy_btn.pressed.connect(_on_hand.bind(r, bool(o.mine)))
		_crew.add_child(r)
		_hrows.append(r)
		r.set_hand(o, _gold)
	if fleet_n >= 0 and _crew_n != null:
		_crew_n.set_text("%d / %d ESCORTS" % [fleet_n, Fleet.MAX])
		_crew_n.position = Vector2(_bands[4].size.x - _gx - 6.0 * PX - _crew_n.size.x, 8.0 * PX + 1.0 * PX)
	for r in _hrows:
		_step_prow(r, 0.0)
	_lay_wright()


func _on_hand(r: _PRow, mine: bool) -> void:
	if not r.buy_btn.enabled:
		return
	clicked.emit()
	if mine:
		pay_off.emit(r.id)
	else:
		hire.emit(r.id)


func _on_buy(r: _PRow) -> void:
	if not r.buy_btn.enabled:
		return
	clicked.emit()
	buy_part.emit(r.id)


## The pyrotechnist's rockets laid on the stall afresh (coming in one after
## another when `enter`).
func _build_pyro(enter: bool) -> void:
	if _pyro == null:
		return
	for r in _frows:
		_pyro.remove_child(r)
		r.queue_free()
	_frows.clear()
	var list := _wares if _trader else _pyro_offers
	for i in list.size():
		var o: Dictionary = list[i]
		var r := _PRow.new({"ware": true, "id": o.id, "price": o.price, "deal": o.deal}, _iw) if _trader else _PRow.new({"fw": true, "id": o.id, "price": o.price}, _iw)
		r.buy_btn.pressed.connect((_on_buy_ware if _trader else _on_buy_fw).bind(r))
		r.t_in = -minf(i, 5) * 0.04 if enter else ROW_IN
		_pyro.add_child(r)
		_frows.append(r)
	_fill_pyro()
	for r in _frows:
		_step_prow(r, 0.0)


## Each rocket's Buy as things stand: its price (dimmed while the purse won't
## stretch to it), or Full once the locker can hold no more of it.
func _fill_pyro() -> void:
	if _trader:
		for i in mini(_wares.size(), _frows.size()):
			var w: Dictionary = _wares[i]
			_frows[i].set_ware(int(w.n), bool(w.room), bool(w.room) and _gold >= int(w.price))
		_lay_wright()
		return
	for i in mini(_pyro_offers.size(), _frows.size()):
		var o: Dictionary = _pyro_offers[i]
		_frows[i].set_fw(int(o.owned), int(o.room), int(o.room) > 0 and _gold >= int(o.price))
	_lay_wright()


func _on_buy_ware(r: _PRow) -> void:
	if not r.buy_btn.enabled:
		return
	clicked.emit()
	buy_ware.emit(r.id)


func _on_buy_fw(r: _PRow) -> void:
	if not r.buy_btn.enabled:
		return
	clicked.emit()
	buy_firework.emit(r.id)


## The purse: its coin, what's in it, right against the card's edge.
func _lay_purse() -> void:
	var h := _purse.size.y
	var d := 16.0 * PX
	var x := 10.0 * PX + 1.0
	_purse_coin.position = Vector2(x + d * 0.5, h * 0.5) - _purse_coin.size * 0.5
	MenuKit.line_at(_purse_n, x + d + 7.0 * PX, 0.0, h)
	var w := x + d + 7.0 * PX + _purse_n.size.x + 14.0 * PX + 1.0
	_purse.resize(Vector2(w, h))
	_purse.position = Vector2(_card.size.x - 14.0 * PX - w, 10.0 * PX)


## Sell everything's worth, on its right: the coin, then the gold.
func _lay_all() -> void:
	var h := _all.size.y
	var right := _all.size.x - 22.0 * PX
	MenuKit.line_at(_all_v, right - _all_v.size.x, 0.0, h)
	var d := 16.0 * PX
	_all_coin.position = Vector2(_all_v.position.x - 7.0 * PX - d * 0.5, h * 0.5) - _all_coin.size * 0.5


## Sell everything greyed and dimmed, with nothing to sell (the web's
## grayscale(0.8) brightness(0.7) at 0.6), or gold again.
func _dull_all(off: bool) -> void:
	_all.enabled = not off
	_all.modulate.a = 0.6 if off else 1.0
	if off:
		_all.cancel()
		_all.p("c_top", _dull(HudStyle.GOLD_TOP)).p("c_mid", _dull(HudStyle.GOLD_MID)).p("c_foot", _dull(HudStyle.GOLD_FOOT))
		_all.p("c_shadow", _dull(Color(0.957, 0.706, 0.275, 0.32)))
	else:
		HudStyle.gold(_all, U)


static func _dull(c: Color) -> Color:
	var g := c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
	return Color(lerpf(c.r, g, 0.8) * 0.7, lerpf(c.g, g, 0.8) * 0.7, lerpf(c.b, g, 0.8) * 0.7, c.a)


## A section's name on its band (it pins to the top of the body while its
## goods scroll under it), spanning the body.
func _band(text: String) -> UiBox:
	var b := UiBox.new(Vector2(_body.size.x, _band_h), 0.0, 2.0)
	MenuKit.flat(b)
	b.p("c_top", BAND).p("c_mid", BAND).p("mid", 0.72).p("c_foot", Color(BAND, 0.0)).p("border", 0.0).p("hi", 0.0)
	var t := _words(text, 700, 10.0, HudStyle.INK_3, 0.22)
	t.position = Vector2(_gx + 6.0 * PX, 8.0 * PX)
	b.add_child(t)
	return b


## The empty hold: a dashed box with an anchor and what to do about it.
func _empty_box(w: float) -> Control:
	var box := _Dashed.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.radius = 16.0 * PX
	var pad := Vector2(12.0, 10.0) * PX + Vector2.ONE
	var ip := 34.0 * PX
	var tw := w - pad.x * 2.0 - ip - 12.0 * PX
	var b := _words("The hold is empty", 700, 14.0, HudStyle.INK_2)
	var small := UiText.new([["Sink pirates and sail through their wreckage, then bring the plunder here to sell.", HudStyle.font("inter", 500), roundi(12.0 * PX), HudStyle.INK_3]], tw, 1.4)
	var th := b.size.y + small.size.y
	var h := pad.y * 2.0 + maxf(ip, th)
	box.size = Vector2(w, h)
	var ic := Icons.rect("anchor", ip, HudStyle.INK_3)
	ic.position = Vector2(pad.x, (h - ip) * 0.5)
	box.add_child(ic)
	b.position = Vector2(pad.x + ip + 12.0 * PX, (h - th) * 0.5)
	box.add_child(b)
	small.position = Vector2(b.position.x, b.position.y + b.size.y)
	box.add_child(small)
	return box


## Cast off: the web's glass .btn with the flag (and Esc, with keys).
func _cast_off(h: float) -> UiButton:
	var t := MenuKit.words("Cast off", "inter", 700, 14.5 * T, HudStyle.INK, 0.01)
	var ip := 18.0 * PX
	var gap := 9.0 * U
	var pad := 24.0 * U
	var key: UiBox = null if touch else _kbd("Esc", true, false)
	var w := pad * 2.0 + ip + gap + t.size.x
	if key != null:
		w += gap + 4.0 * U + key.size.x - 6.0 * U
	var b := UiButton.new(Vector2(w, h), h * 0.5, 4.0)
	MenuKit.flat(b)
	var fill := Color(1.0, 1.0, 1.0, 0.075)
	b.p("c_top", fill).p("c_foot", fill).p("c_border", HudStyle.STROKE).p("hi", 0.09)
	var ic := Icons.rect("flag", ip, HudStyle.INK)
	ic.position = Vector2(pad, (h - ip) * 0.5)
	b.add_child(ic)
	MenuKit.line_at(t, pad + ip + gap, 0.0, h)
	b.add_child(t)
	if key != null:
		key.position = Vector2(t.position.x + t.size.x + gap + 4.0 * U, (h - key.size.y) * 0.5)
		b.add_child(key)
	return b


## A key's cap (the web's kbd): `small` as it sits in a button, `gold` lit.
func _kbd(text: String, small: bool, gold: bool) -> UiBox:
	var px := (10.0 if small else 11.5) * T
	var t := MenuKit.words(text, "inter", 600, px, HudStyle.GOLD_INK if gold else HudStyle.INK, 0.04 if small else 0.0)
	var pad := Vector2(6.0 * U, 2.0 * PX) if small else Vector2(7.0 * U, 3.0 * U)
	var h := t.size.y + pad.y * 2.0 + 3.0
	var w := maxf(0.0 if small else 24.0 * U, t.size.x + pad.x * 2.0 + 2.0)
	var b := UiBox.new(Vector2(w, h), 7.0 * U, 2.0)
	MenuKit.flat(b)
	var fill := Color(0.0, 0.0, 0.0, 0.1) if small else Color(1.0, 1.0, 1.0, 0.1)
	var edge := Color(0.0, 0.0, 0.0, 0.14) if small else Color(1.0, 1.0, 1.0, 0.16)
	if gold:
		b.p("c_top", HudStyle.GOLD_TOP).p("c_mid", HudStyle.GOLD_MID).p("mid", 0.52).p("c_foot", HudStyle.GOLD_FOOT).p("border", 0.0).p("hi", 0.0)
	else:
		b.p("c_top", fill).p("c_foot", fill).p("c_border", edge).p("hi", 0.0).p("c_lo", edge).p("lo_px", 1.0)
	t.position = Vector2((w - t.size.x) * 0.5, pad.y + 1.0)
	b.add_child(t)
	return b


# ------------------------------------------------------------------ a frame

func _process(dt: float) -> void:
	_step(dt)


func _step(dt: float) -> void:
	if _p_t >= 0.0 and _p_t < PROMPT_IN:
		_p_t = minf(_p_t + dt, PROMPT_IN)
		var pe := HudStyle.spring(_p_t / PROMPT_IN)
		_prompt.modulate.a = clampf(pe, 0.0, 1.0)
		_prompt.position.y = _p_y + (1.0 - pe) * 8.0 * PX
	if not _open or _card == null:
		return
	# the card slides in from the right
	if _t < CARD_IN:
		_t = minf(_t + dt, CARD_IN)
		var e := HudStyle.eased(_t / CARD_IN)
		_card.position = _rest + Vector2((1.0 - e) * (_card.size.x + 40.0 * PX), 0.0)
		_card.modulate.a = MathX.bezier(0.25, 0.1, 0.25, 1.0, minf(1.0, _t / 0.35))
	if not _down and absf(_fling) > 1.0:
		_scroll_to(_scroll + _fling * dt)
		_fling *= exp(-4.0 * dt)
	if _render_in > 0.0:
		_render_in -= dt
		if _render_in <= 0.0:
			_render_in = -1.0
			_render(false)
	# the rows: coming in, folding away, closing up, a price's flash
	var settle := MathX.damp(14.0, dt)
	for r: _Row in _rows.values():
		_step_row(r, dt, settle)
	_below.position.y += (_below_to - _below.position.y) * settle
	if absf(_below_to - _below.position.y) < 0.2:
		_below.position.y = _below_to
	for r in _prows:
		_step_prow(r, dt)
	for r in _frows:
		_step_prow(r, dt)
	for r in _hrows:
		_step_prow(r, dt)
	# what's to scroll, the section names pinned, and the fade at the foot
	var wares := not _prows.is_empty() and not _trader
	var pyro := not _frows.is_empty() or _trader
	var crew := _crew != null and _crew.visible
	var content_h := _below.position.y + (_crew.position.y + _crew_h if crew else (_wright.position.y + _wright_h if wares else (_pyro.position.y + _pyro_h - 6.0 * PX if pyro else _yard_y + _svc_h))) + 6.0 * PX
	_scroll_max = maxf(0.0, content_h - _body.size.y)
	_scroll = clampf(_scroll, 0.0, _scroll_max)
	_content.position.y = -_scroll
	_bands[0].position.y = _scroll
	_bands[1].position.y = maxf(_below.position.y + 48.0 * PX, _scroll)
	_bands[1].visible = not _trader
	_bands[2].visible = wares
	_bands[2].position.y = maxf(_below.position.y + _wright.position.y - _band_h - 2.0 * PX, _scroll)
	_bands[3].visible = pyro
	_bands[3].position.y = maxf(_below.position.y + _pyro.position.y - _band_h - 2.0 * PX, _scroll)
	_bands[4].visible = crew
	if crew:
		_bands[4].position.y = maxf(_below.position.y + _crew.position.y - _band_h - 2.0 * PX, _scroll)
	_fade.visible = _scroll < _scroll_max - 2.0
	_step_coins(dt)
	if _bumping:
		_bump += dt
		var s := 1.0
		var a := WASH.a
		if _bump >= BUMP:
			_bumping = false
		elif _bump >= 0.0:
			var k := _bump / BUMP
			var e: float
			if k < 0.35:
				e = MathX.bezier(0.2, 0.9, 0.3, 1.4, k / 0.35)
			else:
				e = 1.0 - MathX.bezier(0.2, 0.9, 0.3, 1.4, (k - 0.35) / 0.65)
			s = lerpf(1.0, 1.16, e)
			a = lerpf(WASH.a, 0.35, e)
		_purse.pivot_offset = _purse.size * 0.5
		_purse.scale = Vector2(s, s)
		_purse.p("c_top", Color(WASH, a)).p("c_foot", Color(WASH, a))


func _step_row(r: _Row, dt: float, settle: float) -> void:
	r.y_now += (r.y_to - r.y_now) * settle
	if absf(r.y_to - r.y_now) < 0.2:
		r.y_now = r.y_to
	var a := 1.0
	var s := 1.0
	var dx := 0.0
	var dy := 0.0
	if r.t_in < ROW_IN:
		r.t_in = minf(r.t_in + dt, ROW_IN)
		var e := HudStyle.spring(clampf(r.t_in / ROW_IN, 0.0, 1.0))
		a = clampf(e, 0.0, 1.0)
		dy = (1.0 - e) * 8.0 * PX
		s = lerpf(0.97, 1.0, e)
	if r.folding:
		r.t_out += dt
		if r.t_out >= 0.0:
			if not r.coined:
				r.coined = true
				_coins(r.get_global_rect(), r.coin_n)
			var e := HudStyle.eased(clampf(r.t_out / ROW_OUT, 0.0, 1.0))
			dx = 40.0 * PX * e
			s *= lerpf(1.0, 0.96, e)
			a *= 1.0 - MathX.bezier(0.25, 0.1, 0.25, 1.0, clampf(r.t_out / 0.3, 0.0, 1.0))
	r.position = Vector2(dx, r.y_now + dy)
	r.scale = Vector2(s, s)
	r.modulate.a = a
	if r.t_tick >= 0.0:
		r.t_tick += dt
		var k := r.t_tick / TICK
		var w := 0.0
		if k >= 1.0:
			r.t_tick = -1.0
		elif k < 0.3:
			w = MathX.bezier(0.25, 0.1, 0.25, 1.0, k / 0.3)
		else:
			w = 1.0 - MathX.bezier(0.25, 0.1, 0.25, 1.0, (k - 0.3) / 0.7)
		# gold to white and back (the price's gold times this is white)
		r.flash(w)


## A part on the counter: coming in, and swelling and ringing once bought.
func _step_prow(r: _PRow, dt: float) -> void:
	var a := 1.0
	var s := 1.0
	var dy := 0.0
	if r.t_in < ROW_IN:
		r.t_in = minf(r.t_in + dt, ROW_IN)
		var e := HudStyle.spring(clampf(r.t_in / ROW_IN, 0.0, 1.0))
		a = clampf(e, 0.0, 1.0)
		dy = (1.0 - e) * 8.0 * PX
		s = lerpf(0.97, 1.0, e)
	if r.t_just >= 0.0:
		r.t_just += dt
		var k := r.t_just / BOUGHT
		var ring := 0.0
		var ra := 0.0
		if k >= 1.0:
			r.t_just = -1.0
		elif k < 0.3:
			var u := HudStyle.spring(k / 0.3)
			s *= lerpf(1.0, 1.03, u)
			ring = lerpf(0.0, 6.0, u)
			ra = lerpf(0.7, 0.35, u)
		else:
			var u := HudStyle.spring((k - 0.3) / 0.7)
			s *= lerpf(1.03, 1.0, u)
			ring = lerpf(6.0, 14.0, u)
			ra = lerpf(0.35, 0.0, u)
		r.p("ring", maxf(0.0, ring) * PX).p("c_ring", Color(r.rc, clampf(ra, 0.0, 1.0)))
	r.position = Vector2(0.0, r.y_at + dy)
	r.scale = Vector2(s, s)
	r.modulate.a = a


## The rows top to bottom.
func _ordered() -> Array[_Row]:
	var out: Array[_Row] = []
	for r: _Row in _rows.values():
		if not r.folding:
			out.append(r)
	out.sort_custom(func(a: _Row, b: _Row) -> bool: return a.y_to < b.y_to)
	return out


func _on_sell(id: String) -> void:
	var r: _Row = _rows.get(id)
	if r == null or r.folding:
		return
	clicked.emit()
	sell.emit(id)


## Coins flying from `from` (canvas units) into the purse, `n` of them, one
## after another; the purse bumps as they land.
func _coins(from: Rect2, n: int) -> void:
	if _purse == null:
		return
	var b := _purse.get_global_rect()
	var box := 14.0 * PX
	var x1 := b.position.x + 6.0 * PX
	var y1 := b.position.y + b.size.y * 0.5
	for i in n:
		var f := _Fly.new()
		var x0 := from.position.x + from.size.x * (0.3 + randf() * 0.5)
		var y0 := from.position.y + from.size.y * 0.5
		f.a = Vector2(x0, y0)
		f.m = Vector2((x0 + x1) * 0.5 + (randf() - 0.5) * 60.0 * PX, minf(y0, y1) - (60.0 + randf() * 60.0) * PX)
		f.b = Vector2(x1, y1)
		f.dur = 0.65 + randf() * 0.25
		f.t = -i * 0.045
		f.node = Icons.rect("coin", box * 1.5)
		f.node.pivot_offset = f.node.size * 0.5
		f.node.modulate.a = 0.0
		_fx.add_child(f.node)
		_flying.append(f)
	_bump = -0.6
	_bumping = true


## The coins in flight: up from where they were won and over into the
## purse (the web's keyframes: out of nothing, biggest at the top of the
## arc, a little smaller as they drop in).
func _step_coins(dt: float) -> void:
	var box := 14.0 * PX
	for i in range(_flying.size() - 1, -1, -1):
		var f := _flying[i]
		f.t += dt
		if f.t >= f.dur:
			f.node.queue_free()
			_flying.remove_at(i)
			continue
		if f.t < 0.0:
			continue
		var e := MathX.bezier(0.3, 0.7, 0.4, 1.0, f.t / f.dur)
		var at: Vector2
		var s: float
		var a: float
		if e < 0.45:
			var u := e / 0.45
			at = f.a.lerp(f.m, u)
			s = lerpf(0.6, 1.15, u)
			a = u
		else:
			var u := (e - 0.45) / 0.55
			at = f.m.lerp(f.b, u)
			s = lerpf(1.15, 0.7, u)
			a = lerpf(1.0, 0.9, u)
		f.node.position = at - Vector2(box, box) * 0.25
		f.node.scale = Vector2(s, s)
		f.node.modulate.a = a


func _clear_fly() -> void:
	for f in _flying:
		f.node.queue_free()
	_flying.clear()
	_bumping = false


# ------------------------------------------------------------------ scrolling

func _scroll_to(s: float) -> void:
	_scroll = clampf(s, 0.0, _scroll_max)
	if _scroll <= 0.0 or _scroll >= _scroll_max:
		_fling = 0.0
	if _content != null:
		_content.position.y = -_scroll


## The body under a finger or the mouse: a drag up or down scrolls it (and
## flings it on), the wheel steps it.
func _on_body(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION:
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_scroll_to(_scroll - 40.0 * U)
			return
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_scroll_to(_scroll + 40.0 * U)
			return
		if event.button_index != MOUSE_BUTTON_LEFT:
			return
	var touched := event is InputEventScreenTouch
	var click: bool = event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION
	if touched or click:
		if event.pressed:
			_down = true
			_dragging = false
			_from = event.position
			_last = event.position
			_last_ms = Time.get_ticks_msec()
			_fling = 0.0
		else:
			_release()
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


func _release() -> void:
	_down = false
	_dragging = false


## Enter sells everything while the market is open (Esc, the back button,
## casts off: the game takes that).
func _unhandled_input(event: InputEvent) -> void:
	if not _open:
		return
	var k := event as InputEventKey
	if k != null and k.pressed and not k.echo and (k.keycode == KEY_ENTER or k.keycode == KEY_KP_ENTER):
		get_viewport().set_input_as_handled()
		if _all != null and _all.enabled:
			sell_all.emit()


# ------------------------------------------------------------------ the prompt

## The prompt as she comes in off a quay: {name, ok, why}, or {} to put it
## away; a `title` says it instead of "Dock at" (off a beach, or ashore).
func set_dock(d: Dictionary) -> void:
	var key := "" if d.is_empty() else "%s|%s|%s|%s" % [d.get("name", ""), d.get("ok", false), d.get("why", ""), d.get("title", "")]
	if key == _p_state:
		return
	_p_state = key
	_p_dict = d
	if d.is_empty():
		_prompt.cancel()
		_prompt.visible = false
		_p_t = -1.0
		return
	_lay_prompt()
	if not _prompt.visible:
		_prompt.visible = true
		_p_t = 0.0
		_prompt.modulate.a = 0.0


## The helmsman's pill up in the bottom middle, this tall (0: down): the prompt steps up over it.
func set_pill(height: float) -> void:
	if height == _pill_h:
		return
	_pill_h = height
	if _prompt.visible:
		_lay_prompt()


## The pill: the key for it (with keys), "Dock at" the town (or just its name
## while she may not), and the why above it; gold-edged while she may.
func _lay_prompt() -> void:
	var d := _p_dict
	_p_ok = bool(d.get("ok", false))
	for c in _prompt.get_children():
		_prompt.remove_child(c)
		c.queue_free()
	var vp := get_viewport().get_visible_rect().size
	var h := maxf(28.0 * PX, 32.0 * K) if touch else maxf(24.0 * PX, 28.0 * K)
	var pad_l := (8.0 if touch else 6.0) * K
	var pad_r := (14.0 if touch else 12.0) * K
	# (going ashore and rowing back say their own)
	var title: String = str(d.title) if d.has("title") else ("Dock at %s" % d.get("name", "")) if _p_ok else str(d.get("name", ""))
	var t := UiText.new([[title, HudStyle.font("inter", 700), roundi(maxf(10.5 * PX, 12.0 * K)), HudStyle.INK]], 0.0, 1.0)
	var key: UiBox = null if touch else _kbd("F", false, _p_ok)
	var x := pad_l
	if key != null:
		key.position = Vector2(x, (h - key.size.y) * 0.5)
		key.modulate.a = 1.0 if _p_ok else 0.35
		_prompt.add_child(key)
		x += key.size.x + 5.0 * U + 6.0 * K
	var most := maxf(200.0 * PX, minf(340.0 * K, vp.x * 0.94 - 440.0 * HudStyle.KT))
	t.cut_to(maxf(40.0, most - x - pad_r))
	MenuKit.line_at(t, x, 0.0, h)
	_prompt.add_child(t)
	var w := x + t.size.x + pad_r
	_prompt.resize(Vector2(w, h))
	_prompt.p("radius", h * 0.5)
	if _p_ok:
		var fill := Color(0.118, 0.094, 0.039, 0.6)
		_prompt.p("c_top", fill).p("c_foot", fill).p("c_border", Color(0.957, 0.78, 0.396, 0.55))
		_prompt.p("c_shadow", Color(0.957, 0.706, 0.275, 0.2)).p("shadow", Vector2(6.0, 20.0) * PX)
	else:
		var fill := Color(0.024, 0.078, 0.118, 0.58)
		_prompt.p("c_top", fill).p("c_foot", fill).p("c_border", Color(1.0, 1.0, 1.0, 0.14))
		_prompt.p("c_shadow", Color(0.0, 0.031, 0.055, 0.22)).p("shadow", Vector2(6.0, 18.0) * PX)
	_prompt.p("hi", 0.0)
	var why := str(d.get("why", ""))
	if why != "":
		_p_why = Label.new()
		_p_why.label_settings = _p_look
		_p_why.text = why
		_p_why.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_prompt.add_child(_p_why)
		var ws := _p_why.get_minimum_size()
		_p_why.size = ws
		_p_why.position = Vector2((w - ws.x) * 0.5, -5.0 * K - ws.y)
	var my := vp.y * 0.03
	# (the web's 58 and 160 px over the pill, and never onto it: on a small
	# screen the pill's lines keep it taller than the web allowed for)
	var lift := 0.0 if touch else 104.0 * K
	if _pill_h > 0.0:
		lift = maxf(58.0 * K, _pill_h + 6.0 * K) if touch else maxf(160.0 * K, 66.0 * K + _pill_h + 6.0 * K)
	_p_y = vp.y - my - h - lift
	_prompt.position = Vector2((vp.x - w) * 0.5, _p_y)


## The why's look: small words straight on the sea, a dark glow round them
## and a drop shadow under (the web's two text-shadows) so they read on any water.
static func _caption_look(px: float) -> LabelSettings:
	var s := LabelSettings.new()
	s.font = HudStyle.font("inter", 600)
	s.font_size = roundi(px)
	s.font_color = Color(0.925, 0.965, 0.98, 0.9)
	var layers := []
	for r in range(2, -1, -1):
		var f := (r + 1.0) / 3.0
		layers.append([Color(0.0, 0.039, 0.071, 0.8 * 0.42 * (1.0 - f * 0.55)), roundi(8.0 * PX * 0.75 * f), Vector2.ZERO])
	layers.append([Color(0.0, 0.0, 0.0, 0.55), roundi(2.0 * PX * 0.55), Vector2(0.0, 1.0 * PX)])
	s.stacked_shadow_count = layers.size()
	for i in layers.size():
		var l: Array = layers[i]
		s.set_stacked_shadow_color(i, l[0])
		s.set_stacked_shadow_outline_size(i, maxi(1, l[1]))
		s.set_stacked_shadow_offset(i, l[2])
	return s


## Words in Inter at a size in the web's plain CSS pixels, tracked `em` of
## it, with tabular figures (`tnum`) for numbers that change.
static func _words(s: String, weight: int, css_px: float, color: Color, em := 0.0, tnum := false) -> UiText:
	var px := css_px * PX
	var f := HudStyle.font("inter", weight, roundi(em * px))
	if tnum:
		f = HudStyle.tnum(f)
	return UiText.new([[s, f, maxi(1, roundi(px)), color]], 0.0, 1.0)


# ------------------------------------------------------------------ pieces

## A lot on the counter: its portrait on a wash of its rarity's colour, its
## name (and how many), its rarity and kind, what the lot fetches today and
## which way the price is going, and its Sell.
class _Row:
	extends UiBox

	var id := ""
	var n := 0
	var sell_btn: UiButton
	## The price as shown, where the row is going and where it is (in the
	## list), and its clocks: coming in (s; < 0 waiting its turn), folding
	## away (s; < 0 waiting), a price's flash (s; < 0 none).
	var shown := ""
	var y_to := 0.0
	var y_now := 0.0
	var t_in := 0.0
	var folding := false
	var t_out := 0.0
	var coined := false
	var coin_n := 0
	var t_tick := -1.0
	var _name: UiText
	var _count: UiText
	var _line: UiText
	var _price: UiText
	var _trend: _Trend

	func _init(p_id: String, p_n: int, w: float) -> void:
		super(Vector2(w, 58.0 * MarketPanel.PX), 16.0 * MarketPanel.PX, 4.0)
		var px := MarketPanel.PX
		id = p_id
		n = p_n
		var h := size.y
		var r := Treasure.rarity_of(id)
		var rc: Color = Treasure.RARITY_COLOR[r]
		MenuKit.flat(self)
		p("horiz", 1.0).p("c_top", Color(rc, 0.14)).p("c_mid", Color(1.0, 1.0, 1.0, 0.03)).p("mid", 0.6).p("c_foot", Color(1.0, 1.0, 1.0, 0.03))
		p("c_border", Color(rc, 0.22)).p("hi", 0.0)
		if r >= 4:
			p("c_inset", Color(1.0, 0.71, 0.18, 0.18)).p("inset", 22.0 * px)
		pivot_offset = size * 0.5
		var pad := 6.0 * px + 1.0
		var ico := 44.0 * px
		var box := UiBox.new(Vector2(ico, ico), 12.0 * px, 2.0)
		MenuKit.flat(box)
		box.p("border", 0.0).p("hi", 0.0).p("radial", Vector4(0.5, 0.4, 0.781, 0.781)).p("radial_stop", 0.75)
		box.p("c_top", Color(rc, 0.3)).p("c_foot", Color(0.0, 0.0, 0.0, 0.18))
		box.position = Vector2(pad, (h - ico) * 0.5)
		add_child(box)
		var art := TextureRect.new()
		art.texture = Icons.plunder(id, 40.0 * px)
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_SCALE
		art.size = Vector2(40.0, 40.0) * px
		art.position = Vector2(2.0, 2.0) * px
		art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_child(art)
		var st := MarketPanel._words("Sell", 800, 12.5, HudStyle.GOLD_HI, 0.02)
		var bh := 34.0 * px
		var bw := 28.0 * px + 2.0 + st.size.x
		sell_btn = UiButton.new(Vector2(bw, bh), bh * 0.5, 4.0)
		sell_btn.squeeze = 0.95
		MenuKit.flat(sell_btn)
		sell_btn.p("c_top", MarketPanel.WASH).p("c_foot", MarketPanel.WASH).p("c_border", Color(0.957, 0.78, 0.396, 0.45)).p("hi", 0.0)
		MenuKit.line_at(st, (bw - st.size.x) * 0.5, 0.0, bh)
		sell_btn.add_child(st)
		sell_btn.position = Vector2(w - pad - bw, (h - bh) * 0.5)
		add_child(sell_btn)
		_name = MarketPanel._words(Treasure.name_of(id), 700, 14.0, HudStyle.INK)
		add_child(_name)
		if n > 1:
			_count = MarketPanel._words("×%d" % n, 800, 14.0, HudStyle.INK_2)
			add_child(_count)
		var f6 := HudStyle.font("inter", 600)
		var sz := roundi(11.0 * px)
		_line = UiText.new([[Treasure.RARITY_NAME[r], f6, sz, rc], [" · " + str(Treasure.CATEGORY_NAME.get(Treasure.cat_of(id), "")), f6, sz, HudStyle.INK_3]], 0.0, 1.0)
		add_child(_line)
		_price = MarketPanel._words("0", 800, 15.0, HudStyle.GOLD_HI, 0.0, true)
		add_child(_price)
		_trend = _Trend.new(roundi(10.5 * px))
		add_child(_trend)

	## What the lot fetches (`total`), and the line under it: `pre` (the
	## price of one, for a lot of several), the trend's way and how far.
	func set_price(total: String, pre: String, up: bool, post: String, ink: Color) -> void:
		shown = total
		_price.set_text(total)
		_trend.show_trend(pre, up, post, ink)
		_lay()

	## Folds away `wait` s from now (flying `coins` coins as it goes).
	func fold(wait: float, coins: int) -> void:
		folding = true
		t_out = -wait
		coin_n = coins
		sell_btn.enabled = false
		sell_btn.cancel()

	## The price lit `w` of the way from its gold to white (its flash as it changes).
	func flash(w: float) -> void:
		_price.self_modulate = Color(1.0, lerpf(1.0, 1.104, w), lerpf(1.0, 1.518, w))

	func _lay() -> void:
		var px := MarketPanel.PX
		var h := size.y
		var gap := 10.0 * px
		var right := sell_btn.position.x - gap
		var pw := maxf(_price.size.x, _trend.size.x)
		var py := (h - _price.size.y - _trend.size.y) * 0.5
		_price.position = Vector2(right - _price.size.x, py)
		_trend.position = Vector2(right - _trend.size.x, py + _price.size.y)
		var wx := 6.0 * px + 1.0 + 44.0 * px + gap
		var avail := right - pw - gap - wx
		var cw := (6.0 * px + _count.size.x) if _count != null else 0.0
		_name.cut_to(maxf(20.0, avail - cw))
		_line.cut_to(maxf(20.0, avail))
		var ty := (h - _name.size.y - _line.size.y) * 0.5
		_name.position = Vector2(wx, ty)
		if _count != null:
			_count.position = Vector2(wx + _name.size.x + 6.0 * px, ty)
		_line.position = Vector2(wx, ty + _name.size.y)


## One of the chandlery's services: its picture in aqua, what it does, what
## it would mend or fill, and its price (a dash when there's nothing to
## do); dimmed while there's nothing to do or the purse won't stretch to it.
class _Svc:
	extends UiButton

	var _icon: TextureRect
	var _title: UiText
	var _line: UiText
	var _coin: TextureRect
	var _cost: UiText

	func _init(icon: String, title: String, w: float) -> void:
		super(Vector2(w, 40.0), 16.0 * MarketPanel.PX, 4.0)
		var px := MarketPanel.PX
		squeeze = 0.97
		MenuKit.flat(self)
		var fill := Color(1.0, 1.0, 1.0, 0.05)
		p("c_top", fill).p("c_foot", fill).p("c_border", HudStyle.STROKE).p("hi", 0.0)
		_icon = Icons.rect(icon, 22.0 * px, HudStyle.AQUA)
		add_child(_icon)
		_title = MarketPanel._words(title, 700, 12.5, HudStyle.INK)
		add_child(_title)
		_coin = Icons.rect("coin", maxf(9.0 * px, 11.0 * MarketPanel.K) * 1.5)
		add_child(_coin)
		_cost = MarketPanel._words("—", 800, 13.0, HudStyle.GOLD_HI, 0.0, true)
		add_child(_cost)

	## Says `line` and `price` (in ink-3 when `done`), lit and working when
	## `can`; returns the height it needs.
	func lay(line: String, price: String, done: bool, can: bool) -> float:
		var px := MarketPanel.PX
		var w := size.x
		var x0 := 10.0 * px + 1.0
		var y0 := 7.0 * px + 1.0
		var ip := 22.0 * px
		var tx := x0 + ip + 8.0 * px
		if _line != null:
			remove_child(_line)
			_line.queue_free()
		_line = UiText.new([[line, HudStyle.font("inter", 500), roundi(10.5 * px), HudStyle.INK_3]], w - tx - x0, 1.0)
		add_child(_line)
		var th := _title.size.y + _line.size.y
		var r1 := maxf(ip, th)
		_icon.position = Vector2(x0, y0 + (r1 - ip) * 0.5)
		_title.position = Vector2(tx, y0 + (r1 - th) * 0.5)
		_line.position = Vector2(tx, _title.position.y + _title.size.y)
		_cost.set_runs([[price, _cost.runs[0][1], _cost.runs[0][2], HudStyle.INK_3 if done else HudStyle.GOLD_HI]])
		var ey := y0 + r1 + 4.0 * px
		var d := maxf(9.0 * px, 11.0 * MarketPanel.K)
		_coin.position = Vector2(x0 + d * 0.5, ey + _cost.size.y * 0.5) - _coin.size * 0.5
		_cost.position = Vector2(x0 + d + 6.0 * px, ey)
		enabled = can
		modulate.a = 1.0 if can else 0.5
		if not can:
			cancel()
		return ey + _cost.size.y + y0


## A part on the shipwright's counter: its portrait on a wash of its
## rarity's colour, its name, its rarity and slot, up to three lines of what
## it does, and its Buy at the price (Owned once it's yours, dimmed while the
## purse won't stretch to it). A legendary glows inside its edge; a mythic is
## washed and edged in its kind's colours.
class _PRow:
	extends UiBox

	var id := ""
	var rc := Color.WHITE
	var buy_btn: UiButton
	## Where it sits on the counter; coming in (s; < 0 waiting its turn) and
	## the swell of one just bought (s; < 0 none).
	var y_at := 0.0
	var t_in := 0.0
	var t_just := -1.0
	var _price := 0
	var _ico: UiBox
	var _name: UiText
	var _line: UiText
	## The stat lines, each with the dot before it (none before the first).
	var _chips: Array[UiText] = []
	var _dots: Array[UiText] = []
	## A rocket (the pyrotechnist's), not a part: its one line of looks is cut to fit.
	var _fw := false
	var _tier_name := ""
	## A merchantman's lot (Convoys), not a part.
	var _ware := false

	func _init(part: Dictionary, w: float) -> void:
		var px := MarketPanel.PX
		super(Vector2(w, 58.0 * px), 16.0 * px, 16.0 * px)
		id = part.id
		if part.has("fw"):
			_init_fw(part)
			return
		if part.has("ware"):
			_init_ware(part)
			return
		if part.has("hand"):
			_init_hand(part.o)
			return
		var tier: int = part.tier
		var rarity: Dictionary = Parts.RARITIES[tier]
		rc = rarity.css
		_price = rarity.price
		MenuKit.flat(self)
		p("horiz", 1.0).p("hi", 0.0)
		if tier >= 4:
			p("c_top", Color8(127, 232, 255, 31)).p("c_mid", Color8(198, 155, 255, 26)).p("mid", 0.4).p("c_foot", Color8(255, 95, 158, 13))
			p("c_border", Color8(198, 155, 255, 140)).p("c_inset", Color8(198, 155, 255, 51)).p("inset", 26.0 * px)
		else:
			p("c_top", Color(rc, 0.14)).p("c_mid", Color(1.0, 1.0, 1.0, 0.03)).p("mid", 0.6).p("c_foot", Color(1.0, 1.0, 1.0, 0.03))
			p("c_border", Color(rc, 0.22))
			if tier == 3:
				p("c_inset", Color8(255, 190, 61, 41)).p("inset", 22.0 * px)
		var ico := 44.0 * px
		_ico = UiBox.new(Vector2(ico, ico), 12.0 * px, 2.0)
		MenuKit.flat(_ico)
		_ico.p("border", 0.0).p("hi", 0.0).p("radial", Vector4(0.5, 0.4, 0.781, 0.781)).p("radial_stop", 0.75)
		_ico.p("c_top", Color(rc, 0.3)).p("c_foot", Color(0.0, 0.0, 0.0, 0.18))
		add_child(_ico)
		var art := TextureRect.new()
		art.texture = Icons.part(id, 40.0 * px)
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_SCALE
		art.size = Vector2(40.0, 40.0) * px
		art.position = Vector2(2.0, 2.0) * px
		art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_ico.add_child(art)
		_name = MarketPanel._words(str(part.name), 700, 14.0, HudStyle.INK)
		add_child(_name)
		var f6 := HudStyle.font("inter", 600)
		var sz := roundi(11.0 * px)
		_line = UiText.new([[str(rarity.name), f6, sz, rc], [" · " + str(Parts.SLOT_NAMES[part.slot]), f6, sz, HudStyle.INK_3]], 0.0, 1.0)
		add_child(_line)
		var lines := Parts.stat_lines(part.stats)
		for i in mini(3, lines.size()):
			var l: Array = lines[i]
			if i > 0:
				var dot := MarketPanel._words("·", 700, 9.5, HudStyle.INK_4)
				add_child(dot)
				_dots.append(dot)
			var chip := MarketPanel._words(str(l[0]), 700, 9.5, MarketPanel.BAD if l[1] else MarketPanel.GOOD)
			add_child(chip)
			_chips.append(chip)
		buy_btn = UiButton.new(Vector2(40.0, 30.0), 12.0 * px, 16.0 * px)
		buy_btn.squeeze = 0.95
		add_child(buy_btn)

	## A rocket on the pyrotechnist's stall (Fireworks): its portrait on a
	## wash of its colour, its name, its tier and how many the locker holds,
	## what it looks like going off, and its Buy.
	func _init_fw(o: Dictionary) -> void:
		var px := MarketPanel.PX
		_fw = true
		var k := Fireworks.kind(id)
		var tier := Fireworks.tier(id)
		rc = Fireworks.color(id)
		var rc2 := Fireworks.color2(id)
		_price = int(o.price)
		MenuKit.flat(self)
		p("horiz", 1.0).p("hi", 0.0)
		p("c_top", Color(rc, 0.14)).p("c_mid", Color(rc2, 0.05)).p("mid", 0.6).p("c_foot", Color(1.0, 1.0, 1.0, 0.03))
		p("c_border", Color(rc, 0.22))
		if tier == 2:
			p("c_border", Color8(255, 215, 110, 120)).p("c_inset", Color8(255, 190, 61, 41)).p("inset", 22.0 * px)
		var ico := 44.0 * px
		_ico = UiBox.new(Vector2(ico, ico), 12.0 * px, 2.0)
		MenuKit.flat(_ico)
		_ico.p("border", 0.0).p("hi", 0.0).p("radial", Vector4(0.5, 0.4, 0.781, 0.781)).p("radial_stop", 0.75)
		_ico.p("c_top", Color(rc, 0.3)).p("c_foot", Color(0.0, 0.0, 0.0, 0.18))
		add_child(_ico)
		var art := TextureRect.new()
		art.texture = Icons.firework(id, 40.0 * px)
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_SCALE
		art.size = Vector2(40.0, 40.0) * px
		art.position = Vector2(2.0, 2.0) * px
		art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_ico.add_child(art)
		_name = MarketPanel._words(str(k.name), 700, 14.0, HudStyle.INK)
		add_child(_name)
		_tier_name = ["Common", "Fine", "Showpiece"][tier]
		_line = UiText.new([["", HudStyle.font("inter", 600), roundi(11.0 * px), rc]], 0.0, 1.0)
		add_child(_line)
		var chip := MarketPanel._words(Fireworks.gist(id), 600, 9.5, HudStyle.INK_3)
		add_child(chip)
		_chips.append(chip)
		buy_btn = UiButton.new(Vector2(40.0, 30.0), 12.0 * px, 16.0 * px)
		buy_btn.squeeze = 0.95
		add_child(buy_btn)

	## A lot on a merchantman's counter (Convoys): its portrait on a wash of
	## its rarity's colour, its name and how many, its rarity and kind, how
	## her asking price sits against the fair one, and its Buy.
	func _init_ware(o: Dictionary) -> void:
		var px := MarketPanel.PX
		_ware = true
		var r := Treasure.rarity_of(id)
		rc = Treasure.RARITY_COLOR[r]
		_price = int(o.price)
		MenuKit.flat(self)
		p("horiz", 1.0).p("hi", 0.0)
		p("c_top", Color(rc, 0.14)).p("c_mid", Color(1.0, 1.0, 1.0, 0.03)).p("mid", 0.6).p("c_foot", Color(1.0, 1.0, 1.0, 0.03))
		p("c_border", Color(rc, 0.22))
		if o.deal:
			p("c_inset", Color(MarketPanel.UP, 0.16)).p("inset", 22.0 * px)
		var ico := 44.0 * px
		_ico = UiBox.new(Vector2(ico, ico), 12.0 * px, 2.0)
		MenuKit.flat(_ico)
		_ico.p("border", 0.0).p("hi", 0.0).p("radial", Vector4(0.5, 0.4, 0.781, 0.781)).p("radial_stop", 0.75)
		_ico.p("c_top", Color(rc, 0.3)).p("c_foot", Color(0.0, 0.0, 0.0, 0.18))
		add_child(_ico)
		var art := TextureRect.new()
		art.texture = Icons.plunder(id, 40.0 * px)
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_SCALE
		art.size = Vector2(40.0, 40.0) * px
		art.position = Vector2(2.0, 2.0) * px
		art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_ico.add_child(art)
		_name = MarketPanel._words(Treasure.name_of(id), 700, 14.0, HudStyle.INK)
		add_child(_name)
		var f6 := HudStyle.font("inter", 600)
		var sz := roundi(11.0 * px)
		_line = UiText.new([[Treasure.RARITY_NAME[r], f6, sz, rc], [" · " + str(Treasure.CATEGORY_NAME[Treasure.cat_of(id)]), f6, sz, HudStyle.INK_3]], 0.0, 1.0)
		add_child(_line)
		var tr := float(_price) / Treasure.price_of(id) - 1.0
		var chip := MarketPanel._words(("%d%% under fair" % roundi(-tr * 100.0)) if o.deal else ("%d%% over fair" % roundi(tr * 100.0)), 700, 9.5, MarketPanel.GOOD if o.deal else HudStyle.INK_3)
		add_child(chip)
		_chips.append(chip)
		buy_btn = UiButton.new(Vector2(40.0, 30.0), 12.0 * px, 16.0 * px)
		buy_btn.squeeze = 0.95
		add_child(buy_btn)

	## A ship at the harbour master's desk (Fleet): one of yours, her hull
	## and tally, to pay off; or one for hire, her master's word, and her price.
	func _init_hand(o: Dictionary) -> void:
		var px := MarketPanel.PX
		_fw = true
		var mine := bool(o.mine)
		rc = HudStyle.AQUA if mine else HudStyle.GOLD
		_price = int(o.get("price", 0))
		MenuKit.flat(self)
		p("horiz", 1.0).p("hi", 0.0)
		p("c_top", Color(rc, 0.12)).p("c_mid", Color(1.0, 1.0, 1.0, 0.03)).p("mid", 0.6).p("c_foot", Color(1.0, 1.0, 1.0, 0.03))
		p("c_border", Color(rc, 0.22))
		var ico := 44.0 * px
		_ico = UiBox.new(Vector2(ico, ico), 12.0 * px, 2.0)
		MenuKit.flat(_ico)
		_ico.p("border", 0.0).p("hi", 0.0).p("radial", Vector4(0.5, 0.4, 0.781, 0.781)).p("radial_stop", 0.75)
		_ico.p("c_top", Color(rc, 0.3)).p("c_foot", Color(0.0, 0.0, 0.0, 0.18))
		add_child(_ico)
		var art := Icons.rect("hull", 28.0 * px, HudStyle.INK)
		art.position = Vector2(ico - art.size.x, ico - art.size.y) * 0.5
		_ico.add_child(art)
		_name = MarketPanel._words(str(o.name), 700, 14.0, HudStyle.INK)
		add_child(_name)
		var f6 := HudStyle.font("inter", 600)
		var sz := roundi(11.0 * px)
		_line = UiText.new([[str(ShipClass.named(str(o.cls)).name), f6, sz, rc], [" · Capt. " + str(o.master), f6, sz, HudStyle.INK_3]], 0.0, 1.0)
		add_child(_line)
		var chip := MarketPanel._words(str(o.chip), 600, 9.5, HudStyle.INK_3)
		add_child(chip)
		_chips.append(chip)
		buy_btn = UiButton.new(Vector2(40.0, 30.0), 12.0 * px, 16.0 * px)
		buy_btn.squeeze = 0.95
		add_child(buy_btn)

	## A ship's button at the desk as things stand.
	func set_hand(o: Dictionary, gold: int) -> void:
		if bool(o.mine):
			_set_buy("Pay off", false, true)
		elif bool(o.get("full", false)):
			_set_buy("Fleet full", false, false)
		else:
			_set_buy(MenuKit.num(_price), true, bool(o.get("can", gold >= _price)))

	## A lot's row as things stand: how many she has left, and its Buy (No
	## room while none of your holds can take another).
	func set_ware(n: int, room: bool, can: bool) -> void:
		remove_child(_name)
		_name.queue_free()
		var f7 := HudStyle.font("inter", 700)
		var px := MarketPanel.PX
		var runs: Array = [[Treasure.name_of(id), f7, roundi(14.0 * px), HudStyle.INK]]
		if n > 1:
			runs.append([" ×%d" % n, f7, roundi(12.0 * px), HudStyle.INK_3])
		_name = UiText.new(runs, 0.0, 1.0)
		add_child(_name)
		_set_buy(MenuKit.num(_price) if room else "No room", room, can)

	## A rocket's row as things stand: how many the locker holds, and its Buy
	## (Full once there's no room for another).
	func set_fw(owned: int, room: int, can: bool) -> void:
		var px := MarketPanel.PX
		var f6 := HudStyle.font("inter", 600)
		var sz := roundi(11.0 * px)
		remove_child(_line)
		_line.queue_free()
		_line = UiText.new([[_tier_name, f6, sz, rc], [" · %d in your locker" % owned, f6, sz, HudStyle.INK_3]], 0.0, 1.0)
		add_child(_line)
		_set_buy("Full" if room <= 0 else MenuKit.num(_price), room > 0, can)

	## Its Buy: the price in gold, lit while `can`; Owned once `owned`. Lays
	## the row out round it.
	func set_state(owned: bool, can: bool) -> void:
		_set_buy("Owned" if owned else MenuKit.num(_price), not owned, can)

	func _set_buy(text: String, coined: bool, can: bool) -> void:
		var px := MarketPanel.PX
		var owned := not coined
		for c in buy_btn.get_children():
			buy_btn.remove_child(c)
			c.queue_free()
		var t := MarketPanel._words(text, 800, 12.0, HudStyle.GOLD_INK if can else HudStyle.INK_3, 0.0, true)
		var d := 11.0 * px
		var x := 12.0 * px
		var bh := 16.0 * px + t.size.y
		if not owned:
			var coin := Icons.rect("coin", d * 1.5)
			coin.position = Vector2(x + d * 0.5, bh * 0.5) - coin.size * 0.5
			buy_btn.add_child(coin)
			x += d + 5.0 * px
		MenuKit.line_at(t, x, 0.0, bh)
		buy_btn.add_child(t)
		buy_btn.resize(Vector2(x + t.size.x + 12.0 * px, bh))
		buy_btn.p("border", 0.0).p("hi", 0.0)
		if can:
			buy_btn.p("c_top", HudStyle.GOLD_TOP).p("c_mid", HudStyle.GOLD_MID).p("mid", 0.52).p("c_foot", HudStyle.GOLD_FOOT)
			buy_btn.p("c_shadow", Color(0.941, 0.706, 0.275, 0.3)).p("shadow", Vector2(4.0, 14.0) * px)
		else:
			var fill := Color(1.0, 1.0, 1.0, 0.08)
			buy_btn.p("c_top", fill).p("c_mid", fill).p("c_foot", fill).p("c_shadow", Color(0.0, 0.0, 0.0, 0.0))
			buy_btn.cancel()
		buy_btn.enabled = can
		_lay()

	## Its portrait, what it is and does, and its Buy, for its width: as
	## tall as what it says needs (the stat lines wrap as they must).
	func _lay() -> void:
		var px := MarketPanel.PX
		var w := size.x
		var pad := 6.0 * px + 1.0
		var gap := 10.0 * px
		var wx := pad + 44.0 * px + gap
		var right := w - pad - buy_btn.size.x - gap
		var avail := maxf(20.0, right - wx)
		_name.cut_to(avail)
		_line.cut_to(avail)
		if _fw:
			for c in _chips:
				c.cut_to(avail)
		# the stat lines flow along under them, 4 apart, a dot before each but the first
		var at: Array[Vector2] = []
		var cx := 0.0
		var cy := 0.0
		var lh := 0.0
		for i in _chips.size():
			var c := _chips[i]
			lh = c.size.y
			var cw := c.size.x + ((_dots[i - 1].size.x + 4.0 * px) if i > 0 else 0.0)
			if cx > 0.0 and cx + 4.0 * px + cw > avail:
				cx = 0.0
				cy += lh + 4.0 * px
			elif cx > 0.0:
				cx += 4.0 * px
			at.append(Vector2(cx, cy))
			cx += cw
		var sh := (4.0 * px + cy + lh) if not _chips.is_empty() else 0.0
		var th := _name.size.y + _line.size.y + sh
		var h := maxf(44.0 * px, th) + pad * 2.0
		resize(Vector2(w, h))
		pivot_offset = size * 0.5
		_ico.position = Vector2(pad, (h - 44.0 * px) * 0.5)
		var ty := (h - th) * 0.5
		_name.position = Vector2(wx, ty)
		_line.position = Vector2(wx, ty + _name.size.y)
		var sy := ty + _name.size.y + _line.size.y + 4.0 * px
		for i in _chips.size():
			var x := wx + at[i].x
			if i > 0:
				_dots[i - 1].position = Vector2(x, sy + at[i].y)
				x += _dots[i - 1].size.x + 4.0 * px
			_chips[i].position = Vector2(x, sy + at[i].y)
		buy_btn.position = Vector2(w - pad - buy_btn.size.x, (h - buy_btn.size.y) * 0.5)


## Which way a price is going: "n each · " for a lot of several, a little
## triangle up or down (the web's ▲ and ▼, which the game's fonts don't
## carry) and how far, all in the trend's colour.
class _Trend:
	extends Control

	var _font: Font
	var _size := 19
	var _pre := ""
	var _post := ""
	var _up := true
	var _ink := Color.WHITE

	func _init(sz: int) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_size = sz
		_font = HudStyle.tnum(HudStyle.font("inter", 700))
		size = Vector2(0.0, _font.get_ascent(sz) + _font.get_descent(sz))

	func show_trend(pre: String, up: bool, post: String, ink: Color) -> void:
		_pre = pre
		_up = up
		_post = post
		_ink = ink
		size.x = _w(_pre) + _size * 0.88 + _w(_post)
		queue_redraw()

	func _w(s: String) -> float:
		return _font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, _size).x

	func _draw() -> void:
		var base := _font.get_ascent(_size)
		draw_string(_font, Vector2(0.0, base), _pre, HORIZONTAL_ALIGNMENT_LEFT, -1, _size, _ink)
		var x := _w(_pre)
		var tw := _size * 0.78
		var th := _size * 0.68
		var tex := Icons.svg("tri-up" if _up else "tri-down", '<path d="M12 1 23.5 23H.5z" fill="#ffffff"/>' if _up else '<path d="M.5 1h23L12 23z" fill="#ffffff"/>', Vector2(tw, th))
		draw_texture_rect(tex, Rect2(x + _size * 0.05, base - th, tw, th), false, _ink)
		draw_string(_font, Vector2(x + _size * 0.88, base), _post, HORIZONTAL_ALIGNMENT_LEFT, -1, _size, _ink)


## The empty hold's box: a dashed hairline round it (the web's 1px dashed border).
class _Dashed:
	extends Control

	var radius := 16.0

	func _draw() -> void:
		var c := HudStyle.STROKE_2
		var dash := 3.0 * MarketPanel.PX
		var r := minf(radius, minf(size.x, size.y) * 0.5)
		var a := Vector2(0.5, 0.5)
		var b := size - Vector2(0.5, 0.5)
		draw_dashed_line(Vector2(a.x + r, a.y), Vector2(b.x - r, a.y), c, 1.0, dash, true, true)
		draw_dashed_line(Vector2(b.x, a.y + r), Vector2(b.x, b.y - r), c, 1.0, dash, true, true)
		draw_dashed_line(Vector2(b.x - r, b.y), Vector2(a.x + r, b.y), c, 1.0, dash, true, true)
		draw_dashed_line(Vector2(a.x, b.y - r), Vector2(a.x, a.y + r), c, 1.0, dash, true, true)
		# the corners dashed too, a dash and a gap at a time round each quarter
		var corners := [[Vector2(b.x - r, a.y + r), -PI * 0.5], [Vector2(b.x - r, b.y - r), 0.0], [Vector2(a.x + r, b.y - r), PI * 0.5], [Vector2(a.x + r, a.y + r), PI]]
		var step := dash / maxf(r, 1.0)
		for k: Array in corners:
			var t := 0.0
			while t < PI * 0.5:
				var t1 := minf(t + step, PI * 0.5)
				draw_arc(k[0], r, float(k[1]) + t, float(k[1]) + t1, 3, c, 1.0, true)
				t += step * 2.0


## A coin in flight: from where it was won, over the top of its arc, into
## the purse; its clock (< 0: waiting its turn) and how long it takes.
class _Fly:
	extends RefCounted

	var node: TextureRect
	var a := Vector2.ZERO
	var m := Vector2.ZERO
	var b := Vector2.ZERO
	var t := 0.0
	var dur := 0.7
