import type { ReactNode } from 'react';
import { bossNextAt, formatDuration } from '../../../shared/time.ts';
import type { WidgetProps } from './common.tsx';

export function SessionWidget({ w, dispatch, now }: WidgetProps<'session'>): ReactNode {
  const d = w.data;
  const elapsed = d.accumulatedMs + (d.running ? Math.max(0, now - d.startedAt) : 0);
  return (
    <div className="widget-body center">
      <div className={`big mono ${d.running ? '' : 'dim'}`}>{formatDuration(elapsed, true)}</div>
      <div className="row">
        <button onClick={() => dispatch({ type: 'session/toggle', id: w.id, at: Date.now() })}>{d.running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}</button>
        <button className="ghost" onClick={() => dispatch({ type: 'session/reset', id: w.id })}>
          Reset
        </button>
      </div>
    </div>
  );
}

export function TimersWidget({ w, dispatch, now }: WidgetProps<'timers'>): ReactNode {
  const { timers, warnSec } = w.config;
  if (timers.length === 0) return <div className="widget-body hint">No timers yet. Add some in the control panel.</div>;
  return (
    <div className="widget-body list">
      {timers.map((t) => {
        const endsAt = w.data.endsAt[t.id];
        const remaining = endsAt === undefined ? 0 : endsAt - now;
        const active = remaining > 0;
        const pct = active ? Math.min(100, (remaining / (t.durationSec * 1000)) * 100) : 0;
        const warn = active && remaining <= warnSec * 1000;
        return (
          <button
            key={t.id}
            className={`timer-row ${active ? 'active' : 'ready'} ${warn ? 'warn' : ''}`}
            title="Click to start/restart, right-click to stop"
            onClick={() => dispatch({ type: 'timer/start', id: w.id, timerId: t.id, at: Date.now() })}
            onContextMenu={(e) => {
              e.preventDefault();
              dispatch({ type: 'timer/stop', id: w.id, timerId: t.id });
            }}
          >
            <span className="timer-fill" style={{ width: `${pct}%`, background: t.color }} />
            <span className="timer-name">
              {t.name}
              {t.hotkey && <kbd>{t.hotkey}</kbd>}
            </span>
            <span className="timer-time mono">{active ? formatDuration(remaining + 999) : endsAt !== undefined ? 'DONE' : 'Ready'}</span>
          </button>
        );
      })}
    </div>
  );
}

export function BossWidget({ w, dispatch, now }: WidgetProps<'boss'>): ReactNode {
  const { entries, warnMin } = w.config;
  if (entries.length === 0) return <div className="widget-body hint">No bosses/events yet. Add some in the control panel.</div>;
  const rows = entries
    .map((e) => ({ e, at: bossNextAt(e, w.data.nextAt[e.id], now) }))
    .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  return (
    <div className="widget-body list">
      {rows.map(({ e, at }) => {
        const remaining = at === null ? null : at - now;
        const up = remaining !== null && remaining <= 0;
        const warn = remaining !== null && !up && remaining <= warnMin * 60_000;
        const clock = at === null ? '' : new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return (
          <div key={e.id} className={`boss-row ${warn ? 'warn' : ''} ${up ? 'up' : ''}`}>
            <div className="boss-info">
              <span className="timer-name">{e.name}</span>
              <span className="hint">{at === null ? (e.kind === 'respawn' ? 'Not tracked' : 'No times set') : up ? `Up since ${clock}` : `at ${clock}`}</span>
            </div>
            <span className="timer-time mono">{remaining === null ? '—' : up ? 'UP' : formatDuration(remaining + 999)}</span>
            {e.kind === 'respawn' && (
              <button
                className="small"
                title="Mark killed now (right-click to clear)"
                onClick={() => dispatch({ type: 'boss/mark', id: w.id, entryId: e.id, at: Date.now() })}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  dispatch({ type: 'boss/clear', id: w.id, entryId: e.id });
                }}
              >
                Killed
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
