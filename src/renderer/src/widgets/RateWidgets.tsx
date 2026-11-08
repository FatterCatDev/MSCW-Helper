import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { etaMs, expRateHistory, formatDuration, formatNumber, parseAmount, rollingPerMinute } from '../../../shared/time.ts';
import type { RateSample } from '../../../shared/types.ts';
import { Stat, type WidgetProps } from './common.tsx';
import { useNow } from '../common/state.ts';
import { ItemIcon, PotionSelection } from '../common/PotionSelection.tsx';
import { usedRecoveryItems } from '../../../shared/recovery.ts';
import { NPC_RECOVERY_ITEMS } from '../../../shared/npc-recovery-prices.ts';

export function ExpWidget({ w, dispatch, embedded = false, trainingMs, mesoSamples }: WidgetProps<'exp'> & {
  embedded?: boolean; trainingMs?: number; mesoSamples?: RateSample[]
}): ReactNode {
  const { samples, current, required, gained, startedAt, migrated } = w.data;
  const tick = useNow(1000);
  const now = Math.max(tick, samples.at(-1)?.t ?? tick, mesoSamples?.at(-1)?.t ?? tick);
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
  const mesoHistory = useMemo(() => mesoSamples ? expRateHistory(mesoSamples, graphSecond * 1000) : [],
    [mesoSamples, graphSecond]);
  const values = history.flatMap(point => point.value === null ? [] : [point.value]);
  const mesoValues = mesoHistory.flatMap(point => point.value === null ? [] : [point.value]);
  const low = Math.min(0, ...values);
  const high = Math.max(1, ...values);
  const mesoLow = Math.min(0, ...mesoValues);
  const mesoHigh = Math.max(1, ...mesoValues);
  const graphY = (value: number): number => 14 + (high - value) / (high - low) * 78;
  const mesoY = (value: number): number => 14 + (mesoHigh - value) / (mesoHigh - mesoLow) * 78;
  const graphRight = mesoSamples ? 350 : 392;
  const path = (points: typeof history, y: (value: number) => number): string => {
    let connected = false;
    return points.map((point, index) => {
      if (point.value === null) { connected = false; return ''; }
      const command = connected ? 'L' : 'M';
      connected = true;
      return `${command}${42 + index / 600 * (graphRight - 42)},${y(point.value)}`;
    }).filter(Boolean).join(' ');
  };

  return (
    <div className="widget-body">
      <div className="big">{w.data.source === 'notifications' ? formatNumber(gained) : current === null ? '—' : formatNumber(current)} <span className="hint">{embedded && w.data.source !== 'notifications' ? 'Current EXP' : 'EXP'}</span></div>
      <div className="stats">
        <Stat label="EXP/min" value={rate === null ? '—' : formatNumber(rate)} />
        <Stat label="10-min avg/min" value={average === null ? '—' : formatNumber(average)} />
        <Stat label={w.data.source === 'notifications' ? 'Session EXP gained' : 'Session EXP (net)'} value={startedAt === null ? '—' : gained.toLocaleString('en-US')} />
        <Stat label={w.data.source === 'status-bar' ? 'To level (est.)' : 'To level'} value={eta === null ? '—' : formatDuration(eta, true)} />
        <Stat label={embedded ? 'Training time' : 'Tracking'} value={embedded && trainingMs !== undefined ?
          formatDuration(trainingMs, true) : startedAt !== null ? formatDuration(now - startedAt, true) : '—'} />
      </div>
      <figure className="exp-rate-graph">
        <figcaption>EXP/min{mesoSamples && <> · <span className="graph-meso-label">Mesos/min</span></>} - last 10 minutes</figcaption>
        <svg viewBox="0 0 400 116" role="img" aria-label={mesoSamples
          ? 'EXP and mesos per minute over the last ten minutes, sampled every second'
          : 'EXP per minute over the last ten minutes, sampled every second'}>
          <title>{mesoSamples ? 'Trailing one-minute rates. EXP uses the left axis; mesos uses the blue right axis.' :
            'Trailing one-minute EXP rate, one point per second. Negative values indicate net EXP loss.'}</title>
          {[14, 53, 92].map(y => <line key={y} x1="42" x2={graphRight} y1={y} y2={y} className="graph-grid" />)}
          <line x1="42" x2={graphRight} y1={graphY(0)} y2={graphY(0)} className="graph-zero" />
          <text x="38" y="18" textAnchor="end">{formatNumber(high)}</text>
          <text x="38" y="96" textAnchor="end">{formatNumber(low)}</text>
          {mesoSamples && mesoValues.length > 0 && <>
            <line x1="42" x2={graphRight} y1={mesoY(0)} y2={mesoY(0)} className="graph-meso-zero" />
            <text x="354" y="18" className="graph-meso-label">{formatNumber(mesoHigh)}</text>
            <text x="354" y="96" className="graph-meso-label">{formatNumber(mesoLow)}</text>
          </>}
          <text x="42" y="111">-10m</text>
          <text x={(42 + graphRight) / 2} y="111" textAnchor="middle">-5m</text>
          <text x={graphRight} y="111" textAnchor="end">Now</text>
          <path d={path(history, graphY)} className="graph-line" />
          {mesoSamples && <path d={path(mesoHistory, mesoY)} className="graph-line graph-meso-line" />}
          {!values.length && !mesoValues.length && <text x={(42 + graphRight) / 2} y="55" textAnchor="middle">Waiting for readings</text>}
        </svg>
      </figure>
      {migrated && <p className="hint">Old percentage history was cleared; enter a points baseline.</p>}
      {!embedded && w.data.source === 'status-bar' && <p className="hint">Level {w.data.level} · {w.data.percent?.toFixed(2) ?? '—'}% · Requirement ~{formatNumber(required)} EXP.
        Automatic status-bar readings; session includes EXP losses. ETA and level-up rollover use an estimated requirement.</p>}
      {!embedded && w.data.source === 'notifications' && <p className="hint">Automatic gain notifications. Losses and hidden notifications are not included.</p>}
      {w.data.source === 'manual' && <form className="exp-entry" onSubmit={event => {
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
      {!embedded && <div className="row">
        <span className="hint">{startedAt !== null && now - startedAt < 600_000 ? '10-min average warming up' : w.data.source === 'status-bar' ? 'Status-bar readings' : w.data.source === 'notifications' ? 'Notification readings' : 'Manual readings'}</span>
        <button className="ghost" onClick={() => dispatch({ type: 'rate/reset', id: w.id })}>
          Reset
        </button>
      </div>}
    </div>
  );
}

export function MesoWidget({ w, dispatch, now, potionStatus, embedded = false, controlId }: WidgetProps<'meso'> & { embedded?: boolean; controlId?: string }): ReactNode {
  const { samples } = w.data;
  const first = samples[0];
  const last = samples.at(-1);
  const gained = first && last ? last.value - first.value : 0;
  const rate = rollingPerMinute(samples, Math.max(now, last?.t ?? now), 60_000);
  const goal = w.config.goal;
  const eta = goal > 0 && last ? etaMs(goal - last.value, rate === null ? null : rate * 60) : null;
  const used = usedRecoveryItems(w.data.potionUses, w.config.potions);

  return (
    <div className="widget-body">
      <div className="big">{last ? formatNumber(last.value) : '—'}</div>
      <div className="stats">
        <Stat label="Mesos/min" value={rate === null ? '—' : formatNumber(rate)} className={rate !== null && rate < 0 ? 'bad' : ''} />
        <Stat label="Session mesos (net)" value={first ? formatNumber(gained) : '—'} className={gained < 0 ? 'bad' : ''} />
        <Stat label="Potion cost (est.)" value={formatNumber(w.data.potionCosts)} className="bad" />
        {w.data.unidentifiedRecoveries > 0 && <Stat label="Unidentified recoveries" value={formatNumber(w.data.unidentifiedRecoveries)} />}
        {goal > 0 && <Stat label="Goal ETA" value={last && last.value >= goal ? 'Reached!' : eta === null ? '—' : formatDuration(eta, true)} />}
      </div>
      {used.length > 0 && <div className="training-used" aria-label="Estimated recovery items used">
        {used.map(({ itemId, count }) => {
          const item = NPC_RECOVERY_ITEMS[itemId]!;
          return <span className="training-used-item" key={itemId} title={`${item.name}: ${count} used`}>
            <ItemIcon id={itemId} />
            <span>-{formatNumber(count)}</span>
          </span>;
        })}
      </div>}
      <PotionSelection selected={w.config.selectedPotions} onChange={selectedPotions =>
        dispatch({ type: 'widget/config', id: w.id, config: { selectedPotions } })} />
      {embedded && potionStatus?.message.startsWith('Automatic recovery tracking failed:') &&
        <p role="alert" className="hint">{potionStatus.message}</p>}
      <button className="ghost" onClick={() => window.mscw.openControl(controlId ?? w.id)}>Configure recovery tracking</button>
      {!embedded && <p className="hint">{w.config.selectedPotions.hp === null && w.config.selectedPotions.mp === null ? 'No potions selected; potion tracking disabled.' :
        potionStatus?.message ?? 'Waiting for game capture; recovery tracking starts automatically.'}</p>}
      {goal > 0 && last && (
        <div className="bar">
          <div className="bar-fill" style={{ width: `${Math.min(100, (last.value / goal) * 100)}%` }} />
        </div>
      )}
      {!embedded && <div className="row">
        <span className="hint">{samples.length} wallet readings</span>
        <button className="ghost" onClick={() => dispatch({ type: 'rate/reset', id: w.id })}>
          Reset
        </button>
      </div>}
    </div>
  );
}
