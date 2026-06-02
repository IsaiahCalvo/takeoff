(function () {
  function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function sourceObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function cleanKey(value) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  function visibilityBoolean(value) {
    if (typeof value === 'boolean') return value;
    const source = sourceObject(value);
    if (typeof source.visible === 'boolean') return source.visible;
    if (typeof source.hidden === 'boolean') return !source.hidden;
    return null;
  }

  function normalizePathCategoryVisibility(input = {}) {
    const source = sourceObject(input);
    const visibility = {};
    for (const [rawKey, rawValue] of Object.entries(source)) {
      const key = cleanKey(rawKey);
      const visible = visibilityBoolean(rawValue);
      if (!key || visible == null) continue;
      visibility[key] = visible;
    }
    return visibility;
  }

  function activeDocument(state) {
    return (state.documents || []).find(doc => doc.id === state.activeDocId) || null;
  }

  function activeDocumentName(state) {
    return activeDocument(state)?.name || 'takeoff';
  }

  function exportBaseName(state) {
    const cleaned = activeDocumentName(state)
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return cleaned || 'takeoff-measurements';
  }

  function createDocumentSnapshot(state, nameOverride = null) {
    if (!state.activeDocId || (!state.pdf && !state.imageBitmap)) return null;
    return {
      id: state.activeDocId,
      name: nameOverride || activeDocumentName(state) || 'Untitled',
      pdf: state.pdf,
      pdfSourceData: state.pdfSourceData,
      pdfFileName: state.pdfFileName,
      pdfPage: state.pdfPage,
      pdfPages: state.pdfPages,
      continuousScrollMode: !!state.continuousScrollMode,
      continuousScrollPreferences: { ...(state.continuousScrollPreferences || {}) },
      pathCategoryVisibility: normalizePathCategoryVisibility(state.pathCategoryVisibility),
      imageBitmap: state.imageBitmap,
      baseW: state.baseW,
      baseH: state.baseH,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      activeFitMode: state.activeFitMode,
      pxPerInch: state.pxPerInch,
      pageScales: { ...(state.pageScales || {}) },
      measurements: cloneValue(state.measurements) || [],
      sidebarTab: state.sidebarTab,
      collapsedPageGroups: { ...(state.collapsedPageGroups || {}) },
      pageCache: new Map(state.pageCache || []),
    };
  }

  function saveDocumentSnapshot(state, nameOverride = null) {
    const doc = createDocumentSnapshot(state, nameOverride);
    if (!doc) return null;
    const idx = state.documents.findIndex(existing => existing.id === doc.id);
    if (idx >= 0) state.documents[idx] = doc;
    else state.documents.push(doc);
    return doc;
  }

  window.TakeoffDocumentStore = {
    activeDocument,
    activeDocumentName,
    exportBaseName,
    normalizePathCategoryVisibility,
    createDocumentSnapshot,
    saveDocumentSnapshot,
  };
})();
