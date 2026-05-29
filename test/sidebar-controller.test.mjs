import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadSidebarController() {
  const source = await readFile(new URL('../src/app/sidebar-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'sidebar-controller.js' });
  return sandbox.window.TakeoffSidebarController;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('applyScopeChrome hides tabs and marks the effective tab active', async () => {
  const sidebar = await loadSidebarController();
  const scopeTabs = { hidden: false };
  const totalHeading = { textContent: '' };
  const tabs = [
    { dataset: { tab: 'page' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
    { dataset: { tab: 'all' }, classList: { active: false, toggle(_, value) { this.active = value; } } },
  ];

  sidebar.applyScopeChrome({
    scopeTabs,
    totalHeading,
    tabs,
    model: { showScopeTabs: false, totalHeadingText: 'Total', effectiveSidebarTab: 'all' },
  });

  assert.equal(scopeTabs.hidden, true);
  assert.equal(totalHeading.textContent, 'Total');
  assert.equal(tabs[0].classList.active, false);
  assert.equal(tabs[1].classList.active, true);
});

test('applyPageGroupCollapsedState keeps page group chrome in sync', async () => {
  const sidebar = await loadSidebarController();
  const groupClasses = new Set(['page-group', 'open']);
  const attrs = {};
  const toggleAttrs = {};
  const iconPathAttrs = {};
  const toggle = {
    title: '',
    setAttribute(name, value) { toggleAttrs[name] = value; },
  };
  const iconPath = {
    setAttribute(name, value) { iconPathAttrs[name] = value; },
  };
  const groupEl = {
    classList: {
      toggle(name, value) {
        if (value) groupClasses.add(name);
        else groupClasses.delete(name);
      },
    },
  };
  const header = {
    setAttribute(name, value) { attrs[name] = value; },
    querySelector(selector) {
      if (selector === '.collapse-toggle') return toggle;
      if (selector === '.collapse-toggle-icon path') return iconPath;
      return null;
    },
  };

  sidebar.applyPageGroupCollapsedState({
    groupEl,
    header,
    page: 2,
    collapsed: true,
    collapseIconPath: collapsed => collapsed ? 'collapsed-path' : 'open-path',
  });

  assert.equal(groupClasses.has('collapsed'), true);
  assert.equal(groupClasses.has('open'), false);
  assert.equal(attrs['aria-expanded'], 'false');
  assert.equal(toggleAttrs['aria-expanded'], 'false');
  assert.equal(toggleAttrs['aria-label'], 'Expand page 2');
  assert.equal(toggle.title, 'Expand page 2');
  assert.equal(iconPathAttrs.d, 'collapsed-path');
});

test('setPageInfoOpen updates tooltip visibility state and accessibility', async () => {
  const sidebar = await loadSidebarController();
  const classes = new Set();
  const attrs = {};
  const button = {
    classList: {
      toggle(name, value) {
        if (value) classes.add(name);
        else classes.delete(name);
      },
      remove(name) {
        classes.delete(name);
      },
    },
    setAttribute(name, value) { attrs[name] = value; },
  };

  sidebar.setPageInfoOpen(button, true);
  assert.equal(classes.has('is-open'), true);
  assert.equal(attrs['aria-expanded'], 'true');

  sidebar.setPageInfoOpen(button, false);
  assert.equal(classes.has('is-open'), false);
  assert.equal(attrs['aria-expanded'], 'false');
});

test('buildMeasurementItemViewModel prepares sidebar row display data', async () => {
  const sidebar = await loadSidebarController();
  const measurement = {
    id: 8,
    name: '  Custom run  ',
    color: '#b6ff3c',
    points: [{}, {}, {}],
    page: 2,
    lengthInches: 24,
  };

  const model = sidebar.buildMeasurementItemViewModel({
    measurement,
    currentPage: 1,
    selectedId: 8,
    unit: 'feet',
    cleanMeasurementName: value => value.trim(),
    formatLength: inches => `${inches / 12}`,
    unitLabel: () => 'ft',
    measurementItemClass: ({ selected, isUnscaled }) => `item ${selected ? 'selected' : ''} ${isUnscaled ? 'unscaled' : ''}`.trim(),
  });

  assert.deepEqual(plain(model), {
    color: '#b6ff3c',
    name: 'Custom run',
    pointCount: 3,
    page: 2,
    onOtherPage: true,
    isUnscaled: false,
    lengthHtml: '2 <span class="unit">ft</span>',
    measurementId: 8,
    className: 'item selected',
  });
});
