import { useState, type ReactNode, type PointerEvent } from 'react';
import type { CapturePreview, CaptureRegion, PotionItem, PotionStatus, PotionTracker, WidgetConfigMap, WidgetDef } from '../../../shared/types.ts';
import { Field, NumberField } from './fields.tsx';

export function PotionEditor({ w, status, setConfig }: {
  w: WidgetDef<'meso'>;
  status: PotionStatus | undefined;
  setConfig: (patch: Partial<WidgetConfigMap['meso']>) => void;
}): ReactNode {
  const [itemId, setItemId] = useState('2000000');
  const [version, setVersion] = useState('62');
  const [item, setItem] = useState<PotionItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);
  const [previews, setPreviews] = useState<CapturePreview[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [region, setRegion] = useState<CaptureRegion | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const potions = w.config.potions;
  const running = status?.running ?? false;
  const update = (id: string, patch: Partial<PotionTracker>): void => setConfig({ potions: potions.map(p => p.id === id ? { ...p, ...patch } : p) });

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError('');
    try { await work(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  const point = (event: PointerEvent<HTMLDivElement>): { x: number; y: number } => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  };
  const drag = (event: PointerEvent<HTMLDivElement>): void => {
    if (!anchor) return;
    const end = point(event);
    setRegion({ x: Math.min(anchor.x, end.x), y: Math.min(anchor.y, end.y),
      width: Math.abs(end.x - anchor.x), height: Math.abs(end.y - anchor.y) });
  };

  return (
    <section className="potion-editor">
      <h3>Potion cost detection (experimental)</h3>
      <p className="hint">Uses local screenshots, never uploads them. Keep each selected quantity visible and unobstructed.
        Stable decreases of one are estimated uses; moving, selling, or dropping a potion also looks like use.
        Unreadable counts and larger decreases are not charged. Stop detection before managing inventory.</p>
      <p className="hint">Costs estimate replacement expenses, not live wallet deductions. API prices may not match MSCW.</p>
      <Field label="GMS API version" hint="62 is a classic reference dataset, not a verified MSCW match.">
        <input aria-label="GMS API version" value={version} disabled={busy || running} onChange={e => { setVersion(e.target.value); setItem(null); }} />
      </Field>
      <Field label="Potion item ID" hint="Example: 2000000 = Red Potion. Lookup sends only the ID and version to MapleStory.io.">
        <input aria-label="Potion item ID" value={itemId} disabled={busy || running} onChange={e => { setItemId(e.target.value); setItem(null); }} />
        <button disabled={busy || running} onClick={() => void run(async () => {
          setItem(null);
          setItem(await window.mscw.lookupPotion(Number(itemId), version));
        })}>Look up potion</button>
      </Field>
      {item && <div>
        <p><strong>{item.name}</strong> — {item.description}</p>
        <p className="hint">API NPC sell price: {item.npcSellPrice ?? 'not provided'}. Enter your actual purchase cost below; this is not a purchase-price quote.</p>
        <button disabled={busy || running || potions.length >= 8 || potions.some(p => p.itemId === item.id)}
          onClick={() => setConfig({ potions: [...potions, { id: crypto.randomUUID(), itemId: item.id, name: item.name, unitCost: 0,
            sourceId: '', region: { x: 0, y: 0, width: 0, height: 0 } }] })}>Add potion</button>
      </div>}
      {potions.map(p => <div className="potion-entry" key={p.id}>
        <strong>{p.name} ({p.itemId})</strong>
        <Field label="Purchase cost per potion" hint="Whole mesos; required before detection starts.">
          <NumberField value={p.unitCost} min={0} max={1e9} onCommit={value => update(p.id, { unitCost: Math.round(value) })} />
        </Field>
        <p className="hint">Estimated used: {w.data.potionUses[p.id] ?? 0}. Last confirmed quantity: {status?.counts[p.id] ?? '—'}.</p>
        <div className="row-left">
          <button disabled={busy || running} onClick={() => void run(async () => {
            const images = await window.mscw.capturePreviews();
            setPreviews(images); setSourceId(images[0]?.id ?? ''); setRegion(null); setSelecting(p.id);
          })}>{p.sourceId ? 'Change count region' : 'Select count region'}</button>
          <button className="ghost" disabled={busy || running} onClick={() => setConfig({ potions: potions.filter(entry => entry.id !== p.id) })}>Remove potion</button>
        </div>
      </div>)}
      {selecting && <div>
        <p>Drag a tight rectangle around ONLY the potion quantity digits. This is a game-window preview; keep the inventory in the same position inside the window.</p>
        <select aria-label="Potion capture window" value={sourceId} onChange={e => { setSourceId(e.target.value); setRegion(null); }}>
          {previews.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
        </select>
        <div className="capture-selector" onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId); setAnchor(point(e)); setRegion(null);
        }} onPointerMove={drag} onPointerUp={e => { drag(e); setAnchor(null); }}
          onPointerCancel={() => { setAnchor(null); setRegion(null); }}>
          <img alt="Local game-window preview" draggable={false} src={previews.find(p => p.id === sourceId)?.image} />
          {region && <div className="capture-selection" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`,
            width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />}
        </div>
        <div className="row-left">
          <button disabled={!region || region.width <= 0 || region.height <= 0} onClick={() => {
            if (region) update(selecting, { sourceId, region });
            setSelecting(null); setPreviews([]);
          }}>Save count region</button>
          <button className="ghost" onClick={() => { setSelecting(null); setPreviews([]); }}>Cancel</button>
        </div>
      </div>}
      <div className="row-left">
        <button disabled={busy || selecting !== null || !potions.length} onClick={() => void run(async () => {
          if (running) await window.mscw.stopPotions(w.id);
          else await window.mscw.startPotions(w.id);
        })}>{running ? 'Stop potion detection' : 'Start potion detection'}</button>
        <button className="ghost" disabled={busy || running} onClick={() => window.mscw.dispatch({ type: 'potion/reset', id: w.id })}>Reset potion costs</button>
      </div>
      {status && <p role="status">{status.message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
