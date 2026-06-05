(function () {
  function createMarqueeController({
    state,
    hitTesting,
    screenToImage,
    measurementsForSelection,
    selection,
    stage,
    renderList,
    redraw,
    drawSvg,
    svgNode,
    overlayPageSize,
  } = {}) {
    function trace(type, detail = {}) {
      try {
        const entry = { type, at: Date.now(), ...detail };
        const log = window.__takeoffMarqueeDebug || [];
        log.push(entry);
        window.__takeoffMarqueeDebug = log.slice(-50);
        if (window.localStorage?.getItem('takeoffMarqueeDebug') === '1') console.debug('[takeoff:marquee]', entry);
      } catch (_) { /* diagnostics only */ }
    }

    function clampPoint(point) {
      return {
        x: Math.max(0, Math.min(state.baseW || 0, point?.x || 0)),
        y: Math.max(0, Math.min(state.baseH || 0, point?.y || 0)),
      };
    }

    function capturePointer(pointerId) {
      if (pointerId == null || typeof stage?.setPointerCapture !== 'function') return;
      try { stage.setPointerCapture(pointerId); } catch (_) { /* pointer capture is best effort */ }
    }

    function releasePointer(pointerId = state.marqueeSelection?.pointerId) {
      if (pointerId == null || typeof stage?.releasePointerCapture !== 'function') return;
      try { stage.releasePointerCapture(pointerId); } catch (_) { /* pointer capture is best effort */ }
    }

    function rect(marquee = state.marqueeSelection) {
      if (!marquee) return null;
      return hitTesting.getMarqueeRect({
        startX: marquee.startX,
        startY: marquee.startY,
        endX: marquee.endX,
        endY: marquee.endY,
      });
    }

    function direction(marquee = state.marqueeSelection) {
      return marquee ? hitTesting.getMarqueeDirection({ startX: marquee.startX, endX: marquee.endX }) : 'window';
    }

    function matchesPointer(event) {
      const pointerId = state.marqueeSelection?.pointerId;
      return pointerId == null || event?.pointerId == null || event.pointerId === pointerId;
    }

    function start({ point, clientX, clientY, shiftKey = false, altKey = false, pointerId = null } = {}) {
      const clamped = clampPoint(point);
      state.marqueeSelection = {
        startX: clamped.x,
        startY: clamped.y,
        endX: clamped.x,
        endY: clamped.y,
        startClientX: clientX,
        startClientY: clientY,
        endClientX: clientX,
        endClientY: clientY,
        active: false,
        shiftKey,
        altKey,
        pointerId,
      };
      capturePointer(pointerId);
      stage.classList.add('marqueeing');
      trace('start', { x: clamped.x, y: clamped.y, pointerId });
    }

    function update(event) {
      if (!state.marqueeSelection) return false;
      if (!matchesPointer(event)) return false;
      const point = clampPoint(screenToImage(event.clientX, event.clientY));
      state.cursorImg = point;
      const dx = Math.abs(event.clientX - state.marqueeSelection.startClientX);
      const dy = Math.abs(event.clientY - state.marqueeSelection.startClientY);
      Object.assign(state.marqueeSelection, {
        endX: point.x,
        endY: point.y,
        endClientX: event.clientX,
        endClientY: event.clientY,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        active: state.marqueeSelection.active || dx >= hitTesting.MARQUEE_MIN_DRAG_PX || dy >= hitTesting.MARQUEE_MIN_DRAG_PX,
      });
      state.shiftHeld = event.shiftKey;
      stage.style.cursor = 'crosshair';
      redraw();
      trace('update', { active: state.marqueeSelection.active, direction: direction(), dx, dy, pointerId: event.pointerId });
      return true;
    }

    function commit() {
      const marquee = state.marqueeSelection;
      if (!marquee) return false;
      releasePointer(marquee.pointerId);
      if (marquee.active) {
        const hits = hitTesting.findMarqueeMeasurements(measurementsForSelection(), rect(marquee), direction(marquee));
        if (marquee.altKey) selection.remove(hits);
        else if (marquee.shiftKey) selection.add(hits);
        else selection.set(hits);
        trace('commit', { active: true, direction: direction(marquee), hitCount: hits.length, pointerId: marquee.pointerId });
      } else if (!marquee.shiftKey && !marquee.altKey) {
        selection.clear();
        trace('commit', { active: false, hitCount: 0, pointerId: marquee.pointerId });
      }
      state.marqueeSelection = null;
      stage.classList.remove('marqueeing');
      stage.style.cursor = '';
      renderList();
      redraw();
      return true;
    }

    function draw() {
      const marquee = state.marqueeSelection;
      if (!marquee?.active) return;
      const marqueeRect = rect(marquee);
      if (!marqueeRect || marqueeRect.width <= 0 || marqueeRect.height <= 0) return;
      const isCrossing = direction(marquee) === 'crossing';
      drawSvg.appendChild(svgNode('rect', {
        x: marqueeRect.left,
        y: marqueeRect.top,
        width: marqueeRect.width,
        height: marqueeRect.height,
        fill: isCrossing ? 'rgba(0, 200, 100, 0.15)' : 'rgba(0, 100, 255, 0.15)',
        stroke: isCrossing ? 'rgba(0, 200, 100, 0.8)' : 'rgba(0, 100, 255, 0.8)',
        'stroke-width': 1,
        'stroke-dasharray': isCrossing ? '5,5' : null,
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
      }));
    }

    return { start, update, commit, draw, rect, direction, matchesPointer };
  }

  window.TakeoffMarqueeController = { createMarqueeController };
})();
