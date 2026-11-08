import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type MscwApi } from '../shared/ipc.ts';
import type { AppState } from '../shared/types.ts';

const api: MscwApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState: (cb) => {
    const listener = (_e: IpcRendererEvent, state: AppState): void => cb(state);
    ipcRenderer.on(IPC.state, listener);
    return () => ipcRenderer.removeListener(IPC.state, listener);
  },
  dispatch: (action) => ipcRenderer.send(IPC.dispatch, action),
  setEditMode: (on) => ipcRenderer.send(IPC.setEditMode, on),
  setIgnoreMouse: (ignore) => ipcRenderer.send(IPC.setIgnoreMouse, ignore),
  setFocusable: (focusable) => ipcRenderer.send(IPC.setFocusable, focusable),
  openControl: (widgetId) => ipcRenderer.send(IPC.openControl, widgetId),
  onFocusWidget: (cb) => {
    const listener = (_e: IpcRendererEvent, id: string): void => cb(id);
    ipcRenderer.on(IPC.focusWidget, listener);
    return () => ipcRenderer.removeListener(IPC.focusWidget, listener);
  },
  pickImages: (widgetId) => ipcRenderer.invoke(IPC.pickImages, widgetId),
  removeImage: (widgetId, name) => ipcRenderer.invoke(IPC.removeImage, widgetId, name),
  pickGameData: () => ipcRenderer.invoke(IPC.pickGameData),
  importGameAssets: (path) => ipcRenderer.invoke(IPC.importGameAssets, path),
  getGameAssets: () => ipcRenderer.invoke(IPC.getGameAssets),
  lookupPotion: (itemId, version) => ipcRenderer.invoke(IPC.lookupPotion, itemId, version),
  capturePreviews: () => ipcRenderer.invoke(IPC.capturePreviews),
  startGameTracking: () => ipcRenderer.invoke(IPC.startGameTracking),
  initializeGame: (sourceId, debugMode) => ipcRenderer.invoke(IPC.initializeGame, sourceId, debugMode),
  stopGameTracking: () => ipcRenderer.invoke(IPC.stopGameTracking),
  captureConfig: () => ipcRenderer.invoke(IPC.captureConfig),
  captureFrame: (image, width, height) => ipcRenderer.send(IPC.captureFrame, image, width, height),
  captureMap: (image, kind) => ipcRenderer.send(IPC.captureMap, image, kind),
  captureInventory: (reading, capturedAt) => ipcRenderer.send(IPC.captureInventory, reading, capturedAt),
  captureError: (message) => ipcRenderer.send(IPC.captureError, message),
  quit: () => ipcRenderer.send(IPC.quit)
};

contextBridge.exposeInMainWorld('mscw', api);
