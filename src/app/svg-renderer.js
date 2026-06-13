(function () {
  const pathStyleRenderer = window.TakeoffPathStyleRenderer;

  function svgNode(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value != null) el.setAttribute(key, String(value));
    }
    return el;
  }

  function htmlNode(tag, attrs = {}) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      el.setAttribute(key, String(value));
      if (tag === 'input' && key === 'value') el.value = String(value);
    }
    return el;
  }

  function buildPolylinePath(points) {
    return (points || []).map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  }

  function buildBezierPath(segments) {
    return (segments || []).map((segment, index) => {
      const start = `${index === 0 ? 'M' : 'L'} ${segment.from.x} ${segment.from.y}`;
      return `${start} C ${segment.c1.x} ${segment.c1.y} ${segment.c2.x} ${segment.c2.y} ${segment.to.x} ${segment.to.y}`;
    }).join(' ');
  }

  function closedPathData(d) {
    return d ? `${d} Z` : '';
  }

  function rectOverlapsPointClearance(rect, point, clearance) {
    return !(
      rect.x + rect.width <= point.x - clearance ||
      rect.x >= point.x + clearance ||
      rect.y + rect.height <= point.y - clearance ||
      rect.y >= point.y + clearance
    );
  }

  function labelLayoutFromCenter(lx, ly, metrics, overlayPageSize) {
    const { textWidth, fontSize, padX, padY, accentW } = metrics;
    const bx = lx - textWidth / 2 - padX - accentW / 2;
    const by = ly - fontSize / 2 - padY;
    const bw = textWidth + padX * 2 + accentW;
    const bh = fontSize + padY * 2;
    return {
      lx,
      ly,
      bx,
      by,
      bw,
      bh,
      hitbox: {
        x: bx - overlayPageSize(3),
        y: by - overlayPageSize(3),
        width: bw + overlayPageSize(6),
        height: bh + overlayPageSize(6),
      },
    };
  }

  function finitePoint(point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y);
  }

  function pointOnSegment(point, a, b, epsilon = 1e-7) {
    const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
    if (Math.abs(cross) > epsilon) return false;
    const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
    if (dot < -epsilon) return false;
    const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    return dot <= lenSq + epsilon;
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      if (pointOnSegment(point, a, b)) return true;
      const crosses = (a.y > point.y) !== (b.y > point.y);
      if (crosses) {
        const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
        if (point.x < x) inside = !inside;
      }
    }
    return inside;
  }

  function rectFromCenter(center, width, height) {
    return {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    };
  }

  function pointInRect(point, rect, epsilon = 1e-7) {
    return point.x >= rect.x - epsilon
      && point.x <= rect.x + rect.width + epsilon
      && point.y >= rect.y - epsilon
      && point.y <= rect.y + rect.height + epsilon;
  }

  function segmentOrientation(a, b, c) {
    const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    if (Math.abs(value) < 1e-7) return 0;
    return value > 0 ? 1 : 2;
  }

  function segmentsIntersect(a, b, c, d) {
    const o1 = segmentOrientation(a, b, c);
    const o2 = segmentOrientation(a, b, d);
    const o3 = segmentOrientation(c, d, a);
    const o4 = segmentOrientation(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    return (o1 === 0 && pointOnSegment(c, a, b))
      || (o2 === 0 && pointOnSegment(d, a, b))
      || (o3 === 0 && pointOnSegment(a, c, d))
      || (o4 === 0 && pointOnSegment(b, c, d));
  }

  function segmentIntersectsRect(a, b, rect) {
    if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];
    return corners.some((corner, index) => (
      segmentsIntersect(a, b, corner, corners[(index + 1) % corners.length])
    ));
  }

  function rectFitsInsidePolygon(rect, polygon) {
    const samples = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width / 2, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
      { x: rect.x + rect.width / 2, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height / 2 },
      { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    ];
    if (!samples.every(point => pointInPolygon(point, polygon))) return false;
    for (let i = 1; i < polygon.length; i++) {
      if (segmentIntersectsRect(polygon[i - 1], polygon[i], rect)) return false;
    }
    return true;
  }

  function pointsBounds(points) {
    if (!points.length) return null;
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    };
  }

  function areaLabelMetrics(label, fontSize, drawCtx) {
    if (drawCtx) drawCtx.font = `${800} ${fontSize}px 'JetBrains Mono', monospace`;
    const textWidth = drawCtx?.measureText ? drawCtx.measureText(label).width : label.length * fontSize * 0.62;
    return {
      fontSize,
      textWidth,
      strokeWidth: fontSize * (3 / 13),
    };
  }

  function areaLabelFitRect(center, metrics, clearance) {
    const visualPad = metrics.strokeWidth / 2 + clearance;
    return rectFromCenter(
      center,
      metrics.textWidth + visualPad * 2,
      metrics.fontSize + visualPad * 2
    );
  }

  function resolveAreaLabelLayout({ label, center, points = [], drawCtx, overlayPageSize }) {
    if (!label || !finitePoint(center)) return null;
    const baseFontSize = overlayPageSize(13);
    const clearance = overlayPageSize(3);
    const polygon = (points || []).filter(finitePoint);
    const baseMetrics = areaLabelMetrics(label, baseFontSize, drawCtx);
    if (polygon.length < 4) return { ...center, ...baseMetrics };

    function layoutAt(candidate, fontSize) {
      const metrics = areaLabelMetrics(label, fontSize, drawCtx);
      const fitRect = areaLabelFitRect(candidate, metrics, clearance);
      return rectFitsInsidePolygon(fitRect, polygon)
        ? { ...candidate, ...metrics }
        : null;
    }

    function bestLayoutAt(candidate) {
      if (!finitePoint(candidate) || !pointInPolygon(candidate, polygon)) return null;
      const baseLayout = layoutAt(candidate, baseFontSize);
      if (baseLayout) return baseLayout;
      let low = 0;
      let high = baseFontSize;
      let best = null;
      for (let step = 0; step < 20; step++) {
        const mid = (low + high) / 2;
        const layout = layoutAt(candidate, mid);
        if (layout) {
          best = layout;
          low = mid;
        } else {
          high = mid;
        }
      }
      return best && best.fontSize >= overlayPageSize(0.75) ? best : null;
    }

    const bounds = pointsBounds(polygon);
    const candidates = [];
    function addCandidate(candidate) {
      if (!finitePoint(candidate)) return;
      if (candidates.some(existing => Math.abs(existing.x - candidate.x) < 0.001 && Math.abs(existing.y - candidate.y) < 0.001)) return;
      candidates.push(candidate);
    }
    addCandidate(center);
    if (bounds) {
      addCandidate({ x: bounds.cx, y: bounds.cy });
      for (let ix = 1; ix < 6; ix++) {
        for (let iy = 1; iy < 6; iy++) {
          addCandidate({
            x: bounds.x + (bounds.width * ix) / 6,
            y: bounds.y + (bounds.height * iy) / 6,
          });
        }
      }
    }

    let best = null;
    for (const candidate of candidates) {
      const layout = bestLayoutAt(candidate);
      if (!layout) continue;
      const currentDistance = vectorLength({ x: layout.x - center.x, y: layout.y - center.y });
      const bestDistance = best ? vectorLength({ x: best.x - center.x, y: best.y - center.y }) : Infinity;
      if (!best
        || layout.fontSize > best.fontSize + 0.01
        || (Math.abs(layout.fontSize - best.fontSize) <= 0.01 && currentDistance < bestDistance)) {
        best = layout;
      }
    }
    return best;
  }

  function vectorLength(vector) {
    return Math.hypot(vector.x, vector.y);
  }

  function normalizeVector(vector, fallback = { x: 0, y: 1 }) {
    const length = vectorLength(vector);
    return length ? { x: vector.x / length, y: vector.y / length } : fallback;
  }

  function hasFiniteOffset(offset) {
    return !!(offset && Number.isFinite(offset.x) && Number.isFinite(offset.y));
  }

  function appendLengthLabelNav(group, layout, opts, overlayPageSize) {
    if (opts.measurementId == null) return;
    const size = overlayPageSize(18);
    const gap = overlayPageSize(4);
    const x = layout.bx + layout.bw + gap;
    const y = layout.by + (layout.bh - size) / 2;
    const iconScale = size / 12;
    const nav = svgNode('g', {
      class: `canvas-length-tag-nav${opts.labelNavVisible ? ' visible' : ''}`,
      'data-length-label-nav': 'true',
      'data-measurement-id': opts.measurementId,
      transform: `translate(${x} ${y})`,
    });
    nav.appendChild(svgNode('rect', {
      class: 'canvas-length-tag-nav-shell',
      x: 0,
      y: 0,
      width: size,
      height: size,
      rx: overlayPageSize(6),
      ry: overlayPageSize(6),
    }));
    nav.appendChild(svgNode('path', {
      class: 'canvas-length-tag-nav-icon',
      d: 'M4.5 3 7.5 6 4.5 9',
      transform: `scale(${iconScale})`,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': overlayPageSize(1.6) / iconScale,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }));
    group.appendChild(nav);
  }

  function clampOffset(offset, minDistance, maxDistance) {
    const length = vectorLength(offset);
    if (!length) return offset;
    const nextLength = Math.max(minDistance, Math.min(maxDistance, length));
    return {
      x: offset.x / length * nextLength,
      y: offset.y / length * nextLength,
    };
  }

  function layoutOverlapsAnchor(layout, anchor, clearance) {
    return rectOverlapsPointClearance(layout.hitbox, anchor, clearance);
  }

  function pushLayoutOutOfAnchors({ layout, point, metrics, anchors, clearance, maxDistance, overlayPageSize }) {
    let current = layout;
    for (let iteration = 0; iteration < 4; iteration++) {
      let changed = false;
      for (const anchor of anchors) {
        if (!layoutOverlapsAnchor(current, anchor, clearance)) continue;
        const currentCenter = { x: current.lx, y: current.ly };
        const fallback = normalizeVector({ x: currentCenter.x - point.x, y: currentCenter.y - point.y });
        const direction = normalizeVector({ x: currentCenter.x - anchor.x, y: currentCenter.y - anchor.y }, fallback);
        let high = Math.max(vectorLength({ x: currentCenter.x - anchor.x, y: currentCenter.y - anchor.y }), overlayPageSize(1));
        const limit = Math.max(maxDistance, current.hitbox.width + current.hitbox.height + clearance * 2);
        let clearLayout = null;
        while (high <= limit) {
          const candidate = labelLayoutFromCenter(anchor.x + direction.x * high, anchor.y + direction.y * high, metrics, overlayPageSize);
          if (!layoutOverlapsAnchor(candidate, anchor, clearance)) {
            clearLayout = candidate;
            break;
          }
          high += overlayPageSize(4);
        }
        if (!clearLayout) continue;
        let low = 0;
        for (let step = 0; step < 16; step++) {
          const mid = (low + high) / 2;
          const candidate = labelLayoutFromCenter(anchor.x + direction.x * mid, anchor.y + direction.y * mid, metrics, overlayPageSize);
          if (layoutOverlapsAnchor(candidate, anchor, clearance)) low = mid;
          else {
            high = mid;
            clearLayout = candidate;
          }
        }
        current = clearLayout;
        changed = true;
      }
      if (!changed) break;
    }
    return current;
  }

  function resolvePathLabelLayout({ labelPosition, labelOffset, label, anchors = [], drawCtx, overlayPageSize }) {
    const { point, angle } = labelPosition;
    const fontSize = overlayPageSize(13);
    drawCtx.font = `${700} ${fontSize}px 'JetBrains Mono', monospace`;
    const metrics = {
      textWidth: drawCtx.measureText(label).width,
      fontSize,
      padX: overlayPageSize(8),
      padY: overlayPageSize(4),
      accentW: overlayPageSize(3),
    };
    const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
    const baseOffset = overlayPageSize(18);
    const clearance = overlayPageSize(6);
    const activeAnchors = (anchors || []).filter(Boolean);
    const probeLayout = labelLayoutFromCenter(point.x, point.y, metrics, overlayPageSize);
    const minOffset = probeLayout.hitbox.height / 2 + clearance;
    const maxOffset = minOffset + overlayPageSize(2);
    const defaultOffset = { x: normal.x * baseOffset, y: normal.y * baseOffset };
    const requestedOffset = hasFiniteOffset(labelOffset) ? labelOffset : defaultOffset;
    const offset = clampOffset(
      vectorLength(requestedOffset) ? requestedOffset : defaultOffset,
      minOffset,
      maxOffset
    );
    const baseCenter = { x: point.x + offset.x, y: point.y + offset.y };

    function isClear(layout) {
      return activeAnchors.every(anchor => !rectOverlapsPointClearance(layout.hitbox, anchor, clearance));
    }

    const baseLayout = labelLayoutFromCenter(baseCenter.x, baseCenter.y, metrics, overlayPageSize);
    if (!activeAnchors.length || isClear(baseLayout)) return { ...baseLayout, ...metrics };
    const pushedLayout = pushLayoutOutOfAnchors({
      layout: baseLayout,
      point,
      metrics,
      anchors: activeAnchors,
      clearance,
      maxDistance: maxOffset,
      overlayPageSize,
    });
    return { ...pushedLayout, ...metrics };
  }

  function createMeasurementRenderer({ drawSvg, drawCtx, overlayPageSize }) {
    function pathStrokeAttrs(opts, strokeWidth) {
      if (opts.pathStyle && pathStyleRenderer?.pathStrokeAttributes) {
        return pathStyleRenderer.pathStrokeAttributes(opts.pathStyle, {
          strokeWidth,
          dashScale: overlayPageSize(1),
        });
      }
      return {
        fill: 'none',
        stroke: opts.color,
        'stroke-width': strokeWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': opts.dashed ? `${overlayPageSize(8)} ${overlayPageSize(6)}` : null,
      };
    }

    function pathBorderAttrs(opts, strokeWidth) {
      if (opts.pathStyle && pathStyleRenderer?.pathBorderAttributes) {
        return pathStyleRenderer.pathBorderAttributes(opts.pathStyle, {
          strokeWidth,
          borderWidth: overlayPageSize(1),
          dashScale: overlayPageSize(1),
        });
      }
      return null;
    }

    function anchorCircleAttrs(opts, radius) {
      if (opts.pathStyle && pathStyleRenderer?.anchorCircleAttributes) {
        return pathStyleRenderer.anchorCircleAttributes(opts.pathStyle, {
          radius,
          strokeWidth: overlayPageSize(2),
        });
      }
      return {
        r: radius,
        fill: opts.emphasizeDots ? opts.color : '#0b0d0e',
        stroke: opts.emphasizeDots ? '#0b0d0e' : opts.color,
        'stroke-width': overlayPageSize(2),
      };
    }

    const geometry = window.TakeoffGeometry;
    const measurements = window.TakeoffMeasurements;

    function drawAreaOverlay(group, d, points, opts, fillColor) {
      if (!opts.areaLabel || !d) return;
      const center = opts.areaCenter || geometry.pointsBounds(points || []);
      const labelPoint = center && Number.isFinite(center.cx)
        ? { x: center.cx, y: center.cy }
        : center;
      if (!labelPoint) return;
      const labelLayout = resolveAreaLabelLayout({
        label: opts.areaLabel,
        center: labelPoint,
        points,
        drawCtx,
        overlayPageSize,
      });
      const areaGroup = svgNode('g', { class: 'canvas-area-overlay' });
      group.appendChild(areaGroup);
      areaGroup.appendChild(svgNode('path', {
        d: closedPathData(d),
        fill: fillColor,
        stroke: 'none',
        opacity: '0.18',
      }));
      if (!labelLayout) return;
      const text = svgNode('text', {
        x: labelLayout.x,
        y: labelLayout.y,
        fill: '#f7fbfc',
        stroke: 'rgba(11,13,14,0.82)',
        'stroke-width': labelLayout.strokeWidth,
        'paint-order': 'stroke fill',
        'font-family': "'JetBrains Mono', monospace",
        'font-size': labelLayout.fontSize,
        'font-weight': 800,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
      text.textContent = opts.areaLabel;
      areaGroup.appendChild(text);
    }

    function drawPathLabel(group, points, opts) {
      const labelPosition = geometry.pointAtPolylineT(points, opts.labelT);
      if (!labelPosition) return;
      const layout = resolvePathLabelLayout({
        labelPosition,
        labelOffset: opts.labelOffset,
        label: opts.label,
        anchors: opts.anchors,
        drawCtx,
        overlayPageSize,
      });
      const { lx, ly, bx, by, bw, bh, fontSize, accentW } = layout;
      if (opts.measurementId != null && opts.labelHitboxes) {
        opts.labelHitboxes.push({
          measurementId: opts.measurementId,
          ...layout.hitbox,
        });
      }
      const labelEdit = opts.labelEdit?.active ? opts.labelEdit : null;
      if (labelEdit) {
        const foreignObject = svgNode('foreignObject', {
          x: bx,
          y: by,
          width: bw,
          height: bh,
          class: 'canvas-length-tag-editor',
          'data-measurement-id': opts.measurementId,
        });
        const wrapper = htmlNode('div', {
          class: `canvas-length-tag-edit${labelEdit.invalid ? ' invalid' : ''}`,
          style: [
            `--length-tag-color:${opts.labelColor}`,
            `--length-tag-font-size:${fontSize}px`,
            `--length-tag-accent-width:${accentW}px`,
          ].join(';'),
        });
        const input = htmlNode('input', {
          id: 'canvasLengthEditInput',
          class: 'canvas-length-tag-input',
          type: 'text',
          inputmode: 'decimal',
          autocomplete: 'off',
          'aria-label': 'Length',
          value: labelEdit.value,
        });
        const unit = htmlNode('span', {
          class: 'canvas-length-tag-unit',
          'aria-hidden': 'true',
        });
        unit.textContent = labelEdit.unit || '';
        const error = htmlNode('span', {
          id: 'canvasLengthEditError',
          class: 'canvas-length-edit-error',
          role: 'alert',
          hidden: '',
        });
        wrapper.appendChild(input);
        wrapper.appendChild(unit);
        wrapper.appendChild(error);
        foreignObject.appendChild(wrapper);
        group.appendChild(foreignObject);
        return;
      }
      const labelGroup = svgNode('g', {
        class: 'canvas-length-tag',
        'data-measurement-id': opts.measurementId,
      });
      group.appendChild(labelGroup);
      labelGroup.appendChild(svgNode('rect', {
        class: 'canvas-length-tag-hit',
        x: layout.hitbox.x,
        y: layout.hitbox.y,
        width: layout.hitbox.width,
        height: layout.hitbox.height,
      }));
      labelGroup.appendChild(svgNode('rect', {
        class: 'canvas-length-tag-body',
        x: bx,
        y: by,
        width: bw,
        height: bh,
        rx: overlayPageSize(5),
        ry: overlayPageSize(5),
        fill: 'rgba(11,13,14,0.96)',
        stroke: opts.labelColor,
        'stroke-width': overlayPageSize(1.25),
      }));
      labelGroup.appendChild(svgNode('rect', {
        class: 'canvas-length-tag-accent',
        x: bx + overlayPageSize(4),
        y: by + overlayPageSize(4),
        width: accentW,
        height: bh - overlayPageSize(8),
        rx: overlayPageSize(1.5),
        ry: overlayPageSize(1.5),
        fill: opts.labelColor,
        stroke: 'none',
      }));
      const text = svgNode('text', {
        x: lx + accentW / 2,
        y: ly,
        fill: '#f7fbfc',
        stroke: 'none',
        'font-family': "'JetBrains Mono', monospace",
        'font-size': fontSize,
        'font-weight': 700,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
      text.textContent = opts.label;
      labelGroup.appendChild(text);
      appendLengthLabelNav(labelGroup, layout, opts, overlayPageSize);
    }

    function drawBezierSegments(segments, opts) {
      if (!segments || !segments.length) return;
      const group = svgNode('g');
      drawSvg.appendChild(group);
      const strokeWidth = overlayPageSize(opts.width || 2);
      const d = buildBezierPath(segments);
      const strokeAttrs = pathStrokeAttrs(opts, strokeWidth);
      const borderAttrs = pathBorderAttrs(opts, strokeWidth);
      const strokeColor = strokeAttrs.stroke || opts.color;
      const labelPoints = opts.labelPoints || geometry.flattenSegments(segments, 18);
      drawAreaOverlay(group, d, labelPoints, opts, strokeColor);
      if (opts.glow) {
        group.appendChild(svgNode('path', {
          d,
          fill: 'none',
          stroke: strokeColor,
          'stroke-width': strokeWidth + overlayPageSize(8),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          opacity: '0.18',
        }));
      }
      if (borderAttrs) {
        group.appendChild(svgNode('path', {
          d,
          ...borderAttrs,
        }));
      }
      group.appendChild(svgNode('path', {
        d,
        ...strokeAttrs,
      }));

      const anchors = measurements.anchorsFromSegments(segments);
      if (opts.dots) {
        const r = overlayPageSize(opts.emphasizeDots ? 6 : 4);
        const anchorAttrs = anchorCircleAttrs(opts, r);
        for (const point of anchors) {
          group.appendChild(svgNode('circle', {
            cx: point.x,
            cy: point.y,
            ...anchorAttrs,
          }));
        }
      }

      if (opts.showControls) {
        const handleR = overlayPageSize(4);
        for (const segment of segments) {
          group.appendChild(svgNode('line', {
            x1: segment.from.x,
            y1: segment.from.y,
            x2: segment.c1.x,
            y2: segment.c1.y,
            stroke: strokeColor,
            'stroke-width': overlayPageSize(1),
            'stroke-dasharray': `${overlayPageSize(4)} ${overlayPageSize(4)}`,
            opacity: '0.72',
          }));
          group.appendChild(svgNode('line', {
            x1: segment.to.x,
            y1: segment.to.y,
            x2: segment.c2.x,
            y2: segment.c2.y,
            stroke: strokeColor,
            'stroke-width': overlayPageSize(1),
            'stroke-dasharray': `${overlayPageSize(4)} ${overlayPageSize(4)}`,
            opacity: '0.72',
          }));
          for (const point of [segment.c1, segment.c2]) {
            group.appendChild(svgNode('circle', {
              cx: point.x,
              cy: point.y,
              r: handleR,
              fill: '#111619',
              stroke: strokeColor,
              'stroke-width': overlayPageSize(1.6),
            }));
          }
        }
      }

      if (opts.label && labelPoints.length >= 2) {
        drawPathLabel(group, labelPoints, { ...opts, anchors });
      }
    }

    function drawEndpointAnchors(points, color) {
      if (!points || points.length < 1) return;
      const group = svgNode('g');
      drawSvg.appendChild(group);
      const r = overlayPageSize(5);
      for (const point of points) {
        group.appendChild(svgNode('circle', {
          cx: point.x,
          cy: point.y,
          r,
          fill: '#0b0d0e',
          stroke: color,
          'stroke-width': overlayPageSize(2),
        }));
      }
    }

    function drawMixedPath(sources, opts) {
      if (!sources || !sources.length) return;
      const group = svgNode('g');
      drawSvg.appendChild(group);
      const strokeWidth = overlayPageSize(opts.width || 2);
      const strokeAttrs = pathStrokeAttrs(opts, strokeWidth);
      const borderAttrs = pathBorderAttrs(opts, strokeWidth);
      const strokeColor = strokeAttrs.stroke || opts.color;
      const areaPoints = opts.areaPoints || opts.labelPoints || [];
      drawAreaOverlay(group, buildPolylinePath(areaPoints), areaPoints, opts, strokeColor);

      for (const source of sources) {
        const current = source?.current || {};
        const d = source?.kind === 'freehand' && current.segments?.length
          ? buildBezierPath(current.segments)
          : buildPolylinePath(current.points || []);
        if (!d) continue;
        if (opts.glow) {
          group.appendChild(svgNode('path', {
            d,
            fill: 'none',
            stroke: strokeColor,
            'stroke-width': strokeWidth + overlayPageSize(8),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            opacity: '0.18',
          }));
        }
        if (borderAttrs) {
          group.appendChild(svgNode('path', {
            d,
            ...borderAttrs,
          }));
        }
        group.appendChild(svgNode('path', {
          d,
          ...strokeAttrs,
        }));
      }

      const anchors = opts.anchorPoints || [];
      if (opts.dots && anchors.length) {
        const r = overlayPageSize(opts.emphasizeDots ? 6 : 4);
        const anchorAttrs = anchorCircleAttrs(opts, r);
        for (const point of anchors) {
          group.appendChild(svgNode('circle', {
            cx: point.x,
            cy: point.y,
            ...anchorAttrs,
          }));
        }
      }

      const labelPoints = opts.labelPoints || [];
      if (opts.label && labelPoints.length >= 2) {
        drawPathLabel(group, labelPoints, { ...opts, anchors });
      }
    }

    function drawSnapFeedback(snap) {
      if (!snap?.point) return;
      const kind = snap.kind === 'centerline' ? 'centerline' : 'anchor';
      const group = svgNode('g', { class: `snap-feedback ${kind}` });
      drawSvg.appendChild(group);
      const r = overlayPageSize(kind === 'anchor' ? 7 : 5);
      const color = kind === 'anchor' ? '#f7fbfc' : '#4cd6ff';
      group.appendChild(svgNode('circle', {
        cx: snap.point.x,
        cy: snap.point.y,
        r,
        fill: 'rgba(11,13,14,0.36)',
        stroke: color,
        'stroke-width': overlayPageSize(2),
      }));
      group.appendChild(svgNode('circle', {
        cx: snap.point.x,
        cy: snap.point.y,
        r: overlayPageSize(2),
        fill: color,
        stroke: 'none',
      }));
    }

    function drawPolyline(points, opts) {
      if (!points || points.length < 1) return;
      const group = svgNode('g');
      drawSvg.appendChild(group);
      const strokeWidth = overlayPageSize(opts.width || 2);
      const strokeAttrs = pathStrokeAttrs(opts, strokeWidth);
      const borderAttrs = pathBorderAttrs(opts, strokeWidth);
      const strokeColor = strokeAttrs.stroke || opts.color;

      if (points.length >= 2) {
        const d = buildPolylinePath(points);
        drawAreaOverlay(group, d, points, opts, strokeColor);
        if (opts.glow) {
          group.appendChild(svgNode('path', {
            d,
            fill: 'none',
            stroke: strokeColor,
            'stroke-width': strokeWidth + overlayPageSize(8),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            opacity: '0.18',
          }));
        }
        if (borderAttrs) {
          group.appendChild(svgNode('path', {
            d,
            ...borderAttrs,
          }));
        }
        group.appendChild(svgNode('path', {
          d,
          ...strokeAttrs,
        }));
      }

      if (opts.dots) {
        const r = overlayPageSize(opts.emphasizeDots ? 6 : 4);
        const anchorAttrs = anchorCircleAttrs(opts, r);
        for (const point of points) {
          group.appendChild(svgNode('circle', {
            cx: point.x,
            cy: point.y,
            ...anchorAttrs,
          }));
        }
      }

      if (opts.label && points.length >= 2) {
        drawPathLabel(group, points, { ...opts, anchors: points });
      }
    }

    return {
      drawBezierSegments,
      drawEndpointAnchors,
      drawMixedPath,
      drawPolyline,
      drawSnapFeedback,
    };
  }

  window.TakeoffSvgRenderer = {
    svgNode,
    buildPolylinePath,
    buildBezierPath,
    closedPathData,
    resolvePathLabelLayout,
    resolveAreaLabelLayout,
    createMeasurementRenderer,
  };
})();
