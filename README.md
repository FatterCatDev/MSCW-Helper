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

Automatic EXP uses the persistent bottom status-bar numbers, not notifications.
Automatic meso tracking reads the balance in the open inventory. Automatic loot
tracking is not available; screen recognition is experimental.

## Widgets

| Widget | What it does |
| --- | --- |
| Training Tracker | EXP readings, rates and graph; inventory wallet balance and session change, potion expenses and used-item counts. |
| Session Timer | Starts automatically on app launch and resets on shutdown; manual start, pause and reset controls remain available |
| Buff / Cooldown Timers | Click (or press a global hotkey) to start; warning pulse + beep; optional auto-repeat |
| Boss / Event Timers | Respawn countdowns (“Killed” button) or daily scheduled times |
| Notes & Checklist | Free notes + checklist that can auto-uncheck at daily reset |
| Image / Map Panel | Show reference images (maps, quest guides), flip between several |

You can add multiple widgets of each type.

## Using it

- **Initialization** – the only window shown on launch. Choose the game window and click **Start** to begin automatic tracking and show the overlay. Closing Initialization quits the app. A game must be selected each launch.
- **Debug mode** – an optional Initialization checkbox shows a movable, resizable debug overlay with recent console messages, HP/MP readings and estimated recovery-item use totals. It is off by default and only lasts for the current app session. The console keeps the latest 200 entries in memory; it does not save screenshots or logs.
- **Control panel** – available from the tray after Start. Closing it keeps the app running in the tray. Click the tray icon to reopen it, or right-click it for quick toggles and Quit.
- **Edit layout** (`Ctrl+Shift+F2`) – drag widgets by any part and resize them from the edges. The ⚙ button opens a widget's settings, ✕ hides it in this layout, and the toolbar adds or re-shows widgets.
- **Layouts** – each layout remembers which widgets are visible plus their position, size, opacity and scale. Widget data (notes, counters, timers) is shared between layouts. Switch layouts from the toolbar, the tray, or `Ctrl+Shift+F5`.
- **Click-through** (`Ctrl+Shift+F3`) – makes the whole overlay ignore the mouse. Use it if widgets get in the way while you play.
- **Show / hide overlay** – `Ctrl+Shift+F1`. **Open control panel** – `Ctrl+Shift+F4`.

All hotkeys can be changed in **Settings**. Buff timers can have their own global hotkeys. Note that a global hotkey is captured by MSCW Helper, so the game won't receive that key combination.

### Minimap and safe-area summary

After capture starts, the overlay looks for the expanded minimap and reads its
region and map name locally. If the name panel cannot be found, it shows only
an instruction to click the minimap **+** button. When a town with no listed
monsters is identified, the overlay shows a safe-area summary and the Session
Timer instead of the other widgets; other maps show the normal widgets. Unreadable names, ambiguous
results and API failures show an unknown-safety warning instead of assuming
the map is safe. When capture is stopped, normal widgets remain available.
Shop interiors with a compact minimap header are treated as safe when the
header explicitly identifies a shop or store; other compact or unreadable
headers still prompt the player to expand the minimap.
While the safe-area summary is visible, use **Edit layout** (`Ctrl+Shift+F2`)
to drag it. Its position is saved separately in each layout.

The name is searched using MapleStory.io's selected GMS data version; no
screenshot is uploaded. Map safety is an estimate based on that version, not a
guarantee that the map is safe in MSCW. Exact map and region names are required;
conflicting matching map records remain unknown. The panel detector is tuned to
the supplied minimap appearance and may not recognize other UI scales or themes.
The summary shows the active Training Tracker's accumulated training time.
Training time runs only while capture is active and the map is identified as
unsafe; it pauses in safe areas and while map safety is unknown or being read.
Resetting the Training Tracker resets this time; the independent Session Timer
continues according to its own controls. The summary also shows session EXP and
the wallet change since the first confirmed inventory reading.

### Inventory mesos

Open the item inventory after capture starts to establish the meso baseline.
The tracker looks for the inventory title and reads the balance locally, requiring
two matching frames before updating. It retains the last confirmed balance when
the inventory is closed, obscured or unreadable; reopen it to resume updates.
While capture is running, the last confirmed balance is sampled every second.
The Training Tracker shows the trailing one-minute meso rate and a blue line on
the ten-minute graph, with mesos scaled on the right and EXP on the left. When
inventory is closed, the graph holds the last balance until it can be read again.
The balance and session change reset with **Reset Tracker** and when the app
restarts, not when capture stops. **Reset Tracker** also clears estimated potion
cost and recovery-item counts. Estimated potion cost is displayed separately:
wallet change already includes purchases and is not reduced by that estimate.
Potion counts, estimated costs and recovery events also reset when the app shuts
down or starts a new session; selected recovery items and prices are retained.
The bitmap reader is tuned to the supplied inventory appearance and scales;
other UI scales, image smoothing or overlapping windows can prevent a reading.

### Automatic game-window EXP tracking

On launch, select the game in **Initialization** and click **Start**. The saved
EXP and level regions are reused; an EXP widget is selected automatically
(created if missing) and shown in the active layout. The chooser
closes into the tray after starting, leaving the overlay visible.

To adjust tracking afterward:

1. Stop tracking in **Settings -> Automatic game-window EXP tracking**, then click **Refresh game
   windows / preview**. Select the MapleStory window, not your whole display.
2. Select the EXP widget that should receive readings.
3. Choose **EXP points and percentage** under **Field to select**. Drag tightly
   around, for example, `183,449[56.58%]`; exclude the EXP label and coloured gauge.
   Save the EXP region.
4. Choose **Character level digits**, select only the digits (for example `41`,
   excluding `LV.` and the character name), and save the level region.
5. Click **Start automatic tracking**. Start resets only EXP; Stop retains its
   totals and the last confirmed meso balance.

Defaults are based on the supplied 2560x1440 video. Old notification crops
migrate to the new defaults; adjust both regions for different resolutions/UI
placements. HP/MP current/max numbers also feed the optional recovery tracker.

Live capture uses a window-specific video stream. The game can move on the
desktop without changing capture coordinates. The overlay remains positioned
by the existing layout/display settings; no injection or memory access is used.
Window previews enumerate capturable windows; live EXP capture selects only the
chosen window. When the selected game window closes, MSCW Helper automatically
quits and saves its state. Window lifetime is checked about once per second,
independently of EXP/potion tracking, including when tracking is stopped.
Relaunch MSCW Helper and select the game again for a new session.
Minimized/static windows may stop producing frames, and the UI reports zero FPS
after three seconds without a fresh frame.

The control panel and overlay show **actual received capture FPS**, capped at
**30 FPS**. The video requests at most 30 FPS and both renderer and main process
limit accepted frames. Every accepted frame is read immediately; only the latest
cropped frame is retained, with no accumulating frame queue or screenshot upload.

The live stream reports the actual game-window resolution automatically in
Settings (not the monitor resolution or preview-thumbnail size). Numeric regions
are window-relative. The defaults match borderless fullscreen 2560 x 1440 with
UI Size "Ideal Ratio"; if the game's UI placement differs, adjust the two
numeric regions manually.

The status bar uses fixed bitmap fonts drawn with nearest-neighbour scaling
(2x at 2560 x 1440). Each field is thresholded to its near-white digits, the
scale is recovered from the 7-pixel glyph height, and every glyph is compared
cell-for-cell with built-in templates of the game's EXP digits, `,` `.` `[` `]`
and `%`. EXP is therefore read exactly on every captured frame without OCR,
calibration or waiting for a repeated value. A frame containing anything that is
not an exact glyph is skipped rather than guessed. Built-in level templates
currently cover the level digits 1 and 4; other level digits are learned when a
level-up resets the EXP bar (the new level must be the previous level + 1), and
an unknown starting level is read once with local digit-only OCR, confirmed by
two matching reads.

The first reading establishes a baseline. Multiple gains between
readings are captured as one points difference; unchanged readings do not add
EXP. Session EXP is net, so same-level losses are included. A single level-up
uses the prior level's estimated requirement for rollover. Skipped levels or
lower-level readings are rejected with an explicit message; start a new session
when changing characters or after skipping levels.
EXP/min is the trailing minute; the ten-minute average warms up over available
time and is used for estimated time-to-level.
The EXP display refreshes rates, tracking duration and estimated time-to-level
every second, even without new OCR readings. EXP points, percentage and session
totals change only with confirmed readings; the display does not extrapolate
unobserved EXP gains.
The EXP widget also includes a scrolling ten-minute EXP/min line graph with one
point per second. It plots the trailing one-minute rate (not raw EXP per second),
including idle decay and negative rates from net losses. The vertical scale
adjusts automatically and includes a zero line; time before usable readings is
left blank. The graph is reconstructed from saved EXP observations, using only
readings at or before each point, so it remains available after hiding/reopening
the overlay. Eleven minutes of EXP readings plus a boundary predecessor are
retained to calculate the earliest minute-rate point in the ten-minute graph.
Resize the EXP widget in Edit layout if more space is needed.

**Requirement estimate = current EXP points / (displayed percentage / 100).**
No verified EXP-table endpoint was found in MapleStory.io; the app does not
pretend to fetch an exact requirement. Displayed percentages are rounded, so
time-to-level and rollover gains are estimates. Within the same level, readings
must share a possible requirement within percentage rounding tolerance; the
requirement range is refined as more points become available.
A zero-percentage first reading waits for enough EXP to estimate the requirement;
near-zero percentages make the estimate less accurate. Start a new session if
the established estimate proves unsuitable.

Keep both fields visible. OCR can still miss or misread digits, and net changes
cannot reveal gains and losses that cancel between reads. Manual EXP mode is
available after resetting the EXP widget (which stops automatic tracking).

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
of the rolling history and Session Timer widget. EXP totals persist across restarts;
reset them when beginning a new play session. The Session Timer starts fresh on
app launch and resets on shutdown, including when the game window closes.
Timers added after launch can be started manually.

Old kill-counter widgets and their placements are removed when loading saved
layouts. Old percentage EXP history is cleared rather than mistaken for points;
other widgets and layout settings are preserved.

### Potion expenses (experimental)

Select a **Training Tracker** in the control panel:

Hotkey icon/quantity detection has been removed. Potion use is now estimated from
changes to the bottom HP/MP current/max numbers, using the same bitmap-font video
capture as EXP (up to 30 FPS, no screenshot uploads).

1. In **Settings -> Automatic game-window tracking**, stop capture if needed,
   refresh the preview and select **HP current/max numbers** and **MP current/max
   numbers**. Select the complete numeric field, such as `[1084/1995]`, excluding
   the HP/MP label and coloured gauge. Save each region and restart capture.
2. In the overlay **Training Tracker**, use the **HP recovery** and **MP recovery**
   icon dropdowns to select one item for each stat. Only items restoring that stat
   appear in its dropdown. Item names and base recovery amounts are available in
   tooltips; verified item icons come from MapleStory.io (GMS v62) and require a connection.
   Classic and GMS item IDs differ, so icons use a separate mapping. Items without
   a verified GMS icon show `?` rather than an unrelated icon.
   The same dropdowns are available in configuration. Choose the empty dashed
   icon to clear either slot. Leave both blank to disable potion tracking; existing totals remain.
   Combined HP/MP items can occupy either or both slots and are counted once.
   A stat with no selected item restoring it does not generate recovery events.
   Saved prices do not select items automatically.
3. Recovery tracking starts automatically once game capture is running and at
   least one item is selected. No job or skill setup is needed. The first valid reading
   establishes a baseline; unchanged frames do not add events.

An observed HP or MP increase counts when it is within **50% to 150%**
of a selected item's base recovery, inclusive. For example, Lemon's 150 MP
matches increases from 75 through 225 MP. Increases of 10 or less and
out-of-range changes are ignored. Separate selected HP and MP items can each
trigger from the same frame; a combined item matching both stats counts once.
Unique matches count an estimated use and charge the NPC/manual purchase cost.
Items with unknown prices are counted but remain uncharged.

Different items can share amounts: Red Potion and a Daydream both restore 100 HP;
Blue Potion and Salad both restore 200 MP. Selecting only the item you use removes
ambiguity from unselected look-alikes. If multiple selected items could explain
an observation, it is unidentified and uncharged. Use **Review uncharged recovery events** to identify an item
you know was consumed and record its cost once. Only the latest 200 events are
retained for review; total use/cost/unidentified counters persist.

**HP/MP changes cannot prove potion use.** Healing skills, natural regeneration,
damage between frames and several recoveries between frames can produce the same
observed change. Known regeneration rates are not subtracted or invented. At a
stat cap, the full recovery is unknown; an observed increase within the range
still counts as requested and may be a false positive. Unreadable fields, gaps over one second,
death and changes to maximum stats establish a fresh baseline without a charge.
Recovery during these interruptions can be missed. HP and MP must both be readable.

Price overrides remain available under **Recovery item prices and estimated
counts**. Old item IDs, manual prices and past expenses are preserved; old hotkey
and count-region metadata is discarded. The Training Tracker displays only items
with recorded uses, including items selected earlier in the session. **Reset tracker**
clears EXP, wallet and recovery totals together, preserving selected items and
prices, and establishes new capture baselines. The current EXP reading is the
character's actual EXP and reappears after the next captured frame; session EXP,
rates and graph start fresh. **Reset potion costs and recovery
events** in settings leaves EXP and wallet samples alone.
Existing EXP and meso widgets are combined into a Training Tracker on upgrade;
their saved data and selections are retained.
Old multi-item selections migrate to the first eligible item in each stat dropdown.
Changing prices or potion selection establishes a fresh baseline.
Clearing both selections or stopping game capture stops recovery
tracking; it resumes automatically when the prerequisites are met again.
Farming net is an estimate, not a wallet deduction.

The bundled database, `src/shared/npc-recovery-prices.ts`, contains 33 recovery
items listed in [NiaDB's Classic NPC consumable tables](https://meowdb.com/msclassic/npc-shops/item-efficiency/consumables),
checked November 7, 2026: 29 with shop purchase prices and four with shops marked
not open in this release. It includes HP/MP potions, recovery food and recovery
Daydream items, keyed by original MapleStory item ID (not NiaDB's page ID).
This is a dated snapshot, not a complete list of every obtainable recovery item.
Missing items, including recovery drops without listed NPC sellers, have no
verified NPC purchase price. No NiaDB requests run during normal app use.

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
