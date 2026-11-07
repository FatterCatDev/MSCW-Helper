import type {
  LayoutProfile,
  PersistedState,
  Placement,
  Settings,
  WidgetConfigMap,
  WidgetDataMap,
  WidgetDef,
  WidgetType
} from './types.ts';
import { HOTKEY_ACTIONS, WIDGET_TYPES } from './types.ts';

export const WIDGET_LABELS: Record<WidgetType, string> = {
  exp: 'EXP Tracker',
  meso: 'Meso Tracker',
  session: 'Session Timer',
  timers: 'Buff / Cooldown Timers',
  boss: 'Boss / Event Timers',
  notes: 'Notes & Checklist',
  kills: 'Kill Counter',
  image: 'Image / Map Panel'
};

export const DEFAULT_SIZES: Record<WidgetType, { w: number; h: number }> = {
  exp: { w: 260, h: 190 },
  meso: { w: 260, h: 170 },
  session: { w: 220, h: 110 },
  timers: { w: 240, h: 200 },
  boss: { w: 260, h: 200 },
  notes: { w: 260, h: 260 },
  kills: { w: 220, h: 140 },
  image: { w: 320, h: 240 }
};

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function defaultConfig<T extends WidgetType>(type: T): WidgetConfigMap[T] {
  const configs: WidgetConfigMap = {
    exp: {},
    meso: { goal: 0 },
    session: {},
    timers: {
      warnSec: 10,
      timers: [
        { id: newId(), name: 'Buff 1', durationSec: 200, hotkey: '', color: '#4fc3f7', repeat: false },
        { id: newId(), name: 'Buff 2', durationSec: 120, hotkey: '', color: '#81c784', repeat: false }
      ]
    },
    boss: {
      warnMin: 5,
      entries: [{ id: newId(), name: 'Field boss', kind: 'respawn', respawnMin: 45, times: [] }]
    },
    notes: { autoResetDaily: true, resetHourUtc: 0 },
    kills: { goal: 0, hotkey: '', label: 'Kills' },
    image: { fit: 'contain' }
  };
  return configs[type];
}

export function defaultData<T extends WidgetType>(type: T): WidgetDataMap[T] {
  const data: WidgetDataMap = {
    exp: { samples: [], levelOffset: 0, levelUps: 0 },
    meso: { samples: [] },
    session: { running: false, startedAt: 0, accumulatedMs: 0 },
    timers: { endsAt: {} },
    boss: { nextAt: {} },
    notes: { text: '', items: [], lastResetKey: '' },
    kills: { count: 0, startedAt: 0 },
    image: { images: [], index: 0 }
  };
  return data[type];
}

export function createWidget<T extends WidgetType>(type: T, title?: string): WidgetDef<T> {
  return {
    id: newId(),
    type,
    title: title ?? WIDGET_LABELS[type],
    config: defaultConfig(type),
    data: defaultData(type)
  } as WidgetDef<T>;
}

export function defaultPlacement(type: WidgetType, index: number): Placement {
  const size = DEFAULT_SIZES[type];
  const col = index % 4;
  const row = Math.floor(index / 4);
  return { x: 40 + col * 290, y: 80 + row * 280, w: size.w, h: size.h, visible: true, opacity: 0.8, scale: 1 };
}

export const DEFAULT_HOTKEYS: Settings['hotkeys'] = {
  toggleOverlay: 'Ctrl+Shift+F1',
  toggleEdit: 'Ctrl+Shift+F2',
  toggleClickThrough: 'Ctrl+Shift+F3',
  openControl: 'Ctrl+Shift+F4',
  nextProfile: 'Ctrl+Shift+F5'
};

export function defaultSettings(): Settings {
  return {
    hotkeys: { ...DEFAULT_HOTKEYS },
    displayId: null,
    clickThrough: false,
    overlayVisible: true,
    soundEnabled: true,
    launchAtLogin: false
  };
}

export function defaultState(): PersistedState {
  const starters: WidgetType[] = ['exp', 'session', 'timers', 'kills'];
  const widgets = starters.map((t) => createWidget(t));
  const profile: LayoutProfile = {
    id: newId(),
    name: 'Default',
    placements: Object.fromEntries(widgets.map((w, i) => [w.id, defaultPlacement(w.type, i)]))
  };
  return {
    version: 1,
    widgets: Object.fromEntries(widgets.map((w) => [w.id, w])),
    widgetOrder: widgets.map((w) => w.id),
    profiles: [profile],
    activeProfileId: profile.id,
    settings: defaultSettings()
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function clampPlacement(p: Partial<Placement> | undefined, fallback: Placement): Placement {
  const src = p ?? {};
  return {
    x: num(src.x, fallback.x, -5000, 20000),
    y: num(src.y, fallback.y, -5000, 20000),
    w: num(src.w, fallback.w, 80, 4000),
    h: num(src.h, fallback.h, 40, 4000),
    visible: typeof src.visible === 'boolean' ? src.visible : fallback.visible,
    opacity: num(src.opacity, fallback.opacity, 0.1, 1),
    scale: num(src.scale, fallback.scale, 0.5, 2)
  };
}

/**
 * Repairs a state loaded from disk: fills missing fields from defaults and drops anything malformed,
 * so a hand-edited or older config file can never crash the app.
 */
export function normalizeState(raw: unknown): PersistedState {
  const base = defaultState();
  if (!isObj(raw)) return base;

  const widgets: Record<string, WidgetDef> = {};
  if (isObj(raw.widgets)) {
    for (const [id, w] of Object.entries(raw.widgets)) {
      if (!isObj(w) || !WIDGET_TYPES.includes(w.type as WidgetType)) continue;
      const type = w.type as WidgetType;
      widgets[id] = {
        id,
        type,
        title: typeof w.title === 'string' ? w.title : WIDGET_LABELS[type],
        config: { ...defaultConfig(type), ...(isObj(w.config) ? w.config : {}) },
        data: { ...defaultData(type), ...(isObj(w.data) ? w.data : {}) }
      } as WidgetDef;
    }
  }

  const order = Array.isArray(raw.widgetOrder) ? raw.widgetOrder.filter((id): id is string => typeof id === 'string' && id in widgets) : [];
  for (const id of Object.keys(widgets)) if (!order.includes(id)) order.push(id);

  const profiles: LayoutProfile[] = [];
  if (Array.isArray(raw.profiles)) {
    for (const p of raw.profiles) {
      if (!isObj(p) || typeof p.id !== 'string') continue;
      const placements: Record<string, Placement> = {};
      if (isObj(p.placements)) {
        for (const [wid, pl] of Object.entries(p.placements)) {
          const w = widgets[wid];
          if (!w || !isObj(pl)) continue;
          placements[wid] = clampPlacement(pl as Partial<Placement>, defaultPlacement(w.type, order.indexOf(wid)));
        }
      }
      profiles.push({ id: p.id, name: typeof p.name === 'string' ? p.name : 'Layout', placements });
    }
  }
  if (profiles.length === 0) {
    profiles.push({
      id: newId(),
      name: 'Default',
      placements: Object.fromEntries(order.map((id, i) => [id, defaultPlacement(widgets[id]!.type, i)]))
    });
  }

  const activeProfileId =
    typeof raw.activeProfileId === 'string' && profiles.some((p) => p.id === raw.activeProfileId)
      ? raw.activeProfileId
      : profiles[0]!.id;

  const s = isObj(raw.settings) ? raw.settings : {};
  const defaults = defaultSettings();
  const hotkeys = { ...defaults.hotkeys };
  if (isObj(s.hotkeys)) {
    for (const action of HOTKEY_ACTIONS) {
      const v = s.hotkeys[action];
      if (typeof v === 'string') hotkeys[action] = v;
    }
  }

  return {
    version: 1,
    widgets,
    widgetOrder: order,
    profiles,
    activeProfileId,
    settings: {
      hotkeys,
      displayId: typeof s.displayId === 'number' ? s.displayId : null,
      clickThrough: typeof s.clickThrough === 'boolean' ? s.clickThrough : defaults.clickThrough,
      overlayVisible: typeof s.overlayVisible === 'boolean' ? s.overlayVisible : defaults.overlayVisible,
      soundEnabled: typeof s.soundEnabled === 'boolean' ? s.soundEnabled : defaults.soundEnabled,
      launchAtLogin: typeof s.launchAtLogin === 'boolean' ? s.launchAtLogin : defaults.launchAtLogin
    }
  };
}
