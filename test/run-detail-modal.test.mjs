import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadRunDetailModal() {
  const source = await readFile(new URL('../src/app/run-detail-modal.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'run-detail-modal.js' });
  return sandbox.window.TakeoffRunDetailModal;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('attachmentRecordFromFile stores serializable upload metadata and preview data', async () => {
  const modal = await loadRunDetailModal();
  const file = {
    name: 'Panel A.jpg',
    type: 'image/jpeg',
    size: 1536,
    lastModified: 1710000000000,
  };

  const record = modal.attachmentRecordFromFile(file, {
    kind: 'photo',
    id: 'photo-1',
    dataUrl: 'data:image/jpeg;base64,abc',
  });

  assert.deepEqual(plain(record), {
    id: 'photo-1',
    name: 'Panel A.jpg',
    type: 'image/jpeg',
    size: 1536,
    lastModified: 1710000000000,
    dataUrl: 'data:image/jpeg;base64,abc',
  });
  assert.equal(modal.attachmentDisplayName(record, 'Photo 1'), 'Panel A.jpg');
  assert.equal(modal.formatBytes(record.size), '1.5 KB');
});
