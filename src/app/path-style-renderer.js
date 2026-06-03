(function () {
  const DEFAULT_PATH_STYLE = Object.freeze({
    stroke: Object.freeze({
      color: '#b6ff3c',
      style: 'solid',
      border: '#b6ff3c',
      borderMatchesFill: true,
    }),
    anchors: Object.freeze({
      fill: '#ffffff',
      border: '#b6ff3c',
      borderMatchesStroke: true,
    }),
  });

  const VALID_STROKE_STYLES = new Set(['solid', 'dashed', 'dotted']);
  const STROKE_PATTERNS = Object.freeze({
    solid: Object.freeze([]),
    dashed: Object.freeze([18, 13]),
    dotted: Object.freeze([1, 16]),
  });

  const PATH_STYLE_PREVIEW_GEOMETRY = Object.freeze({
    viewBox: '0 0 100 100',
    pathD: 'M18 74 C34 74 34 54 50 54 C66 54 66 26 82 26',
    pathStrokeWidth: 8,
    anchorRadius: 12,
    anchorStrokeWidth: 5,
    previewWidth: 100,
    previewHeight: 100,
    anchors: Object.freeze([
      Object.freeze({ cx: 18, cy: 74 }),
      Object.freeze({ cx: 82, cy: 26 }),
    ]),
  });

  const PATH_STYLE_DETAIL_PREVIEW_GEOMETRY = Object.freeze({
    viewBox: '-10 -42 190 170',
    pathD: 'M24 62 L70 28 L116 54 L166 18',
    pathStrokeWidth: 9,
    anchorRadius: 8,
    anchorStrokeWidth: 5,
    previewWidth: 190,
    previewHeight: 170,
    anchors: Object.freeze([
      Object.freeze({ cx: 24, cy: 62 }),
      Object.freeze({ cx: 70, cy: 28 }),
      Object.freeze({ cx: 116, cy: 54 }),
      Object.freeze({ cx: 166, cy: 18 }),
    ]),
  });

  function sourceObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function finitePositiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(3)));
  }

  function sanitizeColor(value, fallback = DEFAULT_PATH_STYLE.stroke.color) {
    if (typeof value !== 'string') return fallback;
    const text = value.trim().toLowerCase();
    return /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8})$/.test(text) ? text : fallback;
  }

  function normalizeStrokeStyle(value) {
    const style = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return VALID_STROKE_STYLES.has(style) ? style : DEFAULT_PATH_STYLE.stroke.style;
  }

  function normalizePathStyle(style = {}) {
    const source = sourceObject(style);
    const strokeSource = sourceObject(source.stroke);
    const stroke = {
      color: sanitizeColor(strokeSource.color, DEFAULT_PATH_STYLE.stroke.color),
      style: normalizeStrokeStyle(strokeSource.style),
    };
    const borderMatchesFill = typeof strokeSource.borderMatchesFill === 'boolean'
      ? strokeSource.borderMatchesFill
      : DEFAULT_PATH_STYLE.stroke.borderMatchesFill;
    stroke.border = borderMatchesFill
      ? stroke.color
      : sanitizeColor(strokeSource.border, stroke.color);
    stroke.borderMatchesFill = borderMatchesFill;
    const anchorSource = sourceObject(source.anchors);
    const borderMatchesStroke = typeof anchorSource.borderMatchesStroke === 'boolean'
      ? anchorSource.borderMatchesStroke
      : DEFAULT_PATH_STYLE.anchors.borderMatchesStroke;
    return {
      stroke,
      anchors: {
        fill: sanitizeColor(anchorSource.fill, DEFAULT_PATH_STYLE.anchors.fill),
        border: borderMatchesStroke
          ? stroke.color
          : sanitizeColor(anchorSource.border, stroke.color),
        borderMatchesStroke,
      },
    };
  }

  function strokeDasharrayForStyle(strokeStyle, dashScale = 1) {
    const pattern = STROKE_PATTERNS[normalizeStrokeStyle(strokeStyle)];
    if (!pattern.length) return null;
    const scale = finitePositiveNumber(dashScale, 1);
    return pattern.map(value => formatNumber(value * scale)).join(' ');
  }

  function pathStrokeAttributes(style = {}, options = {}) {
    const normalized = normalizePathStyle(style);
    const attrs = {
      fill: 'none',
      stroke: normalized.stroke.color,
      'stroke-width': finitePositiveNumber(options.strokeWidth, PATH_STYLE_PREVIEW_GEOMETRY.pathStrokeWidth),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    };
    const dasharray = strokeDasharrayForStyle(normalized.stroke.style, options.dashScale);
    if (dasharray) attrs['stroke-dasharray'] = dasharray;
    return attrs;
  }

  function pathBorderAttributes(style = {}, options = {}) {
    const normalized = normalizePathStyle(style);
    if (normalized.stroke.borderMatchesFill || normalized.stroke.border === normalized.stroke.color) return null;
    const strokeWidth = finitePositiveNumber(options.strokeWidth, PATH_STYLE_PREVIEW_GEOMETRY.pathStrokeWidth);
    const borderWidth = finitePositiveNumber(options.borderWidth, Math.max(2, strokeWidth * 0.35));
    const attrs = {
      fill: 'none',
      stroke: normalized.stroke.border,
      'stroke-width': strokeWidth + (borderWidth * 2),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    };
    const dasharray = strokeDasharrayForStyle(normalized.stroke.style, options.dashScale);
    if (dasharray) attrs['stroke-dasharray'] = dasharray;
    return attrs;
  }

  function anchorCircleAttributes(style = {}, options = {}) {
    const normalized = normalizePathStyle(style);
    return {
      r: finitePositiveNumber(options.radius, PATH_STYLE_PREVIEW_GEOMETRY.anchorRadius),
      fill: normalized.anchors.fill,
      stroke: normalized.anchors.border,
      'stroke-width': finitePositiveNumber(options.strokeWidth, PATH_STYLE_PREVIEW_GEOMETRY.anchorStrokeWidth),
    };
  }

  function getPreviewAttributesForGeometry(style = {}, geometry = PATH_STYLE_PREVIEW_GEOMETRY) {
    const normalized = normalizePathStyle(style);
    const path = {
      d: geometry.pathD,
      ...pathStrokeAttributes(normalized, {
        strokeWidth: geometry.pathStrokeWidth,
        dashScale: 1,
      }),
    };
    const borderAttrs = pathBorderAttributes(normalized, {
      strokeWidth: geometry.pathStrokeWidth,
      dashScale: 1,
    });
    const pathBorder = borderAttrs ? {
      d: geometry.pathD,
      ...borderAttrs,
    } : null;
    const anchorStyle = anchorCircleAttributes(normalized, {
      radius: geometry.anchorRadius,
      strokeWidth: geometry.anchorStrokeWidth,
    });
    return {
      style: normalized,
      svg: {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: geometry.viewBox,
        width: geometry.previewWidth,
        height: geometry.previewHeight,
        style: `width:${geometry.previewWidth}px;height:${geometry.previewHeight}px;display:block;overflow:visible`,
        'aria-hidden': 'true',
      },
      pathBorder,
      path,
      anchors: geometry.anchors.map(anchor => ({
        ...anchor,
        ...anchorStyle,
      })),
    };
  }

  function getPathStylePreviewAttributes(style = {}) {
    return getPreviewAttributesForGeometry(style, PATH_STYLE_PREVIEW_GEOMETRY);
  }

  function getPathStyleDetailPreviewAttributes(style = {}) {
    return getPreviewAttributesForGeometry(style, PATH_STYLE_DETAIL_PREVIEW_GEOMETRY);
  }

  function escapeText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttribute(value) {
    return escapeText(value).replace(/"/g, '&quot;');
  }

  function renderPreviewSvg(attrs, options = {}) {
    const label = typeof options.ariaLabel === 'string' ? options.ariaLabel.trim() : '';
    const aria = label
      ? `role="img" aria-label="${escapeAttribute(label)}"`
      : 'aria-hidden="true"';
    const dash = attrs.path['stroke-dasharray']
      ? ` stroke-dasharray="${attrs.path['stroke-dasharray']}"`
      : '';
    const path = `<path d="${attrs.path.d}" fill="${attrs.path.fill}" stroke="${attrs.path.stroke}" stroke-width="${attrs.path['stroke-width']}" stroke-linecap="${attrs.path['stroke-linecap']}" stroke-linejoin="${attrs.path['stroke-linejoin']}"${dash}/>`;
    const borderDash = attrs.pathBorder?.['stroke-dasharray']
      ? ` stroke-dasharray="${attrs.pathBorder['stroke-dasharray']}"`
      : '';
    const pathBorder = attrs.pathBorder
      ? `<path d="${attrs.pathBorder.d}" fill="${attrs.pathBorder.fill}" stroke="${attrs.pathBorder.stroke}" stroke-width="${attrs.pathBorder['stroke-width']}" stroke-linecap="${attrs.pathBorder['stroke-linecap']}" stroke-linejoin="${attrs.pathBorder['stroke-linejoin']}"${borderDash}/>`
      : '';
    const anchors = attrs.anchors
      .map(anchor => `<circle cx="${anchor.cx}" cy="${anchor.cy}" r="${anchor.r}" fill="${anchor.fill}" stroke="${anchor.stroke}" stroke-width="${anchor['stroke-width']}"/>`)
      .join('');
    return `<svg xmlns="${attrs.svg.xmlns}" viewBox="${attrs.svg.viewBox}" width="${attrs.svg.width}" height="${attrs.svg.height}" style="${attrs.svg.style}" ${aria}>${pathBorder}${path}${anchors}</svg>`;
  }

  function renderPathStylePreviewSvg(style = {}, options = {}) {
    return renderPreviewSvg(getPathStylePreviewAttributes(style), options);
  }

  function renderPathStyleDetailPreviewSvg(style = {}, options = {}) {
    return renderPreviewSvg(getPathStyleDetailPreviewAttributes(style), options);
  }

  window.TakeoffPathStyleRenderer = {
    DEFAULT_PATH_STYLE,
    PATH_STYLE_PREVIEW_GEOMETRY,
    PATH_STYLE_DETAIL_PREVIEW_GEOMETRY,
    sanitizeColor,
    normalizeStrokeStyle,
    normalizePathStyle,
    strokeDasharrayForStyle,
    pathStrokeAttributes,
    pathBorderAttributes,
    anchorCircleAttributes,
    getPathStylePreviewAttributes,
    getPathStyleDetailPreviewAttributes,
    renderPathStylePreviewSvg,
    renderPathStyleDetailPreviewSvg,
  };
})();
