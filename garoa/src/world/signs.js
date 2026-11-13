import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MARTINELLI } from './layout.js';

// Neon signage in Portuguese and Spanish. Every sign is painted once into a shared canvas
// atlas as glowing tubes, then drawn as additive HDR quads (one draw call) in front of dark
// backing boxes (one draw call). A few signs get real point lights for colored spill.

const C = {
  pink: '#ff2a8a',
  cyan: '#2ee6ff',
  green: '#3dff6e',
  red: '#ff2a1e',
  amber: '#ffb52e',
  violet: '#9a5cff',
  white: '#fff3e0',
  orange: '#ff7a1a',
};

// Fascia signs over shopfronts. Mix of the centro's everyday commerce, the Bolivian and
// Paraguayan communities' Spanish, and 2087 (implants sold on installments, bottled water).
const FASCIA = [
  { text: 'FARMÁCIA 24H', color: C.green },
  { text: 'COMPRO OURO', color: C.amber },
  { text: 'LANCHONETE', color: C.red },
  { text: 'CERVEZA FRÍA', color: C.cyan },
  { text: 'SALTEÑAS', color: C.orange },
  { text: 'CHOPP GELADO', color: C.amber },
  { text: 'ENVÍOS · REMESAS', color: C.violet },
  { text: 'IMPLANTES EM 12X', color: C.pink },
  { text: 'CÂMBIO', color: C.green },
  { text: 'ABIERTO 24 HORAS', color: C.red },
  { text: 'PASTELARIA', color: C.amber },
  { text: 'CONSERTO DE CELULAR', color: C.cyan },
  { text: 'ÁGUA POTÁVEL R$9,90/L', color: C.cyan },
  { text: 'LOCUTORIO', color: C.pink },
  { text: 'PRÓTESIS · CUOTAS', color: C.violet },
  { text: 'BAR DO ZÉ', color: C.orange },
  { text: 'SE ALQUILA', color: C.white },
  { text: 'PADARIA', color: C.amber },
  { text: 'RECARGA', color: C.green },
  { text: 'CAMBIO DE DIVISAS', color: C.amber },
];
const BLADES = [
  { text: 'HOTEL', color: C.red },
  { text: 'BAR', color: C.pink },
  { text: 'MOTEL', color: C.violet },
  { text: 'HOSTAL', color: C.cyan },
  { text: 'BOATE', color: C.pink },
  { text: 'SAUNA', color: C.amber },
  { text: 'PENSÃO', color: C.green },
  { text: 'KARAOKÊ', color: C.cyan },
];
const ROOFTOP = [
  { text: 'CRÉDITO FÁCIL', color: C.red },
  { text: 'SEGUROS BANDEIRA', color: C.white },
  { text: 'CLÍNICA NEURAL', color: C.cyan },
];

const FONT = '"Arial Narrow", "Roboto Condensed", "DejaVu Sans Condensed", "Liberation Sans Narrow", Arial, sans-serif';

function paintNeon(g, text, color, x, y, size, vertical) {
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.font = `700 ${size}px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  const draw = (fn) => {
    if (!vertical) fn(text, x, y);
    else [...text].forEach((ch, i) => fn(ch, x, y + (i - (text.length - 1) / 2) * size * 1.02));
  };
  // halo, tube, hot core
  g.shadowColor = color;
  g.shadowBlur = size * 0.45;
  g.strokeStyle = color;
  g.lineWidth = size * 0.085;
  draw((t, a, b) => g.strokeText(t, a, b));
  g.shadowBlur = size * 0.15;
  g.lineWidth = size * 0.06;
  draw((t, a, b) => g.strokeText(t, a, b));
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = size * 0.022;
  draw((t, a, b) => g.strokeText(t, a, b));
  g.restore();
}

function buildAtlas(entries) {
  const W = 2048;
  const meas = document.createElement('canvas').getContext('2d');
  const items = entries.map((e) => {
    const size = e.vertical ? 92 : 96;
    meas.font = `700 ${size}px ${FONT}`;
    let w;
    let h;
    if (e.vertical) {
      w = 150;
      h = Math.ceil(e.text.length * size * 1.02 + 70);
    } else {
      w = Math.ceil(meas.measureText(e.text).width + 90);
      h = 150;
    }
    return { ...e, size, w: Math.min(w, W), h };
  });
  // shelf packing
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const it of items) {
    if (x + it.w > W) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    it.x = x;
    it.y = y;
    x += it.w;
    shelf = Math.max(shelf, it.h);
  }
  const H = THREE.MathUtils.ceilPowerOfTwo(y + shelf);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  for (const it of items) paintNeon(g, it.text, it.color, it.x + it.w / 2, it.y + it.h / 2, it.size, it.vertical);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  for (const it of items) {
    it.u0 = it.x / W;
    it.u1 = (it.x + it.w) / W;
    it.v0 = 1 - (it.y + it.h) / H;
    it.v1 = 1 - it.y / H;
    it.aspect = it.w / it.h;
  }
  return { tex, items };
}

// Quad facing `normal` (axis aligned), centered at p, of size w x h, with atlas UVs.
function quad(p, normal, w, h, it, extra) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, THREE.MathUtils.lerp(it.u0, it.u1, uv.getX(i)), THREE.MathUtils.lerp(it.v0, it.v1, uv.getY(i)));
  }
  const yaw = Math.atan2(normal.x, normal.z);
  g.rotateY(yaw);
  g.translate(p.x, p.y, p.z);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set(extra, i * 3);
  g.setAttribute('aNeon', new THREE.BufferAttribute(a, 3));
  return g;
}

function boxAt(cx, cy, cz, sx, sy, sz) {
  return new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy, cz);
}

const NEON_VERT = /* glsl */ `
  attribute vec3 aNeon;
  varying vec2 vUv;
  varying vec3 vNeon;
  void main() {
    vUv = uv;
    vNeon = aNeon;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const NEON_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNeon;
  float nh(float x) { return fract(sin(x * 91.17) * 43758.5453); }
  void main() {
    vec3 c = texture2D(map, vUv).rgb;
    float mode = vNeon.y;
    float ph = vNeon.z;
    float f = 1.0;
    if (mode > 0.5 && mode < 1.5) {
      // buzzing tube with dropouts
      float k = floor(uTime * 14.0 + ph * 50.0);
      f = mix(0.15, 1.0, step(0.07, nh(k + ph))) * (0.92 + 0.08 * sin(uTime * 120.0));
    } else if (mode > 1.5) {
      // slow failing ballast
      float cyc = fract(uTime * 0.23 + ph);
      f = cyc < 0.82 ? 1.0 : step(0.5, nh(floor(uTime * 9.0) + ph)) * 0.8;
    }
    gl_FragColor = vec4(c * vNeon.x * f, 1.0);
  }
`;

export function createSigns(city, rndSeed = 1) {
  const rnd = city.rnd;
  const R = (a, b) => a + (b - a) * rnd();
  const group = new THREE.Group();
  group.name = 'neon-signs';

  const entries = [
    ...FASCIA.map((e) => ({ ...e, kind: 'fascia' })),
    ...BLADES.map((e) => ({ ...e, kind: 'blade', vertical: true })),
    ...ROOFTOP.map((e) => ({ ...e, kind: 'roof' })),
    { text: 'MARTINELLI', color: C.white, kind: 'martinelli' },
  ];
  const { tex, items } = buildAtlas(entries);
  const byKind = (k) => items.filter((i) => i.kind === k);
  const fascia = byKind('fascia');
  const blades = byKind('blade');
  const roofs = byKind('roof');

  const neonGeos = [];
  const boxGeos = [];
  const lights = [];
  const colorOf = (hex) => new THREE.Color(hex);

  let fi = 0;
  let bi = 0;
  let ri = 0;
  for (const tw of city.frontRow) {
    const t0 = tw.tiers[0];
    if (t0.z1 < -205 || t0.z0 > 205) continue;
    const faceW = t0.z1 - t0.z0;
    const n = new THREE.Vector3(-tw.side, 0, 0); // facing into the valley
    const fx = tw.valleyX;
    // fascia sign over the shopfronts
    if (rnd() < 0.85 && faceW > 8) {
      const it = fascia[fi++ % fascia.length];
      let h = R(1.25, 1.75);
      let w = h * it.aspect;
      if (w > faceW - 2) {
        w = faceW - 2;
        h = w / it.aspect;
      }
      const zc = R(t0.z0 + w / 2 + 0.8, t0.z1 - w / 2 - 0.8);
      const y = 3.9 + h / 2;
      const mode = rnd() < 0.15 ? 1 : rnd() < 0.08 ? 2 : 0;
      boxGeos.push(boxAt(fx + n.x * 0.12, y, zc, 0.22, h * 1.12, w * 1.04));
      neonGeos.push(quad(new THREE.Vector3(fx + n.x * 0.25, y, zc), n, w, h, it, [R(3.2, 4.6), mode, rnd()]));
      lights.push({ pos: new THREE.Vector3(fx + n.x * 2.2, 3.2, zc), color: colorOf(it.color), w });
    }
    // projecting blade signs, facing along the valley
    if (rnd() < 0.65) {
      const it = blades[bi++ % blades.length];
      const w = R(1.4, 2.1);
      const h = w / it.aspect;
      const zc = R(t0.z0 + 1.5, t0.z1 - 1.5);
      const y = R(7.5, 13) + h / 2;
      const out = fx + n.x * (w / 2 + 0.35);
      boxGeos.push(boxAt(out, y, zc, w * 1.06, h * 1.04, 0.3));
      boxGeos.push(boxAt(fx + n.x * 0.2, y + h / 2 - 0.3, zc, 0.4, 0.12, 0.12)); // bracket
      const mode = rnd() < 0.25 ? 1 : 0;
      const ins = [R(3.0, 4.2), mode, rnd()];
      // two faces, so it reads from north and south
      neonGeos.push(quad(new THREE.Vector3(out, y, zc + 0.17), new THREE.Vector3(0, 0, 1), w, h, it, ins));
      neonGeos.push(quad(new THREE.Vector3(out, y, zc - 0.17), new THREE.Vector3(0, 0, -1), w, h, it, ins));
    }
    // rooftop billboards on a few lower front-row towers
    const top = tw.tiers[tw.tiers.length - 1];
    if (ri < roofs.length * 2 && top.y1 < 110 && top.y1 > 45 && rnd() < 0.18) {
      const it = roofs[ri++ % roofs.length];
      const w = Math.min(top.z1 - top.z0 - 2, 16);
      const h = w / it.aspect;
      const x = (tw.side > 0 ? top.x0 : top.x1) + n.x * -1.5;
      const zc = (top.z0 + top.z1) / 2;
      const y = top.y1 + h / 2 + 1.2;
      // scaffold frame
      boxGeos.push(boxAt(x - n.x * 0.15, y, zc, 0.15, h * 1.1, w * 1.03));
      for (const dz of [-w * 0.4, 0, w * 0.4]) boxGeos.push(boxAt(x - n.x * 0.8, top.y1 + 0.6 + (h * 0.5 + 0.6) / 2, zc + dz, 0.15, h * 0.5 + 1.2, 0.15));
      neonGeos.push(quad(new THREE.Vector3(x + n.x * 0.05, y, zc), n, w, h, it, [R(3.5, 5), 0, rnd()]));
    }
  }

  // MARTINELLI letters on the crown, facing the valley
  {
    const it = items.find((i) => i.kind === 'martinelli');
    const w = 13;
    const h = w / it.aspect;
    const x = (MARTINELLI.x0 + MARTINELLI.x1) / 2 - 8 - 0.3;
    const zc = (MARTINELLI.z0 + MARTINELLI.z1) / 2;
    neonGeos.push(quad(new THREE.Vector3(x, 108.2, zc), new THREE.Vector3(-1, 0, 0), w, h, it, [3.2, 0, 0]));
  }

  const neonMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTime: { value: 0 } },
    vertexShader: NEON_VERT,
    fragmentShader: NEON_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const neon = new THREE.Mesh(mergeGeometries(neonGeos), neonMat);
  neon.name = 'neon';
  neon.renderOrder = 2;
  neon.frustumCulled = false;
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x0b0a0c, roughness: 0.4, metalness: 0.6 });
  const boxes = new THREE.Mesh(mergeGeometries(boxGeos), boxMat);
  boxes.name = 'sign-boxes';
  boxes.castShadow = true;
  group.add(neon, boxes);

  // Colored spill: real point lights at the fascia signs nearest the middle of the valley.
  lights.sort((a, b) => Math.abs(a.pos.z - 20) - Math.abs(b.pos.z - 20));
  const pointLights = lights.slice(0, 8).map((l) => {
    const pl = new THREE.PointLight(l.color, 60 + l.w * 6, 26, 2);
    pl.position.copy(l.pos);
    group.add(pl);
    return pl;
  });

  return {
    group,
    uniforms: neonMat.uniforms,
    pointLights,
    setLightBudget(n) {
      pointLights.forEach((pl, i) => (pl.visible = i < n));
    },
  };
}
