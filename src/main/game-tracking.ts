import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { nativeImage, type NativeImage } from 'electron';
import { CAPTURE_INTERVAL_MS, estimateExpRequirement, expRequirementRange, parseExpFields, validRegion, type ExpReading, type ExpRequirementRange } from '../shared/game-tracking.ts';
import type { Action } from '../shared/reducer.ts';
import type { GameTrackingConfig, GameTrackingStatus } from '../shared/types.ts';
import { listGameWindows } from './window-capture.ts';
import { BitmapFont, binarizeStatus, EXP_FONT, FONT_ROWS, LEVEL_FONT, statusGrid, type FontGrid } from '../shared/status-font.ts';

const EXP_READER = new BitmapFont(EXP_FONT);

/** Font-pixel grid of one packed capture field (level at y=0, EXP at y=160). */
function fieldGrid(frame: NativeImage, top: number, level: boolean): FontGrid | null {
  const image = frame.crop({ x: 0, y: top, width: 1200, height: 160 });
  const { width, height } = image.getSize();
  return statusGrid(binarizeStatus(image.toBitmap(), width, height, level), width, height);
}

/** Crisp black-on-white rendering of a font grid for OCR of not-yet-known level digits. */
function gridImage(grid: FontGrid): Buffer {
  const cell = 8, pad = 24, width = grid.width * cell + pad * 2, height = FONT_ROWS * cell + pad * 2;
  const pixels = Buffer.alloc(width * height * 4, 255);
  for (let row = 0; row < FONT_ROWS; row++) for (let col = 0; col < grid.width; col++) {
    if (!grid.cells[row * grid.width + col]) continue;
    for (let y = 0; y < cell; y++) {
      const offset = ((pad + row * cell + y) * width + pad + col * cell) * 4;
      for (let x = 0; x < cell; x++) pixels.fill(0, offset + x * 4, offset + x * 4 + 3);
    }
  }
  return nativeImage.createFromBitmap(pixels, { width, height }).toPNG();
}

interface Active {
  config: GameTrackingConfig; frames: number; lastFrame: number; started: number;
  fpsStart: number; fpsFrames: number; fps: number; message: string;
  candidate: string; confirmations: number; levelGrid: FontGrid | null; needsOcr: boolean;
  previous: ExpReading | null; required: number | null; range: ExpRequirementRange | null;
  level: BitmapFont; resolution?: { width: number; height: number }; reader: 'calibrating' | 'font';
}

export class GameTracking {
  private active: Active | null = null;
  private worker: Worker | null = null;
  private initializing = false;
  private reading = false;
  private disposed = false;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private dispatch: (action: Action) => void;
  private status: (status: GameTrackingStatus) => void;
  private startCapture: (config: GameTrackingConfig) => Promise<void>;
  private stopCapture: () => void;

  constructor(
    dispatch: (action: Action) => void,
    status: (status: GameTrackingStatus) => void,
    startCapture: (config: GameTrackingConfig) => Promise<void>,
    stopCapture: () => void
  ) {
    this.dispatch = dispatch; this.status = status;
    this.startCapture = startCapture; this.stopCapture = stopCapture;
  }

  async start(config: GameTrackingConfig): Promise<void> {
    if (this.disposed) throw new Error('MSCW Helper is shutting down.');
    if (this.active || this.initializing || this.reading) throw new Error('Stop tracking and wait for the current read to finish.');
    if (!/^window:\d+:\d+$/.test(config.sourceId) || !validRegion(config.region) ||
        (config.levelRegion !== undefined && !validRegion(config.levelRegion))) {
      throw new Error('Select a game window and bottom status-bar region.');
    }
    const source = (await listGameWindows()).find(s => s.id === config.sourceId);
    if (!source || source.thumbnail.isEmpty()) throw new Error('The selected game window is unavailable. Restore and select it again.');
    this.initializing = true;
    const active: Active = { config: structuredClone(config), frames: 0, lastFrame: -Infinity, started: performance.now(),
      fpsStart: performance.now(), fpsFrames: 0, fps: 0, message: 'Waiting for game frames...',
      candidate: '', confirmations: 0, levelGrid: null, needsOcr: false,
      previous: null, required: null, range: null, level: new BitmapFont(LEVEL_FONT), reader: 'calibrating' };
    this.active = active;
    this.publish();
    try {
      this.dispatch({ type: 'exp/start', id: config.expWidgetId });
      await this.startCapture(config);
      if (this.active === active) this.healthTimer = setInterval(() => this.health(active), 1000);
    } catch (error) {
      this.stop(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  stop(message = 'EXP tracking stopped. Start creates a new EXP session.'): void {
    this.active = null;
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
    this.stopCapture();
    this.status({ running: false, fps: 0, frames: 0, message });
  }

  private publish(): void {
    const a = this.active;
    if (a) this.status({ running: true, fps: a.fps, frames: a.frames, message: a.message,
      resolution: a.resolution, reader: a.reader });
  }

  private health(active: Active): void {
    if (this.active !== active) return;
    const now = performance.now();
    if (!active.frames && now - active.started > 10000) {
      this.stop('No game frames received. Restore the game and start again.');
      return;
    }
    if (active.frames && now - active.lastFrame > 3000) {
      active.fps = 0; active.fpsFrames = 0; active.fpsStart = now;
      active.message = 'No fresh game frames; tracking paused. Restore the game window.';
      this.publish();
    }
  }

  frame(image: unknown, width?: unknown, height?: unknown): void {
    const active = this.active;
    if (!active) return;
    const now = performance.now();
    if (now - active.lastFrame < CAPTURE_INTERVAL_MS) return;
    if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > 12 * 1024 * 1024) {
      this.stop('Invalid window capture frame.');
      return;
    }
    if (typeof width === 'number' && typeof height === 'number' && Number.isSafeInteger(width) &&
        Number.isSafeInteger(height) && width > 0 && height > 0 && width <= 16384 && height <= 16384) {
      active.resolution = { width, height };
    }
    active.lastFrame = now;
    active.frames++;
    active.fpsFrames++;
    try {
      this.recognize(active, nativeImage.createFromBuffer(Buffer.from(image.slice('data:image/png;base64,'.length), 'base64')));
    } catch (error) {
      console.error('[game-tracking] frame recognition failed', error);
      this.stop(error instanceof Error ? error.message : String(error));
      return;
    }
    const elapsed = now - active.fpsStart;
    if (elapsed >= 1000) {
      active.fps = Math.min(30, active.fpsFrames * 1000 / elapsed);
      active.fpsFrames = 0; active.fpsStart = now;
      this.publish();
    }
  }

  private recognize(active: Active, frame: NativeImage): void {
    active.reader = 'calibrating';
    const expGrid = fieldGrid(frame, 160, false);
    const expText = expGrid && EXP_READER.read(expGrid);
    if (!expText) {
      active.message = 'EXP numbers not recognized in this frame. The EXP region must cover only the EXP numbers.';
      return;
    }
    const levelGrid = fieldGrid(frame, 0, true);
    active.levelGrid = levelGrid;
    if (!levelGrid) {
      active.message = 'Level digits not found. The level region must cover the orange level tiles.';
      return;
    }
    let levelText = active.level.read(levelGrid);
    let learn = false;
    const previous = active.previous;
    if (!levelText && previous) {
      const next = String(previous.level + 1);
      const reset = parseExpFields(next, expText);
      // Unknown level digits are labeled as the next level only when the EXP bar has reset.
      if (reset && reset.percent < previous.percent && active.level.label(levelGrid, next, false)) {
        levelText = next; learn = true;
      }
    }
    if (!levelText) {
      active.needsOcr = true;
      if (!this.reading) void this.read();
      return;
    }
    active.needsOcr = false;
    const reading = parseExpFields(levelText, expText);
    if (!reading) {
      active.message = `Unexpected status text: LV ${levelText} / EXP ${expText}.`;
      return;
    }
    active.reader = 'font';
    if (this.accept(active, reading) && learn) active.level.label(levelGrid, levelText, true);
  }

  private accept(active: Active, reading: ExpReading): boolean {
    if (active.previous && (reading.level < active.previous.level || reading.level > active.previous.level + 1)) {
      active.message = 'Unexpected level change; frame skipped. Start a new session if changing characters.';
      return false;
    }
    const sameLevel = active.previous?.level === reading.level;
    const range = expRequirementRange(reading, sameLevel ? active.range ?? undefined : undefined);
    const estimate = estimateExpRequirement(reading, sameLevel ? active.required ?? undefined : undefined);
    if (estimate === null) {
      active.message = 'Waiting for nonzero EXP percentage to estimate the requirement.';
      return false;
    }
    if (!range) {
      active.message = 'EXP points/percentage inconsistent; frame skipped. Check numeric regions.';
      return false;
    }
    const required = Math.max(range.min, Math.min(range.max, estimate));
    const changed = !active.previous || reading.level !== active.previous.level ||
      reading.current !== active.previous.current || reading.percent !== active.previous.percent || required !== active.required;
    active.previous = reading; active.required = required; active.range = range;
    if (changed) this.dispatch({ type: 'exp/status', id: active.config.expWidgetId, value: reading.current,
      level: reading.level, percent: reading.percent, required, at: Date.now() });
    active.message = `Level ${reading.level}: ${reading.current.toLocaleString('en-US')} EXP (${reading.percent}%). Reading every frame.`;
    return true;
  }

  /** OCR is only used for level digits that are not built in and were not seen at a level-up. */
  private async read(): Promise<void> {
    const active = this.active;
    if (!active || this.reading || this.disposed || !active.needsOcr || !active.levelGrid) return;
    this.reading = true;
    const grid = active.levelGrid;
    active.message = 'Reading the character level with local OCR...';
    try {
      if (!this.worker) {
        this.worker = await createWorker('eng', OEM.LSTM_ONLY, {
          langPath: join(dirname(require.resolve('@tesseract.js-data/eng')), '4.0.0'), cacheMethod: 'none',
          errorHandler: (error: unknown) => console.error('[game-tracking] OCR worker failed', error)
        });
        await this.worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '0123456789' });
      }
      if (this.active !== active || this.disposed) return;
      const text = (await this.worker.recognize(gridImage(grid))).data.text.replace(/\s+/g, '');
      if (this.active !== active || !active.needsOcr) return;
      if (!/^\d{1,3}$/.test(text) || !active.level.label(grid, text, false)) {
        active.candidate = ''; active.confirmations = 0;
        active.message = `Character level unreadable (OCR "${text}"). Check the level region.`;
      } else {
        active.confirmations = active.candidate === text ? active.confirmations + 1 : 1;
        active.candidate = text;
        if (active.confirmations >= 2) {
          active.level.label(grid, text, true);
          active.message = `Level ${text} recognized.`;
        } else active.message = 'Confirming character level...';
      }
      this.publish();
    } catch (error) {
      console.error('[game-tracking] level OCR failed', error);
      if (this.active === active) this.stop(error instanceof Error ? error.message : String(error));
    } finally {
      this.reading = false;
      if (this.disposed) this.terminateWorker();
    }
  }

  // Tesseract's node send() is async and unawaited, so a job started after terminate()
  // becomes an unhandled rejection. Terminate only once no OCR job can still start.
  dispose(): void {
    this.stop();
    this.disposed = true;
    if (!this.reading) this.terminateWorker();
  }

  private terminateWorker(): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) void worker.terminate().catch((e: unknown) => console.error('[game-tracking] shutdown failed', e));
  }
}
