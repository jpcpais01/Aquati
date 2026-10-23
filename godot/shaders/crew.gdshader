// Every sailor on the sea (see CrewModel and CrewView): one instanced mesh
// per piece of kit, posed here on the GPU. Each instance carries only its
// placement and which row of crew_pose is his this frame: six vec4 of joint
// angles and expressions, then his palette row, hat, held prop and kit flags.
// The vertex rides one or two bones down the chain (fingers and face bones
// first, in their own frames), so the skin bends as one at the shoulders,
// elbows, waist, knees and neck; the face blinks, glances, talks and grins,
// every face a little different by the sailor's seed; bellies breathe, cloth
// and hair stir in the breeze, and the captain's parrot looks about. The
// fragment paints the seams between shirt, trousers and skin crisply, stripes
// and spots, cheeks, irises, knit and straw, creases the cloth with a bump of
// folds that fades out once finer than a pixel, and lights the little figures
// with a sky-lit rim so they read against the deck. The web game's crew
// material (src/ships/crewModel.ts), from its GLSL.
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/crew_rig.gdshaderinc"
#include "res://shaders/inc/lit.gdshaderinc"

/// per sailor drawn this frame: 8 texels (six of pose, then palette row, hat, prop, kit flags)
uniform highp sampler2D crew_pose : filter_nearest, repeat_disable;
/// per sailor aboard: 30 palette slots (linear rgb; a > 0 glows that much, a < 0 stripes at -a per metre)
uniform highp sampler2D crew_palette : filter_nearest, repeat_disable;

varying vec3 v_col;
varying vec3 v_b;
varying vec3 v_c;
varying vec3 v_stripe;
varying vec3 v_rest;
varying vec3 v_world;
// part, stripe frequency, glow, tint + 64 x the shoulder's stripe frequency
varying flat vec4 v_info;
// which stretches of the limbs are cloth (and crease) rather than bare skin
varying flat vec3 v_cloth;

struct Pose {
	vec4 a; // spine x y z, head x
	vec4 b; // head y, left arm x z, left elbow
	vec4 c; // right arm x z, right elbow, left leg
	vec4 d; // left knee, right leg, right knee, lift
	vec4 e; // head z, left hand, right hand, jaw
	vec4 f; // brow, gaze x y, smile
	vec4 st; // palette row, hat, prop, kit flags
};

vec3 rot_x(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
vec3 rot_y(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 rot_z(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
float crew_hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float sq(float x) { return x * x; }

bool crew_shown(float g, vec4 st) {
	int gi = int(g + 0.5);
	if (gi == 0) return true;
	if (gi < 10) return gi == int(st.y + 0.5);
	int fl = int(st.w + 0.5);
	if (gi >= 3000) { int a = (gi - 3000) / 32; int b = gi - 3000 - a * 32; return (fl & (1 << a)) != 0 && (fl & (1 << b)) == 0; }
	if (gi >= 1000) { int a = (gi - 1000) / 32; int b = gi - 1000 - a * 32; return (fl & ((1 << a) | (1 << b))) == 0; }
	if (gi >= 50) return gi == int(st.z + 0.5);
	if (gi < 30) return (fl & (1 << (gi - 10))) != 0;
	return (fl & (1 << (gi - 30))) == 0;
}

// how far shut the eyes are right now (0 open .. 1 closed)
float crew_blink(vec4 st) {
	float seed = st.x * 0.6180339;
	float ph = fract(TIME * (0.24 + fract(seed * 7.0) * 0.1) + seed);
	float b = smoothstep(0.0, 0.018, ph) * (1.0 - smoothstep(0.03, 0.06, ph));
	// now and then a double blink
	float ph2 = fract(ph + 0.075);
	return max(b, step(0.6, fract(seed * 3.7)) * smoothstep(0.0, 0.018, ph2) * (1.0 - smoothstep(0.03, 0.06, ph2)));
}

// The small bones move in their own frame, then hand over to the limb they ride.
void crew_local(inout int b, inout vec3 p, inout vec3 n, int part, Pose P) {
	if (b == 11 || b == 12) {
		// fingers curl toward the palm: the middle joint, then the knuckles
		bool L = b == 11;
		float curl = L ? P.e.y : P.e.z;
		float sgn = L ? -1.0 : 1.0;
		float hx = L ? CREW_HX : -CREW_HX;
		if (p.y < CREW_FM_Y) {
			vec3 mj = vec3(hx + sgn * 0.004, CREW_FM_Y, 0.0);
			float a2 = sgn * curl * 1.5;
			p = mj + rot_z(p - mj, a2);
			n = rot_z(n, a2);
		}
		vec3 kj = vec3(hx, CREW_KN_Y, 0.0);
		float a1 = sgn * (curl * 1.3 + 0.12);
		p = kj + rot_z(p - kj, a1);
		n = rot_z(n, a1);
		b = L ? 4 : 6;
		return;
	}
	if (b < 13) return;
	float open = clamp(P.e.w, 0.0, 1.0);
	float brow = P.f.x;
	if (b == 13) {
		// the jaw drops as the mouth opens
		float a = open * 0.16;
		p = CREW_JAW + rot_x(p - CREW_JAW, a);
		n = rot_x(n, a);
	} else if (b == 14) {
		// raised in surprise, knitted down at the middle in anger
		float inner = 1.0 - smoothstep(0.03, 0.08, abs(p.x));
		p.y += brow > 0.0 ? brow * 0.011 : brow * (0.002 + 0.011 * inner);
		p.z += min(brow, 0.0) * 0.004 * inner;
	} else if (b == 15) {
		// upper lids: rest a little lowered, squint when cross, fly open when startled, blink
		float rest = -0.6 + max(-brow, 0.0) * 0.28 - max(brow, 0.0) * 0.28;
		float a = mix(rest, 0.62, crew_blink(P.st));
		vec3 e = vec3(sign(p.x) * CREW_EYE.x, CREW_EYE.y, CREW_EYE.z);
		p = e + rot_x(p - e, a);
		n = rot_x(n, a);
	} else if (b == 16) {
		float gx = P.f.y;
		float gy = P.f.z;
		// little saccades: the eyes flick to a new spot every second or two
		float seed = P.st.x * 0.7548;
		float slot = floor(TIME * (0.55 + fract(seed * 5.0) * 0.4) + seed * 9.0);
		gx += (crew_hash(slot + seed) - 0.5) * 0.5;
		gy += (crew_hash(slot * 1.7 + seed) - 0.5) * 0.25;
		vec3 e = vec3(sign(p.x) * CREW_EYE.x, CREW_EYE.y, CREW_EYE.z);
		float ax = -clamp(gy, -0.5, 0.5);
		float ay = clamp(gx, -0.6, 0.6);
		p = e + rot_y(rot_x(p - e, ax), ay);
		n = rot_y(rot_x(n, ax), ay);
	} else if (b == 17) {
		// the mouth: a thin line at rest, a wide "O" when shouting; corners lift into a grin
		float smile = P.f.w;
		vec3 m = CREW_MOUTH;
		float k = part == PART_TEETH ? open : mix(0.24, 1.0, open);
		p.y = m.y + (p.y - m.y) * k;
		if (part == PART_TEETH) p.z -= (1.0 - open) * 0.01;
		float dx = (p.x - m.x) / 0.034;
		p.x = m.x + (p.x - m.x) * mix(1.0, 0.82, open);
		p.y += smile * (0.011 * dx * dx - 0.004) * (1.0 - 0.5 * open);
		if (p.y < m.y) p.y -= open * 0.004;
	}
	b = 2;
}

// Forward kinematics, leaf to root, on both the position and its normal.
vec3 crew_fk(int b, vec3 p, inout vec3 n, int part, Pose P) {
	crew_local(b, p, n, part, P);
	if (b == 4 || b == 6) {
		bool L = b == 4;
		float e = L ? P.b.w : P.c.z;
		vec3 pv = vec3(L ? CREW_SH_X : -CREW_SH_X, CREW_EL_Y, 0.0);
		p = pv + rot_x(p - pv, -e);
		n = rot_x(n, -e);
	}
	if (b >= 3 && b <= 6) {
		bool L = b <= 4;
		float sx = L ? P.b.y : P.c.x;
		float sz = L ? P.b.z : -P.c.y;
		vec3 pv = vec3(L ? CREW_SH_X : -CREW_SH_X, CREW_SH_Y, 0.0);
		p = pv + rot_z(rot_x(p - pv, -sx), sz);
		n = rot_z(rot_x(n, -sx), sz);
	}
	if (b == 2) {
		vec3 pv = vec3(0.0, CREW_NECK.y, 0.0);
		p = pv + rot_y(rot_x(rot_z(p - pv, P.e.x), P.a.w), P.b.x);
		n = rot_y(rot_x(rot_z(n, P.e.x), P.a.w), P.b.x);
	}
	if (b >= 1 && b <= 6) {
		vec3 pv = vec3(0.0, CREW_SPINE.y, 0.0);
		p = pv + rot_y(rot_z(rot_x(p - pv, P.a.x), P.a.z), P.a.y);
		n = rot_y(rot_z(rot_x(n, P.a.x), P.a.z), P.a.y);
	}
	if (b == 8 || b == 10) {
		bool L = b == 8;
		float k = L ? P.d.x : P.d.z;
		vec3 pv = vec3(L ? CREW_HIP_X : -CREW_HIP_X, CREW_KNEE_Y, 0.0);
		p = pv + rot_x(p - pv, k);
		n = rot_x(n, k);
	}
	if (b >= 7 && b <= 10) {
		bool L = b <= 8;
		float a = L ? P.c.w : P.d.y;
		vec3 pv = vec3(L ? CREW_HIP_X : -CREW_HIP_X, CREW_HIP_Y, 0.0);
		p = pv + rot_x(p - pv, -a);
		n = rot_x(n, -a);
	}
	return p;
}

void crew_deform(inout vec3 p, inout vec3 n, vec4 rig, int part, float flex, Pose P) {
	if (!crew_shown(rig.z, P.st)) {
		p = vec3(0.0);
		return;
	}
	int ba = int(rig.x + 0.5);
	float bw = fract(rig.w);
	int bb = int(floor(rig.w) + 0.5);
	float seed = P.st.x * 0.6180339 + 0.37;
	// every face a little different: nose, ears, jaw, beard and belly from the sailor's seed
	if (part == PART_NOSE) {
		float k = 0.82 + 0.5 * crew_hash(seed * 1.31);
		p = CREW_NOSE + (p - CREW_NOSE) * vec3(k, mix(1.0, k, 0.7), k);
	} else if (part == PART_EAR) {
		float k = 0.85 + 0.35 * crew_hash(seed * 2.17);
		vec3 r = vec3(sign(p.x) * (CREW_EAR.x - 0.01), CREW_EAR.y, CREW_EAR.z);
		p = r + (p - r) * k;
	} else if (part == PART_BEARD) {
		float k = 0.6 + 1.1 * crew_hash(seed * 3.71);
		if (p.y < CREW_CHIN_Y) p.y = CREW_CHIN_Y + (p.y - CREW_CHIN_Y) * k;
	}
	if (ba == 2 || ba >= 13) {
		float jaw = (crew_hash(seed * 4.33) - 0.5) * 0.2;
		p.x *= 1.0 + jaw * smoothstep(CREW_EYE.y, CREW_CHIN_Y, p.y);
	}
	if (ba <= 1) {
		// a belly on some, and the slow rise and fall of breathing
		float belly = max(0.0, crew_hash(seed * 5.9) - 0.5) * 2.0;
		float bz = smoothstep(-0.02, 0.09, p.z) * exp(-sq((p.y - 1.03) / 0.13));
		p.z += belly * 0.045 * bz;
		p.x *= 1.0 + belly * 0.1 * exp(-sq((p.y - 1.0) / 0.15));
		float br = sin(TIME * (1.4 + fract(seed * 3.0) * 0.5) + seed * 20.0);
		float w = exp(-sq((p.y - 1.24) / 0.12));
		p.z += br * 0.006 * w * smoothstep(-0.05, 0.08, p.z);
		p.x *= 1.0 + br * 0.008 * w;
	}
	// cloth and hair stirring in the breeze
	if (flex > 0.0) {
		float t = TIME * 2.2 + seed * 17.0;
		p.x += flex * 0.012 * sin(t + p.y * 9.0);
		p.z += flex * 0.014 * sin(t * 1.3 + p.y * 7.0 + 1.3) - flex * 0.006;
	}
	// the parrot looks about, bobs, and every so often flaps its wings
	if (part == PART_WING || part == PART_PARROT_HEAD || part == PART_PARROT) {
		vec3 pc = CREW_PARROT;
		float t = TIME + seed * 13.0;
		if (part == PART_WING) {
			float burst = step(fract(t * 0.11), 0.06);
			float side = sign(p.x - pc.x);
			float a = burst * (0.6 + 0.6 * sin(t * 34.0)) * side;
			vec3 hinge = pc + vec3(side * 0.03, 0.07, 0.0);
			p = hinge + rot_z(p - hinge, a);
			n = rot_z(n, a);
		}
		if (part == PART_PARROT_HEAD) {
			vec3 neck = pc + vec3(0.0, 0.09, 0.0);
			float yaw = sin(t * 0.7) * 0.7 + sin(t * 1.9) * 0.25;
			float nod = max(0.0, sin(t * 2.3)) * 0.25 * step(0.5, fract(t * 0.21));
			float tilt = sin(t * 0.43) * 0.3;
			p = neck + rot_y(rot_x(rot_z(p - neck, tilt), nod), yaw);
			n = rot_y(rot_x(rot_z(n, tilt), nod), yaw);
		}
		p.y += abs(sin(t * 1.3)) * 0.005;
	}
	vec3 na = n;
	vec3 pa = crew_fk(ba, p, na, part, P);
	if (bw > 0.001) {
		vec3 nb = n;
		vec3 pb = crew_fk(bb, p, nb, part, P);
		pa = mix(pa, pb, bw);
		na = normalize(mix(na, nb, bw));
	}
	p = pa;
	n = na;
	p.y += P.d.w;
}

vec3 slot(int tint, int row) {
	return texelFetch(crew_palette, ivec2(tint, row), 0).rgb;
}

void vertex() {
	int k = int(INSTANCE_CUSTOM.x + 0.5);
	Pose P;
	P.a = texelFetch(crew_pose, ivec2(0, k), 0);
	P.b = texelFetch(crew_pose, ivec2(1, k), 0);
	P.c = texelFetch(crew_pose, ivec2(2, k), 0);
	P.d = texelFetch(crew_pose, ivec2(3, k), 0);
	P.e = texelFetch(crew_pose, ivec2(4, k), 0);
	P.f = texelFetch(crew_pose, ivec2(5, k), 0);
	P.st = texelFetch(crew_pose, ivec2(6, k), 0);
	vec4 rig = CUSTOM0;
	int part = int(CUSTOM1.g * 255.0 + 0.5);
	float ao = CUSTOM1.r * CREW_AO_MAX;
	v_rest = VERTEX;
	vec3 p = VERTEX;
	vec3 n = NORMAL;
	crew_deform(p, n, rig, part, CUSTOM1.b, P);
	VERTEX = p;
	NORMAL = n;
	v_world = (MODEL_MATRIX * vec4(p, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);

	int row = int(P.st.x + 0.5);
	int tint = int(rig.y + 0.5);
	vec4 pal = texelFetch(crew_palette, ivec2(tint, row), 0);
	v_col = pal.rgb * ao;
	v_stripe = slot(TINT_STRIPE, row) * ao;
	// second and third colours for the painted seams
	vec3 b = pal.rgb;
	vec3 c = pal.rgb;
	if (part == PART_TORSO) {
		b = slot(TINT_TROUSERS, row);
		c = slot(TINT_SKIN, row);
	} else if (part == PART_ARM) {
		b = slot(TINT_FOREARM, row);
		c = slot(TINT_SHIRT, row);
	} else if (part == PART_LEG) {
		b = slot(TINT_SHIN, row);
	}
	v_b = b * ao;
	v_c = c * ao;
	float c_pat = part == PART_ARM ? max(-texelFetch(crew_palette, ivec2(TINT_SHIRT, row), 0).a, 0.0) : 0.0;
	v_info = vec4(float(part), max(-pal.a, 0.0), max(pal.a, 0.0), float(tint) + 64.0 * floor(c_pat + 0.5));
	vec3 sk = slot(TINT_SKIN, row);
	v_cloth = vec3(
			step(0.002, distance(slot(TINT_SLEEVE, row), sk)),
			step(0.002, distance(slot(TINT_FOREARM, row), sk)),
			step(0.002, distance(slot(TINT_SHIN, row), sk)));
}

// An antialiased step at d = 0, for a field changing by fw per pixel.
float crew_edge(float d, float fw) {
	float w = fw * 0.75 + 1e-4;
	return smoothstep(-w, w, d);
}

float crew_noise(vec3 p) {
	return sin(p.x * 1.7 + sin(p.y * 2.3 + p.z * 1.1)) * sin(p.y * 1.3 + sin(p.z * 2.9 + p.x * 0.7));
}

// Folds in the cloth, as a height (metres) over the rest pose: the shirt bloused over the sash,
// pull lines from the armpits, creases at the elbows and behind the knees, the drape of the
// trousers and their gathered hems, pleats in a captain's coat skirts.
float crew_folds(vec3 p, int part, int tint, vec3 cloth3) {
	float h = 0.0;
	float ang = atan(p.x, p.z);
	float wob = crew_noise(p * 31.0);
	if (part == PART_TORSO) {
		if (p.y > 0.955) {
			float blouse = smoothstep(0.955, 1.0, p.y) * smoothstep(1.2, 1.03, p.y);
			h += blouse * 0.0042 * sin(ang * 9.0 + wob * 1.4);
			float pit = exp(-sq((p.y - 1.29) / 0.075)) * smoothstep(0.07, 0.15, abs(p.x));
			h += pit * 0.0026 * sin((abs(p.x) * 0.8 - p.y) * 85.0 + wob);
		} else {
			h += 0.0022 * sin(ang * 13.0 + wob) * smoothstep(0.86, 0.94, p.y);
		}
	} else if (part == PART_ARM) {
		float ax = sign(p.x) * mix(CREW_HX, CREW_SH_X, smoothstep(0.9, 1.4, p.y));
		float a = atan(p.z, p.x - ax);
		float cloth = p.y > 1.3 ? 1.0 : p.y > CREW_EL_Y - 0.03 ? cloth3.x : cloth3.y;
		float elb = exp(-sq((p.y - CREW_EL_Y) / 0.065));
		h += elb * 0.0042 * sin(p.y * 150.0 + sin(a * 2.0 + wob) * 1.6);
		h += 0.0022 * sin(a * 3.0 + p.y * 28.0 + wob) * smoothstep(1.42, 1.22, p.y) * smoothstep(1.13, 1.2, p.y);
		h += 0.002 * smoothstep(1.0, 0.94, p.y) * sin(p.y * 190.0 + a) * cloth3.y;
		h *= cloth;
	} else if (part == PART_LEG) {
		float lx = sign(p.x) * CREW_HIP_X;
		float a = atan(p.z, p.x - lx);
		float cloth = p.y > CREW_KNEE_Y - 0.045 ? 1.0 : cloth3.z;
		float knee = exp(-sq((p.y - CREW_KNEE_Y) / 0.075));
		h += knee * 0.0038 * sin(p.y * 115.0 + sin(a * 1.5) * 2.0 + wob);
		h += 0.0028 * sin(a * 4.0 + p.y * 7.0 + wob * 0.8) * smoothstep(0.95, 0.55, p.y);
		h += 0.0024 * smoothstep(0.26, 0.12, p.y) * sin(a * 7.0 + p.y * 40.0);
		// the crotch pulls into a few short diagonals
		h += 0.002 * exp(-sq((p.y - 0.84) / 0.05)) * sin((p.y + abs(p.x - lx)) * 120.0);
		h *= cloth;
	} else if (tint == TINT_COAT && p.y < 0.99) {
		h += 0.0055 * sin(ang * 11.0 + wob * 0.5) * smoothstep(0.98, 0.7, p.y);
	} else if (tint == TINT_VEST || tint == TINT_COAT) {
		h += 0.0018 * sin(ang * 7.0 + p.y * 30.0 + wob);
	}
	return h;
}

void fragment() {
	// every derivative up front, in uniform control flow
	vec3 p = v_rest;
	vec3 dpx = dFdx(p);
	vec3 dpy = dFdy(p);
	vec3 fw = abs(dpx) + abs(dpy);
	vec3 sx = dFdx(VERTEX);
	vec3 sy = dFdy(VERTEX);
	// how far round (radians) a pixel spans on the round parts
	float fw_ang = length(fw.xz) / max(length(p.xz), 0.03);

	int part = int(v_info.x + 0.5);
	int tint = int(mod(v_info.w + 0.5, 64.0));
	float c_pat = floor((v_info.w + 0.5) / 64.0);
	vec3 col = v_col;
	if (v_info.y > 0.0) {
		if (part == PART_BANDANA) {
			// polka dots
			vec2 q = vec2(atan(p.x, p.z) * 4.0, p.y * 34.0);
			vec2 cell = fract(q) - 0.5;
			col = mix(col, v_stripe, crew_edge(0.2 - length(cell), max(4.0 * fw_ang, 34.0 * fw.y)));
		} else {
			float st = abs(fract(p.y * v_info.y) - 0.5) * 2.0;
			col = mix(col, v_stripe, crew_edge(st - 0.5, 2.0 * v_info.y * fw.y));
		}
	}
	if (part == PART_TORSO) {
		// trousers below the sash, skin in the open V of the collar
		col = mix(col, v_b, crew_edge(0.955 - p.y, fw.y));
		float vee = 0.008 + (p.y - 1.33) * 0.45;
		col = mix(col, v_c, crew_edge(vee - abs(p.x), fw.x + 0.45 * fw.y) * crew_edge(p.z, fw.z) * crew_edge(p.y - 1.33, fw.y));
	} else if (part == PART_ARM) {
		// the shirt shoulder, the sleeve, then the forearm below the elbow
		col = mix(col, v_b, crew_edge(CREW_EL_Y - 0.03 - p.y, fw.y));
		vec3 shoulder = v_c;
		if (c_pat > 0.0) shoulder = mix(shoulder, v_stripe, crew_edge(abs(fract(p.y * c_pat) - 0.5) * 2.0 - 0.5, 2.0 * c_pat * fw.y));
		col = mix(col, shoulder, crew_edge(p.y - 1.3, fw.y));
	} else if (part == PART_LEG) {
		col = mix(col, v_b, crew_edge(CREW_KNEE_Y - 0.045 - p.y, fw.y));
	} else if (part == PART_FACE) {
		// rosy cheeks
		float bl = exp(-sq(length(vec2(abs(p.x) - 0.079, p.y - (CREW_EYE.y - 0.05))) / 0.031)) * step(0.0, p.z);
		col = mix(col, col * vec3(1.08, 0.78, 0.74), bl * 0.55);
	} else if (part == PART_IRIS) {
		// a darker limbal ring and light spokes in the iris
		vec3 e = vec3(sign(p.x) * CREW_EYE.x, CREW_EYE.y, CREW_EYE.z);
		vec3 d = normalize(p - e);
		float r = length(d.xy - vec2(sign(p.x) * 0.06, 0.0)) / 0.6;
		float ang = atan(d.y, d.x - sign(p.x) * 0.06);
		col *= mix(1.25, 0.55, smoothstep(0.55, 1.0, r)) * (0.92 + 0.12 * sin(ang * 14.0));
	} else if (part == PART_KNIT) {
		col *= 0.86 + 0.14 * crew_edge(sin(atan(p.x, p.z) * 26.0), 26.0 * fw_ang);
	} else if (part == PART_STRAW) {
		vec2 q = vec2(atan(p.x, p.z) * 18.0, length(p.xz) * 120.0 + p.y * 120.0);
		col *= 0.86 + 0.16 * step(0.5, fract(q.x + step(0.5, fract(q.y)) * 0.5));
	} else if (part == PART_SOLE) {
		col *= 0.9;
	}
	// cloth: folds that fade out once they're finer than a pixel, a little cavity shade in
	// their valleys (that holds on a bit further out), stitched seams and a slightly uneven dye
	float px = length(fw);
	float cav = 1.0 - smoothstep(0.01, 0.035, px);
	float fold_k = 1.0 - smoothstep(0.004, 0.016, px);
	float fold = cav > 0.0 ? crew_folds(p, part, tint, v_cloth) : 0.0;
	col *= 1.0 - clamp(-fold * 55.0, 0.0, 0.16) * cav;
	if (part == PART_LEG && (p.y > CREW_KNEE_Y - 0.045 || v_cloth.z > 0.5)) {
		// the outside leg seam
		float lx = sign(p.x) * CREW_HIP_X;
		float seam = (1.0 - crew_edge(abs(p.z + 0.002) - 0.0025, fw.z)) * step(0.0, (p.x - lx) * sign(p.x));
		col *= 1.0 - 0.28 * seam;
	}
	if (part == PART_TORSO && p.y > 0.955 && p.y < 1.33) {
		// a placket down the shirt front
		col *= 1.0 - 0.18 * (1.0 - crew_edge(abs(p.x) - 0.003, fw.x)) * step(0.0, p.z);
	}
	if (part == PART_TORSO || part == PART_ARM || part == PART_LEG || tint == TINT_COAT || tint == TINT_VEST || tint == TINT_SASH) {
		col *= 1.0 + 0.045 * crew_noise(p * 9.0);
	}

	vec3 n = NORMAL;
	if (fold_k > 0.001) {
		// screen-space bump from the folds' change over one pixel across and one down
		// (taken per pixel, not per 2x2 quad, so the folds don't come out blocky)
		float hx = (crew_folds(p + dpx, part, tint, v_cloth) - fold) * fold_k;
		float hy = (crew_folds(p + dpy, part, tint, v_cloth) - fold) * fold_k;
		vec3 r1 = cross(sy, n);
		vec3 r2 = cross(n, sx);
		float det = dot(sx, r1);
		n = normalize(abs(det) * n - sign(det) * (hx * r1 + hy * r2));
	}

	float rough = 0.74;
	float metal = 0.0;
	if (tint == TINT_TRIM || tint == TINT_METAL) {
		rough = 0.32;
		metal = tint == TINT_TRIM ? 0.85 : 0.9;
	} else if (tint == TINT_WHITE || tint == TINT_PUPIL || tint == TINT_DARK || tint == TINT_SHINE) {
		rough = part == 0 && tint == TINT_DARK ? 0.55 : 0.12;
	} else if (tint == TINT_LEATHER || tint == TINT_BOOTS) {
		rough = 0.48;
	} else if (tint == TINT_SKIN) {
		rough = 0.62;
	} else if (tint == TINT_MOUTH || tint == TINT_TONGUE) {
		rough = 0.35;
	} else if (tint == TINT_WOOD) {
		rough = 0.66;
	}

	vec3 em = v_col * v_info.z * (tint == TINT_GLOW ? 0.8 + 0.2 * sin(TIME * 23.0 + p.y * 40.0) : 1.0);
	float rim = 1.0 - clamp(dot(n, VIEW), 0.0, 1.0);
	// a soft sky-lit rim so the little figures read crisply against the deck
	em += col * vec3(0.3, 0.34, 0.4) * light_tint * rim * rim * rim;
	// light glowing through skin at the edges
	if (tint == TINT_SKIN) em += col * vec3(0.22, 0.07, 0.04) * light_tint * (0.35 + rim * rim);
	// a sheen sliding over hair
	if (part == PART_HAIR || part == PART_BEARD) em += col * 0.45 * exp(-sq((n.y - 0.45) / 0.18)) * light_tint;

	ALBEDO = col * wet_dim();
	ROUGHNESS = rough * wet_gloss();
	METALLIC = metal;
	NORMAL = n;
	EMISSION = em;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
