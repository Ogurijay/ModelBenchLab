import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'vite';
import { projectHmr } from '../project-hmr.mjs';

test('live Vite scopes asset reloads and preserves own-project reloads and CSS HMR', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'modelbench-hmr-'));
  let server, ws;
  try {
    for (const dir of ['game-a', 'game-b']) {
      await mkdir(join(root, dir));
      await writeFile(join(root, dir, 'index.html'), '<link rel="stylesheet" href="./style.css"><script type="module" src="./main.js"></script>');
      await writeFile(join(root, dir, 'main.js'), 'import image from "./sprite.webp"; console.log(image);');
      await writeFile(join(root, dir, 'sprite.webp'), 'asset fixture');
      await writeFile(join(root, dir, 'style.css'), 'body { color: red; }');
    }
    server = await createServer({
      root, configFile: false, appType: 'mpa', logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [projectHmr({ root, projects: new Set(['game-a', 'game-b']) })],
    });
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const read = async path => { const r = await fetch(base + path, { headers: { Accept: path.endsWith('.css') ? 'text/css' : '*/*' }, signal: AbortSignal.timeout(4000) }); assert.equal(r.status, 200); return r.text(); };
    for (const dir of ['game-a', 'game-b']) for (const file of ['', 'main.js', 'style.css', 'sprite.webp?import']) await read(`/${dir}/${file}`);
    const client = await read('/@vite/client');
    const token = client.match(/const wsToken = ["']([^"']+)/)[1];
    ws = new WebSocket(base.replace('http:', 'ws:') + '/?token=' + token, 'vite-hmr');
    const messages = [];
    ws.addEventListener('message', event => messages.push(JSON.parse(event.data)));
    const waitFor = async predicate => {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const found = messages.find(predicate);
        if (found) return found;
        await new Promise(r => setTimeout(r, 25));
      }
      assert.fail('Expected HMR message; received: ' + JSON.stringify(messages));
    };
    await waitFor(m => m.type === 'connected');
    await writeFile(join(root, 'game-b/sprite.webp'), 'updated asset fixture');
    assert.equal((await waitFor(m => m.type === 'full-reload')).path, '/game-b/index.html');
    assert.ok(messages.every(m => m.type !== 'full-reload' || m.path === '/game-b/index.html'));
    messages.length = 0;
    await writeFile(join(root, 'game-a/main.js'), 'import image from "./sprite.webp"; console.log("changed", image);');
    assert.equal((await waitFor(m => m.type === 'full-reload')).path, '/game-a/index.html');
    messages.length = 0;
    await writeFile(join(root, 'game-a/style.css'), 'body { color: blue; }');
    const update = await waitFor(m => m.type === 'update');
    assert.ok(update.updates.some(u => u.type === 'css-update' && u.path.startsWith('/game-a/style.css')), JSON.stringify(update));
  } finally {
    ws?.close();
    await server?.close();
    // Only delete this test's uniquely named directory, never a computed ancestor.
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    assert.ok(root.includes('modelbench-hmr-'));
    await rm(root, { recursive: true, force: true });
  }
});
