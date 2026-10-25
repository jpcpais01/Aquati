class_name Sound
extends Node
## The voyage's sound, played as the web game plays it (src/core/audio.ts):
## the sea, the wind and the rain round the listener, thunder rolling in
## late from the strike, every gun, blow and splash out on the water, her
## sinking, a trading port's quay, the interface's few notes, and the music
## (Music). The sounds are
## the web's own, rendered offline into res://audio by
## tools/audio/bake_audio.mjs; sounds.json there holds the level each was
## rendered at.
##
## Out on the water a sound arrives late, at the speed of sound; the air
## eats its highs the farther it carried (each voice plays through the air
## bus nearest its distance) and more of a far one comes back as echo off
## the isles (a send to the echo bus, through the same air). A crowded mix
## lets the faint and far go first and never grows past what a phone can mix.
## Close, heavy blows duck the sea and the wind for a moment, as your ears
## do. A compressor glues the mix and a limiter keeps it off full scale.
##
## The buses, each sending to one before it:
##   Master [limiter]; UI (straight out, round the muffle)
##   Mix [the master volume, the muffle under the waves, the compressor]
##     SFX; Air6k, Air2k5, Air1k, Air450 (the air); Echo [the isles' echo]
##       and EchoAir6k .. EchoAir450
##     Amb; Bed (the duck); Surf, Wind, Rain, Roar (the beds)
##     Music; Deep (the drone under the waves)

const SPEED_OF_SOUND := 343.0
## Voices out on the water at once, at most, and past how many the faint
## ones are dropped (the web's phone caps); the live one-shots' budget in a
## crowded moment.
const MAX_VOICES := 30
const CROWDED := 18
const SYNTH_BUDGET := 14.0
## The sea and the wind sit well under the guns and the music: a bed, not a wall.
const AMBIENCE_LEVEL := 0.35
## What the air leaves of a sound's highs (Hz) on each air bus, the open one
## first; a voice takes the bus nearest its cutoff on a log scale.
const AIR := [17000.0, 6000.0, 2500.0, 1000.0, 450.0]
const AIR_BUS := [&"SFX", &"Air6k", &"Air2k5", &"Air1k", &"Air450"]
const ECHO_BUS := [&"Echo", &"EchoAir6k", &"EchoAir2k5", &"EchoAir1k", &"EchoAir450"]
## The echo bus's level: the web's convolver (normalised, 0.75 wet) matched
## in energy by Godot's delay and reverb.
const ECHO_DB := -16.6
## The web's low and high cuts take Q in dB: its default (1 dB) and the air's
## (0.5 dB) as Godot's plain Q, and the drone's (3 dB).
const Q_DEFAULT := 1.122
const Q_AIR := 1.059
const Q_DEEP := 1.413
## Voices in the pools: panned ones out on the water, and plain ones (the
## echo sends, the interface).
const DRY_VOICES := 48
const PLAIN_VOICES := 32
const MANIFEST := "res://audio/sounds.json"
## The beds, each the sea's noise looping through its own bus: the surf, the
## wind, the rain's hiss and its roar in a downpour; how fast each follows
## the weather and her way (s), and its noise's rate and starting point. The
## maelstrom's two (its roar and its throat's howl) skip the duck, as the web's.
enum { SURF, WIND, RAIN, ROAR, VORTEX, HOWL }
const BED_BUS := [&"Surf", &"Wind", &"Rain", &"Roar", &"Vortex", &"Howl"]
const BED_TC := [0.5, 0.5, 0.6, 0.8, 0.4, 0.5]
const BED_RATE := [1.0, 0.7, 1.0, 0.55, 0.42, 0.9]
const BED_START := [0.0, 1.3, 0.7, 2.1, 0.4, 1.7]
## The sizes the pockets of air were rendered at.
const AIR_SIZES := [0.6, 1.0, 1.5]
## The muffle's cutoff (Hz) above which it is left out of the mix.
const OPEN := 20000.0
## The quay's loops while she's tied up (the water among the pilings, the
## hubbub) and their levels; how often something happens on it (s).
const QUAY := ["lap", "murmur"]
const QUAY_LEVEL := [0.9, 0.3]
const QUAY_TICK := 0.9

## The music: the voyage band and the high seas' theme.
var music: Music
## Sounds played and dropped since the start (the smoke test's report), and peals of thunder.
var played := 0
var dropped := 0
var peals := 0

## Every sound by name: its takes (null until loaded) and the level each was rendered at.
var _takes := {}
var _gains := {}
var _stereo := {}
## Takes still loading: path -> [name, take].
var _loading := {}
var _live := false
var _now := 0.0
var _muted := false
var _music_on := true
## The volume sliders, squared (0..1).
var _master := 1.0
var _effects := 1.0
var _ambience := 1.0
var _music_vol := 0.64
## The screen's width in the 2D pan's units.
var _width := 1280.0

var _dry: Array[AudioStreamPlayer2D] = []
var _dry_free: Array[int] = []
var _counted := PackedByteArray()
var _plain: Array[AudioStreamPlayer] = []
var _plain_free: Array[int] = []
## Voices out on the water now (counted against MAX_VOICES), and the live one-shots' recent load.
var _voices := 0
var _synth_load := 0.0
var _synth_at := 0.0
var _cues: Array[_Cue] = []
## Voices sweeping across (a ball tearing past): [voice, from, seconds, pan, pan_to, level, stereo].
var _sweeps: Array[Array] = []

var _noise: AudioStream
var _noise_gain := 1.0
var _beds: Array[AudioStreamPlayer] = []
var _bed := PackedFloat32Array([0.22, 0.05, 0.0, 0.0, 0.0, 0.0])
var _bed_to := PackedFloat32Array([0.22, 0.05, 0.0, 0.0, 0.0, 0.0])
var _bed_db := PackedFloat32Array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
var _wind_bp: AudioEffectFilter
## The maelstrom's roar: its pan and lowpass, and the howl's swept band (and how near the eye, 0..1).
var _vortex_pan: AudioEffectPanner
var _vortex_lp: AudioEffectFilter
var _howl_bp: AudioEffectFilter
var _vortex_near := 0.0
var _vortex_near_to := 0.0
var _vortex_pan_to := 0.0
var _gust := 0.0
var _sailing := 0.0
var _rain := 0.0
var _storm := 0.0
var _wind := 0.8
## The duck: when the last one lands, the level it held until then, and how low it goes.
var _duck_at := -1e9
var _duck_hold := 1.0
var _duck_low := 1.0
var _duck_db := 0.0

var _amp: AudioEffectAmplify
var _muffle: AudioEffectFilter
var _muffle_hz := 22000.0
var _muffle_to := 22000.0
var _muffle_tc := 0.15
var _muffle_on := false
## The drone under the waves: its player and level, rising or dying away.
var _deep: AudioStreamPlayer
var _deep_lp: AudioEffectFilter
var _deep_g := 0.0
var _deep_on := false
var _deep_off := -1.0
## The quay: its loops' players and the level each take was rendered at, how
## far in (0 .. 1) it has faded, and since when it has been fading out (< 0: not).
var _quay: Array[AudioStreamPlayer] = []
var _quay_gain := PackedFloat32Array([1.0, 1.0])
var _quay_g := 0.0
var _quay_on := false
var _quay_off := -1.0
var _quay_tick := 0.0

var _bus := {}


## A sound waiting for its moment: a take, where it plays and how.
class _Cue:
	var at := 0.0
	var stream: AudioStream
	var vol := 1.0
	var pitch := 1.0
	var pan := 0.0
	var pan_to := NAN
	var stereo := false
	## The air bus it plays through, and its send to the echo (0: none).
	var air := 0
	var wet := 0.0
	## Out on the water (counted against MAX_VOICES); the interface, straight out.
	var counted := false
	var ui := false
	## A bus of its own (a gull's, on the ambience), rather than the air's.
	var bus := &""


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	build_buses()
	for n: StringName in [&"Mix", &"SFX", &"Amb", &"Bed", &"Music", &"Deep"]:
		_bus[n] = AudioServer.get_bus_index(n)
	_amp = AudioServer.get_bus_effect(_bus[&"Mix"], 0)
	_muffle = AudioServer.get_bus_effect(_bus[&"Mix"], 1)
	_wind_bp = AudioServer.get_bus_effect(AudioServer.get_bus_index(&"Wind"), 0)
	_vortex_lp = AudioServer.get_bus_effect(AudioServer.get_bus_index(&"Vortex"), 0)
	_vortex_pan = AudioServer.get_bus_effect(AudioServer.get_bus_index(&"Vortex"), 1)
	_howl_bp = AudioServer.get_bus_effect(AudioServer.get_bus_index(&"Howl"), 0)
	_deep_lp = AudioServer.get_bus_effect(_bus[&"Deep"], 0)
	# a 2D voice is panned by where it stands across the screen from the listener
	get_viewport().audio_listener_enable_2d = true
	var ear := AudioListener2D.new()
	add_child(ear)
	ear.make_current()
	var strength := float(ProjectSettings.get_setting("audio/general/2d_panning_strength", 0.5))
	for i in DRY_VOICES:
		var p := AudioStreamPlayer2D.new()
		p.attenuation = 0.0
		p.max_distance = 1e7
		p.panning_strength = 1.0 / maxf(strength, 0.01)
		p.area_mask = 0
		p.finished.connect(_dry_done.bind(i))
		add_child(p)
		_dry.append(p)
		_dry_free.append(i)
	_counted.resize(DRY_VOICES)
	for i in PLAIN_VOICES:
		var p := AudioStreamPlayer.new()
		p.finished.connect(_plain_done.bind(i))
		add_child(p)
		_plain.append(p)
		_plain_free.append(i)
	for i in BED_BUS.size():
		var p := AudioStreamPlayer.new()
		p.bus = BED_BUS[i]
		p.pitch_scale = BED_RATE[i]
		add_child(p)
		_beds.append(p)
	_deep = AudioStreamPlayer.new()
	_deep.bus = &"Deep"
	add_child(_deep)
	for i in QUAY.size():
		var p := AudioStreamPlayer.new()
		p.bus = &"Bed"
		add_child(p)
		_quay.append(p)
	music = Music.new()
	music.name = "Music"
	add_child(music)
	_live = true
	_load_manifest()


## Leaving (the game closing): every voice still sounding is stopped and the
## mixer given a few of its passes to let go of them, or they are reported
## leaked at exit (a player leaving the tree only pauses its voice).
func _exit_tree() -> void:
	for p: Node in find_children("*", "AudioStreamPlayer", true, false) + find_children("*", "AudioStreamPlayer2D", true, false):
		p.stop()
	OS.delay_msec(100)


## The mix (see above), built once: a fresh voyage finds it in place.
static func build_buses() -> void:
	if AudioServer.get_bus_index(&"Mix") >= 0:
		return
	AudioServer.add_bus_effect(0, AudioEffectHardLimiter.new())
	_add_bus(&"UI", &"Master")
	var mix := _add_bus(&"Mix", &"Master")
	AudioServer.add_bus_effect(mix, AudioEffectAmplify.new())
	AudioServer.add_bus_effect(mix, _filter(AudioEffectLowPassFilter.new(), 22000.0, Q_AIR))
	AudioServer.set_bus_effect_enabled(mix, 1, false)
	# bus glue: the web's compressor (threshold -16 dB, knee 8, ratio 5, its own make-up) on Godot's curve
	var comp := AudioEffectCompressor.new()
	comp.threshold = -12.6
	comp.ratio = 1.624
	comp.gain = 6.0
	comp.attack_us = 4000.0
	comp.release_ms = 250.0
	AudioServer.add_bus_effect(mix, comp)
	_add_bus(&"SFX", &"Mix")
	for i in range(1, AIR.size()):
		AudioServer.add_bus_effect(_add_bus(AIR_BUS[i], &"SFX"), _filter(AudioEffectLowPassFilter.new(), AIR[i], Q_AIR))
	# the isles' echo: a few strong reflections off the shores, then the wash of the rest
	var echo := _add_bus(&"Echo", &"SFX")
	var dl := AudioEffectDelay.new()
	dl.dry = 1.0
	dl.tap1_delay_ms = 180.0
	dl.tap1_level_db = -3.0
	dl.tap1_pan = -0.3
	dl.tap2_delay_ms = 280.0
	dl.tap2_level_db = -6.0
	dl.tap2_pan = 0.3
	dl.feedback_active = true
	dl.feedback_delay_ms = 520.0
	dl.feedback_level_db = -9.0
	dl.feedback_lowpass = 2600.0
	AudioServer.add_bus_effect(echo, dl)
	var rv := AudioEffectReverb.new()
	rv.room_size = 0.75
	rv.damping = 0.45
	rv.predelay_msec = 20.0
	rv.predelay_feedback = 0.0
	rv.spread = 1.0
	rv.hipass = 0.0
	rv.dry = 0.0
	rv.wet = 1.0
	AudioServer.add_bus_effect(echo, rv)
	AudioServer.set_bus_volume_db(echo, ECHO_DB)
	for i in range(1, AIR.size()):
		AudioServer.add_bus_effect(_add_bus(ECHO_BUS[i], &"Echo"), _filter(AudioEffectLowPassFilter.new(), AIR[i], Q_AIR))
	_add_bus(&"Amb", &"Mix")
	_add_bus(&"Bed", &"Amb")
	AudioServer.add_bus_effect(_add_bus(&"Surf", &"Bed"), _filter(AudioEffectLowPassFilter.new(), 520.0, Q_DEFAULT))
	# (Godot doubles a band-pass's Q: the web's 0.6)
	AudioServer.add_bus_effect(_add_bus(&"Wind", &"Bed"), _filter(AudioEffectBandPassFilter.new(), 900.0, 0.3))
	var rain := _add_bus(&"Rain", &"Bed")
	AudioServer.add_bus_effect(rain, _filter(AudioEffectHighPassFilter.new(), 1400.0, Q_DEFAULT))
	AudioServer.add_bus_effect(rain, _filter(AudioEffectLowPassFilter.new(), 9000.0, Q_DEFAULT))
	AudioServer.add_bus_effect(_add_bus(&"Roar", &"Bed"), _filter(AudioEffectLowPassFilter.new(), 380.0, Q_DEFAULT))
	# the maelstrom: slow heavy noise under a breathing lowpass, panned to it;
	# and the throat's howl, a resonant band (Godot doubles a band-pass's Q: the web's 7)
	var vortex := _add_bus(&"Vortex", &"Amb")
	AudioServer.add_bus_effect(vortex, _filter(AudioEffectLowPassFilter.new(), 260.0, 0.9))
	AudioServer.add_bus_effect(vortex, AudioEffectPanner.new())
	AudioServer.add_bus_effect(_add_bus(&"Howl", &"Amb"), _filter(AudioEffectBandPassFilter.new(), 220.0, 3.5))
	_add_bus(&"Music", &"Mix")
	AudioServer.add_bus_effect(_add_bus(&"Deep", &"Mix"), _filter(AudioEffectLowPassFilter.new(), 160.0, Q_DEEP))


static func _add_bus(bus_name: StringName, send: StringName) -> int:
	AudioServer.add_bus()
	var i := AudioServer.bus_count - 1
	AudioServer.set_bus_name(i, bus_name)
	AudioServer.set_bus_send(i, send)
	return i


static func _filter(f: AudioEffectFilter, hz: float, q: float) -> AudioEffectFilter:
	f.cutoff_hz = hz
	f.resonance = q
	f.db = AudioEffectFilter.FILTER_6DB
	return f


## The levels the player set (the Settings autoload, handed in: this script
## compiles before the autoloads exist), squared so the sliders feel even.
func apply_settings(s: Node) -> void:
	set_volumes(s.master, s.music, s.sfx, s.ambience)
	set_muted(not s.sound)
	set_music_enabled(s.music_on)


func set_volumes(master: float, music_level: float, effects: float, ambience: float) -> void:
	_master = pow(clampf(master, 0.0, 1.0), 2.0)
	_music_vol = pow(clampf(music_level, 0.0, 1.0), 2.0)
	_effects = pow(clampf(effects, 0.0, 1.0), 2.0)
	_ambience = pow(clampf(ambience, 0.0, 1.0), 2.0)
	_levels()


## Sound off: nothing new is played, the band rests and the mix falls silent.
func set_muted(m: bool) -> void:
	_muted = m
	_levels()


## The music switch, apart from the sound's.
func set_music_enabled(on: bool) -> void:
	_music_on = on
	_levels()


func _levels() -> void:
	if not _live:
		return
	_amp.volume_db = _db(0.8 * _master)
	AudioServer.set_bus_volume_db(_bus[&"SFX"], _db(_effects))
	AudioServer.set_bus_volume_db(_bus[&"Amb"], _db(_ambience))
	AudioServer.set_bus_volume_db(_bus[&"Music"], _db(_music_vol))
	AudioServer.set_bus_mute(_bus[&"Mix"], _muted)
	AudioServer.set_bus_mute(_bus[&"Music"], not _music_on)
	music.paused = _muted or not _music_on


static func _db(v: float) -> float:
	return linear_to_db(maxf(v, 1e-6))


# ---------------------------------------------------------------- loading

func _load_manifest() -> void:
	var f := FileAccess.open(MANIFEST, FileAccess.READ)
	if f == null:
		push_warning("Sound: no %s (bake it with tools/audio/bake_audio.mjs)" % MANIFEST)
		return
	var m: Variant = JSON.parse_string(f.get_as_text())
	if not m is Dictionary:
		push_warning("Sound: %s doesn't parse" % MANIFEST)
		return
	var sfx: Dictionary = m.get("sfx", {})
	for key: String in sfx:
		var e: Dictionary = sfx[key]
		var gains: Array = e.gain
		_gains[key] = PackedFloat32Array(gains)
		var takes := []
		takes.resize(gains.size())
		_takes[key] = takes
		if e.get("stereo", false):
			_stereo[key] = true
		for i in gains.size():
			var path := "res://audio/sfx/%s_%d.%s" % [key, i, e.ext]
			if ResourceLoader.load_threaded_request(path) == OK:
				_loading[path] = [key, i]
	music.setup(m.get("music", {}))


## Takes arriving from the loader; the sea starts with its noise.
func _poll_loads() -> void:
	for path: String in _loading.keys():
		var st := ResourceLoader.load_threaded_get_status(path)
		if st == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			continue
		var e: Array = _loading[path]
		_loading.erase(path)
		if st != ResourceLoader.THREAD_LOAD_LOADED:
			push_warning("Sound: couldn't load " + path)
			continue
		var s: AudioStream = ResourceLoader.load_threaded_get(path)
		_takes[e[0]][e[1]] = s
		if e[0] == "noise":
			_noise = s
			_noise_gain = _gains["noise"][0]
			for i in BED_BUS.size():
				_beds[i].stream = s
				_beds[i].volume_db = _db(_bed[i] * _noise_gain)
				_beds[i].play(BED_START[i])
			_deep.stream = s


## Whether every sound has loaded.
func loaded() -> bool:
	return _live and _loading.is_empty()


## How many takes have loaded, of every sound.
func loaded_takes() -> int:
	var n := 0
	for key: String in _takes:
		for s: Variant in _takes[key]:
			n += 1 if s != null else 0
	return n


## A take of `key` that has loaded, at random; -1 if none has yet.
func _take(key: String) -> int:
	var takes: Array = _takes.get(key, [])
	if takes.is_empty():
		return -1
	var k := randi() % takes.size()
	if takes[k] != null:
		return k
	for j in takes.size():
		if takes[j] != null:
			return j
	return -1


# ---------------------------------------------------------------- the mix, frame by frame

func _process(dt: float) -> void:
	if not _live:
		return
	_now += dt
	if not _loading.is_empty():
		_poll_loads()
	_width = maxf(1.0, get_viewport().get_visible_rect().size.x)
	var i := 0
	while i < _cues.size():
		if _cues[i].at <= _now:
			_start(_cues[i])
			_cues.remove_at(i)
		else:
			i += 1
	if not _sweeps.is_empty():
		_sweep()
	_step_beds(dt)
	_step_under(dt)
	if _quay_on or _quay_off >= 0.0:
		_step_quay(dt)


## A cue's moment has come: a panned voice out on the water (and its echo),
## or the interface's, straight out.
func _start(c: _Cue) -> void:
	played += 1
	if c.ui:
		_plain_play(c.stream, &"UI", c.vol, c.pitch)
		return
	if _dry_free.is_empty():
		dropped += 1
		if c.counted:
			_voices -= 1
		return
	var i: int = _dry_free.pop_back()
	var p := _dry[i]
	p.stream = c.stream
	p.bus = AIR_BUS[c.air] if c.bus.is_empty() else c.bus
	p.pitch_scale = c.pitch
	_place(p, c.pan, c.stereo, c.vol)
	_counted[i] = 1 if c.counted else 0
	p.play()
	if not is_nan(c.pan_to):
		_sweeps.append([i, _now, c.stream.get_length() / c.pitch, c.pan, c.pan_to, c.vol, c.stereo])
	if c.wet > 0.0:
		_plain_play(c.stream, ECHO_BUS[c.air], c.wet, c.pitch)


func _plain_play(stream: AudioStream, bus: StringName, vol: float, pitch: float) -> void:
	if _plain_free.is_empty():
		return
	var p := _plain[_plain_free.pop_back()]
	p.stream = stream
	p.bus = bus
	p.pitch_scale = pitch
	p.volume_db = _db(vol)
	p.play()


func _dry_done(i: int) -> void:
	_dry_free.append(i)
	if _counted[i] != 0:
		_counted[i] = 0
		_voices -= 1
	for k in range(_sweeps.size() - 1, -1, -1):
		if _sweeps[k][0] == i:
			_sweeps.remove_at(k)


func _plain_done(i: int) -> void:
	_plain_free.append(i)


## Godot pans a 2D voice by where it stands across the screen from the
## listener, as a plain balance (left 1 - p, right p); the web pans a sound
## with an equal-power law, and a stereo one by folding its far side into the
## near one. So the voice stands where the balance gives the web's ratio of
## left to right, and plays louder by what the law adds: each ear hears the
## web's level.
func _place(p: AudioStreamPlayer2D, pan: float, stereo: bool, vol: float) -> void:
	var lr := pan_gains(pan, stereo)
	var s := lr.x + lr.y
	p.position = Vector2((2.0 * lr.y / s - 1.0) * _width, 0.0)
	p.volume_db = _db(vol * s)


## The web's pan law: the left and right levels of a sound panned `pan` (-1 .. 1).
static func pan_gains(pan: float, stereo: bool) -> Vector2:
	var x := clampf(pan, -1.0, 1.0)
	if not stereo:
		var th := (x + 1.0) * PI * 0.25
		return Vector2(cos(th), sin(th))
	# a stereo take: the far side folded into the near one (as energy, its two sides alike)
	if x <= 0.0:
		var a := (x + 1.0) * PI * 0.5
		return Vector2(sqrt(1.0 + cos(a) * cos(a)), sin(a))
	var b := x * PI * 0.5
	return Vector2(cos(b), sqrt(1.0 + sin(b) * sin(b)))


func _sweep() -> void:
	for k in range(_sweeps.size() - 1, -1, -1):
		var s: Array = _sweeps[k]
		var u := clampf((_now - float(s[1])) / maxf(float(s[2]), 1e-3), 0.0, 1.0)
		_place(_dry[s[0]], lerpf(s[3], s[4], u), s[6], s[5])
		if u >= 1.0:
			_sweeps.remove_at(k)


## The air bus for what the air leaves of a sound's highs (Hz).
static func air_bus(cutoff: float) -> int:
	for i in range(AIR.size() - 1):
		if cutoff >= sqrt(float(AIR[i]) * float(AIR[i + 1])):
			return i
	return AIR.size() - 1


## The sea and the wind round the listener, and the duck.
func _step_beds(dt: float) -> void:
	for i in BED_BUS.size():
		_bed[i] += (_bed_to[i] - _bed[i]) * (1.0 - exp(-dt / float(BED_TC[i])))
	if _noise != null:
		for i in BED_BUS.size():
			var g := _bed[i]
			if i == SURF:
				# the swell's slow breathing
				g += 0.09 * sin(TAU * 0.11 * _now)
			elif i == VORTEX:
				# the roar breathes on its own slow swell
				g *= 1.0 + 0.28 * sin(TAU * 0.23 * _now)
			var v := maxf(0.0, g) * _noise_gain
			var p := _beds[i]
			var off := v < 1e-4 or _muted
			if p.stream_paused != off:
				p.stream_paused = off
			var db := _db(v)
			if absf(db - _bed_db[i]) > 0.05:
				_bed_db[i] = db
				p.volume_db = db
		_wind_bp.cutoff_hz = 900.0 + 300.0 * sin(TAU * 0.07 * _now)
		if _bed[VORTEX] > 1e-4:
			_vortex_near += (_vortex_near_to - _vortex_near) * (1.0 - exp(-dt / 0.6))
			_vortex_lp.cutoff_hz = 260.0 + 90.0 * sin(TAU * 0.071 * _now)
			_howl_bp.cutoff_hz = 160.0 + _vortex_near * 260.0 + 40.0 * sin(TAU * 0.37 * _now)
			_vortex_pan.pan += (_vortex_pan_to - _vortex_pan.pan) * (1.0 - exp(-dt / 0.3))
	var duck := _db(AMBIENCE_LEVEL * duck_gain(_now))
	if absf(duck - _duck_db) > 0.02:
		_duck_db = duck
		AudioServer.set_bus_volume_db(_bus[&"Bed"], duck)


## Close, heavy sounds push the sea and the wind down for a moment (at `at`
## on the clock), holding wherever the last duck's recovery has got to.
func duck(at: float, depth: float) -> void:
	var g := duck_gain(_now)
	_duck_hold = g
	_duck_at = at
	_duck_low = minf(g, 1.0 - depth)


func duck_gain(t: float) -> float:
	if t < _duck_at:
		return _duck_hold
	var u := t - _duck_at
	if u < 0.02:
		return lerpf(_duck_hold, _duck_low, u / 0.02)
	if u < 0.12:
		return _duck_low
	return 1.0 - (1.0 - _duck_low) * exp(-(u - 0.12) / 0.8)


## The muffle closing in or opening up, and the drone under the waves.
func _step_under(dt: float) -> void:
	if _muffle_on or _muffle_to < OPEN:
		_muffle_hz += (_muffle_to - _muffle_hz) * (1.0 - exp(-dt / _muffle_tc))
		var on := _muffle_hz < OPEN
		if on != _muffle_on:
			_muffle_on = on
			AudioServer.set_bus_effect_enabled(_bus[&"Mix"], 1, on)
		if on:
			_muffle.cutoff_hz = _muffle_hz
	if not _deep.playing:
		return
	if _deep_on:
		_deep_g = minf(1.0, _deep_g + dt / 2.5)
	else:
		_deep_g *= exp(-dt / 0.12)
		_deep_off += dt
		if _deep_off > 0.6:
			_deep.stop()
			return
	_deep_lp.cutoff_hz = 160.0 + 60.0 * sin(TAU * 0.09 * _now)
	# (the web's drone joins after the master volume, which here is on its way)
	_deep.volume_db = _db(0.5 / 0.8 * _deep_g * _noise_gain)


# ---------------------------------------------------------------- playing

## A take of `key` played out in the world (the web's emit): late by the
## distance it carried, dulled by the air, part of it heard as echo. Returns
## when it will sound on the clock, or -1 if the mix had no room for it.
func _emit(key: String, vol: float, pan: float, dist: float, rate: float, wet: float, delay := 0.0, pan_to := NAN) -> float:
	if not _live or _muted or vol < 0.01:
		return -1.0
	# a crowded mix drops the faint and far first, and never grows past what a phone can mix
	if _voices >= MAX_VOICES or (_voices > CROWDED and vol < 0.4):
		dropped += 1
		return -1.0
	var k := _take(key)
	if k < 0:
		return -1.0
	var g: float = _gains[key][k]
	var c := _Cue.new()
	c.at = _now + minf(dist / SPEED_OF_SOUND, 1.1) + delay
	c.stream = _takes[key][k]
	c.vol = vol * g
	c.pitch = rate
	c.pan = pan
	c.pan_to = pan_to
	c.air = air_bus(maxf(900.0, 17000.0 * exp(-dist / 115.0)))
	var w := wet * pow(vol, 0.4)
	c.wet = w * g if w > 0.005 else 0.0
	c.counted = true
	_voices += 1
	_cues.append(c)
	return c.at


## Whether the live one-shots have room for one more (the web's voice()): a
## crowded moment lets the quiet ones go first.
func _voice(vol: float) -> bool:
	if not _live or _muted:
		return false
	_synth_load *= exp(-(_now - _synth_at) / 1.2)
	_synth_at = _now
	if _synth_load > SYNTH_BUDGET and vol < 0.3:
		dropped += 1
		return false
	_synth_load += 1.0
	return true


## One of the web's live one-shots from its take: `level` times the level it
## was rendered at, panned, at `at` on the clock (now, if 0), its echo sent at
## `wet` of its own level; the interface's straight out, and one with a `bus`
## of its own through that.
func _one(key: String, level: float, pan := 0.0, at := 0.0, pitch := 1.0, wet := 0.0, ui := false, bus := &"") -> void:
	var k := _take(key)
	if k < 0:
		return
	var g: float = _gains[key][k]
	var c := _Cue.new()
	c.at = maxf(at, _now)
	c.stream = _takes[key][k]
	c.vol = level * g
	c.pitch = pitch
	c.pan = pan
	c.wet = wet * level * g
	c.ui = ui
	c.bus = bus
	_cues.append(c)


## The listener's sea: the wind and the surf with her way through the water
## (0 .. 1), the gusts rolling over and the weather.
func set_sailing(speed01: float) -> void:
	_sailing = speed01
	_aim_beds()


func set_gust(g: float) -> void:
	_gust = g


func set_weather(rain: float, storm: float, wind: float) -> void:
	_rain = rain
	_storm = storm
	_wind = wind
	_aim_beds()


func _aim_beds() -> void:
	_bed_to[SURF] = 0.2 + _sailing * 0.12 + _storm * 0.14
	_bed_to[WIND] = 0.04 + _sailing * 0.08 + _gust * 0.06 + maxf(0.0, _wind - 0.8) * 0.2 + _storm * 0.07
	_bed_to[RAIN] = _rain * 0.13
	_bed_to[ROAR] = _rain * _rain * 0.12 + _storm * 0.1


## The maelstrom's voice, set every frame (the web's setMaelstrom): a deep
## rolling roar of water pouring round and down, and a hollow howl from the
## throat that climbs as you're drawn nearer (`near` 0..1). `vol` 0 stills it.
func set_maelstrom(vol: float, pan: float, near: float) -> void:
	_bed_to[VORTEX] = minf(1.0, vol) * 0.55 * 0.9
	_bed_to[HOWL] = near * near * 0.9 * minf(1.0, vol) * 0.55
	_vortex_pan_to = clampf(pan, -0.85, 0.85)
	_vortex_near_to = near


## Thunder from a strike `dist` metres off: it arrives late, and a far peal is
## dull and long. Its echo is the same however loud.
func thunder(vol: float, pan: float, dist: float) -> void:
	if not _live or _muted:
		return
	var near := dist < 700.0
	var key := "thunder_near" if near else "thunder_far"
	var k := _take(key)
	if k < 0:
		key = "thunder_far" if near else "thunder_near"
		k = _take(key)
		if k < 0:
			return
	peals += 1
	var g: float = _gains[key][k]
	var c := _Cue.new()
	c.at = _now + dist / SPEED_OF_SOUND
	c.stream = _takes[key][k]
	c.vol = vol * g
	c.pitch = (0.9 if near else 0.75) + randf() * 0.15
	c.pan = pan
	c.stereo = true
	c.air = air_bus(maxf(260.0, 9000.0 * exp(-dist / 260.0)))
	c.wet = 0.5 * g
	_cues.append(c)
	if near and vol > 0.5:
		duck(c.at, 0.3)


## One gun firing; `cal` 0 a light gun (a sloop's) .. 1 a heavy one (a galleon's).
func cannon(vol: float, pan: float, dist := 0.0, cal := 0.5) -> void:
	var at := _emit("cannon%d" % roundi(clampf(cal, 0.0, 1.0) * 2.0), vol * 0.62, pan, dist, 0.93 + randf() * 0.12, 0.55)
	if at < 0.0:
		return
	if dist < 30.0:
		# your own gun deck: carriages slamming back on their tackle
		_emit("recoil", vol * 0.3, pan * 0.6, dist, 0.9 + randf() * 0.2, 0.15, 0.02 + randf() * 0.04)
		duck(at, 0.5)
	elif vol > 0.45:
		duck(at, 0.25)


## Fireworks (the web's firework()): a rocket going up (or a whistling
## one), a shell breaking overhead (a showpiece's heavier charge), crackle,
## a willow's hanging hiss or a crossette's split. Bursts arrive late across
## the water like any far bang.
func firework(kind: StringName, vol: float, pan: float, dist := 0.0) -> void:
	match kind:
		&"launch":
			_emit("rocket", vol * 0.42, pan, dist, 0.9 + randf() * 0.25, 0.25)
		&"whistle":
			_emit("whistle", vol * 0.5, pan, dist, 0.92 + randf() * 0.16, 0.35)
		&"burst":
			var at := _emit("fw_boom", vol * 0.7, pan, dist, 0.85 + randf() * 0.3, 0.75)
			if at >= 0.0 and vol > 0.6:
				duck(at, 0.2)
		&"big":
			var at := _emit("fw_big", vol * 0.85, pan, dist, 0.9 + randf() * 0.1, 0.85)
			if at >= 0.0:
				duck(at, 0.35)
		&"crackle":
			_emit("fw_crackle", vol * 0.5, pan, dist, 0.9 + randf() * 0.2, 0.55)
		&"pop":
			_emit("fw_pop", vol * 0.55, pan, dist, 0.9 + randf() * 0.25, 0.5)
		&"sizzle":
			_emit("fw_sizzle", vol * 0.35, pan, dist, 0.9 + randf() * 0.2, 0.4)


## A ship's magazine going up.
func explosion(vol: float, pan: float, dist := 0.0) -> void:
	var at := _emit("blast", vol * 0.95, pan, dist, 0.92 + randf() * 0.1, 0.7)
	if at >= 0.0:
		duck(at, 0.7 if dist < 40.0 else 0.35)


## An enemy ball tearing past the listener, sweeping from one side to the
## other; `pitch` under 1 for heavier, slower shot.
func whoosh(vol: float, pan: float, pan_to: float, pitch := 1.0) -> void:
	_emit("whoosh", vol * 0.42, pan, 0.0, (0.85 + randf() * 0.3) * pitch, 0.1, 0.0, pan_to)


## An explosive shell bursting.
func shell(vol: float, pan: float, dist := 0.0) -> void:
	var at := _emit("shell", vol * 0.85, pan, dist, 0.94 + randf() * 0.12, 0.65)
	if at >= 0.0:
		duck(at, 0.45 if dist < 40.0 else 0.2)


## Fire shot catching on a hull.
func ignite(vol: float, pan: float, dist := 0.0) -> void:
	_emit("ignite", vol * 0.7, pan, dist, 0.9 + randf() * 0.2, 0.35)


## Hot iron hissing into the sea.
func sizzle(vol: float, pan: float, dist := 0.0) -> void:
	_emit("steam", vol * 0.38, pan, dist, 0.85 + randf() * 0.3, 0.25)


## Grape shot raking a deck.
func grape(vol: float, pan: float, dist := 0.0) -> void:
	_emit("grape", vol * 0.75, pan, dist, 0.9 + randf() * 0.2, 0.35)


## Chain shot tearing through rigging.
func chain(vol: float, pan: float, dist := 0.0) -> void:
	_emit("chain", vol * 0.7, pan, dist, 0.9 + randf() * 0.2, 0.35)


## A ship burning: the roar and crackle of flames on her deck.
func flames(vol: float, pan: float, dist := 0.0) -> void:
	_emit("flames", vol * 0.32, pan, dist, 0.85 + randf() * 0.3, 0.3)


func splash(vol: float, pan: float, dist := 0.0) -> void:
	_emit("water", vol * 0.5, pan, dist, 0.85 + randf() * 0.3, 0.3)


## A ball (or a falling spar) striking timber.
func hit(vol: float, pan: float, dist := 0.0) -> void:
	_emit("wood", vol * 0.8, pan, dist, 0.8 + randf() * 0.14, 0.45)


## Hulls colliding or a keel grinding onto rock; `force` 0 a nudge .. 1 a full-speed ram.
func crunch(vol: float, pan: float, dist := 0.0, force := 1.0) -> void:
	var f := clampf(force, 0.0, 1.0)
	var at := _emit("crunch", vol * (0.35 + 0.55 * f), pan, dist, 1.12 - f * 0.22 + randf() * 0.08, 0.45)
	if at >= 0.0 and dist < 40.0 and f > 0.4:
		duck(at, 0.3 * f)


## A keel grinding over coral: splintering timber under a long dry rasp of
## coral on planking, juddering as she lurches over each head; `strike` the
## first blow, run onto the reef at speed.
func scrape(vol: float, pan: float, dist := 0.0, k := 1.0, strike := false) -> void:
	_emit("crunch", vol * (0.75 if strike else 0.22 + 0.3 * k), pan, dist, (0.78 if strike else 0.6) + randf() * 0.12, 0.35)
	if strike:
		_emit("wood", vol * 0.6, pan, dist, 0.62 + randf() * 0.1, 0.4, 0.06)
	# the rasp and the groan of timber: rendered light and hard, the nearer take scaled to it
	var v := vol * minf(1.0, 140.0 / (140.0 + dist)) * (0.35 + 0.4 * k)
	if not _voice(v):
		return
	var hard := k > 0.7
	_one("scrape1" if hard else "scrape0", v / (0.35 + 0.4 * (1.0 if hard else 0.4)), pan, _now + minf(dist / SPEED_OF_SOUND, 1.1))


## Shot striking the ground.
func thud(vol: float, pan: float, dist := 0.0) -> void:
	_emit("earth", vol * 0.45, pan, dist, 0.85 + randf() * 0.3, 0.3)


## Ashore, a footfall (`k` the pace: 0.3 a stroll .. 1 a run): a crunch of
## dry sand, a slosh in the shallows, or a knock on planks and stone.
func step(k: float, wet: bool, hard: bool) -> void:
	var v := 0.11 + k * 0.08 if hard else (0.12 if wet else 0.08) + k * 0.06
	if not _voice(v):
		return
	# (each take was rendered at the walk's middle pace)
	var key := "foot_step" if hard else ("wet_step" if wet else "sand_step")
	_one(key, v / (0.11 if key == "sand_step" else 0.15), (randf() - 0.5) * 0.2, 0.0, 0.92 + randf() * 0.16)


## A jump: the push-off and a breath going out (up), or coming down (`k` how
## hard, 0..1): a thump through the legs and the ground answering.
func hop(up: bool, k: float, wet: bool, hard: bool) -> void:
	var v := 0.12 if up else 0.2 + k * 0.14
	if not _voice(v):
		return
	if up:
		_one("hop_up", 1.0, (randf() - 0.5) * 0.12, 0.0, 0.95 + randf() * 0.1)
		return
	var key := "hop_hard" if hard else ("hop_wet" if wet else "hop_sand")
	_one(key, v / 0.284, (randf() - 0.5) * 0.12, 0.0, 0.94 + randf() * 0.12)


## Steel on steel: a bright ring of a blade's partials and a hiss of edge.
func clash(vol: float, pan: float, dist := 0.0) -> void:
	var v := minf(0.5, vol * 0.42) * exp(-dist / 160.0)
	if _voice(v):
		_one("clash", v / 0.42, pan, 0.0, 0.94 + randf() * 0.12)


## A blade cutting the air.
func swish(vol: float, pan: float) -> void:
	var v := vol * 0.2
	if v >= 0.01 and _voice(v):
		_one("swish", v / 0.2, pan, 0.0, 0.9 + randf() * 0.2)


## A blow landing on someone: a dull thwack and the breath knocked out of them.
func thwack(vol: float, pan: float, dist := 0.0, heavy := false) -> void:
	var v := minf(0.6, vol * (0.55 if heavy else 0.4)) * exp(-dist / 140.0)
	if _voice(v):
		_one("thwack_heavy" if heavy else "thwack", v / (0.55 if heavy else 0.4), pan, 0.0, 0.92 + randf() * 0.16)


## A flintlock: the pan's hiss, then a sharp crack and its echo off the hills.
func pistol(vol: float, pan: float, dist := 0.0) -> void:
	var v := minf(0.75, vol * 0.7) * exp(-dist / 260.0)
	if _voice(v):
		_one("pistol", v / 0.7, pan, 0.0, 0.96 + randf() * 0.08, 1.0)


## A war cry out of a cutthroat camp, `n` voices raised together.
func war_cry(vol: float, pan: float, dist := 0.0, n := 3) -> void:
	var v := minf(0.4, vol * 0.3) * exp(-dist / 200.0)
	if _voice(v):
		_one("war_cry%d" % (5 if n > 3 else 3), v / 0.3, pan, 0.0, 0.95 + randf() * 0.1, 1.0)


## A gold doubloon flipped onto the counter: a heavy, warm chink and its bounces.
func coin(delay := 0.0, vol := 0.5) -> void:
	_emit("coin", vol, (randf() - 0.5) * 0.3, 0.0, 0.93 + randf() * 0.14, 0.18, delay)


## Gold counted out onto the table, one piece after another; returns when
## the last lands (s from now).
func _count_out(n: int, delay := 0.0, vol := 0.42) -> float:
	var t := delay
	for i in n:
		coin(t, vol * (0.8 + randf() * 0.3))
		t += 0.1 + randf() * 0.07
	return t


## A tap on the merchant's oak counter: the market's buttons.
func knock() -> void:
	if _emit("mallet", 0.13, 0.0, 0.0, 1.5 + randf() * 0.25, 0.05) < 0.0:
		click()


## A sale. A few pieces are counted out by hand; a fair sum lands as a purse
## thumped on the counter and poured out; a fortune (or a rare lot, `best`
## its rarity) gets a second purse, a squeezebox flourish and the whole quay
## roaring.
func sale(value: int, best := 0) -> void:
	if value < 120:
		var end := _count_out(3 + mini(3, floori(value / 30.0)))
		_emit("pour0", 0.28, 0.0, 0.0, 1.1, 0.15, end - 0.05)
		return
	var big := value >= 600
	_emit("purse", 0.62, -0.1, 0.0, 0.95 + randf() * 0.1, 0.2)
	_emit("pour1" if big else "pour0", 0.55 if big else 0.45, 0.05, 0.0, 0.96 + randf() * 0.08, 0.22, 0.16)
	if big:
		_emit("purse", 0.5, 0.15, 0.0, 0.88, 0.2, 0.55)
	coin(1.6 if big else 0.85, 0.4)
	if value >= 1500 or best >= 3:
		_squeezebox("squeeze_flourish", 0.25)
		cheer(0.9, 0.2, 25.0, 6)


## Paying the chandler (`kind` &"repair" or &"shot"): gold counted out, then
## the yard gets to work, mallets on her planking or shot set down in the racks.
func purchase(kind: StringName) -> void:
	var repair := kind == &"repair"
	var end := _count_out(4 if repair else 3)
	for i in 3:
		var d := end + 0.15 + i * (0.32 if repair else 0.26) + randf() * 0.05
		if repair:
			_emit("mallet", 0.32 - i * 0.05, 0.35, 14.0, 0.9 + randf() * 0.15, 0.35, d)
		else:
			_emit("clunk", 0.4 - i * 0.06, -0.3, 10.0, 0.92 + randf() * 0.12, 0.3, d)


## The harbour bell on the quay: a bronze strike with inharmonic partials, rung `n` times.
func bell(n := 2, vol := 0.22) -> void:
	if not _voice(vol):
		return
	for k in n:
		_one("bell", vol, 0.0, _now + k * 0.62)


## The squeezebox on the quay (the take of its tune: the hornpipe for coming
## alongside, the flourish for a fortune), `delay` s from now, and its echo.
func _squeezebox(key: String, vol: float, delay := 0.0) -> void:
	if _voice(vol):
		_one(key, 1.0, 0.0, _now + delay, 1.0, 1.0)


## Voices raised together: the quay's cheer, `n` of them (4 or 6), `dist` m off.
func cheer(vol: float, pan: float, dist := 0.0, n := 6) -> void:
	var v := minf(0.4, vol * 0.3) * exp(-dist / 200.0)
	if _voice(v):
		# (each was rendered as the web raises one at full voice)
		_one("cheer%d" % (6 if n > 4 else 4), v / 0.3, pan, 0.0, 1.0, 1.0)


## The bosun's call: a shrill pipe swooping up, trilling and falling away: "all hands, cast off!".
func bosun_pipe() -> void:
	if _voice(0.09):
		_one("bosun_pipe", 1.0, 0.0, 0.0, 1.0, 1.0)


## A herring gull calling: a nasal, raspy "kyow" that leaps up then falls
## away; two or three in a row (`notes`) make the laughing call. It sounds
## with the sea, on the ambience.
func gull(vol: float, pan: float, notes := 1, delay := 0.0) -> void:
	if not _live or _muted or vol < 0.01:
		return
	_one("gull%d" % clampi(notes, 1, 3), minf(1.0, vol), pan, _now + delay, 1.0, 0.0, false, &"Amb")


## Coming alongside: the hull nudges the fenders, the lines creak taut and
## somebody on the quay strikes up a tune; the quay comes to life round her.
func port_arrive() -> void:
	_emit("mallet", 0.5, 0.2, 6.0, 0.42, 0.35)
	_emit("earth", 0.2, 0.2, 6.0, 0.7, 0.3, 0.03)
	_emit("creak0", 0.3, -0.4, 8.0, 0.95, 0.3, 0.35)
	_emit("creak1", 0.24, 0.45, 10.0, 1.05, 0.3, 0.9)
	_squeezebox("squeeze_arrival", 0.13, 0.9)
	quay(true)


## Casting off: the bosun pipes, the lines come in, the timbers ease and the quay cheers her away.
func port_depart() -> void:
	bosun_pipe()
	_emit("creak2", 0.3, 0.3, 8.0, 0.9, 0.35, 0.5)
	_emit("creak0", 0.22, -0.3, 8.0, 1.1, 0.3, 1.1)
	cheer(0.6, 0.0, 15.0, 4)


## The quay's own soundscape while she's tied up: water slapping among the
## pilings, the hubbub, lines creaking, gulls, the yard at work; off, it dies away.
func quay(on: bool) -> void:
	if not _live or on == _quay_on:
		return
	_quay_on = on
	if on:
		# (back before it had died away, it swells again from where it got to)
		_quay_off = -1.0
		_quay_tick = 0.0
	else:
		_quay_off = 0.0


func _step_quay(dt: float) -> void:
	if _quay_on:
		_quay_g = minf(1.0, _quay_g + dt / 2.5)
		_quay_tick += dt
		if _quay_tick >= QUAY_TICK:
			_quay_tick -= QUAY_TICK
			if not _muted:
				_quay_life()
	else:
		_quay_g *= exp(-dt / 0.5)
		_quay_off += dt
		if _quay_off > 3.0:
			_quay_off = -1.0
			_quay_g = 0.0
			for p in _quay:
				p.stop()
			return
	for i in QUAY.size():
		var p := _quay[i]
		if not p.playing:
			if not _quay_on:
				continue
			# each loop joins once it has loaded, somewhere along it
			var k := _take(QUAY[i])
			if k < 0:
				continue
			p.stream = _takes[QUAY[i]][k]
			_quay_gain[i] = _gains[QUAY[i]][k]
			p.volume_db = _db(0.0)
			p.play(randf() * p.stream.get_length())
		p.volume_db = _db(float(QUAY_LEVEL[i]) * _quay_g * _quay_gain[i])


## A moment on the quay: a line creaking, a gull, a shipwright across the
## yard hard at a plank, a cask of shot set down, a coin.
func _quay_life() -> void:
	var r := randf()
	if r < 0.14:
		_emit("creak%d" % (randi() % 3), 0.1 + randf() * 0.1, _side(), 15.0 + randf() * 30.0, 0.85 + randf() * 0.3, 0.4)
	elif r < 0.2:
		gull(0.35 + randf() * 0.3, _side(), 1 + randi() % 3)
	elif r < 0.24:
		var pan := _side()
		for i in 3 + randi() % 4:
			_emit("mallet", 0.07, pan, 70.0, 0.95 + randf() * 0.1, 0.6, i * 0.38)
	elif r < 0.26:
		_emit("clunk", 0.08, _side(), 40.0, 0.8, 0.5)
	elif r < 0.28:
		coin(0.0, 0.08)


## Off to one side of the quay or the other, at random.
static func _side() -> float:
	return (-1.0 if randf() < 0.5 else 1.0) * (0.3 + randf() * 0.6)


## Something gained: an isle charted, home waters reached.
func chime() -> void:
	if _voice(0.25):
		_one("chime", 1.0)


## A chest hauled aboard: a clink and a rising run of notes that grows with its rarity (0 .. 4).
func treasure(tier: int) -> void:
	coin()
	var t := clampi(tier, 0, 4)
	if t > 0 and _voice(0.14 + t * 0.04):
		_one("treasure%d" % t, 1.0)


## A side's guns are run out again: a knock from that side's gun deck.
func guns_ready(pan: float) -> void:
	if _voice(0.2):
		_one("guns_ready", 1.0, pan)


## A kind of shot loaded (Ammo order): the ball's knock, lower for heavier loads.
func ammo_swap(kind: int) -> void:
	if _voice(0.22):
		_one("ammo%d" % clampi(kind, 0, 5), 1.0)


## The Treasure Vault's chest trembling as its light climbs to a rarity (0 .. 3).
func vault_rumble(level: int) -> void:
	var l := clampi(level, 0, 3)
	if _voice(0.22 + l * 0.05):
		_one("vault_rumble%d" % l, 1.0)


## Its lid bursting open on the best find (0 .. 3): a rushing sweep, and the treasure's run.
func vault_burst(tier: int) -> void:
	if _voice(0.3):
		_one("vault_burst", 1.0)
	treasure(mini(4, tier + 1))


## A card turning over, ringing out for the rarer finds.
func card_flip(tier: int) -> void:
	if _voice(0.16):
		_one("card_flip", 1.0)
	if tier >= 1:
		treasure(tier + 1)


## The interface's tap.
func click() -> void:
	if _voice(0.12):
		_one("click", 1.0)


## She's going down: the blow, a deep rumble and her timbers giving way.
func founder() -> void:
	if _voice(0.9):
		_one("founder", 1.0, 0.0, 0.0, 1.0, 1.0)


## The leadsman's warning (the web's shoalBell): two quick strokes of the
## ship's bell, then a third, high and bright (shoal water ahead).
func shoal_bell() -> void:
	if not _voice(0.2):
		return
	for k in 3:
		_one("bell", 0.2 * (0.84 if k == 2 else 1.0), 0.0, _now + [0.0, 0.2, 0.62][k], 1.9)


## The final plunge: timbers groaning under the strain as she goes by the stern.
func groan() -> void:
	if _voice(0.5):
		_one("groan", 1.0, 0.0, 0.0, 1.0, 1.0)


## A pocket of air bursting out of a sunken hull (`size` about 0.3 .. 1.6):
## a deep, round glug or two and a fizz of small bubbles.
func air_pocket(size: float, vol: float, pan: float) -> void:
	if not _voice(0.32 * vol * minf(1.4, size)):
		return
	var i := 0 if size < 0.775 else (1 if size < 1.225 else 2)
	var s: float = AIR_SIZES[i]
	# the take's level grew with its size, and its glugs fall in pitch as one over its root
	_one("air%d" % i, vol * minf(1.4, size) / minf(1.4, s), pan, 0.0, sqrt(s / maxf(size, 0.3)))


## Beneath the waves: the whole mix closes in to a muffled murmur over a deep,
## slowly breathing drone, with bubbles rising past; or back up.
func submerge(on: bool) -> void:
	if not _live:
		return
	_muffle_to = 360.0 if on else 22000.0
	_muffle_tc = 0.45 if on else 0.15
	if on and not _deep_on:
		_deep_on = true
		_deep_off = -1.0
		if _deep.stream != null:
			if not _deep.playing:
				_deep_g = 0.0
				_deep.volume_db = _db(0.0)
				_deep.play(randf() * 3.0)
		if _voice(0.16):
			_one("bubbles", 1.0, 0.0, _now + 0.18)
	elif not on and _deep_on:
		_deep_on = false
		_deep_off = 0.0


## A tally tile landing on the farewell card (the sixth, her renown); brighter for a new record.
func tally(i: int, best := false) -> void:
	if not _live or _muted:
		return
	_one(("tally_best%d" if best else "tally%d") % (i % 6), 1.0, 0.0, 0.0, 1.0, 0.0, true)


## The band for fair sailing among the islands (`night` 0 day .. 1 night
## leans which song comes next); it rests for grander music, a storm, or with
## the sound or the music off.
func voyage_music(on: bool, night: float) -> void:
	if _live:
		music.want(on and _music_on and not _muted, night)


## The high seas' theme, out on the open ocean (it fades either way).
func high_seas(on: bool) -> void:
	if _live:
		music.high_seas(on)


## The harbour's theme, while you choose your ship (it fades either way).
func harbour(on: bool) -> void:
	if _live:
		music.harbour(on)


## What the mix is doing, for the smoke test.
func stats() -> String:
	return "%d takes of %d sounds loaded, %d played (%d dropped), %d voices out, %d peals of thunder, the sea %s%s; %s" % [
			loaded_takes(), _takes.size(), played, dropped, _voices, peals, "rolling" if _noise != null and _beds[SURF].playing else "silent",
			", the quay astir" if _quay_on and _quay[0].playing else "", music.state()]
