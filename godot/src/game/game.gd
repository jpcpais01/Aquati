extends Node3D
## The voyage: the sea, the sky and the light, the islands, your ship and the
## pirates out there, the camera that follows her, the helm, the guns and the
## HUD; and when she goes down, her farewell.
##
## Command-line (after --): --smoke runs a few seconds and prints SMOKE OK
## (--smoke-at N: after N frames; --again N sails again off the farewell
## card at frame N);
## --shot PATH saves a frame and quits, with --hour H, --view N (0 close ..
## 3 leaned over) or --zoom Z (0..1) and --tilt T (0..1), --fov F to narrow
## the lens for a close-up (degrees), --frames N to let it settle first,
## --heading R and --at X,Z to start somewhere else, --ship CLASS and
## --livery ID to sail another hull with --sails N (0..3) of canvas set
## (--anchor holds her there), --wind A to hold the breeze on a heading, and
## --discover to chart the islands nearby as play does.
## The sky: --wx KIND holds the weather (clear, fair, cloudy, mist, rain,
## storm, calm, hot) and --time NAME the hour (dawn, noon, golden, dusk,
## night); a set piece's frame skips the sky picked last time on the badge.
## --strike [N] brings a bolt of lightning down N frames (2) before the shot.
## A fight: --battle CLASS puts a pirate of that class off your port beam,
## spoiling for it (--foe-dist M or --foe-at X,Z,HEADING to place her,
## --foe-hp F for the share of her hull left, --foe-wounds N for N breaches
## in her already, --foe-dismast I,J.. to bring masts down (past her last,
## the bowsprit), --foe-anchor to hold her still, --foe-sink S to sink her
## S seconds in, --wreck split|capsize for how she goes, --watch to follow
## her), --autofire looses each side the moment it bears, --sink S sends your
## ship down S seconds in (her farewell; --farewell T starts it T seconds
## through), --touch shows the touch controls, --nopirates keeps the sea
## clear, --voyage puts a long voyage behind her (to see a full farewell).
## Shot and plunder: --ammo ID loads a kind of shot (round, shell, fire,
## chain, grape) and --foe-ammo ID has the set piece's foe fire nothing
## else; --loot N[,TIER] floats N barrels or chests (of a tier, 0..4) round
## her, --hold fills the hold with a little of everything, --peek opens its
## peek and --pie the touch shot pie (--pie ID: held, a finger on that kind).
## Crews: --eye X,Y,Z puts the lens at that point in the followed ship's own
## frame (+z her bow, +x her port side), looking at her deck amidships or at
## --look X,Y,Z (it stays put once she's going down); --nocrew leaves every
## deck empty.

## Past this far from every archipelago's centre (m) she is out on the high
## seas, where the weather keeps fair (with a little give either way, so
## sailing along the edge doesn't flicker it).
const HIGH_SEAS_R := 1380.0
## Where a voyage starts: out of the home port on a reach, bow to the open
## water between the atoll and Morro Huracão (the web's spawn and heading).
const SPAWN := Vector2(40.0, 210.0)
const SPAWN_HEADING := PI * 0.82
## Her farewell: the moment (s) the camera dives for the water where she
## went down, as on the web.
const DIVE := 8.6

var world := World.new()
var atmosphere := Atmosphere.new()
var env: Environment
var sun: DirectionalLight3D
var sky_mat: ShaderMaterial
var camera: CameraRig
var ocean: Ocean
var regions: Array[Region] = []
var grounds: Array[Ground] = []
var floras: Array[Flora] = []
## The archipelago the camera is in (or nearest): its seabed is the one the sea reads.
var region: Region
var grade: Grade
var player: Ship
var controls: Controls
var hud: Hud
var shipyard: Shipyard
var pirates: Pirates
var gunnery: Gunnery
var crew: Crew
var collisions := Collisions.new()
var wreck: WreckScreen
var rain: Rain
var lightning: Lightning
var spindrift: Spindrift
## The voyage's sound and its music.
var sound: Sound

## The islands charted this voyage ("region/island"), of how many.
var discovered := {}
var isles_total := 0
## This voyage's log, for the farewell.
var voyage := Voyage.new()
## The sea's clock against the wall's: slowed for the blow that sinks her.
var time_scale := 1.0
## The magazine: broadsides of each kind of shot aboard (round shot -1, endless).
var stock := Ammo.fresh_stock()
## The ship's hold.
var hold: Treasure.Hold

var _args := {}
var _frames := 0
var _sky_day := -1.0
var _sky_revision := 0.0
## Her farewell while it plays, else null.
var _farewell: Farewell
## The grade greyed for the blow that sinks her (0..1).
var _desat := 0.0
## The set piece's foe (--battle), and when to send your ship down (--sink).
var _foe: Ship
var _sink_at := -1.0
var _foe_sink_at := -1.0
## Seconds until the hold may say again that it's full; salvage hauled this voyage.
var _hold_nag := 0.0
var _hauled := 0
## The swell's heading, coming round after the wind's, and the one its trains were laid out on.
var _swell := 0.0
var _swell_base := 0.0
## Where streaks laid out along the wind are measured from (wind_pivot).
var _wind_pivot := Vector2.ZERO
## The last strike: where (x, z), how far its light reaches (m) and how bright.
var _strike := Vector4(0.0, 0.0, 1.0, 0.0)
var _high_seas := false
## Every archipelago's centre (x, z): the sea-spark blooms lie out past them (SeaGlow).
var _glow_centres := PackedVector2Array()
## Sailing through a sea-spark bloom on a dark night (the crew have said so).
var _in_bloom := false
## The lanterns the sea mirrors this frame (Ocean.set_lamps).
var _lamp_list: Array[Vector4] = []
## A weather the sky badge showed but couldn't set, and when (ms): a tap soon after moves on past it.
var _refused := &""
var _refused_at := 0
## Seconds to the next look at whether a weather picked by hand still holds here.
var _wx_check := 1.0
## A set piece's bolt of lightning, struck on the next frame (--strike).
var _strike_now := false
## Strikes so far (for the smoke test's report).
var _strikes := 0


## A voyage's log: how long, what the guns did, how far she sailed, and the
## deeds worth writing down.
class Voyage:
	var time := 0.0
	var shots := 0
	var hits := 0
	var dealt := 0.0
	var taken := 0.0
	var metres := 0.0
	var events: Array[Dictionary] = []

	func note(kind: String, text: String, detail: String = "") -> void:
		events.append({"t": time, "kind": kind, "text": text, "detail": detail})
		if events.size() > 40:
			events.remove_at(0)


## Her farewell: how far through, and where the camera was when it began.
class Farewell:
	var t := 0.0
	var hud := true
	var shown := false
	var skip := false
	var az := 0.0
	var elev := 0.0
	var dist := 0.0
	var report := {}
	## Whether she goes down in deep water (the gauge counts her down), and the
	## fathoms it last showed.
	var deep := false
	var fathoms := -1
	## The camera has dived for the water where she went down.
	var dived := false
	## Her timbers have groaned in the final plunge.
	var plunged := false
	## When (her farewell's clock) she came to rest on the sand, -1 still sinking.
	var rest := -1.0
	## Till the next gulp of trapped air breaks out of her.
	var burst := 0.0


func _ready() -> void:
	_args = _parse_args()
	sound = Sound.new()
	sound.name = "Sound"
	add_child(sound)
	sound.apply_settings(Settings)
	Settings.changed.connect(func() -> void: sound.apply_settings(Settings))
	world.sound = sound
	_setup_sky()
	_build_environment()
	_build_sea()
	_build_islands()
	_build_player()
	_build_camera()
	_build_fleet()
	controls = Controls.new()
	add_child(controls)
	hud = Hud.new()
	hud.controls = controls
	hud.sail_set.connect(func(n: int) -> void: player.sail_target = n / 3.0)
	hud.view_pressed.connect(func() -> void:
		sound.click()
		camera.next_view())
	hud.clicked.connect(sound.click)
	hud.fire_pressed.connect(func(side: int) -> void:
		if side == 0:
			controls.fire_auto = true
		else:
			controls.fire_side = side)
	hud.ammo_picked.connect(func(kind: int) -> void: _pick_ammo(kind))
	hud.sky_tapped.connect(_on_sky_tap)
	add_child(hud)
	hud.sky_pins(atmosphere.mode != &"auto", atmosphere.time_mode != &"auto")
	atmosphere.changed.connect(func(_kind: StringName, title: String, line: String) -> void:
		if _farewell == null:
			hud.toast(title, line, 3.4))
	atmosphere.wind_shifted.connect(func(title: String, line: String) -> void:
		hud.wind_shift()
		if _farewell == null:
			hud.toast(title, line, 3.0))
	hud.watch_hold(hold)
	wreck = WreckScreen.new()
	wreck.touch = _args.has("touch")
	wreck.retry.connect(_sail_again)
	wreck.tallied.connect(sound.tally)
	add_child(wreck)
	world.hit.connect(_on_hit)
	world.sunk.connect(_on_sunk)
	world.shook.connect(func(a: float) -> void: camera.shake(a))
	world.burned.connect(_on_burned)
	world.status.connect(_on_status)
	gunnery.loaded.connect(func(side: int) -> void:
		sound.guns_ready(sin(player.heading + side * PI * 0.5) * 0.6)
		hud.guns_ready(side))
	pirates.bounty.connect(_on_bounty)
	if _args.has("touch"):
		hud.show_touch(true)
	if _args.has("shot"):
		atmosphere.running = false
		hud.visible = not _args.has("nohud")
	if _args.has("battle"):
		_stage_battle(str(_args.battle))
	if _args.has("sink"):
		_sink_at = float(_args.sink)
	if _args.has("voyage"):
		_stage_voyage()
	_stage_plunder()
	# one settled frame before anything draws
	_tick(0.0)
	camera.snap_to(_watched().pos)
	_warm_up()


## A first wound, the first plank in the water: none of it may stutter the
## game. One of everything battle damage draws hangs in front of the camera
## for a moment, far too small to see, so its shaders are built up front.
func _warm_up() -> void:
	var w := Node3D.new()
	w.name = "WarmUp"
	w.transform = Transform3D(Basis.from_scale(Vector3.ONE * 1e-4), Vector3(0.0, 0.0, -40.0))
	for n in ShipDamage.warm_meshes(player.model):
		w.add_child(n)
	for n in world.debris.warm_meshes():
		w.add_child(n)
	for n in world.loot.warm_meshes():
		w.add_child(n)
	camera.add_child(w)
	hud.warm()
	get_tree().create_timer(1.0).timeout.connect(w.queue_free)


func _parse_args() -> Dictionary:
	var out := {}
	var a := OS.get_cmdline_user_args()
	var i := 0
	while i < a.size():
		var k := a[i].trim_prefix("--")
		if i + 1 < a.size() and not a[i + 1].begins_with("--"):
			out[k] = a[i + 1]
			i += 2
		else:
			out[k] = true
			i += 1
	return out


## The sky to sail under: a set piece's (--wx, --time or --hour, --wind),
## else the weather and hour picked last time on the sky badge, else
## nature's own.
func _setup_sky() -> void:
	var a := atmosphere
	if _args.has("wind"):
		a.wind_angle = float(_args.wind)
		a.wind_to = a.wind_angle
		a.wind_locked = true
	var saved := not _args.has("shot")
	var wx := StringName(str(_args.get("wx", "")))
	# (a saved very hot noon waits for the high seas: a voyage sets out from port)
	if not Atmosphere.WEATHER.has(wx) and saved and a.needs(StringName(Settings.weather)) == "":
		wx = StringName(Settings.weather)
	if Atmosphere.WEATHER.has(wx):
		a.set_mode(wx, true)
	var tm := StringName(str(_args.get("time", "")))
	if not Atmosphere.TIMES.has(tm) and saved and not _args.has("hour"):
		tm = StringName(Settings.time)
	if Atmosphere.TIMES.has(tm):
		a.set_time_mode(tm, true)
	if _args.has("hour"):
		a.set_hour(float(_args.hour))
	a.update(0.0)


func _build_environment() -> void:
	sky_mat = ShaderMaterial.new()
	sky_mat.shader = preload("res://shaders/sky.gdshader")
	sky_mat.set_shader_parameter("moon_tex", preload("res://art/moon.png"))
	var sky := Sky.new()
	sky.sky_material = sky_mat
	# the radiance map lights and reflects everything: redrawn over a few frames as the hour turns
	sky.radiance_size = Sky.RADIANCE_SIZE_128 if Settings.mobile else Sky.RADIANCE_SIZE_256
	sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_sky_contribution = 1.0
	env.ambient_light_energy = Atmosphere.SKY_LIGHT
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	# the grade does the tone curve (see render/grade.gd): the tonemapper only scales
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.tonemap_exposure = 0.5
	env.adjustment_enabled = true
	env.fog_enabled = false
	env.glow_enabled = Settings.glow()
	if env.glow_enabled:
		env.glow_intensity = 0.35
		env.glow_bloom = 0.0
		env.glow_hdr_threshold = 1.1
		env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	grade = Grade.new(env)
	add_child(grade)

	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = not _args.has("noshadow")
	# one map, fitted to the ground in view (see CameraRig.shadow_reach): the
	# view looks down on a compact patch of the world, so a single map spends
	# every texel where the eye is and draws each caster once, not once a split
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_fade_start = 0.85
	sun.shadow_bias = 0.1
	sun.shadow_normal_bias = 2.0
	sun.sky_mode = DirectionalLight3D.SKY_MODE_LIGHT_ONLY
	add_child(sun)


func _build_sea() -> void:
	# the swell is laid out on the wind the voyage starts with, and comes round after it
	world.wind = Wind.new(atmosphere.wind_angle)
	world.waves = Waves.new(atmosphere.wind_angle)
	_swell = atmosphere.wind_angle
	_swell_base = _swell
	world.wake = WakeField.new()
	world.wake.name = "Wake"
	add_child(world.wake)
	world.fx = Particles.new()
	world.fx.name = "Particles"
	world.fx.wind = world.wind
	add_child(world.fx)
	ocean = Ocean.new()
	ocean.name = "Ocean"
	add_child(ocean)
	ocean.setup(world.waves, world.wind, world.wake)
	ocean.visible = not _args.has("noocean")
	world.debris = Debris.new()
	world.debris.name = "Debris"
	add_child(world.debris)
	world.debris.setup(world)
	world.loot = Loot.new()
	world.loot.name = "Loot"
	add_child(world.loot)
	world.loot.setup(world)
	# the weather round the view
	rain = Rain.new()
	rain.name = "Rain"
	add_child(rain)
	rain.setup(world)
	lightning = Lightning.new()
	lightning.name = "Lightning"
	add_child(lightning)
	spindrift = Spindrift.new()
	spindrift.name = "Spindrift"
	add_child(spindrift)
	spindrift.setup(world)


func _build_islands() -> void:
	regions = Region.load_all()
	world.regions = regions
	for r in regions:
		isles_total += r.islands.size()
		_glow_centres.append(Vector2(r.centre.x, r.centre.z))
		var g := Ground.new()
		g.build(r, Settings.quality == Settings.Quality.LOW)
		add_child(g)
		grounds.append(g)
		var f := Flora.new()
		f.build(r)
		f.visible = not _args.has("noflora")
		add_child(f)
		floras.append(f)
	ocean.set_glow_centres(_glow_centres)


## Points the sea at the archipelago nearest (x, z), as you cross the high seas.
func _pick_region(x: float, z: float) -> void:
	var best: Region = null
	var bd := INF
	for r in regions:
		var d := Vector2(r.centre.x - x, r.centre.z - z).length()
		if d < bd:
			bd = d
			best = r
	if best == region:
		return
	region = best
	ocean.set_region(region)
	world.wake.set_seabed(region.height_tex, region.height_rect())
	world.debris.set_region(region)
	world.loot.set_region(region)
	rain.set_region(region)
	world.region = region


func _build_player() -> void:
	player = Ship.create(ShipClass.named(str(_args.get("ship", "sloop"))), Livery.named(str(_args.get("livery", "player"))), world)
	add_child(player)
	# two-thirds of her canvas set and already making way
	var h := SPAWN_HEADING
	if _args.has("heading"):
		h = float(_args.heading)
	var at := SPAWN
	if _args.has("at"):
		var p: PackedStringArray = str(_args.at).split(",")
		at = Vector2(float(p[0]), float(p[1]))
	player.place(at.x, at.y, h)
	player.sail_target = 2.0 / 3.0
	player.sail_level = player.sail_target
	player.speed = player.cls.max_speed * 0.55
	if _args.has("at"):
		# a set piece: hove to where she was put, sails furled
		player.sail_target = 0.0
		player.sail_level = 0.0
		player.speed = 0.0
	if _args.has("sails"):
		player.sail_target = clampf(float(_args.sails) / 3.0, 0.0, 1.0)
		player.sail_level = player.sail_target
	player.anchored = _args.has("anchor")
	# a fresh magazine and an empty hold
	stock = Ammo.fresh_stock()
	hold = Treasure.Hold.new(int(Treasure.HOLD_ROOM.get(player.cls.id, 10)))
	_hold_nag = 0.0
	_hauled = 0
	if _args.has("ammo"):
		var k := Ammo.ID.find(str(_args.ammo))
		if k >= 0:
			player.ammo = k


func _build_camera() -> void:
	camera = CameraRig.new()
	camera.name = "Camera"
	add_child(camera)
	camera.current = true
	if _args.has("view"):
		var v: Array = CameraRig.VIEWS[clampi(int(_args.view), 0, 3)]
		camera.set_view(v[0], v[1])
	if _args.has("zoom"):
		camera.set_view(float(_args.zoom), float(_args.get("tilt", 0.0)))
	if _args.has("fov"):
		camera.lens = float(_args.fov)
	camera.snap_to(player.pos)
	player.struck.connect(func(a: float) -> void: camera.shake(a))


## The pirates and the yard that builds their hulls, and your gunnery.
func _build_fleet() -> void:
	world.shots = Shots.new()
	world.shots.name = "Shots"
	world.shots.world = world
	add_child(world.shots)
	world.ships.append(player)
	shipyard = Shipyard.new()
	shipyard.name = "Shipyard"
	add_child(shipyard)
	# a set piece builds what it needs on the spot; the yard works for a live sea
	shipyard.set_process(not _args.has("shot"))
	pirates = Pirates.new()
	pirates.name = "Pirates"
	add_child(pirates)
	pirates.setup(world, shipyard, self)
	pirates.enabled = not (_args.has("shot") or _args.has("nopirates") or _args.has("battle"))
	gunnery = Gunnery.new()
	gunnery.name = "Gunnery"
	add_child(gunnery)
	crew = Crew.new()
	crew.name = "Crew"
	crew.visible = not _args.has("nocrew")
	add_child(crew)


## A set piece: a pirate of class `id` off your port beam, spoiling for a fight.
func _stage_battle(id: String) -> void:
	var p := player
	var port := p.port_dir()
	var off := float(_args.get("foe-dist", 120.0))
	var at := Vector2(p.pos.x + port.x * off, p.pos.z + port.z * off)
	var h := p.heading
	if _args.has("foe-at"):
		var f: PackedStringArray = str(_args["foe-at"]).split(",")
		at = Vector2(float(f[0]), float(f[1]))
		if f.size() > 2:
			h = float(f[2])
	var ai := pirates.launch(id, at.x, at.y, h, 0, true)
	ai.mode = PirateAI.Mode.ENGAGE
	_foe = ai.ship
	# she has a grievance already
	_foe.last_attacker = p
	_foe.last_hit = world.time
	_foe.sail_target = maxf(p.sail_target, 0.5)
	_foe.sail_level = _foe.sail_target
	_foe.speed = p.speed
	if _args.has("foe-hp"):
		_foe.hp = _foe.max_hp * clampf(float(_args["foe-hp"]), 0.01, 1.0)
	var shape := _foe.model.shape
	for i in int(_args.get("foe-wounds", 0)):
		var t := randf_range(0.12, 0.88)
		var y := randf_range(0.3, shape.top(t) - 0.4)
		var side := 1.0 if randf() < 0.5 else -1.0
		_foe.dmg.on_hit(_foe.transform * Vector3(side * shape.half_width_at_y(t, y), y, shape.z(t)), randf_range(15.0, 30.0))
	_foe.anchored = _args.has("foe-anchor")
	if _args.has("foe-ammo"):
		ai.force_ammo = maxi(0, Ammo.ID.find(str(_args["foe-ammo"])))
	if _args.has("foe-dismast"):
		for m in str(_args["foe-dismast"]).split(","):
			_foe.dmg.dismast(int(m), randf_range(0.0, 0.3))
	if _args.has("wreck"):
		_foe.dmg.wreck_mode = ShipDamage.Mode.SPLIT if str(_args.wreck) == "split" else ShipDamage.Mode.CAPSIZE
	_foe_sink_at = float(_args.get("foe-sink", -1.0))


## A long voyage behind her already, to see a full farewell card (--voyage):
## prizes taken, isles charted, a log of deeds.
func _stage_voyage() -> void:
	var v := voyage
	v.time = 754.0
	v.shots = 64
	v.hits = 21
	v.dealt = 2210.0
	v.taken = 640.0
	v.metres = 9800.0
	player.gold = 1480
	player.kills = 4
	var deeds := [
		[38.0, "isle", "Charted Morro Huracão", "+86 gold"], [96.0, "isle", "Charted Cayo Solenne", "+64 gold"],
		[151.0, "kill", "Sank the Rook", "Sloop · +120 gold"], [212.0, "isle", "Charted Isla Ventana", "+71 gold"],
		[268.0, "kill", "Sank the Black Gull", "Brigantine · +260 gold"], [384.0, "isle", "Charted the Atoll", "+58 gold"],
		[471.0, "kill", "Sank the Widow's Due", "Brigantine · +260 gold"], [612.0, "isle", "Charted Punta Brava", "+77 gold"],
		[689.0, "kill", "Sank the Grey Mare", "Galleon · +420 gold"],
	]
	for d: Array in deeds:
		v.events.append({"t": d[0], "kind": d[1], "text": d[2], "detail": d[3]})
	for i in 6:
		discovered["home/%d" % i] = true


## Plunder for a set piece: salvage afloat off her bow (--loot), a hold with
## a little of everything (--hold), the hold's peek open (--peek); the shot
## pie opens (--pie) a second before the frame is saved (see _process).
func _stage_plunder() -> void:
	if _args.has("loot"):
		var a: PackedStringArray = str(_args.loot).split(",")
		var n := int(a[0]) if a[0].is_valid_int() else 8
		for i in n:
			var tier: int = int(a[1]) if a.size() > 1 else [0, 0, 1, 2, 3, 4][i % 6]
			# a spiral round her, clear of her reach
			var ang := player.heading + i * 2.4
			var r := 18.0 + i * 2.2
			world.loot.place(player.pos.x + sin(ang) * r, player.pos.z + cos(ang) * r, tier)
	if _args.has("hold"):
		hold.stow(PackedStringArray(["rum", "silver", "pearls", "sugar", "ruby", "spices", "crown"]))
	if _args.has("peek"):
		get_tree().create_timer(0.1).timeout.connect(func() -> void: hud.open_peek())


func _process(delta: float) -> void:
	_tick(minf(delta, 0.1))
	_frames += 1
	if _args.has("again") and _frames == int(_args.again) and _farewell != null and _farewell.shown:
		wreck.retry.emit()
	if _args.has("pie") and _frames == maxi(1, int(_args.get("frames", 90)) - 30):
		hud.open_pie(Ammo.ID.find(str(_args.pie)))
	if _args.has("strike") and _frames == maxi(1, int(_args.get("frames", 90)) - int(_args.strike if str(_args.strike).is_valid_int() else 2)):
		_strike_now = true
	if _args.has("smoke") and _frames == int(_args.get("smoke-at", 300)):
		var isles := 0
		var plants := 0
		for i in regions.size():
			isles += regions[i].islands.size()
			plants += floras[i].plants
		var lost := "" if _farewell == null else "; lost %.1f s ago%s" % [_farewell.t, ", the farewell card up" if _farewell.shown else ""]
		if _args.has("again") and _farewell == null and _frames > int(_args.again):
			lost = "; sailing again, the HUD %s" % ("up" if hud.get_node("Root").visible else "hidden")
		var down := 0
		var holes := 0
		for sh in world.ships:
			holes += sh.dmg.holes.size()
			for sp in sh.model.spars:
				down += 1 if sp.broken else 0
		var junk := world.debris.counts()
		var f := world.shots.fired
		var afloat := world.loot.counts()
		var marks := 0
		for sh in world.ships:
			marks += (1 if sh.afire > 0.0 else 0) + (1 if sh.torn > 0.0 else 0) + (1 if sh.crew_hit > 0.0 else 0)
		print("SMOKE OK: %d frames, %.0f m sailed, %d triangles in the sloop, %d islands, %d plants; %d ships afloat, %d guns fired, %d hits, %d breaches, %d spars down, %d pieces of wreckage and %d spars adrift, %d hulls on the slipway%s" % [
				_frames, player.pos.length(), player.model.triangles(), isles, plants, world.ships.size(), voyage.shots, voyage.hits, holes, down, junk.x, junk.y, shipyard.stock(), lost])
		print("SMOKE SHOT: balls fired round %d, shell %d, fire %d, chain %d, grape %d; %d marks of special shot on ships; magazine %s, %s loaded" % [f[0], f[1], f[2], f[3], f[4], marks, stock, Ammo.ID[player.ammo]])
		var hands := crew.counts()
		var cut := crew.view.stats()
		print("SMOKE CREW: %d sailors in %d crews; drawn %d near, %d far, %d distant, %d specks in %d draws" % [hands.x, hands.y, cut[0], cut[1], cut[2], cut[3], cut[4]])
		print("SMOKE LOOT: %d barrels and %d/%d/%d/%d chests afloat, %d hauled; hold %d/%d (%d goods, worth %d)" % [afloat[0], afloat[1], afloat[2], afloat[3], afloat[4], _hauled, hold.used(), hold.capacity, hold.count(), hold.worth()])
		var a := atmosphere
		print("SMOKE SKY: %s (%s), cover %.2f, rain %.2f, storm %.2f, sea %.2f, wind %.2f from the %s; %d strikes; rain %s, spindrift %s" % [
				a.kind, a.mode, a.cover, a.rain, a.storm, a.sea, a.wind, Atmosphere.compass(a.wind_angle), _strikes,
				"falling" if rain.visible else "none", "flying" if spindrift.visible else "none"])
		print("SMOKE SOUND: " + sound.stats())
	if _args.has("shot") and _frames >= int(_args.get("frames", 90)):
		_save_shot(str(_args.shot))


func _tick(real_dt: float) -> void:
	# the sea's clock: slowed for the blow that sinks her
	var dt := real_dt * time_scale
	world.time += dt
	controls.poll()
	if player.alive:
		voyage.time += dt
		_helm()
	else:
		player.rudder = 0.0
	if _farewell == null:
		if controls.zoom != 0.0:
			camera.zoom_by(controls.zoom, world.time)
		if controls.view_next:
			camera.next_view()
	elif controls.skip:
		_skip()

	# the air and the water: the weather sets the breeze (ships, plants, gusts
	# and the clouds' drift all follow it) and the sea state, and the swell
	# comes round after the wind
	_pick_region(camera.target.x, camera.target.z)
	atmosphere.bloom = SeaGlow.at(player.pos.x, player.pos.z, _glow_centres)
	_seas()
	atmosphere.update(dt)
	var w := world.wind
	w.strength = atmosphere.wind
	w.intensity = 0.55 + atmosphere.wind * 0.6
	_turn_wind()
	w.update(dt, camera.target.x, camera.target.z, camera.ground_radius())
	world.waves.set_sea_state(atmosphere.sea, atmosphere.calm)
	_turn_swell(dt)
	world.waves.advance(dt)

	# the ships: the pirate captains decide, every hull sails, hulls that touch
	# shove and stave each other in, and the shot in the air flies
	pirates.step(dt, player)
	for s in world.ships:
		s.step(dt)
	if dt > 0.0:
		collisions.resolve(world)
	world.shots.step(dt)
	pirates.sweep()
	if player.alive:
		voyage.metres += Vector2(player.vel.x, player.vel.z).length() * dt
		# the crew patches her up between fights
		if world.time - player.last_hit > 9.0:
			player.hp = minf(player.max_hp, player.hp + player.max_hp * 0.01 * dt)
	gunnery.pointer = _pointer_on_sea()
	gunnery.update(dt, player, world, player.alive and _farewell == null, world.time)
	_guns()
	if _sink_at >= 0.0 and player.alive and voyage.time >= _sink_at:
		player.damage(player.max_hp * 4.0, _foe)
	if _foe_sink_at >= 0.0 and _foe != null and _foe.alive and world.time >= _foe_sink_at:
		_foe.damage(_foe.max_hp * 4.0, player)
	controls.consume()

	world.listener = camera.target
	world.listener_zoom = camera.distance()
	if _farewell != null:
		_farewell_step(real_dt)
	var focus := _watched()
	if _args.has("eye") and _farewell == null and focus.alive:
		# a set piece's lens on her deck (it stays put once she's going down)
		camera.cine_pos = focus.transform * _vec3(str(_args.eye))
		camera.cine_look = focus.transform * (_vec3(str(_args.look)) if _args.has("look") else Vector3(0.0, 2.0, 0.0))
		camera.cine_fov = camera.lens
		camera.cine_w = 1.0
	camera.update_rig(real_dt, focus.pos, focus.vel, world.time)
	# every crew afloat, after the camera has moved: they're culled and cut by it
	crew.update(dt, world, camera, camera.target, camera.ground_radius() * 1.5, atmosphere.key_dir)
	# the wake steps first, so the sea draws the canvas stepped this frame
	world.wake.step(camera.target.x, camera.target.z, dt)
	ocean.follow(camera.target, camera.distance())
	_lamps()
	# the wreckage afloat, on the very swell the ocean draws (and shouldered aside by hulls still moving)
	RenderingServer.global_shader_parameter_set("sea_clock", fmod(world.time, Debris.CLOCK_WRAP))
	var pushers: Array[Ship] = []
	for s in world.ships:
		if s.alive or s.sink_t < 20.0:
			pushers.append(s)
	world.debris.update(dt, pushers, ocean, camera.global_position)
	# salvage afloat: drawn in and hauled aboard as she sails through it (a
	# full hold leaves what it can't take bobbing on the swell)
	var hauling := player.alive and _farewell == null
	var reach := (player.cls.beam * 0.5 + 5.0) * 2.0
	var got := world.loot.update(dt, player.pos if hauling else null, reach, _refuse, ocean, camera.global_position)
	for it in got:
		_haul(it)
	_hold_nag = maxf(0.0, _hold_nag - dt)

	# the weather round the view, its sound, then the light
	_sky_fx(dt)
	_sound()
	atmosphere.apply(sun, env)
	RenderingServer.global_shader_parameter_set("wind", Vector4(w.dir_x, w.dir_z, w.strength, 0.0))
	RenderingServer.global_shader_parameter_set("wind_drift", w.drift)
	# the surf: bigger, longer-running breakers as the sea builds (the web's
	# setSurf); its clock wraps on a whole number of breakers
	var sea := clampf(atmosphere.sea, 0.0, 1.4)
	RenderingServer.global_shader_parameter_set("surf", Vector4(0.3 + sea * 0.55 + w.strength * 0.06, 0.26 + sea * 0.42 + w.strength * 0.05, atmosphere.storm, fmod(world.time, 7000.0)))
	for g in grounds:
		g.material.set_shader_parameter("gusts", w.packed)
	Flora.set_gusts(w.packed)
	grade.follow(atmosphere.grade_lo, atmosphere.grade_hi, atmosphere.grade_sat * (1.0 - _desat), atmosphere.contrast, atmosphere.vibrance)
	# the sky reads the hour from globals, which don't mark it dirty: nudge it
	# whenever the sun has moved enough to show in the reflections
	if absf(atmosphere.day - _sky_day) > 0.0015:
		_sky_day = atmosphere.day
		_sky_revision = fmod(_sky_revision + 1.0, 1000.0)
		sky_mat.set_shader_parameter("revision", _sky_revision)
	sun.directional_shadow_max_distance = camera.shadow_reach()

	hud.show_state(player, w, camera.view_index(), atmosphere.vignette)
	hud.show_sky(atmosphere.hour(), atmosphere.icon())
	_hold_sky(dt)
	hud.show_hull(player, discovered.size(), isles_total)
	hud.show_guns(player, gunnery)
	hud.show_ammo(player.ammo, stock)
	hud.show_hold(hold)
	hud.show_bars(world.ships, player, camera)
	if player.alive and (not _args.has("shot") or _args.has("discover")):
		_chart(player.pos)


## The wind comes round as the weather veers and backs it: sails, flags,
## smoke, plants and gusts all swing with it, and the streaks laid out along
## it (the sea's slicks and spume) swing about the view rather than the
## world's origin.
func _turn_wind() -> void:
	var w := world.wind
	var wa := atmosphere.wind_angle
	if wa == w.angle:
		return
	var c := camera.global_position
	var q := Vector2(c.x, c.z) - _wind_pivot
	var along := q.x * w.dir_x + q.y * w.dir_z
	var across := -q.x * w.dir_z + q.y * w.dir_x
	var nx := sin(wa)
	var nz := cos(wa)
	_wind_pivot = Vector2(c.x - (along * nx - across * nz), c.z - (along * nz + across * nx))
	w.set_angle(wa)
	RenderingServer.global_shader_parameter_set("wind_pivot", _wind_pivot)


## The swell comes round after the wind, slowly, turning about the view so
## the sea in sight keeps its shape instead of sliding past.
func _turn_swell(dt: float) -> void:
	var s := _swell + (atmosphere.wind_angle - _swell) * (1.0 - exp(-dt / 45.0))
	if absf(s - _swell) > 1e-6:
		_swell = s
		var c := camera.global_position
		world.waves.turn(s - _swell_base, c.x, c.z)


## Out on the high seas, or in among an archipelago's isles: the weather
## keeps each one's climate (the high seas fair and settled, Las Brumas
## misty and wet), and sailing out or in is announced.
func _seas() -> void:
	if not player.alive or _farewell != null:
		return
	var p := player.pos
	var near: Region = null
	var nd := INF
	for r in regions:
		var d := Vector2(r.centre.x - p.x, r.centre.z - p.z).length()
		if d < nd:
			nd = d
			near = r
	if not _high_seas and nd > HIGH_SEAS_R + 60.0:
		_high_seas = true
		atmosphere.climate = &"open"
		# the storm blows itself out behind you
		if atmosphere.kind == &"storm" or atmosphere.kind == &"rain":
			atmosphere.hasten(25.0)
		hud.toast("The high seas · Mar Sereno", "Open ocean, a fair trade wind and a long, easy swell", 5.0)
		sound.high_seas(true)
	elif _high_seas and nd < HIGH_SEAS_R - 60.0:
		_high_seas = false
		hud.toast(near.title, near.motto, 4.0)
		sound.high_seas(false)
		sound.chime()
	if not _high_seas:
		atmosphere.climate = &"mist" if near.id == "brumas" else &"home"
	# out in a sea-spark bloom on a dark night, the crew notice the sea lighting up
	var glow := atmosphere.sea_glow
	var bloom := atmosphere.bloom
	if glow > 0.5 and bloom > 0.4 and not _in_bloom:
		hud.toast("The sea is glowing", "A bloom of sea-sparks: every wake and breaking wave lights up blue", 4.5)
	_in_bloom = glow > 0.35 and bloom > (0.2 if _in_bloom else 0.4)


## The lanterns lit round the view after dark, the nearest ships' first, for
## the sea to mirror: their light pooled on the water under them and broken
## into glints on the ripples.
func _lamps() -> void:
	_lamp_list.clear()
	var on := MathX.smooth(0.05, 0.8, atmosphere.night)
	if on > 0.0:
		var t := camera.target
		var reach := camera.ground_radius() + 50.0
		var near: Array[Ship] = []
		for s in world.ships:
			if s.alive and s.model.visible and Vector2(s.pos.x - t.x, s.pos.z - t.z).length() < reach:
				near.append(s)
		near.sort_custom(func(a: Ship, b: Ship) -> bool:
			return Vector2(a.pos.x - t.x, a.pos.z - t.z).length_squared() < Vector2(b.pos.x - t.x, b.pos.z - t.z).length_squared())
		for s in near:
			var xf := s.model.global_transform
			for l in s.model.lamps:
				if _lamp_list.size() < Ocean.MAX_LAMPS:
					var at := xf * Vector3(l.x, l.y, l.z)
					_lamp_list.append(Vector4(at.x, at.y, at.z, on * l.w))
	ocean.set_lamps(_lamp_list)


## Rain, lightning and spindrift round the view; a strike's flash lights the
## sky, the sea round it and everything lit.
func _sky_fx(dt: float) -> void:
	var a := atmosphere
	var t := camera.target
	var cam_d := camera.distance()
	rain.update(a.rain, t, cam_d, ocean, camera.global_position)
	var st := lightning.update(dt, a.storm, t, camera)
	if st == null and _strike_now:
		st = lightning.strike(t, camera, true)
	_strike_now = false
	if st != null:
		_strikes += 1
		# its thunder comes in late, at the speed of sound
		var h := world.heard(Vector3(st.x, 0.0, st.z))
		sound.thunder(minf(1.0, (0.95 if st.bolt else 0.55) * st.power * maxf(h.x, 0.35)), h.y * 0.6, h.z)
		if st.bolt:
			# the strike point boils with light and steam
			world.fx.lightning(Vector3(st.x, world.water_height(st.x, st.z) + 1.0, st.z))
		# a sheet flash, far off, only faintly
		_strike = Vector4(st.x, st.z, 140.0 if st.bolt else 420.0, 1.0 if st.bolt else 0.22)
	a.flash = lightning.flash
	RenderingServer.global_shader_parameter_set("strike", Vector4(_strike.x, _strike.y, _strike.z, a.flash * _strike.w))
	# in a blow the wind tears the tops off the crests
	spindrift.update(MathX.smooth(0.25, 0.9, a.storm) + maxf(0.0, a.wind - 1.0) * 0.5, t, cam_d)


## The sea's sound round the listener: the wind and the surf with her way,
## the gusts and the weather; and the band for fair sailing among the
## islands (the open sea has its own theme, and a storm or her farewell rests it).
func _sound() -> void:
	var a := atmosphere
	var focus := _watched()
	sound.set_gust(world.gust_at(focus.pos.x, focus.pos.z))
	sound.set_sailing(clampf(player.speed / 14.0, 0.0, 1.0) if player.alive else 0.0)
	sound.set_weather(a.rain, a.storm, a.wind)
	sound.voyage_music(player.alive and _farewell == null and not _high_seas and a.storm < 0.45, a.night)


## A weather picked by hand lasts only as long as its time and place allow
## (a very hot noon only out on the high seas, at noon); a set piece's holds.
func _hold_sky(dt: float) -> void:
	_wx_check -= dt
	if _wx_check > 0.0:
		return
	_wx_check = 1.0
	var m := atmosphere.mode
	if m == &"auto" or _args.has("wx") or not player.alive or _farewell != null:
		return
	var need := atmosphere.needs(m, true)
	if need != "":
		atmosphere.set_mode(&"auto")
		_save_sky()
		hud.sky_say("%s has passed" % Atmosphere.WEATHER[m].name, need)


## The sky badge: its picture steps the weather on (auto, then each kind),
## its clock the hour (auto, dawn, noon, golden hour, dusk, night). A weather
## that can't be had here and now is shown with what it waits for but not
## set, and a tap soon after moves on past it.
func _on_sky_tap(clock: bool) -> void:
	var a := atmosphere
	if clock:
		var times: Array[StringName] = [&"auto", &"dawn", &"noon", &"golden", &"dusk", &"night"]
		var t := times[(times.find(a.time_mode) + 1) % times.size()]
		a.set_time_mode(t)
		hud.sky_say("Time · Auto" if t == &"auto" else str(Atmosphere.TIMES[t][0]))
		_save_sky()
		return
	var modes: Array[StringName] = [&"auto"]
	modes.append_array(Atmosphere.KINDS)
	var from := _refused if _refused != &"" and Time.get_ticks_msec() - _refused_at < 8000 else a.mode
	_refused = &""
	var m := modes[(modes.find(from) + 1) % modes.size()]
	var need := "" if m == &"auto" else a.needs(m)
	if need != "":
		_refused = m
		_refused_at = Time.get_ticks_msec()
		hud.sky_say(str(Atmosphere.WEATHER[m].name), need)
		return
	a.set_mode(m)
	hud.sky_say("Weather · Auto" if m == &"auto" else str(Atmosphere.WEATHER[m].name))
	_save_sky()


## Keeps the sky picked on the badge for the next voyage, and pins the badge.
func _save_sky() -> void:
	Settings.weather = str(atmosphere.mode)
	Settings.time = str(atmosphere.time_mode)
	Settings.save()
	hud.sky_pins(atmosphere.mode != &"auto", atmosphere.time_mode != &"auto")


## The ship the camera follows: yours, or a set piece's foe (--watch).
func _watched() -> Ship:
	return _foe if _foe != null and _args.has("watch") else player


## The helm and the canvas.
func _helm() -> void:
	if controls.sail_delta != 0:
		player.sail_target = clampf(roundf(player.sail_target * 3.0 + controls.sail_delta) / 3.0, 0.0, 1.0)
	if controls.steering:
		# the touch helm only steers: put the bow where the finger points
		player.rudder = clampf(MathX.angle_delta(player.heading, controls.steer_heading) * 2.4, -1.0, 1.0)
	else:
		player.rudder = controls.rudder


## The guns: a side called by its key or button, the one-button fire, a click
## on the sea (the side pointed into), and a set piece's eager gun crews.
func _guns() -> void:
	if not player.alive or _farewell != null:
		return
	if controls.ammo_pick >= 0:
		_pick_ammo(controls.ammo_pick)
	if controls.ammo_cycle:
		_cycle_ammo()
	if controls.fire_side != 0:
		_fire(controls.fire_side)
	if controls.fire_auto:
		_fire_auto()
	if controls.fire_aim:
		var hs := gunnery.hover_side()
		if hs != 0:
			_fire(hs)
		else:
			_fire_auto()
	if _args.has("autofire"):
		for st: Gunnery.Broadside in [gunnery.port, gunnery.starboard]:
			if st.ready and st.target != null:
				_fire(st.side)


func _fire(side: int) -> void:
	# a special the magazine has run out of: round shot, rather than guns left cold
	if stock[player.ammo] == 0:
		_pick_ammo(Ammo.ROUND, true)
	var shot := player.ammo
	if not gunnery.fire(player, side):
		hud.guns_deny(side)
		return
	for m: Dictionary in player.model.muzzles:
		if int(m.side) == side:
			voyage.shots += 1
	if shot != Ammo.ROUND:
		stock[shot] = maxi(0, stock[shot] - 1)
		if stock[shot] == 0:
			hud.toast("Last of the %s" % Ammo.NAME[shot].to_lower(), "Round shot loaded", 2.6)
			_pick_ammo(Ammo.ROUND, true)


## Loads a kind of shot for the next broadsides; the specials need some aboard.
func _pick_ammo(kind: int, quiet := false) -> void:
	if not player.alive or _farewell != null:
		return
	if stock[kind] == 0:
		hud.ammo_deny(kind)
		if not quiet:
			hud.toast("No %s left" % Ammo.NAME[kind].to_lower(), "Salvage, chests and new isles restock the magazine", 2.8)
		return
	var fresh := player.ammo != kind
	player.ammo = kind
	if not quiet:
		hud.ammo_loaded(kind)
		if fresh:
			sound.ammo_swap(kind)
	elif fresh:
		hud.show_ammo(kind, stock)


## R: the next kind of shot that's aboard.
func _cycle_ammo() -> void:
	for k in range(1, Ammo.COUNT + 1):
		var kind := (player.ammo + k) % Ammo.COUNT
		if stock[kind] != 0:
			_pick_ammo(kind)
			return


## Shot found in salvage: into the racks (each kind up to what they hold),
## a "+n" off its slot and a line of it rising off the find.
func _stock_ammo(add: Dictionary, at: Vector3) -> void:
	var line := ""
	for kind: int in Ammo.SPECIALS:
		var n: int = add.get(kind, 0)
		if n <= 0:
			continue
		var before := stock[kind]
		stock[kind] = mini(int(Ammo.MAX[kind]), before + n)
		var got := stock[kind] - before
		if got <= 0:
			continue
		hud.ammo_gain(kind, got)
		line += ("" if line.is_empty() else " · ") + "+%d %s" % [got, Ammo.SHORT[kind]]
	if not line.is_empty():
		hud.floater(line, at, camera, Floaters.Kind.AMMO, 22.0)


## Whether the hold has no room for what an item holds (it drifts on, and the
## hold says it's full).
func _refuse(it: Loot.Item) -> bool:
	if hold.would_keep(it.goods):
		return false
	_nag_hold()
	return true


## Salvage hauled aboard: it patches the hull, its shot goes into the racks
## and its goods into the hold, finest first; what it was rises off it, a
## chest in its rarity's light, and a fine find gets its own toast.
func _haul(it: Loot.Item) -> void:
	var p := player
	_hauled += 1
	p.hp = minf(p.max_hp, p.hp + it.heal * p.max_hp)
	var xz := world.loot.where(it)
	var at := Vector3(xz.x, 2.0, xz.y)
	_stock_ammo(Ammo.loot(it.tier), at)
	var res := hold.stow(it.goods)
	var tossed: PackedStringArray = res.tossed
	if not tossed.is_empty():
		_nag_hold(tossed.size())
	var kept := Array(res.kept as PackedStringArray)
	if kept.is_empty():
		return
	kept.sort_custom(func(a: String, b: String) -> bool:
		var ra := Treasure.rarity_of(a)
		var rb := Treasure.rarity_of(b)
		return ra > rb or (ra == rb and Treasure.price_of(a) > Treasure.price_of(b)))
	var best: String = kept[0]
	var more := " +%d" % (kept.size() - 1) if kept.size() > 1 else ""
	var good := Treasure.name_of(best)
	if it.tier == 0:
		hud.floater(good + more, at, camera, Floaters.Kind.LOOT)
		sound.coin()
		return
	var rarity: String = Treasure.RARITY_NAME[it.tier]
	if it.tier >= 2:
		voyage.note("chest", "%s chest" % rarity, ", ".join(kept.map(func(id: String) -> String: return Treasure.name_of(id))))
	var kinds := [Floaters.Kind.LOOT, Floaters.Kind.LOOT, Floaters.Kind.RARE, Floaters.Kind.EPIC, Floaters.Kind.LEGENDARY]
	hud.floater("%s chest: %s%s" % [rarity, good, more], at, camera, kinds[it.tier])
	world.fx.treasure(Vector3(xz.x, world.water_height(xz.x, xz.y), xz.y), Loot.GLOW[it.tier], it.tier)
	sound.treasure(it.tier)
	var r := Treasure.rarity_of(best)
	if r >= 2:
		hud.loot_toast(best, r, "%s plunder" % Treasure.RARITY_NAME[r], good, 3.8 if r == 4 else 3.0)
	if it.tier >= 3:
		camera.shake(0.22 if it.tier == 4 else 0.1)


## Says, now and then, that the hold is full and where to empty it.
func _nag_hold(tossed := 0) -> void:
	if _hold_nag > 0.0:
		return
	_hold_nag = 9.0
	var kicker := "Hold full · %d cheap %s over the side" % [tossed, "good" if tossed == 1 else "goods"] if tossed > 0 else "Hold full"
	hud.toast(kicker, "Sell at a trading port to make room", 3.4)


## The loaded side with a foe in its arc, else the side facing the nearest foe.
func _fire_auto() -> void:
	var side := gunnery.auto_side(player)
	if side == 0:
		side = 1 if player.can_fire(1) or not player.can_fire(-1) else -1
	_fire(side)


## Where on the sea the mouse points (null for touch, or off the water).
func _pointer_on_sea() -> Variant:
	if not controls.pointer_active:
		return null
	var o := camera.project_ray_origin(controls.pointer)
	var d := camera.project_ray_normal(controls.pointer)
	if d.y > -0.02:
		return null
	return o + d * (-o.y / d.y)


func _on_hit(ship: Ship, attacker: Ship, dealt: float, at: Vector3) -> void:
	if dealt <= 0.0:
		return
	if attacker == player and ship != player:
		if player.alive:
			voyage.hits += 1
			voyage.dealt += dealt
		hud.floater(str(roundi(dealt)), at, camera)
	if ship == player:
		if player.alive:
			voyage.taken += dealt
		hud.floater("-%d" % roundi(dealt), at, camera, Floaters.Kind.BAD)
		camera.shake(0.28)


func _on_sunk(ship: Ship, attacker: Ship) -> void:
	if ship == player:
		_begin_farewell(attacker)
		return
	# what she carried comes up out of the wreck: the bigger the hull, the more
	# and the finer, and a galleon always gives up a fine chest
	var luck: float = {"sloop": 0.0, "brig": 0.3, "galleon": 0.6}.get(ship.cls.id, 0.0)
	world.loot.drop(ship.pos.x, ship.pos.z, 3 + int(ship.cls.length / 8.0), luck, ship.cls.id == "galleon")


## A bite of the flames burning a ship (fire shot): the damage ticks up off
## her deck in amber, yours or hers.
func _on_burned(ship: Ship, attacker: Ship, dealt: float) -> void:
	if dealt <= 0.0:
		return
	var p := player
	if attacker == p and ship != p and p.alive:
		voyage.dealt += dealt
	if attacker == p or ship == p:
		var at := Vector3(ship.pos.x, ship.position.y + ship.cls.freeboard + 2.0, ship.pos.z)
		hud.floater(("-%d" if ship == p else "%d") % roundi(dealt), at, camera, Floaters.Kind.BURN)


## A special shot left its mark: said over the ship, once for each fresh effect.
func _on_status(ship: Ship, what: String, attacker: Ship) -> void:
	var p := player
	if attacker != p and ship != p:
		return
	var mine := ship == p
	var top := float(ship.cls.masts[0].height) if not ship.cls.masts.is_empty() else 10.0
	var at := Vector3(ship.pos.x, ship.position.y + top * 0.45 + 3.0, ship.pos.z)
	match what:
		"ablaze":
			hud.floater("We're ablaze!" if mine else "Ablaze!", at, camera, Floaters.Kind.ABLAZE, 18.0)
		"shredded":
			hud.floater("Sails shredded!" if mine else "Sails shredded", at, camera, Floaters.Kind.SHREDDED, 18.0)
		"crew":
			hud.floater("Gun crews cut down!" if mine else "Crews cut down", at, camera, Floaters.Kind.CREW, 18.0)


func _on_bounty(ship: Ship, gold: int) -> void:
	hud.toast("+%d gold bounty" % gold, "%s sunk" % ship.ship_name, 3.6)
	sound.coin()
	voyage.note("kill", "Sank the %s" % ship.ship_name, "%s · +%d gold" % [ship.cls.name, gold])


## She's going down: the blow lands in slow motion, the HUD steps aside and
## the camera takes its long last look before the farewell.
func _begin_farewell(attacker: Ship) -> void:
	if _farewell != null:
		return
	var p := player
	# your own ship founders in moments rather than lingering as a hulk
	p.wreck_life = 3.0
	p.founders = true
	var f := Farewell.new()
	var d := camera.global_position - p.pos
	var dist := maxf(d.length(), 1.0)
	f.az = atan2(d.x, d.z)
	f.elev = asin(clampf(d.y / dist, 0.1, 0.99))
	f.dist = clampf(dist, 40.0, 320.0)
	f.report = _report(attacker)
	f.deep = float(f.report.fathoms) * 1.8288 > 7.0
	if _args.has("farewell"):
		f.t = float(_args.farewell)
	_farewell = f
	time_scale = 0.22
	camera.shake(0.95)
	sound.founder()
	wreck.begin(f.report)


## What the farewell tells of her: who, how long, the tally, and how she went.
func _report(attacker: Ship) -> Dictionary:
	var p := player
	var foe: Ship = attacker if attacker != null and attacker != p else null
	if foe == null and is_instance_valid(p.last_attacker) and p.last_attacker != p and world.time - p.last_hit < 20.0:
		foe = p.last_attacker
	var cause := p.last_cause
	if foe == null:
		cause = "aground"
	var near := ""
	var near_d := 520.0
	for r in regions:
		for isl: Dictionary in r.islands:
			var dd := Vector2(float(isl.x) - p.pos.x, float(isl.z) - p.pos.z).length() - float(isl.r)
			if dd < near_d:
				near_d = dd
				near = ("on the shoals of %s" if dd < 60.0 else "off %s") % isl.name
	return {
		"ship": p.ship_name, "cls": p.cls.id, "cls_name": p.cls.name,
		"time": voyage.time, "gold": p.gold, "kills": p.kills,
		"isles": discovered.size(), "isles_total": isles_total,
		"shots": voyage.shots, "hits": voyage.hits, "dealt": roundi(voyage.dealt), "taken": roundi(voyage.taken),
		"miles": voyage.metres / 1852.0, "cause": cause,
		"killer": foe.ship_name if foe != null else "",
		"killer_cls": foe.cls.id if foe != null else "",
		"where": near,
		"fathoms": maxf(0.0, (world.water_height(p.pos.x, p.pos.z) - world.ground_height(p.pos.x, p.pos.z)) / 1.8288),
		"events": voyage.events.duplicate(),
	}


## The farewell: slow motion easing back, the camera's lowering orbit round
## the wreck and its dive for the water where she went down, the frame greyed
## for the blow and then drowned, and the card once she's gone.
func _farewell_step(real_dt: float) -> void:
	var f := _farewell
	var p := player
	f.t += real_dt
	var t := f.t
	time_scale = lerpf(0.22, 1.0, MathX.smooth(0.4, 2.8, t))
	if f.hud and t > 0.9:
		f.hud = false
		hud.fade(false)
	var c := p.pos
	var L := p.cls.length
	var settle := MathX.smooth(0.0, 7.5, t)
	var dive := MathX.smooth(DIVE - 0.4, DIVE + 2.2, t)
	var dist := lerpf(lerpf(f.dist, L * 1.25 + 30.0, settle), L * 0.7 + 14.0, dive)
	var elev := lerpf(lerpf(f.elev, 0.3, settle), 0.07, dive)
	var az := f.az + t * 0.07 * MathX.smooth(0.0, 2.5, t)
	var cp := Vector3(c.x + sin(az) * cos(elev) * dist, sin(elev) * dist + 1.5, c.z + cos(az) * cos(elev) * dist)
	cp.y = maxf(cp.y, world.water_height(cp.x, cp.z) + 1.6)
	camera.cine_pos = cp
	camera.cine_look = Vector3(c.x, lerpf(lerpf(4.0, L * 0.3, settle), -6.0, dive), c.z)
	camera.cine_fov = lerpf(lerpf(34.0, 29.0, settle), 44.0, dive)
	camera.cine_w = MathX.smooth(0.0, 2.6, t)
	var water := MathX.smooth(DIVE + 0.4, DIVE + 2.1, t)
	_desat = 0.55 * MathX.smooth(0.0, 0.6, t) * (1.0 - water)
	wreck.water(water)
	# the final plunge: her timbers groan and she goes by the stern
	if not f.plunged and p.sink_t > p.wreck_life:
		f.plunged = true
		sound.groan()
		camera.shake(0.3)
	# her last breath of air bursts up as she slips under, and tears loose what
	# was lashed down: timber floats up past her, the heavy stuff goes down with her
	if not f.dived and t > DIVE:
		f.dived = true
		var y := world.water_height(c.x, c.z)
		for i in 3:
			var a := randf() * TAU
			var r := randf() * p.cls.beam
			world.fx.splash(Vector3(c.x + cos(a) * r, y, c.z + sin(a) * r), randf_range(1.1, 1.7))
		world.wake.stamp(c.x, c.z, L * 0.5, 1.0, true)
		world.wake.push(c.x, c.z, L * 0.4, -1.0)
		# the water closes over the lens: the world above goes dull and distant
		sound.submerge(true)
		if f.deep:
			var timber: Array[Color] = [Color(0.42, 0.29, 0.18).linear_to_srgb(), Color(0.55, 0.4, 0.26).linear_to_srgb(), Color(0.33, 0.24, 0.16).linear_to_srgb()]
			world.debris.drown(Vector3(c.x, minf(p.position.y + p.cls.freeboard, y - 1.5), c.z), 7, timber)
	# she settles onto the sand with a muffled thud through her hull
	var rested := p.dmg.rest_t >= 0.0
	if rested and f.rest < 0.0:
		f.rest = t
		if f.deep:
			sound.thud(0.9, 0.0, 0.0)
			camera.shake(0.25)
	if f.deep and t > DIVE - 1.0:
		_wreck_air(p, real_dt * time_scale, t - f.rest if rested else -1.0)
	# in deep water a gauge in the letterbox counts her down to the sand
	if f.deep and t > DIVE - 0.5:
		var fm := roundi(maxf(0.0, (world.water_height(c.x, c.z) - p.position.y) / 1.8288))
		if fm != f.fathoms:
			f.fathoms = fm
			wreck.depth(fm, p.dmg.rest_t >= 0.0)
	if not f.shown and (t > DIVE + 2.0 or (f.skip and t > DIVE)):
		f.shown = true
		wreck.show_card(f.report)


## Trapped air breaking out of her in great gulps as she goes down, choking
## off slowly once she lies on the sand (`since_rest` s, -1 still sinking).
func _wreck_air(p: Ship, dt: float, since_rest: float) -> void:
	var f := _farewell
	var life := 1.0 if since_rest < 0.0 else exp(-since_rest * 0.16)
	f.burst -= dt
	if f.burst > 0.0 or life <= 0.06:
		return
	f.burst = randf_range(0.45, 1.45) if since_rest < 0.0 else randf_range(1.6, 4.4) / life
	var L := p.cls.length
	var at := p.global_transform * Vector3(randf_range(-0.3, 0.3) * p.cls.beam, p.cls.freeboard * randf_range(0.3, 0.9), randf_range(-0.4, 0.4) * L)
	if at.y < world.water_height(at.x, at.z) - 1.5:
		var h := world.heard(at)
		sound.air_pocket(randf_range(0.8, 1.6) * (0.45 + life * 0.55), maxf(h.x, 0.5), h.y)


## A tap: straight to the plunge; once there, straight to the farewell card.
func _skip() -> void:
	var f := _farewell
	if f.shown:
		return
	if f.t < DIVE - 0.4:
		f.t = DIVE - 0.4
	else:
		f.skip = true
	wreck.skipped()


## A fresh voyage: a new ship out of the home port, the sea cleared.
func _sail_again() -> void:
	# back up into the air; the open sea's theme dies away as she sets out from home
	sound.click()
	sound.submerge(false)
	sound.high_seas(false)
	wreck.end()
	_farewell = null
	time_scale = 1.0
	_desat = 0.0
	camera.cine_w = 0.0
	pirates.clear(null)
	world.ships.clear()
	crew.clear()
	world.shots.clear()
	world.fx.clear()
	world.debris.clear()
	world.loot.clear()
	discovered.clear()
	voyage = Voyage.new()
	_foe = null
	_sink_at = -1.0
	_foe_sink_at = -1.0
	_build_player()
	world.ships.append(player)
	player.struck.connect(func(a: float) -> void: camera.shake(a))
	camera.snap_to(player.pos)
	hud.watch_hold(hold)
	hud.reset()


## An island goes on the chart the first time she sails within hail of it.
func _chart(p: Vector3) -> void:
	var r := world.region_at(p.x, p.z)
	if r == null:
		return
	for isl: Dictionary in r.islands:
		if Vector2(float(isl.x) - p.x, float(isl.z) - p.z).length() >= float(isl.r) + 70.0:
			continue
		var key := "%s/%d" % [r.id, int(isl.id)]
		if not discovered.has(key):
			discovered[key] = true
			# the islanders pay for the chart
			var reward := 40 + roundi(float(isl.r) * 0.4)
			player.gold += reward
			voyage.note("isle", "Charted %s" % isl.name, "+%d gold" % reward)
			hud.toast("Island discovered · +%d gold" % reward, isl.name, 3.6)
			sound.chime()


## "x,y,z" from the command line.
static func _vec3(s: String) -> Vector3:
	var p := s.split(",")
	return Vector3(float(p[0]), float(p[1]) if p.size() > 1 else 0.0, float(p[2]) if p.size() > 2 else 0.0)


func _save_shot(path: String) -> void:
	set_process(false)
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(path)
	print("SHOT ", path, " ship ", player.pos, " camera ", camera.global_position)
	# what the frame cost: triangles and draw calls, seen and in the shadow map
	var vp := get_viewport()
	var seen := Viewport.RENDER_INFO_TYPE_VISIBLE
	var shade := Viewport.RENDER_INFO_TYPE_SHADOW
	print("DRAWN %d triangles in %d draws, shadows %d triangles in %d draws" % [
		vp.get_render_info(seen, Viewport.RENDER_INFO_PRIMITIVES_IN_FRAME), vp.get_render_info(seen, Viewport.RENDER_INFO_DRAW_CALLS_IN_FRAME),
		vp.get_render_info(shade, Viewport.RENDER_INFO_PRIMITIVES_IN_FRAME), vp.get_render_info(shade, Viewport.RENDER_INFO_DRAW_CALLS_IN_FRAME)])
	var cut := crew.view.stats()
	print("CREW drawn %d near, %d far, %d distant, %d specks in %d draws" % [cut[0], cut[1], cut[2], cut[3], cut[4]])
	get_tree().quit()
