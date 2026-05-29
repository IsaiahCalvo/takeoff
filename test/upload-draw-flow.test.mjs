import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function runSource(sandbox, path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  vm.runInContext(source, sandbox, { filename: path });
}

async function loadFlowModules() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  await runSource(sandbox, '../src/app/document-loader.js');
  await runSource(sandbox, '../src/app/document-adapters.js');
  await runSource(sandbox, '../src/app/geometry.js');
  await runSource(sandbox, '../src/app/measurements.js');
  await runSource(sandbox, '../src/app/measurement-commands.js');
  return sandbox.window;
}

test('image upload to measured line flow keeps canvas and measurement state consistent', async () => {
  const takeoff = await loadFlowModules();
  const file = { name: 'field-sketch.png', type: 'image/png' };
  const image = { width: 320, height: 240 };
  const drawCalls = [];
  const cssSizes = [];
  let drawCanvasConfigured = 0;
  const baseCanvas = { width: 0, height: 0, style: {} };
  const baseCtx = {
    drawImage(...args) {
      drawCalls.push(args);
    },
  };

  const fileInfo = takeoff.TakeoffDocumentLoader.describeDocumentFile(file);
  const imageState = takeoff.TakeoffDocumentAdapters.renderImageBitmapToCanvas({
    image,
    baseCanvas,
    baseCtx,
    configureCanvasCssSize(canvas, width, height) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      cssSizes.push({ width, height });
    },
    configureDrawCanvas() {
      drawCanvasConfigured += 1;
    },
  });
  const measurement = takeoff.TakeoffMeasurementCommands.createLineMeasurement({
    id: 7,
    points: [{ x: 10, y: 20 }, { x: 40, y: 60 }],
    existingMeasurements: [],
    palette: ['#b6ff3c'],
    page: imageState.pdfPage,
    pxPerInch: 10,
  });

  assert.equal(fileInfo.kind, 'image');
  assert.equal(fileInfo.displayName, 'field-sketch.png');
  assert.equal(fileInfo.supported, true);
  assert.equal(imageState.pdf, null);
  assert.equal(imageState.pdfPages, 1);
  assert.equal(imageState.baseW, 320);
  assert.equal(imageState.baseH, 240);
  assert.equal(baseCanvas.width, 320);
  assert.equal(baseCanvas.height, 240);
  assert.deepEqual(cssSizes, [{ width: 320, height: 240 }]);
  assert.equal(drawCanvasConfigured, 1);
  assert.deepEqual(drawCalls, [[image, 0, 0]]);
  assert.equal(measurement.drawType, 'line');
  assert.equal(measurement.shape.active, 'line');
  assert.equal(measurement.page, 1);
  assert.equal(measurement.lengthPx, 50);
  assert.equal(measurement.lengthInches, 5);
});
