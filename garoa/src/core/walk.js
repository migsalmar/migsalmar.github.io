import { VALLEY, VIADUCT, STAIRS } from '../world/layout.js';

// Analytic walkable surfaces. Cheaper and more predictable than raycasting meshes:
// the player stands on the highest surface that is within one step of their feet,
// and may never step up or down more than STEP. That keeps them off the viaduct railings
// and out of the stair mass without a physics engine.

const R = 0.38; // player radius
const STEP = 0.55;

const inRect = (s, x, z) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;

export class Walkmap {
  constructor() {
    const stairsRect = { x0: STAIRS.x0, x1: STAIRS.x1, z0: STAIRS.zTop, z1: STAIRS.zBottom };
    const rise = VIADUCT.deckY;
    this.surfaces = [
      {
        x0: -VALLEY.halfWidth + R,
        x1: VALLEY.halfWidth - R,
        z0: VALLEY.zMin + R,
        z1: VALLEY.zMax - R,
        h: () => 0,
        exclude: { x0: stairsRect.x0 - R, x1: stairsRect.x1 + R, z0: stairsRect.z0, z1: stairsRect.z1 - 0.6 },
      },
      {
        x0: VIADUCT.xMin + R,
        x1: VIADUCT.xMax - R,
        z0: -VIADUCT.walkHalfWidth + R,
        z1: VIADUCT.walkHalfWidth - R,
        h: () => VIADUCT.deckY,
      },
      {
        // opening in the south railing where the staircase lands
        x0: STAIRS.x0 + R,
        x1: STAIRS.x1 - R,
        z0: VIADUCT.walkHalfWidth - R - 0.2,
        z1: STAIRS.zTop + 0.3,
        h: () => VIADUCT.deckY,
      },
      {
        x0: STAIRS.x0 + R,
        x1: STAIRS.x1 - R,
        z0: STAIRS.zTop,
        z1: STAIRS.zBottom + 0.5,
        h: (x, z) => rise * Math.min(1, Math.max(0, (STAIRS.zBottom - z) / (STAIRS.zBottom - STAIRS.zTop))),
      },
    ];
    // Solid columns on the valley floor (viaduct piers). Axis aligned boxes in xz with a y range.
    this.solids = [];
    for (const px of VIADUCT.piersX) {
      for (const pz of [-4.6, 4.6]) {
        this.solids.push({ x0: px - 1.1, x1: px + 1.1, z0: pz - 1.1, z1: pz + 1.1, y0: -1, y1: VIADUCT.deckY - 1.5 });
      }
    }
  }

  addSolid(box) {
    this.solids.push(box);
  }

  // Highest walkable height at (x,z) reachable from feet height y, or null.
  groundAt(x, z, y) {
    let best = null;
    for (const s of this.surfaces) {
      if (!inRect(s, x, z)) continue;
      if (s.exclude && inRect(s.exclude, x, z)) continue;
      const h = s.h(x, z);
      if (h <= y + STEP && Math.abs(h - y) <= STEP && (best === null || h > best)) best = h;
    }
    return best;
  }

  blocked(x, z, y) {
    for (const b of this.solids) {
      if (y + 1.8 < b.y0 || y > b.y1) continue;
      if (x > b.x0 - R && x < b.x1 + R && z > b.z0 - R && z < b.z1 + R) return true;
    }
    return false;
  }

  // Attempt to move from (x,y,z) by (dx,dz), sliding along blocked axes.
  move(pos, dx, dz) {
    const tryAt = (nx, nz) => {
      const g = this.groundAt(nx, nz, pos.y);
      if (g === null || this.blocked(nx, nz, g)) return null;
      return g;
    };
    let g = tryAt(pos.x + dx, pos.z + dz);
    if (g !== null) {
      pos.x += dx;
      pos.z += dz;
      pos.y = g;
      return;
    }
    g = tryAt(pos.x + dx, pos.z);
    if (g !== null) {
      pos.x += dx;
      pos.y = g;
      return;
    }
    g = tryAt(pos.x, pos.z + dz);
    if (g !== null) {
      pos.z += dz;
      pos.y = g;
    }
  }

  // Snap a position to the nearest valid ground below it (used for teleports).
  snap(pos) {
    let best = null;
    for (const s of this.surfaces) {
      if (!inRect(s, pos.x, pos.z)) continue;
      if (s.exclude && inRect(s.exclude, pos.x, pos.z)) continue;
      const h = s.h(pos.x, pos.z);
      if (h <= pos.y + 0.5 && (best === null || h > best)) best = h;
    }
    if (best !== null) pos.y = best;
    return best !== null;
  }
}
