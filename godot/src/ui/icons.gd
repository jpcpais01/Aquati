class_name Icons
## The HUD's little pictures, from the web game's SVG art: drawn once each by
## the engine's SVG rasterizer at the screen's real pixel density (so they stay
## crisp on a dense phone screen) and kept.
##
## Line icons are drawn in white with the web's 1.7 stroke on a 24 grid and
## tinted where they are used; the tally badges (coin, skull, isle, clock)
## and the sky badge's weathers carry their own colours.

const LINE := {
	"chev": '<path d="m9 5 7 7-7 7"/>',
	"chevL": '<path d="m15 5-7 7 7 7"/>',
	"cannon": '<path d="M3 9.6 15.6 7.2a1 1 0 0 1 1.1.8l.7 3.6a1 1 0 0 1-.8 1.2L4 15.2z" fill="#ffffff" fill-opacity=".9"/><path d="M17.6 7.6l2.6-.5.8 4-2.6.5"/><circle cx="8.5" cy="16.2" r="3.3" fill="#04121a" fill-opacity=".6"/><circle cx="8.5" cy="16.2" r=".8"/><path d="M13 19.5h7"/>',
	"refresh": '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
	"anchor": '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21M8 10.5h8M4.5 13.5c0 4 3.4 7.5 7.5 7.5s7.5-3.5 7.5-7.5M2.8 15.3l1.7-1.8 1.9 1.6M21.2 15.3l-1.7-1.8-1.9 1.6"/>',
	"target": '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/>',
	"wind": '<path d="M3 8.5h11a3 3 0 1 0-3-3M3 12.5h16a3 3 0 1 1-3 3M3 16.5h7"/>',
	"hull": '<path d="M2.5 10h19l-2.5 6.5a3 3 0 0 1-2.8 1.9H7.8A3 3 0 0 1 5 16.4z"/><path d="M4 13.2h16M12 4v6M12 4.5l5 4"/>',
	# the menus: settings, the sound, play and pause, the harbour, close
	"sliders": '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.4"/><circle cx="9.5" cy="17" r="2.4"/>',
	"sound": '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/>',
	"sound_off": '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
	"play": '<path d="M8 5.5v13l10.5-6.5z"/>',
	"pause": '<path d="M9 5.5v13M15 5.5v13"/>',
	"power": '<path d="M12 3.5v8"/><path d="M7 6.6a7.5 7.5 0 1 0 10 0"/>',
	"harbour": '<path d="M3 20h18M5 20V10l7-5 7 5v10M9.5 20v-5h5v5"/>',
	"close": '<path d="M6 6l12 12M18 6 6 18"/>',
	# a new build to download, and the tick of one that's current
	"download": '<path d="M12 3.5v11M7.2 10l4.8 4.8 4.8-4.8"/><path d="M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5"/>',
	"tick": '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
	# the corner's zoom button
	"zoom": '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5M8 10.5h5M10.5 8v5"/>',
	# a ship's qualities, on the harbour's bars (with "hull")
	"speed": '<path d="M3 8h9a3 3 0 1 0-3-3M3 12h14a3 3 0 1 1-3 3M3 16h6"/>',
	"agility": '<circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.6"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8"/>',
	"armour": '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6z"/><path d="M12 7v10"/>',
	"firepower": '<circle cx="9" cy="14" r="5.5"/><path d="M13 10l3.5-3.5M17 4.5l.8-1.5M19.5 7l1.5-.8M18.5 5.5l2-2"/>',
	# the trading port: Cast off, and the chandlery's repairs and fresh shot
	"flag": '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
	"hammer": '<path d="M14.5 4.5 19.5 9.5 17 12l-5-5zM12 7 4 15a2 2 0 0 0 0 2.8l.2.2a2 2 0 0 0 2.8 0L15 10"/>',
	# ashore: a hop up off the ground
	"jump": '<path d="M12 16V4.5M7 9.5l5-5 5 5M4.5 20h15"/>',
	# the captain's blades ashore: the cutlass and the flintlock
	"cutlass": '<path d="M5 19c6-3 11.5-9 14.5-15.5C14 6 8.5 11 6.6 16.4"/><path d="M3.5 15.5l5 5M4.6 20.3l-1.4 1.4"/>',
	"pistol": '<path d="M3 8.5h16.5V12H11l-1.2 1.4.6 1.6-1.7 4.5H5.4l1.7-6.2L3 12z"/><path d="M10.2 12.4c.6 1.4 1.8 1.7 2.6.8M18 8.5V7"/>',
	"shot": '<circle cx="9" cy="14" r="5"/><circle cx="16.5" cy="9" r="3.5"/><path d="M7.4 12.2a2 2 0 0 1 2-1.1"/>',
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

## The sky badge's weathers, by day and by night (the web's .sky icons), and
## the gold lock on a weather that waits for its time and place.
const SKY := {
	"sun": '<g stroke="#ffd27a" stroke-width="1.8" stroke-linecap="round"><path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8"/></g><circle cx="12" cy="12" r="4.6" fill="#ffd27a"/>',
	"moon": '<path d="M15.5 3.2a8.8 8.8 0 1 0 5.3 13.6A7.4 7.4 0 0 1 15.5 3.2z" fill="#dfe8ff"/><circle cx="5" cy="5" r="0.8" fill="#dfe8ff"/><circle cx="8.6" cy="2.6" r="0.55" fill="#dfe8ff"/>',
	"partly-sun": '<g stroke="#ffd27a" stroke-width="1.6" stroke-linecap="round"><path d="M8 1.5v2M2 7.5h2M3.8 3.3l1.4 1.4M12.2 3.3l-1.4 1.4"/></g><circle cx="8" cy="8" r="3.6" fill="#ffd27a"/><path transform="translate(0 1)" d="M7 18.5h10.5a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.7-1.2A4.6 4.6 0 0 0 7 18.5z" fill="#e9f1f5"/>',
	"partly-moon": '<path d="M10 1.8a6 6 0 1 0 3.6 9.3A5 5 0 0 1 10 1.8z" fill="#dfe8ff"/><path transform="translate(0 1)" d="M7 18.5h10.5a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.7-1.2A4.6 4.6 0 0 0 7 18.5z" fill="#c3cfdc"/>',
	"cloud": '<path transform="translate(0 -1)" d="M7 18.5h10.5a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.7-1.2A4.6 4.6 0 0 0 7 18.5z" fill="#d8e6ee"/>',
	"rain": '<path transform="translate(0 -4)" d="M7 18.5h10.5a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.7-1.2A4.6 4.6 0 0 0 7 18.5z" fill="#c2d0da"/><g stroke="#9fd0ff" stroke-width="1.6" stroke-linecap="round"><path d="M8 17.5l-1.2 3M12 17.5l-1.2 3M16 17.5l-1.2 3"/></g>',
	"storm": '<path transform="translate(0 -4)" d="M7 18.5h10.5a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.7-1.2A4.6 4.6 0 0 0 7 18.5z" fill="#8d9aa8"/><path d="M12.8 14.5h-3l-1.6 5h2.4l-1.2 4.2 5-6.2h-2.6z" fill="#ffe07a"/>',
	"mist": '<g stroke="#d8e6ee" stroke-width="1.8" stroke-linecap="round"><path d="M4 8h12M7 12h13M3 16h11M8 20h9"/></g>',
	"calm": '<path d="M6.4 12a5.6 5.6 0 0 1 11.2 0z" fill="#ffd27a"/><path d="M8.2 14.2a3.8 3.8 0 0 0 7.6 0z" fill="#ffd27a" opacity="0.45"/><g stroke="#d8eef7" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 13h19"/><path d="M5 18.5h5M14 18.5h5" opacity="0.6"/></g>',
	"calm-moon": '<path d="M13.4 3.4a5 5 0 1 0 3.2 7.6A4 4 0 0 1 13.4 3.4z" fill="#dfe8ff"/><path d="M13.4 22.6a5 5 0 1 1 3.2-7.6A4 4 0 0 0 13.4 22.6z" fill="#dfe8ff" opacity="0.35"/><path d="M2.5 13h19" stroke="#b9c8e6" stroke-width="1.6" stroke-linecap="round"/>',
	"glow": '<path d="M14.5 2.6a5 5 0 1 0 3.2 7.6A4 4 0 0 1 14.5 2.6z" fill="#dfe8ff"/><g fill="none" stroke="#46c8ff" stroke-width="1.7" stroke-linecap="round"><path d="M2.5 16q2.4-2 4.8 0t4.8 0 4.8 0 4.6 0"/><path d="M4.5 20.5q2.4-2 4.8 0t4.8 0 4.8 0" opacity="0.6"/></g><circle cx="6" cy="13" r="0.9" fill="#46c8ff"/><circle cx="17" cy="12.6" r="0.7" fill="#46c8ff"/>',
	"hot": '<circle cx="12" cy="8.5" r="5.2" fill="#ffb347"/><circle cx="12" cy="8.5" r="3" fill="#ffe08a"/><g fill="none" stroke="#ffd27a" stroke-width="1.5" stroke-linecap="round"><path d="M3.5 17.2q2-1.6 4 0t4 0 4 0 4 0"/><path d="M5.5 21q2-1.6 4 0t4 0 4 0" opacity="0.6"/></g>',
	"lock": '<g transform="scale(1.5)"><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="#ffd27a" stroke-width="1.8"/><rect x="3" y="7" width="10" height="8" rx="2" fill="#ffd27a"/></g>',
}

## The helmsman's art (the web's src/ui/helm.ts), each with its own strokes:
## the ship's wheel (on a 32 grid), the sail of "Sail there", the card's
## close cross and the lifted pin.
const HELM := {
	"wheel": ['<g fill="none" stroke="#ffffff" stroke-linecap="round"><circle cx="16" cy="16" r="9" stroke-width="2.2"/><circle cx="16" cy="16" r="2.6" stroke-width="2"/><path stroke-width="1.7" d="M16 2.2v11.2M16 18.6v11.2M2.2 16h11.2M18.6 16h11.2M6.2 6.2l7.9 7.9M17.9 17.9l7.9 7.9M25.8 6.2l-7.9 7.9M14.1 17.9l-7.9 7.9"/></g>', 32.0],
	"sail": ['<path d="M12 2.5v15M12 3.5c3.6 2.6 6 6.6 6.6 11.5H12M11 5.5C8.4 8 7 11.3 6.8 15H11" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 18.5h17l-1.8 2.2a2 2 0 0 1-1.5.8H6.8a2 2 0 0 1-1.5-.8z" fill="#ffffff"/>', 24.0],
	"x": ['<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>', 24.0],
	"pin_off": ['<path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z" fill="none" stroke="#ffffff" stroke-width="1.8"/><path d="M9.5 8.5l5 5M14.5 8.5l-5 5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>', 24.0],
}

## What special shot has done to a ship, on her bar (a 16 grid): ablaze, her
## canvas shredded, her gun crews cut down.
const MARK := {
	"flame": '<path d="M8 1c.6 2.6 3.8 4 3.8 8.2A3.8 3.8 0 0 1 4.2 9.4C4.2 7.6 5.3 6.4 6 5.6c.2 1.4.8 2 1.5 2.3C7 5.4 7.4 3 8 1z" fill="#ff8a3d"/><path d="M8 8.2c.4 1 1.6 1.6 1.6 3a1.6 1.6 0 0 1-3.2.1c0-.9.7-1.4 1-1.9.2.4.5.6.6.6z" fill="#ffe08a"/>',
	"torn": '<path d="M3 2h10l-1 5.2-2.2-1 .4 2.6L8 7.6 7 10.4 5.4 8.6 4 11.8 3 14z" fill="#d6efff"/><path d="M2.5 1.5h11" stroke="#9fb8c8" stroke-width="1.4" stroke-linecap="round"/>',
	"crew": '<circle cx="8" cy="4.6" r="2.6" fill="#e4d8ff"/><path d="M3.2 14c.4-3.4 2.2-5 4.8-5s4.4 1.6 4.8 5z" fill="#e4d8ff"/><path d="M2 2.5l12 11" stroke="#ff7563" stroke-width="1.8" stroke-linecap="round"/>',
}

## The Shipwright's art (the web's customizer icons), stroked a little
## heavier than the HUD's: its tabs, the way back, the die of "Surprise me"
## and the brush's tools.
const WRIGHT := {
	"sw_flag": '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
	"sw_sails": '<path d="M12 3v17"/><path d="M12 4c4 3 6 8 6 13h-6"/><path d="M11 6c-3 3-5 7-5 11h5"/><path d="M4 20h16"/>',
	"sw_hull": '<path d="M3 13h18l-2.5 6h-13z"/><path d="M7 13V9h7v4"/><path d="M10 9V5"/>',
	"sw_refit": '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>',
	"sw_star": '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
	"sw_skins": '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5-1.2-1.6-1.2-2.8 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.2-4-7.5-9-7.5z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
	"sw_guns": '<path d="M3 12.5l13-4 1.5 4.5-13 4z"/><circle cx="8" cy="18" r="2.5"/><path d="M18.5 9.5l2.5-1M19 12.5l2.5.5M17.5 7l1-2.5"/>',
	"sw_back": '<path d="M15 5l-7 7 7 7"/>',
	"die": '<rect x="4" y="4" width="16" height="16" rx="3.2"/><g fill="#ffffff" stroke="none"><circle cx="8.6" cy="8.6" r="1.55"/><circle cx="15.4" cy="8.6" r="1.55"/><circle cx="12" cy="12" r="1.55"/><circle cx="8.6" cy="15.4" r="1.55"/><circle cx="15.4" cy="15.4" r="1.55"/></g>',
	"pencil": '<path d="M4.5 19.5l1-4.4L15.6 5a2.1 2.1 0 0 1 3 3L8.5 18.1z"/><path d="M13.6 7l3 3"/>',
	"check": '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
	"eraser": '<path d="M9 5.5h11v13H9l-6-6.5z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/>',
	"undo": '<path d="M9 13.5 4.5 9 9 4.5"/><path d="M4.5 9h10a5 5 0 0 1 0 10H11"/>',
	"plus": '<path d="M12 5.5v13M5.5 12h13"/>',
	"lock": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
}

## The web's plunder, shot and ship part art (tools/bake_art.mjs), on a 40 grid.
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
	if WRIGHT.has(id):
		return svg(id, '<g fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">%s</g>' % WRIGHT[id], Vector2(size, size))
	if HELM.has(id):
		var v: float = HELM[id][1]
		return svg(id, HELM[id][0], Vector2(size, size), Rect2(0.0, 0.0, v, v))
	return svg(id, BADGE.get(id, SKY.get(id, "")), Vector2(size, size))


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
	var inner: String = _art("shot" if shot else "loot").get(id, "")
	return svg(("shot:" if shot else "loot:") + id, inner, Vector2(size, size), Rect2(0, 0, 40, 40))


## A ship part's portrait (Parts), or a slot's standard fit ("standard:" +
## its slot), `size` HUD units across.
static func part(id: String, size: float) -> Texture2D:
	return svg("part:" + id, _art("parts").get(id, ""), Vector2(size, size), Rect2(0, 0, 40, 40))


static func _art(kind: String) -> Dictionary:
	if _plunder.is_empty():
		var f := FileAccess.open("res://art/plunder.json", FileAccess.READ)
		var got: Variant = JSON.parse_string(f.get_as_text()) if f != null else null
		_plunder = got if got is Dictionary else {}
	return _plunder.get(kind, {})


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
