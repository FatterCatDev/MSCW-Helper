import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookupPotion, parsePotionItem } from '../src/main/items.ts';
import { defaultState, normalizeState } from '../src/shared/defaults.ts';
import { NPC_RECOVERY_ITEMS, NPC_RECOVERY_PRICE_SOURCE } from '../src/shared/npc-recovery-prices.ts';
import { reducer } from '../src/shared/reducer.ts';

test('NPC database covers all 29 open-shop recovery rows, without duplicate dual restores', () => {
  const expected: Record<number, number> = {
    2000000: 50, 2000001: 150, 2000002: 350, 2000003: 220,
    2010001: 20, 2010002: 30, 2010003: 80, 2010004: 50, 2010005: 150, 2010006: 1920,
    2020000: 220, 2020001: 60, 2020002: 150, 2020003: 252, 2020004: 350,
    2020005: 180, 2020006: 480, 2020007: 180, 2020008: 800, 2020009: 540,
    2020010: 1260, 2020012: 1500, 2020013: 2250, 2020018: 480, 2020019: 480,
    2022000: 1120, 2022003: 1000, 2210005: 500, 2210006: 500
  };
  const available = Object.values(NPC_RECOVERY_ITEMS).filter(item => item.availability === 'shop');
  assert.equal(available.length, 29);
  assert.deepEqual(Object.fromEntries(available.map(item => [item.itemId, item.npcBuyPrice])), expected);
  for (const [key, item] of Object.entries(NPC_RECOVERY_ITEMS)) {
    assert.equal(Number(key), item.itemId);
    assert.ok(item.name.length > 0);
    assert.ok(item.hp > 0 || item.mp > 0);
    if (item.availability === 'shop') assert.ok(Number.isSafeInteger(item.npcBuyPrice) && item.npcBuyPrice! > 0);
  }
});

test('closed shops and absent items never get guessed NPC purchase prices', async () => {
  const closed = Object.values(NPC_RECOVERY_ITEMS).filter(item => item.availability === 'not-open');
  assert.deepEqual(closed.map(item => item.itemId), [2020014, 2020015, 2020016, 2020017]);
  for (const item of closed) {
    assert.equal(item.npcBuyPrice, null);
    const lookup = await lookupPotion(item.itemId, '62');
    assert.equal(lookup.npcBuyPrice, null);
    assert.equal(lookup.npcPriceSource, null);
    assert.match(lookup.description, /not open/);
  }
  const drop = parsePotionItem({ id: 2000004, description: { name: 'Elixir' },
    metaInfo: { price: 5000, consumeSpec: { hpR: 50, mpR: 50 } } });
  assert.equal(drop.npcSellPrice, 5000);
  assert.equal(drop.npcBuyPrice, null);
  assert.equal(drop.npcPriceSource, null);
});

test('all database lookups work offline and retain Classic recovery stats rather than GMS stats', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Database lookup must not access the network.'); });
  for (const local of Object.values(NPC_RECOVERY_ITEMS)) {
    const item = await lookupPotion(local.itemId, '62');
    assert.equal(item.name, local.name);
    assert.equal(item.npcBuyPrice, local.npcBuyPrice);
    assert.equal(item.npcPriceSource, local.npcBuyPrice === null ? null : NPC_RECOVERY_PRICE_SOURCE);
    assert.equal(item.npcSellPrice, null);
    assert.ok(item.description.includes(`${local.hp} HP / ${local.mp} MP`));
  }
  await assert.rejects(lookupPotion(-1, '62'), /positive item ID/);
  await assert.rejects(lookupPotion(2000000, 'bad/version'), /valid GMS/);
});

test('database-priced consumption accumulates meso costs and preserves manual overrides on restart', async () => {
  const item = await lookupPotion(2010003, '62');
  assert.equal(item.npcBuyPrice, 80);
  let state = defaultState();
  const widget = Object.values(state.widgets).find(w => w.type === 'meso');
  assert.ok(widget && widget.type === 'meso');
  const potion = { id: 'meat', itemId: item.id, name: item.name, unitCost: item.npcBuyPrice!,
    sourceId: 'window:123:1', region: { x: 0, y: 0, width: 0.1, height: 0.1 } };
  state = reducer(state, { type: 'widget/config', id: widget.id, config: { potions: [potion] } });
  for (let i = 0; i < 3; i++) state = reducer(state, { type: 'potion/used', id: widget.id, potionId: potion.id, quantity: 1 });
  const result = state.widgets[widget.id];
  assert.ok(result && result.type === 'meso');
  assert.equal(result.data.potionCosts, 240);
  assert.equal(result.data.potionUses.meat, 3);
  state = reducer(state, { type: 'widget/config', id: widget.id, config: { potions: [{ ...potion, unitCost: 90 }] } });
  state = normalizeState(state);
  const saved = state.widgets[widget.id];
  assert.ok(saved && saved.type === 'meso');
  assert.equal(saved.config.potions[0]!.unitCost, 90);
  assert.equal(saved.data.potionCosts, 240);
});
