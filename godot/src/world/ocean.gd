class_name Ocean
extends MeshInstance3D
## The sea surface: one lattice that follows the camera's focus. Its core is
## pinned to the world (the origin snaps by whole cells, so those vertices
## never swim), and beyond the core the grid is warped out to the horizon.
## The cell size grows with the camera distance, so a far view spends its
## vertices on a wider sea; the shader fades every swell train the local grid
## can't carry, so nothing aliases while it does.

const HALF := 64
const CORE := 44
const FAR := 5000.0
## The most lanterns the sea mirrors at once (the shader's array).
const MAX_LAMPS := 8

var waves: Waves
var wind: Wind
var wake: WakeField
var material: ShaderMaterial
var cell := 1.5
## The lattice's warp as the shader has it (see follow): x core half-extent
## (m), y warp coefficient, z cell size (m).
var grid_warp := Vector4(66.0, 0.18, 1.5, 0.0)
## Each maelstrom's own ring of sea (the web's Ocean.placeVortices): the
## lattice is too coarse for a funnel's walls, so inside its rim the sea is
## drawn on a polar mesh whose rings close in on the throat, with the same
## material (the "funnel" instance uniform switches it over).
var funnels: Array[MeshInstance3D] = []
var _funnel_mesh: ArrayMesh


func setup(p_waves: Waves, p_wind: Wind, p_wake: WakeField) -> void:
	waves = p_waves
	wind = p_wind
	wake = p_wake
	mesh = _build_mesh()
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	extra_cull_margin = 16384.0
	material = ShaderMaterial.new()
	material.shader = load("res://shaders/ocean.gdshader")
	material.set_shader_parameter("normal_tex", load("res://art/water_normal.png"))
	material.set_shader_parameter("noise_tex", load("res://art/noise.png"))
	material.set_shader_parameter("foam_tex", load("res://art/foam.png"))
	material.set_shader_parameter("caustic_tex", load("res://art/caustics.png"))
	material_override = material


func _build_mesh() -> ArrayMesh:
	var n := HALF * 2 + 1
	var verts := PackedVector3Array()
	verts.resize(n * n)
	var i := 0
	for z in n:
		for x in n:
			verts[i] = Vector3(x - HALF, 0.0, z - HALF)
			i += 1
	var idx := PackedInt32Array()
	idx.resize((n - 1) * (n - 1) * 6)
	var j := 0
	for z in n - 1:
		for x in n - 1:
			var a := z * n + x
			var b := a + 1
			var c := a + n
			var d := c + 1
			# alternate the diagonal so the triangulation has no grain
			if (x + z) & 1 == 0:
				idx[j] = a; idx[j + 1] = b; idx[j + 2] = d
				idx[j + 3] = a; idx[j + 4] = d; idx[j + 5] = c
			else:
				idx[j] = a; idx[j + 1] = b; idx[j + 2] = c
				idx[j + 3] = b; idx[j + 4] = d; idx[j + 5] = c
			j += 6
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return m


## A ring of sea for each maelstrom (Vortex), placed and sized by follow_vortices.
func place_vortices(vortices: Array) -> void:
	for f in funnels:
		f.queue_free()
	funnels.clear()
	if _funnel_mesh == null:
		_funnel_mesh = funnel_mesh()
	for v: Vortex in vortices:
		var mi := MeshInstance3D.new()
		mi.name = "Funnel"
		mi.top_level = true
		mi.mesh = _funnel_mesh
		mi.material_override = material
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.set_instance_shader_parameter("funnel", 1.0)
		mi.visible = false
		add_child(mi)
		funnels.append(mi)
	follow_vortices(vortices, Vector3.ZERO)


## Each ring over its maelstrom at its live radius; drawn only while it
## turns and lies within sight of `eye`.
func follow_vortices(vortices: Array, eye: Vector3) -> void:
	for i in mini(vortices.size(), funnels.size()):
		var v: Vortex = vortices[i]
		var f := funnels[i]
		f.visible = visible and v.k > 0.001 and Vector2(eye.x - v.x, eye.z - v.z).length() < v.r * Vortex.RIM + FAR * 0.6
		if f.visible:
			f.transform = Transform3D(Basis.from_scale(Vector3(v.r, 1.0, v.r)), Vector3(v.x, 0.0, v.z))


## The ring of sea in radii: a centre and NR rings out to Vortex.RIM, packed
## tight toward the throat (where the walls are steepest), NA spokes round.
static func funnel_mesh(nr := 56, na := 112) -> ArrayMesh:
	var verts := PackedVector3Array()
	verts.append(Vector3.ZERO)
	for i in range(1, nr + 1):
		var u := Vortex.RIM * pow(float(i) / nr, 1.7)
		for j in na:
			var a := TAU * j / na
			verts.append(Vector3(cos(a) * u, 0.0, sin(a) * u))
	# (wound as the lattice is: front faces up)
	var idx := PackedInt32Array()
	for j in na:
		idx.append_array([0, 1 + j, 1 + (j + 1) % na])
	for i in range(1, nr):
		var r0 := 1 + (i - 1) * na
		var r1 := 1 + i * na
		for j in na:
			var j1 := (j + 1) % na
			idx.append_array([r0 + j, r1 + j1, r0 + j1, r0 + j, r1 + j, r1 + j1])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	# (drawn down the throat, and lifted by the swell)
	m.custom_aabb = AABB(Vector3(-Vortex.RIM, -70.0, -Vortex.RIM), Vector3(Vortex.RIM * 2.0, 76.0, Vortex.RIM * 2.0))
	return m


## Points the shallows, the surf and the wave damping at an archipelago's own maps.
func set_region(r: Region) -> void:
	material.set_shader_parameter("seabed_tex", r.height_tex)
	material.set_shader_parameter("seabed_rect", r.height_rect())
	material.set_shader_parameter("has_seabed", 1.0)
	material.set_shader_parameter("ground_tex", r.ground_tex)
	material.set_shader_parameter("isle_tex", r.isle_tex)
	material.set_shader_parameter("shore_tex", r.shore_tex)
	material.set_shader_parameter("shore_rect", r.shore_rect())
	material.set_shader_parameter("region", Vector4(r.centre.x, r.centre.z, r.biome, 0.0))


## Where the sea-spark blooms lie: out past every archipelago's centre (SeaGlow).
func set_glow_centres(centres: PackedVector2Array) -> void:
	var a := centres[0]
	var b := centres[1] if centres.size() > 1 else a
	material.set_shader_parameter("glow_centres", Vector4(a.x, a.y, b.x, b.y))


## The lanterns the sea mirrors after dark: xyz where (m), w how bright; the
## first MAX_LAMPS of them.
func set_lamps(lamps: Array[Vector4]) -> void:
	var n := mini(lamps.size(), MAX_LAMPS)
	material.set_shader_parameter("lamp_count", n)
	if n > 0:
		var a := lamps.slice(0, n)
		a.resize(MAX_LAMPS)
		for i in range(n, MAX_LAMPS):
			a[i] = Vector4.ZERO
		material.set_shader_parameter("lamps", a)


## Centres the sea on the camera's focus; `cam_dist` sizes its cells.
func follow(focus: Vector3, cam_dist: float) -> void:
	cell = clampf(cam_dist / 52.0, 1.25, 7.0)
	var ox := roundf(focus.x / cell) * cell
	var oz := roundf(focus.z / cell) * cell
	transform = Transform3D(Basis.from_scale(Vector3(cell, 1.0, cell)), Vector3(ox, 0.0, oz))
	var c := CORE * cell
	var e := (HALF - CORE) * cell
	var a := (FAR - c - e) / (e * e * e)
	grid_warp = Vector4(c, a, cell, 0.0)
	material.set_shader_parameter("grid_warp", grid_warp)
	material.set_shader_parameter("wave_a", waves.packed_a)
	material.set_shader_parameter("wave_b", waves.packed_b)
	material.set_shader_parameter("gusts", wind.packed)
	# the wake canvases take turns: read the one stepped last, through the
	# very patch of sea it was stepped over
	material.set_shader_parameter("wake_tex", wake.texture())
	material.set_shader_parameter("wake_rect", wake.rect())
