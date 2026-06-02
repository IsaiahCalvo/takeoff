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
  const tabs = [
    { dataset: { tab: 'page' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
    { dataset: { tab: 'categories' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
    { dataset: { tab: 'all' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
  ];

  sidebar.applyScopeChrome({
    scopeTabs,
    totalHeading,
    tabs,
    model: { showScopeTabs: false, totalHeadingText: 'Total', effectiveSidebarTab: 'categories' },
  });

  assert.equal(scopeTabs.hidden, true);
  assert.equal(totalHeading.textContent, 'Total');
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
  });

  assert.deepEqual(plain(model), {
    color: '#b6ff3c',
    name: 'Custom run',
    pointCount: 3,
    page: 2,
    onOtherPage: true,
    isUnscaled: false,
    lengthValue: '2',
    lengthUnit: 'ft',
    lengthHtml: '2 <span class="unit">ft</span>',
    measurementId: 8,
    className: 'item selected',
  });
});

test('category visibility controls collect keys and dispatch sidebar actions', async () => {
  const sidebar = await loadSidebarController();
  const listeners = {};
  const calls = [];
  const keyButtons = [
    { dataset: { pathCategoryKey: 'category:low-voltage' } },
    { dataset: { pathCategoryKey: 'category:power' } },
    { dataset: { pathCategoryKey: 'category:power' } },
  ];
  const root = {
    querySelectorAll(selector) {
      return selector === '.path-category-visibility-toggle[data-path-category-key]' ? keyButtons : [];
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
  });

  assert.deepEqual(plain(calls), [
    { stopped: true },
    { keys: ['category:low-voltage', 'category:power'], visible: true },
    { stopped: true },
    { keys: ['category:power'], visible: false },
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
