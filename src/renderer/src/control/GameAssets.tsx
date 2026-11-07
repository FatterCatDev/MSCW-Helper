import { useEffect, useState, type ReactNode } from 'react';
import type { GameAssetImport } from '../../../shared/types.ts';
import type { Dispatch } from '../common/state.ts';
import { Field } from './fields.tsx';

export function GameAssets({ path, dispatch }: { path: string; dispatch: Dispatch }): ReactNode {
  const [draft, setDraft] = useState(path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState<GameAssetImport | null>(null);
  useEffect(() => setDraft(path), [path]);
  useEffect(() => {
    let active = true;
    window.mscw.getGameAssets().then((value) => {
      if (active) setImported(value);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { active = false; };
  }, []);

  async function run(pick: boolean): Promise<void> {
    setBusy(true);
    setError('');
    try {
      if (pick) {
        const selected = await window.mscw.pickGameData();
        if (selected) setDraft(selected);
      } else {
        setImported(await window.mscw.importGameAssets(draft));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3>Game UI assets</h3>
      <Field label="Game Data folder" hint="Choose the Data folder containing UI. The game files are never modified.">
        <input aria-label="Game Data folder" value={draft} disabled={busy} title={draft} style={{ flex: '1 1 420px', minWidth: 0 }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft.trim()) dispatch({ type: 'settings/set', patch: { gameDataPath: draft } }); }} />
        <div className="row-left">
          <button className="ghost" disabled={busy} onClick={() => void run(true)}>Browse...</button>
          <button disabled={busy || !draft.trim()} onClick={() => void run(false)}>{busy ? 'Working...' : 'Import UI assets'}</button>
        </div>
      </Field>
      {error && <p role="alert">{error}</p>}
      {imported && <div role="status">
        <p>Imported {imported.fileCount} files ({(imported.totalBytes / 1024 / 1024).toFixed(1)} MB) on {new Date(imported.importedAt).toLocaleString()}.</p>
        <p className="hint">Source: {imported.sourcePath}</p>
        <p className="hint">Local copy: {imported.directory}</p>
      </div>}
      <p className="hint">Copies the complete UI folder, including WZ archives and fonts, for future recognition work. WZ image extraction and automatic screen reading are not enabled yet. Re-import after game updates; the previous copy is replaced.</p>
    </>
  );
}
