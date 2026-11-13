import * as THREE from 'three';
import { Effect, EffectAttribute, BlendFunction } from 'postprocessing';

// Atmosphere in one depth-aware effect:
//  - analytic exponential height fog, sodium orange, brighter low in the valley
//  - volumetric scattering inside the helicopter searchlight cone (analytic cone clip,
//    short jittered ray march with drifting drizzle density)
//  - a screen-space drizzle layer that only shows against light (backlit rain)

const FRAG = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform vec3 uFogLow;
uniform vec3 uFogHigh;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uTime;
uniform float uRainAmount;

uniform float uSLOn;
uniform vec3 uSLPos;
uniform vec3 uSLDir;
uniform float uSLCos;
uniform vec3 uSLColor;
uniform float uSLRange;
uniform float uVolSteps;

float fh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = fh(i.xy + i.z * 17.0), n100 = fh(i.xy + vec2(1, 0) + i.z * 17.0);
  float n010 = fh(i.xy + vec2(0, 1) + i.z * 17.0), n110 = fh(i.xy + vec2(1, 1) + i.z * 17.0);
  float n001 = fh(i.xy + (i.z + 1.0) * 17.0), n101 = fh(i.xy + vec2(1, 0) + (i.z + 1.0) * 17.0);
  float n011 = fh(i.xy + vec2(0, 1) + (i.z + 1.0) * 17.0), n111 = fh(i.xy + vec2(1, 1) + (i.z + 1.0) * 17.0);
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

// Ray segment [t0,t1] inside the forward nappe of a cone; returns false if none.
bool coneInterval(vec3 ro, vec3 rd, vec3 apex, vec3 axis, float cosA, out float t0, out float t1) {
  vec3 co = ro - apex;
  float c2 = cosA * cosA;
  float dv = dot(rd, axis), cv = dot(co, axis);
  float a = dv * dv - c2;
  float b = 2.0 * (dv * cv - dot(rd, co) * c2);
  float c = cv * cv - dot(co, co) * c2;
  float disc = b * b - 4.0 * a * c;
  bool insideStart = cv > 0.0 && cv * cv >= dot(co, co) * c2;
  if (disc < 0.0) {
    if (insideStart) { t0 = 0.0; t1 = 1e6; return true; }
    return false;
  }
  float sq = sqrt(disc);
  float r0 = (-b - sq) / (2.0 * a);
  float r1 = (-b + sq) / (2.0 * a);
  if (r0 > r1) { float tmp = r0; r0 = r1; r1 = tmp; }
  // test which intervals lie in the forward nappe
  float tm = 0.5 * (r0 + r1);
  vec3 pm = co + rd * tm;
  bool midIn = dot(pm, axis) > 0.0 && dot(normalize(pm), axis) > cosA;
  if (midIn) { t0 = r0; t1 = r1; }
  else {
    vec3 pa = co + rd * (r1 + 1.0);
    if (dot(pa, axis) > 0.0 && dot(normalize(pa), axis) > cosA) { t0 = r1; t1 = 1e6; }
    else { t0 = -1e6; t1 = r0; }
  }
  return t1 > max(t0, 0.0);
}

float rainLayer(vec2 uv, float scale, float speed, float seed) {
  vec2 p = uv * vec2(scale * 1.6, scale * 0.12);
  p.y += uTime * speed;
  p.x += p.y * 0.035;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float h = fh(id + seed);
  float x = abs(f.x - (0.2 + 0.6 * h));
  float streak = smoothstep(0.035, 0.0, x) * smoothstep(0.0, 0.25, f.y) * smoothstep(1.0, 0.55, f.y);
  return streak * step(0.55, h);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 vp = uInvProj * clip;
  vp.xyz /= vp.w;
  float dist = length(vp.xyz);
  vec3 dirV = vp.xyz / dist;
  bool sky = depth >= 0.99999;
  if (sky) dist = 2600.0;
  vec3 rd = normalize((uCamWorld * vec4(dirV, 0.0)).xyz);

  // Height fog: density(y) = D * exp(-F * y). Optical depth along the ray, closed form.
  float F = uFogFalloff;
  float a = uFogDensity * exp(-F * uCamPos.y);
  float k = F * rd.y * dist;
  float od = a * dist * (abs(k) > 1e-4 ? (1.0 - exp(-k)) / k : 1.0);
  float T = exp(-od);
  float midY = uCamPos.y + rd.y * min(dist, 260.0) * 0.5;
  vec3 fogCol = mix(uFogHigh, uFogLow, exp(-max(midY, 0.0) / 45.0));
  vec3 col = inputColor.rgb * T + fogCol * (1.0 - T);

  // Searchlight in-scattering.
  if (uSLOn > 0.5) {
    float t0, t1;
    if (coneInterval(uCamPos, rd, uSLPos, uSLDir, uSLCos, t0, t1)) {
      t0 = max(t0, 0.0);
      t1 = min(t1, dist);
      // limit by range along the axis
      float tAx0 = dot(uSLPos - uCamPos, uSLDir);
      if (t1 > t0) {
        float seg = t1 - t0;
        float jitter = fh(uv * 1037.0 + fract(uTime) * 13.0);
        float steps = uVolSteps;
        float dt = seg / steps;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 24; i++) {
          if (float(i) >= steps) break;
          float tt = t0 + (float(i) + jitter) * dt;
          vec3 p = uCamPos + rd * tt;
          vec3 lp = p - uSLPos;
          float ax = dot(lp, uSLDir);
          float r2 = dot(lp, lp);
          float cosP = ax / sqrt(r2);
          float spot = smoothstep(uSLCos, mix(uSLCos, 1.0, 0.55), cosP);
          float atten = 1.0 / (1.0 + r2 * 0.00045) * smoothstep(uSLRange, uSLRange * 0.6, ax);
          float dens = uFogDensity * exp(-F * max(p.y, 0.0)) * 6.0 + 0.0018;
          float drizzle = 0.55 + 0.9 * fnoise3(p * vec3(0.35, 0.08, 0.35) + vec3(0.0, uTime * 1.6, 0.0));
          // forward-scattering phase (Henyey-Greenstein g = 0.6)
          float mu = dot(rd, normalize(lp));
          float g = 0.6;
          float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * -mu, 1.5) * 0.08;
          float trans = exp(-uFogDensity * tt * 0.6);
          acc += spot * atten * dens * drizzle * phase * trans;
        }
        col += uSLColor * acc * dt;
      }
    }
  }

  // Backlit drizzle: thin streaks only visible where the scene behind them is bright.
  if (uRainAmount > 0.0) {
    float lum = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    float far = smoothstep(4.0, 30.0, dist);
    float r = rainLayer(uv, 220.0, 2.4, 1.0) * 0.6 + rainLayer(uv + 0.37, 140.0, 1.7, 7.0) * 0.4;
    float backlit = smoothstep(0.05, 1.5, lum);
    col += r * uRainAmount * far * (fogCol * 0.6 + backlit * 0.35 * inputColor.rgb / max(lum, 1e-3));
  }

  outputColor = vec4(col, inputColor.a);
}
`;

export class FogEffect extends Effect {
  constructor(camera, opts = {}) {
    super('FogEffect', FRAG, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['uInvProj', new THREE.Uniform(new THREE.Matrix4())],
        ['uCamWorld', new THREE.Uniform(new THREE.Matrix4())],
        ['uCamPos', new THREE.Uniform(new THREE.Vector3())],
        ['uFogLow', new THREE.Uniform(new THREE.Color(0.42, 0.13, 0.035).multiplyScalar(opts.fogBrightness ?? 0.22))],
        ['uFogHigh', new THREE.Uniform(new THREE.Color(0.2, 0.075, 0.035).multiplyScalar(opts.fogBrightness ?? 0.22))],
        ['uFogDensity', new THREE.Uniform(opts.density ?? 0.0039)],
        ['uFogFalloff', new THREE.Uniform(opts.falloff ?? 0.011)],
        ['uTime', new THREE.Uniform(0)],
        ['uRainAmount', new THREE.Uniform(opts.rain ?? 0.0)],
        ['uSLOn', new THREE.Uniform(0)],
        ['uSLPos', new THREE.Uniform(new THREE.Vector3())],
        ['uSLDir', new THREE.Uniform(new THREE.Vector3(0, -1, 0))],
        ['uSLCos', new THREE.Uniform(Math.cos(0.12))],
        ['uSLColor', new THREE.Uniform(new THREE.Color(1, 0.95, 0.85).multiplyScalar(40))],
        ['uSLRange', new THREE.Uniform(420)],
        ['uVolSteps', new THREE.Uniform(opts.volSteps ?? 10)],
      ]),
    });
    this.cam = camera;
  }

  update(renderer, inputBuffer, deltaTime) {
    const u = this.uniforms;
    const cam = this.cam;
    u.get('uInvProj').value.copy(cam.projectionMatrixInverse);
    u.get('uCamWorld').value.copy(cam.matrixWorld);
    u.get('uCamPos').value.setFromMatrixPosition(cam.matrixWorld);
  }

  setSearchlight(pos, dir, angle, color, intensity) {
    const u = this.uniforms;
    u.get('uSLOn').value = 1;
    u.get('uSLPos').value.copy(pos);
    u.get('uSLDir').value.copy(dir).normalize();
    u.get('uSLCos').value = Math.cos(angle);
    u.get('uSLColor').value.copy(color).multiplyScalar(intensity);
  }
}
