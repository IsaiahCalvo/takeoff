import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadUnits() {
  const source = await readFile(new URL('../src/app/units.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'units.js' });
  return sandbox.window.TakeoffUnits;
}

test('formats scaled and unscaled lengths for the active unit', async () => {
  const units = await loadUnits();

  assert.equal(units.formatLengthInUnit(144, 'ft'), '12.00');
  assert.equal(units.formatLengthInUnit(144, 'yd'), '4.00');
  assert.equal(units.formatLengthInUnit(null, 'ft'), '—');
});

test('parses positive Length input in the active unit', async () => {
  const units = await loadUnits();

  assert.equal(units.parseLengthInUnit('1', 'ft'), 12);
  assert.equal(units.parseLengthInUnit('2.5', 'yd'), 90);
  assert.equal(units.parseLengthInUnit('18', 'in'), 18);
  assert.equal(units.parseLengthInUnit('0.5', 'm'), 19.68503935);
});

test('parseLengthInUnit rejects empty, zero, negative, and unparseable input', async () => {
  const units = await loadUnits();

  assert.equal(units.parseLengthInUnit('', 'ft'), null);
  assert.equal(units.parseLengthInUnit('0', 'ft'), null);
  assert.equal(units.parseLengthInUnit('-1', 'ft'), null);
  assert.equal(units.parseLengthInUnit('abc', 'ft'), null);
});

test('builds scale HUD text from page calibration', async () => {
  const units = await loadUnits();

  assert.equal(units.scaleHudText({ pxPerInch: 3, unit: 'ft' }), '1 ft = 36.00 px');
  assert.equal(units.scaleHudText({ pxPerInch: 3, unit: 'm' }), '1 m = 118.11 px');
  assert.equal(units.scaleHudText({ pxPerInch: null, unit: 'ft' }), '—');
});

test('exposes stable unit labels for UI chrome', async () => {
  const units = await loadUnits();

  assert.equal(units.unitLabel('ft'), 'ft');
  assert.equal(units.unitLabel('m'), 'm');
  assert.equal(units.unitLabel('unknown'), 'unknown');
});
