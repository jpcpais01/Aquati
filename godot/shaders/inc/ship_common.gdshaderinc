// Shared by the ship materials: a cheap hash and the air between the camera
// and the ship. (Needs atmos.gdshaderinc first.)

float hash11(float n) {
	return fract(sin(n * 127.1) * 43758.5453);
}

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// A thin line of width w (in cells) at every whole number of x, antialiased
// by its own screen footprint so distant seams fade instead of shimmering.
float grid_line(float x, float w) {
	float f = abs(fract(x + 0.5) - 0.5);
	float fw = max(fwidth(x), 1e-4);
	float fade = 1.0 - smoothstep(0.35, 0.8, fw);
	return (1.0 - smoothstep(w - fw, w + fw, f)) * fade;
}

// Bumps view-space normal n of the surface at view-space point p by a height
// field h (m), from its screen-space derivatives (Mikkelsen's unparametrised
// bump mapping): needs no tangents at all.
vec3 bump(vec3 n, vec3 p, float h) {
	vec3 dpdx = dFdx(p);
	vec3 dpdy = dFdy(p);
	vec3 r1 = cross(dpdy, n);
	vec3 r2 = cross(n, dpdx);
	float det = dot(dpdx, r1);
	vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
	return normalize(abs(det) * n - grad);
}

// Vertex paint arrives sRGB (8 bits keep more of the darks that way).
vec3 srgb_to_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
