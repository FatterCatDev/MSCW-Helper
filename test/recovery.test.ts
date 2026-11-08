import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyRecovery, parseVitalText, selectedRecoveryItems, normalizeRecoverySelection } from '../src/shared/recovery.ts';
import { defaultState, normalizeState } from '../src/shared/defaults.ts';
import { reducer } from '../src/shared/reducer.ts';
import type { Vitals } from '../src/shared/types.ts';
import { NPC_RECOVERY_ITEMS } from '../src/shared/npc-recovery-prices.ts';
import { PotionCapture } from '../src/main/potion-capture.ts';
import { recoveryIconUrl } from '../src/shared/recovery-icons.ts';

const before: Vitals = { hp: 100, maxHp: 5000, mp: 100, maxMp: 5000 };
const change = (hp: number, mp: number, selected: number[]) =>
  classifyRecovery(before, { ...before, hp: before.hp + hp, mp: before.mp + mp }, selected);

test('inclusive 50% bounds count Lemon uses and values just outside do not trigger', () => {
  for (const mp of [75, 76, 138, 150, 224, 225]) {
    const result = change(0, mp, [2010005]);
    assert.equal(result.length, 1, `MP +${mp}`);
    assert.equal(result[0]!.itemId, 2010005);
  }
  for (const mp of [10, 11, 74, 226, 300]) assert.deepEqual(change(0, mp, [2010005]), []);
  for (const hp of [50, 100, 150]) assert.equal(change(hp, 0, [2000000])[0]?.itemId, 2000000);
  for (const hp of [49, 151]) assert.deepEqual(change(hp, 0, [2000000]), []);
  assert.equal(NPC_RECOVERY_ITEMS[2010005]!.npcBuyPrice, 150);
});

test('Orange Potion inclusive bounds are 125 through 375 HP', () => {
  for (const hp of [125, 250, 375]) assert.equal(change(hp, 0, [2000001])[0]?.itemId, 2000001);
  for (const hp of [124, 376]) assert.deepEqual(change(hp, 0, [2000001]), []);
});

test('blank selection, unselected stats, death, invalid readings and max-stat changes do not trigger', () => {
  assert.deepEqual(change(100, 150, []), []);
  assert.deepEqual(change(100, 0, [2010005]), []);
  assert.deepEqual(change(0, 150, [2000000]), []);
  assert.deepEqual(classifyRecovery(before, { ...before, hp: 200, maxHp: 6000 }, [2000000]), []);
  assert.deepEqual(classifyRecovery({ ...before, hp: 0 }, before, [2000000]), []);
  assert.deepEqual(classifyRecovery(before, { ...before, hp: 99999 }, [2000000]), []);
});

test('capped increases trigger only when the observed recovery is within the specified range', () => {
  for (const mp of [75, 150, 225]) {
    const result = classifyRecovery({ ...before, mp: 5000 - mp }, { ...before, mp: 5000 }, [2010005]);
    assert.equal(result[0]?.itemId, 2010005);
  }
  assert.deepEqual(classifyRecovery({ ...before, mp: 4990 }, { ...before, mp: 5000 }, [2010005]), []);
});

test('separate HP and MP items can trigger independently and combined items count once', () => {
  const separate = change(100, 150, [2000000, 2010005]);
  assert.deepEqual(separate.map(e => e.itemId), [2000000, 2010005]);
  assert.deepEqual(separate.map(e => [e.hp, e.mp]), [[100, 0], [0, 150]]);
  assert.deepEqual(change(100, 100, [2020002]).map(e => e.itemId), [2020002]);
  assert.deepEqual(change(100, 0, [2020002]).map(e => e.itemId), [2020002]);
  const ambiguous = change(100, 100, [2020002, 2000000]);
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0]!.itemId, null);
  assert.deepEqual(ambiguous[0]!.candidates, [2000000, 2020002]);
});

test('two similarly restoring selected items remain ambiguous without a guessed charge', () => {
  const result = change(100, 0, [2000000, 2210005]);
  assert.deepEqual(result[0]!.candidates, [2000000, 2210005]);
  assert.equal(result[0]!.itemId, null);
});

test('complete current/max parsing rejects guesses', () => {
  assert.deepEqual(parseVitalText('[1084/1995]'), { current: 1084, max: 1995 });
  for (const text of ['HP 1084/1995', '2000/1995', '[1084/1995', '1084/1995]']) assert.equal(parseVitalText(text), null);
});

test('Lemon icon uses the verified GMS icon ID', () => {
  assert.equal(recoveryIconUrl(2010005), 'https://maplestory.io/api/GMS/62/item/2010004/icon');
  assert.equal(recoveryIconUrl(2010004), 'https://maplestory.io/api/GMS/62/item/2010003/icon');
  assert.equal(recoveryIconUrl(2020018), null);
  assert.equal(recoveryIconUrl(9999999), null);
});

test('tracker requires selection but no job or skill configuration', () => {
  const statuses: boolean[] = [];
  const tracker = new PotionCapture(() => assert.fail('No frames should be processed'), (_id, status) => statuses.push(status.running));
  assert.throws(() => tracker.start('test', [], []), /Blank selection disables/);
  assert.throws(() => tracker.start('test', [], [9999999]), /Choose the potions/);
  tracker.start('test', [], [2010005]);
  tracker.stop('test');
  assert.deepEqual(statuses, [true, false]);
});

test('old class and skill configuration is discarded but selections, prices and previous totals persist', () => {
  const state = defaultState(), widget = Object.values(state.widgets).find(w => w.type === 'meso');
  assert.ok(widget && widget.type === 'meso');
  const old = JSON.parse(JSON.stringify(state));
  old.widgets[widget.id].config.recovery = { characterClass: 'Fighter', passiveLevel: 15, confirmed: false };
  old.widgets[widget.id].config.selectedPotions = { hp: null, mp: 2010005 };
  old.widgets[widget.id].data.potionCosts = 300;
  old.widgets[widget.id].data.potionUses = { 'recovery-2010005': 2 };
  const saved = normalizeState(old).widgets[widget.id];
  assert.ok(saved && saved.type === 'meso');
  assert.equal('recovery' in saved.config, false);
  assert.deepEqual(saved.config.selectedPotions, { hp: null, mp: 2010005 });
  assert.equal(saved.data.potionCosts, 300);
  assert.equal(saved.data.potionUses['recovery-2010005'], 2);
});

test('dropdown migration and combined item selection preserve item IDs', () => {
  assert.deepEqual(normalizeRecoverySelection({ hp: 2000003, mp: 2000000 }), { hp: null, mp: null });
  assert.deepEqual(normalizeRecoverySelection(undefined, [9999999, 2000000, 2000001, 2000003]), { hp: 2000000, mp: 2000003 });
  assert.deepEqual(selectedRecoveryItems({ hp: 2020002, mp: 2020002 }), [2020002]);
  assert.deepEqual(selectedRecoveryItems({ hp: null, mp: null }), []);
});

test('estimated use and ambiguous resolution update totals only once', () => {
  let state = defaultState();
  const widget = Object.values(state.widgets).find(w => w.type === 'meso');
  assert.ok(widget && widget.type === 'meso');
  const lemon = change(0, 138, [2010005])[0]!;
  const action = { type: 'recovery/event' as const, id: widget.id, event: { id: 'lemon', at: 1, ...lemon, cost: 150 } };
  state = reducer(reducer(state, action), action);
  const amb = change(100, 0, [2000000, 2210005])[0]!;
  state = reducer(state, { type: 'recovery/event', id: widget.id, event: { id: 'amb', at: 2, ...amb, cost: null } });
  const resolve = { type: 'recovery/resolve' as const, id: widget.id, eventId: 'amb', itemId: 2000000, cost: 50 };
  state = reducer(reducer(state, resolve), resolve);
  const saved = normalizeState(state).widgets[widget.id];
  assert.ok(saved && saved.type === 'meso');
  assert.equal(saved.data.potionCosts, 200);
  assert.equal(saved.data.potionUses['recovery-2010005'], 1);
  assert.equal(saved.data.potionUses['recovery-2000000'], 1);
  assert.equal(saved.data.unidentifiedRecoveries, 0);
});
