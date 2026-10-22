// Small helpers every surface shader shares.
#ifndef COMMON_INC
#define COMMON_INC

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

#endif
