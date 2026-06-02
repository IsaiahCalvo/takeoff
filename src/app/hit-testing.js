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

  function isVisibleMeasurement(measurement) {
    return !!measurement && measurement.hidden !== true && measurement.visible !== false;
  }

  function isExcludedMeasurement(measurement, excluded) {
    return excluded.has(measurement?.id) || excluded.has(String(measurement?.id));
  }

  function endpointRoleForHandle(measurement, handle) {
    if (!measurement || !handle) return null;
    if (measurements.isCurveMeasurement(measurement)) {
      if (handle.kind !== 'curve-anchor') return null;
      if (handle.segmentIndex === 0 && handle.anchor === 'from') return 'start';
      if (handle.segmentIndex === measurement.segments.length - 1 && handle.anchor === 'to') return 'end';
      return null;
    }
    const points = measurement.points || [];
    if (handle.kind !== 'line-anchor' || !Number.isInteger(handle.vertexIndex) || points.length < 2) return null;
    if (handle.vertexIndex === 0) return 'start';
    if (handle.vertexIndex === points.length - 1) return 'end';
    return null;
  }

  function snapAnchorHandles(measurement) {
    if (measurements.isCurveMeasurement(measurement)) {
      return curveEditHandles(measurement).filter(handle => handle.kind === 'curve-anchor');
    }
    return (measurement.points || []).map((point, vertexIndex) => ({
      kind: 'line-anchor',
      vertexIndex,
      point,
    }));
  }

  function snapTargetFromAnchor(measurement, handle, distance) {
    return {
      kind: 'anchor',
      measurementId: measurement.id,
      anchorKind: handle.kind,
      vertexIndex: handle.vertexIndex,
      segmentIndex: handle.segmentIndex,
      anchor: handle.anchor,
      point: handle.point,
      endpoint: endpointRoleForHandle(measurement, handle),
      distance,
    };
  }

  function betterSnapHit(candidate, best) {
    if (!candidate) return best;
    if (!best) return candidate;
    const priority = candidate.kind === 'anchor' ? 1 : 0;
    const bestPriority = best.kind === 'anchor' ? 1 : 0;
    if (priority !== bestPriority) return priority > bestPriority ? candidate : best;
    return candidate.distance < best.distance ? candidate : best;
  }

  function findNearestVertex(measurementList, point, tolerance, opts = {}) {
    let best = null;
    const epsilon = 1e-9;
    const consider = (measurement, handle, priority = 0) => {
      const distance = geometry.distancePx(point, handle.point);
      if (distance > tolerance) return;
      if (!best || distance < best.distance - epsilon || (Math.abs(distance - best.distance) <= epsilon && priority > best.priority)) {
        best = { distance, priority, hit: { measurementId: measurement.id, ...handle } };
      }
    };

    for (const measurement of measurementList || []) {
      if (measurements.isMixedMeasurement?.(measurement)) continue;
      if (measurements.isCurveMeasurement(measurement)) {
        for (const handle of curveEditHandles(measurement)) {
          if (handle.kind === 'curve-control' && !opts.includeCurveControls) continue;
          consider(measurement, handle, handle.kind === 'curve-control' ? 1 : 0);
        }
        continue;
      }
      for (let index = 0; index < measurement.points.length; index++) {
        const vertex = measurement.points[index];
        consider(measurement, { kind: 'line-anchor', vertexIndex: index, point: vertex });
      }
    }
    if (!best) return null;
    const { point: _point, ...hit } = best.hit;
    if (hit.kind === 'curve-anchor' || hit.kind === 'curve-control') return best.hit;
    return hit;
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
      const hit = projectPointToMeasurement(point, measurement);
      if (hit && hit.distance <= tolerance && (!best || hit.distance < best.distance)) {
        best = { measurementId: measurement.id, ...hit };
      }
    }
    return best;
  }

  function findSnapTarget(measurementList, point, opts = {}) {
    const anchorTolerance = Number.isFinite(opts.anchorTolerance) ? opts.anchorTolerance : 0;
    const centerlineTolerance = Number.isFinite(opts.centerlineTolerance) ? opts.centerlineTolerance : 0;
    const excluded = new Set(opts.excludeMeasurementIds || []);
    for (const id of opts.excludeMeasurementIds || []) excluded.add(String(id));
    let anchorHit = null;
    let centerlineHit = null;

    for (const measurement of measurementList || []) {
      if (!isVisibleMeasurement(measurement) || isExcludedMeasurement(measurement, excluded)) continue;
      for (const handle of snapAnchorHandles(measurement)) {
        const distance = geometry.distancePx(point, handle.point);
        if (distance <= anchorTolerance) {
          anchorHit = betterSnapHit(snapTargetFromAnchor(measurement, handle, distance), anchorHit);
        }
      }
    }
    if (anchorHit) return anchorHit;

    for (const measurement of measurementList || []) {
      if (!isVisibleMeasurement(measurement) || isExcludedMeasurement(measurement, excluded)) continue;
      const hit = projectPointToMeasurement(point, measurement);
      if (hit && hit.distance <= centerlineTolerance) {
        centerlineHit = betterSnapHit({ kind: 'centerline', measurementId: measurement.id, ...hit }, centerlineHit);
      }
    }
    return centerlineHit;
  }

  function projectPointToMixedMeasurement(point, measurement) {
    const points = measurements.measurementDisplayPoints(measurement);
    if (!points || points.length < 2) return null;
    let best = null;
    for (let index = 1; index < points.length; index++) {
      const projected = geometry.projectPointToSegment(point, points[index - 1], points[index]);
      if (!best || projected.distance < best.distance) {
        best = {
          type: 'mixed',
          segmentIndex: index - 1,
          point: projected.point,
          distance: projected.distance,
        };
      }
    }
    return best;
  }

  function projectPointToMeasurement(point, measurement) {
    if (measurements.isMixedMeasurement?.(measurement)) return projectPointToMixedMeasurement(point, measurement);
    return measurements.isCurveMeasurement(measurement)
      ? measurements.projectPointToCurveMeasurement(point, measurement)
      : measurements.projectPointToLineMeasurement(point, measurement);
  }

  function findTranslatedMeasurementSnap(measurement, measurementList, dx, dy, opts = {}) {
    if (!measurement) return null;
    let best = null;
    const excluded = [...(opts.excludeMeasurementIds || []), measurement.id];
    for (const handle of snapAnchorHandles(measurement)) {
      const translatedPoint = { x: handle.point.x + dx, y: handle.point.y + dy };
      const snap = findSnapTarget(measurementList, translatedPoint, {
        ...opts,
        excludeMeasurementIds: excluded,
      });
      if (!snap) continue;
      const candidate = {
        dx: dx + snap.point.x - translatedPoint.x,
        dy: dy + snap.point.y - translatedPoint.y,
        snap: {
          ...snap,
          source: {
            kind: handle.kind,
            vertexIndex: handle.vertexIndex,
            segmentIndex: handle.segmentIndex,
            anchor: handle.anchor,
            endpoint: endpointRoleForHandle(measurement, handle),
            point: handle.point,
            translatedPoint,
          },
        },
      };
      best = betterSnapHit(candidate.snap, best?.snap) === candidate.snap ? candidate : best;
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
    findSnapTarget,
    findTranslatedMeasurementSnap,
    findNearestMeasurement,
    findLabelHit,
    isPointInBox,
  };
})();
