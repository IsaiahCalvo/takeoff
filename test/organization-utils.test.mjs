import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadUtils() {
  const source = await readFile(new URL('../public/organization-utils.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'organization-utils.js' });
  return sandbox.window.TakeoffOrganizationUtils;
}

const measurements = [
  { page: 1, name: 'Main corridor', category: 'Cat6', lengthInches: 120 },
  { page: 1, name: 'Lobby return', category: 'Fiber', lengthInches: 240 },
  { page: 2, name: 'Future path', category: 'Cat6', lengthInches: null },
  { page: 2, name: 'Unnamed scope', category: '', lengthInches: 60 },
];

test('groupByCategory totals scaled measurements and tracks unscaled counts', async () => {
  const utils = await loadUtils();
  const groups = utils.groupByCategory(measurements);

  assert.deepEqual(JSON.parse(JSON.stringify(groups.map(group => group.category))), ['Cat6', 'Fiber', 'Uncategorized']);
  assert.equal(groups[0].totalInches, 120);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].unscaledCount, 1);
  assert.equal(groups[2].category, 'Uncategorized');
});

test('normalizeMeasurementMeta trims optional category and notes fields', async () => {
  const utils = await loadUtils();

  const normalized = utils.normalizeMeasurementMeta({ category: '  Camera ', notes: '  IDF home run  ' });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), {
    category: 'Camera',
    notes: 'IDF home run',
  });
});
