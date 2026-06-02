import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadRenderer() {
  const geometrySource = await readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8');
  const measurementsSource = await readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8');
  const pathStyleRendererSource = await readFile(new URL('../src/app/path-style-renderer.js', import.meta.url), 'utf8');
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
      createElement: tag => createElement(tag),
      createElementNS: (namespace, tag) => createElement(tag),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(geometrySource, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurementsSource, sandbox, { filename: 'measurements.js' });
  vm.runInContext(pathStyleRendererSource, sandbox, { filename: 'path-style-renderer.js' });
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

test('drawPolyline renders active length edits inside the SVG label', async () => {
  const renderer = await loadRenderer();
  const drawSvg = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  const measurementRenderer = renderer.createMeasurementRenderer({
    drawSvg,
    drawCtx: createDrawContext(),
    overlayPageSize: value => value,
  });

  measurementRenderer.drawPolyline([{ x: 0, y: 0 }, { x: 80, y: 0 }], {
    color: '#ff73a6',
    labelColor: '#ff73a6',
    label: '12.50 ft',
    labelT: 0.5,
    measurementId: 'inline-edit',
    labelEdit: {
      active: true,
      value: '12.50',
      unit: 'ft',
      invalid: false,
    },
  });

  const group = drawSvg.children[0];
  const foreignObject = group.children.find(child => child.tag === 'foreignObject');
  assert.ok(foreignObject, 'active edit label should render a foreignObject editor');
  assert.equal(foreignObject.attrs.class, 'canvas-length-tag-editor');
  assert.equal(foreignObject.attrs['data-measurement-id'], 'inline-edit');
  const wrapper = foreignObject.children[0];
  const input = wrapper.children[0];
  const unit = wrapper.children[1];
  assert.equal(wrapper.tag, 'div');
  assert.equal(wrapper.attrs.class, 'canvas-length-tag-edit');
  assert.match(wrapper.attrs.style, /--length-tag-color:#ff73a6/);
  assert.equal(input.tag, 'input');
  assert.equal(input.attrs.id, 'canvasLengthEditInput');
  assert.equal(input.attrs.class, 'canvas-length-tag-input');
  assert.equal(input.attrs.value, '12.50');
  assert.equal(input.attrs.inputmode, 'decimal');
  assert.equal(unit.tag, 'span');
  assert.equal(unit.attrs.class, 'canvas-length-tag-unit');
  assert.equal(unit.textContent, 'ft');
  assert.equal(group.children.some(child => child.tag === 'text'), false);
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

test('drawPolyline keeps legacy measurement attributes unchanged without path style', async () => {
  const renderer = await loadRenderer();
  const drawSvg = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  const measurementRenderer = renderer.createMeasurementRenderer({
    drawSvg,
    drawCtx: createDrawContext(),
    overlayPageSize: value => value,
  });

  measurementRenderer.drawPolyline([{ x: 0, y: 0 }, { x: 10, y: 5 }], {
    color: '#b6ff3c',
    dashed: true,
    dots: true,
    width: 2,
    pathStyle: undefined,
  });

  assert.equal(drawSvg.children.length, 1);
  assert.deepEqual(drawSvg.children[0].children.map(child => ({ tag: child.tag, attrs: child.attrs })), [
    {
      tag: 'path',
      attrs: {
        d: 'M 0 0 L 10 5',
        fill: 'none',
        stroke: '#b6ff3c',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': '8 6',
      },
    },
    {
      tag: 'circle',
      attrs: {
        cx: '0',
        cy: '0',
        r: '4',
        fill: '#0b0d0e',
        stroke: '#b6ff3c',
        'stroke-width': '2',
      },
    },
    {
      tag: 'circle',
      attrs: {
        cx: '10',
        cy: '5',
        r: '4',
        fill: '#0b0d0e',
        stroke: '#b6ff3c',
        'stroke-width': '2',
      },
    },
  ]);
});

test('drawPolyline applies stored path style snapshot attributes', async () => {
  const renderer = await loadRenderer();
  const drawSvg = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  const measurementRenderer = renderer.createMeasurementRenderer({
    drawSvg,
    drawCtx: createDrawContext(),
    overlayPageSize: value => value,
  });

  measurementRenderer.drawPolyline([{ x: 0, y: 0 }, { x: 10, y: 5 }], {
    color: '#b6ff3c',
    dots: true,
    width: 2,
    pathStyle: {
      stroke: { color: '#ff4d7d', style: 'dashed' },
      anchors: { fill: '#101820', border: '#36d399', borderMatchesStroke: false },
    },
  });

  assert.equal(drawSvg.children.length, 1);
  assert.deepEqual(drawSvg.children[0].children.map(child => ({ tag: child.tag, attrs: child.attrs })), [
    {
      tag: 'path',
      attrs: {
        d: 'M 0 0 L 10 5',
        fill: 'none',
        stroke: '#ff4d7d',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': '18 13',
      },
    },
    {
      tag: 'circle',
      attrs: {
        cx: '0',
        cy: '0',
        r: '4',
        fill: '#101820',
        stroke: '#36d399',
        'stroke-width': '2',
      },
    },
    {
      tag: 'circle',
      attrs: {
        cx: '10',
        cy: '5',
        r: '4',
        fill: '#101820',
        stroke: '#36d399',
        'stroke-width': '2',
      },
    },
  ]);
});

test('drawBezierSegments applies stored path style snapshot attributes', async () => {
  const renderer = await loadRenderer();
  const drawSvg = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  const measurementRenderer = renderer.createMeasurementRenderer({
    drawSvg,
    drawCtx: createDrawContext(),
    overlayPageSize: value => value,
  });

  measurementRenderer.drawBezierSegments([{
    type: 'cubic',
    from: { x: 0, y: 0 },
    c1: { x: 5, y: 0 },
    c2: { x: 5, y: 10 },
    to: { x: 10, y: 10 },
  }], {
    color: '#b6ff3c',
    dots: true,
    width: 2,
    pathStyle: {
      stroke: { color: '#36d399', style: 'dotted' },
      anchors: { fill: '#f7fbfc', border: '#111619', borderMatchesStroke: true },
    },
  });

  assert.equal(drawSvg.children.length, 1);
  assert.deepEqual(drawSvg.children[0].children.map(child => ({ tag: child.tag, attrs: child.attrs })), [
    {
      tag: 'path',
      attrs: {
        d: 'M 0 0 C 5 0 5 10 10 10',
        fill: 'none',
        stroke: '#36d399',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': '1 16',
      },
    },
    {
      tag: 'circle',
      attrs: {
        cx: '0',
        cy: '0',
        r: '4',
        fill: '#f7fbfc',
        stroke: '#36d399',
        'stroke-width': '2',
      },
    },
    {
      tag: 'circle',
      attrs: {
        cx: '10',
        cy: '10',
        r: '4',
        fill: '#f7fbfc',
        stroke: '#36d399',
        'stroke-width': '2',
      },
    },
  ]);
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
