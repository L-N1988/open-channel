const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../docs/javascripts/love-core.js');

test('yearly anniversaries roll forward, never appear before original date, and handle leap days', () => {
  const row = { event_date: '2024-02-29', recurrence: 'yearly' };
  assert.equal(core.matchesDate(row, '2025-02-28'), true);
  assert.equal(core.matchesDate(row, '2024-02-29'), true);
  assert.equal(core.matchesDate(row, '2023-02-28'), false);
  assert.equal(core.upcoming(row, '2025-03-01'), '2026-02-28');
  assert.equal(core.upcoming({ event_date: '2028-05-04', recurrence: 'yearly' }, '2026-01-01'), '2028-05-04');
});
test('calendar shows every overlapping event including final day of trips', () => {
  const rows = [{ event_date: '2026-10-05' }, { event_date: '2026-10-03', end_date: '2026-10-05' }];
  assert.equal(rows.filter(row => core.matchesDate(row, '2026-10-05')).length, 2);
  assert.equal(rows.filter(row => core.matchesDate(row, '2026-10-06')).length, 0);
});
test('date arithmetic ignores daylight saving and supports year boundaries', () => {
  assert.equal(core.daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(core.daysBetween('2026-03-08', '2026-03-09'), 1);
});
test('coordinate validation keeps zero coordinates and rejects partial or invalid pairs', () => {
  assert.equal(core.coords({ latitude: 0, longitude: 0 }), true);
  assert.equal(core.coords({ latitude: null, longitude: 0 }), false);
  assert.equal(core.coords({ latitude: 91, longitude: 0 }), false);
  assert.equal(core.coords({ latitude: 'NaN', longitude: 0 }), false);
});
test('updates preserve intentional clearing but exclude browser-only media metadata', () => {
  const result = core.payload('memories', { id: '1', updated_at: 'now', note: '', tags: [], title: 'Test', media: [{ path: 'p.jpg', type: 'image/jpeg', name: 'p', blobId: 'private' }], file_data_url: 'data:private' });
  assert.equal(result.note, null);
  assert.deepEqual(result.tags, []);
  assert.equal('file_data_url' in result, false);
  assert.equal('blobId' in result.media[0], false);
});
test('Postgres and browser representations of the same revision compare equal', () => {
  assert.equal(core.sameRevision('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00+00:00'), true);
  assert.equal(core.sameRevision('2026-01-01T00:00:00.000001Z', '2026-01-01T00:00:00.000002Z'), false);
  assert.equal(core.sameRevision(null, null), true);
  assert.equal(core.sameRevision(null, '2026-01-01T00:00:00Z'), false);
  assert.equal(core.sameRevision('2026-01-01T00:00:01Z', '2026-01-01T00:00:00Z'), false);
});
test('timeline combines text, tag, date and journal filters and sorts by memory date', () => {
  const rows = [
    { id: '1', title: 'Coffee', memory_date: '2026-10-03', tags: ['weekend'], journal_id: 'a', type: 'moment' },
    { id: '2', title: 'Beach', memory_date: '2026-10-05', tags: ['weekend'], journal_id: 'a', type: 'photo' },
    { id: '3', title: 'Home', memory_date: '2026-10-04', tags: [], journal_id: 'b', type: 'moment' }
  ];
  assert.deepEqual(core.filterMemories(rows, { query: 'WEEKEND', journal: 'a', from: '2026-10-04', to: '2026-10-05' }).map(row => row.id), ['2']);
  assert.deepEqual(core.filterMemories(rows, {}).map(row => row.id), ['2', '3', '1']);
});
