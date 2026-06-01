(function () {
  const geometry = window.TakeoffGeometry;
  const measurementModel = window.TakeoffMeasurements;

  function clonePoint(point) {
    return { x: point.x, y: point.y };
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

  function clonePoints(points) {
    return (points || []).map(clonePoint);
  }

  function cloneSegments(segments) {
    return segments ? segments.map(cloneSegment) : null;
  }

  function reverseSegment(segment) {
    return {
      ...segment,
      from: clonePoint(segment.to),
      c1: clonePoint(segment.c2),
      c2: clonePoint(segment.c1),
      to: clonePoint(segment.from),
    };
  }

  function reverseSegments(segments) {
    return (segments || []).slice().reverse().map(reverseSegment);
  }

  function samePoint(a, b) {
    return !!(a && b && Math.hypot(a.x - b.x, a.y - b.y) <= 0.0001);
  }

  function cloneMeasurementShape(measurement) {
    return measurementModel.cloneShapeMetadata(
      measurement && measurement.shape,
      measurementModel.measurementShapeKind(measurement),
    );
  }

  function translateShapeGeometry(shape, dx, dy) {
    return measurementModel.transformShapeGeometry(shape, point => ({ x: point.x + dx, y: point.y + dy }));
  }

  function scaleShapeGeometryAround(shape, center, scale) {
    return measurementModel.transformShapeGeometry(shape, point => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale,
    }));
  }

  function nextMeasurementColor(existingMeasurements, palette) {
    const colors = palette || [];
    const usedColors = new Set((existingMeasurements || []).map(measurement => measurement.color));
    let color = colors.find(candidate => !usedColors.has(candidate));
    if (!color && colors.length) color = colors[(existingMeasurements || []).length % colors.length];
    return color || '#b6ff3c';
  }

  function fallbackMeasurementName(existingMeasurements, measurement) {
    const list = existingMeasurements || [];
    const index = list.findIndex(item => measurement && item.id === measurement.id);
    return `Run ${index >= 0 ? index + 1 : list.length + 1}`;
  }

  function cleanMeasurementName(existingMeasurements, value, measurement) {
    const text = String(value || '').trim();
    return text || fallbackMeasurementName(existingMeasurements, measurement);
  }

  function defaultLabelT(points) {
    if (!points || points.length < 2) return 0.5;
    const total = geometry.polylineLengthPx(points);
    if (!total) return 0;
    const anchorClearancePx = 28;
    if (total <= anchorClearancePx * 2) return 0.5;
    return (total - anchorClearancePx) / total;
  }

  function createLineMeasurement({ id, points, existingMeasurements, palette, page, pxPerInch }) {
    const clonedPoints = clonePoints(points);
    const lengthPx = geometry.polylineLengthPx(clonedPoints);
    return {
      id,
      name: `Run ${(existingMeasurements || []).length + 1}`,
      color: nextMeasurementColor(existingMeasurements, palette),
      drawType: 'line',
      shape: measurementModel.createShapeMetadata('line'),
      points: clonedPoints,
      lengthInches: pxPerInch ? lengthPx / pxPerInch : null,
      lengthPx,
      page,
      labelT: defaultLabelT(clonedPoints),
    };
  }

  function createFreehandMeasurement({
    id,
    rawPoints,
    existingMeasurements,
    palette,
    page,
    pxPerInch,
    constrainGeometry,
  }) {
    const raw = rawPoints || [];
    if (raw.length < 2 || geometry.polylineLengthPx(raw) < 2) return null;
    let segments = measurementModel.buildFreehandSegments(raw, 8);
    if (!segments.length) return null;
    let points = measurementModel.anchorsFromSegments(segments);
    if (constrainGeometry) {
      const constrained = constrainGeometry(points, segments);
      points = constrained.points;
      segments = constrained.segments || segments;
    }
    const lengthPx = measurementModel.measurementLengthPx({ segments });
    return {
      id,
      name: `Run ${(existingMeasurements || []).length + 1}`,
      color: nextMeasurementColor(existingMeasurements, palette),
      drawType: 'freehand',
      shape: measurementModel.createShapeMetadata('freehand'),
      points: clonePoints(points),
      segments,
      lengthInches: pxPerInch ? lengthPx / pxPerInch : null,
      lengthPx,
      page,
      labelT: defaultLabelT(geometry.flattenSegments(segments, 18)),
    };
  }

  function cloneMeasurementForClipboard(selected, pageScales) {
    if (!selected) return null;
    return {
      ...selected,
      points: clonePoints(selected.points),
      segments: measurementModel.isCurveMeasurement(selected) ? cloneSegments(selected.segments) : null,
      shape: cloneMeasurementShape(selected),
      sourcePage: selected.page,
      sourceScale: (pageScales || {})[selected.page] || null,
      sourceLengthInches: selected.lengthInches,
      sourceLengthPx: selected.lengthPx || measurementModel.measurementLengthPx(selected),
    };
  }

  function deleteMeasurementById(existingMeasurements, id) {
    return (existingMeasurements || []).filter(measurement => measurement.id !== id);
  }

  function applyVertexDrag(measurement, drag, point) {
    if (!measurement || !drag || !point) return false;
    if (!measurementModel.isCurveMeasurement(measurement)) {
      measurement.points[drag.vertexIndex] = point;
      return true;
    }
    const segment = measurement.segments[drag.segmentIndex];
    if (!segment) return false;
    if (drag.kind === 'curve-control') {
      segment[drag.control] = point;
    } else if (drag.anchor === 'from') {
      const old = segment.from;
      const dx = point.x - old.x;
      const dy = point.y - old.y;
      segment.from = point;
      segment.c1 = { x: segment.c1.x + dx, y: segment.c1.y + dy };
      if (drag.segmentIndex > 0) {
        const previous = measurement.segments[drag.segmentIndex - 1];
        previous.to = point;
        previous.c2 = { x: previous.c2.x + dx, y: previous.c2.y + dy };
      }
    } else if (drag.anchor === 'to') {
      const old = segment.to;
      const dx = point.x - old.x;
      const dy = point.y - old.y;
      segment.to = point;
      segment.c2 = { x: segment.c2.x + dx, y: segment.c2.y + dy };
      if (drag.segmentIndex < measurement.segments.length - 1) {
        const next = measurement.segments[drag.segmentIndex + 1];
        next.from = point;
        next.c1 = { x: next.c1.x + dx, y: next.c1.y + dy };
      }
    }
    measurementModel.updateCurveAnchors(measurement);
    return true;
  }

  function canRemoveAnchorFromMeasurement(measurement) {
    if (!measurement) return false;
    const anchorCount = measurementModel.isCurveMeasurement(measurement)
      ? measurementModel.anchorsFromSegments(measurement.segments).length
      : (measurement.points || []).length;
    return anchorCount > 2;
  }

  function addAnchorToMeasurement(measurement, target) {
    if (!measurement || !target || target.kind !== 'path-hit') return false;
    if (measurementModel.isCurveMeasurement(measurement)) {
      const segment = measurement.segments[target.segmentIndex];
      if (!segment) return false;
      const [left, right] = geometry.splitCubicSegment(segment, target.localT);
      measurement.segments.splice(target.segmentIndex, 1, left, right);
      measurementModel.updateCurveAnchors(measurement);
      return true;
    }
    measurement.points.splice(target.segmentIndex + 1, 0, clonePoint(target.point));
    return true;
  }

  function curveAnchorIndexFromHandle(handle) {
    return handle.anchor === 'from' ? handle.segmentIndex : handle.segmentIndex + 1;
  }

  function removeCurveAnchor(measurement, anchorIndex) {
    if (!measurementModel.isCurveMeasurement(measurement) || !canRemoveAnchorFromMeasurement(measurement)) return false;
    if (anchorIndex <= 0) {
      measurement.segments.shift();
    } else if (anchorIndex >= measurement.segments.length) {
      measurement.segments.pop();
    } else {
      const previous = measurement.segments[anchorIndex - 1];
      const next = measurement.segments[anchorIndex];
      measurement.segments.splice(anchorIndex - 1, 2, {
        type: 'cubic',
        from: clonePoint(previous.from),
        c1: clonePoint(previous.c1),
        c2: clonePoint(next.c2),
        to: clonePoint(next.to),
      });
    }
    measurementModel.updateCurveAnchors(measurement);
    return true;
  }

  function removeAnchorFromMeasurement(measurement, target) {
    if (!measurement || !target || target.kind !== 'anchor-hit' || !canRemoveAnchorFromMeasurement(measurement)) return false;
    if (measurementModel.isCurveMeasurement(measurement)) {
      return removeCurveAnchor(measurement, curveAnchorIndexFromHandle(target));
    }
    measurement.points.splice(target.vertexIndex, 1);
    return true;
  }

  function continuationEndpointRole(measurement, target) {
    if (!measurement || !target || target.kind !== 'anchor-hit') return null;
    if (measurementModel.isCurveMeasurement(measurement)) {
      if (!Array.isArray(measurement.segments) || !measurement.segments.length) return null;
      const anchorIndex = curveAnchorIndexFromHandle(target);
      if (anchorIndex === 0) return 'start';
      if (anchorIndex === measurement.segments.length) return 'end';
      return null;
    }
    const points = measurement.points || [];
    if (points.length < 2 || !Number.isInteger(target.vertexIndex)) return null;
    if (target.vertexIndex === 0) return 'start';
    if (target.vertexIndex === points.length - 1) return 'end';
    return null;
  }

  function appendUniquePoint(points, point) {
    if (!point) return;
    if (!points.length || !samePoint(points[points.length - 1], point)) points.push(clonePoint(point));
  }

  function continueLineMeasurement(measurement, { endpoint, points, pxPerInch } = {}) {
    if (!measurement || !measurementModel.isLineMeasurement(measurement)) return false;
    if (endpoint !== 'start' && endpoint !== 'end') return false;
    const additions = clonePoints(points).slice(1);
    if (!additions.length) return false;
    const nextPoints = [];
    if (endpoint === 'start') {
      for (const point of additions.reverse()) appendUniquePoint(nextPoints, point);
      for (const point of measurement.points || []) appendUniquePoint(nextPoints, point);
    } else {
      for (const point of measurement.points || []) appendUniquePoint(nextPoints, point);
      for (const point of additions) appendUniquePoint(nextPoints, point);
    }
    if (nextPoints.length < 2) return false;
    measurement.points = nextPoints;
    measurement.segments = null;
    return finalizeMeasurementGeometry(measurement, { pxPerInch });
  }

  function continueFreehandMeasurement(measurement, { endpoint, segments, pxPerInch } = {}) {
    if (!measurement || !measurementModel.isCurveMeasurement(measurement)) return false;
    if (endpoint !== 'start' && endpoint !== 'end') return false;
    const nextSegments = cloneSegments(segments);
    if (!nextSegments || !nextSegments.length) return false;
    measurement.segments = endpoint === 'start'
      ? [...reverseSegments(nextSegments), ...cloneSegments(measurement.segments)]
      : [...cloneSegments(measurement.segments), ...nextSegments];
    measurementModel.updateCurveAnchors(measurement);
    return finalizeMeasurementGeometry(measurement, { pxPerInch });
  }

  function measurementLabelPoint(measurement) {
    const points = measurementModel.measurementDisplayPoints(measurement);
    const position = geometry.pointAtPolylineT(points, measurement.labelT);
    return position ? position.point : null;
  }

  function linePointsFromFreehand(measurement) {
    const points = clonePoints(measurement?.points);
    const anchors = clonePoints(measurementModel.anchorsFromSegments(measurement?.segments || []));
    const editablePointLimit = Math.max(12, anchors.length * 4);
    if (anchors.length >= 2 && (!points.length || points.length > editablePointLimit)) return anchors;
    return points.length >= 2 ? points : anchors;
  }

  function freehandGeometrySnapshot(measurement, fallbackPoints) {
    return {
      points: clonePoints(measurement?.points?.length ? measurement.points : fallbackPoints),
      segments: cloneSegments(measurement?.segments),
      labelT: measurement?.labelT,
      lengthPx: measurement?.lengthPx || measurementModel.measurementLengthPx(measurement),
      lengthInches: measurement?.lengthInches ?? null,
    };
  }

  function lineGeometrySnapshot(measurement) {
    return {
      points: clonePoints(measurement?.points),
      labelT: measurement?.labelT,
      lengthPx: measurement?.lengthPx || geometry.polylineLengthPx(measurement?.points || []),
      lengthInches: measurement?.lengthInches ?? null,
    };
  }

  function lineSegmentsFromPoints(points) {
    const source = points || [];
    const segments = [];
    for (let index = 1; index < source.length; index++) {
      const from = clonePoint(source[index - 1]);
      const to = clonePoint(source[index]);
      segments.push({
        type: 'cubic',
        from,
        c1: {
          x: from.x + (to.x - from.x) / 3,
          y: from.y + (to.y - from.y) / 3,
        },
        c2: {
          x: from.x + (to.x - from.x) * 2 / 3,
          y: from.y + (to.y - from.y) * 2 / 3,
        },
        to,
      });
    }
    return segments;
  }

  function convertFreehandMeasurementToLine(measurement, { pxPerInch } = {}) {
    if (!measurement || !measurementModel.isFreehandMeasurement(measurement)) return false;
    const linePoints = linePointsFromFreehand(measurement);
    if (linePoints.length < 2) return false;
    const preservedLabelPoint = measurementLabelPoint(measurement);
    const shape = cloneMeasurementShape(measurement);
    shape.active = 'line';
    shape.previousFreehand = freehandGeometrySnapshot(measurement, linePoints);
    measurement.drawType = 'line';
    measurement.shape = shape;
    measurement.points = linePoints;
    measurement.segments = null;
    return finalizeMeasurementGeometry(measurement, { pxPerInch, preservedLabelPoint });
  }

  function convertLineMeasurementToFreehand(measurement, { pxPerInch } = {}) {
    if (!measurement || !measurementModel.isLineMeasurement(measurement)) return false;
    const linePoints = clonePoints(measurement.points);
    if (linePoints.length < 2) return false;
    const preservedLabelPoint = measurementLabelPoint(measurement);
    const priorFreehand = measurement.shape?.previousFreehand || null;
    const restoredPoints = clonePoints(priorFreehand?.points);
    const sourcePoints = restoredPoints.length >= 2 ? restoredPoints : linePoints;
    const restoredSegments = cloneSegments(priorFreehand?.segments);
    const segments = restoredSegments?.length ? restoredSegments : lineSegmentsFromPoints(sourcePoints);
    if (!segments.length) return false;
    const shape = cloneMeasurementShape(measurement);
    shape.active = 'freehand';
    shape.previousLine = lineGeometrySnapshot(measurement);
    measurement.drawType = 'freehand';
    measurement.shape = shape;
    measurement.points = clonePoints(sourcePoints);
    measurement.segments = segments;
    return finalizeMeasurementGeometry(measurement, { pxPerInch, preservedLabelPoint });
  }

  function finalizeMeasurementGeometry(measurement, { pxPerInch, preservedLabelPoint } = {}) {
    if (!measurement) return false;
    if (measurementModel.isCurveMeasurement(measurement)) measurementModel.updateCurveAnchors(measurement);
    measurement.lengthPx = measurementModel.measurementLengthPx(measurement);
    measurement.lengthInches = pxPerInch ? measurement.lengthPx / pxPerInch : null;
    const displayPoints = measurementModel.measurementDisplayPoints(measurement);
    if (preservedLabelPoint) {
      const projection = geometry.projectPointToPolyline(preservedLabelPoint, displayPoints);
      measurement.labelT = projection ? projection.t : defaultLabelT(displayPoints);
    } else if (!Number.isFinite(measurement.labelT)) {
      measurement.labelT = defaultLabelT(displayPoints);
    }
    return true;
  }

  function shouldAskPasteMode(source, { currentPage, pxPerInch }) {
    if (!source || source.sourcePage === currentPage) return false;
    if (!pxPerInch || !source.sourceScale || source.sourceLengthInches == null) return false;
    return Math.abs(pxPerInch - source.sourceScale) > 0.0001;
  }

  function createPastedMeasurement({
    source,
    id,
    existingMeasurements,
    palette,
    pasteAt,
    currentPage,
    pxPerInch,
    mode,
    constrainGeometry,
  }) {
    if (!source || !pasteAt) return null;
    const bounds = measurementModel.measurementBounds(source);
    if (!bounds) return null;
    const dx = pasteAt.x - bounds.cx;
    const dy = pasteAt.y - bounds.cy;
    let points = (source.points || []).map(point => ({ x: point.x + dx, y: point.y + dy }));
    let segments = measurementModel.isCurveMeasurement(source) ? geometry.translateSegments(source.segments, dx, dy) : null;
    let shape = translateShapeGeometry(cloneMeasurementShape(source), dx, dy);

    if (mode === 'real-length' && source.sourceLengthInches != null && pxPerInch) {
      const visualLength = segments ? measurementModel.measurementLengthPx({ segments }) : geometry.polylineLengthPx(points);
      const targetLengthPx = source.sourceLengthInches * pxPerInch;
      if (visualLength > 0 && targetLengthPx > 0) {
        const scale = targetLengthPx / visualLength;
        points = geometry.scalePointsAround(points, pasteAt, scale);
        if (segments) segments = geometry.scaleSegmentsAround(segments, pasteAt, scale);
        shape = scaleShapeGeometryAround(shape, pasteAt, scale);
      }
    }

    if (constrainGeometry) {
      const beforeConstrain = points;
      const constrained = constrainGeometry(points, segments);
      points = constrained.points;
      segments = constrained.segments;
      if (beforeConstrain?.length && points?.length) {
        shape = translateShapeGeometry(shape, points[0].x - beforeConstrain[0].x, points[0].y - beforeConstrain[0].y);
      }
    }

    const pasted = {
      ...source,
      id,
      name: `${String(source.name || '').trim() || 'Run'} copy`,
      color: nextMeasurementColor(existingMeasurements, palette),
      page: currentPage,
      points,
      segments,
      shape,
      labelT: Number.isFinite(source.labelT)
        ? source.labelT
        : defaultLabelT(segments ? geometry.flattenSegments(segments, 18) : points),
    };
    if (segments) measurementModel.updateCurveAnchors(pasted);
    pasted.lengthPx = measurementModel.measurementLengthPx(pasted);
    pasted.lengthInches = pxPerInch ? pasted.lengthPx / pxPerInch : null;
    return pasted;
  }

  window.TakeoffMeasurementCommands = {
    nextMeasurementColor,
    fallbackMeasurementName,
    cleanMeasurementName,
    defaultLabelT,
    createLineMeasurement,
    createFreehandMeasurement,
    cloneMeasurementForClipboard,
    deleteMeasurementById,
    applyVertexDrag,
    canRemoveAnchorFromMeasurement,
    addAnchorToMeasurement,
    removeAnchorFromMeasurement,
    continuationEndpointRole,
    continueLineMeasurement,
    continueFreehandMeasurement,
    measurementLabelPoint,
    convertFreehandMeasurementToLine,
    convertLineMeasurementToFreehand,
    finalizeMeasurementGeometry,
    shouldAskPasteMode,
    createPastedMeasurement,
  };
})();
