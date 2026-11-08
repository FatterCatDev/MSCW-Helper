import { NPC_RECOVERY_ITEMS } from './npc-recovery-prices.ts';
import type { PotionTracker, RecoveryPotionSelection, Vitals } from './types.ts';

export function usedRecoveryItems(uses: Record<string, number>, prices: PotionTracker[]): { itemId: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const [key, count] of Object.entries(uses)) {
    if (!Number.isSafeInteger(count) || count <= 0) continue;
    const saved = prices.find(p => p.id === key);
    const match = /^recovery-(\d+)$/.exec(key);
    const id = saved?.itemId ?? (match ? Number(match[1]) : null);
    if (id !== null && NPC_RECOVERY_ITEMS[id]) counts.set(id, (counts.get(id) ?? 0) + count);
  }
  return [...counts].map(([itemId, count]) => ({ itemId, count }));
}

export function selectedRecoveryItems(selection: RecoveryPotionSelection): number[] {
  return [...new Set([selection.hp, selection.mp].filter((id): id is number => id !== null))];
}

export function normalizeRecoverySelection(value: unknown, legacy?: unknown): RecoveryPotionSelection {
  const slots = value && typeof value === 'object' ? value as Partial<RecoveryPotionSelection> : null;
  const old: unknown[] = Array.isArray(legacy) ? legacy : [];
  const valid = (id: unknown, kind: 'hp' | 'mp'): id is number =>
    typeof id === 'number' && Number.isSafeInteger(id) && (NPC_RECOVERY_ITEMS[id]?.[kind] ?? 0) > 0;
  return {
    hp: slots ? valid(slots.hp, 'hp') ? slots.hp : null : old.find((id): id is number => valid(id, 'hp')) ?? null,
    mp: slots ? valid(slots.mp, 'mp') ? slots.mp : null : old.find((id): id is number => valid(id, 'mp')) ?? null
  };
}

export function validVitals(v: Vitals): boolean {
  return Object.values(v).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 999999) &&
    v.maxHp > 0 && v.maxMp > 0 && v.hp <= v.maxHp && v.mp <= v.maxMp;
}

export function parseVitalText(text: string): { current: number; max: number } | null {
  const clean = text.replace(/[\s,]/g, '');
  if (clean.startsWith('[') !== clean.endsWith(']')) return null;
  const match = /^\[?(\d{1,6})\/(\d{1,6})\]?$/.exec(clean);
  if (!match) return null;
  const current = Number(match[1]), max = Number(match[2]);
  return max > 0 && current <= max ? { current, max } : null;
}

export function classifyRecovery(previous: Vitals, current: Vitals, selectedPotionIds: readonly number[]): {
  hp: number; mp: number; candidates: number[]; itemId: number | null; reason: string;
}[] {
  if (selectedPotionIds.length === 0 || !validVitals(previous) || !validVitals(current) || previous.maxHp !== current.maxHp ||
      previous.maxMp !== current.maxMp || previous.hp === 0 || current.hp === 0) return [];
  const selectedItems = Object.values(NPC_RECOVERY_ITEMS).filter(item => selectedPotionIds.includes(item.itemId));
  const hp = selectedItems.some(item => item.hp > 0) ? Math.max(0, current.hp - previous.hp) : 0;
  const mp = selectedItems.some(item => item.mp > 0) ? Math.max(0, current.mp - previous.mp) : 0;
  const withinRange = (observed: number, base: number): boolean =>
    base > 0 && observed > 10 && observed * 2 >= base && observed * 2 <= base * 3;
  const hpItems = selectedItems.filter(item => withinRange(hp, item.hp));
  const mpItems = selectedItems.filter(item => withinRange(mp, item.mp));
  const both = hpItems.filter(item => mpItems.some(other => other.itemId === item.itemId));
  const event = (eventHp: number, eventMp: number, candidates: number[]) => ({
    hp: eventHp, mp: eventMp, candidates, itemId: candidates.length === 1 ? candidates[0]! : null,
    reason: candidates.length === 1 ? 'Recovery is within 50% of the selected item (estimated use).' :
      'Several selected items match within 50%.'
  });
  if (both.length) {
    const candidates = [...new Set([...hpItems, ...mpItems].map(item => item.itemId))];
    return [event(hp, mp, candidates)];
  }
  const result = [];
  if (hpItems.length) result.push(event(hp, 0, hpItems.map(item => item.itemId)));
  if (mpItems.length) result.push(event(0, mp, mpItems.map(item => item.itemId)));
  return result;
}
