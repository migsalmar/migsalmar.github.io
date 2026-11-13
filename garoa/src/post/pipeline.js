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
  VignetteEffect,
  NoiseEffect,
  BlendFunction,
} from 'postprocessing';
import { SSRPass } from './SSRPass.js';
import { FogEffect } from './FogEffect.js';

// Render -> SSR (wet surfaces) -> fog + searchlight volume + backlit drizzle
//        -> bloom + ACES + vignette + grain -> SMAA (medium only; high uses MSAA)
export class PostFX {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.composer = null;
    this.time = 0;
    this.renderScale = 1; // dynamic resolution multiplier on the preset pixel ratio
    this.afterFog = []; // factories (quality) => Pass, inserted after the fog pass
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

    this.ssr = null;
    if (q.ssr) {
      this.ssr = new SSRPass(this.camera, { scale: q.ssrScale, steps: q.ssrSteps });
      composer.addPass(this.ssr);
    }

    const prevSL = this.fog?.uniforms;
    this.fog = new FogEffect(this.camera, { volSteps: q.volSteps, rain: 1.0 });
    if (prevSL) {
      for (const k of ['uSLOn', 'uSLPos', 'uSLDir', 'uSLCos', 'uSLColor']) {
        const v = prevSL.get(k).value;
        const dst = this.fog.uniforms.get(k);
        dst.value = typeof v === 'number' ? v : v.clone();
      }
    }
    composer.addPass(new EffectPass(this.camera, this.fog));
    for (const make of this.afterFog) composer.addPass(make(q));

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.85,
      luminanceSmoothing: 0.4,
      intensity: 1.25,
      radius: 0.8,
      levels: q.bloomLevels,
    });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.62 });
    const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    grain.blendMode.opacity.value = 0.11;
    composer.addPass(new EffectPass(this.camera, this.bloom, this.tone, vignette, grain));
    if (q.smaa) composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
    this.composer = composer;
    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(w = window.innerWidth, h = window.innerHeight) {
    this.renderer.setPixelRatio(this.quality.current.pixelRatio * this.renderScale);
    this.composer.setSize(w, h);
  }

  update(t) {
    this.time = t;
    if (this.ssr) this.ssr.time = t;
    this.fog.uniforms.get('uTime').value = t;
  }

  render(dt) {
    this.composer.render(dt);
  }
}
