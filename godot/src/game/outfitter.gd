class_name Outfitter
extends Node
## Keeps her look (the Shipwright's flag, sails, paintwork and name): dresses
## her livery in it, has her flag and the mark on her sails drawn off the main
## thread (a LookBaker) and repaints her the moment they are, and keeps it
## between plays (Progress). Her paintwork is baked into her timbers, so a
## change there repaints her skin at once and has the yard lay down a fresh
## hull in her new colours, swapped in under her (Ship.refit) as soon as it's
## built: no tap ever waits on a whole ship being lofted.

## Her flag was drawn afresh (the Shipwright's stage shows it too).
signal flag_drawn(tex: Texture2D)

var look := ShipLook.fresh()
var baker := LookBaker.new()
## The ship wearing it, and the yard that builds her hulls.
var ship: Ship
var shipyard: Shipyard
## A fresh hull is wanted for her (her paintwork changed since hers was built).
var refitting := false

var _livery: Livery
var _flag_key := ""
var _mark_key := ""
## The flag drawing asked for last: one drawn for an older design is dropped.
var _flag_ask := 0


func _init() -> void:
	name = "Outfitter"
	add_child(baker)


## First thing: her look as kept, the pirates' colours too, their flags and
## marks drawn on the worker threads while the sea and the isles go up.
func start(p_look: Dictionary) -> void:
	look = p_look.duplicate(true)
	_livery = Livery.named(Shipyard.MINE)
	ShipLook.dress(_livery, look)
	_flag_key = ShipLook.flag_key(look)
	_mark_key = ShipLook.mark_key(look)
	var list: Array[Livery] = [_livery]
	for id: String in Shipyard.LIVERIES:
		list.append(Livery.named(id))
	Livery.bake_start(list)


## Her name, as the HUD and the farewell call her.
func name_for(cls: ShipClass) -> String:
	var n := str(look.name).strip_edges()
	return n if n != "" else cls.title


## A change from the Shipwright: she wears it at once (her flag and mark as
## soon as they're drawn, a fresh hull as soon as it's built), and it's kept.
func apply(p_look: Dictionary) -> void:
	look = p_look.duplicate(true)
	var rev := _livery.rev
	ShipLook.dress(_livery, look)
	var fk := ShipLook.flag_key(look)
	var mk := ShipLook.mark_key(look)
	if fk != _flag_key:
		_flag_key = fk
		_draw_flag()
	if mk != _mark_key:
		_mark_key = mk
		_draw_mark()
	ShipModel.restyle(_livery)
	if ship != null:
		ship.ship_name = name_for(ship.cls)
		if _livery.rev != rev:
			refitting = true
			shipyard.want = ship.cls.id
	Progress.keep_look(look)


func _draw_flag() -> void:
	_flag_ask += 1
	var ask := _flag_ask
	var t := baker.draw(_livery.flag_svg(), func(tex: Texture2D) -> void: _flag_in(ask, tex), LookBaker.MIPS)
	if t != null:
		_flag_in(ask, t)


func _flag_in(ask: int, tex: Texture2D) -> void:
	if ask != _flag_ask or tex == null:
		return
	_livery.flag_tex = tex
	ShipModel.restyle(_livery)
	flag_drawn.emit(tex)


func _draw_mark() -> void:
	var m := _livery.sail_mark
	if m.is_empty():
		return
	var key := _mark_key
	var t := baker.draw(Heraldry.mark_svg(str(m.emblem), str(m.backing), Heraldry.MARK_PX), func(tex: Texture2D) -> void: _mark_in(key, tex), LookBaker.MARK)
	if t != null:
		_mark_in(key, t)


func _mark_in(key: String, tex: Texture2D) -> void:
	if key != _mark_key or tex == null:
		return
	_livery.mark_tex = tex
	var m := _livery.sail_mark
	Heraldry.keep_mark(str(m.emblem), str(m.backing), tex)
	ShipModel.restyle(_livery)


## The Shipwright's brush is at work on her flag (its layer; null put down).
func paint(layer: Texture2D) -> void:
	ShipModel.paint_flag(_livery, layer)


## Her flag as last drawn.
func flag_texture() -> Texture2D:
	return _livery.flag_tex if _livery != null else null


func _process(_dt: float) -> void:
	if not refitting or ship == null or shipyard == null:
		return
	if not is_instance_valid(ship) or ship.removed:
		refitting = false
		return
	var m := shipyard.take(ship.cls.id, Shipyard.MINE)
	if m == null:
		return
	refitting = false
	if shipyard.want == ship.cls.id:
		shipyard.want = ""
	ship.refit(m)
