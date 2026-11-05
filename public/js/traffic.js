// Front-page demo: the two-class kinetic traffic model of Mezquita-Nieto, Goatin and Klar on a
// ring road. The model is in kinetic-traffic.js; this file draws it and handles the controls.
// The curves are the class densities, stacked. The dots are drawn on top of the model, one row
// per class: they move with the mean speed of their class, so their spacing follows the density.
// The mathematics is explained in src/content/news/traffic-demo.md.
import { createModel } from './kinetic-traffic.js';

const DENSITIES = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
const SHARE_1 = 0.6; // share of class 1 in the total density, as in test case 3 of the paper
const SIM_SPEED = 0.3; // model time per second of real time
const DOTS = 400; // dots per unit of total density
const BRAKE_WIDTH = 0.04;
const BRAKE_TIME = 0.3; // model time for which braking drivers stay at speed 0
const STOP_DENSITY = 0.6; // class 2 stops above this total density

function main() {
  const root = document.querySelector('[data-traffic]');
  if (!root) return;

  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const playButton = root.querySelector('[data-play]');
  const brakeButton = root.querySelector('[data-brake]');
  const slider = root.querySelector('[data-density]');
  const densityOutput = root.querySelector('[data-density-output]');

  // M = 1: each vehicle stands or drives at speed 1. epsilon = 0.01 as in figure 6.6 of the paper.
  const model = createModel({ cells: 800, speeds: 1, eps: 0.01, maxSpeed: [0.6, 1], maxDensity: [1, 0.6] });
  const { rho1, r, q1, q2 } = model.fields;
  const n = model.cells;

  let dots = [new Float64Array(0), new Float64Array(0)];
  let brakeFrom = 0;
  let brakeUntil = -1;
  let backlog = 0;
  let playing = false;
  let visible = true;
  let lastFrame = 0;
  let colors = {};

  // Small perturbations of a constant state, as in test case 3 of the paper.
  function reset(total) {
    const wave = (x) => 1 + 0.2 * Math.sin(6 * Math.PI * x);
    model.setDensities((x) => [SHARE_1 * total * wave(x), (1 - SHARE_1) * total * wave(x)]);
    brakeUntil = -1;
    model.read();
    dots = [placeDots(rho1, null), placeDots(r, rho1)];
  }

  // Dots spread evenly over the mass of one class, so that their spacing shows the density.
  function placeDots(upper, lower) {
    const density = (j) => upper[j] - (lower ? lower[j] : 0);
    let mass = 0;
    for (let j = 0; j < n; j++) mass += density(j) / n;
    const count = Math.round(mass * DOTS);
    const out = new Float64Array(count);
    let j = 0;
    let below = 0;
    for (let k = 0; k < count; k++) {
      const goal = ((k + 0.5) / count) * mass;
      while (j < n - 1 && below + density(j) / n < goal) below += density(j++) / n;
      out[k] = (j + (goal - below) / Math.max(density(j) / n, 1e-12)) / n;
    }
    return out;
  }

  // The speed of the mass of each class at the cell faces during a step of length dt: the
  // Lax-Friedrichs density flux of the scheme divided by the density at the face. Moving the dots
  // with it, rather than with q/rho, keeps them in step with the numerical diffusion.
  const faceSpeed = [new Float64Array(n), new Float64Array(n)];
  function setFaceSpeeds(dt) {
    const diffusion = model.dx / (2 * dt);
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      for (let cls = 0; cls < 2; cls++) {
        const rhoA = cls === 0 ? rho1[j] : r[j] - rho1[j];
        const rhoB = cls === 0 ? rho1[k] : r[k] - rho1[k];
        const qA = cls === 0 ? q1[j] : q2[j] - q1[j];
        const qB = cls === 0 ? q1[k] : q2[k] - q1[k];
        const flux = 0.5 * (qA + qB) - diffusion * (rhoB - rhoA);
        const rho = 0.5 * (rhoA + rhoB);
        faceSpeed[cls][j] = rho > 1e-9 ? flux / rho : 0;
      }
    }
  }

  // The face speed of a class at x, interpolated between faces.
  function speedAt(cls, x) {
    const s = x * n - 1;
    const j = Math.floor(s);
    const t = s - j;
    return (1 - t) * faceSpeed[cls][(j + n) % n] + t * faceSpeed[cls][(j + 1) % n];
  }

  function advance(seconds) {
    backlog += seconds * SIM_SPEED;
    while (backlog > 0) {
      const dt = model.step(backlog);
      // model.fields still hold the state at the start of the step.
      setFaceSpeeds(dt);
      for (let cls = 0; cls < 2; cls++) {
        const x = dots[cls];
        for (let k = 0; k < x.length; k++) x[k] = (x[k] + speedAt(cls, x[k]) * dt + 1) % 1;
      }
      if (braking()) model.brake(brakeFrom, (brakeFrom + BRAKE_WIDTH) % 1);
      backlog -= dt;
    }
    model.read();
  }

  function readColors() {
    const css = getComputedStyle(root);
    const get = (name) => css.getPropertyValue(name).trim();
    colors = {
      ink: get('--ink'),
      muted: get('--muted'),
      surface: get('--surface'),
      class1: get('--red-rgb'),
      class2: get('--blue-rgb'),
    };
  }

  const rgba = (rgb, alpha) => `rgba(${rgb},${alpha})`;
  const braking = () => model.time < brakeUntil;

  // Text with a halo in the background colour, so it stays readable over the curves.
  function label(text, x, y, color) {
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colors.surface;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function draw() {
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const top = 26;
    const baseline = Math.round(h * 0.68);
    const yOf = (rho) => baseline - Math.min(1, rho) * (baseline - top);
    const xOf = (j) => ((j + 0.5) / n) * w;
    ctx.font = '13px "Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif';

    // Reference lines for the jam density and for the density at which class 2 stops.
    const references = [
      [1, 'bumper to bumper'],
      [STOP_DENSITY, 'class 2 stops'],
    ];
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    for (const [rho] of references) {
      const y = Math.round(yOf(rho)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // The densities, stacked: class 1 at the bottom, class 2 on top of it.
    const band = (lower, upper, fill) => {
      ctx.beginPath();
      ctx.moveTo(0, yOf(upper(0)));
      for (let j = 0; j < n; j++) ctx.lineTo(xOf(j), yOf(upper(j)));
      ctx.lineTo(w, yOf(upper(0)));
      ctx.lineTo(w, yOf(lower(0)));
      for (let j = n - 1; j >= 0; j--) ctx.lineTo(xOf(j), yOf(lower(j)));
      ctx.lineTo(0, yOf(lower(0)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    band(() => 0, (j) => rho1[j], rgba(colors.class1, 0.3));
    band((j) => rho1[j], (j) => r[j], rgba(colors.class2, 0.3));
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, yOf(r[0]));
    for (let j = 0; j < n; j++) ctx.lineTo(xOf(j), yOf(r[j]));
    ctx.lineTo(w, yOf(r[0]));
    ctx.stroke();
    for (const [rho, text] of references) label(text, 12, Math.round(yOf(rho)) - 8, colors.muted);

    // A legend in the top right corner.
    let lx = w - 12;
    for (const [text, rgb] of [
      ['class 2', colors.class2],
      ['class 1', colors.class1],
    ]) {
      lx -= ctx.measureText(text).width;
      ctx.fillStyle = colors.ink;
      ctx.fillText(text, lx, top - 8);
      lx -= 14;
      ctx.fillStyle = rgba(rgb, 1);
      ctx.fillRect(lx, top - 17, 9, 9);
      lx -= 18;
    }

    // The dots, one row per class.
    const roadTop = baseline + 12;
    const roadHeight = h - roadTop - 10;
    for (let cls = 0; cls < 2; cls++) {
      ctx.fillStyle = rgba(cls === 0 ? colors.class1 : colors.class2, 1);
      const y = roadTop + roadHeight * (cls === 0 ? 0.7 : 0.3);
      const x = dots[cls];
      for (let k = 0; k < x.length; k++) {
        ctx.beginPath();
        ctx.arc(x[k] * w, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Where drivers are braking.
    if (braking()) {
      const x0 = brakeFrom * w;
      const width = BRAKE_WIDTH * w;
      ctx.fillStyle = rgba(colors.class1, 0.18);
      ctx.fillRect(x0, top, Math.min(width, w - x0), h - top - 6);
      if (x0 + width > w) ctx.fillRect(0, top, x0 + width - w, h - top - 6);
      const labelWidth = ctx.measureText('braking').width;
      label('braking', x0 + width + labelWidth + 16 > w ? x0 - labelWidth - 8 : x0 + width + 8, top + 18, colors.ink);
    }
  }

  function frame(now) {
    if (!playing || !visible) {
      lastFrame = 0;
      return;
    }
    if (lastFrame) advance(Math.min((now - lastFrame) / 1000, 0.05));
    lastFrame = now;
    draw();
    requestAnimationFrame(frame);
  }

  function setPlaying(value) {
    const wasRunning = playing && visible;
    playing = value;
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(!playing));
    if (playing && visible && !wasRunning) requestAnimationFrame(frame);
  }

  // Drivers in a short stretch around position stop and stay stopped for BRAKE_TIME.
  function brake(position) {
    brakeFrom = (position - BRAKE_WIDTH / 2 + 1) % 1;
    brakeUntil = model.time + BRAKE_TIME;
    model.brake(brakeFrom, (brakeFrom + BRAKE_WIDTH) % 1);
    model.read();
    draw();
  }

  function setDensity() {
    const total = DENSITIES[Number(slider.value)];
    densityOutput.textContent = `${Math.round(total * 100)} %`;
    reset(total);
    draw();
  }

  canvas.addEventListener('click', (event) => {
    const box = canvas.getBoundingClientRect();
    brake((event.clientX - box.left) / box.width);
  });
  brakeButton.addEventListener('click', () => brake(0.72));
  playButton.addEventListener('click', () => setPlaying(!playing));
  slider.addEventListener('input', setDensity);

  new IntersectionObserver((entries) => {
    const wasVisible = visible;
    visible = entries[0].isIntersecting;
    if (visible && !wasVisible && playing) requestAnimationFrame(frame);
  }).observe(canvas);

  new ResizeObserver(draw).observe(canvas);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readColors();
    draw();
  });

  canvas.hidden = false;
  readColors();
  setDensity();
  root.querySelector('[data-controls]').hidden = false;
  draw();
  // The canvas labels need a redraw once the fonts have loaded.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

main();
