import * as THREE from 'three';

// Obstruction lights. Most flash red in sync (about 40 per minute, as obstruction lights
// on a common controller do), some burn steady, and the Bandeira spire has white strobes.
// Billboarded HDR dots; bloom draws the halo.

const VERT = /* glsl */ `
  attribute vec4 aLight; // size, phase, mode (0 sync flash, 1 steady, 2 white strobe), unused
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vec3 c = instanceMatrix[3].xyz;
    vec4 mv = viewMatrix * vec4(c, 1.0);
    float dist = -mv.z;
    // keep a minimum apparent size so far lights still register
    float size = max(aLight.x, dist * 0.0035);
    mv.xy += position.xy * size;
    vUv = position.xy + 0.5;
    float t = uTime + aLight.y;
    float on;
    if (aLight.z < 0.5) on = smoothstep(0.0, 0.05, fract(t * 0.667)) * smoothstep(0.55, 0.4, fract(t * 0.667));
    else if (aLight.z < 1.5) on = 0.55;
    else on = step(fract(t * 0.95), 0.06);
    vColor = (aLight.z > 1.5 ? vec3(1.0, 0.97, 0.92) * 60.0 : vec3(1.0, 0.04, 0.02) * 22.0) * on;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = exp(-r * r * 6.0);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

export function createAviationLights(list, rnd) {
  const n = list.length;
  const geo = new THREE.PlaneGeometry(1, 1);
  const data = new Float32Array(n * 4);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4();
  list.forEach((l, i) => {
    m.makeTranslation(l.x, l.y, l.z);
    mesh.setMatrixAt(i, m);
    const steady = !l.white && rnd() < 0.18;
    const phase = steady ? 0 : l.white ? 0.3 : rnd() < 0.85 ? 0 : rnd() * 1.5; // most in sync
    data.set([l.size * 1.2, phase, l.white ? 2 : steady ? 1 : 0, 0], i * 4);
  });
  geo.setAttribute('aLight', new THREE.InstancedBufferAttribute(data, 4));
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.name = 'aviation-lights';
  return { mesh, uniforms: mat.uniforms };
}
