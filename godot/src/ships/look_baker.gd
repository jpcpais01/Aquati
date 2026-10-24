class_name LookBaker
extends Node
## Draws heraldry off the main thread: the Shipwright's picker tiles and
## preset cards, her flag as you design it and the mark on her sails. Each
## drawing is an SVG the engine's rasterizer turns into a texture on a worker
## (her big flag takes a phone's core a tenth of a second or so, and a tap must
## never wait on it), handed back on the main thread. The latest drawings are
## kept, so stepping back to a colour you just had is instant.

## Plain (a tile), mipmapped (a flag in the world), one channel and
## mipmapped (a mark: how much each texel is inked).
enum { FLAT, MIPS, MARK }

## Drawings kept, at most.
const KEEP := 160

## Being drawn: [key, task, holder (the texture once drawn), callbacks].
var _jobs: Array = []
var _done := {}
var _order: Array[String] = []


func _init() -> void:
	name = "LookBaker"
	set_process(false)


## The texture of `svg`: at once if it was drawn lately (and `then` is not
## called), else null now and `then` called with it (null if the rasterizer
## refused it) once it's ready.
func draw(svg: String, then: Callable, kind := FLAT) -> Texture2D:
	var key := "%d%s" % [kind, svg.md5_text()]
	if _done.has(key):
		_order.erase(key)
		_order.append(key)
		return _done[key]
	for job: Array in _jobs:
		if job[0] == key:
			(job[3] as Array).append(then)
			return null
	var holder := [null]
	var task := WorkerThreadPool.add_task(func() -> void: holder[0] = LookBaker.rasterize(svg, kind), false, "LookBaker")
	_jobs.append([key, task, holder, [then]])
	set_process(true)
	return null


## Draws an SVG into a texture of a kind, now (any thread).
static func rasterize(svg: String, kind := FLAT) -> Texture2D:
	var img := Heraldry.render(svg)
	if img == null:
		return null
	if kind == MARK:
		img.convert(Image.FORMAT_R8)
	else:
		# the clear texels round a cut take their neighbours' colour, so
		# filtering never drags a dark fringe in round the edge
		img.fix_alpha_edges()
	if kind != FLAT:
		img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


## Whether anything is still being drawn.
func busy() -> bool:
	return not _jobs.is_empty()


## Lets go of every drawing kept (the Shipwright closed).
func forget() -> void:
	_done.clear()
	_order.clear()


func _process(_dt: float) -> void:
	var i := 0
	while i < _jobs.size():
		var job: Array = _jobs[i]
		if not WorkerThreadPool.is_task_completed(job[1]):
			i += 1
			continue
		WorkerThreadPool.wait_for_task_completion(job[1])
		_jobs.remove_at(i)
		var tex: Texture2D = (job[2] as Array)[0]
		if tex != null:
			_done[job[0]] = tex
			_order.append(job[0])
			while _order.size() > KEEP:
				_done.erase(_order.pop_front())
		for cb: Callable in job[3]:
			if cb.is_valid():
				cb.call(tex)
	if _jobs.is_empty():
		set_process(false)


func _exit_tree() -> void:
	for job: Array in _jobs:
		WorkerThreadPool.wait_for_task_completion(job[1])
	_jobs.clear()
