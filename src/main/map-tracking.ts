import { dirname, join } from 'node:path';
import { nativeImage } from 'electron';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import type { MapStatus } from '../shared/types.ts';
import { lookupMap, type MapClassification } from './map-lookup.ts';
import { isShopHeader } from '../shared/minimap.ts';

export class MapTracking {
  private worker: Worker | null = null;
  private busy = false;
  private disposed = false;
  private generation = 0;
  private lastImage: string | null = null;
  private pending: { image: string; version: string; generation: number; kind: 'expanded' | 'compact' } | null = null;
  private cache = new Map<string, MapClassification>();
  private publish: (status: MapStatus) => void;
  constructor(publish: (status: MapStatus) => void) { this.publish = publish; }

  reset(): void {
    this.generation++;
    this.lastImage = null;
    this.pending = null;
    this.publish({ state: 'searching', message: 'Looking for the minimap.' });
  }

  frame(image: unknown, version: string, kind: unknown = 'expanded'): void {
    if (image === null) {
      if (this.lastImage !== null) {
        this.generation++; this.lastImage = null; this.pending = null;
      }
      this.publish({ state: 'missing', message: 'Click + on the minimap until the map name is visible.' });
      return;
    }
    if ((kind !== 'expanded' && kind !== 'compact') ||
        typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > 2_000_000) {
      console.error('[minimap] Invalid map image.');
      this.generation++; this.lastImage = null; this.pending = null;
      this.publish({ state: 'unknown', message: 'Invalid minimap image; map safety is unknown.' });
      return;
    }
    const identity = `${kind}:${version}:${image}`;
    if (identity === this.lastImage) return;
    this.lastImage = identity;
    const generation = ++this.generation;
    this.pending = { image, version, generation, kind };
    this.publish({ state: 'reading', message: 'Reading the minimap name.' });
    void this.process();
  }

  private async process(): Promise<void> {
    if (this.busy || this.disposed || !this.pending) return;
    const job = this.pending;
    this.pending = null;
    this.busy = true;
    try {
      if (!this.worker) {
        this.worker = await createWorker('eng', OEM.LSTM_ONLY, {
          langPath: join(dirname(require.resolve('@tesseract.js-data/eng')), '4.0.0'), cacheMethod: 'none',
          errorHandler: (error: unknown) => console.error('[minimap] OCR worker failed', error)
        });
        await this.worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      }
      const source = nativeImage.createFromBuffer(Buffer.from(job.image.slice('data:image/png;base64,'.length), 'base64'));
      const size = source.getSize();
      if (source.isEmpty() || size.width < 80 || size.width > 2000 ||
          size.height < (job.kind === 'compact' ? 8 : 20) || size.height > 300)
        throw new Error('Unexpected minimap image size.');
      if (job.kind === 'compact') {
        const pixels = source.toBitmap();
        for (let i = 0; i < pixels.length; i += 4) {
          const dark = (pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) / 3 < 150;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = dark ? 0 : 255;
          pixels[i + 3] = 255;
        }
        const processed = nativeImage.createFromBitmap(pixels, { width: size.width, height: size.height })
          .resize({ width: size.width * 4, height: size.height * 4, quality: 'good' });
        const text = (await this.worker.recognize(processed.toPNG())).data.text.trim().replace(/\s+/g, ' ');
        if (this.disposed || job.generation !== this.generation) return;
        if (isShopHeader(text)) this.publish({ state: 'safe', name: 'Shop', source: 'shop', message: 'Shop identified from the minimap.' });
        else this.publish({ state: 'missing', message: 'Click + on the minimap until the map name is visible.' });
        return;
      }
      const h = Math.floor(size.height / 2);
      const texts: string[] = [];
      for (const y of [0, h]) {
        const crop = source.crop({ x: 0, y, width: size.width, height: h });
        const pixels = crop.toBitmap();
        for (let i = 0; i < pixels.length; i += 4) {
          const white = pixels[i]! > 170 && pixels[i + 1]! > 170 && pixels[i + 2]! > 170;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = white ? 0 : 255;
          pixels[i + 3] = 255;
        }
        const processed = nativeImage.createFromBitmap(pixels, { width: size.width, height: h })
          .resize({ width: size.width * 3, height: h * 3, quality: 'good' });
        texts.push((await this.worker.recognize(processed.toPNG())).data.text.trim().replace(/\s+/g, ' '));
      }
      if (this.disposed || job.generation !== this.generation) return;
      const [street, name] = texts;
      if (!name || !street || name.length < 2 || street.length < 2) {
        this.publish({ state: 'unknown', message: 'Map name is visible but could not be read reliably.' });
        return;
      }
      const key = `${job.version}/${street.toLowerCase()}/${name.toLowerCase()}`;
      let result = this.cache.get(key);
      if (!result) {
        result = await lookupMap(name, street, job.version);
        if (result.state !== 'unknown') this.cache.set(key, result);
      }
      if (!this.disposed && job.generation === this.generation) this.publish(result);
    } catch (error) {
      console.error('[minimap] Map recognition failed', error);
      if (!this.disposed && job.generation === this.generation) {
        this.lastImage = null;
        this.publish({ state: 'unknown', message: `Map recognition failed: ${error instanceof Error ? error.message : String(error)}` });
      }
    } finally {
      this.busy = false;
      if (this.disposed) this.terminateWorker();
      else if (this.pending) void this.process();
    }
  }

  dispose(): void {
    this.disposed = true; this.generation++; this.pending = null;
    if (!this.busy) this.terminateWorker();
  }
  private terminateWorker(): void {
    const worker = this.worker; this.worker = null;
    if (worker) void worker.terminate().catch((error: unknown) => console.error('[minimap] OCR shutdown failed', error));
  }
}
