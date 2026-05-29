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
