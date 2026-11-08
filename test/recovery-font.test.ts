import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { test } from 'node:test';
import { BitmapFont, EXP_FONT, binarizeStatus, statusGrid } from '../src/shared/status-font.ts';
import { parseVitalText } from '../src/shared/recovery.ts';

const samples: { width: number; height: number; data: string; text: string }[] =
  JSON.parse(readFileSync(new URL('./fixtures/recovery-fields.json', import.meta.url), 'utf8'));

test('real HP/MP status-bar pixels read complete current/max values, including the sampled slash', () => {
  const reader = new BitmapFont(EXP_FONT);
  assert.equal(samples.length, 2);
  for (const sample of samples) {
    const grid = statusGrid(binarizeStatus(inflateSync(Buffer.from(sample.data, 'base64')), sample.width, sample.height, false),
      sample.width, sample.height);
    assert.ok(grid);
    assert.equal(reader.read(grid), sample.text);
    assert.ok(parseVitalText(sample.text));
  }
  assert.equal(samples[0]!.text, '[1995/1995]');
  assert.equal(samples[1]!.text, '[496/795]');
});
