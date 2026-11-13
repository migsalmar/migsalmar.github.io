import * as THREE from 'three';
import { createSky } from './sky.js';
import { createValley } from './valley.js';
import { createCity } from './city.js';
import { createGround } from './ground.js';
import { createRain } from './rain.js';

// Assembles the scene. Each component exposes an optional update(t, dt, camera).
export function buildWorld({ scene, assets, quality, walkmap, camera }) {
  const updaters = [];
  const timeU = { value: 0 };
  scene.environment = assets.envMap;
  scene.environmentIntensity = 0.16;
  scene.environmentRotation.set(0, 1.2, 0);
  scene.background = new THREE.Color(0x050304);

  const sky = createSky();
  scene.add(sky.object);
  updaters.push((t, dt, cam) => sky.update(t, cam));

  const valley = createValley(assets);
  scene.add(valley.group);

  const ground = createGround(valley.floor, valley.deck, timeU);
  scene.add(ground.group);
  for (const p of ground.polePositions) walkmap.addSolid({ x0: p.x - 0.15, x1: p.x + 0.15, z0: p.z - 0.15, z1: p.z + 0.15, y0: -1, y1: 9 });

  const rain = createRain(timeU);
  updaters.push((t, dt, cam) => rain.update(cam));

  const city = createCity(assets);
  scene.add(city.group);
  updaters.push((t) => (city.material.userData.uniforms.uTime.value = t));
  console.info('[garoa] city', JSON.stringify(city.counts));

  // Ambient: the city glow from the cloud deck above, almost nothing from below.
  const hemi = new THREE.HemisphereLight(0x8a4a22, 0x0a0806, 0.12);
  scene.add(hemi);

  return {
    valley,
    city,
    ground,
    rain,
    attachPost(post) {
      post.afterFog = [
        (q) => {
          rain.setCounts(q);
          return rain.createPass(camera);
        },
      ];
      post.build();
    },
    update(t, dt, cam) {
      timeU.value = t;
      for (const u of updaters) u(t, dt, cam);
    },
  };
}
