import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadUnmergePathModal() {
  const source = await readFile(new URL('../src/app/unmerge-path-modal.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'unmerge-path-modal.js' });
  return sandbox.window.TakeoffUnmergePathModal;
}

function createElements() {
  const listeners = {};
  const elements = {
    unmergePathModal: {
      shown: false,
      classList: {
        add(name) {
          if (name === 'show') elements.unmergePathModal.shown = true;
        },
        remove(name) {
          if (name === 'show') elements.unmergePathModal.shown = false;
        },
      },
    },
    unmergeMaintain: {
      disabled: false,
      addEventListener(event, handler) {
        listeners.unmergeMaintain = { event, handler };
      },
    },
    unmergeMaintainReason: {
      hidden: true,
      textContent: '',
    },
    unmergeOriginal: {
      addEventListener(event, handler) {
        listeners.unmergeOriginal = { event, handler };
      },
    },
    unmergeCancel: {
      addEventListener(event, handler) {
        listeners.unmergeCancel = { event, handler };
      },
    },
  };
  return { elements, listeners, getElement: id => elements[id] };
}

test('open auto-unmerges unchanged merged paths without showing the choice modal', async () => {
  const modalModule = await loadUnmergePathModal();
  const { elements, getElement } = createElements();
  const calls = [];
  const state = {
    selectedId: 7,
    pendingUnmergePathId: null,
    rotateModeId: 7,
    measurements: [{ id: 7, page: 2 }],
  };
  const modal = modalModule.createUnmergePathModal({
    getElement,
    state,
    measurementCommands: {
      unmergePathState() {
        return {
          canUnmergePaths: true,
          canMaintainEdits: true,
          hasMaintainedEdits: false,
          maintainEditsReason: '',
        };
      },
      unmergePaths(measurements, id, options) {
        calls.push(['unmerge', measurements.length, id, options.mode, options.pxPerInch]);
        return {
          unmerged: true,
          measurements: [{ id: 70 }, { id: 71 }],
          measurement: { id: 70 },
        };
      },
    },
    scaleForPage: page => page * 10,
    createHistorySnapshot: () => ({ before: true }),
    setMeasurements: (measurements, selectedId) => calls.push(['set', measurements.length, selectedId]),
    endRotateMode: () => calls.push(['end-rotate']),
    renderList: () => calls.push(['render-list']),
    redraw: () => calls.push(['redraw']),
    recordHistory: (before, label) => calls.push(['history', before.before, label]),
    showStatus: text => calls.push(['status', text]),
  });

  assert.equal(modal.open(), true);

  assert.equal(elements.unmergePathModal.shown, false);
  assert.equal(state.pendingUnmergePathId, null);
  assert.deepEqual(calls, [
    ['unmerge', 1, 7, 'original', 20],
    ['set', 2, 70],
    ['end-rotate'],
    ['history', true, 'path unmerge'],
    ['render-list'],
    ['redraw'],
    ['status', 'Unmerge Paths'],
  ]);
});

test('open still shows the choice modal when maintained edits exist', async () => {
  const modalModule = await loadUnmergePathModal();
  const { elements, getElement } = createElements();
  const state = {
    selectedId: 7,
    pendingUnmergePathId: null,
    measurements: [{ id: 7, page: 2 }],
  };
  const modal = modalModule.createUnmergePathModal({
    getElement,
    state,
    measurementCommands: {
      unmergePathState() {
        return {
          canUnmergePaths: true,
          canMaintainEdits: true,
          hasMaintainedEdits: true,
          maintainEditsReason: '',
        };
      },
    },
    showStatus() {},
  });

  assert.equal(modal.open(), true);

  assert.equal(elements.unmergePathModal.shown, true);
  assert.equal(state.pendingUnmergePathId, 7);
  assert.equal(elements.unmergeMaintain.disabled, false);
  assert.equal(elements.unmergeMaintainReason.hidden, true);
});
