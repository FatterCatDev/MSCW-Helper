import type { PotionTracker } from './types.ts';

export function isPotionTracker(value: unknown): value is PotionTracker {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<PotionTracker>;
  const r = p.region;
  return typeof p.id === 'string' && p.id.length > 0 &&
    Number.isSafeInteger(p.itemId) && p.itemId! > 0 && typeof p.name === 'string' && p.name.length > 0 &&
    Number.isSafeInteger(p.unitCost) && p.unitCost! > 0 &&
    typeof p.sourceId === 'string' && /^window:\d+:\d+$/.test(p.sourceId) &&
    !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
    r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 &&
    r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001;
}

export interface CountState {
  baseline: number | null;
  candidate: number | null;
  repeats: number;
}

export const emptyCountState = (): CountState => ({ baseline: null, candidate: null, repeats: 0 });

export function observeCount(state: CountState, text: string, confidence: number): {
  state: CountState; used: boolean; message: string; count: number | null;
} {
  const clean = text.trim();
  if (!Number.isFinite(confidence) || confidence < 85 || !/^\d{1,4}$/.test(clean)) {
    return { state: emptyCountState(), used: false, count: null, message: 'Unreadable count; waiting for a new baseline.' };
  }
  const count = Number(clean);
  const repeats = state.candidate === count ? state.repeats + 1 : 1;
  const next = { ...state, candidate: count, repeats };
  if (repeats < 2) return { state: next, used: false, count: state.baseline, message: 'Confirming count...' };
  if (state.baseline === null) {
    return { state: { ...next, baseline: count }, used: false, count, message: 'Baseline ready.' };
  }
  const drop = state.baseline - count;
  return {
    state: { ...next, baseline: count }, used: drop === 1, count,
    message: drop > 1 ? 'Ambiguous decrease; not charged. New baseline set.' :
      drop < 0 ? 'Restock detected; new baseline set.' : 'Reading counts.'
  };
}
