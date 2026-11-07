export const WIDGET_TYPES = ['exp', 'meso', 'session', 'timers', 'boss', 'notes', 'kills', 'image'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export interface TimerEntry {
  id: string;
  name: string;
  durationSec: number;
  /** Electron accelerator, e.g. "Ctrl+Shift+1". Empty = no hotkey. */
  hotkey: string;
  color: string;
  /** Restart automatically when finished. */
  repeat: boolean;
}

export interface BossEntry {
  id: string;
  name: string;
  /** 'respawn' = countdown started when you mark the kill; 'schedule' = fixed local clock times. */
  kind: 'respawn' | 'schedule';
  respawnMin: number;
  /** Local times, "HH:MM". Used by 'schedule' entries. */
  times: string[];
}

export interface WidgetConfigMap {
  exp: Record<string, never>;
  meso: { goal: number };
  session: Record<string, never>;
  timers: { timers: TimerEntry[]; warnSec: number };
  boss: { entries: BossEntry[]; warnMin: number };
  notes: { autoResetDaily: boolean; resetHourUtc: number };
  kills: { goal: number; hotkey: string; label: string };
  image: { fit: 'contain' | 'cover' };
}

export interface RateSample {
  t: number;
  value: number;
}

export interface WidgetDataMap {
  /** value = EXP percent (0-100). `levelOffset` accumulates +100 per detected level up. */
  exp: { samples: RateSample[]; levelOffset: number; levelUps: number };
  meso: { samples: RateSample[] };
  session: { running: boolean; startedAt: number; accumulatedMs: number };
  timers: { endsAt: Record<string, number> };
  boss: { nextAt: Record<string, number> };
  notes: { text: string; items: ChecklistItem[]; lastResetKey: string };
  kills: { count: number; startedAt: number };
  image: { images: string[]; index: number };
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type WidgetDef<T extends WidgetType = WidgetType> = {
  [K in T]: {
    id: string;
    type: K;
    title: string;
    config: WidgetConfigMap[K];
    data: WidgetDataMap[K];
  };
}[T];

export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
  /** Background opacity 0.1 - 1. */
  opacity: number;
  /** Content zoom 0.5 - 2. */
  scale: number;
}

export interface LayoutProfile {
  id: string;
  name: string;
  placements: Record<string, Placement>;
}

export const HOTKEY_ACTIONS = ['toggleOverlay', 'toggleEdit', 'toggleClickThrough', 'openControl', 'nextProfile'] as const;
export type HotkeyAction = (typeof HOTKEY_ACTIONS)[number];

export interface Settings {
  hotkeys: Record<HotkeyAction, string>;
  /** Electron display id the overlay covers. null = primary display. */
  displayId: number | null;
  /** When true (and not editing) the whole overlay ignores the mouse. */
  clickThrough: boolean;
  overlayVisible: boolean;
  soundEnabled: boolean;
  launchAtLogin: boolean;
}

export interface PersistedState {
  version: 1;
  widgets: Record<string, WidgetDef>;
  /** Widget display order (also z-order, last = on top). */
  widgetOrder: string[];
  profiles: LayoutProfile[];
  activeProfileId: string;
  settings: Settings;
}

export interface RuntimeState {
  editMode: boolean;
  /** Accelerators that failed to register, with reason. */
  hotkeyErrors: Record<string, string>;
  displays: { id: number; label: string; primary: boolean }[];
}

export interface AppState extends PersistedState {
  runtime: RuntimeState;
}
