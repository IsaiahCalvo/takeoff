(function () {
  const geometry = window.TakeoffGeometry;
  const measurementModel = window.TakeoffMeasurements;
  const runDetailsModel = window.TakeoffRunDetails;

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

  function reversePoints(points) {
    return clonePoints(points).reverse();
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

  function clonePathStyle(style) {
    if (!style || typeof style !== 'object') return style;
    return JSON.parse(JSON.stringify(style));
  }

  function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeRunDetails(details) {
    if (!runDetailsModel?.normalizeRunDetails) throw new Error('TakeoffRunDetails helper is required.');
    return runDetailsModel.normalizeRunDetails(details);
  }

  function hasMeasurementRunDetails(measurement) {
    return !!(
      measurement
      && typeof measurement === 'object'
      && Object.prototype.hasOwnProperty.call(measurement, 'runDetails')
    );
  }

  function cloneMeasurementWithNormalizedRunDetails(measurement) {
    const cloned = cloneValue(measurement) || {};
    if (hasMeasurementRunDetails(cloned)) cloned.runDetails = normalizeRunDetails(cloned.runDetails);
    return cloned;
  }

  function cleanOptionalString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function sourceObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function pathCategorySnapshot(source) {
    const pathCategory = sourceObject(source?.pathCategory);
    const category = sourceObject(source?.category);
    const id = cleanOptionalString(source?.pathCategoryId)
      || cleanOptionalString(source?.categoryId)
      || cleanOptionalString(pathCategory.id)
      || cleanOptionalString(category.id);
    const name = cleanOptionalString(source?.pathCategoryName)
      || cleanOptionalString(source?.categoryName)
      || (typeof source?.pathCategory === 'string' ? cleanOptionalString(source.pathCategory) : '')
      || (typeof source?.category === 'string' ? cleanOptionalString(source.category) : '')
      || cleanOptionalString(pathCategory.name)
      || cleanOptionalString(category.name);
    return { id, name };
  }

  function selectedPathSnapshot(activePath) {
    if (!activePath || typeof activePath !== 'object') return null;
    const pathTemplateId = activePath.templateId || activePath.pathTemplateId || null;
    const pathId = activePath.id || activePath.pathId || null;
    if (!pathTemplateId && !pathId) return null;
    const styleSource = activePath.pathStyle || {
      stroke: activePath.stroke,
      anchors: activePath.anchors,
    };
    const pathStyle = clonePathStyle(styleSource);
    return {
      pathTemplateId,
      pathId,
      pathName: activePath.name || activePath.pathName || 'Path',
      pathStyle,
      ...(() => {
        const category = pathCategorySnapshot(activePath);
        if (!category.id && !category.name) return {};
        return {
          ...(category.id ? { pathCategoryId: category.id } : {}),
          ...(category.name ? { pathCategoryName: category.name } : {}),
        };
      })(),
    };
  }

  function colorFromPathSnapshot(snapshot, fallback) {
    return snapshot?.pathStyle?.stroke?.color || fallback;
  }

  function translateShapeGeometry(shape, dx, dy) {
    return measurementModel.transformShapeGeometry(shape, point => ({ x: point.x + dx, y: point.y + dy }));
  }

  function translateCircleGeometry(circle, dx, dy) {
    return circle ? {
      ...circle,
      center: { x: circle.center.x + dx, y: circle.center.y + dy },
    } : null;
  }

  function translateArcGeometry(arc, dx, dy) {
    return arc ? {
      ...arc,
      center: { x: arc.center.x + dx, y: arc.center.y + dy },
    } : null;
  }

  function scaleCircleGeometryAround(circle, center, scale) {
    return circle ? {
      ...circle,
      center: {
        x: center.x + (circle.center.x - center.x) * scale,
        y: center.y + (circle.center.y - center.y) * scale,
      },
      radius: circle.radius * scale,
    } : null;
  }

  function scaleArcGeometryAround(arc, center, scale) {
    return arc ? {
      ...arc,
      center: {
        x: center.x + (arc.center.x - center.x) * scale,
        y: center.y + (arc.center.y - center.y) * scale,
      },
      radius: arc.radius * scale,
    } : null;
  }

  function transformSegmentGeometry(segment, mapPoint) {
    return {
      ...segment,
      from: mapPoint(segment.from),
      c1: mapPoint(segment.c1),
      c2: mapPoint(segment.c2),
      to: mapPoint(segment.to),
    };
  }

  function transformCurrentGeometry(current, mapPoint) {
    if (!current || typeof current !== 'object') return current;
    return {
      ...current,
      points: Array.isArray(current.points) ? current.points.map(mapPoint) : current.points,
      segments: Array.isArray(current.segments) ? current.segments.map(segment => transformSegmentGeometry(segment, mapPoint)) : current.segments,
      circle: current.circle ? { ...current.circle, center: mapPoint(current.circle.center) } : current.circle,
      arc: current.arc ? { ...current.arc, center: mapPoint(current.arc.center) } : current.arc,
    };
  }

  function transformMergeMemoryGeometry(memory, mapPoint) {
    if (!memory || typeof memory !== 'object' || typeof mapPoint !== 'function') return cloneValue(memory);
    const cloned = cloneValue(memory);
    if (Array.isArray(cloned.sources)) {
      cloned.sources = cloned.sources.map(source => ({
        ...source,
        current: transformCurrentGeometry(source.current, mapPoint),
        boundary: source.boundary ? transformCurrentGeometry(source.boundary, mapPoint) : source.boundary,
      }));
    }
    return cloned;
  }

  function translateMergeMemoryGeometry(memory, dx, dy) {
    return transformMergeMemoryGeometry(memory, point => ({ x: point.x + dx, y: point.y + dy }));
  }

  function scaleShapeGeometryAround(shape, center, scale) {
    return measurementModel.transformShapeGeometry(shape, point => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale,
    }));
  }

  function scaleMergeMemoryGeometryAround(memory, center, scale) {
    return transformMergeMemoryGeometry(memory, point => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale,
    }));
  }

  function refreshMergeMemoryBoundaries(memory) {
    if (!memory || !Array.isArray(memory.sources)) return memory;
    return {
      ...memory,
      sources: memory.sources.map(source => ({
        ...source,
        boundary: sourceBoundary(source.current),
      })),
    };
  }

  function measurementStartAnchor(measurement) {
    if (!measurement) return null;
    if (measurementModel.isCurveMeasurement(measurement)) {
      return measurement.segments?.[0]?.from || null;
    }
    return measurement.points?.[0] || null;
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

  function numericPanelOrder(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function measurementPanelOrder(measurement, fallback = null) {
    const panelOrder = numericPanelOrder(measurement?.panelOrder);
    if (panelOrder != null) return panelOrder;
    return numericPanelOrder(fallback);
  }

  function saveMeasurementRunDetails(measurements, measurementId, details) {
    const list = measurements || [];
    const index = list.findIndex(measurement => measurement && measurement.id === measurementId);
    if (index < 0) return { updated: false, measurements: list, measurement: null };
    const updated = {
      ...list[index],
      runDetails: normalizeRunDetails(details),
    };
    const nextMeasurements = list.slice();
    nextMeasurements[index] = updated;
    return { updated: true, measurements: nextMeasurements, measurement: updated };
  }

  function defaultLabelT(points) {
    if (!points || points.length < 2) return 0.5;
    const total = geometry.polylineLengthPx(points);
    if (!total) return 0;
    const anchorClearancePx = 28;
    if (total <= anchorClearancePx * 2) return 0.5;
    return (total - anchorClearancePx) / total;
  }

  function cloneCircle(circle) {
    const normalized = geometry.circleFromCenterRadius(circle?.center, circle?.radius);
    return normalized ? {
      center: clonePoint(normalized.center),
      radius: normalized.radius,
    } : null;
  }

  function finitePoint(point) {
    return !!(point && Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  function normalizeCircleDimension(value) {
    return value === 'diameter' ? 'diameter' : 'radius';
  }

  function circleDimensionForMeasurement(measurementOrShape) {
    const shape = measurementOrShape?.shape || measurementOrShape;
    return normalizeCircleDimension(shape?.circleDimension);
  }

  function circleHandleAngleForPoint(circle, point) {
    if (!finitePoint(circle?.center) || !finitePoint(point)) return 0;
    return geometry.angleRadFromCenter(circle.center, point);
  }

  function circleHandleAngleForMeasurement(measurementOrShape) {
    const shape = measurementOrShape?.shape || measurementOrShape;
    const angle = Number(shape?.circleHandleAngle);
    return Number.isFinite(angle) ? angle : 0;
  }

  function setCircleHandleAngle(measurement, point) {
    if (!measurement?.circle || !point) return;
    measurement.shape = measurementModel.cloneShapeMetadata?.(measurement.shape, 'circle') || measurementModel.createShapeMetadata('circle', measurement.shape);
    measurement.shape.active = 'circle';
    measurement.shape.circleDimension = circleDimensionForMeasurement(measurement);
    measurement.shape.circleHandleAngle = circleHandleAngleForPoint(measurement.circle, point);
  }

  function cloneArc(arc) {
    if (!arc || !Number.isFinite(arc.radius) || arc.radius <= 0 || !Number.isFinite(arc.startAngle) || !Number.isFinite(arc.sweep)) return null;
    const cloned = {
      center: clonePoint(arc.center),
      radius: arc.radius,
      startAngle: arc.startAngle,
      sweep: arc.sweep,
    };
    return geometry.arcPointAtT(cloned, 0) && geometry.arcPointAtT(cloned, 1) ? cloned : null;
  }

  function circleAnchorPoints(circle, measurementOrShape = null) {
    const dimension = circleDimensionForMeasurement(measurementOrShape);
    const angle = circleHandleAngleForMeasurement(measurementOrShape);
    const handleLength = circle.radius * (dimension === 'diameter' ? 2 : 1);
    return [
      clonePoint(circle.center),
      {
        x: circle.center.x + Math.cos(angle) * handleLength,
        y: circle.center.y + Math.sin(angle) * handleLength,
      },
    ];
  }

  function arcAnchorPoints(arc) {
    const start = geometry.arcPointAtT(arc, 0);
    const end = geometry.arcPointAtT(arc, 1);
    const midpoint = geometry.arcPointAtT(arc, 0.5);
    return [
      start,
      end,
      arc?.center ? clonePoint(arc.center) : null,
      midpoint,
    ].filter(Boolean);
  }

  function createLineMeasurement({ id, points, existingMeasurements, palette, page, pxPerInch, activePath, name, panelOrder }) {
    const clonedPoints = clonePoints(points);
    const lengthPx = geometry.polylineLengthPx(clonedPoints);
    const pathSnapshot = selectedPathSnapshot(activePath);
    const color = colorFromPathSnapshot(pathSnapshot, nextMeasurementColor(existingMeasurements, palette));
    const assignedPanelOrder = numericPanelOrder(panelOrder);
    return {
      id,
      name: cleanMeasurementName(existingMeasurements, name, { id }),
      color,
      ...(pathSnapshot || {}),
      ...(assignedPanelOrder != null ? { panelOrder: assignedPanelOrder } : {}),
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
    activePath,
    name,
    panelOrder,
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
    const pathSnapshot = selectedPathSnapshot(activePath);
    const color = colorFromPathSnapshot(pathSnapshot, nextMeasurementColor(existingMeasurements, palette));
    const assignedPanelOrder = numericPanelOrder(panelOrder);
    return {
      id,
      name: cleanMeasurementName(existingMeasurements, name, { id }),
      color,
      ...(pathSnapshot || {}),
      ...(assignedPanelOrder != null ? { panelOrder: assignedPanelOrder } : {}),
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

  function createCircleMeasurement({
    id,
    circle,
    circleDimension,
    handlePoint,
    existingMeasurements,
    palette,
    page,
    pxPerInch,
    activePath,
    name,
    panelOrder,
  }) {
    const clonedCircle = cloneCircle(circle);
    if (!clonedCircle) return null;
    const shape = measurementModel.createShapeMetadata('circle', {
      circleDimension: normalizeCircleDimension(circleDimension),
      circleHandleAngle: circleHandleAngleForPoint(clonedCircle, handlePoint),
    });
    const points = circleAnchorPoints(clonedCircle, shape);
    const lengthPx = geometry.circleCircumferencePx(clonedCircle);
    const pathSnapshot = selectedPathSnapshot(activePath);
    const color = colorFromPathSnapshot(pathSnapshot, nextMeasurementColor(existingMeasurements, palette));
    const assignedPanelOrder = numericPanelOrder(panelOrder);
    return {
      id,
      name: cleanMeasurementName(existingMeasurements, name, { id }),
      color,
      ...(pathSnapshot || {}),
      ...(assignedPanelOrder != null ? { panelOrder: assignedPanelOrder } : {}),
      drawType: 'circle',
      shape,
      points,
      circle: clonedCircle,
      lengthInches: pxPerInch ? lengthPx / pxPerInch : null,
      lengthPx,
      page,
      labelT: 0.125,
    };
  }

  function createArcMeasurement({
    id,
    arc,
    existingMeasurements,
    palette,
    page,
    pxPerInch,
    activePath,
    name,
    panelOrder,
  }) {
    const clonedArc = cloneArc(arc);
    if (!clonedArc) return null;
    const points = arcAnchorPoints(clonedArc);
    if (points.length < 2) return null;
    const lengthPx = geometry.arcLengthPx(clonedArc);
    const pathSnapshot = selectedPathSnapshot(activePath);
    const color = colorFromPathSnapshot(pathSnapshot, nextMeasurementColor(existingMeasurements, palette));
    const assignedPanelOrder = numericPanelOrder(panelOrder);
    return {
      id,
      name: cleanMeasurementName(existingMeasurements, name, { id }),
      color,
      ...(pathSnapshot || {}),
      ...(assignedPanelOrder != null ? { panelOrder: assignedPanelOrder } : {}),
      drawType: 'arc',
      shape: measurementModel.createShapeMetadata('arc'),
      points,
      arc: clonedArc,
      lengthInches: pxPerInch ? lengthPx / pxPerInch : null,
      lengthPx,
      page,
      labelT: 0.5,
    };
  }

  function cloneMeasurementForClipboard(selected, pageScales) {
    if (!selected) return null;
    const clipboard = {
      ...selected,
      points: clonePoints(selected.points),
      segments: measurementModel.isCurveMeasurement(selected) ? cloneSegments(selected.segments) : null,
      circle: selected.circle ? cloneCircle(selected.circle) : selected.circle,
      arc: selected.arc ? cloneArc(selected.arc) : selected.arc,
      shape: cloneMeasurementShape(selected),
      pathStyle: clonePathStyle(selected.pathStyle),
      mergeMemory: cloneValue(selected.mergeMemory),
      sourcePage: selected.page,
      sourceScale: (pageScales || {})[selected.page] || null,
      sourceLengthInches: selected.lengthInches,
      sourceLengthPx: selected.lengthPx || measurementModel.measurementLengthPx(selected),
    };
    if (hasMeasurementRunDetails(selected)) clipboard.runDetails = normalizeRunDetails(selected.runDetails);
    return clipboard;
  }

  function duplicateOffsetDelta(bounds, pageSize, offset = { x: 18, y: 18 }) {
    const rawX = typeof offset === 'number' ? offset : offset?.x;
    const rawY = typeof offset === 'number' ? offset : offset?.y;
    const dx = Number.isFinite(rawX) ? rawX : 18;
    const dy = Number.isFinite(rawY) ? rawY : 18;
    const candidates = [
      { dx, dy },
      { dx: -dx, dy },
      { dx, dy: -dy },
      { dx: -dx, dy: -dy },
    ];
    if (!pageSize?.width || !pageSize?.height) return candidates[0];
    return candidates
      .map(candidate => geometry.constrainDeltaToRect(bounds, candidate.dx, candidate.dy, pageSize.width, pageSize.height))
      .sort((a, b) => Math.hypot(b.dx, b.dy) - Math.hypot(a.dx, a.dy))[0];
  }

  function createDuplicateMeasurement({
    source,
    id,
    existingMeasurements,
    palette,
    pageScales,
    pxPerInch,
    offset,
    pageSize,
    constrainGeometry,
  } = {}) {
    if (!source) return null;
    const currentPage = source.page;
    const scale = pxPerInch || (pageScales || {})[currentPage] || null;
    const clipboard = cloneMeasurementForClipboard(source, { ...(pageScales || {}), [currentPage]: scale });
    const bounds = measurementModel.measurementBounds(clipboard);
    if (!bounds) return null;
    const delta = duplicateOffsetDelta(bounds, pageSize, offset);
    return createPastedMeasurement({
      source: clipboard,
      id,
      existingMeasurements,
      palette,
      pasteAt: { x: bounds.cx + delta.dx, y: bounds.cy + delta.dy },
      currentPage,
      pxPerInch: scale,
      constrainGeometry,
    });
  }

  function deleteMeasurementById(existingMeasurements, id) {
    return (existingMeasurements || []).filter(measurement => measurement.id !== id);
  }

  function applyVertexDrag(measurement, drag, point) {
    if (!measurement || !drag || !point) return false;
    if (measurementModel.isCircleMeasurement?.(measurement)) {
      if (drag.vertexIndex === 0) {
        measurement.circle = { ...measurement.circle, center: clonePoint(point) };
      } else if (drag.vertexIndex === 1) {
        const handleDistance = geometry.distancePx(measurement.circle.center, point);
        const dimension = circleDimensionForMeasurement(measurement);
        const radius = handleDistance / (dimension === 'diameter' ? 2 : 1);
        if (!(radius > 0)) return false;
        measurement.circle = { ...measurement.circle, radius };
        setCircleHandleAngle(measurement, point);
      } else {
        return false;
      }
      measurement.points = circleAnchorPoints(measurement.circle, measurement);
      return true;
    }
    if (measurementModel.isArcMeasurement?.(measurement)) {
      const start = geometry.arcPointAtT(measurement.arc, 0);
      const end = geometry.arcPointAtT(measurement.arc, 1);
      let arc = null;
      if (drag.vertexIndex === 0) {
        arc = geometry.arcFromCenterStartEnd(measurement.arc.center, point, end);
      } else if (drag.vertexIndex === 1) {
        arc = geometry.arcFromCenterStartEnd(measurement.arc.center, start, point);
      } else if (drag.vertexIndex === 2) {
        const dx = point.x - measurement.arc.center.x;
        const dy = point.y - measurement.arc.center.y;
        arc = translateArcGeometry(measurement.arc, dx, dy);
      } else if (drag.vertexIndex === 3) {
        arc = geometry.arcFromThreePoints(start, point, end);
      } else {
        return false;
      }
      if (!arc) return false;
      measurement.arc = arc;
      measurement.points = arcAnchorPoints(arc);
      return true;
    }
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
    if (measurementModel.isCircleMeasurement?.(measurement) || measurementModel.isArcMeasurement?.(measurement)) return false;
    const anchorCount = measurementModel.isCurveMeasurement(measurement)
      ? measurementModel.anchorsFromSegments(measurement.segments).length
      : (measurement.points || []).length;
    return anchorCount > 2;
  }

  function addAnchorToMeasurement(measurement, target) {
    if (!measurement || !target || target.kind !== 'path-hit') return false;
    if (measurementModel.isCircleMeasurement?.(measurement) || measurementModel.isArcMeasurement?.(measurement)) return false;
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
    if (!measurement || !target || !['anchor-hit', 'line-anchor', 'curve-anchor'].includes(target.kind)) return null;
    if (measurementModel.isMixedMeasurement?.(measurement)) return null;
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

  function endpointPoint(measurement, endpoint) {
    if (!measurement || (endpoint !== 'start' && endpoint !== 'end')) return null;
    if (measurementModel.isCurveMeasurement(measurement)) {
      if (!measurement.segments?.length) return null;
      return endpoint === 'start'
        ? measurement.segments[0].from
        : measurement.segments[measurement.segments.length - 1].to;
    }
    const points = measurement.points || [];
    if (points.length < 2) return null;
    return endpoint === 'start' ? points[0] : points[points.length - 1];
  }

  function clearEndpointSnapConnection(measurement, endpoint) {
    if (!measurement) return false;
    measurement.snapConnections = (measurement.snapConnections || []).filter(connection => connection.endpoint !== endpoint);
    return true;
  }

  function clearEndpointSnapConnections(measurement) {
    if (!measurement) return false;
    measurement.snapConnections = [];
    return true;
  }

  function setEndpointSnapConnection(measurement, endpoint, snap) {
    if (!measurement || (endpoint !== 'start' && endpoint !== 'end')) return false;
    clearEndpointSnapConnection(measurement, endpoint);
    const targetId = snap?.targetId ?? snap?.measurementId;
    const targetEndpoint = snap?.targetEndpoint ?? snap?.endpoint;
    if (targetId == null || (targetEndpoint !== 'start' && targetEndpoint !== 'end')) return false;
    measurement.snapConnections.push({ endpoint, targetId, targetEndpoint });
    return true;
  }

  function breakAreaClosureForEndpointMove(measurement, endpoint) {
    if (!measurement || (endpoint !== 'start' && endpoint !== 'end')) return false;
    const id = String(measurement.id);
    let changed = false;
    const connections = measurement.snapConnections || [];
    const nextConnections = connections.filter(connection => {
      const selfClosing = connection
        && String(connection.targetId) === id
        && (
          (connection.endpoint === endpoint && (connection.targetEndpoint === 'start' || connection.targetEndpoint === 'end'))
          || (connection.targetEndpoint === endpoint && (connection.endpoint === 'start' || connection.endpoint === 'end'))
        );
      if (selfClosing) changed = true;
      return !selfClosing;
    });
    if (nextConnections.length !== connections.length) measurement.snapConnections = nextConnections;
    if (measurement.area?.enabled) {
      measurement.area = { ...measurement.area, enabled: false };
      changed = true;
    }
    return changed;
  }

  function stableValue(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(stableValue);
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }

  function sameExplicitField(a, b, key) {
    const aHas = a && Object.prototype.hasOwnProperty.call(a, key);
    const bHas = b && Object.prototype.hasOwnProperty.call(b, key);
    if (!aHas && !bHas) return true;
    return aHas && bHas && JSON.stringify(stableValue(a[key])) === JSON.stringify(stableValue(b[key]));
  }

  function compatiblePathStyling(a, b) {
    for (const key of ['pathTemplateId', 'pathId', 'templateId', 'templatePathId', 'pathStyle', 'templateStyle', 'stroke', 'anchors']) {
      if (!sameExplicitField(a, b, key)) return false;
    }
    return true;
  }

  function compatibleMergeMeasurements(a, b) {
    if (!a || !b || a.id === b.id) return false;
    if ((a.page || 1) !== (b.page || 1)) return false;
    const aShape = measurementModel.measurementShapeKind(a);
    const bShape = measurementModel.measurementShapeKind(b);
    const mergeableShape = measurement => {
      const shape = measurementModel.measurementShapeKind(measurement);
      if (shape === 'line') return true;
      if (shape === 'freehand') return measurementModel.isCurveMeasurement(measurement);
      return shape === 'path' && measurementModel.isMixedMeasurement?.(measurement);
    };
    if (!mergeableShape(a) || !mergeableShape(b)) return false;
    return compatiblePathStyling(a, b);
  }

  function connectionMatchesGeometry(source, sourceEndpoint, target, targetEndpoint) {
    return samePoint(endpointPoint(source, sourceEndpoint), endpointPoint(target, targetEndpoint));
  }

  function mergeConnectionForTarget({ measurements, measurement, target } = {}) {
    const sourceEndpoint = continuationEndpointRole(measurement, target);
    if (!sourceEndpoint) return null;
    const list = measurements || [];
    const byId = id => list.find(item => item.id === id);

    for (const connection of measurement.snapConnections || []) {
      if (connection.endpoint !== sourceEndpoint) continue;
      const other = byId(connection.targetId);
      if (
        compatibleMergeMeasurements(measurement, other)
        && connectionMatchesGeometry(measurement, sourceEndpoint, other, connection.targetEndpoint)
      ) {
        return {
          sourceId: measurement.id,
          sourceEndpoint,
          targetId: other.id,
          targetEndpoint: connection.targetEndpoint,
        };
      }
    }

    for (const other of list) {
      if (!other || other.id === measurement.id) continue;
      for (const connection of other.snapConnections || []) {
        if (connection.targetId !== measurement.id || connection.targetEndpoint !== sourceEndpoint) continue;
        if (
          compatibleMergeMeasurements(measurement, other)
          && connectionMatchesGeometry(measurement, sourceEndpoint, other, connection.endpoint)
        ) {
          return {
            sourceId: measurement.id,
            sourceEndpoint,
            targetId: other.id,
            targetEndpoint: connection.endpoint,
          };
        }
      }
    }
    return null;
  }

  function isEndpoint(value) {
    return value === 'start' || value === 'end';
  }

  function mergeConnectionForSelectedMeasurements({ measurements, selectedIds, measurement } = {}) {
    const selected = new Set((selectedIds || []).filter(id => id != null).map(String));
    if (selected.size < 2) return null;
    const focusedId = measurement?.id != null ? String(measurement.id) : null;
    if (focusedId && !selected.has(focusedId)) return null;

    const list = measurements || [];
    const byId = id => list.find(item => item && String(item.id) === String(id));
    for (const source of list) {
      if (!source || !selected.has(String(source.id))) continue;
      for (const connection of source.snapConnections || []) {
        const sourceEndpoint = connection.endpoint;
        const targetEndpoint = connection.targetEndpoint;
        if (!isEndpoint(sourceEndpoint) || !isEndpoint(targetEndpoint)) continue;
        if (!selected.has(String(connection.targetId))) continue;

        const target = byId(connection.targetId);
        if (!target || (focusedId && String(source.id) !== focusedId && String(target.id) !== focusedId)) continue;
        if (
          compatibleMergeMeasurements(source, target)
          && connectionMatchesGeometry(source, sourceEndpoint, target, targetEndpoint)
        ) {
          return {
            sourceId: source.id,
            sourceEndpoint,
            targetId: target.id,
            targetEndpoint,
          };
        }
      }
    }
    return null;
  }

  function appendUniquePoint(points, point) {
    if (!point) return;
    if (!points.length || !samePoint(points[points.length - 1], point)) points.push(clonePoint(point));
  }

  function isContinuablePolylineMeasurement(measurement) {
    return !!(
      measurement
      && Array.isArray(measurement.points)
      && measurement.points.length >= 2
      && !measurementModel.isCurveMeasurement(measurement)
      && !measurementModel.isMixedMeasurement?.(measurement)
    );
  }

  function continueLineMeasurement(measurement, { endpoint, points, pxPerInch } = {}) {
    if (!isContinuablePolylineMeasurement(measurement)) return false;
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

  function mergeLineGeometry(source, target, sourceEndpoint, targetEndpoint) {
    const targetPoints = sourceEndpoint === targetEndpoint ? reversePoints(target.points) : clonePoints(target.points);
    const nextPoints = [];
    if (sourceEndpoint === 'end') {
      for (const point of source.points || []) appendUniquePoint(nextPoints, point);
      for (const point of targetPoints) appendUniquePoint(nextPoints, point);
    } else {
      for (const point of targetPoints) appendUniquePoint(nextPoints, point);
      for (const point of source.points || []) appendUniquePoint(nextPoints, point);
    }
    if (nextPoints.length < 2) return false;
    source.points = nextPoints;
    source.segments = null;
    source.drawType = 'line';
    if (source.shape) source.shape.active = 'line';
    return true;
  }

  function mergeFreehandGeometry(source, target, sourceEndpoint, targetEndpoint) {
    const targetSegments = sourceEndpoint === targetEndpoint ? reverseSegments(target.segments) : cloneSegments(target.segments);
    const sourceSegments = cloneSegments(source.segments);
    if (!sourceSegments?.length || !targetSegments?.length) return false;
    source.segments = sourceEndpoint === 'end'
      ? [...sourceSegments, ...targetSegments]
      : [...targetSegments, ...sourceSegments];
    source.drawType = 'freehand';
    if (source.shape) source.shape.active = 'freehand';
    measurementModel.updateCurveAnchors(source);
    return true;
  }

  function currentGeometryForLine(points) {
    return { points: clonePoints(points), segments: null };
  }

  function currentGeometryForFreehand(segments) {
    const clonedSegments = cloneSegments(segments);
    return {
      points: measurementModel.anchorsFromSegments(clonedSegments).map(clonePoint),
      segments: clonedSegments,
    };
  }

  function sourceBoundary(current) {
    const points = current?.segments?.length
      ? geometry.flattenSegments(current.segments, 18)
      : (current?.points || []);
    return {
      points: points.length
        ? [clonePoint(points[0]), clonePoint(points[points.length - 1])]
        : [],
      lengthPx: current?.segments?.length
        ? current.segments.reduce((sum, segment) => sum + geometry.cubicLengthPx(segment), 0)
        : geometry.polylineLengthPx(current?.points || []),
    };
  }

  function sourcePortionId(measurement) {
    return `source:${measurement?.id ?? 'path'}`;
  }

  function cloneSourcePortion(source) {
    return cloneValue(source);
  }

  function reverseCurrentGeometry(kind, current) {
    if (kind === 'freehand') return currentGeometryForFreehand(reverseSegments(current?.segments || []));
    return currentGeometryForLine(reversePoints(current?.points || []));
  }

  function reverseSourcePortion(source) {
    const reversed = cloneSourcePortion(source);
    reversed.current = reverseCurrentGeometry(reversed.kind, reversed.current);
    reversed.reversed = !reversed.reversed;
    reversed.boundary = sourceBoundary(reversed.current);
    return reversed;
  }

  function measurementCurrentPortion(measurement) {
    const kind = measurementModel.measurementShapeKind(measurement);
    if (kind === 'freehand') {
      return {
        kind,
        current: currentGeometryForFreehand(measurement.segments || []),
      };
    }
    return {
      kind: 'line',
      current: currentGeometryForLine(measurement.points || []),
    };
  }

  function sourcePortionsForMeasurement(measurement, { reverse = false, connection = null, panelOrder = null } = {}) {
    const existing = measurement?.mergeMemory?.sources;
    let portions = Array.isArray(existing) && existing.length
      ? existing.map(cloneSourcePortion)
      : [(() => {
        const portion = measurementCurrentPortion(measurement);
        return {
          portionId: sourcePortionId(measurement),
          originalId: measurement.id,
          original: cloneMeasurementWithNormalizedRunDetails(measurement),
          kind: portion.kind,
          current: portion.current,
          reversed: false,
          panelOrder: measurementPanelOrder(measurement, panelOrder),
          boundary: sourceBoundary(portion.current),
        };
      })()];
    if (reverse) portions = portions.reverse().map(reverseSourcePortion);
    return portions.map((portion, order) => ({
      ...portion,
      connection: connection ? cloneValue(connection) : portion.connection || null,
      order,
      panelOrder: measurementPanelOrder(portion, measurementPanelOrder(portion.original, panelOrder)),
      boundary: sourceBoundary(portion.current),
    }));
  }

  function appendGeometryPoints(points, addition) {
    for (const point of addition || []) appendUniquePoint(points, point);
  }

  function combinedLinePoints(portions) {
    const points = [];
    for (const portion of portions) appendGeometryPoints(points, portion.current?.points || []);
    return points;
  }

  function combinedFreehandSegments(portions) {
    return portions.flatMap(portion => cloneSegments(portion.current?.segments || []));
  }

  function applyMergedPortions(source, portions) {
    const kinds = new Set(portions.map(portion => portion.kind));
    if (!source.shape) source.shape = measurementModel.createShapeMetadata('line');
    if (kinds.size === 1 && kinds.has('line')) {
      const points = combinedLinePoints(portions);
      if (points.length < 2) return false;
      source.drawType = 'line';
      source.shape.active = 'line';
      source.points = points;
      source.segments = null;
    } else if (kinds.size === 1 && kinds.has('freehand')) {
      const segments = combinedFreehandSegments(portions);
      if (!segments.length) return false;
      source.drawType = 'freehand';
      source.shape.active = 'freehand';
      source.segments = segments;
      measurementModel.updateCurveAnchors(source);
    } else {
      source.drawType = 'path';
      source.shape.active = 'path';
      source.segments = null;
      source.mergeMemory = { version: 1, sources: portions };
      measurementModel.updateMixedAnchors?.(source);
    }
    source.mergeMemory = { version: 1, sources: portions };
    return true;
  }

  function oppositeEndpoint(endpoint) {
    if (endpoint === 'start') return 'end';
    if (endpoint === 'end') return 'start';
    return null;
  }

  function snapEndpointKey(id, endpoint) {
    return `${String(id)}:${endpoint}`;
  }

  function dedupeSnapConnections(connections) {
    const seen = new Set();
    const result = [];
    for (const connection of connections || []) {
      if (!connection) continue;
      const key = `${connection.endpoint}:${String(connection.targetId)}:${connection.targetEndpoint}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(connection);
    }
    return result;
  }

  function remapSnapConnectionsForMergedPath(measurements, source, target, sourceEndpoint, targetEndpoint) {
    const list = measurements || [];
    const sourceId = source?.id;
    const targetId = target?.id;
    const sourceOuterEndpoint = oppositeEndpoint(sourceEndpoint);
    const targetOuterEndpoint = oppositeEndpoint(targetEndpoint);
    const endpointMap = new Map();
    if (sourceId != null && sourceOuterEndpoint) {
      endpointMap.set(
        snapEndpointKey(sourceId, sourceOuterEndpoint),
        sourceEndpoint === 'end' ? 'start' : 'end',
      );
    }
    if (targetId != null && targetOuterEndpoint) {
      endpointMap.set(
        snapEndpointKey(targetId, targetOuterEndpoint),
        sourceEndpoint === 'end' ? 'end' : 'start',
      );
    }

    const mergedIds = new Set([sourceId, targetId].filter(id => id != null).map(String));
    const byId = id => list.find(item => item && String(item.id) === String(id));
    const mappedMergedEndpoint = (id, endpoint) => endpointMap.get(snapEndpointKey(id, endpoint)) || null;
    const sourceConnections = [];

    for (const original of [source, target]) {
      for (const connection of original?.snapConnections || []) {
        const mappedEndpoint = mappedMergedEndpoint(original.id, connection.endpoint);
        if (!mappedEndpoint || mergedIds.has(String(connection.targetId))) continue;
        const other = byId(connection.targetId);
        if (
          other
          && isEndpoint(connection.targetEndpoint)
          && connectionMatchesGeometry(source, mappedEndpoint, other, connection.targetEndpoint)
        ) {
          sourceConnections.push({
            endpoint: mappedEndpoint,
            targetId: connection.targetId,
            targetEndpoint: connection.targetEndpoint,
          });
        }
      }
    }

    for (const measurement of list) {
      if (!measurement) continue;
      if (String(measurement.id) === String(sourceId)) continue;
      const nextConnections = [];
      for (const connection of measurement.snapConnections || []) {
        const mappedTargetEndpoint = mappedMergedEndpoint(connection.targetId, connection.targetEndpoint);
        if (mappedTargetEndpoint) {
          if (
            isEndpoint(connection.endpoint)
            && connectionMatchesGeometry(measurement, connection.endpoint, source, mappedTargetEndpoint)
          ) {
            nextConnections.push({
              endpoint: connection.endpoint,
              targetId: sourceId,
              targetEndpoint: mappedTargetEndpoint,
            });
          }
        } else if (!mergedIds.has(String(connection.targetId))) {
          nextConnections.push(connection);
        }
      }
      measurement.snapConnections = dedupeSnapConnections(nextConnections);
    }

    source.snapConnections = dedupeSnapConnections(sourceConnections);
  }

  function minPanelOrder(portions, fallback = null) {
    const orders = (portions || [])
      .map(portion => measurementPanelOrder(portion))
      .filter(order => order != null);
    return orders.length ? Math.min(...orders) : measurementPanelOrder(null, fallback);
  }

  function restoreSourcePanelOrder(measurement, source) {
    const panelOrder = measurementPanelOrder(source, measurementPanelOrder(source?.original));
    return panelOrder == null ? measurement : { ...measurement, panelOrder };
  }

  function sortMeasurementsByPanelOrder(measurements) {
    return (measurements || [])
      .map((measurement, index) => ({
        measurement,
        index,
        panelOrder: measurementPanelOrder(measurement, index),
      }))
      .sort((a, b) => (a.panelOrder - b.panelOrder) || (a.index - b.index))
      .map(item => item.measurement);
  }

  function mergeSnappedEndpointPaths(measurementList, connection, { pxPerInch, mergeName = null } = {}) {
    const list = measurementList || [];
    const sourceIndex = list.findIndex(measurement => measurement.id === connection?.sourceId);
    const targetIndex = list.findIndex(measurement => measurement.id === connection?.targetId);
    const source = list[sourceIndex];
    const target = list[targetIndex];
    const sourceEndpoint = connection?.sourceEndpoint;
    const targetEndpoint = connection?.targetEndpoint;
    if (
      sourceIndex < 0
      || targetIndex < 0
      || !compatibleMergeMeasurements(source, target)
      || !connectionMatchesGeometry(source, sourceEndpoint, target, targetEndpoint)
    ) {
      return { merged: false, measurements: list, measurement: source || null };
    }

    const connectionSnapshot = {
      sourceId: source.id,
      sourceEndpoint,
      targetId: target.id,
      targetEndpoint,
    };
    const sourcePortions = sourcePortionsForMeasurement(source, {
      connection: connectionSnapshot,
      panelOrder: measurementPanelOrder(source, sourceIndex),
    });
    const targetPortions = sourcePortionsForMeasurement(target, {
      reverse: sourceEndpoint === targetEndpoint,
      connection: connectionSnapshot,
      panelOrder: measurementPanelOrder(target, targetIndex),
    });
    const portions = sourceEndpoint === 'end'
      ? [...sourcePortions, ...targetPortions]
      : [...targetPortions, ...sourcePortions];
    const orderedPortions = portions.map((portion, order) => ({
      ...portion,
      order,
      boundary: sourceBoundary(portion.current),
    }));
    const merged = applyMergedPortions(source, orderedPortions);
    if (!merged) return { merged: false, measurements: list, measurement: source };

    const cleanMergeName = String(mergeName || '').trim();
    if (cleanMergeName) source.name = cleanMergeName;
    const mergedPanelOrder = minPanelOrder(orderedPortions, sourceIndex);
    if (mergedPanelOrder != null) source.panelOrder = mergedPanelOrder;
    finalizeMeasurementGeometry(source, { pxPerInch });
    const nextMeasurements = list.filter(measurement => measurement.id !== target.id);
    remapSnapConnectionsForMergedPath(nextMeasurements, source, target, sourceEndpoint, targetEndpoint);
    return { merged: true, measurements: nextMeasurements, measurement: source };
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

  function resizeMeasurementToLength(measurement, { targetLengthInches, pxPerInch } = {}) {
    const targetInches = Number(targetLengthInches);
    if (!measurement || !Number.isFinite(targetInches) || targetInches <= 0) return false;
    if (!Number.isFinite(pxPerInch) || pxPerInch <= 0) return false;
    const currentLengthPx = measurementModel.measurementLengthPx(measurement);
    const targetLengthPx = targetInches * pxPerInch;
    if (!Number.isFinite(currentLengthPx) || currentLengthPx <= 0) return false;
    if (!Number.isFinite(targetLengthPx) || targetLengthPx <= 0) return false;
    const startAnchor = measurementStartAnchor(measurement);
    if (!startAnchor) return false;
    const scale = targetLengthPx / currentLengthPx;

    if (measurementModel.isMixedMeasurement?.(measurement)) {
      measurement.mergeMemory = refreshMergeMemoryBoundaries(scaleMergeMemoryGeometryAround(measurement.mergeMemory, startAnchor, scale));
    } else if (measurementModel.isCurveMeasurement(measurement)) {
      measurement.segments = geometry.scaleSegmentsAround(measurement.segments, startAnchor, scale);
      measurementModel.updateCurveAnchors(measurement);
    } else if (measurementModel.isCircleMeasurement?.(measurement)) {
      measurement.circle = scaleCircleGeometryAround(measurement.circle, startAnchor, scale);
      measurement.points = circleAnchorPoints(measurement.circle, measurement);
    } else if (measurementModel.isArcMeasurement?.(measurement)) {
      measurement.arc = scaleArcGeometryAround(measurement.arc, startAnchor, scale);
      measurement.points = arcAnchorPoints(measurement.arc);
    } else {
      measurement.points = geometry.scalePointsAround(measurement.points || [], startAnchor, scale);
    }
    if (measurement.shape) measurement.shape = scaleShapeGeometryAround(measurement.shape, startAnchor, scale);
    return finalizeMeasurementGeometry(measurement, { pxPerInch });
  }

  function finalizeMeasurementGeometry(measurement, { pxPerInch, preservedLabelPoint } = {}) {
    if (!measurement) return false;
    if (measurementModel.isCurveMeasurement(measurement)) measurementModel.updateCurveAnchors(measurement);
    if (measurementModel.isMixedMeasurement?.(measurement)) measurementModel.updateMixedAnchors?.(measurement);
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

  function updateMeasurementLabelFromPoint(measurement, point) {
    if (!measurement || !point) return false;
    const displayPoints = measurementModel.measurementDisplayPoints(measurement);
    const projection = geometry.projectPointToPolyline(point, displayPoints);
    if (!projection) return false;
    measurement.labelT = projection.t;
    measurement.labelOffset = {
      x: point.x - projection.point.x,
      y: point.y - projection.point.y,
    };
    return true;
  }

  function mergeMemorySources(measurement) {
    return Array.isArray(measurement?.mergeMemory?.sources) ? measurement.mergeMemory.sources : [];
  }

  function currentDisplayPointsForSource(source) {
    if (measurementModel.mixedSourceDisplayPoints) return measurementModel.mixedSourceDisplayPoints(source);
    const current = source?.current || {};
    return source?.kind === 'freehand' && current.segments?.length
      ? geometry.flattenSegments(current.segments, 18)
      : (current.points || []);
  }

  function displayPointsForSources(sources) {
    const points = [];
    for (const source of sources || []) appendGeometryPoints(points, currentDisplayPointsForSource(source));
    return points;
  }

  function lineOnlyMergeSources(sources) {
    return sources?.length > 1 && sources.every(source => source?.kind === 'line');
  }

  function samePointList(a, b) {
    if ((a || []).length !== (b || []).length) return false;
    return (a || []).every((point, index) => samePoint(point, b[index]));
  }

  function sourceMemoryMatchesCurrentMeasurement(measurement) {
    const sources = mergeMemorySources(measurement);
    if (sources.length < 2) return false;
    const points = displayPointsForSources(sources);
    if (points.length < 2) return false;
    if (lineOnlyMergeSources(sources)) {
      const measurementPoints = measurement?.points || [];
      const endpoints = [points[0], points[points.length - 1]];
      return samePointList(measurementPoints, points) || samePointList(measurementPoints, endpoints);
    }
    if (measurementModel.isMixedMeasurement?.(measurement)) {
      const endpoints = measurementModel.mixedEndpointPoints?.(measurement) || [points[0], points[points.length - 1]];
      return samePointList(measurement.points || [], endpoints);
    }
    return samePointList(measurementModel.measurementDisplayPoints(measurement), points);
  }

  function sourceCurrentMatchesOriginal(source) {
    const original = source?.original;
    if (!original) return false;
    const portion = measurementCurrentPortion(original);
    let current = portion.current;
    if (source?.reversed) current = reverseCurrentGeometry(portion.kind, current);
    const originalSource = {
      kind: source?.kind === 'freehand' ? 'freehand' : 'line',
      current,
    };
    return samePointList(currentDisplayPointsForSource(source), currentDisplayPointsForSource(originalSource));
  }

  function mergeSourcesHaveMaintainedEdits(measurement, sources) {
    if (!sources?.length) return false;
    return !sourceMemoryMatchesCurrentMeasurement(measurement) || sources.some(source => !sourceCurrentMatchesOriginal(source));
  }

  function lineSourceSegmentCount(source) {
    const points = source?.current?.points || source?.boundary?.points || [];
    return Math.max(1, points.length - 1);
  }

  function lineSourceSplitWeight(source) {
    const boundaryLength = source?.boundary?.lengthPx;
    if (Number.isFinite(boundaryLength) && boundaryLength > 0) return boundaryLength;
    return geometry.polylineLengthPx(source?.current?.points || source?.boundary?.points || []);
  }

  function lineSourceWithCurrent(source, points) {
    const current = { points: clonePoints(points), segments: null };
    return {
      ...cloneSourcePortion(source),
      kind: 'line',
      current,
      boundary: sourceBoundary(current),
    };
  }

  function pointAtPolylineDistance(points, distance, totalLength) {
    const result = geometry.pointAtPolylineT(points, totalLength ? distance / totalLength : 0);
    return result?.point ? clonePoint(result.point) : null;
  }

  function slicePolylineByDistance(points, startDistance, endDistance, totalLength) {
    const start = pointAtPolylineDistance(points, startDistance, totalLength);
    const end = pointAtPolylineDistance(points, endDistance, totalLength);
    if (!start || !end) return null;
    const sliced = [start];
    let travelled = 0;
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1];
      const b = points[index];
      const segmentLength = geometry.distancePx(a, b);
      if (!segmentLength) continue;
      const pointDistance = travelled + segmentLength;
      if (pointDistance > startDistance + 0.0001 && pointDistance < endDistance - 0.0001) {
        appendUniquePoint(sliced, b);
      }
      travelled = pointDistance;
    }
    appendUniquePoint(sliced, end);
    return sliced.length >= 2 ? sliced : [start, end];
  }

  function splitLineSourcesBySegments(points, sources) {
    const counts = sources.map(lineSourceSegmentCount);
    const totalSourceSegments = counts.reduce((sum, count) => sum + count, 0);
    if (points.length - 1 !== totalSourceSegments) return null;
    let offset = 0;
    return sources.map((source, index) => {
      const count = counts[index];
      const portion = points.slice(offset, offset + count + 1);
      offset += count;
      return lineSourceWithCurrent(source, portion);
    });
  }

  function splitLineSourcesByLength(points, sources) {
    const totalLength = geometry.polylineLengthPx(points);
    if (!totalLength) return null;
    const weights = sources.map(lineSourceSplitWeight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (!totalWeight) return null;
    let distance = 0;
    return sources.map((source, index) => {
      const startDistance = distance;
      distance = index === sources.length - 1
        ? totalLength
        : distance + (weights[index] / totalWeight) * totalLength;
      const portion = slicePolylineByDistance(points, startDistance, distance, totalLength);
      return portion ? lineSourceWithCurrent(source, portion) : null;
    });
  }

  function maintainedSourcesForMeasurement(measurement, sources = mergeMemorySources(measurement)) {
    if (sourceMemoryMatchesCurrentMeasurement(measurement)) return sources;
    if (
      (measurementModel.isLineMeasurement(measurement) || lineOnlyMergeSources(sources))
      && (measurement.points || []).length >= 2
    ) {
      const points = clonePoints(measurement.points);
      const split = splitLineSourcesBySegments(points, sources) || splitLineSourcesByLength(points, sources);
      if (split && split.every(Boolean)) return split;
    }
    return null;
  }

  const UNSAFE_MAINTAIN_REASON = 'Current path edits cannot be mapped to the original paths.';

  function unmergePathState(measurement) {
    const sources = mergeMemorySources(measurement);
    const canUnmergePaths = sources.length > 1;
    const maintainedSources = canUnmergePaths ? maintainedSourcesForMeasurement(measurement, sources) : null;
    const canMaintainEdits = !!maintainedSources;
    const hasMaintainedEdits = canUnmergePaths && mergeSourcesHaveMaintainedEdits(measurement, sources);
    return {
      canUnmergePaths,
      canMaintainEdits,
      hasMaintainedEdits,
      maintainEditsReason: canMaintainEdits ? '' : UNSAFE_MAINTAIN_REASON,
    };
  }

  function sourceOriginalMeasurement(source) {
    const original = cloneMeasurementWithNormalizedRunDetails(source?.original);
    delete original.mergeMemory;
    return original;
  }

  function measurementFromMaintainedSource(source, { pxPerInch } = {}) {
    const measurement = sourceOriginalMeasurement(source);
    const kind = source?.kind === 'freehand' ? 'freehand' : 'line';
    measurement.drawType = kind;
    measurement.shape = measurementModel.cloneShapeMetadata(measurement.shape, kind);
    measurement.shape.active = kind;
    delete measurement.mergeMemory;
    if (kind === 'freehand') {
      measurement.segments = cloneSegments(source.current?.segments || []);
      measurement.points = clonePoints(source.current?.points?.length
        ? source.current.points
        : measurementModel.anchorsFromSegments(measurement.segments));
    } else {
      measurement.points = clonePoints(source.current?.points || []);
      measurement.segments = null;
    }
    finalizeMeasurementGeometry(measurement, { pxPerInch });
    return measurement;
  }

  function unmergePaths(measurementList, measurementId, { mode = 'original', pxPerInch } = {}) {
    const list = measurementList || [];
    const index = list.findIndex(measurement => measurement.id === measurementId);
    const measurement = list[index];
    const sources = mergeMemorySources(measurement);
    if (index < 0 || sources.length < 2) return { unmerged: false, measurements: list, measurement: measurement || null, reason: 'Path is not merged.' };
    const state = unmergePathState(measurement);
    if (mode === 'maintain-edits' && !state.canMaintainEdits) {
      return { unmerged: false, measurements: list, measurement, reason: state.maintainEditsReason };
    }
    const maintainedSources = mode === 'maintain-edits' ? maintainedSourcesForMeasurement(measurement, sources) : null;
    const restored = (mode === 'maintain-edits'
      ? maintainedSources.map(source => measurementFromMaintainedSource(source, { pxPerInch }))
      : sources.map(sourceOriginalMeasurement))
      .map((restoredMeasurement, sourceIndex) => restoreSourcePanelOrder(restoredMeasurement, sources[sourceIndex]));
    const measurements = sortMeasurementsByPanelOrder([
      ...list.slice(0, index),
      ...list.slice(index + 1),
      ...restored,
    ]);
    return {
      unmerged: true,
      measurements,
      measurement: restored[0] || null,
      restored,
    };
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
    let circle = source.circle ? translateCircleGeometry(cloneCircle(source.circle), dx, dy) : source.circle;
    let arc = source.arc ? translateArcGeometry(cloneArc(source.arc), dx, dy) : source.arc;
    let shape = translateShapeGeometry(cloneMeasurementShape(source), dx, dy);
    let mergeMemory = source.mergeMemory ? translateMergeMemoryGeometry(source.mergeMemory, dx, dy) : null;

    if (mode === 'real-length' && source.sourceLengthInches != null && pxPerInch) {
      const visualLength = mergeMemory
        ? measurementModel.measurementLengthPx({ drawType: 'path', shape: { active: 'path' }, points, mergeMemory })
        : (circle
          ? measurementModel.measurementLengthPx({ drawType: 'circle', shape: { active: 'circle' }, circle })
          : (arc
            ? measurementModel.measurementLengthPx({ drawType: 'arc', shape: { active: 'arc' }, arc })
            : (segments ? measurementModel.measurementLengthPx({ segments }) : geometry.polylineLengthPx(points))));
      const targetLengthPx = source.sourceLengthInches * pxPerInch;
      if (visualLength > 0 && targetLengthPx > 0) {
        const scale = targetLengthPx / visualLength;
        points = geometry.scalePointsAround(points, pasteAt, scale);
        if (segments) segments = geometry.scaleSegmentsAround(segments, pasteAt, scale);
        if (circle) circle = scaleCircleGeometryAround(circle, pasteAt, scale);
        if (arc) arc = scaleArcGeometryAround(arc, pasteAt, scale);
        shape = scaleShapeGeometryAround(shape, pasteAt, scale);
        if (mergeMemory) mergeMemory = scaleMergeMemoryGeometryAround(mergeMemory, pasteAt, scale);
      }
    }

    if (constrainGeometry) {
      const beforeConstrain = points;
      const constrained = constrainGeometry(points, segments);
      points = constrained.points;
      segments = constrained.segments;
      if (beforeConstrain?.length && points?.length) {
        const shift = { dx: points[0].x - beforeConstrain[0].x, dy: points[0].y - beforeConstrain[0].y };
        shape = translateShapeGeometry(shape, points[0].x - beforeConstrain[0].x, points[0].y - beforeConstrain[0].y);
        if (circle) circle = translateCircleGeometry(circle, shift.dx, shift.dy);
        if (arc) arc = translateArcGeometry(arc, shift.dx, shift.dy);
        if (mergeMemory) mergeMemory = translateMergeMemoryGeometry(mergeMemory, shift.dx, shift.dy);
      }
    }

    const pasted = {
      ...source,
      id,
      name: `${String(source.name || '').trim() || 'Run'} copy`,
      color: source.color || nextMeasurementColor(existingMeasurements, palette),
      pathStyle: clonePathStyle(source.pathStyle),
      page: currentPage,
      points,
      segments,
      circle,
      arc,
      shape,
      mergeMemory,
      labelT: Number.isFinite(source.labelT)
        ? source.labelT
        : defaultLabelT(segments ? geometry.flattenSegments(segments, 18) : points),
    };
    if (hasMeasurementRunDetails(source)) pasted.runDetails = normalizeRunDetails(source.runDetails);
    if (segments) measurementModel.updateCurveAnchors(pasted);
    if (measurementModel.isMixedMeasurement?.(pasted)) measurementModel.updateMixedAnchors?.(pasted);
    pasted.lengthPx = measurementModel.measurementLengthPx(pasted);
    pasted.lengthInches = pxPerInch ? pasted.lengthPx / pxPerInch : null;
    return pasted;
  }

  window.TakeoffMeasurementCommands = {
    nextMeasurementColor,
    fallbackMeasurementName,
    cleanMeasurementName,
    saveMeasurementRunDetails,
    defaultLabelT,
    createLineMeasurement,
    createFreehandMeasurement,
    createCircleMeasurement,
    createArcMeasurement,
    cloneMeasurementForClipboard,
    createDuplicateMeasurement,
    deleteMeasurementById,
    applyVertexDrag,
    canRemoveAnchorFromMeasurement,
    addAnchorToMeasurement,
    removeAnchorFromMeasurement,
    continuationEndpointRole,
    endpointPoint,
    clearEndpointSnapConnection,
    clearEndpointSnapConnections,
    setEndpointSnapConnection,
    breakAreaClosureForEndpointMove,
    mergeConnectionForTarget,
    mergeConnectionForSelectedMeasurements,
    mergeSnappedEndpointPaths,
    unmergePathState,
    unmergePaths,
    transformMergeMemoryGeometry,
    translateMergeMemoryGeometry,
    continueLineMeasurement,
    continueFreehandMeasurement,
    measurementLabelPoint,
    convertFreehandMeasurementToLine,
    convertLineMeasurementToFreehand,
    resizeMeasurementToLength,
    finalizeMeasurementGeometry,
    updateMeasurementLabelFromPoint,
    shouldAskPasteMode,
    createPastedMeasurement,
  };
})();
