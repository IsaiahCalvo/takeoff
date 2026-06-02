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
          <span class="path-template-path-meta">${geometryLabel(path.geometry)} / ${strokeStyleLabel(path.stroke.style)}</span>
        </button>
      `;
    }).join('');
  }

  function renderSegmentedButtons(groupName, values, activeValue, field) {
    return values.map((value) => `
      <button class="path-template-segment${value === activeValue ? ' active' : ''}" type="button" data-action="style-field" data-field="${escapeAttribute(field)}" data-value="${escapeAttribute(value)}" aria-pressed="${value === activeValue ? 'true' : 'false'}">
        ${field === 'geometry' ? geometryLabel(value) : strokeStyleLabel(value)}
      </button>
    `).join('');
  }

  function renderStyleEditor(model, renderer) {
    const path = model.activePath;
    if (!path) {
      return '<div class="path-template-empty-editor">Add a path to edit its style.</div>';
    }
    const anchors = path.anchors;
    return `
      <div class="path-template-style-editor">
        <div class="path-template-preview" data-preview>
          ${renderPathPreviewHtml(path, renderer)}
        </div>
        <label class="path-template-field path-template-field-full">
          <span>Path name</span>
          <input type="text" value="${escapeAttribute(path.name)}" data-action="path-name" autocomplete="off" />
        </label>
        <div class="path-template-field path-template-field-full">
          <span>Geometry</span>
          <div class="path-template-segmented" role="group" aria-label="Geometry">
            ${renderSegmentedButtons('geometry', ['line', 'freehand'], path.geometry, 'geometry')}
          </div>
        </div>
        <label class="path-template-field">
          <span>Stroke color</span>
          <input type="color" value="${safeColor(path.stroke.color)}" data-action="style-input" data-field="stroke.color" />
        </label>
        <div class="path-template-field">
          <span>Stroke style</span>
          <div class="path-template-segmented" role="group" aria-label="Stroke style">
            ${renderSegmentedButtons('stroke', ['solid', 'dashed', 'dotted'], path.stroke.style, 'stroke.style')}
          </div>
        </div>
        <label class="path-template-field">
          <span>Anchor fill</span>
          <input type="color" value="${safeColor(anchors.fill, '#ffffff')}" data-action="style-input" data-field="anchors.fill" />
        </label>
        <label class="path-template-field">
          <span>Anchor border</span>
          <input type="color" value="${safeColor(anchors.border)}" data-action="style-input" data-field="anchors.border" ${anchors.borderMatchesStroke ? 'disabled' : ''} />
        </label>
        <label class="path-template-check path-template-field-full">
          <input type="checkbox" data-action="style-check" data-field="anchors.borderMatchesStroke" ${anchors.borderMatchesStroke ? 'checked' : ''} />
          <span>Match anchor border to line color</span>
        </label>
      </div>
    `;
  }

  function renderHome(model, renderer) {
    const title = model.activeTemplate?.title || '';
    return `
      <div class="path-template-home-header">
        <div>
          <h2>Path Templates</h2>
          <p>${escapeText(model.templateCountLabel)}</p>
        </div>
        <button class="path-template-new" type="button" data-action="new-template">New</button>
      </div>
      <div class="path-template-layout">
        <div class="path-template-sidebar" aria-label="Path Template list">
          ${renderTemplateList(model)}
        </div>
        <div class="path-template-editor">
          <label class="path-template-title-field">
            <span>Template name</span>
            <input type="text" value="${escapeAttribute(title)}" data-action="template-title" autocomplete="off" />
          </label>
          <div class="path-template-paths-header">
            <span>Paths</span>
            <button type="button" data-action="add-path">Add path</button>
          </div>
          <div class="path-template-path-grid">
            ${renderPathGrid(model, renderer)}
          </div>
          ${renderStyleEditor(model, renderer)}
        </div>
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

    function save() {
      if (store?.save) store.save(state);
    }

    function setTemplateState(nextState) {
      applyTemplateState(state, nextState);
      save();
      render();
    }

    function model() {
      const viewModel = createPathTemplateViewModel(state, { pathTemplates });
      applyTemplateState(state, viewModel.state);
      return viewModel;
    }

    function render() {
      root.innerHTML = renderHome(model(), renderer);
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
      setTemplateState(pathTemplates.updatePathStyle(state, ids.templateId, ids.pathId, patch));
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
