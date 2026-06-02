import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function runSource(sandbox, path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  vm.runInContext(source, sandbox, { filename: path });
}

async function loadPathTemplateStore() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  await runSource(sandbox, '../src/app/path-templates.js');
  await runSource(sandbox, '../src/app/path-template-store.js');
  return sandbox.window;
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('persists app-level path templates through injectable storage', async () => {
  const takeoff = await loadPathTemplateStore();
  const storage = createMemoryStorage();
  const store = takeoff.TakeoffPathTemplateStore.createPathTemplateStore({ storage });
  const state = takeoff.TakeoffPathTemplates.selectPath(
    takeoff.TakeoffPathTemplates.addPathTemplate(
      takeoff.TakeoffPathTemplates.createInitialPathTemplateState(),
      {
        id: 'template-2',
        title: 'Low voltage',
        paths: [{
          id: 'path-2',
          name: 'Data',
          geometry: 'freehand',
          stroke: { color: '#4cd6ff', style: 'dashed' },
          anchors: { fill: '#111827', border: '#4cd6ff', borderMatchesStroke: true },
          order: 1,
        }],
      },
    ),
    'template-2',
    'path-2',
  );

  assert.equal(store.save(state), true);
  const loaded = store.load();

  assert.deepEqual(plain(loaded), plain(state));
  assert.equal(JSON.parse(storage.getItem(takeoff.TakeoffPathTemplateStore.STORAGE_KEY)).activePathId, 'path-2');
});

test('falls back to the default template when persisted storage is corrupted', async () => {
  const takeoff = await loadPathTemplateStore();
  const storage = createMemoryStorage({
    [takeoff.TakeoffPathTemplateStore.STORAGE_KEY]: '{not json',
  });
  const store = takeoff.TakeoffPathTemplateStore.createPathTemplateStore({ storage });

  const loaded = store.load();

  assert.deepEqual(plain(loaded), plain(takeoff.TakeoffPathTemplates.createInitialPathTemplateState()));
});

test('falls back to the default template when storage is unavailable', async () => {
  const takeoff = await loadPathTemplateStore();
  const store = takeoff.TakeoffPathTemplateStore.createPathTemplateStore({
    storage: {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    },
  });

  assert.deepEqual(plain(store.load()), plain(takeoff.TakeoffPathTemplates.createInitialPathTemplateState()));
  assert.equal(store.save(takeoff.TakeoffPathTemplates.createInitialPathTemplateState()), false);
});
