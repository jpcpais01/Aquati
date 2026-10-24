class_name Shipyard
extends Node
## Builds hulls ahead of time, one at a time on a worker thread, and keeps a
## few of each class on the slipway: a new sail on the horizon never costs
## the frame it appears in the quarter-second a whole ship takes to loft, rig
## and paint. Beside the pirates' it keeps one of each class in your colours,
## so the harbour's picker swaps her for another at a tap (those come first
## while the harbour is up), with that class's refit bolted on (Progress), and
## now and then a pirate's comes off it with a prize fitting of her own
## (Parts.pirate_fit). The rendering server queues what a worker asks
## of it, so a finished model's meshes and materials are ready for the main
## thread to sail.

## How many ready hulls of each class the yard keeps for the pirates, and in your colours.
const STOCK := {"sloop": 3, "brig": 3, "galleon": 1}
const LIVERIES := ["pirate-crimson", "pirate-violet"]
const MINE := "player"

## The harbour is up: your hulls are built before the pirates', the one
## just picked on its picker (`want`) first of all.
var harbour := false
var want := ""

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
	Livery.named(MINE)


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
	# your hulls painted before the Shipwright last changed your colours, or
	# fitted out before it last changed her parts, go
	for i in range(_stock.size() - 1, -1, -1):
		var m := _stock[i]
		if m.livery.id == MINE and not _fits(m, MINE):
			_stock.remove_at(i)
			m.free()
	_idle -= delta
	if _idle > 0.0:
		return
	var next := _next()
	if not next.is_empty():
		var id: String = next[0]
		# (the refit settled here: the worker reads nothing that can change under it)
		var fit := Progress.loadout(id) if next[1] == MINE else Parts.pirate_fit(id)
		_task = WorkerThreadPool.add_task(_build.bind(ShipClass.named(id), Livery.named(next[1]), fit), false, "Shipyard: %s" % id)


## What to lay down next: [class, livery], or nothing when the slipway is full.
func _next() -> Array:
	if harbour and STOCK.has(want) and count(want, MINE) == 0:
		return [want, MINE]
	var mine: Array = []
	for id: String in STOCK:
		if count(id, MINE) == 0:
			mine = [id, MINE]
			break
	if harbour and not mine.is_empty():
		return mine
	for id: String in STOCK:
		if count(id) < int(STOCK[id]):
			return [id, LIVERIES[randi() % LIVERIES.size()]]
	return mine


func _build(cls: ShipClass, livery: Livery, fit: Dictionary) -> void:
	_built = ShipModel.create(cls, livery, true, fit)


## Ready hulls of a class on the slipway: the pirates', or in a livery (MINE).
func count(id: String, livery := "") -> int:
	var n := 0
	for m in _stock:
		if m.cls.id == id and _fits(m, livery):
			n += 1
	return n


## Ready hulls of every class.
func stock() -> int:
	return _stock.size()


## A ready hull of the class off the slipway, a pirate's or in a livery
## (null if none is ready yet).
func take(id: String, livery := "") -> ShipModel:
	for i in _stock.size():
		if _stock[i].cls.id == id and _fits(_stock[i], livery):
			var m := _stock[i]
			_stock.remove_at(i)
			return m
	return null


## A hull fits a livery wanted (a pirate's for none) unless it was painted
## before her colours last changed, or fitted out before her parts last did
## (the Shipwright).
func _fits(m: ShipModel, livery: String) -> bool:
	if livery.is_empty():
		return m.livery.id != MINE
	if m.livery.id != livery or m.rev != m.livery.rev:
		return false
	return livery != MINE or m.fit_key == Parts.key(Progress.loadout(m.cls.id))


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
