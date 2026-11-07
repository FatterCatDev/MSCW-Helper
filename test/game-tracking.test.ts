import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState, normalizeState } from '../src/shared/defaults.ts';
import { reducer } from '../src/shared/reducer.ts';
import { CAPTURE_INTERVAL_MS, MAX_CAPTURE_FPS, isGameTrackingConfig, isolateNotificationText, itemNameDistance, newGainEvents, parseConfidentGainLine, parseGainLine, validRegion } from '../src/shared/game-tracking.ts';

test('parses the EXP, meso and item notification formats in the gameplay video', () => {
  assert.deepEqual(parseGainLine('You received EXP (+12)'), { kind: 'exp', amount: 12, key: 'exp:12' });
  assert.deepEqual(parseGainLine('You have gained mesos (+1,234)'), { kind: 'meso', amount: 1234, key: 'meso:1234' });
  assert.deepEqual(parseGainLine('Squishy Liquid x1 earned. (Etc)'), {
    kind: 'item', name: 'Squishy Liquid', quantity: 1, key: 'item:squishy liquid:1'
  });

  assert.equal(parseGainLine('Squishy Liguid #1 earned. (Etc)')?.kind, 'item');
  for (const text of ['received EXP', 'You received EXP (+0)', 'You received EXP (+1O)', 'Sold Squishy Liquid', 'Squishy Liquid x0 earned. (Etc)']) {
    assert.equal(parseGainLine(text), null);
  }
});

test('scrolling notification overlap preserves repeated gain events without replaying persistent messages', () => {
  const exp = parseGainLine('You received EXP (+12)')!;
  const meso = parseGainLine('You have gained mesos (+14)')!;
  assert.deepEqual(newGainEvents([exp, meso], [exp, meso]), []);
  assert.deepEqual(newGainEvents([exp, meso], [meso, exp]), [exp]);
  assert.deepEqual(newGainEvents([exp], [exp, exp]), [exp]);
  assert.deepEqual(newGainEvents([], [exp, exp]), [exp, exp]);
  assert.deepEqual(newGainEvents([exp, meso, exp], [meso, exp]), []);
});

test('uncertain numeric words from the video cannot inflate meso gains', () => {
  const line = { text: 'You have gained mesos (+145)', confidence: 86,
    words: [{ text: '(+145)', confidence: 72, symbols: [{ text: '1', confidence: 99 }, { text: '4', confidence: 98 }, { text: '5', confidence: 96 }] }] };
  assert.equal(parseConfidentGainLine(line), null);
  assert.equal(parseConfidentGainLine({ ...line, text: 'You have gained mesos (+14)', words: [{
    text: '(+14)', confidence: 91, symbols: [{ text: '1', confidence: 99 }, { text: '4', confidence: 99 }]
  }] })?.kind, 'meso');
  assert.equal(itemNameDistance('Squishy Liguid', 'Squishy Liquid'), 1);
  assert.ok(itemNameDistance('Tree Branch', 'Squishy Liquid') > 1);
});

test('gain session combines meso pickups and item quantities without wallet sale double counting', () => {
  let s = defaultState();
  const exp = Object.values(s.widgets).find(w => w.type === 'exp')!;
  const meso = Object.values(s.widgets).find(w => w.type === 'meso')!;
  s = reducer(s, { type: 'tracking/start', expId: exp.id, mesoId: meso.id, at: 1000 });
  s = reducer(s, { type: 'tracking/gain', expId: exp.id, mesoId: meso.id, exp: 12, mesos: 14,
    items: [{ name: 'Squishy Liquid', quantity: 2 }], at: 2000 });
  s = reducer(s, { type: 'loot/value', id: meso.id, name: 'Squishy Liquid', unitValue: 5, itemId: 4000004 });
  const e = s.widgets[exp.id], m = s.widgets[meso.id];
  assert.ok(e?.type === 'exp' && m?.type === 'meso');
  assert.equal(e.data.gained, 12);
  assert.equal(e.data.source, 'notifications');
  assert.equal(m.data.pickups, 14);
  assert.equal(m.data.loot.reduce((sum, l) => sum + l.quantity * (l.unitValue ?? 0), m.data.pickups), 24);
  assert.deepEqual(m.data.samples, []);
  assert.deepEqual(normalizeState(s).widgets[meso.id]?.data, m.data);
});

test('capture configuration and preprocessing respect region bounds and 30 FPS ceiling', () => {
  const config = defaultState().settings.gameTracking;
  assert.equal(isGameTrackingConfig(config), true);
  assert.equal(isGameTrackingConfig({ ...config, priceOverrides: null }), false);
  assert.equal(isGameTrackingConfig({ ...config, priceOverrides: { potion: -1 } }), false);
  assert.equal(isGameTrackingConfig({ ...config, apiVersion: 62 }), false);
  assert.equal(MAX_CAPTURE_FPS, 30);
  assert.equal(CAPTURE_INTERVAL_MS, 1000 / 30);
  assert.equal(validRegion({ x: 0.8, y: 0.7, width: 0.2, height: 0.1 }), true);
  assert.equal(validRegion({ x: 0.8, y: 0.7, width: 0.3, height: 0.1 }), false);
  const pixels = new Uint8ClampedArray([220, 220, 220, 255, 0, 150, 0, 255, 20, 20, 20, 255]);
  isolateNotificationText(pixels);
  assert.deepEqual([...pixels], [0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
});
