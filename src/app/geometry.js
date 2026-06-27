(function () {
  const TAU = Math.PI * 2;
  const GEOMETRY_EPSILON = 1e-9;

  function distancePx(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function polylineLengthPx(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += distancePx(points[i - 1], points[i]);
    return d;
  }

  function cubicPoint(seg, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return {
      x: mt2 * mt * seg.from.x + 3 * mt2 * t * seg.c1.x + 3 * mt * t2 * seg.c2.x + t2 * t * seg.to.x,
      y: mt2 * mt * seg.from.y + 3 * mt2 * t * seg.c1.y + 3 * mt * t2 * seg.c2.y + t2 * t * seg.to.y,
    };
  }

  function flattenSegments(segments, steps = 20) {
    const points = [];
    for (const seg of segments || []) {
      if (seg.type === 'line') {
        if (!points.length) points.push(seg.from);
        points.push(seg.to);
        continue;
      }
      for (let i = 0; i <= steps; i++) {
        if (points.length && i === 0) continue;
        points.push(cubicPoint(seg, i / steps));
      }
    }
    return points;
  }

  function simpsonSample(fn, a, b) {
    const c = (a + b) / 2;
    return (b - a) * (fn(a) + 4 * fn(c) + fn(b)) / 6;
  }

  function adaptiveSimpson(fn, a, b, epsilon, whole, depth) {
    const c = (a + b) / 2;
    const left = simpsonSample(fn, a, c);
    const right = simpsonSample(fn, c, b);
    const delta = left + right - whole;
    if (depth <= 0 || Math.abs(delta) <= 15 * epsilon) {
      return left + right + delta / 15;
    }
    return adaptiveSimpson(fn, a, c, epsilon / 2, left, depth - 1)
      + adaptiveSimpson(fn, c, b, epsilon / 2, right, depth - 1);
  }

  function cubicLengthPx(seg) {
    if (!seg) return 0;
    if (seg.type === 'line') return distancePx(seg.from, seg.to);
    const controlNetLength = distancePx(seg.from, seg.c1) + distancePx(seg.c1, seg.c2) + distancePx(seg.c2, seg.to);
    if (!controlNetLength) return 0;
    const curve = [seg.from, seg.c1, seg.c2, seg.to];
    const speed = t => {
      const derivative = cubicDerivative(curve, t);
      const value = vectorLen(derivative);
      return Number.isFinite(value) ? value : 0;
    };
    const tolerance = Math.max(0.0001, controlNetLength * 1e-8);
    const whole = simpsonSample(speed, 0, 1);
    return adaptiveSimpson(speed, 0, 1, tolerance, whole, 18);
  }

  function pointToLineDistance(p, a, b) {
    const length = distancePx(a, b);
    if (!length) return distancePx(p, a);
    return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length;
  }

  function cubicFlatnessPx(seg) {
    return Math.max(
      pointToLineDistance(seg.c1, seg.from, seg.to),
      pointToLineDistance(seg.c2, seg.from, seg.to),
    );
  }

  function appendAdaptiveCubicPoints(points, seg, tolerance, depth) {
    if (depth <= 0 || cubicFlatnessPx(seg) <= tolerance) {
      points.push(seg.to);
      return;
    }
    const [left, right] = splitCubicSegment(seg, 0.5);
    appendAdaptiveCubicPoints(points, left, tolerance, depth - 1);
    appendAdaptiveCubicPoints(points, right, tolerance, depth - 1);
  }

  function flattenSegmentsAdaptive(segments, tolerance = 0.25, maxDepth = 12) {
    const points = [];
    const flatnessTolerance = Math.max(0.01, Number.isFinite(tolerance) ? tolerance : 0.25);
    for (const seg of segments || []) {
      if (seg.type === 'line') {
        if (!points.length) points.push(seg.from);
        points.push(seg.to);
        continue;
      }
      if (!points.length) points.push(seg.from);
      appendAdaptiveCubicPoints(points, seg, flatnessTolerance, maxDepth);
    }
    return points;
  }

  function vectorAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function vectorSub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function vectorScale(v, s) { return { x: v.x * s, y: v.y * s }; }
  function vectorDot(a, b) { return a.x * b.x + a.y * b.y; }
  function vectorLen(v) { return Math.hypot(v.x, v.y); }

  function vectorNormalize(v) {
    const len = vectorLen(v);
    return len ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
  }

  function fitCurve(points, maxError) {
    if (points.length < 2) return [];
    const leftTangent = vectorNormalize(vectorSub(points[1], points[0]));
    const rightTangent = vectorNormalize(vectorSub(points[points.length - 2], points[points.length - 1]));
    return fitCubic(points, leftTangent, rightTangent, maxError);
  }

  function fitCubic(points, leftTangent, rightTangent, error) {
    if (points.length === 2) {
      const dist = distancePx(points[0], points[1]) / 3;
      return [[
        points[0],
        vectorAdd(points[0], vectorScale(leftTangent, dist)),
        vectorAdd(points[1], vectorScale(rightTangent, dist)),
        points[1],
      ]];
    }
    let u = chordLengthParameterize(points);
    let curve = generateBezier(points, u, leftTangent, rightTangent);
    let max = computeMaxError(points, curve, u);
    if (max.error < error) return [curve];
    if (max.error < error * error) {
      for (let i = 0; i < 4; i++) {
        u = reparameterize(points, curve, u);
        curve = generateBezier(points, u, leftTangent, rightTangent);
        max = computeMaxError(points, curve, u);
        if (max.error < error) return [curve];
      }
    }
    const split = Math.max(1, Math.min(points.length - 2, max.index));
    const centerTangent = vectorNormalize(vectorSub(points[split - 1], points[split + 1]));
    return [
      ...fitCubic(points.slice(0, split + 1), leftTangent, centerTangent, error),
      ...fitCubic(points.slice(split), vectorScale(centerTangent, -1), rightTangent, error),
    ];
  }

  function chordLengthParameterize(points) {
    const u = [0];
    for (let i = 1; i < points.length; i++) u[i] = u[i - 1] + distancePx(points[i], points[i - 1]);
    const total = u[u.length - 1] || 1;
    return u.map(v => v / total);
  }

  function bernsteinBasis(t) {
    const mt = 1 - t;
    return [mt * mt * mt, 3 * t * mt * mt, 3 * t * t * mt, t * t * t];
  }

  function generateBezier(points, uPrime, leftTangent, rightTangent) {
    const first = points[0];
    const last = points[points.length - 1];
    const C = [[0, 0], [0, 0]];
    const X = [0, 0];
    for (let i = 0; i < points.length; i++) {
      const u = uPrime[i];
      const b = bernsteinBasis(u);
      const a1 = vectorScale(leftTangent, b[1]);
      const a2 = vectorScale(rightTangent, b[2]);
      C[0][0] += vectorDot(a1, a1);
      C[0][1] += vectorDot(a1, a2);
      C[1][0] = C[0][1];
      C[1][1] += vectorDot(a2, a2);
      const tmp = vectorSub(points[i], vectorAdd(vectorScale(first, b[0] + b[1]), vectorScale(last, b[2] + b[3])));
      X[0] += vectorDot(a1, tmp);
      X[1] += vectorDot(a2, tmp);
    }
    const detC0C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
    const detC0X = C[0][0] * X[1] - C[1][0] * X[0];
    const detXC1 = X[0] * C[1][1] - X[1] * C[0][1];
    let alphaL = detC0C1 === 0 ? 0 : detXC1 / detC0C1;
    let alphaR = detC0C1 === 0 ? 0 : detC0X / detC0C1;
    const segLength = distancePx(first, last);
    const epsilon = 1e-6 * segLength;
    if (alphaL < epsilon || alphaR < epsilon) {
      alphaL = segLength / 3;
      alphaR = segLength / 3;
    }
    const maxAlpha = Math.max(segLength, 1);
    alphaL = Math.min(alphaL, maxAlpha);
    alphaR = Math.min(alphaR, maxAlpha);
    return [
      first,
      vectorAdd(first, vectorScale(leftTangent, alphaL)),
      vectorAdd(last, vectorScale(rightTangent, alphaR)),
      last,
    ];
  }

  function evaluateCubic(curve, t) {
    return cubicPoint({ from: curve[0], c1: curve[1], c2: curve[2], to: curve[3] }, t);
  }

  function cubicDerivative(curve, t) {
    const mt = 1 - t;
    return vectorAdd(
      vectorAdd(vectorScale(vectorSub(curve[1], curve[0]), 3 * mt * mt), vectorScale(vectorSub(curve[2], curve[1]), 6 * mt * t)),
      vectorScale(vectorSub(curve[3], curve[2]), 3 * t * t)
    );
  }

  function cubicSecondDerivative(curve, t) {
    return vectorAdd(
      vectorScale(vectorAdd(vectorSub(curve[2], vectorScale(curve[1], 2)), curve[0]), 6 * (1 - t)),
      vectorScale(vectorAdd(vectorSub(curve[3], vectorScale(curve[2], 2)), curve[1]), 6 * t)
    );
  }

  function reparameterize(points, curve, u) {
    return u.map((value, i) => newtonRaphsonRootFind(curve, points[i], value));
  }

  function newtonRaphsonRootFind(curve, point, u) {
    const q = evaluateCubic(curve, u);
    const q1 = cubicDerivative(curve, u);
    const q2 = cubicSecondDerivative(curve, u);
    const diff = vectorSub(q, point);
    const numerator = vectorDot(diff, q1);
    const denominator = vectorDot(q1, q1) + vectorDot(diff, q2);
    if (!denominator) return u;
    return Math.max(0, Math.min(1, u - numerator / denominator));
  }

  function computeMaxError(points, curve, u) {
    let index = Math.floor(points.length / 2);
    let maxDist = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const p = evaluateCubic(curve, u[i]);
      const dist = distancePx(p, points[i]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    return { error: maxDist, index };
  }

  function normalizeDegrees(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return ((n % 360) + 360) % 360;
  }

  function normalizeRadians(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return ((n % TAU) + TAU) % TAU;
  }

  function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
  }

  function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  function snapDegrees15(value) {
    return normalizeDegrees(Math.round(value / 15) * 15);
  }

  function angleDegFromCenter(center, p) {
    return Math.atan2(p.y - center.y, p.x - center.x) * 180 / Math.PI;
  }

  function angleRadFromCenter(center, p) {
    return Math.atan2(p.y - center.y, p.x - center.x);
  }

  function finitePoint(point) {
    return !!(point && Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  function clonePoint(point) {
    return { x: point.x, y: point.y };
  }

  function finitePositiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > GEOMETRY_EPSILON ? number : null;
  }

  function circleFromCenterRadius(center, radiusOrPoint) {
    if (!finitePoint(center)) return null;
    const radius = finitePoint(radiusOrPoint)
      ? distancePx(center, radiusOrPoint)
      : finitePositiveNumber(radiusOrPoint);
    if (!Number.isFinite(radius) || radius <= GEOMETRY_EPSILON) return null;
    return {
      center: clonePoint(center),
      radius,
    };
  }

  function circleFromDiameterPoints(a, b) {
    if (!finitePoint(a) || !finitePoint(b)) return null;
    const diameter = distancePx(a, b);
    if (diameter <= GEOMETRY_EPSILON) return null;
    return {
      center: {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      },
      radius: diameter / 2,
    };
  }

  function circleFromThreePoints(a, b, c) {
    if (!finitePoint(a) || !finitePoint(b) || !finitePoint(c)) return null;
    const ax = b.x - a.x;
    const ay = b.y - a.y;
    const bx = c.x - a.x;
    const by = c.y - a.y;
    const den = 2 * (ax * by - ay * bx);
    const scale = Math.max(1, distancePx(a, b), distancePx(b, c), distancePx(c, a));
    if (Math.abs(den) <= GEOMETRY_EPSILON * scale * scale) return null;
    const lenA = ax * ax + ay * ay;
    const lenB = bx * bx + by * by;
    const center = {
      x: a.x + (lenA * by - lenB * ay) / den,
      y: a.y + (ax * lenB - bx * lenA) / den,
    };
    const radius = distancePx(center, a);
    if (!finitePoint(center) || !Number.isFinite(radius) || radius <= GEOMETRY_EPSILON) return null;
    return { center, radius };
  }

  function circleCircumferencePx(circle) {
    const radius = finitePositiveNumber(circle?.radius);
    return radius == null ? 0 : TAU * radius;
  }

  function pointFromPolar(center, radius, angle) {
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  }

  function sampleCirclePoints(circle, steps = 64) {
    if (!finitePoint(circle?.center) || !Number.isFinite(circle.radius) || circle.radius <= GEOMETRY_EPSILON) return [];
    const count = Math.max(8, Math.floor(Number.isFinite(steps) ? steps : 64));
    const points = [];
    for (let i = 0; i <= count; i++) {
      points.push(pointFromPolar(circle.center, circle.radius, TAU * i / count));
    }
    return points;
  }

  function arcFromCenterStartEnd(center, start, end, opts = {}) {
    if (!finitePoint(center) || !finitePoint(start) || !finitePoint(end)) return null;
    const radius = distancePx(center, start);
    if (radius <= GEOMETRY_EPSILON) return null;
    const startAngle = angleRadFromCenter(center, start);
    const endAngle = angleRadFromCenter(center, end);
    const ccwSweep = normalizeRadians(endAngle - startAngle);
    const sweep = opts.clockwise ? (ccwSweep === 0 ? 0 : ccwSweep - TAU) : ccwSweep;
    if (Math.abs(sweep) <= GEOMETRY_EPSILON) return null;
    return {
      center: clonePoint(center),
      radius,
      startAngle,
      sweep,
    };
  }

  function arcFromThreePoints(start, mid, end) {
    const circle = circleFromThreePoints(start, mid, end);
    if (!circle) return null;
    const startAngle = angleRadFromCenter(circle.center, start);
    const midAngle = angleRadFromCenter(circle.center, mid);
    const endAngle = angleRadFromCenter(circle.center, end);
    const ccwSweep = normalizeRadians(endAngle - startAngle);
    const midDelta = normalizeRadians(midAngle - startAngle);
    const sweep = midDelta <= ccwSweep + GEOMETRY_EPSILON ? ccwSweep : ccwSweep - TAU;
    if (Math.abs(sweep) <= GEOMETRY_EPSILON) return null;
    return {
      center: circle.center,
      radius: circle.radius,
      startAngle,
      sweep,
    };
  }

  function arcLengthPx(arc) {
    const radius = finitePositiveNumber(arc?.radius);
    const sweep = Number(arc?.sweep);
    return radius == null || !Number.isFinite(sweep) ? 0 : Math.abs(sweep) * radius;
  }

  function arcAngleRadians(arc) {
    const sweep = Number(arc?.sweep);
    return Number.isFinite(sweep) ? Math.abs(sweep) : 0;
  }

  function arcAngleDegrees(arc) {
    return radiansToDegrees(arcAngleRadians(arc));
  }

  function arcPointAtT(arc, t) {
    if (!finitePoint(arc?.center) || !Number.isFinite(arc.radius) || !Number.isFinite(arc.startAngle) || !Number.isFinite(arc.sweep)) return null;
    const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
    return pointFromPolar(arc.center, arc.radius, arc.startAngle + arc.sweep * clamped);
  }

  function sampleArcPoints(arc, steps = null) {
    if (!finitePoint(arc?.center) || !Number.isFinite(arc.radius) || arc.radius <= GEOMETRY_EPSILON || !Number.isFinite(arc.startAngle) || !Number.isFinite(arc.sweep)) return [];
    const count = Math.max(1, Math.floor(Number.isFinite(steps) ? steps : Math.ceil(Math.abs(arc.sweep) / TAU * 64)));
    const points = [];
    for (let i = 0; i <= count; i++) points.push(arcPointAtT(arc, i / count));
    return points;
  }

  function projectPointToCircle(p, circle) {
    if (!finitePoint(p) || !finitePoint(circle?.center) || !Number.isFinite(circle.radius) || circle.radius <= GEOMETRY_EPSILON) return null;
    const angle = angleRadFromCenter(circle.center, p);
    const point = pointFromPolar(circle.center, circle.radius, angle);
    return {
      type: 'circle',
      point,
      localT: normalizeRadians(angle) / TAU,
      distance: distancePx(p, point),
    };
  }

  function projectPointToArc(p, arc) {
    if (!finitePoint(p) || !finitePoint(arc?.center) || !Number.isFinite(arc.radius) || arc.radius <= GEOMETRY_EPSILON || !Number.isFinite(arc.startAngle) || !Number.isFinite(arc.sweep)) return null;
    const angle = angleRadFromCenter(arc.center, p);
    const sweepMagnitude = Math.abs(arc.sweep);
    if (sweepMagnitude <= GEOMETRY_EPSILON) return null;
    const delta = arc.sweep >= 0
      ? normalizeRadians(angle - arc.startAngle)
      : normalizeRadians(arc.startAngle - angle);
    if (delta <= sweepMagnitude + GEOMETRY_EPSILON) {
      const localT = Math.max(0, Math.min(1, delta / sweepMagnitude));
      const point = arcPointAtT(arc, localT);
      return {
        type: 'arc',
        point,
        localT,
        distance: distancePx(p, point),
      };
    }
    const startPoint = arcPointAtT(arc, 0);
    const endPoint = arcPointAtT(arc, 1);
    const startDistance = distancePx(p, startPoint);
    const endDistance = distancePx(p, endPoint);
    return startDistance <= endDistance
      ? { type: 'arc', point: startPoint, localT: 0, distance: startDistance }
      : { type: 'arc', point: endPoint, localT: 1, distance: endDistance };
  }

  function rotatePoint(p, center, degrees) {
    const rad = degrees * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  }

  function pointsBounds(points) {
    if (!points.length) return null;
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
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

  function constrainDeltaToRect(bounds, dx, dy, width, height) {
    if (!bounds || !width || !height) return { dx, dy };
    const minDx = -bounds.x;
    const maxDx = width - (bounds.x + bounds.width);
    const minDy = -bounds.y;
    const maxDy = height - (bounds.y + bounds.height);
    return {
      dx: minDx <= maxDx ? Math.max(minDx, Math.min(maxDx, dx)) : (minDx + maxDx) / 2,
      dy: minDy <= maxDy ? Math.max(minDy, Math.min(maxDy, dy)) : (minDy + maxDy) / 2,
    };
  }

  function translatePoints(points, dx, dy) {
    return (points || []).map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
  }

  function rotateAround(point, center, degrees) {
    return rotatePoint(point, center, degrees);
  }

  function rotatedFramePoint(frame, localX, localY) {
    return rotateAround({ x: localX, y: localY }, { x: frame.cx, y: frame.cy }, frame.angle || 0);
  }

  function scalePointsAround(points, center, scale) {
    return points.map(pt => ({
      x: center.x + (pt.x - center.x) * scale,
      y: center.y + (pt.y - center.y) * scale,
    }));
  }

  function translateSegments(segments, dx, dy) {
    return (segments || []).map(seg => ({
      ...seg,
      from: { x: seg.from.x + dx, y: seg.from.y + dy },
      c1: { x: seg.c1.x + dx, y: seg.c1.y + dy },
      c2: { x: seg.c2.x + dx, y: seg.c2.y + dy },
      to: { x: seg.to.x + dx, y: seg.to.y + dy },
    }));
  }

  function scaleSegmentsAround(segments, center, scale) {
    return (segments || []).map(seg => ({
      ...seg,
      from: scalePointsAround([seg.from], center, scale)[0],
      c1: scalePointsAround([seg.c1], center, scale)[0],
      c2: scalePointsAround([seg.c2], center, scale)[0],
      to: scalePointsAround([seg.to], center, scale)[0],
    }));
  }

  function rotateSegmentsAround(segments, center, degrees) {
    return (segments || []).map(seg => ({
      ...seg,
      from: rotatePoint(seg.from, center, degrees),
      c1: rotatePoint(seg.c1, center, degrees),
      c2: rotatePoint(seg.c2, center, degrees),
      to: rotatePoint(seg.to, center, degrees),
    }));
  }

  function splitCubicSegment(seg, t) {
    const clamped = Math.max(0.02, Math.min(0.98, Number.isFinite(t) ? t : 0.5));
    const p01 = lerpPoint(seg.from, seg.c1, clamped);
    const p12 = lerpPoint(seg.c1, seg.c2, clamped);
    const p23 = lerpPoint(seg.c2, seg.to, clamped);
    const p012 = lerpPoint(p01, p12, clamped);
    const p123 = lerpPoint(p12, p23, clamped);
    const p0123 = lerpPoint(p012, p123, clamped);
    return [
      { type: 'cubic', from: { ...seg.from }, c1: p01, c2: p012, to: p0123 },
      { type: 'cubic', from: { ...p0123 }, c1: p123, c2: p23, to: { ...seg.to } },
    ];
  }

  function lerpPoint(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function projectPointToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const x = a.x + t * dx, y = a.y + t * dy;
    const point = { x, y };
    return { point, t, distance: distancePx(p, point) };
  }

  function pointToSegmentDist(p, a, b) {
    return projectPointToSegment(p, a, b).distance;
  }

  function projectPointToPolyline(p, points) {
    if (!p || points.length < 2) return null;
    const total = polylineLengthPx(points);
    if (!total) return { t: 0, point: points[0], distance: distancePx(p, points[0]) };
    let best = null;
    let travelled = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const segLen = Math.sqrt(len2);
      if (!segLen) continue;
      const segT = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      const point = { x: a.x + dx * segT, y: a.y + dy * segT };
      const distance = distancePx(p, point);
      const t = (travelled + segLen * segT) / total;
      if (!best || distance < best.distance) best = { t, point, distance };
      travelled += segLen;
    }
    return best;
  }

  function pointAtPolylineT(points, t) {
    if (points.length < 2) return null;
    const total = polylineLengthPx(points);
    if (!total) return { point: points[0], angle: 0 };
    let remaining = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 1)) * total;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const segLen = distancePx(a, b);
      if (!segLen) continue;
      if (remaining <= segLen || i === points.length - 1) {
        const segT = Math.max(0, Math.min(1, remaining / segLen));
        return {
          point: { x: a.x + (b.x - a.x) * segT, y: a.y + (b.y - a.y) * segT },
          angle: Math.atan2(b.y - a.y, b.x - a.x),
        };
      }
      remaining -= segLen;
    }
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    return { point: last, angle: Math.atan2(last.y - prev.y, last.x - prev.x) };
  }

  window.TakeoffGeometry = {
    TAU,
    distancePx,
    polylineLengthPx,
    cubicPoint,
    flattenSegments,
    flattenSegmentsAdaptive,
    cubicLengthPx,
    vectorAdd,
    vectorSub,
    vectorScale,
    vectorDot,
    vectorLen,
    vectorNormalize,
    fitCurve,
    normalizeDegrees,
    normalizeRadians,
    radiansToDegrees,
    degreesToRadians,
    snapDegrees15,
    angleDegFromCenter,
    angleRadFromCenter,
    circleFromCenterRadius,
    circleFromDiameterPoints,
    circleFromThreePoints,
    circleCircumferencePx,
    sampleCirclePoints,
    arcFromCenterStartEnd,
    arcFromThreePoints,
    arcLengthPx,
    arcAngleRadians,
    arcAngleDegrees,
    arcPointAtT,
    sampleArcPoints,
    projectPointToCircle,
    projectPointToArc,
    rotatePoint,
    pointsBounds,
    constrainDeltaToRect,
    translatePoints,
    rotateAround,
    rotatedFramePoint,
    scalePointsAround,
    translateSegments,
    scaleSegmentsAround,
    rotateSegmentsAround,
    splitCubicSegment,
    lerpPoint,
    projectPointToSegment,
    pointToSegmentDist,
    projectPointToPolyline,
    pointAtPolylineT,
  };
})();
