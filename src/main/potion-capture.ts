import type { NativeImage } from 'electron';
import type { Action } from '../shared/reducer.ts';
import type { PotionStatus, PotionTracker, Vitals } from '../shared/types.ts';
import { BitmapFont, EXP_FONT, binarizeStatus, statusGrid } from '../shared/status-font.ts';
import { classifyRecovery, parseVitalText } from '../shared/recovery.ts';
import { NPC_RECOVERY_ITEMS } from '../shared/npc-recovery-prices.ts';

const reader = new BitmapFont(EXP_FONT);
interface ActiveRecovery { id: string; prices: PotionTracker[]; selectedPotionIds: number[]; previous: Vitals | null; lastAt: number }

export function readVitals(frame: NativeImage): Vitals | null {
  if (frame.isEmpty() || frame.getSize().width !== 1200 || frame.getSize().height < 640) return null;
  const fields = [320, 480].map(top => {
    const crop = frame.crop({ x: 0, y: top, width: 1200, height: 160 });
    const grid = statusGrid(binarizeStatus(crop.toBitmap(), 1200, 160, false), 1200, 160);
    const text = grid && reader.read(grid);
    return text ? parseVitalText(text) : null;
  });
  const hp = fields[0], mp = fields[1];
  return hp && mp ? { hp: hp.current, maxHp: hp.max, mp: mp.current, maxMp: mp.max } : null;
}

export class PotionCapture {
  private active = new Map<string, ActiveRecovery>();
  private dispatch: (action: Action) => void;
  private status: (id: string, status: PotionStatus) => void;
  constructor(dispatch: (action: Action) => void, status: (id: string, status: PotionStatus) => void) {
    this.dispatch = dispatch; this.status = status;
  }

  start(id: string, prices: PotionTracker[], selectedPotionIds: number[]): void {
    if (this.active.has(id)) throw new Error('Stop this recovery tracker first.');
    if (!selectedPotionIds.length || selectedPotionIds.some(id => !Number.isSafeInteger(id) || !NPC_RECOVERY_ITEMS[id])) {
      throw new Error('Choose the potions you use in the Tracker widget. Blank selection disables potion tracking.');
    }
    this.active.set(id, { id, prices: structuredClone(prices),
      selectedPotionIds: [...selectedPotionIds], previous: null, lastAt: 0 });
    this.status(id, { running: true, counts: {}, message: 'Waiting for readable HP and MP numbers; first read sets a baseline.' });
  }

  frame(frame: NativeImage, at = Date.now()): void {
    if (!this.active.size) return;
    const current = readVitals(frame);
    for (const active of this.active.values()) this.processFrame(active, current, at);
  }

  private processFrame(active: ActiveRecovery, current: Vitals | null, at: number): void {
    if (!current) {
      if (active.previous) this.status(active.id, { running: true, counts: {}, message: 'HP/MP unreadable; baseline cleared, no charge.' });
      active.previous = null; active.lastAt = at;
      return;
    }
    const previous = at - active.lastAt > 1000 ? null : active.previous;
    active.previous = current; active.lastAt = at;
    const results = previous ? classifyRecovery(previous, current, active.selectedPotionIds) : [];
    if (results.length) {
      for (const result of results) {
      const local = result.itemId === null ? null : NPC_RECOVERY_ITEMS[result.itemId];
      const override = active.prices.find(p => p.itemId === result.itemId)?.unitCost;
      const cost = result.itemId === null ? null : override ?? local?.npcBuyPrice ?? null;
      this.dispatch({ type: 'recovery/event', id: active.id, event: {
        id: globalThis.crypto.randomUUID(), at, ...result, cost
      } });
      this.status(active.id, { running: true, counts: {}, vitals: current,
        message: `HP +${result.hp}, MP +${result.mp}: ${local?.name ?? 'unidentified recovery'}. ${result.reason} ${cost === null ? 'Not charged.' : `${cost} mesos estimated.`}` });
      }
    } else if (!previous || previous.hp !== current.hp || previous.mp !== current.mp) {
      this.status(active.id, { running: true, counts: {}, vitals: current, message: previous ?
        'Reading HP/MP; only increases within 50% of a selected item count. Max-stat changes and death establish a new baseline.' : 'HP/MP baseline established.' });
    }
  }

  stop(id: string, message = 'Recovery tracking stopped. Restart establishes a new baseline.'): void {
    if (!this.active.delete(id)) return;
    this.status(id, { running: false, counts: {}, message });
  }

  stopAll(message: string): void {
    for (const id of this.active.keys()) this.stop(id, message);
  }

  dispose(): void { this.stopAll('MSCW Helper is shutting down.'); }
}
