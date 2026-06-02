import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadLengthEditController() {
  const [sidebarSource, lengthSource] = await Promise.all([
    readFile(new URL('../src/app/sidebar-controller.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/length-edit-controller.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: { innerWidth: 1200, innerHeight: 800 } };
  vm.createContext(sandbox);
  vm.runInContext(sidebarSource, sandbox, { filename: 'sidebar-controller.js' });
  vm.runInContext(lengthSource, sandbox, { filename: 'length-edit-controller.js' });
  return {
    sidebar: sandbox.window.TakeoffSidebarController,
    lengthEdit: sandbox.window.TakeoffLengthEditController,
  };
}

function createFakeInput(events) {
  const attrs = {};
  const classes = new Set();
  return {
    value: '',
    dataset: {},
    readOnly: true,
    attrs,
    classes,
    listeners: {},
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
    focus() { events.push('focus'); },
    select() { events.push('select'); },
    blur() { events.push('blur'); },
    setSelectionRange(start, end) { events.push(`selection:${start}:${end}`); },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
  };
}

test('canvas Length editor keeps invalid typed value visible and focused', async () => {
  const { sidebar, lengthEdit } = await loadLengthEditController();
  const events = [];
  const input = createFakeInput(events);
  const pillClasses = new Set();
  const errorEl = { hidden: true, textContent: '', id: 'canvas-length-error' };
  const pill = {
    style: {},
    classList: {
      add(name) { pillClasses.add(name); },
      remove(name) { pillClasses.delete(name); },
      contains(name) { return pillClasses.has(name); },
    },
    querySelector(selector) {
      return selector === '.length-edit-error' ? errorEl : null;
    },
  };
  const state = {
    selectedId: null,
    rotateModeId: null,
    measurements: [{ id: 9, page: 1, lengthInches: 24, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] }],
  };
  const calls = [];
  const controller = lengthEdit.createLengthEditController({
    state,
    input,
    pill,
    stage: { getBoundingClientRect: () => ({ left: 10, top: 20 }) },
    sidebarController: sidebar,
    scaleForPage: () => 10,
    formatLength: inches => `${inches / 12}.00`,
    parseLengthInUnit: () => null,
    resizeMeasurementToLength: () => {
      calls.push('resize');
      return true;
    },
    createHistorySnapshot: () => ({}),
    recordHistory: () => calls.push('history'),
    renderList: () => calls.push('renderList'),
    redraw: () => calls.push('redraw'),
    showStatus: message => calls.push(`status:${message}`),
    syncSidebarSelection: () => {},
    finishPointerDrag: () => calls.push('finishDrag'),
    clearActiveFitMode: () => calls.push('clearFit'),
    setSelectionMode: () => calls.push('selectionMode'),
    imageToScreen: () => ({ x: 100, y: 120 }),
    endRotateMode: () => calls.push('endRotate'),
  });

  assert.equal(controller.openCanvasLengthEdit({ measurementId: 9, x: 20, y: 30, width: 60, height: 20 }), true);
  input.value = 'bad';
  input.listeners.keydown({
    key: 'Enter',
    stopPropagation() { events.push('stop'); },
    preventDefault() { events.push('prevent'); },
  });

  assert.equal(input.value, '');
  assert.equal(input.readOnly, false);
  assert.equal(input.attrs['aria-invalid'], 'true');
  assert.equal(input.attrs['aria-describedby'], 'canvas-length-error');
  assert.equal(input.classes.has('invalid'), true);
  assert.equal(errorEl.hidden, false);
  assert.equal(errorEl.textContent, 'Enter a positive Length.');
  assert.equal(pillClasses.has('show'), true);
  assert.equal(calls.includes('resize'), false);
  assert.ok(events.includes('focus'));
  assert.ok(events.includes('select'));

  input.value = '';
  input.listeners.blur();

  assert.equal(input.value, '');
  assert.equal(input.readOnly, false);
  assert.equal(errorEl.hidden, false);
  assert.equal(pillClasses.has('show'), true);
  assert.equal(calls.includes('resize'), false);
});

test('canvas Length editor keeps the active unit visible while editing', async () => {
  const { sidebar, lengthEdit } = await loadLengthEditController();
  const events = [];
  const input = createFakeInput(events);
  const pillClasses = new Set();
  const errorEl = { hidden: true, textContent: '', id: 'canvas-length-error' };
  const unitEl = { textContent: '', hidden: true };
  const pill = {
    style: {},
    classList: {
      add(name) { pillClasses.add(name); },
      remove(name) { pillClasses.delete(name); },
      contains(name) { return pillClasses.has(name); },
    },
    querySelector(selector) {
      if (selector === '.length-edit-error') return errorEl;
      if (selector === '.length-edit-unit') return unitEl;
      return null;
    },
  };
  const state = {
    selectedId: null,
    rotateModeId: null,
    measurements: [{ id: 9, page: 1, lengthInches: 24, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] }],
  };
  const calls = [];
  const controller = lengthEdit.createLengthEditController({
    state,
    input,
    pill,
    stage: { getBoundingClientRect: () => ({ left: 10, top: 20 }) },
    sidebarController: sidebar,
    scaleForPage: () => 10,
    formatLength: inches => `${inches / 12}.00`,
    unitLabel: () => 'ft',
    parseLengthInUnit: value => {
      calls.push(`parse:${value}`);
      return 12;
    },
    resizeMeasurementToLength: () => true,
    createHistorySnapshot: () => ({}),
    recordHistory: () => calls.push('history'),
    renderList: () => calls.push('renderList'),
    redraw: () => calls.push('redraw'),
    showStatus: message => calls.push(`status:${message}`),
    syncSidebarSelection: () => {},
    finishPointerDrag: () => calls.push('finishDrag'),
    clearActiveFitMode: () => calls.push('clearFit'),
    setSelectionMode: () => calls.push('selectionMode'),
    imageToScreen: () => ({ x: 100, y: 120 }),
    endRotateMode: () => calls.push('endRotate'),
  });

  assert.equal(controller.openCanvasLengthEdit({ measurementId: 9, x: 20, y: 30, width: 60, height: 20 }), true);

  assert.equal(input.value, '2.00');
  assert.equal(unitEl.textContent, 'ft');
  assert.equal(unitEl.hidden, false);
  assert.equal(input.readOnly, false);

  input.listeners.keydown({
    key: 'Enter',
    stopPropagation() {},
    preventDefault() {},
  });

  assert.ok(calls.includes('parse:2.00'));
});

test('canvas Length editor sanitizes typed and pasted decimal input', async () => {
  const { sidebar, lengthEdit } = await loadLengthEditController();
  const events = [];
  const input = createFakeInput(events);
  const pillClasses = new Set();
  const errorEl = { hidden: true, textContent: '', id: 'canvas-length-error' };
  const unitEl = { textContent: '', hidden: true };
  const pill = {
    style: {},
    classList: {
      add(name) { pillClasses.add(name); },
      remove(name) { pillClasses.delete(name); },
      contains(name) { return pillClasses.has(name); },
    },
    querySelector(selector) {
      if (selector === '.length-edit-error') return errorEl;
      if (selector === '.length-edit-unit') return unitEl;
      return null;
    },
  };
  const state = {
    selectedId: null,
    rotateModeId: null,
    measurements: [{ id: 9, page: 1, lengthInches: 24, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] }],
  };
  const calls = [];
  const controller = lengthEdit.createLengthEditController({
    state,
    input,
    pill,
    stage: { getBoundingClientRect: () => ({ left: 10, top: 20 }) },
    sidebarController: sidebar,
    scaleForPage: () => 10,
    formatLength: inches => `${inches / 12}.00`,
    unitLabel: () => 'ft',
    parseLengthInUnit: value => {
      calls.push(`parse:${value}`);
      return Number(value) > 0 ? 12 : null;
    },
    resizeMeasurementToLength: () => true,
    createHistorySnapshot: () => ({}),
    recordHistory: () => calls.push('history'),
    renderList: () => calls.push('renderList'),
    redraw: () => calls.push('redraw'),
    showStatus: message => calls.push(`status:${message}`),
    syncSidebarSelection: () => {},
    finishPointerDrag: () => calls.push('finishDrag'),
    clearActiveFitMode: () => calls.push('clearFit'),
    setSelectionMode: () => calls.push('selectionMode'),
    imageToScreen: () => ({ x: 100, y: 120 }),
    endRotateMode: () => calls.push('endRotate'),
  });

  assert.equal(controller.openCanvasLengthEdit({ measurementId: 9, x: 20, y: 30, width: 60, height: 20 }), true);

  input.value = 'ft-1,2.3.4abc';
  input.listeners.input();

  assert.equal(input.value, '12.34');
  assert.equal(unitEl.textContent, 'ft');
  assert.equal(unitEl.hidden, false);

  input.value = '000';
  input.listeners.input();

  assert.equal(input.value, '0');
  assert.equal(unitEl.textContent, 'ft');
  assert.equal(unitEl.hidden, false);

  input.value = '05';
  input.listeners.input();

  assert.equal(input.value, '0.5');

  input.value = '0123';
  input.listeners.input();

  assert.equal(input.value, '0.123');

  input.value = '000.05';
  input.listeners.input();

  assert.equal(input.value, '0.05');

  input.value = '01.2';
  input.listeners.input();

  assert.equal(input.value, '0.12');

  input.value = '100';
  input.listeners.input();

  assert.equal(input.value, '100');

  input.value = '0.005';
  input.listeners.input();

  assert.equal(input.value, '0.005');

  input.listeners.keydown({
    key: 'Enter',
    stopPropagation() {},
    preventDefault() {},
  });

  assert.ok(calls.includes('parse:0.005'));
  assert.equal(input.readOnly, true);
});
