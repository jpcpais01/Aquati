extends Node3D
## The game: the harbour where you choose your ship and weigh anchor, and the
## voyage: the sea, the sky and the light, the islands, your ship and the
## pirates out there, the camera that follows her, the helm, the guns and the
## HUD; the voyage paused, Settings, and when she goes down, her farewell.
## What lasts between voyages is kept by Progress; the back button (Android's,
## or Esc) closes whatever is on top.
##
## Command-line (after --): --smoke runs a few seconds and prints SMOKE OK
## (--smoke-at N: after N frames; --again N sails again off the farewell
## card at frame N, --newship N chooses a new ship off it, back to the
## harbour); starting in the harbour it first walks the menus (a
## ship picked, Set Sail for Las Brumas, paused there, Settings opened and
## closed, back to the harbour; a turn at the Shipwright (the Sails tab, a
## famous ship's colours, the brush on her flag, a design saved and deleted,
## oak strakes fitted on the Refit tab and her hull rebuilt with them, Done);
## Set Sail for the home waters, paused and
## resumed with the back button; the sea chart opened off the minimap, a pin
## dropped on it, "Sail there" and the helmsman setting a course, the chart
## closing itself; opened again, the pin's card, "Lift pin", the chart closed
## with the back button; then a market, a part bought from its shipwright
## among the rest) and says what it saw in SMOKE MENU.
## The loading screen for a shot: --loading holds it up (--load-times prints
## how long each piece of the world took to build).
## The menus for a shot: --menu opens in the harbour (--orbit A sets how far
## round her the camera has come), --seapick on the sea picker, --pause puts
## the voyage on hold, --settings opens Settings (over the harbour, or with
## --pause over the paused voyage), --shipwright TAB opens the Shipwright on
## a tab (flag, sails, hull, refit or presets) with --paint the brush out and
## a stroke across her flag, --any-colour the colour picker up, or --refit
## SLOT (or a part's id, or SLOT:standard) a part picked on the Refit tab;
## the parts: --parts all|none|ID,ID fills (or empties) the locker, --fit
## ID,ID|none bolts them on, --purse G puts G gold in the purse; it opens at
## the home port's quay, where --port-eye X,Y,Z and --port-look X,Y,Z stand
## the lens in the port's own frame (+x along the quay toward the tavern,
## +z out to sea, the quay's boards 1.8 m up) instead of the tab's shot.
## Her look: --colours N dresses her in the N-th famous colours (0 .. 7),
## --colours random in a surprise (--seed S), and --name NAME christens her.
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
## Event ships: --ship revenant sails the Hollow Jack, --events on|off holds
## the season open or shut, --phantom N calls her Phantom Run N frames (40)
## before the shot and --wail N has her Banshee's Wail N frames old at it.
## A port: --dock K ties her up at the K-th market (0 .. 5) with its market
## open (with --hold, goods to sell; --sell ID, or all, sells it just
## before the frame; --wright scrolls to the shipwright's counter, and
## --buy N buys its N-th part just before the frame); --off K puts her off
## its quay, the prompt to come alongside up. --find ID finds a part a
## second before the frame (its toast up).
## Shot and plunder: --ammo ID loads a kind of shot (round, shell, fire,
## chain, grape) and --foe-ammo ID has the set piece's foe fire nothing
## else; --loot N[,TIER] floats N barrels or chests (of a tier, 0..4) round
## her, --hold fills the hold with a little of everything, --peek opens its
## peek and --pie the touch shot pie (--pie ID: held, a finger on that kind).
## Fireworks: --rockets ID fills the locker and loads that kind (peony ..
## fortune), --volley looses rockets off each side the moment it's loaded,
## --locker opens the firework locker a second before the frame, --pyro
## scrolls a docked market (--dock K) to the pyrotechnist's stall, and
## --buy-rocket N buys its N-th rocket just before the frame.
## Crews: --eye X,Y,Z puts the lens at that point in the followed ship's own
## frame (+z her bow, +x her port side), looking at her deck amidships or at
## --look X,Y,Z (it stays put once she's going down); --nocrew leaves every
## deck empty.
## The maps: --pins DX,DZ;DX,DZ.. drops waypoints that far east and south of
## her; --chart opens the sea chart on her (--chart-at X,Z and --chart-zoom Z
## to look elsewhere, --chart-tap DX,DZ to tap the chart that far off her).
## The helmsman: --sail-to DX,DZ (or port:K, isle:REGION/ID) gives him the
## wheel for a waypoint that far off her (the K-th market, an isle) at the
## start, the chart left shut unless --chart is asked for too.
## --phone [DP] plays as a phone DP (412) dp across would at MEDIUM: the
## lean path, its plants and crews sized for that screen (with --touch for
## its controls).

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
## The steps of the smoke test's tour of the menus (_tour_menus).
const TOUR_STEPS := 33
## Frames the tour waits off a quay for pirates to leave her be.
const TOUR_CHASED := 240

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
## The trading ports, and the one she's tied up at (null at sea).
var ports: TradePorts
## Puerto Marézia, the home port, where the Shipwright works on her.
var home: HomePort
## The waypoints on the sea chart, raised in the world as pillars of light.
var pins: Waypoints
## What the minimap and the sea chart show.
var maps := MapScene.new()
## The sea chart, and its geography and engravings.
var chart: SeaChart
var chart_art: ChartArt
## The helmsman: sails her to a place picked on the chart.
var helm: Helmsman
## The sea's dangers (maelstroms, reefs), and her watch on them: what the
## pill says, the dangers already named, the bell's rest, who was last called out.
var hazards: Hazards
var _hz_state := ""
var _hz_seen := {}
var _hz_bell := 0.0
var _hz_called := {}
## Her look from the Shipwright: her livery dressed in it, her flag drawn.
var outfitter: Outfitter
## The Shipwright, at the home port's quay; and its camera: what the open
## tab is about ("flag", "sails", "hull" or "overview"), swung round her by
## a drag (radians from the shot's own angle) and in or out by a pinch, the
## side of her it stands off (the sea's) and which face of her flag it
## sees, and its clock (the shot sways a little).
var shipwright: Shipwright
var _sw_focus := "flag"
var _sw_az := 0.0
var _sw_zoom := 1.0
var _sw_side := 1.0
var _sw_face := 1.0
var _sw_t := 0.0
## How far through its turn at the Shipwright the smoke test is (_tour_wright).
var _sw_tour := 0
## The Treasure Vault (the web's vault): its screen, its chest out on the sea
## beside her, the camera's shot of them (home, charge, burst, cards, ship,
## guns), what the showcase has her try on ("" nothing), its clock and the
## next showcase broadside, the ten-pulls' bonus parts (told when it
## closes), whether it opened over the Shipwright, and the smoke test's turn.
var vault: VaultScreen
var vstage: VaultStage
var _v_shot := "home"
var _v_show := ""
var _v_t := 0.0
var _v_fire := 0.0
var _v_finds: Array[Dictionary] = []
var _v_wright := false
var _v_tour := 0
## How far a shot of the vault has got (_drive_vault).
var _v_drive := 0
var dock_port: TradePort
## Ashore: the islands underfoot, the landing party and their boat.
var shore_ground: ShoreGround
var shore: Shore
## The Phantom Run has been explained this sitting (_say_power_once).
var _power_told := false
var _steer := Shore.Steer.new()
## Afloat: no one's hand on the captain.
var _idle_steer := Shore.Steer.new()
## The beach she could put a boat on now (ShoreGround.landing; checked a few times a second).
var _landing := {}
var _land_t := 0.0
## What the prompt pill would do if tapped: "dock", "land", "boat" or "".
var _prompt_kind := ""
## The zoom she had at sea, given back when the boat pulls out again.
var _sea_zoom := 0.45
var _shore_tip := false
## Pulses from the touch Strike and Pistol.
var _hud_strike := false
var _hud_pistol := false
## A set piece's (or the smoke tour's) hand on the stick ashore.
var _auto_walk := Vector2.ZERO
## A set piece's sword arm ashore (`--brawl`): at the nearest cutthroat, and
## with `--plunder` on to the chest once they're routed.
var _brawl := false
var _plunder := false
var _tour_walk_from := Vector2.ZERO
var market: MarketPanel
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
## The kind of firework loaded out of the locker (Progress.fireworks), and
## whether tonight's tip on lighting them has been given.
var _fw_type := "peony"
var _fw_tip := false
## The ship's hold.
var hold: Treasure.Hold

var _args := {}
var _frames := 0
## The loading screen while the world goes up (null once it has lifted), and
## whether the world is all built.
var loading: LoadingScreen
var _ready_to_play := false
var _load_us := 0
## What the loading's workers hand back (the archipelagos, her first hull,
## the sea's grid).
var _boot_regions: Array[Region] = []
var _boot_model: ShipModel
var _boot_grid: ArrayMesh
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

## Where the game is: in the harbour choosing a ship, or out on a voyage.
enum State { HARBOUR, VOYAGE, DOCKED }
var state := State.VOYAGE
## The keys were shown this run (a computer's first voyage).
var _keys_told := false
## The voyage on hold (Anchored): nothing at sea moves.
var paused := false
var harbour: Harbour
var sea_pick: SeaPick
var pause_screen: PauseScreen
var settings_sheet: SettingsSheet
## The game's own updates from its GitHub releases, and their card.
var updater: Updater
var update_card: UpdateCard
## The card has come up by itself this run (it does once).
var _update_shown := false
var veil: Veil
var fps_meter: FpsMeter
## A ship picked on the harbour's picker, waiting on the yard for her hull.
var _picked_ship := ""
## The frame the back button was last taken in: one press may come in twice.
var _back_frame := -10
## The smoke test's tour of the menus (_tour_menus): on, how far through,
## the frame its last step was taken, and what it saw.
var _tour := false
var _tour_step := 0
var _tour_at := 0
var _tour_log := PackedStringArray()
## The pins on the chart before the tour tapped it.
var _tour_pins := 0
## What the chart's card is open over ({} none): the place (a Helmsman.Target),
## the pin if it's a waypoint, the mark's colour, and whether she's bound there.
var _sel := {}
## Since she came alongside (the port shot settles in over it).
var _dock_t := 0.0
## The pirate she was fighting last frame (it holds on a little further).
var _last_foe: Ship


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
	# the event ships' seasons held open (on) or shut (off) whatever the date
	if _args.has("events"):
		ShipEvents.force = 0 if str(_args.events) == "off" else 1
	_parts_flags()
	_vault_flags()
	if _args.has("phone"):
		Settings.pretend_phone(412.0 if _args.phone is bool else float(_args.phone))
	# nothing plays until the world is up: the loading screen holds the stage
	set_process(false)
	set_process_input(false)
	# (the boot scene hands its own over: it has been up since the first frame)
	if loading == null:
		loading = LoadingScreen.new()
		add_child(loading)
	await _load()


## The world goes up a piece a frame behind the loading screen, so its
## crest keeps turning and its bar keeps moving: the heaviest pieces (the sea's
## grid, the islands' ground and plants, her hull, the towns) are built on
## worker threads while the frames carry on, and the camera is up from the
## start, so each piece's shaders are built on its own first draw rather than
## all at once on the first frame with a camera. Once it's all built, every
## shader has been drawn and the frames have settled, it lifts on the harbour.
func _load() -> void:
	await _loaded_to(0.04)
	# her look, and the pirates' colours: their flags and marks are drawn on
	# the worker threads while the sea and the isles go up
	outfitter = Outfitter.new()
	add_child(outfitter)
	outfitter.start(_first_look())
	sound = Sound.new()
	sound.name = "Sound"
	add_child(sound)
	sound.apply_settings(Settings)
	Settings.changed.connect(func() -> void: sound.apply_settings(Settings))
	world.sound = sound
	_setup_sky()
	_build_environment()
	_raise_camera()
	await _loaded_to(0.1)
	await _build_sea()
	await _loaded_to(0.18)
	await _build_islands(0.18, 0.4)
	Livery.bake_finish()
	await _loaded_to(0.4)
	await _launch_player()
	_build_camera()
	await _loaded_to(0.48)
	_build_fleet()
	await _loaded_to(0.56)
	await _build_ports(0.56, 0.66)
	if _harbour_first():
		# the home port's quay goes up on a worker while the rest does
		home.build_soon(0.0)
		home.prepare(0.0)
	await _loaded_to(0.66)
	controls = Controls.new()
	add_child(controls)
	hud = Hud.new()
	hud.controls = controls
	hud.sail_set.connect(func(n: int) -> void: _set_sails(n / 3.0))
	hud.helm_cancel.connect(func() -> void: _stop_pilot("You have the helm"))
	hud.view_pressed.connect(func() -> void:
		sound.click()
		camera.next_view())
	hud.map_pressed.connect(func() -> void:
		sound.click()
		_open_chart())
	hud.ability_pressed.connect(_call_power)
	hud.pause_pressed.connect(func() -> void:
		sound.click()
		_pause())
	hud.clicked.connect(sound.click)
	hud.fire_pressed.connect(func(side: int) -> void:
		if side == 0:
			controls.fire_auto = true
		else:
			controls.fire_side = side)
	hud.ammo_picked.connect(func(kind: int) -> void: _pick_ammo(kind))
	hud.firework_picked.connect(_choose_firework)
	hud.sky_tapped.connect(_on_sky_tap)
	hud.jump_pressed.connect(func() -> void: controls.jump = true)
	hud.strike_pressed.connect(func() -> void: _hud_strike = true)
	hud.pistol_pressed.connect(func() -> void: _hud_pistol = true)
	add_child(hud)
	await _loaded_to(0.72)
	maps.world = world
	maps.player = player
	maps.ports = ports.ports
	maps.discovered = discovered
	maps.pins = pins
	hud.minimap.set_scene(maps)
	chart_art = ChartArt.new(world.regions)
	chart = SeaChart.new()
	chart.art = chart_art
	chart.scene = maps
	chart.clicked.connect(sound.click)
	chart.tapped.connect(_chart_tap)
	chart.pins_cleared.connect(func() -> void:
		if helm.target != null and helm.target.pin >= 0:
			_stop_pilot("Course cleared")
		if not _sel.is_empty() and _sel.pin != null:
			_close_card())
	add_child(chart)
	chart.card.sail.connect(func() -> void:
		if not _sel.is_empty():
			_sail_to(_sel.target))
	chart.card.stop.connect(func() -> void: _stop_pilot("You have the helm"))
	chart.card.lift.connect(_lift_card_pin)
	chart.card.closed.connect(_close_card)
	helm = Helmsman.new()
	helm.name = "Helmsman"
	helm.setup(world.regions)
	helm.plotted.connect(_plotted)
	helm.arrived.connect(_pilot_arrived)
	helm.gave_up.connect(func(why: String) -> void:
		hud.toast("The helmsman gives up", why, 3.6)
		sound.click())
	add_child(helm)
	helm.prepare(player.cls)
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
	wreck.harbour.connect(_wreck_to_harbour)
	wreck.tallied.connect(sound.tally)
	add_child(wreck)
	await _loaded_to(0.78)
	_build_menus()
	await _loaded_to(0.84)
	Settings.changed.connect(_on_settings)
	_on_settings()
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
	if _args.has("dock") or _args.has("off"):
		_stage_dock()
	if _args.has("ashore") or _args.has("beach"):
		_stage_ashore()
	elif _args.has("camp"):
		_stage_camp()
	_tour = _harbour_first() and _args.has("smoke")
	if _harbour_first():
		if _args.has("orbit"):
			camera.orbit_angle = float(_args.orbit)
		_enter_harbour()
	# one settled frame before anything draws
	_tick(0.0)
	camera.snap_to(_watched().pos)
	_start_updates()
	await _loaded_to(0.86)
	_stage_menus()
	# (the home port shares the towns' materials with the warm-up: built first)
	while not home.built and home.building():
		home.prepare(0.0)
		await _idle()
		await _loaded_to(0.86)
	await _warm_up()
	set_process(true)
	set_process_input(true)
	_ready_to_play = true
	# (--loading: a shot of the loading screen itself, held up)
	if _args.has("loading"):
		loading.progress(0.62)
		return
	await loading.finish(_args.has("shot") or _args.has("smoke"))
	loading = null
	if harbour.is_open():
		harbour.replay()


## The loading screen's bar to `p` (0..1), then a frame for it to draw
## (--load-times prints how long each piece took).
func _loaded_to(p: float) -> void:
	if _args.has("load-times"):
		var now := Time.get_ticks_usec()
		var R := RenderingServer
		print("LOAD %.2f in %.1f ms; shaders built ahead %d, on a draw %d" % [p, (now - _load_us) / 1000.0,
				R.get_rendering_info(R.RENDERING_INFO_PIPELINE_COMPILATIONS_SURFACE) + R.get_rendering_info(R.RENDERING_INFO_PIPELINE_COMPILATIONS_MESH),
				R.get_rendering_info(R.RENDERING_INFO_PIPELINE_COMPILATIONS_DRAW)])
		_load_us = now
	loading.progress(p)
	await get_tree().process_frame
	_load_us = Time.get_ticks_usec()


## Waits for a worker's task while the frames carry on.
func _join(task: int) -> void:
	while not WorkerThreadPool.is_task_completed(task):
		await _idle()
		await get_tree().process_frame
	WorkerThreadPool.wait_for_task_completion(task)


## (Headless, where frames cost nothing, a wait for a worker lets 25 ms pass
## a frame, so a run's frame count isn't spent on waiting.)
func _idle() -> void:
	if DisplayServer.get_name() == "headless":
		OS.delay_msec(25)


## Her hull for the first voyage, lofted, rigged and painted on a worker (as
## the yard builds every other one) while the loading screen runs on.
func _launch_player() -> void:
	var id := _player_class()
	var livery := str(_args.get("livery", Shipyard.MINE))
	var cls := ShipClass.named(id)
	var lv := Livery.named(livery)
	var fit := Progress.loadout(id) if livery == Shipyard.MINE else {}
	await _join(WorkerThreadPool.add_task(func() -> void:
		Figurehead.warm()
		_boot_model = ShipModel.create(cls, lv, true, fit), false, "Her hull"))
	var model := _boot_model
	_boot_model = null
	_build_player(id, model)


## The class of her first hull: a set piece's (--ship, a shot's sloop), else
## the one last picked in the harbour.
func _player_class() -> String:
	return str(_args.get("ship", "sloop" if _args.has("shot") else Progress.ship))


## A first wound, the first plank in the water, the first town in view: none
## of it may stutter the game. One of everything they draw hangs in front of
## the camera for a moment, far too small to see, so its shaders are built
## up front.
func _warm_up() -> void:
	var w := Node3D.new()
	w.name = "WarmUp"
	w.transform = Transform3D(Basis.from_scale(Vector3.ONE * 1e-4), Vector3(0.0, 0.0, -40.0))
	camera.add_child(w)
	# (one a frame: each one's first draw builds its own shaders)
	var sets := [ShipDamage.warm_meshes.bind(player.model), world.debris.warm_meshes, world.loot.warm_meshes, ports.warm_meshes, home.warm_meshes]
	if player.haunt != null:
		sets.append(Haunt.warm_meshes.bind(player.model))
	for i in sets.size():
		for n: Node in sets[i].call():
			w.add_child(n)
			await _loaded_to(0.87 + 0.005 * i)
	hud.warm()
	chart_art.build(self)
	get_tree().create_timer(1.0).timeout.connect(w.queue_free)


## Her look to start with: kept from the Shipwright, or for a shot one of
## the famous colours (--colours N, 0 .. 7) or Surprise me (--colours
## random, --seed S), with --name to christen her.
func _first_look() -> Dictionary:
	if not _args.has("colours"):
		return Progress.look
	var l: Dictionary
	if str(_args.colours) == "random":
		var rng := RandomNumberGenerator.new()
		rng.seed = int(_args.get("seed", 7))
		l = ShipLook.random_look("", rng)
	else:
		l = ShipLook.preset(clampi(int(_args.colours), 0, ShipLook.PRESETS.size() - 1))
	l.name = ShipLook.clean_name(str(_args.get("name", "")))
	return l


## The parts' debug flags: --parts all|none|ID,ID puts them in the locker
## (or empties it), --fit ID,ID|none bolts them onto the ship she sails out
## in (found first if need be), or takes every part off; --purse G puts G
## gold in the purse.
func _parts_flags() -> void:
	if _args.has("purse"):
		Progress.purse = maxi(0, int(_args.purse))
		Progress.purse_changed.emit(Progress.purse)
	if _args.has("parts"):
		if _args.parts is bool or str(_args.parts) == "all":
			Progress.grant_all_parts()
		elif str(_args.parts) == "none":
			Progress.parts = Parts.fresh()
			Progress.parts_changed.emit()
		else:
			for id in str(_args.parts).split(",", false):
				if not Progress.owns(id):
					Progress.grant_part(id)
	if not _args.has("fit"):
		return
	var cls_id := str(_args.get("ship", "sloop" if _args.has("shot") else Progress.ship))
	for slot in Parts.SLOTS:
		Progress.equip(cls_id, slot, "")
	if str(_args.fit) == "none":
		return
	for id in str(_args.fit).split(",", false):
		var p := Parts.part(id)
		if p.is_empty():
			push_warning("--fit: no such part " + id)
			continue
		if not Progress.owns(id):
			Progress.grant_part(id)
		Progress.equip(cls_id, p.slot, id)


## --vault all|none|ids (what your vault holds), and --skin, --blast,
## --trail ID (what she wears: the item's key, or its whole id).
func _vault_flags() -> void:
	if _args.has("vault"):
		var v := str(_args.vault)
		if _args.vault is bool or v == "all":
			Progress.grant_all_items()
		elif v == "none":
			Progress.vault = Cosmetics.fresh()
			Progress.vault_changed.emit()
		else:
			for key in v.split(",", false):
				# a bare key is the first kind that has it (kintsugi, dragon, rainbow)
				var id := key
				for kind in Cosmetics.KINDS:
					if not id.contains(":") and not Cosmetics.item(kind + ":" + key).is_empty():
						id = kind + ":" + key
				if Cosmetics.item(id).is_empty():
					push_warning("--vault: no such item %s" % key)
				elif not Progress.owns_item(id):
					Progress.award(id)
	for kind in Cosmetics.KINDS:
		if not _args.has(kind):
			continue
		var id := str(_args[kind])
		if not id.contains(":"):
			id = kind + ":" + id
		if Cosmetics.item(id).is_empty():
			push_warning("--%s: no such item %s" % [kind, id])
			continue
		if not Progress.owns_item(id):
			Progress.award(id)
		Progress.wear(id)
	# your livery wears your skin before the first of your hulls is built
	_dress_livery()
	Progress.vault_changed.connect(_dress)


## What she wears from the vault: the skin on your livery's materials (every
## hull in your colours at once, wounds and all), the blast and trail on
## your ship's guns (the web's applyCosmetics).
func _dress() -> void:
	_dress_livery()
	for s in world.ships:
		if s.model.livery.skinned and s.dmg != null:
			s.dmg.repaint()
	if player != null and is_instance_valid(player):
		_arm(player)


func _dress_livery() -> void:
	var l := Livery.named(Shipyard.MINE)
	var sk := Cosmetics.skin(Progress.wearing("skin"))
	if l.skin == sk:
		return
	l.skin = sk
	ShipModel.restyle(l)


## Your guns go off in the blast you wear and their round shot flies with
## your trail (a set piece in someone else's colours keeps plain powder).
func _arm(s: Ship) -> void:
	if s.cls.haunt:
		# the Hollow Jack fires her own: jack-o'-lantern blasts and pumpkin-ember trails
		s.blast = Particles.HALLOW
		s.trail = Particles.HALLOW
		return
	var mine := s.model.livery.skinned
	s.blast = Cosmetics.style_of(Progress.wearing("blast")) if mine else 0
	s.trail = Cosmetics.style_of(Progress.wearing("trail")) if mine else 0


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
	# built now (and drawn by the warm-up) so the first rocket compiles nothing
	world.sky = FireworkSky.new()
	world.sky.name = "Fireworks"
	add_child(world.sky)
	world.sky.setup([0.5, 0.8, 1.0][Settings.quality])
	world.sky.fx = world.fx
	world.sky.sounded.connect(_on_firework_sound)
	# (the sea's grid, a worker's while the frames carry on)
	await _join(WorkerThreadPool.add_task(func() -> void: _boot_grid = Ocean.grid_mesh(), false, "The sea"))
	ocean = Ocean.new()
	ocean.name = "Ocean"
	add_child(ocean)
	ocean.setup(world.waves, world.wind, world.wake, _boot_grid)
	_boot_grid = null
	ocean.visible = not _args.has("noocean")
	await _loaded_to(0.12)
	world.debris = Debris.new()
	world.debris.name = "Debris"
	add_child(world.debris)
	world.debris.setup(world)
	await _loaded_to(0.14)
	world.loot = Loot.new()
	world.loot.name = "Loot"
	add_child(world.loot)
	world.loot.setup(world)
	await _loaded_to(0.16)
	vstage = VaultStage.new(world, ocean)
	vstage.name = "VaultStage"
	add_child(vstage)
	vstage.quake.connect(func(a: float) -> void: camera.shake(a))
	pins = Waypoints.new()
	pins.name = "Waypoints"
	add_child(pins)
	pins.setup(world)
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


## The archipelagos: read off the world bake, then every one's ground and
## plants built at once on the worker threads (out of the scene, where a
## worker may build), and set into the scene a few islands a frame (the
## rendering server takes in what enters the scene on the frame after), the
## bar climbing from `p0` to `p1`.
func _build_islands(p0: float, p1: float) -> void:
	var lite := Settings.quality == Settings.Quality.LOW
	# (everything the builds load, loaded first: a worker waiting on a load
	# another worker is making can starve the pool)
	await _join(WorkerThreadPool.add_task(func() -> void:
		_boot_regions = Region.load_all()
		Flora.kit()
		for path: String in ["res://shaders/terrain_lite.gdshader" if lite else "res://shaders/terrain.gdshader", "res://art/noise.png", "res://art/foam.png"]:
			load(path), false, "Charting the archipelagos"))
	regions = _boot_regions
	_boot_regions = []
	world.regions = regions
	await _loaded_to(lerpf(p0, p1, 0.3))
	var tasks: Array[int] = []
	for r in regions:
		isles_total += r.islands.size()
		_glow_centres.append(Vector2(r.centre.x, r.centre.z))
		var g := Ground.new()
		grounds.append(g)
		tasks.append(WorkerThreadPool.add_task(g.build.bind(r, lite), false, "Ground: " + r.id))
		var f := Flora.new()
		f.visible = not _args.has("noflora")
		floras.append(f)
		tasks.append(WorkerThreadPool.add_task(f.build.bind(r), false, "Flora: " + r.id))
	for t in tasks:
		await _join(t)
	await _loaded_to(lerpf(p0, p1, 0.6))
	var parts: Array[Node3D] = []
	for i in regions.size():
		parts.append(grounds[i])
		parts.append(floras[i])
	var n := 0
	for part in parts:
		n += part.get_child_count()
	var done := 0
	for part in parts:
		# its islands out of it, then back in a few at a time once it's in
		# the scene; an island's far planting before its squares, which hang
		# their visibility on it
		var isles := part.get_children()
		for c in isles:
			part.remove_child(c)
		add_child(part)
		isles.sort_custom(func(a: Node, b: Node) -> bool: return a.name.ends_with("_far") and not b.name.ends_with("_far"))
		var batch := 0
		for c in isles:
			part.add_child(c)
			done += 1
			batch += maxi(1, c.find_children("*", "GeometryInstance3D", true, false).size())
			if batch >= 24:
				batch = 0
				await _loaded_to(lerpf(p0, p1, 0.6 + 0.4 * float(done) / float(n)))
		await _loaded_to(lerpf(p0, p1, 0.6 + 0.4 * float(done) / float(n)))
	ocean.set_glow_centres(_glow_centres)
	hazards = Hazards.new(world)
	hazards.struck.connect(_on_hazard)
	ocean.place_vortices(world.vortices)


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
	pins.set_region(region)
	rain.set_region(region)
	world.region = region


## Your ship for a fresh voyage, of class `id` (else the one picked in the
## harbour, or a set piece's): `built` for her (the first voyage's, built
## while the game loads), else a hull in your colours off the yard's slipway
## when one is ready, else built here.
func _build_player(id := "", built: ShipModel = null) -> void:
	if id == "":
		id = _player_class()
	var livery := str(_args.get("livery", Shipyard.MINE))
	var model := built
	if model == null and shipyard != null and livery == Shipyard.MINE:
		model = shipyard.take(id, livery)
	var fit := Progress.loadout(id) if livery == Shipyard.MINE else {}
	player = Ship.create(ShipClass.named(id), Livery.named(livery), world, Ship.Team.PLAYER, model, fit)
	_arm(player)
	add_child(player)
	if livery == Shipyard.MINE:
		player.ship_name = outfitter.name_for(player.cls)
	outfitter.ship = player
	# two-thirds of her canvas set and already making way
	var h := SPAWN_HEADING
	if _args.has("heading"):
		h = float(_args.heading)
	var at := SPAWN
	if _args.has("at"):
		var p: PackedStringArray = str(_args.at).split(",")
		at = Vector2(float(p[0]), float(p[1]))
	# a set piece by a maelstrom (`--maelstrom I`, `--mael-u` radii out) or a reef (`--reef I`, `--reef-off` m off its edge)
	if _args.has("maelstrom") and not hazards.maelstroms.is_empty():
		var m: Dictionary = hazards.maelstroms[clampi(int(_args.maelstrom) if str(_args.maelstrom).is_valid_int() else 0, 0, hazards.maelstroms.size() - 1)]
		var v: Vortex = m.v
		var u := float(_args.get("mael-u", 0.55))
		var a := float(_args.get("mael-a", 0.6))
		at = Vector2(v.x + cos(a) * v.r * u, v.z + sin(a) * v.r * u)
		# (her head along the flow)
		h = atan2(-sin(a) * v.dir, cos(a) * v.dir)
		if _args.has("mael-in"):
			# (or facing its eye)
			h = atan2(-cos(a), -sin(a))
	if _args.has("reef") and not hazards.reefs.is_empty():
		var rf: Dictionary = hazards.reefs[clampi(int(_args.reef) if str(_args.reef).is_valid_int() else 0, 0, hazards.reefs.size() - 1)]
		var off := float(rf.r) + float(_args.get("reef-off", 60.0))
		at = Vector2(float(rf.x), float(rf.z) - off)
		h = 0.0
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
	if _args.has("rockets"):
		# a set piece's locker: full, with the kind named loaded
		Progress.fill_rockets()
		_fw_type = str(_args.rockets) if Fireworks.KINDS.has(str(_args.rockets)) else "peony"
		player.ammo = Ammo.FIREWORK
	_sync_fw()
	if _args.has("ammo"):
		var k := Ammo.ID.find(str(_args.ammo))
		if k >= 0:
			player.ammo = k


## The camera, up before anything else in the world, so each piece is
## drawn (behind the loading screen) on the frame after it comes in: the
## shaders a first draw has to build are built a piece at a time, not all at
## once on the first frame with a camera.
func _raise_camera() -> void:
	camera = CameraRig.new()
	camera.name = "Camera"
	add_child(camera)
	camera.current = true


func _build_camera() -> void:
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
	outfitter.shipyard = shipyard
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


## The trading ports' towns along their quays, their folk drawn with the crews.
## (A frame for the loading screen after the towns, the home port and the
## shore, its bar climbing from `p0` to `p1`.)
func _build_ports(p0: float, p1: float) -> void:
	ports = TradePorts.new()
	ports.name = "TradePorts"
	# (the towns go up on a worker, out of the scene, then into it a town a frame)
	await _join(WorkerThreadPool.add_task(ports.setup.bind(world, crew), false, "Trading ports"))
	var towns := ports.get_children()
	for t in towns:
		ports.remove_child(t)
	add_child(ports)
	for i in towns.size():
		ports.add_child(towns[i])
		await _loaded_to(p0 + (p1 - p0) * 0.6 * float(i + 1) / towns.size())
	# the harbourmaster rings her in, loud on her own quay
	ports.bell_rung.connect(func(port: TradePort, _at: Vector3) -> void: sound.bell(2, 0.22 if port == dock_port else 0.08))
	ports.delivered.connect(_delivered)
	# the home port's quay, built the first time the harbour opens
	home = HomePort.new()
	for r in world.regions:
		for site: Dictionary in r.ports:
			if site.home:
				home.setup(site, ports.arts(), world, crew)
	add_child(home)
	await _loaded_to(p0 + (p1 - p0) * 0.7)
	# the islands as ground to walk, and the landing party's boat and people
	shore_ground = ShoreGround.new(world, world.regions)
	shore = Shore.new(shore_ground, crew, ports.arts().parts, world.regions)
	add_child(shore)
	shore.floated.connect(func(text: String, at: Vector3, kind: int) -> void:
		var k: Floaters.Kind = [Floaters.Kind.GOOD, Floaters.Kind.BAD, Floaters.Kind.LOOT][kind]
		hud.floater(text, at, camera, k, 6.0 if kind == Shore.FLOAT_LOOT else 0.0))
	shore.shook.connect(func(a: float) -> void: camera.shake(a))
	shore.alarmed.connect(_on_camp_alarm)
	shore.camp_routed.connect(_on_camp_routed)
	shore.plundered.connect(_on_camp_plundered)
	shore.captain_fell.connect(_on_captain_fell)
	shore.stepped.connect(func(k: float, wet: bool, hard: bool) -> void: sound.step(k, wet, hard))
	shore.hopped.connect(_on_hop)


## A lot set down in the warehouse of the quay she's tied to: it glints in
## its rarity's colour (what's carried aboard doesn't).
func _delivered(port: TradePort, id: String, on: bool, at: Vector3) -> void:
	if port != dock_port or on:
		return
	var r := Treasure.rarity_of(id)
	var tint: Color = Color(1.4, 1.1, 0.6) if r == 0 else (Loot.GLOW[r] as Color) * 0.6
	for i in 5:
		world.fx.sparkle(at, 0.8, tint)


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
## pie opens (--pie) a second before the frame is saved (see _process); and
## waypoints on the chart (--pins).
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
	if _args.has("pins"):
		# waypoints round her, metres east and south of her ("dx,dz;dx,dz")
		pins.wipe()
		for e in str(_args.pins).split(";"):
			var a := e.split(",")
			if a.size() == 2:
				pins.add(player.pos.x + float(a[0]), player.pos.z + float(a[1]))


## A set piece's course (--sail-to): the helmsman given the wheel for a
## waypoint DX,DZ off her, the K-th market ("port:K") or an isle
## ("isle:REGION/ID"); with the chart open, its card open over the place.
func _stage_sail_to(spec: String) -> void:
	var hit := {}
	if spec.begins_with("port:"):
		var tp: TradePort = ports.ports[clampi(int(spec.trim_prefix("port:")), 0, ports.ports.size() - 1)]
		var at := MapScene.port_at(tp)
		hit = _chart_pick(at.x, at.y, 1.0)
	elif spec.begins_with("isle:"):
		var a := spec.trim_prefix("isle:").split("/")
		for r in world.regions:
			if r.id != a[0]:
				continue
			for isl: Dictionary in r.islands:
				if int(isl.id) == int(a[1]):
					hit = _chart_pick(float(isl.x), float(isl.z), 1.0)
	else:
		var d := spec.split(",")
		hit = _pin_target(pins.add(player.pos.x + float(d[0]), player.pos.z + float(d[1]), player.pos))
	if hit.is_empty():
		printerr("--sail-to: nothing to sail to at ", spec)
		return
	helm.engage(player, hit.target)
	if chart.is_open():
		_select_on_chart(hit)


## A set piece at a market town: tied up at the K-th market's quay (--dock
## K, 0 .. 5: the home waters' four, then Las Brumas' two) with the market
## open, or off it with the prompt to come alongside up (--off K).
func _stage_dock() -> void:
	var key := "dock" if _args.has("dock") else "off"
	var arg := str(_args[key])
	var port: TradePort = ports.ports[clampi(int(arg) if arg.is_valid_int() else 0, 0, ports.ports.size() - 1)]
	var c := port.cast_off(player.cls.beam)
	player.place(c.x, c.y, c.z)
	camera.snap_to(player.pos)
	if key == "dock":
		_dock(port, true)


func _process(delta: float) -> void:
	# on hold nothing at sea moves; the screens over it carry on
	if not paused:
		_tick(minf(delta, 0.1))
	_frames += 1
	if _tour:
		_tour_menus()
	if _args.has("again") and _frames == int(_args.again) and _farewell != null and _farewell.shown:
		wreck.retry.emit()
	if _args.has("newship") and _frames == int(_args.newship) and _farewell != null and _farewell.shown:
		wreck.harbour.emit()
	if _args.has("chart") and _frames == 3:
		_open_chart()
		var v := chart.view()
		if _args.has("chart-at"):
			var a := str(_args["chart-at"]).split(",")
			v = Vector3(float(a[0]), float(a[1]), v.z)
		chart.look(v.x, v.y, float(_args.get("chart-zoom", 0.0)))
	if _args.has("chart-tap") and _frames == 8:
		var d := str(_args["chart-tap"]).split(",")
		_tour_tap(Vector2(player.pos.x + float(d[0]), player.pos.z + float(d[1])))
	if _args.has("sail-to") and _frames == 5:
		_stage_sail_to(str(_args["sail-to"]))
	if _args.has("pie") and _frames == maxi(1, int(_args.get("frames", 90)) - 30):
		hud.open_pie(Ammo.ID.find(str(_args.pie)))
	if _args.has("strike") and _frames == maxi(1, int(_args.get("frames", 90)) - int(_args.strike if str(_args.strike).is_valid_int() else 2)):
		_strike_now = true
	# the Guns tab's broadside (or at sea, one to seaward), N frames before the shot (12 by default)
	if _args.has("test-fire") and _frames == maxi(1, int(_args.get("frames", 90)) - int(_args["test-fire"] if str(_args["test-fire"]).is_valid_int() else 12)):
		_test_fire(true)
	# her power called on N frames before the shot (40: well over), or with --wail N
	# frames before her return, so the frame catches the Banshee's Wail going out
	# (a shot's frames at --fixed-fps 30)
	if _args.has("phantom") and _frames == maxi(1, int(_args.get("frames", 90)) - int(_args.phantom if str(_args.phantom).is_valid_int() else 40)):
		_call_power()
	if _args.has("wail") and player.haunt != null and _frames == maxi(1, int(_args.get("frames", 90)) - int(Haunt.SPAN * 30.0) - int(_args.wail if str(_args.wail).is_valid_int() else 6)):
		_call_power()
	if _args.has("sell") and _frames == maxi(1, int(_args.get("frames", 90)) - 24):
		# (the coins are in the air as the frame is saved)
		_sell("" if str(_args.sell) == "all" else str(_args.sell))
	if _args.has("wright") and _frames == maxi(1, int(_args.get("frames", 90)) - 40):
		market.show_wright()
	if _args.has("pyro") and _frames == maxi(1, int(_args.get("frames", 90)) - 40):
		market.show_pyro()
	if _args.has("buy-rocket") and dock_port != null and _frames == maxi(1, int(_args.get("frames", 90)) - 9):
		var day := floori(Time.get_unix_time_from_system() / 86400.0)
		var list := Fireworks.stall(dock_port.index + 1, day)
		_buy_firework(list[clampi(int(_args["buy-rocket"]), 0, list.size() - 1)])
	if _args.has("locker") and _frames == maxi(1, int(_args.get("frames", 90)) - 30):
		hud.open_locker()
	if _args.has("buy") and dock_port != null and _frames == maxi(1, int(_args.get("frames", 90)) - 9):
		# (swelling on the counter as the frame is saved)
		_buy_part(str(Parts.port_stock(dock_port.index + 1)[clampi(int(_args.buy), 0, 2)].id))
	if _args.has("find") and _frames == maxi(1, int(_args.get("frames", 90)) - 60):
		_find_part(str(_args.find), "In the treasure chest", player.pos)
	if _args.has("smoke") and _frames == int(_args.get("smoke-at", 300)):
		if _tour:
			print("SMOKE MENU: " + ", ".join(_tour_log))
			if _tour_step < TOUR_STEPS:
				printerr("SMOKE FAILED: the tour of the menus stopped at step %d of %d" % [_tour_step, TOUR_STEPS])
				return
		# (choosing a new ship off the farewell card ends in the harbour)
		var harboured := _args.has("newship") and state == State.HARBOUR and harbour.is_open()
		if (state != State.VOYAGE and not harboured) or paused:
			printerr("SMOKE FAILED: %s at frame %d" % ["still in the harbour" if state != State.VOYAGE else "the voyage still on hold", _frames])
			return
		var isles := 0
		var plants := 0
		for i in regions.size():
			isles += regions[i].islands.size()
			plants += floras[i].plants
		var lost := "" if _farewell == null else "; lost %.1f s ago%s" % [_farewell.t, ", the farewell card up" if _farewell.shown else ""]
		if _args.has("again") and _farewell == null and _frames > int(_args.again):
			lost = "; sailing again, the HUD %s" % ("up" if hud.get_node("Root").visible else "hidden")
		if harboured:
			lost = "; back in the harbour aboard a fresh %s, the HUD %s" % [player.cls.id, "up" if hud.get_node("Root").visible else "hidden"]
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
		print("SMOKE OK: %d frames, %.0f m sailed, %d triangles in the %s, %d islands, %d plants; %d ships afloat, %d guns fired, %d hits, %d breaches, %d spars down, %d pieces of wreckage and %d spars adrift, %d hulls on the slipway%s" % [
				_frames, voyage.metres, player.model.triangles(), player.cls.id, isles, plants, world.ships.size(), voyage.shots, voyage.hits, holes, down, junk.x, junk.y, shipyard.stock(), lost])
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
		var drawn := ports.drawn()
		var built := ports.triangles()
		print("SMOKE PORT: %d towns (%d triangles close up and %d as shells built); %d whole in view, drawing %d triangles; %s" % [
				ports.ports.size(), built.x, built.y, drawn.y, drawn.x, "tied up at " + dock_port.title if dock_port != null else "at sea"])
	if _args.has("shot") and _frames >= int(_args.get("frames", 90)):
		_save_shot(str(_args.shot))


func _tick(real_dt: float) -> void:
	# the sea's clock: slowed for the blow that sinks her
	var dt := real_dt * time_scale
	world.time += dt
	controls.poll()
	# in the harbour she rides at anchor, and the helm and the guns are no one's
	var sailing := state == State.VOYAGE
	# docked, sunk, back in the harbour: the helmsman's watch is over
	if helm.state != Helmsman.State.IDLE and (not sailing or not player.alive or _farewell != null):
		helm.disengage()
	var ashore := shore.active
	if player.alive and sailing:
		voyage.time += dt
		if ashore:
			player.rudder = 0.0
		else:
			_helm(dt)
	else:
		player.rudder = 0.0
	if not sailing:
		pass
	elif _farewell == null:
		if controls.zoom != 0.0:
			camera.zoom_by(controls.zoom, world.time)
		if controls.view_next and not ashore:
			camera.next_view()
		if controls.chart and not ashore:
			if chart.is_open():
				chart.close()
			else:
				_open_chart()
		if controls.ability and not ashore:
			_call_power()
		# the view you sail with is the next voyage's
		if not ashore:
			Progress.keep_view(camera.zoom, camera.tilt)
	elif controls.skip:
		_skip()

	# the air and the water: the weather sets the breeze (ships, plants, gusts
	# and the clouds' drift all follow it) and the sea state, and the swell
	# comes round after the wind
	_pick_region(camera.target.x, camera.target.z)
	atmosphere.bloom = SeaGlow.at(player.pos.x, player.pos.z, _glow_centres)
	if sailing:
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
	# shove and stave each other in, and the shot in the air flies; in the
	# harbour a sail or two on the horizon, and the ship picked comes in
	pirates.step(dt, player if sailing else null)
	# (at the home port's quay the harbour's sea waits for her back at anchor)
	if state == State.HARBOUR and not home.visible:
		pirates.step_harbour(dt, player.pos, camera)
		_swap_in(false)
	home.prepare(real_dt)
	# the maelstroms take hold of every hull in their reach before she sails
	hazards.update(dt, camera.target, atmosphere.storm)
	for s in world.ships:
		s.step(dt)
	if dt > 0.0:
		collisions.resolve(world)
	world.shots.step(dt)
	pirates.sweep()
	# the landing party, where you steer the captain
	if ashore:
		if not player.alive or _farewell != null:
			_leave_shore()
			ashore = false
		else:
			_control_shore()
	# (afloat too: the camps in sight keep their fires and their watch)
	shore.update(dt, world, _steer if ashore else _idle_steer, camera.target)
	if ashore:
		hud.show_shore(shore, camera)
	# the towns: hulls kept off their quays, and their folk about their business
	ports.update(dt, player, camera.global_position, world.ships)
	if state == State.DOCKED:
		dock_port.pin(player)
		market.tick(real_dt, world.time)
		_frame_dock(real_dt)
	if home.visible:
		home.pin(player)
		# (her colours on the awning and the bunting follow the Shipwright's every change)
		home.set_look(outfitter.look)
		home.update(dt)
	if vault.is_open():
		if _v_drive > 0:
			_drive_vault()
		_frame_vault(real_dt)
	elif shipwright.is_open():
		_frame_shipwright(real_dt)
	if player.alive and sailing:
		voyage.metres += Vector2(player.vel.x, player.vel.z).length() * dt
		# the crew patches her up between fights
		if world.time - player.last_hit > 9.0:
			player.hp = minf(player.max_hp, player.hp + player.max_hp * 0.01 * dt)
	gunnery.pointer = _pointer_on_sea() if sailing else null
	gunnery.update(dt, player, world, sailing and player.alive and _farewell == null and not ashore, world.time)
	if sailing and not ashore:
		_guns()
	if _sink_at >= 0.0 and sailing and player.alive and voyage.time >= _sink_at:
		player.damage(player.max_hp * 4.0, _foe)
	if _foe_sink_at >= 0.0 and _foe != null and _foe.alive and world.time >= _foe_sink_at:
		_foe.damage(_foe.max_hp * 4.0, player)
	if sailing:
		_prompt(dt)
	else:
		market.set_dock({})
		_prompt_kind = ""
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
	# the harbour's orbit circles her where she rides (and keeps with her as
	# the camera swings down off it); its frame is the space the menu leaves
	camera.orbit_xf.origin = Vector3(focus.pos.x, focus.position.y, focus.pos.z)
	if harbour.is_open():
		camera.orbit_frame = harbour.framing()
	if shore.active:
		# ashore the camera keeps over the captain's shoulder
		var cap := shore.captain
		camera.update_rig(real_dt, Vector3(cap.x, maxf(cap.y, -0.2) + 1.0, cap.z), Vector3(cap.vx, 0.0, cap.vz), world.time)
	else:
		camera.update_rig(real_dt, focus.pos, focus.vel if sailing else Vector3.ZERO, world.time)
	# every crew afloat, after the camera has moved: they're culled and cut by it
	crew.close_up = not sailing
	crew.update(dt, world, camera, camera.target, camera.ground_radius() * 1.5, atmosphere.key_dir)
	# the wake steps first, so the sea draws the canvas stepped this frame
	world.wake.step(camera.target.x, camera.target.z, dt)
	ocean.follow(camera.target, camera.distance())
	ocean.follow_vortices(world.vortices, camera.global_position)
	_lamps()
	# the fireworks break where the view will see them, on the world's clock
	world.sky.view(camera, camera.distance(), camera.tilt_blend(), get_viewport().get_visible_rect().size.y)
	world.sky.step(dt)
	if sailing and not ashore:
		_firework_tip()
	# the wreckage afloat, on the very swell the ocean draws (and shouldered aside by hulls still moving)
	RenderingServer.global_shader_parameter_set("sea_clock", fmod(world.time, Debris.CLOCK_WRAP))
	var pushers: Array[Ship] = []
	for s in world.ships:
		if s.alive or s.sink_t < 20.0:
			pushers.append(s)
	world.debris.update(dt, pushers, ocean, camera.global_position)
	# salvage afloat: drawn in and hauled aboard as she sails through it (a
	# full hold leaves what it can't take bobbing on the swell)
	var hauling := sailing and player.alive and _farewell == null and not shore.active
	var reach := (player.cls.beam * 0.5 + 5.0) * 2.0
	var got := world.loot.update(dt, player.pos if hauling else null, reach, _refuse, ocean, camera.global_position)
	for it in got:
		_haul(it)
	_hold_nag = maxf(0.0, _hold_nag - dt)
	# the waypoints' pillars of light (not over the harbour): sailing into one strikes it off
	pins.visible = state != State.HARBOUR
	var reached := pins.update(dt, player.pos if hauling else null, ocean, camera.global_position)
	if reached != null:
		_reached(reached)

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

	# the chart is for sailing: it goes when she ties up, goes down or heads home
	if chart.is_open() and (not sailing or _farewell != null or not player.alive):
		chart.close()
	# the helmsman's pill while he has the wheel (the prompt to come alongside steps up over it)
	hud.show_helm(helm.view(player) if sailing else {}, player.rudder, real_dt)
	market.set_pill(hud.helm_height())
	if not sailing:
		hud.show_hazard({})
		_hz_state = ""
		return
	hud.show_state(player, w, camera.view_index(), atmosphere.vignette)
	hud.show_sky(atmosphere.hour(), atmosphere.icon())
	_hold_sky(dt)
	hud.show_hull(player, discovered.size(), isles_total)
	if shore.active:
		hud.show_hazard({})
		_hz_state = ""
	else:
		_hazard_watch(dt)
	hud.show_guns(player, gunnery)
	hud.show_ability(player.haunt if not shore.active else null)
	hud.show_ammo(player.ammo, stock)
	hud.show_fireworks(Progress.fireworks, _fw_type)
	hud.show_hold(hold)
	hud.show_bars(world.ships, player, camera)
	maps.player = player
	maps.route = helm.route(player.pos)
	hud.minimap.tick(real_dt)
	_sync_card()
	hud.show_pins(pins, player.pos, camera, world)
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
		sound.high_seas(false)
		_arrive(near)
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
		for s in world.ships:
			if s.alive and s.visible and s.model.visible and Vector2(s.pos.x - t.x, s.pos.z - t.z).length() < reach:
				var xf := s.model.global_transform
				for l in s.model.lamps:
					var at := xf * Vector3(l.x, l.y, l.z)
					_lamp_list.append(Vector4(at.x, at.y, at.z, on * l.w))
		# the towns' lanterns and lighthouse lamps
		for l in ports.lamps(t, reach):
			_lamp_list.append(Vector4(l.x, l.y, l.z, on * l.w))
		for l in home.lamps():
			_lamp_list.append(Vector4(l.x, l.y, l.z, on * l.w))
		if _lamp_list.size() > Ocean.MAX_LAMPS:
			_lamp_list.sort_custom(func(a: Vector4, b: Vector4) -> bool:
				return Vector2(a.x - t.x, a.z - t.z).length_squared() < Vector2(b.x - t.x, b.z - t.z).length_squared())
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
	var roar := hazards.roar()
	sound.set_maelstrom(roar.x, roar.y, roar.z)
	sound.voyage_music(state == State.VOYAGE and player.alive and _farewell == null and not _high_seas and a.storm < 0.45, a.night)


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


## The helm and the canvas; the helmsman steering, while he has the wheel.
func _helm(dt: float) -> void:
	# a hand on the wheel (or the touch helm) takes it back from him
	if helm.active() and (controls.rudder != 0.0 or controls.steering):
		_stop_pilot("You have the helm")
	if controls.sail_delta != 0:
		var now := helm.cruise if helm.active() else player.sail_target
		_set_sails(clampf(roundf(now * 3.0 + controls.sail_delta) / 3.0, 0.0, 1.0))
	if controls.steering:
		# the touch helm only steers: put the bow where the finger points
		player.rudder = clampf(MathX.angle_delta(player.heading, controls.steer_heading) * 2.4, -1.0, 1.0)
	else:
		player.rudder = controls.rudder
	if helm.state != Helmsman.State.IDLE:
		var t := helm.target
		var gone := false
		if t != null and t.pin >= 0 and helm.active():
			gone = true
			for q in pins.pins:
				if q.id == t.pin:
					gone = false
					break
		helm.steer(player, dt, world.wind, world.ships, gone)


## The canvas set (the lever's notch, or W / S): under the helmsman it's
## what he cruises under, and furling it all takes the wheel from him.
func _set_sails(level: float) -> void:
	if not helm.active():
		player.sail_target = level
	elif level > 0.0:
		helm.cruise = level
		player.sail_target = level
	else:
		_stop_pilot("Sails furled")
		player.sail_target = 0.0


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
	if _args.has("volley") and player.ammo == Ammo.FIREWORK:
		for side in [1, -1]:
			if player.can_fire(side):
				_fire(side)
	if _args.has("autofire"):
		for st: Gunnery.Broadside in [gunnery.port, gunnery.starboard]:
			if st.ready and st.target != null:
				_fire(st.side)


func _fire(side: int) -> void:
	_sync_fw()
	# a special the magazine has run out of: round shot, rather than guns left cold
	if stock[player.ammo] == 0:
		_pick_ammo(Ammo.ROUND, true)
	if player.ammo == Ammo.FIREWORK:
		_fire_rockets(side)
		return
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
	if kind == Ammo.FIREWORK:
		# 6 again with rockets already loaded: the next kind in the locker
		if player.ammo == Ammo.FIREWORK and not quiet:
			var nxt := Progress.next_rocket(_fw_type)
			if nxt != "":
				_choose_firework(nxt)
			return
		if Progress.rockets(_fw_type) <= 0:
			var nxt := Progress.next_rocket(_fw_type)
			if nxt != "":
				_fw_type = nxt
		_sync_fw()
	if stock[kind] == 0:
		hud.ammo_deny(kind)
		if not quiet:
			if kind == Ammo.FIREWORK:
				hud.toast("The firework locker is empty", "Pyrotechnists in the trading ports sell them, and fine chests hide a few", 3.0)
			else:
				hud.toast("No %s left" % Ammo.NAME[kind].to_lower(), "Salvage, chests and new isles restock the magazine", 2.8)
		return
	if kind == Ammo.FIREWORK:
		player.firework = _fw_type
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


## Fireworks loaded: a rocket off each chosen gun, and one volley out of the
## locker; at the last of a kind the next is loaded, and with none left at
## all, round shot.
func _fire_rockets(side: int) -> void:
	var id := _fw_type
	player.firework = id
	if not player.fire(side):
		hud.guns_deny(side)
		return
	hud.close_fw_picker()
	Progress.take_rocket(id)
	if Fireworks.tier(id) == 2:
		voyage.note("trade", "Lit the %s" % Fireworks.kind(id).name, "A showpiece over the sea")
	if Progress.rockets(id) > 0:
		_sync_fw()
		return
	var nxt := Progress.next_rocket(id)
	if nxt != "":
		_fw_type = nxt
		player.firework = nxt
		_sync_fw()
		hud.toast("That was the last %s" % Fireworks.kind(id).name, "%s loaded" % Fireworks.kind(nxt).name, 2.6)
	else:
		_sync_fw()
		hud.toast("The firework locker is empty", "Round shot loaded · trading ports have a pyrotechnist", 3.2)
		_pick_ammo(Ammo.ROUND, true)


## The rack's count for fireworks is the kind loaded; the HUD's locker and
## rockets slot follow it.
func _sync_fw() -> void:
	stock[Ammo.FIREWORK] = Progress.rockets(_fw_type)
	if hud != null:
		hud.show_fireworks(Progress.fireworks, _fw_type)


## A kind picked from the locker: loaded at once (in place of shot, if shot was in the guns).
func _choose_firework(id: String) -> void:
	if not player.alive or _farewell != null:
		return
	if Progress.rockets(id) <= 0:
		hud.ammo_deny(Ammo.FIREWORK)
		return
	var same := player.ammo == Ammo.FIREWORK and _fw_type == id
	_fw_type = id
	player.firework = id
	player.ammo = Ammo.FIREWORK
	_sync_fw()
	if not same:
		sound.ammo_swap(Ammo.FIREWORK)
		hud.ammo_loaded(Ammo.FIREWORK)


## Fireworks found or bought: into the locker, with a "+n" rising off the find
## and, for a showpiece, a toast of its own. Returns the line it said.
func _stock_fireworks(add: Dictionary, at: Variant) -> String:
	var got := Progress.stow_rockets(add)
	var line := ""
	var n := 0
	var show := ""
	for id: String in Fireworks.ORDER:
		var k: int = got.get(id, 0)
		if k <= 0:
			continue
		n += k
		if Fireworks.tier(id) == 2:
			show = id
		line += ("" if line.is_empty() else " · ") + "+%d %s" % [k, Fireworks.kind(id).short]
	if n == 0:
		return ""
	if Progress.rockets(_fw_type) <= 0:
		var nxt := Progress.next_rocket(_fw_type)
		if nxt != "":
			_fw_type = nxt
	_sync_fw()
	hud.ammo_gain(Ammo.FIREWORK, n)
	if at != null:
		hud.floater(line, at, camera, Floaters.Kind.LEGENDARY if show != "" else Floaters.Kind.AMMO, 44.0)
	if show != "" and state == State.VOYAGE:
		hud.toast("A showpiece: %s" % Fireworks.kind(show).name, "Pick it from the fireworks in the shot fan" if hud.touch_ui() else "Load fireworks (6) and pick it from the locker", 4.5)
		sound.treasure(3)
	return line


## The first night at sea with rockets aboard: says how to light them, once.
func _firework_tip() -> void:
	if _fw_tip or atmosphere.night < 0.6 or Progress.rockets_total() <= 0 or gunnery.combat or _args.has("shot") or _args.has("smoke"):
		return
	_fw_tip = true
	if Progress.tip_seen("fireworks"):
		return
	var how := "Tap the shot button, choose the rocket, then fire a broadside" if hud.touch_ui() else "Press 6 to load fireworks (6 again picks another kind), then fire a broadside"
	hud.toast("A fine night for fireworks", how, 6.0)


## A firework's bang, whistle or crackle, heard from where it went off (a
## burst high overhead is still as far off as its height).
func _on_firework_sound(kind: StringName, at: Vector3, power: float) -> void:
	var h := world.heard(at)
	sound.firework(kind, minf(1.2, h.x * power), h.y, Vector2(h.z, at.y * 0.8).length())


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
	_stock_fireworks(Fireworks.loot(it.tier), at)
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
		hud.loot_toast(Icons.plunder(best, 48.0), r, "%s plunder" % Treasure.RARITY_NAME[r], good, 3.8 if r == 4 else 3.0)
	if it.tier >= 3:
		camera.shake(0.22 if it.tier == 4 else 0.1)
	_chest_part(it.tier, at, 0.9)


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


## Her power called on (G, or its button): an event ship's (the Hollow
## Jack's Phantom Run), while she's sailing and afloat.
func _call_power() -> void:
	if player == null or player.haunt == null or state != State.VOYAGE or shore.active or _farewell != null:
		return
	if player.haunt.call_up():
		camera.shake(0.25)
		_say_power_once()


## The first time she crosses over in a sitting, a word on what it does.
func _say_power_once() -> void:
	if _power_told:
		return
	_power_told = true
	hud.toast("Phantom Run", "Nothing can touch her now · her Banshee's Wail when she returns", 4.0)


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
		"phantom":
			hud.floater("Phantom Run!", at, camera, Floaters.Kind.GHOST, 18.0)
		"dread":
			hud.floater("Dread!", at, camera, Floaters.Kind.GHOST, 18.0)
		"haunt_ready":
			hud.floater("The spirits stir", at, camera, Floaters.Kind.GHOST, 18.0)


## The sea took a bite out of a ship (Hazards.struck): said over her, and
## when it sinks a pirate you'd had under your guns, the kill is yours.
func _on_hazard(ship: Ship, kind: String, dealt: float) -> void:
	var p := player
	var st := hazards.state_of(ship, 1.2)
	var name := str(st.m.name) if not st.is_empty() else "the maelstrom"
	var at := Vector3(ship.pos.x, ship.position.y + ship.cls.freeboard + 3.0, ship.pos.z)
	if ship == p:
		if state != State.VOYAGE:
			return
		if dealt >= 1.0:
			hud.floater("-%d" % roundi(dealt), at, camera, Floaters.Kind.BAD)
			if p.alive:
				voyage.taken += dealt
		camera.shake(0.12)
		return
	var near := p != null and Vector2(ship.pos.x - p.pos.x, ship.pos.z - p.pos.z).length() < 380.0
	var last: float = _hz_called.get(ship, -100.0)
	if near and ship.alive and world.time - last > 5.0:
		_hz_called[ship] = world.time
		hud.floater("Caught in the maelstrom!", at + Vector3(0.0, 4.0, 0.0), camera, Floaters.Kind.RARE, 14.0)
	elif near and dealt >= 1.0 and ship.team == Ship.Team.PIRATE:
		hud.floater(str(roundi(dealt)), at, camera)
	if ship.alive:
		return
	_hz_called.erase(ship)
	# she's gone: lured there by you (Hazards credits the guns that drove her)?
	if ship.last_attacker == p and p.alive and state == State.VOYAGE and world.time - ship.last_hit < 90.0:
		hud.floater("Swallowed by the maelstrom!", at + Vector3(0.0, 8.0, 0.0), camera, Floaters.Kind.EPIC, 20.0)
		voyage.note("kill", "Drew the %s into %s" % [ship.ship_name, name], "The sea did the rest")


## The pill under the top of the screen, the leadsman's bell and the first
## sight of each danger (the web's updateHazards): a maelstrom's grip, and
## coral under her keel or across her bow.
func _hazard_watch(dt: float) -> void:
	var p := player
	_hz_bell -= dt
	if not p.alive or _farewell != null:
		hud.show_hazard({})
		_hz_state = ""
		return
	var vs := hazards.state_of(p, 2.4)
	var reef := hazards.reef_near(p.pos.x, p.pos.z, 170.0)
	var draft := p.cls.draft
	# the first sight of each: named, with what it means for your ship
	if not vs.is_empty() and not _hz_seen.has(vs.m.name):
		_hz_seen[vs.m.name] = true
		hud.toast(str(vs.m.name), "A maelstrom turns here · keep clear of its pull", 4.0)
	if not reef.is_empty() and not _hz_seen.has(reef.name):
		_hz_seen[reef.name] = true
		hud.toast(str(reef.name), "Coral reef · your shallow keel clears most of it" if draft < 1.8 else "Coral reef · watch for breakers, she draws too much water", 4.0)
	var st := ""
	var v := {}
	if not vs.is_empty() and float(vs.u) < 0.95:
		var u := float(vs.u)
		var throat := u < 0.3
		var free := float(vs.out) > 0.8 and not throat
		var grip := clampf((0.95 - u) / 0.85, 0.0, 1.0)
		st = "caught"
		var out := hazards.escape(p.pos.x, p.pos.z)
		# the throat dragging her under: the ring is how close the sea is to her rail
		var under := p.drawn > 0.02
		var title := "Caught in the maelstrom"
		var sub := "%s · sail out with the wind" % vs.m.name
		if under:
			title = "She's going under!" if p.drawn > 0.6 else "The throat has her!"
			sub = "The sea is dragging her down · crowd on sail and claw out!"
		elif throat:
			title = "In the maelstrom's throat!"
			sub = "Her timbers are giving way · run before the wind!"
		elif free:
			title = "Breaking free"
			sub = "%s · hold your course" % vs.m.name
		v = {"kind": "vortex", "level": "warn" if free and not under else "danger", "title": title, "sub": sub,
				"gauge": maxf(grip, p.drawn) if under else grip, "spin": lerpf(3.2, 0.7, grip) * (1.0 - p.drawn * 0.6),
				"arrow": NAN if is_nan(out) else _screen_heading(out)}
	elif p.scrape > 0.08:
		st = "aground"
		var depth := maxf(0.0, -world.ground_height(p.pos.x, p.pos.z))
		# the way to deeper water: down the seabed's slope
		var e := 6.0
		var gx := world.ground_height(p.pos.x + e, p.pos.z) - world.ground_height(p.pos.x - e, p.pos.z)
		var gz := world.ground_height(p.pos.x, p.pos.z + e) - world.ground_height(p.pos.x, p.pos.z - e)
		var deep := NAN if gx * gx + gz * gz < 1e-6 else atan2(-gx, -gz)
		v = {"kind": "reef", "level": "danger", "title": "Hard aground!" if p.scrape > 0.6 else "Scraping the reef!",
				"sub": "%s · %.1f m of water, you draw %.1f m · steer for deep water" % [reef.get("name", "Coral"), depth, draft],
				"gauge": p.scrape, "arrow": NAN if is_nan(deep) else _screen_heading(deep)}
	else:
		var look := maxf(40.0, absf(p.speed) * 7.0) + p.cls.length * 0.5
		var shoal := hazards.shoal_ahead(p, look) if not reef.is_empty() else Vector2(-1.0, 0.0)
		var under := -world.ground_height(p.pos.x, p.pos.z) if not reef.is_empty() else 99.0
		if shoal.x >= 0.0:
			st = "shoal"
			v = {"kind": "reef", "level": "warn", "title": "Shoal water ahead",
					"sub": "%s · %.1f m over the coral, you draw %.1f m" % [reef.name, shoal.y, draft],
					"gauge": clampf(1.0 - shoal.x / look, 0.08, 1.0), "arrow": NAN}
		elif not reef.is_empty() and under < 4.5 and world.reef_at(p.pos.x, p.pos.z) > 0.3:
			st = "over"
			v = {"kind": "reef", "level": "info", "title": "Over the reef",
					"sub": "Your keel clears it · %.1f m of water, you draw %.1f m" % [under, draft],
					"gauge": clampf(draft / maxf(under, 0.1), 0.0, 1.0), "arrow": NAN}
		elif not vs.is_empty() and float(vs.u) < 2.1:
			st = "near"
			var m: Dictionary = vs.m
			v = {"kind": "vortex", "level": "warn", "title": "Maelstrom ahead",
					"sub": "%s · %d m to its pull" % [m.name, maxi(0, roundi(float(vs.dist) - (m.v as Vortex).r))],
					"gauge": clampf((2.1 - float(vs.u)) / 1.15, 0.0, 1.0), "spin": 4.5, "arrow": NAN}
	# the watch calls it: the bell for danger ahead, a groan of timber as the sea takes hold
	if st != _hz_state:
		if (st == "shoal" or st == "near") and _hz_bell <= 0.0:
			sound.shoal_bell()
			_hz_bell = 9.0
		if st == "caught":
			sound.groan()
			camera.shake(0.3)
		_hz_state = st
	hud.show_hazard(v)


## A heading on the sea (0 north, clockwise) as an angle on the screen (0 up, clockwise).
func _screen_heading(h: float) -> float:
	var p := player
	var a := Vector3(p.pos.x, p.position.y, p.pos.z)
	var b := a + Vector3(sin(h), 0.0, cos(h)) * 30.0
	if camera.is_position_behind(a) or camera.is_position_behind(b):
		return NAN
	var d := camera.unproject_position(b) - camera.unproject_position(a)
	return atan2(d.x, -d.y)


func _on_bounty(ship: Ship, gold: int) -> void:
	Progress.earn(gold)
	hud.toast("+%d gold bounty" % gold, "%s sunk" % ship.ship_name, 3.6)
	sound.coin()
	voyage.note("kill", "Sank the %s" % ship.ship_name, "%s · +%d gold" % [ship.cls.name, gold])
	# whatever she had bolted on is yours to pull from the wreck
	var fit: Dictionary = ship.model.fit
	if not fit.is_empty():
		get_tree().create_timer(1.4).timeout.connect(_find_part.bind(str(fit.values()[0]), "Salvaged from the wreck", ship.pos))


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
	Progress.keep_view(camera.zoom, camera.tilt)
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
	var swallowed := ""
	if p.last_cause == "maelstrom" and world.time - p.last_hit < 20.0:
		# the sea took her, whoever was shooting
		var st := hazards.state_of(p, 1.5)
		swallowed = str(st.m.name) if not st.is_empty() else "the maelstrom"
		foe = null
	elif foe == null:
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
		"miles": voyage.metres / 1852.0, "cause": cause, "maelstrom": swallowed,
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


## Sail again, off the farewell card: back up to the surface under the
## veil, and straight out on a fresh voyage in the same ship, from the
## waters you set out in last (the web's leaveWreck).
func _sail_again() -> void:
	if veil.busy or _farewell == null:
		return
	sound.click()
	veil.cover("Back to the surface…", func() -> void:
		_reset_world(player.cls.id)
		_enter_harbour(false)
		_start_voyage(Progress.start_sea))


## Choose a new ship, off the farewell card: back up to the surface under
## the veil, into the harbour.
func _wreck_to_harbour() -> void:
	if veil.busy or _farewell == null or not wreck.can_leave():
		return
	sound.click()
	veil.cover("Back to the surface…", func() -> void:
		_reset_world(player.cls.id)
		_enter_harbour())


## Return to harbour, off the pause screen (pressed twice): the voyage given
## up, and back to the harbour under the veil.
func _quit_voyage() -> void:
	if veil.busy or not paused:
		return
	_note_tour("back to harbour")
	veil.cover("Back to harbour…", func() -> void:
		_unpause()
		_reset_world(player.cls.id)
		_enter_harbour())


## A fresh sea for the next voyage: every ship, shot, wreck and piece of
## salvage gone, the voyage's log and chart cleared, and a new ship of class
## `id` in your colours.
func _reset_world(id: String) -> void:
	sound.submerge(false)
	sound.high_seas(false)
	_let_go()
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
	_high_seas = false
	paused = false
	_build_player(id)
	world.ships.append(player)
	player.struck.connect(func(a: float) -> void: camera.shake(a))
	camera.snap_to(player.pos)
	hud.watch_hold(hold)
	helm.disengage()
	helm.prepare(player.cls)


## Whether the game opens in the harbour, as it does for play: not for a
## set piece at sea (a shot of the voyage, a fight, a farewell, a voyage on
## hold), unless a shot of the menus is asked for.
func _harbour_first() -> bool:
	if _args.has("menu") or _args.has("seapick") or _args.has("shipwright") or _args.has("vault-open") or (_args.has("settings") and not _args.has("pause")):
		return true
	for k: String in ["shot", "battle", "sink", "voyage", "at", "eye", "pause", "dock", "off"]:
		if _args.has(k):
			return false
	return true


## The harbour and the screens over the voyage: a trading port's market
## (and the prompt to come alongside), the sea picker, Anchored, Settings,
## the veil between scenes and the frame counter.
func _build_menus() -> void:
	harbour = Harbour.new()
	harbour.loadout = Progress.loadout
	harbour.roster = Progress.ships
	harbour.kept = func(id: String) -> bool: return Progress.claimed.has(id)
	harbour.picked.connect(_preview)
	harbour.sail.connect(_choose_sea)
	harbour.shipwright.connect(_open_shipwright)
	harbour.vault.connect(_open_vault)
	harbour.settings.connect(_open_settings)
	harbour.sound.connect(_toggle_sound)
	harbour.quit.connect(_quit_game)
	harbour.clicked.connect(sound.click)
	add_child(harbour)
	shipwright = Shipwright.new()
	shipwright.baker = outfitter.baker
	shipwright.changed.connect(outfitter.apply)
	shipwright.brush.connect(outfitter.set_painting)
	shipwright.designs_changed.connect(Progress.keep_designs)
	# a tab (or a part of her hull) brings the camera round to its own shot
	shipwright.focus.connect(func(what: String) -> void:
		_sw_focus = what
		_sw_az = 0.0)
	# the web's drag and pinch: a screen's width swings it 2.6 rad, within reason
	shipwright.swing.connect(func(dx: float) -> void: _sw_az = clampf(_sw_az - dx * 2.6, -1.25, 1.0))
	shipwright.zoom.connect(func(f: float) -> void: _sw_zoom = clampf(_sw_zoom * f, 0.6, 1.5))
	shipwright.done.connect(_close_shipwright)
	shipwright.clicked.connect(sound.click)
	# the Refit tab: a part fitted, the new ones looked at, where one is sold
	shipwright.fit.connect(_fit_part)
	shipwright.seen.connect(func() -> void: Progress.mark_seen())
	# the Guns tab: a broadside to see her blast and trail
	shipwright.test_fire.connect(_test_fire)
	shipwright.progress = Progress
	shipwright.where_sold = _where_sold
	Progress.parts_changed.connect(func() -> void: shipwright.set_parts(Progress.parts))
	add_child(shipwright)
	outfitter.flag_drawn.connect(shipwright.set_flag)
	shipwright.vault.connect(_open_vault)
	vault = VaultScreen.new()
	vault.progress = Progress
	vault.stage.connect(_vault_stage)
	# the opening is a quick cut-in; everything else glides
	vault.focus.connect(func(shot: String) -> void:
		_v_shot = shot
		camera.shot_pace = 1.1 if shot == "charge" else (0.9 if shot == "burst" else 0.75))
	vault.preview.connect(_vault_preview)
	# every full ten comes with a ship part on top, told when the vault closes
	vault.pulled.connect(func(n: int) -> void:
		if n == 10:
			var f := Progress.vault_bonus()
			if not f.is_empty():
				_v_finds.append(f))
	# the showcase keeps dressing her; the choice is kept (Progress.wear)
	vault.equipped.connect(func(_id: String) -> void: _vault_preview(_v_show))
	vault.sfx.connect(_vault_sound)
	vault.closed.connect(_close_vault)
	add_child(vault)
	harbour.vault_ready = _vault_ready()
	Progress.vault_changed.connect(func() -> void: harbour.vault_ready = _vault_ready())
	market = MarketPanel.new()
	market.sell.connect(_sell)
	market.sell_all.connect(_sell.bind(""))
	market.repair.connect(_repair)
	market.restock.connect(_restock)
	market.buy_part.connect(_buy_part)
	market.buy_firework.connect(_buy_firework)
	market.leave.connect(_cast_off)
	market.dock.connect(_dock_here)
	# (the market's buttons knock on the merchant's counter)
	market.clicked.connect(sound.knock)
	add_child(market)
	market.set_touch(hud.touch_ui())
	hud.touch_set.connect(market.set_touch)
	sea_pick = SeaPick.new()
	sea_pick.chosen.connect(_sail_from)
	sea_pick.back.connect(func() -> void: harbour.open(player.cls.id))
	sea_pick.clicked.connect(sound.click)
	add_child(sea_pick)
	pause_screen = PauseScreen.new()
	pause_screen.resume.connect(_resume)
	pause_screen.settings.connect(_open_settings)
	pause_screen.harbour.connect(_quit_voyage)
	pause_screen.quit.connect(_quit_game)
	pause_screen.clicked.connect(sound.click)
	add_child(pause_screen)
	settings_sheet = SettingsSheet.new()
	settings_sheet.clicked.connect(sound.click)
	add_child(settings_sheet)
	# a newer build of the game: an Update pill in the harbour, the card
	# once a run by itself, and Settings' Game updates row
	updater = Updater.new()
	add_child(updater)
	update_card = UpdateCard.new()
	update_card.updater = updater
	update_card.clicked.connect(sound.click)
	add_child(update_card)
	settings_sheet.updater = updater
	settings_sheet.updates.connect(_open_updates)
	settings_sheet.quit.connect(_quit_game)
	harbour.update.connect(_open_updates)
	updater.changed.connect(_on_update)
	updater.found.connect(_offer_update)
	veil = Veil.new()
	add_child(veil)
	fps_meter = FpsMeter.new()
	add_child(fps_meter)


## Settings changed: how hard the camera shakes, and the harbour's sound button.
func _on_settings() -> void:
	camera.shake_scale = Settings.shake
	harbour.set_sound(Settings.sound)


## The harbour's sound button: every sound on or off, kept.
func _toggle_sound() -> void:
	Settings.sound = not Settings.sound
	Settings.save()
	Settings.changed.emit()
	sound.click()


## Settings, over the harbour or the paused voyage.
func _open_settings() -> void:
	if settings_sheet.is_open() or veil.busy:
		return
	settings_sheet.open()
	_note_tour("Settings")


## Looks for a newer build: on the Android and Windows games (never in a smoke test),
## or a pretend one for a shot (--update-demo [offer|downloading|ready|failed]
## [--nocard]).
func _start_updates() -> void:
	if _args.has("update-demo"):
		# (--as-windows: the Windows game's card and pill)
		updater.desktop = updater.desktop or _args.has("as-windows")
		updater.demo(update_card.own_notes, "" if _args["update-demo"] is bool else str(_args["update-demo"]))
		# (--nocard: just the harbour's Update pill)
		if not _args.has("nocard"):
			_offer_update(0.0)
	elif (OS.has_feature("android") or OS.has_feature("windows")) and not _args.has("smoke"):
		updater.start()


## The Update pill's words: Update, how far its download has got, Install.
func _on_update() -> void:
	var label := ""
	match updater.state:
		Updater.OFFER, Updater.FAILED:
			label = "Update"
		Updater.DOWNLOADING:
			label = "%d%%" % roundi(updater.progress() * 100.0)
		Updater.VERIFYING:
			label = "100%"
		Updater.READY, Updater.INSTALLING:
			label = "Restart" if updater.desktop else "Install"
	harbour.set_update(label)


## A newer build is out: its card comes up over the harbour by itself (once
## a run, `after` s in, when nothing else is up).
func _offer_update(after := 1.6) -> void:
	if _update_shown or not updater.available():
		return
	get_tree().create_timer(after).timeout.connect(func() -> void:
		if _update_shown or not updater.available() or state != State.HARBOUR or not harbour.is_open() or veil.busy:
			return
		if settings_sheet.is_open() or vault.is_open() or sea_pick.is_open() or shipwright.is_open() or update_card.is_open():
			return
		_update_shown = true
		update_card.ship = player.cls.id
		update_card.open())


## The Update pill or Settings' row: the card (asking GitHub again first
## when there's nothing newer known).
func _open_updates() -> void:
	if veil.busy:
		return
	settings_sheet.close()
	if updater.state in [Updater.IDLE, Updater.CURRENT]:
		updater.check()
	update_card.ship = player.cls.id
	update_card.open()


## The menus a shot opens on (--seapick, --pause, --settings, --shipwright
## TAB with --paint, --any-colour or --refit SLOT|PART).
func _stage_menus() -> void:
	if _args.has("shipwright"):
		_open_shipwright(true)
		shipwright.pick_tab(str(_args.shipwright))
		if _args.has("refit"):
			# a slot's track on the Refit tab and its fitted step tapped, or a
			# part's (--refit hull:aegis), or the standard fit's (hull:standard)
			var r := str(_args.refit)
			shipwright.pick_part(r.get_slice(":", 0), "?" if not r.contains(":") else ("" if r.ends_with(":standard") else r))
		if _args.has("paint"):
			# a flourish of gold across her flag, the brush still out
			shipwright.paint_stroke(PackedVector2Array([Vector2(0.18, 0.78), Vector2(0.32, 0.62), Vector2(0.48, 0.7), Vector2(0.64, 0.52), Vector2(0.8, 0.6)]))
		if _args.has("any-colour"):
			shipwright.pick_any()
	if _args.has("vault-open"):
		_open_vault()
		_v_drive = 1 if vault.is_open() else 0
	if _args.has("seapick"):
		_choose_sea()
	if _args.has("pause"):
		_pause()
	if _args.has("settings"):
		_open_settings()


## Into the harbour: your ship at anchor off the home port with every sail
## set, the camera circling her; `menu` brings up the harbour's menu, a sail
## or two on the horizon and the harbour's theme (Sail again goes straight
## out through it instead).
func _enter_harbour(menu := true) -> void:
	state = State.HARBOUR
	paused = false
	_picked_ship = ""
	shipyard.harbour = true
	shipyard.want = ""
	_high_seas = false
	sound.high_seas(false)
	atmosphere.climate = &"home"
	_moor(player)
	hud.fade(false, 0.0)
	controls.reset()
	if not menu:
		return
	pirates.dress_harbour()
	home.build_soon()
	harbour.open(player.cls.id)
	harbour.set_sound(Settings.sound)
	camera.orbit_frame = harbour.framing()
	camera.orbit_snap()
	sound.harbour(true)
	_note_tour("in the harbour")
	updater.harbour()
	_offer_update()


## Her at anchor off the home port, every sail set and drawing (the web's
## setPreview), the orbit framed on her.
func _moor(p: Ship) -> void:
	p.place(SPAWN.x, SPAWN.y, SPAWN_HEADING)
	p.anchored = true
	p.sail_target = 1.0
	p.sail_level = 1.0
	_frame_orbit(p)


## The orbit's subject: her bounds in her own frame, where she rides.
func _frame_orbit(p: Ship) -> void:
	camera.orbit_box = _own_box(p)
	camera.orbit_xf = Transform3D(Basis(Vector3.UP, p.heading), Vector3(p.pos.x, p.position.y, p.pos.z))
	camera.snap_to(p.pos)


## Her bounds, hull and rig, bowsprit to taffrail and keel to the highest
## truck, in her own frame (the waterline amidships, bow along +z); below
## the waterline only the 1.5 m that might show.
func _own_box(s: Ship) -> AABB:
	var inv := s.global_transform.affine_inverse()
	var box := AABB()
	var first := true
	for n in s.model.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		if mi.mesh == null or not mi.is_visible_in_tree():
			continue
		var b := (inv * mi.global_transform) * mi.get_aabb()
		box = b if first else box.merge(b)
		first = false
	if first:
		return camera.orbit_box
	var lo := maxf(box.position.y, -1.5)
	box.size.y -= lo - box.position.y
	box.position.y = lo
	return box


## A ship picked on the harbour's picker: her card at once, and she comes in
## to anchor as soon as the yard has her hull ready (_swap_in).
func _preview(id: String) -> void:
	if state != State.HARBOUR or veil.busy:
		return
	_picked_ship = "" if id == player.cls.id else id
	shipyard.want = _picked_ship
	harbour.set_ship(id)
	Progress.pick_ship(id)
	_note_tour("picked the %s" % id)
	_swap_in(false)


## The ship picked comes in to anchor in place of the one there: her hull
## off the yard's slipway once it's ready (nothing yet till then), or with
## `now` built on the spot.
func _swap_in(now: bool) -> void:
	if _picked_ship == "":
		return
	var id := _picked_ship
	var model := shipyard.take(id, Shipyard.MINE)
	if model == null and not now:
		return
	_picked_ship = ""
	shipyard.want = ""
	var old := player
	var sails := old.sail_level
	old.removed = true
	world.ships.erase(old)
	old.queue_free()
	player = Ship.create(ShipClass.named(id), Livery.named(Shipyard.MINE), world, Ship.Team.PLAYER, model, Progress.loadout(id))
	_arm(player)
	add_child(player)
	player.ship_name = outfitter.name_for(player.cls)
	outfitter.ship = player
	world.ships.append(player)
	player.struck.connect(func(a: float) -> void: camera.shake(a))
	_moor(player)
	player.sail_level = sails
	helm.prepare(player.cls)
	_note_tour("the %s at anchor" % id)


## Set Sail: "Where shall we sail?" over the harbour.
func _choose_sea() -> void:
	if state != State.HARBOUR or veil.busy or sea_pick.is_open():
		return
	sound.click()
	harbour.close()
	sea_pick.setup(_sea_cards())
	sea_pick.open(Progress.start_sea, Progress.sea_picked)
	_note_tour("Set Sail")


## The Shipwright, at the home port (the web's openShipwright): she rows
## round from the anchorage behind the veil (`now`: at once) and ties up
## alongside its quay, the harbour's menu gone and the other ships out of the
## picture, and the camera stands off her seaward side on the Flag tab's
## shot of her flag, the town behind her, with the panel down the right.
func _open_shipwright(now := false) -> void:
	if state != State.HARBOUR or veil.busy or shipwright.is_open() or sea_pick.is_open():
		return
	if now:
		_into_port()
	else:
		veil.cover("Rowing to %s…" % home.title, _into_port)


func _into_port() -> void:
	if state != State.HARBOUR:
		return
	harbour.close()
	# the ship picked comes round, even if the yard hasn't finished her hull
	_swap_in(true)
	var p := player
	for s in world.ships:
		s.visible = s == p
	var b := home.berth(p.cls.beam)
	p.place(b.x, b.y, b.z)
	p.anchored = true
	p.sail_target = 1.0
	p.sail_level = 1.0
	home.show_port(outfitter.look, p)
	_sw_side = -1.0
	_sw_face = 0.0
	_sw_focus = "flag"
	_sw_az = 0.0
	_sw_zoom = 1.0
	_sw_t = 0.0
	shipwright.place = home.title
	shipwright.open(outfitter.look, Progress.designs, p.cls.id, Progress.parts)
	shipwright.set_flag(outfitter.flag_texture())
	camera.begin_shot()
	_frame_shipwright(0.0)
	camera.snap_shot()
	sound.quay(true)
	_note_tour("Shipwright at %s" % home.title)


## Done at the Shipwright: back out to the anchorage behind the veil, the
## port put away, her at anchor again with the camera circling her and the
## harbour's menu up.
func _close_shipwright() -> void:
	if not shipwright.is_open() or veil.busy:
		return
	veil.cover("Back to the open sea…", _out_of_port)


func _out_of_port() -> void:
	shipwright.close()
	outfitter.baker.forget()
	home.hide_port()
	for s in world.ships:
		s.visible = true
	camera.port = false
	sound.quay(false)
	if state != State.HARBOUR:
		return
	_moor(player)
	harbour.open(player.cls.id)
	camera.orbit_frame = harbour.framing()
	camera.orbit_snap()
	_note_tour("left the Shipwright")


## A part fitted at the Shipwright, or the standard fit (""): hers, and the
## yard builds it into her (Outfitter); a burst of its rarity's light where
## it goes on, and its chime (the web's refitPreview).
func _fit_part(slot: String, id: String) -> void:
	var p := player
	Progress.equip(p.cls.id, slot, id)
	var pt := Parts.part(id)
	if pt.is_empty():
		return
	var sh := p.model.shape
	var mast: Dictionary = p.cls.masts[0]
	var local: Vector3 = {
		"hull": Vector3(0.0, sh.top(0.5) + 0.6, 0.0),
		"sails": Vector3(0.0, float(mast.height) * 0.7, sh.z(float(mast.t))),
		"guns": Vector3(0.0, sh.main_deck_y(0.5) + 1.0, 0.0),
		"figure": Vector3(0.0, sh.top(1.0), sh.z(1.0) + 0.6),
	}[slot]
	var tier := mini(4, int(pt.tier) + 1)
	world.fx.treasure(p.model.to_global(local), Loot.GLOW[tier], tier)
	# new guns want trying out
	if slot == "guns":
		get_tree().create_timer(0.65).timeout.connect(_test_fire)
	if int(pt.tier) >= 2:
		sound.treasure(tier)
	else:
		sound.coin()


## The Guns tab's broadside (the web's testFire): from the side with open
## water off it (the deeper 45 m out), at a point 70 m out and a touch
## ahead, the camera swung round to watch. (`anywhere`: a shot's flag, at sea too.)
func _test_fire(anywhere := false) -> void:
	var p := player
	if p == null or not (anywhere or shipwright.is_open()):
		return
	var left := p.port_dir()
	var hl := world.ground_height(p.pos.x + left.x * 45.0, p.pos.z + left.z * 45.0)
	var hr := world.ground_height(p.pos.x - left.x * 45.0, p.pos.z - left.z * 45.0)
	var k := 1 if hl <= hr else -1
	p.reload[p.side_index(k)] = 0.0
	var at := p.pos + left * (k * 70.0) + Vector3(sin(p.heading), 0.0, cos(p.heading)) * 6.0
	at.y = 0.0
	if p.fire(k, null, at):
		_sw_az = 0.5 if k > 0 else -0.5


## What the vault's screen asks of its chest out on the sea.
func _vault_stage(op: String, tier: int) -> void:
	match op:
		"charge":
			vstage.charge(tier)
		"burst":
			vstage.burst(tier)
		"pulse":
			vstage.pulse(tier)
		_:
			vstage.settle()


func _vault_sound(what: String, tier: int) -> void:
	match what:
		"rumble":
			sound.vault_rumble(tier)
		"burst":
			sound.vault_burst(tier)
		"flip":
			sound.card_flip(tier)
		"coin":
			sound.coin()
		_:
			sound.click()


## A free open waiting today or a find not yet looked at: the harbour's
## Vault pill wears its pip.
func _vault_ready() -> bool:
	return Cosmetics.free_ready(Progress.vault) or not (Progress.vault.unseen as Array).is_empty()


## The Treasure Vault (the web's openVault), over the harbour or over the
## Shipwright at the home port: a gilded chest surfaces beside her on the
## side with open water, and the camera glides down off her quarter to it.
func _open_vault() -> void:
	if vault.is_open() or veil.busy or state != State.HARBOUR:
		return
	_v_wright = shipwright.is_open()
	if _v_wright:
		shipwright.set_away(true)
	else:
		if not harbour.is_open() or sea_pick.is_open() or settings_sheet.is_open():
			return
		harbour.close()
		# the ship picked comes round, even if the yard hasn't finished her hull
		_swap_in(true)
		camera.begin_shot()
	_v_shot = "home"
	_v_show = ""
	_v_t = 0.0
	_v_fire = 0.0
	camera.shot_pace = 0.55
	vstage.show_by(player, _sea_side(player))
	vault.open()
	_frame_vault(0.0)
	_note_tour("Treasure Vault")


## Done with the vault (the web's closeVault): the chest sinks, she's back
## in what she wears, a ten-pull's bonus parts are told, and the camera
## goes back to the harbour's orbit or the Shipwright's shot.
func _close_vault() -> void:
	if not vault.is_open():
		return
	vault.close()
	for i in _v_finds.size():
		get_tree().create_timer(0.5 + i * 0.9).timeout.connect(_announce_part.bind(_v_finds[i], "Bonus from the Treasure Vault"))
	_v_finds.clear()
	_v_show = ""
	vstage.hushed = false
	vstage.sink()
	_dress()
	camera.port_frame = Vector4(0.0, 0.0, 1.0, 1.0)
	camera.shot_pace = 1.0
	camera.shot_fov = 38.0
	if _v_wright and shipwright.is_open():
		shipwright.set_away(false)
	elif state == State.HARBOUR:
		camera.leave_shot()
		harbour.open(player.cls.id)
		camera.orbit_frame = harbour.framing()
	_note_tour("left the vault")


## Which side of her has the open water, a little astern (+1 port, -1
## starboard): the chest surfaces there (the web's seaSide).
func _sea_side(s: Ship) -> int:
	var l := s.port_dir()
	var back := -s.forward() * (s.cls.length * 0.5)
	var hp := 0.0
	var hs := 0.0
	for r: float in [14.0, 30.0, 55.0]:
		hp += world.ground_height(s.pos.x + l.x * r + back.x, s.pos.z + l.z * r + back.z)
		hs += world.ground_height(s.pos.x - l.x * r + back.x, s.pos.z - l.z * r + back.z)
	return 1 if hp <= hs else -1


## The showcase: she tries on an item (`id`), or goes back to what she
## wears (""); a skin is shown off on the whole of her, a blast or a trail
## in a broadside every few seconds (the web's vaultPreview).
func _vault_preview(id: String) -> void:
	_v_show = id
	vstage.hushed = id != ""
	_dress()
	if id == "" or player == null:
		return
	var it := Cosmetics.item(id)
	if it.is_empty():
		return
	if str(it.kind) == "skin":
		var l := Livery.named(Shipyard.MINE)
		l.skin = Cosmetics.skin(id)
		ShipModel.restyle(l)
		if player.dmg != null:
			player.dmg.repaint()
		_v_shot = "ship"
	else:
		if str(it.kind) == "blast":
			player.blast = Cosmetics.style_of(id)
		else:
			player.trail = Cosmetics.style_of(id)
		_v_shot = "guns"
		_v_fire = minf(_v_fire, 1.1)
	camera.shot_pace = 0.7


## The vault's camera, framed in the space its panels leave free, and the
## showcase's broadsides coming every 3.4 s; the chest's place on screen
## handed to the screen for its tap target and the cards' flight.
func _frame_vault(dt: float) -> void:
	if not vstage.active or player == null:
		return
	_v_t += dt
	var vp := get_viewport().get_visible_rect().size
	var r := vault.free_rect()
	var fw := maxf(1.0, r.size.x)
	var fh := maxf(1.0, r.size.y)
	var mid := r.get_center()
	camera.port_frame = Vector4(mid.x / vp.x - 0.5, mid.y / vp.y - 0.5, fw / vp.x, fh / vp.y)
	var fit := clampf(pow(maxf(1.3 / (fw / vp.y), vp.y / fh), 0.85), 1.0, 2.4)
	var shot := vstage.shot(_v_shot, fit, _v_t)
	camera.shot_pos = shot[0]
	camera.shot_look = shot[1]
	camera.shot_fov = shot[2]
	if _v_shot == "guns" and _v_show != "":
		_v_fire -= dt
		if _v_fire <= 0.0:
			_v_fire = 3.4
			var g := vstage.gun_side()
			var side: int = g[0]
			player.reload[player.side_index(side)] = 0.0
			player.fire(side, null, g[1])
	vault.chest_rect = vstage.screen_rect(camera) if _v_shot == "home" else Rect2()
	vault.chest_at = vstage.screen_point(camera)


## A shot of the vault (--vault-open [home|opening|reveal|show|coll|odds] over
## the harbour, or over the Shipwright with --shipwright TAB): --vault-pull
## 1|10 opens the chest (the purse topped up for it), skipping to the cards
## unless the view is the opening; reveal and show turn them all over,
## show then shows card --vault-show I off on her (--vault-equip wears
## it); coll opens the collection on --vault-kind skin|blast|trail (and
## with --vault-show I shows its card I off).
func _drive_vault() -> void:
	var want := str(_args["vault-open"]) if _args["vault-open"] is String else "home"
	match _v_drive:
		1:
			if _args.has("vault-pull"):
				var n := 10 if int(_args["vault-pull"]) == 10 else 1
				var cost := Cosmetics.TEN_COST if n == 10 else Cosmetics.PULL_COST
				if Progress.purse < cost:
					Progress.earn(cost - Progress.purse + 120)
				vault.buy(n)
				if want != "opening":
					vault.go_back()
				_v_drive = 2
			else:
				if want == "coll":
					vault.show_collection(str(_args.get("vault-kind", "skin")))
					if _args.has("vault-show"):
						vault.show_card(int(_args["vault-show"]))
				elif want == "odds":
					vault.show_odds()
				_v_drive = 0
		2:
			if vault.cards_out():
				if want == "reveal" or want == "show":
					vault.reveal_all()
				_v_drive = 3 if want == "show" else 0
		3:
			if vault.all_open():
				vault.show_card(int(_args.get("vault-show", 0)))
				if _args.has("vault-equip"):
					vault.equip_shown()
				_v_drive = 0


## Which trading port's shipwright has a part in today ("" none: the web's whereSold).
func _where_sold(id: String) -> String:
	for port in ports.ports:
		for pt in Parts.port_stock(port.index + 1):
			if pt.id == id:
				return port.title
	return ""


## The Shipwright's camera on whatever the open tab is about, framed in the
## space its panel leaves, swaying a little (the web's framePort).
func _frame_shipwright(dt: float) -> void:
	_sw_t += dt
	var sway := sin(_sw_t * 0.16) * 0.07
	var fit := _fit_panel(shipwright.panel_rect())
	var shot := _wright_shot(_sw_focus, player, _sw_az + sway, _sw_zoom * fit)
	if _args.has("port-eye"):
		# a shot's own lens on the home port (in its frame: +x along the quay, +z out to sea)
		shot = [home.xf * _vec3(str(_args["port-eye"])), home.xf * _vec3(str(_args.get("port-look", "0,2,-8")))]
	camera.shot_pos = shot[0]
	camera.shot_look = shot[1]
	camera.shot_fov = 38.0
	camera.shot_pace = 1.0


## The Shipwright's shot of her (the web's port.shot): where the camera
## stands and what it looks at for her flag, her sails, her hull, her
## figurehead, her guns or the whole of her, swung `az` round her from the shot's own angle and `zoom`
## times as far off. Her flag is seen face on however the wind streams it.
func _wright_shot(focus: String, s: Ship, az: float, zoom: float) -> Array[Vector3]:
	var L := s.cls.length
	var c := Vector3(s.pos.x, 0.0, s.pos.z)
	var along := s.forward()
	var out := s.port_dir() * _sw_side
	var mast_h := s.model.flag_pivot.global_position.y
	var look: Vector3
	var dist: float
	var elev: float
	var a0: float
	match focus:
		"flag":
			var fb := s.model.flag_pivot.global_basis
			var n := Vector3(fb.z.x, 0.0, fb.z.z).normalized()
			# the face toward the camera's side of her, kept until the wind
			# has swung it well round (no flapping from face to face)
			if _sw_face == 0.0:
				_sw_face = 1.0 if n.dot(out) >= 0.0 else -1.0
			elif n.dot(out) * _sw_face < -0.3:
				_sw_face = -_sw_face
			out = n * _sw_face
			# toward her hoist, as the web's shot stands toward her bow
			along = -Vector3(fb.x.x, 0.0, fb.x.z).normalized()
			look = s.model.flag_centre()
			dist = 10.0 + L * 0.22
			elev = 0.05
			a0 = 0.35
		"sails":
			look = c + Vector3.UP * mast_h * 0.5
			dist = L * 1.05 + 16.0
			elev = 0.14
			a0 = 0.32
		"hull":
			look = c + Vector3.UP * 1.6
			dist = L * 0.78 + 10.0
			elev = 0.1
			a0 = 0.42
		"bow":
			# the figurehead: from ahead and a little off to the side
			look = s.model.to_global(s.model.figure_at)
			dist = 8.0 + L * 0.22
			elev = 0.1
			a0 = 0.62
		"guns":
			look = c + Vector3.UP * (s.model.shape.main_deck_y(0.5) + 0.4)
			dist = L * 0.6 + 8.0
			elev = 0.16
			a0 = 0.18
		_:
			look = c + Vector3.UP * mast_h * 0.3 + along * 4.0
			dist = L * 1.2 + 26.0
			elev = 0.3
			a0 = 0.48
	var a := a0 + az
	var dir := out * cos(a) + along * sin(a)
	var eye := look + dir * cos(elev) * dist * zoom + Vector3.UP * sin(elev) * dist * zoom
	eye.y = maxf(eye.y, 2.2)
	return [eye, look]


## What the sea picker shows of each archipelago: its isles, where you'd
## weigh anchor, and what lies there (the web's seaCards).
func _sea_cards() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for r in regions:
		var markets := 0
		for p: Dictionary in r.ports:
			if not bool(p.get("home", false)):
				markets += 1
		var forts := r.forts.size()
		var chips: Array[String] = ["%d market%s" % [markets, "" if markets == 1 else "s"], "%d fort%s" % [forts, "" if forts == 1 else "s"]]
		if r.id == "home":
			chips.push_front("Home harbour")
		else:
			chips.append("Charted" if Progress.charted(r.id) else "+600 gold landfall")
		var gold := -1
		for i in chips.size():
			if chips[i].begins_with("+"):
				gold = i
		var b := Vector3(SPAWN.x, SPAWN.y, SPAWN_HEADING) if r.id == "home" else _berth_in(r)
		out.append({"id": r.id, "name": r.title, "region": r, "isles": r.islands, "berth": Vector2(b.x, b.y), "chips": chips, "gold": gold})
	return out


## A sea chosen on the picker: at home she weighs anchor at once; away, the
## veil comes over while she's taken across to its berth.
func _sail_from(id: String) -> void:
	if state != State.HARBOUR or veil.busy:
		return
	var r := _region(id)
	if r == null or r.id == "home":
		_start_voyage("home")
		return
	veil.cover("Setting a course for %s…" % r.title, func() -> void: _start_voyage(id))


## Weighs anchor on a fresh voyage: out of the home port, or off `sea`'s
## berth (moored there first), with two-thirds of her canvas set and the
## camera swinging down behind her.
func _start_voyage(sea: String) -> void:
	_swap_in(true)
	var away: Region = _region(sea) if sea != "home" else null
	if away != null:
		_moor_in(away)
	harbour.close()
	sea_pick.close()
	state = State.VOYAGE
	# the helmsman lays out the waters for her hull (if he hasn't already)
	helm.disengage()
	helm.prepare(player.cls)
	shipyard.harbour = false
	shipyard.want = ""
	sound.harbour(false)
	var p := player
	p.anchored = false
	p.sail_target = 2.0 / 3.0
	p.ammo = Ammo.ROUND
	voyage = Voyage.new()
	discovered.clear()
	# the cutthroats are back round their fires, their chests full again
	shore.reset_camps()
	stock = Ammo.fresh_stock()
	world.sky.clear()
	_sync_fw()
	hold = Treasure.Hold.new(int(Treasure.HOLD_ROOM.get(p.cls.id, 10)))
	_hold_nag = 0.0
	_hauled = 0
	hud.watch_hold(hold)
	hud.reset()
	controls.reset()
	camera.orbit = false
	# the view she last sailed with, else a comfortable middle distance
	if Progress.view.x >= 0.0:
		camera.set_view(Progress.view.x, Progress.view.y)
	else:
		var vp := get_viewport().get_visible_rect().size
		camera.set_view(0.5 if vp.x < vp.y else 0.42, 0.0)
	pirates.set_sail()
	Progress.pick_sea(away.id if away != null else "home")
	if away != null:
		_arrive(away)
	else:
		hud.toast("Weigh anchor", "The %s sets sail" % p.ship_name, 3.0)
	_tell_keys()
	_note_tour("sailed from %s" % (away.id if away != null else "home"))


## Exit game (a computer's): what's kept is written, and the window closes.
func _quit_game() -> void:
	Progress.save()
	Settings.save()
	get_tree().quit()


## On a computer, the first voyage of a run: the keys, once, after the
## first toast has had its moment (Settings lists them all).
func _tell_keys() -> void:
	if _keys_told or not Settings.desktop or hud.touch_ui() or _args.has("shot") or _args.has("smoke"):
		return
	_keys_told = true
	await get_tree().create_timer(3.4).timeout
	if state == State.VOYAGE and _farewell == null and not hud.touch_ui():
		hud.toast("A · D steer   W · S sails   Q · E fire", "Click the sea to aim · M the chart · Esc pauses", 6.0)


## Her anchorage moved to `r`'s berth (in deep water, clear of other
## ships), the orbit with her.
func _moor_in(r: Region) -> void:
	var b := _berth_in(r)
	var at := _deep_for(player, b.x, b.y, b.z)
	player.place(at.x, at.y, b.z)
	_frame_orbit(player)


## Where a voyage away from home weighs anchor: off the archipelago's first
## market's quay, bows to the sea (x, z and her heading).
func _berth_in(r: Region) -> Vector3:
	for p: Dictionary in r.ports:
		if bool(p.get("home", false)):
			continue
		var nx := float(p.nx)
		var nz := float(p.nz)
		return Vector3(float(p.x) + nx * 75.0, float(p.z) + nz * 75.0, atan2(nx, nz))
	var at: Variant = pirates.find_open_water(r.centre.x, r.centre.z, 300.0, 600.0)
	var w: Vector2 = at if at != null else Vector2(r.centre.x + 600.0, r.centre.z)
	return Vector3(w.x, w.y, atan2(w.x - r.centre.x, w.y - r.centre.z))


## A berth near (x, z) deep enough for her on heading `h` and clear of other
## ships: the spot itself, else the nearest on a widening spiral round it,
## else open water further out (the web's deepFor).
func _deep_for(s: Ship, x: float, z: float, h: float) -> Vector2:
	var fwd := Vector2(sin(h), cos(h))
	var half := s.cls.length * 0.55
	if _berth_ok(s, x, z, fwd, half):
		return Vector2(x, z)
	for r in range(12, 193, 12):
		for k in 12:
			var a := k / 12.0 * TAU + r * 0.07
			var px := x + cos(a) * r
			var pz := z + sin(a) * r
			if _berth_ok(s, px, pz, fwd, half):
				return Vector2(px, pz)
	var w: Variant = pirates.find_open_water(x, z, 30.0, 220.0)
	return w if w != null else Vector2(x, z)


## Deep water under her keel bow, amidships and stern (lying along `fwd`,
## `half` her length either way), and no other ship close aboard.
func _berth_ok(s: Ship, x: float, z: float, fwd: Vector2, half: float) -> bool:
	for k: float in [-1.0, 0.0, 1.0]:
		if world.ground_height(x + fwd.x * half * k, z + fwd.y * half * k) > -s.cls.draft - 2.0:
			return false
	for o in world.ships:
		if o != s and not o.removed and Vector2(o.pos.x - x, o.pos.z - z).length() < (o.cls.length + s.cls.length) * 0.6:
			return false
	return true


func _region(id: String) -> Region:
	for r in regions:
		if r.id == id:
			return r
	return null


## Landfall in an archipelago, in off the high seas or setting out in it:
## its weather and its name; the first time ever, a reward for charting
## new waters.
func _arrive(r: Region) -> void:
	atmosphere.climate = &"mist" if r.id == "brumas" else &"home"
	if r.id != "home" and Progress.chart(r.id):
		player.gold += 600
		Progress.earn(600)
		voyage.note("isle", "Reached %s" % r.title, "+600 gold")
		hud.toast("%s · %s" % [r.title, r.motto], "New waters charted! +600 gold. Their isles, ports and forts are on your chart now", 6.5)
		sound.treasure(2)
	else:
		hud.toast(r.title, r.motto, 4.0)
		sound.chime()


# ------------------------------------------------------------------ trading ports

## Off a quay's seaward face: the prompt to come alongside (a tap on it, or
## F), unless pirates are on her tail (the web's updateDockPrompt).
func _prompt(dt: float) -> void:
	if shore.active:
		_shore_prompt()
	else:
		_dock_prompt(dt)


func _dock_prompt(dt: float) -> void:
	var p := player
	var port: TradePort = null
	if p.alive and _farewell == null:
		var near := ports.nearest(p.pos)
		if near != null and near.in_reach(p.pos):
			port = near
	if port == null:
		_land_prompt(dt)
		return
	_prompt_kind = "dock"
	var chased := _fighting() != null
	var n := hold.count()
	var why := "Repairs and fresh shot"
	if chased:
		why = "Shake off your pursuers to dock"
	elif n > 0:
		why = "Sell %d %s · repairs · shot" % [n, "good" if n == 1 else "goods"]
	market.set_dock({"name": port.title, "ok": not chased, "why": why})
	if not chased and controls.interact:
		_dock(port)


# ------------------------------------------------------------------ going ashore

## Off a beach: the prompt to row the captain and four hands ashore (F or a
## tap), unless she's chased, caught in a maelstrom's pull or under way.
func _land_prompt(dt: float) -> void:
	var p := player
	_land_t -= dt
	if _land_t <= 0.0:
		_land_t = 0.3
		_landing = shore_ground.landing(p.pos.x, p.pos.z, 55.0 + p.cls.beam) if p.alive and _farewell == null else {}
	if _landing.is_empty():
		market.set_dock({})
		_prompt_kind = ""
		return
	var isle := str(_landing.island.name)
	var chased := _fighting() != null
	var pulled := p.drawn > 0.05
	var sub := "The captain and four hands row in"
	if chased:
		sub = "Shake off your pursuers first"
	elif pulled:
		sub = "Not in the maelstrom's pull"
	var ok := not chased and not pulled
	market.set_dock({"name": isle, "title": "Go ashore on %s" % isle, "ok": ok, "why": sub})
	_prompt_kind = "land"
	if ok and controls.interact:
		_go_ashore()


## Ashore: the pill rows back from the boat.
func _shore_prompt() -> void:
	var pr := shore.prompt(player.name)
	if pr.is_empty():
		market.set_dock({})
		_prompt_kind = ""
		return
	market.set_dock({"name": pr.title, "title": pr.title, "ok": pr.ok, "why": pr.sub})
	_prompt_kind = str(pr.key)


## Lowers the boat: she rides at anchor while the landing party rows in,
## under the veil (`now`: at once, for a set piece).
func _go_ashore(now := false) -> void:
	var beach := _landing
	if beach.is_empty() or state != State.VOYAGE or not player.alive or _farewell != null or veil.busy or shore.active:
		return
	if _fighting() != null or player.drawn > 0.05:
		return
	controls.reset()
	hud.close_popups()
	market.set_dock({})
	if chart.is_open():
		chart.close()
	helm.disengage()
	var isle := str(beach.island.name)
	var row := func() -> void:
		if state != State.VOYAGE or not player.alive or _farewell != null:
			return
		var p := player
		p.anchored = true
		p.sail_target = 0.0
		p.rudder = 0.0
		p.speed = 0.0
		shore.land(p, beach, world)
		controls.foot = true
		hud.set_ashore(true, isle)
		_sea_zoom = camera.zoom
		camera.zoom = 0.32
		camera.foot = true
		camera.snap_foot()
		var cap := shore.captain
		camera.snap_to(Vector3(cap.x, cap.y + 1.0, cap.z))
		voyage.note("isle", "Went ashore on %s" % isle)
		sound.splash(0.35, 0.0, 20.0)
		hud.toast("Ashore", "%s: your hands follow your lead" % isle, 3.2)
		if not _shore_tip:
			_shore_tip = true
			var how := "Stick on the left to walk · Strike to swing, Pistol to fire · Jump to hop" if controls.touch else "WASD to walk · Click swings, chain three for a lunge · Q fires your pistol · Space jumps · F at the boat rows back"
			get_tree().create_timer(3.8).timeout.connect(func() -> void:
				# (not over a fight's own toasts)
				if shore.active and not shore.fighting():
					hud.toast("On foot", how, 6.0))
		_note_tour("ashore on %s" % isle)
	if now:
		row.call()
	else:
		veil.cover("Rowing ashore to %s…" % isle, row)


## Back into the boat and out to her: she weighs anchor under a little canvas.
func _return_to_ship(why := "") -> void:
	if not shore.active or veil.busy:
		return
	controls.reset()
	var p := player
	veil.cover(why if why != "" else "Rowing back to the %s…" % p.name, func() -> void:
		if not shore.active:
			return
		_leave_shore()
		p.anchored = false
		_set_sails(1.0 / 3.0)
		camera.snap_to(p.pos)
		_note_tour("rowed back to the %s" % p.name))


## Everyone aboard: the HUD, the controls and the camera go back to sailing.
func _leave_shore() -> void:
	if not shore.active:
		return
	shore.leave()
	controls.foot = false
	hud.set_ashore(false)
	market.set_dock({})
	_prompt_kind = ""
	camera.foot = false
	camera.snap_foot()
	camera.zoom = _sea_zoom


## F or a tap ashore: row back from the boat.
func _shore_act() -> void:
	if not shore.active or veil.busy:
		return
	if shore.interact() == "boat":
		_return_to_ship()
		return
	# (a chest opened: plundered says what was in it)
	_shore_prompt()


## Ashore: up the screen is north (the camera looks north), so the stick and
## the keys walk the captain the way they point; Space jumps, F acts.
func _control_shore() -> void:
	var w := controls.walk if _auto_walk == Vector2.ZERO else _auto_walk
	_steer.mx = w.x
	_steer.mz = -w.y
	_steer.run = controls.run or w.length() > 0.97
	_steer.jump = controls.jump
	# the cutlass on a click (or Strike), the pistol on Q / E (or Pistol),
	# swung and fired toward the pointer where there is one
	_steer.strike = controls.fire_aim or _hud_strike
	_steer.pistol = controls.fire_side != 0 or _hud_pistol
	_hud_strike = false
	_hud_pistol = false
	if _brawl:
		_brawl_steer()
		return
	_steer.has_aim = false
	if controls.pointer_active and not controls.touch and shore.captain != null:
		var o := camera.project_ray_origin(controls.pointer)
		var d := camera.project_ray_normal(controls.pointer)
		var y := shore.captain.y + 1.0
		if d.y < -0.02:
			var at := o + d * ((y - o.y) / d.y)
			_steer.has_aim = true
			_steer.aim = Vector2(at.x, at.z)
	if controls.interact:
		_shore_act()


## A camp roused: its cutthroats come running.
func _on_camp_alarm(_c: Shore.Camp) -> void:
	hud.toast("To arms!", "Cutthroats come running from their camp", 2.6)


## The last of a camp's gang down: the chest is theirs to open.
func _on_camp_routed(c: Shore.Camp) -> void:
	hud.toast("Camp routed", "Their chest is yours for the taking", 3.4)
	sound.chime()
	voyage.note("camp", "Routed a cutthroat camp", str(c.island.get("name", "")))
	_note_tour("routed camp %d" % c.index)


## The cutthroats' chest thrown open: gold, a chest's worth of plunder, shot
## for the racks and maybe a ship part.
func _on_camp_plundered(c: Shore.Camp) -> void:
	var at := Vector3(c.chest.global_position.x, c.chest.global_position.y + 1.2, c.chest.global_position.z)
	var gold := roundi(120.0 + randf() * 140.0 + c.gang.size() * 15.0)
	Progress.earn(gold)
	hud.floater("+%d gold" % gold, at + Vector3(0.0, 0.6, 0.0), camera, Floaters.Kind.GOOD, 10.0)
	var tier := Loot.roll_tier(0.5, 2)
	var res := hold.stow(Treasure.roll_contents(tier))
	var tossed: PackedStringArray = res.tossed
	if not tossed.is_empty():
		_nag_hold(tossed.size())
	_stock_ammo({Ammo.SHELL: 2, Ammo.FIRE: 1, Ammo.CHAIN: 1, Ammo.GRAPE: 2}, at)
	var kept := Array(res.kept as PackedStringArray)
	var rarity: String = Treasure.RARITY_NAME[tier]
	sound.treasure(tier)
	world.fx.treasure(at, Loot.GLOW[tier], tier)
	camera.shake(0.12)
	var names := ", ".join(kept.map(func(id: String) -> String: return Treasure.name_of(id)))
	voyage.note("chest", "Plundered a cutthroat camp", "%s chest · +%d gold%s" % [rarity, gold, (" · " + names) if names != "" else ""])
	if not kept.is_empty():
		kept.sort_custom(func(a: String, b: String) -> bool: return Treasure.rarity_of(a) > Treasure.rarity_of(b))
		var best: String = kept[0]
		var r := Treasure.rarity_of(best)
		hud.loot_toast(Icons.plunder(best, 48.0), r, "Cutthroats' %s chest" % rarity.to_lower(), Treasure.name_of(best), 3.4)
	else:
		hud.toast("Cutthroats' chest", "+%d gold" % gold, 3.0)
	_chest_part(tier, at, 1.2)
	_note_tour("plundered camp %d for %d gold" % [c.index, gold])


## The captain cut down ashore: the hands carry him off, some of the purse lost.
func _on_captain_fell() -> void:
	hud.toast("The captain is down", "The hands drag you back to the boat", 3.0)
	get_tree().create_timer(2.4).timeout.connect(func() -> void:
		if not shore.active:
			return
		var lost := mini(roundi(Progress.purse * 0.1), 200)
		if lost > 0 and Progress.spend(lost):
			hud.toast("-%d gold" % lost, "Lost in the scuffle", 3.0)
		_return_to_ship("The hands row you back, bruised…"))


func _on_hop(up: bool, k: float, wet: bool, hard: bool) -> void:
	sound.hop(up, k, wet, hard)
	if not up and k > 0.5:
		camera.shake(0.04 * k)


## A set piece ashore: `--beach` puts her off a beach (I: the island of her
## waters, by number), `--ashore` lands the party there at once; `--walk x,y`
## holds the stick (screen right, up; or `inland`, `inland-run` up the beach).
func _stage_ashore() -> void:
	var key := "ashore" if _args.has("ashore") else "beach"
	var arg := str(_args[key])
	var off := _beach_off(int(arg) if arg.is_valid_int() else 0)
	if off.is_empty():
		printerr("no beach to land on found")
		return
	player.place(off.x, off.z, off.heading)
	player.speed = 0.0
	player.sail_target = 0.0
	camera.snap_to(player.pos)
	_landing = shore_ground.landing(player.pos.x, player.pos.z, 55.0 + player.cls.beam)
	if key == "ashore":
		_go_ashore(true)
	if _args.has("walk") and shore.active:
		# (`inland`, up the beach; `inland-run`, at a run)
		var wa := str(_args.walk)
		if wa.begins_with("inland"):
			_auto_walk = Vector2(float(shore.landing.dx), -float(shore.landing.dz)) * (1.0 if wa.ends_with("run") else 0.6)
		else:
			var d := wa.split(",")
			_auto_walk = Vector2(float(d[0]), float(d[1]))


## A set piece by a cutthroat camp: `--camp N` lands the party on camp N's
## island and walks them up to a stone's throw short of its fire (in the
## lee of the tent, unseen); `--brawl` swings at them, `--plunder` too and
## opens the chest after.
func _stage_camp() -> void:
	var n := clampi(int(str(_args.camp)), 0, shore.camps.size() - 1)
	var c: Shore.Camp = shore.camps[n]
	var cx := float(c.site.x)
	var cz := float(c.site.z)
	# off the camp's own island, then the party set down short of the fire
	var isl: Dictionary = c.island
	var dir := Vector2(cx - float(isl.x), cz - float(isl.z)).normalized()
	var d := 0.0
	while d < 600.0 and world.ground_height(cx + dir.x * d, cz + dir.y * d) > -6.0:
		d += 4.0
	var bx := cx + dir.x * (d + 30.0)
	var bz := cz + dir.y * (d + 30.0)
	player.place(bx, bz, atan2(-dir.x, -dir.y))
	player.speed = 0.0
	player.sail_target = 0.0
	camera.snap_to(player.pos)
	_landing = shore_ground.landing(bx, bz, 80.0 + player.cls.beam)
	if _landing.is_empty():
		_landing = {"x": cx + dir.x * d, "z": cz + dir.y * d, "dx": -dir.x, "dz": -dir.y, "sand_x": cx + dir.x * 24.0, "sand_z": cz + dir.y * 24.0, "island": isl}
	_go_ashore(true)
	if not shore.active:
		printerr("no landing by camp %d" % n)
		return
	# (south of it where there's ground, so it's up the screen ahead of them)
	var stand := 22.0
	var a := 0.0
	var sx := cx + sin(a) * stand
	var sz := cz + cos(a) * stand
	for k in 24:
		var b := a + (k >> 1) * TAU / 24.0 * (1.0 if k % 2 == 0 else -1.0)
		if shore_ground.open(cx + sin(b) * stand, cz + cos(b) * stand) and shore_ground.height(cx + sin(b) * stand, cz + cos(b) * stand) > 0.3:
			sx = cx + sin(b) * stand
			sz = cz + cos(b) * stand
			break
	var face := atan2(cx - sx, cz - sz)
	for i in shore.party.size():
		var w := shore.party[i].walker
		var side := 0.0 if i == 0 else (1.0 if i % 2 == 1 else -1.0)
		var back := 0.0 if i == 0 else (1.4 if i < 3 else 2.8)
		w.place(sx - sin(face) * back + cos(face) * side * 1.4, sz - cos(face) * back - sin(face) * side * 1.4, face)
		w.y = shore_ground.height(w.x, w.z)
	camera.snap_to(Vector3(sx, shore.captain.y + 1.0, sz))
	_brawl = _args.has("brawl") or _args.has("plunder")
	_plunder = _args.has("plunder")


## `--brawl`'s hand on the captain: at the nearest cutthroat on their feet,
## the cutlass when close and the pistol when loaded; once the camp's routed,
## with `--plunder`, to the chest and open it.
func _brawl_steer() -> void:
	var cap := shore.captain
	_steer.mx = 0.0
	_steer.mz = 0.0
	_steer.strike = false
	_steer.pistol = false
	_steer.run = false
	_steer.has_aim = false
	var near: ShoreWalker = null
	var nd := INF
	var home: Shore.Camp = shore.camp_at(cap.x, cap.z, 60.0)
	if home == null:
		return
	for f in home.gang:
		var fd := Vector2(f.x - cap.x, f.z - cap.z).length()
		if f.alive() and not f.is_down() and fd < nd:
			nd = fd
			near = f
	if near != null:
		_steer.has_aim = true
		_steer.aim = Vector2(near.x, near.z)
		if nd > 1.7:
			_steer.mx = (near.x - cap.x) / nd
			_steer.mz = (near.z - cap.z) / nd
			_steer.run = nd > 6.0
		else:
			_steer.strike = true
		_steer.pistol = nd < 12.0 and nd > 4.0 and shore.pistol_load() >= 1.0
	elif _plunder and home.routed and not home.opened:
		var at: Vector3 = home.layout.chest
		var v := Vector2(at.x - cap.x, at.z - cap.z)
		if v.length() > 1.6:
			_steer.mx = v.normalized().x
			_steer.mz = v.normalized().y
		else:
			_shore_act()


## Where she can lie off island `n`'s beach (of the waters she's in): {x, z,
## heading} a little out from a landing, her bow on the island; {} if none.
func _beach_off(n: int) -> Dictionary:
	var r := world.region_at(player.pos.x, player.pos.z)
	if r == null:
		r = world.regions[0]
	var isles := r.islands.duplicate()
	for k in isles.size():
		var isl: Dictionary = isles[(n + k) % isles.size()]
		var cx := float(isl.x)
		var cz := float(isl.z)
		for j in 16:
			var a := j * TAU / 16.0 + 0.3
			var dir := Vector2(sin(a), cos(a))
			# out from the heart of the island to water deep enough for her keel
			var d := float(isl.r) * 0.6
			while d < float(isl.r) * 3.0 + 200.0 and world.ground_height(cx + dir.x * d, cz + dir.y * d) > -6.0:
				d += 4.0
			d += 22.0
			var x := cx + dir.x * d
			var z := cz + dir.y * d
			if ports.nearest(Vector3(x, 0.0, z)).in_reach(Vector3(x, 0.0, z)):
				continue
			if not shore_ground.landing(x, z, 55.0 + player.cls.beam).is_empty():
				return {"x": x, "z": z, "heading": atan2(-dir.x, -dir.y)}
	return {}


## The pirate she's fighting, if one is near (the web's battleFoe): one
## hunting her, or one she has traded shot with in the last 12 s.
func _fighting() -> Ship:
	var p := player
	var best: Ship = null
	var bd := INF
	if p.alive:
		var t := world.time
		for ai: PirateAI in pirates.ais.values():
			var s := ai.ship
			if not s.alive or s.removed:
				continue
			var d := Vector2(s.pos.x - p.pos.x, s.pos.z - p.pos.z).length()
			var engaged := ai.mode == PirateAI.Mode.ENGAGE and (ai.target == p or d < 160.0)
			var traded := (s.last_attacker == p and t - s.last_hit < 12.0) or (p.last_attacker == s and t - p.last_hit < 12.0)
			if (engaged or traded) and d < (320.0 if s == _last_foe else 270.0) and d < bd:
				bd = d
				best = s
	_last_foe = best
	return best


## Comes alongside: she ties up, the porters wake and the market opens (the
## web's dock), under the veil (`now`: at once, for a set piece).
func _dock(port: TradePort, now := false) -> void:
	if state != State.VOYAGE or not player.alive or _farewell != null or veil.busy:
		return
	controls.reset()
	hud.close_popups()
	market.set_dock({})
	var tie := func() -> void:
		if state != State.VOYAGE or not player.alive:
			return
		state = State.DOCKED
		dock_port = port
		hud.fade(false, 0.0)
		var p := player
		p.anchored = true
		p.sail_target = 0.0
		p.rudder = 0.0
		port.set_ship(p)
		var b := port.berth(p.cls.beam)
		p.place(b.x, b.y, b.z)
		market.open(port.title, port.market, hold, p.gold, world.time)
		_refresh_pyro()
		_services()
		_refresh_parts()
		_dock_t = 0.0
		camera.port = true
		_frame_dock(0.0)
		camera.snap_shot()
		voyage.note("trade", "Docked at %s" % port.title, str(port.spec.house))
		sound.port_arrive()
		_note_tour("docked at %s" % port.title)
	if now:
		tie.call()
	else:
		veil.cover("Coming alongside at %s…" % port.title, tie)


## The port's shot of her alongside, settling in and swaying a little over
## the quay, framed in the space the market's panel leaves (the web's frameDock).
func _frame_dock(dt: float) -> void:
	_dock_t += dt
	var fit := _fit_panel(market.panel_rect())
	var settle := 1.0 + 0.8 * exp(-_dock_t * 0.7)
	var sway := sin(_dock_t * 0.13) * 0.08
	var shot := dock_port.shot(player, sway, fit * settle)
	camera.shot_pos = shot[0]
	camera.shot_look = shot[1]


## Frames the camera's shot in the part of the screen a side panel (or a
## bottom sheet) leaves free; returns how far to stand back for it (the
## shots are framed for a wide free space: a narrow or short one backs off).
func _fit_panel(r: Rect2) -> float:
	var vp := get_viewport().get_visible_rect().size
	var fw := vp.x
	var fh := vp.y
	if r.size.x <= 0.0:
		camera.port_frame = Vector4(0.0, 0.0, 1.0, 1.0)
	elif r.position.x > vp.x * 0.35:
		camera.port_frame = Vector4(r.position.x * 0.5 / vp.x - 0.5, 0.0, r.position.x / vp.x, 1.0)
		fw = r.position.x
	else:
		camera.port_frame = Vector4(0.0, r.position.y * 0.5 / vp.y - 0.5, 1.0, r.position.y / vp.y)
		fh = maxf(r.position.y, vp.y * 0.2)
	return clampf(pow(maxf(1.17 / (fw / vp.y), vp.y / fh), 0.85), 1.0, 2.6)


## What the chandlery can do for her now: mend the hull (half a gold a
## point) and fill the racks of special shot (9 gold a broadside).
func _service_costs() -> Dictionary:
	var hp := maxi(0, ceili(player.max_hp - player.hp))
	var shot_n := 0
	for k: int in Ammo.SPECIALS:
		shot_n += maxi(0, int(Ammo.MAX[k]) - stock[k])
	return {"repair": ceili(hp * 0.5), "repair_hp": hp, "shot": shot_n * 9, "shot_n": shot_n}


func _services() -> void:
	var c := _service_costs()
	market.set_services(c.repair, c.repair_hp, c.shot, c.shot_n)
	market.set_gold(player.gold)


## Sells a lot (or, "", the whole hold) at today's prices: the porters carry
## it ashore, finest first, and the quay cheers a good sale.
func _sell(id: String) -> void:
	var port := dock_port
	if state != State.DOCKED or port == null:
		return
	var t := world.time
	var goods := PackedStringArray()
	var total := 0
	var best := 0
	var lots: Array = hold.list() if id == "" else [[id, hold.has(id)]]
	for lot: Array in lots:
		var n: int = lot[1]
		if n <= 0:
			continue
		total += port.market.price(lot[0], t) * n
		best = maxi(best, Treasure.rarity_of(lot[0]))
		hold.take(lot[0], n, false)
		for i in n:
			goods.append(lot[0])
	if total <= 0:
		return
	hold.changed.emit()
	player.gold += total
	Progress.earn(total)
	if id != "":
		market.sold(id, total)
	else:
		market.sold_all(total)
	_services()
	_refresh_parts()
	port.unload(goods)
	port.cheer(2.0 if total >= 1500 or best >= 4 else (1.0 if total >= 250 or best >= 2 else 0.5))
	sound.sale(total, best)
	var what := ("Sold %d × %s" % [goods.size(), Treasure.name_of(id)] if goods.size() > 1 else "Sold %s" % Treasure.name_of(id)) if id != "" else "Sold the hold (%d goods)" % goods.size()
	voyage.note("trade", what, "%s · +%d gold" % [port.title, total])
	_note_tour("sold %d for %d gold" % [goods.size(), total])


## The chandlery mends her hull: bolts of calico and a cheese come aboard.
func _repair() -> void:
	var port := dock_port
	var c := _service_costs()
	if state != State.DOCKED or port == null or c.repair <= 0 or c.repair > player.gold:
		return
	player.gold -= c.repair
	player.hp = player.max_hp
	port.unload(PackedStringArray(["calico", "calico", "cheese"].slice(0, 1 + mini(2, int(c.repair_hp) / 80))), true)
	sound.purchase(&"repair")
	_services()
	_note_tour("repaired for %d gold" % c.repair)


## Fresh special shot fills her racks: two casks come aboard.
func _restock() -> void:
	var port := dock_port
	var c := _service_costs()
	if state != State.DOCKED or port == null or c.shot <= 0 or c.shot > player.gold:
		return
	player.gold -= c.shot
	for k: int in Ammo.SPECIALS:
		stock[k] = int(Ammo.MAX[k])
	port.unload(PackedStringArray(["rum", "rum"]), true)
	sound.purchase(&"shot")
	_services()
	_note_tour("restocked for %d gold" % c.shot)


## The shipwright's counter at the quay she's tied to: today's three
## parts, which of them are yours already, and the purse (`bought`, one just
## bought, swells on it).
func _refresh_parts(bought := "") -> void:
	if dock_port == null:
		return
	var offers := []
	for pt in Parts.port_stock(dock_port.index + 1):
		offers.append({"part": pt, "owned": Progress.owns(pt.id)})
	market.set_parts(offers, Progress.purse, bought)


## The pyrotechnist's stall at the quay she's tied to: today's rockets (the
## same all day for a port), how many of each the locker holds and whether
## there's room for more.
func _refresh_pyro(bought := "") -> void:
	if dock_port == null:
		return
	var day := floori(Time.get_unix_time_from_system() / 86400.0)
	var offers := []
	for id in Fireworks.stall(dock_port.index + 1, day):
		offers.append({"id": id, "price": int(Fireworks.kind(id).price), "owned": Progress.rockets(id), "room": Progress.rocket_room(id)})
	market.set_pyro(offers, bought)


## A volley of rockets bought off the pyrotechnist (the web's buyFirework),
## out of the voyage's gold: a bolt of calico comes aboard and the quay cheers.
func _buy_firework(id: String) -> void:
	var port := dock_port
	if state != State.DOCKED or port == null or not Fireworks.KINDS.has(id):
		return
	var price := int(Fireworks.kind(id).price)
	if price > player.gold or Progress.rocket_room(id) <= 0:
		return
	player.gold -= price
	_stock_fireworks({id: 1}, null)
	port.unload(PackedStringArray(["calico"]), true)
	port.cheer(2.0 if Fireworks.tier(id) == 2 else 0.5)
	sound.purchase(&"shot")
	_services()
	_refresh_pyro(id)
	if Fireworks.tier(id) == 2:
		voyage.note("trade", "Bought a showpiece: %s" % Fireworks.kind(id).name, "%s · %s gold" % [port.title, MenuKit.num(price)])
	_note_tour("bought a %s for %d gold" % [id, price])


## A part bought off the shipwright, out of the purse (the web's buyPart):
## a bolt of calico comes aboard with it and the quay cheers.
func _buy_part(id: String) -> void:
	var port := dock_port
	var pt := Parts.part(id)
	if state != State.DOCKED or port == null or pt.is_empty() or Progress.owns(id):
		return
	var price: int = Parts.RARITIES[pt.tier].price
	if not Progress.spend(price):
		return
	var f := Progress.grant_part(id)
	if not f.is_empty():
		_announce_part(f, "Bought at %s" % port.title)
	port.unload(PackedStringArray(["calico"]), true)
	port.cheer(2.0 if int(pt.tier) >= 3 else 1.0)
	_refresh_parts(id)
	voyage.note("trade", "Bought %s" % pt.name, "%s · %s gold" % [port.title, MenuKit.num(price)])
	_note_tour("bought %s for %d gold" % [id, price])


## A chest may have a ship part in it (the web's chestPart), the finer the
## chest the likelier and the finer, and her figurehead's luck on top; found
## `delay` s after she hauls it up.
func _chest_part(tier: int, at: Vector3, delay: float) -> void:
	var t := Parts.chest_part(tier, float(Parts.loadout_stats(player.model.fit).luck))
	if t < 0:
		return
	var found := Parts.roll_part(t, Progress.owns)
	get_tree().create_timer(delay).timeout.connect(_find_part.bind(str(found.id), "In the treasure chest" if tier >= 3 else "Found in the salvage", at))


## A part into the locker, and told (the web's findPart).
func _find_part(id: String, kicker: String, at: Variant = null) -> void:
	var f := Progress.grant_part(id)
	if not f.is_empty():
		_announce_part(f, kicker, at)


## A part come into the locker, told as its rarity deserves (the web's
## announcePart): a toast with its portrait, a line in the log, a chime and,
## at `at` on the sea, a burst of its colour; a spare is paid out in gold.
func _announce_part(f: Dictionary, kicker: String, at: Variant = null) -> void:
	var pt: Dictionary = f.part
	var tier: int = pt.tier
	var rarity: Dictionary = Parts.RARITIES[tier]
	var refund: int = f.refund
	if refund > 0:
		Progress.earn(refund)
	var slot := str(Parts.SLOT_NAMES[pt.slot]).to_lower()
	var title: String = pt.name if f.fresh else "%s (spare · +%s gold)" % [pt.name, MenuKit.num(refund)]
	hud.loot_toast(Icons.part(pt.id, 48.0), [0, 2, 3, 4, 5][tier], "%s %s · %s" % [rarity.name, slot, kicker], title, 4.6 if tier >= 3 else 3.6)
	voyage.note("chest", "Found %s" % pt.name, "%s %s%s" % [rarity.name, slot, " · fit it at the Shipwright" if f.fresh else ""])
	var glow := mini(4, tier + 1)
	sound.treasure(glow)
	if at is Vector3 and state == State.VOYAGE:
		world.fx.treasure(Vector3(at.x, 2.0, at.z), Loot.GLOW[glow], glow)
	if tier >= 3:
		camera.shake(0.12)
	_note_tour("found %s (%s)" % [pt.id, kicker])


## Casts off: back out to sea, clear of the quay, sails set (the web's castOff).
func _cast_off() -> void:
	if state != State.DOCKED or veil.busy:
		return
	sound.port_depart()
	veil.cover("Casting off…", _undock)


## Lets go of the quay: she's put out past its end under way, the camera
## back behind her and the HUD up.
func _undock() -> void:
	var port := dock_port
	var p := player
	if port == null:
		return
	_let_go()
	state = State.VOYAGE
	var c := port.cast_off(p.cls.beam)
	p.place(c.x, c.y, c.z)
	p.anchored = false
	p.speed = 3.0
	p.sail_target = 2.0 / 3.0
	camera.snap_to(p.pos)
	controls.reset()
	hud.fade(true, 0.0)
	_note_tour("cast off")


## Whatever quay she's tied to let go of: the market shut, the port's shot
## gone and the quay's sounds dying away.
func _let_go() -> void:
	market.close()
	market.set_dock({})
	if dock_port != null:
		dock_port.set_ship(null)
		dock_port = null
	camera.port = false
	sound.quay(false)


## The prompt tapped: alongside the quay she's off, if she still may.
func _dock_here() -> void:
	var p := player
	if state != State.VOYAGE or not p.alive:
		return
	# the same pill goes ashore off a beach, and rows back from one
	if _prompt_kind == "boat":
		_shore_act()
		return
	if _prompt_kind == "land":
		_go_ashore()
		return
	var near := ports.nearest(p.pos)
	if near != null and near.in_reach(p.pos) and _fighting() == null:
		_dock(near)


## The sea chart over the voyage (from the minimap or M): the helm let go,
## the world sailing on under it.
func _open_chart() -> void:
	if state != State.VOYAGE or paused or _farewell != null or not player.alive or veil.busy or chart.is_open():
		return
	controls.reset()
	hud.close_popups()
	chart.open()
	_note_tour("chart open")


## A tap on the chart (the web's tapPin): the card opens over whatever lies
## under the finger (a pin, a port, an isle); on open sea a pin is dropped
## there, anywhere on the known sea, and its card opens. With a card already
## open, a tap on open sea only closes it.
func _chart_tap(x: float, z: float, pick: float) -> void:
	var hit := _chart_pick(x, z, pick)
	if not hit.is_empty():
		_select_on_chart(hit)
		sound.click()
		_note_tour("card over %s" % (hit.target as Helmsman.Target).name)
		return
	if chart.card.is_open():
		_close_card()
		return
	if world.past_edge(x, z).z > 0.0:
		return
	var pin := pins.add(x, z, player.pos)
	sound.knock()
	_note_tour("pin dropped")
	_select_on_chart(_pin_target(pin))


# ------------------------------------------------------------------ the helmsman


## A waypoint as a place to sail to.
func _pin_target(pin: Waypoints.Pin) -> Dictionary:
	var t := Helmsman.Target.make(&"pin", "Waypoint %d" % pins.number(pin), pin.x, pin.z)
	t.pin = pin.id
	return {"target": t, "pin": pin, "color": MapMarks.PIN[pin.hue], "kicker": "Waypoint"}


## What lies under a tap on the chart, nearest kind first: a pin (its head
## stands above its spot, so a tap on that counts too), a market town, an
## isle (made for on the shore facing her); {} for open sea.
func _chart_pick(x: float, z: float, pick: float) -> Dictionary:
	var pin := pins.near(x, z, pick * 1.4)
	if pin == null:
		pin = pins.near(x, z + pick * 1.1, pick * 1.2)
	if pin != null:
		return _pin_target(pin)
	for tp in ports.ports:
		var at := MapScene.port_at(tp)
		if not chart.shows(at.x, at.y) or Vector2(at.x - x, at.y - z).length() > pick * 2.0:
			continue
		var t := Helmsman.Target.make(&"port", tp.title, at.x, at.y)
		var aim := tp.to_world(Vector3(0.0, 0.0, 48.0))
		t.aim = Vector2(aim.x, aim.z)
		t.port = tp
		return {"target": t, "pin": null, "color": Color("#ffd77a"), "kicker": "Trading port"}
	for r in world.regions:
		for isl: Dictionary in r.islands:
			var ix := float(isl.x)
			var iz := float(isl.z)
			var ir := float(isl.r)
			if not chart.shows(ix, iz) or Vector2(ix - x, iz - z).length() > ir * 0.85 + pick:
				continue
			var known := maps.known(r, isl)
			var a := atan2(player.pos.x - ix, player.pos.z - iz)
			var t := Helmsman.Target.make(&"isle", str(isl.name) if known else "Uncharted isle", ix, iz)
			t.aim = Vector2(ix + sin(a) * ir * 0.9, iz + cos(a) * ir * 0.9)
			return {"target": t, "pin": null, "color": Color("#fff1c8"), "kicker": "Island" if known else "Island · unexplored"}
	return {}


func _select_on_chart(hit: Dictionary) -> void:
	var t: Helmsman.Target = hit.target
	var bound := _bound_for(t)
	_sel = {"target": t, "pin": hit.pin, "color": hit.color, "bound": bound}
	chart.show_card(t.x, t.z, {"kicker": hit.kicker, "name": t.name, "sub": _card_sub(t), "warn": _card_warn(t), "accent": hit.color, "pin": hit.pin != null, "bound": bound})


func _close_card() -> void:
	_sel = {}
	chart.hide_card()


## Each frame with the chart open: the card's distance runs down as she
## sails, and its button follows the helmsman (a pin struck off closes it).
func _sync_card() -> void:
	if _sel.is_empty():
		return
	if not chart.is_open() or not chart.card.is_open():
		_sel = {}
		return
	var pin: Waypoints.Pin = _sel.pin
	if pin != null and not pins.pins.has(pin):
		_close_card()
		return
	var t: Helmsman.Target = _sel.target
	chart.card.set_sub(_card_sub(t))
	var b := _bound_for(t)
	if b != _sel.bound:
		_sel.bound = b
		chart.card.set_bound(b)


## She's already bound for this very place.
func _bound_for(t: Helmsman.Target) -> bool:
	var c := helm.target
	return helm.active() and c != null and c.kind == t.kind and c.x == t.x and c.z == t.z


## How far, how long, and a word on the wind.
func _card_sub(t: Helmsman.Target) -> String:
	var p := player
	if _bound_for(t):
		var v := helm.view(p)
		if not v.is_empty():
			return MapScene.distance(v.left) + ((" · " + HelmPill.eta(v.eta)) if float(v.eta) >= 0.0 else "") + " · under way"
	var dx := t.aim.x - p.pos.x
	var dz := t.aim.y - p.pos.z
	var d := sqrt(dx * dx + dz * dz)
	if d < 40.0:
		return "Right here"
	# a rough reckoning: the course runs a little longer than the crow flies
	var eta := d * 1.2 / maxf(3.0, p.cls.max_speed * 0.8)
	var w := world.wind
	var up := absf(MathX.angle_delta(atan2(-w.dir_x, -w.dir_z), atan2(dx, dz))) < 0.7
	var open := float(maps.nearest_region(p.pos.x, p.pos.z)[1]) > MapScene.HIGH_SEAS_R
	return "%s · %s%s" % [MapScene.distance(d), HelmPill.eta(eta), " · upwind, she’ll beat" if up and not open and d > 200.0 else ""]


func _card_warn(t: Helmsman.Target) -> String:
	return "Charting it pays a bounty" if t.kind == &"isle" and t.name == "Uncharted isle" else ""


## "Sail there": the helmsman plots her course (a frame or two on a worker,
## then _plotted) and takes the wheel.
func _sail_to(t: Helmsman.Target) -> void:
	if not player.alive or state != State.VOYAGE or _farewell != null:
		return
	helm.engage(player, t)
	_note_tour("sail to %s" % t.name)
	if not _sel.is_empty():
		_sel.bound = _bound_for(_sel.target)
		chart.card.set_bound(_sel.bound)


## The course plotted (`ok`), or no sea to sail there through.
func _plotted(ok: bool) -> void:
	if not ok:
		hud.toast("No way through", "Not even the old charts show a passage there", 3.0)
		sound.click()
		return
	var v := helm.view(player)
	hud.toast("As near as she can get" if helm.short() else "Course set", helm.target.name + ((" · " + MapScene.distance(v.left)) if not v.is_empty() else ""), 2.6)
	sound.bosun_pipe()
	_note_tour("course set, %d legs" % maxi(0, helm.route(player.pos).size() - 1))
	if _args.has("shot"):
		return
	# a beat to watch the course draw itself, then back to the sea (unless a hand is on the chart)
	var at := Time.get_ticks_msec()
	get_tree().create_timer(1.4).timeout.connect(func() -> void:
		if chart.is_open() and chart.poked_ms < at and helm.active() and state == State.VOYAGE:
			chart.close()
			_note_tour("chart closed itself"))


## The captain takes the helm back (or the course is cleared): she sails on
## as she is, her canvas back on one of the lever's notches.
func _stop_pilot(why: String) -> void:
	var was := helm.active()
	helm.disengage()
	if was:
		player.sail_target = roundf(player.sail_target * 3.0) / 3.0
		if why != "":
			hud.toast("Autopilot off", why, 1.8)
	if not _sel.is_empty() and _sel.bound:
		_sel.bound = false
		chart.card.set_bound(false)


## Arrived (a waypoint says so itself, in its own flare and chime).
func _pilot_arrived(t: Helmsman.Target) -> void:
	if t.kind == &"pin":
		return
	sound.chime()
	var sub := "Lying off the shore"
	if t.kind == &"port":
		sub = "Tap the prompt to come alongside" if hud.touch_ui() else "Press F to come alongside"
	hud.toast("Arrived · %s" % t.name, sub, 3.4)


## "Lift pin" on its card: the course to it cleared, the pin lifted, the card closed.
func _lift_card_pin() -> void:
	var pin: Waypoints.Pin = _sel.get("pin")
	if pin == null:
		return
	if helm.target != null and helm.target.pin == pin.id:
		_stop_pilot("Course cleared")
	pins.lift(pin)
	_close_card()
	sound.click()
	_note_tour("pin lifted")


## Anchored: the voyage on hold under the pause screen (the HUD's pause
## button, the back button, or the phone taking the game away).
func _pause() -> void:
	if state != State.VOYAGE or paused or _farewell != null or veil.busy:
		return
	paused = true
	controls.reset()
	hud.close_popups()
	Progress.keep_view(camera.zoom, camera.tilt)
	pause_screen.open({"ship": player.ship_name, "cls": player.cls.id, "time": voyage.time, "gold": player.gold, "kills": player.kills, "isles": discovered.size()})
	# nothing moves under the glass: a phone needn't draw it so often
	if Settings.mobile:
		Engine.max_fps = 30
	_note_tour("paused")


## Resume voyage (not once the voyage is being given up under the veil).
func _resume() -> void:
	if paused and not veil.busy:
		_unpause()
		_note_tour("resumed")


## Off hold: the screens over the voyage down, the sea moving again.
func _unpause() -> void:
	paused = false
	pause_screen.close()
	settings_sheet.close()
	controls.reset()
	Engine.max_fps = 60 if Settings.mobile else 0


func _input(event: InputEvent) -> void:
	var k := event as InputEventKey
	if k != null and k.pressed and not k.echo and (k.keycode == KEY_ESCAPE or k.keycode == KEY_BACK):
		get_viewport().set_input_as_handled()
		_go_back(k.keycode == KEY_BACK)


func _notification(what: int) -> void:
	if not _ready_to_play:
		return
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_go_back(true)
	elif what == NOTIFICATION_APPLICATION_RESUMED:
		# back from Android's installer (it turned it down, or wanted
		# installs from the game allowed first): Install again
		updater.resumed()
	elif what == NOTIFICATION_APPLICATION_PAUSED:
		# the phone took the game away: the voyage waits for her captain, and
		# what's kept is written before the system can close the game
		_pause()
		Progress.save()


## The back button (Android's, or Esc): whatever is on top closes; at sea
## the voyage goes on hold; in the harbour Android's leaves the game.
func _go_back(os_back: bool) -> void:
	# one press may come in twice, as a key and as the system's request
	var f := Engine.get_process_frames()
	if f - _back_frame <= 1:
		return
	_back_frame = f
	if veil.busy:
		return
	if update_card.go_back() or settings_sheet.go_back() or vault.go_back() or sea_pick.go_back() or pause_screen.go_back() or chart.go_back() or shipwright.go_back():
		return
	if _farewell != null:
		if _farewell.shown:
			_wreck_to_harbour()
		else:
			_skip()
	elif state == State.VOYAGE:
		if not hud.close_popups():
			sound.click()
			_pause()
	elif state == State.DOCKED:
		_cast_off()
	elif os_back:
		get_tree().quit()


## The smoke test's walk through the menus, a step once the last has
## settled: another ship picked and at anchor, Set Sail for Las Brumas;
## there the voyage paused, Settings opened and closed, and back to the
## harbour; a turn at the Shipwright (_tour_wright); then Set Sail for the
## home waters, paused and resumed with the
## back button; the sea chart opened off the minimap, a pin dropped on it by
## a tap and "Sail there" on its card, the helmsman's course set and the
## chart closing itself; the chart opened again, the pin's card, "Lift pin"
## (the course cleared with it) and the chart closed with the back button;
## then off a market's quay, the prompt tapped, a lot sold and then the rest,
## her hull mended and her racks filled, and cast off with the back button;
## last, off a beach, the prompt tapped and the landing party ashore, a walk
## inland and a hop, back down to the boat and rowed back out to her.
## What it saw goes in SMOKE MENU.
func _tour_menus() -> void:
	if _tour_step >= TOUR_STEPS or _frames - _tour_at < 20 or veil.busy:
		return
	match _tour_step:
		0:
			harbour.picked.emit("brig" if player.cls.id != "brig" else "sloop")
		1:
			# her hull off the yard's slipway first (Set Sail builds it if it's slow)
			if _picked_ship != "" and _frames - _tour_at < 600:
				return
			harbour.sail.emit()
		2:
			if not sea_pick.is_open():
				return
			sea_pick.pick("brumas")
		3:
			if state != State.VOYAGE:
				return
			hud.pause_pressed.emit()
		4:
			pause_screen.settings.emit()
		5:
			settings_sheet.go_back()
		6:
			pause_screen.harbour.emit()
		7:
			# a turn at the Shipwright and one in the Treasure Vault first
			if state != State.HARBOUR or _tour_wright() or _tour_vault():
				return
			harbour.sail.emit()
		8:
			if not sea_pick.is_open():
				return
			sea_pick.pick("home")
		9:
			if state != State.VOYAGE:
				return
			_go_back(false)
		10:
			_go_back(false)
		11:
			hud.map_pressed.emit()
		12:
			if not chart.is_open():
				return
			# pins kept from earlier plays: cleared first, so the tap drops a fresh one
			if not pins.pins.is_empty():
				_note_tour("cleared %d pins" % pins.pins.size())
				chart.clear_pins()
				return
			_tour_pins = pins.pins.size()
			_tour_tap(Vector2(player.pos.x + 140.0, player.pos.z + 90.0))
		13:
			# (the tap has landed: the chart waits out a second one first)
			if pins.pins.size() != _tour_pins + 1:
				printerr("SMOKE FAILED: a tap on the chart dropped no pin")
			if not chart.card.is_open():
				printerr("SMOKE FAILED: the pin dropped opened no card over it")
			chart.card.sail.emit()
		14:
			# the course is plotted on a worker (after her waters, if they're still being laid out)
			if helm.state == Helmsman.State.PLOTTING and _frames - _tour_at < 600:
				return
			if helm.state != Helmsman.State.SAILING or maps.route.size() < 2:
				printerr("SMOKE FAILED: the helmsman set no course (%s)" % Helmsman.State.keys()[helm.state])
		15:
			# a beat to watch the course draw itself, and the chart closes itself
			if chart.is_open() and _frames - _tour_at < 240:
				return
			if chart.is_open():
				printerr("SMOKE FAILED: the chart stayed open over the course set")
			if not hud.helm_on():
				printerr("SMOKE FAILED: no helmsman's pill on the HUD")
			hud.map_pressed.emit()
		16:
			if not chart.is_open():
				return
			var last := pins.pins[pins.pins.size() - 1]
			_tour_tap(Vector2(last.x, last.z))
		17:
			if not chart.card.is_open() or not bool(_sel.get("bound", false)):
				printerr("SMOKE FAILED: no card over the pin she's bound for")
			chart.card.lift.emit()
			if helm.active() or pins.pins.size() != _tour_pins or chart.card.is_open():
				printerr("SMOKE FAILED: Lift pin left the course, the pin or its card")
		18:
			_go_back(false)
			if chart.is_open():
				printerr("SMOKE FAILED: the back button left the chart open")
			else:
				_note_tour("chart closed")
		19:
			# a trading port: off the first market's quay, a little in the
			# hold, her hull knocked about, a rack of special shot spent and
			# gold enough for the chandlery whichever ship the tour sails
			var port: TradePort = ports.ports[0]
			var c := port.cast_off(player.cls.beam)
			player.place(c.x, c.y, c.z)
			player.speed = 0.0
			player.sail_target = 0.0
			camera.snap_to(player.pos)
			hold.stow(PackedStringArray(["rum", "rum", "silver", "pearls"]))
			player.hp = player.max_hp * 0.6
			stock[Ammo.SPECIALS[0]] = 0
			player.gold = maxi(player.gold, 500)
			_note_tour("off %s" % port.title)
		20:
			# the prompt tapped (pirates on her tail keep her off the quay: the
			# tour gives the port up after a while rather than wait on them)
			if not market.prompt_ok():
				if _fighting() != null and _frames - _tour_at > TOUR_CHASED:
					_note_tour("chased off the quay")
					_tour_step = TOUR_STEPS
				return
			market.dock.emit()
		21:
			if state != State.DOCKED:
				return
			market.sell.emit("rum")
		22:
			market.sell_all.emit()
		23:
			market.repair.emit()
		24:
			market.restock.emit()
		25:
			# the shipwright: the plainest part on her counter, the purse topped up for it
			var pt: Dictionary = Parts.port_stock(dock_port.index + 1)[0]
			Progress.earn(maxi(0, int(Parts.RARITIES[pt.tier].price) - Progress.purse))
			_refresh_parts()
			var had := Progress.owns(pt.id)
			market.buy_part.emit(pt.id)
			if not Progress.owns(pt.id):
				printerr("SMOKE FAILED: the shipwright's %s wasn't bought" % pt.id)
			elif had:
				_note_tour("%s owned already" % pt.id)
		26:
			_go_back(false)
		27:
			# off a beach, at rest
			if state != State.VOYAGE:
				return
			var off := _beach_off(0)
			if off.is_empty():
				printerr("SMOKE FAILED: no beach to put a boat on")
				_tour_step = TOUR_STEPS
				return
			player.place(off.x, off.z, off.heading)
			player.speed = 0.0
			player.sail_target = 0.0
			camera.snap_to(player.pos)
			_land_t = 0.0
		28:
			# the prompt tapped (pirates on her tail keep her off the beach, as off the quay)
			if _prompt_kind != "land" or not market.prompt_ok():
				if _frames - _tour_at > TOUR_CHASED:
					_note_tour("no landing (%s)" % ("chased" if _fighting() != null else "no prompt"))
					_tour_step = TOUR_STEPS
				return
			market.dock.emit()
		29:
			if not shore.active:
				return
			if shore.party.size() != 5 or camera.foot == false or not controls.foot:
				printerr("SMOKE FAILED: ashore with %d of the party, the camera %s" % [shore.party.size(), "ashore" if camera.foot else "at sea"])
			# inland, up the beach
			_auto_walk = Vector2(float(shore.landing.dx), -float(shore.landing.dz))
			_tour_walk_from = Vector2(shore.captain.x, shore.captain.z)
		30:
			if _frames - _tour_at < 90:
				return
			var cap := shore.captain
			var far := 0.0
			for m in shore.party:
				far = maxf(far, Vector2(m.walker.x - cap.x, m.walker.z - cap.z).length())
			var walked := Vector2(cap.x, cap.z).distance_to(_tour_walk_from)
			_note_tour("ran %.0f m inland, the hands within %.1f m" % [walked, far])
			if walked < 3.0 or far > 12.0:
				printerr("SMOKE FAILED: the captain walked %.1f m, the hands strung out to %.1f m" % [walked, far])
			controls.jump = true
		31:
			# back down to the boat, and the prompt to row back tapped
			var cap := shore.captain
			var b := shore.boat_pos()
			var to := Vector2(b.x - cap.x, b.z - cap.z)
			if _prompt_kind != "boat":
				if _frames - _tour_at > 400:
					printerr("SMOKE FAILED: never made it back to the boat (%.1f m off)" % to.length())
					_auto_walk = Vector2.ZERO
					_tour_step = TOUR_STEPS
					return
				_auto_walk = Vector2(to.x, -to.y).normalized()
				return
			_auto_walk = Vector2.ZERO
			market.dock.emit()
		32:
			if shore.active:
				return
			if player.anchored or camera.foot or controls.foot:
				printerr("SMOKE FAILED: rowed back, but still at anchor or on foot")
	_tour_step += 1
	_tour_at = _frames


## The smoke test's turn at the Shipwright, a step at a time (true while
## it's under way): opened off the harbour (she rows round to the home
## port's quay), the Sails tab, a famous ship's colours taken (and a fresh
## hull in them off the yard), the brush across her flag and its work kept,
## the design saved and deleted again, a part fitted on the Refit tab, a
## vault skin put on and a broadside test-fired with a vault blast, and Done
## with the back button (back out to the anchorage).
func _tour_wright() -> bool:
	if _sw_tour >= 13:
		return false
	match _sw_tour:
		0:
			harbour.shipwright.emit()
		1:
			var b := home.berth(player.cls.beam)
			if not shipwright.is_open() or not camera.port or not home.visible:
				printerr("SMOKE FAILED: the Shipwright didn't open over her at %s" % home.title)
			elif Vector2(player.pos.x - b.x, player.pos.z - b.y).length() > 0.5:
				printerr("SMOKE FAILED: she isn't alongside %s's quay" % home.title)
			shipwright.pick_tab("sails")
			if _sw_focus != "sails":
				printerr("SMOKE FAILED: the Sails tab didn't bring the camera round to her sails")
		2:
			var l := ShipLook.preset(2)
			l.name = "Smoke Test"
			shipwright.take(l)
			_note_tour("took the %s colours" % str(ShipLook.PRESETS[2][0]))
		3:
			# her fresh hull in its new paint (a while on the yard's slipway)
			if outfitter.refitting and _frames - _tour_at < 600:
				return true
			if outfitter.refitting:
				printerr("SMOKE FAILED: her hull was never refitted in its new paint")
			if player.ship_name != "Smoke Test":
				printerr("SMOKE FAILED: her new name didn't reach her (%s)" % player.ship_name)
			shipwright.paint_stroke(PackedVector2Array([Vector2(0.2, 0.3), Vector2(0.5, 0.55), Vector2(0.8, 0.35)]))
		4:
			shipwright.paint_done()
		5:
			if shipwright.paint_busy() and _frames - _tour_at < 300:
				return true
			# (a headless run draws nothing to read back: the work goes unkept)
			if str(outfitter.look.flag.paint).begins_with("data:image/png"):
				_note_tour("painted her flag")
			elif DisplayServer.get_name() != "headless":
				printerr("SMOKE FAILED: the brush's work wasn't kept on her flag")
			var n := Progress.designs.size()
			if not shipwright.save_design() or Progress.designs.size() != mini(n + 1, ShipLook.MAX_SAVED):
				printerr("SMOKE FAILED: the design wasn't saved")
			else:
				_note_tour("saved %s" % str(Progress.designs[0].name))
		6:
			if not Progress.designs.is_empty() and str(Progress.designs[0].look.name) == "Smoke Test":
				shipwright.delete_design(str(Progress.designs[0].id))
		7:
			# the Refit tab: oak strakes found and bolted onto her hull
			if not Progress.owns("hull:strakes"):
				Progress.grant_part("hull:strakes")
			shipwright.pick_part("hull", "hull:strakes")
			if Progress.equipped(player.cls.id, "hull") != "hull:strakes" or _sw_focus != "hull":
				printerr("SMOKE FAILED: the Refit tab didn't fit her hull plating (%s, the camera on %s)" % [Progress.equipped(player.cls.id, "hull"), _sw_focus])
		8:
			# her hull rebuilt with them (off the yard's slipway), then her standard fit back
			if player.model.fit_key != Parts.key(Progress.loadout(player.cls.id)) and _frames - _tour_at < 600:
				return true
			if player.model.fit.get("hull", "") != "hull:strakes":
				printerr("SMOKE FAILED: her hull never got its oak strakes (%s)" % player.model.fit_key)
			else:
				_note_tour("refitted with %s" % player.model.fit_key)
			shipwright.pick_part("hull", "")
		9:
			# the Skins tab: a skin from the vault put on, her livery wearing it
			if not Progress.owns_item("skin:kintsugi"):
				Progress.award("skin:kintsugi")
			shipwright.pick_tab("skins")
			if not shipwright.pick_item("skin:kintsugi") or str(Livery.named(Shipyard.MINE).skin.get("id", "")) != "skin:kintsugi":
				printerr("SMOKE FAILED: the Skins tab didn't dress her in kintsugi (%s)" % Progress.wearing("skin"))
			else:
				_note_tour("dressed in %s" % Progress.wearing("skin"))
		10:
			# the Guns tab: the dragon's blast on, a broadside tried out to seaward
			if not Progress.owns_item("blast:dragon"):
				Progress.award("blast:dragon")
			shipwright.pick_tab("guns")
			shipwright.pick_item("blast:dragon")
			shipwright.fire_test()
			if player.blast != Cosmetics.style_of("blast:dragon") or player.readiness(1) >= 1.0 and player.readiness(-1) >= 1.0:
				printerr("SMOKE FAILED: the Guns tab's broadside didn't go off with her dragon blast (style %d)" % player.blast)
			else:
				_note_tour("test-fired a broadside")
		11:
			# her own colours and powder back
			Progress.wear(Cosmetics.BASE.skin)
			Progress.wear(Cosmetics.BASE.blast)
			_go_back(false)
		12:
			if shipwright.is_open() or not harbour.is_open() or camera.port or home.visible:
				printerr("SMOKE FAILED: the back button didn't take her back out to the anchorage")
	_sw_tour += 1
	_tour_at = _frames
	return true


## The smoke test's turn in the Treasure Vault (true while it's under way):
## opened off the harbour's pill (the chest up beside her, the camera down
## by it), ten opened (the purse topped up for them), the opening skipped
## with the back button, every card turned over, the first shown off on
## her and worn, then back a view at a time and out; the ten's bonus part
## told, and her own colours and powder back on.
func _tour_vault() -> bool:
	if _v_tour >= 9:
		return false
	match _v_tour:
		0:
			harbour.vault.emit()
		1:
			if not vault.is_open() or not vstage.active or not camera.port or harbour.is_open():
				printerr("SMOKE FAILED: the Treasure Vault didn't open over the harbour")
			Progress.earn(maxi(0, Cosmetics.TEN_COST - Progress.purse))
			var pulls := int(Progress.vault.pulls)
			if not vault.buy(10) or int(Progress.vault.pulls) != pulls + 10:
				printerr("SMOKE FAILED: Open ×10 didn't open the chest ten times")
		2:
			# a beat of the chest charging, then skipped
			vault.go_back()
		3:
			if not vault.cards_out() and _frames - _tour_at < 600:
				return true
			if not vault.cards_out():
				printerr("SMOKE FAILED: the cards never came out of the chest (%s)" % vault.view_name())
			if _v_finds.size() != 1:
				printerr("SMOKE FAILED: the ten brought no bonus ship part")
			vault.reveal_all()
		4:
			if not vault.all_open() and _frames - _tour_at < 300:
				return true
			vault.show_card(0)
			if _v_show == "" or vault.view_name() != "show":
				printerr("SMOKE FAILED: the showcase didn't dress her in the card (%s)" % vault.view_name())
			elif not vault.equip_shown() or Progress.wearing(str(Cosmetics.item(_v_show).kind)) != _v_show:
				printerr("SMOKE FAILED: Equip didn't put %s on her" % _v_show)
			else:
				_note_tour("wore %s from the vault" % _v_show)
		5:
			_go_back(false)
			if vault.view_name() != "reveal" or _v_show != "":
				printerr("SMOKE FAILED: back from the showcase didn't go back to the cards")
		6:
			_go_back(false)
			if vault.view_name() != "home":
				printerr("SMOKE FAILED: back from the cards didn't go back to the chest")
		7:
			_go_back(false)
			if vault.is_open() or not harbour.is_open() or camera.port:
				printerr("SMOKE FAILED: the back button didn't close the vault back to the harbour")
		8:
			for k: String in ["skin", "blast", "trail"]:
				Progress.wear(str(Cosmetics.BASE[k]))
	_v_tour += 1
	_tour_at = _frames
	return true


## A tap on the open chart over the world spot `w` (x, z), as a finger makes it.
func _tour_tap(w: Vector2) -> void:
	var at := chart.to_canvas(w.x, w.y)
	for down: bool in [true, false]:
		var e := InputEventScreenTouch.new()
		e.position = at
		e.pressed = down
		chart.poke(e)


## A step of the smoke test's tour of the menus, for SMOKE MENU (and the frame it came on).
func _note_tour(what: String) -> void:
	if _tour:
		_tour_log.append("%s @%d" % [what, _frames])


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
			Progress.earn(reward)
			voyage.note("isle", "Charted %s" % isl.name, "+%d gold" % reward)
			hud.toast("Island discovered · +%d gold" % reward, isl.name, 3.6)
			sound.chime()


## A waypoint sailed into: struck off with a flare of light, a chime and a note.
func _reached(pin: Waypoints.Pin) -> void:
	var left := pins.pins.size()
	hud.toast("Waypoint reached", ("%d more on the chart" % left) if left > 0 else "The chart is clear", 3.0)
	sound.chime()
	var at := Vector3(pin.x, world.water_height(pin.x, pin.z), pin.z)
	for i in 3:
		world.fx.sparkle(at, 2.0, Waypoints.GLOW[pin.hue])


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
