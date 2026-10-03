import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {browserOptions,isolateLiveReload,graphicsInfo} from './browser-options.mjs';
import {artifactsAt} from './qa-artifacts.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.BENCH_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/map',process.env.BENCH_QA_LABEL||'source'),artifacts=artifactsAt(out);
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const record=(label,details={})=>{checks.push({label,...details});console.log(label,JSON.stringify(details));};
async function inspect(options){
  await page.evaluate(options=>window.__bench.inspectCourse(options),options);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  return page.evaluate(()=>window.__bench.getState());
}
try{
  await isolateLiveReload(page);
  const url=process.env.BENCH_URL||'http://localhost:3000/gpt6.1sol-initiald-story-racing/?bench=1';
  await page.goto(url);await page.waitForFunction(()=>!!window.__bench?.inspectCourse);
  for(const id of ['downhill','uphill','rain','highway']){
    const snapshot=await inspect({track:id,overview:true,weather:id==='rain'?'rain':'day'});
    assert.equal(snapshot.track.layoutVersion,2);await artifacts.screenshot(page,id+'-overview.png');
    const probes=await page.evaluate(()=>{
      const b=window.__bench,t=b.getState().track,probes=[];
      for(let s=.01;s<t.surfaceLength;s+=9.7)for(const offset of [-6.7,0,6.7])probes.push(b.inspectSurface(s,offset));
      for(const s of [t.length-1,t.length,t.length+1,t.length+80,t.surfaceLength-.01])probes.push(b.inspectSurface(s));return probes;
    });
    for(const p of probes){assert.notEqual(p.roadY,null,`${id}: missing road at ${p.s}`);assert.notEqual(p.terrainY,null);assert.ok(Math.abs(p.roadY-p.expectedY)<.03);assert.ok(p.normalY>.98);assert.ok(p.roadY-p.terrainY>.25);assert.ok(Math.abs(p.groundY-p.terrainY)<.0001);}
    record('Rendered road and terrain agree through every '+id+' sector',{probes:probes.length,maxHeightError:Math.max(...probes.map(p=>Math.abs(p.roadY-p.expectedY))),minRoadClearance:Math.min(...probes.map(p=>p.roadY-p.terrainY)),scenery:snapshot.visual.course});
  }
  let minimumCameraClearance=Infinity,maximumDrawCalls=0;
  const track=(await inspect({track:'downhill'})).track;
  const viewpoints=[{s:0,label:'start'},{s:320,label:'hairpin-1'},{s:635,label:'hairpin-2'},
    {s:955,label:'hairpin-3'},{s:1265,label:'hairpin-4'},{s:1560,label:'hairpin-5'},{s:track.straightStart-48,label:'last-hairpin'},
    {s:track.length-12,label:'finish'},{s:track.length+80,label:'runoff'}];
  for(const view of viewpoints){
    const snap=await inspect({track:'downhill',s:view.s,weather:'dawn'});
    assert.ok(snap.visual.course.cameraClearance>=.7499);minimumCameraClearance=Math.min(minimumCameraClearance,snap.visual.course.cameraClearance);maximumDrawCalls=Math.max(maximumDrawCalls,snap.visual.drawCalls);
    await artifacts.screenshot(page,view.label+'.png');
  }
  await inspect({track:'uphill',s:955,weather:'dusk'});await artifacts.screenshot(page,'uphill-hairpin.png');
  await inspect({track:'rain',s:635,weather:'rain'});await artifacts.screenshot(page,'rain-hairpin.png');
  record('Nine chase views include switchbacks, finish and safe runoff',{minimumCameraClearance,maximumDrawCalls});
  await page.setViewportSize({width:390,height:844});await inspect({track:'rain',s:1265,weather:'rain'});await artifacts.screenshot(page,'mobile-hairpin.png');
  assert.ok((await page.locator('#map').boundingBox()).width<=160);record('Mobile map and hairpin view render');
  const storage=await page.evaluate(()=>{
    const key='modelbenchlab:initiald:gpt6.1sol:v1',save={version:1,next:7,completed:[6],unlocked:['ae86','ae85','wuling','gtr'],best:{'ae86:downhill:time':{time:1,water:100,score:5}},gutter:true};localStorage.setItem(key,JSON.stringify(save));return key;
  });
  await page.reload();await page.waitForFunction(()=>!!window.__bench?.inspectCourse);
  await page.evaluate(()=>window.__bench.startRace({car:'ae86',track:'downhill',mode:'time',weather:'day',free:true,assist:true}));
  const result=await page.evaluate(()=>{let s;for(let n=0;n<90;n++){s=window.__bench.advance(3);if(s.screen==='result')break;}return s;});
  assert.equal(result.race.outcome,'win');assert.equal(result.save.next,7);assert.equal(result.save.best['ae86:downhill:time'].time,1);assert.ok(result.save.best['ae86:downhill:v2:time'].time>1);
  assert.ok(await page.evaluate(key=>localStorage.getItem(key).includes('downhill:v2'),storage));record('Old progress and lap record survive; new layout records use a separate key');
  const normal=new URL(url);normal.search='';await page.goto(normal.href);await page.waitForFunction(()=>!!window.__bench);
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.__bench)),['getState']);record('Inspection controls are absent from the normal game');
  assert.deepEqual(errors,[]);record('No browser or shader errors');
  artifacts.json('map-smoke.json',{date:new Date().toISOString(),browser:browser.version(),graphics:await graphicsInfo(page),note:'Actual rendered mesh raycasts and chase screenshots; internal QA, not a human gameplay score.',checks,errors});
}finally{await browser.close();artifacts.flush();}
