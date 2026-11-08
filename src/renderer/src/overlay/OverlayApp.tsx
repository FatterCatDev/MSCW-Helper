import { useEffect, useRef, type ReactNode } from 'react';
import { Rnd } from 'react-rnd';
import { WIDGET_LABELS } from '../../../shared/defaults.ts';
import { bossNextAt, dailyKey, nextScheduled } from '../../../shared/time.ts';
import { WIDGET_TYPES, type AppState, type Placement, type PotionStatus, type WidgetDef, type WidgetType } from '../../../shared/types.ts';
import { beep, useAppState, useNow, type Dispatch } from '../common/state.ts';
import { WidgetContent } from '../widgets/index.tsx';
import { DebugWidget } from './DebugWidget.tsx';
import { formatDuration, formatNumber } from '../../../shared/time.ts';
import { trainingElapsed } from '../../../shared/training-time.ts';

const INTERACTIVE = '.widget-rnd, .debug-rnd, [data-interactive]';
const EDITABLE = 'input:not([type=checkbox]):not([type=range]):not([type=button]), textarea, select';

/** Lets clicks on empty overlay space fall through to the game; only widgets capture the mouse. */
function useMousePassthrough(): void {
  useEffect(() => {
    let ignoring: boolean | null = null;
    const set = (v: boolean): void => {
      if (v === ignoring) return;
      ignoring = v;
      window.mscw.setIgnoreMouse(v);
    };
    const onMove = (e: MouseEvent): void => {
      // Never release the mouse mid-drag/resize, even if the cursor outruns the widget.
      if (e.buttons !== 0 && ignoring === false) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      set(!el?.closest(INTERACTIVE));
    };
    const onLeave = (): void => set(true);
    set(true);
    window.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);
}

/**
 * The overlay window is non-focusable so clicking widgets never steals keyboard focus from the game.
 * Text fields temporarily make it focusable while you type.
 */
function useFocusableInputs(): void {
  useEffect(() => {
    let focusable = false;
    const set = (v: boolean): void => {
      if (v === focusable) return;
      focusable = v;
      window.mscw.setFocusable(v);
    };
    const onDown = (e: PointerEvent): void => {
      if (e.target instanceof Element && e.target.closest(EDITABLE)) set(true);
    };
    const onFocusOut = (): void => {
      setTimeout(() => {
        if (!document.activeElement?.matches(EDITABLE)) set(false);
      }, 0);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('focusout', onFocusOut);
    };
  }, []);
}

/** Sounds, repeating timers and daily checklist resets. Runs only in the overlay so it fires once. */
function useAlerts(state: AppState | null, dispatch: Dispatch, now: number): void {
  const prevRef = useRef(now);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = now;
    if (!state || now <= prev) return;
    const sound = state.settings.soundEnabled;
    let warn = false;
    let done = false;
    const crossed = (t: number | null | undefined): boolean => t != null && t > prev && t <= now;

    for (const id of state.widgetOrder) {
      const w = state.widgets[id];
      if (!w) continue;
      if (w.type === 'timers') {
        for (const t of w.config.timers) {
          const endsAt = w.data.endsAt[t.id];
          if (endsAt === undefined) continue;
          if (crossed(endsAt)) {
            done = true;
            if (t.repeat) dispatch({ type: 'timer/start', id: w.id, timerId: t.id, at: endsAt });
          } else if (w.config.warnSec > 0 && crossed(endsAt - w.config.warnSec * 1000)) {
            warn = true;
          }
        }
      } else if (w.type === 'boss') {
        const warnMs = w.config.warnMin * 60_000;
        for (const e of w.config.entries) {
          if (e.kind === 'schedule') {
            const at = nextScheduled(e.times, prev);
            if (at !== null && at <= now) done = true;
            const warnAt = warnMs > 0 ? nextScheduled(e.times, prev + warnMs) : null;
            if (warnAt !== null && warnAt <= now + warnMs) warn = true;
          } else {
            const at = bossNextAt(e, w.data.nextAt[e.id], now);
            if (crossed(at)) done = true;
            else if (at !== null && warnMs > 0 && crossed(at - warnMs)) warn = true;
          }
        }
      } else if (w.type === 'notes' && w.config.autoResetDaily) {
        const key = dailyKey(now, w.config.resetHourUtc);
        if (key !== w.data.lastResetKey) dispatch({ type: 'notes/dailyReset', id: w.id, key });
      }
    }
    if (sound && done) beep(3, 988);
    else if (sound && warn) beep(1, 660);
  }, [now, state, dispatch]);
}

function WidgetFrame(props: { w: WidgetDef; p: Placement; z: number; edit: boolean; dispatch: Dispatch; now: number; potionStatus: PotionStatus | undefined; state: AppState }): ReactNode {
  const { w, p, z, edit, dispatch, now } = props;
  return (
    <Rnd
      className={`widget-rnd ${edit ? 'editing' : ''}`}
      size={{ width: p.w, height: p.h }}
      position={{ x: p.x, y: p.y }}
      bounds="parent"
      disableDragging={!edit}
      enableResizing={edit}
      dragGrid={[4, 4]}
      resizeGrid={[4, 4]}
      minWidth={120}
      minHeight={60}
      cancel=".no-drag"
      style={{ zIndex: z }}
      onDragStart={() => dispatch({ type: 'widget/front', id: w.id })}
      onDragStop={(_e, d) => dispatch({ type: 'placement/set', id: w.id, patch: { x: Math.round(d.x), y: Math.round(d.y) } })}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        dispatch({ type: 'placement/set', id: w.id, patch: { w: ref.offsetWidth, h: ref.offsetHeight, x: Math.round(pos.x), y: Math.round(pos.y) } })
      }
    >
      <div className={`widget widget-${w.type}`} style={{ ['--bg-alpha' as string]: p.opacity }}>
        <div className="widget-header">
          <span className="widget-title">{w.title}</span>
          {edit && (
            <span className="widget-tools no-drag">
              <button className="icon" title="Settings" onClick={() => window.mscw.openControl(w.id)}>
                ⚙
              </button>
              <button className="icon" title="Hide in this layout" onClick={() => dispatch({ type: 'placement/set', id: w.id, patch: { visible: false } })}>
                ✕
              </button>
            </span>
          )}
        </div>
        <div className="widget-content" style={{ zoom: p.scale }}>
          <WidgetContent w={w} dispatch={dispatch} now={now} potionStatus={props.potionStatus} state={props.state} />
        </div>
        {edit && <div className="edit-shield" />}
      </div>
    </Rnd>
  );
}

function EditToolbar({ state, dispatch }: { state: AppState; dispatch: Dispatch }): ReactNode {
  const profile = state.profiles.find((p) => p.id === state.activeProfileId)!;
  const hidden = state.widgetOrder.filter((id) => state.widgets[id]?.type !== 'exp' &&
    state.widgets[id]?.type !== 'meso' && !profile.placements[id]?.visible);
  return (
    <div className="edit-toolbar" data-interactive>
      <strong>Editing layout</strong>
      <select value={state.activeProfileId} onChange={(e) => dispatch({ type: 'profile/activate', id: e.target.value })}>
        {state.profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith('show:')) dispatch({ type: 'placement/set', id: v.slice(5), patch: { visible: true } });
          else if (v.startsWith('add:')) dispatch({ type: 'widget/add', widgetType: v.slice(4) as WidgetType });
          e.currentTarget.blur();
        }}
      >
        <option value="">+ Add / show widget…</option>
        {hidden.length > 0 && (
          <optgroup label="Show hidden widget">
            {hidden.map((id) => (
              <option key={id} value={`show:${id}`}>
                {state.widgets[id]?.title}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Create new widget">
          {WIDGET_TYPES.filter(t => t !== 'exp' && t !== 'meso').map((t) => (
            <option key={t} value={`add:${t}`}>
              {WIDGET_LABELS[t]}
            </option>
          ))}
        </optgroup>
      </select>
      <button className="ghost" onClick={() => window.mscw.openControl()}>
        Control panel
      </button>
      <button onClick={() => window.mscw.setEditMode(false)}>Done{state.settings.hotkeys.toggleEdit && <kbd>{state.settings.hotkeys.toggleEdit}</kbd>}</button>
    </div>
  );
}

export function OverlayApp(): ReactNode {
  const [state, dispatch] = useAppState();
  const now = useNow(250);
  useMousePassthrough();
  useFocusableInputs();
  useAlerts(state, dispatch, now);

  if (!state) return null;
  const edit = state.runtime.editMode;
  const profile = state.profiles.find((p) => p.id === state.activeProfileId);
  const map = state.runtime.map;
  const onlyPrompt = state.runtime.gameTracking.running && (map.state === 'missing' || map.state === 'searching' || map.state === 'reading');
  const onlySummary = state.runtime.gameTracking.running && map.state === 'safe';
  const exp = state.widgets[state.settings.gameTracking.expWidgetId];
  const meso = state.widgets[state.settings.gameTracking.mesoWidgetId];
  const training = Object.values(state.widgets).find(w =>
    w.type === 'training' && w.config.expId === state.settings.gameTracking.expWidgetId);
  const first = meso?.type === 'meso' ? meso.data.samples[0] : undefined;
  const last = meso?.type === 'meso' ? meso.data.samples.at(-1) : undefined;
  const mesoDelta = first && last ? last.value - first.value : null;

  return (
    <div className={`overlay-root ${edit ? 'edit' : ''}`}>
      {onlyPrompt && <div className="map-notice" role="status">{map.state === 'missing'
        ? 'Click the + icon on the minimap until the map name is visible.' : map.message}</div>}
      {onlySummary && <Rnd className={`widget-rnd safe-summary-rnd ${edit ? 'editing' : ''}`}
        size={{ width: 280, height: 'auto' }}
        position={profile?.safeSummaryPosition ?? { x: Math.max(0, window.innerWidth - 296), y: 16 }}
        bounds="parent" disableDragging={!edit} enableResizing={false} dragGrid={[4, 4]}
        onDragStop={(_event, position) => dispatch({ type: 'safe-summary/move', x: position.x, y: position.y })}>
        <div className="map-notice safe-summary" role="status">
          <strong>SAFE AREA</strong>
          <div>{map.name}</div>
          <div className="hint">{map.source === 'shop' ? 'Shop identified from minimap' : 'Estimated from GMS map data'}</div>
          <div>Session EXP: {exp?.type === 'exp' && exp.data.startedAt !== null ? formatNumber(exp.data.gained) : '—'}</div>
          <div>Training time: {training?.type === 'training' ? formatDuration(trainingElapsed(training.data, now), true) : '—'}</div>
          <div>Session mesos: {mesoDelta === null ? '—' :
            `${mesoDelta > 0 ? '+' : ''}${formatNumber(mesoDelta)}`}</div>
          {state.runtime.inventory.state !== 'open' && <div className="hint">{state.runtime.inventory.message}</div>}
        </div>
      </Rnd>}
      {!onlyPrompt && !onlySummary && (map.state === 'unknown' || state.runtime.inventory.state !== 'open') &&
        <div className="map-notice" role="status">
          {map.state === 'unknown' && <div>Map safety unknown: {map.message}</div>}
          {state.runtime.inventory.state !== 'open' && <div>{state.runtime.inventory.message}</div>}
        </div>}
      {!onlyPrompt && !onlySummary && state.settings.gameTracking.sourceId && <div className="capture-fps">
        Capture: {state.runtime.gameTracking.fps.toFixed(1)} / 30 FPS
        {!state.runtime.gameTracking.running && ' (stopped)'}
      </div>}
      {!onlyPrompt && !onlySummary && edit && <EditToolbar state={state} dispatch={dispatch} />}
      {onlySummary && edit && profile && <div className="edit-toolbar" data-interactive>
        <strong>Editing layout</strong>
        <select aria-label="Layout" value={state.activeProfileId}
          onChange={event => dispatch({ type: 'profile/activate', id: event.target.value })}>
          {state.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => window.mscw.setEditMode(false)}>Done{state.settings.hotkeys.toggleEdit && <kbd>{state.settings.hotkeys.toggleEdit}</kbd>}</button>
      </div>}
      {!onlyPrompt && !onlySummary && state.runtime.debugMode && <DebugWidget runtime={state.runtime} />}
      {!onlyPrompt && profile &&
        state.widgetOrder.map((id, i) => {
          const w = state.widgets[id];
          const p = profile.placements[id];
          if (!w || w.type === 'exp' || w.type === 'meso' || !p?.visible) return null;
          if (onlySummary && w.type !== 'session') return null;
          return <WidgetFrame key={id} w={w} p={p} z={i + 1} edit={edit} dispatch={dispatch} now={now} potionStatus={state.runtime.potionTracking[id]} state={state} />;
        })}
    </div>
  );
}
