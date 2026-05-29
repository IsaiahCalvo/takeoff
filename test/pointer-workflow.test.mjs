import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPointerWorkflow() {
  const source = await readFile(new URL('../src/app/pointer-workflow.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'pointer-workflow.js' });
  return sandbox.window.TakeoffPointerWorkflow;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('buildContextMenuHit prefers labels, then anchors, then paths', async () => {
  const workflow = await loadPointerWorkflow();

  assert.deepEqual(plain(workflow.buildContextMenuHit({
    labelHit: { measurementId: 1 },
    anchorHit: { measurementId: 2 },
    pathHit: { measurementId: 3 },
  })), {
    hitId: 1,
    target: { measurementId: 2, kind: 'anchor-hit' },
  });

  assert.deepEqual(plain(workflow.buildContextMenuHit({
    labelHit: null,
    anchorHit: null,
    pathHit: { measurementId: 3, segmentIndex: 0 },
  })), {
    hitId: 3,
    target: { kind: 'path-hit', measurementId: 3, segmentIndex: 0 },
  });
});

test('appendPointToDraft snaps only when shift is held', async () => {
  const workflow = await loadPointerWorkflow();
  const inProgress = { type: 'measure', points: [{ x: 0, y: 0 }] };
  const point = { x: 8, y: 3 };
  const snapPoint = () => ({ x: 8, y: 0 });

  assert.deepEqual(plain(workflow.appendPointToDraft({ inProgress, point, shiftKey: false, snapPoint })), {
    type: 'measure',
    points: [{ x: 0, y: 0 }, { x: 8, y: 3 }],
  });

  assert.deepEqual(plain(workflow.appendPointToDraft({ inProgress, point, shiftKey: true, snapPoint })), {
    type: 'measure',
    points: [{ x: 0, y: 0 }, { x: 8, y: 0 }],
  });
});
