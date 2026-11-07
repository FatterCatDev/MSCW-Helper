import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaultState, normalizeState } from '../shared/defaults.ts';
import type { PersistedState } from '../shared/types.ts';

/** JSON-file backed state with debounced, atomic writes. */
export class Store {
  private state: PersistedState;
  private timer: NodeJS.Timeout | null = null;
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    this.state = this.load();
  }

  get(): PersistedState {
    return this.state;
  }

  set(next: PersistedState): void {
    this.state = next;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] failed to save state', err);
    }
  }

  private load(): PersistedState {
    if (!existsSync(this.file)) return defaultState();
    try {
      return normalizeState(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch (err) {
      console.error('[store] state file unreadable, starting fresh', err);
      try {
        renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
      } catch {
        // ignore: we'll overwrite on next save
      }
      return defaultState();
    }
  }
}
