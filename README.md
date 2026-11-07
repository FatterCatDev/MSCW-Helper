# MSCW Helper

A customizable, always-on-top game overlay for **MapleStory Classic World**.

Widgets float above the game in a transparent window. Empty space passes clicks straight through to the game, and you can arrange widgets into multiple saved **layouts**.

## Widgets

| Widget | What it does |
| --- | --- |
| EXP Tracker | Enter your EXP %; shows EXP/hr, time to level, gained %, auto-detects level ups |
| Meso Tracker | Enter your mesos (`1.5m`, `300k`, `2b`…); shows mesos/hr, gained, optional goal ETA |
| Session Timer | Start / pause / reset stopwatch |
| Buff / Cooldown Timers | Click (or press a global hotkey) to start; warning pulse + beep; optional auto-repeat |
| Boss / Event Timers | Respawn countdowns (“Killed” button) or daily scheduled times |
| Notes & Checklist | Free notes + checklist that can auto-uncheck at daily reset |
| Kill Counter | +1 via button or global hotkey, goal progress, kills/hr |
| Image / Map Panel | Show reference images (maps, quest guides), flip between several |

You can add as many of each widget as you like (e.g. one kill counter per quest mob).

## Using it

- **Control panel** – opens on launch. Closing it keeps the app running in the tray. Click the tray icon to reopen it, or right-click it for quick toggles and Quit.
- **Edit layout** (`Ctrl+Shift+F2`) – drag widgets by any part and resize them from the edges. The ⚙ button opens a widget's settings, ✕ hides it in this layout, and the toolbar adds or re-shows widgets.
- **Layouts** – each layout remembers which widgets are visible plus their position, size, opacity and scale. Widget data (notes, counters, timers) is shared between layouts. Switch layouts from the toolbar, the tray, or `Ctrl+Shift+F5`.
- **Click-through** (`Ctrl+Shift+F3`) – makes the whole overlay ignore the mouse. Use it if widgets get in the way while you play.
- **Show / hide overlay** – `Ctrl+Shift+F1`. **Open control panel** – `Ctrl+Shift+F4`.

All hotkeys can be changed in **Settings**. Buff timers and kill counters can have their own global hotkeys. Note that a global hotkey is captured by MSCW Helper, so the game won't receive that key combination.

### Tips

- Run the game in **windowed** or **borderless windowed** mode; exclusive fullscreen hides every overlay.
- Clicking buttons on widgets doesn't take keyboard focus from the game. Typing into a widget's text box does, so click the game again when you're done.
- On a multi-monitor setup, pick the game's monitor under **Settings → Display**.

## Development

Requirements: Node.js 22.12+ (installed: Node 24 LTS).

```powershell
npm install
npm run dev        # run with hot reload
npm test           # unit tests (node:test)
npm run typecheck
npm run build      # typecheck + production bundle into out/
npm run dist       # Windows installer + portable exe into release/
```

> If PowerShell blocks `npm` with an execution-policy error, use `npm.cmd` instead (e.g. `npm.cmd run dev`).

### Architecture

```
src/
  shared/    pure, tested logic used by every process
    types.ts      data model (widgets, layouts, settings)
    reducer.ts    every state change is an Action handled here
    defaults.ts   defaults + normalizeState() repair of the saved file
    time.ts       rates, ETAs, parsing/formatting, schedules
    ipc.ts        IPC channel names + the window.mscw API contract
  main/      Electron main process: overlay + control windows, tray,
             global hotkeys, persistence (store.ts), image protocol
  preload/   contextBridge exposing window.mscw
  renderer/
    overlay.html / control.html
    src/overlay   transparent always-on-top overlay (react-rnd widgets)
    src/control   control panel (widgets, layouts, settings)
    src/widgets   the widget components
```

- The **main process owns the state**. Renderers send `Action`s and the main process applies the shared reducer, saves to `%APPDATA%\mscw-helper\mscw-helper.json` (debounced, atomic write), and broadcasts the new state. Renderers apply actions optimistically so dragging and typing feel instant.
- The overlay is a single transparent, frameless, non-focusable window covering the chosen display, at the `screen-saver` always-on-top level. The renderer switches mouse pass-through on and off depending on whether the cursor is over a widget.
- Security: context isolation, a sandboxed preload, no Node in renderers, a strict CSP, all permissions denied, and navigation/window-open blocked. IPC senders and payloads are validated. Images are copied into app data and served only through the `mscw-img://` protocol.

### Roadmap

- **Phase 2 – OCR:** capture a user-selected screen region and read EXP and mesos automatically (e.g. tesseract.js). It reads pixels only, with no memory reading or injection, so it's account-safe.
- Import/export of layouts.
