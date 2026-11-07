import { useEffect, useState, type ReactNode } from 'react';
import { WIDGET_LABELS, defaultPlacement } from '../../../shared/defaults.ts';
import { HOTKEY_ACTIONS, WIDGET_TYPES, type AppState, type HotkeyAction, type WidgetType } from '../../../shared/types.ts';
import { useAppState, type Dispatch } from '../common/state.ts';
import { Field, NumberField, Slider, TextField, Toggle } from './fields.tsx';
import { HotkeyInput } from './HotkeyInput.tsx';
import { WidgetConfigEditor } from './WidgetEditors.tsx';
import { GameAssets } from './GameAssets.tsx';
import { GameTrackingSettings } from './GameTracking.tsx';

type Tab = 'widgets' | 'layouts' | 'settings' | 'about';

const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  toggleOverlay: 'Show / hide overlay',
  toggleEdit: 'Edit layout mode',
  toggleClickThrough: 'Click-through mode',
  openControl: 'Open control panel',
  nextProfile: 'Next layout'
};

function WidgetsTab({ state, dispatch, selected, setSelected }: { state: AppState; dispatch: Dispatch; selected: string | null; setSelected: (id: string) => void }): ReactNode {
  const profile = state.profiles.find((p) => p.id === state.activeProfileId)!;
  const w = selected ? state.widgets[selected] : undefined;
  const index = w ? state.widgetOrder.indexOf(w.id) : 0;
  const p = w ? (profile.placements[w.id] ?? { ...defaultPlacement(w.type, index), visible: false }) : undefined;

  return (
    <div className="split">
      <aside className="list-pane">
        <select
          className="add-select"
          value=""
          onChange={(e) => {
            if (e.target.value) dispatch({ type: 'widget/add', widgetType: e.target.value as WidgetType });
          }}
        >
          <option value="">+ Add widget…</option>
          {WIDGET_TYPES.map((t) => (
            <option key={t} value={t}>
              {WIDGET_LABELS[t]}
            </option>
          ))}
        </select>
        <ul className="widget-list">
          {state.widgetOrder.map((id) => {
            const item = state.widgets[id];
            if (!item) return null;
            const visible = profile.placements[id]?.visible ?? false;
            return (
              <li key={id} className={id === selected ? 'selected' : ''} onClick={() => setSelected(id)}>
                <input
                  type="checkbox"
                  title="Visible in this layout"
                  checked={visible}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => dispatch({ type: 'placement/set', id, patch: { visible: e.target.checked } })}
                />
                <span className="widget-list-title">{item.title}</span>
                <span className="hint">{item.title !== WIDGET_LABELS[item.type] ? WIDGET_LABELS[item.type] : ''}</span>
              </li>
            );
          })}
        </ul>
        {state.widgetOrder.length === 0 && <p className="hint">No widgets yet — add one above.</p>}
      </aside>
      <section className="detail-pane">
        {!w || !p ? (
          <p className="hint">Select a widget to configure it.</p>
        ) : (
          <>
            <div className="detail-header">
              <TextField className="title-input" value={w.title} maxLength={60} onCommit={(title) => dispatch({ type: 'widget/rename', id: w.id, title })} />
              <span className="hint">{WIDGET_LABELS[w.type]}</span>
            </div>
            <h3>Appearance in “{profile.name}”</h3>
            <Toggle checked={p.visible} onChange={(visible) => dispatch({ type: 'placement/set', id: w.id, patch: { visible } })} label="Visible in this layout" />
            <Field label="Background opacity">
              <Slider value={p.opacity} min={0.1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => dispatch({ type: 'placement/set', id: w.id, patch: { opacity } })} />
            </Field>
            <Field label="Content scale">
              <Slider value={p.scale} min={0.5} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(scale) => dispatch({ type: 'placement/set', id: w.id, patch: { scale } })} />
            </Field>
            <Field label="Position / size" hint="Or drag & resize in edit mode.">
              <span className="xywh">
                {(['x', 'y', 'w', 'h'] as const).map((k) => (
                  <label key={k}>
                    {k.toUpperCase()} <NumberField className="short" value={p[k]} min={-5000} max={20000} onCommit={(v) => dispatch({ type: 'placement/set', id: w.id, patch: { [k]: Math.round(v) } })} />
                  </label>
                ))}
              </span>
            </Field>
            <div className="row-left">
              <button className="ghost" onClick={() => dispatch({ type: 'widget/front', id: w.id })}>
                Bring to front
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (confirm(`Delete “${w.title}” from all layouts? Its data will be lost.`)) dispatch({ type: 'widget/remove', id: w.id });
                }}
              >
                Delete widget
              </button>
            </div>
            <h3>Settings</h3>
            <WidgetConfigEditor w={w} state={state} dispatch={dispatch} />
          </>
        )}
      </section>
    </div>
  );
}

function LayoutsTab({ state, dispatch }: { state: AppState; dispatch: Dispatch }): ReactNode {
  return (
    <div className="page">
      <p className="hint">
        A layout stores which widgets are shown and where. Widgets and their data (notes, timers, counters) are shared between layouts. Switch layouts here, from the tray icon, or with the “Next layout” hotkey.
      </p>
      <table className="entries layouts">
        <tbody>
          {state.profiles.map((p) => {
            const active = p.id === state.activeProfileId;
            const shown = Object.values(p.placements).filter((x) => x.visible).length;
            return (
              <tr key={p.id} className={active ? 'active' : ''}>
                <td>
                  <input type="radio" checked={active} onChange={() => dispatch({ type: 'profile/activate', id: p.id })} />
                </td>
                <td>
                  <TextField value={p.name} maxLength={40} onCommit={(name) => dispatch({ type: 'profile/rename', id: p.id, name })} />
                </td>
                <td className="hint">{shown} widgets shown</td>
                <td>
                  <button className="ghost small" onClick={() => dispatch({ type: 'profile/create', name: `${p.name} copy`, copyFromId: p.id })}>
                    Duplicate
                  </button>
                </td>
                <td>
                  <button
                    className="icon"
                    title="Delete layout"
                    disabled={state.profiles.length <= 1}
                    onClick={() => confirm(`Delete layout “${p.name}”?`) && dispatch({ type: 'profile/delete', id: p.id })}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row-left">
        <button onClick={() => dispatch({ type: 'profile/create', name: `Layout ${state.profiles.length + 1}` })}>+ New layout (copy of current)</button>
        <button className="ghost" onClick={() => window.mscw.setEditMode(true)}>
          Edit current layout on screen
        </button>
      </div>
    </div>
  );
}

function SettingsTab({ state, dispatch }: { state: AppState; dispatch: Dispatch }): ReactNode {
  const s = state.settings;
  return (
    <div className="page">
      <h3>Global hotkeys</h3>
      <p className="hint">Global hotkeys work while the game has focus, but the game will no longer receive those key combinations.</p>
      {HOTKEY_ACTIONS.map((a) => (
        <Field key={a} label={HOTKEY_LABELS[a]}>
          <HotkeyInput value={s.hotkeys[a]} error={s.hotkeys[a] ? state.runtime.hotkeyErrors[s.hotkeys[a]] : undefined} onChange={(accelerator) => dispatch({ type: 'settings/hotkey', action: a, accelerator })} />
        </Field>
      ))}
      <h3>Overlay</h3>
      <Field label="Display" hint="Which monitor the overlay covers (put it on the game's monitor).">
        <select value={s.displayId ?? ''} onChange={(e) => dispatch({ type: 'settings/set', patch: { displayId: e.target.value === '' ? null : Number(e.target.value) } })}>
          <option value="">Primary display</option>
          {state.runtime.displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {d.primary ? ' — primary' : ''}
            </option>
          ))}
        </select>
      </Field>
      <Toggle checked={s.overlayVisible} onChange={(overlayVisible) => dispatch({ type: 'settings/set', patch: { overlayVisible } })} label="Show overlay" />
      <Toggle
        checked={s.clickThrough}
        onChange={(clickThrough) => dispatch({ type: 'settings/set', patch: { clickThrough } })}
        label="Click-through: widgets ignore the mouse entirely (use hotkeys to interact)"
      />
      <Toggle checked={s.soundEnabled} onChange={(soundEnabled) => dispatch({ type: 'settings/set', patch: { soundEnabled } })} label="Sound alerts for timers" />
      <GameTrackingSettings state={state} dispatch={dispatch} />
      <GameAssets path={s.gameDataPath} dispatch={dispatch} />
      <h3>App</h3>
      <Toggle checked={s.launchAtLogin} onChange={(launchAtLogin) => dispatch({ type: 'settings/set', patch: { launchAtLogin } })} label="Launch at Windows sign-in (installed app only)" />
      <div className="row-left">
        <button className="danger" onClick={() => window.mscw.quit()}>
          Quit MSCW Helper
        </button>
      </div>
    </div>
  );
}

function AboutTab(): ReactNode {
  return (
    <div className="page about">
      <h2>MSCW Helper</h2>
      <p>A customizable always-on-top overlay for MapleStory Classic World.</p>
      <h3>Tips</h3>
      <ul>
        <li>Run the game in windowed or borderless-windowed mode; exclusive fullscreen hides all overlays.</li>
        <li>Use <b>Edit layout</b> to drag and resize widgets. Empty space always passes clicks to the game.</li>
        <li>Clicking widget buttons doesn't take focus from the game. Typing into a widget does — click the game again afterwards.</li>
        <li>Closing this window keeps MSCW Helper running in the tray. Quit from the tray menu.</li>
      </ul>
      <h3>Roadmap</h3>
      <ul>
        <li>Automatic gain-notification and potion OCR are experimental; verify compatibility with the game's rules.</li>
      </ul>
    </div>
  );
}

export function ControlApp(): ReactNode {
  const [state, dispatch] = useAppState();
  const [tab, setTab] = useState<Tab>('widgets');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(
    () =>
      window.mscw.onFocusWidget((id) => {
        setTab('widgets');
        setSelected(id);
      }),
    []
  );

  useEffect(() => {
    if (state && (!selected || !state.widgets[selected])) setSelected(state.widgetOrder[0] ?? null);
  }, [state, selected]);

  if (!state) return <div className="loading">Loading…</div>;
  const s = state.settings;

  return (
    <div className="control">
      <header className="topbar">
        <span className="brand">
          <span className="logo">M</span> MSCW Helper
        </span>
        <nav>
          {(['widgets', 'layouts', 'settings', 'about'] as const).map((t) => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="quick">
          <select value={state.activeProfileId} title="Active layout" onChange={(e) => dispatch({ type: 'profile/activate', id: e.target.value })}>
            {state.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className={state.runtime.editMode ? '' : 'ghost'} onClick={() => window.mscw.setEditMode(!state.runtime.editMode)}>
            {state.runtime.editMode ? 'Finish editing' : 'Edit layout'}
          </button>
          <button className={s.overlayVisible ? 'ghost' : ''} onClick={() => dispatch({ type: 'settings/set', patch: { overlayVisible: !s.overlayVisible } })}>
            {s.overlayVisible ? 'Hide overlay' : 'Show overlay'}
          </button>
        </div>
      </header>
      <main>
        {tab === 'widgets' && <WidgetsTab state={state} dispatch={dispatch} selected={selected} setSelected={setSelected} />}
        {tab === 'layouts' && <LayoutsTab state={state} dispatch={dispatch} />}
        {tab === 'settings' && <SettingsTab state={state} dispatch={dispatch} />}
        {tab === 'about' && <AboutTab />}
      </main>
    </div>
  );
}
