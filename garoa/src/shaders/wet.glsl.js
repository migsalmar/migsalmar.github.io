// Shared wet-surface model. The ground material and the SSR pass both evaluate these
// functions in world space so puddles, wetness and rain ripples line up exactly.

export const WET_GLSL = /* glsl */ `
float wHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y);
}
// 0 = damp stone, 1 = standing water
float puddleMask(vec2 xz) {
  float n = wNoise(xz * 0.075) * 0.6 + wNoise(xz * 0.23 + 4.1) * 0.3 + wNoise(xz * 0.9 + 9.7) * 0.1;
  return smoothstep(0.5, 0.6, n);
}
// Slope (d height / dx, d height / dz) of expanding raindrop rings in standing water.
vec2 rippleSlope(vec2 xz, float t) {
  vec2 acc = vec2(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    vec2 p = xz * (2.4 + fl * 1.3) + fl * 17.3;
    vec2 id = floor(p);
    vec2 f = fract(p) - 0.5;
    float h = wHash(id + fl * 3.1);
    vec2 off = vec2(wHash(id + 7.1), wHash(id + 3.7)) - 0.5;
    vec2 d = f - off * 0.5;
    float ph = fract(t * (0.8 + 0.6 * h) + h);
    float r = length(d);
    float ring = ph * 0.5;
    float x = r - ring;
    float w = cos(x * 45.0) * exp(-x * x * 900.0) * (1.0 - ph) * (1.0 - ph);
    acc += (d / max(r, 1e-3)) * w;
  }
  return acc * 0.22;
}
`;
