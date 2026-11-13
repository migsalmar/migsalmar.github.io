import * as THREE from 'three';
import { createSky } from './sky.js';
import { createValley } from './valley.js';
import { createCity } from './city.js';
import { createGround } from './ground.js';
import { createRain } from './rain.js';
import { createSigns } from './signs.js';
import { createHologram } from './hologram.js';
import { createPixacao } from './pixacao.js';
import { createAviationLights } from './aviation.js';
import { createHelicopter } from './helicopter.js';

// Assembles the scene. Each component exposes an optional update(t, dt, camera).
export function buildWorld({ scene, renderer, assets, quality, walkmap, camera }) {
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

  const signs = createSigns(city);
  scene.add(signs.group);
  signs.setLightBudget(quality.current.neonLights);
  const holo = createHologram();
  scene.add(holo.group);
  const pix = createPixacao(city);
  scene.add(pix.mesh);
  const avi = createAviationLights(city.aviation, city.rnd);
  scene.add(avi.mesh);
  const heli = createHelicopter(scene);
  const slColor = new THREE.Color(1.0, 0.95, 0.86);
  let post = null;
  const applyShadows = (q) => {
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    heli.setShadows(q.shadows);
    scene.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
    });
  };
  applyShadows(quality.current);
  updaters.push((t) => {
    heli.update(t);
    const st = heli.state;
    post?.fog.setSearchlight(st.pos, st.dir, st.angle, slColor, 70);
    const ru = rain.uniforms;
    ru.uSLPos.value.copy(st.pos);
    ru.uSLDir.value.copy(st.dir);
    ru.uSLCos.value = Math.cos(st.angle);
    ru.uSLColor.value.copy(slColor).multiplyScalar(140);
  });
  updaters.push((t) => {
    signs.uniforms.uTime.value = t;
    holo.uniforms.uTime.value = t;
    avi.uniforms.uTime.value = t;
  });

  // Ambient: the city glow from the cloud deck above, almost nothing from below.
  const hemi = new THREE.HemisphereLight(0x8a4a22, 0x0a0806, 0.12);
  scene.add(hemi);

  return {
    valley,
    city,
    ground,
    rain,
    signs,
    holo,
    heli,
    onQuality(q) {
      signs.setLightBudget(q.neonLights);
      rain.setCounts(q);
      applyShadows(q);
    },
    attachPost(p) {
      post = p;
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
