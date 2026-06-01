# EmbedPDF Engine Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe PDF engine adapter that can render with EmbedPDF/PDFium while preserving PDF.js fallback and all existing Takeoff UI contracts.

**Architecture:** Introduce `src/app/pdf-engine.js` as the only PDF loading/rendering seam. `src/main.js` will load PDFs through the adapter and render pages through adapter methods. The first shipped version must preserve PDF.js fallback and only use EmbedPDF/PDFium when local tests prove the contract.

**Tech Stack:** Browser globals, Vite, Node test runner, PDF.js fallback, EmbedPDF/PDFium candidate packages.

---

## File Structure

- Create `src/app/pdf-engine.js`: owns the stable PDF document adapter API.
- Modify `src/main.js`: replace direct PDF.js loading/page rendering with the adapter.
- Modify `index.html`: load any browser-safe EmbedPDF/PDFium assets needed by the adapter, while keeping PDF.js fallback.
- Modify `package.json` and `package-lock.json`: add EmbedPDF/PDFium package only if the browser integration is proven.
- Add `test/pdf-engine.test.mjs`: contract tests for load fallback, page info, rendering options, and annotation-flattening options.
- Modify `test/deployment-paths.test.mjs`: static guard that app code uses the adapter seam instead of direct `state.pdf.getPage()`.

## Task 1: Add Adapter Contract Tests

**Files:**
- Create: `test/pdf-engine.test.mjs`
- Read: `src/app/document-adapters.js`

- [ ] **Step 1: Write the failing tests**

Create VM-based tests that load `src/app/pdf-engine.js` and assert these behaviors:

```js
test('createPdfEngineDocument falls back to PDF.js when preferred engine is unavailable', async () => {
  const pdfEngine = await loadPdfEngine();
  const calls = [];
  const doc = await pdfEngine.createPdfEngineDocument({
    data: new Uint8Array([1, 2, 3]).buffer,
    pdfjsLib: {
      getDocument({ data }) {
        calls.push(data.byteLength);
        return { promise: Promise.resolve(fakePdfDocument()) };
      },
    },
    preferredFactory: null,
  });
  assert.equal(doc.engine, 'pdfjs');
  assert.equal(doc.getPageCount(), 2);
  assert.deepEqual(calls, [3]);
});

test('PDF.js adapter returns page info and render entries through one contract', async () => {
  const pdfEngine = await loadPdfEngine();
  const doc = pdfEngine.createPdfJsDocument(fakePdfDocument());
  assert.deepEqual(await doc.getPageInfo(1), { pageNumber: 1, cssWidth: 612, cssHeight: 792, rotation: 0 });
  const entry = await doc.renderPage(1, { scale: 2 });
  assert.equal(entry.cssWidth, 612);
  assert.equal(entry.cssHeight, 792);
  assert.equal(entry.renderScale, 2);
  assert.equal(entry.engine, 'pdfjs');
});

test('preferred engine receives flattened annotation render options', async () => {
  const pdfEngine = await loadPdfEngine();
  const options = [];
  const doc = await pdfEngine.createPdfEngineDocument({
    data: new Uint8Array([4, 5, 6]).buffer,
    pdfjsLib: { getDocument: () => { throw new Error('PDF.js should not load'); } },
    preferredFactory: async () => ({
      engine: 'embedpdf',
      getPageCount: () => 1,
      getPageInfo: async () => ({ pageNumber: 1, cssWidth: 300, cssHeight: 200, rotation: 0 }),
      renderPage: async (_pageNumber, renderOptions) => {
        options.push(renderOptions);
        return fakeEntry({ engine: 'embedpdf', cssWidth: 300, cssHeight: 200, renderScale: renderOptions.scale });
      },
      destroy() {},
    }),
  });
  await doc.renderPage(1, { scale: 3 });
  assert.equal(doc.engine, 'embedpdf');
  assert.equal(options[0].withAnnotations, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/pdf-engine.test.mjs`

Expected: fails because `src/app/pdf-engine.js` does not exist.

## Task 2: Implement PDF.js Adapter

**Files:**
- Create: `src/app/pdf-engine.js`
- Test: `test/pdf-engine.test.mjs`

- [ ] **Step 1: Write minimal implementation**

Implement an IIFE that exposes `window.TakeoffPdfEngine` with:

```js
createPdfJsDocument(pdf)
createPdfEngineDocument({ data, pdfjsLib, preferredFactory })
```

The PDF.js adapter must:

- Return `engine: 'pdfjs'`.
- Return `getPageCount()` from `pdf.numPages`.
- Return `getPageInfo(pageNumber)` from `page.getViewport({ scale: 1 })`.
- Return `renderPage(pageNumber, { scale, withAnnotations = true })` as `{ canvas, cssWidth, cssHeight, renderScale, engine }`.
- Pass `annotationMode` to PDF.js when available without breaking older versions.
- No-op `destroy()` unless the PDF object exposes `destroy()`.

- [ ] **Step 2: Run adapter tests**

Run: `node --test test/pdf-engine.test.mjs`

Expected: all tests pass.

## Task 3: Wire Main Runtime To Adapter

**Files:**
- Modify: `src/main.js`
- Modify: `index.html`
- Modify: `test/deployment-paths.test.mjs`

- [ ] **Step 1: Add failing static guard**

Add a test to `test/deployment-paths.test.mjs`:

```js
test('main renders PDFs through the Takeoff PDF engine adapter', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /import '\\.\\/app\\/pdf-engine\\.js';/);
  assert.match(main, /const pdfEngine = window\\.TakeoffPdfEngine;/);
  assert.match(main, /pdfEngine\\.createPdfEngineDocument/);
  assert.doesNotMatch(main, /state\\.pdf\\.getPage\\(/);
});
```

- [ ] **Step 2: Run the static guard to verify it fails**

Run: `node --test test/deployment-paths.test.mjs`

Expected: fails because `main.js` still calls `state.pdf.getPage()`.

- [ ] **Step 3: Update runtime wiring**

Modify `src/main.js`:

- Import `./app/pdf-engine.js`.
- Define `const pdfEngine = window.TakeoffPdfEngine;`.
- In `loadFile`, call `pdfEngine.createPdfEngineDocument({ data: buf, pdfjsLib })`.
- Store the returned adapter as `state.pdf`.
- Update `renderPageToCanvas` to call `state.pdf.getPageInfo(pageNum)` and `state.pdf.renderPage(pageNum, { scale: renderScale, withAnnotations: true })`.
- Keep page cache entry shape unchanged.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
node --test test/pdf-engine.test.mjs
node --test test/deployment-paths.test.mjs
```

Expected: both pass.

## Task 4: Evaluate EmbedPDF/PDFium Browser Integration

**Files:**
- Modify only if proven: `package.json`, `package-lock.json`, `src/app/pdf-engine.js`, `index.html`

- [ ] **Step 1: Inspect package availability**

Run:

```bash
npm view @embedpdf/pdfium version
npm view @embedpdf/engines version
```

Expected: package versions are returned.

- [ ] **Step 2: Install package only if package metadata is valid**

Run:

```bash
npm install @embedpdf/pdfium @embedpdf/engines
```

Expected: packages install and audit has no critical vulnerability.

- [ ] **Step 3: Probe browser-compatible exports**

Run a temporary Node import probe outside committed source:

```bash
node -e "import('@embedpdf/pdfium').then(m=>console.log(Object.keys(m))).catch(e=>{console.error(e);process.exit(1)})"
node -e "import('@embedpdf/engines').then(m=>console.log(Object.keys(m))).catch(e=>{console.error(e);process.exit(1)})"
```

Expected: usable browser-facing exports are visible. If not, keep the installed packages out of the final diff.

- [ ] **Step 4: Implement preferred factory only if local probe succeeds**

Add a lazy preferred factory in `src/app/pdf-engine.js` that:

- Initializes PDFium/EmbedPDF lazily.
- Loads the PDF from the uploaded `ArrayBuffer`.
- Reports page count and page info.
- Renders pages with `withAnnotations: true`, requested `scale`, and DPR handling.
- Throws clearly on initialization/load/render failure so `createPdfEngineDocument` can fall back to PDF.js.

- [ ] **Step 5: Run adapter tests**

Run: `node --test test/pdf-engine.test.mjs`

Expected: pass.

## Task 5: Browser QA

**Files:**
- No committed source unless a defect is found.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

Expected: app serves on `http://127.0.0.1:5194/`.

- [ ] **Step 2: Upload generated PDFs and inspect rendering**

Use browser or Playwright to load:

- A generated portrait/landscape mixed PDF.
- A generated PDF with visible annotation if locally possible.
- A generated 10+ page PDF for continuous scroll.

Expected:

- Page count correct.
- Page orientation correct.
- Annotations visible as flattened page content.
- Single-page zoom rerenders with higher canvas backing scale.
- Continuous-scroll zoom rerenders page canvases with higher backing scale.

- [ ] **Step 3: Verify measurement/calibration smoke flow**

In the browser:

- Upload PDF.
- Calibrate a page.
- Draw a line measurement.
- Switch pages.
- Enable continuous scroll after matching calibration.

Expected: existing UI and overlays continue to work.

## Task 6: Final Verification And Merge Readiness

**Files:**
- All changed files.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
npm run build
```

Expected: tests pass and build passes. Existing Vite warning for runtime CSS is acceptable.

- [ ] **Step 2: Review diff**

Run:

```bash
git diff --stat
git diff
```

Expected: changes are limited to the adapter, main wiring, tests, docs, and proven dependency lockfile changes.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers src test index.html package.json package-lock.json
git commit -m "Add PDF engine adapter"
```

Expected: one coherent feature commit on `codex/embedpdf-engine-adapter`.
