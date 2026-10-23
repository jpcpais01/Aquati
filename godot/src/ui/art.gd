class_name Art
## The web game's drawn art (src/ui/art.ts) as SVG for Icons.svg to raster:
## a ship class's side-on silhouette and the compass-rose crest.


## A ship of class `c` side on, bow to the right, as [svg, viewBox]: her
## canvas in `sail`, hull in `hull`, masts and yards stroked in `spar`; and
## in `more`, if given, her wale ("trim", "trim_w" wide), gun ports ("port")
## and the pennant at her tallest masthead ("flag").
static func ship(c: ShipClass, hull: Color, sail: Color, spar: Color, more := {}) -> Array:
	var L := c.length
	var draft := c.draft * 0.75
	var sc := c.stern_castle
	var fc := c.fore_castle
	var sch := float(sc.get("h", 0.0))
	var fch := float(fc.get("h", 0.0))
	# the hull: stern, castles, the sheer, the stem sweeping down to the forefoot, the keel
	var d := ["M" + _p(-0.25, _deck(c, 0.0) + sch + 0.15)]
	if not sc.is_empty():
		d.append("L" + _p(float(sc.t) * L, _deck(c, sc.t) + sch))
		d.append("L" + _p(float(sc.t) * L + 0.25, _deck(c, sc.t)))
	var t0 := float(sc.get("t", 0.0))
	var t1 := float(fc.get("t", 1.0))
	for i in range(1, 11):
		var t := t0 + (t1 - t0) * i / 10.0
		d.append("L" + _p(t * L, _deck(c, t)))
	if not fc.is_empty():
		d.append("L" + _p(float(fc.t) * L - 0.25, _deck(c, fc.t) + fch))
		d.append("L" + _p(L, _deck(c, 1.0) + fch))
	d.append("Q" + _p(L * 0.99, _deck(c, 1.0) * 0.2) + " " + _p(L * 0.86, -draft))
	d.append("L" + _p(L * 0.1, -draft))
	d.append("Q" + _p(0.1, -draft * 0.6) + " " + _p(0.35, 0.4))
	d.append("Z")
	# the rig
	var sails := ""
	var masts := ""
	var yards := ""
	var bow_y := _deck(c, 1.0) + fch
	var sprit := Vector2(L + c.bowsprit * 0.92, bow_y + c.bowsprit * 0.32)
	masts += "M%sL%s" % [_p(L - 1.0, bow_y - 0.2), _p(sprit.x, sprit.y)]
	var fore: Dictionary = c.masts[0]
	for m: Dictionary in c.masts:
		if float(m.t) > float(fore.t):
			fore = m
	if c.jib:
		var mx := float(fore.t) * L
		var top := _deck(c, fore.t) + float(fore.height) * 0.78
		sails += "M%sQ%s %sL%sZ" % [_p(mx + 0.3, top), _p((mx + sprit.x) * 0.5 + 0.6, (top + sprit.y) * 0.5 + 0.6), _p(sprit.x - 0.4, sprit.y + 0.1), _p(L - 0.2, bow_y + 1.2)]
	var max_top := 0.0
	for m: Dictionary in c.masts:
		var x := float(m.t) * L
		var base := _deck(c, m.t)
		var h := float(m.height)
		max_top = maxf(max_top, base + h)
		masts += "M%sL%s" % [_p(x, base - 0.5), _p(x, base + h)]
		match str(m.rig):
			"square":
				var y0 := base + h * 0.2
				var tiers := int(m.get("tiers", 1))
				var th := (base + h * 0.92 - y0) / tiers
				for k in tiers:
					var lo := y0 + th * k + 0.25
					var hi := y0 + th * (k + 1) - 0.25
					var wl := L * 0.15 * (1.0 - k * 0.16)
					var wh := wl * 0.86
					# a gentle belly on the leading and trailing edges
					sails += "M%sL%sQ%s %sL%sQ%s %sZ" % [_p(x - wh, hi), _p(x + wh, hi), _p(x + wl + 0.7, (lo + hi) * 0.5), _p(x + wl, lo), _p(x - wl, lo), _p(x - wl - 0.35, (lo + hi) * 0.5), _p(x - wh, hi)]
					yards += "M%sL%s" % [_p(x - wh - 0.4, hi + 0.15), _p(x + wh + 0.4, hi + 0.15)]
				if m.get("top", false):
					var ty := y0 + th * mini(1, tiers - 1) + 0.1
					yards += "M%sL%s" % [_p(x - 0.8, ty), _p(x + 0.8, ty)]
			"gaff":
				var boom := base + 1.6
				var peak := base + h * 0.86
				var reach := L * 0.42
				sails += "M%sL%sQ%s %sL%sZ" % [_p(x - 0.2, peak - 0.6), _p(x - reach * 0.78, peak + 0.4), _p(x - reach * 0.78, (peak + boom) * 0.5), _p(x - reach, boom), _p(x - 0.2, boom)]
				yards += "M%sL%sM%sL%s" % [_p(x, boom), _p(x - reach - 0.4, boom - 0.2), _p(x, peak - 0.6), _p(x - reach * 0.82, peak + 0.5)]
			_:
				var lo := base + 1.8
				var hi := base + h * 0.95
				sails += "M%sL%sQ%s %sZ" % [_p(x + L * 0.07, lo + 1.2), _p(x - L * 0.15, hi), _p(x - L * 0.11, (lo + hi) * 0.5), _p(x - L * 0.13, lo)]
				yards += "M%sL%s" % [_p(x + L * 0.08, lo + 1.0), _p(x - L * 0.16, hi + 0.3)]
	# the viewBox fits the drawing
	max_top += 0.6
	var gaff := false
	for m: Dictionary in c.masts:
		gaff = gaff or str(m.rig) == "gaff"
	var min_x := -(maxf(0.0, L * 0.42 - L * float(c.masts[0].t)) + 1.2 if gaff else 1.2)
	var view := Rect2(min_x, -max_top, sprit.x + 0.8 - min_x, max_top + draft + 0.6)
	var svg := '<path d="%s" fill="%s" fill-opacity="%.3f"/>' % [sails, _hex(sail), sail.a]
	svg += '<path d="%s" fill="none" stroke="%s" stroke-opacity="%.3f" stroke-width="0.45" stroke-linecap="round"/>' % [masts, _hex(spar), spar.a]
	svg += '<path d="%s" fill="none" stroke="%s" stroke-opacity="%.3f" stroke-width="0.3" stroke-linecap="round"/>' % [yards, _hex(spar), spar.a]
	svg += '<path d="%s" fill="%s" fill-opacity="%.3f"/>' % [" ".join(d), _hex(hull), hull.a]
	var fb := c.freeboard + c.bulwark * 0.6
	if more.has("trim"):
		# a bright wale along her side
		var trim: Color = more.trim
		var wale := ""
		for i in 11:
			var t := 0.03 + i * 0.09
			wale += ("L" if i > 0 else "M") + _p(t * L, _deck(c, t) - fb * 0.42)
		svg += '<path d="%s" fill="none" stroke="%s" stroke-opacity="%.3f" stroke-width="%.2f"/>' % [wale, _hex(trim), trim.a, float(more.get("trim_w", 0.3))]
	if more.has("port"):
		var port: Color = more.port
		for i in c.cannons_per_side:
			var t := lerpf(c.cannon_span.x, c.cannon_span.y, float(i) / maxi(1, c.cannons_per_side - 1))
			svg += '<rect x="%.2f" y="%.2f" width="0.64" height="0.55" rx="0.12" fill="%s" fill-opacity="%.3f"/>' % [t * L - 0.32, -(_deck(c, t) - fb * 0.62), _hex(port), port.a]
	if more.has("flag"):
		# a pennant streaming aft from the tallest masthead
		var flag: Color = more.flag
		var main: Dictionary = c.masts[0]
		for m: Dictionary in c.masts:
			if float(m.height) > float(main.height):
				main = m
		var px := float(main.t) * L
		var py := _deck(c, main.t) + float(main.height)
		svg += '<path d="M%sQ%s %sL%sZ" fill="%s" fill-opacity="%.3f"/>' % [_p(px, py), _p(px - 1.6, py - 0.2), _p(px - 3.4, py - 0.55), _p(px, py - 1.3), _hex(flag), flag.a]
	return [svg, view]


## The crest's gold (top to foot), for the ring, the dial and the rose.
const _GOLD := '<linearGradient id="%s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset=".55" stop-color="#efc463"/><stop offset="1" stop-color="#b98227"/></linearGradient>'

## The crest's still parts on a 64 grid: the gold ring and the dotted dial.
static func crest_ring() -> String:
	return ('<defs>%s%s</defs>' % [_GOLD % "a", _GOLD % "c"]) + \
			'<circle cx="32" cy="32" r="27" fill="none" stroke="url(#a)" stroke-width="1.6" opacity=".85"/>' + \
			'<circle cx="32" cy="32" r="22.5" fill="none" stroke="url(#c)" stroke-width=".8" stroke-dasharray="1.2 3.2" opacity=".8"/>'


## The crest's compass rose, which turns.
static func crest_rose() -> String:
	return ('<defs>%s</defs>' % (_GOLD % "b")) + \
			'<path d="M32 6 36 28 32 32 28 28Z M32 58 28 36 32 32 36 36Z M6 32 28 28 32 32 28 36Z M58 32 36 36 32 32 36 28Z" fill="url(#b)"/>' + \
			'<path d="M32 6 32 32 28 28Z M32 58 32 32 36 36Z M6 32 32 32 28 36Z M58 32 32 32 36 28Z" fill="#8a5a17" opacity=".45"/>' + \
			'<path d="M32 16 34 30 32 32 30 30Z M32 48 30 34 32 32 34 34Z M16 32 30 30 32 32 30 34Z M48 32 34 34 32 32 34 30Z" fill="url(#b)" opacity=".7" transform="rotate(45 32 32)"/>' + \
			'<circle cx="32" cy="32" r="2.4" fill="#0b3546" stroke="url(#b)" stroke-width="1.2"/>'


## The deck's height at t (0 stern .. 1 bow): freeboard, bulwark and sheer.
static func _deck(c: ShipClass, t: float) -> float:
	var s := c.sheer_stern * pow((0.5 - t) / 0.5, 2.0) if t < 0.5 else c.sheer_bow * pow((t - 0.5) / 0.5, 2.0)
	return c.freeboard + c.bulwark * 0.6 + s


## A point, with SVG's y growing downwards.
static func _p(x: float, y: float) -> String:
	return "%.2f %.2f" % [x, -y]


static func _hex(c: Color) -> String:
	return "#" + c.to_html(false)
