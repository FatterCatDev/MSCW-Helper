import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RecoveryLifecycle } from '../src/main/recovery-lifecycle.ts';
import { defaultState } from '../src/shared/defaults.ts';
import { reducer } from '../src/shared/reducer.ts';
import type { PotionTracker } from '../src/shared/types.ts';

function fixture() {
  let state = defaultState();
  const widget = Object.values(state.widgets).find(w => w.type === 'meso');
  assert.ok(widget && widget.type === 'meso');
  const starts: { id: string; selected: number[] }[] = [];
  const stops: string[] = [];
  const errors: string[] = [];
  const lifecycle = new RecoveryLifecycle({
    start(id: string, _prices: PotionTracker[], selected: number[]) {
      starts.push({ id, selected });
    },
    stop(id: string) { stops.push(id); }
  }, (id, error) => errors.push(`${id}: ${String(error)}`));
  const update = (patch: Record<string, unknown>, id = widget.id) => {
    state = reducer(state, { type: 'widget/config', id, config: patch });
  };
  const sync = (running: boolean, resetId?: string) => lifecycle.reconcile(state, running, resetId);
  return { widget, starts, stops, errors, update, sync, getState: () => state,
    setState: (next: typeof state) => { state = next; } };
}

test('starts automatically when capture and selection are ready in either order', () => {
  const f = fixture();
  f.sync(true);
  f.update({ selectedPotions: { hp: null, mp: 2010005 } });
  f.sync(true); f.sync(true);
  assert.deepEqual(f.starts, [{ id: f.widget.id, selected: [2010005] }]);
  f.sync(false);
  assert.deepEqual(f.stops, [f.widget.id]);
  f.sync(true);
  assert.equal(f.starts.length, 2);
  assert.deepEqual(f.errors, []);
});

test('changes and resets rebaseline automatically, unrelated state does not, and blank selection stops', () => {
  const f = fixture();
  f.update({ selectedPotions: { hp: null, mp: 2010005 } });
  f.sync(false); assert.equal(f.starts.length, 0);
  f.sync(true);
  f.update({ goal: 100 }); f.sync(true);
  assert.equal(f.starts.length, 1);
  f.update({ selectedPotions: { hp: 2000000, mp: 2010005 } }); f.sync(true);
  assert.equal(f.starts.length, 2); assert.equal(f.stops.length, 1);
  f.sync(true, f.widget.id);
  assert.equal(f.starts.length, 3); assert.equal(f.stops.length, 2);
  f.update({ selectedPotions: { hp: null, mp: null } }); f.sync(true);
  assert.equal(f.stops.length, 3);
  assert.equal(f.starts.length, 3);
});

test('independent Meso Trackers start and stop independently', () => {
  const f = fixture();
  f.setState(reducer(f.getState(), { type: 'widget/add', widgetType: 'meso' }));
  const second = Object.values(f.getState().widgets).find(w => w.type === 'meso' && w.id !== f.widget.id);
  assert.ok(second && second.type === 'meso');
  const config = { selectedPotions: { hp: null, mp: 2010005 } };
  f.update(config); f.update(config, second.id); f.sync(true);
  assert.equal(f.starts.length, 2);
  f.setState(reducer(f.getState(), { type: 'widget/remove', id: second.id }));
  f.sync(true);
  assert.deepEqual(f.stops, [second.id]);
  assert.equal(f.starts.length, 2);
});

test('failed automatic starts report errors once and retry after configuration changes', () => {
  const f = fixture();
  f.update({ selectedPotions: { hp: null, mp: 2010005 } });
  let attempts = 0;
  const errors: unknown[] = [];
  const lifecycle = new RecoveryLifecycle({
    start() { attempts++; throw new Error('test failure'); },
    stop() { assert.fail('Failed tracker was not started'); }
  }, (_id, error) => errors.push(error));
  lifecycle.reconcile(f.getState(), true); lifecycle.reconcile(f.getState(), true);
  assert.equal(attempts, 1); assert.equal(errors.length, 1);
  f.update({ selectedPotions: { hp: null, mp: 2000003 } });
  lifecycle.reconcile(f.getState(), true);
  assert.equal(attempts, 2); assert.equal(errors.length, 2);
});
