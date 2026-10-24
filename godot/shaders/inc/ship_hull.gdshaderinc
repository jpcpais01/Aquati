// The body of ship_hull.gdshader and ship_hull_dmg.gdshader (with DAMAGE
// defined: the breaches, scorch and break line of ship_damage.gdshaderinc),
// and of their SKIN variants (ship_hull_skin*.gdshader, your own ship's,
// which can wear a Treasure Vault skin over her painted strakes).

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"
#define LIT_CLEARCOAT
#include "res://shaders/inc/lit.gdshaderinc"

uniform vec3 c_hull : source_color = vec3(0.48, 0.29, 0.16);
uniform vec3 c_bottom : source_color = vec3(0.7, 0.23, 0.17);
uniform vec3 c_boot : source_color = vec3(0.96, 0.94, 0.88);
uniform vec3 c_strake : source_color = vec3(0.12, 0.54, 0.54);
uniform vec3 c_wale : source_color = vec3(0.13, 0.09, 0.06);
uniform vec3 c_trim : source_color = vec3(0.89, 0.71, 0.32);
uniform float length_m = 15.0;
/// gunports: u, v, half width (u), half height (v)
uniform vec4 ports[8];
uniform int port_count = 0;

varying vec3 v_world;
#ifdef DAMAGE
#include "res://shaders/inc/ship_damage.gdshaderinc"
varying vec3 v_obj;
#endif
#ifdef SKIN
#include "res://shaders/inc/ship_skin.gdshaderinc"
// where on her (m) and which way her side faces, in her own frame
varying vec3 v_skin_p;
varying vec3 v_skin_n;
#endif

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
#ifdef DAMAGE
	v_obj = VERTEX;
#endif
#ifdef SKIN
	v_skin_p = VERTEX;
	v_skin_n = NORMAL;
#endif
}

float band(float v, float a, float b) {
	float fw = max(fwidth(v), 1e-4) * 0.75;
	return smoothstep(a - fw, a + fw, v) * (1.0 - smoothstep(b - fw, b + fw, v));
}

void fragment() {
	float u = UV.x;
	float v = UV.y;
	float s = u * length_m;
	// ---- planking: 26 rows, each laid in planks of four to seven metres
	float rv = v * 26.0;
	float row = floor(rv);
	float plen = 4.0 + hash11(row + 3.1) * 3.0;
	float ps = (s + hash11(row) * 9.0) / plen;
	float pid = floor(ps);
	vec3 col = c_hull * (0.86 + hash21(vec2(row, pid)) * 0.24);
	// grain streaks along each plank
	float grain = sin((s * 3.1 + hash11(row * 7.0 + pid) * 40.0) + sin(s * 0.7 + row) * 2.0) * 0.5 + 0.5;
	col *= 1.0 - 0.07 * smoothstep(0.75, 1.0, grain) * (fract(rv * 3.0 + hash11(pid) * 3.0) < 0.33 ? 1.0 : 0.0);
	float seam = grid_line(rv, 0.06);
	float butt = grid_line(ps, 0.012 / plen * 4.0) * (1.0 - seam);

	// ---- the painted bands (the seams still show through the paint)
	col = mix(col, c_bottom, band(v, -1.0, 0.285) * 0.93);
	col = mix(col, c_boot, band(v, 0.285, 0.315));
	col = mix(col, c_wale, band(v, 0.66, 0.705));
	col = mix(col, c_strake, band(v, 0.705, 0.935) * 0.94);
	col = mix(col, c_trim, band(v, 0.935, 0.955));
	col = mix(col, c_wale * 1.3, band(v, 0.955, 1.01));
	// gold pinstripe above the wale, a hairline of shadow under it
	col = mix(col, c_trim, band(v, 0.708, 0.716));
	col = mix(col, c_wale * 0.6, band(v, 0.7, 0.705) * 0.6);
	col *= 1.0 - seam * 0.22 - butt * 0.3;
	// the bottom's faint sheathing plates
	col *= 1.0 - grid_line(s / 0.32, 0.03) * 0.12 * band(v, -1.0, 0.285);
	// soft grime near the waterline
	col *= 1.0 - 0.25 * (1.0 - smoothstep(0.3, 0.42, v)) * step(0.3, v) * 0.6;

	// ---- gunports: a gilded frame, a dark recess and a lit sill
	float metal = 0.0;
	float relief = -seam * 0.6 - butt * 0.4;
	// clear of every port and its frame (a skin keeps off them)
	float clear = 1.0;
	for (int i = 0; i < 8; i++) {
		if (i >= port_count) {
			break;
		}
		vec4 pt = ports[i];
		vec2 d = abs(vec2(u, v) - pt.xy);
		vec2 fr = vec2(3.0 / 1024.0, 3.0 / 512.0);
		vec2 pad = d - pt.zw - fr * 2.0;
		clear = min(clear, step(0.0, max(pad.x, pad.y)));
		if (d.x < pt.z + fr.x && d.y < pt.w + fr.y) {
			if (d.x < pt.z && d.y < pt.w) {
				col = vec3(0.006, 0.004, 0.003);
				relief = -1.0;
			} else {
				col = c_trim * 0.85;
				metal = 0.6;
				relief = 0.6;
				if (v < pt.y - pt.w) {
					col = c_trim * 1.15;
				}
			}
		} else if (d.x < 3.0 / 1024.0 && v < pt.y - pt.w && v > pt.y - pt.w - 0.12) {
			// a faint weathered streak under each port
			col *= 1.0 - 0.22 * (1.0 - (pt.y - pt.w - v) / 0.12);
		}
	}

	float rough = mix(0.48, 0.32, metal);
#ifdef SKIN
	if (skin_id > 0) {
		// her painted strakes take it: the bottom, the boot-top, the wale and
		// the ports keep her own paint (the web's relief-map mask)
		float mask = max(band(v, 0.318, 0.655), band(v, 0.716, 0.93)) * clear;
		vec3 sn = normalize(v_skin_n);
		vec2 sp = abs(sn.x) >= abs(sn.z) ? v_skin_p.zy : v_skin_p.xy;
		vec3 se = vec3(0.0);
		float sm = 0.0;
		float sr = 0.5;
		vec3 sc = aq_skin(sp, abs(dot(normalize(NORMAL), VIEW)), TIME, 0.0, se, sm, sr);
		col = mix(col, sc, mask);
		metal = mix(metal, sm, mask);
		rough = mix(rough, sr, mask);
		// glowing skins come alive after dark
		EMISSION = skin_light(se * mask * (0.55 + night * 0.9), 1.25);
	}
#endif
#ifdef DAMAGE
	bool drop;
	EMISSION += hull_damage(v_obj, FRONT_FACING, true, col, rough, metal, drop);
	if (drop) {
		discard;
	}
#endif
	ALBEDO = col * wet_dim();
	ROUGHNESS = rough * wet_gloss();
	METALLIC = metal;
	// the varnish is gone where she's scorched or splintered
	CLEARCOAT = 0.55 * (1.0 - metal) * (1.0 - smoothstep(0.5, 1.0, rough));
	CLEARCOAT_ROUGHNESS = 0.28;
	lit_coat = vec2(CLEARCOAT, CLEARCOAT_ROUGHNESS);
	lit_geo = normalize(NORMAL);
	// the seams and port frames stand in relief (a bump from screen-space
	// derivatives: no tangents needed, and it fades with the seams far off)
	NORMAL = bump(NORMAL, VERTEX, relief * 0.012);
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
