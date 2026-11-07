import { type NativeImage } from 'electron';
import { dirname, join } from 'node:path';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import type { Action } from '../shared/reducer.ts';
import type { CapturePreview, PotionStatus, PotionTracker } from '../shared/types.ts';
import { emptyCountState, isPotionTracker, observeCount, type CountState } from '../shared/potions.ts';
import { listGameWindows, windowPreviews } from './window-capture.ts';

async function captureWindows(): Promise<Electron.DesktopCapturerSource[]> {
  const sources = await listGameWindows();
  if (!sources.length) throw new Error('No game window capture sources are available.');
  return sources;
}

export async function capturePreviews(): Promise<CapturePreview[]> {
  return windowPreviews();
}

function cropCount(image: NativeImage, potion: PotionTracker): Buffer {
  if (image.isEmpty()) throw new Error('Screen capture returned an empty image.');
  const size = image.getSize();
  const x = Math.floor(potion.region.x * size.width);
  const y = Math.floor(potion.region.y * size.height);
  const width = Math.min(size.width - x, Math.round(potion.region.width * size.width));
  const height = Math.min(size.height - y, Math.round(potion.region.height * size.height));
  if (width < 4 || height < 4 || width > 500 || height > 200) {
    throw new Error('Select only the potion quantity digits (between 4x4 and 500x200 screen pixels).');
  }
  return image.crop({ x, y, width, height }).resize({ width: width * 4, height: height * 4, quality: 'best' }).toPNG();
}

export class PotionCapture {
  private worker: Worker | null = null;
  private active: { id: string; potions: PotionTracker[]; counts: Map<string, CountState> } | null = null;
  private initializing = false;
  private reading = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dispatch: (action: Action) => void;
  private status: (id: string, status: PotionStatus) => void;

  constructor(dispatch: (action: Action) => void, status: (id: string, status: PotionStatus) => void) {
    this.dispatch = dispatch;
    this.status = status;
  }

  async start(id: string, potions: PotionTracker[]): Promise<void> {
    if (this.active || this.initializing || this.reading) throw new Error('Stop the existing potion detector and let its current reading finish before starting another.');
    if (!potions.length || potions.length > 8 || !potions.every(isPotionTracker) ||
        new Set(potions.map(p => p.id)).size !== potions.length) {
      throw new Error('Configure 1-8 potions with a purchase cost and screen region first.');
    }
    for (let i = 0; i < potions.length; i++) {
      for (let j = i + 1; j < potions.length; j++) {
        const a = potions[i]!;
        const b = potions[j]!;
        if (a.sourceId === b.sourceId && a.region.x < b.region.x + b.region.width &&
            b.region.x < a.region.x + a.region.width && a.region.y < b.region.y + b.region.height &&
            b.region.y < a.region.y + a.region.height) {
          throw new Error('Potion count regions must not overlap; this could charge the same use twice.');
        }
      }
    }
    this.initializing = true;
    const active = { id, potions: structuredClone(potions), counts: new Map<string, CountState>() };
    this.active = active;
    this.status(id, { running: true, message: 'Starting local OCR...', counts: {} });
    try {
      if (!this.worker) {
        this.worker = await createWorker('eng', OEM.LSTM_ONLY, {
          langPath: join(dirname(require.resolve('@tesseract.js-data/eng')), '4.0.0'),
          cacheMethod: 'none',
          errorHandler: (error: unknown) => console.error('[potion-capture] OCR worker failed', error)
        });
        await this.worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '0123456789' });
      }
      if (this.active === active) void this.tick();
    } catch (error) {
      this.stop(id, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  stop(id: string, message = 'Stopped. Starting again establishes a new baseline.'): void {
    if (this.active?.id !== id) return;
    this.active = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.status(id, { running: false, message, counts: {} });
  }

  private async tick(): Promise<void> {
    const active = this.active;
    if (!active || !this.worker) return;
    this.reading = true;
    const counts: Record<string, number> = {};
    const messages: string[] = [];
    try {
      const windows = await captureWindows();
      for (const potion of active.potions) {
        const source = windows.find(s => s.id === potion.sourceId);
        if (!source) throw new Error(`Game window for ${potion.name} is unavailable. Select its region again.`);
        const image = cropCount(source.thumbnail, potion);
        const result = await this.worker.recognize(image);
        if (this.active !== active) return;
        const observation = observeCount(active.counts.get(potion.id) ?? emptyCountState(), result.data.text, result.data.confidence);
        active.counts.set(potion.id, observation.state);
        if (observation.count !== null) counts[potion.id] = observation.count;
        messages.push(`${potion.name}: ${observation.message}`);
        if (observation.used) this.dispatch({ type: 'potion/used', id: active.id, potionId: potion.id, quantity: 1 });
      }
      if (this.active === active) this.status(active.id, { running: true, message: messages.join(' '), counts });
    } catch (error) {
      console.error('[potion-capture] capture failed', error);
      if (this.active === active) this.stop(active.id, error instanceof Error ? error.message : String(error));
    } finally {
      this.reading = false;
    }
    if (this.active === active) this.timer = setTimeout(() => void this.tick(), 1500);
  }

  dispose(): void {
    if (this.active) this.stop(this.active.id);
    if (this.worker) void this.worker.terminate().catch((error: unknown) => console.error('[potion-capture] shutdown failed', error));
  }
}
