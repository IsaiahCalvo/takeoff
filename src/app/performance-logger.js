(function () {
  const DEFAULT_MAX_EVENTS = 8000;
  const LOG_ENDPOINT = '/__takeoff_logs';
  const ANCHOR_TOLERANCE_PX = 0.75;

  function round(value, digits = 3) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function distance(a, b) {
    if (!a || !b) return null;
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
  }

  function timestampForFilename(date) {
    const pad = value => String(value).padStart(2, '0');
    return [
      date.getUTCFullYear(),
      pad(date.getUTCMonth() + 1),
      pad(date.getUTCDate()),
    ].join('-') + '_' + [
      pad(date.getUTCHours()),
      pad(date.getUTCMinutes()),
      pad(date.getUTCSeconds()),
    ].join('-');
  }

  function filenameForDate(date) {
    return `takeoff-performance-${timestampForFilename(date)}.json`;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function createPerformanceLogger({
    now = () => performance.now(),
    dateNow = () => new Date(),
    requestAnimationFrame = window.requestAnimationFrame?.bind(window),
    maxEvents = DEFAULT_MAX_EVENTS,
  } = {}) {
    const startedAt = dateNow().toISOString();
    const events = [];
    const frame = {
      running: false,
      lastAt: null,
      lastEventAt: null,
      samples: 0,
      maxFps: 0,
      averageFps: 0,
      worstFrameMs: 0,
    };
    let context = {};
    let lastZoomAt = null;
    let lastScrollAt = null;

    function setContext(patch = {}) {
      context = {
        ...context,
        ...clone(patch),
      };
      return clone(context);
    }

    function append(event) {
      events.push({
        id: events.length + 1,
        at: dateNow().toISOString(),
        t: round(now()),
        context: clone(context),
        ...event,
      });
      while (events.length > maxEvents) events.shift();
    }

    function rateFromPrevious(previousAt, currentAt) {
      if (previousAt == null) return { elapsedMs: null, eventsPerSecond: null };
      const elapsedMs = Math.max(0, currentAt - previousAt);
      return {
        elapsedMs: round(elapsedMs),
        eventsPerSecond: elapsedMs > 0 ? round(1000 / elapsedMs) : null,
      };
    }

    function recordFrameSample(timestamp = now()) {
      if (frame.lastAt == null) {
        frame.lastAt = timestamp;
        frame.lastEventAt = timestamp;
        return;
      }
      const frameMs = Math.max(0, timestamp - frame.lastAt);
      const fps = frameMs > 0 ? 1000 / frameMs : 0;
      frame.samples += 1;
      frame.maxFps = Math.max(frame.maxFps, fps);
      frame.averageFps = ((frame.averageFps * (frame.samples - 1)) + fps) / frame.samples;
      frame.worstFrameMs = Math.max(frame.worstFrameMs, frameMs);
      if (frame.lastEventAt == null || timestamp - frame.lastEventAt >= 500) {
        append({
          kind: 'fps',
          fps: round(fps),
          frameMs: round(frameMs),
          averageFps: round(frame.averageFps),
          maxFps: round(frame.maxFps),
          worstFrameMs: round(frame.worstFrameMs),
        });
        frame.lastEventAt = timestamp;
      }
      frame.lastAt = timestamp;
    }

    function startFrameSampling() {
      if (!requestAnimationFrame || frame.running) return;
      frame.running = true;
      const tick = timestamp => {
        recordFrameSample(timestamp);
        if (frame.running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    function stopFrameSampling() {
      frame.running = false;
    }

    function recordZoom({
      source,
      direction,
      factor,
      before,
      after,
      cursor,
      anchorBefore,
      anchorAfter,
      targetRenderScale,
    }) {
      const currentAt = now();
      const rate = rateFromPrevious(lastZoomAt, currentAt);
      lastZoomAt = currentAt;
      const anchorErrorPx = round(distance(anchorBefore, anchorAfter));
      const zoomDelta = (after?.zoom || 0) - (before?.zoom || 0);
      const seconds = rate.elapsedMs ? rate.elapsedMs / 1000 : null;
      append({
        kind: 'zoom',
        source,
        direction,
        factor: round(factor),
        before: clone(before),
        after: clone(after),
        cursor: clone(cursor),
        targetRenderScale: round(targetRenderScale),
        zoomDelta: round(zoomDelta),
        zoomDeltaPerSecond: seconds ? round(zoomDelta / seconds) : null,
        ...rate,
        cursorCentric: {
          anchorBefore: clone(anchorBefore),
          anchorAfter: clone(anchorAfter),
          anchorErrorPx,
          preserved: anchorErrorPx == null ? null : anchorErrorPx <= ANCHOR_TOLERANCE_PX,
        },
      });
    }

    function recordScroll({ source, deltaX, deltaY, before, after, continuous }) {
      const currentAt = now();
      const rate = rateFromPrevious(lastScrollAt, currentAt);
      lastScrollAt = currentAt;
      const seconds = rate.elapsedMs ? rate.elapsedMs / 1000 : null;
      const scrollMagnitude = Math.hypot(deltaX || 0, deltaY || 0);
      const expectedPanX = (before?.panX || 0) - (deltaX || 0);
      const expectedPanY = (before?.panY || 0) - (deltaY || 0);
      append({
        kind: 'scroll',
        source,
        deltaX: round(deltaX || 0),
        deltaY: round(deltaY || 0),
        before: clone(before),
        after: clone(after),
        pageBefore: before?.page ?? null,
        pageAfter: after?.page ?? null,
        continuous: !!continuous,
        scrollPixelsPerSecond: seconds ? round(scrollMagnitude / seconds) : null,
        inputReflected: Math.abs((after?.panX || 0) - expectedPanX) < 0.001
          && Math.abs((after?.panY || 0) - expectedPanY) < 0.001,
        ...rate,
      });
    }

    function recordRender(event) {
      append({
        kind: 'render',
        ...clone(event),
      });
    }

    function summary() {
      const zoomEvents = events.filter(event => event.kind === 'zoom');
      const scrollEvents = events.filter(event => event.kind === 'scroll');
      const renderEvents = events.filter(event => event.kind === 'render');
      return {
        startedAt,
        savedAt: dateNow().toISOString(),
        zoom: {
          count: zoomEvents.length,
          inCount: zoomEvents.filter(event => event.direction === 'in').length,
          outCount: zoomEvents.filter(event => event.direction === 'out').length,
          maxEventsPerSecond: round(Math.max(0, ...zoomEvents.map(event => event.eventsPerSecond || 0))),
        },
        scroll: {
          count: scrollEvents.length,
          maxEventsPerSecond: round(Math.max(0, ...scrollEvents.map(event => event.eventsPerSecond || 0))),
          maxPixelsPerSecond: round(Math.max(0, ...scrollEvents.map(event => event.scrollPixelsPerSecond || 0))),
        },
        frameRate: {
          samples: frame.samples,
          maxFps: round(frame.maxFps),
          averageFps: round(frame.averageFps),
          worstFrameMs: round(frame.worstFrameMs),
        },
        render: {
          count: renderEvents.length,
          completedCount: renderEvents.filter(event => event.phase === 'end').length,
          skippedCount: renderEvents.filter(event => event.phase === 'skip' || event.phase === 'stale').length,
        },
      };
    }

    function buildPayload() {
      return {
        app: 'Takeoff',
        version: 'performance-log-v1',
        startedAt,
        context: clone(context),
        summary: summary(),
        events: clone(events),
      };
    }

    function downloadFallback(filename, payload) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }

    async function save() {
      const savedAt = dateNow();
      const filename = filenameForDate(savedAt);
      const payload = buildPayload();
      try {
        const response = await fetch(LOG_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, payload }),
        });
        if (response.ok) {
          const result = await response.json();
          return { method: 'local-endpoint', path: result.saved };
        }
      } catch (_) {
        // Static deploys cannot write to the local filesystem. Use download fallback.
      }
      downloadFallback(filename, payload);
      return { method: 'download', filename };
    }

    return {
      setContext,
      recordZoom,
      recordScroll,
      recordRender,
      recordFrameSample,
      startFrameSampling,
      stopFrameSampling,
      buildPayload,
      save,
    };
  }

  window.TakeoffPerformanceLogger = {
    createPerformanceLogger,
    filenameForDate,
  };
})();
