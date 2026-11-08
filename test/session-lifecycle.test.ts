import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/main/store.ts';
import { defaultState } from '../src/shared/defaults.ts';
import { reducer } from '../src/shared/reducer.ts';
import { resetSessionTimers } from '../src/shared/session-lifecycle.ts';

test('launch starts all saved session timers fresh and shutdown resets them', () => {
  let state = defaultState();
  state = reducer(state, { type: 'widget/add', widgetType: 'session' });
  const timers = Object.values(state.widgets).filter(w => w.type === 'session');
  assert.equal(timers.length, 2);
  state = reducer(state, { type: 'session/toggle', id: timers[0]!.id, at: 100 });
  state = reducer(state, { type: 'session/toggle', id: timers[0]!.id, at: 500 });
  state = reducer(state, { type: 'session/toggle', id: timers[1]!.id, at: 200 });
  const launched = resetSessionTimers(state, 1000);
  for (const timer of timers) {
    const saved = launched.widgets[timer.id];
    assert.ok(saved?.type === 'session');
    assert.deepEqual(saved.data, { running: true, startedAt: 1000, accumulatedMs: 0 });
  }
  const shutdown = resetSessionTimers(launched, null);
  for (const timer of timers) {
    const saved = shutdown.widgets[timer.id];
    assert.ok(saved?.type === 'session');
    assert.deepEqual(saved.data, { running: false, startedAt: 0, accumulatedMs: 0 });
  }
  assert.deepEqual(resetSessionTimers(shutdown, 2000).widgets[timers[0]!.id]?.data,
    { running: true, startedAt: 2000, accumulatedMs: 0 });
  const first = launched.widgets[timers[0]!.id];
  assert.ok(first?.type === 'session');
  assert.equal(first.data.accumulatedMs, 0);
});

test('shutdown reset persists and a stale running timer starts fresh after an unclean exit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mscw-session-'));
  const file = join(dir, 'state.json');
  try {
    const store = new Store(file);
    const timer = Object.values(store.get().widgets).find(w => w.type === 'session');
    assert.ok(timer?.type === 'session');
    store.set(resetSessionTimers(store.get(), 1000));
    store.flush();
    const reopened = new Store(file);
    const stale = reopened.get().widgets[timer.id];
    assert.ok(stale?.type === 'session');
    assert.equal(stale.data.running, true);
    reopened.set(resetSessionTimers(reopened.get(), 5000));
    const fresh = reopened.get().widgets[timer.id];
    assert.ok(fresh?.type === 'session');
    assert.deepEqual(fresh.data, { running: true, startedAt: 5000, accumulatedMs: 0 });
    reopened.set(resetSessionTimers(reopened.get(), null));
    reopened.flush();
    const saved = new Store(file).get().widgets[timer.id];
    assert.ok(saved?.type === 'session');
    assert.deepEqual(saved.data, { running: false, startedAt: 0, accumulatedMs: 0 });
  } finally {
    unlinkSync(file);
    rmdirSync(dir);
  }
});

test('manual pause, resume and reset remain available after automatic start', () => {
  let state = resetSessionTimers(defaultState(), 1000);
  const timer = Object.values(state.widgets).find(w => w.type === 'session');
  assert.ok(timer?.type === 'session');
  state = reducer(state, { type: 'session/toggle', id: timer.id, at: 4000 });
  assert.deepEqual(state.widgets[timer.id]?.data, { running: false, startedAt: 0, accumulatedMs: 3000 });
  state = reducer(state, { type: 'session/toggle', id: timer.id, at: 5000 });
  assert.deepEqual(state.widgets[timer.id]?.data, { running: true, startedAt: 5000, accumulatedMs: 3000 });
  state = reducer(state, { type: 'session/reset', id: timer.id });
  assert.deepEqual(state.widgets[timer.id]?.data, { running: false, startedAt: 0, accumulatedMs: 0 });
});
