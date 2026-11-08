import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { defaultState } from '../src/shared/defaults.ts';

test('training graph renders mesos in blue with a separate axis and hides wallet timer', async () => {
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { ExpWidget, MesoWidget } = await server.ssrLoadModule(resolve('src', 'renderer', 'src', 'widgets', 'RateWidgets.tsx'));
    const state = defaultState();
    const exp = Object.values(state.widgets).find(w => w.type === 'exp');
    const meso = Object.values(state.widgets).find(w => w.type === 'meso');
    assert.ok(exp?.type === 'exp' && meso?.type === 'meso');
    const now = Math.floor(Date.now() / 1000) * 1000;
    exp.data.samples = [{ t: now - 60_000, value: 0 }, { t: now - 1000, value: 600 }];
    meso.data.samples = [{ t: now - 60_000, value: 1000 }, { t: now - 1000, value: 700 }];
    meso.data.potionCosts = 150;
    const dispatch = () => {};
    const graph = renderToStaticMarkup(createElement(ExpWidget, {
      w: exp, dispatch, now, embedded: true, mesoSamples: meso.data.samples
    }));
    assert.match(graph, /EXP and mesos per minute/);
    assert.match(graph, /EXP uses the left axis; mesos uses the blue right axis/);
    assert.match(graph, /class="graph-line graph-meso-line" d="M|d="M[^"]*" class="graph-line graph-meso-line"/);
    assert.match(graph, /class="graph-meso-label"/);
    assert.match(readFileSync(resolve('src', 'renderer', 'src', 'overlay', 'overlay.css'), 'utf8'),
      /\.graph-meso-line\s*\{\s*stroke:\s*#4aa9ff/);
    const wallet = renderToStaticMarkup(createElement(MesoWidget, {
      w: meso, dispatch, now, embedded: true
    }));
    assert.match(wallet, /Mesos\/min/);
    assert.match(wallet, /Potion cost \(est\.\)/);
    assert.match(wallet, /150/);
    assert.doesNotMatch(wallet, /Wallet tracking|Mesos\/hr/);
  } finally {
    await server.close();
  }
});
