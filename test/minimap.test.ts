import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findCompactMinimap, findMinimapPanel, isShopHeader, minimapTextRegions } from '../src/shared/minimap.ts';
import { lookupMap } from '../src/main/map-lookup.ts';

test('finds an expanded minimap and rejects a hidden or empty panel', () => {
  const width = 500, height = 200, pixels = new Uint8ClampedArray(width * height * 4);
  const paint = (x: number, y: number, w: number, h: number, color: number[]) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
      pixels.set(color, (yy * width + xx) * 4);
  };
  assert.equal(findMinimapPanel(pixels, width, height), null);
  paint(12, 30, 354, 82, [153, 187, 204, 255]);
  paint(12, 34, 84, 74, [0, 0, 0, 255]);
  assert.equal(findMinimapPanel(pixels, width, height), null);
  paint(106, 49, 40, 4, [255, 255, 255, 255]);
  paint(106, 78, 60, 4, [255, 255, 255, 255]);
  const panel = findMinimapPanel(pixels, width, height);
  assert.ok(panel);
  const [street, name] = minimapTextRegions(panel);
  assert.ok(street.x > panel.x && name.y > street.y);
  assert.equal(findMinimapPanel(new Uint8ClampedArray(10), width, height), null);
});

test('finds compact header at different positions and scales without treating orange areas as minimaps', () => {
  for (const scale of [1, 2]) {
    const width = 900, height = 400, pixels = new Uint8ClampedArray(width * height * 4);
    const paint = (x: number, y: number, w: number, h: number, color: number[]) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
        pixels.set(color, (yy * width + xx) * 4);
    };
    const x = 25, y = 12;
    paint(x, y, 305 * scale, 18 * scale, [225, 225, 225, 255]);
    paint(x + 235 * scale, y + 2 * scale, 12 * scale, 12 * scale, [30, 30, 30, 255]);
    paint(x + 265 * scale, y + 3 * scale, 36 * scale, 10 * scale, [210, 120, 25, 255]);
    const header = findCompactMinimap(pixels, width, height);
    assert.ok(header);
    assert.ok(header.x >= x && header.x < x + 7 * scale);
    assert.ok(header.width >= 200 * scale && header.x + header.width < x + 265 * scale);
    pixels.fill(0);
    paint(x + 265 * scale, y + 3 * scale, 36 * scale, 10 * scale, [210, 120, 25, 255]);
    assert.equal(findCompactMinimap(pixels, width, height), null);
  }
  assert.equal(findCompactMinimap(new Uint8ClampedArray(10), 50, 50), null);
});

test('only an explicit shop or store name in the compact title is safe', () => {
  for (const text of ['Victoria Road Ellinla Department Store', 'Victoria Road Elllinla Weapon Store',
    'Victoria Road : Ellinia Potion Shop']) assert.equal(isShopHeader(text), true, text);
  for (const text of ['', 'mini map', 'Victoria Road : Ellinia', 'Shop', 'Victoria Road Store Entrance',
    'Victoria Road Storehouse', 'Victoria Road Store CI', 'Victoria Road Department Stor'])
    assert.equal(isShopHeader(text), false, text);
});

test('map lookup verifies all matching details and handles ambiguous or unavailable maps', async () => {
  const search = [
    { id: 1, name: 'Ellinia', streetName: 'Victoria Road' },
    { id: 2, name: 'Ellinia', streetName: 'Victoria Road' },
    { id: 3, name: 'Ellinia', streetName: 'Other' }
  ];
  const request = (second: unknown, status = 200): typeof fetch => async input => {
    const url = String(input);
    if (url.includes('?')) return Response.json(search);
    if (url.endsWith('/1')) return Response.json({ id: 1, isTown: true, mobs: [] });
    if (url.endsWith('/2')) return status === 404 ? new Response(null, { status }) : Response.json(second);
    throw new Error(`Unexpected request ${url}`);
  };
  const safe = await lookupMap('Ellinia', 'Victoria Road', '62', request({ id: 2, isTown: true, mobs: [] }));
  assert.equal(safe.state, 'safe');
  const conflicting = await lookupMap('Ellinia', 'Victoria Road', '62', request({ id: 2, isTown: false, mobs: [1] }));
  assert.equal(conflicting.state, 'unknown');
  assert.equal((await lookupMap('Ellinia', 'Victoria Road', '62', request(null, 404))).state, 'safe');
  assert.equal((await lookupMap('Ellinia', 'Other Road', '62', request(null))).state, 'unknown');
  await assert.rejects(lookupMap('Ellinia', 'Victoria Road', '62', request({ id: 99, isTown: true, mobs: [] })),
    /incomplete or do not match/);
});

test('map lookup does not classify fields without monsters as safe', async () => {
  const request: typeof fetch = async input => String(input).includes('?') ?
    Response.json([{ id: 10, name: 'Field', streetName: 'Road' }]) :
    Response.json({ id: 10, isTown: false, mobs: [] });
  assert.equal((await lookupMap('Field', 'Road', '62', request)).state, 'unknown');
  const withMonsters: typeof fetch = async input => String(input).includes('?') ?
    Response.json([{ id: 10, name: 'Field', streetName: 'Road' }]) :
    Response.json({ id: 10, isTown: false, mobs: [1] });
  assert.equal((await lookupMap('Field', 'Road', '62', withMonsters)).state, 'unsafe');
  await assert.rejects(lookupMap('Field', 'Road', '../62', withMonsters), /Invalid/);
});
