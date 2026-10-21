class_name BowWave
extends MeshInstance3D
## The curling sheet of white water at a ship's stem (shaders/bow_wave.gdshader):
## one small mesh laid along the waterline of both bows, following the hull's
## heading and pitch but not its roll.

const NS := 30
const NV := 9
## The sheet has died down by midships.
const T_END := 0.52
## How far the sheet peels back as it flares out.
const SWEEP := 0.42

static var _material: ShaderMaterial

var beam := 6.2
var _amp := 0.0
var _flow := 0.0
## The waterline per station: Vector2(z, half width), ship-local.
var _stations := PackedVector2Array()


func setup(shape: HullShape, cls: ShipClass) -> void:
	beam = cls.beam
	# where the stem meets the water: the forefoot rises clear of it near the very tip
	var t_stem := 1.0
	var t := 1.0
	while t > 0.8:
		if shape.bottom(t) < -0.02:
			t_stem = t
			break
		t -= 0.002
	var pos := PackedVector3Array()
	var nrm := PackedVector3Array()
	var uv := PackedVector2Array()
	var uv2 := PackedVector2Array()
	var idx := PackedInt32Array()
	for side: float in [1.0, -1.0]:
		var base := pos.size()
		for i in NS:
			var s := float(i) / (NS - 1)
			var ts := t_stem - (t_stem - T_END) * pow(s, 1.25)
			var zz := shape.z(ts)
			var hw := maxf(0.04, shape.half_width_at_y(ts, 0.0))
			if side > 0.0:
				_stations.append(Vector2(zz, hw))
			# outward along the waterline's normal, swept aft so the sheet peels back
			var t2 := minf(1.0, ts + 0.01)
			var dz := shape.z(t2) - zz
			var dw := maxf(0.04, shape.half_width_at_y(t2, 0.0)) - hw
			var d := Vector2(dz, -dw).normalized()
			d.y -= SWEEP
			d = d.normalized()
			for j in NV:
				pos.append(Vector3(side * (hw - 0.06), 0.0, zz))
				nrm.append(Vector3(side * d.x, 0.0, d.y))
				uv.append(Vector2(s, float(j) / (NV - 1)))
				uv2.append(Vector2(side, i * 0.37 + side * 3.1))
		for i in NS - 1:
			for j in NV - 1:
				var a := base + i * NV + j
				var b := a + NV
				idx.append_array([a, a + 1, b, a + 1, b + 1, b])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_NORMAL] = nrm
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_TEX_UV2] = uv2
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	m.custom_aabb = AABB(Vector3(-cls.beam - 4.0, -1.0, -cls.length * 0.2), Vector3(cls.beam * 2.0 + 8.0, 4.0, cls.length * 0.9))
	mesh = m
	if _material == null:
		_material = ShaderMaterial.new()
		_material.shader = preload("res://shaders/bow_wave.gdshader")
		_material.set_shader_parameter("foam_tex", preload("res://art/foam.png"))
	material_override = _material
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	top_level = true
	visible = false


## Rides the hull at the waterline; `amp` (0 .. ~1.2) scales the sheet with speed.
func follow(x: float, y: float, z: float, heading: float, pitch: float, amp: float, speed: float, dt: float) -> void:
	_amp += (amp - _amp) * minf(1.0, dt * 3.0)
	_flow += speed * dt
	visible = _amp > 0.02
	if not visible:
		return
	set_instance_shader_parameter("amp", _amp)
	set_instance_shader_parameter("flow", fmod(_flow, 4096.0))
	global_transform = Transform3D(Basis.from_euler(Vector3(pitch, heading, 0.0)), Vector3(x, y, z))


## Where the sheet lands on the water at station s (0 stem .. 1 aft) on a
## side, ship-local Vector2(x, z): foam is laid where it runs out.
func landing(s: float, side: float) -> Vector2:
	var i := mini(NS - 1, roundi(clampf(s, 0.0, 1.0) * (NS - 1)))
	var st := _stations[i]
	var reach := sheet_reach(s, _amp, beam)
	return Vector2(side * (st.y + reach * 0.92), st.x - reach * SWEEP * 0.92)


static func sheet_reach(s: float, a: float, b: float) -> float:
	return (0.25 + 1.9 * pow(maxf(s, 0.0), 0.8)) * (0.35 + 0.65 * minf(a, 1.2)) * sqrt(b / 6.2)
