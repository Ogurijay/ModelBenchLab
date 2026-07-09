// 校验 benchmark/registry.json 与 package.json / index.html / RULES.md 四方一致。
// 运行: npm run sync:check   (CI / 提交前防止四套口径再次漂移)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const reg = JSON.parse(read('benchmark/registry.json'));
const pkg = JSON.parse(read('package.json'));
const html = read('index.html');
const rules = read('RULES.md');

const problems = [];
const dirs = reg.projects.map((p) => p.dir);
const ws = new Set(pkg.workspaces || []);

for (const d of dirs) if (!ws.has(d)) problems.push(`package.json workspaces 缺少 ${d}`);
for (const w of ws) if (!dirs.includes(w)) problems.push(`package.json workspaces 多出 ${w}(registry 无)`);

const seenPort = new Map();
for (const p of reg.projects) {
  if (seenPort.has(p.port)) problems.push(`端口冲突 ${p.port}: ${seenPort.get(p.port)} vs ${p.dir}`);
  seenPort.set(p.port, p.dir);
  if (!html.includes(`localhost:${p.port}`)) problems.push(`index.html 缺少 :${p.port}(${p.dir})的卡片链接`);
  if (!rules.includes(`| ${p.port} |`)) problems.push(`RULES.md 端口表缺少 ${p.port}(${p.dir})`);
}

if (problems.length) {
  console.error(`✗ 发现 ${problems.length} 处漂移:`);
  for (const x of problems) console.error('  - ' + x);
  process.exit(1);
}
console.log(`✓ registry / package.json / index.html / RULES.md 四方一致(${reg.projects.length} 个项目)`);
