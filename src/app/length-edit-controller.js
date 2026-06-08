(function () {
  const MIN_CANVAS_LENGTH_CH = 4;

  function createLengthEditController({
    state,
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
    endRotateMode,
  } = {}) {
    let activeCanvasLengthEditId = null;
    let canvasLengthEditor = null;
    let canvasLengthInput = null;
    let activeCanvasLengthValue = '';
    let activeCanvasLengthInvalid = false;

    function syncCanvasLengthInputWidth(input, value = input?.value) {
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

    function commitMeasurementLengthEdit(measurementOrId, rawValue, options = {}) {
      const { refresh = true } = options;
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
      state.selectedIds = [measurement.id];
      if (state.rotateModeId === measurement.id) endRotateMode();
      recordHistory(historyBefore, 'length edit');
      if (refresh) {
        renderList();
        redraw();
      }
      showStatus('Length updated.');
      return true;
    }

    function activeCanvasLengthEditIdValue() {
      return activeCanvasLengthEditId;
    }

    function clearCanvasLengthEdit() {
      activeCanvasLengthEditId = null;
      canvasLengthEditor = null;
      canvasLengthInput = null;
      activeCanvasLengthValue = '';
      activeCanvasLengthInvalid = false;
    }

    function canvasLengthEditStateForMeasurement(measurement) {
      if (!measurement || measurement.id !== activeCanvasLengthEditId) return { active: false };
      return {
        active: true,
        value: activeCanvasLengthValue,
        unit: unitLabel ? unitLabel() : '',
        invalid: activeCanvasLengthInvalid,
      };
    }

    function activeCanvasLengthInputFromDocument() {
      if (typeof document === 'undefined') return null;
      return document.getElementById?.('canvasLengthEditInput') || null;
    }

    function bindActiveCanvasLengthInput(input = activeCanvasLengthInputFromDocument(), options = {}) {
      const measurement = measurementById(activeCanvasLengthEditId);
      if (!measurement || !input) return false;
      canvasLengthInput = input;
      const errorEl = input.parentElement?.querySelector?.('.canvas-length-edit-error') || null;
      canvasLengthEditor = sidebarController.createEditableLengthInput({
        input,
        errorEl,
        currentValue: () => activeCanvasLengthValue || measurementLengthValue(measurementById(activeCanvasLengthEditId)),
        commit: value => {
          activeCanvasLengthValue = value;
          const editId = activeCanvasLengthEditId;
          const accepted = commitMeasurementLengthEdit(editId, value, { refresh: false });
          if (!accepted) {
            activeCanvasLengthInvalid = true;
            return false;
          }
          clearCanvasLengthEdit();
          renderList();
          redraw();
          return true;
        },
        cancel: () => {
          clearCanvasLengthEdit();
          renderList();
          redraw();
        },
        afterInput: value => {
          activeCanvasLengthValue = value;
          activeCanvasLengthInvalid = false;
          syncCanvasLengthInputWidth(input, value);
        },
      });
      if (input.addEventListener && !input.dataset.canvasLengthEditorBound) {
        input.addEventListener('keydown', event => {
          if (canvasLengthEditor && canvasLengthInput === input) canvasLengthEditor.handleKeyDown(event);
        });
        input.addEventListener('blur', () => {
          const editor = canvasLengthEditor;
          if (editor && canvasLengthInput === input) editor.handleBlur();
        });
        input.dataset.canvasLengthEditorBound = 'true';
      }
      input.value = activeCanvasLengthValue;
      if (input.removeAttribute) input.removeAttribute('readonly');
      syncCanvasLengthInputWidth(input);
      if (activeCanvasLengthInvalid) {
        input.classList?.add?.('invalid');
        input.setAttribute?.('aria-invalid', 'true');
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = 'Enter a positive Length.';
          if (errorEl.id) input.setAttribute?.('aria-describedby', errorEl.id);
        }
      }
      if (options.focus) canvasLengthEditor.start();
      return true;
    }

    function openCanvasLengthEdit(labelHit) {
      const measurement = measurementById(labelHit?.measurementId);
      if (!measurement) return false;
      if (measurement.locked === true) {
        showStatus('Unlock this measurement before editing Length.');
        return false;
      }
      if (!scaleForPage(measurement.page) || measurement.lengthInches == null) {
        showStatus('Set a page scale before editing Length.');
        return false;
      }
      finishPointerDrag();
      clearActiveFitMode();
      setSelectionMode();
      state.selectedId = measurement.id;
      state.selectedIds = [measurement.id];
      activeCanvasLengthEditId = measurement.id;
      activeCanvasLengthValue = measurementLengthValue(measurement);
      activeCanvasLengthInvalid = false;
      canvasLengthEditor = null;
      canvasLengthInput = null;
      renderList();
      redraw();
      bindActiveCanvasLengthInput(activeCanvasLengthInputFromDocument(), { focus: true });
      return true;
    }

    function blurActiveInlineInput(target) {
      const active = document.activeElement;
      if (!active || !active.classList) return;
      const isMeasurementInput = (
        active.classList.contains('name')
        || active.classList.contains('length')
        || active.classList.contains('canvas-length-tag-input')
      );
      if (!isMeasurementInput) return;
      if (active === target) return;
      if (target && target.closest && (
        target.closest('input.name')
        || target.closest('input.length')
        || target.closest('.canvas-length-tag-input')
        || target.closest('.canvas-length-tag-edit')
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
        if (measurement.locked === true) {
          showStatus('Unlock this measurement before editing Length.');
          return;
        }
        if (!scaleForPage(measurement.page) || measurement.lengthInches == null) {
          showStatus('Set a page scale before editing Length.');
          return;
        }
        state.selectedId = measurement.id;
        state.selectedIds = [measurement.id];
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

    return {
      measurementLengthValue,
      commitMeasurementLengthEdit,
      openCanvasLengthEdit,
      activeCanvasLengthEditId: activeCanvasLengthEditIdValue,
      canvasLengthEditStateForMeasurement,
      bindActiveCanvasLengthInput,
      blurActiveInlineInput,
      bindSidebarLengthInput,
    };
  }

  window.TakeoffLengthEditController = {
    createLengthEditController,
  };
})();
