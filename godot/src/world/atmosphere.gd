class_name Atmosphere
extends RefCounted
## The hour and the weather made visible: where the sun stands and what
## colour it shines, the sky's palette, the haze and the grade. Everything is
## keyed on the sun's height, the way the web game does it, and pushed into
## the shared shader globals (shaders/inc/atmos.gdshaderinc), the key light
## and the environment by apply().

## One full day, in seconds of play.
const DAY_LENGTH := 20.0 * 60.0
## Clear-noon sun irradiance.
const SUN_I := 3.8
## The sun's highest elevation (40 degrees), and the swing of noon toward the north-west.
const PEAK := 0.6981317
const YAW := 0.5
## Light from the sky dome, against the sun's (the web's SKY_LIGHT).
const SKY_LIGHT := 0.72
## Palette keyframes on the sun's height: [s, zenith, horizon, fog, L]. The
## colours are the air's own, before the tone curve: it squeezes bright
## channels together, so a sky that should read as a clear tropical blue goes
## in far bluer than it comes out. L is how bright the open sky is, which a
## closing grey deck keeps to.
const PALETTE := [
	[-0.4, Vector3(0.004, 0.009, 0.032), Vector3(0.013, 0.026, 0.062), Vector3(0.011, 0.024, 0.054), 0.027],
	[-0.16, Vector3(0.006, 0.016, 0.062), Vector3(0.03, 0.048, 0.125), Vector3(0.025, 0.043, 0.105), 0.05],
	[-0.05, Vector3(0.05, 0.045, 0.17), Vector3(0.4, 0.17, 0.17), Vector3(0.23, 0.13, 0.17), 0.23],
	[0.03, Vector3(0.035, 0.1, 0.4), Vector3(1.1, 0.5, 0.2), Vector3(0.82, 0.47, 0.3), 0.59],
	[0.16, Vector3(0.045, 0.17, 0.62), Vector3(0.78, 0.6, 0.44), Vector3(0.58, 0.55, 0.56), 0.72],
	[0.42, Vector3(0.022, 0.13, 0.66), Vector3(0.24, 0.5, 0.98), Vector3(0.23, 0.46, 0.86), 0.77],
]

## 0 midnight .. 0.5 noon .. 1. The web game starts at 0.36, mid-morning.
var day := 0.36
## The clock runs (true) or holds the hour.
var running := true

# the weather, eased elsewhere (phase 4 brings it to life)
var cover := 0.2
var rain := 0.0
var storm := 0.0
var fog := 0.0
var heat := 0.0
var calm := 0.0
## Wind strength, 0 calm .. 1 a stiff breeze.
var wind := 0.72

var sun_dir := Vector3.UP
var moon_dir := Vector3.UP
var key_dir := Vector3.UP
var key_color := Vector3.ONE
var zenith := Vector3.ZERO
var horizon := Vector3.ZERO
var fog_color := Vector3.ZERO
var fog_range := Vector2(380.0, 1500.0)
var haze := Vector3.ZERO
var light_tint := Vector3.ONE
var night := 0.0
var exposure := 1.0
var grade_lo := Vector3(0.9, 1.0, 1.1)
var grade_hi := Vector3(1.06, 1.0, 0.92)
var grade_sat := 1.05
## The grade's contrast (an S-curve on the display values) and vibrance.
var contrast := 0.24
var vibrance := 0.3
var vignette := 0.55

var _day_ref := 1.0
var _pace_norm := 1.0


func _init() -> void:
	# light level of a clear noon, which unlit effects are normalised against
	var noon := _palette(0.85)
	_day_ref = _lum(noon[1]) * 0.55 + _lum(noon[0]) * 0.45 + SUN_I * 0.85 * 0.22 * 0.93
	# normalise the clock's pace so a whole day still takes DAY_LENGTH
	var t := 0.0
	for i in 2000:
		t += 1.0 / _pace(i / 2000.0) / 2000.0
	_pace_norm = t
	update(0.0)


static func _lum(c: Vector3) -> float:
	return c.x * 0.2126 + c.y * 0.7152 + c.z * 0.0722


static func _celestial(phi: float) -> Vector3:
	# a circle through east (phi 0), high in the north (pi/2) and west (pi)
	var x := cos(phi)
	var y := sin(PEAK) * sin(phi)
	var z := -cos(PEAK) * sin(phi)
	return Vector3(x * cos(YAW) + z * sin(YAW), y, -x * sin(YAW) + z * cos(YAW)).normalized()


## How fast the clock runs: the golden hours and twilight linger, the deep night passes quicker.
static func _pace(d: float) -> float:
	var sy := sin(PEAK) * sin((d - 0.25) * TAU)
	var twilight := 1.0 - MathX.smooth(0.04, 0.24, absf(sy + 0.05))
	var nt := MathX.smooth(-0.05, -0.3, sy)
	return 1.0 - 0.55 * twilight + 0.4 * nt


## [zenith, horizon, fog, L] for a sun height.
static func _palette(s: float) -> Array:
	var i := 0
	while i < PALETTE.size() - 2 and s > PALETTE[i + 1][0]:
		i += 1
	var a: Array = PALETTE[i]
	var b: Array = PALETTE[i + 1]
	var t := MathX.smooth(a[0], b[0], s)
	return [(a[1] as Vector3).lerp(b[1], t), (a[2] as Vector3).lerp(b[2], t), (a[3] as Vector3).lerp(b[3], t), lerpf(a[4], b[4], t)]


## The hour as 0..24.
func hour() -> float:
	return day * 24.0


func set_hour(h: float) -> void:
	day = fposmod(h / 24.0, 1.0)


func update(dt: float) -> void:
	if running:
		day = fposmod(day + dt / DAY_LENGTH * _pace(day) * _pace_norm, 1.0)

	# ---- sun and moon
	var phi := (day - 0.25) * TAU
	sun_dir = _celestial(phi)
	moon_dir = _celestial(phi + PI)
	moon_dir.y = absf(moon_dir.y) * 0.85 + 0.05
	moon_dir = moon_dir.normalized()
	var sy := sun_dir.y
	night = MathX.smooth(0.0, -0.2, sy)
	var sun_vis := MathX.smooth(-0.03, 0.1, sy)
	var moon_vis := MathX.smooth(-0.03, -0.14, sy) * MathX.smooth(-0.02, 0.12, moon_dir.y)
	# cloud dims the direct light; a storm deck nearly kills it
	var clouded := (1.0 - 0.62 * pow(cover, 1.5)) * (1.0 - 0.35 * storm)
	if sy > -0.03:
		key_dir = sun_dir
		# sunset red -> golden -> white noon
		var g := MathX.smooth(0.0, 0.16, sy)
		var w := MathX.smooth(0.12, 0.45, sy)
		var I := SUN_I * sun_vis * clouded * (1.0 + 0.14 * heat)
		key_color = Vector3(1.0, 0.42 + g * 0.3 + w * 0.17, 0.15 + g * 0.27 + w * 0.29) * I
	else:
		key_dir = moon_dir
		var I := 0.62 * moon_vis * clouded
		key_color = Vector3(0.55, 0.68, 1.0) * I

	# ---- sky and fog
	var pal := _palette(sy)
	zenith = pal[0]
	horizon = pal[1]
	fog_color = pal[2]
	var sky_l: float = pal[3]
	# the open sky stays blue between the clouds: only a closing deck greys it over
	var c := MathX.smooth(0.45, 1.0, cover) * 0.94
	if c > 0.001:
		var dim := 1.0 - 0.6 * storm
		var grey := Vector3(0.8 - 0.08 * storm, 0.85 - 0.02 * storm, 0.93 + 0.04 * storm)
		var tint := 0.18 * (1.0 - 0.65 * storm)
		zenith = zenith.lerp(zenith * tint + grey * (sky_l * 0.78 * dim) * (1.0 - tint), c)
		horizon = horizon.lerp(horizon * tint + grey * (sky_l * 0.86 * dim) * (1.0 - tint), c)
		fog_color = fog_color.lerp(fog_color * tint + grey * (sky_l * 0.92 * dim) * (1.0 - tint), c)
	# a scorching noon bleaches the horizon to a white-hot glare under a deep blue crown
	if heat > 0.001:
		var k := heat * sun_vis
		var L := sky_l * 1.22
		horizon = horizon.lerp(Vector3(1.02, 0.97, 0.86) * L, k * 0.6)
		fog_color = fog_color.lerp(Vector3(0.97, 0.94, 0.86) * L, k * 0.55)
		zenith *= Vector3(1.0 - 0.12 * k, 1.0 - 0.02 * k, 1.0 + 0.06 * k)
	# mist glows with whatever light there is, a soft pearl of the hour's colour
	if fog > 0.01:
		fog_color = fog_color.lerp(horizon.lerp(Vector3.ONE * _lum(horizon), 0.45) * 1.05, fog * 0.5)
	# clear air is clear, the far islands keeping their colour the way they do
	# in the tropics; not by night, when the haze keeps far lamps from blooming
	var clear_air := 1.0 + 0.38 * (1.0 - fog) * (1.0 - rain) * (1.0 - MathX.smooth(0.5, 1.0, cover) * 0.6) * (1.0 - night)
	fog_range = Vector2(380.0 * (1.0 - 0.55 * fog), 1500.0 * (1.0 - 0.5 * fog)) * clear_air

	# ---- exposure and the light reaching shade and water
	# a grey day is lifted a little, a storm let fall darker and moodier, and
	# the low sun's hour, between the day's light and the night's lift, opened up a little
	exposure = (1.0 + 1.3 * night) * (1.0 + 0.3 * MathX.smooth(0.2, 0.0, sy) * (1.0 - night)) * (1.0 + 0.16 * cover) * (1.0 - 0.1 * storm * (1.0 - night)) * (1.0 + 0.05 * heat)
	var key := maxf(key_dir.y, 0.0) * 0.22
	# the sky's own blue is far deeper than it reads: unlit things take it at a
	# little under two thirds strength, or every puff of smoke turns blue
	var amb := horizon * 0.55 + zenith * 0.45
	amb = amb.lerp(Vector3.ONE * _lum(amb), 0.4)
	light_tint = ((amb + key_color * key) / _day_ref).min(Vector3(1.3, 1.3, 1.3))
	var haze_k := 1.0 - 0.85 * cover
	if sy > -0.03:
		var g := MathX.smooth(0.0, 0.3, sy)
		haze = Vector3(1.0, 0.55 + 0.25 * g, 0.25 + 0.3 * g) * (sun_vis * haze_k * (1.0 + 0.9 * heat))
	else:
		haze = Vector3(0.3, 0.38, 0.55) * (0.3 * moon_vis * haze_k)
	_update_look(sy, sun_vis)


## The grade: crisp at noon, sky-blue shade under warm, sunny light; honeyed
## with sea-blue shade at the golden hours, cool and blue after dark, flat and
## grey under a storm.
func _update_look(sy: float, sun_vis: float) -> void:
	var golden := MathX.smooth(-0.06, 0.04, sy) * MathX.smooth(0.36, 0.1, sy) * sun_vis
	var dusk := MathX.smooth(0.06, -0.12, sy) * (1.0 - night * 0.5)
	var grey := maxf(maxf(storm * 0.85, MathX.smooth(0.45, 1.0, cover) * 0.55), maxf(rain * 0.5, fog * 0.3))
	var lo := Vector3(0.9, 1.0, 1.1)
	var hi := Vector3(1.06, 1.0, 0.92)
	var sat := 1.05
	lo = lo.lerp(Vector3(0.9, 0.97, 1.1), golden)
	hi = hi.lerp(Vector3(1.12, 1.0, 0.84), golden)
	sat += golden * 0.08
	lo = lo.lerp(Vector3(0.9, 0.97, 1.12), maxf(dusk, night))
	hi = hi.lerp(Vector3(0.97, 1.0, 1.06), maxf(dusk, night))
	sat -= night * 0.05
	lo = lo.lerp(Vector3(0.97, 1.0, 1.03), grey)
	hi = hi.lerp(Vector3(1.0, 1.0, 0.99), grey)
	sat -= grey * 0.16
	lo = lo.lerp(Vector3(0.9, 1.0, 1.07), storm * (1.0 - night * 0.6))
	hi = hi.lerp(Vector3(0.98, 1.0, 1.02), storm)
	lo = lo.lerp(Vector3(0.98, 1.0, 1.04), fog * (1.0 - rain) * 0.6)
	hi = hi.lerp(Vector3(1.06, 1.02, 0.97), fog * (1.0 - rain) * golden * 0.8)
	# a scorching noon: blown, honeyed highlights and a little colour burnt out of it
	hi = hi.lerp(Vector3(1.1, 1.02, 0.86), heat * 0.7)
	lo = lo.lerp(Vector3(1.0, 0.99, 0.98), heat * 0.5)
	sat -= heat * 0.05
	sat += calm * 0.04
	grade_lo = lo
	grade_hi = hi
	grade_sat = sat
	# contrast and vibrance: a clear day has the most of both, the golden hours
	# more still; a grey sky, a mist, a hot glare and the night soften them
	var soft := fog * (1.0 - rain)
	contrast = 0.24 + 0.05 * golden - 0.1 * grey - 0.1 * soft - 0.07 * night - 0.06 * heat
	vibrance = 0.3 + 0.1 * golden - 0.16 * grey - 0.1 * soft - 0.12 * night - 0.1 * heat
	vignette = 0.55 + storm * 0.4 + rain * 0.12 + fog * 0.1


## Pushes the air into the shader globals, the key light and the environment.
func apply(sun: DirectionalLight3D, env: Environment) -> void:
	var rs := RenderingServer
	rs.global_shader_parameter_set("sun_dir", key_dir)
	rs.global_shader_parameter_set("sun_color", key_color)
	rs.global_shader_parameter_set("sky_zenith", zenith)
	rs.global_shader_parameter_set("sky_horizon", horizon)
	rs.global_shader_parameter_set("fog_color", fog_color)
	rs.global_shader_parameter_set("fog_range", fog_range)
	rs.global_shader_parameter_set("haze", haze)
	rs.global_shader_parameter_set("light_tint", light_tint)
	rs.global_shader_parameter_set("night", night)
	rs.global_shader_parameter_set("weather", Vector4(cover, rain, storm, fog))
	if sun:
		# Godot hands a light's colour x energy x PI to the shaders, three.js
		# the colour itself: an energy of I / PI keeps every lit surface as bright
		# as it was tuned. A light's colour is read as sRGB, so it goes in encoded.
		var I := maxf(maxf(key_color.x, key_color.y), maxf(key_color.z, 1e-4))
		sun.light_color = Color(key_color.x / I, key_color.y / I, key_color.z / I).linear_to_srgb()
		sun.light_energy = I / PI
		var up := Vector3.UP if absf(key_dir.y) < 0.99 else Vector3.FORWARD
		sun.global_basis = Basis.looking_at(-key_dir, up)
		sun.visible = I > 0.002
	if env:
		# the linear tonemapper hands the colour grade half the scene's light
		# (the most a phone's colour buffer holds is 2): see render/grade.gd
		env.tonemap_exposure = exposure * 0.5
		env.ambient_light_energy = SKY_LIGHT
