import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPdfPageCache() {
  const source = await readFile(new URL('../public/app/pdf-page-cache.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'pdf-page-cache.js' });
  return sandbox.window.TakeoffPdfPageCache;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('desiredRenderScale respects PDF state, zoom, DPR cap, bitmap edge cap, and max scale', async () => {
  const cache = await loadPdfPageCache();

  assert.equal(cache.desiredRenderScale({
    hasPdf: false,
    zoom: 10,
    devicePixelRatio: 3,
    minRenderScale: 2,
    maxRenderScale: 12,
    maxBitmapEdge: 15000,
    baseWidth: 1000,
    baseHeight: 1000,
  }), 1);

  assert.equal(cache.desiredRenderScale({
    hasPdf: true,
    zoom: 4,
    devicePixelRatio: 3,
    minRenderScale: 2,
    maxRenderScale: 12,
    maxBitmapEdge: 15000,
    baseWidth: 1000,
    baseHeight: 1000,
  }), 8);

  assert.equal(cache.desiredRenderScale({
    hasPdf: true,
    zoom: 10,
    devicePixelRatio: 2,
    minRenderScale: 2,
    maxRenderScale: 12,
    maxBitmapEdge: 15000,
    baseWidth: 2000,
    baseHeight: 5000,
  }), 3);
});

test('cached page lookup touches usable entries and rejects stale render scale', async () => {
  const pageCache = await loadPdfPageCache();
  const cache = new Map([
    [1, { renderScale: 2, label: 'one' }],
    [2, { renderScale: 4, label: 'two' }],
  ]);

  assert.equal(pageCache.hasUsableCachedPage(cache, 1, 2.005), true);
  assert.equal(pageCache.hasUsableCachedPage(cache, 1, 2.02), false);
  assert.equal(pageCache.getCachedPage(cache, 1, 2.02), null);
  assert.equal(pageCache.getCachedPage(cache, 1, 2.005).label, 'one');
  assert.deepEqual([...cache.keys()], [2, 1]);
});

test('setCachedPage keeps higher quality entries and evicts least-recent non-current pages', async () => {
  const pageCache = await loadPdfPageCache();
  const cache = new Map([
    [1, { renderScale: 2 }],
    [2, { renderScale: 2 }],
    [3, { renderScale: 5 }],
  ]);

  pageCache.setCachedPage(cache, 3, { renderScale: 3 }, { maxEntries: 3, currentPage: 3 });
  assert.equal(cache.get(3).renderScale, 5);

  pageCache.setCachedPage(cache, 4, { renderScale: 2 }, { maxEntries: 3, currentPage: 3 });

  assert.deepEqual([...cache.keys()], [2, 3, 4]);
  assert.equal(cache.has(1), false);
  assert.equal(cache.has(3), true);
});

test('planPreRenderPages prioritizes nearest neighbors and skips cached usable pages', async () => {
  const pageCache = await loadPdfPageCache();
  const cache = new Map([
    [2, { renderScale: 3 }],
    [4, { renderScale: 1 }],
  ]);

  assert.deepEqual(plain(pageCache.planPreRenderPages({
    currentPage: 3,
    pageCount: 6,
    cache,
    targetScale: 2,
  })), [4, 5, 1, 6]);
});
