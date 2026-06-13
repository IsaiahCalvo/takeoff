(function () {
  const geometry = window.TakeoffGeometry;
  const LINE_SHAPE = 'line';
  const FREEHAND_SHAPE = 'freehand';
  const PATH_SHAPE = 'path';

  function cloneValue(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function hasCurveGeometry(measurement) {
    return !!(measurement && Array.isArray(measurement.segments) && measurement.segments.length);
  }

  function normalizeShapeKind(kind) {
    if (kind === LINE_SHAPE || kind === FREEHAND_SHAPE || kind === PATH_SHAPE) return kind;
    return null;
  }

  function measurementShapeKind(measurement) {
    if (!measurement) return LINE_SHAPE;
    const explicitShape = measurement.shape
      ? normalizeShapeKind(measurement.shape.active) || normalizeShapeKind(measurement.shape.kind)
      : null;
    return explicitShape
      || normalizeShapeKind(measurement.drawType)
      || (hasCurveGeometry(measurement) ? FREEHAND_SHAPE : LINE_SHAPE);
  }

  function isCurveMeasurement(measurement) {
    return measurementShapeKind(measurement) === FREEHAND_SHAPE && hasCurveGeometry(measurement);
  }

  function isLineMeasurement(measurement) {
    return measurementShapeKind(measurement) === LINE_SHAPE;
  }

  function isFreehandMeasurement(measurement) {
    return measurementShapeKind(measurement) === FREEHAND_SHAPE;
  }

  function mixedSources(measurement) {
    const sources = measurement?.mergeMemory?.sources;
    return Array.isArray(sources) ? sources : [];
  }

  function isMixedMeasurement(measurement) {
    return measurementShapeKind(measurement) === PATH_SHAPE && mixedSources(measurement).length > 0;
  }

  function sourceCurrentGeometry(source) {
    return source?.current && typeof source.current === 'object' ? source.current : source;
  }

  function appendUniquePoint(points, point) {
    if (!point) return;
    const last = points[points.length - 1];
    if (!last || geometry.distancePx(last, point) > 0.0001) points.push(point);
  }

  function mixedSourceDisplayPoints(source) {
    const current = sourceCurrentGeometry(source);
    if (source?.kind === FREEHAND_SHAPE && Array.isArray(current?.segments) && current.segments.length) {
      return geometry.flattenSegments(current.segments, 18);
    }
    return Array.isArray(current?.points) ? current.points : [];
  }

  function mixedMeasurementDisplayPoints(measurement) {
    const points = [];
    for (const source of mixedSources(measurement)) {
      for (const point of mixedSourceDisplayPoints(source)) appendUniquePoint(points, point);
    }
    return points;
  }

  function mixedEndpointPoints(measurement) {
    const points = mixedMeasurementDisplayPoints(measurement);
    if (!points.length) return [];
    return points.length === 1
      ? [{ ...points[0] }]
      : [{ ...points[0] }, { ...points[points.length - 1] }];
  }

  function updateMixedAnchors(measurement) {
    if (isMixedMeasurement(measurement)) measurement.points = mixedEndpointPoints(measurement);
  }

  function mixedSourceLengthPx(source) {
    const current = sourceCurrentGeometry(source);
    if (source?.kind === FREEHAND_SHAPE && Array.isArray(current?.segments) && current.segments.length) {
      return current.segments.reduce((sum, segment) => sum + geometry.cubicLengthPx(segment), 0);
    }
    return geometry.polylineLengthPx(current?.points || []);
  }

  function createShapeMetadata(active = LINE_SHAPE, metadata = {}) {
    const cloned = cloneValue(metadata) || {};
    delete cloned.kind;
    return {
      ...cloned,
      active: normalizeShapeKind(active) || normalizeShapeKind(cloned.active) || LINE_SHAPE,
    };
  }

  function cloneShapeMetadata(metadata, fallbackActive = LINE_SHAPE) {
    const cloned = cloneValue(metadata) || {};
    const active = normalizeShapeKind(cloned.active)
      || normalizeShapeKind(cloned.kind)
      || normalizeShapeKind(fallbackActive)
      || LINE_SHAPE;
    delete cloned.kind;
    return {
      ...cloned,
      active,
    };
  }

  function transformGeometryMetadata(metadata, mapPoint) {
    if (!metadata || typeof mapPoint !== 'function') return metadata;
    const transformed = cloneValue(metadata) || {};
    if (Array.isArray(transformed.points)) transformed.points = transformed.points.map(mapPoint);
    if (Array.isArray(transformed.segments)) {
      transformed.segments = transformed.segments.map(segment => ({
        ...segment,
        from: mapPoint(segment.from),
        c1: mapPoint(segment.c1),
        c2: mapPoint(segment.c2),
        to: mapPoint(segment.to),
      }));
    }
    if (transformed.labelPoint) transformed.labelPoint = mapPoint(transformed.labelPoint);
    return transformed;
  }

  function transformShapeGeometry(metadata, mapPoint, fallbackActive = LINE_SHAPE) {
    const transformed = cloneShapeMetadata(metadata, fallbackActive);
    for (const key of ['previousLine', 'previousFreehand']) {
      if (transformed[key]) transformed[key] = transformGeometryMetadata(transformed[key], mapPoint);
    }
    return transformed;
  }

  function measurementLengthPx(measurement) {
    if (isMixedMeasurement(measurement)) {
      return mixedSources(measurement).reduce((sum, source) => sum + mixedSourceLengthPx(source), 0);
    }
    if (isCurveMeasurement(measurement)) {
      return measurement.segments.reduce((sum, segment) => sum + geometry.cubicLengthPx(segment), 0);
    }
    return geometry.polylineLengthPx(measurement.points || []);
  }

  function measurementDisplayPoints(measurement) {
    if (isMixedMeasurement(measurement)) return mixedMeasurementDisplayPoints(measurement);
    return isCurveMeasurement(measurement)
      ? geometry.flattenSegments(measurement.segments, 18)
      : (measurement.points || []);
  }

  function isSelfClosingSnap(measurement) {
    if (!measurement?.snapConnections?.length || measurement.id == null) return false;
    const id = String(measurement.id);
    return measurement.snapConnections.some(connection => (
      connection
      && String(connection.targetId) === id
      && (
        (connection.endpoint === 'end' && connection.targetEndpoint === 'start')
        || (connection.endpoint === 'start' && connection.targetEndpoint === 'end')
      )
    ));
  }

  function closedMeasurementPoints(measurement) {
    if (!isSelfClosingSnap(measurement)) return [];
    const points = (measurementDisplayPoints(measurement) || []).filter(point => (
      point && Number.isFinite(point.x) && Number.isFinite(point.y)
    ));
    if (points.length < 3) return [];
    const first = points[0];
    const last = points[points.length - 1];
    return geometry.distancePx(first, last) <= 0.0001
      ? points
      : [...points, first];
  }

  function signedPolygonArea(points) {
    let sum = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      sum += a.x * b.y - b.x * a.y;
    }
    return sum / 2;
  }

  function measurementAreaPx(measurement) {
    const points = closedMeasurementPoints(measurement);
    if (points.length < 4) return null;
    const area = Math.abs(signedPolygonArea(points));
    return area > 0.0001 ? area : null;
  }

  function measurementAreaCenter(measurement) {
    const points = closedMeasurementPoints(measurement);
    if (points.length < 4) return null;
    const signedArea = signedPolygonArea(points);
    if (Math.abs(signedArea) <= 0.0001) {
      const bounds = geometry.pointsBounds(points);
      return bounds ? { x: bounds.cx, y: bounds.cy } : null;
    }
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const cross = a.x * b.y - b.x * a.y;
      cx += (a.x + b.x) * cross;
      cy += (a.y + b.y) * cross;
    }
    return {
      x: cx / (6 * signedArea),
      y: cy / (6 * signedArea),
    };
  }

  function isClosedMeasurement(measurement) {
    return measurementAreaPx(measurement) != null;
  }

  function buildFreehandSegments(rawPoints, error = 8) {
    const points = rawPoints.filter((point, index, list) => (
      index === 0 || geometry.distancePx(point, list[index - 1]) > 0.5
    ));
    if (points.length < 2) return [];
    return geometry.fitCurve(points, error).map(curve => ({
      type: 'cubic',
      from: curve[0],
      c1: curve[1],
      c2: curve[2],
      to: curve[3],
    }));
  }

  function anchorsFromSegments(segments) {
    if (!segments || !segments.length) return [];
    return [segments[0].from, ...segments.map(segment => segment.to)];
  }

  function updateCurveAnchors(measurement) {
    if (isCurveMeasurement(measurement)) {
      measurement.points = anchorsFromSegments(measurement.segments).map(point => ({ ...point }));
    }
  }

  function measurementBounds(measurement) {
    return geometry.pointsBounds(measurementDisplayPoints(measurement));
  }

  function projectPointToLineMeasurement(point, measurement) {
    const points = measurement.points || [];
    let best = null;
    for (let index = 1; index < points.length; index++) {
      const projected = geometry.projectPointToSegment(point, points[index - 1], points[index]);
      if (!best || projected.distance < best.distance) {
        best = {
          type: 'line',
          segmentIndex: index - 1,
          point: projected.point,
          localT: projected.t,
          distance: projected.distance,
        };
      }
    }
    return best;
  }

  function projectPointToCurveMeasurement(point, measurement) {
    let best = null;
    const steps = 60;
    for (let segmentIndex = 0; segmentIndex < measurement.segments.length; segmentIndex++) {
      const segment = measurement.segments[segmentIndex];
      let prev = geometry.cubicPoint(segment, 0);
      for (let step = 1; step <= steps; step++) {
        const t1 = step / steps;
        const curr = geometry.cubicPoint(segment, t1);
        const projected = geometry.projectPointToSegment(point, prev, curr);
        if (!best || projected.distance < best.distance) {
          const t0 = (step - 1) / steps;
          best = {
            type: 'curve',
            segmentIndex,
            point: projected.point,
            localT: t0 + (t1 - t0) * projected.t,
            distance: projected.distance,
          };
        }
        prev = curr;
      }
    }
    return best;
  }

  window.TakeoffMeasurements = {
    LINE_SHAPE,
    FREEHAND_SHAPE,
    PATH_SHAPE,
    hasCurveGeometry,
    isCurveMeasurement,
    measurementShapeKind,
    isLineMeasurement,
    isFreehandMeasurement,
    isMixedMeasurement,
    mixedSources,
    mixedSourceDisplayPoints,
    mixedMeasurementDisplayPoints,
    mixedEndpointPoints,
    updateMixedAnchors,
    createShapeMetadata,
    cloneShapeMetadata,
    transformGeometryMetadata,
    transformShapeGeometry,
    measurementLengthPx,
    measurementDisplayPoints,
    closedMeasurementPoints,
    isClosedMeasurement,
    measurementAreaPx,
    measurementAreaCenter,
    buildFreehandSegments,
    anchorsFromSegments,
    updateCurveAnchors,
    measurementBounds,
    projectPointToLineMeasurement,
    projectPointToCurveMeasurement,
  };
})();
