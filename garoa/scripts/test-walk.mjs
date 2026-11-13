// Node test for the analytic walkmap: floor, staircase to the viaduct, deck edges, piers.
import { Walkmap } from '../src/core/walk.js';
import { STAIRS, VIADUCT, VALLEY } from '../src/world/layout.js';

const w = new Walkmap();
let fails = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${extra}`);
  if (!cond) fails++;
};
const walk = (p, dx, dz, steps) => {
  for (let i = 0; i < steps; i++) w.move(p, dx, dz);
  return p;
};

// 1. walk north along the valley floor
let p = { x: 0, y: 0, z: 120 };
walk(p, 0, -0.1, 500);
check('floor walk north', Math.abs(p.z - 70) < 0.01 && p.y === 0, JSON.stringify(p));

// 2. cannot walk into the east façade
p = { x: 30, y: 0, z: 100 };
walk(p, 0.1, 0, 100);
check('blocked by east towers', p.x <= VALLEY.halfWidth, `x=${p.x.toFixed(2)}`);

// 3. cannot walk through the side of the staircase mass
p = { x: -20, y: 0, z: 30 };
walk(p, -0.1, 0, 200);
check('blocked by stair side', p.x > STAIRS.x1, `x=${p.x.toFixed(2)}`);

// 4. climb the stairs from the bottom onto the deck
p = { x: (STAIRS.x0 + STAIRS.x1) / 2, y: 0, z: STAIRS.zBottom + 3 };
walk(p, 0, -0.1, 800);
check('reached deck level via stairs', Math.abs(p.y - VIADUCT.deckY) < 1e-6, JSON.stringify({ x: p.x.toFixed(2), y: p.y.toFixed(2), z: p.z.toFixed(2) }));

// 5. walk east along the deck, across the valley
walk(p, 0.1, 0, 450);
check('walk east on deck', p.y === VIADUCT.deckY && p.x > 0, `x=${p.x.toFixed(2)} y=${p.y}`);

// 6. cannot step off the north edge of the deck
walk(p, 0, -0.1, 200);
check('deck north railing holds', p.y === VIADUCT.deckY && p.z >= -VIADUCT.walkHalfWidth, `z=${p.z.toFixed(2)}`);

// 7. walking under the viaduct on the floor stays on the floor
p = { x: 0, y: 0, z: 30 };
walk(p, 0, -0.1, 600);
check('pass under viaduct', p.y === 0 && p.z < -20, `z=${p.z.toFixed(2)} y=${p.y}`);

// 8. piers block
p = { x: VIADUCT.piersX[1], y: 0, z: 20 };
walk(p, 0, -0.1, 400);
check('pier blocks', p.z > 4.6, `z=${p.z.toFixed(2)}`);

console.log(fails ? `${fails} failing` : 'all passed');
process.exit(fails ? 1 : 0);
