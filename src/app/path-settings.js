(function () {
  const APPLY_SCOPES = Object.freeze({
    RUN: 'run',
    PAGE: 'page',
    DOCUMENT: 'document',
    TEMPLATE: 'template',
  });
  const CATEGORY_CREATE_VALUE = '__new__';
  const CATEGORY_KEEP_VALUE = '__keep__';

  function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function sourceObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function cleanString(value) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  function hasOwn(source, key) {
    return Object.prototype.hasOwnProperty.call(source, key);
  }

  function safeColor(value, fallback) {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8})$/.test(text) ? text : fallback;
  }

  function normalizeStrokeStyle(value) {
    return ['solid', 'dashed', 'dotted'].includes(value) ? value : 'solid';
  }

  function normalizePathStyle(style = {}) {
    if (window.TakeoffPathStyleRenderer?.normalizePathStyle) {
      return window.TakeoffPathStyleRenderer.normalizePathStyle(style);
    }
    const source = sourceObject(style);
    const strokeSource = sourceObject(source.stroke);
    const stroke = {
      color: safeColor(strokeSource.color, '#b6ff3c'),
      style: normalizeStrokeStyle(strokeSource.style),
    };
    const borderMatchesFill = typeof strokeSource.borderMatchesFill === 'boolean'
      ? strokeSource.borderMatchesFill
      : true;
    stroke.border = borderMatchesFill ? stroke.color : safeColor(strokeSource.border, stroke.color);
    stroke.borderMatchesFill = borderMatchesFill;
    const anchorSource = sourceObject(source.anchors);
    const borderMatchesStroke = typeof anchorSource.borderMatchesStroke === 'boolean'
      ? anchorSource.borderMatchesStroke
      : true;
    return {
      stroke,
      anchors: {
        fill: safeColor(anchorSource.fill, '#ffffff'),
        border: borderMatchesStroke ? stroke.color : safeColor(anchorSource.border, stroke.color),
        borderMatchesStroke,
      },
    };
  }

  function pathStyleFromSource(source = {}) {
    const pathStyle = source.pathStyle || {
      stroke: source.stroke || { color: source.color },
      anchors: source.anchors,
    };
    return normalizePathStyle(pathStyle);
  }

  function categoryFromSource(source = {}) {
    const pathCategory = sourceObject(source.pathCategory);
    const category = sourceObject(source.category);
    const id = cleanString(source.pathCategoryId)
      || cleanString(source.categoryId)
      || cleanString(pathCategory.id)
      || cleanString(category.id);
    const name = cleanString(source.pathCategoryName)
      || cleanString(source.categoryName)
      || (typeof source.pathCategory === 'string' ? cleanString(source.pathCategory) : null)
      || (typeof source.category === 'string' ? cleanString(source.category) : null)
      || cleanString(pathCategory.name)
      || cleanString(category.name);
    return { id, name };
  }

  function pathSettingsFromGroup(group = {}) {
    const hasMixedCategories = !!group.hasMixedCategories;
    const category = hasMixedCategories
      ? { id: null, name: null }
      : categoryFromSource({
        pathCategoryId: group.categoryId,
        pathCategoryName: group.categoryName,
      });
    return {
      pathTemplateId: cleanString(group.pathTemplateId),
      pathId: cleanString(group.pathId),
      pathName: cleanString(group.pathName) || cleanString(group.displayName) || 'Path',
      pathStyle: pathStyleFromSource(group),
      hasMixedCategories,
      pathCategoryId: category.id,
      pathCategoryName: category.name,
    };
  }

  function normalizeSettings(settings = {}) {
    const source = sourceObject(settings);
    const normalized = {};
    if (hasOwn(source, 'pathName')) normalized.pathName = cleanString(source.pathName) || 'Path';
    if (hasOwn(source, 'pathStyle') || hasOwn(source, 'stroke') || hasOwn(source, 'anchors')) {
      normalized.pathStyle = pathStyleFromSource(source);
    }
    const hasCategory = hasOwn(source, 'pathCategoryId')
      || hasOwn(source, 'pathCategoryName')
      || hasOwn(source, 'categoryId')
      || hasOwn(source, 'categoryName')
      || hasOwn(source, 'pathCategory')
      || hasOwn(source, 'category');
    if (hasCategory) {
      const category = categoryFromSource(source);
      normalized.hasCategory = true;
      normalized.pathCategoryId = category.id;
      normalized.pathCategoryName = category.name;
    }
    return normalized;
  }

  function measurementPage(measurement) {
    const page = Number(measurement?.page);
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  function matchesPath(measurement, target = {}) {
    const pathTemplateId = cleanString(target.pathTemplateId);
    const pathId = cleanString(target.pathId);
    return !!(
      pathTemplateId
      && pathId
      && cleanString(measurement?.pathTemplateId) === pathTemplateId
      && cleanString(measurement?.pathId) === pathId
    );
  }

  function measurementIncludedInScope(measurement, target = {}, scope) {
    if (scope === APPLY_SCOPES.RUN) {
      return measurement?.id === target.currentMeasurementId;
    }
    if (!matchesPath(measurement, target)) return false;
    if (scope === APPLY_SCOPES.PAGE) return measurementPage(measurement) === Number(target.currentPage);
    return scope === APPLY_SCOPES.DOCUMENT;
  }

  function applyCategory(next, settings) {
    delete next.pathCategoryId;
    delete next.pathCategoryName;
    delete next.pathCategory;
    delete next.categoryId;
    delete next.categoryName;
    delete next.category;
    if (settings.pathCategoryId || settings.pathCategoryName) {
      if (settings.pathCategoryId) next.pathCategoryId = settings.pathCategoryId;
      if (settings.pathCategoryName) next.pathCategoryName = settings.pathCategoryName;
    }
  }

  function applySettingsToMeasurement(measurement, settings) {
    const next = { ...measurement };
    if (settings.pathName) next.pathName = settings.pathName;
    if (settings.pathStyle) {
      next.pathStyle = cloneValue(settings.pathStyle);
      if (settings.pathStyle.stroke?.color) next.color = settings.pathStyle.stroke.color;
    }
    if (settings.hasCategory) applyCategory(next, settings);
    return next;
  }

  function applyPathSettingsToMeasurements(measurements, target = {}, patch = {}, options = {}) {
    const scope = options.scope || APPLY_SCOPES.DOCUMENT;
    const settings = normalizeSettings(patch);
    const changedIds = [];
    const nextMeasurements = (measurements || []).map((measurement) => {
      if (!measurementIncludedInScope(measurement, target, scope)) return measurement;
      changedIds.push(measurement.id);
      return applySettingsToMeasurement(measurement, settings);
    });
    return {
      measurements: nextMeasurements,
      changedIds,
      scope,
    };
  }

  function addCategoryOption(map, category) {
    const id = cleanString(category?.id);
    const name = cleanString(category?.name);
    if (!id && !name) return;
    const key = id ? `id:${id}` : `name:${name.toLowerCase()}`;
    if (map.has(key)) return;
    map.set(key, {
      id,
      name: name || id,
      value: id || `name:${name}`,
    });
  }

  function categoryOptionsFromState(state = {}, current = {}) {
    const options = new Map();
    for (const template of state.pathTemplates || []) {
      for (const path of template.paths || []) addCategoryOption(options, categoryFromSource(path));
    }
    for (const measurement of state.measurements || []) addCategoryOption(options, categoryFromSource(measurement));
    addCategoryOption(options, categoryFromSource(current));
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function slugCategoryName(name) {
    return (cleanString(name) || 'path-category')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'path-category';
  }

  function uniqueCategoryId(name, options = []) {
    const base = slugCategoryName(name);
    const used = new Set((options || []).map(option => option.id).filter(Boolean));
    if (!used.has(base)) return base;
    let index = 2;
    while (used.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
  }

  function categoryFromSelection({ value = '', newName = '', options = [] } = {}) {
    if (value === CATEGORY_KEEP_VALUE) return { keep: true, id: null, name: null };
    if (value === CATEGORY_CREATE_VALUE) {
      const name = cleanString(newName);
      return name ? { id: uniqueCategoryId(name, options), name } : { id: null, name: null };
    }
    if (!value) return { id: null, name: null };
    const selected = (options || []).find(option => option.value === value || option.id === value);
    return selected ? { id: selected.id || null, name: selected.name || null } : { id: null, name: null };
  }

  function templateSupportsPath(state = {}, target = {}) {
    const templateId = cleanString(target.pathTemplateId);
    const pathId = cleanString(target.pathId);
    return !!(state.pathTemplates || [])
      .find(template => template.id === templateId)
      ?.paths?.find(path => path.id === pathId);
  }

  function createOption(root, label, value) {
    const option = root.createElement('option');
    option.textContent = label;
    option.value = value;
    return option;
  }

  function createPathSettingsModal(options = {}) {
    const root = options.root || window.document;
    const getElement = options.getElement || (id => root.getElementById(id));
    const state = options.state;
    const pathTemplates = options.pathTemplates || window.TakeoffPathTemplates;
    const renderer = options.renderer || window.TakeoffPathStyleRenderer;
    const store = options.store;
    const templateHome = options.templateHome;
    let context = null;
    let restoreFocusElement = null;

    function el(id) {
      return getElement(id);
    }

    function pageNow() {
      return options.currentPage ? options.currentPage() : 1;
    }

    function currentRunForGroup(group) {
      const runs = group?.measurements || [];
      return runs.find(measurement => measurement.id === state.selectedId)
        || runs.find(measurement => measurementPage(measurement) === pageNow())
        || runs[0]
        || null;
    }

    function styleFromFields() {
      const lineColor = el('pathSettingsLineColor').value || '#b6ff3c';
      const lineBorderMatchesFill = el('pathSettingsLineBorderMatches').checked;
      const borderMatchesStroke = el('pathSettingsAnchorBorderMatches').checked;
      return normalizePathStyle({
        stroke: {
          color: lineColor,
          style: el('pathSettingsLineStyle').value,
          border: lineBorderMatchesFill ? lineColor : (el('pathSettingsLineBorder').value || lineColor),
          borderMatchesFill: lineBorderMatchesFill,
        },
        anchors: {
          fill: el('pathSettingsAnchorFill').value || '#ffffff',
          border: borderMatchesStroke ? lineColor : (el('pathSettingsAnchorBorder').value || lineColor),
          borderMatchesStroke,
        },
      });
    }

    function updatePreview() {
      const style = styleFromFields();
      const lineBorderInput = el('pathSettingsLineBorder');
      lineBorderInput.disabled = style.stroke.borderMatchesFill;
      if (style.stroke.borderMatchesFill) lineBorderInput.value = style.stroke.color;
      const borderInput = el('pathSettingsAnchorBorder');
      borderInput.disabled = style.anchors.borderMatchesStroke;
      if (style.anchors.borderMatchesStroke) borderInput.value = style.stroke.color;
      el('pathSettingsPreview').innerHTML = renderer.renderPathStylePreviewSvg(style, {
        ariaLabel: 'Path Settings preview',
      });
    }

    function categoryValueForSettings(settings, optionsList) {
      if (!settings.pathCategoryId && !settings.pathCategoryName) return '';
      const match = (optionsList || []).find(option => (
        (settings.pathCategoryId && option.id === settings.pathCategoryId)
        || (!settings.pathCategoryId && settings.pathCategoryName && option.name === settings.pathCategoryName)
      ));
      return match?.value || '';
    }

    function updateNewCategoryState() {
      const creating = el('pathSettingsCategory').value === CATEGORY_CREATE_VALUE;
      el('pathSettingsNewCategoryField').hidden = !creating;
      el('pathSettingsNewCategory').toggleAttribute('aria-invalid', false);
    }

    function populateCategories(settings) {
      const select = el('pathSettingsCategory');
      const optionsList = categoryOptionsFromState(state, settings);
      select.replaceChildren();
      if (settings.hasMixedCategories) select.appendChild(createOption(root, 'Keep existing categories', CATEGORY_KEEP_VALUE));
      select.appendChild(createOption(root, 'Uncategorized', ''));
      for (const option of optionsList) select.appendChild(createOption(root, option.name, option.value));
      select.appendChild(createOption(root, 'Create new category', CATEGORY_CREATE_VALUE));
      select.value = settings.hasMixedCategories ? CATEGORY_KEEP_VALUE : categoryValueForSettings(settings, optionsList);
      context.categoryOptions = optionsList;
      updateNewCategoryState();
    }

    function configureScope(group, currentRun, settings) {
      const scope = el('pathSettingsScope');
      const hasCurrentPageRun = (group.measurements || []).some(measurement => measurementPage(measurement) === pageNow());
      const templateSupported = templateSupportsPath(state, settings);
      const runOption = scope.querySelector('option[value="run"]');
      const pageOption = scope.querySelector('option[value="page"]');
      const templateOption = scope.querySelector('option[value="template"]');
      runOption.disabled = !currentRun;
      pageOption.disabled = !hasCurrentPageRun;
      templateOption.disabled = !templateSupported;
      templateOption.textContent = templateSupported ? 'Future template default' : 'Future template default (unavailable)';
      const preferred = state.sidebarTab === 'page' && hasCurrentPageRun ? 'page' : 'document';
      scope.value = scope.querySelector(`option[value="${preferred}"]`)?.disabled ? 'document' : preferred;
    }

    function open(group, triggerElement = null) {
      if (!group?.settingsAvailable) {
        options.showStatus?.('Path Settings are available for grouped Paths.', 2200, { force: true });
        return;
      }
      const modal = el('pathSettingsModal');
      restoreFocusElement = triggerElement || root.activeElement || null;
      if (restoreFocusElement === modal || modal.contains(restoreFocusElement)) restoreFocusElement = null;
      const settings = pathSettingsFromGroup(group);
      const currentRun = currentRunForGroup(group);
      context = {
        groupId: group.id,
        pathTemplateId: settings.pathTemplateId,
        pathId: settings.pathId,
        currentPage: pageNow(),
        currentMeasurementId: currentRun?.id ?? null,
        pathName: settings.pathName,
        categoryOptions: [],
      };
      el('pathSettingsSummary').textContent = `Choose where changes apply to ${settings.pathName}.`;
      el('pathSettingsName').value = settings.pathName;
      el('pathSettingsLineColor').value = settings.pathStyle.stroke.color;
      el('pathSettingsLineBorder').value = settings.pathStyle.stroke.border;
      el('pathSettingsLineBorderMatches').checked = settings.pathStyle.stroke.borderMatchesFill;
      el('pathSettingsLineStyle').value = settings.pathStyle.stroke.style;
      el('pathSettingsAnchorFill').value = settings.pathStyle.anchors.fill;
      el('pathSettingsAnchorBorder').value = settings.pathStyle.anchors.border;
      el('pathSettingsAnchorBorderMatches').checked = settings.pathStyle.anchors.borderMatchesStroke;
      populateCategories(settings);
      configureScope(group, currentRun, settings);
      updatePreview();
      modal.classList.add('show');
      setTimeout(() => el('pathSettingsName').focus(), 30);
    }

    function close() {
      const modal = el('pathSettingsModal');
      const activeElement = root.activeElement;
      modal.classList.remove('show');
      context = null;
      if (activeElement && modal.contains(activeElement)) activeElement.blur?.();
      if (restoreFocusElement && restoreFocusElement.isConnected !== false) {
        try {
          restoreFocusElement.focus({ preventScroll: true });
        } catch (_) {
          restoreFocusElement.focus?.();
        }
      }
      restoreFocusElement = null;
    }

    function patchFromModal() {
      const categorySelect = el('pathSettingsCategory');
      const newCategoryInput = el('pathSettingsNewCategory');
      const category = categoryFromSelection({
        value: categorySelect.value,
        newName: newCategoryInput.value,
        options: context?.categoryOptions || [],
      });
      if (categorySelect.value === CATEGORY_CREATE_VALUE && !category.name) {
        newCategoryInput.setAttribute('aria-invalid', 'true');
        newCategoryInput.focus();
        return null;
      }
      const patch = {
        pathName: el('pathSettingsName').value.trim() || context?.pathName || 'Path',
        pathStyle: styleFromFields(),
      };
      if (!category.keep) {
        patch.pathCategoryId = category.id;
        patch.pathCategoryName = category.name;
      }
      return patch;
    }

    function apply() {
      if (!context) return;
      const patch = patchFromModal();
      if (!patch) return;
      const scope = el('pathSettingsScope').value;
      if (scope === APPLY_SCOPES.TEMPLATE) {
        if (!templateSupportsPath(state, context)) {
          options.showStatus?.('Future template default is unavailable for this Path.', 2200, { force: true });
          return;
        }
        const nextState = pathTemplates.updatePathSettings(state, context.pathTemplateId, context.pathId, patch);
        state.pathTemplates = nextState.pathTemplates;
        state.activePathTemplateId = nextState.activePathTemplateId;
        state.activePathId = nextState.activePathId;
        store?.save?.(state);
        templateHome?.render?.();
        close();
        options.showStatus?.('Future Path default updated.', 2200, { force: true });
        return;
      }
      const historyBefore = options.createHistorySnapshot?.();
      const result = applyPathSettingsToMeasurements(state.measurements, context, patch, { scope });
      if (!result.changedIds.length) {
        options.showStatus?.('No matching Path runs for that apply option.', 2200, { force: true });
        return;
      }
      options.setMeasurements?.(result.measurements, state.selectedId);
      options.syncSelectionWithPathCategoryVisibility?.();
      options.recordHistory?.(historyBefore, 'Path Settings');
      close();
      options.renderList?.();
      options.redraw?.();
      options.showStatus?.(`Updated ${result.changedIds.length} Path run${result.changedIds.length === 1 ? '' : 's'}.`, 2200, { force: true });
    }

    function bind() {
      for (const id of ['pathSettingsLineColor', 'pathSettingsLineBorder', 'pathSettingsLineBorderMatches', 'pathSettingsLineStyle', 'pathSettingsAnchorFill', 'pathSettingsAnchorBorder', 'pathSettingsAnchorBorderMatches']) {
        el(id).addEventListener('input', updatePreview);
        el(id).addEventListener('change', updatePreview);
      }
      el('pathSettingsCategory').addEventListener('change', updateNewCategoryState);
      el('pathSettingsCancel').addEventListener('click', close);
      el('pathSettingsApply').addEventListener('click', apply);
      el('pathSettingsModal').addEventListener('click', (event) => {
        if (event.target === el('pathSettingsModal')) close();
      });
    }

    bind();
    return {
      open,
      close,
      isOpen() {
        return el('pathSettingsModal').classList.contains('show');
      },
    };
  }

  window.TakeoffPathSettings = {
    APPLY_SCOPES,
    CATEGORY_CREATE_VALUE,
    CATEGORY_KEEP_VALUE,
    cloneValue,
    normalizePathStyle,
    pathStyleFromSource,
    categoryFromSource,
    pathSettingsFromGroup,
    normalizeSettings,
    matchesPath,
    applyPathSettingsToMeasurements,
    categoryOptionsFromState,
    categoryFromSelection,
    templateSupportsPath,
    createPathSettingsModal,
  };
})();
