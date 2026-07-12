// 校验 benchmark/registry.json 与 package.json / 磁盘目录 / 门户的一致性。
// 运行: npm run sync:check   (CI / 提交前防止口径漂移)
// 单端口模式下门户卡片由 index.html 运行时读取 registry 生成,无需校验卡片本身;
// 仍校验:workspaces 双向一致、目录与入口存在、dev:one 用的端口唯一、mission 分区覆盖。
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const reg = JSON.parse(read('benchmark/registry.json'));
const pkg = JSON.parse(read('package.json'));
const html = read('index.html');

const problems = [];
const dirs = reg.projects.map((p) => p.dir);
const ws = new Set(pkg.workspaces || []);

for (const d of dirs) if (!ws.has(d)) problems.push(`package.json workspaces 缺少 ${d}`);
for (const w of ws) if (!dirs.includes(w)) problems.push(`package.json workspaces 多出 ${w}(registry 无)`);

const seenPort = new Map();
for (const p of reg.projects) {
  if (seenPort.has(p.port)) problems.push(`端口冲突 ${p.port}: ${seenPort.get(p.port)} vs ${p.dir}(dev:one 需要唯一端口)`);
  seenPort.set(p.port, p.dir);
  if (!existsSync(resolve(root, p.dir))) problems.push(`目录不存在: ${p.dir}`);
  else if (!existsSync(resolve(root, p.dir, 'index.html'))) problems.push(`缺少入口 ${p.dir}/index.html(单端口经 /${p.dir}/ 访问需要它)`);
}

const covered = new Set((reg.portalSections || []).flatMap((s) => s.missions || [s.id]));
for (const m of new Set(reg.projects.map((p) => p.mission))) {
  if (!covered.has(m)) problems.push(`mission "${m}" 未被任何 portalSections.missions 覆盖(卡片将落入"未分区")`);
}

if (!html.includes('benchmark/registry.json')) {
  problems.push('index.html 不再读取 benchmark/registry.json(动态门户被改坏?)');
}

if (problems.length) {
  console.error(`✗ 发现 ${problems.length} 处漂移:`);
  for (const x of problems) console.error('  - ' + x);
  process.exit(1);
}
console.log(`✓ registry / workspaces / 目录 / 门户 一致(${reg.projects.length} 个项目,单端口 :${reg.ports.portal})`);
