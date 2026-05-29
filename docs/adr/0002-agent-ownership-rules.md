# ADR 0002: Agent ownership rules

## Status

Accepted

## Context

The main risk for parallel work is unrelated agents editing the same large app shell. The project is improving by moving behavior into modules, but `index.html` is still a high-conflict file.

## Decision

Use ownership rules until the app shell is fully split:

- Only one agent may edit `index.html` at a time.
- A module change should include a matching test file change.
- New measurement behavior should go through measurement commands or measurement workflows.
- New page scale behavior should go through calibration or state-store helpers.
- Rendering changes must say whether they affect hit testing.
- Viewer/document changes must say whether they affect page navigation or cache invalidation.

## Consequences

- Parallel work is safer because each agent has a clearer seam.
- Review is easier because risky ownership crossings are visible.
- `index.html` should keep shrinking as more seams become real modules.
