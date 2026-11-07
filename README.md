# MSCW Helper

A customizable, always-on-top game overlay for **MapleStory Classic World**.

Widgets float above the game in a transparent window. Empty space passes clicks straight through to the game, and you can arrange widgets into multiple saved **layouts**.

## Alpha testing on Windows

The current alpha is version `0.1.0-alpha.3`. After running `npm run dist`, open
`release\MSCW Helper 0.1.0-alpha.3.exe` for the portable version, or run
`release\MSCW Helper Setup 0.1.0-alpha.3.exe` to install it. The portable app
still stores its settings and imported assets in the Windows user data directory.
The executables are unsigned, so Windows may display a publisher warning.
Build output in `release\` is ignored by Git and must be distributed separately.

Automatic EXP, meso pickups and loot estimates use game-window notification OCR.
Manual tracking remains available. Recognition is experimental, not an audited
record of every game event.

## Widgets

| Widget | What it does |
| --- | --- |
| EXP Tracker | Automatic EXP gain notifications with EXP/min, ten-minute average EXP/min and session gains; optional manual points mode |
| Meso Tracker | Automatic meso pickups plus estimated NPC value of loot, gain rate and potion expenses; optional manual wallet mode |
| Session Timer | Start / pause / reset stopwatch |
| Buff / Cooldown Timers | Click (or press a global hotkey) to start; warning pulse + beep; optional auto-repeat |
| Boss / Event Timers | Respawn countdowns (“Killed” button) or daily scheduled times |
| Notes & Checklist | Free notes + checklist that can auto-uncheck at daily reset |
| Image / Map Panel | Show reference images (maps, quest guides), flip between several |

You can add multiple widgets of each type.

## Using it

- **Control panel** – opens on launch. Closing it keeps the app running in the tray. Click the tray icon to reopen it, or right-click it for quick toggles and Quit.
- **Edit layout** (`Ctrl+Shift+F2`) – drag widgets by any part and resize them from the edges. The ⚙ button opens a widget's settings, ✕ hides it in this layout, and the toolbar adds or re-shows widgets.
- **Layouts** – each layout remembers which widgets are visible plus their position, size, opacity and scale. Widget data (notes, counters, timers) is shared between layouts. Switch layouts from the toolbar, the tray, or `Ctrl+Shift+F5`.
- **Click-through** (`Ctrl+Shift+F3`) – makes the whole overlay ignore the mouse. Use it if widgets get in the way while you play.
- **Show / hide overlay** – `Ctrl+Shift+F1`. **Open control panel** – `Ctrl+Shift+F4`.

All hotkeys can be changed in **Settings**. Buff timers can have their own global hotkeys. Note that a global hotkey is captured by MSCW Helper, so the game won't receive that key combination.

### Automatic game-window tracking

1. Open **Settings -> Automatic game-window tracking** and click **Refresh game
   windows / preview**. Select the MapleStory window, not your whole display.
2. Select the EXP and Meso widgets that should receive automatic readings.
3. The default notification rectangle is based on the supplied 2560x1440 gameplay
   video. If needed, drag around the right-hand notification stack and save the
   region. Exclude chat, quick slots and the status bar.
4. Choose a GMS API version (62 is only a reference, not a verified MSCW match),
   then **Start automatic tracking**. Start resets the selected widgets for a new
   session; Stop retains totals. Tracking does not automatically start at launch.

Live capture uses a window-specific video stream. The game can move on the
desktop without changing capture coordinates. The overlay remains positioned
by the existing layout/display settings; no injection or memory access is used.
Window previews enumerate capturable windows; live gain capture selects only the
chosen window. If the game closes, capture ends; select it again after relaunch.
Minimized/static windows may stop producing frames, and the UI reports zero FPS
after three seconds without a fresh frame.

The control panel and overlay show **actual received capture FPS**, capped at
**30 FPS**. The video requests at most 30 FPS and both renderer and main process
limit accepted frames. OCR runs independently and sequentially with a 250 ms
pause between reads; it does not run 30 times per second. Only the latest cropped
frame is retained for OCR, with no accumulating frame queue or screenshot upload.

Supported English notification formats:

- `You received EXP (+12)`
- `You have gained mesos (+14)`
- `Squishy Liquid x1 earned. (Etc)`

Bright notification text is isolated from the moving background. Two matching
OCR stacks are required; numeric words/digits have confidence checks. Scrolling
history is matched to avoid replaying visible messages, including partial stacks.
Messages already visible when tracking starts are treated as a baseline.

**Session mesos gained = meso pickups + estimated loot value.** Inventory items
use MapleStory.io NPC prices, with editable per-item overrides under **Loot
valuation**. Exact item names are preferred; a unique one-character near match
can resolve an OCR typo. Only item-name/version queries are sent to the API.
Unknown/ambiguous prices stay visibly unvalued and excluded, not silently valued
at zero. Price overrides update the retained loot total without another pickup.
Wallet balances and item sale proceeds are not added to notification gains, so
valuing loot does not also count its later sale. Farming net subtracts estimated
potion costs.

Automatic EXP reports gross observed gains, not the character's current EXP or
death losses. Time-to-level is unavailable without current/required EXP. EXP/min
and the trailing ten-minute average use observed cumulative gains and decay while
idle. Fast/faded/overlapping messages can be missed or misread, and repeated
identical messages with no visible stack change cannot always be distinguished.
The confidence checks deliberately skip uncertainty rather than promise exact
totals. Keep the notification area visible and validate against the game.

### Manual EXP sessions

Enter actual whole EXP points, the EXP requirement for your current level, and
your level, then click **Record EXP**. The first reading establishes a baseline.
Record every level transition: a level increment uses the previous requirement
to account for the rollover; a same-level decrease counts as an EXP loss.
Skipped levels require a new session because their requirements are unknown.

**EXP/min** measures the trailing minute; **10-min avg/min** measures the trailing
ten minutes, warming up over available elapsed time until ten minutes have passed.
Sparse readings are interpolated and the last value is held between updates,
so these are estimates and idle rates decay. Record frequently for useful rates.
**Session EXP (net)** retains all gains minus losses until **Reset**, independently
of the rolling history and Session Timer widget. Sessions persist across restarts;
reset when beginning a new play session.

Old kill-counter widgets and their placements are removed when loading saved
layouts. Old percentage EXP history is cleared rather than mistaken for points;
other widgets and layout settings are preserved.

### Potion expenses (experimental)

Select a **Meso Tracker** in the control panel:

1. Enter a MapleStory.io GMS version and potion item ID, then **Look up potion**.
   For example, `62` / `2000000` returns Red Potion. GMS 62 is a reference dataset,
   not a verified MSCW match. Only the requested ID/version is sent to the API.
2. **Add potion**, then enter your actual purchase cost per potion. The API's
   NPC sell price is shown for reference, not assumed to be the purchase price.
3. **Select count region** takes a local still window preview. Choose the game and
   drag tightly around only the quantity digits for that potion, then save.
4. **Start potion detection**. Keep those quantities visible and uncovered, and
   keep the inventory in the same position inside the game window. Up to eight non-overlapping
   regions can be monitored in one Meso Tracker at a time.

OCR and its bundled English recognition data run locally with no screenshot
uploads or saved frame history. Windows are captured in memory; only selected
crops are passed to OCR. Readings run sequentially, with a 1.5-second pause after
each batch. Two consecutive matching readings with confidence at least 85 are
required. A confirmed decrease of one adds the configured cost exactly once.
Unreadable digits reset the baseline; increases rebaseline as restocks and larger
decreases are reported as ambiguous without a charge. Fast uses, zero/hidden
quantities and unreadable frames can therefore be missed.

**This cannot distinguish use from selling, dropping, trading or moving potions.**
Stop detection before managing inventory. Costs and farming net are estimates,
not changes to your recorded wallet. Purchases may already be reflected in wallet
readings, so subtracting replacement costs can double-count expenses in that case.
Resetting the Meso Tracker also clears potion costs; **Reset potion costs** clears
only those costs. Changing potion settings stops detection. Detection is off on
startup and must be explicitly started each session.
Old display-based potion regions need to be selected again as window regions.

### Tips

- Run the game in **windowed** or **borderless windowed** mode; exclusive fullscreen hides every overlay.
- Clicking buttons on widgets doesn't take keyboard focus from the game. Typing into a widget's text box does, so click the game again when you're done.
- On a multi-monitor setup, pick the game's monitor under **Settings → Display**.

### Import game UI assets

Under **Settings → Game UI assets**, choose the game's **Data** folder using
**Browse...** or enter its path, then click **Import UI assets**. The default is:

```text
C:\Program Files (x86)\Steam\steamapps\common\MapleStory\MSCW\Data
```

The folder must contain a non-empty `UI` directory. MSCW Helper copies its complete
contents (including nested WZ archives, INI files and fonts) into a private snapshot
under `%APPDATA%\mscw-helper\game-assets`. It does not change the game installation,
copy other game-data folders, or upload assets. Use only assets you are authorized
to use; they are not bundled with the app or committed to this repository.

The app remembers your selected path and shows the latest import's file count,
size, date, source and local destination. Each snapshot includes a file manifest.
Re-import after game updates; a successful import replaces the previous snapshot,
while a failed import leaves the last successful one untouched. Missing folders, access errors and
empty UI directories are reported in Settings.

**This imports the original files, not decoded images.** The current game's UI uses
`.wz` archives; extracting recognition templates for EXP and wallet OCR remains
a future step. Potion OCR does not currently use these archives. The game does
not need to be running to import.

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

- **Phase 2 – OCR:** extract UI templates from the locally imported WZ assets, capture a user-selected screen region and read EXP and mesos automatically (e.g. tesseract.js). No memory reading or injection is planned; compatibility with the game's rules still needs to be verified.
- Import/export of layouts.
