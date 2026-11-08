import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INVENTORY_DIGITS, readInventory } from '../src/shared/inventory.ts';
import { clearWallets, InventoryTracking, walletTick } from '../src/shared/inventory-tracking.ts';
import { defaultState } from '../src/shared/defaults.ts';
import { reducer } from '../src/shared/reducer.ts';
import { expRateHistory, rollingPerMinute } from '../src/shared/time.ts';

const title = [
  '#.#####.#####.#...#....#.#...#.#...#.#####.#...#.#####..###..####..#...#.',
  '#...#...#.....##.##....#.##..#.#...#.#.....##..#...#...#...#.#...#..#.#..',
  '#...#...####..#.#.#....#.#.#.#.#...#.####..#.#.#...#...#...#.####....#...',
  '#...#...#.....#...#....#.#..##..#.#..#.....#..##...#...#...#.#...#...#...',
  '#...#...#####.#...#....#.#...#...#...#####.#...#...#....###..#...#...#...'
];

function inventory(value: string, originX = 0, originY = 0, scale = 2) {
  const width = originX + 420 * scale / 2 + 5, height = originY + 581 * scale / 2 + 5;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const fill = (x: number, y: number, w: number, h: number, color: number): void => {
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      pixels.set([color, color, color, 255], (py * width + px) * 4);
    }
  };
  const x = originX + 5 * scale + 1, y = originY + 7 * scale;
  fill(x, y, 159.5 * scale, 12 * scale, 255);
  title.forEach((row, r) => [...row].forEach((cell, c) => {
    if (cell === '#') fill(x + (5 + c) * scale, y + (4 + r) * scale, scale, scale, 0);
  }));
  const walletTop = y + 262 * scale;
  fill(x + 20 * scale, walletTop, 143 * scale, 14 * scale, 255);
  const glyphs = [...value].map(c => INVENTORY_DIGITS[c]!.split('/'));
  const total = glyphs.reduce((sum, rows) => sum + rows[0]!.length + 1, -1);
  let column = x + 159 * scale - total * scale;
  for (const rows of glyphs) {
    rows.forEach((row, r) => [...row].forEach((cell, c) => {
      if (cell === '#') fill(column + c * scale, walletTop + (3 + r) * scale, scale, scale, 0);
    }));
    column += (rows[0]!.length + 1) * scale;
  }
  return { pixels, width, height };
}

test('reads exact inventory glyphs and finds a moved panel', () => {
  for (const value of ['547,758', '547,301', '547,291', '547,468', '123,456,789', '0']) {
    const image = inventory(value, 73, 21);
    assert.deepEqual(readInventory(image.pixels, image.width, image.height), {
      state: 'read', value: Number(value.replaceAll(',', ''))
    }, value);
  }
});

test('closed, damaged and invalid frames do not produce a balance', () => {
  const image = inventory('547,381');
  for (let y = 543; y < 557; y++) for (let x = 70; x < 82; x++) {
    image.pixels.set([0, 0, 0, 255], (y * image.width + x) * 4);
  }
  assert.deepEqual(readInventory(image.pixels, image.width, image.height), { state: 'unreadable' });
  image.pixels.fill(0);
  assert.deepEqual(readInventory(image.pixels, image.width, image.height), { state: 'missing' });
  assert.throws(() => readInventory(new Uint8ClampedArray(1), 10, 10), /Invalid inventory frame/);
});

test('inventory readings require fresh confirmations and reset across disappearance or reset', () => {
  const tracker = new InventoryTracking();
  const read = (value: number) => ({ state: 'read' as const, value });
  assert.equal(tracker.frame(read(10), 1), null);
  assert.equal(tracker.frame(read(10), 1), null);
  assert.equal(tracker.frame(read(10), 2), 10);
  assert.equal(tracker.frame({ state: 'missing' }, 3), null);
  assert.equal(tracker.frame(read(20), 4), null);
  assert.equal(tracker.frame({ state: 'unreadable' }, 5), null);
  assert.equal(tracker.frame(read(20), 6), null);
  tracker.reset(8);
  assert.equal(tracker.frame(read(20), 7), null);
  assert.equal(tracker.frame(read(20), 9), null);
  assert.equal(tracker.frame(read(20), 10), 20);
});

test('wallet session baseline survives rate-window pruning and startup clearing preserves recovery data', () => {
  let state = defaultState();
  const meso = Object.values(state.widgets).find(w => w.type === 'meso')!;
  for (let i = 0; i < 1200; i++) state = reducer(state, { type: 'rate/sample', id: meso.id, value: 1000 + i, at: i * 1000 });
  const result = state.widgets[meso.id]!;
  assert.equal(result.type, 'meso');
  if (result.type !== 'meso') throw new Error('Expected meso widget');
  assert.equal(result.data.samples.length, 663);
  assert.equal(result.data.samples[0]?.value, 1000);
  assert.equal(result.data.samples.at(-1)?.value, 2199);
  const history = expRateHistory(result.data.samples, 1_199_000);
  assert.equal(history.length, 601);
  assert.equal(history[0]?.value, 60);
  assert.equal(history.at(-1)?.value, 60);
  result.data.potionCosts = 55;
  const cleared = clearWallets(state).widgets[meso.id]!;
  assert.equal(cleared.type, 'meso');
  if (cleared.type !== 'meso') throw new Error('Expected meso widget');
  assert.deepEqual(cleared.data.samples, []);
  assert.equal(cleared.data.potionCosts, 55);
});

test('one-second wallet ticks retain the last confirmed value until the next reading or reset', () => {
  let state = defaultState();
  const training = Object.values(state.widgets).find(w => w.type === 'training');
  assert.ok(training?.type === 'training');
  state.settings.gameTracking.mesoWidgetId = training.config.mesoId;
  assert.equal(walletTick(state, true, 1000), null);
  state = reducer(state, { type: 'rate/sample', id: training.config.mesoId, value: 500, at: 1000 });
  assert.equal(walletTick(state, false, 2000), null);
  assert.equal(walletTick(state, true, 1000), null);
  for (let at = 2000; at <= 60_000; at += 1000) {
    const action = walletTick(state, true, at);
    assert.ok(action);
    state = reducer(state, action);
  }
  state = reducer(state, { type: 'rate/sample', id: training.config.mesoId, value: 560, at: 61_000 });
  const updated = state.widgets[training.config.mesoId];
  assert.ok(updated?.type === 'meso');
  assert.equal(rollingPerMinute(updated.data.samples, 61_000, 60_000), 60);
  for (let at = 62_000; at <= 121_000; at += 1000) state = reducer(state, walletTick(state, true, at)!);
  const meso = state.widgets[training.config.mesoId];
  assert.ok(meso?.type === 'meso');
  assert.equal(meso.data.samples.length, 121);
  assert.equal(rollingPerMinute(meso.data.samples, 121_000, 60_000), 0);
  const history = expRateHistory(meso.data.samples, 121_000);
  assert.equal(history.find(point => point.t === 60_000)?.value, 0);
  assert.equal(history.find(point => point.t === 61_000)?.value, 60);
  assert.equal(history.at(-1)?.value, 0);
  state = reducer(state, { type: 'training/reset', id: training.id });
  assert.equal(walletTick(state, true, 122_000), null);
});
