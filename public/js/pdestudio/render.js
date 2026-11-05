// Canvas drawing for the PDEStudio demo: axes, lines, scatter, heatmaps, contours, particles, legends and
// colourbars. Colours come from the site's CSS variables (theme()).

const MARKERS = ['circle', 'square', 'triangle', 'diamond', 'cross'];

function parseColor(text) {
  const value = text.trim();
  if (value.startsWith('#')) {
    const hex = value.length === 4 ? [...value.slice(1)].map((c) => c + c).join('') : value.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  return value.split(',').map((v) => Number(v));
}

const css = (rgb, alpha = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

export function theme(element) {
  const style = getComputedStyle(element);
  const get = (name) => parseColor(style.getPropertyValue(name));
  const t = {
    ink: get('--ink'),
    muted: get('--muted'),
    rule: get('--rule'),
    bg: get('--bg'),
    blue: get('--blue-rgb'),
    red: get('--red-rgb'),
    green: get('--green'),
    font: style.getPropertyValue('--display').trim() || 'system-ui, sans-serif',
  };
  // Method colours in drawing order, as Makie's palette starts with black and blue.
  t.series = [t.ink, t.blue, t.green, t.red, t.muted];
  return t;
}

export const seriesColor = (t, i) => t.series[i % t.series.length];
export const seriesMarker = (i) => MARKERS[i % MARKERS.length];

// --- Scales and colour maps ----------------------------------------------------------------------------------------

export function niceTicks(lo, hi, count = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi === lo) return [lo];
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const ticks = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

export function formatTick(v, ticks) {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : Math.abs(v) || 1;
  if (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(1).replace('e', 'e');
  const digits = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
  return v.toFixed(digits).replace('-', '−');
}

// The finite range of values, padded by 5 %.
export function range(values, pad = 0.05) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const list of values) {
    for (const v of list) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (lo === Infinity) return [0, 1];
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  const d = (hi - lo) * pad;
  return [lo - d, hi + d];
}

// A diverging map (blue, background, red) when the range crosses zero, otherwise background, blue, ink.
export function colormap(t, lo, hi) {
  const diverging = lo < 0 && hi > 0;
  const stops = diverging ? [t.blue, t.bg, t.red] : [mix(t.bg, t.blue, 0.15), t.blue, t.ink];
  const at = diverging ? (v) => (v < 0 ? 0.5 * (1 - v / lo) : 0.5 + 0.5 * (v / hi)) : (v) => (v - lo) / (hi - lo || 1);
  return (v) => {
    if (!Number.isFinite(v)) return [0, 0, 0, 0];
    const s = Math.min(1, Math.max(0, at(v))) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(s));
    const c = mix(stops[i], stops[i + 1], s - i);
    return [c[0], c[1], c[2], 255];
  };
}

function mix(a, b, f) {
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f));
}

// --- Figure layout -------------------------------------------------------------------------------------------------

// Sets up a canvas of css size w × h for the device pixel ratio and returns its context.
export function prepare(canvas, w, h) {
  const ratio = window.devicePixelRatio || 1;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

const font = (t, size, weight = 400) => `${weight} ${size}px ${t.font}`;

// The axes frame with ticks, grid, labels and subtitle. Returns the data → pixel maps.
export function drawAxes(ctx, t, box, spec, look) {
  const { xlim, ylim } = spec;
  const sx = (v) => box.x + ((v - xlim[0]) / (xlim[1] - xlim[0])) * box.w;
  const sy = (v) => box.y + box.h - ((v - ylim[0]) / (ylim[1] - ylim[0])) * box.h;
  const xt = niceTicks(xlim[0], xlim[1], Math.max(2, Math.round(box.w / 90)));
  const yt = niceTicks(ylim[0], ylim[1], Math.max(2, Math.round(box.h / 60)));
  ctx.lineWidth = 1;
  if (look.grid) {
    ctx.strokeStyle = css(t.rule);
    ctx.beginPath();
    for (const v of xt) if (v >= xlim[0] && v <= xlim[1]) (ctx.moveTo(Math.round(sx(v)) + 0.5, box.y), ctx.lineTo(Math.round(sx(v)) + 0.5, box.y + box.h));
    for (const v of yt) if (v >= ylim[0] && v <= ylim[1]) (ctx.moveTo(box.x, Math.round(sy(v)) + 0.5), ctx.lineTo(box.x + box.w, Math.round(sy(v)) + 0.5));
    ctx.stroke();
  }
  ctx.fillStyle = css(t.ink);
  ctx.font = font(t, look.fontSize - 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const v of xt) if (v >= xlim[0] && v <= xlim[1]) ctx.fillText(formatTick(v, xt), sx(v), box.y + box.h + 6);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of yt) if (v >= ylim[0] && v <= ylim[1]) ctx.fillText(formatTick(v, yt), box.x - 6, sy(v));
  ctx.font = font(t, look.fontSize + 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(spec.xLabel, box.x + box.w / 2, box.y + box.h + look.fontSize * 3 + 8);
  ctx.save();
  ctx.translate(box.x - 52, box.y + box.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'bottom';
  ctx.fillText(spec.yLabel, 0, 0);
  ctx.restore();
  if (spec.subtitle) {
    ctx.font = font(t, look.fontSize + 1, 600);
    ctx.textBaseline = 'bottom';
    ctx.fillText(spec.subtitle, box.x + box.w / 2, box.y - 6);
  }
  return { sx, sy };
}

export function drawFrame(ctx, t, box) {
  ctx.strokeStyle = css(t.ink);
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w), Math.round(box.h));
}

// --- Marks ---------------------------------------------------------------------------------------------------------

function marker(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else if (shape === 'triangle') (ctx.moveTo(x, y - r * 1.2), ctx.lineTo(x + r * 1.1, y + r * 0.8), ctx.lineTo(x - r * 1.1, y + r * 0.8), ctx.closePath());
  else if (shape === 'diamond') (ctx.moveTo(x, y - r * 1.3), ctx.lineTo(x + r, y), ctx.lineTo(x, y + r * 1.3), ctx.lineTo(x - r, y), ctx.closePath());
  else if (shape === 'cross') (ctx.rect(x - r, y - r / 3, 2 * r, (2 * r) / 3), ctx.rect(x - r / 3, y - r, (2 * r) / 3, 2 * r));
  else ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
}

export function drawTraces(ctx, box, map, traces, mode, look) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  for (const tr of traces) {
    if (mode !== 'scatter_1d') {
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = look.lineWidth;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < tr.xs.length; i++) {
        const y = tr.ys[i];
        if (!Number.isFinite(y)) {
          pen = false;
          continue;
        }
        const px = map.sx(tr.xs[i]);
        const py = Math.max(-1e5, Math.min(1e5, map.sy(y)));
        if (pen) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
      }
      ctx.stroke();
    }
    if (mode !== 'lines_1d') {
      ctx.fillStyle = tr.color;
      const step = Math.max(1, Math.ceil(tr.xs.length / 120));
      for (let i = 0; i < tr.xs.length; i += step) {
        if (Number.isFinite(tr.ys[i])) marker(ctx, tr.marker, map.sx(tr.xs[i]), map.sy(tr.ys[i]), look.lineWidth + 1.5);
      }
    }
  }
  ctx.restore();
}

// A heatmap: one rectangle per grid point, centred on it (Makie's heatmap).
export function drawHeatmap(ctx, box, map, field, cmap) {
  const { xs, ys, values } = field;
  const edges = (a) => a.map((v, i) => (i === 0 ? v - (a[1] - a[0]) / 2 : (a[i - 1] + v) / 2)).concat([a[a.length - 1] + (a[a.length - 1] - a[a.length - 2]) / 2]);
  const ex = edges(Array.from(xs));
  const ey = edges(Array.from(ys));
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  for (let j = 0; j < ys.length; j++) {
    const y0 = map.sy(ey[j]);
    const y1 = map.sy(ey[j + 1]);
    for (let i = 0; i < xs.length; i++) {
      const c = cmap(values[i + xs.length * j]);
      if (!c[3]) continue;
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      const x0 = map.sx(ex[i]);
      const x1 = map.sx(ex[i + 1]);
      ctx.fillRect(Math.floor(x0), Math.floor(y1), Math.ceil(x1 - x0) + 1, Math.ceil(y0 - y1) + 1);
    }
  }
  ctx.restore();
}

// Filled contours: the field interpolated bilinearly at screen resolution and cut into bands between levels.
export function drawFilledContour(ctx, box, map, field, cmap, levels) {
  const { xs, ys, values } = field;
  const w = Math.max(1, Math.round(box.w));
  const h = Math.max(1, Math.round(box.h));
  const image = ctx.createImageData(w, h);
  const xIndex = fractional(xs);
  const yIndex = fractional(ys);
  const band = (v) => {
    let k = 0;
    while (k < levels.length && v > levels[k]) k++;
    const lo = k === 0 ? levels[0] : levels[k - 1];
    const hi = k === levels.length ? levels[levels.length - 1] : levels[k];
    return (lo + hi) / 2;
  };
  for (let py = 0; py < h; py++) {
    const fy = yIndex(map.iy(box.y + py + 0.5));
    for (let px = 0; px < w; px++) {
      const v = bilinear(values, xs.length, ys.length, xIndex(map.ix(box.x + px + 0.5)), fy);
      image.data.set(cmap(band(v)), 4 * (px + w * py));
    }
  }
  // putImageData ignores the transform, so the image goes through a second canvas.
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  off.getContext('2d').putImageData(image, 0, 0);
  ctx.drawImage(off, box.x, box.y, box.w, box.h);
}

// The fractional index of a value in an increasing axis.
function fractional(axis) {
  const n = axis.length;
  return (v) => {
    if (v <= axis[0]) return 0;
    if (v >= axis[n - 1]) return n - 1;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (axis[mid] <= v) lo = mid;
      else hi = mid;
    }
    return lo + (v - axis[lo]) / (axis[hi] - axis[lo]);
  };
}

function bilinear(values, nx, ny, fx, fy) {
  const i = Math.min(nx - 2, Math.floor(fx));
  const j = Math.min(ny - 2, Math.floor(fy));
  const a = fx - i;
  const b = fy - j;
  const v = (ii, jj) => values[ii + nx * jj];
  return (1 - a) * (1 - b) * v(i, j) + a * (1 - b) * v(i + 1, j) + (1 - a) * b * v(i, j + 1) + a * b * v(i + 1, j + 1);
}

// Contour lines by marching squares, coloured by level.
export function drawContourLines(ctx, box, map, field, cmap, levels, look) {
  const { xs, ys, values } = field;
  const nx = xs.length;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.lineWidth = look.lineWidth;
  for (const level of levels) {
    const c = cmap(level);
    ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.beginPath();
    for (let j = 0; j < ys.length - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const corners = [
          [xs[i], ys[j], values[i + nx * j]],
          [xs[i + 1], ys[j], values[i + 1 + nx * j]],
          [xs[i + 1], ys[j + 1], values[i + 1 + nx * (j + 1)]],
          [xs[i], ys[j + 1], values[i + nx * (j + 1)]],
        ];
        const points = [];
        for (let k = 0; k < 4; k++) {
          const [x0, y0, v0] = corners[k];
          const [x1, y1, v1] = corners[(k + 1) % 4];
          if (!Number.isFinite(v0) || !Number.isFinite(v1)) continue;
          if ((v0 < level) !== (v1 < level)) {
            const f = (level - v0) / (v1 - v0);
            points.push([x0 + f * (x1 - x0), y0 + f * (y1 - y0)]);
          }
        }
        for (let k = 0; k + 1 < points.length; k += 2) {
          ctx.moveTo(map.sx(points[k][0]), map.sy(points[k][1]));
          ctx.lineTo(map.sx(points[k + 1][0]), map.sy(points[k + 1][1]));
        }
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawParticles(ctx, box, map, sets, cmap, look) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  for (const set of sets) {
    for (let j = 0; j < set.px.length; j++) {
      const c = cmap(set.u[j]);
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      marker(ctx, set.marker, map.sx(set.px[j]), map.sy(set.py[j]), look.lineWidth + 2);
    }
  }
  ctx.restore();
}

// --- Legend and colourbar ------------------------------------------------------------------------------------------

export function legendSize(ctx, t, entries, look) {
  ctx.font = font(t, look.fontSize + 1);
  const width = Math.max(ctx.measureText('Methods').width, ...entries.map((e) => ctx.measureText(e.label).width + 34));
  return { w: width + 20, h: 30 + entries.length * (look.fontSize + 9) + 8 };
}

export function drawLegend(ctx, t, at, entries, look, kind) {
  const size = legendSize(ctx, t, entries, look);
  ctx.fillStyle = css(t.bg, 0.92);
  ctx.fillRect(at.x, at.y, size.w, size.h);
  ctx.strokeStyle = css(t.muted);
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(at.x) + 0.5, Math.round(at.y) + 0.5, Math.round(size.w), Math.round(size.h));
  ctx.fillStyle = css(t.ink);
  ctx.font = font(t, look.fontSize + 1, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Methods', at.x + size.w / 2, at.y + 8);
  ctx.font = font(t, look.fontSize + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  entries.forEach((e, i) => {
    const y = at.y + 30 + i * (look.fontSize + 9) + (look.fontSize + 9) / 2;
    ctx.fillStyle = e.color;
    ctx.strokeStyle = e.color;
    if (kind === 'particles' || e.mode === 'scatter_1d') marker(ctx, e.marker, at.x + 20, y, 4);
    else {
      ctx.lineWidth = look.lineWidth;
      ctx.beginPath();
      ctx.moveTo(at.x + 10, y);
      ctx.lineTo(at.x + 30, y);
      ctx.stroke();
      if (e.mode === 'scatter_lines') marker(ctx, e.marker, at.x + 20, y, 3.5);
    }
    ctx.fillStyle = css(t.ink);
    ctx.fillText(e.label, at.x + 36, y);
  });
  return size;
}

export function drawColorbar(ctx, t, box, clim, cmap, label, look) {
  const steps = Math.max(2, Math.round(box.h));
  for (let k = 0; k < steps; k++) {
    const v = clim[0] + ((clim[1] - clim[0]) * (steps - 1 - k)) / (steps - 1);
    const c = cmap(v);
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(box.x, box.y + k, box.w, 1.5);
  }
  ctx.strokeStyle = css(t.ink);
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w), Math.round(box.h));
  const ticks = niceTicks(clim[0], clim[1], 5);
  ctx.fillStyle = css(t.ink);
  ctx.font = font(t, look.fontSize - 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const v of ticks) {
    const y = box.y + box.h - ((v - clim[0]) / (clim[1] - clim[0])) * box.h;
    if (y < box.y - 1 || y > box.y + box.h + 1) continue;
    ctx.fillText(formatTick(v, ticks), box.x + box.w + 5, y);
  }
  ctx.save();
  ctx.font = font(t, look.fontSize + 1);
  ctx.translate(box.x + box.w + 58, box.y + box.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

export function drawTitle(ctx, t, text, x, y, look) {
  ctx.fillStyle = css(t.ink);
  ctx.font = font(t, look.fontSize + 5, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

export function measure(ctx, t, text, size, weight = 400) {
  ctx.font = font(t, size, weight);
  return ctx.measureText(text).width;
}

// Data ↔ pixel maps for a box and limits (drawAxes returns the same forward maps).
export function scales(box, xlim, ylim) {
  const sx = (v) => box.x + ((v - xlim[0]) / (xlim[1] - xlim[0])) * box.w;
  const sy = (v) => box.y + box.h - ((v - ylim[0]) / (ylim[1] - ylim[0])) * box.h;
  const ix = (px) => xlim[0] + ((px - box.x) / box.w) * (xlim[1] - xlim[0]);
  const iy = (py) => ylim[0] + ((box.y + box.h - py) / box.h) * (ylim[1] - ylim[0]);
  return { sx, sy, ix, iy };
}
