import * as THREE from 'three';

// Low cloud deck lit from below by sodium light pollution. The height fog in post
// does most of the work near the horizon; this supplies texture overhead.
export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w * 0.99999; // keep at far plane
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float a = 0.5, s = 0.0;
        for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        // project onto a cloud plane
        vec2 cp = d.xz / max(d.y, 0.06) * 0.9 + vec2(uTime * 0.012, uTime * 0.004);
        float c = fbm(cp * 1.4);
        float c2 = fbm(cp * 4.0 + 3.0);
        float clouds = smoothstep(0.25, 0.85, c * 0.75 + c2 * 0.35);
        // the plane projection stretches into streaks at grazing angles: fade to a flat deck
        float horizon = smoothstep(0.03, 0.3, d.y);
        clouds = mix(0.45, clouds, horizon);
        vec3 sodium = vec3(1.0, 0.42, 0.16);
        vec3 base = vec3(0.012, 0.008, 0.010);
        // cloud underside brightness falls off away from the horizon (city glow)
        float glow = mix(0.15, 0.035, pow(h, 0.55));
        vec3 col = base + sodium * glow * (0.35 + 0.9 * clouds);
        // faint magenta/cyan neon bounce in patches
        float tint = mix(0.5, fbm(cp * 0.6 + 11.0), horizon);
        col += vec3(0.25, 0.02, 0.18) * 0.05 * smoothstep(0.55, 0.8, tint) * clouds;
        col += vec3(0.0, 0.12, 0.16) * 0.04 * smoothstep(0.6, 0.85, 1.0 - tint) * clouds;
        col *= 1.0 - 0.35 * smoothstep(0.2, 1.0, h);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2800, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return {
    object: mesh,
    update(t, camera) {
      mat.uniforms.uTime.value = t;
      mesh.position.copy(camera.position);
    },
  };
}
