(function () {
  const DEFAULT_TEMPLATE_ID = 'default-path-template';
  const DEFAULT_PATH_ID = 'default-path';
  const DEFAULT_STROKE_COLOR = '#b6ff3c';
  const DEFAULT_ANCHOR_FILL = '#ffffff';
  const VALID_GEOMETRIES = new Set(['line', 'freehand']);
  const VALID_STROKE_STYLES = new Set(['solid', 'dashed', 'dotted']);
  let generatedId = 0;

  function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function sourceObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function cleanString(value, fallback) {
    return cleanOptionalString(value) || fallback;
  }

  function cleanOptionalString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function createId(prefix) {
    generatedId += 1;
    return `${prefix}-${Date.now().toString(36)}-${generatedId}`;
  }

  function defaultPathIdForTemplate(templateId) {
    return templateId === DEFAULT_TEMPLATE_ID ? DEFAULT_PATH_ID : `${templateId}-default-path`;
  }

  function normalizeStroke(stroke) {
    const source = sourceObject(stroke);
    const color = cleanString(source.color, DEFAULT_STROKE_COLOR);
    const style = VALID_STROKE_STYLES.has(source.style) ? source.style : 'solid';
    return { color, style };
  }

  function normalizeAnchors(anchors, stroke) {
    const source = sourceObject(anchors);
    const borderMatchesStroke = typeof source.borderMatchesStroke === 'boolean'
      ? source.borderMatchesStroke
      : true;
    const border = borderMatchesStroke
      ? stroke.color
      : cleanString(source.border, stroke.color);
    return {
      fill: cleanString(source.fill, DEFAULT_ANCHOR_FILL),
      border,
      borderMatchesStroke,
    };
  }

  function normalizeOrder(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function createDefaultPath(templateId = DEFAULT_TEMPLATE_ID) {
    return {
      id: defaultPathIdForTemplate(templateId),
      templateId,
      name: 'Path',
      geometry: 'line',
      stroke: {
        color: DEFAULT_STROKE_COLOR,
        style: 'solid',
      },
      anchors: {
        fill: DEFAULT_ANCHOR_FILL,
        border: DEFAULT_STROKE_COLOR,
        borderMatchesStroke: true,
      },
      order: 0,
    };
  }

  function normalizePath(path, options = {}) {
    const source = sourceObject(path);
    const templateId = cleanString(options.templateId || source.templateId, DEFAULT_TEMPLATE_ID);
    const stroke = normalizeStroke(source.stroke);
    return {
      id: cleanOptionalString(source.id) || options.id || createId('path'),
      templateId,
      name: cleanString(source.name, options.nameFallback || 'Untitled path'),
      geometry: VALID_GEOMETRIES.has(source.geometry) ? source.geometry : 'line',
      stroke,
      anchors: normalizeAnchors(source.anchors, stroke),
      order: normalizeOrder(source.order, options.order || 0),
    };
  }

  function createPath(input = {}, options = {}) {
    return normalizePath(input, {
      ...options,
      id: options.id || createId('path'),
      nameFallback: options.nameFallback || 'Path',
    });
  }

  function createDefaultPathTemplate() {
    return {
      id: DEFAULT_TEMPLATE_ID,
      title: 'Default',
      paths: [createDefaultPath(DEFAULT_TEMPLATE_ID)],
    };
  }

  function normalizePathTemplate(template, options = {}) {
    const source = sourceObject(template);
    const id = cleanOptionalString(source.id) || options.id || createId('path-template');
    const paths = Array.isArray(source.paths)
      ? source.paths.map((path, index) => normalizePath(path, { templateId: id, order: index }))
      : [];
    return {
      id,
      title: cleanString(source.title, options.titleFallback || 'Untitled template'),
      paths: paths.length ? paths.sort((a, b) => a.order - b.order) : [createDefaultPath(id)],
    };
  }

  function createPathTemplate(input = {}, options = {}) {
    return normalizePathTemplate(input, {
      ...options,
      id: options.id || createId('path-template'),
      titleFallback: options.titleFallback || 'Untitled template',
    });
  }

  function normalizePathTemplateState(input = {}) {
    const source = sourceObject(input);
    const templates = Array.isArray(source.pathTemplates)
      ? source.pathTemplates.map((template, index) => normalizePathTemplate(template, { id: index === 0 ? DEFAULT_TEMPLATE_ID : undefined }))
      : [];
    const pathTemplates = templates.length ? templates : [createDefaultPathTemplate()];
    const activeTemplate = pathTemplates.find(template => template.id === source.activePathTemplateId) || pathTemplates[0];
    const activePath = activeTemplate.paths.find(path => path.id === source.activePathId) || activeTemplate.paths[0] || null;
    return {
      pathTemplates,
      activePathTemplateId: activeTemplate?.id || null,
      activePathId: activePath?.id || null,
    };
  }

  function createInitialPathTemplateState() {
    return normalizePathTemplateState({
      pathTemplates: [createDefaultPathTemplate()],
      activePathTemplateId: DEFAULT_TEMPLATE_ID,
      activePathId: DEFAULT_PATH_ID,
    });
  }

  function mapTemplate(state, templateId, updater) {
    const current = normalizePathTemplateState(state);
    let changed = false;
    const pathTemplates = current.pathTemplates.map((template) => {
      if (template.id !== templateId) return template;
      changed = true;
      return updater(template);
    });
    return changed
      ? normalizePathTemplateState({ ...current, pathTemplates })
      : current;
  }

  function addPathTemplate(state, input = {}) {
    const current = normalizePathTemplateState(state);
    const template = createPathTemplate(input);
    return normalizePathTemplateState({
      pathTemplates: [...current.pathTemplates, template],
      activePathTemplateId: template.id,
      activePathId: template.paths[0]?.id || null,
    });
  }

  function renamePathTemplate(state, templateId, title) {
    const current = normalizePathTemplateState(state);
    return mapTemplate(current, templateId, template => ({
      ...template,
      title: cleanString(title, template.title),
    }));
  }

  function deletePathTemplate(state, templateId) {
    const current = normalizePathTemplateState(state);
    const pathTemplates = current.pathTemplates.filter(template => template.id !== templateId);
    return normalizePathTemplateState({
      pathTemplates: pathTemplates.length ? pathTemplates : [createDefaultPathTemplate()],
      activePathTemplateId: current.activePathTemplateId === templateId ? null : current.activePathTemplateId,
      activePathId: current.activePathTemplateId === templateId ? null : current.activePathId,
    });
  }

  function addPath(state, templateId, input = {}) {
    const current = normalizePathTemplateState(state);
    let addedPath = null;
    const next = mapTemplate(current, templateId, (template) => {
      const nextOrder = template.paths.length
        ? Math.max(...template.paths.map(path => path.order)) + 1
        : 0;
      addedPath = createPath(input, { templateId: template.id, order: nextOrder });
      return { ...template, paths: [...template.paths, addedPath] };
    });
    return addedPath
      ? normalizePathTemplateState({ ...next, activePathTemplateId: templateId, activePathId: addedPath.id })
      : next;
  }

  function renamePath(state, templateId, pathId, name) {
    return mapTemplate(state, templateId, template => ({
      ...template,
      paths: template.paths.map(path => (
        path.id === pathId ? { ...path, name: cleanString(name, path.name) } : path
      )),
    }));
  }

  function updatePathStyle(state, templateId, pathId, style = {}) {
    const patch = sourceObject(style);
    return mapTemplate(state, templateId, template => ({
      ...template,
      paths: template.paths.map((path) => {
        if (path.id !== pathId) return path;
        return normalizePath({
          ...path,
          stroke: { ...path.stroke, ...sourceObject(patch.stroke) },
          anchors: { ...path.anchors, ...sourceObject(patch.anchors) },
        }, { templateId: template.id, order: path.order });
      }),
    }));
  }

  function deletePath(state, templateId, pathId) {
    const current = normalizePathTemplateState(state);
    let replacementPathId = current.activePathId;
    const next = mapTemplate(current, templateId, (template) => {
      const paths = template.paths.filter(path => path.id !== pathId);
      const nextPaths = paths.length ? paths : [createDefaultPath(template.id)];
      if (current.activePathTemplateId === template.id && current.activePathId === pathId) {
        replacementPathId = nextPaths[0]?.id || null;
      }
      return { ...template, paths: nextPaths };
    });
    return normalizePathTemplateState({
      ...next,
      activePathTemplateId: current.activePathTemplateId,
      activePathId: replacementPathId,
    });
  }

  function selectPathTemplate(state, templateId) {
    const current = normalizePathTemplateState(state);
    const template = current.pathTemplates.find(candidate => candidate.id === templateId);
    if (!template) return current;
    return normalizePathTemplateState({
      ...current,
      activePathTemplateId: template.id,
      activePathId: template.paths[0]?.id || null,
    });
  }

  function selectPath(state, templateId, pathId) {
    const current = normalizePathTemplateState(state);
    const template = current.pathTemplates.find(candidate => candidate.id === templateId);
    const path = template?.paths.find(candidate => candidate.id === pathId);
    if (!template || !path) return current;
    return normalizePathTemplateState({
      ...current,
      activePathTemplateId: template.id,
      activePathId: path.id,
    });
  }

  window.TakeoffPathTemplates = {
    DEFAULT_TEMPLATE_ID,
    DEFAULT_PATH_ID,
    createDefaultPath,
    createDefaultPathTemplate,
    createInitialPathTemplateState,
    createPath,
    createPathTemplate,
    normalizePath,
    normalizePathTemplate,
    normalizePathTemplateState,
    addPathTemplate,
    renamePathTemplate,
    deletePathTemplate,
    addPath,
    renamePath,
    updatePathStyle,
    deletePath,
    selectPathTemplate,
    selectPath,
    cloneValue,
  };
})();
