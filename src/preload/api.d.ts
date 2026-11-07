import type { MscwApi } from '../shared/ipc.ts';

declare global {
  interface Window {
    mscw: MscwApi;
  }
}

export {};
