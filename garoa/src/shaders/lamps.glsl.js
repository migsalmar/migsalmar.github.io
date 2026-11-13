import * as THREE from 'three';
import { VALLEY, VIADUCT } from '../world/layout.js';

// Street lamps are laid out in regular rows, so any shader can find the nearest few lamps
// of each row in O(1) and light itself with them: the wet floor and deck get real PBR light
// pools and glossy streaks, and the drizzle brightens where it falls through lamp light.

// axis 0: lamps vary along z at fixed x. axis 1: lamps vary along x at fixed z.
export const LAMP_ROWS = [
  { axis: 0, fixed: -24.5, y: 7.6, spacing: 24, offset: 0, min: VALLEY.zMin + 10, max: VALLEY.zMax - 10, color: [1.0, 0.46, 0.15], intensity: 190 },
  { axis: 0, fixed: 24.5, y: 7.6, spacing: 24, offset: 12, min: VALLEY.zMin + 10, max: VALLEY.zMax - 10, color: [1.0, 0.46, 0.15], intensity: 190 },
  { axis: 1, fixed: -(VIADUCT.walkHalfWidth + 0.25), y: VIADUCT.deckY + 7.35, spacing: 11, offset: VIADUCT.xMin + 6, min: VIADUCT.xMin + 5, max: VIADUCT.xMax - 5, color: [1.0, 0.55, 0.22], intensity: 120 },
  { axis: 1, fixed: VIADUCT.walkHalfWidth + 0.25, y: VIADUCT.deckY + 7.35, spacing: 11, offset: VIADUCT.xMin + 6, min: VIADUCT.xMin + 5, max: VIADUCT.xMax - 5, color: [1.0, 0.55, 0.22], intensity: 120 },
];

export function lampPositions(row) {
  const out = [];
  for (let c = row.offset; c <= row.max; c += row.spacing) {
    if (c < row.min) continue;
    out.push(row.axis === 0 ? new THREE.Vector3(row.fixed, row.y, c) : new THREE.Vector3(c, row.y, row.fixed));
  }
  return out;
}

export function lampUniforms() {
  return {
    uLampA: { value: LAMP_ROWS.map((r) => new THREE.Vector4(r.axis, r.fixed, r.y, r.spacing)) },
    uLampB: { value: LAMP_ROWS.map((r) => new THREE.Vector4(r.offset, r.min, r.max, r.intensity)) },
    uLampC: { value: LAMP_ROWS.map((r) => new THREE.Vector3(...r.color)) },
  };
}

export const LAMPS_GLSL = /* glsl */ `
uniform vec4 uLampA[${LAMP_ROWS.length}];
uniform vec4 uLampB[${LAMP_ROWS.length}];
uniform vec3 uLampC[${LAMP_ROWS.length}];
#define LAMP_ROWS ${LAMP_ROWS.length}
// World position of the k-th nearest lamp (k = -1, 0, 1) of row r to point p; w = 0 if none.
vec4 lampNear(int r, vec3 p, float k) {
  vec4 A = uLampA[r];
  vec4 B = uLampB[r];
  float along = A.x < 0.5 ? p.z : p.x;
  float n = floor((along - B.x) / A.w + 0.5) + k;
  float c = B.x + n * A.w;
  float ok = step(B.y, c) * step(c, B.z);
  vec3 lp = A.x < 0.5 ? vec3(A.y, A.z, c) : vec3(c, A.z, A.y);
  return vec4(lp, ok);
}
// Cheap scalar illumination for particles.
vec3 lampGlow(vec3 p) {
  vec3 acc = vec3(0.0);
  for (int r = 0; r < LAMP_ROWS; r++) {
    for (int k = -1; k <= 1; k++) {
      vec4 l = lampNear(r, p, float(k));
      vec3 d = l.xyz - p;
      acc += uLampC[r] * uLampB[r].w * l.w / (dot(d, d) + 1.0);
    }
  }
  return acc;
}
`;

// Injected after <lights_fragment_end> in MeshStandardMaterial: adds the lamp rows as
// physically shaded point lights using three's own RE_Direct. Lamps are spheres (~0.35 m),
// so the specular lobe is widened by the light's angular size (Karis 2013). Without it,
// mirror-smooth puddles produce GGX peaks above the half-float range.
export const LAMPS_DIRECT_GLSL = /* glsl */ `
{
  PhysicalMaterial lampMat = material;
  for (int r = 0; r < LAMP_ROWS; r++) {
    for (int k = -1; k <= 1; k++) {
      vec4 l = lampNear(r, vLampWorld, float(k));
      if (l.w < 0.5) continue;
      vec3 lv = (viewMatrix * vec4(l.xyz, 1.0)).xyz - geometryPosition;
      float d2 = dot(lv, lv);
      if (d2 > 3600.0) continue;
      IncidentLight il;
      il.direction = lv * inversesqrt(d2);
      il.color = uLampC[r] * uLampB[r].w / max(d2, 1.0) * smoothstep(3600.0, 900.0, d2);
      il.visible = true;
      float a = material.roughness * material.roughness + 0.35 / (2.0 * sqrt(d2));
      lampMat.roughness = min(sqrt(a), 1.0);
      RE_Direct(il, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, lampMat, reflectedLight);
    }
  }
}
`;
