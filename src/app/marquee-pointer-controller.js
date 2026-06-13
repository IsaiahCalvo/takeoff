(function () {
  function createPointerMarqueeController({
    state,
    screenToImage,
    lengthLabelNavigationTarget,
    isPointInBox,
    findNearestVertex,
    findLabelHit,
    findNearestMeasurement,
    findTransformResizeHandleHit,
    clearActiveFitMode,
    endRotateMode,
    marqueeSelection,
  } = {}) {
    function canStart(event) {
      return !!state.baseW && state.mode === 'selection' && event.button === 0 && event.isPrimary !== false;
    }

    function hitsInteractiveTarget(event, point) {
      if (lengthLabelNavigationTarget(event.target)) return true;
      if (state.rotateModeId && isPointInBox(point, state.rotationHandleHitbox)) return true;
      if (state.rotateModeId && findTransformResizeHandleHit?.(point)) return true;
      if (findNearestVertex(point, 10 / state.zoom)) return true;
      if (findLabelHit(point)) return true;
      return findNearestMeasurement(point, 8 / state.zoom) != null;
    }

    function pointerDown(event) {
      if (!canStart(event) || state.marqueeSelection) return false;
      const point = screenToImage(event.clientX, event.clientY);
      state.cursorImg = point;
      state.shiftHeld = event.shiftKey;
      if (hitsInteractiveTarget(event, point)) return false;
      clearActiveFitMode();
      endRotateMode();
      marqueeSelection.start({ point, clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey, altKey: event.altKey, pointerId: event.pointerId });
      event.preventDefault();
      return true;
    }

    return { pointerDown };
  }

  window.TakeoffMarqueePointerController = { createPointerMarqueeController };
})();
