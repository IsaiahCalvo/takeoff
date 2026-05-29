(function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampPoint(point, width, height) {
    if (!point || !width || !height) return point;
    return {
      x: clamp(point.x, 0, width),
      y: clamp(point.y, 0, height),
    };
  }

  function isPositiveFinite(value) {
    return Number.isFinite(value) && value > 0;
  }

  function isUsableRect(rect) {
    return !!rect
      && Number.isFinite(rect.left)
      && Number.isFinite(rect.top)
      && isPositiveFinite(rect.width)
      && isPositiveFinite(rect.height);
  }

  function hasPageSize(width, height) {
    return isPositiveFinite(width) && isPositiveFinite(height);
  }

  function computeFitViewTransform({ stageWidth, stageHeight, baseWidth, baseHeight, fitMode = 'page', padding = 32 }) {
    if (!stageWidth || !stageHeight || !baseWidth || !baseHeight) return null;
    const availableW = Math.max(1, stageWidth - padding);
    const availableH = Math.max(1, stageHeight - padding);
    const zoom = fitMode === 'width'
      ? availableW / baseWidth
      : fitMode === 'height'
        ? availableH / baseHeight
        : Math.min(availableW / baseWidth, availableH / baseHeight);
    return {
      zoom,
      panX: (stageWidth - baseWidth * zoom) / 2,
      panY: (stageHeight - baseHeight * zoom) / 2,
    };
  }

  function screenToImagePoint({ clientX, clientY, stageRect, viewportRect, zoom, panX, panY, baseWidth, baseHeight }) {
    if (isUsableRect(viewportRect) && hasPageSize(baseWidth, baseHeight)) {
      return clampPoint({
        x: ((clientX - viewportRect.left) / viewportRect.width) * baseWidth,
        y: ((clientY - viewportRect.top) / viewportRect.height) * baseHeight,
      }, baseWidth, baseHeight);
    }
    const sx = clientX - stageRect.left;
    const sy = clientY - stageRect.top;
    return clampPoint({ x: (sx - panX) / zoom, y: (sy - panY) / zoom }, baseWidth, baseHeight);
  }

  function imageToScreenPoint(point, { stageRect, viewportRect, zoom, panX, panY, baseWidth, baseHeight }) {
    if (point && isUsableRect(viewportRect) && hasPageSize(baseWidth, baseHeight)) {
      const x = viewportRect.left + (point.x / baseWidth) * viewportRect.width;
      const y = viewportRect.top + (point.y / baseHeight) * viewportRect.height;
      return {
        x: x - (stageRect?.left || 0),
        y: y - (stageRect?.top || 0),
      };
    }
    return { x: point.x * zoom + panX, y: point.y * zoom + panY };
  }

  function zoomAtPoint({
    zoom,
    panX,
    panY,
    stageRect,
    viewportRect,
    point,
    factor,
    baseWidth,
    baseHeight,
    minZoom = 0.05,
    maxZoom = 20,
  }) {
    const imagePoint = screenToImagePoint({
      clientX: point.clientX,
      clientY: point.clientY,
      stageRect,
      viewportRect,
      zoom,
      panX,
      panY,
      baseWidth,
      baseHeight,
    });
    const nextZoom = clamp(zoom * factor, minZoom, maxZoom);
    const newScreen = imageToScreenPoint(imagePoint, { zoom: nextZoom, panX, panY });
    const targetSx = point.clientX - stageRect.left;
    const targetSy = point.clientY - stageRect.top;
    const nextPanX = panX + targetSx - newScreen.x;
    const nextPanY = panY + targetSy - newScreen.y;
    return {
      zoom: nextZoom,
      panX: nextPanX,
      panY: nextPanY,
      cursorImg: screenToImagePoint({
        clientX: point.clientX,
        clientY: point.clientY,
        stageRect,
        zoom: nextZoom,
        panX: nextPanX,
        panY: nextPanY,
        baseWidth,
        baseHeight,
      }),
    };
  }

  window.TakeoffViewer = {
    computeFitViewTransform,
    screenToImagePoint,
    imageToScreenPoint,
    zoomAtPoint,
  };
})();
