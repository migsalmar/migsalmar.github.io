import * as THREE from 'three';
import { createBuildingMaterial, WINDOW } from './buildingMaterial.js';
import { VALLEY, MARTINELLI, BANDEIRA } from './layout.js';

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Façade albedo multipliers: grey concrete, sand render, faded pastel paint, white tile, soot.
const PALETTE = [
  [0.55, 0.53, 0.5],
  [0.64, 0.57, 0.46],
  [0.5, 0.5, 0.53],
  [0.68, 0.64, 0.57],
  [0.44, 0.41, 0.39],
  [0.6, 0.5, 0.42],
  [0.42, 0.48, 0.47],
  [0.62, 0.48, 0.43],
  [0.72, 0.7, 0.64],
  [0.33, 0.33, 0.35],
  [0.58, 0.6, 0.5],
];

const STYLE_TABLE = [
  // type, weight, floorH range, bay range, lit range
  { type: WINDOW.PUNCHED, w: 0.36, fh: [2.9, 3.2], bay: [2.2, 3.1], lit: [0.25, 0.5] },
  { type: WINDOW.RIBBON, w: 0.2, fh: [3.4, 3.7], bay: [1.6, 2.1], lit: [0.3, 0.6] },
  { type: WINDOW.CURTAIN, w: 0.16, fh: [3.8, 4.2], bay: [1.5, 1.8], lit: [0.35, 0.65] },
  { type: WINDOW.RESIDENTIAL, w: 0.28, fh: [2.85, 3.0], bay: [2.6, 3.5], lit: [0.3, 0.55] },
];

export function createCity(assets) {
  const rnd = mulberry32(20870214);
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const tiers = [];
  const tanks = [];
  const masts = [];
  const acs = [];
  const aviation = [];
  const towers = [];

  function pickStyle() {
    let x = rnd();
    for (const s of STYLE_TABLE) {
      if ((x -= s.w) <= 0) return s;
    }
    return STYLE_TABLE[0];
  }

  function tier(t) {
    tiers.push(t);
    return t;
  }

  function roofStuff(x0, x1, z0, z1, top, tall, seedish) {
    const w = x1 - x0;
    const d = z1 - z0;
    if (w < 7 || d < 7) return;
    // casa de máquinas (lift machine room) with tanks on top or beside it
    const mw = Math.min(w - 2, R(4, 8));
    const md = Math.min(d - 2, R(4, 7));
    const mx = R(x0 + 1 + mw / 2, x1 - 1 - mw / 2);
    const mz = R(z0 + 1 + md / 2, z1 - 1 - md / 2);
    const mh = R(3, 4.5);
    tier({
      x0: mx - mw / 2, x1: mx + mw / 2, z0: mz - md / 2, z1: mz + md / 2, y0: top, y1: top + mh,
      floorH: 3, bayW: 3, lit: 0, seed: rnd() * 100, type: WINDOW.PLAIN, flags: 0, parapet: 0, wet: 0.9,
      color: pick(PALETTE).map((c) => c * 0.8),
    });
    const nt = rnd() < 0.75 ? 1 + Math.floor(rnd() * 3) : 0;
    for (let i = 0; i < nt; i++) {
      const r = R(0.9, 1.6);
      const onTop = rnd() < 0.5;
      const tx = onTop ? mx + R(-mw / 2 + r, mw / 2 - r) : R(x0 + r + 0.5, x1 - r - 0.5);
      const tz = onTop ? mz + R(-md / 2 + r, md / 2 - r) : R(z0 + r + 0.5, z1 - r - 0.5);
      const color = rnd() < 0.55 ? [0.1, 0.22, 0.42] : rnd() < 0.5 ? [0.5, 0.5, 0.48] : [0.62, 0.6, 0.55];
      tanks.push({ x: tx, z: tz, y: onTop ? top + mh : top, r, h: R(1.6, 2.6), color });
    }
    const nm = tall ? 1 + Math.floor(rnd() * 2) : rnd() < 0.35 ? 1 : 0;
    for (let i = 0; i < nm; i++) {
      const h = tall ? R(10, 28) : R(4, 10);
      const x = R(x0 + 1, x1 - 1);
      const z = R(z0 + 1, z1 - 1);
      masts.push({ x, z, y: top, h, r: tall ? R(0.15, 0.3) : 0.08 });
      if (tall) aviation.push({ x, y: top + h + 0.4, z, phase: 0, size: 1.0 });
    }
    if (top > 85) {
      aviation.push({ x: x0 + 0.6, y: top + 0.6, z: z0 + 0.6, phase: 0, size: 0.8 });
      aviation.push({ x: x1 - 0.6, y: top + 0.6, z: z1 - 0.6, phase: 0, size: 0.8 });
    }
  }

  // A tower is one or more stacked tiers with optional setbacks, plus roof clutter.
  function tower(spec) {
    const style = spec.style || pickStyle();
    const floorH = spec.floorH || R(style.fh[0], style.fh[1]);
    const bayW = spec.bayW || R(style.bay[0], style.bay[1]);
    const lit = spec.lit ?? R(style.lit[0], style.lit[1]);
    const color = spec.color || pick(PALETTE);
    const seed = rnd() * 1000;
    const blind = spec.blind ?? rnd() < 0.55;
    const flags = (blind ? 1 : 0) + (spec.ground ? 2 : 0);
    const wet = R(0.75, 1.0);
    const parapet = spec.parapet ?? 1.3;
    const base = spec.base;
    const top = base + spec.height;
    let { x0, x1, z0, z1 } = spec;
    const tw = { ...spec, style, floorH, bayW, lit, color, seed, blind, tiers: [] };
    const setback = spec.setback ?? (spec.height > 55 && rnd() < 0.45);
    let y = base;
    if (setback) {
      const yBreak = base + spec.height * R(0.5, 0.8);
      tw.tiers.push(
        tier({ x0, x1, z0, z1, y0: y, y1: yBreak, floorH, bayW, lit, seed, type: style.type, flags, parapet: 1.2, wet, color }),
      );
      const inset = R(2, 5);
      x0 += inset;
      x1 -= inset;
      z0 += inset;
      z1 -= inset;
      y = yBreak;
      tw.tiers.push(
        tier({ x0, x1, z0, z1, y0: y, y1: top, floorH, bayW, lit, seed, type: style.type, flags: flags & 1, parapet, wet, color }),
      );
    } else {
      tw.tiers.push(tier({ x0, x1, z0, z1, y0: y, y1: top, floorH, bayW, lit, seed, type: style.type, flags, parapet, wet, color }));
    }
    if (!spec.noRoof) roofStuff(x0, x1, z0, z1, top, top > 110, seed);
    towers.push(tw);
    return tw;
  }

  // ---- Front rows: towers rooted on the valley floor, their faces forming the canyon walls.
  const gapZ = 11;
  const segments = {
    1: [
      [VALLEY.zMin - 40, MARTINELLI.z0 - 0.5],
      [MARTINELLI.z1 + 0.5, -gapZ],
      [gapZ, VALLEY.zMax + 40],
    ],
    [-1]: [
      [VALLEY.zMin - 40, -gapZ],
      [gapZ, BANDEIRA.z0 - 0.5],
      [BANDEIRA.z1 + 0.5, VALLEY.zMax + 40],
    ],
  };
  const frontRow = [];
  for (const side of [1, -1]) {
    for (const [za, zb] of segments[side]) {
      let z = za;
      while (z < zb - 1) {
        let w = R(12, 28);
        if (zb - (z + w) < 9) w = zb - z;
        const z0 = z + (rnd() < 0.3 ? R(0.3, 2.5) : 0);
        const z1 = z + w;
        const face = VALLEY.halfWidth + (rnd() < 0.4 ? R(0.2, 1.4) : 0);
        const depth = R(18, 30);
        const nearGap = Math.min(Math.abs(z0 - gapZ), Math.abs(z1 + gapZ), Math.abs(z0 + gapZ), Math.abs(z1 - gapZ)) < 2;
        const nearMart = side === 1 && (Math.abs(z1 - MARTINELLI.z0) < 3 || Math.abs(z0 - MARTINELLI.z1) < 3);
        let height = 45 + Math.pow(rnd(), 1.4) * 110;
        if (rnd() < 0.12) height = R(150, 172);
        if (nearGap) height = R(52, 64);
        if (nearMart) height = R(58, 74);
        const x0 = side > 0 ? face : -face - depth;
        const x1 = side > 0 ? face + depth : -face;
        const tw = tower({
          x0, x1, z0, z1, base: 0, height, ground: true,
          // blank platibanda: tall ones are where pixadores write
          parapet: rnd() < 0.6 ? R(2.6, 4.2) : R(1.2, 1.6),
          style: nearGap ? STYLE_TABLE[0] : undefined,
          color: nearGap ? [0.74, 0.7, 0.62] : undefined,
          setback: nearGap ? false : undefined,
        });
        tw.side = side;
        tw.valleyX = side > 0 ? x0 : x1;
        frontRow.push(tw);
        z += w + (rnd() < 0.35 ? R(0.5, 3.5) : 0);
      }
    }
  }

  // ---- Second rows on the ridge plateaus (street level y = 20).
  for (const side of [1, -1]) {
    let z = VALLEY.zMin - 60;
    while (z < VALLEY.zMax + 60) {
      const w = R(14, 32);
      const xa = 61 + R(0, 3);
      const depth = R(22, 48);
      const behindMart = side === 1 && z + w > MARTINELLI.z0 - 20 && z < MARTINELLI.z1 + 20;
      let height = 30 + Math.pow(rnd(), 1.2) * 140;
      if (behindMart) height = Math.min(height, R(30, 62));
      const x0 = side > 0 ? xa : -xa - depth;
      const x1 = side > 0 ? xa + depth : -xa;
      tower({ x0, x1, z0: z, z1: z + w - R(0, 2), base: VALLEY.ridgeY, height, ground: true });
      z += w + R(0, 3);
    }
  }

  // ---- Edifício Martinelli (east ridge): salmon, round-arched windows, stepped crown, palacete on top.
  const M = MARTINELLI;
  const mColor = [0.88, 0.55, 0.45];
  const mBase = { floorH: 3.4, bayW: 2.7, lit: 0.34, type: WINDOW.MARTINELLI, wet: 0.85, color: mColor };
  const mTiers = [];
  mTiers.push(tier({ ...mBase, x0: M.x0, x1: M.x1, z0: M.z0, z1: M.z1, y0: 0, y1: 92, seed: 11, flags: 2, parapet: 0.6 }));
  // cornices
  tier({ ...mBase, type: WINDOW.PLAIN, x0: M.x0 - 0.7, x1: M.x1 + 0.7, z0: M.z0 - 0.7, z1: M.z1 + 0.7, y0: 91.4, y1: 92.3, seed: 12, flags: 0, parapet: 0, color: [0.95, 0.66, 0.55] });
  mTiers.push(tier({ ...mBase, x0: M.x0 + 2.5, x1: M.x1 - 2.5, z0: M.z0 + 2.5, z1: M.z1 - 2.5, y0: 92.3, y1: 99.2, seed: 13, flags: 0, parapet: 0.6 }));
  tier({ ...mBase, type: WINDOW.PLAIN, x0: M.x0 + 1.9, x1: M.x1 - 1.9, z0: M.z0 + 1.9, z1: M.z1 - 1.9, y0: 99.2, y1: 99.9, seed: 14, flags: 0, parapet: 0, color: [0.95, 0.66, 0.55] });
  mTiers.push(tier({ ...mBase, x0: M.x0 + 6.5, x1: M.x1 - 6.5, z0: M.z0 + 6.5, z1: M.z1 - 6.5, y0: 99.9, y1: 105, seed: 15, flags: 0, parapet: 0.6 }));
  const pc = [(M.x0 + M.x1) / 2, (M.z0 + M.z1) / 2];
  mTiers.push(tier({ ...mBase, x0: pc[0] - 8, x1: pc[0] + 8, z0: pc[1] - 7, z1: pc[1] + 7, y0: 105, y1: 111.5, seed: 16, flags: 0, parapet: 0.5, lit: 0.6 }));
  aviation.push({ x: pc[0], y: M.height + 5.8, z: pc[1], phase: 0, size: 1.0 });

  // ---- Grupo Bandeira tower (west ridge): dark glass supertall with LED fins.
  const B = BANDEIRA;
  const bBase = { floorH: 4.0, bayW: 1.6, lit: 0.5, type: WINDOW.BANDEIRA, wet: 1.0, color: [0.16, 0.16, 0.18] };
  tier({ ...bBase, x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, y0: 0, y1: 44, seed: 21, flags: 2, parapet: 1.5 });
  tier({ ...bBase, x0: B.x0 + 4, x1: B.x1 - 4, z0: B.z0 + 4, z1: B.z1 - 4, y0: 44, y1: 236, seed: 22, flags: 0, parapet: 0.8 });
  tier({ ...bBase, x0: B.x0 + 9, x1: B.x1 - 9, z0: B.z0 + 9, z1: B.z1 - 9, y0: 236, y1: B.height, seed: 23, flags: 0, parapet: 2.5 });
  const bc = [(B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2];
  masts.push({ x: bc[0], z: bc[1], y: B.height, h: 42, r: 0.7 });
  aviation.push({ x: bc[0], y: B.height + 42.5, z: bc[1], phase: 0.5, size: 2.2, white: true });
  aviation.push({ x: B.x0 + 9.5, y: B.height + 0.8, z: B.z0 + 9.5, phase: 0, size: 1.2 });
  aviation.push({ x: B.x1 - 9.5, y: B.height + 0.8, z: B.z1 - 9.5, phase: 0, size: 1.2 });
  aviation.push({ x: B.x0 + 9.5, y: B.height + 0.8, z: B.z1 - 9.5, phase: 0, size: 1.2 });
  aviation.push({ x: B.x1 - 9.5, y: B.height + 0.8, z: B.z0 + 9.5, phase: 0, size: 1.2 });

  // ---- Far field: blocks in every direction, with two high-rise clusters to the SW and NE.
  const clusters = [
    { x: -520, z: 640, r: 380, h: 170 },
    { x: 460, z: -520, r: 300, h: 120 },
    { x: -260, z: -420, r: 220, h: 90 },
  ];
  const step = 46;
  for (let gx = -940; gx <= 940; gx += step) {
    for (let gz = -940; gz <= 940; gz += step) {
      const cx = gx + R(-4, 4);
      const cz = gz + R(-4, 4);
      if (Math.abs(cx) < 118 && Math.abs(cz) < 262) continue;
      if (Math.hypot(cx, cz) > 1000) continue;
      const inValleyEnd = Math.abs(cx) < 40;
      const base = inValleyEnd ? 0 : VALLEY.ridgeY;
      let boost = 0;
      for (const c of clusters) boost += c.h * Math.exp(-((cx - c.x) ** 2 + (cz - c.z) ** 2) / (c.r * c.r));
      const n = rnd() < 0.5 ? 1 : 2;
      const bw = step - 12;
      for (let k = 0; k < n; k++) {
        const along = n === 1 ? [0, bw] : k === 0 ? [0, bw * R(0.4, 0.6)] : [bw * R(0.62, 0.7), bw];
        const x0 = cx - bw / 2;
        const z0 = cz - bw / 2 + along[0];
        const z1 = cz - bw / 2 + along[1];
        const height = 18 + Math.pow(rnd(), 1.6) * 75 + boost * R(0.4, 1.2);
        tower({
          x0: x0 + R(0, 4), x1: x0 + bw - R(0, 4), z0, z1, base, height,
          ground: false, noRoof: height < 40 || rnd() < 0.5, setback: height > 100 && rnd() < 0.5,
        });
      }
    }
  }

  // ---- Split air-conditioner condensers under windows on the valley-facing façades.
  for (const tw of frontRow) {
    const t0 = tw.tiers[0];
    const faceW = t0.z1 - t0.z0;
    const nBays = Math.floor(faceW / tw.bayW);
    const prob = tw.style.type === WINDOW.RESIDENTIAL ? 0.3 : tw.style.type === WINDOW.CURTAIN ? 0.03 : 0.17;
    const sill = { 0: 0.3, 1: 0.34, 2: 0.08, 3: 0.26 }[tw.style.type] ?? 0.3;
    const f0 = Math.ceil(4.8 / tw.floorH);
    const f1 = Math.floor((t0.y1 - 2) / tw.floorH) - 1;
    for (let f = f0; f <= f1; f++) {
      for (let i = 0; i < nBays; i++) {
        const zc = t0.z0 + (i + 0.5) * tw.bayW;
        if (zc - t0.z0 < 1.2 || t0.z1 - zc < 1.2) continue;
        if (rnd() > prob) continue;
        const y = f * tw.floorH + sill * tw.floorH - 0.42;
        acs.push({ x: tw.valleyX + tw.side * -0.2, y, z: zc + R(-0.25, 0.25) * tw.bayW, side: tw.side });
      }
    }
  }

  // ---- Build instanced meshes.
  const material = createBuildingMaterial(assets);
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const N = tiers.length;
  const aParams = new Float32Array(N * 4);
  const aStyle = new Float32Array(N * 4);
  const aColor = new Float32Array(N * 3);
  const mesh = new THREE.InstancedMesh(unit, material, N);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  tiers.forEach((t, i) => {
    p.set((t.x0 + t.x1) / 2, t.y0, (t.z0 + t.z1) / 2);
    s.set(t.x1 - t.x0, t.y1 - t.y0, t.z1 - t.z0);
    m4.compose(p, q, s);
    mesh.setMatrixAt(i, m4);
    aParams.set([t.floorH, t.bayW, t.lit, t.seed], i * 4);
    aStyle.set([t.type, t.flags, t.parapet, t.wet], i * 4);
    aColor.set(t.color, i * 3);
  });
  unit.setAttribute('aParams', new THREE.InstancedBufferAttribute(aParams, 4));
  unit.setAttribute('aStyle', new THREE.InstancedBufferAttribute(aStyle, 4));
  unit.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
  mesh.name = 'towers';
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = 'city';
  group.add(mesh);

  // Water tanks (caixas d'água)
  const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0);
  const tankMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.0, color: 0xffffff });
  const tankMesh = new THREE.InstancedMesh(tankGeo, tankMat, tanks.length);
  const col = new THREE.Color();
  tanks.forEach((t, i) => {
    m4.compose(p.set(t.x, t.y, t.z), q, s.set(t.r, t.h, t.r));
    tankMesh.setMatrixAt(i, m4);
    tankMesh.setColorAt(i, col.setRGB(t.color[0], t.color[1], t.color[2]));
  });
  tankMesh.name = 'water-tanks';
  tankMesh.frustumCulled = false;
  tankMesh.castShadow = true;
  group.add(tankMesh);

  // Masts and antennas
  const mastGeo = new THREE.CylinderGeometry(0.6, 1, 1, 6).translate(0, 0.5, 0);
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x302d2b, roughness: 0.5, metalness: 0.8 });
  const mastMesh = new THREE.InstancedMesh(mastGeo, mastMat, masts.length);
  masts.forEach((m, i) => {
    m4.compose(p.set(m.x, m.y, m.z), q, s.set(m.r, m.h, m.r));
    mastMesh.setMatrixAt(i, m4);
  });
  mastMesh.name = 'masts';
  mastMesh.frustumCulled = false;
  group.add(mastMesh);

  // Martinelli palacete roof (hipped, copper-green)
  const roofGeo = new THREE.ConeGeometry(11.2, 5.5, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.88);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x2c4a40, roughness: 0.35, metalness: 0.6 }));
  roof.position.set(pc[0], 111.5 + 2.75, pc[1]);
  group.add(roof);

  // AC condensers
  const acMesh = createACs(acs);
  group.add(acMesh);

  frontRow.sort((a, b) => a.side - b.side || a.z0 - b.z0);
  return { group, material, towers, frontRow, aviation, mesh, rnd, counts: { tiers: N, tanks: tanks.length, masts: masts.length, acs: acs.length } };
}

function acTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b9b2a4';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${60 + Math.random() * 40},${50 + Math.random() * 30},${40},${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  // fan grille
  g.fillStyle = '#1a1918';
  g.beginPath();
  g.arc(52, 64, 40, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#6d6a64';
  g.lineWidth = 1.5;
  for (let r = 8; r < 40; r += 6) {
    g.beginPath();
    g.arc(52, 64, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let a = 0; a < 8; a++) {
    g.beginPath();
    g.moveTo(52, 64);
    g.lineTo(52 + Math.cos(a * 0.785) * 40, 64 + Math.sin(a * 0.785) * 40);
    g.stroke();
  }
  // side vents
  g.fillStyle = '#4c4842';
  for (let y = 22; y < 108; y += 6) g.fillRect(100, y, 20, 2);
  // rust and grime running down
  const grad = g.createLinearGradient(0, 90, 0, 128);
  grad.addColorStop(0, 'rgba(90,50,20,0)');
  grad.addColorStop(1, 'rgba(90,50,20,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 90, 128, 38);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function createACs(acs) {
  const geo = new THREE.BoxGeometry(0.86, 0.62, 0.36);
  const mat = new THREE.MeshStandardMaterial({ map: acTexture(), roughness: 0.5, metalness: 0.25 });
  const mesh = new THREE.InstancedMesh(geo, mat, acs.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  acs.forEach((a, i) => {
    q.setFromAxisAngle(up, a.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    m4.compose(p.set(a.x, a.y, a.z), q, s);
    mesh.setMatrixAt(i, m4);
  });
  mesh.name = 'ac-units';
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  return mesh;
}
