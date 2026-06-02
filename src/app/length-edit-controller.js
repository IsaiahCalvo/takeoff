(function () {
  const DEFAULT_LABEL_COLOR = '#b6ff3c';
  const MIN_CANVAS_LENGTH_CH = 4;

  function createLengthEditController({
    state,
    input,
    pill,
    stage,
    sidebarController,
    scaleForPage,
    formatLength,
    unitLabel,
    parseLengthInUnit,
    resizeMeasurementToLength,
    createHistorySnapshot,
    recordHistory,
    renderList,
    redraw,
    showStatus,
    syncSidebarSelection,
    finishPointerDrag,
    clearActiveFitMode,
    setSelectionMode,
    imageToScreen,
    endRotateMode,
  } = {}) {
    let activeCanvasLengthEditId = null;
    let canvasLengthEditor = null;
    const canvasLengthUnit = pill?.querySelector?.('.length-edit-unit') || null;

    function setStyleProperty(el, name, value) {
      if (!el?.style) return;
      if (el.style.setProperty) el.style.setProperty(name, value);
      else el.style[name] = value;
    }

    function measurementLabelColor(measurement) {
      return typeof measurement?.color === 'string' && measurement.color.trim()
        ? measurement.color.trim()
        : DEFAULT_LABEL_COLOR;
    }

    function syncCanvasLengthInputWidth(value = input.value) {
      if (!input?.style) return;
      const text = String(value || '');
      input.style.width = `${Math.max(MIN_CANVAS_LENGTH_CH, text.length)}ch`;
    }

    function measurementLengthValue(measurement) {
      return measurement && measurement.lengthInches != null ? formatLength(measurement.lengthInches) : 'unscaled';
    }

    function measurementById(id) {
      return (state.measurements || []).find(item => item.id === id);
    }

    function commitMeasurementLengthEdit(measurementOrId, rawValue) {
      const measurement = typeof measurementOrId === 'object' ? measurementOrId : measurementById(measurementOrId);
      if (!measurement) return false;
      const pxPerInch = scaleForPage(measurement.page);
      if (!pxPerInch || measurement.lengthInches == null) {
        showStatus('Set a page scale before editing Length.');
        return false;
      }
      const targetLengthInches = parseLengthInUnit(rawValue);
      if (targetLengthInches == null) {
        showStatus('Enter a positive Length.');
        return false;
      }
      const historyBefore = createHistorySnapshot();
      if (!resizeMeasurementToLength(measurement, { targetLengthInches, pxPerInch })) {
        showStatus('Enter a positive Length.');
        return false;
      }
      state.selectedId = measurement.id;
      if (state.rotateModeId === measurement.id) endRotateMode();
      recordHistory(historyBefore, 'length edit');
      renderList();
      redraw();
      showStatus('Length updated.');
      return true;
    }

    function hideCanvasLengthEdit() {
      activeCanvasLengthEditId = null;
      canvasLengthEditor = null;
      input.setAttribute('readonly', '');
      if (canvasLengthUnit) canvasLengthUnit.hidden = true;
      pill.classList.remove('show');
    }

    function openCanvasLengthEdit(labelHit) {
      const measurement = measurementById(labelHit?.measurementId);
      if (!measurement) return false;
      if (!scaleForPage(measurement.page) || measurement.lengthInches == null) {
        showStatus('Set a page scale before editing Length.');
        return false;
      }
      finishPointerDrag();
      clearActiveFitMode();
      setSelectionMode();
      state.selectedId = measurement.id;
      activeCanvasLengthEditId = measurement.id;
      const center = { x: labelHit.x + labelHit.width / 2, y: labelHit.y + labelHit.height / 2 };
      const screen = imageToScreen(center.x, center.y);
      const rect = stage.getBoundingClientRect();
      const pillWidth = Math.max(82, labelHit.width || 0);
      const pillHeight = 24;
      const left = Math.max(4, Math.min(window.innerWidth - pillWidth - 4, rect.left + screen.x - pillWidth / 2));
      const top = Math.max(4, Math.min(window.innerHeight - pillHeight - 4, rect.top + screen.y - pillHeight / 2));
      pill.style.left = `${left}px`;
      pill.style.top = `${top}px`;
      setStyleProperty(pill, '--length-edit-color', measurementLabelColor(measurement));
      if (canvasLengthUnit) {
        canvasLengthUnit.textContent = unitLabel ? unitLabel() : '';
        canvasLengthUnit.hidden = false;
      }
      pill.classList.add('show');
      canvasLengthEditor = sidebarController.createEditableLengthInput({
        input,
        errorEl: pill.querySelector('.length-edit-error'),
        currentValue: () => measurementLengthValue(measurementById(activeCanvasLengthEditId)),
        commit: value => {
          const accepted = commitMeasurementLengthEdit(activeCanvasLengthEditId, value);
          if (accepted) hideCanvasLengthEdit();
          return accepted;
        },
        cancel: () => hideCanvasLengthEdit(),
        afterInput: syncCanvasLengthInputWidth,
      });
      renderList();
      redraw();
      canvasLengthEditor.start();
      syncCanvasLengthInputWidth();
      return true;
    }

    function blurActiveInlineInput(target) {
      const active = document.activeElement;
      if (!active || !active.classList) return;
      const isMeasurementInput = active.classList.contains('name') || active.classList.contains('length') || active === input;
      if (!isMeasurementInput) return;
      if (active === target) return;
      if (target && target.closest && (
        target.closest('input.name')
        || target.closest('input.length')
        || target.closest('#lengthEditPill')
      )) return;
      if (active.setSelectionRange) active.setSelectionRange(0, 0);
      active.blur();
    }

    function bindSidebarLengthInput(item, measurement) {
      const lengthInput = item.querySelector('.length');
      const lengthEditor = sidebarController.createEditableLengthInput({
        input: lengthInput,
        errorEl: item.querySelector('.length-error'),
        currentValue: () => measurementLengthValue(measurement),
        commit: value => commitMeasurementLengthEdit(measurement, value),
      });
      const startLengthEdit = () => {
        if (!scaleForPage(measurement.page) || measurement.lengthInches == null) {
          showStatus('Set a page scale before editing Length.');
          return;
        }
        state.selectedId = measurement.id;
        syncSidebarSelection();
        redraw();
        lengthEditor.start();
      };
      lengthInput.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        startLengthEdit();
      });
      lengthInput.addEventListener('keydown', event => lengthEditor.handleKeyDown(event));
      lengthInput.addEventListener('blur', () => lengthEditor.handleBlur());
      item.startLengthEdit = startLengthEdit;
    }

    input.addEventListener('keydown', (event) => {
      if (canvasLengthEditor) canvasLengthEditor.handleKeyDown(event);
    });
    input.addEventListener('blur', () => {
      const editor = canvasLengthEditor;
      if (editor && editor.handleBlur()) hideCanvasLengthEdit();
    });

    return {
      measurementLengthValue,
      commitMeasurementLengthEdit,
      openCanvasLengthEdit,
      blurActiveInlineInput,
      bindSidebarLengthInput,
    };
  }

  window.TakeoffLengthEditController = {
    createLengthEditController,
  };
})();
