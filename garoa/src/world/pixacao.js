import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STAIRS } from './layout.js';

// Pixação: São Paulo's "tag reto" script. Tall, narrow, all straight strokes, horned tops,
// descended from heavy-metal album lettering. Glyphs are generated, not drawn from a font,
// so every crew's alphabet differs. Tags run along the platibandas (blank parapets) of the
// valley-facing towers and stack in rows down the exposed blind side walls (empenas).

function glyphFactory(rnd) {
  // Each glyph: polylines in a unit box, x 0..1, y 0 (top) .. 1 (bottom).
  return () => {
    const lines = [];
    const stems = rnd() < 0.55 ? [0.15 + rnd() * 0.15, 0.7 + rnd() * 0.15] : [0.2 + rnd() * 0.6];
    for (const x of stems) {
      const top = 0.02 + rnd() * 0.12;
      lines.push([[x, 1.0], [x, top]]);
      // horn: an angled tick off the top
      const dir = rnd() < 0.5 ? -1 : 1;
      lines.push([[x, top], [x + dir * (0.18 + rnd() * 0.12), top - 0.06 - rnd() * 0.05]]);
    }
    const accents = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < accents; i++) {
      const r = rnd();
      const y = 0.25 + rnd() * 0.5;
      if (r < 0.3 && stems.length === 2) lines.push([[stems[0], y], [stems[1], y + (rnd() - 0.5) * 0.2]]);
      else if (r < 0.55) lines.push([[stems[0], 0.12 + rnd() * 0.2], [stems.at(-1) + 0.15, 0.55 + rnd() * 0.3]]);
      else if (r < 0.75) lines.push([[0.05, y], [0.5, y - 0.12], [0.95, y]]);
      else if (r < 0.9) lines.push([[stems[0], 1.0], [stems[0] + 0.35, 0.82]]);
      else lines.push([[0.1, 0.1], [0.5, 0.3], [0.9, 0.1]]);
    }
    return lines;
  };
}

function drawTag(g, rnd, glyphs, x, y, h, color, maxW) {
  const n = 4 + Math.floor(rnd() * 6);
  const gw = h * (0.26 + rnd() * 0.08);
  const gap = h * 0.07;
  const slant = (rnd() - 0.5) * 0.12;
  g.strokeStyle = color;
  g.lineWidth = h * (0.045 + rnd() * 0.02);
  g.lineCap = 'square';
  g.lineJoin = 'miter';
  let cx = x;
  for (let i = 0; i < n; i++) {
    if (cx + gw > x + maxW) break;
    const gl = glyphs[Math.floor(rnd() * glyphs.length)];
    for (const pl of gl) {
      g.beginPath();
      pl.forEach(([u, v], k) => {
        const px = cx + u * gw + (1 - v) * h * slant;
        const py = y + v * h;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.stroke();
    }
    // drips
    if (rnd() < 0.35) {
      g.save();
      g.lineWidth *= 0.35;
      g.beginPath();
      const dx = cx + gw * (0.2 + rnd() * 0.6);
      g.moveTo(dx, y + h);
      g.lineTo(dx, y + h + h * (0.1 + rnd() * 0.35));
      g.stroke();
      g.restore();
    }
    cx += gw + gap;
  }
  // crew mark: a smaller line underneath
  if (rnd() < 0.5) {
    g.save();
    g.lineWidth *= 0.5;
    const sw = Math.min(cx - x, maxW) * 0.5;
    g.beginPath();
    g.moveTo(x + sw * 0.2, y + h * 1.12);
    g.lineTo(x + sw * 1.2, y + h * 1.12);
    g.stroke();
    g.restore();
  }
  return cx - x;
}

function grime(g, rnd, x, y, w, h, base) {
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(40,32,26,${rnd() * 0.12})`;
    const rw = 4 + rnd() * 60;
    g.fillRect(x + rnd() * w, y + rnd() * h, rw, 2 + rnd() * 8);
  }
  // rain runoff
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(30,24,20,${0.05 + rnd() * 0.1})`;
    g.fillRect(x + rnd() * w, y, 1 + rnd() * 3, h * rnd());
  }
}

function buildAtlas(rnd) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const crews = Array.from({ length: 6 }, () => {
    const make = glyphFactory(rnd);
    return Array.from({ length: 14 }, make);
  });
  const ink = () => (rnd() < 0.82 ? 'rgba(8,8,10,0.96)' : rnd() < 0.5 ? 'rgba(150,18,14,0.95)' : 'rgba(225,225,220,0.95)');
  // 8 parapet strips (2048 x 160); odd strips have a painted background, even are bare.
  const strips = [];
  for (let r = 0; r < 8; r++) {
    const y = r * 160;
    const painted = r % 2 === 0;
    if (painted) grime(g, rnd, 0, y, S, 160, ['#cfc6b6', '#b9b4a8', '#d8cdb8', '#a9a39a'][r % 4]);
    let x = 20 + rnd() * 40;
    while (x < S - 200) {
      const crew = crews[Math.floor(rnd() * crews.length)];
      const h = 100 + rnd() * 30;
      const w = drawTag(g, rnd, crew, x, y + 10 + rnd() * 10, h, painted ? 'rgba(8,8,10,0.96)' : ink(), S - x - 20);
      x += w + 30 + rnd() * 160;
    }
    strips.push({ v0: 1 - (y + 160) / S, v1: 1 - y / S, painted });
  }
  // empena: a whole wall of stacked rows (2048 x 768)
  const wy = 1280;
  grime(g, rnd, 0, wy, S, 768, '#bdb5a6');
  for (let row = 0; row < 5; row++) {
    let x = 30 + rnd() * 60;
    const y = wy + 30 + row * 148;
    while (x < S - 220) {
      const crew = crews[Math.floor(rnd() * crews.length)];
      const w = drawTag(g, rnd, crew, x, y, 104 + rnd() * 16, rnd() < 0.85 ? 'rgba(8,8,10,0.97)' : 'rgba(150,18,14,0.95)', S - x - 30);
      x += w + 40 + rnd() * 90;
    }
  }
  const wall = { v0: 0, v1: 1 - wy / S };
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, strips, wall, stripAspect: S / 160, wallAspect: S / 768 };
}

function decal(center, normal, w, h, u0, u1, v0, v1) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, THREE.MathUtils.lerp(u0, u1, uv.getX(i)), THREE.MathUtils.lerp(v0, v1, uv.getY(i)));
  }
  g.rotateY(Math.atan2(normal.x, normal.z));
  g.translate(center.x, center.y, center.z);
  return g;
}

export function createPixacao(city) {
  const rnd = city.rnd;
  const atlas = buildAtlas(rnd);
  const geos = [];
  const pickStrip = (painted) => {
    const pool = atlas.strips.filter((s) => s.painted === painted);
    return pool[Math.floor(rnd() * pool.length)];
  };
  const stripUV = (aspect, strip) => {
    const span = Math.min(1, aspect / atlas.stripAspect);
    const u0 = rnd() * (1 - span);
    return [u0, u0 + span, strip.v0, strip.v1];
  };

  const rows = { 1: [], [-1]: [] };
  for (const tw of city.frontRow) rows[tw.side].push(tw);

  for (const tw of city.frontRow) {
    const top = tw.tiers[tw.tiers.length - 1];
    const n = new THREE.Vector3(-tw.side, 0, 0);
    // platibanda along the valley face
    if (top.parapet > 2.4) {
      const fx = tw.side > 0 ? top.x0 : top.x1;
      const w = (top.z1 - top.z0) * 0.96;
      const h = top.parapet * 0.9;
      const strip = pickStrip(rnd() < 0.7);
      const [u0, u1, v0, v1] = stripUV(w / h, strip);
      geos.push(decal(new THREE.Vector3(fx + n.x * 0.05, top.y1 - top.parapet / 2, (top.z0 + top.z1) / 2), n, w, h, u0, u1, v0, v1));
    }
    // empenas: blind side walls exposed above a shorter neighbour
    if (tw.blind) {
      const row = rows[tw.side];
      const i = row.indexOf(tw);
      for (const [nb, zFace, nz] of [
        [row[i - 1], top.z0, -1],
        [row[i + 1], top.z1, 1],
      ]) {
        const nbTop = nb ? nb.tiers[nb.tiers.length - 1].y1 : 0;
        const exposed = top.y1 - Math.max(nbTop, top.y0);
        if (exposed < 18) continue;
        const w = (top.x1 - top.x0) * 0.9;
        const h = Math.min(w / atlas.wallAspect, exposed * 0.55);
        const span = Math.min(1, (w / h) / atlas.wallAspect);
        const u0 = rnd() * (1 - span);
        geos.push(
          decal(
            new THREE.Vector3((top.x0 + top.x1) / 2, top.y1 - top.parapet - h / 2 - 1.5, zFace + nz * 0.05),
            new THREE.Vector3(0, 0, nz),
            w, h, u0, u0 + span, atlas.wall.v0, atlas.wall.v1,
          ),
        );
      }
    }
  }
  // street level: the side of the grand staircase facing the valley
  {
    const strip = pickStrip(false);
    const w = 32;
    const h = 2.6;
    const [u0, u1, v0, v1] = stripUV(w / h, strip);
    geos.push(decal(new THREE.Vector3(STAIRS.x1 + 0.04, 1.9, 28), new THREE.Vector3(1, 0, 0), w, h, u0, u1, v0, v1));
  }

  const mat = new THREE.MeshStandardMaterial({
    map: atlas.tex,
    alphaTest: 0.45,
    roughness: 0.75,
    metalness: 0,
    emissiveMap: atlas.tex,
    emissive: new THREE.Color(0.11, 0.05, 0.025), // city glow catching the paint
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.name = 'pixacao';
  mesh.receiveShadow = true;
  return { mesh, count: geos.length };
}
