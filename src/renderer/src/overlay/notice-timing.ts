import type { MapStatus } from '../../../shared/types.ts';

export const NOTICE_DELAY_MS = 3000;
export const NOTICE_FADE_MS = 400;

export interface UnknownNotice {
  key: string;
  since: number;
}

export function unknownNoticeKey(map: MapStatus, running: boolean): string {
  return JSON.stringify([map.message, map.name, map.street, running]);
}

export function updateUnknownNotice(previous: UnknownNotice | null, map: MapStatus, running: boolean, now: number): UnknownNotice | null {
  if (map.state === 'reading') return previous;
  if (map.state !== 'unknown') return null;
  const key = unknownNoticeKey(map, running);
  return previous?.key === key ? previous : { key, since: now };
}
