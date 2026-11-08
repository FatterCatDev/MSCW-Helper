import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultData, defaultState, normalizeState } from '../src/shared/defaults.ts';
import { reducer } from '../src/shared/reducer.ts';
import { usedRecoveryItems } from '../src/shared/recovery.ts';

test('legacy EXP and meso trackers migrate into one visible Training Tracker without losing data', () => {
  const legacy = defaultState();
  const training = Object.values(legacy.widgets).find(w => w.type === 'training')!;
  assert.ok(training.type === 'training');
  const expId = training.config.expId, mesoId = training.config.mesoId;
  delete legacy.widgets[training.id];
  legacy.widgetOrder = legacy.widgetOrder.filter(id => id !== training.id);
  for (const profile of legacy.profiles) {
    delete profile.placements[training.id];
    profile.placements[expId]!.visible = true;
    profile.placements[mesoId]!.visible = true;
  }
  const exp = legacy.widgets[expId], meso = legacy.widgets[mesoId];
  assert.ok(exp?.type === 'exp' && meso?.type === 'meso');
  exp.data.gained = 1234; meso.data.potionCosts = 300; meso.data.potionUses['recovery-2010005'] = 2;
  meso.config.selectedPotions.mp = 2010005;
  legacy.settings.gameTracking.expWidgetId = expId;
  legacy.settings.gameTracking.mesoWidgetId = mesoId;
  const migrated = normalizeState(legacy);
  const combined = Object.values(migrated.widgets).find(w => w.type === 'training');
  assert.ok(combined?.type === 'training');
  assert.deepEqual(combined.config, { expId, mesoId });
  assert.equal(migrated.profiles[0]!.placements[combined.id]!.visible, true);
  assert.equal(migrated.profiles[0]!.placements[expId]!.visible, false);
  assert.equal(migrated.profiles[0]!.placements[mesoId]!.visible, false);
  const savedExp = migrated.widgets[expId], savedMeso = migrated.widgets[mesoId];
  assert.ok(savedExp?.type === 'exp' && savedMeso?.type === 'meso');
  assert.equal(savedExp.data.gained, 1234);
  assert.equal(savedMeso.data.potionCosts, 300);
  assert.equal(savedMeso.data.potionUses['recovery-2010005'], 2);
  assert.equal(savedMeso.config.selectedPotions.mp, 2010005);
  assert.equal(Object.values(normalizeState(migrated).widgets).filter(w => w.type === 'training').length, 1);
});

test('training reset clears both EXP and potion totals but preserves item selection and price configuration', () => {
  let state = defaultState();
  const training = Object.values(state.widgets).find(w => w.type === 'training');
  assert.ok(training?.type === 'training');
  state = reducer(state, { type: 'exp/sample', id: training.config.expId, value: 100, required: 1000, level: 1, at: 1 });
  state = reducer(state, { type: 'exp/sample', id: training.config.expId, value: 200, required: 1000, level: 1, at: 2 });
  state = reducer(state, { type: 'rate/sample', id: training.config.mesoId, value: 500, at: 1 });
  state = reducer(state, { type: 'rate/sample', id: training.config.mesoId, value: 700, at: 2 });
  const prices = [{ id: 'lemon-price', itemId: 2010005, name: 'Lemon', unitCost: 150 }];
  state = reducer(state, { type: 'widget/config', id: training.config.mesoId,
    config: { goal: 1000, potions: prices, selectedPotions: { hp: null, mp: 2010005 } } });
  state = reducer(state, { type: 'recovery/event', id: training.config.mesoId, event: {
    id: 'one', at: 3, hp: 0, mp: 150, candidates: [2010005], itemId: 2010005, cost: 150, reason: 'matched'
  } });
  const beforeExp = state.widgets[training.config.expId], beforeMeso = state.widgets[training.config.mesoId];
  assert.ok(beforeExp?.type === 'exp' && beforeMeso?.type === 'meso');
  assert.equal(beforeExp.data.gained, 100);
  assert.equal(beforeMeso.data.potionCosts, 150);
  assert.deepEqual(beforeMeso.data.potionUses, { 'lemon-price': 1 });
  assert.equal(beforeMeso.data.samples.length, 2);
  state = reducer(state, { type: 'training/reset', id: training.id });
  const exp = state.widgets[training.config.expId], meso = state.widgets[training.config.mesoId];
  assert.ok(exp?.type === 'exp' && meso?.type === 'meso');
  assert.deepEqual(exp.data, defaultData('exp'));
  assert.deepEqual(meso.data, defaultData('meso'));
  assert.equal(meso.data.potionCosts, 0);
  assert.equal(meso.config.goal, 1000);
  assert.deepEqual(meso.config.potions, prices);
  assert.deepEqual(meso.config.selectedPotions, { hp: null, mp: 2010005 });
});

test('malformed or shared training children are repaired without discarding existing data', () => {
  let state = defaultState();
  const first = Object.values(state.widgets).find(w => w.type === 'training');
  assert.ok(first?.type === 'training');
  const originalExp = state.widgets[first.config.expId];
  assert.ok(originalExp?.type === 'exp');
  originalExp.data.gained = 42;
  state = reducer(state, { type: 'widget/add', widgetType: 'training' });
  const second = Object.values(state.widgets).filter(w => w.type === 'training').at(-1);
  assert.ok(second?.type === 'training');
  second.config.expId = first.config.expId;
  first.config.mesoId = 'missing';
  const repaired = normalizeState(state);
  const a = repaired.widgets[first.id], b = repaired.widgets[second.id];
  assert.ok(a?.type === 'training' && b?.type === 'training');
  assert.equal(a.config.expId, originalExp.id);
  assert.notEqual(a.config.expId, b.config.expId);
  assert.equal(repaired.widgets[a.config.mesoId]?.type, 'meso');
  assert.equal(repaired.widgets[b.config.expId]?.type, 'exp');
  const exp = repaired.widgets[originalExp.id];
  assert.ok(exp?.type === 'exp');
  assert.equal(exp.data.gained, 42);
  assert.equal(Object.values(normalizeState(repaired).widgets).filter(w => w.type === 'training').length,
    Object.values(repaired.widgets).filter(w => w.type === 'training').length);
});

test('legacy tracker migration respects each layout and pairs the selected targets', () => {
  let state = defaultState();
  const first = Object.values(state.widgets).find(w => w.type === 'training');
  assert.ok(first?.type === 'training');
  state = reducer(state, { type: 'widget/add', widgetType: 'training' });
  const second = Object.values(state.widgets).filter(w => w.type === 'training').at(-1);
  assert.ok(second?.type === 'training');
  for (const wrapper of [first, second]) {
    delete state.widgets[wrapper.id];
    state.widgetOrder = state.widgetOrder.filter(id => id !== wrapper.id);
    delete state.profiles[0]!.placements[wrapper.id];
  }
  const profile = state.profiles[0]!;
  profile.placements[first.config.expId]!.visible = true;
  profile.placements[second.config.mesoId]!.visible = true;
  state.profiles.push({ ...structuredClone(profile), id: 'alternate' });
  state.profiles[1]!.placements[first.config.expId]!.visible = false;
  state.profiles[1]!.placements[second.config.mesoId]!.visible = false;
  state.settings.gameTracking.expWidgetId = second.config.expId;
  state.settings.gameTracking.mesoWidgetId = first.config.mesoId;
  const migrated = normalizeState(state);
  const paired = Object.values(migrated.widgets).find(w => w.type === 'training' && w.config.expId === second.config.expId);
  assert.ok(paired?.type === 'training');
  assert.equal(paired.config.mesoId, first.config.mesoId);
  const wrappers = Object.values(migrated.widgets).filter(w => w.type === 'training');
  assert.equal(wrappers.length, 2);
  assert.ok(wrappers.every(w => !migrated.profiles[1]!.placements[w.id]!.visible));
  assert.equal(migrated.profiles[0]!.placements[paired.id]!.visible, false);
  assert.equal(wrappers.filter(w => migrated.profiles[0]!.placements[w.id]!.visible).length, 1);
});

test('item-use list excludes zeroes, includes past selections and combines preserved override keys', () => {
  assert.deepEqual(usedRecoveryItems({}, []), []);
  assert.deepEqual(usedRecoveryItems({ 'recovery-2010005': 2, meat: 1, 'recovery-2010003': 1, 'recovery-2000000': 0 },
    [{ id: 'meat', itemId: 2010003, name: 'Meat', unitCost: 80 }]),
  [{ itemId: 2010005, count: 2 }, { itemId: 2010003, count: 2 }]);
});

test('adding and removing a training widget manages its two backing trackers', () => {
  let state = reducer(defaultState(), { type: 'widget/add', widgetType: 'training' });
  const training = Object.values(state.widgets).filter(w => w.type === 'training').at(-1);
  assert.ok(training?.type === 'training');
  assert.equal(state.widgets[training.config.expId]?.type, 'exp');
  assert.equal(state.widgets[training.config.mesoId]?.type, 'meso');
  state = reducer(state, { type: 'widget/remove', id: training.id });
  assert.equal(state.widgets[training.config.expId], undefined);
  assert.equal(state.widgets[training.config.mesoId], undefined);
});

test('a reset leaves other trackers intact and the next automatic EXP reading is a baseline', () => {
  let state = defaultState();
  const first = Object.values(state.widgets).find(w => w.type === 'training');
  assert.ok(first?.type === 'training');
  state = reducer(state, { type: 'widget/add', widgetType: 'training' });
  const second = Object.values(state.widgets).filter(w => w.type === 'training').at(-1);
  assert.ok(second?.type === 'training');
  for (const id of [first.config.expId, second.config.expId]) {
    state = reducer(state, { type: 'exp/status', id, value: 100, required: 1000, level: 1, percent: 10, at: 1 });
    state = reducer(state, { type: 'exp/status', id, value: 200, required: 1000, level: 1, percent: 20, at: 2 });
  }
  state = reducer(state, { type: 'training/reset', id: first.id });
  state = reducer(state, { type: 'exp/status', id: first.config.expId, value: 250, required: 1000, level: 1, percent: 25, at: 3 });
  const a = state.widgets[first.config.expId], b = state.widgets[second.config.expId];
  assert.ok(a?.type === 'exp' && b?.type === 'exp');
  assert.equal(a.data.current, 250);
  assert.equal(a.data.gained, 0);
  assert.equal(a.data.source, 'status-bar');
  assert.equal(b.data.gained, 100);
});
