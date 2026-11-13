import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  SMAAEffect,
  SMAAPreset,
} from 'postprocessing';

// Post chain. Rebuilt whenever the quality preset changes.
export class PostFX {
  constructor(renderer, scene, camera, quality, hooks = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.hooks = hooks;
    this.composer = null;
    this.build();
  }

  build() {
    const q = this.quality.current;
    if (this.composer) this.composer.dispose();
    const composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: q.msaa,
    });
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.hooks.beforeBloom?.(composer, q);

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.9,
      luminanceSmoothing: 0.35,
      intensity: 1.15,
      radius: 0.78,
      levels: q.bloomLevels,
    });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    composer.addPass(new EffectPass(this.camera, this.bloom, this.tone));
    if (q.smaa) composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
    this.composer = composer;
    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(w, h) {
    this.renderer.setPixelRatio(this.quality.current.pixelRatio);
    this.composer.setSize(w, h);
  }

  render(dt) {
    this.composer.render(dt);
  }
}
