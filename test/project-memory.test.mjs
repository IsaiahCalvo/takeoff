import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('project context documents the core Takeoff domain words', async () => {
  const context = await readFile(new URL('../CONTEXT.md', import.meta.url), 'utf8');

  assert.match(context, /# Takeoff Context/);
  assert.match(context, /Measurement/);
  assert.match(context, /Calibration/);
  assert.match(context, /Document/);
  assert.match(context, /Page Group/);
});

test('architecture decisions document module and agent ownership rules', async () => {
  const [modulesAdr, ownershipAdr] = await Promise.all([
    readFile(new URL('../docs/adr/0001-browser-global-modules.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/adr/0002-agent-ownership-rules.md', import.meta.url), 'utf8'),
  ]);

  assert.match(modulesAdr, /Browser-global modules/);
  assert.match(modulesAdr, /Consequences/);
  assert.match(ownershipAdr, /Agent ownership rules/);
  assert.match(ownershipAdr, /Only one agent may edit `index.html`/);
});
