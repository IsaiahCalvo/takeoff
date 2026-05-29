# Team Readiness Audit

Date: 2026-05-29

## Purpose

This audit answers one question: can multiple engineers or agents work on Takeoff without colliding in the same files?

Current answer after the first remediation pass: safer than before, but not fully team-ready yet. Core math, measurement helpers, measurement commands, calibration, history, hit-testing, keyboard input decisions, viewer zoom/fit math, PDF page cache policy, sidebar summary rules, SVG drawing, and document state reset/restore work can now happen in separate modules; pointer input, document loading, and workflow wiring still risk collisions in `index.html`.

## Executive Summary

`index.html` remains the main blocker for full team-scale work. It still contains markup, CSS, global state, PDF rendering, image loading, pointer input handling, sidebar rendering, modal wiring, export wiring, and document switching.

Initial audit finding: that file was 4,767 lines out of 5,405 tracked source/test lines. Recent commits repeatedly changed hundreds of lines in `index.html`, which means unrelated work is forced through one high-conflict file.

Initial audit finding: the file had 190 top-level functions, 75 event listener bindings, and more than 500 direct `state.` references. Those numbers are a practical warning: there are too many ways for unrelated changes to touch the same implementation.

First remediation pass: geometry, measurement, command, calibration, history, hit testing, input, viewer, PDF page cache, sidebar, state, and SVG drawing helpers were extracted to `public/app/geometry.js`, `public/app/measurements.js`, `public/app/measurement-commands.js`, `public/calibration-utils.js`, `public/app/history.js`, `public/app/hit-testing.js`, `public/app/input-controller.js`, `public/app/viewer.js`, `public/app/pdf-page-cache.js`, `public/app/sidebar.js`, `public/app/state.js`, and `public/app/svg-renderer.js`, with direct tests in matching `test/*.test.mjs` files. After the latest readiness pass, `index.html` is 4,083 lines with 128 top-level functions, 80 event listener bindings, and 441 direct `state.` references. The direct test suite has 72 tests.

The healthiest modules now follow a consistent pattern: a small browser-global interface, meaningful behavior behind it, and direct `node:test` coverage. The codebase should keep moving behavior into modules like `public/app/geometry.js`, `public/app/measurements.js`, `public/app/measurement-commands.js`, `public/app/hit-testing.js`, `public/app/input-controller.js`, `public/app/viewer.js`, `public/app/pdf-page-cache.js`, `public/app/svg-renderer.js`, `public/app/history.js`, `public/app/state.js`, `public/calibration-utils.js`, and `public/export-utils.js`.

## Current Module Map

| Area | Current location | Current problem |
| --- | --- | --- |
| App state | `index.html`, `public/app/state.js` | Defaults, reset, and restore are separated; feature workflows still mutate one shared state object. |
| Document snapshots/history | `index.html`, `public/app/history.js`, `public/app/state.js` | History mechanics and document restore state are separated, but document tabs, redraw calls, and saved document state are still coupled. |
| PDF/image loading | `index.html` | File loading, PDF.js, image bitmap handling, canvas sizing, and user status messages are fused. |
| PDF page rendering/cache | `index.html`, `public/app/viewer.js`, `public/app/pdf-page-cache.js` | Zoom/fit math and cache policy are separated; PDF.js rendering, DOM canvas mutation, navigation tokens, and page-ready UI updates still share one seam. |
| Input handling | `index.html`, `public/app/input-controller.js` | Keyboard decisions are separated; pointer input, pan, select, erase, calibrate, measure, drag, label movement, and freehand drawing still live in long event handlers. |
| Measurement model/commands | `public/app/measurements.js`, `public/app/measurement-commands.js`, `index.html` | Core helpers and many command rules are separated; drag/rotate workflow wiring, history labels, selection, and UI refresh still live in `index.html`. |
| Geometry | `public/app/geometry.js` | Good module shape; keep feature work here when it is pure math/geometry. |
| Calibration UI and rules | `index.html` plus `public/calibration-utils.js` | Apply/reset data rules are separated; modal DOM and history/redraw wiring still live inline. |
| Drawing/rendering | `public/app/svg-renderer.js`, `index.html` | SVG drawing helpers are separated; `redraw()` still coordinates measurement filtering, rotation overlay, previews, and hitbox reset. |
| Hit testing | `public/app/hit-testing.js` | Good module shape; input handlers call this instead of owning target detection directly. |
| Sidebar | `index.html`, `public/app/sidebar.js` | Summary/grouping rules, all-page collapse model, and row-click rules are separated; DOM rendering, navigation, deletion, editing, and selection are still coupled. |
| Export | `public/export-utils.js` | Good module shape; keep this pattern. |

Generated output note: `dist/index.html` mirrors `index.html` and is ignored. It is not an ownership target.

## Collision Risks

### P0: `index.html` Is a Shallow Module

`index.html` has a huge implementation behind no meaningful interface. Its interface is effectively "everything global on the page." That gives low locality: a change to calibration, rendering, measurement editing, or sidebar behavior often requires editing the same file.

Deletion test: deleting `index.html` does not remove one concept; it removes the entire product. That means it is not a useful module boundary.

### P0: Global `state` Still Has Too Much Ownership

The global `state` object is now created and reset through `public/app/state.js`, which gives defaults and document transitions a real seam. But the object still mixes document state, viewer state, calibration state, measurement state, interaction state, history, cache state, and UI state.

This still limits safe parallel ownership because every team needs to know which fields other teams might mutate. The next state-store pass should add owned slice helpers for viewer, document, interaction, and measurement state instead of letting new code write arbitrary fields.

### P0: Pointer Handlers Are Too Broad

The mouse/pointer section is the highest-risk collaboration area. It directly handles selection, calibration, measurement creation, freehand drawing, dragging, panning, erasing, hover state, cursor state, and redraws.

Any team working on drawing, editing, continuous scroll, page transforms, or hit-testing will collide here.

### P1: Rendering and Hit Testing Share State

`redraw()` at `index.html:4303` renders visible measurements and also rebuilds `state.labelHitboxes`. This means a rendering change can accidentally break label dragging or hit testing.

Drawing should produce visual output. Hitbox generation should be a separate interface.

### P1: Measurement Commands Are Only Partially Centralized

Measurement command rules now cover creation, freehand creation, delete, cut/copy/paste, naming, anchor editing, and geometry finalization. Higher-level workflows still live in many places: drag, rotate, calibration reset, clear all, history labels, selection updates, list rendering, redraw, and saved document state.

That command interface is deeper than before, but not finished. The app still needs one higher-level command seam that owns mutation side effects and returns a result describing what the UI should refresh.

### P1: Tests Cover Module Rules, Not Full Product Workflows

The tests now cover export helpers, calibration summaries, geometry, command behavior, hit testing, document state, history, viewer math, sidebar grouping/collapse rules, and rendering helpers. They still do not cover full browser workflows such as file upload, pointer drawing, calibration modal interaction, document switching, and sidebar DOM editing end to end.

This still makes large UI refactors risky unless extraction is done with tests first and browser smoke checks.

## Target Architecture

The goal is not "many tiny files." The goal is deeper modules: small interfaces with meaningful implementation behind them.

### Proposed Modules

| Module | Owned files | Interface | Why it helps parallel work |
| --- | --- | --- | --- |
| App shell | `index.html`, later `public/app.js` | Boot app, wire modules, own DOM root | Only coordinators touch this. |
| State store | `public/app/state.js` | Create state, reset document state, restore document state, then add typed slices | Makes ownership explicit. |
| Geometry | `public/app/geometry.js` | Distance, projection, bounds, curve fitting, transforms | Pure module; safe for one team. |
| Measurement model | `public/app/measurements.js` | Create, clone, name, length, page filtering | Drawing/sidebar/export depend on one stable interface. |
| Measurement commands | `public/app/measurement-commands.js` | Create/delete/move/rotate/paste/reset commands | Centralizes history, recompute, selection, redraw triggers. |
| Calibration | `public/app/calibration.js` or expanded `public/calibration-utils.js` | Parse page ranges, compute scale, apply/reset page scales, eligibility | Lets calibration and continuous-scroll work avoid UI files. |
| Document adapters | `public/app/documents.js`, `public/app/pdf-adapter.js`, `public/app/image-adapter.js` | Load document, page count, render page, dimensions | PDF and image behavior stop touching input/sidebar code. |
| Viewer renderer | `public/app/viewer-renderer.js`, `public/app/pdf-page-cache.js` | Render current page, use page cache, fit/zoom model | Continuous-scroll work gets a real seam. |
| Drawing layer | `public/app/measurement-renderer.js` | Draw measurements, previews, labels | Visual work separated from model commands. |
| Hit testing | `public/app/hit-testing.js` | Given point and measurements, return target | Input work separated from SVG drawing. |
| Input controller | `public/app/input-controller.js` | Convert pointer/keyboard events into commands | Interaction work gets one owner. |
| Sidebar | `public/app/sidebar.js` | Render run list and dispatch selected commands | Sidebar changes stop touching geometry/rendering. |
| Export | `public/export-utils.js` | Build rows, CSV, summary, XLSX | Already in good shape. |

## Recommended Refactor Sequence

### Phase 1: Add Pure Seams First

Low collision, high safety.

1. Extract geometry functions from `index.html` into `public/app/geometry.js`.
2. Add `test/geometry.test.mjs`.
3. Extract page range and calibration scale helpers into a calibration module.
4. Keep browser-global compatibility while tests use direct helper loading.

Do not change UX in this phase.

### Phase 2: Create Measurement Model

Create `public/app/measurements.js` with a small interface:

- `createLineMeasurement(input)`
- `createFreehandMeasurement(input)`
- `cloneMeasurement(measurement)`
- `measurementLengthPx(measurement)`
- `measurementsForPage(measurements, page)`
- `renameMeasurement(measurement, value)`

Move data rules here, not DOM behavior.

### Phase 3: Centralize Commands

Create `public/app/measurement-commands.js`.

Commands should own mutation side effects:

- update measurements
- recompute lengths
- record history
- update selection
- return a result describing what UI should refresh

After this, feature agents should not directly mutate `state.measurements`.

### Phase 4: Split Rendering From Hit Testing

Move visual SVG drawing to `measurement-renderer.js`.

Move target detection to `hit-testing.js`.

Important rule: drawing should not be the only way to compute hitboxes. Hit testing should be testable without rendering SVG.

### Phase 5: Split Document/View Work

Create document adapters:

- PDF adapter wraps PDF.js.
- Image adapter wraps image bitmap behavior.
- Viewer renderer owns cache, page bitmap rendering, zoom/fit, and later continuous scroll.

This lets one team own PDF/scrolling without touching calibration or sidebar code.

### Phase 6: Extract Sidebar and Modal Controllers

Move sidebar list rendering and calibration modal behavior into separate modules after model/commands exist.

Doing this too early would just move tangled logic into new files.

## Team Ownership Map

| Team | Owns | Must not own |
| --- | --- | --- |
| Viewer team | PDF/image adapters, page cache, zoom/fit, continuous scroll | Measurement editing commands |
| Measurement team | Measurement model, geometry, commands | Sidebar DOM layout |
| Interaction team | Input controller, keyboard/mouse routing | Low-level PDF rendering |
| Calibration team | Calibration rules, page scale application, eligibility | SVG drawing |
| Sidebar team | Run list, grouping, selection UI | Geometry/math |
| Export team | CSV/XLSX/summary utilities | Viewer state |
| App shell owner | `index.html`/bootstrapping only | Feature logic |

## Agent Assignment Rules

Use these rules until the split is complete:

1. Only one agent may edit `index.html` at a time.
2. Agents working in `public/*-utils.js` must also own matching `test/*.test.mjs` files.
3. No agent should directly mutate `state.measurements` in new code; create or use a command helper.
4. Rendering changes must state whether they affect hitboxes.
5. Calibration changes must state whether they affect history/undo.
6. PDF rendering changes must state whether they affect page navigation and cache invalidation.
7. Every extracted module needs a test file before another team builds on it.

## Completed In This Branch

### Ticket 1: Extract Geometry Module

Files:

- create `public/app/geometry.js`
- create `test/geometry.test.mjs`
- update `index.html` only to call the module

Move first:

- `distancePx`
- `polylineLengthPx`
- `pointToSegmentDist`
- `projectPointToSegment`
- `projectPointToPolyline`
- `pointsBounds`
- `translatePoints`
- `rotatePoint`

Status: complete.

### Ticket 2: Extract Measurement Model

Files:

- create `public/app/measurements.js`
- create `test/measurements.test.mjs`

Move first:

- `isCurveMeasurement`
- `measurementLengthPx`
- `measurementDisplayPoints`
- `measurementsOnCurrentPage`
- `cleanMeasurementName`
- `defaultLabelT`
- clone helpers for points/segments

Status: complete for this pass. Length/display/curve helpers moved to `public/app/measurements.js`; create/delete/copy/paste/naming/anchor-edit rules moved to `public/app/measurement-commands.js`.

### Ticket 3: Extract Calibration Application Rules

Files:

- expand `public/calibration-utils.js` or create `public/app/calibration.js`
- expand `test/calibration-utils.test.mjs`

Move first:

- `parsePageRange`
- target page calculation
- `computePxPerInch`
- apply/reset scale data mutation helpers
- same-scale PDF eligibility helper

Status: partially complete. Page-range parsing, scale calculation, apply/reset helpers, and length recompute moved; modal DOM wiring remains in `index.html`.

### Additional Completed Tickets

- Extracted history mechanics to `public/app/history.js`.
- Extracted measurement command rules to `public/app/measurement-commands.js`.
- Extracted keyboard input decisions to `public/app/input-controller.js`.
- Extracted viewer zoom/fit math to `public/app/viewer.js`.
- Extracted sidebar summary/grouping rules, all-page collapse model, and row-click rules to `public/app/sidebar.js`.
- Extracted state defaults, document reset, and document restore to `public/app/state.js`.
- Added sidebar collapsed-page state to `public/app/state.js` document reset/restore.
- Extracted SVG path/drawing helpers to `public/app/svg-renderer.js`.
- Extracted pointer hit testing to `public/app/hit-testing.js`.
- Extracted PDF page cache, render-scale selection, and pre-render planning to `public/app/pdf-page-cache.js`.
- Added direct tests for every extracted module.
- Fixed sidebar UX so a single click anywhere on a run row, including its readonly title, selects the run while a double-click on the title still starts rename.
- Fixed All Pages sidebar UX so each page group has a left-side expand/collapse arrow while the existing Go action still navigates to that page.
- Added a GitHub Pages CI test step so `npm test` must pass before the live site builds.

## Second Deep-Dive Findings

Three read-only explorer agents audited the branch after the refactor. Their findings converged on the same next seams.

### 1. Pointer Interaction Module

Files: `index.html`, `public/app/input-controller.js`, `public/app/hit-testing.js`.

Problem: pointer handling still mixes pan, select, erase, calibration placement, measure placement, freehand drawing, drag state, rotation, hit testing, history, cursor style, list rendering, and redraw.

Solution: create `public/app/pointer-controller.js` that converts pointer events into actions/effects. `index.html` should only adapt DOM events to that interface.

Benefits: interaction work, measurement command work, sidebar work, and rendering work stop competing in one handler cluster. Tests can cover pointer priority and drag/finalize sequences without a browser.

### 2. Document And Viewer Adapters

Files: `index.html`, `public/app/viewer.js`, `public/app/pdf-page-cache.js`.

Problem: file type detection, PDF.js usage, image decode, canvas blitting, navigation tokens, and UI refresh are fused in the app shell. Page cache policy is now separated.

Solution: create `document-loader`, `pdf-adapter`, `image-adapter`, and `viewer-renderer` modules with a shared document/page rendering interface. Keep cache policy in `public/app/pdf-page-cache.js`.

Benefits: PDF rendering, image support, cache policy, zoom fidelity, and future continuous-scroll work can proceed without touching measurement editing or sidebar behavior.

### 3. Sidebar View Module

Files: `index.html`, `public/app/sidebar.js`.

Problem: the sidebar model is separated, but DOM rendering, row click routing, name editing, delete buttons, page jumps, collapse persistence, and selected-row syncing still live in `index.html`.

Solution: create `public/app/sidebar-view.js` that renders from `TakeoffSidebar.buildSidebarModel()` and emits actions such as `selectMeasurement`, `deleteMeasurement`, `renameMeasurement`, `togglePageGroup`, and `goToPage`.

Benefits: sidebar layout and UX work no longer touches measurement workflows or the app shell.

### 4. Measurement And Calibration Workflows

Files: `index.html`, `public/app/measurement-commands.js`, `public/calibration-utils.js`.

Problem: pure helpers exist, but higher-level flows still duplicate history labels, selection changes, save behavior, status messages, sidebar refreshes, redraws, and validation.

Solution: add `measurement-workflows.js` and `calibration-workflows.js` to own complete user actions, then return effects for the app shell to apply.

Benefits: keyboard, context menu, sidebar, pointer, and modal entry points can share one tested workflow.

### 5. Repo And CI Organization

Files: `public/app`, `test`, `docs/team-readiness-audit.md`, `.github/workflows/pages.yml`.

Problem: the branch has many newly extracted modules/tests/docs. CI now runs the test suite before build; standalone mockups still need a keep/delete decision.

Solution: make the readiness slice explicit in version control and move standalone mockups into a prototypes/docs area if they should be kept.

Benefits: parallel agents and teammates get the same module map, test gate, and ownership surface before building new feature branches.

## Definition of Done For Team Readiness

The codebase is ready for broad parallel work when:

- `index.html` is mostly markup plus bootstrapping.
- No single feature requires editing `index.html`, model rules, and rendering in the same branch.
- Geometry, calibration, measurement model, and export have direct tests.
- Input handlers call command interfaces instead of mutating global state.
- PDF rendering has an adapter interface separate from image loading.
- Sidebar rendering consumes model/summary interfaces instead of computing business rules inline.

## Audit Verdict

Takeoff is no longer a pure single-owner codebase: geometry, measurement helpers, measurement command rules, calibration helpers, history, hit testing, keyboard input decisions, viewer zoom/fit math, PDF page cache policy, sidebar summary/collapse/click rules, state defaults/reset/restore, SVG drawing, and export can now be worked on independently.

It is still not fully ready for broad parallel feature teams. The next highest-value splits are pointer input, document/viewer adapters, sidebar DOM rendering, measurement/calibration workflows, and then a higher-level state/command coordinator with typed state slices.
