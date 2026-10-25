class_name Music
extends Node
## The music at sea, as on the web: the voyage band's songs for fair sailing
## among the islands (src/core/voyageMusic.ts), one after another with the
## sea's own sound between them, every one before any repeats and leaning
## toward those that suit the hour; and out on the open ocean the high seas'
## own theme, looping; and in the harbour, its own theme. The band rests for
## grander music (the harbour, the high seas, a storm, her farewell). The
## tracks are the web's, rendered into
## res://audio/music (tools/audio/bake_audio.mjs): every song in the
## manifest is in the rotation, so a new one drops straight in with its
## entry in sounds.json (its title, how well it suits the day and the night,
## and when its last note is done). Each is loaded off the main thread just
## before it plays.

const BAND_VOL := 0.55
const SEA_VOL := 0.95
const DIR := "res://audio/music/"
## Seconds of the sea's own sound between one song and the next, at least and at most.
const GAP := Vector2(22.0, 50.0)
## A song the band is no longer wanted for fades over this long (s); the
## high seas' theme comes in over FADE_IN and dies away with SEA_TC.
const FADE := 3.5
const FADE_IN := 6.0
const SEA_TC := 1.6
## The harbour's theme fades in as the harbour comes up and away like a ship
## leaving the quay (s).
const PORT_IN := 1.6
const PORT_OUT := 2.4

## The rotation: {name, title, day, night, end, gain} for each song.
var songs: Array[Dictionary] = []
## The sound or the music is off: the open sea's theme holds where it is.
var paused := false:
	set(v):
		paused = v
		if _sea != null:
			_sea.stream_paused = v
			_port.stream_paused = v
			for b in _boss:
				b.stream_paused = v

var _theme := {}
var _now := 0.0
var _wanted := false
var _night := 0.0
var _next_at := 0.0
var _last := -1
var _bag: Array[int] = []
## The song picked next, loading, else -1.
var _queued := -1
## Two decks, so a song still ringing out never cuts the next one short:
## what each plays, how far it has faded, and whether it is fading out.
var _decks: Array[AudioStreamPlayer] = []
var _deck_song := PackedInt32Array([-1, -1])
var _deck_fade := PackedFloat32Array([1.0, 1.0])
var _deck_out := [false, false]
## The deck with the song in the rotation (until its last note), else -1.
var _cur := -1
var _end := 0.0
var _sea: AudioStreamPlayer
var _sea_on := false
var _sea_g := 0.0
var _sea_off := 0.0
var _sea_loading := false
var _harbour := {}
var _port: AudioStreamPlayer
var _port_on := false
var _port_g := 0.0
var _port_loading := false
## The Kraken's battle music (the web's krakenMusic): the drone, the tremolo
## strings and the war drums, each a loop baked from the web's live voices.
var _boss: Array[AudioStreamPlayer] = []
## Each part's level as baked: drone, strings, then the drums of each stage.
var _boss_gain := PackedFloat32Array([1.0, 1.0, 1.0])
var _boss_on := false
var _boss_g := 0.0
var _boss_stage := 0
var _boss_strings := 1.0
var _boss_off := 0.0


func _ready() -> void:
	for d in 2:
		var p := AudioStreamPlayer.new()
		p.bus = &"Music"
		p.finished.connect(_release.bind(d))
		add_child(p)
		_decks.append(p)
	_sea = AudioStreamPlayer.new()
	_sea.bus = &"Music"
	add_child(_sea)
	_port = AudioStreamPlayer.new()
	_port.bus = &"Music"
	add_child(_port)
	for i in 3:
		var b := AudioStreamPlayer.new()
		b.bus = &"Music"
		add_child(b)
		_boss.append(b)


## The tracks in the manifest (sounds.json's "music"): the songs, the
## harbour's theme (marked "harbour") and the high seas' (the other one
## marked to loop).
func setup(meta: Dictionary) -> void:
	songs.clear()
	var names := meta.keys()
	names.sort()
	for n: String in names:
		var e: Dictionary = meta[n]
		if e.get("harbour", false):
			_harbour = e.merged({"name": n})
			continue
		if e.get("loop", false):
			_theme = e.merged({"name": n})
			continue
		songs.append({"name": n, "title": str(e.get("title", n)), "day": float(e.get("day", 1.0)), "night": float(e.get("night", 1.0)),
				"end": float(e.get("end", e.get("seconds", 60.0))), "gain": float(e.get("gain", 1.0))})


## Whether the band should play (nothing grander sounding), and how dark it is (0 day .. 1 night).
func want(on: bool, night: float) -> void:
	_night = night
	if on == _wanted:
		return
	_wanted = on
	if on:
		# back from a storm or the open sea: a breath of quiet, then a new song
		_next_at = maxf(_next_at, _now + (5.0 if _last < 0 else randf_range(4.0, 8.0)))
	elif _cur >= 0:
		_deck_out[_cur] = true
		_cur = -1


## The next song: every one before any repeats, leaning toward those that suit the hour.
func pick() -> int:
	if songs.is_empty():
		return -1
	if _bag.is_empty():
		for k in songs.size():
			if k != _last or songs.size() == 1:
				_bag.append(k)
	var w := PackedFloat32Array()
	var sum := 0.0
	for k in _bag:
		var s := songs[k]
		var x: float = 0.15 + s.day * (1.0 - _night) + s.night * _night
		w.append(x)
		sum += x
	var r := randf() * sum
	var j := 0
	while j < w.size() - 1:
		r -= w[j]
		if r <= 0.0:
			break
		j += 1
	var k := _bag[j]
	_bag.remove_at(j)
	_last = k
	return k


func _path(k: int) -> String:
	return DIR + str(songs[k].name) + ".ogg"


func _process(dt: float) -> void:
	_now += dt
	for d in 2:
		if _deck_song[d] < 0:
			continue
		if _deck_out[d]:
			_deck_fade[d] -= dt / FADE
			if _deck_fade[d] <= 0.0:
				_release(d)
				continue
		_level(d)
	if _cur >= 0 and _now > _end:
		# her last note done (it rings on): the sea has its turn between songs
		_cur = -1
		_next_at = _now + randf_range(GAP.x, GAP.y)
	if _wanted and _cur < 0 and not songs.is_empty():
		# loaded off the main thread a few seconds ahead
		if _queued < 0 and _now >= _next_at - 4.0:
			_queued = pick()
			if ResourceLoader.load_threaded_request(_path(_queued)) != OK:
				_queued = -1
				_next_at = _now + 30.0
		if _queued >= 0 and _now >= _next_at:
			var path := _path(_queued)
			match ResourceLoader.load_threaded_get_status(path):
				ResourceLoader.THREAD_LOAD_LOADED:
					_play(_queued, ResourceLoader.load_threaded_get(path))
					_queued = -1
				ResourceLoader.THREAD_LOAD_IN_PROGRESS:
					pass
				_:
					push_warning("Music: couldn't load " + path)
					_queued = -1
					_next_at = _now + 30.0
	_step_sea(dt)
	_step_port(dt)
	if _boss_on or _boss[0].playing:
		_step_boss(dt)


func _play(k: int, stream: AudioStream) -> void:
	var d := 0 if _deck_song[0] < 0 else 1
	if _deck_song[d] >= 0:
		_release(d)
	var p := _decks[d]
	p.stream = stream
	_deck_song[d] = k
	_deck_fade[d] = 1.0
	_deck_out[d] = false
	_level(d)
	p.play()
	_cur = d
	_end = _now + float(songs[k].end)


func _level(d: int) -> void:
	_decks[d].volume_db = linear_to_db(maxf(BAND_VOL * float(songs[_deck_song[d]].gain) * _deck_fade[d], 1e-6))


func _release(d: int) -> void:
	_decks[d].stop()
	_decks[d].stream = null
	_deck_song[d] = -1
	_deck_out[d] = false
	if _cur == d:
		_cur = -1
		_next_at = _now + randf_range(GAP.x, GAP.y)


## The high seas' theme on or off.
func high_seas(on: bool) -> void:
	if on == _sea_on or _theme.is_empty():
		return
	_sea_on = on
	_sea_off = 0.0
	if on and _sea.stream == null and not _sea_loading:
		_sea_loading = ResourceLoader.load_threaded_request(DIR + str(_theme.name) + ".ogg") == OK


func _step_sea(dt: float) -> void:
	if _sea_loading:
		var path := DIR + str(_theme.name) + ".ogg"
		var st := ResourceLoader.load_threaded_get_status(path)
		if st != ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			_sea_loading = false
			if st == ResourceLoader.THREAD_LOAD_LOADED:
				_sea.stream = ResourceLoader.load_threaded_get(path)
	if _sea_on:
		if _sea.stream == null:
			return
		if not _sea.playing:
			_sea_g = 0.0
			_sea.play()
			_sea.stream_paused = paused
		_sea_g = minf(1.0, _sea_g + dt / FADE_IN)
	elif _sea.playing:
		_sea_g *= exp(-dt / SEA_TC)
		_sea_off += dt
		if _sea_off > 9.0:
			_sea.stop()
			_sea_g = 0.0
			return
	else:
		return
	_sea.volume_db = linear_to_db(maxf(SEA_VOL * float(_theme.gain) * _sea_g, 1e-6))


## The harbour's theme on or off: from the top each time you come back to
## port (unless it hadn't quite died away yet).
func harbour(on: bool) -> void:
	if on == _port_on or _harbour.is_empty():
		return
	_port_on = on
	if on and _port.stream == null and not _port_loading:
		_port_loading = ResourceLoader.load_threaded_request(DIR + str(_harbour.name) + ".ogg") == OK


func _step_port(dt: float) -> void:
	if _port_loading:
		var path := DIR + str(_harbour.name) + ".ogg"
		var st := ResourceLoader.load_threaded_get_status(path)
		if st != ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			_port_loading = false
			if st == ResourceLoader.THREAD_LOAD_LOADED:
				_port.stream = ResourceLoader.load_threaded_get(path)
	if _port_on:
		if _port.stream == null:
			return
		if not _port.playing:
			_port_g = 0.0
			_port.play()
			_port.stream_paused = paused
		_port_g = minf(1.0, _port_g + dt / PORT_IN)
	elif _port.playing:
		_port_g -= dt / PORT_OUT
		if _port_g <= 0.0:
			_port.stop()
			_port_g = 0.0
			return
	else:
		return
	_port.volume_db = linear_to_db(maxf(float(_harbour.gain) * _port_g, 1e-6))


## The Kraken's music on (in over 2.5 s), raised to `stage` (0..2: the
## strings swell and the drums thicken), or off (dying away over a few
## seconds). `parts` are [stream, gain] for the drone, the strings and the
## drums of each stage, looping.
func boss(on: bool, stage: int, parts: Array) -> void:
	_boss_stage = clampi(stage, 0, 2)
	if on and not _boss_on:
		if parts.size() < 5 or parts.any(func(e: Array) -> bool: return e[0] == null):
			return
		_boss_on = true
		_boss_g = 0.0
		_boss_off = 0.0
		_boss_strings = 1.0 + _boss_stage
		for i in 2:
			var st: AudioStream = parts[i][0]
			_loop(st)
			_boss[i].stream = st
			_boss_gain[i] = parts[i][1]
			_boss[i].play()
		_drums(parts)
		_boss[2].play()
		for b in _boss:
			b.stream_paused = paused
	elif on:
		_drums(parts)
	elif _boss_on:
		_boss_on = false
		_boss_off = 0.0


func _drums(parts: Array) -> void:
	var e: Array = parts[2 + _boss_stage]
	var st: AudioStream = e[0]
	_boss_gain[2] = e[1]
	if _boss[2].stream == st:
		return
	_loop(st)
	# the next stage's drums take up the bar where the last left off
	var at := _boss[2].get_playback_position() if _boss[2].playing else 0.0
	_boss[2].stream = st
	if _boss_on and _boss[0].playing:
		_boss[2].play(at)


static func _loop(st: AudioStream) -> void:
	if st is AudioStreamOggVorbis:
		(st as AudioStreamOggVorbis).loop = true


func _step_boss(dt: float) -> void:
	if _boss_on:
		_boss_g = minf(1.0, _boss_g + dt / 2.5)
	else:
		_boss_g *= exp(-dt / 0.9)
		_boss_off += dt
		if _boss_off > 4.0:
			for b in _boss:
				b.stop()
				b.stream = null
			_boss_g = 0.0
			return
	_boss_strings += ((1.0 + _boss_stage) - _boss_strings) * MathX.damp(1.0 / 1.5, dt)
	# the web plays it on its own bus at the music's level and a quarter more
	var lv := 1.25 * _boss_g
	_boss[0].volume_db = linear_to_db(maxf(lv * _boss_gain[0], 1e-6))
	_boss[1].volume_db = linear_to_db(maxf(lv * _boss_gain[1] * _boss_strings, 1e-6))
	_boss[2].volume_db = linear_to_db(maxf(lv * _boss_gain[2], 1e-6))


## What is playing, for the smoke test.
func state() -> String:
	if _boss_on:
		return "the Kraken's music at stage %d" % _boss_stage
	if _port.playing and _port_on:
		return "the harbour's theme playing"
	if _port_on:
		return "the harbour's theme loading"
	if _sea.playing and _sea_on:
		return "the high seas' theme playing"
	if _cur >= 0:
		return "the band playing %s" % songs[_deck_song[_cur]].title
	if _wanted:
		return "the band waiting %.0f s for its next song" % maxf(0.0, _next_at - _now)
	return "the band resting"
