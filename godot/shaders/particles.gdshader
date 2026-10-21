// Spray, puffs and wisps. Each particle is launched once from the CPU (its
// start, velocity, drag, gravity, colours and sizes ride in its MultiMesh
// instance data) and flies on here in closed form, so a burst costs one
// buffer write and nothing at all per frame afterwards.
//
// Instance packing (src/fx/particles.gd):
//   MODEL_MATRIX[3].xyz  start position     MODEL_MATRIX[0].xyz  start velocity
//   MODEL_MATRIX[1].xyz  gravity, drag, kind + fade-in (fraction)
//   MODEL_MATRIX[2].xyz  the breeze it rides (x, z), end colour packed 8:8:8
//   COLOR                start colour (HDR) and opacity
//   INSTANCE_CUSTOM      birth time, life, start size, end size
// Kinds: 0 a soft droplet or glow, 1 smoke.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

/// The particles' own clock (s), which particles.gd keeps from growing large.
uniform float now = 0.0;
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;

varying vec4 v_col;
varying vec2 v_uv;
varying vec2 v_nuv;
varying vec2 v_uvv;
varying float v_kind;
varying float v_age;
varying float v_seed;
varying vec3 v_world;
varying vec3 v_view;

float hash(float n) {
	return fract(sin(n * 12.9898) * 43758.5453);
}

vec3 unpack_rgb(float p) {
	float q = floor(p + 0.5);
	vec3 c = vec3(floor(q / 65536.0), mod(floor(q / 256.0), 256.0), mod(q, 256.0)) / 255.0;
	return c * c * 16.0;
}

void vertex() {
	vec3 p0 = MODEL_MATRIX[3].xyz;
	vec3 v0 = MODEL_MATRIX[0].xyz;
	float grav = MODEL_MATRIX[1].x;
	float drag = MODEL_MATRIX[1].y;
	float kind = floor(MODEL_MATRIX[1].z);
	float fade_in = max(fract(MODEL_MATRIX[1].z), 1e-3);
	vec2 breeze = MODEL_MATRIX[2].xy;
	float birth = INSTANCE_CUSTOM.x;
	float life = INSTANCE_CUSTOM.y;
	float t = now - birth;
	if (t < 0.0 || t >= life || life <= 0.0) {
		// spent (or not yet born): folded away off screen
		POSITION = vec4(2.0, 2.0, 2.0, 1.0);
	} else {
		float u = t / life;
		// dv/dt = -drag v + g, solved exactly
		vec3 g = vec3(0.0, -grav, 0.0);
		vec3 p;
		vec3 vel;
		if (drag > 1e-3) {
			vec3 vt = g / drag;
			float e = exp(-drag * t);
			p = p0 + vt * t + (v0 - vt) * (1.0 - e) / drag;
			vel = vt + (v0 - vt) * e;
		} else {
			p = p0 + v0 * t + 0.5 * g * t * t;
			vel = v0 + g * t;
		}
		float seed = hash(float(INSTANCE_ID) * 0.618 + 0.17);
		float rot = seed * TAU;
		if (kind > 0.5) {
			// smoke rides the breeze once its own push dies away, with a lazy curl
			float ride = t < 0.6667 ? 0.75 * t * t : t - 0.3333;
			p.xz += breeze * ride;
			float ph = rot * 3.1;
			p.x += (cos(ph) - cos(ph + 0.9 * t)) * 0.278;
			p.z += (sin(1.3 * (ph + 0.9 * t)) - sin(1.3 * ph)) * 0.214;
			vel.xz += breeze * min(1.0, t * 1.5);
			rot += (hash(seed * 7.1) - 0.5) * 0.6 * t;
		}
		float size = mix(INSTANCE_CUSTOM.z, INSTANCE_CUSTOM.w, sqrt(u));
		float fin = min(1.0, t / fade_in);
		v_col = vec4(mix(COLOR.rgb, unpack_rgb(MODEL_MATRIX[2].z), u), COLOR.a * fin * (1.0 - u * u));
		v_kind = kind;
		v_age = u;
		v_seed = seed;
		v_world = p;
		vec4 mv = VIEW_MATRIX * vec4(p, 1.0);
		vec2 q = VERTEX.xy * size;
		float c = cos(rot);
		float s = sin(rot);
		vec2 qr;
		if (kind > 0.5) {
			// smoke shears out along its motion on screen: a jet streams, a drift smears downwind
			vec2 v2 = (VIEW_MATRIX * vec4(vel, 0.0)).xy;
			float sp = length(v2);
			vec2 ax = sp > 1e-3 ? v2 / sp : vec2(1.0, 0.0);
			float st = 1.0 + min(sp * 0.16, 1.5);
			vec2 sq = vec2(q.x * st, q.y / sqrt(st));
			qr = ax * sq.x + vec2(-ax.y, ax.x) * sq.y;
			vec2 w = VERTEX.xy * 2.0;
			v_nuv = vec2(c * w.x - s * w.y, s * w.x + c * w.y) * vec2(1.0, 1.0 + (st - 1.0) * 0.6) - vec2(u * 0.35 * st, 0.0);
		} else {
			qr = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
			v_nuv = VERTEX.xy * 2.0;
		}
		v_uvv = qr / max(size, 1e-4) * 2.0;
		v_uv = VERTEX.xy * 2.0;
		mv.xy += qr;
		v_view = mv.xyz;
		POSITION = PROJECTION_MATRIX * mv;
	}
}

void fragment() {
	float r = length(v_uv);
	if (r > 1.0 || v_col.a < 0.002) {
		discard;
	}
	float a;
	vec3 lit = light_tint;
	if (v_kind < 0.5) {
		a = pow(1.0 - r, 1.6);
	} else {
		// smoke, not a ball: warped noise eroded by age into torn wisps. Young
		// smoke is dense and billowy, old smoke thins into curling strands.
		float fall = 1.0 - smoothstep(0.1, 1.0, r);
		if (fall * 2.3 <= 0.32 + v_age * 0.38) {
			discard;
		}
		vec2 drift = vec2(now * 0.021, -now * 0.014);
		vec2 base = v_nuv * 0.2 + vec2(v_seed * 3.1, v_seed * 5.3);
		vec2 warp = texture(noise_tex, base * 0.6 + drift).rg - 0.5;
		vec2 wuv = base + warp * (0.28 + v_age * 0.35);
		float n1 = texture(noise_tex, wuv).g;
		float n2 = texture(noise_tex, wuv * 2.4 - drift * 1.7).a;
		float cell = 1.0 - texture(noise_tex, wuv * 1.3 + drift).b;
		float fbm = n1 * 0.6 + n2 * 0.4;
		float billow = mix(cell * 0.55 + fbm * 0.45, fbm, smoothstep(0.0, 0.45, v_age));
		billow = clamp((billow - 0.5) * 2.4 + 0.5, 0.0, 1.0);
		float ridge = clamp(1.0 - abs(n2 - 0.5) * 5.0, 0.0, 1.0);
		float dens = billow * fall * 2.3 - (0.32 + v_age * 0.38);
		a = smoothstep(0.0, 0.3 + (1.0 - v_age) * 0.25, dens);
		a *= mix(1.0, 0.35 + ridge * 0.9, v_age * 0.8);
		float thick = clamp(dens * 2.2, 0.0, 1.0);
		// a soft normal from the noise relief, with a little of the dome so it still turns to the light
		vec3 nrm = normalize(vec3(v_uvv * 0.35 + (vec2(n1, cell) - 0.5) * 1.6, 0.75));
		vec3 sun_v = normalize((VIEW_MATRIX * vec4(sun_dir, 0.0)).xyz);
		float wrap = clamp(dot(nrm, sun_v) * 0.55 + 0.45, 0.0, 1.0);
		float shade = 1.0 - (1.0 - wrap) * (0.5 - v_age * 0.25);
		shade *= 1.0 - thick * (0.3 - v_age * 0.2);
		float open = 1.0 - weather.x * 0.65;
		vec3 sun = sun_color * 0.15 * wrap * open;
		// a silver lining: thin edges glow when you look toward the light
		vec3 view_dir = normalize(v_view);
		float back = max(dot(-view_dir, -sun_v), 0.0);
		float fwd = back * back;
		fwd *= fwd;
		vec3 rim = sun_color * haze * (fwd * 0.6 * (1.0 - thick * 0.8)) * open;
		float sky = 0.84 + nrm.y * 0.16;
		lit = lit * (0.68 * shade * sky) + sun + rim;
	}
	a *= v_col.a;
	if (a < 0.003) {
		discard;
	}
	// lit by the sky: warm at sunset, dim blue at night, sunk into the haze far off
	vec3 col = v_col.rgb * lit;
	vec4 fog = air_fog(v_world, CAMERA_POSITION_WORLD);
	col = mix(col, fog.rgb, fog.a);
	ALBEDO = col * a;
	ALPHA = a;
}
