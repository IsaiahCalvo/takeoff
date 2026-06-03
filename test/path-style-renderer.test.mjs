import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPathStyleRenderer() {
  const source = await readFile(new URL('../src/app/path-style-renderer.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'path-style-renderer.js' });
  return sandbox.window.TakeoffPathStyleRenderer;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('renders the two-anchor squiggle preview on a bottom-left to top-right diagonal', async () => {
  const renderer = await loadPathStyleRenderer();

  const attrs = renderer.getPathStylePreviewAttributes({
    stroke: { color: '#2f8cff', style: 'solid' },
    anchors: { fill: '#ff3b66', border: '#ffffff', borderMatchesStroke: false },
  });

  assert.equal(attrs.svg.viewBox, '0 0 100 100');
  assert.equal(attrs.svg.width, 100);
  assert.equal(attrs.svg.height, 100);
  assert.equal(attrs.svg.style, 'width:100px;height:100px;display:block;overflow:visible');
  assert.equal(attrs.path.d, 'M18 74 C34 74 34 54 50 54 C66 54 66 26 82 26');
  assert.deepEqual(plain(attrs.anchors.map(anchor => ({ cx: anchor.cx, cy: anchor.cy, r: anchor.r }))), [
    { cx: 18, cy: 74, r: 12 },
    { cx: 82, cy: 26, r: 12 },
  ]);
});

test('renders the selected preview panel four-anchor zigzag variant', async () => {
  const renderer = await loadPathStyleRenderer();

  const attrs = renderer.getPathStyleDetailPreviewAttributes({
    stroke: { color: '#2f8cff', style: 'solid' },
    anchors: { fill: '#ff3b66', border: '#ffffff', borderMatchesStroke: false },
  });

  assert.equal(attrs.svg.viewBox, '-10 -42 190 170');
  assert.equal(attrs.svg.width, 190);
  assert.equal(attrs.svg.height, 170);
  assert.equal(attrs.svg.style, 'width:190px;height:170px;display:block;overflow:visible');
  assert.equal(attrs.path.d, 'M24 62 L70 28 L116 54 L166 18');
  assert.deepEqual(plain(attrs.anchors.map(anchor => ({ cx: anchor.cx, cy: anchor.cy, r: anchor.r }))), [
    { cx: 24, cy: 62, r: 8 },
    { cx: 70, cy: 28, r: 8 },
    { cx: 116, cy: 54, r: 8 },
    { cx: 166, cy: 18, r: 8 },
  ]);
});

test('renders solid stroke output without dash markup', async () => {
  const renderer = await loadPathStyleRenderer();

  const attrs = renderer.getPathStylePreviewAttributes({
    stroke: { color: '#2f8cff', style: 'solid' },
    anchors: { fill: '#ff3b66', border: '#ffffff', borderMatchesStroke: false },
  });
  const svg = renderer.renderPathStylePreviewSvg(attrs.style);

  assert.equal(attrs.path.stroke, '#2f8cff');
  assert.equal(attrs.pathBorder, null);
  assert.equal(Object.hasOwn(attrs.path, 'stroke-dasharray'), false);
  assert.equal(svg.includes('stroke-dasharray'), false);
});

test('renders explicit line border behind line fill', async () => {
  const renderer = await loadPathStyleRenderer();
  const style = {
    stroke: {
      color: '#ffffff',
      style: 'dashed',
      border: '#111619',
      borderMatchesFill: false,
    },
    anchors: { fill: '#0b0f11', borderMatchesStroke: true },
  };

  const borderAttrs = renderer.pathBorderAttributes(style, {
    strokeWidth: 8,
    borderWidth: 3,
    dashScale: 1,
  });
  const attrs = renderer.getPathStylePreviewAttributes(style);
  const svg = renderer.renderPathStylePreviewSvg(style);

  assert.deepEqual(plain(borderAttrs), {
    fill: 'none',
    stroke: '#111619',
    'stroke-width': 14,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-dasharray': '18 13',
  });
  assert.equal(attrs.path.stroke, '#ffffff');
  assert.equal(attrs.pathBorder.stroke, '#111619');
  assert.equal((svg.match(/<path /g) || []).length, 2);
  assert.equal(svg.indexOf('stroke="#111619"') < svg.indexOf('stroke="#ffffff"'), true);
});

test('renders dashed stroke output with the preview dash pattern', async () => {
  const renderer = await loadPathStyleRenderer();

  const attrs = renderer.getPathStylePreviewAttributes({
    stroke: { color: '#36d399', style: 'dashed' },
    anchors: { fill: '#0b0f11', borderMatchesStroke: true },
  });

  assert.equal(attrs.path.stroke, '#36d399');
  assert.equal(attrs.path['stroke-dasharray'], '18 13');
  assert.equal(renderer.renderPathStylePreviewSvg(attrs.style).includes('stroke-dasharray="18 13"'), true);
});

test('renders dotted stroke output with the preview dot pattern', async () => {
  const renderer = await loadPathStyleRenderer();

  const attrs = renderer.getPathStylePreviewAttributes({
    stroke: { color: '#ffb13c', style: 'dotted' },
    anchors: { fill: '#7c3cff', border: '#ffd166', borderMatchesStroke: false },
  });

  assert.equal(attrs.path.stroke, '#ffb13c');
  assert.equal(attrs.path['stroke-linecap'], 'round');
  assert.equal(attrs.path['stroke-dasharray'], '1 16');
  assert.equal(renderer.renderPathStylePreviewSvg(attrs.style).includes('stroke-dasharray="1 16"'), true);
});

test('applies anchor fill, explicit border, and borderMatchesStroke rules', async () => {
  const renderer = await loadPathStyleRenderer();

  const explicit = renderer.getPathStylePreviewAttributes({
    stroke: { color: '#2f8cff', style: 'solid' },
    anchors: { fill: '#ff3b66', border: '#ffffff', borderMatchesStroke: false },
  });
  const matching = renderer.getPathStylePreviewAttributes({
    stroke: { color: '#36d399', style: 'dashed' },
    anchors: { fill: '#0b0f11', border: '#ffffff', borderMatchesStroke: true },
  });

  assert.equal(explicit.anchors[0].fill, '#ff3b66');
  assert.equal(explicit.anchors[0].stroke, '#ffffff');
  assert.equal(matching.anchors[0].fill, '#0b0f11');
  assert.equal(matching.anchors[0].stroke, '#36d399');
});

test('sanitizes invalid styles and colors to deterministic fallbacks', async () => {
  const renderer = await loadPathStyleRenderer();

  const attrs = renderer.getPathStylePreviewAttributes({
    stroke: {
      color: 'url(javascript:alert(1))',
      style: 'dashdot',
      border: '"><script>alert(1)</script>',
      borderMatchesFill: false,
    },
    anchors: {
      fill: 'red;background:url(javascript:alert(1))',
      border: '"><script>alert(1)</script>',
      borderMatchesStroke: false,
    },
  });
  const svg = renderer.renderPathStylePreviewSvg(attrs.style, {
    ariaLabel: 'Path <preview> "safe"',
  });

  assert.deepEqual(plain(attrs.style), {
    stroke: { color: '#b6ff3c', style: 'solid', border: '#b6ff3c', borderMatchesFill: false },
    anchors: { fill: '#ffffff', border: '#b6ff3c', borderMatchesStroke: false },
  });
  assert.equal(svg.includes('javascript'), false);
  assert.equal(svg.includes('<script'), false);
  assert.equal(svg.includes('aria-label="Path &lt;preview&gt; &quot;safe&quot;"'), true);
});

test('renders deterministic inline SVG markup', async () => {
  const renderer = await loadPathStyleRenderer();

  assert.equal(
    renderer.renderPathStylePreviewSvg({
      stroke: { color: '#36D399', style: 'dashed' },
      anchors: { fill: '#0B0F11', borderMatchesStroke: true },
    }),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" style="width:100px;height:100px;display:block;overflow:visible" aria-hidden="true"><path d="M18 74 C34 74 34 54 50 54 C66 54 66 26 82 26" fill="none" stroke="#36d399" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="18 13"/><circle cx="18" cy="74" r="12" fill="#0b0f11" stroke="#36d399" stroke-width="5"/><circle cx="82" cy="26" r="12" fill="#0b0f11" stroke="#36d399" stroke-width="5"/></svg>'
  );
});
