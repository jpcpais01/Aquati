class_name Portrait
extends RefCounted
## The Brethren's wanted posters' engraved busts (the web game's portrait(),
## src/ui/bounty.ts): hat, hair, beard, brows, mouth, a patch, a scar or an
## earring, as SVG drawn to a texture. The engraving's hatching and stipple
## are SVG patterns there; here (the rasterizer draws no patterns) they're
## the ink laid on thin.

const INK := "#2b1a0d"
const HAIR := "#6a472a"
const SKIN := "#efd9ae"
const SKIN2 := "#d3b17f"
const COAT := "#3b2717"
## The engraving's hatching and its stipple, as flat washes of ink.
const HATCH := 'fill="#2b1a0d" fill-opacity=".3"'
const DOTS := 'fill="#2b1a0d" fill-opacity=".24"'

const BROWS := {
	0: ["M39 50.5 L46 51", "M54 51 L61 50.5"],
	1: ["M38.5 48.6 L46 52", "M54 52 L61.5 48.6"],
	-1: ["M38.5 51 Q42.5 47.6 46 50.4", "M54 50.4 Q57.5 47.6 61.5 51"],
}
const MOUTHS := {0: "M45 70 Q50 70.8 55 70", 1: "M45 70.2 Q51 71.8 56 68.4", -1: "M44.5 71 Q50 68.2 55.5 71"}

static var _cache := {}


## A bust (`face`, Bounty's), `size` HUD units tall (100 x 110 on its grid);
## `unknown` draws a shadowed silhouette with a question mark.
static func texture(face: Dictionary, size: float, unknown := false) -> Texture2D:
	var key := "%s|%s|%d" % [str(face), unknown, roundi(size)]
	if _cache.has(key):
		return _cache[key]
	var h := maxi(8, ceili(size * Icons.density()))
	var w := maxi(8, roundi(h * 100.0 / 110.0))
	var doc := '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 100 110">%s</svg>' % [w, h, inner(face, unknown)]
	var img := Image.new()
	var tex: Texture2D = null
	if img.load_svg_from_string(doc) == OK:
		img.generate_mipmaps()
		tex = ImageTexture.create_from_image(img)
	_cache[key] = tex
	return tex


static func inner(f: Dictionary, unknown := false) -> String:
	if unknown:
		var sil := "#3a2a1b"
		return ('<path d="M6 110C10 94 24 88 38 86h24c14 2 28 8 32 24z" fill="%s"/>' % sil
			+ '<path d="M43 72v16h14V72z" fill="%s"/>' % sil
			+ '<ellipse cx="50" cy="56" rx="17" ry="21" fill="%s"/>' % sil
			+ '<path d="M18 42c12 4 22-12 32-12s20 16 32 12c-6-8-16-20-32-20S24 34 18 42z" fill="%s"/>' % sil
			+ '<path d="M44.5 52.5c0-3.6 2.6-5.8 5.8-5.8s5.6 2.1 5.6 5.1c0 4.6-5 4.8-5 9" stroke="#d9c08c" stroke-opacity=".85" stroke-width="3.4" stroke-linecap="round" fill="none"/><circle cx="50.9" cy="67" r="2.1" fill="#d9c08c" fill-opacity=".85"/>')
	var p := PackedStringArray()
	var hat := str(f.get("hat", "none"))
	var hair := str(f.get("hair", "short"))
	# hair behind the head
	if hair == "long":
		p.append('<path d="M31.5 52C28 72 31 92 24 106h52c-7-14-4-34-7.5-54z" fill="%s"/><path d="M33 60c-1 16 0 30-5 42M67 60c1 16 0 30 5 42" stroke="%s" stroke-width=".6" stroke-opacity=".5" fill="none"/>' % [HAIR, INK])
	if hair == "braids":
		p.append('<path d="M33 58q-4 22 0 42M67 58q4 22 0 42" stroke="%s" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M30 66l6 3M30 74l6 3M30 82l6 3M30 90l6 3M64 69l6-3M64 77l6-3M64 85l6-3M64 93l6-3" stroke="%s" stroke-width=".7" stroke-opacity=".55"/><circle cx="33" cy="101" r="2" fill="#a8322a"/><circle cx="67" cy="101" r="2" fill="#a8322a"/>' % [HAIR, INK])
	if hair == "curls":
		for c: Vector2 in [Vector2(32, 50), Vector2(30, 60), Vector2(31.5, 70), Vector2(68, 50), Vector2(70, 60), Vector2(68.5, 70), Vector2(36, 41), Vector2(64, 41)]:
			p.append('<circle cx="%s" cy="%s" r="6" fill="%s"/><circle cx="%s" cy="%s" r="6" fill="%s" fill-opacity=".1"/>' % [c.x, c.y, HAIR, c.x, c.y, INK])
	if hair == "tied":
		p.append('<path d="M64 62q11 9 7 30" stroke="%s" stroke-width="6.5" stroke-linecap="round" fill="none"/><path d="M64.5 64l4-1" stroke="#a8322a" stroke-width="2.2"/>' % HAIR)
	# coat, lapels, shirt, neck, ears, face and its shadow side
	p.append('<path d="M6 110C10 94 24 88 38 86h24c14 2 28 8 32 24z" fill="%s"/>' % COAT)
	p.append('<path d="M62 88c12 2 24 8 28 22H66z" %s/>' % HATCH)
	p.append('<path d="M38 86l12 18 12-18h-5l-7 10-7-10z" fill="#7a5232"/><path d="M43 86l7 10 7-10z" fill="#e8d6ac"/>')
	p.append('<circle cx="50" cy="103" r="1.2" fill="#c9962e"/><circle cx="50" cy="108" r="1.2" fill="#c9962e"/>')
	p.append('<path d="M43 72v16h14V72z" fill="%s"/>' % SKIN2)
	p.append('<ellipse cx="33" cy="58" rx="3.3" ry="5" fill="%s"/><ellipse cx="67" cy="58" rx="3.3" ry="5" fill="%s"/>' % [SKIN2, SKIN2])
	p.append('<ellipse cx="50" cy="56" rx="17" ry="21" fill="%s" stroke="%s" stroke-width=".7"/>' % [SKIN, INK])
	p.append('<path d="M50 35c12 0 17 11 17 21 0 14-7 21-17 21 8-7 10-17 8-29-1-6-4-11-8-13z" %s/>' % HATCH)
	# the fringe over the forehead
	if hair != "bald" and hat != "hood":
		p.append('<path d="M33 50c1-14 11-18 17-18 8 0 17 5 17 18-5-8-11-10-17-10s-12 3-17 10z" fill="%s"/>' % HAIR)
	if hair == "bald":
		p.append('<path d="M41 39q6-3 12-1" stroke="#fff6e0" stroke-width="1.6" stroke-linecap="round" stroke-opacity=".7" fill="none"/>')
	# the face
	var brows: Array = BROWS.get(int(f.get("brow", 0)), BROWS[0])
	p.append('<path d="%s" stroke="%s" stroke-width="1.9" stroke-linecap="round" fill="none"/><path d="%s" stroke="%s" stroke-width="1.9" stroke-linecap="round" fill="none"/>' % [brows[0], INK, brows[1], INK])
	p.append('<ellipse cx="42.5" cy="55.4" rx="2.5" ry="1.35" fill="%s"/><ellipse cx="57.5" cy="55.4" rx="2.5" ry="1.35" fill="%s"/>' % [INK, INK])
	p.append('<circle cx="43.3" cy="55" r=".45" fill="#fff4dc"/><circle cx="58.3" cy="55" r=".45" fill="#fff4dc"/>')
	p.append('<path d="M50 55.5l-2.6 8.6q2.6 1.6 5.2 0" stroke="%s" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' % INK)
	# the beard
	var b := str(f.get("beard", "none"))
	match b:
		"stubble":
			p.append('<path d="M34 60c1 14 8 19 16 19s15-5 16-19c-3 10-9 13-16 13s-13-3-16-13z" %s/>' % DOTS)
		"full":
			p.append('<path d="M33 57c0 22 9 33 17 35 8-2 17-13 17-35-3 10-9 14-17 14s-14-4-17-14z" fill="%s"/><path d="M51 70c6 0 10 6 9 14" stroke="%s" stroke-width=".6" stroke-opacity=".5" fill="none"/>' % [HAIR, INK])
		"goatee":
			p.append('<path d="M46.5 72.5q3.5 10 7 0-3.5 1.6-7 0z" fill="%s"/>' % HAIR)
		"forked":
			p.append('<path d="M37.5 64c2 14 6 22 9.5 30l3-10 3 10c3.5-8 7.5-16 9.5-30-4 6-8 8-12.5 8s-8.5-2-12.5-8z" fill="%s"/>' % HAIR)
		"mutton":
			p.append('<path d="M33.5 50c-1 13 2 20 10 19.5q6.5-3.5 13 0c8 .5 11-6.5 10-19.5h-3c-.5 9-3 12.5-7.5 12.5q-6-2.5-12.5 0C39 62.5 37 59 36.5 50z" fill="%s"/>' % HAIR)
	if b != "none" and b != "stubble":
		p.append('<path d="M42.5 68.2q7.5-4.4 15 0-7.5 1.6-15 0z" fill="%s" stroke="%s" stroke-width=".5"/>' % [HAIR, INK])
	p.append('<path d="%s" stroke="%s" stroke-width="1.4" stroke-linecap="round" fill="none"/>' % [MOUTHS.get(int(f.get("mouth", 0)), MOUTHS[0]), INK])
	if f.get("scar", false):
		p.append('<path d="M58.5 46l5 14" stroke="#8a2a1e" stroke-width="1.3" stroke-linecap="round"/><path d="M59 49.5l2.4-.9M60.2 53l2.4-.9M61.4 56.5l2.4-.9" stroke="#8a2a1e" stroke-width=".8"/>')
	match str(f.get("patch", "")):
		"l":
			p.append('<path d="M33.5 51.5L67 44.5" stroke="%s" stroke-width="1.1"/><ellipse cx="42.5" cy="55.6" rx="4.4" ry="3.7" fill="%s"/>' % [INK, INK])
		"r":
			p.append('<path d="M66.5 51.5L33 44.5" stroke="%s" stroke-width="1.1"/><ellipse cx="57.5" cy="55.6" rx="4.4" ry="3.7" fill="%s"/>' % [INK, INK])
	if f.get("earring", false):
		p.append('<circle cx="33" cy="64.6" r="2" stroke="#d9a441" stroke-width="1.3" fill="none"/>')
	# the hat
	var plume := func(x: float, y: float) -> String:
		return '<path d="M%s %sc10-12 22-12 27-19-3 12-13 17-25 21z" fill="#ece3d1" stroke="%s" stroke-width=".6"/><path d="M%s %sc8-7 16-10 23-16" stroke="%s" stroke-width=".5" stroke-opacity=".6" fill="none"/>' % [x, y, INK, x + 2, y - 1, INK]
	match hat:
		"tricorn":
			if f.get("plume", false):
				p.append(plume.call(58, 28))
			p.append('<path d="M17 43c12 4 23-13 33-13s21 17 33 13c-6-9-16-21-33-21S23 34 17 43z" fill="%s"/>' % INK)
			p.append('<path d="M17 43c12 4 23-13 33-13s21 17 33 13" stroke="#c9a25a" stroke-width="1.3" fill="none"/><path d="M30 31q20-9 40 0" stroke="#6b5136" stroke-width=".7" fill="none"/>')
		"bicorne":
			if f.get("plume", false):
				p.append(plume.call(52, 24))
			p.append('<path d="M13 41c14 0 22-19 37-21 15 2 23 21 37 21-6 4-22 6-37 4-15 2-31 0-37-4z" fill="%s"/>' % INK)
			p.append('<path d="M13 41c14 0 22-19 37-21 15 2 23 21 37 21" stroke="#c9a25a" stroke-width="1.1" fill="none"/><circle cx="61" cy="35" r="3.2" fill="#b33a2c" stroke="#e8c070" stroke-width=".8"/>')
		"bandana":
			p.append('<path d="M32.5 47c0-12 8-17 17.5-17s17.5 5 17.5 17c-6-5-12-7-17.5-7s-11.5 2-17.5 7z" fill="#a8322a"/><path d="M66 44l11 5-4 4zM66 45.5l8 12.5h-5z" fill="#8e2922"/>')
			p.append('<circle cx="42" cy="37" r="1" fill="#f0e2c0"/><circle cx="50" cy="34" r="1" fill="#f0e2c0"/><circle cx="58" cy="37" r="1" fill="#f0e2c0"/><circle cx="46" cy="41" r="1" fill="#f0e2c0"/><circle cx="55" cy="41" r="1" fill="#f0e2c0"/>')
		"hood":
			p.append('<path d="M25 106c-3-36 2-72 25-80 23 8 28 44 25 80h-9c1-26-2-56-16-60-14 4-17 34-16 60z" fill="#3c3d36"/><path d="M66 106c1-26-2-56-16-60 13-2 22 30 25 60z" %s/>' % HATCH)
		"cap":
			p.append('<path d="M33 47c-1-14 9-20 17-20s18 6 17 20z" fill="#465564"/><path d="M32 44h36v4.5H32z" fill="#33404c"/><circle cx="50" cy="26.5" r="2.4" fill="#33404c"/>')
	return "".join(p)
