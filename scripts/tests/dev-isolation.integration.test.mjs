import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import config from '../../vite.config.mjs';
import { projectHmr, projectWatchOptions } from '../project-hmr.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('opening more projects keeps dependency URLs stable; generated HTML cannot reload pages', { timeout: 30000 }, async () => {
  const scratch = join(repository, 'tmp');
  await mkdir(scratch, { recursive: true });
  // Stay under the repository so the fixture resolves the actual installed dependencies.
  const root = await mkdtemp(join(scratch, 'modelbench-dev-isolation-'));
  let server, ws;
  try {
    const write = async (path, content) => {
      const file = join(root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    };
    await write('game-a/index.html', '<script type="module" src="./main.js"></script>');
    await write('game-a/main.js', 'import React from "react"; console.log(React.version);');
    // These entry modules are requested later, as when another project is opened lazily.
    await write('game-b/index.html', '<h1>Game B</h1>');
    await write('game-b/main.js', 'import { createRoot } from "react-dom/client"; console.log(createRoot);');
    await write('game-c/index.html', '<h1>Game C</h1>');
    await write('game-c/main.js', 'import { World } from "cannon-es"; import { shared } from "../shared/shared.js"; console.log(World, shared);');
    await write('shared/shared.js', 'export const shared = 1;');
    for (const path of ['game-b/dist/report.html', 'game-b/build/report.html', 'game-b/tmp/report.html', 'tmp/report.html']) {
      await write(path, '<p>before</p>');
    }
    server = await createServer({
      root, configFile: false, appType: 'mpa', logLevel: 'silent',
      cacheDir: join(root, 'node_modules/.vite'),
      server: { host: '127.0.0.1', port: 0, watch: projectWatchOptions(root) },
      optimizeDeps: config.optimizeDeps,
      resolve: config.resolve,
      plugins: [projectHmr({ root, projects: new Set(['game-a', 'game-b', 'game-c']) })],
    });
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const read = async path => {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(8000) });
      assert.equal(response.status, 200, path);
      return response.text();
    };
    const client = await read('/@vite/client');
    const token = client.match(/const wsToken = ["']([^"']+)/)[1];
    ws = new WebSocket(base.replace('http:', 'ws:') + '/?token=' + token, 'vite-hmr');
    const messages = [];
    ws.addEventListener('message', event => messages.push(JSON.parse(event.data)));
    const waitFor = async predicate => {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const result = predicate();
        if (result) return result;
        await pause(25);
      }
      assert.fail('Expected condition; HMR messages: ' + JSON.stringify(messages));
    };
    await waitFor(() => messages.some(m => m.type === 'connected'));
    await read('/game-a/');
    const initial = await read('/game-a/main.js');
    const reactUrl = initial.match(/from\s*"([^"]+react\.js\?v=[^"]+)"/)[1];
    assert.match(await read(reactUrl), /export/);
    const optimizer = server.environments.client.depsOptimizer;
    const optimizedBefore = Object.keys(optimizer.metadata.optimized).sort();
    messages.length = 0;
    for (const dir of ['game-b', 'game-c']) {
      await read(`/${dir}/`);
      const source = await read(`/${dir}/main.js`);
      const dependency = source.match(/from\s*"([^"]+)"/)[1];
      assert.match(await read(dependency), /export/);
    }
    await pause(600);
    assert.deepEqual(Object.keys(optimizer.metadata.optimized).sort(), optimizedBefore,
      'Opening another project must not add dependencies to the shared prebundle');
    assert.deepEqual(Object.keys(optimizer.metadata.discovered), [], 'No runtime dependency discovery');
    assert.equal((await read('/game-a/main.js')).match(/from\s*"([^"]+react\.js\?v=[^"]+)"/)[1], reactUrl,
      'Previously served dependency URLs must remain valid');
    assert.ok(messages.every(m => m.type !== 'full-reload'), JSON.stringify(messages));

    // Vite normally sends HTML reload messages even for files not loaded in a module graph.
    messages.length = 0;
    for (const path of ['game-b/dist/report.html', 'game-b/build/report.html', 'game-b/tmp/report.html', 'tmp/report.html', 'tmp/new-report.html']) {
      await write(path, '<p>after</p>');
    }
    // Positive control: a watched source change proves the watcher is still active.
    await write('game-a/main.js', 'import React from "react"; console.log("changed", React.version);');
    await waitFor(() => messages.some(m => m.type === 'full-reload' && m.path === '/game-a/index.html'));
    await pause(600);
    assert.deepEqual([...new Set(messages.filter(m => m.type === 'full-reload').map(m => m.path))], ['/game-a/index.html']);

    // Shared runtime code is not a generated artifact: its consumers must still update.
    await read('/shared/shared.js');
    messages.length = 0;
    await write('shared/shared.js', 'export const shared = 2;');
    await waitFor(() => messages.some(m => m.type === 'full-reload' && m.path === '*'));
  } finally {
    ws?.close();
    await server?.close();
    assert.ok(resolve(root).startsWith(resolve(scratch) + sep));
    assert.ok(root.includes('modelbench-dev-isolation-'));
    await rm(root, { recursive: true, force: true });
  }
});
