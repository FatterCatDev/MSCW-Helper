import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rollingPerMinute } from '../src/shared/time.ts';
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
