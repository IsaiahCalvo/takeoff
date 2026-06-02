(function () {
  const DEFAULT_VISIBLE_PATH_COUNT = 6;
  const FALLBACK_TEMPLATE_ID = 'default-path-template';
  const FALLBACK_PATH_ID = 'default-path';

  function rootObject() {
    return typeof window !== 'undefined' ? window : globalThis;
  }

  function sourceObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function cleanString(value, fallback) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || fallback;
  }

  function cleanOptionalString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function escapeText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttribute(value) {
    return escapeText(value).replace(/"/g, '&quot;');
  }

  function fallbackPathIdForTemplate(templateId) {
    return templateId === FALLBACK_TEMPLATE_ID ? FALLBACK_PATH_ID : `${templateId}-default-path`;
  }

  function defaultPath(templateId = FALLBACK_TEMPLATE_ID) {
    return {
      id: fallbackPathIdForTemplate(templateId),
      templateId,
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
    };
  }

  function defaultTemplate() {
    return {
      id: FALLBACK_TEMPLATE_ID,
      title: 'Default',
      paths: [defaultPath(FALLBACK_TEMPLATE_ID)],
    };
  }

  function normalizePath(path, templateId, order) {
    const source = sourceObject(path);
    const pathTemplates = rootObject().TakeoffPathTemplates;
    if (pathTemplates?.normalizePath) {
      return pathTemplates.normalizePath(source, { templateId, order });
    }
    return {
      ...defaultPath(templateId),
      ...source,
      id: cleanOptionalString(source.id) || `path-${order + 1}`,
      templateId,
      name: cleanString(source.name, 'Path'),
      order,
    };
  }

  function normalizeTemplate(template, order) {
    const source = sourceObject(template);
    const id = cleanOptionalString(source.id) || (order === 0 ? FALLBACK_TEMPLATE_ID : `path-template-${order + 1}`);
    const paths = Array.isArray(source.paths)
      ? source.paths.map((path, index) => normalizePath(path, id, index))
      : [];
    return {
      id,
      title: cleanString(source.title, order === 0 ? 'Default' : 'Path Template'),
      paths: paths.length ? paths.sort((a, b) => a.order - b.order) : [defaultPath(id)],
      fallbackPathUsed: paths.length === 0,
    };
  }

  function normalizeTemplates(rawTemplates) {
    if (!Array.isArray(rawTemplates) || rawTemplates.length === 0) {
      return {
        templates: [defaultTemplate()],
        fallback: {
          kind: 'no-templates',
          label: 'No Path Templates',
          message: 'Default Path is available until a Path Template is added.',
        },
      };
    }
    return {
      templates: rawTemplates.map((template, index) => normalizeTemplate(template, index)),
      fallback: null,
    };
  }

  function noPathsFallback() {
    return {
      kind: 'no-paths',
      label: 'No Paths',
      message: 'Default Path is available until this Path Template has Paths.',
    };
  }

  function maxVisiblePathCount(value, fallback = DEFAULT_VISIBLE_PATH_COUNT) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.round(number));
  }

  function splitPaths(paths, visibleCount) {
    return {
      visiblePaths: paths.slice(0, visibleCount),
      overflowPaths: paths.slice(visibleCount),
    };
  }

  function dataAttributes(attributes) {
    return Object.entries(attributes)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `data-${key}="${escapeAttribute(value)}"`)
      .join(' ');
  }

  function pathStyleForPreview(path) {
    return {
      stroke: sourceObject(path?.stroke),
      anchors: sourceObject(path?.anchors),
    };
  }

  function renderPathPreviewHtml(path, renderer = rootObject().TakeoffPathStyleRenderer) {
    if (!path || !renderer?.renderPathStylePreviewSvg) return '';
    return renderer.renderPathStylePreviewSvg(pathStyleForPreview(path), {
      ariaLabel: `${path.name || 'Path'} preview`,
    });
  }

  function pathTileModel(path, activePathId, activeTemplateId, renderer) {
    const active = path.id === activePathId;
    return {
      id: path.id,
      templateId: path.templateId || activeTemplateId,
      name: path.name,
      path,
      active,
      previewHtml: renderPathPreviewHtml(path, renderer),
      action: 'path-dock-select-path',
      data: {
        action: 'path-dock-select-path',
        'path-dock-template-id': path.templateId || activeTemplateId,
        'path-dock-path-id': path.id,
        'path-dock-active': active ? 'true' : 'false',
      },
    };
  }

  function templateItemModel(template, activeTemplateId) {
    const active = template.id === activeTemplateId;
    return {
      id: template.id,
      title: template.title,
      pathCount: template.paths.length,
      active,
      action: 'path-dock-select-template',
      data: {
        action: 'path-dock-select-template',
        'path-dock-template-id': template.id,
        'path-dock-active': active ? 'true' : 'false',
      },
    };
  }

  function createPathDockViewModel(input = {}, options = {}) {
    const source = sourceObject(input);
    const renderer = options.renderer || source.renderer || rootObject().TakeoffPathStyleRenderer;
    const rawTemplates = source.pathTemplates || source.templates || [];
    const normalized = normalizeTemplates(rawTemplates);
    const selectedTemplateId = cleanOptionalString(source.selectedTemplateId)
      || cleanOptionalString(source.activePathTemplateId);
    const activeTemplate = normalized.templates.find(template => template.id === selectedTemplateId)
      || normalized.templates[0]
      || defaultTemplate();
    const selectedPathId = cleanOptionalString(source.selectedPathId)
      || cleanOptionalString(source.activePathId);
    const activePath = activeTemplate.paths.find(path => path.id === selectedPathId)
      || activeTemplate.paths[0]
      || defaultPath(activeTemplate.id);
    const visibleCount = maxVisiblePathCount(
      source.maxVisiblePathCount ?? options.maxVisiblePathCount,
      DEFAULT_VISIBLE_PATH_COUNT,
    );
    const pathTiles = activeTemplate.paths.map(path => pathTileModel(
      path,
      activePath.id,
      activeTemplate.id,
      renderer,
    ));
    const split = splitPaths(pathTiles, visibleCount);
    const templateDropupOpen = source.templateDropupOpen === true;
    const overflowOpen = source.overflowOpen === true && split.overflowPaths.length > 0;
    const templateItems = normalized.templates.map(template => templateItemModel(template, activeTemplate.id));

    return {
      kind: 'Path Dock',
      templates: normalized.templates,
      templateItems,
      activeTemplate,
      activeTemplateId: activeTemplate.id,
      activePath,
      activePathId: activePath.id,
      pathTiles,
      visiblePathTiles: split.visiblePaths,
      overflowPaths: split.overflowPaths,
      overflowCount: split.overflowPaths.length,
      maxVisiblePathCount: visibleCount,
      fallback: normalized.fallback || (activeTemplate.fallbackPathUsed ? noPathsFallback() : null),
      templateDropup: {
        open: templateDropupOpen,
        action: templateDropupOpen ? 'path-dock-close-template-dropup' : 'path-dock-open-template-dropup',
        data: {
          action: templateDropupOpen ? 'path-dock-close-template-dropup' : 'path-dock-open-template-dropup',
          'path-dock-template-dropup-open': templateDropupOpen ? 'true' : 'false',
        },
      },
      overflow: {
        open: overflowOpen,
        action: overflowOpen ? 'path-dock-close-overflow' : 'path-dock-open-overflow',
        data: {
          action: overflowOpen ? 'path-dock-close-overflow' : 'path-dock-open-overflow',
          'path-dock-overflow-open': overflowOpen ? 'true' : 'false',
        },
      },
    };
  }

  function renderTemplateDropupHtml(model) {
    const items = model.templateItems.map((template) => `
      <button class="path-dock-template-item${template.active ? ' active' : ''}" type="button" role="menuitemradio" aria-checked="${template.active ? 'true' : 'false'}" ${dataAttributes(template.data)}>
        <span class="path-dock-template-title">${escapeText(template.title)}</span>
        <span class="path-dock-template-count">${template.pathCount} Path${template.pathCount === 1 ? '' : 's'}</span>
      </button>
    `).join('');
    return `
      <div class="path-dock-template">
        <button class="path-dock-template-toggle" type="button" aria-haspopup="menu" aria-expanded="${model.templateDropup.open ? 'true' : 'false'}" ${dataAttributes(model.templateDropup.data)}>
          <span class="path-dock-template-label">Path Template</span>
          <span class="path-dock-template-active">${escapeText(model.activeTemplate.title)}</span>
        </button>
        ${model.templateDropup.open ? `<div class="path-dock-template-menu" role="menu" aria-label="Path Template menu">${items}</div>` : ''}
      </div>
    `;
  }

  function renderPathTileHtml(tile) {
    return `
      <button class="path-dock-path-tile${tile.active ? ' active' : ''}" type="button" aria-pressed="${tile.active ? 'true' : 'false'}" ${dataAttributes(tile.data)}>
        <span class="path-dock-path-preview" data-path-dock-preview="true">${tile.previewHtml}</span>
        <span class="path-dock-path-name">${escapeText(tile.name)}</span>
      </button>
    `;
  }

  function renderOverflowHtml(model) {
    const disabled = model.overflowCount === 0 ? ' disabled' : '';
    const items = model.overflowPaths.map(renderPathTileHtml).join('');
    return `
      <div class="path-dock-overflow">
        <button class="path-dock-overflow-toggle" type="button"${disabled} aria-haspopup="menu" aria-expanded="${model.overflow.open ? 'true' : 'false'}" ${dataAttributes(model.overflow.data)}>
          <span class="path-dock-overflow-label">${model.overflowCount} more Path${model.overflowCount === 1 ? '' : 's'}</span>
        </button>
      </div>
      ${model.overflow.open ? `<div class="path-dock-overflow-menu" role="menu" aria-label="Overflow Paths">${items}</div>` : ''}
    `;
  }

  function renderPathDockHtml(modelOrInput = {}, options = {}) {
    const model = modelOrInput.kind === 'Path Dock'
      ? modelOrInput
      : createPathDockViewModel(modelOrInput, options);
    const fallback = model.fallback
      ? `<div class="path-dock-fallback" data-path-dock-fallback="${escapeAttribute(model.fallback.kind)}"><span>${escapeText(model.fallback.label)}</span><span>${escapeText(model.fallback.message)}</span></div>`
      : '';
    return `
      <section class="path-dock" aria-label="Path Dock" data-path-dock="true" data-path-dock-active-template-id="${escapeAttribute(model.activeTemplateId)}" data-path-dock-active-path-id="${escapeAttribute(model.activePathId)}" data-path-dock-template-dropup-open="${model.templateDropup.open ? 'true' : 'false'}" data-path-dock-overflow-open="${model.overflow.open ? 'true' : 'false'}">
        ${fallback}
        ${renderTemplateDropupHtml(model)}
        <div class="path-dock-paths" aria-label="Paths">
          ${model.visiblePathTiles.map(renderPathTileHtml).join('')}
        </div>
        ${renderOverflowHtml(model)}
      </section>
    `;
  }

  function renderPathDockFragment(modelOrInput = {}, options = {}) {
    const doc = options.document || rootObject().document;
    if (!doc?.createElement) return null;
    const host = doc.createElement('template');
    host.innerHTML = renderPathDockHtml(modelOrInput, options).trim();
    return host.content;
  }

  function createPathDockController(options = {}) {
    const root = options.root;
    const state = options.state || {};
    const pathTemplates = options.pathTemplates || rootObject().TakeoffPathTemplates;
    const renderer = options.renderer || rootObject().TakeoffPathStyleRenderer;
    const doc = options.document || root?.ownerDocument || rootObject().document;
    const view = options.window || doc?.defaultView || rootObject();
    const ui = { templateDropupOpen: false, overflowOpen: false };
    const visible = options.visible || (() => !!(state.baseW && state.mode === 'measure'));
    const applyTemplateState = options.applyTemplateState || ((target, nextState) => {
      target.pathTemplates = nextState.pathTemplates;
      target.activePathTemplateId = nextState.activePathTemplateId;
      target.activePathId = nextState.activePathId;
    });

    function clearRoot() {
      if (!root) return;
      if (root.replaceChildren) root.replaceChildren();
      else root.innerHTML = '';
    }

    function closeMenus({ render: shouldRender = true } = {}) {
      const wasOpen = ui.templateDropupOpen || ui.overflowOpen;
      ui.templateDropupOpen = false;
      ui.overflowOpen = false;
      if (wasOpen && shouldRender) render();
      return wasOpen;
    }

    function render() {
      if (!root) return;
      const shouldShow = !!visible(state);
      root.hidden = !shouldShow;
      if (!shouldShow) {
        closeMenus({ render: false });
        clearRoot();
        return;
      }
      root.innerHTML = renderPathDockHtml({
        pathTemplates: state.pathTemplates,
        activePathTemplateId: state.activePathTemplateId,
        activePathId: state.activePathId,
        maxVisiblePathCount: options.maxVisiblePathCount,
        templateDropupOpen: ui.templateDropupOpen,
        overflowOpen: ui.overflowOpen,
      }, { renderer });
    }

    function commitTemplateState(nextState) {
      applyTemplateState(state, nextState);
      if (options.save) options.save(state);
      if (options.renderTemplateHome) options.renderTemplateHome();
      render();
    }

    function handleAction(target) {
      const action = target?.dataset?.action;
      if (action === 'path-dock-open-template-dropup' || action === 'path-dock-close-template-dropup') {
        ui.templateDropupOpen = action === 'path-dock-open-template-dropup';
        ui.overflowOpen = false;
        render();
        return true;
      }
      if (action === 'path-dock-open-overflow' || action === 'path-dock-close-overflow') {
        ui.overflowOpen = action === 'path-dock-open-overflow';
        ui.templateDropupOpen = false;
        render();
        return true;
      }
      if (action === 'path-dock-select-template') {
        ui.templateDropupOpen = false;
        ui.overflowOpen = false;
        commitTemplateState(pathTemplates.selectPathTemplate(state, target.dataset.pathDockTemplateId));
        return true;
      }
      if (action === 'path-dock-select-path') {
        ui.templateDropupOpen = false;
        ui.overflowOpen = false;
        commitTemplateState(pathTemplates.selectPath(state, target.dataset.pathDockTemplateId, target.dataset.pathDockPathId));
        return true;
      }
      return false;
    }

    function stopStageEvent(event) {
      event.stopPropagation();
    }

    function handleClick(event) {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target?.closest?.('[data-action]');
      if (target && root.contains(target)) handleAction(target);
    }

    function handleDocumentClick(event) {
      if (root && !root.hidden && !root.contains(event.target)) closeMenus();
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape' || root?.hidden) return;
      if (!closeMenus()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    if (root) {
      root.addEventListener('mousedown', stopStageEvent);
      root.addEventListener('contextmenu', stopStageEvent);
      root.addEventListener('wheel', stopStageEvent, { passive: true });
      root.addEventListener('click', handleClick);
    }
    doc?.addEventListener?.('click', handleDocumentClick);
    view?.addEventListener?.('keydown', handleKeyDown);

    return {
      render,
      closeMenus,
      handleAction,
      destroy() {
        if (root) {
          root.removeEventListener('mousedown', stopStageEvent);
          root.removeEventListener('contextmenu', stopStageEvent);
          root.removeEventListener('wheel', stopStageEvent);
          root.removeEventListener('click', handleClick);
        }
        doc?.removeEventListener?.('click', handleDocumentClick);
        view?.removeEventListener?.('keydown', handleKeyDown);
      },
    };
  }

  rootObject().TakeoffPathDock = {
    DEFAULT_VISIBLE_PATH_COUNT,
    createPathDockController,
    createPathDockViewModel,
    maxVisiblePathCount,
    renderPathDockHtml,
    renderPathDockFragment,
    renderPathPreviewHtml,
    splitPaths,
  };
})();
