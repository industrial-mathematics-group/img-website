// The rules of PDEStudio's control panel, without DOM: which axes, fields, sliders and comparisons an example
// offers, and what the plots show for a given state. The studio (studio.js) draws the result.
import { frontendKey, isReferenceMethod, nearestIndex } from './data.js';

// The style page of PDEStudio, grouped as in the studio.
export const STYLE_GROUPS = [
  ['Lines', ['lines_1d', 'lines_2d', 'lines_3d']],
  ['Scatter', ['scatter_1d', 'scatter_lines', 'scatter_colors', 'scatter_2d', 'scatter_3d']],
  ['Contour', ['contour_colors', 'contour_cmap', 'contour_f', 'contour_surface', 'contour_3d']],
  ['Heatmap', ['heatmap_flat', 'heatmap_surface']],
  ['Volume', ['volume_3d']],
  ['Particles', ['particles_1d', 'particles_lines', 'particles_colors', 'particles_2d', 'particles_surface', 'particles_3d']],
];

// The styles the web version draws, by kind: 'line' (one independent axis), 'field' (two), 'particles'.
export const WEB_STYLES = {
  lines_1d: 'line',
  scatter_1d: 'line',
  scatter_lines: 'line',
  heatmap_flat: 'field',
  contour_colors: 'field',
  contour_f: 'field',
  particles_2d: 'particles',
};

export const LEGEND_OPTIONS = ['none', 'center', 'left', 'right', 'top', 'bottom'];
export const PLACEMENT_OPTIONS = ['detached', 'left', 'right', 'top', 'bottom'];
export const LINK_OPTIONS = ['fully_coupled', 'colorbar_only', 'axes_only', 'decoupled'];
export const MAX_COMPARE_PLOTS = 12;

// Why a style can't be chosen for this example, or null if it can.
export function styleUnavailable(ex, style) {
  const kind = WEB_STYLES[style];
  if (!kind) return 'needs PDEStudio: 3-D, surface and the other styles are drawn by Makie';
  if (kind === 'particles' && !ex.particles) return 'needs PDEStudio: it converts grid data to particles';
  if (kind === 'field' && ex.particles) return 'needs PDEStudio: it interpolates particles onto a grid';
  if (kind === 'field' && ex.dims.length < 2) return 'needs two dimensions';
  return null;
}

export function defaultState(ex) {
  const style = ex.particles ? 'particles_2d' : ex.spaceDims.length >= 2 ? 'heatmap_flat' : 'lines_1d';
  const state = {
    layout: { style, width: 500, height: 400, legend: 'right', placement: 'detached', compare: 'none', columns: 2, link: 'fully_coupled' },
    plot: { x: 'none', y: 'none', z: 'none', u: 'Solution', component: 1, anim: ex.time_dim },
    methods: [...ex.config.defaults],
    sliders: {},
    labels: { methods: {}, variables: {}, components: {}, title: '', xlabel: '', ylabel: '', ulabel: '' },
    look: { fontSize: 13, lineWidth: 2, grid: true },
  };
  fixPlot(ex, state);
  return state;
}

// --- Axes and fields ---------------------------------------------------------------------------------------------

const kindOf = (state) => WEB_STYLES[state.layout.style];

// Independent axes of the X-Axis menu; for 2-D styles the Y-Axis gets the rest.
export function xAxisOptions(ex, state) {
  const kind = kindOf(state);
  if (kind === 'particles') return ['x'];
  const sweep = ex.sweepValues.length > 1 ? [ex.sweepKey] : [];
  if (ex.particles) return [ex.time_dim, ...sweep];
  if (kind === 'field') return [...ex.dims];
  return [...ex.dims, ...sweep];
}

export function yAxisOptions(ex, state) {
  const kind = kindOf(state);
  if (kind === 'particles') return ['y'];
  if (kind === 'field') return ex.dims.filter((d) => d !== state.plot.x);
  return ['none'];
}

// The fields of the U-Axis menu: the solution, and the statistics that fit the axes.
export function uAxisOptions(ex, state) {
  const kind = kindOf(state);
  if (kind !== 'line') return ['Solution'];
  const { x } = state.plot;
  const timeStats = ex.statNames.filter((s) => ex.statDims(s).length === 1 && ex.statDims(s)[0] === ex.time_dim);
  const scalarStats = ex.statNames.filter((s) => ex.statDims(s).length === 0);
  const solution = ex.particles ? [] : ['Solution'];
  if (x === ex.sweepKey) return [...solution, ...timeStats, ...scalarStats];
  if (x === ex.time_dim) return [...solution, ...timeStats];
  return solution;
}

export function compareOptions(ex) {
  const out = ['none', 'methods', 'component'];
  if (ex.time_dim) out.push('time');
  if (ex.sweepValues.length > 1) out.push(ex.sweepKey);
  return out;
}

export function animOptions(ex, state) {
  return ['none', ...sliderDefs(ex, state).map((s) => s.key)];
}

// The Anim Target in effect: the chosen one, or the time while the chosen one has no slider (PDEStudio's fallback).
export function animTarget(ex, state) {
  const options = animOptions(ex, state);
  if (options.includes(state.plot.anim)) return state.plot.anim;
  return options.includes(ex.time_dim) ? ex.time_dim : 'none';
}

// Keeps the plot options valid after a change (PDEStudio's auto-correction).
export function fixPlot(ex, state) {
  const p = state.plot;
  const xs = xAxisOptions(ex, state);
  if (!xs.includes(p.x)) p.x = xs[0];
  const ys = yAxisOptions(ex, state);
  if (!ys.includes(p.y)) p.y = kindOf(state) === 'field' ? ys.find((d) => d !== ex.time_dim) ?? ys[0] : ys[0];
  const us = uAxisOptions(ex, state);
  if (!us.includes(p.u)) p.u = us[0];
  if (!compareOptions(ex).includes(state.layout.compare)) state.layout.compare = 'none';
  return state;
}

// --- Sliders -----------------------------------------------------------------------------------------------------

// The sliders with a choice to make: the swept parameter and the dimensions that are neither on an axis, compared,
// nor irrelevant for the field.
export function sliderDefs(ex, state) {
  const { x, y, u } = state.plot;
  const compare = state.layout.compare;
  const kind = kindOf(state);
  const defs = [];
  if (ex.sweepValues.length > 1 && x !== ex.sweepKey && compare !== ex.sweepKey) {
    defs.push({ key: ex.sweepKey, values: ex.sweepValues, integer: integerSweep(ex) });
  }
  const statDims = u === 'Solution' ? null : ex.statDims(u);
  const s = sweepIndex(ex, state);
  for (const d of ex.dims) {
    if (d === x || d === y) continue;
    if (d === ex.time_dim && compare === 'time') continue;
    if (statDims && !(d === ex.time_dim && statDims.includes(d))) continue;
    if (kind === 'particles' && d !== ex.time_dim) continue;
    if (ex.particles && d !== ex.time_dim) continue;
    const values = ex.particles ? particleTimes(ex, state, s) : ex.axis(d);
    defs.push({ key: d, values });
  }
  return defs;
}

const firstComputed = (ex, state) => state.methods.find((m) => ex.runs[m]) ?? ex.computed[0];

function particleTimes(ex, state, s) {
  return ex.particleRun(firstComputed(ex, state), s).t;
}

export function sliderIndex(ex, state, key, values) {
  const stored = state.sliders[key];
  if (stored === undefined) return 0;
  return Math.min(Math.max(0, stored), values.length - 1);
}

export function sweepIndex(ex, state) {
  return Math.min(state.sliders[ex.sweepKey] ?? 0, ex.sweepValues.length - 1);
}

// --- Labels ------------------------------------------------------------------------------------------------------

// Values as the studio shows them: integer sweeps (like a grid size) as integers, everything else with three
// decimals (the dimensions are floating point numbers, even where JSON wrote 0.0 as 0).
export const formatValue = (v, integer = false) =>
  typeof v !== 'number' ? String(v) : integer ? String(v) : v.toFixed(3);

export const integerSweep = (ex) => ex.sweepValues.every((v) => Number.isInteger(v));

export function variableLabel(state, name) {
  return frontendKey(name, state.labels.variables);
}

export function methodLabel(state, name) {
  if (state.labels.methods[name]) return state.labels.methods[name];
  return isReferenceMethod(name) ? frontendKey(name) : name;
}

export function fieldLabel(state, u) {
  if (state.labels.ulabel) return state.labels.ulabel;
  return u === 'Solution' ? 'Solution' : frontendKey(u, state.labels.variables);
}

// The title of the plot window: every swept parameter and dimension, with [Axis] or [Compare] for those that are
// shown otherwise.
export function plotTitle(ex, state) {
  if (state.labels.title) return state.labels.title;
  const { x, y } = state.plot;
  const compare = state.layout.compare;
  const sliders = new Map(sliderDefs(ex, state).map((d) => [d.key, d]));
  const parts = [];
  const describe = (key) => {
    if (key === x || key === y) return '[Axis]';
    if (key === compare || (key === ex.time_dim && compare === 'time')) return '[Compare]';
    const def = sliders.get(key);
    if (!def) return null;
    return formatValue(def.values[sliderIndex(ex, state, key, def.values)], def.integer);
  };
  for (const key of [ex.sweepKey, ...ex.dims]) {
    if (key === ex.sweepKey && ex.sweepValues.length <= 1) continue;
    const text = describe(key);
    if (text !== null) parts.push(`${variableLabel(state, key)} = ${text}`);
  }
  return parts.join(' | ');
}

// --- What to draw ------------------------------------------------------------------------------------------------

// The slider positions as axis indices ({ x, y, t } for grids), and the swept value index.
function positions(ex, state) {
  const idx = {};
  for (const def of sliderDefs(ex, state)) idx[def.key] = sliderIndex(ex, state, def.key, def.values);
  return idx;
}

// The panels of the plot area: one, or one per compared value (at most 12, evenly spaced, first and last included).
export function panels(ex, state) {
  const compare = state.layout.compare;
  const base = positions(ex, state);
  const methods = state.methods.filter((m) => ex.runs[m]);
  const pick = (n) => {
    if (n <= MAX_COMPARE_PLOTS) return [...Array(n).keys()];
    return [...new Set(Array.from({ length: MAX_COMPARE_PLOTS }, (_, i) => Math.round((i * (n - 1)) / (MAX_COMPARE_PLOTS - 1))))];
  };
  if (compare === 'methods') {
    return methods.map((m) => ({ subtitle: methodLabel(state, m), methods: [m], idx: base }));
  }
  if (compare === 'time' && ex.time_dim) {
    const times = ex.particles ? particleTimes(ex, state, sweepIndex(ex, state)) : ex.axis(ex.time_dim);
    return pick(times.length).map((i) => ({
      subtitle: `${variableLabel(state, ex.time_dim)} = ${formatValue(times[i])}`,
      methods,
      idx: { ...base, [ex.time_dim]: i },
    }));
  }
  if (compare === ex.sweepKey) {
    return pick(ex.sweepValues.length).map((i) => ({
      subtitle: `${variableLabel(state, ex.sweepKey)} = ${formatValue(ex.sweepValues[i], integerSweep(ex))}`,
      methods,
      idx: { ...base, [ex.sweepKey]: i },
    }));
  }
  return [{ subtitle: '', methods, idx: base }];
}

// One curve of a line plot: x and y values for a method at the panel's slider positions.
export function lineData(ex, state, method, idx) {
  const { x, u } = state.plot;
  const s = idx[ex.sweepKey] ?? 0;
  const t = ex.time_dim;
  if (x === ex.sweepKey) {
    const xs = ex.sweepValues.map((v, i) => (typeof v === 'number' ? v : i));
    const ys = ex.sweepValues.map((_, k) => pointValue(ex, state, method, k, idx));
    return { xs, ys };
  }
  if (u === 'Solution') {
    const values = ex.solution(method, s);
    const axis = ex.axis(x);
    const ys = new Float32Array(axis.length);
    for (let i = 0; i < axis.length; i++) ys[i] = values[ex.index({ ...idx, [x]: i })];
    return { xs: axis, ys };
  }
  // A statistic over time.
  const series = ex.stat(method, s, u) ?? [];
  const xs = ex.particles ? ex.particleRun(method, s).t : ex.axis(t);
  return { xs, ys: series.map((v) => (v === null ? NaN : v)) };
}

// One value for the swept-parameter axis: the solution or a statistic at the slider positions of run k.
function pointValue(ex, state, method, k, idx) {
  const { u } = state.plot;
  const run = ex.run(method, k);
  if (!run) return NaN;
  if (u === 'Solution') return ex.solution(method, k)[ex.index(idx)];
  const stat = run.stats[u];
  if (stat === undefined || stat === null) return NaN;
  if (!Array.isArray(stat)) return stat;
  const times = ex.particles ? ex.particleRun(method, k).t : ex.axis(ex.time_dim);
  const own = ex.particles ? particleTimes(ex, state, sweepIndex(ex, state)) : times;
  const i = nearestIndex(times, own[idx[ex.time_dim] ?? 0]);
  return stat[i] ?? NaN;
}

// A field on two axes: values[i + nx * j] for xs[i], ys[j].
export function fieldData(ex, state, method, idx) {
  const { x, y } = state.plot;
  const s = idx[ex.sweepKey] ?? 0;
  const values = ex.solution(method, s);
  const xs = ex.axis(x);
  const ys = ex.axis(y);
  const out = new Float32Array(xs.length * ys.length);
  for (let j = 0; j < ys.length; j++) {
    for (let i = 0; i < xs.length; i++) out[i + xs.length * j] = values[ex.index({ ...idx, [x]: i, [y]: j })];
  }
  return { xs, ys, values: out };
}

// The particles of a run at the time of the slider (the nearest recorded time of that run).
export function particleData(ex, state, method, idx) {
  const s = idx[ex.sweepKey] ?? 0;
  const run = ex.particleRun(method, s);
  const own = particleTimes(ex, state, s);
  const f = nearestIndex(run.t, own[idx[ex.time_dim] ?? 0]);
  const n = run.count;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const u = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    px[j] = run.positions[2 * (j + n * f)];
    py[j] = run.positions[2 * (j + n * f) + 1];
    u[j] = run.u[j + n * f];
  }
  return { px, py, u };
}
