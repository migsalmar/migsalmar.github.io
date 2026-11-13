// Quality presets. "medium" targets 60 fps on a mid-range laptop GPU at 1080p.
export const PRESETS = {
  low: {
    name: 'low',
    pixelRatio: 0.7,
    msaa: 0,
    smaa: false,
    ssr: false,
    ssrScale: 0.25,
    ssrSteps: 12,
    rainStreaks: 6000,
    rainMist: 5000,
    volSteps: 6,
    bloomLevels: 5,
    shadows: false,
    neonLights: 3,
  },
  medium: {
    name: 'medium',
    pixelRatio: 1.0,
    msaa: 0,
    smaa: true,
    ssr: true,
    ssrScale: 0.5,
    ssrSteps: 22,
    rainStreaks: 16000,
    rainMist: 12000,
    volSteps: 10,
    bloomLevels: 7,
    shadows: false,
    neonLights: 6,
  },
  high: {
    name: 'high',
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    msaa: 4,
    smaa: false,
    ssr: true,
    ssrScale: 0.5,
    ssrSteps: 40,
    rainStreaks: 32000,
    rainMist: 24000,
    volSteps: 16,
    bloomLevels: 8,
    shadows: true,
    neonLights: 8,
  },
};

export const ORDER = ['low', 'medium', 'high'];

export class Quality {
  constructor(initial = 'medium') {
    this.listeners = new Set();
    this.current = PRESETS[initial] || PRESETS.medium;
  }
  get name() {
    return this.current.name;
  }
  set(name) {
    if (!PRESETS[name] || PRESETS[name] === this.current) return;
    this.current = PRESETS[name];
    for (const fn of this.listeners) fn(this.current);
  }
  cycle() {
    const i = ORDER.indexOf(this.current.name);
    this.set(ORDER[(i + 1) % ORDER.length]);
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
