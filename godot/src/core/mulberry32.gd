class_name Mulberry32
extends RefCounted
## The web game's seeded random numbers (mulberry32, src/core/noise.ts): the
## same seed gives the same stream as the web's, so a town's townsfolk dress
## and its stalls set out their wares the same on both.

var _a := 0


func _init(seed_value: int) -> void:
	_a = seed_value & 0xFFFFFFFF


## The next number, 0 <= x < 1.
func next() -> float:
	_a = (_a + 0x6D2B79F5) & 0xFFFFFFFF
	var t := _a
	t = _imul(t ^ (t >> 15), t | 1)
	t ^= (t + _imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
	return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


## One of a's items.
func pick(a: Array) -> Variant:
	return a[int(next() * a.size()) % a.size()]


## The low 32 bits of a * b (JavaScript's Math.imul), kept inside 64.
static func _imul(a: int, b: int) -> int:
	return (a * (b & 0xFFFF) + (((a * (b >> 16)) & 0xFFFF) << 16)) & 0xFFFFFFFF
