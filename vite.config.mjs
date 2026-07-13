// ModelBenchLab 单端口开发服务配置。
// `npm run dev` 只启动这一个 vite(:3000):门户在 /,每个项目经 /<目录名>/ 访问。
// 多版本 three 由 npm workspaces 的嵌套 node_modules 就近解析,互不干扰。
import { defineConfig } from 'vite';
import { statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const reg = JSON.parse(readFileSync(join(ROOT, 'benchmark/registry.json'), 'utf8'));
const dirs = new Set(reg.projects.map((p) => p.dir));

const isFile = (...p) => {
  try { return statSync(join(ROOT, ...p)).isFile(); } catch { return false; }
};

// 三条路由规则,让每个子项目无需自带服务即可在 /<dir>/ 下完整运行:
// 1) /<dir>        → 301 /<dir>/(保证页面内相对路径以项目目录为基准)
// 2) /<dir>/xxx    → 磁盘无此文件时回落 <dir>/public/xxx(vite 只认根 public,子项目 public 由此接管)
// 3) /xxx(根绝对路径,如 /water/a.jpg)→ 按 Referer 判定来源项目,回落 <dir>/xxx 或 <dir>/public/xxx
function benchRouting() {
  return {
    name: 'modelbenchlab-routing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url || '/';
        const qIdx = raw.indexOf('?');
        const q = qIdx === -1 ? '' : raw.slice(qIdx);
        let url;
        try { url = decodeURIComponent(qIdx === -1 ? raw : raw.slice(0, qIdx)); } catch { return next(); }
        if (url.includes('..')) return next();
        const seg = url.split('/').filter(Boolean);

        if (seg.length === 1 && dirs.has(seg[0]) && !url.endsWith('/')) {
          res.statusCode = 301;
          res.setHeader('Location', `/${seg[0]}/${q}`);
          return res.end();
        }

        if (seg.length >= 2 && dirs.has(seg[0])) {
          if (!isFile(...seg) && isFile(seg[0], 'public', ...seg.slice(1))) {
            req.url = `/${seg[0]}/public/${seg.slice(1).join('/')}${q}`;
          }
          return next();
        }

        if (seg.length >= 1 && !url.startsWith('/@') && !isFile(...seg)) {
          const m = (req.headers.referer || '').match(/:\/\/[^/]+\/([^/?#]+)/);
          const dir = m && dirs.has(m[1]) ? m[1] : null;
          if (dir) {
            if (isFile(dir, ...seg)) req.url = `/${dir}${url}${q}`;
            else if (isFile(dir, 'public', ...seg)) req.url = `/${dir}/public${url}${q}`;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  server: { port: 3000, strictPort: true },
  optimizeDeps: {
    // three 绝不能进预打包:预打包按裸名只保留一份,会把多版本(0.160/0.179/0.184/0.185)
    // 坍缩成同一副本。排除后每个 import 按就近 node_modules 逐项目解析(three 为纯 ESM,可直接服务)。
    exclude: ['three'],
  },
  resolve: {
    // react 是 CJS 必须预打包,而预打包按裸名合并——若不统一,'react' 和 'react-dom/client'
    // 可能分别从不同项目解析出 19/18 拼盘导致崩溃。统一钉到根副本(19,fiber 9 要求)。
    // 注意:three 不能加进来,否则多版本又会坍缩。
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    benchRouting(),
    // 仅 React 项目走 JSX 转换,其余项目不受影响
    react({ include: [/doubao2\.1pro-powdergame[\\/].+\.[jt]sx?$/] }),
    // doubao2.1pro-powdergame 源码使用 tsconfig 的 @/ 路径别名
    tsconfigPaths({ projects: ['doubao2.1pro-powdergame/tsconfig.json'] }),
  ],
});
