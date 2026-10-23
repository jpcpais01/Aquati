class_name Icons
## The HUD's little pictures, from the web game's SVG art: drawn once each by
## the engine's SVG rasterizer at the screen's real pixel density (so they stay
## crisp on a dense phone screen) and kept.
##
## Line icons are drawn in white with the web's 1.7 stroke on a 24 grid and
## tinted where they are used; the tally badges (coin, skull, isle, clock)
## carry their own colours.

const LINE := {
	"chev": '<path d="m9 5 7 7-7 7"/>',
	"chevL": '<path d="m15 5-7 7 7 7"/>',
	"cannon": '<path d="M3 9.6 15.6 7.2a1 1 0 0 1 1.1.8l.7 3.6a1 1 0 0 1-.8 1.2L4 15.2z" fill="#ffffff" fill-opacity=".9"/><path d="M17.6 7.6l2.6-.5.8 4-2.6.5"/><circle cx="8.5" cy="16.2" r="3.3" fill="#04121a" fill-opacity=".6"/><circle cx="8.5" cy="16.2" r=".8"/><path d="M13 19.5h7"/>',
	"refresh": '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
	"anchor": '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21M8 10.5h8M4.5 13.5c0 4 3.4 7.5 7.5 7.5s7.5-3.5 7.5-7.5M2.8 15.3l1.7-1.8 1.9 1.6M21.2 15.3l-1.7-1.8-1.9 1.6"/>',
	"target": '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/>',
	"wind": '<path d="M3 8.5h11a3 3 0 1 0-3-3M3 12.5h16a3 3 0 1 1-3 3M3 16.5h7"/>',
	"hull": '<path d="M2.5 10h19l-2.5 6.5a3 3 0 0 1-2.8 1.9H7.8A3 3 0 0 1 5 16.4z"/><path d="M4 13.2h16M12 4v6M12 4.5l5 4"/>',
}

## The tally badges, as the web draws them in CSS gradients: each a 16 wide
## disc on the 24 grid, leaving room round the coin for its glow (so a badge
## is drawn half again as big as the disc it shows).
const BADGE := {
	"coin": '<defs><radialGradient id="c" cx="0.35" cy="0.35" r="0.92"><stop offset="0" stop-color="#fff1b8"/><stop offset="0.5" stop-color="#efc463"/><stop offset="1" stop-color="#b5801f"/></radialGradient><radialGradient id="g"><stop offset="0.66" stop-color="#efc463" stop-opacity="0.3"/><stop offset="1" stop-color="#efc463" stop-opacity="0"/></radialGradient></defs><circle cx="12" cy="12" r="12" fill="url(#g)"/><circle cx="12" cy="12" r="8" fill="url(#c)"/>',
	"skull": '<defs><radialGradient id="h" cx="0.5" cy="0.4" r="0.78"><stop offset="0.4" stop-color="#f4ecdc"/><stop offset="1" stop-color="#b9ab92"/></radialGradient></defs><path d="M4 11.4C4 6.9 7.6 4 12 4s8 2.9 8 7.4v2.4C20 17.6 16.4 20 12 20s-8-2.4-8-6.2z" fill="url(#h)"/><circle cx="9.6" cy="11.2" r="1.5" fill="#1a2a30"/><circle cx="14.4" cy="11.2" r="1.5" fill="#1a2a30"/>',
	"isle": '<circle cx="12" cy="12" r="8" fill="#2bb5ad"/><circle cx="12" cy="13.6" r="6.9" fill="#f3e6c4"/><circle cx="12" cy="13.6" r="4.4" fill="#6fb043"/><circle cx="12" cy="12" r="8" fill="none" stroke="#2bb5ad" stroke-width="1.2"/>',
	"clock": '<circle cx="12" cy="12" r="7.2" fill="none" stroke="#5ee3d4" stroke-width="1.9"/><path d="M11.1 7.6v5.1h4.6" fill="none" stroke="#5ee3d4" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
	# the hold: a little crate, a plank across it
	"crate": '<defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d2a160"/><stop offset="1" stop-color="#9a6a3c"/></linearGradient></defs><rect x="4" y="4" width="16" height="16" rx="4.4" fill="url(#w)"/><path d="M5.6 18.4 18.4 5.6" stroke="#6e4a28" stroke-width="2.3"/><rect x="5.1" y="5.1" width="13.8" height="13.8" rx="3.4" fill="none" stroke="#6e4a28" stroke-width="2.2"/>',
}

## What special shot has done to a ship, on her bar (a 16 grid): ablaze, her
## canvas shredded, her gun crews cut down.
const MARK := {
	"flame": '<path d="M8 1c.6 2.6 3.8 4 3.8 8.2A3.8 3.8 0 0 1 4.2 9.4C4.2 7.6 5.3 6.4 6 5.6c.2 1.4.8 2 1.5 2.3C7 5.4 7.4 3 8 1z" fill="#ff8a3d"/><path d="M8 8.2c.4 1 1.6 1.6 1.6 3a1.6 1.6 0 0 1-3.2.1c0-.9.7-1.4 1-1.9.2.4.5.6.6.6z" fill="#ffe08a"/>',
	"torn": '<path d="M3 2h10l-1 5.2-2.2-1 .4 2.6L8 7.6 7 10.4 5.4 8.6 4 11.8 3 14z" fill="#d6efff"/><path d="M2.5 1.5h11" stroke="#9fb8c8" stroke-width="1.4" stroke-linecap="round"/>',
	"crew": '<circle cx="8" cy="4.6" r="2.6" fill="#e4d8ff"/><path d="M3.2 14c.4-3.4 2.2-5 4.8-5s4.4 1.6 4.8 5z" fill="#e4d8ff"/><path d="M2 2.5l12 11" stroke="#ff7563" stroke-width="1.8" stroke-linecap="round"/>',
}

## The web's plunder and shot art (tools/bake_art.mjs), on a 40 grid.
static var _plunder := {}

static var _cache := {}
static var _density := 0.0


## Screen pixels per HUD unit: the canvas stretch on this display.
static func density() -> float:
	if _density <= 0.0:
		var win := DisplayServer.window_get_size()
		var k := minf(win.x / 1280.0, win.y / 720.0) if win.x > 0 and win.y > 0 else 1.0
		# a quarter step up, so a texture is never stretched past its pixels
		_density = clampf(ceilf(k * 4.0) / 4.0, 1.0, 3.0)
	return _density


## The icon `id`, `size` HUD units across.
static func texture(id: String, size: float) -> Texture2D:
	if LINE.has(id):
		return svg(id, '<g fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">%s</g>' % LINE[id], Vector2(size, size))
	return svg(id, BADGE.get(id, ""), Vector2(size, size))


## Any SVG art (`inner`, on a `view` grid) drawn `size` HUD units across,
## kept under `key`; with `mips` for a shader to blur it by its mip levels.
static func svg(key: String, inner: String, size: Vector2, view := Rect2(0, 0, 24, 24), mips := false) -> Texture2D:
	var px := Vector2i(maxi(4, ceili(size.x * density())), maxi(4, ceili(size.y * density())))
	var ck := "%s@%dx%d%s" % [key, px.x, px.y, "m" if mips else ""]
	if _cache.has(ck):
		return _cache[ck]
	var doc := '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="%s %s %s %s" preserveAspectRatio="none">%s</svg>' % [px.x, px.y, view.position.x, view.position.y, view.size.x, view.size.y, inner]
	var img := Image.new()
	var tex: Texture2D = null
	if img.load_svg_from_string(doc) == OK:
		if mips:
			img.generate_mipmaps()
		tex = ImageTexture.create_from_image(img)
	_cache[ck] = tex
	return tex


## A good of the plunder (Treasure), or with `shot` a kind of shot (Ammo.ID),
## `size` HUD units across.
static func plunder(id: String, size: float, shot := false) -> Texture2D:
	if _plunder.is_empty():
		var f := FileAccess.open("res://art/plunder.json", FileAccess.READ)
		var got: Variant = JSON.parse_string(f.get_as_text()) if f != null else null
		_plunder = got if got is Dictionary else {"loot": {}, "shot": {}}
	var inner: String = (_plunder.get("shot", {}) if shot else _plunder.get("loot", {})).get(id, "")
	return svg(("shot:" if shot else "loot:") + id, inner, Vector2(size, size), Rect2(0, 0, 40, 40))


## A mark on an enemy ship's bar (MARK), `size` HUD units across, with a
## dark copy of itself a hair below and round it, so it reads on any sky.
static func mark(id: String, size: float) -> Texture2D:
	var inner: String = MARK.get(id, "")
	var dark := RegEx.create_from_string('(fill|stroke)="#[0-9a-fA-F]+"').sub(inner, '$1="#000"', true)
	return svg("mark:" + id, '<g transform="translate(0 0.7)" opacity="0.5" stroke="#000" stroke-width="1.3" stroke-linejoin="round">%s</g>%s' % [dark, inner], Vector2(size, size), Rect2(0, 0, 16, 16))


## A TextureRect showing the icon `size` units square, tinted `tint`.
static func rect(id: String, size: float, tint: Color = Color.WHITE) -> TextureRect:
	var r := TextureRect.new()
	r.texture = texture(id, size)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.custom_minimum_size = Vector2(size, size)
	r.size = r.custom_minimum_size
	r.self_modulate = tint
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r
