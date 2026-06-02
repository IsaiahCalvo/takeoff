import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadRenderer() {
  const geometrySource = await readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8');
  const measurementsSource = await readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/app/svg-renderer.js', import.meta.url), 'utf8');
  const createElement = tag => ({
    tag,
    attrs: {},
    children: [],
    textContent: '',
    setAttribute(key, value) { this.attrs[key] = String(value); },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  });
  const sandbox = {
    window: {},
    document: {
      createElementNS: (namespace, tag) => createElement(tag),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(geometrySource, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurementsSource, sandbox, { filename: 'measurements.js' });
  vm.runInContext(source, sandbox, { filename: 'svg-renderer.js' });
  return sandbox.window.TakeoffSvgRenderer;
}

function rectOverlapsPointClearance(rect, point, clearance) {
  return !(
    rect.x + rect.width <= point.x - clearance ||
    rect.x >= point.x + clearance ||
    rect.y + rect.height <= point.y - clearance ||
    rect.y >= point.y + clearance
  );
}

function distanceFromRectToPoint(rect, point) {
  const dx = point.x < rect.x ? rect.x - point.x : Math.max(0, point.x - (rect.x + rect.width));
  const dy = point.y < rect.y ? rect.y - point.y : Math.max(0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

function createDrawContext(width = 72) {
  return {
    font: '',
    measureText: () => ({ width }),
  };
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

test('drawPolyline keeps floating labels clear of endpoint anchors on short segments', async () => {
  const renderer = await loadRenderer();
  const drawSvg = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  const labelHitboxes = [];
  const measurementRenderer = renderer.createMeasurementRenderer({
    drawSvg,
    drawCtx: {
      font: '',
      measureText: () => ({ width: 72 }),
    },
    overlayPageSize: value => value,
  });
  const points = [{ x: 0, y: 0 }, { x: 24, y: 0 }];

  measurementRenderer.drawPolyline(points, {
    color: '#b6ff3c',
    labelColor: '#b6ff3c',
    label: '24 ft',
    labelT: 0.5,
    dots: true,
    measurementId: 'short-line',
    labelHitboxes,
  });

  assert.equal(labelHitboxes.length, 1);
  const labelBox = labelHitboxes[0];
  for (const anchor of points) {
    assert.equal(
      rectOverlapsPointClearance(labelBox, anchor, 6),
      false,
      `label hitbox overlaps anchor at ${anchor.x},${anchor.y}`
    );
  }
  const closestAnchorDistance = Math.min(...points.map(anchor => distanceFromRectToPoint(labelBox, anchor)));
  assert.ok(
    closestAnchorDistance <= 7,
    `expected label to sit close to anchors, got ${closestAnchorDistance}px`
  );
});

test('drawBezierSegments keeps floating labels clear of curve anchors', async () => {
  const renderer = await loadRenderer();
  const drawSvg = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  const labelHitboxes = [];
  const measurementRenderer = renderer.createMeasurementRenderer({
    drawSvg,
    drawCtx: {
      font: '',
      measureText: () => ({ width: 72 }),
    },
    overlayPageSize: value => value,
  });
  const anchors = [{ x: 0, y: 0 }, { x: 24, y: 0 }];

  measurementRenderer.drawBezierSegments([{
    type: 'cubic',
    from: anchors[0],
    c1: { x: 8, y: 0 },
    c2: { x: 16, y: 0 },
    to: anchors[1],
  }], {
    color: '#b6ff3c',
    labelColor: '#b6ff3c',
    label: '24 ft',
    labelT: 0.5,
    dots: true,
    measurementId: 'short-curve',
    labelHitboxes,
  });

  assert.equal(labelHitboxes.length, 1);
  const labelBox = labelHitboxes[0];
  for (const anchor of anchors) {
    assert.equal(
      rectOverlapsPointClearance(labelBox, anchor, 6),
      false,
      `label hitbox overlaps curve anchor at ${anchor.x},${anchor.y}`
    );
  }
  const closestAnchorDistance = Math.min(...anchors.map(anchor => distanceFromRectToPoint(labelBox, anchor)));
  assert.ok(
    closestAnchorDistance <= 7,
    `expected curve label to sit close to anchors, got ${closestAnchorDistance}px`
  );
});

test('label layout respects the dragged side of the path', async () => {
  const renderer = await loadRenderer();

  const layout = renderer.resolvePathLabelLayout({
    labelPosition: { point: { x: 50, y: 0 }, angle: 0 },
    labelOffset: { x: 0, y: -32 },
    label: '24 ft',
    anchors: [],
    drawCtx: createDrawContext(),
    overlayPageSize: value => value,
  });

  assert.ok(layout.ly < -18, `expected label above the path, got y=${layout.ly}`);
  assert.ok(layout.ly > -25, `expected label to stay close to the path, got y=${layout.ly}`);
});

test('label layout clamps far dragged offsets near the path', async () => {
  const renderer = await loadRenderer();

  const layout = renderer.resolvePathLabelLayout({
    labelPosition: { point: { x: 50, y: 0 }, angle: 0 },
    labelOffset: { x: 0, y: 220 },
    label: '24 ft',
    anchors: [],
    drawCtx: createDrawContext(),
    overlayPageSize: value => value,
  });

  assert.ok(layout.ly > 18, `expected far drag to keep the user's side, got y=${layout.ly}`);
  assert.ok(layout.ly <= 25, `expected far drag to be clamped near the path, got y=${layout.ly}`);
});

test('label layout pushes around anchors in the dragged radial direction', async () => {
  const renderer = await loadRenderer();

  const layout = renderer.resolvePathLabelLayout({
    labelPosition: { point: { x: 0, y: 0 }, angle: 0 },
    labelOffset: { x: -12, y: -12 },
    label: '24 ft',
    anchors: [{ x: 0, y: 0 }],
    drawCtx: createDrawContext(),
    overlayPageSize: value => value,
  });

  assert.ok(layout.lx < -5, `expected anchor push to keep left-side drag intent, got x=${layout.lx}`);
  assert.ok(layout.ly < -5, `expected anchor push to keep upper-side drag intent, got y=${layout.ly}`);
  assert.equal(
    rectOverlapsPointClearance(layout.hitbox, { x: 0, y: 0 }, 6),
    false,
    'label hitbox should stay clear of the anchor'
  );
});
