import { selectedRecoveryItems } from '../shared/recovery.ts';
import type { PersistedState, PotionTracker } from '../shared/types.ts';

interface RecoveryCapture {
  start(id: string, prices: PotionTracker[], selectedPotionIds: number[]): void;
  stop(id: string, message?: string): void;
}

export class RecoveryLifecycle {
  private active = new Map<string, string>();
  private failed = new Map<string, string>();
  constructor(privateCapture: RecoveryCapture, reportError: (id: string, error: unknown) => void) {
    this.capture = privateCapture; this.reportError = reportError;
  }
  private capture: RecoveryCapture;
  private reportError: (id: string, error: unknown) => void;

  reconcile(state: PersistedState, gameRunning: boolean, resetId?: string): void {
    const desired = new Map<string, { signature: string; prices: PotionTracker[]; selected: number[] }>();
    if (gameRunning) for (const widget of Object.values(state.widgets)) {
      if (widget.type !== 'meso') continue;
      const { potions, selectedPotions } = widget.config;
      const selected = selectedRecoveryItems(selectedPotions);
      if (!selected.length) continue;
      desired.set(widget.id, { signature: JSON.stringify([potions, selected]), prices: potions, selected });
    }
    for (const [id, signature] of this.active) {
      const wanted = desired.get(id);
      if (!wanted || signature !== wanted.signature || resetId === id) {
        this.active.delete(id);
        this.capture.stop(id, gameRunning ? 'Recovery setup changed; establishing a new baseline.' :
          'Game capture stopped; recovery tracking stopped.');
      }
    }
    for (const id of this.failed.keys()) if (!desired.has(id) || resetId === id) this.failed.delete(id);
    for (const [id, wanted] of desired) {
      if (this.active.has(id) || this.failed.get(id) === wanted.signature) continue;
      try {
        this.capture.start(id, wanted.prices, wanted.selected);
        this.active.set(id, wanted.signature);
        this.failed.delete(id);
      } catch (error) {
        this.failed.set(id, wanted.signature);
        this.reportError(id, error);
      }
    }
  }
}
