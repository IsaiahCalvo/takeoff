import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadSidebarController() {
  const [decimalSource, source] = await Promise.all([
    readFile(new URL('../src/app/decimal-input.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sidebar-controller.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(decimalSource, sandbox, { filename: 'decimal-input.js' });
  vm.runInContext(source, sandbox, { filename: 'sidebar-controller.js' });
  return sandbox.window.TakeoffSidebarController;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('applyScopeChrome hides tabs and marks the effective tab active', async () => {
  const sidebar = await loadSidebarController();
  const scopeTabs = { hidden: false };
  const totalHeading = { textContent: '' };
  const entireTotal = { hidden: true, textContent: '' };
  const tabs = [
    { dataset: { tab: 'page' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
    { dataset: { tab: 'categories' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
    { dataset: { tab: 'all' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
  ];

  sidebar.applyScopeChrome({
    scopeTabs,
    totalHeading,
    entireTotal,
    tabs,
    model: {
      showScopeTabs: false,
      totalHeadingText: 'Visible Total',
      effectiveSidebarTab: 'categories',
      showEntireTotal: true,
      entireTotalText: 'Total: 15.00 ft',
    },
  });

  assert.equal(scopeTabs.hidden, true);
  assert.equal(totalHeading.textContent, 'Visible Total');
  assert.equal(entireTotal.hidden, false);
  assert.equal(entireTotal.textContent, 'Total: 15.00 ft');
  assert.equal(tabs[0].classList.active, false);
  assert.equal(tabs[1].classList.active, true);
  assert.equal(tabs[2].classList.active, false);
});

test('applyScopeChrome shows only available single-page scope tabs', async () => {
  const sidebar = await loadSidebarController();
  const styleCalls = [];
  const scopeTabs = {
    hidden: true,
    style: {
      setProperty(name, value) {
        styleCalls.push({ name, value });
      },
    },
  };
  const totalHeading = { textContent: '' };
  const tabs = [
    { hidden: false, textContent: 'This page', dataset: { tab: 'page' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
    { hidden: false, textContent: 'Categories', dataset: { tab: 'categories' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
    { hidden: false, textContent: 'All pages', dataset: { tab: 'all' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
  ];

  sidebar.applyScopeChrome({
    scopeTabs,
    totalHeading,
    tabs,
    model: {
      showScopeTabs: true,
      availableScopeTabs: ['page', 'categories'],
      totalHeadingText: 'Categories Total',
      effectiveSidebarTab: 'categories',
      showEntireTotal: false,
    },
  });

  assert.equal(scopeTabs.hidden, false);
  assert.deepEqual(styleCalls, [{ name: '--scope-tab-count', value: '2' }]);
  assert.equal(totalHeading.textContent, 'Categories Total');
  assert.equal(tabs[0].hidden, false);
  assert.equal(tabs[1].hidden, false);
  assert.equal(tabs[2].hidden, true);
  assert.deepEqual(tabs.filter(tab => !tab.hidden).map(tab => tab.textContent), ['This page', 'Categories']);
  assert.equal(tabs[0].classList.active, false);
  assert.equal(tabs[1].classList.active, true);
  assert.equal(tabs[2].classList.active, false);
});

test('buildMeasurementItemViewModel prepares sidebar row display data', async () => {
  const sidebar = await loadSidebarController();
  const measurement = {
    id: 8,
    name: '  Custom run  ',
    color: '#b6ff3c',
    points: [{}, {}, {}],
    page: 2,
    lengthInches: 24,
    pathName: 'West wall data',
    pathCategoryName: 'Cat 6',
    pathCategoryVisibilityKey: 'category:low-voltage',
    pathCategoryVisible: false,
    pathStyle: {
      stroke: { color: '#36d399', style: 'dashed' },
      anchors: { fill: '#ffffff', border: '#36d399' },
    },
    runDetails: { text: 'Needs review', photos: [], videos: [] },
  };

  const model = sidebar.buildMeasurementItemViewModel({
    measurement,
    currentPage: 1,
    selectedId: 8,
    unit: 'feet',
    cleanMeasurementName: value => value.trim(),
    formatLength: inches => `${inches / 12}`,
    unitLabel: () => 'ft',
    measurementItemClass: ({ selected, isUnscaled }) => `item ${selected ? 'selected' : ''} ${isUnscaled ? 'unscaled' : ''}`.trim(),
    hasRunDetails: details => details?.text === 'Needs review',
  });

  assert.deepEqual(plain(model), {
    color: '#b6ff3c',
    name: 'Custom run',
    pathDisplayName: 'West wall data',
    pathCategorySubtitle: 'Cat 6',
    pathCategoryVisibilityKey: 'category:low-voltage',
    pathCategoryVisible: false,
    pathCategoryToggleName: 'Cat 6',
    pathStyle: {
      stroke: { color: '#36d399', style: 'dashed' },
      anchors: { fill: '#ffffff', border: '#36d399' },
    },
    pointCount: 3,
    page: 2,
    onOtherPage: true,
    isUnscaled: false,
    lengthValue: '2',
    lengthUnit: 'ft',
    lengthHtml: '2 <span class="unit">ft</span>',
    measurementId: 8,
    detailsPresent: true,
    className: 'item selected',
  });
});

test('buildMeasurementItemViewModel counts semantic circle and arc handles without stored points', async () => {
  const sidebar = await loadSidebarController();
  const baseOptions = {
    currentPage: 1,
    selectedId: null,
    unit: 'feet',
    cleanMeasurementName: value => String(value || '').trim(),
    formatLength: inches => `${inches / 12}`,
    unitLabel: () => 'ft',
    measurementItemClass: () => 'item',
  };

  const circleModel = sidebar.buildMeasurementItemViewModel({
    ...baseOptions,
    measurement: {
      id: 21,
      name: 'Circle',
      color: '#b6ff3c',
      page: 1,
      lengthInches: 120,
      circle: { center: { x: 10, y: 10 }, radius: 5 },
      drawType: 'circle',
    },
  });
  const arcModel = sidebar.buildMeasurementItemViewModel({
    ...baseOptions,
    measurement: {
      id: 22,
      name: 'Arc',
      color: '#b6ff3c',
      page: 1,
      lengthInches: 60,
      arc: { center: { x: 10, y: 10 }, radius: 5, startAngle: 0, sweep: Math.PI / 2 },
      drawType: 'arc',
    },
  });

  assert.equal(circleModel.pointCount, 2);
  assert.equal(arcModel.pointCount, 2);
});

test('category visibility controls collect keys and dispatch sidebar actions', async () => {
  const sidebar = await loadSidebarController();
  const listeners = {};
  const calls = [];
  const keyTargets = [
    { dataset: { pathCategoryKey: 'category:low-voltage' } },
    { dataset: { pathCategoryKey: 'category:power' } },
    { dataset: { pathCategoryKey: 'category:power' } },
  ];
  const root = {
    querySelectorAll(selector) {
      return selector === '[data-path-category-key]' ? keyTargets : [];
    },
    contains(target) {
      return target?.insideRoot === true;
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };

  assert.deepEqual(plain(sidebar.categoryVisibilityKeys(root)), ['category:low-voltage', 'category:power']);

  sidebar.bindCategoryVisibilityControls({
    root,
    setVisibility(keys, visible) {
      calls.push({ keys, visible });
    },
  });

  const bulkButton = {
    insideRoot: true,
    dataset: { categoryVisibilityAction: 'show-all' },
  };
  listeners.click({
    target: {
      closest(selector) {
        return selector === '[data-category-visibility-action]' ? bulkButton : null;
      },
    },
    stopPropagation() {
      calls.push({ stopped: true });
    },
  });

  const toggleButton = {
    insideRoot: true,
    dataset: { pathCategoryKey: 'category:power', nextVisible: 'false' },
  };
  listeners.click({
    target: {
      closest(selector) {
        return selector === '[data-path-category-key]' ? toggleButton : null;
      },
    },
    stopPropagation() {
      calls.push({ stopped: true });
    },
    preventDefault() {
      calls.push({ prevented: true });
    },
  });

  const rowTarget = {
    insideRoot: true,
    dataset: { pathCategoryKey: 'category:low-voltage', nextVisible: 'true' },
  };
  listeners.click({
    target: {
      closest(selector) {
        return selector === '[data-path-category-key]' ? rowTarget : null;
      },
    },
    stopPropagation() {
      calls.push({ stopped: true });
    },
    preventDefault() {
      calls.push({ prevented: true });
    },
  });

  assert.deepEqual(plain(calls), [
    { stopped: true },
    { keys: ['category:low-voltage', 'category:power'], visible: true },
    { stopped: true },
    { prevented: true },
    { keys: ['category:power'], visible: false },
    { stopped: true },
    { prevented: true },
    { keys: ['category:low-voltage'], visible: true },
  ]);
});

test('Path group settings controls dispatch the grouped row action', async () => {
  const sidebar = await loadSidebarController();
  const listeners = {};
  const calls = [];
  const root = {
    contains(target) {
      return target?.insideRoot === true;
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const button = {
    insideRoot: true,
    dataset: { pathGroupId: 'path:template-security:path-cat6' },
  };

  sidebar.bindPathGroupSettingsControls({
    root,
    openSettings(pathGroupId, trigger) {
      calls.push(pathGroupId);
      calls.push(trigger === button ? 'button' : 'missing-button');
    },
  });

  listeners.click({
    target: {
      closest(selector) {
        return selector === '[data-path-settings-action="open"]' ? button : null;
      },
    },
    stopPropagation() {
      calls.push('stopped');
    },
    preventDefault() {
      calls.push('prevented');
    },
  });

  assert.deepEqual(plain(calls), ['stopped', 'prevented', 'path:template-security:path-cat6', 'button']);
});

test('Run Details controls dispatch the run row action', async () => {
  const sidebar = await loadSidebarController();
  const listeners = {};
  const calls = [];
  const root = {
    contains(target) {
      return target?.insideRoot === true;
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const button = {
    insideRoot: true,
    dataset: { measurementId: '42' },
  };

  sidebar.bindRunDetailsControls({
    root,
    openDetails(measurementId, trigger) {
      calls.push(measurementId);
      calls.push(trigger === button ? 'button' : 'missing-button');
    },
  });

  listeners.click({
    target: {
      closest(selector) {
        return selector === '[data-run-details-action="open"]' ? button : null;
      },
    },
    stopPropagation() {
      calls.push('stopped');
    },
    preventDefault() {
      calls.push('prevented');
    },
  });

  assert.deepEqual(plain(calls), ['stopped', 'prevented', '42', 'button']);
});

test('sidebar row selection uses canvas-style modifier selection', async () => {
  const sidebar = await loadSidebarController();
  const calls = [];
  const state = { selectedId: 10, selectedIds: [10] };
  const selection = {
    selectFromClick(id, event) {
      calls.push(`select:${id}:${event.shiftKey ? 'shift' : 'plain'}:${event.altKey ? 'alt' : 'no-alt'}`);
      if (event.altKey || (event.shiftKey && state.selectedIds.includes(id))) {
        state.selectedIds = state.selectedIds.filter(selectedId => selectedId !== id);
        state.selectedId = state.selectedIds[0] ?? null;
        return 'remove';
      }
      if (event.shiftKey) {
        state.selectedIds = [...state.selectedIds, id];
        return 'add';
      }
      if (state.selectedIds.includes(id)) return 'preserve';
      state.selectedIds = [id];
      state.selectedId = id;
      return 'single';
    },
  };

  assert.equal(sidebar.selectMeasurementRowFromSidebar({
    measurementId: 11,
    event: { shiftKey: true, altKey: false },
    selection,
    renderList: () => calls.push('render-list'),
    syncSidebarSelection: () => calls.push('sync-selection'),
    redraw: () => calls.push('redraw'),
  }), 'add');

  assert.deepEqual(plain(state), { selectedId: 10, selectedIds: [10, 11] });
  assert.deepEqual(plain(calls), [
    'select:11:shift:no-alt',
    'render-list',
    'redraw',
  ]);

  calls.length = 0;
  assert.equal(sidebar.selectMeasurementRowFromSidebar({
    measurementId: 11,
    event: { shiftKey: true, altKey: false, target: { tagName: 'INPUT' } },
    selection,
    renderList: () => calls.push('render-list'),
    syncSidebarSelection: () => calls.push('sync-selection'),
    redraw: () => calls.push('redraw'),
  }), 'remove');

  assert.deepEqual(plain(state), { selectedId: 10, selectedIds: [10] });
  assert.deepEqual(plain(calls), [
    'select:11:shift:no-alt',
    'sync-selection',
    'redraw',
  ]);
});

test('revealMeasurementRow expands the containing Path group and scrolls the exact run row', async () => {
  const sidebar = await loadSidebarController();
  const events = [];
  const runs = { hidden: true };
  const toggle = {
    setAttribute(name, value) {
      events.push(`${name}:${value}`);
    },
  };
  const group = {
    removed: [],
    classList: {
      remove(name) {
        group.removed.push(name);
      },
    },
    querySelector(selector) {
      if (selector === '.path-group-runs') return runs;
      if (selector === '[aria-expanded="false"]') return toggle;
      return null;
    },
  };
  const rowA = {
    dataset: { measId: 'run-a' },
    closest: () => group,
    scrollIntoView() {
      events.push('wrong-row');
    },
  };
  const rowB = {
    dataset: { measId: '42' },
    closest: selector => selector === '.path-group' ? group : null,
    scrollIntoView(options) {
      events.push(`scroll:${options.block}:${options.inline}`);
    },
  };
  const root = {
    querySelectorAll(selector) {
      return selector === '.meas-item' ? [rowA, rowB] : [];
    },
  };

  const revealed = sidebar.revealMeasurementRow({ root, measurementId: 42 });

  assert.equal(revealed, rowB);
  assert.equal(runs.hidden, false);
  assert.deepEqual(group.removed, ['collapsed']);
  assert.deepEqual(events, ['aria-expanded:true', 'scroll:center:nearest']);
});

test('editableLengthInput handles Enter commit and Escape cancel', async () => {
  const sidebar = await loadSidebarController();
  const events = [];
  const input = {
    value: '2.00',
    dataset: {},
    readOnly: true,
    selected: false,
    blurred: false,
    removeAttribute(name) {
      if (name === 'readonly') this.readOnly = false;
    },
    setAttribute(name) {
      if (name === 'readonly') this.readOnly = true;
    },
    hasAttribute(name) {
      return name === 'readonly' && this.readOnly;
    },
    focus() {
      events.push('focus');
    },
    select() {
      this.selected = true;
    },
    blur() {
      this.blurred = true;
      events.push('blur');
    },
    setSelectionRange(start, end) {
      events.push(`selection:${start}:${end}`);
    },
  };
  const editor = sidebar.createEditableLengthInput({
    input,
    currentValue: () => '2.00',
    commit: value => {
      events.push(`commit:${value}`);
      return true;
    },
    cancel: value => {
      events.push(`cancel:${value}`);
    },
  });

  editor.start();
  input.value = '1.00';
  editor.handleKeyDown({
    key: 'Enter',
    stopPropagation() { events.push('stop'); },
    preventDefault() { events.push('prevent'); },
  });

  assert.equal(input.readOnly, true);
  assert.equal(input.blurred, true);
  assert.ok(events.includes('commit:1.00'));
  assert.ok(events.includes('stop'));
  assert.ok(events.includes('prevent'));

  input.blurred = false;
  editor.start();
  input.value = 'bad';
  editor.handleKeyDown({
    key: 'Escape',
    stopPropagation() { events.push('stop-escape'); },
    preventDefault() { events.push('prevent-escape'); },
  });

  assert.equal(input.value, '2.00');
  assert.equal(input.readOnly, true);
  assert.equal(input.blurred, true);
  assert.ok(events.includes('cancel:2.00'));
  assert.ok(events.includes('stop-escape'));
  assert.ok(events.includes('prevent-escape'));
});

test('editableLengthInput keeps focus and validation state when Enter or blur rejects Length', async () => {
  const sidebar = await loadSidebarController();
  const events = [];
  const attrs = {};
  const classes = new Set();
  const errorEl = {
    hidden: true,
    textContent: '',
    id: 'length-error-1',
  };
  const input = {
    value: '2.00',
    dataset: {},
    readOnly: true,
    removeAttribute(name) {
      if (name === 'readonly') this.readOnly = false;
      delete attrs[name];
    },
    setAttribute(name, value = '') {
      if (name === 'readonly') this.readOnly = true;
      attrs[name] = value;
    },
    hasAttribute(name) {
      return name === 'readonly' ? this.readOnly : Object.hasOwn(attrs, name);
    },
    focus() {
      events.push('focus');
    },
    select() {
      events.push('select');
    },
    blur() {
      events.push('blur');
    },
    setSelectionRange(start, end) {
      events.push(`selection:${start}:${end}`);
    },
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
  };
  const editor = sidebar.createEditableLengthInput({
    input,
    errorEl,
    validationMessage: 'Enter a positive Length.',
    currentValue: () => '2.00',
    commit: value => {
      events.push(`commit:${value}`);
      return false;
    },
  });

  editor.start();
  input.value = 'bad';
  editor.handleKeyDown({
    key: 'Enter',
    stopPropagation() { events.push('stop'); },
    preventDefault() { events.push('prevent'); },
  });

  assert.equal(input.value, '');
  assert.equal(input.readOnly, false);
  assert.equal(attrs['aria-invalid'], 'true');
  assert.equal(attrs['aria-describedby'], 'length-error-1');
  assert.equal(classes.has('invalid'), true);
  assert.equal(errorEl.hidden, false);
  assert.equal(errorEl.textContent, 'Enter a positive Length.');
  assert.deepEqual(events.slice(-4), ['focus', 'select', 'stop', 'prevent']);

  input.value = '';
  editor.handleBlur();

  assert.equal(input.value, '');
  assert.equal(input.readOnly, false);
  assert.equal(events.at(-2), 'focus');
  assert.equal(events.at(-1), 'select');
  assert.equal(errorEl.hidden, false);
});

test('editableLengthInput accepts only positive decimal number syntax while typing', async () => {
  const sidebar = await loadSidebarController();
  const events = [];
  const attrs = {};
  const listeners = {};
  const classes = new Set();
  const input = {
    value: '2.00',
    dataset: {},
    readOnly: true,
    removeAttribute(name) {
      if (name === 'readonly') this.readOnly = false;
      delete attrs[name];
    },
    setAttribute(name, value = '') {
      if (name === 'readonly') this.readOnly = true;
      attrs[name] = value;
    },
    hasAttribute(name) {
      return name === 'readonly' ? this.readOnly : Object.hasOwn(attrs, name);
    },
    focus() {
      events.push('focus');
    },
    select() {
      events.push('select');
    },
    blur() {
      events.push('blur');
    },
    setSelectionRange(start, end) {
      events.push(`selection:${start}:${end}`);
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
  };
  const editor = sidebar.createEditableLengthInput({
    input,
    currentValue: () => '2.00',
    commit: value => {
      events.push(`commit:${value}`);
      return Number(value) > 0;
    },
  });

  editor.start();
  input.value = '1a,2-3.4.5ft';
  listeners.input();

  assert.equal(input.value, '123.45');

  editor.handleKeyDown({
    key: 'Enter',
    stopPropagation() { events.push('stop'); },
    preventDefault() { events.push('prevent'); },
  });

  assert.ok(events.includes('commit:123.45'));
  assert.equal(input.readOnly, true);

  editor.start();
  input.value = '00';
  listeners.input();

  assert.equal(input.value, '0.0');

  input.value = '000';
  listeners.input();

  assert.equal(input.value, '0.00');

  input.value = '05';
  listeners.input();

  assert.equal(input.value, '0.5');

  input.value = '0123';
  listeners.input();

  assert.equal(input.value, '0.123');

  input.value = '000.05';
  listeners.input();

  assert.equal(input.value, '0.0005');

  input.value = '01.2';
  listeners.input();

  assert.equal(input.value, '0.12');

  input.value = '100';
  listeners.input();

  assert.equal(input.value, '100');

  input.value = '0.005';
  listeners.input();

  assert.equal(input.value, '0.005');

  editor.start();
  input.value = '-0,abc.0.0';
  listeners.input();

  assert.equal(input.value, '0.00');

  editor.handleKeyDown({
    key: 'Enter',
    stopPropagation() {},
    preventDefault() {},
  });

  assert.equal(input.readOnly, false);
  assert.equal(classes.has('invalid'), true);
});
