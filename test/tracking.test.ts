import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expRateHistory, retainRateWindow, rollingPerMinute } from '../src/shared/time.ts';
import { emptyCountState, observeCount } from '../src/shared/potions.ts';
import { parsePotionItem } from '../src/main/items.ts';

test('EXP rates use exact 1-minute and 10-minute windows rather than whole-session rates', () => {
  const samples = [{ t: 0, value: 0 }, { t: 600_000, value: 1000 }, { t: 660_000, value: 1300 }];
  assert.equal(rollingPerMinute(samples, 660_000, 60_000), 300);
  assert.equal(rollingPerMinute(samples, 660_000, 600_000), 120);
  assert.equal(rollingPerMinute(samples, 720_000, 60_000), 0);
  assert.equal(rollingPerMinute(samples, 30_000, 60_000), null);
});

test('EXP rates warm up over available time and account for losses', () => {
  assert.equal(rollingPerMinute([{ t: 0, value: 0 }, { t: 30_000, value: 100 }], 30_000, 600_000), 200);
  assert.equal(rollingPerMinute([{ t: 0, value: 0 }, { t: 60_000, value: -100 }], 60_000, 60_000), -100);
  assert.equal(rollingPerMinute([{ t: 0, value: 0 }], 60_000, 60_000), null);
});

test('ten-minute graph has 601 one-second points and shows rises, idle decay and losses', () => {
  const samples = [{ t: 0, value: 0 }, { t: 30_000, value: 100 }, { t: 90_000, value: 50 }];
  const points = expRateHistory(samples, 120_456);
  assert.equal(points.length, 601);
  assert.equal(points[0]!.t, -480_000);
  assert.equal(points.at(-1)!.t, 120_000);
  for (let i = 1; i < points.length; i++) assert.equal(points[i]!.t - points[i - 1]!.t, 1000);
  const value = (t: number) => points.find(p => p.t === t)!.value;
  assert.equal(value(29_000), null);
  assert.equal(value(30_000), 200);
  assert.equal(value(31_000), 100 * 60000 / 31000);
  assert.equal(value(90_000), -50);
  assert.equal(value(120_000), -25);
  assert.equal(expRateHistory([], 120_000).every(p => p.value === null), true);
});

test('graph retention preserves a full minute before the ten-minute left edge', () => {
  const samples = Array.from({ length: 31 }, (_, minute) => ({ t: minute * 60000, value: minute * 100 }));
  const retained = retainRateWindow(samples, 30 * 60000);
  const graph = expRateHistory(retained, 30 * 60000);
  assert.equal(graph[0]!.t, 20 * 60000);
  assert.equal(graph[0]!.value, 100);
  assert.equal(graph.at(-1)!.value, 100);
});

test('potion detection needs two confident matching frames and never charges the same decrease twice', () => {
  let state = emptyCountState();
  let used = 0;
  for (const count of [100, 100, 99, 99, 99, 99, 98, 98]) {
    const next = observeCount(state, String(count), 95);
    state = next.state;
    used += Number(next.used);
  }
  assert.equal(used, 2);
  assert.equal(state.baseline, 98);
});

test('unreadable counts, restocks, missing digits, transient errors and large drops are not charged', () => {
  let state = emptyCountState();
  for (const text of ['100', '100', '9', '99', '100', '100', '90', '90', '', '89', '89', '120', '120']) {
    const next = observeCount(state, text, 95);
    assert.equal(next.used, false);
    state = next.state;
  }
  assert.equal(observeCount(state, '119', 84).state.baseline, null);
  assert.equal(observeCount(state, '12 0', 95).state.baseline, null);
});

test('API item parsing validates HP/MP potion metadata without assuming a purchase price', () => {
  const item = parsePotionItem({ id: 2000000, description: { name: 'Red Potion', description: 'Restores\\nHP' },
    metaInfo: { price: 25, consumeSpec: { hp: 50 } } });
  assert.equal(item.npcSellPrice, 25);
  assert.equal(item.description, 'Restores\nHP');
  assert.throws(() => parsePotionItem({ id: 1, description: { name: 'Sword' }, metaInfo: {} }), /not a supported/);
  assert.throws(() => parsePotionItem({}), /not a supported/);
});
