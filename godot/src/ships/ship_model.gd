class_name ShipModel
extends Node3D
## A fully procedural ship: a lofted hull with real sheer, tumblehome, bilge
## and stem; a rounded wale, keel and gilded mouldings; stepped masts with
## caps, channels, chainplates, deadeyes and ratlines; a gaff mainsail, jib
## and topsail that billow and brace with the wind; carriage guns on their
## tackles; pin and fife rails, gratings, binnacle, wheel, capstan, lanterns
## and the ship's cat; a carved knee of the head with its figure; and the flag
## and ensign. Ported from the web game's ShipModel and merged into a handful
## of meshes:
##
## - the skin, the transom and the deck, each painted by its own shader;
## - the parts (spars, rails, guns, ironwork, gilding, lamps) in one vertex-
##   painted mesh that casts shadows, small parts too fine for the shadow map
##   in another, and close-range detail (lanyards, wooldings, buckets, the cat)
##   in a third that only draws near the camera;
## - the rigging as one ribbon mesh;
## - each sail, and the two flags, as their own small meshes on pivots;
## - the lanterns' halos after dark, a card turned to the eye per lamp.
##
## Her refit (Parts) is built in too: the plating on her sides, the sails'
## dressing on the masts, her guns' barrels and the figure on the knee (see
## PartModels); the few pieces that float and turn on their own are meshes of
## their own, moved by tick().
##
## Every mast, and the bowsprit, is a Spar that a ball can snap: where it
## breaks is settled as she's built, everything above the break is marked as
## standing on it (in the vertex paint, and on the ropes made fast to it), and
## a copy of that part is kept as its own mesh, so a spar shot away drops out
## of the merged meshes with no cutting at all and its piece goes over the side
## (see ShipDamage).
##
## Local frame: +Z bow, +Y up, +X port, waterline at y = 0. The castles and
## square rigs of the bigger classes come with them.

const DARK_WOOD := Color("#3e2a1a")
const MAST_WOOD := Color("#6a4a2e")
const IRON_PAINT := Color("#23262b")
## A haunted ship's lamplight and candle paint (sRGB; GLOW: lit by the shader).
const GHOST_FIRE := Color("#6dffb4")
const PUMPKIN_FIRE := Color("#ff9a2a")
const PUMPKIN := Color("#e0701c")
const BONE := Color("#d9cfb4")
const SHROUD := Color("#231a2a")
const FLAG_ASPECT := 0.62
## The close-range detail draws within this distance of the camera (m).
const FINE_RANGE := 95.0

const SHADERS := {
	"hull": preload("res://shaders/ship_hull.gdshader"),
	"stern": preload("res://shaders/ship_stern.gdshader"),
	"deck": preload("res://shaders/ship_deck.gdshader"),
	"parts": preload("res://shaders/ship_parts.gdshader"),
	"rope": preload("res://shaders/ship_rope.gdshader"),
	"sail": preload("res://shaders/ship_sail.gdshader"),
	"flag": preload("res://shaders/ship_flag.gdshader"),
	"halo": preload("res://shaders/lamp_halo.gdshader"),
}
## What a livery that can wear a vault skin draws its hull, woodwork and
## canvas with (Livery.skinned: yours).
const SKIN_SHADERS := {
	"hull": preload("res://shaders/ship_hull_skin.gdshader"),
	"parts": preload("res://shaders/ship_parts_skin.gdshader"),
	"sail": preload("res://shaders/ship_sail_skin.gdshader"),
}
## A halo card's corners (shaders/lamp_halo.gdshader).
const CARD: Array[Vector2] = [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]
## How far past its lamp a halo card can reach (m): a lamp a long way off wears a wide one.
const HALO_MARGIN := 12.0
## A cabin window's halo: its size (a lantern's is 1) and how bright, against a lantern's.
const WINDOW_HALO := 1.1
const WINDOW_GLOW := 0.5

## Shared materials by class and livery: a fleet of one kind compiles nothing
## new. The shipyard builds on a worker thread, so the cache is locked.
static var _materials := {}
static var _materials_lock := Mutex.new()

var cls: ShipClass
var livery: Livery
## The livery's rev she was built at: her hull's paint is baked in, so a
## later one makes her stale (Shipyard._fits).
var rev := 0
var shape: HullShape
var head: Figurehead.Head
var detail := true
## Her refit: {slot: part id} (Parts), and as one word (Parts.key), so a
## refitted hull isn't mistaken for a standard one (Shipyard._fits).
var fit := {}
var fit_key := ""

## Where the guns fire from: {pos, dir, side (+1 port, -1 starboard)}.
var muzzles: Array[Dictionary] = []
## Where a gull can land: {pos, spar (mast index, -1 the bowsprit)}.
var perches: Array[Dictionary] = []
var deck_points := PackedVector3Array()
## Deck furniture the crew walk round: Vector3(x, z, radius).
var deck_props := PackedVector3Array()
## Mouth of the galley stovepipe, for its wisp of smoke.
var chimney := Vector3.ZERO
## The middle of the figurehead, for cameras.
var figure_at := Vector3.ZERO
## The lanterns' glass (model frame) and their size: x, y, z, size. They
## wear halos after dark (the "Halos" mesh) and light the water round her.
var lamps := PackedVector4Array()
## The great cabin's windows across the transom (model frame), which wear
## halos after dark too.
var windows := PackedVector3Array()
## Lights that wear a halo but cast none on the water (the sea mirrors only
## so many): x, y, z, size, and each one's kind (lamp_halo.gdshader: 0.5 a
## jack-o'-lantern, 1 ghost-fire).
var glows := PackedVector4Array()
var glow_kinds := PackedFloat32Array()
## The livery she was asked for: an event ship always wears her own, and the
## shipyard keeps her for the one asked (Shipyard._fits).
var asked := ""
## Where a haunted ship's ghost-fire burns (model frame): her lanterns,
## pumpkins and figure, for Haunt's wisps.
var haunt_points := PackedVector3Array()

## {node, tier, fore_aft, pivot, spar (the Spar it hangs from)}.
var sails: Array[Dictionary] = []
var yard_pivots: Array[Node3D] = []
var fore_aft_pivots: Array[Node3D] = []
var flag_pivot := Node3D.new()
var ensign_pivot := Node3D.new()
## The masts, aft to fore, then the bowsprit.
var spars: Array[Spar] = []
## The ship's flag and her ensign.
var flags: Array[MeshInstance3D] = []


## A mast or the bowsprit, as a ball can bring it down.
class Spar:
	## What its parts are marked with (MeshKit.code): its index + 1; ropes made fast to it carry bit `group` - 1.
	var group := 1
	var bowsprit := false
	## The point it snaps at and topples about (model frame), the middle of
	## the break, its long axis there, how far it reaches beyond, and its
	## radius at the break.
	var pivot := Vector3.ZERO
	var centre := Vector3.ZERO
	var long := Vector3.UP
	var length := 1.0
	var radius := 0.2
	## Everything above the break, as one mesh in the model's frame.
	var piece: ArrayMesh
	## The pivots, loose sails and flags that come down with it.
	var nodes: Array[Node3D] = []
	var broken := false
	## How it went over (the axis it toppled about, in the model's frame), how
	## far over the crew finds it when they haul it back up, and the splintered
	## stump it left.
	var axis := Vector3.RIGHT
	var lean := 0.0
	var stump: Node3D

var _core := MeshKit.new(3)
var _small := MeshKit.new(5)
var _fine := MeshKit.new(9)
var _ropes := RopeKit.new()
var _mast_tops := PackedVector3Array()
var _hull_mesh: ArrayMesh
var _stern_mesh: ArrayMesh
var _deck_mesh: ArrayMesh
var _last_fill := -1.0
var _last_wind := -1.0
var _phase := 0.0
## The parts of her refit by slot, and what their builders are handed.
var _parts := {}
var _kit: PartModels.Kit
## The masts as the parts dress them: {z, y0, h, r0, spar}.
var _masts: Array[Dictionary] = []
## The parts that move on their own: {node, p0, b0, axis, spin, bob, rate, phase, spar}.
var _spinners: Array[Dictionary] = []


static func create(p_cls: ShipClass, p_livery: Livery, p_detail: bool = true, p_fit: Dictionary = {}) -> ShipModel:
	var m := ShipModel.new()
	m.cls = p_cls
	# an event ship wears her own colours, and takes no refit
	var l := Livery.named(p_cls.livery) if p_cls.livery != "" else p_livery
	m.asked = p_livery.id
	m.livery = l
	m.rev = l.rev
	m.detail = p_detail
	m.fit = {} if p_cls.is_event() else Parts.clean(p_fit)
	m.fit_key = Parts.key(m.fit)
	m._parts = Parts.loadout_parts(m.fit)
	m.name = "Model"
	m._build()
	return m


func _build() -> void:
	shape = HullShape.new(cls)
	head = Figurehead.bow_head(shape, cls)
	_phase = randf() * 10.0
	_build_hull()
	_build_mouldings()
	_build_deck()
	_build_aft()
	_build_cannons()
	_build_rig()
	_build_bow()
	_build_details()
	_build_deck_life()
	if cls.haunt:
		_build_haunt()
	_build_parts()
	_finish()


# ------------------------------------------------------------------ materials

## The material this class and livery share for one kind of mesh ("hull",
## "stern", "deck", "parts", "rope", "sail", "flag").
func shared_material(kind: String) -> ShaderMaterial:
	var key := kind
	if cls.haunt:
		# a haunted ship's every material is her own
		key = "%s|%s|%s" % [kind, cls.id, livery.id]
	elif kind in ["hull", "stern"]:
		key = "%s|%s|%s" % [kind, cls.id, livery.id]
	elif kind in ["sail", "flag"] or (kind == "parts" and livery.skinned):
		key = "%s|%s" % [kind, livery.id]
	_materials_lock.lock()
	var m: ShaderMaterial = _materials.get(key)
	if m == null:
		m = _new_material(kind)
		_materials[key] = m
	_materials_lock.unlock()
	return m


func _new_material(kind: String) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = SKIN_SHADERS[kind] if livery.skinned and SKIN_SHADERS.has(kind) else SHADERS[kind]
	_paint_material(m, kind, livery)
	match kind:
		"hull":
			m.set_shader_parameter("length_m", cls.length)
			var ports: Array[Vector4] = []
			for t in cls.cannon_ts():
				var y := _cannon_y(t)
				var v := shape.tex_v(t, y)
				var h := shape.tex_v(t, y + 0.31) - shape.tex_v(t, y - 0.31)
				ports.append(Vector4(t, v, 0.31 / cls.length, h * 0.5))
			while ports.size() < 8:
				ports.append(Vector4(-1, -1, 0, 0))
			m.set_shader_parameter("ports", ports.slice(0, 8))
			m.set_shader_parameter("port_count", mini(cls.cannons_per_side, 8))
		"stern":
			m.set_shader_parameter("rows", _window_rows())
	if cls.haunt:
		_haunt_material(m, kind)
	return m


## A haunted ship's look on her materials: ghost-light seeping from her seams
## and gunports and shining through her stern windows, drowned grey timber
## and a weathered deck, rags of canvas smouldering green at their edges and
## her mark burning.
func _haunt_material(m: ShaderMaterial, kind: String) -> void:
	match kind:
		"hull":
			m.set_shader_parameter("seam_glow", Vector3(0.14, 0.8, 0.4))
		"stern":
			m.set_shader_parameter("pane_glow", Vector3(0.25, 1.45, 0.62))
			m.set_shader_parameter("pane_glass", Color("#a8ffd6"))
		"deck":
			m.set_shader_parameter("c_plank", Color("#6b6159"))
			m.set_shader_parameter("c_tar", Color("#141110"))
		"parts":
			m.set_shader_parameter("wood_tint", Vector3(0.6, 0.6, 0.68))
		"sail":
			m.set_shader_parameter("tear_glow", Vector3(0.07, 0.42, 0.2))
			m.set_shader_parameter("mark_glow", 1.4)


## Sets what a livery paints on a kind of material: the hull's bands, the
## canvas and its mark, the flag.
static func _paint_material(m: ShaderMaterial, kind: String, l: Livery) -> void:
	match kind:
		"hull", "stern":
			m.set_shader_parameter("c_hull", l.hull)
			m.set_shader_parameter("c_bottom", l.bottom)
			m.set_shader_parameter("c_boot", l.boot)
			m.set_shader_parameter("c_strake", l.strake)
			m.set_shader_parameter("c_trim", l.trim)
			if kind == "hull":
				m.set_shader_parameter("c_wale", l.wale)
		"sail":
			m.set_shader_parameter("c_sail", l.sail)
			m.set_shader_parameter("c_seam", l.sail_seam)
			m.set_shader_parameter("c_accent", l.sail_accent)
			m.set_shader_parameter("sail_pattern", l.sail_pattern)
			m.set_shader_parameter("c_emblem", l.emblem_color)
			m.set_shader_parameter("mark_on", l.mark_tex != null and not l.sail_mark.is_empty())
			m.set_shader_parameter("mark_tex", l.mark_tex)
		"flag":
			m.set_shader_parameter("flag_tex", l.flag_tex)
	if l.skinned and kind in SKIN_SHADERS:
		_skin_material(m, l.skin)


## A vault skin's uniforms (ship_skin.gdshaderinc) on a material: its
## pattern (0, or no skin: her own paint), colours and glow.
static func _skin_material(m: ShaderMaterial, sk: Dictionary) -> void:
	var pattern := int(sk.get("pattern", 0))
	m.set_shader_parameter("skin_id", pattern)
	if pattern == 0:
		return
	var cs: Array = sk.colors
	m.set_shader_parameter("skin_a", cs[0])
	m.set_shader_parameter("skin_b", cs[1])
	m.set_shader_parameter("skin_c", cs[2])
	m.set_shader_parameter("skin_p", Vector4(float(sk.glow), float(sk.sail), 0.0, fmod(pattern * 7.31, 10.0)))


## Repaints every material made for a livery (every class's hull and stern,
## the canvas and the flag) after its colours, flag or mark changed: the ships
## wearing it change at once. Her timbers' paint (the gilding, the wale's
## mouldings) is baked into her hull: a change there needs a fresh one (rev).
static func restyle(l: Livery) -> void:
	_materials_lock.lock()
	for key: String in _materials:
		if key.ends_with("|" + l.id):
			_paint_material(_materials[key], key.get_slice("|", 0), l)
	_materials_lock.unlock()


## Rows of windows in the great cabin: one, two under a stern castle, three in a galleon.
func _window_rows() -> int:
	return 1 if cls.stern_castle.is_empty() else (3 if cls.id == "galleon" or cls.haunt else 2)


## The Shipwright's brush at work on the livery's flag (null: put down).
static func paint_flag(l: Livery, layer: Texture2D) -> void:
	_materials_lock.lock()
	var m: ShaderMaterial = _materials.get("flag|" + l.id)
	_materials_lock.unlock()
	if m != null:
		m.set_shader_parameter("painting", layer != null)
		m.set_shader_parameter("paint_tex", layer)


## The middle of her flag at the masthead, in the world (the Shipwright's shot of it).
func flag_centre() -> Vector3:
	for f in flags:
		if f.get_parent() == flag_pivot:
			return f.global_transform * f.get_aabb().get_center()
	return flag_pivot.global_position


func _cannon_y(t: float) -> float:
	return shape.main_deck_y(t) + 0.5


# ------------------------------------------------------------------ hull

func _build_hull() -> void:
	var s := shape
	var length := cls.length
	var ts := HullShape.t_samples(64)
	var ring_m := 14
	var vs := PackedFloat32Array()
	for k in ring_m:
		var q := float(k) / (ring_m - 1)
		vs.append(q * q * (3.0 - 2.0 * q) * 0.35 + q * 0.65)
	var ring_n := ring_m * 2 - 1
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	for t in ts:
		var zz := s.z(t)
		for k in ring_n:
			var side := -1.0 if k < ring_m - 1 else 1.0
			var vi := ring_m - 1 - k if k < ring_m - 1 else k - (ring_m - 1)
			var p := s.section(t, vs[vi])
			pos.append(Vector3(side * p.x, p.y, zz))
			uv.append(Vector2(t, s.tex_v(t, p.y)))
	var idx := PackedInt32Array()
	for r in ts.size() - 1:
		for k in ring_n - 1:
			var a := r * ring_n + k
			var c := a + ring_n
			idx.append_array([a, a + 1, c, a + 1, c + 1, c])
	_hull_mesh = _uv_mesh(pos, uv, idx)

	# the transom: a gently bulged counter, flat only where it meets the hull
	var t0 := ts[0]
	var z0 := s.z(t0) - 0.02
	var b0 := s.bottom(t0)
	var top0 := s.top(t0)
	var w0 := s.half_beam(t0)
	var bulge := cls.beam * 0.05
	var nc := 10
	var tp := PackedVector3Array()
	var tuv := PackedVector2Array()
	for vi in ring_m:
		var p := s.section(t0, vs[vi])
		var h := clampf((p.y - b0) / (top0 - b0), 0.0, 1.0)
		for c in nc + 1:
			var u := float(c) / nc * 2.0 - 1.0
			tp.append(Vector3(u * p.x, p.y, z0 - bulge * (1.0 - u * u) * pow(maxf(sin(PI * h), 0.0), 0.6)))
			tuv.append(Vector2(0.5 + u * p.x / (2.2 * w0), h))
	var tidx := PackedInt32Array()
	for r in ring_m - 1:
		for c in nc:
			var a := r * (nc + 1) + c
			var d := a + nc + 1
			tidx.append_array([a, d, a + 1, a + 1, d, d + 1])
	_stern_mesh = _uv_mesh(tp, tuv, tidx)
	# the great cabin's windows, where the stern shader paints them
	# (ship_stern.gdshaderinc: four to a row, from the taffrail down)
	for r in _window_rows():
		var h := 0.88 - 0.15 * r
		var y := lerpf(b0, top0, h)
		var hw := s.half_width_at_y(t0, y)
		for i in 4:
			var x := (0.2 + i / 3.0 * 0.6 - 0.5) * 2.2 * w0
			var u := clampf(x / maxf(hw, 0.01), -1.0, 1.0)
			windows.append(Vector3(x, y, z0 - bulge * (1.0 - u * u) * pow(maxf(sin(PI * h), 0.0), 0.6)))

	# inner bulwark walls, facing in (a vault skin paints them too)
	_core.paint(MeshKit.shade(livery.strake, 0.8), MeshKit.PAINT, 0.0)
	var base := _core.vertex_count()
	var rows := 0
	for t in ts:
		if t <= 0.004 or t >= 0.985:
			continue
		var zz := s.z(t)
		var y0 := s.main_deck_y(t) - 0.05
		var y1 := s.top(t) - 0.02
		var x0 := s.half_width_at_y(t, y0) - 0.13
		var x1 := s.half_width_at_y(t, y1) - 0.13
		var d := Vector2(x1 - x0, y1 - y0).normalized()
		_core.add_vertex(Vector3(x0, y0, zz), Vector3(-d.y, d.x, 0))
		_core.add_vertex(Vector3(x1, y1, zz), Vector3(-d.y, d.x, 0))
		_core.add_vertex(Vector3(-x0, y0, zz), Vector3(d.y, d.x, 0))
		_core.add_vertex(Vector3(-x1, y1, zz), Vector3(d.y, d.x, 0))
		rows += 1
	for r in rows - 1:
		var a := base + r * 4
		var n := a + 4
		_core.tri(a, n, a + 1)
		_core.tri(a + 1, n, n + 1)
		_core.tri(a + 2, a + 3, n + 2)
		_core.tri(a + 3, n + 3, n + 2)

	# frames standing proud of the inner bulwark
	var frame_col := MeshKit.shade(livery.hull, 0.95)
	var guns := PackedFloat32Array()
	for t in cls.cannon_ts():
		guns.append(s.z(t))
	var step := 0.95 if detail else 1.4
	var zf := s.z(0.03)
	while zf < s.z(0.95):
		var t := s.t_at(zf)
		var clear := true
		for gz in guns:
			if absf(gz - zf) < 0.5:
				clear = false
		var y0 := s.deck_y(t)
		var y1 := s.top(t) - 0.04
		if clear and y1 - y0 >= 0.3:
			for side: float in [1.0, -1.0]:
				var x0 := s.half_width_at_y(t, y0) - 0.13
				var x1 := s.half_width_at_y(t, y1) - 0.13
				_small.paint(frame_col)
				_small.spar(Vector3(side * (x0 - 0.06), y0, zf), Vector3(side * (x1 - 0.06), y1, zf), 0.07, 0.06, 4)
		zf += step

	# the rail: one closed loop round the sheer
	var pts := PackedVector3Array()
	var rail_ts := PackedFloat32Array()
	for t in HullShape.t_samples(40):
		if t > 0.003 and t < 0.997:
			rail_ts.append(t)
	for t in rail_ts:
		pts.append(Vector3(-(s.half_width_at_y(t, s.top(t)) - 0.065), s.top(t) + 0.03, s.z(t)))
	pts.append(Vector3(0, s.top(1.0) + 0.03, s.z(1.0) + 0.05))
	for i in range(rail_ts.size() - 1, -1, -1):
		var t := rail_ts[i]
		pts.append(Vector3(s.half_width_at_y(t, s.top(t)) - 0.065, s.top(t) + 0.03, s.z(t)))
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	_core.tube(pts, 0.09 + length * 0.0034, true, 8 if detail else 6, 2)


## A line along one side from the stern, round the stem and back down the other.
func _girdle(y_of: Callable, out: float, t0: float = 0.006) -> PackedVector3Array:
	var s := shape
	var ts := PackedFloat32Array()
	for k in HullShape.t_samples(30):
		ts.append(lerpf(t0, 0.992, k))
	var line := PackedVector3Array()
	for t in ts:
		line.append(s.skin_point(t, y_of.call(t), 1.0, out))
	line.append(Vector3(0, y_of.call(1.0), s.z(1.0) + out * 0.9))
	for i in range(ts.size() - 1, -1, -1):
		line.append(s.skin_point(ts[i], y_of.call(ts[i]), -1.0, out))
	return line


func _build_mouldings() -> void:
	var s := shape
	var length := cls.length
	# a fat rounded wale: the bumper line that gives the hull its heft
	var wale_r := 0.13 + length * 0.0035
	var wale_col := MeshKit.blend(livery.wale, livery.hull, 0.4)
	var wale := _girdle(s.wale_y, wale_r * 0.45)
	_core.paint(wale_col)
	_core.tube(wale, wale_r, false, 7 if detail else 5, 2)
	_core.ball(wale[0], wale_r)
	_core.ball(wale[wale.size() - 1], wale_r)
	# a slim gilded moulding picks out the painted band under the rail
	var m_r := 0.045 + length * 0.0012
	var band := _girdle(func(t: float) -> float: return s.y_at_v(t, 0.945), m_r * 0.4)
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	_core.tube(band, m_r, false, 5 if detail else 4, 2)
	_core.ball(band[0], m_r * 1.3, 6, 4)
	_core.ball(band[band.size() - 1], m_r * 1.3, 6, 4)
	# keel and stem: one rounded bar from the sternpost, under the hull and up the cutwater
	var kr := 0.11 + length * 0.003
	var keel := PackedVector3Array()
	for k in HullShape.t_samples(14):
		var t := lerpf(0.012, 0.99, k)
		keel.append(Vector3(0, s.bottom(t) - kr * 0.3, s.z(t) + (kr * 0.6 if t > 0.9 else 0.0)))
	keel.append(Vector3(0, lerpf(s.bottom(1.0), s.top(1.0), 0.45), s.z(1.0) + kr * 0.9))
	keel.append(Vector3(0, s.top(1.0) - 0.55, s.z(1.0) + kr * 1.4))
	_core.paint(wale_col)
	_core.tube(keel, kr, false, 6, 4)
	_core.ball(keel[0], kr)


func _build_deck() -> void:
	var s := shape
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	var n := 24
	var t0 := 0.003
	var t1 := 0.975
	for k in n + 1:
		var t := lerpf(t0, t1, float(k) / n)
		var zz := s.z(t)
		var y := s.main_deck_y(t)
		var w := maxf(0.05, s.half_width_at_y(t, y) - 0.14)
		pos.append_array([Vector3(-w, y, zz), Vector3(0, y + 0.06, zz), Vector3(w, y, zz)])
		uv.append_array([Vector2(-w, zz), Vector2(0, zz), Vector2(w, zz)])
		if k > 0 and k < n and k % 3 == 0:
			deck_points.append(Vector3(0, y, zz))
	for k in n:
		var r0 := k * 3
		var r1 := r0 + 3
		idx.append_array([r0, r1, r0 + 1, r1, r1 + 1, r0 + 1, r0 + 1, r1 + 1, r0 + 2, r1 + 1, r1 + 2, r0 + 2])
	_deck_mesh = _uv_mesh(pos, uv, idx)
	# the hold's floor of dark planks just under the deck: through a breach the
	# eye finds the gloom of the hold, not the sea inside the hull
	_core.paint(Color("#1c130c"), MeshKit.HOLD, 0.0)
	var hb := _core.vertex_count()
	var hn := 40
	for k in hn + 1:
		var t := 0.015 + 0.97 * k / hn
		var y := s.main_deck_y(t) - 0.18
		var w := maxf(0.02, s.half_width_at_y(t, y) - 0.03)
		_core.add_vertex(Vector3(-w, y, s.z(t)), Vector3.UP)
		_core.add_vertex(Vector3(w, y, s.z(t)), Vector3.UP)
	for k in hn:
		var a := hb + k * 2
		_core.tri(a, a + 2, a + 1)
		_core.tri(a + 1, a + 2, a + 3)


## Rudder hung on the sternpost, and gilded quarter pieces framing the transom.
func _build_aft() -> void:
	var s := shape
	var length := cls.length
	var b0 := s.bottom(0.0)
	var top0 := s.top(0.0)
	var z0 := s.z(0.0) - 0.02
	var bulge := cls.beam * 0.05
	var y_top := lerpf(b0, top0, 0.5)
	var chord0 := 0.55 + length * 0.02
	var thick := 0.09 + length * 0.003
	var wood_col := MeshKit.shade(livery.hull, 0.8)
	var n_rows := 9
	var m := 12
	var v0 := _core.vertex_count()
	var i0 := _core.indices.size()
	var zles := PackedFloat32Array()
	var ring := func(y: float, chord: float, th: float) -> float:
		var h := clampf((y - b0) / (top0 - b0), 0.0, 1.0)
		var zle := z0 - bulge * pow(maxf(sin(PI * h), 0.0), 0.6) - 0.03
		_core.paint(livery.bottom if y < -0.02 else (livery.boot if y < 0.14 else wood_col), MeshKit.WOOD, 0.0)
		for j in m + 1:
			var a := float(j) / m * TAU
			var along := (1.0 - cos(a)) * 0.5
			_core.add_vertex(Vector3(th * sin(a) * (1.0 - 0.4 * along), y, zle - chord * along), Vector3.UP)
		return zle
	ring.call(b0 + 0.04, chord0 * 0.92, thick * 0.3)
	for i in n_rows + 1:
		var f := float(i) / n_rows
		zles.append(ring.call(lerpf(b0 + 0.1, y_top, f), lerpf(chord0, chord0 * 0.42, f), thick))
	ring.call(y_top + 0.06, chord0 * 0.36, thick * 0.35)
	for r in n_rows + 2:
		for j in m:
			var a := v0 + r * (m + 1) + j
			var b := a + m + 1
			_core.tri(a, a + 1, b)
			_core.tri(a + 1, b + 1, b)
	_core.recompute_normals(v0, i0)
	# pintle straps and the rudder head running up into the counter
	_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	for i in range(1, 5):
		var f := i / 5.0
		var y := lerpf(b0 + 0.1, y_top, f)
		var zle := zles[roundi(f * n_rows)]
		var ch := lerpf(chord0, chord0 * 0.42, f)
		_core.rbox(Transform3D(Basis.IDENTITY, Vector3(0, y, zle - ch * 0.22)), Vector3(thick * 2.0 + 0.07, 0.08, ch * 0.5), 0.03, 1)
	var head_z := zles[n_rows] - 0.14
	_core.paint(wood_col)
	_core.spar(Vector3(0, y_top, head_z), Vector3(0, y_top + 0.35, head_z + 0.03), 0.13, 0.12, 8)

	# quarter pieces: gilded scrolled pilasters up each corner of the transom
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	for side: float in [1.0, -1.0]:
		var y_a := lerpf(b0, top0, 0.62 if cls.stern_castle.is_empty() else 0.5)
		var y_b := top0 - 0.12
		var pts := PackedVector3Array()
		for k in 7:
			var y := lerpf(y_a, y_b, k / 6.0)
			pts.append(Vector3(side * (s.half_width_at_y(0.0, y) + 0.01), y, z0 - 0.03))
		var tp := pts[pts.size() - 1]
		var curl := Figurehead.scroll(tp + Vector3(side * 0.13, 0, 0), Vector3(side, 0, 0), Vector3.DOWN, 0.13, 0.9, PI, 9)
		var path := pts.duplicate()
		path.append_array(curl.slice(1))
		var r := 0.06 + length * 0.0016
		_core.sweep(path, func(u: float) -> float: return r if u < 0.7 else lerpf(r, r * 0.4, (u - 0.7) / 0.3), 6, 24)
		_core.cone(Transform3D(Basis(Vector3.RIGHT, PI), pts[0] + Vector3(0, -0.14, 0)), r * 1.4, 0.32, 8)
		_core.ball(pts[0], r * 1.5, 7, 5)


# ------------------------------------------------------------------ guns

func _build_cannons() -> void:
	var s := shape
	var k := 0.75 + cls.length * 0.011
	# a chunky turned barrel: cascabel knob, reinforce rings, muzzle swell (+y = muzzle)
	var barrel := PackedVector2Array([
		Vector2(0, -0.86), Vector2(0.07, -0.85), Vector2(0.1, -0.79), Vector2(0.06, -0.73), Vector2(0.19, -0.69),
		Vector2(0.215, -0.6), Vector2(0.205, -0.5), Vector2(0.215, -0.42), Vector2(0.2, -0.36), Vector2(0.185, -0.05),
		Vector2(0.2, 0.0), Vector2(0.17, 0.05), Vector2(0.155, 0.52), Vector2(0.19, 0.6), Vector2(0.2, 0.68),
		Vector2(0.17, 0.71), Vector2(0.1, 0.71), Vector2(0.1, 0.6), Vector2(0, 0.6),
	])
	# an upgrade swaps the standard barrel for its own (and moves the muzzle with it)
	var gun: Dictionary = _parts.get("guns", {})
	var tip := 0.85 if gun.is_empty() else PartModels.barrel_tip(gun) + 0.14
	var carriage_col := MeshKit.shade(livery.bottom, 0.8)
	var wheel_col := Color("#3e2a1a")
	var lining := livery.bottom
	var ksc := Basis.from_scale(Vector3(k, k, k))
	for side: float in [1.0, -1.0]:
		for t in cls.cannon_ts():
			var y := _cannon_y(t)
			var zz := s.z(t)
			var x := s.half_width_at_y(t, y)
			var mount := Transform3D(Basis(Vector3.BACK, -side * PI * 0.5) * ksc, Vector3(side * (x + 0.12 * k), y, zz))
			if gun.is_empty():
				_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
				_core.lathe(mount, barrel, 12 if detail else 8)
			else:
				# turned end for end about its bore on the starboard side, so what
				# stands on top of the barrel (a dragon's brow) is on top both sides
				PartModels.barrel(_core, gun, mount * Transform3D(Basis(Vector3.UP, PI) if side < 0.0 else Basis.IDENTITY, Vector3.ZERO), detail)
			muzzles.append({"pos": Vector3(side * (x + tip * k), y, zz), "dir": Vector3(side, 0, 0), "side": side})

			# truck carriage on the deck behind the port: stepped cheeks bolted across a bed
			var deck := s.main_deck_y(t)
			var cx := side * (x - 0.13 - 0.42 * k)
			var ch := y - deck - 0.05
			var cl := 0.85 * k
			var base := deck + 0.09 * k
			for dz: float in [-0.19 * k, 0.19 * k]:
				_core.paint(carriage_col)
				_core.rbox(_at(Vector3(cx + side * cl * 0.22, (base + y + 0.02) * 0.5, zz + dz)), Vector3(cl * 0.56, y - base + 0.02, 0.08 * k), 0.03, 1)
				_core.rbox(_at(Vector3(cx - side * cl * 0.25, base + (y - base) * 0.31, zz + dz)), Vector3(cl * 0.48, (y - base) * 0.62, 0.08 * k), 0.03, 1)
				if detail:
					# iron cap-squares over the trunnions and bolt heads down the cheeks
					_fine.paint(IRON_PAINT, MeshKit.IRON, 0.03)
					_fine.box(_at(Vector3(cx + side * cl * 0.3, y + 0.03, zz + dz)), Vector3(0.16 * k, 0.05, 0.1 * k))
					for bx: float in [0.05, 0.38]:
						_fine.ball(Vector3(cx + side * cl * bx, base + 0.06, zz + dz + signf(dz) * 0.045 * k), 0.022, 4, 3)
			_small.paint(MeshKit.shade(carriage_col, 0.85))
			_small.box(_at(Vector3(cx, base + 0.03 * k, zz)), Vector3(cl * 0.92, 0.06 * k, 0.34 * k))
			# axletrees on four trucks, bigger in front, with iron tyres
			for at: Vector2 in [Vector2(0.3, 0.13), Vector2(-0.3, 0.115)]:
				var ax := cx + side * at.x * k
				var ay := deck + at.y * k
				_small.paint(wheel_col)
				_small.spar(Vector3(ax, ay, zz - 0.3 * k), Vector3(ax, ay, zz + 0.3 * k), 0.05 * k, 0.05 * k, 6)
				for tz: float in [-0.27 * k, 0.27 * k]:
					_core.paint(wheel_col)
					_core.spar(Vector3(ax, ay, zz + tz - 0.035 * k), Vector3(ax, ay, zz + tz + 0.035 * k), at.y * k, at.y * k, 10)
					if detail:
						_fine.paint(IRON_PAINT, MeshKit.IRON, 0.03)
						_fine.torus(_at(Vector3(ax, ay, zz + tz)), at.y * k, 0.014, 3, 8)
			if detail:
				# the quoin wedged under the breech, its handle sticking out aft
				_fine.paint(MeshKit.shade(wheel_col, 1.3))
				_fine.box(Transform3D(Basis(Vector3.BACK, side * 0.12), Vector3(cx - side * cl * 0.18, y - 0.2 * k, zz)), Vector3(0.34 * k, 0.07 * k, 0.2 * k))
				_fine.paint(wheel_col)
				_fine.ball(Vector3(cx - side * cl * 0.38, y - 0.19 * k, zz), 0.03 * k, 5, 4)
			# breeching rope round the cascabel and the run-out tackles, set up on eyebolts in the bulwark
			var xi := side * (x - 0.16)
			var casc := Vector3(side * (x - 0.74 * k), y + 0.02, zz)
			for dz: float in [-1.0, 1.0]:
				var eye := Vector3(xi, y + 0.06, zz + dz * 0.55)
				_ropes.rope(eye, casc, 0.032, RopeKit.HEMP, 0.05)
				var low := Vector3(xi, deck + 0.28, zz + dz * 0.42)
				var block := Vector3(cx - side * 0.36 * k, deck + ch * 0.7, zz + dz * 0.25 * k)
				_ropes.rope(low, block, 0.018, RopeKit.HEMP)
				if detail:
					_small.paint(IRON_PAINT, MeshKit.IRON, 0.03)
					_small.ball(eye, 0.035, 5, 3)
					_small.ball(low, 0.035, 5, 3)
					# a double block at each end of the run-out tackle
					_fine.paint(MeshKit.shade(wheel_col, 1.4))
					for bp: Vector3 in [low.lerp(block, 0.18), block]:
						_fine.sphere(Transform3D(Basis.from_scale(Vector3(1.3, 0.8, 0.9)), bp), 0.055, 5, 3)

			# framed gunport with its lid hinged open above it, where the side is tall enough
			if s.top(t) - y < 0.48:
				continue
			var n := s.skin_normal(t, y, side)
			var fm := MeshKit.surface_frame(s.skin_point(t, y, side, -0.01), n)
			_core.paint(livery.trim, MeshKit.GILT, 0.02)
			_core.square_ring(fm, 0.36, 0.055)
			var hinge := fm * Transform3D(Basis.IDENTITY, Vector3(0, 0.4, 0.03)) * Transform3D(Basis(Vector3.RIGHT, -2.05), Vector3.ZERO)
			_core.paint(livery.strake)
			_core.rbox(hinge * _at(Vector3(0, -0.31, 0.045)), Vector3(0.76, 0.62, 0.09), 0.04)
			_core.paint(lining)
			_core.box(hinge * _at(Vector3(0, -0.31, -0.008)), Vector3(0.62, 0.5, 0.02))
			if detail:
				# the port lanyards holding the lid up, led in over the rail
				var top := s.top(t) - y
				for lx: float in [-0.28, 0.28]:
					var a := fm * Vector3(lx, 0.72, 0.55)
					var b := fm * Vector3(lx * 0.8, top + 0.02, 0.04)
					_ropes.rope(a, b, 0.011, RopeKit.HEMP)
					_fine.paint(IRON_PAINT, MeshKit.IRON, 0.03)
					_fine.ball(a, 0.02, 4, 3)

	# shot garlands between the guns: round shot racked along the waterway
	var ts := cls.cannon_ts()
	var ta := (float(cls.stern_castle.t) if not cls.stern_castle.is_empty() else 0.0) + 0.02
	var tb := (float(cls.fore_castle.t) if not cls.fore_castle.is_empty() else 1.0) - 0.02
	for i in ts.size() - 1:
		var t := (ts[i] + ts[i + 1]) * 0.5
		if t < ta or t > tb:
			continue
		var deck := s.main_deck_y(t)
		for side: float in [1.0, -1.0]:
			var x := side * (s.half_width_at_y(t, deck + 0.1) - 0.13 - 0.13)
			var zz := s.z(t)
			_core.paint(MeshKit.shade(lining, 0.7))
			_core.rbox(_at(Vector3(x, deck + 0.06, zz)), Vector3(0.2, 0.12, 0.95), 0.04, 1)
			if detail:
				# rammer and sponge racked on hooks along the bulwark above the shot
				var hx := side * (s.half_width_at_y(t, deck + 0.95) - 0.13 - 0.07)
				for rack: Vector2 in [Vector2(0.92, 0.0), Vector2(1.06, 1.0)]:
					var a := Vector3(hx, deck + rack.x, zz - 1.0)
					var b := Vector3(hx, deck + rack.x, zz + 1.0)
					_fine.paint(Color("#a07a4e"))
					_fine.spar(a, b, 0.022, 0.022, 5)
					var hr := 0.075 if rack.y > 0.5 else 0.065
					var hl := 0.3 if rack.y > 0.5 else 0.16
					var hz := zz + 1.0 + (0.12 if rack.y > 0.5 else 0.05)
					_fine.paint(Color("#3a3028") if rack.y > 0.5 else Color("#7a5634"))
					_fine.spar(Vector3(hx, deck + rack.x, hz - hl * 0.5), Vector3(hx, deck + rack.x, hz + hl * 0.5), hr, hr, 7)
					_fine.paint(IRON_PAINT, MeshKit.IRON, 0.03)
					for hk: float in [-0.6, 0.6]:
						_fine.spar(Vector3(hx + side * 0.06, deck + rack.x - 0.06, zz + hk), Vector3(hx - side * 0.01, deck + rack.x - 0.04, zz + hk), 0.012, 0.012, 3)
			_small.paint(IRON_PAINT, MeshKit.IRON, 0.03)
			for b in range(-2, 3):
				_small.ball(Vector3(x, deck + 0.13 + 0.06 * k, zz + b * 0.19), 0.085 * k, 6, 5)


static func _at(p: Vector3) -> Transform3D:
	return Transform3D(Basis.IDENTITY, p)


# ------------------------------------------------------------------ rig

func _build_rig() -> void:
	var s := shape
	var c := cls
	var beam := c.beam
	var max_mast := 0.0
	var max_top := Vector3.ZERO
	var tallest := 0
	for mi in c.masts.size():
		var m: Dictionary = c.masts[mi]
		var rig: String = m.rig
		var zz := s.z(m.t)
		var y0 := s.deck_y(m.t)
		var hh: float = m.height
		var r0 := 0.12 + hh * 0.0085
		var radial := 10 if detail else 7
		var has_top: bool = m.get("top", false)
		# where a ball would snap her: low enough that all she carries comes down
		var sp := Spar.new()
		sp.group = mi + 1
		var y_cut := y0 + maxf(3.2 if rig == "gaff" else 2.4, hh * randf_range(0.24, 0.4))
		sp.pivot = Vector3(0, y_cut, zz)
		sp.length = hh - (y_cut - y0)
		spars.append(sp)
		var bit := 1 << mi
		if rig == "lateen":
			# one long pole, tapering hard toward the head
			sp.radius = lerpf(r0, r0 * 0.45, (y_cut - y0) / hh)
			_core.paint(MAST_WOOD)
			_snapped_spar(_core, Vector3(0, y0, zz), Vector3(0, y0 + hh, zz), r0, r0 * 0.45, radial, sp)
			_on_spar(sp.group)
		else:
			# stepped spars: lower mast, topmast and topgallant overlap at the
			# doublings under iron-bound caps, so the silhouette reads as a real rig
			var low_top := y0 + hh * 0.8 if rig == "gaff" else y0 + hh * 0.6 + 0.85
			var r1 := r0 * 0.78
			sp.radius = lerpf(r0, r1, (y_cut - y0) / (low_top + 0.1 - y0))
			_core.paint(MAST_WOOD)
			_snapped_spar(_core, Vector3(0, y0, zz), Vector3(0, low_top + 0.1, zz), r0, r1, radial, sp)
			_on_spar(sp.group)
			var tm_base := low_top - (1.6 if rig == "gaff" else 0.9)
			var tm_top := y0 + hh if rig == "gaff" or not has_top else y0 + hh * 0.87 + 0.55
			_core.paint(MAST_WOOD)
			_core.spar(Vector3(0, tm_base, zz), Vector3(0, tm_top, zz), r1 * 0.72, r1 * 0.5, radial)
			_mast_cap(low_top, zz, r1, r1 * 0.72)
			if tm_top < y0 + hh - 0.5:
				var tg := r1 * 0.5
				_core.paint(MAST_WOOD)
				_core.spar(Vector3(0, y0 + hh * 0.87 - 0.3, zz), Vector3(0, y0 + hh, zz), tg * 0.82, tg * 0.55, radial)
				_mast_cap(tm_top - 0.05, zz, tg, tg * 0.82)
		# mast cap
		_core.paint(livery.trim, MeshKit.GILT, 0.02)
		_core.sphere(Transform3D(Basis.from_scale(Vector3(1, 0.8, 1)), Vector3(0, y0 + hh + 0.05, zz)), r0 * 0.5, 10, 6)
		if has_top:
			_ropes.owner = bit
			_build_top(mi, zz, y0, hh, r0)
			_ropes.owner = 0
		_on_spar(0)
		# a rounded collar where it passes the deck, and iron bands up the lower mast
		_core.paint(DARK_WOOD)
		_core.hoop(Vector3(0, y0 + r0 * 0.3, zz), r0 * 1.15, r0 * 0.45, 6, 14)
		var low_len := hh if rig == "lateen" else (hh * 0.8 if rig == "gaff" else hh * 0.6 + 0.95)
		var low_taper := 0.55 if rig == "lateen" else 0.22
		var band_fs := PackedFloat32Array([0.1, 0.2, 0.3, 0.4] if detail else [0.15, 0.35])
		_small.paint(IRON_PAINT, MeshKit.IRON, 0.03)
		for f in band_fs:
			_on_spar(sp.group if y0 + hh * f > y_cut else 0)
			_small.hoop(Vector3(0, y0 + hh * f, zz), r0 * (1.0 - low_taper * minf(1.0, f * hh / low_len)) + 0.012, 0.035, 4, 12)
		if detail:
			# rope wooldings bound round the lower mast between the iron hoops
			_fine.paint(MeshKit.shade(RopeKit.HEMP, 0.8))
			for f: float in [0.15, 0.25, 0.35]:
				for kk in range(-1, 2):
					var yy := y0 + hh * f + kk * 0.075
					_on_spar(sp.group if yy > y_cut else 0)
					_fine.hoop(Vector3(0, yy, zz), r0 * (1.0 - low_taper * minf(1.0, (yy - y0) / low_len)) + 0.014, 0.026, 4, 12)
		_on_spar(0)
		_masts.append({"z": zz, "y0": y0, "h": hh, "r0": r0, "spar": sp.group})
		var top := Vector3(0, y0 + hh, zz)
		_mast_tops.append(top)
		perches.append({"pos": Vector3(0, y0 + hh + 0.05 + r0 * 0.4, zz), "spar": mi})
		if hh > max_mast:
			max_mast = hh
			max_top = top
			tallest = mi

		# shrouds set up on deadeyes along a channel board, with ratlines to
		# climb: the channels stay with the hull, the shrouds go with the mast
		var dts: Array[float] = []
		for dt: float in [-0.055, -0.03, -0.005, 0.02]:
			dts.append(dt * 21.0 / c.length)
		var mast_head := Vector3(0, y0 + hh * 0.6, zz)
		for side: float in [1.0, -1.0]:
			var ct0 := clampf(float(m.t) + dts[0] - 0.012, 0.02, 0.96)
			var ct1 := clampf(float(m.t) + dts[dts.size() - 1] + 0.012, 0.02, 0.96)
			var ch_t := (ct0 + ct1) * 0.5
			var n_h := s.skin_normal(ch_t, s.top(ch_t) + 0.02, side)
			n_h.y = 0.0
			n_h = n_h.normalized()
			var ch_len := s.z(ct1) - s.z(ct0)
			_core.paint(DARK_WOOD)
			_core.rbox(MeshKit.surface_frame(s.skin_point(ch_t, s.top(ch_t) + 0.02, side, -0.02), n_h) * _at(Vector3(0, 0, 0.2)), Vector3(ch_len, 0.12, 0.46), 0.05)
			var feet := PackedVector3Array()
			for dt in dts:
				var tt := clampf(float(m.t) + dt, 0.02, 0.96)
				var base := s.skin_point(tt, s.top(tt) + 0.02, side) + n_h * 0.36
				var eye := base + Vector3(0, 0.2, 0)
				_small.paint(DARK_WOOD)
				_small.sphere(Transform3D(Basis.from_scale(Vector3(1, 1, 0.6)), eye), 0.1, 7, 5)
				if detail:
					# the shroud ends in an upper deadeye, set up to the lower one with a three-part lanyard
					var up := (mast_head - eye).normalized()
					var upper := eye + up * 0.42
					_fine.paint(DARK_WOOD)
					_fine.sphere(Transform3D(Basis.from_scale(Vector3(1, 1, 0.6)), upper), 0.085, 7, 5)
					for o: float in [-0.045, 0.0, 0.045]:
						_ropes.rope(eye + Vector3(0, 0, o), upper + Vector3(0, 0, o * 0.9), 0.011, RopeKit.HEMP)
					_ropes.owner = bit
					_ropes.rope(upper, mast_head, 0.034)
				else:
					_ropes.owner = bit
					_ropes.rope(eye, mast_head, 0.034)
				_ropes.owner = 0
				# chainplate: an iron strap bolted down the side below the channel
				_small.paint(IRON_PAINT, MeshKit.IRON, 0.03)
				_small.spar(base + Vector3(0, 0.12, 0), base + n_h * -0.3 + Vector3(0, -0.75, 0), 0.028, 0.028, 4)
				feet.append(eye)
			_ropes.owner = bit
			if detail:
				var reach := feet[0].distance_to(mast_head)
				var rungs := floori(reach * 0.85 / 0.6)
				for r in range(1, rungs + 1):
					var f := r / (rungs + 1.6)
					for i in feet.size() - 1:
						_ropes.rope(feet[i].lerp(mast_head, f), feet[i + 1].lerp(mast_head, f), 0.014)
			_ropes.rope(Vector3(0, y0 + hh * 0.93, zz), Vector3(side * beam * 0.16, y0 + hh * 0.6, zz), 0.028)
			_ropes.owner = 0

		match rig:
			"square":
				_build_square(m, mi, zz, y0, hh, sp)
			"gaff":
				_build_gaff(m, zz, y0, hh, r0, sp)
			"lateen":
				_build_lateen(m, zz, y0, hh, sp)

	_build_bowsprit()

	# backstays from the after masthead down to the quarters, stays from each
	# masthead to the next one forward
	_ropes.owner = 1
	for side: float in [1.0, -1.0]:
		_ropes.rope(_mast_tops[0], s.skin_point(0.05, s.top(0.05) + 0.05, side, -0.12), 0.03, RopeKit.TAR, 0.1)
	for i in _mast_tops.size() - 1:
		var next_h: float = c.masts[i + 1].height
		_ropes.owner = (1 << i) | (1 << (i + 1))
		_ropes.rope(_mast_tops[i], _mast_tops[i + 1] + Vector3(0, -next_h * 0.35, 0), 0.038, RopeKit.TAR, 0.12)
	_ropes.owner = 0

	# the ship's flag on the tallest mast (so no gull sits on that cap)
	for i in range(perches.size() - 1, -1, -1):
		var pp: Vector3 = perches[i].pos
		if pp.x == 0.0 and absf(pp.z - max_top.z) < 1e-4:
			perches.remove_at(i)
	flag_pivot.name = "Flag"
	flag_pivot.position = max_top + Vector3(0, 0.35, 0)
	add_child(flag_pivot)
	_add_flag(flag_pivot, 2.2 + c.length * 0.07)
	spars[tallest].nodes.append(flag_pivot)
	# and again as an ensign on a raked staff over the taffrail
	var et := 0.03
	var ex := (0.5 if c.stern_castle.is_empty() else 0.3) * s.half_beam(et)
	var e_base := Vector3(ex, s.top(et) - 0.1, s.z(et))
	var e_top := e_base + Vector3(0, cos(0.4), -sin(0.4)) * (1.6 + c.length * 0.05)
	_core.paint(DARK_WOOD)
	_core.spar(e_base, e_top, 0.06, 0.04, 6)
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	_core.ball(e_top + Vector3(0, 0.06, 0), 0.08, 6, 4)
	ensign_pivot.name = "Ensign"
	ensign_pivot.position = e_top
	add_child(ensign_pivot)
	_add_flag(ensign_pivot, 1.3 + c.length * 0.045)


## What's laid down next stands on spar group g (0 the hull): see Spar.
func _on_spar(g: int) -> void:
	_core.set_spar(g)
	_small.set_spar(g)
	_fine.set_spar(g)


## A tapered spar from a to b that a ball can snap where `sp` breaks: laid in
## two lengths that meet there (a hair apart, so the levels of detail never
## weld across the break), the outer one standing on the spar. Leaves the kits
## on the hull.
func _snapped_spar(kit: MeshKit, a: Vector3, b: Vector3, r0: float, r1: float, radial: int, sp: Spar) -> void:
	var axis := b - a
	var f := clampf((sp.pivot - a).dot(axis) / axis.length_squared(), 0.05, 0.95)
	var cut := a.lerp(b, f)
	var dir := axis.normalized()
	var rc := lerpf(r0, r1, f)
	sp.centre = cut
	_on_spar(0)
	kit.spar(a, cut - dir * 0.002, r0, rc, radial)
	_on_spar(sp.group)
	kit.spar(cut + dir * 0.002, b, rc, r1, radial)
	_on_spar(0)


## The iron-bound cap at a mast's doublings: a block where the lower spar
## (radius r_low) ends and the upper one (r_up) passes up through it.
func _mast_cap(y: float, zz: float, r_low: float, r_up: float) -> void:
	_core.paint(DARK_WOOD)
	_core.rbox(_at(Vector3(0, y, zz)), Vector3(r_low * 2.6, 0.26 + r_low * 0.4, r_low * 2.6 + r_up * 2.4), 0.07, 1)
	_small.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	_small.hoop(Vector3(0, y + 0.16 + r_low * 0.2, zz), r_up + 0.03, 0.03, 4, 10)


## A round fighting top on the lower masthead, with a soft rim, a little
## railing and the futtock shrouds under it, and the crosstrees higher up.
func _build_top(mi: int, zz: float, y0: float, hh: float, r0: float) -> void:
	var b := cls.beam
	var ty := y0 + hh * 0.6
	_core.paint(DARK_WOOD)
	_core.spar(Vector3(0, ty - 0.1, zz), Vector3(0, ty + 0.1, zz), b * 0.12, b * 0.16, 16)
	_core.paint(MAST_WOOD)
	_core.hoop(Vector3(0, ty + 0.05, zz), b * 0.16, 0.09, 5, 20)
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	_core.hoop(Vector3(0, ty + 0.62, zz), b * 0.155, 0.04, 4, 20)
	for side: float in [1.0, -1.0]:
		perches.append({"pos": Vector3(side * b * 0.155, ty + 0.66, zz), "spar": mi})
	for i in 8:
		# gaps where the shrouds come up
		if i == 2 or i == 6:
			continue
		var a := TAU * i / 8.0
		var foot := Vector3(cos(a) * b * 0.155, ty + 0.04, zz + sin(a) * b * 0.155)
		_small.paint(livery.trim, MeshKit.GILT, 0.02)
		_small.spar(foot, foot + Vector3(0, 0.58, 0), 0.03, 0.03, 4, false)
	if detail:
		# futtock shrouds from the rim in to a band round the mast below it, and the halyard blocks
		for side: float in [1.0, -1.0]:
			for dz: float in [-0.2, 0.0, 0.2]:
				_ropes.rope(Vector3(side * b * 0.145, ty - 0.02, zz + dz), Vector3(side * r0 * 0.85, ty - 1.05, zz + dz * 0.3), 0.02)
			_fine.paint(DARK_WOOD)
			_fine.sphere(Transform3D(Basis.from_scale(Vector3(0.7, 1.25, 0.8)), Vector3(side * (r0 + 0.12), ty - 0.32, zz - 0.05)), 0.09, 7, 5)
		_fine.paint(IRON_PAINT, MeshKit.IRON, 0.03)
		_fine.hoop(Vector3(0, ty - 1.05, zz), r0 * 0.86, 0.03, 4, 12)
	var cy := y0 + hh * 0.87
	for dz: float in [-0.22, 0.22]:
		_core.paint(DARK_WOOD)
		_core.spar(Vector3(-b * 0.11, cy, zz + dz), Vector3(b * 0.11, cy, zz + dz), 0.06, 0.06, 6)


## Square sails on yards that brace round together on one pivot: each yard
## tapered both ways from its slings, with yardarm blocks, lifts, footropes
## and the clewlines led down to the deck, and a course, topsail and
## topgallant (as many tiers as she carries) hanging from them.
func _build_square(m: Dictionary, mi: int, zz: float, y0: float, hh: float, sp: Spar) -> void:
	var c := cls
	var b := c.beam
	var tiers: int = m.get("tiers", 1)
	var fr: Array = [0.75] if tiers == 1 else ([0.5, 0.84] if tiers == 2 else [0.4, 0.66, 0.89])
	var widths: Array = [1.4] if tiers == 1 else ([1.6, 1.2] if tiers == 2 else [1.75, 1.35, 0.95])
	var pivot := Node3D.new()
	pivot.name = "Yards"
	pivot.position = Vector3(0, 0, zz)
	add_child(pivot)
	yard_pivots.append(pivot)
	sp.nodes.append(pivot)
	var yards := MeshKit.new(19 + mi)
	var lines := RopeKit.new(23 + mi)
	var ys := PackedFloat32Array()
	var halves := PackedFloat32Array()
	for i in fr.size():
		var y := y0 + hh * float(fr[i])
		var half := b * float(widths[i]) * 0.5
		ys.append(y)
		halves.append(half)
		var ry := 0.1 + hh * 0.0022
		yards.paint(DARK_WOOD, MeshKit.WOOD, 0.0)
		yards.spar(Vector3(0, y, 0), Vector3(-half, y, 0), ry, 0.055, 8)
		yards.spar(Vector3(0, y, 0), Vector3(half, y, 0), ry, 0.055, 8)
		yards.ball(Vector3(-half, y, 0), 0.075, 6, 4)
		yards.ball(Vector3(half, y, 0), 0.075, 6, 4)
		yards.paint(IRON_PAINT, MeshKit.IRON, 0.03)
		yards.torus(Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(0, y, 0)), ry + 0.02, 0.035, 4, 10)
		yards.paint(DARK_WOOD, MeshKit.WOOD, 0.0)
		yards.rbox(_at(Vector3(0, y + 0.02, -0.12)), Vector3(0.36, 0.3, 0.42), 0.08, 1)
		var lift_top := y0 + hh * float(fr[i + 1]) - 0.35 if i < fr.size() - 1 else y0 + hh * 0.97
		for sx: float in [-1.0, 1.0]:
			var arm := Vector3(sx * half * 0.96, y, 0)
			yards.paint(DARK_WOOD, MeshKit.WOOD, 0.0)
			yards.ball(arm + Vector3(0, -0.12, -0.05), 0.1, 6, 4)
			# the lift up to the mast, and the clewlines and buntlines led down abaft the canvas
			lines.rope(arm, Vector3(sx * 0.2, lift_top, 0), 0.026)
			for f: float in [0.38, 0.78]:
				lines.rope(Vector3(sx * half * f, y - 0.06, -0.14), Vector3(sx * (0.1 + f * 0.25), y0 + 0.86, -0.72), 0.016, RopeKit.HEMP)
			if detail:
				# the footrope sagging under the yard, held up by stirrups
				var pts := PackedVector3Array()
				for k in 7:
					var u := k / 6.0
					pts.append(Vector3(sx * lerpf(0.35, half * 0.98, u), y - 0.25 - sin(u * PI) * 0.5, -0.3))
				for k in pts.size() - 1:
					lines.rope(pts[k], pts[k + 1], 0.022, RopeKit.HEMP)
				for k: int in [2, 4]:
					lines.rope(pts[k], Vector3(pts[k].x, y, -0.06), 0.014, RopeKit.HEMP)
	_mesh_child(pivot, yards.commit_lod(), shared_material("parts"), true).name = "Yard"
	_mesh_child(pivot, lines.commit(), shared_material("rope"), false).name = "Lines"
	var masts := c.masts.size()
	for i in ys.size():
		var bottom_y := maxf(y0 + 2.1, ys[i] - hh * 0.38) if i == 0 else ys[i - 1] + 0.2
		var bottom_half := halves[i] * 1.04 if i == 0 else halves[i - 1] * 0.97
		var h := ys[i] - bottom_y
		var emblem := i == 0 and (mi == masts - 1 or masts == 1 or (masts == 3 and mi == 1))
		var sail := _add_sail(pivot, Vector2(-halves[i] * 0.95, 0), Vector2(halves[i] * 0.95, 0), Vector2(-bottom_half * 0.95, -h), Vector2(bottom_half * 0.95, -h), minf(halves[i] * 0.32, 1.4), emblem)
		sail.position = Vector3(0, ys[i] - 0.12, 0.18)
		sails.append({"node": sail, "tier": i, "fore_aft": false, "pivot": pivot, "spar": sp})


## A lateen: one long yard slung slantwise from the mast, a triangular sail
## under it, swinging to the wind like a gaff.
func _build_lateen(m: Dictionary, zz: float, y0: float, hh: float, sp: Spar) -> void:
	var c := cls
	var k: float = m.get("span", 1.0)
	var pivot := Node3D.new()
	pivot.name = "Lateen"
	pivot.position = Vector3(0, 0, zz)
	add_child(pivot)
	fore_aft_pivots.append(pivot)
	sp.nodes.append(pivot)
	var low_y := y0 + hh * 0.3
	var fwd := Vector3(0, y0 + hh * 0.42, c.length * 0.12 * k)
	var aft := Vector3(0, y0 + hh, -c.length * 0.2 * k)
	var yard := MeshKit.new(29)
	yard.paint(DARK_WOOD, MeshKit.WOOD, 0.0)
	yard.spar(fwd, aft, 0.1, 0.06)
	_mesh_child(pivot, yard.commit(), shared_material("parts"), true).name = "Yard"
	# plane coords: x aft from the mast, y up from the foot
	var sail := _add_sail(pivot, Vector2(-fwd.z + 0.2, fwd.y - low_y - 0.1), Vector2(-aft.z - 0.3, aft.y - low_y - 0.2), Vector2(0.3, 0.05), Vector2(-aft.z * 0.55, 0.05), 0.9, false)
	sail.position = Vector3(0, low_y, 0)
	sail.rotation.y = PI * 0.5
	sails.append({"node": sail, "tier": 0, "fore_aft": true, "pivot": pivot, "spar": sp})


## Gaff and boom on their own pivot (they swing to the wind), the hoops along
## the luff, the gaff mainsail, and a small square topsail above for charm.
func _build_gaff(m: Dictionary, zz: float, y0: float, hh: float, r0: float, sp: Spar) -> void:
	var c := cls
	var span: float = m.get("span", 1.0)
	var pivot := Node3D.new()
	pivot.name = "Gaff"
	pivot.position = Vector3(0, 0, zz)
	add_child(pivot)
	fore_aft_pivots.append(pivot)
	sp.nodes.append(pivot)
	var foot_y := y0 + 1.9
	var throat_y := y0 + hh * 0.78
	var boom_len := c.length * 0.5 * span
	var gaff_len := c.length * 0.36 * span
	var peak_y := throat_y + gaff_len * 0.55
	var peak_a := gaff_len * 0.83
	var wood := MeshKit.new(13)
	wood.paint(DARK_WOOD, MeshKit.WOOD, 0.0)
	wood.spar(Vector3(0, foot_y, 0), Vector3(0, foot_y, -boom_len), 0.13, 0.09)
	wood.spar(Vector3(0, throat_y, 0), Vector3(0, peak_y, -peak_a), 0.11, 0.07)
	# jaws hugging the mast, a knob on the boom end
	var jaw := Basis(Vector3.UP, -PI * 0.2 + PI * 0.5) * Basis(Vector3.RIGHT, PI * 0.5)
	wood.torus(Transform3D(jaw, Vector3(0, foot_y, 0)), 0.24, 0.06, 4, 10, PI * 1.4)
	wood.torus(Transform3D(jaw, Vector3(0, throat_y, 0)), 0.24, 0.06, 4, 10, PI * 1.4)
	wood.ball(Vector3(0, foot_y, -boom_len), 0.13, 6, 4)
	_mesh_child(pivot, wood.commit(), shared_material("parts"), true).name = "Yard"
	# peak and throat halyards to the masthead, topping lift to the boom end
	var lines := RopeKit.new(17)
	var mh := Vector3(0, y0 + hh * 0.93, 0)
	for f: float in [0.45, 0.8]:
		lines.rope(Vector3(0, throat_y, 0).lerp(Vector3(0, peak_y, -peak_a), f), mh, 0.026, RopeKit.HEMP, 0.06)
	lines.rope(Vector3(0, throat_y + 0.2, 0), Vector3(0, y0 + hh * 0.86, 0), 0.026, RopeKit.HEMP, 0.06)
	lines.rope(Vector3(0, foot_y, -boom_len * 0.98), Vector3(0, y0 + hh * 0.97, 0), 0.026, RopeKit.HEMP, 0.06)
	_mesh_child(pivot, lines.commit(), shared_material("rope"), false).name = "Lines"
	# mast hoops hold the luff of the mainsail to the mast
	var r1 := r0 * (1.0 - 0.22 * ((foot_y - y0) / (hh * 0.8)))
	_small.paint(MeshKit.shade(MAST_WOOD, 1.15))
	var hy := foot_y + 0.7
	while hy < throat_y - 0.3:
		_on_spar(sp.group if hy > sp.pivot.y else 0)
		_small.hoop(Vector3(0, hy, zz), r1 + 0.06, 0.045, 4, 12)
		hy += 0.85 if detail else 1.4
	_on_spar(0)
	# the mainsail, in plane coords: x aft from the mast, y up from the foot
	var main := _add_sail(pivot, Vector2(0.15, throat_y - foot_y), Vector2(peak_a, peak_y - foot_y), Vector2(0.15, 0.1), Vector2(boom_len * 0.96, 0.1), 1.2, true)
	main.position = Vector3(0, foot_y, 0)
	main.rotation.y = PI * 0.5
	sails.append({"node": main, "tier": 0, "fore_aft": true, "pivot": pivot, "spar": sp})
	# a small square topsail above
	var ty := y0 + hh * 0.92
	var half := c.beam * 0.42
	_on_spar(sp.group)
	_core.paint(DARK_WOOD)
	_core.spar(Vector3(-half, ty, zz), Vector3(half, ty, zz), 0.07, 0.05)
	_on_spar(0)
	var drop := ty - throat_y - 0.4
	var topsail := _add_sail(self, Vector2(-half * 0.92, 0), Vector2(half * 0.92, 0), Vector2(-half * 1.05, -drop), Vector2(half * 1.05, -drop), 0.6, false)
	topsail.position = Vector3(0, ty - 0.1, zz + 0.18)
	sp.nodes.append(topsail)
	sails.append({"node": topsail, "tier": 1, "fore_aft": false, "pivot": null, "spar": sp})


## The bowsprit, as a Spar that snaps just inside the stem (the figure on
## the knee below it stays): the spar, its jib-boom, cap, dolphin striker
## and the stays and footropes rigged to them, and the jib.
func _build_bowsprit() -> void:
	var s := shape
	var c := cls
	var bow_t := 0.985
	var bow_top := Vector3(0, s.top(bow_t) - 0.1, s.z(bow_t))
	var ang := Figurehead.SPRIT_ANGLE
	var tip := bow_top + Vector3(0, sin(ang), cos(ang)) * c.bowsprit
	var bs_dir := (tip - bow_top).normalized()
	var bs_heel := bow_top + Vector3(0, -0.1, -1.6)
	var sp := Spar.new()
	sp.group = c.masts.size() + 1
	sp.bowsprit = true
	var zc := s.z(1.0) - 0.35
	sp.pivot = Vector3(0, s.top(bow_t) - 0.25, zc)
	sp.long = Vector3(0, sin(ang), cos(ang))
	sp.length = c.bowsprit * 1.3
	sp.radius = lerpf(0.2, 0.11, clampf((zc - bs_heel.z) / (tip.z - bs_heel.z), 0.0, 1.0))
	spars.append(sp)
	var bit := 1 << (sp.group - 1)
	var fore_bit := 1 << (c.masts.size() - 1)
	_core.paint(MAST_WOOD)
	_snapped_spar(_core, bs_heel, tip, 0.2, 0.11, 8, sp)
	_on_spar(sp.group)
	# the jib-boom run out beyond the bowsprit cap, with a gilded knob
	var jb_end := tip + bs_dir * c.bowsprit * 0.4
	var jb_tip := jb_end + Vector3(0, 0.12, 0)
	_core.paint(MAST_WOOD)
	_core.spar(tip - bs_dir * 1.2 + Vector3(0, 0.16, 0), jb_tip, 0.09, 0.06, 6)
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	_core.ball(jb_tip, 0.11)
	perches.append({"pos": jb_end + Vector3(0, 0.23, 0), "spar": -1})
	_core.paint(DARK_WOOD)
	_core.rbox(Transform3D(MeshKit.aim_z(bs_dir), tip + Vector3(0, 0.1, 0)), Vector3(0.42, 0.62, 0.3), 0.1)
	var heel_dir := (tip - bs_heel).normalized()
	var along := MeshKit.aim_z(heel_dir)
	_small.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	for f: float in [0.45, 0.75]:
		var at := bs_heel.lerp(tip, f)
		_on_spar(sp.group if at.z > zc else 0)
		_small.torus(Transform3D(along, at), lerpf(0.2, 0.11, f) + 0.012, 0.035, 4, 12)
	var fore_top := _mast_tops[_mast_tops.size() - 1]
	_ropes.owner = bit | fore_bit
	_ropes.rope(jb_tip, fore_top, 0.03, RopeKit.TAR, 0.12)
	_ropes.rope(fore_top, tip, 0.038, RopeKit.TAR, 0.1)
	_ropes.owner = bit
	# the bobstay, down to the knee's cutwater under the figure
	_ropes.rope(tip, head.foot, 0.05)
	# dolphin striker under the cap spreading the martingale, footropes under the jib-boom
	var striker_top := tip + Vector3(0, -0.12, -0.05)
	var striker_end := striker_top + Vector3(0, -1.0 - c.bowsprit * 0.08, 0.2)
	_on_spar(sp.group)
	_core.paint(DARK_WOOD)
	_core.spar(striker_top, striker_end, 0.065, 0.045, 5)
	_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	_core.ball(striker_end, 0.06, 5, 4)
	_ropes.rope(jb_tip, striker_end, 0.03)
	for side: float in [1.0, -1.0]:
		_ropes.rope(striker_end, s.skin_point(0.95, s.top(0.95) - 0.9, side, 0.05), 0.03)
		var cap_p := tip + Vector3(0, 0.1, 0)
		var prev := Vector3.ZERO
		for kk in 6:
			var u := kk / 5.0
			var p := cap_p.lerp(jb_tip, u) + Vector3(side * 0.32, -0.25 - sin(u * PI) * 0.45, 0)
			if kk > 0:
				_ropes.rope(prev, p, 0.02, RopeKit.HEMP)
			prev = p
	_ropes.owner = 0
	# the gammoning lashed round the heel
	_small.paint(Color("#9a7a50"))
	for f: float in [0.1, 0.15, 0.2]:
		var at := bs_heel.lerp(tip, f)
		_on_spar(sp.group if at.z > zc else 0)
		_small.torus(Transform3D(along, at), lerpf(0.2, 0.11, f) + 0.035, 0.03, 4, 10)
	_on_spar(0)
	if not c.jib:
		return
	var fore: Dictionary = c.masts[c.masts.size() - 1]
	var pivot := Node3D.new()
	pivot.name = "Jib"
	pivot.position = Vector3(0, 0, tip.z)
	add_child(pivot)
	fore_aft_pivots.append(pivot)
	sp.nodes.append(pivot)
	var fz := s.z(fore.t)
	var jib_head := Vector3(0, s.deck_y(fore.t) + float(fore.height) * 0.82, fz + 0.3)
	var tack := tip + Vector3(0, 0.15, -0.4)
	var clew := Vector3(0, s.top(0.9) + 1.0, fz + (tip.z - fz) * 0.32)
	# plane coords: x aft from the bowsprit tip, y up from the tack
	var sail := _add_sail(pivot, Vector2(tip.z - jib_head.z - 0.2, jib_head.y - tack.y), Vector2(tip.z - jib_head.z, jib_head.y - tack.y), Vector2(0.4, 0.15), Vector2(tip.z - clew.z, clew.y - tack.y), 0.8, false)
	sail.position = Vector3(0, tack.y, 0)
	sail.rotation.y = PI * 0.5
	# it goes with the bowsprit, and is cut away if the foremast its head is bent to falls
	sails.append({"node": sail, "tier": 0, "fore_aft": true, "pivot": pivot, "spar": sp, "head": spars[c.masts.size() - 1]})


## One sail: a grid in its own plane (tl, tr along the head, bl, br along the
## foot; +z is the side it bellies to), UV x across and y up from the foot.
func _add_sail(parent: Node3D, tl: Vector2, tr: Vector2, bl: Vector2, br: Vector2, billow: float, emblem: bool) -> MeshInstance3D:
	# a haunted ship's canvas hangs in rags: a finer grid, cells torn out of it
	var rags := cls.haunt
	var nu := 14 if rags else 10
	var nv := 11 if rags else 7
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var uv2 := PackedVector2Array()
	var nrm := PackedVector3Array()
	var torn := _rag_cells(nu, nv, emblem, sails.size()) if rags else PackedByteArray()
	var rng := RandomNumberGenerator.new()
	rng.seed = 911 + sails.size() * 37
	for j in nv + 1:
		var v := float(j) / nv
		var l := tl.lerp(bl, v)
		var r := tr.lerp(br, v)
		for i in nu + 1:
			var u := float(i) / nu
			var p := l.lerp(r, u)
			# a slight concave roach on the foot, for elegance
			if j == nv:
				p.y += sin(u * PI) * 0.12 * billow
			var ground := emblem and absf(u - 0.5) < 0.32 and v > 0.1 and v < 0.82
			if rags and j > 0 and i > 0 and i < nu and not ground:
				# the cloth's torn and stretched: no two rags square
				var cw := (r.x - l.x) / nu
				var ch := (tl.y - bl.y) / nv
				p += Vector2((rng.randf() - 0.5) * 0.5 * cw, (rng.randf() - 0.5) * 0.55 * ch * (0.4 + v))
			pos.append(Vector3(p.x, p.y, 0))
			uv.append(Vector2(u, 1.0 - v))
			uv2.append(Vector2(billow, 1.0 if emblem else 0.0))
			nrm.append(Vector3.BACK)
	var idx := PackedInt32Array()
	# (a rag's vertices: COLOR.r 0 where cloth is torn away beside it, or at
	# the foot, and ship_sail's ghost-fire smoulders there)
	var rag_col := PackedColorArray()
	if rags:
		rag_col.resize(pos.size())
		rag_col.fill(Color(1, 1, 1, 1))
	for j in nv:
		for i in nu:
			var a := j * (nu + 1) + i
			var cc := a + nu + 1
			# Godot winding (front faces +z); a rag loses either half of a cell
			var halves: Array[PackedInt32Array] = [PackedInt32Array([a, a + 1, cc]), PackedInt32Array([a + 1, cc + 1, cc])]
			for k in 2:
				if rags and torn[(j * nu + i) * 2 + k] == 1:
					for q in halves[k]:
						rag_col[q] = Color(0, 1, 1, 1)
					continue
				idx.append_array(halves[k])
	if rags:
		for i in nu + 1:
			rag_col[nv * (nu + 1) + i] = Color(0, 1, 1, 1)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_NORMAL] = nrm
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_TEX_UV2] = uv2
	if rags:
		arrays[Mesh.ARRAY_COLOR] = rag_col
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	# the belly moves it off its plane: room for that in the bounds
	var box := mesh.get_aabb()
	mesh.custom_aabb = box.grow(billow * 1.4 + 0.3)
	var mi := _mesh_child(parent, mesh, shared_material("sail"), true)
	mi.name = "Sail"
	mi.set_instance_shader_parameter("sail_phase", _phase + sails.size() * 1.7)
	if _parts.has("sails"):
		# the cloth of her refit (ship_sail's part branches), and where in its drift it starts
		mi.set_instance_shader_parameter("sail_part", Vector2(int(_parts.sails.tier) + 1, _phase))
	return mi


## Which halves of the cells of a haunted sail's (nu x nv) grid are torn
## away (1, two to a cell): most
## toward the foot and the leeches, a few holes shot through the middle; the
## head stays bent to its yard and a mark's ground stays whole.
func _rag_cells(nu: int, nv: int, emblem: bool, seed_value: int) -> PackedByteArray:
	var rng := RandomNumberGenerator.new()
	rng.seed = 4111 + seed_value * 53
	var out := PackedByteArray()
	out.resize(nu * nv * 2)
	for j in nv:
		var v := (j + 0.5) / nv
		for i in nu:
			var u := (i + 0.5) / nu
			var side := 1.0 - minf(u, 1.0 - u) * 2.0
			var chance := smoothstep(0.62, 1.0, v) * 0.62 + smoothstep(0.7, 1.0, side) * smoothstep(0.3, 0.8, v) * 0.3
			if j >= 2 and j < nv - 2 and absf(u - 0.5) > 0.12:
				chance = maxf(chance, 0.05)
			if j < 2 or (emblem and absf(u - 0.5) < 0.3 and v > 0.15 and v < 0.78):
				chance = 0.0
			# both halves of a cell go together, mostly, else just the one
			var gone := rng.randf() < chance
			var half := rng.randi() % 2
			out[(j * nu + i) * 2] = 1 if gone and (half == 0 or rng.randf() < 0.6) else 0
			out[(j * nu + i) * 2 + 1] = 1 if gone and (half == 1 or rng.randf() < 0.6) else 0
	return out


## A flag hanging from its hoist at the pivot, flying along +x.
func _add_flag(pivot: Node3D, w: float) -> void:
	var h := w * FLAG_ASPECT
	var gx := 16
	var gy := 4
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var nrm := PackedVector3Array()
	for j in gy + 1:
		for i in gx + 1:
			var u := float(i) / gx
			var v := float(j) / gy
			pos.append(Vector3(u * w, 0.05 - v * h, 0))
			uv.append(Vector2(u, v))
			nrm.append(Vector3.BACK)
	var idx := PackedInt32Array()
	for j in gy:
		for i in gx:
			var a := j * (gx + 1) + i
			var cc := a + gx + 1
			idx.append_array([a, a + 1, cc, a + 1, cc + 1, cc])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_NORMAL] = nrm
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh.custom_aabb = mesh.get_aabb().grow(0.4)
	flags.append(_mesh_child(pivot, mesh, shared_material("flag"), true))


# ------------------------------------------------------------------ bow

func _build_bow() -> void:
	var s := shape
	var length := cls.length
	var stem_top := Vector3(0, s.top(1.0) - 0.55, s.z(1.0) + 0.25)
	figure_at = head.centre
	var wale_col := MeshKit.blend(livery.wale, livery.hull, 0.4)
	var knee := Figurehead.build_knee(s, cls, head, _core, _core, wale_col, livery.trim, detail)
	# the figure on the knee: the mermaid, or the one her refit carries
	var fig := str(_parts.figure.key) if _parts.has("figure") else ("" if cls.haunt else "mermaid")
	# (a haunted ship's dead captain is carved with the rest of her: _build_haunt)
	if fig != "":
		Figurehead.build_figure(fig, head, {"wood": _core, "iron": _core, "trim": _core, "glow": _core}, livery.trim)
	if fig == "seraph":
		PartModels.seraph_lights(_part_kit(), head)
	# gilded trailboards: carved scrolls down each side of the bows, laid on the planking
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	for side: float in [1.0, -1.0]:
		var path: Array[Vector2] = [Vector2(stem_top.y - 0.05, stem_top.z - 0.3), Vector2(stem_top.y - 0.32, stem_top.z - 0.62)]
		var cy := stem_top.y - 0.58
		var cz := stem_top.z - 0.98
		for kk in 13:
			var f := kk / 12.0
			var a := PI * 0.5 + f * 1.15 * TAU
			var r := 0.24 * (1.0 - 0.7 * f)
			path.append(Vector2(cy + sin(a) * r, cz + cos(a) * r))
		var pts := PackedVector3Array()
		for yz in path:
			var t := clampf(yz.y / length + 0.5, 0.0, 1.0)
			pts.append(Vector3(side * (s.half_width_at_y(t, yz.x) + 0.05), yz.x, yz.y))
		_core.sweep(pts, func(u: float) -> float: return lerpf(0.085, 0.035, u), 6, 26)
		_core.ball(pts[pts.size() - 1], 0.06, 6, 4)
	# curved head rails sweeping from the bows out along the knee to the figure's back
	var knee_top: PackedVector2Array = knee.top
	var knee_half: float = knee.half
	for side: float in [1.0, -1.0]:
		for rail: Vector3 in [Vector3(0.0, 0.06, 0.32), Vector3(0.42, 0.048, 0.62)]:
			var r := rail.y
			var t0 := 0.93
			var y0 := s.top(t0) - 0.3 - rail.x
			var n := s.skin_normal(t0, y0, side)
			var p0 := s.skin_point(t0, y0, side) + n * r
			var kt := Figurehead.spline(knee_top, rail.z)
			var p2 := Vector3(side * (knee_half + r * 0.6), kt.y - r, kt.x)
			var p1 := Vector3(side * lerpf(absf(p0.x), knee_half + 0.2, 0.6), lerpf(p0.y, p2.y, 0.5) - 0.12, lerpf(p0.z, p2.z, 0.55))
			# each rail ends in a little carved curl on the knee's cheek
			var curl := Figurehead.scroll(p2 + Vector3(0, -0.1, 0), Vector3.BACK, Vector3.UP, 0.1, 0.85, PI * 0.5, 8)
			var path := PackedVector3Array([p0, p1])
			path.append_array(curl)
			_core.paint(livery.trim, MeshKit.GILT, 0.02)
			_core.sweep(path, func(v: float) -> float: return r if v < 0.75 else lerpf(r, r * 0.45, (v - 0.75) / 0.25), 5, 22)
		# cathead with an anchor hanging from it
		var ct := 0.88
		var cy := s.top(ct) - 0.05
		var hw := s.half_width_at_y(ct, cy)
		var end := Vector3(side * (hw + 0.75), cy + 0.08, s.z(ct) + 0.3)
		_core.paint(DARK_WOOD)
		_core.spar(Vector3(side * (hw - 0.4), cy, s.z(ct)), end, 0.13, 0.11, 6)
		_core.ball(end, 0.13, 6, 5)
		var ak := 0.75 + length * 0.012
		_build_anchor(end + Vector3(0, -0.15, 0), ak)
		# hawse hole with an iron lip, the cable running out of it to the ring
		var ht := 0.955
		var hy := s.wale_y(ht) + 0.42
		var hm := MeshKit.surface_frame(s.skin_point(ht, hy, side, -0.02), s.skin_normal(ht, hy, side))
		_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
		_core.torus(hm, 0.15, 0.045, 5, 12)
		_core.disc(hm, 0.14, 10)
		_ropes.rope(s.skin_point(ht, hy - 0.05, side, 0.04), end + Vector3(0, -0.15 - 0.12 * ak, 0), 0.05, RopeKit.HEMP, 0.06)


func _build_anchor(top: Vector3, k: float) -> void:
	_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	_core.torus(Transform3D(Basis(Vector3.UP, PI * 0.5), top + Vector3(0, -0.12 * k, 0)), 0.13 * k, 0.03 * k, 4, 10)
	_core.spar(top + Vector3(0, -1.475 * k, 0), top + Vector3(0, -0.225 * k, 0), 0.065 * k, 0.05 * k, 6)
	_core.spar(top + Vector3(0, -0.38 * k, -0.45 * k), top + Vector3(0, -0.38 * k, 0.45 * k), 0.045 * k, 0.045 * k, 6)
	_core.torus(Transform3D(Basis(Vector3.UP, PI * 0.5) * Basis(Vector3.BACK, PI), top + Vector3(0, -1.05 * k, 0)), 0.42 * k, 0.055 * k, 5, 10, PI)
	for sz: float in [-1.0, 1.0]:
		_core.sphere(Transform3D(Basis.from_scale(Vector3(0.5, 1, 1)), top + Vector3(0, -1.0 * k, sz * 0.42 * k)), 0.12 * k, 6, 4)


# ------------------------------------------------------------------ details

func _build_details() -> void:
	var s := shape
	var c := cls
	var barrel_col := Color("#8b5a33")
	var hoop_col := Color("#2f2a26")
	var crate_col := Color("#b08356")
	var grate := Color("#5a3e26")
	var coil_col := Color("#a3845a")
	var barrel := PackedVector2Array([Vector2(0, 0), Vector2(0.235, 0), Vector2(0.27, 0.1), Vector2(0.3, 0.36), Vector2(0.27, 0.62), Vector2(0.235, 0.72), Vector2(0, 0.72)])
	var barrel_at := func(x: float, zz: float) -> void:
		var y := s.deck_y(s.t_at(zz))
		_core.paint(barrel_col)
		_core.lathe(_at(Vector3(x, y, zz)), barrel, 10)
		_small.paint(hoop_col)
		for hy: float in [0.14, 0.58]:
			_small.hoop(Vector3(x, y + hy, zz), 0.28, 0.025, 3, 12)
	var crate_at := func(x: float, zz: float, sz: float, rot: float) -> void:
		var y := s.deck_y(s.t_at(zz))
		_core.paint(crate_col)
		_core.rbox(Transform3D(Basis(Vector3.UP, rot), Vector3(x, y + sz * 0.5, zz)), Vector3(sz, sz, sz), sz * 0.12)
		_core.paint(MeshKit.shade(crate_col, 0.8))
		_core.rbox(Transform3D(Basis(Vector3.UP, rot), Vector3(x, y + sz, zz)), Vector3(sz * 0.8, 0.04, sz * 0.8), 0.02)
	var coil_at := func(x: float, zz: float) -> void:
		var y := s.deck_y(s.t_at(zz))
		_small.paint(coil_col)
		_small.hoop(Vector3(x, y + 0.05, zz), 0.3, 0.06, 4, 12)
		_small.hoop(Vector3(x, y + 0.12, zz), 0.22, 0.06, 4, 12)

	# hatch gratings on the main deck: a raised coaming round a lattice over the dark hold
	for t: float in [0.46, 0.6]:
		var near_mast := false
		for m: Dictionary in c.masts:
			if absf(float(m.t) - t) < 0.05:
				near_mast = true
		if near_mast:
			continue
		var y := s.main_deck_y(t)
		var zz := s.z(t)
		var w := c.beam * 0.28
		var l := c.length * 0.07
		var ch := 0.24
		_core.paint(grate)
		for sx: float in [-1.0, 1.0]:
			_core.rbox(_at(Vector3(sx * (w - 0.14) * 0.5, y + ch * 0.5, zz)), Vector3(0.14, ch, l), 0.04, 1)
			_core.rbox(_at(Vector3(0, y + ch * 0.5, zz + sx * (l - 0.14) * 0.5)), Vector3(w, ch, 0.14), 0.04, 1)
		_core.paint(Color("#120c08"), MeshKit.WOOD, 0.0)
		_core.box(_at(Vector3(0, y + 0.08, zz)), Vector3(w - 0.2, 0.02, l - 0.2))
		var pitch := 0.17 if detail else 0.26
		var nx := maxi(2, floori((w - 0.28) / pitch))
		var nz := maxi(2, floori((l - 0.28) / pitch))
		_small.paint(MeshKit.shade(grate, 1.25), MeshKit.WOOD, 0.02)
		for i in range(1, nx):
			_small.box(_at(Vector3(-w * 0.5 + 0.14 + (w - 0.28) * i / nx, y + ch - 0.06, zz)), Vector3(0.05, 0.07, l - 0.24))
		for i in range(1, nz):
			_small.box(_at(Vector3(0, y + ch - 0.05, zz - l * 0.5 + 0.14 + (l - 0.28) * i / nz)), Vector3(w - 0.24, 0.05, 0.05))
	# barrels, crates and coiled lines by the masts
	var beam := c.beam
	for i in c.masts.size():
		var zz := s.z(c.masts[i].t)
		barrel_at.call(beam * 0.24, zz - 0.9)
		barrel_at.call(beam * 0.27, zz - 0.3)
		if i % 2 == 0:
			crate_at.call(-beam * 0.24, zz - 0.8, 0.6, 0.3)
		else:
			barrel_at.call(-beam * 0.26, zz + 0.7)
		coil_at.call(-beam * 0.1, zz + 0.9)
	crate_at.call(beam * 0.2, s.z(0.86), 0.5, 0.7)

	# the ship's wheel near the stern
	var wt := float(c.stern_castle.t) * 0.55 if not c.stern_castle.is_empty() else 0.16
	var wy := s.deck_y(wt) + 1.05
	var wz := s.z(wt)
	var wheel_col := MeshKit.shade(barrel_col, 1.1)
	_core.paint(wheel_col)
	_core.torus(_at(Vector3(0, wy, wz)), 0.42, 0.05, 6, 20)
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	_core.torus(_at(Vector3(0, wy, wz)), 0.17, 0.035, 5, 14)
	var spoke := PackedVector2Array([Vector2(0.024, 0), Vector2(0.03, 0.42), Vector2(0.045, 0.47), Vector2(0.03, 0.52), Vector2(0.04, 0.58), Vector2(0.03, 0.63), Vector2(0, 0.65)])
	_core.paint(wheel_col)
	for kk in 8:
		var a := kk / 8.0 * TAU
		_core.lathe(Transform3D(Basis(Vector3.BACK, a - PI * 0.5), Vector3(0, wy, wz)), spoke, 5)
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	_core.ball(Vector3(0, wy, wz - 0.04), 0.09, 6, 4)
	# the drum the tiller ropes wind round, between two stanchions
	_core.paint(MeshKit.shade(barrel_col, 0.85))
	_core.spar(Vector3(0, wy, wz + 0.12), Vector3(0, wy, wz + 0.72), 0.17, 0.17, 10)
	_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	_core.spar(Vector3(0, wy, wz - 0.08), Vector3(0, wy, wz + 0.8), 0.04, 0.04, 5)
	_core.paint(grate)
	for dz: float in [0.08, 0.76]:
		_core.rbox(_at(Vector3(0, s.deck_y(wt) + 0.56, wz + dz)), Vector3(0.22, 1.12, 0.12), 0.05, 1)
	for sx: float in [-1.0, 1.0]:
		_ropes.rope(Vector3(sx * 0.1, wy - 0.12, wz + 0.42), Vector3(sx * 0.35, s.deck_y(wt) + 0.02, wz + 0.42), 0.018, RopeKit.HEMP)
	deck_props.append(Vector3(0, wz + 0.48, 0.4))
	# binnacle: a turned pedestal with a brass hood over the compass
	var bz := wz + 1.25
	var by := s.deck_y(wt)
	_core.paint(barrel_col)
	_core.lathe(_at(Vector3(0, by, bz)), PackedVector2Array([Vector2(0, 0), Vector2(0.28, 0), Vector2(0.28, 0.08), Vector2(0.2, 0.16), Vector2(0.17, 0.62), Vector2(0.24, 0.72), Vector2(0.24, 0.82), Vector2(0, 0.82)]), 10)
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	_core.sphere(_at(Vector3(0, by + 0.82, bz)), 0.24, 10, 6, 0.0, TAU, 0.0, PI * 0.5)
	_core.ball(Vector3(0, by + 1.08, bz), 0.05, 5, 4)
	_small.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	for sx: float in [-1.0, 1.0]:
		_small.ball(Vector3(sx * 0.34, by + 0.75, bz), 0.09, 7, 5)
	deck_props.append(Vector3(0, bz, 0.34))

	# pin rails along the bulwarks at each mast, belaying pins set with coils hung off them
	var pin := PackedVector2Array([Vector2(0, -0.1), Vector2(0.022, -0.1), Vector2(0.022, 0.05), Vector2(0.036, 0.07), Vector2(0.03, 0.14), Vector2(0.04, 0.18), Vector2(0, 0.2)])
	var pin_col := Color("#c79a62")
	var gun_zs := PackedFloat32Array()
	for t in c.cannon_ts():
		gun_zs.append(s.z(t))
	var hang_coil := func(x: float, y: float, zz: float, along_z: bool) -> void:
		var b := Basis.from_scale(Vector3(1, 1.5, 1))
		if along_z:
			b = Basis(Vector3.UP, PI * 0.5) * b
		_small.paint(coil_col)
		_small.torus(Transform3D(b, Vector3(x, y - 0.24, zz)), 0.15, 0.035, 4, 10)
	for mi in c.masts.size():
		var m: Dictionary = c.masts[mi]
		var t: float = float(m.t) + 0.55 / c.length
		var dy := s.deck_y(t)
		var ry := dy + 0.6
		var zc := s.z(t)
		for side: float in [1.0, -1.0]:
			var x := side * (s.half_width_at_y(t, ry) - 0.13 - 0.1)
			var zs := PackedFloat32Array()
			for dz: float in [-0.5, -0.25, 0.0, 0.25, 0.5]:
				var ok := true
				for g in gun_zs:
					if absf(g - (zc + dz)) < 0.45:
						ok = false
				if ok:
					zs.append(zc + dz)
			if zs.size() < 2:
				continue
			var za := zs[0] - 0.15
			var zb := zs[zs.size() - 1] + 0.15
			_core.paint(grate)
			_core.rbox(_at(Vector3(x, ry, (za + zb) * 0.5)), Vector3(0.2, 0.09, zb - za), 0.035, 1)
			_small.paint(pin_col, MeshKit.WOOD, 0.08)
			for zp in zs:
				_small.lathe(_at(Vector3(x, ry, zp)), pin, 5)
			hang_coil.call(x - side * 0.02, ry, zs[0], true)
			hang_coil.call(x - side * 0.02, ry, zs[zs.size() - 1], true)
		# a fife rail by the foot of the mast
		if m.rig == "lateen":
			continue
		var fz := s.z(m.t) + _fife_side(m.t) * 0.78
		var fy := s.deck_y(m.t)
		var post := PackedVector2Array([Vector2(0, 0), Vector2(0.08, 0), Vector2(0.08, 0.06), Vector2(0.05, 0.12), Vector2(0.065, 0.45), Vector2(0.05, 0.78), Vector2(0.07, 0.82), Vector2(0, 0.86)])
		for sx: float in [-1.0, 1.0]:
			_core.paint(barrel_col)
			_core.lathe(_at(Vector3(sx * 0.52, fy, fz)), post, 6)
			hang_coil.call(sx * 0.52, fy + 0.66, fz - 0.09, false)
		_core.paint(grate)
		_core.rbox(_at(Vector3(0, fy + 0.8, fz)), Vector3(1.25, 0.1, 0.18), 0.04, 1)
		_small.paint(pin_col, MeshKit.WOOD, 0.08)
		for px: float in [-0.3, -0.1, 0.1, 0.3]:
			_small.lathe(_at(Vector3(px, fy + 0.8, fz)), pin, 5)
		deck_props.append(Vector3(0, fz, 0.6))
		# halyards and lifts led down from aloft and belayed round the pins
		var mr := 0.12 + float(m.height) * 0.0085
		var up_y := fy + float(m.height) * 0.6 - 0.36 if m.get("top", false) else fy + float(m.height) * 0.5
		# (they go slack with the mast)
		_ropes.owner = 1 << mi
		for px: float in [-0.3, -0.1, 0.1, 0.3]:
			var sx := signf(px)
			_ropes.rope(Vector3(px, fy + 0.95, fz), Vector3(sx * (mr + 0.12 + absf(px) * 0.15), up_y, s.z(m.t) - 0.05), 0.017, RopeKit.HEMP)
		_ropes.owner = 0
		if detail and _fife_side(m.t) > 0.0 and m.rig == "square":
			# the clewlines abaft the mast belay to a pair of bitts there
			var cz := s.z(m.t) - 0.72
			_fine.paint(barrel_col)
			for sx: float in [-1.0, 1.0]:
				_fine.rbox(_at(Vector3(sx * 0.4, fy + 0.45, cz)), Vector3(0.12, 0.9, 0.12), 0.03, 1)
			_fine.paint(grate)
			_fine.rbox(_at(Vector3(0, fy + 0.84, cz)), Vector3(0.95, 0.1, 0.14), 0.03, 1)

	# the galley stovepipe forward of the foremast, smoking when the cook is busy
	var fm: Dictionary = c.masts[c.masts.size() - 1]
	var st := float(fm.t) + 2.4 / c.length
	var sx0 := -c.beam * 0.13
	var szz := s.z(st)
	var sy := s.main_deck_y(st)
	_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	_core.spar(Vector3(sx0, sy, szz), Vector3(sx0, sy + 0.12, szz), 0.22, 0.2, 8)
	_core.spar(Vector3(sx0, sy, szz), Vector3(sx0, sy + 1.15, szz), 0.11, 0.1, 8)
	var elbow := Vector3(sx0, sy + 1.15, szz)
	var mouth := elbow + Vector3(0, 0.22, -0.28)
	_core.spar(elbow, mouth, 0.1, 0.12, 8)
	_core.ball(elbow, 0.105, 8, 5)
	chimney = mouth
	deck_props.append(Vector3(sx0, szz, 0.35))

	# capstan with its bars shipped
	var cap_t := 0.53
	var cap_near_mast := false
	for m: Dictionary in c.masts:
		if absf(float(m.t) - cap_t) < 0.05:
			cap_near_mast = true
	var cap_z := s.z(cap_t) + (1.6 if cap_near_mast else 0.0)
	var cap_y := s.main_deck_y(cap_t)
	_core.paint(barrel_col)
	_core.lathe(_at(Vector3(0, cap_y, cap_z)), PackedVector2Array([Vector2(0, 0), Vector2(0.45, 0), Vector2(0.45, 0.1), Vector2(0.32, 0.18), Vector2(0.28, 0.5), Vector2(0.38, 0.62), Vector2(0.38, 0.76), Vector2(0, 0.8)]), 12)
	_small.paint(grate)
	for kk in 4:
		var a := kk / 4.0 * TAU + 0.4
		_small.spar(Vector3(0, cap_y + 0.68, cap_z), Vector3(cos(a) * 0.8, cap_y + 0.68, cap_z + sin(a) * 0.8), 0.04, 0.035, 4)

	# the ship's boat stowed on skids amidships
	if c.id == "galleon":
		_build_boat(Vector3(0, s.main_deck_y(0.62) + 0.62, s.z(0.62)), 4.4, 1.7)

	# the stern lantern: glowing glass under an iron cap with a gilded finial
	var lanterns := PackedFloat32Array([-0.6, 0.0, 0.6] if not c.stern_castle.is_empty() else [0.0])
	for lx in lanterns:
		var k := 1.35 if lx == 0.0 and not c.stern_castle.is_empty() else 1.0
		var ty := s.top(0.01)
		var x := lx * s.half_beam(0.01)
		var zz := s.z(0.01) - 0.05
		_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
		_core.spar(Vector3(x, ty, zz), Vector3(x, ty + 0.6 * k, zz), 0.05, 0.04, 5)
		if cls.haunt:
			# ghost-fire in her lanterns (its glow is all its own: the sea has her pumpkins)
			_small.paint(GHOST_FIRE, MeshKit.GLOW, 0.0)
			_small.sphere(Transform3D(Basis.from_scale(Vector3(1, 1.35, 1)), Vector3(x, ty + 0.82 * k, zz)), 0.2 * k, 8, 6)
			glows.append(Vector4(x, ty + 0.82 * k, zz, k * 1.2))
			glow_kinds.append(1.0)
			haunt_points.append(Vector3(x, ty + 0.82 * k, zz))
		else:
			_small.paint(Color(1.0, 0.64, 0.28).linear_to_srgb(), MeshKit.GLOW, 0.0)
			_small.sphere(Transform3D(Basis.from_scale(Vector3(1, 1.35, 1)), Vector3(x, ty + 0.82 * k, zz)), 0.2 * k, 8, 6)
			lamps.append(Vector4(x, ty + 0.82 * k, zz, k))
		_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
		_core.cone(_at(Vector3(x, ty + 1.15 * k, zz)), 0.24 * k, 0.24 * k, 8)
		_core.spar(Vector3(x, ty + 0.53 * k, zz), Vector3(x, ty + 0.63 * k, zz), 0.12 * k, 0.17 * k, 8)
		_core.paint(livery.trim, MeshKit.GILT, 0.02)
		_core.ball(Vector3(x, ty + 1.3 * k, zz), 0.07 * k, 6, 4)


# ------------------------------------------------------------------ haunted

## A haunted ship's own furniture: jack-o'-lanterns grinning along her rails
## and heaped on her quarterdeck and forecastle, skulls on her taffrail, and
## on the knee of her head her dead captain, a skeleton in a tricorn and a
## rotted coat, a cutlass raised in one bony hand and a lantern of ghost-fire
## held out ahead of her in the other.
func _build_haunt() -> void:
	var s := shape
	var c := cls
	# along the rails, clear of the masts' channels and the castles' steps
	for t: float in [0.1, 0.36, 0.42, 0.61, 0.89]:
		var near := false
		for m: Dictionary in c.masts:
			if absf(float(m.t) - t) < 0.055:
				near = true
		if near:
			continue
		var rail_r := 0.09 + c.length * 0.0034
		for side: float in [1.0, -1.0]:
			var r := 0.25 + 0.03 * sin(t * 40.0 + side)
			var at := Vector3(side * (s.half_width_at_y(t, s.top(t)) - 0.065), s.top(t) + 0.03 + rail_r + r * 0.72, s.z(t))
			_pumpkin(at, r, Vector3(side, 0.0, -0.45).normalized(), t * 13.0 + side)
	# heaps of them on the quarterdeck, either side of the wheel's wake, and on the forecastle
	var heaps: Array[Vector3] = [Vector3(c.beam * 0.17, 0.0, 0.065), Vector3(-c.beam * 0.17, 0.0, 0.065), Vector3(c.beam * 0.09, 0.0, 0.875)]
	for hi in heaps.size():
		var hp := heaps[hi]
		var t := hp.z
		var y := s.deck_y(t)
		var zz := s.z(t)
		var face := Vector3(signf(hp.x) * 0.4, 0.0, -1.0 if hi < 2 else 1.0).normalized()
		_pumpkin(Vector3(hp.x, y + 0.36, zz), 0.44, face, 3.0 + hi)
		_pumpkin(Vector3(hp.x + signf(hp.x) * 0.55, y + 0.25, zz + 0.25), 0.31, (face + Vector3(signf(hp.x) * 0.5, 0, 0)).normalized(), 5.0 + hi)
		_pumpkin(Vector3(hp.x - signf(hp.x) * 0.25, y + 0.19, zz + face.z * 0.55), 0.23, face, 7.0 + hi)
		if hi != 1:
			# the heaps' candlelight on the water (the sea mirrors so many lamps)
			lamps.append(Vector4(hp.x, y + 0.5, zz, 1.3))
	# grinning skulls along her taffrail, between the lanterns
	var ty := s.top(0.01)
	var hb := s.half_beam(0.01)
	for lx: float in [-0.3, 0.3, -0.85, 0.85]:
		var x := lx * hb
		var zz := s.z(0.012) + 0.02
		var at := Vector3(x, ty + 0.2, zz)
		_skull(Transform3D(Basis(Vector3.UP, PI).scaled(Vector3.ONE * 0.15), at), _core, _small)
	_dead_captain()
	_on_spar(0)


## A carved pumpkin on a haunted ship, ribbed and squat with a crooked stem,
## its face cut out and lit from within, turned toward `face` (horizontal).
func _pumpkin(at: Vector3, r: float, face: Vector3, seed_value: float) -> void:
	var b := Basis(Vector3.UP, atan2(face.x, face.z))
	var xf := Transform3D(b, at)
	var w := 16
	var h := 8
	var base := _core.vertex_count()
	var i0 := _core.indices.size()
	_core.paint(MeshKit.shade(PUMPKIN, 0.92 + 0.12 * fposmod(seed_value * 3.7, 1.0)), MeshKit.WOOD, 0.04)
	for j in h + 1:
		var th := PI * j / h
		var st := sin(th)
		var ct := cos(th)
		if absf(st) < 1e-6:
			st = 0.0
			ct = signf(ct)
		for i in w + 1:
			var ph := TAU * (i % w) / w
			var rib := 0.9 + 0.1 * absf(cos(ph * 4.0))
			# a dimple at the crown where the stem grows
			var y := ct * 0.8 - (0.16 if j == 0 else 0.0)
			var d := Vector3(-cos(ph) * st * rib, y, sin(ph) * st * rib)
			_core.add_vertex(xf * (d * r), b * d.normalized())
	_core.grid(base, h + 1, w + 1, true)
	_core.recompute_normals(base, i0)
	# the stem, curling off the top
	_core.paint(Color("#4a5226"), MeshKit.WOOD, 0.05)
	var top := xf * Vector3(0, r * 0.62, 0)
	var lean := b * Vector3(0.6, 1.0, -0.3).normalized()
	_core.spar(top, top + lean * r * 0.42, r * 0.11, r * 0.06, 5)
	# the face: two eyes, a nose and a jagged grin, lit
	_small.paint(PUMPKIN_FIRE, MeshKit.GLOW, 0.0)
	var on := func(fx: float, fy: float) -> Vector3:
		var dz := sqrt(maxf(1.0 - fx * fx - fy * fy, 0.04))
		var ph := atan2(dz, -fx)
		var rib := 0.9 + 0.1 * absf(cos(ph * 4.0))
		return xf * (Vector3(fx * rib, fy * 0.8, dz * rib) * r * 1.03)
	var n := (b * Vector3.BACK).normalized()
	for sx: float in [-1.0, 1.0]:
		_glow_poly([on.call(sx * 0.42, 0.1), on.call(sx * 0.13, 0.1), on.call(sx * 0.28, 0.42)], n)
	_glow_poly([on.call(-0.08, -0.04), on.call(0.08, -0.04), on.call(0.0, 0.11)], n)
	var k := 8
	for q in k:
		var xa := lerpf(-0.56, 0.56, float(q) / k)
		var xb := lerpf(-0.56, 0.56, float(q + 1) / k)
		var ta := -0.2 + 0.3 * xa * xa - (0.09 if q % 2 == 1 else 0.0)
		var tb := -0.2 + 0.3 * xb * xb - (0.09 if q % 2 == 0 and q + 1 < k else 0.0)
		var ba := -0.44 + 0.38 * xa * xa
		var bb := -0.44 + 0.38 * xb * xb
		_glow_poly([on.call(xa, ba), on.call(xb, bb), on.call(xb, tb), on.call(xa, ta)], n)
	glows.append(Vector4(at.x, at.y, at.z, r * 3.4))
	glow_kinds.append(0.5)
	haunt_points.append(at)


## A flat convex polygon of lamplight (counter-clockwise seen along n).
func _glow_poly(pts: Array, n: Vector3) -> void:
	var a: Vector3 = pts[0]
	var b: Vector3 = pts[1]
	var cc: Vector3 = pts[2]
	var flip := (b - a).cross(cc - a).dot(n) < 0.0
	var i0 := -1
	for p: Vector3 in pts:
		var i := _small.add_vertex(p, n)
		if i0 < 0:
			i0 = i
	for k in range(1, pts.size() - 1):
		if flip:
			_small.tri(i0, i0 + k + 1, i0 + k)
		else:
			_small.tri(i0, i0 + k, i0 + k + 1)


## A skull in a frame (+z its face, +y up, a unit its cranium's radius): bone,
## dark sockets with ghost-fire in them, a row of teeth.
func _skull(xf: Transform3D, kit: MeshKit, glow: MeshKit) -> void:
	kit.paint(BONE, MeshKit.WOOD, 0.03)
	kit.sphere(xf * Transform3D(Basis.from_scale(Vector3(0.92, 0.95, 1.05)), Vector3(0, 0.12, 0)), 1.0, 12, 8)
	kit.rbox(xf * Transform3D(Basis.IDENTITY, Vector3(0, -0.5, 0.32)), Vector3(1.05, 0.6, 0.85), 0.24, 2)
	kit.paint(Color("#0a0709"), MeshKit.WOOD, 0.0)
	for sx: float in [-1.0, 1.0]:
		kit.sphere(xf * Transform3D(Basis.from_scale(Vector3(1.0, 0.85, 0.6)), Vector3(sx * 0.36, -0.02, 0.8)), 0.27, 8, 6)
	kit.sphere(xf * Transform3D(Basis.from_scale(Vector3(0.7, 1.0, 0.6)), Vector3(0, -0.36, 0.9)), 0.13, 6, 4)
	kit.box(xf * Transform3D(Basis.IDENTITY, Vector3(0, -0.66, 0.66)), Vector3(0.72, 0.17, 0.3))
	kit.paint(BONE, MeshKit.WOOD, 0.03)
	for ti in 6:
		kit.box(xf * Transform3D(Basis.IDENTITY, Vector3(-0.3 + ti * 0.12, -0.66, 0.79)), Vector3(0.085, 0.15, 0.08))
	glow.paint(GHOST_FIRE, MeshKit.GLOW, 0.0)
	for sx: float in [-1.0, 1.0]:
		glow.ball(xf * Vector3(sx * 0.35, -0.02, 0.86), xf.basis.get_scale().x * 0.11, 6, 4)


## The dead captain on the knee of her head (Figurehead's frame: y up from
## the hips, z out ahead, leaning with the bowsprit).
func _dead_captain() -> void:
	var h := head
	var f := h.place
	var cloth := SHROUD
	# his long coat, turned and flattened fore and aft
	_core.paint(cloth, MeshKit.WOOD, 0.02)
	_core.lathe(f * Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.72)), Vector3.ZERO), PackedVector2Array([
		Vector2(0.0, -0.66), Vector2(0.21, -0.66), Vector2(0.28, -0.45), Vector2(0.31, -0.15), Vector2(0.26, 0.2),
		Vector2(0.21, 0.5), Vector2(0.25, 0.68), Vector2(0.22, 0.79), Vector2(0.08, 0.86), Vector2(0.0, 0.88)]), 14)
	# gilt cuffs of the coat's hem, his sword belt
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	_core.torus(f * Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.72)) * Basis(Vector3.RIGHT, PI * 0.5), Vector3(0, -0.6, 0)), 0.235, 0.022, 4, 16)
	_core.torus(f * Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.72)) * Basis(Vector3.RIGHT, PI * 0.5), Vector3(0, 0.08, 0)), 0.29, 0.03, 4, 16)
	_core.rbox(f * Transform3D(Basis.IDENTITY, Vector3(0, 0.08, 0.215)), Vector3(0.1, 0.09, 0.03), 0.01, 1)
	# epaulettes
	for sx: float in [-1.0, 1.0]:
		_core.sphere(f * Transform3D(Basis.from_scale(Vector3(1.0, 0.45, 1.0)), Vector3(sx * 0.23, 0.74, 0.0)), 0.08, 8, 5)
	# his ribs bare where the coat has rotted open, a coal of ghost-fire behind them
	_small.paint(GHOST_FIRE, MeshKit.GLOW, 0.0)
	_small.ball(f * Vector3(0.04, 0.47, 0.11), 0.055 * h.scale, 7, 5)
	_core.paint(BONE, MeshKit.WOOD, 0.03)
	for k in 4:
		var y := 0.31 + 0.088 * k
		var br := 0.215 - 0.012 * absf(k - 1.5)
		_core.torus(f * Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.76)) * Basis(Vector3.UP, -0.12 * PI) * Basis(Vector3.RIGHT, PI * 0.5), Vector3(0, y, 0)), br, 0.017, 4, 10, 0.76 * PI)
	_core.spar(f * Vector3(0, 0.27, 0.16), f * Vector3(0, 0.62, 0.16), 0.02 * h.scale, 0.02 * h.scale, 4)
	# the skull, levelled to look ahead
	var hx := f * Transform3D(Basis(Vector3.RIGHT, -h.lean * 0.85).scaled(Vector3.ONE * 0.165), Vector3(0, 1.0, 0.04))
	_core.paint(BONE, MeshKit.WOOD, 0.03)
	_core.spar(f * Vector3(0, 0.8, 0.0), hx * Vector3(0, -0.7, 0), 0.05 * h.scale, 0.045 * h.scale, 5)
	_skull(hx, _core, _small)
	# his tricorn: a low crown and three cocked flaps piped in gilt
	var hat := Color("#120e14")
	_core.paint(hat, MeshKit.WOOD, 0.02)
	_core.lathe(hx * Transform3D(Basis.IDENTITY, Vector3(0, 0.55, -0.02)), PackedVector2Array([
		Vector2(0.0, 0.0), Vector2(0.98, 0.0), Vector2(0.92, 0.32), Vector2(0.78, 0.56), Vector2(0.4, 0.66), Vector2(0.0, 0.68)]), 12)
	for a: float in [PI, PI / 3.0, -PI / 3.0]:
		var fb := Basis(Vector3.UP, a) * Basis(Vector3.RIGHT, 0.42)
		var fx := Transform3D(fb, Basis(Vector3.UP, a) * Vector3(0, 0.66, 0.88))
		_core.paint(hat, MeshKit.WOOD, 0.02)
		_core.rbox(hx * fx, Vector3(1.75, 0.62, 0.09), 0.04, 1)
		_small.paint(livery.trim, MeshKit.GILT, 0.02)
		_small.spar(hx * fx * Vector3(-0.86, 0.3, 0.05), hx * fx * Vector3(0.86, 0.3, 0.05), 0.012 * h.scale, 0.012 * h.scale, 4)
	# a ghostly plume
	_small.paint(GHOST_FIRE, MeshKit.GLOW, 0.0)
	_small.sweep(PackedVector3Array([hx * Vector3(0.55, 0.95, 0.1), hx * Vector3(0.9, 1.45, -0.35), hx * Vector3(0.8, 1.7, -1.0), hx * Vector3(0.5, 1.6, -1.5)]),
		func(u: float) -> float: return lerpf(0.035, 0.01, u) * h.scale, 5, 10)
	# his sword arm, a cutlass raised high
	var shoulder_r := f * Vector3(-0.25, 0.7, 0.0)
	var elbow_r := f * Vector3(-0.33, 0.5, 0.18)
	var hand_r := f * Vector3(-0.34, 0.66, 0.4)
	_core.paint(cloth, MeshKit.WOOD, 0.02)
	_core.spar(shoulder_r, elbow_r, 0.08 * h.scale, 0.065 * h.scale, 7)
	_core.paint(BONE, MeshKit.WOOD, 0.03)
	_core.spar(elbow_r, hand_r, 0.028 * h.scale, 0.024 * h.scale, 5)
	_core.ball(hand_r, 0.045 * h.scale, 6, 4)
	var blade := (f.basis * Vector3(-0.05, 1.0, 0.45)).normalized()
	var bb := Basis(Quaternion(Vector3.UP, blade))
	var bl := 0.7 * h.scale
	_core.paint(Color("#b9bfca"), MeshKit.IRON, 0.02)
	_core.rbox(Transform3D(bb, hand_r + blade * (bl * 0.5 + 0.06 * h.scale)), Vector3(0.075 * h.scale, bl, 0.014 * h.scale), 0.005, 1)
	_core.paint(livery.trim, MeshKit.GILT, 0.02)
	_core.torus(Transform3D(bb * Basis(Vector3.RIGHT, PI * 0.5), hand_r + blade * 0.05 * h.scale), 0.06 * h.scale, 0.012 * h.scale, 4, 10, PI)
	# his lantern arm, held out ahead, the lantern swinging below his hand
	var shoulder_l := f * Vector3(0.25, 0.7, 0.0)
	var elbow_l := f * Vector3(0.31, 0.6, 0.27)
	var hand_l := f * Vector3(0.3, 0.78, 0.55)
	_core.paint(cloth, MeshKit.WOOD, 0.02)
	_core.spar(shoulder_l, elbow_l, 0.08 * h.scale, 0.065 * h.scale, 7)
	_core.paint(BONE, MeshKit.WOOD, 0.03)
	_core.spar(elbow_l, hand_l, 0.028 * h.scale, 0.024 * h.scale, 5)
	_core.ball(hand_l, 0.045 * h.scale, 6, 4)
	var lantern := hand_l + Vector3(0, -0.42, 0)
	_small.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	_small.spar(hand_l, lantern + Vector3(0, 0.2, 0), 0.012, 0.012, 4)
	_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	_core.cone(_at(lantern + Vector3(0, 0.2, 0)), 0.15, 0.13, 8)
	_core.spar(lantern + Vector3(0, -0.2, 0), lantern + Vector3(0, -0.13, 0), 0.06, 0.12, 8)
	_small.paint(GHOST_FIRE, MeshKit.GLOW, 0.0)
	_small.sphere(Transform3D(Basis.from_scale(Vector3(1, 1.3, 1)), lantern), 0.12, 8, 6)
	glows.append(Vector4(lantern.x, lantern.y, lantern.z, 1.5))
	glow_kinds.append(1.0)
	haunt_points.append(lantern)
	haunt_points.append(hx.origin)


## A ship's boat upside up on skids: a round-bilged shell in the boot-top
## colour, a strake-coloured gunwale, bottom boards and thwarts.
func _build_boat(at: Vector3, length: float, wid: float) -> void:
	var floor_col := Color("#a9814f")
	_core.paint(livery.boot)
	_core.sphere(Transform3D(Basis.from_scale(Vector3(wid * 0.5, 0.55, length * 0.5)), at), 1.0, 16, 6, 0.0, TAU, PI * 0.5, PI * 0.5)
	_core.paint(floor_col)
	_core.disc(Transform3D(Basis(Vector3.RIGHT, -PI * 0.5) * Basis.from_scale(Vector3(wid * 0.44, length * 0.44, 1.0)), at + Vector3(0, -0.12, 0)), 1.0, 16)
	var rim := PackedVector3Array()
	for i in 16:
		var a := TAU * i / 16.0
		rim.append(at + Vector3(cos(a) * wid * 0.48, 0.02, sin(a) * length * 0.48))
	_core.paint(livery.strake)
	_core.tube(rim, 0.07, true, 5, 3)
	for f: float in [-0.25, 0.08, 0.36]:
		_core.paint(MeshKit.shade(floor_col, 0.85))
		_core.rbox(_at(at + Vector3(0, -0.06, f * length)), Vector3(wid * sqrt(1.0 - (f * 2.0) * (f * 2.0)) * 0.9, 0.06, 0.26), 0.025)
	for f: float in [-0.28, 0.28]:
		_core.paint(DARK_WOOD)
		_core.rbox(_at(at + Vector3(0, -0.62, f * length)), Vector3(wid * 1.5, 0.5, 0.22), 0.06)


## Which side of a mast its fife rail stands: abaft (-1) unless a hatch is in the way, then before it.
func _fife_side(mt: float) -> float:
	var s := shape
	var c := cls
	for t: float in [0.46, 0.6]:
		var by_mast := false
		for mm: Dictionary in c.masts:
			if absf(float(mm.t) - t) < 0.05:
				by_mast = true
		if by_mast:
			continue
		if absf(s.z(mt) - 0.78 - s.z(t)) < c.length * 0.035 + 0.3 + 0.2:
			return 1.0
	return -1.0


## The lived-in layer: bronze swivel guns on the rails, entry battens and man
## ropes up the side, scuppers, fire buckets and a sea chest, and the ship's
## cat keeping an eye on things from a crate.
func _build_deck_life() -> void:
	var s := shape
	var c := cls
	var length := c.length
	var swivel := PackedVector2Array([Vector2(0, -0.36), Vector2(0.04, -0.35), Vector2(0.05, -0.3), Vector2(0.035, -0.27), Vector2(0.06, -0.24), Vector2(0.055, 0.0), Vector2(0.045, 0.3), Vector2(0.055, 0.34), Vector2(0.035, 0.36), Vector2(0.035, 0.3), Vector2(0, 0.3)])
	var swivel_ts: Array[float] = [float(c.stern_castle.t) * 0.45 if not c.stern_castle.is_empty() else 0.13, (float(c.fore_castle.t) + 0.96) * 0.5 if not c.fore_castle.is_empty() else 0.8]
	for t in swivel_ts:
		var clear := true
		for m: Dictionary in c.masts:
			if absf(float(m.t) - t) * length < 1.6:
				clear = false
		if not clear:
			continue
		for side: float in [1.0, -1.0]:
			var ry := s.top(t) + 0.03
			var rx := side * (s.half_width_at_y(t, s.top(t)) - 0.065)
			var zz := s.z(t)
			var y := ry + 0.2
			# the crutch: a post dropped into the rail, a fork cradling the trunnions
			_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
			_core.spar(Vector3(rx, ry - 0.05, zz), Vector3(rx, y - 0.05, zz), 0.025, 0.025, 5)
			_core.torus(Transform3D(Basis(Vector3.RIGHT, PI) * Basis(Vector3.UP, PI * 0.5), Vector3(rx, y + 0.02, zz)), 0.07, 0.016, 4, 8, PI)
			_core.paint(livery.trim, MeshKit.GILT, 0.02)
			_core.lathe(Transform3D(Basis(Vector3.BACK, -side * PI * 0.5 + side * 0.08), Vector3(rx + side * 0.06, y + 0.02, zz)), swivel, 8 if detail else 6)
			# the tiller to train it by, angled down and inboard
			_core.paint(IRON_PAINT, MeshKit.IRON, 0.03)
			_core.spar(Vector3(rx - side * 0.29, y + 0.01, zz), Vector3(rx - side * 0.62, y - 0.1, zz), 0.014, 0.012, 4)
			_core.ball(Vector3(rx - side * 0.63, y - 0.1, zz), 0.025, 5, 3)

	# entry battens and man ropes up the side amidships, between two guns
	var ts := c.cannon_ts()
	var gaps := PackedFloat32Array()
	for i in range(1, ts.size()):
		gaps.append((ts[i] + ts[i - 1]) * 0.5)
	var entry := -1.0
	for g in gaps:
		var clear := true
		for m: Dictionary in c.masts:
			if absf(float(m.t) - g) <= 0.075:
				clear = false
		if clear and (entry < 0.0 or absf(g - 0.5) < absf(entry - 0.5)):
			entry = g
	if entry > 0.0:
		for side: float in [1.0, -1.0]:
			var top := s.top(entry)
			var y := 0.35
			_small.paint(MeshKit.shade(DARK_WOOD, 1.3))
			while y < top - 0.25:
				var fm := MeshKit.surface_frame(s.skin_point(entry, y, side, 0.02), s.skin_normal(entry, y, side))
				_small.box(fm * _at(Vector3(0, 0, 0.04)), Vector3(0.46, 0.07, 0.1))
				y += 0.36
			if detail:
				for dz: float in [-0.36, 0.36]:
					var tt := entry + dz / length
					var a := s.skin_point(tt, top + 0.5, side, -0.08)
					var b := s.skin_point(tt, 0.45, side, 0.12)
					_ropes.rope(a, b, 0.016, RopeKit.HEMP, 0.04)
					_fine.paint(IRON_PAINT, MeshKit.IRON, 0.03)
					_fine.spar(s.skin_point(tt, top - 0.1, side, -0.08), a, 0.016, 0.016, 4)
					_fine.paint(livery.trim, MeshKit.GILT, 0.02)
					_fine.ball(a, 0.03, 5, 4)
				# scuppers: lead-lined drains through the side at the waterway
				_fine.paint(IRON_PAINT, MeshKit.IRON, 0.03)
				for tt in gaps:
					if absf(tt - entry) < 0.02:
						continue
					var yy := s.main_deck_y(tt) + 0.06
					var fm := MeshKit.surface_frame(s.skin_point(tt, yy, side, 0.014), s.skin_normal(tt, yy, side))
					_fine.disc(fm * Transform3D(Basis.from_scale(Vector3(1.3, 0.8, 1)), Vector3.ZERO), 0.06, 8)

	if not detail:
		return

	# fire buckets in a row and a sailor's sea chest at the break of the deck
	var bt := float(c.stern_castle.t) if not c.stern_castle.is_empty() else 0.3
	var bz := s.z(bt) + (0.42 if not c.stern_castle.is_empty() else 0.0)
	var by := s.main_deck_y(bt + 0.42 / length)
	var bx := minf(c.beam * 0.26, s.half_width_at_y(bt, by) - 1.2)
	var bucket := PackedVector2Array([Vector2(0, 0), Vector2(0.1, 0), Vector2(0.13, 0.26), Vector2(0.115, 0.27), Vector2(0.105, 0.04), Vector2(0, 0.04)])
	for i in 3:
		var x := bx + (i - 1) * 0.3
		_fine.paint(Color("#3a2418"))
		_fine.lathe(_at(Vector3(x, by, bz)), bucket, 9)
		# a painted band and a rope bail
		_fine.paint(livery.trim)
		_fine.hoop(Vector3(x, by + 0.18, bz), 0.122, 0.012, 3, 10)
		_fine.paint(RopeKit.HEMP)
		_fine.torus(_at(Vector3(x, by + 0.27, bz)), 0.12, 0.01, 3, 8, PI)
	deck_props.append(Vector3(bx, bz, 0.55))
	var cx := -bx
	var cz := bz + 0.05
	_fine.paint(Color("#6b4a2c"))
	_fine.rbox(_at(Vector3(cx, by + 0.19, cz)), Vector3(0.8, 0.38, 0.46), 0.04, 1)
	# a rounded lid and iron straps
	_fine.paint(Color("#5a3c22"))
	_fine.spar(Vector3(cx - 0.4, by + 0.38, cz), Vector3(cx + 0.4, by + 0.38, cz), 0.23, 0.23, 10)
	_fine.paint(IRON_PAINT, MeshKit.IRON, 0.03)
	for sx: float in [-0.27, 0.27]:
		_fine.torus(Transform3D(Basis(Vector3.UP, PI * 0.5) * Basis.from_scale(Vector3(1, 0.47, 1)), Vector3(cx + sx, by + 0.38, cz)), 0.235, 0.014, 3, 10, PI)
		_fine.box(_at(Vector3(cx + sx, by + 0.19, cz)), Vector3(0.03, 0.38, 0.48))
	_fine.paint(livery.trim, MeshKit.GILT, 0.02)
	_fine.rbox(_at(Vector3(cx, by + 0.33, cz + 0.24)), Vector3(0.09, 0.1, 0.03), 0.01, 1)
	deck_props.append(Vector3(cx, cz, 0.55))

	# the ship's cat, sat on the crate in the bows with her tail curled round her paws
	var furs := [Color("#d9853b"), Color("#2a2622"), Color("#8a8580"), Color("#e8e0d0")]
	var fur: Color = furs[randi() % furs.size()]
	var at := Transform3D(Basis(Vector3.UP, randf() * TAU), Vector3(c.beam * 0.2, s.deck_y(0.86) + 0.54, s.z(0.86)))
	_fine.paint(fur, MeshKit.WOOD, 0.03)
	_fine.sphere(at * Transform3D(Basis.from_scale(Vector3(0.85, 1.05, 1.2)), Vector3(0, 0.1, -0.02)), 0.1, 9, 7)
	_fine.sphere(at * Transform3D(Basis.from_scale(Vector3(0.8, 1.2, 0.9)), Vector3(0, 0.17, 0.05)), 0.07, 8, 6)
	_fine.sphere(at * Transform3D(Basis.from_scale(Vector3(1.05, 0.95, 1)), Vector3(0, 0.27, 0.07)), 0.058, 9, 7)
	_fine.sphere(at * Transform3D(Basis.from_scale(Vector3(1.1, 0.8, 1)), Vector3(0, 0.255, 0.122)), 0.024, 6, 4)
	for ex: float in [-1.0, 1.0]:
		_fine.cone(at * Transform3D(Basis(Vector3.BACK, -ex * 0.25), Vector3(ex * 0.034, 0.325, 0.065)), 0.022, 0.05, 4)
		_fine.sphere(at * Transform3D(Basis.from_scale(Vector3(0.8, 0.6, 1.4)), Vector3(ex * 0.03, 0.012, 0.1)), 0.022, 6, 4)
	var tail := PackedVector3Array()
	for p: Vector3 in [Vector3(0, 0.04, -0.12), Vector3(0.09, 0.02, -0.09), Vector3(0.11, 0.015, 0.02), Vector3(0.06, 0.015, 0.1)]:
		tail.append(at * p)
	_fine.sweep(tail, func(u: float) -> float: return lerpf(0.022, 0.014, u), 5, 10)
	# glossy dark eyes and a pink nose
	_fine.paint(IRON_PAINT, MeshKit.IRON, 0.0)
	for ex: float in [-1.0, 1.0]:
		_fine.ball(at * Vector3(ex * 0.023, 0.282, 0.118), 0.011, 5, 4)
	_fine.paint(Color("#d27a82"))
	_fine.ball(at * Vector3(0, 0.27, 0.147), 0.008, 4, 3)


# ------------------------------------------------------------------ parts

## What the part builders may add to (see PartModels.Kit).
func _part_kit() -> PartModels.Kit:
	if _kit == null:
		_kit = PartModels.Kit.new()
		_kit.shape = shape
		_kit.cls = cls
		_kit.livery = livery
		_kit.detail = detail
		_kit.core = _core
		_kit.small = _small
		_kit.fine = _fine
		_kit.ropes = _ropes
		_kit.cannon_ts = cls.cannon_ts()
		_kit.masts = _masts
	return _kit


## Hull plating and the sails' dressing on the masts (her guns and figure go
## on with the standard fittings they replace).
func _build_parts() -> void:
	if _parts.has("hull"):
		PartModels.build_hull(_part_kit(), _parts.hull)
	if _parts.has("sails"):
		PartModels.build_sails(_part_kit(), _parts.sails)
	_on_spar(0)


## The floating parts drift and turn; called every frame with the world's clock.
func tick(time: float) -> void:
	for sp in _spinners:
		var node: MeshInstance3D = sp.node
		# a crown goes over the side with its mast
		var g: int = sp.spar
		node.visible = g == 0 or not spars[g - 1].broken
		if not node.visible:
			continue
		var a: float = time * float(sp.spin) + float(sp.phase)
		var b0: Basis = sp.b0
		var p0: Vector3 = sp.p0
		node.transform = Transform3D(b0 * Basis(sp.axis, a), p0 + Vector3(0, sin(time * float(sp.rate) + float(sp.phase)) * float(sp.bob), 0))


# ------------------------------------------------------------------ out

## Smooth-shaded mesh from three.js-wound (counter-clockwise) triangles.
static func _uv_mesh(pos: PackedVector3Array, uv: PackedVector2Array, idx: PackedInt32Array) -> ArrayMesh:
	var nrm := PackedVector3Array()
	nrm.resize(pos.size())
	var flipped := PackedInt32Array()
	flipped.resize(idx.size())
	for t in range(0, idx.size(), 3):
		var a := idx[t]
		var b := idx[t + 1]
		var c := idx[t + 2]
		var n := (pos[b] - pos[a]).cross(pos[c] - pos[a])
		nrm[a] += n
		nrm[b] += n
		nrm[c] += n
		flipped[t] = a
		flipped[t + 1] = c
		flipped[t + 2] = b
	for i in nrm.size():
		nrm[i] = nrm[i].normalized()
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_NORMAL] = nrm
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_INDEX] = flipped
	return MeshKit.with_lods(arrays)


func _mesh_child(parent: Node3D, mesh: Mesh, mat: Material, shadow: bool) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


func _finish() -> void:
	_mesh_child(self, _hull_mesh, shared_material("hull"), true).name = "Hull"
	_mesh_child(self, _stern_mesh, shared_material("stern"), true).name = "Transom"
	_mesh_child(self, _deck_mesh, shared_material("deck"), false).name = "Deck"
	_mesh_child(self, _core.commit_lod(), shared_material("parts"), true).name = "Parts"
	if not _small.is_empty():
		_mesh_child(self, _small.commit_lod(), shared_material("parts"), false).name = "Small"
	if not _fine.is_empty():
		var fine := _mesh_child(self, _fine.commit_lod(), shared_material("parts"), false)
		fine.name = "Fine"
		fine.visibility_range_end = FINE_RANGE
		fine.visibility_range_end_margin = 8.0
	if not _ropes.is_empty():
		_mesh_child(self, _ropes.commit(), shared_material("rope"), false).name = "Rigging"
	if not lamps.is_empty() or not glows.is_empty():
		var halos := _mesh_child(self, _halo_mesh(), shared_material("halo"), false)
		halos.name = "Halos"
		halos.extra_cull_margin = HALO_MARGIN
	if _kit != null:
		for spec: Dictionary in _kit.spinners:
			var node := _mesh_child(self, (spec.kit as MeshKit).commit(), shared_material("parts"), false)
			node.name = "Spinner"
			node.transform = Transform3D(spec.basis, spec.pos)
			_spinners.append({
				"node": node, "p0": spec.pos, "b0": spec.basis, "axis": spec.axis, "spin": spec.spin,
				"bob": spec.bob, "rate": spec.rate, "phase": spec.phase, "spar": spec.spar,
			})
		_kit = null
	# everything above each break, as the one mesh that goes over the side
	for sp in spars:
		var kit := MeshKit.new()
		for k: MeshKit in [_core, _small, _fine]:
			k.copy_spar(sp.group, kit)
		sp.piece = kit.commit_lod()
	_core = null
	_small = null
	_fine = null
	_ropes = null


## The halos of the lanterns and the cabin windows: four vertices at each
## light, the card's corner in UV, the light's size and the seed of its
## flicker (the glass's own, at its heart: render/lamps.ts) in UV2, and in
## COLOR how bright it is (r) and whether it is a window shining out aft (g).
func _halo_mesh() -> ArrayMesh:
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var uv2 := PackedVector2Array()
	var col := PackedColorArray()
	var idx := PackedInt32Array()
	var lights: Array[Vector4] = []
	var kinds := PackedColorArray()
	# a haunted ship's lamps are her jack-o'-lanterns, and ghost-fire lights her cabin
	var lamp_kind := 0.5 if cls.haunt else 0.0
	for l in lamps:
		lights.append(l)
		kinds.append(Color(1.0, 0.0, lamp_kind))
	for w in windows:
		lights.append(Vector4(w.x, w.y, w.z, WINDOW_HALO))
		kinds.append(Color(WINDOW_GLOW, 1.0, 1.0 if cls.haunt else 0.0))
	for i in glows.size():
		lights.append(glows[i])
		kinds.append(Color(1.0, 0.0, glow_kinds[i]))
	for i in lights.size():
		var l := lights[i]
		var o := pos.size()
		var at := Vector3(l.x, l.y, l.z)
		for corner in CARD:
			pos.append(at)
			uv.append(corner)
			uv2.append(Vector2(l.w, at.dot(Vector3(0.83, 1.31, 0.57))))
			col.append(kinds[i])
		idx.append_array([o, o + 1, o + 2, o, o + 2, o + 3])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_TEX_UV2] = uv2
	arrays[Mesh.ARRAY_COLOR] = col
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


## Total triangles drawn at full detail (for the budget).
func triangles() -> int:
	var n := 0
	var stack: Array[Node] = [self]
	while not stack.is_empty():
		var nd: Node = stack.pop_back()
		if nd is MeshInstance3D and nd.mesh:
			for sfc in nd.mesh.get_surface_count():
				n += nd.mesh.surface_get_array_index_len(sfc) / 3
		stack.append_array(nd.get_children())
	return n


# ------------------------------------------------------------------ sailing

## The rig's sailing state: how much canvas is set (0..1), the yards' brace,
## which side is to lee (-1..1, sign = side), the wind's angle to the ship and
## how hard the sails draw (0..1).
func update_rig(sail_level: float, brace: float, lee_side: float, wind_rel: float, fill: float, wind: float = 1.0) -> void:
	var lift := fill * sail_level
	var deep := (-1.0 if lee_side < 0.0 else 1.0) * maxf(0.04, absf(lee_side))
	for sd in sails:
		var node: MeshInstance3D = sd.node
		var tier: int = sd.tier
		var sp: Spar = sd.spar
		# canvas that came down with its spar is left as it fell
		if sp.broken:
			continue
		node.scale.y = clampf(sail_level * 1.15 - tier * 0.12, 0.08, 1.0)
		node.visible = (sail_level > 0.02 or tier == 0) and not (sd.has("head") and (sd.head as Spar).broken)
		node.set_instance_shader_parameter("sail_depth", deep if sd.fore_aft else 1.0)
		if absf(lift - _last_fill) > 0.002:
			node.set_instance_shader_parameter("sail_fill", lift)
	_last_fill = lift
	for p in yard_pivots:
		p.rotation.y = brace
	for p in fore_aft_pivots:
		p.rotation.y = -lee_side * 0.35 * (0.4 + 0.6 * fill)
	flag_pivot.rotation.y = wind_rel
	ensign_pivot.rotation.y = wind_rel
	if absf(wind - _last_wind) > 0.01:
		_last_wind = wind
		for f in flags:
			f.set_instance_shader_parameter("flag_wind", wind)
