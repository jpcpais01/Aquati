// Battle damage on a ship's timber and canvas (the web game's damageGlsl),
// for the _dmg variants of the ship shaders, which a ship takes on with her
// first wound (ShipDamage). Everything is worked out in the hull's own frame
// (the model's object space, VERTEX as built), so the holes, the scorch and a
// wreck's break line stay glued to the timber however she pitches, rolls or
// breaks in two.
//
//  - holes: jagged cannonball breaches that cut clean through the planking
//    above the hold floor (lower down they are dark, sooty pits), ringed by
//    splintered raw wood, a soot halo and embers that cool off
//  - patches: breaches the crew has boarded over with fresh planks
//  - wear: soot streaks and scorch spreading over the whole hull
//  - split: the wreck's jagged break line (each half drops the other's side)
//  - canvas: sails and flags torn into ragged, burnt-edged rags
//  - spars shot away: their parts and the ropes made fast to them drop out
#ifndef SHIP_DAMAGE_INC
#define SHIP_DAMAGE_INC

/// the sea's clock (s), wrapped every 4096
global uniform float sea_clock;

uniform sampler2D dmg_noise : repeat_enable, filter_linear_mipmap;
/// breaches: centre (model frame), radius (negative once patched)
uniform vec4 dmg_holes[16];
/// each breach's outward side (+1 port), the hold floor's height there, a seed, and when it was torn (sea_clock)
uniform vec4 dmg_info[16];
uniform int dmg_count = 0;
/// the wreck's break: z, the side kept (+1 bow, -1 stern, 0 whole), jag, burn
uniform vec4 dmg_split = vec4(0.0);
/// hull wear, fire, seed, canvas wear
uniform vec4 dmg_state = vec4(0.0);
/// spars shot away (bit s - 1 for spar s)
uniform int dmg_gone = 0;

// Whether a vertex painted with `alpha` stands on a spar that is gone (see
// MeshKit.code: the low four bits of the byte; RopeKit: a bit per spar).
bool spar_gone(float alpha, bool rope) {
	int code = int(floor(alpha * 255.0 + 0.25));
	if (rope) {
		return (code & dmg_gone) != 0;
	}
	int s = code & 15;
	return s > 0 && (dmg_gone & (1 << (s - 1))) != 0;
}

// The breaches, patches, scorch and break line on her timber at model-frame
// point p: darkens and roughens col, and returns the embers' glow. `drop` is
// set where the fragment is shot through, or past the break; `cut` says
// whether breaches open right through here; back faces are the inside of
// the hull, seen through a breach.
vec3 hull_damage(vec3 p, bool front, bool cut, inout vec3 col, inout float rough, inout float metal, out bool drop) {
	drop = false;
	float seam = 1e3;
	if (dmg_split.y != 0.0) {
		float jag = (texture(dmg_noise, p.xy * vec2(0.09, 0.14) + dmg_state.z).g - 0.5) * dmg_split.z
				+ (texture(dmg_noise, p.xy * vec2(0.05, 0.4)).a - 0.5) * 1.1;
		seam = (p.z - dmg_split.x - jag) * dmg_split.y;
		if (seam < 0.0) {
			drop = true;
			return vec3(0.0);
		}
	}
	float hole = 0.0;
	float open = 0.0;
	float rim = 0.0;
	float soot = 0.0;
	float patched = 0.0;
	float patch_line = 0.0;
	float heat = 0.0;
	for (int i = 0; i < 16; i++) {
		if (i >= dmg_count) {
			break;
		}
		vec4 h = dmg_holes[i];
		vec3 d = p - h.xyz;
		float R = abs(h.w);
		float d2 = dot(d, d);
		if (d2 > R * R * 5.0) {
			continue;
		}
		vec4 info = dmg_info[i];
		// only the struck side of the hull, and what's right behind it
		if (d.x * info.x < -R * 0.9) {
			continue;
		}
		if (h.w < 0.0) {
			// boarded over with fresh planks
			vec2 pq = abs(vec2(d.z, d.y)) / vec2(R * 1.15, R * 0.85);
			float inside = 1.0 - step(1.0, max(pq.x, pq.y));
			float pl = fract((p.y + info.z) / 0.19);
			float gap = smoothstep(0.0, 0.1, pl) * smoothstep(1.0, 0.9, pl);
			float edge = smoothstep(0.86, 0.96, max(pq.x, pq.y));
			patched = max(patched, inside);
			patch_line = max(patch_line, inside * max(1.0 - gap, edge));
			continue;
		}
		vec2 q = vec2(d.z, d.y) / R;
		float n = texture(dmg_noise, q * 0.2 + info.z).g;
		float n2 = texture(dmg_noise, q * vec2(0.05, 0.3) + info.z * 1.7).a;
		float r = sqrt(d2) / R;
		float rr = r + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.55;
		float in_hole = 1.0 - step(0.5, rr);
		hole = max(hole, in_hole);
		open = max(open, in_hole * step(info.y, p.y));
		rim = max(rim, 1.0 - smoothstep(0.5, 0.82, rr));
		soot = max(soot, 1.0 - smoothstep(0.45, 1.9, r + (n - 0.5) * 0.8));
		float age = sea_clock - info.w;
		age += age < 0.0 ? 4096.0 : 0.0;
		heat = max(heat, (1.0 - smoothstep(0.48, 0.95, rr)) * (exp(-age * 0.5) + dmg_state.y * 0.3));
	}
	if (!cut) {
		open = 0.0;
	}
	if (open > 0.5 && front) {
		drop = true;
		return vec3(0.0);
	}
	if (!front) {
		// looking into the hold through a breach: dark, damp timber
		float hn = texture(dmg_noise, p.zy * vec2(0.3, 2.2)).a;
		col = vec3(0.075, 0.052, 0.034) * (0.7 + hn * 0.6);
		rough = 1.0;
		metal = 0.0;
		return vec3(0.0);
	}
	float wear = dmg_state.x;
	if (wear > 0.002) {
		float wn = texture(dmg_noise, p.zy * vec2(0.035, 0.07) + dmg_state.z).g * 0.7 + texture(dmg_noise, p.zy * 0.11).a * 0.3;
		soot = max(soot, smoothstep(0.98 - wear * 0.5, 1.06 - wear * 0.5, wn) * min(1.0, wear * 1.5) * 0.85);
	}
	soot = max(soot, 1.0 - smoothstep(0.0, 1.6, seam));
	rim = max(rim, 1.0 - smoothstep(0.0, 0.32, seam));
	heat = max(heat, (1.0 - smoothstep(0.0, 0.5, seam)) * dmg_split.w);
	vec3 fresh = vec3(0.74, 0.55, 0.34) * (0.82 + 0.3 * texture(dmg_noise, p.zy * vec2(0.2, 2.6)).a);
	col = mix(col, fresh * (1.0 - patch_line * 0.72), patched);
	// new timber, not yet painted or varnished: matte
	rough = mix(rough, 0.9, patched);
	metal *= 1.0 - patched;
	vec3 raw = vec3(0.7, 0.52, 0.33) * (0.7 + 0.6 * texture(dmg_noise, p.zy * vec2(0.25, 3.0)).a);
	col *= 1.0 - soot * 0.84;
	col = mix(col, raw * mix(1.0, 0.3, soot * soot), rim * (1.0 - hole));
	// breaches that can't open (below the hold floor) are dark, sooty pits
	col = mix(col, vec3(0.025, 0.02, 0.016), hole * (1.0 - open));
	float worn = max(rim, soot * 0.85);
	rough = mix(rough, 1.0, worn);
	metal *= 1.0 - worn;
	float flick = 0.62 + 0.38 * sin(sea_clock * 9.0 + p.z * 3.1 + p.y * 4.7) * sin(sea_clock * 5.3 + p.y * 2.0);
	return vec3(2.6, 0.75, 0.12) * heat * heat * flick * (1.0 - open);
}

// Canvas torn into ragged holes as the wear on it rises (dmg_state.w),
// burnt brown round their edges, glowing while she burns. uv: the cloth's
// own coordinates; seed: one for each sail. Returns the embers' glow; `drop`
// is set where the cloth is gone.
vec3 canvas_damage(vec2 uv, float seed, inout vec3 col, out bool drop) {
	drop = false;
	float sw = dmg_state.w;
	if (sw <= 0.002) {
		return vec3(0.0);
	}
	vec2 tuv = uv + vec2(seed * 0.37, seed * 0.61) + dmg_state.z;
	float n = texture(dmg_noise, tuv * vec2(0.42, 0.6)).g * 0.72 + texture(dmg_noise, tuv * vec2(1.1, 1.5)).a * 0.28;
	float e = n - (1.0 - sw * 0.5);
	if (e > 0.0) {
		drop = true;
		return vec3(0.0);
	}
	float burnt = smoothstep(-0.045, 0.0, e);
	col *= (1.0 - burnt * 0.82) * (1.0 - sw * 0.22 * texture(dmg_noise, tuv * 0.25).r);
	return vec3(2.4, 0.8, 0.15) * smoothstep(-0.012, 0.0, e) * dmg_state.y;
}

#endif
