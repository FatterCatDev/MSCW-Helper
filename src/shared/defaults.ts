import type {
  LayoutProfile,
  PersistedState,
  Placement,
  Settings,
  PotionTracker,
  WidgetConfigMap,
  WidgetDataMap,
  WidgetDef,
  WidgetType
} from './types.ts';
import { HOTKEY_ACTIONS, WIDGET_TYPES } from './types.ts';
import { DEFAULT_GAIN_REGION, validRegion } from './game-tracking.ts';

export const WIDGET_LABELS: Record<WidgetType, string> = {
  exp: 'EXP Tracker',
  meso: 'Meso Tracker',
  session: 'Session Timer',
  timers: 'Buff / Cooldown Timers',
  boss: 'Boss / Event Timers',
  notes: 'Notes & Checklist',
  image: 'Image / Map Panel'
};

export const DEFAULT_SIZES: Record<WidgetType, { w: number; h: number }> = {
  exp: { w: 300, h: 310 },
  meso: { w: 280, h: 300 },
  session: { w: 220, h: 110 },
  timers: { w: 240, h: 200 },
  boss: { w: 260, h: 200 },
  notes: { w: 260, h: 260 },
  image: { w: 320, h: 240 }
};

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function defaultConfig<T extends WidgetType>(type: T): WidgetConfigMap[T] {
  const configs: WidgetConfigMap = {
    exp: {},
    meso: { goal: 0, potions: [] },
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
    image: { fit: 'contain' }
  };
  return configs[type];
}

export function defaultData<T extends WidgetType>(type: T): WidgetDataMap[T] {
  const data: WidgetDataMap = {
    exp: { unit: 'points', samples: [], current: null, required: 0, level: 1, gained: 0, startedAt: null, migrated: false, source: 'manual' },
    meso: { samples: [], potionCosts: 0, potionUses: {}, pickups: 0, loot: [], trackingStartedAt: null },
    session: { running: false, startedAt: 0, accumulatedMs: 0 },
    timers: { endsAt: {} },
    boss: { nextAt: {} },
    notes: { text: '', items: [], lastResetKey: '' },
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
  return { x: 40 + col * 330, y: 80 + row * 340, w: size.w, h: size.h, visible: true, opacity: 0.8, scale: 1 };
}

export const DEFAULT_HOTKEYS: Settings['hotkeys'] = {
  toggleOverlay: 'Ctrl+Shift+F1',
  toggleEdit: 'Ctrl+Shift+F2',
  toggleClickThrough: 'Ctrl+Shift+F3',
  openControl: 'Ctrl+Shift+F4',
  nextProfile: 'Ctrl+Shift+F5'
};

export const DEFAULT_GAME_DATA_PATH = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\MapleStory\\MSCW\\Data';

export function defaultSettings(): Settings {
  return {
    hotkeys: { ...DEFAULT_HOTKEYS },
    displayId: null,
    clickThrough: false,
    overlayVisible: true,
    soundEnabled: true,
    launchAtLogin: false,
    gameDataPath: DEFAULT_GAME_DATA_PATH,
    gameTracking: { sourceId: '', windowName: '', region: { ...DEFAULT_GAIN_REGION }, expWidgetId: '', mesoWidgetId: '',
      apiVersion: '62', priceOverrides: {} }
  };
}

export function defaultState(): PersistedState {
  const starters: WidgetType[] = ['exp', 'meso', 'session', 'timers'];
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

function normalizePotions(raw: unknown): PotionTracker[] {
  if (!Array.isArray(raw)) return [];
  const result: PotionTracker[] = [];
  for (const p of raw) {
    if (!isObj(p) || typeof p.id !== 'string' || typeof p.name !== 'string' ||
        typeof p.itemId !== 'number' || !Number.isSafeInteger(p.itemId) || p.itemId <= 0 ||
        result.some(existing => existing.id === p.id)) continue;
    const r = isObj(p.region) ? p.region : {};
    result.push({
      id: p.id, itemId: p.itemId, name: p.name,
      unitCost: Math.round(num(p.unitCost, 0, 0, 1e9)),
      sourceId: typeof p.sourceId === 'string' ? p.sourceId : '',
      region: { x: num(r.x, 0, 0, 1), y: num(r.y, 0, 0, 1),
        width: num(r.width, 0, 0, 1), height: num(r.height, 0, 0, 1) }
    });
    if (result.length === 8) break;
  }
  return result;
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
      if (type === 'exp' && (!isObj(w.data) || w.data.unit !== 'points')) {
        widgets[id] = { ...createWidget('exp'), id, title: widgets[id]!.title,
          data: { ...defaultData('exp'), migrated: true } };
      }
      const widget = widgets[id];
      if (widget?.type === 'meso') {
        const data = isObj(w.data) ? w.data : {};
        const uses = isObj(data.potionUses) ? data.potionUses : {};
        widget.config.potions = normalizePotions(isObj(w.config) ? w.config.potions : undefined);
        widget.data.potionCosts = num(data.potionCosts, 0, 0);
        widget.data.potionUses = Object.fromEntries(Object.entries(uses).filter((entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isSafeInteger(entry[1]) && entry[1] >= 0));
        widget.data.pickups = num(data.pickups, 0, 0);
        widget.data.trackingStartedAt = typeof data.trackingStartedAt === 'number' ? num(data.trackingStartedAt, 0, 0) : null;
        widget.data.loot = Array.isArray(data.loot) ? data.loot.filter(isObj).filter(l =>
          typeof l.name === 'string' && typeof l.quantity === 'number' && Number.isSafeInteger(l.quantity) && l.quantity > 0)
          .map(l => ({ name: String(l.name), quantity: Number(l.quantity), unitValue: typeof l.unitValue === 'number' ? num(l.unitValue, 0, 0) : null,
            itemId: typeof l.itemId === 'number' ? l.itemId : null })) : [];
      }
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
  const tracking = isObj(s.gameTracking) ? s.gameTracking : {};
  const prices = isObj(tracking.priceOverrides) ? tracking.priceOverrides : {};
  const gameTracking: Settings['gameTracking'] = {
    sourceId: typeof tracking.sourceId === 'string' ? tracking.sourceId : '',
    windowName: typeof tracking.windowName === 'string' ? tracking.windowName : '',
    region: validRegion(tracking.region) ? tracking.region : { ...DEFAULT_GAIN_REGION },
    expWidgetId: typeof tracking.expWidgetId === 'string' ? tracking.expWidgetId : '',
    mesoWidgetId: typeof tracking.mesoWidgetId === 'string' ? tracking.mesoWidgetId : '',
    apiVersion: typeof tracking.apiVersion === 'string' ? tracking.apiVersion : '62',
    priceOverrides: Object.fromEntries(Object.entries(prices).filter((entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isSafeInteger(entry[1]) && entry[1] >= 0))
  };
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
      launchAtLogin: typeof s.launchAtLogin === 'boolean' ? s.launchAtLogin : defaults.launchAtLogin,
      gameDataPath: typeof s.gameDataPath === 'string' && s.gameDataPath.trim() ? s.gameDataPath.trim() : defaults.gameDataPath,
      gameTracking
    }
  };
}
