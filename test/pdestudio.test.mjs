import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { Example, frontendKey, isReferenceMethod } from '../public/js/pdestudio/data.js';
import * as L from '../public/js/pdestudio/logic.js';

const dataDir = new URL('../public/pdestudio/', import.meta.url);
const load = (name) => new Example(JSON.parse(readFileSync(new URL(`${name}.json`, dataDir), 'utf8')));
const page = readFileSync(new URL('../src/pages/explore/pdestudio.astro', import.meta.url), 'utf8');
const pageExamples = [...page.matchAll(/name: '(test_\w+)'/g)].map((m) => m[1]);

test('every example of the demo page has its data, with a run per method and swept value', () => {
  assert.equal(pageExamples.length, 6);
  assert.deepEqual(readdirSync(dataDir).filter((f) => f.endsWith('.json')).sort(), pageExamples.map((n) => `${n}.json`).sort());
  for (const name of pageExamples) {
    const ex = load(name);
    for (const m of ex.config.defaults) {
      assert.equal(ex.runs[m].length, ex.sweepValues.length, `${name}: ${m}`);
    }
  }
});

test('decoded grid data matches the exact advection solution', () => {
  const ex = load('test_advection_1d');
  const x = ex.axis('x');
  const t = ex.axis('t');
  const u = ex.solution('exact', 0);
  for (const [it, shift] of [
    [0, 0],
    [t.length - 1, t[t.length - 1]],
  ]) {
    for (let i = 0; i < x.length; i++) {
      assert.ok(Math.abs(u[ex.index({ x: i, t: it })] - Math.sin(2 * Math.PI * (x[i] - shift))) < 1e-4);
    }
  }
});

test('labels follow PDEStudio', () => {
  assert.equal(frontendKey('x'), 'Position (X)');
  assert.equal(frontendKey('cfl'), 'Cfl');
  assert.equal(frontendKey('relative_l2error'), 'Relative L2error');
  assert.equal(frontendKey('heatmap_flat'), 'Flat');
  assert.ok(isReferenceMethod('exact') && !isReferenceMethod('upwind'));
  const ex = load('test_advection_1d');
  const state = L.defaultState(ex);
  assert.equal(L.methodLabel(state, 'exact'), 'Exact');
  assert.equal(L.methodLabel(state, 'lax_friedrichs'), 'lax_friedrichs');
  assert.deepEqual(ex.allMethods, ['exact', 'lax_friedrichs', 'lax_wendroff', 'upwind']);
});

test('the plot options, sliders and title of a 1D example', () => {
  const ex = load('test_advection_1d');
  const state = L.defaultState(ex);
  assert.equal(state.layout.style, 'lines_1d');
  assert.deepEqual(L.xAxisOptions(ex, state), ['x', 't', 'cfl']);
  assert.deepEqual(L.uAxisOptions(ex, state), ['Solution']);
  assert.deepEqual(L.sliderDefs(ex, state).map((d) => d.key), ['cfl', 't']);
  assert.equal(L.plotTitle(ex, state), 'Cfl = 0.250 | Position (X) = [Axis] | Time (T) = 0.000');

  // Statistics over time: only the swept parameter is left to choose.
  state.plot.x = 't';
  L.fixPlot(ex, state);
  assert.ok(L.uAxisOptions(ex, state).includes('l2error'));
  state.plot.u = 'l2error';
  assert.deepEqual(L.sliderDefs(ex, state).map((d) => d.key), ['cfl']);
  const { xs, ys } = L.lineData(ex, state, 'upwind', { cfl: 1 });
  assert.equal(xs.length, ys.length);
  assert.equal(ys[0], 0);
  assert.ok(ys[ys.length - 1] > 0);

  // Over the swept parameter: one point per value, at the time of the slider.
  state.plot.x = 'cfl';
  L.fixPlot(ex, state);
  assert.deepEqual(L.sliderDefs(ex, state).map((d) => d.key), ['t']);
  assert.equal(L.lineData(ex, state, 'upwind', { t: 50 }).xs.length, 4);
});

test('comparisons show at most 12 plots, first and last included', () => {
  const ex = load('test_advection_1d');
  const state = L.defaultState(ex);
  state.layout.compare = 'time';
  const panels = L.panels(ex, state);
  assert.equal(panels.length, L.MAX_COMPARE_PLOTS);
  assert.equal(panels[0].idx.t, 0);
  assert.equal(panels.at(-1).idx.t, ex.axis('t').length - 1);
  assert.ok(!L.sliderDefs(ex, state).some((d) => d.key === 't'));
  state.layout.compare = 'methods';
  assert.deepEqual(L.panels(ex, state).map((p) => p.methods), [['exact'], ['upwind'], ['lax_friedrichs'], ['lax_wendroff']]);
});

test('2D examples open as a heatmap over x and y', () => {
  const ex = load('test_heat_2d');
  const state = L.defaultState(ex);
  assert.equal(state.layout.style, 'heatmap_flat');
  assert.deepEqual([state.plot.x, state.plot.y], ['x', 'y']);
  assert.deepEqual(L.sliderDefs(ex, state).map((d) => d.key), ['r', 't']);
  const field = L.fieldData(ex, state, 'adi', { r: 0, t: 0 });
  assert.equal(field.values.length, ex.axis('x').length * ex.axis('y').length);
  assert.equal(L.styleUnavailable(ex, 'heatmap_surface') !== null, true);
  assert.equal(L.styleUnavailable(ex, 'contour_f'), null);
});

test('particles keep their computed time steps per swept value', () => {
  const ex = load('test_particles_2d');
  const state = L.defaultState(ex);
  assert.equal(state.layout.style, 'particles_2d');
  const [dt, time] = L.sliderDefs(ex, state);
  assert.equal(dt.key, 'dt');
  assert.equal(time.values.length, 41);
  state.sliders.dt = 2;
  assert.equal(L.sliderDefs(ex, state)[1].values.length, 101);
  const p = L.particleData(ex, state, 'rk4', { dt: 2, t: 0 });
  assert.equal(p.px.length, 100);
  // The particles start on a grid in [-1, 1]² and carry their initial radius.
  assert.ok(Math.abs(p.px[0] + 1) < 1e-3 && Math.abs(p.py[0] + 1) < 1e-3);
  assert.ok(Math.abs(p.u[0] - Math.SQRT2) < 1e-3);
  assert.equal(L.styleUnavailable(ex, 'heatmap_flat') !== null, true);
});
