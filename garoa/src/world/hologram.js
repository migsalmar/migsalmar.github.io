import * as THREE from 'three';
import { BANDEIRA } from './layout.js';

// Grupo Bandeira's holographic billboard, projected out over the valley from an emitter on
// the tower's podium. The brand borrows the São Paulo flag's black-and-white stripes and red
// canton; "bandeira" also names the bandeirantes, the colonial slave-raiding expeditions the
// city still memorialises as pioneers. The taglines lean into that.

const LINES = [
  'GRUPO BANDEIRA',
  'DESBRAVANDO O AMANHÃ',
  'ÁGUA · CRÉDITO · SEGURANÇA',
  'SU FUTURO, ASEGURADO',
  'PARCELE SUA CIDADANIA EM 24X',
  'SÃO PAULO NÃO PODE PARAR',
  'CONTRATANDO: DRONES DE COBRANÇA',
];

function textTexture() {
  const W = 2048;
  const rowH = 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = rowH * 8;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  LINES.forEach((t, i) => {
    const size = i === 0 ? 132 : 92;
    g.font = `700 ${size}px "Arial Narrow", "Roboto Condensed", "DejaVu Sans Condensed", Arial, sans-serif`;
    // squeeze long lines to fit
    const m = g.measureText(t).width;
    const sx = Math.min(1, (W - 120) / m);
    g.save();
    g.translate(W / 2, rowH * (i + 0.5));
    g.scale(sx, 1);
    g.fillText(t, 0, 0);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.userData = { rows: 8, lines: LINES.length };
  return tex;
}

const HOLO_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const HOLO_FRAG = /* glsl */ `
  uniform sampler2D uText;
  uniform float uTime;
  uniform float uAspect;
  uniform float uIntensity;
  varying vec2 vUv;
  float hh(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float hh2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float textRow(vec2 uv, float row) {
    // uv in [0,1]^2 of the text box; rows stacked top to bottom in the texture
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    vec2 t = vec2(uv.x, 1.0 - (row + 1.0 - uv.y) / 8.0);
    return texture2D(uText, t).r;
  }
  // The billboard's content in local uv (x 0..1 across, y 0..1 up). Returns rgb intensity.
  vec3 content(vec2 uv) {
    vec3 col = vec3(0.0);
    float t = uTime;
    // waving flag panel: 13 stripes, red canton with a ring
    vec2 fp = (uv - vec2(0.1, 0.56)) / vec2(0.8, 0.36);
    if (fp.x > 0.0 && fp.x < 1.0 && fp.y > 0.0 && fp.y < 1.0) {
      float wave = sin(fp.x * 7.0 - t * 2.2) * 0.035 * fp.x;
      float y = fp.y + wave;
      float shade = 0.75 + 0.25 * cos(fp.x * 7.0 - t * 2.2);
      float stripe = mod(floor(y * 13.0), 2.0);
      vec3 c = mix(vec3(0.08, 0.09, 0.1), vec3(1.0, 0.96, 0.94), stripe);
      vec2 cp = vec2(fp.x / 0.38, (y - 0.46) / 0.54);
      if (cp.x < 1.0 && cp.y > 0.0 && y < 1.0) {
        c = vec3(1.0, 0.06, 0.05);
        vec2 q = (cp - 0.5) * vec2(0.38 * uAspect / 0.54 * 0.8 / 0.36, 1.0);
        float r = length(q);
        c = mix(c, vec3(1.0), smoothstep(0.3, 0.29, r) * smoothstep(0.2, 0.21, r));
        // four stars
        for (int k = 0; k < 4; k++) {
          float a = float(k) * 1.5708 + 0.785;
          vec2 sp = q - vec2(cos(a), sin(a)) * 0.38;
          c = mix(c, vec3(1.0, 0.85, 0.3), smoothstep(0.045, 0.03, length(sp)));
        }
      }
      if (y < 0.0 || y > 1.0) c = vec3(0.0);
      col += c * shade;
    }
    // company name
    col += vec3(1.0, 0.95, 0.92) * textRow((uv - vec2(0.06, 0.42)) / vec2(0.88, 0.11), 0.0) * 1.2;
    // rotating tagline with a typing reveal
    float slot = floor(t / 4.0);
    float line = 1.0 + mod(slot, 6.0);
    float reveal = clamp(fract(t / 4.0) * 2.2, 0.0, 1.0);
    vec2 tu = (uv - vec2(0.04, 0.29)) / vec2(0.92, 0.09);
    float tx = textRow(tu, line) * step(tu.x, reveal);
    col += vec3(1.0, 0.22, 0.18) * tx * 1.3;
    // ticker graph: a line climbing forever
    vec2 gp = (uv - vec2(0.1, 0.06)) / vec2(0.8, 0.17);
    if (gp.x > 0.0 && gp.x < 1.0 && gp.y > 0.0 && gp.y < 1.0) {
      float x = gp.x * 24.0 + t * 1.5;
      float v = 0.15 + 0.6 * gp.x + 0.08 * sin(x * 1.3) + 0.05 * (hh(floor(x)) - 0.5);
      col += vec3(0.9, 1.0, 1.0) * smoothstep(0.03, 0.0, abs(gp.y - v)) * 1.1;
      col += vec3(1.0, 0.1, 0.08) * 0.12 * step(gp.y, v);
      col += vec3(0.6) * 0.15 * step(0.97, fract(gp.x * 12.0));
    }
    // frame
    vec2 e = min(uv, 1.0 - uv);
    col += vec3(1.0, 0.3, 0.25) * smoothstep(0.008, 0.0, abs(min(e.x * uAspect, e.y) - 0.012)) * 0.9;
    return col;
  }
  void main() {
    vec2 uv = vUv;
    float t = uTime;
    // glitch: occasional horizontal tearing bands
    float g = step(0.93, hh(floor(t * 7.0)));
    float band = step(0.8, hh2(vec2(floor(uv.y * 24.0), floor(t * 7.0))));
    uv.x += g * band * (hh(floor(t * 31.0) + uv.y) - 0.5) * 0.08;
    // chromatic fringing
    float ca = 0.0025 + g * 0.01;
    vec3 col;
    col.r = content(uv + vec2(ca, 0.0)).r;
    col.g = content(uv).g;
    col.b = content(uv - vec2(ca, 0.0)).b;
    col += vec3(0.0, 0.25, 0.3) * (content(uv - vec2(ca * 2.0, 0.0)).g - col.g) * 0.5;
    // field: faint glow so the hologram has volume where it is empty
    col += vec3(0.25, 0.05, 0.05) * 0.06;
    // scanlines and a sweeping refresh bar
    float scan = 0.72 + 0.28 * sin(uv.y * 900.0);
    float sweep = 1.0 + 1.6 * smoothstep(0.03, 0.0, abs(fract(uv.y - t * 0.17) - 0.5));
    float flick = 0.9 + 0.1 * hh(floor(t * 24.0));
    float edge = smoothstep(0.0, 0.03, uv.x) * smoothstep(1.0, 0.97, uv.x) * smoothstep(0.0, 0.02, uv.y) * smoothstep(1.0, 0.98, uv.y);
    gl_FragColor = vec4(col * scan * sweep * flick * edge * uIntensity, 1.0);
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    // vUv.y: 0 at emitter, 1 at billboard
    float fade = smoothstep(0.0, 0.08, vUv.y) * (0.35 + 0.65 * (1.0 - vUv.y));
    float rays = 0.5 + 0.5 * sin(vUv.x * 120.0 + uTime * 3.0) * sin(vUv.x * 37.0 - uTime * 1.3);
    gl_FragColor = vec4(vec3(1.0, 0.25, 0.2) * 0.05 * fade * (0.5 + rays), 1.0);
  }
`;

export function createHologram() {
  const group = new THREE.Group();
  group.name = 'bandeira-hologram';
  const W = 40;
  const H = 40;
  const shaftFace = BANDEIRA.x1 - 4; // east face of the shaft
  const center = new THREE.Vector3(shaftFace + 11, 68, (BANDEIRA.z0 + BANDEIRA.z1) / 2 + 4);
  const yaw = Math.PI / 2 - 0.42; // face east, turned toward the south end of the valley

  const text = textTexture();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uText: { value: text }, uTime: { value: 0 }, uAspect: { value: W / H }, uIntensity: { value: 3.4 } },
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  board.position.copy(center);
  board.rotation.y = yaw;
  board.renderOrder = 3;
  group.add(board);

  // Emitter on the podium roof and the projection frustum to the board's corners.
  const emitter = new THREE.Vector3(BANDEIRA.x1 - 2, 45.5, center.z);
  board.updateMatrixWorld();
  const corners = [
    [-W / 2, -H / 2],
    [W / 2, -H / 2],
    [W / 2, H / 2],
    [-W / 2, H / 2],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(board.matrixWorld));
  const pos = [];
  const uv = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    pos.push(...emitter.toArray(), ...a.toArray(), ...b.toArray());
    uv.push(0.5, 0, i / 4, 1, (i + 1) / 4, 1);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: mat.uniforms.uTime },
    vertexShader: HOLO_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(bg, beamMat);
  beam.renderOrder = 2;
  group.add(beam);
  // emitter housing
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.6, 1.4, 16),
    new THREE.MeshStandardMaterial({ color: 0x111014, metalness: 0.9, roughness: 0.3, emissive: 0xff3322, emissiveIntensity: 0.6 }),
  );
  housing.position.copy(emitter).add(new THREE.Vector3(0, -0.6, 0));
  group.add(housing);

  // The board lights its surroundings red-white.
  const spill = new THREE.PointLight(0xff5040, 900, 140, 2);
  spill.position.copy(center).add(new THREE.Vector3(10, -6, 0));
  group.add(spill);

  return {
    group,
    uniforms: mat.uniforms,
    spill,
    center,
  };
}
