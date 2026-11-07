import type { BossEntry, RateSample } from './types.ts';

export const HOUR = 3_600_000;

export function retainRateWindow(samples: RateSample[], now: number): RateSample[] {
  const firstInside = samples.findIndex(s => s.t >= now - 10 * 60_000);
  return samples.slice(Math.max(0, (firstInside < 0 ? samples.length : firstInside) - 1));
}

/** Interpolates sparse readings at the window boundary; holds the last reading during idle time. */
export function rollingPerMinute(samples: readonly RateSample[], now: number, windowMs: number): number | null {
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last || samples.length < 2 || now <= first.t || now < last.t || windowMs <= 0) return null;
  const start = Math.max(first.t, now - windowMs);
  let value = last.value;
  for (let i = 1; i < samples.length; i++) {
    const left = samples[i - 1]!;
    const right = samples[i]!;
    if (start <= right.t) {
      value = left.value + (right.value - left.value) * (start - left.t) / (right.t - left.t);
      break;
    }
  }
  return (last.value - value) * 60_000 / (now - start);
}

/** Units gained per hour between the first and last sample, or null if not enough data. */
export function ratePerHour(samples: readonly RateSample[]): number | null {
  if (samples.length < 2) return null;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const dt = last.t - first.t;
  if (dt <= 0) return null;
  return ((last.value - first.value) / dt) * HOUR;
}

/** Milliseconds until `remaining` units are gained at `perHour`, or null if not progressing. */
export function etaMs(remaining: number, perHour: number | null): number | null {
  if (perHour === null || perHour <= 0 || remaining < 0) return null;
  return (remaining / perHour) * HOUR;
}

export function formatDuration(ms: number, alwaysHours = false): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 || alwaysHours ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Compact number: 1234 -> "1,234", 1_250_000 -> "1.25M", 3_400_000_000 -> "3.4B". */
export function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${+(n / 1e6).toFixed(2)}M`;
  return Math.round(n).toLocaleString('en-US');
}

/** Parses "1,234", "1.5m", "2b", "300k" into a number. Returns null if invalid. */
export function parseAmount(input: string): number | null {
  const m = /^\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kmb])?\s*$/i.exec(input);
  if (!m) return null;
  const base = Number(m[1]!.replaceAll(',', ''));
  if (!Number.isFinite(base)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  return base * mult;
}

/** Parses "200", "3:20", "1:02:03", "90s", "5m", "1.5h" into seconds. Returns null if invalid or zero. */
export function parseDurationSec(input: string): number | null {
  const s = input.trim().toLowerCase();
  let sec: number;
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) {
    sec = s.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
  } else {
    const m = /^(\d+(?:\.\d+)?)\s*([smh]?)$/.exec(s);
    if (!m) return null;
    sec = Number(m[1]) * ({ s: 1, m: 60, h: 3600 }[m[2] as 's' | 'm' | 'h'] ?? 1);
  }
  sec = Math.round(sec);
  return sec > 0 && sec <= 7 * 86400 ? sec : null;
}

/** Key identifying the current "game day", which rolls over at `resetHourUtc`. */
export function dailyKey(now: number, resetHourUtc: number): string {
  return new Date(now - resetHourUtc * HOUR).toISOString().slice(0, 10);
}

export function isValidClock(s: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.trim());
}

/** Next occurrence (epoch ms, local time) of any "HH:MM" time in `times`, or null. */
export function nextScheduled(times: readonly string[], now: number): number | null {
  let best: number | null = null;
  for (const t of times) {
    if (!isValidClock(t)) continue;
    const [h, m] = t.trim().split(':').map(Number) as [number, number];
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    if (best === null || d.getTime() < best) best = d.getTime();
  }
  return best;
}

/** Next relevant time for a boss entry: respawn countdown target or next scheduled time. */
export function bossNextAt(entry: BossEntry, markedNextAt: number | undefined, now: number): number | null {
  if (entry.kind === 'schedule') return nextScheduled(entry.times, now);
  return markedNextAt ?? null;
}
