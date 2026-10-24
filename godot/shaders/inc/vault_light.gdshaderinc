// The Treasure Vault's light (VaultStage), the web's four looks in one: 0 a
// column of light standing out of the chest's mouth, turned to the camera;
// 1 a cone of god rays fanning up out of it, turning; 2 a glow with star
// spikes and a lens streak (vault_glow: drawn over everything, as a glare
// is); 3 a shockwave ring racing out over the swell (vault_ring). Added to
// the scene's light: `color` is linear HDR, `amt` how much of it shows.
//   k: column (width, height); rays (-, height, turn speed); glow (size,
//   streak, spikes, nudge toward the camera); ring (radius).

uniform int kind = 0;
uniform vec3 color = vec3(1.0);
uniform float amt = 0.0;
uniform vec4 k = vec4(1.0, 1.0, 1.0, 0.0);

varying vec2 v_q;
varying float v_ang;
varying float v_h;

float vault_light(float t) {
	float a = 0.0;
	if (kind == 0) {
		float x = v_q.x * 2.0;
		float y = v_q.y;
		float core = exp(-x * x * 26.0) * 1.3;
		float soft = exp(-x * x * 3.0) * 0.32;
		float rise = 0.72 + 0.28 * sin(y * 26.0 - t * 7.0) * sin(y * 9.0 - t * 3.1 + x * 2.0);
		float fall = (1.0 - y) * (1.0 - y) * smoothstep(0.0, 0.05, y);
		a = (core + soft) * rise * fall;
	} else if (kind == 1) {
		float s = t * k.z;
		float r1 = max(0.0, sin(v_ang * 9.0 + s + sin(v_ang * 3.0 + s * 0.7) * 1.4));
		float r2 = max(0.0, sin(v_ang * 14.0 - s * 1.3 + 1.7));
		r1 *= r1; r1 *= r1; r1 *= r1;
		r2 *= r2; r2 *= r2; r2 *= r2; r2 *= r2;
		float h = clamp(v_h, 0.0, 1.0);
		float fade = (1.0 - h) * (1.0 - h) * smoothstep(0.0, 0.12, h);
		a = (r1 * 0.75 + r2 * 0.55 + 0.06) * fade;
	} else if (kind == 2) {
		vec2 q = v_q;
		float r2 = dot(q, q);
		if (r2 > 1.0) {
			return 0.0;
		}
		float core = exp(-r2 * 28.0) * 1.7 + exp(-r2 * 6.0) * 0.5 + exp(-r2 * 1.6) * 0.12;
		float streak = exp(-q.y * q.y * 700.0) * exp(-q.x * q.x * 2.2) * k.y;
		float ang = atan(q.y, q.x) + t * 0.25;
		float sp = max(0.0, cos(ang * 4.0));
		sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp;
		float spikes = sp * (1.0 - sqrt(r2)) * k.z;
		a = (core + streak + spikes) * (1.0 - smoothstep(0.7, 1.0, r2));
	} else {
		float r = length(v_q);
		if (r > 1.0) {
			return 0.0;
		}
		float d = (r - 0.86) * 16.0;
		float band = exp(-d * d);
		float fill = r * r * 0.18;
		a = (band + fill) * (1.0 - smoothstep(0.93, 1.0, r));
	}
	return a * amt;
}
