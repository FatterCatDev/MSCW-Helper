import { useCallback, useEffect, useState } from 'react';
import { reducer, type Action } from '../../../shared/reducer.ts';
import type { AppState } from '../../../shared/types.ts';

/** Actions that generate random ids in the reducer; these are only applied by the main process. */
const NON_DETERMINISTIC = new Set<Action['type']>(['widget/add', 'profile/create']);

export type Dispatch = (action: Action) => void;

/**
 * Subscribes to the app state owned by the main process. Dispatched actions are applied
 * optimistically (same shared reducer) so drags and typing feel instant, then confirmed by the
 * authoritative state broadcast from main.
 */
export function useAppState(): [AppState | null, Dispatch] {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let alive = true;
    const off = window.mscw.onState((s) => alive && setState(s));
    void window.mscw.getState().then((s) => alive && setState((prev) => prev ?? s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const dispatch = useCallback<Dispatch>((action) => {
    if (!NON_DETERMINISTIC.has(action.type)) {
      setState((prev) => (prev ? { ...reducer(prev, action), runtime: prev.runtime } : prev));
    }
    window.mscw.dispatch(action);
  }, []);

  return [state, dispatch];
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

let audioCtx: AudioContext | null = null;

/** Short synthesized beep, so no audio assets are needed. */
export function beep(times = 1, freq = 880): void {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    for (let i = 0; i < times; i++) {
      const start = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    }
  } catch {
    // audio unavailable
  }
}
