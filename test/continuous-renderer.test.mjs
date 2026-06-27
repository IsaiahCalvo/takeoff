import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadContinuousRenderer() {
  const source = await readFile(new URL('../src/app/continuous-renderer.js', import.meta.url), 'utf8');
  const sandbox = { window: {}, setTimeout: fn => fn() };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'continuous-renderer.js' });
  return sandbox.window.TakeoffContinuousRenderer;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('buildContinuousPageLayout stacks pages in order with centered offsets and gaps', async () => {
  const renderer = await loadContinuousRenderer();

  assert.deepEqual(plain(renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 50 },
    { page: 2, cssWidth: 80, cssHeight: 60 },
    { page: 3, cssWidth: 100, cssHeight: 40 },
  ], { pageGap: 12 })), {
    width: 100,
    height: 174,
    pageGap: 12,
    pages: [
      { page: 1, x: 0, y: 0, width: 100, height: 50 },
      { page: 2, x: 10, y: 62, width: 80, height: 60 },
      { page: 3, x: 0, y: 134, width: 100, height: 40 },
    ],
  });
});

test('continuousRenderScale respects the composite canvas edge limit', async () => {
  const renderer = await loadContinuousRenderer();

  assert.equal(renderer.continuousRenderScale({
    requestedScale: 4,
    layout: { width: 600, height: 5000 },
    maxBitmapEdge: 10000,
  }), 2);
});

test('nearestPageForViewport tracks the page nearest the viewport center', async () => {
  const renderer = await loadContinuousRenderer();
  const layout = renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 100 },
    { page: 2, cssWidth: 100, cssHeight: 100 },
    { page: 3, cssWidth: 100, cssHeight: 100 },
  ], { pageGap: 20 });

  assert.equal(renderer.nearestPageForViewport({ layout, panY: 0, zoom: 1, stageHeight: 150 }), 1);
  assert.equal(renderer.nearestPageForViewport({ layout, panY: -110, zoom: 1, stageHeight: 150 }), 2);
  assert.equal(renderer.nearestPageForViewport({ layout, panY: -235, zoom: 1, stageHeight: 150 }), 3);
});

test('panYForPage returns a viewport pan that brings a page into focus', async () => {
  const renderer = await loadContinuousRenderer();
  const layout = renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 100 },
    { page: 2, cssWidth: 100, cssHeight: 100 },
  ], { pageGap: 20 });

  assert.equal(renderer.panYForPage({ layout, page: 1, zoom: 1, stageHeight: 300 }), 32);
  assert.equal(renderer.panYForPage({ layout, page: 2, zoom: 1, stageHeight: 300 }), -88);
  assert.equal(renderer.panYForPage({ layout, page: 99, zoom: 1, stageHeight: 300 }), null);
});

test('fitTransformForPage fits the active continuous page instead of the full stack', async () => {
  const renderer = await loadContinuousRenderer();
  const layout = renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 200 },
    { page: 2, cssWidth: 100, cssHeight: 200 },
  ], { pageGap: 20 });

  assert.equal(typeof renderer.fitTransformForPage, 'function');
  assert.deepEqual(plain(renderer.fitTransformForPage({
    layout,
    page: 2,
    stageWidth: 500,
    stageHeight: 300,
    fitMode: 'page',
  })), {
    zoom: 1.34,
    panX: 183,
    panY: -278.8,
  });
});

test('pageRenderBounds uses page dimensions instead of stacked document height', async () => {
  const renderer = await loadContinuousRenderer();
  const layout = renderer.buildContinuousPageLayout(Array.from({ length: 50 }, (_, index) => ({
    page: index + 1,
    cssWidth: 600,
    cssHeight: 800,
  })));

  assert.deepEqual(plain(renderer.pageRenderBounds(layout)), {
    width: 600,
    height: 800,
  });
  assert.equal(layout.height > 40000, true);
});

test('continuous layout maps stack points to page-local points and back', async () => {
  const renderer = await loadContinuousRenderer();
  const layout = renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 50 },
    { page: 2, cssWidth: 80, cssHeight: 60 },
  ], { pageGap: 10 });

  assert.deepEqual(plain(renderer.stackPointToPagePoint(layout, { x: 20, y: 75 })), {
    page: 2,
    point: { x: 10, y: 15 },
    pageBox: { page: 2, x: 10, y: 60, width: 80, height: 60 },
  });
  assert.deepEqual(plain(renderer.pagePointToStackPoint(layout, 2, { x: 10, y: 15 })), { x: 20, y: 75 });
  assert.equal(renderer.stackPointToPagePoint(layout, { x: 5, y: 55 }), null);
});

test('measurementToStackMeasurement offsets page-owned line and freehand geometry', async () => {
  const renderer = await loadContinuousRenderer();
  const layout = renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 50 },
    { page: 2, cssWidth: 80, cssHeight: 60 },
  ], { pageGap: 10 });
  const source = {
    id: 7,
    page: 2,
    points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    segments: [{ from: { x: 1, y: 2 }, c1: { x: 2, y: 2 }, c2: { x: 3, y: 3 }, to: { x: 4, y: 4 } }],
    rotationFrame: { x: 0, y: 1, cx: 2, cy: 3, width: 4, height: 5 },
  };

  const stacked = renderer.measurementToStackMeasurement(source, layout);
  assert.deepEqual(plain(stacked.points), [{ x: 11, y: 62 }, { x: 13, y: 64 }]);
  assert.deepEqual(plain(stacked.segments[0].to), { x: 14, y: 64 });
  assert.deepEqual(plain(stacked.rotationFrame), { x: 10, y: 61, cx: 12, cy: 63, width: 4, height: 5 });
  assert.deepEqual(plain(source.points[0]), { x: 1, y: 2 });
});

test('measurementToStackMeasurement offsets semantic circle and arc centers', async () => {
  const renderer = await loadContinuousRenderer();
  const layout = renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 50 },
    { page: 2, cssWidth: 80, cssHeight: 60 },
  ], { pageGap: 10 });
  const circle = {
    id: 11,
    page: 2,
    drawType: 'circle',
    points: [{ x: 20, y: 10 }, { x: 30, y: 10 }],
    circle: { center: { x: 20, y: 10 }, radius: 10 },
  };
  const arc = {
    id: 12,
    page: 2,
    drawType: 'arc',
    points: [{ x: 30, y: 10 }, { x: 20, y: 20 }],
    arc: { center: { x: 20, y: 10 }, radius: 10, startAngle: 0, sweep: Math.PI / 2 },
  };

  const stackedCircle = renderer.measurementToStackMeasurement(circle, layout);
  const stackedArc = renderer.measurementToStackMeasurement(arc, layout);

  assert.deepEqual(plain(stackedCircle.circle), { center: { x: 30, y: 70 }, radius: 10 });
  assert.deepEqual(plain(stackedCircle.points), [{ x: 30, y: 70 }, { x: 40, y: 70 }]);
  assert.deepEqual(plain(stackedArc.arc.center), { x: 30, y: 70 });
  assert.equal(stackedArc.arc.radius, 10);
  assert.deepEqual(plain(stackedArc.points), [{ x: 40, y: 70 }, { x: 30, y: 80 }]);
  assert.deepEqual(plain(circle.circle.center), { x: 20, y: 10 });
});

test('measurementToStackMeasurement offsets mixed source geometry without mutating stored merge memory', async () => {
  const renderer = await loadContinuousRenderer();
  const layout = renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 50 },
    { page: 2, cssWidth: 80, cssHeight: 60 },
  ], { pageGap: 10 });
  const source = {
    id: 8,
    page: 2,
    drawType: 'path',
    shape: { active: 'path' },
    points: [{ x: 1, y: 2 }, { x: 20, y: 2 }],
    mergeMemory: {
      version: 1,
      sources: [{
        kind: 'line',
        current: { points: [{ x: 1, y: 2 }, { x: 10, y: 2 }], segments: null },
        boundary: { points: [{ x: 1, y: 2 }, { x: 10, y: 2 }], lengthPx: 9 },
        original: {
          points: [{ x: 1, y: 2 }, { x: 10, y: 2 }],
          shape: { active: 'line' },
        },
      }, {
        kind: 'freehand',
        current: {
          points: [{ x: 10, y: 2 }, { x: 20, y: 2 }],
          segments: [{ from: { x: 10, y: 2 }, c1: { x: 13, y: 2 }, c2: { x: 17, y: 2 }, to: { x: 20, y: 2 } }],
        },
        boundary: { points: [{ x: 10, y: 2 }, { x: 20, y: 2 }], lengthPx: 10 },
        original: {
          points: [{ x: 10, y: 2 }, { x: 20, y: 2 }],
          segments: [{ from: { x: 10, y: 2 }, c1: { x: 13, y: 2 }, c2: { x: 17, y: 2 }, to: { x: 20, y: 2 } }],
          shape: { active: 'freehand' },
        },
      }],
    },
  };

  const stacked = renderer.measurementToStackMeasurement(source, layout);

  assert.notEqual(stacked.mergeMemory, source.mergeMemory);
  assert.deepEqual(plain(stacked.points), [{ x: 11, y: 62 }, { x: 30, y: 62 }]);
  assert.deepEqual(plain(stacked.mergeMemory.sources[0].current.points), [{ x: 11, y: 62 }, { x: 20, y: 62 }]);
  assert.deepEqual(plain(stacked.mergeMemory.sources[1].current.segments[0].from), { x: 20, y: 62 });
  assert.deepEqual(plain(stacked.mergeMemory.sources[1].current.segments[0].to), { x: 30, y: 62 });
  assert.deepEqual(plain(stacked.mergeMemory.sources[0].original.points), [{ x: 11, y: 62 }, { x: 20, y: 62 }]);
  assert.deepEqual(plain(stacked.mergeMemory.sources[1].original.segments[0].to), { x: 30, y: 62 });
  assert.deepEqual(plain(source.mergeMemory.sources[0].current.points), [{ x: 1, y: 2 }, { x: 10, y: 2 }]);
  assert.deepEqual(plain(source.mergeMemory.sources[1].current.segments[0].to), { x: 20, y: 2 });
  assert.deepEqual(plain(source.mergeMemory.sources[0].original.points), [{ x: 1, y: 2 }, { x: 10, y: 2 }]);
});

test('renderContinuousPdf reuses cache entries and paints one composite canvas', async () => {
  const renderer = await loadContinuousRenderer();
  const calls = [];
  const canvas = { width: 0, height: 0, style: {} };
  const context = {
    calls,
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    save: () => calls.push(['save']),
    scale: (...args) => calls.push(['scale', ...args]),
    drawImage: (...args) => calls.push(['drawImage', args[0].id, ...args.slice(1)]),
    strokeRect: (...args) => calls.push(['strokeRect', ...args]),
    restore: () => calls.push(['restore']),
    set strokeStyle(value) { calls.push(['strokeStyle', value]); },
    set lineWidth(value) { calls.push(['lineWidth', value]); },
  };
  const cached = { canvas: { id: 'cached-1' }, cssWidth: 100, cssHeight: 50 };
  const rendered = { canvas: { id: 'rendered-2' }, cssWidth: 100, cssHeight: 60 };

  const result = await renderer.renderContinuousPdf({
    pageCount: 2,
    requestedScale: 2,
    maxBitmapEdge: 1000,
    cacheGet: page => page === 1 ? cached : null,
    renderPage: async (page, scale) => {
      calls.push(['renderPage', page, scale]);
      return rendered;
    },
    isCurrent: () => true,
    canvas,
    context,
    configureCanvasCssSize: (target, width, height) => {
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;
    },
  });

  assert.deepEqual(plain(result.layout.pages.map(page => page.page)), [1, 2]);
  assert.equal(canvas.width, 200);
  assert.equal(canvas.height, 268);
  assert.equal(canvas.style.width, '100px');
  assert.equal(canvas.style.height, '134px');
  assert.deepEqual(calls.filter(call => call[0] === 'renderPage'), [['renderPage', 2, 2]]);
  assert.deepEqual(calls.filter(call => call[0] === 'drawImage'), [
    ['drawImage', 'cached-1', 0, 0, 100, 50],
    ['drawImage', 'rendered-2', 0, 74, 100, 60],
  ]);
  assert.deepEqual(calls.filter(call => call[0] === 'strokeRect'), []);
});

test('renderContinuousPdf can stack only the requested actual PDF pages', async () => {
  const renderer = await loadContinuousRenderer();
  const calls = [];
  const canvas = { width: 0, height: 0, style: {} };
  const context = {
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    save: () => calls.push(['save']),
    scale: (...args) => calls.push(['scale', ...args]),
    drawImage: (...args) => calls.push(['drawImage', args[0].id, ...args.slice(1)]),
    restore: () => calls.push(['restore']),
  };

  const result = await renderer.renderContinuousPdf({
    pageCount: 8,
    pages: [5, 6],
    requestedScale: 2,
    maxBitmapEdge: 1000,
    cacheGet: () => null,
    renderPage: async (page, scale) => {
      calls.push(['renderPage', page, scale]);
      return { canvas: { id: `rendered-${page}` }, cssWidth: 100, cssHeight: 50 + page };
    },
    isCurrent: () => true,
    canvas,
    context,
    configureCanvasCssSize: (target, width, height) => {
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;
    },
  });

  assert.deepEqual(plain(result.layout.pages.map(page => page.page)), [5, 6]);
  assert.deepEqual(calls.filter(call => call[0] === 'renderPage'), [
    ['renderPage', 5, 2],
    ['renderPage', 6, 2],
  ]);
  assert.deepEqual(calls.filter(call => call[0] === 'drawImage'), [
    ['drawImage', 'rendered-5', 0, 0, 100, 55],
    ['drawImage', 'rendered-6', 0, 79, 100, 56],
  ]);
});

test('renderContinuousPdf paints individual page canvases when a page layer is supplied', async () => {
  const renderer = await loadContinuousRenderer();
  const calls = [];
  const canvas = { width: 0, height: 0, style: {} };
  const context = {
    calls,
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    save: () => calls.push(['save']),
    scale: (...args) => calls.push(['scale', ...args]),
    drawImage: (...args) => calls.push(['drawImage', args[0].id, ...args.slice(1)]),
    strokeRect: (...args) => calls.push(['strokeRect', ...args]),
    restore: () => calls.push(['restore']),
    set strokeStyle(value) { calls.push(['strokeStyle', value]); },
    set lineWidth(value) { calls.push(['lineWidth', value]); },
  };
  const pageLayer = {
    hidden: true,
    style: {},
    children: [],
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); },
  };
  const cached = { canvas: { id: 'cached-1', style: {} }, cssWidth: 100, cssHeight: 50 };
  const rendered = { canvas: { id: 'rendered-2', style: {} }, cssWidth: 100, cssHeight: 60 };

  const result = await renderer.renderContinuousPdf({
    pageCount: 2,
    requestedScale: 2,
    maxBitmapEdge: 1000,
    cacheGet: page => page === 1 ? cached : null,
    renderPage: async () => rendered,
    isCurrent: () => true,
    canvas,
    context,
    pageLayer,
    configureCanvasCssSize: (target, width, height) => {
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;
    },
  });

  assert.equal(result.renderScale, 2);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
  assert.equal(canvas.style.display, 'none');
  assert.equal(pageLayer.hidden, false);
  assert.equal(pageLayer.style.width, '100px');
  assert.equal(pageLayer.style.height, '134px');
  assert.deepEqual(pageLayer.children.map(child => child.id), ['cached-1', 'rendered-2']);
  assert.equal(cached.canvas.style.left, '0px');
  assert.equal(rendered.canvas.style.top, '74px');
  assert.deepEqual(calls.filter(call => call[0] === 'drawImage'), []);
});

test('paintContinuousPageShells exposes a full continuous layout before offscreen pages render', async () => {
  const renderer = await loadContinuousRenderer();
  const canvas = { width: 640, height: 480, style: { display: 'block' } };
  const context = { clearRect: (...args) => calls.push(['clearRect', ...args]) };
  const calls = [];
  const pageLayer = {
    hidden: true,
    style: {},
    children: [],
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); },
  };
  const rendered = { canvas: { id: 'page-1', style: {}, dataset: {} }, cssWidth: 100, cssHeight: 50 };
  const layout = renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 50 },
    { page: 2, cssWidth: 100, cssHeight: 50 },
    { page: 3, cssWidth: 100, cssHeight: 50 },
  ], { pageGap: 10 });
  const placeholders = [];

  const painted = renderer.paintContinuousPageShells({
    layer: pageLayer,
    canvas,
    context,
    entries: [{ ...rendered, page: 1 }],
    layout,
    activate: true,
    createPlaceholder: page => {
      const placeholder = { id: `placeholder-${page.page}`, style: {}, dataset: {} };
      placeholders.push(placeholder);
      return placeholder;
    },
  });

  assert.equal(painted, true);
  assert.equal(pageLayer.hidden, false);
  assert.equal(pageLayer.children.length, 3);
  assert.equal(pageLayer.children[0].id, 'page-1');
  assert.deepEqual(pageLayer.children.slice(1).map(child => child.id), ['placeholder-2', 'placeholder-3']);
  assert.deepEqual(placeholders.map(child => child.dataset.rendered), ['false', 'false']);
  assert.equal(rendered.canvas.dataset.rendered, 'true');
  assert.equal(pageLayer.children[1].style.top, '60px');
  assert.equal(pageLayer.children[2].style.top, '120px');
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
  assert.equal(canvas.style.display, 'none');
  assert.deepEqual(calls, [['clearRect', 0, 0, 1, 1]]);
});

test('buildContinuousShellLayout uses per-page metadata for unrendered placeholders', async () => {
  const renderer = await loadContinuousRenderer();

  const layout = renderer.buildContinuousShellLayout({
    pages: [1, 2, 3],
    entries: [{ page: 1, cssWidth: 100, cssHeight: 50 }],
    pageInfos: [
      { pageNumber: 2, cssWidth: 80, cssHeight: 120 },
      { pageNumber: 3, cssWidth: 140, cssHeight: 70 },
    ],
    pageGap: 10,
  });

  assert.deepEqual(plain(layout.pages), [
    { page: 1, x: 20, y: 0, width: 100, height: 50 },
    { page: 2, x: 30, y: 60, width: 80, height: 120 },
    { page: 3, x: 0, y: 190, width: 140, height: 70 },
  ]);
  assert.equal(layout.width, 140);
  assert.equal(layout.height, 260);
});

test('renderContinuousPdf can prewarm a hidden page layer without touching the active canvas', async () => {
  const renderer = await loadContinuousRenderer();
  const canvas = { width: 640, height: 480, style: { display: 'block', width: '640px', height: '480px' } };
  const context = {
    clearRect: () => { throw new Error('prewarm should not clear the active canvas'); },
    save: () => { throw new Error('prewarm should not paint the active canvas'); },
    scale: () => {},
    drawImage: () => {},
    strokeRect: () => {},
    restore: () => {},
  };
  const pageLayer = {
    hidden: true,
    style: {},
    children: [],
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); },
  };
  const cached = { canvas: { id: 'cached-1', style: {} }, cssWidth: 100, cssHeight: 50 };
  const rendered = { canvas: { id: 'rendered-2', style: {} }, cssWidth: 100, cssHeight: 60 };

  const result = await renderer.renderContinuousPdf({
    pageCount: 2,
    requestedScale: 2,
    maxBitmapEdge: 1000,
    cacheGet: page => page === 1 ? cached : null,
    renderPage: async () => rendered,
    isCurrent: () => true,
    canvas,
    context,
    pageLayer,
    activatePageLayer: false,
    configureCanvasCssSize: () => { throw new Error('prewarm should not resize the active canvas'); },
  });

  assert.equal(result.renderScale, 2);
  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 480);
  assert.equal(canvas.style.display, 'block');
  assert.equal(canvas.style.width, '640px');
  assert.equal(canvas.style.height, '480px');
  assert.equal(pageLayer.hidden, true);
  assert.deepEqual(pageLayer.children.map(child => child.id), ['cached-1', 'rendered-2']);
});
