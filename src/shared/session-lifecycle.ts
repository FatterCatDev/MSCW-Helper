import type { PersistedState } from './types.ts';

export function resetSessionTimers(state: PersistedState, startedAt: number | null): PersistedState {
  let widgets = state.widgets;
  for (const widget of Object.values(state.widgets)) {
    if (widget.type !== 'session') continue;
    if (widgets === state.widgets) widgets = { ...widgets };
    widgets[widget.id] = { ...widget, data: {
      running: startedAt !== null, startedAt: startedAt ?? 0, accumulatedMs: 0
    } };
  }
  return widgets === state.widgets ? state : { ...state, widgets };
}
