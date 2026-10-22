// The island ground's palette and the layers it is resolved from, per pixel,
// shared by the ground (terrain.gdshader) and the sea, which draws the
// seabed through the water (ocean.gdshader): both read the same noise at the
// same world point, so the sand under the waves is the sand on the beach.
// A port of the web game's world/terrainMaterial.ts.

// The colours as the web game renders them: its palette is decoded from sRGB
// twice (three.js already decodes a hex colour, and lin() decodes it again),
// and the look was tuned on those deeper, richer tones, so they are kept.
const vec3 T_SAND = vec3(0.8308, 0.6293, 0.293);
const vec3 T_SAND_WARM = vec3(0.6717, 0.373, 0.0903);
const vec3 T_SAND_DEEP = vec3(0.1306, 0.0852, 0.0275);
const vec3 T_SEAGRASS = vec3(0.0039, 0.0315, 0.0058);
const vec3 T_SEAGRASS_DARK = vec3(0.0014, 0.0084, 0.0033);
const vec3 T_CORAL_A = vec3(0.7637, 0.0359, 0.0257);
const vec3 T_CORAL_B = vec3(1, 0.1581, 0.0315);
const vec3 T_CORAL_C = vec3(0.2006, 0.0526, 0.4097);
const vec3 T_CORAL_D = vec3(0.8136, 0.3556, 0.0183);
const vec3 T_CORAL_E = vec3(0.3003, 0.0613, 0.0104);
const vec3 T_CORAL_F = vec3(0.037, 0.1498, 0.0559);
const vec3 T_RUBBLE = vec3(0.4393, 0.3309, 0.1581);
const vec3 T_GRASS = vec3(0.021, 0.1343, 0.0054);
const vec3 T_GRASS_LIGHT = vec3(0.1073, 0.323, 0.012);
const vec3 T_GRASS_DRY = vec3(0.1759, 0.2224, 0.009);
const vec3 T_GRASS_DEEP = vec3(0.0036, 0.0526, 0.0028);
const vec3 T_JUNGLE = vec3(0.0019, 0.0183, 0.0021);
const vec3 T_GRASS_GOLD = vec3(0.2524, 0.24, 0.0138);
const vec3 T_FOREST_FLOOR = vec3(0.0027, 0.009, 0.0018);
const vec3 T_LEAF_LITTER = vec3(0.0315, 0.0148, 0.0041);
const vec3 T_FLOWER_A = vec3(1, 0.8308, 0.5154);
const vec3 T_FLOWER_B = vec3(1, 0.3819, 0.0058);
const vec3 T_FLOWER_C = vec3(1, 0.0315, 0.127);
const vec3 T_ROCK = vec3(0.1343, 0.1043, 0.0672);
const vec3 T_ROCK_DARK = vec3(0.0315, 0.0249, 0.0183);
const vec3 T_MOSS = vec3(0.0116, 0.0613, 0.0038);
const vec3 T_LIME = vec3(0.6157, 0.4097, 0.1668);
const vec3 T_LIME_GREY = vec3(0.234, 0.1498, 0.0713);
const vec3 T_LIME_WARM = vec3(0.4707, 0.1343, 0.0275);
const vec3 T_LIME_STAIN = vec3(0.021, 0.0159, 0.0104);
const vec3 T_LIME_MOSS = vec3(0.007, 0.0526, 0.0033);
const vec3 T_BASALT = vec3(0.0347, 0.0241, 0.0183);
const vec3 T_SCORIA = vec3(0.0577, 0.0104, 0.0047);
const vec3 T_ASH = vec3(0.0852, 0.0652, 0.0464);
const vec3 T_SAND_PINK = vec3(0.8308, 0.4393, 0.3472);
const vec3 T_SAND_ROSE = vec3(0.6157, 0.1759, 0.1136);
const vec3 T_MIST_LIME = vec3(0.4293, 0.3819, 0.2789);
const vec3 T_MIST_LIME_WARM = vec3(0.373, 0.1759, 0.0526);
const vec3 T_MIST_LIME_STAIN = vec3(0.0196, 0.0217, 0.0159);
const vec3 T_MIST_LIME_MOSS = vec3(0.0087, 0.037, 0.0048);
const vec3 T_MIST_LIME_VINE = vec3(0.0038, 0.0225, 0.0027);
const vec3 T_MIST_LIME_NOTCH = vec3(0.0033, 0.0035, 0.0029);

// Seconds between breakers (the web's SURF_PERIOD): the surf's phase is
// (time + travel time) / period, the same in the sea and on the sand.
const float SURF_T = 7.0;

// Four octaves of the shared tiling noise (R big fbm, G mid fbm, B worley, A
// fine). The noise is value noise, whose square lattice shows through any
// crisp threshold: a domain warp bends that lattice into organic contours.
void ground_noise(vec2 xz, sampler2D tex, out vec4 nW, out vec4 nM, out vec4 nS, out vec4 nD, out vec4 nF) {
	nW = texture(tex, xz * 0.013 + vec2(0.71, 0.29));
	vec2 wxz = xz + (nW.rg - 0.5) * 16.0;
	vec2 rxz = mat2(vec2(0.8, -0.6), vec2(0.6, 0.8)) * wxz;
	nM = texture(tex, wxz * 0.0071 + vec2(0.31, 0.17)); // ~140 m
	nS = texture(tex, rxz * 0.027); // ~37 m
	nD = texture(tex, wxz * 0.12 + vec2(0.53, 0.21)); // ~8 m
	nF = texture(tex, xz * 0.53 + vec2(0.11, 0.77)); // ~2 m
}

// metres above the top of the beach (negative: still on the sand)
float turf_edge(float h, float kA, vec4 nM, vec4 nS, vec4 nD, vec4 nF) {
	float beach_top = mix(1.2, 1.55, kA) + (nS.g - 0.5) * 0.9 + (nM.r - 0.5) * 0.5;
	return h + (nD.a - 0.5) * 0.4 + (nF.g - 0.5) * 0.08 - beach_top;
}

float jungle_at(float h, float kA, vec4 nM, vec4 nD) {
	return smoothstep(3.5, 10.0, h) * smoothstep(0.44, 0.58, nM.g + (nD.g - 0.5) * 0.08) * (1.0 - kA);
}

// forest floor under the trees
float under_at(float canopy, float kA, vec4 nD) {
	return smoothstep(0.15, 0.85, canopy + (nD.g - 0.5) * 0.35) * (1.0 - kA);
}

// bare rock: steep ground, bald summits, the sandstone isles' cliffs
float rock_at(float h, float slope, float summit, float kR, float erode, float biome, vec4 nD) {
	// spurs go bare a little sooner, gullies hold their green on steeper ground
	float rn = (nD.g - 0.5) * 0.26 + erode * 0.09;
	// (in the mist the jungle clings on to steeper ground)
	float t = smoothstep(0.26, 0.33, slope + rn - biome * 0.09);
	t = max(t, smoothstep(0.32, 0.42, summit + rn));
	t = max(t, kR * smoothstep(0.18, 0.24, slope + rn));
	return t * (smoothstep(-6.0, -1.0, h) * 0.6 + 0.4);
}

// the turf's colour (before the wildflowers and the wind's sheen)
vec3 turf_color(float h, vec3 kind, float tint, float erode, float biome, float jungle, float under, float edge, vec4 nM, vec4 nS, vec4 nD, vec4 nF) {
	float kV = kind.x;
	float kL = clamp(1.0 - kind.x - kind.y - kind.z, 0.0, 1.0);
	vec3 g = mix(T_GRASS, T_GRASS_LIGHT, smoothstep(0.46, 0.66, nS.r + (nD.g - 0.5) * 0.12) * 0.5);
	g = mix(g, T_GRASS_DRY, smoothstep(0.52, 0.66, nM.r + tint * 0.14 + (nD.g - 0.5) * 0.1) * 0.7);
	g = mix(g, T_GRASS_DEEP, smoothstep(0.5, 0.62, 1.0 - nS.g + (nD.r - 0.5) * 0.1) * 0.6);
	// Las Brumas: wetter, bluer jade turf
	g = mix(g, g * vec3(0.74, 1.0, 0.86), biome);
	g = mix(g, T_JUNGLE, jungle * 0.8);
	// sun-cured grass up on the high lush ridges
	g = mix(g, T_GRASS_GOLD, smoothstep(14.0, 32.0, h + (nM.g - 0.5) * 10.0) * 0.42 * kL);
	// the rain's work: deep, damp green down every gully, sunlit and a little
	// drier along the spurs between them, so each hillside reads as ribs
	float gully = smoothstep(-0.05, -0.6, erode + (nD.r - 0.5) * 0.2);
	float spur = smoothstep(0.1, 0.65, erode + (nD.r - 0.5) * 0.2);
	g = mix(g, T_JUNGLE * 0.9, gully * 0.5);
	g = mix(g, mix(T_GRASS_LIGHT, T_GRASS_GOLD, 0.35 + kV * 0.4), spur * 0.32);
	// forest floor under the trees: deep moss with drifts of fallen leaves
	vec3 floor_c = mix(T_FOREST_FLOOR, T_LEAF_LITTER, smoothstep(0.52, 0.7, nF.r + (nD.a - 0.5) * 0.3) * 0.75);
	g = mix(g, floor_c, under * 0.72);
	// tufts: per-blade-clump light and dark
	g *= 0.9 + nF.g * 0.2;
	// a richer, darker lip where turf meets the sand
	float lip = 1.0 - smoothstep(0.1, 0.55, edge);
	return mix(g, g * vec3(0.78, 0.86, 0.8), lip * 0.5);
}

// Dry sand, white coral sand at home and pink shell sand in the mist.
vec3 sand_color(float biome, vec4 nS, vec4 nF) {
	vec3 sand = mix(T_SAND, T_SAND_WARM, smoothstep(0.38, 0.68, nS.g) * 0.75);
	sand = mix(sand, mix(T_SAND_PINK, T_SAND_ROSE, smoothstep(0.42, 0.7, nS.g) * 0.7), biome);
	return sand * (0.94 + nF.a * 0.12);
}

// The sea floor under h (m, negative) over sand: deepening to pale silt,
// crisp seagrass meadows, round coral heads in a band of warm shallow water,
// and on an open-sea reef one crowded garden of coral over pale rubble. fp is
// the pixel footprint (m); relief receives the floor's relief (m).
vec3 bed_color(vec3 sand, float h, vec2 xz, float kA, float kR, float reef, float fp, sampler2D tex,
		vec4 nM, vec4 nS, vec4 nD, vec4 nF, out float relief) {
	float depth_t = smoothstep(-0.8, -12.0, h);
	vec3 bed = mix(sand, T_SAND_DEEP * (0.92 + nD.a * 0.16), depth_t);
	// seagrass meadows: crisp patches with a blade-scale texture
	float gm = smoothstep(0.54, 0.6, nS.g + (nD.a - 0.5) * 0.16 + (nM.r - 0.5) * 0.25)
			* smoothstep(-1.3, -2.8, h) * (1.0 - smoothstep(-8.5, -12.0, h)) * (1.0 - kA * 0.6);
	bed = mix(bed, mix(T_SEAGRASS_DARK, T_SEAGRASS, nF.g * 0.7 + nD.a * 0.3), gm * 0.85);
	// coral heads: rounded worley blobs in a band of warm shallow water
	float coral_band = smoothstep(-0.7, -1.4, h) * (1.0 - smoothstep(-4.0, -5.2, h)) * (1.0 - kR);
	// (unwarped, so the heads stay round: a ~20 m tile of ~1.4 m heads)
	vec4 nC = texture(tex, xz * 0.05 + vec2(0.17, 0.43));
	relief = gm * (nF.g - 0.5) * 0.08 * (1.0 - smoothstep(0.04, 0.1, fp));
	if (coral_band > 0.001) {
		float pt = smoothstep(0.6, 0.66, nM.g + (nS.a - 0.5) * 0.3);
		float blob = 1.0 - smoothstep(0.22, 0.5, nC.b);
		float coral = blob * pt * coral_band;
		vec3 cc = mix(T_CORAL_A, T_CORAL_B, smoothstep(0.35, 0.65, nS.r));
		cc = mix(cc, T_CORAL_C, smoothstep(0.6, 0.66, nC.r) * 0.6);
		cc = mix(cc, T_CORAL_D, smoothstep(0.62, 0.7, nC.a));
		bed = mix(bed, cc * (0.75 + blob * 0.35), smoothstep(0.05, 0.3, coral) * (1.0 - gm));
		relief += coral * 0.35 * (1.0 - smoothstep(0.25, 0.6, fp));
	}
	// open-sea reefs: the crest is one crowded garden of coral, heads of every
	// shape and colour packed shoulder to shoulder over pale rubble, bleaching
	// toward the shallowest knobs. It reads through the water as a warm mosaic.
	if (reef > 0.01) {
		float r_band = smoothstep(-10.0, -3.5, h);
		vec4 nC2 = texture(tex, xz * 0.11 + vec2(0.61, 0.07)); // ~9 m tile, heads under a metre
		float r_blob = 1.0 - smoothstep(0.16, 0.44, nC2.b);
		float r_big = 1.0 - smoothstep(0.2, 0.5, nC.b);
		float heads = max(r_blob, r_big * 0.9);
		float r_cover = smoothstep(0.25, 0.5, reef + (nS.a - 0.5) * 0.5 + (nD.g - 0.5) * 0.3) * r_band;
		vec3 rc = mix(T_CORAL_A, T_CORAL_C, smoothstep(0.42, 0.6, nM.a + (nD.r - 0.5) * 0.3));
		rc = mix(rc, T_CORAL_D, smoothstep(0.55, 0.68, nC2.r) * 0.75);
		rc = mix(rc, T_CORAL_E, smoothstep(0.5, 0.62, nD.r) * 0.65);
		rc = mix(rc, T_CORAL_F, smoothstep(0.56, 0.7, nC2.g) * 0.6);
		rc = mix(rc, T_CORAL_B, smoothstep(0.62, 0.72, nC.r) * 0.5);
		rc = mix(rc, vec3(0.86, 0.82, 0.74), smoothstep(-1.3, -0.55, h) * 0.4);
		vec3 rubble = T_RUBBLE * (0.8 + nF.a * 0.3);
		vec3 reef_col = mix(rubble, rc * (0.7 + heads * 0.45), smoothstep(0.1, 0.45, heads));
		bed = mix(bed, reef_col, r_cover);
		relief += r_cover * (heads * 0.42 + (nF.a - 0.5) * 0.1) * (1.0 - smoothstep(0.25, 0.6, fp));
	}
	return bed;
}

// Wave phase: crests sit at whole numbers and march shoreward. A slow drift
// along each coast staggers when they land, so a breaker peels along a beach
// rather than slapping the whole shore at once. t is the surf clock.
float surf_phase(vec2 xz, float tau, float t, sampler2D tex) {
	return (t + tau) * (1.0 / SURF_T) + textureLod(tex, xz * 0.0041 + vec2(0.37, 0.11), 0.0).r * 3.2;
}

// Every breaker its own size: sets of bigger waves roll through, and one
// stretch of beach takes a bigger crest than the next.
float surf_var(vec2 xz, float idx, sampler2D tex) {
	float v = textureLod(tex, xz * 0.0105 + vec2(idx * 0.173, idx * 0.291), 0.0).g;
	float set = sin(idx * 0.83 + 1.3) * sin(idx * 0.31);
	return 0.5 + 0.75 * smoothstep(0.3, 0.72, v) + 0.3 * set;
}

// Height of the breaker over one period: th = fract(phase), the crest at 0/1,
// a long easy back and a short steep face (width wf) leaning toward the beach.
float surf_shape(float th, float wf) {
	float b = max(1.0 - th / (1.0 - wf), 0.0);
	return th < 1.0 - wf ? pow(b, 2.2) : smoothstep(1.0 - wf, 1.0, th);
}

float surf_slope(float th, float wf) {
	if (th < 1.0 - wf) {
		return -2.2 / (1.0 - wf) * pow(max(1.0 - th / (1.0 - wf), 0.0), 1.2);
	}
	float x = (th - 1.0 + wf) / wf;
	return 6.0 * x * (1.0 - x) / wf;
}

// One crest at a spot: x its height (m), y how broken it is (0 a clean
// swell, 1 a tumbling wall of whitewater), z how close it is to breaking
// (the face standing up). It grows as it feels the bottom (Green's law)
// until it is too tall for the depth and spills. a is the breaker height
// out at sea (m), reach the spot's exposure to the swell.
vec3 surf_wave(vec2 xz, float idx, float depth, float reach, float a, sampler2D tex) {
	float a0 = a * surf_var(xz, idx, tex) * reach;
	float a_s = a0 * sqrt(sqrt(clamp(5.0 / max(depth, 0.05), 1.0, 12.0)));
	float cap = 0.42 * depth + 0.015;
	float r = a_s / cap;
	float fade = (1.0 - smoothstep(4.5, 8.0, depth)) * smoothstep(0.04, 0.12, a0);
	return vec3(min(a_s, cap), smoothstep(0.82, 1.12, r), smoothstep(0.5, 0.85, r)) * fade;
}

// The web of sunlight the swell focuses onto the floor, depth (m) down: it
// slides away from the sun with depth, and fades into the deep.
float caustics_at(vec2 xz, float depth, vec3 L, float t, sampler2D tex) {
	vec2 uv = (xz - L.xz / max(L.y, 0.2) * depth * 0.7) * 0.075;
	float c1 = texture(tex, uv + vec2(t * 0.019, t * 0.011)).r;
	float c2 = texture(tex, uv * 1.31 + vec2(-t * 0.014, t * 0.022) + 0.5).r;
	return (min(c1, c2) * 1.6 + c1 * c2 * 1.2) * smoothstep(0.05, 0.9, depth) * exp(-depth * 0.16);
}
