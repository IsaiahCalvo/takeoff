import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPdfDetailTile() {
  const source = await readFile(new URL('../src/app/pdf-detail-tile.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'pdf-detail-tile.js' });
  return sandbox.window.TakeoffPdfDetailTile;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('PDF.js detail tiling caps only single-page PDF.js base renders', async () => {
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
    engine: 'pdfium-worker',
    continuousScrollMode: false,
    requestedScale: 6,
    baseMaxScale: 2.5,
  }), 6);
  assert.equal(detailTile.baseRenderScale({
    engine: 'pdfjs',
    continuousScrollMode: true,
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
