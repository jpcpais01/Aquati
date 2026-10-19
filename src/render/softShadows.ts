import * as THREE from 'three';

// Contact-hardening sun shadows (PCSS). three's PCF shadow map is a depth
// texture set up for hardware comparison, which is lovely for smooth filtering
// but can't be read as raw depth. Its colour attachment can: we make the
// shadow pass write full-precision packed depth there, search it for blockers
// to estimate how far the shadow falls, and widen the hardware-filtered PCF
// kernel to match. A mast casts a crisp shadow at its foot that blurs out
// toward the masthead, the way a real sun does.

/** Uniforms shared by every patched material (merged in by patchMaterial). */
export const shadowUniforms = {
  // x on/off, y max (search) radius in shadow uv, z penumbra uv per unit of
  // shadow depth, w min radius in shadow uv
  uAqPcss: { value: new THREE.Vector4(0, 0.002, 0.05, 0.0005) },
  uAqShadowDepth: { value: null as THREE.Texture | null },
};

/** How wide the sun looks, artistically: tan of its apparent radius. */
const SUN_SPREAD = 0.028;
/** Penumbrae never grow wider than this, in metres... */
const MAX_PENUMBRA = 1.2;
/** ...or than this many shadow texels, so 16 taps still cover them smoothly. */
const MAX_TEXELS = 14;

let installed = false;

/**
 * Rewrites the shadow chunks once, before anything compiles. Materials only
 * take the PCSS path when they define AQ_PCSS (patchMaterial does), so any
 * plain three material keeps the stock filter.
 */
export function installSoftShadows() {
  if (installed) return;
  installed = true;

  // shadow pass: write packed 32-bit depth to colour instead of 8-bit grey
  const depth = THREE.ShaderLib.depth;
  depth.fragmentShader = depth.fragmentShader.replace(
    'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
    'gl_FragColor = packDepthToRGBA( fragCoordZ );',
  );

  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const head = 'float getShadow( sampler2DShadow shadowMap';
  const start = chunk.indexOf(head);
  const end = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )', start);
  if (start < 0 || end < 0) {
    console.warn('Aquati: shadow chunk changed, soft shadows disabled');
    return;
  }
  const pcss = /* glsl */ `
		#ifdef AQ_PCSS
		uniform vec4 uAqPcss;
		uniform sampler2D uAqShadowDepth;
		// same maths as three's unpackRGBAToDepth (packing isn't included yet here)
		float aqUnpackDepth( vec4 v ) {
			return dot( v, vec4( 255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0, 1.0 / 16777216.0 ) );
		}
		#endif

		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;

			if ( frustumTest ) {

				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;

				#ifdef AQ_PCSS
				if ( uAqPcss.x > 0.5 ) {

					// 1. blocker search: mean depth of whatever sits between us and the sun
					ivec2 size = ivec2( shadowMapSize );
					float sum = 0.0;
					float count = 0.0;
					for ( int i = 0; i < 10; i ++ ) {
						vec2 uv = shadowCoord.xy + vogelDiskSample( i, 10, phi ) * uAqPcss.y;
						ivec2 px = clamp( ivec2( uv * shadowMapSize ), ivec2( 0 ), size - 1 );
						float d = aqUnpackDepth( texelFetch( uAqShadowDepth, px, 0 ) );
						if ( d < shadowCoord.z ) { sum += d; count += 1.0; }
					}
					if ( count < 0.5 ) return 1.0;

					// 2. penumbra grows with the gap between blocker and receiver
					float gap = shadowCoord.z - sum / count;
					radius = clamp( gap * uAqPcss.z, uAqPcss.w, uAqPcss.y );

					// 3. hardware-filtered PCF over that disc
					float s = 0.0;
					for ( int i = 0; i < 16; i ++ ) {
						s += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, 16, phi ) * radius, shadowCoord.z ) );
					}
					return mix( 1.0, s / 16.0, shadowIntensity );

				}
				#endif

				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;

			}

			return mix( 1.0, shadow, shadowIntensity );

		}

	`;
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.slice(0, start) + pcss + chunk.slice(end);
}

/**
 * Per-frame update: the shadow frustum follows the camera zoom, so penumbra
 * sizes in shadow-map uv change with it.
 */
export function updateSoftShadows(light: THREE.DirectionalLight, enabled: boolean) {
  const sh = light.shadow;
  const u = shadowUniforms.uAqPcss.value;
  const tex = sh.map?.texture ?? null;
  shadowUniforms.uAqShadowDepth.value = tex;
  if (!tex || !enabled) {
    u.x = 0;
    return;
  }
  const cam = sh.camera;
  const width = cam.right - cam.left;
  const depthRange = cam.far - cam.near;
  const maxUv = Math.min(MAX_PENUMBRA / width, MAX_TEXELS / sh.mapSize.x);
  u.set(1, maxUv, (depthRange * SUN_SPREAD) / width, 1.2 / sh.mapSize.x);
}
