import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPathSettings() {
  const [pathAggregation, pathSettings] = await Promise.all([
    readFile(new URL('../src/app/path-aggregation.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/path-settings.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {}, setTimeout: (fn) => { fn(); return 0; } };
  vm.createContext(sandbox);
  vm.runInContext(pathAggregation, sandbox, { filename: 'path-aggregation.js' });
  vm.runInContext(pathSettings, sandbox, { filename: 'path-settings.js' });
  return sandbox.window.TakeoffPathSettings;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(id, root = null) {
    this.id = id;
    this.root = root;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.isConnected = true;
    this.children = [];
    this.listeners = {};
    this.classList = new FakeClassList();
    this.optionsByValue = new Map();
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  appendChild(child) {
    this.children.push(child);
    if (child?.value) this.optionsByValue.set(child.value, child);
    return child;
  }

  replaceChildren() {
    this.children = [];
    this.optionsByValue = new Map();
  }

  querySelector(selector) {
    const value = selector.match(/option\[value="([^"]+)"\]/)?.[1];
    return value ? this.optionsByValue.get(value) : null;
  }

  contains(target) {
    return target === this || target?.parentModal === this;
  }

  focus() {
    this.focused = true;
    if (this.root) this.root.activeElement = this;
  }

  blur() {
    this.blurred = true;
    if (this.root?.activeElement === this) this.root.activeElement = null;
  }

  setAttribute(name, value) {
    this[name] = value ?? true;
  }

  toggleAttribute(name, force) {
    if (force === false) delete this[name];
    else this[name] = true;
  }

  click() {
    this.listeners.click?.({ target: this });
  }
}

function createPathSettingsFixture() {
  const elements = new Map();
  const root = {
    activeElement: null,
    createElement(tagName) {
      return { tagName, textContent: '', value: '' };
    },
    getElementById(id) {
      return elements.get(id);
    },
  };
  const modal = new FakeElement('pathSettingsModal', root);
  const ids = [
    'pathSettingsSummary',
    'pathSettingsName',
    'pathSettingsLineColor',
    'pathSettingsLineBorder',
    'pathSettingsLineBorderMatches',
    'pathSettingsLineStyle',
    'pathSettingsAnchorFill',
    'pathSettingsAnchorBorder',
    'pathSettingsAnchorBorderMatches',
    'pathSettingsPreview',
    'pathSettingsCategory',
    'pathSettingsNewCategoryField',
    'pathSettingsNewCategory',
    'pathSettingsScope',
    'pathSettingsCancel',
    'pathSettingsApply',
  ];
  elements.set('pathSettingsModal', modal);
  for (const id of ids) {
    const element = new FakeElement(id, root);
    element.parentModal = modal;
    elements.set(id, element);
  }
  const scope = elements.get('pathSettingsScope');
  for (const value of ['run', 'page', 'document', 'template']) {
    scope.appendChild({ value, textContent: value, disabled: false });
  }
  scope.value = 'document';
  elements.get('pathSettingsLineColor').value = '#b6ff3c';
  elements.get('pathSettingsLineBorder').value = '#b6ff3c';
  elements.get('pathSettingsLineBorderMatches').checked = true;
  elements.get('pathSettingsLineStyle').value = 'solid';
  elements.get('pathSettingsAnchorFill').value = '#ffffff';
  elements.get('pathSettingsAnchorBorder').value = '#b6ff3c';
  elements.get('pathSettingsAnchorBorderMatches').checked = true;
  return { root, elements };
}

const lineStyle = {
  stroke: { color: '#ff9b3c', style: 'dotted', border: '#111619', borderMatchesFill: false },
  anchors: { fill: '#101820', border: '#f7fbfc', borderMatchesStroke: false },
};

const measurements = [
  {
    id: 'run-1',
    page: 1,
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6',
    pathStyle: { stroke: { color: '#b6ff3c', style: 'solid' }, anchors: { fill: '#fff', border: '#b6ff3c', borderMatchesStroke: true } },
    pathCategoryId: 'rough-in',
    pathCategoryName: 'Rough-in',
  },
  {
    id: 'run-2',
    page: 1,
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6',
  },
  {
    id: 'run-3',
    page: 2,
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6',
  },
  {
    id: 'other-path',
    page: 1,
    pathTemplateId: 'template-security',
    pathId: 'path-fiber',
    pathName: 'Fiber',
  },
  {
    id: 'legacy',
    page: 1,
    name: 'Legacy run',
  },
];

test('Path Settings applies style and category to the requested measurement scope only', async () => {
  const settings = await loadPathSettings();
  const target = {
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    currentPage: 1,
    currentMeasurementId: 'run-2',
  };
  const patch = {
    pathName: 'Cat 6 Revised',
    pathStyle: lineStyle,
    pathCategoryId: 'low-voltage',
    pathCategoryName: 'Low Voltage',
  };

  const runResult = settings.applyPathSettingsToMeasurements(measurements, target, patch, { scope: 'run' });
  assert.deepEqual(plain(runResult.changedIds), ['run-2']);
  assert.equal(runResult.measurements.find(item => item.id === 'run-2').pathName, 'Cat 6 Revised');
  assert.equal(runResult.measurements.find(item => item.id === 'run-1').pathName, 'Cat 6');

  const pageResult = settings.applyPathSettingsToMeasurements(measurements, target, patch, { scope: 'page' });
  assert.deepEqual(plain(pageResult.changedIds), ['run-1', 'run-2']);
  assert.equal(pageResult.measurements.find(item => item.id === 'run-3').pathName, 'Cat 6');

  const documentResult = settings.applyPathSettingsToMeasurements(measurements, target, patch, { scope: 'document' });
  assert.deepEqual(plain(documentResult.changedIds), ['run-1', 'run-2', 'run-3']);
  assert.deepEqual(plain(documentResult.measurements.find(item => item.id === 'run-3').pathStyle), lineStyle);
  assert.equal(documentResult.measurements.find(item => item.id === 'run-3').color, '#ff9b3c');
  assert.deepEqual(plain(documentResult.measurements.find(item => item.id === 'other-path')), plain(measurements[3]));
  assert.deepEqual(plain(documentResult.measurements.find(item => item.id === 'legacy')), plain(measurements[4]));
  assert.deepEqual(plain(measurements[0].pathStyle.stroke), { color: '#b6ff3c', style: 'solid' });
});

test('Path Settings can clear category metadata without damaging legacy measurements', async () => {
  const settings = await loadPathSettings();
  const source = [
    {
      id: 'run-1',
      page: 1,
      pathTemplateId: 'template-security',
      pathId: 'path-cat6',
      pathCategoryId: 'low-voltage',
      pathCategoryName: 'Low Voltage',
      categoryId: 'legacy-alias',
      categoryName: 'Legacy alias',
      pathCategory: { id: 'low-voltage', name: 'Low Voltage' },
      category: { id: 'legacy-alias', name: 'Legacy alias' },
    },
    { id: 'legacy', page: 1, categoryName: 'Do not touch' },
  ];

  const result = settings.applyPathSettingsToMeasurements(source, {
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    currentPage: 1,
    currentMeasurementId: 'run-1',
  }, { pathStyle: lineStyle, pathCategoryId: null, pathCategoryName: null }, { scope: 'document' });

  const updated = result.measurements[0];
  assert.equal(updated.pathCategoryId, undefined);
  assert.equal(updated.pathCategoryName, undefined);
  assert.equal(updated.pathCategory, undefined);
  assert.equal(updated.categoryId, undefined);
  assert.equal(updated.categoryName, undefined);
  assert.equal(updated.category, undefined);
  assert.deepEqual(plain(result.measurements[1]), plain(source[1]));
});

test('Path Settings can update style while preserving existing categories', async () => {
  const settings = await loadPathSettings();
  const result = settings.applyPathSettingsToMeasurements(measurements, {
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    currentPage: 1,
    currentMeasurementId: 'run-1',
  }, { pathStyle: lineStyle }, { scope: 'document' });

  assert.deepEqual(plain(result.changedIds), ['run-1', 'run-2', 'run-3']);
  assert.equal(result.measurements.find(item => item.id === 'run-1').pathCategoryId, 'rough-in');
  assert.equal(result.measurements.find(item => item.id === 'run-1').pathCategoryName, 'Rough-in');
});

test('Path Settings treats mixed category groups as keep-existing by default', async () => {
  const settings = await loadPathSettings();
  const groupSettings = settings.pathSettingsFromGroup({
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    displayName: 'Cat 6',
    categoryName: 'Mixed categories',
    hasMixedCategories: true,
  });

  assert.equal(groupSettings.hasMixedCategories, true);
  assert.equal(groupSettings.pathCategoryId, null);
  assert.equal(groupSettings.pathCategoryName, null);
  assert.deepEqual(plain(settings.categoryFromSelection({ value: settings.CATEGORY_KEEP_VALUE })), {
    keep: true,
    id: null,
    name: null,
  });
});

test('Path Settings modal syncs hidden-category selection state and restores focus on close', async () => {
  const settings = await loadPathSettings();
  const { root, elements } = createPathSettingsFixture();
  const events = [];
  const trigger = new FakeElement('pathSettingsTrigger', root);
  trigger.isConnected = true;
  root.activeElement = trigger;
  const state = {
    selectedId: 'run-1',
    sidebarTab: 'all',
    pathTemplates: [{ id: 'template-security', paths: [{ id: 'path-cat6' }] }],
    measurements: [{
      id: 'run-1',
      page: 1,
      pathTemplateId: 'template-security',
      pathId: 'path-cat6',
      pathName: 'Cat 6',
      pathCategoryId: 'rough-in',
      pathCategoryName: 'Rough-in',
    }],
  };
  const modal = settings.createPathSettingsModal({
    root,
    getElement: id => elements.get(id),
    state,
    renderer: { renderPathStylePreviewSvg: () => '<svg></svg>' },
    pathTemplates: { updatePathSettings: nextState => nextState },
    currentPage: () => 1,
    createHistorySnapshot: () => ({ before: true }),
    setMeasurements(nextMeasurements) {
      events.push('setMeasurements');
      state.measurements = nextMeasurements;
    },
    syncSelectionWithPathCategoryVisibility() {
      events.push('syncSelection');
      state.selectedId = null;
    },
    recordHistory() {
      events.push(`history:${state.selectedId ?? 'none'}`);
      return true;
    },
    renderList() {
      events.push('renderList');
    },
    redraw() {
      events.push('redraw');
    },
  });

  modal.open({
    id: 'path:template-security:path-cat6',
    settingsAvailable: true,
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6',
    displayName: 'Cat 6',
    pathStyle: lineStyle,
    measurements: state.measurements,
  }, trigger);
  elements.get('pathSettingsScope').value = 'document';
  elements.get('pathSettingsCategory').value = '';
  elements.get('pathSettingsApply').click();

  assert.deepEqual(plain(events), ['setMeasurements', 'syncSelection', 'history:none', 'renderList', 'redraw']);
  assert.equal(elements.get('pathSettingsName').blurred, true);
  assert.equal(root.activeElement, trigger);
  assert.equal(trigger.focused, true);
});

test('Path Settings builds category options and creates a Path category id from a new label', async () => {
  const settings = await loadPathSettings();
  const options = settings.categoryOptionsFromState({
    pathTemplates: [{
      paths: [
        { pathCategoryId: 'low-voltage', pathCategoryName: 'Low Voltage' },
        { categoryId: 'power', categoryName: 'Power' },
      ],
    }],
    measurements: [
      { pathCategoryName: 'Security' },
      { category: { id: 'power', name: 'Power' } },
    ],
  }, { pathCategoryId: 'rough-in', pathCategoryName: 'Rough-in' });

  assert.deepEqual(plain(options.map(option => option.name)), ['Low Voltage', 'Power', 'Rough-in', 'Security']);
  assert.deepEqual(plain(settings.categoryFromSelection({
    value: '__new__',
    newName: '  Fire Alarm / Level 2 ',
    options,
  })), {
    id: 'fire-alarm-level-2',
    name: 'Fire Alarm / Level 2',
  });
  assert.deepEqual(plain(settings.categoryFromSelection({ value: '', options })), { id: null, name: null });
});
