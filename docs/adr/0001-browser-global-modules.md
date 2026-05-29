# ADR 0001: Browser-global modules

## Status

Accepted

## Context

Takeoff is currently a browser app loaded from GitHub Pages without a bundler-driven application entrypoint. The app still uses plain `<script>` tags, and several modules expose names on `window`.

## Decision

Use small browser-global modules under `public/app/*.js` while the app remains script-tag based. Each module should expose one `window.Takeoff...` interface and keep meaningful behavior behind that interface.

## Consequences

- Agents can work in focused modules instead of editing `index.html`.
- Tests can load individual modules with `node:test` and `vm`.
- `index.html` remains the app shell until a later migration creates a bundled entrypoint.
- New modules need matching tests before other work depends on them.
