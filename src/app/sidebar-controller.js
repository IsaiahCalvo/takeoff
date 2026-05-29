(function () {
  function applyScopeChrome({ scopeTabs, totalHeading, tabs, model }) {
    scopeTabs.hidden = !model.showScopeTabs;
    totalHeading.textContent = model.totalHeadingText;
    for (const tab of tabs || []) {
      tab.classList.toggle('active', tab.dataset.tab === model.effectiveSidebarTab);
    }
  }

  window.TakeoffSidebarController = {
    applyScopeChrome,
  };
})();
