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

test('right-click context menu locks and unlocks a line measurement', {
  skip: process.env.CI === 'true' ? 'Playwright browser flow is local-only; CI runs static and unit coverage.' : false,
}, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (_) {
    t.skip('Playwright is not available in this environment.');
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'takeoff-lock-menu-'));
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
      await page.locator('.measure-mode-option[data-value="line"]').click();
      await page.locator('#baseCanvas').waitFor({ state: 'visible' });

      const canvasBox = await page.locator('#baseCanvas').boundingBox();
      assert.ok(canvasBox, 'draw canvas is visible');
      const start = { x: canvasBox.x + 180, y: canvasBox.y + 180 };
      const end = { x: canvasBox.x + 420, y: canvasBox.y + 260 };
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

      await page.mouse.click(start.x, start.y);
      await page.mouse.click(end.x, end.y);
      await page.keyboard.press('Enter');
      await page.locator('.meas-item').waitFor({ state: 'visible' });

      await page.mouse.click(midpoint.x, midpoint.y, { button: 'right' });
      const lockMenuItem = page.locator('#contextMenu.show [data-action="toggle-lock"]');
      await lockMenuItem.waitFor({ state: 'visible' });
      assert.equal(await lockMenuItem.textContent(), 'Lock');
      await lockMenuItem.click();
      await page.locator('#drawSvg .canvas-length-tag-lock-indicator.locked').waitFor({ state: 'attached' });
      assert.equal(await page.locator('#drawSvg .canvas-length-tag-accent').count(), 0);

      await page.locator('#btn-selection').click();
      const beforeDrag = await page.evaluate(() => {
        const anchor = document.querySelector('#drawSvg circle');
        const label = document.querySelector('#drawSvg .canvas-length-tag');
        const labelBox = label?.getBoundingClientRect();
        return {
          anchor: { cx: anchor?.getAttribute('cx'), cy: anchor?.getAttribute('cy') },
          labelBox: labelBox ? { x: labelBox.x, y: labelBox.y, width: labelBox.width, height: labelBox.height } : null,
        };
      });
      assert.ok(beforeDrag.labelBox, 'locked floating label is visible');
      const labelCenter = {
        x: beforeDrag.labelBox.x + beforeDrag.labelBox.width / 2,
        y: beforeDrag.labelBox.y + beforeDrag.labelBox.height / 2,
      };
      await page.mouse.move(labelCenter.x, labelCenter.y);
      await page.mouse.down();
      await page.mouse.move(labelCenter.x + 50, labelCenter.y - 35);
      await page.mouse.up();
      const afterLabelDrag = await page.evaluate(() => {
        const anchor = document.querySelector('#drawSvg circle');
        const label = document.querySelector('#drawSvg .canvas-length-tag');
        const labelBox = label?.getBoundingClientRect();
        return {
          anchor: { cx: anchor?.getAttribute('cx'), cy: anchor?.getAttribute('cy') },
          labelBox: labelBox ? { x: labelBox.x, y: labelBox.y, width: labelBox.width, height: labelBox.height } : null,
        };
      });

      assert.deepEqual(afterLabelDrag.anchor, beforeDrag.anchor);
      assert.ok(Math.abs(afterLabelDrag.labelBox.x - beforeDrag.labelBox.x) > 10 || Math.abs(afterLabelDrag.labelBox.y - beforeDrag.labelBox.y) > 10, 'locked label should move');

      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 80, start.y + 40);
      await page.mouse.up();
      const afterDrag = await page.evaluate(() => {
        const anchor = document.querySelector('#drawSvg circle');
        return { cx: anchor?.getAttribute('cx'), cy: anchor?.getAttribute('cy') };
      });

      assert.deepEqual(afterDrag, beforeDrag.anchor);

      await page.mouse.click(midpoint.x, midpoint.y, { button: 'right' });
      await lockMenuItem.waitFor({ state: 'visible' });
      assert.equal(await lockMenuItem.textContent(), 'Unlock');
      await lockMenuItem.click();
      await page.locator('#drawSvg .canvas-length-tag-lock-indicator.locked').waitFor({ state: 'detached' });
      await page.locator('#drawSvg .canvas-length-tag-accent').waitFor({ state: 'attached' });
      assert.equal(await page.locator('#drawSvg .canvas-length-tag-lock-indicator.unlocked').count(), 0);

      await page.mouse.click(midpoint.x, midpoint.y, { button: 'right' });
      await lockMenuItem.waitFor({ state: 'visible' });
      assert.equal(await lockMenuItem.textContent(), 'Lock');
    } finally {
      await browser.close();
    }
  });

  await rm(tempDir, { recursive: true, force: true });
});
