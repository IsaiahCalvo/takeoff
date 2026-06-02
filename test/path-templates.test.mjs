import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPathTemplates() {
  const source = await readFile(new URL('../src/app/path-templates.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'path-templates.js' });
  return sandbox.window.TakeoffPathTemplates;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('creates a default path template and active path for new app state', async () => {
  const pathTemplates = await loadPathTemplates();

  const state = pathTemplates.createInitialPathTemplateState();

  assert.equal(state.pathTemplates.length, 1);
  assert.equal(state.pathTemplates[0].id, 'default-path-template');
  assert.equal(state.pathTemplates[0].title, 'Default');
  assert.equal(state.pathTemplates[0].paths.length, 1);
  assert.deepEqual(plain(state.pathTemplates[0].paths[0]), {
    id: 'default-path',
    templateId: 'default-path-template',
    name: 'Path',
    geometry: 'line',
    stroke: {
      color: '#b6ff3c',
      style: 'solid',
    },
    anchors: {
      fill: '#ffffff',
      border: '#b6ff3c',
      borderMatchesStroke: true,
    },
    order: 0,
  });
  assert.equal(state.activePathTemplateId, 'default-path-template');
  assert.equal(state.activePathId, 'default-path');
});

test('normalizes templates and paths with safe fallbacks for invalid styles', async () => {
  const pathTemplates = await loadPathTemplates();

  const state = pathTemplates.normalizePathTemplateState({
    pathTemplates: [{
      id: 'template-1',
      title: '  ',
      paths: [{
        id: 'path-1',
        templateId: 'wrong-template',
        name: '  ',
        geometry: 'curve',
        stroke: {
          color: '',
          style: 'dashdot',
        },
        anchors: {
          fill: '',
          border: '',
          borderMatchesStroke: false,
        },
        order: 'first',
      }],
    }],
    activePathTemplateId: 'missing-template',
    activePathId: 'missing-path',
  });

  assert.deepEqual(plain(state), {
    pathTemplates: [{
      id: 'template-1',
      title: 'Untitled template',
      paths: [{
        id: 'path-1',
        templateId: 'template-1',
        name: 'Untitled path',
        geometry: 'line',
        stroke: {
          color: '#b6ff3c',
          style: 'solid',
        },
        anchors: {
          fill: '#ffffff',
          border: '#b6ff3c',
          borderMatchesStroke: false,
        },
        order: 0,
      }],
    }],
    activePathTemplateId: 'template-1',
    activePathId: 'path-1',
  });
});

test('selects active templates and paths through normalized helpers', async () => {
  const pathTemplates = await loadPathTemplates();
  const initial = pathTemplates.createInitialPathTemplateState();
  const withTemplate = pathTemplates.addPathTemplate(initial, {
    id: 'template-2',
    title: 'Rough-in',
    paths: [{
      id: 'path-2',
      name: 'Conduit',
      geometry: 'freehand',
      stroke: {
        color: '#4cd6ff',
        style: 'dashed',
      },
      anchors: {
        fill: '#111827',
        border: '#4cd6ff',
        borderMatchesStroke: true,
      },
      order: 3,
    }],
  });

  const selected = pathTemplates.selectPath(withTemplate, 'template-2', 'path-2');

  assert.equal(selected.activePathTemplateId, 'template-2');
  assert.equal(selected.activePathId, 'path-2');
  assert.equal(selected.pathTemplates[1].paths[0].templateId, 'template-2');
  assert.equal(selected.pathTemplates[1].paths[0].geometry, 'freehand');
  assert.equal(pathTemplates.activePathForState(selected).id, 'path-2');
  assert.deepEqual(plain(initial.pathTemplates), plain(pathTemplates.createInitialPathTemplateState().pathTemplates));
});

test('activePathForState falls back to the first path in the active template', async () => {
  const pathTemplates = await loadPathTemplates();
  const state = pathTemplates.normalizePathTemplateState({
    pathTemplates: [{
      id: 'template-1',
      title: 'Security',
      paths: [
        { id: 'path-1', templateId: 'template-1', name: 'Cat 6', order: 0 },
        { id: 'path-2', templateId: 'template-1', name: 'Fiber', order: 1 },
      ],
    }],
    activePathTemplateId: 'template-1',
    activePathId: 'missing-path',
  });

  assert.equal(pathTemplates.activePathForState(state).id, 'path-1');
});

test('renames, deletes, and updates path styling without mutating the source state', async () => {
  const pathTemplates = await loadPathTemplates();
  const initial = pathTemplates.addPath(
    pathTemplates.createInitialPathTemplateState(),
    'default-path-template',
    {
      id: 'path-2',
      name: 'Branch',
      stroke: { color: '#4cd6ff', style: 'dashed' },
      anchors: { fill: '#111827', border: '#4cd6ff', borderMatchesStroke: true },
      order: 1,
    },
  );

  const renamed = pathTemplates.renamePath(initial, 'default-path-template', 'path-2', 'Branch home run');
  const restyled = pathTemplates.updatePathStyle(renamed, 'default-path-template', 'path-2', {
    stroke: { color: '#ff9b3c', style: 'dotted' },
    anchors: { borderMatchesStroke: false, border: '#222222' },
  });
  const deleted = pathTemplates.deletePath(restyled, 'default-path-template', 'default-path');

  assert.equal(initial.pathTemplates[0].paths[1].name, 'Branch');
  assert.equal(renamed.pathTemplates[0].paths[1].name, 'Branch home run');
  assert.deepEqual(plain(restyled.pathTemplates[0].paths[1].stroke), {
    color: '#ff9b3c',
    style: 'dotted',
  });
  assert.deepEqual(plain(restyled.pathTemplates[0].paths[1].anchors), {
    fill: '#111827',
    border: '#222222',
    borderMatchesStroke: false,
  });
  assert.deepEqual(plain(deleted.pathTemplates[0].paths.map(path => path.id)), ['path-2']);
  assert.equal(deleted.activePathId, 'path-2');
});
