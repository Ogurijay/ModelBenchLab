import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const imported=await import(process.env.BENCH_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),label=process.env.BENCH_QA_LABEL||'source';
const browser=await imported.chromium.launch({channel:process.env.BENCH_BROWSER_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const snapshot=()=>page.evaluate(()=>window.mini4wd.snapshot());
const check=(name,pass)=>{assert.ok(pass,name);checks.push(name);console.log('PASS '+name);};
let completedRace;
const click=action=>page.locator('[data-action="'+action+'"]').first().click();
const capture=async name=>page.screenshot({path:path.join(root,'tmp/screenshots','redo-'+label+'-'+name+'.png')});
await fs.mkdir(path.join(root,'tmp/screenshots'),{recursive:true});
try{
 await page.goto(process.env.BENCH_URL||'http://localhost:3000/gpt6-mini4wd-room-racing/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.mini4wd);let s=await snapshot();check('eight distinct stock cars load in an eight lane grid',s.racers.length===8&&new Set(s.racers.map(r=>r.lane)).size===8);
 check('long physical course and full eight-lane race distance',s.trackLength>64&&s.totalDistance>500&&s.laps===8);
 check('desktop has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await capture('lobby');
 await click('page-garage');await page.waitForTimeout(450);
 for(const id of ['cyclone','hurricane','triangle','evolution','cobra','spider','giant','devil']){
  await page.locator('[data-car="'+id+'"]').click();await page.waitForTimeout(160);await click('inspect-front');await page.waitForTimeout(180);await capture('car-'+id);
  for(const angle of ['top','side']){await click('inspect-'+angle);await page.waitForTimeout(180);await page.screenshot({path:path.join(root,'tmp/screenshots','redo-'+label+'-car-'+id+'-'+angle+'.png'),clip:{x:240,y:230,width:780,height:470}});}await click('inspect-front');
  check(id+' has a rendered individual model',(await snapshot()).selected===id&&(await snapshot()).render.triangles>4000);
 }
 // Render independent top and side views directly from the same real model factory.
 const shapes=(await snapshot()).models;
 check('nine real subassemblies and four wheels per car',shapes.every(s=>s.parts.length===9&&s.wheels===4));
 check('rendered hardware stays inside car inspection dimensions',shapes.every(s=>s.dimensions[0]<105&&s.dimensions[1]<70&&s.dimensions[2]<165));
 await page.locator('[data-car="cyclone"]').click();await click('explode');await page.waitForTimeout(650);await capture('exploded');
 check('all nine expanded labels are visible',await page.locator('.part-label:visible').count()===9);
 check('expanded labels fit fully within the scene',await page.evaluate(()=>{const stage=document.querySelector('#stage').getBoundingClientRect();return [...document.querySelectorAll('.part-label')].every(e=>{const r=e.getBoundingClientRect();return r.left>=stage.left&&r.right<=stage.right&&r.top>=stage.top&&r.bottom<=stage.bottom;});}));
 check('nine component connector lines actually render',await page.locator('#part-connectors').isVisible()&&await page.locator('#part-connectors line').count()===9);
 await page.locator('.part-label[data-slot="gears"]').click();check('exploded label selects correct subassembly',await page.locator('.part-tabs [data-slot="gears"]').evaluate(e=>e.classList.contains('active')));
 const choices={shell:1,chassis:1,motor:1,gears:2,tires:1,rollers:2,brake:2,dampers:2,battery:1};
 for(const [slot,index] of Object.entries(choices)){await page.locator('.part-tabs [data-slot="'+slot+'"]').click();await page.locator('[data-install="'+index+'"]').click();check(slot+' replacement persists into race build',(await snapshot()).build[slot]===index);}
 await page.reload({waitUntil:'networkidle'});s=await snapshot();check('all nine modifications survive a real reload',Object.entries(choices).every(([k,v])=>(s.build[k]===v)));
 // Above expression is checked explicitly to avoid relying on closures for storage validation.
 s=await snapshot();for(const [k,v] of Object.entries(choices))assert.equal(s.build[k],v);
 await click('tracks');await page.locator('[data-track="cross"]').click();await page.locator('[data-venue="night"]').click();await click('close');s=await snapshot();check('night venue and elevated crossover switch in the live renderer',s.venue==='night'&&s.track==='cross'&&s.trackLength>69);await capture('night-cross');
 await click('tracks');await page.locator('[data-track="classic"]').click();await page.locator('[data-venue="club"]').click();await click('close');
 await page.selectOption('#lane-select','3');await page.selectOption('#count-select','1');
 await click('page-garage');await click('reset-build');await click('page-race');await page.locator('[data-mode="manual"]').click();await click('start');
 await page.waitForFunction(()=>window.mini4wd.snapshot().state==='running');await page.waitForTimeout(300);check('manual car waits for power input',(await snapshot()).racers[0].speed<.05);
 await page.keyboard.down('w');await page.waitForTimeout(1200);check('manual power moves the car',(await snapshot()).racers[0].speed>2);await page.keyboard.up('w');await page.keyboard.down('s');await page.waitForTimeout(900);await page.keyboard.up('s');check('manual braking stops the car',(await snapshot()).racers[0].speed<.15);
 await click('pause');const paused=(await snapshot()).time;await page.waitForTimeout(350);check('pause freezes the runtime clock',(await snapshot()).time===paused);
 await click('page-garage');await page.locator('.part-tabs [data-slot="motor"]').click();await page.locator('[data-install="1"]').click();check('mid-race part changes are refused',(await snapshot()).build.motor===0);await click('page-race');await click('reset');
 await page.locator('[data-mode="auto"]').click();await click('page-garage');await page.locator('.part-tabs [data-slot="motor"]').click();await page.locator('[data-install="1"]').click();await click('page-race');await click('start');
 await page.waitForFunction(()=>window.mini4wd.snapshot().racers[0].status==='dnf',{},{timeout:45000});s=await snapshot();check('overspeed landing really retires the vehicle',s.racers[0].finish===null&&s.racers[0].reason.includes('跳台'));await capture('dnf');await click('result-garage');
 for(const [slot,index] of Object.entries({brake:2,tires:1,rollers:2,dampers:2})){await page.locator('.part-tabs [data-slot="'+slot+'"]').click();await page.locator('[data-install="'+index+'"]').click();}
 await click('page-race');await click('start');await page.waitForFunction(()=>window.mini4wd.snapshot().state==='running');await page.waitForTimeout(1200);await capture('follow-race');
 await page.waitForFunction(()=>window.mini4wd.snapshot().state==='finished',{},{timeout:150000});s=await snapshot();check('corrected setup actually finishes all three lanes in the browser',s.racers[0].status==='finished'&&s.racers[0].progress===3&&s.racers[0].finish<40);completedRace=s;await capture('results');
 await click('result-garage');await click('extension');await page.fill('[name="name"]','流星测试车');await page.selectOption('[name="shape"]','devil');await page.locator('#custom-form button[type="submit"]').click();s=await snapshot();check('custom livery car joins garage with nine working parts',s.carCount===9&&s.selected.startsWith('custom-')&&Object.keys(s.build).length===9);
 await click('page-race');await page.selectOption('#lane-select','5');await page.selectOption('#count-select','5');check('five lane grid has five separate starters',(await snapshot()).racers.length===5);
 await page.setViewportSize({width:1280,height:900});check('1280 desktop remains usable without horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture('desktop-1280');
 check('no browser page or console errors',errors.length===0);
 const evidence={date:new Date().toISOString(),url:process.env.BENCH_URL||'http://localhost:3000/gpt6-mini4wd-room-racing/',label,checks,errors,models:shapes,completedRace,final:await snapshot()};
 await fs.writeFile(path.join(root,'tmp','redo-'+label+'-validation.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({checks:checks.length,errors,finish:completedRace.racers[0].finish}));
}finally{await page.close();await browser.close();}
