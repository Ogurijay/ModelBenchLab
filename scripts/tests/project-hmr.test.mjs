import test from 'node:test';
import assert from 'node:assert/strict';
import { projectHmr, projectReloads } from '../project-hmr.mjs';

const options = { root: 'D:/lab/', projects: new Set(['game-a', 'game-b']) };
const reload = { type: 'full-reload', path: '*', triggeredBy: 'D:\\lab\\game-b\\assets\\sprite.webp' };
// The actual Vite client only reloads for matching HTML paths (or /index.html).
const reloadsPage = (message, page) => !message.path?.endsWith('.html') || message.path === '/index.html' || page === message.path || page.endsWith('/') && page + 'index.html' === message.path;

test('asset generation in a sibling project does not reload the active game', () => {
  const messages = projectReloads(reload, options);
  assert.deepEqual(messages.map(m => m.path), ['/game-b/index.html']);
  assert.ok(messages.every(m => !reloadsPage(m, '/game-a/')));
  assert.ok(messages.some(m => reloadsPage(m, '/game-b/')));
  assert.ok(messages.some(m => reloadsPage(m, '/game-b/index.html')));
  assert.equal(reload.path, '*');
});

test('nested HTML entries receive their own reload without affecting siblings', () => {
  const messages = projectReloads(reload, { ...options, pages: ['/game-b/editor.html', '/game-b/demo/index.html', '/game-a/index.html'] });
  assert.ok(messages.some(m => reloadsPage(m, '/game-b/editor.html')));
  assert.ok(messages.some(m => reloadsPage(m, '/game-b/demo/')));
  assert.ok(messages.every(m => !reloadsPage(m, '/game-a/')));
});

test('shared assets, server restarts and existing HMR/HTML messages retain their behavior', () => {
  for (const message of [
    { ...reload, triggeredBy: 'D:/lab/shared/assets/sprite.png' },
    { ...reload, triggeredBy: 'D:/laboratory/game-b/sprite.png' },
    { type: 'full-reload', path: '*' },
    { type: 'full-reload', path: '/game-b/editor.html' },
    { type: 'update', updates: [{ type: 'css-update', path: '/game-b/style.css' }] },
    { type: 'error', err: { message: 'compile failed' } },
  ]) assert.deepEqual(projectReloads(message, options), [message]);
});

test('cross-project importers also receive updates and cyclic graphs terminate', () => {
  const consumer = { file: 'D:/lab/game-a/src/main.js', importers: new Set() };
  const source = { file: 'D:/lab/game-b/shared.js', importers: new Set([consumer]) };
  consumer.importers.add(source);
  const moduleGraph = { getModulesByFile: () => new Set([source]) };
  assert.deepEqual(new Set(projectReloads(reload, { ...options, moduleGraph }).map(m => m.path)), new Set(['/game-b/index.html', '/game-a/index.html']));
  source.importers.add({ file: 'D:/lab/shared/common.js' });
  assert.deepEqual(projectReloads(reload, { ...options, moduleGraph }), [reload]);
});

test('plugin scopes the real hot channel while preserving custom event arguments', () => {
  const sent = [];
  const hot = { send(...args) { sent.push(args); } };
  const plugin = projectHmr(options);
  plugin.configureServer({ environments: { client: { hot } } });
  plugin.transformIndexHtml('', { path: '/game-b/editor.html' });
  hot.send(reload);
  assert.deepEqual(sent.map(([m]) => m.path), ['/game-b/index.html', '/game-b/editor.html']);
  hot.send('custom:event', { value: 1 });
  assert.deepEqual(sent.at(-1), ['custom:event', { value: 1 }]);
});
