// The island ground, per pixel (terrain.gdshader and its lite cousin).
//
// The heightfield is only 2 m per vertex, so any colour baked into vertices
// smears into soft blotches up close. Instead every layer (sand, turf, the
// forest floor, flowers, rock, limestone, lava) is resolved per pixel from
// world position, slope and tiling noise, with crisp, slightly rounded edges
// for a clean toy-diorama read, and a procedural bump gives each layer real
// lit relief: wind ripples, grass tufts, layered cliffs and basalt columns.
// Along the waterline every breaker runs up the beach as a foaming sheet and
// drains back, leaving dark glistening sand that dries between waves.
//
// The ground's own maps (Region): the surface normal, the open-sea coral and
// the rain's carving (ground_tex), baked occlusion, tree cover, bare summits
// and the crater (cover_tex), each a texel per grid point, so a chunk's
// lighter levels keep every bit of it; which kind of island owns the ground
// and its tint (isle_tex, every fourth point). The mesh brings positions only:
// each chunk draws the same grid template and the vertex shader lifts every
// vertex to its height (tools/world/entry.ts writes the chunks).
//
// A port of the web game's world/terrainMaterial.ts. GROUND_LITE (the low
// tier) leaves out the relief, the wildflowers, the meadows' sheen and the
// streaks down the walls.

render_mode cull_back, depth_draw_opaque, diffuse_lambert, specular_schlick_ggx;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/common.gdshaderinc"
#include "res://shaders/inc/sea_common.gdshaderinc"
#include "res://shaders/inc/ground.gdshaderinc"
#include "res://shaders/inc/wind.gdshaderinc"
#include "res://shaders/inc/lit.gdshaderinc"

/// x breaker height (m), y swash run-up (m), z storm, w the surf clock (s)
global uniform vec4 surf;

uniform sampler2D height_tex : filter_nearest, repeat_disable;
uniform sampler2D ground_tex : filter_linear_mipmap, repeat_disable;
uniform sampler2D cover_tex : filter_linear_mipmap, repeat_disable;
uniform sampler2D isle_tex : filter_linear, repeat_disable;
uniform sampler2D shore_tex : filter_linear, repeat_disable;
uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
uniform sampler2D foam_tex : filter_linear_mipmap, repeat_enable;
/// xy the archipelago's centre (m), z its biome (0 the home isles, 1 Las Brumas), w skirt drop (m)
uniform vec4 region = vec4(0.0, 0.0, 0.0, 1.2);

// position about the archipelago's centre, where every digit counts (Las
// Brumas lies 7 km out); y is the ground's own height, a skirt's its rim's
varying vec3 v_local;
varying vec4 v_isle;

void vertex() {
	vec2 at = MODEL_MATRIX[3].xz - region.xy + VERTEX.xz;
	float h = texelFetch(height_tex, ivec2(round((at + 1024.0) * 0.5)), 0).r;
	VERTEX.y = h - (VERTEX.y < -0.5 ? region.w : 0.0);
	// the ground's own slope: the shadow's normal bias leans along it, and
	// with a level normal a hillside turned from the sun shades itself in a
	// fine knit of acne
	vec2 nxz = textureLod(ground_tex, (at + 1025.0) / 2050.0, 0.0).rg * 2.0 - 1.0;
	NORMAL = vec3(nxz.x, sqrt(max(1.0 - dot(nxz, nxz), 0.0)), nxz.y);
	v_local = vec3(at.x, h, at.y);
	v_isle = textureLod(isle_tex, (at + 1028.0) / 2056.0, 0.0);
}

// Stone in the plane of its own face: top-down on a ledge, side-on up a wall.
// Sampled top-down, as the ground is, a sheer cliff smears every crack and
// grain into pixel-thin stripes that run its whole height and crawl as the
// view moves. w are the triplanar weights; the blend is stretched back to the
// noise's own contrast, so cracks don't fade out where two planes meet. dx, dy
// are the surface's world-space screen derivatives (taken in uniform control
// flow, so the samples inside branches keep their mip level).
vec4 rock_tex(vec3 p, vec3 w, vec3 dx, vec3 dy, float s, vec2 o) {
	vec4 c = vec4(0.0);
	if (w.y > 0.0) {
		c += w.y * textureGrad(noise_tex, p.xz * s + o, dx.xz * s, dy.xz * s);
	}
	if (w.x > 0.0) {
		c += w.x * textureGrad(noise_tex, p.zy * s + o + vec2(0.31, 0.53), dx.zy * s, dy.zy * s);
	}
	if (w.z > 0.0) {
		c += w.z * textureGrad(noise_tex, p.xy * s + o + vec2(0.67, 0.19), dx.xy * s, dy.xy * s);
	}
	return 0.5 + (c - 0.5) * inversesqrt(dot(w, w));
}

// Noise hung on the walls, stretched down them (s: across, down): rain
// stains, creepers and flutes, side-on on whichever way the face looks.
vec4 wall_tex(vec3 p, vec3 n, vec3 dx, vec3 dy, vec2 s, vec2 o) {
	vec2 w = n.xz * n.xz + 1e-5;
	w *= w;
	w = max(w / (w.x + w.y) - 0.04, 0.0);
	w /= w.x + w.y;
	vec4 c = vec4(0.0);
	if (w.x > 0.0) {
		c += w.x * textureGrad(noise_tex, p.zy * s + o, dx.zy * s, dy.zy * s);
	}
	if (w.y > 0.0) {
		c += w.y * textureGrad(noise_tex, p.xy * s + o + vec2(0.43, 0.29), dx.xy * s, dy.xy * s);
	}
	return 0.5 + (c - 0.5) * inversesqrt(dot(w, w));
}

// A threshold that widens to what one pixel spans of x, so a crisp edge
// softens into its average with distance instead of sparkling.
float px_step(float a, float b, float x) {
	float fw = fwidth(x);
	return smoothstep(a - fw, b + fw, x);
}

void fragment() {
	vec3 lp = v_local;
	vec2 xz = lp.xz + region.xy;
	float h = lp.y;
	// per pixel: a far chunk's triangles are wider than a cloud's soft edge
	lit_cloud = cloud_shadow(xz);
	float biome = region.z;
	vec2 guv = (lp.xz + 1025.0) / 2050.0;
	vec4 gm = texture(ground_tex, guv);
	vec4 cv = texture(cover_tex, guv);
	vec2 nxz = gm.rg * 2.0 - 1.0;
	vec3 wn = normalize(vec3(nxz.x, sqrt(max(1.0 - dot(nxz, nxz), 0.0)), nxz.y));
	float reef = gm.b;
	float erode = gm.a * 2.0 - 1.0;
	float ao = cv.r;
	float canopy = cv.g;
	float summit = cv.b;
	float crater = cv.a;
	vec3 kind = v_isle.rgb;
	float kV = kind.x;
	float kA = kind.y;
	float kR = kind.z;
	float kL = clamp(1.0 - kV - kA - kR, 0.0, 1.0);
	float tint = v_isle.a * 2.0 - 1.0;
	float slope = 1.0 - wn.y;
	// A cliff's foot shares its normal with the flat ground below, so the
	// smooth normal fades the wall's lower triangles toward level and the turf
	// climbs it in long green spikes. The triangle's own slope settles it.
	mat3 to_world = mat3(INV_VIEW_MATRIX);
	// world-space screen derivatives of the surface, taken once in uniform control flow
	vec3 g_dx = to_world * dFdx(VERTEX);
	vec3 g_dy = to_world * dFdy(VERTEX);
	vec3 fn = cross(g_dx, g_dy);
	float f_slope = 1.0 - abs(fn.y) * inversesqrt(max(dot(fn, fn), 1e-20));
	slope = max(slope, f_slope * smoothstep(0.5, 0.7, f_slope));
	// metres covered by one pixel: bump detail smaller than a few pixels fades
	// out, since a derivative bump on it would only show 2x2-pixel grain (all
	// three axes: up a sheer wall the ground plane's xz barely moves)
	float fp = length(abs(g_dx) + abs(g_dy));
	// triplanar weights for stone (see rock_tex)
	vec3 tw = max(abs(wn) - 0.3, 0.0);
	tw *= tw;
	tw /= tw.x + tw.y + tw.z;

	vec4 nW, nM, nS, nD, nF;
	ground_noise(xz, noise_tex, nW, nM, nS, nD, nF);

	// ---------------------------------------------------------------- sand
	vec3 sand = sand_color(biome, nS, nF);
	// wind-combed ripples: strong in the shallows, a whisper on dry beach
	float rph = dot(lp.xz, vec2(0.79, 0.61)) * 2.4 + (nD.g - 0.5) * 7.0 + (nS.r - 0.5) * 14.0;
	float r_fade = 1.0 - smoothstep(0.7, 1.7, fwidth(rph));
	float rip = sin(rph);
	rip = rip * rip * sign(rip) * 0.5 + 0.5;
	float rip_mask = r_fade * mix(0.25, 1.0, smoothstep(0.3, -0.6, h)) * smoothstep(-7.0, -2.0, h) * (1.0 - smoothstep(1.2, 2.2, h));
	sand *= 1.0 - (1.0 - rip) * 0.07 * rip_mask;
	float b_sand = rip * 0.05 * rip_mask;

	// ---------------------------------------------------------------- seabed
	// (the sea draws the floor it covers: here only what a trough lays bare)
	float land = smoothstep(-0.05, 0.05, h);
	vec3 bed = sand;
	float b_bed = 0.0;
	if (land < 1.0) {
		bed = bed_color(sand, h, xz, kA, kR, reef, fp, noise_tex, nM, nS, nD, nF, b_bed);
	}

	// ---------------------------------------------------------------- grass
	float edge = turf_edge(h, kA, nM, nS, nD, nF);
	float grass_t = smoothstep(-0.05, 0.1, edge);
	float jungle = jungle_at(h, kA, nM, nD);
	float under = under_at(canopy, kA, nD);
	vec3 g = turf_color(h, kind, tint, erode, biome, jungle, under, edge, nM, nS, nD, nF);
	float lip = 1.0 - smoothstep(0.1, 0.55, edge);
	float fl = 0.0;
	if (grass_t * land > 0.001) {
#ifndef GROUND_LITE
		// wildflowers in meadow clearings
		vec4 nFl = texture(noise_tex, xz * 0.31 + vec2(0.71, 0.13));
		fl = (1.0 - smoothstep(0.07, 0.13, nFl.b)) * smoothstep(0.56, 0.64, nS.a) * (1.0 - jungle) * (1.0 - kV) * smoothstep(0.35, 0.9, edge);
		vec3 flc = mix(T_FLOWER_A, T_FLOWER_B, step(0.5, nD.r));
		flc = mix(flc, T_FLOWER_C, step(0.6, nM.a) * step(nD.g, 0.5));
		fl *= 1.0 - under;
		g = mix(g, flc, fl * 0.9);
		// wind rolling over the meadows: bright waves of bent blades sweep
		// downwind, brightest where a gust is passing
		vec2 wv = xz * 0.045 - wind_drift * 0.22;
		float sheen = texture(noise_tex, wv).r * 0.6 + texture(noise_tex, wv * 2.3 + 0.37).g * 0.4;
		sheen = smoothstep(0.45, 0.8, sheen) * (0.35 + gust_at(xz) * 0.8);
		g *= 1.0 + sheen * 0.14 * (1.0 - under) * (1.0 - jungle * 0.7);
#endif
	}
	float b_grass = ((nF.g - 0.5) * 0.09 + fl * 0.06) * (1.0 - smoothstep(0.04, 0.1, fp)) - lip * 0.02;
	// sun-bleached dry rim on the sand just below the turf
	float rim = smoothstep(-0.5, -0.05, edge) * (1.0 - grass_t);
	vec3 beach = sand * (1.0 + rim * 0.07);

	// ---------------------------------------------------------------- rock
	float rock_t = rock_at(h, slope, summit, kR, erode, biome, nD);
	vec3 rock = vec3(0.0);
	float b_rock = 0.0;
	float crack = 0.0;
	float cells = 0.5;
	vec4 nR2 = vec4(0.5);
	if (rock_t > 0.001 || crater > 0.001) {
		vec4 nR = rock_tex(lp, tw, g_dx, g_dy, 0.07, vec2(0.27, 0.6)); // ~1 m crack cells
		nR2 = rock_tex(lp, tw, g_dx, g_dy, 0.045, (nW.rg - 0.5) * 0.4 + vec2(0.8, 0.4));
		// (top-down on purpose: basalt columns stand upright, so they run down the walls)
		vec4 nCol = texture(noise_tex, (xz + vec2(0.0, h * 0.35)) * 0.055 + vec2(0.13, 0.91)); // ~1.3 m columns
		cells = mix(nR.b, nCol.b, kV);
		crack = px_step(0.55, 0.75, cells);
		// Las Brumas: limestone parts along upright joints and level beds, so
		// up the walls its cracks run in long verticals, not round cells
		if (biome > 0.01) {
			float joint = px_step(0.6, 0.8, wall_tex(lp, wn, g_dx, g_dy, vec2(0.12, 0.028), vec2(0.21, 0.66)).b);
			crack = mix(crack, joint, smoothstep(0.3, 0.6, slope) * biome);
		}
		vec3 r_lush = mix(T_ROCK, T_ROCK_DARK, smoothstep(0.4, 0.7, nR2.g) * 0.65);
		r_lush *= 1.0 - crack * 0.3;
		r_lush = mix(r_lush, T_MOSS, smoothstep(0.75, 0.9, wn.y + (nR.g - 0.5) * 0.35) * 0.7);
		// Karst limestone: pale weathered stone in beds of uneven thickness (a 1D
		// slice of the noise up the face, gently dipping across the isle), warm
		// iron stains in places, dark rain streaks hanging down the walls and
		// moss on every ledge and down the runnels.
		float bed_ph = (h + (nR2.g - 0.5) * 2.4 + (nM.b - 0.5) * 6.0 + dot(lp.xz, vec2(0.05, 0.03))) * 0.012;
		vec4 nB = texture(noise_tex, vec2(bed_ph, 0.37 + tint * 0.1));
		float beds = nB.a * 0.55 + nB.g * 0.45;
		// the thinnest beds (~1.3 m) blur into their average once a pixel spans one
		float beds_t = px_step(0.3, 0.7, beds);
		vec3 r_sand = mix(T_LIME_GREY, T_LIME, smoothstep(0.32, 0.68, nM.g + (nS.r - 0.5) * 0.4));
		r_sand = mix(r_sand, T_LIME_WARM, smoothstep(0.5, 0.74, nR2.r + (nS.b - 0.5) * 0.3) * (0.45 + 0.3 * tint));
		r_sand *= 0.86 + beds_t * 0.22 + nR.a * 0.06;
		float streak = 0.0;
#ifndef GROUND_LITE
		if (kR > 0.001) {
			// streaks hang down the face, side-on to it
			streak = wall_tex(lp, wn, g_dx, g_dy, vec2(0.21, 0.007), vec2(0.13, 0.57)).a * 0.55 + wall_tex(lp, wn, g_dx, g_dy, vec2(0.084, 0.007), vec2(0.71, 0.2)).g * 0.45;
			streak = px_step(0.5, 0.7, streak) * smoothstep(0.3, 0.6, slope);
			r_sand = mix(r_sand, T_LIME_STAIN, streak * 0.32);
		}
#endif
		r_sand = mix(r_sand, T_LIME_MOSS, clamp(smoothstep(0.58, 0.8, wn.y + (nR.g - 0.5) * 0.3) * 0.8 + smoothstep(-0.2, -0.75, erode) * 0.35, 0.0, 0.85));
		vec3 r_vol = mix(T_ASH, T_BASALT, smoothstep(6.0, 30.0, h) * 0.7 + 0.3);
		r_vol = mix(r_vol, T_SCORIA, smoothstep(0.55, 0.7, nR2.r + summit * 0.25) * 0.7);
		r_vol *= 0.92 + (1.0 - cells) * 0.14; // basalt column tops catch light
		// weathered, ashy spurs between dark, damp ravines
		r_vol *= 0.88 + smoothstep(-0.6, 0.6, erode) * 0.24;
#ifndef GROUND_LITE
		if (kV > 0.001) {
			// streaks of ash washing downhill
			r_vol = mix(r_vol, T_ASH, smoothstep(0.6, 0.75, texture(noise_tex, vec2(xz.x * 0.06 + xz.y * 0.02, h * 0.012)).g) * 0.35);
		}
#endif
		rock = r_lush * kL + r_lush * kA + r_sand * kR + r_vol * kV;
		float b_lime = 0.0;
		if (biome > 0.01) {
			// Limestone as Ha Long has it: pale cream-grey stone, cooler in the
			// shade of the walls, warm where it broke away not long ago; long
			// grey-black rain stains hanging down from every lip; moss on each
			// ledge, creepers in tongues down the walls, and solution flutes (the
			// rain's own runnels) fluting every face, all hung side-on on the walls.
			vec4 sW = wall_tex(lp, wn, g_dx, g_dy, vec2(0.11, 0.0065), vec2(0.17, 0.39));
			vec4 sF = wall_tex(lp, wn, g_dx, g_dy, vec2(0.045, 0.004), vec2(0.58, 0.12));
			float stain = px_step(0.5, 0.74, sW.g * 0.7 + sF.r * 0.3 + (nR.a - 0.5) * 0.16);
			// the broad stains: whole curtains of darker stone where water runs most
			float curtain = smoothstep(0.48, 0.7, sF.g + (nM.b - 0.5) * 0.3);
			vec3 lime = mix(T_MIST_LIME, T_MIST_LIME * vec3(0.9, 0.93, 0.96), smoothstep(0.35, 0.7, nR2.g));
			lime = mix(lime, T_MIST_LIME_WARM, beds_t * 0.32);
			// iron-ochre where a slab broke away
			lime = mix(lime, T_MIST_LIME_WARM, px_step(0.6, 0.76, nR2.r + (nS.g - 0.5) * 0.35) * 0.6);
			lime = mix(lime, T_MIST_LIME_STAIN, max(stain * 0.6, curtain * 0.34));
			lime *= 1.0 - crack * 0.18;
			lime = mix(lime, T_MIST_LIME_MOSS, smoothstep(0.55, 0.8, wn.y + (nR.g - 0.5) * 0.4) * 0.85);
			// creepers and ferns hang in long tongues down the walls from every ledge
			float vine = wall_tex(lp, wn, g_dx, g_dy, vec2(0.09, 0.012), vec2(0.41, 0.83)).g + (nS.r - 0.5) * 0.35 + (nD.a - 0.5) * 0.2;
			float vine_t = px_step(0.56, 0.68, vine) * smoothstep(3.0, 9.0, h);
			lime = mix(lime, mix(T_MIST_LIME_VINE, T_MIST_LIME_MOSS, nD.g * 0.6), vine_t * 0.9);
			// the sea gnaws a dark, dripping notch into the foot of every wall
			float notch = (1.0 - smoothstep(1.4, 2.6, h + (nS.b - 0.5) * 1.2)) * smoothstep(-0.8, 0.2, h);
			lime = mix(lime, T_MIST_LIME_NOTCH, notch * 0.8);
#ifndef GROUND_LITE
			// solution flutes: runnels a hand to an arm's span across, down every
			// steep face, the bigger ones out to where a pixel spans a few of them
			float wall = smoothstep(0.35, 0.7, slope);
			float flF = wall_tex(lp, wn, g_dx, g_dy, vec2(0.6, 0.03), vec2(0.73, 0.61)).g;
			// (the big runnels are the stains' own: the rain darkens the grooves it cut)
			float flC = 1.0 - sW.g;
			b_lime = wall * (1.0 - vine_t * 0.7) * ((flF - 0.5) * 0.09 * (1.0 - smoothstep(0.04, 0.12, fp)) + (flC - 0.5) * 0.3 * (1.0 - smoothstep(0.2, 0.6, fp)))
					+ vine_t * 0.08 * (1.0 - smoothstep(0.1, 0.3, fp));
			lime *= 1.0 + ((flF - 0.5) * 0.12 * (1.0 - smoothstep(0.04, 0.12, fp)) + (flC - 0.5) * 0.08) * wall;
#endif
			rock = mix(rock, lime, biome * (1.0 - kV));
		}
		float fine_fade = 1.0 - smoothstep(0.1, 0.25, fp);
		b_rock = mix(-crack * 0.2 * fine_fade + nR.a * 0.08 * fine_fade,
				(beds - 0.5) * 0.2 * (1.0 - smoothstep(0.25, 0.7, fp)) - crack * 0.1 * fine_fade + nR.a * 0.06 * fine_fade - streak * 0.03, kR)
				+ kV * ((1.0 - cells) * 0.22) * (1.0 - smoothstep(0.25, 0.6, fp));
		b_rock += b_lime * biome * (1.0 - kV);
	}

	// ---------------------------------------------------------------- compose
	vec3 ground = mix(bed, mix(beach, g, grass_t), land);
	float b_ground = mix(b_sand + b_bed, mix(b_sand, b_grass, grass_t), land);
	vec3 albedo = mix(ground, rock, rock_t);
	float bump_h = mix(b_ground, b_rock, rock_t);
	float rough = mix(mix(0.96, 0.9, grass_t * land), 0.82, rock_t);
	// cavities: cracks and crevices darken a touch
	albedo *= 1.0 - crack * rock_t * 0.15;

	// volcanic crater: cooling crust over glowing seams, a molten heart
	vec3 lava = vec3(0.0);
	if (crater > 0.001) {
		float seam = smoothstep(0.62, 0.78, cells) * smoothstep(0.2, 0.8, crater);
		float pool = smoothstep(0.86, 0.97, crater + (nR2.g - 0.5) * 0.12);
		float pulse = 0.75 + 0.25 * sin(TIME * 1.3 + nR2.r * 9.0);
		albedo = mix(albedo, T_BASALT * 0.6, smoothstep(0.0, 0.5, crater));
		albedo = mix(albedo, vec3(0.9, 0.3, 0.06), pool * (1.0 - smoothstep(0.35, 0.6, cells) * 0.85));
		lava = vec3(5.0, 1.35, 0.25) * (seam * 0.6 + pool * (1.0 - smoothstep(0.3, 0.62, cells) * 0.9)) * pulse;
		bump_h -= seam * 0.15;
	}

	// ---------------------------------------------------------------- swash
	// Each breaker that reaches the beach runs on up the sand as a thin sheet,
	// its foaming front scalloped into tongues, slows, stops and drains back.
	// It leaves dark, glossy sand that dries out between waves and a stranded
	// line of foam that pops away. The phase is the sea's own (surf_phase), so
	// the sheet sets off the moment the whitewater reaches the waterline.
	float wet = 1.0 - smoothstep(-0.06, 0.04, h); // under the sea it is all wet
	float film = 0.0;
	float gloss = 0.0;
	float s_foam = 0.0;
	if (h > -0.1 && h < 2.6) {
		vec4 sf = texture(shore_tex, (lp.xz + 1024.0) / 2048.0);
		float reach = mix(0.22, 1.0, sf.a);
		float psi = surf_phase(xz, 0.0, surf.w, noise_tex);
		float sn = floor(psi);
		float su = psi - sn;
		// the band the bigger sets reach stays damp
		wet = max(wet, (1.0 - smoothstep(0.0, surf.y * reach * 1.6 + 0.12, h)) * 0.38);
		// this wave and the one before it (still draining, or its sand still wet)
		for (int c = 0; c < 2; c++) {
			float idx = sn - float(c);
			float uc = su + float(c);
			float lobe = texture(noise_tex, xz * 0.012 + vec2(idx * 0.41, idx * 0.23)).b;
			float R = surf.y * reach * surf_var(xz, idx, noise_tex) * (0.62 + 0.6 * (1.0 - lobe));
			if (h >= R) {
				continue;
			}
			R = max(R, 1e-3);
			float q = sqrt(max(1.0 - max(h, 0.0) / R, 0.0));
			// the sheet runs up until 0.3 of a period, then drains back until 0.82
			float ua = 0.3 * (1.0 - q);
			float ul = 0.3 + 0.52 * q;
			if (uc < ua) {
				continue;
			}
			if (uc < ul) {
				// under the sheet: how far below its leading edge, in metres of height
				float x = (uc - 0.3) / 0.52;
				float front = uc < 0.3 ? R * (1.0 - (1.0 - uc / 0.3) * (1.0 - uc / 0.3)) : R * (1.0 - x * x);
				float d = front - h;
				film = max(film, smoothstep(0.0, 0.03, d));
				wet = 1.0;
				float ta = (uc - ua) * SURF_T;
				float edge_band = 1.0 - smoothstep(0.0, 0.02 + R * 0.09, d);
				s_foam = max(s_foam, uc < 0.3 ? max(edge_band, 0.62 * exp(-ta * 1.1)) : max(edge_band * 0.4, 0.38 * exp(-ta * 0.6)));
			} else {
				float td = (uc - ul) * SURF_T; // seconds since the water left
				wet = max(wet, exp(-td * 0.15));
				gloss = max(gloss, exp(-td * 0.9));
				// foam stranded where the sheet stopped
				float strand = mix(0.08, 0.5, smoothstep(0.55 * R, 0.97 * R, h));
				s_foam = max(s_foam, strand * exp(-td * 0.45));
			}
		}
	}
	// under the resting sea the ocean draws the water; here only the sand is wet
	float dry_land = step(0.0, h);
	film *= dry_land;
	gloss *= dry_land;
	albedo *= mix(1.0, 0.62, wet);
	// the sheet itself: a sliver of clear sea water over the sand
	albedo = mix(albedo, albedo * vec3(0.6, 0.86, 0.9), film * 0.55);
	rough = mix(rough, 0.38, wet * 0.6 * dry_land);
	rough = mix(rough, 0.05, max(film, gloss * 0.75));
	bump_h *= 1.0 - film * 0.75;
	float lace = s_foam > 0.002 ? foam_cut(foam_field(xz, TIME, foam_tex), s_foam, fp) : 0.0;
	albedo = mix(albedo, vec3(0.9, 0.92, 0.94), lace * 0.95);
	rough = mix(rough, 0.8, lace);
	bump_h += lace * 0.012;

	ALBEDO = albedo * wet_dim();
	ROUGHNESS = rough * wet_gloss();
	EMISSION = lava;
	// baked occlusion: the sky's light all of it, the sun's a little
	AO = ao;
	AO_LIGHT_AFFECT = 0.45;
	vec3 n = normalize((VIEW_MATRIX * vec4(wn, 0.0)).xyz);
#ifndef GROUND_LITE
	// Relief only where the sun can rake it: on slopes turned away from the sun
	// a bumped normal would peek into the shadow map at grazing angles and show
	// its texel stair-steps.
	bump_h *= smoothstep(0.02, 0.3, dot(wn, sun_dir));
	n = bump(n, VERTEX, bump_h);
#endif
	NORMAL = n;
	FOG = air_fog(lp + vec3(region.x, 0.0, region.y), CAMERA_POSITION_WORLD);
}
