import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyKey, etaMs, formatDuration, formatNumber, nextScheduled, parseAmount, parseDurationSec, ratePerHour } from '../src/shared/time.ts';

test('ratePerHour uses first and last sample', () => {
  assert.equal(ratePerHour([]), null);
  assert.equal(ratePerHour([{ t: 0, value: 10 }]), null);
  assert.equal(ratePerHour([{ t: 0, value: 10 }, { t: 1_800_000, value: 15 }]), 10);
});

test('etaMs', () => {
  assert.equal(etaMs(50, 10), 5 * 3_600_000);
  assert.equal(etaMs(50, 0), null);
  assert.equal(etaMs(50, null), null);
});

test('formatDuration', () => {
  assert.equal(formatDuration(65_000), '1:05');
  assert.equal(formatDuration(65_000, true), '0:01:05');
  assert.equal(formatDuration(3_725_000), '1:02:05');
  assert.equal(formatDuration(-5), '0:00');
});

test('formatNumber / parseAmount', () => {
  assert.equal(formatNumber(1234), '1,234');
  assert.equal(formatNumber(1_250_000), '1.25M');
  assert.equal(formatNumber(3_400_000_000), '3.4B');
  assert.equal(parseAmount('1,234'), 1234);
  assert.equal(parseAmount('1.5m'), 1_500_000);
  assert.equal(parseAmount('2B'), 2e9);
  assert.equal(parseAmount('300k'), 300_000);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('-5'), null);
});

test('parseDurationSec', () => {
  assert.equal(parseDurationSec('200'), 200);
  assert.equal(parseDurationSec('3:20'), 200);
  assert.equal(parseDurationSec('1:02:03'), 3723);
  assert.equal(parseDurationSec('90s'), 90);
  assert.equal(parseDurationSec('5m'), 300);
  assert.equal(parseDurationSec('1.5h'), 5400);
  assert.equal(parseDurationSec('0'), null);
  assert.equal(parseDurationSec('soon'), null);
});

test('dailyKey rolls over at the reset hour (UTC)', () => {
  const beforeReset = Date.UTC(2026, 10, 7, 4, 59);
  const afterReset = Date.UTC(2026, 10, 7, 5, 0);
  assert.equal(dailyKey(beforeReset, 5), '2026-11-06');
  assert.equal(dailyKey(afterReset, 5), '2026-11-07');
  assert.equal(dailyKey(Date.UTC(2026, 10, 7, 0, 0), 0), '2026-11-07');
});

test('nextScheduled finds the next local clock time, wrapping to tomorrow', () => {
  const now = new Date(2026, 10, 7, 13, 30).getTime();
  assert.equal(nextScheduled(['12:00', '18:00'], now), new Date(2026, 10, 7, 18, 0).getTime());
  assert.equal(nextScheduled(['12:00'], now), new Date(2026, 10, 8, 12, 0).getTime());
  assert.equal(nextScheduled(['bad', '25:00'], now), null);
  assert.equal(nextScheduled([], now), null);
});
