// The open sea.
//
// Vertex: a world-pinned lattice that follows the camera (uniform core, warped
// out to the horizon) displaced by the same eight Gerstner trains the CPU uses
// for buoyancy, plus the wake field's height. Trains fade where the grid or the
// distance can no longer carry them, so nothing ever aliases into crawling
// ripples.
//
// Fragment: the water's own body colour (Beer-Lambert absorption and
// in-scattering over whatever lies beneath), ripples from four unrelated
// normal layers modulated by slow macro noise, wind slicks and gust cat's
// paws, wake normals, crest glow where the sun shines through thin water,
// foam that breaks up into lace, and the seabed seen through the shallows.
//
// The floor is drawn here, not by the ground: the ground shader's own
// colours (bed_color), wet, lit by the sky and by the sun through the water
// with its caustics, so the beach runs on under the waterline unbroken. Over
// the shallows the swell dies down (as the keel feels it, World.water_damp),
// and the surf rolls in (see ground.gdshaderinc): each breaker lifts the
// water, stands up, glows turquoise through its face and spills into
// whitewater that thins to lace, in step with the swash the ground draws up
// the sand. The swell trips over the open-sea reefs too.
//
// The light is the web game's own: the sky's reflection is drawn from the
// same sky_color() the sky uses, and only the parts that a shadow should dim
// (the sunlit share of the body, the sunlit foam and the glitter) go through
// light(), so ship and island shadows fall on the water and nowhere else.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, world_vertex_coords, ambient_light_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/sea_common.gdshaderinc"
#include "res://shaders/inc/ground.gdshaderinc"
#include "res://shaders/inc/wind.gdshaderinc"

global uniform vec4 wake_rect;
/// x breaker height (m), y swash run-up (m), z storm, w the surf clock (s)
global uniform vec4 surf;

uniform vec4 wave_a[8];
uniform vec4 wave_b[8];
/// x core half-extent (m), y warp coefficient, z cell size (m), w unused
uniform vec4 grid_warp = vec4(66.0, 0.18, 1.5, 0.0);

uniform sampler2D wake_tex : filter_linear, repeat_disable;
uniform sampler2D normal_tex : repeat_enable, filter_linear_mipmap_anisotropic;
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
uniform sampler2D foam_tex : repeat_enable, filter_linear_mipmap;
uniform sampler2D caustic_tex : repeat_enable, filter_linear_mipmap;

/// The archipelago's floor (Region.height_tex): r its height (m, negative
/// under water), g the open-sea coral.
uniform sampler2D seabed_tex : repeat_disable, filter_linear;
/// x0, z0, size, 1/size of the seabed map
uniform vec4 seabed_rect = vec4(-1000.0, -1000.0, 2000.0, 0.0005);
uniform float has_seabed = 0.0;
/// The ground's own maps (Region), for the floor's colour and slope.
uniform sampler2D ground_tex : filter_linear_mipmap, repeat_disable;
uniform sampler2D isle_tex : filter_linear, repeat_disable;
/// The surf field: travel time to the shore, the seaward direction, the exposure.
uniform sampler2D shore_tex : filter_linear, repeat_disable;
uniform vec4 shore_rect = vec4(-1024.0, -1024.0, 2048.0, 0.00048828125);
/// xy the archipelago's centre (m), z its biome
uniform vec4 region = vec4(0.0);

varying vec3 v_world;
varying vec3 v_normal;
varying float v_crest;
varying float v_dist;
// the undisplaced lattice point, and how much of the four shortest trains
// the grid couldn't carry here (their crests are put back per pixel)
varying vec2 v_lat;
varying vec4 v_lost;
// handed from fragment() to light()
varying float v_glint;
varying float v_spec;
varying float v_gust;
varying vec3 v_swell_n;
varying vec3 v_body_lit;
varying vec3 v_foam_lit;
varying vec3 v_bed_lit;

// The web game draws no ground deeper than 15.5 m: out past the shelf the
// sea looks down onto its endless seabed instead, a plain sand plane at
// 18.2 m (Las Brumas' a hand's breadth lower, Terrain.build), and that much
// more water deepens the blue.
const float FLOOR_PLANE_FROM = -15.5;

float seen_floor(float h) {
	return mix(h, -18.2 - 0.35 * region.z, 1.0 - smoothstep(FLOOR_PLANE_FROM - 0.2, FLOOR_PLANE_FROM + 0.2, h));
}

float warp1(float s) {
	float a = abs(s);
	float c = grid_warp.x;
	if (a <= c) {
		return s;
	}
	float e = a - c;
	return sign(s) * (c + e + grid_warp.y * e * e * e);
}

float dwarp1(float s) {
	float e = max(abs(s) - grid_warp.x, 0.0);
	return 1.0 + 3.0 * grid_warp.y * e * e;
}

vec3 gerstner(vec2 p, float lod_dist, vec2 span, float damp, out vec3 nrm, out float crest, out vec4 lost) {
	vec3 o = vec3(0.0);
	vec3 n = vec3(0.0, 1.0, 0.0);
	float c = 0.0;
	lost = vec4(0.0);
	for (int i = 0; i < 8; i++) {
		vec4 a = wave_a[i];
		vec4 b = wave_b[i];
		float lambda = 6.28319 / a.z;
		// fades with distance, and where the grid spaces its vertices under
		// about four to a wavelength (it would alias into racing ripples)
		float A = a.w * damp * (1.0 - smoothstep(14.0, 28.0, lod_dist / lambda));
		float sp = length(span * a.xy);
		float carry = smoothstep(2.8, 4.0, lambda / max(sp, 1e-3));
		if (i >= 4) {
			lost[i - 4] = A * (1.0 - carry);
		}
		A *= carry;
		float th = a.z * dot(a.xy, p) + b.z;
		float s = sin(th);
		float co = cos(th);
		float qa = b.y * A;
		o.x += qa * a.x * co;
		o.z += qa * a.y * co;
		o.y += A * s;
		float wa = a.z * A;
		n.x -= a.x * wa * co;
		n.z -= a.y * wa * co;
		n.y -= b.y * wa * s;
		c += b.y * wa * s;
	}
	nrm = n;
	crest = c;
	return o;
}

void vertex() {
	vec2 origin = MODEL_MATRIX[3].xz;
	vec2 s = VERTEX.xz - origin;
	vec2 wp = origin + vec2(warp1(s.x), warp1(s.y));
	vec2 span = vec2(dwarp1(s.x), dwarp1(s.y)) * grid_warp.z;
	float dist = length(vec3(wp.x, 0.0, wp.y) - CAMERA_POSITION_WORLD);
	vec3 n;
	float crest;
	vec4 lost;
	// the swell dies down over the shallows (the keel feels the same, World.water_damp)
	float th = has_seabed > 0.5 ? textureLod(seabed_tex, (wp - seabed_rect.xy) * seabed_rect.w, 0.0).r : -200.0;
	float damp = clamp(-th / 8.0, 0.12, 1.0);
	// the swell fades by how far out across the sea it lies, not by the
	// camera's height: looking straight down, the sea below keeps its chop
	vec3 o = gerstner(wp, length(wp - CAMERA_POSITION_WORLD.xz), span, damp, n, crest, lost);
	vec3 world = vec3(wp.x, 0.0, wp.y) + o;
	// the wake field's own swell (bow and stern waves, splash rings)
	vec2 wuv = (world.xz - wake_rect.xy) * wake_rect.w + 0.5;
	if (wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0 && wuv.y < 1.0) {
		vec2 edge = min(wuv, 1.0 - wuv);
		float k = smoothstep(0.0, 0.05, min(edge.x, edge.y)) * (1.0 - smoothstep(1.6, 3.0, max(span.x, span.y)));
		world.y += textureLod(wake_tex, wuv, 0.0).g * k;
	}
	// surf: breakers lift the water as they roll in over the shallows (the
	// sharp face and the foam come per pixel). Where the grid is stretched
	// and gliding its vertices would hop over the face, so the lift fades.
	vec4 sf = textureLod(shore_tex, (wp - shore_rect.xy) * shore_rect.w, 0.0);
	float reach = mix(0.22, 1.0, sf.a) * (1.0 - smoothstep(12.0, 17.0, sf.r));
	if (reach * (1.0 - smoothstep(4.5, 8.0, -th)) > 0.001) {
		float psi = surf_phase(wp, sf.r, surf.w, noise_tex);
		float sth = fract(psi);
		vec3 sw = surf_wave(wp, floor(psi) + step(0.7, sth), max(-th, 0.0), reach, surf.x, noise_tex);
		world.y += sw.x * (surf_shape(sth, 0.3) - 0.37) * (1.0 - smoothstep(2.8, 5.0, max(span.x, span.y)));
	}
	VERTEX = world;
	NORMAL = normalize(n);
	v_world = world;
	v_normal = n;
	v_crest = crest;
	v_dist = dist;
	v_lat = wp;
	v_lost = lost;
}

// The crests of the short trains a coarse grid had to flatten, put back per
// pixel: they still whiten and glow where they would have broken.
float lost_crest() {
	float c = 0.0;
	for (int i = 0; i < 4; i++) {
		float A = v_lost[i];
		if (A > 1e-5) {
			vec4 a = wave_a[i + 4];
			vec4 b = wave_b[i + 4];
			c += b.y * a.z * A * sin(a.z * dot(a.xy, v_lat) + b.z);
		}
	}
	return c;
}

void fragment() {
	vec3 wpos = v_world;
	vec2 p = wpos.xz;
	vec3 V = normalize(CAMERA_POSITION_WORLD - wpos);
	vec3 L = normalize(sun_dir);
	float storm = weather.z;
	float rain = weather.y;
	float cover = weather.x;
	float detail = 1.0 - smoothstep(140.0, 520.0, v_dist);
	float crest = v_crest + lost_crest();

	// ---- macro fields: very slow, very large noise that drifts the look of
	// the sea from place to place so no two stretches read alike
	vec2 wd = wind.xy;
	vec2 wperp = vec2(-wd.y, wd.x);
	vec2 drift = wind_drift;
	vec2 pdrift = vec2(-drift.y, drift.x);
	vec4 mac = texture(noise_tex, p * 0.0021 + vec2(0.13, 0.71) + drift * 0.0004);
	vec4 mac2 = texture(noise_tex, p * 0.0053 + vec2(0.52, 0.27) - pdrift * 0.0007);

	// ---- ripples: four layers at unrelated scales and rotations, each fading
	// in and out under the macro noise, so the tiles never line up
	mat2 r1m = mat2(vec2(0.825, 0.565), vec2(-0.565, 0.825));
	mat2 r2m = mat2(vec2(-0.416, 0.909), vec2(-0.909, -0.416));
	mat2 r3m = mat2(vec2(0.276, -0.961), vec2(0.961, 0.276));
	vec2 r1 = texture(normal_tex, (r1m * p) * 0.031 + drift * 0.021).xy * 2.0 - 1.0;
	vec2 r2 = texture(normal_tex, (r2m * p) * 0.067 + pdrift * 0.017 + 0.37).xy * 2.0 - 1.0;
	vec2 r3 = texture(normal_tex, (r3m * p) * 0.149 - drift * 0.038 + 0.61).xy * 2.0 - 1.0;
	r1 = r1 * r1m;
	r2 = r2 * r2m;
	r3 = r3 * r3m;
	vec2 rip = r1 * (0.45 + 0.75 * mac.r) + r2 * (0.4 + 0.6 * mac2.g) + r3 * (0.25 + 0.4 * (1.0 - mac.g)) * detail;
	if (detail > 0.0) {
		vec2 r4 = texture(normal_tex, p * 0.331 + pdrift * 0.061 + 0.19).xy * 2.0 - 1.0;
		rip += r4 * 0.22 * detail;
	}
	rip *= (0.6 + 0.4 * detail) * (1.0 + storm * 0.9);

	// ---- wind slicks: long glassy streaks along the wind where the surface
	// film calms the ripples; read mostly in the sun glitter
	vec2 sl = vec2(dot(p, wd) * 0.0042, dot(p, wperp) * 0.034) + vec2(TIME * 0.0021, 0.0);
	float slick_n = texture(noise_tex, sl).g * 0.75 + mac2.a * 0.35;
	float slick = smoothstep(0.6, 0.78, slick_n) * 0.7;
	float calm = 1.0 - slick;

	// ---- cat's paws: gust puffs ruffle the surface into darker, matte,
	// finely sparkling patches, frayed into fingers by two noise scales
	float gust = gust_at(p);
	vec2 gust_rip = vec2(0.0);
	if (gust > 0.002) {
		vec4 gn = texture(noise_tex, p * 0.017 - drift * 0.21);
		vec4 gn2 = texture(noise_tex, p * 0.053 - drift * 0.33 + 0.41);
		gust *= smoothstep(0.32, 0.78, gn.g * 0.65 + gn2.a * 0.35 + gust * 0.3 - 0.08);
		if (detail > 0.0) {
			vec2 rg = texture(normal_tex, (r2m * p) * 0.21 - drift * 0.09 + 0.23).xy * 2.0 - 1.0;
			gust_rip = (rg * 0.8 + (gn2.xy - 0.5) * 1.4) * gust * detail;
		}
		calm = mix(calm, 1.0, gust);
	}

	vec3 Ns = normalize(v_normal);
	vec3 N = normalize(Ns + vec3(rip.x, 0.0, rip.y) * 0.36 * calm);

	// ---- ship wakes: the field's height gives normals to every V-arm and
	// ring, domain-warped by drifting noise so the arms wander and fray
	float wake_h = 0.0;
	float wake_f = 0.0;
	float wake_chop = 0.0;
	vec4 wn = vec4(0.5);
	vec4 wn2 = vec4(0.5);
	vec2 wuv0 = (p - wake_rect.xy) * wake_rect.w + 0.5;
	vec2 wb0 = min(wuv0, 1.0 - wuv0);
	if (min(wb0.x, wb0.y) > 0.0) {
		wn = texture(noise_tex, p * 0.031 + vec2(TIME * 0.013, -TIME * 0.009));
		wn2 = texture(noise_tex, p * 0.11 - vec2(TIME * 0.021, TIME * 0.017) + 0.37);
		vec2 warp = (wn.ga - 0.5) * 3.2 + (wn2.ga - 0.5) * 1.1;
		vec2 wuv = (p + warp - wake_rect.xy) * wake_rect.w + 0.5;
		vec4 wk = texture(wake_tex, wuv);
		float tx = 1.0 / 512.0;
		vec2 grad = vec2(
			texture(wake_tex, wuv + vec2(tx, 0.0)).g - texture(wake_tex, wuv - vec2(tx, 0.0)).g,
			texture(wake_tex, wuv + vec2(0.0, tx)).g - texture(wake_tex, wuv - vec2(0.0, tx)).g
		) / (2.0 * tx * wake_rect.z);
		vec2 wb = min(wuv, 1.0 - wuv);
		float win = smoothstep(0.0, 0.04, min(wb.x, wb.y));
		grad *= win * (0.45 + 0.9 * smoothstep(0.25, 0.75, wn.r * 0.7 + wn2.g * 0.45));
		wake_h = wk.g * win;
		wake_f = clamp(wk.r * win, 0.0, 2.5);
		wake_chop = clamp(length(grad) * 5.0 + wk.r * win * 0.6, 0.0, 1.4);
		vec2 wrip = (texture(normal_tex, p * 0.29 - vec2(TIME * 0.07, -TIME * 0.05) + 0.61).xy * 2.0 - 1.0) + (wn2.rb - 0.5) * 1.2;
		N = normalize(N - vec3(grad.x, 0.0, grad.y) * 1.9 + vec3(wrip.x, 0.0, wrip.y) * 0.22 * wake_chop);
	}
	// ---- surf: the breaker under this pixel and the one rolling in behind it
	// (read per pixel, not handed down from the vertices: away from the ship
	// the grid glides with her, and a breaker's phase or the depth under it,
	// blended between moving vertices, would crawl and jump)
	float fp = length(fwidth(p));
	// the floor right under this pixel: its height and its coral
	vec2 floor0 = has_seabed > 0.5 ? texture(seabed_tex, (p - seabed_rect.xy) * seabed_rect.w).rg : vec2(-200.0, 0.0);
	float s_depth = max(-floor0.r, 0.0);
	vec4 s_field = texture(shore_tex, (p - shore_rect.xy) * shore_rect.w);
	float s_reach = mix(0.22, 1.0, s_field.a) * (1.0 - smoothstep(12.0, 17.0, s_field.r));
	float s_psi = surf_phase(p, s_field.r, surf.w, noise_tex);
	float sth = fract(s_psi);
	float s_age = sth * SURF_T; // seconds since the last crest went by
	float swf = 0.16;
	vec3 s_prev = vec3(0.0);
	vec3 s_next = vec3(0.0);
	if (s_reach * (1.0 - smoothstep(4.5, 8.0, s_depth)) > 0.001) {
		float sn = floor(s_psi);
		s_prev = surf_wave(p, sn, s_depth, s_reach, surf.x, noise_tex);
		s_next = surf_wave(p, sn + 1.0, s_depth, s_reach, surf.x, noise_tex);
		vec3 s_cur = sth > 1.0 - swf ? s_next : s_prev;
		// the phase climbs 1 / (c T) per metre out to sea, c = sqrt(g d)
		vec2 sdir = s_field.gb / max(length(s_field.gb), 0.2);
		float sg = s_cur.x * surf_slope(sth, swf) / (sqrt(9.81 * max(s_depth, 0.15)) * SURF_T);
		// a broken face is a rumpled tumble of water, not a clean slope
		sg *= 1.0 - s_cur.y * 0.45;
		vec2 s_grad = sdir * clamp(sg, -0.8, 0.8);
		N = normalize(N - vec3(s_grad.x, 0.0, s_grad.y) * 1.6);
	}

	vec3 Ng = normalize(N + vec3(gust_rip.x, 0.0, gust_rip.y) * 0.5);
	float NdV = max(dot(N, V), 0.0);

	// ---- what lies beneath: the floor through the water, or the deep
	float depth = 200.0;
	// the floor lit by the sky (emitted), and by the sun (left to light(),
	// which shadows it)
	vec3 bed_sky = vec3(0.0);
	vec3 bed_sun = vec3(0.0);
	vec3 cam_fwd = -INV_VIEW_MATRIX[2].xyz;
	if (has_seabed > 0.5) {
		// the floor straight on down the view ray, nudged about by the
		// ripples as the web game does it: its refraction shifts where it
		// reads the picture behind the water by up to 4.5% of the frame
		// (fading far off), so the coral and the seagrass swim and wobble
		float d0 = max(wpos.y - seen_floor(floor0.r), 0.0);
		float thick0 = d0 / max(V.y, 0.05) * max(dot(-V, cam_fwd), 0.05);
		vec2 nudge = N.xz * 0.045 * clamp(thick0 * 0.25, 0.0, 1.0) * (1.0 - smoothstep(200.0, 500.0, v_dist));
		// (a nudge across the frame, in metres on the floor below)
		float reach = v_dist + d0 / max(V.y, 0.05);
		vec3 right = INV_VIEW_MATRIX[0].xyz;
		vec2 ahead = normalize(INV_VIEW_MATRIX[1].xz + vec2(1e-5));
		vec2 hit = p - V.xz * (d0 / max(V.y, 0.05))
				+ right.xz * (nudge.x * 2.0 * reach / PROJECTION_MATRIX[0][0])
				+ ahead * (nudge.y * 2.0 * reach / PROJECTION_MATRIX[1][1] / max(V.y, 0.2));
		float hg = texture(seabed_tex, (hit - seabed_rect.xy) * seabed_rect.w).r;
		float h1 = seen_floor(hg);
		// (out past the shelf: the plain sand plane, never wet-darkened)
		float plane = 1.0 - smoothstep(FLOOR_PLANE_FROM - 0.2, FLOOR_PLANE_FROM + 0.2, hg);
		depth = max(wpos.y - h1, 0.0);
		float bd = max(-h1, 0.0);
		// the ground's own floor, wet; past 14 m only its plain deep silt
		// shows through that much water, so the deep sea skips the work
		vec3 alb = T_SAND_DEEP;
		vec3 bn = vec3(0.0, 1.0, 0.0);
		float caustic = 0.0;
		float b_relief = 0.0;
		float near_t = 1.0 - smoothstep(10.0, 14.0, bd);
		if (near_t > 0.0) {
			vec2 at = hit - region.xy;
			vec4 gm = texture(ground_tex, (at + 1025.0) / 2050.0);
			vec4 ki = texture(isle_tex, (at + 1028.0) / 2056.0);
			vec4 nW, nM, nS, nD, nF;
			ground_noise(hit, noise_tex, nW, nM, nS, nD, nF);
			float reef_here = texture(seabed_tex, (hit - seabed_rect.xy) * seabed_rect.w).g;
			vec3 near_alb = bed_color(sand_color(region.z, nS, nF), h1, hit, ki.y, ki.z, reef_here, fp, noise_tex, nM, nS, nD, nF, b_relief);
			alb = mix(alb, near_alb, near_t);
			b_relief *= near_t;
			vec2 nxz = (gm.rg * 2.0 - 1.0) * near_t;
			bn = vec3(nxz.x, sqrt(max(1.0 - dot(nxz, nxz), 0.0)), nxz.y);
			caustic = caustics_at(hit, bd, L, TIME, caustic_tex);
		}
		// the coral heads and the seagrass stand up off the floor, lit on the
		// sun's side: Mikkelsen's derivative bump, as the web shades its
		// ground (unnormalised, so the relief is in metres; read where the
		// floor was seen, so the bump wobbles with it)
		vec3 sx = dFdx(vec3(hit.x, h1, hit.y));
		vec3 sy = dFdy(vec3(hit.x, h1, hit.y));
		vec3 r1 = cross(sy, bn);
		vec3 r2 = cross(bn, sx);
		float det = dot(sx, r1);
		bn = normalize(abs(det) * bn - sign(det) * (dFdx(b_relief) * r1 + dFdy(b_relief) * r2));
		alb *= mix(0.62, 1.0, plane);
		// sunlight thins and turns blue-green on its way down; the swell
		// focuses it into a dancing web
		float ndl = max(dot(bn, L), 0.0);
		bed_sun = alb * sun_color * ndl * (0.318 + 0.9 * caustic) * exp(-bd * vec3(0.16, 0.05, 0.035));
		bed_sky = alb * (sky_zenith * 0.45 + sky_horizon * 0.55) * 0.72;
	}

	// ---- Beer-Lambert absorption + in-scattering: the "volume", over the
	// water's thickness along the view as the web measures it (the depth
	// buffer's linear z behind the surface less the surface's own)
	float path = depth / max(V.y, 0.05) * max(dot(-V, cam_fwd), 0.05);
	vec3 absorb = vec3(0.42, 0.098, 0.066);
	vec3 T = exp(-absorb * path);
	vec3 scatter_deep = mix(vec3(0.004, 0.058, 0.16), vec3(0.007, 0.086, 0.19), smoothstep(0.3, 0.7, mac.r * 0.7 + mac2.g * 0.4));
	vec3 scatter_shallow = vec3(0.035, 0.34, 0.37);
	// a storm churns the sea into deep bottle-green slate; rain dulls it grey-teal
	scatter_deep = mix(scatter_deep, vec3(0.006, 0.036, 0.042), storm * 0.8);
	scatter_shallow = mix(scatter_shallow, vec3(0.04, 0.17, 0.16), storm * 0.6);
	scatter_deep = mix(scatter_deep, vec3(0.01, 0.05, 0.075), rain * (1.0 - storm) * 0.45);
	scatter_shallow = mix(scatter_shallow, vec3(0.05, 0.22, 0.24), rain * (1.0 - storm) * 0.35);
	vec3 scatter = mix(scatter_shallow, scatter_deep, smoothstep(0.0, 13.0, path));
	// light travels further through the upper layer at oblique angles
	scatter *= 1.0 + (1.0 - NdV) * 0.4;
	// the body is split by what lights it: the seabed (already lit) and the
	// in-scattered sunlight, which the hour tints and a shadow dims
	vec3 body_bed = bed_sky * T;
	vec3 body_bed_sun = bed_sun * T;
	vec3 body_sun = scatter * (1.0 - T) * 1.35;

	// wave relief: troughs sink a touch darker; a big sea under a grey sky
	// falls into shadow in its troughs; faces turned to the sun read brighter
	float hgt = clamp(wpos.y * 0.6 + 0.5, 0.0, 1.0);
	float relief = (0.88 + 0.2 * hgt) * mix(1.0, 0.72 + 0.5 * hgt, storm);
	relief *= 1.0 + clamp(dot(Ns.xz, normalize(L.xz + 1e-4)) * 1.1, -0.18, 0.18);
	body_bed *= relief;
	body_bed_sun *= relief;
	body_sun *= relief;
	// crests catch a faint aquamarine glow where the sun shines through the thin water
	float sss_view = pow(max(dot(V, -L + vec3(0.0, 0.6, 0.0)), 0.0), 2.0);
	float sss = hgt * hgt * (0.3 + sss_view) * (0.35 + 0.65 * mac2.r);
	body_sun += vec3(0.02, 0.19, 0.22) * sss * 0.11 * (1.0 - T);
	body_sun += vec3(0.02, 0.2, 0.16) * smoothstep(0.15, 0.75, crest) * storm * (0.45 + sss_view) * 0.3;
	// wake crests glow translucent turquoise, troughs sink a touch deeper
	body_sun += vec3(0.04, 0.36, 0.34) * clamp(wake_h * 1.6, -0.25, 1.0) * (0.45 + sss_view) * 0.5;
	// ruffled water under a gust scatters less light back up: darker, matte
	body_bed *= 1.0 - gust * 0.18;
	body_bed_sun *= 1.0 - gust * 0.18;
	// a breaker standing up in the shallows: its thin face glows turquoise
	// where the light shines through, the moment before the lip spills
	float s_glass = s_next.z * (1.0 - s_next.y * 0.7) * smoothstep(1.0 - swf - 0.12, 1.0, sth);
	body_sun += vec3(0.05, 0.42, 0.38) * s_glass * (0.5 + sss_view) * 0.55;
	// churned water behind a breaker is full of bubbles: milky aquamarine
	float s_aer = s_prev.y * exp(-s_age * 0.4) * 0.3;
	body_bed *= 1.0 - s_aer;
	body_bed_sun *= 1.0 - s_aer;
	body_sun = mix(body_sun, vec3(0.3, 0.56, 0.52), s_aer);
	body_sun *= 1.0 - gust * 0.18;
	// under a grey sky the sea loses its blue and turns pewter
	float pewter = cover * cover * 0.4;
	body_bed = mix(body_bed, vec3(dot(body_bed, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.85, 1.0, 1.05), pewter);
	body_bed_sun = mix(body_bed_sun, vec3(dot(body_bed_sun, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.85, 1.0, 1.05), pewter);
	body_sun = mix(body_sun, vec3(dot(body_sun, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.85, 1.0, 1.05), pewter);
	vec3 sun_in = (0.6 + 0.4 * max(L.y, 0.0)) * light_tint;

	// ---- reflection: the same sky the dome draws
	vec3 R = reflect(-V, N);
	R.y = abs(R.y);
	// far off, the sub-pixel facets of the chop tilt toward the viewer and
	// mirror a little higher, bluer sky than the glassy maths alone would,
	// so the sea darkens toward the horizon instead of turning milky
	R = normalize(R + vec3(0.0, 0.07 * smoothstep(30.0, 500.0, v_dist), 0.0));
	vec3 refl = sky_color(R) * (1.0 - gust * 0.22) * (1.0 - rain * 0.18);
	float F = 0.02 + 0.98 * pow(max(1.0 - NdV, 0.0), 5.0);
	F = min(F * 1.1, 1.0);

	// ---- foam: wake foam through the bubble web (a churned sheet that opens
	// into holes and thins to threads, never soft puffs), and whitecaps
	float fv = foam_field(p, TIME, foam_tex);
	float bubbles = foam_cut(fv, 0.62, fp);
	vec4 nz = texture(noise_tex, p * 0.06 + vec2(TIME * 0.01, -TIME * 0.013));
	vec4 nz2 = texture(noise_tex, p * 0.15 - vec2(TIME * 0.017, TIME * 0.009));
	float wcover = clamp(wake_f * (0.5 + 0.32 * wn2.r) + (wn.b - 0.5) * 0.12 * smoothstep(0.02, 0.3, wake_f), 0.0, 0.98);
	float wake_foam = foam_cut(fv, wcover, fp) * smoothstep(0.01, 0.06, wake_f);
	wake_foam *= 0.7 + 0.3 * smoothstep(0.0, 0.6, wake_f);
	// whitecaps break only here and there, and more often where a gust blows
	float breaking = smoothstep(0.54 - storm * 0.16, 0.8 - storm * 0.1, texture(noise_tex, p * 0.0093 - drift * 0.017).g + gust * 0.35);
	float crest_foam = smoothstep(0.5 - storm * 0.1, 0.95, crest + nz2.g * 0.35) * breaking * (0.6 + storm * 0.15);
	float cap_break = smoothstep(0.25, 0.8, nz.g * 0.7 + nz2.a * 0.5);
	// whitewater: a dense bore right behind each broken crest that leaves a
	// sheet of foam behind it, opening into lace as the bubbles pop
	float surf_cover = s_prev.y * (exp(-s_age * 1.4) + 0.4 * exp(-s_age * 0.42));
	// the spilling lip on the face of a breaking wave
	surf_cover = max(surf_cover, s_next.y * smoothstep(1.0 - swf * 0.85, 1.0, sth));
	// stray rafts of old foam drifting about the surf zone between sets
	float s_zone = max(s_prev.y, s_next.y * 0.7);
	surf_cover = max(surf_cover, s_zone * 0.26 * smoothstep(0.35, 0.75, nz.g * 0.7 + nz2.a * 0.45));
	// a thin lacy rim where the water meets the sand or the rock (beaches
	// shelve so gently that a few centimetres span metres of sand)
	float rim = 1.0 - smoothstep(0.0, 0.07 + 0.08 * s_zone, max(wpos.y - floor0.r, 0.0));
	surf_cover = max(surf_cover, rim * 0.6);
	float surf_foam = foam_cut(fv, clamp(surf_cover, 0.0, 1.0), fp);
	float foam = surf_foam * (0.82 + 0.18 * clamp(surf_cover, 0.0, 1.0));
	foam += wake_foam * (0.8 + 0.2 * bubbles) + crest_foam * mix(cap_break, bubbles, 0.3);
	// the swell trips over an open-sea reef: each crest stands up and spills
	// white across the coral as it rolls over, then the foam thins to lace
	// until the next one comes (sailors know a reef by its breakers)
	if (floor0.g > 0.02) {
		float shoal = floor0.g * (1.0 - smoothstep(0.9, 3.6, s_depth));
		float th0 = wave_a[0].z * dot(wave_a[0].xy, p) + wave_b[0].z;
		float th1 = wave_a[1].z * dot(wave_a[1].xy, p) + wave_b[1].z;
		float swl = sin(th0) * 0.62 + sin(th1) * 0.38 + (nz.g - 0.5) * 0.55;
		float burst = smoothstep(0.32, 0.9, swl) * (1.0 - smoothstep(1.4, 3.6, s_depth) * 0.5);
		float trail = smoothstep(0.1, 0.85, sin(th0 + 0.9) + (nz2.a - 0.5) * 0.5) * 0.45;
		float r_cover = shoal * (0.15 + 0.75 * burst + 0.3 * trail) * (0.75 + storm * 0.5 + surf.x * 0.3);
		foam += foam_cut(fv, clamp(r_cover, 0.0, 0.95), fp) * 0.9;
	}
	foam = clamp(foam, 0.0, 1.0);
	float fa = foam * 0.9;
	vec3 foam_base = vec3(0.96, 0.98, 1.0);

	// ---- compose. What a shadow can't touch is emitted; what it can is left
	// for light(): the sunlit share of the body, the sunlit foam, the glitter
	float keep = (1.0 - fa) * (1.0 - F);
	EMISSION = (body_bed + body_sun * sun_in * 0.55) * keep + refl * F * (1.0 - fa) + foam_base * sky_zenith * 0.55 * fa;
	v_body_lit = body_sun * sun_in * 0.45 * keep;
	v_bed_lit = body_bed_sun * keep;
	v_foam_lit = foam_base * 0.42 * fa;
	ALBEDO = vec3(1.0);
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
	NORMAL = normalize((VIEW_MATRIX * vec4(Ng, 0.0)).xyz);

	// for light(): the sharp glitter, twinkling in noise, fading under foam
	float twinkle = 0.45 + 1.4 * smoothstep(0.45, 0.85, texture(noise_tex, p * 0.73 + vec2(TIME * 0.09, -TIME * 0.07)).a);
	v_glint = twinkle * (1.0 + slick * 0.8);
	// moonlight lays a softer, silvery path than the sun's dazzle
	v_spec = (1.0 - fa) * (1.0 - rain * 0.55) * (1.0 - night * 0.5);
	v_gust = gust;
	v_swell_n = normalize((VIEW_MATRIX * vec4(Ns, 0.0)).xyz);

	// ---- the far sea lies under the haze a shade deeper and bluer than the
	// sky just above it, so the horizon stays a crisp line
	vec3 sea_haze = haze_color(-V) * mix(vec3(1.0), vec3(0.8, 0.88, 0.97), (1.0 - weather.w * 0.85) * (1.0 - cover * 0.45));
	FOG = vec4(sea_haze, aerial_at(v_dist, 0.0) * 0.88);
}

void light() {
	if (LIGHT_IS_DIRECTIONAL) {
		float ndl = max(dot(NORMAL, LIGHT), 0.0);
		// a ship's shadow on the water only dims it: the sea's body is lit
		// from all round, and still keeps four tenths of its glow in the shade
		vec3 sh = mix(vec3(0.42), vec3(1.0), ATTENUATION);
		DIFFUSE_LIGHT += sh * (v_body_lit + v_foam_lit * LIGHT_COLOR * (0.25 + 0.75 * ndl)) + ATTENUATION * v_bed_lit;
		// twinkling pinpoints, a tight sheen, and a broad soft path of light
		// off the swell itself that widens where the water is rougher
		vec3 H = normalize(LIGHT + VIEW);
		float nh = max(dot(NORMAL, H), 0.0);
		float nhs = max(dot(v_swell_n, H), 0.0);
		float spec = pow(nh, mix(2600.0, 1400.0, v_gust)) * 4.6 * v_glint + pow(nh, 340.0) * 0.2;
		spec += pow(nhs, mix(60.0, 26.0, v_gust)) * 0.045;
		SPECULAR_LIGHT += spec * v_spec * sh * LIGHT_COLOR * 0.55;
	} else {
		// lanterns and fires: a warm pool on the water
		float ndl = max(dot(NORMAL, LIGHT), 0.0);
		DIFFUSE_LIGHT += ndl * ATTENUATION * LIGHT_COLOR * 0.06;
	}
}
