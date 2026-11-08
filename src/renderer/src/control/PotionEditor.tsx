import { useState, type ReactNode } from 'react';
import type { PotionStatus, WidgetConfigMap, WidgetDef } from '../../../shared/types.ts';
import { NPC_RECOVERY_ITEMS } from '../../../shared/npc-recovery-prices.ts';
import { PotionSelection } from '../common/PotionSelection.tsx';

export function PotionEditor({ w, status, setConfig }: {
  w: WidgetDef<'meso'>; status: PotionStatus | undefined; setConfig: (patch: Partial<WidgetConfigMap['meso']>) => void;
}): ReactNode {
  const [error, setError] = useState('');
  const [selectedItems, setSelectedItems] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const items = Object.values(NPC_RECOVERY_ITEMS);
  return <section className="potion-editor">
    <h3>HP/MP recovery tracking (estimated potion use)</h3>
    <p className="hint">Choose the potions you use in the Tracker widget or below. Blank selection disables potion tracking.
      An observed recovery within 50% of a selected item's base recovery counts as an estimated use.
      Healing, regeneration, capped recovery and damage between frames can look like potion use.
      When multiple selected items match, the event remains unidentified and uncharged.</p>
    <p className="hint">Uses the existing game capture stream (up to 30 FPS). Configure HP and MP current/max number regions in
      Settings → Automatic game-window tracking. Recovery tracking starts automatically once capture is running and an item is selected.
      Unreadable fields, capture gaps, death and changes to maximum HP/MP rebaseline without a charge.</p>
    <PotionSelection selected={w.config.selectedPotions}
      onChange={selectedPotions => setConfig({ selectedPotions })} />
    <div className="row-left">
      <button className="ghost" onClick={() => window.mscw.dispatch({ type: 'potion/reset', id: w.id })}>Reset potion costs and recovery events</button>
    </div>
    {w.config.selectedPotions.hp === null && w.config.selectedPotions.mp === null ? <p role="status">No potions selected; potion tracking disabled.</p> :
      <p role="status">{status?.message ?? 'Waiting for game capture; recovery tracking starts automatically.'}</p>}
    {status?.vitals && <p>HP {status.vitals.hp}/{status.vitals.maxHp} · MP {status.vitals.mp}/{status.vitals.maxMp}</p>}
    <p>Unidentified recovery events: {w.data.unidentifiedRecoveries}. Only the latest 200 events are retained for review.</p>
    <details><summary>Recovery item prices and estimated counts</summary>
      <table className="entries"><thead><tr><th>Item (base recovery)</th><th>Uses</th><th>Cost each</th></tr></thead>
        <tbody>{items.map(item => {
          const override = w.config.potions.find(p => p.itemId === item.itemId);
          const key = override?.id ?? `recovery-${item.itemId}`;
          return <tr key={item.itemId}><td>{item.name} ({item.hp} HP / {item.mp} MP)</td><td>{w.data.potionUses[key] ?? 0}</td>
            <td><input aria-label={`Cost for ${item.name}`} type="number" min="0" step="1"
              defaultValue={override?.unitCost ?? item.npcBuyPrice ?? ''} onBlur={e => {
                const cost = Number(e.target.value);
                if (!e.target.value.trim() || !Number.isSafeInteger(cost) || cost < 0 || cost > 1e9) {
                  setError('Enter a whole nonnegative purchase cost; unknown prices must not be guessed.'); return;
                }
                setConfig({ potions: [...w.config.potions.filter(p => p.itemId !== item.itemId),
                  { id: key, itemId: item.itemId, name: item.name, unitCost: cost }] });
              }} /></td></tr>;
        })}</tbody></table>
    </details>
    <details><summary>Review uncharged recovery events</summary>
      {w.data.recoveryEvents.filter(event => event.cost === null).map(event => {
        const selection = selectedItems[event.id] ?? (event.itemId === null ? '' : String(event.itemId));
        const selected = NPC_RECOVERY_ITEMS[Number(selection)];
        const defaultCost = selected ? w.config.potions.find(p => p.itemId === selected.itemId)?.unitCost ?? selected.npcBuyPrice : null;
        const cost = costs[event.id] ?? (defaultCost === null ? '' : String(defaultCost));
        return <div className="potion-entry" key={event.id}>
          <p>{new Date(event.at).toLocaleTimeString()}: HP +{event.hp}, MP +{event.mp}. {event.reason}</p>
          <p className="hint">Possible items: {event.candidates.map(id => NPC_RECOVERY_ITEMS[id]?.name).join(', ') || 'No matching item recorded'}.
            Only identify this event if you know which item was used; otherwise leave it uncharged.</p>
          <select aria-label={`Identify recovery ${event.id}`} value={selection} disabled={event.itemId !== null}
            onChange={e => { setSelectedItems({ ...selectedItems, [event.id]: e.target.value }); setCosts({ ...costs, [event.id]: '' }); }}>
            <option value="">Leave unidentified</option>
            {items.map(item => <option key={item.itemId} value={item.itemId}>{item.name}</option>)}
          </select>
          <input aria-label={`Recovery cost ${event.id}`} type="number" min="0" value={cost}
            onChange={e => setCosts({ ...costs, [event.id]: e.target.value })} />
          <button disabled={!selection || cost.trim() === ''} onClick={() => {
            const amount = Number(cost);
            if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1e9) { setError('Enter a whole nonnegative recovery cost.'); return; }
            window.mscw.dispatch({ type: 'recovery/resolve', id: w.id, eventId: event.id, itemId: Number(selection), cost: amount });
          }}>Identify and record cost once</button>
        </div>;
      })}
    </details>
    {error && <p role="alert">{error}</p>}
  </section>;
}
