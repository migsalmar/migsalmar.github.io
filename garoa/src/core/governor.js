// Dynamic resolution: trims the render scale when frames run long and slowly gives it back.
// rAF timing saturates at the display refresh, so headroom can't be measured directly;
// upscaling therefore waits for a sustained run of on-time frames (hysteresis) to avoid
// oscillating between two scales.
export class ResolutionGovernor {
  constructor(apply, { min = 0.6, slow = 1 / 52, fast = 1 / 58 } = {}) {
    this.apply = apply;
    this.min = min;
    this.slow = slow;
    this.fast = fast;
    this.scale = 1;
    this.enabled = true;
    this.acc = 0;
    this.n = 0;
    this.goodStreak = 0;
    this.cooldown = 2;
  }
  reset() {
    this.scale = 1;
    this.acc = 0;
    this.n = 0;
    this.goodStreak = 0;
    this.cooldown = 2;
  }
  sample(dt) {
    if (!this.enabled) return;
    this.cooldown -= dt;
    this.acc += dt;
    this.n++;
    if (this.acc < 1.0) return;
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;
    if (this.cooldown > 0) return;
    if (avg > this.slow && this.scale > this.min) {
      this.scale = Math.max(this.min, this.scale * 0.88);
      this.goodStreak = 0;
      this.cooldown = 1.5;
      this.apply(this.scale);
    } else if (avg < this.fast) {
      this.goodStreak++;
      if (this.goodStreak >= 6 && this.scale < 1) {
        this.scale = Math.min(1, this.scale * 1.06);
        this.goodStreak = 3;
        this.cooldown = 1.5;
        this.apply(this.scale);
      }
    } else {
      this.goodStreak = 0;
    }
  }
}
