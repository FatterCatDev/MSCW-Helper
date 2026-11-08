import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState, normalizeState } from '../src/shared/defaults.ts';
import { reducer } from '../src/shared/reducer.ts';
import { isTrainingMap, reconcileTrainingTime, trainingElapsed } from '../src/shared/training-time.ts';
import type { MapStatus } from '../src/shared/types.ts';

test('training time pauses and resumes without counting the gap', () => {
  let state = defaultState();
  const training = Object.values(state.widgets).find(w => w.type === 'training');
  assert.ok(training?.type === 'training');
  const data = () => {
    const w = state.widgets[training.id];
    assert.ok(w?.type === 'training');
    return w.data;
  };
  state = reconcileTrainingTime(state, training.config.expId, 1000);
  assert.equal(trainingElapsed(data(), 4000), 3000);
  state = reconcileTrainingTime(state, null, 4000);
  assert.equal(trainingElapsed(data(), 9000), 3000);
  state = reconcileTrainingTime(state, training.config.expId, 9000);
  assert.equal(trainingElapsed(data(), 11000), 5000);
  state = reconcileTrainingTime(state, null, 11000);
  assert.deepEqual(data(), { elapsedMs: 5000, runningSince: null });
  assert.equal(reconcileTrainingTime(state, null, 12000), state);
});

test('unknown safety counts as training while capture runs, including after a reset', () => {
  let state = defaultState();
  const training = Object.values(state.widgets).find(w => w.type === 'training');
  assert.ok(training?.type === 'training');
  const map = (status: MapStatus['state']): MapStatus => ({ state: status, message: '' });
  const sync = (running: boolean, status: MapStatus['state'], at: number) => {
    state = reconcileTrainingTime(state, isTrainingMap(running, map(status)) ? training.config.expId : null, at);
  };
  const elapsed = (at: number) => {
    const widget = state.widgets[training.id];
    assert.ok(widget?.type === 'training');
    return trainingElapsed(widget.data, at);
  };
  sync(true, 'unknown', 1000);
  assert.equal(elapsed(4000), 3000);
  sync(true, 'safe', 4000);
  assert.equal(elapsed(6000), 3000);
  sync(true, 'unknown', 6000);
  state = reducer(state, { type: 'training/reset', id: training.id });
  sync(true, 'unknown', 7000);
  assert.equal(elapsed(9000), 2000);
  sync(false, 'unknown', 9000);
  assert.equal(elapsed(11000), 2000);
  for (const status of ['searching', 'missing', 'reading', 'safe'] as const) {
    assert.equal(isTrainingMap(true, map(status)), false, status);
  }
  assert.equal(isTrainingMap(true, map('unsafe')), true);
  assert.equal(isTrainingMap(false, map('unsafe')), false);
});

test('reset and new capture clear training time without changing other trackers or the session timer', () => {
  let state = defaultState();
  const training = Object.values(state.widgets).find(w => w.type === 'training');
  const session = Object.values(state.widgets).find(w => w.type === 'session');
  assert.ok(training?.type === 'training' && session?.type === 'session');
  state = reducer(state, { type: 'session/toggle', id: session.id, at: 1000 });
  state = reconcileTrainingTime(state, training.config.expId, 1000);
  state = reconcileTrainingTime(state, null, 5000);
  state = reducer(state, { type: 'training/reset', id: training.id });
  const reset = state.widgets[training.id], timer = state.widgets[session.id];
  assert.ok(reset?.type === 'training' && timer?.type === 'session');
  assert.deepEqual(reset.data, { elapsedMs: 0, runningSince: null });
  assert.deepEqual(timer.data, { running: true, startedAt: 1000, accumulatedMs: 0 });
  state = reconcileTrainingTime(state, training.config.expId, 6000);
  state = reconcileTrainingTime(state, null, 8000);
  state = reducer(state, { type: 'exp/start', id: training.config.expId });
  const restarted = state.widgets[training.id];
  assert.ok(restarted?.type === 'training');
  assert.deepEqual(restarted.data, { elapsedMs: 0, runningSince: null });
});

test('only active tracker runs and persisted active timestamps never count offline time', () => {
  let state = defaultState();
  const first = Object.values(state.widgets).find(w => w.type === 'training');
  assert.ok(first?.type === 'training');
  state = reducer(state, { type: 'widget/add', widgetType: 'training' });
  const second = Object.values(state.widgets).filter(w => w.type === 'training').at(-1);
  assert.ok(second?.type === 'training');
  state = reconcileTrainingTime(state, first.config.expId, 1000);
  state = reconcileTrainingTime(state, second.config.expId, 4000);
  const a = state.widgets[first.id], b = state.widgets[second.id];
  assert.ok(a?.type === 'training' && b?.type === 'training');
  assert.deepEqual(a.data, { elapsedMs: 3000, runningSince: null });
  assert.deepEqual(b.data, { elapsedMs: 0, runningSince: 4000 });
  const loaded = normalizeState(state);
  const saved = loaded.widgets[second.id];
  assert.ok(saved?.type === 'training');
  assert.deepEqual(saved.data, { elapsedMs: 0, runningSince: null });
});
