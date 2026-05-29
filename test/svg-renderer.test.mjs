import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadRenderer() {
  const source = await readFile(new URL('../public/app/svg-renderer.js', import.meta.url), 'utf8');
  const sandbox = {
    window: {},
    document: {
      createElementNS: () => ({
        setAttribute() {},
        appendChild() {},
      }),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'svg-renderer.js' });
  return sandbox.window.TakeoffSvgRenderer;
}

test('buildPolylinePath creates stable SVG path commands', async () => {
  const renderer = await loadRenderer();

  assert.equal(renderer.buildPolylinePath([
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 0 },
  ]), 'M 0 0 L 10 5 L 20 0');
});

test('buildBezierPath creates stable SVG cubic path commands', async () => {
  const renderer = await loadRenderer();

  assert.equal(renderer.buildBezierPath([
    {
      from: { x: 0, y: 0 },
      c1: { x: 5, y: 0 },
      c2: { x: 5, y: 10 },
      to: { x: 10, y: 10 },
    },
    {
      from: { x: 10, y: 10 },
      c1: { x: 15, y: 10 },
      c2: { x: 15, y: 0 },
      to: { x: 20, y: 0 },
    },
  ]), 'M 0 0 C 5 0 5 10 10 10 L 10 10 C 15 10 15 0 20 0');
});
