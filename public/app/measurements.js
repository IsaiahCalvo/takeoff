(function () {
  const geometry = window.TakeoffGeometry;

  function isCurveMeasurement(measurement) {
    return !!(measurement && Array.isArray(measurement.segments) && measurement.segments.length);
  }

  function measurementLengthPx(measurement) {
    if (isCurveMeasurement(measurement)) {
      return measurement.segments.reduce((sum, segment) => sum + geometry.cubicLengthPx(segment), 0);
    }
    return geometry.polylineLengthPx(measurement.points || []);
  }

  function measurementDisplayPoints(measurement) {
    return isCurveMeasurement(measurement)
      ? geometry.flattenSegments(measurement.segments, 18)
      : (measurement.points || []);
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
    isCurveMeasurement,
    measurementLengthPx,
    measurementDisplayPoints,
    buildFreehandSegments,
    anchorsFromSegments,
    updateCurveAnchors,
    measurementBounds,
    projectPointToLineMeasurement,
    projectPointToCurveMeasurement,
  };
})();
