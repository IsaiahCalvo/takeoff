# Team Readiness Audit

Date: 2026-05-29

## Purpose

This audit answers one question: can multiple engineers or agents work on Takeoff without colliding in the same files?

Current answer: much safer than the original codebase. `index.html` is now a small shell, app code is loaded from `src/main.js`, and many rules live in tested `src/app/*.js` modules. The remaining blocker is that `src/main.js` still owns too much runtime orchestration.

## Current Snapshot

- `index.html`: 264 lines. It is markup-only app shell plus one module entrypoint.
- `src/main.js`: 2,426 lines after this pass. It still wires PDF rendering, broad pointer input, sidebar list DOM, calibration modal DOM, unit menu DOM, and redraw orchestration.
- Tests: 118 `node:test` tests pass.
- Build: Vite builds the GitHub Pages bundle with relative asset paths.

## Healthy Modules

These areas now have a real module seam and matching test coverage:

- Geometry: `src/app/geometry.js`, `test/geometry.test.mjs`
- Measurement model: `src/app/measurements.js`, `test/measurements.test.mjs`
- Measurement commands: `src/app/measurement-commands.js`, `test/measurement-commands.test.mjs`
- Measurement workflows: `src/app/measurement-workflows.js`, `test/measurement-workflows.test.mjs`
- Calibration rules: `src/calibration-utils.js`, `src/app/calibration-workflow.js`, matching tests
- State store: `src/app/state.js`, `test/state.test.mjs`
- Document loading/adapters/store: `src/app/document-loader.js`, `src/app/document-adapters.js`, `src/app/document-store.js`, matching tests
- Export controller: `src/app/export-controller.js`, `test/export-controller.test.mjs`
- Page state: `src/app/page-state.js`, `test/page-state.test.mjs`
- Viewer math and PDF cache: `src/app/viewer.js`, `src/app/pdf-page-cache.js`, matching tests
- Hit testing: `src/app/hit-testing.js`, `test/hit-testing.test.mjs`
- Input decisions: `src/app/input-controller.js`, `src/app/pointer-controller.js`, `src/app/pointer-workflow.js`, matching tests
- Sidebar model/view templates and scope chrome: `src/app/sidebar.js`, `src/app/sidebar-view.js`, `src/app/sidebar-controller.js`, matching tests
- SVG rendering helpers: `src/app/svg-renderer.js`, `test/svg-renderer.test.mjs`
- Units and formatting: `src/app/units.js`, `test/units.test.mjs`
- Tooltip controller: `src/app/tooltip-controller.js`, `test/tooltip-controller.test.mjs`
- Export helpers: `src/export-utils.js`, `test/export-utils.test.mjs`
- Source growth guard: `test/deployment-paths.test.mjs`

## Remaining Collision Risks

### P0: `src/main.js` Still Coordinates Too Much

`src/main.js` is no longer the entire app, but it still has 121 top-level functions, 76 event listener bindings, and 398 direct `state.` references. That makes it the main place where unrelated changes can collide.

Next best split: continue extracting pointer-mode workflows from `src/main.js` into a controller that receives page/viewer helpers and returns commands.

### P0: Pointer Handlers Are Still Broad

The mouse section still handles selection, panning, measuring, freehand drawing, calibration, dragging, erasing, label movement, and rotation. Any future work on measuring behavior can still collide there.

Target module: continue deepening `src/app/pointer-workflow.js`.

### P1: Sidebar DOM Rendering Is Still In The Runtime

Sidebar grouping rules and HTML snippets are separated, but `buildMeasItem()` and `renderList()` still live in `src/main.js` because they coordinate navigation, deletion, editing, selection, and redraw.

Target module: `src/app/sidebar-controller.js`.

### P1: Export And Unit Menus Are Still Inline

Export data rules, filenames, messages, and low-level download helpers are separated. Unit menu DOM and export menu open/close wiring still live in `src/main.js`.

Target module: continue deepening `src/app/export-controller.js`.

### P1: Calibration Modal DOM Is Still Inline

Calibration parsing, reset messaging, and application rules are tested, but modal open/close, input validation wiring, history, and redraw coordination remain in `src/main.js`.

Target module: continue deepening `src/app/calibration-controller.js`.

## Recommended Next Sequence

1. Continue extracting pointer drag and selection branches into `src/app/pointer-workflow.js`.
2. Move `buildMeasItem()` and `renderList()` into `src/app/sidebar-controller.js`.
3. Move calibration modal open/close and validation wiring into `src/app/calibration-controller.js`.
4. Move unit menu and export menu open/close wiring into `src/app/export-controller.js`.
5. Tighten the `src/main.js` source-size guard after each successful split.

## Ownership Rules

1. New behavior should go into `src/app/*.js` with a matching `test/*.test.mjs`.
2. `src/main.js` should only wire modules together; avoid adding new feature rules there.
3. Avoid direct new writes to `state.measurements`; use `src/app/measurement-commands.js` or `src/app/measurement-workflows.js`.
4. Rendering changes must state whether they affect hitboxes.
5. Calibration changes must state whether they affect history or undo.
6. PDF rendering changes must state whether they affect page navigation or cache invalidation.
7. Generated `dist/` files are not ownership targets.
