import * as THREE from 'three';
import { Quality } from './core/quality.js';
import { loadAssets } from './core/assets.js';
import { Walkmap } from './core/walk.js';
import { FirstPersonControls } from './core/controls.js';
import { buildWorld } from './world/index.js';
import { PostFX } from './post/pipeline.js';
import { VIEWPOINTS } from './world/layout.js';
import { ResolutionGovernor } from './core/governor.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
const BENCH = params.has('bench') ? parseInt(params.get('bench'), 10) || 30 : 0;
const FIXED_T = params.has('t') ? parseFloat(params.get('t')) : null;
if (SHOT) document.body.classList.add('shot');

const quality = new Quality(params.get('q') || 'medium');
// Debug overrides: any preset key can be forced from the URL, e.g. ?smaa=0&ssrSteps=16
for (const [k, v] of params) {
  if (k in quality.current && k !== 'name') quality.current[k] = v === 'true' ? true : v === 'false' ? false : Number(v);
}
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  stencil: false,
  depth: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: SHOT,
});
renderer.setPixelRatio(quality.current.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.15, 3200);

const state = { ready: false, frames: 0, quality: quality.name };
window.__garoa = state;
window.__garoaDebug = () => ({ x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2) });

const assets = await loadAssets(renderer);
const walkmap = new Walkmap();
const world = buildWorld({ scene, renderer, camera, assets, quality, walkmap });
const post = new PostFX(renderer, scene, camera, quality);
world.attachPost?.(post);
const controls = new FirstPersonControls(camera, canvas, walkmap);

const camIndex = Math.max(1, Math.min(VIEWPOINTS.length, parseInt(params.get('cam') || '1', 10))) - 1;
if (params.has('pos') && params.has('look')) {
  // free review camera: ?pos=x,y,z&look=x,y,z (no ground snapping)
  const pos = params.get('pos').split(',').map(Number);
  const look = params.get('look').split(',').map(Number);
  camera.position.fromArray(pos);
  camera.lookAt(...look);
  controls.enabled = false;
} else {
  controls.setPose(VIEWPOINTS[camIndex].pos, VIEWPOINTS[camIndex].target);
}

// HUD
const gate = document.getElementById('gate');
const fpsEl = document.getElementById('fps');
const qualEl = document.getElementById('qual');
const governor = new ResolutionGovernor((scale) => {
  post.renderScale = scale;
  post.setSize();
  showQuality();
});
governor.enabled = quality.current.dynamicRes && !SHOT && !BENCH;
const showQuality = () =>
  (qualEl.textContent = `quality: ${quality.name} (Q)` + (governor.enabled ? ` · scale ${Math.round(governor.scale * 100)}%` : ''));
showQuality();
gate.addEventListener('click', () => controls.lock());
controls.dispatch = (locked) => gate.classList.toggle('hidden', locked);

quality.onChange(() => {
  governor.reset();
  governor.enabled = quality.current.dynamicRes && !SHOT && !BENCH;
  post.renderScale = 1;
  post.build();
  world.onQuality?.(quality.current);
  showQuality();
  state.quality = quality.name;
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyQ') quality.cycle();
  const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
  if (n >= 0) controls.setPose(VIEWPOINTS[n].pos, VIEWPOINTS[n].target);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  post.setSize(window.innerWidth, window.innerHeight);
});

const timer = new THREE.Timer();
timer.connect(document);
let fpsAccum = 0;
let fpsFrames = 0;
let elapsed = 0;

// ?bench=N: render N frames synchronously after warm-up and report the mean frame time.
async function bench(n) {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  // finish() does not block across Chromium's GPU process; a readback does
  const sync = () => {
    renderer.setRenderTarget(null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  const t = FIXED_T ?? 10;
  for (let i = 0; i < 3; i++) {
    world.update(t, 1 / 60, camera);
    post.update(t);
    post.render(1 / 60);
  }
  sync();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    renderer.info.reset();
    world.update(t + i / 60, 1 / 60, camera);
    post.update(t + i / 60);
    post.render(1 / 60);
    sync();
  }
  state.bench = { msPerFrame: (performance.now() - t0) / n, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  state.ready = true;
}

function frame(now) {
  timer.update(now);
  renderer.info.reset();
  const dt = Math.min(timer.getDelta(), 0.1);
  elapsed += dt;
  const t = FIXED_T ?? elapsed;
  if (!SHOT) controls.update(dt);
  world.update(t, dt, camera);
  post.update(t);
  post.render(SHOT ? 1 / 60 : dt);

  governor.sample(dt);
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum > 0.5) {
    fpsEl.textContent = `${Math.round(fpsFrames / fpsAccum)} fps · ${renderer.info.render.calls} calls`;
    fpsAccum = 0;
    fpsFrames = 0;
  }
  state.frames++;
  if (state.frames === 4) {
    state.ready = true;
    state.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }
  if (SHOT && state.ready) return; // freeze after the capture frame
  requestAnimationFrame(frame);
}
if (BENCH) bench(BENCH);
else requestAnimationFrame(frame);
