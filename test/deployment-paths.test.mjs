import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';

async function listFilesRecursively(root, prefix = '') {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursively(new URL(`${entry.name}/`, root), `${relativePath}/`));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

function unsafeLocalAssetRefs(source) {
  const refs = [];
  const attrPattern = /\b(?:src|href)=["']([^"']+)["']/g;
  const cssUrlPattern = /url\(["']?([^"')]+)["']?\)/g;
  for (const [, value] of source.matchAll(attrPattern)) refs.push(value);
  for (const [, value] of source.matchAll(cssUrlPattern)) refs.push(value);
  return refs.filter(value => {
    const ref = value.trim();
    if (!ref || ref.startsWith('#') || ref.startsWith('data:')) return false;
    if (/^(?:https?:)?\/\//.test(ref)) return false;
    return ref.startsWith('/');
  });
}

async function readIndexAndSidebarView() {
  const [html, main, sidebar, sidebarView, sidebarController, styles] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sidebar.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sidebar-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sidebar-controller.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8'),
  ]);
  return { html, main, sidebar, sidebarView, sidebarController, styles, source: `${html}\n${main}\n${sidebar}\n${sidebarView}\n${sidebarController}\n${styles}` };
}

test('index uses relative local asset paths for GitHub Pages subpath deploys', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const rootRelativeRefs = [...html.matchAll(/\b(?:src|href)=["']\/(?!\/)|url\(["']?\/(?!\/)/g)]
    .map(match => match[0]);

  assert.deepEqual(rootRelativeRefs, []);
});

test('index keeps app shell styles in an external stylesheet', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<link rel="stylesheet" href="\.\/app\/styles\.css" \/>/);
  assert.doesNotMatch(html, /<style>/);
});

test('index delegates app startup to one module entrypoint', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /<script src="src\/app\/pointer-controller\.js"><\/script>/);
  assert.doesNotMatch(html, /<script>\s*pdfjsLib\.GlobalWorkerOptions/);
  assert.match(main, /import '\.\/export-utils\.js';/);
  assert.match(main, /import '\.\/app\/path-aggregation\.js';/);
  assert.match(main, /import '\.\/app\/pointer-controller\.js';/);
  assert.match(main, /const pdfjsLib = window\.pdfjsLib;/);
});

test('index stays a small app shell instead of owning app logic', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const lineCount = html.trimEnd().split('\n').length;

  assert.equal(lineCount < 350, true, `index.html has ${lineCount} lines`);
  assert.doesNotMatch(html, /function loadFile\(/);
  assert.doesNotMatch(html, /function renderList\(/);
  assert.doesNotMatch(html, /addEventListener\('mousedown'/);
});

test('main runtime stays below the current coordination ceiling', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const lineCount = main.trimEnd().split('\n').length;

  assert.equal(lineCount < 2560, true, `src/main.js has ${lineCount} lines`);
  assert.doesNotMatch(main, /function downloadBytes\(/);
  assert.doesNotMatch(main, /function positionToolTip\(/);
  assert.match(main, /TakeoffPointerWorkflow/);
  assert.match(main, /TakeoffExportController/);
  assert.match(main, /TakeoffCalibrationController/);
  assert.match(main, /TakeoffSidebarController/);
});

test('vite builds bundled assets with relative paths for GitHub Pages', async () => {
  const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

  assert.match(config, /base:\s*['"]\.\/['"]/);
});

test('run summary text is owned by the dynamic counter', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /<span id="runCount">[^<]*<\/span>\s+runs/);
});

test('home shell preserves upload controls and mounts Path Templates', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(html, /class="home-shell"/);
  assert.match(html, /class="home-upload-panel"/);
  assert.match(html, /id="pathTemplatesHome" class="path-template-home" aria-label="Path templates"/);
  assert.match(html, /id="fileInput"/);
  assert.match(html, /id="uploadButton"/);
  assert.match(html, /id="emptyUploadButton"/);
  assert.match(styles, /\.path-template-home\s*\{/);
  assert.match(styles, /body\.no-document #status\s*\{\s*display:\s*none;\s*\}/);
  assert.match(styles, /\.path-template-editor::-webkit-scrollbar\s*\{/);
  assert.match(styles, /scrollbar-color:\s*rgba\(125,\s*138,\s*145,\s*0\.34\)\s*transparent/);
  assert.match(main, /import '\.\/app\/path-template-view\.js';/);
  assert.match(main, /createPathTemplateHome/);
});

test('pan toolbar icon is inline so it cannot lose its mask asset path', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const panButton = html.match(/<button id="btn-pan"[\s\S]*?<\/button>/)?.[0] || '';

  assert.match(panButton, /<svg\b/);
  assert.doesNotMatch(panButton, /mask-icon|toolbar-pan\.svg/);
});

test('toolbar icons use one inline svg contract instead of external mask assets', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8');
  const publicFiles = await listFilesRecursively(new URL('../public/', import.meta.url));
  const toolbarButtons = [...html.matchAll(/<button id="(btn-[^"]+)" class="tool-btn"[\s\S]*?<\/button>/g)];

  assert.ok(toolbarButtons.length >= 4, 'expected primary toolbar buttons to be covered');
  for (const [markup, id] of toolbarButtons) {
    assert.match(markup, /<svg\b/, `${id} must render an inline SVG icon`);
    assert.doesNotMatch(markup, /mask-icon|toolbar-[a-z-]+\.svg|--icon:url/, `${id} must not use external icon masks`);
    assert.doesNotMatch(markup, /<defs\b|filter=["']url\(/, `${id} must not depend on per-icon svg filter URLs`);
  }
  assert.doesNotMatch(styles, /\.mask-icon|\bmask:\s*var\(--icon\)|-webkit-mask:\s*var\(--icon\)/);
  assert.deepEqual(publicFiles.filter(file => /^toolbar-.*\.svg$/.test(file)), []);
  assert.deepEqual(publicFiles.filter(file => /(?:^|\/)toolbar-.*\.svg$/.test(file)), []);
});

test('local asset references stay subpath safe in html and css', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8');

  assert.deepEqual(unsafeLocalAssetRefs(`${html}\n${styles}`), []);
});

test('calibration apply scope uses one compact combo row', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8');
  const menuRule = styles.match(/\.calib-scope-menu\s*\{[^}]+\}/)?.[0] || '';
  const modalSelectRule = styles.match(/\.modal select\s*\{[^}]+\}/)?.[0] || '';
  const hiddenFieldRule = styles.match(/\.modal \.field\[hidden\]\s*\{[^}]+\}/)?.[0] || '';
  const sourceFieldRule = styles.match(/\.modal \.field\.calibration-source-field\s*\{[^}]+\}/)?.[0] || '';
  const sourceMainRule = styles.match(/\.calib-source-main,\s*\.calib-source-option-main\s*\{[^}]+\}/)?.[0] || '';
  const sourceMenuRule = styles.match(/\.calib-source-options\s*\{[^}]+\}/)?.[0] || '';

  assert.match(html, /id="calibScopeCombo"/);
  assert.match(html, /id="calibScopeDisplay"[^>]+aria-haspopup="menu"[^>]+aria-expanded="false"[^>]+aria-controls="calibScopeOptions"/);
  assert.match(html, /id="calibScopeMenu"[^>]+aria-expanded="false"/);
  assert.match(html, /id="calibSourceDisplay"[^>]+aria-label="Match calibration from"/);
  assert.match(html, /id="calibSourceOptions"[^>]+role="menu"/);
  assert.match(html, />Apply to the current page<\/button>/);
  assert.match(html, />Apply to all pages<\/button>/);
  assert.match(html, />Apply to a selected group of pages<\/button>/);
  assert.doesNotMatch(html, /id="calibRangeField"/);
  assert.match(styles, /\.calib-scope-combo\.custom input\[type=text\]\.calib-scope-range\s*\{\s*display:\s*block;/);
  assert.match(styles, /\.calib-scope-menu::before/);
  assert.match(modalSelectRule, /appearance:\s*none/);
  assert.match(modalSelectRule, /padding:\s*10px\s*34px\s*10px\s*12px/);
  assert.match(modalSelectRule, /data:image\/svg\+xml/);
  assert.match(modalSelectRule, /M2\.5 4\.5 6 8l3\.5-3\.5/);
  assert.match(modalSelectRule, /background-position:\s*calc\(100% - 14px\)\s*50%/);
  assert.match(modalSelectRule, /background-size:\s*12px\s*12px/);
  assert.match(menuRule, /justify-content:\s*center/);
  assert.match(hiddenFieldRule, /display:\s*none !important/);
  assert.match(sourceFieldRule, /display:\s*block/);
  assert.match(sourceMainRule, /display:\s*grid/);
  assert.match(sourceMainRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*96px\s*58px/);
  assert.match(sourceMenuRule, /max-height:\s*250px/);
  assert.match(sourceMenuRule, /scrollbar-width:\s*thin/);
});

test('select-like controls keep visible focus and left-aligned trigger text', async () => {
  const styles = await readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8');
  const modalSelectFocusRule = styles.match(/\.modal select:focus(?:-visible)?\s*\{[^}]+\}/)?.[0] || '';
  const footerUnitRule = styles.match(/\.footer \.unit-select-button\s*\{[^}]+\}/)?.[0] || '';

  assert.match(modalSelectFocusRule, /border-color:\s*var\(--accent\)/);
  assert.match(modalSelectFocusRule, /box-shadow:\s*0 0 0 2px var\(--accent-soft\)/);
  assert.match(footerUnitRule, /justify-content:\s*flex-start/);
});

test('measure mode menu uses Line and Freehand product wording', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, />Line<\/button>/);
  assert.match(html, />Freehand<\/button>/);
  assert.doesNotMatch(html, /Free hand|Bezier|Bézier|spline|polyline/);
});

test('context menu exposes only Line and Freehand conversion wording', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8');
  const contextMenu = html.match(/<div id="contextMenu"[\s\S]*?<\/div>/)?.[0] || '';

  assert.match(contextMenu, /data-action="convert-to-line"[^>]*>Convert to Line<\/button>/);
  assert.match(contextMenu, /data-action="convert-to-freehand"[^>]*>Convert to Freehand<\/button>/);
  assert.match(contextMenu, /data-action="merge-paths"[^>]*>Merge Paths<\/button>/);
  assert.doesNotMatch(contextMenu, /Bezier|Bézier|spline|polyline|curve/i);
  assert.match(styles, /\.context-menu button\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});

test('bottom-left HUD exposes the Snap to paths toggle beside cursor status', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8');
  const hud = html.match(/<div class="hud">[\s\S]*?<\/div>\s*<\/div>\s*<\/main>/)?.[0] || '';

  assert.match(hud, /id="cursorPos"/);
  assert.match(hud, /id="snapToPaths"/);
  assert.match(hud, />Snap to paths<\/span>/);
  assert.match(styles, /\.snap-toggle\s*\{/);
});

test('freehand completion keeps the app in measure mode', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const finishFreehand = main.match(/function finishFreehandMeasurement\(\) \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(finishFreehand, /function finishFreehandMeasurement/);
  assert.doesNotMatch(finishFreehand, /setMode\('selection'\)/);
});

test('calibration drafts are page-owned in continuous mode', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const calibrationBranch = main.match(/\} else if \(state\.mode === 'calibrate'\) \{[\s\S]*?\n  \} else if \(state\.mode === 'measure'\) \{/)?.[0] || '';
  const previewBlock = main.match(/\/\/ in-progress[\s\S]*?if \(state\.freehandDraft\)/)?.[0] || '';

  assert.match(calibrationBranch, /const rawInfo = drawingPointInfo\(p\)/);
  assert.match(calibrationBranch, /rawInfo\.page !== state\.inProgress\.page/);
  assert.match(calibrationBranch, /placementPointInfo\(p,\s*\{\s*page:\s*state\.inProgress\?\.page \|\| rawInfo\.page/);
  assert.match(calibrationBranch, /page:\s*drawInfo\.page/);
  assert.match(calibrationBranch, /points:\s*\[drawInfo\.point\]/);
  assert.match(calibrationBranch, /point:\s*drawInfo\.point/);
  assert.match(previewBlock, /const drawPts = continuousMeasurements\.stackPointsForPage\(state,\s*page,\s*pts\);/);
});

test('page changes default uncalibrated pages to pan mode', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const helper = main.match(/function syncPageScaleAndMode[^\n]+/)?.[0] || '';
  const onPageReady = main.match(/function onPageReady[\s\S]*?\n\}/)?.[0] || '';
  const continuousPageBranch = main.match(/if \(state\.continuousScrollMode && state\.continuousPageLayout\) \{[\s\S]*?\n    return;\n  \}/)?.[0] || '';

  assert.match(helper, /stateStore\.syncCurrentPageScale\(state,\s*page\)/);
  assert.match(helper, /if \(!state\.pxPerInch\) setMode\('pan'\)/);
  assert.match(onPageReady, /syncPageScaleAndMode\(currentPage\(\)\)/);
  assert.match(continuousPageBranch, /syncPageScaleAndMode\(n\)/);
});

test('continuous fit view targets the active page instead of the full stacked document', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const fitToView = main.match(/function fitToView[\s\S]*?\n\}/)?.[0] || '';

  assert.match(fitToView, /continuousRenderer\.fitTransformForPage/);
  assert.match(fitToView, /layout:\s*state\.continuousPageLayout/);
  assert.match(fitToView, /page:\s*state\.pdfPage/);
  assert.match(fitToView, /fitMode/);
});

test('continuous toggle preserves the current viewport anchor instead of refitting', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const toggleHandler = main.match(/\$\('continuousScrollToggle'\)\.addEventListener\('click'[\s\S]*?\n\}\);/)?.[0] || '';

  assert.match(toggleHandler, /captureViewportAnchor/);
  assert.match(toggleHandler, /renderPdfPage\(\{\s*fit:\s*false/);
  assert.match(toggleHandler, /preserveContinuousLayer:\s*wasContinuous/);
  assert.match(toggleHandler, /restoreViewportAnchor/);
  assert.doesNotMatch(toggleHandler, /renderPdfPage\(\{\s*fit:\s*true/);
});

test('continuous page layer is retained for fast toggle re-entry', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const renderContinuous = main.match(/async function renderContinuousPdfPage[\s\S]*?\n\}/)?.[0] || '';
  const blitToBase = main.match(/function blitToBase[\s\S]*?\n\}/)?.[0] || '';

  assert.match(renderContinuous, /cachedContinuousPageLayout/);
  assert.match(renderContinuous, /cachedContinuousLayerMatches\(pages,\s*cachedLayer\)/);
  assert.match(blitToBase, /preserveContinuousLayer/);
  assert.match(blitToBase, /layer\.hidden = true/);
});

test('continuous navigation keeps document-wide mode across mixed-calibration pages', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const goToPage = main.match(/async function goToPage[\s\S]*?\n\}/)?.[0] || '';

  assert.match(goToPage, /const eligibility = continuousEligibility\(n\)/);
  assert.match(main, /pdfContinuousScrollEligibility/);
  assert.doesNotMatch(main, /sameScalePageGroupEligibility/);
  assert.match(goToPage, /state\.continuousScrollMode = eligibility\.eligible && wasContinuous/);
  assert.doesNotMatch(goToPage, /preferredGroupMode/);
  assert.match(goToPage, /if \(!eligibility\.eligible\) state\.continuousPageLayout = null/);
});

test('continuous toggle stores one document-level on off state', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const toggleHandler = main.match(/\$\('continuousScrollToggle'\)\.addEventListener\('click'[\s\S]*?\n\}\);/)?.[0] || '';

  assert.match(toggleHandler, /state\.continuousScrollMode = !state\.continuousScrollMode/);
  assert.match(toggleHandler, /saveActiveDocument\(\)/);
  assert.doesNotMatch(toggleHandler, /recordGroupPreference/);
});

test('continuous page layer is prewarmed before the first toggle', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(main, /function scheduleContinuousLayerPrewarm/);
  assert.match(main, /activatePageLayer:\s*false/);
  assert.match(main, /state\.cachedContinuousPageLayout\s*=\s*result\.layout/);
  assert.match(main, /scheduleContinuousLayerPrewarm\(eligibility\)/);
});

test('viewport transforms are constrained to keep the page in view', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const applyTransform = main.match(/function applyTransform\(\) \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(applyTransform, /constrainViewportPan\(\)/);
  assert.match(main, /viewerModel\.constrainPanToBounds/);
});

test('continuous rendering uses a dedicated per-page bitmap layer', async () => {
  const { html, styles } = await readIndexAndSidebarView();
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(html, /id="continuousBasePages"/);
  assert.match(styles, /#continuousBasePages/);
  assert.match(main, /pageLayer:\s*\$\('continuousBasePages'\)/);
});

test('continuous scroll active state highlights the icon instead of button chrome', async () => {
  const { styles } = await readIndexAndSidebarView();
  const activeRule = styles.match(/\.left-rail \.continuous-scroll-toggle\.active,\s*\n\.left-rail \.continuous-scroll-toggle\[aria-pressed="true"\]\s*\{[^}]+\}/)?.[0] || '';
  const iconRule = styles.match(/\.left-rail \.continuous-scroll-toggle\[aria-pressed="true"\] svg\s*\{[^}]+\}/)?.[0] || '';

  assert.match(activeRule, /background:\s*transparent/);
  assert.match(activeRule, /border-color:\s*transparent/);
  assert.match(activeRule, /box-shadow:\s*none/);
  assert.match(activeRule, /color:\s*var\(--accent\)/);
  assert.match(iconRule, /filter:\s*drop-shadow/);
});

test('continuous PDF pages do not draw gray page borders', async () => {
  const { styles } = await readIndexAndSidebarView();
  const renderer = await readFile(new URL('../src/app/continuous-renderer.js', import.meta.url), 'utf8');
  const continuousCanvasRules = [...styles.matchAll(/#continuousBasePages canvas\s*\{[^}]*\}/g)]
    .map(match => match[0])
    .join('\n');

  assert.doesNotMatch(continuousCanvasRules, /box-shadow|border/);
  assert.doesNotMatch(renderer, /strokeRect\(page\.x,\s*page\.y,\s*page\.width,\s*page\.height\)/);
});

test('upload controls avoid native browser title tooltips', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const uploadButton = html.match(/<button id="uploadButton"[\s\S]*?>/)?.[0] || '';
  const emptyUploadButton = html.match(/<button id="emptyUploadButton"[\s\S]*?>/)?.[0] || '';

  assert.doesNotMatch(uploadButton, /\btitle=/);
  assert.doesNotMatch(emptyUploadButton, /\btitle=/);
  assert.match(uploadButton, /aria-label="Upload Image\/PDF"/);
});

test('canvas Length editor is rendered inline with the floating SVG tag', async () => {
  const [html, styles, renderer] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/svg-renderer.js', import.meta.url), 'utf8'),
  ]);
  const editorRule = styles.match(/\.canvas-length-tag-edit\s*\{[^}]+\}/)?.[0] || '';
  const inputRule = styles.match(/\.canvas-length-tag-input\s*\{[^}]+\}/)?.[0] || '';
  const inputSelectionRule = styles.match(/\.canvas-length-tag-input::selection\s*\{[^}]+\}/)?.[0] || '';
  const unitRule = styles.match(/\.canvas-length-tag-unit\s*\{[^}]+\}/)?.[0] || '';

  assert.doesNotMatch(html, /id="lengthEditPill"/);
  assert.doesNotMatch(html, /id="lengthEditInput"/);
  assert.doesNotMatch(styles, /\.length-edit-pill/);
  assert.match(renderer, /const fontSize = overlayPageSize\(13\);/);
  assert.match(renderer, /foreignObject/);
  assert.match(renderer, /canvasLengthEditInput/);
  assert.match(renderer, /'font-family': "'JetBrains Mono', monospace"/);
  assert.match(renderer, /'font-weight': 700/);
  assert.match(editorRule, /background:\s*rgba\(11,13,14,0\.96\)/);
  assert.match(editorRule, /border:\s*1px solid var\(--length-tag-color\)/);
  assert.match(editorRule, /pointer-events:\s*auto/);
  assert.match(inputRule, /font-family:\s*'JetBrains Mono', monospace/);
  assert.match(inputRule, /font-size:\s*var\(--length-tag-font-size\)/);
  assert.match(inputRule, /font-weight:\s*700/);
  assert.match(inputRule, /line-height:\s*var\(--length-tag-font-size\)/);
  assert.match(inputRule, /font-variant-numeric:\s*tabular-nums/);
  assert.match(inputSelectionRule, /background:\s*color-mix\(in srgb, var\(--length-tag-color\) 38%, transparent\)/);
  assert.match(unitRule, /font-size:\s*var\(--length-tag-font-size\)/);
  assert.match(unitRule, /font-weight:\s*700/);
  assert.match(unitRule, /line-height:\s*var\(--length-tag-font-size\)/);
});

test('continuous zoom sharpening caps render scale by page bounds', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const desiredScale = main.match(/function desiredPdfRenderScale[\s\S]*?\n\}/)?.[0] || '';

  assert.match(desiredScale, /continuousRenderer\.pageRenderBounds\(state\.continuousPageLayout\)/);
  assert.match(desiredScale, /baseWidth:\s*renderBounds\.width/);
  assert.match(desiredScale, /baseHeight:\s*renderBounds\.height/);
});

test('main renders PDFs through the Takeoff PDF engine adapter', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(main, /import '\.\/app\/pdf-engine\.js';/);
  assert.match(main, /const pdfEngine = window\.TakeoffPdfEngine;/);
  assert.match(main, /pdfEngine\.createPdfEngineDocument/);
  assert.doesNotMatch(main, /state\.pdf\.getPage\(/);
});

test('PDF rendering has no user-facing fallback toggle', async () => {
  const { html, main, styles } = await readIndexAndSidebarView();

  assert.doesNotMatch(html, /id="pdfEngineToggle"/);
  assert.doesNotMatch(html, /data-pdf-engine=/);
  assert.doesNotMatch(html, /PDF\.js Current/);
  assert.doesNotMatch(html, /PDF\.js Sharp/);
  assert.doesNotMatch(styles, /pdf-engine/);
  assert.doesNotMatch(main, /pdfEngineChoice/);
  assert.doesNotMatch(main, /pdf-engine-controller/);
  assert.doesNotMatch(main, /switchPdfEngine/);
  assert.match(main, /createPdfEngineDocument\(\{ data: buf, pdfjsLib \}\)/);
});

test('PDF.js detail tile is layered above the base bitmap and below measurements', async () => {
  const { html, main, styles } = await readIndexAndSidebarView();

  assert.match(html, /id="baseCanvas"[\s\S]*id="pdfDetailCanvas"[\s\S]*id="drawCanvas"/);
  assert.match(styles, /#pdfDetailCanvas/);
  assert.match(main, /import '\.\/app\/pdf-detail-tile\.js';/);
  assert.match(main, /TakeoffPdfDetailTile\.createPdfDetailTileController/);
  assert.match(main, /pdfDetailTile\.baseRenderScale/);
  assert.match(main, /pdfDetailTile\.schedule/);
  assert.match(main, /renderContinuousPdfPage[\s\S]*pdfDetailTile\.baseRenderScale\(minRenderScale\)/);
});

test('single-page documents remove scope chrome entirely', async () => {
  const { html, styles, source } = await readIndexAndSidebarView();
  const hiddenRule = styles.match(/\.tabs\[hidden\]\s*\{[^}]+\}/)?.[0] || '';

  assert.match(html, /<div id="scopeTabs" class="tabs">/);
  assert.match(html, /data-tab="page">This Page/);
  assert.match(html, /data-tab="categories">Categories/);
  assert.match(html, /data-tab="all">All Pages/);
  assert.match(source, /function documentPageCount\(\)/);
  assert.match(source, /function updateSidebarScopeChrome\(model\)/);
  assert.match(source, /scopeTabs\.hidden = !model\.showScopeTabs;/);
  assert.match(source, /totalHeading\.textContent = model\.totalHeadingText;/);
  assert.match(hiddenRule, /display:\s*none !important/);
  assert.doesNotMatch(html, /singleScopeTitle/);
  assert.doesNotMatch(html, /single-scope-title/);
  assert.doesNotMatch(html, /scopeTitle/);
  assert.match(styles, /content:\s*'Nothing measured yet\.'/);
  assert.doesNotMatch(html, /No runs measured yet\./);
});

test('right-panel scope tabs fit three Path views without horizontal overflow', async () => {
  const { html, styles, source } = await readIndexAndSidebarView();
  const tabsRule = styles.match(/\.tabs\s*\{[^}]+\}/)?.[0] || '';
  const tabRule = styles.match(/\.tab\s*\{[^}]+\}/)?.[0] || '';

  assert.match(html, /data-tab="page">This Page<\/button>/);
  assert.match(html, /data-tab="categories">Categories<\/button>/);
  assert.match(html, /data-tab="all">All Pages<\/button>/);
  assert.match(tabsRule, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(tabRule, /min-width:\s*0/);
  assert.match(tabRule, /overflow:\s*hidden/);
  assert.match(tabRule, /text-overflow:\s*ellipsis/);
  assert.match(source, /effectiveSidebarTab === 'categories'/);
  assert.match(source, /Categories Total/);
});

test('Path group rows expose marker, title, category, total, run count, and page coverage', async () => {
  const { styles, source } = await readIndexAndSidebarView();
  const pathGroupRule = styles.match(/\.path-group\s*\{[^}]+\}/)?.[0] || '';
  const summaryRule = styles.match(/\.path-group-summary\s*\{[^}]+\}/)?.[0] || '';
  const titleRule = styles.match(/\.path-group-title\s*\{[^}]+\}/)?.[0] || '';
  const totalRule = styles.match(/\.path-group-total\s*\{[^}]+\}/)?.[0] || '';
  const chipRule = styles.match(/\.path-group-chip\s*\{[^}]+\}/)?.[0] || '';

  assert.match(source, /buildPathGroupMarkup/);
  assert.match(source, /class="path-group-marker"/);
  assert.match(source, /class="path-group-title"/);
  assert.match(source, /class="path-group-subtitle"/);
  assert.match(source, /class="path-group-total"/);
  assert.match(source, /class="path-group-chip"/);
  assert.match(source, /pageCoverageText/);
  assert.match(pathGroupRule, /overflow:\s*hidden/);
  assert.match(summaryRule, /grid-template-columns:\s*20px minmax\(0,\s*1fr\) minmax\(46px,\s*auto\)/);
  assert.match(titleRule, /text-overflow:\s*ellipsis/);
  assert.match(totalRule, /max-width:\s*74px/);
  assert.match(chipRule, /white-space:\s*nowrap/);
});

test('canvas length labels expose a chevron-only navigation path to the selected sidebar run', async () => {
  const { main, styles, source } = await readIndexAndSidebarView();
  const mousedownHandler = main.match(/stage\.addEventListener\('mousedown'[\s\S]*?\n\}\);/)?.[0] || '';
  const labelNavRule = styles.match(/\.canvas-length-tag-nav\s*\{[^}]+\}/)?.[0] || '';
  const labelNavHoverRule = styles.match(/\.canvas-length-tag:hover \.canvas-length-tag-nav,[\s\S]*?\{[^}]+\}/)?.[0] || '';

  assert.match(source, /data-length-label-nav/);
  assert.match(source, /M4\.5 3 7\.5 6 4\.5 9/);
  assert.match(labelNavRule, /opacity:\s*0/);
  assert.match(labelNavRule, /pointer-events:\s*auto/);
  assert.match(labelNavHoverRule, /opacity:\s*1/);
  assert.match(mousedownHandler, /lengthLabelNavigationTarget\(e\.target\)/);
  assert.match(mousedownHandler, /navigateLengthLabelToSidebar\(labelNavTarget\)[\s\S]*return;/);
  assert.match(main, /state\.selectedId = measurement\.id;/);
  assert.match(main, /revealMeasurementInSidebar\(measurement\.id\)/);
  assert.match(main, /isMeasurementVisibleForPathCategories\(measurement\)/);
});

test('measurement list uses a slim themed vertical scrollbar only', async () => {
  const { styles } = await readIndexAndSidebarView();
  const measListRule = styles.match(/\.meas-list\s*\{[^}]+\}/)?.[0] || '';
  const webkitTrackRule = styles.match(/\.meas-list::-webkit-scrollbar-track\s*\{[^}]+\}/)?.[0] || '';
  const webkitThumbRule = styles.match(/\.meas-list::-webkit-scrollbar-thumb\s*\{[^}]+\}/)?.[0] || '';

  assert.match(measListRule, /overflow-y:\s*auto/);
  assert.match(measListRule, /overflow-x:\s*hidden/);
  assert.match(measListRule, /scrollbar-width:\s*thin/);
  assert.match(measListRule, /scrollbar-color:\s*rgba\(125,\s*138,\s*145,\s*0\.34\)\s*transparent/);
  assert.match(styles, /\.meas-list::-webkit-scrollbar\s*\{\s*width:\s*6px;/);
  assert.match(webkitTrackRule, /background:\s*transparent/);
  assert.match(webkitThumbRule, /background:\s*rgba\(125,\s*138,\s*145,\s*0\.34\)/);
  assert.match(webkitThumbRule, /border-radius:\s*999px/);
});

test('Path group rows nest full-width child runs with existing row controls', async () => {
  const { styles, source } = await readIndexAndSidebarView();
  const runsRule = styles.match(/\.path-group-runs\s*\{[^}]+\}/)?.[0] || '';
  const childItemRule = styles.match(/\.path-group \.meas-item\s*\{[^}]+\}/)?.[0] || '';
  const childRowRule = styles.match(/\.path-group \.meas-item \.row\s*\{[^}]+\}/)?.[0] || '';
  const itemRule = styles.match(/\n\s*\.meas-item\s*\{[^}]+\}/)?.[0] || '';
  const rowRule = styles.match(/\n\s*\.meas-item \.row\s*\{[^}]+\}/)?.[0] || '';
  const inputRule = styles.match(/\n\s*\.meas-item input\.name\s*\{[^}]+\}/)?.[0] || '';
  const lengthRule = styles.match(/\n\s*\.meas-item \.len\s*\{[^}]+\}/)?.[0] || '';
  const deleteRule = styles.match(/\n\s*\.meas-item \.del\s*\{[^}]+\}/)?.[0] || '';
  const selectedUnscaledRule = styles.match(/\.meas-item\.selected\.unscaled\s*\{[^}]+\}/)?.[0] || '';

  assert.match(source, /group\.categoryVisible === false \|\| group\.isVisible === false \? 'hidden' : ''/);
  assert.match(source, /header\.className = 'path-group-row';/);
  assert.match(source, /runs\.className = 'path-group-runs';/);
  assert.match(source, /groupEl\.appendChild\(header\);/);
  assert.match(source, /runs\.appendChild\(buildMeasItem\(m\)\);/);
  assert.match(source, /groupEl\.appendChild\(runs\);/);
  assert.match(runsRule, /display:\s*grid/);
  assert.match(runsRule, /gap:\s*3px/);
  assert.match(runsRule, /padding:\s*4px/);
  assert.match(itemRule, /display:\s*flex/);
  assert.match(itemRule, /align-items:\s*center/);
  assert.match(rowRule, /align-items:\s*center/);
  assert.match(rowRule, /width:\s*100%/);
  assert.match(inputRule, /height:\s*20px/);
  assert.match(inputRule, /line-height:\s*20px/);
  assert.match(lengthRule, /display:\s*inline-flex/);
  assert.match(lengthRule, /align-items:\s*center/);
  assert.match(deleteRule, /display:\s*inline-flex/);
  assert.match(deleteRule, /align-items:\s*center/);
  assert.match(selectedUnscaledRule, /border-color:\s*var\(--accent\)/);
  assert.match(selectedUnscaledRule, /box-shadow:\s*0 0 0 1px var\(--accent\)/);
  assert.match(childItemRule, /width:\s*100%/);
  assert.match(childItemRule, /min-height:\s*31px/);
  assert.match(childItemRule, /padding:\s*3px 5px/);
  assert.match(childRowRule, /grid-template-columns:\s*8px minmax\(0,\s*1fr\) auto auto auto/);
  assert.match(childRowRule, /min-height:\s*17px/);
});

test('category tab renders aggregation category sections around Path groups', async () => {
  const { styles, source } = await readIndexAndSidebarView();
  const toolbarRule = styles.match(/\.path-category-visibility-toolbar\s*\{[^}]+\}/)?.[0] || '';
  const sectionRule = styles.match(/\.path-category-section\s*\{[^}]+\}/)?.[0] || '';
  const headerRule = styles.match(/\.path-category-header\s*\{[^}]+\}/)?.[0] || '';
  const titleRule = styles.match(/\.path-category-title\s*\{[^}]+\}/)?.[0] || '';
  const summaryRule = styles.match(/\.path-category-summary\s*\{[^}]+\}/)?.[0] || '';

  assert.match(source, /function categorySectionViewModel\(category, pathGroupsByKey, unit\)/);
  assert.match(source, /totalsScope:\s*'visible'/);
  assert.match(source, /pathCategoryVisibility:\s*stateStore\.pathCategoryVisibilityForAggregation\(state\)/);
  assert.match(source, /effectiveSidebarTab === 'categories' \? categorySections : \[\]/);
  assert.match(source, /function appendPathGroupCategories\(sections, controls\)/);
  assert.match(source, /buildCategoryVisibilityToolbarMarkup/);
  assert.match(source, /bindCategoryVisibilityControls/);
  assert.match(source, /data-path-category-key/);
  assert.match(source, /data-category-visibility-action="show-all"/);
  assert.match(source, /class="path-category-title"/);
  assert.match(source, /class="path-category-summary"/);
  assert.match(toolbarRule, /justify-content:\s*space-between/);
  assert.match(sectionRule, /display:\s*grid/);
  assert.match(headerRule, /justify-content:\s*space-between/);
  assert.match(titleRule, /text-overflow:\s*ellipsis/);
  assert.match(summaryRule, /max-width:\s*100%/);
});

test('hidden category styling uses an icon-only gray shell without broad row dimming', async () => {
  const { styles, source } = await readIndexAndSidebarView();
  const hiddenIconRule = styles.match(/\.path-category-icon\.hidden-icon\s*\{[^}]+\}/)?.[0] || '';
  const categoryHiddenRule = styles.match(/\.path-category-section\.category-hidden\s*\{[^}]+\}/)?.[0] || '';
  const pathHiddenMarkerRule = styles.match(/\.path-group\.hidden \.path-group-marker\s*\{[^}]+\}/)?.[0] || '';

  assert.match(source, /class="path-category-icon/);
  assert.match(source, /path-category-icon-template/);
  assert.match(source, /path-category-icon-manual/);
  assert.match(hiddenIconRule, /border-color:\s*#5a666e/);
  assert.match(hiddenIconRule, /background:\s*transparent/);
  assert.doesNotMatch(categoryHiddenRule, /opacity/);
  assert.doesNotMatch(pathHiddenMarkerRule, /filter:\s*grayscale/);
  assert.doesNotMatch(styles, /\.path-group\.hidden :is\(\.path-group-title,\s*\.path-group-total\)/);
  assert.doesNotMatch([hiddenIconRule, categoryHiddenRule, pathHiddenMarkerRule].join('\n'), /#f00|#ff0000|\bred\b/i);
});
