import * as THREE from 'three';
import { Quality } from './core/quality.js';
import { loadAssets } from './core/assets.js';
import { Walkmap } from './core/walk.js';
import { FirstPersonControls } from './core/controls.js';
import { buildWorld } from './world/index.js';
import { PostFX } from './post/pipeline.js';
import { VIEWPOINTS } from './world/layout.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
const FIXED_T = params.has('t') ? parseFloat(params.get('t')) : null;
if (SHOT) document.body.classList.add('shot');

const quality = new Quality(params.get('q') || 'medium');
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
const showQuality = () => (qualEl.textContent = `quality: ${quality.name} (Q)`);
showQuality();
gate.addEventListener('click', () => controls.lock());
controls.dispatch = (locked) => gate.classList.toggle('hidden', locked);

quality.onChange(() => {
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
requestAnimationFrame(frame);
