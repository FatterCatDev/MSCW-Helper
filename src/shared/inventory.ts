const TITLE = [
  '#.#####.#####.#...#....#.#...#.#...#.#####.#...#.#####..###..####..#...#.',
  '#...#...#.....##.##....#.##..#.#...#.#.....##..#...#...#...#.#...#..#.#..',
  '#...#...####..#.#.#....#.#.#.#.#...#.####..#.#.#...#...#...#.####....#...',
  '#...#...#.....#...#....#.#..##..#.#..#.....#..##...#...#...#.#...#...#...',
  '#...#...#####.#...#....#.#...#...#...#####.#...#...#....###..#...#...#...'
];

export const INVENTORY_DIGITS: Readonly<Record<string, string>> = {
  '0': '.###./#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  '1': '.#./##./.#./.#./.#./.#./.#./###',
  '2': '.###./#...#/....#/...#./..#../.#.../#..../#####',
  '3': '.###./#...#/....#/..##./....#/....#/#...#/.###.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#./...#.',
  '5': '#####/#..../#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/#...#/.###.',
  '7': '#####/....#/...#./...#./..#../..#../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/#...#/.###.',
  '9': '.###./#...#/#...#/#...#/.####/....#/...#./.##..',
  ',': '../../../../.././.#/.#/.#/#.'
};
const GLYPHS = Object.entries(INVENTORY_DIGITS).map(([char, pattern]) => ({ char, rows: pattern.split('/') }));

interface Panel { x: number; y: number; scale: number }
export interface InventoryReading { state: 'missing' | 'unreadable' | 'read'; value?: number }

function brightness(pixels: Uint8ClampedArray, width: number, x: number, y: number): number {
  const i = (y * width + x) * 4;
  return (pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) / 3;
}

function findInventory(pixels: Uint8ClampedArray, width: number, height: number): Panel | null {
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const white = x < width && brightness(pixels, width, x, y) >= 240;
      if (white && start < 0) start = x;
      if (!white && start >= 0) {
        const length = x - start;
        if (length >= 125 && length <= 480) {
          const scale = length / 159.5;
          if (y + 267 * scale < height && start + 165 * scale < width) {
            for (const adjust of [0, .006, -.006, .012, -.012]) for (const offset of [3, 3.5, 4, 4.5, 5]) for (const xOffset of [3.5, 4, 4.5, 5, 5.5]) {
              const s = scale + adjust;
              let error = 0;
              for (let row = 0; row < 5; row++) for (let col = 0; col < 72; col++) {
                const px = Math.floor(start + (xOffset + col + 0.5) * s);
                const py = Math.floor(y + (offset + row + 0.5) * s);
                const v = brightness(pixels, width, px, py);
                error += TITLE[row]![col] === '#' ? v : 255 - v;
              }
              if (error / 360 < 26) return { x: start, y, scale: s };
            }
          }
        }
        start = -1;
      }
    }
  }
  return null;
}

/** Search the inventory title and conservatively read its right-aligned wallet field. */
export function readInventory(pixels: Uint8ClampedArray, width: number, height: number): InventoryReading {
  if (width <= 0 || height <= 0 || pixels.length !== width * height * 4) throw new Error('Invalid inventory frame.');
  const panel = findInventory(pixels, width, height);
  if (!panel) return { state: 'missing' };
  const { x, y, scale } = panel;
  const left = Math.round(x + 22 * scale), right = Math.round(x + 160 * scale);
  const expectedTop = Math.round(y + 262.5 * scale);
  if (left < 0 || right >= width || expectedTop < 0 || expectedTop + 14 * scale >= height) return { state: 'unreadable' };
  // The field's blank top edge must be white. A covered or differently sized panel is not a reading.
  let top = -1;
  for (let py = Math.max(0, Math.floor(expectedTop - 3 * scale)); py <= expectedTop + 2 * scale; py++) {
    let white = 0;
    for (let px = left; px < right; px++) if (brightness(pixels, width, px, py) >= 225) white++;
    if (white >= (right - left) * .98) { top = py; break; }
  }
  if (top < 0) return { state: 'unreadable' };

  const textTop = Math.round(top + 3 * scale);
  const bottom = Math.min(height - 1, Math.ceil(textTop + 10 * scale) - 1);
  const inkColumns: number[] = [];
  for (let px = left; px < right; px++) {
    let ink = false;
    for (let py = textTop; py <= bottom; py++) if (brightness(pixels, width, px, py) < 190) ink = true;
    if (ink) inkColumns.push(px);
  }
  if (!inkColumns.length) return { state: 'unreadable' };
  const first = inkColumns[0]!, last = inkColumns.at(-1)!;
  if (right - last > 10 * scale || last - first > 90 * scale) return { state: 'unreadable' };

  type Candidate = { text: string; cost: number; end: number };
  const scores = new Map<string, number>();
  let candidates: Candidate[] = [{ text: '', cost: 0, end: first }];
  for (let step = 0; step < 15 && candidates.length; step++) {
    const next: Candidate[] = [];
    for (const candidate of candidates) {
      let start = candidate.end;
      while (start <= last && !inkColumns.includes(start)) start++;
      if (start > last) { next.push(candidate); continue; }
      if (start - candidate.end > 4 * scale) continue;
      for (const { char, rows } of GLYPHS) {
        const cols = rows[0]!.length;
        if (char === ',' && (!candidate.text || candidate.text.includes(',') && candidate.text.length < 4)) continue;
        if (char === '0' || char === '8') {
          const center = brightness(pixels, width, Math.floor(start + 2.5 * scale), Math.floor(textTop + 3.5 * scale));
          if (char === '0' && center < 150 || char === '8' && center > 210) continue;
        }
        const key = `${char}:${start}`;
        let best = scores.get(key);
        if (best === undefined) {
          best = Infinity;
          for (const dx of [-.6, -.5, -.3, 0, .3, .5, .6]) for (const dy of [-.5, -.25, 0, .25, .5]) for (const factor of [.92, .94, .96, .98, 1, 1.02, 1.04]) {
            let error = 0;
            for (let row = 0; row < rows.length; row++) for (let col = 0; col < cols; col++) {
              const px = Math.floor(start + dx + (col + .5) * scale * factor);
              const py = Math.floor(textTop + dy + (row + .5) * scale * factor);
              const v = brightness(pixels, width, px, py);
              error += rows[row]![col] === '#' ? v : 255 - v;
            }
            best = Math.min(best, error / (rows.length * cols));
          }
          scores.set(key, best);
        }
        if (best > 45) continue;
        for (const end of new Set([Math.floor(start + cols * scale), Math.ceil(start + cols * scale)])) {
          if (end > start) next.push({ text: candidate.text + char, cost: candidate.cost + best, end });
        }
      }
    }
    const complete = next.filter(c => c.end > last && /^(?:0|[1-9]\d{0,2})(?:,\d{3})*$/.test(c.text));
    if (complete.length) {
      complete.sort((a, b) => a.cost - b.cost);
      const best = complete[0]!;
      if (complete.some(c => c.text !== best.text && c.cost - best.cost < 6)) return { state: 'unreadable' };
      const value = Number(best.text.replaceAll(',', ''));
      return Number.isSafeInteger(value) ? { state: 'read', value } : { state: 'unreadable' };
    }
    candidates = next.filter(c => c.end <= last).sort((a, b) => a.cost - b.cost).slice(0, 100);
  }
  return { state: 'unreadable' };
}
