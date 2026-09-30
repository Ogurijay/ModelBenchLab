import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemas, validateStructure } from '../policy-validation.mjs';
import { validateRuns } from '../benchmark-check.mjs';

const repository=fileURLToPath(new URL('../..',import.meta.url));
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'modelbench-policy-'));
  t.after(()=>{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));assert(path.basename(root).startsWith('modelbench-policy-'));fs.rmSync(root,{recursive:true,force:true});});
  const write=(p,v)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),typeof v==='string'?v:JSON.stringify(v));};
  const project={dir:'test-ocean-normal',port:3001,model:'Test',category:'code-to-3d',mission:'ocean',task_id:'test-001',task_version:1,taskDoc:'benchmark/tasks/code-to-3d/ocean.md',docs:{readme:true,handover:true,changelog:true},docPaths:{readme:'README.md',handover:'HANDOVER.md',changelog:'CHANGELOG.md'}};
  const unit={task_id:'test-001',version:1,status:'frozen',mission:'ocean',category:'code-to-3d',axes:['adherence'],difficulty:'L1',input:{prompt:'实现动态海面。',assets:[]},fixed_params:{runtime_versions:{three:'0.185.1'},browser_version:'142.0.0.0',gpu:'fixture GPU',evaluation_protocol:'benchmark/tasks/protocol.txt',seeds:[1,2,3]},samples:3,rubric:[{key:'A',weight:1}],pending:[],source_doc:project.taskDoc,rubric_profile:'shared/rubrics/code-to-3d.md'};
  const reg={projects:[project],missions:{ocean:'海洋'},capabilityCategories:{'code-to-3d':{status:'active'}},ports:{portal:3000},portalSections:[{missions:['ocean']}],retiredPorts:[]};
  const pkg={workspaces:[project.dir],devDependencies:Object.fromEntries(['vite','@vitejs/plugin-react','vite-tsconfig-paths','concurrently','ajv'].map(k=>[k,'1.0.0']))};
  write('benchmark/registry.json',reg);write('package.json',pkg);write('package-lock.json',{packages:{'':{workspaces:pkg.workspaces},[project.dir]:{version:'1.0.0'},['node_modules/'+project.dir]:{link:true,resolved:project.dir}}});
  write('benchmark/tasks/index.json',{missions:{ocean:{category:project.category,task_id:unit.task_id,version:1,doc:project.taskDoc,unit:'benchmark/tasks/public/test-001.v1.json'}}});
  write('benchmark/tasks/public/test-001.v1.json',unit);write(project.taskDoc,'# 海洋');write('benchmark/tasks/protocol.txt','observe');write('shared/rubrics/code-to-3d.md','# rubric');write('shared/assets/manifest.json',{assets:[]});write('shared/fixtures/.gitkeep','');write('benchmark/runs/.gitkeep','');
  write('.gitignore','benchmark/tasks/private/\nshared/fixtures/**/private/');write('index.html','benchmark/registry.json');write('RULES.md','# rules');write('vite.config.mjs','// aliases');
  for(const f of ['HANDOVER.md','CHANGELOG.md'])write(project.dir+'/'+f,'# docs');write(project.dir+'/README.md','http://localhost:3000/'+project.dir+'/');write(project.dir+'/index.html','<script src="./main.js"></script>');write(project.dir+'/package.json',{});
  for(const k of ['test-unit','run-record'])write('shared/schema/'+k+'.schema.json',fs.readFileSync(path.join(repository,'shared/schema/'+k+'.schema.json'),'utf8'));
  return {root,write,unit,reg,project};
}
test('complete structural fixture passes; orphan directory and missing handover are detected',t=>{
  const f=fixture(t);assert.deepEqual(validateStructure(f.root).problems,[]);
  f.write('orphan-task-demo/index.html','');fs.unlinkSync(path.join(f.root,f.project.dir,'HANDOVER.md'));
  const errors=validateStructure(f.root).problems;assert(errors.some(e=>e.includes('未知根条目')));assert(errors.some(e=>e.includes('HANDOVER.md')));
});
test('port drift, alias collisions and absent lock package fail the audit',t=>{
  const f=fixture(t);f.reg.projects[0].aliases=[f.project.dir];f.write('benchmark/registry.json',f.reg);f.write(f.project.dir+'/vite.config.js','export default {server:{port:3002}}');f.write('package-lock.json',{packages:{'':{workspaces:[f.project.dir]}}});
  const errors=validateStructure(f.root).problems;assert(errors.some(e=>e.includes('别名冲突')));assert(errors.some(e=>e.includes('端口漂移')));assert(errors.some(e=>e.includes('workspace 包')));
});
test('UI/video categories accepted; samples<3 and history string rubric rejected',()=>{
  const validate=schemas(repository)['test-unit'];const original=JSON.parse(fs.readFileSync(path.join(repository,'benchmark/tasks/public/code3d-history-001.v1.json')));
  for(const category of ['code-to-ui','text-to-video']){const u={...original,category};assert.equal(validate(u),true);}
  assert.equal(validate({...original,samples:1}),false);assert.equal(validate({...original,rubric:'shared/rubrics/code-to-3d.md'}),false);
});
test('frozen tasks require concrete environment and cannot retain pending items',t=>{
  const f=fixture(t),validate=schemas(f.root)['test-unit'];assert(validate(f.unit));assert(!validate({...f.unit,fixed_params:{browser_version:'latest'}}));assert(!validate({...f.unit,pending:['missing prompt']}));
});
test('formal records need independent complete A samples; aggregation and drift are checked',t=>{
  const f=fixture(t);assert(validateRuns(f.root,true).problems.some(e=>e.includes('样本不足')));
  for(let i=1;i<=3;i++){f.write(`benchmark/runs/test/output-${i}.txt`,'output');f.write(`benchmark/runs/test/record-${i}.json`,{run_id:'r'+i,date:'2026-10-01',model:'Test',model_version:'1',project_dir:f.project.dir,task_id:'test-001',task_version:1,mode:'A-fixed',sample_idx:i,params_snapshot:{...f.unit.fixed_params,seed:i,rubric_version:1},output_ref:`benchmark/runs/test/output-${i}.txt`,rater:'human:test',rubric_profile:f.unit.rubric_profile,scores:{A:i}});}
  const complete=validateRuns(f.root,true);assert.deepEqual(complete.problems,[]);assert.equal(complete.summary[0].scores.A.mean,2);assert.equal(complete.summary[0].scores.A.variance,2/3);
  const p=path.join(f.root,'benchmark/runs/test/record-3.json'),r=JSON.parse(fs.readFileSync(p));r.params_snapshot.browser_version='141.0.0.0';f.write('benchmark/runs/test/record-3.json',r);assert(validateRuns(f.root,true).problems.some(e=>e.includes('A 参数漂移')));
});
test('run schema rejects missing evidence and out-of-range subjective scores',t=>{
  const f=fixture(t),validate=schemas(f.root)['run-record'];assert(!validate({run_id:'x',date:'2026-10-01',model:'Test',task_id:'test-001',mode:'A-fixed',scores:{A:6}}));
});
