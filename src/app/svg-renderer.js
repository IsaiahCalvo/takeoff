(function () {
  function svgNode(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value != null) el.setAttribute(key, String(value));
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

  function resolvePathLabelLayout({ labelPosition, label, anchors = [], drawCtx, overlayPageSize }) {
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
    const tangent = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
    const baseOffset = overlayPageSize(18);
    const baseCenter = {
      x: point.x + normal.x * baseOffset,
      y: point.y + normal.y * baseOffset,
    };
    const clearance = overlayPageSize(12);
    const activeAnchors = (anchors || []).filter(Boolean);

    function isClear(layout) {
      return activeAnchors.every(anchor => !rectOverlapsPointClearance(layout.hitbox, anchor, clearance));
    }

    const baseLayout = labelLayoutFromCenter(baseCenter.x, baseCenter.y, metrics, overlayPageSize);
    if (!activeAnchors.length || isClear(baseLayout)) return { ...baseLayout, ...metrics };

    const halfWidth = baseLayout.hitbox.width / 2;
    const halfHeight = baseLayout.hitbox.height / 2;
    const normalDistances = [
      baseOffset,
      halfHeight + clearance,
      halfHeight + clearance + overlayPageSize(12),
      halfHeight + clearance + overlayPageSize(28),
      halfHeight + clearance + overlayPageSize(52),
      halfHeight + clearance + overlayPageSize(84),
    ];
    const alongDistances = [
      0,
      halfWidth / 2 + clearance,
      -(halfWidth / 2 + clearance),
      halfWidth + clearance,
      -(halfWidth + clearance),
    ];
    const candidates = [baseLayout];
    for (const normalSign of [1, -1]) {
      for (const normalDistance of normalDistances) {
        for (const alongDistance of alongDistances) {
          const lx = point.x + normal.x * normalSign * normalDistance + tangent.x * alongDistance;
          const ly = point.y + normal.y * normalSign * normalDistance + tangent.y * alongDistance;
          candidates.push(labelLayoutFromCenter(lx, ly, metrics, overlayPageSize));
        }
      }
    }

    const clearCandidates = candidates.filter(isClear);
    if (clearCandidates.length) {
      clearCandidates.sort((a, b) => {
        const aScore = (a.lx - baseCenter.x) ** 2 + (a.ly - baseCenter.y) ** 2;
        const bScore = (b.lx - baseCenter.x) ** 2 + (b.ly - baseCenter.y) ** 2;
        return aScore - bScore;
      });
      return { ...clearCandidates[0], ...metrics };
    }

    for (let radius = halfWidth + halfHeight + clearance; radius <= overlayPageSize(420); radius += overlayPageSize(28)) {
      const radialCandidates = [];
      for (let step = 0; step < 16; step++) {
        const theta = step * Math.PI / 8;
        radialCandidates.push(labelLayoutFromCenter(
          point.x + Math.cos(theta) * radius,
          point.y + Math.sin(theta) * radius,
          metrics,
          overlayPageSize
        ));
      }
      const clearRadial = radialCandidates.filter(isClear);
      if (clearRadial.length) {
        clearRadial.sort((a, b) => {
          const aScore = (a.lx - baseCenter.x) ** 2 + (a.ly - baseCenter.y) ** 2;
          const bScore = (b.lx - baseCenter.x) ** 2 + (b.ly - baseCenter.y) ** 2;
          return aScore - bScore;
        });
        return { ...clearRadial[0], ...metrics };
      }
    }

    return { ...baseLayout, ...metrics };
  }

  function createMeasurementRenderer({ drawSvg, drawCtx, overlayPageSize }) {
    const geometry = window.TakeoffGeometry;
    const measurements = window.TakeoffMeasurements;

    function drawPathLabel(group, points, opts) {
      const labelPosition = geometry.pointAtPolylineT(points, opts.labelT);
      if (!labelPosition) return;
      const layout = resolvePathLabelLayout({
        labelPosition,
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
      if (opts.glow) {
        group.appendChild(svgNode('path', {
          d,
          fill: 'none',
          stroke: opts.color,
          'stroke-width': strokeWidth + overlayPageSize(8),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          opacity: '0.18',
        }));
      }
      group.appendChild(svgNode('path', {
        d,
        fill: 'none',
        stroke: opts.color,
        'stroke-width': strokeWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': opts.dashed ? `${overlayPageSize(8)} ${overlayPageSize(6)}` : null,
      }));

      const anchors = measurements.anchorsFromSegments(segments);
      if (opts.dots) {
        const r = overlayPageSize(opts.emphasizeDots ? 6 : 4);
        for (const point of anchors) {
          group.appendChild(svgNode('circle', {
            cx: point.x,
            cy: point.y,
            r,
            fill: opts.emphasizeDots ? opts.color : '#0b0d0e',
            stroke: opts.emphasizeDots ? '#0b0d0e' : opts.color,
            'stroke-width': overlayPageSize(2),
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
            stroke: opts.color,
            'stroke-width': overlayPageSize(1),
            'stroke-dasharray': `${overlayPageSize(4)} ${overlayPageSize(4)}`,
            opacity: '0.72',
          }));
          group.appendChild(svgNode('line', {
            x1: segment.to.x,
            y1: segment.to.y,
            x2: segment.c2.x,
            y2: segment.c2.y,
            stroke: opts.color,
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
              stroke: opts.color,
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

      if (points.length >= 2) {
        const d = buildPolylinePath(points);
        if (opts.glow) {
          group.appendChild(svgNode('path', {
            d,
            fill: 'none',
            stroke: opts.color,
            'stroke-width': strokeWidth + overlayPageSize(8),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            opacity: '0.18',
          }));
        }
        group.appendChild(svgNode('path', {
          d,
          fill: 'none',
          stroke: opts.color,
          'stroke-width': strokeWidth,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-dasharray': opts.dashed ? `${overlayPageSize(8)} ${overlayPageSize(6)}` : null,
        }));
      }

      if (opts.dots) {
        const r = overlayPageSize(opts.emphasizeDots ? 6 : 4);
        for (const point of points) {
          if (opts.emphasizeDots) {
            group.appendChild(svgNode('circle', {
              cx: point.x,
              cy: point.y,
              r,
              fill: opts.color,
              stroke: '#0b0d0e',
              'stroke-width': overlayPageSize(2),
            }));
          } else {
            group.appendChild(svgNode('circle', {
              cx: point.x,
              cy: point.y,
              r,
              fill: '#0b0d0e',
              stroke: opts.color,
              'stroke-width': overlayPageSize(2),
            }));
          }
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
