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

test('zoom performance log receives base and detail render targets separately', async () => {
  const { controller } = await loadPerformanceController();
  const zoomEvents = [];
  const state = {
    pdf: {},
    pdfPage: 1,
    preRenderQueue: [],
    zoomRenderTimer: null,
    minPdfRenderScale: 2,
    maxPdfRenderScale: 12,
    maxPdfBitmapEdge: 15000,
    baseW: 100,
    baseH: 100,
    zoom: 10,
    panX: 0,
    panY: 0,
    continuousScrollMode: true,
  };
  const perf = controller.createPerformanceController({
    logger: { recordZoom(event) { zoomEvents.push(event); }, recordScroll() {}, recordRender() {} },
    state,
    stage: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    viewerModel: { screenToImagePoint: () => ({ x: 0, y: 0 }) },
    desiredPdfRenderScale: () => 12,
    desiredPdfDetailTileScale: () => 40,
    cacheSet() {},
    cacheHasUsable: () => false,
    renderPdfPage: async () => true,
    showStatus() {},
  });

  const trace = perf.beforeZoom({ clientX: 20, clientY: 30 });
  state.zoom = 20;
  perf.afterZoom(trace, { source: 'wheel', factor: 1.12, point: { clientX: 20, clientY: 30 } });

  assert.equal(zoomEvents[0].targetRenderScale, 12);
  assert.equal(zoomEvents[0].targetDetailRenderScale, 40);
});

test('continuous zoom sharpening uses the detail tile instead of redrawing the full PDF stack', async () => {
  const { controller, timers } = await loadPerformanceController();
  const state = {
    pdf: {},
    pdfPage: 6,
    preRenderQueue: [4, 5, 7],
    zoomRenderTimer: null,
    minPdfRenderScale: 2,
    maxPdfRenderScale: 12,
    maxPdfBitmapEdge: 15000,
    baseW: 100,
    baseH: 100,
    zoom: 20,
    panX: 0,
    panY: 0,
    continuousScrollMode: true,
  };
  const fullStackRenders = [];
  const detailRenders = [];
  const perf = controller.createPerformanceController({
    logger: { recordZoom() {}, recordScroll() {}, recordRender() {} },
    state,
    stage: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    viewerModel: { screenToImagePoint: () => ({ x: 0, y: 0 }) },
    desiredPdfRenderScale: () => 12,
    desiredPdfDetailTileScale: () => 40,
    renderPdfDetailTile: async options => {
      detailRenders.push(options);
      return true;
    },
    cacheSet() {},
    cacheHasUsable: () => false,
    renderPdfPage: async options => {
      fullStackRenders.push(options);
      return true;
    },
    showStatus() {},
  });

  perf.schedulePdfRerenderForZoom();
  timers[0].fn();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(Array.from(state.preRenderQueue), []);
  assert.equal(fullStackRenders.length, 0);
  assert.equal(detailRenders.length, 1);
  assert.equal(detailRenders[0].reason, 'zoom-sharpen-detail');
});
