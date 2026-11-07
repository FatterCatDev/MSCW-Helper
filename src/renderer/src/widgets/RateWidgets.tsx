import type { ReactNode } from 'react';
import { etaMs, formatDuration, formatNumber, parseAmount, ratePerHour } from '../../../shared/time.ts';
import { EntryInput, Stat, type WidgetProps } from './common.tsx';

export function ExpWidget({ w, dispatch, now }: WidgetProps<'exp'>): ReactNode {
  const { samples, levelOffset, levelUps } = w.data;
  const last = samples.at(-1);
  const first = samples[0];
  const current = last ? last.value - levelOffset : null;
  const rate = ratePerHour(samples);
  const eta = current === null ? null : etaMs(100 - current, rate);
  const elapsed = first ? now - first.t : 0;

  return (
    <div className="widget-body">
      <div className="big">{current === null ? '—' : `${current.toFixed(2)}%`}</div>
      <div className="stats">
        <Stat label="EXP/hr" value={rate === null ? '—' : `${rate.toFixed(2)}%`} />
        <Stat label="To level" value={eta === null ? '—' : formatDuration(eta, true)} />
        <Stat label="Gained" value={first && last ? `${(last.value - first.value).toFixed(2)}%` : '—'} />
        <Stat label="Tracking" value={first ? formatDuration(elapsed, true) : '—'} />
        {levelUps > 0 && <Stat label="Level ups" value={levelUps} className="good" />}
      </div>
      <EntryInput
        placeholder="Current EXP % (e.g. 42.5)"
        onSubmit={(v) => {
          const n = parseAmount(v.replace('%', ''));
          if (n === null || n > 100) return false;
          dispatch({ type: 'rate/sample', id: w.id, value: n, at: Date.now() });
          return true;
        }}
      />
      <div className="row">
        <span className="hint">{samples.length} samples</span>
        <button className="ghost" onClick={() => dispatch({ type: 'rate/reset', id: w.id })}>
          Reset
        </button>
      </div>
    </div>
  );
}

export function MesoWidget({ w, dispatch, now }: WidgetProps<'meso'>): ReactNode {
  const { samples } = w.data;
  const first = samples[0];
  const last = samples.at(-1);
  const rate = ratePerHour(samples);
  const gained = first && last ? last.value - first.value : 0;
  const goal = w.config.goal;
  const eta = goal > 0 && last ? etaMs(goal - last.value, rate) : null;

  return (
    <div className="widget-body">
      <div className="big">{last ? formatNumber(last.value) : '—'}</div>
      <div className="stats">
        <Stat label="Mesos/hr" value={rate === null ? '—' : formatNumber(rate)} className={rate !== null && rate < 0 ? 'bad' : ''} />
        <Stat label="Gained" value={first ? formatNumber(gained) : '—'} className={gained < 0 ? 'bad' : ''} />
        <Stat label="Tracking" value={first ? formatDuration(now - first.t, true) : '—'} />
        {goal > 0 && <Stat label="Goal ETA" value={last && last.value >= goal ? 'Reached!' : eta === null ? '—' : formatDuration(eta, true)} />}
      </div>
      {goal > 0 && last && (
        <div className="bar">
          <div className="bar-fill" style={{ width: `${Math.min(100, (last.value / goal) * 100)}%` }} />
        </div>
      )}
      <EntryInput
        placeholder="Current mesos (e.g. 1.25m)"
        onSubmit={(v) => {
          const n = parseAmount(v);
          if (n === null) return false;
          dispatch({ type: 'rate/sample', id: w.id, value: n, at: Date.now() });
          return true;
        }}
      />
      <div className="row">
        <span className="hint">{samples.length} samples</span>
        <button className="ghost" onClick={() => dispatch({ type: 'rate/reset', id: w.id })}>
          Reset
        </button>
      </div>
    </div>
  );
}
