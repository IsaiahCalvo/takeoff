(function () {
  function createSelectionController({ state, matches, setMeasurements, endRotateMode } = {}) {
    const idMatches = matches || ((a, b) => a === b);

    function normalize(ids) {
      const out = [];
      const seen = new Set();
      for (const id of ids || []) {
        if (id == null) continue;
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(id);
      }
      return out;
    }

    function currentIds() {
      return state.selectedIds?.length ? state.selectedIds.slice() : (state.selectedId != null ? [state.selectedId] : []);
    }

    function set(ids, opts = {}) {
      const selectedIds = normalize(ids);
      const requestedPrimary = Object.prototype.hasOwnProperty.call(opts, 'primary') ? opts.primary : selectedIds[0] ?? null;
      const primary = requestedPrimary != null && selectedIds.some(id => idMatches(id, requestedPrimary)) ? requestedPrimary : selectedIds[0] ?? null;
      state.selectedIds = selectedIds;
      state.selectedId = primary;
      if (state.rotateModeId != null && !selectedIds.some(id => idMatches(id, state.rotateModeId))) endRotateMode?.();
    }

    function selectSingle(id) {
      set(id == null ? [] : [id], { primary: id ?? null });
    }

    function selectForContextMenu(id) {
      if (id == null) {
        selectSingle(id);
        return 'single';
      }
      if (isSelected(id)) {
        set(currentIds(), { primary: id });
        return 'preserve';
      }
      selectSingle(id);
      return 'single';
    }

    function add(ids) {
      const next = normalize([...currentIds(), ...ids]);
      set(next, { primary: state.selectedId ?? next[0] ?? null });
    }

    function remove(ids) {
      const removeSet = new Set((ids || []).map(String));
      const next = currentIds().filter(id => !removeSet.has(String(id)));
      set(next, { primary: state.selectedId != null && next.some(id => idMatches(id, state.selectedId)) ? state.selectedId : next[0] ?? null });
    }

    function isSelected(id) {
      return currentIds().some(selectedId => idMatches(selectedId, id));
    }

    function selectFromClick(id, event = {}) {
      if (event.editHandle) {
        if (isSelected(id)) return 'preserve';
        selectSingle(id);
        return 'single';
      }
      if (event.altKey || (event.shiftKey && isSelected(id))) {
        remove([id]);
        return 'remove';
      }
      if (event.shiftKey) {
        add([id]);
        return 'add';
      }
      if (isSelected(id)) return 'preserve';
      selectSingle(id);
      return 'single';
    }

    function deleteMeasurement(id, deleteMeasurementResult) {
      const remainingSelectedIds = currentIds().filter(selectedId => !idMatches(selectedId, id));
      const result = deleteMeasurementResult({ measurements: state.measurements, selectedId: state.selectedId, deletedId: id });
      const nextSelectedId = result.selectedId != null ? result.selectedId : remainingSelectedIds[0] ?? null;
      setMeasurements(result.measurements, { selectedId: nextSelectedId, selectedIds: remainingSelectedIds });
      if (state.rotateModeId === id) endRotateMode?.();
      return result.deleted;
    }

    function deleteSelectedMeasurements() {
      const selectedIds = currentIds();
      if (!selectedIds.length) return false;
      const selected = new Set(selectedIds.map(String));
      const nextMeasurements = state.measurements.filter(measurement => !selected.has(String(measurement.id)));
      if (nextMeasurements.length === state.measurements.length) {
        set([]);
        return false;
      }
      const removedRotateTarget = state.rotateModeId != null && selected.has(String(state.rotateModeId));
      setMeasurements(nextMeasurements, { selectedId: null, selectedIds: [] });
      if (removedRotateTarget) endRotateMode?.();
      return true;
    }

    function filterVisible({ measurementById, isVisible } = {}) {
      const selectedIds = currentIds();
      const visibleSelectedIds = selectedIds.filter(id => {
        const measurement = measurementById?.(id);
        return measurement && isVisible?.(measurement);
      });
      if (visibleSelectedIds.length !== selectedIds.length) set(visibleSelectedIds, { primary: visibleSelectedIds[0] ?? null });
    }

    return { currentIds, set, selectSingle, selectForContextMenu, selectFromClick, clear: () => set([]), add, remove, isSelected, deleteMeasurement, deleteSelectedMeasurements, filterVisible };
  }

  window.TakeoffSelectionController = { createSelectionController };
})();
