import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BitmapFont, binarizeStatus, EXP_FONT, FONT_ROWS, LEVEL_FONT, statusGrid } from '../src/shared/status-font.ts';
import { parseExpFields } from '../src/shared/game-tracking.ts';

/** Draw text from font templates (white digits, green brackets/% as in game) on a background, nearest-neighbour scaled. */
function render(text: string, font: Readonly<Record<string, string>>, scale: number, background: [number, number, number]) {
  const rows = Array.from({ length: FONT_ROWS }, () => '');
  const green = new Set<number>();
  for (const char of text) {
    const parts = char === ' ' ? Array<string>(FONT_ROWS).fill('...') : font[char]!.split('/');
    if ('[]%'.includes(char)) for (let c = 0; c < parts[0]!.length; c++) green.add(rows[0]!.length + c);
    parts.forEach((r, i) => { rows[i] += r + '.'; });
  }
  const pad = 3 * scale, width = rows[0]!.length * scale + pad * 2, height = FONT_ROWS * scale + pad * 2;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor((y - pad) / scale), col = Math.floor((x - pad) / scale);
    const ink = row >= 0 && row < FONT_ROWS && col >= 0 && rows[row]![col] === '#';
    pixels.set(ink ? (green.has(col) ? [153, 204, 51, 255] : [255, 255, 255, 255]) : [...background, 255], (y * width + x) * 4);
  }
  return { pixels, width, height };
}

function read(font: BitmapFont, image: ReturnType<typeof render>, level = false): string | null {
  const grid = statusGrid(binarizeStatus(image.pixels, image.width, image.height, level), image.width, image.height);
  return grid && font.read(grid);
}

test('reads the actual EXP bitmap font exactly at any integer UI scale', () => {
  const exp = new BitmapFont(EXP_FONT);
  for (const scale of [1, 2, 3]) {
    for (const text of ['188,972[58.28%]', '183,449[56.58%]', '1,234,567[0.06%]', '3,690[10.00%]']) {
      assert.equal(read(exp, render(text, EXP_FONT, scale, [40, 40, 48])), text);
      assert.equal(read(exp, render(text, EXP_FONT, scale, [90, 90, 90])), text);
    }
  }
  assert.deepEqual(parseExpFields('41', read(exp, render('188,972[58.28%]', EXP_FONT, 2, [40, 40, 48]))!),
    { level: 41, current: 188972, percent: 58.28 });
});

test('frames containing anything other than exact glyphs are rejected instead of guessed', () => {
  const exp = new BitmapFont(EXP_FONT);
  const image = render('188,972[58.28%]', EXP_FONT, 2, [90, 90, 90]);
  // Fill the hollow centre of the first 8 (font row 1, column 5).
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) image.pixels.set([250, 250, 250, 255], ((6 + 1 * 2 + y) * image.width + 6 + 5 * 2 + x) * 4);
  assert.equal(read(exp, image), null);
  const blank = render('', EXP_FONT, 2, [90, 90, 90]);
  assert.equal(statusGrid(binarizeStatus(blank.pixels, blank.width, blank.height, false), blank.width, blank.height), null);
});

test('a gauge border line inside the EXP region does not merge the glyphs', () => {
  const exp = new BitmapFont(EXP_FONT);
  const image = render('188,972[58.28%]', EXP_FONT, 2, [40, 40, 48]);
  for (let x = 0; x < image.width; x++) image.pixels.set([200, 200, 200, 255], ((image.height - 2) * image.width + x) * 4);
  assert.equal(read(exp, image), '188,972[58.28%]');
});

test('level reader ignores orange tiles, knows 41 and learns new digits only from consistent labels', () => {
  const level = new BitmapFont(LEVEL_FONT);
  assert.equal(read(level, render('4 1', LEVEL_FONT, 2, [255, 150, 30]), true), '41');
  const two = '.####./##..##/....##/...##./..##../.##.../######';
  const font = { ...LEVEL_FONT, '2': two };
  const image = render('4 2', font, 2, [255, 150, 30]);
  const grid = statusGrid(binarizeStatus(image.pixels, image.width, image.height, true), image.width, image.height)!;
  assert.equal(level.read(grid), null);
  assert.equal(level.label(grid, '92', false), false, 'known 4 cannot be relabelled');
  assert.equal(level.label(grid, '41', false), false, 'known 1 shape does not match the new digit');
  assert.equal(level.label(grid, '42', true), true);
  assert.equal(level.read(grid), '42');
  assert.equal(read(level, render('2 4 1', font, 2, [255, 150, 30]), true), '241');
});
