class_name MathX
## Small numeric helpers shared across the game.


## Frame-rate independent smoothing factor: x += (target - x) * damp(rate, dt).
static func damp(rate: float, dt: float) -> float:
	return 1.0 - exp(-rate * dt)


## Signed shortest turn from angle a to angle b, in (-PI, PI].
static func angle_delta(a: float, b: float) -> float:
	return wrapf(b - a, -PI, PI)


static func smooth(e0: float, e1: float, x: float) -> float:
	var t := clampf((x - e0) / (e1 - e0), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


## Quintic ease (smootherstep) of a 0..1 value.
static func smoother(t: float) -> float:
	t = clampf(t, 0.0, 1.0)
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


## Deterministic 0..1 hash of an integer, for seeded variety without RNG state.
static func hash01(n: int) -> float:
	n = (n << 13) ^ n
	n = n * (n * n * 15731 + 789221) + 1376312589
	return float(n & 0x7fffffff) / 2147483647.0


## A CSS cubic-bezier timing curve (x1, y1, x2, y2) at x in 0..1: the web
## game's --ease and --spring, for the UI's entrances.
static func bezier(x1: float, y1: float, x2: float, y2: float, x: float) -> float:
	if x <= 0.0:
		return 0.0
	if x >= 1.0:
		return 1.0
	# x(t) = x by Newton's method from a good first guess
	var t := x
	for i in 8:
		var e := _bz(x1, x2, t) - x
		if absf(e) < 1e-5:
			break
		var d := 3.0 * x1 * (1.0 - t) * (1.0 - t) + 6.0 * (x2 - x1) * (1.0 - t) * t + 3.0 * (1.0 - x2) * t * t
		if absf(d) < 1e-6:
			break
		t = clampf(t - e / d, 0.0, 1.0)
	return _bz(y1, y2, t)


static func _bz(a: float, b: float, t: float) -> float:
	var u := 1.0 - t
	return 3.0 * a * u * u * t + 3.0 * b * u * t * t + t * t * t
