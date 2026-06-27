(function () {
  const geometry = window.TakeoffGeometry;
  const LINE_SHAPE = 'line';
  const FREEHAND_SHAPE = 'freehand';
  const PATH_SHAPE = 'path';
  const CIRCLE_SHAPE = 'circle';
  const ARC_SHAPE = 'arc';
  const GEOMETRY_EPSILON = 0.0001;
  const AREA_FLATTEN_TOLERANCE_PX = 0.1;

  function cloneValue(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function hasCurveGeometry(measurement) {
    return !!(measurement && Array.isArray(measurement.segments) && measurement.segments.length);
  }

  function finitePoint(point) {
    return !!(point && Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  function hasCircleGeometry(measurement) {
    const circle = measurement?.circle;
    return !!(finitePoint(circle?.center) && Number.isFinite(circle.radius) && circle.radius > 0);
  }

  function hasArcGeometry(measurement) {
    const arc = measurement?.arc;
    return !!(
      finitePoint(arc?.center)
      && Number.isFinite(arc.radius)
      && arc.radius > 0
      && Number.isFinite(arc.startAngle)
      && Number.isFinite(arc.sweep)
      && Math.abs(arc.sweep) > 0
    );
  }

  function normalizeShapeKind(kind) {
    if (kind === LINE_SHAPE || kind === FREEHAND_SHAPE || kind === PATH_SHAPE || kind === CIRCLE_SHAPE || kind === ARC_SHAPE) return kind;
    return null;
  }

  function measurementShapeKind(measurement) {
    if (!measurement) return LINE_SHAPE;
    const explicitShape = measurement.shape
      ? normalizeShapeKind(measurement.shape.active) || normalizeShapeKind(measurement.shape.kind)
      : null;
    return explicitShape
      || normalizeShapeKind(measurement.drawType)
      || (hasCircleGeometry(measurement) ? CIRCLE_SHAPE : null)
      || (hasArcGeometry(measurement) ? ARC_SHAPE : null)
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

  function isCircleMeasurement(measurement) {
    return measurementShapeKind(measurement) === CIRCLE_SHAPE && hasCircleGeometry(measurement);
  }

  function isArcMeasurement(measurement) {
    return measurementShapeKind(measurement) === ARC_SHAPE && hasArcGeometry(measurement);
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
    if (!last || geometry.distancePx(last, point) > GEOMETRY_EPSILON) points.push(point);
  }

  function mixedSourceDisplayPoints(source) {
    const current = sourceCurrentGeometry(source);
    if (source?.kind === FREEHAND_SHAPE && Array.isArray(current?.segments) && current.segments.length) {
      return geometry.flattenSegments(current.segments, 18);
    }
    return Array.isArray(current?.points) ? current.points : [];
  }

  function flattenSegmentsForArea(segments) {
    return geometry.flattenSegmentsAdaptive
      ? geometry.flattenSegmentsAdaptive(segments, AREA_FLATTEN_TOLERANCE_PX, 14)
      : geometry.flattenSegments(segments, 96);
  }

  function mixedSourceAreaPoints(source) {
    const current = sourceCurrentGeometry(source);
    if (source?.kind === FREEHAND_SHAPE && Array.isArray(current?.segments) && current.segments.length) {
      return flattenSegmentsForArea(current.segments);
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
    if (isCircleMeasurement(measurement)) return geometry.circleCircumferencePx(measurement.circle);
    if (isArcMeasurement(measurement)) return geometry.arcLengthPx(measurement.arc);
    if (isCurveMeasurement(measurement)) {
      return measurement.segments.reduce((sum, segment) => sum + geometry.cubicLengthPx(segment), 0);
    }
    return geometry.polylineLengthPx(measurement.points || []);
  }

  function measurementDisplayPoints(measurement) {
    if (isMixedMeasurement(measurement)) return mixedMeasurementDisplayPoints(measurement);
    if (isCircleMeasurement(measurement)) return geometry.sampleCirclePoints(measurement.circle);
    if (isArcMeasurement(measurement)) return geometry.sampleArcPoints(measurement.arc);
    return isCurveMeasurement(measurement)
      ? geometry.flattenSegments(measurement.segments, 18)
      : (measurement.points || []);
  }

  function measurementAreaDisplayPoints(measurement) {
    if (isMixedMeasurement(measurement)) {
      const points = [];
      for (const source of mixedSources(measurement)) {
        for (const point of mixedSourceAreaPoints(source)) appendUniquePoint(points, point);
      }
      return points;
    }
    if (isCircleMeasurement(measurement)) return geometry.sampleCirclePoints(measurement.circle, 96);
    if (isArcMeasurement(measurement)) return geometry.sampleArcPoints(measurement.arc, 96);
    return isCurveMeasurement(measurement)
      ? flattenSegmentsForArea(measurement.segments)
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
    const points = (measurementAreaDisplayPoints(measurement) || []).filter(point => (
      point && Number.isFinite(point.x) && Number.isFinite(point.y)
    ));
    if (points.length < 3) return [];
    const first = points[0];
    const last = points[points.length - 1];
    const closed = geometry.distancePx(first, last) <= GEOMETRY_EPSILON
      ? points
      : [...points, first];
    return polygonSelfIntersects(closed) ? [] : closed;
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

  function signedTriangleArea(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function pointOnSegment(point, a, b) {
    return point.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON
      && point.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON
      && point.y >= Math.min(a.y, b.y) - GEOMETRY_EPSILON
      && point.y <= Math.max(a.y, b.y) + GEOMETRY_EPSILON
      && Math.abs(signedTriangleArea(a, b, point)) <= GEOMETRY_EPSILON;
  }

  function lineSegmentsIntersect(a, b, c, d) {
    if (
      Math.max(a.x, b.x) < Math.min(c.x, d.x) - GEOMETRY_EPSILON
      || Math.max(c.x, d.x) < Math.min(a.x, b.x) - GEOMETRY_EPSILON
      || Math.max(a.y, b.y) < Math.min(c.y, d.y) - GEOMETRY_EPSILON
      || Math.max(c.y, d.y) < Math.min(a.y, b.y) - GEOMETRY_EPSILON
    ) {
      return false;
    }
    const abC = signedTriangleArea(a, b, c);
    const abD = signedTriangleArea(a, b, d);
    const cdA = signedTriangleArea(c, d, a);
    const cdB = signedTriangleArea(c, d, b);
    if (Math.abs(abC) <= GEOMETRY_EPSILON && pointOnSegment(c, a, b)) return true;
    if (Math.abs(abD) <= GEOMETRY_EPSILON && pointOnSegment(d, a, b)) return true;
    if (Math.abs(cdA) <= GEOMETRY_EPSILON && pointOnSegment(a, c, d)) return true;
    if (Math.abs(cdB) <= GEOMETRY_EPSILON && pointOnSegment(b, c, d)) return true;
    return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
      && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
  }

  function polygonSelfIntersects(points) {
    const lastEdgeIndex = points.length - 2;
    for (let i = 0; i <= lastEdgeIndex; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (geometry.distancePx(a, b) <= GEOMETRY_EPSILON) continue;
      for (let j = i + 1; j <= lastEdgeIndex; j++) {
        if (Math.abs(i - j) <= 1) continue;
        if (i === 0 && j === lastEdgeIndex) continue;
        const c = points[j];
        const d = points[j + 1];
        if (geometry.distancePx(c, d) <= GEOMETRY_EPSILON) continue;
        if (lineSegmentsIntersect(a, b, c, d)) return true;
      }
    }
    return false;
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
    if (isCircleMeasurement(measurement)) {
      const { center, radius } = measurement.circle;
      return {
        x: center.x - radius,
        y: center.y - radius,
        width: radius * 2,
        height: radius * 2,
        cx: center.x,
        cy: center.y,
      };
    }
    return geometry.pointsBounds(measurementDisplayPoints(measurement));
  }

  function circleMeasurementMetrics(measurement) {
    if (!isCircleMeasurement(measurement)) return null;
    const radiusPx = measurement.circle.radius;
    return {
      radiusPx,
      diameterPx: radiusPx * 2,
      circumferencePx: geometry.circleCircumferencePx(measurement.circle),
    };
  }

  function arcMeasurementMetrics(measurement) {
    if (!isArcMeasurement(measurement)) return null;
    return {
      radiusPx: measurement.arc.radius,
      lengthPx: geometry.arcLengthPx(measurement.arc),
      angleRadians: geometry.arcAngleRadians(measurement.arc),
      angleDegrees: geometry.arcAngleDegrees(measurement.arc),
    };
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

  function projectPointToCircleMeasurement(point, measurement) {
    return isCircleMeasurement(measurement) ? geometry.projectPointToCircle(point, measurement.circle) : null;
  }

  function projectPointToArcMeasurement(point, measurement) {
    return isArcMeasurement(measurement) ? geometry.projectPointToArc(point, measurement.arc) : null;
  }

  window.TakeoffMeasurements = {
    LINE_SHAPE,
    FREEHAND_SHAPE,
    PATH_SHAPE,
    CIRCLE_SHAPE,
    ARC_SHAPE,
    hasCurveGeometry,
    hasCircleGeometry,
    hasArcGeometry,
    isCurveMeasurement,
    measurementShapeKind,
    isLineMeasurement,
    isFreehandMeasurement,
    isCircleMeasurement,
    isArcMeasurement,
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
    circleMeasurementMetrics,
    arcMeasurementMetrics,
    projectPointToLineMeasurement,
    projectPointToCurveMeasurement,
    projectPointToCircleMeasurement,
    projectPointToArcMeasurement,
  };
})();
