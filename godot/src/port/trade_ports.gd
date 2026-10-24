class_name TradePorts
extends Node3D
## Every trading port (the web game's TradePorts): the towns built once, each
## one's townsfolk dressed from its own seeded numbers as the web's are. A
## frame of them swaps each town between its whole build and its shell by
## the camera's distance, keeps hulls out of their pilings, and lends the
## crews' palette rows to the folk of a town close enough to be watched,
## whom the crews' sailor then draws.

## A porter set a load down: a good ashore (or, `on`, supplies aboard her).
signal delivered(port: TradePort, id: String, on: bool, at: Vector3)
## A harbourmaster struck the bell.
signal bell_rung(port: TradePort, at: Vector3)

## The townsfolk are dressed and drawn within this of the camera (m), and
## put away again past UNDRESS.
const DRESS := 300.0
const UNDRESS := 320.0
## Hulls this close to a town (m) are kept out of its pilings.
const REPEL := 90.0

var ports: Array[TradePort] = []
var _arts: TradePort.Arts
var _crew: Crew
var _dressed: Array[TradePort] = []


## Builds the towns at the world bake's trading ports (every region's, the
## home harbour left out), in the web's order.
func setup(world: World, crew: Crew) -> void:
	_crew = crew
	_arts = TradePort.Arts.new()
	var sites: Array[Dictionary] = []
	for r in world.regions:
		for p: Dictionary in r.ports:
			if not p.home:
				sites.append(p)
	for i in mini(sites.size(), TradePort.SPECS.size()):
		var spec: Dictionary = TradePort.SPECS[i]
		var rnd := Mulberry32.new(1000 + i * 97)
		var styles: Array[Dictionary] = []
		for role in TradePort.ROLES:
			styles.append(Figure.style_for(role, rnd, spec))
		var port := TradePort.new()
		port.setup(sites[i], i, _arts, world, styles)
		add_child(port)
		port.delivered.connect(func(id: String, on: bool, at: Vector3) -> void: delivered.emit(port, id, on, at))
		port.bell_rung.connect(func(at: Vector3) -> void: bell_rung.emit(port, at))
		ports.append(port)
	crew.crowds.append(_draw_folk)


## What the towns share: their materials and the meshes of what moves.
func arts() -> TradePort.Arts:
	return _arts


## The town whose quay is nearest a point.
func nearest(p: Vector3) -> TradePort:
	var best: TradePort = null
	var bd := INF
	for t in ports:
		var d := Vector2(t.xf.origin.x - p.x, t.xf.origin.z - p.z).length()
		if d < bd:
			bd = d
			best = t
	return best


## A frame of the towns: their cut by the camera, hulls kept off the quays,
## and the folk of the towns in view about their business.
func update(dt: float, player: Ship, cam: Vector3, ships: Array[Ship]) -> void:
	for t in ports:
		var d := t.lod(cam)
		# a town across the high seas, out of sight, is left be until you come back
		if not t.visible:
			_undress(t)
			continue
		var o := t.xf.origin
		for s in ships:
			if not s.anchored and (s.alive or s.sink_t < 6.0) and Vector2(s.pos.x - o.x, s.pos.z - o.z).length() < REPEL:
				t.repel(s)
		t.update(dt, player)
		var dressed := _dressed.has(t)
		if t.lively() and d < (UNDRESS if dressed else DRESS):
			if not dressed:
				_dress(t)
		elif dressed:
			_undress(t)


## The lamps of the towns in view, for the sea to mirror (world, brightness).
func lamps(near: Vector3, reach: float) -> Array[Vector4]:
	var out: Array[Vector4] = []
	for t in ports:
		if t.visible and Vector2(t.xf.origin.x - near.x, t.xf.origin.z - near.z).length() < reach + TradePort.HALF:
			out.append_array(t.lamps())
	return out


## A town's planking, painted signs and flag (its own shaders), for the
## game's warm-up: drawn once, the first town in view compiles nothing.
func warm_meshes() -> Array[MeshInstance3D]:
	var out: Array[MeshInstance3D] = []
	if ports.is_empty():
		return out
	for n: String in ["Deck", "Signs", "Flag"]:
		var src := ports[0].find_child(n, true, false) as MeshInstance3D
		if src != null:
			var mi := MeshInstance3D.new()
			mi.mesh = src.mesh
			mi.material_override = src.material_override
			out.append(mi)
	return out


## Triangles the towns in view draw now (whole, or as their shells), and how
## many are whole.
func drawn() -> Vector2i:
	var n := Vector2i.ZERO
	for t in ports:
		if t.visible:
			var whole := t.lively()
			n.x += t.tris.x if whole else t.tris.y
			n.y += 1 if whole else 0
	return n


## Triangles in the towns' close builds and their shells (for the budget).
func triangles() -> Vector2i:
	var n := Vector2i.ZERO
	for t in ports:
		n += t.tris
	return n


func _dress(t: TradePort) -> void:
	for fig in t.figures:
		fig.palette = _crew.take_row(fig.look.slots)
	_dressed.append(t)


func _undress(t: TradePort) -> void:
	if not _dressed.has(t):
		return
	for fig in t.figures:
		_crew.free_row(fig.palette)
		fig.palette = -1
	_dressed.erase(t)


func _draw_folk(emit: Callable) -> void:
	for t in _dressed:
		t.draw_folk(emit)
