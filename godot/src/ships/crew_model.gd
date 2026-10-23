class_name CrewModel
extends RefCounted
## The one sailor every crew on the sea is drawn with: the web game's sculpt
## (src/ships/crewModel.ts), baked by tools/crew/bake_crew.mjs into four cuts.
## The near one (fingers, lashes, laces) for the few within a few metres of
## the camera, a far one, and two the simplifier cut from it: the distant one
## and the speck, a figure a few dozen pixels tall (and on a phone at sea that
## is nearly everyone). Each cut is a body plus a mesh per hat, held prop and
## bigger extra only some sailors have, so a sailor costs the triangles of
## what he wears; the speck is one mesh, its kit dropped in the shader.
##
## Every vertex rides one or two of 18 bones (CUSTOM0: bone, palette slot,
## kit group, second bone + weight) and carries its baked occlusion, a part id
## for painted seams and face morphs, and how much it flutters in the breeze
## (CUSTOM1). shaders/crew.gdshader bends it into each sailor's pose.
##
## Rest frame: feet at y = 0, facing +z, the sailor's left hand on +x.

## Palette slots per sailor (one texel each).
const SLOTS := 30
## Joint angles and expressions per sailor, and the floats a sailor's row of
## the pose texture holds: those, then (palette row, hat, prop, kit flags).
const POSE_SIZE := 24
const ROW_FLOATS := 32
const STYLE_ROW := 24
const STYLE_HAT := 25
const STYLE_PROP := 26
const STYLE_FLAGS := 27

# palette slots
const TINT_SKIN := 0
const TINT_SHIRT := 1
const TINT_SLEEVE := 2
const TINT_FOREARM := 3
const TINT_TROUSERS := 4
const TINT_SHIN := 5
const TINT_BOOTS := 6
const TINT_SASH := 7
const TINT_HAT := 8
const TINT_HAIR := 9
const TINT_COAT := 10
const TINT_TRIM := 11
const TINT_WOOD := 12
const TINT_METAL := 13
const TINT_GLOW := 14
const TINT_CLOTH := 15
const TINT_STRIPE := 16
const TINT_DARK := 17
const TINT_WHITE := 18
const TINT_PUPIL := 19
const TINT_PARROT := 20
const TINT_WING := 21
const TINT_BEAK := 22
const TINT_VEST := 23
const TINT_PLUME := 24
const TINT_LEATHER := 25
const TINT_MOUTH := 26
const TINT_TONGUE := 27
const TINT_SHINE := 28
const TINT_GHOST := 29

const HAT_NONE := 0
const HAT_TRICORN := 1
const HAT_BANDANA := 2
const HAT_KNIT := 3
const HAT_STRAW := 4

const PROP_NONE := 0
const PROP_RAMMER := 50
const PROP_SPYGLASS := 51
const PROP_MOP := 52
const PROP_BUCKET := 53
const PROP_CUTLASS := 54
const PROP_LINSTOCK := 55
const PROP_FIDDLE := 56
const PROP_MUG := 57
const PROP_PIPE := 58
const PROP_SPADE := 59

# kit flags
const F_BEARD := 1 << 0
const F_COAT := 1 << 1
const F_PONYTAIL := 1 << 2
const F_PATCH := 1 << 3
const F_EARRING := 1 << 4
const F_VEST := 1 << 5
const F_PEG := 1 << 6
const F_PARROT := 1 << 7
const F_BOOTS := 1 << 8
const F_PISTOL := 1 << 9
const F_PLUME := 1 << 10
const F_MOUSTACHE := 1 << 11
const F_BALD := 1 << 12
const F_BELT := 1 << 13
const F_LONGHAIR := 1 << 14
const F_KERCHIEF := 1 << 15
const F_ROLLED := 1 << 16
const F_CUFFS := 1 << 17
const F_GARTERS := 1 << 18
const F_BAREFOOT := 1 << 19

# pose channels (six vec4 in the shader)
const P_SPINE_X := 0
const P_SPINE_Y := 1
const P_SPINE_Z := 2
const P_HEAD_X := 3
const P_HEAD_Y := 4
const P_ARM_LX := 5
const P_ARM_LZ := 6
const P_ELBOW_L := 7
const P_ARM_RX := 8
const P_ARM_RZ := 9
const P_ELBOW_R := 10
const P_LEG_LX := 11
const P_KNEE_L := 12
const P_LEG_RX := 13
const P_KNEE_R := 14
const P_ROOT_Y := 15
const P_HEAD_Z := 16
const P_HAND_L := 17
const P_HAND_R := 18
const P_JAW := 19
const P_BROW := 20
const P_GAZE_X := 21
const P_GAZE_Y := 22
const P_SMILE := 23

const NEAR := 0
const FAR := 1
const DISTANT := 2
const SPECK := 3

## Where a pose can reach past the rest figure: an arm raised to cheer, a
## sailor crouched, sat or leaping over the side.
const POSED_AABB := AABB(Vector3(-1.5, -1.6, -1.6), Vector3(3.0, 4.5, 3.2))


## One cut of the sculpt: its meshes, and which sailors each one is for.
class Level:
	var name := ""
	var meshes: Array[ArrayMesh] = []
	## The kit groups each mesh draws (the body's first, for everyone).
	var groups: Array[PackedInt32Array] = []
	var triangles := PackedInt32Array()
	## The mesh a hat or held prop has to itself (-1: the body carries it).
	var hat_mesh := PackedInt32Array()
	var prop_mesh := PackedInt32Array()

	## The meshes of extras (coats, beards, peg legs...) a sailor with these
	## kit flags wears, besides the body, his hat and what's in his hand.
	func extras(flags: int) -> PackedInt32Array:
		var out := PackedInt32Array()
		for i in range(1, meshes.size()):
			var gs := groups[i]
			if gs.is_empty() or gs[0] < 10 or gs[0] >= 50 and gs[0] < 1000:
				continue
			for g in gs:
				if CrewModel.shown(g, HAT_NONE, PROP_NONE, flags):
					out.append(i)
					break
		return out


static var _levels: Array[Level] = []


## The four cuts, read from art/ the first time they're asked for.
static func levels() -> Array[Level]:
	if _levels.is_empty():
		_load()
	return _levels


static func _load() -> void:
	var meta: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://art/crew.json"))
	var blob := FileAccess.get_file_as_bytes("res://art/crew.bin")
	if not meta is Dictionary or blob.is_empty():
		push_warning("crew: could not read art/crew.json or art/crew.bin")
		return
	var flags := (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) | (Mesh.ARRAY_CUSTOM_RGBA8_UNORM << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT)
	for l: Dictionary in meta.levels:
		var lv := Level.new()
		lv.name = l.name
		lv.hat_mesh.resize(10)
		lv.hat_mesh.fill(-1)
		lv.prop_mesh.resize(64)
		lv.prop_mesh.fill(-1)
		for b: Dictionary in l.batches:
			var n := int(b.verts)
			var arrays := []
			arrays.resize(Mesh.ARRAY_MAX)
			arrays[Mesh.ARRAY_VERTEX] = blob.slice(int(b.pos), int(b.pos) + n * 12).to_vector3_array()
			arrays[Mesh.ARRAY_NORMAL] = blob.slice(int(b.nrm), int(b.nrm) + n * 12).to_vector3_array()
			arrays[Mesh.ARRAY_CUSTOM0] = blob.slice(int(b.rig), int(b.rig) + n * 16).to_float32_array()
			arrays[Mesh.ARRAY_CUSTOM1] = blob.slice(int(b.info), int(b.info) + n * 4)
			arrays[Mesh.ARRAY_INDEX] = blob.slice(int(b.idx), int(b.idx) + int(b.indices) * 4).to_int32_array()
			var mesh := ArrayMesh.new()
			mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, flags)
			mesh.custom_aabb = POSED_AABB
			var i := lv.meshes.size()
			lv.meshes.append(mesh)
			lv.triangles.append(int(b.indices) / 3)
			var key := int(b.key)
			var gs := PackedInt32Array()
			for g: float in b.groups:
				gs.append(int(g))
			lv.groups.append(gs)
			if key > 0 and key < 10:
				lv.hat_mesh[key] = i
			elif key >= 50 and key < 64:
				lv.prop_mesh[key] = i
		_levels.append(lv)


## Whether kit group g shows on a sailor with this hat, prop and kit flags
## (the shader's crew_shown). Groups: 0 everyone, 1-9 a hat, 10-29 shown by a
## flag, 30-49 hidden by one, 50+ a held prop, 1000 + a*32 + b shown when
## neither flag a nor b is set, 3000 + a*32 + b when a is and b isn't.
static func shown(g: int, hat: int, prop: int, flags: int) -> bool:
	if g == 0:
		return true
	if g < 10:
		return g == hat
	if g >= 3000:
		var a := (g - 3000) / 32
		var b := g - 3000 - a * 32
		return flags & (1 << a) != 0 and flags & (1 << b) == 0
	if g >= 1000:
		var a := (g - 1000) / 32
		var b := g - 1000 - a * 32
		return flags & ((1 << a) | (1 << b)) == 0
	if g >= 50:
		return g == prop
	if g < 30:
		return flags & (1 << (g - 10)) != 0
	return flags & (1 << (g - 30)) == 0
