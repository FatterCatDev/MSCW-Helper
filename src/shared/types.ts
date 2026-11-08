export const WIDGET_TYPES = ['training', 'exp', 'meso', 'session', 'timers', 'boss', 'notes', 'image'] as const;
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
  training: { expId: string; mesoId: string };
  exp: Record<string, never>;
  meso: { goal: number; potions: PotionTracker[]; selectedPotions: RecoveryPotionSelection };
  session: Record<string, never>;
  timers: { timers: TimerEntry[]; warnSec: number };
  boss: { entries: BossEntry[]; warnMin: number };
  notes: { autoResetDaily: boolean; resetHourUtc: number };
  image: { fit: 'contain' | 'cover' };
}

export interface RateSample {
  t: number;
  value: number;
}

export interface WidgetDataMap {
  training: Record<string, never>;
  exp: {
    unit: 'points';
    samples: RateSample[];
    current: number | null;
    required: number;
    level: number;
    gained: number;
    startedAt: number | null;
    migrated: boolean;
    source: 'manual' | 'notifications' | 'status-bar';
    percent?: number;
  };
  meso: { samples: RateSample[]; potionCosts: number; potionUses: Record<string, number>;
    pickups: number; loot: LootEntry[]; trackingStartedAt: number | null; recoveryEvents: RecoveryEvent[]; unidentifiedRecoveries: number };
  session: { running: boolean; startedAt: number; accumulatedMs: number };
  timers: { endsAt: Record<string, number> };
  boss: { nextAt: Record<string, number> };
  notes: { text: string; items: ChecklistItem[]; lastResetKey: string };
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
  gameDataPath: string;
  gameTracking: GameTrackingConfig;
}

export interface LootEntry {
  name: string;
  quantity: number;
  unitValue: number | null;
  itemId: number | null;
}

export interface GameTrackingConfig {
  captureMode?: 'status-bar';
  levelRegion?: CaptureRegion;
  hpRegion?: CaptureRegion;
  mpRegion?: CaptureRegion;
  sourceId: string;
  windowName: string;
  region: CaptureRegion;
  expWidgetId: string;
  mesoWidgetId: string;
  apiVersion: string;
  priceOverrides: Record<string, number>;
}

export interface GameTrackingStatus {
  running: boolean;
  fps: number;
  frames: number;
  message: string;
  resolution?: { width: number; height: number };
  reader?: 'calibrating' | 'font';
}

export interface GameAssetImport {
  sourcePath: string;
  importedAt: number;
  fileCount: number;
  totalBytes: number;
  directory: string;
}

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PotionTracker {
  id: string;
  itemId: number;
  name: string;
  unitCost: number;
}

export interface RecoveryPotionSelection { hp: number | null; mp: number | null }
export interface Vitals { hp: number; maxHp: number; mp: number; maxMp: number }
export interface RecoveryEvent {
  id: string; at: number; hp: number; mp: number; candidates: number[]; reason: string;
  itemId: number | null; cost: number | null;
}

export interface PotionItem {
  id: number;
  name: string;
  description: string;
  npcSellPrice: number | null;
  npcBuyPrice: number | null;
  npcPriceSource: string | null;
}

export interface CapturePreview {
  id: string;
  name: string;
  image: string;
}

export interface PotionStatus {
  running: boolean;
  message: string;
  counts: Record<string, number>;
  vitals?: Vitals;
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
  debugMode: boolean;
  debugLogs: { time: number; level: string; message: string }[];
  detectedPotions: { name: string; itemId: number; count: number | null }[];
  initializing: boolean;
  editMode: boolean;
  /** Accelerators that failed to register, with reason. */
  hotkeyErrors: Record<string, string>;
  displays: { id: number; label: string; primary: boolean }[];
  potionTracking: Record<string, PotionStatus>;
  gameTracking: GameTrackingStatus;
}

export interface AppState extends PersistedState {
  runtime: RuntimeState;
}
