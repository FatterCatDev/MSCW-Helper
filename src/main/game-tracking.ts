import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { CAPTURE_INTERVAL_MS, newGainEvents, parseConfidentGainLine, validRegion, type GainEvent } from '../shared/game-tracking.ts';
import type { Action } from '../shared/reducer.ts';
import type { GameTrackingConfig, GameTrackingStatus } from '../shared/types.ts';
import { listGameWindows } from './window-capture.ts';
import { lookupLoot } from './items.ts';

export class GameTracking {
  private active: { config: GameTrackingConfig; previous: GainEvent[] | null; frames: number; latest: Buffer | null; lastFrame: number;
    fpsStart: number; fpsFrames: number; fps: number; message: string; blank: number; candidate: string; confirmations: number } | null = null;
  private worker: Worker | null = null;
  private initializing = false;
  private reading = false;
  private ocrTimer: ReturnType<typeof setTimeout> | null = null;
  private dispatch: (action: Action) => void;
  private status: (status: GameTrackingStatus) => void;
  private startCapture: (config: GameTrackingConfig) => Promise<void>;
  private stopCapture: () => void;

  constructor(dispatch: (action: Action) => void, status: (status: GameTrackingStatus) => void,
    startCapture: (config: GameTrackingConfig) => Promise<void>, stopCapture: () => void) {
    this.dispatch = dispatch;
    this.status = status;
    this.startCapture = startCapture;
    this.stopCapture = stopCapture;
  }

  async start(config: GameTrackingConfig): Promise<void> {
    if (this.active || this.initializing || this.reading) throw new Error('Stop tracking and wait for the current capture to finish.');
    if (!/^window:\d+:\d+$/.test(config.sourceId) || !validRegion(config.region) ||
        !/^\d{1,4}[A-Za-z]?$/.test(config.apiVersion)) throw new Error('Select a game window, gain-message region and valid API version.');
    const source = (await listGameWindows()).find(s => s.id === config.sourceId);
    if (!source || source.thumbnail.isEmpty()) throw new Error('The selected game window is unavailable. Restore it and select it again.');
    this.initializing = true;
    const active = { config: structuredClone(config), previous: null, frames: 0, latest: null, lastFrame: -Infinity,
      fpsStart: performance.now(), fpsFrames: 0, fps: 0, message: 'Starting local notification OCR...', blank: 0,
      candidate: '', confirmations: 0 };
    this.active = active;
    this.publish();
    try {
      if (!this.worker) {
        this.worker = await createWorker('eng', OEM.LSTM_ONLY, {
          langPath: join(dirname(require.resolve('@tesseract.js-data/eng')), '4.0.0'), cacheMethod: 'none',
          errorHandler: (error: unknown) => console.error('[game-tracking] OCR worker failed', error)
        });
        await this.worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      }
      if (this.active !== active) return;
      this.dispatch({ type: 'tracking/start', expId: config.expWidgetId, mesoId: config.mesoWidgetId, at: Date.now() });
      active.fpsStart = performance.now();
      this.failedPrices.clear();
      await this.startCapture(config);
      this.ocrTimer = setTimeout(() => void this.read(), 250);
    } catch (error) {
      this.stop(error instanceof Error ? error.message : String(error));
      throw error;
    } finally { this.initializing = false; }
  }

  stop(message = 'Tracking stopped. Start creates a new gain session.'): void {
    this.active = null;
    this.pendingPrices.clear();
    if (this.ocrTimer) clearTimeout(this.ocrTimer);
    this.ocrTimer = null;
    this.stopCapture();
    this.status({ running: false, fps: 0, frames: 0, message });
  }

  private publish(): void {
    const a = this.active;
    if (a) this.status({ running: true, fps: a.fps, frames: a.frames, message: a.message });
  }

  frame(image: unknown): void {
    const active = this.active;
    if (!active) return;
    const now = performance.now();
    if (now - active.lastFrame < CAPTURE_INTERVAL_MS) return;
    if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > 12 * 1024 * 1024) {
      this.stop('Invalid window capture frame.');
      return;
    }
    active.latest = Buffer.from(image.slice('data:image/png;base64,'.length), 'base64');
    active.lastFrame = now;
    active.frames++;
    active.fpsFrames++;
    const elapsed = performance.now() - active.fpsStart;
    if (elapsed >= 1000) {
      active.fps = Math.min(30, active.fpsFrames * 1000 / elapsed);
      active.fpsFrames = 0; active.fpsStart = performance.now();
      this.publish();
    }
  }

  private async read(): Promise<void> {
    const active = this.active;
    if (!active || !this.worker) return;
    if (!active.latest) {
      if (performance.now() - active.fpsStart > 10000) this.stop('No game frames received. Restore the game window and start again.');
      else this.ocrTimer = setTimeout(() => void this.read(), 250);
      return;
    }
    if (performance.now() - active.lastFrame > 3000) {
      active.fps = 0; active.message = 'No fresh game frames; tracking is paused. Restore the game window.';
      this.publish();
      this.ocrTimer = setTimeout(() => void this.read(), 250);
      return;
    }
    this.reading = true;
    try {
      const result = await this.worker.recognize(active.latest, {}, { text: true, blocks: true });
      if (this.active !== active) return;
      if (result.data.confidence < 60 && result.data.text.trim()) {
        active.message = 'Low-confidence gain messages; skipped. Check the selected region.';
      } else {
        const lines = result.data.blocks?.flatMap(b => b.paragraphs.flatMap(p => p.lines)) ?? [];
        const current = lines.map(parseConfidentGainLine).filter((e): e is GainEvent => e !== null);
        let events: GainEvent[] = [];
        if (active.previous === null) active.previous = current;
        const key = JSON.stringify(current.map(e => e.key));
        active.confirmations = active.candidate === key ? active.confirmations + 1 : 1;
        active.candidate = key;
        if (active.confirmations < 2) {
          active.message = 'Confirming gain notification text...';
          this.publish();
          return;
        }
        if (!current.length) {
          if (!result.data.text.trim() && ++active.blank >= 2) active.previous = [];
          active.message = result.data.text.trim() ? 'No confident gain lines; uncertain text skipped.' : 'Watching gain notifications.';
        } else {
          active.blank = 0;
          if (active.previous !== null) events = newGainEvents(active.previous, current);
          active.previous = current;
          active.message = `Reading ${current.length} gain notification lines; ${events.length} new. Existing messages at start are ignored.`;
        }
        this.dispatch({ type: 'tracking/gain', expId: active.config.expWidgetId, mesoId: active.config.mesoWidgetId,
          exp: events.reduce((sum, e) => sum + (e.kind === 'exp' ? e.amount : 0), 0),
          mesos: events.reduce((sum, e) => sum + (e.kind === 'meso' ? e.amount : 0), 0),
          items: events.filter((e): e is Extract<GainEvent, { kind: 'item' }> => e.kind === 'item').map(e => ({ name: e.name, quantity: e.quantity })),
          at: Date.now() });
        for (const event of events) {
          if (event.kind === 'item') void this.valueItem(active, event.name);
        }
      }
      this.publish();
    } catch (error) {
      console.error('[game-tracking] OCR failed', error);
      if (this.active === active) this.stop(error instanceof Error ? error.message : String(error));
    } finally {
      this.reading = false;
      if (this.active === active) this.ocrTimer = setTimeout(() => void this.read(), 250);
    }
  }

  private pendingPrices = new Set<string>();
  private failedPrices = new Set<string>();

  private async valueItem(active: NonNullable<GameTracking['active']>, name: string): Promise<void> {
    const key = name.toLowerCase();
    const override = active.config.priceOverrides[key];
    if (Number.isSafeInteger(override) && override! >= 0) {
      this.dispatch({ type: 'loot/value', id: active.config.mesoWidgetId, name, unitValue: override!, itemId: null });
      return;
    }
    if (this.pendingPrices.has(key) || this.failedPrices.has(key)) return;
    this.pendingPrices.add(key);
    try {
      const item = await lookupLoot(name, active.config.apiVersion);
      if (this.active !== active) return;
      this.dispatch({ type: 'loot/value', id: active.config.mesoWidgetId, name, unitValue: item.price, itemId: item.id });
    } catch (error) {
      console.error('[game-tracking] loot price unavailable', error);
      if (this.active === active) {
        this.failedPrices.add(key);
        active.message = `Unvalued loot: ${name}. Set an override or retry after stopping.`;
        this.publish();
      }
    } finally { if (this.active === active) this.pendingPrices.delete(key); }
  }

  dispose(): void {
    this.stop();
    if (this.worker) void this.worker.terminate().catch((e: unknown) => console.error('[game-tracking] shutdown failed', e));
  }
}
