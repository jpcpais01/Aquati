// A stamp into the wake field, added on top of the step (see src/world/wake.gd).
// INSTANCE_CUSTOM: x strength, y kind (0 foam blob, 1 foam ring, 2 height, 3 velocity).
shader_type canvas_item;
render_mode blend_add, unshaded;

varying vec2 v_uv;
varying float v_strength;
varying float v_kind;

void vertex() {
	v_uv = UV * 2.0 - 1.0;
	v_strength = INSTANCE_CUSTOM.x;
	v_kind = INSTANCE_CUSTOM.y;
}

void fragment() {
	float d = length(v_uv);
	float blob = 1.0 - smoothstep(0.0, 1.0, d);
	blob *= blob;
	float ring = smoothstep(0.62, 0.85, d) * (1.0 - smoothstep(0.85, 1.0, d));
	float v = (v_kind > 0.5 && v_kind < 1.5 ? ring : blob) * v_strength;
	// foam adds to R; craters (signed) to the height in G, hull pressure to the velocity in B
	vec3 add = v_kind > 2.5 ? vec3(0.0, 0.0, v) : v_kind > 1.5 ? vec3(0.0, v, 0.0) : vec3(v, 0.0, 0.0);
	COLOR = vec4(add, 1.0);
}
