import * as THREE from 'three';
import { GLSL_ATMOS, globalUniforms } from './environment';

// The sky you only see from the deck. The top-down view never shows the
// horizon, so this dome draws only in the captain's view: the analytic sky
// (stars and all at night), a hot disc for the sun or moon that the bloom
// catches, and a cloud deck that follows the weather, whose shadows are the
// very same ones drifting across the sea and islands.

const CLOUD_ALT = 700;

export function createSkyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: globalUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = (modelMatrix * vec4(position, 0.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_ATMOS}
      uniform vec3 uFogColor;
      varying vec3 vDir;
      float cloudN(vec2 uv) {
        return texture(uNoiseTex, uv).r * 0.62 + texture(uNoiseTex, uv * 2.7 + vec2(0.37, 0.71)).r * 0.38;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = skyColor(vec3(d.x, max(h, 0.0), d.z));
        float sd = max(dot(d, uSunDir), 0.0);
        float cover = 0.0;
        if (h > 0.0) {
          // the cloud deck above you, aligned with the shadows it casts on the water below
          vec2 xz = cameraPosition.xz + d.xz * ((${CLOUD_ALT.toFixed(1)} - cameraPosition.y) / max(h, 0.02));
          vec2 ground = xz - uSunDir.xz / max(uSunDir.y, 0.2) * ${CLOUD_ALT.toFixed(1)};
          vec2 uv = ground * 0.0011 + uCloudOffset;
          float n = cloudN(uv);
          float fine = texture(uNoiseTex, uv * 9.0 + uCloudOffset * 2.0).g;
          // the weather slides the coverage exactly as it does for the shadows below
          float lo = 0.8 - uCloudCover;
          float body = smoothstep(lo - 0.04, lo + 0.2, n + (fine - 0.5) * 0.12);
          float fade = smoothstep(0.015, 0.22, h);
          // crowns lit by the sun (or moon), soft blue-grey bellies that darken in a blow,
          // a silver lining toward the light, and lightning glowing inside the deck
          float thick = smoothstep(lo + 0.05, lo + 0.35, n);
          vec3 lit = uLight * 0.92 + uSunColor * 0.06 * (1.0 + pow(sd, 10.0) * 0.8);
          vec3 belly = mix(uSkyHorizon, uLight * vec3(0.72, 0.78, 0.88), 0.6) * (1.0 - uStorm * 0.55);
          vec3 cloud = mix(lit, belly, thick * (0.45 + uCloudCover * 0.4));
          cloud += uHaze * pow(sd, 24.0) * (1.0 - thick) * 0.9;
          cloud += vec3(0.62, 0.7, 0.95) * uFlash * 0.6;
          cover = body * fade * 0.92;
          col = mix(col, cloud, cover);
        }
        // the key light itself (the sun by day, the moon by night), behind any cloud
        col += uSunColor * smoothstep(0.99955, 0.9998, sd) * 5.0 * (1.0 - cover);
        // low mist swallows the lower sky; the horizon melts into the far, fogged water
        col = mix(col, uFogColor, uMist * 0.75 * (1.0 - smoothstep(0.0, 0.5, h)));
        col = mix(col, uFogColor, (1.0 - smoothstep(-0.015, 0.09, h)) * 0.88);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 40, 20), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.visible = false;
  return dome;
}
