import type { PersistedState, WidgetDataMap } from './types.ts';

export function trainingElapsed(data: WidgetDataMap['training'], now: number): number {
  return data.elapsedMs + (data.runningSince === null ? 0 : Math.max(0, now - data.runningSince));
}

export function reconcileTrainingTime(state: PersistedState, runningExpId: string | null, at: number): PersistedState {
  let widgets = state.widgets;
  for (const widget of Object.values(state.widgets)) {
    if (widget.type !== 'training') continue;
    const shouldRun = widget.config.expId === runningExpId;
    if (shouldRun === (widget.data.runningSince !== null)) continue;
    if (widgets === state.widgets) widgets = { ...widgets };
    widgets[widget.id] = { ...widget, data: shouldRun ?
      { ...widget.data, runningSince: at } :
      { elapsedMs: trainingElapsed(widget.data, at), runningSince: null } };
  }
  return widgets === state.widgets ? state : { ...state, widgets };
}
