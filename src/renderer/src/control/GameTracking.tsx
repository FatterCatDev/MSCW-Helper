import { useState, type PointerEvent, type ReactNode } from 'react';
import type { AppState, CapturePreview, CaptureRegion, GameTrackingConfig } from '../../../shared/types.ts';
import type { Dispatch } from '../common/state.ts';
import { DEFAULT_GAIN_REGION } from '../../../shared/game-tracking.ts';

export function GameTrackingSettings({ state, dispatch }: { state: AppState; dispatch: Dispatch }): ReactNode {
  const config = state.settings.gameTracking;
  const status = state.runtime.gameTracking;
  const [previews, setPreviews] = useState<CapturePreview[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [region, setRegion] = useState<CaptureRegion | null>(null);
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
    <p className="hint">Captures only the chosen window, not the desktop. OCR reads the right-hand gain notifications.
      Keep notifications visible. Starting creates a new EXP/pickup/loot session; old visible messages are ignored.
      Missed or misread notifications can affect totals. FPS measures received video frames, not OCR checks.</p>
    <button disabled={busy || status.running} onClick={() => void run(async () => {
      const windows = await window.mscw.capturePreviews();
      setPreviews(windows);
      if (!windows.length) throw new Error('No capturable game windows found. Launch or restore the game.');
    })}>Refresh game windows / preview</button>
    <label className="toggle">Game window
      <select aria-label="Game window" disabled={busy || status.running} value={config.sourceId}
        onChange={e => {
          const win = previews.find(p => p.id === e.target.value);
          update({ sourceId: e.target.value, windowName: win?.name ?? '', region: { ...DEFAULT_GAIN_REGION } });
          setRegion(null);
        }}>
        <option value="">Select a window...</option>
        {!previews.some(p => p.id === config.sourceId) && config.sourceId && <option value={config.sourceId}>{config.windowName} (refresh to verify)</option>}
        {previews.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
    {selected && !status.running && <>
      <p className="hint">Default region matches your video. Drag around the full gain-notification stack if it differs; exclude chat and the status bar.</p>
      <div className="capture-selector" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setAnchor(point(e)); }}
        onPointerMove={drag} onPointerUp={e => { drag(e); setAnchor(null); }} onPointerCancel={() => { setAnchor(null); setRegion(null); }}>
        <img src={selected.image} alt="Selected game window preview" draggable={false} />
        <div className="capture-selection" style={{ left: `${(region ?? config.region).x * 100}%`,
          top: `${(region ?? config.region).y * 100}%`, width: `${(region ?? config.region).width * 100}%`,
          height: `${(region ?? config.region).height * 100}%` }} />
      </div>
      <button disabled={!region || region.width <= 0 || region.height <= 0} onClick={() => { if (region) update({ region }); setRegion(null); }}>Save notification region</button>
    </>}
    {(['exp', 'meso'] as const).map(type => <label className="toggle" key={type}>{type === 'exp' ? 'EXP tracker' : 'Meso tracker'}
      <select aria-label={`${type} tracking widget`} value={type === 'exp' ? config.expWidgetId : config.mesoWidgetId}
        disabled={busy || status.running} onChange={e => update(type === 'exp' ? { expWidgetId: e.target.value } : { mesoWidgetId: e.target.value })}>
        <option value="">Select tracker...</option>
        {Object.values(state.widgets).filter(w => w.type === type).map(w => <option value={w.id} key={w.id}>{w.title}</option>)}
      </select>
    </label>)}
    <label className="toggle">GMS API version
      <input aria-label="Loot API version" value={config.apiVersion} disabled={busy || status.running} onChange={e => update({ apiVersion: e.target.value })} />
    </label>
    <div className="row-left">
      <button disabled={busy || region !== null || !config.sourceId || !config.expWidgetId || !config.mesoWidgetId}
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
