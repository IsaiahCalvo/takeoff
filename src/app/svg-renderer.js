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
    const nearAnchor = activeAnchors.some(anchor => vectorLength({ x: point.x - anchor.x, y: point.y - anchor.y }) <= overlayPageSize(1));
    const maxOffset = nearAnchor
      ? Math.max(overlayPageSize(72), probeLayout.hitbox.width / 2 + overlayPageSize(30))
      : minOffset + overlayPageSize(2);
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
      group.appendChild(svgNode('rect', {
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
      group.appendChild(svgNode('rect', {
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
      group.appendChild(text);
    }

    function drawBezierSegments(segments, opts) {
      if (!segments || !segments.length) return;
      const group = svgNode('g');
      drawSvg.appendChild(group);
      const strokeWidth = overlayPageSize(opts.width || 2);
      const d = buildBezierPath(segments);
      const strokeAttrs = pathStrokeAttrs(opts, strokeWidth);
      const strokeColor = strokeAttrs.stroke || opts.color;
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

      const labelPoints = opts.labelPoints || geometry.flattenSegments(segments, 18);
      if (opts.label && labelPoints.length >= 2) {
        drawPathLabel(group, labelPoints, { ...opts, anchors });
      }
    }

    function drawEndpointAnchors(points, color) {
      if (!points || points.length < 1) return;
      const group = svgNode('g');
      drawSvg.appendChild(group);
      const endpoints = points.length === 1 ? [points[0]] : [points[0], points[points.length - 1]];
      const r = overlayPageSize(5);
      for (const point of endpoints) {
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

    function drawPolyline(points, opts) {
      if (!points || points.length < 1) return;
      const group = svgNode('g');
      drawSvg.appendChild(group);
      const strokeWidth = overlayPageSize(opts.width || 2);
      const strokeAttrs = pathStrokeAttrs(opts, strokeWidth);
      const strokeColor = strokeAttrs.stroke || opts.color;

      if (points.length >= 2) {
        const d = buildPolylinePath(points);
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
      drawPolyline,
    };
  }

  window.TakeoffSvgRenderer = {
    svgNode,
    buildPolylinePath,
    buildBezierPath,
    resolvePathLabelLayout,
    createMeasurementRenderer,
  };
})();
