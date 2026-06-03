(function () {
  const GEOMETRY_LABELS = Object.freeze({
    line: 'Line',
    freehand: 'Freehand',
  });
  const STROKE_STYLE_LABELS = Object.freeze({
    solid: 'Solid',
    dashed: 'Dashed',
    dotted: 'Dotted',
  });
  const PRESET_COLORS = Object.freeze(['#b6ff3c', '#ffffff', '#4cd6ff', '#ffb020', '#ff5f6d', '#7c5cff', '#18a058', '#d7dde1']);

  function sourceObject(value) {
    return value && typeof value === 'object' ? value : {};
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

  function geometryLabel(value) {
    return GEOMETRY_LABELS[value] || GEOMETRY_LABELS.line;
  }

  function strokeStyleLabel(value) {
    return STROKE_STYLE_LABELS[value] || STROKE_STYLE_LABELS.solid;
  }

  function safeColor(value, fallback = '#b6ff3c') {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8})$/.test(text) ? text : fallback;
  }

  function templateCountLabel(count) {
    const number = Number.isFinite(Number(count)) ? Number(count) : 0;
    return `${number} template${number === 1 ? '' : 's'}`;
  }

  function createPathTemplateViewModel(state = {}, options = {}) {
    const pathTemplates = options.pathTemplates || window.TakeoffPathTemplates;
    const current = pathTemplates.normalizePathTemplateState(state);
    const activeTemplate = current.pathTemplates.find(template => template.id === current.activePathTemplateId)
      || current.pathTemplates[0]
      || null;
    const activePath = activeTemplate?.paths.find(path => path.id === current.activePathId)
      || activeTemplate?.paths[0]
      || null;
    return {
      state: current,
      templates: current.pathTemplates,
      activeTemplate,
      activePath,
      templateCount: current.pathTemplates.length,
      templateCountLabel: templateCountLabel(current.pathTemplates.length),
    };
  }

  function pathStyleForPreview(path) {
    return {
      stroke: sourceObject(path?.stroke),
      anchors: sourceObject(path?.anchors),
    };
  }

  function renderPathPreviewHtml(path, renderer = window.TakeoffPathStyleRenderer) {
    if (!path || !renderer?.renderPathStylePreviewSvg) return '';
    return renderer.renderPathStylePreviewSvg(pathStyleForPreview(path), {
      ariaLabel: `${path.name || 'Path'} preview`,
    });
  }

  function renderDetailPreviewHtml(path, renderer = window.TakeoffPathStyleRenderer) {
    if (!path) return '';
    const render = renderer?.renderPathStyleDetailPreviewSvg || renderer?.renderPathStylePreviewSvg;
    if (!render) return '';
    return render(pathStyleForPreview(path), {
      ariaLabel: `${path.name || 'Path'} preview`,
    });
  }

  function stylePatchFromFormField(field, value, path = {}) {
    if (field === 'geometry') {
      return { geometry: value === 'freehand' ? 'freehand' : 'line' };
    }
    if (field === 'stroke.color') {
      return { stroke: { color: value } };
    }
    if (field === 'stroke.style') {
      return { stroke: { style: Object.hasOwn(STROKE_STYLE_LABELS, value) ? value : 'solid' } };
    }
    if (field === 'stroke.border') {
      return { stroke: { border: value, borderMatchesFill: false } };
    }
    if (field === 'stroke.borderMatchesFill') {
      const checked = value === true || value === 'true' || value === 'on';
      return {
        stroke: {
          borderMatchesFill: checked,
          ...(checked ? { border: path.stroke?.color } : {}),
        },
      };
    }
    if (field === 'anchors.fill') {
      return { anchors: { fill: value } };
    }
    if (field === 'anchors.border') {
      return { anchors: { border: value, borderMatchesStroke: false } };
    }
    if (field === 'anchors.borderMatchesStroke') {
      const checked = value === true || value === 'true' || value === 'on';
      return {
        anchors: {
          borderMatchesStroke: checked,
          ...(checked ? { border: path.stroke?.color } : {}),
        },
      };
    }
    return {};
  }

  function applyTemplateState(target, nextState) {
    target.pathTemplates = nextState.pathTemplates;
    target.activePathTemplateId = nextState.activePathTemplateId;
    target.activePathId = nextState.activePathId;
    return target;
  }

  function renderTemplateList(model) {
    return model.templates.map((template) => {
      const active = template.id === model.activeTemplate?.id;
      const count = template.paths.length;
      return `
        <button class="path-template-nav-item${active ? ' active' : ''}" type="button" data-action="select-template" data-template-id="${escapeAttribute(template.id)}" aria-pressed="${active ? 'true' : 'false'}">
          <span class="path-template-nav-title">${escapeText(template.title)}</span>
          <span class="path-template-nav-meta">${count} path${count === 1 ? '' : 's'}</span>
        </button>
      `;
    }).join('');
  }

  function renderPathGrid(model, renderer) {
    const activePathId = model.activePath?.id;
    return model.activeTemplate.paths.map((path) => {
      const active = path.id === activePathId;
      return `
        <button class="path-template-path-card${active ? ' active' : ''}" type="button" data-action="select-path" data-path-id="${escapeAttribute(path.id)}" aria-pressed="${active ? 'true' : 'false'}">
          <span class="path-template-path-preview">
            ${renderPathPreviewHtml(path, renderer)}
          </span>
          <span class="path-template-path-name">${escapeText(path.name)}</span>
          <span class="path-template-path-meta">${strokeStyleLabel(path.stroke.style)}</span>
        </button>
      `;
    }).join('');
  }

  function renderColorEditor(field, value, options = {}) {
    const fallback = options.fallback || '#b6ff3c';
    const activeColor = safeColor(value, fallback);
    const disabled = options.disabled ? ' disabled' : '';
    const swatches = PRESET_COLORS.map((color) => `
      <button class="path-template-swatch${activeColor === color ? ' active' : ''}" type="button" data-action="style-field" data-field="${escapeAttribute(field)}" data-value="${escapeAttribute(color)}" aria-label="${escapeAttribute(color)}" title="${escapeAttribute(color)}"${disabled}>
        <span style="background:${escapeAttribute(color)}"></span>
      </button>
    `).join('');
    return `
      <div class="path-template-color-editor">
        <div class="path-template-swatches">${swatches}</div>
        <label class="path-template-color-custom" title="Custom color">
          <input type="color" value="${activeColor}" data-action="style-input" data-field="${escapeAttribute(field)}"${disabled} />
          <span>Custom</span>
        </label>
      </div>
    `;
  }

  function renderSegmentedButtons(groupName, values, activeValue, field) {
    return values.map((value) => `
      <button class="path-template-segment${value === activeValue ? ' active' : ''}" type="button" data-action="style-field" data-field="${escapeAttribute(field)}" data-value="${escapeAttribute(value)}" aria-pressed="${value === activeValue ? 'true' : 'false'}">
        ${field === 'geometry' ? geometryLabel(value) : strokeStyleLabel(value)}
      </button>
    `).join('');
  }

  function renderLineEditor(path) {
    const stroke = path.stroke;
    const borderEditor = stroke.borderMatchesFill ? '' : `
      <div class="path-template-field path-template-field-full">
        <span>Line border</span>
        ${renderColorEditor('stroke.border', stroke.border)}
      </div>
    `;
    return `
      <div class="path-template-field path-template-field-full">
        <span>Line fill</span>
        ${renderColorEditor('stroke.color', stroke.color)}
      </div>
      ${borderEditor}
      <label class="path-template-check path-template-field-full">
        <input type="checkbox" data-action="style-check" data-field="stroke.borderMatchesFill" ${stroke.borderMatchesFill ? 'checked' : ''} />
        <span>Match line border to fill</span>
      </label>
      <div class="path-template-field path-template-field-full">
        <span>Line style</span>
        <div class="path-template-segmented" role="group" aria-label="Line style">
          ${renderSegmentedButtons('stroke', ['solid', 'dashed', 'dotted'], stroke.style, 'stroke.style')}
        </div>
      </div>
    `;
  }

  function renderAnchorEditor(path) {
    const anchors = path.anchors;
    const borderEditor = anchors.borderMatchesStroke ? '' : `
      <div class="path-template-field path-template-field-full">
        <span>Anchor border</span>
        ${renderColorEditor('anchors.border', anchors.border)}
      </div>
    `;
    return `
      <div class="path-template-field path-template-field-full">
        <span>Anchor fill</span>
        ${renderColorEditor('anchors.fill', anchors.fill, { fallback: '#ffffff' })}
      </div>
      ${borderEditor}
      <label class="path-template-check path-template-field-full">
        <input type="checkbox" data-action="style-check" data-field="anchors.borderMatchesStroke" ${anchors.borderMatchesStroke ? 'checked' : ''} />
        <span>Match anchor border to line color</span>
      </label>
    `;
  }

  function renderStyleEditor(model, renderer, activeStyleTab = 'line') {
    const path = model.activePath;
    if (!path) {
      return `
        <section class="path-template-appearance-panel">
          <div class="path-template-empty-editor">Add a path to edit line and anchor styling.</div>
        </section>
        <section class="path-template-preview-panel" aria-label="Template preview"></section>
      `;
    }
    const activeTab = activeStyleTab === 'anchor' ? 'anchor' : 'line';
    return `
      <section class="path-template-appearance-panel" aria-label="Path style">
        <div class="path-template-appearance-card">
          <div class="path-template-appearance-header">
            <span class="path-template-mini-preview" aria-hidden="true">
              ${renderPathPreviewHtml(path, renderer)}
            </span>
            <label class="path-template-name-inline">
              <span>Path style</span>
              <input type="text" value="${escapeAttribute(path.name)}" data-action="path-name" autocomplete="off" />
            </label>
          </div>
          <div class="path-template-style-tabs" role="tablist" aria-label="Style layers">
            <button class="path-template-style-tab${activeTab === 'line' ? ' active' : ''}" type="button" data-action="style-tab" data-tab="line" role="tab" aria-selected="${activeTab === 'line' ? 'true' : 'false'}">Line</button>
            <button class="path-template-style-tab${activeTab === 'anchor' ? ' active' : ''}" type="button" data-action="style-tab" data-tab="anchor" role="tab" aria-selected="${activeTab === 'anchor' ? 'true' : 'false'}">Anchor</button>
          </div>
          <div class="path-template-style-editor" data-style-panel="line" ${activeTab === 'line' ? '' : 'hidden'}>
            ${renderLineEditor(path)}
          </div>
          <div class="path-template-style-editor" data-style-panel="anchor" ${activeTab === 'anchor' ? '' : 'hidden'}>
            ${renderAnchorEditor(path)}
          </div>
        </div>
      </section>
      <section class="path-template-preview-panel" aria-label="Template preview">
        <div class="path-template-preview-card">
          <p>Preview</p>
          <div class="path-template-preview" data-preview>
            <span class="path-template-preview-grid" aria-hidden="true"></span>
            <span class="path-template-preview-line" aria-hidden="true"></span>
            <span class="path-template-preview-room" aria-hidden="true"></span>
            <span class="path-template-preview-svg">
              ${renderDetailPreviewHtml(path, renderer)}
            </span>
          </div>
          <div class="path-template-preview-meta">
            <span>${escapeText(path.name)}</span>
            <span>${strokeStyleLabel(path.stroke.style)}</span>
          </div>
        </div>
      </section>
    `;
  }

  function renderHome(model, renderer, activeStyleTab = 'line') {
    const title = model.activeTemplate?.title || '';
    const pathCount = model.activeTemplate?.paths.length || 0;
    return `
      <div class="path-template-home-header">
        <div>
          <p>Templates · ${model.templateCount}</p>
          <h2>Templates</h2>
          <span>Reusable paths. Pick a kit before measuring to keep line and anchor styling consistent.</span>
        </div>
        <button class="path-template-new" type="button" data-action="new-template">New template</button>
      </div>
      <div class="path-template-layout">
        <section class="path-template-sidebar" aria-label="Path Template list">
          <p>Templates</p>
          <div class="path-template-nav-list">
            ${renderTemplateList(model)}
          </div>
        </section>
        <section class="path-template-editor">
          <div class="path-template-editor-header">
            <div>
              <p>Editing kit</p>
              <label class="path-template-title-field">
                <span class="sr-only">Template name</span>
                <input type="text" value="${escapeAttribute(title)}" data-action="template-title" autocomplete="off" />
              </label>
            </div>
            <div class="path-template-editor-count">${pathCount} ${pathCount === 1 ? 'path' : 'paths'}</div>
          </div>
          <div class="path-template-detail-grid">
            <section class="path-template-category-panel" aria-label="Template paths">
              <div class="path-template-category-header">
                <p>Paths</p>
              </div>
              <div class="path-template-path-grid">
                ${renderPathGrid(model, renderer)}
                <button class="path-template-add-category" type="button" data-action="add-path">
                  <span>+</span>
                  Add path
                </button>
              </div>
            </section>
            ${renderStyleEditor(model, renderer, activeStyleTab)}
          </div>
        </section>
      </div>
    `;
  }

  function createPathTemplateHome(options = {}) {
    const root = options.root;
    const state = options.state;
    const pathTemplates = options.pathTemplates || window.TakeoffPathTemplates;
    const renderer = options.renderer || window.TakeoffPathStyleRenderer;
    const store = options.store;
    if (!root || !state || !pathTemplates) {
      return { render() {}, destroy() {} };
    }
    let activeStyleTab = 'line';

    function save() {
      if (store?.save) store.save(state);
    }

    function scrollContainer() {
      return root.closest?.('[data-home-panel]') || null;
    }

    function restoreScroll(scroller, scrollTop) {
      if (!scroller) return;
      scroller.scrollTop = scrollTop;
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          scroller.scrollTop = scrollTop;
        });
      }
    }

    function setTemplateState(nextState, options = {}) {
      applyTemplateState(state, nextState);
      save();
      render(options);
    }

    function model() {
      const viewModel = createPathTemplateViewModel(state, { pathTemplates });
      applyTemplateState(state, viewModel.state);
      return viewModel;
    }

    function render(options = {}) {
      const scroller = options.preserveScroll ? scrollContainer() : null;
      const scrollTop = scroller?.scrollTop || 0;
      root.innerHTML = renderHome(model(), renderer, activeStyleTab);
      restoreScroll(scroller, scrollTop);
    }

    function activeIds() {
      const viewModel = model();
      return {
        templateId: viewModel.activeTemplate?.id || null,
        pathId: viewModel.activePath?.id || null,
        path: viewModel.activePath || null,
      };
    }

    function updateActivePathStyle(patch) {
      const ids = activeIds();
      if (!ids.templateId || !ids.pathId) return;
      setTemplateState(pathTemplates.updatePathStyle(state, ids.templateId, ids.pathId, patch), { preserveScroll: true });
    }

    function handleClick(event) {
      const target = event.target.closest('[data-action]');
      if (!target || !root.contains(target)) return;
      const action = target.dataset.action;
      if (action === 'new-template') {
        setTemplateState(pathTemplates.addPathTemplate(state, { title: 'New template' }));
      } else if (action === 'select-template') {
        setTemplateState(pathTemplates.selectPathTemplate(state, target.dataset.templateId));
      } else if (action === 'add-path') {
        const ids = activeIds();
        if (ids.templateId) setTemplateState(pathTemplates.addPath(state, ids.templateId, { name: 'Path' }));
      } else if (action === 'select-path') {
        const ids = activeIds();
        if (ids.templateId) setTemplateState(pathTemplates.selectPath(state, ids.templateId, target.dataset.pathId));
      } else if (action === 'style-field') {
        updateActivePathStyle(stylePatchFromFormField(target.dataset.field, target.dataset.value, activeIds().path));
      } else if (action === 'style-tab') {
        activeStyleTab = target.dataset.tab === 'anchor' ? 'anchor' : 'line';
        render({ preserveScroll: true });
      }
    }

    function handleChange(event) {
      const target = event.target.closest('[data-action]');
      if (!target || !root.contains(target)) return;
      const action = target.dataset.action;
      const ids = activeIds();
      if (action === 'template-title' && ids.templateId) {
        setTemplateState(pathTemplates.renamePathTemplate(state, ids.templateId, target.value));
      } else if (action === 'path-name' && ids.templateId && ids.pathId) {
        setTemplateState(pathTemplates.renamePath(state, ids.templateId, ids.pathId, target.value));
      } else if (action === 'style-input') {
        updateActivePathStyle(stylePatchFromFormField(target.dataset.field, target.value, ids.path));
      } else if (action === 'style-check') {
        updateActivePathStyle(stylePatchFromFormField(target.dataset.field, target.checked, ids.path));
      }
    }

    root.addEventListener('click', handleClick);
    root.addEventListener('change', handleChange);
    render();

    return {
      render,
      destroy() {
        root.removeEventListener('click', handleClick);
        root.removeEventListener('change', handleChange);
      },
    };
  }

  window.TakeoffPathTemplateView = {
    GEOMETRY_LABELS,
    STROKE_STYLE_LABELS,
    geometryLabel,
    strokeStyleLabel,
    safeColor,
    templateCountLabel,
    createPathTemplateViewModel,
    pathStyleForPreview,
    renderPathPreviewHtml,
    stylePatchFromFormField,
    applyTemplateState,
    createPathTemplateHome,
  };
})();
