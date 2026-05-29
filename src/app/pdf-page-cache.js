(function () {
  const SCALE_TOLERANCE = 0.01;

  function isPositiveNumber(value) {
    return Number.isFinite(value) && value > 0;
  }

  function cappedDevicePixelRatio(devicePixelRatio) {
    return Math.min(devicePixelRatio || 1, 2);
  }

  function desiredRenderScale({
    hasPdf,
    zoom,
    devicePixelRatio,
    minRenderScale,
    maxRenderScale,
    maxBitmapEdge,
    baseWidth,
    baseHeight,
  }) {
    if (!hasPdf) return 1;
    let target = Math.max(minRenderScale, zoom * cappedDevicePixelRatio(devicePixelRatio));
    if (isPositiveNumber(baseWidth) && isPositiveNumber(baseHeight)) {
      target = Math.min(target, maxBitmapEdge / Math.max(baseWidth, baseHeight));
    }
    return Math.min(target, maxRenderScale);
  }

  function isUsableEntry(entry, minRenderScale = 0) {
    return !!entry && (entry.renderScale || 1) + SCALE_TOLERANCE >= minRenderScale;
  }

  function getCachedPage(cache, pageNumber, minRenderScale = 0) {
    if (!cache.has(pageNumber)) return null;
    const entry = cache.get(pageNumber);
    if (!isUsableEntry(entry, minRenderScale)) return null;
    cache.delete(pageNumber);
    cache.set(pageNumber, entry);
    return entry;
  }

  function hasUsableCachedPage(cache, pageNumber, minRenderScale = 0) {
    return isUsableEntry(cache.get(pageNumber), minRenderScale);
  }

  function setCachedPage(cache, pageNumber, entry, { maxEntries = 20, currentPage = pageNumber } = {}) {
    const existing = cache.get(pageNumber);
    if (existing && (existing.renderScale || 1) > (entry.renderScale || 1)) return existing;
    cache.set(pageNumber, entry);
    while (cache.size > maxEntries) {
      let oldest = null;
      for (const key of cache.keys()) {
        if (key !== currentPage) {
          oldest = key;
          break;
        }
      }
      if (oldest == null) break;
      cache.delete(oldest);
    }
    return cache.get(pageNumber);
  }

  function planPreRenderPages({ currentPage, pageCount, cache, targetScale }) {
    const desired = [];
    for (let offset = 1; offset <= pageCount; offset++) {
      if (currentPage + offset <= pageCount) desired.push(currentPage + offset);
      if (currentPage - offset >= 1) desired.push(currentPage - offset);
    }
    return desired.filter(pageNumber => !hasUsableCachedPage(cache, pageNumber, targetScale));
  }

  window.TakeoffPdfPageCache = {
    desiredRenderScale,
    getCachedPage,
    hasUsableCachedPage,
    setCachedPage,
    planPreRenderPages,
  };
})();
