(function () {
  function shouldSuppressPointPlacement({ button = 0, detail = 0, now = 0, suppressPointUntil = 0 } = {}) {
    if (button !== 0) return true;
    if (detail && detail > 1) return true;
    return now < suppressPointUntil;
  }

  function shouldStartPan({ button = 0, mode = null } = {}) {
    return button === 1 || mode === 'pan';
  }

  function createPanStart({ clientX = 0, clientY = 0, panX = 0, panY = 0 } = {}) {
    return { x: clientX - panX, y: clientY - panY };
  }

  function nextPanFromPointer({ clientX = 0, clientY = 0, panStart = { x: 0, y: 0 } } = {}) {
    return { panX: clientX - panStart.x, panY: clientY - panStart.y };
  }

  function hasActivePointerDrag(state = {}) {
    return !!(
      state.rotationDrag ||
      state.dragVertex ||
      state.dragMeasurement ||
      state.dragLabel ||
      state.isPanning
    );
  }

  function shouldFinishPointerDragOnMove(state = {}, buttons = 0) {
    return hasActivePointerDrag(state) && buttons === 0;
  }

  window.TakeoffPointerController = {
    shouldSuppressPointPlacement,
    shouldStartPan,
    createPanStart,
    nextPanFromPointer,
    hasActivePointerDrag,
    shouldFinishPointerDragOnMove,
  };
})();
