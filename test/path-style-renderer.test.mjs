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

test('renders the Iteration 2A two-anchor squiggle preview', async () => {
  const renderer = await loadPathStyleRenderer();

  const attrs = renderer.getPathStylePreviewAttributes({
    stroke: { color: '#2f8cff', style: 'solid' },
    anchors: { fill: '#ff3b66', border: '#ffffff', borderMatchesStroke: false },
  });

  assert.equal(attrs.svg.viewBox, '-3 -42 170 170');
  assert.equal(attrs.path.d, 'M132 46 C114 46 109 34 88 34 C65 34 64 56 41 56 C30 56 24 51 19 48');
  assert.deepEqual(plain(attrs.anchors.map(anchor => ({ cx: anchor.cx, cy: anchor.cy, r: anchor.r }))), [
    { cx: 19, cy: 48, r: 13 },
    { cx: 146, cy: 46, r: 13 },
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
  assert.equal(Object.hasOwn(attrs.path, 'stroke-dasharray'), false);
  assert.equal(svg.includes('stroke-dasharray'), false);
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
    stroke: { color: 'url(javascript:alert(1))', style: 'dashdot' },
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
    stroke: { color: '#b6ff3c', style: 'solid' },
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
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -42 170 170" aria-hidden="true"><path d="M132 46 C114 46 109 34 88 34 C65 34 64 56 41 56 C30 56 24 51 19 48" fill="none" stroke="#36d399" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="18 13"/><circle cx="19" cy="48" r="13" fill="#0b0f11" stroke="#36d399" stroke-width="5"/><circle cx="146" cy="46" r="13" fill="#0b0f11" stroke="#36d399" stroke-width="5"/></svg>'
  );
});
