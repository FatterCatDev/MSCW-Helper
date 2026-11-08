import assert from 'node:assert/strict';
import { test } from 'node:test';
import { watchGameWindow } from '../src/main/game-window-lifecycle.ts';

test('game window monitor rejects invalid handles before starting a process', () => {
  for (const source of ['', 'screen:0:0', 'window:0:1', 'window:-1:1', 'window:1;exit:1',
    'window:9223372036854775808:1']) {
    assert.throws(() => watchGameWindow(source, () => {}), /Invalid game window handle/);
  }
});

test('Windows monitor reports a nonexistent window as closed', { skip: process.platform !== 'win32', timeout: 15000 }, async () => {
  let stop: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Window closure was not detected.')), 12000);
      stop = watchGameWindow('window:9223372036854775807:1', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  } finally {
    stop?.();
  }
});

test('cancelling the Windows monitor never signals game closure', { skip: process.platform !== 'win32' }, async () => {
  let closed = false;
  const stop = watchGameWindow('window:9223372036854775807:1', () => { closed = true; });
  stop();
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(closed, false);
});
