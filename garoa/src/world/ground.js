import * as THREE from 'three';
import { WET_GLSL } from '../shaders/wet.glsl.js';
import { LAMPS_GLSL, LAMPS_DIRECT_GLSL, lampUniforms, LAMP_ROWS, lampPositions } from '../shaders/lamps.glsl.js';
import { VALLEY } from './layout.js';

// Calçada paulista: black basalt and white limestone set in a stylised outline of São Paulo
// state, after Mirthes Bernardes' 1966 design. The motif tile is painted on a canvas; the
// shader cuts the floor into individual stones (Voronoi), and each stone takes the motif
// colour at its centre, so the outline is built out of whole stones like the real thing.

const CALCADA_TILE = 1.6; // meters per motif repeat

// Stylised outline, normalised to [0,1]^2 (x east, y south). Straight runs, as the
// pavement version is a geometric simplification rather than a map.
const SP_OUTLINE = [
  [0.0, 0.47], [0.14, 0.33], [0.3, 0.27], [0.46, 0.17], [0.6, 0.15], [0.7, 0.06],
  [0.8, 0.12], [0.84, 0.24], [0.94, 0.27], [1.0, 0.36], [0.9, 0.45], [0.76, 0.55],
  [0.62, 0.63], [0.5, 0.73], [0.44, 0.86], [0.36, 0.84], [0.32, 0.7], [0.2, 0.63],
  [0.1, 0.56],
];

function calcadaTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#000';
  const draw = (cx, cy, w) => {
    g.beginPath();
    SP_OUTLINE.forEach(([x, y], i) => {
      const px = cx + (x - 0.5) * w;
      const py = cy + (y - 0.5) * w * 0.82;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    g.fill();
  };
  // staggered lattice: one motif in the middle, quarters at the corners
  const w = S * 0.5;
  draw(S / 2, S / 2, w);
  for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S]]) draw(x, y, w);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 8;
  return t;
}

// Wet ground material (mode 'calcada' for the valley floor, 'pavers' for the viaduct deck).
export function createWetGroundMaterial({ mode = 'calcada', pattern = null, timeUniform }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0, envMapIntensity: 0.55 });
  const uniforms = {
    ...lampUniforms(),
    uPattern: { value: pattern },
    uTime: timeUniform,
  };
  mat.userData.uniforms = uniforms;
  mat.customProgramCacheKey = () => 'garoa-ground-' + mode;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = shader.defines || {};
    if (mode === 'pavers') shader.defines.PAVERS = '';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLampWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLampWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLampWorld;
        uniform sampler2D uPattern;
        uniform float uTime;
        ${WET_GLSL}
        ${LAMPS_GLSL}
        struct GSurf { vec3 albedo; float rough; vec2 slope; float metal; };
        // Voronoi stones: returns cell centre, distance to the cell edge, and a cell id.
        void stones(vec2 p, out vec2 center, out float edge, out float id) {
          vec2 ip = floor(p), fp = fract(p);
          float d1 = 8.0, d2 = 8.0; vec2 b1 = vec2(0.0), b2 = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 gg = vec2(float(i), float(j));
            vec2 o = vec2(wHash(ip + gg), wHash(ip + gg + 19.31)) * 0.8 + 0.1;
            vec2 r = gg + o - fp;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = r; }
            else if (d < d2) { d2 = d; b2 = r; }
          }
          center = p + b1;
          edge = dot(0.5 * (b1 + b2), normalize(b2 - b1));
          id = wHash(floor(center * 7.13));
        }
        GSurf groundSurface(vec3 wp) {
          GSurf s;
          s.metal = 0.0;
          vec2 xz = wp.xz;
          float puddle = puddleMask(xz);
          float grime = wNoise(xz * 0.35) * 0.5 + wNoise(xz * 2.1) * 0.5;
        #ifdef PAVERS
          // granite setts, running bond, 0.6 x 0.3 m
          vec2 q = vec2(xz.x / 0.6, xz.y / 0.3);
          q.x += mod(floor(q.y), 2.0) * 0.5;
          vec2 cell = floor(q);
          vec2 f = fract(q);
          float id = wHash(cell);
          float jx = min(f.x, 1.0 - f.x) * 0.6, jy = min(f.y, 1.0 - f.y) * 0.3;
          float joint = smoothstep(0.004, 0.012, min(jx, jy));
          vec3 stone = vec3(0.21, 0.205, 0.2) * (0.75 + 0.5 * id) * (0.85 + 0.3 * grime);
          s.albedo = mix(vec3(0.02), stone * 0.62, joint);
          s.rough = mix(0.75, mix(0.42, 0.28, id), joint);
          vec2 tilt = (vec2(wHash(cell + 3.1), wHash(cell + 8.7)) - 0.5) * 0.04;
          s.slope = tilt * joint;
        #else
          float scale = 0.06; // stone size in meters
          vec2 p = xz / scale;
          float px = length(fwidth(p));
          float farMix = smoothstep(0.35, 1.1, px);
          vec2 center; float edge; float id;
          stones(p, center, edge, id);
          vec2 tuv = center * scale / ${CALCADA_TILE.toFixed(3)};
          float black = 1.0 - textureLod(uPattern, tuv, 0.0).r;
          // borders: dark basalt band along both façades, then a steel drain channel
          float ax = abs(xz.x);
          if (ax > ${(VALLEY.halfWidth - 2.6).toFixed(2)}) black = 1.0;
          vec3 white = vec3(0.66, 0.64, 0.58) * (0.82 + 0.3 * id);
          vec3 basalt = vec3(0.045, 0.045, 0.05) * (0.8 + 0.5 * id);
          vec3 stoneCol = mix(white * 0.55, basalt * 0.8, step(0.5, black)); // wet darkening baked in
          float joint = smoothstep(0.01, 0.06, edge);
          vec3 detail = mix(vec3(0.035, 0.03, 0.025), stoneCol, joint);
          float rDetail = mix(0.78, mix(0.38, 0.24, id), joint);
          // far: average the motif with mipmaps instead of resolving stones
          float blackAvg = 1.0 - texture2D(uPattern, xz / ${CALCADA_TILE.toFixed(3)}).r;
          if (ax > ${(VALLEY.halfWidth - 2.6).toFixed(2)}) blackAvg = 1.0;
          vec3 avg = mix(white * 0.5, basalt * 0.8, blackAvg) * 0.92;
          s.albedo = mix(detail, avg, farMix);
          s.rough = mix(rDetail, 0.4, farMix);
          // domed stones
          vec2 toC = center - p;
          s.slope = -toC * 0.35 * (1.0 - joint) * (1.0 - farMix);
          s.slope += (vec2(wHash(center), wHash(center + 4.4)) - 0.5) * 0.05 * (1.0 - farMix);
          if (ax > ${(VALLEY.halfWidth - 0.9).toFixed(2)} && ax < ${(VALLEY.halfWidth - 0.3).toFixed(2)}) {
            float bar = step(0.45, fract(xz.y * 22.0));
            s.albedo = vec3(0.03) * (0.5 + bar);
            s.rough = 0.35;
            s.slope = vec2(0.0);
            s.metal = 0.8;
            puddle = 0.0;
          }
        #endif
          s.albedo *= mix(0.75, 1.05, grime);
          // standing water: darker, mirror-smooth, rippling with rain
          vec2 rip = rippleSlope(xz, uTime);
          s.albedo = mix(s.albedo, s.albedo * 0.45, puddle);
          s.rough = mix(s.rough, 0.025, puddle);
          s.slope = mix(s.slope, rip, puddle);
          return s;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `GSurf gs = groundSurface(vLampWorld);
        diffuseColor.rgb = gs.albedo;`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gs.rough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gs.metal;')
      .replace(
        '#include <normal_fragment_maps>',
        `{
          vec3 nW = normalize(vec3(-gs.slope.x, 1.0, -gs.slope.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`,
      )
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LAMPS_DIRECT_GLSL);
  };
  return mat;
}

export function createGround(valleyFloor, deck, timeUniform) {
  const pattern = calcadaTexture();
  valleyFloor.material = createWetGroundMaterial({ mode: 'calcada', pattern, timeUniform });
  valleyFloor.receiveShadow = true;
  deck.material = createWetGroundMaterial({ mode: 'pavers', timeUniform });
  deck.receiveShadow = true;

  // Floor lamp posts matching the lighting rows.
  const group = new THREE.Group();
  group.name = 'floor-lamps';
  const positions = [...lampPositions(LAMP_ROWS[0]), ...lampPositions(LAMP_ROWS[1])];
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 1, 8).translate(0, 0.5, 0);
  const armGeo = new THREE.BoxGeometry(1.2, 0.08, 0.12);
  const headGeo = new THREE.CylinderGeometry(0.34, 0.2, 0.22, 12);
  const metal = new THREE.MeshStandardMaterial({ color: 0x1d1c1b, metalness: 0.85, roughness: 0.4 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.5, 0.18).multiplyScalar(14) });
  const poles = new THREE.InstancedMesh(poleGeo, metal, positions.length);
  const arms = new THREE.InstancedMesh(armGeo, metal, positions.length);
  const heads = new THREE.InstancedMesh(headGeo, glow, positions.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  positions.forEach((lp, i) => {
    const towardCenter = lp.x > 0 ? -1 : 1;
    const poleX = lp.x - towardCenter * 0.6;
    m.compose(p.set(poleX, 0, lp.z), q, s.set(1, lp.y + 0.15, 1));
    poles.setMatrixAt(i, m);
    m.compose(p.set(lp.x - towardCenter * 0.05, lp.y + 0.2, lp.z), q, s.set(1, 1, 1));
    arms.setMatrixAt(i, m);
    m.compose(p.set(lp.x, lp.y, lp.z), q, s.set(1, 1, 1));
    heads.setMatrixAt(i, m);
  });
  for (const im of [poles, arms, heads]) im.frustumCulled = false;
  group.add(poles, arms, heads);
  return { group, pattern, polePositions: positions.map((lp) => new THREE.Vector3(lp.x - (lp.x > 0 ? 0.6 : -0.6), 0, lp.z)) };
}
