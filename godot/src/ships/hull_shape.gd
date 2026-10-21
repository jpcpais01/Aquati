class_name HullShape
extends RefCounted
## A hull's lines as functions of t (0 stern .. 1 stem) and height: beam,
## sheer, castles, the deck levels and the section curve, plus the mapping to
## the painted rows of the hull shader. Local frame: +Z bow, +Y up, +X port,
## waterline at y = 0. Ported from the web game's HullShape.

## Fraction of the sheer height where the painted wale tops out.
const WALE_TOP := (0.705 - 0.3) / 0.7

var c: ShipClass


func _init(cls: ShipClass) -> void:
	c = cls


func z(t: float) -> float:
	return (t - 0.5) * c.length


func t_at(zz: float) -> float:
	return zz / c.length + 0.5


func half_beam(t: float) -> float:
	var b := c.beam * 0.5
	var mid := 0.43
	if t < mid:
		var u := t / mid
		return b * (c.transom + (1.0 - c.transom) * pow(sin(u * PI * 0.5), 0.75))
	var u := (t - mid) / (1.0 - mid)
	# a touch fuller and rounder in the bow than a racing hull
	return b * pow(maxf(1.0 - pow(u, 2.5), 0.0), 0.56)


func sheer(t: float) -> float:
	var fb := maxf(0.0, (t - 0.5) / 0.5)
	var st := maxf(0.0, (0.5 - t) / 0.5)
	return c.freeboard + c.sheer_bow * fb * fb + c.sheer_stern * st * st


func stern_mask(t: float) -> float:
	if c.stern_castle.is_empty():
		return 0.0
	var sc: float = c.stern_castle.t
	# full height over the whole castle deck, then a long soft sweep down into the waist
	return 1.0 - MathX.smooth(sc + 0.004, sc + 0.075, t)


func fore_mask(t: float) -> float:
	if c.fore_castle.is_empty():
		return 0.0
	var fc: float = c.fore_castle.t
	return MathX.smooth(fc - 0.07, fc - 0.004, t)


func top(t: float) -> float:
	var y := sheer(t)
	if not c.stern_castle.is_empty():
		y += float(c.stern_castle.h) * stern_mask(t)
	if not c.fore_castle.is_empty():
		y += float(c.fore_castle.h) * fore_mask(t)
	return y


## Stepped deck height (the castles are discrete levels).
func deck_y(t: float) -> float:
	var y := sheer(t) - c.bulwark
	if not c.stern_castle.is_empty() and t < float(c.stern_castle.t):
		y += float(c.stern_castle.h)
	if not c.fore_castle.is_empty() and t > float(c.fore_castle.t):
		y += float(c.fore_castle.h)
	return y


func main_deck_y(t: float) -> float:
	return sheer(t) - c.bulwark


func bottom(t: float) -> float:
	var d := c.draft
	var stern := -d * (0.78 + 0.22 * MathX.smooth(0.0, 0.2, t))
	var bow_t := pow(MathX.smooth(0.72, 1.0, t), 1.5)
	return lerpf(stern, top(t) * 0.3, bow_t)


func _exponent(t: float) -> float:
	var bell := 1.0 - pow(absf(2.0 * t - 1.0), 1.4)
	return lerpf(1.45 if t > 0.5 else 2.0, 2.55, bell)


## Point on the section at fraction v (0 keel .. 1 rail): (half width, y).
func section(t: float, v: float) -> Vector2:
	var b := bottom(t)
	var tp := top(t)
	var y := b + (tp - b) * v
	var w := half_beam(t)
	var v_w := clampf((0.0 - b) / (tp - b), 0.05, 0.92)
	var n := _exponent(t)
	var x: float
	if v < v_w:
		var q := v / v_w
		x = w * pow(maxf(0.0, 1.0 - pow(1.0 - q, n)), 1.0 / n)
	else:
		var q := (v - v_w) / (1.0 - v_w)
		x = w * (1.0 - c.tumblehome * pow(q, 1.6))
	return Vector2(x, y)


func half_width_at_y(t: float, y: float) -> float:
	var b := bottom(t)
	var tp := top(t)
	return section(t, clampf((y - b) / (tp - b), 0.0, 1.0)).x


## Painted hull row for a height. The bands up to the wale follow the sheer;
## the strake above stretches up over the castles so the wale runs level.
func tex_v(t: float, y: float) -> float:
	if y <= 0.0:
		return 0.3 * clampf(1.0 + y / c.draft, 0.0, 1.0)
	var sh := sheer(t)
	var ys := sh * WALE_TOP
	if y <= ys:
		return 0.3 + 0.7 * (y / sh)
	return 0.705 + 0.295 * clampf((y - ys) / maxf(0.1, top(t) - ys), 0.0, 1.0)


## Inverse of tex_v above the waterline.
func y_at_v(t: float, v: float) -> float:
	var sh := sheer(t)
	var ys := sh * WALE_TOP
	if v <= 0.705:
		return (v - 0.3) / 0.7 * sh
	return ys + (v - 0.705) / 0.295 * (top(t) - ys)


func wale_y(t: float) -> float:
	return y_at_v(t, 0.6825)


## Outward unit normal of the skin at (t, y) on a side (+1 port, -1 starboard).
func skin_normal(t: float, y: float, side: float) -> Vector3:
	var e := 0.004
	var ey := 0.06
	var fy := (half_width_at_y(t, y + ey) - half_width_at_y(t, y - ey)) / (2.0 * ey)
	var fz := (half_width_at_y(clampf(t + e, 0.0, 1.0), y) - half_width_at_y(clampf(t - e, 0.0, 1.0), y)) / (2.0 * e * c.length)
	return Vector3(side, -fy, -fz).normalized()


func skin_point(t: float, y: float, side: float, out: float = 0.0) -> Vector3:
	return Vector3(side * (half_width_at_y(t, y) + out), y, z(t))


## Cosine-spaced samples of t, dense at the ends where the lines turn fastest.
static func t_samples(n: int) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	for k in n + 1:
		out.append(0.5 - 0.5 * cos(float(k) / n * PI))
	return out
