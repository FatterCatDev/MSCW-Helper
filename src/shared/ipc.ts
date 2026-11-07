import type { Action } from './reducer.ts';
import type { AppState, CapturePreview, GameAssetImport, GameTrackingConfig, PotionItem } from './types.ts';

export const IPC = {
  getState: 'state:get',
  state: 'state:changed',
  dispatch: 'state:dispatch',
  setEditMode: 'overlay:set-edit-mode',
  setIgnoreMouse: 'overlay:set-ignore-mouse',
  setFocusable: 'overlay:set-focusable',
  openControl: 'control:open',
  focusWidget: 'control:focus-widget',
  pickImages: 'image:pick',
  removeImage: 'image:remove',
  pickGameData: 'game-data:pick',
  importGameAssets: 'game-assets:import',
  getGameAssets: 'game-assets:get',
  lookupPotion: 'potions:lookup',
  capturePreviews: 'potions:preview',
  startPotions: 'potions:start',
  stopPotions: 'potions:stop',
  startGameTracking: 'game-tracking:start',
  stopGameTracking: 'game-tracking:stop',
  captureConfig: 'capture:config',
  captureFrame: 'capture:frame',
  captureError: 'capture:error',
  quit: 'app:quit'
} as const;

export const IMAGE_SCHEME = 'mscw-img';

export function imageUrl(name: string): string {
  return `${IMAGE_SCHEME}://img/${encodeURIComponent(name)}`;
}

/** API exposed to renderers on `window.mscw` by the preload script. */
export interface MscwApi {
  getState(): Promise<AppState>;
  onState(cb: (state: AppState) => void): () => void;
  dispatch(action: Action): void;
  setEditMode(on: boolean): void;
  setIgnoreMouse(ignore: boolean): void;
  setFocusable(focusable: boolean): void;
  openControl(widgetId?: string): void;
  onFocusWidget(cb: (widgetId: string) => void): () => void;
  pickImages(widgetId: string): Promise<void>;
  removeImage(widgetId: string, name: string): Promise<void>;
  pickGameData(): Promise<string | null>;
  importGameAssets(path: string): Promise<GameAssetImport>;
  getGameAssets(): Promise<GameAssetImport | null>;
  lookupPotion(itemId: number, version: string): Promise<PotionItem>;
  capturePreviews(): Promise<CapturePreview[]>;
  startPotions(widgetId: string): Promise<void>;
  stopPotions(widgetId: string): Promise<void>;
  startGameTracking(): Promise<void>;
  stopGameTracking(): Promise<void>;
  captureConfig(): Promise<GameTrackingConfig>;
  captureFrame(image: string): void;
  captureError(message: string): void;
  quit(): void;
}
