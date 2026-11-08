import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_GAME_DATA_PATH, defaultState, normalizeState } from '../src/shared/defaults.ts';
import { isAction, reducer, type Action } from '../src/shared/reducer.ts';
import type { PersistedState, WidgetDef } from '../src/shared/types.ts';

const run = (s: PersistedState, ...actions: Action[]): PersistedState => actions.reduce(reducer, s);
const widgetOfType = <T extends WidgetDef['type']>(s: PersistedState, type: T): WidgetDef<T> =>
  Object.values(s.widgets).find((w) => w.type === type) as WidgetDef<T>;

test('default state has one layout with the starter widgets visible', () => {
  const s = defaultState();
  assert.equal(s.profiles.length, 1);
  assert.equal(s.widgetOrder.length, 5);
  for (const id of s.widgetOrder) assert.equal(s.profiles[0]!.placements[id]?.visible,
    s.widgets[id]?.type !== 'exp' && s.widgets[id]?.type !== 'meso');
});

test('adding a widget shows it only in the active layout', () => {
  let s = run(defaultState(), { type: 'profile/create', name: 'Bossing' });
  const bossing = s.activeProfileId;
  s = run(s, { type: 'widget/add', widgetType: 'meso' });
  const meso = s.widgets[s.widgetOrder.at(-1)!]!;
  assert.ok(meso);
  for (const p of s.profiles) assert.equal(p.placements[meso.id]?.visible, p.id === bossing);
});

test('removing a widget removes it from all layouts and order', () => {
  let s = run(defaultState(), { type: 'profile/create', name: 'Copy' });
  const id = s.widgetOrder[0]!;
  s = run(s, { type: 'widget/remove', id });
  assert.equal(s.widgets[id], undefined);
  assert.ok(!s.widgetOrder.includes(id));
  for (const p of s.profiles) assert.equal(p.placements[id], undefined);
});

test('placement changes only affect the active layout and are clamped', () => {
  let s = run(defaultState(), { type: 'profile/create', name: 'Copy' });
  const id = s.widgetOrder[0]!;
  s = run(s, { type: 'placement/set', id, patch: { x: 123, opacity: 5, w: 1 } });
  const active = s.profiles.find((p) => p.id === s.activeProfileId)!;
  const other = s.profiles.find((p) => p.id !== s.activeProfileId)!;
  assert.equal(active.placements[id]!.x, 123);
  assert.equal(active.placements[id]!.opacity, 1);
  assert.equal(active.placements[id]!.w, 80);
  assert.notEqual(other.placements[id]!.x, 123);
});

test('cannot delete the last layout; deleting active switches to another', () => {
  let s = defaultState();
  assert.equal(run(s, { type: 'profile/delete', id: s.activeProfileId }), s);
  s = run(s, { type: 'profile/create', name: 'Two' });
  const two = s.activeProfileId;
  s = run(s, { type: 'profile/delete', id: two });
  assert.equal(s.profiles.length, 1);
  assert.notEqual(s.activeProfileId, two);
});

test('profile/next cycles through layouts', () => {
  let s = run(defaultState(), { type: 'profile/create', name: 'B' });
  const [a, b] = s.profiles.map((p) => p.id);
  assert.equal(s.activeProfileId, b);
  s = run(s, { type: 'profile/next' });
  assert.equal(s.activeProfileId, a);
});

test('EXP points accumulate across explicitly recorded level ups with different requirements', () => {
  let s = defaultState();
  const exp = widgetOfType(s, 'exp');
  s = run(
    s,
    { type: 'exp/sample', id: exp.id, value: 900, required: 1000, level: 10, at: 0 },
    { type: 'exp/sample', id: exp.id, value: 990, required: 1000, level: 10, at: 1000 },
    { type: 'exp/sample', id: exp.id, value: 40, required: 1500, level: 11, at: 2000 }
  );
  const d = widgetOfType(s, 'exp').data;
  assert.equal(d.level, 11);
  assert.equal(d.gained, 140);
  assert.equal(d.required, 1500);
  assert.deepEqual(d.samples.map((x) => x.value), [0, 90, 140]);
});

test('same-level EXP loss is not interpreted as a level up', () => {
  let s = defaultState();
  const exp = widgetOfType(s, 'exp');
  s = run(s, { type: 'exp/sample', id: exp.id, value: 500, required: 1000, level: 10, at: 0 },
    { type: 'exp/sample', id: exp.id, value: 100, required: 1000, level: 10, at: 1000 });
  assert.equal(widgetOfType(s, 'exp').data.level, 10);
  assert.equal(widgetOfType(s, 'exp').data.gained, -400);
});

test('session timer accumulates across pause/resume', () => {
  let s = defaultState();
  const id = widgetOfType(s, 'session').id;
  s = run(s, { type: 'session/toggle', id, at: 1000 }, { type: 'session/toggle', id, at: 4000 }, { type: 'session/toggle', id, at: 10_000 });
  const d = widgetOfType(s, 'session').data;
  assert.equal(d.accumulatedMs, 3000);
  assert.equal(d.running, true);
  assert.equal(d.startedAt, 10_000);
});

test('timer/start uses the configured duration; stop clears it', () => {
  let s = defaultState();
  const w = widgetOfType(s, 'timers');
  const t = w.config.timers[0]!;
  s = run(s, { type: 'timer/start', id: w.id, timerId: t.id, at: 5000 });
  assert.equal(widgetOfType(s, 'timers').data.endsAt[t.id], 5000 + t.durationSec * 1000);
  s = run(s, { type: 'timer/stop', id: w.id, timerId: t.id });
  assert.equal(widgetOfType(s, 'timers').data.endsAt[t.id], undefined);
});

test('actions targeting the wrong widget type are ignored', () => {
  const s = defaultState();
  const exp = widgetOfType(s, 'exp');
  assert.equal(run(s, { type: 'potion/used', id: exp.id, potionId: 'nope', quantity: 1 }), s);
  assert.equal(run(s, { type: 'session/toggle', id: 'nope', at: 1 }), s);
});

test('old kill widgets are removed from every layout and percentage history is not reinterpreted as points', () => {
  const s = defaultState();
  const exp = widgetOfType(s, 'exp');
  const raw = JSON.parse(JSON.stringify(s));
  raw.widgets.oldKills = { id: 'oldKills', type: 'kills', config: {}, data: { count: 20 } };
  raw.widgetOrder.push('oldKills');
  raw.profiles[0].placements.oldKills = raw.profiles[0].placements[exp.id];
  raw.widgets[exp.id].data = { samples: [{ t: 0, value: 90 }], levelOffset: 0, levelUps: 0 };
  const fixed = normalizeState(raw);
  assert.equal(fixed.widgets.oldKills, undefined);
  assert.ok(!fixed.widgetOrder.includes('oldKills'));
  assert.equal(fixed.profiles[0]!.placements.oldKills, undefined);
  assert.equal(widgetOfType(fixed, 'exp').data.migrated, true);
  assert.deepEqual(widgetOfType(fixed, 'exp').data.samples, []);
});

test('EXP session total survives rolling history pruning and reset starts a new baseline', () => {
  let s = defaultState();
  const id = widgetOfType(s, 'exp').id;
  for (let minute = 0; minute <= 30; minute++) {
    s = run(s, { type: 'exp/sample', id, value: minute * 100, required: 10000, level: 10, at: minute * 60_000 });
  }
  const d = widgetOfType(s, 'exp').data;
  assert.equal(d.gained, 3000);
  assert.equal(d.startedAt, 0);
  assert.equal(d.samples[0]!.t, 18 * 60_000);
  assert.equal(d.samples.length, 13);
  assert.deepEqual(widgetOfType(normalizeState(s), 'exp').data, d);
  s = run(s, { type: 'rate/reset', id });
  assert.equal(widgetOfType(s, 'exp').data.startedAt, null);
  assert.equal(widgetOfType(s, 'exp').data.gained, 0);
});

test('invalid, out-of-order and skipped-level EXP readings are rejected', () => {
  let s = defaultState();
  const id = widgetOfType(s, 'exp').id;
  s = run(s, { type: 'exp/sample', id, value: 100, required: 1000, level: 10, at: 1000 });
  const base = { type: 'exp/sample' as const, id, value: 200, required: 1000, level: 10, at: 2000 };
  for (const patch of [{ value: NaN }, { value: 0.5 }, { value: 1000 }, { required: 0 },
    { level: 12 }, { level: 9 }, { at: 1000 }]) {
    assert.equal(run(s, { ...base, ...patch }), s);
  }
});

test('potion expenses accumulate at configured purchase prices without changing wallet samples', () => {
  let s = defaultState();
  const id = widgetOfType(s, 'meso').id;
  s = run(s, { type: 'widget/config', id, config: { potions: [
    { id: 'hp', itemId: 2000000, name: 'Red Potion', unitCost: 50, sourceId: 'screen:0:0',
      region: { x: 0, y: 0, width: 0.1, height: 0.1 } }
  ] } }, { type: 'rate/sample', id, value: 10000, at: 1000 });
  const samples = widgetOfType(s, 'meso').data.samples;
  s = run(s, { type: 'potion/used', id, potionId: 'hp', quantity: 1 },
    { type: 'potion/used', id, potionId: 'hp', quantity: 1 });
  assert.equal(widgetOfType(s, 'meso').data.potionCosts, 100);
  assert.equal(widgetOfType(s, 'meso').data.potionUses.hp, 2);
  assert.deepEqual(widgetOfType(s, 'meso').data.samples, samples);
  const bulk = run(s, { type: 'potion/used', id, potionId: 'hp', quantity: 20 });
  assert.equal(widgetOfType(bulk, 'meso').data.potionCosts, 1100);
  assert.equal(widgetOfType(bulk, 'meso').data.potionUses.hp, 22);
  assert.equal(run(s, { type: 'potion/used', id, potionId: 'hp', quantity: 10000 }), s);
  assert.equal(run(s, { type: 'potion/used', id, potionId: 'missing', quantity: 1 }), s);
  assert.equal(widgetOfType(run(s, { type: 'potion/reset', id }), 'meso').data.potionCosts, 0);
  assert.equal(widgetOfType(run(s, { type: 'rate/reset', id }), 'meso').data.potionCosts, 0);
  assert.equal(widgetOfType(normalizeState(s), 'meso').data.potionCosts, 100);
});

test('legacy mesos data gets potion defaults and incomplete potion setup survives restart', () => {
  const s = defaultState();
  const meso = widgetOfType(s, 'meso');
  const raw = JSON.parse(JSON.stringify(s));
  raw.widgets[meso.id].config = { goal: 100000 };
  raw.widgets[meso.id].data = { samples: [{ t: 1000, value: 500 }] };
  const migrated = widgetOfType(normalizeState(raw), 'meso');
  assert.equal(migrated.config.goal, 100000);
  assert.deepEqual(migrated.config.potions, []);
  assert.equal(migrated.data.potionCosts, 0);
  assert.deepEqual(migrated.data.samples, [{ t: 1000, value: 500 }]);
  raw.widgets[meso.id].config.potions = [{ id: 'hp', itemId: 2000000, name: 'Red Potion', unitCost: 0,
    sourceId: '', region: { x: 0, y: 0, width: 0, height: 0 } }];
  assert.equal(widgetOfType(normalizeState(raw), 'meso').config.potions.length, 1);
});

test('notes daily reset unchecks items once per key', () => {
  let s = run(defaultState(), { type: 'widget/add', widgetType: 'notes' });
  const id = widgetOfType(s, 'notes').id;
  s = run(s, { type: 'widget/data', id, data: { items: [{ id: 'a', text: 'Daily quest', done: true }] } });
  s = run(s, { type: 'notes/dailyReset', id, key: '2026-11-07' });
  assert.equal(widgetOfType(s, 'notes').data.items[0]!.done, false);
  const again = run(s, { type: 'notes/dailyReset', id, key: '2026-11-07' });
  assert.equal(again, s);
});

test('isAction rejects unknown or malformed messages', () => {
  assert.equal(isAction({ type: 'widget/add', widgetType: 'exp' }), true);
  assert.equal(isAction({ type: 'evil' }), false);
  assert.equal(isAction(null), false);
  assert.equal(isAction('widget/add'), false);
});

test('settings/set ignores unknown keys and wrong types', () => {
  const s = defaultState();
  const next = run(s, { type: 'settings/set', patch: { soundEnabled: false, clickThrough: 'yes' as unknown as boolean, ...({ evil: 1 } as object) } });
  assert.equal(next.settings.soundEnabled, false);
  assert.equal(next.settings.clickThrough, false);
  assert.ok(!('evil' in next.settings));
});

test('normalizeState repairs garbage and partial files', () => {
  assert.equal(normalizeState(null).profiles.length, 1);
  assert.equal(normalizeState('junk').version, 1);

  const s = defaultState();
  const raw = JSON.parse(JSON.stringify(s));
  raw.widgets.bad = { type: 'unknown' };
  raw.profiles[0].placements.ghost = { x: 1 };
  raw.activeProfileId = 'missing';
  delete raw.settings.hotkeys.toggleEdit;
  const fixed = normalizeState(raw);
  assert.equal(fixed.widgets.bad, undefined);
  assert.equal(fixed.profiles[0]!.placements.ghost, undefined);
  assert.equal(fixed.activeProfileId, fixed.profiles[0]!.id);
  assert.equal(fixed.settings.hotkeys.toggleEdit, 'Ctrl+Shift+F2');
  assert.deepEqual(fixed.widgetOrder, s.widgetOrder);
});

test('game Data path defaults, persists and rejects blank or wrong-type settings', () => {
  const s = defaultState();
  assert.equal(s.settings.gameDataPath, DEFAULT_GAME_DATA_PATH);
  const next = run(s, { type: 'settings/set', patch: { gameDataPath: '  D:\\Games\\MSCW\\Data  ' } });
  assert.equal(next.settings.gameDataPath, 'D:\\Games\\MSCW\\Data');
  assert.equal(normalizeState(next).settings.gameDataPath, next.settings.gameDataPath);
  assert.equal(run(next, { type: 'settings/set', patch: { gameDataPath: ' ' } }).settings.gameDataPath, next.settings.gameDataPath);
  assert.equal(normalizeState({ ...s, settings: {} }).settings.gameDataPath, DEFAULT_GAME_DATA_PATH);
  assert.equal(normalizeState({ ...s, settings: { gameDataPath: 42 } }).settings.gameDataPath, DEFAULT_GAME_DATA_PATH);
});
