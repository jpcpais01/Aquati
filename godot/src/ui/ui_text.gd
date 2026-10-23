class_name UiText
extends Control
## Text laid out as the web game sets it: runs of words, each in its own font,
## size and colour, wrapped to a width or cut to one line with an ellipsis,
## aligned within a width, with an optional halo or strike-through. Drawn
## in one item (no Label per run). Shared by the farewell card and the menus.

## [text, font, size, colour] each.
var runs: Array = []
var wrap := 0.0
var lead := 1.25
var align := HORIZONTAL_ALIGNMENT_LEFT
## A width to align within (0: the text's own).
var fixed := 0.0
var halo := Color(0.0, 0.0, 0.0, 0.0)
var strike := Color(0.0, 0.0, 0.0, 0.0)
var _items: Array = []
var _widths: Array[float] = []
var _asc := 0.0
var _lh := 0.0
var _cut := 0.0


func _init(p_runs: Array, p_wrap := 0.0, p_lead := 1.25) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	runs = p_runs
	wrap = p_wrap
	lead = p_lead
	_layout()


func set_runs(p_runs: Array) -> void:
	runs = p_runs
	_layout()
	queue_redraw()


## Replaces a one-run text's words.
func set_text(text: String) -> void:
	if runs.is_empty() or str(runs[0][0]) == text:
		return
	runs[0][0] = text
	_layout()
	queue_redraw()


## Cuts it to one line of at most w, ending in an ellipsis.
func cut_to(w: float) -> void:
	_cut = w
	_layout()


## Aligns it within a width of its own.
func fit(w: float) -> void:
	fixed = w
	_layout()


func baseline() -> float:
	return _asc


func _layout() -> void:
	_items.clear()
	_widths.clear()
	var asc := 0.0
	var desc := 0.0
	var big := 0.0
	for r: Array in runs:
		var f: Font = r[1]
		asc = maxf(asc, f.get_ascent(r[2]))
		desc = maxf(desc, f.get_descent(r[2]))
		big = maxf(big, float(r[2]))
	_lh = maxf(asc + desc, big * lead)
	_asc = asc + (_lh - asc - desc) * 0.5
	var line := 0
	var x := 0.0
	_widths.append(0.0)
	for r: Array in runs:
		var f: Font = r[1]
		var sz: int = r[2]
		var words := str(r[0]).split(" ")
		for i in words.size():
			var w := words[i] + (" " if i < words.size() - 1 else "")
			if w == "":
				continue
			var adv := f.get_string_size(w, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
			var ink := f.get_string_size(w.strip_edges(false, true), HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
			if wrap > 0.0 and x > 0.0 and x + ink > wrap:
				line += 1
				x = 0.0
				_widths.append(0.0)
				if w.strip_edges() == "":
					continue
			_items.append([x, line, w, f, sz, r[3]])
			_widths[line] = x + ink
			x += adv
	if _cut > 0.0 and _widths[0] > _cut:
		_ellipsize()
	var lines := line + 1
	var mw := 0.0
	for w in _widths:
		mw = maxf(mw, w)
	custom_minimum_size = Vector2(maxf(mw, fixed), lines * _lh)
	size = custom_minimum_size


func _ellipsize() -> void:
	# drop whole items that start past the cut, then letters off the last
	while _items.size() > 1 and float(_items[-1][0]) > _cut:
		_items.pop_back()
	var it: Array = _items[-1]
	var f: Font = it[3]
	var sz: int = it[4]
	var text: String = str(it[2]).strip_edges(false, true)
	while text.length() > 1 and float(it[0]) + f.get_string_size(text + "…", HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x > _cut:
		text = text.left(text.length() - 1).strip_edges(false, true)
	it[2] = text + "…"
	_widths[0] = float(it[0]) + f.get_string_size(it[2], HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x


func _draw() -> void:
	var w := maxf(size.x, fixed)
	for it: Array in _items:
		var line: int = it[1]
		var x0 := 0.0
		if align == HORIZONTAL_ALIGNMENT_CENTER:
			x0 = (w - _widths[line]) * 0.5
		elif align == HORIZONTAL_ALIGNMENT_RIGHT:
			x0 = w - _widths[line]
		var at := Vector2(x0 + float(it[0]), line * _lh + _asc)
		var f: Font = it[3]
		var sz: int = it[4]
		if halo.a > 0.0:
			draw_string_outline(f, at + Vector2(0.0, sz * 0.06), it[2], HORIZONTAL_ALIGNMENT_LEFT, -1, sz, maxi(2, roundi(sz * 0.22)), halo)
		draw_string(f, at, it[2], HORIZONTAL_ALIGNMENT_LEFT, -1, sz, it[5])
	if strike.a > 0.0:
		for line in _widths.size():
			var x0 := (w - _widths[line]) * 0.5 if align == HORIZONTAL_ALIGNMENT_CENTER else 0.0
			var y := line * _lh + _asc - float(runs[0][2]) * 0.3
			draw_line(Vector2(x0, y), Vector2(x0 + _widths[line], y), strike, maxf(1.0, float(runs[0][2]) * 0.08))
