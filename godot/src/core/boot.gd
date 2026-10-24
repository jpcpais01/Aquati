class_name Boot
extends Node
## The first scene: the loading screen up on the very first frame, while the
## game itself (its scripts, and the shaders they preload: a couple of
## seconds' work on a phone, which used to pass on a blank screen) loads on a
## worker thread. Then the game goes in beside it and builds its world behind
## the same screen, which it takes over (Game._load); this node goes when the
## screen does.

const GAME := "res://scenes/main.tscn"

var _loading: LoadingScreen
var _threaded := false


func _ready() -> void:
	_loading = LoadingScreen.new()
	_loading.name = "Loading"
	add_child(_loading)
	_loading.tree_exited.connect(queue_free)
	_loading.progress(0.03)
	# (headless, where nothing is drawn, it simply loads)
	_threaded = DisplayServer.get_name() != "headless" and ResourceLoader.load_threaded_request(GAME) == OK
	if not _threaded:
		_start(load(GAME))


func _process(_delta: float) -> void:
	if not _threaded:
		return
	match ResourceLoader.load_threaded_get_status(GAME):
		ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			return
		ResourceLoader.THREAD_LOAD_LOADED:
			_threaded = false
			_start(ResourceLoader.load_threaded_get(GAME))
		_:
			# (it can't fail in a sound build; if it does, the plain way)
			_threaded = false
			_start(load(GAME))


func _start(scene: PackedScene) -> void:
	set_process(false)
	var game := scene.instantiate()
	game.set("loading", _loading)
	get_tree().root.add_child.call_deferred(game)
	get_tree().set_deferred("current_scene", game)
