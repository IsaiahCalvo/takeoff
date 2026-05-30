(function () {
  function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
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
      pdfPage: state.pdfPage,
      pdfPages: state.pdfPages,
      continuousScrollMode: !!state.continuousScrollMode,
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
    createDocumentSnapshot,
    saveDocumentSnapshot,
  };
})();
