import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPerformanceController() {
  const source = await readFile(new URL('../src/app/performance-controller.js', import.meta.url), 'utf8');
  const timers = [];
  const sandbox = {
    window: {},
    performance: { now: () => 1000 },
    setTimeout(fn, ms) {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'performance-controller.js' });
  return { controller: sandbox.window.TakeoffPerformanceController, timers };
}

test('zoom sharpening cancels queued background pre-render before scheduling the current page', async () => {
  const { controller, timers } = await loadPerformanceController();
  const state = {
    pdf: {},
    pdfPage: 1,
    preRenderQueue: [2, 3, 4],
    zoomRenderTimer: null,
    minPdfRenderScale: 2,
    maxPdfRenderScale: 12,
    maxPdfBitmapEdge: 15000,
    baseW: 100,
    baseH: 100,
    zoom: 3,
    panX: 0,
    panY: 0,
    continuousScrollMode: false,
  };
  const renderCalls = [];
  const perf = controller.createPerformanceController({
    logger: { recordZoom() {}, recordScroll() {}, recordRender() {} },
    state,
    stage: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    viewerModel: { screenToImagePoint: () => ({ x: 0, y: 0 }) },
    desiredPdfRenderScale: () => 3,
    cacheSet() {},
    cacheHasUsable: () => false,
    renderPdfPage: async options => {
      renderCalls.push(options);
      return true;
    },
    showStatus() {},
  });

  perf.schedulePdfRerenderForZoom();

  assert.deepEqual(Array.from(state.preRenderQueue), []);
  assert.equal(timers[0].ms, 240);
  timers[0].fn();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(renderCalls[0].reason, 'zoom-sharpen');
  assert.equal(renderCalls[0].minRenderScale, 3);
  assert.equal(renderCalls[0].preRender, false);
});
