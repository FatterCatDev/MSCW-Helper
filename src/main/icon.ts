import { nativeImage, type NativeImage } from 'electron';

/** Draws the app icon (orange maple-style rounded square with a white "M") so no binary asset is needed. */
export function createAppIcon(size = 32): NativeImage {
  const buf = Buffer.alloc(size * size * 4);
  const r = size * 0.22;
  const glyph = [
    '1.....1',
    '11...11',
    '1.1.1.1',
    '1..1..1',
    '1.....1',
    '1.....1',
    '1.....1'
  ];
  const cell = Math.floor((size * 0.6) / glyph.length);
  const gx0 = Math.floor((size - cell * 7) / 2);
  const gy0 = Math.floor((size - cell * glyph.length) / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = Math.min(Math.max(x + 0.5, r), size - r);
      const cy = Math.min(Math.max(y + 0.5, r), size - r);
      const inside = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
      if (!inside) continue;
      const gx = Math.floor((x - gx0) / cell);
      const gy = Math.floor((y - gy0) / cell);
      const white = x >= gx0 && y >= gy0 && glyph[gy]?.[gx] === '1';
      // BGRA
      buf[i] = white ? 255 : 0x1f;
      buf[i + 1] = white ? 255 : 0x8c;
      buf[i + 2] = white ? 255 : 0xf5;
      buf[i + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}
