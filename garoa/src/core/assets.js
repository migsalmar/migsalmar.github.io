import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

// CC0 assets from Poly Haven (polyhaven.com), downloaded at 1k into public/assets/polyhaven.
const BASE = './assets/polyhaven/';

function loadTex(loader, file, srgb, repeat = 1) {
  return new Promise((resolve, reject) => {
    loader.load(
      BASE + file,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 8;
        t.repeat.set(repeat, repeat);
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

export async function loadAssets(renderer) {
  const tl = new THREE.TextureLoader();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdrPromise = new HDRLoader().loadAsync(BASE + 'shanghai_bund_1k.hdr');
  const [concDiff, concNor, concRough, rustDiff, rustNor, rustRough, hdr] = await Promise.all([
    loadTex(tl, 'concrete_wall_008_diff_1k.jpg', true),
    loadTex(tl, 'concrete_wall_008_nor_gl_1k.jpg', false),
    loadTex(tl, 'concrete_wall_008_rough_1k.jpg', false),
    loadTex(tl, 'rusty_metal_02_diff_1k.jpg', true),
    loadTex(tl, 'rusty_metal_02_nor_gl_1k.jpg', false),
    loadTex(tl, 'rusty_metal_02_rough_1k.jpg', false),
    hdrPromise,
  ]);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  hdr.dispose();
  pmrem.dispose();
  return {
    envMap,
    concrete: { map: concDiff, normalMap: concNor, roughnessMap: concRough },
    rust: { map: rustDiff, normalMap: rustNor, roughnessMap: rustRough },
  };
}
