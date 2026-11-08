/**
 * Exact matcher for the status-bar pixel fonts. The HUD is drawn with fixed bitmap glyphs
 * (7 font pixels tall) and scaled with nearest-neighbour sampling, so the scale is recovered
 * from the glyph height and each glyph compares cell-for-cell against built-in templates.
 */
export const FONT_ROWS = 7;

/** EXP/HP/MP gauge digits, sampled from MapleStory Classic World at "Ideal Ratio" UI size. */
export const EXP_FONT: Readonly<Record<string, string>> = {
  '0': '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  '1': '.#/##/.#/.#/.#/.#/.#',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '.###./#...#/....#/..##./....#/#...#/.###.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../#..../.###./....#/#...#/.###.',
  '6': '.###./#...#/#..../####./#...#/#...#/.###.',
  '7': '#####/....#/....#/....#/...#./..#../..#..',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/#...#/.###.',
  ',': '../../../../../.#/#.',
  '.': '././././././#',
  '[': '##/#./#./#./#./#./##',
  ']': '##/.#/.#/.#/.#/.#/##',
  '/': '.../..#/..#/.#./.#./#../#..',
  '%': '.#....#/#.#..#./.#..#../...#.../..#..#./.#..#.#/#....#.'
};

/** Orange level tiles. Digits not seen yet are learned when a level-up is observed. */
export const LEVEL_FONT: Readonly<Record<string, string>> = {
  '1': '.##/###/.##/.##/.##/.##/.##',
  '4': '...###./..####./.##.##./##..##./#######/....##./....##.'
};

export interface FontGrid { width: number; cells: Uint8Array }
interface Template { char: string; width: number; cells: Uint8Array }

/** Text is near-white: EXP digits use the brightest channel, level digits the darkest (rejects orange tiles). */
export function binarizeStatus(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, level: boolean): Uint8Array {
  if (rgba.length < width * height * 4) throw new Error('Invalid status field bitmap.');
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const r = rgba[i * 4]!, g = rgba[i * 4 + 1]!, b = rgba[i * 4 + 2]!;
    out[i] = Number((level ? Math.min(r, g, b) : Math.max(r, g, b)) >= 160);
  }
  return out;
}

/** Resample a binarized field to font pixels, or null if no glyph-height text is present. */
export function statusGrid(source: Uint8Array, width: number, height: number): FontGrid | null {
  if (source.length !== width * height || width <= 0 || height <= 0) throw new Error('Invalid status field bitmap.');
  // Gauge borders are long horizontal lines; no glyph row is wider than 5 font pixels (<= 30 px up to 6x scale).
  const ink = source.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width;) {
      if (!ink[y * width + x]) { x++; continue; }
      let end = x;
      while (end < width && ink[y * width + end]) end++;
      if (end - x > 32) ink.fill(0, y * width + x, y * width + end);
      x = end;
    }
  }
  const heights = new Map<number, number>();
  const tops = new Map<number, number>();
  let start = -1;
  for (let x = 0; x <= width; x++) {
    let has = false;
    if (x < width) for (let y = 0; y < height; y++) if (ink[y * width + x]) { has = true; break; }
    if (has && start < 0) start = x;
    if (!has && start >= 0) {
      let top = height, bottom = -1;
      for (let y = 0; y < height; y++) for (let c = start; c < x; c++) if (ink[y * width + c]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
      const h = bottom - top + 1;
      if (h >= FONT_ROWS) { heights.set(h, (heights.get(h) ?? 0) + 1); if (!tops.has(h)) tops.set(h, top); }
      start = -1;
    }
  }
  // Digits, brackets and % are all full height; the most common tall height is the text height.
  let textHeight = 0, count = 0;
  for (const [h, n] of heights) if (n > count || (n === count && h > textHeight)) { textHeight = h; count = n; }
  if (!textHeight) return null;
  const scale = textHeight / FONT_ROWS, top = tops.get(textHeight)!;
  let left = width, right = -1;
  for (let y = top; y < top + textHeight; y++) for (let x = 0; x < width; x++) {
    if (ink[y * width + x]) { left = Math.min(left, x); right = Math.max(right, x); }
  }
  const cols = Math.round((right - left + 1) / scale);
  if (cols <= 0) return null;
  const cells = new Uint8Array(cols * FONT_ROWS);
  for (let row = 0; row < FONT_ROWS; row++) for (let col = 0; col < cols; col++) {
    const x = Math.min(width - 1, left + Math.floor((col + 0.5) * scale));
    const y = Math.min(height - 1, top + Math.floor((row + 0.5) * scale));
    cells[row * cols + col] = ink[y * width + x]!;
  }
  return { width: cols, cells };
}

function parseTemplate(char: string, pattern: string): Template {
  const rows = pattern.split('/');
  const width = rows[0]!.length;
  if (rows.length !== FONT_ROWS || rows.some(r => r.length !== width || !/^[.#]+$/.test(r))) throw new Error(`Invalid font template ${char}.`);
  return { char, width, cells: Uint8Array.from(rows.join(''), c => Number(c === '#')) };
}

function blankColumn(grid: FontGrid, col: number): boolean {
  for (let row = 0; row < FONT_ROWS; row++) if (grid.cells[row * grid.width + col]) return false;
  return true;
}

function equalAt(grid: FontGrid, col: number, t: Template): boolean {
  if (col + t.width > grid.width || (col + t.width < grid.width && !blankColumn(grid, col + t.width))) return false;
  for (let row = 0; row < FONT_ROWS; row++) for (let c = 0; c < t.width; c++) {
    if (grid.cells[row * grid.width + col + c] !== t.cells[row * t.width + c]) return false;
  }
  return true;
}

/** Ink runs separated by blank font columns. */
export function gridSegments(grid: FontGrid): FontGrid[] {
  const out: FontGrid[] = [];
  let start = -1;
  for (let col = 0; col <= grid.width; col++) {
    const ink = col < grid.width && !blankColumn(grid, col);
    if (ink && start < 0) start = col;
    if (!ink && start >= 0) {
      const width = col - start, cells = new Uint8Array(width * FONT_ROWS);
      for (let row = 0; row < FONT_ROWS; row++) for (let c = 0; c < width; c++) cells[row * width + c] = grid.cells[row * grid.width + start + c]!;
      out.push({ width, cells });
      start = -1;
    }
  }
  return out;
}

export class BitmapFont {
  private templates: Template[];

  constructor(templates: Readonly<Record<string, string>>) {
    this.templates = Object.entries(templates).map(([char, pattern]) => parseTemplate(char, pattern));
  }

  /** Exact left-to-right read; null if any ink is not a known glyph. */
  read(grid: FontGrid): string | null {
    let text = '';
    for (let col = 0; col < grid.width;) {
      if (blankColumn(grid, col)) { col++; continue; }
      const matches = this.templates.filter(t => equalAt(grid, col, t));
      if (matches.length !== 1) return null;
      text += matches[0]!.char;
      col += matches[0]!.width;
    }
    return text || null;
  }

  /**
   * Whether `text` is consistent with the field: one glyph per blank-separated segment, and each
   * already-known segment is that character. Unknown segments are learned when `learn` is set.
   */
  label(grid: FontGrid, text: string, learn: boolean): boolean {
    const segments = gridSegments(grid);
    if (segments.length !== text.length) return false;
    const unknown: Template[] = [];
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!, char = text[i]!;
      const known = this.templates.filter(t => t.width === segment.width && equalAt(segment, 0, t));
      if (known.length) { if (known.some(t => t.char !== char)) return false; continue; }
      if (this.templates.some(t => t.char === char)) return false;
      if (unknown.some(t => t.char !== char && t.width === segment.width && equalAt(segment, 0, t))) return false;
      unknown.push({ char, width: segment.width, cells: segment.cells });
    }
    if (learn) for (const t of unknown) if (!this.templates.some(e => e.char === t.char)) this.templates.push(t);
    return true;
  }
}
