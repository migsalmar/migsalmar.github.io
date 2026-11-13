import * as THREE from 'three';

// One PBR material for every tower tier in the city. Per-instance attributes drive a
// procedural facade: window grid, lit interiors, shopfronts, blind side walls (empenas),
// rain streaks, wet roofs. Window detail fades to its average when a window cell shrinks
// below a few pixels so the distant skyline doesn't shimmer.
//
// aParams = (floorH, bayW, litRatio, seed)
// aStyle  = (windowType, flags, parapetH, wetness)
//   windowType: 0 punched, 1 ribbon, 2 curtain wall, 3 residential, 4 plain, 5 martinelli, 6 bandeira
//   flags bit0: blind side walls (z faces); bit1: ground tier with shopfronts
// aColor  = wall albedo (linear)

export const WINDOW = { PUNCHED: 0, RIBBON: 1, CURTAIN: 2, RESIDENTIAL: 3, PLAIN: 4, MARTINELLI: 5, BANDEIRA: 6 };

// Per-instance values are flat: interpolating large seeds across a triangle introduces
// tiny float errors that the hash amplifies into visible striping.
const COMMON = /* glsl */ `
  varying vec3 vBPos;
  varying vec3 vBWorld;
  flat varying vec3 vBNormal;
  flat varying vec3 vBSize;
  flat varying float vBBase;
  flat varying vec4 vParams;
  flat varying vec4 vStyle;
  flat varying vec3 vBColor;
`;

export function createBuildingMaterial(assets) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.0, envMapIntensity: 0.75 });
  const uniforms = {
    uConcrete: { value: assets.concrete.map },
    uTime: { value: 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.customProgramCacheKey = () => 'garoa-building-v1';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aParams;
        attribute vec4 aStyle;
        attribute vec3 aColor;
        ${COMMON}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 bsc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vBSize = bsc;
        vBBase = instanceMatrix[3].y;
        vBPos = (position + vec3(0.5, 0.0, 0.5)) * bsc;
        vBPos.y += vBBase;
        vBNormal = normal;
        vBWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vParams = aParams;
        vStyle = aStyle;
        vBColor = aColor;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uConcrete;
        uniform float uTime;
        ${COMMON}
        float bh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float bnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(bh(i), bh(i + vec2(1, 0)), u.x), mix(bh(i + vec2(0, 1)), bh(i + vec2(1, 1)), u.x), u.y);
        }
        vec3 bLitColor(float r, float r2) {
          // interior light palette: tungsten, warm LED, office fluorescent, cool LED, neon accents
          if (r < 0.34) return vec3(1.0, 0.56, 0.26);
          if (r < 0.58) return vec3(1.0, 0.76, 0.5);
          if (r < 0.80) return vec3(0.78, 0.92, 1.0);
          if (r < 0.90) return vec3(0.55, 0.75, 1.0);
          if (r < 0.95) return r2 < 0.5 ? vec3(1.0, 0.2, 0.62) : vec3(0.2, 0.95, 1.0);
          return vec3(0.42, 0.55, 1.0); // television glow
        }
        struct BSurf { vec3 albedo; float rough; float metal; vec3 emissive; };
        BSurf bSurface() {
          BSurf o;
          float floorH = vParams.x;
          float bayW = vParams.y;
          float litRatio = vParams.z;
          float seed = vParams.w;
          float wtype = floor(vStyle.x + 0.5);
          float flags = vStyle.y;
          float parapet = vStyle.z;
          float wet = vStyle.w;
          bool blindSides = mod(flags, 2.0) >= 1.0;
          bool groundTier = mod(floor(flags * 0.5), 2.0) >= 1.0;
          vec3 n = vBNormal;
          float topY = vBBase + vBSize.y;

          if (n.y > 0.5) {
            // Roof: tar and concrete with standing water.
            vec2 rp = vBPos.xz;
            float puddle = smoothstep(0.45, 0.7, bnoise(rp * 0.35 + seed * 31.0));
            vec3 tex = texture2D(uConcrete, rp * 0.15).rgb;
            o.albedo = mix(tex * 0.25, vec3(0.012), puddle);
            o.rough = mix(0.55, 0.06, puddle);
            o.metal = 0.0;
            o.emissive = vec3(0.0);
            return o;
          }
          if (n.y < -0.5) { o.albedo = vec3(0.05); o.rough = 0.9; o.metal = 0.0; o.emissive = vec3(0.0); return o; }

          vec2 fuv; float faceW; float faceId;
          if (abs(n.x) > 0.5) { fuv = vec2(vBPos.z, vBPos.y); faceW = vBSize.z; faceId = n.x > 0.0 ? 1.0 : 2.0; }
          else { fuv = vec2(vBPos.x, vBPos.y); faceW = vBSize.x; faceId = n.z > 0.0 ? 3.0 : 4.0; }
          float hFace = vBPos.y - vBBase;

          // Wall: concrete albedo from the Poly Haven texture, tinted per building, with rain runoff streaks.
          vec3 tex = texture2D(uConcrete, fuv * vec2(0.11, 0.09) + seed * 7.0).rgb;
          float streak = bnoise(vec2(fuv.x * 1.7 + faceId * 13.0, fuv.y * 0.03 + seed * 11.0));
          float grime = bnoise(fuv * 0.08 + seed * 5.0);
          float runoff = mix(0.45, 1.0, streak) * mix(0.75, 1.0, grime);
          vec3 wall = vBColor * (0.35 + tex * 1.3) * runoff;
          wall *= mix(1.0, 0.62, wet); // wet surfaces read darker
          float wallRough = mix(0.82, 0.38, wet * (0.6 + 0.4 * streak));

          o.albedo = wall; o.rough = wallRough; o.metal = 0.0; o.emissive = vec3(0.0);
          // Sodium street lighting washing the lower façade, and a faint wash from the lit cloud deck.
          float street = groundTier ? vBBase : -1000.0;
          float sg = exp(-max(vBPos.y - street, 0.0) / 9.0) * (0.75 + 0.5 * bnoise(vec2(fuv.x * 0.15, seed)));
          vec3 glowCol = vec3(1.0, 0.42, 0.13) * 0.22 * sg + vec3(0.06, 0.03, 0.02) * 0.06;
          o.emissive = wall * glowCol;
          vec3 wallEm = o.emissive;

          bool isBlind = blindSides && faceId > 2.5;
          bool inParapet = vBPos.y > topY - parapet;
          bool atCorner = fuv.x < 0.55 || fuv.x > faceW - 0.55;
          if (wtype > 3.5 && wtype < 4.5) return o; // plain
          if (isBlind || inParapet || atCorner) {
            if (inParapet && !isBlind) {
              // rooftop parapet catches the city glow; slab edge line
              o.albedo *= 1.15;
            }
            return o;
          }

          // Ground tier: shopfronts with lit interiors or steel roller shutters.
          if (groundTier && hFace < 4.6) {
            float bay = floor(fuv.x / 4.2);
            float r = bh(vec2(bay, seed * 91.0 + faceId));
            vec2 sl = vec2(fract(fuv.x / 4.2), hFace / 4.6);
            if (sl.y > 0.82 || sl.x < 0.04 || sl.x > 0.96) return o;
            if (sl.y > 0.68) {
              // fascia above the shopfront, lit from below
              o.emissive = o.albedo * vec3(1.0, 0.5, 0.2) * 0.5;
              return o;
            }
            if (r < 0.45) {
              // shutter
              float groove = 0.5 + 0.5 * sin(hFace * 52.0);
              o.albedo = vec3(0.16, 0.15, 0.14) * (0.6 + 0.4 * groove) * (0.6 + 0.6 * bnoise(fuv * vec2(3.0, 0.5)));
              o.rough = 0.35; o.metal = 0.7;
            } else {
              vec3 c = bLitColor(bh(vec2(bay, seed)), bh(vec2(seed, bay)));
              float inten = mix(0.8, 2.4, bh(vec2(bay * 3.1, seed)));
              o.albedo = vec3(0.02); o.rough = 0.06; o.metal = 0.0;
              o.emissive = c * inten * (0.7 + 0.3 * sl.y);
            }
            return o;
          }

          // Window grid
          float yRel = vBPos.y; // floors align with world height across tiers
          vec2 cell = vec2(floor(fuv.x / bayW), floor(yRel / floorH));
          vec2 lc = vec2(fract(fuv.x / bayW), fract(yRel / floorH));
          float ww, wh, sill;
          if (wtype < 0.5)      { ww = 0.56; wh = 0.52; sill = 0.30; }
          else if (wtype < 1.5) { ww = 0.97; wh = 0.46; sill = 0.34; }
          else if (wtype < 2.5) { ww = 0.95; wh = 0.88; sill = 0.08; }
          else if (wtype < 3.5) { ww = 0.66; wh = 0.6;  sill = 0.26; }
          else if (wtype < 5.5) { ww = 0.40; wh = 0.56; sill = 0.26; }
          else                  { ww = 0.94; wh = 0.90; sill = 0.06; }
          float wx = abs(lc.x - 0.5) * 2.0;
          float inWin = step(wx, ww) * step(sill, lc.y) * step(lc.y, sill + wh);
          if (wtype > 4.5 && wtype < 5.5) {
            // Martinelli: round-arched heads and a cornice band every five floors.
            float top = sill + wh;
            float r = ww * 0.5 * bayW / floorH;
            if (lc.y > top - r) {
              vec2 d = vec2((lc.x - 0.5) * bayW / floorH, lc.y - (top - r));
              inWin *= step(length(d), r);
            }
            if (mod(cell.y, 5.0) < 0.5 && lc.y < 0.22) { o.albedo = vBColor * 1.25 * runoff; inWin = 0.0; }
          }
          if (wtype > 2.5 && wtype < 3.5 && lc.y < 0.1) { o.albedo *= 0.6; } // balcony slab shadow line

          // Distance anti-aliasing: footprint of one window cell in pixels.
          float px = max(fwidth(fuv.x) / bayW, fwidth(yRel) / floorH);
          float farMix = smoothstep(0.22, 0.75, px);

          float cid = cell.x + cell.y * 131.0 + faceId * 977.0;
          float rLit = bh(vec2(cid, seed * 17.0));
          float floorDark = step(0.14, bh(vec2(cell.y, seed * 3.0 + faceId)));
          float lit = step(rLit, litRatio) * floorDark;
          vec3 lcol = bLitColor(bh(vec2(cid * 0.37, seed)), bh(vec2(seed, cid)));
          float inten = mix(0.3, 2.8, pow(bh(vec2(cid, seed * 5.3)), 3.0));
          // television flicker
          if (lcol.b > 0.9 && lcol.r < 0.5) inten *= 0.55 + 0.45 * sin(uTime * (7.0 + 9.0 * rLit) + cid) * sin(uTime * 2.3 + cid * 0.7);
          // blinds and ceiling falloff
          float blindFreq = 18.0;
          float blindAA = clamp(1.0 - fwidth(lc.y * blindFreq) * 1.5, 0.0, 1.0);
          float blinds = bh(vec2(cid, 7.7)) < 0.3 ? mix(0.72, 0.6 + 0.4 * sin(lc.y * blindFreq * 6.2832) , blindAA) : 1.0;
          vec3 em;
          if (farMix < 0.98 && lit > 0.5) {
            // Interior mapping: trace a room box behind the window cell.
            vec3 N = vec3(0.0); vec3 T;
            if (faceId < 2.5) { N.x = faceId < 1.5 ? 1.0 : -1.0; T = vec3(0.0, 0.0, 1.0); }
            else { N.z = faceId < 3.5 ? 1.0 : -1.0; T = vec3(1.0, 0.0, 0.0); }
            vec3 V = normalize(vBWorld - cameraPosition);
            vec3 rd = vec3(dot(V, T), V.y, max(-dot(V, N), 0.05));
            float depth = mix(3.5, 7.0, bh(vec2(cid, 3.3)));
            vec3 ro = vec3(lc.x * bayW, lc.y * floorH, 0.0);
            float tx = rd.x > 0.0 ? (bayW - ro.x) / rd.x : -ro.x / min(rd.x, -1e-4);
            float ty = rd.y > 0.0 ? (floorH - 0.25 - ro.y) / rd.y : -ro.y / min(rd.y, -1e-4);
            float tz = depth / rd.z;
            float tm = min(tx, min(ty, tz));
            vec3 hp = ro + rd * tm;
            vec3 room;
            if (tm == ty && rd.y > 0.0) {
              // ceiling with a lamp
              float lamp = exp(-dot(hp.xz - vec2(bayW * 0.5, depth * 0.45), hp.xz - vec2(bayW * 0.5, depth * 0.45)) * 0.9);
              room = lcol * (0.55 + 2.2 * lamp);
            } else if (tm == ty) {
              room = lcol * (0.12 + 0.1 * bh(floor(hp.xz * 2.0) + cid)); // floor
            } else if (tm == tx) {
              room = lcol * mix(0.3, 0.7, hp.y / floorH); // side wall
            } else {
              // back wall with a dark furniture/occupant silhouette
              float occ = bh(vec2(cid, 9.1));
              float sx = abs(hp.x - bayW * (0.3 + 0.4 * occ)) ;
              float shape = step(sx, 0.25 + 0.5 * occ) * step(hp.y, floorH * (0.35 + 0.3 * bh(vec2(cid, 2.2))));
              room = lcol * mix(0.75, 0.15, shape);
            }
            // curtains on some windows: translucent fabric drawn to the sides
            float cur = bh(vec2(cid, 5.5));
            if (cur < 0.4) {
              float open = 0.15 + 0.3 * bh(vec2(cid, 6.6));
              float wxl = (lc.x - 0.5) / max(ww, 0.01) + 0.5;
              float cm = 1.0 - smoothstep(open - 0.03, open, wxl) * smoothstep(1.0 - open + 0.03, 1.0 - open, wxl);
              vec3 fabric = lcol * vec3(1.0, 0.75, 0.6) * (0.55 + 0.15 * sin(lc.x * 90.0));
              room = mix(room, fabric, cm);
            }
            em = room * inten * blinds * lit;
          } else {
            float ceiling = mix(0.65, 1.0, smoothstep(sill, sill + wh, lc.y));
            em = lcol * inten * blinds * ceiling * lit;
          }

          vec3 glass = vec3(0.012, 0.014, 0.018);
          float glassRough = 0.2; // blur env reflections so the HDRI's tiny lights don't sparkle
          float glassMetal = 0.0;
          if (wtype > 1.5 && wtype < 2.5) glass = vec3(0.01, 0.018, 0.026);
          if (wtype > 5.5) {
            // Grupo Bandeira: black glass, whole floors lit in cool white, LED fins and red bands.
            glass = vec3(0.003, 0.004, 0.007);
            glassRough = 0.12;
            glassMetal = 0.5;
            float floorLit = step(bh(vec2(cell.y, seed)), 0.55);
            lit = floorLit;
            lcol = vec3(0.62, 0.8, 1.0);
            em = lcol * 0.55 * floorLit * (0.85 + 0.15 * sin(fuv.x * 0.7 + cell.y));
            float finPeriod = bayW * 4.0;
            float fd = abs(fract(fuv.x / finPeriod) - 0.5) * finPeriod;
            float fin = 1.0 - smoothstep(0.06, 0.06 + max(fwidth(fuv.x), 0.02), fd);
            float band = step(mod(cell.y, 10.0), 0.5) * step(lc.y, 0.16);
            float pulse = 0.75 + 0.25 * sin(uTime * 1.3 - vBPos.y * 0.05);
            wallEm += vec3(0.8, 0.92, 1.0) * 3.2 * fin * pulse + vec3(1.0, 0.04, 0.03) * 4.0 * band;
            inWin = max(inWin, 0.0);
          }

          vec3 winAlbedo = mix(glass, glass + lcol * 0.02, lit);
          vec3 detailAlb = mix(o.albedo, winAlbedo, inWin);
          float detailRough = mix(o.rough, glassRough, inWin);
          vec3 detailEm = wallEm * (1.0 - inWin) + em * inWin;
          if (wtype > 5.5) detailEm = em * inWin + wallEm;

          // Average appearance of the facade when windows are sub-pixel.
          float area = ww * wh;
          float coarse = bh(floor(vec2(fuv.x / (bayW * 3.0), yRel / (floorH * 2.0))) + seed * 3.0);
          vec3 avgEm = wallEm + vec3(1.0, 0.68, 0.42) * litRatio * area * 0.75 * (0.4 + 1.2 * coarse) * floorDark;
          vec3 avgAlb = mix(o.albedo, glass, area);
          float avgRough = mix(o.rough, glassRough, area);

          o.albedo = mix(detailAlb, avgAlb, farMix);
          o.rough = mix(detailRough, avgRough, farMix);
          o.metal = glassMetal;
          o.emissive = mix(detailEm, avgEm, farMix);
          return o;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `BSurf bs = bSurface();
        diffuseColor.rgb = bs.albedo;`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = bs.rough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = bs.metal;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = bs.emissive;');
  };
  return mat;
}
