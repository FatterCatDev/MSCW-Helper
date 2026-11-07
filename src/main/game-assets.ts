import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { GameAssetImport } from '../shared/types.ts';

interface AssetFile {
  path: string;
  bytes: number;
}

export async function getGameAssets(root: string): Promise<GameAssetImport | null> {
  let text: string;
  try {
    text = await readFile(join(root, 'latest.json'), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null ||
      !('sourcePath' in value) || typeof value.sourcePath !== 'string' ||
      !('directory' in value) || typeof value.directory !== 'string' ||
      !('importedAt' in value) || typeof value.importedAt !== 'number' ||
      !('fileCount' in value) || typeof value.fileCount !== 'number' ||
      !('totalBytes' in value) || typeof value.totalBytes !== 'number') {
    throw new Error('The imported UI asset record is invalid. Import the assets again.');
  }
  return {
    sourcePath: value.sourcePath, directory: value.directory,
    importedAt: value.importedAt, fileCount: value.fileCount, totalBytes: value.totalBytes
  };
}

const IMPORT_DIR_RE = /^[0-9a-f-]{36}(\.tmp)?$/i;

async function pruneOldImports(root: string, keepId: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === keepId || !IMPORT_DIR_RE.test(entry.name)) continue;
    try {
      await rm(join(root, entry.name), { recursive: true, force: true });
    } catch (error) {
      console.error('[game-assets] failed to remove old import', entry.name, error);
    }
  }
}

export async function importGameAssets(sourcePath: string, root: string): Promise<GameAssetImport> {
  if (!sourcePath.trim() || !isAbsolute(sourcePath)) throw new Error('Choose an absolute path to the game Data folder.');
  const source = resolve(sourcePath.trim());
  const ui = join(source, 'UI');
  const output = resolve(root);
  if (output === ui || output.startsWith(`${ui}${sep}`)) throw new Error('The import destination cannot be inside the game UI folder.');
  let uiInfo;
  try {
    uiInfo = await lstat(ui);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`No UI folder found in "${source}". Choose the game's Data folder (it contains UI, Map, Mob, ...).`);
    }
    throw error;
  }
  if (!uiInfo.isDirectory()) throw new Error('The selected Data folder must contain a UI directory (not a symbolic link).');

  const files: AssetFile[] = [];
  async function scan(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`UI assets contain a symbolic link: ${entry.name}`);
      if (info.isDirectory()) await scan(path);
      else if (info.isFile()) files.push({ path: relative(ui, path), bytes: info.size });
      else throw new Error(`Unsupported UI asset: ${entry.name}`);
    }
  }
  await scan(ui);
  if (files.length === 0) throw new Error('The selected Data folder has no UI assets to import.');

  await mkdir(output, { recursive: true });
  const id = crypto.randomUUID();
  const directory = join(output, id);
  const pending = join(output, `${id}.tmp`);
  try {
    await mkdir(join(directory, 'UI'), { recursive: true });
    for (const file of files) {
      const target = join(directory, 'UI', file.path);
      const parent = resolve(target, '..');
      await mkdir(parent, { recursive: true });
      await copyFile(join(ui, file.path), target);
      if ((await lstat(target)).size !== file.bytes) throw new Error(`UI asset changed during import: ${file.path}. Retry after the game finishes updating.`);
    }
    const result: GameAssetImport = {
      sourcePath: source, directory, importedAt: Date.now(),
      fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0)
    };
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...result, files }, null, 2));
    await writeFile(pending, JSON.stringify(result, null, 2));
    await rename(pending, join(output, 'latest.json'));
    await pruneOldImports(output, id);
    return result;
  } catch (error) {
    try {
      await rm(pending, { force: true });
      await rm(directory, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('[game-assets] failed to clean incomplete import', cleanupError);
    }
    throw error;
  }
}
