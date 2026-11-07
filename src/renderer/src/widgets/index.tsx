import type { ReactNode } from 'react';
import type { WidgetDef, WidgetType } from '../../../shared/types.ts';
import type { Dispatch } from '../common/state.ts';
import { ImageWidget, KillsWidget, NotesWidget } from './MiscWidgets.tsx';
import { ExpWidget, MesoWidget } from './RateWidgets.tsx';
import { BossWidget, SessionWidget, TimersWidget } from './TimeWidgets.tsx';
import type { WidgetProps } from './common.tsx';

type Registry = { [K in WidgetType]: (props: WidgetProps<K>) => ReactNode };

const registry: Registry = {
  exp: ExpWidget,
  meso: MesoWidget,
  session: SessionWidget,
  timers: TimersWidget,
  boss: BossWidget,
  notes: NotesWidget,
  kills: KillsWidget,
  image: ImageWidget
};

export function WidgetContent(props: { w: WidgetDef; dispatch: Dispatch; now: number }): ReactNode {
  const Component = registry[props.w.type] as (p: WidgetProps<WidgetType>) => ReactNode;
  return <Component w={props.w} dispatch={props.dispatch} now={props.now} />;
}
