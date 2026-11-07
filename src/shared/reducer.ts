import type { HotkeyAction, Placement, PersistedState, Settings, WidgetDef, WidgetType } from './types.ts';
import { HOTKEY_ACTIONS, WIDGET_TYPES } from './types.ts';
import { clampPlacement, createWidget, defaultPlacement, newId } from './defaults.ts';

export type Action =
  | { type: 'widget/add'; widgetType: WidgetType }
  | { type: 'widget/remove'; id: string }
  | { type: 'widget/rename'; id: string; title: string }
  | { type: 'widget/config'; id: string; config: Record<string, unknown> }
  | { type: 'widget/data'; id: string; data: Record<string, unknown> }
  | { type: 'widget/front'; id: string }
  | { type: 'placement/set'; id: string; patch: Partial<Placement> }
  | { type: 'profile/create'; name: string; copyFromId?: string }
  | { type: 'profile/rename'; id: string; name: string }
  | { type: 'profile/delete'; id: string }
  | { type: 'profile/activate'; id: string }
  | { type: 'profile/next' }
  | { type: 'settings/set'; patch: Partial<Omit<Settings, 'hotkeys'>> }
  | { type: 'settings/hotkey'; action: HotkeyAction; accelerator: string }
  | { type: 'rate/sample'; id: string; value: number; at: number }
  | { type: 'rate/reset'; id: string }
  | { type: 'session/toggle'; id: string; at: number }
  | { type: 'session/reset'; id: string }
  | { type: 'timer/start'; id: string; timerId: string; at: number }
  | { type: 'timer/stop'; id: string; timerId: string }
  | { type: 'boss/mark'; id: string; entryId: string; at: number }
  | { type: 'boss/clear'; id: string; entryId: string }
  | { type: 'kills/add'; id: string; delta: number; at: number }
  | { type: 'kills/reset'; id: string }
  | { type: 'notes/dailyReset'; id: string; key: string };

export const ACTION_TYPES: ReadonlySet<string> = new Set<Action['type']>([
  'widget/add', 'widget/remove', 'widget/rename', 'widget/config', 'widget/data', 'widget/front',
  'placement/set', 'profile/create', 'profile/rename', 'profile/delete', 'profile/activate', 'profile/next',
  'settings/set', 'settings/hotkey', 'rate/sample', 'rate/reset', 'session/toggle', 'session/reset',
  'timer/start', 'timer/stop', 'boss/mark', 'boss/clear', 'kills/add', 'kills/reset', 'notes/dailyReset'
]);

export function isAction(v: unknown): v is Action {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string' && ACTION_TYPES.has((v as { type: string }).type);
}

/** An EXP % drop larger than this between samples is treated as a level up. */
export const LEVEL_UP_DROP = 5;

const SETTINGS_KEYS = ['displayId', 'clickThrough', 'overlayVisible', 'soundEnabled', 'launchAtLogin'] as const;

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function updateWidget<T extends WidgetType>(
  state: PersistedState,
  id: string,
  type: T | null,
  fn: (w: WidgetDef<T>) => WidgetDef<T>
): PersistedState {
  const w = state.widgets[id];
  if (!w || (type !== null && w.type !== type)) return state;
  const next = fn(w as WidgetDef<T>) as WidgetDef;
  return next === w ? state : { ...state, widgets: { ...state.widgets, [id]: next } };
}

export function reducer(state: PersistedState, action: Action): PersistedState {
  switch (action.type) {
    case 'widget/add': {
      if (!WIDGET_TYPES.includes(action.widgetType)) return state;
      const w = createWidget(action.widgetType);
      const index = state.widgetOrder.length;
      const placement = defaultPlacement(w.type, index);
      return {
        ...state,
        widgets: { ...state.widgets, [w.id]: w },
        widgetOrder: [...state.widgetOrder, w.id],
        profiles: state.profiles.map((p) => ({
          ...p,
          placements: { ...p.placements, [w.id]: { ...placement, visible: p.id === state.activeProfileId } }
        }))
      };
    }
    case 'widget/remove': {
      if (!state.widgets[action.id]) return state;
      const { [action.id]: _removed, ...widgets } = state.widgets;
      return {
        ...state,
        widgets,
        widgetOrder: state.widgetOrder.filter((id) => id !== action.id),
        profiles: state.profiles.map((p) => {
          const { [action.id]: _gone, ...placements } = p.placements;
          return { ...p, placements };
        })
      };
    }
    case 'widget/rename':
      return updateWidget(state, action.id, null, (w) => ({ ...w, title: String(action.title).slice(0, 60) }));
    case 'widget/config':
      return updateWidget(state, action.id, null, (w) => ({ ...w, config: { ...w.config, ...action.config } }) as WidgetDef);
    case 'widget/data':
      return updateWidget(state, action.id, null, (w) => ({ ...w, data: { ...w.data, ...action.data } }) as WidgetDef);
    case 'widget/front': {
      if (!state.widgets[action.id] || state.widgetOrder.at(-1) === action.id) return state;
      return { ...state, widgetOrder: [...state.widgetOrder.filter((id) => id !== action.id), action.id] };
    }
    case 'placement/set': {
      const w = state.widgets[action.id];
      if (!w) return state;
      return {
        ...state,
        profiles: state.profiles.map((p) => {
          if (p.id !== state.activeProfileId) return p;
          const current = p.placements[action.id] ?? { ...defaultPlacement(w.type, state.widgetOrder.indexOf(w.id)), visible: false };
          return { ...p, placements: { ...p.placements, [action.id]: clampPlacement({ ...current, ...action.patch }, current) } };
        })
      };
    }
    case 'profile/create': {
      const source = state.profiles.find((p) => p.id === (action.copyFromId ?? state.activeProfileId));
      const profile = {
        id: newId(),
        name: String(action.name || 'New layout').slice(0, 40),
        placements: source ? structuredClone(source.placements) : {}
      };
      return { ...state, profiles: [...state.profiles, profile], activeProfileId: profile.id };
    }
    case 'profile/rename':
      return {
        ...state,
        profiles: state.profiles.map((p) => (p.id === action.id ? { ...p, name: String(action.name).slice(0, 40) } : p))
      };
    case 'profile/delete': {
      if (state.profiles.length <= 1) return state;
      const profiles = state.profiles.filter((p) => p.id !== action.id);
      if (profiles.length === state.profiles.length) return state;
      const activeProfileId = state.activeProfileId === action.id ? profiles[0]!.id : state.activeProfileId;
      return { ...state, profiles, activeProfileId };
    }
    case 'profile/activate':
      return state.profiles.some((p) => p.id === action.id) ? { ...state, activeProfileId: action.id } : state;
    case 'profile/next': {
      const i = state.profiles.findIndex((p) => p.id === state.activeProfileId);
      const next = state.profiles[(i + 1) % state.profiles.length]!;
      return { ...state, activeProfileId: next.id };
    }
    case 'settings/set': {
      const settings: Settings = { ...state.settings };
      for (const key of SETTINGS_KEYS) {
        if (!(key in action.patch)) continue;
        const v = action.patch[key];
        if (key === 'displayId') {
          if (v === null || finite(v)) settings.displayId = v as number | null;
        } else if (typeof v === 'boolean') {
          settings[key] = v;
        }
      }
      return { ...state, settings };
    }
    case 'settings/hotkey':
      if (!HOTKEY_ACTIONS.includes(action.action)) return state;
      return {
        ...state,
        settings: { ...state.settings, hotkeys: { ...state.settings.hotkeys, [action.action]: String(action.accelerator) } }
      };
    case 'rate/sample': {
      if (!finite(action.value) || !finite(action.at)) return state;
      const w = state.widgets[action.id];
      if (w?.type === 'exp') {
        return updateWidget(state, action.id, 'exp', (e) => {
          const pct = Math.min(100, Math.max(0, action.value));
          let { levelOffset, levelUps } = e.data;
          const last = e.data.samples.at(-1);
          if (last && last.value - levelOffset - pct > LEVEL_UP_DROP) {
            levelOffset += 100;
            levelUps += 1;
          }
          const samples = [...e.data.samples, { t: action.at, value: pct + levelOffset }].slice(-500);
          return { ...e, data: { samples, levelOffset, levelUps } };
        });
      }
      return updateWidget(state, action.id, 'meso', (m) => ({
        ...m,
        data: { samples: [...m.data.samples, { t: action.at, value: Math.max(0, action.value) }].slice(-500) }
      }));
    }
    case 'rate/reset': {
      const w = state.widgets[action.id];
      if (w?.type === 'exp') return updateWidget(state, action.id, 'exp', (e) => ({ ...e, data: { samples: [], levelOffset: 0, levelUps: 0 } }));
      return updateWidget(state, action.id, 'meso', (m) => ({ ...m, data: { samples: [] } }));
    }
    case 'session/toggle':
      return updateWidget(state, action.id, 'session', (s) => {
        const d = s.data;
        if (d.running) return { ...s, data: { running: false, startedAt: 0, accumulatedMs: d.accumulatedMs + Math.max(0, action.at - d.startedAt) } };
        return { ...s, data: { ...d, running: true, startedAt: action.at } };
      });
    case 'session/reset':
      return updateWidget(state, action.id, 'session', (s) => ({ ...s, data: { running: false, startedAt: 0, accumulatedMs: 0 } }));
    case 'timer/start':
      return updateWidget(state, action.id, 'timers', (t) => {
        const entry = t.config.timers.find((x) => x.id === action.timerId);
        if (!entry) return t;
        return { ...t, data: { endsAt: { ...t.data.endsAt, [entry.id]: action.at + entry.durationSec * 1000 } } };
      });
    case 'timer/stop':
      return updateWidget(state, action.id, 'timers', (t) => {
        const { [action.timerId]: _stopped, ...endsAt } = t.data.endsAt;
        return { ...t, data: { endsAt } };
      });
    case 'boss/mark':
      return updateWidget(state, action.id, 'boss', (b) => {
        const entry = b.config.entries.find((x) => x.id === action.entryId);
        if (!entry || entry.kind !== 'respawn') return b;
        return { ...b, data: { nextAt: { ...b.data.nextAt, [entry.id]: action.at + entry.respawnMin * 60_000 } } };
      });
    case 'boss/clear':
      return updateWidget(state, action.id, 'boss', (b) => {
        const { [action.entryId]: _cleared, ...nextAt } = b.data.nextAt;
        return { ...b, data: { nextAt } };
      });
    case 'kills/add':
      return updateWidget(state, action.id, 'kills', (k) => {
        if (!finite(action.delta)) return k;
        const count = Math.max(0, k.data.count + Math.trunc(action.delta));
        return { ...k, data: { count, startedAt: k.data.startedAt || action.at } };
      });
    case 'kills/reset':
      return updateWidget(state, action.id, 'kills', (k) => ({ ...k, data: { count: 0, startedAt: 0 } }));
    case 'notes/dailyReset':
      return updateWidget(state, action.id, 'notes', (n) =>
        n.data.lastResetKey === action.key
          ? n
          : { ...n, data: { ...n.data, lastResetKey: action.key, items: n.data.items.map((i) => ({ ...i, done: false })) } }
      );
    default:
      return state;
  }
}
