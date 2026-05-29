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

  function createMeasurementRenderer({ drawSvg, drawCtx, overlayPageSize }) {
    const geometry = window.TakeoffGeometry;
    const measurements = window.TakeoffMeasurements;

    function drawPathLabel(group, points, opts) {
      const labelPosition = geometry.pointAtPolylineT(points, opts.labelT);
      if (!labelPosition) return;
      const { point, angle } = labelPosition;
      const lx = point.x - Math.sin(angle) * overlayPageSize(18);
      const ly = point.y + Math.cos(angle) * overlayPageSize(18);
      const fontSize = overlayPageSize(13);
      drawCtx.font = `${700} ${fontSize}px 'JetBrains Mono', monospace`;
      const tw = drawCtx.measureText(opts.label).width;
      const padX = overlayPageSize(8);
      const padY = overlayPageSize(4);
      const accentW = overlayPageSize(3);
      const bx = lx - tw / 2 - padX - accentW / 2;
      const by = ly - fontSize / 2 - padY;
      const bw = tw + padX * 2 + accentW;
      const bh = fontSize + padY * 2;
      if (opts.measurementId != null && opts.labelHitboxes) {
        opts.labelHitboxes.push({
          measurementId: opts.measurementId,
          x: bx - overlayPageSize(3),
          y: by - overlayPageSize(3),
          width: bw + overlayPageSize(6),
          height: bh + overlayPageSize(6),
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
        drawPathLabel(group, labelPoints, opts);
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
        drawPathLabel(group, points, opts);
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
    createMeasurementRenderer,
  };
})();
