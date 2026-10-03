import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Ajv from 'ajv';

export const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
export function walk(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(e => {
    const p = path.posix.join(relative, e.name);
    if (e.isDirectory()) return ['.git', 'node_modules', 'dist', 'build', 'tmp', '.agents', '.claude', '.codex', '.playwright-mcp'].includes(e.name) ? [] : walk(root, p);
    return [p];
  });
}
export function schemas(root) {
  const ajv = new Ajv({ allErrors: true });
  return Object.fromEntries(['test-unit', 'run-record'].map(k => [k, ajv.compile(readJSON(path.join(root, 'shared/schema', k + '.schema.json')))]));
}
export function validateStructure(root) {
  const problems = [], warnings = [];
  const issue = s => problems.push(s);
  const exists = p => fs.existsSync(path.join(root, p));
  const text = p => fs.readFileSync(path.join(root, p), 'utf8');
  const data = p => readJSON(path.join(root, p));
  const reg = data('benchmark/registry.json'), pkg = data('package.json'), lock = data('package-lock.json'), index = data('benchmark/tasks/index.json');
  const validators = schemas(root);
  const dirs = reg.projects.map(p => p.dir), workspaces = pkg.workspaces || [];
  if (new Set(dirs).size !== dirs.length) issue('registry 存在重复目录');
  if (new Set(workspaces).size !== workspaces.length) issue('workspaces 存在重复目录');
  for (const d of dirs) if (!workspaces.includes(d)) issue('workspaces 缺少 ' + d);
  for (const d of workspaces) if (!dirs.includes(d)) issue('workspaces 未登记 ' + d);
  if (JSON.stringify(workspaces) !== JSON.stringify(lock.packages[''].workspaces)) issue('lockfile 根 workspaces 不一致');
  for (const [key, value] of Object.entries(lock.packages)) {
    if (key && !key.startsWith('node_modules/') && !workspaces.some(dir => key === dir || key.startsWith(dir + '/node_modules/'))) issue('lockfile 残留未登记 workspace 包 ' + key);
    if (value.link && !workspaces.includes(value.resolved)) issue('lockfile 残留未登记 workspace 链接 ' + key);
  }
  const permitted = new Set([...dirs, '.git', '.agents', '.claude', '.codex', '.playwright-mcp', 'tmp', 'node_modules', 'dist', 'build', 'scripts', 'benchmark', 'shared', '.gitignore', 'RULES.md', 'index.html', 'package.json', 'package-lock.json', 'vite.config.mjs']);
  for (const e of fs.readdirSync(root)) if (!permitted.has(e)) issue('未知根条目 ' + e);
  const ports = new Set(), names = new Set(dirs);
  for (const p of reg.projects) {
    if (!/^[a-z0-9.]+-[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.dir)) issue('命名不合规 ' + p.dir);
    if (!Number.isInteger(p.port) || p.port <= reg.ports.portal || p.port > 65535 || ports.has(p.port) || (reg.retiredPorts || []).includes(p.port)) issue('无效、重复或退役端口 ' + p.dir);
    ports.add(p.port);
    for (const alias of p.aliases || []) {
      if (!/^[a-zA-Z0-9.-]+$/.test(alias) || names.has(alias) || exists(alias)) issue('别名冲突 ' + alias);
      names.add(alias);
    }
    if (!reg.capabilityCategories[p.category]) issue('未定义类别 ' + p.dir);
    if (!reg.missions[p.mission]) issue('未定义 mission ' + p.dir);
    if (!exists(p.dir)) { issue('目录不存在 ' + p.dir); continue; }
    for (const f of ['index.html', 'package.json', 'README.md', 'HANDOVER.md', 'CHANGELOG.md']) if (!exists(p.dir + '/' + f)) issue('缺少文件 ' + p.dir + '/' + f);
    for (const [k, f] of Object.entries({ readme: 'README.md', handover: 'HANDOVER.md', changelog: 'CHANGELOG.md' })) {
      if (p.docs?.[k] !== true || p.docPaths?.[k] !== f) issue('文档标记或路径漂移 ' + p.dir + ':' + k);
    }
    if (!lock.packages[p.dir]) issue('lockfile 缺少 workspace 包 ' + p.dir);
    else if (exists(p.dir + '/package.json')) {
      const manifest=data(p.dir+'/package.json'),locked=lock.packages[p.dir];
      for(const section of ['dependencies','devDependencies','optionalDependencies']) {
        const current=manifest[section]||{},saved=locked[section]||{};
        if(new Set([...Object.keys(current),...Object.keys(saved)]).size && [...new Set([...Object.keys(current),...Object.keys(saved)])].some(k=>current[k]!==saved[k])) issue('workspace 依赖与 lockfile 漂移 '+p.dir+':'+section);
      }
    }
    const link = Object.entries(lock.packages).find(([k,v]) => k.startsWith('node_modules/') && v.link && v.resolved === p.dir);
    if (!link) issue('lockfile 缺少 workspace 链接 ' + p.dir);
    const task = index.missions[p.mission];
    if (!task || task.category !== p.category || task.doc !== p.taskDoc || task.task_id !== p.task_id || task.version !== p.task_version) issue('任务映射漂移 ' + p.dir);
    if (exists(p.dir + '/index.html') && /(?:src|href)\s*=\s*["']\/[^/]/.test(text(p.dir + '/index.html'))) issue('入口使用根绝对路径 ' + p.dir);
    for (const f of fs.readdirSync(path.join(root,p.dir)).filter(f => /^vite\.config\./.test(f))) {
      const port = text(p.dir + '/' + f).match(/\bport\s*:\s*(\d+)/);
      if (port && +port[1] !== p.port) issue('子配置端口漂移 ' + p.dir);
    }
    if (exists(p.dir+'/package.json')) {
      const dev = data(p.dir+'/package.json').scripts?.dev || '';
      const port = dev.match(/--port\s+(\d+)/); if (port && +port[1]!==p.port) issue('dev 脚本端口漂移 '+p.dir);
    }
    if (exists(p.dir+'/README.md')) {
      const rm=text(p.dir+'/README.md');
      if (/npm run dev:(?:gpt-webgpu|tank3d|powdergame)\b/.test(rm)) issue('README 过时启动脚本 '+p.dir);
      if (!rm.includes('http://localhost:3000/'+p.dir+'/')) issue('README 缺少统一入口 '+p.dir);
      for(const match of rm.matchAll(/--port\s+(\d+)/g))if(+match[1]!==p.port)issue('README 调试端口漂移 '+p.dir);
    }
  }
  const covered = new Set(), sectionIds = new Set(), groupIds = new Set();
  for (const section of reg.portalSections || []) {
    if (section.id && sectionIds.has(section.id)) issue('门户主题 ID 重复 ' + section.id);
    sectionIds.add(section.id);
    if (section.groups && section.missions) issue('门户主题不能同时定义 groups 与 missions ' + section.id);
    if (section.groups && (!Array.isArray(section.groups) || !section.groups.length)) { issue('门户主题 groups 无效 ' + section.id); continue; }
    const groups = section.groups || [{ id: section.id, missions: section.missions || [section.id] }];
    for (const group of groups) {
      if (section.groups && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.id || '') || !section.label || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(group.id || '') || !group.label)) issue('门户主题或系列缺少有效 ID/标题 ' + section.id);
      if (group.id && groupIds.has(group.id)) issue('门户系列 ID 重复 ' + group.id);
      groupIds.add(group.id);
      if (!Array.isArray(group.missions) || !group.missions.length) { issue('门户系列 missions 无效 ' + group.id); continue; }
      for (const mission of group.missions) {
        if (!Object.hasOwn(reg.missions, mission)) issue('门户分组引用未定义 mission ' + mission);
        if (covered.has(mission)) issue('mission 重复分区 ' + mission);
        covered.add(mission);
      }
    }
  }
  for (const m of Object.keys(reg.missions)) if (!covered.has(m) || !index.missions[m]) issue('mission 未分区或缺少题面映射 ' + m);
  let draftCount=0;
  for (const [mission, t] of Object.entries(index.missions)) {
    if (!exists(t.doc) || !exists(t.unit)) { issue('题面或单元不存在 ' + mission); continue; }
    const u=data(t.unit);
    if (!validators['test-unit'](u)) issue('测试单元 schema 错误 '+t.unit+': '+JSON.stringify(validators['test-unit'].errors));
    if (u.task_id!==t.task_id || u.version!==t.version || u.mission!==mission || u.category!==t.category) issue('测试单元身份不一致 '+mission);
    if (Math.abs(u.rubric.reduce((s,r)=>s+r.weight,0)-1)>1e-9) issue('rubric 权重和不是1 '+mission);
    if (!exists(u.source_doc)||!exists(u.rubric_profile)) issue('单元来源或 rubric 不存在 '+mission);
    if(u.status==='draft') {draftCount++;if(!u.pending.length)issue('draft 未声明缺口 '+mission);}
    if(u.status==='frozen' && /待恢复|在此粘贴|见本文件/.test(u.input.prompt)) issue('frozen 输入不是逐字 prompt '+mission);
    if(u.status==='frozen' && !exists(u.fixed_params.evaluation_protocol)) issue('冻结评判脚本不存在 '+mission);
    // Embedded JSON examples also have to use compatible field types.
    for(const match of text(t.doc).matchAll(/```json\s*([\s\S]*?)```/g)) {
      try { const example=JSON.parse(match[1]);if(example.task_id && !Array.isArray(example.rubric)) issue('题面示例 rubric 类型错误 '+t.doc); } catch {issue('题面 JSON 不合法 '+t.doc);}
    }
    for(const row of text(t.doc).split('\n')) {
      const match=row.match(/^\|\s*(\d{4})\s*\|\s*`?([a-z0-9.-]+)`?\s*\|/);
      if(match) {const p=reg.projects.find(p=>p.dir===match[2]);if(!p||p.port!==+match[1])issue('题面项目表端口漂移 '+t.doc);}
    }
  }
  if(draftCount)warnings.push(`${draftCount} 个任务为 draft，正式评测仍待输入与参数冻结`);
  const categories=data('shared/schema/test-unit.schema.json').properties.category.enum;
  if(Object.keys(reg.capabilityCategories).some(c=>!categories.includes(c)))issue('schema 类别枚举与 registry 不一致');
  const requiredDirs=['shared/assets','shared/fixtures','benchmark/runs','benchmark/tasks/public'];
  for(const d of requiredDirs)if(!exists(d))issue('缺少公共目录 '+d);
  const ignore=text('.gitignore');for(const rule of ['benchmark/tasks/private/','shared/fixtures/**/private/'])if(!ignore.includes(rule))issue('缺少私有题忽略规则 '+rule);
  if(!text('index.html').includes('benchmark/registry.json'))issue('门户未读取 registry');
  if(!text('vite.config.mjs').includes('aliases'))issue('根配置缺少别名路由');
  for(const dep of ['vite','@vitejs/plugin-react','vite-tsconfig-paths','concurrently','ajv'])if(!pkg.devDependencies?.[dep])issue('根工具依赖未声明 '+dep);
  const allFiles=walk(root), hashes=new Map();
  for(const f of allFiles.filter(f=>/\.(png|jpe?g|webp|hdr|glb|gltf|mp3|wav|blend|fbx|ttf|woff2?)$/i.test(f))) {
    const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
    const previous=hashes.get(hash);if(previous && previous.split('/')[0]!==f.split('/')[0])issue('跨项目重复二进制 '+previous+' / '+f);else hashes.set(hash,f);
  }
  for(const asset of data('shared/assets/manifest.json').assets) {
    if(!exists(asset.path))issue('共享资源不存在 '+asset.path);
    else if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,asset.path))).digest('hex')!==asset.sha256)issue('共享资源内容变化 '+asset.path);
  }
  return {problems,warnings,projectCount:dirs.length,draftCount};
}
