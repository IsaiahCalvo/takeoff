# Takeoff Context

This file defines the domain words agents should use when changing Takeoff.

## Domain Words

- **Document**: A PDF or image loaded into the app. A document may have one page or many pages.
- **Page**: One visible sheet inside a document. Images are treated as one-page documents.
- **Measurement**: A user-drawn path on a page. Users see this as a measured line or freehand path.
- **Measurement Shape**: Whether a measurement is currently treated as Line or Freehand. Shape metadata may preserve prior geometry so conversions can be reversed.
- **Calibration**: The page scale that converts pixels into real units such as feet.
- **Page Group**: The collapsible right-panel row that owns one page and its child measurements in All Pages view.
- **Selection**: The active measurement the user can rename, drag, delete, copy, paste, rotate, or edit.
- **Viewer**: The canvas and transform area that owns page display, zoom, pan, and screen-to-page mapping.

## Architecture Words

- **Module**: A file or function with an interface and an implementation.
- **Seam**: A place where behavior can change without editing unrelated behavior in place.
- **Adapter**: A concrete module that handles one outside shape, such as PDF or image loading.
- **Locality**: Related behavior should live together so future edits are small and safe.

## Current Direction

`index.html` should stay mostly app shell wiring. New behavior should live in `src/app/*.js` modules with matching `test/*.test.mjs` coverage.
