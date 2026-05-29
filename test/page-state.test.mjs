import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPageState() {
  const source = await readFile(new URL('../src/app/page-state.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'page-state.js' });
  return sandbox.window.TakeoffPageState;
}

test('reports current and total pages for PDFs and single-page images', async () => {
  const pages = await loadPageState();

  assert.equal(pages.currentPage({ pdf: {}, pdfPage: 7 }), 7);
  assert.equal(pages.totalPages({ pdf: {}, pdfPages: 12 }), 12);
  assert.equal(pages.documentPageCount({ pdf: {}, pdfPages: 12, baseW: 500 }), 12);

  assert.equal(pages.currentPage({ pdf: null, pdfPage: 7 }), 1);
  assert.equal(pages.totalPages({ pdf: null, pdfPages: 12 }), 1);
  assert.equal(pages.documentPageCount({ pdf: null, baseW: 500 }), 1);
  assert.equal(pages.documentPageCount({ pdf: null, baseW: 0 }), 0);
});

test('filters measurements to the active page', async () => {
  const pages = await loadPageState();
  const measurements = [{ id: 1, page: 1 }, { id: 2, page: 2 }];

  assert.deepEqual(
    JSON.parse(JSON.stringify(pages.measurementsForCurrentPage({ pdf: {}, pdfPage: 2 }, measurements))),
    [{ id: 2, page: 2 }]
  );
});
