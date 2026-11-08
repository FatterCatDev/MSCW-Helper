import { CAPTURE_INTERVAL_MS, DEFAULT_LEVEL_REGION, DEFAULT_HP_REGION, DEFAULT_MP_REGION, MAX_CAPTURE_FPS } from '../../shared/game-tracking.ts';
import { findCompactMinimap, findMinimapPanel, minimapTextRegions } from '../../shared/minimap.ts';
import { readInventory } from '../../shared/inventory.ts';

async function capture(): Promise<void> {
  const config = await window.mscw.captureConfig();
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: MAX_CAPTURE_FPS, max: MAX_CAPTURE_FPS } }, audio: false
  });
  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  const canvas = document.createElement('canvas');
  const rawCanvas = document.createElement('canvas');
  const mapCanvas = document.createElement('canvas');
  const mapCtx = mapCanvas.getContext('2d', { willReadFrequently: true });
  const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
  const ctx = canvas.getContext('2d');
  if (!ctx || !rawCtx || !mapCtx) throw new Error('Capture canvas is unavailable.');
  let last = -Infinity;
  let lastMap = -Infinity;
  const frame: VideoFrameRequestCallback = (now) => {
    if (now - last >= CAPTURE_INTERVAL_MS) {
      canvas.width = 1200; canvas.height = 640;
      // Black padding is never mistaken for the near-white status digits.
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [index, r] of [config.levelRegion ?? DEFAULT_LEVEL_REGION, config.region,
        config.hpRegion ?? DEFAULT_HP_REGION, config.mpRegion ?? DEFAULT_MP_REGION].entries()) {
        const x = Math.round(r.x * video.videoWidth), y = Math.round(r.y * video.videoHeight);
        const width = Math.min(video.videoWidth - x, Math.round(r.width * video.videoWidth));
        const height = Math.min(video.videoHeight - y, Math.round(r.height * video.videoHeight));
        if (width < 4 || height < 4) {
          window.mscw.captureError('The game window or selected status field is too small.');
          return;
        }
        const scale = Math.min(1, 1160 / width, 120 / height);
        rawCanvas.width = Math.round(width * scale); rawCanvas.height = Math.round(height * scale);
        rawCtx.imageSmoothingEnabled = false;
        rawCtx.drawImage(video, x, y, width, height, 0, 0, rawCanvas.width, rawCanvas.height);
        ctx.drawImage(rawCanvas, 20, index * 160 + 20);
      }
      window.mscw.captureFrame(canvas.toDataURL('image/png'), video.videoWidth, video.videoHeight);
      last = now;
    }
    if (now - lastMap >= 1500) {
      try {
        const capturedAt = Date.now();
        mapCanvas.width = video.videoWidth; mapCanvas.height = video.videoHeight;
        mapCtx.drawImage(video, 0, 0);
        const pixels = mapCtx.getImageData(0, 0, mapCanvas.width, mapCanvas.height);
        window.mscw.captureInventory(readInventory(pixels.data, pixels.width, pixels.height), capturedAt);
        const panel = findMinimapPanel(pixels.data, pixels.width, pixels.height);
        if (!panel) {
          const compact = findCompactMinimap(pixels.data, pixels.width, pixels.height);
          if (!compact) window.mscw.captureMap(null);
          else {
            const target = document.createElement('canvas');
            target.width = compact.width; target.height = compact.height;
            const out = target.getContext('2d');
            if (!out) throw new Error('Minimap canvas is unavailable.');
            out.drawImage(mapCanvas, compact.x, compact.y, compact.width, compact.height, 0, 0, compact.width, compact.height);
            window.mscw.captureMap(target.toDataURL('image/png'), 'compact');
          }
        } else {
          const regions = minimapTextRegions(panel);
          const target = document.createElement('canvas');
          target.width = Math.max(...regions.map(r => r.width));
          target.height = regions[0].height + regions[1].height;
          const out = target.getContext('2d');
          if (!out) throw new Error('Minimap canvas is unavailable.');
          regions.forEach((r, i) => out.drawImage(mapCanvas, r.x, r.y, r.width, r.height, 0, i * r.height, r.width, r.height));
          window.mscw.captureMap(target.toDataURL('image/png'), 'expanded');
        }
      } catch (error) {
        window.mscw.captureError(`Minimap or inventory capture failed: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      lastMap = now;
    }
    video.requestVideoFrameCallback(frame);
  };
  video.requestVideoFrameCallback(frame);
  stream.getVideoTracks()[0]?.addEventListener('ended', () => window.mscw.captureError('Game window capture ended. Select the window and start again.'));
  window.addEventListener('beforeunload', () => stream.getTracks().forEach(track => track.stop()));
}

void capture().catch((error: unknown) => window.mscw.captureError(error instanceof Error ? error.message : String(error)));
