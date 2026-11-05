import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModel } from '../public/js/kinetic-traffic.js';

// A direct transcription of the MATLAB functions, with the matrices assembled as in
// A_bar_two_classes.m and Ac_block.m, to check the matrix-free products in the model.
function referenceStep(f1, f2, { m, n, dx, eps, maxSpeed, maxDensity, relaxTime }) {
  const v = Array.from({ length: m }, (_, i) => i / (m - 1));
  const cell = (f, j) => f.slice(j * m, (j + 1) * m);
  const sum = (a) => a.reduce((s, y) => s + y, 0);
  const dot = (a, b) => a.reduce((s, y, i) => s + y * b[i], 0);

  function acBlock(fc, r) {
    const ac = Array.from({ length: m }, () => new Array(m).fill(0));
    if (r < 1) {
      const denom = Math.max(1 - r, 1e-12);
      for (let i = 0; i < m; i++) {
        let cte = 0;
        for (let l = i + 1; l < m; l++) cte += (v[l] - v[i]) * fc[l];
        ac[i][i] = -cte / denom;
        for (let k = 0; k < i; k++) ac[i][k] = ((v[i] - v[k]) * fc[i]) / denom;
      }
    }
    return ac;
  }
  function aBar(u) {
    const a = Array.from({ length: 2 * m }, () => new Array(2 * m).fill(0));
    const r = sum(u.slice(m));
    const ac1 = acBlock(u.slice(0, m), r);
    const ac2 = acBlock(u.slice(m), r);
    for (let i = 0; i < m; i++) {
      a[i][i] += v[i];
      a[m + i][m + i] += v[i];
      for (let k = 0; k < m; k++) {
        a[i][m + k] += ac1[i][k];
        a[m + i][m + k] += ac2[i][k];
      }
    }
    return a;
  }
  const U = Array.from({ length: n }, (_, j) => [...cell(f1, j), ...cell(f2, j)]);

  const rho = U.map((u) => [sum(u.slice(0, m)), sum(u.slice(m))]);
  const q = U.map((u) => [dot(v, u.slice(0, m)), dot(v, u.slice(m))]);
  let speed = 1;
  for (let j = 0; j < n; j++) {
    // MATLAB's max skips the NaN of 0/0 in jammed cells.
    for (const c of [0, 1]) speed = Math.max(speed, Math.abs(-q[j][c] / (1 - rho[j][c])) || 0);
  }
  const dt = (0.5 * 0.9 * dx) / speed;
  const lmbd = dt / dx;

  const jumps = U.map((uL, j) => {
    const uR = U[(j + 1) % n];
    let uLe = uL;
    let uRe = uR;
    if (sum(uL.slice(m)) >= 1 - 1e-12) uLe = uL.map((y, i) => y + 1e-8 * (uR[i] - y));
    if (sum(uR.slice(m)) >= 1 - 1e-12) uRe = uR.map((y, i) => y - 1e-8 * (y - uL[i]));
    const mid = uL.map((y, i) => 0.5 * (y + uR[i]));
    const [a1, am, a2] = [aBar(uLe), aBar(mid), aBar(uRe)];
    const d = uR.map((y, i) => y - uL[i]);
    return a1.map((row, i) => dot(row.map((y, k) => (y + 4 * am[i][k] + a2[i][k]) / 6), d));
  });
  let out = U.map((_, j) => {
    const w = (j + n - 1) % n;
    const e = (j + 1) % n;
    return U[j].map((_, i) => 0.5 * (U[w][i] + U[e][i]) - 0.5 * lmbd * (jumps[w][i] + jumps[j][i]));
  });
  out = out.map((u) => {
    const g1 = u.slice(0, m).map((y) => Math.max(0, y));
    const g2 = u.slice(m).map((y, i) => Math.max(g1[i], y));
    return [...g1, ...g2];
  });

  // relaxation_two_class.m with feq.m
  out = out.map((u) => {
    const g1 = u.slice(0, m);
    const g2 = u.slice(m).map((y, i) => Math.max(0, y - g1[i]));
    const r1 = sum(g1);
    const r = sum(u.slice(m));
    const r2 = r - r1;
    const feq = (V, R, rc) => {
      const f = new Array(m).fill(0);
      f[m - 1] = V * rc * Math.max(0, 1 - r / R);
      f[0] = rc - f[m - 1];
      return f;
    };
    const e1 = feq(maxSpeed[0], maxDensity[0], r1);
    const e2 = feq(maxSpeed[1], maxDensity[1], r2);
    const [t1, t2] = [eps * relaxTime[0], eps * relaxTime[1]];
    const h1 = g1.map((y, i) => (t1 * y + dt * e1[i]) / (t1 + dt));
    const h2 = g2.map((y, i) => (t2 * y + dt * e2[i]) / (t2 + dt));
    return [...h1, ...h1.map((y, i) => y + h2[i])];
  });

  // density_conservation.m
  out = out.map((u, j) => {
    const w = (j + n - 1) % n;
    const e = (j + 1) % n;
    const t = [0, 1].map((c) => 0.5 * (rho[w][c] + rho[e][c]) - (lmbd / 2) * (q[e][c] - q[w][c]));
    const g1 = u.slice(0, m).map((y) => Math.max(0, y));
    const g2 = u.slice(m).map((y, i) => Math.max(g1[i], y));
    const s1 = t[0] / Math.max(sum(g1), 1e-12);
    const s2 = t[1] / Math.max(sum(g2), 1e-12);
    return [...g1.map((y) => y * s1), ...g2.map((y) => y * s2)];
  });
  return {
    f1: Float64Array.from(out.flatMap((u) => u.slice(0, m))),
    f2: Float64Array.from(out.flatMap((u) => u.slice(m))),
  };
}

const total = (a, dx) => a.reduce((s, y) => s + y, 0) * dx;

test('kinetic model matches the matrix form of the MATLAB scheme', () => {
  const options = { cells: 24, speeds: 3, eps: 0.5, maxSpeed: [0.6, 1], maxDensity: [1, 0.6], relaxTime: [1, 1] };
  const model = createModel(options);
  model.setDensities((x) => [0.25 + 0.1 * Math.sin(2 * Math.PI * x), 0.3]);
  // Two jammed cells (r = 1, all standing), for the shifted path endpoints.
  const { f1, f2 } = model.state();
  for (const j of [11, 12]) {
    f1.fill(0, j * 4, j * 4 + 4);
    f2.fill(0, j * 4, j * 4 + 4);
    f1[j * 4] = 0.3;
    f2[j * 4] = 1;
  }
  const settings = { ...options, m: 4, n: 24, dx: model.dx };
  for (let k = 0; k < 5; k++) {
    const { f1, f2 } = model.state();
    const expected = referenceStep(f1, f2, settings);
    model.step();
    const actual = model.state();
    for (let i = 0; i < expected.f1.length; i++) {
      assert.ok(Math.abs(actual.f1[i] - expected.f1[i]) < 1e-12, `f1[${i}] after step ${k + 1}`);
      assert.ok(Math.abs(actual.f2[i] - expected.f2[i]) < 1e-12, `f2[${i}] after step ${k + 1}`);
    }
  }
});

test('kinetic model conserves the mass of each class', () => {
  const model = createModel({ cells: 200, speeds: 4, eps: 1 });
  model.setDensities((x) => [0.3 + 0.1 * Math.sin(6 * Math.PI * x), 0.4 + 0.15 * Math.sin(6 * Math.PI * x)]);
  const before = model.read();
  for (let k = 0; k < 300; k++) model.step();
  const after = model.read();
  assert.ok(Math.abs(total(after.rho1, model.dx) - total(before.rho1, model.dx)) < 1e-12);
  assert.ok(Math.abs(total(after.rho2, model.dx) - total(before.rho2, model.dx)) < 1e-12);
});

test('kinetic model reproduces the Riemann problem of test case 1 in the paper', () => {
  // Two speeds, no relaxation, on a ring long enough that the second jump stays away until t = 0.3.
  const shift = 1.5;
  const model = createModel({ cells: 1600, speeds: 1, length: 4, eps: 0 });
  model.setDensities((x) => (x - shift < 0.5 ? [0.4, 0.2] : [0.2, 0.6]));
  while (model.time < 0.3 - 1e-12) model.step(0.3 - model.time);
  const { rho1, rho2 } = model.read();
  const r = (x) => {
    const j = Math.floor((x + shift) / model.dx);
    return rho1[j] + rho2[j];
  };
  // The waves move at -0.75 and 1 (paper, section 6.2). The middle state follows from the
  // conservative variables N0 = 1 - r and N1 = (1 - r) / (1 - f0) of the 2-velocity model.
  const n1 = (rr) => (1 - rr) / (1 - rr / 2);
  const middle = 1 - (n1(0.6) * (1 - 0.8)) / n1(0.8);
  assert.ok(Math.abs(r(0.05) - 0.6) < 1e-3);
  assert.ok(Math.abs(r(0.5) - middle) < 1e-3);
  assert.ok(Math.abs(r(1.0) - 0.8) < 1e-3);
  assert.ok(Math.abs(r(0.275) - (0.6 + middle) / 2) < 0.01);
  assert.ok(Math.abs(r(0.8) - (middle + 0.8) / 2) < 0.01);
});
