// The data of one example, exported by tools/pdestudio-demo/export.jl from PDEStudioCore: the SimulationConfig,
// the grid axes and, for every method and swept value, the solution and the statistics. No DOM code, so the
// tests can run it in Node.

const SENTINEL = -32768;
const REFERENCE_WORDS = ['analytic', 'reference', 'exact', 'baseline', 'true'];

// PDEStudioCore.is_reference_method: a method whose name contains one of the reference words.
export const isReferenceMethod = (name) => REFERENCE_WORDS.some((word) => name.toLowerCase().includes(word));

// The display names of PDEStudio's SYMBOL_TO_LABEL_MAP that the demo uses.
const LABELS = {
  x: 'Position (X)',
  y: 'Position (Y)',
  z: 'Position (Z)',
  t: 'Time (T)',
  none: 'Disabled',
  lines_1d: '1D Lines',
  lines_2d: '2D Lines',
  lines_3d: '3D Lines',
  scatter_1d: '1D Scatter',
  scatter_2d: '2D Scatter',
  scatter_3d: '3D Scatter',
  scatter_lines: 'Scatter Lines',
  scatter_colors: 'Scatter Colors',
  scatter_surface: '2D Scatter (Surface)',
  contour_colors: 'Contour Lines',
  contour_cmap: 'Contour Colormap',
  contour_f: 'Contour Filled',
  contour_surface: 'Contour Surface',
  contour_3d: '3D Contour',
  heatmap_flat: 'Flat',
  heatmap_surface: 'Surface',
  volume_3d: '3D Cloud (Volume)',
  particles_1d: '1D Particles',
  particles_lines: 'Particle Lines',
  particles_colors: 'Particle Colors',
  particles_2d: '2D Particles',
  particles_surface: '2D Particles (Surface)',
  particles_3d: '3D Particles',
};

// PDEStudio's frontend_key: a user label, a known label, or the words of the name in title case.
export function frontendKey(name, labels = {}) {
  if (labels[name] !== undefined) return labels[name];
  if (LABELS[name] !== undefined) return LABELS[name];
  return String(name)
    .split('_')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

// Base64 Int16 values between lo and lo + 65534 scale, as written by pack() in the exporter.
export function decode({ lo, scale, data }) {
  const bytes = typeof atob === 'function' ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) : Buffer.from(data, 'base64');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) {
    const q = view.getInt16(2 * i, true);
    out[i] = q === SENTINEL ? NaN : lo + (q + 32767) * scale;
  }
  return out;
}

export class Example {
  constructor(json) {
    Object.assign(this, json);
    this.particles = json.kind === 'lagrangian';
    this.sweepKey = json.sweep.key;
    this.sweepValues = json.sweep.values;
    // Every method of the configuration: references first, then by name (PDEStudio's sort_methods).
    this.allMethods = Object.keys(json.config.methods).sort((a, b) =>
      isReferenceMethod(a) === isReferenceMethod(b) ? (a < b ? -1 : a > b ? 1 : 0) : isReferenceMethod(a) ? -1 : 1,
    );
    this.computed = Object.keys(json.runs);
    this.statNames = [...new Set(Object.values(json.runs).flatMap((runs) => runs.flatMap((run) => Object.keys(run.stats))))].sort();
    this.spaceDims = json.dims.filter((d) => d !== json.time_dim);
    this.cache = new Map();
  }

  run(method, s) {
    return this.runs[method]?.[s];
  }

  // The kept dimensions of a statistic: ['t'] for a time series, [] for a single value.
  statDims(name) {
    const dims = this.stat_dims[name] ?? [];
    return dims.map((d) => (d === 'time' ? this.time_dim : d));
  }

  // Grid data: the decoded solution of a run, Julia (column-major) order over the axes.
  solution(method, s) {
    const key = `${method}|${s}`;
    if (!this.cache.has(key)) this.cache.set(key, decode(this.run(method, s).solution));
    return this.cache.get(key);
  }

  axis(dim) {
    return this.axes[dim];
  }

  // Index into a grid solution for the axis indices idx = { x, y, t }.
  index(idx) {
    let i = 0;
    let stride = 1;
    for (const d of this.dims) {
      i += (idx[d] ?? 0) * stride;
      stride *= this.axes[d].length;
    }
    return i;
  }

  // Particle data: times, positions and states, decoded once per run.
  particleRun(method, s) {
    const key = `${method}|${s}|p`;
    if (!this.cache.has(key)) {
      const run = this.run(method, s);
      this.cache.set(key, { t: run.t, count: run.count, positions: decode(run.positions), u: decode(run.u) });
    }
    return this.cache.get(key);
  }

  stat(method, s, name) {
    return this.run(method, s)?.stats[name];
  }
}

export async function loadExample(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return new Example(await response.json());
}

// Nearest index of value in a sorted array.
export function nearestIndex(values, value) {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(values[i] - value) < Math.abs(values[best] - value)) best = i;
  return best;
}
