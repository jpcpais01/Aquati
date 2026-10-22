extends Node3D
## The voyage: the sea, the sky and the light, the islands, your ship and the
## pirates out there, the camera that follows her, the helm, the guns and the
## HUD; and when she goes down, her farewell.
##
## Command-line (after --): --smoke runs a few seconds and prints SMOKE OK
## (--smoke-at N: after N frames; --again N sails again off the farewell
## card at frame N);
## --shot PATH saves a frame and quits, with --hour H, --view N (0 close ..
## 3 leaned over) or --zoom Z (0..1) and --tilt T (0..1), --frames N to let
## it settle first, --heading R and --at X,Z to start somewhere else,
## --ship CLASS and --livery ID to sail another hull with --sails N (0..3)
## of canvas set (--anchor holds her there), --wind A for the breeze's
## heading, and --discover to chart the islands nearby as play does.
## A fight: --battle CLASS puts a pirate of that class off your port beam,
## spoiling for it (--foe-dist M or --foe-at X,Z,HEADING to place her, --foe-hp F for the
## share of her hull left), --autofire looses each side the moment it bears,
## --sink S sends your ship down S seconds in (her farewell; --farewell T
## starts it T seconds through), --touch shows
## the touch controls, --nopirates keeps the sea clear, --voyage puts a long
## voyage behind her (to see a full farewell).

const WIND_ANGLE := 0.6
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
var collisions := Collisions.new()
var wreck: WreckScreen

## The islands charted this voyage ("region/island"), of how many.
var discovered := {}
var isles_total := 0
## This voyage's log, for the farewell.
var voyage := Voyage.new()
## The sea's clock against the wall's: slowed for the blow that sinks her.
var time_scale := 1.0

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


func _ready() -> void:
	_args = _parse_args()
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
	hud.view_pressed.connect(func() -> void: camera.next_view())
	hud.fire_pressed.connect(func(side: int) -> void:
		if side == 0:
			controls.fire_auto = true
		else:
			controls.fire_side = side)
	add_child(hud)
	wreck = WreckScreen.new()
	wreck.touch = _args.has("touch")
	wreck.retry.connect(_sail_again)
	add_child(wreck)
	world.hit.connect(_on_hit)
	world.sunk.connect(_on_sunk)
	world.shook.connect(func(a: float) -> void: camera.shake(a))
	gunnery.loaded.connect(func(side: int) -> void: hud.guns_ready(side))
	pirates.bounty.connect(_on_bounty)
	if _args.has("touch"):
		hud.show_touch(true)
	if _args.has("hour"):
		atmosphere.set_hour(float(_args.hour))
	if _args.has("shot"):
		atmosphere.running = false
		hud.visible = not _args.has("nohud")
	if _args.has("battle"):
		_stage_battle(str(_args.battle))
	if _args.has("sink"):
		_sink_at = float(_args.sink)
	if _args.has("voyage"):
		_stage_voyage()
	# one settled frame before anything draws
	_tick(0.0)
	camera.snap_to(player.pos)


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


func _build_environment() -> void:
	sky_mat = ShaderMaterial.new()
	sky_mat.shader = preload("res://shaders/sky.gdshader")
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
	world.wind = Wind.new(float(_args.get("wind", WIND_ANGLE)))
	world.waves = Waves.new(WIND_ANGLE)
	world.wake = WakeField.new()
	world.wake.name = "Wake"
	add_child(world.wake)
	world.fx = Particles.new()
	world.fx.name = "Particles"
	add_child(world.fx)
	ocean = Ocean.new()
	ocean.name = "Ocean"
	add_child(ocean)
	ocean.setup(world.waves, world.wind, world.wake)
	ocean.visible = not _args.has("noocean")


func _build_islands() -> void:
	regions = Region.load_all()
	world.regions = regions
	for r in regions:
		isles_total += r.islands.size()
		var g := Ground.new()
		g.build(r, Settings.quality == Settings.Quality.LOW)
		add_child(g)
		grounds.append(g)
		var f := Flora.new()
		f.build(r)
		f.visible = not _args.has("noflora")
		add_child(f)
		floras.append(f)


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


func _process(delta: float) -> void:
	_tick(minf(delta, 0.1))
	_frames += 1
	if _args.has("again") and _frames == int(_args.again) and _farewell != null and _farewell.shown:
		wreck.retry.emit()
	if _args.has("smoke") and _frames == int(_args.get("smoke-at", 300)):
		var isles := 0
		var plants := 0
		for i in regions.size():
			isles += regions[i].islands.size()
			plants += floras[i].plants
		var lost := "" if _farewell == null else "; lost %.1f s ago%s" % [_farewell.t, ", the farewell card up" if _farewell.shown else ""]
		if _args.has("again") and _farewell == null and _frames > int(_args.again):
			lost = "; sailing again, the HUD %s" % ("up" if hud.get_node("Root").visible else "hidden")
		print("SMOKE OK: %d frames, %.0f m sailed, %d triangles in the sloop, %d islands, %d plants; %d ships afloat, %d guns fired, %d hits, %d hulls on the slipway%s" % [
				_frames, player.pos.length(), player.model.triangles(), isles, plants, world.ships.size(), voyage.shots, voyage.hits, shipyard.stock(), lost])
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

	# the air and the water
	_pick_region(camera.target.x, camera.target.z)
	atmosphere.update(dt)
	var w := world.wind
	w.strength = atmosphere.wind
	w.update(dt, camera.target.x, camera.target.z, camera.ground_radius())
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
	controls.consume()

	world.listener = camera.target
	world.listener_zoom = camera.distance()
	if _farewell != null:
		_farewell_step(real_dt)
	camera.update_rig(real_dt, player.pos, player.vel, world.time)
	ocean.follow(camera.target, camera.distance())
	world.wake.step(camera.target.x, camera.target.z, dt)

	# the light
	atmosphere.apply(sun, env)
	RenderingServer.global_shader_parameter_set("wind", Vector4(w.dir_x, w.dir_z, w.strength, 0.0))
	RenderingServer.global_shader_parameter_set("wind_drift", w.drift)
	# the surf: breaker height and run-up from the breeze (the web's setSurf);
	# its clock wraps on a whole number of breakers
	RenderingServer.global_shader_parameter_set("surf", Vector4(0.3 + w.strength * 0.06, 0.26 + w.strength * 0.05, 0.0, fmod(world.time, 7000.0)))
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

	hud.show_state(player, w, atmosphere.hour(), camera.view_index(), atmosphere.vignette)
	hud.show_hull(player, discovered.size(), isles_total)
	hud.show_guns(player, gunnery)
	hud.show_bars(world.ships, player, camera)
	if player.alive and (not _args.has("shot") or _args.has("discover")):
		_chart(player.pos)


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
	if not gunnery.fire(player, side):
		hud.guns_deny(side)
		return
	for m: Dictionary in player.model.muzzles:
		if int(m.side) == side:
			voyage.shots += 1


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


func _on_bounty(ship: Ship, gold: int) -> void:
	hud.toast("+%d gold bounty" % gold, "%s sunk" % ship.ship_name, 3.6)
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
	# in deep water a gauge in the letterbox counts her down to the sand
	if f.deep and t > DIVE - 0.5:
		var fm := roundi(maxf(0.0, (world.water_height(c.x, c.z) - p.position.y) / 1.8288))
		if fm != f.fathoms:
			f.fathoms = fm
			wreck.depth(fm, p.dmg.rest_t >= 0.0)
	if not f.shown and (t > DIVE + 2.0 or (f.skip and t > DIVE)):
		f.shown = true
		wreck.show_card(f.report)


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
	wreck.end()
	_farewell = null
	time_scale = 1.0
	_desat = 0.0
	camera.cine_w = 0.0
	pirates.clear(null)
	world.ships.clear()
	world.shots.clear()
	world.fx.clear()
	discovered.clear()
	voyage = Voyage.new()
	_foe = null
	_sink_at = -1.0
	_build_player()
	world.ships.append(player)
	player.struck.connect(func(a: float) -> void: camera.shake(a))
	camera.snap_to(player.pos)
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
	get_tree().quit()
