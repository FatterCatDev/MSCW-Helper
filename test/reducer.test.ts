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
  assert.equal(s.widgetOrder.length, 4);
  for (const id of s.widgetOrder) assert.equal(s.profiles[0]!.placements[id]?.visible, true);
});

test('adding a widget shows it only in the active layout', () => {
  let s = run(defaultState(), { type: 'profile/create', name: 'Bossing' });
  const bossing = s.activeProfileId;
  s = run(s, { type: 'widget/add', widgetType: 'meso' });
  const meso = widgetOfType(s, 'meso');
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

test('EXP samples detect level ups and keep cumulative progress', () => {
  let s = defaultState();
  const exp = widgetOfType(s, 'exp');
  s = run(
    s,
    { type: 'rate/sample', id: exp.id, value: 90, at: 0 },
    { type: 'rate/sample', id: exp.id, value: 99, at: 1000 },
    { type: 'rate/sample', id: exp.id, value: 4, at: 2000 }
  );
  const d = widgetOfType(s, 'exp').data;
  assert.equal(d.levelUps, 1);
  assert.equal(d.levelOffset, 100);
  assert.deepEqual(d.samples.map((x) => x.value), [90, 99, 104]);
});

test('small EXP drops (e.g. death penalty) are not level ups', () => {
  let s = defaultState();
  const exp = widgetOfType(s, 'exp');
  s = run(s, { type: 'rate/sample', id: exp.id, value: 50, at: 0 }, { type: 'rate/sample', id: exp.id, value: 47, at: 1000 });
  assert.equal(widgetOfType(s, 'exp').data.levelUps, 0);
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

test('kill counter never goes negative and records start time once', () => {
  let s = defaultState();
  const id = widgetOfType(s, 'kills').id;
  s = run(s, { type: 'kills/add', id, delta: -1, at: 1 }, { type: 'kills/add', id, delta: 1, at: 2 }, { type: 'kills/add', id, delta: 1, at: 3 });
  assert.deepEqual(widgetOfType(s, 'kills').data, { count: 2, startedAt: 1 });
});

test('actions targeting the wrong widget type are ignored', () => {
  const s = defaultState();
  const exp = widgetOfType(s, 'exp');
  assert.equal(run(s, { type: 'kills/add', id: exp.id, delta: 1, at: 1 }), s);
  assert.equal(run(s, { type: 'session/toggle', id: 'nope', at: 1 }), s);
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
