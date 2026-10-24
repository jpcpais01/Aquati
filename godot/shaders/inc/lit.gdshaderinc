// The light on everything lit (ships, crews, the ground, plants, salvage):
// the engine's own lighting written out term for term (Lambert diffuse,
// Schlick-GGX specular, and a clearcoat or a backlight where a surface has
// one; see the engine's scene_forward_lights_inc.glsl), so that the sun can be
// dimmed where a cloud's shadow passes over (cloud_shadow, atmos.gdshaderinc).
// The engine's own light() has no hook for that.
//
// Before including it a shader may define:
//   LIT_SPECULAR      the material's SPECULAR, if not the default 0.5 (a
//                     number, or a varying set in fragment() where it varies)
//   LIT_CLEARCOAT     a varnish: set lit_coat (CLEARCOAT, CLEARCOAT_ROUGHNESS)
//                     and lit_geo (normalize(NORMAL) before any bump) in fragment()
//   LIT_BACKLIGHT     light through thin cloth (reads BACKLIGHT); cloth takes
//                     no sun shadow
// and it sets lit_cloud = cloud_shadow(world xz) in vertex(). Rain-soaked
// surfaces go darker and glossier: wet_dim() and wet_gloss() in fragment().

#ifndef LIT_INC
#define LIT_INC

#ifndef LIT_SPECULAR
#define LIT_SPECULAR 0.5
#endif

// the surface as built, before any bump: what the sun's grazing is judged by
#ifdef LIT_CLEARCOAT
#define LIT_GEO lit_geo
#else
#define LIT_GEO NORMAL
#endif

/// how much of the sun gets through the clouds overhead (1 clear .. ~0.5)
varying float lit_cloud;
#ifdef LIT_CLEARCOAT
varying vec2 lit_coat;
varying vec3 lit_geo;
#endif

float lit_schlick(float u) {
	float m = 1.0 - u;
	float m2 = m * m;
	return m2 * m2 * m;
}

// A highlight's ceiling. Far brighter than the screen can show, but phones
// hand light() its sums in half floats, which overflow past 65504: the
// varnish's needle-sharp glint (roughness 0.001) runs past that and would come
// back infinite, a speck of white or black on the hull.
const float LIT_PEAK = 256.0;

// (left unclamped, as the engine does: a sharp highlight runs far over 1)
float lit_ggx(float noh, float a) {
	float b = noh * a;
	float k = a / (1.0 - noh * noh + b * b);
	return k * k * (1.0 / PI);
}

// rain-soaked surfaces darken, and turn glossy
float wet_dim() {
	return 1.0 - sky_fx.x * 0.26;
}

float wet_gloss() {
	return 1.0 - sky_fx.x * 0.58;
}

void light() {
	// the sun (or the moon) through the clouds; lamps and fires as they are
#ifdef LIT_BACKLIGHT
	// thin cloth takes no sun shadow (render_mode shadows_disabled as well):
	// bellying and fluttering, it would only shadow itself in flickering blocks
	float att = LIGHT_IS_DIRECTIONAL ? lit_cloud : ATTENUATION;
#else
	float att = ATTENUATION * (LIGHT_IS_DIRECTIONAL ? lit_cloud : 1.0);
	if (LIGHT_IS_DIRECTIONAL) {
		// where the sun only grazes a surface, its shadow map can't tell
		// whether the surface is in its own shadow and flickers between the
		// two in blocks a texel wide (a hull side turned from the sun): fade
		// the sun out over the last few degrees before it turns away
		att *= smoothstep(0.0, 0.12, dot(LIT_GEO, LIGHT));
	}
#endif
	float cndl = clamp(dot(NORMAL, LIGHT), 0.0, 1.0);
	float cndv = max(dot(NORMAL, VIEW), 1e-4);
	vec3 H = normalize(VIEW + LIGHT);
	float cldh = clamp(dot(LIGHT, H), 0.0, 1.0);
	float ldh5 = lit_schlick(cldh);
	float coat_att = 1.0;
	// by night the key light is the moon, lifted for the eye like the rest of
	// the night: its glint off gilt, brass and wet paint would burn white blots
	float glint = LIGHT_IS_DIRECTIONAL ? 1.0 - 0.88 * night : 1.0;
#ifdef LIT_CLEARCOAT
	{
		// the varnish ignores the bump: it lies smooth over the seams
		float cc_ndl = clamp(dot(lit_geo, LIGHT), 0.0, 1.0);
		float cc_ndh = clamp(dot(lit_geo, H), 0.0, 1.0);
		float dr = lit_ggx(cc_ndh, mix(0.001, 0.1, lit_coat.y));
		float gr = 0.25 / (cldh * cldh + 1e-4);
		float fr = mix(0.04, 1.0, ldh5) * lit_coat.x;
		coat_att = 1.0 - fr;
		SPECULAR_LIGHT += min(dr * gr * fr * cc_ndl * LIGHT_COLOR * att * SPECULAR_AMOUNT, vec3(LIT_PEAK));
	}
#endif
	if (METALLIC < 1.0) {
		float brdf = cndl * (1.0 / PI);
		DIFFUSE_LIGHT += LIGHT_COLOR * brdf * att * coat_att;
#ifdef LIT_BACKLIGHT
		DIFFUSE_LIGHT += LIGHT_COLOR * (vec3(1.0 / PI) - brdf) * BACKLIGHT * att;
#endif
	}
	if (ROUGHNESS > 0.0) {
		float cndh = clamp(dot(NORMAL, H), 0.0, 1.0);
		float a = ROUGHNESS * ROUGHNESS;
		float d = lit_ggx(cndh, a);
		float g = 0.5 / max(mix(2.0 * cndl * cndv, cndl + cndv, a), 1e-6);
		vec3 f0 = mix(vec3(0.16 * LIT_SPECULAR * LIT_SPECULAR), ALBEDO, METALLIC);
#ifdef LIT_CLEARCOAT
		// under the varnish the surface meets it, not the air
		f0 = mix(f0, clamp(f0 * (f0 * (0.941892 - 0.263008 * f0) + 0.346479) - 0.0285998, 0.0, 1.0), lit_coat.x);
#endif
		float f90 = clamp(dot(f0, vec3(50.0 * 0.33)), METALLIC, 1.0);
		vec3 F = f0 + (f90 - f0) * ldh5;
		SPECULAR_LIGHT += min(cndl * d * F * g * LIGHT_COLOR * att * coat_att * glint * SPECULAR_AMOUNT, vec3(LIT_PEAK));
	}
}

#endif
