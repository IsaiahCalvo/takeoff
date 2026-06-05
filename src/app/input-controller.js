(function () {
  function keyName(event) {
    return String(event.key || '').toLowerCase();
  }

  function isSpaceKey(event) {
    return event.key === ' ' || event.code === 'Space';
  }

  function isTextEntryTarget(target) {
    if (!target || !target.tagName) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    return !target.readOnly && !target.disabled;
  }

  function shouldRedrawForShift(state) {
    return !!(state.inProgressPointCount || (state.mode === 'selection' && hasSelection(state)));
  }

  function hasSelection(state = {}) {
    return state.selectedId != null || !!state.selectedIds?.length;
  }

  function describeKeyDown(event, state = {}) {
    if (isTextEntryTarget(state.target || event.target)) return null;
    const isCommand = !!(event.ctrlKey || event.metaKey);
    const key = keyName(event);

    if (event.shiftKey && key === 'l') return { action: 'save-performance-log', preventDefault: true };
    if (isCommand && key === 'z') return { action: event.shiftKey ? 'redo' : 'undo', preventDefault: true };
    if (isCommand && key === 'y') return { action: 'redo', preventDefault: true };
    if (isCommand && key === 'c') return { action: 'copy', preventDefault: true };
    if (isCommand && key === 'd') return { action: 'duplicate', preventDefault: true };
    if (isCommand && key === 'x') return { action: 'cut', preventDefault: true };
    if (isCommand && key === 'v') return { action: 'paste', preventDefault: true };

    if (isSpaceKey(event)) {
      if (!state.spaceHeld && state.mode !== 'pan') {
        return { action: 'space-pan-start', preventDefault: true, previousMode: state.mode };
      }
      return { action: 'space-pan-repeat', preventDefault: true };
    }

    if (event.key === 'Shift') return { action: 'shift-down', redraw: shouldRedrawForShift(state) };
    if (event.key === 'Escape') return { action: 'escape' };
    if (event.key === 'Enter' && state.mode === 'measure' && state.inProgressPointCount >= 2) {
      return { action: 'finish-measurement' };
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.mode === 'selection' && hasSelection(state)) {
      return { action: 'delete-selection', preventDefault: true };
    }

    const modeHotkeys = {
      v: 'selection',
      c: 'calibrate',
      m: 'measure',
      p: 'pan',
      e: 'erase',
    };
    if (modeHotkeys[key]) return { action: 'set-mode', mode: modeHotkeys[key] };
    if (key === 'f') return { action: 'fit-view' };
    return null;
  }

  function describeKeyUp(event, state = {}) {
    if (isSpaceKey(event)) {
      return {
        action: 'space-up',
        restoreMode: state.mode === 'pan' && state.prevMode && state.prevMode !== 'pan' ? state.prevMode : null,
        stopPanning: !!state.isPanning,
      };
    }
    if (event.key === 'Shift') return { action: 'shift-up', redraw: shouldRedrawForShift(state) };
    return null;
  }

  window.TakeoffInputController = {
    isTextEntryTarget,
    describeKeyDown,
    describeKeyUp,
  };
})();
