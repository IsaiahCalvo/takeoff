import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { withViteServer } from './support/vite-server.js';

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function pngBuffer(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rowSize = 1 + width * 3;
  const pixels = Buffer.alloc(rowSize * height, 255);
  for (let y = 0; y < height; y += 1) pixels[y * rowSize] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND'),
  ]);
}

test('calibration and measure first clicks draw visible anchors with Snap to paths enabled', {
  skip: process.env.CI === 'true' ? 'Playwright browser flow is local-only; CI runs static and unit coverage.' : false,
}, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (_) {
    t.skip('Playwright is not available in this environment.');
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'takeoff-first-click-'));
  const imagePath = path.join(tempDir, 'plan.png');
  await writeFile(imagePath, pngBuffer(800, 600));

  await withViteServer(async (baseUrl) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const runtimeErrors = [];
      page.on('pageerror', error => runtimeErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });

      await page.goto(baseUrl);
      await page.locator('#fileInput').setInputFiles(imagePath);
      await page.waitForFunction(() => !document.body.classList.contains('no-document'));
      await page.locator('#baseCanvas').waitFor({ state: 'visible' });
      const canvasBox = await page.locator('#baseCanvas').boundingBox();
      assert.ok(canvasBox, 'draw canvas is visible');

      await page.locator('#snapToPaths').click();
      await page.locator('#btn-calibrate').click();
      await page.mouse.move(canvasBox.x + 160, canvasBox.y + 140);
      await page.mouse.click(canvasBox.x + 160, canvasBox.y + 140);
      await page.waitForFunction(() => document.querySelectorAll('#drawSvg circle').length >= 1);

      await page.locator('#btn-measure').click();
      await page.waitForFunction(() => document.querySelectorAll('#drawSvg circle').length === 0);
      await page.mouse.move(canvasBox.x + 260, canvasBox.y + 180);
      await page.mouse.click(canvasBox.x + 260, canvasBox.y + 180);
      await page.waitForFunction(() => document.querySelectorAll('#drawSvg circle').length >= 1);

      assert.deepEqual(runtimeErrors, []);
    } finally {
      await browser.close();
    }
  });

  await rm(tempDir, { recursive: true, force: true });
});

test('freehand clicks add anchors and Enter commits the path', {
  skip: process.env.CI === 'true' ? 'Playwright browser flow is local-only; CI runs static and unit coverage.' : false,
}, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (_) {
    t.skip('Playwright is not available in this environment.');
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'takeoff-freehand-'));
  const imagePath = path.join(tempDir, 'plan.png');
  await writeFile(imagePath, pngBuffer(800, 600));

  await withViteServer(async (baseUrl) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(baseUrl);
      await page.locator('#fileInput').setInputFiles(imagePath);
      await page.waitForFunction(() => !document.body.classList.contains('no-document'));

      await page.locator('#measureModeToggle').click();
      await page.locator('.measure-mode-option[data-value="freehand"]').click();
      await page.locator('#baseCanvas').waitFor({ state: 'visible' });

      const canvasBox = await page.locator('#baseCanvas').boundingBox();
      assert.ok(canvasBox, 'draw canvas is visible');
      const points = [
        { x: canvasBox.x + 180, y: canvasBox.y + 180 },
        { x: canvasBox.x + 280, y: canvasBox.y + 220 },
        { x: canvasBox.x + 380, y: canvasBox.y + 170 },
        { x: canvasBox.x + 480, y: canvasBox.y + 240 },
      ];

      for (const [index, point] of points.entries()) {
        await page.mouse.click(point.x, point.y);
        assert.equal(await page.locator('.meas-item').count(), 0, 'freehand should not commit on click');
        const draftAnchorCount = await page.evaluate(() => document.querySelectorAll('#drawSvg circle').length);
        assert.equal(draftAnchorCount, index + 1, 'freehand draft should show one anchor per click');
      }

      await page.keyboard.press('Enter');
      await page.locator('.meas-item').waitFor({ state: 'visible' });
      const finalState = await page.evaluate(() => {
        const svg = document.querySelector('#drawSvg');
        const pathCount = svg?.querySelectorAll('path').length || 0;
        const anchorCount = svg?.querySelectorAll('circle').length || 0;
        return {
          measurementCount: document.querySelectorAll('.meas-item').length,
          pointCountText: document.querySelector('.meas-item .point-count')?.textContent?.trim() || '',
          pathCount,
          anchorCount,
        };
      });

      assert.equal(finalState.measurementCount, 1);
      assert.match(finalState.pointCountText, /\d+/);
      assert.ok(finalState.pathCount >= 1, 'committed freehand path is rendered');
      assert.ok(finalState.anchorCount >= points.length, 'committed freehand anchors are rendered');
    } finally {
      await browser.close();
    }
  });

  await rm(tempDir, { recursive: true, force: true });
});
test('Space pan pauses active freehand draft point collection', {
  skip: process.env.CI === 'true' ? 'Playwright browser flow is local-only; CI runs static and unit coverage.' : false,
}, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (_) {
    t.skip('Playwright is not available in this environment.');
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'takeoff-freehand-pause-'));
  const imagePath = path.join(tempDir, 'plan.png');
  await writeFile(imagePath, pngBuffer(800, 600));

  await withViteServer(async (baseUrl) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(baseUrl);
      await page.locator('#fileInput').setInputFiles(imagePath);
      await page.waitForFunction(() => !document.body.classList.contains('no-document'));

      await page.locator('#measureModeToggle').click();
      await page.locator('.measure-mode-option[data-value="freehand"]').click();
      await page.locator('#baseCanvas').waitFor({ state: 'visible' });

      const canvasBox = await page.locator('#baseCanvas').boundingBox();
      assert.ok(canvasBox, 'draw canvas is visible');
      const start = { x: canvasBox.x + 180, y: canvasBox.y + 180 };
      await page.mouse.click(start.x, start.y);

      const pathCountBeforeSpace = await page.locator('#drawSvg path').count();
      await page.keyboard.down('Space');
      await page.mouse.move(start.x + 40, start.y + 10);
      await page.mouse.move(start.x + 80, start.y + 20);
      await page.mouse.move(start.x + 120, start.y + 35);
      assert.equal(await page.locator('#drawSvg path').count(), pathCountBeforeSpace, 'Space-held movement should not grow the freehand preview');
      await page.keyboard.up('Space');

      await page.mouse.click(start.x + 160, start.y + 50);
      await page.keyboard.press('Enter');
      await page.locator('.meas-item').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.meas-item').count(), 1);
    } finally {
      await browser.close();
    }
  });

  await rm(tempDir, { recursive: true, force: true });
});

test('Snap hotkey toggles paths and Space pan preserves an active line draft', {
  skip: process.env.CI === 'true' ? 'Playwright browser flow is local-only; CI runs static and unit coverage.' : false,
}, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (_) {
    t.skip('Playwright is not available in this environment.');
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'takeoff-hotkey-pan-'));
  const imagePath = path.join(tempDir, 'plan.png');
  await writeFile(imagePath, pngBuffer(800, 600));

  await withViteServer(async (baseUrl) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(baseUrl);
      await page.locator('#fileInput').setInputFiles(imagePath);
      await page.waitForFunction(() => !document.body.classList.contains('no-document'));
      await page.locator('#baseCanvas').waitFor({ state: 'visible' });

      const snapToggle = page.locator('#snapToPaths');
      await snapToggle.waitFor({ state: 'visible' });
      assert.equal(await snapToggle.getAttribute('aria-pressed'), 'false');
      await page.locator('#fileInput').focus();
      await page.keyboard.press('x');
      assert.equal(await snapToggle.getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('x');
      assert.equal(await snapToggle.getAttribute('aria-pressed'), 'false');

      await page.locator('#measureModeToggle').click();
      await page.locator('.measure-mode-option[data-value="line"]').click();

      const canvasBox = await page.locator('#baseCanvas').boundingBox();
      assert.ok(canvasBox, 'draw canvas is visible');
      const start = { x: canvasBox.x + 180, y: canvasBox.y + 180 };
      const end = { x: canvasBox.x + 360, y: canvasBox.y + 240 };

      await page.mouse.click(start.x, start.y);
      assert.equal(await page.locator('.meas-item').count(), 0, 'line draft should not commit after one point');
      assert.equal(await page.locator('#drawSvg circle').count(), 1, 'line draft should show its first anchor');

      await page.keyboard.down('Space');
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 60, start.y + 40);
      await page.mouse.up();
      assert.ok(await page.locator('#drawSvg circle').count() >= 1, 'Space pan should keep the line draft visible');
      await page.keyboard.up('Space');

      await page.mouse.click(end.x, end.y);
      await page.keyboard.press('Enter');
      await page.locator('.meas-item').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.meas-item').count(), 1);
    } finally {
      await browser.close();
    }
  });

  await rm(tempDir, { recursive: true, force: true });
});

test('line path closes by snapping back to its start and exposes Area', {
  skip: process.env.CI === 'true' ? 'Playwright browser flow is local-only; CI runs static and unit coverage.' : false,
}, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (_) {
    t.skip('Playwright is not available in this environment.');
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'takeoff-line-area-'));
  const imagePath = path.join(tempDir, 'plan.png');
  await writeFile(imagePath, pngBuffer(800, 600));

  await withViteServer(async (baseUrl) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(baseUrl);
      await page.locator('#fileInput').setInputFiles(imagePath);
      await page.waitForFunction(() => !document.body.classList.contains('no-document'));
      await page.locator('#baseCanvas').waitFor({ state: 'visible' });

      const snapToggle = page.locator('#snapToPaths');
      await snapToggle.click();
      assert.equal(await snapToggle.getAttribute('aria-pressed'), 'true');
      await page.locator('#measureModeToggle').click();
      await page.locator('.measure-mode-option[data-value="line"]').click();

      const canvasBox = await page.locator('#baseCanvas').boundingBox();
      assert.ok(canvasBox, 'draw canvas is visible');
      const points = [
        { x: canvasBox.x + 220, y: canvasBox.y + 180 },
        { x: canvasBox.x + 360, y: canvasBox.y + 180 },
        { x: canvasBox.x + 360, y: canvasBox.y + 300 },
        { x: canvasBox.x + 222, y: canvasBox.y + 182 },
      ];

      for (const point of points) await page.mouse.click(point.x, point.y);

      await page.locator('.meas-item').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.meas-item').count(), 1, 'self-closing snap should finish the path');
      await page.mouse.click((points[0].x + points[1].x) / 2, points[0].y, { button: 'right' });
      const areaButton = page.locator('#contextMenu [data-action="toggle-area"]');
      await areaButton.waitFor({ state: 'visible' });
      assert.equal(await areaButton.innerText(), 'Area');
    } finally {
      await browser.close();
    }
  });

  await rm(tempDir, { recursive: true, force: true });
});

test('canvas length and area labels follow the right-panel unit selector', {
  skip: process.env.CI === 'true' ? 'Playwright browser flow is local-only; CI runs static and unit coverage.' : false,
}, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (_) {
    t.skip('Playwright is not available in this environment.');
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'takeoff-unit-labels-'));
  const imagePath = path.join(tempDir, 'plan.png');
  await writeFile(imagePath, pngBuffer(800, 600));

  await withViteServer(async (baseUrl) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(baseUrl);
      await page.locator('#fileInput').setInputFiles(imagePath);
      await page.waitForFunction(() => !document.body.classList.contains('no-document'));
      await page.locator('#baseCanvas').waitFor({ state: 'visible' });
      const canvasBox = await page.locator('#baseCanvas').boundingBox();
      assert.ok(canvasBox, 'draw canvas is visible');

      await page.locator('#btn-calibrate').click();
      await page.mouse.click(canvasBox.x + 120, canvasBox.y + 120);
      await page.mouse.click(canvasBox.x + 240, canvasBox.y + 120);
      await page.locator('#calibModal.show').waitFor({ state: 'visible' });
      await page.locator('#calibValue').fill('10');
      await page.locator('#calibOk').click();
      await page.locator('#calibModal.show').waitFor({ state: 'hidden' });

      const snapToggle = page.locator('#snapToPaths');
      await snapToggle.click();
      assert.equal(await snapToggle.getAttribute('aria-pressed'), 'true');
      await page.locator('#measureModeToggle').click();
      await page.locator('.measure-mode-option[data-value="line"]').click();

      const points = [
        { x: canvasBox.x + 280, y: canvasBox.y + 180 },
        { x: canvasBox.x + 420, y: canvasBox.y + 180 },
        { x: canvasBox.x + 420, y: canvasBox.y + 300 },
        { x: canvasBox.x + 282, y: canvasBox.y + 182 },
      ];
      for (const point of points) await page.mouse.click(point.x, point.y);
      await page.locator('.meas-item').waitFor({ state: 'visible' });

      await page.mouse.click((points[0].x + points[1].x) / 2, points[0].y, { button: 'right' });
      const areaButton = page.locator('#contextMenu [data-action="toggle-area"]');
      await areaButton.waitFor({ state: 'visible' });
      await areaButton.click();
      await page.waitForFunction(() => !!document.querySelector('#drawSvg .canvas-area-overlay text'));

      const initialCanvasLabels = await page.evaluate(() => ({
        length: document.querySelector('#drawSvg .canvas-length-tag text')?.textContent || '',
        area: document.querySelector('#drawSvg .canvas-area-overlay text')?.textContent || '',
      }));
      assert.match(initialCanvasLabels.length, /\sft$/);
      assert.match(initialCanvasLabels.area, /ft\u00b2$/);
      assert.doesNotMatch(initialCanvasLabels.area, /sq/);

      await page.locator('#unitSelectButton').click();
      await page.locator('.unit-option[data-value="m"]').click();
      await page.waitForFunction(() => document.querySelector('#totalUnit')?.textContent === 'm');
      await page.waitForFunction(() => document.querySelector('#drawSvg .canvas-area-overlay text')?.textContent?.endsWith('m\u00b2'));

      const updatedCanvasLabels = await page.evaluate(() => ({
        totalUnit: document.querySelector('#totalUnit')?.textContent || '',
        length: document.querySelector('#drawSvg .canvas-length-tag text')?.textContent || '',
        area: document.querySelector('#drawSvg .canvas-area-overlay text')?.textContent || '',
      }));
      assert.equal(updatedCanvasLabels.totalUnit, 'm');
      assert.match(updatedCanvasLabels.length, /\sm$/);
      assert.match(updatedCanvasLabels.area, /m\u00b2$/);
      assert.doesNotMatch(updatedCanvasLabels.area, /sq/);
    } finally {
      await browser.close();
    }
  });

  await rm(tempDir, { recursive: true, force: true });
});
