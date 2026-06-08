import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadContinuousPrewarm() {
  const source = await readFile(new URL('../src/app/continuous-prewarm.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'continuous-prewarm.js' });
  return sandbox.window.TakeoffContinuousPrewarm;
}

test('schedule starts continuous prewarm on the next browser turn', async () => {
  const prewarm = await loadContinuousPrewarm();
  const timers = [];
  const calls = [];
  const controller = prewarm.createContinuousPrewarmController({
    canPrewarm: () => true,
    groupPages: eligibility => eligibility.pages,
    cachedMatches: () => false,
    samePageNumbers: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    prewarm: async pages => calls.push(['prewarm', pages]),
    setTimer(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimer: () => {},
  });

  controller.schedule({ eligible: true, pages: [1, 2, 3] });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 0);
  assert.deepEqual(calls, []);
});

test('activatePending starts a scheduled prewarm immediately for instant toggle reuse', async () => {
  const prewarm = await loadContinuousPrewarm();
  const timers = [];
  const cleared = [];
  let warmed = false;
  const calls = [];
  const controller = prewarm.createContinuousPrewarmController({
    canPrewarm: () => true,
    groupPages: eligibility => eligibility.pages,
    cachedMatches: pages => warmed && JSON.stringify(pages) === JSON.stringify([1, 2]),
    samePageNumbers: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    prewarm: async (pages, options) => {
      calls.push(['prewarm', pages, options.allowContinuousMode]);
      assert.equal(options.isCurrent(), true);
      warmed = true;
    },
    setTimer(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimer: id => cleared.push(id),
  });

  controller.schedule({ eligible: true, pages: [1, 2] });
  const activated = await controller.activatePending([1, 2]);

  assert.equal(activated, true);
  assert.deepEqual(cleared, [1]);
  assert.deepEqual(calls, [['prewarm', [1, 2], true]]);
});

test('successful prewarm notifies when the hidden continuous layer is ready', async () => {
  const prewarm = await loadContinuousPrewarm();
  const timers = [];
  const readyCalls = [];
  let warmed = false;
  const controller = prewarm.createContinuousPrewarmController({
    canPrewarm: () => true,
    groupPages: eligibility => eligibility.pages,
    cachedMatches: pages => warmed && JSON.stringify(pages) === JSON.stringify([1, 2]),
    samePageNumbers: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    prewarm: async pages => {
      warmed = true;
      return pages.length > 0;
    },
    onReady: async pages => readyCalls.push(['ready', pages]),
    setTimer(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimer: () => {},
  });

  controller.schedule({ eligible: true, pages: [1, 2] });
  await timers[0].callback();

  assert.equal(JSON.stringify(readyCalls), JSON.stringify([['ready', [1, 2]]]));
});
