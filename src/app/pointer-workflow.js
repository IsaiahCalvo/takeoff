(function () {
  const geometry = window.TakeoffGeometry;
  const measurementModel = window.TakeoffMeasurements;

  function isCurveMeasurement(measurement) {
    return measurementModel?.isCurveMeasurement
      ? measurementModel.isCurveMeasurement(measurement)
      : !!(measurement && Array.isArray(measurement.segments) && measurement.segments.length);
  }

  function clonePoint(point) {
    return { x: point.x, y: point.y };
  }

  function clonePoints(points) {
    return (points || []).map(clonePoint);
  }

  function cloneSegment(segment) {
    return {
      ...segment,
      from: clonePoint(segment.from),
      c1: clonePoint(segment.c1),
      c2: clonePoint(segment.c2),
      to: clonePoint(segment.to),
    };
  }

  function cloneSegments(segments) {
    return segments ? segments.map(cloneSegment) : null;
  }

  function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function cloneShape(shape) {
    return measurementModel?.cloneShapeMetadata ? measurementModel.cloneShapeMetadata(shape) : null;
  }

  function transformShape(shape, mapPoint) {
    return shape && measurementModel?.transformShapeGeometry ? measurementModel.transformShapeGeometry(shape, mapPoint) : shape;
  }

  function translateShape(shape, dx, dy) {
    return transformShape(shape, point => ({ x: point.x + dx, y: point.y + dy }));
  }

  function transformCurrentGeometry(current, mapPoint) {
    if (!current || typeof current !== 'object') return current;
    return {
      ...current,
      points: Array.isArray(current.points) ? current.points.map(mapPoint) : current.points,
      segments: Array.isArray(current.segments) ? current.segments.map(segment => ({
        ...segment,
        from: mapPoint(segment.from),
        c1: mapPoint(segment.c1),
        c2: mapPoint(segment.c2),
        to: mapPoint(segment.to),
      })) : current.segments,
    };
  }

  function transformMergeMemory(memory, mapPoint) {
    const cloned = cloneValue(memory);
    if (!cloned?.sources || typeof mapPoint !== 'function') return cloned;
    cloned.sources = cloned.sources.map(source => ({
      ...source,
      current: transformCurrentGeometry(source.current, mapPoint),
    }));
    return cloned;
  }

  function translateMergeMemory(memory, dx, dy) {
    return transformMergeMemory(memory, point => ({ x: point.x + dx, y: point.y + dy }));
  }

  function rotateShape(shape, center, degrees) {
    return transformShape(shape, point => geometry.rotatePoint(point, center, degrees));
  }

  function rotateMergeMemory(memory, center, degrees) {
    return transformMergeMemory(memory, point => geometry.rotatePoint(point, center, degrees));
  }

  function scaleShape(shape, center, scale) {
    return transformShape(shape, point => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale,
    }));
  }

  function scaleMergeMemory(memory, center, scale) {
    return transformMergeMemory(memory, point => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale,
    }));
  }

  function firstPointDelta(before, after) {
    return before?.length && after?.length
      ? { dx: after[0].x - before[0].x, dy: after[0].y - before[0].y }
      : { dx: 0, dy: 0 };
  }

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

  function resolveSnapPoint({ enabled = false, point, findSnapTarget } = {}) {
    if (!enabled || !point || typeof findSnapTarget !== 'function') return { point, snap: null };
    const snap = findSnapTarget(point) || null;
    return {
      point: snap?.point || point,
      snap,
    };
  }

  function draftAnchorPoints(draft) {
    return draft?.anchorPoints?.length ? draft.anchorPoints : (draft?.points || []);
  }

  function measurementAnchorPoints(measurement) {
    if (Array.isArray(measurement?.points) && measurement.points.length) return measurement.points;
    return measurementModel?.measurementDisplayPoints
      ? measurementModel.measurementDisplayPoints(measurement)
      : [];
  }

  function continuationPointsForSelfSnap({ measurement = null, draft = null, endpoint = null } = {}) {
    if (!draft?.continuation || !measurement || (endpoint !== 'start' && endpoint !== 'end')) return null;
    const basePoints = measurementAnchorPoints(measurement);
    const draftPoints = draftAnchorPoints(draft);
    if (!basePoints.length) return draftPoints;
    if (!draftPoints.length) return basePoints;
    const additions = draftPoints.slice(1);
    return endpoint === 'start'
      ? [...additions.slice().reverse(), ...basePoints]
      : [...basePoints, ...additions];
  }

  function endpointPointsForSelfSnap({ measurement = null, draft = null, endpoint = null } = {}) {
    const continuationPoints = continuationPointsForSelfSnap({ measurement, draft, endpoint });
    if (continuationPoints) return continuationPoints;
    if (draft) return draftAnchorPoints(draft);
    if (!measurement) return [];
    return measurementModel?.measurementDisplayPoints
      ? measurementModel.measurementDisplayPoints(measurement)
      : (measurement.points || []);
  }

  function selfSnapPointCount({ measurement = null, draft = null, endpoint = null } = {}) {
    const points = endpointPointsForSelfSnap({ measurement, draft, endpoint });
    return Array.isArray(points) ? points.length : 0;
  }

  function resolveEndpointSelfSnap({
    enabled = false,
    endpoint = null,
    point = null,
    measurement = null,
    draft = null,
    tolerance = 0,
    minPointCount = 3,
  } = {}) {
    if (!enabled || !point || (endpoint !== 'start' && endpoint !== 'end')) return null;
    const points = endpointPointsForSelfSnap({ measurement, draft, endpoint });
    if (!Array.isArray(points) || points.length < minPointCount) return null;
    const targetEndpoint = endpoint === 'end' ? 'start' : 'end';
    const targetPoint = targetEndpoint === 'start' ? points[0] : points[points.length - 1];
    if (!targetPoint || geometry.distancePx(point, targetPoint) > tolerance) return null;
    const snappedPoint = clonePoint(targetPoint);
    return {
      point: snappedPoint,
      snap: {
        kind: 'anchor',
        measurementId: measurement?.id ?? '__draft__',
        endpoint: targetEndpoint,
        point: snappedPoint,
        selfClosing: true,
      },
    };
  }

  function resolveDraftPreviewPointSnap({
    enabled = false,
    point = null,
    draft = null,
    tolerance = 0,
    snapPoint = null,
  } = {}) {
    const fallback = { point, snap: null };
    if (!enabled || !point) return fallback;
    const selfSnap = resolveEndpointSelfSnap({ enabled, endpoint: 'end', point, draft, tolerance });
    if (selfSnap) return selfSnap;
    return typeof snapPoint === 'function' ? (snapPoint(point) || fallback) : fallback;
  }

  function isSnapPlacementMode(mode) {
    return mode === 'measure' || mode === 'calibrate';
  }

  function snapFeedbackKey(snap) {
    if (!snap?.point) return '';
    return `${snap.kind || ''}:${snap.measurementId ?? ''}:${snap.point.x.toFixed(2)}:${snap.point.y.toFixed(2)}`;
  }

  function shouldPreviewSnapCursor(state, rawStackPoint) {
    return !!(state &&
      rawStackPoint &&
      state.snapToPaths &&
      isSnapPlacementMode(state.mode) &&
      !state.isPanning &&
      !state.marqueeSelection &&
      !state.dragVertex &&
      !state.dragMeasurement &&
      !state.dragLabel &&
      !state.rotationDrag);
  }

  function shouldShowSnappedCursor(state) {
    return !!(shouldPreviewSnapCursor(state, state?.cursorImg) && state.snapFeedback?.point);
  }

  function resolvePointerSnapPreview({
    state,
    rawStackPoint,
    shiftKey = false,
    placementPointInfo,
    stackPointForPage,
  } = {}) {
    const before = snapFeedbackKey(state?.snapFeedback);
    if (!shouldPreviewSnapCursor(state, rawStackPoint)) {
      if (state && (!state.snapToPaths || !isSnapPlacementMode(state.mode))) state.snapFeedback = null;
      return { changed: before !== snapFeedbackKey(state?.snapFeedback), cursorImg: null };
    }
    const draft = state.freehandDraft;
    const inProgress = state.inProgress;
    const points = inProgress?.points || [];
    const continuationId = draft?.continuation?.measurementId || inProgress?.continuation?.measurementId;
    const info = placementPointInfo?.(rawStackPoint, {
      page: draft?.page || inProgress?.page || null,
      previous: points.length ? points[points.length - 1] : null,
      shiftKey: !!inProgress && shiftKey,
      excludeMeasurementIds: continuationId ? [continuationId] : [],
    });
    const cursorImg = info?.page && info.point && stackPointForPage
      ? stackPointForPage(info.page, info.point)
      : null;
    return { changed: before !== snapFeedbackKey(state.snapFeedback), cursorImg };
  }

  function createRotationDrag({ measurement, frame, pointer, historyBefore }) {
    const center = { x: frame.cx, y: frame.cy };
    return {
      measurementId: measurement.id,
      historyBefore,
      center,
      startPointerAngle: geometry.angleDegFromCenter(center, pointer),
      originalPoints: clonePoints(measurement.points),
      originalSegments: isCurveMeasurement(measurement) ? cloneSegments(measurement.segments) : null,
      originalShape: cloneShape(measurement.shape),
      originalMergeMemory: cloneValue(measurement.mergeMemory),
      originalAngle: geometry.normalizeDegrees(measurement.rotationAngle || 0),
      originalFrame: { ...frame },
    };
  }

  function resizeHandleVector(frame, handle) {
    const halfW = frame.width / 2;
    const halfH = frame.height / 2;
    const map = {
      n: { x: 0, y: -halfH },
      ne: { x: halfW, y: -halfH },
      e: { x: halfW, y: 0 },
      se: { x: halfW, y: halfH },
      s: { x: 0, y: halfH },
      sw: { x: -halfW, y: halfH },
      w: { x: -halfW, y: 0 },
      nw: { x: -halfW, y: -halfH },
    };
    return map[handle] || null;
  }

  function createTransformResizeDrag({ measurement, frame, handle, pointer, historyBefore }) {
    const handleVector = resizeHandleVector(frame, handle);
    if (!measurement || !frame || !handleVector) return null;
    return {
      measurementId: measurement.id,
      historyBefore,
      handle,
      center: { x: frame.cx, y: frame.cy },
      originalPoints: clonePoints(measurement.points),
      originalSegments: isCurveMeasurement(measurement) ? cloneSegments(measurement.segments) : null,
      originalShape: cloneShape(measurement.shape),
      originalMergeMemory: cloneValue(measurement.mergeMemory),
      originalAngle: geometry.normalizeDegrees(measurement.rotationAngle || frame.angle || 0),
      originalFrame: { ...frame },
      handleVector,
      startPointer: clonePoint(pointer),
    };
  }

  function createMeasurementDrag({ measurement, pointer, historyBefore, bounds }) {
    return {
      measurementId: measurement.id,
      historyBefore,
      start: clonePoint(pointer),
      originalPoints: clonePoints(measurement.points),
      originalSegments: isCurveMeasurement(measurement) ? cloneSegments(measurement.segments) : null,
      originalShape: cloneShape(measurement.shape),
      originalMergeMemory: cloneValue(measurement.mergeMemory),
      originalFrame: measurement.rotationFrame ? { ...measurement.rotationFrame } : null,
      originalBounds: bounds,
    };
  }

  function createMeasurementGroupDrag({ measurements = [], pointer, historyBefore, bounds }) {
    const measuredBounds = (bounds || measurements.map(measurement => measurementModel?.measurementBounds?.(measurement)).filter(Boolean));
    const groupBounds = Array.isArray(measuredBounds) && measuredBounds.length
      ? {
        x: Math.min(...measuredBounds.map(box => box.x)),
        y: Math.min(...measuredBounds.map(box => box.y)),
        width: Math.max(...measuredBounds.map(box => box.x + box.width)) - Math.min(...measuredBounds.map(box => box.x)),
        height: Math.max(...measuredBounds.map(box => box.y + box.height)) - Math.min(...measuredBounds.map(box => box.y)),
      }
      : measuredBounds;
    return {
      measurementId: measurements[0]?.id ?? null,
      measurementIds: measurements.map(measurement => measurement.id),
      historyBefore,
      start: clonePoint(pointer),
      originalBounds: groupBounds,
      targets: measurements,
      members: measurements.map(measurement => ({
        measurementId: measurement.id,
        originalPoints: clonePoints(measurement.points),
        originalSegments: isCurveMeasurement(measurement) ? cloneSegments(measurement.segments) : null,
        originalShape: cloneShape(measurement.shape),
        originalMergeMemory: cloneValue(measurement.mergeMemory),
        originalFrame: measurement.rotationFrame ? { ...measurement.rotationFrame } : null,
      })),
    };
  }

  function applyMeasurementDrag({ measurement, drag, cursor, constrainDelta, snapDelta = null }) {
    if (drag.members?.length) return applyMeasurementGroupDrag({ measurements: drag.targets || [measurement], drag, cursor, constrainDelta });
    const rawDx = cursor.x - drag.start.x;
    const rawDy = cursor.y - drag.start.y;
    let { dx, dy } = constrainDelta(drag.originalBounds, rawDx, rawDy);
    let snap = null;
    if (typeof snapDelta === 'function') {
      const snapped = snapDelta({
        dx,
        dy,
        rawDx,
        rawDy,
        originalPoints: drag.originalPoints,
        originalSegments: drag.originalSegments,
        originalBounds: drag.originalBounds,
      });
      if (snapped && Number.isFinite(snapped.dx) && Number.isFinite(snapped.dy)) {
        dx = snapped.dx;
        dy = snapped.dy;
        snap = snapped.snap || null;
      }
    }
    measurement.points = geometry.translatePoints(drag.originalPoints, dx, dy);
    if (isCurveMeasurement(measurement) && drag.originalSegments) {
      measurement.segments = geometry.translateSegments(drag.originalSegments, dx, dy);
    }
    if (drag.originalShape) measurement.shape = translateShape(drag.originalShape, dx, dy);
    if (drag.originalMergeMemory) measurement.mergeMemory = translateMergeMemory(drag.originalMergeMemory, dx, dy);
    if (drag.originalFrame) {
      measurement.rotationFrame = {
        ...drag.originalFrame,
        x: drag.originalFrame.x + dx,
        y: drag.originalFrame.y + dy,
        cx: drag.originalFrame.cx + dx,
        cy: drag.originalFrame.cy + dy,
      };
    }
    return snap ? { dx, dy, snap } : { dx, dy };
  }

  function applyMeasurementGroupDrag({ measurements = [], drag, cursor, constrainDelta }) {
    const rawDx = cursor.x - drag.start.x;
    const rawDy = cursor.y - drag.start.y;
    const { dx, dy } = constrainDelta(drag.originalBounds, rawDx, rawDy);
    const byId = new Map(measurements.map(measurement => [String(measurement.id), measurement]));
    const movedIds = [];
    for (const member of drag.members || []) {
      const measurement = byId.get(String(member.measurementId));
      if (!measurement) continue;
      applyMeasurementDrag({
        measurement,
        drag: { ...member, start: drag.start, originalBounds: drag.originalBounds },
        cursor: { x: drag.start.x + dx, y: drag.start.y + dy },
        constrainDelta: () => ({ dx, dy }),
      });
      movedIds.push(measurement.id);
    }
    return { dx, dy, movedIds };
  }

  function applyRotationFromSnapshot({
    measurement,
    center,
    originalAngle,
    originalFrame = null,
    originalPoints,
    originalSegments = null,
    originalShape = null,
    originalMergeMemory = null,
    nextAngle,
    constrainGeometry = (points, segments) => ({ points, segments }),
    createRotationFrame = () => null,
  }) {
    const normalizedAngle = geometry.normalizeDegrees(nextAngle);
    const normalizedOriginalAngle = geometry.normalizeDegrees(originalAngle);
    const rotateDelta = normalizedAngle - normalizedOriginalAngle;
    const isCurve = isCurveMeasurement(measurement);
    const rotatedPoints = originalPoints.map(pt => geometry.rotatePoint(pt, center, rotateDelta));
    const rotatedSegments = isCurve && originalSegments
      ? geometry.rotateSegmentsAround(originalSegments, center, rotateDelta)
      : null;
    const constrainedGeometry = constrainGeometry(rotatedPoints, isCurve ? rotatedSegments : null);
    const constrainedDelta = firstPointDelta(rotatedPoints, constrainedGeometry.points);
    const rotatedShape = originalShape ? translateShape(rotateShape(originalShape, center, rotateDelta), constrainedDelta.dx, constrainedDelta.dy) : null;
    const rotatedMergeMemory = originalMergeMemory
      ? translateMergeMemory(rotateMergeMemory(originalMergeMemory, center, rotateDelta), constrainedDelta.dx, constrainedDelta.dy)
      : null;

    measurement.points = constrainedGeometry.points;
    if (isCurve && constrainedGeometry.segments) {
      measurement.segments = constrainedGeometry.segments;
    }
    if (rotatedShape) measurement.shape = rotatedShape;
    if (rotatedMergeMemory) measurement.mergeMemory = rotatedMergeMemory;
    measurement.rotationAngle = normalizedAngle;
    measurement.rotationFrame = originalFrame
      ? {
        ...originalFrame,
        x: originalFrame.x + constrainedDelta.dx,
        y: originalFrame.y + constrainedDelta.dy,
        cx: originalFrame.cx + constrainedDelta.dx,
        cy: originalFrame.cy + constrainedDelta.dy,
      }
      : createRotationFrame(measurement);
    if (measurement.rotationFrame) measurement.rotationFrame.angle = normalizedAngle;

    return { nextAngle: normalizedAngle, rotateDelta };
  }

  function applyRotationDrag({
    measurement,
    drag,
    cursor,
    shiftKey = false,
    constrainGeometry = (points, segments) => ({ points, segments }),
    createRotationFrame = () => null,
  }) {
    const pointerAngle = geometry.angleDegFromCenter(drag.center, cursor);
    const delta = pointerAngle - drag.startPointerAngle;
    const rawAngle = geometry.normalizeDegrees(drag.originalAngle + delta);
    const nextAngle = shiftKey ? geometry.snapDegrees15(rawAngle) : rawAngle;
    return applyRotationFromSnapshot({
      measurement,
      center: drag.center,
      originalAngle: drag.originalAngle,
      originalFrame: drag.originalFrame,
      originalPoints: drag.originalPoints,
      originalSegments: drag.originalSegments,
      originalShape: drag.originalShape,
      originalMergeMemory: drag.originalMergeMemory,
      nextAngle,
      constrainGeometry,
      createRotationFrame,
    });
  }

  function resizeScaleForCursor(drag, cursor) {
    const unrotated = geometry.rotatePoint(cursor, drag.center, -drag.originalAngle);
    const current = {
      x: unrotated.x - drag.center.x,
      y: unrotated.y - drag.center.y,
    };
    const base = drag.handleVector;
    const baseLengthSq = base.x * base.x + base.y * base.y;
    if (!baseLengthSq) return 1;
    return Math.max(0.05, (current.x * base.x + current.y * base.y) / baseLengthSq);
  }

  function applyTransformResizeDrag({
    measurement,
    drag,
    cursor,
    constrainGeometry = (points, segments) => ({ points, segments }),
  }) {
    const scale = resizeScaleForCursor(drag, cursor);
    const isCurve = isCurveMeasurement(measurement);
    const scaledPoints = geometry.scalePointsAround(drag.originalPoints, drag.center, scale);
    const scaledSegments = isCurve && drag.originalSegments
      ? geometry.scaleSegmentsAround(drag.originalSegments, drag.center, scale)
      : null;
    const constrainedGeometry = constrainGeometry(scaledPoints, isCurve ? scaledSegments : null);
    const constrainedDelta = firstPointDelta(scaledPoints, constrainedGeometry.points);
    const scaledShape = drag.originalShape
      ? translateShape(scaleShape(drag.originalShape, drag.center, scale), constrainedDelta.dx, constrainedDelta.dy)
      : null;
    const scaledMergeMemory = drag.originalMergeMemory
      ? translateMergeMemory(scaleMergeMemory(drag.originalMergeMemory, drag.center, scale), constrainedDelta.dx, constrainedDelta.dy)
      : null;

    measurement.points = constrainedGeometry.points;
    if (isCurve && constrainedGeometry.segments) measurement.segments = constrainedGeometry.segments;
    if (scaledShape) measurement.shape = scaledShape;
    if (scaledMergeMemory) measurement.mergeMemory = scaledMergeMemory;
    measurement.rotationFrame = {
      ...drag.originalFrame,
      x: drag.center.x - (drag.originalFrame.width * scale) / 2 + constrainedDelta.dx,
      y: drag.center.y - (drag.originalFrame.height * scale) / 2 + constrainedDelta.dy,
      width: drag.originalFrame.width * scale,
      height: drag.originalFrame.height * scale,
      cx: drag.center.x + constrainedDelta.dx,
      cy: drag.center.y + constrainedDelta.dy,
      angle: drag.originalAngle,
    };
    measurement.rotationAngle = drag.originalAngle;
    return { scale };
  }

  function applyMeasurementRotation({
    measurement,
    center,
    nextAngle,
    constrainGeometry = (points, segments) => ({ points, segments }),
    createRotationFrame = () => null,
  }) {
    return applyRotationFromSnapshot({
      measurement,
      center,
      originalAngle: measurement.rotationAngle || 0,
      originalFrame: measurement.rotationFrame ? { ...measurement.rotationFrame } : null,
      originalPoints: clonePoints(measurement.points),
      originalSegments: isCurveMeasurement(measurement) ? cloneSegments(measurement.segments) : null,
      originalShape: cloneShape(measurement.shape),
      originalMergeMemory: cloneValue(measurement.mergeMemory),
      nextAngle,
      constrainGeometry,
      createRotationFrame,
    });
  }

  window.TakeoffPointerWorkflow = {
    buildContextMenuHit,
    appendPointToDraft,
    resolveSnapPoint,
    resolveEndpointSelfSnap,
    selfSnapPointCount,
    resolveDraftPreviewPointSnap,
    snapFeedbackKey,
    shouldPreviewSnapCursor,
    shouldShowSnappedCursor,
    resolvePointerSnapPreview,
    createRotationDrag,
    createTransformResizeDrag,
    createMeasurementDrag,
    createMeasurementGroupDrag,
    applyMeasurementDrag,
    applyMeasurementGroupDrag,
    applyRotationDrag,
    applyTransformResizeDrag,
    applyMeasurementRotation,
  };
})();
