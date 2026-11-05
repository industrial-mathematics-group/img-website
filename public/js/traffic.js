// Front-page demo: a follow-the-leader traffic model on a ring road.
// Each car drives at speed v = 1 - rho, where rho = carLength / gap to the car ahead.
// The stepped curve is that local density, so more cars give a smoother curve.
// The mathematics is explained in src/content/news/traffic-demo.md.
(function () {
  const root = document.querySelector('[data-traffic]');
  if (!root) return;

  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const playButton = root.querySelector('[data-play]');
  const redButton = root.querySelector('[data-red]');
  const slider = root.querySelector('[data-cars]');
  const carsOutput = root.querySelector('[data-cars-output]');

  const CAR_COUNTS = [20, 50, 100, 200, 500, 1000];
  const MEAN_DENSITY = 0.35;
  const SIM_SPEED = 0.07; // model time per second of real time
  const CYCLE = 22; // seconds between red phases
  const RED_TIME = 6; // seconds the light stays red

  let n = 0;
  let carLength = 0;
  let x = new Float64Array(0);
  let v = new Float64Array(0);
  let clock = 0;
  let lightX = 0.72;
  let backlog = 0;
  let playing = false;
  let visible = true;
  let lastFrame = 0;
  let colors = {};

  const isRed = () => clock % CYCLE < RED_TIME;
  const gapAt = (i) => (x[(i + 1) % n] - x[i] + 1) % 1 || 1;

  function setCars(count) {
    const old = x;
    const oldN = n;
    const next = new Float64Array(count);
    for (let j = 0; j < count; j++) {
      if (!oldN) {
        next[j] = j / count;
        continue;
      }
      // Resample along the existing cars, so the current jam survives the change.
      const t = (j * oldN) / count;
      const i = Math.floor(t);
      const gap = (old[(i + 1) % oldN] - old[i] + 1) % 1 || 1;
      next[j] = (old[i] + (t - i) * gap) % 1;
    }
    n = count;
    x = next;
    v = new Float64Array(count);
    carLength = MEAN_DENSITY / count;
  }

  function step(dt) {
    const red = isRed();
    for (let i = 0; i < n; i++) {
      let headway = gapAt(i);
      if (red) {
        const toLight = (lightX - x[i] + 1) % 1;
        if (toLight < headway) headway = toLight;
      }
      v[i] = Math.max(0, 1 - carLength / Math.max(headway, carLength));
    }
    for (let i = 0; i < n; i++) x[i] = (x[i] + v[i] * dt) % 1;
  }

  function advance(seconds) {
    const dt = Math.min(0.5 * carLength, 0.002);
    backlog += seconds * SIM_SPEED;
    const startClock = clock;
    const totalSteps = Math.floor(backlog / dt);
    for (let k = 0; k < totalSteps; k++) {
      clock = startClock + ((k + 1) / totalSteps) * seconds;
      step(dt);
    }
    if (totalSteps === 0) clock += seconds;
    backlog -= totalSteps * dt;
  }

  function readColors() {
    const css = getComputedStyle(root);
    const get = (name) => css.getPropertyValue(name).trim();
    colors = { ink: get('--ink'), muted: get('--muted'), free: get('--blue-rgb'), jam: get('--red-rgb') };
  }

  function densityColor(rho, alpha) {
    const a = colors.free.split(',').map(Number);
    const b = colors.jam.split(',').map(Number);
    const t = Math.min(1, Math.max(0, (rho - MEAN_DENSITY) / (0.9 - MEAN_DENSITY)));
    const mix = a.map((c, i) => Math.round(c + (b[i] - c) * t));
    return `rgba(${mix[0]},${mix[1]},${mix[2]},${alpha})`;
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
    const yOf = (rho) => baseline - rho * (baseline - top);

    // The jam-density reference line.
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(w, top + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.muted;
    ctx.font = '13px "Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('bumper to bumper', 12, top - 8);

    // The density as steps between cars.
    let first = 0;
    for (let i = 1; i < n; i++) if (x[i] < x[first]) first = i;
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const i = (first + k) % n;
      const gap = gapAt(i);
      const rho = Math.min(1, carLength / gap);
      const y = yOf(rho);
      const x0 = x[i] * w;
      const x1 = Math.min(x[i] + gap, 1) * w;
      ctx.fillStyle = densityColor(rho, 0.28);
      // Whole pixels, because overlapping translucent steps would show up as stripes.
      ctx.fillRect(Math.round(x0), y, Math.round(x1) - Math.round(x0), baseline - y);
      if (k === 0) ctx.moveTo(x0, y);
      else ctx.lineTo(x0, y);
      ctx.lineTo(x1, y);
      if (x[i] + gap > 1) {
        // This step wraps around the end of the road.
        const x2 = (x[i] + gap - 1) * w;
        ctx.fillRect(0, y, Math.round(x2), baseline - y);
        ctx.moveTo(0, y);
        ctx.lineTo(x2, y);
      }
    }
    ctx.stroke();

    // The cars, spread across the road so that large numbers still read as a cloud.
    const roadTop = baseline + 14;
    const roadHeight = h - roadTop - 12;
    const radius = n <= 50 ? 4.5 : n <= 200 ? 3 : n <= 500 ? 2 : 1.5;
    for (let i = 0; i < n; i++) {
      const lane = ((i * 0.618034) % 1) * (n <= 50 ? 0 : 1);
      const y = n <= 50 ? roadTop + roadHeight / 2 : roadTop + radius + lane * (roadHeight - 2 * radius);
      ctx.fillStyle = densityColor(carLength / gapAt(i), 1);
      ctx.beginPath();
      ctx.arc(x[i] * w, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // The traffic light.
    const red = isRed();
    const lx = Math.round(lightX * w) + 0.5;
    ctx.strokeStyle = red ? densityColor(1, 1) : colors.muted;
    ctx.lineWidth = red ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(lx, top);
    ctx.lineTo(lx, h - 6);
    ctx.stroke();
    ctx.fillStyle = red ? densityColor(1, 1) : colors.muted;
    const label = red ? 'red light' : 'green light';
    const labelWidth = ctx.measureText(label).width;
    ctx.fillText(label, lx + labelWidth + 16 > w ? lx - labelWidth - 8 : lx + 8, top + 18);
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

  function turnRed(position) {
    if (position !== undefined) lightX = position;
    clock = 0;
    draw();
  }

  canvas.addEventListener('click', (event) => {
    const box = canvas.getBoundingClientRect();
    turnRed((event.clientX - box.left) / box.width);
  });
  redButton.addEventListener('click', () => turnRed());
  playButton.addEventListener('click', () => setPlaying(!playing));
  slider.addEventListener('input', () => {
    setCars(CAR_COUNTS[Number(slider.value)]);
    carsOutput.textContent = String(n);
    draw();
  });

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

  // Start with a queue already formed, so the first view shows a jam without any motion.
  canvas.hidden = false;
  readColors();
  setCars(CAR_COUNTS[Number(slider.value)]);
  carsOutput.textContent = String(n);
  advance(RED_TIME - 0.5);
  root.querySelector('[data-controls]').hidden = false;
  draw();
  // The queue keeps its shape while the fonts load, but the canvas label needs a redraw.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
})();
