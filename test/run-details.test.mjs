import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadRunDetails() {
  const source = await readFile(new URL('../src/app/run-details.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'run-details.js' });
  return sandbox.window.TakeoffRunDetails;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('normalizeRunDetails returns a stable empty shape for missing and malformed input', async () => {
  const runDetails = await loadRunDetails();

  assert.deepEqual(plain(runDetails.normalizeRunDetails()), {
    text: '',
    photos: [],
    videos: [],
  });
  assert.deepEqual(plain(runDetails.normalizeRunDetails(null)), {
    text: '',
    photos: [],
    videos: [],
  });
  assert.deepEqual(plain(runDetails.normalizeRunDetails({ text: 42, photos: 'bad', videos: { bad: true } })), {
    text: '42',
    photos: [],
    videos: [],
  });
});

test('normalizeRunDetails preserves note text exactly while normalizing to string', async () => {
  const runDetails = await loadRunDetails();
  const text = '  Existing note text\nwith spacing preserved  ';

  assert.equal(runDetails.normalizeRunDetails({ text }).text, text);
  assert.equal(runDetails.normalizeRunDetails({ text: false }).text, 'false');
});

test('normalizeRunDetails clones and preserves valid attachment objects', async () => {
  const runDetails = await loadRunDetails();
  const input = {
    text: 'media',
    photos: [
      { id: 'photo-1', name: 'Panel.jpg', metadata: { tags: ['panel'], size: { width: 1200 } } },
      null,
      'invalid',
    ],
    videos: [
      { id: 'video-1', name: 'Walkthrough.mov', metadata: { durationSeconds: 12 } },
    ],
    category: 'Do not carry this field',
  };

  const normalized = runDetails.normalizeRunDetails(input);

  assert.deepEqual(plain(normalized), {
    text: 'media',
    photos: [
      { id: 'photo-1', name: 'Panel.jpg', metadata: { tags: ['panel'], size: { width: 1200 } } },
    ],
    videos: [
      { id: 'video-1', name: 'Walkthrough.mov', metadata: { durationSeconds: 12 } },
    ],
  });
  assert.notEqual(normalized.photos, input.photos);
  assert.notEqual(normalized.photos[0], input.photos[0]);
  assert.notEqual(normalized.photos[0].metadata, input.photos[0].metadata);
  assert.notEqual(normalized.photos[0].metadata.tags, input.photos[0].metadata.tags);

  normalized.photos[0].metadata.tags.push('changed');
  normalized.videos[0].metadata.durationSeconds = 99;

  assert.deepEqual(input.photos[0].metadata.tags, ['panel']);
  assert.equal(input.videos[0].metadata.durationSeconds, 12);
  assert.equal(Object.hasOwn(normalized, 'category'), false);
});

test('hasRunDetails reports empty and present details correctly', async () => {
  const runDetails = await loadRunDetails();

  assert.equal(runDetails.hasRunDetails({ text: '', photos: [], videos: [] }), false);
  assert.equal(runDetails.hasRunDetails({ text: '', photos: 'bad', videos: null }), false);
  assert.equal(runDetails.hasRunDetails({ text: 'note', photos: [], videos: [] }), true);
  assert.equal(runDetails.hasRunDetails({ text: '', photos: [{ id: 'photo-1' }], videos: [] }), true);
  assert.equal(runDetails.hasRunDetails({ text: '', photos: [], videos: [{ id: 'video-1' }] }), true);
});

test('photo and video count helpers count normalized media arrays', async () => {
  const runDetails = await loadRunDetails();
  const details = {
    photos: [{ id: 'photo-1' }, { id: 'photo-2' }, 'bad'],
    videos: [{ id: 'video-1' }],
  };

  assert.equal(runDetails.runDetailsPhotoCount(details), 2);
  assert.equal(runDetails.runDetailsVideoCount(details), 1);
  assert.equal(runDetails.runDetailsPhotoCount({ photos: null }), 0);
  assert.equal(runDetails.runDetailsVideoCount({ videos: { bad: true } }), 0);
});
