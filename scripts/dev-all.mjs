// 读取 benchmark/registry.json 启动全部(或单个)项目的开发服务。
// 用法:
//   node scripts/dev-all.mjs            启动门户 + 全部项目
//   node scripts/dev-all.mjs <目录名>    只启动某个项目(用其 registry 端口)
//   node scripts/dev-all.mjs <端口>      同上,按端口匹配
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import concurrently from 'concurrently';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reg = JSON.parse(readFileSync(resolve(root, 'benchmark/registry.json'), 'utf8'));
const colors = ['cyan', 'magenta', 'yellow', 'green', 'blue', 'red', 'white', 'gray'];
const filter = process.argv[2];

let projects = [...reg.projects].sort((a, b) => a.port - b.port);
if (filter) {
  projects = projects.filter((p) => p.dir === filter || String(p.port) === filter);
  if (projects.length === 0) {
    console.error(`未找到项目: ${filter}`);
    console.error('可用:', reg.projects.map((p) => `${p.port} ${p.dir}`).join('\n      '));
    process.exit(1);
  }
}

const commands = [];
if (!filter) {
  commands.push({ command: `vite --port ${reg.ports.portal} --strictPort`, name: 'portal', prefixColor: 'white' });
}
projects.forEach((p, i) => {
  commands.push({
    command: `vite ${p.dir} --port ${p.port} --strictPort`,
    name: `${p.port}:${p.dir.split('-')[0]}`,
    prefixColor: colors[i % colors.length],
  });
});

const { result } = concurrently(commands, { prefix: 'name', killOthers: ['failure'], restartTries: 0 });
result.then(() => process.exit(0), () => process.exit(1));
