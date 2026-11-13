import * as THREE from 'three';
import { Pass } from 'postprocessing';
import { LAMPS_GLSL, lampUniforms } from '../shaders/lamps.glsl.js';

// Garoa: two GPU particle layers that live entirely in the vertex shader.
//  - streaks: motion-blurred drops, camera-facing along their velocity
//  - mist: fine suspended droplets drifting on turbulent wind
// Both wrap around the camera in a box, take light from the lamp rows and the searchlight,
// and are drawn after the fog pass with a manual depth test against the scene depth.

const MAX_STREAKS = 32000;
const MAX_MIST = 24000;

const VERT = /* glsl */ `
  attribute vec4 aRand;
  uniform float uTime;
  uniform vec3 uCamPos;
  uniform float uBox;
  uniform float uSpeed;
  uniform vec2 uWind;
  uniform float uLen;
  uniform float uWidth;
  uniform float uMist;
  uniform vec3 uAmbient;
  uniform vec3 uSLPos;
  uniform vec3 uSLDir;
  uniform float uSLCos;
  uniform vec3 uSLColor;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  ${LAMPS_GLSL}
  void main() {
    vec3 base = aRand.xyz * uBox;
    float speed = uSpeed * (0.75 + 0.5 * aRand.w);
    vec3 vel = vec3(uWind.x, -speed, uWind.y);
    vec3 p = base + vel * uTime;
    if (uMist > 0.5) {
      // slow, turbulent drift
      float t = uTime * 0.6 + aRand.w * 40.0;
      p += vec3(sin(t + aRand.y * 9.0), cos(t * 0.7 + aRand.x * 7.0) * 0.4, sin(t * 0.8 + aRand.z * 5.0)) * 0.6;
    }
    p = mod(p - uCamPos + 0.5 * uBox, uBox) - 0.5 * uBox + uCamPos;
    vec3 dir = normalize(vel);
    vec3 toCam = normalize(cameraPosition - p);
    vec3 side;
    vec3 wp;
    if (uMist > 0.5) {
      vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
      vec3 up = cross(toCam, right);
      float sz = uWidth * (0.6 + 0.8 * aRand.w);
      wp = p + (right * position.x + up * position.y) * sz;
    } else {
      side = normalize(cross(dir, toCam));
      float len = uLen * (0.6 + 0.8 * aRand.w);
      wp = p + side * position.x * uWidth + dir * position.y * len;
    }
    vUv = position.xy + 0.5;
    float d = length(p - uCamPos);
    vAlpha = smoothstep(uBox * 0.5, uBox * 0.28, d) * smoothstep(0.25, 1.2, d);
    // light: ambient city glow + street lamps + searchlight cone
    vec3 light = uAmbient + lampGlow(p) * 0.012;
    vec3 lp = p - uSLPos;
    float cosP = dot(normalize(lp), uSLDir);
    light += uSLColor * smoothstep(uSLCos, mix(uSLCos, 1.0, 0.5), cosP) / (1.0 + dot(lp, lp) * 0.0004) * 0.03;
    // drops seen against the light glint (forward scattering)
    vColor = light;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform float uOpacity;
  uniform float uMist;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float sceneDepth = texture2D(tDepth, gl_FragCoord.xy / uResolution).r;
    if (gl_FragCoord.z > sceneDepth) discard;
    float a;
    if (uMist > 0.5) {
      float r = length(vUv - 0.5) * 2.0;
      a = smoothstep(1.0, 0.0, r);
    } else {
      float x = abs(vUv.x - 0.5) * 2.0;
      a = (1.0 - x) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
    }
    a *= vAlpha * uOpacity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

function makeLayer(count, uniforms, mist) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  const r = new Float32Array(count * 4);
  for (let i = 0; i < r.length; i++) r[i] = Math.random();
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(r, 4));
  geo.instanceCount = count;
  const own = mist
    ? { uMist: { value: 1 }, uBox: { value: 26 }, uSpeed: { value: 0.9 }, uWidth: { value: 0.022 }, uLen: { value: 0 }, uOpacity: { value: 0.55 } }
    : { uMist: { value: 0 }, uBox: { value: 34 }, uSpeed: { value: 6.5 }, uWidth: { value: 0.011 }, uLen: { value: 0.42 }, uOpacity: { value: 0.42 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...own },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function createRain(timeUniform) {
  const shared = {
    ...lampUniforms(),
    uTime: timeUniform,
    uCamPos: { value: new THREE.Vector3() },
    uWind: { value: new THREE.Vector2(0.9, 0.35) },
    uAmbient: { value: new THREE.Color(0.11, 0.05, 0.025) },
    uSLPos: { value: new THREE.Vector3(0, 1000, 0) },
    uSLDir: { value: new THREE.Vector3(0, -1, 0) },
    uSLCos: { value: Math.cos(0.1) },
    uSLColor: { value: new THREE.Color(0, 0, 0) },
    tDepth: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
  };
  const scene = new THREE.Scene();
  const streaks = makeLayer(MAX_STREAKS, shared, false);
  const mist = makeLayer(MAX_MIST, shared, true);
  scene.add(streaks, mist);

  return {
    scene,
    uniforms: shared,
    setCounts(q) {
      streaks.geometry.instanceCount = Math.min(MAX_STREAKS, q.rainStreaks);
      mist.geometry.instanceCount = Math.min(MAX_MIST, q.rainMist);
    },
    update(camera) {
      shared.uCamPos.value.copy(camera.position);
    },
    createPass(camera) {
      return new RainPass(scene, camera, shared);
    },
  };
}

// Draws the rain scene over the current buffer after fog; depth-tests manually against the
// composer's scene depth so drops vanish behind geometry without needing a depth attachment.
class RainPass extends Pass {
  constructor(scene, camera, uniforms) {
    super('RainPass', scene, camera);
    this.needsSwap = false;
    this.needsDepthTexture = true;
    this.u = uniforms;
  }
  setDepthTexture(t) {
    this.u.tDepth.value = t;
  }
  setSize(w, h) {
    this.u.uResolution.value.set(w, h);
  }
  render(renderer, inputBuffer) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }
}
