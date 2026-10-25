// The Kraken's skin, shared by its arms and its head (the web's
// fx/krakenModel.ts SKIN_GLSL): the palette, the photophores, and the
// derivative bump that raises its suckers, warts and creases out of a
// height field without a normal map.

// Mikkelsen's derivative bump, fed finite differences of the height field
// (view space: the fragment's VERTEX and NORMAL)
vec3 kr_perturb(vec3 surf_pos, vec3 surf_norm, vec2 dh, float face) {
	vec3 sx = dFdx(surf_pos);
	vec3 sy = dFdy(surf_pos);
	vec3 r1 = cross(sy, surf_norm);
	vec3 r2 = cross(surf_norm, sx);
	float det = dot(sx, r1) * face;
	vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
	return normalize(abs(det) * surf_norm - grad);
}

vec3 kr_palette(float back, float belly) {
	vec3 dorsal = vec3(0.17, 0.02, 0.034);
	vec3 flank = vec3(0.42, 0.07, 0.056);
	vec3 under = vec3(0.74, 0.42, 0.35);
	return mix(mix(dorsal, flank, 1.0 - back), under, belly);
}

// photophores: rows of little lamps that breathe slowly, brightest in the dark
vec3 kr_glow(float lamp, float phase) {
	float dark = 0.25 + night * 0.75 + weather.z * 0.45;
	float pulse = 0.55 + 0.45 * sin(TIME * 1.7 - phase);
	return vec3(0.18, 1.1, 1.0) * lamp * pulse * dark;
}

// thin flesh: the sun glows red through it, strongest toward the light
vec3 kr_through(vec3 col, vec3 n_view, mat4 view) {
	vec3 l = normalize((view * vec4(sun_dir, 0.0)).xyz);
	float back = clamp(0.35 - dot(n_view, l), 0.0, 1.0);
	return col * sun_color * back * vec3(0.16, 0.035, 0.025);
}
