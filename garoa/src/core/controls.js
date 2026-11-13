import * as THREE from 'three';
import { EYE_HEIGHT } from '../world/layout.js';

// Pointer-lock first-person controls with WASD, Shift to run, and a light head bob.
export class FirstPersonControls {
  constructor(camera, dom, walkmap) {
    this.camera = camera;
    this.dom = dom;
    this.walk = walkmap;
    this.feet = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.vel = new THREE.Vector2();
    this.keys = new Set();
    this.locked = false;
    this.bob = 0;
    this.sensitivity = 0.0022;
    this.enabled = true;

    this._onMouse = (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    };
    this._onKeyDown = (e) => this.keys.add(e.code);
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onLock = () => {
      this.locked = document.pointerLockElement === this.dom;
      this.dispatch?.(this.locked);
    };
    document.addEventListener('mousemove', this._onMouse);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', this._onLock);
  }

  lock() {
    this.dom.requestPointerLock?.();
  }

  setPose(pos, target) {
    this.feet.set(pos[0], pos[1] - EYE_HEIGHT, pos[2]);
    this.walk.snap(this.feet);
    const dx = target[0] - pos[0];
    const dy = target[1] - pos[1];
    const dz = target[2] - pos[2];
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.vel.set(0, 0);
    this.apply(0);
  }

  update(dt) {
    if (!this.enabled) return;
    const k = this.keys;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = run ? 7.5 : 3.2;
    let fx = 0;
    let fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len;
    fz /= len;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const wx = (fx * c + fz * s) * speed;
    const wz = (-fx * s + fz * c) * speed;
    const a = 1 - Math.exp(-dt * 10);
    this.vel.x += (wx - this.vel.x) * a;
    this.vel.y += (wz - this.vel.y) * a;
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.y) * dt) / 0.25));
    for (let i = 0; i < steps; i++) {
      this.walk.move(this.feet, (this.vel.x * dt) / steps, (this.vel.y * dt) / steps);
    }
    const sp = Math.hypot(this.vel.x, this.vel.y);
    this.bob += dt * sp * 1.9;
    this.apply(Math.min(1, sp / 4));
  }

  apply(bobAmount) {
    const cam = this.camera;
    const bobY = Math.sin(this.bob * 2) * 0.035 * bobAmount;
    cam.position.set(this.feet.x, this.feet.y + EYE_HEIGHT + bobY, this.feet.z);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.004 * bobAmount, 'YXZ');
  }
}
