import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadMarqueeController() {
  const source = await readFile(new URL('../src/app/marquee-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'marquee-controller.js' });
  return sandbox.window.TakeoffMarqueeController;
}

function createStage() {
  const classes = new Set();
  const captured = [];
  const released = [];
  return {
    captured,
    released,
    style: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    setPointerCapture: (id) => captured.push(id),
    releasePointerCapture: (id) => released.push(id),
  };
}

test('marquee controller captures pointer, clamps to page, and ignores other pointers', async () => {
  const marqueeModule = await loadMarqueeController();
  const state = { baseW: 100, baseH: 80, marqueeSelection: null };
  const stage = createStage();
  const selected = [];
  const drawNodes = [];
  const controller = marqueeModule.createMarqueeController({
    state,
    stage,
    screenToImage: (clientX, clientY) => ({ x: clientX, y: clientY }),
    measurementsForSelection: () => [{ id: 2 }],
    renderList: () => {},
    redraw: () => {},
    drawSvg: { appendChild: (node) => drawNodes.push(node) },
    svgNode: (name, attrs) => ({ name, attrs }),
    overlayPageSize: (value) => value,
    selection: {
      set: (ids) => selected.push(['set', ids]),
      add: (ids) => selected.push(['add', ids]),
      remove: (ids) => selected.push(['remove', ids]),
      clear: () => selected.push(['clear']),
    },
    hitTesting: {
      MARQUEE_MIN_DRAG_PX: 5,
      getMarqueeRect: ({ startX, startY, endX, endY }) => ({
        left: Math.min(startX, endX),
        top: Math.min(startY, endY),
        right: Math.max(startX, endX),
        bottom: Math.max(startY, endY),
        width: Math.abs(endX - startX),
        height: Math.abs(endY - startY),
      }),
      getMarqueeDirection: ({ startX, endX }) => endX >= startX ? 'window' : 'crossing',
      findMarqueeMeasurements: () => [2],
    },
  });

  controller.start({ point: { x: 10, y: 10 }, clientX: 10, clientY: 10, pointerId: 42 });
  assert.deepEqual(stage.captured, [42]);
  assert.equal(stage.classList.contains('marqueeing'), true);

  assert.equal(controller.update({ clientX: 60, clientY: 60, pointerId: 99 }), false);
  assert.equal(state.marqueeSelection.endX, 10);
  assert.equal(state.marqueeSelection.active, false);

  assert.equal(controller.update({ clientX: 200, clientY: 200, pointerId: 42, shiftKey: false, altKey: false }), true);
  assert.equal(state.marqueeSelection.endX, 100);
  assert.equal(state.marqueeSelection.endY, 80);
  assert.equal(state.marqueeSelection.active, true);

  controller.draw();
  assert.equal(drawNodes[0].name, 'rect');
  assert.equal(drawNodes[0].attrs.stroke, 'rgba(0, 100, 255, 0.8)');
  assert.equal(drawNodes[0].attrs['vector-effect'], 'non-scaling-stroke');

  assert.equal(controller.commit(), true);
  assert.deepEqual(stage.released, [42]);
  assert.deepEqual(selected, [['set', [2]]]);
  assert.equal(stage.classList.contains('marqueeing'), false);
});
