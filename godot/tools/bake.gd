extends SceneTree
## CI bake step, run headless after the import: checks the baked figurehead
## data the ships load (godot/art/figures.*, made by tools/bake_figures.mjs
## from the web game's figureData) and that every figure in it can be built.
## The world (godot/world/) is baked offline by tools/world/bake_world.mjs,
## which runs the web game's own generator, and check.gd loads it whole.

func _initialize() -> void:
	var ok := true
	var cls := ShipClass.named("sloop")
	var shape := HullShape.new(cls)
	var head := Figurehead.bow_head(shape, cls)
	for fig: String in ["mermaid", "lion", "eagle", "kraken", "dragon", "seraph"]:
		var kits := {"wood": MeshKit.new(), "iron": MeshKit.new(), "trim": MeshKit.new(), "glow": MeshKit.new()}
		Figurehead.build_figure(fig, head, kits, Color("#f4c765"))
		var tris := 0
		for k: MeshKit in kits.values():
			tris += k.indices.size() / 3
		print("  figure %s: %d triangles" % [fig, tris])
		if tris < 1000:
			printerr("  FAIL figure %s came out empty" % fig)
			ok = false
	if ok:
		print("BAKE OK")
	quit(0 if ok else 1)
