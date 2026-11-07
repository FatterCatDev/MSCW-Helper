import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState, normalizeState } from '../src/shared/defaults.ts';
import { DEFAULT_EXP_REGION, DEFAULT_LEVEL_REGION, estimateExpRequirement, expRequirementRange, parseExpFields, parseExpStatus } from '../src/shared/game-tracking.ts';
import { reducer } from '../src/shared/reducer.ts';
import { etaMs, rollingPerMinute } from '../src/shared/time.ts';

test('parses actual status-bar EXP, percentage and spaced orange level digits', () => {
  assert.deepEqual(parseExpFields('4 1\n', '183.449[56.58%]\n'), { level: 41, current: 183449, percent: 56.58 });
  assert.deepEqual(parseExpFields('41', '183.52 7 [56.60%]'), { level: 41, current: 183527, percent: 56.60 });
  assert.equal(parseExpFields('41', '183,527[56.60%1')?.current, 183527);
  assert.equal(parseExpStatus('LV. 41 HP1084/1995 MP430/795 EXP183,449[56.58%]')?.current, 183449);
  for (const text of ['183.44[56.58%]', '183O49[56.58%]', '183449[100.00%]', '0[12.00%]', '183449[56.58]']) {
    assert.equal(parseExpFields('41', text), null);
  }
  assert.equal(parseExpFields('gq1', '183449[56.58%]'), null);
});

test('estimates level requirement from points/percentage and retains it across rounding', () => {
  const required = estimateExpRequirement({ level: 41, current: 183449, percent: 56.58 });
  assert.equal(required, 324229);
  assert.equal(estimateExpRequirement({ level: 41, current: 183527, percent: 56.60 }, required!), required);
  assert.equal(estimateExpRequirement({ level: 42, current: 0, percent: 0 }), null);
  assert.equal(estimateExpRequirement({ level: 42, current: 0, percent: 0 }, 500000), 500000);
  const range = expRequirementRange({ level: 41, current: 100, percent: 0.03 });
  assert.ok(range);
  const refined = expRequirementRange({ level: 41, current: 183449, percent: 56.58 }, range);
  assert.ok(refined && refined.min <= 324240 && refined.max >= 324240);
  assert.equal(expRequirementRange({ level: 41, current: 190000, percent: 56.58 }, refined), null);
});

test('persistent EXP differences yield exact points/min and estimated time-to-level without loot changes', () => {
  let state = defaultState();
  const exp = Object.values(state.widgets).find(w => w.type === 'exp')!;
  const meso = Object.values(state.widgets).find(w => w.type === 'meso')!;
  const originalMeso = state.widgets[meso.id];
  state = reducer(state, { type: 'exp/start', id: exp.id });
  state = reducer(state, { type: 'exp/status', id: exp.id, level: 41, value: 183449, percent: 56.58, required: 324229, at: 1000 });
  state = reducer(state, { type: 'exp/status', id: exp.id, level: 41, value: 183527, percent: 56.60, required: 324229, at: 61000 });
  const widget = state.widgets[exp.id];
  assert.ok(widget?.type === 'exp');
  assert.equal(widget.data.gained, 78);
  assert.equal(rollingPerMinute(widget.data.samples, 61000, 60000), 78);
  assert.equal(rollingPerMinute(widget.data.samples, 61000, 600000), 78);
  assert.ok(Math.abs(etaMs(widget.data.required - widget.data.current!, 78 * 60)! - (324229 - 183527) / 78 * 60000) < 0.001);
  assert.deepEqual(state.widgets[meso.id], originalMeso);
  const restored = normalizeState(state).widgets[exp.id];
  assert.ok(restored?.type === 'exp');
  assert.equal(restored.data.source, 'status-bar');
  const manual = reducer(state, { type: 'exp/sample', id: exp.id, value: 190000, required: 324229, level: 41, at: 62000 });
  assert.equal(manual, state);
});

test('status readings count level rollover and losses, but reject skipped levels and stale samples', () => {
  let state = defaultState();
  const id = Object.values(state.widgets).find(w => w.type === 'exp')!.id;
  state = reducer(state, { type: 'exp/start', id });
  state = reducer(state, { type: 'exp/status', id, level: 41, value: 990, required: 1000, percent: 99, at: 1000 });
  state = reducer(state, { type: 'exp/status', id, level: 42, value: 20, required: 2000, percent: 1, at: 2000 });
  state = reducer(state, { type: 'exp/status', id, level: 42, value: 10, required: 2000, percent: 0.5, at: 3000 });
  const widget = state.widgets[id];
  assert.ok(widget?.type === 'exp');
  assert.equal(widget.data.gained, 20);
  assert.equal(reducer(state, { type: 'exp/status', id, level: 44, value: 10, required: 3000, percent: 0.33, at: 4000 }), state);
  assert.equal(reducer(state, { type: 'exp/status', id, level: 42, value: 10, required: 2000, percent: 0.5, at: 2000 }), state);
});

test('old notification crops migrate to separate EXP and level number regions', () => {
  const state = defaultState();
  delete state.settings.gameTracking.captureMode;
  state.settings.gameTracking.region = { x: 0.84, y: 0.68, width: 0.16, height: 0.13 };
  const migrated = normalizeState(state).settings.gameTracking;
  assert.deepEqual(migrated.region, DEFAULT_EXP_REGION);
  assert.deepEqual(migrated.levelRegion, DEFAULT_LEVEL_REGION);
  assert.equal(migrated.captureMode, 'status-bar');
});
