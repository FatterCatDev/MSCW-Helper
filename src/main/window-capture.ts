import { desktopCapturer } from 'electron';
import type { CapturePreview } from '../shared/types.ts';

export async function listGameWindows(previews = true): Promise<Electron.DesktopCapturerSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'], thumbnailSize: previews ? { width: 2560, height: 1440 } : { width: 0, height: 0 }
  });
  return sources.filter(s => !s.name.startsWith('MSCW Helper'));
}

export async function windowPreviews(): Promise<CapturePreview[]> {
  return (await listGameWindows()).map(s => ({ id: s.id, name: s.name, image: s.thumbnail.toDataURL() }));
}
