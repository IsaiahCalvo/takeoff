import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPerformanceLogger({ fetchImpl = async () => ({ ok: true, json: async () => ({ saved: '/tmp/log.json' }) }) } = {}) {
  const source = await readFile(new URL('../src/app/performance-logger.js', import.meta.url), 'utf8');
  const sandbox = {
    window: {},
    fetch: fetchImpl,
    Blob: class {
      constructor(parts, options) {
        this.parts = parts;
        this.type = options?.type || '';
      }
    },
    URL: {
      createObjectURL() { return 'blob:takeoff-log'; },
      revokeObjectURL() {},
    },
    document: {
      createElement(tagName) {
        assert.equal(tagName, 'a');
        return { click() {}, remove() {} };
      },
      body: { appendChild() {} },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'performance-logger.js' });
  return sandbox.window.TakeoffPerformanceLogger;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('performance logger records zoom direction, rate, and cursor anchor error', async () => {
  const logger = await loadPerformanceLogger();
  const perf = logger.createPerformanceLogger({
    now: (() => {
      const values = [1000, 1250];
      return () => values.shift() ?? 1250;
    })(),
    dateNow: () => new Date('2026-06-01T12:00:00.000Z'),
  });

  perf.recordZoom({
    source: 'wheel',
    direction: 'in',
    factor: 1.12,
    before: { zoom: 1, panX: 0, panY: 0 },
    after: { zoom: 1.12, panX: -12, panY: -24 },
    cursor: { clientX: 100, clientY: 200 },
    anchorBefore: { x: 50, y: 75 },
    anchorAfter: { x: 50.2, y: 74.9 },
    targetRenderScale: 2.24,
    targetDetailRenderScale: 6.72,
  });
  perf.recordZoom({
    source: 'button',
    direction: 'out',
    factor: 0.8,
    before: { zoom: 1.12, panX: -12, panY: -24 },
    after: { zoom: 0.896, panX: 8, panY: 12 },
    cursor: { clientX: 400, clientY: 300 },
    anchorBefore: { x: 80, y: 90 },
    anchorAfter: { x: 80, y: 90 },
    targetRenderScale: 2,
  });

  const payload = perf.buildPayload();

  assert.equal(payload.summary.zoom.count, 2);
  assert.equal(payload.summary.zoom.inCount, 1);
  assert.equal(payload.summary.zoom.outCount, 1);
  assert.equal(payload.events[0].kind, 'zoom');
  assert.equal(payload.events[0].direction, 'in');
  assert.equal(payload.events[0].targetDetailRenderScale, 6.72);
  assert.equal(payload.events[1].eventsPerSecond, 4);
  assert.deepEqual(plain(payload.events[0].cursorCentric), {
    anchorBefore: { x: 50, y: 75 },
    anchorAfter: { x: 50.2, y: 74.9 },
    anchorErrorPx: 0.224,
    preserved: true,
  });
});

test('performance logger records scroll input rate and reflected pan/page response', async () => {
  const logger = await loadPerformanceLogger();
  const perf = logger.createPerformanceLogger({
    now: (() => {
      const values = [3000, 3050];
      return () => values.shift() ?? 3050;
    })(),
    dateNow: () => new Date('2026-06-01T12:00:01.000Z'),
  });

  perf.recordScroll({
    source: 'wheel',
    deltaX: 12,
    deltaY: 48,
    before: { panX: 0, panY: 0, page: 1 },
    after: { panX: -12, panY: -48, page: 2 },
    continuous: true,
  });
  perf.recordScroll({
    source: 'wheel',
    deltaX: 0,
    deltaY: 24,
    before: { panX: -12, panY: -48, page: 2 },
    after: { panX: -12, panY: -72, page: 2 },
    continuous: true,
  });

  const payload = perf.buildPayload();

  assert.equal(payload.summary.scroll.count, 2);
  assert.equal(payload.summary.scroll.maxEventsPerSecond, 20);
  assert.equal(payload.events[0].inputReflected, true);
  assert.equal(payload.events[0].pageBefore, 1);
  assert.equal(payload.events[0].pageAfter, 2);
  assert.equal(payload.events[1].scrollPixelsPerSecond, 480);
});

test('performance logger attaches current PDF, page, and render engine context to saved events', async () => {
  const logger = await loadPerformanceLogger();
  const perf = logger.createPerformanceLogger({
    now: (() => {
      const values = [5000, 5080];
      return () => values.shift() ?? 5080;
    })(),
    dateNow: () => new Date('2026-06-01T12:00:02.000Z'),
  });

  perf.setContext({
    fileName: 'SE-011 Security Shop Drawing.pdf',
    page: 2,
    pageCount: 12,
    renderEngine: 'pdfjs',
  });
  perf.recordZoom({
    source: 'wheel',
    direction: 'in',
    factor: 1.12,
    before: { zoom: 1, panX: 0, panY: 0 },
    after: { zoom: 1.12, panX: -10, panY: -20 },
    cursor: { clientX: 100, clientY: 100 },
    anchorBefore: { x: 50, y: 50 },
    anchorAfter: { x: 50, y: 50 },
    targetRenderScale: 2.24,
  });

  perf.setContext({ page: 3, renderEngine: 'pdfjs' });
  perf.recordScroll({
    source: 'wheel',
    deltaX: 0,
    deltaY: 120,
    before: { panX: 0, panY: 0, page: 2 },
    after: { panX: 0, panY: -120, page: 3 },
    continuous: true,
  });

  const payload = perf.buildPayload();

  assert.deepEqual(plain(payload.context), {
    fileName: 'SE-011 Security Shop Drawing.pdf',
    page: 3,
    pageCount: 12,
    renderEngine: 'pdfjs',
  });
  assert.deepEqual(plain(payload.events[0].context), {
    fileName: 'SE-011 Security Shop Drawing.pdf',
    page: 2,
    pageCount: 12,
    renderEngine: 'pdfjs',
  });
  assert.deepEqual(plain(payload.events[1].context), {
    fileName: 'SE-011 Security Shop Drawing.pdf',
    page: 3,
    pageCount: 12,
    renderEngine: 'pdfjs',
  });
});

test('performance logger records periodic FPS samples with active context', async () => {
  const logger = await loadPerformanceLogger();
  const perf = logger.createPerformanceLogger({
    now: () => 1600,
    dateNow: () => new Date('2026-06-01T12:00:03.000Z'),
  });

  perf.setContext({ fileName: 'sample.pdf', page: 1, renderEngine: 'pdfjs' });
  perf.recordFrameSample(1000);
  perf.recordFrameSample(1016);
  perf.recordFrameSample(1532);

  const payload = perf.buildPayload();
  const fpsEvent = payload.events.find(event => event.kind === 'fps');

  assert.equal(payload.summary.frameRate.samples, 2);
  assert.equal(fpsEvent.fps, 1.938);
  assert.equal(fpsEvent.averageFps, 32.219);
  assert.equal(fpsEvent.context.fileName, 'sample.pdf');
  assert.equal(fpsEvent.context.renderEngine, 'pdfjs');
});

test('performance logger saves chronological timestamped logs to the local dev endpoint', async () => {
  const requests = [];
  const logger = await loadPerformanceLogger({
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ saved: '/Users/isaiahcalvo/Documents/Takeoff/Logs/takeoff-performance-2026-06-01_08-05-06.json' }) };
    },
  });
  const perf = logger.createPerformanceLogger({
    now: () => 4000,
    dateNow: () => new Date('2026-06-01T08:05:06.000Z'),
  });

  perf.recordRender({ phase: 'start', reason: 'zoom-sharpen', page: 1, scale: 3 });
  const result = await perf.save();

  assert.equal(requests[0].url, '/__takeoff_logs');
  assert.equal(requests[0].body.filename, 'takeoff-performance-2026-06-01_08-05-06.json');
  assert.equal(requests[0].body.payload.events[0].kind, 'render');
  assert.deepEqual(plain(result), {
    method: 'local-endpoint',
    path: '/Users/isaiahcalvo/Documents/Takeoff/Logs/takeoff-performance-2026-06-01_08-05-06.json',
  });
});
