# EmbedPDF Engine Adapter Design

## Goal

Replace Takeoff's direct PDF.js coupling with a small PDF engine adapter so PDF rendering can move to EmbedPDF/PDFium without breaking the existing Takeoff UI, calibration, measurements, page navigation, export, or continuous-scroll overlay contracts.

## Current State

Takeoff loads PDFs in `src/main.js` with `pdfjsLib.getDocument({ data }).promise`, stores the PDF object on `state.pdf`, and renders pages through `state.pdf.getPage(pageNum)`. Single-page view blits one rendered canvas into `baseCanvas`. Continuous scroll now paints separate page canvases into `#continuousBasePages`, but still requests pages through the same PDF.js page API.

Measurements, calibration, hit testing, and overlays all depend on page-local CSS pixel coordinates. That coordinate contract must not change.

## Recommended Approach

Add a framework-neutral adapter owned by Takeoff:

- `src/app/pdf-engine.js` creates a document object with stable methods: `getPageCount()`, `getPageInfo(pageNumber)`, `renderPage(pageNumber, options)`, and `destroy()`.
- The adapter tries EmbedPDF/PDFium first for PDFs.
- If EmbedPDF/PDFium is not available, fails to initialize, or fails to load a specific PDF, it falls back to PDF.js.
- `src/main.js` uses only the adapter contract and no longer calls `state.pdf.getPage()` directly.

This keeps the current UI and overlay model intact while replacing the unstable rendering layer underneath it.

## Import And Rendering Requirements

PDF import must preserve:

- Correct page count.
- Correct page order.
- Correct page dimensions after page rotation/orientation is applied.
- Correct per-page CSS width and height used by measurements.
- Flattened imported PDF annotations/forms into the rendered page bitmap.
- Crisp rendering at zoom by rendering each page at the requested scale multiplied by the capped device pixel ratio.

Annotations are display-only for now. They are rendered into the page bitmap. Takeoff will not expose imported annotations as editable objects in this phase.

## EmbedPDF/PDFium Integration

Use the EmbedPDF engine where possible because its engine API supports rendering pages with annotations:

```js
engine.renderPage(doc, page, {
  scaleFactor,
  dpr,
  rotation,
  withAnnotations: true,
})
```

If the higher-level engine package is too large or incompatible with the current app shell, use `@embedpdf/pdfium` directly and render with PDFium WASM. The direct PDFium fallback must still render annotation appearances into the bitmap if the exposed rendering flags support it. If flattened annotation rendering cannot be proven locally, keep PDF.js as the active fallback for that PDF and report the limitation.

## Data Contract

The adapter returns cache entries in the same shape the app already understands:

```js
{
  canvas,
  cssWidth,
  cssHeight,
  renderScale,
  engine: 'embedpdf' | 'pdfjs'
}
```

`cssWidth` and `cssHeight` are the unscaled displayed page size in CSS pixels. `canvas.width / cssWidth` and `canvas.height / cssHeight` must match the requested render scale closely enough for crisp zoom.

## Failure Behavior

The app must not fail open into a blank viewer. If EmbedPDF/PDFium fails:

- Log the engine failure for debugging.
- Use PDF.js for the same PDF.
- Keep the current user-facing load and render behavior.
- Preserve undo/history/document tab behavior.

If both engines fail, show the existing "Could not load that file. Try another PDF or image." status.

## Testing Requirements

Automated tests must cover:

- Adapter falls back to PDF.js when the preferred engine is unavailable.
- Adapter reports page count and page dimensions through the stable contract.
- Adapter render entries preserve `cssWidth`, `cssHeight`, and high-DPI canvas backing scale.
- Rendering options request flattened annotations.
- `src/main.js` no longer calls `state.pdf.getPage()` directly outside the adapter.
- Continuous rendering still consumes the same cache entry shape.

Browser QA must cover:

- A generated multi-page PDF uploads successfully.
- A landscape/portrait mixed PDF shows pages with correct orientation and page fit.
- A PDF with a visible annotation renders that annotation flattened into the page.
- Single-page zoom becomes crisp after rerender.
- Continuous-scroll zoom rerenders visible pages at higher backing resolution.
- Existing measurement and calibration flows still work after PDF import.

## Non-Goals

- Editing imported PDF annotations.
- Replacing Takeoff toolbar, sidebar, calibration modal, or measurement UI with EmbedPDF viewer UI.
- Rewriting the measurement geometry model.
- Removing PDF.js in the first implementation branch.
