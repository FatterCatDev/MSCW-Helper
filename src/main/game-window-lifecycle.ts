import { spawn } from 'node:child_process';
import { join } from 'node:path';

export function watchGameWindow(sourceId: string, onClosed: () => void): () => void {
  const match = /^window:(\d+):\d+$/.exec(sourceId);
  if (!match || BigInt(match[1]!) <= 0n || BigInt(match[1]!) > 0x7fffffffffffffffn) {
    throw new Error('Invalid game window handle.');
  }
  if (process.platform !== 'win32') throw new Error('Game window lifetime detection requires Windows.');
  // IsWindow includes minimized windows; capture-source enumeration does not guarantee that.
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class MSCWWindow { [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindow(IntPtr handle); }'
$handle = [IntPtr]::new([Int64]${match[1]})
while ([MSCWWindow]::IsWindow($handle)) { Start-Sleep -Milliseconds 1000 }
exit 0
`;
  const watcher = spawn(join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stopped = false;
  let errors = '';
  watcher.stderr.setEncoding('utf8');
  watcher.stderr.on('data', (text: string) => { errors = (errors + text).slice(-4000); });
  watcher.on('error', error => {
    if (!stopped) console.error('[game-window] lifetime monitor failed', error);
  });
  watcher.on('exit', (code, signal) => {
    if (stopped) return;
    if (code === 0) onClosed();
    else console.error('[game-window] lifetime monitor ended unexpectedly', { code, signal, errors });
  });
  return () => {
    stopped = true;
    watcher.kill();
  };
}
