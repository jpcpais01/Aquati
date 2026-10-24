## Every shader under res://shaders drawn once on a real renderer, so its
## compile errors show (headless runs never compile shaders). Under lavapipe:
## VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json xvfb-run -a godot
## --rendering-method mobile --script res://tools/shader_probe.gd
## and look for SHADER ERROR; PROBE DONE when it has drawn them all.
extends SceneTree
var frames := 0

func _initialize() -> void:
	var cam := Camera3D.new()
	cam.position = Vector3(0, 0, 6)
	root.add_child(cam)
	var files: Array[String] = []
	_walk("res://shaders", files)
	var i := 0
	for f in files:
		var code := FileAccess.get_file_as_string(f)
		var sh: Shader = load(f)
		var m := ShaderMaterial.new()
		m.shader = sh
		if code.contains("shader_type spatial"):
			var mi := MeshInstance3D.new()
			var q := QuadMesh.new()
			q.size = Vector2(0.4, 0.4)
			mi.mesh = q
			mi.material_override = m
			mi.position = Vector3((i % 10) * 0.5 - 2.5, (i / 10) * 0.5 - 1.5, 0)
			mi.extra_cull_margin = 16384.0
			root.add_child(mi)
		elif code.contains("shader_type canvas_item"):
			var r := ColorRect.new()
			r.material = m
			r.size = Vector2(32, 32)
			r.position = Vector2((i % 20) * 34, 600 + (i / 20) * 34)
			root.add_child(r)
		i += 1
	print("PROBE: %d shader files" % files.size())

func _walk(dir: String, out: Array[String]) -> void:
	for f in DirAccess.get_files_at(dir):
		if f.ends_with(".gdshader"):
			out.append(dir + "/" + f)
	for d in DirAccess.get_directories_at(dir):
		_walk(dir + "/" + d, out)

func _process(_d: float) -> bool:
	frames += 1
	if frames == 4:
		print("PROBE DONE")
	return frames >= 4
