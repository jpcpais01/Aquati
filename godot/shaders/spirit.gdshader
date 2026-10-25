// The souls of fallen pirates (src/fx/spirits.gd): a little green ghost of
// the sailor (his own hat, his build), a round wisp with a curling tail and
// two hollow eyes. The whole performance plays out here from his birth time:
// he pops up, bobs, looks up at you, does his one last thing (waves, twirls,
// tips his hat or shouts "boo!"), then floats off into the sky and fades.
// The web game's fx/spirits.ts.
//
// Per vertex: UV.x the part (0 body, 1-4 the hats by CrewModel.HAT_*, 10 and
// 11 the left and right arm). Per ghost: the instance's origin is where he
// died; COLOR = (seed 0..1, gesture, size, hat), INSTANCE_CUSTOM = (when he
// rises, girth).
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_back, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

uniform float now = 0.0;
/// seconds from the first glimmer to the last mote (Spirits.LIFE)
uniform float life = 4.8;

varying vec3 v_local;
varying vec3 v_world;
varying float v_up;
varying float v_part;
varying float v_fade;
varying float v_mouth;
varying float v_happy;
varying float v_blink;
varying float v_seed;

mat3 rot_y(float a) { float c = cos(a), s = sin(a); return mat3(vec3(c, 0.0, -s), vec3(0.0, 1.0, 0.0), vec3(s, 0.0, c)); }
mat3 rot_x(float a) { float c = cos(a), s = sin(a); return mat3(vec3(1.0, 0.0, 0.0), vec3(0.0, c, s), vec3(0.0, -s, c)); }
mat3 rot_z(float a) { float c = cos(a), s = sin(a); return mat3(vec3(c, s, 0.0), vec3(-s, c, 0.0), vec3(0.0, 0.0, 1.0)); }
float ease3(float x) { return x * x * (3.0 - 2.0 * x); }

void vertex() {
	vec3 spawn = MODEL_MATRIX[3].xyz;
	float age = now - INSTANCE_CUSTOM.x;
	float seed = COLOR.x;
	float gest = COLOR.y;
	float hat = COLOR.w;
	float part = UV.x;
	vec3 pos0 = VERTEX;
	vec3 p = VERTEX;
	vec3 n = NORMAL;
	v_local = pos0;
	v_part = part;
	v_seed = seed;

	// a hat he never wore folds away inside his head
	if (part > 0.5 && part < 9.5 && abs(part - hat) > 0.1) p = vec3(0.0, 1.6, 0.0);

	// ---- the performance
	float k = clamp(age / 0.75, 0.0, 1.0) - 1.0;
	float pop = 1.0 + 2.70158 * k * k * k + 1.70158 * k * k; // easeOutBack: up out of him with a little overshoot
	float asc = max(age - 2.75, 0.0);                        // and away
	float lift = smoothstep(0.0, 0.7, asc);
	float gw = smoothstep(0.85, 1.15, age) * (1.0 - smoothstep(2.35, 2.75, age));
	float is_wave = 1.0 - step(0.5, gest);
	float is_twirl = step(0.5, gest) * (1.0 - step(1.5, gest));
	float is_tip = step(1.5, gest) * (1.0 - step(2.5, gest));
	float is_boo = step(2.5, gest);
	float ph = seed * 37.0;

	// arms float loose, then do the gesture, then trail as he goes
	float rest = 0.32 + 0.14 * sin(age * 2.6 + ph);
	float tip_k = sin(3.14159 * clamp((age - 1.05) / 1.3, 0.0, 1.0));
	float a_r = rest;
	float a_l = rest + 0.08 * sin(age * 2.3 + ph + 1.0);
	a_r = mix(a_r, 2.55 + 0.42 * sin(age * 12.0), gw * is_wave);
	a_l = mix(a_l, rest + 0.2, gw * is_wave);
	a_r = mix(a_r, 1.5 + 0.1 * sin(age * 7.0), gw * is_twirl);
	a_l = mix(a_l, 1.5 + 0.1 * sin(age * 7.0 + 1.5), gw * is_twirl);
	a_r = mix(a_r, 2.85, tip_k * is_tip);
	a_l = mix(a_l, 0.55, tip_k * is_tip);
	a_r = mix(a_r, 2.35 + 0.16 * sin(age * 21.0), gw * is_boo);
	a_l = mix(a_l, 2.35 + 0.16 * sin(age * 21.0 + 2.0), gw * is_boo);
	a_r = mix(a_r, 0.12, lift);
	a_l = mix(a_l, 0.12, lift);
	float reach = 0.25 + 0.35 * gw * (is_wave + is_boo) + 0.5 * tip_k * is_tip - 0.35 * lift;

	if (part > 9.5) {
		float is_r = step(10.5, part);
		float side = is_r * 2.0 - 1.0;
		vec3 piv = vec3(0.29 * side, 1.17, 0.0);
		mat3 A = rot_z(mix(a_l, a_r, is_r) * side) * rot_x(-reach);
		p = piv + A * (p - piv);
		n = A * n;
	}

	// the hat: lifted off and tilted in a salute; bandana tails and the knit cap's sock flutter
	if (part > 0.5 && part < 9.5) {
		vec3 hp = vec3(0.0, 1.82, 0.0);
		mat3 H = rot_x(0.45 * tip_k * is_tip) * rot_z(-0.3 * tip_k * is_tip + 0.06 * sin(age * 3.0 + ph));
		p = hp + H * (p - hp) + vec3(0.06, 0.2, 0.08) * tip_k * is_tip;
		n = H * n;
		if (abs(part - 2.0) < 0.1 && pos0.z < -0.27) {
			float f = clamp((1.76 - pos0.y) * 4.0, 0.0, 1.0);
			p.x += sin(age * 9.0 + pos0.y * 9.0 + ph) * 0.05 * f;
			p.z -= (0.04 + 0.03 * sin(age * 7.0)) * f;
		}
		if (abs(part - 3.0) < 0.1) {
			float q = max(pos0.y - 1.9, 0.0);
			float flop = 1.8 + 0.4 * sin(age * 4.0 + ph);
			p.x += q * q * flop * (seed > 0.5 ? 1.0 : -1.0);
			p.y -= q * q * 0.9;
		}
	}

	// the tail: a slow S that ripples down it, curling off to one side at the tip
	if (part < 0.5 && pos0.y < 1.05) {
		float t = clamp((1.05 - pos0.y) / 1.25, 0.0, 1.0);
		t *= t;
		float wv = age * 3.3 + ph;
		float curl = seed > 0.5 ? 1.0 : -1.0;
		p.x += (sin(wv + pos0.y * 3.5) * 0.17 + curl * 0.24 * t) * t;
		p.z += cos(wv * 0.8 + pos0.y * 2.7) * 0.1 * t - 0.12 * t * (1.0 + lift);
		p.y -= t * (0.15 + asc * 0.45); // drawn out long as he rises
	}

	// his build, a breath, a squash and stretch
	p.xz *= INSTANCE_CUSTOM.y;
	vec3 c = vec3(0.0, 1.0, 0.0);
	vec3 q = p - c;
	float breath = sin(age * 3.1 + ph);
	q.y *= 1.0 + 0.045 * breath + 0.1 * lift + 0.12 * gw * is_boo;
	q.xz *= 1.0 - 0.03 * breath - 0.14 * lift + 0.08 * gw * is_boo;

	vec3 to_cam = CAMERA_POSITION_WORLD - spawn;
	float dist = length(to_cam);
	// small on a wide sea view, true to life up close
	float size = COLOR.z * mix(0.2, 1.0, pop) * clamp(dist / 50.0, 1.0, 2.0);
	q *= size;

	// turned to look up at you; a twirl, a bow with the hat, a lunge for the boo
	float tz = abs(to_cam.z) < 1e-3 ? 1e-3 : to_cam.z;
	float yaw = atan(to_cam.x, tz) + (seed - 0.5) * 0.7 + 6.28318 * ease3(clamp((age - 1.0) / 1.3, 0.0, 1.0)) * is_twirl;
	float elev = atan(to_cam.y, max(length(to_cam.xz), 1e-3));
	float lean = clamp(elev, 0.0, 1.25) * 0.55;
	float bow = 0.28 * tip_k * is_tip + 0.12 * gw * is_boo;
	float roll = sin(age * 1.9 + ph) * 0.1 + sin(age * 0.7 + ph * 2.0) * 0.05;
	mat3 R = rot_y(yaw) * rot_x(bow - lean) * rot_z(roll);

	float rise = -1.2 + 2.55 * pop + asc * asc * 0.55 + asc * 0.9 + 0.1 * sin(age * 2.4 + ph) * (1.0 - lift);
	vec3 drift = vec3(cos(age * 1.6 + ph), 0.0, sin(age * 1.6 + ph)) * asc * 0.35 + vec3(wind.x, 0.0, wind.y) * asc * asc * 0.25;
	vec3 fwd = rot_y(yaw) * vec3(0.0, 0.0, 1.0);
	vec3 off = vec3(0.0, rise, 0.0) + drift + fwd * 0.35 * gw * is_boo + R * q;

	if (age < 0.0 || age > life) {
		// not yet risen, or long gone: folded away to nothing
		off = vec3(0.0, -1000.0, 0.0);
	}
	VERTEX = off;
	vec3 nw = R * n;
	NORMAL = nw;
	v_up = nw.y;
	v_world = spawn + off;

	v_fade = smoothstep(0.0, 0.3, age) * (1.0 - smoothstep(life - 1.6, life, age));
	// a dash of a smile; wide open for the boo; an "ooh" as he goes
	v_mouth = clamp(0.12 + 0.88 * gw * is_boo + 0.3 * lift + 0.25 * (1.0 - smoothstep(0.3, 0.9, age)), 0.0, 1.0);
	v_happy = gw * is_wave + tip_k * is_tip;
	float bl = fract(age * 0.42 + seed * 3.0);
	v_blink = 1.0 - 0.85 * smoothstep(0.0, 0.04, bl) * (1.0 - smoothstep(0.06, 0.1, bl)) * (1.0 - is_boo * gw);
}

void fragment() {
	vec3 N = normalize(NORMAL);
	vec3 V = normalize(VIEW);
	float rim = 1.0 - abs(dot(N, V));
	float rim2 = rim * rim;
	vec3 G = vec3(0.3, 1.0, 0.66);
	// ectoplasm swirling up through him
	vec2 su = v_local.xy * vec2(0.9, 0.5) + vec2(v_seed * 3.7 + v_local.z * 0.4, -now * 0.21);
	float sw = texture(cloud_noise, su * 0.25).r * 0.6 + texture(cloud_noise, su * 0.47 + vec2(-now * 0.01, -now * 0.075)).g * 0.4;
	float body = v_part < 0.5 ? 1.0 : 0.0;
	float hatk = v_part > 0.5 && v_part < 9.5 ? 1.0 : 0.0;
	float a = 0.1 + rim2 * 0.7 + (sw - 0.5) * 0.3 + hatk * 0.2;
	// lit from above like a lantern held over him: bright crown, cool underside
	vec3 col = mix(vec3(0.6, 1.0, 0.82), G * 0.8, rim * 0.9) * (0.6 + 0.4 * clamp(v_up * 0.5 + 0.5, 0.0, 1.0));
	col = mix(col, vec3(0.2, 0.62, 0.5), hatk * 0.6);
	col += G * smoothstep(0.62, 0.9, sw) * 0.35;
	// the tail thins to nothing
	a *= body > 0.5 ? smoothstep(-0.2, 0.55, v_local.y) : 1.0;

	// the face: two hollow eyes with a glint (happy crescents for a wave or a bow) and a little mouth
	float face = 0.0;
	float glint = 0.0;
	if (body > 0.5 && v_local.z > 0.06 && v_local.y > 1.38) {
		vec2 e = vec2(abs(v_local.x), v_local.y) - vec2(0.105, 1.655);
		float d = length(e / vec2(0.05, 0.07 * v_blink));
		float oval = 1.0 - smoothstep(0.82, 1.0, d);
		float rd = abs(length((e + vec2(0.0, 0.035)) / 0.055) - 0.8);
		float cres = (1.0 - smoothstep(0.12, 0.24, rd)) * step(-0.035, e.y);
		face = mix(oval, cres, v_happy);
		glint = (1.0 - smoothstep(0.0, 0.016, length(e - vec2(0.018, 0.026)))) * (1.0 - v_happy) * step(0.5, v_blink);
		vec2 m = vec2(v_local.x, v_local.y - 1.5);
		m.y -= 5.0 * m.x * m.x * (1.0 - v_mouth); // corners up in a smile
		float mo = length(m / vec2(0.045 + 0.02 * v_mouth, 0.011 + 0.058 * v_mouth));
		face = max(face, 1.0 - smoothstep(0.8, 1.0, mo));
	}
	col = mix(col, vec3(0.01, 0.06, 0.045), face);
	a = mix(a, 0.92, face);
	col = mix(col, vec3(1.6, 2.0, 1.85), glint);
	a = max(a, glint);

	// glows by itself, but sits in the scene's light: dimmer at dusk, never blinding at night
	float lum = dot(light_tint, vec3(0.3, 0.55, 0.15));
	vec3 lit = mix(vec3(1.0), light_tint, 0.7) + 0.14;
	vec3 glow = G * (0.18 + rim2 * 2.0 + rim2 * rim2 * 2.4) * (0.45 + 0.55 * clamp(lum, 0.0, 1.0)) * (1.0 + night * 0.6) * (1.0 - face);
	col *= lit;

	vec4 fog = air_fog(v_world, CAMERA_POSITION_WORLD);
	float fk = fog.a * 0.8;
	col = mix(col, fog.rgb, fk);
	glow *= 1.0 - fk;

	a = clamp(a, 0.0, 1.0) * v_fade;
	glow *= v_fade;
	if (a < 0.003) discard;
	ALBEDO = col * a + glow;
	ALPHA = a;
}
