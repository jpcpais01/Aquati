// A ghost ship (Livery "ghost"), shared by the ship_*_ghost.gdshader
// variants: the web's ghostGlsl.ts. Her wounds draw as any ship's (she
// takes these at spawn, her own materials from the start); only her look
// changes. She stays in the opaque pass and goes see-through by screen-door
// dither, as a Phantom Run does (ship_phantom.gdshaderinc):
//  - the timber drains to a cold, ashen sea-green, half see-through
//  - her edges glow, a fresnel rim of spectral green, brightest by day
//    against the glitter (and with a flare where she's struck)
//  - rot: ragged holes drift slowly across planks and canvas, their edges
//    burning green; her canvas is mostly holes
//  - ectoplasm: faint bands of light crawl up her hull
//  - presence sweeps the rot over the whole ship, so she materialises out of
//    the mist from the trucks down, and dissolves the same way when laid to rest

/// presence (0 mist .. 1 there), flare (struck, 0..1), seed
uniform vec4 ghost = vec4(1.0, 0.0, 0.0, 0.0);
uniform sampler2D ghost_noise : repeat_enable, filter_linear_mipmap;

const vec3 GHOST_GREEN = vec3(0.3, 1.0, 0.66);
const float GHOST_BAYER[16] = { 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 };

// `w` is the fragment in the world, `model` the mesh's frame; `thr` how much
// of her the rot takes (canvas more) and `keep` how much of her shows (canvas less).
void ghost_apply(vec2 frag, vec3 n, vec3 view, vec3 w, mat4 model, float thr, float keep, inout vec3 albedo, inout vec3 emis) {
	// in her own frame, so the rot rides with her
	vec3 gp = (w - model[3].xyz) * mat3(model);
	float t = TIME;
	vec2 sd = vec2(ghost.z * 0.37, ghost.z * 0.61);
	// rot, read on all three planes so every surface (planks, deck, canvas) gets it
	float nz = (texture(ghost_noise, gp.zy * 0.085 + sd + vec2(t * 0.011, -t * 0.017)).g
		+ texture(ghost_noise, gp.xy * 0.11 + sd.yx - vec2(t * 0.013, t * 0.009)).g
		+ texture(ghost_noise, gp.xz * 0.095 + sd + vec2(-t * 0.008, t * 0.012)).a) / 3.0;
	nz += (texture(ghost_noise, gp.zy * 0.41 + gp.x * 0.07 + sd).g - 0.5) * 0.14;
	// materialising and dissolving: the rot floods her, from the trucks down
	float pres = clamp(ghost.x, 0.0, 1.0);
	thr += (1.0 - pres) * (0.75 + clamp(gp.y * 0.012, 0.0, 0.35));
	if (nz < thr) {
		discard;
	}
	float edge = 1.0 - smoothstep(thr, thr + 0.045, nz);
	float rim = 1.0 - abs(dot(normalize(n), view));
	float r3 = rim * rim * rim;
	// by day it takes more of her own light to read green against the bright sea
	float day = 1.0 - night;
	float flare = ghost.y;
	// opaque at the silhouette and the burning edges, see-through across the faces
	float a = clamp(0.28 + day * 0.24 + r3 * 0.7 + edge * 0.6 + flare * 0.3, 0.0, 1.0) * smoothstep(0.0, 0.35, pres) * keep;
	int ix = int(mod(frag.x, 4.0));
	int iy = int(mod(frag.y, 4.0));
	if ((GHOST_BAYER[iy * 4 + ix] + 0.5) / 16.0 > a) {
		discard;
	}
	// the timber drained of life: ashen sea-green, the grain still faintly there
	float lum = dot(albedo, vec3(0.3, 0.55, 0.15));
	albedo = vec3(lum) * vec3(0.3, 0.7, 0.52) * 0.62 + vec3(0.004, 0.02, 0.012);
	// ectoplasm crawling up the planking in slow bands
	float band = sin(gp.y * 1.3 - t * 1.4 + nz * 9.0 + gp.z * 0.08);
	vec3 glow = GHOST_GREEN * (edge * 2.6 + smoothstep(0.8, 1.0, band) * 0.14);
	emis += (glow + GHOST_GREEN * (0.015 + day * 0.1 + r3 * (0.72 + day * 0.4) + flare * 0.8)) * clamp(pres * 1.4, 0.0, 1.0);
}
