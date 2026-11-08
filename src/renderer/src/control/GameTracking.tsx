import { useState, type PointerEvent, type ReactNode } from 'react';
import type { AppState, CapturePreview, CaptureRegion, GameTrackingConfig } from '../../../shared/types.ts';
import type { Dispatch } from '../common/state.ts';
import { DEFAULT_EXP_REGION, DEFAULT_LEVEL_REGION, DEFAULT_HP_REGION, DEFAULT_MP_REGION } from '../../../shared/game-tracking.ts';

export function GameTrackingSettings({ state, dispatch }: { state: AppState; dispatch: Dispatch }): ReactNode {
  const config = state.settings.gameTracking;
  const status = state.runtime.gameTracking;
  const [previews, setPreviews] = useState<CapturePreview[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [region, setRegion] = useState<CaptureRegion | null>(null);
  const [field, setField] = useState<'exp' | 'level' | 'hp' | 'mp'>('exp');
  const savedRegion = { exp: config.region, level: config.levelRegion ?? DEFAULT_LEVEL_REGION,
    hp: config.hpRegion ?? DEFAULT_HP_REGION, mp: config.mpRegion ?? DEFAULT_MP_REGION }[field];
  const update = (patch: Partial<GameTrackingConfig>): void =>
    dispatch({ type: 'settings/set', patch: { gameTracking: { ...config, ...patch } } });
  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true); setError('');
    try { await work(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  const point = (event: PointerEvent<HTMLDivElement>): { x: number; y: number } => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
  };
  const drag = (event: PointerEvent<HTMLDivElement>): void => {
    if (!anchor) return;
    const p = point(event);
    setRegion({ x: Math.min(anchor.x, p.x), y: Math.min(anchor.y, p.y),
      width: Math.abs(anchor.x - p.x), height: Math.abs(anchor.y - p.y) });
  };
  const selected = previews.find(p => p.id === config.sourceId);
  const meso = state.widgets[config.mesoWidgetId];
  return <section>
    <h3>Automatic game-window tracking</h3>
    <p><strong>{status.running ? status.fps.toFixed(1) : '0.0'} capture FPS / 30 max</strong> — {status.frames} frames</p>
    <p role="status">{status.message}</p>
    <p className="hint">Detected game resolution: {status.resolution ? `${status.resolution.width} x ${status.resolution.height}` : 'Waiting for video frames'}.
      Reader: {status.reader === 'font' ? 'Bitmap font, every captured frame' : 'Waiting for recognizable status digits'}.</p>
    <p className="hint">Reads the bottom status bar: character level, EXP points and percentage. Select the numeric fields without labels;
      HP/MP current/max fields feed recovery tracking in Training Tracker. The first confirmed reading sets an EXP baseline.
      Automatic meso/loot tracking is disabled. ETA uses an estimated requirement from points/percentage, not an API-verified table.</p>
    <button disabled={busy || status.running} onClick={() => void run(async () => {
      const windows = await window.mscw.capturePreviews();
      setPreviews(windows);
      if (!windows.length) throw new Error('No capturable game windows found. Launch or restore the game.');
    })}>Refresh game windows / preview</button>
    <label className="toggle">Game window
      <select aria-label="Game window" disabled={busy || status.running} value={config.sourceId}
        onChange={e => {
          const win = previews.find(p => p.id === e.target.value);
          update({ sourceId: e.target.value, windowName: win?.name ?? '', captureMode: 'status-bar',
            region: { ...DEFAULT_EXP_REGION }, levelRegion: { ...DEFAULT_LEVEL_REGION },
            hpRegion: { ...DEFAULT_HP_REGION }, mpRegion: { ...DEFAULT_MP_REGION } });
          setRegion(null);
        }}>
        <option value="">Select a window...</option>
        {!previews.some(p => p.id === config.sourceId) && config.sourceId && <option value={config.sourceId}>{config.windowName} (refresh to verify)</option>}
        {previews.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
    {selected && !status.running && <>
      <label className="toggle">Field to select
        <select value={field} onChange={e => {
          const value = e.target.value;
          if (value === 'exp' || value === 'level' || value === 'hp' || value === 'mp') setField(value);
          setRegion(null);
        }}>
          <option value="exp">EXP points and percentage</option><option value="level">Character level digits</option>
          <option value="hp">HP current/max numbers</option><option value="mp">MP current/max numbers</option>
        </select>
      </label>
      <p className="hint">{field === 'exp' ? 'Select only the EXP number and [percentage%], excluding the EXP label and gauge.'
        : field === 'level' ? 'Select only the orange level digits, excluding the LV label and character name.'
          : `Select the complete ${field.toUpperCase()} current/max numbers (for example [1084/1995]), excluding the label and gauge.`}</p>
      <div className="capture-selector" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setAnchor(point(e)); }}
        onPointerMove={drag} onPointerUp={e => { drag(e); setAnchor(null); }} onPointerCancel={() => { setAnchor(null); setRegion(null); }}>
        <img src={selected.image} alt="Selected game window preview" draggable={false} />
        <div className="capture-selection" style={{ left: `${(region ?? savedRegion).x * 100}%`,
          top: `${(region ?? savedRegion).y * 100}%`, width: `${(region ?? savedRegion).width * 100}%`,
          height: `${(region ?? savedRegion).height * 100}%` }} />
      </div>
      <button disabled={!region || region.width <= 0 || region.height <= 0} onClick={() => {
        if (region) update(field === 'exp' ? { captureMode: 'status-bar', region } :
          field === 'level' ? { levelRegion: region } : field === 'hp' ? { hpRegion: region } : { mpRegion: region });
        setRegion(null);
      }}>Save {field === 'level' ? 'level' : field.toUpperCase()} region</button>
    </>}
    <label className="toggle">Training tracker
      <select aria-label="Training tracker" value={config.expWidgetId}
        disabled={busy || status.running} onChange={e => {
          const training = Object.values(state.widgets).find(w => w.type === 'training' && w.config.expId === e.target.value);
          update({ expWidgetId: e.target.value, mesoWidgetId: training?.type === 'training' ? training.config.mesoId : '' });
        }}>
        <option value="">Select tracker...</option>
        {Object.values(state.widgets).filter(w => w.type === 'training').map(w =>
          w.type === 'training' && <option value={w.config.expId} key={w.id}>{w.title}</option>)}
      </select>
    </label>
    <div className="row-left">
      <button disabled={busy || region !== null || !config.sourceId || !config.expWidgetId}
        onClick={() => void run(async () => {
          if (status.running) await window.mscw.stopGameTracking();
          else { setPreviews([]); await window.mscw.startGameTracking(); }
        })}>{status.running ? 'Stop automatic tracking' : 'Start automatic tracking'}</button>
    </div>
    {meso?.type === 'meso' && meso.data.loot.length > 0 && <>
      <h3>Loot valuation</h3>
      <p className="hint">Unknown prices are excluded and listed here, not treated as zero. NPC values are estimates; override any price.
        Stop tracking before changing overrides. Item sale proceeds are not tracked as pickups.</p>
      <table className="entries"><thead><tr><th>Item</th><th>Quantity</th><th>Value each</th><th>Override (mesos)</th></tr></thead>
        <tbody>{meso.data.loot.map(item => <tr key={item.name}>
          <td>{item.name}</td><td>{item.quantity}</td><td>{item.unitValue ?? 'Unvalued'}</td>
          <td><input aria-label={`Value override for ${item.name}`} type="number" min="0" step="1"
            disabled={status.running} defaultValue={config.priceOverrides[item.name.toLowerCase()] ?? ''}
            onBlur={e => {
              const value = Number(e.target.value);
              if (!e.target.value.trim() || !Number.isSafeInteger(value) || value < 0) {
                setError('Enter a whole, nonnegative item value.'); return;
              }
              update({ priceOverrides: { ...config.priceOverrides, [item.name.toLowerCase()]: value } });
            }} /></td>
        </tr>)}</tbody></table>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
