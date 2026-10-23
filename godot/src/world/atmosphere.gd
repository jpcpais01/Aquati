class_name Atmosphere
extends RefCounted
## The hour and the weather made visible: where the sun stands and what
## colour it shines, the sky's palette, the haze and the grade. Everything is
## keyed on the sun's height, the way the web game does it, and pushed into
## the shared shader globals (shaders/inc/atmos.gdshaderinc), the key light
## and the environment by apply().
##
## The weather (the web's world/atmosphere.ts) is a small Markov chain of
## spells: clear, fair, cloudy, mist, rain and storm. A spell only sets
## targets, and every parameter eases toward its own at its own pace, so the
## clouds gather first, then the rain, and the sea takes longest of all to
## build and to settle. Now and then something rarer comes round: a mirror
## calm (mostly at dawn), and out on the high seas a very hot noon; and a
## night in a sea-spark bloom can be held as the glowing seas. The wind
## wanders about its prevailing heading, swinging harder with each change of
## weather. By night the stars wheel overhead and the moon keeps its phase.

## The weather changed (its kind, and a title and a line for the toast).
signal changed(kind: StringName, title: String, line: String)
## A marked shift of the wind got under way (a title and a line naming where it blows from).
signal wind_shifted(title: String, line: String)

## The weathers: the sky each one sets (cloud cover, rain, storm, mist and
## the wind's strength), how long a spell of it lasts (s), what may follow it
## and how likely, and the toast it arrives with. Mirror calm and the very hot
## noon are in no list: they are rolled as a stretch of the day begins. The
## glowing seas only ever come picked by hand, at night in a sea-spark bloom
## (SeaGlow): a still, clear night with the bloom at its brightest.
const WEATHER := {
	&"clear": {"name": "Clear", "cover": 0.2, "rain": 0.0, "storm": 0.0, "fog": 0.0, "wind": 0.72, "dur": Vector2(150.0, 280.0),
		"next": [[&"fair", 0.55], [&"cloudy", 0.3], [&"mist", 0.15]], "arrive": ["Clear skies", "The clouds break apart"]},
	&"fair": {"name": "Fair", "cover": 0.34, "rain": 0.0, "storm": 0.0, "fog": 0.0, "wind": 0.8, "dur": Vector2(140.0, 260.0),
		"next": [[&"clear", 0.35], [&"cloudy", 0.45], [&"rain", 0.15], [&"mist", 0.05]], "arrive": []},
	&"cloudy": {"name": "Cloudy", "cover": 0.66, "rain": 0.0, "storm": 0.05, "fog": 0.12, "wind": 0.88, "dur": Vector2(100.0, 190.0),
		"next": [[&"fair", 0.35], [&"rain", 0.42], [&"storm", 0.13], [&"clear", 0.1]], "arrive": ["Clouds gathering", "The sky turns grey"]},
	&"mist": {"name": "Mist", "cover": 0.5, "rain": 0.0, "storm": 0.0, "fog": 0.9, "wind": 0.36, "dur": Vector2(80.0, 150.0),
		"next": [[&"clear", 0.5], [&"fair", 0.5]], "arrive": ["Sea mist", "A thick mist rolls over the water"]},
	&"rain": {"name": "Rain", "cover": 0.93, "rain": 0.62, "storm": 0.18, "fog": 0.38, "wind": 0.98, "dur": Vector2(90.0, 170.0),
		"next": [[&"cloudy", 0.45], [&"storm", 0.35], [&"fair", 0.2]], "arrive": ["Rain", "Rain sweeps across the islands"]},
	&"storm": {"name": "Storm", "cover": 1.0, "rain": 1.0, "storm": 1.0, "fog": 0.62, "wind": 1.28, "dur": Vector2(90.0, 160.0),
		"next": [[&"rain", 0.7], [&"cloudy", 0.3]], "arrive": ["Storm", "Thunder rolls in and the seas are building"]},
	&"calm": {"name": "Mirror calm", "cover": 0.26, "rain": 0.0, "storm": 0.0, "fog": 0.14, "wind": 0.12, "dur": Vector2(170.0, 270.0),
		"next": [[&"clear", 0.45], [&"fair", 0.4], [&"mist", 0.15]], "arrive": ["Mirror calm", "The wind dies away and the sea turns to glass"]},
	&"hot": {"name": "Very hot", "cover": 0.03, "rain": 0.0, "storm": 0.0, "fog": 0.12, "wind": 0.5, "dur": Vector2(150.0, 230.0),
		"next": [[&"clear", 0.6], [&"fair", 0.4]], "arrive": ["Very hot", "The sun blazes down from a white-hot sky"]},
	&"glow": {"name": "Glowing seas", "cover": 0.12, "rain": 0.0, "storm": 0.0, "fog": 0.04, "wind": 0.45, "dur": Vector2(150.0, 240.0),
		"next": [[&"clear", 0.6], [&"fair", 0.4]], "arrive": ["Glowing seas", "The night sea lights up blue wherever it is stirred"]},
}
## The weathers in the order the sky badge steps through them.
const KINDS: Array[StringName] = [&"clear", &"fair", &"cloudy", &"mist", &"rain", &"storm", &"calm", &"hot", &"glow"]
## The hours the clock can be held at: a name and the hour.
const TIMES := {
	&"dawn": ["Dawn", 6.3],
	&"noon": ["Noon", 12.5],
	&"golden": ["Golden hour", 17.7],
	&"dusk": ["Dusk", 19.3],
	&"night": ["Night", 23.0],
}
## The prevailing wind: the heading (the bearing it blows toward, x = sin, z =
## cos) the weather keeps bringing it back to. From the west.
const WIND_HOME := 1.25
const POINTS := ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]

## One full day, in seconds of play.
const DAY_LENGTH := 20.0 * 60.0
## Clear-noon sun irradiance.
const SUN_I := 3.8
## The sun's highest elevation (40 degrees), and the swing of noon toward the north-west.
const PEAK := 0.6981317
const YAW := 0.5
## Light from the sky dome, against the sun's (the web's SKY_LIGHT).
const SKY_LIGHT := 0.72
## The sky turns about the axis of the sun's daily circle: the stars wheel
## round its pole through the night, rising and setting just as the sun does.
static var POLE := _celestial(0.0).cross(_celestial(PI * 0.5)).normalized()
## Due east on the horizon, where the sun comes up.
static var EAST := _celestial(0.0)
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
## The clock runs (true) or stands still (a set piece's frame).
var running := true
## &"auto" lets the day run; one of TIMES holds the clock at that hour.
var time_mode := &"auto"

## The weather now, and &"auto" (it turns by itself) or the kind it is held at.
var kind := &"clear"
var mode := &"auto"
## Keeps the weather from moving on.
var hold := false
## Whose weather comes next: the home isles' (&"home"), Las Brumas' (&"mist":
## sea mist at any hour, more rain) or the high seas' (&"open": fair and settled).
var climate := &"home"

# the weather, each eased toward the spell's own
var cover := 0.2
var rain := 0.0
var storm := 0.0
var fog := 0.0
## 0 .. 1 a very hot noon: a bleached sky and a white-hot glare.
var heat := 0.0
## 0 .. 1 a mirror calm: the swell all but gone, the sea a looking glass.
var calm := 0.0
## Wind strength, 0 calm .. 1 a stiff breeze (a storm blows harder).
var wind := 0.72
## Rain-soaked decks and rocks, lagging the rain and drying slowly.
var wet := 0.0
## The sea state, 0 calm .. ~1.3 a storm's swell (lags the storm the most).
var sea := 0.0
## The wind's heading (never wrapped, so it turns the short way round), and
## the heading it is coming round to. wind_locked pins it (a set piece's).
var wind_angle := WIND_HOME
var wind_to := WIND_HOME
var wind_locked := false
## Lightning's flash this frame (0 .. ~2), handed in by the lightning.
var flash := 0.0
## The moon's phase, 0 new .. 0.5 full (tonight's real moon, then an eighth
## of its month on with every day of play), and how much of its disc is lit.
var moon_phase := 0.0
var moon_lit := 1.0
## How much of the moon's disc shows in the sky (0 by day: it comes out as
## the sun goes down, a pale ghost in the dusk, and hides behind a closing
## sky), and toward the sun as the moon sees it (its lit limb).
var moon_show := 0.0
var moon_sun := Vector3.UP
## World directions into the star sphere, turned with the sun.
var star_rot := Basis.IDENTITY
## How thick the sea-spark bloom is where the ship sails (SeaGlow.at, handed
## in by the game), and how brightly the blooms glow tonight (0 by day).
var bloom := 0.0
var sea_glow := 0.0
## The cloud deck: how far it has drifted on the wind (in cloud-field uv),
## the field's threshold for the cover (above it there is cloud), and how
## tall the heaps stand over their flat base (m).
var cloud_uv := Vector2.ZERO
var cloud_lo := 0.69
var heap_tall := 480.0
## Weather lying on the water (see veil_at in the shaders): density at sea
## level (1/m), height scale (m), patchiness and drift speed (m/s).
var veil := Vector4(0.0, 20.0, 0.0, 0.0)

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
var _rng := RandomNumberGenerator.new()
var _state_t := 0.0
var _state_dur := 0.0
var _locked := false
## Speeds the blend up for a moment after the weather is picked by hand.
var _rush := 0.0
## The stretch of the day the last rare roll was for, and the weather it picked.
var _period := &""
var _rare := &""
var _veer_t := 0.0
var _veer_dur := 0.0
var _shift_note := -1.0


func _init() -> void:
	_rng.randomize()
	# the first change comes a couple of minutes in
	_state_dur = 120.0 + _rng.randf() * 80.0
	_veer_dur = 100.0 + _rng.randf() * 120.0
	# tonight's real moon (a new moon fell at 18:14 UTC on 6 January 2000)
	moon_phase = fposmod((Time.get_unix_time_from_system() - 947182440.0) / 86400.0 / 29.530588853, 1.0)
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


## The eight-point compass name of the quarter a wind with this heading
## blows from (up the chart, north, is -z).
static func compass(angle: float) -> String:
	return POINTS[posmod(roundi(-angle / (PI / 4.0)), 8)]


static func _ease(cur: float, to: float, tau: float, t: float) -> float:
	return cur + (to - cur) * (1.0 - exp(-t / tau))


## The hour as 0..24.
func hour() -> float:
	return day * 24.0


func set_hour(h: float) -> void:
	day = fposmod(h / 24.0, 1.0)


## Holds the clock at one of TIMES (&"auto" lets the day run again): the
## sun travels there rather than jumping, unless now.
func set_time_mode(m: StringName, now := false) -> void:
	time_mode = m
	if now and m != &"auto":
		set_hour(TIMES[m][1])


## Turns the weather to a kind; now settles it in at once.
func set_weather(k: StringName, now := false) -> void:
	var d: Dictionary = WEATHER[k]
	kind = k
	_state_t = 0.0
	_state_dur = d.dur.x + _rng.randf() * (d.dur.y - d.dur.x)
	if now:
		cover = d.cover
		rain = d.rain
		storm = d.storm
		fog = d.fog
		wind = d.wind
		wet = minf(1.0, rain * 1.6)
		sea = _sea_target()
		calm = 1.0 if k == &"calm" else 0.0
		heat = 1.0 if k == &"hot" else 0.0


## Picks the weather by hand (&"auto" hands it back to nature) and blends to
## it quickly; now settles it in at once.
func set_mode(m: StringName, now := false) -> void:
	mode = m
	_locked = m != &"auto"
	if _locked:
		set_weather(m, now)
	if now:
		# (a voyage setting out under it, or a set piece: no gale getting up)
		return
	if m == &"storm":
		_shift_wind(1.2, 4.0)
	else:
		_state_dur = minf(_state_dur, _state_t + 60.0 + _rng.randf() * 60.0)
	_rush = 1.0


## Brings the next turn of the weather within s seconds.
func hasten(s: float) -> void:
	_state_dur = minf(_state_dur, _state_t + s)


## What a weather picked by hand still waits for here and now ("" if it can be
## had): the very hot noon and the glowing seas keep to their time and place.
## keep loosens the test a little for one already set, so it doesn't flicker
## off at the edge.
func needs(m: StringName, keep := false) -> String:
	var h := hour()
	if m == &"hot":
		if climate != &"open":
			return "Only out on the high seas, at noon (11:00 to 14:00), far from any island."
		if h < 11.0 or h >= (14.5 if keep else 14.0):
			return "Only at noon (11:00 to 14:00). Tap the clock to set it to Noon."
	elif m == &"glow":
		if bloom < (0.12 if keep else 0.3):
			return "Only in the glowing stretches of the high seas, at night. Two lie on the crossing to Las Brumas."
		if h < 20.5 and h >= 4.8:
			return "Only at night (20:30 to 04:45). Tap the clock to set it to Night."
	return ""


## The sky badge's picture of the weather, by day or by night.
func icon() -> String:
	var dark := sun_dir.y < -0.03
	match kind:
		&"storm":
			return "storm"
		&"rain":
			return "rain"
		&"mist":
			return "mist"
		&"cloudy":
			return "cloud"
		&"calm":
			return "calm-moon" if dark else "calm"
		&"hot":
			return "hot"
		&"glow":
			return "glow"
		&"fair":
			return "partly-moon" if dark else "partly-sun"
	return "moon" if dark else "sun"


func _sea_target() -> float:
	return storm * 1.05 + rain * 0.12 + (wind - 0.8) * 0.35


func _next_weather() -> void:
	var h := hour()
	var dawn := h > 3.5 and h < 9.0
	var opts: Array = []
	var sum := 0.0
	for o: Array in WEATHER[kind].next:
		var k: StringName = o[0]
		var w: float = o[1]
		if k == &"mist":
			w *= (5.0 if dawn else 2.2) if climate == &"mist" else (4.0 if dawn else 0.15)
		if climate == &"mist" and (k == &"rain" or k == &"cloudy"):
			w *= 1.4
		if climate == &"open":
			w *= 0.2 if k == &"storm" else 0.35 if k == &"rain" else 0.7 if k == &"cloudy" else 0.5 if k == &"mist" else 1.6
		opts.append([k, w])
		sum += w
	# (a scorching noon the ship sailed back in among the islands from, or that came too late, is off)
	if _rare == &"hot" and (climate != &"open" or _period != &"noon"):
		_rare = &""
	var next: StringName = _rare
	if next == &"":
		var r := _rng.randf() * sum
		next = opts[-1][0]
		for o: Array in opts:
			r -= o[1]
			if r <= 0.0:
				next = o[0]
				break
	_rare = &""
	set_weather(next)
	# a change of weather brings the wind round with it: hardest into a storm
	_shift_wind(1.7 if next == &"storm" else 1.15 if next == &"rain" else 0.4 if next == &"mist" or next == &"calm" else 0.8, 6.0)
	var a: Array = WEATHER[next].arrive
	if not a.is_empty():
		changed.emit(next, a[0], a[1])


## The rare weathers, rolled once as each stretch of the day begins: a mirror
## calm comes with one dawn in five, one night in ten and one spell of the day
## in twenty; a very hot noon only out on the high seas, one in twenty. A hit
## brings the weather round to it within half a minute or so.
func _roll_rare(per: StringName) -> void:
	if _locked:
		return
	if per == &"noon" and climate == &"open" and _rng.randf() < 0.05:
		_rare = &"hot"
	elif kind != &"storm" and _rng.randf() < (0.2 if per == &"dawn" else 0.1 if per == &"night" else 0.05):
		_rare = &"calm"
	else:
		return
	hasten(4.0 + _rng.randf() * 22.0)


## Sends the wind round to a new heading, up to span radians either way. It
## wanders about its prevailing heading rather than drifting off for good,
## and a shift big enough to notice is announced note seconds on.
func _shift_wind(span: float, note: float) -> void:
	_veer_t = 0.0
	_veer_dur = (90.0 + _rng.randf() * 150.0) * (1.0 - storm * 0.55)
	if wind_locked:
		return
	var off := wind_to - WIND_HOME
	var dir := -1.0 if _rng.randf() < 0.5 else 1.0
	if absf(off) > 1.2 and _rng.randf() < 0.8:
		dir = -signf(off)
	var turn := dir * span * (0.45 + _rng.randf() * 0.55)
	wind_to += turn
	if absf(turn) > 0.3:
		_shift_note = note


func update(dt: float) -> void:
	# ---- the clock
	var was := day
	if time_mode == &"auto":
		if running:
			day = fposmod(day + dt / DAY_LENGTH * _pace(day) * _pace_norm, 1.0)
	else:
		# sweep forward to the chosen hour, so the sun travels there rather than jumping
		var left := fposmod(float(TIMES[time_mode][1]) / 24.0 - day, 1.0)
		if left > 1e-4:
			day = fposmod(day + minf(left, maxf(left * 0.9, 0.02) * dt), 1.0)
	# the moon waxes and wanes an eighth of its month with each day that passes
	var dd := fposmod(day - was, 1.0)
	if dt > 0.0 and dd < 0.5:
		moon_phase = fposmod(moon_phase + dd / 8.0, 1.0)

	# ---- the weather
	var hr := hour()
	var per := &"dawn" if hr >= 4.8 and hr < 8.5 else &"noon" if hr >= 11.0 and hr < 14.0 else &"night" if hr >= 20.5 or hr < 4.8 else &"morning" if hr < 11.0 else &"afternoon"
	if per != _period:
		_period = per
		if dt > 0.0:
			_roll_rare(per)
	# the great heat only lasts the noon, and only out where no land cools the air
	if kind == &"hot" and not _locked and (per != &"noon" or climate != &"open"):
		hasten(20.0)
	_state_t += dt
	if not _locked and not hold and _state_t > _state_dur:
		_next_weather()
	var d: Dictionary = WEATHER[kind]
	# a hand-picked change rolls in over a few seconds instead of half a minute
	_rush = maxf(0.0, _rush - dt / 12.0)
	var t := dt * (1.0 + _rush * 7.0)
	cover = _ease(cover, d.cover, 22.0, t)
	# rain waits for the clouds to thicken, and stops ahead of them clearing
	rain = _ease(rain, d.rain * MathX.smooth(0.6, 0.9, cover), 14.0, t)
	storm = _ease(storm, d.storm * MathX.smooth(0.75, 0.98, cover), 26.0, t)
	fog = _ease(fog, d.fog, 25.0, t)
	wind = _ease(wind, d.wind, 18.0, t)
	sea = _ease(sea, _sea_target(), 32.0, t)
	calm = _ease(calm, 1.0 if kind == &"calm" else 0.0, 20.0, t)
	heat = _ease(heat, 1.0 if kind == &"hot" else 0.0, 22.0, t)
	var wet_to := minf(1.0, rain * 1.8)
	# soaked in moments, dried out slowly
	wet = _ease(wet, wet_to, 7.0 if wet_to > wet else 75.0, t)

	# ---- the wind's heading: now and then the breeze veers or backs, squalls shove it about more often
	_veer_t += dt
	if _veer_t > _veer_dur:
		_shift_wind(0.35 + storm * 0.6 + rain * 0.2, 0.0)
	# it swings round with a slow start and settle, never faster than a few degrees a second
	var turn := wind_to - wind_angle
	var max_rate := (0.045 + storm * 0.05) * (1.0 + _rush * 7.0)
	wind_angle += signf(turn) * minf(absf(turn) * (1.0 - exp(-t / 14.0)), max_rate * dt)
	if _shift_note >= 0.0:
		_shift_note -= dt
		if _shift_note < 0.0:
			# veering: the bearing it blows from turning clockwise
			wind_shifted.emit("The wind veers" if wind_to < wind_angle else "The wind backs", "Now blowing from the %s" % compass(wind_to))
	# the cloud deck drifts downwind, quicker in a blow
	cloud_uv += Vector2(sin(wind_angle), cos(wind_angle)) * (0.002 + wind * 0.002 + storm * 0.004) * dt

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
	# the phase as the angle sun, moon and us: 0 full, PI new
	moon_lit = (1.0 + cos(absf(1.0 - 2.0 * moon_phase) * PI)) * 0.5
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
		# a thin moon lights the sea less (never so little the night can't be sailed)
		var I := 0.62 * moon_vis * clouded * (0.72 + 0.28 * moon_lit)
		key_color = Vector3(0.55, 0.68, 1.0) * I

	# ---- the night sky: the stars keep pace with the sun, so the same stars
	# rise at the same hour every night; the moon's lit limb faces the sun
	# below the horizon (west of a waxing evening moon, east of a waning
	# morning one)
	star_rot = Basis(POLE, -phi)
	var pa := absf(1.0 - 2.0 * moon_phase) * PI
	var limb := EAST * (-1.0 if moon_phase < 0.5 else 1.0) - Vector3(0.0, 0.6, 0.0)
	limb = (limb - moon_dir * limb.dot(moon_dir)).normalized()
	moon_sun = -moon_dir * cos(pa) + limb * sin(pa)
	moon_show = MathX.smooth(0.08, -0.08, sy) * MathX.smooth(-0.02, 0.08, moon_dir.y) * (0.25 + 0.75 * clouded)

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
	# Low weather on the sea. Sea mist lies in shallow banks with clear water
	# between them, drifting slowly; rain hangs in tall curtains that sweep by
	# on the wind, a storm's darker, denser and quicker still; a grey deck
	# leaves a little murk under it, a hot noon a thin shimmering haze.
	var mist_k := MathX.smooth(0.4, 0.9, fog) * (1.0 - rain)
	var low_k := 0.1 * MathX.smooth(0.45, 1.0, cover)
	var heat_k := heat * 0.25
	var vsum := mist_k + rain + low_k + heat_k + 1e-4
	veil = Vector4(
		mist_k * 0.012 + rain * 0.0026 + storm * 0.0012 + low_k * 0.004 + heat_k * 0.0016,
		(mist_k * 15.0 + rain * 58.0 + low_k * 40.0 + heat_k * 9.0) / vsum,
		0.4 + 0.58 * mist_k / vsum,
		1.2 + wind * 2.5 + storm * 7.0)
	# the deck: a clear day keeps about a tenth of the sky, fair weather a
	# quarter, a cloudy one two thirds, and a storm closes it completely; fair
	# cumulus tower, a grey day flattens them into rolls, a storm piles them high
	var c4 := cover * cover * cover * cover
	cloud_lo = 0.89 - cover * 0.7 - c4 * c4 * c4 * c4 * 0.5
	heap_tall = lerpf(480.0, 280.0, MathX.smooth(0.45, 0.9, cover)) + storm * 520.0

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
		haze = Vector3(0.3, 0.38, 0.55) * (0.3 * moon_vis * haze_k * (0.35 + 0.65 * moon_lit))
	# the sea-spark blooms glow on dark nights, brightest when the glowing seas are held
	sea_glow = maxf(0.6, MathX.smooth(0.15, 0.6, night)) if kind == &"glow" else MathX.smooth(0.3, 0.85, night) * (1.0 - 0.7 * storm)
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
	rs.global_shader_parameter_set("clouds", Vector4(cloud_uv.x, cloud_uv.y, cloud_lo, heap_tall))
	rs.global_shader_parameter_set("sky_fx", Vector4(wet, flash, calm, heat))
	rs.global_shader_parameter_set("veil", veil)
	rs.global_shader_parameter_set("star_rot", star_rot)
	rs.global_shader_parameter_set("moon", Vector4(moon_dir.x, moon_dir.y, moon_dir.z, moon_show))
	rs.global_shader_parameter_set("moon_light", Vector4(moon_sun.x, moon_sun.y, moon_sun.z, moon_lit))
	rs.global_shader_parameter_set("sea_glow", sea_glow)
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
		# lightning: the whole world blinks cold and bright
		env.tonemap_exposure = exposure * 0.5 * (1.0 + minf(flash, 1.5) * 0.88)
		env.ambient_light_energy = SKY_LIGHT * (1.0 + flash * 5.0)
