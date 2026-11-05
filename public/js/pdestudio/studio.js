// The PDEStudio demo: PDEStudio's control panel rebuilt in HTML, with the plots drawn on canvases from data that
// PDEStudioCore computed beforehand (see tools/pdestudio-demo/export.jl). The rules of the panel are in logic.js.
import { loadExample, frontendKey, isReferenceMethod } from './data.js';
import * as L from './logic.js';
import * as R from './render.js';

const TABS = ['plot', 'methods', 'shared', 'ui', 'files', 'advanced'];
const TAB_LABELS = { plot: 'Plot', methods: 'Methods', shared: 'Shared', ui: 'UI', files: 'Files', advanced: 'Advanced' };
const NEEDS_JULIA = 'needs Julia';

// --- DOM helpers ---------------------------------------------------------------------------------------------------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function select(value, options, label, onChange, disabled = false) {
  return h(
    'select',
    { 'aria-label': label, disabled, onchange: (e) => onChange(e.target.value) },
    options.map(([v, text]) => h('option', { value: v, selected: v === value, text })),
  );
}

// A text box that commits on Enter or when it loses focus, like the Textbox of the studio.
function textbox(value, label, onCommit, placeholder = '') {
  const input = h('input', { type: 'text', value, 'aria-label': label, placeholder });
  const commit = () => input.value !== value && onCommit(input.value.trim());
  input.addEventListener('keydown', (e) => e.key === 'Enter' && commit());
  input.addEventListener('blur', commit);
  return input;
}

export class Studio {
  constructor(root, dataUrl) {
    this.root = root;
    this.dataUrl = dataUrl;
    this.tab = 'plot';
    this.page = null; // the open editor page of the current tab, e.g. 'style', 'edit:upwind', 'labels:plot'
    this.methodFilter = 'all';
    this.playing = false;
    this.lockedLimits = null;
    this.status = { text: '', kind: 'ok' };
    this.build();
  }

  // --- Example and state ---------------------------------------------------------------------------------------

  async open(name) {
    this.stop();
    this.setStatus(`Loading ${name}…`, 'ok');
    try {
      this.ex = await loadExample(`${this.dataUrl}${name}.json`);
    } catch (error) {
      this.setStatus(`Could not load ${name}: ${error.message}`, 'error');
      return;
    }
    this.state = L.defaultState(this.ex);
    this.pending = { layout: clone(this.state.layout), plot: clone(this.state.plot), methods: [...this.state.methods] };
    this.edits = { shared: {}, methods: {} };
    this.page = null;
    this.lockedLimits = null;
    const runs = this.ex.computed.length * this.ex.sweepValues.length;
    this.setStatus(
      `Simulation finished: ${runs} runs (${this.ex.computed.length} methods × ${this.ex.sweepValues.length} values of ${this.ex.sweepKey}), computed beforehand with PDEStudioCore ${this.ex.versions.PDEStudioCore}.`,
      'ok',
    );
    this.renderAll();
  }

  setStatus(text, kind = 'ok') {
    this.status = { text, kind };
    if (this.statusLine) {
      this.statusLine.textContent = text;
      this.statusLine.dataset.kind = kind;
    }
  }

  get layoutPending() {
    return !same(this.pending.layout, this.state.layout);
  }
  get plotPending() {
    return !same(this.pending.plot, this.state.plot);
  }
  get runPending() {
    return !same(this.pending.methods, this.state.methods) || Object.keys(this.edits.shared).length > 0 || Object.keys(this.edits.methods).length > 0;
  }

  // The plot options that go with the pending layout (the menus of the Plot tab follow the chosen style).
  pendingView() {
    const view = clone(this.state);
    view.layout = clone(this.pending.layout);
    view.plot = clone(this.pending.plot);
    L.fixPlot(this.ex, view);
    this.pending.plot = clone(view.plot);
    return view;
  }

  applyLayout() {
    this.state.layout = clone(this.pending.layout);
    this.state.plot = clone(this.pending.plot);
    L.fixPlot(this.ex, this.state);
    this.pending.plot = clone(this.state.plot);
    this.lockedLimits = null;
    this.setStatus('Layout applied.', 'ok');
    this.renderAll();
  }

  updatePlot() {
    this.state.plot = clone(this.pending.plot);
    L.fixPlot(this.ex, this.state);
    this.pending.plot = clone(this.state.plot);
    this.lockedLimits = null;
    this.setStatus('Plot updated.', 'ok');
    this.renderAll();
  }

  runSimulation() {
    const changed = [
      ...Object.entries(this.edits.shared).map(([k, v]) => `${k} = ${v}`),
      ...Object.entries(this.edits.methods).flatMap(([m, ps]) => Object.entries(ps).map(([k, v]) => `${m}.${k} = ${v}`)),
    ];
    if (changed.length) {
      this.setStatus(
        `Changed parameters (${changed.join(', ')}) need a new simulation, which runs in Julia: open this example with @launch ${this.ex.name}() in PDEStudio. The web version only has the precomputed runs; ↺ resets a value.`,
        'warn',
      );
      this.renderAll();
      return;
    }
    const active = this.pending.methods.filter((m) => this.ex.runs[m]);
    const missing = this.pending.methods.filter((m) => !this.ex.runs[m]);
    this.state.methods = [...this.pending.methods];
    L.fixPlot(this.ex, this.state);
    this.lockedLimits = null;
    if (missing.length) this.setStatus(`Simulation finished (${active.length} methods). Not precomputed for the web version: ${missing.join(', ')}.`, 'warn');
    else this.setStatus(`Simulation finished in 0.0 s (${active.length} methods, loaded from the precomputed results).`, 'ok');
    this.renderAll();
  }

  // --- Building --------------------------------------------------------------------------------------------------

  build() {
    this.tabBar = h('div', { class: 'studio-tabs', role: 'tablist', 'aria-label': 'Control panel' });
    this.tabBody = h('div', { class: 'studio-tab-body' });
    this.statusLine = h('p', { class: 'studio-status', role: 'status', 'aria-live': 'polite' });
    this.buttons = h('div', { class: 'studio-buttons' });
    this.sliders = h('div', { class: 'studio-sliders' });
    this.panel = h('div', { class: 'studio-panel' }, this.tabBar, this.tabBody, this.statusLine, this.buttons, this.sliders);
    this.canvas = h('canvas', { role: 'img', 'aria-label': 'Plot' });
    this.plotArea = h('div', { class: 'studio-plot', tabindex: '0', 'aria-label': 'Plot area' }, this.canvas);
    this.root.replaceChildren(this.panel, this.plotArea);
    new ResizeObserver(() => this.ex && this.drawPlot()).observe(this.plotArea);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.ex && this.drawPlot());
  }

  renderAll() {
    if (!this.ex) return;
    this.renderTabs();
    this.renderTab();
    this.renderButtons();
    this.renderSliders();
    this.setStatus(this.status.text, this.status.kind);
    this.drawPlot();
  }

  renderTabs() {
    this.tabBar.replaceChildren(
      ...TABS.map((tab) =>
        h('button', {
          type: 'button',
          role: 'tab',
          'aria-selected': String(tab === this.tab),
          class: tab === this.tab ? 'is-active' : '',
          text: TAB_LABELS[tab],
          onclick: () => {
            this.tab = tab;
            this.page = null;
            this.renderAll();
          },
        }),
      ),
    );
  }

  renderTab() {
    const content = {
      plot: () => (this.page === 'style' ? this.stylePage() : this.plotTab()),
      methods: () => this.methodsTab(),
      shared: () => this.sharedTab(),
      ui: () => this.uiTab(),
      files: () => this.filesTab(),
      advanced: () => this.advancedTab(),
    }[this.tab]();
    this.tabBody.replaceChildren(content);
  }

  renderButtons() {
    const mark = (pending) => (pending ? 'is-pending' : 'is-synced');
    this.buttons.replaceChildren(
      h('button', { type: 'button', class: 'studio-play', 'aria-pressed': String(this.playing), text: this.playing ? 'Pause Anim' : 'Play Anim', onclick: () => this.togglePlay() }),
      h('button', {
        type: 'button',
        class: 'studio-lock',
        'aria-pressed': String(Boolean(this.lockedLimits)),
        text: this.lockedLimits ? 'Unlock Camera' : 'Lock Camera',
        onclick: () => {
          this.lockedLimits = this.lockedLimits ? null : this.currentLimits;
          this.setStatus(this.lockedLimits ? 'Camera locked: the limits stay fixed.' : 'Camera unlocked.', 'ok');
          this.renderButtons();
          this.drawPlot();
        },
      }),
      h('button', { type: 'button', class: mark(this.runPending), text: 'Run Simulation', onclick: () => this.runSimulation() }),
      h('button', { type: 'button', class: mark(this.layoutPending), text: 'Apply Layout', onclick: () => this.applyLayout() }),
      h('button', { type: 'button', class: mark(this.plotPending), text: 'Update Plot', onclick: () => this.updatePlot() }),
    );
  }

  renderSliders() {
    const defs = L.sliderDefs(this.ex, this.state);
    this.sliderOutputs = {};
    this.sliderInputs = {};
    this.sliders.replaceChildren(
      ...defs.map((def) => {
        const index = L.sliderIndex(this.ex, this.state, def.key, def.values);
        const id = `studio-slider-${def.key}`;
        const output = h('output', { for: id, text: L.formatValue(def.values[index], def.integer) });
        const input = h('input', {
          id,
          type: 'range',
          min: 0,
          max: def.values.length - 1,
          step: 1,
          value: index,
          disabled: def.values.length <= 1,
          oninput: (e) => this.moveSlider(def, Number(e.target.value)),
        });
        this.sliderOutputs[def.key] = output;
        this.sliderInputs[def.key] = input;
        return h('div', { class: 'studio-slider' }, h('label', { for: id, text: `${L.variableLabel(this.state, def.key)}:` }), input, output);
      }),
    );
  }

  moveSlider(def, index) {
    this.state.sliders[def.key] = index;
    this.sliderOutputs[def.key].textContent = L.formatValue(def.values[index], def.integer);
    if (def.key === this.ex.sweepKey && this.ex.particles) this.renderSliders(); // the time steps depend on dt
    this.drawPlot();
  }

  // --- Animation -------------------------------------------------------------------------------------------------

  togglePlay() {
    if (this.playing) return this.stop();
    const target = L.animTarget(this.ex, this.state);
    const def = L.sliderDefs(this.ex, this.state).find((d) => d.key === target);
    if (!def) {
      this.setStatus('Nothing to animate: the Anim Target is disabled, on an axis or compared.', 'warn');
      return;
    }
    this.playing = true;
    this.renderButtons();
    let last = 0;
    const frame = (now) => {
      if (!this.playing) return;
      const d = L.sliderDefs(this.ex, this.state).find((x) => x.key === target);
      if (!d) return this.stop();
      if (now - last > 1000 / Math.min(24, Math.max(4, d.values.length / 5))) {
        last = now;
        const next = (L.sliderIndex(this.ex, this.state, target, d.values) + 1) % d.values.length;
        this.state.sliders[target] = next;
        if (this.sliderInputs[target]) this.sliderInputs[target].value = next;
        if (this.sliderOutputs[target]) this.sliderOutputs[target].textContent = L.formatValue(d.values[next], d.integer);
        this.drawPlot();
      }
      this.animation = requestAnimationFrame(frame);
    };
    this.animation = requestAnimationFrame(frame);
  }

  stop() {
    this.playing = false;
    if (this.animation) cancelAnimationFrame(this.animation);
    if (this.buttons && this.ex) this.renderButtons();
  }

  // --- Tabs ------------------------------------------------------------------------------------------------------

  section(title) {
    return h('h3', { class: 'studio-section', text: title });
  }

  row(label, control, extra = null) {
    return h('div', { class: 'studio-row' }, h('span', { class: 'studio-label', text: label }), control, extra);
  }

  editPending(part, key, value) {
    this.pending[part][key] = value;
    this.renderAll();
  }

  plotTab() {
    const ex = this.ex;
    const view = this.pendingView();
    const layout = this.pending.layout;
    const plot = view.plot;
    const opt = (values) => values.map((v) => [v, v === 'Solution' ? 'Solution' : L.variableLabel(this.state, v)]);
    const numberBox = (key, label, lo, hi) =>
      textbox(String(layout[key]), label, (text) => {
        const n = Number(text);
        if (!Number.isInteger(n) || n < lo || n > hi) {
          this.setStatus(`${label}: "${text}" refused, a whole number from ${lo} to ${hi} is needed.`, 'warn');
          this.renderAll();
          return;
        }
        this.editPending('layout', key, n);
      });
    const compareLabels = L.compareOptions(ex).map((v) => [v, v === 'none' ? 'Disabled' : v === 'time' ? 'Time' : L.variableLabel(this.state, v)]);
    const kind = L.WEB_STYLES[layout.style];
    return h(
      'div',
      { class: 'studio-page' },
      this.section('Layout options  (Apply Layout)'),
      this.row(
        'Plot Style',
        h('button', { type: 'button', class: 'studio-choice', text: `${frontendKey(layout.style)} ›`, onclick: () => ((this.page = 'style'), this.renderAll()) }),
      ),
      this.row('Plot Width (px)', numberBox('width', 'Plot Width', 50, 5000)),
      this.row('Plot Height (px)', numberBox('height', 'Plot Height', 50, 5000)),
      this.row('Legend', select(layout.legend, L.LEGEND_OPTIONS.map((v) => [v, v === 'none' ? 'Disabled' : frontendKey(v)]), 'Legend', (v) => this.editPending('layout', 'legend', v))),
      this.row('Legend Placement', select(layout.placement, L.PLACEMENT_OPTIONS.map((v) => [v, frontendKey(v)]), 'Legend Placement', (v) => this.editPending('layout', 'placement', v))),
      this.row('Compare', select(layout.compare, compareLabels, 'Compare', (v) => this.editPending('layout', 'compare', v))),
      this.row('Grid Columns', numberBox('columns', 'Grid Columns', 1, L.MAX_COMPARE_PLOTS)),
      this.row('Compare Link', select(layout.link, L.LINK_OPTIONS.map((v) => [v, frontendKey(v)]), 'Compare Link', (v) => this.editPending('layout', 'link', v))),
      this.section('Plot options  (Update Plot)'),
      this.row('X-Axis', select(plot.x, opt(L.xAxisOptions(ex, view)), 'X-Axis', (v) => this.editPending('plot', 'x', v), kind === 'particles')),
      this.row('Y-Axis', select(plot.y, opt(L.yAxisOptions(ex, view)), 'Y-Axis', (v) => this.editPending('plot', 'y', v), kind !== 'field')),
      this.row('Z-Axis', select('none', [['none', 'Disabled']], 'Z-Axis', () => {}, true)),
      this.row('U-Axis (Dep)', select(plot.u, opt(L.uAxisOptions(ex, view)), 'U-Axis', (v) => this.editPending('plot', 'u', v))),
      this.row('Component', select('1', [['1', this.state.labels.components.component_1 || 'Component 1']], 'Component', () => {})),
      this.row('Anim Target', select(L.animTarget(ex, view), opt(L.animOptions(ex, view)), 'Anim Target', (v) => this.editPending('plot', 'anim', v))),
    );
  }

  stylePage() {
    const current = this.pending.layout.style;
    return h(
      'div',
      { class: 'studio-page' },
      h('div', { class: 'studio-page-head' }, h('button', { type: 'button', text: '‹ Back', onclick: () => ((this.page = null), this.renderAll()) }), h('strong', { text: 'Plot Style' })),
      L.STYLE_GROUPS.map(([group, styles]) => [
        this.section(group),
        h(
          'div',
          { class: 'studio-grid' },
          styles.map((style) => {
            const reason = L.styleUnavailable(this.ex, style);
            return h('button', {
              type: 'button',
              class: `studio-tile${style === current ? ' is-current' : ''}`,
              'aria-disabled': reason ? 'true' : null,
              title: reason ?? '',
              text: frontendKey(style),
              onclick: () => {
                if (reason) return this.setStatus(`${frontendKey(style)}: ${reason}.`, 'warn');
                this.pending.layout.style = style;
                this.page = null;
                this.renderAll();
              },
            });
          }),
        ),
      ]),
      h('p', { class: 'studio-note', text: 'Greyed out: styles that need Makie or a conversion of the data; they work in PDEStudio.' }),
    );
  }

  methodsTab() {
    const ex = this.ex;
    if (this.page?.startsWith('edit:')) return this.paramPage(this.page.slice(5));
    const active = this.pending.methods;
    const head = h('div', { class: 'studio-page-head' }, h('strong', { text: `Methods  (${active.length} of ${ex.allMethods.length} active)` }));
    const filterButton = h('button', {
      type: 'button',
      text: `Show: ${this.methodFilter}`,
      onclick: () => {
        this.methodFilter = { all: 'active', active: 'disabled', disabled: 'all' }[this.methodFilter];
        this.renderAll();
      },
    });
    const orderButton = h('button', {
      type: 'button',
      class: this.page === 'order' ? 'is-current' : '',
      text: 'Order ▲▼',
      onclick: () => ((this.page = this.page === 'order' ? null : 'order'), this.renderAll()),
    });
    let rows;
    if (this.page === 'order') {
      rows = active.map((m, i) =>
        h(
          'div',
          { class: 'studio-row' },
          h('span', { class: 'studio-label', text: m }),
          h('button', { type: 'button', text: '▲', 'aria-label': `Move ${m} up`, disabled: i === 0, onclick: () => this.moveMethod(i, -1) }),
          h('button', { type: 'button', text: '▼', 'aria-label': `Move ${m} down`, disabled: i === active.length - 1, onclick: () => this.moveMethod(i, 1) }),
        ),
      );
    } else {
      rows = ex.allMethods
        .filter((m) => this.methodFilter === 'all' || (this.methodFilter === 'active') === active.includes(m))
        .map((m) => {
          const on = active.includes(m);
          return h(
            'div',
            { class: 'studio-row' },
            h('span', { class: 'studio-label', text: m }),
            h('button', {
              type: 'button',
              class: on ? 'is-on' : '',
              'aria-pressed': String(on),
              text: on ? 'active' : 'off',
              onclick: () => {
                this.pending.methods = on ? active.filter((x) => x !== m) : [...active, m];
                this.renderAll();
              },
            }),
            h('button', { type: 'button', text: 'Edit ›', onclick: () => ((this.page = `edit:${m}`), this.renderAll()) }),
          );
        });
    }
    return h('div', { class: 'studio-page' }, head, h('div', { class: 'studio-row studio-two' }, filterButton, orderButton), rows);
  }

  moveMethod(i, step) {
    const list = this.pending.methods;
    [list[i], list[i + step]] = [list[i + step], list[i]];
    this.state.methods = this.state.methods.length === list.length && same([...this.state.methods].sort(), [...list].sort()) ? [...list] : this.state.methods;
    this.renderAll();
  }

  // Rows of parameters with a ↺ reset: edits are kept, but running them needs Julia (see runSimulation).
  paramRows(values, edits, onEdit) {
    return Object.keys(values)
      .sort()
      .map((key) => {
        const edited = edits[key] !== undefined;
        return h(
          'div',
          { class: `studio-row studio-param${edited ? ' is-edited' : ''}` },
          h('span', { class: 'studio-label', text: key }),
          textbox(edited ? edits[key] : values[key], key, (text) => onEdit(key, text === values[key] ? undefined : text)),
          h('button', { type: 'button', text: '↺', 'aria-label': `Reset ${key}`, disabled: !edited, onclick: () => onEdit(key, undefined) }),
        );
      });
  }

  paramPage(method) {
    const params = this.ex.config.methods[method] ?? {};
    const edits = (this.edits.methods[method] ??= {});
    return h(
      'div',
      { class: 'studio-page' },
      h('div', { class: 'studio-page-head' }, h('button', { type: 'button', text: '‹ Back', onclick: () => ((this.page = null), this.renderAll()) }), h('strong', { text: `Method ${method}` })),
      Object.keys(params).length
        ? this.paramRows(params, edits, (key, value) => {
            if (value === undefined) delete edits[key];
            else edits[key] = value;
            if (!Object.keys(edits).length) delete this.edits.methods[method];
            this.renderAll();
          })
        : h('p', { class: 'studio-note', text: isReferenceMethod(method) ? `A reference method: the exact solution ${this.ex.config.reference}, evaluated on the grid.` : 'No parameters of its own.' }),
    );
  }

  sharedTab() {
    return h(
      'div',
      { class: 'studio-page' },
      h('div', { class: 'studio-page-head' }, h('strong', { text: 'Shared parameters' })),
      this.paramRows(this.ex.config.shared, this.edits.shared, (key, value) => {
        if (value === undefined) delete this.edits.shared[key];
        else this.edits.shared[key] = value;
        this.renderAll();
      }),
      h('p', { class: 'studio-note', text: `Values are Julia literals. The sweep (${this.ex.sweepKey}) and the other fields of the configuration are in the Advanced tab.` }),
    );
  }

  uiTab() {
    const pages = {
      'labels:plot': () => this.labelsPlot(),
      'labels:methods': () => this.labelRows('Methods', this.ex.allMethods, this.state.labels.methods, (m) => methodDefault(m)),
      'labels:variables': () => this.labelRows('Variables', [this.ex.sweepKey, ...this.ex.dims, ...this.ex.statNames], this.state.labels.variables, (v) => frontendKey(v)),
      'labels:components': () => this.labelRows('Components', ['component_1'], this.state.labels.components, () => 'Component 1'),
      'general:axis': () => this.axisGeneral(),
    };
    if (this.page && pages[this.page]) return pages[this.page]();
    if (this.page) return this.unavailablePage(this.page.split(':')[1]);
    const kind = L.WEB_STYLES[this.state.layout.style];
    const tile = (label, page, current = false) =>
      h('button', {
        type: 'button',
        class: `studio-tile${current ? ' is-current' : ''}${pages[page] ? '' : ' is-elsewhere'}`,
        text: label,
        onclick: () => ((this.page = page), this.renderAll()),
      });
    const style = this.state.layout.style;
    return h(
      'div',
      { class: 'studio-page' },
      h('div', { class: 'studio-page-head' }, h('strong', { text: 'UI' })),
      this.section('General'),
      h('div', { class: 'studio-grid' }, tile('Axis General', 'general:axis'), tile('HUD', 'general:HUD'), tile('Outliers & Extrema', 'general:Outliers & Extrema')),
      this.section('Labels'),
      h('div', { class: 'studio-grid' }, tile('Plot', 'labels:plot'), tile('Components', 'labels:components'), tile('Variables', 'labels:variables'), tile('Methods', 'labels:methods')),
      this.section('Axes'),
      h(
        'div',
        { class: 'studio-grid' },
        tile('X Axis (1D)', 'axes:X Axis (1D)', kind === 'line'),
        tile('Y Axis (1D)', 'axes:Y Axis (1D)', kind === 'line'),
        tile('X Axis (2D/3D)', 'axes:X Axis (2D/3D)', kind !== 'line'),
        tile('Y Axis (2D/3D)', 'axes:Y Axis (2D/3D)', kind !== 'line'),
        tile('Z Axis (3D)', 'axes:Z Axis (3D)'),
      ),
      this.section('Plot styles'),
      h('div', { class: 'studio-grid' }, L.STYLE_GROUPS.flatMap(([, styles]) => styles).filter((s) => !s.startsWith('particles_')).map((s) => tile(frontendKey(s), `styles:${frontendKey(s)}`, s === style))),
      h('p', { class: 'studio-note', text: 'The pages with a solid border work here. The others set Makie attributes and open in PDEStudio.' }),
    );
  }

  back(title) {
    return h('div', { class: 'studio-page-head' }, h('button', { type: 'button', text: '‹ Back', onclick: () => ((this.page = null), this.renderAll()) }), h('strong', { text: title }));
  }

  unavailablePage(title) {
    return h('div', { class: 'studio-page' }, this.back(title), h('p', { class: 'studio-note', text: `This page sets Makie attributes of the plots (${title}). It works in PDEStudio, not in the web version.` }));
  }

  labelsPlot() {
    const labels = this.state.labels;
    const row = (key, label, placeholder) =>
      this.row(
        label,
        textbox(labels[key], label, (text) => {
          labels[key] = text;
          this.renderAll();
        }, placeholder),
      );
    return h(
      'div',
      { class: 'studio-page' },
      this.back('Labels: Plot'),
      row('title', 'Title', 'automatic'),
      row('xlabel', 'X label', 'automatic'),
      row('ylabel', 'Y label', 'automatic'),
      row('ulabel', 'Field label', 'automatic'),
      h('p', { class: 'studio-note', text: 'Empty: the studio picks the label. Press Enter to apply.' }),
    );
  }

  labelRows(title, names, store, fallback) {
    return h(
      'div',
      { class: 'studio-page' },
      this.back(`Labels: ${title}`),
      names.map((name) =>
        this.row(
          name,
          textbox(store[name] ?? '', name, (text) => {
            if (text) store[name] = text;
            else delete store[name];
            this.renderAll();
          }, fallback(name)),
        ),
      ),
      h('p', { class: 'studio-note', text: 'Display names only: files keep the backend names.' }),
    );
  }

  axisGeneral() {
    const look = this.state.look;
    const number = (key, label, lo, hi) =>
      textbox(String(look[key]), label, (text) => {
        const n = Number(text);
        if (!Number.isFinite(n) || n < lo || n > hi) return this.setStatus(`${label}: "${text}" refused, a number from ${lo} to ${hi} is needed.`, 'warn');
        look[key] = n;
        this.renderAll();
      });
    return h(
      'div',
      { class: 'studio-page' },
      this.back('Axis General'),
      this.row('Font size', number('fontSize', 'Font size', 8, 24)),
      this.row('Line width', number('lineWidth', 'Line width', 0.5, 8)),
      this.row(
        'Grid',
        h('button', {
          type: 'button',
          class: look.grid ? 'is-on' : '',
          'aria-pressed': String(look.grid),
          text: look.grid ? 'shown' : 'hidden',
          onclick: () => ((look.grid = !look.grid), this.renderAll()),
        }),
      ),
    );
  }

  filesTab() {
    const ex = this.ex;
    if (this.page === 'resolution') {
      const dims = ex.particles ? `particles: ${ex.dims.filter((d) => d !== ex.time_dim).join(', ')}, as computed` : ex.dims.map((d) => `${L.variableLabel(this.state, d)}: ${ex.axis(d).length} points`).join('\n');
      return h('div', { class: 'studio-page' }, this.back('Resolution'), h('pre', { class: 'studio-code', text: dims }), h('p', { class: 'studio-note', text: 'The resolution the data was exported with. In PDEStudio, it can be changed here.' }));
    }
    if (this.page === 'settings') {
      return h('div', { class: 'studio-page' }, this.back('Export settings'), h('p', { class: 'studio-note', text: 'The web version exports the current plot as a PNG image. PDEStudio exports images and animations with CairoMakie, in the formats and resolution set here.' }));
    }
    this.fileName ??= ex.name;
    const later = (what) => () => this.setStatus(`${what} ${NEEDS_JULIA}: try it in PDEStudio.`, 'warn');
    return h(
      'div',
      { class: 'studio-page' },
      this.row('Name / path', textbox(this.fileName, 'Name / path', (text) => ((this.fileName = text || ex.name), this.renderAll()), 'file name, preset name or path'), h('button', { type: 'button', text: 'Browse…', onclick: later('Browsing files') })),
      this.row('Description', textbox('', 'Description', () => {}, 'of a preset you save (optional)')),
      this.row(
        'File',
        h('div', { class: 'studio-three' },
          h('button', { type: 'button', text: 'Load', onclick: later('Loading a CSV or Julia file') }),
          h('button', { type: 'button', class: 'is-action', text: 'Export', onclick: () => this.exportPng() }),
          h('button', { type: 'button', text: 'Settings ›', onclick: () => ((this.page = 'settings'), this.renderAll()) }),
        ),
      ),
      this.row('Data', h('button', { type: 'button', text: 'Resolution ›', onclick: () => ((this.page = 'resolution'), this.renderAll()) })),
      this.section('Presets'),
      ['Simulation', 'Look'].map((kind) =>
        this.row(
          kind,
          h('div', { class: 'studio-three' },
            h('button', { type: 'button', class: 'is-action', text: 'Save', onclick: later(`Saving a ${kind.toLowerCase()} preset`) }),
            h('button', { type: 'button', text: 'Reset', onclick: kind === 'Look' ? () => this.resetLook() : later('Resetting the simulation preset') }),
            h('button', { type: 'button', text: 'Presets ›', onclick: later('Presets on disk') }),
          ),
        ),
      ),
      h('p', { class: 'studio-note', text: 'Presets and files live on disk next to your results, so they need PDEStudio. Export downloads the plot as a PNG.' }),
    );
  }

  resetLook() {
    const fresh = L.defaultState(this.ex);
    this.state.look = fresh.look;
    this.state.labels = fresh.labels;
    this.setStatus('Look reset to the defaults.', 'ok');
    this.renderAll();
  }

  exportPng() {
    const link = document.createElement('a');
    link.download = `${this.fileName || this.ex.name}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
    this.setStatus(`Exported ${link.download}.`, 'ok');
  }

  advancedTab() {
    const c = this.ex.config;
    const literal = (v) => (v === null ? 'nothing' : Array.isArray(v) ? `[${v.join(', ')}]` : String(v));
    const fields = { defaults: `[${c.defaults.map((m) => `:${m}`).join(', ')}]`, reference: c.reference ? `:${c.reference}` : 'nothing', postprocess: c.postprocess ? `:${c.postprocess}` : 'nothing', sources: literal(c.sources) };
    const pages = {
      shared: ['Shared', c.shared],
      sweep: ['Sweep', Object.fromEntries(Object.entries(c.varied).map(([k, v]) => [k, `[${v.join(', ')}]`]))],
      config: ['Config', fields],
      methods: ['Methods', Object.fromEntries(this.ex.allMethods.map((m) => [m, c.method_literals[m]]))],
    };
    if (this.page && pages[this.page]) {
      const [title, rows] = pages[this.page];
      return h(
        'div',
        { class: 'studio-page' },
        this.back(`Advanced: ${title}`),
        Object.entries(rows).map(([k, v]) => this.row(k, h('input', { type: 'text', value: v, readonly: true, 'aria-label': k }))),
        h('p', { class: 'studio-note', text: 'The SimulationConfig as PDEStudioCore stores it. Here it is read-only: changing it means a new simulation.' }),
      );
    }
    const tile = (key, label) => h('button', { type: 'button', class: 'studio-tile', text: label, onclick: () => ((this.page = key), this.renderAll()) });
    return h(
      'div',
      { class: 'studio-page' },
      h('div', { class: 'studio-page-head' }, h('strong', { text: 'Advanced: the SimulationConfig' })),
      h(
        'div',
        { class: 'studio-grid' },
        tile('shared', `Shared (${Object.keys(c.shared).length})`),
        tile('sweep', `Sweep (${Object.keys(c.varied).length})`),
        tile('config', `Config (${Object.keys(fields).length})`),
        tile('methods', `Methods (${this.ex.allMethods.length}) ›`),
      ),
    );
  }

  // --- Plot ------------------------------------------------------------------------------------------------------

  drawPlot() {
    const ex = this.ex;
    const state = this.state;
    const t = R.theme(this.root);
    const look = state.look;
    const kind = L.WEB_STYLES[state.layout.style];
    const panels = L.panels(ex, state);
    const order = state.methods.filter((m) => ex.runs[m]);
    const colorOf = (m) => R.seriesColor(t, Math.max(0, state.methods.indexOf(m)));
    const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

    // Content of every panel.
    const contents = panels.map((panel) => {
      if (kind === 'line') {
        // References last, so they are drawn on top (as in PDEStudio's Render.jl).
        const drawOrder = [...panel.methods.filter((m) => !isReferenceMethod(m)), ...panel.methods.filter(isReferenceMethod)];
        const traces = drawOrder.map((m) => {
          const { xs, ys } = L.lineData(ex, state, m, panel.idx);
          return { method: m, label: L.methodLabel(state, m), color: css(colorOf(m)), marker: R.seriesMarker(order.indexOf(m)), xs, ys };
        });
        return { panel, traces, xr: R.range([traces.flatMap((tr) => Array.from(tr.xs))], 0), yr: R.range(traces.map((tr) => tr.ys)) };
      }
      if (kind === 'field') {
        const m = panel.methods[0];
        if (!m) return { panel, empty: true };
        const field = L.fieldData(ex, state, m, panel.idx);
        return { panel, method: m, field, xr: [field.xs[0], field.xs[field.xs.length - 1]], yr: [field.ys[0], field.ys[field.ys.length - 1]], cr: R.range([field.values], 0) };
      }
      const sets = panel.methods.map((m) => ({ method: m, label: L.methodLabel(state, m), marker: R.seriesMarker(order.indexOf(m)), color: css(t.ink), ...L.particleData(ex, state, m, panel.idx) }));
      return { panel, sets, xr: R.range(sets.map((s) => s.px)), yr: R.range(sets.map((s) => s.py)), cr: R.range(sets.map((s) => s.u), 0) };
    });

    // Limits: shared when the comparison couples the axes, frozen when the camera is locked.
    const link = state.layout.link;
    const union = (key) => {
      const all = contents.filter((c) => c[key]).map((c) => c[key]);
      return all.length ? [Math.min(...all.map((r) => r[0])), Math.max(...all.map((r) => r[1]))] : [0, 1];
    };
    const axesLinked = panels.length === 1 || link === 'fully_coupled' || link === 'axes_only';
    const colorsLinked = panels.length === 1 || link === 'fully_coupled' || link === 'colorbar_only';
    const shared = { xr: union('xr'), yr: union('yr'), cr: union('cr') };
    for (const c of contents) {
      if (axesLinked) Object.assign(c, { xr: shared.xr, yr: shared.yr });
      if (colorsLinked && c.cr) c.cr = shared.cr;
    }
    if (this.lockedLimits && this.lockedLimits.count === contents.length) {
      contents.forEach((c, i) => Object.assign(c, this.lockedLimits.limits[i]));
    }
    this.currentLimits = { count: contents.length, limits: contents.map((c) => ({ xr: c.xr, yr: c.yr, cr: c.cr })) };

    // Sizes.
    const measureCtx = this.canvas.getContext('2d');
    const legendEntries =
      kind === 'field' || state.layout.legend === 'none'
        ? []
        : order.map((m) => ({ label: L.methodLabel(state, m), color: kind === 'particles' ? css(t.ink) : css(colorOf(m)), marker: R.seriesMarker(order.indexOf(m)), mode: state.layout.style }));
    const legend = legendEntries.length ? R.legendSize(measureCtx, t, legendEntries, look) : null;
    const detached = legend && state.layout.placement === 'detached';
    const side = state.layout.legend === 'center' ? 'right' : state.layout.legend;
    const hasColorbar = kind !== 'line';
    const cols = Math.min(state.layout.columns, contents.length);
    const rows = Math.ceil(contents.length / cols);
    const pw = state.layout.width;
    const ph = state.layout.height;
    const subtitled = panels.length > 1 || (kind === 'field' && order.length > 1);
    const margin = { left: 74, right: hasColorbar && !colorsLinked ? 96 : 16, top: subtitled ? look.fontSize + 18 : 14, bottom: look.fontSize * 3 + 18 };
    const cellW = margin.left + pw + margin.right;
    const cellH = margin.top + ph + margin.bottom;
    const titleText = L.plotTitle(ex, state);
    const titleH = titleText ? look.fontSize + 18 : 6;
    const sharedBar = hasColorbar && colorsLinked ? 100 : 0;
    const legendW = detached && (side === 'left' || side === 'right') ? legend.w + 16 : 0;
    const legendH = detached && (side === 'top' || side === 'bottom') ? legend.h + 12 : 0;
    const gridW = cols * cellW;
    const width = Math.max(gridW + sharedBar + legendW + 8, 320);
    const height = titleH + legendH + rows * cellH + 8;
    const ctx = R.prepare(this.canvas, width, height);
    ctx.fillStyle = css(t.bg);
    ctx.fillRect(0, 0, width, height);
    const gridX = detached && side === 'left' ? legendW : 0;
    const gridY = titleH + (detached && side === 'top' ? legendH : 0);
    if (titleText) R.drawTitle(ctx, t, titleText, gridX + (gridW + sharedBar) / 2, 8, look);

    const labels = state.labels;
    const xLabel = labels.xlabel || L.variableLabel(state, state.plot.x);
    const uLabel = L.fieldLabel(state, state.plot.u);
    const yLabel = labels.ylabel || (kind === 'line' ? uLabel : L.variableLabel(state, state.plot.y));
    let firstBox = null;
    contents.forEach((c, k) => {
      const box = { x: gridX + (k % cols) * cellW + margin.left, y: gridY + Math.floor(k / cols) * cellH + margin.top, w: pw, h: ph };
      firstBox ??= box;
      if (c.empty) {
        R.drawFrame(ctx, t, box);
        return;
      }
      const map = R.scales(box, c.xr, c.yr);
      R.drawAxes(ctx, t, box, { xlim: c.xr, ylim: c.yr, xLabel, yLabel, subtitle: c.panel.subtitle || (kind === 'field' && order.length > 1 ? L.methodLabel(state, c.method) : '') }, look);
      if (kind === 'line') R.drawTraces(ctx, box, map, c.traces, state.layout.style, look);
      else if (kind === 'field') {
        const cmap = R.colormap(t, c.cr[0], c.cr[1]);
        const levels = R.niceTicks(c.cr[0], c.cr[1], 10).filter((v) => v > c.cr[0] && v < c.cr[1]);
        if (state.layout.style === 'heatmap_flat') R.drawHeatmap(ctx, box, map, c.field, cmap);
        else if (state.layout.style === 'contour_f') R.drawFilledContour(ctx, box, map, c.field, cmap, levels);
        else R.drawContourLines(ctx, box, map, c.field, cmap, levels, look);
        if (!colorsLinked) R.drawColorbar(ctx, t, { x: box.x + box.w + 12, y: box.y, w: 14, h: box.h }, c.cr, cmap, uLabel, look);
      } else {
        R.drawParticles(ctx, box, map, c.sets, R.colormap(t, c.cr[0], c.cr[1]), look);
        if (!colorsLinked) R.drawColorbar(ctx, t, { x: box.x + box.w + 12, y: box.y, w: 14, h: box.h }, c.cr, R.colormap(t, c.cr[0], c.cr[1]), uLabel, look);
      }
      R.drawFrame(ctx, t, box);
      if (legend && !detached && k === 0) {
        const pos = {
          left: { x: box.x + 8, y: box.y + (box.h - legend.h) / 2 },
          right: { x: box.x + box.w - legend.w - 8, y: box.y + (box.h - legend.h) / 2 },
          top: { x: box.x + (box.w - legend.w) / 2, y: box.y + 8 },
          bottom: { x: box.x + (box.w - legend.w) / 2, y: box.y + box.h - legend.h - 8 },
        }[state.layout.placement];
        R.drawLegend(ctx, t, pos, legendEntries, look, kind);
      }
    });
    if (hasColorbar && colorsLinked && firstBox) {
      const cr = shared.cr;
      const cmap = R.colormap(t, cr[0], cr[1]);
      R.drawColorbar(ctx, t, { x: gridX + gridW + 4, y: gridY + margin.top, w: 14, h: Math.min(ph, rows * cellH - margin.top - margin.bottom) }, cr, cmap, uLabel, look);
    }
    if (detached) {
      const gridH = rows * cellH;
      const pos = {
        right: { x: gridX + gridW + sharedBar + 8, y: gridY + (gridH - legend.h) / 2 },
        left: { x: 8, y: gridY + (gridH - legend.h) / 2 },
        top: { x: gridX + (gridW - legend.w) / 2, y: titleH },
        bottom: { x: gridX + (gridW - legend.w) / 2, y: gridY + gridH + 4 },
      }[side];
      R.drawLegend(ctx, t, pos, legendEntries, look, kind);
    }
    this.canvas.setAttribute('aria-label', `${frontendKey(state.layout.style)} plot of ${uLabel}${titleText ? `, ${titleText}` : ''}`);
  }
}

function methodDefault(m) {
  return isReferenceMethod(m) ? frontendKey(m) : m;
}
