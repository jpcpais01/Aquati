extends Node3D
## The voyage: the sea, the sky and the light, the islands, your ship, the
## camera that follows her, the helm and the HUD.
##
## Command-line (after --): --smoke runs a few seconds and prints SMOKE OK;
## --shot PATH saves a frame and quits, with --hour H, --view N (0 close ..
## 3 leaned over) or --zoom Z (0..1) and --tilt T (0..1), --frames N to let
## it settle first, --heading R and --at X,Z to start somewhere else,
## --ship CLASS and --livery ID to sail another hull with --sails N (0..3)
## of canvas set (--anchor holds her there), --wind A for the breeze's
## heading, and --discover to chart the islands nearby as play does.

const WIND_ANGLE := 0.6
## Where a voyage starts: out of the home port on a reach, bow to the open
## water between the atoll and Morro Huracão (the web's spawn and heading).
const SPAWN := Vector2(40.0, 210.0)
const SPAWN_HEADING := PI * 0.82

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

## The islands charted this voyage ("region/island").
var discovered := {}

var _args := {}
var _frames := 0
var _sky_day := -1.0
var _sky_revision := 0.0


func _ready() -> void:
	_args = _parse_args()
	_build_environment()
	_build_sea()
	_build_islands()
	_build_player()
	_build_camera()
	controls = Controls.new()
	add_child(controls)
	hud = Hud.new()
	hud.controls = controls
	hud.sail_set.connect(func(n: int) -> void: player.sail_target = n / 3.0)
	hud.view_pressed.connect(func() -> void: camera.next_view())
	add_child(hud)
	if _args.has("hour"):
		atmosphere.set_hour(float(_args.hour))
	if _args.has("shot"):
		atmosphere.running = false
		hud.visible = not _args.has("nohud")
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


func _process(delta: float) -> void:
	_tick(minf(delta, 0.1))
	_frames += 1
	if _args.has("smoke") and _frames == 300:
		var isles := 0
		var plants := 0
		for i in regions.size():
			isles += regions[i].islands.size()
			plants += floras[i].plants
		print("SMOKE OK: %d frames, %.0f m sailed, %d triangles in the sloop, %d islands, %d plants" % [_frames, player.pos.length(), player.model.triangles(), isles, plants])
	if _args.has("shot") and _frames >= int(_args.get("frames", 90)):
		_save_shot(str(_args.shot))


func _tick(dt: float) -> void:
	world.time += dt
	# the helm and the canvas
	controls.poll()
	if controls.sail_delta != 0:
		player.sail_target = clampf(roundf(player.sail_target * 3.0 + controls.sail_delta) / 3.0, 0.0, 1.0)
	if controls.steering:
		# the touch helm only steers: put the bow where the finger points
		player.rudder = clampf(MathX.angle_delta(player.heading, controls.steer_heading) * 2.4, -1.0, 1.0)
	else:
		player.rudder = controls.rudder
	if controls.zoom != 0.0:
		camera.zoom_by(controls.zoom, world.time)
	if controls.view_next:
		camera.next_view()
	controls.consume()

	# the air and the water
	_pick_region(camera.target.x, camera.target.z)
	atmosphere.update(dt)
	var w := world.wind
	w.strength = atmosphere.wind
	w.update(dt, camera.target.x, camera.target.z, camera.ground_radius())
	world.waves.advance(dt)
	player.step(dt)
	camera.update_rig(dt, player.pos, player.vel, world.time)
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
	grade.follow(atmosphere.grade_lo, atmosphere.grade_hi, atmosphere.grade_sat, atmosphere.contrast, atmosphere.vibrance)
	# the sky reads the hour from globals, which don't mark it dirty: nudge it
	# whenever the sun has moved enough to show in the reflections
	if absf(atmosphere.day - _sky_day) > 0.0015:
		_sky_day = atmosphere.day
		_sky_revision = fmod(_sky_revision + 1.0, 1000.0)
		sky_mat.set_shader_parameter("revision", _sky_revision)
	sun.directional_shadow_max_distance = camera.shadow_reach()

	hud.show_state(player, w, atmosphere.hour(), camera.view_index(), atmosphere.vignette)
	if not _args.has("shot") or _args.has("discover"):
		_chart(player.pos)


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
			hud.toast("Island discovered", isl.name, 3.6)


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
