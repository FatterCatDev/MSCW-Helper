import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, net, protocol, screen, session, Tray, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { copyFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IMAGE_SCHEME, IPC } from '../shared/ipc.ts';
import { isAction, reducer, type Action } from '../shared/reducer.ts';
import type { AppState, HotkeyAction, PersistedState, RuntimeState } from '../shared/types.ts';
import { createAppIcon } from './icon.ts';
import { Store } from './store.ts';

const IMAGE_NAME_RE = /^[0-9a-f-]{36}\.(png|jpe?g|gif|webp|bmp)$/i;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

protocol.registerSchemesAsPrivileged([{ scheme: IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showControl());
  app.whenReady().then(start).catch((err) => {
    console.error(err);
    app.exit(1);
  });
}

let store: Store;
let imagesDir: string;
let overlay: BrowserWindow | null = null;
let control: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let rendererWantsIgnore = true;
let hotkeySignature = '';
const runtime: RuntimeState = { editMode: false, hotkeyErrors: {}, displays: [] };

function fullState(): AppState {
  return { ...store.get(), runtime };
}

function broadcast(): void {
  const state = fullState();
  for (const win of [overlay, control]) {
    if (win && !win.isDestroyed()) win.webContents.send(IPC.state, state);
  }
}

function dispatch(action: Action): void {
  const prev = store.get();
  const next = reducer(prev, action);
  if (next === prev) return;
  store.set(next);
  applySideEffects(prev, next);
  broadcast();
}

function applySideEffects(prev: PersistedState | null, next: PersistedState): void {
  const s = next.settings;
  if (!prev || prev.settings.displayId !== s.displayId) positionOverlay();
  if (!prev || prev.settings.overlayVisible !== s.overlayVisible) updateOverlayVisibility();
  if (!prev || prev.settings.clickThrough !== s.clickThrough) updateMouseIgnore();
  if (app.isPackaged && (!prev || prev.settings.launchAtLogin !== s.launchAtLogin)) {
    app.setLoginItemSettings({ openAtLogin: s.launchAtLogin });
  }
  registerHotkeys(next);
  updateTray();
}

function setEditMode(on: boolean): void {
  if (runtime.editMode === on) return;
  runtime.editMode = on;
  if (on && !store.get().settings.overlayVisible) dispatch({ type: 'settings/set', patch: { overlayVisible: true } });
  updateMouseIgnore();
  updateTray();
  broadcast();
}

// ---------------------------------------------------------------- overlay window

function targetDisplay(): Electron.Display {
  const id = store.get().settings.displayId;
  return screen.getAllDisplays().find((d) => d.id === id) ?? screen.getPrimaryDisplay();
}

function refreshDisplays(): void {
  const primary = screen.getPrimaryDisplay().id;
  runtime.displays = screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `${d.label || `Display ${i + 1}`} (${d.size.width}x${d.size.height})`,
    primary: d.id === primary
  }));
}

function positionOverlay(): void {
  if (!overlay) return;
  overlay.setBounds(targetDisplay().bounds);
}

function updateOverlayVisibility(): void {
  if (!overlay) return;
  if (store.get().settings.overlayVisible) {
    overlay.showInactive();
    overlay.setAlwaysOnTop(true, 'screen-saver');
  } else {
    overlay.hide();
  }
}

/**
 * Click-through: in "click-through" mode the whole overlay ignores the mouse. Otherwise the renderer
 * reports whether the cursor is over a widget, and only empty space passes clicks through to the game.
 */
function updateMouseIgnore(): void {
  if (!overlay) return;
  const forceThrough = store.get().settings.clickThrough && !runtime.editMode;
  if (forceThrough) overlay.setIgnoreMouseEvents(true);
  else overlay.setIgnoreMouseEvents(rendererWantsIgnore, { forward: true });
}

function rendererUrl(page: 'overlay' | 'control'): { url?: string; file?: string } {
  const dev = process.env['ELECTRON_RENDERER_URL'];
  return dev ? { url: `${dev}/${page}.html` } : { file: join(__dirname, `../renderer/${page}.html`) };
}

function load(win: BrowserWindow, page: 'overlay' | 'control'): void {
  const target = rendererUrl(page);
  if (target.url) void win.loadURL(target.url);
  else void win.loadFile(target.file!);
}

function hardenWebContents(wc: WebContents): void {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL'];
    if (!(dev && url.startsWith(dev))) e.preventDefault();
  });
}

const webPreferences = (): Electron.WebPreferences => ({
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false
});

function createOverlay(): void {
  const { bounds } = targetDisplay();
  overlay = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    title: 'MSCW Helper Overlay',
    webPreferences: { ...webPreferences(), backgroundThrottling: false }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  hardenWebContents(overlay.webContents);
  overlay.webContents.once('did-finish-load', () => {
    updateMouseIgnore();
    updateOverlayVisibility();
  });
  overlay.on('closed', () => (overlay = null));
  load(overlay, 'overlay');

  // Some games re-assert their own topmost state; periodically bring the overlay back above them.
  setInterval(() => {
    if (overlay && overlay.isVisible() && !overlay.isFocused()) overlay.moveTop();
  }, 2000).unref();
}

// ---------------------------------------------------------------- control window

function createControl(): void {
  control = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: 'MSCW Helper',
    icon: createAppIcon(32),
    backgroundColor: '#14161c',
    autoHideMenuBar: true,
    webPreferences: webPreferences()
  });
  control.setMenu(null);
  hardenWebContents(control.webContents);
  control.once('ready-to-show', () => control?.show());
  control.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      control?.hide();
    }
  });
  control.on('closed', () => (control = null));
  load(control, 'control');
}

function showControl(widgetId?: string): void {
  if (!control) createControl();
  if (!control) return;
  if (control.isMinimized()) control.restore();
  control.show();
  control.focus();
  if (widgetId) control.webContents.send(IPC.focusWidget, widgetId);
}

// ---------------------------------------------------------------- tray

function updateTray(): void {
  if (!tray) return;
  const s = store.get();
  const menu = Menu.buildFromTemplate([
    { label: 'Open MSCW Helper', click: () => showControl() },
    { type: 'separator' },
    { label: 'Show overlay', type: 'checkbox', checked: s.settings.overlayVisible, accelerator: s.settings.hotkeys.toggleOverlay || undefined, click: () => runHotkey('toggleOverlay') },
    { label: 'Edit layout', type: 'checkbox', checked: runtime.editMode, accelerator: s.settings.hotkeys.toggleEdit || undefined, click: () => runHotkey('toggleEdit') },
    { label: 'Click-through', type: 'checkbox', checked: s.settings.clickThrough, accelerator: s.settings.hotkeys.toggleClickThrough || undefined, click: () => runHotkey('toggleClickThrough') },
    {
      label: 'Layout',
      submenu: s.profiles.map((p) => ({
        label: p.name,
        type: 'radio' as const,
        checked: p.id === s.activeProfileId,
        click: () => dispatch({ type: 'profile/activate', id: p.id })
      }))
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

function createTray(): void {
  tray = new Tray(createAppIcon(16));
  tray.setToolTip('MSCW Helper');
  tray.on('click', () => showControl());
  updateTray();
}

// ---------------------------------------------------------------- hotkeys

function runHotkey(action: HotkeyAction): void {
  const s = store.get().settings;
  switch (action) {
    case 'toggleOverlay':
      dispatch({ type: 'settings/set', patch: { overlayVisible: !s.overlayVisible } });
      break;
    case 'toggleEdit':
      setEditMode(!runtime.editMode);
      break;
    case 'toggleClickThrough':
      dispatch({ type: 'settings/set', patch: { clickThrough: !s.clickThrough } });
      break;
    case 'openControl':
      showControl();
      break;
    case 'nextProfile':
      dispatch({ type: 'profile/next' });
      break;
  }
}

function registerHotkeys(state: PersistedState): void {
  const bindings: { accel: string; label: string; run: () => void }[] = [];
  for (const [action, accel] of Object.entries(state.settings.hotkeys) as [HotkeyAction, string][]) {
    bindings.push({ accel, label: action, run: () => runHotkey(action) });
  }
  for (const id of state.widgetOrder) {
    const w = state.widgets[id];
    if (w?.type === 'timers') {
      for (const t of w.config.timers) {
        bindings.push({ accel: t.hotkey, label: `${w.title}: ${t.name}`, run: () => dispatch({ type: 'timer/start', id: w.id, timerId: t.id, at: Date.now() }) });
      }
    } else if (w?.type === 'kills') {
      bindings.push({ accel: w.config.hotkey, label: `${w.title}: +1`, run: () => dispatch({ type: 'kills/add', id: w.id, delta: 1, at: Date.now() }) });
    }
  }
  const active = bindings.filter((b) => b.accel.trim() !== '');
  const signature = JSON.stringify(active.map((b) => [b.accel, b.label]));
  if (signature === hotkeySignature) return;
  hotkeySignature = signature;

  globalShortcut.unregisterAll();
  const errors: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const b of active) {
    const key = b.accel.toLowerCase();
    const other = seen.get(key);
    if (other) {
      errors[b.accel] = `Used by both "${other}" and "${b.label}"`;
      continue;
    }
    seen.set(key, b.label);
    try {
      if (!globalShortcut.register(b.accel, b.run)) errors[b.accel] = 'Already in use by another application';
    } catch {
      errors[b.accel] = 'Invalid key combination';
    }
  }
  runtime.hotkeyErrors = errors;
}

// ---------------------------------------------------------------- images

function referencedImages(state: PersistedState): Set<string> {
  const names = new Set<string>();
  for (const w of Object.values(state.widgets)) if (w.type === 'image') w.data.images.forEach((n) => names.add(n));
  return names;
}

function sweepImages(): void {
  const used = referencedImages(store.get());
  for (const name of readdirSync(imagesDir)) {
    if (IMAGE_NAME_RE.test(name) && !used.has(name)) {
      try {
        unlinkSync(join(imagesDir, name));
      } catch {
        // file in use; try again next launch
      }
    }
  }
}

async function pickImages(widgetId: string): Promise<void> {
  const w = store.get().widgets[widgetId];
  if (w?.type !== 'image') return;
  const parent = control ?? undefined;
  const options: Electron.OpenDialogOptions = {
    title: 'Add images',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
  };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  if (result.canceled) return;
  const added: string[] = [];
  for (const src of result.filePaths) {
    const ext = extname(src).toLowerCase();
    const name = `${crypto.randomUUID()}${ext}`;
    if (!IMAGE_NAME_RE.test(name)) continue;
    try {
      if (statSync(src).size > MAX_IMAGE_BYTES) continue;
      copyFileSync(src, join(imagesDir, name));
      added.push(name);
    } catch (err) {
      console.error('[images] copy failed', err);
    }
  }
  const current = store.get().widgets[widgetId];
  if (current?.type !== 'image' || added.length === 0) return;
  dispatch({ type: 'widget/data', id: widgetId, data: { images: [...current.data.images, ...added] } });
}

async function removeImage(widgetId: string, name: string): Promise<void> {
  const w = store.get().widgets[widgetId];
  if (w?.type !== 'image' || !w.data.images.includes(name)) return;
  const images = w.data.images.filter((n) => n !== name);
  dispatch({ type: 'widget/data', id: widgetId, data: { images, index: Math.min(w.data.index, Math.max(0, images.length - 1)) } });
  if (!referencedImages(store.get()).has(name)) {
    try {
      unlinkSync(join(imagesDir, name));
    } catch {
      // swept on next launch
    }
  }
}

// ---------------------------------------------------------------- IPC

function fromOurWindow(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const win = BrowserWindow.fromWebContents(e.sender);
  return win !== null && (win === overlay || win === control);
}

function fromOverlay(e: IpcMainEvent): boolean {
  return overlay !== null && BrowserWindow.fromWebContents(e.sender) === overlay;
}

function registerIpc(): void {
  ipcMain.handle(IPC.getState, (e) => (fromOurWindow(e) ? fullState() : null));
  ipcMain.on(IPC.dispatch, (e, action: unknown) => {
    if (fromOurWindow(e) && isAction(action)) dispatch(action);
  });
  ipcMain.on(IPC.setEditMode, (e, on: unknown) => {
    if (fromOurWindow(e) && typeof on === 'boolean') setEditMode(on);
  });
  ipcMain.on(IPC.setIgnoreMouse, (e, ignore: unknown) => {
    if (!fromOverlay(e) || typeof ignore !== 'boolean') return;
    rendererWantsIgnore = ignore;
    updateMouseIgnore();
  });
  ipcMain.on(IPC.setFocusable, (e, focusable: unknown) => {
    if (!fromOverlay(e) || typeof focusable !== 'boolean' || !overlay) return;
    overlay.setFocusable(focusable);
    if (focusable) overlay.focus();
    overlay.setAlwaysOnTop(true, 'screen-saver');
  });
  ipcMain.on(IPC.openControl, (e, widgetId: unknown) => {
    if (fromOurWindow(e)) showControl(typeof widgetId === 'string' ? widgetId : undefined);
  });
  ipcMain.handle(IPC.pickImages, (e, widgetId: unknown) => (fromOurWindow(e) && typeof widgetId === 'string' ? pickImages(widgetId) : undefined));
  ipcMain.handle(IPC.removeImage, (e, widgetId: unknown, name: unknown) =>
    fromOurWindow(e) && typeof widgetId === 'string' && typeof name === 'string' ? removeImage(widgetId, name) : undefined
  );
  ipcMain.on(IPC.quit, (e) => {
    if (fromOurWindow(e)) app.quit();
  });
}

// ---------------------------------------------------------------- lifecycle

function start(): void {
  app.setAppUserModelId('com.mscwhelper.app');
  store = new Store(join(app.getPath('userData'), 'mscw-helper.json'));
  imagesDir = join(app.getPath('userData'), 'images');
  mkdirSync(imagesDir, { recursive: true });
  sweepImages();

  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  protocol.handle(IMAGE_SCHEME, (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''));
    if (!IMAGE_NAME_RE.test(name)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(join(imagesDir, name)).toString());
  });

  refreshDisplays();
  for (const evt of ['display-added', 'display-removed', 'display-metrics-changed'] as const) {
    screen.on(evt as 'display-added', () => {
      refreshDisplays();
      positionOverlay();
      broadcast();
    });
  }

  registerIpc();
  createOverlay();
  createControl();
  createTray();
  applySideEffects(null, store.get());

  app.on('before-quit', () => {
    quitting = true;
    store.flush();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  // Keep running in the tray when all windows are closed/hidden.
  app.on('window-all-closed', () => {});
}
