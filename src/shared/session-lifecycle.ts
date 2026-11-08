import type { PersistedState } from './types.ts';
import { reducer } from './reducer.ts';

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

export function resetSessionPotions(state: PersistedState): PersistedState {
  let next = state;
  for (const widget of Object.values(state.widgets)) {
    if (widget.type === 'meso') next = reducer(next, { type: 'potion/reset', id: widget.id });
  }
  return next;
}
