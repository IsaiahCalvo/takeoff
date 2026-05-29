(function () {
  function buildContextMenuHit({ labelHit = null, anchorHit = null, pathHit = null } = {}) {
    const hitId = labelHit?.measurementId ?? anchorHit?.measurementId ?? pathHit?.measurementId ?? null;
    const target = anchorHit
      ? { ...anchorHit, kind: 'anchor-hit', anchorKind: anchorHit.kind }
      : (pathHit ? { kind: 'path-hit', ...pathHit } : null);
    return { hitId, target };
  }

  function appendPointToDraft({ inProgress, point, shiftKey = false, snapPoint }) {
    const points = inProgress?.points || [];
    const previous = points[points.length - 1];
    const nextPoint = shiftKey && previous && snapPoint ? snapPoint(previous, point) : point;
    return {
      ...inProgress,
      points: [...points, nextPoint],
    };
  }

  window.TakeoffPointerWorkflow = {
    buildContextMenuHit,
    appendPointToDraft,
  };
})();
