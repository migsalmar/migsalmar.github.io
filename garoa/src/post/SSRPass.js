import * as THREE from 'three';
import { Pass } from 'postprocessing';
import { WET_GLSL } from '../shaders/wet.glsl.js';

// Screen-space reflections for wet, up-facing surfaces (valley floor, viaduct deck, stair
// treads, roofs). Horizontal surfaces are detected from the depth buffer, so no extra
// normal pass is needed. Rays are traced at reduced resolution in view space with
// geometric step growth and a binary refinement, then blurred mostly vertically to get the
// long streaky reflections of light on rain-slick stone, and composited additively.

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }
`;

const COMMON = /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uProj;
  uniform mat4 uInvProj;
  uniform mat4 uCamWorld;
  uniform mat4 uView;
  uniform vec2 uDepthTexel;
  vec3 viewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 v = uInvProj * c;
    return v.xyz / v.w;
  }
  // 1 when the pixel is an up-facing horizontal surface, from neighbouring world heights.
  float flatUp(vec2 uv, vec3 vp, out vec3 wp) {
    wp = (uCamWorld * vec4(vp, 1.0)).xyz;
    vec3 wr = (uCamWorld * vec4(viewPos(uv + vec2(uDepthTexel.x, 0.0)), 1.0)).xyz;
    vec3 wl = (uCamWorld * vec4(viewPos(uv - vec2(uDepthTexel.x, 0.0)), 1.0)).xyz;
    vec3 wu = (uCamWorld * vec4(viewPos(uv + vec2(0.0, uDepthTexel.y)), 1.0)).xyz;
    vec3 wd = (uCamWorld * vec4(viewPos(uv - vec2(0.0, uDepthTexel.y)), 1.0)).xyz;
    float dyx = min(abs(wr.y - wp.y), abs(wl.y - wp.y));
    float dyy = min(abs(wu.y - wp.y), abs(wd.y - wp.y));
    float dxz = max(min(length(wr.xz - wp.xz), length(wl.xz - wp.xz)), min(length(wu.xz - wp.xz), length(wd.xz - wp.xz)));
    float slope = max(dyx, dyy) / max(dxz, 1e-4);
    return 1.0 - smoothstep(0.04, 0.12, slope);
  }
`;

const TRACE_FRAG = /* glsl */ `
  #include <common>
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform vec3 uCamPos;
  uniform float uTime;
  uniform float uSteps;
  ${COMMON}
  ${WET_GLSL}
  void main() {
    float d = texture2D(tDepth, vUv).r;
    if (d >= 0.99999) { gl_FragColor = vec4(0.0); return; }
    vec3 vp = viewPos(vUv);
    vec3 wp;
    float flatness = flatUp(vUv, vp, wp);
    if (flatness < 0.01 || wp.y > uCamPos.y + 0.1) { gl_FragColor = vec4(0.0); return; }

    float puddle = puddleMask(wp.xz);
    vec2 slope = rippleSlope(wp.xz, uTime) * puddle;
    // micro-roughness of wet stone outside puddles: stochastic normal jitter, mostly
    // along the view direction so the blur turns it into vertical streaks
    vec2 jn = vec2(wHash(gl_FragCoord.xy), wHash(gl_FragCoord.xy + 17.17)) - 0.5;
    vec2 jitter = jn * 0.16 * (1.0 - puddle) + (vec2(wNoise(wp.xz * 9.0), wNoise(wp.xz * 9.0 + 5.3)) - 0.5) * 0.05;
    vec3 nW = normalize(vec3(-(slope.x + jitter.x), 1.0, -(slope.y + jitter.y)));
    vec3 nV = normalize((uView * vec4(nW, 0.0)).xyz);

    vec3 V = normalize(vp);
    vec3 R = normalize(reflect(V, nV));
    float cosT = clamp(dot(-V, nV), 0.0, 1.0);
    float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
    float reflectivity = mix(0.4, 1.0, puddle) * fres * flatness;

    vec3 pos = vp + nV * 0.02;
    float stepLen = 0.25 + 0.004 * length(vp);
    vec2 hitUv = vec2(-1.0);
    float hitSky = 0.0;
    vec3 prev = pos;
    for (int i = 0; i < MAX_STEPS; i++) {
      if (float(i) >= uSteps) break;
      prev = pos;
      pos += R * stepLen;
      stepLen *= 1.28;
      vec4 c = uProj * vec4(pos, 1.0);
      vec2 uv = c.xy / c.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || c.w <= 0.0) break;
      float sd = texture2D(tDepth, uv).r;
      if (sd >= 0.99999) {
        if (i > 3) { hitUv = uv; hitSky = 1.0; }
        continue;
      }
      float sceneZ = viewPos(uv).z;
      float thick = max(stepLen * 2.0, 0.6);
      if (pos.z < sceneZ && pos.z > sceneZ - thick) {
        // binary refinement between prev and pos
        vec3 a = prev, b = pos;
        for (int j = 0; j < 5; j++) {
          vec3 m = (a + b) * 0.5;
          vec4 cm = uProj * vec4(m, 1.0);
          vec2 um = cm.xy / cm.w * 0.5 + 0.5;
          if (m.z < viewPos(um).z) b = m; else a = m;
        }
        vec4 cb = uProj * vec4(b, 1.0);
        hitUv = cb.xy / cb.w * 0.5 + 0.5;
        hitSky = 0.0;
        break;
      }
    }
    if (hitUv.x < 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, flatness); return; }
    vec2 e = smoothstep(vec2(0.0), vec2(0.08), hitUv) * (1.0 - smoothstep(vec2(0.92), vec2(1.0), hitUv));
    float edge = e.x * e.y;
    float facing = 1.0 - smoothstep(-0.1, 0.25, R.z); // rays toward the camera can't be resolved
    vec3 col = texture2D(tColor, hitUv).rgb;
    if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
    col = min(col, vec3(6.0));
    float w = reflectivity * edge * facing * mix(1.0, 0.6, hitSky);
    gl_FragColor = vec4(col * w, flatness);
  }
`;

// Depth-aware separable blur. Only samples that are themselves reflective contribute.
const BLUR_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tInput;
  uniform vec2 uDir;
  void main() {
    vec4 c = texture2D(tInput, vUv);
    float wsum = 0.4;
    vec3 acc = c.rgb * 0.4;
    for (int i = 1; i <= 8; i++) {
      float fi = float(i);
      float w = exp(-fi * fi / 24.0);
      vec4 a = texture2D(tInput, vUv + uDir * fi);
      vec4 b = texture2D(tInput, vUv - uDir * fi);
      acc += a.rgb * w * a.a + b.rgb * w * b.a;
      wsum += w * a.a + w * b.a;
    }
    gl_FragColor = vec4(acc / max(wsum, 1e-3), c.a);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  #include <common>
  varying vec2 vUv;
  uniform sampler2D tInput;
  uniform sampler2D tSSR;
  uniform float uIntensity;
  ${COMMON}
  void main() {
    vec4 base = texture2D(tInput, vUv);
    if (any(isnan(base.rgb)) || any(isinf(base.rgb))) base.rgb = vec3(0.0);
    float d = texture2D(tDepth, vUv).r;
    float m = 0.0;
    if (d < 0.99999) { vec3 wp; m = flatUp(vUv, viewPos(vUv), wp); }
    vec3 r = texture2D(tSSR, vUv).rgb;
    gl_FragColor = vec4(base.rgb + r * m * uIntensity, base.a);
  }
`;

export class SSRPass extends Pass {
  constructor(mainCamera, { scale = 0.5, steps = 24, maxSteps = 48 } = {}) {
    super('SSRPass');
    this.needsDepthTexture = true;
    this.needsSwap = true;
    this.cam = mainCamera;
    this.scale = scale;
    this.time = 0;
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.traceRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.blurRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);

    const shared = {
      tDepth: { value: null },
      uProj: { value: new THREE.Matrix4() },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uView: { value: new THREE.Matrix4() },
      uDepthTexel: { value: new THREE.Vector2() },
    };
    this.shared = shared;
    this.traceMat = new THREE.ShaderMaterial({
      defines: { MAX_STEPS: maxSteps },
      uniforms: {
        ...shared,
        tColor: { value: null },
        uCamPos: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uSteps: { value: steps },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: TRACE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, tInput: { value: null }, tSSR: { value: this.traceRT.texture }, uIntensity: { value: 1.0 } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fullscreenMaterial = this.compositeMat;
  }

  set steps(v) {
    this.traceMat.uniforms.uSteps.value = v;
  }

  setDepthTexture(depthTexture) {
    this.shared.tDepth.value = depthTexture;
  }

  setSize(width, height) {
    const w = Math.max(1, Math.round(width * this.scale));
    const h = Math.max(1, Math.round(height * this.scale));
    this.traceRT.setSize(w, h);
    this.blurRT.setSize(w, h);
    this.shared.uDepthTexel.value.set(1 / width, 1 / height);
    this.traceSize = new THREE.Vector2(w, h);
  }

  blit(renderer, material, target) {
    this.fullscreenMaterial = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  render(renderer, inputBuffer, outputBuffer) {
    const cam = this.cam;
    const s = this.shared;
    s.uProj.value.copy(cam.projectionMatrix);
    s.uInvProj.value.copy(cam.projectionMatrixInverse);
    s.uCamWorld.value.copy(cam.matrixWorld);
    s.uView.value.copy(cam.matrixWorldInverse);
    const tu = this.traceMat.uniforms;
    tu.tColor.value = inputBuffer.texture;
    tu.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    tu.uTime.value = this.time;

    this.blit(renderer, this.traceMat, this.traceRT);
    const bu = this.blurMat.uniforms;
    const tw = this.traceSize;
    // vertical streaks: a contiguous pass, then a wide one on top of it (smooth falloff,
    // no tap banding), then a light horizontal soften
    bu.tInput.value = this.traceRT.texture;
    bu.uDir.value.set(0, 1.0 / tw.y);
    this.blit(renderer, this.blurMat, this.blurRT);
    bu.tInput.value = this.blurRT.texture;
    bu.uDir.value.set(0, 3.0 / tw.y);
    this.blit(renderer, this.blurMat, this.traceRT);
    bu.tInput.value = this.traceRT.texture;
    bu.uDir.value.set(1.0 / tw.x, 0);
    this.blit(renderer, this.blurMat, this.blurRT);
    this.compositeMat.uniforms.tSSR.value = this.blurRT.texture;

    this.compositeMat.uniforms.tInput.value = inputBuffer.texture;
    this.blit(renderer, this.compositeMat, this.renderToScreen ? null : outputBuffer);
  }

  dispose() {
    this.traceRT.dispose();
    this.blurRT.dispose();
    this.traceMat.dispose();
    this.blurMat.dispose();
    this.compositeMat.dispose();
  }
}
