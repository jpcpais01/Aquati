class_name RareSkies
extends Node3D
## The rare skies that live somewhere rather than everywhere (the web game's
## game/rareSkies.ts): the ash a restless volcano throws downwind (ember
## rain), and the mirages a scorching noon conjures ahead of the ship. The
## atmosphere owns how they look; this decides where and when, smokes the
## crater, and tells the crew. (The sea-spark blooms' own toast is the game's.)

## A word for the crew (a kicker, a line, how long it stays up).
signal toast(kicker: String, title: String, life: float)
## A low rumble from the mountain (0..1, its distance in m).
signal rumble(vol: float, dist: float)
## A mirage shimmering up, or fraying round the hull.
signal shimmer

## How far downwind a plume carries its ash (m).
const PLUME_REACH := 1300.0

var embers: Embers
var mirage: Mirage
## 0 .. 1 how restless the volcanoes are: smoke and ash pouring from the craters.
var restless := 0.0
## The volcanoes: [name, x, z, r].
var volcanoes: Array = []
## Mirages seen this voyage.
var mirages := 0
## Ground height at (x, z) (the sea floor below 0), to keep mirages off real land.
var ground := func(_x: float, _z: float) -> float: return -20.0

var _spell := 0.0
var _quiet := 60.0 + randf() * 160.0
var _mirage_t := 10.0
var _in_ash := false
var _smoke_t := 0.0
var _fx: Particles


## `quality` 0 low .. 2 high sets how many flakes the ember rain has.
func setup(regions: Array[Region], fx: Particles, quality: int) -> void:
	_fx = fx
	for r in regions:
		for i: Dictionary in r.islands:
			if str(i.get("kind", "")) == "volcanic":
				volcanoes.append([str(i.name), float(i.x), float(i.z), float(i.r)])
	embers = Embers.new()
	embers.name = "Embers"
	add_child(embers)
	embers.setup(quality)
	mirage = Mirage.new()
	mirage.name = "Mirage"
	add_child(mirage)
	mirage.entered.connect(_through)


## The volcano whose ash makes ember rain (for the crew to name).
func volcano_name() -> String:
	return str(volcanoes[0][0]) if not volcanoes.is_empty() else "the volcano"


## A new voyage: nothing conjured, nothing in the air.
func reset() -> void:
	mirage.clear()
	_mirage_t = 10.0
	_in_ash = false
	mirages = 0


## The ash in the air at (x, z) from every volcano's plume, as if all were
## erupting (0 .. 1), with the wind blowing toward (wx, wz).
func plume_at(x: float, z: float, wx: float, wz: float) -> float:
	var ash := 0.0
	for v: Array in volcanoes:
		var rx: float = x - v[1]
		var rz: float = z - v[2]
		var r: float = v[3]
		var along := rx * wx + rz * wz
		var across := absf(rx * wz - rz * wx)
		# the plume fans out as it travels, and thins away at the end of its reach
		var width := r * 0.8 + maxf(along, 0.0) * 0.32
		var lane := MathX.smooth(-r * 0.6, r * 0.5, along) * (1.0 - MathX.smooth(PLUME_REACH * 0.55, PLUME_REACH, along)) * exp(-pow(across / width, 2.0))
		# and the mountain's own flanks are dusted whichever way it blows
		var flank := 0.45 * (1.0 - MathX.smooth(r * 0.8, r * 1.7, Vector2(rx, rz).length()))
		ash = maxf(ash, maxf(lane, flank))
	return ash


## The mountain's moods, the ash over the ship, the crew's notice and the
## mirages. `ship` is null with no ship sailing; `playing` while a voyage is
## under way (toasts and mirages only then); `view` the camera's target and
## `cam_dist` how far back it stands.
func update(dt: float, a: Atmosphere, world: World, ship: Ship, playing: bool, view: Vector3, cam_dist: float) -> void:
	var w := world.wind
	# ---- the volcano: long quiet spells, then now and then a restless one
	if _spell > 0.0:
		_spell -= dt
	else:
		_quiet -= dt
		if _quiet < 0.0:
			_quiet = 200.0 + randf() * 240.0
			if randf() < 0.45 and not volcanoes.is_empty():
				stir(ship, playing)
	restless += ((1.0 if _spell > 0.0 else 0.0) - restless) * (1.0 - exp(-dt / 18.0))
	var plume := plume_at(ship.pos.x, ship.pos.z, w.dir_x, w.dir_z) if ship != null else 0.0
	a.plume = plume
	a.ash_to = plume * restless
	embers.update(a.ash, view, world.time)
	_smoke(dt, world)

	# ---- the crew notice where they are
	if ship != null and playing:
		if a.ash > 0.45 and a.kind != &"embers" and not _in_ash:
			toast.emit("Ember rain", "Warm ash and glowing embers drift down from %s" % volcano_name(), 4.0)
		_in_ash = a.ash > (0.3 if _in_ash else 0.45)

	# ---- mirages: every ten seconds of a scorching noon, one chance in twenty
	_mirage_t -= dt
	if _mirage_t < 0.0:
		_mirage_t = 10.0
		if ship != null and playing and a.heat > 0.6 and not mirage.active and randf() < 0.05:
			conjure(ship, cam_dist)
	if ship != null:
		mirage.update(dt, ship.pos.x, ship.pos.z, a.heat, world.time)


## A restless spell begins: smoke pours from the crater and the ash rains
## downwind for a few minutes; a ship within earshot hears the mountain.
func stir(ship: Ship, playing: bool) -> void:
	_spell = 150.0 + randf() * 110.0
	var v: Array = volcanoes[0]
	var d := Vector2(ship.pos.x - v[1], ship.pos.z - v[2]).length() if ship != null else INF
	if playing and d < 2600.0:
		rumble.emit(0.5, d)
		toast.emit("%s stirs" % v[0], "Smoke pours from the crater. Downwind it is raining ash and embers", 4.5)


## For the debug flags: the mountain restless at once, its ash already out.
func erupt() -> void:
	_spell = 200.0
	restless = 1.0


## The volcano's plume: a lazy white wisp, or in a restless spell a dark
## column of ash bent over downwind, with embers spat glowing from the crater.
func _smoke(dt: float, world: World) -> void:
	if volcanoes.is_empty() or _fx == null:
		return
	_smoke_t += dt
	var rest := restless
	if _smoke_t <= 0.32 - rest * 0.14:
		return
	_smoke_t = 0.0
	var w := world.wind
	var v: Array = volcanoes[0]
	var vx: float = v[1]
	var vz: float = v[2]
	var top := world.ground_height(vx, vz)
	var g0 := 1.05 - rest * 0.62
	var lean := 0.6 + rest * 2.2
	_fx.emit(Vector3(vx + randf_range(-4.0, 4.0), top + 4.0, vz + randf_range(-4.0, 4.0)),
			Vector3(w.dir_x * lean, 3.0 + randf() * 2.0 + rest * 2.0, w.dir_z * lean),
			16.0 + randf() * 6.0 + rest * 8.0, 8.0 + rest * 4.0, 34.0 + rest * 30.0,
			Color(g0, g0 * 0.98, g0 * 0.96, 0.3 + rest * 0.25), Color(0.95 - rest * 0.5, 0.95 - rest * 0.52, 0.97 - rest * 0.52),
			0.0, 0.08, Particles.SMOKE, 0.1, Vector2.ZERO, randf_range(-0.05, 0.05))
	if rest > 0.3 and randf() < rest * 0.8:
		for i in 3:
			_fx.emit(Vector3(vx + randf_range(-3.0, 3.0), top + 2.0, vz + randf_range(-3.0, 3.0)),
					Vector3(randf_range(-3.5, 3.5) + w.dir_x * 2.0, 9.0 + randf() * 9.0, randf_range(-3.5, 3.5) + w.dir_z * 2.0),
					2.5 + randf() * 2.0, 2.0, 0.6, Color(7.0, 2.6, 0.5, 1.0), Color(2.2, 0.35, 0.05),
					6.0, 0.25, Particles.SPARK, 0.01, Vector2.ZERO, 0.0, true)


## An island shimmers up dead ahead of the ship, far enough off to watch her
## sail into it (never over, or on top of, real land).
func conjure(ship: Ship, cam_dist: float) -> bool:
	var d := clampf(cam_dist * 1.6, 170.0, 360.0) + randf() * 60.0
	var side := (randf() - 0.5) * 0.25 * d
	var f := ship.forward()
	var x := ship.pos.x + f.x * d + f.z * side
	var z := ship.pos.z + f.z * d - f.x * side
	var s := 15.0 + randf() * 8.0
	for i in 7:
		var ang := float(i) / 6.0 * TAU
		var r := 0.0 if i == 6 else s * 1.4
		if float(ground.call(x + cos(ang) * r, z + sin(ang) * r)) > -4.0:
			return false
	mirage.spawn(x, z, s, randf() * TAU)
	mirages += 1
	shimmer.emit()
	if mirages == 1:
		toast.emit("Land ho…?", "An island shimmers up ahead where no chart shows one", 4.5)
	else:
		toast.emit("A mirage", "The heat conjures another island", 3.0)
	return true


func _through() -> void:
	shimmer.emit()
	for i in 14:
		var a := randf() * TAU
		var r := mirage.size * (0.2 + randf() * 0.5)
		_fx.sparkle(Vector3(mirage.x + cos(a) * r, 1.0 + randf() * 6.0, mirage.z + sin(a) * r), 2.5, Color(0.75, 0.95, 1.25))
	if mirages == 1:
		toast.emit("Only a mirage", "It frays away round the hull, as if it was never there", 3.6)
