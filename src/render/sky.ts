import * as THREE from 'three';
import { CLOUD, GLSL_AERIAL, GLSL_ATMOS, globalUniforms } from './environment';
import { CUMULUS_NEAR } from './cumulus';
import { GLSL_NIGHT_SKY } from './nightSky';

// The sky you only see from the deck. The top-down view never shows the
// horizon, so this dome draws only in the captain's view: the scattering sky
// (stars and all at night), a limb-darkened disc for the sun or moon that the
// bloom catches, high cirrus on fair days, and the bellies of the cumulus
// overhead, whose shadows are the very same ones drifting across the sea and
// islands. Toward the horizon the clouds are impostors standing on the same
// field (see cumulus.ts). Its horizon is the same air the distant world fades into.

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
      ${GLSL_NIGHT_SKY}
      varying vec3 vDir;

      // The cumulus overhead, seen from below as their flat bellies: grey
      // and dense in the core, glowing at the thin rims where the sun gets
      // through, with the sunlit crowns of the tall ones peeping past the
      // rims. Toward the horizon the impostor clouds take over, so this deck
      // fades out a kilometre or so off, except under a closing sky,
      // where it becomes the grey ceiling running on to the horizon.
      vec4 deck(vec3 ro, vec3 d, vec3 hz) {
        float lo = cloudLo();
        float H = heapTall();
        float db, dt;
        vec2 uvB = cloudUv(ro, d, AQ_CLOUD_ALT, db);
        vec2 uvT = cloudUv(ro, d, AQ_CLOUD_ALT + H * 0.6, dt);
        float fine = texture(uNoiseTex, uvB * 3.1 + vec2(0.29, 0.83)).g;
        float nB = cloudField(uvB) + (fine - 0.5) * 0.14;
        float kB = heapK(nB, lo);
        // only the taller cores reach the crown slice, so it is narrower
        float kT = heapK(cloudField(uvT), lo + 0.1);
        // how much cloud stands between the belly and the sun
        vec2 ls = uSunDir.xz / max(uSunDir.y, 0.12);
        float kS = heapK(cloudField(uvB + ls * ${(CLOUD.uvPerM * 140).toFixed(4)}), lo);
        float mu = dot(d, uSunDir);
        float fwd = pow(max(mu, 0.0), 6.0);
        vec3 skyAmb = mix(uSkyHorizon, uSkyZenith, 0.5) * 0.95 + uLight * 0.1;
        vec3 seaAmb = vec3(0.1, 0.16, 0.2) * uLight + skyAmb * 0.42;
        float dim = 1.0 - uStorm * 0.5 - uRain * 0.12;
        float through = exp(-(kB + kS) * 2.2);
        vec3 belly = (seaAmb * (1.15 - kB * 0.3) + uSunColor * (through * (0.16 + fwd * 1.1) + 0.05)) * dim;
        // a closed deck still has its rolls: thicker under the heavy ones, thinner between
        belly *= 1.0 - smoothstep(lo + 0.3, lo + 1.1, nB) * 0.6 * smoothstep(0.6, 1.0, uCloudCover);
        vec3 crown = (skyAmb + uSunColor * (0.52 + fwd * 0.3)) * dim;
        float night = 1.0 - uNight * 0.55;
        belly = mix(belly * night, hz, 1.0 - exp(-db * 0.000042));
        crown = mix(crown * night, hz, 1.0 - exp(-dt * 0.000042));
        belly += vec3(0.62, 0.7, 0.95) * uFlash * 0.7;
        // by moonlight the thin rims of the clouds drifting before the moon burn silver
        belly += uSunColor * pow(max(mu, 0.0), 14.0) * (1.0 - smoothstep(0.0, 0.45, kB)) * 3.5 * uNight * (1.0 - uCloudCover * 0.6);
        // near only, unless the sky is closing over
        float keep = max(1.0 - smoothstep(${CUMULUS_NEAR.toFixed(1)}, ${(CUMULUS_NEAR * 1.5).toFixed(1)}, db), smoothstep(0.5, 0.85, uCloudCover));
        float fade = smoothstep(0.0, 0.06, d.y) * keep;
        float aT = smoothstep(0.0, 0.15, kT) * fade * (1.0 - smoothstep(0.6, 0.95, uCloudCover));
        float aB = smoothstep(0.0, 0.16, kB) * fade;
        vec3 col = mix(crown, belly, aB);
        return vec4(col, 1.0 - (1.0 - aT) * (1.0 - aB));
      }

      void main() {
        vec3 d = normalize(vDir);
        // one pixel, in radians of sky: stars and the moon's limb stay pin-sharp at any zoom
        float pix = length(fwidth(d)) * 0.75;
        float h = d.y;
        vec3 col = skyColor(vec3(d.x, max(h, 0.0), d.z));
        float sd = max(dot(d, uSunDir), 0.0);
        vec3 hz = hazeColor(d);
        // above the clouds: the stars, the galaxy and the moon
        vec3 night = nightSky(d, pix, col);
        vec4 moon = moonDisc(d, pix);
        night = night * (1.0 - moon.a) + moon.rgb;
        // the faint airglow banding the horizon on the darkest nights
        night += vec3(0.006, 0.011, 0.007) * uNight * exp(-max(h, 0.0) * 14.0) * (1.0 - uCloudCover);
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
          col += night * (1.0 - cirrus * 0.6);
          col = mix(col, uLight * 0.95 + uSunColor * 0.1 * (0.6 + pow(sd, 6.0)), cirrus * 0.3 * (1.0 - uNight * 0.6));

          vec4 cu = deck(cameraPosition, d, hz);
          col = mix(col, cu.rgb, cu.a);
          cover = cu.a;
        }
        // the key light itself by day: a hot disc with a darkened limb, hidden
        // behind any cloud (by night the moon above stands in for it)
        float disc = smoothstep(0.99955, 0.99975, sd);
        float limb = 0.55 + 0.45 * smoothstep(0.99955, 0.99992, sd);
        float sunKey = step(dot(uSunDir, uMoon.xyz), 0.9999);
        col += uSunColor * disc * limb * 7.0 * (1.0 - cover) * (1.0 - uMist * 0.7) * sunKey;
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
