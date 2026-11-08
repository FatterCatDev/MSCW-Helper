import type { HotkeyAction, Placement, PersistedState, RecoveryEvent, Settings, WidgetDef, WidgetType } from './types.ts';
import { NPC_RECOVERY_ITEMS } from './npc-recovery-prices.ts';
import { HOTKEY_ACTIONS, WIDGET_TYPES } from './types.ts';
import { clampPlacement, createWidget, createTrainingWidgets, defaultData, defaultPlacement, newId } from './defaults.ts';
import { retainRateWindow } from './time.ts';
import { isGameTrackingConfig } from './game-tracking.ts';

export type Action =
  | { type: 'widget/add'; widgetType: WidgetType }
  | { type: 'widget/remove'; id: string }
  | { type: 'widget/rename'; id: string; title: string }
  | { type: 'widget/config'; id: string; config: Record<string, unknown> }
  | { type: 'widget/data'; id: string; data: Record<string, unknown> }
  | { type: 'widget/front'; id: string }
  | { type: 'placement/set'; id: string; patch: Partial<Placement> }
  | { type: 'safe-summary/move'; x: number; y: number }
  | { type: 'profile/create'; name: string; copyFromId?: string }
  | { type: 'profile/rename'; id: string; name: string }
  | { type: 'profile/delete'; id: string }
  | { type: 'profile/activate'; id: string }
  | { type: 'profile/next' }
  | { type: 'settings/set'; patch: Partial<Omit<Settings, 'hotkeys'>> }
  | { type: 'settings/hotkey'; action: HotkeyAction; accelerator: string }
  | { type: 'rate/sample'; id: string; value: number; at: number }
  | { type: 'rate/reset'; id: string }
  | { type: 'training/reset'; id: string }
  | { type: 'exp/sample'; id: string; value: number; required: number; level: number; at: number }
  | { type: 'exp/status'; id: string; value: number; required: number; level: number; percent: number; at: number }
  | { type: 'exp/start'; id: string }
  | { type: 'tracking/start'; expId: string; mesoId: string; at: number }
  | { type: 'tracking/gain'; expId: string; mesoId: string; exp: number; mesos: number; items: { name: string; quantity: number }[]; at: number }
  | { type: 'loot/value'; id: string; name: string; unitValue: number; itemId: number | null }
  | { type: 'potion/used'; id: string; potionId: string; quantity: number }
  | { type: 'potion/reset'; id: string }
  | { type: 'recovery/event'; id: string; event: RecoveryEvent }
  | { type: 'recovery/resolve'; id: string; eventId: string; itemId: number; cost: number }
  | { type: 'session/toggle'; id: string; at: number }
  | { type: 'session/reset'; id: string }
  | { type: 'timer/start'; id: string; timerId: string; at: number }
  | { type: 'timer/stop'; id: string; timerId: string }
  | { type: 'boss/mark'; id: string; entryId: string; at: number }
  | { type: 'boss/clear'; id: string; entryId: string }
  | { type: 'notes/dailyReset'; id: string; key: string };

export const ACTION_TYPES: ReadonlySet<string> = new Set<Action['type']>([
  'widget/add', 'widget/remove', 'widget/rename', 'widget/config', 'widget/data', 'widget/front',
  'placement/set', 'safe-summary/move', 'profile/create', 'profile/rename', 'profile/delete', 'profile/activate', 'profile/next',
  'settings/set', 'settings/hotkey', 'rate/sample', 'rate/reset', 'training/reset', 'session/toggle', 'session/reset',
  'timer/start', 'timer/stop', 'boss/mark', 'boss/clear', 'notes/dailyReset',
  'exp/sample', 'exp/status', 'exp/start', 'potion/used', 'potion/reset', 'recovery/event', 'recovery/resolve', 'tracking/start', 'tracking/gain', 'loot/value'
]);

export function isAction(v: unknown): v is Action {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string' && ACTION_TYPES.has((v as { type: string }).type);
}

const SETTINGS_KEYS = ['displayId', 'clickThrough', 'overlayVisible', 'soundEnabled', 'launchAtLogin', 'gameDataPath', 'gameTracking'] as const;

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
      if (action.widgetType === 'training') {
        const { training, exp, meso } = createTrainingWidgets();
        return { ...state, widgets: { ...state.widgets, [training.id]: training, [exp.id]: exp, [meso.id]: meso },
          widgetOrder: [...state.widgetOrder, training.id, exp.id, meso.id],
          profiles: state.profiles.map(p => ({ ...p, placements: { ...p.placements,
            [training.id]: { ...defaultPlacement('training', state.widgetOrder.length), visible: p.id === state.activeProfileId },
            [exp.id]: { ...defaultPlacement('exp', 0), visible: false },
            [meso.id]: { ...defaultPlacement('meso', 0), visible: false } } })) };
      }
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
      const target = state.widgets[action.id];
      const removed = new Set([action.id, ...(target?.type === 'training' ? [target.config.expId, target.config.mesoId] : [])]);
      const widgets = Object.fromEntries(Object.entries(state.widgets).filter(([id]) => !removed.has(id)));
      return {
        ...state,
        widgets,
        widgetOrder: state.widgetOrder.filter((id) => !removed.has(id)),
        profiles: state.profiles.map((p) => {
          const placements = Object.fromEntries(Object.entries(p.placements).filter(([id]) => !removed.has(id)));
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
    case 'safe-summary/move':
      if (!finite(action.x) || !finite(action.y)) return state;
      return { ...state, profiles: state.profiles.map(p => p.id !== state.activeProfileId ? p : {
        ...p, safeSummaryPosition: {
          x: Math.max(-5000, Math.min(20000, Math.round(action.x))),
          y: Math.max(-5000, Math.min(20000, Math.round(action.y)))
        }
      }) };
    case 'profile/create': {
      const source = state.profiles.find((p) => p.id === (action.copyFromId ?? state.activeProfileId));
      const profile = {
        id: newId(),
        name: String(action.name || 'New layout').slice(0, 40),
        placements: source ? structuredClone(source.placements) : {},
        ...(source?.safeSummaryPosition ? { safeSummaryPosition: { ...source.safeSummaryPosition } } : {})
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
        } else if (key === 'gameDataPath') {
          if (typeof v === 'string' && v.trim()) settings.gameDataPath = v.trim();
        } else if (key === 'gameTracking') {
          if (isGameTrackingConfig(v)) settings.gameTracking = v;
          else console.error('[settings] Invalid game tracking configuration.');
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
      return updateWidget(state, action.id, 'meso', (m) => {
        if (m.data.samples.at(-1) && action.at <= m.data.samples.at(-1)!.t) return m;
        const samples = [...m.data.samples, { t: action.at, value: Math.max(0, action.value) }];
        const recent = retainRateWindow(samples, action.at);
        return { ...m, data: { ...m.data, samples: recent[0] === samples[0] ? recent : [samples[0]!, ...recent] } };
      });
    }
    case 'exp/start': {
      const exp = updateWidget(state, action.id, 'exp', e => ({ ...e, data: { ...defaultData('exp'), source: 'status-bar' } }));
      if (exp === state) return state;
      const training = Object.values(exp.widgets).find(w => w.type === 'training' && w.config.expId === action.id);
      return training?.type === 'training' ?
        updateWidget(exp, training.id, 'training', w => ({ ...w, data: defaultData('training') })) : exp;
    }
    case 'exp/sample':
    case 'exp/status':
      return updateWidget(state, action.id, 'exp', (e) => {
        if (e.data.source === 'notifications') return e;
        if (action.type === 'exp/sample' && e.data.source === 'status-bar') return e;
        if (action.type === 'exp/status' && (!Number.isFinite(action.percent) || action.percent < 0 || action.percent >= 100)) return e;
        if (![action.value, action.required, action.level, action.at].every(Number.isSafeInteger) ||
            action.value < 0 || action.required <= 0 || action.value >= action.required || action.level < 1 ||
            action.at < 0 || (e.data.samples.at(-1) && action.at <= e.data.samples.at(-1)!.t)) return e;
        const previous = e.data;
        if (previous.current !== null && (action.level < previous.level || action.level > previous.level + 1)) return e;
        const delta = previous.current === null ? 0 :
          action.level === previous.level ? action.value - previous.current : previous.required - previous.current + action.value;
        const gained = previous.gained + delta;
        if (!Number.isSafeInteger(gained)) return e;
        return { ...e, data: { unit: 'points', current: action.value, required: action.required, level: action.level,
          gained, startedAt: previous.startedAt ?? action.at, migrated: false,
          source: action.type === 'exp/status' ? 'status-bar' : 'manual',
          ...(action.type === 'exp/status' ? { percent: action.percent } : {}),
          samples: retainRateWindow([...previous.samples, { t: action.at, value: gained }], action.at) } };
      });
    case 'tracking/start': {
      if (!finite(action.at) || state.widgets[action.expId]?.type !== 'exp' || state.widgets[action.mesoId]?.type !== 'meso') return state;
      const exp = updateWidget(state, action.expId, 'exp', e => ({ ...e, data: { ...defaultData('exp'),
        source: 'notifications', startedAt: action.at, samples: [{ t: action.at, value: 0 }] } }));
      return updateWidget(exp, action.mesoId, 'meso', m => ({ ...m, data: { ...defaultData('meso'), trackingStartedAt: action.at } }));
    }
    case 'tracking/gain': {
      if (!Number.isSafeInteger(action.exp) || action.exp < 0 || !Number.isSafeInteger(action.mesos) || action.mesos < 0 || !finite(action.at)) return state;
      const exp = updateWidget(state, action.expId, 'exp', e => {
        if (e.data.source !== 'notifications' || action.at <= (e.data.samples.at(-1)?.t ?? -1)) return e;
        const gained = e.data.gained + action.exp;
        return { ...e, data: { ...e.data, gained,
          samples: retainRateWindow([...e.data.samples, { t: action.at, value: gained }], action.at) } };
      });
      return updateWidget(exp, action.mesoId, 'meso', m => {
        const loot = [...m.data.loot];
        for (const item of action.items) {
          if (!item.name.trim() || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) continue;
          const index = loot.findIndex(l => l.name.toLowerCase() === item.name.toLowerCase());
          if (index >= 0) loot[index] = { ...loot[index]!, quantity: loot[index]!.quantity + item.quantity };
          else loot.push({ name: item.name, quantity: item.quantity, unitValue: null, itemId: null });
        }
        return { ...m, data: { ...m.data, pickups: m.data.pickups + action.mesos, loot } };
      });
    }
    case 'loot/value':
      if (!Number.isSafeInteger(action.unitValue) || action.unitValue < 0) return state;
      return updateWidget(state, action.id, 'meso', m => ({ ...m, data: { ...m.data,
        loot: m.data.loot.map(l => l.name.toLowerCase() === action.name.toLowerCase() ?
          { ...l, unitValue: action.unitValue, itemId: action.itemId } : l) } }));
    case 'rate/reset': {
      const w = state.widgets[action.id];
      if (w?.type === 'exp') return updateWidget(state, action.id, 'exp', (e) => ({ ...e, data: defaultData('exp') }));
      return updateWidget(state, action.id, 'meso', (m) => ({ ...m, data: defaultData('meso') }));
    }
    case 'training/reset': {
      const training = state.widgets[action.id];
      if (!training || training.type !== 'training') return state;
      const reset = updateWidget(state, action.id, 'training', w => ({ ...w, data: defaultData('training') }));
      const exp = reducer(reset, { type: 'rate/reset', id: training.config.expId });
      return reducer(exp, { type: 'rate/reset', id: training.config.mesoId });
    }
    case 'potion/used':
      return updateWidget(state, action.id, 'meso', (m) => {
        const potion = m.config.potions.find(p => p.id === action.potionId);
        if (!potion || !Number.isSafeInteger(action.quantity) || action.quantity < 1 || action.quantity > 9999 ||
            !finite(potion.unitCost) || potion.unitCost <= 0) return m;
        return { ...m, data: { ...m.data, potionCosts: m.data.potionCosts + potion.unitCost * action.quantity,
          potionUses: { ...m.data.potionUses, [potion.id]: (m.data.potionUses[potion.id] ?? 0) + action.quantity } } };
      });
    case 'potion/reset':
      return updateWidget(state, action.id, 'meso', m => ({ ...m, data: { ...m.data, potionCosts: 0, potionUses: {}, recoveryEvents: [], unidentifiedRecoveries: 0 } }));
    case 'recovery/event':
      return updateWidget(state, action.id, 'meso', m => {
        const e = action.event;
        if (!e || typeof e.id !== 'string' || m.data.recoveryEvents.some(existing => existing.id === e.id) ||
            !finite(e.at) || !Number.isSafeInteger(e.hp) || !Number.isSafeInteger(e.mp) || e.hp < 0 || e.mp < 0 ||
            (e.hp <= 10 && e.mp <= 10) || !Array.isArray(e.candidates) || !e.candidates.every(id => !!NPC_RECOVERY_ITEMS[id]) ||
            typeof e.reason !== 'string' || (e.itemId !== null && !NPC_RECOVERY_ITEMS[e.itemId]) ||
            (e.cost !== null && (!Number.isSafeInteger(e.cost) || e.cost < 0)) || (e.itemId === null && e.cost !== null)) return m;
        const key = e.itemId === null ? null : m.config.potions.find(p => p.itemId === e.itemId)?.id ?? `recovery-${e.itemId}`;
        return { ...m, data: { ...m.data, recoveryEvents: [...m.data.recoveryEvents, e].slice(-200),
          unidentifiedRecoveries: m.data.unidentifiedRecoveries + Number(e.itemId === null),
          potionCosts: m.data.potionCosts + (e.cost ?? 0),
          potionUses: key === null ? m.data.potionUses : { ...m.data.potionUses, [key]: (m.data.potionUses[key] ?? 0) + 1 } } };
      });
    case 'recovery/resolve':
      return updateWidget(state, action.id, 'meso', m => {
        const e = m.data.recoveryEvents.find(event => event.id === action.eventId);
        if (!e || e.cost !== null || (e.itemId !== null && e.itemId !== action.itemId) || !NPC_RECOVERY_ITEMS[action.itemId] ||
            !Number.isSafeInteger(action.cost) || action.cost < 0) return m;
        const key = m.config.potions.find(p => p.itemId === action.itemId)?.id ?? `recovery-${action.itemId}`;
        return { ...m, data: { ...m.data, potionCosts: m.data.potionCosts + action.cost,
          unidentifiedRecoveries: m.data.unidentifiedRecoveries - Number(e.itemId === null),
          potionUses: e.itemId === null ? { ...m.data.potionUses, [key]: (m.data.potionUses[key] ?? 0) + 1 } : m.data.potionUses,
          recoveryEvents: m.data.recoveryEvents.map(event => event.id === e.id ? { ...event, itemId: action.itemId, cost: action.cost } : event) } };
      });
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
