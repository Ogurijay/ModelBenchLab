// Vite's wildcard reloads are global even in MPA mode. Restrict project changes
// to that project's HTML entries; shared/config changes retain Vite's defaults.
const normalize = value => value.replaceAll('\\', '/');

// Ignore generated files relative to the server root, even if that root itself
// lives under a directory named tmp (for example, an isolated test fixture).
export function projectWatchOptions(root) {
  const prefix = normalize(root).replace(/\/$/, '') + '/';
  const generated = new Set(['dist', 'build', 'tmp', 'coverage', '.agents', '.claude', '.codex', '.playwright-mcp']);
  return {
    ignored(file) {
      const path = normalize(file);
      return path.toLowerCase().startsWith(prefix.toLowerCase()) &&
        path.slice(prefix.length).split('/').some(part => generated.has(part));
    },
  };
}

export function projectReloads(payload, { root, projects, pages = [], moduleGraph }) {
  if (!payload || payload.type !== 'full-reload' || (payload.path && payload.path !== '*') || !payload.triggeredBy) return [payload];
  const prefix = normalize(root).replace(/\/$/, '') + '/';
  const owner = file => {
    if (!file) return null;
    const path = normalize(file).split('?')[0];
    if (!path.toLowerCase().startsWith(prefix.toLowerCase())) return null;
    const dir = path.slice(prefix.length).split('/')[0];
    return projects.has(dir) ? dir : null;
  };
  const project = owner(payload.triggeredBy);
  if (!project) return [payload];
  const affected = new Set([project]);
  // Cross-project imports must still update their consumers.
  const pending = [...(moduleGraph?.getModulesByFile(normalize(payload.triggeredBy)) || [])];
  const seen = new Set();
  while (pending.length) {
    const mod = pending.pop();
    if (seen.has(mod)) continue;
    seen.add(mod);
    if (mod.file) {
      const dir = owner(mod.file);
      if (!dir) return [payload];
      affected.add(dir);
    }
    pending.push(...(mod.importers || []));
  }
  const paths = new Set();
  for (const dir of affected) {
    paths.add(`/${dir}/index.html`);
    for (const page of pages) if (page.startsWith(`/${dir}/`) && page.endsWith('.html')) paths.add(page);
  }
  return [...paths].map(path => ({ ...payload, path }));
}

export function projectHmr({ root, projects }) {
  const pages = new Set();
  return {
    name: 'modelbenchlab-project-hmr',
    apply: 'serve',
    transformIndexHtml(_html, context) {
      const path = context.path.split('?')[0];
      pages.add(path.endsWith('/') ? path + 'index.html' : path);
    },
    configureServer(server) {
      const hot = server.environments.client.hot;
      const send = hot.send.bind(hot);
      hot.send = (payload, ...args) => {
        for (const message of projectReloads(payload, {
          root, projects, pages, moduleGraph: server.environments.client.moduleGraph,
        })) send(message, ...args);
      };
    },
  };
}
