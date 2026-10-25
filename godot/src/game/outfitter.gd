class_name Outfitter
extends Node
## Keeps her look (the Shipwright's flag, sails, paintwork and name): dresses
## her livery in it, has her flag and the mark on her sails drawn off the main
## thread (a LookBaker) and repaints her the moment they are, and keeps it
## between plays (Progress). Her paintwork is baked into her timbers, so a
## change there repaints her skin at once and has the yard lay down a fresh
## hull in her new colours, swapped in under her (Ship.refit) as soon as it's
## built: no tap ever waits on a whole ship being lofted. A part bolted on or
## taken off (Progress.parts_changed) has her refitted the same way.

## Her flag was drawn afresh (the Shipwright's stage shows it too); `painted`:
## with the brush's latest work in it, so the brush's layer can come down.
signal flag_drawn(tex: Texture2D, painted: bool)

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
## A drawing of her flag is under way, and another is wanted when it lands
## (a colour dragged across the picker asks every frame: one at a time, the
## latest always next, so the workers never fall behind).
var _flag_busy := false
var _flag_again := false
## The Shipwright's brush is out (her flag drawn without its paint, the
## brush's layer over it), or was put away and its layer stays up until her
## flag is drawn with the paint in it; each time it comes out or goes away.
var _painting := false
var _lift := false
var _brush := 0


func _init() -> void:
	name = "Outfitter"
	add_child(baker)


func _ready() -> void:
	Progress.parts_changed.connect(_parts_changed)


## Her parts changed: a fresh hull with them, when it's her own class's refit.
func _parts_changed() -> void:
	if ship == null or not is_instance_valid(ship) or ship.removed:
		return
	if ship.model.fit_key != Parts.key(Progress.loadout(ship.cls.id)):
		refitting = true
		shipyard.want = ship.cls.id


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
	list.append(Livery.named(Shipyard.GHOST))
	# (and the event ships', which always wear their own)
	for id: String in ShipEvents.liveries():
		list.append(Livery.named(id))
	# (and the Brethren's named captains')
	list.append_array(Bounty.liveries())
	# (and the merchant houses')
	list.append_array(Convoys.liveries())
	Livery.bake_start(list)


## Her name, as the HUD and the farewell call her.
func name_for(cls: ShipClass) -> String:
	# an event ship sails under her own name
	if cls.is_event():
		return cls.title
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
	if _flag_busy:
		_flag_again = true
		return
	var painted := not _painting
	var brush := _brush
	var t := baker.draw(_livery.flag_svg(painted), func(tex: Texture2D) -> void:
		_flag_busy = false
		_flag_in(tex, painted, brush)
		if _flag_again:
			_flag_again = false
			_draw_flag(), LookBaker.MIPS)
	if t != null:
		_flag_in(t, painted, brush)
	else:
		_flag_busy = true


func _flag_in(tex: Texture2D, painted: bool, brush: int) -> void:
	if tex == null:
		return
	_livery.flag_tex = tex
	ShipModel.restyle(_livery)
	var latest := painted and brush == _brush
	if _lift and latest:
		_lift = false
		ShipModel.paint_flag(_livery, null)
	flag_drawn.emit(tex, latest)


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


## The Shipwright's brush came out (its layer, shown over her flag as it's
## painted) or was put away (null: the layer stays up until her flag is drawn
## with the paint in it, the change that brings it following at once).
func set_painting(layer: Texture2D) -> void:
	_brush += 1
	_painting = layer != null
	_lift = not _painting
	# drawn afresh at the next change: without the paint (the layer has it), or with it
	_flag_key = ""
	if _painting:
		ShipModel.paint_flag(_livery, layer)
		_draw_flag()


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
