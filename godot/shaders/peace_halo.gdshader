// Peaceful seas round the minimap (the web's .pc-halo): a soft band of light
// just outside the disc and a glow spilling past it, blue-white while nobody
// has cause to fight you, ember red once someone has (src/ui/minimap.gd).
shader_type canvas_item;

/// The quad drawn, and the halo's centre and radius in it, in HUD units.
uniform vec2 quad = vec2(200.0, 200.0);
uniform vec2 centre = vec2(100.0, 100.0);
uniform float radius = 95.0;
/// The light's colour, the band's and the glow's strength, the glow's reach.
uniform vec4 col : source_color = vec4(0.75, 0.91, 1.0, 1.0);
uniform float band = 0.46;
uniform float glow = 0.55;
uniform float reach = 30.0;
/// All of it at once (the breathing, the quarrel cooling, the fade in).
uniform float strength = 1.0;

void fragment() {
	float d = length(UV * quad - centre);
	float k = d / radius;
	// the radial gradient: clear to 70%, brightest at 84%, gone at the rim
	float ring = k < 0.84 ? smoothstep(0.7, 0.84, k) : 1.0 - smoothstep(0.84, 1.0, k);
	// the box-shadow: a blur round the halo's edge, mostly outside it
	float g = 1.0 - smoothstep(-reach * 0.3, reach, d - radius);
	g *= smoothstep(radius * 0.8, radius, d);
	COLOR = vec4(col.rgb, clamp(ring * band + g * g * glow, 0.0, 1.0) * strength);
}
