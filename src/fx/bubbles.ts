import * as THREE from 'three';

// Air beneath the waves, for the farewell's dive. Every bubble is born once on
// the CPU (a slot in a ring buffer: where, when, how big) and the GPU flies it
// from there: spinning up to its own rise speed (big ones climb faster), a
// zigzag or spiral for the small, a rocking wobble for the big spherical caps,
// swelling as the pressure eases toward the surface, popping just beneath it.
// Nothing is touched per frame but a clock, and only the newborn slots are
// uploaded. The same draw adds a box of marine snow drifting round the camera.
//
// Each bubble is shaded as a sphere of air in water: past the critical angle
// its rim is a mirror (total internal reflection) of the bright water above,
// its middle a tiny inverted lens with the surface glowing at its bottom, a
// sun glint on its upper shoulder. One program, compiled at load like the rest.

const CAP = 1500;
const MOTES = 320;
/** Width (m) of the box of drifting snow that travels with the camera. */
const SNOW_BOX = 26;

export interface BubbleOpts {
  /** Initial push (m/s), dying away within half a second. */
  vx?: number;
  vy?: number;
  vz?: number;
  /** A big wobbling spherical cap rather than a round bubble. */
  cap?: boolean;
  /** Seconds from now (spreads a burst over a few frames of the GPU's clock). */
  delay?: number;
}

export class Bubbles {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private aBirth: Float32Array; // x, y, z, t0
  private aProp: Float32Array; // radius, rise speed, seed, kind (0 bubble, 1 cap, 2 snow)
  private aVel: Float32Array; // initial push xyz, wobble scale
  private attrBirth: THREE.InstancedBufferAttribute;
  private attrProp: THREE.InstancedBufferAttribute;
  private attrVel: THREE.InstancedBufferAttribute;
  private next = 0;
  private lo = Infinity;
  private hi = -1;
  private time = 0;
  readonly uniforms: Record<string, THREE.IUniform>;

  /** `shared` brings the scene depth, light and underwater uniforms (Particles.uniforms). */
  constructor(shared: Record<string, THREE.IUniform>) {
    const n = MOTES + CAP;
    this.aBirth = new Float32Array(n * 4);
    this.aProp = new Float32Array(n * 4);
    this.aVel = new Float32Array(n * 4);
    for (let i = 0; i < MOTES; i++) {
      // snow: a fixed scatter through a unit box; the shader wraps it round the camera
      this.aBirth.set([Math.random(), Math.random(), Math.random(), 0], i * 4);
      this.aProp.set([0.012 + Math.random() * 0.03, 0, Math.random(), 2], i * 4);
    }
    for (let i = MOTES; i < n; i++) this.aBirth[i * 4 + 3] = -1e6;
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.attrBirth = new THREE.InstancedBufferAttribute(this.aBirth, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrProp = new THREE.InstancedBufferAttribute(this.aProp, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrVel = new THREE.InstancedBufferAttribute(this.aVel, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aBirth', this.attrBirth);
    this.geo.setAttribute('aProp', this.attrProp);
    this.geo.setAttribute('aVel', this.attrVel);
    this.geo.instanceCount = n;
    this.uniforms = {
      ...shared,
      uBTime: { value: 0 },
      // the surface overhead (y), where bubbles break
      uSurf: { value: 0 },
      // the slow drift of the water (m/s, xz)
      uCurrent: { value: new THREE.Vector2(0.12, 0.05) },
      // the angular size of a pixel (2 tan(fov / 2) / height), so nothing shrinks below a pixel and shimmers
      uPx: { value: 0.001 },
      uSnowBox: { value: SNOW_BOX },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */ `
        uniform float uBTime; uniform float uSurf; uniform vec2 uCurrent; uniform float uPx; uniform float uSnowBox;
        uniform vec4 uUnder;
        attribute vec4 aBirth; attribute vec4 aProp; attribute vec4 aVel;
        varying vec2 vUv; varying float vAlpha; varying float vViewZ; varying float vKind; varying float vWob; varying vec2 vUp; varying float vDepth;
        void main() {
          float kind = aProp.w;
          float seed = aProp.z;
          vec3 wp;
          float r = aProp.x;
          float alpha = 1.0;
          float wob = 0.0;
          if (kind > 1.5) {
            // marine snow: specks that sink and wander, wrapped in a box round the eye
            float B = uSnowBox;
            vec3 drift = vec3(uCurrent.x, -0.05 - seed * 0.06, uCurrent.y) * uBTime
              + vec3(sin(uBTime * 0.31 + seed * 40.0), sin(uBTime * 0.17 + seed * 23.0) * 0.5, cos(uBTime * 0.23 + seed * 17.0)) * 0.35;
            wp = cameraPosition + mod(aBirth.xyz * B + drift - cameraPosition, B) - B * 0.5;
            vec3 e = abs(wp - cameraPosition) / (B * 0.5);
            alpha = (1.0 - smoothstep(0.55, 1.0, max(e.x, max(e.y, e.z)))) * (0.45 + 0.55 * fract(seed * 7.13));
            alpha *= 1.0 - smoothstep(uSurf - 1.5, uSurf - 0.3, wp.y);
          } else {
            float age = uBTime - aBirth.w;
            float v = aProp.y;
            // spins up to its rise speed in a fraction of a second; the push it was born with dies away
            float tau = 0.3 + r * 0.4;
            float ramp = age - tau * (1.0 - exp(-age / tau));
            float push = 0.45 * (1.0 - exp(-age / 0.45));
            wp = aBirth.xyz + aVel.xyz * push;
            wp.y += v * ramp;
            // swells as the pressure eases on the way up (Boyle: the cube root of it)
            float d0 = max(uSurf - aBirth.y, 0.0);
            float d1 = max(uSurf - wp.y, 0.0);
            r *= pow((10.0 + d0) / (10.0 + d1), 0.3333);
            // small bubbles zigzag and spiral, mid ones rock, big caps barely stray
            float f = mix(10.0, 3.2, smoothstep(0.03, 0.5, aProp.x));
            float amp = mix(0.035, 0.2, smoothstep(0.02, 0.18, aProp.x)) * (1.0 - smoothstep(0.3, 0.8, aProp.x) * 0.75) * aVel.w;
            wob = age * f + seed * 6.2832;
            amp *= min(age * 2.5, 1.0);
            wp.x += sin(wob) * amp + uCurrent.x * age;
            wp.z += cos(wob * 0.83 + seed) * amp + uCurrent.y * age;
            float top = uSurf - wp.y;
            alpha = step(0.0, age) * smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(18.0, 22.0, age));
            // breaks just beneath the surface: a last swell, then gone
            alpha *= step(r * 0.4, top);
            r *= 1.0 + (1.0 - clamp(top / max(r * 2.0, 0.05), 0.0, 1.0)) * 0.25;
          }
          vAlpha = alpha;
          vKind = kind;
          vWob = wob;
          if (alpha <= 0.002 || uUnder.x < 0.5) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vViewZ = -mv.z;
          // never smaller than about a pixel and a half: thinner fades out instead of shimmering
          float minR = max(-mv.z, 0.1) * uPx * 0.75;
          if (r < minR) {
            float k = r / minR;
            vAlpha *= k * k;
            r = minR;
          }
          // caps rock: room in the quad for their wobble
          float grow = kind > 0.5 && kind < 1.5 ? 1.3 : 1.0;
          vUv = position.xy * 2.0 * grow;
          mv.xy += position.xy * 2.0 * r * grow;
          // which way is up on screen, for the lens and the glints
          vec3 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
          float ul = length(up.xy);
          vUp = ul > 1e-3 ? up.xy / ul : vec2(0.0, 1.0);
          vDepth = max(uSurf - wp.y, 0.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        uniform vec3 uLight; uniform vec3 uSunColor; uniform vec4 uUnder; uniform vec3 uUnderColor;
        varying vec2 vUv; varying float vAlpha; varying float vViewZ; varying float vKind; varying float vWob; varying vec2 vUp; varying float vDepth;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          vec2 p = vUv;
          // light from above thins with depth, reds first
          vec3 sunlit = uLight * exp(-vDepth * vec3(0.11, 0.04, 0.028));
          vec3 above = uUnderColor * 3.4 + sunlit * 0.42;
          vec3 below = uUnderColor * 0.45;
          vec3 rgb;
          float a;
          if (vKind > 1.5) {
            // a speck of drifting matter, catching the light from above
            float r = length(p);
            a = (1.0 - smoothstep(0.2, 1.0, r)) * 0.5;
            rgb = (uUnderColor * 2.2 + sunlit * 0.12) * a;
          } else {
            vec2 side = vec2(vUp.y, -vUp.x);
            vec2 q = vec2(dot(p, side), dot(p, vUp)); // q.y points up
            if (vKind > 0.5) {
              // a spherical cap: wider than tall, a flattened, dimpled underside, a rim that ripples
              q.y = q.y * 1.5 + 0.12;
              q.y -= max(-q.y - (0.28 + 0.22 * q.x * q.x), 0.0) * 2.5;
              float th = atan(q.y, q.x);
              q /= 1.0 + 0.07 * sin(3.0 * th + vWob * 1.7) + 0.05 * sin(5.0 * th - vWob * 2.3) + 0.025 * sin(8.0 * th + vWob * 3.1);
            } else {
              // round ones breathe a little as they rock
              float s = sin(vWob * 2.0) * 0.07;
              q *= vec2(1.0 - s, 1.0 + s);
            }
            float r = length(q);
            if (r > 1.0) discard;
            vec3 n = vec3(q, sqrt(max(1.0 - r * r, 0.0)));
            // past the critical angle (~49 degrees) light can't leave the water for the air: a mirror rim
            float tir = smoothstep(0.68, 0.8, r);
            vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
            float sky = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 mirror = mix(below, above, sky * sky);
            // the middle is a tiny diverging lens: the world small and upside down, the bright water at its bottom
            float lens = clamp(-q.y * 0.9 + 0.15, 0.0, 1.0);
            vec3 inner = mix(below * 0.6, above * 0.9, lens * lens);
            float edge = smoothstep(0.88, 1.0, r);
            vec3 body = mix(inner, mirror, tir) * (1.0 - edge * 0.55);
            a = mix(0.14, 0.86, tir) * (1.0 - edge * 0.35);
            // glints: the sun on the upper shoulder, a soft focus of light low in the lens
            float g1 = exp(-dot(q - vec2(-0.3, 0.42), q - vec2(-0.3, 0.42)) * 70.0);
            float g2 = exp(-dot(q - vec2(0.12, -0.58), q - vec2(0.12, -0.58)) * 18.0) * 0.4;
            vec3 glint = (sunlit * 1.4 + uSunColor * 0.25 * exp(-vDepth * 0.06)) * g1 + above * g2;
            rgb = body * a + glint;
            a = min(a + g1 * 0.4, 1.0);
          }
          // into the murk with distance
          float fog = 1.0 - exp(-vViewZ / uUnder.z);
          rgb = mix(rgb, uUnderColor * a, fog);
          float k = vAlpha * (1.0 - fog * 0.8);
          // soft against whatever it passes behind
          float sz = linearDepth(texture(uSceneDepth, gl_FragCoord.xy / uResolution).r);
          k *= clamp((sz - vViewZ) * 2.0, 0.0, 1.0);
          if (k * a < 0.002) discard;
          gl_FragColor = vec4(rgb * k, a * k);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
  }

  /** A bubble of radius `r` (m) at (x, y, z). */
  emit(x: number, y: number, z: number, r: number, o?: BubbleOpts) {
    const i = this.next;
    this.next = (this.next + 1) % CAP;
    const s = MOTES + i;
    const cap = !!o?.cap;
    // big ones climb faster: a terminal speed growing with the root of their size
    const v = (0.75 + 2.5 * Math.sqrt(Math.min(r, 1.3))) * (0.85 + Math.random() * 0.3);
    this.aBirth[s * 4] = x;
    this.aBirth[s * 4 + 1] = y;
    this.aBirth[s * 4 + 2] = z;
    this.aBirth[s * 4 + 3] = this.time + (o?.delay ?? 0);
    this.aProp[s * 4] = r;
    this.aProp[s * 4 + 1] = v;
    this.aProp[s * 4 + 2] = Math.random();
    this.aProp[s * 4 + 3] = cap ? 1 : 0;
    this.aVel[s * 4] = o?.vx ?? 0;
    this.aVel[s * 4 + 1] = o?.vy ?? 0;
    this.aVel[s * 4 + 2] = o?.vz ?? 0;
    this.aVel[s * 4 + 3] = 0.6 + Math.random() * 0.8;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  /**
   * A pocket of trapped air breaking free: one big wobbling cap, a few middling
   * bubbles and a fizz of small ones bursting out and streaming up behind.
   */
  burst(x: number, y: number, z: number, size: number) {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    this.emit(x, y, z, rnd(0.5, 0.85) * size, { cap: true, vx: rnd(-0.3, 0.3), vz: rnd(-0.3, 0.3) });
    if (size > 1.1) this.emit(x + rnd(-0.6, 0.6), y - 0.3, z + rnd(-0.6, 0.6), rnd(0.35, 0.55) * size, { cap: true, delay: rnd(0.05, 0.25) });
    const mid = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < mid; i++) this.emit(x + rnd(-0.5, 0.5), y + rnd(-0.3, 0.2), z + rnd(-0.5, 0.5), rnd(0.13, 0.28) * size, { vx: rnd(-1, 1), vy: rnd(0, 0.6), vz: rnd(-1, 1), delay: rnd(0, 0.2) });
    const fizz = Math.round(rnd(18, 32) * Math.min(size, 1.6));
    for (let i = 0; i < fizz; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.5, 2.6);
      this.emit(x + rnd(-0.4, 0.4), y + rnd(-0.3, 0.3), z + rnd(-0.4, 0.4), rnd(0.035, 0.12), { vx: Math.cos(a) * sp, vy: rnd(-0.3, 1.2), vz: Math.sin(a) * sp, delay: rnd(0, 0.5) });
    }
  }

  /** The camera plunges through the surface: a rush of air dragged down around the lens. */
  rush(cam: THREE.PerspectiveCamera, surf: number) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const c = cam.position;
    for (let i = 0; i < 90; i++) {
      const d = 0.8 + Math.pow(Math.random(), 1.6) * 7;
      const sx = (Math.random() - 0.5) * d * 1.4;
      const sy = (Math.random() - 0.5) * d * 0.9 - d * 0.15;
      const x = c.x + fwd.x * d + right.x * sx + up.x * sy;
      const y = Math.min(c.y + fwd.y * d + right.y * sx + up.y * sy, surf - 0.3);
      const z = c.z + fwd.z * d + right.z * sx + up.z * sy;
      const big = Math.random() < 0.1;
      this.emit(x, y, z, big ? 0.12 + Math.random() * 0.14 : 0.015 + Math.random() * 0.05, {
        vx: (Math.random() - 0.5) * 1.5, vy: -0.6 - Math.random() * 1.6, vz: (Math.random() - 0.5) * 1.5, delay: Math.random() * 0.35,
      });
    }
  }

  /** Advances the bubbles' clock and uploads the slots born since last frame. */
  update(dt: number, surf: number, cam: THREE.PerspectiveCamera, heightPx: number) {
    this.time += dt;
    const u = this.uniforms;
    u.uBTime.value = this.time;
    u.uSurf.value = surf;
    u.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5)) / Math.max(heightPx, 1);
    if (this.hi < 0) return;
    const off = (MOTES + this.lo) * 4;
    const cnt = (this.hi - this.lo + 1) * 4;
    for (const a of [this.attrBirth, this.attrProp, this.attrVel]) {
      a.clearUpdateRanges();
      a.addUpdateRange(off, cnt);
      a.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -1;
  }

  /** Every bubble gone (back to the surface). */
  clear() {
    for (let i = MOTES; i < MOTES + CAP; i++) this.aBirth[i * 4 + 3] = -1e6;
    this.lo = 0;
    this.hi = CAP - 1;
    this.time = 0;
  }
}
