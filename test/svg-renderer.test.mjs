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

function createScaledDrawContext(widthAt13 = 130) {
  return {
    font: '',
    measureText() {
      const fontSize = Number(this.font.match(/([\d.]+)px/)?.[1]) || 13;
      return { width: widthAt13 * fontSize / 13 };
    },
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

test('buildCirclePath and buildArcPath create stable SVG arc commands', async () => {
  const renderer = await loadRenderer();

  assert.equal(renderer.buildCirclePath({
    center: { x: 10, y: 20 },
    radius: 5,
  }), 'M 15 20 A 5 5 0 1 1 5 20 A 5 5 0 1 1 15 20');

  assert.equal(renderer.buildArcPath({
    center: { x: 0, y: 0 },
    radius: 10,
    startAngle: 0,
    sweep: Math.PI / 2,
  }), 'M 10 0 A 10 10 0 0 1 0 10');
});

test('drawSnapFeedback renders a lightweight snap indicator', async () => {
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

  measurementRenderer.drawSnapFeedback({
    kind: 'anchor',
    point: { x: 12, y: 20 },
  });

  assert.equal(drawSvg.children.length, 1);
  assert.equal(drawSvg.children[0].tag, 'g');
  assert.equal(drawSvg.children[0].attrs.class, 'snap-feedback anchor');
  assert.equal(drawSvg.children[0].children[0].tag, 'circle');
  assert.equal(drawSvg.children[0].children[0].attrs.cx, '12');
  assert.equal(drawSvg.children[0].children[0].attrs.cy, '20');
});

test('drawCircle and drawArc render semantic path overlays with labels', async () => {
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
    drawCtx: createDrawContext(),
    overlayPageSize: value => value,
  });

  measurementRenderer.drawCircle({
    center: { x: 10, y: 20 },
    radius: 5,
  }, {
    color: '#b6ff3c',
    labelColor: '#b6ff3c',
    label: 'C 31.42',
    labelT: 0.125,
    dots: true,
    measurementId: 'circle-1',
    labelHitboxes,
  });
  measurementRenderer.drawArc({
    center: { x: 0, y: 0 },
    radius: 10,
    startAngle: 0,
    sweep: Math.PI / 2,
  }, {
    color: '#4cd6ff',
    labelColor: '#4cd6ff',
    label: '90 deg',
    labelT: 0.5,
    dots: true,
    measurementId: 'arc-1',
    labelHitboxes,
  });

  assert.equal(drawSvg.children.length, 2);
  assert.equal(drawSvg.children[0].children.some(child => child.tag === 'path' && child.attrs.d.includes('A 5 5')), true);
  assert.equal(drawSvg.children[1].children.some(child => child.tag === 'path' && child.attrs.d.includes('A 10 10')), true);
  assert.deepEqual(labelHitboxes.map(box => box.measurementId), ['circle-1', 'arc-1']);
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
  assert.equal(group.children.some(child => child.attrs?.class === 'canvas-length-tag'), false);
});

test('drawPolyline adds a hover-only label navigation chevron for saved labels', async () => {
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
    drawCtx: createDrawContext(),
    overlayPageSize: value => value,
  });

  measurementRenderer.drawPolyline([{ x: 0, y: 0 }, { x: 80, y: 0 }], {
    color: '#36d399',
    labelColor: '#36d399',
    label: '12.50 ft',
    labelT: 0.5,
    measurementId: 'run-12',
    labelHitboxes,
  });

  const labelGroup = drawSvg.children[0].children.find(child => child.attrs?.class === 'canvas-length-tag');
  assert.ok(labelGroup, 'saved label should render a label group');
  assert.equal(labelGroup.attrs['data-measurement-id'], 'run-12');
  const nav = labelGroup.children.find(child => child.attrs?.class === 'canvas-length-tag-nav');
  assert.ok(nav, 'saved label should render the navigation affordance');
  assert.equal(nav.attrs['data-length-label-nav'], 'true');
  assert.equal(nav.attrs['data-measurement-id'], 'run-12');
  assert.equal(nav.children[1].attrs.d, 'M4.5 3 7.5 6 4.5 9');
  assert.ok(Number(nav.attrs.transform.match(/translate\(([-\d.]+)/)?.[1]) > labelHitboxes[0].x + labelHitboxes[0].width - 3);
});

test('drawPolyline renders a transparent area fill and centered area label', async () => {
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
    drawCtx: createScaledDrawContext(72),
    overlayPageSize: value => value,
  });

  measurementRenderer.drawPolyline([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 0 },
  ], {
    color: '#36d399',
    labelColor: '#36d399',
    areaLabel: '200.00 ft\u00b2',
    areaCenter: { x: 10, y: 5 },
  });

  const group = drawSvg.children[0];
  const areaGroup = group.children[0];
  assert.equal(areaGroup.attrs.class, 'canvas-area-overlay');
  assert.equal(areaGroup.children[0].tag, 'path');
  assert.equal(areaGroup.children[0].attrs.fill, '#36d399');
  assert.equal(areaGroup.children[0].attrs.opacity, '0.18');
  assert.equal(areaGroup.children[0].attrs.d, 'M 0 0 L 20 0 L 20 10 L 0 10 L 0 0 Z');
  assert.equal(areaGroup.children[1].tag, 'text');
  assert.equal(areaGroup.children[1].attrs.x, '10');
  assert.equal(areaGroup.children[1].attrs.y, '5');
  assert.equal(areaGroup.children[1].textContent, '200.00 ft\u00b2');
});

test('drawPolyline shrinks area labels so they stay inside narrow closed shapes', async () => {
  const renderer = await loadRenderer();
  const widthAt13 = 130;
  for (const { overlayScale, width, height } of [
    { overlayScale: 1, width: 60, height: 12 },
    { overlayScale: 2, width: 120, height: 36 },
  ]) {
    const drawSvg = {
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
    };
    const measurementRenderer = renderer.createMeasurementRenderer({
      drawSvg,
      drawCtx: createScaledDrawContext(widthAt13),
      overlayPageSize: value => value * overlayScale,
    });

    measurementRenderer.drawPolyline([
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
      { x: 0, y: 0 },
    ], {
      color: '#36d399',
      labelColor: '#36d399',
      areaLabel: '123456.78 ft\u00b2',
      areaCenter: { x: width / 2, y: height / 2 },
    });

    const areaGroup = drawSvg.children[0].children[0];
    const text = areaGroup.children[1];
    const fontSize = Number(text.attrs['font-size']);
    const strokeWidth = Number(text.attrs['stroke-width']);
    const measuredWidth = widthAt13 * fontSize / 13;
    const clearGap = 1;
    const visualBox = {
      x: Number(text.attrs.x) - measuredWidth / 2 - strokeWidth / 2 - clearGap,
      y: Number(text.attrs.y) - fontSize / 2 - strokeWidth / 2 - clearGap,
      width: measuredWidth + strokeWidth + clearGap * 2,
      height: fontSize + strokeWidth + clearGap * 2,
    };

    assert.ok(fontSize < 13 * overlayScale, `expected font to shrink at overlay scale ${overlayScale}, got ${fontSize}px`);
    assert.ok(visualBox.x >= 0, `label crosses left edge by ${-visualBox.x}px at overlay scale ${overlayScale}`);
    assert.ok(visualBox.y >= 0, `label crosses top edge by ${-visualBox.y}px at overlay scale ${overlayScale}`);
    assert.ok(visualBox.x + visualBox.width <= width, `label crosses right edge at overlay scale ${overlayScale}`);
    assert.ok(visualBox.y + visualBox.height <= height, `label crosses bottom edge at overlay scale ${overlayScale}`);
  }
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

test('drawPolyline paints an explicit line border under the line fill', async () => {
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
    color: '#ffffff',
    dots: false,
    width: 2,
    pathStyle: {
      stroke: { color: '#ffffff', style: 'solid', border: '#111619', borderMatchesFill: false },
      anchors: { fill: '#101820', border: '#36d399', borderMatchesStroke: false },
    },
  });

  const children = drawSvg.children[0].children;
  assert.equal(children.length, 2);
  assert.equal(children[0].tag, 'path');
  assert.equal(children[0].attrs.stroke, '#111619');
  assert.equal(Number(children[0].attrs['stroke-width']) > Number(children[1].attrs['stroke-width']), true);
  assert.equal(children[1].tag, 'path');
  assert.equal(children[1].attrs.stroke, '#ffffff');
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

test('drawMixedPath renders line and freehand portions with one endpoint anchor set', async () => {
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

  measurementRenderer.drawMixedPath([{
    kind: 'line',
    current: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  }, {
    kind: 'freehand',
    current: {
      segments: [{
        type: 'cubic',
        from: { x: 10, y: 0 },
        c1: { x: 13, y: 0 },
        c2: { x: 17, y: 0 },
        to: { x: 20, y: 0 },
      }],
    },
  }], {
    color: '#b6ff3c',
    dots: true,
    width: 2,
    anchorPoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    labelPoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
  });

  assert.equal(drawSvg.children.length, 1);
  assert.deepEqual(drawSvg.children[0].children.map(child => child.tag), ['path', 'path', 'circle', 'circle']);
  assert.equal(drawSvg.children[0].children[0].attrs.d, 'M 0 0 L 10 0');
  assert.equal(drawSvg.children[0].children[1].attrs.d, 'M 10 0 C 13 0 17 0 20 0');
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

test('label layout clamps far dragged offsets near an anchor', async () => {
  const renderer = await loadRenderer();

  const layout = renderer.resolvePathLabelLayout({
    labelPosition: { point: { x: 0, y: 0 }, angle: 0 },
    labelOffset: { x: 0, y: 220 },
    label: '24 ft',
    anchors: [{ x: 0, y: 0 }],
    drawCtx: createDrawContext(),
    overlayPageSize: value => value,
  });

  assert.ok(layout.ly > 18, `expected far drag to keep the user's side, got y=${layout.ly}`);
  assert.ok(layout.ly <= 25, `expected far drag near an anchor to stay close, got y=${layout.ly}`);
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
