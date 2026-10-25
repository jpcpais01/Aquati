// A ship crossed over into the spirit world (Haunt: the Hollow Jack's
// Phantom Run), shared by the ship_*_phantom.gdshader variants. She stays in
// the opaque pass and goes see-through by screen-door dither, so nothing
// needs sorting: her faces thin away to a mist, her edges hold on in a cold
// green rim, and the crossing itself (phantom rising 0 -> 1, or falling back)
// burns across her in a ragged front of ghost-fire.

/// 0 solid .. 1 a ghost
uniform float phantom = 0.0;
uniform vec3 phantom_tint = vec3(0.26, 1.0, 0.58);

const float PHANTOM_BAYER[16] = { 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 };

// `w` is the fragment in the world. Discards what the mist has taken.
void phantom_apply(vec2 frag, vec3 n, vec3 view, vec3 w, inout vec3 albedo, inout vec3 emis) {
	float fres = 1.0 - abs(dot(normalize(n), view));
	// a slow, rolling field over her: where the crossing reaches first
	float field = 0.5 + 0.28 * sin(w.x * 0.9 + w.y * 1.7 + TIME * 0.6) * sin(w.z * 0.8 - w.y * 1.1 - TIME * 0.45)
		+ 0.22 * (fract(sin(dot(floor(w * 1.6), vec3(12.9898, 78.233, 37.719))) * 43758.5453) - 0.5);
	float p = clamp(phantom, 0.0, 1.0);
	// how much of her a crossed-over ghost keeps: the rims, a breath of the faces
	float ghost = 0.22 + 0.62 * fres * fres + 0.08 * sin(TIME * 3.1 + w.y * 2.3);
	float gone = smoothstep(field - 0.06, field + 0.06, p * 1.12);
	float keep = mix(1.0, ghost, gone);
	int ix = int(mod(frag.x, 4.0));
	int iy = int(mod(frag.y, 4.0));
	if ((PHANTOM_BAYER[iy * 4 + ix] + 0.5) / 16.0 > keep) {
		discard;
	}
	// the burning front of the crossing
	float front = (1.0 - smoothstep(0.0, 0.07, abs(p * 1.12 - field))) * step(0.02, p) * step(p, 0.98);
	albedo = mix(albedo, albedo * 0.3 + phantom_tint * 0.06, gone);
	emis = mix(emis, emis * 0.6, gone)
		+ phantom_tint * (gone * (0.2 + fres * fres * 1.2) * (0.85 + 0.15 * sin(TIME * 7.0 + w.y * 3.0)) + front * 2.2);
}
