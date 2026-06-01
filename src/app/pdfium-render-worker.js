import { init, DEFAULT_PDFIUM_WASM_URL } from '@embedpdf/pdfium';

const FPDF_ANNOT = 0x01;
const FPDF_REVERSE_BYTE_ORDER = 0x10;
const PDFIUM_RENDER_FLAGS = FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER;
const WHITE_RGBA = 0xFFFFFFFF;
const documents = new Map();
let pdfiumModulePromise = null;

async function loadPdfiumModule() {
  if (!pdfiumModulePromise) {
    pdfiumModulePromise = (async () => {
      const response = await fetch(DEFAULT_PDFIUM_WASM_URL);
      if (!response.ok) throw new Error(`Could not load PDFium WASM: ${response.status}`);
      const pdfium = await init({ wasmBinary: await response.arrayBuffer() });
      pdfium.PDFiumExt_Init();
      return pdfium;
    })();
  }
  return pdfiumModulePromise;
}

function rotationDegrees(rotation) {
  return [0, 90, 180, 270][rotation] || 0;
}

function pageDimensions(pdfium, pagePtr) {
  const width = pdfium.FPDF_GetPageWidthF(pagePtr) || 1;
  const height = pdfium.FPDF_GetPageHeightF(pagePtr) || 1;
  const rotation = pdfium.FPDFPage_GetRotation(pagePtr) || 0;
  return {
    width,
    height,
    rotation,
    cssWidth: width,
    cssHeight: height,
  };
}

function documentEntry(docId) {
  const entry = documents.get(docId);
  if (!entry) throw new Error('PDF document is no longer open.');
  return entry;
}

async function openDocument({ data }) {
  const pdfium = await loadPdfiumModule();
  const content = new Uint8Array(data);
  const filePtr = pdfium.pdfium.wasmExports.malloc(content.length);
  pdfium.pdfium.HEAPU8.set(content, filePtr);
  const docPtr = pdfium.FPDF_LoadMemDocument(filePtr, content.length, '');
  if (!docPtr) {
    pdfium.pdfium.wasmExports.free(filePtr);
    throw new Error(`PDFium failed to load PDF: ${pdfium.FPDF_GetLastError?.() || 'unknown error'}`);
  }
  const docId = `pdfium-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pageCount = pdfium.FPDF_GetPageCount(docPtr);
  documents.set(docId, { pdfium, filePtr, docPtr, pageCount });
  return { docId, pageCount };
}

async function getPageInfo({ docId, pageNumber }) {
  const { pdfium, docPtr } = documentEntry(docId);
  const pagePtr = pdfium.FPDF_LoadPage(docPtr, pageNumber - 1);
  if (!pagePtr) throw new Error(`Invalid PDF page ${pageNumber}.`);
  try {
    const dims = pageDimensions(pdfium, pagePtr);
    return {
      pageNumber,
      cssWidth: dims.cssWidth,
      cssHeight: dims.cssHeight,
      rotation: rotationDegrees(dims.rotation),
    };
  } finally {
    pdfium.FPDF_ClosePage(pagePtr);
  }
}

async function renderPage({ docId, pageNumber, scale = 1, withAnnotations = true }) {
  const { pdfium, docPtr } = documentEntry(docId);
  const pagePtr = pdfium.FPDF_LoadPage(docPtr, pageNumber - 1);
  if (!pagePtr) throw new Error(`Invalid PDF page ${pageNumber}.`);
  let bitmapPtr = 0;
  try {
    const dims = pageDimensions(pdfium, pagePtr);
    const width = Math.max(1, Math.ceil(dims.cssWidth * scale));
    const height = Math.max(1, Math.ceil(dims.cssHeight * scale));
    bitmapPtr = pdfium.FPDFBitmap_Create(width, height, 0);
    if (!bitmapPtr) throw new Error('Could not create PDFium bitmap.');
    pdfium.FPDFBitmap_FillRect(bitmapPtr, 0, 0, width, height, WHITE_RGBA);
    pdfium.FPDF_RenderPageBitmap(
      bitmapPtr,
      pagePtr,
      0,
      0,
      width,
      height,
      0,
      withAnnotations ? PDFIUM_RENDER_FLAGS : FPDF_REVERSE_BYTE_ORDER
    );
    const bufferPtr = pdfium.FPDFBitmap_GetBuffer(bitmapPtr);
    if (!bufferPtr) throw new Error('Could not read PDFium bitmap.');
    const bufferSize = width * height * 4;
    const rgba = new Uint8ClampedArray(pdfium.pdfium.HEAPU8.buffer, bufferPtr, bufferSize).slice();
    return {
      cssWidth: dims.cssWidth,
      cssHeight: dims.cssHeight,
      renderScale: scale,
      width,
      height,
      buffer: rgba.buffer,
      engine: 'pdfium-worker',
    };
  } finally {
    if (bitmapPtr) pdfium.FPDFBitmap_Destroy(bitmapPtr);
    pdfium.FPDF_ClosePage(pagePtr);
  }
}

async function closeDocument({ docId }) {
  const entry = documents.get(docId);
  if (!entry) return {};
  documents.delete(docId);
  entry.pdfium.FPDF_CloseDocument(entry.docPtr);
  entry.pdfium.pdfium.wasmExports.free(entry.filePtr);
  return {};
}

self.onmessage = async event => {
  const message = event.data || {};
  try {
    let result;
    if (message.type === 'open') result = await openDocument(message);
    if (message.type === 'getPageInfo') result = await getPageInfo(message);
    if (message.type === 'renderPage') result = await renderPage(message);
    if (message.type === 'close') result = await closeDocument(message);
    if (!result) throw new Error(`Unknown PDFium worker message: ${message.type}`);
    const transfer = result.buffer ? [result.buffer] : [];
    self.postMessage({ id: message.id, ok: true, result }, transfer);
  } catch (error) {
    self.postMessage({
      id: message.id,
      ok: false,
      error: error?.message || String(error),
    });
  }
};
