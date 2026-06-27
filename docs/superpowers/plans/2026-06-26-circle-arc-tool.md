# Circle Arc Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a focused V1 circle/arc measurement tool with CAD-inspired construction modes and scale-aware radius, diameter, circumference, arc length, and angle output.

**Architecture:** Add first-class `circle` and `arc` measurement shapes instead of approximating them as freehand curves. Keep reusable geometry math in `src/app/geometry.js`, measurement semantics in `src/app/measurements.js`, and UI integration in existing measurement/render/sidebar/export modules.

**Tech Stack:** Vanilla browser modules loaded through `src/main.js`, SVG overlay rendering, Node `node:test`, Vite dev/build.

## Global Constraints

- Preserve existing `line`, `freehand`, and `path` behavior.
- Treat current dirty edits in `src/app/geometry.js`, `src/app/measurements.js`, `test/geometry.test.mjs`, and `test/measurements.test.mjs` as user-owned.
- Use TDD: write failing tests before implementation changes.
- Circle V1 modes: center-radius, center-diameter, 2-point diameter, 3-point circle.
- Arc V1 modes: 3-point arc and center-start-end.
- Circle total length is circumference; arc total length is arc length.
- Show circle metrics: radius, diameter, circumference.
- Show arc metrics: radius, arc length, angle in degrees and radians.
- Defer tangent circle and advanced AutoCAD arc variants.

---

### Task 1: Geometry And Measurement Semantics

**Files:**
- Modify: `src/app/geometry.js`
- Modify: `src/app/measurements.js`
- Test: `test/geometry.test.mjs`
- Test: `test/measurements.test.mjs`

**Interfaces:**
- Produce `circleFromCenterRadius`, `circleFromDiameterPoints`, `circleFromThreePoints`, `arcFromCenterStartEnd`, `arcFromThreePoints`, `sampleCirclePoints`, `sampleArcPoints`, `projectPointToCircle`, `projectPointToArc`, and angle helpers.
- Produce measurement shape support for `circle` and `arc`.

- [ ] Add failing geometry tests for circle/arc construction, length, display samples, projection, and degenerate inputs.
- [ ] Implement geometry helpers.
- [ ] Add failing measurement tests for shape detection, length, display points, bounds, and projection.
- [ ] Implement measurement semantics.
- [ ] Run focused tests and full model tests.

### Task 2: Creation Commands And Draft Workflow

**Files:**
- Modify: `src/app/measurement-workflows.js`
- Modify: `src/app/measurement-commands.js`
- Modify: `src/app/state.js`
- Test: `test/measurement-workflows.test.mjs`
- Test: `test/measurement-commands.test.mjs`
- Test: `test/state.test.mjs`

**Interfaces:**
- Produce `circleArcDraft` transient state and `createCircleMeasurement` / `createArcMeasurement` command helpers.
- Extend draw modes without breaking `line` / `freehand`.

- [ ] Add failing tests for new draw mode normalization and draft reset.
- [ ] Add failing tests for circle/arc measurement creation.
- [ ] Implement command helpers and state fields.
- [ ] Run focused tests.

### Task 3: UI Wiring, Rendering, And Hit Testing

**Files:**
- Modify: `index.html`
- Modify: `src/main.js`
- Modify: `src/app/svg-renderer.js`
- Modify: `src/app/hit-testing.js`
- Test: `test/svg-renderer.test.mjs`
- Test: `test/hit-testing.test.mjs`

**Interfaces:**
- Add measure menu options for the V1 modes.
- Render saved and in-progress circle/arc paths.
- Let selection, erase, snap, and path hit testing find circle/arc geometry.

- [ ] Add failing renderer tests for circle/arc SVG output and labels.
- [ ] Add failing hit-testing tests for circle/arc anchors and centerlines.
- [ ] Wire menu options and pointer creation flow.
- [ ] Implement rendering and hit testing.
- [ ] Run focused tests.

### Task 4: Sidebar, Aggregation, Export, Continuous Scroll

**Files:**
- Modify: `src/app/sidebar-controller.js`
- Modify: `src/app/path-aggregation.js`
- Modify: `src/export-utils.js`
- Modify: `src/app/continuous-renderer.js`
- Test: `test/sidebar-controller.test.mjs`
- Test: `test/path-aggregation.test.mjs`
- Test: `test/export-utils.test.mjs`
- Test: `test/continuous-renderer.test.mjs`

**Interfaces:**
- Sidebar point count must work for non-polyline shapes.
- Aggregation/export type must preserve `circle` and `arc`.
- Continuous scroll must translate circle/arc geometry.

- [ ] Add failing tests for sidebar rows, aggregation/export types, and continuous translation.
- [ ] Implement integrations.
- [ ] Run focused tests.

### Task 5: Full Verification And Optimization

**Files:**
- Modify if needed after QA: touched app modules only.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start Vite dev server.
- [ ] Browser-test app load, circle creation, arc creation, sidebar metrics, selection, and export-relevant labels.
- [ ] Fix performance/UX issues found during QA.
