import type { CaptureRegion, GameTrackingConfig } from './types.ts';

export const MAX_CAPTURE_FPS = 30;
export const CAPTURE_INTERVAL_MS = 1000 / MAX_CAPTURE_FPS;
export const DEFAULT_GAIN_REGION: CaptureRegion = { x: 0.84, y: 0.68, width: 0.16, height: 0.13 };

export function isolateNotificationText(pixels: Uint8ClampedArray): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
    const text = Math.max(r, g, b) - Math.min(r, g, b) < 60 && Math.min(r, g, b) > 140;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = text ? 0 : 255;
    pixels[i + 3] = 255;
  }
}

export type GainEvent =
  | { kind: 'exp' | 'meso'; amount: number; key: string }
  | { kind: 'item'; name: string; quantity: number; key: string };

export function parseGainLine(line: string): GainEvent | null {
  const text = line.trim().replace(/\s+/g, ' ');
  let match = /^Y[oc]u received EXP\s*\(\s*\+\s*([\d,]+)\s*\)[.!]?$/i.exec(text);
  const exp = !!match;
  match ??= /^Y[oc]u have gained mesos\s*\(\s*\+\s*([\d,]+)\s*\)[.!]?$/i.exec(text);
  if (match) {
    const amount = Number(match[1]!.replaceAll(',', ''));
    if (!Number.isSafeInteger(amount) || amount <= 0) return null;
    const kind = exp ? 'exp' : 'meso';
    return { kind, amount, key: `${kind}:${amount}` };
  }

  match = /^(.+?)\s+[x#]\s*(\d+)\s+earned[.!]?\s*\([^)]*\)[.!]?$/i.exec(text);
  if (!match) return null;
  const name = match[1]!.trim();
  const quantity = Number(match[2]);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || name.length > 100) return null;
  return { kind: 'item', name, quantity, key: `item:${name.toLowerCase()}:${quantity}` };
}

export interface OcrGainLine {
  text: string;
  confidence: number;
  words: { text: string; confidence: number; symbols: { text: string; confidence: number }[] }[];
}

export function parseConfidentGainLine(line: OcrGainLine): GainEvent | null {
  const event = parseGainLine(line.text);
  if (!event || line.confidence < 70) return null;
  const numeric = line.words.find(word => event.kind === 'item' ? /^[x#]\d+$/i.test(word.text) : /\+\s*[\d,]+/.test(word.text));
  if (!numeric) return null;
  if (event.kind !== 'item' && numeric.confidence < 85) return null;
  const digits = numeric.symbols.filter(s => /^\d$/.test(s.text));
  if (!digits.length || digits.some(s => s.confidence < 90)) return null;
  return event;
}

export function itemNameDistance(a: string, b: string): number {
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1,
      row[j - 1]! + Number(a[i - 1] !== b[j - 1]));
    row = next;
  }
  return row[b.length]!;
}

/** Notification stacks scroll oldest-to-newest. Preserve multiplicity while removing overlapping history. */
export function newGainEvents(previous: readonly GainEvent[], current: readonly GainEvent[]): GainEvent[] {
  const lengths = Array.from({ length: previous.length + 1 }, () => Array<number>(current.length + 1).fill(0));
  for (let i = previous.length - 1; i >= 0; i--) {
    for (let j = current.length - 1; j >= 0; j--) {
      lengths[i]![j] = previous[i]!.key === current[j]!.key ? 1 + lengths[i + 1]![j + 1]! :
        Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  let i = 0, j = 0, lastMatch = -1;
  while (i < previous.length && j < current.length) {
    if (previous[i]!.key === current[j]!.key) { lastMatch = j; i++; j++; }
    else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i++;
    else j++;
  }
  return current.slice(lastMatch + 1);
}

export function validRegion(value: unknown): value is CaptureRegion {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<CaptureRegion>;
  return [r.x, r.y, r.width, r.height].every(n => typeof n === 'number' && Number.isFinite(n)) &&
    r.x! >= 0 && r.y! >= 0 && r.width! > 0 && r.height! > 0 &&
    r.x! + r.width! <= 1.000001 && r.y! + r.height! <= 1.000001;
}

export function isGameTrackingConfig(value: unknown): value is GameTrackingConfig {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<GameTrackingConfig>;
  return [c.sourceId, c.windowName, c.expWidgetId, c.mesoWidgetId, c.apiVersion].every(v => typeof v === 'string') &&
    validRegion(c.region) && !!c.priceOverrides && typeof c.priceOverrides === 'object' &&
    !Array.isArray(c.priceOverrides) && Object.values(c.priceOverrides).every(p => Number.isSafeInteger(p) && p >= 0);
}
