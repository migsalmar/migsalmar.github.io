import * as THREE from 'three';
import { createSky } from './sky.js';
import { createValley } from './valley.js';
import { createCity } from './city.js';

// Assembles the scene. Each component exposes an optional update(t, dt, camera).
export function buildWorld({ scene, assets, quality }) {
  const updaters = [];
  scene.environment = assets.envMap;
  scene.environmentIntensity = 0.16;
  scene.environmentRotation.set(0, 1.2, 0);
  scene.background = new THREE.Color(0x050304);

  const sky = createSky();
  scene.add(sky.object);
  updaters.push((t, dt, cam) => sky.update(t, cam));

  const valley = createValley(assets);
  scene.add(valley.group);

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
    update(t, dt, camera) {
      for (const u of updaters) u(t, dt, camera);
    },
  };
}
