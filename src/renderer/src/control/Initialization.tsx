import { useEffect, useState, type ReactNode } from 'react';
import type { CapturePreview } from '../../../shared/types.ts';

export function Initialization(): ReactNode {
  const [windows, setWindows] = useState<CapturePreview[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh(): Promise<void> {
    setBusy(true); setError('');
    try {
      const previews = await window.mscw.capturePreviews();
      setWindows(previews);
      setSourceId(previous => previews.some(p => p.id === previous) ? previous : '');
      if (!previews.length) setError('No capturable windows found. Launch or restore MapleStory, then refresh.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  const selected = windows.find(w => w.id === sourceId);
  return <main className="page initialization">
    <h1>MSCW Helper Initialization</h1>
    <p>Choose your MapleStory game window, then click Start to read the bottom level and EXP status bar. Automatic meso/loot tracking is disabled for now.</p>
    <label className="toggle">Game window
      <select aria-label="Game window" value={sourceId} disabled={busy} onChange={e => setSourceId(e.target.value)}>
        <option value="">Select a game window...</option>
        {windows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </label>
    {selected && <img className="initialization-preview" src={selected.image} alt="Selected game window preview" />}
    <p className="hint">The first confirmed EXP reading establishes your baseline. Capture stays local and is limited to 30 FPS.
      Game-window resolution is detected automatically. EXP is read from the game's bitmap font on every captured frame.
      Status-bar region and layout settings are available from the tray after starting.</p>
    <div className="row-left">
      <button disabled={busy || !selected} onClick={() => {
        setBusy(true); setError('');
        void window.mscw.initializeGame(sourceId).catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : String(reason));
        }).finally(() => setBusy(false));
      }}>{busy ? 'Please wait...' : 'Start'}</button>
      <button className="ghost" disabled={busy} onClick={() => void refresh()}>Refresh windows</button>
      <button className="ghost" disabled={busy} onClick={() => window.mscw.quit()}>Quit</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </main>;
}
