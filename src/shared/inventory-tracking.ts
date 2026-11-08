import type { InventoryReading } from './inventory.ts';
import type { Action } from './reducer.ts';
import type { PersistedState } from './types.ts';

export class InventoryTracking {
  private candidate: number | null = null;
  private count = 0;
  private notBefore = 0;
  private lastFrame = 0;

  reset(at: number): void {
    this.candidate = null;
    this.count = 0;
    this.notBefore = at;
    this.lastFrame = at;
  }

  frame(reading: InventoryReading, capturedAt: number): number | null {
    if (!Number.isFinite(capturedAt) || capturedAt <= this.notBefore || capturedAt <= this.lastFrame) return null;
    this.lastFrame = capturedAt;
    if (reading.state !== 'read' || !Number.isSafeInteger(reading.value) || reading.value! < 0) {
      this.candidate = null;
      this.count = 0;
      return null;
    }
    if (this.candidate === reading.value) this.count++;
    else { this.candidate = reading.value!; this.count = 1; }
    return this.count >= 2 ? this.candidate : null;
  }
}

/** Record the last confirmed balance even when the inventory is closed. */
export function walletTick(state: PersistedState, running: boolean, at: number): Action | null {
  const widget = state.widgets[state.settings.gameTracking.mesoWidgetId];
  if (!running || widget?.type !== 'meso') return null;
  const last = widget.data.samples.at(-1);
  if (!last || !Number.isSafeInteger(at) || at <= last.t) return null;
  return { type: 'rate/sample', id: widget.id, value: last.value, at };
}

export function clearWallets<T extends { widgets: PersistedState['widgets'] }>(state: T): T {
  let widgets = state.widgets;
  for (const widget of Object.values(state.widgets)) {
    if (widget.type !== 'meso' || !widget.data.samples.length) continue;
    if (widgets === state.widgets) widgets = { ...widgets };
    widgets[widget.id] = { ...widget, data: { ...widget.data, samples: [] } };
  }
  return widgets === state.widgets ? state : { ...state, widgets };
}
