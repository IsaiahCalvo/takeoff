(function () {
  const ARROW_CLOSED = 'M4.5 3 7.5 6 4.5 9';
  const ARROW_OPEN = 'M7.5 3 4.5 6 7.5 9';

  function $(id) {
    return document.getElementById(id);
  }

  function createToolModeController({ state, measurementWorkflows, setMode, redraw, closeFitMenu } = {}) {
    const linearNormalize = value => (value === 'freehand' ? 'freehand' : 'line');
    const configs = {
      measure: { split: 'measureSplit', button: 'btn-measure', toggle: 'measureModeToggle', menu: 'measureModeMenu', key: 'measureDrawMode', fallback: 'line', height: 74, normalize: linearNormalize },
      circle: { split: 'circleSplit', button: 'btn-circle', toggle: 'circleModeToggle', menu: 'circleModeMenu', key: 'circleDrawMode', fallback: 'circle-radius', height: 134, normalize: value => measurementWorkflows.normalizeCircleDrawMode(value) },
      arc: { split: 'arcSplit', button: 'btn-arc', toggle: 'arcModeToggle', menu: 'arcModeMenu', key: 'arcDrawMode', fallback: 'arc-3p', height: 74, normalize: value => measurementWorkflows.normalizeArcDrawMode(value) },
    };

    function optionsFor(config) {
      return [...($(config.menu)?.querySelectorAll('.measure-mode-option') || [])];
    }

    function normalizeForTool(tool, value) {
      const config = configs[tool];
      return config.normalize(value || state[config.key] || config.fallback);
    }

    function closeTool(config) {
      $(config.split)?.classList.remove('open');
      $(config.toggle)?.setAttribute('aria-expanded', 'false');
      $(config.toggle)?.querySelector('path')?.setAttribute('d', ARROW_CLOSED);
      $(config.menu)?.classList.remove('show');
    }

    function closeAll() {
      Object.values(configs).forEach(closeTool);
    }

    function positionToolMenu(config) {
      const anchor = $(config.split);
      const menu = $(config.menu);
      if (!anchor || !menu) return;
      const rect = anchor.getBoundingClientRect();
      const menuWidth = 180;
      const menuHeight = config.height;
      menu.style.left = `${Math.max(6, Math.min(window.innerWidth - menuWidth - 6, rect.right + 8))}px`;
      menu.style.top = `${Math.max(6, Math.min(window.innerHeight - menuHeight - 6, rect.top + rect.height / 2 - menuHeight / 2))}px`;
    }

    function syncOptions() {
      Object.entries(configs).forEach(([tool, config]) => {
        const value = normalizeForTool(tool, state[config.key]);
        optionsFor(config).forEach(option => {
          const active = option.dataset.value === value;
          option.classList.toggle('active', active);
          option.setAttribute('aria-checked', active ? 'true' : 'false');
        });
      });
    }

    function setToolMode(tool, value) {
      const config = configs[tool];
      if (!config) return;
      const mode = normalizeForTool(tool, value);
      state.drawMode = mode;
      state[config.key] = mode;
      state.inProgress = null; state.freehandDraft = null; state.circleArcDraft = null; state.snapFeedback = null;
      syncOptions();
      setMode('measure');
      redraw?.();
    }

    function activateTool(tool) {
      setToolMode(tool, state[configs[tool]?.key]);
    }

    function syncActiveButtons() {
      const isMeasure = state.mode === 'measure';
      const drawMode = measurementWorkflows.normalizeDrawMode(state.drawMode);
      ['selection', 'calibrate', 'pan', 'erase'].forEach(mode => $('btn-' + mode)?.classList.toggle('active', state.mode === mode));
      $('btn-measure')?.classList.toggle('active', isMeasure && !measurementWorkflows.isCircleDrawMode(drawMode) && !measurementWorkflows.isArcDrawMode(drawMode));
      $('btn-circle')?.classList.toggle('active', isMeasure && measurementWorkflows.isCircleDrawMode(drawMode));
      $('btn-arc')?.classList.toggle('active', isMeasure && measurementWorkflows.isArcDrawMode(drawMode));
    }

    function containsTarget(target) {
      return Object.values(configs).some(config => $(config.split)?.contains(target) || $(config.menu)?.contains(target));
    }

    function openMenu(tool) {
      const config = configs[tool];
      const open = !$(config.split)?.classList.contains('open');
      closeAll();
      closeFitMenu?.();
      $(config.split)?.classList.toggle('open', open);
      $(config.toggle)?.setAttribute('aria-expanded', open ? 'true' : 'false');
      $(config.toggle)?.querySelector('path')?.setAttribute('d', open ? ARROW_OPEN : ARROW_CLOSED);
      $(config.menu)?.classList.toggle('show', open);
      if (open) positionToolMenu(config);
    }

    function bind() {
      Object.entries(configs).forEach(([tool, config]) => {
        $(config.button)?.addEventListener('click', e => { e.stopPropagation(); activateTool(tool); closeAll(); });
        $(config.toggle)?.addEventListener('click', e => { e.stopPropagation(); openMenu(tool); });
        optionsFor(config).forEach(option => option.addEventListener('click', e => {
          e.stopPropagation();
          setToolMode(tool, option.dataset.value);
          closeAll();
        }));
      });
      document.addEventListener('click', e => {
        if (!containsTarget(e.target)) closeAll();
        if (!$('fitSplit')?.contains(e.target) && !$('fitMenu')?.contains(e.target)) closeFitMenu?.();
      });
      window.addEventListener('resize', () => { closeAll(); closeFitMenu?.(); });
      document.querySelector('header')?.addEventListener('scroll', () => { closeAll(); closeFitMenu?.(); });
      syncOptions();
      syncActiveButtons();
    }

    return { bind, activateTool, closeAll, syncActiveButtons, syncOptions };
  }

  window.TakeoffToolModeMenu = { createToolModeController };
})();
