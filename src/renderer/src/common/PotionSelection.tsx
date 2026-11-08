import { useState, type ReactNode } from 'react';
import { NPC_RECOVERY_ITEMS } from '../../../shared/npc-recovery-prices.ts';
import { recoveryIconUrl } from '../../../shared/recovery-icons.ts';
import type { RecoveryPotionSelection } from '../../../shared/types.ts';
import './potion-selection.css';

export function ItemIcon({ id, onError }: { id: number; onError?: (id: number) => void }): ReactNode {
  const [failed, setFailed] = useState(false);
  const item = NPC_RECOVERY_ITEMS[id]!;
  const icon = recoveryIconUrl(id);
  if (!icon) return <span className="potion-icon-error" aria-label={`No verified icon: ${item.name}`}>?</span>;
  return failed ? <span className="potion-icon-error" aria-label={`Icon unavailable: ${item.name}`}>!</span> :
    <img className="potion-icon" src={icon} alt={item.name}
      draggable={false} onError={() => {
        setFailed(true); onError?.(id);
        console.error(`[potion-icons] Could not load item icon ${id} (${item.name}).`);
      }} />;
}

export function PotionSelection({ selected, onChange, disabled = false }: {
  selected: RecoveryPotionSelection; onChange: (selection: RecoveryPotionSelection) => void; disabled?: boolean;
}): ReactNode {
  const [open, setOpen] = useState<'hp' | 'mp' | null>(null);
  const [failed, setFailed] = useState<number[]>([]);
  const iconError = (id: number): void => setFailed(ids => ids.includes(id) ? ids : [...ids, id]);
  return <div className="potion-selection">
    <div className="potion-dropdowns">
      {(['hp', 'mp'] as const).map(kind => {
        const id = selected[kind], label = `${kind.toUpperCase()} recovery`;
        return <details className="potion-dropdown" key={kind} open={!disabled && open === kind}
          onToggle={event => {
            if (event.currentTarget.open && !disabled) setOpen(kind);
            else setOpen(current => current === kind ? null : current);
          }} onKeyDown={event => {
            if (event.key === 'Escape') {
              setOpen(null); event.currentTarget.querySelector('summary')?.focus();
            }
          }}>
          <summary aria-label={`${label}: ${id === null ? 'None' : NPC_RECOVERY_ITEMS[id]?.name}`}
            aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}>
            <span className="hint">{label}</span>
            <span className="potion-selected" title={id === null ? 'None (do not track)' : NPC_RECOVERY_ITEMS[id]?.name}>
              {id === null ? <span className="potion-none" aria-hidden="true" /> : <ItemIcon key={id} id={id} onError={iconError} />}
            </span>
            <span aria-hidden="true">&#9662;</span>
          </summary>
          {open === kind && !disabled && <div className="potion-options" role="group" aria-label={`${label} items`}>
            <button type="button" className="ghost" aria-label={`No ${kind.toUpperCase()} recovery item`}
              title="None (do not track)" aria-pressed={id === null} onClick={() => {
                onChange({ ...selected, [kind]: null }); setOpen(null);
              }}><span className="potion-none" aria-hidden="true" /></button>
            {Object.values(NPC_RECOVERY_ITEMS).filter(item => item[kind] > 0).map(item =>
              <button type="button" className="ghost" key={item.itemId} aria-label={item.name}
                title={`${item.name}: ${item.hp} HP / ${item.mp} MP`} aria-pressed={id === item.itemId}
                onClick={() => { onChange({ ...selected, [kind]: item.itemId }); setOpen(null); }}>
                <ItemIcon id={item.itemId} onError={iconError} />
              </button>)}
          </div>}
        </details>;
      })}
    </div>
    {failed.length > 0 && <p className="hint" role="alert">Some item icons could not load. Check your connection to MapleStory.io;
      hover or focus an option for its item name.</p>}
    {(open !== null || [selected.hp, selected.mp].some(id => id !== null && !recoveryIconUrl(id))) &&
      <p className="hint">? means no verified icon; hover or focus for the item name.</p>}
  </div>;
}
