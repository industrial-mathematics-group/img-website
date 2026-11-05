// The two-class kinetic traffic model of Mezquita-Nieto, Goatin and Klar (arXiv:2608.27159),
// on a ring road. This is a port of the path-conservative scheme in the "M-velocities path
// conservative model" folder of
// github.com/industrial-mathematics-group/multi-class-kinetic-traffic-flow-model.
// File names in the comments refer to that repository.
//
// The state per cell is U = (f1, f2), each over the speeds v_i = i/M: f1 is the distribution of
// class 1 and f2 the cumulative distribution of both classes, so r = sum(f2) is the total density.
// The products A(U) dU are evaluated directly instead of assembling the matrices.
// No DOM code here, so the tests can run it in Node.

const JAM = 1e-12;
const PATH_SHIFT = 1e-8;

export function createModel({
  cells,
  speeds = 4,
  length = 1,
  eps = 1,
  maxSpeed = [0.6, 1],
  maxDensity = [1, 0.6],
  relaxTime = [1, 1],
}) {
  const m = speeds + 1;
  const n = cells;
  const size = n * m;
  const dx = length / n;
  const v = Float64Array.from({ length: m }, (_, i) => i / speeds);

  let f1 = new Float64Array(size);
  let f2 = new Float64Array(size);
  let next1 = new Float64Array(size);
  let next2 = new Float64Array(size);
  const jump1 = new Float64Array(size);
  const jump2 = new Float64Array(size);
  const rho1 = new Float64Array(n);
  const r = new Float64Array(n);
  const q1 = new Float64Array(n);
  const q2 = new Float64Array(n);
  const target1 = new Float64Array(n);
  const target2 = new Float64Array(n);

  // Work vectors for one interface.
  const a1 = new Float64Array(m);
  const a2 = new Float64Array(m);
  const b1 = new Float64Array(m);
  const b2 = new Float64Array(m);
  const d1 = new Float64Array(m);
  const d2 = new Float64Array(m);
  const out1 = new Float64Array(m);
  const out2 = new Float64Array(m);

  // The moments of the state at the start of the last step: class 1 density, total density,
  // and the flows of class 1 and of both classes.
  const fields = { rho1, r, q1, q2 };
  const model = { cells: n, speeds, m, dx, length, v, time: 0, fields };

  // out += weight * (Ac(f, r) d), with Ac from Ac_block.m:
  // (Ac d)_i = (f_i sum_{k<i} (v_i - v_k) d_k - d_i sum_{l>i} (v_l - v_i) f_l) / (1 - r).
  function addInteraction(f, total, d, out, weight) {
    if (total >= 1) return;
    const scale = weight / Math.max(1 - total, JAM);
    let s0 = 0;
    let s1 = 0;
    for (let i = m - 1; i >= 0; i--) {
      out[i] -= scale * (s1 - v[i] * s0) * d[i];
      s0 += f[i];
      s1 += v[i] * f[i];
    }
    let p0 = 0;
    let p1 = 0;
    for (let i = 0; i < m; i++) {
      out[i] += scale * f[i] * (v[i] * p0 - p1);
      p0 += d[i];
      p1 += v[i] * d[i];
    }
  }

  // out += weight * A(u) d, with A from A_bar_two_classes.m.
  function addSystem(u1, u2, weight) {
    let total = 0;
    for (let i = 0; i < m; i++) total += u2[i];
    for (let i = 0; i < m; i++) {
      out1[i] += weight * v[i] * d1[i];
      out2[i] += weight * v[i] * d2[i];
    }
    addInteraction(u1, total, d2, out1, weight);
    addInteraction(u2, total, d2, out2, weight);
  }

  // The jump A_hat (U_R - U_L) at the interface right of cell j: Simpson's rule along the
  // straight path, with endpoints at r = 1 moved slightly into the path (A_hat_Simpsons_rule.m).
  function interfaceJump(j) {
    const left = j * m;
    const right = ((j + 1) % n) * m;
    let rLeft = 0;
    let rRight = 0;
    for (let i = 0; i < m; i++) {
      d1[i] = f1[right + i] - f1[left + i];
      d2[i] = f2[right + i] - f2[left + i];
      rLeft += f2[left + i];
      rRight += f2[right + i];
      out1[i] = 0;
      out2[i] = 0;
    }
    const shiftLeft = rLeft >= 1 - JAM ? PATH_SHIFT : 0;
    const shiftRight = rRight >= 1 - JAM ? PATH_SHIFT : 0;
    for (let i = 0; i < m; i++) {
      a1[i] = f1[left + i] + shiftLeft * d1[i];
      a2[i] = f2[left + i] + shiftLeft * d2[i];
      b1[i] = f1[right + i] - shiftRight * d1[i];
      b2[i] = f2[right + i] - shiftRight * d2[i];
    }
    addSystem(a1, a2, 1 / 6);
    addSystem(b1, b2, 1 / 6);
    for (let i = 0; i < m; i++) {
      a1[i] = 0.5 * (f1[left + i] + f1[right + i]);
      a2[i] = 0.5 * (f2[left + i] + f2[right + i]);
    }
    addSystem(a1, a2, 4 / 6);
    for (let i = 0; i < m; i++) {
      jump1[left + i] = out1[i];
      jump2[left + i] = out2[i];
    }
  }

  function moments() {
    for (let j = 0; j < n; j++) {
      let s1 = 0;
      let s2 = 0;
      let m1 = 0;
      let m2 = 0;
      for (let i = 0; i < m; i++) {
        s1 += f1[j * m + i];
        s2 += f2[j * m + i];
        m1 += v[i] * f1[j * m + i];
        m2 += v[i] * f2[j * m + i];
      }
      rho1[j] = s1;
      r[j] = s2;
      q1[j] = m1;
      q2[j] = m2;
    }
  }

  // The time step from lambda_max.m and discvelo_path_conservative.m.
  function stableStep() {
    let speed = 1;
    for (let j = 0; j < n; j++) {
      speed = Math.max(speed, Math.abs(q1[j] / Math.max(1 - rho1[j], JAM)), Math.abs(q2[j] / Math.max(1 - r[j], JAM)));
    }
    return (0.45 * dx) / speed;
  }

  // Implicit relaxation towards the equilibrium of each class (relaxation_two_class.m, feq.m):
  // a share V_c (1 - r/R_c)_+ of class c drives at speed 1, the rest stands.
  function relax(dt) {
    for (let j = 0; j < n; j++) {
      const k = j * m;
      let own1 = 0;
      let total = 0;
      for (let i = 0; i < m; i++) {
        own1 += f1[k + i];
        total += f2[k + i];
      }
      const own2 = total - own1;
      const moving1 = maxSpeed[0] * own1 * Math.max(0, 1 - total / maxDensity[0]);
      const moving2 = maxSpeed[1] * own2 * Math.max(0, 1 - total / maxDensity[1]);
      const t1 = eps * relaxTime[0];
      const t2 = eps * relaxTime[1];
      for (let i = 0; i < m; i++) {
        const eq1 = i === m - 1 ? moving1 : i === 0 ? own1 - moving1 : 0;
        const eq2 = i === m - 1 ? moving2 : i === 0 ? own2 - moving2 : 0;
        const g1 = (t1 * f1[k + i] + dt * eq1) / (t1 + dt);
        const g2 = (t2 * Math.max(0, f2[k + i] - f1[k + i]) + dt * eq2) / (t2 + dt);
        f1[k + i] = g1;
        f2[k + i] = g1 + g2;
      }
    }
  }

  // One time step of discvelo_path_conservative.m with relaxation. Returns the step length.
  model.step = function step(maxDt = Infinity) {
    moments();
    const dt = Math.min(stableStep(), maxDt);
    const ratio = dt / dx;

    // The densities of a Lax-Friedrichs step, which the result is scaled to (density_conservation.m).
    for (let j = 0; j < n; j++) {
      const west = (j + n - 1) % n;
      const east = (j + 1) % n;
      target1[j] = 0.5 * (rho1[west] + rho1[east]) - 0.5 * ratio * (q1[east] - q1[west]);
      target2[j] = 0.5 * (r[west] + r[east]) - 0.5 * ratio * (q2[east] - q2[west]);
    }

    // The path-conservative Lax-Friedrichs update (path_conservative_update.m), then the
    // ordering 0 <= f1 <= f2.
    for (let j = 0; j < n; j++) interfaceJump(j);
    for (let j = 0; j < n; j++) {
      const k = j * m;
      const west = ((j + n - 1) % n) * m;
      const east = ((j + 1) % n) * m;
      for (let i = 0; i < m; i++) {
        const u1 = 0.5 * (f1[west + i] + f1[east + i]) - 0.5 * ratio * (jump1[west + i] + jump1[k + i]);
        const u2 = 0.5 * (f2[west + i] + f2[east + i]) - 0.5 * ratio * (jump2[west + i] + jump2[k + i]);
        next1[k + i] = Math.max(0, u1);
        next2[k + i] = Math.max(next1[k + i], u2);
      }
    }
    [f1, next1] = [next1, f1];
    [f2, next2] = [next2, f2];

    if (eps > 0) relax(dt);

    for (let j = 0; j < n; j++) {
      const k = j * m;
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < m; i++) {
        f1[k + i] = Math.max(0, f1[k + i]);
        f2[k + i] = Math.max(f1[k + i], f2[k + i]);
        s1 += f1[k + i];
        s2 += f2[k + i];
      }
      const scale1 = target1[j] / Math.max(s1, JAM);
      const scale2 = target2[j] / Math.max(s2, JAM);
      for (let i = 0; i < m; i++) {
        f1[k + i] *= scale1;
        f2[k + i] *= scale2;
      }
    }

    model.time += dt;
    return dt;
  };

  // Sets the class densities, spread evenly over the speeds as in initial_condition.m.
  // density(x) returns [rho1, rho2] at the cell centre x.
  model.setDensities = function setDensities(density) {
    for (let j = 0; j < n; j++) {
      const [d1, d2] = density((j + 0.5) * dx);
      for (let i = 0; i < m; i++) {
        f1[j * m + i] = d1 / m;
        f2[j * m + i] = (d1 + d2) / m;
      }
    }
    model.time = 0;
  };

  // All vehicles in the cells with centres in [from, to) stop. This keeps the density of each
  // class and only moves it to speed 0. The interval may wrap around the end of the road.
  model.brake = function brake(from, to) {
    for (let j = 0; j < n; j++) {
      const x = (j + 0.5) * dx;
      const inside = from <= to ? x >= from && x < to : x >= from || x < to;
      if (!inside) continue;
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < m; i++) {
        s1 += f1[j * m + i];
        s2 += f2[j * m + i];
        f1[j * m + i] = 0;
        f2[j * m + i] = 0;
      }
      f1[j * m] = s1;
      f2[j * m] = s2;
    }
  };

  // The class densities and flows per cell, for class 2 on its own (not cumulative).
  model.read = function read() {
    moments();
    const out = { rho1: new Float64Array(n), rho2: new Float64Array(n), q1: new Float64Array(n), q2: new Float64Array(n) };
    for (let j = 0; j < n; j++) {
      out.rho1[j] = rho1[j];
      out.rho2[j] = r[j] - rho1[j];
      out.q1[j] = q1[j];
      out.q2[j] = q2[j] - q1[j];
    }
    return out;
  };

  model.state = () => ({ f1, f2 });
  return model;
}
