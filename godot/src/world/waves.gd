class_name Waves
extends RefCounted
## The Gerstner swell, shared by the GPU ocean and the CPU buoyancy so ships
## ride exactly the sea you see.
##
## Each train's phase is advanced here and wrapped to a full turn, so the GPU
## never sees a large time value and the sea stays precise however long you
## sail. Eight trains with mutually irrational wavelengths and a wide fan of
## headings never settle into a visible lattice: it reads as open sea.

const COUNT := 8
const G := 9.81
const STEEP := 0.66
## The storm caps' noise along a wave, per radian of its phase (ocean.gdshader).
const CAP_SCALE := 0.0447

## wavelength (m), amplitude (m), heading offset from the wind (rad), start phase
const DEFS := [
	[71.3, 0.42, 0.08, 0.0],
	[47.9, 0.29, -0.63, 1.7],
	[33.4, 0.2, 0.86, 4.1],
	[23.9, 0.135, -1.29, 2.3],
	[17.3, 0.09, 0.41, 5.2],
	[12.7, 0.06, 1.73, 0.9],
	[9.7, 0.04, -0.27, 3.6],
	[7.6, 0.028, -2.07, 1.2],
]

var dir_x := PackedFloat32Array()
var dir_z := PackedFloat32Array()
var k := PackedFloat32Array()
var amp := PackedFloat32Array()
var omega := PackedFloat32Array()
var q := PackedFloat32Array()
var phase := PackedFloat32Array()
var _base_amp := PackedFloat32Array()
var _base_x := PackedFloat32Array()
var _base_z := PackedFloat32Array()
## The whole turns each train's phase has wrapped through: a storm's caps key
## their breaking stretches off the unwrapped phase (one pattern per crest),
## and a wrap would throw them all somewhere else at once.
var _turns := PackedFloat64Array()

## Shader-side copies: vec4(dir.x, dir.z, k, amp) and vec4(omega, q, phase,
## the caps' offset for the wrapped turns).
var packed_a := PackedVector4Array()
var packed_b := PackedVector4Array()


func _init(wind_angle: float = 0.0, scale: float = 1.0) -> void:
	# (packed arrays are copy-on-write values: each one is resized in place)
	dir_x.resize(COUNT)
	dir_z.resize(COUNT)
	k.resize(COUNT)
	amp.resize(COUNT)
	omega.resize(COUNT)
	q.resize(COUNT)
	phase.resize(COUNT)
	_base_amp.resize(COUNT)
	_base_x.resize(COUNT)
	_base_z.resize(COUNT)
	_turns.resize(COUNT)
	packed_a.resize(COUNT)
	packed_b.resize(COUNT)
	for i in COUNT:
		var d: Array = DEFS[i]
		var kk: float = TAU / float(d[0])
		var ang: float = wind_angle + float(d[2])
		dir_x[i] = sin(ang)
		dir_z[i] = cos(ang)
		_base_x[i] = dir_x[i]
		_base_z[i] = dir_z[i]
		k[i] = kk
		amp[i] = float(d[1]) * scale
		_base_amp[i] = amp[i]
		omega[i] = sqrt(G * kk)
		q[i] = STEEP / (kk * amp[i] * COUNT)
		phase[i] = float(d[3])
	_pack()


## Moves the swell on by dt seconds.
func advance(dt: float) -> void:
	for i in COUNT:
		_wrap(i, phase[i] - omega[i] * dt)
	_pack()


## Swings the whole swell round by t radians from its first headings,
## pivoting about (px, pz): each train's phase is nudged so the sea right
## there keeps its shape, and the swell only turns slowly round the ship
## instead of sliding past her.
func turn(t: float, px: float, pz: float) -> void:
	var c := cos(t)
	var s := sin(t)
	for i in COUNT:
		var nx := _base_x[i] * c + _base_z[i] * s
		var nz := _base_z[i] * c - _base_x[i] * s
		_wrap(i, phase[i] + k[i] * ((dir_x[i] - nx) * px + (dir_z[i] - nz) * pz))
		dir_x[i] = nx
		dir_z[i] = nz
	_pack()


func _wrap(i: int, p: float) -> void:
	var w := floorf(p / TAU)
	phase[i] = p - w * TAU
	_turns[i] += w


## Sea state: long swells grow the most in a storm, short chop the least, and
## the trains steepen so crests pinch. A mirror calm (0..1) all but stills it.
func set_sea_state(sea: float, calm: float = 0.0) -> void:
	var steep := STEEP + clampf(sea, 0.0, 1.2) * 0.15
	for i in COUNT:
		var f := float(i) / float(COUNT - 1)
		var grow := 1.0 + sea * (1.05 - f * 0.6)
		var still := 1.0 - calm * (0.8 + 0.17 * f)
		amp[i] = _base_amp[i] * maxf(0.6, grow) * still
		q[i] = (steep * still) / (k[i] * maxf(amp[i], 1e-4) * COUNT)
	_pack()


## Height of the water at world (x, z), the swell scaled by damp (it dies down
## over the shallows). The horizontal pinch is inverted with two fixed-point
## steps, so this matches the rendered surface to a few cm.
func height_at(x: float, z: float, damp: float = 1.0) -> float:
	var px := x
	var pz := z
	for it in 2:
		var ox := 0.0
		var oz := 0.0
		for i in COUNT:
			var c := cos(k[i] * (dir_x[i] * px + dir_z[i] * pz) + phase[i]) * q[i] * amp[i] * damp
			ox += c * dir_x[i]
			oz += c * dir_z[i]
		px = x - ox
		pz = z - oz
	var y := 0.0
	for i in COUNT:
		y += amp[i] * sin(k[i] * (dir_x[i] * px + dir_z[i] * pz) + phase[i])
	return y * damp


func _pack() -> void:
	for i in COUNT:
		packed_a[i] = Vector4(dir_x[i], dir_z[i], k[i], amp[i])
		packed_b[i] = Vector4(omega[i], q[i], phase[i], fposmod(_turns[i] * TAU * CAP_SCALE, 1.0))
