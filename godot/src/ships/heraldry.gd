class_name Heraldry
## Pirate heraldry, from the web game's src/ships/heraldry.ts: sixteen
## emblems, six backings, ten flag fields and four flag shapes, written as SVG
## for the engine's rasterizer, so one piece of art serves the 3D flags and
## sails, the Shipwright's living flag and its little picker tiles.
##
## The web paints them on a 2D canvas and cuts holes with destination-out.
## Here an emblem is mask art in its own space (centred on 0, 0, its radius
## about 1, y down): white where it inks and black where it cuts, laid down in
## the web's order. A backing is a mask of its own, and the thin halo the web
## carves round the emblem out of its backing (so same-coloured parts still
## read) is whatever lies under the backing painted back over it through eight
## nudged copies of the emblem's mask. The rasterizer can't nest a mask in a
## mask's own art, but it does nest masked groups, and that is all this needs.
##
## A design is a Dictionary, as the web's FlagDesign: shape, bg, pattern,
## pattern_color, emblem, emblem_color, backing, emblem_scale (0.6 .. 1.4) and
## paint (the hand-painted layer: a PNG data URL, or "" for none).

const EMBLEMS := [
	["skull", "Skull"], ["sun", "Sun"], ["anchor", "Anchor"], ["kraken", "Kraken"],
	["swords", "Cutlasses"], ["compass", "Compass"], ["crown", "Crown"], ["trident", "Trident"],
	["hourglass", "Hourglass"], ["shark", "Shark"], ["helm", "Helm"], ["parrot", "Parrot"],
	["moon", "Moon"], ["star", "Star"], ["heart", "Heart"], ["none", "None"],
]
const BACKINGS := [["none", "None"], ["bones", "Bones"], ["swords", "Blades"], ["ring", "Ring"], ["laurel", "Laurel"], ["rays", "Rays"]]
const PATTERNS := [
	["plain", "Plain"], ["band", "Band"], ["split", "Split"], ["hoist", "Hoist"], ["diagonal", "Diagonal"],
	["saltire", "Saltire"], ["cross", "Cross"], ["border", "Border"], ["stripes", "Stripes"], ["chevron", "Chevron"],
]
const SHAPES := [["square", "Square"], ["swallowtail", "Swallowtail"], ["tattered", "Tattered"], ["burgee", "Burgee"]]
## A flag's height over its length.
const ASPECT := 0.62
## The hand-painted layer's canvas (the web's PAINT_W x PAINT_H).
const PAINT := Vector2i(384, 238)
## How far the halo reaches round an emblem, in its units.
const HALO := 0.065
## What a mark (an emblem on the canvas) spans either side of its middle, in
## its units: the web's emblem canvas, 1.1 times the emblem across.
const MARK_SPAN := 1.1
## A mark's texture is drawn this many pixels square.
const MARK_PX := 512

const _NS := 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'


## The ids of a table (EMBLEMS, BACKINGS, PATTERNS or SHAPES).
static func ids(table: Array) -> Array[String]:
	var out: Array[String] = []
	for e: Array in table:
		out.append(str(e[0]))
	return out


## The name a table gives an id.
static func title(table: Array, id: String) -> String:
	for e: Array in table:
		if e[0] == id:
			return str(e[1])
	return id


# ------------------------------------------------------------------ path pieces

## A number for a path, short.
static func n(v: float) -> String:
	return String.num(v, 4)


static func _pt(x: float, y: float) -> String:
	return n(x) + " " + n(y)


## A closed polygon through [x0, y0, x1, y1, ...].
static func poly(p: Array) -> String:
	var s := "M" + _pt(p[0], p[1])
	for i in range(2, p.size(), 2):
		s += "L" + _pt(p[i], p[i + 1])
	return s + "Z"


static func rect(x: float, y: float, w: float, h: float) -> String:
	return "M%sH%sV%sH%sZ" % [_pt(x, y), n(x + w), n(y + h), n(x)]


## A rectangle with its corners rounded `r`.
static func rrect(x: float, y: float, w: float, h: float, r: float) -> String:
	r = minf(r, minf(w, h) * 0.5)
	var a := "A%s %s 0 0 1 " % [n(r), n(r)]
	return "M%sH%s%s%sV%s%s%sH%s%s%sV%s%s%sZ" % [
		_pt(x + r, y), n(x + w - r), a, _pt(x + w, y + r), n(y + h - r), a, _pt(x + w - r, y + h),
		n(x + r), a, _pt(x, y + h - r), n(y + r), a, _pt(x + r, y)]


static func circle(cx: float, cy: float, r: float) -> String:
	var a := "A%s %s 0 1 1 " % [n(r), n(r)]
	return "M%s%s%s%s%sZ" % [_pt(cx + r, cy), a, _pt(cx - r, cy), a, _pt(cx + r, cy)]


## An ellipse turned `rot` radians (clockwise, y down, as the canvas turns it).
static func ellipse(cx: float, cy: float, rx: float, ry: float, rot: float) -> String:
	var c := cos(rot) * rx
	var s := sin(rot) * rx
	var a := "A%s %s %s 1 1 " % [n(rx), n(ry), n(rad_to_deg(rot))]
	return "M%s%s%s%s%sZ" % [_pt(cx + c, cy + s), a, _pt(cx - c, cy - s), a, _pt(cx + c, cy + s)]


## An open arc from angle a0 round to a1 (increasing, clockwise on screen).
static func arc(cx: float, cy: float, r: float, a0: float, a1: float) -> String:
	return "M%sA%s %s 0 %d 1 %s" % [_pt(cx + cos(a0) * r, cy + sin(a0) * r), n(r), n(r), 1 if a1 - a0 > PI else 0, _pt(cx + cos(a1) * r, cy + sin(a1) * r)]


# ------------------------------------------------------------------ the pen

## Mask art as the web's canvas would draw it: fills and strokes in white,
## or with `cut` in black, in order.
class Pen:
	var out := PackedStringArray()
	var cut := false
	var width := 0.1
	var cap := "butt"

	func ink() -> String:
		return "#000" if cut else "#fff"

	func fill(d: String) -> void:
		out.append('<path d="%s" fill="%s"/>' % [d, ink()])

	func stroke(d: String) -> void:
		out.append('<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-linecap="%s"/>' % [d, ink(), Heraldry.n(width), cap])

	func raw(s: String) -> void:
		out.append(s)

	func text() -> String:
		return "".join(out)


## A filled ribbon along a polyline of [x, y] points, tapering from half-width
## w0 to w1, with a round end.
static func _taper(p: Pen, pts: Array, w0: float, w1: float) -> void:
	var l := PackedStringArray()
	var r := PackedStringArray()
	var last := pts.size() - 1
	for i in pts.size():
		var a: Array = pts[maxi(0, i - 1)]
		var b: Array = pts[mini(last, i + 1)]
		var d := Vector2(float(b[0]) - float(a[0]), float(b[1]) - float(a[1]))
		d = d / d.length() if d.length() > 0.0 else Vector2.RIGHT
		var w := w0 + (w1 - w0) * (float(i) / last)
		var q: Array = pts[i]
		l.append(_pt(float(q[0]) - d.y * w, float(q[1]) + d.x * w))
		r.append(_pt(float(q[0]) + d.y * w, float(q[1]) - d.x * w))
	r.reverse()
	p.fill("M" + "L".join(l) + "L" + "L".join(r) + "Z")
	var e: Array = pts[last]
	p.fill(circle(float(e[0]), float(e[1]), w1))


# ------------------------------------------------------------------ emblems

static func _skull(p: Pen) -> void:
	p.fill(ellipse(0.0, -0.14, 0.64, 0.58, 0.0))
	p.fill(rrect(-0.38, 0.2, 0.76, 0.42, 0.14))
	# cheekbones
	p.fill(ellipse(-0.42, 0.14, 0.16, 0.14, 0.0) + ellipse(0.42, 0.14, 0.16, 0.14, 0.0))
	p.cut = true
	p.fill(ellipse(-0.25, -0.06, 0.18, 0.2, 0.2) + ellipse(0.25, -0.06, 0.18, 0.2, -0.2))
	p.fill(poly([0.0, 0.13, -0.09, 0.3, 0.09, 0.3]))
	for x: float in [-0.19, 0.0, 0.19]:
		p.fill(rect(x - 0.03, 0.42, 0.06, 0.22))
	p.fill(rect(-0.36, 0.4, 0.72, 0.04))
	p.cut = false


static func _bone(p: Pen, x0: float, y0: float, x1: float, y1: float) -> void:
	var d := Vector2(x1 - x0, y1 - y0).normalized()
	var nn := Vector2(-d.y, d.x) * 0.085
	p.cap = "round"
	p.width = 0.15
	p.stroke("M%sL%s" % [_pt(x0, y0), _pt(x1, y1)])
	for e: Vector2 in [Vector2(x0, y0), Vector2(x1, y1)]:
		p.fill(circle(e.x + nn.x, e.y + nn.y, 0.115) + circle(e.x - nn.x, e.y - nn.y, 0.115))


## A cutlass, hilt lower left and point upper right (mirrored with flip -1).
static func _cutlass(p: Pen, flip: float) -> void:
	var cap := p.cap
	var width := p.width
	p.raw('<g transform="scale(%s 1)">' % n(flip))
	# the blade: a gentle curve from the hilt to the point
	var pts := []
	for i in 17:
		var t := i / 16.0
		pts.append([-0.52 + t * 1.42, 0.52 - t * 1.42 + sin(t * PI) * 0.18])
	_taper(p, pts, 0.085, 0.012)
	# guard, grip and pommel
	p.cap = "round"
	p.width = 0.09
	p.stroke("M-0.7 0.36Q-0.5 0.5 -0.38 0.72")
	p.width = 0.11
	p.stroke("M-0.55 0.55L-0.8 0.8")
	p.fill(circle(-0.84, 0.84, 0.08))
	p.raw("</g>")
	p.cap = cap
	p.width = width


static func _sun(p: Pen) -> void:
	for i in 12:
		var a := i / 12.0 * TAU
		var r := 0.86 if i % 2 == 1 else 1.0
		p.fill(poly([cos(a - 0.13) * 0.5, sin(a - 0.13) * 0.5, cos(a) * r, sin(a) * r, cos(a + 0.13) * 0.5, sin(a + 0.13) * 0.5]))
	p.fill(circle(0.0, 0.0, 0.52))
	# a rolling sea cut across its lower half
	p.cut = true
	p.width = 0.11
	p.cap = "round"
	var d := ""
	for i in 25:
		d += ("M" if i == 0 else "L") + _pt(-0.42 + i / 24.0 * 0.84, 0.14 + sin(i * 0.62) * 0.08)
	p.stroke(d)
	p.cut = false


static func _anchor(p: Pen) -> void:
	p.width = 0.1
	p.stroke(circle(0.0, -0.8, 0.14))
	p.fill(rrect(-0.065, -0.68, 0.13, 1.42, 0.05))
	p.fill(rrect(-0.44, -0.55, 0.88, 0.12, 0.06))
	p.width = 0.13
	p.cap = "round"
	p.stroke(arc(0.0, 0.12, 0.6, 0.3, PI - 0.3))
	for s: float in [-1.0, 1.0]:
		var a := 0.3 if s > 0.0 else PI - 0.3
		var x := cos(a) * 0.6
		var y := 0.12 + sin(a) * 0.6
		p.fill(poly([x + s * 0.02, y - 0.3, x + s * 0.2, y + 0.06, x - s * 0.12, y + 0.04]))
	p.fill(circle(0.0, 0.74, 0.1))


static func _kraken(p: Pen) -> void:
	for i in 6:
		var side := -1.0 if i < 3 else 1.0
		var k := i if i < 3 else i - 3
		var x := side * (0.08 + k * 0.13)
		var y := -0.1
		var ang := PI / 2.0 - side * (0.15 + k * 0.42)
		var pts := [[x, y]]
		var steps := 20
		var length := 1.05 - k * 0.12
		for s in range(1, steps + 1):
			var t := float(s) / steps
			ang -= side * (t * t * 0.55 + 0.02)
			x += cos(ang) * (length / steps)
			y += sin(ang) * (length / steps)
			pts.append([x, y])
		_taper(p, pts, 0.1, 0.018)
	p.fill(ellipse(0.0, -0.42, 0.43, 0.5, 0.0))
	p.cut = true
	p.fill(circle(-0.17, -0.28, 0.1) + circle(0.17, -0.28, 0.1))
	p.cut = false
	p.fill(circle(-0.15, -0.3, 0.04) + circle(0.19, -0.3, 0.04))


static func _compass(p: Pen) -> void:
	var pts := []
	for i in 16:
		var a := i / 16.0 * TAU - PI / 2.0
		var r := 0.17 if i % 2 == 1 else (1.0 if i % 4 == 0 else 0.6)
		pts.append_array([cos(a) * r, sin(a) * r])
	p.fill(poly(pts))
	p.width = 0.07
	p.stroke(circle(0.0, 0.0, 0.5))
	# half of every long point hollowed, for that engraved look
	p.cut = true
	for i in 4:
		var a := i / 4.0 * TAU - PI / 2.0
		p.fill(poly([0.0, 0.0, cos(a) * 0.86, sin(a) * 0.86, cos(a + 0.3) * 0.15, sin(a + 0.3) * 0.15]))
	p.fill(circle(0.0, 0.0, 0.07))
	p.cut = false


static func _crown(p: Pen) -> void:
	p.fill(poly([-0.72, 0.5, -0.72, 0.2, -0.86, -0.42, -0.42, -0.04, 0.0, -0.64, 0.42, -0.04, 0.86, -0.42, 0.72, 0.2, 0.72, 0.5]))
	for c: Vector2 in [Vector2(-0.86, -0.5), Vector2(0.0, -0.74), Vector2(0.86, -0.5)]:
		p.fill(circle(c.x, c.y, 0.11))
	p.fill(rrect(-0.8, 0.5, 1.6, 0.2, 0.06))
	p.cut = true
	p.fill(rect(-0.72, 0.17, 1.44, 0.05))
	for x: float in [-0.42, 0.0, 0.42]:
		p.fill(ellipse(x, 0.35, 0.08, 0.1, 0.0))
	p.cut = false


static func _trident(p: Pen) -> void:
	p.fill(rrect(-0.055, -0.36, 0.11, 1.32, 0.04))
	p.width = 0.1
	p.cap = "round"
	p.stroke("M-0.44 -0.62Q-0.44 -0.24 0 -0.24Q0.44 -0.24 0.44 -0.62")
	p.stroke("M0 -0.3L0 -0.7")
	for t: Vector2 in [Vector2(-0.44, -0.92), Vector2(0.0, -1.0), Vector2(0.44, -0.92)]:
		var x := t.x
		var top := t.y
		p.fill(poly([x, top, x + 0.15, top + 0.3, x + 0.05, top + 0.26, x, top + 0.36, x - 0.05, top + 0.26, x - 0.15, top + 0.3]))
	p.fill(rrect(-0.12, 0.1, 0.24, 0.1, 0.04) + rrect(-0.12, 0.3, 0.24, 0.1, 0.04))


static func _hourglass(p: Pen) -> void:
	p.fill(rrect(-0.6, -0.92, 1.2, 0.16, 0.07) + rrect(-0.6, 0.76, 1.2, 0.16, 0.07))
	p.fill(rect(-0.54, -0.8, 0.08, 1.6))
	p.fill(rect(0.46, -0.8, 0.08, 1.6))
	var glass := "M-0.36 -0.76C-0.36 -0.2 -0.06 -0.12 -0.06 0C-0.06 0.12 -0.36 0.2 -0.36 0.76L0.36 0.76C0.36 0.2 0.06 0.12 0.06 0C0.06 -0.12 0.36 -0.2 0.36 -0.76Z"
	p.width = 0.07
	p.stroke(glass)
	# the sand, inside the glass
	p.raw('<clipPath id="hg"><path d="%s"/></clipPath><g clip-path="url(#hg)">' % glass)
	p.fill(rect(-0.4, 0.42, 0.8, 0.4))
	p.fill("M-0.3 0.44Q0 0.22 0.3 0.44Z")
	p.fill(rect(-0.4, -0.42, 0.8, 0.32))
	p.fill(rect(-0.02, -0.1, 0.04, 0.55))
	p.raw("</g>")


static func _shark(p: Pen) -> void:
	p.fill("M0.98 0.02Q0.7 -0.3 0.28 -0.3L0.04 -0.82Q-0.04 -0.5 -0.2 -0.27Q-0.45 -0.18 -0.64 -0.08L-0.98 -0.52Q-0.84 -0.1 -0.86 0.02Q-0.9 0.2 -0.94 0.42L-0.62 0.08Q-0.2 0.26 0.2 0.24L0.06 0.56L0.42 0.22Q0.8 0.18 0.98 0.02Z")
	p.cut = true
	p.fill(circle(0.62, -0.1, 0.055))
	p.width = 0.035
	p.cap = "round"
	for x: float in [0.3, 0.38, 0.46]:
		p.stroke("M%sQ%s %s" % [_pt(x, -0.1), _pt(x - 0.04, 0.0), _pt(x, 0.1)])
	p.stroke("M0.92 0.06Q0.76 0.14 0.6 0.1")
	p.cut = false


static func _helm(p: Pen) -> void:
	p.cap = "round"
	p.width = 0.08
	for i in 8:
		var a := i / 8.0 * TAU + PI / 8.0
		p.stroke("M%sL%s" % [_pt(cos(a) * 0.15, sin(a) * 0.15), _pt(cos(a) * 0.86, sin(a) * 0.86)])
		p.fill(circle(cos(a) * 0.9, sin(a) * 0.9, 0.09))
	p.width = 0.13
	p.stroke(circle(0.0, 0.0, 0.58))
	p.width = 0.04
	p.stroke(circle(0.0, 0.0, 0.42))
	p.fill(circle(0.0, 0.0, 0.2))
	p.cut = true
	p.fill(circle(0.0, 0.0, 0.07))
	p.cut = false


## A five-pointed star, points r_out and r_in from (cx, cy), one point up.
static func _star_pts(cx: float, cy: float, r_out: float, r_in: float) -> Array:
	var pts := []
	for i in 10:
		var a := i / 10.0 * TAU - PI / 2.0
		var r := r_in if i % 2 == 1 else r_out
		pts.append_array([cx + cos(a) * r, cy + sin(a) * r])
	return pts


static func _star(p: Pen) -> void:
	p.fill(poly(_star_pts(0.0, 0.06, 1.0, 0.42)))


static func _heart(p: Pen) -> void:
	p.fill("M0 0.86C-0.5 0.48 -1 0.1 -0.9 -0.35C-0.8 -0.8 -0.2 -0.86 0 -0.42C0.2 -0.86 0.8 -0.8 0.9 -0.35C1 0.1 0.5 0.48 0 0.86Z")
	p.cut = true
	p.fill(ellipse(-0.45, -0.38, 0.12, 0.2, -0.6))
	p.cut = false


static func _moon(p: Pen) -> void:
	p.fill(circle(0.0, 0.0, 0.82))
	p.cut = true
	p.fill(circle(0.36, -0.2, 0.7))
	p.cut = false
	# a little star in the crescent's arms
	p.fill(poly(_star_pts(0.42, 0.18, 0.2, 0.08)))


static func _parrot(p: Pen) -> void:
	# tail feathers
	_taper(p, [[-0.05, 0.3], [-0.2, 0.62], [-0.36, 0.98]], 0.16, 0.05)
	_taper(p, [[0.05, 0.3], [0.02, 0.66], [-0.06, 1.0]], 0.14, 0.04)
	# body and wing, head, beak, perch
	p.fill(ellipse(0.0, 0.02, 0.36, 0.52, -0.25))
	p.fill(circle(0.14, -0.5, 0.3))
	p.fill("M0.38 -0.62Q0.68 -0.6 0.62 -0.28Q0.52 -0.4 0.38 -0.36Z")
	p.fill(rrect(-0.6, 0.46, 1.2, 0.09, 0.045))
	p.cut = true
	p.fill(circle(0.2, -0.54, 0.06))
	p.width = 0.04
	p.cap = "round"
	for i in 3:
		p.stroke("M%sQ%s %s" % [_pt(-0.16 + i * 0.04, -0.12 + i * 0.16), _pt(0.08, -0.02 + i * 0.16), _pt(0.2 + i * 0.01, -0.2 + i * 0.18)])
	p.stroke("M0.42 -0.42L0.56 -0.44")
	p.cut = false


## An emblem's mask art (empty for none).
static func emblem_art(id: String) -> String:
	var p := Pen.new()
	match id:
		"skull":
			_skull(p)
		"sun":
			_sun(p)
		"anchor":
			_anchor(p)
		"swords":
			_cutlass(p, 1.0)
			_cutlass(p, -1.0)
		"kraken":
			_kraken(p)
		"compass":
			_compass(p)
		"crown":
			_crown(p)
		"trident":
			_trident(p)
		"hourglass":
			_hourglass(p)
		"shark":
			_shark(p)
		"helm":
			_helm(p)
		"star":
			_star(p)
		"heart":
			_heart(p)
		"moon":
			_moon(p)
		"parrot":
			_parrot(p)
	return p.text()


## A backing's mask art, in its own units (the emblem sits on it shrunk by emblem_frame).
static func backing_art(id: String) -> String:
	var p := Pen.new()
	match id:
		"bones":
			_bone(p, -0.78, -0.1, 0.78, 0.86)
			_bone(p, 0.78, -0.1, -0.78, 0.86)
		"swords":
			p.raw('<g transform="scale(1.12)">')
			_cutlass(p, 1.0)
			_cutlass(p, -1.0)
			p.raw("</g>")
		"ring":
			p.width = 0.09
			p.stroke(circle(0.0, 0.0, 0.93))
			p.width = 0.035
			p.stroke(circle(0.0, 0.0, 0.8))
		"laurel":
			p.width = 0.04
			for span: Vector2 in [Vector2(-0.9, 1.3), Vector2(PI - 1.3, PI + 0.9)]:
				p.stroke(arc(0.0, 0.0, 0.84, span.x, span.y))
				for i in 8:
					var a := span.x + (i + 0.5) / 8.0 * (span.y - span.x)
					for o: float in [-1.0, 1.0]:
						var r := 0.84 + o * 0.075
						p.fill(ellipse(cos(a) * r, sin(a) * r, 0.14, 0.06, a + PI / 2.0 + o * 0.55))
		"rays":
			for i in 18:
				var a := i / 18.0 * TAU
				p.fill(poly([cos(a - 0.07) * 0.6, sin(a - 0.07) * 0.6, cos(a), sin(a), cos(a + 0.07) * 0.6, sin(a + 0.07) * 0.6]))
	return p.text()


## Where the emblem sits on its backing: its drop and its scale, in the backing's units.
static func emblem_frame(backing: String) -> Vector2:
	match backing:
		"bones":
			return Vector2(-0.2, 0.72)
		"swords":
			return Vector2(0.0, 0.68)
		"ring", "laurel":
			return Vector2(0.0, 0.62)
		"rays":
			return Vector2(0.0, 0.56)
	return Vector2(0.0, 1.0)


## An emblem on its backing, `size` across round (cx, cy), in `ink`: as
## [defs, body] for a document drawn over `area`. `under` is the art that lies
## beneath (a <use> of it, or a flat fill), painted back into the halo.
static func _emblem_layers(emblem: String, backing: String, cx: float, cy: float, size: float, ink: String, under: String, area: Rect2) -> PackedStringArray:
	var defs := ""
	var body := ""
	if emblem == "none" and backing == "none":
		return PackedStringArray(["", ""])
	var unit := size * 0.5
	var frame := Vector2(0.0, 1.0) if emblem == "none" else emblem_frame(backing)
	var fill := '<rect x="%s" y="%s" width="%s" height="%s" fill="%s"%%s/>' % [n(area.position.x), n(area.position.y), n(area.size.x), n(area.size.y), ink]
	var mu := 'maskUnits="userSpaceOnUse" x="%s" y="%s" width="%s" height="%s"' % [n(area.position.x), n(area.position.y), n(area.size.x), n(area.size.y)]
	if emblem != "none":
		defs += '<g id="eo" transform="translate(%s) scale(%s)">%s</g>' % [_pt(cx, cy + frame.x * unit), n(unit * frame.y), emblem_art(emblem)]
		defs += '<mask id="em" %s><use xlink:href="#eo"/></mask>' % mu
	if backing != "none":
		defs += '<mask id="bm" %s><g transform="translate(%s) scale(%s)">%s</g></mask>' % [mu, _pt(cx, cy), n(unit), backing_art(backing)]
		body += '<g mask="url(#bm)">' + fill % ""
		if emblem != "none":
			# the halo: what lies under the backing, back over it round the emblem
			var o := unit * HALO
			for k in 8:
				var a := k / 8.0 * TAU
				defs += '<mask id="h%d" %s><use xlink:href="#eo" transform="translate(%s)"/></mask>' % [k, mu, _pt(cos(a) * o, sin(a) * o)]
				body += '<g mask="url(#h%d)">%s</g>' % [k, under]
		body += "</g>"
	if emblem != "none":
		body += fill % ' mask="url(#em)"'
	return PackedStringArray([defs, body])


# ------------------------------------------------------------------ flags

## A flag field's pattern over w x h, in `color`.
static func pattern_art(id: String, w: float, h: float, color: String) -> String:
	var f := '<path d="%s" fill="' + color + '"/>'
	match id:
		"band":
			return f % rect(0.0, h * 0.36, w, h * 0.28)
		"split":
			return f % rect(0.0, h * 0.5, w, h * 0.5)
		"hoist":
			return f % rect(0.0, 0.0, w * 0.3, h)
		"diagonal":
			return f % poly([0.0, h, w, 0.0, w, h])
		"saltire":
			return '<path d="M0 0L%sM%sL0 %s" fill="none" stroke="%s" stroke-width="%s"/>' % [_pt(w, h), _pt(w, 0.0), n(h), color, n(h * 0.17)]
		"cross":
			return f % (rect(w * 0.3, 0.0, h * 0.18, h) + rect(0.0, h * 0.41, w, h * 0.18))
		"border":
			var b := h * 0.1
			return f % (rect(0.0, 0.0, w, b) + rect(0.0, h - b, w, b) + rect(w - b * 1.6, 0.0, b * 1.6, h) + rect(0.0, 0.0, b, h))
		"stripes":
			var d := ""
			for i in [1, 3, 5]:
				d += rect(0.0, i / 7.0 * h, w, h / 7.0)
			return f % d
		"chevron":
			return f % poly([0.0, 0.0, w * 0.42, h * 0.5, 0.0, h])
	return ""


## What a flag's shape cuts off its fly, as black mask art over w x h (empty
## for a square flag). The tattered one is torn the web's way (mulberry32 seed 7).
static func shape_cut(shape: String, w: float, h: float) -> String:
	match shape:
		"swallowtail":
			return '<path d="%s" fill="#000"/>' % poly([w + 1.0, -1.0, w * 0.74, h * 0.5, w + 1.0, h + 1.0])
		"burgee":
			return '<path d="%s" fill="#000"/>' % poly([w * 0.55, -1.0, w + 1.0, -1.0, w + 1.0, h + 1.0, w * 0.55, h + 1.0, w, h * 0.5])
		"tattered":
			var rnd := Mulberry32.new(7)
			var d := "M" + _pt(w + 1.0, -1.0)
			var y := -1.0
			while y < h + 1.0:
				var x := w * (0.86 + rnd.next() * 0.13)
				x -= w * 0.08 if rnd.next() < 0.18 else 0.0
				d += "L" + _pt(x, y)
				y += h * (0.04 + rnd.next() * 0.07)
			d += "L" + _pt(w + 1.0, h + 1.0) + "Z"
			# shot holes, and a frayed bottom corner
			for hole: Vector3 in [Vector3(0.66, 0.24, 0.045), Vector3(0.78, 0.7, 0.035), Vector3(0.36, 0.84, 0.028)]:
				var pts := []
				for i in 9:
					var a := i / 9.0 * TAU
					var rr := hole.z * h * (0.7 + rnd.next() * 0.6)
					pts.append_array([hole.x * w + cos(a) * rr, hole.y * h + sin(a) * rr])
				d += poly(pts)
			d += poly([w * 0.55, h + 1.0, w * 0.62, h * 0.94, w * 0.7, h + 1.0])
			return '<path d="%s" fill="#000"/>' % d
	return ""


## The SVG of a whole flag, w x h in its own units (its canvas pixels on the
## web), drawn `px` pixels big: field, pattern, emblem on its backing, the
## hand-painted layer (unless `paint` is false) and the shape cut from its fly
## as transparency. No weave and no sleeve: whatever shows it adds those.
static func flag_svg(d: Dictionary, w: float, h: float, px: Vector2i, paint := true) -> String:
	var area := Rect2(0.0, 0.0, w, h)
	var defs := '<g id="u"><rect width="%s" height="%s" fill="%s"/>%s</g>' % [n(w), n(h), str(d.bg), pattern_art(str(d.pattern), w, h, str(d.pattern_color))]
	var pat := str(d.pattern)
	var cx := w * (0.58 if pat in ["hoist", "chevron", "cross"] else 0.5)
	var size := h * 0.68 * float(d.emblem_scale)
	var em := _emblem_layers(str(d.emblem), str(d.backing), cx, h * 0.5, size, str(d.emblem_color), '<use xlink:href="#u"/>', area)
	defs += em[0]
	var body := '<use xlink:href="#u"/>' + em[1]
	var layer := str(d.get("paint", ""))
	if paint and layer.begins_with("data:image/png"):
		body += '<image width="%s" height="%s" preserveAspectRatio="none" xlink:href="%s"/>' % [n(w), n(h), layer]
	var cut := shape_cut(str(d.shape), w, h)
	if cut != "":
		defs += '<mask id="sh" maskUnits="userSpaceOnUse" x="0" y="0" width="%s" height="%s"><rect width="%s" height="%s" fill="#fff"/>%s</mask>' % [n(w), n(h), n(w), n(h), cut]
		body = '<g mask="url(#sh)">%s</g>' % body
	return '<svg %s width="%d" height="%d" viewBox="0 0 %s %s" preserveAspectRatio="none"><defs>%s</defs>%s</svg>' % [_NS, px.x, px.y, n(w), n(h), defs, body]


## The SVG of a mark (an emblem on its backing, as a sail carries it): white
## on black, `px` square, spanning MARK_SPAN either side of the emblem's middle.
static func mark_svg(emblem: String, backing: String, px: int) -> String:
	var s := MARK_SPAN
	var area := Rect2(-s, -s, s * 2.0, s * 2.0)
	var under := '<rect x="%s" y="%s" width="%s" height="%s" fill="#000"/>' % [n(-s), n(-s), n(s * 2.0), n(s * 2.0)]
	var em := _emblem_layers(emblem, backing, 0.0, 0.0, 2.0, "#fff", under, area)
	return '<svg %s width="%d" height="%d" viewBox="%s %s %s %s"><defs>%s</defs>%s%s</svg>' % [_NS, px, px, n(-s), n(-s), n(s * 2.0), n(s * 2.0), em[0], under, em[1]]


## The SVG of an emblem tile for a picker: the field as a rounded square, the
## emblem on its backing in its colour (the web's emblemThumb), `px` square.
static func tile_svg(emblem: String, backing: String, color: String, bg: String, px: int) -> String:
	var area := Rect2(0.0, 0.0, 1.0, 1.0)
	var under := '<rect width="1" height="1" rx="0.22" fill="%s"/>' % bg
	var em := _emblem_layers(emblem, backing, 0.5, 0.5, 0.78, color, under, area)
	return '<svg %s width="%d" height="%d" viewBox="0 0 1 1"><defs>%s</defs>%s<g>%s</g></svg>' % [_NS, px, px, em[0], under, em[1]]


## Rasterizes an SVG (null if the rasterizer refuses it). Safe off the main thread.
static func render(svg: String) -> Image:
	var img := Image.new()
	if img.load_svg_from_string(svg, 1.0) != OK:
		return null
	return img


# ------------------------------------------------------------------ textures

static var _marks := {}
static var _lock := Mutex.new()


## A mark's coverage (white = inked) as a texture the sails' shader reads,
## drawn once per emblem and backing (any thread); null for none.
static func mark_texture(emblem: String, backing: String) -> Texture2D:
	if emblem == "none" and backing == "none":
		return null
	var key := emblem + "|" + backing
	_lock.lock()
	var t: Texture2D = _marks.get(key)
	_lock.unlock()
	if t != null:
		return t
	t = LookBaker.rasterize(mark_svg(emblem, backing, MARK_PX), LookBaker.MARK)
	_lock.lock()
	_marks[key] = t
	_lock.unlock()
	return t


## A mark drawn by someone else (LookBaker), kept for the next who wants it.
static func keep_mark(emblem: String, backing: String, t: Texture2D) -> void:
	_lock.lock()
	_marks[emblem + "|" + backing] = t
	_lock.unlock()
