// A vault skin's card on the Shipwright (the web's drawSkinCard): a little
// ship, one bellied sail above a hull, both painted with the very pattern
// she wears at sea (ship_skin.gdshaderinc), over a glow in the skin's rarity.
// Drawn once into its card's viewport (an animated skin keeps drawing while
// its card is on screen); the sea she rides is drawn over it, live.
// Coordinates are the web card's: x across, y down, the card W x H px.
shader_type canvas_item;
render_mode unshaded, blend_premul_alpha;

#define SKIN_CARD
#include "res://shaders/inc/ship_skin.gdshaderinc"

uniform vec2 res = vec2(168.0, 110.0);
/// The rarity's deep colour (the backdrop's glow).
uniform vec3 deep : source_color = vec3(0.1, 0.2, 0.3);
/// The hull's own paint (a skin of no pattern: your paintwork).
uniform vec3 paint : source_color = vec3(0.12, 0.54, 0.54);
uniform float t = 0.0;
/// Not yet found: greyed and darkened (the web's grayscale(0.85) brightness(0.5)).
uniform float locked = 0.0;

vec4 over(vec4 dst, vec3 c, float a) {
	return vec4(c * a + dst.rgb * (1.0 - a), a + dst.a * (1.0 - a));
}

// the smaller root of a s^2 + b s + c = 0 (the curve's parameter at a coordinate)
float qroot(float a, float b, float c) {
	return clamp((-b - sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a), 0.0, 1.0);
}

float box(vec2 q, vec2 o, vec2 sz) {
	vec2 d = min(q - o, o + sz - q);
	return clamp(min(d.x, d.y) + 0.5, 0.0, 1.0);
}

// the skin's paint over a patch, as the web's painter shades it (uv up from the bottom)
vec3 painted(vec2 uv, float sail) {
	vec2 p = sail > 0.5 ? vec2(uv.x * 6.0, uv.y * 7.0) : vec2(uv.x * 14.0, uv.y * 3.8 - 0.5);
	float bend = sail > 0.5 ? sin(uv.x * PI) : smoothstep(-0.1, 0.9, uv.y);
	float ndv = 0.35 + 0.65 * bend;
	vec3 emis = vec3(0.0);
	float metal = 0.0;
	float rough = 0.5;
	vec3 alb = aq_skin(p, ndv, t, sail, emis, metal, rough);
	vec3 col = alb * (0.55 + 0.45 * bend) * mix(1.0, 0.55, metal);
	float band = exp(-pow((uv.y - 0.72) * (3.0 + (1.0 - rough) * 9.0), 2.0));
	col += mix(vec3(0.05), alb * 1.4, metal) * band * (1.0 - rough) * 0.9;
	col += emis * 1.1;
	col = 1.0 - exp(-col * 1.35);
	return pow(col, vec3(1.0 / 2.2));
}

void fragment() {
	vec2 q = UV * res;
	float W = res.x;
	float H = res.y;
	float k = W / 168.0;
	vec4 o = vec4(0.0);
	// deep water glow in the rarity's colour
	float d = length(q - vec2(W * 0.5, H * 0.47)) / (W * 0.75);
	o = over(o, deep, 0.4 * clamp(1.0 - d, 0.0, 1.0));
	float hx = W * 0.08, hw = W * 0.84, hy = H * 0.6, hh = H * 0.26;
	float sx = W * 0.3, sw = W * 0.4, sy = H * 0.08, sh = H * 0.46;
	// mast and yard
	vec3 mast = vec3(0.29, 0.18, 0.094);
	o = over(o, mast, box(q, vec2(W * 0.5 - 2.0 * k, sy - H * 0.05), vec2(4.0 * k, hy - sy + H * 0.06)));
	o = over(o, mast, box(q, vec2(sx - W * 0.02, sy - 2.0 * k), vec2(sw + W * 0.04, 4.0 * k)));
	// the sail: a bellied top and foot, its leeches bowed out
	vec2 n = (q - vec2(sx, sy)) / vec2(sw, sh);
	float s = qroot(0.1, -1.1, n.y);
	float lx = -0.12 * s * (1.0 - s) + 0.04 * s * s;
	float in_sail = min(min(n.x - lx, 1.0 - lx - n.x) * sw, (n.y - 0.16 * n.x * (1.0 - n.x)) * sh);
	float fs = clamp((0.96 - n.x) / 0.92, 0.0, 1.0);
	in_sail = clamp(min(in_sail, (1.0 - 0.28 * fs * (1.0 - fs) - n.y) * sh) + 0.5, 0.0, 1.0);
	// the hull: a sheer along the top, a raked bow on the right, stern on the left
	vec2 m = (q - vec2(hx, hy)) / vec2(hw, hh);
	float top = m.x < 0.86 ? 0.06 + 0.28 * qroot(0.1, -0.92, m.x - 0.04) - 0.34 * pow(qroot(0.1, -0.92, m.x - 0.04), 2.0)
			: 0.04 * qroot(0.08, -0.22, m.x - 0.86) - 0.1 * pow(qroot(0.08, -0.22, m.x - 0.86), 2.0);
	float rs = qroot(0.3, -1.36, m.y + 0.06);
	float right = 1.0 - 0.14 * rs - 0.06 * rs * rs;
	float ls = qroot(0.34, -1.28, m.y - 0.06);
	float left = 0.04 - 0.04 * ls + 0.12 * ls * ls;
	float in_hull = min(min((m.y - top) * hh, (1.0 - m.y) * hh), min((m.x - left) * hw, (right - m.x) * hw));
	in_hull = clamp(in_hull + 0.5, 0.0, 1.0) * step(0.04, m.x + 0.002);
	bool plain_sail = skin_id == 0 || skin_p.y < 0.3;
	if (in_sail > 0.0) {
		vec3 c = plain_sail ? vec3(0.945, 0.906, 0.816) : painted(vec2(n.x, 1.0 - n.y), 1.0);
		// cloth seams and a soft belly shade
		float seam = 0.0;
		for (int i = 1; i < 6; i++) {
			seam = max(seam, box(q, vec2(sx + sw * float(i) / 6.0, sy), vec2(1.0 * k, sh)));
		}
		c = mix(c, vec3(0.0), 0.16 * seam);
		vec4 g = n.x < 0.45 ? mix(vec4(0.0, 0.0, 0.0, 0.28), vec4(1.0, 1.0, 1.0, 0.08), n.x / 0.45)
				: mix(vec4(1.0, 1.0, 1.0, 0.08), vec4(0.0, 0.0, 0.0, 0.3), (n.x - 0.45) / 0.55);
		c = mix(c, g.rgb, g.a);
		o = over(o, c, in_sail);
	}
	if (in_hull > 0.0) {
		vec2 hv = vec2(m.x, 1.0 - (m.y + 0.08) / 1.08);
		vec3 c = skin_id == 0 ? paint : painted(hv, 0.0);
		// wale, its gilt line, the gunports in their frames
		c = mix(c, vec3(0.118, 0.071, 0.039), 0.85 * box(q, vec2(hx, hy + hh * 0.5), vec2(hw, hh * 0.09)));
		c = mix(c, vec3(0.886, 0.71, 0.322), box(q, vec2(hx, hy + hh * 0.48), vec2(hw, hh * 0.025)));
		for (int i = 0; i < 5; i++) {
			vec2 pp = vec2(hx + hw * (0.24 + float(i) * 0.12), hy + hh * 0.22);
			c = mix(c, vec3(0.847, 0.647, 0.29), box(q, pp - 1.5 * k, vec2(hw * 0.05, hh * 0.16) + 3.0 * k));
			c = mix(c, vec3(0.071, 0.047, 0.035), box(q, pp, vec2(hw * 0.05, hh * 0.16)));
		}
		// boot top and the bottom paint
		c = mix(c, vec3(0.961, 0.937, 0.882), box(q, vec2(hx, hy + hh * 0.8), vec2(hw, hh * 0.05)));
		c = mix(c, vec3(0.227, 0.122, 0.09), box(q, vec2(hx, hy + hh * 0.85), vec2(hw, hh * 0.3)));
		// rounded: light from above, shade toward the keel
		float v = (q.y - hy) / hh;
		vec4 g = v < 0.35 ? vec4(1.0, 1.0, 1.0, 0.18 * (1.0 - clamp(v / 0.35, 0.0, 1.0))) : vec4(0.0, 0.0, 0.0, 0.42 * clamp((v - 0.35) / 0.65, 0.0, 1.0));
		c = mix(c, g.rgb, g.a);
		o = over(o, c, in_hull);
	}
	// the gilded rail along her sheer
	float rail = max(1.5 * k, H * 0.014);
	if (m.x > 0.04 && m.x < 1.0) {
		o = over(o, vec3(0.937, 0.769, 0.388), clamp(rail * 0.5 - abs(m.y - top) * hh + 0.5, 0.0, 1.0));
	}
	if (locked > 0.5) {
		vec3 c = o.a > 0.0 ? o.rgb / o.a : vec3(0.0);
		float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
		o.rgb = mix(c, vec3(l), 0.85) * 0.5 * o.a;
	}
	COLOR = o;
}
