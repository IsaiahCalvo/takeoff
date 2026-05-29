(function () {
  const geometry = window.TakeoffGeometry;
  const measurements = window.TakeoffMeasurements;

  function curveEditHandles(measurement) {
    const handles = [];
    if (!measurements.isCurveMeasurement(measurement)) return handles;
    for (let index = 0; index < measurement.segments.length; index++) {
      const segment = measurement.segments[index];
      if (index === 0) handles.push({ kind: 'curve-anchor', segmentIndex: index, anchor: 'from', point: segment.from });
      handles.push({ kind: 'curve-control', segmentIndex: index, control: 'c1', point: segment.c1 });
      handles.push({ kind: 'curve-control', segmentIndex: index, control: 'c2', point: segment.c2 });
      handles.push({ kind: 'curve-anchor', segmentIndex: index, anchor: 'to', point: segment.to });
    }
    return handles;
  }

  function findNearestVertex(measurementList, point, tolerance, opts = {}) {
    for (const measurement of measurementList || []) {
      if (measurements.isCurveMeasurement(measurement)) {
        for (const handle of curveEditHandles(measurement)) {
          if (handle.kind === 'curve-control' && !opts.includeCurveControls) continue;
          if (geometry.distancePx(point, handle.point) <= tolerance) return { measurementId: measurement.id, ...handle };
        }
        continue;
      }
      for (let index = 0; index < measurement.points.length; index++) {
        const vertex = measurement.points[index];
        if (geometry.distancePx(point, vertex) <= tolerance) {
          return { measurementId: measurement.id, kind: 'line-anchor', vertexIndex: index };
        }
      }
    }
    return null;
  }

  function findNearestAnchor(measurementList, point, tolerance) {
    for (const measurement of measurementList || []) {
      if (measurements.isCurveMeasurement(measurement)) {
        const handles = curveEditHandles(measurement).filter(handle => handle.kind === 'curve-anchor');
        for (const handle of handles) {
          if (geometry.distancePx(point, handle.point) <= tolerance) return { measurementId: measurement.id, ...handle };
        }
        continue;
      }
      for (let index = 0; index < measurement.points.length; index++) {
        if (geometry.distancePx(point, measurement.points[index]) <= tolerance) {
          return { measurementId: measurement.id, kind: 'line-anchor', vertexIndex: index, point: measurement.points[index] };
        }
      }
    }
    return null;
  }

  function findNearestPathPoint(measurementList, point, tolerance) {
    let best = null;
    for (const measurement of measurementList || []) {
      const hit = measurements.isCurveMeasurement(measurement)
        ? measurements.projectPointToCurveMeasurement(point, measurement)
        : measurements.projectPointToLineMeasurement(point, measurement);
      if (hit && hit.distance <= tolerance && (!best || hit.distance < best.distance)) {
        best = { measurementId: measurement.id, ...hit };
      }
    }
    return best;
  }

  function findNearestMeasurement(measurementList, point, tolerance) {
    for (const measurement of measurementList || []) {
      const points = measurements.measurementDisplayPoints(measurement);
      for (let index = 1; index < points.length; index++) {
        const distance = geometry.pointToSegmentDist(point, points[index - 1], points[index]);
        if (distance <= tolerance) return measurement.id;
      }
    }
    return null;
  }

  function findLabelHit(labelHitboxes, point, pad) {
    for (let index = (labelHitboxes || []).length - 1; index >= 0; index--) {
      const hit = labelHitboxes[index];
      if (
        point.x >= hit.x - pad &&
        point.x <= hit.x + hit.width + pad &&
        point.y >= hit.y - pad &&
        point.y <= hit.y + hit.height + pad
      ) {
        return hit;
      }
    }
    return null;
  }

  function isPointInBox(point, box) {
    return !!(point && box && point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);
  }

  window.TakeoffHitTesting = {
    curveEditHandles,
    findNearestVertex,
    findNearestAnchor,
    findNearestPathPoint,
    findNearestMeasurement,
    findLabelHit,
    isPointInBox,
  };
})();
