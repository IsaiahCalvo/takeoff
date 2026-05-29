import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadTooltipController() {
  const source = await readFile(new URL('../src/app/tooltip-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'tooltip-controller.js' });
  return sandbox.window.TakeoffTooltipController;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('computeTooltipPosition keeps left rail tooltips inside the viewport', async () => {
  const tooltip = await loadTooltipController();

  assert.deepEqual(plain(tooltip.computeTooltipPosition({
    targetRect: { left: 20, right: 44, top: 100, height: 24 },
    placement: 'rail',
    viewportWidth: 300,
    viewportHeight: 200,
  })), { left: 52, top: 112, transform: 'translate(0, -50%)' });

  assert.deepEqual(plain(tooltip.computeTooltipPosition({
    targetRect: { left: 260, right: 284, top: 190, height: 24 },
    placement: 'rail',
    viewportWidth: 300,
    viewportHeight: 200,
  })), { left: 292, top: 188, transform: 'translate(0, -50%)' });
});

test('computeTooltipPosition centers non-rail tooltips under their target', async () => {
  const tooltip = await loadTooltipController();

  assert.deepEqual(plain(tooltip.computeTooltipPosition({
    targetRect: { left: 100, right: 140, top: 20, bottom: 44, width: 40, height: 24 },
    placement: 'below',
    viewportWidth: 300,
    viewportHeight: 200,
  })), { left: 120, top: 52, transform: 'translate(-50%, 0)' });
});
