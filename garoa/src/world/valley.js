import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VALLEY, VIADUCT, STAIRS } from './layout.js';

// Box geometry helper: min/max corners, with UVs scaled to world meters / tile.
function box(x0, y0, z0, x1, y1, z1, tile = 4) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  const uv = g.attributes.uv;
  const n = g.attributes.normal;
  const p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    const x = p.getX(i) + (x0 + x1) / 2;
    const y = p.getY(i) + (y0 + y1) / 2;
    const z = p.getZ(i) + (z0 + z1) / 2;
    if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g.toNonIndexed(); // ExtrudeGeometry is non-indexed; keep everything mergeable
}

function concreteMaterial(assets, { color = 0x8a8580, tile = 1, rough = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    map: assets.concrete.map,
    normalMap: assets.concrete.normalMap,
    roughnessMap: assets.concrete.roughnessMap,
    roughness: rough,
    metalness: 0,
  });
  m.normalScale.set(0.8, 0.8);
  return m;
}

export function createValley(assets) {
  const group = new THREE.Group();
  group.name = 'valley';
  const H = VALLEY.ridgeY;

  // --- Ridge masses (retaining walls + plateau). Front-row towers cover most of their faces.
  const ridgeMat = concreteMaterial(assets, { color: 0x6d6862 });
  const ridgeGeo = mergeGeometries([
    box(VALLEY.halfWidth, -2, VALLEY.zMin - 400, 900, H, VALLEY.zMax + 400, 6),
    box(-900, -2, VALLEY.zMin - 400, -VALLEY.halfWidth, H, VALLEY.zMax + 400, 6),
  ]);
  const ridges = new THREE.Mesh(ridgeGeo, ridgeMat);
  ridges.name = 'ridges';
  group.add(ridges);

  // Far ends of the valley: the floor continues under more city.
  const endGeo = mergeGeometries([
    box(-VALLEY.halfWidth, -2, VALLEY.zMin - 60, VALLEY.halfWidth, 0, VALLEY.zMin, 6),
    box(-VALLEY.halfWidth, -2, VALLEY.zMax, VALLEY.halfWidth, 0, VALLEY.zMax + 60, 6),
  ]);
  group.add(new THREE.Mesh(endGeo, ridgeMat));

  // --- Viaduto do Chá: deck, four arched girders, paired piers, parapets, lamps.
  const viaduct = new THREE.Group();
  viaduct.name = 'viaduto-do-cha';
  const vMat = concreteMaterial(assets, { color: 0xb4ab9f });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x1b1a1a, roughness: 0.35, metalness: 0.0 });
  const D = VIADUCT;
  const deckBottom = D.deckY - 0.65;
  const parts = [];
  parts.push(box(D.xMin, deckBottom, -D.halfWidth, D.xMax, D.deckY - 0.08, D.halfWidth, 5));

  // Girder profile: elliptical soffit in each span, deepest at the supports.
  const supports = [-VALLEY.halfWidth, D.piersX[0], D.piersX[1], VALLEY.halfWidth];
  const girderShape = new THREE.Shape();
  const top = deckBottom;
  girderShape.moveTo(D.xMin, top);
  girderShape.lineTo(D.xMin, top - 3.6);
  girderShape.lineTo(supports[0], top - 3.6);
  for (let s = 0; s < 3; s++) {
    const a = supports[s];
    const b = supports[s + 1];
    const span = b - a;
    const dMax = 3.6;
    const dMin = s === 1 ? 1.15 : 1.5;
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2 - 1;
      const x = a + ((t + 1) / 2) * span;
      const d = dMin + (dMax - dMin) * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
      girderShape.lineTo(x, top - d);
    }
  }
  girderShape.lineTo(D.xMax, top - 3.6);
  girderShape.lineTo(D.xMax, top);
  girderShape.lineTo(D.xMin, top);
  const girderZ = [-7.3, -2.5, 2.5, 7.3];
  for (const gz of girderZ) {
    const w = Math.abs(gz) > 5 ? 1.1 : 0.8;
    const g = new THREE.ExtrudeGeometry(girderShape, { depth: w, bevelEnabled: false, curveSegments: 1 });
    // UVs from ExtrudeGeometry are in shape units (meters); rescale.
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 5, uv.getY(i) / 5);
    g.translate(0, 0, gz - w / 2);
    parts.push(g);
  }
  // Fascia cornice along both outer edges
  parts.push(box(D.xMin, D.deckY - 0.75, -D.halfWidth - 0.25, D.xMax, D.deckY - 0.35, -D.halfWidth + 0.1, 3));
  parts.push(box(D.xMin, D.deckY - 0.75, D.halfWidth - 0.1, D.xMax, D.deckY - 0.35, D.halfWidth + 0.25, 3));
  // Piers: paired square columns with a cap beam, slightly tapered look via a plinth.
  for (const px of D.piersX) {
    for (const pz of [-4.6, 4.6]) {
      parts.push(box(px - 1.0, 0, pz - 1.0, px + 1.0, top - 1.1, pz + 1.0, 3));
      parts.push(box(px - 1.3, 0, pz - 1.3, px + 1.3, 1.2, pz + 1.3, 3));
    }
    parts.push(box(px - 1.25, top - 2.4, -7.9, px + 1.25, top - 1.0, 7.9, 3));
  }
  // Parapets with an opening for the staircase on the south side.
  const parH = 1.05;
  const pz0 = D.walkHalfWidth;
  parts.push(box(D.xMin, D.deckY - 0.1, -D.halfWidth + 0.05, D.xMax, D.deckY + parH, -pz0, 2));
  parts.push(box(D.xMin, D.deckY - 0.1, pz0, STAIRS.x0, D.deckY + parH, D.halfWidth - 0.05, 2));
  parts.push(box(STAIRS.x1, D.deckY - 0.1, pz0, D.xMax, D.deckY + parH, D.halfWidth - 0.05, 2));
  const viaductMesh = new THREE.Mesh(mergeGeometries(parts), vMat);
  viaductMesh.name = 'viaduct-structure';
  viaduct.add(viaductMesh);

  const deck = new THREE.Mesh(box(D.xMin, D.deckY - 0.1, -pz0, D.xMax, D.deckY, pz0, 4), deckMat);
  deck.name = 'viaduct-deck';
  viaduct.add(deck);

  // Metal top rail on parapets
  const railMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.85, roughness: 0.35 });
  const rails = mergeGeometries([
    box(D.xMin, D.deckY + parH, -pz0 - 0.35, D.xMax, D.deckY + parH + 0.08, -pz0 - 0.15, 4),
    box(D.xMin, D.deckY + parH, pz0 + 0.15, STAIRS.x0, D.deckY + parH + 0.08, pz0 + 0.35, 4),
    box(STAIRS.x1, D.deckY + parH, pz0 + 0.15, D.xMax, D.deckY + parH + 0.08, pz0 + 0.35, 4),
  ]);
  viaduct.add(new THREE.Mesh(rails, railMat));

  // Lamp posts: instanced poles + emissive heads (sodium, with a cyan 2087 retrofit ring).
  const lampXs = [];
  for (let x = D.xMin + 6; x <= D.xMax - 6; x += 11) lampXs.push(x);
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.11, 6.2, 8).translate(0, 3.1, 0);
  const headGeo = new THREE.SphereGeometry(0.32, 16, 10);
  const ringGeo = new THREE.TorusGeometry(0.36, 0.035, 6, 24).rotateX(Math.PI / 2);
  const n = lampXs.length * 2;
  const poles = new THREE.InstancedMesh(poleGeo, railMat, n);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.55, 0.2).multiplyScalar(9) }), n);
  const rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1.0).multiplyScalar(5) }), n);
  const m4 = new THREE.Matrix4();
  const lampPositions = [];
  let i = 0;
  for (const x of lampXs) {
    for (const z of [-pz0 - 0.25, pz0 + 0.25]) {
      m4.makeTranslation(x, D.deckY + parH, z);
      poles.setMatrixAt(i, m4);
      m4.makeTranslation(x, D.deckY + parH + 6.3, z);
      heads.setMatrixAt(i, m4);
      m4.makeTranslation(x, D.deckY + parH + 6.0, z);
      rings.setMatrixAt(i, m4);
      lampPositions.push(new THREE.Vector3(x, D.deckY + parH + 6.3, z));
      i++;
    }
  }
  viaduct.add(poles, heads, rings);
  group.add(viaduct);

  // --- Grand staircase (west side), stepped profile extruded across its width.
  const S = STAIRS;
  const stepCount = 125;
  const shape = new THREE.Shape();
  shape.moveTo(S.zBottom, 0);
  for (let k = 0; k < stepCount; k++) {
    const z = S.zBottom - (k / stepCount) * (S.zBottom - S.zTop);
    const y1 = ((k + 1) / stepCount) * D.deckY;
    const z1 = S.zBottom - ((k + 1) / stepCount) * (S.zBottom - S.zTop);
    shape.lineTo(z, y1);
    shape.lineTo(z1, y1);
  }
  shape.lineTo(S.zTop, D.deckY);
  shape.lineTo(S.zTop, -0.5);
  shape.lineTo(S.zBottom, -0.5);
  const stairGeo = new THREE.ExtrudeGeometry(shape, { depth: S.x1 - S.x0, bevelEnabled: false, curveSegments: 1 });
  const suv = stairGeo.attributes.uv;
  for (let k = 0; k < suv.count; k++) suv.setXY(k, suv.getX(k) / 3, suv.getY(k) / 3);
  const stairs = new THREE.Mesh(stairGeo, vMat);
  stairs.rotation.y = -Math.PI / 2;
  // rotation -90deg maps shape x -> world z and the extrusion -> world -x, so start at x1.
  stairs.position.set(S.x1, 0, 0);
  stairs.name = 'stairs';
  group.add(stairs);
  // Handrails
  const stairRailGeo = [];
  for (const sx of [S.x0 + 0.1, S.x1 - 0.1]) {
    const len = Math.hypot(S.zBottom - S.zTop, D.deckY);
    const g = new THREE.CylinderGeometry(0.04, 0.04, len, 6);
    g.rotateX(Math.atan2(S.zTop - S.zBottom, D.deckY));
    g.translate(sx, D.deckY / 2 + 0.95, (S.zTop + S.zBottom) / 2);
    stairRailGeo.push(g);
  }
  group.add(new THREE.Mesh(mergeGeometries(stairRailGeo), railMat));

  // --- Valley floor placeholder (replaced by the calçada shader in a later step).
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.25, metalness: 0 });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(VALLEY.halfWidth * 2, VALLEY.zMax - VALLEY.zMin, 1, 1).rotateX(-Math.PI / 2),
    floorMat,
  );
  floor.position.z = (VALLEY.zMin + VALLEY.zMax) / 2;
  floor.name = 'valley-floor';
  group.add(floor);

  return { group, floor, deck, lampPositions, materials: { ridgeMat, vMat, deckMat, railMat } };
}
