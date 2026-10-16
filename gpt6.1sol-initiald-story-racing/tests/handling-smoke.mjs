import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {browserOptions,graphicsInfo} from './browser-options.mjs';
import {artifactsAt} from './qa-artifacts.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.BENCH_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp/qa/handling',process.env.BENCH_QA_LABEL||'source');
const artifacts=artifactsAt(out);
const browser=await chromium.launch(browserOptions);
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],checks=[];let graphics=null;
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const state=()=>page.evaluate(()=>window.__bench.getState());
const record=(label,details={})=>{checks.push({label,...details});console.log(label,JSON.stringify(details));};
async function start(assist=false){
  // Check steering at an actual corner-entry speed, not the final moments of
  // accelerating away from the countdown (which made small displacements flaky).
  await page.evaluate(assist=>{window.__bench.startRace({car:'ae86',track:'downhill',mode:'time',weather:'dawn',title:'转向与漂移检查',practice:true,assist});window.__bench.advance(5.5);},assist);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.ok((await state()).race.player.speed>20);
}
try{
  await page.goto(process.env.BENCH_URL||'http://localhost:3000/gpt6.1sol-initiald-story-racing/?bench=1');
  await page.waitForFunction(()=>!!window.__bench);assert.equal((await state()).three,'0.186.1');
  graphics=await graphicsInfo(page);
  for(const [key,sign] of [['KeyD',1],['KeyA',-1],['ArrowRight',1],['ArrowLeft',-1]]){
    await start();const initial=await state(),before=initial.race.player;
    await page.keyboard.down('KeyW');await page.keyboard.down(key);await page.waitForTimeout(260);
    const s=await state(),p=s.race.player,delta=-(p.x-before.x)*Math.cos(before.yaw)+(p.z-before.z)*Math.sin(before.yaw);
    assert.ok(delta*sign>.13,key+' displacement: '+JSON.stringify({delta,before,after:p,elapsed:s.race.time-initial.race.time,paused:s.paused}));assert.ok(s.visual.wheelSteering*sign<0,key+' wheel yaw');
    assert.ok(s.visual.noseScreenOffset*sign>0,key+' must face the intended screen side');
    await page.keyboard.up(key);await page.keyboard.up('KeyW');record(key+' steers to the visible '+(sign>0?'right':'left'),{delta,noseScreenOffset:s.visual.noseScreenOffset});
  }
  await start();await page.waitForFunction(()=>window.__bench.getState().visual.lights.intensity.head>1);
  const running=await state();assert.equal(running.visual.headlights,2);assert.ok(running.visual.lights.popups.every(p=>p.visible));
  await page.keyboard.down('KeyS');await page.waitForFunction(()=>window.__bench.getState().visual.lights.intensity.tail>1.5);
  const braking=await state();assert.equal(braking.race.player.brake,true);await artifacts.screenshot(page,'brake-lights.png');
  await page.keyboard.up('KeyS');await page.waitForFunction(()=>window.__bench.getState().visual.lights.intensity.tail<.3);
  record('Dawn headlamps open and the actual brake key brightens then releases the tail lamps',{headlights:running.visual.headlights,running:running.visual.lights.intensity.tail,braking:braking.visual.lights.intensity.tail});
  await start(true);await page.keyboard.down('KeyW');await page.keyboard.down('KeyD');await page.keyboard.down('Space');
  await page.waitForTimeout(650);const drifting=await state();
  assert.ok(Math.abs(drifting.race.player.angle)>.28);assert.ok(drifting.visual.drift.smoke>8);assert.ok(drifting.visual.drift.skidSegments>6);
  assert.ok(Math.abs(drifting.visual.bodyRoll)>.009);assert.ok(drifting.visual.drift.drawCalls<=2);
  await artifacts.screenshot(page,'drift-right.png');record('Actual handbrake animates body, smoke and two tire tracks',{angle:drifting.race.player.angle,visual:drifting.visual});
  await page.keyboard.up('Space');await page.keyboard.up('KeyD');await page.keyboard.down('KeyA');await page.waitForTimeout(160);
  assert.ok((await state()).race.player.steering<-.5);await artifacts.screenshot(page,'countersteer.png');await page.keyboard.up('KeyA');await page.keyboard.up('KeyW');
  record('Countersteering responds after handbrake release');
  await page.keyboard.press('KeyP');const paused=await state();await page.waitForTimeout(240);const still=await state();
  assert.equal(still.race.time,paused.race.time);assert.deepEqual(still.visual.drift,paused.visual.drift);await page.locator('#resume').click();record('Pause freezes simulation and drift effects');
  await page.waitForTimeout(2200);assert.equal((await state()).visual.drift.smoke,0);record('Tire smoke expires after grip returns');
  await page.setViewportSize({width:390,height:844});
  for(const [control,sign] of [['right',1],['left',-1]]){
    await start();const before=(await state()).race.player;const box=await page.locator('[data-control="'+control+'"]').boundingBox();
    await page.keyboard.down('KeyW');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(260);
    const s=await state(),p=s.race.player,delta=-(p.x-before.x)*Math.cos(before.yaw)+(p.z-before.z)*Math.sin(before.yaw);
    assert.ok(delta*sign>.13,control+' touch direction');await page.mouse.up();await page.keyboard.up('KeyW');record('Mobile '+control+' button follows its label',{delta});
  }
  await start(true);await page.keyboard.down('KeyW');await page.keyboard.down('KeyA');await page.keyboard.down('Space');await page.waitForTimeout(600);
  assert.ok((await state()).visual.drift.smoke>8);await artifacts.screenshot(page,'mobile-drift.png');
  await page.keyboard.up('Space');await page.keyboard.up('KeyA');await page.keyboard.up('KeyW');record('Mobile viewport renders drift smoke');
  await page.setViewportSize({width:1440,height:900});await start();await page.keyboard.down('KeyW');
  const frameTimes=await page.evaluate(()=>new Promise(resolve=>{let last=performance.now();const times=[];function frame(now){times.push(now-last);last=now;if(times.length<120)requestAnimationFrame(frame);else resolve(times);}requestAnimationFrame(frame);}));
  await page.keyboard.up('KeyW');const sorted=frameTimes.slice(1).sort((a,b)=>a-b);
  record('Observed animation frame intervals in this browser QA session',{frames:sorted.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]});
  assert.deepEqual(errors,[]);record('No browser or shader errors');
}finally{
  artifacts.json('handling-smoke.json',{date:new Date().toISOString(),browser:browser.version(),graphics,url:page.url(),checks,errors});await browser.close();artifacts.flush();
}
