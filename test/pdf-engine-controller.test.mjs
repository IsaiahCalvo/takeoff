import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPdfEngineController() {
  const source = await readFile(new URL('../src/app/pdf-engine-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'pdf-engine-controller.js' });
  return sandbox.window.TakeoffPdfEngineController;
}

test('PDF renderer choices are current PDF.js and sharp PDF.js only', async () => {
  const controller = await loadPdfEngineController();

  assert.equal(controller.normalizeChoice('pdfjs-current'), 'pdfjs-current');
  assert.equal(controller.normalizeChoice('pdfjs-sharp'), 'pdfjs-sharp');
  assert.equal(controller.normalizeChoice('pdfjs'), 'pdfjs-current');
  assert.equal(controller.normalizeChoice('embedpdf'), 'pdfjs-current');
  assert.equal(controller.label('pdfjs-current'), 'PDF.js Current');
  assert.equal(controller.label('pdfjs-sharp'), 'PDF.js Sharp');
  assert.equal(controller.isSharpMode('pdfjs-sharp'), true);
  assert.equal(controller.isSharpMode('pdfjs-current'), false);
});

test('engine toggle reflects PDF.js current and sharp options', async () => {
  const controller = await loadPdfEngineController();
  const buttons = [
    { dataset: { pdfEngine: 'pdfjs-current' }, classList: new Set(), attrs: {} },
    { dataset: { pdfEngine: 'pdfjs-sharp' }, classList: new Set(), attrs: {} },
  ];
  for (const button of buttons) {
    button.classList.toggle = (className, active) => active ? button.classList.add(className) : button.classList.delete(className);
    button.setAttribute = (name, value) => { button.attrs[name] = value; };
  }
  const toggle = {
    hidden: true,
    title: '',
    querySelectorAll: () => buttons,
  };
  const state = { pdf: { engine: 'pdfjs' }, pdfEngineChoice: 'pdfjs-sharp' };
  const instance = controller.createPdfEngineController({
    state,
    pdfEngine: {},
    pdfjsLib: {},
    logger: { setContext() {} },
    toggle,
    documentStore: { activeDocumentName: () => 'Drawing.pdf' },
    currentPage: () => 1,
    totalPages: () => 1,
    renderPdfPage: async () => true,
    saveActiveDocument() {},
    showStatus() {},
  });

  instance.updateToggle();

  assert.equal(toggle.hidden, false);
  assert.equal(toggle.title, 'PDF renderer: PDF.js Sharp');
  assert.equal(buttons[0].classList.has('active'), false);
  assert.equal(buttons[1].classList.has('active'), true);
  assert.equal(buttons[1].attrs['aria-pressed'], 'true');
});
