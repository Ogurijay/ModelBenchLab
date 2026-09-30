import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, schemas, walk } from './policy-validation.mjs';

export function validateRuns(root, formal=false) {
  const reg=readJSON(path.join(root,'benchmark/registry.json')),index=readJSON(path.join(root,'benchmark/tasks/index.json'));
  const validate=schemas(root)['run-record'],problems=[],runs=[];
  const files=walk(root,'benchmark/runs').filter(f=>f.endsWith('.json'));
  const ids=new Set(),samples=new Set();
  for(const file of files) {
    let r;try {r=readJSON(path.join(root,file));}catch {problems.push('运行 JSON 不合法 '+file);continue;}
    if(!validate(r)){problems.push('运行 schema 错误 '+file+': '+JSON.stringify(validate.errors));continue;}
    if(ids.has(r.run_id))problems.push('重复 run_id '+r.run_id);ids.add(r.run_id);
    const unitFile=walk(root,'benchmark/tasks/public').find(f=>f.endsWith('.json') && (()=>{const u=readJSON(path.join(root,f));return u.task_id===r.task_id && u.version===r.task_version;})());
    if(!unitFile){problems.push('未知测试版本 '+r.run_id);continue;}
    const u=readJSON(path.join(root,unitFile));
    if(u.status!=='frozen')problems.push('正式记录引用 draft '+r.run_id);
    if(r.sample_idx>u.samples)problems.push('样本序号越界 '+r.run_id);
    const project=reg.projects.find(p=>p.dir===r.project_dir);
    if(!project || project.task_id!==r.task_id || project.model!==r.model)problems.push('运行项目身份不一致 '+r.run_id);
    const key=[r.project_dir,r.task_id,r.task_version,r.mode,r.sample_idx].join(':');if(samples.has(key))problems.push('重复采样序号 '+r.run_id);samples.add(key);
    if(r.rubric_profile!==u.rubric_profile||r.params_snapshot.rubric_version!==u.version)problems.push('rubric 版本漂移 '+r.run_id);
    if(!u.fixed_params.seeds?.includes(r.params_snapshot.seed))problems.push('seed 不在冻结集合 '+r.run_id);
    if(r.mode==='A-fixed')for(const k of ['runtime_versions','browser_version','gpu'])if(JSON.stringify(r.params_snapshot[k])!==JSON.stringify(u.fixed_params[k]))problems.push('A 参数漂移 '+r.run_id+':'+k);
    const output=path.resolve(root,r.output_ref);if(!output.startsWith(path.resolve(root,'benchmark/runs')+path.sep)||!fs.existsSync(output))problems.push('运行产物缺失或越界 '+r.run_id);
    for(const score of Object.values(r.scores))if(typeof score==='object') {if(['pass@k','accuracy','win-rate'].includes(score.metric)&&(score.value<0||score.value>1))problems.push('客观率超界 '+r.run_id);if(score.metric==='MAE'&&score.value<0)problems.push('MAE 为负 '+r.run_id);if(score.metric==='Spearman'&&Math.abs(score.value)>1)problems.push('相关系数超界 '+r.run_id);}
    runs.push(r);
  }
  const summary=[];
  if(formal)for(const p of reg.projects){const t=index.missions[p.mission],u=readJSON(path.join(root,t.unit));if(u.status!=='frozen')problems.push('未冻结 '+p.dir);const selected=runs.filter(r=>r.project_dir===p.dir&&r.task_id===p.task_id&&r.task_version===p.task_version&&r.mode==='A-fixed');if(new Set(selected.map(r=>r.sample_idx)).size<u.samples)problems.push('A 样本不足 '+p.dir);}
  for(const p of reg.projects)for(const mode of ['A-fixed','B-best']){const rs=runs.filter(r=>r.project_dir===p.dir&&r.mode===mode&&r.task_version===p.task_version);if(!rs.length)continue;const scores={};for(const key of new Set(rs.flatMap(r=>Object.keys(r.scores)))){const values=rs.map(r=>r.scores[key]).filter(v=>typeof v==='number');if(values.length){const mean=values.reduce((a,b)=>a+b,0)/values.length;scores[key]={n:values.length,mean,variance:values.reduce((a,b)=>a+(b-mean)**2,0)/values.length};}}summary.push({project:p.dir,mode,n:rs.length,scores});}
  return {problems,runCount:runs.length,summary};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const root=fileURLToPath(new URL('..',import.meta.url));
  try {const result=validateRuns(root,process.argv.includes('--formal'));if(result.problems.length){console.error(result.problems.join('\n'));process.exitCode=1;}else{console.log(`✓ 运行记录校验通过：${result.runCount} 条。${result.runCount?'':'尚无正式评测记录。'}`);if(result.summary.length)console.log(JSON.stringify(result.summary,null,2));}}catch(e){console.error(e.message);process.exitCode=1;}
}
