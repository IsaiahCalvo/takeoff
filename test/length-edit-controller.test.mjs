import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadLengthEditController() {
  const [decimalSource, sidebarSource, lengthSource] = await Promise.all([
    readFile(new URL('../src/app/decimal-input.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sidebar-controller.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/length-edit-controller.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(decimalSource, sandbox, { filename: 'decimal-input.js' });
  vm.runInContext(sidebarSource, sandbox, { filename: 'sidebar-controller.js' });
  vm.runInContext(lengthSource, sandbox, { filename: 'length-edit-controller.js' });
  return {
    sidebar: sandbox.window.TakeoffSidebarController,
    lengthEdit: sandbox.window.TakeoffLengthEditController,
  };
}

function createFakeInput(events, errorEl = null) {
  const attrs = {};
  const classes = new Set();
  const listenersByType = {};
  return {
    value: '',
    dataset: {},
    readOnly: false,
    style: {},
    attrs,
    classes,
    errorEl,
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
    addEventListener(type, handler) {
      listenersByType[type] ||= [];
      listenersByType[type].push(handler);
      this.listeners[type] = event => {
        for (const listener of listenersByType[type]) listener(event);
      };
    },
    listeners: {},
    closest(selector) {
      return selector === '.canvas-length-tag-input' ? this : null;
    },
    parentElement: {
      querySelector(selector) {
        return selector === '.canvas-length-edit-error' ? errorEl : null;
      },
    },
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
  };
}

function createController({
  lengthEdit,
  sidebar,
  state,
  calls,
  parseLengthInUnit = value => (Number(value) > 0 ? 12 : null),
  resizeMeasurementToLength = () => true,
} = {}) {
  return lengthEdit.createLengthEditController({
    state,
    sidebarController: sidebar,
    scaleForPage: () => 10,
    formatLength: inches => `${inches / 12}.00`,
    unitLabel: () => 'ft',
    parseLengthInUnit,
    resizeMeasurementToLength,
    createHistorySnapshot: () => ({}),
    recordHistory: () => calls.push('history'),
    renderList: () => calls.push('renderList'),
    redraw: () => calls.push('redraw'),
    showStatus: message => calls.push(`status:${message}`),
    syncSidebarSelection: () => calls.push('syncSidebar'),
    finishPointerDrag: () => calls.push('finishDrag'),
    clearActiveFitMode: () => calls.push('clearFit'),
    setSelectionMode: () => calls.push('selectionMode'),
    endRotateMode: () => calls.push('endRotate'),
  });
}

test('canvas Length edit state is exposed for the SVG label instead of a fixed overlay', async () => {
  const { sidebar, lengthEdit } = await loadLengthEditController();
  const calls = [];
  const measurement = { id: 9, page: 1, lengthInches: 24 };
  const state = { selectedId: null, rotateModeId: null, measurements: [measurement] };
  const controller = createController({ lengthEdit, sidebar, state, calls });

  assert.equal(controller.openCanvasLengthEdit({ measurementId: 9 }), true);

  assert.equal(state.selectedId, 9);
  assert.equal(controller.activeCanvasLengthEditId(), 9);
  const editState = controller.canvasLengthEditStateForMeasurement(measurement);
  assert.equal(editState.active, true);
  assert.equal(editState.value, '2.00');
  assert.equal(editState.unit, 'ft');
  assert.equal(editState.invalid, false);
  assert.deepEqual(calls, ['finishDrag', 'clearFit', 'selectionMode', 'renderList', 'redraw']);
});

test('canvas Length editor binds to the SVG label input and keeps invalid values in place', async () => {
  const { sidebar, lengthEdit } = await loadLengthEditController();
  const calls = [];
  const measurement = { id: 9, page: 1, lengthInches: 24 };
  const state = { selectedId: null, rotateModeId: null, measurements: [measurement] };
  const controller = createController({
    lengthEdit,
    sidebar,
    state,
    calls,
    parseLengthInUnit: () => null,
  });
  const errorEl = { hidden: true, textContent: '', id: 'canvas-length-error' };
  const events = [];
  const input = createFakeInput(events, errorEl);

  controller.openCanvasLengthEdit({ measurementId: 9 });
  assert.equal(controller.bindActiveCanvasLengthInput(input, { focus: true }), true);
  input.value = 'bad';
  input.listeners.keydown({
    key: 'Enter',
    stopPropagation() { events.push('stop'); },
    preventDefault() { events.push('prevent'); },
  });

  assert.equal(input.value, '');
  assert.equal(controller.canvasLengthEditStateForMeasurement(measurement).value, '');
  assert.equal(input.attrs['aria-invalid'], 'true');
  assert.equal(input.attrs['aria-describedby'], 'canvas-length-error');
  assert.equal(input.classes.has('invalid'), true);
  assert.equal(errorEl.hidden, false);
  assert.equal(errorEl.textContent, 'Enter a positive Length.');
  assert.equal(controller.activeCanvasLengthEditId(), 9);
  assert.ok(events.includes('focus'));
  assert.ok(events.includes('select'));
  assert.equal(calls.includes('history'), false);
});

test('canvas Length editor uses the shared positive decimal sanitizer and commits valid values', async () => {
  const { sidebar, lengthEdit } = await loadLengthEditController();
  const calls = [];
  const measurement = { id: 9, page: 1, lengthInches: 24 };
  const state = { selectedId: null, rotateModeId: null, measurements: [measurement] };
  const controller = createController({
    lengthEdit,
    sidebar,
    state,
    calls,
    parseLengthInUnit: value => {
      calls.push(`parse:${value}`);
      return Number(value) > 0 ? 12 : null;
    },
  });
  const input = createFakeInput([]);

  controller.openCanvasLengthEdit({ measurementId: 9 });
  controller.bindActiveCanvasLengthInput(input, { focus: true });

  input.value = 'ft-1,2.3.4abc';
  input.listeners.input();
  assert.equal(input.value, '12.34');

  input.value = '00';
  input.listeners.input();
  assert.equal(input.value, '0.0');

  input.value = '000';
  input.listeners.input();
  assert.equal(input.value, '0.00');

  input.value = '05';
  input.listeners.input();
  assert.equal(input.value, '0.5');

  input.listeners.keydown({
    key: 'Enter',
    stopPropagation() {},
    preventDefault() {},
  });

  assert.ok(calls.includes('parse:0.5'));
  assert.ok(calls.includes('history'));
  assert.equal(controller.activeCanvasLengthEditId(), null);
});

test('canvas Length edit refuses locked measurements', async () => {
  const { sidebar, lengthEdit } = await loadLengthEditController();
  const calls = [];
  const measurement = { id: 9, page: 1, lengthInches: 24, locked: true };
  const state = { selectedId: null, rotateModeId: null, measurements: [measurement] };
  const controller = createController({ lengthEdit, sidebar, state, calls });

  assert.equal(controller.openCanvasLengthEdit({ measurementId: 9 }), false);

  assert.equal(state.selectedId, null);
  assert.equal(controller.activeCanvasLengthEditId(), null);
  assert.deepEqual(calls, ['status:Unlock this measurement before editing Length.']);
});

test('sidebar Length edit refuses locked measurements', async () => {
  const { sidebar, lengthEdit } = await loadLengthEditController();
  const calls = [];
  const events = [];
  const measurement = { id: 9, page: 1, lengthInches: 24, locked: true };
  const state = { selectedId: null, rotateModeId: null, measurements: [measurement] };
  const controller = createController({ lengthEdit, sidebar, state, calls });
  const input = createFakeInput(events);
  const item = {
    querySelector(selector) {
      if (selector === '.length') return input;
      if (selector === '.length-error') return null;
      return null;
    },
  };

  controller.bindSidebarLengthInput(item, measurement);
  input.listeners.dblclick({ stopPropagation() { events.push('stop'); } });

  assert.equal(state.selectedId, null);
  assert.deepEqual(events, ['stop']);
  assert.deepEqual(calls, ['status:Unlock this measurement before editing Length.']);
});
