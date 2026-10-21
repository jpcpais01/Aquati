// One step of the wake field (see src/world/wake.gd).
//   R  foam density: ships and splashes paint it, it diffuses and fades, and
//      breaking wake crests feed it, so foam lines peel off along the V-arms.
//   G  wake height and B vertical velocity: a damped 2D wave equation stepped
//      semi-implicitly (velocity, then height). Hulls push a moving pressure
//      pattern into it and the simulation itself grows the bow and stern
//      V-waves, the transverse swell behind and the rings round a splash.
//      Waves slow in the shallows and stop at the beach.
shader_type canvas_item;
render_mode blend_disabled, unshaded;

uniform sampler2D prev : filter_linear, repeat_disable;
uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
uniform sampler2D seabed_tex : filter_linear, repeat_disable;
uniform vec4 seabed_rect = vec4(-1000.0, -1000.0, 2000.0, 0.0005);
uniform float has_seabed = 0.0;
/// centre x, z, size, 1/size of the field this step
uniform vec4 rect;
/// the canvas scrolled this far since the last step (uv)
uniform vec2 shift;
uniform float texel = 0.001953125;
uniform float dt = 0.0166;
uniform float k = 0.0;
uniform float vel_damp = 1.0;
uniform float foam_decay = 0.98;
uniform float foam_gain = 0.0;
uniform float sim_time = 0.0;
/// 1 while a fresh canvas is cleared to still water
uniform float wipe = 0.0;

const float HEIGHT_DECAY = 0.12;
const float MAX_HEIGHT = 2.5;
const float MAX_VEL = 16.0;
const float MAX_FOAM = 3.0;

// Anything that isn't a sane finite number reads as still water: one bad
// texel would otherwise leak into its neighbours every step and grow into a
// diamond of maxed-out foam across the whole canvas.
float fin(float x) {
	return abs(x) < 1000.0 ? x : 0.0;
}

vec4 tap(vec2 uv) {
	vec4 c = texture(prev, uv);
	c = vec4(fin(c.r), fin(c.g), fin(c.b), 0.0);
	return c * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
}

void fragment() {
	vec2 uv = UV + shift;
	float t = texel;
	vec4 c = tap(uv);
	vec4 e = tap(uv + vec2(t, 0.0));
	vec4 w = tap(uv - vec2(t, 0.0));
	vec4 n = tap(uv + vec2(0.0, t));
	vec4 s = tap(uv - vec2(0.0, t));

	// water depth here: waves slow in the shallows and die on the sand
	vec2 world = rect.xy + (UV - 0.5) * rect.z;
	float depth = 100.0;
	if (has_seabed > 0.5) {
		depth = -texture(seabed_tex, (world - seabed_rect.xy) * seabed_rect.w).r;
	}
	float speed2 = clamp(depth / 6.0, 0.04, 1.0);
	// turbulence: wave speed wanders patch to patch, so crests bend and kink
	// instead of running dead straight, and foam drifts with slow eddies
	vec4 tn = texture(noise_tex, world * 0.021 + vec2(sim_time * 0.011, -sim_time * 0.008));
	vec4 tn2 = texture(noise_tex, world * 0.067 - vec2(sim_time * 0.019, sim_time * 0.014) + 0.53);
	speed2 *= 0.62 + 0.62 * (tn.g * 0.6 + tn2.a * 0.4);
	float wet = smoothstep(0.05, 0.7, depth);

	float h = c.g;
	float lap = e.g + w.g + n.g + s.g - 4.0 * h;
	float v = (c.b + k * speed2 * lap - HEIGHT_DECAY * h * dt) * vel_damp;
	// a soft sponge on the border so waves leave instead of bouncing back
	vec2 b = min(UV, 1.0 - UV);
	float keep = mix(0.9, 1.0, smoothstep(0.0, 0.08, min(b.x, b.y))) * wet;
	v = clamp(fin(v * keep), -MAX_VEL, MAX_VEL);
	float hn = clamp(fin((h + v * dt) * keep), -MAX_HEIGHT, MAX_HEIGHT);

	// foam: gentle spread, fade, and fresh foam where wake crests break
	vec2 drift = (tn2.rb - 0.5) * t * 1.6;
	float fc = tap(uv + drift).r;
	float f = (fc * 0.6 + (e.r + w.r + n.r + s.r) * 0.1) * foam_decay;
	f += smoothstep(0.08, 0.3, hn) * foam_gain * smoothstep(0.3, 0.7, tn.b * 0.6 + tn2.g * 0.6);
	f = clamp(fin(f), 0.0, MAX_FOAM);
	COLOR = wipe > 0.5 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(f, hn, v, 1.0);
}
