import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOTICE_DELAY_MS, NOTICE_FADE_MS, updateUnknownNotice } from '../src/renderer/src/overlay/notice-timing.ts';
import type { MapStatus } from '../src/shared/types.ts';

test('unknown safety notice keeps its original time through repeated frames and reading', () => {
  const map: MapStatus = { state: 'unknown', message: 'Map was not found.', name: 'Field', street: 'Road' };
  const notice = updateUnknownNotice(null, map, true, 1000);
  assert.ok(notice);
  assert.equal(NOTICE_DELAY_MS, 3000);
  assert.equal(NOTICE_FADE_MS, 400);
  assert.equal(updateUnknownNotice(notice, { ...map }, true, 2500), notice);
  const reading = updateUnknownNotice(notice, { state: 'reading', message: 'Reading.' }, true, 3000);
  assert.equal(updateUnknownNotice(reading, map, true, 4000), notice);
  assert.equal(updateUnknownNotice(notice, { ...map, name: 'Other' }, true, 5000)?.since, 5000);
  assert.equal(updateUnknownNotice(notice, { ...map, message: 'Lookup failed.' }, true, 6000)?.since, 6000);
  assert.equal(updateUnknownNotice(notice, map, false, 7000)?.since, 7000);
  assert.equal(updateUnknownNotice(notice, { state: 'safe', message: 'Town.' }, true, 8000), null);
  assert.equal(updateUnknownNotice(notice, { state: 'missing', message: 'Expand.' }, true, 8000), null);
});
