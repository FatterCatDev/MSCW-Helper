import type { ReactNode } from 'react';
import type { AppState, PotionStatus, WidgetDef, WidgetType } from '../../../shared/types.ts';
import type { Dispatch } from '../common/state.ts';
import { ImageWidget, NotesWidget } from './MiscWidgets.tsx';
import { ExpWidget, MesoWidget } from './RateWidgets.tsx';
import { BossWidget, SessionWidget, TimersWidget } from './TimeWidgets.tsx';
import type { WidgetProps } from './common.tsx';
import { trainingElapsed } from '../../../shared/training-time.ts';

type Registry = { [K in WidgetType]: (props: WidgetProps<K>) => ReactNode };

const registry: Registry = {
  training: () => null,
  exp: ExpWidget,
  meso: MesoWidget,
  session: SessionWidget,
  timers: TimersWidget,
  boss: BossWidget,
  notes: NotesWidget,
  image: ImageWidget
};

export function WidgetContent(props: { w: WidgetDef; dispatch: Dispatch; now: number; potionStatus?: PotionStatus | undefined; state: AppState }): ReactNode {
  if (props.w.type === 'training') {
    const exp = props.state.widgets[props.w.config.expId], meso = props.state.widgets[props.w.config.mesoId];
    if (exp?.type !== 'exp' || meso?.type !== 'meso') return <p role="alert">Training Tracker data is unavailable.</p>;
    return <div className="training-tracker">
      <ExpWidget w={exp} dispatch={props.dispatch} now={props.now} embedded trainingMs={trainingElapsed(props.w.data, props.now)}
        mesoSamples={meso.data.samples} />
      <MesoWidget w={meso} dispatch={props.dispatch} now={props.now}
        potionStatus={props.state.runtime.potionTracking[meso.id]} embedded controlId={props.w.id} />
      <button className="ghost" onClick={() => props.dispatch({ type: 'training/reset', id: props.w.id })}>Reset tracker</button>
    </div>;
  }
  const Component = registry[props.w.type] as (p: WidgetProps<WidgetType>) => ReactNode;
  return <Component w={props.w} dispatch={props.dispatch} now={props.now} potionStatus={props.potionStatus} />;
}
