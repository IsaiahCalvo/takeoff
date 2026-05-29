# Team Readiness Audit

Date: 2026-05-29

## Purpose

This audit answers one question: can multiple engineers or agents work on Takeoff without colliding in the same files?

Current answer: much safer than the original codebase. `index.html` is now a small shell, app code is loaded from `src/main.js`, and most domain rules live in tested `src/app/*.js` modules. The remaining concentration is `src/main.js`, but it is now mostly runtime wiring instead of owning every rule directly. A follow-up Linear audit found the next feature cluster is Line/Freehand mode switching and reversible conversion, so this pass added measurement shape metadata before that work starts.

## Current Snapshot

- `index.html`: 264 lines. It is markup-only app shell plus one module entrypoint.
- `src/main.js`: 2,386 lines after this pass. It still wires PDF rendering, broad pointer input, sidebar list DOM, and redraw orchestration, but pointer drag rules, sidebar chrome rules, calibration modal chrome, and export/menu chrome now live in controllers.
- Tests: 134 `node:test` checks pass.
- Build: Vite builds the GitHub Pages bundle with relative asset paths.

## Healthy Modules

These areas now have a real module seam and matching test coverage:

- Geometry: `src/app/geometry.js`, `test/geometry.test.mjs`
- Measurement model and Line/Freehand shape metadata: `src/app/measurements.js`, `test/measurements.test.mjs`
- Measurement commands, including shape preservation through create/copy/paste: `src/app/measurement-commands.js`, `test/measurement-commands.test.mjs`
- Measurement workflows: `src/app/measurement-workflows.js`, `test/measurement-workflows.test.mjs`
- Calibration rules: `src/calibration-utils.js`, `src/app/calibration-workflow.js`, matching tests
- State store: `src/app/state.js`, `test/state.test.mjs`
- Document loading/adapters/store: `src/app/document-loader.js`, `src/app/document-adapters.js`, `src/app/document-store.js`, matching tests
- Export controller: `src/app/export-controller.js`, `test/export-controller.test.mjs`
- Page state: `src/app/page-state.js`, `test/page-state.test.mjs`
- Viewer math and PDF cache: `src/app/viewer.js`, `src/app/pdf-page-cache.js`, matching tests
- Hit testing: `src/app/hit-testing.js`, `test/hit-testing.test.mjs`
- Input decisions: `src/app/input-controller.js`, `src/app/pointer-controller.js`, `src/app/pointer-workflow.js`, matching tests. Measurement drag, rotation drag, and typed rotation are covered there.
- Sidebar model/view templates, row view-models, page-group chrome, tooltip state, and scope chrome: `src/app/sidebar.js`, `src/app/sidebar-view.js`, `src/app/sidebar-controller.js`, matching tests
- SVG rendering helpers: `src/app/svg-renderer.js`, `test/svg-renderer.test.mjs`
- Units and formatting: `src/app/units.js`, `test/units.test.mjs`
- Tooltip controller: `src/app/tooltip-controller.js`, `test/tooltip-controller.test.mjs`
- Export helpers: `src/export-utils.js`, `test/export-utils.test.mjs`
- Source growth guard: `test/deployment-paths.test.mjs`

## Linear Prep From This Pass

- KAL-116 through KAL-124 describe Line/Freehand mode switching, reversible conversion, context-menu actions, and QA. The model now has explicit shape helpers so that work can extend `shape` metadata instead of inspecting raw segments everywhere.
- New Line/Freehand measurements now get explicit shape metadata. Legacy measurements still infer shape from `drawType` or existing curve segments.
- Clipboard, paste, undo/redo, document snapshots, and document restore now deep-copy shape metadata so reversible conversion geometry will not be shared by accident.
- CSV/XLSX export now reads shape metadata and `drawType`, so Freehand measurements no longer export as Line by default.
- KAL-106 and KAL-109 cover same-scale continuous scroll. KAL-109 is already in review, so this pass did not duplicate that helper; future page-scale work should land through calibration/state-store helpers.
- KAL-98 and KAL-100 through KAL-102 cover Path Templates, grouping, and visibility. The next preparatory seam there should be a Path/Template model module before any right-panel grouping changes.

## Remaining Collision Risks

### P0: `src/main.js` Still Coordinates Too Much

`src/main.js` is no longer the entire app, but it still has 121 top-level functions, 76 event listener bindings, and 383 direct `state.` references. That makes it the main place where unrelated changes can collide.

Next best split when a related feature needs it: move `buildMeasItem()`/`renderList()` into a DOM-oriented sidebar controller, or move PDF render orchestration into a viewer runtime controller. Do not do a broad mechanical move without a focused test because those areas coordinate many callbacks.

### P0: Pointer Handlers Are Still Broad

The mouse section still handles selection, panning, measuring, freehand drawing, calibration, erasing, and label movement. Rotation and whole-measurement drag math have moved into `src/app/pointer-workflow.js`, but the event branch itself remains in `src/main.js`.

Target module: continue deepening `src/app/pointer-workflow.js`.

### P1: Sidebar DOM Rendering Is Still In The Runtime

Sidebar grouping rules, HTML snippets, row view-models, page-group collapse chrome, and page-info state are separated. `buildMeasItem()` and `renderList()` still live in `src/main.js` because they coordinate navigation, deletion, editing, selection, and redraw.

Target module: `src/app/sidebar-controller.js`.

### P1: Export And Unit Menus Are Still Inline

Export data rules, filenames, messages, low-level download helpers, export availability, and disclosure open/close state are separated. The remaining inline code chooses when to export, copy, or change units.

Target module: continue deepening `src/app/export-controller.js`.

### P1: Calibration Modal DOM Is Still Inline

Calibration parsing, reset messaging, application rules, modal open/close chrome, and range-scope display are tested. History and redraw coordination remain in `src/main.js`.

Target module: continue deepening `src/app/calibration-controller.js`.

## Recommended Next Sequence

1. Keep `src/main.js` under the tightened 2,400-line guard.
2. Move the rest of `buildMeasItem()` and `renderList()` only when doing right-panel feature work, with focused sidebar-controller tests first.
3. Move PDF page rendering orchestration only when doing document/viewer feature work, with viewer/cache tests first.
4. Keep new pointer behavior in `src/app/pointer-workflow.js`, not inline in mouse handlers.
5. Keep new modal/menu chrome in the matching controller, not inline in `src/main.js`.

## Ownership Rules

1. New behavior should go into `src/app/*.js` with a matching `test/*.test.mjs`.
2. `src/main.js` should only wire modules together; avoid adding new feature rules there.
3. Avoid direct new writes to `state.measurements`; use `src/app/measurement-commands.js` or `src/app/measurement-workflows.js`.
4. Rendering changes must state whether they affect hitboxes.
5. Calibration changes must state whether they affect history or undo.
6. PDF rendering changes must state whether they affect page navigation or cache invalidation.
7. Generated `dist/` files are not ownership targets.
