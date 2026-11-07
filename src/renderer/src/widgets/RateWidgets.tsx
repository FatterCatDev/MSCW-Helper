import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { etaMs, expRateHistory, formatDuration, formatNumber, parseAmount, ratePerHour, rollingPerMinute } from '../../../shared/time.ts';
import { EntryInput, Stat, type WidgetProps } from './common.tsx';
import { useNow } from '../common/state.ts';

export function ExpWidget({ w, dispatch }: WidgetProps<'exp'>): ReactNode {
  const { samples, current, required, gained, startedAt, migrated } = w.data;
  const tick = useNow(1000);
  const now = Math.max(tick, samples.at(-1)?.t ?? tick);
  const [levelInput, setLevel] = useState(String(w.data.level));
  const [currentInput, setCurrent] = useState('');
  const [requiredInput, setRequired] = useState(required ? String(required) : '');
  const [error, setError] = useState('');
  useEffect(() => {
    setLevel(String(w.data.level));
    setRequired(w.data.required ? String(w.data.required) : '');
    setCurrent(w.data.current === null ? '' : String(w.data.current));
  }, [w.data.level, w.data.required, w.data.current]);
  const rate = rollingPerMinute(samples, now, 60_000);
  const average = rollingPerMinute(samples, now, 600_000);
  const eta = current === null ? null : etaMs(required - current, average === null ? null : average * 60);
  const graphSecond = Math.floor(now / 1000);
  const history = useMemo(() => expRateHistory(samples, graphSecond * 1000), [samples, graphSecond]);
  const values = history.flatMap(point => point.value === null ? [] : [point.value]);
  const low = Math.min(0, ...values);
  const high = Math.max(1, ...values);
  const graphY = (value: number): number => 14 + (high - value) / (high - low) * 78;
  let connected = false;
  const path = history.map((point, index) => {
    if (point.value === null) { connected = false; return ''; }
    const command = connected ? 'L' : 'M';
    connected = true;
    return `${command}${42 + index / 600 * 350},${graphY(point.value)}`;
  }).join(' ');

  return (
    <div className="widget-body">
      <div className="big">{w.data.source === 'notifications' ? formatNumber(gained) : current === null ? '—' : formatNumber(current)} <span className="hint">EXP</span></div>
      <div className="stats">
        <Stat label="EXP/min" value={rate === null ? '—' : formatNumber(rate)} />
        <Stat label="10-min avg/min" value={average === null ? '—' : formatNumber(average)} />
        <Stat label={w.data.source === 'notifications' ? 'Session EXP gained' : 'Session EXP (net)'} value={startedAt === null ? '—' : gained.toLocaleString('en-US')} />
        <Stat label={w.data.source === 'status-bar' ? 'To level (est.)' : 'To level'} value={eta === null ? '—' : formatDuration(eta, true)} />
        <Stat label="Tracking" value={startedAt !== null ? formatDuration(now - startedAt, true) : '—'} />
      </div>
      <figure className="exp-rate-graph">
        <figcaption>EXP/min - last 10 minutes</figcaption>
        <svg viewBox="0 0 400 116" role="img" aria-label="EXP per minute over the last ten minutes, sampled every second">
          <title>Trailing one-minute EXP rate, one point per second. Negative values indicate net EXP loss.</title>
          {[14, 53, 92].map(y => <line key={y} x1="42" x2="392" y1={y} y2={y} className="graph-grid" />)}
          <line x1="42" x2="392" y1={graphY(0)} y2={graphY(0)} className="graph-zero" />
          <text x="38" y="18" textAnchor="end">{formatNumber(high)}</text>
          <text x="38" y="96" textAnchor="end">{formatNumber(low)}</text>
          <text x="42" y="111">-10m</text>
          <text x="217" y="111" textAnchor="middle">-5m</text>
          <text x="392" y="111" textAnchor="end">Now</text>
          <path d={path} className="graph-line" />
          {!values.length && <text x="217" y="55" textAnchor="middle">Waiting for EXP readings</text>}
        </svg>
      </figure>
      {migrated && <p className="hint">Old percentage history was cleared; enter a points baseline.</p>}
      {w.data.source === 'status-bar' ? <p className="hint">Level {w.data.level} · {w.data.percent?.toFixed(2) ?? '—'}% · Requirement ~{formatNumber(required)} EXP.
        Automatic status-bar readings; session includes EXP losses. ETA and level-up rollover use an estimated requirement.</p> :
      w.data.source === 'notifications' ? <p className="hint">Automatic gain notifications. Losses and hidden notifications are not included.</p> : <form className="exp-entry" onSubmit={event => {
        event.preventDefault();
        const value = parseAmount(currentInput);
        const needed = parseAmount(requiredInput);
        const level = Number(levelInput);
        if (value === null || needed === null || ![value, needed, level].every(Number.isSafeInteger) ||
            value < 0 || needed <= value || level < 1 ||
            (current !== null && (level < w.data.level || level > w.data.level + 1))) {
          setError('Enter whole EXP points below the level requirement. Record each level up, or reset after skipped levels.');
          return;
        }
        dispatch({ type: 'exp/sample', id: w.id, value, required: needed, level, at: Date.now() });
        setError('');
      }}>
        <label className="hint">Level<input aria-label="Level" placeholder="Level" value={levelInput} onChange={e => setLevel(e.target.value)} /></label>
        <label className="hint">Current EXP<input aria-label="Current EXP points" placeholder="Current EXP" value={currentInput} onChange={e => setCurrent(e.target.value)} /></label>
        <label className="hint">EXP to level<input aria-label="EXP needed for level" placeholder="EXP to level" value={requiredInput} onChange={e => setRequired(e.target.value)} /></label>
        <button type="submit">Record EXP</button>
      </form>}
      {error && <p role="alert" className="hint">{error}</p>}
      <div className="row">
        <span className="hint">{startedAt !== null && now - startedAt < 600_000 ? '10-min average warming up' : w.data.source === 'status-bar' ? 'Status-bar readings' : w.data.source === 'notifications' ? 'Notification readings' : 'Manual readings'}</span>
        <button className="ghost" onClick={() => dispatch({ type: 'rate/reset', id: w.id })}>
          Reset
        </button>
      </div>
    </div>
  );
}

export function MesoWidget({ w, dispatch, now, potionStatus }: WidgetProps<'meso'>): ReactNode {
  const { samples } = w.data;
  const first = samples[0];
  const last = samples.at(-1);
  const automatic = w.data.trackingStartedAt !== null;
  const lootValue = w.data.loot.reduce((sum, item) => sum + item.quantity * (item.unitValue ?? 0), 0);
  const gained = automatic ? w.data.pickups + lootValue : first && last ? last.value - first.value : 0;
  const elapsed = automatic ? now - w.data.trackingStartedAt! : first ? now - first.t : 0;
  const rate = automatic ? elapsed > 0 ? gained * 3600000 / elapsed : null : ratePerHour(samples);
  const goal = w.config.goal;
  const eta = goal > 0 && last ? etaMs(goal - last.value, rate) : null;

  return (
    <div className="widget-body">
      <div className="big">{automatic ? formatNumber(gained) : last ? formatNumber(last.value) : '—'}</div>
      <div className="stats">
        <Stat label="Mesos/hr" value={rate === null ? '—' : formatNumber(rate)} className={rate !== null && rate < 0 ? 'bad' : ''} />
        <Stat label="Gained (incl. loot)" value={automatic || first ? formatNumber(gained) : '—'} className={gained < 0 ? 'bad' : ''} />
        <Stat label="Tracking" value={automatic || first ? formatDuration(elapsed, true) : '—'} />
        {automatic && <><Stat label="Meso pickups" value={formatNumber(w.data.pickups)} /><Stat label="Loot value (est.)" value={formatNumber(lootValue)} /></>}
        <Stat label="Potion cost (est.)" value={formatNumber(w.data.potionCosts)} className="bad" />
        <Stat label="Farming net (est.)" value={automatic || first ? formatNumber(gained - w.data.potionCosts) : '—'} />
        {!automatic && goal > 0 && <Stat label="Goal ETA" value={last && last.value >= goal ? 'Reached!' : eta === null ? '—' : formatDuration(eta, true)} />}
      </div>
      {w.data.loot.some(item => item.unitValue === null) && <p className="hint">Unvalued loot excluded. Set prices in Settings.</p>}
      {automatic && <p className="hint">Retained previous notification totals. Automatic meso/loot tracking is currently disabled.</p>}
      <button className="ghost" onClick={() => window.mscw.openControl(w.id)}>Configure potion detection</button>
      {w.config.potions.length > 0 && <p className="hint">{potionStatus?.message ?? 'Potion detection stopped.'}</p>}
      {!automatic && goal > 0 && last && (
        <div className="bar">
          <div className="bar-fill" style={{ width: `${Math.min(100, (last.value / goal) * 100)}%` }} />
        </div>
      )}
      {!automatic && <EntryInput
        placeholder="Current mesos (e.g. 1.25m)"
        onSubmit={(v) => {
          const n = parseAmount(v);
          if (n === null) return false;
          dispatch({ type: 'rate/sample', id: w.id, value: n, at: Date.now() });
          return true;
        }}
      />}
      <div className="row">
        <span className="hint">{automatic ? 'Automatic notification gains' : `${samples.length} samples`}</span>
        <button className="ghost" onClick={() => dispatch({ type: 'rate/reset', id: w.id })}>
          Reset
        </button>
      </div>
    </div>
  );
}
