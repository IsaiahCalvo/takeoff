(function () {
  const geometry = window.TakeoffGeometry;
  const measurements = window.TakeoffMeasurements;

  const DRAW_MODES = new Set([
    'circle-radius',
    'circle-diameter',
    'circle-2p',
    'circle-3p',
    'arc-3p',
    'arc-center',
  ]);

  function isDrawMode(mode) {
    return DRAW_MODES.has(mode);
  }

  function requiredPointCount(mode) {
    return mode === 'circle-3p' || mode === 'arc-3p' || mode === 'arc-center' ? 3 : 2;
  }

  const PROMPTS = {
    'circle-radius': { title: 'Circle · Radius', steps: ['Pick center point', 'Pick radius point'] },
    'circle-diameter': { title: 'Circle · Diameter', steps: ['Pick center point', 'Pick diameter length'] },
    'circle-2p': { title: 'Circle · 2-point', steps: ['Pick first diameter point', 'Pick opposite diameter point'] },
    'circle-3p': { title: 'Circle · 3-point', steps: ['Pick first point on circle', 'Pick second point on circle', 'Pick third point on circle'] },
    'arc-3p': { title: 'Arc · 3-point', steps: ['Pick start point', 'Pick second point on arc', 'Pick end point'] },
    'arc-center': { title: 'Arc · Center', steps: ['Pick center point', 'Pick start point', 'Pick end point'] },
  };

  function promptModel({ mode, draft = null, metricText = '' } = {}) {
    const activeMode = draft?.mode || mode;
    const config = PROMPTS[activeMode];
    if (!config) return null;
    const pointCount = Math.max(0, Math.min(draft?.points?.length || 0, config.steps.length - 1));
    return { title: config.title, step: config.steps[pointCount], metricText: metricText || '' };
  }

  function geometryFromPoints(mode, points) {
    if (!Array.isArray(points) || points.length < requiredPointCount(mode)) return null;
    if (mode === 'circle-radius') return { kind: 'circle', circle: geometry.circleFromCenterRadius(points[0], points[1]) };
    if (mode === 'circle-diameter') return { kind: 'circle', circle: geometry.circleFromCenterRadius(points[0], geometry.distancePx(points[0], points[1]) / 2) };
    if (mode === 'circle-2p') return { kind: 'circle', circle: geometry.circleFromDiameterPoints(points[0], points[1]) };
    if (mode === 'circle-3p') return { kind: 'circle', circle: geometry.circleFromThreePoints(points[0], points[1], points[2]) };
    if (mode === 'arc-3p') return { kind: 'arc', arc: geometry.arcFromThreePoints(points[0], points[1], points[2]) };
    if (mode === 'arc-center') return { kind: 'arc', arc: geometry.arcFromCenterStartEnd(points[0], points[1], points[2]) };
    return null;
  }

  function draftPoints(draft, previewPoint = null) {
    const points = draft?.points ? draft.points.slice() : [];
    if (previewPoint && points.length < requiredPointCount(draft.mode)) points.push(previewPoint);
    return points;
  }

  function draftGeometry(draft, previewPoint = null) {
    return draft?.mode ? geometryFromPoints(draft.mode, draftPoints(draft, previewPoint)) : null;
  }

  function stackCircleForPage(state, continuousMeasurements, page, circle) {
    return circle?.center ? {
      ...circle,
      center: continuousMeasurements.stackPointForPage(state, page, circle.center) || circle.center,
    } : circle;
  }

  function stackArcForPage(state, continuousMeasurements, page, arc) {
    return arc?.center ? {
      ...arc,
      center: continuousMeasurements.stackPointForPage(state, page, arc.center) || arc.center,
    } : arc;
  }

  function createTool(deps) {
    function formatLengthPxForPage(px, page) {
      return deps.scaleForPage(page)
        ? `${deps.formatLen(deps.pxToInches(px, page))} ${deps.unitLabel()}`
        : null;
    }

    function formatPromptLengthPx(px, page) {
      return formatLengthPxForPage(px, page) || `${Math.round(px)} px`;
    }

    function circleLabelForMetrics(metrics, page) {
      if (!metrics) return 'no scale';
      const circumference = formatLengthPxForPage(metrics.circumferencePx, page);
      const radius = formatLengthPxForPage(metrics.radiusPx, page);
      return circumference && radius ? `C ${circumference} | R ${radius}` : 'no scale';
    }

    function arcLabelForMetrics(metrics, page) {
      if (!metrics) return 'no scale';
      const length = formatLengthPxForPage(metrics.lengthPx, page);
      const angle = `${metrics.angleDegrees.toFixed(1)} deg | ${metrics.angleRadians.toFixed(3)} rad`;
      return length ? `L ${length} | ${angle}` : angle;
    }

    function measurementCanvasLabel(measurement) {
      if (measurements.isCircleMeasurement(measurement)) return circleLabelForMetrics(measurements.circleMeasurementMetrics(measurement), measurement.page);
      if (measurements.isArcMeasurement(measurement)) return arcLabelForMetrics(measurements.arcMeasurementMetrics(measurement), measurement.page);
      return measurement.lengthInches != null ? `${deps.formatLen(measurement.lengthInches)} ${deps.unitLabel()}` : 'no scale';
    }

    function draftLabel(page, geometryInfo) {
      if (geometryInfo?.kind === 'circle' && geometryInfo.circle) {
        return circleLabelForMetrics({
          radiusPx: geometryInfo.circle.radius,
          diameterPx: geometryInfo.circle.radius * 2,
          circumferencePx: geometry.circleCircumferencePx(geometryInfo.circle),
        }, page);
      }
      if (geometryInfo?.kind === 'arc' && geometryInfo.arc) {
        return arcLabelForMetrics({
          radiusPx: geometryInfo.arc.radius,
          lengthPx: geometry.arcLengthPx(geometryInfo.arc),
          angleRadians: geometry.arcAngleRadians(geometryInfo.arc),
          angleDegrees: geometry.arcAngleDegrees(geometryInfo.arc),
        }, page);
      }
      return null;
    }

    function draftPromptMetric(page, geometryInfo) {
      if (geometryInfo?.kind === 'circle' && geometryInfo.circle) {
        const radius = geometryInfo.circle.radius;
        return `R ${formatPromptLengthPx(radius, page)} | D ${formatPromptLengthPx(radius * 2, page)}`;
      }
      if (geometryInfo?.kind === 'arc' && geometryInfo.arc) {
        return `Angle ${geometry.arcAngleDegrees(geometryInfo.arc).toFixed(1)} deg | ${geometry.arcAngleRadians(geometryInfo.arc).toFixed(3)} rad`;
      }
      return '';
    }

    function draftPromptModel(activeMode = null) {
      if (deps.state.mode !== 'measure') return null;
      const draft = deps.state.circleArcDraft;
      const mode = draft?.mode || activeMode || deps.state.drawMode;
      if (!isDrawMode(mode)) return null;
      const page = draft?.page || deps.currentPage();
      const geometryInfo = draft ? draftGeometry(draft, draft.previewPoint || null) : null;
      return promptModel({ mode, draft, metricText: draftPromptMetric(page, geometryInfo) });
    }

    function drawDraft() {
      const draft = deps.state.circleArcDraft;
      if (!draft) return;
      const page = draft.page || deps.currentPage();
      const previewPoint = draft.previewPoint || null;
      const anchors = deps.continuousMeasurements.stackPointsForPage(deps.state, page, draftPoints(draft, previewPoint));
      const geometryInfo = draftGeometry(draft, previewPoint);
      const opts = {
        color: '#b6ff3c',
        width: 2,
        dashed: true,
        dots: false,
        label: draftLabel(page, geometryInfo),
        labelColor: '#b6ff3c',
        anchorPoints: anchors,
      };
      if (geometryInfo?.kind === 'circle' && geometryInfo.circle) deps.drawCircle(stackCircleForPage(deps.state, deps.continuousMeasurements, page, geometryInfo.circle), opts);
      else if (geometryInfo?.kind === 'arc' && geometryInfo.arc) deps.drawArc(stackArcForPage(deps.state, deps.continuousMeasurements, page, geometryInfo.arc), opts);
      if (anchors.length) deps.drawEndpointAnchors(anchors, '#b6ff3c');
    }

    function updatePreviewFromCursor() {
      const draft = deps.state.circleArcDraft;
      if (!draft || deps.state.mode !== 'measure') return false;
      const raw = deps.continuousMeasurements.localPointForPage(deps.state, draft.page, deps.state.cursorImg);
      const resolved = deps.snapPointOnPage(draft.page, raw);
      draft.previewPoint = resolved.point || raw;
      deps.redraw();
      return true;
    }

    function finishMeasurement() {
      const draft = deps.state.circleArcDraft;
      if (!draft) return false;
      const geometryInfo = draftGeometry(draft);
      if (!geometryInfo || (geometryInfo.kind === 'circle' && !geometryInfo.circle) || (geometryInfo.kind === 'arc' && !geometryInfo.arc)) {
        deps.showStatus('Could not create that circle or arc.', 2200, { force: true });
        deps.state.circleArcDraft = null;
        deps.redraw();
        return false;
      }
      const historyBefore = deps.createHistorySnapshot();
      const page = draft.page || deps.currentPage();
      const common = {
        id: Date.now(),
        existingMeasurements: deps.state.measurements,
        palette: deps.palette,
        page,
        pxPerInch: deps.scaleForPage(page),
        activePath: deps.activePathForNewRun(draft),
        name: deps.allocateRunName(),
        panelOrder: deps.allocateMeasurementPanelOrder(),
      };
      const measurement = geometryInfo.kind === 'circle'
        ? deps.measurementCommands.createCircleMeasurement({ ...common, circle: geometryInfo.circle })
        : deps.measurementCommands.createArcMeasurement({ ...common, arc: geometryInfo.arc });
      deps.state.circleArcDraft = null;
      if (!measurement) {
        deps.showStatus('Could not create that circle or arc.', 2200, { force: true });
        deps.redraw();
        return false;
      }
      const result = deps.measurementWorkflows.appendMeasurementResult({
        measurements: deps.state.measurements,
        measurement,
        selectedId: deps.state.selectedId,
        selectAppended: true,
      });
      deps.setMeasurements(result.measurements, { selectedId: result.selectedId });
      deps.recordHistory(historyBefore, `${geometryInfo.kind} creation`);
      deps.renderList();
      deps.redraw();
      deps.focusMeasurementName(measurement.id);
      return true;
    }

    function handleMeasureClick(stackPoint, mode) {
      const draft = deps.state.circleArcDraft;
      const drawInfo = deps.placementPointInfo(stackPoint, { page: draft?.page || null });
      if (!drawInfo) return false;
      if (draft && drawInfo.page !== draft.page) {
        deps.showStatus('Finish this shape on the same page.', 2200);
        deps.redraw();
        return false;
      }
      deps.setContinuousCurrentPage(drawInfo.page);
      if (!draft) {
        deps.state.inProgress = null;
        deps.state.freehandDraft = null;
        deps.state.circleArcDraft = { mode, page: drawInfo.page, points: [drawInfo.point], activePath: deps.activePathForNewRun(), previewPoint: null };
        deps.redraw();
        return true;
      }
      draft.points.push(drawInfo.point);
      draft.previewPoint = null;
      if (draft.points.length >= requiredPointCount(draft.mode)) return finishMeasurement();
      deps.redraw();
      return true;
    }

    return {
      isDrawMode,
      measurementCanvasLabel,
      draftPromptModel,
      drawDraft,
      updatePreviewFromCursor,
      finishMeasurement,
      handleMeasureClick,
    };
  }

  window.TakeoffCircleArcTool = {
    isDrawMode,
    requiredPointCount,
    promptModel,
    geometryFromPoints,
    draftPoints,
    draftGeometry,
    createTool,
  };
})();
