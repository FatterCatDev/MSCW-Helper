import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getGameAssets, importGameAssets } from '../src/main/game-assets.ts';

test('imports nested UI archives byte-for-byte and publishes a persistent manifest', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'mscw-assets-test-'));
  try {
    const source = join(temp, 'Data');
    const root = join(temp, 'imports');
    await mkdir(join(source, 'UI', 'Font'), { recursive: true });
    await mkdir(join(source, 'Map'), { recursive: true });
    const archive = Buffer.from([0, 1, 128, 255]);
    await writeFile(join(source, 'UI', 'UI.wz'), archive);
    await writeFile(join(source, 'UI', 'Font', 'Font.ini'), 'font');
    await writeFile(join(source, 'Map', 'Map.wz'), 'not UI');
    assert.equal(await getGameAssets(root), null);
    const result = await importGameAssets(source, root);
    assert.equal(result.sourcePath, source);
    assert.equal(result.fileCount, 2);
    assert.equal(result.totalBytes, 8);
    assert.deepEqual(await readFile(join(result.directory, 'UI', 'UI.wz')), archive);
    assert.equal(await readFile(join(result.directory, 'UI', 'Font', 'Font.ini'), 'utf8'), 'font');
    assert.deepEqual((await readdir(result.directory)).sort(), ['UI', 'manifest.json']);
    const manifest = JSON.parse(await readFile(join(result.directory, 'manifest.json'), 'utf8'));
    assert.equal(manifest.files.length, 2);
    assert.deepEqual(await getGameAssets(root), result);
    assert.deepEqual(await readFile(join(source, 'UI', 'UI.wz')), archive);

    await writeFile(join(source, 'UI', 'UI.wz'), 'updated');
    const next = await importGameAssets(source, root);
    assert.notEqual(next.directory, result.directory);
    assert.equal(next.totalBytes, 11);
    assert.deepEqual(await getGameAssets(root), next);
    assert.deepEqual((await readdir(root)).sort(), [next.directory.slice(root.length + 1), 'latest.json'].sort());
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('invalid or empty game folders fail without replacing the previous import', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'mscw-assets-test-'));
  try {
    const source = join(temp, 'Data');
    const root = join(temp, 'imports');
    await mkdir(join(source, 'UI'), { recursive: true });
    await writeFile(join(source, 'UI', 'UI.wz'), 'archive');
    const previous = await importGameAssets(source, root);
    const empty = join(temp, 'empty');
    await mkdir(join(empty, 'UI'), { recursive: true });
    await assert.rejects(importGameAssets(empty, root), /no UI assets/);
    await assert.rejects(importGameAssets(join(temp, 'missing'), root), /No UI folder found/);
    await assert.rejects(importGameAssets('relative', root), /absolute path/);
    await assert.rejects(importGameAssets(source, join(source, 'UI', 'imports')), /inside/);
    assert.deepEqual(await getGameAssets(root), previous);
    await writeFile(join(root, 'latest.json'), '{}');
    await assert.rejects(getGameAssets(root), /record is invalid/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
