// 单独启动某一个项目的开发服务(独立端口,来自 registry 登记;用于单项目调试)。
// 日常查看全部项目请用 `npm run dev`(单端口 :3000,门户 + /<目录名>/)。
// 用法:
//   npm run dev:one <目录名|端口>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import concurrently from 'concurrently';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reg = JSON.parse(readFileSync(resolve(root, 'benchmark/registry.json'), 'utf8'));
const filter = process.argv[2];

if (!filter) {
  console.error('用法: npm run dev:one <目录名|端口>');
  console.error('查看全部项目: npm run dev (单端口 http://localhost:3000)');
  console.error('可选项目:');
  for (const p of [...reg.projects].sort((a, b) => a.port - b.port)) {
    console.error(`  ${p.port}  ${p.dir}`);
  }
  process.exit(1);
}

const projects = reg.projects.filter((p) => p.dir === filter || String(p.port) === filter);
if (projects.length === 0) {
  console.error(`未找到项目: ${filter}`);
  process.exit(1);
}

const p = projects[0];
const { result } = concurrently(
  [{ command: `vite ${p.dir} --port ${p.port} --strictPort`, name: `${p.port}:${p.dir}`, prefixColor: 'cyan' }],
  { prefix: 'name', restartTries: 0 },
);
result.then(() => process.exit(0), () => process.exit(1));
