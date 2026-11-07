import { CAPTURE_INTERVAL_MS, isolateNotificationText, MAX_CAPTURE_FPS } from '../../shared/game-tracking.ts';

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
      const r = config.region;
      const x = Math.floor(r.x * video.videoWidth);
      const y = Math.floor(r.y * video.videoHeight);
      const width = Math.min(video.videoWidth - x, Math.round(r.width * video.videoWidth));
      const height = Math.min(video.videoHeight - y, Math.round(r.height * video.videoHeight));
      if (width < 4 || height < 4) {
        window.mscw.captureError('The game window or selected gain region is too small.');
        return;
      }
      canvas.width = width * 3;
      canvas.height = height * 3;
      rawCanvas.width = width; rawCanvas.height = height;
      rawCtx.drawImage(video, x, y, width, height, 0, 0, width, height);
      const pixels = rawCtx.getImageData(0, 0, width, height);
      isolateNotificationText(pixels.data);
      rawCtx.putImageData(pixels, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(rawCanvas, 0, 0, canvas.width, canvas.height);
      window.mscw.captureFrame(canvas.toDataURL('image/png'));
      last = now;
    }
    video.requestVideoFrameCallback(frame);
  };
  video.requestVideoFrameCallback(frame);
  stream.getVideoTracks()[0]?.addEventListener('ended', () => window.mscw.captureError('Game window capture ended. Select the window and start again.'));
  window.addEventListener('beforeunload', () => stream.getTracks().forEach(track => track.stop()));
}

void capture().catch((error: unknown) => window.mscw.captureError(error instanceof Error ? error.message : String(error)));
