(function () {
  function sourceObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }

  function createAttachmentId(kind, file, now = Date.now()) {
    const name = String(file?.name || kind).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || kind;
    return `${kind}-${now.toString(36)}-${name}`;
  }

  function attachmentRecordFromFile(file, { kind = 'media', id = createAttachmentId(kind, file), dataUrl = '' } = {}) {
    return {
      id,
      name: String(file?.name || 'Untitled'),
      type: String(file?.type || ''),
      size: Number.isFinite(file?.size) ? file.size : 0,
      lastModified: Number.isFinite(file?.lastModified) ? file.lastModified : null,
      dataUrl: String(dataUrl || ''),
    };
  }

  function attachmentDisplayName(attachment, fallback) {
    const source = sourceObject(attachment);
    return String(source.name || source.fileName || source.id || fallback);
  }

  function formatBytes(size) {
    const value = Number(size);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (typeof FileReader === 'undefined') {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
      reader.readAsDataURL(file);
    });
  }

  function ensureModal(root) {
    let modal = root.getElementById('runDetailsModal');
    if (modal) return modal;
    modal = root.createElement('div');
    modal.id = 'runDetailsModal';
    modal.className = 'modal-bg';
    modal.innerHTML = `
      <div class="modal run-details-modal" role="dialog" aria-labelledby="runDetailsTitle" aria-modal="true">
        <div class="run-details-header">
          <div><h3 id="runDetailsTitle">Run Details</h3><p id="runDetailsSummary">Add notes and media for this run.</p></div>
          <button id="runDetailsClose" class="run-details-close" type="button" aria-label="Close Run Details">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <label class="run-details-field"><span>Notes</span><textarea id="runDetailsText" rows="5" autocomplete="off"></textarea></label>
        <div class="run-details-upload-row">
          <button id="runDetailsPhotoButton" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m7 16 4-4 3 3 2-2 1 3"/><circle cx="9" cy="9" r="1.5"/></svg>Photos</button>
          <button id="runDetailsVideoButton" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="12" height="12" rx="2"/><path d="m16 10 4-2v8l-4-2"/></svg>Videos</button>
          <input id="runDetailsPhotoInput" type="file" accept="image/*" multiple hidden />
          <input id="runDetailsVideoInput" type="file" accept="video/*" multiple hidden />
        </div>
        <section class="run-details-media-section" aria-label="Photos"><h4>Photos</h4><div id="runDetailsPhotoList" class="run-details-media-list"></div></section>
        <section class="run-details-media-section" aria-label="Videos"><h4>Videos</h4><div id="runDetailsVideoList" class="run-details-media-list"></div></section>
        <div class="actions"><button id="runDetailsCancel" type="button">Cancel</button><button id="runDetailsSave" class="primary" type="button">Save</button></div>
      </div>
    `;
    root.body.appendChild(modal);
    return modal;
  }

  function createRunDetailModal({ root = document, getElement = id => root.getElementById(id), normalizeRunDetails, onSave, focusLater = fn => setTimeout(fn, 30) } = {}) {
    const modal = ensureModal(root);
    let context = null;
    let draft = { text: '', photos: [], videos: [] };

    function el(id) {
      return getElement(id);
    }

    function normalized(details) {
      const model = normalizeRunDetails ? normalizeRunDetails(details) : { text: '', photos: [], videos: [] };
      return { text: String(model.text || ''), photos: (model.photos || []).map(cloneValue), videos: (model.videos || []).map(cloneValue) };
    }

    function renderMediaList(kind) {
      const list = el(kind === 'photos' ? 'runDetailsPhotoList' : 'runDetailsVideoList');
      const items = draft[kind] || [];
      list.replaceChildren();
      if (!items.length) {
        const empty = root.createElement('p');
        empty.className = 'run-details-empty';
        empty.textContent = kind === 'photos' ? 'No photos added.' : 'No videos added.';
        list.appendChild(empty);
        return;
      }
      items.forEach((attachment, index) => {
        const item = root.createElement('div');
        item.className = 'run-details-media-item';
        const preview = root.createElement('div');
        preview.className = 'run-details-preview';
        if (kind === 'photos' && attachment.dataUrl) {
          const img = root.createElement('img');
          img.alt = '';
          img.src = attachment.dataUrl;
          preview.appendChild(img);
        } else if (kind === 'videos' && attachment.dataUrl) {
          const video = root.createElement('video');
          video.src = attachment.dataUrl;
          video.controls = true;
          video.preload = 'metadata';
          preview.appendChild(video);
        } else {
          preview.textContent = kind === 'photos' ? 'IMG' : 'VID';
        }
        const copy = root.createElement('div');
        copy.className = 'run-details-media-copy';
        const name = root.createElement('span');
        name.className = 'run-details-media-name';
        name.textContent = attachmentDisplayName(attachment, `${kind === 'photos' ? 'Photo' : 'Video'} ${index + 1}`);
        const meta = root.createElement('span');
        meta.className = 'run-details-media-meta';
        meta.textContent = [attachment.type, formatBytes(attachment.size)].filter(Boolean).join(' - ');
        const remove = root.createElement('button');
        remove.className = 'run-details-remove';
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.dataset.kind = kind;
        remove.dataset.index = String(index);
        copy.appendChild(name);
        if (meta.textContent) copy.appendChild(meta);
        item.appendChild(preview);
        item.appendChild(copy);
        item.appendChild(remove);
        list.appendChild(item);
      });
    }

    function render() {
      el('runDetailsText').value = draft.text;
      renderMediaList('photos');
      renderMediaList('videos');
    }

    async function addFiles(kind, files) {
      const list = Array.from(files || []);
      for (const file of list) draft[kind].push(attachmentRecordFromFile(file, { kind: kind === 'photos' ? 'photo' : 'video', dataUrl: await readFileAsDataUrl(file) }));
      renderMediaList(kind);
    }

    function close({ restoreFocus = true } = {}) {
      modal.classList.remove('show');
      el('runDetailsPhotoInput').value = '';
      el('runDetailsVideoInput').value = '';
      const restore = context?.restoreFocusElement;
      context = null;
      if (restoreFocus && restore?.focus) restore.focus();
    }

    function open(measurement, triggerElement = null) {
      if (!measurement) return false;
      context = { measurementId: measurement.id, restoreFocusElement: triggerElement };
      draft = normalized(measurement.runDetails);
      el('runDetailsTitle').textContent = 'Run Details';
      el('runDetailsSummary').textContent = measurement.name ? `Details for ${measurement.name}.` : 'Add notes and media for this run.';
      render();
      modal.classList.add('show');
      focusLater(() => el('runDetailsText').focus());
      return true;
    }

    function save() {
      if (!context) return false;
      draft.text = el('runDetailsText').value;
      const details = normalized(draft);
      const result = onSave ? onSave(context.measurementId, details) : false;
      if (result === false) return false;
      close();
      return true;
    }

    el('runDetailsClose').addEventListener('click', () => close());
    el('runDetailsCancel').addEventListener('click', () => close());
    el('runDetailsSave').addEventListener('click', save);
    el('runDetailsPhotoButton').addEventListener('click', () => el('runDetailsPhotoInput').click());
    el('runDetailsVideoButton').addEventListener('click', () => el('runDetailsVideoInput').click());
    el('runDetailsPhotoInput').addEventListener('change', event => addFiles('photos', event.target.files).finally(() => { event.target.value = ''; }));
    el('runDetailsVideoInput').addEventListener('change', event => addFiles('videos', event.target.files).finally(() => { event.target.value = ''; }));
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.addEventListener('click', event => {
      const remove = event.target.closest?.('.run-details-remove');
      if (!remove || !modal.contains(remove)) return;
      const kind = remove.dataset.kind === 'videos' ? 'videos' : 'photos';
      draft[kind].splice(Number(remove.dataset.index), 1);
      renderMediaList(kind);
    });

    return {
      open,
      close,
      save,
      addFiles,
      isOpen() {
        return modal.classList.contains('show');
      },
      draftDetails() {
        draft.text = el('runDetailsText').value;
        return normalized(draft);
      },
    };
  }

  function bindRunDetailModal({
    root = document,
    sidebarRoot,
    sidebarController,
    state,
    stateStore,
    measurementCommands,
    measurementById,
    createHistorySnapshot,
    recordHistory,
    renderList,
    redraw,
    showStatus,
    view = window,
  } = {}) {
    function saveRunDetailsForMeasurement(measurementId, details) {
      const historyBefore = createHistorySnapshot();
      const result = measurementCommands.saveMeasurementRunDetails(state.measurements, measurementId, details);
      if (!result.updated) return false;
      stateStore.setMeasurements(state, result.measurements, { selectedId: result.measurement.id });
      recordHistory(historyBefore, 'run details');
      renderList();
      redraw();
      showStatus('Run details saved.');
      return true;
    }

    const modal = createRunDetailModal({
      root,
      normalizeRunDetails: window.TakeoffRunDetails?.normalizeRunDetails,
      onSave: saveRunDetailsForMeasurement,
    });

    function openRunDetailsForMeasurement(measurementId, triggerElement) {
      const measurement = measurementById(measurementId);
      if (measurement) modal.open(measurement, triggerElement);
    }

    function handleKeyDown(event) {
      if (!modal.isOpen()) return;
      if (event.key === 'Escape') modal.close();
      event.stopPropagation();
      if (event.key === 'Escape') event.preventDefault();
    }

    sidebarController.bindRunDetailsControls({ root: sidebarRoot, openDetails: openRunDetailsForMeasurement });
    view.addEventListener('keydown', handleKeyDown);

    return {
      ...modal,
      destroy() {
        view.removeEventListener('keydown', handleKeyDown);
      },
    };
  }

  window.TakeoffRunDetailModal = {
    createAttachmentId,
    attachmentRecordFromFile,
    attachmentDisplayName,
    formatBytes,
    createRunDetailModal,
    bindRunDetailModal,
  };
})();
