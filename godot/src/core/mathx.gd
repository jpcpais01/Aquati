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
