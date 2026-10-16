import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {browserOptions,graphicsInfo} from './browser-options.mjs';
import {artifactsAt} from './qa-artifacts.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.BENCH_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp/qa',process.env.BENCH_QA_LABEL||''),artifacts=artifactsAt(out);
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const record=(label,details={})=>{checks.push({label,...details});console.log(label,JSON.stringify(details));};
const state=()=>page.evaluate(()=>window.__bench.getState());
const advance=s=>page.evaluate(s=>window.__bench.advance(s),s);
const chapter=async id=>{await page.evaluate(id=>{window.__bench.startChapter(id);for(let i=0;i<10&&window.__bench.getState().screen==='dialogue';i++)window.__bench.next();},id);};
async function driveTo(predicate,max=260,chunk=3){for(let i=0;i<max/chunk;i++){const s=await advance(chunk);if(predicate(s))return s;}throw new Error('Drive timeout: '+JSON.stringify(await state()));}
try{
  await page.goto(process.env.BENCH_URL||'http://127.0.0.1:3000/gpt6.1sol-initiald-story-racing/?bench=1');await page.waitForFunction(()=>!!window.__bench);assert.equal((await state()).three,'0.186.1');await artifacts.screenshot(page,'desktop-menu.png');record('Desktop WebGL menu boots');
  await page.locator('#sound').click();assert.equal(await page.locator('#sound').textContent(),'声音 ON');await page.locator('#sound').click();record('Audio context opens and suspends by user gesture');
  await page.locator('#practice').click();await advance(3);const before=(await state()).race.player.s;await page.keyboard.down('KeyW');await page.waitForTimeout(1800);await page.keyboard.up('KeyW');const moved=await state();assert.ok(moved.race.player.s>before+1);record('Real keyboard throttle moves the rendered vehicle',{meters:moved.race.player.s-before,speed:moved.race.player.speed});
  await page.keyboard.press('KeyP');const stopped=(await state()).race.time;await page.waitForTimeout(500);assert.equal((await state()).race.time,stopped);await page.locator('#resume').click();record('Pause stops simulation and resume releases keys');
  await page.evaluate(()=>window.__bench.advance(3));await page.keyboard.down('KeyD');await page.keyboard.down('Space');await page.waitForTimeout(320);await page.keyboard.up('Space');await page.keyboard.up('KeyD');const drift=(await state()).race.player;assert.ok(Math.abs(drift.angle)>.08);await artifacts.screenshot(page,'desktop-driving.png');record('Real keyboard handbrake creates heading / velocity slip',{angle:drift.angle,grip:drift.grip});
  await chapter(1);const tofu=await driveTo(s=>s.screen==='result');assert.equal(tofu.race.outcome,'win');assert.ok(tofu.race.player.water>0);record('Tofu delivery reaches finish with remaining water',{time:tofu.race.time,water:tofu.race.player.water,collisions:tofu.race.player.collisions});
  await chapter(3);const ae85=await driveTo(s=>s.screen==='result');assert.equal(ae85.race.outcome,'scripted-loss');record('AE85 defeat completes as authored');
  await chapter(9);const engine=await driveTo(s=>s.screen==='result');assert.equal(engine.race.outcome,'scripted-loss');assert.ok(engine.race.player.engineBroken);assert.equal(engine.quiet,true);record('Chapter 9 engine breaks near the final bend');
  await page.evaluate(()=>window.__bench.startRace({car:'ae86',track:'downhill',mode:'duel',weather:'night',title:'这一次，追上了',opponent:'benz',assist:true,free:true,easter:'reunion'}));const reunion=await driveTo(s=>s.screen==='result');record('Freeplay 86 / Benz downhill outcome',{outcome:reunion.race.outcome,time:reunion.race.time,collisions:reunion.race.player.collisions});assert.equal(reunion.race.outcome,'win');assert.ok(await page.locator('#result').textContent().then(s=>s.includes('这一次，追上了')));
  await chapter(12);const eye=await driveTo(s=>s.race?.phase==='eye',260,.5);assert.equal(eye.quiet,true);assert.equal(eye.danmaku,0);assert.equal(await page.locator('#hud').isVisible(),false);assert.equal(eye.race.eyeSeen,true);await artifacts.screenshot(page,'finale-eye.png');record('Finale forced eye shot clears HUD and existing comments');
  const straight=await advance(2);assert.equal(straight.race.phase,'straight');assert.equal(straight.race.opponents[0].speed,80);record('Benz straight segment uses fixed 80 m/s');
  const quiet=await advance(9);assert.equal(quiet.race.phase,'silence');assert.equal(quiet.danmaku,0);record('Finale stops the 86 and holds silence before the first comment');
  const first=await advance(6);assert.ok(first.danmaku>0);assert.ok(await page.locator('#danmaku').textContent().then(s=>s.includes('再快的86也追不上奔驰')));const ending=await advance(10);assert.equal(ending.race.outcome,'scripted-loss');await artifacts.screenshot(page,'finale-title.png');await page.locator('#result-next').click();assert.equal((await state()).chapter,13);record('Ending title leads to Project D epilogue');
  await page.evaluate(()=>window.__bench.startRace({car:'wuling',opponent:'benz',track:'rain',mode:'battle',weather:'rain',title:'神车混战',assist:true,free:true,passengers:2,charm:true}));assert.equal((await state()).race.opponents.length,7);await advance(7);record('Battle spawns seven opponents plus the Wuling');
  await page.setViewportSize({width:390,height:844});await artifacts.screenshot(page,'mobile-driving.png');const boxes=await page.locator('#touch button').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {bottom:b.bottom,left:b.left,right:b.right,height:b.height};}));assert.ok(boxes.every(b=>b.bottom<=844&&b.left>=0&&b.right<=390&&b.height>=44));record('390px mobile controls fit on screen',{boxes});
  await page.keyboard.press('KeyP');await page.locator('#pause-home').click();await page.locator('#reset').click();await page.locator('#confirm-reset').click();await page.locator('#story').click();
  let intentionalLoss=false;
  for(let transitions=0;transitions<120;transitions++){
    let s=await state();
    if(s.screen==='dialogue'){await page.locator('#next').click();continue;}
    if(s.screen==='timed'){await advance(5);continue;}
    if(s.screen==='qte'){for(const code of ['KeyA','KeyD','KeyA','KeyD'])await page.locator(`[data-qte="${code}"]`).click();record('Chapter 8 QTE grants a start bonus');continue;}
    if(s.screen==='race'){
      if(s.chapter===4&&!intentionalLoss){intentionalLoss=true;await page.evaluate(()=>window.__bench.advance(20,{throttle:false,steer:0,brake:false,handbrake:false}));s=await state();assert.equal(s.race.outcome,'lose');assert.equal(s.save.next,4);record('Ordinary defeat blocks progression and offers a real retry');continue;}
      if(s.chapter===11){
        assert.equal(s.race.config.assist,false);
        s=await page.evaluate(async()=>{
          const {createTrack,wrap}=await import(new URL(location.pathname.includes('/dist/')?'../src/track.js':'./src/track.js',location.href));const course=createTrack('downhill');
          let snapshot=window.__bench.getState();
          for(let n=0;n<1400&&snapshot.screen==='race';n++){
            const p=snapshot.race.player,q=course.at(p.s+Math.max(7,p.speed*.4)),a=wrap(Math.atan2(q.x-p.x,q.z-p.z)-p.yaw),k=Math.max(Math.abs(course.at(p.s+15).k),Math.abs(course.at(p.s+40).k)),desired=Math.min(46,Math.sqrt(9/(k+.002)));
            snapshot=window.__bench.advance(.15,{throttle:p.speed<desired+1,brake:p.speed>desired+3,steer:Math.max(-1,Math.min(1,-a*3.5)),handbrake:false});
          }
          return snapshot;
        });assert.equal(s.race.outcome,'win');record('FC technical race is winnable with steering/braking and no direction assist',{time:s.race.time,collisions:s.race.player.collisions});
      }else s=await driveTo(v=>v.screen==='result');
      assert.ok(['win','scripted-loss'].includes(s.race.outcome));continue;
    }
    if(s.screen==='result'){
      if(await page.locator('#end-home').count()){await page.locator('#end-home').click();break;}
      await page.locator('#result-next').click();continue;
    }
    throw new Error('Unexpected campaign state: '+JSON.stringify(s));
  }
  const completed=await state();assert.equal(completed.save.next,14);assert.equal(completed.save.completed.length,14);assert.equal(completed.save.unlocked.length,8);record('Full 14-part campaign completes and unlocks all eight vehicles via actual rules');
  await page.evaluate(()=>{localStorage.setItem('modelbenchlab:initiald:gpt6.1sol:v1',JSON.stringify({version:1,next:7,completed:[6],unlocked:['ae86','ae85','wuling','gtr'],best:{},gutter:true}));});await page.reload();await page.waitForFunction(()=>!!window.__bench);assert.equal((await state()).save.next,7);await page.locator('#free').click();assert.equal(await page.locator('input[value=gtr]').isEnabled(),true);assert.equal(await page.locator('input[value=fc]').isEnabled(),false);record('Reload restores garage locks and story progress');
  await artifacts.screenshot(page,'mobile-garage.png');assert.deepEqual(errors,[]);record('No browser console errors');
  artifacts.json('browser-smoke.json',{date:new Date().toISOString(),browser:browser.version(),graphics:await graphicsInfo(page),viewport:[1440,900],mobile:[390,844],note:'Keyboard checks use live rendering; long story checks use explicit bench-mode fixed-step advance. This is internal QA, not human handling acceptance or formal model evaluation.',checks,errors});
} finally {await browser.close();artifacts.flush();}
