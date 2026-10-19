import * as THREE from 'three';
import { GLSL_AERIAL, GLSL_ATMOS, globalUniforms } from './environment';

// The sky you only see from the deck. The top-down view never shows the
// horizon, so this dome draws only in the captain's view: the scattering sky
// (stars and all at night), a limb-darkened disc for the sun or moon that the
// bloom catches, high cirrus on fair days, and a heaped cloud deck that follows
// the weather, whose shadows are the very same ones drifting across the sea and
// islands. Its horizon is the same air the distant world fades into.

const CLOUD_ALT = 700;

export function createSkyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: globalUniforms,
    // stars go on after the clouds, so they only shine through the gaps
    defines: { AQ_NO_STARS: 1 },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = (modelMatrix * vec4(position, 0.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_ATMOS}
      uniform vec3 uFogColor;
      uniform vec2 uFogRange;
      ${GLSL_AERIAL}
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = skyColor(vec3(d.x, max(h, 0.0), d.z));
        float sd = max(dot(d, uSunDir), 0.0);
        vec3 hz = hazeColor(d);
        float cover = 0.0;
        if (h > 0.0) {
          // high cirrus: faint streaks combed out along the wind, here and there, in fair weather
          float dc;
          vec2 uvC = cloudUv(cameraPosition, d, 2600.0, dc) * 0.3;
          vec2 wd = normalize(uWind.xy + vec2(1e-4));
          vec2 cs = vec2(dot(uvC, wd) * 0.3, dot(uvC, vec2(-wd.y, wd.x)) * 1.6);
          float ci = texture(uNoiseTex, cs + uCloudOffset * 0.4).g;
          float patchy = smoothstep(0.5, 0.75, texture(uNoiseTex, uvC * 0.35 + 0.5).r);
          float cirrus = smoothstep(0.55, 0.85, ci) * patchy * (1.0 - smoothstep(0.3, 0.7, uCloudCover)) * smoothstep(0.04, 0.35, h);
          col = mix(col, uLight * 0.95 + uSunColor * 0.1 * (0.6 + pow(sd, 6.0)), cirrus * 0.3 * (1.0 - uNight * 0.6));

          // the cloud deck as two slices of the same columns, base and crown:
          // overhead they stack, toward the horizon the crowns rise behind the
          // bases, so the clouds read as heaped volumes rather than a flat sheet
          float dt, db;
          vec2 uvT = cloudUv(cameraPosition, d, ${(CLOUD_ALT + 260).toFixed(1)}, dt);
          vec2 uvB = cloudUv(cameraPosition, d, ${CLOUD_ALT.toFixed(1)}, db);
          vec3 cT = cloudSample(uvT);
          vec3 cB = cloudSample(uvB);
          cT.y *= 0.3; // crowns are the thin, sunlit tops
          vec3 colT = cloudColor(cT, d) * 1.06;
          vec3 colB = cloudColor(cB, d);
          // far cloud dissolves into the haze along the horizon
          colT = mix(colT, hz, 1.0 - exp(-dt * 0.00006));
          colB = mix(colB, hz, 1.0 - exp(-db * 0.00006));
          float fade = smoothstep(0.0, 0.12, h);
          float aT = cT.x * fade;
          float aB = cB.x * fade;
          col = mix(col, colT, aT);
          col = mix(col, colB, aB);
          cover = 1.0 - (1.0 - aT) * (1.0 - aB);
        }
        col += starField(d) * (1.0 - cover) * (1.0 - cover);
        // the key light itself (the sun by day, the moon by night): a hot disc
        // with a darkened limb, hidden behind any cloud
        float disc = smoothstep(0.99955, 0.99975, sd);
        float limb = 0.55 + 0.45 * smoothstep(0.99955, 0.99992, sd);
        col += uSunColor * disc * limb * 7.0 * (1.0 - cover) * (1.0 - uMist * 0.7);
        // low mist swallows the lower sky; the horizon melts into the far, hazed water
        col = mix(col, hz, uMist * 0.75 * (1.0 - smoothstep(0.0, 0.5, h)));
        col = mix(col, hz, (1.0 - smoothstep(-0.015, 0.07, h)) * 0.9);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 40, 20), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.visible = false;
  return dome;
}
