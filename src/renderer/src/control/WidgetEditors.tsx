import type { ReactNode } from 'react';
import { newId } from '../../../shared/defaults.ts';
import { imageUrl } from '../../../shared/ipc.ts';
import { formatNumber, isValidClock, parseAmount, parseDurationSec } from '../../../shared/time.ts';
import type { AppState, BossEntry, TimerEntry, WidgetConfigMap, WidgetDef, WidgetType } from '../../../shared/types.ts';
import type { Dispatch } from '../common/state.ts';
import { Field, NumberField, TextField, Toggle } from './fields.tsx';
import { HotkeyInput } from './HotkeyInput.tsx';

interface EditorProps<T extends WidgetType> {
  w: WidgetDef<T>;
  state: AppState;
  setConfig: (patch: Partial<WidgetConfigMap[T]>) => void;
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 && m > 0 ? `${m}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

function MesoEditor({ w, setConfig }: EditorProps<'meso'>): ReactNode {
  return (
    <Field label="Goal" hint="Optional target, e.g. 50m. 0 = none.">
      <TextField
        value={w.config.goal ? formatNumber(w.config.goal) : '0'}
        validate={(v) => parseAmount(v) !== null}
        onCommit={(v) => setConfig({ goal: parseAmount(v) ?? 0 })}
      />
    </Field>
  );
}

function TimersEditor({ w, state, setConfig }: EditorProps<'timers'>): ReactNode {
  const timers = w.config.timers;
  const update = (id: string, patch: Partial<TimerEntry>): void => setConfig({ timers: timers.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  return (
    <>
      <Field label="Warn before end" hint="Seconds. Pulses + beeps. 0 = off.">
        <NumberField value={w.config.warnSec} min={0} max={3600} onCommit={(v) => setConfig({ warnSec: Math.round(v) })} />
      </Field>
      <table className="entries">
        <thead>
          <tr>
            <th>Name</th>
            <th>Duration</th>
            <th>Color</th>
            <th>Repeat</th>
            <th>Global hotkey</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {timers.map((t) => (
            <tr key={t.id}>
              <td>
                <TextField value={t.name} maxLength={40} onCommit={(name) => update(t.id, { name })} />
              </td>
              <td>
                <TextField
                  className="short"
                  value={formatSec(t.durationSec)}
                  validate={(v) => parseDurationSec(v) !== null}
                  onCommit={(v) => update(t.id, { durationSec: parseDurationSec(v)! })}
                />
              </td>
              <td>
                <input type="color" value={t.color} onChange={(e) => update(t.id, { color: e.target.value })} />
              </td>
              <td>
                <input type="checkbox" checked={t.repeat} onChange={(e) => update(t.id, { repeat: e.target.checked })} />
              </td>
              <td>
                <HotkeyInput value={t.hotkey} error={t.hotkey ? state.runtime.hotkeyErrors[t.hotkey] : undefined} onChange={(hotkey) => update(t.id, { hotkey })} />
              </td>
              <td>
                <button className="icon" title="Delete" onClick={() => setConfig({ timers: timers.filter((x) => x.id !== t.id) })}>
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="ghost"
        onClick={() => setConfig({ timers: [...timers, { id: newId(), name: `Timer ${timers.length + 1}`, durationSec: 60, hotkey: '', color: '#ffb35c', repeat: false }] })}
      >
        + Add timer
      </button>
      <p className="hint">Durations accept 200, 3:20, 90s, 5m or 1.5h. In the overlay: click a timer to start/restart, right-click to stop.</p>
    </>
  );
}

function BossEditor({ w, setConfig }: EditorProps<'boss'>): ReactNode {
  const entries = w.config.entries;
  const update = (id: string, patch: Partial<BossEntry>): void => setConfig({ entries: entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  return (
    <>
      <Field label="Warn before" hint="Minutes. 0 = off.">
        <NumberField value={w.config.warnMin} min={0} max={240} onCommit={(v) => setConfig({ warnMin: v })} />
      </Field>
      <table className="entries">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Respawn (min) / Times (HH:MM, comma separated, local)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>
                <TextField value={e.name} maxLength={40} onCommit={(name) => update(e.id, { name })} />
              </td>
              <td>
                <select value={e.kind} onChange={(ev) => update(e.id, { kind: ev.target.value as BossEntry['kind'] })}>
                  <option value="respawn">Respawn timer</option>
                  <option value="schedule">Daily schedule</option>
                </select>
              </td>
              <td>
                {e.kind === 'respawn' ? (
                  <NumberField className="short" value={e.respawnMin} min={0.1} max={10080} onCommit={(respawnMin) => update(e.id, { respawnMin })} />
                ) : (
                  <TextField
                    value={e.times.join(', ')}
                    placeholder="e.g. 12:00, 18:30"
                    validate={(v) => v.trim() === '' || v.split(',').every((t) => isValidClock(t))}
                    onCommit={(v) => update(e.id, { times: v.split(',').map((t) => t.trim()).filter(Boolean) })}
                  />
                )}
              </td>
              <td>
                <button className="icon" title="Delete" onClick={() => setConfig({ entries: entries.filter((x) => x.id !== e.id) })}>
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="ghost" onClick={() => setConfig({ entries: [...entries, { id: newId(), name: `Boss ${entries.length + 1}`, kind: 'respawn', respawnMin: 30, times: [] }] })}>
        + Add boss / event
      </button>
      <p className="hint">Respawn timers start when you press “Killed” in the overlay (right-click it to clear). Schedules repeat daily.</p>
    </>
  );
}

function NotesEditor({ w, setConfig }: EditorProps<'notes'>): ReactNode {
  return (
    <>
      <Toggle checked={w.config.autoResetDaily} onChange={(autoResetDaily) => setConfig({ autoResetDaily })} label="Uncheck all checklist items at daily reset" />
      <Field label="Daily reset (UTC hour)" hint={`Currently ${new Date(Date.UTC(2000, 0, 1, w.config.resetHourUtc)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} your time.`}>
        <NumberField value={w.config.resetHourUtc} min={0} max={23} onCommit={(v) => setConfig({ resetHourUtc: Math.round(v) })} />
      </Field>
    </>
  );
}

function KillsEditor({ w, state, setConfig }: EditorProps<'kills'>): ReactNode {
  return (
    <>
      <Field label="Label">
        <TextField value={w.config.label} maxLength={30} onCommit={(label) => setConfig({ label })} />
      </Field>
      <Field label="Goal" hint="0 = no goal (e.g. quest kill count)">
        <NumberField value={w.config.goal} min={0} max={1e9} onCommit={(v) => setConfig({ goal: Math.round(v) })} />
      </Field>
      <Field label="+1 hotkey" hint="Global hotkey; works while the game is focused.">
        <HotkeyInput value={w.config.hotkey} error={w.config.hotkey ? state.runtime.hotkeyErrors[w.config.hotkey] : undefined} onChange={(hotkey) => setConfig({ hotkey })} />
      </Field>
    </>
  );
}

function ImageEditor({ w, setConfig }: EditorProps<'image'>): ReactNode {
  return (
    <>
      <Field label="Fit">
        <select value={w.config.fit} onChange={(e) => setConfig({ fit: e.target.value as 'contain' | 'cover' })}>
          <option value="contain">Fit whole image</option>
          <option value="cover">Fill widget (crop)</option>
        </select>
      </Field>
      <div className="thumbs">
        {w.data.images.map((name) => (
          <div key={name} className="thumb">
            <img src={imageUrl(name)} alt="" />
            <button className="icon" title="Remove" onClick={() => void window.mscw.removeImage(w.id, name)}>
              ×
            </button>
          </div>
        ))}
      </div>
      <button onClick={() => void window.mscw.pickImages(w.id)}>Add images…</button>
      <p className="hint">Images are copied into the app's data folder. Use ‹ › in the overlay to flip between them.</p>
    </>
  );
}

export function WidgetConfigEditor(props: { w: WidgetDef; state: AppState; dispatch: Dispatch }): ReactNode {
  const { w, state, dispatch } = props;
  const setConfig = (patch: object): void => dispatch({ type: 'widget/config', id: w.id, config: patch as Record<string, unknown> });
  switch (w.type) {
    case 'meso':
      return <MesoEditor w={w} state={state} setConfig={setConfig} />;
    case 'timers':
      return <TimersEditor w={w} state={state} setConfig={setConfig} />;
    case 'boss':
      return <BossEditor w={w} state={state} setConfig={setConfig} />;
    case 'notes':
      return <NotesEditor w={w} state={state} setConfig={setConfig} />;
    case 'kills':
      return <KillsEditor w={w} state={state} setConfig={setConfig} />;
    case 'image':
      return <ImageEditor w={w} state={state} setConfig={setConfig} />;
    case 'exp':
      return <p className="hint">Type your current EXP % into the widget whenever you like; rate and time-to-level update automatically. Level ups are detected when the % drops.</p>;
    case 'session':
      return <p className="hint">No settings. Start/pause/reset from the widget.</p>;
  }
}
