// The island planting (the flora_*.gdshader materials, src/world/flora.gd):
// palms, broadleaf trees, tree ferns, bananas, shrubs, the ground cover,
// rocks and the beach's litter, drawn as MultiMeshes square by square.
//
// Every mesh carries its colour per vertex (CUSTOM0, sRGB bytes) with the
// light baked in: sunny crowns, darker hollows, a hue per puff. Alpha 0 marks
// bark. Every plant carries its tint (INSTANCE_CUSTOM.rgb) and a random phase
// for the wind (INSTANCE_CUSTOM.a). A port of the plant side of the web
// game's render/environment.ts patchMaterial.
//
// Each material picks its parts before including this:
//   FLORA_SWAY k   it leans downwind and is shoved over as gusts roll by (k per metre up, squared)
//   FLORA_FOLIAGE  the sun glows through the leaves to their shaded side
//   FLORA_BARK n   wood up close: 1 broadleaf plates and fissures, 2 a palm's ringed stem
//   FLORA_LEAVES   leaf clusters and grain up close
//   FLORA_FADE d   ground cover shrinks away with distance (from d m, further the higher the camera)
//   FLORA_ROUGH r  roughness

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/common.gdshaderinc"
#include "res://shaders/inc/wind.gdshaderinc"

uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
/// Ground cover: the distance (m, per metre of the plant's scale) at which it
/// is too small to see, so it has shrunk away before its square is dropped
/// (one material per mesh, Flora.Kit.fading).
uniform float fade_px = 1e6;

varying vec3 v_col;
varying float v_bark;
// the plant's own frame before the wind moves it: bark and leaf detail stays put on the plant
varying vec3 v_obj;
varying vec3 v_obj_n;
varying vec3 v_world;

void vertex() {
	v_col = srgb_to_linear(CUSTOM0.rgb) * INSTANCE_CUSTOM.rgb;
	v_bark = 1.0 - step(0.5, CUSTOM0.a);
	v_obj = VERTEX;
	v_obj_n = NORMAL;
	vec3 base = MODEL_MATRIX[3].xyz;
#ifdef FLORA_SWAY
	{
		// Plants lean with the prevailing wind and get shoved over as gust
		// puffs roll across the island, then spring back once they've passed.
		float ph = INSTANCE_CUSTOM.a * 6.2832;
		float hgt = max(VERTEX.y, 0.0);
		float w = hgt * hgt * FLORA_SWAY;
		float g = gust_at(base.xz);
		// the wind in the plant's own frame (plants only turn and scale)
		vec2 ld = normalize((transpose(mat3(MODEL_MATRIX)) * vec3(wind.x, 0.0, wind.y)).xz + 1e-5);
		vec2 side = vec2(-ld.y, ld.x);
		float lean = wind.z * (0.35 + 0.12 * sin(TIME * 0.45 + ph)) + g * 2.4;
		// leaves shiver hardest inside a gust
		float shiver = sin(TIME * 9.0 + ph * 5.0 + VERTEX.x * 1.7 + VERTEX.z * 1.3) * (0.05 + g * 0.45);
		float sway = sin(TIME * 2.3 + ph * 3.0) * g * 0.35;
		VERTEX.xz += (ld * lean + side * (shiver * 0.6 + sway)) * w;
		VERTEX.y -= lean * lean * w * w * 0.5 / max(hgt, 1.0);
	}
#endif
#ifdef FLORA_FADE
	{
		// ground cover too small to read far off shrinks smoothly away (no
		// pop), further out the higher the camera flies, and by the time it is
		// under a few pixels across it is gone
		float far = FLORA_FADE + max(CAMERA_POSITION_WORLD.y, 0.0) * 0.8;
		far = min(far, fade_px * length(MODEL_MATRIX[0].xyz));
		VERTEX *= 1.0 - smoothstep(far * 0.72, far, distance(base, CAMERA_POSITION_WORLD));
	}
#endif
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 col = v_col;
	float bump_h = 0.0;
	// the plant's own frame's screen derivatives, taken once in uniform
	// control flow, so the samples inside branches keep their mip level
	vec3 o_dx = dFdx(v_obj);
	vec3 o_dy = dFdy(v_obj);
	float fp = length(abs(o_dx) + abs(o_dy));
	vec3 on = normalize(v_obj_n);
#ifdef FLORA_BARK
	if (v_bark > 0.5) {
		float w = 1.0 - smoothstep(0.03, 0.09, fp);
		if (w > 0.0) {
			float wx = on.x * on.x / (on.x * on.x + on.z * on.z + 1e-4);
#if FLORA_BARK == 1
			// plates split by long, wandering vertical fissures
			vec2 sc = vec2(2.2, 0.32);
			vec4 a = textureGrad(noise_tex, v_obj.xy * sc + vec2(0.13, 0.6), o_dx.xy * sc, o_dy.xy * sc);
			vec4 b = textureGrad(noise_tex, v_obj.zy * sc + vec2(0.57, 0.2), o_dx.zy * sc, o_dy.zy * sc);
			vec4 t = mix(a, b, wx);
			float fiss = 1.0 - smoothstep(0.0, 0.07, abs(t.g - 0.5) + (t.a - 0.5) * 0.04);
			float plate = smoothstep(0.3, 0.7, t.a);
			vec3 c = col * (0.86 + plate * 0.3) * (1.0 - fiss * 0.55);
			// moss creeps up the foot of the trunk, pale lichen higher on the plates
			float moss = smoothstep(0.45, 0.65, t.r + (1.0 - smoothstep(0.3, 2.2, v_obj.y)) * 0.35) * (1.0 - fiss);
			c = mix(c, c * vec3(0.75, 1.15, 0.6), moss * 0.5);
			c = mix(c, c * vec3(1.3, 1.3, 1.2), smoothstep(0.66, 0.74, t.b + plate * 0.1) * (1.0 - moss) * 0.3);
			col = mix(col, c, w);
			bump_h = (plate * 0.006 - fiss * 0.02) * w;
#else
			// a palm's stem: rings where old fronds fell, fibres running up between them
			vec2 sc = vec2(3.1, 0.4);
			vec4 a = textureGrad(noise_tex, v_obj.xy * sc + vec2(0.41, 0.3), o_dx.xy * sc, o_dy.xy * sc);
			vec4 b = textureGrad(noise_tex, v_obj.zy * sc + vec2(0.07, 0.77), o_dx.zy * sc, o_dy.zy * sc);
			vec4 t = mix(a, b, wx);
			float ring = fract(v_obj.y * 5.2 + (t.r - 0.5) * 0.5);
			float scar = smoothstep(0.0, 0.07, ring) * (1.0 - smoothstep(0.1, 0.24, ring));
			float fibre = (t.a - 0.5) * 2.0;
			vec3 c = col * (1.0 + fibre * 0.12) * (1.0 - scar * 0.38);
			c = mix(c, c * vec3(1.15, 1.1, 1.02), smoothstep(0.55, 0.75, t.g) * 0.5);
			col = mix(col, c, w);
			bump_h = (-scar * 0.012 + fibre * 0.0025) * w;
#endif
		}
	}
#endif
#ifdef FLORA_LEAVES
	if (v_bark < 0.5) {
		// clusters of leaves half a metre across (worley cells), the leaf grain within them
		float w = 1.0 - smoothstep(0.08, 0.3, fp);
		if (w > 0.0) {
			vec3 an = on * on;
			an *= an;
			an /= an.x + an.y + an.z;
			vec3 p = v_obj * 0.11;
			vec3 px = o_dx * 0.11;
			vec3 py = o_dy * 0.11;
			vec4 t = textureGrad(noise_tex, p.zy + vec2(0.31, 0.12), px.zy, py.zy) * an.x
					+ textureGrad(noise_tex, p.xz + vec2(0.71, 0.53), px.xz, py.xz) * an.y
					+ textureGrad(noise_tex, p.xy + vec2(0.05, 0.88), px.xy, py.xy) * an.z;
			// worley cells broken up by the fbm, so clusters are ragged, not round
			float cl = 1.0 - smoothstep(0.05, 0.78, t.b + (t.g - 0.5) * 0.55);
			float fine = 1.0 - smoothstep(0.012, 0.05, fp);
			// flowers stay bright: the contrast is for leaves
			float leafy = 0.45 + 0.55 * smoothstep(0.0, 0.04, col.g - max(col.r, col.b));
			vec3 c = col * mix(1.0, 0.72 + cl * 0.42 + (t.a - 0.5) * 0.3 * fine, leafy);
			// the cluster crowns catch the sun warm and yellow-green
			c = mix(c, c * vec3(1.1, 1.08, 0.8), cl * cl * 0.3 * leafy);
			col = mix(col, c, w);
			bump_h = (cl * 0.035 + (t.a - 0.5) * 0.018 * fine) * (1.0 - smoothstep(0.03, 0.12, fp));
		}
	}
#endif
	ALBEDO = col;
	ROUGHNESS = FLORA_ROUGH;
#if defined(FLORA_BARK) || defined(FLORA_LEAVES)
	vec3 n = bump(NORMAL, VERTEX, bump_h);
	NORMAL = n;
#else
	vec3 n = NORMAL;
#endif
#ifdef FLORA_FOLIAGE
	// leaves are thin: the sun glows through to their shaded side, warm and
	// yellow-green, so canopies read as soft lit volumes, never black blobs
	vec3 l = normalize((VIEW_MATRIX * vec4(sun_dir, 0.0)).xyz);
	float back = clamp(0.25 - dot(n, l), 0.0, 1.0);
	EMISSION = col * sun_color * back * vec3(0.05, 0.058, 0.026);
#endif
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
