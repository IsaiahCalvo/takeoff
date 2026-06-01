import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPdfDetailTile() {
  const source = await readFile(new URL('../src/app/pdf-detail-tile.js', import.meta.url), 'utf8');
  const sandbox = { window: {}, performance: { now: () => 1000 }, clearTimeout() {}, setTimeout() {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'pdf-detail-tile.js' });
  return sandbox.window.TakeoffPdfDetailTile;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('PDF.js detail tiling caps PDF.js base renders in single page and continuous modes', async () => {
  const detailTile = await loadPdfDetailTile();

  assert.equal(detailTile.shouldUseDetailTile({
    engine: 'pdfjs',
    continuousScrollMode: false,
    requestedScale: 6,
    baseMaxScale: 2.5,
  }), true);
  assert.equal(detailTile.baseRenderScale({
    engine: 'pdfjs',
    continuousScrollMode: false,
    requestedScale: 6,
    baseMaxScale: 2.5,
  }), 2.5);
  assert.equal(detailTile.baseRenderScale({
    engine: 'pdfjs',
    continuousScrollMode: true,
    requestedScale: 6,
    baseMaxScale: 2.5,
  }), 2.5);
  assert.equal(detailTile.baseRenderScale({
    engine: 'pdfium-worker',
    continuousScrollMode: false,
    requestedScale: 6,
    baseMaxScale: 2.5,
  }), 6);
});

test('visibleTileRect maps the visible viewport into page coordinates', async () => {
  const detailTile = await loadPdfDetailTile();

  assert.deepEqual(plain(detailTile.visibleTileRect({
    stageRect: { left: 0, top: 0, right: 500, bottom: 400 },
    viewportRect: { left: -100, top: -50, width: 1000, height: 800 },
    baseWidth: 1000,
    baseHeight: 800,
    overscanPx: 0,
  })), {
    sourceX: 100,
    sourceY: 50,
    width: 500,
    height: 400,
  });

  assert.equal(detailTile.visibleTileRect({
    stageRect: { left: 0, top: 0, right: 500, bottom: 400 },
    viewportRect: { left: 700, top: 500, width: 100, height: 100 },
    baseWidth: 1000,
    baseHeight: 800,
    overscanPx: 0,
  }), null);
});

test('visiblePageTileRect maps a continuous page viewport into page and stack coordinates', async () => {
  const detailTile = await loadPdfDetailTile();

  assert.deepEqual(plain(detailTile.visiblePageTileRect({
    stageRect: { left: 0, top: 0, right: 500, bottom: 700 },
    viewportRect: { left: -200, top: -300, width: 1000, height: 1200 },
    pageBox: { page: 2, x: 50, y: 300, width: 400, height: 300 },
    baseWidth: 500,
    baseHeight: 600,
    overscanPx: 0,
  })), {
    page: 2,
    sourceX: 50,
    sourceY: 0,
    width: 250,
    height: 200,
    stackX: 100,
    stackY: 300,
  });
});

test('detail tile renderer uses screen-DPR scale instead of capped base scale', async () => {
  const detailTile = await loadPdfDetailTile();
  const calls = [];
  const detailCanvas = {
    width: 0,
    height: 0,
    style: {},
    dataset: {},
    getContext: () => ({ clearRect() {}, drawImage() {} }),
  };
  const state = {
    pdfPage: 1,
    baseW: 100,
    baseH: 100,
    continuousScrollMode: false,
    pdf: {
      engine: 'pdfjs',
      async renderPageTile(page, options) {
        calls.push({ page, options });
        return {
          canvas: { width: options.width * options.scale, height: options.height * options.scale },
          cssX: options.sourceX,
          cssY: options.sourceY,
          cssWidth: options.width,
          cssHeight: options.height,
          renderScale: options.scale,
          engine: 'pdfjs-detail-tile',
        };
      },
    },
  };
  const controller = detailTile.createPdfDetailTileController({
    state,
    stage: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100 }) },
    viewport: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    detailCanvas,
    logger: { recordRender() {} },
    desiredPdfRenderScale: () => 12,
    desiredPdfDetailTileScale: () => 40,
  });

  assert.equal(await controller.renderNow({ reason: 'test-detail' }), true);
  assert.equal(calls[0].options.scale, 40);
  assert.equal(detailCanvas.dataset.renderScale, '40');
});
