class_name Shipyard
extends Node
## Builds the pirates' hulls ahead of time, one at a time on a worker thread,
## and keeps a few of each class on the slipway: a new sail on the horizon
## never costs the frame it appears in the quarter-second a whole ship takes
## to loft, rig and paint. The rendering server queues what a worker asks of
## it, so a finished model's meshes and materials are ready for the main
## thread to sail.

## How many ready hulls of each class the yard keeps.
const STOCK := {"sloop": 3, "brig": 3, "galleon": 1}
const LIVERIES := ["pirate-crimson", "pirate-violet"]

var _stock: Array[ShipModel] = []
var _task := -1
var _built: ShipModel
## Seconds the yard lies idle (a ship going down: nothing new on the slipway just then).
var _idle := 0.0


func _ready() -> void:
	# everything a build reads that isn't its own, loaded here first
	Figurehead.warm()
	for id: String in STOCK:
		ShipClass.named(id)
	for id: String in LIVERIES:
		Livery.named(id)


func _process(delta: float) -> void:
	if _task >= 0:
		if not WorkerThreadPool.is_task_completed(_task):
			return
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
		if _built != null:
			_stock.append(_built)
			_built = null
		return
	_idle -= delta
	if _idle > 0.0:
		return
	for id: String in STOCK:
		if count(id) < int(STOCK[id]):
			var cls := ShipClass.named(id)
			var livery := Livery.named(LIVERIES[randi() % LIVERIES.size()])
			_task = WorkerThreadPool.add_task(_build.bind(cls, livery), false, "Shipyard: %s" % id)
			return


func _build(cls: ShipClass, livery: Livery) -> void:
	_built = ShipModel.create(cls, livery)


## Ready hulls of a class on the slipway.
func count(id: String) -> int:
	var n := 0
	for m in _stock:
		if m.cls.id == id:
			n += 1
	return n


## A ready hull of the class, off the slipway (null if none is ready yet).
func take(id: String) -> ShipModel:
	for i in _stock.size():
		if _stock[i].cls.id == id:
			var m := _stock[i]
			_stock.remove_at(i)
			return m
	return null


## Holds new keels for a few seconds.
func rest(seconds: float) -> void:
	_idle = maxf(_idle, seconds)


func _exit_tree() -> void:
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
	for m in _stock:
		m.free()
	_stock.clear()
	if _built != null:
		_built.free()
