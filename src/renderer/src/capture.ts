import { CAPTURE_INTERVAL_MS, DEFAULT_LEVEL_REGION, MAX_CAPTURE_FPS } from '../../shared/game-tracking.ts';

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
  const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
  const ctx = canvas.getContext('2d');
  if (!ctx || !rawCtx) throw new Error('Capture canvas is unavailable.');
  let last = -Infinity;
  const frame: VideoFrameRequestCallback = (now) => {
    if (now - last >= CAPTURE_INTERVAL_MS) {
      canvas.width = 1200; canvas.height = 320;
      // Black padding is never mistaken for the near-white status digits.
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [index, r] of [config.levelRegion ?? DEFAULT_LEVEL_REGION, config.region].entries()) {
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
    video.requestVideoFrameCallback(frame);
  };
  video.requestVideoFrameCallback(frame);
  stream.getVideoTracks()[0]?.addEventListener('ended', () => window.mscw.captureError('Game window capture ended. Select the window and start again.'));
  window.addEventListener('beforeunload', () => stream.getTracks().forEach(track => track.stop()));
}

void capture().catch((error: unknown) => window.mscw.captureError(error instanceof Error ? error.message : String(error)));
